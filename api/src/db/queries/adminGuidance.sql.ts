export const getAdminGuidanceCatalogSql = `
select
  fgi.guidance_id,
  fgi.title,
  fgi.body_markdown,
  fgi.video_url,
  fgi.image_url,
  fgi.image_caption,
  fgi.sort_order,
  fgi.is_active,
  fgi.created_at,
  fgi.created_by,
  fgi.updated_at,
  fgi.updated_by
from dbo.FormGuidanceItem fgi
order by fgi.sort_order asc, fgi.title asc;

select
  fgl.guidance_id,
  fgl.form_id,
  fd.code as form_code,
  fd.name as form_name,
  fgl.question_name,
  fgl.sort_order,
  fgl.created_at,
  fgl.created_by
from dbo.FormGuidanceLink fgl
join dbo.FormDefinition fd
  on fd.form_id = fgl.form_id
order by fd.sort_order asc, fd.name asc, fgl.question_name asc, fgl.sort_order asc;

select
  gma.guidance_media_id,
  gma.guidance_id,
  gma.media_kind,
  gma.source_kind,
  gma.external_url,
  gma.file_name,
  gma.mime_type,
  gma.file_size_bytes,
  gma.storage_provider,
  gma.storage_key,
  gma.storage_url,
  gma.caption,
  gma.is_active,
  gma.uploaded_at,
  gma.uploaded_by,
  gma.archived_at,
  gma.archived_by,
  gma.created_at,
  gma.created_by,
  gma.updated_at,
  gma.updated_by
from dbo.FormGuidanceMediaAsset gma
order by gma.guidance_id asc, gma.media_kind asc, gma.created_at desc;

select
  fd.form_id,
  fd.code,
  fd.name,
  fd.status,
  fd.sort_order,
  lvr.survey_json as active_survey_json
from dbo.FormDefinition fd
outer apply (
  select top 1
    fv.survey_json
  from dbo.FormDefinitionVersion fv
  where fv.form_id = fd.form_id
  order by fv.version desc
) lvr
where fd.status in ('A', 'M')
order by fd.sort_order asc, fd.name asc;
`;

export const createGuidanceItemSql = `
declare @guidanceId uniqueidentifier = newsequentialid();

insert into dbo.FormGuidanceItem (
  guidance_id,
  title,
  body_markdown,
  sort_order,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
)
values (
  @guidanceId,
  @title,
  @bodyMarkdown,
  @sortOrder,
  @isActive,
  sysutcdatetime(),
  @actor,
  sysutcdatetime(),
  @actor
);

select @guidanceId as guidance_id;
`;

export const updateGuidanceItemSql = `
update dbo.FormGuidanceItem
set
  title = @title,
  body_markdown = @bodyMarkdown,
  sort_order = @sortOrder,
  is_active = @isActive,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where guidance_id = @guidanceId;

if @@rowcount = 0
begin
  throw 50000, 'guidance not found', 1;
end;

select @guidanceId as guidance_id;
`;

export const replaceGuidanceLinksSql = `
if not exists (
  select 1
  from dbo.FormGuidanceItem
  where guidance_id = @guidanceId
)
begin
  throw 50000, 'guidance not found', 1;
end;

if isjson(@linksJson) <> 1
begin
  throw 50000, 'linksJson must be valid json', 1;
end;

begin tran;

delete from dbo.FormGuidanceLink
where guidance_id = @guidanceId;

;with src as (
  select
    try_convert(uniqueidentifier, json_value(j.value, '$.form_id')) as form_id,
    nullif(ltrim(rtrim(convert(nvarchar(200), json_value(j.value, '$.question_name')))), N'') as question_name,
    isnull(try_convert(int, json_value(j.value, '$.sort_order')), 0) as sort_order
  from openjson(@linksJson) j
)
insert into dbo.FormGuidanceLink (
  guidance_id,
  form_id,
  question_name,
  sort_order,
  created_at,
  created_by
)
select
  @guidanceId,
  src.form_id,
  src.question_name,
  src.sort_order,
  sysutcdatetime(),
  @actor
from src
where src.form_id is not null
  and src.question_name is not null
  and exists (
    select 1
    from dbo.FormDefinition fd
    where fd.form_id = src.form_id
  );

commit tran;

select @guidanceId as guidance_id;
`;

