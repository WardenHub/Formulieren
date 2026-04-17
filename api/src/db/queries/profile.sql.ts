// /api/src/db/queries/profile.sql.ts

export const ensureUserProfileSql = `
-- expects:
--   @userObjectId nvarchar(200)
--   @emailSnapshot nvarchar(320) nullable
--   @displayNameSnapshot nvarchar(250) nullable
--   @actor nvarchar(200)

if not exists (
  select 1
  from dbo.UserProfile
  where user_object_id = @userObjectId
)
begin
  insert into dbo.UserProfile (
    user_object_id,
    email_snapshot,
    display_name_snapshot,
    preferred_display_name,
    profile_note,
    appearance_preference,
    avatar_source_preference,
    signature_source_preference,
    created_at,
    created_by,
    updated_at,
    updated_by
  )
  values (
    @userObjectId,
    nullif(ltrim(rtrim(@emailSnapshot)), N''),
    nullif(ltrim(rtrim(@displayNameSnapshot)), N''),
    null,
    null,
    N'system',
    N'uploaded',
    N'uploaded',
    sysutcdatetime(),
    @actor,
    sysutcdatetime(),
    @actor
  );
end
else
begin
  update dbo.UserProfile
  set
    email_snapshot = coalesce(nullif(ltrim(rtrim(@emailSnapshot)), N''), email_snapshot),
    display_name_snapshot = coalesce(nullif(ltrim(rtrim(@displayNameSnapshot)), N''), display_name_snapshot),
    updated_at = sysutcdatetime(),
    updated_by = @actor
  where user_object_id = @userObjectId;
end;

select top 1
  up.user_object_id,
  up.email_snapshot,
  up.display_name_snapshot,
  up.preferred_display_name,
  up.profile_note,
  up.appearance_preference,
  up.avatar_source_preference,
  up.signature_source_preference,
  up.created_at,
  up.created_by,
  up.updated_at,
  up.updated_by
from dbo.UserProfile up
where up.user_object_id = @userObjectId;
`;

export const getUserProfileSql = `
select top 1
  up.user_object_id,
  up.email_snapshot,
  up.display_name_snapshot,
  up.preferred_display_name,
  up.profile_note,
  up.appearance_preference,
  up.avatar_source_preference,
  up.signature_source_preference,
  up.created_at,
  up.created_by,
  up.updated_at,
  up.updated_by
from dbo.UserProfile up
where up.user_object_id = @userObjectId;
`;

export const getActiveUserProfileAvatarSql = `
select top 1
  a.avatar_id,
  a.user_object_id,
  a.file_name,
  a.mime_type,
  a.file_size_bytes,
  a.uploaded_at,
  a.uploaded_by,
  a.file_last_modified_at,
  a.file_last_modified_by,
  a.storage_provider,
  a.storage_key,
  a.storage_url,
  a.checksum_sha256,
  a.is_active,
  a.created_at,
  a.created_by,
  a.updated_at,
  a.updated_by
from dbo.UserProfileAvatar a
where a.user_object_id = @userObjectId
  and isnull(a.is_active, 1) = 1
order by a.created_at desc, a.avatar_id desc;
`;

export const getActiveUserProfileSignatureSql = `
select top 1
  s.signature_id,
  s.user_object_id,
  s.file_name,
  s.mime_type,
  s.file_size_bytes,
  s.uploaded_at,
  s.uploaded_by,
  s.file_last_modified_at,
  s.file_last_modified_by,
  s.storage_provider,
  s.storage_key,
  s.storage_url,
  s.checksum_sha256,
  s.image_width_px,
  s.image_height_px,
  s.is_active,
  s.created_at,
  s.created_by,
  s.updated_at,
  s.updated_by
from dbo.UserProfileSignature s
where s.user_object_id = @userObjectId
  and isnull(s.is_active, 1) = 1
order by s.created_at desc, s.signature_id desc;
`;

export const updateUserProfileSql = `
update dbo.UserProfile
set
  preferred_display_name = nullif(ltrim(rtrim(@preferredDisplayName)), N''),
  profile_note = nullif(ltrim(rtrim(@profileNote)), N''),
  appearance_preference = @appearancePreference,
  avatar_source_preference = @avatarSourcePreference,
  signature_source_preference = @signatureSourcePreference,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where user_object_id = @userObjectId;

select top 1
  up.user_object_id,
  up.email_snapshot,
  up.display_name_snapshot,
  up.preferred_display_name,
  up.profile_note,
  up.appearance_preference,
  up.avatar_source_preference,
  up.signature_source_preference,
  up.created_at,
  up.created_by,
  up.updated_at,
  up.updated_by
from dbo.UserProfile up
where up.user_object_id = @userObjectId;
`;

export const createUserProfileAvatarPlaceholderSql = `
update dbo.UserProfileAvatar
set
  is_active = 0,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where user_object_id = @userObjectId
  and isnull(is_active, 1) = 1;

declare @avatarId uniqueidentifier = newid()

insert into dbo.UserProfileAvatar (
  avatar_id,
  user_object_id,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
)
values (
  @avatarId,
  @userObjectId,
  1,
  sysutcdatetime(),
  @actor,
  sysutcdatetime(),
  @actor
);

select top 1
  avatar_id,
  user_object_id,
  file_name,
  mime_type,
  file_size_bytes,
  uploaded_at,
  uploaded_by,
  file_last_modified_at,
  file_last_modified_by,
  storage_provider,
  storage_key,
  storage_url,
  checksum_sha256,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
from dbo.UserProfileAvatar
where avatar_id = @avatarId;
`;

