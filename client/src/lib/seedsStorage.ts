/**
 * Seeded Overlays storage helpers.
 *
 * Persists Support/Resistance levels and trendlines per-ticker in localStorage,
 * with a 24h TTL on each entry. "Persistent" arrays are what the chart draws;
 * "Seeds" arrays are the source-of-truth that the Levels tab feeds into and that
 * the auto-trendline indicator writes. Clearing a seeded overlay removes it from
 * both the persistent and seed array for that ticker.
 *
 * Storage layout (per key):
 *   { [tickerUpper: string]: SeededLevel[] | SeededTrendline[] }
 *
 * Each entry has `createdAt` (epoch ms) — entries older than 24h are filtered out
 * on read.
 *
 * Reverse-engineered from the live Vultr bundle (index-CsG73Aq_.js) to give us
 * an editable TypeScript source of truth.
 */

// ───────── Storage key constants ─────────
export const SR_PERSISTENT_KEY = "reit-viz-srlevel-persistent-v1";
export const TL_PERSISTENT_KEY = "reit-viz-trendline-persistent-v1";
export const SR_SEEDS_KEY = "reit-viz-srlevel-seeds-v1";
export const TL_SEEDS_KEY = "reit-viz-trendline-seeds-v1";

/** TTL: 24 hours (in ms). Entries older than this are evicted on read. */
export const SEEDS_TTL_MS = 1440 * 60 * 1000;

// ───────── Types ─────────
export type SRLevelType = "ma" | "fib" | "horizontal";

export interface SeededLevel {
  type: SRLevelType;
  price: number;
  maType?: string;
  maPeriod?: number | string;
  fibLevel?: number;
  compositeScore?: number;
  hidden?: boolean;
  source?: string; // e.g. "auto-trendline-..." indicates auto-generated
  createdAt?: number;
}

export interface SeededTrendline {
  kind: "support" | "resistance";
  date1: string;
  price1: number;
  date2: string;
  price2: number;
  slopePctPerYear?: number;
  broken?: boolean;
  compositeScore?: number;
  hidden?: boolean;
  source?: string;
  createdAt?: number;
}

// ───────── Internals ─────────
function isFresh<T extends { createdAt?: number }>(entry: T): boolean {
  if (!entry || typeof entry.createdAt !== "number") return true;
  return Date.now() - entry.createdAt <= SEEDS_TTL_MS;
}

// ───────── Public API ─────────

/**
 * Read entries for a ticker from a storage key. Filters out stale entries
 * (older than TTL) and rewrites storage if any were evicted.
 */
export function readSeeds<T extends { createdAt?: number }>(
  storageKey: string,
  ticker: string,
): T[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, T[]>;
    const arr = map?.[ticker];
    if (!Array.isArray(arr)) return [];
    const fresh = arr.filter(isFresh);
    if (fresh.length !== arr.length) {
      try {
        if (fresh.length === 0) delete map[ticker];
        else map[ticker] = fresh;
        localStorage.setItem(storageKey, JSON.stringify(map));
      } catch {
        /* quota or serialization failure — ignore */
      }
    }
    return fresh;
  } catch {
    return [];
  }
}

/**
 * Write entries for a ticker to a storage key. If the array is empty, the
 * ticker key is removed from the underlying map.
 */
export function writeSeeds<T>(storageKey: string, ticker: string, arr: T[]): void {
  try {
    const raw = localStorage.getItem(storageKey);
    const map = raw ? (JSON.parse(raw) as Record<string, T[]>) : {};
    if (arr.length === 0) delete map[ticker];
    else map[ticker] = arr;
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Notify other parts of the app that seeds have changed. ChartPane listens
 * for this event to redraw overlays without a full re-render.
 */
export function dispatchSeedsRestored(): void {
  try {
    window.dispatchEvent(new Event("reit-viz-seeds-restored"));
  } catch {
    /* SSR or restricted env — ignore */
  }
}

// ───────── Formatters used by the overlay manager UI ─────────

export function formatLevelLabel(level: SeededLevel): string {
  if (level.type === "ma") {
    const t = level.maType ?? "MA";
    const p = level.maPeriod ?? "";
    return `${t}${p} @ $${Number(level.price).toFixed(2)}`;
  }
  if (level.type === "fib") {
    const fib =
      level.fibLevel != null
        ? `${(Number(level.fibLevel) * 100).toFixed(1)}%`
        : "Fib";
    return `Fib ${fib} @ $${Number(level.price).toFixed(2)}`;
  }
  return `Horizontal @ $${Number(level.price).toFixed(2)}`;
}

export function formatTrendlineLabel(tl: SeededTrendline): string {
  const kindLabel = tl.kind === "resistance" ? "Resistance" : "Support";
  const slope = Number.isFinite(tl.slopePctPerYear)
    ? ` ${(Number(tl.slopePctPerYear) * 100).toFixed(1)}%/yr`
    : "";
  const broken = tl.broken ? " (broken)" : "";
  return `${kindLabel} TL${slope}${broken}`;
}

// ───────── Auto-trendline cleanup ─────────

/**
 * Remove all auto-trendline-generated entries (identified by source prefix)
 * from both persistent and seed stores for a ticker (or all tickers if null).
 * Returns the number of entries removed across all four stores.
 *
 * Note: the actual auto-trendline computation (DWe/IWe in the bundle) lives in
 * a deep helper chain and is not reproduced here. This function only handles
 * the *cleanup* side, which the Seeds UI's "Clear" button calls.
 */
export function clearAutoTrendlines(ticker?: string): number {
  let removed = 0;
  const tickerUp = ticker ? ticker.toUpperCase() : undefined;

  for (const key of [TL_SEEDS_KEY, TL_PERSISTENT_KEY]) {
    let map: Record<string, SeededLevel[] | SeededTrendline[]> = {};
    try {
      map = JSON.parse(localStorage.getItem(key) || "{}");
    } catch {
      /* ignore */
    }
    const tickers = tickerUp ? [tickerUp] : Object.keys(map);
    for (const tk of tickers) {
      const arr = map[tk];
      if (!Array.isArray(arr)) continue;
      const kept = arr.filter(
        (entry) =>
          !(typeof entry?.source === "string" && entry.source.startsWith("auto-trendline-")),
      );
      removed += arr.length - kept.length;
      if (kept.length === 0) delete map[tk];
      else map[tk] = kept as SeededLevel[] & SeededTrendline[];
    }
    try {
      localStorage.setItem(key, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  for (const key of [SR_SEEDS_KEY, SR_PERSISTENT_KEY]) {
    let map: Record<string, SeededLevel[]> = {};
    try {
      map = JSON.parse(localStorage.getItem(key) || "{}");
    } catch {
      /* ignore */
    }
    const tickers = tickerUp ? [tickerUp] : Object.keys(map);
    for (const tk of tickers) {
      const arr = map[tk];
      if (!Array.isArray(arr)) continue;
      const kept = arr.filter(
        (entry) =>
          !(typeof entry?.source === "string" && entry.source.startsWith("auto-trendline-")),
      );
      removed += arr.length - kept.length;
      if (kept.length === 0) delete map[tk];
      else map[tk] = kept;
    }
    try {
      localStorage.setItem(key, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  return removed;
}
