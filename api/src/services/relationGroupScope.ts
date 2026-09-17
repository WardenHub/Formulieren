/* Wie hoort er bij een relatiegroep, en hoe komt die keuze in een query.

   De tekst van het filter staat in db/queries/relationGroups.sql.ts; dit is de kant die de
   binnengekomen keuze opschoont en er de twee parameters van maakt. Het staat apart omdat de
   installatielijst, de installatiekaart en de formuliermonitor er alle drie op leunen, en een
   tweede kopie vroeg of laat een andere rollenlijst zou krijgen; dat zou dan stilletjes een
   ander antwoord op dezelfde vraag geven.

   Wordt er straks externe toegang gebouwd, dan is dit de plek waar een smallere rollenlijst
   binnenkomt; de query kent die lijst alleen als parameter. */

/* Een installatie hoort bij een groep via een van de vier objectrollen. Intern staan ze alle
   vier aan, want wie bij een concern hoort, hoort erbij, ongeacht of dat via de gebruiker of
   de debiteur loopt. */
export const RELATION_GROUP_ROLES = ["GEBRUIKER", "EIGENAAR", "BEHEERDER", "DEBITEUR"];

/* Meer dan dit zijn geen filter meer maar een export; de grens houdt de query klein. */
export const MAX_RELATION_GROUPS = 50;

/* De sleutels zijn "Wardenburg|100112"; ze komen uit onze eigen lijst en gaan als json naar de
   query, dus ze worden alleen ontdaan van witruimte en begrensd in aantal. */
export function normalizeRelationGroupKeys(raw: string | string[] | null | undefined) {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");

  const groups = Array.from(
    new Set(list.map((value) => String(value || "").trim()).filter(Boolean))
  );

  return groups.slice(0, MAX_RELATION_GROUPS);
}

/* Geen groep gekozen betekent null en niet een lege array; de query leest dat als "niet
   filteren" en noemt de relatiegroeptabellen dan niet. */
export function relationGroupQueryParams(raw: string | string[] | null | undefined) {
  const groups = normalizeRelationGroupKeys(raw);

  return {
    groups,
    relationGroupsJson: groups.length ? JSON.stringify(groups) : null,
    relationGroupRolesJson: JSON.stringify(RELATION_GROUP_ROLES),
  };
}
