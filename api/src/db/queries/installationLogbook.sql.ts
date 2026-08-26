export const getInstallationLogbookSql = `
select top 1
  l.installation_logbook_id,
  l.atrium_installation_code,
  l.provider,
  l.digilog_id,
  l.digilog_title,
  l.digilog_url,
  l.last_checked_at,
  l.last_check_status,
  l.last_check_error,
  l.last_import_at,
  l.created_at,
  l.created_by,
  l.updated_at,
  l.updated_by
from dbo.InstallationLogbook l
where l.atrium_installation_code = @code;

select top 25
  s.installation_logbook_sync_id,
  s.status,
  s.started_at,
  s.completed_at,
  s.remote_document_count,
  s.pending_document_count,
  s.imported_document_count,
  s.skipped_document_count,
  s.failed_document_count,
  s.error_message,
  s.created_by
from dbo.InstallationLogbookSync s
join dbo.InstallationLogbook l
  on l.installation_logbook_id = s.installation_logbook_id
where l.atrium_installation_code = @code
order by s.started_at desc;

if object_id(N'dbo.InstallationLogbookSyncDocument', N'U') is not null
begin
  exec sys.sp_executesql N'
    select
      sd.installation_logbook_sync_document_id,
      sd.installation_logbook_sync_id,
      sd.remote_document_id,
      sd.action,
      sd.outcome,
      sd.remote_name,
      sd.remote_time_last_modified,
      sd.error_message,
      sd.undone_at,
      sd.undone_by,
      d.document_id,
      d.title,
      sf.file_name,
      d.document_type_key,
      dt.naam as document_type_name,
      d.created_at,
      d.is_active,
      cast(case when sf.storage_key is not null then 1 else 0 end as bit) as has_file
    from dbo.InstallationLogbookSyncDocument sd
    join dbo.InstallationLogbookSync s
      on s.installation_logbook_sync_id = sd.installation_logbook_sync_id
    join dbo.InstallationLogbook l
      on l.installation_logbook_id = s.installation_logbook_id
    left join dbo.InstallationDocument d
      on d.document_id = sd.installation_document_id
    left join dbo.StoredFile sf
      on sf.stored_file_id = d.stored_file_id
     and sf.is_deleted = 0
    left join dbo.DocumentType dt
      on dt.document_type_key = coalesce(sd.document_type_key, d.document_type_key)
    where l.atrium_installation_code = @codeInner
      and sd.outcome = N''IMPORTED''
    order by s.started_at desc, sd.created_at asc;',
    N'@codeInner nvarchar(450)',
    @codeInner = @code;
end
else
begin
  select
    cast(null as uniqueidentifier) as installation_logbook_sync_document_id,
    s.installation_logbook_sync_id,
    ld.remote_document_id,
    cast(N'IMPORT' as nvarchar(20)) as action,
    cast(N'IMPORTED' as nvarchar(20)) as outcome,
    coalesce(ld.remote_name, sf.file_name, d.title, N'Document') as remote_name,
    ld.handled_remote_time_last_modified as remote_time_last_modified,
    cast(null as nvarchar(1000)) as error_message,
    cast(null as datetime2(3)) as undone_at,
    cast(null as nvarchar(200)) as undone_by,
    d.document_id,
    d.title,
    sf.file_name,
    d.document_type_key,
    dt.naam as document_type_name,
    d.created_at,
    d.is_active,
    cast(case when sf.storage_key is not null then 1 else 0 end as bit) as has_file
  from dbo.InstallationLogbookSync s
  join dbo.InstallationLogbook l
    on l.installation_logbook_id = s.installation_logbook_id
  join dbo.InstallationDocument d
    on d.installation_id = l.installation_id
   and d.source_system = N'DigitaalLogboek'
   and d.created_at >= s.started_at
   and d.created_at <= coalesce(s.completed_at, sysutcdatetime())
  left join dbo.StoredFile sf
    on sf.stored_file_id = d.stored_file_id
   and sf.is_deleted = 0
  join dbo.InstallationLogbookDocument ld
    on ld.installation_logbook_id = l.installation_logbook_id
   and ld.installation_document_id = d.document_id
  left join dbo.DocumentType dt
    on dt.document_type_key = d.document_type_key
  where l.atrium_installation_code = @code
  order by s.started_at desc, d.created_at asc;
end;
`;

