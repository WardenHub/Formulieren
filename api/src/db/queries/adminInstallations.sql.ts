// api/src/db/queries/adminInstallations.sql.ts
export const getAdminInstallationsCatalogSql = `
select
  it.installation_type_key,
  it.display_name,
  it.sort_order,
  it.is_active
from dbo.InstallationType it
order by
  case when it.sort_order is null then 999999 else it.sort_order end,
  it.installation_type_key;

select
  fs.sectie_key as section_key,
  fs.naam as section_name,
  fs.omschrijving as section_description,
  fs.sort_order
from dbo.FormulierSectie fs
order by
  case when fs.sort_order is null then 999999 else fs.sort_order end,
  fs.sectie_key;

select
  icfd.field_key,
  icfd.display_name,
  icfd.data_type,
  icfd.sectie_key as section_key,
  icfd.sort_order,
  icfd.is_active
from dbo.InstallationCustomFieldDefinition icfd
order by
  case when icfd.sectie_key is null then 1 else 0 end,
  icfd.sectie_key,
  case when icfd.sort_order is null then 999999 else icfd.sort_order end,
  icfd.field_key;

select
  o.field_key,
  o.option_value,
  o.option_label,
  o.sort_order,
  o.is_active
from dbo.InstallationCustomFieldOption o
order by
  o.field_key,
  case when o.sort_order is null then 999999 else o.sort_order end,
  o.option_value;

select
  x.field_key,
  x.installation_type_key
from dbo.InstallationCustomFieldDefinitionType x
order by
  x.field_key,
  x.installation_type_key;

select
  dt.document_type_key,
  dt.naam as document_type_name,
  dt.sectie_key as section_key,
  dt.sort_order,
  dt.is_active
from dbo.DocumentType dt
order by
  case when dt.sectie_key is null then 1 else 0 end,
  dt.sectie_key,
  case when dt.sort_order is null then 999999 else dt.sort_order end,
  dt.document_type_key;

select
  x.document_type_key,
  x.installation_type_key
from dbo.DocumentTypeInstallationType x
order by
  x.document_type_key,
  x.installation_type_key;

select
  r.document_type_key,
  r.installation_type_key,
  r.is_required
from dbo.DocumentTypeRequirement r
order by
  r.document_type_key,
  r.installation_type_key;

select
  efd.field_key,
  efd.sectie_key as section_key,
  efd.display_name as label,
  efd.sort_order,
  efd.source_type,
  efd.fabric_table,
  efd.fabric_column,
  efd.notes,
  efd.is_active
from dbo.ExternalFieldDefinition efd
where efd.source_type = 'fabric'
order by
  case when efd.sectie_key is null then 1 else 0 end,
  efd.sectie_key,
  case when efd.sort_order is null then 999999 else efd.sort_order end,
  efd.field_key;

select
  x.field_key,
  x.installation_type_key
from dbo.ExternalFieldDefinitionType x
order by
  x.field_key,
  x.installation_type_key;
`;

export const saveAdminInstallationTypesSql = `
if isjson(@itemsJson) <> 1
begin
  throw 50000, 'itemsJson must be valid json', 1;
end;

begin tran;

merge dbo.InstallationType as tgt
using (
  select
    convert(nvarchar(50), json_value(j.value, '$.installation_type_key')) as installation_type_key,
    convert(nvarchar(100), json_value(j.value, '$.display_name')) as display_name,
    try_convert(int, json_value(j.value, '$.sort_order')) as sort_order,
    try_convert(bit, json_value(j.value, '$.is_active')) as is_active
  from openjson(@itemsJson) j
) as src
on tgt.installation_type_key = src.installation_type_key
when matched then update set
  tgt.display_name = src.display_name,
  tgt.sort_order = isnull(src.sort_order, tgt.sort_order),
  tgt.is_active = isnull(src.is_active, 1)
when not matched then insert (
  installation_type_key,
  sort_order,
  display_name,
  is_active,
  created_at
) values (
  src.installation_type_key,
  isnull(src.sort_order, 0),
  src.display_name,
  isnull(src.is_active, 1),
  sysutcdatetime()
);

commit tran;

select cast(1 as bit) as ok;
`;

export const saveAdminInstallationSectionsSql = `
if isjson(@itemsJson) <> 1
begin
  throw 50000, 'itemsJson must be valid json', 1;
end;

begin tran;

merge dbo.FormulierSectie as tgt
using (
  select
    convert(nvarchar(100), json_value(j.value, '$.section_key')) as section_key,
    convert(nvarchar(150), json_value(j.value, '$.section_name')) as section_name,
    convert(nvarchar(500), json_value(j.value, '$.section_description')) as section_description,
    try_convert(int, json_value(j.value, '$.sort_order')) as sort_order
  from openjson(@itemsJson) j
) as src
on tgt.sectie_key = src.section_key
when matched then update set
  tgt.naam = src.section_name,
  tgt.omschrijving = src.section_description,
  tgt.sort_order = src.sort_order
when not matched then insert (
  sectie_key,
  naam,
  omschrijving,
  sort_order
) values (
  src.section_key,
  src.section_name,
  src.section_description,
  src.sort_order
);

commit tran;

select cast(1 as bit) as ok;
`;

