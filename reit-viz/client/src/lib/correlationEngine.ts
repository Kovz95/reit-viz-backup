/**
 * Client-side correlation engine for static mode.
 * Mirrors the server-side correlation routes and returns identical response shapes.
 */
import { resolveSeriesDataStatic, isStaticMode, DataPoint } from "./macroStatic";
import { apiRequest } from "./queryClient";
import { downsampleSeries, dateOfTimestamp } from "./chartFrequency";
import { fetchIntradayBars } from "./fetchIntradayBars";
// LegTransform + the shared correlation math now live in lib/corrMatrixMath.ts
// (pure, worker-safe — workers/corrMath.worker.ts imports them) and are
// re-exported here so existing importers keep working.
import {
  applyLegTransform,
  logReturns,
  simpleChanges,
  pearsonCorrelation,
  autocorrelation,
  normalCDF,
  adjustedCorrelation,
  computeMatrixFromSeries,
} from "./corrMatrixMath";
import type { LegTransform } from "./corrMatrixMath";
import { createSweepPool } from "./sweepPool";
export { applyLegTransform } from "./corrMatrixMath";
export type { LegTransform } from "./corrMatrixMath";

/** Bar frequency for pairwise correlation. Hourly uses Yahoo 60-min bars
 *  (epoch-second time keys as strings); weekly/monthly downsample daily to
 *  last-value-per-ISO-week / per-calendar-month. */
export type CorrFrequency = "hourly" | "daily" | "weekly" | "monthly";


export interface PairwiseOpts {
  extraWindows?: number[];
  freq?: CorrFrequency;
  /** Shift in bars: correlate A(t) against B(t − lag). Positive lag tests
   *  "B leads A by `lag` bars"; with specA === specB this is autocorrelation
   *  of the series at that lag. */
  lagBars?: number;
  transformA?: LegTransform | null;
  transformB?: LegTransform | null;
  /** Pre-resolved series for synthetic legs (e.g. BASKET: specs) — replaces the
   *  spec lookup for that leg. Daily-dated {time,value} points; hourly frequency
   *  forward-fills them onto the other leg's intraday axis like macro series. */
  overrideA?: DataPoint[] | null;
  overrideB?: DataPoint[] | null;
}

export const LEG_TRANSFORM_LABELS: Record<LegTransform["kind"], string> = {
  rsi: "RSI",
  sma: "SMA",
  ema: "EMA",
  roc: "ROC %",
  zscore: "Z-Score",
  vol: "Realized Vol",
};


// ── Math helpers (mirroring server/routes.ts) ──




/** Partial autocorrelation φ_kk for k=1..K via Durbin–Levinson, from the ACF
 *  values [r1..rK]. PACF at lag k = correlation at k with lags 1..k−1
 *  partialled out — the honest answer to "which lag matters on its own". */
function pacfFromAcf(acfVals: number[]): number[] {
  const K = acfVals.length;
  const r = [1, ...acfVals];
  const out: number[] = [];
  let prevPhi: number[] = [];
  let err = 1;
  for (let k = 1; k <= K; k++) {
    let num = r[k];
    for (let j = 1; j < k; j++) num -= prevPhi[j - 1] * r[k - j];
    const phiKK = err === 0 ? 0 : num / err;
    const phi: number[] = [];
    for (let j = 1; j < k; j++) phi.push(prevPhi[j - 1] - phiKK * prevPhi[k - j - 1]);
    phi.push(phiKK);
    err *= 1 - phiKK * phiKK;
    prevPhi = phi;
    out.push(phiKK);
  }
  return out;
}




function bartlettSE(n: number): number {
  return 1 / Math.sqrt(n);
}

function alignSeries(a: DataPoint[], b: DataPoint[]) {
  const mapB = new Map(b.map(d => [d.time, d.value]));
  const dates: string[] = [];
  const valuesA: number[] = [];
  const valuesB: number[] = [];
  for (const pt of a) {
    const bVal = mapB.get(pt.time);
    if (bVal !== undefined) {
      dates.push(pt.time);
      valuesA.push(pt.value);
      valuesB.push(bVal);
    }
  }
  return { dates, valuesA, valuesB };
}

// ── Spearman rank correlation ──

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j - 1) / 2 + 1; // 1-based average rank for ties
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

function spearmanCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  return pearsonCorrelation(rankArray(x.slice(0, n)), rankArray(y.slice(0, n)));
}