export const upsertInstallationLogbookSql = `
set nocount on;
set xact_abort on;
begin transaction;
begin try
  if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
    throw 50000, 'atrium installation not found', 1;

  if not exists (select 1 from dbo.Installation where atrium_installation_code = @code)
  begin
    insert into dbo.Installation (
      installation_id, atrium_installation_code, installation_type_key,
      created_at, created_by, is_active
    ) values (newid(), @code, null, sysutcdatetime(), @updatedBy, 1);
  end;

  declare @installationId uniqueidentifier;
  select @installationId = installation_id
  from dbo.Installation
  where atrium_installation_code = @code;

  if exists (
    select 1
    from dbo.InstallationLogbook
    where digilog_id = @digiLogId
      and installation_id <> @installationId
  )
    throw 50000, 'digilog already linked', 1;

  merge dbo.InstallationLogbook as target
  using (select @installationId as installation_id) as source
    on target.installation_id = source.installation_id
  when matched then update set
    digilog_id = @digiLogId,
    digilog_title = @digiLogTitle,
    digilog_url = @digiLogUrl,
    last_checked_at = case when target.digilog_id <> @digiLogId then null else target.last_checked_at end,
    last_check_status = case when target.digilog_id <> @digiLogId then null else target.last_check_status end,
    last_check_error = case when target.digilog_id <> @digiLogId then null else target.last_check_error end,
    last_import_at = case when target.digilog_id <> @digiLogId then null else target.last_import_at end,
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  when not matched then insert (
    installation_id, atrium_installation_code, provider, digilog_id,
    digilog_title, digilog_url, created_at, created_by, updated_at, updated_by
  ) values (
    @installationId, @code, N'DigitaalLogboek', @digiLogId,
    @digiLogTitle, @digiLogUrl, sysutcdatetime(), @updatedBy, sysutcdatetime(), @updatedBy
  );

  commit transaction;
end try
begin catch
  if @@trancount > 0 rollback transaction;
  throw;
end catch;

select top 1
  installation_logbook_id,
  installation_id,
  atrium_installation_code,
  provider,
  digilog_id,
  digilog_title,
  digilog_url,
  last_checked_at,
  last_check_status,
  last_check_error,
  last_import_at,
  created_at,
  created_by,
  updated_at,
  updated_by
from dbo.InstallationLogbook
where atrium_installation_code = @code;
`;

export const getInstallationLogbookTrackedDocumentsSql = `
select
  d.remote_document_id,
  d.remote_time_last_modified,
  d.handled_status,
  d.handled_remote_time_last_modified,
  d.document_type_key,
  d.installation_document_id
from dbo.InstallationLogbookDocument d
where d.installation_logbook_id = @installationLogbookId;
`;

export const beginInstallationLogbookSyncSql = `
insert into dbo.InstallationLogbookSync (
  installation_logbook_sync_id, installation_logbook_id, status, started_at,
  remote_document_count, pending_document_count, created_by
) values (
  @syncId, @installationLogbookId, N'RUNNING', sysutcdatetime(),
  @remoteDocumentCount, @pendingDocumentCount, @createdBy
);
`;

