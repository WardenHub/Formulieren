// /api/src/services/offlineClientService.ts
//
// Waar Ember Offline vandaan te halen is.
//
// De downloadlink mag nooit verouderen. Dat is hier geborgd door niets over de release in
// de code te zetten: de installers staan onveranderlijk in de container, met de versie in
// hun naam, en één bestand wijst naar de actuele release. Deze dienst leest dat bestand bij
// elke vraag opnieuw en maakt er pas op dat moment een downloadlink bij.
//
// Daardoor is er geen moment waarop de app iets anders kan aanbieden dan wat het manifest
// zegt, en is terugrollen niets meer dan het manifest terugwijzen naar de vorige versie.

import {
  createOfflineClientDownloadUrl,
  downloadOfflineClientManifest,
} from "./blobStorageService.js";

export const OFFLINE_CLIENT_MANIFEST_SCHEMA = "ember.offline.client.manifest.v1";

// Kort, want een verouderd antwoord is precies wat we niet willen; lang genoeg om niet bij
// elke menuklik naar de opslag te gaan.
const CACHE_TTL_MS = 60 * 1000;

export type OfflineClientManifest = {
  schema: string;
  version: string;
  released_at: string | null;
  notes: string | null;
  file_name: string;
  storage_key: string;
  size_bytes: number | null;
  sha256: string | null;
};

function tekst(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function optioneleTekst(value: unknown, max: number) {
  const schoon = tekst(value);
  return schoon.length ? schoon.slice(0, max) : null;
}

/* Een versie als 1.4.2. Bewust streng: het nummer bepaalt of de app zichzelf verouderd
   noemt, dus rommel hier maakt die melding onbetrouwbaar. */
const VERSIE_PATROON = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export type OfflineClientManifestParse =
  | { ok: true; manifest: OfflineClientManifest; error?: undefined }
  | { ok: false; error: string; manifest?: undefined };

export function parseOfflineClientManifest(raw: any): OfflineClientManifestParse {
  let doc = raw;

  if (typeof raw === "string") {
    try {
      doc = JSON.parse(raw);
    } catch {
      return { ok: false, error: "het manifest is geen geldige json" };
    }
  }

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, error: "het manifest ontbreekt" };
  }

  const schema = tekst(doc.schema);
  if (schema !== OFFLINE_CLIENT_MANIFEST_SCHEMA) {
    return {
      ok: false,
      error: `verwacht schema ${OFFLINE_CLIENT_MANIFEST_SCHEMA}; dit manifest zegt ${schema || "niets"}`,
    };
  }

  const version = tekst(doc.version);
  if (!VERSIE_PATROON.test(version)) {
    return { ok: false, error: `version ontbreekt of is geen versienummer: ${version || "leeg"}` };
  }

  const storageKey = tekst(doc.storage_key);
  if (!storageKey) return { ok: false, error: "storage_key ontbreekt" };

  /* De sleutel moet binnen de map van deze versie liggen. Zonder deze controle kan een
     manifest naar een willekeurige blob in de container wijzen, en dan bepaalt het manifest
     wat er gedownload wordt in plaats van de release. */
  if (!storageKey.startsWith(`${version}/`)) {
    return { ok: false, error: `storage_key ${storageKey} hoort niet bij versie ${version}` };
  }

  if (storageKey.includes("..")) {
    return { ok: false, error: "storage_key mag geen .. bevatten" };
  }

  if (!storageKey.toLowerCase().endsWith(".msi")) {
    return { ok: false, error: "storage_key moet naar een msi wijzen" };
  }

  const sizeRuw = doc.size_bytes;
  const size = typeof sizeRuw === "number" && Number.isFinite(sizeRuw) ? Math.trunc(sizeRuw) : null;

  return {
    ok: true,
    manifest: {
      schema,
      version,
      released_at: optioneleTekst(doc.released_at, 40),
      notes: optioneleTekst(doc.notes, 4000),
      file_name: optioneleTekst(doc.file_name, 260) || storageKey.split("/").pop() || "ember-offline.msi",
      storage_key: storageKey,
      size_bytes: size,
      sha256: optioneleTekst(doc.sha256, 64),
    },
  };
}

let cache: { manifest: OfflineClientManifest | null; error: string | null; expiresAt: number } | null = null;

export function clearOfflineClientCache() {
  cache = null;
}

async function leesManifest() {
  if (cache && cache.expiresAt > Date.now()) return cache;

  const ruw = await downloadOfflineClientManifest();

  if (ruw === null) {
    cache = { manifest: null, error: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return cache;
  }

  const gelezen = parseOfflineClientManifest(ruw);

  cache = gelezen.ok
    ? { manifest: gelezen.manifest, error: null, expiresAt: Date.now() + CACHE_TTL_MS }
    : { manifest: null, error: gelezen.error, expiresAt: Date.now() + CACHE_TTL_MS };

  return cache;
}

/* Wat het menu-item rechtsboven nodig heeft, en wat de desktopapp gebruikt om te zien of hij
   verouderd is. De downloadlink wordt bij elke aanvraag opnieuw gemaakt en verloopt vanzelf. */
export async function getLatestOfflineClient() {
  const stand = await leesManifest();

  if (stand.error) {
    return { available: false, reason: `het manifest is niet bruikbaar; ${stand.error}` };
  }

  if (!stand.manifest) {
    return {
      available: false,
      reason: "er is nog geen versie van Ember Offline gepubliceerd",
    };
  }

  const manifest = stand.manifest;

  const downloadUrl = await createOfflineClientDownloadUrl({
    storageKey: manifest.storage_key,
    downloadFileName: manifest.file_name,
  });

  return {
    available: true,
    version: manifest.version,
    released_at: manifest.released_at,
    notes: manifest.notes,
    file_name: manifest.file_name,
    size_bytes: manifest.size_bytes,
    sha256: manifest.sha256,
    download_url: downloadUrl,
  };
}
