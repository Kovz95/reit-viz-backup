// Multi-Timeframe Setups — data bundle + alignment maps.
//
// Builds hourly (Yahoo 60m, ≤729 days, raw closes) / daily (adjusted) /
// weekly (Friday-ending) / monthly (calendar-month, both derived from daily)
// series for one ticker, plus the completed-bar alignment maps the MTF engine
// projects conditions through.
//
// THE correctness rule: a higher-timeframe condition evaluated on a lower-
// timeframe bar may use only COMPLETED higher-TF bars. Today's daily RSI is
// unknowable intra-day and this week's bar is unknowable mid-week — the
// chart-overlay helper fillDailyOntoHourlyAxis uses `<=` (same-day inclusion)
// which is fine for display but LOOKAHEAD for backtests, so these maps use
// strict `<` (hourly→daily/weekly) and exclude trailing partial weekly bars.
//
// UTC-day nuance: hourly bar times are epoch-seconds UTC. A 16:00-ET US close
// is 20/21:00 UTC (same calendar date) and LSE sessions (08:00–16:30 London)
// are also same-UTC-date, so "daily date < hourly bar's UTC date" means "the
// prior completed session" for both venues.

import { fetchIntradayBars, type IntradayBar } from "@/lib/fetchIntradayBars";
import { boundedSet } from "@/lib/boundedCache";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { dateOfTimestamp } from "@/lib/chartFrequency";
import type { DataPoint, OhlcBar } from "@/lib/indicators";

export type Timeframe = "H" | "D" | "W" | "M";

export interface TfSeries {
  tf: Timeframe;
  /** Bar keys: H = stringified epoch-seconds; D/W = "YYYY-MM-DD". */
  keys: string[];
  /** Close series for DataPoint-based indicators (time === keys[i]). */
  points: DataPoint[];
  /** OHLC bars for bar-based indicators (time === keys[i]). */
  bars: OhlcBar[];
  closes: number[];
}

export interface MtfBundle {
  ticker: string;
  /** null when the symbol has no usable 60m data (page falls back to Daily). */
  hourly: TfSeries | null;
  daily: TfSeries;
  weekly: TfSeries;
  monthly: TfSeries;
  /** Per weekly bar, its end (last daily) date. */
  weeklyEndDates: string[];
  /** Per weekly bar, the daily index of its end bar. */
  weeklyDailyIndexMap: number[];
  /** Does the final weekly bar end on a Friday (i.e. is it complete)? */
  lastWeeklyComplete: boolean;
  /** Per monthly bar, its end (last daily) date. */
  monthlyEndDates: string[];
  /** Per monthly bar, the daily index of its end bar. */
  monthlyDailyIndexMap: number[];
  /** Does the final monthly bar end the calendar month (i.e. is it complete)? */
  lastMonthlyComplete: boolean;
  /** UTC calendar date per hourly bar. */
  hourlyDates: string[];
  /** Last COMPLETED daily idx per hourly bar (-1 = none yet). */
  hourlyToDaily: Int32Array;
  /** Last COMPLETED weekly idx per hourly bar (-1 = none yet). */
  hourlyToWeekly: Int32Array;
  /** Last COMPLETED monthly idx per hourly bar (-1 = none yet). */
  hourlyToMonthly: Int32Array;
  /** Last USABLE weekly idx per daily bar (-1 = none yet). */
  dailyToWeekly: Int32Array;
  /** Last USABLE monthly idx per daily bar (-1 = none yet). */
  dailyToMonthly: Int32Array;
}

const MIN_HOURLY_BARS = 250; // below this, hourly analysis is meaningless
// Ask the server for up to 10y of hourly bars. Yahoo alone caps at ~729d, but
// the server's permanent intraday store accumulates history past that (and
// serves FMP depth when an FMP_API_KEY is configured), so request the max and
// let the server return what it has.
const MAX_HOURLY_DAYS = 3650;

function mkTf(tf: Timeframe, keys: string[], opens: number[], highs: number[], lows: number[], closes: number[]): TfSeries {
  const points: DataPoint[] = new Array(keys.length);
  const bars: OhlcBar[] = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    points[i] = { time: keys[i], value: closes[i] };
    bars[i] = { time: keys[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] };
  }
  return { tf, keys, points, bars, closes };
}