export const saveAdminInstallationFieldsSql = `
if isjson(@itemsJson) <> 1
begin
  throw 50000, 'itemsJson must be valid json', 1;
end;

begin tran;

merge dbo.InstallationCustomFieldDefinition as tgt
using (
  select
    convert(nvarchar(200), json_value(j.value, '$.field_key')) as field_key,
    convert(nvarchar(250), json_value(j.value, '$.display_name')) as display_name,
    convert(nvarchar(20), json_value(j.value, '$.data_type')) as data_type,
    convert(nvarchar(100), json_value(j.value, '$.section_key')) as section_key,
    try_convert(int, json_value(j.value, '$.sort_order')) as sort_order,
    try_convert(bit, json_value(j.value, '$.is_active')) as is_active
  from openjson(@itemsJson) j
) as src
on tgt.field_key = src.field_key
when matched then update set
  tgt.display_name = src.display_name,
  tgt.data_type = src.data_type,
  tgt.sectie_key = src.section_key,
  tgt.sort_order = src.sort_order,
  tgt.is_active = isnull(src.is_active, 1)
when not matched then insert (
  field_key,
  display_name,
  data_type,
  sectie_key,
  sort_order,
  is_active,
  created_at
) values (
  src.field_key,
  src.display_name,
  src.data_type,
  src.section_key,
  src.sort_order,
  isnull(src.is_active, 1),
  sysutcdatetime()
);

delete t
from dbo.InstallationCustomFieldDefinitionType t
where exists (
  select 1
  from openjson(@itemsJson) j
  where convert(nvarchar(200), json_value(j.value, '$.field_key')) = t.field_key
);

insert into dbo.InstallationCustomFieldDefinitionType (
  field_key,
  installation_type_key
)
select
  src.field_key,
  src.installation_type_key
from (
  select distinct
    convert(nvarchar(200), json_value(j.value, '$.field_key')) as field_key,
    convert(nvarchar(50), a.value) as installation_type_key
  from openjson(@itemsJson) j
  cross apply openjson(json_query(j.value, '$.applicability_type_keys')) a
) src
where exists (
  select 1
  from dbo.InstallationType it
  where it.installation_type_key = src.installation_type_key
);

delete o
from dbo.InstallationCustomFieldOption o
where exists (
  select 1
  from openjson(@itemsJson) j
  where convert(nvarchar(200), json_value(j.value, '$.field_key')) = o.field_key
);

insert into dbo.InstallationCustomFieldOption (
  field_key,
  option_value,
  option_label,
  sort_order,
  is_active
)
select
  src.field_key,
  src.option_value,
  src.option_label,
  src.sort_order,
  src.is_active
from (
  select
    convert(nvarchar(200), json_value(j.value, '$.field_key')) as field_key,
    convert(nvarchar(200), json_value(opt.value, '$.option_value')) as option_value,
    convert(nvarchar(250), json_value(opt.value, '$.option_label')) as option_label,
    try_convert(int, json_value(opt.value, '$.sort_order')) as sort_order,
    isnull(try_convert(bit, json_value(opt.value, '$.is_active')), 1) as is_active
  from openjson(@itemsJson) j
  cross apply openjson(json_query(j.value, '$.options')) opt
) src
where src.option_value is not null
  and src.option_label is not null;

commit tran;

select cast(1 as bit) as ok;
`;