// ── Fisher-transform confidence interval for correlation ──

function fisherCI(r: number, n: number, alpha = 0.05): { lower: number; upper: number } {
  if (n < 4 || !Number.isFinite(r)) return { lower: -1, upper: 1 };
  // Clamp |r| below 1 — r === ±1 (e.g. a series correlated with itself) sends
  // the transform to ±Infinity and the inverse transform to NaN (Inf/Inf).
  r = Math.max(-0.999999, Math.min(0.999999, r));
  const z = 0.5 * Math.log((1 + r) / (1 - r)); // Fisher z-transform
  const se = 1 / Math.sqrt(n - 3);
  // z-critical for two-tailed alpha
  // approximate inverse normal for common alphas
  const zCrit = alpha <= 0.01 ? 2.576 : alpha <= 0.05 ? 1.96 : 1.645;
  const lo = z - zCrit * se;
  const hi = z + zCrit * se;
  // inverse Fisher transform
  return {
    lower: Math.round((Math.exp(2 * lo) - 1) / (Math.exp(2 * lo) + 1) * 10000) / 10000,
    upper: Math.round((Math.exp(2 * hi) - 1) / (Math.exp(2 * hi) + 1) * 10000) / 10000,
  };
}

// ── ADF (Augmented Dickey-Fuller) unit root test ──
// Simplified ADF: tests if a series has a unit root (non-stationary)
// Uses OLS regression: Δy_t = α + γ*y_{t-1} + Σ(δ_i * Δy_{t-i}) + ε_t
// Returns: { stat, pValue, lags, isStationary }

function adfTest(values: number[], maxLag?: number): { stat: number; pValue: number; lags: number; isStationary: boolean } {
  const n = values.length;
  if (n < 20) return { stat: 0, pValue: 1, lags: 0, isStationary: false };
  
  const pLag = maxLag ?? Math.min(Math.floor(Math.pow(n - 1, 1 / 3)), 12);
  
  // Compute first differences
  const dy = new Array(n - 1);
  for (let i = 1; i < n; i++) dy[i - 1] = values[i] - values[i - 1];
  
  // Build regression: Δy_t = α + γ*y_{t-1} + δ_1*Δy_{t-1} + ... + δ_p*Δy_{t-p}
  const start = pLag + 1;
  const T = n - 1 - pLag; // effective obs
  if (T < 10) return { stat: 0, pValue: 1, lags: pLag, isStationary: false };
  
  // Design matrix columns: [1, y_{t-1}, Δy_{t-1}, ..., Δy_{t-p}]
  const k = 2 + pLag; // number of regressors
  const X: number[][] = [];
  const Y: number[] = [];
  
  for (let t = start; t < n - 1; t++) {
    const row = [1, values[t]]; // constant + lagged level
    for (let j = 1; j <= pLag; j++) {
      row.push(dy[t - j]); // lagged differences
    }
    X.push(row);
    Y.push(dy[t]);
  }
  
  // OLS: β = (X'X)^{-1} X'Y using normal equations with simple Gauss elimination
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const XtY: number[] = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < k; j++) {
      XtY[j] += X[i][j] * Y[i];
      for (let m = 0; m < k; m++) {
        XtX[j][m] += X[i][j] * X[i][m];
      }
    }
  }
  
  // Augmented matrix for Gauss elimination
  const aug: number[][] = XtX.map((row, i) => [...row, XtY[i]]);
  for (let col = 0; col < k; col++) {
    let maxRow = col;
    for (let row = col + 1; row < k; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (Math.abs(aug[col][col]) < 1e-12) return { stat: 0, pValue: 1, lags: pLag, isStationary: false };
    for (let row = col + 1; row < k; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= k; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  const beta = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    beta[i] = aug[i][k];
    for (let j = i + 1; j < k; j++) beta[i] -= aug[i][j] * beta[j];
    beta[i] /= aug[i][i];
  }
  
  const gamma = beta[1]; // coefficient on y_{t-1}
  
  // Compute residuals and SE of gamma
  let sse = 0;
  for (let i = 0; i < X.length; i++) {
    let yHat = 0;
    for (let j = 0; j < k; j++) yHat += X[i][j] * beta[j];
    sse += (Y[i] - yHat) ** 2;
  }
  const s2 = sse / (X.length - k);
  
  // (X'X)^{-1} for SE — invert via augmented identity
  const inv: number[][] = XtX.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => i === j ? 1 : 0)]);
  for (let col = 0; col < k; col++) {
    let maxRow2 = col;
    for (let row = col + 1; row < k; row++) {
      if (Math.abs(inv[row][col]) > Math.abs(inv[maxRow2][col])) maxRow2 = row;
    }
    [inv[col], inv[maxRow2]] = [inv[maxRow2], inv[col]];
    const pivot = inv[col][col];
    if (Math.abs(pivot) < 1e-12) return { stat: 0, pValue: 1, lags: pLag, isStationary: false };
    for (let j = 0; j < 2 * k; j++) inv[col][j] /= pivot;
    for (let row = 0; row < k; row++) {
      if (row === col) continue;
      const factor = inv[row][col];
      for (let j = 0; j < 2 * k; j++) inv[row][j] -= factor * inv[col][j];
    }
  }
  const seGamma = Math.sqrt(s2 * inv[1][k + 1]);
  const tStat = seGamma > 0 ? gamma / seGamma : 0;
  
  // MacKinnon approximate critical values for ADF with constant, no trend
  // Interpolate p-value from critical value table
  // Critical values (constant, no trend): 1%: -3.43, 5%: -2.86, 10%: -2.57
  let pValue: number;
  if (tStat <= -3.43) pValue = 0.005;
  else if (tStat <= -2.86) pValue = 0.01 + (tStat - (-3.43)) / ((-2.86) - (-3.43)) * (0.05 - 0.01);
  else if (tStat <= -2.57) pValue = 0.05 + (tStat - (-2.86)) / ((-2.57) - (-2.86)) * (0.10 - 0.05);
  else if (tStat <= -1.94) pValue = 0.10 + (tStat - (-2.57)) / ((-1.94) - (-2.57)) * (0.30 - 0.10);
  else if (tStat <= -1.62) pValue = 0.30 + (tStat - (-1.94)) / ((-1.62) - (-1.94)) * (0.50 - 0.30);
  else pValue = 0.50 + Math.min(0.49, (tStat - (-1.62)) * 0.15);
  pValue = Math.max(0.001, Math.min(0.99, pValue));
  
  return {
    stat: Math.round(tStat * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    lags: pLag,
    isStationary: pValue < 0.05,
  };
}

