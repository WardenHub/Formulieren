//src/pages/Forms/shared/draftStore.js

// Lokale conceptopslag voor formulierantwoorden.
//
// De runner houdt antwoorden alleen in het survey-core model, dus zonder deze laag
// verdwijnt alles wat na de laatste autosave is ingevuld bij herladen, een
// sessieverloop of een gesloten tab. Deze module bewaart dat werk op het toestel
// zelf en is bewust nooit blokkerend: kan de browser niets opslaan, dan gedraagt
// de runner zich precies zoals voorheen.

const DATABASE_NAME = "ember-form-drafts";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";

let databasePromise = null;

function hasIndexedDb() {
  return typeof window !== "undefined" && Boolean(window.indexedDB);
}

function openDatabase() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    let request;

    try {
      request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return databasePromise;
}

function runTransaction(mode, work) {
  return openDatabase().then((db) => {
    if (!db) return null;

    return new Promise((resolve) => {
      let transaction;

      try {
        transaction = db.transaction(STORE_NAME, mode);
      } catch {
        resolve(null);
        return;
      }

      const store = transaction.objectStore(STORE_NAME);
      let result = null;

      try {
        const request = work(store);

        if (request) {
          request.onsuccess = () => {
            result = request.result ?? null;
          };
        }
      } catch {
        resolve(null);
        return;
      }

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    });
  });
}

export function buildDraftKey(instanceId) {
  const id = String(instanceId || "").trim();
  return id ? `instance::${id}` : "";
}

// Bewaart de huidige antwoorden met de revisie waarop ze zijn gebaseerd.
// De revisie is nodig om bij het openen te bepalen of het concept nog voorloopt
// op de server, of dat de server inmiddels nieuwer is.
export function saveFormDraft({ instanceId, draftRev, answers }) {
  const key = buildDraftKey(instanceId);
  if (!key) return Promise.resolve(false);

  const record = {
    key,
    instanceId: String(instanceId),
    draftRev: Number.isInteger(Number(draftRev)) ? Number(draftRev) : 0,
    answers,
    savedAt: new Date().toISOString(),
  };

  return runTransaction("readwrite", (store) => store.put(record))
    .then(() => true)
    .catch(() => false);
}

export function readFormDraft(instanceId) {
  const key = buildDraftKey(instanceId);
  if (!key) return Promise.resolve(null);

  return runTransaction("readonly", (store) => store.get(key)).catch(() => null);
}

export function clearFormDraft(instanceId) {
  const key = buildDraftKey(instanceId);
  if (!key) return Promise.resolve(false);

  return runTransaction("readwrite", (store) => store.delete(key))
    .then(() => true)
    .catch(() => false);
}

// Vergelijkt twee antwoordobjecten. Wordt gebruikt om te bepalen of een bewaard
// concept werkelijk afwijkt van wat de server teruggeeft; is dat niet zo, dan
// hoeft de gebruiker ook niets te weten.
export function answersDiffer(left, right) {
  try {
    return JSON.stringify(left ?? {}) !== JSON.stringify(right ?? {});
  } catch {
    return false;
  }
}
