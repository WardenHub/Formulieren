// /api/src/db/queries/installations.sql.ts
// =========================================================
// installations queries; aligned to tabel-definities.sql
// =========================================================

export const getInstallationSql = `
select top 1
  i.installation_id,
  a.installatie_code as atrium_installation_code,
  i.installation_type_key,
  it.display_name as installation_type_name,
  i.created_at,
  i.created_by,
  coalesce(i.is_active, cast(1 as bit)) as is_active,
  a.*
from dbo.AtriumInstallationBase a
left join dbo.Installation i
  on i.atrium_installation_code = a.installatie_code
left join dbo.InstallationType it
  on it.installation_type_key = i.installation_type_key
where a.installatie_code = @code;
`;



// ------------------------------
// catalog; sections
// ------------------------------
export const getCatalogSectionsSql = `
select
  fs.sectie_key as section_key,
  fs.naam as section_name,
  fs.omschrijving as section_description,
  fs.sort_order
from dbo.FormulierSectie fs
order by
  case when fs.sort_order is null then 999999 else fs.sort_order end,
  fs.sectie_key
`;

// ------------------------------
// catalog; external fields (read-only)
// note; ExternalFieldDefinition has no data_type; we default to 'string'
// ------------------------------
export const getCatalogExternalFieldsSql = `
-- external fields
select
  efd.field_key,
  efd.sectie_key as section_key,
  efd.display_name as label,
  cast('string' as nvarchar(20)) as data_type,
  cast(0 as bit) as is_editable,
  cast('external' as nvarchar(20)) as source,
  efd.sort_order,
  efd.source_type,
  efd.fabric_table,
  efd.fabric_column,
  efd.notes,
  efd.is_active
from dbo.ExternalFieldDefinition efd
order by
  case when efd.sectie_key is null then 1 else 0 end,
  efd.sectie_key,
  case when efd.sort_order is null then 999999 else efd.sort_order end,
  efd.display_name,
  efd.field_key;

`;


// ------------------------------
// catalog; custom fields (editable)
// note; InstallationCustomFieldDefinition has data_type
// ------------------------------
export const getCatalogCustomFieldsSql = `
-- expects: @installationTypeKey (nullable)

select
  icfd.field_key,
  icfd.sectie_key as section_key,
  icfd.display_name as label,
  icfd.data_type,
  cast(1 as bit) as is_editable,
  cast('custom' as nvarchar(20)) as source,
  icfd.sort_order,
  icfd.is_active
from dbo.InstallationCustomFieldDefinition icfd
where icfd.is_active = 1
and (
  -- geen type-koppelingen => altijd zichtbaar
  not exists (
    select 1
    from dbo.InstallationCustomFieldDefinitionType x
    where x.field_key = icfd.field_key
  )
  -- wel type-koppelingen => alleen zichtbaar bij match
  or (
    @installationTypeKey is not null
    and exists (
      select 1
      from dbo.InstallationCustomFieldDefinitionType x
      where x.field_key = icfd.field_key
        and x.installation_type_key = @installationTypeKey
    )
  )
)
order by
  case when icfd.sectie_key is null then 1 else 0 end,
  icfd.sectie_key,
  case when icfd.sort_order is null then 999999 else icfd.sort_order end,
  icfd.display_name,
  icfd.field_key;
`;



// ------------------------------
// catalog; document types
// note; no is_required in your table; we default to 0
// ------------------------------
export const getCatalogDocumentTypesSql = `
select
  dt.document_type_key,
  dt.naam as document_type_name,
  dt.sectie_key as section_key,
  dt.sort_order,
  dt.is_active,
  cast(0 as bit) as is_required
from dbo.DocumentType dt
order by
  case when dt.sort_order is null then 999999 else dt.sort_order end,
  dt.document_type_key
`;