// ── Engle-Granger cointegration test ──
// Step 1: OLS regression y = α + β*x + ε
// Step 2: ADF test on residuals ε
// Uses different critical values than standard ADF (more negative)

function cointegrationTest(
  valuesA: number[], valuesB: number[]
): { stat: number; pValue: number; lags: number; isCointegrated: boolean; residuals: number[] } {
  const n = Math.min(valuesA.length, valuesB.length);
  if (n < 30) return { stat: 0, pValue: 1, lags: 0, isCointegrated: false, residuals: [] };
  
  // OLS: A = α + β*B + ε
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += valuesB[i]; sumY += valuesA[i];
    sumXY += valuesB[i] * valuesA[i]; sumXX += valuesB[i] * valuesB[i];
  }
  const mX = sumX / n, mY = sumY / n;
  const ssXX = sumXX - n * mX * mX;
  const ssXY2 = sumXY - n * mX * mY;
  const betaEG = ssXX === 0 ? 0 : ssXY2 / ssXX;
  const alphaEG = mY - betaEG * mX;
  
  // Residuals
  const residuals = new Array(n);
  for (let i = 0; i < n; i++) {
    residuals[i] = valuesA[i] - alphaEG - betaEG * valuesB[i];
  }
  
  // ADF on residuals (use stricter critical values for cointegration)
  const adfResult = adfTest(residuals);
  
  // Engle-Granger critical values (2 variables, constant):
  // 1%: -3.90, 5%: -3.34, 10%: -3.04
  let pValueEG: number;
  if (adfResult.stat <= -3.90) pValueEG = 0.005;
  else if (adfResult.stat <= -3.34) pValueEG = 0.01 + (adfResult.stat - (-3.90)) / ((-3.34) - (-3.90)) * (0.05 - 0.01);
  else if (adfResult.stat <= -3.04) pValueEG = 0.05 + (adfResult.stat - (-3.34)) / ((-3.04) - (-3.34)) * (0.10 - 0.05);
  else if (adfResult.stat <= -2.03) pValueEG = 0.10 + (adfResult.stat - (-3.04)) / ((-2.03) - (-3.04)) * (0.50 - 0.10);
  else pValueEG = 0.50 + Math.min(0.49, (adfResult.stat - (-2.03)) * 0.10);
  pValueEG = Math.max(0.001, Math.min(0.99, pValueEG));
  
  return {
    stat: adfResult.stat,
    pValue: Math.round(pValueEG * 10000) / 10000,
    lags: adfResult.lags,
    isCointegrated: pValueEG < 0.05,
    residuals,
  };
}

