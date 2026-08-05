// Short-interest verdict backtest: condition forward price returns on the
// CURRENT short-interest state — where SI sits in its own trailing history
// (percentile) crossed with its recent trend — and report per-state forward
// stats plus a LONG / SHORT / no-edge verdict for today's state.
//
// Walk-forward by construction: percentiles come from asOfPercentileSeries
// (trailing basis, only data up to each bar), the trend uses only trailing
// bars, and the state rules are fixed ex-ante.

import { asOfPercentileSeries } from "./percentileResidence";
import { summarizeForwardStats, pearsonCorr, type AttrStateStats } from "./attributionBacktest";

export type SIState = "high-rising" | "high-falling" | "low-rising" | "low-falling" | "mid";

export const SI_STATES: SIState[] = ["high-rising", "high-falling", "low-rising", "low-falling", "mid"];

export const SI_STATE_LABELS: Record<SIState, { label: string; thesis: string }> = {
  "high-rising":  { label: "High & rising",  thesis: "crowded and getting shorter — bearish-pressure thesis" },
  "high-falling": { label: "High & falling", thesis: "covering from a crowded short — squeeze-fuel thesis (long)" },
  "low-rising":   { label: "Low & rising",   thesis: "fresh shorts building from a clean base — early-bear thesis" },
  "low-falling":  { label: "Low & falling",  thesis: "shorts abandoning an unshorted name — no prior; data decides" },
  "mid":          { label: "Mid / flat",     thesis: "no percentile extreme, or flat trend at one — baseline" },
};

export interface SIBtParams {
  /** Percentile window over the ticker's own SI history, in bars. */
  pctileWindow: number;
  /** Percentile thresholds for "high" / "low". */
  hiPctile: number;
  loPctile: number;
  /** Trend = SI now − SI trendLookback bars ago. */
  trendLookback: number;
  /** |trend| ≤ deadband (pp) counts as flat → mid unless percentile is extreme. */
  deadband: number;
  horizons: number[];
  stepDays: number;
  minN: number;
  primaryHorizon: number;
  /**
   * Minimum joined bar count / sampling warm-up, in BARS. The historical
   * defaults (120 / 60) are daily-calibrated — on monthly bars they demand
   * 10 / 5 YEARS of signal history, which nulls the whole backtest, so the
   * monthly presets must pass smaller floors.
   */
  minBars?: number;
  warmupBars?: number;
}

export const DEFAULT_SI_BT: SIBtParams = {
  pctileWindow: 756, hiPctile: 70, loPctile: 30, trendLookback: 21, deadband: 0.1,
  horizons: [21, 63, 126], stepDays: 5, minN: 8, primaryHorizon: 63,
};

export function classifySIState(pctile: number, trend: number, p: SIBtParams): SIState {
  const high = pctile >= p.hiPctile, low = pctile <= p.loPctile;
  if (!high && !low) return "mid";
  const rising = trend > p.deadband, falling = trend < -p.deadband;
  if (high) return rising ? "high-rising" : falling ? "high-falling" : "mid";
  return rising ? "low-rising" : falling ? "low-falling" : "mid";
}

interface TV { time: string; value: number }

export interface SIBtSample {
  date: string;
  state: SIState;
  si: number;
  pctile: number;
  trend: number;
  fwd: Record<number, number | null>;
}

export interface SIBacktestResult {
  params: SIBtParams;
  sampled: number;
  counts: Record<SIState, number>;
  states: Record<SIState, Record<number, AttrStateStats | null>>;
  baseline: Record<number, AttrStateStats | null>;
  /** Pearson corr of the trailing ΔSI vs the forward return, per horizon —
   *  "does rising short interest actually precede weakness here?" */
  deltaFollowCorr: Record<number, { r: number; n: number } | null>;
  today: { si: number; pctile: number; trend: number; state: SIState } | null;
  verdict: { side: "LONG" | "SHORT" | "NONE"; stats: AttrStateStats | null };
  samples: SIBtSample[];
}