// ------------------------------
// custom values; installation-bound
// note; values table has no value_datetime; and value_json exists
// ------------------------------
export const getCustomValuesSql = `
select
  v.field_key,
  v.value_string,
  v.value_number,
  v.value_bool,
  v.value_date,
  v.value_json,
  v.updated_at,
  v.updated_by
from dbo.InstallationCustomFieldValue v
join dbo.InstallationCustomFieldDefinition d
  on d.field_key = v.field_key
where v.atrium_installation_code = @code
order by
  case when d.sectie_key is null then 1 else 0 end,
  d.sectie_key,
  case when d.sort_order is null then 999999 else d.sort_order end,
  v.field_key
`;


// ------------------------------
// upsert custom values
// note; PK is (installation_id, field_key)
// note; keep atrium_installation_code consistent
// ------------------------------

export const upsertCustomValuesSql = `
-- expects params: @code, @valuesJson, @updatedBy

declare @installation_id uniqueidentifier;
declare @atrium_installation_code nvarchar(64);

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

merge dbo.InstallationCustomFieldValue as tgt
using (
  select
    @installation_id as installation_id,
    @atrium_installation_code as atrium_installation_code,
    src.field_key,
    src.value_string,
    src.value_number,
    src.value_bool,
    src.value_date,
    src.value_json
  from openjson(@valuesJson)
  with (
    field_key nvarchar(200) '$.field_key',
    value_string nvarchar(max) '$.value_string',
    value_number decimal(18,6) '$.value_number',
    value_bool bit '$.value_bool',
    value_date date '$.value_date',
    value_json nvarchar(max) '$.value_json'
  ) src
  join dbo.InstallationCustomFieldDefinition d
    on d.field_key = src.field_key
  where d.is_active = 1
) as s
on tgt.installation_id = s.installation_id
and tgt.field_key = s.field_key
when matched then update set
  tgt.atrium_installation_code = s.atrium_installation_code,
  tgt.value_string = s.value_string,
  tgt.value_number = s.value_number,
  tgt.value_bool = s.value_bool,
  tgt.value_date = s.value_date,
  tgt.value_json = s.value_json,
  tgt.updated_at = sysutcdatetime(),
  tgt.updated_by = @updatedBy
when not matched then insert (
  installation_id,
  atrium_installation_code,
  field_key,
  value_string,
  value_number,
  value_bool,
  value_date,
  value_json,
  updated_at,
  updated_by
) values (
  s.installation_id,
  s.atrium_installation_code,
  s.field_key,
  s.value_string,
  s.value_number,
  s.value_bool,
  s.value_date,
  s.value_json,
  sysutcdatetime(),
  @updatedBy
)
output $action into @actions;

select
  (select count(*) from @actions) as affected_rows,
  (select count(*) from @actions where action = 'INSERT') as inserted_rows,
  (select count(*) from @actions where action = 'UPDATE') as updated_rows;
`;

export const getInstallationDocumentsSql = `
select
  dt.document_type_key,
  dt.naam as document_type_name,
  dt.sectie_key as section_key,
  dt.sort_order,
  dt.is_active as document_type_is_active,

  d.document_id,
  d.title,
  d.document_number,
  d.document_date,
  d.revision,
  d.file_name,
  d.mime_type,
  d.file_size_bytes,
  d.storage_provider,
  d.storage_key,
  d.storage_url,
  d.checksum_sha256,
  d.source_system,
  d.source_reference,
  d.is_active as document_is_active,
  d.created_at,
  d.created_by
from dbo.DocumentType dt
left join dbo.InstallationDocument d
  on d.document_type_key = dt.document_type_key
  and d.atrium_installation_code = @code
where dt.is_active = 1
order by
  case when dt.sort_order is null then 999999 else dt.sort_order end,
  dt.document_type_key,
  d.created_at desc
`;

