with
follow_up_summary as (
  select
    c.atrium_installation_code,
    count_big(*) as open_follow_up_count,
    sum(case when a.due_date < cast(sysutcdatetime() as date) then 1 else 0 end) as overdue_follow_up_count,
    sum(case when a.responsibility_type = N'KLANT' then 1 else 0 end) as customer_action_required_count,
    sum(case when a.responsibility_type = N'DERDE' then 1 else 0 end) as third_party_action_required_count,
    sum(case when coalesce(a.certificate_impact_override, a.certificate_impact) = N'yes' then 1 else 0 end)
      as certificate_blocking_follow_up_count
  from dbo.FollowUpActionInstallationContext c
  join dbo.FollowUpAction a
    on a.follow_up_action_id = c.follow_up_action_id
  join dbo.FollowUpStatusDefinition s
    on s.status_code = a.status
   and s.is_terminal = 0
  group by c.atrium_installation_code
),
form_summary as (
  select
    atrium_installation_code,
    count_big(*) as open_form_count
  from dbo.FormInstance
  where atrium_installation_code is not null
    and status in (N'CONCEPT', N'INGEDIEND', N'IN_BEHANDELING')
  group by atrium_installation_code
),
required_document_types as (
  select distinct
    i.atrium_installation_code,
    r.document_type_key
  from dbo.Installation i
  join dbo.DocumentTypeRequirement r
    on r.installation_type_key = i.installation_type_key
   and r.is_required = 1
  join dbo.DocumentType dt
    on dt.document_type_key = r.document_type_key
   and dt.is_active = 1
   and dt.is_attachment_only = 0
),
document_summary as (
  select
    r.atrium_installation_code,
    count_big(*) as required_document_count,
    sum(case when p.document_type_key is null then 1 else 0 end) as missing_required_document_count
  from required_document_types r
  left join (
    select distinct
      atrium_installation_code,
      document_type_key
    from dbo.InstallationDocument
    where is_active = 1
      and stored_file_id is not null
  ) p
    on p.atrium_installation_code = r.atrium_installation_code
   and p.document_type_key = r.document_type_key
  group by r.atrium_installation_code
),
classified_service as (
  select
    s.business_unit,
    s.installation_code,
    s.paragraph_key,
    s.bestek_code,
    s.bestek_title,
    s.paragraph_code,
    s.paragraph_title,
    s.paragraph_type_code,
    s.paragraph_execution_mode,
    s.includes_maintenance,
    s.includes_fault_service,
    s.contract_type_code,
    s.contract_type_description,
    s.contract_key,
    s.contract_historical,
    s.contract_start_date,
    s.contract_end_date,
    s.paragraph_start_date,
    s.paragraph_plan_date,
    s.paragraph_end_date,
    s.paragraph_blocked,
    s.document_status_code,
    s.source_modified_at,
    s.fabric_loaded_at,
    c.service_category,
    c.variant,
    c.display_label,
    c.end_date_rule,
    case
      when c.service_classification_id is null then N'UNCLASSIFIED'
      when upper(ltrim(rtrim(coalesce(s.document_status_code, N'')))) <> N'G' then N'INACTIVE'
      when upper(ltrim(rtrim(coalesce(s.paragraph_blocked, N'N')))) in (N'J', N'Y', N'1', N'TRUE') then N'INACTIVE'
      when upper(ltrim(rtrim(coalesce(s.contract_historical, N'N')))) in (N'J', N'Y', N'1', N'TRUE') then N'INACTIVE'
      when coalesce(s.paragraph_start_date, s.contract_start_date) > cast(sysutcdatetime() as date) then N'INACTIVE'
      when c.end_date_rule = N'IGNORE' then N'ACTIVE'
      when c.end_date_rule = N'OPEN_30_DEC'
       and month(coalesce(s.paragraph_end_date, s.contract_end_date)) = 12
       and day(coalesce(s.paragraph_end_date, s.contract_end_date)) = 30 then N'ACTIVE'
      when coalesce(s.paragraph_end_date, s.contract_end_date) < cast(sysutcdatetime() as date) then N'INACTIVE'
      when upper(ltrim(rtrim(coalesce(s.paragraph_blocked, N'N')))) not in (N'N', N'J', N'Y', N'0', N'1', N'FALSE', N'TRUE') then N'UNKNOWN'
      when upper(ltrim(rtrim(coalesce(s.contract_historical, N'N')))) not in (N'N', N'J', N'Y', N'0', N'1', N'FALSE', N'TRUE') then N'UNKNOWN'
      else N'ACTIVE'
    end as service_status,
    case
      when c.service_classification_id is null then N'Geen actieve dienstclassificatie voor broncode'
      when upper(ltrim(rtrim(coalesce(s.document_status_code, N'')))) <> N'G' then N'Brondocument niet geldig'
      when upper(ltrim(rtrim(coalesce(s.paragraph_blocked, N'N')))) in (N'J', N'Y', N'1', N'TRUE') then N'Bestekparagraaf geblokkeerd'
      when upper(ltrim(rtrim(coalesce(s.contract_historical, N'N')))) in (N'J', N'Y', N'1', N'TRUE') then N'Contract historisch'
      when coalesce(s.paragraph_start_date, s.contract_start_date) > cast(sysutcdatetime() as date) then N'Begindatum ligt in de toekomst'
      when c.end_date_rule = N'IGNORE' then N'Einddatum genegeerd door beheerde regel'
      when c.end_date_rule = N'OPEN_30_DEC'
       and month(coalesce(s.paragraph_end_date, s.contract_end_date)) = 12
       and day(coalesce(s.paragraph_end_date, s.contract_end_date)) = 30 then N'30-12 behandeld als doorlopend door beheerde regel'
      when coalesce(s.paragraph_end_date, s.contract_end_date) < cast(sysutcdatetime() as date) then N'Einddatum verstreken'
      when upper(ltrim(rtrim(coalesce(s.paragraph_blocked, N'N')))) not in (N'N', N'J', N'Y', N'0', N'1', N'FALSE', N'TRUE') then N'Onbekende blokkadewaarde'
      when upper(ltrim(rtrim(coalesce(s.contract_historical, N'N')))) not in (N'N', N'J', N'Y', N'0', N'1', N'FALSE', N'TRUE') then N'Onbekende contracthistoriekwaarde'
      when s.contract_key is null then N'Actief op geldige bestekparagraaf; geen gekoppelde AT_CONTRACT-regel'
      else N'Actief op bronstatus en datumvenster'
    end as service_status_reason
  from dbo.AtriumInstallationBestekParagraph s
  outer apply (
    select top (1)
      c0.service_classification_id,
      c0.service_category,
      c0.variant,
      c0.display_label,
      c0.end_date_rule
    from dbo.AtriumServiceClassification c0
    where c0.is_active = 1
      and c0.contract_type_code = s.contract_type_code
      and c0.business_unit in (N'*', s.business_unit)
      and c0.paragraph_type_code in (N'*', coalesce(s.paragraph_type_code, N''))
      and (c0.paragraph_code is null or c0.paragraph_code = s.paragraph_code)
      and (c0.valid_from is null or c0.valid_from <= cast(sysutcdatetime() as date))
      and (c0.valid_until is null or c0.valid_until >= cast(sysutcdatetime() as date))
    order by
      case when c0.business_unit = s.business_unit then 0 else 1 end,
      case when c0.paragraph_type_code = coalesce(s.paragraph_type_code, N'') then 0 else 1 end,
      case when c0.paragraph_code = s.paragraph_code then 0 else 1 end,
      c0.priority,
      c0.service_classification_id
  ) c
),
service_summary as (
  select
    installation_code,
    max(case when service_category = N'MAINTENANCE' then 1 else 0 end) as has_maintenance_service,
    max(case when service_category = N'MAINTENANCE' then
      case service_status when N'ACTIVE' then 3 when N'UNKNOWN' then 2 else 1 end end) as maintenance_rank,
    max(case when service_category = N'INSPECTION_SERVICE' then 1 else 0 end) as has_inspection_service,
    max(case when service_category = N'INSPECTION_SERVICE' then
      case service_status when N'ACTIVE' then 3 when N'UNKNOWN' then 2 else 1 end end) as inspection_rank,
    max(case when service_category = N'MONITORING_SERVICE' then 1 else 0 end) as has_monitoring_service,
    max(case when service_category = N'MONITORING_SERVICE' then
      case service_status when N'ACTIVE' then 3 when N'UNKNOWN' then 2 else 1 end end) as monitoring_rank,
    max(case when service_category = N'MAINTENANCE' and service_status = N'ACTIVE' and includes_fault_service = 1 then 1 else 0 end)
      as includes_fault_service,
    max(fabric_loaded_at) as service_fabric_loaded_at
  from classified_service
  where service_category is not null
  group by installation_code
),

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
  join (values (N'BMI',N'BMI'),(N'BMI_OAI',N'BMI'),(N'BMI_OAI',N'OAI_B'),(N'OAI_TYPE_B',N'OAI_B')) allowed(installation_type_key,scope) on allowed.installation_type_key=i.installation_type_key
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
    evidence.valid_until
  from certificate_requirements r cross join certification_clock clock
  outer apply (
    select top(1) evaluated.evidence_rank,cert.valid_until
    from dbo.InstallationCertificate cert
    join dbo.InstallationCertificateScope scope on scope.installation_certificate_id=cert.installation_certificate_id and scope.scope=r.scope
    left join dbo.StoredFile filedata on filedata.stored_file_id=cert.stored_file_id and filedata.is_deleted=0
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
inspection_ranked as (
  select
    c.*,
    row_number() over (
      partition by c.atrium_installation_code
      order by
        case c.status
          when N'REPAIR_REQUIRED' then 1
          when N'REINSPECTION_REQUIRED' then 2
          when N'ATTENTION_REQUIRED' then 3
          when N'EXECUTED_AWAITING_REPORT' then 4
          when N'REPORT_RECEIVED' then 5
          when N'PLANNING_REQUIRED' then 6
          when N'PLANNED_UNCONFIRMED' then 7
          when N'PLANNED_CONFIRMED' then 8
          else 20
        end,
        coalesce(c.due_date, convert(date, '99991231')),
        c.created_at
    ) as attention_rank
  from dbo.InspectionCase c
  where c.status not in (N'COMPLETED', N'CANCELLED')
),
inspection_summary as (
  select
    atrium_installation_code,
    count_big(*) as active_inspection_case_count,
    max(case when attention_rank = 1 then status end) as active_inspection_case_status,
    min(due_date) as nearest_inspection_due_date
  from inspection_ranked
  group by atrium_installation_code
),
operational as (
  select
    a.installatie_code as atrium_installation_code,
    i.installation_id,
    i.installation_type_key,
    it.display_name as installation_type_name,
    a.BedrijfUnit,
    a.installation_status,
    coalesce(nullif(a.installatie_naam, N''), nullif(a.obj_naam, N''), a.installatie_code) as installation_name,
    a.object_gcid,
    a.object_code,
    a.obj_naam as object_name,
    a.obj_adr_formatted as formatted_address,
    a.obj_adr_latitude as latitude,
    a.obj_adr_longitude as longitude,
    a.obj_adr_status_coordinaten as coordinate_status,
    a.gebruiker_code,
    a.gebruiker_naam,
    a.eigenaar_code,
    a.eigenaar_naam,
    a.debiteur_code,
    a.debiteur_naam,
    /* De relatiesleutels van de vier objectrollen. Ze hebben dezelfde vorm als
       relation_key in dbo.AtriumRelationGroupMember ("Wardenburg|119173"), en dat is de
       enige brug tussen een installatie en een relatiegroep. */
    a.object_gebruiker_gcid,
    a.object_eigenaar_gcid,
    a.object_beheerder_gcid,
    a.object_debiteur_gcid,
    cast(case
      when a.obj_adr_latitude between -90 and 90
       and a.obj_adr_longitude between -180 and 180
       and not (a.obj_adr_latitude = 0 and a.obj_adr_longitude = 0)
      then 1 else 0 end as bit) as has_valid_coordinates,
    coalesce(f.open_follow_up_count, 0) as open_follow_up_count,
    coalesce(f.overdue_follow_up_count, 0) as overdue_follow_up_count,
    coalesce(f.customer_action_required_count, 0) as customer_action_required_count,
    coalesce(f.third_party_action_required_count, 0) as third_party_action_required_count,
    coalesce(f.certificate_blocking_follow_up_count, 0) as certificate_blocking_follow_up_count,
    coalesce(frm.open_form_count, 0) as open_form_count,
    coalesce(d.required_document_count, 0) as required_document_count,
    coalesce(d.missing_required_document_count, 0) as missing_required_document_count,
    cast(coalesce(s.has_maintenance_service, 0) as bit) as has_maintenance_service,
    case s.maintenance_rank when 3 then N'ACTIVE' when 2 then N'UNKNOWN' when 1 then N'INACTIVE' else N'UNKNOWN' end
      as maintenance_contract_status,
    cast(coalesce(s.includes_fault_service, 0) as bit) as includes_fault_service,
    cast(coalesce(s.has_inspection_service, 0) as bit) as has_inspection_service,
    case s.inspection_rank when 3 then N'ACTIVE' when 2 then N'UNKNOWN' when 1 then N'INACTIVE' else N'UNKNOWN' end
      as inspection_service_status,
    cast(coalesce(s.has_monitoring_service, 0) as bit) as has_monitoring_service,
    case s.monitoring_rank when 3 then N'ACTIVE' when 2 then N'UNKNOWN' when 1 then N'INACTIVE' else N'UNKNOWN' end
      as monitoring_service_status,
    s.service_fabric_loaded_at,
    cast(case when coalesce(cert.required_certificate_scope_count, 0) > 0 then 1 else 0 end as bit) as certification_required,
    case cert.certificate_rank
      when 6 then N'MISSING'
      when 5 then N'REVOKED'
      when 4 then N'EXPIRED'
      when 3 then N'EXPIRING'
      when 2 then N'UNKNOWN'
      when 1 then N'VALID'
      else case when cert.has_ended_requirement=1 then N'CONTRACT_ENDED' else N'NOT_REQUIRED' end
    end as certificate_status,
    cert.nearest_certificate_valid_until,
    coalesce(ins.active_inspection_case_count, 0) as active_inspection_case_count,
    ins.active_inspection_case_status,
    ins.nearest_inspection_due_date,
    ins.nearest_inspection_due_date as inspection_due_date,
    cast(case when coalesce(ins.active_inspection_case_count, 0) > 0 then 1 else 0 end as bit) as inspection_attention_required,
    case
      when coalesce(f.certificate_blocking_follow_up_count, 0) > 0 then N'CRITICAL'
      when coalesce(f.overdue_follow_up_count, 0) > 0 then N'CRITICAL'
      when cert.certificate_rank in (4, 5, 6) then N'CRITICAL'
      when ins.active_inspection_case_status in (N'REPAIR_REQUIRED', N'REINSPECTION_REQUIRED') then N'CRITICAL'
      when coalesce(f.open_follow_up_count, 0) > 0 then N'ATTENTION'
      when coalesce(frm.open_form_count, 0) > 0 then N'ATTENTION'
      when coalesce(d.missing_required_document_count, 0) > 0 then N'ATTENTION'
      when cert.certificate_rank = 3 then N'ATTENTION'
      when coalesce(ins.active_inspection_case_count, 0) > 0 then N'ATTENTION'
      else N'OK'
    end as attention_status,
    case
      when coalesce(f.certificate_blocking_follow_up_count, 0) > 0 then N'Certificaatblokkerende opvolging'
      when coalesce(f.overdue_follow_up_count, 0) > 0 then N'Verlopen opvolging'
      when cert.certificate_rank = 6 then N'Verplicht certificaat ontbreekt'
      when cert.certificate_rank = 5 then N'Certificaat ingetrokken'
      when cert.certificate_rank = 4 then N'Certificaat verlopen'
      when ins.active_inspection_case_status = N'REPAIR_REQUIRED' then N'Herstel na inspectie nodig'
      when ins.active_inspection_case_status = N'REINSPECTION_REQUIRED' then N'Herinspectie nodig'
      when coalesce(f.open_follow_up_count, 0) > 0 then N'Open opvolging'
      when coalesce(frm.open_form_count, 0) > 0 then N'Open formulier'
      when coalesce(d.missing_required_document_count, 0) > 0 then N'Verplicht document ontbreekt'
      when cert.certificate_rank = 3 then N'Certificaat verloopt binnenkort'
      when coalesce(ins.active_inspection_case_count, 0) > 0 then N'Actieve inspectiecase'
      else N'Geen operationele signalen'
    end as attention_reason
  from dbo.AtriumInstallationBase a
  left join dbo.Installation i
    on i.atrium_installation_code = a.installatie_code
  left join dbo.InstallationType it
    on it.installation_type_key = i.installation_type_key
  left join follow_up_summary f
    on f.atrium_installation_code = a.installatie_code
  left join form_summary frm
    on frm.atrium_installation_code = a.installatie_code
  left join document_summary d
    on d.atrium_installation_code = a.installatie_code
  left join service_summary s
    on s.installation_code = a.installatie_code
  left join certificate_summary cert
    on cert.atrium_installation_code = a.installatie_code
  left join inspection_summary ins
    on ins.atrium_installation_code = a.installatie_code
)
 select certificate_type,scope,requirement_status,certificate_status,count_big(*) as row_count from certificate_scope_status group by certificate_type,scope,requirement_status,certificate_status;
