// Baskets: server-backed collection shared across devices/browsers.
// Persisted on the server (see /api/baskets in server/routes.ts). The hook +
// mutators keep the same synchronous interface they had when this was
// localStorage-backed; a module cache + change event give optimistic
// reactivity across the app, reconciling with the server in the background.

import { useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  getAutoBaskets,
  initAutoBaskets,
  isAutoBasketId,
  AUTO_BASKETS_CHANGED,
} from "@/lib/autoBaskets";

export interface Basket {
  id: string;
  name: string;
  tickers: string[];
  createdAt: number;
  updatedAt: number;
  weighting: string;
  rebalance: string;
  customWeights: Record<string, number>;
  volLookback: number;
}

export interface BasketOptions {
  weighting?: string;
  rebalance?: string;
  customWeights?: Record<string, number>;
  volLookback?: number;
}

export interface UseBasketsReturn {
  baskets: Basket[];
  addBasket: (name: string, tickers: string[], options?: BasketOptions) => Basket;
  updateBasket: (id: string, patch: Partial<Pick<Basket, "name" | "tickers" | "weighting" | "rebalance" | "customWeights" | "volLookback">>) => void;
  deleteBasket: (id: string) => void;
  getBasket: (id: string) => Basket | undefined;
}

const LEGACY_STORAGE_KEY = "reit-viz:baskets:v1";
const CHANGE_EVENT = "reit-viz:baskets:changed";

// Module-level cache so once loaded, later hook mounts render populated
// synchronously (and mutators can update it optimistically before the server
// round-trips).
let cache: Basket[] = [];
// True after the first successful server load — gates the changed-broadcast
// in refresh() so initial population doesn't fire a spurious change event.
let everLoaded = false;
let inflight: Promise<Basket[]> | null = null;

function emitChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

function sortByName(list: Basket[]): Basket[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/** Saved baskets first (name-sorted), then the derived auto baskets. */
function combined(): Basket[] {
  return [...cache, ...getAutoBaskets()];
}

/** Non-hook lookup against the module cache (id first, then name — matches
 *  useBaskets().getBasket). For module-level helpers (e.g. label formatters)
 *  that can't call hooks; empty until the first useBaskets() mount loads. */
export function findBasketSync(idOrName: string): Basket | undefined {
  const all = combined();
  return all.find((b) => b.id === idOrName) ?? all.find((b) => b.name === idOrName);
}

function normalizeBasket(b: any): Basket | null {
  if (!b || typeof b.id !== "string" || typeof b.name !== "string" || !Array.isArray(b.tickers)) {
    return null;
  }
  const now = Date.now();
  return {
    id: b.id,
    name: b.name,
    tickers: b.tickers.map((t: string) => String(t).toUpperCase()),
    createdAt: typeof b.createdAt === "number" ? b.createdAt : now,
    updatedAt: typeof b.updatedAt === "number" ? b.updatedAt : now,
    weighting: typeof b.weighting === "string" ? b.weighting : "market_cap",
    rebalance: typeof b.rebalance === "string" ? b.rebalance : "monthly",
    customWeights: b.customWeights && typeof b.customWeights === "object" ? b.customWeights : {},
    volLookback: typeof b.volLookback === "number" ? b.volLookback : 60,
  };
}

function createBasket(name: string, tickers: string[], options?: BasketOptions): Basket {
  const now = Date.now();
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `basket-${now}-${Math.random().toString(36).slice(2)}`,
    name: name.trim(),
    tickers: tickers.map((t) => t.toUpperCase()),
    createdAt: now,
    updatedAt: now,
    weighting: options?.weighting ?? "market_cap",
    rebalance: options?.rebalance ?? "monthly",
    customWeights: options?.customWeights ?? {},
    volLookback: options?.volLookback ?? 60,
  };
}

async function getFromServer(): Promise<Basket[]> {
  const resp = await apiRequest("GET", "/api/baskets");
  const json = (await resp.json()) as { baskets?: any[] };
  const list = (json.baskets ?? [])
    .map(normalizeBasket)
    .filter((b): b is Basket => b != null);
  return sortByName(list);
}

/** Load the server list (deduped), migrating any legacy localStorage baskets
 *  up to the server once. */
