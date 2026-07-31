// MA slope inflection engine — detects turns in the slope of a moving average.
//
// Pure and frequency-agnostic: operates on bar arrays of any timeframe; the
// caller supplies closes (and highs/lows for FRAMA/T3) from maSlopeData.
//
// Slope is normalized to bps-per-bar (Δma / (L · ma) · 10000) so thresholds are
// comparable across price levels, MA types, and tickers. Detection is a
// Schmitt trigger, not a bare sign flip: the trend state only changes when the
// slope moves beyond ±θ, where θ = thresholdK × MAD of the trailing slope
// distribution (adaptive per series). Inside the dead zone (−θ, +θ) the state
// holds — this is where twitchy signals die. thresholdK = 0 degrades to the
// plain prevSlope≤0 && curSlope>0 flip of rocSignalDetect (regression check).
//
// No lookahead anywhere: θ uses trailing bars only, and a confirmBars > 1
// event is stamped at the confirmation bar — the bar you could have acted on.

import { computeMaByType, type MaType, type MaOptions } from "@/lib/maEngine";

export type SlopeMeasure = "diff" | "regress";
export type SlopeFreq = "hourly" | "daily" | "weekly";

export interface MaSlopeParams {
  maType: MaType;
  period: number;
  /** L — bars the slope difference/regression spans. */
  slopeLookback: number;
  /** "diff" = (ma[i]−ma[i−L])/L (default; the MA is already the smoother);
   *  "regress" = OLS slope of the MA over max(5, L) bars (steadier for short
   *  periods on hourly bars, at the cost of a little extra lag). */
  measure: SlopeMeasure;
  /** Hysteresis width in slope-MAD units. 0 = raw sign flip. */
  thresholdK: number;
  /** Consecutive bars the slope must hold beyond ±θ before an event fires. */
  confirmBars: number;
  /** Refractory: suppress a same-direction event within this many bars. */
  minBarsBetween: number;
  detectCurvature: boolean;
}

export interface InflectionEvent {
  idx: number;
  direction: "up" | "down";
  /** "slope" = the MA's slope changed sign (trend turn);
   *  "curvature" = the slope's slope flipped (early accel/decel warning). */
  kind: "slope" | "curvature";
  /** Normalized slope at the event bar, bps/bar. */
  slope: number;
  maValue: number;
}

export interface MaSlopeSeries {
  ma: (number | null)[];
  /** Normalized slope, bps/bar; null through MA warmup + L bars. */
  slope: (number | null)[];
  curvature: (number | null)[];
  events: InflectionEvent[];
  /** First index with a valid slope value (-1 if none). */
  warmupIdx: number;
}

export function defaultMaSlopeParams(maType: MaType = "EMA", period = 50): MaSlopeParams {
  return {
    maType,
    period,
    slopeLookback: 3,
    measure: "diff",
    thresholdK: 0.3,
    confirmBars: 1,
    minBarsBetween: 5,
    detectCurvature: true,
  };
}

export function configKey(p: MaSlopeParams, freq: SlopeFreq): string {
  return `${p.maType}${p.period}·${freq}·L${p.slopeLookback}·k${p.thresholdK}·c${p.confirmBars}·g${p.minBarsBetween}·${p.measure}`;
}

export function configLabel(p: MaSlopeParams): string {
  return `${p.maType} ${p.period}`;
}

// θ recompute cadence: a per-bar trailing MAD would be O(n·window·log) per
// config, which the 216-config deep-dive sweep can't afford. The slope's noise
// scale drifts slowly, so recomputing every 16 bars over the last 250 is
// indistinguishable in practice and ~16× cheaper. Still strictly trailing.
const MAD_WINDOW = 250;
const MAD_MIN = 60;
const MAD_STEP = 16;

