export const operationalCtes = `
with
follow_up_summary as (
  select
    c.atrium_installation_code,
    count_big(*) as open_follow_up_count,
    sum(case when a.due_date < cast(sysutcdatetime() as date) then 1 else 0 end) as overdue_follow_up_count,
    sum(case when a.responsibility_type = N'CUSTOMER' then 1 else 0 end) as customer_action_required_count,
    sum(case when a.responsibility_type = N'THIRD_PARTY' then 1 else 0 end) as third_party_action_required_count,
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
certificate_scope_status as (
  select
    r.atrium_installation_code,
    r.scope,
    case
      when c.installation_certificate_id is null then N'MISSING'
      when c.record_status = N'REVOKED' then N'REVOKED'
      when c.valid_until is null then N'UNKNOWN'
      when c.valid_until < cast(sysutcdatetime() as date) then N'EXPIRED'
      when c.valid_until <= dateadd(day, @certificateExpiringDays, cast(sysutcdatetime() as date)) then N'EXPIRING'
      else N'VALID'
    end as certificate_status,
    c.valid_until
  from dbo.InstallationCertificationRequirement r
  outer apply (
    select top (1)
      c0.installation_certificate_id,
      c0.record_status,
      c0.valid_until,
      c0.issue_date,
      c0.created_at
    from dbo.InstallationCertificateScope cs
    join dbo.InstallationCertificate c0
      on c0.installation_certificate_id = cs.installation_certificate_id
    where cs.scope = r.scope
      and c0.atrium_installation_code = r.atrium_installation_code
      and c0.verification_status <> N'REJECTED'
    order by
      case c0.record_status when N'CURRENT' then 0 when N'REVOKED' then 1 else 2 end,
      coalesce(c0.valid_until, c0.issue_date, cast(c0.created_at as date)) desc,
      c0.created_at desc
  ) c
  where r.requirement_status = N'REQUIRED'
),
certificate_summary as (
  select
    atrium_installation_code,
    count_big(*) as required_certificate_scope_count,
    max(case certificate_status
      when N'MISSING' then 6
      when N'REVOKED' then 5
      when N'EXPIRED' then 4
      when N'EXPIRING' then 3
      when N'UNKNOWN' then 2
      else 1
    end) as certificate_rank,
    min(valid_until) as nearest_certificate_valid_until
  from certificate_scope_status
  group by atrium_installation_code
),
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
      else N'UNKNOWN'
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
`;

export const getInstallationOperationalRowsSql = `${operationalCtes}
select top (@take)
  o.*,
  case
    when o.has_valid_coordinates = 1 and nullif(o.object_gcid, N'') is not null
      then concat(N'OBJECT|', o.object_gcid)
    when o.has_valid_coordinates = 1
      then concat(N'ADDRESS|', convert(nvarchar(30), o.latitude), N'|', convert(nvarchar(30), o.longitude), N'|', coalesce(o.formatted_address, N''))
    else concat(N'MISSING|', o.atrium_installation_code)
  end as marker_group_key,
  (
    select
      cs.service_category,
      cs.variant,
      cs.display_label,
      cs.service_status,
      cs.service_status_reason,
      cs.contract_type_code,
      cs.contract_type_description,
      cs.bestek_code,
      cs.paragraph_code,
      cs.paragraph_title,
      cs.paragraph_execution_mode,
      cs.includes_maintenance,
      cs.includes_fault_service,
      cs.contract_start_date,
      cs.contract_end_date,
      cs.paragraph_start_date,
      cs.paragraph_end_date,
      cs.paragraph_blocked,
      cs.document_status_code,
      cs.source_modified_at,
      cs.fabric_loaded_at
    from classified_service cs
    where cs.installation_code = o.atrium_installation_code
      and cs.service_category is not null
    order by cs.service_category, cs.display_label, cs.paragraph_code
    for json path
  ) as service_badges_json
from operational o
where (@installationCode is null or o.atrium_installation_code = @installationCode)
  and (@onlyCurrent = 0 or upper(coalesce(o.installation_status, N'')) <> N'J')
  and (
    @qLike is null
    or o.atrium_installation_code like @qLike
    or o.installation_name like @qLike
    or o.object_name like @qLike
    or o.formatted_address like @qLike
    or o.gebruiker_naam like @qLike
    or o.eigenaar_naam like @qLike
    or o.debiteur_naam like @qLike
  )
  and (@installationType is null or o.installation_type_key = @installationType)
  and (
    @coordinateMode = N'ALL'
    or (@coordinateMode = N'WITH' and o.has_valid_coordinates = 1)
    or (@coordinateMode = N'WITHOUT' and o.has_valid_coordinates = 0)
  )
  and (
    @followUpMode = N'ALL'
    or (@followUpMode = N'OPEN' and o.open_follow_up_count > 0)
    or (@followUpMode = N'NONE' and o.open_follow_up_count = 0)
    or (@followUpMode = N'OVERDUE' and o.overdue_follow_up_count > 0)
  )
  and (@openFormsOnly = 0 or o.open_form_count > 0)
  and (@missingDocumentsOnly = 0 or o.missing_required_document_count > 0)
  and (@maintenanceStatus is null or o.maintenance_contract_status = @maintenanceStatus)
  and (@inspectionServiceStatus is null or o.inspection_service_status = @inspectionServiceStatus)
  and (@monitoringServiceStatus is null or o.monitoring_service_status = @monitoringServiceStatus)
  and (@certificationRequiredOnly = 0 or o.certification_required = 1)
  and (@certificateStatus is null or o.certificate_status = @certificateStatus)
  and (@activeInspectionOnly = 0 or o.active_inspection_case_count > 0)
order by
  case o.attention_status when N'CRITICAL' then 0 when N'ATTENTION' then 1 else 2 end,
  o.object_name,
  o.atrium_installation_code;
`;

