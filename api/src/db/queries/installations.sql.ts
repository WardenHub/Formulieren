// /api/src/db/queries/installations.sql.ts
// =========================================================
// installations queries; aligned to tabel-definities.sql
// =========================================================

export const getInstallationSql = `
select top 1
  i.installation_id,
  i.atrium_installation_code,
  i.installation_type_key,
  it.display_name as installation_type_name,
  i.created_at,
  i.created_by,
  i.is_active,
  a.*
from dbo.Installation i
left join dbo.InstallationType it
  on it.installation_type_key = i.installation_type_key
left join dbo.AtriumInstallationBase a
  on a.atrium_installation_code = i.atrium_installation_code
where i.atrium_installation_code = @code
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
  and d.is_active = 1
where dt.is_active = 1
order by
  case when dt.sort_order is null then 999999 else dt.sort_order end,
  dt.document_type_key,
  d.created_at desc
`;