export const setUserProfileAvatarFileSql = `
update dbo.UserProfileAvatar
set
  file_name = @fileName,
  mime_type = @mimeType,
  file_size_bytes = @fileSizeBytes,
  uploaded_at = sysutcdatetime(),
  uploaded_by = @actor,
  file_last_modified_at = sysutcdatetime(),
  file_last_modified_by = @actor,
  storage_provider = @storageProvider,
  storage_key = @storageKey,
  storage_url = @storageUrl,
  checksum_sha256 = @checksumSha256,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where avatar_id = @avatarId
  and user_object_id = @userObjectId;

select top 1
  avatar_id,
  user_object_id,
  file_name,
  mime_type,
  file_size_bytes,
  uploaded_at,
  uploaded_by,
  file_last_modified_at,
  file_last_modified_by,
  storage_provider,
  storage_key,
  storage_url,
  checksum_sha256,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
from dbo.UserProfileAvatar
where avatar_id = @avatarId
  and user_object_id = @userObjectId;
`;

export const deactivateActiveUserProfileAvatarSql = `
update dbo.UserProfileAvatar
set
  is_active = 0,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where user_object_id = @userObjectId
  and isnull(is_active, 1) = 1;
`;

export const createUserProfileSignaturePlaceholderSql = `
update dbo.UserProfileSignature
set
  is_active = 0,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where user_object_id = @userObjectId
  and isnull(is_active, 1) = 1;

declare @signatureId uniqueidentifier = newid()

insert into dbo.UserProfileSignature (
  signature_id,
  user_object_id,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
)
values (
  @signatureId,
  @userObjectId,
  1,
  sysutcdatetime(),
  @actor,
  sysutcdatetime(),
  @actor
);

select top 1
  signature_id,
  user_object_id,
  file_name,
  mime_type,
  file_size_bytes,
  uploaded_at,
  uploaded_by,
  file_last_modified_at,
  file_last_modified_by,
  storage_provider,
  storage_key,
  storage_url,
  checksum_sha256,
  image_width_px,
  image_height_px,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
from dbo.UserProfileSignature
where signature_id = @signatureId;
`;

export const setUserProfileSignatureFileSql = `
update dbo.UserProfileSignature
set
  file_name = @fileName,
  mime_type = @mimeType,
  file_size_bytes = @fileSizeBytes,
  uploaded_at = sysutcdatetime(),
  uploaded_by = @actor,
  file_last_modified_at = sysutcdatetime(),
  file_last_modified_by = @actor,
  storage_provider = @storageProvider,
  storage_key = @storageKey,
  storage_url = @storageUrl,
  checksum_sha256 = @checksumSha256,
  image_width_px = @imageWidthPx,
  image_height_px = @imageHeightPx,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where signature_id = @signatureId
  and user_object_id = @userObjectId;

select top 1
  signature_id,
  user_object_id,
  file_name,
  mime_type,
  file_size_bytes,
  uploaded_at,
  uploaded_by,
  file_last_modified_at,
  file_last_modified_by,
  storage_provider,
  storage_key,
  storage_url,
  checksum_sha256,
  image_width_px,
  image_height_px,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
from dbo.UserProfileSignature
where signature_id = @signatureId
  and user_object_id = @userObjectId;
`;

export const deactivateActiveUserProfileSignatureSql = `
update dbo.UserProfileSignature
set
  is_active = 0,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where user_object_id = @userObjectId
  and isnull(is_active, 1) = 1;
`;

export const getUserProfileStatsSql = `
;with form_stats as (
  select
    count(*) as total_forms,
    sum(case when status = N'CONCEPT' then 1 else 0 end) as concept_count,
    sum(case when status = N'INGEDIEND' then 1 else 0 end) as ingediend_count,
    sum(case when status = N'IN_BEHANDELING' then 1 else 0 end) as in_behandeling_count,
    sum(case when status = N'AFGEHANDELD' then 1 else 0 end) as afgehandeld_count,
    sum(case when status = N'INGETROKKEN' then 1 else 0 end) as ingetrokken_count
  from dbo.FormInstance
  where
    created_by = @actorEmail
    or created_by = @actorName
),
follow_up_stats as (
  select
    count(*) as total_follow_ups,
    sum(case when status = N'OPEN' then 1 else 0 end) as open_count,
    sum(case when status = N'WACHTENOPDERDEN' then 1 else 0 end) as waiting_count,
    sum(case when status = N'AFGEHANDELD' then 1 else 0 end) as done_count,
    sum(case when status = N'AFGEWEZEN' then 1 else 0 end) as rejected_count,
    sum(case when status = N'VERVALLEN' then 1 else 0 end) as expired_count,
    sum(case when status = N'INFORMATIEF' then 1 else 0 end) as informative_count
  from dbo.FormFollowUpAction fua
  where exists (
    select 1
    from dbo.FormInstance fi
    where fi.form_instance_id = fua.form_instance_id
      and (
        fi.created_by = @actorEmail
        or fi.created_by = @actorName
      )
  )
)
select
  fs.total_forms,
  fs.concept_count,
  fs.ingediend_count,
  fs.in_behandeling_count,
  fs.afgehandeld_count,
  fs.ingetrokken_count,
  fu.total_follow_ups,
  fu.open_count,
  fu.waiting_count,
  fu.done_count,
  fu.rejected_count,
  fu.expired_count,
  fu.informative_count
from form_stats fs
cross join follow_up_stats fu;
`;