export const getInstallationDrawingsSql = `
select
  d.document_id,
  d.document_type_key,
  dt.naam as document_type_name,
  case when dt.sectie_key = N'doc_tekening' then cast(1 as bit) else cast(0 as bit) end as is_drawing_type,
  d.parent_document_id,
  d.title,
  d.document_number,
  d.document_date,
  d.revision,
  d.is_active as document_is_active,
  case when exists (
    select 1
    from dbo.InstallationDocument replacement
    where replacement.parent_document_id = d.document_id
      and replacement.relation_type = N'VERVANGING'
      and replacement.is_active = 1
  ) then cast(0 as bit) else cast(1 as bit) end as is_current_version,
  sf.stored_file_id,
  sf.file_name,
  sf.mime_type,
  sf.file_extension,
  sf.file_size_bytes,
  sf.uploaded_at,
  (
    select count(*)
    from dbo.DrawingPin previous_pin
    where previous_pin.installation_document_id = d.parent_document_id
      and previous_pin.is_deleted = 0
      and previous_pin.pin_status = N'ACTIVE'
  ) as previous_version_pin_count,
  count(p.drawing_pin_id) as pin_count
from dbo.InstallationDocument d
join dbo.DocumentType dt
  on dt.document_type_key = d.document_type_key
join dbo.StoredFile sf
  on sf.stored_file_id = d.stored_file_id
 and sf.is_deleted = 0
left join dbo.DrawingPin p
  on p.installation_document_id = d.document_id
 and p.is_deleted = 0
where d.atrium_installation_code = @code
  and (
    dt.sectie_key = N'doc_tekening'
    or exists (
      select 1
      from dbo.DrawingPin legacy_pin
      where legacy_pin.installation_document_id = d.document_id
        and legacy_pin.is_deleted = 0
    )
  )
  and (
    d.is_active = 1
    or exists (
      select 1
      from dbo.DrawingPin historical_pin
      where historical_pin.installation_document_id = d.document_id
    )
  )
  and (
    lower(coalesce(sf.mime_type, N'')) = N'application/pdf'
    or lower(coalesce(sf.file_extension, N'')) = N'pdf'
    or lower(coalesce(sf.file_name, N'')) like N'%.pdf'
  )
  and (
    not exists (
      select 1
      from dbo.InstallationDocument replacement
      where replacement.parent_document_id = d.document_id
        and replacement.relation_type = N'VERVANGING'
        and replacement.is_active = 1
    )
    or exists (
      select 1
      from dbo.DrawingPin historical_pin
      where historical_pin.installation_document_id = d.document_id
    )
  )
group by
  d.document_id,
  d.document_type_key,
  dt.naam,
  dt.sectie_key,
  d.parent_document_id,
  d.title,
  d.document_number,
  d.document_date,
  d.revision,
  d.is_active,
  d.created_at,
  sf.stored_file_id,
  sf.file_name,
  sf.mime_type,
  sf.file_extension,
  sf.file_size_bytes,
  sf.uploaded_at
order by coalesce(d.document_date, cast(d.created_at as date)) desc, d.created_at desc;
`;

export const getPrimaryInstallationDrawingSql = `
if col_length(N'dbo.InstallationDocument', N'is_primary_drawing') is null
begin
  select cast(null as uniqueidentifier) as document_id;
  return;
end;

exec sp_executesql N'
  select top (1) document_id
  from dbo.InstallationDocument
  where atrium_installation_code = @installationCode
    and is_primary_drawing = 1
    and is_active = 1;',
  N'@installationCode nvarchar(450)',
  @installationCode = @code;
`;

