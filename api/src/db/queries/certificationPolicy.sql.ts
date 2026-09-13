import { INSTALLATION_CERTIFICATE_SCOPES } from "../../services/certificationPolicy.js";

// All list, map, monitor and detail queries use this same typed requirement/evidence grain.
const scopeRows = Object.entries(INSTALLATION_CERTIFICATE_SCOPES)
  .flatMap(([type, scopes]) => scopes.map((scope) => `(N'${type}',N'${scope}')`)).join(",");
export const certificationPolicyCtes = `
certification_clock as (
  select convert(date,sysutcdatetime() at time zone 'UTC' at time zone 'W. Europe Standard Time') as today
),
certification_contract_rows as (
  select s.installation_code,s.service_category,
    case
      when (s.contract_key is not null and coalesce(upper(trim(s.contract_historical)),N'') not in(N'N',N'J'))
        or coalesce(upper(trim(s.paragraph_blocked)),N'') not in(N'N',N'J') then 3
      when upper(trim(s.contract_historical))=N'J' then 1
      when coalesce(s.end_date_rule,N'')<>N'IGNORE' and (
        (s.contract_end_date<c.today and not(coalesce(s.end_date_rule,N'')=N'OPEN_30_DEC' and month(s.contract_end_date)=12 and day(s.contract_end_date)=30))
        or (s.paragraph_end_date<c.today and not(coalesce(s.end_date_rule,N'')=N'OPEN_30_DEC' and month(s.paragraph_end_date)=12 and day(s.paragraph_end_date)=30))
      ) then 1
      when s.contract_start_date>c.today or s.paragraph_start_date>c.today then 2
      when upper(trim(s.paragraph_blocked))=N'J' or coalesce(trim(s.document_status_code),N'')<>N'G' then 3
      else 4
    end as contract_rank
  from classified_service s cross join certification_clock c
  where s.service_category in(N'MAINTENANCE',N'INSPECTION_SERVICE')
),
certification_contracts as (
  select installation_code,service_category,
    case max(contract_rank) when 4 then N'ACTIVE' when 3 then N'UNKNOWN' when 2 then N'FUTURE' else N'ENDED' end as contract_status
  from certification_contract_rows group by installation_code,service_category
),
certificate_requirements as (
  select i.atrium_installation_code,allowed.scope,types.certificate_type,
    coalesce(contract.contract_status,N'NONE') as contract_status,
    case when contract.contract_status=N'ACTIVE' then N'REQUIRED'
      when manual.is_required=1 then N'REQUIRED'
      when contract.contract_status=N'ENDED' then N'CONTRACT_ENDED'
      when contract.contract_status=N'UNKNOWN' then N'UNKNOWN'
      else N'NOT_REQUIRED' end as requirement_status,
    case when contract.contract_status=N'ACTIVE' then N'CONTRACT' when manual.is_required=1 then N'MANUAL' else null end as source_type
  from dbo.Installation i
  join (values ${scopeRows}) allowed(installation_type_key,scope) on allowed.installation_type_key=i.installation_type_key
  cross join (values(N'MAINTENANCE',N'MAINTENANCE'),(N'INSPECTION',N'INSPECTION_SERVICE')) types(certificate_type,service_category)
  cross join certification_clock clock
  left join certification_contracts contract on contract.installation_code=i.atrium_installation_code and contract.service_category=types.service_category
  outer apply(select cast(case when types.certificate_type=N'INSPECTION' and exists(
    select 1 from dbo.InstallationCertificationRequirement r where r.atrium_installation_code=i.atrium_installation_code
      and r.scope=allowed.scope and r.requirement_status=N'REQUIRED' and (r.effective_from is null or r.effective_from<=clock.today)
  ) then 1 else 0 end as bit) as is_required) manual
),
certificate_scope_status as (
  select r.*,case when r.requirement_status<>N'REQUIRED' then r.requirement_status
    when evidence.evidence_rank is null then N'MISSING'
    when evidence.evidence_rank=4 then N'VALID'
    when evidence.evidence_rank=3 then N'EXPIRING'
    when evidence.evidence_rank=2 then N'UNKNOWN' else N'EXPIRED' end as certificate_status,
    evidence.valid_until,evidence.installation_certificate_id
  from certificate_requirements r cross join certification_clock clock
  outer apply (
    select top(1) evaluated.evidence_rank,cert.valid_until,cert.installation_certificate_id
    from dbo.InstallationCertificate cert
    join dbo.InstallationCertificateScope scope on scope.installation_certificate_id=cert.installation_certificate_id and scope.scope=r.scope
    left join dbo.StoredFile filedata on filedata.stored_file_id=cert.stored_file_id and filedata.is_deleted=0
    cross apply(select case
      when cert.verification_status<>N'VERIFIED' or filedata.stored_file_id is null
        or cert.issue_date is null or cert.valid_until is null or cert.issue_date>clock.today or cert.valid_until<cert.issue_date then 2
      when cert.valid_until<clock.today then 1
      when cert.valid_until<=dateadd(day,@certificateExpiringDays,clock.today) then 3 else 4 end as evidence_rank) evaluated
    where cert.atrium_installation_code=r.atrium_installation_code and cert.certificate_type=r.certificate_type and cert.record_status=N'CURRENT'
    order by evaluated.evidence_rank desc,cert.valid_until desc,cert.installation_certificate_id
  ) evidence
),
certificate_summary as (
  select atrium_installation_code,
    sum(case when requirement_status=N'REQUIRED' then 1 else 0 end) as required_certificate_scope_count,
    max(case certificate_status when N'MISSING' then 6 when N'EXPIRED' then 5 when N'UNKNOWN' then 4 when N'EXPIRING' then 3 when N'VALID' then 2 else 0 end) as certificate_rank,
    max(case when requirement_status=N'CONTRACT_ENDED' then 1 else 0 end) as has_ended_requirement,
    min(case when requirement_status=N'REQUIRED' then valid_until end) as nearest_certificate_valid_until
  from certificate_scope_status group by atrium_installation_code
)
`;
