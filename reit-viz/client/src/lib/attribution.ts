// Price-return attribution: decompose a total price move into the change in a
// valuation multiple vs the change in the underlying estimate, using the identity
//   Δln(P) = Δln(M) + Δln(E)   where P = M × E (price = multiple × estimate).
//
// Shared by the /attribution page (single-ticker charts + universe table) and the
// /ranking page (optional per-ticker attribution columns). The pure math and the
// basis-series loader live here so both consume one implementation.

import { fetchMetricSeries, type MetricSeriesPoint } from "./fetchMetricSeries";
import { computeBasketWeights } from "./basketWeights";

export type BasisFamily = "FFO" | "AFFO" | "EPS" | "EPRA" | "Default";
export type BasisPeriod = "FY0" | "FY1" | "FY2" | "LTM";
export type BasisMode = "auto" | BasisFamily;

export const BASIS_FAMILIES: BasisFamily[] = ["FFO", "AFFO", "EPS", "EPRA", "Default"];
export const BASIS_PERIODS: BasisPeriod[] = ["FY0", "FY1", "FY2", "LTM"];

export interface BasisDef {
  // Stored multiple series to try, in order. FY1 multiples are stored under
  // parenthesized names ("P/FFO (FY1)"); FY2/LTM are plain ("P/FFO FY2").
  multiples: string[];
  estimate: string;
  label: string;
}

export interface AlignedData {
  dates: string[];
  close: number[];
  multiple: number[];
  estimate: number[];
}

export interface AttributionRow {
  ticker: string;
  basis: string;
  totalPct: number;
  multiplePct: number;
  estimatePct: number;
  multipleShare: number;
  estimateShare: number;
  sameDirection: boolean;
}

// The workbook carries FY0/FY1/FY2/LTM estimate vintages (no FY3 exists in the
// source data). FFO/AFFO bases for REITs; EPS basis as the generic fallback;
// EPRA (consensus earnings per share) for European names; "Default" resolves
// each ticker's per-company default via the Universe-tab rules ("EPS (Default)"
// pseudo-metrics — fetchMetricSeries resolves them per ticker). An empty
// estimate name means that family×period combination has no source data and
// loadBasisAligned skips it. Missing stored multiples are derived close ÷
// estimate, which keeps the identity exact.
const MULTIPLE_NAMES: Record<BasisFamily, Record<BasisPeriod, string[]>> = {
  FFO:  { FY0: ["P/FFO (FY0)"],  FY1: ["P/FFO (FY1)", "P/FFO FY1"],   FY2: ["P/FFO FY2"],  LTM: ["P/FFO LTM"] },
  AFFO: { FY0: ["P/AFFO (FY0)"], FY1: ["P/AFFO (FY1)", "P/AFFO FY1"], FY2: ["P/AFFO FY2"], LTM: ["P/AFFO LTM"] },
  EPS:  { FY0: ["P/E (FY0)"],    FY1: ["P/E (FY1)", "P/E FY1"],       FY2: ["P/E FY2"],    LTM: ["P/E LTM"] },
  EPRA: { FY0: [], FY1: [], FY2: [], LTM: [] },
  Default: { FY0: [], FY1: [], FY2: [], LTM: [] },
};

const ESTIMATE_NAMES: Record<BasisFamily, Record<BasisPeriod, string>> = {
  FFO:  { FY0: "FFO FY0",  FY1: "FFO FY1",  FY2: "FFO FY2",  LTM: "FFO LTM" },
  AFFO: { FY0: "AFFO FY0", FY1: "AFFO FY1", FY2: "AFFO FY2", LTM: "AFFO LTM" },
  EPS:  { FY0: "EPS FY0",  FY1: "EPS FY1",  FY2: "EPS FY2",  LTM: "EPS LTM" },
  EPRA: {
    FY0: "EPRA Earnings per share (FY0)",
    FY1: "EPRA Earnings per share (consensus FY1)",
    FY2: "EPRA Earnings per share (consensus FY2)",
    LTM: "", // no LTM EPRA series in the workbook
  },
  Default: {
    FY0: "", // no FY0/LTM slots in the default-metric config
    FY1: "EPS FY1 (Default)",
    FY2: "EPS (Default)",
    LTM: "",
  },
};

const FAMILY_PREFIX: Record<BasisFamily, string> = {
  FFO: "P/FFO", AFFO: "P/AFFO", EPS: "P/E", EPRA: "P/EPRA", Default: "P/Default",
};

export function getBasisDef(family: BasisFamily, period: BasisPeriod): BasisDef {
  const estimate = ESTIMATE_NAMES[family][period];
  return {
    multiples: MULTIPLE_NAMES[family][period],
    estimate,
    label: estimate ? `${FAMILY_PREFIX[family]} × ${estimate}` : `${FAMILY_PREFIX[family]} ${period} (unavailable)`,
  };
}

