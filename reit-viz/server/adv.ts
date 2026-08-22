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
  /** Trailing-window MEDIAN daily dollar volume, in $ millions. The median ignores
   *  earnings-day / rebalance spikes that inflate the mean, so it's the honest
   *  liquidity number for sizing. */
  medianUsdMM: number | null;
  /** 25th-percentile daily dollar volume, in $ millions — a stressed-tape read. */
  p25UsdMM: number | null;
  /** Trailing-window average daily share volume, in millions of shares. */
  advShares: number | null;
  /** Most recent close used in the window (in the listing currency). */
  lastClose: number | null;
  /** Listing currency the price is quoted in (e.g. "USD", "GBp", "EUR"). */
  currency: string | null;
  /** Number of bars actually averaged (≤ window). */
  days: number;
  /** ISO date of the most recent bar, or null. */
  asOf: string | null;
  /** Trading-day window requested. */
  window: number;
  /** ISO timestamp this entry was computed. */
  computedAt: string;
  /** True when Yahoo reports the symbol as not found / delisted (vs a transient
   *  failure) — lets the UI distinguish a delisted name from "still loading". */
  delisted?: boolean;
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
  // Entries cached before the median fields existed must recompute once.
  if (entry.medianUsdMM === undefined) return false;
  const age = Date.now() - new Date(entry.computedAt).getTime();
  if (!Number.isFinite(age)) return false;
  // A null result (Yahoo error / no data) is only briefly fresh, so a transient
  // failure retries within the hour instead of being pinned for a full day.
  const ttl = entry.advUsdMM == null ? NEG_TTL_MS : CACHE_TTL_MS;
  return age < ttl;
}

// ── FX: convert a listing currency to USD so $ ADV is comparable across markets ──
// Non-US names are priced in their local currency (UK closes are in GBp = pence),
// so close × volume is a *local-currency* turnover; without this it would be
// mislabeled as USD (off ~80× for pence). Rates come from Yahoo's FX chart
// (e.g. "GBPUSD=X"), cached in-memory. Returns null when a rate can't be
// resolved, so we show nothing rather than a wrong (unconverted) number.
const fxCache = new Map<string, { usd: number; at: number }>();

async function majorToUsd(major: string): Promise<number | null> {
  if (major === "USD") return 1;
  const now = Date.now();
  const cached = fxCache.get(major);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.usd;
  try {
    const bars = await fetchYahooPrices(`${major}USD=X`);
    const last = bars.closes[bars.closes.length - 1];
    if (!Number.isFinite(last) || last <= 0) return null;
    fxCache.set(major, { usd: last, at: now });
    return last;
  } catch {
    return null;
  }
}

/** USD value of one price unit quoted in `currency`. Handles pence minor units
 *  (Yahoo writes UK pence as "GBp" / "GBX" = 1/100 GBP). */
async function currencyToUsd(currency: string | undefined): Promise<number | null> {
  const raw = (currency ?? "USD").trim();
  if (!raw || raw.toUpperCase() === "USD") return 1;
  const upper = raw.toUpperCase();
  // Minor units carry a lowercase last letter (pence "GBp") — 1/100 of the major.
  const isMinor = raw !== upper || upper === "GBX";
  const major = upper === "GBX" ? "GBP" : upper;
  const rate = await majorToUsd(major);
  if (rate == null) return null;
  return isMinor ? rate / 100 : rate;
}

/** Compute the trailing-window ADV for one ticker from its (cached) Yahoo bars. */
async function computeOne(ticker: string, window: number, forceRefresh: boolean): Promise<AdvEntry> {
  const bars = await fetchYahooPrices(ticker, forceRefresh);
  // USD-per-price-unit for this listing (1 for US; GBPUSD/100 for UK pence; …).
  const usdFactor = await currencyToUsd(bars.currency);
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
      advUsdMM: null, medianUsdMM: null, p25UsdMM: null,
      advShares: null, lastClose: null, currency: bars.currency ?? null,
      days: 0, asOf: null, window, computedAt: new Date().toISOString(),
    };
  }
  let sumLocal = 0;
  let sumSh = 0;
  for (const b of slice) {
    sumLocal += b.close * b.vol; // turnover in the listing currency
    sumSh += b.vol;
  }
  // Sorted per-day turnovers (local currency) for the median / p25.
  const sorted = slice.map((b) => b.close * b.vol).sort((a, b) => a - b);
  const quantile = (p: number): number => {
    const pos = p * (sorted.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };
  return {
    // Convert local-currency turnover to USD. If the FX rate is unavailable for a
    // non-USD name, leave $ ADV null (blank) rather than show an unconverted figure.
    advUsdMM: usdFactor == null ? null : (sumLocal / days / 1e6) * usdFactor,
    medianUsdMM: usdFactor == null ? null : (quantile(0.5) / 1e6) * usdFactor,
    p25UsdMM: usdFactor == null ? null : (quantile(0.25) / 1e6) * usdFactor,
    advShares: sumSh / days / 1e6,
    lastClose: slice[slice.length - 1].close,
    currency: bars.currency ?? null,
    days,
    asOf: slice[slice.length - 1].date,
    window,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Read-only view of every cached entry for a window, keyed by ticker (without
 * the @window suffix). Serves the bulk endpoint — no computation, no TTL check
 * (a stale-but-present ADV beats no ADV until the nightly job replaces it).
 */
export function getCachedAdvEntries(window: number): Record<string, AdvEntry> {
  const cache = loadCache();
  const suffix = `@${window}`;
  const out: Record<string, AdvEntry> = {};
  for (const [key, entry] of Object.entries(cache)) {
    if (key.endsWith(suffix)) out[key.slice(0, -suffix.length)] = entry;
  }
  return out;
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
      } catch (err) {
        const empty: AdvEntry = {
          advUsdMM: null, medianUsdMM: null, p25UsdMM: null,
          advShares: null, lastClose: null, currency: null,
          days: 0, asOf: null, window, computedAt: new Date().toISOString(),
          ...((err as any)?.notFound ? { delisted: true } : {}),
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
