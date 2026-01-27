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
