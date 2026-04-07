// /api/src/db/queries/installationDocuments.sql.ts

export const getInstallationDocumentsReadSql = `
-- expects: @code

declare @installationTypeKey nvarchar(50) = null;

select top 1
  @installationTypeKey = i.installation_type_key
from dbo.Installation i
where i.atrium_installation_code = @code;

select
  dt.document_type_key,
  dt.naam as document_type_name,
  dt.sectie_key as section_key,
  dt.sort_order,
  dt.is_active as document_type_is_active,

  d.document_id,
  d.parent_document_id,
  d.relation_type,

  d.title,
  d.note,
  d.document_number,
  d.document_date,
  d.revision,

  d.file_name,
  d.mime_type,
  d.file_size_bytes,
  d.uploaded_at,
  d.uploaded_by,
  d.file_last_modified_at,
  d.file_last_modified_by,

  d.storage_provider,
  d.storage_key,
  d.storage_url,
  d.checksum_sha256,

  d.source_system,
  d.source_reference,

  d.is_active as document_is_active,
  d.created_at,
  d.created_by,
  d.updated_at,
  d.updated_by
from dbo.DocumentType dt
left join dbo.InstallationDocument d
  on d.document_type_key = dt.document_type_key
 and d.atrium_installation_code = @code
where dt.is_active = 1
and (
  not exists (
    select 1
    from dbo.DocumentTypeInstallationType x
    where x.document_type_key = dt.document_type_key
  )
  or (
    @installationTypeKey is not null
    and exists (
      select 1
      from dbo.DocumentTypeInstallationType x
      where x.document_type_key = dt.document_type_key
        and x.installation_type_key = @installationTypeKey
    )
  )
)
order by
  case when dt.sectie_key is null then 1 else 0 end,
  dt.sectie_key,
  case when dt.sort_order is null then 999999 else dt.sort_order end,
  dt.document_type_key,
  d.created_at desc
`;

export const upsertInstallationDocumentsMetadataSql = `
-- expects params: @code, @documentsJson, @updatedBy

set nocount on;

if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

if not exists (select 1 from dbo.Installation where atrium_installation_code = @code)
begin
  insert into dbo.Installation (
    installation_id,
    atrium_installation_code,
    installation_type_key,
    created_at,
    created_by,
    is_active
  )
  values (
    newid(),
    @code,
    null,
    sysutcdatetime(),
    @updatedBy,
    1
  );
end;

declare @installation_id uniqueidentifier;
declare @atrium_installation_code nvarchar(450);

select
  @installation_id = i.installation_id,
  @atrium_installation_code = i.atrium_installation_code
from dbo.Installation i
where i.atrium_installation_code = @code;

if @installation_id is null
begin
  throw 50000, 'installation not found', 1;
end;

declare @actions table (action nvarchar(10));

merge dbo.InstallationDocument as tgt
using (
  select
    src.document_id,
    @installation_id as installation_id,
    @atrium_installation_code as atrium_installation_code,
    src.document_type_key,
    src.title,
    src.note,
    src.document_number,
    src.document_date,
    src.revision,
    src.is_active
  from openjson(@documentsJson)
  with (
    document_id uniqueidentifier '$.document_id',
    document_type_key nvarchar(50) '$.document_type_key',
    title nvarchar(250) '$.title',
    note nvarchar(2000) '$.note',
    document_number nvarchar(200) '$.document_number',
    document_date date '$.document_date',
    revision nvarchar(50) '$.revision',
    is_active bit '$.is_active'
  ) src
  join dbo.DocumentType dt
    on dt.document_type_key = src.document_type_key
   and dt.is_active = 1
) as s
on tgt.document_id = s.document_id
and tgt.atrium_installation_code = @code
when matched then update set
  tgt.installation_id = s.installation_id,
  tgt.atrium_installation_code = s.atrium_installation_code,
  tgt.document_type_key = s.document_type_key,
  tgt.title = s.title,
  tgt.note = s.note,
  tgt.document_number = s.document_number,
  tgt.document_date = s.document_date,
  tgt.revision = s.revision,
  tgt.is_active = isnull(s.is_active, 1),
  tgt.updated_at = sysutcdatetime(),
  tgt.updated_by = @updatedBy
when not matched then insert (
  document_id,
  installation_id,
  atrium_installation_code,
  document_type_key,
  title,
  note,
  document_number,
  document_date,
  revision,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
) values (
  isnull(s.document_id, newid()),
  s.installation_id,
  s.atrium_installation_code,
  s.document_type_key,
  s.title,
  s.note,
  s.document_number,
  s.document_date,
  s.revision,
  isnull(s.is_active, 1),
  sysutcdatetime(),
  @updatedBy,
  sysutcdatetime(),
  @updatedBy
)
output $action into @actions;

select
  (select count(*) from @actions) as affected_rows,
  (select count(*) from @actions where action = 'INSERT') as inserted_rows,
  (select count(*) from @actions where action = 'UPDATE') as updated_rows;
`;

