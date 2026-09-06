/* Geweigerde indieningen.

   Een invuller die niet kan indienen is nu onzichtbaar; hij belt, of hij stopt. Deze
   queries leggen vast welke controle hem tegenhield, zodat een formulierdefinitie die te
   streng of onduidelijk is te herkennen valt in plaats van te raden.

   Er gaan bewust geen antwoorden in; alleen vraagnamen, paginanamen en meldingen. */

export const insertFormSubmitRejectionSql = `
-- expects: @instanceId bigint, @rejectionSource, @reasonCode, @reasonMessage,
--          @blockingCount int, @pageName, @detailsJson,
--          @rejectedBy, @rejectedUserObjectId, @rejectedDisplayName, @rejectedEmail

set nocount on;

declare @formVersionId uniqueidentifier;

select top (1) @formVersionId = fi.form_version_id
from dbo.FormInstance fi
where fi.form_instance_id = @instanceId;

if @formVersionId is null and not exists (
  select 1 from dbo.FormInstance where form_instance_id = @instanceId
)
begin
  throw 50000, 'form instance not found', 1;
end

insert into dbo.FormSubmitRejection (
  form_instance_id,
  form_version_id,
  rejection_source,
  reason_code,
  reason_message,
  blocking_count,
  page_name,
  details_json,
  rejected_by,
  rejected_user_object_id,
  rejected_display_name_snapshot,
  rejected_email_snapshot
)
values (
  @instanceId,
  @formVersionId,
  @rejectionSource,
  @reasonCode,
  @reasonMessage,
  @blockingCount,
  @pageName,
  @detailsJson,
  @rejectedBy,
  @rejectedUserObjectId,
  @rejectedDisplayName,
  @rejectedEmail
);

select scope_identity() as form_submit_rejection_id;
`;

export const listFormSubmitRejectionsSql = `
-- expects: @sinceDays int, @formCode nvarchar(100) (mag leeg), @source nvarchar(30) (mag leeg), @take int

select top (@take)
  r.form_submit_rejection_id,
  r.form_instance_id,
  r.rejection_source,
  r.reason_code,
  r.reason_message,
  r.blocking_count,
  r.page_name,
  r.details_json,
  r.rejected_at,
  coalesce(r.rejected_display_name_snapshot, r.rejected_email_snapshot, r.rejected_by) as rejected_display,
  fi.status as form_status,
  fi.instance_title,
  fi.atrium_installation_code,
  fd.code as form_code,
  fd.name as form_name,
  fdv.version_label
from dbo.FormSubmitRejection r
join dbo.FormInstance fi
  on fi.form_instance_id = r.form_instance_id
left join dbo.FormDefinitionVersion fdv
  on fdv.form_version_id = r.form_version_id
left join dbo.FormDefinition fd
  on fd.form_id = fdv.form_id
where r.rejected_at >= dateadd(day, -@sinceDays, sysutcdatetime())
  and (nullif(ltrim(rtrim(@formCode)), N'') is null or fd.code = @formCode)
  and (nullif(ltrim(rtrim(@source)), N'') is null or r.rejection_source = @source)
order by r.rejected_at desc, r.form_submit_rejection_id desc;
`;

export const getFormSubmitRejectionSummarySql = `
-- expects: @sinceDays int

/* Per formulier; hoe vaak liep een invuller vast en om hoeveel invullers gaat het. */
select
  fd.code as form_code,
  fd.name as form_name,
  count(*) as rejection_count,
  count(distinct r.form_instance_id) as instance_count,
  count(distinct coalesce(r.rejected_user_object_id, r.rejected_by)) as person_count,
  max(r.rejected_at) as last_rejected_at
from dbo.FormSubmitRejection r
join dbo.FormInstance fi
  on fi.form_instance_id = r.form_instance_id
left join dbo.FormDefinitionVersion fdv
  on fdv.form_version_id = r.form_version_id
left join dbo.FormDefinition fd
  on fd.form_id = fdv.form_id
where r.rejected_at >= dateadd(day, -@sinceDays, sysutcdatetime())
group by fd.code, fd.name
order by count(*) desc, fd.code;

/* Per reden; welke controle houdt mensen het vaakst tegen. */
select
  r.rejection_source,
  r.reason_code,
  count(*) as rejection_count,
  max(r.rejected_at) as last_rejected_at
from dbo.FormSubmitRejection r
where r.rejected_at >= dateadd(day, -@sinceDays, sysutcdatetime())
group by r.rejection_source, r.reason_code
order by count(*) desc, r.rejection_source, r.reason_code;

/* Per vraag; welk veld blokkeert het vaakst. De vraagnamen staan in details_json. */
select top (25)
  detail.question_name,
  detail.page_name,
  count(*) as rejection_count
from dbo.FormSubmitRejection r
cross apply openjson(r.details_json) with (
  question_name nvarchar(200) N'$.question_name',
  page_name nvarchar(200) N'$.page_name'
) detail
where r.rejected_at >= dateadd(day, -@sinceDays, sysutcdatetime())
  and r.details_json is not null
  and nullif(ltrim(rtrim(detail.question_name)), N'') is not null
group by detail.question_name, detail.page_name
order by count(*) desc, detail.question_name;
`;