// ── Rolling beta (windowed OLS) ──

function rollingBeta(
  x: number[], y: number[], dates: string[], window: number
): { time: string; value: number }[] {
  const result: { time: string; value: number }[] = [];
  for (let i = window - 1; i < x.length; i++) {
    const sliceX = x.slice(i - window + 1, i + 1);
    const sliceY = y.slice(i - window + 1, i + 1);
    const n = sliceX.length;
    let sX = 0, sY = 0, sXY = 0, sXX = 0;
    for (let j = 0; j < n; j++) {
      sX += sliceX[j]; sY += sliceY[j];
      sXY += sliceX[j] * sliceY[j]; sXX += sliceX[j] * sliceX[j];
    }
    const mX = sX / n;
    const denom = sXX - n * mX * mX;
    const beta = denom === 0 ? 0 : (sXY - n * mX * (sY / n)) / denom;
    result.push({ time: dates[i], value: Math.round(beta * 10000) / 10000 });
  }
  return result;
}

// ── Interfaces matching server response shapes ──

export interface PairwiseResult {
  summary: {
    correlation: number;
    spearmanCorrelation: number;
    rSquared: number;
    beta: number;
    alpha: number;
    observations: number;
    mode: string;
    autoCorrelationA: number;
    autoCorrelationB: number;
    effectiveN: number;
    tStat: number;
    pValue: number;
  };
  rolling: { time: string; value: number }[];
  rollingCI: { time: string; upper: number; lower: number }[];
  rollingBeta: { time: string; value: number }[];
  multiWindowRolling: Record<number, { time: string; value: number }[]>;
  crossCorrelation: { lag: number; value: number }[];
  acfA: { lag: number; value: number }[];
  acfB: { lag: number; value: number }[];
  /** Partial autocorrelation (Durbin–Levinson), same lags as acfA/acfB. */
  pacfA: { lag: number; value: number }[];
  pacfB: { lag: number; value: number }[];
  scatter: { x: number; y: number; date: string }[];
  levelsA: { time: string; value: number }[];
  levelsB: { time: string; value: number }[];
  diagnostics: {
    adfA: { stat: number; pValue: number; lags: number; isStationary: boolean };
    adfB: { stat: number; pValue: number; lags: number; isStationary: boolean };
    cointegration: { stat: number; pValue: number; lags: number; isCointegrated: boolean } | null;
    fisherCI: { lower: number; upper: number };
  };
  error?: string;
}

export interface MatrixResult {
  labels: string[];
  matrix: number[][];
  pValues: number[][];
  observations: number;
  dateRange: { from: string; to: string };
  mode: string;
}

// ── Frequency transforms (pairwise) ──

const INTRADAY_METRICS = new Set(["close", "open", "high", "low"]);

/** If the spec is a plain stock price series, return its ticker/metric for
 *  intraday resolution; null for macro, basket, or fundamental-metric specs. */
function specIntradayInfo(spec: string): { ticker: string; metric: string } | null {
  if (spec.startsWith("MACRO:")) return null;
  const parts = spec.split(":");
  const ticker = parts[0];
  const metric = parts.slice(1).join(":") || "close";
  if (!ticker || ticker.startsWith("BASKET")) return null;
  return INTRADAY_METRICS.has(metric) ? { ticker, metric } : null;
}

/** Strict no-lookahead fill of a daily series onto an hourly axis: each hourly
 *  bar takes the latest daily value dated STRICTLY BEFORE the bar's UTC date
 *  (a daily print stamped "2026-07-21" is not knowable during 2026-07-21's
 *  intraday bars). */