export const markInstallationLogbookDocumentSkippedSql = `
set nocount on;
set xact_abort on;
begin transaction;
begin try
merge dbo.InstallationLogbookDocument as target
using (select @installationLogbookId as installation_logbook_id, @remoteDocumentId as remote_document_id) as source
  on target.installation_logbook_id = source.installation_logbook_id
 and target.remote_document_id = source.remote_document_id
when matched then update set
  remote_time_last_modified = @remoteTimeLastModified,
  remote_name = @remoteName,
  remote_type_title = @remoteTypeTitle,
  remote_folder_id = @remoteFolderId,
  remote_folder_name = @remoteFolderName,
  remote_file_extension = @remoteFileExtension,
  remote_mime_type = @remoteMimeType,
  handled_status = N'SKIPPED',
  handled_remote_time_last_modified = @remoteTimeLastModified,
  last_seen_at = sysutcdatetime(),
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy
when not matched then insert (
  installation_logbook_id, remote_document_id, remote_time_last_modified,
  remote_name, remote_type_title, remote_folder_id, remote_folder_name,
  remote_file_extension, remote_mime_type, handled_status,
  handled_remote_time_last_modified, document_type_key, installation_document_id,
  last_seen_at, created_at, created_by, updated_at, updated_by
) values (
  @installationLogbookId, @remoteDocumentId, @remoteTimeLastModified,
  @remoteName, @remoteTypeTitle, @remoteFolderId, @remoteFolderName,
  @remoteFileExtension, @remoteMimeType, N'SKIPPED',
  @remoteTimeLastModified, null, null,
  sysutcdatetime(), sysutcdatetime(), @updatedBy, sysutcdatetime(), @updatedBy
);

insert into dbo.InstallationLogbookSyncDocument (
  installation_logbook_sync_document_id, installation_logbook_sync_id,
  remote_document_id, installation_document_id, document_type_key,
  action, outcome, remote_name, remote_time_last_modified, created_at
) values (
  newid(), @syncId,
  @remoteDocumentId, null, null,
  N'SKIP', N'SKIPPED', @remoteName, @remoteTimeLastModified, sysutcdatetime()
);

commit transaction;
end try
begin catch
  if @@trancount > 0 rollback transaction;
  throw;
end catch;
`;

export const importInstallationLogbookDocumentSql = `
set nocount on;
set xact_abort on;
begin transaction;
begin try
  declare @installationId uniqueidentifier;
  declare @parentDocumentId uniqueidentifier;

  select @installationId = l.installation_id
  from dbo.InstallationLogbook l
  where l.installation_logbook_id = @installationLogbookId
    and l.atrium_installation_code = @code;

  if @installationId is null
    throw 50000, 'installation logbook not found', 1;

  if not exists (
    select 1 from dbo.DocumentType
    where document_type_key = @documentTypeKey
      and is_active = 1
      and is_attachment_only = 0
  )
    throw 50000, 'document type invalid', 1;

  select @parentDocumentId = installation_document_id
  from dbo.InstallationLogbookDocument
  where installation_logbook_id = @installationLogbookId
    and remote_document_id = @remoteDocumentId;

  declare @storedFileId uniqueidentifier = newid();

  insert into dbo.StoredFile (
    stored_file_id, storage_provider, storage_key, storage_url,
    file_name, mime_type, file_extension, file_size_bytes, checksum_sha256,
    uploaded_by, created_by
  ) values (
    @storedFileId, @storageProvider, @storageKey, @storageUrl,
    @fileName, @mimeType, @remoteFileExtension, @fileSizeBytes, @checksumSha256,
    @updatedBy, @updatedBy
  );

  insert into dbo.InstallationDocument (
    document_id, installation_id, atrium_installation_code, document_type_key,
    parent_document_id, relation_type, title, note, document_date,
    stored_file_id, source_system, source_reference,
    is_active, created_at, created_by, updated_at, updated_by
  ) values (
    @documentId, @installationId, @code, @documentTypeKey,
    @parentDocumentId, case when @parentDocumentId is null then null else N'VERVANGING' end,
    @remoteName, N'Geïmporteerd uit Digitaal Logboek', cast(@remoteCreated as date),
    @storedFileId, N'DigitaalLogboek', @sourceReference,
    1, sysutcdatetime(), @updatedBy, sysutcdatetime(), @updatedBy
  );

  merge dbo.InstallationLogbookDocument as target
  using (select @installationLogbookId as installation_logbook_id, @remoteDocumentId as remote_document_id) as source
    on target.installation_logbook_id = source.installation_logbook_id
   and target.remote_document_id = source.remote_document_id
  when matched then update set
    remote_time_last_modified = @remoteTimeLastModified,
    remote_name = @remoteName,
    remote_type_title = @remoteTypeTitle,
    remote_folder_id = @remoteFolderId,
    remote_folder_name = @remoteFolderName,
    remote_file_extension = @remoteFileExtension,
    remote_mime_type = @remoteMimeType,
    handled_status = N'IMPORTED',
    handled_remote_time_last_modified = @remoteTimeLastModified,
    document_type_key = @documentTypeKey,
    installation_document_id = @documentId,
    last_seen_at = sysutcdatetime(),
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  when not matched then insert (
    installation_logbook_id, remote_document_id, remote_time_last_modified,
    remote_name, remote_type_title, remote_folder_id, remote_folder_name,
    remote_file_extension, remote_mime_type, handled_status,
    handled_remote_time_last_modified, document_type_key, installation_document_id,
    last_seen_at, created_at, created_by, updated_at, updated_by
  ) values (
    @installationLogbookId, @remoteDocumentId, @remoteTimeLastModified,
    @remoteName, @remoteTypeTitle, @remoteFolderId, @remoteFolderName,
    @remoteFileExtension, @remoteMimeType, N'IMPORTED',
    @remoteTimeLastModified, @documentTypeKey, @documentId,
    sysutcdatetime(), sysutcdatetime(), @updatedBy, sysutcdatetime(), @updatedBy
  );

  insert into dbo.InstallationLogbookSyncDocument (
    installation_logbook_sync_document_id, installation_logbook_sync_id,
    remote_document_id, installation_document_id, document_type_key,
    action, outcome, remote_name, remote_time_last_modified, created_at
  ) values (
    newid(), @syncId,
    @remoteDocumentId, @documentId, @documentTypeKey,
    N'IMPORT', N'IMPORTED', @remoteName, @remoteTimeLastModified, sysutcdatetime()
  );

  commit transaction;
end try
begin catch
  if @@trancount > 0 rollback transaction;
  throw;
end catch;
`;

