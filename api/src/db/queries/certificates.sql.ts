export const getCertificationRequirementsSql = `
select
  r.requirement_id,
  r.installation_id,
  r.atrium_installation_code,
  r.scope,
  r.requirement_status,
  r.reason,
  r.effective_from,
  r.first_inspection_due_date,
  r.review_due_date,
  r.source_type,
  r.source_reference,
  r.created_at,
  r.created_by,
  r.updated_at,
  r.updated_by,
  convert(varchar(18), r.row_version, 1) as row_version,
  coalesce((
    select
      e.requirement_event_id,
      e.event_type,
      e.before_json,
      e.after_json,
      e.reason,
      e.event_at,
      e.event_by
    from dbo.InstallationCertificationRequirementEvent e
    where e.requirement_id = r.requirement_id
    order by e.event_at desc, e.requirement_event_id desc
    for json path
  ), N'[]') as events_json
from dbo.InstallationCertificationRequirement r
where r.atrium_installation_code = @code
order by case r.scope
  when N'BMI' then 1
  when N'OAI_A' then 2
  when N'OAI_B' then 3
  when N'OAI_PZI' then 4
  else 99
end;
`;

export const getInstallationCertificatesSql = `
select
  c.installation_certificate_id,
  c.installation_id,
  c.atrium_installation_code,
  c.certificate_type,
  c.certificate_number,
  c.description,
  c.issue_date,
  c.inspection_date,
  c.valid_until,
  c.issuer_name,
  c.inspection_body,
  c.record_status,
  c.supersedes_certificate_id,
  c.installation_document_id,
  c.stored_file_id,
  c.source_form_instance_id,
  c.source_inspection_case_id,
  c.source_type,
  c.source_reference,
  c.verification_status,
  c.created_at,
  c.created_by,
  c.updated_at,
  c.updated_by,
  convert(varchar(18), c.row_version, 1) as row_version,
  case
    when c.record_status = N'REVOKED' then N'REVOKED'
    when c.record_status <> N'CURRENT' then N'HISTORICAL'
    when c.valid_until is null then N'UNKNOWN'
    when c.valid_until < cast(sysutcdatetime() as date) then N'EXPIRED'
    when c.valid_until <= dateadd(day, @expiryWarningDays, cast(sysutcdatetime() as date)) then N'EXPIRING'
    else N'VALID'
  end as validity_status,
  d.title as document_title,
  d.document_number,
  sf.file_name as document_file_name,
  sf.mime_type as document_mime_type,
  coalesce((
    select s.scope
    from dbo.InstallationCertificateScope s
    where s.installation_certificate_id = c.installation_certificate_id
    order by case s.scope
      when N'BMI' then 1
      when N'OAI_A' then 2
      when N'OAI_B' then 3
      when N'OAI_PZI' then 4
      else 99
    end
    for json path
  ), N'[]') as scopes_json,
  coalesce((
    select
      e.certificate_event_id,
      e.event_type,
      e.before_json,
      e.after_json,
      e.reason,
      e.event_at,
      e.event_by
    from dbo.InstallationCertificateEvent e
    where e.installation_certificate_id = c.installation_certificate_id
    order by e.event_at desc, e.certificate_event_id desc
    for json path
  ), N'[]') as events_json,
  coalesce((
    select
      h.certificate_send_history_id,
      h.channel,
      h.recipient_type,
      h.recipient_display_name,
      h.recipient_address,
      h.subject_snapshot,
      h.send_status,
      h.sent_at,
      h.sent_by,
      h.external_reference,
      h.note,
      h.created_at,
      h.created_by
    from dbo.CertificateSendHistory h
    where h.installation_certificate_id = c.installation_certificate_id
    order by h.created_at desc, h.certificate_send_history_id desc
    for json path
  ), N'[]') as send_history_json
from dbo.InstallationCertificate c
left join dbo.InstallationDocument d
  on d.document_id = c.installation_document_id
left join dbo.StoredFile sf
  on sf.stored_file_id = c.stored_file_id
where c.atrium_installation_code = @code
order by
  case c.record_status when N'CURRENT' then 0 when N'HISTORICAL' then 1 else 2 end,
  coalesce(c.valid_until, c.issue_date, c.created_at) desc,
  c.created_at desc;
`;

