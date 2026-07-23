// Intraday (hourly/sub-hourly) price history.
//
// Providers, in order:
//   1. FMP (financialmodelingprep.com) when FMP_API_KEY is set — history depth
//      is plan-dependent and far beyond Yahoo's caps; backfilled in windowed
//      chunks (FMP_INTRADAY_BACKFILL_DAYS, default 5y).
//   2. Yahoo v8 chart (no key needed) — 60m capped at ~730 days by Yahoo.
//
// Storage is a PERMANENT merging store (data/intraday-store): every bar ever
// fetched is kept and new fetches only pull the recent tail, so history
// accumulates indefinitely and API spend stays ~1 small request per ticker
// per REFRESH_TTL — even Yahoo-only tickers grow past the 730-day cap over
// time. A provider upgrade (yahoo → fmp) triggers one full re-backfill and
// replaces the store, so a single ticker never mixes bar grids from two
// sources (their session slot alignment may differ).
//
// If a refresh fails but the store has data, the stale store is served rather
// than erroring — intraday staleness beats a dead page.

import fs from "fs";
import path from "path";
import { toYahooSymbol } from "./yahooPrices";

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const FMP_BASE = "https://financialmodelingprep.com/api/v3/historical-chart";
const STORE_DIR = path.join(process.cwd(), "data", "intraday-store");
// Legacy TTL-cache dir (pre-2026-07-24) — migrated into the store on first read.
const LEGACY_CACHE_DIR = path.join(process.cwd(), "data", "yahoo-intraday-cache");
const REFRESH_TTL_MS = 20 * 60 * 1000; // don't hit any provider more often than this
const TAIL_OVERLAP_DAYS = 5; // re-fetch a little history so revised bars heal

export const INTRADAY_INTERVALS: Record<
  string,
  { yahooInterval: string; fmpInterval: string; maxDays: number }
> = {
  "60m": { yahooInterval: "60m", fmpInterval: "1hour", maxDays: 729 },
  "30m": { yahooInterval: "30m", fmpInterval: "30min", maxDays: 59 },
  "15m": { yahooInterval: "15m", fmpInterval: "15min", maxDays: 59 },
};

const MAX_REQUEST_DAYS = 3650;

function fmpKey(): string {
  return process.env.FMP_API_KEY?.trim() ?? "";
}
function fmpBackfillDays(): number {
  const v = parseInt(process.env.FMP_INTRADAY_BACKFILL_DAYS ?? "", 10);
  return Number.isFinite(v) && v > 0 ? Math.min(v, MAX_REQUEST_DAYS) : 1825;
}

export interface IntradayPriceData {
  ticker: string;
  interval: string;
  /** Epoch seconds (UTC) for each bar's session slot start. */
  timestamps: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
  fetchedAt: string;
}

interface IntradayStore extends IntradayPriceData {
  provider: "fmp" | "yahoo";
  /** Set once the provider's deep-history backfill has been attempted. */
  backfilled?: boolean;
}

interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ── Store I/O ───────────────────────────────────────────────────────────────

function storeFile(ticker: string, interval: string): string {
  return path.join(STORE_DIR, `${ticker.toUpperCase()}-${interval}.json`);
}

function readStore(ticker: string, interval: string): IntradayStore | null {
  try {
    return JSON.parse(fs.readFileSync(storeFile(ticker, interval), "utf-8")) as IntradayStore;
  } catch {
    /* fall through to legacy migration */
  }
  try {
    const legacy = JSON.parse(
      fs.readFileSync(path.join(LEGACY_CACHE_DIR, `${ticker.toUpperCase()}-${interval}.json`), "utf-8"),
    ) as IntradayPriceData;
    // Old TTL cache was always Yahoo; seed the store from it but mark it stale
    // so the next request refreshes.
    return { ...legacy, provider: "yahoo", backfilled: false, fetchedAt: new Date(0).toISOString() };
  } catch {
    return null;
  }
}

function writeStore(store: IntradayStore): void {
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(storeFile(store.ticker, store.interval), JSON.stringify(store));
  } catch {
    /* best-effort */
  }
}

function toBars(d: IntradayPriceData): Bar[] {
  const out: Bar[] = new Array(d.timestamps.length);
  for (let i = 0; i < d.timestamps.length; i++) {
    out[i] = { t: d.timestamps[i], o: d.opens[i], h: d.highs[i], l: d.lows[i], c: d.closes[i], v: d.volumes[i] ?? 0 };
  }
  return out;
}

