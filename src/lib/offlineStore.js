const DB_NAME = "ember-offline";
const DB_VERSION = 2;
const STORE_PACKAGES = "packages";
const STORE_DOCUMENTS = "documents";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error || new Error("Kon lokale opslag niet openen."));
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PACKAGES)) {
        const store = db.createObjectStore(STORE_PACKAGES, { keyPath: "id" });
        store.createIndex("status", "local_status", { unique: false });
      store.createIndex("updated_at", "local_updated_at", { unique: false });
    }
    if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
      const store = db.createObjectStore(STORE_DOCUMENTS, { keyPath: "id" });
      store.createIndex("package_id", "package_id", { unique: false });
    }
    };
  });
}

async function runTransaction(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PACKAGES, mode);
    const store = tx.objectStore(STORE_PACKAGES);
    const result = fn(store);

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("Lokale opslagactie mislukt."));
    tx.onabort = () => reject(tx.error || new Error("Lokale opslagactie afgebroken."));
  }).finally(() => db.close());
}

export async function listOfflinePackages() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PACKAGES, "readonly");
    const store = tx.objectStore(STORE_PACKAGES);
    const request = store.getAll();

    request.onerror = () => reject(request.error || new Error("Kon offline pakketten niet laden."));
    request.onsuccess = () => {
      const items = Array.isArray(request.result) ? request.result.slice() : [];
      items.sort((a, b) => {
        const left = Date.parse(b?.local_updated_at || b?.imported_at || 0);
        const right = Date.parse(a?.local_updated_at || a?.imported_at || 0);
        return left - right;
      });
      resolve(items);
    };

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Kon offline pakketten niet laden."));
    };
  });
}

export async function saveOfflinePackage(item) {
  return runTransaction("readwrite", (store) => {
    store.put(item);
    return item;
  });
}

export async function deleteOfflinePackage(id) {
  return runTransaction("readwrite", (store) => {
    store.delete(id);
    return id;
  });
}

export async function deleteOfflineDocuments(packageId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, "readwrite");
    const store = tx.objectStore(STORE_DOCUMENTS);
    const request = store.index("package_id").getAllKeys(packageId);
    request.onsuccess = () => {
      for (const key of request.result || []) store.delete(key);
    };
    request.onerror = () => reject(request.error || new Error("Lokale bestanden konden niet worden verwijderd."));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Lokale bestanden konden niet worden verwijderd."));
    tx.onabort = () => reject(tx.error || new Error("Lokale bestanden konden niet worden verwijderd."));
  }).finally(() => db.close());
}

export async function getOfflinePackage(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PACKAGES, "readonly");
    const store = tx.objectStore(STORE_PACKAGES);
    const request = store.get(id);

    request.onerror = () => reject(request.error || new Error("Kon offline pakket niet openen."));
    request.onsuccess = () => resolve(request.result ?? null);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Kon offline pakket niet openen."));
    };
  });
}

export async function saveOfflineDocuments(packageId, documents) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, "readwrite");
    const store = tx.objectStore(STORE_DOCUMENTS);
    const existing = store.index("package_id").getAllKeys(packageId);
    existing.onsuccess = () => {
      for (const key of existing.result || []) store.delete(key);
      for (const document of documents) store.put({ ...document, package_id: packageId });
    };
    existing.onerror = () => reject(existing.error || new Error("Lokale bestanden konden niet worden voorbereid."));
    tx.oncomplete = () => resolve(documents);
    tx.onerror = () => reject(tx.error || new Error("Lokale bestanden konden niet worden opgeslagen."));
    tx.onabort = () => reject(tx.error || new Error("Lokale bestanden konden niet worden opgeslagen."));
  }).finally(() => db.close());
}

export async function listOfflineDocuments(packageId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, "readonly");
    const request = tx.objectStore(STORE_DOCUMENTS).index("package_id").getAll(packageId);
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error || new Error("Lokale bestanden konden niet worden geladen."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Lokale bestanden konden niet worden geladen."));
    };
  });
}
