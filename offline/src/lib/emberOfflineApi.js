const apiBase = String(import.meta.env.VITE_OFFLINE_API_BASE || "https://api.wardenburg.nl").replace(/\/+$/, "");

export class EmberOfflineApiError extends Error {
  constructor(message, { status = null, kind = "request" } = {}) {
    super(message);
    this.name = "EmberOfflineApiError";
    this.status = status;
    this.kind = kind;
  }
}

async function request(path, accessToken, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        /* FormData zet zijn eigen Content-Type, inclusief de grens tussen de delen. Zetten
           we hier application/json overheen, dan komt een foto als onleesbare tekst binnen. */
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new EmberOfflineApiError("De verbinding met Ember is niet beschikbaar. Controleer je internetverbinding en probeer opnieuw.", {
      kind: "network",
    });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      throw new EmberOfflineApiError("Je aanmeldsessie is verlopen of niet meer geldig. Meld je opnieuw aan.", {
        status: response.status,
        kind: "session",
      });
    }
    if (response.status === 403) {
      throw new EmberOfflineApiError("Je hebt geen toegang tot deze installatiegegevens. Meld je af als je met een ander account wilt aanmelden.", {
        status: response.status,
        kind: "authorization",
      });
    }
    if (response.status === 404) {
      throw new EmberOfflineApiError("Ember kon deze gegevens niet vinden. Vernieuw de installatiegegevens en probeer opnieuw.", {
        status: response.status,
        kind: "not-found",
      });
    }
    throw new EmberOfflineApiError(payload?.error || payload?.message || `Ember reageerde met ${response.status}.`, {
      status: response.status,
    });
  }
  return payload;
}

export function searchInstallations(accessToken, query, options = {}) {
  return request(`/installations/search?q=${encodeURIComponent(query)}&take=25`, accessToken, options);
}

export function getFormsCatalog(accessToken, installationCode) {
  return request(`/installations/${encodeURIComponent(installationCode)}/forms/catalog`, accessToken);
}

export function getInstallationFormInstances(accessToken, installationCode) {
  return request(`/installations/${encodeURIComponent(installationCode)}/forms/overview`, accessToken);
}

export function getInstallationCatalog(accessToken, installationCode) {
  return request(`/installations/${encodeURIComponent(installationCode)}/catalog`, accessToken);
}

export function getFormStartPreflight(accessToken, installationCode, formCode) {
  return request(
    `/installations/${encodeURIComponent(installationCode)}/forms/${encodeURIComponent(formCode)}/preflight`,
    accessToken
  );
}

export function startFormInstance(accessToken, installationCode, formCode) {
  return request(`/installations/${encodeURIComponent(installationCode)}/forms/${encodeURIComponent(formCode)}/start`, accessToken, {
    method: "POST",
  });
}

export function startChildFormInstance(accessToken, installationCode, parentInstanceId, formCode) {
  return request(
    `/installations/${encodeURIComponent(installationCode)}/forms/instances/${encodeURIComponent(parentInstanceId)}/children/${encodeURIComponent(formCode)}/start`,
    accessToken,
    { method: "POST" }
  );
}

export function withdrawFormInstance(accessToken, installationCode, instanceId) {
  return request(
    `/installations/${encodeURIComponent(installationCode)}/forms/instances/${encodeURIComponent(instanceId)}/withdraw`,
    accessToken,
    { method: "POST" }
  );
}

export function createOfflinePackage(accessToken, installationCode, instanceId, selectedDocumentTypeKeys) {
  return request(
    `/installations/${encodeURIComponent(installationCode)}/forms/instances/${encodeURIComponent(instanceId)}/offline-package`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ selected_document_type_keys: selectedDocumentTypeKeys }),
    }
  );
}

/* De terugweg. Stuurt één ingevuld formulier terug; de server controleert de revisie en
   verwerkt de antwoorden precies zoals bij een online ingevuld formulier.

   Een conflict is hier geen fout maar een antwoord: de server geeft 409 met wie er online
   aan zat en wanneer, en dat hoort de monteur te zien in plaats van een rode melding. */
