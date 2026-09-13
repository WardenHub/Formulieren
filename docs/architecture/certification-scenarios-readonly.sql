WITH test_clock AS (SELECT CONVERT(date,SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'W. Europe Standard Time') today),
fixture_installation AS (
  SELECT * FROM (VALUES (N'NONE',N'BMI'),(N'MAINT',N'BMI'),(N'WRONG_TYPE',N'BMI'),(N'COMBI',N'BMI_OAI'),(N'ENDED',N'BMI'),(N'EXPIRED',N'BMI'),(N'UNVERIFIED',N'BMI'),(N'HISTORICAL',N'BMI'),(N'SEPARATE',N'BMI_OAI')) i(atrium_installation_code,installation_type_key)
),
classified_service AS (
  SELECT i.atrium_installation_code installation_code,N'MAINTENANCE' service_category,N'key' contract_key,N'N' contract_historical,
    CAST(NULL AS date) contract_start_date,CASE WHEN i.atrium_installation_code=N'ENDED' THEN DATEADD(day,-1,c.today) ELSE CAST(NULL AS date) END contract_end_date,
    CAST(NULL AS date) paragraph_start_date,CAST(NULL AS date) paragraph_end_date,N'N' paragraph_blocked,N'G' document_status_code,N'STANDARD' end_date_rule
  FROM fixture_installation i CROSS JOIN test_clock c WHERE i.atrium_installation_code IN(N'MAINT',N'ENDED')
),
fixture_requirement AS (
  SELECT i.atrium_installation_code,s.scope,N'REQUIRED' requirement_status,CAST(NULL AS date) effective_from
  FROM fixture_installation i CROSS JOIN (VALUES(N'BMI'),(N'OAI_B')) s(scope)
  WHERE i.atrium_installation_code NOT IN(N'NONE',N'MAINT',N'ENDED') AND (s.scope=N'BMI' OR i.installation_type_key=N'BMI_OAI')
),
fixture_certificate AS (
  SELECT v.id installation_certificate_id,v.code atrium_installation_code,v.certificate_type,
    CASE WHEN v.code=N'HISTORICAL' THEN N'HISTORICAL' ELSE N'CURRENT' END record_status,
    CASE WHEN v.code=N'UNVERIFIED' THEN N'UNVERIFIED' ELSE N'VERIFIED' END verification_status,
    v.id stored_file_id,DATEADD(day,-100,c.today) issue_date,
    CASE WHEN v.code=N'EXPIRED' THEN DATEADD(day,-1,c.today) ELSE DATEADD(day,365,c.today) END valid_until
  FROM (VALUES(1,N'WRONG_TYPE',N'MAINTENANCE'),(2,N'COMBI',N'INSPECTION'),(3,N'EXPIRED',N'INSPECTION'),(4,N'UNVERIFIED',N'INSPECTION'),(5,N'HISTORICAL',N'INSPECTION'),(6,N'SEPARATE',N'INSPECTION'),(7,N'SEPARATE',N'INSPECTION')) v(id,code,certificate_type) CROSS JOIN test_clock c
),
fixture_scope AS (
  SELECT * FROM (VALUES(1,N'BMI'),(2,N'BMI'),(2,N'OAI_B'),(3,N'BMI'),(4,N'BMI'),(5,N'BMI'),(6,N'BMI'),(7,N'OAI_B')) s(installation_certificate_id,scope)
),
fixture_file AS (SELECT installation_certificate_id stored_file_id,CAST(0 AS bit) is_deleted FROM fixture_certificate),

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
  from fixture_installation i
  join (values (N'BMI',N'BMI'),(N'BMI_OAI',N'BMI'),(N'BMI_OAI',N'OAI_B'),(N'OAI_TYPE_B',N'OAI_B')) allowed(installation_type_key,scope) on allowed.installation_type_key=i.installation_type_key
  cross join (values(N'MAINTENANCE',N'MAINTENANCE'),(N'INSPECTION',N'INSPECTION_SERVICE')) types(certificate_type,service_category)
  cross join certification_clock clock
  left join certification_contracts contract on contract.installation_code=i.atrium_installation_code and contract.service_category=types.service_category
  outer apply(select cast(case when types.certificate_type=N'INSPECTION' and exists(
    select 1 from fixture_requirement r where r.atrium_installation_code=i.atrium_installation_code
      and r.scope=allowed.scope and r.requirement_status=N'REQUIRED' and (r.effective_from is null or r.effective_from<=clock.today)
  ) then 1 else 0 end as bit) as is_required) manual
),
certificate_scope_status as (
  select r.*,case when r.requirement_status<>N'REQUIRED' then r.requirement_status
    when evidence.evidence_rank is null then N'MISSING'
    when evidence.evidence_rank=4 then N'VALID'
    when evidence.evidence_rank=3 then N'EXPIRING'
    when evidence.evidence_rank=2 then N'UNKNOWN' else N'EXPIRED' end as certificate_status,
    evidence.valid_until
  from certificate_requirements r cross join certification_clock clock
  outer apply (
    select top(1) evaluated.evidence_rank,cert.valid_until
    from fixture_certificate cert
    join fixture_scope scope on scope.installation_certificate_id=cert.installation_certificate_id and scope.scope=r.scope
    left join fixture_file filedata on filedata.stored_file_id=cert.stored_file_id and filedata.is_deleted=0
    cross apply(select case
      when cert.verification_status<>N'VERIFIED' or filedata.stored_file_id is null
        or cert.issue_date is null or cert.valid_until is null or cert.issue_date>clock.today or cert.valid_until<cert.issue_date then 2
      when cert.valid_until<clock.today then 1
      when cert.valid_until<=dateadd(day,90,clock.today) then 3 else 4 end as evidence_rank) evaluated
    where cert.atrium_installation_code=r.atrium_installation_code and cert.certificate_type=r.certificate_type and cert.record_status=N'CURRENT'
    order by evaluated.evidence_rank desc,cert.valid_until desc,cert.installation_certificate_id
  ) evidence
),
certificate_summary as (
  select atrium_installation_code,
    sum(case when requirement_status=N'REQUIRED' then 1 else 0 end) as required_certificate_scope_count,
    max(case certificate_status when N'MISSING' then 6 when N'EXPIRED' then 4 when N'EXPIRING' then 3 when N'UNKNOWN' then 2 when N'VALID' then 1 else 0 end) as certificate_rank,
    max(case when requirement_status=N'CONTRACT_ENDED' then 1 else 0 end) as has_ended_requirement,
    min(case when requirement_status=N'REQUIRED' then valid_until end) as nearest_certificate_valid_until
  from certificate_scope_status group by atrium_installation_code
)
,
expected AS (
 SELECT * FROM (VALUES
  (N'NONE',N'MAINTENANCE',N'BMI',N'NOT_REQUIRED'),(N'NONE',N'INSPECTION',N'BMI',N'NOT_REQUIRED'),
  (N'MAINT',N'MAINTENANCE',N'BMI',N'MISSING'),(N'MAINT',N'INSPECTION',N'BMI',N'NOT_REQUIRED'),
  (N'WRONG_TYPE',N'INSPECTION',N'BMI',N'MISSING'),
  (N'COMBI',N'INSPECTION',N'BMI',N'VALID'),(N'COMBI',N'INSPECTION',N'OAI_B',N'VALID'),
  (N'ENDED',N'MAINTENANCE',N'BMI',N'CONTRACT_ENDED'),
  (N'EXPIRED',N'INSPECTION',N'BMI',N'EXPIRED'),(N'UNVERIFIED',N'INSPECTION',N'BMI',N'UNKNOWN'),
  (N'HISTORICAL',N'INSPECTION',N'BMI',N'MISSING'),
  (N'SEPARATE',N'INSPECTION',N'BMI',N'VALID'),(N'SEPARATE',N'INSPECTION',N'OAI_B',N'VALID')
 ) e(code,certificate_type,scope,expected_status)
)
SELECT e.*,actual.certificate_status AS actual_status,CAST(CASE WHEN actual.certificate_status=e.expected_status THEN 1 ELSE 0 END AS bit) passed
FROM expected e LEFT JOIN certificate_scope_status actual ON actual.atrium_installation_code=e.code AND actual.certificate_type=e.certificate_type AND actual.scope=e.scope;
