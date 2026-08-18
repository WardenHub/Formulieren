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

  if exists (
    select 1
    from dbo.InstallationLogbook l
    where l.installation_id = @installationId
      and l.digilog_id <> @digiLogId
      and (
        exists (select 1 from dbo.InstallationLogbookSync s where s.installation_logbook_id = l.installation_logbook_id)
        or exists (select 1 from dbo.InstallationLogbookDocument d where d.installation_logbook_id = l.installation_logbook_id)
      )
  )
    throw 50000, 'digilog link has sync history', 1;

  merge dbo.InstallationLogbook as target
  using (select @installationId as installation_id) as source
    on target.installation_id = source.installation_id
  when matched then update set
    digilog_id = @digiLogId,
    digilog_title = @digiLogTitle,
    digilog_url = @digiLogUrl,
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

  insert into dbo.InstallationDocument (
    document_id, installation_id, atrium_installation_code, document_type_key,
    parent_document_id, relation_type, title, note, document_date,
    file_name, mime_type, file_size_bytes, uploaded_at, uploaded_by,
    file_last_modified_at, file_last_modified_by, storage_provider, storage_key,
    storage_url, checksum_sha256, source_system, source_reference,
    is_active, created_at, created_by, updated_at, updated_by
  ) values (
    @documentId, @installationId, @code, @documentTypeKey,
    @parentDocumentId, case when @parentDocumentId is null then null else N'VERVANGING' end,
    @remoteName, N'Geïmporteerd uit Digitaal Logboek', cast(@remoteCreated as date),
    @fileName, @mimeType, @fileSizeBytes, sysutcdatetime(), @updatedBy,
    sysutcdatetime(), @updatedBy, @storageProvider, @storageKey,
    @storageUrl, @checksumSha256, N'DigitaalLogboek', @sourceReference,
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
