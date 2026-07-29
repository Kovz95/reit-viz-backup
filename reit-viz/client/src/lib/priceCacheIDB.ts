// IndexedDB persistence for per-ticker workbook payloads.
//
// Both ticker loaders (dataService.getTickerRawBase and
// tickerData.fetchTickerRawBase) keep permanent in-memory caches, but those die
// with the tab — every session re-downloads every ticker it touches. This layer
// makes the first touch of a session instant when the payload was fetched
// recently (TTL below), while the nightly data refresh naturally invalidates
// via expiry. Payloads are stored post-parse, namespaced by loader, and empty
// results are never persisted (a transient outage must not poison the cache).

const DB_NAME = "reit-viz-price-cache";
const STORE = "tickers";
const DB_VERSION = 1;
const TTL_MS = 4 * 60 * 60 * 1000; // 4h — same trading day reuse, overnight refresh wins

interface CacheRow {
  key: string;
  savedAt: number;
  payload: unknown;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Get a cached payload if present and within TTL; null otherwise. */
export async function idbGetFresh(key: string): Promise<unknown | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as CacheRow | undefined;
        if (row && Date.now() - row.savedAt < TTL_MS) resolve(row.payload);
        else resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Fire-and-forget write. Never throws; never blocks the caller. */
export function idbPut(key: string, payload: unknown): void {
  void openDb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, savedAt: Date.now(), payload } as CacheRow);
    } catch {
      /* quota / serialization failures are non-fatal */
    }
  });
}

/** Drop everything (dev/debug hook). */
export function idbClearPriceCache(): void {
  void openDb().then((db) => {
    if (!db) return;
    try {
      db.transaction(STORE, "readwrite").objectStore(STORE).clear();
    } catch { /* ignore */ }
  });
}
