export const getInstallationSoftwareReadSql = `
-- expects: @code

declare @installationTypeKey nvarchar(50) = null;

select top 1
  @installationTypeKey = i.installation_type_key
from dbo.Installation i
where i.atrium_installation_code = @code;

select top 1
  a.installatie_code as atrium_installation_code,
  i.installation_id,
  i.installation_type_key,
  it.display_name as installation_type_name,
  a.software_versie,
  a.software_gebruikersnaam
from dbo.AtriumInstallationBase a
left join dbo.Installation i
  on i.atrium_installation_code = a.installatie_code
left join dbo.InstallationType it
  on it.installation_type_key = i.installation_type_key
where a.installatie_code = @code;

select
  p.portal_key,
  p.display_name,
  p.notes,
  p.installation_url_template,
  p.sort_order,
  p.is_active
from dbo.ManagementPortalDefinition p
where p.is_active = 1
and (
  not exists (
    select 1
    from dbo.ManagementPortalInstallationType x
    where x.portal_key = p.portal_key
  )
  or @installationTypeKey is null
  or exists (
    select 1
    from dbo.ManagementPortalInstallationType x
    where x.portal_key = p.portal_key
      and x.installation_type_key = @installationTypeKey
  )
)
order by
  case when p.sort_order is null then 999999 else p.sort_order end,
  p.display_name,
  p.portal_key;

select top 1
  mp.installation_management_portal_id,
  mp.portal_key,
  p.display_name as portal_display_name,
  p.installation_url_template,
  mp.portal_installation_name,
  mp.portal_installation_reference,
  mp.portal_installation_url,
  mp.note,
  mp.is_active,
  mp.created_at,
  mp.created_by,
  mp.updated_at,
  mp.updated_by
from dbo.InstallationManagementPortal mp
join dbo.ManagementPortalDefinition p
  on p.portal_key = mp.portal_key
where mp.atrium_installation_code = @code
order by
  mp.created_at desc;

select top 1
  ps.installation_id,
  ps.atrium_installation_code,
  ps.presence_mode,
  ps.presence_note,
  ps.created_at,
  ps.created_by,
  ps.updated_at,
  ps.updated_by
from dbo.InstallationProgrammingState ps
where ps.atrium_installation_code = @code;

select
  p.programming_id,
  p.parent_programming_id,
  p.version_label,
  p.title,
  p.note,
  p.programming_date,
  p.file_name,
  p.mime_type,
  p.file_size_bytes,
  p.uploaded_at,
  p.uploaded_by,
  p.file_last_modified_at,
  p.file_last_modified_by,
  p.storage_provider,
  p.storage_key,
  p.storage_url,
  p.checksum_sha256,
  p.is_active,
  p.created_at,
  p.created_by,
  p.updated_at,
  p.updated_by
from dbo.InstallationProgramming p
where p.atrium_installation_code = @code
order by
  case when p.is_active = 1 then 0 else 1 end,
  p.created_at desc,
  p.programming_id desc;
`;

