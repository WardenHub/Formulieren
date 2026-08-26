// Installation-wide immutable review batches and server-side finalization gate.

const reviewContextCte = `
;with form_context as (
  select top 1 fi.form_instance_id, fi.installation_id, fi.atrium_installation_code
  from dbo.FormInstance fi
  where fi.form_instance_id = @formInstanceId
),
latest_batch as (
  select top 1 b.follow_up_review_batch_id, b.completed_at
  from dbo.FollowUpReviewBatch b
  join form_context fc on fc.atrium_installation_code = b.atrium_installation_code
  where b.status = N'COMPLETED'
  order by b.completed_at desc, b.opened_at desc, b.follow_up_review_batch_id desc
),
relevant_actions as (
  select distinct
    a.follow_up_action_id, a.status, a.category, a.assignment_type,
    a.assigned_user_object_id, a.assigned_role_code, a.due_date,
    a.created_at, a.updated_at
  from dbo.FollowUpAction a
  join dbo.FollowUpActionInstallationContext ic
    on ic.follow_up_action_id = a.follow_up_action_id
  join form_context fc
    on fc.atrium_installation_code = ic.atrium_installation_code
  join dbo.FollowUpStatusDefinition sd
    on sd.status_code = a.status
  where a.kind = N'workflow'
    and sd.requires_review = 1
),
evaluated as (
  select
    ra.*,
    r.reviewed_at,
    r.status_at_review,
    category_rule.requires_assignment,
    category_rule.requires_due_date,
    category_rule.requires_attachment,
    attachment_count = (
      select count(*)
      from dbo.FollowUpActionAttachmentMap am
      join dbo.StoredFile sf on sf.stored_file_id = am.stored_file_id and sf.is_deleted = 0
      where am.follow_up_action_id = ra.follow_up_action_id
    )
  from relevant_actions ra
  left join latest_batch lb on 1 = 1
  left join dbo.FollowUpActionReview r
    on r.follow_up_review_batch_id = lb.follow_up_review_batch_id
   and r.follow_up_action_id = ra.follow_up_action_id
  left join dbo.FollowUpCategoryRule category_rule
    on category_rule.category = ra.category
   and category_rule.is_active = 1
)
`;

export const getFollowUpFinalizeGateSql = `
${reviewContextCte}
select
  latest_review_batch_id = (select follow_up_review_batch_id from latest_batch),
  required_review_count = count(*),
  reviewed_count = isnull(sum(case when reviewed_at is not null
                                     and reviewed_at >= coalesce(updated_at, created_at)
                                     and status_at_review = status then 1 else 0 end), 0),
  missing_review_count = isnull(sum(case when reviewed_at is null
                                           or reviewed_at < coalesce(updated_at, created_at)
                                           or status_at_review <> status then 1 else 0 end), 0),
  missing_assignment_count = isnull(sum(case when isnull(requires_assignment, 0) = 1
                                               and assignment_type = N'NONE' then 1 else 0 end), 0),
  missing_due_date_count = isnull(sum(case when isnull(requires_due_date, 0) = 1
                                             and due_date is null then 1 else 0 end), 0),
  missing_attachment_count = isnull(sum(case when isnull(requires_attachment, 0) = 1
                                               and attachment_count = 0 then 1 else 0 end), 0),
  can_finalize = cast(case when
    isnull(sum(case when reviewed_at is null
              or reviewed_at < coalesce(updated_at, created_at)
              or status_at_review <> status then 1 else 0 end), 0) = 0
    and isnull(sum(case when isnull(requires_assignment, 0) = 1 and assignment_type = N'NONE' then 1 else 0 end), 0) = 0
    and isnull(sum(case when isnull(requires_due_date, 0) = 1 and due_date is null then 1 else 0 end), 0) = 0
    and isnull(sum(case when isnull(requires_attachment, 0) = 1 and attachment_count = 0 then 1 else 0 end), 0) = 0
    then 1 else 0 end as bit)
from evaluated;
`;

export const getFollowUpReviewItemsSql = `
${reviewContextCte}
select
  a.follow_up_action_id,
  a.workflow_title,
  a.workflow_description,
  a.category,
  a.status,
  a.certificate_impact,
  a.certificate_impact_override,
  isnull(a.certificate_impact_override, a.certificate_impact) as effective_certificate_impact,
  a.customer_visible,
  a.assignment_type,
  coalesce(a.assigned_display_name_snapshot, a.assigned_email_snapshot, a.assigned_role_code) as assigned_to,
  a.due_date,
  fs.form_instance_id as source_form_instance_id,
  fs.source_item_code,
  e.attachment_count,
  isnull(e.requires_assignment, 0) as requires_assignment,
  isnull(e.requires_due_date, 0) as requires_due_date,
  isnull(e.requires_attachment, 0) as requires_attachment,
  e.reviewed_at,
  e.status_at_review,
  coalesce((
    select
      p.drawing_pin_id,
      p.installation_document_id,
      p.stored_file_id,
      p.page_number,
      p.label as pin_label,
      d.title as drawing_title,
      sf.file_name as drawing_file_name
    from dbo.FollowUpActionDrawingPinMap pin_map
    join dbo.DrawingPin p
      on p.drawing_pin_id = pin_map.drawing_pin_id
     and p.is_deleted = 0
    join dbo.InstallationDocument d
      on d.document_id = p.installation_document_id
    left join dbo.StoredFile sf
      on sf.stored_file_id = p.stored_file_id
     and sf.is_deleted = 0
    where pin_map.follow_up_action_id = a.follow_up_action_id
    order by d.title, p.page_number, p.label
    for json path
  ), N'[]') as drawing_pins_json
from evaluated e
join dbo.FollowUpAction a on a.follow_up_action_id = e.follow_up_action_id
left join dbo.FollowUpActionFormSource fs on fs.follow_up_action_id = a.follow_up_action_id
order by a.created_at asc, a.follow_up_action_id asc;
`;