function refresh(): Promise<Basket[]> {
  if (inflight) return inflight;
  const p = (async () => {
    let server: Basket[];
    try {
      server = await getFromServer();
    } catch {
      return cache;
    }
    // One-time migration of pre-server localStorage baskets.
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          const legacy = JSON.parse(raw);
          if (Array.isArray(legacy)) {
            const byName = new Set(server.map((b) => b.name));
            const byId = new Set(server.map((b) => b.id));
            const missing = legacy
              .map(normalizeBasket)
              .filter((b): b is Basket => b != null && !byId.has(b.id) && !byName.has(b.name));
            if (missing.length) {
              await Promise.all(
                missing.map((b) => apiRequest("POST", "/api/baskets", b).catch(() => {})),
              );
              server = await getFromServer().catch(() => server);
            }
          }
          window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
    } catch { /* ignore migration errors */ }
    // Broadcast when a refresh actually changed something (edits made in
    // another tab/device arriving via the focus refetch) so listeners that
    // react to basket changes — e.g. the Charts live-refetch of plotted
    // basket series — fire for remote edits too, not just local saves. The
    // very first load (cache never populated) stays silent: everything is
    // still fetching then anyway.
    const changed = everLoaded && JSON.stringify(cache) !== JSON.stringify(server);
    cache = server;
    everLoaded = true;
    if (changed && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    }
    return server;
  })();
  inflight = p;
  p.finally(() => { inflight = null; });
  return p;
}

export function useBaskets(): UseBasketsReturn {
  const [baskets, setBaskets] = useState<Basket[]>(() => combined());

  useEffect(() => {
    let alive = true;
    const sync = () => { if (alive) setBaskets(combined()); };
    // Cross-tab sync: another tab's write hits the server but we can't hear its
    // in-memory event, so force a re-fetch (not just a cache read) on focus.
    const onFocus = () => {
      inflight = null; // bypass the load-once guard so focus always re-fetches
      void refresh().then(sync);
    };
    initAutoBaskets();
    refresh().then(sync);
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener(AUTO_BASKETS_CHANGED, sync);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener(AUTO_BASKETS_CHANGED, sync);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const addBasket = useCallback(
    (name: string, tickers: string[], options?: BasketOptions): Basket => {
      const trimmed = name.trim();
      const upperTickers = tickers.map((t) => t.toUpperCase());
      // Upsert by name (matches production behaviour): overwrite an existing
      // same-name basket, otherwise create a new one.
      const existing = cache.find((b) => b.name === trimmed);
      const basket: Basket = existing
        ? {
            ...existing,
            tickers: upperTickers,
            weighting: options?.weighting ?? existing.weighting,
            rebalance: options?.rebalance ?? existing.rebalance,
            customWeights: options?.customWeights ?? existing.customWeights,
            volLookback: options?.volLookback ?? existing.volLookback,
            updatedAt: Date.now(),
          }
        : createBasket(name, tickers, options);
      cache = sortByName([...cache.filter((b) => b.id !== basket.id), basket]);
      emitChanged();
      void persist(basket);
      return basket;
    },
    []
  );

  const updateBasket = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<Basket, "name" | "tickers" | "weighting" | "rebalance" | "customWeights" | "volLookback">
      >
    ): void => {
      if (isAutoBasketId(id)) return; // auto baskets are derived — read-only
      const existing = cache.find((b) => b.id === id);
      if (!existing) return;
      const updated: Basket = {
        ...existing,
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        tickers:
          patch.tickers !== undefined ? patch.tickers.map((t) => t.toUpperCase()) : existing.tickers,
        weighting: patch.weighting !== undefined ? patch.weighting : existing.weighting,
        rebalance: patch.rebalance !== undefined ? patch.rebalance : existing.rebalance,
        customWeights:
          patch.customWeights !== undefined ? patch.customWeights : existing.customWeights,
        volLookback: patch.volLookback !== undefined ? patch.volLookback : existing.volLookback,
        updatedAt: Date.now(),
      };
      cache = sortByName(cache.map((b) => (b.id === id ? updated : b)));
      emitChanged();
      void persist(updated);
    },
    []
  );

  const deleteBasket = useCallback((id: string): void => {
    if (isAutoBasketId(id)) return; // auto baskets are derived — read-only
    cache = cache.filter((b) => b.id !== id);
    emitChanged();
    void (async () => {
      try {
        await apiRequest("POST", `/api/baskets/${encodeURIComponent(id)}/delete`);
      } catch {
        return; // keep optimistic removal
      }
      try {
        cache = await getFromServer();
        emitChanged();
      } catch { /* keep optimistic cache */ }
    })();
  }, []);

  // Resolve by id first, then fall back to name. Basket tokens ("BASKET:<x>") are
  // emitted as the id on some pages and as the name on others; matching either
  // keeps a saved basket resolvable no matter which page produced the reference.
  // (Names are unique — addBasket upserts by name — and never collide with UUIDs.)
  const getBasket = useCallback(
    (idOrName: string): Basket | undefined => {
      return baskets.find((b) => b.id === idOrName) ?? baskets.find((b) => b.name === idOrName);
    },
    [baskets]
  );

  return { baskets, addBasket, updateBasket, deleteBasket, getBasket };
}

/** Persist a single basket to the server, reconciling the cache with the
 *  authoritative server list afterward. */
async function persist(basket: Basket): Promise<void> {
  try {
    await apiRequest("POST", "/api/baskets", basket);
  } catch {
    return; // keep optimistic cache; server may retry on next load
  }
  try {
    cache = await getFromServer();
    emitChanged();
  } catch { /* keep optimistic cache */ }
}