export async function syncOfflineForm(accessToken, installationCode, formInstanceId, document) {
  const path = `/installations/${encodeURIComponent(installationCode)}/forms/instances/${encodeURIComponent(formInstanceId)}/offline-sync`;

  let response;

  try {
    response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(document),
    });
  } catch {
    throw new EmberOfflineApiError(
      "De verbinding met Ember is niet beschikbaar. Je werk staat nog op dit apparaat; probeer het straks opnieuw.",
      { kind: "network" }
    );
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 409) {
    return { ok: false, result: payload?.result || "conflict", payload };
  }

  if (response.status === 401) {
    throw new EmberOfflineApiError("Je aanmeldsessie is verlopen. Meld je opnieuw aan en probeer het nog een keer.", {
      status: 401,
      kind: "session",
    });
  }

  if (!response.ok) {
    throw new EmberOfflineApiError(
      payload?.error || "Ember kon dit formulier niet terugnemen. Je werk staat nog op dit apparaat.",
      { status: response.status }
    );
  }

  return { ok: true, result: payload?.result || "accepted", payload };
}

export async function downloadInstallationDocument(accessToken, downloadEndpoint) {
  let response;
  try {
    response = await fetch(`${apiBase}${downloadEndpoint}`, {
      credentials: "omit",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new EmberOfflineApiError("De verbinding met Ember is niet beschikbaar. Controleer je internetverbinding en probeer opnieuw.", {
      kind: "network",
    });
  }
  if (!response.ok) {
    throw new EmberOfflineApiError("Een gekozen bestand kon niet worden gedownload.", { status: response.status });
  }
  return response.blob();
}

/* Een foto uit het veld naar Ember brengen.
 *
 * Online gaat dat in drie stappen, en hier met dezelfde drie: eerst een documentregel bij
 * het formulier, dan het bestand zelf, dan de koppeling aan het opvolgpunt. Bewust dezelfde
 * endpoints als de webapp; een eigen uploadroute zou een tweede schrijfpad zijn met eigen
 * regels, en precies dat is bij de oude importroute misgegaan.
 */
export async function createFormInstanceDocumentRow(accessToken, installationCode, formInstanceId, title) {
  return request(
    `/installations/${encodeURIComponent(installationCode)}/forms/instances/${encodeURIComponent(formInstanceId)}/documents`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({
        items: [
          {
            title: String(title || "Foto uit het veld").slice(0, 200),
            note: null,
            image_variant: null,
            relation_type: null,
            is_active: true,
          },
        ],
      }),
    }
  );
}

export function listFormInstanceDocuments(accessToken, installationCode, formInstanceId) {
  return request(
    `/installations/${encodeURIComponent(installationCode)}/forms/instances/${encodeURIComponent(formInstanceId)}/documents`,
    accessToken
  );
}

export async function uploadFormInstanceDocumentFile(
  accessToken,
  installationCode,
  formInstanceId,
  documentId,
  blob,
  fileName
) {
  const formData = new FormData();
  formData.append("file", blob, fileName || "foto.jpg");

  return request(
    `/installations/${encodeURIComponent(installationCode)}/forms/instances/${encodeURIComponent(formInstanceId)}/documents/${encodeURIComponent(documentId)}/upload`,
    accessToken,
    { method: "POST", body: formData }
  );
}

export function linkDocumentToFollowUp(
  accessToken,
  installationCode,
  formInstanceId,
  documentId,
  followUpActionId
) {
  return request(
    `/installations/${encodeURIComponent(installationCode)}/forms/instances/${encodeURIComponent(formInstanceId)}/documents/${encodeURIComponent(documentId)}/follow-ups`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ items: [{ follow_up_action_id: followUpActionId, is_primary: true }] }),
    }
  );
}