function fillDailyOntoAxisStrict(daily: DataPoint[], axisTimes: number[]): DataPoint[] {
  const pts = daily
    .filter((p) => p && typeof p.time === "string" && Number.isFinite(p.value))
    .sort((a, b) => a.time.localeCompare(b.time));
  if (!pts.length) return [];
  const out: DataPoint[] = [];
  let i = 0;
  let cur: number | null = null;
  for (const t of axisTimes) {
    const d = dateOfTimestamp(t);
    while (i < pts.length && pts[i].time < d) {
      cur = pts[i].value;
      i++;
    }
    if (cur != null) out.push({ time: String(t), value: cur });
  }
  return out;
}

/** Re-express both resolved daily series at the requested bar frequency.
 *  Hourly keys are epoch seconds as strings (LWC intraday time domain). */
async function applyFrequency(
  specA: string, specB: string, dataA: DataPoint[], dataB: DataPoint[], freq: CorrFrequency
): Promise<{ a: DataPoint[]; b: DataPoint[] } | { error: string }> {
  if (freq === "weekly" || freq === "monthly") {
    return { a: downsampleSeries(dataA, freq), b: downsampleSeries(dataB, freq) };
  }
  if (freq !== "hourly") return { a: dataA, b: dataB };

  const infoA = specIntradayInfo(specA);
  const infoB = specIntradayInfo(specB);
  if (!infoA && !infoB) {
    return { error: "Hourly frequency needs at least one stock price series (close/open/high/low). Macro and fundamental series are daily — they get forward-filled against an intraday leg." };
  }
  const [barsA, barsB] = await Promise.all([
    infoA ? fetchIntradayBars(infoA.ticker) : Promise.resolve(null),
    infoB ? fetchIntradayBars(infoB.ticker) : Promise.resolve(null),
  ]);
  const goodA = infoA && barsA && barsA.length > 0;
  const goodB = infoB && barsB && barsB.length > 0;
  if (!goodA && !goodB) {
    return { error: "No intraday bars available for either series." };
  }
  const lineFrom = (bars: NonNullable<typeof barsA>, metric: string): DataPoint[] =>
    bars
      .map((b) => ({ time: String(b.time), value: (b as any)[metric] as number }))
      .filter((p) => Number.isFinite(p.value));
  const axisTimes = (goodA ? barsA! : barsB!).map((b) => b.time);
  const a = goodA ? lineFrom(barsA!, infoA!.metric) : fillDailyOntoAxisStrict(dataA, axisTimes);
  const b = goodB ? lineFrom(barsB!, infoB!.metric) : fillDailyOntoAxisStrict(dataB, axisTimes);
  return { a, b };
}

function emptyPairwiseResult(mode: string, error: string, observations = 0): PairwiseResult {
  return {
    summary: { correlation: 0, spearmanCorrelation: 0, rSquared: 0, beta: 0, alpha: 0, observations, mode, autoCorrelationA: 0, autoCorrelationB: 0, effectiveN: 0, tStat: 0, pValue: 1 },
    rolling: [], rollingCI: [], rollingBeta: [], multiWindowRolling: {}, crossCorrelation: [], acfA: [], acfB: [], pacfA: [], pacfB: [], scatter: [], levelsA: [], levelsB: [],
    diagnostics: { adfA: { stat: 0, pValue: 1, lags: 0, isStationary: false }, adfB: { stat: 0, pValue: 1, lags: 0, isStationary: false }, cointegration: null, fisherCI: { lower: -1, upper: 1 } },
    error,
  };
}

// ── Core computation (mirrors server logic exactly) ──

type AlignedPair = { dates: string[]; valuesA: number[]; valuesB: number[] };

function modeTransformPair(al: AlignedPair, mode: string): { a: number[]; b: number[]; dates: string[] } {
  if (mode === "returns") return { a: logReturns(al.valuesA), b: logReturns(al.valuesB), dates: al.dates.slice(1) };
  if (mode === "changes") return { a: simpleChanges(al.valuesA), b: simpleChanges(al.valuesB), dates: al.dates.slice(1) };
  return { a: al.valuesA, b: al.valuesB, dates: al.dates };
}

