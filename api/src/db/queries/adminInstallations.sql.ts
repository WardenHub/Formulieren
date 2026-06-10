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
  m.mapping_id,
  m.installation_type_key,
  m.atrium_installation_type_code,
  m.atrium_installation_type_description,
  m.is_active,
  m.created_at,
  m.created_by,
  m.updated_at,
  m.updated_by
from dbo.InstallationTypeAtriumMapping m
order by
  m.installation_type_key,
  m.atrium_installation_type_code;

select top (25)
  a.run_id,
  a.trigger_source,
  a.triggered_by,
  a.status,
  a.started_at,
  a.completed_at,
  a.inspected_count,
  a.updated_total,
  a.updated_existing_count,
  a.inserted_overlay_count,
  a.skipped_already_typed_count,
  a.skipped_historical_count,
  a.skipped_not_current_count,
  a.unknown_no_mapping_count,
  a.mapping_target_missing_count,
  a.error_message
from dbo.InstallationTypeInitializationAudit a
order by
  a.started_at desc,
  a.completed_at desc;

select
  d.run_id,
  d.detail_kind,
  d.reason,
  d.action_type,
  d.atrium_installation_type_code,
  d.atrium_installation_type_description,
  d.installation_type_key,
  d.item_count
from dbo.InstallationTypeInitializationAuditDetail d
where exists (
  select 1
  from (
    select top (25) a.run_id
    from dbo.InstallationTypeInitializationAudit a
    order by
      a.started_at desc,
      a.completed_at desc
  ) recent
  where recent.run_id = d.run_id
)
order by
  d.run_id desc,
  d.detail_kind,
  d.reason,
  d.atrium_installation_type_code,
  d.installation_type_key;

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
  dt.is_attachment_only,
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

select
  x.document_type_key,
  x.parent_document_type_key
from dbo.DocumentTypeAttachmentParent x
order by
  x.document_type_key,
  x.parent_document_type_key;

select
  p.portal_key,
  p.display_name,
  p.notes,
  p.installation_url_template,
  p.sort_order,
  p.is_active,
  p.created_at,
  p.created_by,
  p.updated_at,
  p.updated_by
from dbo.ManagementPortalDefinition p
order by
  case when p.sort_order is null then 999999 else p.sort_order end,
  p.display_name,
  p.portal_key;

select
  x.portal_key,
  x.installation_type_key
from dbo.ManagementPortalInstallationType x
order by
  x.portal_key,
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

delete m
from dbo.InstallationTypeAtriumMapping m
where exists (
  select 1
  from openjson(@itemsJson) j
  where convert(nvarchar(50), json_value(j.value, '$.installation_type_key')) = m.installation_type_key
);

insert into dbo.InstallationTypeAtriumMapping (
  installation_type_key,
  atrium_installation_type_code,
  atrium_installation_type_description,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
)
select
  src.installation_type_key,
  src.atrium_installation_type_code,
  src.atrium_installation_type_description,
  src.is_active,
  sysutcdatetime(),
  @updatedBy,
  sysutcdatetime(),
  @updatedBy
from (
  select distinct
    convert(nvarchar(50), json_value(j.value, '$.installation_type_key')) as installation_type_key,
    convert(nvarchar(100), json_value(m.value, '$.atrium_installation_type_code')) as atrium_installation_type_code,
    convert(nvarchar(200), json_value(m.value, '$.atrium_installation_type_description')) as atrium_installation_type_description,
    isnull(try_convert(bit, json_value(m.value, '$.is_active')), 1) as is_active
  from openjson(@itemsJson) j
  cross apply openjson(json_query(j.value, '$.atrium_mappings')) m
) src
where src.installation_type_key is not null
  and src.atrium_installation_type_code is not null
  and exists (
    select 1
    from dbo.InstallationType it
    where it.installation_type_key = src.installation_type_key
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
    try_convert(bit, json_value(j.value, '$.is_attachment_only')) as is_attachment_only,
    try_convert(bit, json_value(j.value, '$.is_active')) as is_active
  from openjson(@itemsJson) j
) as src
on tgt.document_type_key = src.document_type_key
when matched then update set
  tgt.naam = src.document_type_name,
  tgt.sectie_key = src.section_key,
  tgt.sort_order = src.sort_order,
  tgt.is_attachment_only = isnull(src.is_attachment_only, 0),
  tgt.is_active = isnull(src.is_active, 1)