export const createFollowUpReviewBatchSql = `
set xact_abort on;

declare @installationId uniqueidentifier;
declare @atriumCode nvarchar(450);
declare @reviewBatchId uniqueidentifier = newid();
declare @now datetime2(3) = sysutcdatetime();

select top 1
  @installationId = fi.installation_id,
  @atriumCode = fi.atrium_installation_code
from dbo.FormInstance fi
where fi.form_instance_id = @formInstanceId;

if @installationId is null or @atriumCode is null
  throw 50000, 'form instance not found', 1;

declare @reviewItems table (
  follow_up_action_id uniqueidentifier primary key,
  review_decision nvarchar(30) not null,
  customer_discussed bit not null,
  customer_visible bit not null,
  certificate_impact nvarchar(20) not null,
  review_note nvarchar(4000) null
);

insert into @reviewItems
  (follow_up_action_id, review_decision, customer_discussed, customer_visible, certificate_impact, review_note)
select
  try_convert(uniqueidentifier, json_value(j.value, '$.follow_up_action_id')),
  upper(nullif(ltrim(rtrim(convert(nvarchar(30), json_value(j.value, '$.review_decision')))), N'')),
  try_convert(bit, json_value(j.value, '$.customer_discussed')),
  try_convert(bit, json_value(j.value, '$.customer_visible')),
  lower(nullif(ltrim(rtrim(convert(nvarchar(20), json_value(j.value, '$.certificate_impact')))), N'')),
  nullif(ltrim(rtrim(convert(nvarchar(4000), json_value(j.value, '$.review_note')))), N'')
from openjson(@itemsJson) j;

declare @required table (
  follow_up_action_id uniqueidentifier primary key,
  status nvarchar(30) not null
);

insert into @required (follow_up_action_id, status)
select distinct a.follow_up_action_id, a.status
from dbo.FollowUpAction a
join dbo.FollowUpActionInstallationContext ic
  on ic.follow_up_action_id = a.follow_up_action_id
join dbo.FollowUpStatusDefinition sd
  on sd.status_code = a.status
where ic.atrium_installation_code = @atriumCode
  and a.kind = N'workflow'
  and sd.requires_review = 1;

if exists (select 1 from @required r where not exists (select 1 from @reviewItems i where i.follow_up_action_id = r.follow_up_action_id))
  throw 50000, 'follow-up review incomplete', 1;

if exists (select 1 from @reviewItems i where not exists (select 1 from @required r where r.follow_up_action_id = i.follow_up_action_id))
  throw 50000, 'follow-up review contains unrelated action', 1;

if exists (
  select 1 from @reviewItems
  where review_decision not in (N'APPROVED', N'UPDATED', N'DEFERRED', N'NOT_APPLICABLE')
     or certificate_impact not in (N'yes', N'no')
)
  throw 50000, 'follow-up review classification invalid', 1;

begin transaction;

insert into dbo.FollowUpReviewBatch
(
  follow_up_review_batch_id, installation_id, atrium_installation_code,
  form_instance_id, status, review_scope, opened_at, opened_by
)
values
(
  @reviewBatchId, @installationId, @atriumCode,
  @formInstanceId, N'OPEN', N'INSTALLATION', @now, @actor
);

insert into dbo.FollowUpActionReview
(
  follow_up_review_batch_id, follow_up_action_id, review_decision,
  status_at_review, fields_changed, customer_discussed, customer_visible,
  certificate_impact, review_note, reviewed_at, reviewed_by
)
select
  @reviewBatchId, a.follow_up_action_id, i.review_decision,
  a.status,
  cast(case when a.customer_visible <> i.customer_visible
              or isnull(a.certificate_impact_override, a.certificate_impact) <> i.certificate_impact
            then 1 else 0 end as bit),
  i.customer_discussed, i.customer_visible, i.certificate_impact,
  i.review_note, @now, @actor
from dbo.FollowUpAction a
join @reviewItems i on i.follow_up_action_id = a.follow_up_action_id;

update a
set customer_visible = i.customer_visible,
    certificate_impact_override = i.certificate_impact,
    updated_at = @now,
    updated_by = @actor
from dbo.FollowUpAction a
join @reviewItems i on i.follow_up_action_id = a.follow_up_action_id;

insert into dbo.FollowUpActionEvent
  (follow_up_action_id, event_type, new_values_json, actor_display_name_snapshot, created_at)
select
  i.follow_up_action_id, N'REVIEWED',
  (select @reviewBatchId as review_batch_id, i.review_decision, i.customer_discussed,
          i.customer_visible, i.certificate_impact, i.review_note
   for json path, without_array_wrapper),
  @actor, @now
from @reviewItems i;

update dbo.FollowUpReviewBatch
set status = N'COMPLETED', completed_at = @now, completed_by = @actor
where follow_up_review_batch_id = @reviewBatchId;

commit transaction;

select @reviewBatchId as follow_up_review_batch_id, @atriumCode as atrium_installation_code;
`;