async function computePairwiseStatic(
  specA: string, specB: string, window: number, mode: string, opts: PairwiseOpts = {}
): Promise<PairwiseResult> {
  const { extraWindows = [], freq = "daily", lagBars = 0, transformA: legTA = null, transformB: legTB = null, overrideA = null, overrideB = null } = opts;
  let [dataA, dataB] = await Promise.all([
    overrideA ? Promise.resolve(overrideA) : resolveSeriesDataStatic(specA),
    overrideB ? Promise.resolve(overrideB) : resolveSeriesDataStatic(specB),
  ]);
  const fx = await applyFrequency(specA, specB, dataA, dataB, freq);
  if ("error" in fx) return emptyPairwiseResult(mode, fx.error);
  // Per-leg technical transforms (RSI / SMA / … of the resolved series)
  dataA = applyLegTransform(fx.a, legTA);
  dataB = applyLegTransform(fx.b, legTB);
  const alignedFull = alignSeries(dataA, dataB);

  if (alignedFull.dates.length < 10) {
    return emptyPairwiseResult(mode, "Insufficient overlapping data", alignedFull.dates.length);
  }

  // Unlagged mode-transformed pair — drives the correlation-vs-lag profile.
  const ccPair = modeTransformPair(alignedFull, mode);

  // Apply the lag: correlate A(t) against B(t − lag); dates follow the A axis.
  const lag = Math.round(lagBars) || 0;
  let aligned: AlignedPair = alignedFull;
  if (lag !== 0) {
    const n0 = alignedFull.dates.length;
    const k = Math.abs(lag);
    if (n0 - k < 10) return emptyPairwiseResult(mode, "Insufficient overlap after applying the lag");
    aligned = lag > 0
      ? { dates: alignedFull.dates.slice(k), valuesA: alignedFull.valuesA.slice(k), valuesB: alignedFull.valuesB.slice(0, n0 - k) }
      : { dates: alignedFull.dates.slice(0, n0 - k), valuesA: alignedFull.valuesA.slice(0, n0 - k), valuesB: alignedFull.valuesB.slice(k) };
  }

  const mt = modeTransformPair(aligned, mode);
  const transformedA: number[] = mt.a;
  const transformedB: number[] = mt.b;
  const transformDates: string[] = mt.dates;

  // Full-sample correlation (Pearson + Spearman)
  const fullCorr = pearsonCorrelation(transformedA, transformedB);
  const fullSpearman = spearmanCorrelation(transformedA, transformedB);
  const adj = adjustedCorrelation(transformedA, transformedB, fullCorr);
  const fullCI = fisherCI(fullCorr, Math.min(transformedA.length, transformedB.length));

  // ACF + PACF profiles (up to 60 lags, bounded by sample size)
  const maxLag = Math.max(10, Math.min(60, Math.floor(transformedA.length / 4)));
  const acfA: { lag: number; value: number }[] = [];
  const acfB: { lag: number; value: number }[] = [];
  for (let k = 1; k <= maxLag; k++) {
    acfA.push({ lag: k, value: Math.round(autocorrelation(transformedA, k) * 10000) / 10000 });
    acfB.push({ lag: k, value: Math.round(autocorrelation(transformedB, k) * 10000) / 10000 });
  }
  const pacfA = pacfFromAcf(acfA.map((d) => d.value)).map((v, i) => ({ lag: i + 1, value: Math.round(v * 10000) / 10000 }));
  const pacfB = pacfFromAcf(acfB.map((d) => d.value)).map((v, i) => ({ lag: i + 1, value: Math.round(v * 10000) / 10000 }));

  // Rolling correlation
  const rolling: { time: string; value: number }[] = [];
  for (let i = window - 1; i < transformedA.length; i++) {
    const sliceA = transformedA.slice(i - window + 1, i + 1);
    const sliceB = transformedB.slice(i - window + 1, i + 1);
    const corr = pearsonCorrelation(sliceA, sliceB);
    rolling.push({ time: transformDates[i], value: Math.round(corr * 10000) / 10000 });
  }

  // Multi-window rolling (standard set + any user-supplied custom windows)
  const windows = Array.from(new Set([
    30, 60, 120, 252,
    ...extraWindows.filter((w) => Number.isFinite(w) && w >= 5 && w <= 2520),
  ]));
  const multiWindowRolling: Record<number, { time: string; value: number }[]> = {};
  for (const w of windows) {
    const arr: { time: string; value: number }[] = [];
    for (let i = w - 1; i < transformedA.length; i++) {
      const sliceA = transformedA.slice(i - w + 1, i + 1);
      const sliceB = transformedB.slice(i - w + 1, i + 1);
      const corr = pearsonCorrelation(sliceA, sliceB);
      arr.push({ time: transformDates[i], value: Math.round(corr * 10000) / 10000 });
    }
    multiWindowRolling[w] = arr;
  }

  // Rolling CI (Fisher transform 95% confidence band on rolling correlation)
  const rollingCIArr: { time: string; upper: number; lower: number }[] = [];
  for (const pt of rolling) {
    const ci = fisherCI(pt.value, window);
    rollingCIArr.push({ time: pt.time, upper: ci.upper, lower: ci.lower });
  }

  // Rolling beta (windowed OLS: A ~ B)
  const rollingBetaArr = rollingBeta(transformedB, transformedA, transformDates, window);

  // Cross-correlation (lags -20 to +20)
  // Correlation-at-each-lag profile from the UNLAGGED pair (so the applied lag
  // shows up as a marker on this curve rather than shifting it).
  const crossCorrelation: { lag: number; value: number }[] = [];
  const maxProfileLag = Math.min(30, Math.max(10, Math.floor(ccPair.a.length / 6)));
  for (let lg = -maxProfileLag; lg <= maxProfileLag; lg++) {
    let sliceA: number[], sliceB: number[];
    if (lg >= 0) {
      sliceA = ccPair.a.slice(lg);
      sliceB = ccPair.b.slice(0, ccPair.b.length - lg);
    } else {
      sliceA = ccPair.a.slice(0, ccPair.a.length + lg);
      sliceB = ccPair.b.slice(-lg);
    }
    const nn = Math.min(sliceA.length, sliceB.length);
    if (nn < 10) { crossCorrelation.push({ lag: lg, value: 0 }); continue; }
    crossCorrelation.push({
      lag: lg,
      value: Math.round(pearsonCorrelation(sliceA.slice(0, nn), sliceB.slice(0, nn)) * 10000) / 10000,
    });
  }

  // OLS regression
  const n = Math.min(transformedA.length, transformedB.length);
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += transformedB[i]; sumY += transformedA[i];
    sumXY += transformedB[i] * transformedA[i]; sumXX += transformedB[i] * transformedB[i];
  }
  const mX = sumX / n; const mY = sumY / n;
  const ssXX = sumXX - n * mX * mX;
  const ssXY2 = sumXY - n * mX * mY;
  const beta = ssXX === 0 ? 0 : ssXY2 / ssXX;
  const alpha = mY - beta * mX;
  const rSquared = fullCorr * fullCorr;

  // Scatter (max 500 points)
  const step = Math.max(1, Math.floor(n / 500));
  const scatter: { x: number; y: number; date: string }[] = [];
  for (let i = 0; i < n; i += step) {
    scatter.push({ x: transformedB[i], y: transformedA[i], date: transformDates[i] });
  }

  // Level series — the transformed legs as the user sees them (unlagged)
  const levelsA = alignedFull.dates.map((d, i) => ({ time: d, value: alignedFull.valuesA[i] }));
  const levelsB = alignedFull.dates.map((d, i) => ({ time: d, value: alignedFull.valuesB[i] }));

  // Stationarity tests (ADF on the transformed series)
  const adfResultA = adfTest(transformedA);
  const adfResultB = adfTest(transformedB);

  // Cointegration test (only meaningful for levels/non-stationary series)
  let cointResult: { stat: number; pValue: number; lags: number; isCointegrated: boolean } | null = null;
  if (mode === "levels" || (!adfResultA.isStationary && !adfResultB.isStationary)) {
    const coint = cointegrationTest(aligned.valuesA, aligned.valuesB);
    cointResult = { stat: coint.stat, pValue: coint.pValue, lags: coint.lags, isCointegrated: coint.isCointegrated };
  }

  return {
    summary: {
      correlation: Math.round(fullCorr * 10000) / 10000,
      spearmanCorrelation: Math.round(fullSpearman * 10000) / 10000,
      rSquared: Math.round(rSquared * 10000) / 10000,
      beta: Math.round(beta * 10000) / 10000,
      alpha: Math.round(alpha * 100000) / 100000,
      observations: n,
      mode,
      autoCorrelationA: acfA[0]?.value || 0,
      autoCorrelationB: acfB[0]?.value || 0,
      effectiveN: adj.effectiveN,
      tStat: adj.tStat,
      pValue: adj.pValue,
    },
    rolling,
    rollingCI: rollingCIArr,
    rollingBeta: rollingBetaArr,
    multiWindowRolling,
    crossCorrelation,
    acfA,
    acfB,
    pacfA,
    pacfB,
    scatter,
    levelsA,
    levelsB,
    diagnostics: {
      adfA: adfResultA,
      adfB: adfResultB,
      cointegration: cointResult,
      fisherCI: fullCI,
    },
  };
}

