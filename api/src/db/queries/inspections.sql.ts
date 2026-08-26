import { operationalCtes } from "./installationOperational.sql.js";

export const listInspectionOverviewSql = `${operationalCtes}
select top (@take)
  o.atrium_installation_code,o.installation_name,o.object_name,o.formatted_address,
  coalesce(o.gebruiker_naam,o.eigenaar_naam,o.debiteur_naam) as relation_name,
  o.certification_required,o.certificate_status,o.nearest_certificate_valid_until,
  datediff(day,cast(sysutcdatetime() as date),o.nearest_certificate_valid_until) as certificate_days_remaining,
  o.active_inspection_case_count,o.active_inspection_case_status,o.inspection_due_date,
  o.inspection_attention_required,o.attention_status,o.attention_reason,
  c.inspection_case_id,c.inspection_type,c.status,c.status_display_name,c.due_date,c.inspection_body,
  c.assigned_user_id,c.assigned_role_code,c.atrium_work_order_code,c.appointment_status,c.planned_date,c.execution_date,c.reinspection_required,
  cert.certificate_number,cert.certificate_valid_until,
  coalesce(doc.missing_document_count,0) as missing_required_document_count,
  coalesce(act.open_action_count,0) as open_action_count,
  cast(case when c.inspection_case_id is not null and c.status=N'EXECUTED_AWAITING_REPORT' and not exists(select 1 from dbo.InspectionCaseReport r where r.inspection_case_id=c.inspection_case_id and r.is_current=1) then 1 else 0 end as bit) as inspection_report_missing,
  coalesce((
    select distinct s.scope
    from (
      select r.scope from dbo.InstallationCertificationRequirement r where r.atrium_installation_code=o.atrium_installation_code and r.requirement_status=N'REQUIRED'
      union
      select cs.scope from dbo.InspectionCaseScope cs where cs.inspection_case_id=c.inspection_case_id
    ) s
    order by s.scope for json path
  ),N'[]') as scopes_json
from operational o
outer apply (
  select top 1 ic.*,sd.display_name as status_display_name
  from dbo.InspectionCase ic
  join dbo.InspectionCaseStatusDefinition sd on sd.status_code=ic.status and sd.is_terminal=0
  where ic.atrium_installation_code=o.atrium_installation_code
  order by case ic.status when N'REPAIR_REQUIRED' then 1 when N'REINSPECTION_REQUIRED' then 2 when N'ATTENTION_REQUIRED' then 3 else 10 end,coalesce(ic.due_date,convert(date,'99991231')),ic.created_at
) c
outer apply (
  select top 1 ic.certificate_number,ic.valid_until as certificate_valid_until
  from dbo.InstallationCertificate ic
  where ic.atrium_installation_code=o.atrium_installation_code and ic.certificate_type=N'INSPECTION' and ic.record_status=N'CURRENT' and ic.verification_status<>N'REJECTED'
  order by coalesce(ic.valid_until,ic.issue_date) desc,ic.created_at desc
) cert
outer apply (
  select count_big(*) as missing_document_count
  from dbo.InspectionCaseDocumentRequirement d
  where d.inspection_case_id=c.inspection_case_id and d.requirement_level=N'REQUIRED' and d.status=N'MISSING'
) doc
outer apply (
  select count_big(*) as open_action_count
  from dbo.FollowUpActionInspectionCaseSource s
  join dbo.FollowUpAction a on a.follow_up_action_id=s.follow_up_action_id
  join dbo.FollowUpStatusDefinition st on st.status_code=a.status and st.is_terminal=0
  where s.inspection_case_id=c.inspection_case_id
) act
where (o.certification_required=1 or c.inspection_case_id is not null)
  and (@qLike is null or o.atrium_installation_code like @qLike or o.installation_name like @qLike or o.object_name like @qLike or o.formatted_address like @qLike or o.gebruiker_naam like @qLike or o.eigenaar_naam like @qLike or o.debiteur_naam like @qLike or c.atrium_work_order_code like @qLike)
  and (@scope is null or exists(select 1 from dbo.InstallationCertificationRequirement r where r.atrium_installation_code=o.atrium_installation_code and r.requirement_status=N'REQUIRED' and r.scope=@scope) or exists(select 1 from dbo.InspectionCaseScope s where s.inspection_case_id=c.inspection_case_id and s.scope=@scope))
  and (@status is null or c.status=@status)
  and (@inspectionBody is null or c.inspection_body=@inspectionBody)
  and (@attentionFilter<>N'CERTIFICATE_MISSING' or o.certificate_status=N'MISSING')
  and (@attentionFilter<>N'CERTIFICATE_EXPIRING' or o.certificate_status=N'EXPIRING')
  and (@attentionFilter<>N'CERTIFICATE_EXPIRED' or o.certificate_status in(N'EXPIRED',N'REVOKED'))
  and (@attentionFilter<>N'NO_ACTIVE_CASE' or c.inspection_case_id is null)
  and (@attentionFilter<>N'PLANNING_MISSING' or c.inspection_case_id is not null and c.appointment_status=N'NO_PLANNING')
  and (@attentionFilter<>N'APPOINTMENT_UNCONFIRMED' or c.appointment_status=N'PLANNED_UNCONFIRMED')
  and (@attentionFilter<>N'DOCUMENTS_MISSING' or coalesce(doc.missing_document_count,0)>0)
  and (@attentionFilter<>N'REPORT_MISSING' or c.status=N'EXECUTED_AWAITING_REPORT' and not exists(select 1 from dbo.InspectionCaseReport r where r.inspection_case_id=c.inspection_case_id and r.is_current=1))
  and (@attentionFilter<>N'REINSPECTION_REQUIRED' or c.reinspection_required=1)
  and (@attentionFilter<>N'OPEN_ACTIONS' or coalesce(act.open_action_count,0)>0)
order by case o.attention_status when N'CRITICAL' then 0 when N'ATTENTION' then 1 else 2 end,coalesce(c.due_date,o.inspection_due_date,convert(date,'99991231')),o.object_name,o.atrium_installation_code;
`;

