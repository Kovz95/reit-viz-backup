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

export type SlopeMeasure = "diff" | "regress" | "kalman";
export type SlopeNormalization = "ma" | "atr";
export type SlopeThresholdMode = "mad" | "tstat";
export type SlopeFreq = "hourly" | "daily" | "weekly" | "monthly";

export interface MaSlopeParams {
  maType: MaType;
  period: number;
  /** L — bars the slope difference/regression spans. */
  slopeLookback: number;
  /** "diff" = (ma[i]−ma[i−L])/L (default; the MA is already the smoother);
   *  "regress" = OLS slope of the MA over max(5, L) bars (steadier for short
   *  periods on hourly bars, at the cost of a little extra lag);
   *  "kalman" = local-linear Kalman trend of log(MA) (max smoothness-per-lag;
   *  effective window tied to L). */
  measure: SlopeMeasure;
  /** Slope denominator: "ma" = per-bar change relative to the MA level
   *  (bps/bar); "atr" = per-bar change as a % of ATR(14) of the underlying
   *  bars — volatility units instead of price units. */
  normalization: SlopeNormalization;
  /** "mad" = adaptive hysteresis (±thresholdK · trailing MAD of the slope);
   *  "tstat" = significance gate — fire only when the regression slope's
   *  t-statistic escapes ±tCrit (always computed from the OLS fit over
   *  max(5, L) bars, regardless of the display measure). */
  thresholdMode: SlopeThresholdMode;
  /** Hysteresis width in slope-MAD units (thresholdMode "mad"). 0 = raw sign flip. */
  thresholdK: number;
  /** t-statistic dead zone half-width (thresholdMode "tstat"). */
  tCrit: number;
  /** Consecutive bars the signal must hold beyond ±θ before an event fires. */
  confirmBars: number;
  /** Refractory: suppress a same-direction event within this many bars. */
  minBarsBetween: number;
  detectCurvature: boolean;
  /** Long-trend regime filter on SLOPE events (research: counter-trend
   *  inflections carry the robust edge — see maSlopeConditioners):
   *  "counter" keeps up-flips only while the long-MA slope is ≤ 0 and
   *  down-flips only while it is ≥ 0; "with" keeps the opposite; "off" keeps
   *  all. Events during the long MA's warmup are dropped when filtering.
   *  Curvature events are never filtered. */
  trendFilter: "off" | "counter" | "with";
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
    normalization: "ma",
    thresholdMode: "mad",
    thresholdK: 0.3,
    tCrit: 2,
    confirmBars: 1,
    minBarsBetween: 5,
    detectCurvature: true,
    trendFilter: "off",
  };
}

