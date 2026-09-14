/* Tijdelijke vinkjes op de tekening tijdens het invullen van een formulier.

   Waarvoor: een monteur die veertig melders test, wil kunnen zien welke hij al gehad heeft.
   Meer niet. Het is een hulpmiddel tijdens het werk, geen vastlegging.

   Daarom staan ze op het toestel zelf en niet in de antwoorden of in de database:

     - ze kunnen zo nooit in het rapport, de PDF of de pinhistorie belanden;
     - bij indienen hoeft er aan de serverkant niets opgeruimd te worden, we gooien de sleutel
       weg;
     - en de FormRunner bewaart het paginanummer al op dezelfde manier.

   De prijs is dat wie halverwege van tablet naar telefoon wisselt zijn vinkjes kwijt is. Voor
   een hulpmiddel is dat een eerlijke ruil; moet het ooit bewijs worden, dan is dit het
   verkeerde gereedschap en hoort het een pinsoort met de formulierinstantie als bron te zijn.

   Alles is gewikkeld in try/catch: een browser die niets mag opslaan hoort geen formulier te
   breken, hij verliest alleen deze hulplijn. */

const PREFIX = "ember.formrunner.checked-points.";

export function buildCheckedPointsKey(instanceId) {
  const id = String(instanceId || "").trim();
  return id ? `${PREFIX}${id}` : "";
}

export function normalizeCheckedPoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const page = Number(point?.page);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;

  return {
    id: String(point?.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    documentId: String(point?.documentId || ""),
    page: Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1,
    x,
    y,
  };
}

export function readCheckedPoints(instanceId) {
  const key = buildCheckedPointsKey(instanceId);
  if (!key) return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map(normalizeCheckedPoint).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveCheckedPoints(instanceId, points) {
  const key = buildCheckedPointsKey(instanceId);
  if (!key) return false;

  const clean = (Array.isArray(points) ? points : []).map(normalizeCheckedPoint).filter(Boolean);

  try {
    if (!clean.length) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

export function clearCheckedPoints(instanceId) {
  const key = buildCheckedPointsKey(instanceId);
  if (!key) return false;

  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
