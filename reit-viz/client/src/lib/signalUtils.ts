// Signal-evaluation utilities used by EvaluatorPanel (all optimizer pages)
// and FactorBacktest.

import { getMetricSeries } from "@/lib/dataService";
import { fetchMacroSeries } from "@/lib/macroStatic";

export interface Horizon {
  label: string;
  days: number;
}

/** Standard forward-return horizons used across signal evaluation. */
export const HORIZONS: Horizon[] = [
  { label: "1W",  days: 5 },
  { label: "2W",  days: 10 },
  { label: "1M",  days: 21 },
  { label: "3M",  days: 63 },
  { label: "6M",  days: 126 },
  { label: "1Y",  days: 252 },
];

/**
 * Format a hit-rate fraction (0–1) as a percentage string.
 */
export function formatHitRate(hitRate: number | null | undefined): string {
  if (hitRate == null) return "—";
  return `${(hitRate * 100).toFixed(0)}%`;
}

/**
 * Return a Tailwind colour class reflecting whether the hit-rate is
 * above (green), near (neutral), or below (red) 50%.
 */
export function hitRateColorClass(hitRate: number | null | undefined): string {
  if (hitRate == null) return "text-muted-foreground";
  if (hitRate >= 0.6) return "text-green-500";
  if (hitRate <= 0.4) return "text-red-500";
  return "text-yellow-500";
}

export interface MetricSeriesResult {
  ticker: string;
  metricKey: string;
  dates: string[];
  values: (number | null)[];
}

/**
 * Fetch a single metric series for a ticker as parallel dates/values arrays.
 * (Distinct from `@/lib/fetchMetricSeries`, which returns {time,value}[] —
 * callers here destructure `.dates` / `.values`.)
 */
export async function fetchMetricSeries(
  ticker: string,
  metricKey: string,
  _options?: Record<string, any>
): Promise<MetricSeriesResult> {
  try {
    const pts = await getMetricSeries(ticker, metricKey);
    return {
      ticker,
      metricKey,
      dates: pts.map((p) => p.time),
      values: pts.map((p) => (Number.isFinite(p.value) ? p.value : null)),
    };
  } catch {
    return { ticker, metricKey, dates: [], values: [] };
  }
}

export interface MacroSeriesBatchResult {
  seriesKey: string;
  dates: string[];
  values: (number | null)[];
}

/**
 * Fetch multiple macro series in one call (delegates to the macro data layer,
 * which serves from static JSON or /api/macro/series depending on mode).
 */
export async function fetchMacroSeriesBatch(
  seriesKeys: string[],
  _options?: Record<string, any>
): Promise<MacroSeriesBatchResult[]> {
  try {
    const byId = await fetchMacroSeries(seriesKeys);
    return seriesKeys.map((key) => {
      const entry = byId[key];
      const data = entry?.data ?? [];
      return {
        seriesKey: key,
        dates: data.map((p) => p.time),
        values: data.map((p) => (Number.isFinite(p.value) ? p.value : null)),
      };
    });
  } catch {
    return seriesKeys.map((key) => ({ seriesKey: key, dates: [], values: [] }));
  }
}

export interface AggregatedProfile {
  avgReturn: Record<string, number>;
  stdReturn: Record<string, number>;
  medianReturn: Record<string, number>;
  winRate: Record<string, number>;
  avgTrough: Record<string, number>;
  hitRate?: Record<string, number>;
  n: number;
  [key: string]: any;
}

export interface SignalProfile {
  signalIdx?: number;
  returns: Record<string, number | null>;
  hitTarget: Record<string, boolean>;
  /** Worst adverse close-to-close excursion (%) within each horizon window. */
  trough?: Record<string, number | null>;
  hitBand?: Record<string, boolean>;
  hitRates?: Record<string, number | null>;
  hitRate?: number;
  baseHitRate?: number;
  n?: number;
  [key: string]: any;
}

/**
 * Build a forward-return profile for a single signal bar.
 *
 * Primary form (EvaluatorPanel): (prices, signalIdx, targetPct, side, stopPct?,
 * cooldown?, benchmarkPrices?). Returns per-horizon forward % returns
 * (benchmark-relative when benchmarkPrices is provided), whether the target
 * move was reached within the window, and the worst adverse excursion.
 *
 * Legacy form: (signalIndices, closes, horizons?) — averages the per-signal
 * horizon returns into one profile with per-horizon hit rates.
 */