function fromBars(ticker: string, interval: string, bars: Bar[]): IntradayPriceData {
  bars.sort((a, b) => a.t - b.t);
  return {
    ticker,
    interval,
    timestamps: bars.map((b) => b.t),
    opens: bars.map((b) => b.o),
    highs: bars.map((b) => b.h),
    lows: bars.map((b) => b.l),
    closes: bars.map((b) => b.c),
    volumes: bars.map((b) => b.v),
    fetchedAt: new Date().toISOString(),
  };
}

/** Merge new bars over old by timestamp (new wins — revised bars heal). */
function mergeBars(oldBars: Bar[], newBars: Bar[]): Bar[] {
  const m = new Map<number, Bar>();
  for (const b of oldBars) m.set(b.t, b);
  for (const b of newBars) m.set(b.t, b);
  return [...m.values()];
}

// ── FMP provider ────────────────────────────────────────────────────────────

/** Offset (seconds) of America/New_York from UTC at the given instant. */
function etOffsetSeconds(epochSec: number): number {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(epochSec * 1000))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return -5 * 3600;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
}

/** FMP intraday timestamps are ET wall-clock strings → epoch seconds UTC. */
function etToEpoch(dateStr: string): number {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return NaN;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) / 1000;
  // Two passes so DST-boundary bars land on the correct side.
  let epoch = asUtc - etOffsetSeconds(asUtc);
  epoch = asUtc - etOffsetSeconds(epoch);
  return epoch;
}