export const finishInstallationLogbookSyncSql = `
update dbo.InstallationLogbookSync
set
  status = @status,
  completed_at = sysutcdatetime(),
  imported_document_count = @importedCount,
  skipped_document_count = @skippedCount,
  failed_document_count = @failedCount,
  error_message = @errorMessage
where installation_logbook_sync_id = @syncId
  and installation_logbook_id = @installationLogbookId;

update dbo.InstallationLogbook
set
  digilog_title = coalesce(@digiLogTitle, digilog_title),
  last_checked_at = sysutcdatetime(),
  last_check_status = @status,
  last_check_error = @errorMessage,
  last_import_at = case when @importedCount > 0 then sysutcdatetime() else last_import_at end,
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy
where installation_logbook_id = @installationLogbookId;
`;

export const recordInstallationLogbookSyncFailureSql = `
insert into dbo.InstallationLogbookSyncDocument (
  installation_logbook_sync_document_id, installation_logbook_sync_id,
  remote_document_id, installation_document_id, document_type_key,
  action, outcome, remote_name, remote_time_last_modified,
  error_message, created_at
) values (
  newid(), @syncId,
  @remoteDocumentId, null, @documentTypeKey,
  @action, N'FAILED', @remoteName, @remoteTimeLastModified,
  @errorMessage, sysutcdatetime()
);
`;

