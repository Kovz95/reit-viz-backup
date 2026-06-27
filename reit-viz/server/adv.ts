// Trailing N-trading-day average dollar volume ($ ADV) computed from the real
// Yahoo Finance volume feed (server/yahooPrices.ts). The workbook's own OHLC
// data carries no volume, so this is the only source of a true, current ADV.
//
// Each ticker's bars are fetched (and disk-cached for 1h) by fetchYahooPrices;
// on top of that we keep a longer-lived cache of the *computed* ADV values
// (adv-cache.json) so warm loads are instant and we don't re-derive on every
// request. The ADV figure only moves once a day, so a 20h TTL is plenty.
import fs from "fs";
import path from "path";
import { fetchYahooPrices } from "./yahooPrices";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(DATA_DIR, "adv-cache.json");
const CACHE_TTL_MS = 20 * 60 * 60 * 1000; // 20h — ADV changes at most once per trading day
const NEG_TTL_MS = 60 * 60 * 1000; // 1h — don't pin a null (failed/empty) result for a full day
const DEFAULT_WINDOW = 90; // trading days
const MAX_CONCURRENCY = 6; // be gentle with Yahoo on cold batches

export interface AdvEntry {
  /** Trailing-window average daily dollar volume (mean of close × volume), in $ millions. */
  advUsdMM: number | null;
  /** Trailing-window average daily share volume, in millions of shares. */
  advShares: number | null;
  /** Most recent close used in the window. */
  lastClose: number | null;
  /** Number of bars actually averaged (≤ window). */
  days: number;
  /** ISO date of the most recent bar, or null. */
  asOf: string | null;
  /** Trading-day window requested. */
  window: number;
  /** ISO timestamp this entry was computed. */
  computedAt: string;
}

type AdvCache = Record<string, AdvEntry>; // keyed by UPPER ticker

let _cache: AdvCache | null = null;

function loadCache(): AdvCache {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as AdvCache;
  } catch {
    _cache = {};
  }
  return _cache;
}

function saveCache(cache: AdvCache): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch {
    /* best-effort cache write */
  }
}

function isFresh(entry: AdvEntry | undefined, window: number): boolean {
  if (!entry || entry.window !== window) return false;
  const age = Date.now() - new Date(entry.computedAt).getTime();
  if (!Number.isFinite(age)) return false;
  // A null result (Yahoo error / no data) is only briefly fresh, so a transient
  // failure retries within the hour instead of being pinned for a full day.
  const ttl = entry.advUsdMM == null ? NEG_TTL_MS : CACHE_TTL_MS;
  return age < ttl;
}

/** Compute the trailing-window ADV for one ticker from its (cached) Yahoo bars. */
async function computeOne(ticker: string, window: number, forceRefresh: boolean): Promise<AdvEntry> {
  const bars = await fetchYahooPrices(ticker, forceRefresh);
  // Pair up close × volume for valid bars only, then take the last `window`.
  const valid: { close: number; vol: number; date: string }[] = [];
  for (let i = 0; i < bars.closes.length; i++) {
    const c = bars.closes[i];
    const v = bars.volumes[i];
    if (Number.isFinite(c) && Number.isFinite(v) && v > 0) {
      valid.push({ close: c, vol: v, date: bars.dates[i] });
    }
  }
  const slice = valid.slice(-window);
  const days = slice.length;
  if (days === 0) {
    return {
      advUsdMM: null, advShares: null, lastClose: null,
      days: 0, asOf: null, window, computedAt: new Date().toISOString(),
    };
  }
  let sumUsd = 0;
  let sumSh = 0;
  for (const b of slice) {
    sumUsd += b.close * b.vol;
    sumSh += b.vol;
  }
  return {
    advUsdMM: sumUsd / days / 1e6,
    advShares: sumSh / days / 1e6,
    lastClose: slice[slice.length - 1].close,
    days,
    asOf: slice[slice.length - 1].date,
    window,
    computedAt: new Date().toISOString(),
  };
}

/** Bounded-concurrency map over async work. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Return trailing-window ADV for a batch of tickers. Fresh cache entries are
 * served directly; stale / missing ones are (re)computed from Yahoo with
 * bounded concurrency. Tickers that error (delisted, unknown symbol, Yahoo
 * hiccup) resolve to a null entry rather than failing the whole request.
 */
export async function getAdvBatch(
  tickers: string[],
  window: number = DEFAULT_WINDOW,
  forceRefresh = false,
): Promise<Record<string, AdvEntry>> {
  const cache = loadCache();
  const wanted = Array.from(
    new Set(tickers.map((t) => String(t).toUpperCase()).filter(Boolean)),
  );
  // Cache is keyed by ticker + window so different windows (e.g. 30d and 90d)
  // coexist instead of evicting each other on every request.
  const ck = (t: string) => `${t}@${window}`;

  const stale = wanted.filter((t) => forceRefresh || !isFresh(cache[ck(t)], window));

  if (stale.length > 0) {
    const computed = await mapLimit(stale, MAX_CONCURRENCY, async (ticker) => {
      try {
        return [ticker, await computeOne(ticker, window, forceRefresh)] as const;
      } catch {
        const empty: AdvEntry = {
          advUsdMM: null, advShares: null, lastClose: null,
          days: 0, asOf: null, window, computedAt: new Date().toISOString(),
        };
        return [ticker, empty] as const;
      }
    });
    for (const [ticker, entry] of computed) cache[ck(ticker)] = entry;
    saveCache(cache);
  }

  const results: Record<string, AdvEntry> = {};
  for (const t of wanted) results[t] = cache[ck(t)];
  return results;
}