export const getCertificateDocumentChoicesSql = `
select
  d.document_id,
  d.stored_file_id,
  d.document_type_key,
  dt.naam as document_type_name,
  d.title,
  d.document_number,
  d.document_date,
  d.revision,
  sf.file_name,
  sf.mime_type,
  sf.file_extension,
  sf.file_size_bytes
from dbo.InstallationDocument d
join dbo.DocumentType dt
  on dt.document_type_key = d.document_type_key
join dbo.StoredFile sf
  on sf.stored_file_id = d.stored_file_id
 and sf.is_deleted = 0
where d.atrium_installation_code = @code
  and d.is_active = 1
  and not exists (
    select 1
    from dbo.InstallationDocument replacement
    where replacement.parent_document_id = d.document_id
      and replacement.relation_type = N'VERVANGING'
      and replacement.is_active = 1
  )
order by coalesce(d.document_date, cast(d.created_at as date)) desc, d.created_at desc;
`;

export const upsertCertificationRequirementSql = `
set nocount on;
set xact_abort on;

declare @installationId uniqueidentifier;
declare @requirementId uniqueidentifier;
declare @beforeJson nvarchar(max);
declare @eventType nvarchar(30);

select @installationId = i.installation_id
from dbo.Installation i
where i.atrium_installation_code = @code;

if @installationId is null
  throw 50000, 'installation not found', 1;

select
  @requirementId = r.requirement_id,
  @beforeJson = (
    select
      r.scope,
      r.requirement_status,
      r.reason,
      r.effective_from,
      r.first_inspection_due_date,
      r.review_due_date,
      r.source_type,
      r.source_reference
    for json path, without_array_wrapper
  )
from dbo.InstallationCertificationRequirement r
where r.atrium_installation_code = @code
  and r.scope = @scope;

begin transaction;

if @requirementId is null
begin
  set @requirementId = newid();
  set @eventType = N'CREATED';

  insert into dbo.InstallationCertificationRequirement (
    requirement_id,
    installation_id,
    atrium_installation_code,
    scope,
    requirement_status,
    reason,
    effective_from,
    first_inspection_due_date,
    review_due_date,
    source_type,
    source_reference,
    created_by
  )
  values (
    @requirementId,
    @installationId,
    @code,
    @scope,
    @requirementStatus,
    @reason,
    @effectiveFrom,
    @firstInspectionDueDate,
    @reviewDueDate,
    N'MANUAL',
    null,
    @actor
  );
end
else
begin
  set @eventType = N'UPDATED';

  update dbo.InstallationCertificationRequirement
  set
    requirement_status = @requirementStatus,
    reason = @reason,
    effective_from = @effectiveFrom,
    first_inspection_due_date = @firstInspectionDueDate,
    review_due_date = @reviewDueDate,
    source_type = N'MANUAL',
    source_reference = null,
    updated_at = sysutcdatetime(),
    updated_by = @actor
  where requirement_id = @requirementId
    and row_version = convert(binary(8), @rowVersion, 1);

  if @@rowcount = 0
  begin
    rollback transaction;
    throw 50000, 'certification requirement version conflict', 1;
  end;
end;

declare @afterJson nvarchar(max) = (
  select
    r.scope,
    r.requirement_status,
    r.reason,
    r.effective_from,
    r.first_inspection_due_date,
    r.review_due_date,
    r.source_type,
    r.source_reference
  from dbo.InstallationCertificationRequirement r
  where r.requirement_id = @requirementId
  for json path, without_array_wrapper
);

insert into dbo.InstallationCertificationRequirementEvent (
  requirement_id,
  event_type,
  before_json,
  after_json,
  reason,
  event_by
)
values (
  @requirementId,
  @eventType,
  @beforeJson,
  @afterJson,
  @reason,
  @actor
);

commit transaction;

select
  r.requirement_id,
  r.scope,
  r.requirement_status,
  r.reason,
  r.effective_from,
  r.first_inspection_due_date,
  r.review_due_date,
  r.source_type,
  r.source_reference,
  r.created_at,
  r.created_by,
  r.updated_at,
  r.updated_by,
  convert(varchar(18), r.row_version, 1) as row_version
from dbo.InstallationCertificationRequirement r
where r.requirement_id = @requirementId;
`;

