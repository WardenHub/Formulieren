export const getInstallationDocumentStampContextSql = `
select top 1
  d.document_id,
  d.atrium_installation_code,
  d.is_active,
  d.is_signed,
  original_file.stored_file_id as original_stored_file_id,
  original_file.uploaded_by as original_uploaded_by,
  original_file.file_name as original_file_name,
  original_file.mime_type as original_mime_type,
  coalesce(latest_result.stored_file_id, original_file.stored_file_id) as effective_stored_file_id,
  coalesce(latest_result.storage_container, original_file.storage_container) as effective_storage_container,
  coalesce(latest_result.storage_key, original_file.storage_key) as effective_storage_key,
  coalesce(latest_result.file_name, original_file.file_name) as effective_file_name,
  coalesce(latest_result.mime_type, original_file.mime_type) as effective_mime_type,
  coalesce(latest_result.checksum_sha256, original_file.checksum_sha256) as effective_checksum_sha256,
  coalesce(latest_result.stamp_count, 0) as stamp_count
from dbo.InstallationDocument d
join dbo.StoredFile original_file
  on original_file.stored_file_id = d.stored_file_id
 and original_file.is_deleted = 0
outer apply (
  select top 1
    result_file.stored_file_id,
    result_file.storage_container,
    result_file.storage_key,
    result_file.file_name,
    result_file.mime_type,
    result_file.checksum_sha256,
    count(*) over () as stamp_count
  from dbo.InstallationDocumentStamp stamp
  join dbo.StoredFile result_file
    on result_file.stored_file_id = stamp.result_stored_file_id
   and result_file.is_deleted = 0
  where stamp.installation_document_id = d.document_id
  order by stamp.stamped_at desc, stamp.document_stamp_id desc
) latest_result
where d.atrium_installation_code = @code
  and d.document_id = @documentId;
`;

export const insertInstallationDocumentStampSql = `
set xact_abort on;
begin transaction;

declare @currentSourceStoredFileId uniqueidentifier;

select
  @currentSourceStoredFileId = coalesce(latest_stamp.result_stored_file_id, d.stored_file_id)
from dbo.InstallationDocument d with (updlock, holdlock)
outer apply (
  select top 1 s.result_stored_file_id
  from dbo.InstallationDocumentStamp s with (updlock, holdlock)
  where s.installation_document_id = d.document_id
  order by s.stamped_at desc, s.document_stamp_id desc
) latest_stamp
where d.atrium_installation_code = @code
  and d.document_id = @documentId
  and d.is_active = 1;

if @currentSourceStoredFileId is null
  throw 51000, 'document not found', 1;

if @currentSourceStoredFileId <> @expectedSourceStoredFileId
  throw 51000, 'document stamp version conflict', 1;

insert into dbo.StoredFile (
  stored_file_id,
  storage_provider,
  storage_container,
  storage_key,
  storage_url,
  file_name,
  mime_type,
  file_extension,
  file_size_bytes,
  checksum_sha256,
  uploaded_by,
  created_by
)
values (
  @resultStoredFileId,
  @storageProvider,
  @storageContainer,
  @storageKey,
  @storageUrl,
  @fileName,
  N'application/pdf',
  N'pdf',
  @fileSizeBytes,
  @checksumSha256,
  @actorUserObjectId,
  @actor
);

insert into dbo.InstallationDocumentStamp (
  document_stamp_id,
  installation_document_id,
  source_stored_file_id,
  result_stored_file_id,
  stamp_type,
  page_number,
  x_normalized,
  y_normalized,
  width_normalized,
  stamped_by_user_object_id,
  stamped_by_display_name_snapshot,
  stamped_by_job_title_snapshot,
  created_by,
  self_approval_override,
  self_approval_reason
)
values (
  @documentStampId,
  @documentId,
  @expectedSourceStoredFileId,
  @resultStoredFileId,
  @stampType,
  @pageNumber,
  @xNormalized,
  @yNormalized,
  @widthNormalized,
  @actorUserObjectId,
  @actorDisplayName,
  @actorJobTitle,
  @actor,
  @selfApprovalOverride,
  @selfApprovalReason
);

commit transaction;

select
  s.document_stamp_id,
  s.installation_document_id,
  s.stamp_type,
  s.page_number,
  s.x_normalized,
  s.y_normalized,
  s.width_normalized,
  s.stamped_by_user_object_id,
  s.stamped_by_display_name_snapshot,
  s.stamped_by_job_title_snapshot,
  s.stamped_at
from dbo.InstallationDocumentStamp s
where s.document_stamp_id = @documentStampId;
`;