export const setPrimaryInstallationDrawingSql = `
if col_length(N'dbo.InstallationDocument', N'is_primary_drawing') is null
begin
  throw 50000, 'primary drawing migration required', 1;
end;

if not exists (
  select 1
  from dbo.InstallationDocument d
  join dbo.DocumentType dt on dt.document_type_key = d.document_type_key
  join dbo.StoredFile sf on sf.stored_file_id = d.stored_file_id and sf.is_deleted = 0
  where d.atrium_installation_code = @code
    and d.document_id = @documentId
    and d.is_active = 1
    and dt.sectie_key = N'doc_tekening'
    and (
      lower(coalesce(sf.mime_type, N'')) = N'application/pdf'
      or lower(coalesce(sf.file_extension, N'')) = N'pdf'
      or lower(coalesce(sf.file_name, N'')) like N'%.pdf'
    )
    and not exists (
      select 1
      from dbo.InstallationDocument replacement
      where replacement.parent_document_id = d.document_id
        and replacement.relation_type = N'VERVANGING'
        and replacement.is_active = 1
    )
)
begin
  throw 50000, 'primary drawing invalid', 1;
end;

begin transaction;

exec sp_executesql N'
  update dbo.InstallationDocument
  set is_primary_drawing = 0,
      updated_at = sysutcdatetime(),
      updated_by = @changedBy
  where atrium_installation_code = @installationCode
    and is_primary_drawing = 1
    and document_id <> @targetDocumentId;

  update dbo.InstallationDocument
  set is_primary_drawing = 1,
      updated_at = sysutcdatetime(),
      updated_by = @changedBy
  where atrium_installation_code = @installationCode
    and document_id = @targetDocumentId;',
  N'@installationCode nvarchar(450), @targetDocumentId uniqueidentifier, @changedBy nvarchar(200)',
  @installationCode = @code,
  @targetDocumentId = @documentId,
  @changedBy = @actor;

commit transaction;

select @documentId as document_id;
`;

export const getDrawingPinsSql = `
select
  p.drawing_pin_id,
  p.installation_document_id,
  p.stored_file_id,
  p.page_number,
  p.x_normalized,
  p.y_normalized,
  p.label,
  p.description,
  p.pin_kind,
  p.pin_status,
  p.created_at,
  p.created_by,
  p.updated_at,
  p.updated_by,
  convert(varchar(18), p.row_version, 1) as row_version,
  coalesce((
    select
      a.follow_up_action_id,
      a.workflow_title,
      a.status,
      a.priority,
      a.responsibility_type,
      a.due_date
    from dbo.FollowUpActionDrawingPinMap map
    join dbo.FollowUpAction a
      on a.follow_up_action_id = map.follow_up_action_id
    where map.drawing_pin_id = p.drawing_pin_id
    order by a.created_at, a.follow_up_action_id
    for json path
  ), N'[]') as follow_up_actions_json
from dbo.DrawingPin p
join dbo.InstallationDocument d
  on d.document_id = p.installation_document_id
where d.atrium_installation_code = @code
  and p.installation_document_id = @documentId
  and p.is_deleted = 0
  and (@includeHistory = 1 or p.pin_status = N'ACTIVE')
order by p.page_number, p.label, p.created_at;
`;

export const getInstallationFollowUpChoicesSql = `
select
  a.follow_up_action_id,
  a.source_type,
  a.workflow_title,
  a.workflow_description,
  a.category,
  a.priority,
  a.responsibility_type,
  a.status,
  a.due_date,
  sd.is_terminal,
  a.created_at,
  a.created_by
from dbo.FollowUpActionInstallationContext c
join dbo.FollowUpAction a
  on a.follow_up_action_id = c.follow_up_action_id
join dbo.FollowUpStatusDefinition sd
  on sd.status_code = a.status
left join dbo.FollowUpActionFormSource fs
  on fs.follow_up_action_id = a.follow_up_action_id
left join dbo.FormInstance fi
  on fi.form_instance_id = fs.form_instance_id
where c.atrium_installation_code = @code
  -- Zelfde regel als in de werklijst; een concept lekt niet naar de koppelkeuze.
  and (fs.form_instance_id is null or fi.status <> N'CONCEPT')
order by sd.is_terminal, sd.sort_order, coalesce(a.updated_at, a.created_at) desc;
`;