/** Median of arr (mutates arr by sorting). */
function medianInPlace(arr: number[]): number {
  arr.sort((a, b) => a - b);
  const n = arr.length;
  const mid = n >> 1;
  return n % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

/** MAD of the finite values in series[from..to). NaN if fewer than MAD_MIN. */
function trailingMad(series: (number | null)[], from: number, to: number): number {
  const vals: number[] = [];
  for (let i = Math.max(0, from); i < to; i++) {
    const v = series[i];
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < MAD_MIN) return NaN;
  const med = medianInPlace(vals);
  for (let i = 0; i < vals.length; i++) vals[i] = Math.abs(vals[i] - med);
  return medianInPlace(vals);
}

/** Detect state transitions of a Schmitt trigger over `series` with adaptive
 *  MAD-scaled threshold. Shared by slope and curvature detection. */
function detectFlips(
  series: (number | null)[],
  thresholdK: number,
  confirmBars: number,
  minBarsBetween: number,
  emit: (idx: number, direction: "up" | "down") => void,
): void {
  const n = series.length;
  let theta = thresholdK === 0 ? 0 : NaN; // NaN = not enough history yet
  let nextMadAt = 0;
  let state: "up" | "down" | null = null;
  let pendingDir: "up" | "down" | null = null;
  let pendingCount = 0;
  let lastUp = -Infinity;
  let lastDown = -Infinity;

  for (let i = 0; i < n; i++) {
    const v = series[i];
    if (v == null || !Number.isFinite(v)) {
      pendingDir = null;
      pendingCount = 0;
      continue;
    }
    if (thresholdK !== 0 && i >= nextMadAt) {
      const mad = trailingMad(series, i - MAD_WINDOW, i);
      theta = Number.isFinite(mad) ? thresholdK * mad : NaN;
      nextMadAt = i + MAD_STEP;
    }
    // With no usable θ yet, hold — no events until the noise scale is known.
    const dir: "up" | "down" | null = Number.isNaN(theta)
      ? state
      : v > theta ? "up" : v < -theta ? "down" : state;

    if (dir !== null && state === null) {
      // Initial state adoption — the first trend reading is not an inflection.
      state = dir;
      continue;
    }
    if (dir !== null && dir !== state) {
      if (pendingDir === dir) pendingCount++;
      else { pendingDir = dir; pendingCount = 1; }
      if (pendingCount >= confirmBars) {
        state = dir;
        pendingDir = null;
        pendingCount = 0;
        const last = dir === "up" ? lastUp : lastDown;
        if (i - last >= minBarsBetween) emit(i, dir);
        if (dir === "up") lastUp = i;
        else lastDown = i;
      }
    } else {
      pendingDir = null;
      pendingCount = 0;
    }
  }
}

export function computeMaSlopeSeries(
  closes: number[],
  params: MaSlopeParams,
  opts?: { highs?: number[]; lows?: number[] },
): MaSlopeSeries {
  const n = closes.length;
  const L = Math.max(1, Math.round(params.slopeLookback));
  const maOpts: MaOptions = { highs: opts?.highs, lows: opts?.lows };
  const ma = n >= 2 ? computeMaByType(closes, params.period, params.maType, maOpts) : new Array(n).fill(null);

  const slope: (number | null)[] = new Array(n).fill(null);
  if (params.measure === "regress") {
    const w = Math.max(5, L);
    for (let i = w - 1; i < n; i++) {
      const anchor = ma[i];
      if (anchor == null || anchor <= 0) continue;
      // OLS slope of the MA over the window, x = 0..w-1.
      let sy = 0, sxy = 0, cnt = 0;
      for (let j = 0; j < w; j++) {
        const y = ma[i - w + 1 + j];
        if (y == null || !Number.isFinite(y)) { cnt = -1; break; }
        sy += y;
        sxy += j * y;
        cnt++;
      }
      if (cnt !== w) continue;
      const sx = (w * (w - 1)) / 2;
      const sxx = ((w - 1) * w * (2 * w - 1)) / 6;
      const denom = w * sxx - sx * sx;
      if (denom === 0) continue;
      const b = (w * sxy - sx * sy) / denom;
      slope[i] = (b / anchor) * 10000;
    }
  } else {
    for (let i = L; i < n; i++) {
      const cur = ma[i], prev = ma[i - L];
      if (cur == null || prev == null || cur <= 0) continue;
      slope[i] = ((cur - prev) / (L * cur)) * 10000;
    }
  }

  const curvature: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const a = slope[i], b = slope[i - 1];
    if (a != null && b != null) curvature[i] = a - b;
  }

  let warmupIdx = -1;
  for (let i = 0; i < n; i++) if (slope[i] != null) { warmupIdx = i; break; }

  const events: InflectionEvent[] = [];
  const push = (kind: "slope" | "curvature") => (idx: number, direction: "up" | "down") => {
    events.push({ idx, direction, kind, slope: slope[idx] ?? 0, maValue: ma[idx] ?? 0 });
  };
  detectFlips(slope, params.thresholdK, Math.max(1, params.confirmBars), Math.max(0, params.minBarsBetween), push("slope"));
  if (params.detectCurvature) {
    detectFlips(curvature, params.thresholdK, Math.max(1, params.confirmBars), Math.max(0, params.minBarsBetween), push("curvature"));
  }
  events.sort((a, b) => a.idx - b.idx || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));

  return { ma, slope, curvature, events, warmupIdx };
}
