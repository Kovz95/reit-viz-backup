// excludedTickers: server-backed set of tickers hidden from the universe,
// namespaced ("workbook" or "global"). Persisted on the server (shared across
// devices) — see /api/excluded-tickers in server/routes.ts. The hook + mutators
// keep the same interface they had when this was localStorage-backed; a module
// cache + change events give synchronous, optimistic reactivity across the app.

import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

const cache = new Map<string, Set<string>>();
const inflight = new Map<string, Promise<Set<string>>>();

function changedEvent(namespace: string): string {
  return `reit-viz:excluded:${namespace}:changed`;
}
function emitChanged(namespace: string): void {
  window.dispatchEvent(new CustomEvent(changedEvent(namespace)));
}
function legacyKey(namespace: string): string {
  return `reit-viz:excluded-tickers:${namespace}:v1`;
}

async function getFromServer(namespace: string): Promise<Set<string>> {
  const resp = await apiRequest("GET", `/api/excluded-tickers/${encodeURIComponent(namespace)}`);
  const json = (await resp.json()) as { tickers?: string[] };
  return new Set((json.tickers ?? []).map((t) => t.toUpperCase()));
}

/** Fetch the server set (deduped per namespace), migrating any legacy
 *  localStorage exclusions up to the server once. */
function refresh(namespace: string): Promise<Set<string>> {
  const existing = inflight.get(namespace);
  if (existing) return existing;
  const p = (async () => {
    let server: Set<string>;
    try {
      server = await getFromServer(namespace);
    } catch {
      return cache.get(namespace) ?? new Set<string>();
    }
    // One-time migration of pre-server localStorage exclusions.
    try {
      const raw = window.localStorage.getItem(legacyKey(namespace));
      if (raw) {
        const legacy = JSON.parse(raw);
        if (Array.isArray(legacy)) {
          const missing = legacy
            .map((s: string) => String(s).toUpperCase())
            .filter((t) => !server.has(t));
          if (missing.length) {
            await Promise.all(missing.map((t) =>
              apiRequest("POST", `/api/excluded-tickers/${encodeURIComponent(namespace)}/${encodeURIComponent(t)}`).catch(() => {}),
            ));
            server = await getFromServer(namespace).catch(() => server);
          }
        }
        window.localStorage.removeItem(legacyKey(namespace));
      }
    } catch { /* ignore migration errors */ }
    cache.set(namespace, server);
    return server;
  })();
  inflight.set(namespace, p);
  p.finally(() => inflight.delete(namespace));
  return p;
}

/** Hook returning the current excluded set for a namespace (reactive). */
export function useExcludedTickers(namespace: string): Set<string> {
  const [excluded, setExcluded] = useState<Set<string>>(() => cache.get(namespace) ?? new Set());
  useEffect(() => {
    let alive = true;
    const sync = () => setExcluded(new Set(cache.get(namespace) ?? new Set<string>()));
    refresh(namespace).then(() => { if (alive) sync(); });
    window.addEventListener(changedEvent(namespace), sync);
    return () => { alive = false; window.removeEventListener(changedEvent(namespace), sync); };
  }, [namespace]);
  return excluded;
}

/** Optimistically update the cache, emit, then reconcile with the server. */
async function mutate(namespace: string, optimistic: (s: Set<string>) => void, request: Promise<unknown>): Promise<void> {
  const next = new Set(cache.get(namespace) ?? new Set<string>());
  optimistic(next);
  cache.set(namespace, next);
  emitChanged(namespace);
  try { await request; } catch { /* keep optimistic; server may have failed */ }
  cache.set(namespace, await getFromServer(namespace).catch(() => cache.get(namespace) ?? new Set()));
  emitChanged(namespace);
}

export function excludeTicker(namespace: string, ticker: string): void {
  const t = ticker.toUpperCase();
  void mutate(namespace, (s) => s.add(t),
    apiRequest("POST", `/api/excluded-tickers/${encodeURIComponent(namespace)}/${encodeURIComponent(t)}`));
}

/** Exclude many tickers at once via a single bulk request (one server write). */
export function excludeTickersBulk(namespace: string, tickers: string[]): void {
  const ts = tickers.map((t) => t.toUpperCase()).filter(Boolean);
  if (ts.length === 0) return;
  void mutate(
    namespace,
    (s) => { for (const t of ts) s.add(t); },
    apiRequest("POST", `/api/excluded-tickers/${encodeURIComponent(namespace)}/_bulk`, { tickers: ts }),
  );
}

export function restoreExcludedTicker(namespace: string, ticker: string): void {
  const t = ticker.toUpperCase();
  void mutate(namespace, (s) => s.delete(t),
    apiRequest("POST", `/api/excluded-tickers/${encodeURIComponent(namespace)}/${encodeURIComponent(t)}/delete`));
}

export function restoreAllExcluded(namespace: string): void {
  void mutate(namespace, (s) => s.clear(),
    apiRequest("POST", `/api/excluded-tickers/${encodeURIComponent(namespace)}/_clear`));
}