export const getInstallationDrawingPinOverviewSql = `
select
  p.drawing_pin_id,
  p.installation_document_id,
  p.stored_file_id,
  p.page_number,
  p.x_normalized,
  p.y_normalized,
  p.label,
  p.description,
  p.pin_kind,
  p.pin_status,
  p.created_at,
  p.updated_at,
  convert(varchar(18), p.row_version, 1) as row_version,
  d.title as drawing_title,
  d.document_number,
  d.revision as drawing_revision,
  sf.file_name as drawing_file_name,
  case when exists (
    select 1
    from dbo.InstallationDocument replacement
    where replacement.parent_document_id = d.document_id
      and replacement.relation_type = N'VERVANGING'
      and replacement.is_active = 1
  ) then cast(0 as bit) else cast(1 as bit) end as is_current_drawing_version,
  (
    select count(*)
    from dbo.FollowUpActionDrawingPinMap map
    where map.drawing_pin_id = p.drawing_pin_id
  ) as follow_up_count
from dbo.DrawingPin p
join dbo.InstallationDocument d
  on d.document_id = p.installation_document_id
join dbo.StoredFile sf
  on sf.stored_file_id = p.stored_file_id
 and sf.is_deleted = 0
where d.atrium_installation_code = @code
  and p.is_deleted = 0
order by
  case when p.pin_status = N'ACTIVE' then 0 else 1 end,
  case when p.pin_kind = N'COMPONENT_PLACED' then 0 when p.pin_kind = N'DEFICIENCY' then 1 else 2 end,
  coalesce(p.updated_at, p.created_at) desc,
  p.drawing_pin_id;
`;

export const historicalizeComponentPinsSql = `
set nocount on;
set xact_abort on;

declare @targets table (
  drawing_pin_id uniqueidentifier primary key,
  before_json nvarchar(max) not null
);

insert into @targets (drawing_pin_id, before_json)
select
  p.drawing_pin_id,
  (
    select
      p.installation_document_id,
      p.stored_file_id,
      p.page_number,
      p.x_normalized,
      p.y_normalized,
      p.label,
      p.description,
      p.pin_kind,
      p.pin_status
    for json path, without_array_wrapper
  )
from dbo.DrawingPin p
join dbo.InstallationDocument d on d.document_id = p.installation_document_id
where d.atrium_installation_code = @code
  and (@documentId = '00000000-0000-0000-0000-000000000000' or d.document_id = @documentId)
  and p.pin_kind = N'COMPONENT_PLACED'
  and p.pin_status = N'ACTIVE'
  and p.is_deleted = 0;

begin transaction;

update p
set
  pin_status = N'HISTORICAL',
  updated_at = sysutcdatetime(),
  updated_by = @actor
from dbo.DrawingPin p
join @targets target on target.drawing_pin_id = p.drawing_pin_id;

insert into dbo.DrawingPinEvent (
  drawing_pin_id,
  event_type,
  before_json,
  after_json,
  event_by
)
select
  target.drawing_pin_id,
  N'UPDATED',
  target.before_json,
  (
    select
      p.page_number,
      p.x_normalized,
      p.y_normalized,
      p.label,
      p.description,
      p.pin_kind,
      p.pin_status
    for json path, without_array_wrapper
  ),
  @actor
from @targets target
join dbo.DrawingPin p on p.drawing_pin_id = target.drawing_pin_id;

commit transaction;

select count(*) as historicalized_count from @targets;
`;