export const listInspectionCasesSql = `
select top (@take)
  c.inspection_case_id, c.atrium_installation_code, c.parent_inspection_case_id,
  c.inspection_type, c.due_date, c.signal_from_date, c.status, sd.display_name as status_display_name,
  c.inspection_body, c.assigned_user_id, c.assigned_role_code,
  c.atrium_work_order_key, c.atrium_work_order_code, c.planned_date,
  c.appointment_status, c.execution_date, c.conclusion, c.reinspection_required,
  c.logbook_linked, c.inspection_body_has_logbook_access,
  c.document_package_available_in_logbook, c.report_uploaded_to_logbook,
  c.created_at, c.updated_at, convert(varchar(18), c.row_version, 1) as row_version,
  coalesce(a.installatie_naam, a.obj_naam, c.atrium_installation_code) as installation_name,
  a.obj_naam as object_name, a.obj_adr_formatted as formatted_address,
  (select s.scope from dbo.InspectionCaseScope s where s.inspection_case_id = c.inspection_case_id for json path) as scopes_json,
  (select count_big(*) from dbo.InspectionCaseDocumentRequirement r where r.inspection_case_id = c.inspection_case_id and r.requirement_level = N'REQUIRED' and r.status = N'MISSING') as missing_required_document_count,
  (select count_big(*) from dbo.FollowUpActionInspectionCaseSource s join dbo.FollowUpAction f on f.follow_up_action_id = s.follow_up_action_id join dbo.FollowUpStatusDefinition fs on fs.status_code = f.status and fs.is_terminal = 0 where s.inspection_case_id = c.inspection_case_id) as open_action_count
from dbo.InspectionCase c
join dbo.InspectionCaseStatusDefinition sd on sd.status_code = c.status
left join dbo.AtriumInstallationBase a on a.installatie_code = c.atrium_installation_code
where (@status is null or c.status = @status)
  and (@scope is null or exists (select 1 from dbo.InspectionCaseScope s where s.inspection_case_id = c.inspection_case_id and s.scope = @scope))
  and (@assignedTo is null or c.assigned_user_id = @assignedTo or c.assigned_role_code = @assignedTo)
  and (@activeOnly = 0 or sd.is_terminal = 0)
  and (@qLike is null or c.atrium_installation_code like @qLike or c.atrium_work_order_code like @qLike or c.inspection_body like @qLike or a.installatie_naam like @qLike or a.obj_naam like @qLike)
order by case when sd.is_terminal = 0 then 0 else 1 end, coalesce(c.due_date, convert(date, '99991231')), c.created_at desc;
`;

export const getInspectionCaseSql = `
select top 1 c.*, sd.display_name as status_display_name, convert(varchar(18), c.row_version, 1) as row_version,
  coalesce(a.installatie_naam, a.obj_naam, c.atrium_installation_code) as installation_name,
  a.obj_naam as object_name, a.obj_adr_formatted as formatted_address,
  coalesce(a.gebruiker_naam,a.eigenaar_naam,a.debiteur_naam) as relation_name
from dbo.InspectionCase c
join dbo.InspectionCaseStatusDefinition sd on sd.status_code = c.status
left join dbo.AtriumInstallationBase a on a.installatie_code = c.atrium_installation_code
where c.inspection_case_id = @caseId;

select s.* from dbo.InspectionCaseScope s where s.inspection_case_id = @caseId order by s.scope;

select w.* from dbo.InspectionCaseWorkOrderSnapshot w where w.inspection_case_id = @caseId order by w.source_modified_at desc;

select r.*, d.title as document_title, sf.file_name, convert(varchar(18), r.row_version, 1) as row_version
from dbo.InspectionCaseDocumentRequirement r
left join dbo.InstallationDocument d on d.document_id = r.installation_document_id
left join dbo.StoredFile sf on sf.stored_file_id = r.stored_file_id and sf.is_deleted = 0
where r.inspection_case_id = @caseId order by r.requirement_level desc, r.requirement_key;

select p.*, convert(varchar(18), p.row_version, 1) as row_version,
  (select i.installation_document_id, i.stored_file_id, i.document_type_key, i.document_label_snapshot from dbo.InspectionCaseDocumentPackageItem i where i.inspection_case_document_package_id = p.inspection_case_document_package_id for json path) as items_json
from dbo.InspectionCaseDocumentPackage p where p.inspection_case_id = @caseId order by p.package_version desc;

select r.*, d.title as document_title, sf.file_name
from dbo.InspectionCaseReport r
join dbo.InstallationDocument d on d.document_id = r.installation_document_id
join dbo.StoredFile sf on sf.stored_file_id = r.stored_file_id and sf.is_deleted = 0
where r.inspection_case_id = @caseId order by r.received_at desc;

select f.*, s.source_kind, s.is_blocking, s.source_fingerprint,
  coalesce((
    select p.drawing_pin_id, p.installation_document_id, p.stored_file_id, p.page_number,
      p.label as pin_label, d.title as drawing_title, sf.file_name as drawing_file_name
    from dbo.FollowUpActionDrawingPinMap pin_map
    join dbo.DrawingPin p on p.drawing_pin_id=pin_map.drawing_pin_id and p.is_deleted=0
    join dbo.InstallationDocument d on d.document_id=p.installation_document_id
    join dbo.StoredFile sf on sf.stored_file_id=p.stored_file_id and sf.is_deleted=0
    where pin_map.follow_up_action_id=f.follow_up_action_id
    order by d.title,p.page_number,p.label
    for json path
  ),N'[]') as drawing_pins_json
from dbo.FollowUpActionInspectionCaseSource s
join dbo.FollowUpAction f on f.follow_up_action_id = s.follow_up_action_id
where s.inspection_case_id = @caseId order by f.created_at desc;

select e.* from dbo.InspectionCaseEvent e where e.inspection_case_id = @caseId order by e.event_at desc, e.inspection_case_event_id desc;

select d.document_id, d.stored_file_id, d.document_type_key, d.title, sf.file_name, sf.content_type, sf.checksum_sha256, d.created_at
from dbo.InstallationDocument d
join dbo.InspectionCase c on c.atrium_installation_code = d.atrium_installation_code
join dbo.StoredFile sf on sf.stored_file_id = d.stored_file_id and sf.is_deleted = 0
where c.inspection_case_id = @caseId and d.is_active = 1
order by d.created_at desc;

select c.installation_certificate_id, c.certificate_number, c.description, c.valid_until, c.record_status, c.verification_status, c.installation_document_id, c.stored_file_id
from dbo.InstallationCertificate c
where c.source_inspection_case_id = @caseId and c.certificate_type = N'INSPECTION'
order by c.created_at desc;

select r.* from dbo.InstallationCertificationRequirement r
join dbo.InspectionCase c on c.atrium_installation_code=r.atrium_installation_code
where c.inspection_case_id=@caseId order by r.scope;

select cert.installation_certificate_id,cert.certificate_number,cert.description,cert.issue_date,cert.valid_until,cert.record_status,cert.verification_status,cert.installation_document_id,cert.stored_file_id,
  (select s.scope from dbo.InstallationCertificateScope s where s.installation_certificate_id=cert.installation_certificate_id order by s.scope for json path) as scopes_json
from dbo.InstallationCertificate cert
join dbo.InspectionCase c on c.atrium_installation_code=cert.atrium_installation_code
where c.inspection_case_id=@caseId and cert.certificate_type=N'INSPECTION'
order by case cert.record_status when N'CURRENT' then 0 else 1 end,coalesce(cert.valid_until,cert.issue_date) desc,cert.created_at desc;
`;