when not matched then insert (
  document_type_key,
  naam,
  sectie_key,
  sort_order,
  is_attachment_only,
  is_active,
  created_at
) values (
  src.document_type_key,
  src.document_type_name,
  src.section_key,
  src.sort_order,
  isnull(src.is_attachment_only, 0),
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

delete ap
from dbo.DocumentTypeAttachmentParent ap
where exists (
  select 1
  from openjson(@itemsJson) j
  where convert(nvarchar(50), json_value(j.value, '$.document_type_key')) = ap.document_type_key
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

insert into dbo.DocumentTypeAttachmentParent (
  document_type_key,
  parent_document_type_key
)
select distinct
  child.document_type_key,
  parentType.parent_document_type_key
from (
  select
    convert(nvarchar(50), json_value(j.value, '$.document_type_key')) as document_type_key,
    isnull(try_convert(bit, json_value(j.value, '$.is_attachment_only')), 0) as is_attachment_only,
    json_query(j.value, '$.attachment_parent_type_keys') as attachment_parent_type_keys_json
  from openjson(@itemsJson) j
) child
cross apply openjson(child.attachment_parent_type_keys_json) parentValues
cross apply (
  select convert(nvarchar(50), parentValues.value) as parent_document_type_key
) parentType
where child.document_type_key is not null
  and child.is_attachment_only = 1
  and parentType.parent_document_type_key is not null
  and parentType.parent_document_type_key <> child.document_type_key
  and exists (
    select 1
    from dbo.DocumentType parentDt
    where parentDt.document_type_key = parentType.parent_document_type_key
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

export const saveAdminInstallationManagementPortalsSql = `
if isjson(@itemsJson) <> 1
begin
  throw 50000, 'itemsJson must be valid json', 1;
end;

begin tran;

merge dbo.ManagementPortalDefinition as tgt
using (
  select
    convert(nvarchar(100), json_value(j.value, '$.portal_key')) as portal_key,
    convert(nvarchar(150), json_value(j.value, '$.display_name')) as display_name,
    convert(nvarchar(2000), json_value(j.value, '$.notes')) as notes,
    convert(nvarchar(2000), json_value(j.value, '$.installation_url_template')) as installation_url_template,
    try_convert(int, json_value(j.value, '$.sort_order')) as sort_order,
    try_convert(bit, json_value(j.value, '$.is_active')) as is_active
  from openjson(@itemsJson) j
) as src
on tgt.portal_key = src.portal_key
when matched then update set
  tgt.display_name = src.display_name,
  tgt.notes = src.notes,
  tgt.installation_url_template = src.installation_url_template,
  tgt.sort_order = src.sort_order,
  tgt.is_active = isnull(src.is_active, 1),
  tgt.updated_at = sysutcdatetime(),
  tgt.updated_by = @updatedBy
when not matched then insert (
  portal_key,
  display_name,
  notes,
  installation_url_template,
  sort_order,
  is_active,
  created_at,
  created_by,
  updated_at,
  updated_by
) values (
  src.portal_key,
  src.display_name,
  src.notes,
  src.installation_url_template,
  src.sort_order,
  isnull(src.is_active, 1),
  sysutcdatetime(),
  @updatedBy,
  sysutcdatetime(),
  @updatedBy
);

delete t
from dbo.ManagementPortalInstallationType t
where exists (
  select 1
  from openjson(@itemsJson) j
  where convert(nvarchar(100), json_value(j.value, '$.portal_key')) = t.portal_key
);

insert into dbo.ManagementPortalInstallationType (
  portal_key,
  installation_type_key
)
select
  src.portal_key,
  src.installation_type_key
from (
  select distinct
    convert(nvarchar(100), json_value(j.value, '$.portal_key')) as portal_key,
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

export const initializeInstallationTypesSql = `
set nocount on;
set xact_abort on;

declare @candidates table (
  atrium_installation_code nvarchar(450) NOT NULL PRIMARY KEY,
  existing_installation_id uniqueidentifier NULL,
  existing_type_key nvarchar(50) NULL,
  installation_status char(1) NULL,
  installatietype_code nvarchar(100) NULL,
  installatietype_omschrijving nvarchar(200) NULL,
  mapped_type_key nvarchar(50) NULL,
  reason nvarchar(40) NOT NULL
);

insert into @candidates (
  atrium_installation_code,
  existing_installation_id,
  existing_type_key,
  installation_status,
  installatietype_code,
  installatietype_omschrijving,
  mapped_type_key,
  reason
)
select
  a.installatie_code,
  i.installation_id,
  i.installation_type_key,
  a.installation_status,
  nullif(ltrim(rtrim(a.installatietype_code)), N'') as installatietype_code,
  a.installatietype_omschrijving,
  it.installation_type_key as mapped_type_key,
  case
    when i.installation_type_key is not null then N'already_typed'
    when upper(isnull(a.installation_status, N'')) = N'J' then N'historical'
    when upper(isnull(a.installation_status, N'')) <> N'N' then N'not_current'
    when m.installation_type_key is null then N'no_mapping'
    when it.installation_type_key is null then N'mapping_target_missing'
    else N'update_candidate'
  end as reason
from dbo.AtriumInstallationBase a
left join dbo.Installation i
  on i.atrium_installation_code = a.installatie_code
left join dbo.InstallationTypeAtriumMapping m
  on m.atrium_installation_type_code = nullif(ltrim(rtrim(a.installatietype_code)), N'')
 and m.is_active = 1
left join dbo.InstallationType it
  on it.installation_type_key = m.installation_type_key
 and it.is_active = 1;

declare @changed table (
  action_type nvarchar(20) NOT NULL,
  atrium_installation_code nvarchar(450) NOT NULL,
  installation_type_key nvarchar(50) NOT NULL
);

begin tran;

update i
set installation_type_key = c.mapped_type_key
output
  N'UPDATE',
  inserted.atrium_installation_code,
  inserted.installation_type_key
into @changed (action_type, atrium_installation_code, installation_type_key)
from dbo.Installation i
join @candidates c
  on c.atrium_installation_code = i.atrium_installation_code
where c.reason = N'update_candidate'
  and c.existing_installation_id is not null
  and i.installation_type_key is null;

insert into dbo.Installation (
  installation_id,
  atrium_installation_code,
  installation_type_key,
  created_at,
  created_by,
  is_active
)
output
  N'INSERT',
  inserted.atrium_installation_code,
  inserted.installation_type_key
into @changed (action_type, atrium_installation_code, installation_type_key)
select
  newid(),
  c.atrium_installation_code,
  c.mapped_type_key,
  sysutcdatetime(),
  @updatedBy,
  1
from @candidates c
where c.reason = N'update_candidate'
  and c.existing_installation_id is null;

declare @run_id uniqueidentifier = newid();
declare @started_at datetime2(3) = sysutcdatetime();
declare @completed_at datetime2(3) = sysutcdatetime();

insert into dbo.InstallationTypeInitializationAudit (
  run_id,
  trigger_source,
  triggered_by,
  status,
  started_at,
  completed_at,
  inspected_count,
  updated_total,
  updated_existing_count,
  inserted_overlay_count,
  skipped_already_typed_count,
  skipped_historical_count,
  skipped_not_current_count,
  unknown_no_mapping_count,
  mapping_target_missing_count
)
values (
  @run_id,
  isnull(nullif(@triggerSource, N''), N'admin'),
  @updatedBy,
  N'completed',
  @started_at,
  @completed_at,
  (select count(*) from @candidates),
  (select count(*) from @changed),
  (select count(*) from @changed where action_type = N'UPDATE'),
  (select count(*) from @changed where action_type = N'INSERT'),
  (select count(*) from @candidates where reason = N'already_typed'),
  (select count(*) from @candidates where reason = N'historical'),
  (select count(*) from @candidates where reason = N'not_current'),
  (select count(*) from @candidates where reason = N'no_mapping'),
  (select count(*) from @candidates where reason = N'mapping_target_missing')
);

insert into dbo.InstallationTypeInitializationAuditDetail (
  run_id,
  detail_kind,
  reason,
  action_type,
  atrium_installation_type_code,
  atrium_installation_type_description,
  installation_type_key,
  item_count
)
select
  @run_id,
  N'applied',
  null,
  ch.action_type,
  c.installatietype_code,
  c.installatietype_omschrijving,
  ch.installation_type_key,
  count(*) as item_count
from @changed ch
join @candidates c
  on c.atrium_installation_code = ch.atrium_installation_code
group by
  ch.action_type,
  c.installatietype_code,
  c.installatietype_omschrijving,
  ch.installation_type_key;

insert into dbo.InstallationTypeInitializationAuditDetail (
  run_id,
  detail_kind,
  reason,
  action_type,
  atrium_installation_type_code,
  atrium_installation_type_description,
  installation_type_key,
  item_count
)
select
  @run_id,
  N'unknown',
  c.reason,
  null,
  c.installatietype_code,
  c.installatietype_omschrijving,
  c.mapped_type_key,
  count(*) as item_count
from @candidates c
where c.reason in (N'no_mapping', N'mapping_target_missing')
group by
  c.reason,
  c.installatietype_code,
  c.installatietype_omschrijving,
  c.mapped_type_key;

insert into dbo.InstallationTypeInitializationAuditDetail (
  run_id,
  detail_kind,
  reason,
  action_type,
  atrium_installation_type_code,
  atrium_installation_type_description,
  installation_type_key,
  item_count
)
select
  @run_id,
  N'skipped',
  c.reason,
  null,
  c.installatietype_code,
  c.installatietype_omschrijving,
  c.existing_type_key,
  count(*) as item_count
from @candidates c
where c.reason in (N'already_typed', N'historical', N'not_current')
group by
  c.reason,
  c.installatietype_code,
  c.installatietype_omschrijving,
  c.existing_type_key;

commit tran;

select
  cast(1 as bit) as ok,
  @run_id as run_id,
  isnull(nullif(@triggerSource, N''), N'admin') as trigger_source,
  (select count(*) from @changed) as updated_total,
  (select count(*) from @changed where action_type = N'UPDATE') as updated_existing_count,
  (select count(*) from @changed where action_type = N'INSERT') as inserted_overlay_count,
  (select count(*) from @candidates where reason = N'already_typed') as skipped_already_typed_count,
  (select count(*) from @candidates where reason = N'historical') as skipped_historical_count,
  (select count(*) from @candidates where reason = N'not_current') as skipped_not_current_count,
  (select count(*) from @candidates where reason = N'no_mapping') as unknown_no_mapping_count,
  (select count(*) from @candidates where reason = N'mapping_target_missing') as mapping_target_missing_count,
  (select count(*) from @candidates) as inspected_count;

select
  c.installatietype_code,
  c.installatietype_omschrijving,
  ch.installation_type_key,
  ch.action_type,
  count(*) as count
from @changed ch
join @candidates c
  on c.atrium_installation_code = ch.atrium_installation_code
group by
  c.installatietype_code,
  c.installatietype_omschrijving,
  ch.installation_type_key,
  ch.action_type
order by
  c.installatietype_code,
  ch.installation_type_key,
  ch.action_type;

select
  c.reason,
  c.installatietype_code,
  c.installatietype_omschrijving,
  count(*) as count
from @candidates c
where c.reason in (N'no_mapping', N'mapping_target_missing')
group by
  c.reason,
  c.installatietype_code,
  c.installatietype_omschrijving
order by
  c.reason,
  c.installatietype_code,
  c.installatietype_omschrijving;

select
  c.reason,
  c.installatietype_code,
  c.installatietype_omschrijving,
  count(*) as count
from @candidates c
where c.reason in (N'already_typed', N'historical', N'not_current')
group by
  c.reason,
  c.installatietype_code,
  c.installatietype_omschrijving
order by
  c.reason,
  c.installatietype_code,
  c.installatietype_omschrijving;

select
  m.atrium_installation_type_code as installatietype_code,
  m.atrium_installation_type_description as installatietype_omschrijving,
  m.installation_type_key,
  cast(case when it.installation_type_key is null then 0 else 1 end as bit) as target_exists
from dbo.InstallationTypeAtriumMapping m
left join dbo.InstallationType it
  on it.installation_type_key = m.installation_type_key
where m.is_active = 1
order by m.atrium_installation_type_code;
`;