export const copyDrawingPinsToRevisionSql = `
set nocount on;
set xact_abort on;

if not exists (
  select 1
  from dbo.InstallationDocument source_document
  join dbo.InstallationDocument target_document
    on target_document.atrium_installation_code = source_document.atrium_installation_code
   and target_document.parent_document_id = source_document.document_id
   and target_document.relation_type = N'VERVANGING'
   and target_document.is_active = 1
  where source_document.atrium_installation_code = @code
    and source_document.document_id = @sourceDocumentId
    and target_document.document_id = @targetDocumentId
)
  throw 50000, 'drawing revision relation invalid', 1;

declare @pinMap table (
  source_pin_id uniqueidentifier primary key,
  target_pin_id uniqueidentifier not null unique
);

insert into @pinMap (source_pin_id, target_pin_id)
select
  source_pin.drawing_pin_id,
  convert(uniqueidentifier, substring(hashbytes(
    'SHA2_256',
    convert(varbinary(16), source_pin.drawing_pin_id) + convert(varbinary(16), @targetDocumentId)
  ), 1, 16))
from dbo.DrawingPin source_pin
where source_pin.installation_document_id = @sourceDocumentId
  and source_pin.pin_status = N'ACTIVE'
  and source_pin.is_deleted = 0;

begin transaction;

insert into dbo.DrawingPin (
  drawing_pin_id,
  installation_document_id,
  stored_file_id,
  page_number,
  x_normalized,
  y_normalized,
  label,
  description,
  pin_kind,
  pin_status,
  created_by
)
select
  pin_map.target_pin_id,
  target_document.document_id,
  target_document.stored_file_id,
  source_pin.page_number,
  source_pin.x_normalized,
  source_pin.y_normalized,
  source_pin.label,
  source_pin.description,
  source_pin.pin_kind,
  N'ACTIVE',
  @actor
from @pinMap pin_map
join dbo.DrawingPin source_pin on source_pin.drawing_pin_id = pin_map.source_pin_id
join dbo.InstallationDocument target_document on target_document.document_id = @targetDocumentId
where not exists (
  select 1
  from dbo.DrawingPin existing with (updlock, holdlock)
  where existing.drawing_pin_id = pin_map.target_pin_id
);

declare @copiedCount int = @@rowcount;

insert into dbo.FollowUpActionDrawingPinMap (
  follow_up_action_id,
  drawing_pin_id,
  created_by
)
select
  source_map.follow_up_action_id,
  pin_map.target_pin_id,
  @actor
from @pinMap pin_map
join dbo.FollowUpActionDrawingPinMap source_map on source_map.drawing_pin_id = pin_map.source_pin_id
join dbo.DrawingPin target_pin on target_pin.drawing_pin_id = pin_map.target_pin_id
where not exists (
  select 1
  from dbo.FollowUpActionDrawingPinMap existing_map
  where existing_map.follow_up_action_id = source_map.follow_up_action_id
    and existing_map.drawing_pin_id = pin_map.target_pin_id
);

insert into dbo.DrawingPinEvent (
  drawing_pin_id,
  event_type,
  after_json,
  event_by
)
select
  pin_map.target_pin_id,
  N'CREATED',
  (
    select
      @sourceDocumentId as source_document_id,
      pin_map.source_pin_id as source_drawing_pin_id,
      @targetDocumentId as installation_document_id,
      N'REVISION_COPY' as creation_reason
    for json path, without_array_wrapper
  ),
  @actor
from @pinMap pin_map
where not exists (
  select 1
  from dbo.DrawingPinEvent event_row
  where event_row.drawing_pin_id = pin_map.target_pin_id
    and event_row.event_type = N'CREATED'
);

commit transaction;

select
  @copiedCount as copied_count,
  (select count(*) from @pinMap) - @copiedCount as already_copied_count;
`;