export const getInstallationLogbookUndoCandidatesSql = `
select
  sd.installation_logbook_sync_document_id,
  sd.installation_logbook_sync_id,
  sd.remote_document_id,
  sd.remote_name,
  sd.remote_time_last_modified,
  sd.installation_document_id,
  sd.document_type_key,
  sf.storage_provider,
  sf.storage_key,
  sf.storage_url,
  sf.checksum_sha256,
  d.is_active,
  (
    select count_big(1)
    from dbo.InstallationDocument child
    where child.parent_document_id = d.document_id
      and child.is_active = 1
  ) as active_related_document_count,
  (
    select count_big(1)
    from (
      select p.drawing_pin_id as reference_id
      from dbo.DrawingPin p
      where p.installation_document_id = d.document_id
      union all
      select c.installation_certificate_id
      from dbo.InstallationCertificate c
      where c.installation_document_id = d.document_id
      union all
      select r.inspection_case_report_id
      from dbo.InspectionCaseReport r
      where r.installation_document_id = d.document_id
      union all
      select r.inspection_case_document_requirement_id
      from dbo.InspectionCaseDocumentRequirement r
      where r.installation_document_id = d.document_id
      union all
      select p.installation_document_id
      from dbo.InspectionCaseDocumentPackageItem p
      where p.installation_document_id = d.document_id
    ) audit_reference
  ) as audit_reference_count
from dbo.InstallationLogbookSyncDocument sd
join dbo.InstallationLogbookSync s
  on s.installation_logbook_sync_id = sd.installation_logbook_sync_id
join dbo.InstallationLogbook l
  on l.installation_logbook_id = s.installation_logbook_id
join dbo.InstallationDocument d
  on d.document_id = sd.installation_document_id
left join dbo.StoredFile sf
  on sf.stored_file_id = d.stored_file_id
 and sf.is_deleted = 0
where l.atrium_installation_code = @code
  and s.installation_logbook_sync_id = @syncId
  and sd.outcome = N'IMPORTED'
  and sd.undone_at is null
  and d.source_system = N'DigitaalLogboek'
  and d.is_active = 1
  and (
    @documentIdsJson is null
    or d.document_id in (
      select try_convert(uniqueidentifier, [value])
      from openjson(@documentIdsJson)
      where try_convert(uniqueidentifier, [value]) is not null
    )
  )
order by sd.created_at;
`;

export const markInstallationLogbookDocumentUndoneSql = `
set nocount on;
set xact_abort on;
begin transaction;
begin try
  if not exists (
    select 1
    from dbo.InstallationLogbookSyncDocument sd
    join dbo.InstallationLogbookSync s
      on s.installation_logbook_sync_id = sd.installation_logbook_sync_id
    join dbo.InstallationLogbook l
      on l.installation_logbook_id = s.installation_logbook_id
    join dbo.InstallationDocument d
      on d.document_id = sd.installation_document_id
    where sd.installation_logbook_sync_document_id = @syncDocumentId
      and d.document_id = @documentId
      and l.atrium_installation_code = @code
      and sd.undone_at is null
      and d.is_active = 1
      and d.source_system = N'DigitaalLogboek'
  )
    throw 50000, 'logbook sync document not removable', 1;

  if exists (
    select 1
    from dbo.InstallationDocument child
    where child.parent_document_id = @documentId
      and child.is_active = 1
  )
    throw 50000, 'logbook document has active related documents', 1;

  if exists (select 1 from dbo.DrawingPin where installation_document_id = @documentId)
    or exists (select 1 from dbo.InstallationCertificate where installation_document_id = @documentId)
    or exists (select 1 from dbo.InspectionCaseReport where installation_document_id = @documentId)
    or exists (select 1 from dbo.InspectionCaseDocumentRequirement where installation_document_id = @documentId)
    or exists (select 1 from dbo.InspectionCaseDocumentPackageItem where installation_document_id = @documentId)
    throw 50000, 'logbook document has audit references', 1;

  update sf
  set
    is_deleted = 1,
    deleted_at = sysutcdatetime(),
    deleted_by = @updatedBy,
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  from dbo.StoredFile sf
  join dbo.InstallationDocument d
    on d.stored_file_id = sf.stored_file_id
  where d.document_id = @documentId
    and d.atrium_installation_code = @code
    and sf.is_deleted = 0;

  update dbo.InstallationDocument
  set
    is_active = 0,
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  where document_id = @documentId
    and atrium_installation_code = @code;

  update dbo.InstallationLogbookSyncDocument
  set
    undone_at = sysutcdatetime(),
    undone_by = @updatedBy
  where installation_logbook_sync_document_id = @syncDocumentId;

  commit transaction;
end try
begin catch
  if @@trancount > 0 rollback transaction;
  throw;
end catch;
`;

