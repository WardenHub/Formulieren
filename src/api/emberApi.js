// src/api/emberApi.js
import { httpJson, httpUpload } from "./http";

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

export function uploadInstallationDocumentFile(code, documentId, file) {
  const fd = new FormData();
  fd.append("file", file);

  return httpUpload(
    `/installations/${encodeURIComponent(code)}/documents/${encodeURIComponent(documentId)}/upload`,
    fd
  );
}

export function getInstallationDocumentDownloadUrl(code, documentId) {
  return apiGet(
    `/installations/${encodeURIComponent(code)}/documents/${encodeURIComponent(documentId)}/download-url`
  );
}

export function getInstallationDocumentDownloadEndpoint(code, documentId) {
  return `/installations/${encodeURIComponent(code)}/documents/${encodeURIComponent(documentId)}/download`;
}

export function createInstallationDocumentReplacement(code, documentId, payload = {}) {
  return apiPost(
    `/installations/${encodeURIComponent(code)}/documents/${encodeURIComponent(documentId)}/replacements`,
    payload
  );
}

export function createInstallationDocumentAttachment(code, documentId, payload = {}) {
  return apiPost(
    `/installations/${encodeURIComponent(code)}/documents/${encodeURIComponent(documentId)}/attachments`,
    payload
  );
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

export function getInstallationFormInstances(code, params = {}) {
  const qs = new URLSearchParams();

  if (params.q && String(params.q).trim()) {
    qs.set("q", String(params.q).trim());
  }

  const statuses = Array.isArray(params.statuses)
    ? params.statuses.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  if (statuses.length > 0) {
    qs.set("statuses", statuses.join(","));
  }

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiGet(`/installations/${encodeURIComponent(code)}/forms/overview${suffix}`);
}

// forms runtime
export function startFormInstance(code, formCode) {
  return apiPost(
    `/installations/${encodeURIComponent(code)}/forms/${encodeURIComponent(formCode)}/start`,
    {}
  );
}

export function getFormInstance(code, formInstanceId) {
  return apiGet(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}`
  );
}

export function putFormInstanceMetadata(code, formInstanceId, payload) {
  return apiPut(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}/metadata`,
    payload ?? {}
  );
}

export function putFormAnswers(code, formInstanceId, payload) {
  return apiPut(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}/answers`,
    payload
  );
}

export function startChildFormInstance(code, parentInstanceId, formCode) {
  return apiPost(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(parentInstanceId)}/children/${encodeURIComponent(formCode)}/start`,
    {}
  );
}

export function submitFormInstance(code, formInstanceId) {
  return apiPost(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}/submit`,
    {}
  );
}

export function previewSubmitFormInstance(code, formInstanceId, payload) {
  return apiPost(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}/submit-preview`,
    payload ?? {}
  );
}

export function withdrawFormInstance(code, formInstanceId) {
  return apiPost(
    `/installations/${encodeURIComponent(code)}/forms/instances/${encodeURIComponent(formInstanceId)}/withdraw`,
    {}
  );
}

export function importFormAnswers(code, payload) {
  return apiPost(`/installations/${encodeURIComponent(code)}/forms/import`, payload);
}

export function reopenFormInstance(code, formInstanceId) {
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

// forms monitor
export async function getFormsMonitorList(params = {}) {
  const qs = new URLSearchParams();

  if (params.q && String(params.q).trim()) qs.set("q", String(params.q).trim());
  if (params.status && String(params.status).trim()) qs.set("status", String(params.status).trim());
  if (params.formCode && String(params.formCode).trim()) qs.set("formCode", String(params.formCode).trim());

  if (params.mine !== undefined && params.mine !== null) {
    qs.set("mine", params.mine ? "1" : "0");
  }

  if (params.includeWithdrawn !== undefined && params.includeWithdrawn !== null) {
    qs.set("includeWithdrawn", params.includeWithdrawn ? "1" : "0");
  }

  if (params.onlyActionable !== undefined && params.onlyActionable !== null) {
    qs.set("onlyActionable", params.onlyActionable ? "1" : "0");
  }

  if (params.take != null) qs.set("take", String(params.take));
  if (params.skip != null) qs.set("skip", String(params.skip));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiGet(`/forms-monitor${suffix}`);
}

export function getFormsMonitorDetail(formInstanceId, options = {}) {
  const qs = new URLSearchParams();

  if (options.autoClaim !== undefined && options.autoClaim !== null) {
    qs.set("autoClaim", options.autoClaim ? "1" : "0");
  }

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiGet(`/forms-monitor/${encodeURIComponent(formInstanceId)}${suffix}`);
}

export function getFormsMonitorFollowUps(formInstanceId) {
  return apiGet(`/forms-monitor/${encodeURIComponent(formInstanceId)}/follow-ups`);
}

export function postFormsMonitorStatusAction(formInstanceId, action) {
  return apiPost(
    `/forms-monitor/${encodeURIComponent(formInstanceId)}/status-action`,
    { action }
  );
}

export function postFormsMonitorFollowUpStatusAction(followUpActionId, payload) {
  return apiPost(
    `/forms-monitor/follow-ups/${encodeURIComponent(followUpActionId)}/status-action`,
    payload ?? {}
  );
}

export function putFormsMonitorFollowUpNote(followUpActionId, payload) {
  return apiPut(
    `/forms-monitor/follow-ups/${encodeURIComponent(followUpActionId)}/note`,
    payload ?? {}
  );
}

// admin forms
export function getAdminForms() {
  return apiGet("/admin/forms");
}

export function getAdminForm(formId) {
  return apiGet(`/admin/forms/${encodeURIComponent(formId)}`);
}

export function createAdminForm(payload) {
  return apiPost("/admin/forms", payload ?? {});
}

export function saveAdminFormsOrder(items) {
  return apiPut("/admin/forms/order", { items: items ?? [] });
}

export function saveAdminFormConfig(formId, payload) {
  return apiPut(`/admin/forms/${encodeURIComponent(formId)}/config`, payload ?? {});
}

export function createAdminFormVersion(formId, payload) {
  return apiPost(`/admin/forms/${encodeURIComponent(formId)}/versions`, payload ?? {});
}