export const createDrawingPinSql = `
set nocount on;
set xact_abort on;

if not exists (
  select 1
  from dbo.InstallationDocument d
  join dbo.StoredFile sf
    on sf.stored_file_id = d.stored_file_id
   and sf.is_deleted = 0
  where d.atrium_installation_code = @code
    and d.document_id = @documentId
    and d.is_active = 1
    and (
      lower(coalesce(sf.mime_type, N'')) = N'application/pdf'
      or lower(coalesce(sf.file_extension, N'')) = N'pdf'
      or lower(coalesce(sf.file_name, N'')) like N'%.pdf'
    )
)
  throw 50000, 'drawing document not found', 1;

declare @drawingPinId uniqueidentifier = newid();

begin transaction;

insert into dbo.DrawingPin (
  drawing_pin_id,
  installation_document_id,
  stored_file_id,
  page_number,
  x_normalized,
  y_normalized,
  label,
  description,
  pin_kind,
  pin_status,
  created_by
)
select
  @drawingPinId,
  d.document_id,
  d.stored_file_id,
  @pageNumber,
  @xNormalized,
  @yNormalized,
  @label,
  @description,
  @pinKind,
  N'ACTIVE',
  @actor
from dbo.InstallationDocument d
where d.document_id = @documentId;

insert into dbo.DrawingPinEvent (
  drawing_pin_id,
  event_type,
  after_json,
  event_by
)
select
  @drawingPinId,
  N'CREATED',
  (
    select
      @documentId as installation_document_id,
      (select d.stored_file_id from dbo.InstallationDocument d where d.document_id = @documentId) as stored_file_id,
      @pageNumber as page_number,
      @xNormalized as x_normalized,
      @yNormalized as y_normalized,
      @label as label,
      @description as description,
      @pinKind as pin_kind,
      N'ACTIVE' as pin_status
    for json path, without_array_wrapper
  ),
  @actor;

commit transaction;

select
  p.drawing_pin_id,
  p.installation_document_id,
  p.stored_file_id,
  p.page_number,
  p.x_normalized,
  p.y_normalized,
  p.label,
  p.description,
  p.pin_kind,
  p.pin_status,
  p.created_at,
  p.created_by,
  p.updated_at,
  p.updated_by,
  convert(varchar(18), p.row_version, 1) as row_version
from dbo.DrawingPin p
where p.drawing_pin_id = @drawingPinId;
`;

export const updateDrawingPinSql = `
set nocount on;
set xact_abort on;

declare @beforeJson nvarchar(max);

select @beforeJson = (
  select
    p.installation_document_id,
    p.stored_file_id,
    p.page_number,
    p.x_normalized,
    p.y_normalized,
    p.label,
    p.description,
    p.pin_kind,
    p.pin_status
  from dbo.DrawingPin p
  join dbo.InstallationDocument d
    on d.document_id = p.installation_document_id
  where p.drawing_pin_id = @drawingPinId
    and d.atrium_installation_code = @code
    and p.is_deleted = 0
  for json path, without_array_wrapper
);

if @beforeJson is null
  throw 50000, 'drawing pin not found', 1;

begin transaction;

update p
set
  page_number = @pageNumber,
  x_normalized = @xNormalized,
  y_normalized = @yNormalized,
  label = @label,
  description = @description,
  pin_kind = @pinKind,
  pin_status = @pinStatus,
  updated_at = sysutcdatetime(),
  updated_by = @actor
from dbo.DrawingPin p
join dbo.InstallationDocument d
  on d.document_id = p.installation_document_id
where p.drawing_pin_id = @drawingPinId
  and d.atrium_installation_code = @code
  and p.is_deleted = 0
  and p.row_version = convert(binary(8), @rowVersion, 1);

if @@rowcount = 0
begin
  rollback transaction;
  throw 50000, 'drawing pin version conflict', 1;
end;

insert into dbo.DrawingPinEvent (
  drawing_pin_id,
  event_type,
  before_json,
  after_json,
  event_by
)
select
  @drawingPinId,
  case
    when json_value(@beforeJson, '$.page_number') <> convert(nvarchar(20), @pageNumber)
      or json_value(@beforeJson, '$.x_normalized') <> convert(nvarchar(50), @xNormalized)
      or json_value(@beforeJson, '$.y_normalized') <> convert(nvarchar(50), @yNormalized)
    then N'MOVED'
    else N'UPDATED'
  end,
  @beforeJson,
  (
    select
      @pageNumber as page_number,
      @xNormalized as x_normalized,
      @yNormalized as y_normalized,
      @label as label,
      @description as description,
      @pinKind as pin_kind,
      @pinStatus as pin_status
    for json path, without_array_wrapper
  ),
  @actor;

commit transaction;

select
  p.drawing_pin_id,
  p.installation_document_id,
  p.stored_file_id,
  p.page_number,
  p.x_normalized,
  p.y_normalized,
  p.label,
  p.description,
  p.pin_kind,
  p.pin_status,
  p.created_at,
  p.created_by,
  p.updated_at,
  p.updated_by,
  convert(varchar(18), p.row_version, 1) as row_version
from dbo.DrawingPin p
where p.drawing_pin_id = @drawingPinId;
`;