export function buildSignalProfile(
  prices: number[],
  signalIdx: number,
  targetPct?: number | null,
  side?: string | null,
  stopPct?: number | null,
  cooldown?: number | null,
  benchmarkPrices?: number[] | null
): SignalProfile;
export function buildSignalProfile(
  signalIndices: number[],
  closes: number[],
  horizons?: Horizon[]
): SignalProfile;
export function buildSignalProfile(
  arg0: number[],
  arg1?: any,
  arg2?: any,
  arg3?: any,
  _arg4?: any,
  _arg5?: any,
  arg6?: any
): SignalProfile {
  // Legacy form: second arg is the closes array.
  if (Array.isArray(arg1)) {
    const signalIndices = arg0 as number[];
    const closes = arg1 as number[];
    const horizons: Horizon[] = Array.isArray(arg2) && arg2.length ? arg2 : HORIZONS;
    const returns: Record<string, number | null> = {};
    const hitRates: Record<string, number | null> = {};
    const hitTarget: Record<string, boolean> = {};
    for (const { label, days } of horizons) {
      const rets: number[] = [];
      for (const idx of signalIndices) {
        const entry = closes[idx];
        const exit = closes[idx + days];
        if (entry > 0 && exit > 0) rets.push((exit / entry - 1) * 100);
      }
      returns[label] = rets.length ? rets.reduce((s, v) => s + v, 0) / rets.length : null;
      hitRates[label] = rets.length ? rets.filter((v) => v > 0).length / rets.length : null;
      hitTarget[label] = (returns[label] ?? 0) > 0;
    }
    return { returns, hitTarget, hitRates, n: signalIndices.length };
  }

  const prices = arg0 as number[];
  const signalIdx = arg1 as number;
  const targetPct = typeof arg2 === "number" ? arg2 : null;
  const side = arg3 === "sell" ? "sell" : "buy";
  const benchmarkPrices = Array.isArray(arg6) ? (arg6 as number[]) : null;

  const returns: Record<string, number | null> = {};
  const hitTarget: Record<string, boolean> = {};
  const trough: Record<string, number | null> = {};
  const entry = prices[signalIdx];
  const benchEntry = benchmarkPrices?.[signalIdx];

  for (const { label, days } of HORIZONS) {
    const exitIdx = signalIdx + days;
    const exit = prices[exitIdx];
    if (!(entry > 0) || !(exit > 0)) {
      returns[label] = null;
      hitTarget[label] = false;
      trough[label] = null;
      continue;
    }
    let ret = (exit / entry - 1) * 100;
    if (benchEntry && benchEntry > 0) {
      const benchExit = benchmarkPrices![exitIdx];
      if (benchExit > 0) ret -= (benchExit / benchEntry - 1) * 100;
    }
    returns[label] = ret;

    // Path stats within the window (close-to-close)
    let maxUp = -Infinity;
    let maxDown = Infinity;
    for (let i = signalIdx + 1; i <= exitIdx && i < prices.length; i++) {
      const p = prices[i];
      if (!(p > 0)) continue;
      const r = (p / entry - 1) * 100;
      if (r > maxUp) maxUp = r;
      if (r < maxDown) maxDown = r;
    }
    const favorableExtreme = side === "buy" ? maxUp : -maxDown;
    // targetPct is a FRACTION (0.05 = 5%) like forwardReturns' targetPct;
    // favorableExtreme is percent-scale, so convert before comparing.
    hitTarget[label] =
      targetPct != null && targetPct > 0
        ? Number.isFinite(favorableExtreme) && favorableExtreme >= targetPct * 100
        : (side === "buy" ? ret > 0 : ret < 0);
    const adverse = side === "buy" ? maxDown : -maxUp;
    trough[label] = Number.isFinite(adverse) ? Math.min(0, adverse) : null;
  }

  return { signalIdx, returns, hitTarget, trough, n: 1 };
}

/**
 * Aggregate multiple signal profiles into per-horizon summary stats.
 */
export function aggregateSignalProfiles(
  profiles: SignalProfile[],
  side?: string
): AggregatedProfile {
  const s = side === "sell" ? "sell" : "buy";
  const avgReturn: Record<string, number> = {};
  const stdReturn: Record<string, number> = {};
  const medianReturn: Record<string, number> = {};
  const winRate: Record<string, number> = {};
  const avgTrough: Record<string, number> = {};
  const hitRate: Record<string, number> = {};

  for (const { label } of HORIZONS) {
    const rets = profiles
      .map((p) => p.returns?.[label])
      .filter((v): v is number => v != null && Number.isFinite(v));
    const n = rets.length;
    if (n === 0) {
      avgReturn[label] = 0; stdReturn[label] = 0; medianReturn[label] = 0;
      winRate[label] = 0; avgTrough[label] = 0; hitRate[label] = 0;
      continue;
    }
    const mean = rets.reduce((a, b) => a + b, 0) / n;
    avgReturn[label] = mean;
    stdReturn[label] = n > 1
      ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
      : 0;
    const sorted = [...rets].sort((a, b) => a - b);
    const mid = n >> 1;
    medianReturn[label] = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    winRate[label] = rets.filter((v) => (s === "buy" ? v > 0 : v < 0)).length / n;
    hitRate[label] =
      profiles.filter((p) => p.returns?.[label] != null && p.hitTarget?.[label]).length / n;
    const troughs = profiles
      .map((p) => p.trough?.[label])
      .filter((v): v is number => v != null && Number.isFinite(v));
    avgTrough[label] = troughs.length
      ? troughs.reduce((a, b) => a + b, 0) / troughs.length
      : 0;
  }

  return { avgReturn, stdReturn, medianReturn, winRate, avgTrough, hitRate, n: profiles.length };
}
