// /api/src/db/queries/formsAnswers.sql.ts
// =========================================================
// forms runtime - save answers (draft)
// =========================================================

export const saveFormAnswersSql = `
-- expects:
--   @code nvarchar(...)
--   @instanceId uniqueidentifier
--   @answersJson nvarchar(max)
--   @calculatedJson nvarchar(max)  (nullable)
--   @expectedDraftRev int
--   @updatedBy nvarchar(...)

if not exists (select 1 from dbo.AtriumInstallationBase where installatie_code = @code)
begin
  throw 50000, 'atrium installation not found', 1;
end;

declare @currentRev int;
declare @currentStatus nvarchar(30);

select top 1
  @currentRev = fi.draft_rev,
  @currentStatus = fi.status
from dbo.FormInstance fi
where fi.form_instance_id = @instanceId
  and fi.atrium_installation_code = @code;

if @currentStatus is null
begin
  throw 50000, 'form instance not found', 1;
end;

if @currentStatus <> N'CONCEPT'
begin
  throw 50000, 'form instance not editable', 1;
end;

if @currentRev <> @expectedDraftRev
begin
  throw 50000, 'draft_rev conflict', 1;
end;

update dbo.FormAnswer
set
  answers_json = @answersJson,
  calculated_json = @calculatedJson,
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy
where form_instance_id = @instanceId;

if @@rowcount = 0
begin
  insert into dbo.FormAnswer (
    form_instance_id,
    answers_json,
    calculated_json,
    updated_at,
    updated_by
  )
  values (
    @instanceId,
    @answersJson,
    @calculatedJson,
    sysutcdatetime(),
    @updatedBy
  );
end;

update dbo.FormInstance
set
  draft_rev = draft_rev + 1,
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy
where form_instance_id = @instanceId
  and atrium_installation_code = @code;

select
  @instanceId as form_instance_id,
  (@expectedDraftRev + 1) as draft_rev;
`;

// /api/src/db/queries/formsAnswers.sql.ts

export const submitFormInstanceSql = `
-- expects: @code, @instanceId, @submittedBy

declare @status nvarchar(30);
select top 1 @status = status
from dbo.FormInstance
where form_instance_id = @instanceId
  and atrium_installation_code = @code;

if @status is null throw 50000, 'form instance not found', 1;
if @status <> N'CONCEPT' throw 50000, 'invalid status transition', 1;

update dbo.FormInstance
set
  status = N'INGEDIEND',
  submitted_at = sysutcdatetime(),
  submitted_by = @submittedBy,
  updated_at = sysutcdatetime(),
  updated_by = @submittedBy
where form_instance_id = @instanceId
  and atrium_installation_code = @code;

select @instanceId as form_instance_id, N'INGEDIEND' as status;
`;

export const withdrawFormInstanceSql = `
-- expects: @code, @instanceId, @updatedBy

declare @status nvarchar(30);
select top 1 @status = status
from dbo.FormInstance
where form_instance_id = @instanceId
  and atrium_installation_code = @code;

if @status is null throw 50000, 'form instance not found', 1;

-- allow withdraw from CONCEPT or INGEDIEND (optioneel uitbreiden)
if @status not in (N'CONCEPT', N'INGEDIEND') throw 50000, 'invalid status transition', 1;

update dbo.FormInstance
set
  status = N'INGETROKKEN',
  updated_at = sysutcdatetime(),
  updated_by = @updatedBy
where form_instance_id = @instanceId
  and atrium_installation_code = @code;

select @instanceId as form_instance_id, N'INGETROKKEN' as status;
`;