export const deleteDrawingPinSql = `
set nocount on;
set xact_abort on;

declare @beforeJson nvarchar(max);

select @beforeJson = (
  select
    p.installation_document_id,
    p.stored_file_id,
    p.page_number,
    p.x_normalized,
    p.y_normalized,
    p.label,
    p.description
  from dbo.DrawingPin p
  join dbo.InstallationDocument d
    on d.document_id = p.installation_document_id
  where p.drawing_pin_id = @drawingPinId
    and d.atrium_installation_code = @code
    and p.is_deleted = 0
    and p.row_version = convert(binary(8), @rowVersion, 1)
  for json path, without_array_wrapper
);

if @beforeJson is null
  throw 50000, 'drawing pin not found or version conflict', 1;

begin transaction;

delete from dbo.FollowUpActionDrawingPinMap
where drawing_pin_id = @drawingPinId;

update dbo.DrawingPin
set
  is_deleted = 1,
  deleted_at = sysutcdatetime(),
  deleted_by = @actor,
  updated_at = sysutcdatetime(),
  updated_by = @actor
where drawing_pin_id = @drawingPinId;

insert into dbo.DrawingPinEvent (
  drawing_pin_id,
  event_type,
  before_json,
  event_by
)
values (
  @drawingPinId,
  N'DELETED',
  @beforeJson,
  @actor
);

commit transaction;

select cast(1 as bit) as ok;
`;

export const linkDrawingPinActionSql = `
set nocount on;
set xact_abort on;

if not exists (
  select 1
  from dbo.DrawingPin p
  join dbo.InstallationDocument d
    on d.document_id = p.installation_document_id
  where p.drawing_pin_id = @drawingPinId
    and d.atrium_installation_code = @code
    and p.is_deleted = 0
)
  throw 50000, 'drawing pin not found', 1;

if not exists (
  select 1
  from dbo.FollowUpActionInstallationContext c
  where c.follow_up_action_id = @followUpActionId
    and c.atrium_installation_code = @code
)
  throw 50000, 'follow-up action not found for installation', 1;

begin transaction;

if not exists (
  select 1
  from dbo.FollowUpActionDrawingPinMap
  where drawing_pin_id = @drawingPinId
    and follow_up_action_id = @followUpActionId
)
begin
  insert into dbo.FollowUpActionDrawingPinMap (
    follow_up_action_id,
    drawing_pin_id,
    created_by
  )
  values (
    @followUpActionId,
    @drawingPinId,
    @actor
  );

  insert into dbo.DrawingPinEvent (
    drawing_pin_id,
    event_type,
    after_json,
    event_by
  )
  values (
    @drawingPinId,
    N'ACTION_LINKED',
    (select @followUpActionId as follow_up_action_id for json path, without_array_wrapper),
    @actor
  );
end;

commit transaction;

select cast(1 as bit) as ok;
`;