export const getInspectionCaseEventsSql = `
select e.* from dbo.InspectionCaseEvent e where e.inspection_case_id=@caseId order by e.event_at desc,e.inspection_case_event_id desc;
`;

export const createInspectionCaseSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  declare @installationId uniqueidentifier;
  select @installationId = installation_id from dbo.Installation where atrium_installation_code = @installationCode;
  if @installationId is null throw 50000, 'installation not found', 1;
  declare @caseId uniqueidentifier = newid();
  insert dbo.InspectionCase (inspection_case_id, installation_id, atrium_installation_code, parent_inspection_case_id, inspection_type, due_date, signal_from_date, status, inspection_body, assigned_user_id, assigned_role_code, source_fingerprint, created_by)
  values (@caseId, @installationId, @installationCode, @parentCaseId, @inspectionType, @dueDate, @signalFromDate, @status, @inspectionBody, @assignedUserId, @assignedRoleCode, @sourceFingerprint, @actor);
  insert dbo.InspectionCaseScope (inspection_case_id, scope, created_by)
  select @caseId, upper(trim([value])), @actor from openjson(@scopesJson);
  insert dbo.InspectionCaseDocumentRequirement (inspection_case_id, requirement_key, document_type_key, requirement_level, responsibility_type, is_blocking, created_by)
  select @caseId, d.requirement_key, d.document_type_key, d.requirement_level, d.responsibility_type, d.is_blocking, @actor
  from dbo.InspectionDocumentRequirementDefinition d where d.is_active = 1;
  insert dbo.InspectionCaseEvent (inspection_case_id, event_type, after_json, event_by)
  values (@caseId, N'CASE_CREATED', json_object('status': @status, 'inspectionType': @inspectionType, 'scopes': json_query(@scopesJson)), @actor);
  commit transaction;
  select @caseId as inspection_case_id;