export const getInstallationDocumentContextSql = `
-- expects: @code, @documentId

select top 1
  d.document_id,
  d.installation_id,
  d.atrium_installation_code,
  d.document_type_key,
  d.parent_document_id,
  d.relation_type,
  d.title,
  d.note,
  d.document_number,
  d.document_date,
  d.revision,
  d.file_name,
  d.mime_type,
  d.file_size_bytes,
  d.uploaded_at,
  d.uploaded_by,
  d.file_last_modified_at,
  d.file_last_modified_by,
  d.storage_provider,
  d.storage_key,
  d.storage_url,
  d.is_active,
  d.created_at,
  d.created_by,
  d.updated_at,
  d.updated_by
from dbo.InstallationDocument d
where d.atrium_installation_code = @code
  and d.document_id = @documentId;
`;

export const createInstallationDocumentReplacementSql = `
-- expects:
-- @code, @parentDocumentId,
-- @title, @note, @documentNumber, @documentDate, @revision,
-- @createdBy

if not exists (
  select 1
  from dbo.InstallationDocument d
  where d.atrium_installation_code = @code
    and d.document_id = @parentDocumentId
)
begin
  throw 50000, 'parent document not found', 1;
end;

declare @newId uniqueidentifier = newid();

insert into dbo.InstallationDocument (
  document_id,
  installation_id,
  atrium_installation_code,
  document_type_key,
  parent_document_id,
  relation_type,
  title,
  note,
  document_number,
  document_date,
  revision,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
)
select
  @newId,
  p.installation_id,
  p.atrium_installation_code,
  p.document_type_key,
  p.document_id,
  N'VERVANGING',
  coalesce(@title, p.title),
  coalesce(@note, p.note),
  coalesce(@documentNumber, p.document_number),
  coalesce(@documentDate, p.document_date),
  coalesce(@revision, p.revision),
  1,
  sysutcdatetime(),
  @createdBy,
  sysutcdatetime(),
  @createdBy
from dbo.InstallationDocument p
where p.atrium_installation_code = @code
  and p.document_id = @parentDocumentId;

select top 1
  d.document_id,
  d.installation_id,
  d.atrium_installation_code,
  d.document_type_key,
  d.parent_document_id,
  d.relation_type,
  d.title,
  d.note,
  d.document_number,
  d.document_date,
  d.revision,
  d.file_name,
  d.mime_type,
  d.file_size_bytes,
  d.uploaded_at,
  d.uploaded_by,
  d.file_last_modified_at,
  d.file_last_modified_by,
  d.storage_provider,
  d.storage_key,
  d.storage_url,
  d.is_active,
  d.created_at,
  d.created_by,
  d.updated_at,
  d.updated_by
from dbo.InstallationDocument d
where d.document_id = @newId;
`;