export const unlinkDrawingPinActionSql = `
set nocount on;
set xact_abort on;

if not exists (
  select 1
  from dbo.DrawingPin p
  join dbo.InstallationDocument d
    on d.document_id = p.installation_document_id
  where p.drawing_pin_id = @drawingPinId
    and d.atrium_installation_code = @code
    and p.is_deleted = 0
)
  throw 50000, 'drawing pin not found', 1;

begin transaction;

delete from dbo.FollowUpActionDrawingPinMap
where drawing_pin_id = @drawingPinId
  and follow_up_action_id = @followUpActionId;

if @@rowcount > 0
begin
  insert into dbo.DrawingPinEvent (
    drawing_pin_id,
    event_type,
    before_json,
    event_by
  )
  values (
    @drawingPinId,
    N'ACTION_UNLINKED',
    (select @followUpActionId as follow_up_action_id for json path, without_array_wrapper),
    @actor
  );
end;

commit transaction;

select cast(1 as bit) as ok;
`;

export const createManualFollowUpForPinSql = `
set nocount on;
set xact_abort on;

declare @installationId uniqueidentifier;
declare @followUpActionId uniqueidentifier = newid();

select @installationId = i.installation_id
from dbo.Installation i
where i.atrium_installation_code = @code;

if @installationId is null
  throw 50000, 'installation not found', 1;

if not exists (
  select 1
  from dbo.DrawingPin p
  join dbo.InstallationDocument d
    on d.document_id = p.installation_document_id
  where p.drawing_pin_id = @drawingPinId
    and d.atrium_installation_code = @code
    and p.is_deleted = 0
)
  throw 50000, 'drawing pin not found', 1;

begin transaction;

insert into dbo.FollowUpAction (
  follow_up_action_id,
  source_type,
  kind,
  workflow_title,
  workflow_description,
  category,
  priority,
  responsibility_type,
  certificate_impact,
  status,
  status_set_at,
  status_set_by,
  due_date,
  internal_note,
  customer_note,
  customer_visible,
  created_by
)
values (
  @followUpActionId,
  N'MANUAL',
  N'workflow',
  @title,
  @description,
  @category,
  @priority,
  @responsibilityType,
  @certificateImpact,
  N'OPEN',
  sysutcdatetime(),
  @actorUserObjectId,
  @dueDate,
  @internalNote,
  @customerNote,
  @customerVisible,
  @actor
);

insert into dbo.FollowUpActionInstallationContext (
  follow_up_action_id,
  installation_id,
  atrium_installation_code,
  is_primary,
  display_snapshot,
  verified_at,
  created_by
)
values (
  @followUpActionId,
  @installationId,
  @code,
  1,
  @code,
  sysutcdatetime(),
  @actor
);

insert into dbo.FollowUpActionDrawingPinMap (
  follow_up_action_id,
  drawing_pin_id,
  created_by
)
values (
  @followUpActionId,
  @drawingPinId,
  @actor
);

insert into dbo.FollowUpActionEvent (
  follow_up_action_id,
  event_type,
  new_values_json,
  actor_user_object_id,
  actor_display_name_snapshot,
  actor_email_snapshot
)
values (
  @followUpActionId,
  N'CREATED',
  (
    select
      N'MANUAL' as source_type,
      @title as workflow_title,
      @priority as priority,
      @responsibilityType as responsibility_type,
      @dueDate as due_date,
      @drawingPinId as drawing_pin_id
    for json path, without_array_wrapper
  ),
  @actorUserObjectId,
  @actorDisplayName,
  @actorEmail
);

insert into dbo.DrawingPinEvent (
  drawing_pin_id,
  event_type,
  after_json,
  event_by
)
values (
  @drawingPinId,
  N'ACTION_LINKED',
  (select @followUpActionId as follow_up_action_id for json path, without_array_wrapper),
  @actor
);

commit transaction;

select
  a.follow_up_action_id,
  a.workflow_title,
  a.status,
  a.priority,
  a.responsibility_type,
  a.due_date,
  a.created_at,
  a.created_by
from dbo.FollowUpAction a
where a.follow_up_action_id = @followUpActionId;
`;