export const WINDOW_OPTIONS = [
  { label: "1M", days: 21 }, { label: "3M", days: 63 }, { label: "6M", days: 126 },
  { label: "YTD", days: 0 }, { label: "1Y", days: 252 }, { label: "2Y", days: 504 },
  { label: "3Y", days: 756 }, { label: "5Y", days: 1260 },
];

// Inner-join close/multiple/estimate on their common dates, dropping non-finite
// or non-positive points (logs require > 0).
export function alignData(
  close: Array<{ time: string; value: number }>,
  multiple: Array<{ time: string; value: number }>,
  estimate: Array<{ time: string; value: number }>
): AlignedData {
  const multMap = new Map<string, number>();
  for (const p of multiple) if (Number.isFinite(p.value) && p.value > 0) multMap.set(p.time, p.value);
  const estMap = new Map<string, number>();
  for (const p of estimate) if (Number.isFinite(p.value) && p.value > 0) estMap.set(p.time, p.value);
  const dates: string[] = [], closes: number[] = [], mults: number[] = [], ests: number[] = [];
  for (const p of close) {
    if (!Number.isFinite(p.value) || p.value <= 0) continue;
    const m = multMap.get(p.time), e = estMap.get(p.time);
    if (m === undefined || e === undefined) continue;
    dates.push(p.time); closes.push(p.value); mults.push(m); ests.push(e);
  }
  return { dates, close: closes, multiple: mults, estimate: ests };
}

// Fetch + align close/multiple/estimate for one ticker under a basis family and
// estimate period. "auto" tries FFO first (REITs), then EPS (generic fallback).
// If no stored multiple series exists for the combination, the multiple is
// derived pointwise as close ÷ estimate, which makes the identity exact.
export async function loadBasisAligned(
  ticker: string,
  mode: BasisMode,
  period: BasisPeriod,
  opts?: { end?: string },
): Promise<{ basis: BasisFamily; aligned: AlignedData } | null> {
  const closeSeries = await fetchMetricSeries(ticker, "close", opts);
  if (!closeSeries.length) return null;
  // "auto": REIT FFO first, then EPRA (European names), then generic EPS.
  const families: BasisFamily[] = mode === "auto" ? ["FFO", "EPRA", "EPS"] : [mode];
  for (const family of families) {
    const def = getBasisDef(family, period);
    if (!def.estimate) continue; // combination has no source data
    const estSeries = await fetchMetricSeries(ticker, def.estimate, opts);
    if (!estSeries.length) continue;
    let multSeries: MetricSeriesPoint[] = [];
    for (const name of def.multiples) {
      multSeries = await fetchMetricSeries(ticker, name, opts);
      if (multSeries.length) break;
    }
    if (!multSeries.length) {
      const estMap = new Map(estSeries.map((p) => [p.time, p.value]));
      multSeries = [];
      for (const p of closeSeries) {
        const e = estMap.get(p.time);
        if (e !== undefined && e > 0 && Number.isFinite(p.value) && p.value > 0) {
          multSeries.push({ time: p.time, value: p.value / e });
        }
      }
    }
    if (!multSeries.length) continue;
    const aligned = alignData(closeSeries, multSeries, estSeries);
    if (aligned.dates.length >= 2) return { basis: family, aligned };
  }
  return null;
}

// ── Pair (A/B ratio) support ─────────────────────────────────────────────────
// For a ratio the identity survives componentwise: P_A/P_B = (M_A/M_B) ×
// (E_A/E_B), so the same log decomposition applies to the combined series.
// Legs may be plain tickers or baskets ("BASKET:<id>", ids kept verbatim —
// they can contain spaces/colons but never "/").

export function parseAttributionPair(symbol: string): { a: string; b: string } | null {
  const m = symbol.trim().match(/^(BASKET:[^/]+?|[A-Za-z0-9.\-]{1,12})\s*\/\s*(BASKET:[^/]+|[A-Za-z0-9.\-]{1,12})$/);
  if (!m) return null;
  const norm = (s: string) => (s.startsWith("BASKET:") ? s.trim() : s.toUpperCase());
  return { a: norm(m[1]), b: norm(m[2]) };
}

// ── Basket legs ──────────────────────────────────────────────────────────────
// A basket leg aggregates close AND estimate as per-date weighted averages of
// its constituents (same computeBasketWeights scheme as the price index;
// weights renormalize over the members present at each date; a date needs at
// least half the members-with-data). The basket multiple is DERIVED as
// close ÷ estimate, which keeps P = M × E exact for the aggregate — a
// weighted average of member multiples would not.