export const createInstallationDocumentAttachmentSql = `
-- expects:
-- @code, @parentDocumentId,
-- @title, @note, @documentNumber, @documentDate, @revision,
-- @createdBy

if not exists (
  select 1
  from dbo.InstallationDocument d
  where d.atrium_installation_code = @code
    and d.document_id = @parentDocumentId
)
begin
  throw 50000, 'parent document not found', 1;
end;

declare @newId uniqueidentifier = newid();

insert into dbo.InstallationDocument (
  document_id,
  installation_id,
  atrium_installation_code,
  document_type_key,
  parent_document_id,
  relation_type,
  title,
  note,
  document_number,
  document_date,
  revision,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
)
select
  @newId,
  p.installation_id,
  p.atrium_installation_code,
  p.document_type_key,
  p.document_id,
  N'BIJLAGE',
  @title,
  @note,
  @documentNumber,
  @documentDate,
  @revision,
  1,
  sysutcdatetime(),
  @createdBy,
  sysutcdatetime(),
  @createdBy
from dbo.InstallationDocument p
where p.atrium_installation_code = @code
  and p.document_id = @parentDocumentId;

select top 1
  d.document_id,
  d.installation_id,
  d.atrium_installation_code,
  d.document_type_key,
  d.parent_document_id,
  d.relation_type,
  d.title,
  d.note,
  d.document_number,
  d.document_date,
  d.revision,
  d.file_name,
  d.mime_type,
  d.file_size_bytes,
  d.uploaded_at,
  d.uploaded_by,
  d.file_last_modified_at,
  d.file_last_modified_by,
  d.storage_provider,
  d.storage_key,
  d.storage_url,
  d.is_active,
  d.created_at,
  d.created_by,
  d.updated_at,
  d.updated_by
from dbo.InstallationDocument d
where d.document_id = @newId;
`;

export const setInstallationDocumentFileSql = `
-- expects:
-- @code, @documentId,
-- @fileName, @mimeType, @fileSizeBytes,
-- @storageProvider, @storageKey, @storageUrl, @checksumSha256,
-- @updatedBy

if not exists (
  select 1
  from dbo.InstallationDocument d
  where d.atrium_installation_code = @code
    and d.document_id = @documentId
)
begin
  throw 50000, 'document not found', 1;
end;

if exists (
  select 1
  from dbo.InstallationDocument d
  where d.atrium_installation_code = @code
    and d.document_id = @documentId
    and d.storage_key is not null
)
begin
  throw 50000, 'document already has file', 1;
end;

update dbo.InstallationDocument
set
  file_name = @fileName,
  mime_type = @mimeType,
  file_size_bytes = @fileSizeBytes,
  storage_provider = @storageProvider,
  storage_key = @storageKey,
  storage_url = @storageUrl,
  checksum_sha256 = @checksumSha256,
  uploaded_at = sysutcdatetime(),
  uploaded_by = @updatedBy,
  file_last_modified_at = sysutcdatetime(),
  file_last_modified_by = @updatedBy,
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy
where atrium_installation_code = @code
  and document_id = @documentId;

select top 1
  d.document_id,
  d.installation_id,
  d.atrium_installation_code,
  d.document_type_key,
  d.parent_document_id,
  d.relation_type,
  d.title,
  d.note,
  d.document_number,
  d.document_date,
  d.revision,
  d.file_name,
  d.mime_type,
  d.file_size_bytes,
  d.uploaded_at,
  d.uploaded_by,
  d.file_last_modified_at,
  d.file_last_modified_by,
  d.storage_provider,
  d.storage_key,
  d.storage_url,
  d.checksum_sha256,
  d.is_active,
  d.created_at,
  d.created_by,
  d.updated_at,
  d.updated_by
from dbo.InstallationDocument d
where d.atrium_installation_code = @code
  and d.document_id = @documentId;
`;