function ymd(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

async function fmpFetchWindow(
  symbol: string,
  fmpInterval: string,
  fromEpoch: number,
  toEpoch: number,
): Promise<Bar[]> {
  const url =
    `${FMP_BASE}/${fmpInterval}/${encodeURIComponent(symbol)}` +
    `?from=${ymd(fromEpoch)}&to=${ymd(toEpoch)}&apikey=${fmpKey()}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`FMP intraday request failed (${resp.status}) for ${symbol}`);
  const body: any = await resp.json();
  if (!Array.isArray(body)) {
    throw new Error(typeof body?.["Error Message"] === "string" ? `FMP: ${body["Error Message"]}` : `FMP: unexpected response for ${symbol}`);
  }
  const bars: Bar[] = [];
  for (const row of body) {
    const t = etToEpoch(String(row?.date ?? ""));
    const c = Number(row?.close);
    if (!Number.isFinite(t) || !Number.isFinite(c)) continue;
    bars.push({
      t,
      o: Number.isFinite(Number(row.open)) ? Number(row.open) : c,
      h: Number.isFinite(Number(row.high)) ? Number(row.high) : c,
      l: Number.isFinite(Number(row.low)) ? Number(row.low) : c,
      c,
      v: Number.isFinite(Number(row.volume)) ? Number(row.volume) : 0,
    });
  }
  return bars;
}

const FMP_WINDOW_DAYS = 60; // FMP caps rows per intraday request; keep windows small

/** Walk windows back from `now` until empty history or the backfill budget. */
async function fmpBackfill(symbol: string, fmpInterval: string): Promise<Bar[]> {
  const now = Math.floor(Date.now() / 1000);
  const floorEpoch = now - fmpBackfillDays() * 86400;
  let to = now;
  let emptyStreak = 0;
  const all: Bar[] = [];
  while (to > floorEpoch && emptyStreak < 2) {
    const from = Math.max(to - FMP_WINDOW_DAYS * 86400, floorEpoch);
    const bars = await fmpFetchWindow(symbol, fmpInterval, from, to);
    if (bars.length === 0) emptyStreak++;
    else {
      emptyStreak = 0;
      all.push(...bars);
    }
    to = from - 1;
  }
  return all;
}

// ── Yahoo provider ──────────────────────────────────────────────────────────

async function yahooFetch(sym: string, yahooInterval: string, maxDays: number): Promise<Bar[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - maxDays * 86400;
  const url =
    `${CHART_BASE}/${encodeURIComponent(toYahooSymbol(sym))}` +
    `?period1=${period1}&period2=${period2}` +
    `&interval=${yahooInterval}&includePrePost=false`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!resp.ok) throw new Error(`Yahoo intraday request failed (${resp.status}) for ${sym}`);
  const body: any = await resp.json();
  const result = body?.chart?.result?.[0];
  if (!result) {
    const desc = body?.chart?.error?.description;
    throw new Error(desc ? `Yahoo: ${desc}` : `No intraday data for ${sym}`);
  }
  const ts: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = quote.close?.[i];
    if (c == null || !Number.isFinite(c)) continue; // drop null bars (halts etc.)
    bars.push({
      t: ts[i],
      o: Number.isFinite(quote.open?.[i]) ? quote.open[i] : c,
      h: Number.isFinite(quote.high?.[i]) ? quote.high[i] : c,
      l: Number.isFinite(quote.low?.[i]) ? quote.low[i] : c,
      c,
      v: Number.isFinite(quote.volume?.[i]) ? quote.volume[i] : 0,
    });
  }
  return bars;
}

// ── Public API ──────────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<IntradayPriceData>>();

export async function fetchYahooIntraday(
  ticker: string,
  interval = "60m",
  days?: number,
): Promise<IntradayPriceData> {
  const sym = (ticker ?? "").toUpperCase();
  if (!sym) throw new Error("ticker is required");
  const spec = INTRADAY_INTERVALS[interval];
  if (!spec) throw new Error(`unsupported interval "${interval}" (use ${Object.keys(INTRADAY_INTERVALS).join("/")})`);

  const rangeDays = Math.min(Math.max(1, days ?? MAX_REQUEST_DAYS), MAX_REQUEST_DAYS);

  const key = `${sym}|${interval}`;
  const running = inflight.get(key);
  if (running) return running.then((d) => sliceToDays(d, rangeDays));

  const p = refreshStore(sym, interval).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p.then((d) => sliceToDays(d, rangeDays));
}

async function refreshStore(sym: string, interval: string): Promise<IntradayPriceData> {
  const spec = INTRADAY_INTERVALS[interval];
  const store = readStore(sym, interval);
  const now = Date.now();
  if (store && now - new Date(store.fetchedAt).getTime() < REFRESH_TTL_MS) return store;

  const wantProvider: "fmp" | "yahoo" = fmpKey() ? "fmp" : "yahoo";

  try {
    if (wantProvider === "fmp") {
      // Full backfill on first FMP use (or provider switch) — REPLACES the
      // store so one ticker never mixes Yahoo and FMP bar grids.
      if (!store || store.provider !== "fmp" || !store.backfilled) {
        const bars = await fmpBackfill(sym, spec.fmpInterval);
        if (bars.length > 0) {
          const next: IntradayStore = { ...fromBars(sym, interval, mergeBars([], bars)), provider: "fmp", backfilled: true };
          writeStore(next);
          return next;
        }
        // FMP has nothing for this symbol (plan/venue) → fall through to Yahoo.
        throw new Error(`FMP returned no ${interval} history for ${sym}`);
      }
      // Incremental tail refresh.
      const lastT = store.timestamps[store.timestamps.length - 1] ?? 0;
      const from = Math.max(lastT - TAIL_OVERLAP_DAYS * 86400, Math.floor(now / 1000) - FMP_WINDOW_DAYS * 86400);
      const tail = await fmpFetchWindow(sym, spec.fmpInterval, from, Math.floor(now / 1000));
      const next: IntradayStore = {
        ...fromBars(sym, interval, mergeBars(toBars(store), tail)),
        provider: "fmp",
        backfilled: true,
      };
      writeStore(next);
      return next;
    }
  } catch {
    /* fall through to Yahoo */
  }

  try {
    const bars = await yahooFetch(sym, spec.yahooInterval, spec.maxDays);
    const merged = store && store.provider === "yahoo" ? mergeBars(toBars(store), bars) : bars;
    const next: IntradayStore = { ...fromBars(sym, interval, merged), provider: "yahoo", backfilled: false };
    writeStore(next);
    return next;
  } catch (e) {
    if (store && store.timestamps.length) return store; // stale beats dead
    throw e;
  }
}

/** Trim a full-range series to the trailing `days` calendar days. */
function sliceToDays(data: IntradayPriceData, days: number): IntradayPriceData {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const { timestamps } = data;
  if (!timestamps.length || timestamps[0] >= cutoff) return data;
  let start = 0;
  while (start < timestamps.length && timestamps[start] < cutoff) start++;
  return {
    ...data,
    timestamps: timestamps.slice(start),
    opens: data.opens.slice(start),
    highs: data.highs.slice(start),
    lows: data.lows.slice(start),
    closes: data.closes.slice(start),
    volumes: data.volumes.slice(start),
  };
}