export interface AttributionBasketLike {
  id: string;
  name: string;
  tickers: string[];
  [key: string]: unknown;
}

async function weightedBasketSeries(
  basket: AttributionBasketLike,
  metric: string,
  weights: Record<string, number>,
): Promise<MetricSeriesPoint[]> {
  const legs = await Promise.all(
    basket.tickers.map((t) => fetchMetricSeries(t, metric).catch(() => [] as MetricSeriesPoint[])),
  );
  const withData = legs.filter((l) => l.length > 0).length;
  if (withData === 0) return [];
  const wOf = (t: string) => {
    const w = weights[t];
    return Number.isFinite(w) && w > 0 ? w : 1 / basket.tickers.length;
  };
  const minCount = Math.max(1, Math.ceil(withData / 2));
  const byDate = new Map<string, { v: number; w: number; n: number }>();
  basket.tickers.forEach((t, i) => {
    const w = wOf(t);
    for (const p of legs[i]) {
      if (!Number.isFinite(p.value)) continue;
      const e = byDate.get(p.time) ?? { v: 0, w: 0, n: 0 };
      e.v += w * p.value;
      e.w += w;
      e.n += 1;
      byDate.set(p.time, e);
    }
  });
  return [...byDate.entries()]
    .filter(([, e]) => e.n >= minCount && e.w > 0)
    .map(([time, e]) => ({ time, value: e.v / e.w }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function loadBasketBasisAligned(
  basket: AttributionBasketLike,
  mode: BasisMode,
  period: BasisPeriod,
): Promise<{ basis: BasisFamily; aligned: AlignedData } | null> {
  if (!basket.tickers?.length) return null;
  let weights: Record<string, number> = {};
  try {
    const needCloses = basket.weighting === "price" || basket.weighting === "inverse_vol";
    const closesByTicker: Record<string, MetricSeriesPoint[]> = {};
    if (needCloses) {
      const closes = await Promise.all(
        basket.tickers.map((t) => fetchMetricSeries(t, "close").catch(() => [] as MetricSeriesPoint[])),
      );
      basket.tickers.forEach((t, i) => { closesByTicker[t] = closes[i]; });
    }
    weights = (await computeBasketWeights({ ...basket }, closesByTicker, fetchMetricSeries)).weights;
  } catch { /* equal-weight fallback inside weightedBasketSeries */ }
  const closeSeries = await weightedBasketSeries(basket, "close", weights);
  if (!closeSeries.length) return null;
  const families: BasisFamily[] = mode === "auto" ? ["FFO", "EPRA", "EPS"] : [mode];
  for (const family of families) {
    const def = getBasisDef(family, period);
    if (!def.estimate) continue;
    const estSeries = await weightedBasketSeries(basket, def.estimate, weights);
    if (!estSeries.length) continue;
    const estMap = new Map(estSeries.map((p) => [p.time, p.value]));
    const multSeries: MetricSeriesPoint[] = [];
    for (const p of closeSeries) {
      const e = estMap.get(p.time);
      if (e !== undefined && e > 0 && Number.isFinite(p.value) && p.value > 0) {
        multSeries.push({ time: p.time, value: p.value / e });
      }
    }
    if (!multSeries.length) continue;
    const aligned = alignData(closeSeries, multSeries, estSeries);
    if (aligned.dates.length >= 2) return { basis: family, aligned };
  }
  return null;
}

export function combineAlignedRatio(a: AlignedData, b: AlignedData): AlignedData {
  const idx = new Map<string, number>();
  b.dates.forEach((d, i) => idx.set(d, i));
  const dates: string[] = [], close: number[] = [], multiple: number[] = [], estimate: number[] = [];
  a.dates.forEach((d, i) => {
    const j = idx.get(d);
    if (j === undefined) return;
    dates.push(d);
    close.push(a.close[i] / b.close[j]);
    multiple.push(a.multiple[i] / b.multiple[j]);
    estimate.push(a.estimate[i] / b.estimate[j]);
  });
  return { dates, close, multiple, estimate };
}

// Like loadBasisAligned but also accepts "A/B" pair symbols (each leg loaded
// under the same basis mode/period, inner-joined, divided) and basket legs
// ("BASKET:<id>" — resolved via `resolveBasket`, aggregated by the basket's
// weighting scheme). Under "auto" the legs may resolve different families
// (e.g. FFO vs EPS) — the identity still holds per leg, so the ratio
// decomposition stays exact.
export async function loadBasisAlignedAny(
  symbol: string,
  mode: BasisMode,
  period: BasisPeriod,
  opts?: { end?: string },
  resolveBasket?: (id: string) => AttributionBasketLike | undefined,
): Promise<{ basis: BasisFamily; aligned: AlignedData } | null> {
  const loadLeg = (leg: string) => {
    if (leg.startsWith("BASKET:")) {
      const basket = resolveBasket?.(leg.slice("BASKET:".length));
      return basket ? loadBasketBasisAligned(basket, mode, period) : Promise.resolve(null);
    }
    return loadBasisAligned(leg, mode, period, opts);
  };
  const pair = parseAttributionPair(symbol);
  if (!pair) return loadLeg(symbol.trim());
  const [ra, rb] = await Promise.all([loadLeg(pair.a), loadLeg(pair.b)]);
  if (!ra || !rb) return null;
  const aligned = combineAlignedRatio(ra.aligned, rb.aligned);
  if (aligned.dates.length < 2) return null;
  return { basis: ra.basis, aligned };
}

export interface CumPoint { date: string; total: number; mult: number; est: number }

/** Cumulative log-% decomposition anchored at `startIdx` (the /attribution
 *  page keeps a local copy of this — shared here for the Compare views). */
export function buildCumulativePath(data: AlignedData, startIdx: number): CumPoint[] {
  const result: CumPoint[] = [];
  const c0 = data.close[startIdx], m0 = data.multiple[startIdx], e0 = data.estimate[startIdx];
  if (!Number.isFinite(c0) || !Number.isFinite(m0) || !Number.isFinite(e0)) return result;
  for (let i = startIdx; i < data.dates.length; i++) {
    result.push({
      date: data.dates[i],
      total: Math.log(data.close[i] / c0) * 100,
      mult: Math.log(data.multiple[i] / m0) * 100,
      est: Math.log(data.estimate[i] / e0) * 100,
    });
  }
  return result;
}

export interface RollingPoint { date: string; total: number; mult: number; est: number }

// Trailing-`rollingDays` decomposition at every aligned date from `startIdx`
// forward: each point is the log return over the prior `rollingDays` trading
// days split into multiple vs estimate contributions (all in log-%, so
// total = mult + est exactly).
export function buildRollingPath(data: AlignedData, startIdx: number, rollingDays: number): RollingPoint[] {
  const result: RollingPoint[] = [];
  for (let i = Math.max(startIdx, rollingDays); i < data.dates.length; i++) {
    const j = i - rollingDays;
    if (j < 0 || data.close[j] <= 0 || data.multiple[j] <= 0 || data.estimate[j] <= 0) continue;
    result.push({
      date: data.dates[i],
      total: Math.log(data.close[i] / data.close[j]) * 100,
      mult: Math.log(data.multiple[i] / data.multiple[j]) * 100,
      est: Math.log(data.estimate[i] / data.estimate[j]) * 100,
    });
  }
  return result;
}

// Resolve the window-start index. windowDays === 0 means YTD (first date of the
// final year); otherwise it's `windowDays` trading days before the last point.
export function getStartIndex(dates: string[], windowDays: number): number {
  if (!dates.length) return 0;
  if (windowDays === 0) {
    const year = dates[dates.length - 1].slice(0, 4);
    for (let i = dates.length - 1; i >= 0; i--) if (dates[i].slice(0, 4) !== year) return i;
    return 0;
  }
  return Math.max(0, dates.length - 1 - windowDays);
}

// Decompose the [start, end] move for one ticker. `end` is the last aligned point,
// so trim the aligned series to an as-of date beforehand if you need a fixed end.
export function computeAttributionRow(ticker: string, basis: string, data: AlignedData, windowDays: number): AttributionRow | null {
  if (data.dates.length < 2) return null;
  const startIdx = getStartIndex(data.dates, windowDays);
  const endIdx = data.dates.length - 1;
  if (startIdx >= endIdx) return null;
  const c0 = data.close[startIdx], c1 = data.close[endIdx];
  const m0 = data.multiple[startIdx], m1 = data.multiple[endIdx];
  const e0 = data.estimate[startIdx], e1 = data.estimate[endIdx];
  if ([c0, c1, m0, m1, e0, e1].some(v => !Number.isFinite(v))) return null;
  const multPct = Math.log(m1 / m0) * 100;
  const estPct = Math.log(e1 / e0) * 100;
  const sumAbs = Math.abs(multPct) + Math.abs(estPct);
  const multipleShare = sumAbs > 0 ? Math.abs(multPct) / sumAbs : 0;
  const estimateShare = sumAbs > 0 ? Math.abs(estPct) / sumAbs : 0;
  return {
    ticker, basis,
    totalPct: (c1 / c0 - 1) * 100,
    multiplePct: multPct,
    estimatePct: estPct,
    multipleShare,
    estimateShare,
    sameDirection: Math.sign(multPct) === Math.sign(estPct) && multPct !== 0,
  };
}
