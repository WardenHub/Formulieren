/* /api/src/db/queries/parentInstanceGuard.sql.ts

   Eén regel voor parent_instance_id, op één plek.

   Waarom deze relatie bestaat: een niet-certificeerbaar oordeel gaat naar de klant, daarna
   wordt er iets opgelost, en dan levert Ember een kindformulier met dezelfde antwoorden
   waarin alleen de opgeloste punten hoeven te worden bijgewerkt. Ouder en kind gaan dus per
   definitie over hetzelfde. Wil iemand een ander onderwerp, dan begint hij een nieuw
   formulier; daar is die knop voor.

   Tot nu toe had dezelfde kolom drie regels. De hub eiste dezelfde primaire context, de
   installatieroute alleen dezelfde installatiecode, en het starten van een kind alleen dat
   de ouder op die installatie bestond. De tabel bewaakt niets meer dan een foreign key en
   "niet je eigen ouder". Een keten die los is gelegd, wordt later wel als één geheel
   behandeld: de recursieve keten-CTE in de monitor, de opvolgsamenvatting, de
   afrondingspoort en het PDF-rapport lopen er allemaal over.

   De regel is nu: ouder en kind hebben dezelfde primaire context, op context_type,
   source_system en source_key. Die ene regel vervangt de twee oude vangnetten en is
   strenger dan beide:

     - een hub-kind (primair bijvoorbeeld een werkbon) kan niet aan een installatieformulier
       hangen, want de primaire context verschilt;
     - een installatiekind kan niet aan een ouder op een andere installatie hangen, want
       source_key verschilt.

   De meldingen staan hier, zodat alle drie de routes hetzelfde zeggen. */

export const PARENT_INSTANCE_INVALID = "parent form instance invalid";
export const PARENT_INSTANCE_NOT_FOUND = "parent form instance not found";
export const PARENT_INSTANCE_CONTEXT_MISMATCH =
  "parent form instance not found in same primary context";
export const CHILD_INSTANCE_WITHOUT_PRIMARY_CONTEXT =
  "child form instance has no primary context";

/* Voor een kind dat al bestaat; de primaire context wordt opgezocht.
   childExpr en parentExpr zijn SQL-expressies, doorgaans @instanceId en @parentInstanceId. */
export function buildParentInstanceGuardSql(childExpr: string, parentExpr: string) {
  return `
if ${parentExpr} is not null
begin
  if ${parentExpr} = ${childExpr} throw 50000, '${PARENT_INSTANCE_INVALID}', 1;

  if not exists (
    select 1 from dbo.FormInstance where form_instance_id = ${parentExpr}
  ) throw 50000, '${PARENT_INSTANCE_NOT_FOUND}', 1;

  -- Zonder primaire context is er niets om tegen te vergelijken. Dat is een eigen melding,
  -- want anders lijkt het alsof de ouder niet bestaat.
  if not exists (
    select 1
    from dbo.FormInstanceContext
    where form_instance_id = ${childExpr}
      and is_primary = 1
  ) throw 50000, '${CHILD_INSTANCE_WITHOUT_PRIMARY_CONTEXT}', 1;

  if not exists (
    select 1
    from dbo.FormInstanceContext child_context
    join dbo.FormInstanceContext parent_context
      on parent_context.form_instance_id = ${parentExpr}
     and parent_context.is_primary = 1
     and parent_context.context_type = child_context.context_type
     and parent_context.source_system = child_context.source_system
     and parent_context.source_key = child_context.source_key
    where child_context.form_instance_id = ${childExpr}
      and child_context.is_primary = 1
  ) throw 50000, '${PARENT_INSTANCE_CONTEXT_MISMATCH}', 1;
end;
`;
}

/* Voor een kind dat nog niet bestaat, zoals bij het starten van een vervolgformulier. De
   primaire context die het kind straks krijgt is hier bekend en wordt letterlijk
   meegegeven, zodat de vergelijking dezelfde blijft. */
export function buildParentInstanceGuardForNewChildSql(args: {
  parentExpr: string;
  contextTypeExpr: string;
  sourceSystemExpr: string;
  sourceKeyExpr: string;
}) {
  const { parentExpr, contextTypeExpr, sourceSystemExpr, sourceKeyExpr } = args;

  return `
if not exists (
  select 1 from dbo.FormInstance where form_instance_id = ${parentExpr}
) throw 50000, '${PARENT_INSTANCE_NOT_FOUND}', 1;

if not exists (
  select 1
  from dbo.FormInstanceContext parent_context
  where parent_context.form_instance_id = ${parentExpr}
    and parent_context.is_primary = 1
    and parent_context.context_type = ${contextTypeExpr}
    and parent_context.source_system = ${sourceSystemExpr}
    and parent_context.source_key = ${sourceKeyExpr}
) throw 50000, '${PARENT_INSTANCE_CONTEXT_MISMATCH}', 1;
`;
}

/* De uitleg naar buiten hoort bij de regel, niet bij de route. Beide controllers gebruiken
   deze functie, zodat de hub en de installatieroute hetzelfde zeggen en in dezelfde
   volgorde beslissen. Die volgorde is niet vrij: "parent form instance not found" bevat
   "form instance not found", en zonder deze functie ving de generieke melding het
   specifieke geval af. */
export function describeParentInstanceProblem(message: string) {
  const msg = String(message || "").toLowerCase();

  if (msg.includes("same primary context")) {
    return {
      status: 409,
      error:
        "Een vervolgformulier hoort bij hetzelfde onderwerp als het formulier waar het op volgt. Kies een ander formulier om op te volgen, of begin een nieuw formulier.",
    };
  }

  if (msg.includes("no primary context")) {
    return {
      status: 409,
      error:
        "Dit formulier heeft nog geen vastgelegd onderwerp; zonder dat is niet te bepalen of een vervolgformulier erbij hoort.",
    };
  }

  if (msg.includes("parent form instance invalid")) {
    return { status: 400, error: PARENT_INSTANCE_INVALID };
  }

  if (msg.includes("parent form instance not found")) {
    return { status: 404, error: PARENT_INSTANCE_NOT_FOUND };
  }

  return null;
}