export const restoreInstallationLogbookDocumentAfterUndoFailureSql = `
set nocount on;
set xact_abort on;
begin transaction;
begin try
  update sf
  set
    is_deleted = 0,
    deleted_at = null,
    deleted_by = null,
    storage_provider = coalesce(@storageProvider, storage_provider),
    storage_key = coalesce(@storageKey, storage_key),
    storage_url = coalesce(@storageUrl, storage_url),
    checksum_sha256 = coalesce(@checksumSha256, checksum_sha256),
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  from dbo.StoredFile sf
  join dbo.InstallationDocument d
    on d.stored_file_id = sf.stored_file_id
  where d.document_id = @documentId
    and d.atrium_installation_code = @code
    and sf.is_deleted = 1;

  update dbo.InstallationDocument
  set
    is_active = 1,
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  where document_id = @documentId
    and atrium_installation_code = @code;

  update dbo.InstallationLogbookSyncDocument
  set undone_at = null, undone_by = null
  where installation_logbook_sync_document_id = @syncDocumentId;

  commit transaction;
end try
begin catch
  if @@trancount > 0 rollback transaction;
  throw;
end catch;
`;

export const getInstallationLogbookReimportContextSql = `
select top 1
  l.installation_logbook_id,
  l.digilog_id,
  l.digilog_title,
  ld.remote_document_id,
  ld.document_type_key,
  d.document_id,
  d.is_active,
  sf.storage_key
from dbo.InstallationLogbookDocument ld
join dbo.InstallationLogbook l
  on l.installation_logbook_id = ld.installation_logbook_id
join dbo.InstallationDocument d
  on d.document_id = ld.installation_document_id
left join dbo.StoredFile sf
  on sf.stored_file_id = d.stored_file_id
 and sf.is_deleted = 0
where l.atrium_installation_code = @code
  and d.document_id = @documentId
  and d.source_system = N'DigitaalLogboek'
  and ld.handled_status = N'IMPORTED';
`;

export const reimportInstallationLogbookDocumentSql = `
set nocount on;
set xact_abort on;
begin transaction;
begin try
  declare @storedFileId uniqueidentifier = newid();

  insert into dbo.StoredFile (
    stored_file_id, storage_provider, storage_key, storage_url,
    file_name, mime_type, file_extension, file_size_bytes, checksum_sha256,
    uploaded_by, created_by
  ) values (
    @storedFileId, @storageProvider, @storageKey, @storageUrl,
    @fileName, @mimeType, @remoteFileExtension, @fileSizeBytes, @checksumSha256,
    @updatedBy, @updatedBy
  );

  update dbo.InstallationDocument
  set
    title = @remoteName,
    note = N'Opnieuw geïmporteerd uit Digitaal Logboek',
    document_date = cast(@remoteCreated as date),
    stored_file_id = @storedFileId,
    source_reference = @sourceReference,
    is_active = 1,
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  where document_id = @documentId
    and atrium_installation_code = @code
    and source_system = N'DigitaalLogboek'
    and is_active = 0;

  if @@rowcount <> 1
    throw 50000, 'logbook document not ready for reimport', 1;

  update dbo.InstallationLogbookDocument
  set
    remote_time_last_modified = @remoteTimeLastModified,
    remote_name = @remoteName,
    remote_type_title = @remoteTypeTitle,
    remote_folder_id = @remoteFolderId,
    remote_folder_name = @remoteFolderName,
    remote_file_extension = @remoteFileExtension,
    remote_mime_type = @remoteMimeType,
    handled_status = N'IMPORTED',
    handled_remote_time_last_modified = @remoteTimeLastModified,
    last_seen_at = sysutcdatetime(),
    updated_at = sysutcdatetime(),
    updated_by = @updatedBy
  where installation_logbook_id = @installationLogbookId
    and remote_document_id = @remoteDocumentId
    and installation_document_id = @documentId;

  insert into dbo.InstallationLogbookSyncDocument (
    installation_logbook_sync_document_id, installation_logbook_sync_id,
    remote_document_id, installation_document_id, document_type_key,
    action, outcome, remote_name, remote_time_last_modified, created_at
  ) values (
    newid(), @syncId,
    @remoteDocumentId, @documentId, @documentTypeKey,
    N'REIMPORT', N'IMPORTED', @remoteName, @remoteTimeLastModified, sysutcdatetime()
  );

  commit transaction;
end try
begin catch
  if @@trancount > 0 rollback transaction;
  throw;
end catch;
`;
