/* =========================================================
   /api/src/db/queries/installationHistory.sql.ts
   ---------------------------------------------------------
   De Historie van een installatie; wanneer, wie, wat.

   Bewust lezend en samenvoegend. Elke bron hieronder houdt zijn eigen gebeurtenissen al
   bij, met een eigen vorm en een eigen eigenaar. Die samenvoegen tot één tabel zou een
   migratie vragen, dubbele opslag opleveren en scheef gaan lopen zodra een van de bronnen
   verandert. Deze query normaliseert ze op leesmoment naar dezelfde vijf velden, zodat het
   scherm er niets van hoeft te weten.

   Een nieuwe bron toevoegen is hier één extra select met dezelfde kolommen.
   ========================================================= */

export const getInstallationHistorySql = `
declare @code nvarchar(450) = @installationCode;

with bronnen as (
  /* Formulieren; indienen, oppakken, afhandelen, heropenen, toewijzen. */
  select
    concat(N'form-', e.form_instance_event_id) as id,
    N'FORMULIER' as source,
    e.created_at as occurred_at,
    e.event_type,
    e.actor_user_object_id,
    e.actor_display_name_snapshot as actor_name,
    e.actor_email_snapshot as actor_email,
    e.created_by as actor_fallback,
    concat(N'Formulier ', convert(nvarchar(20), e.form_instance_id)) as subject,
    e.previous_status,
    e.next_status,
    convert(nvarchar(400), e.detail_json) as detail_json,
    cast(0 as bit) as is_system
  from dbo.FormInstanceEvent e
  join dbo.FormInstance fi on fi.form_instance_id = e.form_instance_id
  where fi.atrium_installation_code = @code

  union all

  /* Actiepunten; status, notitie, classificatie, certificaatoordeel. */
  select
    concat(N'followup-', a.follow_up_action_event_id),
    N'ACTIEPUNT',
    a.created_at,
    a.event_type,
    a.actor_user_object_id,
    a.actor_display_name_snapshot,
    a.actor_email_snapshot,
    null,
    fa.workflow_title,
    null,
    null,
    null,
    cast(0 as bit)
  from dbo.FollowUpActionEvent a
  join dbo.FollowUpAction fa on fa.follow_up_action_id = a.follow_up_action_id
  join dbo.FollowUpActionInstallationContext ctx
    on ctx.follow_up_action_id = fa.follow_up_action_id
  where ctx.atrium_installation_code = @code

  union all

  /* Markeringen op tekeningen. */
  select
    concat(N'pin-', p.drawing_pin_event_id),
    N'TEKENING',
    p.event_at,
    p.event_type,
    null,
    null,
    null,
    p.event_by,
    pin.label,
    null,
    null,
    null,
    cast(0 as bit)
  from dbo.DrawingPinEvent p
  join dbo.DrawingPin pin on pin.drawing_pin_id = p.drawing_pin_id
  join dbo.InstallationDocument d on d.document_id = pin.installation_document_id
  where d.atrium_installation_code = @code

  union all

  /* Certificaten. */
  select
    concat(N'certificate-', c.certificate_event_id),
    N'CERTIFICAAT',
    c.event_at,
    c.event_type,
    null,
    null,
    null,
    c.event_by,
    cert.certificate_type,
    null,
    null,
    convert(nvarchar(400), c.reason),
    cast(0 as bit)
  from dbo.InstallationCertificateEvent c
  join dbo.InstallationCertificate cert
    on cert.installation_certificate_id = c.installation_certificate_id
  where cert.atrium_installation_code = @code

  union all

  /* Inspectiedossiers. */
  select
    concat(N'inspection-', i.inspection_case_event_id),
    N'INSPECTIE',
    i.event_at,
    i.event_type,
    null,
    null,
    null,
    i.event_by,
    null,
    null,
    null,
    convert(nvarchar(400), i.reason),
    cast(0 as bit)
  from dbo.InspectionCaseEvent i
  join dbo.InspectionCase ic on ic.inspection_case_id = i.inspection_case_id
  where ic.atrium_installation_code = @code

  union all

  /* Synchronisaties met het Digitaal Logboek. Door een mens gestart, maar het werk zelf is
     van het systeem; daarom telt dit als systeemregel. */
  select
    concat(N'logbook-', convert(nvarchar(50), s.installation_logbook_sync_id)),
    N'LOGBOEK',
    s.started_at,
    concat(N'SYNC_', s.status),
    null,
    null,
    null,
    s.created_by,
    null,
    null,
    null,
    concat(N'{"geimporteerd":', convert(nvarchar(12), s.imported_document_count),
           N',"overgeslagen":', convert(nvarchar(12), s.skipped_document_count),
           N',"mislukt":', convert(nvarchar(12), s.failed_document_count), N'}'),
    cast(1 as bit)
  from dbo.InstallationLogbookSync s
  join dbo.InstallationLogbook l on l.installation_logbook_id = s.installation_logbook_id
  where l.atrium_installation_code = @code
)
select top (@take)
  b.id,
  b.source,
  b.occurred_at,
  b.event_type,
  /* De bron levert soms een object-id in plaats van een naam; het profiel maakt daar weer
     een mens van. Lukt dat niet, dan blijft staan wat de bron gaf. */
  coalesce(b.actor_user_object_id, actor_lookup.user_object_id) as actor_user_object_id,
  coalesce(
    b.actor_name,
    actor_lookup.preferred_display_name,
    actor_lookup.display_name_snapshot,
    actor_lookup.email_snapshot,
    b.actor_fallback
  ) as actor_name,
  coalesce(b.actor_email, actor_lookup.email_snapshot) as actor_email,
  b.actor_fallback,
  b.subject,
  b.previous_status,
  b.next_status,
  b.detail_json,
  b.is_system
from bronnen b
outer apply (
  select top 1 up.user_object_id, up.preferred_display_name, up.display_name_snapshot, up.email_snapshot
  from dbo.UserProfile up
  where up.user_object_id = coalesce(b.actor_user_object_id, b.actor_fallback)
) actor_lookup
where (@includeSystem = 1 or b.is_system = 0)
order by b.occurred_at desc, b.id desc;
`;