export const createGuidanceMediaAssetSql = `
if not exists (
  select 1
  from dbo.FormGuidanceItem
  where guidance_id = @guidanceId
)
begin
  throw 50000, 'guidance not found', 1;
end;

begin tran;

if @isActive = 1
begin
  update dbo.FormGuidanceMediaAsset
  set
    is_active = 0,
    archived_at = sysutcdatetime(),
    archived_by = @actor,
    updated_at = sysutcdatetime(),
    updated_by = @actor
  where guidance_id = @guidanceId
    and media_kind = @mediaKind
    and is_active = 1;
end;

insert into dbo.FormGuidanceMediaAsset (
  guidance_media_id,
  guidance_id,
  media_kind,
  source_kind,
  external_url,
  file_name,
  mime_type,
  file_size_bytes,
  storage_provider,
  storage_key,
  storage_url,
  caption,
  is_active,
  uploaded_at,
  uploaded_by,
  created_at,
  created_by,
  updated_at,
  updated_by
)
values (
  @guidanceMediaId,
  @guidanceId,
  @mediaKind,
  @sourceKind,
  @externalUrl,
  @fileName,
  @mimeType,
  @fileSizeBytes,
  @storageProvider,
  @storageKey,
  @storageUrl,
  @caption,
  @isActive,
  sysutcdatetime(),
  @actor,
  sysutcdatetime(),
  @actor,
  sysutcdatetime(),
  @actor
);

commit tran;

select @guidanceMediaId as guidance_media_id;
`;

export const getGuidanceMediaAssetContextSql = `
select top 1
  gma.guidance_media_id,
  gma.guidance_id,
  gma.media_kind,
  gma.source_kind,
  gma.external_url,
  gma.file_name,
  gma.mime_type,
  gma.file_size_bytes,
  gma.storage_provider,
  gma.storage_key,
  gma.storage_url,
  gma.caption,
  gma.is_active,
  gma.uploaded_at,
  gma.uploaded_by,
  gma.archived_at,
  gma.archived_by,
  gma.created_at,
  gma.created_by,
  gma.updated_at,
  gma.updated_by
from dbo.FormGuidanceMediaAsset gma
where gma.guidance_id = @guidanceId
  and gma.guidance_media_id = @guidanceMediaId;
`;

export const activateGuidanceMediaAssetSql = `
if not exists (
  select 1
  from dbo.FormGuidanceMediaAsset
  where guidance_id = @guidanceId
    and guidance_media_id = @guidanceMediaId
)
begin
  throw 50000, 'guidance media not found', 1;
end;

declare @mediaKind nvarchar(20);
select top 1 @mediaKind = media_kind
from dbo.FormGuidanceMediaAsset
where guidance_id = @guidanceId
  and guidance_media_id = @guidanceMediaId;

begin tran;

update dbo.FormGuidanceMediaAsset
set
  is_active = 0,
  archived_at = sysutcdatetime(),
  archived_by = @actor,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where guidance_id = @guidanceId
  and media_kind = @mediaKind
  and is_active = 1
  and guidance_media_id <> @guidanceMediaId;

update dbo.FormGuidanceMediaAsset
set
  is_active = 1,
  archived_at = null,
  archived_by = null,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where guidance_id = @guidanceId
  and guidance_media_id = @guidanceMediaId;

commit tran;

select @guidanceMediaId as guidance_media_id;
`;

export const archiveGuidanceMediaAssetSql = `
update dbo.FormGuidanceMediaAsset
set
  is_active = 0,
  archived_at = sysutcdatetime(),
  archived_by = @actor,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where guidance_id = @guidanceId
  and guidance_media_id = @guidanceMediaId;

if @@rowcount = 0
begin
  throw 50000, 'guidance media not found', 1;
end;

select @guidanceMediaId as guidance_media_id;
`;