export const createInstallationCertificateSql = `
set nocount on;
set xact_abort on;

declare @installationId uniqueidentifier;
declare @certificateId uniqueidentifier = newid();
declare @storedFileId uniqueidentifier;

select @installationId = i.installation_id
from dbo.Installation i
where i.atrium_installation_code = @code;

if @installationId is null
  throw 50000, 'installation not found', 1;

if @documentId is not null
begin
  select @storedFileId = d.stored_file_id
  from dbo.InstallationDocument d
  join dbo.StoredFile sf
    on sf.stored_file_id = d.stored_file_id
   and sf.is_deleted = 0
  where d.document_id = @documentId
    and d.atrium_installation_code = @code
    and d.is_active = 1
  ;

  if @storedFileId is null
    throw 50000, 'certificate document not found', 1;
end;

if @supersedesCertificateId is not null and not exists (
  select 1
  from dbo.InstallationCertificate c
  where c.installation_certificate_id = @supersedesCertificateId
    and c.atrium_installation_code = @code
)
  throw 50000, 'superseded certificate not found', 1;

if not exists (select 1 from openjson(@scopesJson) with (scope nvarchar(20) '$'))
  throw 50000, 'certificate scope required', 1;

begin transaction;

insert into dbo.InstallationCertificate (
  installation_certificate_id,
  installation_id,
  atrium_installation_code,
  certificate_type,
  certificate_number,
  description,
  issue_date,
  inspection_date,
  valid_until,
  issuer_name,
  inspection_body,
  record_status,
  supersedes_certificate_id,
  installation_document_id,
  stored_file_id,
  source_type,
  verification_status,
  created_by
)
values (
  @certificateId,
  @installationId,
  @code,
  @certificateType,
  @certificateNumber,
  @description,
  @issueDate,
  @inspectionDate,
  @validUntil,
  @issuerName,
  @inspectionBody,
  @recordStatus,
  @supersedesCertificateId,
  @documentId,
  @storedFileId,
  N'MANUAL',
  @verificationStatus,
  @actor
);

insert into dbo.InstallationCertificateScope (
  installation_certificate_id,
  scope,
  created_by
)
select
  @certificateId,
  src.scope,
  @actor
from (
  select distinct scope
  from openjson(@scopesJson) with (scope nvarchar(20) '$')
) src;

insert into dbo.InstallationCertificateEvent (
  installation_certificate_id,
  event_type,
  after_json,
  reason,
  event_by
)
select
  @certificateId,
  N'CREATED',
  (
    select
      c.certificate_type,
      c.certificate_number,
      c.description,
      c.issue_date,
      c.inspection_date,
      c.valid_until,
      c.issuer_name,
      c.inspection_body,
      c.record_status,
      c.supersedes_certificate_id,
      c.installation_document_id,
      c.stored_file_id,
      c.source_type,
      c.verification_status,
      json_query(@scopesJson) as scopes
    from dbo.InstallationCertificate c
    where c.installation_certificate_id = @certificateId
    for json path, without_array_wrapper
  ),
  @changeReason,
  @actor;

if @supersedesCertificateId is not null
begin
  declare @supersededBeforeJson nvarchar(max) = (
    select c.record_status, c.verification_status
    from dbo.InstallationCertificate c
    where c.installation_certificate_id = @supersedesCertificateId
    for json path, without_array_wrapper
  );

  update dbo.InstallationCertificate
  set
    record_status = case when record_status = N'CURRENT' then N'HISTORICAL' else record_status end,
    updated_at = sysutcdatetime(),
    updated_by = @actor
  where installation_certificate_id = @supersedesCertificateId;

  if json_value(@supersededBeforeJson, '$.record_status') = N'CURRENT'
  begin
    insert into dbo.InstallationCertificateEvent (
      installation_certificate_id,
      event_type,
      before_json,
      after_json,
      reason,
      event_by
    )
    values (
      @supersedesCertificateId,
      N'STATUS_CHANGED',
      @supersededBeforeJson,
      (select N'HISTORICAL' as record_status for json path, without_array_wrapper),
      N'Vervangen door een nieuw certificaat',
      @actor
    );
  end;
end;

commit transaction;

select @certificateId as installation_certificate_id;
`;

