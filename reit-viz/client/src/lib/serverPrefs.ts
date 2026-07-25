// Server-synced preference store for named-template stores (pair templates,
// screener saved screens, disloc presets, indicator sets, ...).
//
// Templates used to live in per-browser localStorage; they now live in the
// server's SQLite prefs table (/api/prefs/:key) so the same saved templates
// appear on every computer. localStorage is kept as a boot cache + offline
// fallback:
//   - state initializers still read localStorage synchronously for instant UI;
//   - loadServerPref() then hydrates from the server (server value wins);
//   - if the server has NO value but localStorage does, the local value is
//     pushed up once (seamless migration of existing saved templates);
//   - saveServerPref() writes localStorage immediately and debounces a POST.
//
// The 5001 dev container predates /api/prefs and answers unmatched /api routes
// with 200 text/html — every response is content-type checked so that setup
// silently degrades to localStorage-only instead of corrupting stores.
import { API_BASE } from "@/lib/queryClient";

function lsGet(key: string): any {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: any): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

async function fetchJson(url: string, init?: RequestInit): Promise<any | undefined> {
  try {
    const res = await fetch(`${API_BASE}${url}`, init);
    if (!res.ok) return undefined;
    if (!(res.headers.get("content-type") || "").includes("application/json")) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

function postPref(key: string, value: any): Promise<any | undefined> {
  return fetchJson(`/api/prefs/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

/**
 * Load a pref, server-first. Returns null when neither the server nor
 * localStorage has a value. Callers typically initialize state from
 * localStorage synchronously, then apply this promise's result if non-null.
 */
export async function loadServerPref<T>(key: string): Promise<T | null> {
  const body = await fetchJson(`/api/prefs/${encodeURIComponent(key)}`);
  const local = lsGet(key);
  if (body === undefined) return local; // server unreachable / route absent
  if (body.value !== null && body.value !== undefined) {
    lsSet(key, body.value);
    return body.value as T;
  }
  if (local !== null) {
    void postPref(key, local); // one-time migration of existing local store
    return local as T;
  }
  return null;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Persist a pref: localStorage immediately, server POST debounced per key
 * (fire-and-forget — last write wins).
 */
export function saveServerPref(key: string, value: any, debounceMs = 400): void {
  lsSet(key, value);
  const prev = saveTimers.get(key);
  if (prev) clearTimeout(prev);
  saveTimers.set(key, setTimeout(() => {
    saveTimers.delete(key);
    void postPref(key, value);
  }, debounceMs));
}

export function deleteServerPref(key: string): void {
  try { localStorage.removeItem(key); } catch {}
  void fetchJson(`/api/prefs/${encodeURIComponent(key)}/delete`, { method: "POST" });
}
