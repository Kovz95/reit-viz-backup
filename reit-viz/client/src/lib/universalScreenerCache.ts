// Universal Hit-Rate Screener — library cache.
//
// A full-universe qualified-setup library runs to several MB (thousands of
// rows carrying all-horizon stats), well past localStorage's synchronous
// budget, so libraries persist to IndexedDB. Small prefs (settings, filters)
// stay in localStorage per app convention. The compute model is per-browser
// (the sweep runs client-side), so persistence is per-browser too.
//
// Libraries are keyed by a scope hash: a stable FNV-1a digest of the resolved
// universe + full sweep settings. Any change to either produces a new key, so
// the page can tell "this exact scope has a cached library" apart from "you
// need to Run".

import type { QualifiedSetup, SweepSettings } from "@/lib/universalSweep";

export interface SweepLibrary {
  version: 1;
  builtAt: string;
  refreshedAt?: string;
  scopeHash: string;
  scopeDescription: string;
  universeCount: number;
  pairCount: number;
  settings: SweepSettings;
  rows: QualifiedSetup[];
}

const DB_NAME = "reit-viz-universal-screener";
const STORE = "libraries";
const DB_VERSION = 1;
const MAX_LIBRARIES = 10;

// ---------------------------------------------------------------------------
// Scope hashing
// ---------------------------------------------------------------------------

/** Stable stringify: objects serialized with sorted keys, Sets/arrays as-is. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computeScopeHash(input: {
  tickers: string[];
  pairList: [string, string][];
  settings: SweepSettings;
}): string {
  const payload = stableStringify({
    tickers: [...input.tickers].sort(),
    pairs: input.pairList.map(([a, b]) => `${a}/${b}`).sort(),
    settings: input.settings,
  });
  return fnv1a(payload) + "-" + fnv1a(payload.split("").reverse().join(""));
}

// ---------------------------------------------------------------------------
// IndexedDB plumbing (minimal, promise-wrapped)
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "scopeHash" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Public API — all methods swallow storage errors (cache is best-effort)
// ---------------------------------------------------------------------------

export async function saveLibrary(lib: SweepLibrary): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(lib);
    await txDone(tx);

    // LRU-trim (by builtAt) beyond MAX_LIBRARIES.
    const all = await listLibraries();
    if (all.length > MAX_LIBRARIES) {
      const excess = all
        .sort((a, b) => (a.builtAt < b.builtAt ? -1 : 1))
        .slice(0, all.length - MAX_LIBRARIES);
      const tx2 = db.transaction(STORE, "readwrite");
      for (const l of excess) tx2.objectStore(STORE).delete(l.scopeHash);
      await txDone(tx2);
    }
    db.close();
  } catch {
    /* best-effort */
  }
}

export async function loadLibrary(scopeHash: string): Promise<SweepLibrary | null> {
  try {
    const db = await openDb();
    const lib = await reqResult(
      db.transaction(STORE, "readonly").objectStore(STORE).get(scopeHash),
    );
    db.close();
    return (lib as SweepLibrary | undefined)?.version === 1 ? (lib as SweepLibrary) : null;
  } catch {
    return null;
  }
}

/** Most recently built library, regardless of scope. */
export async function loadLatest(): Promise<SweepLibrary | null> {
  const all = await listLibraries(true);
  if (all.length === 0) return null;
  return all.sort((a, b) => (a.builtAt > b.builtAt ? -1 : 1))[0];
}

/** Library metadata list (rows included only when `withRows`). */
export async function listLibraries(withRows = false): Promise<SweepLibrary[]> {
  try {
    const db = await openDb();
    const all = (await reqResult(
      db.transaction(STORE, "readonly").objectStore(STORE).getAll(),
    )) as SweepLibrary[];
    db.close();
    const valid = all.filter((l) => l?.version === 1);
    return withRows ? valid : valid.map((l) => ({ ...l, rows: [] }));
  } catch {
    return [];
  }
}

export async function deleteLibrary(scopeHash: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(scopeHash);
    await txDone(tx);
    db.close();
  } catch {
    /* best-effort */
  }
}