end try begin catch if @@trancount > 0 rollback transaction; throw; end catch;
`;

export const updateInspectionCaseSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  declare @before nvarchar(max) = (select * from dbo.InspectionCase where inspection_case_id = @caseId for json path, without_array_wrapper);
  declare @oldStatus nvarchar(40), @oldDue date, @oldBody nvarchar(200);
  select @oldStatus=status, @oldDue=due_date, @oldBody=inspection_body from dbo.InspectionCase where inspection_case_id=@caseId;
  if @oldStatus is null throw 50000, 'inspection case not found', 1;
  if @status=N'COMPLETED' throw 50000, 'use inspection completion gate', 1;
  if not exists (select 1 from dbo.InspectionCaseTransitionDefinition where source_status=@oldStatus and target_status=@status and is_active=1) and @oldStatus<>@status throw 50000, 'inspection status transition invalid', 1;
  update dbo.InspectionCase set due_date=@dueDate, status=@status, inspection_body=@inspectionBody,
    logbook_linked=@logbookLinked, inspection_body_has_logbook_access=@inspectionBodyHasLogbookAccess,
    document_package_available_in_logbook=@packageAvailableInLogbook, report_uploaded_to_logbook=@reportUploadedToLogbook,
    updated_at=sysutcdatetime(), updated_by=@actor
  where inspection_case_id=@caseId and row_version=convert(binary(8),@rowVersion,1);
  if @@rowcount=0 throw 50000, 'inspection case version conflict', 1;
  declare @after nvarchar(max)=(select * from dbo.InspectionCase where inspection_case_id=@caseId for json path, without_array_wrapper);
  if @oldStatus<>@status insert dbo.InspectionCaseEvent(inspection_case_id,event_type,before_json,after_json,event_by) values(@caseId,case when @status=N'CANCELLED' then N'CASE_CANCELLED' else N'STATUS_CHANGED' end,@before,@after,@actor);
  if isnull(convert(nvarchar(10),@oldDue,23),N'')<>isnull(convert(nvarchar(10),@dueDate,23),N'') insert dbo.InspectionCaseEvent(inspection_case_id,event_type,before_json,after_json,event_by) values(@caseId,N'DUE_DATE_CHANGED',@before,@after,@actor);
  if isnull(@oldBody,N'')<>isnull(@inspectionBody,N'') insert dbo.InspectionCaseEvent(inspection_case_id,event_type,before_json,after_json,event_by) values(@caseId,N'INSPECTION_BODY_CHANGED',@before,@after,@actor);
  commit transaction;
  select convert(varchar(18),row_version,1) as row_version from dbo.InspectionCase where inspection_case_id=@caseId;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;

export const updateInspectionAssignmentSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  declare @before nvarchar(max)=(select assigned_user_id,assigned_role_code from dbo.InspectionCase where inspection_case_id=@caseId for json path,without_array_wrapper);
  update dbo.InspectionCase
  set assigned_user_id=@assignedUserId,assigned_role_code=@assignedRoleCode,updated_at=sysutcdatetime(),updated_by=@actor
  where inspection_case_id=@caseId and row_version=convert(binary(8),@rowVersion,1);
  if @@rowcount=0 throw 50000,'inspection case version conflict',1;
  declare @after nvarchar(max)=(select assigned_user_id,assigned_role_code from dbo.InspectionCase where inspection_case_id=@caseId for json path,without_array_wrapper);
  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,before_json,after_json,event_by) values(@caseId,N'ASSIGNMENT_CHANGED',@before,@after,@actor);
  commit transaction;
  select convert(varchar(18),row_version,1) as row_version from dbo.InspectionCase where inspection_case_id=@caseId;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;

export const refreshInspectionWorkOrdersSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  if not exists(select 1 from dbo.InspectionCase where inspection_case_id=@caseId) throw 50000,'inspection case not found',1;
  merge dbo.InspectionCaseWorkOrderSnapshot as target
  using (select * from openjson(@rowsJson) with (
    source_system nvarchar(30) '$.source_system', business_unit nvarchar(100) '$.business_unit', atrium_work_order_key nvarchar(450) '$.work_order_key', atrium_work_order_code nvarchar(100) '$.work_order_code', work_order_title nvarchar(500) '$.work_order_title', raw_status nvarchar(30) '$.raw_status', mapped_status nvarchar(30) '$.mapped_status', planned_date datetime2(3) '$.planned_at', execution_date datetime2(3) '$.executed_at', source_modified_at datetime2(3) '$.source_modified_at', last_verified_at datetime2(3) '$.last_verified_at')) as source
  on target.inspection_case_id=@caseId and target.atrium_work_order_key=source.atrium_work_order_key
  when matched then update set business_unit=source.business_unit, atrium_work_order_code=source.atrium_work_order_code, work_order_title=source.work_order_title, raw_status=source.raw_status, mapped_status=source.mapped_status, planned_date=source.planned_date, execution_date=source.execution_date, source_modified_at=source.source_modified_at, refreshed_at=sysutcdatetime(), last_verified_at=source.last_verified_at, reader_correlation_id=@correlationId
  when not matched then insert(inspection_case_id,source_system,business_unit,atrium_work_order_key,atrium_work_order_code,work_order_title,raw_status,mapped_status,planned_date,execution_date,source_modified_at,last_verified_at,reader_correlation_id)
    values(@caseId,N'ATRIUM_READER',source.business_unit,source.atrium_work_order_key,source.atrium_work_order_code,source.work_order_title,source.raw_status,source.mapped_status,source.planned_date,source.execution_date,source.source_modified_at,source.last_verified_at,@correlationId);
  declare @bestKey nvarchar(450), @bestCode nvarchar(100), @mapped nvarchar(30), @planned datetime2(3), @executed datetime2(3);
  select top 1 @bestKey=atrium_work_order_key,@bestCode=atrium_work_order_code,@mapped=mapped_status,@planned=planned_date,@executed=execution_date from dbo.InspectionCaseWorkOrderSnapshot where inspection_case_id=@caseId order by source_modified_at desc;
  update dbo.InspectionCase set atrium_work_order_key=@bestKey, atrium_work_order_code=@bestCode, appointment_status=coalesce(@mapped,N'NO_PLANNING'), planned_date=convert(date,@planned), execution_date=convert(date,@executed), status=case when @mapped=N'EXECUTED' then N'EXECUTED_AWAITING_REPORT' when @mapped=N'PLANNED_CONFIRMED' then N'PLANNED_CONFIRMED' when @mapped=N'PLANNED_UNCONFIRMED' then N'PLANNED_UNCONFIRMED' else status end, updated_at=sysutcdatetime(), updated_by=@actor where inspection_case_id=@caseId;
  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,after_json,event_by) values(@caseId,N'WORK_ORDER_REFRESHED',json_object('correlationId':@correlationId,'rowCount':(select count(*) from openjson(@rowsJson)),'appointmentStatus':coalesce(@mapped,N'NO_PLANNING')),@actor);
  commit transaction;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;

export const updateInspectionChecklistItemSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  declare @before nvarchar(max)=(select * from dbo.InspectionCaseDocumentRequirement where inspection_case_document_requirement_id=@requirementId and inspection_case_id=@caseId for json path,without_array_wrapper);
  if (@documentId is null and @storedFileId is not null) or (@documentId is not null and @storedFileId is null) throw 50000,'document and exact file must be linked together',1;
  if @documentId is not null and not exists(
    select 1 from dbo.InspectionCase c
    join dbo.InstallationDocument d on d.atrium_installation_code=c.atrium_installation_code and d.document_id=@documentId and d.stored_file_id=@storedFileId and d.is_active=1
    join dbo.StoredFile sf on sf.stored_file_id=@storedFileId and sf.is_deleted=0
    where c.inspection_case_id=@caseId
  ) throw 50000,'exact inspection document file does not belong to case installation',1;
  update dbo.InspectionCaseDocumentRequirement set status=@status, installation_document_id=@documentId, stored_file_id=@storedFileId, responsibility_type=@responsibilityType, assigned_user_id=@assignedUserId, assigned_role_code=@assignedRoleCode, due_date=@dueDate, note=@note, checked_at=case when @status in(N'CHECKED',N'SENT') then sysutcdatetime() else null end, checked_by=case when @status in(N'CHECKED',N'SENT') then @actor else null end, sent_to_inspection_body_at=case when @status=N'SENT' then sysutcdatetime() else sent_to_inspection_body_at end, updated_at=sysutcdatetime(),updated_by=@actor
  where inspection_case_document_requirement_id=@requirementId and inspection_case_id=@caseId and row_version=convert(binary(8),@rowVersion,1);
  if @@rowcount=0 throw 50000,'inspection checklist version conflict',1;
  if @createAction=1 and not exists(select 1 from dbo.FollowUpActionInspectionCaseSource where inspection_case_id=@caseId and source_fingerprint=concat(N'DOCUMENT|',convert(nvarchar(36),@requirementId)))
  begin
    declare @actionId uniqueidentifier=newid(),@installationId uniqueidentifier,@code nvarchar(450),@assignmentType nvarchar(20)=N'NONE';
    select @installationId=installation_id,@code=atrium_installation_code from dbo.InspectionCase where inspection_case_id=@caseId;
    if @assignedUserId is not null set @assignmentType=N'USER' else if @assignedRoleCode is not null set @assignmentType=N'ROLE';
    insert dbo.FollowUpAction(follow_up_action_id,source_type,kind,workflow_title,workflow_description,category,priority,responsibility_type,certificate_impact,status,assignment_type,assigned_user_object_id,assigned_role_code,due_date,created_by)
    values(@actionId,N'INSPECTION_CASE',N'workflow',coalesce(@actionTitle,N'Inspectiedocument aanleveren'),@note,N'Inspectievoorbereiding',case when @isBlocking=1 then N'HIGH' else N'NORMAL' end,case when @responsibilityType=N'INSPECTION_BODY' then N'THIRD_PARTY' else @responsibilityType end,case when @isBlocking=1 then N'yes' else N'no' end,N'OPEN',@assignmentType,@assignedUserId,@assignedRoleCode,@dueDate,@actor);
    insert dbo.FollowUpActionInspectionCaseSource(follow_up_action_id,inspection_case_id,source_kind,is_blocking,source_fingerprint,created_by) values(@actionId,@caseId,N'DOCUMENT',@isBlocking,concat(N'DOCUMENT|',convert(nvarchar(36),@requirementId)),@actor);
    insert dbo.FollowUpActionInstallationContext(follow_up_action_id,installation_id,atrium_installation_code,is_primary,created_by) values(@actionId,@installationId,@code,1,@actor);
    update dbo.InspectionCaseDocumentRequirement set follow_up_action_id=@actionId where inspection_case_document_requirement_id=@requirementId;
  end;
  declare @after nvarchar(max)=(select * from dbo.InspectionCaseDocumentRequirement where inspection_case_document_requirement_id=@requirementId for json path,without_array_wrapper);
  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,before_json,after_json,event_by) values(@caseId,case when @documentId is not null then N'DOCUMENT_LINKED' else N'CHECKLIST_CHANGED' end,@before,@after,@actor);
  commit transaction;
  select convert(varchar(18),row_version,1) as row_version from dbo.InspectionCaseDocumentRequirement where inspection_case_document_requirement_id=@requirementId;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;

export const prepareInspectionPackageSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  if exists(select 1 from dbo.InspectionCaseDocumentRequirement where inspection_case_id=@caseId and requirement_level=N'REQUIRED' and is_blocking=1 and status not in(N'CHECKED',N'SENT',N'WAIVED')) throw 50000,'blocking inspection documents incomplete',1;
  declare @requested table(document_id uniqueidentifier primary key);
  if exists(select 1 from openjson(@documentIdsJson) where try_convert(uniqueidentifier,[value]) is null) throw 50000,'inspection package contains invalid document ids',1;
  insert @requested(document_id) select distinct try_convert(uniqueidentifier,[value]) from openjson(@documentIdsJson);
  if (select count(*) from @requested)<>(select count(*) from openjson(@documentIdsJson)) throw 50000,'inspection package contains duplicate document ids',1;
  declare @packageId uniqueidentifier=newid(), @version int=(select isnull(max(package_version),0)+1 from dbo.InspectionCaseDocumentPackage where inspection_case_id=@caseId);
  insert dbo.InspectionCaseDocumentPackage(inspection_case_document_package_id,inspection_case_id,package_version,prepared_by,inspection_body,recipient_snapshot,note,created_by) values(@packageId,@caseId,@version,@actor,@inspectionBody,@recipientSnapshot,@note,@actor);
  insert dbo.InspectionCaseDocumentPackageItem(inspection_case_document_package_id,installation_document_id,stored_file_id,document_type_key,document_label_snapshot,created_by)
  select @packageId,d.document_id,d.stored_file_id,d.document_type_key,coalesce(d.title,sf.file_name),@actor
  from @requested r
  join dbo.InstallationDocument d on d.document_id=r.document_id and d.is_active=1
  join dbo.StoredFile sf on sf.stored_file_id=d.stored_file_id and sf.is_deleted=0
  join dbo.InspectionCase c on c.inspection_case_id=@caseId and c.atrium_installation_code=d.atrium_installation_code
  where d.stored_file_id is not null;
  if (select count(*) from dbo.InspectionCaseDocumentPackageItem where inspection_case_document_package_id=@packageId)<>(select count(*) from @requested) throw 50000,'all inspection package documents must belong to the case installation',1;
  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,after_json,event_by) values(@caseId,N'DOCUMENT_PACKAGE_PREPARED',json_object('packageId':convert(nvarchar(36),@packageId),'version':@version),@actor);
  commit transaction; select @packageId as inspection_case_document_package_id,@version as package_version;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;

export const sendInspectionPackageSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  update dbo.InspectionCaseDocumentPackage set package_status=N'SENT',sent_at=coalesce(@sentAt,sysutcdatetime()),sent_by=@actor,external_reference=@externalReference,note=coalesce(@note,note)
  where inspection_case_document_package_id=@packageId and inspection_case_id=@caseId and package_status=N'DRAFT' and row_version=convert(binary(8),@rowVersion,1);
  if @@rowcount=0 throw 50000,'inspection package version conflict',1;
  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,after_json,event_by) values(@caseId,N'DOCUMENT_PACKAGE_SENT',json_object('packageId':convert(nvarchar(36),@packageId),'externalReference':@externalReference),@actor);
  commit transaction;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;

export const registerInspectionReportSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  declare @currentStatus nvarchar(40)=(select status from dbo.InspectionCase where inspection_case_id=@caseId);
  if @currentStatus not in(N'EXECUTED_AWAITING_REPORT',N'REPORT_RECEIVED') throw 50000,'inspection case is not awaiting a report',1;
  if not exists(
    select 1 from dbo.InspectionCase c
    join dbo.InstallationDocument d on d.atrium_installation_code=c.atrium_installation_code and d.document_id=@documentId and d.stored_file_id=@storedFileId and d.is_active=1
    join dbo.StoredFile sf on sf.stored_file_id=@storedFileId and sf.is_deleted=0
    where c.inspection_case_id=@caseId
  ) throw 50000,'exact inspection report file not found for case installation',1;
  update dbo.InspectionCaseReport set is_current=0 where inspection_case_id=@caseId and is_current=1;
  declare @reportId uniqueidentifier=newid();
  insert dbo.InspectionCaseReport(inspection_case_report_id,inspection_case_id,installation_document_id,stored_file_id,report_reference,report_version,inspection_date,conclusion,received_by,inspection_body,note,created_by) values(@reportId,@caseId,@documentId,@storedFileId,@reportReference,@reportVersion,@inspectionDate,@conclusion,@actor,@inspectionBody,@note,@actor);
  update dbo.InspectionCase set status=N'REPORT_RECEIVED',conclusion=@conclusion,inspection_body=coalesce(@inspectionBody,inspection_body),updated_at=sysutcdatetime(),updated_by=@actor where inspection_case_id=@caseId;
  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,after_json,event_by) values(@caseId,N'REPORT_RECEIVED',json_object('reportId':convert(nvarchar(36),@reportId),'conclusion':@conclusion,'storedFileId':convert(nvarchar(36),@storedFileId)),@actor);
  commit transaction; select @reportId as inspection_case_report_id;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;

export const processInspectionConclusionSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  if not exists(select 1 from dbo.InspectionCaseReport where inspection_case_id=@caseId and is_current=1) throw 50000,'current inspection report required',1;
  if @conclusion=N'PASS' and @certificateId is null throw 50000,'inspection certificate required for pass',1;
  if @certificateId is not null and not exists(select 1 from dbo.InstallationCertificate where installation_certificate_id=@certificateId and source_inspection_case_id=@caseId and certificate_type=N'INSPECTION') throw 50000,'inspection certificate not linked to case',1;
  update dbo.InspectionCase set conclusion=@conclusion,reinspection_required=case when @conclusion=N'FAIL' then 1 else 0 end,resulting_certificate_id=@certificateId,status=case when @conclusion=N'FAIL' then N'REPAIR_REQUIRED' else N'CERTIFICATE_RECEIVED' end,updated_at=sysutcdatetime(),updated_by=@actor where inspection_case_id=@caseId and row_version=convert(binary(8),@rowVersion,1);
  if @@rowcount=0 throw 50000,'inspection case version conflict',1;
  if @conclusion=N'FAIL' and not exists(select 1 from dbo.FollowUpActionInspectionCaseSource where inspection_case_id=@caseId and source_fingerprint=N'REPAIR|CURRENT')
  begin
    declare @actionId uniqueidentifier=newid(),@installationId uniqueidentifier,@code nvarchar(450);
    select @installationId=installation_id,@code=atrium_installation_code from dbo.InspectionCase where inspection_case_id=@caseId;
    insert dbo.FollowUpAction(follow_up_action_id,source_type,kind,workflow_title,workflow_description,category,priority,responsibility_type,certificate_impact,status,assignment_type,assigned_role_code,due_date,created_by) values(@actionId,N'INSPECTION_CASE',N'workflow',N'Herstelpunten inspectie uitvoeren',@note,N'Inspectieherstel',N'HIGH',N'WARDENBURG',N'yes',N'OPEN',N'ROLE',N'INSPECTION_REPAIR_OWNER',@dueDate,@actor);
    insert dbo.FollowUpActionInspectionCaseSource(follow_up_action_id,inspection_case_id,source_kind,is_blocking,source_fingerprint,created_by) values(@actionId,@caseId,N'REPAIR',1,N'REPAIR|CURRENT',@actor);
    insert dbo.FollowUpActionInstallationContext(follow_up_action_id,installation_id,atrium_installation_code,is_primary,created_by) values(@actionId,@installationId,@code,1,@actor);
    insert dbo.InspectionCaseEvent(inspection_case_id,event_type,after_json,event_by) values(@caseId,N'REPAIR_ACTION_CREATED',json_object('followUpActionId':convert(nvarchar(36),@actionId)),@actor);
  end;
  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,after_json,event_by) values(@caseId,case when @conclusion=N'PASS' then N'CONCLUSION_PASS' else N'CONCLUSION_FAIL' end,json_object('conclusion':@conclusion,'certificateId':convert(nvarchar(36),@certificateId)),@actor);
  commit transaction;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;

export const createReinspectionSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  if not exists(select 1 from dbo.InspectionCase where inspection_case_id=@caseId and conclusion=N'FAIL') throw 50000,'failed inspection case required',1;
  if exists(select 1 from dbo.FollowUpActionInspectionCaseSource s join dbo.FollowUpAction a on a.follow_up_action_id=s.follow_up_action_id join dbo.FollowUpStatusDefinition st on st.status_code=a.status and st.is_terminal=0 where s.inspection_case_id=@caseId and s.is_blocking=1) throw 50000,'blocking repair actions remain open',1;
  declare @newCaseId uniqueidentifier=newid(),@installationId uniqueidentifier,@code nvarchar(450);
  select @installationId=installation_id,@code=atrium_installation_code from dbo.InspectionCase where inspection_case_id=@caseId;
  insert dbo.InspectionCase(inspection_case_id,installation_id,atrium_installation_code,parent_inspection_case_id,inspection_type,due_date,signal_from_date,status,inspection_body,assigned_user_id,assigned_role_code,source_fingerprint,created_by) values(@newCaseId,@installationId,@code,@caseId,N'REINSPECTION',@dueDate,@signalFromDate,N'REINSPECTION_REQUIRED',@inspectionBody,@assignedUserId,@assignedRoleCode,concat(N'REINSPECTION|',convert(nvarchar(36),@caseId)),@actor);
  insert dbo.InspectionCaseScope(inspection_case_id,scope,created_by) select @newCaseId,scope,@actor from dbo.InspectionCaseScope where inspection_case_id=@caseId;
  insert dbo.InspectionCaseDocumentRequirement(inspection_case_id,requirement_key,document_type_key,requirement_level,responsibility_type,is_blocking,created_by) select @newCaseId,requirement_key,document_type_key,requirement_level,responsibility_type,is_blocking,@actor from dbo.InspectionDocumentRequirementDefinition where is_active=1;
  update dbo.InspectionCase set status=N'REINSPECTION_REQUIRED',reinspection_required=1,updated_at=sysutcdatetime(),updated_by=@actor where inspection_case_id=@caseId;
  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,after_json,event_by) values(@caseId,N'REINSPECTION_CREATED',json_object('reinspectionCaseId':convert(nvarchar(36),@newCaseId)),@actor);
  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,after_json,event_by) values(@newCaseId,N'CASE_CREATED',json_object('parentCaseId':convert(nvarchar(36),@caseId),'inspectionType':'REINSPECTION'),@actor);
  commit transaction; select @newCaseId as inspection_case_id;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;

export const completeInspectionCaseSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  if exists(select 1 from dbo.InspectionCaseDocumentRequirement where inspection_case_id=@caseId and requirement_level=N'REQUIRED' and is_blocking=1 and status not in(N'CHECKED',N'SENT',N'WAIVED')) throw 50000,'blocking checklist items incomplete',1;
  if exists(select 1 from dbo.FollowUpActionInspectionCaseSource s join dbo.FollowUpAction a on a.follow_up_action_id=s.follow_up_action_id join dbo.FollowUpStatusDefinition st on st.status_code=a.status and st.is_terminal=0 where s.inspection_case_id=@caseId and s.is_blocking=1) throw 50000,'blocking follow up actions remain open',1;
  if not exists(select 1 from dbo.InspectionCase where inspection_case_id=@caseId and conclusion=N'PASS' and resulting_certificate_id is not null) throw 50000,'pass conclusion and certificate required',1;
  if not exists(select 1 from dbo.InspectionCaseReport where inspection_case_id=@caseId and is_current=1) throw 50000,'current inspection report required',1;
  if not exists(select 1 from dbo.InspectionCaseDocumentPackage where inspection_case_id=@caseId and package_status=N'SENT') throw 50000,'sent inspection document package required',1;
  if not exists(select 1 from dbo.InspectionCaseEvent where inspection_case_id=@caseId and event_type=N'CONCLUSION_PASS') throw 50000,'inspection conclusion audit required',1;
  update dbo.InspectionCase set status=N'COMPLETED',completed_at=sysutcdatetime(),completed_by=@actor,updated_at=sysutcdatetime(),updated_by=@actor where inspection_case_id=@caseId and row_version=convert(binary(8),@rowVersion,1);
  if @@rowcount=0 throw 50000,'inspection case version conflict',1;
  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,after_json,event_by) values(@caseId,N'CASE_COMPLETED',json_object('completedBy':@actor),@actor);
  commit transaction;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;

export const signalInspectionCasesSql = `
set nocount on; set xact_abort on; begin transaction;
begin try
  declare @horizon int=try_convert(int,(select value_text from dbo.ApplicationConfiguration where configuration_key=N'inspection.signal_horizon_days' and is_active=1));
  if @horizon not in(30,60,90,180) set @horizon=90;
  declare @candidates table(
    atrium_installation_code nvarchar(450) not null,
    scope nvarchar(30) not null,
    source_certificate_id uniqueidentifier null,
    valid_until date null,
    due_date date null,
    primary key(atrium_installation_code,scope)
  );
  ;with current_cert as (
    select c.atrium_installation_code,cs.scope,c.installation_certificate_id,c.valid_until,row_number() over(partition by c.atrium_installation_code,cs.scope order by case c.record_status when N'CURRENT' then 0 else 1 end,coalesce(c.valid_until,c.issue_date) desc,c.created_at desc) rn
    from dbo.InstallationCertificate c join dbo.InstallationCertificateScope cs on cs.installation_certificate_id=c.installation_certificate_id where c.verification_status<>N'REJECTED'
  )
  insert @candidates(atrium_installation_code,scope,source_certificate_id,valid_until,due_date)
  select r.atrium_installation_code,r.scope,cc.installation_certificate_id,cc.valid_until,coalesce(cc.valid_until,r.first_inspection_due_date,r.review_due_date)
  from dbo.InstallationCertificationRequirement r
  left join current_cert cc on cc.atrium_installation_code=r.atrium_installation_code and cc.scope=r.scope and cc.rn=1
  where r.requirement_status=N'REQUIRED'
    and (cc.installation_certificate_id is null or cc.valid_until is null or cc.valid_until<=dateadd(day,@horizon,cast(sysutcdatetime() as date)));

  declare @grouped table(
    atrium_installation_code nvarchar(450) primary key,
    due_date date null,
    source_certificate_id uniqueidentifier null
  );
  insert @grouped(atrium_installation_code,due_date,source_certificate_id)
  select x.atrium_installation_code,min(x.due_date),(
    select top 1 c.source_certificate_id from @candidates c
    where c.atrium_installation_code=x.atrium_installation_code and c.source_certificate_id is not null
    order by case when c.valid_until is null then 1 else 0 end,c.valid_until desc,c.scope
  )
  from @candidates x group by x.atrium_installation_code;

  declare @created table(inspection_case_id uniqueidentifier primary key);
  insert dbo.InspectionCase(installation_id,atrium_installation_code,inspection_type,due_date,signal_from_date,status,source_certificate_id,source_fingerprint,created_by)
  output inserted.inspection_case_id into @created(inspection_case_id)
  select i.installation_id,g.atrium_installation_code,N'INITIAL',g.due_date,dateadd(day,-@horizon,g.due_date),N'ATTENTION_REQUIRED',g.source_certificate_id,concat(N'CERTIFICATE|',g.atrium_installation_code,N'|',coalesce(convert(nvarchar(10),g.due_date,23),N'MISSING')),@actor
  from @grouped g join dbo.Installation i on i.atrium_installation_code=g.atrium_installation_code
  where not exists(select 1 from dbo.InspectionCase c join dbo.InspectionCaseStatusDefinition s on s.status_code=c.status and s.is_terminal=0 where c.atrium_installation_code=g.atrium_installation_code);
  declare @createdCases int=@@rowcount;

  insert dbo.InspectionCaseScope(inspection_case_id,scope,created_by)
  select c.inspection_case_id,x.scope,@actor
  from @candidates x
  join @grouped g on g.atrium_installation_code=x.atrium_installation_code
  join dbo.InspectionCase c on c.atrium_installation_code=x.atrium_installation_code and c.source_fingerprint=concat(N'CERTIFICATE|',g.atrium_installation_code,N'|',coalesce(convert(nvarchar(10),g.due_date,23),N'MISSING'))
  where not exists(select 1 from dbo.InspectionCaseScope s where s.inspection_case_id=c.inspection_case_id and s.scope=x.scope);

  insert dbo.InspectionCaseDocumentRequirement(inspection_case_id,requirement_key,document_type_key,requirement_level,responsibility_type,is_blocking,created_by)
  select c.inspection_case_id,d.requirement_key,d.document_type_key,d.requirement_level,d.responsibility_type,d.is_blocking,@actor
  from dbo.InspectionCase c
  join @grouped g on g.atrium_installation_code=c.atrium_installation_code
  cross join dbo.InspectionDocumentRequirementDefinition d
  where c.source_fingerprint=concat(N'CERTIFICATE|',g.atrium_installation_code,N'|',coalesce(convert(nvarchar(10),g.due_date,23),N'MISSING'))
    and d.is_active=1
    and not exists(select 1 from dbo.InspectionCaseDocumentRequirement r where r.inspection_case_id=c.inspection_case_id and r.requirement_key=d.requirement_key);
  declare @initializedChecklistItems int=@@rowcount;

  insert dbo.InspectionCaseEvent(inspection_case_id,event_type,after_json,event_by)
  select c.inspection_case_id,N'CASE_CREATED',json_object('status':c.status,'inspectionType':c.inspection_type,'source':'CERTIFICATE_SIGNAL'),@actor
  from @created x join dbo.InspectionCase c on c.inspection_case_id=x.inspection_case_id;

  commit transaction;
  select @createdCases as created_cases,@initializedChecklistItems as initialized_checklist_items,@horizon as horizon_days;
end try begin catch if @@trancount>0 rollback transaction; throw; end catch;
`;