export function configKey(p: MaSlopeParams, freq: SlopeFreq): string {
  const trigger = p.thresholdMode === "tstat" ? `t${p.tCrit}` : `k${p.thresholdK}`;
  const tf = p.trendFilter && p.trendFilter !== "off" ? `·${p.trendFilter}` : "";
  return `${p.maType}${p.period}·${freq}·L${p.slopeLookback}·${trigger}·c${p.confirmBars}·g${p.minBarsBetween}·${p.measure}·${p.normalization}${tf}`;
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

type FlipThreshold = { kind: "mad"; k: number } | { kind: "fixed"; theta: number };

/** Detect state transitions of a Schmitt trigger over `series`. The dead zone
 *  is either adaptive (±k · trailing MAD of the series) or fixed (±theta, for
 *  self-normalized series like a t-statistic). Shared by slope and curvature. */
function detectFlips(
  series: (number | null)[],
  threshold: FlipThreshold,
  confirmBars: number,
  minBarsBetween: number,
  emit: (idx: number, direction: "up" | "down") => void,
): void {
  const n = series.length;
  const thresholdK = threshold.kind === "mad" ? threshold.k : 0;
  let theta = threshold.kind === "fixed" ? Math.abs(threshold.theta)
    : thresholdK === 0 ? 0 : NaN; // NaN = not enough history yet
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
    if (threshold.kind === "mad" && thresholdK !== 0 && i >= nextMadAt) {
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

/** Wilder ATR(14) of the underlying bars; close-to-close TR fallback when
 *  highs/lows are absent. Causal (seeded from the first 14 TRs). */
function atrSeries(closes: number[], highs?: number[], lows?: number[], period = 14): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const hasHL = !!highs && !!lows && highs.length === n && lows.length === n;
  let atr = 0;
  let count = 0;
  for (let i = 1; i < n; i++) {
    const pc = closes[i - 1];
    if (!Number.isFinite(pc)) continue;
    const tr = hasHL
      ? Math.max(highs![i] - lows![i], Math.abs(highs![i] - pc), Math.abs(lows![i] - pc))
      : Math.abs(closes[i] - pc);
    if (!Number.isFinite(tr)) continue;
    count++;
    if (count <= period) {
      atr += (tr - atr) / count; // simple mean while seeding
    } else {
      atr += (tr - atr) / period; // Wilder smoothing
    }
    if (count >= period && atr > 0) out[i] = atr;
  }
  return out;
}

/** Per-window OLS slope of the MA + the slope's t-statistic (b / SE(b)).
 *  Window w = max(5, L); both series are null through warmup. */
function regressionSlope(
  ma: (number | null)[],
  L: number,
): { b: (number | null)[]; t: (number | null)[] } {
  const n = ma.length;
  const w = Math.max(5, L);
  const b: (number | null)[] = new Array(n).fill(null);
  const t: (number | null)[] = new Array(n).fill(null);
  const sx = (w * (w - 1)) / 2;
  const sxx = ((w - 1) * w * (2 * w - 1)) / 6;
  const denom = w * sxx - sx * sx;
  if (denom === 0) return { b, t };
  const sxxCentered = sxx - (sx * sx) / w;
  for (let i = w - 1; i < n; i++) {
    let sy = 0, sxy = 0, cnt = 0;
    for (let j = 0; j < w; j++) {
      const y = ma[i - w + 1 + j];
      if (y == null || !Number.isFinite(y)) { cnt = -1; break; }
      sy += y;
      sxy += j * y;
      cnt++;
    }
    if (cnt !== w) continue;
    const slope = (w * sxy - sx * sy) / denom;
    b[i] = slope;
    if (w > 2) {
      // Residual variance of the fit -> SE of the slope coefficient.
      const intercept = (sy - slope * sx) / w;
      let sse = 0;
      for (let j = 0; j < w; j++) {
        const y = ma[i - w + 1 + j] as number;
        const resid = y - (intercept + slope * j);
        sse += resid * resid;
      }
      const s2 = sse / (w - 2);
      const se = Math.sqrt(s2 / sxxCentered);
      t[i] = se > 0 ? slope / se : slope === 0 ? 0 : slope > 0 ? 1e6 : -1e6;
    }
  }
  return { b, t };
}

/** Local-linear Kalman filter on log(MA) — same construction as
 *  adaptiveModels.computeKalmanTrend (R from innovation variance, Q tied to an
 *  effective window) but returning the per-bar log-slope state. Causal. */
function kalmanLogSlope(ma: (number | null)[], L: number): (number | null)[] {
  const n = ma.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const idxs: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = ma[i];
    if (v != null && Number.isFinite(v) && v > 0) { idxs.push(i); y.push(Math.log(v)); }
  }
  if (y.length < 10) return out;
  let R = 0, mean = 0;
  const m = y.length;
  for (let i = 1; i < m; i++) mean += y[i] - y[i - 1];
  mean /= m - 1;
  for (let i = 1; i < m; i++) R += (y[i] - y[i - 1] - mean) ** 2;
  R = Math.max(R / Math.max(1, m - 2), 1e-12);
  const W = Math.max(5, 2 * L);
  const ql = R / (W * W);
  const qs = R / (W * W * W * W);
  let l = y[0], s = 0;
  let P00 = R * 10, P01 = 0, P11 = R;
  for (let k = 0; k < m; k++) {
    if (k > 0) {
      const lp = l + s;
      const P00p = P00 + 2 * P01 + P11 + ql;
      const P01p = P01 + P11;
      const P11p = P11 + qs;
      const S = P00p + R;
      const K0 = P00p / S;
      const K1 = P01p / S;
      const innov = y[k] - lp;
      l = lp + K0 * innov;
      s = s + K1 * innov;
      P00 = (1 - K0) * P00p;
      P01 = (1 - K0) * P01p;
      P11 = P11p - K1 * P01p;
    }
    // Skip the filter's own burn-in before reporting a slope.
    if (k >= Math.min(W, m - 1)) out[idxs[k]] = s;
  }
  return out;
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

  // ── Per-bar absolute MA change (price units), by estimator ──
  const needRegress = params.measure === "regress" || params.thresholdMode === "tstat";
  const reg = needRegress ? regressionSlope(ma, L) : null;
  const absSlope: (number | null)[] = new Array(n).fill(null);
  if (params.measure === "regress") {
    for (let i = 0; i < n; i++) absSlope[i] = reg!.b[i];
  } else if (params.measure === "kalman") {
    const kal = kalmanLogSlope(ma, L);
    for (let i = 0; i < n; i++) {
      const s = kal[i], anchor = ma[i];
      if (s != null && anchor != null && anchor > 0) absSlope[i] = s * anchor; // log-slope -> price units
    }
  } else {
    for (let i = L; i < n; i++) {
      const cur = ma[i], prev = ma[i - L];
      if (cur == null || prev == null) continue;
      absSlope[i] = (cur - prev) / L;
    }
  }

  // ── Normalization: MA level (bps/bar) or ATR (% of ATR per bar) ──
  const atr = params.normalization === "atr" ? atrSeries(closes, opts?.highs, opts?.lows) : null;
  const slope: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const a = absSlope[i];
    if (a == null || !Number.isFinite(a)) continue;
    if (params.normalization === "atr") {
      const d = atr![i];
      if (d != null && d > 0) slope[i] = (a / d) * 100;
    } else {
      const anchor = ma[i];
      if (anchor != null && anchor > 0) slope[i] = (a / anchor) * 10000;
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
  // Slope events: MAD hysteresis on the normalized slope, or a fixed dead zone
  // on the regression t-statistic (self-normalized — no MAD scaling needed).
  if (params.thresholdMode === "tstat") {
    detectFlips(reg!.t, { kind: "fixed", theta: params.tCrit }, Math.max(1, params.confirmBars), Math.max(0, params.minBarsBetween), push("slope"));
  } else {
    detectFlips(slope, { kind: "mad", k: params.thresholdK }, Math.max(1, params.confirmBars), Math.max(0, params.minBarsBetween), push("slope"));
  }
  if (params.detectCurvature) {
    detectFlips(curvature, { kind: "mad", k: params.thresholdK }, Math.max(1, params.confirmBars), Math.max(0, params.minBarsBetween), push("curvature"));
  }
  events.sort((a, b) => a.idx - b.idx || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));

  // ── Long-trend regime filter on slope events ──
  // Same construction as the conditioner study that motivated it: SMA over
  // min(200, max(20, n/4)) with a 10-bar slope difference, strictly causal.
  let filtered = events;
  if (params.trendFilter === "counter" || params.trendFilter === "with") {
    const longPeriod = Math.min(200, Math.max(20, Math.floor(n / 4)));
    const longMa = computeMaByType(closes, longPeriod, "SMA");
    const keep = (e: InflectionEvent): boolean => {
      if (e.kind !== "slope") return true;
      const a = longMa[e.idx], b = longMa[e.idx - 10];
      if (a == null || b == null) return false; // unclassifiable during warmup
      const longUp = a - b > 0;
      const withTrend = e.direction === "up" ? longUp : !longUp;
      return params.trendFilter === "with" ? withTrend : !withTrend;
    };
    filtered = events.filter(keep);
  }

  return { ma, slope, curvature, events: filtered, warmupIdx };
}