export const upsertInstallationSoftwareSql = `
-- expects:
-- @code,
-- @portalKey, @portalInstallationName, @portalInstallationReference, @portalInstallationUrl, @portalNote,
-- @presenceMode, @presenceNote,
-- @updatedBy

if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

declare @installationId uniqueidentifier;
declare @installationTypeKey nvarchar(50);

select top 1
  @installationId = i.installation_id,
  @installationTypeKey = i.installation_type_key
from dbo.Installation i
where i.atrium_installation_code = @code;

if @installationId is null
begin
  throw 50000, 'installation not found', 1;
end;

if @presenceMode is null
begin
  set @presenceMode = N'NONE';
end;

if @presenceMode not in (N'NONE', N'FILE', N'MANUAL')
begin
  throw 50000, 'invalid programming presence mode', 1;
end;

if @portalKey is not null
and not exists (
  select 1
  from dbo.ManagementPortalDefinition p
  where p.portal_key = @portalKey
    and p.is_active = 1
)
begin
  throw 50000, 'management portal invalid', 1;
end;

if @portalKey is not null
and @installationTypeKey is not null
and exists (
  select 1
  from dbo.ManagementPortalInstallationType x
  where x.portal_key = @portalKey
)
and not exists (
  select 1
  from dbo.ManagementPortalInstallationType x
  where x.portal_key = @portalKey
    and x.installation_type_key = @installationTypeKey
)
begin
  throw 50000, 'management portal not applicable', 1;
end;

merge dbo.InstallationProgrammingState as tgt
using (
  select
    @installationId as installation_id,
    @code as atrium_installation_code,
    @presenceMode as presence_mode,
    @presenceNote as presence_note
) as src
on tgt.atrium_installation_code = src.atrium_installation_code
when matched then update set
  tgt.installation_id = src.installation_id,
  tgt.presence_mode = src.presence_mode,
  tgt.presence_note = src.presence_note,
  tgt.updated_at = sysutcdatetime(),
  tgt.updated_by = @updatedBy
when not matched then insert (
  installation_id,
  atrium_installation_code,
  presence_mode,
  presence_note,
  created_at,
  created_by,
  updated_at,
  updated_by
) values (
  src.installation_id,
  src.atrium_installation_code,
  src.presence_mode,
  src.presence_note,
  sysutcdatetime(),
  @updatedBy,
  sysutcdatetime(),
  @updatedBy
);

if @portalKey is null
begin
  delete from dbo.InstallationManagementPortal
  where atrium_installation_code = @code;
end;
else
begin
  merge dbo.InstallationManagementPortal as tgt
  using (
    select
      @installationId as installation_id,
      @code as atrium_installation_code,
      @portalKey as portal_key,
      @portalInstallationName as portal_installation_name,
      @portalInstallationReference as portal_installation_reference,
      @portalInstallationUrl as portal_installation_url,
      @portalNote as note
  ) as src
  on tgt.atrium_installation_code = src.atrium_installation_code
  when matched then update set
    tgt.installation_id = src.installation_id,
    tgt.portal_key = src.portal_key,
    tgt.portal_installation_name = src.portal_installation_name,
    tgt.portal_installation_reference = src.portal_installation_reference,
    tgt.portal_installation_url = src.portal_installation_url,
    tgt.note = src.note,
    tgt.is_active = 1,
    tgt.updated_at = sysutcdatetime(),
    tgt.updated_by = @updatedBy
  when not matched then insert (
    installation_id,
    atrium_installation_code,
    portal_key,
    portal_installation_name,
    portal_installation_reference,
    portal_installation_url,
    note,
    is_active,
    created_at,
    created_by,
    updated_at,
    updated_by
  ) values (
    src.installation_id,
    src.atrium_installation_code,
    src.portal_key,
    src.portal_installation_name,
    src.portal_installation_reference,
    src.portal_installation_url,
    src.note,
    1,
    sysutcdatetime(),
    @updatedBy,
    sysutcdatetime(),
    @updatedBy
  );
end;

select cast(1 as bit) as ok;
`;

export const createInstallationProgrammingSql = `
-- expects:
-- @code, @parentProgrammingId, @versionLabel, @title, @note, @programmingDate, @createdBy

if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

declare @installationId uniqueidentifier;

select top 1
  @installationId = i.installation_id
from dbo.Installation i
where i.atrium_installation_code = @code;

if @installationId is null
begin
  throw 50000, 'installation not found', 1;
end;

if @parentProgrammingId is not null
and not exists (
  select 1
  from dbo.InstallationProgramming p
  where p.atrium_installation_code = @code
    and p.programming_id = @parentProgrammingId
)
begin
  throw 50000, 'parent programming not found', 1;
end;

declare @newId uniqueidentifier = newid();

insert into dbo.InstallationProgramming (
  programming_id,
  installation_id,
  atrium_installation_code,
  parent_programming_id,
  version_label,
  title,
  note,
  programming_date,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
)
values (
  @newId,
  @installationId,
  @code,
  @parentProgrammingId,
  @versionLabel,
  @title,
  @note,
  @programmingDate,
  1,
  sysutcdatetime(),
  @createdBy,
  sysutcdatetime(),
  @createdBy
);

merge dbo.InstallationProgrammingState as tgt
using (
  select
    @installationId as installation_id,
    @code as atrium_installation_code
) as src
on tgt.atrium_installation_code = src.atrium_installation_code
when matched then update set
  tgt.installation_id = src.installation_id,
  tgt.presence_mode = N'FILE',
  tgt.updated_at = sysutcdatetime(),
  tgt.updated_by = @createdBy
when not matched then insert (
  installation_id,
  atrium_installation_code,
  presence_mode,
  presence_note,
  created_at,
  created_by,
  updated_at,
  updated_by
) values (
  src.installation_id,
  src.atrium_installation_code,
  N'FILE',
  null,
  sysutcdatetime(),
  @createdBy,
  sysutcdatetime(),
  @createdBy
);

select top 1
  p.programming_id,
  p.parent_programming_id,
  p.version_label,
  p.title,
  p.note,
  p.programming_date,
  p.file_name,
  p.mime_type,
  p.file_size_bytes,
  p.uploaded_at,
  p.uploaded_by,
  p.file_last_modified_at,
  p.file_last_modified_by,
  p.storage_provider,
  p.storage_key,
  p.storage_url,
  p.checksum_sha256,
  p.is_active,
  p.created_at,
  p.created_by,
  p.updated_at,
  p.updated_by
from dbo.InstallationProgramming p
where p.programming_id = @newId;
`;