export const getInstallationMapViewportSql = `
;with open_actions as (
  select
    context.atrium_installation_code,
    count_big(*) as open_follow_up_count,
    sum(case when action.due_date < cast(sysutcdatetime() as date) then 1 else 0 end) as overdue_follow_up_count
  from dbo.FollowUpActionInstallationContext context
  join dbo.FollowUpAction action
    on action.follow_up_action_id = context.follow_up_action_id
  join dbo.FollowUpStatusDefinition status_definition
    on status_definition.status_code = action.status
   and status_definition.is_terminal = 0
  group by context.atrium_installation_code
),
points as (
  select
    a.installatie_code as atrium_installation_code,
    coalesce(nullif(a.installatie_naam, N''), nullif(a.obj_naam, N''), a.installatie_code) as installation_name,
    a.obj_naam as object_name,
    a.obj_adr_formatted as formatted_address,
    try_convert(float, a.obj_adr_latitude) as latitude,
    try_convert(float, a.obj_adr_longitude) as longitude,
    coalesce(nullif(a.gebruiker_naam, N''), nullif(a.eigenaar_naam, N''), nullif(a.debiteur_naam, N'')) as relation_name,
    i.installation_type_key,
    it.display_name as installation_type_name,
    coalesce(actions.open_follow_up_count, 0) as open_follow_up_count,
    coalesce(actions.overdue_follow_up_count, 0) as overdue_follow_up_count
  from dbo.AtriumInstallationBase a
  left join dbo.Installation i
    on i.atrium_installation_code = a.installatie_code
  left join dbo.InstallationType it
    on it.installation_type_key = i.installation_type_key
  left join open_actions actions
    on actions.atrium_installation_code = a.installatie_code
  where try_convert(float, a.obj_adr_latitude) between -90 and 90
    and try_convert(float, a.obj_adr_longitude) between -180 and 180
    and not (try_convert(float, a.obj_adr_latitude) = 0 and try_convert(float, a.obj_adr_longitude) = 0)
    and (@onlyCurrent = 0 or upper(coalesce(a.installation_status, N'')) <> N'J')
    and (@installationType is null or i.installation_type_key = @installationType)
    and (
      @followUpMode = N'ALL'
      or (@followUpMode = N'OPEN' and coalesce(actions.open_follow_up_count, 0) > 0)
      or (@followUpMode = N'NONE' and coalesce(actions.open_follow_up_count, 0) = 0)
      or (@followUpMode = N'OVERDUE' and coalesce(actions.overdue_follow_up_count, 0) > 0)
    )
    and (
      @qLike is null
      or a.installatie_code like @qLike
      or a.installatie_naam like @qLike
      or a.obj_naam like @qLike
      or a.obj_adr_formatted like @qLike
      or a.gebruiker_naam like @qLike
      or a.eigenaar_naam like @qLike
      or a.debiteur_naam like @qLike
    )
    and (
      @qLike is not null
      or (
        try_convert(float, a.obj_adr_latitude) between @south and @north
        and try_convert(float, a.obj_adr_longitude) between @west and @east
      )
    )
),
gridded as (
  select
    *,
    floor(latitude / @cellSize) * @cellSize as grid_latitude,
    floor(longitude / @cellSize) * @cellSize as grid_longitude
  from points
),
groups as (
  select
    grid_latitude,
    grid_longitude,
    count_big(*) as installation_count,
    avg(latitude) as latitude,
    avg(longitude) as longitude,
    min(installation_type_key) as first_type_key,
    max(installation_type_key) as last_type_key,
    max(installation_type_name) as installation_type_name,
    max(atrium_installation_code) as representative_installation_code,
    max(installation_name) as representative_installation_name,
    max(object_name) as object_name,
    max(formatted_address) as formatted_address,
    max(relation_name) as relation_name,
    sum(open_follow_up_count) as open_follow_up_count,
    sum(overdue_follow_up_count) as overdue_follow_up_count
  from gridded
  group by grid_latitude, grid_longitude
)
select top (@take)
  concat(N'GRID|', convert(nvarchar(40), g.grid_latitude), N'|', convert(nvarchar(40), g.grid_longitude)) as marker_group_key,
  g.latitude,
  g.longitude,
  convert(bigint, g.installation_count) as installation_count,
  case when g.first_type_key = g.last_type_key then g.first_type_key else null end as installation_type_key,
  case when g.first_type_key = g.last_type_key then g.installation_type_name else N'Gemengd' end as installation_type_name,
  case when g.installation_count = 1 then g.object_name else concat(g.installation_count, N' installaties') end as object_name,
  case when g.installation_count = 1 then g.formatted_address else null end as formatted_address,
  case when g.installation_count = 1 then g.relation_name else null end as relation,
  case when g.overdue_follow_up_count > 0 then N'CRITICAL' when g.open_follow_up_count > 0 then N'ATTENTION' else N'OK' end as attention_status,
  case when g.overdue_follow_up_count > 0 then N'Verlopen opvolging' when g.open_follow_up_count > 0 then N'Open opvolging' else N'Geen operationele signalen' end as attention_reason,
  convert(bigint, g.open_follow_up_count) as open_follow_up_count,
  convert(bigint, g.overdue_follow_up_count) as overdue_follow_up_count,
  g.representative_installation_code,
  g.representative_installation_name
from groups g
order by g.installation_count desc, g.grid_latitude, g.grid_longitude;
`;
