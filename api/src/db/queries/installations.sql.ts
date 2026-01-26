export const getInstallationSql = `
select top 1
  i.installation_id,
  i.atrium_installation_code,
  a.*
from dbo.Installation i
left join dbo.AtriumInstallationBase a
  on a.atrium_installation_code = i.atrium_installation_code
where i.atrium_installation_code = @code
`;

export const getCatalogSectionsSql = `
select
  section_id,
  code as section_code,
  name as section_name,
  sort_order,
  is_active
from dbo.FormulierSectie
where is_active = 1
order by sort_order, section_code
`;

export const getCatalogFieldsSql = `
select
  field_key,
  section_id,
  section_code,
  label,
  data_type,
  is_editable,
  source,
  sort_order
from dbo.FieldCatalog
order by section_code, sort_order, field_key
`;

export const getCatalogDocumentTypesSql = `
select
  document_type_id,
  section_id,
  code as document_type_code,
  name as document_type_name,
  sort_order,
  is_required,
  is_active
from dbo.DocumentType
where is_active = 1
order by sort_order, document_type_code
`;

export const getCustomValuesSql = `
select
  d.field_key,
  v.value_string,
  v.value_number,
  v.value_bool,
  v.value_date,
  v.value_datetime,
  v.value_json
from dbo.InstallationCustomFieldValue v
join dbo.InstallationCustomFieldDefinition d
  on d.custom_field_definition_id = v.custom_field_definition_id
join dbo.Installation i
  on i.installation_id = v.installation_id
where i.atrium_installation_code = @code
order by d.field_key
`;

// upsert per field_key; resolve installatie_id + definitie id
export const upsertCustomValuesSql = `
declare @installation_id int;

select @installation_id = i.installation_id
from dbo.Installation i
where i.atrium_installation_code = @code;

if @installation_id is null
begin
  throw 50000, 'installation not found', 1;
end;

merge dbo.InstallationCustomFieldValue as tgt
using (
  select
    @installation_id as installation_id,
    d.custom_field_definition_id,
    src.field_key,
    src.value_string,
    src.value_number,
    src.value_bool,
    src.value_date,
    src.value_datetime,
    src.value_json
  from openjson(@valuesJson)
  with (
    field_key nvarchar(200) '$.field_key',
    value_string nvarchar(max) '$.value_string',
    value_number decimal(18,6) '$.value_number',
    value_bool bit '$.value_bool',
    value_date date '$.value_date',
    value_datetime datetime2 '$.value_datetime',
    value_json nvarchar(max) '$.value_json'
  ) src
  join dbo.InstallationCustomFieldDefinition d
    on d.field_key = src.field_key
  where d.is_active = 1
) as s
on tgt.installation_id = s.installation_id
and tgt.custom_field_definition_id = s.custom_field_definition_id
when matched then update set
  tgt.value_string = s.value_string,
  tgt.value_number = s.value_number,
  tgt.value_bool = s.value_bool,
  tgt.value_date = s.value_date,
  tgt.value_datetime = s.value_datetime,
  tgt.value_json = s.value_json,
  tgt.updated_at = sysdatetime()
when not matched then insert (
  installation_id,
  custom_field_definition_id,
  value_string,
  value_number,
  value_bool,
  value_date,
  value_datetime,
  value_json,
  created_at,
  updated_at
) values (
  s.installation_id,
  s.custom_field_definition_id,
  s.value_string,
  s.value_number,
  s.value_bool,
  s.value_date,
  s.value_datetime,
  s.value_json,
  sysdatetime(),
  sysdatetime()
);

select @@rowcount as affected_rows;
`;
