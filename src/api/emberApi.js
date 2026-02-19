// src/api/emberApi.js
import { httpJson } from "./http";

export function apiGet(path) {
  return httpJson(path);
}

export function apiPut(path, bodyObj) {
  return httpJson(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
}

export function apiDelete(path) {
  return httpJson(path, {
    method: "DELETE",
  });
}

export function apiPost(path, bodyObj) {
  return httpJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj ?? {}),
  });
}


export function getInstallation(code) {
  return apiGet(`/installations/${code}`);
}

export function getCatalog(code) {
  return apiGet(`/installations/${code}/catalog`);
}

export function getCustomValues(code) {
  return apiGet(`/installations/${code}/custom-values`);
}

export function putCustomValues(code, values) {
  return apiPut(`/installations/${code}/custom-values`, { values });
}

export function getDocuments(code) {
  return apiGet(`/installations/${code}/documents`);
}

export function getInstallationTypes() {
  return apiGet("/installation-types");
}

export function setInstallationType(code, installation_type_key) {
  return apiPut(`/installations/${code}/type`, { installation_type_key });
}

export function putDocuments(code, documents) {
  return apiPut(`/installations/${code}/documents`, { documents });
}

export async function searchInstallations(q, take = 25) {
  const qs = new URLSearchParams();
  if (q && String(q).trim()) qs.set("q", String(q).trim());
  qs.set("take", String(take));

  return apiGet(`/installations/search?${qs.toString()}`);
}

export function getEnergySupplyBrandTypes() {
  return apiGet("/installations/energy-supply-brand-types");
}

export function putEnergySupplyBrandTypes(types) {
  return apiPut("/installations/energy-supply-brand-types", { types });
}

export function getEnergySupplies(code) {
  return apiGet(`/installations/${encodeURIComponent(code)}/energy-supplies`);
}

export async function putEnergySupplies(code, items) {
  return httpJson(`/installations/${encodeURIComponent(code)}/energy-supplies`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

export function deleteEnergySupply(code, energySupplyId) {
  return apiDelete(`/installations/${encodeURIComponent(code)}/energy-supplies/${energySupplyId}`);
}

// NEN2535
export function getNen2535Catalog() {
  return apiGet("/installations/nen2535/catalog");
}

export function getPerformanceRequirements(code) {
  return apiGet(`/installations/${encodeURIComponent(code)}/performance-requirements`);
}

export function putPerformanceRequirements(code, payload) {
  return apiPut(`/installations/${encodeURIComponent(code)}/performance-requirements`, payload);
}

export function getFormStartPreflight(code, formCode) {
  return apiGet(`/installations/${encodeURIComponent(code)}/forms/${encodeURIComponent(formCode)}/preflight`);
}

export function getFormsCatalog(code) {
  return apiGet(`/installations/${encodeURIComponent(code)}/forms/catalog`);
}

// forms runtime
export function startFormInstance(code, formCode) {
  // backend: POST /:code/forms/:formCode/start
  return apiPost(
    `/installations/${encodeURIComponent(code)}/forms/${encodeURIComponent(formCode)}/start`,
    {}
  );
}

export function getFormInstance(code, formInstanceId) {
  // backend: GET /:code/forms/instances/:instanceId
  return apiGet(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}`
  );
}

export function putFormAnswers(code, formInstanceId, payload) {
  // backend: PUT /:code/forms/instances/:instanceId/answers
  return apiPut(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}/answers`,
    payload
  );
}

export function submitFormInstance(code, formInstanceId) {
  // backend: POST /:code/forms/instances/:instanceId/submit
  return apiPost(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}/submit`,
    {}
  );
}

export function withdrawFormInstance(code, formInstanceId) {
  // backend: POST /:code/forms/instances/:instanceId/withdraw
  return apiPost(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}/withdraw`,
    {}
  );
}

export function importFormAnswers(code, payload) {
  // backend: POST /:code/forms/import
  return apiPost(`/installations/${encodeURIComponent(code)}/forms/import`, payload);
}

export function reopenFormInstance(code, formInstanceId) {
  // backend (nieuw): POST /:code/forms/instances/:instanceId/reopen
  return apiPost(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}/reopen`,
    {}
  );
}

export function getFormPrefill(code, formCode, keys) {
  return apiPost(
    `/installations/${encodeURIComponent(code)}/forms/${encodeURIComponent(formCode)}/prefill`,
    { keys }
  );
}

export function getInstallationComponents(code) {
  return apiGet(`/installations/${encodeURIComponent(code)}/components`);
}