export const upsertInstallationDocumentsSql = `
-- expects params: @code, @documentsJson, @updatedBy

declare @installation_id uniqueidentifier;
declare @atrium_installation_code nvarchar(64);

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
    isnull(src.document_id, newid()) as document_id,
    @installation_id as installation_id,
    @atrium_installation_code as atrium_installation_code,

    src.document_type_key,
    src.title,
    src.document_number,
    src.document_date,
    src.revision,
    src.file_name,
    src.mime_type,
    src.file_size_bytes,
    src.storage_provider,
    src.storage_key,
    src.storage_url,
    src.checksum_sha256,
    src.source_system,
    src.source_reference,
    src.is_active
  from openjson(@documentsJson)
  with (
    document_id uniqueidentifier '$.document_id',
    document_type_key nvarchar(64) '$.document_type_key',

    title nvarchar(400) '$.title',
    document_number nvarchar(100) '$.document_number',
    document_date date '$.document_date',
    revision nvarchar(50) '$.revision',

    file_name nvarchar(260) '$.file_name',
    mime_type nvarchar(120) '$.mime_type',
    file_size_bytes bigint '$.file_size_bytes',

    storage_provider nvarchar(64) '$.storage_provider',
    storage_key nvarchar(1024) '$.storage_key',
    storage_url nvarchar(2048) '$.storage_url',
    checksum_sha256 nvarchar(128) '$.checksum_sha256',

    source_system nvarchar(64) '$.source_system',
    source_reference nvarchar(256) '$.source_reference',

    is_active bit '$.is_active'
  ) src
  join dbo.DocumentType dt
    on dt.document_type_key = src.document_type_key
   and dt.is_active = 1
) as s
on tgt.document_id = s.document_id
when matched then update set
  tgt.installation_id = s.installation_id,
  tgt.atrium_installation_code = s.atrium_installation_code,
  tgt.document_type_key = s.document_type_key,

  tgt.title = s.title,
  tgt.document_number = s.document_number,
  tgt.document_date = s.document_date,
  tgt.revision = s.revision,

  tgt.file_name = s.file_name,
  tgt.mime_type = s.mime_type,
  tgt.file_size_bytes = s.file_size_bytes,

  tgt.storage_provider = s.storage_provider,
  tgt.storage_key = s.storage_key,
  tgt.storage_url = s.storage_url,
  tgt.checksum_sha256 = s.checksum_sha256,

  tgt.source_system = s.source_system,
  tgt.source_reference = s.source_reference,

  tgt.is_active = isnull(s.is_active, 1)

when not matched then insert (
  document_id,
  installation_id,
  atrium_installation_code,
  document_type_key,

  title,
  document_number,
  document_date,
  revision,

  file_name,
  mime_type,
  file_size_bytes,

  storage_provider,
  storage_key,
  storage_url,
  checksum_sha256,

  source_system,
  source_reference,

  is_active,
  created_at,
  created_by
) values (
  s.document_id,
  s.installation_id,
  s.atrium_installation_code,
  s.document_type_key,

  s.title,
  s.document_number,
  s.document_date,
  s.revision,

  s.file_name,
  s.mime_type,
  s.file_size_bytes,

  s.storage_provider,
  s.storage_key,
  s.storage_url,
  s.checksum_sha256,

  s.source_system,
  s.source_reference,

  isnull(s.is_active, 1),
  sysutcdatetime(),
  @updatedBy
)
output $action into @actions;

select
  (select count(*) from @actions) as affected_rows,
  (select count(*) from @actions where action = 'INSERT') as inserted_rows,
  (select count(*) from @actions where action = 'UPDATE') as updated_rows;
`;

export const searchInstallationsSql = `
select top (@take)
  i.installation_id,
  a.installatie_code as atrium_installation_code,
  i.installation_type_key,
  it.display_name as installation_type_name,
  coalesce(i.is_active, cast(1 as bit)) as is_active,
  i.created_at,
  coalesce(nullif(a.obj_naam, ''), a.installatie_code) as installation_name
from dbo.AtriumInstallationBase a
left join dbo.Installation i
  on i.atrium_installation_code = a.installatie_code
left join dbo.InstallationType it
  on it.installation_type_key = i.installation_type_key
where (
  a.installatie_code like @qLike
  or a.obj_naam like @qLike
)
order by
  case
    when a.installatie_code = @q then 0
    when a.installatie_code like @qPrefix then 1
    when a.installatie_code like @qLike then 2
    when a.obj_naam like @qPrefix then 3
    when a.obj_naam like @qLike then 4
    else 9
  end,
  a.installatie_code;
`;