export const updateInstallationCertificateSql = `
set nocount on;
set xact_abort on;

declare @beforeJson nvarchar(max);
declare @beforeRecordStatus nvarchar(20);
declare @beforeVerificationStatus nvarchar(20);

select
  @beforeRecordStatus = c.record_status,
  @beforeVerificationStatus = c.verification_status,
  @beforeJson = (
    select
      c.certificate_type,
      c.certificate_number,
      c.description,
      c.issue_date,
      c.inspection_date,
      c.valid_until,
      c.issuer_name,
      c.inspection_body,
      c.record_status,
      c.supersedes_certificate_id,
      c.installation_document_id,
      c.stored_file_id,
      c.source_type,
      c.source_reference,
      c.verification_status,
      json_query(coalesce((
        select s.scope
        from dbo.InstallationCertificateScope s
        where s.installation_certificate_id = c.installation_certificate_id
        order by s.scope
        for json path
      ), N'[]')) as scopes
    for json path, without_array_wrapper
  )
from dbo.InstallationCertificate c
where c.installation_certificate_id = @certificateId
  and c.atrium_installation_code = @code;

if @beforeJson is null
  throw 50000, 'certificate not found', 1;

declare @storedFileId uniqueidentifier;

if @documentId is not null
begin
  select @storedFileId = d.stored_file_id
  from dbo.InstallationDocument d
  join dbo.StoredFile sf
    on sf.stored_file_id = d.stored_file_id
   and sf.is_deleted = 0
  where d.document_id = @documentId
    and d.atrium_installation_code = @code
    and d.is_active = 1
  ;

  if @storedFileId is null
    throw 50000, 'certificate document not found', 1;
end;

if @supersedesCertificateId is not null and not exists (
  select 1
  from dbo.InstallationCertificate c
  where c.installation_certificate_id = @supersedesCertificateId
    and c.atrium_installation_code = @code
    and c.installation_certificate_id <> @certificateId
)
  throw 50000, 'superseded certificate not found', 1;

if not exists (select 1 from openjson(@scopesJson) with (scope nvarchar(20) '$'))
  throw 50000, 'certificate scope required', 1;

begin transaction;

update dbo.InstallationCertificate
set
  certificate_type = @certificateType,
  certificate_number = @certificateNumber,
  description = @description,
  issue_date = @issueDate,
  inspection_date = @inspectionDate,
  valid_until = @validUntil,
  issuer_name = @issuerName,
  inspection_body = @inspectionBody,
  record_status = @recordStatus,
  supersedes_certificate_id = @supersedesCertificateId,
  installation_document_id = @documentId,
  stored_file_id = @storedFileId,
  verification_status = @verificationStatus,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where installation_certificate_id = @certificateId
  and row_version = convert(binary(8), @rowVersion, 1);

if @@rowcount = 0
begin
  rollback transaction;
  throw 50000, 'certificate version conflict', 1;
end;

delete from dbo.InstallationCertificateScope
where installation_certificate_id = @certificateId;

insert into dbo.InstallationCertificateScope (
  installation_certificate_id,
  scope,
  created_by
)
select
  @certificateId,
  src.scope,
  @actor
from (
  select distinct scope
  from openjson(@scopesJson) with (scope nvarchar(20) '$')
) src;

declare @afterJson nvarchar(max) = (
  select
    c.certificate_type,
    c.certificate_number,
    c.description,
    c.issue_date,
    c.inspection_date,
    c.valid_until,
    c.issuer_name,
    c.inspection_body,
    c.record_status,
    c.supersedes_certificate_id,
    c.installation_document_id,
    c.stored_file_id,
    c.source_type,
    c.source_reference,
    c.verification_status,
    json_query(@scopesJson) as scopes
  from dbo.InstallationCertificate c
  where c.installation_certificate_id = @certificateId
  for json path, without_array_wrapper
);

insert into dbo.InstallationCertificateEvent (
  installation_certificate_id,
  event_type,
  before_json,
  after_json,
  reason,
  event_by
)
values (
  @certificateId,
  case
    when @beforeRecordStatus <> @recordStatus then N'STATUS_CHANGED'
    when @beforeVerificationStatus <> @verificationStatus then N'VERIFICATION_CHANGED'
    else N'UPDATED'
  end,
  @beforeJson,
  @afterJson,
  @changeReason,
  @actor
);

commit transaction;

select @certificateId as installation_certificate_id;
`;

export const createCertificateSendHistorySql = `
set nocount on;
set xact_abort on;

declare @documentId uniqueidentifier;

select @documentId = c.installation_document_id
from dbo.InstallationCertificate c
where c.installation_certificate_id = @certificateId
  and c.atrium_installation_code = @code;

if @documentId is null
  throw 50000, 'certificate document required before send history', 1;

insert into dbo.CertificateSendHistory (
  installation_certificate_id,
  installation_document_id,
  channel,
  recipient_type,
  recipient_display_name,
  recipient_address,
  subject_snapshot,
  send_status,
  sent_at,
  sent_by,
  external_reference,
  note,
  created_by
)
values (
  @certificateId,
  @documentId,
  @channel,
  @recipientType,
  @recipientDisplayName,
  @recipientAddress,
  @subjectSnapshot,
  @sendStatus,
  case when @sendStatus = N'SENT' then coalesce(@sentAt, sysutcdatetime()) else @sentAt end,
  case when @sendStatus = N'SENT' then @actor else null end,
  @externalReference,
  @note,
  @actor
);

select cast(1 as bit) as ok;
`;