export interface MatrixOpts {
  /** Technical transform applied to EVERY series before alignment (e.g. the
   *  correlation matrix of RSI14 across the whole scope). */
  transform?: LegTransform | null;
  /** Lead/lag matrix: cell[i][j] = corr(row_i(t), col_j(t − lag)). Asymmetric
   *  when non-zero; the diagonal becomes each series' autocorrelation at lag. */
  lagBars?: number;
  /** Pre-resolved series keyed by spec (e.g. BASKET: legs) — replace the spec
   *  lookup for those entries. Keys must match the specs passed in verbatim. */
  overrides?: Record<string, DataPoint[]>;
}

async function computeMatrixStatic(
  specs: string[], mode: string, windowParam: string, opts: MatrixOpts = {}
): Promise<MatrixResult> {
  const window = parseInt(windowParam) || 252;
  const { transform = null, lagBars = 0, overrides = {} } = opts;

  // Resolve all series on the main thread (fetching), then hand the O(N²)
  // matrix math to a worker; the inline fallback is the same pure kernel.
  const allData = await Promise.all(specs.map(s => overrides[s] ? Promise.resolve(overrides[s]) : resolveSeriesDataStatic(s)));
  const pool = createSweepPool(() =>
    new Worker(new URL("../workers/corrMath.worker.ts", import.meta.url), { type: "module" }), 1);
  try {
    return (await pool.run<MatrixResult>(
      { type: "matrix", specs, allData, mode, window, transform, lagBars },
      () => computeMatrixFromSeries(specs, allData, mode, window, transform, lagBars),
    ))!;
  } finally {
    pool.terminate();
  }
}