export const getInstallationProgrammingContextSql = `
-- expects: @code, @programmingId

select top 1
  p.programming_id,
  p.installation_id,
  p.atrium_installation_code,
  p.parent_programming_id,
  p.version_label,
  p.title,
  p.note,
  p.programming_date,
  p.file_name,
  p.mime_type,
  p.file_size_bytes,
  p.uploaded_at,
  p.uploaded_by,
  p.file_last_modified_at,
  p.file_last_modified_by,
  p.storage_provider,
  p.storage_key,
  p.storage_url,
  p.checksum_sha256,
  p.is_active,
  p.created_at,
  p.created_by,
  p.updated_at,
  p.updated_by
from dbo.InstallationProgramming p
where p.atrium_installation_code = @code
  and p.programming_id = @programmingId;
`;

export const setInstallationProgrammingFileSql = `
-- expects:
-- @code, @programmingId,
-- @fileName, @mimeType, @fileSizeBytes,
-- @storageProvider, @storageKey, @storageUrl, @checksumSha256,
-- @updatedBy

if not exists (
  select 1
  from dbo.InstallationProgramming p
  where p.atrium_installation_code = @code
    and p.programming_id = @programmingId
)
begin
  throw 50000, 'programming not found', 1;
end;

update p
set
  p.file_name = @fileName,
  p.mime_type = @mimeType,
  p.file_size_bytes = @fileSizeBytes,
  p.uploaded_at = sysutcdatetime(),
  p.uploaded_by = @updatedBy,
  p.file_last_modified_at = sysutcdatetime(),
  p.file_last_modified_by = @updatedBy,
  p.storage_provider = @storageProvider,
  p.storage_key = @storageKey,
  p.storage_url = @storageUrl,
  p.checksum_sha256 = @checksumSha256,
  p.updated_at = sysutcdatetime(),
  p.updated_by = @updatedBy
from dbo.InstallationProgramming p
where p.atrium_installation_code = @code
  and p.programming_id = @programmingId;

select top 1
  p.programming_id,
  p.parent_programming_id,
  p.version_label,
  p.title,
  p.note,
  p.programming_date,
  p.file_name,
  p.mime_type,
  p.file_size_bytes,
  p.uploaded_at,
  p.uploaded_by,
  p.file_last_modified_at,
  p.file_last_modified_by,
  p.storage_provider,
  p.storage_key,
  p.storage_url,
  p.checksum_sha256,
  p.is_active,
  p.created_at,
  p.created_by,
  p.updated_at,
  p.updated_by
from dbo.InstallationProgramming p
where p.programming_id = @programmingId;
`;

export const archiveInstallationProgrammingSql = `
-- expects: @code, @programmingId, @updatedBy

if not exists (
  select 1
  from dbo.InstallationProgramming p
  where p.atrium_installation_code = @code
    and p.programming_id = @programmingId
)
begin
  throw 50000, 'programming not found', 1;
end;

update p
set
  p.is_active = 0,
  p.updated_at = sysutcdatetime(),
  p.updated_by = @updatedBy
from dbo.InstallationProgramming p
where p.atrium_installation_code = @code
  and p.programming_id = @programmingId;

select cast(1 as bit) as ok;
`;