export const saveAdminInstallationDocumentsSql = `
if isjson(@itemsJson) <> 1
begin
  throw 50000, 'itemsJson must be valid json', 1;
end;

begin tran;

merge dbo.DocumentType as tgt
using (
  select
    convert(nvarchar(50), json_value(j.value, '$.document_type_key')) as document_type_key,
    convert(nvarchar(150), json_value(j.value, '$.document_type_name')) as document_type_name,
    convert(nvarchar(100), json_value(j.value, '$.section_key')) as section_key,
    try_convert(int, json_value(j.value, '$.sort_order')) as sort_order,
    try_convert(bit, json_value(j.value, '$.is_active')) as is_active
  from openjson(@itemsJson) j
) as src
on tgt.document_type_key = src.document_type_key
when matched then update set
  tgt.naam = src.document_type_name,
  tgt.sectie_key = src.section_key,
  tgt.sort_order = src.sort_order,
  tgt.is_active = isnull(src.is_active, 1)
when not matched then insert (
  document_type_key,
  naam,
  sectie_key,
  sort_order,
  is_active,
  created_at
) values (
  src.document_type_key,
  src.document_type_name,
  src.section_key,
  src.sort_order,
  isnull(src.is_active, 1),
  sysutcdatetime()
);

delete t
from dbo.DocumentTypeInstallationType t
where exists (
  select 1
  from openjson(@itemsJson) j
  where convert(nvarchar(50), json_value(j.value, '$.document_type_key')) = t.document_type_key
);

insert into dbo.DocumentTypeInstallationType (
  document_type_key,
  installation_type_key
)
select
  src.document_type_key,
  src.installation_type_key
from (
  select distinct
    convert(nvarchar(50), json_value(j.value, '$.document_type_key')) as document_type_key,
    convert(nvarchar(50), a.value) as installation_type_key
  from openjson(@itemsJson) j
  cross apply openjson(json_query(j.value, '$.applicability_type_keys')) a
) src
where exists (
  select 1
  from dbo.InstallationType it
  where it.installation_type_key = src.installation_type_key
);

delete r
from dbo.DocumentTypeRequirement r
where exists (
  select 1
  from openjson(@itemsJson) j
  where convert(nvarchar(50), json_value(j.value, '$.document_type_key')) = r.document_type_key
);

insert into dbo.DocumentTypeRequirement (
  document_type_key,
  installation_type_key,
  is_required
)
select
  src.document_type_key,
  src.installation_type_key,
  cast(1 as bit)
from (
  select distinct
    convert(nvarchar(50), json_value(j.value, '$.document_type_key')) as document_type_key,
    convert(nvarchar(50), a.value) as installation_type_key
  from openjson(@itemsJson) j
  cross apply openjson(json_query(j.value, '$.desired_type_keys')) a
) src
where exists (
  select 1
  from dbo.InstallationType it
  where it.installation_type_key = src.installation_type_key
)
and (
  not exists (
    select 1
    from dbo.DocumentTypeInstallationType x
    where x.document_type_key = src.document_type_key
  )
  or exists (
    select 1
    from dbo.DocumentTypeInstallationType x
    where x.document_type_key = src.document_type_key
      and x.installation_type_key = src.installation_type_key
  )
);

commit tran;

select cast(1 as bit) as ok;
`;

export const saveAdminInstallationExternalFieldsSql = `
if isjson(@itemsJson) <> 1
begin
  throw 50000, 'itemsJson must be valid json', 1;
end;

begin tran;

merge dbo.ExternalFieldDefinition as tgt
using (
  select
    convert(nvarchar(200), json_value(j.value, '$.field_key')) as field_key,
    convert(nvarchar(100), json_value(j.value, '$.section_key')) as section_key,
    convert(nvarchar(250), json_value(j.value, '$.label')) as label,
    try_convert(int, json_value(j.value, '$.sort_order')) as sort_order,
    convert(nvarchar(50), json_value(j.value, '$.source_type')) as source_type,
    convert(nvarchar(200), json_value(j.value, '$.fabric_table')) as fabric_table,
    convert(nvarchar(200), json_value(j.value, '$.fabric_column')) as fabric_column,
    convert(nvarchar(2000), json_value(j.value, '$.notes')) as notes,
    try_convert(bit, json_value(j.value, '$.is_active')) as is_active
  from openjson(@itemsJson) j
) as src
on tgt.field_key = src.field_key
when matched then update set
  tgt.sectie_key = src.section_key,
  tgt.display_name = src.label,
  tgt.sort_order = src.sort_order,
  tgt.source_type = src.source_type,
  tgt.fabric_table = src.fabric_table,
  tgt.fabric_column = src.fabric_column,
  tgt.notes = src.notes,
  tgt.is_active = isnull(src.is_active, 1)
when not matched then insert (
  field_key,
  sectie_key,
  display_name,
  sort_order,
  source_type,
  fabric_table,
  fabric_column,
  notes,
  is_active
) values (
  src.field_key,
  src.section_key,
  src.label,
  src.sort_order,
  src.source_type,
  src.fabric_table,
  src.fabric_column,
  src.notes,
  isnull(src.is_active, 1)
);

delete t
from dbo.ExternalFieldDefinitionType t
where exists (
  select 1
  from openjson(@itemsJson) j
  where convert(nvarchar(200), json_value(j.value, '$.field_key')) = t.field_key
);

insert into dbo.ExternalFieldDefinitionType (
  field_key,
  installation_type_key
)
select
  src.field_key,
  src.installation_type_key
from (
  select distinct
    convert(nvarchar(200), json_value(j.value, '$.field_key')) as field_key,
    convert(nvarchar(50), a.value) as installation_type_key
  from openjson(@itemsJson) j
  cross apply openjson(json_query(j.value, '$.applicability_type_keys')) a
) src
where exists (
  select 1
  from dbo.InstallationType it
  where it.installation_type_key = src.installation_type_key
);

commit tran;

select cast(1 as bit) as ok;
`;