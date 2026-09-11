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
        ...(options.body ? { "Content-Type": "application/json" } : {}),
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