/** Daily source arrays a bundle is assembled from (single ticker or ratio). */
export interface DailySeriesInput {
  dates: string[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  adjCloses: number[];
  volumes?: number[];
}

// Any-symbol daily loader: workbook first, /api/yahoo-prices fallback so the
// scanner accepts arbitrary Yahoo symbols (SPY, XLRE, ^TNX, …) typed into the
// pickers. Yahoo results are promise-cached so pair combos sharing a leg
// don't refetch it.
const YAHOO_DAILY_CACHE_CAP = 150; // full-history series; eviction = refetch later
const yahooDailyCache = new Map<string, Promise<DailySeriesInput | null>>();

export async function fetchDailyAnySymbol(ticker: string): Promise<DailySeriesInput | null> {
  const wb = await fetchTickerOHLCV(ticker).catch(() => null);
  if (wb && wb.dates.length) return wb;
  const key = ticker.toUpperCase();
  let p = yahooDailyCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`/api/yahoo-prices/${encodeURIComponent(key)}`);
        if (!res.ok) return null;
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("json")) return null; // SPA fallback HTML
        const d = await res.json();
        if (!Array.isArray(d?.dates) || !d.dates.length || !Array.isArray(d?.closes)) return null;
        return {
          dates: d.dates,
          opens: Array.isArray(d.opens) ? d.opens : d.closes,
          highs: Array.isArray(d.highs) ? d.highs : d.closes,
          lows: Array.isArray(d.lows) ? d.lows : d.closes,
          closes: d.closes,
          adjCloses:
            Array.isArray(d.adjCloses) && d.adjCloses.length === d.dates.length ? d.adjCloses : d.closes,
          volumes: Array.isArray(d.volumes) ? d.volumes : [],
        } as DailySeriesInput;
      } catch {
        return null;
      }
    })();
    boundedSet(yahooDailyCache, key, p, YAHOO_DAILY_CACHE_CAP);
  }
  return p;
}

export async function buildMtfBundle(ticker: string): Promise<MtfBundle> {
  const [daily0, hourlyBars] = await Promise.all([
    fetchDailyAnySymbol(ticker),
    fetchIntradayBars(ticker, "60m", MAX_HOURLY_DAYS).catch(() => [] as IntradayBar[]),
  ]);
  if (!daily0 || !daily0.dates.length) throw new Error(`No daily data for ${ticker} (workbook or Yahoo)`);
  return assembleBundle(ticker.toUpperCase(), daily0, hourlyBars);
}

/**
 * A/B ratio bundle for pair scanning. Closes are adjusted-close ratios;
 * opens are open ratios; per-bar high/low are APPROXIMATIONS (the true
 * intrabar ratio extremes are unknowable from two OHLC series) taken as the
 * envelope of open/close/high-ratio/low-ratio — only the stochastic-style
 * conditions read them, where a small level offset is immaterial.
 */
export async function buildPairMtfBundle(a: string, b: string): Promise<MtfBundle> {
  const [dA, dB, hA, hB] = await Promise.all([
    fetchDailyAnySymbol(a),
    fetchDailyAnySymbol(b),
    fetchIntradayBars(a, "60m", MAX_HOURLY_DAYS).catch(() => [] as IntradayBar[]),
    fetchIntradayBars(b, "60m", MAX_HOURLY_DAYS).catch(() => [] as IntradayBar[]),
  ]);
  const label = `${a.toUpperCase()}/${b.toUpperCase()}`;
  if (!dA || !dA.dates.length) throw new Error(`No daily data for ${a}`);
  if (!dB || !dB.dates.length) throw new Error(`No daily data for ${b}`);

  const adjA = dA.adjCloses.length === dA.dates.length ? dA.adjCloses : dA.closes;
  const adjB = dB.adjCloses.length === dB.dates.length ? dB.adjCloses : dB.closes;
  const idxB = new Map(dB.dates.map((d, i) => [d, i]));

  const daily: DailySeriesInput = { dates: [], opens: [], highs: [], lows: [], closes: [], adjCloses: [], volumes: [] };
  for (let i = 0; i < dA.dates.length; i++) {
    const j = idxB.get(dA.dates[i]);
    if (j === undefined) continue;
    const r = ratioOhlc(
      dA.opens[i], dA.highs[i], dA.lows[i], adjA[i],
      dB.opens[j], dB.highs[j], dB.lows[j], adjB[j],
    );
    if (!r) continue;
    daily.dates.push(dA.dates[i]);
    daily.opens.push(r.o);
    daily.highs.push(r.h);
    daily.lows.push(r.l);
    daily.closes.push(r.c);
    daily.adjCloses.push(r.c);
    daily.volumes!.push(0);
  }
  if (daily.dates.length < 60) throw new Error(`Insufficient overlapping daily history for ${label}`);

  const barB = new Map(hB.map((bar) => [bar.time, bar]));
  const hourly: IntradayBar[] = [];
  for (const bar of hA) {
    const o = barB.get(bar.time);
    if (!o) continue;
    const r = ratioOhlc(bar.open, bar.high, bar.low, bar.close, o.open, o.high, o.low, o.close);
    if (!r) continue;
    hourly.push({ time: bar.time, open: r.o, high: r.h, low: r.l, close: r.c, volume: 0 });
  }

  return assembleBundle(label, daily, hourly);
}