export function runSIVerdictBacktest(si: TV[], close: TV[], params: SIBtParams): SIBacktestResult | null {
  const { pctileWindow, trendLookback, horizons, stepDays, minN, primaryHorizon, minBars, warmupBars } = params;
  if (!horizons.length || trendLookback < 1) return null;

  // Inner-join on dates (both live on the same daily axis; SI is step-held).
  const closeMap = new Map(close.filter(p => Number.isFinite(p.value) && p.value > 0).map(p => [p.time, p.value]));
  const dates: string[] = [], siVals: number[] = [], closes: number[] = [];
  for (const p of si) {
    if (!Number.isFinite(p.value)) continue;
    const c = closeMap.get(p.time);
    if (c === undefined) continue;
    dates.push(p.time); siVals.push(p.value); closes.push(c);
  }
  const n = dates.length;
  if (n < Math.max(minBars ?? 120, trendLookback + Math.min(...horizons) + minN)) return null;

  const pctiles = asOfPercentileSeries(siVals, "trailing", pctileWindow);

  const samples: SIBtSample[] = [];
  // Start once the trend lookback and a minimal percentile history exist.
  const start = Math.max(trendLookback, warmupBars ?? 60);
  for (let i = start; i < n; i += Math.max(1, stepDays)) {
    const pctile = pctiles[i];
    if (!Number.isFinite(pctile)) continue;
    const trend = siVals[i] - siVals[i - trendLookback];
    const fwd: Record<number, number | null> = {};
    for (const h of horizons) fwd[h] = i + h < n ? Math.log(closes[i + h] / closes[i]) * 100 : null;
    samples.push({ date: dates[i], state: classifySIState(pctile, trend, params), si: siVals[i], pctile, trend, fwd });
  }
  if (!samples.length) return null;

  const counts = Object.fromEntries(SI_STATES.map(s => [s, 0])) as Record<SIState, number>;
  for (const s of samples) counts[s.state]++;

  const states = {} as Record<SIState, Record<number, AttrStateStats | null>>;
  for (const st of SI_STATES) {
    states[st] = {};
    for (const h of horizons) {
      states[st][h] = summarizeForwardStats(
        samples.filter(s => s.state === st).map(s => s.fwd[h]).filter((v): v is number => v != null),
        minN,
      );
    }
  }
  const baseline: Record<number, AttrStateStats | null> = {};
  const deltaFollowCorr: Record<number, { r: number; n: number } | null> = {};
  for (const h of horizons) {
    const pairs = samples.filter(s => s.fwd[h] != null);
    baseline[h] = summarizeForwardStats(pairs.map(s => s.fwd[h] as number), minN);
    const r = pearsonCorr(pairs.map(s => s.trend), pairs.map(s => s.fwd[h] as number));
    deltaFollowCorr[h] = r == null ? null : { r, n: pairs.length };
  }

  // Today's state from the LAST bar (not the last sample).
  const lastPct = pctiles[n - 1];
  const today = Number.isFinite(lastPct)
    ? {
        si: siVals[n - 1],
        pctile: lastPct,
        trend: siVals[n - 1] - siVals[n - 1 - trendLookback],
        state: classifySIState(lastPct, siVals[n - 1] - siVals[n - 1 - trendLookback], params),
      }
    : null;
  const vh = horizons.includes(primaryHorizon) ? primaryHorizon : horizons[0];
  const vs = today ? states[today.state][vh] : null;
  let side: "LONG" | "SHORT" | "NONE" = "NONE";
  if (vs && vs.n >= minN) {
    if (vs.median > 0 && vs.hitRate >= 55) side = "LONG";
    else if (vs.median < 0 && vs.hitRate <= 45) side = "SHORT";
  }

  return { params, sampled: samples.length, counts, states, baseline, deltaFollowCorr, today, verdict: { side, stats: vs }, samples };
}