// ── Public API ──

// "TICKER:EPS (Default)"-style specs must be translated to the ticker's
// concrete metric BEFORE hitting the server route (which knows nothing about
// the Universe-tab rules); the static path also benefits.
async function translateDefaultSpec(spec: string): Promise<string> {
  const idx = spec.indexOf(":");
  if (idx <= 0) return spec;
  const ticker = spec.slice(0, idx);
  const metric = spec.slice(idx + 1);
  const { isDefaultMetricName, resolveDefaultMetricFor } = await import("./defaultEarningsMetric");
  if (ticker.toUpperCase() === "MACRO" || !isDefaultMetricName(metric)) return spec;
  const { getTickers } = await import("./dataService");
  const metas = await getTickers();
  return `${ticker}:${resolveDefaultMetricFor(metric, metas.find((t: any) => t.ticker === ticker))}`;
}

export async function fetchPairwiseCorrelation(
  specA: string, specB: string, window: number, mode: string, opts: PairwiseOpts = {}
): Promise<PairwiseResult> {
  [specA, specB] = await Promise.all([translateDefaultSpec(specA), translateDefaultSpec(specB)]);
  if (isStaticMode()) {
    return computePairwiseStatic(specA, specB, window, mode, opts);
  }
  const extra = opts.extraWindows?.length ? `&extraWindows=${opts.extraWindows.join(",")}` : "";
  const lag = opts.lagBars ? `&lag=${opts.lagBars}` : "";
  const resp = await apiRequest("GET",
    `/api/correlation/pairwise?a=${encodeURIComponent(specA)}&b=${encodeURIComponent(specB)}&window=${window}&mode=${mode}${extra}&freq=${opts.freq ?? "daily"}${lag}`
  );
  return resp.json();
}

export async function fetchMatrixCorrelation(
  specs: string[], mode: string, window: string | number, opts: MatrixOpts = {}
): Promise<MatrixResult> {
  specs = await Promise.all(specs.map((s) => translateDefaultSpec(s)));
  if (isStaticMode()) {
    return computeMatrixStatic(specs, mode, String(window), opts);
  }
  const lag = opts.lagBars ? `&lag=${opts.lagBars}` : "";
  const resp = await apiRequest("GET",
    `/api/correlation/matrix?series=${specs.map(s => encodeURIComponent(s)).join(",")}&mode=${mode}&window=${window}${lag}`
  );
  return resp.json();
}