/** True when no Mon–Fri calendar day of the bar's month remains after it —
 *  the monthly analog of the "last bar is a Friday" completed-week check
 *  (shares its holiday blind spot: a month ending on a weekday holiday is
 *  treated as still forming). */
export function isMonthComplete(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) return false;
  for (let nxt = new Date(d.getTime() + 86400000); nxt.getUTCMonth() === d.getUTCMonth(); nxt = new Date(nxt.getTime() + 86400000)) {
    const dow = nxt.getUTCDay();
    if (dow !== 0 && dow !== 6) return false;
  }
  return true;
}

/** Field-wise ratio bar; null when any input is non-positive/non-finite. */
export function ratioOhlc(
  ao: number, ah: number, al: number, ac: number,
  bo: number, bh: number, bl: number, bc: number,
): { o: number; h: number; l: number; c: number } | null {
  if (!(ao > 0) || !(ah > 0) || !(al > 0) || !(ac > 0)) return null;
  if (!(bo > 0) || !(bh > 0) || !(bl > 0) || !(bc > 0)) return null;
  const o = ao / bo;
  const c = ac / bc;
  const h = Math.max(o, c, ah / bh);
  const l = Math.min(o, c, al / bl);
  return { o, h, l, c };
}

function assembleBundle(label: string, daily0: DailySeriesInput, hourlyBars: IntradayBar[]): MtfBundle {
  // Daily on adjusted closes (highs/lows stay unadjusted — they only feed the
  // stochastic, where a small level offset is immaterial for OB/OS states).
  const dCloses = daily0.adjCloses.length === daily0.dates.length ? daily0.adjCloses : daily0.closes;
  const daily = mkTf("D", daily0.dates, daily0.opens, daily0.highs, daily0.lows, dCloses);

  // Weekly derived from the adjusted daily arrays (Friday-ending).
  const w = weeklyDownsample({
    dates: daily0.dates,
    closes: dCloses,
    adjCloses: dCloses,
    highs: daily0.highs,
    lows: daily0.lows,
    opens: daily0.opens,
    volumes: daily0.volumes ?? [],
  });
  const weekly = mkTf("W", w.dates, w.opens, w.highs, w.lows, w.closes);
  const weeklyEndDates = w.dates;
  const weeklyDailyIndexMap = w.dailyIndexMap;
  const lastEnd = weeklyEndDates[weeklyEndDates.length - 1];
  // getUTCDay: 5 = Friday. weeklyDownsample flushes a trailing partial week,
  // so a non-Friday final bar means "this week, still forming".
  const lastWeeklyComplete = !!lastEnd && new Date(lastEnd + "T00:00:00Z").getUTCDay() === 5;

  // Monthly derived the same way (calendar-month buckets).
  const m = weeklyDownsample({
    dates: daily0.dates,
    closes: dCloses,
    adjCloses: dCloses,
    highs: daily0.highs,
    lows: daily0.lows,
    opens: daily0.opens,
    volumes: daily0.volumes ?? [],
  }, "monthly");
  const monthly = mkTf("M", m.dates, m.opens, m.highs, m.lows, m.closes);
  const monthlyEndDates = m.dates;
  const monthlyDailyIndexMap = m.dailyIndexMap;
  const lastMonthlyComplete = isMonthComplete(monthlyEndDates[monthlyEndDates.length - 1] ?? "");

  // Hourly (may be unavailable/thin — Yahoo 60m, raw closes).
  let hourly: TfSeries | null = null;
  let hourlyDates: string[] = [];
  if (hourlyBars.length >= MIN_HOURLY_BARS) {
    const keys = hourlyBars.map((b) => String(b.time));
    hourly = mkTf(
      "H",
      keys,
      hourlyBars.map((b) => b.open),
      hourlyBars.map((b) => b.high),
      hourlyBars.map((b) => b.low),
      hourlyBars.map((b) => b.close),
    );
    hourlyDates = hourlyBars.map((b) => dateOfTimestamp(b.time));
  }

  // ── Alignment maps (completed bars only) ──
  const usableWeeklyLast = lastWeeklyComplete ? weeklyEndDates.length - 1 : weeklyEndDates.length - 2;
  const usableMonthlyLast = lastMonthlyComplete ? monthlyEndDates.length - 1 : monthlyEndDates.length - 2;

  const hourlyToDaily = new Int32Array(hourlyDates.length);
  const hourlyToWeekly = new Int32Array(hourlyDates.length);
  const hourlyToMonthly = new Int32Array(hourlyDates.length);
  {
    let di = -1;
    let wi = -1;
    let mi = -1;
    for (let h = 0; h < hourlyDates.length; h++) {
      const day = hourlyDates[h];
      while (di + 1 < daily.keys.length && daily.keys[di + 1] < day) di++;
      while (wi + 1 <= usableWeeklyLast && weeklyEndDates[wi + 1] < day) wi++;
      while (mi + 1 <= usableMonthlyLast && monthlyEndDates[mi + 1] < day) mi++;
      hourlyToDaily[h] = di;
      hourlyToWeekly[h] = wi;
      hourlyToMonthly[h] = mi;
    }
  }

  // Daily→weekly/monthly: a higher-TF bar becomes usable AT its own end-day
  // close (the period close IS that day's daily close — matches
  // expandWeeklyToDaily), but a trailing partial period is never usable.
  const dailyToWeekly = new Int32Array(daily.keys.length);
  const dailyToMonthly = new Int32Array(daily.keys.length);
  {
    let wi = -1;
    let mi = -1;
    for (let i = 0; i < daily.keys.length; i++) {
      while (wi + 1 <= usableWeeklyLast && weeklyDailyIndexMap[wi + 1] <= i) wi++;
      while (mi + 1 <= usableMonthlyLast && monthlyDailyIndexMap[mi + 1] <= i) mi++;
      dailyToWeekly[i] = wi;
      dailyToMonthly[i] = mi;
    }
  }

  if (import.meta.env.DEV) {
    // Invariants: maps are non-decreasing; hourly→daily changes only when the
    // bar's UTC date changes (state can flip only at day boundaries).
    for (let h = 1; h < hourlyDates.length; h++) {
      if (hourlyToDaily[h] < hourlyToDaily[h - 1] || hourlyToWeekly[h] < hourlyToWeekly[h - 1]) {
        console.error("[mtfData] alignment map decreased at hourly bar", h);
        break;
      }
      if (hourlyToDaily[h] !== hourlyToDaily[h - 1] && hourlyDates[h] === hourlyDates[h - 1]) {
        console.error("[mtfData] hourlyToDaily changed mid-day at bar", h);
        break;
      }
    }
  }

  return {
    ticker: label,
    hourly,
    daily,
    weekly,
    monthly,
    weeklyEndDates,
    weeklyDailyIndexMap,
    lastWeeklyComplete,
    monthlyEndDates,
    monthlyDailyIndexMap,
    lastMonthlyComplete,
    hourlyDates,
    hourlyToDaily,
    hourlyToWeekly,
    hourlyToMonthly,
    dailyToWeekly,
    dailyToMonthly,
  };
}
