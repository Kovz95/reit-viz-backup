// Recovered from recovered-bundle/SimilarSetups-B0jnj8dI.js,
// recovered-bundle/SetupsScreener-BjAZdHTT.js, and index-CsG73Aq_.js
//
// Export map from similarSetupsAlgorithms-CYRAhj-A.js (inferred from import aliases):
//   D = defaultFeatures
//   F = featurePresets
//   A = algoMeta
//   a = algoKeys
//   b = featureKeys
//   T = featureMeta  (time-dimension features — populated below)
//   c = computeFeatures
//   d = computeTimeDim
//   e = (featurePresets index / internal)
//   r = dispatchAlgo

// ── Feature definitions ───────────────────────────────────────────────────────

export interface FeatureDef {
  id: string;
  label: string;
  description?: string;
  category?: string;
  requiresVolume?: boolean;
  requiresBench?: boolean;
  [key: string]: any;
}

export interface AlgoDef {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  [key: string]: any;
}

// ── Technical feature metadata ─────────────────────────────────────────────
// Recovered from const `Ah` in index-CsG73Aq_.js (line 118067)
const TECHNICAL_FEATURE_META: Record<string, FeatureDef> = {
  price_z_60: {
    id: "price_z_60",
    label: "Price z (60d)",
    category: "Oscillator",
    description: "Z-score of log close over a 60-day window. Price reverts toward 60d mean.",
  },
  dist_200ma: {
    id: "dist_200ma",
    label: "% from 200MA",
    category: "MA Distance",
    description: "Percent distance from 200-day SMA. Price reverts toward long-term trend.",
  },
  dist_50ma: {
    id: "dist_50ma",
    label: "% from 50MA",
    category: "MA Distance",
    description: "Percent distance from 50-day SMA. Faster mean-reversion than 200MA.",
  },
  rsi14: {
    id: "rsi14",
    label: "RSI(14)",
    category: "Oscillator",
    description: "14-day RSI — canonical momentum / exhaustion oscillator. Reverts toward 50.",
  },
  bb_pctb_20: {
    id: "bb_pctb_20",
    label: "Bollinger %B(20)",
    category: "Oscillator",
    description: "Position within 20-day Bollinger Bands (0=lower, 0.5=mid, 1=upper).",
  },
  expanding_pct: {
    id: "expanding_pct",
    label: "Percentile (all-time)",
    category: "Distribution",
    description: "Expanding rank of close (0..100). Captures multi-year extremes.",
  },
  ma_50_200_regime: {
    id: "ma_50_200_regime",
    label: "MA(50/200) regime",
    category: "Trend",
    description: "Above 50MA AND above 200MA → bullish regime (continuation, not fade).",
  },
  roc_20: {
    id: "roc_20",
    label: "ROC(20d)",
    category: "Momentum",
    description: "20-day rate of change. Positive ROC tends to persist short-term.",
  },
  roc_60: {
    id: "roc_60",
    label: "ROC(60d)",
    category: "Momentum",
    description: "60-day rate of change. Captures intermediate-term momentum.",
  },
  macd_hist_sign: {
    id: "macd_hist_sign",
    label: "MACD histogram sign",
    category: "Momentum",
    description: "Sign of MACD histogram (12,26,9). Positive = bullish momentum.",
  },
  atr_pct_percentile: {
    id: "atr_pct_percentile",
    label: "ATR% percentile",
    category: "Volatility",
    description: "Percentile of ATR(14) / close. High = volatile / often near a turning point.",
    requiresVolume: false,
  },
  vol30: {
    id: "vol30",
    label: "Realized vol (30d)",
    category: "Volatility",
    description: "Annualised 30-day realised volatility of log-returns.",
  },
  ret20: {
    id: "ret20",
    label: "Return (20d)",
    category: "Momentum",
    description: "20-day price return.",
  },
  ret63: {
    id: "ret63",
    label: "Return (63d)",
    category: "Momentum",
    description: "63-day (3M) price return.",
  },
  dist_sma50: {
    id: "dist_sma50",
    label: "% from SMA50",
    category: "MA Distance",
    description: "Distance from 50-day simple moving average.",
  },
  dist_sma200: {
    id: "dist_sma200",
    label: "% from SMA200",
    category: "MA Distance",
    description: "Distance from 200-day simple moving average.",
  },
  rel_to_spy_20: {
    id: "rel_to_spy_20",
    label: "Rel return vs SPY (20d)",
    category: "Cross-Sectional",
    description: "20-day return of the ticker minus SPY 20-day return.",
    requiresBench: true,
  },
  rel_to_spy_60: {
    id: "rel_to_spy_60",
    label: "Rel return vs SPY (60d)",
    category: "Cross-Sectional",
    description: "60-day return of the ticker minus SPY 60-day return.",
    requiresBench: true,
  },
};

// ── Time-dimension feature metadata ────────────────────────────────────────
// Recovered from export T (ae) in SimilarSetups bundle
// These are "time" features computed from the date array rather than price array.
const TIME_FEATURE_META: Record<string, FeatureDef> = {
  day_of_year: {
    id: "day_of_year",
    label: "Day of year (seasonal)",
    category: "Time",
    description: "Normalised day-of-year (0..1). Captures seasonality.",
  },
  month_sin: {
    id: "month_sin",
    label: "Month sin",
    category: "Time",
    description: "Sine of (month / 12 * 2π). Smooth cyclic encoding of the month.",
  },
  month_cos: {
    id: "month_cos",
    label: "Month cos",
    category: "Time",
    description: "Cosine of (month / 12 * 2π). Smooth cyclic encoding of the month.",
  },
};

/** Metadata for each feature key (technical). */
export const featureMeta: Record<string, FeatureDef> = {
  ...TECHNICAL_FEATURE_META,
  ...TIME_FEATURE_META,
};

/** All technical feature key strings. */
export const featureKeys: string[] = Object.keys(TECHNICAL_FEATURE_META);

/** Default set of feature IDs to use for similarity matching.
 * Recovered from export D (Ze) — smaDist50/200, ret20/63, vol30, rsi14 */
export const defaultFeatures: string[] = [
  "dist_sma50",
  "dist_sma200",
  "ret20",
  "ret63",
  "vol30",
  "rsi14",
];

/** Named feature presets (e.g. "Momentum", "Mean-Reversion").
 * Recovered from export F (oe) used in consensus loops in SimilarSetups bundle. */
export const featurePresets: Record<string, string[]> = {
  "Classic (6)": ["dist_sma50", "dist_sma200", "ret20", "ret63", "vol30", "rsi14"],
  "Mean-Reversion": ["price_z_60", "dist_200ma", "dist_50ma", "rsi14", "bb_pctb_20", "expanding_pct"],
  "Momentum": ["ma_50_200_regime", "roc_20", "roc_60", "macd_hist_sign", "ret20", "ret63"],
  "Volatility": ["atr_pct_percentile", "vol30", "price_z_60"],
  "Trend + Momentum": ["ma_50_200_regime", "roc_60", "dist_200ma", "macd_hist_sign"],
  "Broad (all)": Object.keys(TECHNICAL_FEATURE_META),
};

// ── Algorithm metadata ─────────────────────────────────────────────────────
// Recovered from export A (Se) and a (Ft) — algoMeta and algoKeys.
// Keys confirmed from SimilarSetups bundle: "knn", "dtw", "kernel", "regime".
export const algoMeta: Record<string, AlgoDef> = {
  knn: {
    id: "knn",
    label: "KNN Euclidean",
    description: "K-nearest neighbours by Euclidean distance in z-score feature space.",
    tooltip: "Find the N most similar historical bars by Euclidean distance. Fast and robust.",
  },
  knn_cosine: {
    id: "knn_cosine",
    label: "KNN Cosine",
    description: "K-nearest neighbours by cosine similarity in z-score feature space.",
    tooltip: "Find similar bars by the angle between feature vectors. Less sensitive to magnitude.",
  },
  dtw: {
    id: "dtw",
    label: "DTW",
    description: "Dynamic Time Warping on recent log-return trajectory.",
    tooltip: "Match based on the shape of recent log-return path. Slower; uses dtwWindow parameter.",
  },
  kernel: {
    id: "kernel",
    label: "Kernel (Gaussian)",
    description: "Gaussian kernel similarity — all bars weighted by exp(-d²/2h²).",
    tooltip: "Soft weighting of all bars by Gaussian kernel. Controls bandwidth h (auto or manual).",
  },
  regime: {
    id: "regime",
    label: "K-Means Regime",
    description: "Cluster all bars into K regimes; match bars in the same cluster.",
    tooltip: "K-means cluster the feature space; find matches in the same cluster as today.",
  },
};

/** All algorithm key strings. */
export const algoKeys: string[] = Object.keys(algoMeta);

// ── Compute functions ──────────────────────────────────────────────────────

export interface FeatureComputeInput {
  closes: number[];
  highs?: number[];
  lows?: number[];
  volumes?: number[];
  dates?: string[];
  fundamentals?: Record<string, (number | null)[]>;
  benchCloses?: number[];
  opens?: number[];
  [key: string]: any;
}

export interface FeatureVector {
  date: string;
  features: Record<string, number | null>;
}

// ── Internal math helpers ──────────────────────────────────────────────────

function sma(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= period) sum -= arr[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(arr: number[], period: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += arr[i];
  out[period - 1] = sum / period;
  for (let i = period; i < arr.length; i++) {
    out[i] = arr[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

function rsi14(closes: number[]): number[] {
  const out = new Array(closes.length).fill(NaN);
  if (closes.length < 15) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= 14; avgLoss /= 14;
  out[14] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function bollingerPctB(closes: number[], period = 20, mult = 2): number[] {
  const out = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0, ss = 0;
    for (let j = i - period + 1; j <= i; j++) { s += closes[j]; ss += closes[j] ** 2; }
    const m = s / period, sigma = Math.sqrt(Math.max(0, ss / period - m * m));
    if (sigma === 0) { out[i] = 0.5; continue; }
    const upper = m + mult * sigma, lower = m - mult * sigma;
    out[i] = (closes[i] - lower) / (upper - lower);
  }
  return out;
}

function expandingPercentile(closes: number[]): number[] {
  const out = new Array(closes.length).fill(NaN);
  const sorted: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    // Binary search insertion
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; sorted[mid] <= closes[i] ? (lo = mid + 1) : (hi = mid); }
    sorted.splice(lo, 0, closes[i]);
    out[i] = (lo + 1) / sorted.length * 100;
  }
  return out;
}

function roc(closes: number[], period: number): number[] {
  const out = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    if (closes[i - period] > 0) out[i] = (closes[i] - closes[i - period]) / closes[i - period] * 100;
  }
  return out;
}

function macdHistSign(closes: number[]): number[] {
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const macdLine = closes.map((_, i) => e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null);
  // 9-bar EMA of MACD
  const signal = new Array(closes.length).fill(null);
  let s = 2 / 10, prev: number | null = null;
  for (let i = 0; i < macdLine.length; i++) {
    const v = macdLine[i];
    if (v == null) { prev = null; continue; }
    if (prev == null) { prev = v; continue; }
    prev = v * s + prev * (1 - s);
    signal[i] = v - prev;
  }
  return signal.map((v) => v == null ? NaN : v > 0 ? 1 : v < 0 ? -1 : 0);
}

function ma50200Regime(closes: number[]): number[] {
  const ma50 = sma(closes, 50), ma200 = sma(closes, 200);
  return closes.map((c, i) => {
    const s50 = ma50[i], s200 = ma200[i];
    if (s50 == null || s200 == null) return NaN;
    if (c > s50 && c > s200 && s50 > s200) return 1;
    if (c < s50 && c < s200 && s50 < s200) return -1;
    return 0;
  });
}

function atrPercentile(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const tr = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i] ?? closes[i], l = lows[i] ?? closes[i], prev = closes[i - 1];
    tr[i] = Math.max(h - l, Math.abs(h - prev), Math.abs(l - prev));
  }
  // Wilder's ATR
  const atr = new Array(closes.length).fill(NaN);
  let a = 0;
  for (let i = 1; i <= period; i++) a += tr[i] || 0;
  atr[period] = a / period;
  for (let i = period + 1; i < closes.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + (tr[i] || 0)) / period;
  }
  // ATR% = ATR / close
  const atrPct = closes.map((c, i) => atr[i] != null && c > 0 ? atr[i] / c * 100 : NaN);
  // Expanding percentile
  const out = new Array(closes.length).fill(NaN);
  const sorted: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const v = atrPct[i];
    if (!Number.isFinite(v)) { out[i] = NaN; continue; }
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; sorted[mid] <= v ? (lo = mid + 1) : (hi = mid); }
    sorted.splice(lo, 0, v);
    out[i] = (lo + 1) / sorted.length * 100;
  }
  return out;
}

function rolledVol(closes: number[], period = 30): number[] {
  const logRet = new Array(closes.length).fill(NaN);
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) logRet[i] = Math.log(closes[i] / closes[i - 1]);
  }
  const out = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    let s = 0, count = 0;
    for (let j = i - period + 1; j <= i; j++) { if (Number.isFinite(logRet[j])) { s += logRet[j]; count++; } }
    if (count < period) continue;
    const m = s / count;
    let ss = 0;
    for (let j = i - period + 1; j <= i; j++) { if (Number.isFinite(logRet[j])) ss += (logRet[j] - m) ** 2; }
    out[i] = Math.sqrt(ss / count * 252);
  }
  return out;
}

function priceZ60(closes: number[]): number[] {
  // Z-score of log close over 60-bar rolling window
  const logC = closes.map((c) => (c > 0 ? Math.log(c) : NaN));
  const out = new Array(closes.length).fill(NaN);
  for (let i = 59; i < closes.length; i++) {
    let s = 0, ss = 0, count = 0;
    for (let j = i - 59; j <= i; j++) {
      const v = logC[j];
      if (Number.isFinite(v)) { s += v; ss += v * v; count++; }
    }
    if (count !== 60) continue;
    const m = s / 60, variance = Math.max(0, ss / 60 - m * m), sd = Math.sqrt(variance);
    out[i] = sd === 0 ? 0 : (logC[i] - m) / sd;
  }
  return out;
}

function distFromMA(closes: number[], period: number): number[] {
  const ma = sma(closes, period);
  return closes.map((c, i) => {
    const m = ma[i];
    return m != null && m > 0 ? (c - m) / m * 100 : NaN;
  });
}

function relReturn(tickerCloses: number[], benchCloses: number[], period: number): number[] {
  const out = new Array(tickerCloses.length).fill(NaN);
  for (let i = period; i < tickerCloses.length; i++) {
    const tp = tickerCloses[i - period], tc = tickerCloses[i];
    const bp = benchCloses[i - period], bc = benchCloses[i];
    if (!(tp > 0 && tc > 0 && bp > 0 && bc > 0)) continue;
    out[i] = (tc / tp - 1) * 100 - (bc / bp - 1) * 100;
  }
  return out;
}

/**
 * Compute feature vectors for each bar in the price/fundamental series.
 * Recovered from function `Ne` / `Ct` (computeFeatures) in SimilarSetups bundle.
 *
 * In the bundle this is called as:
 *   computeFeatures(enabledFeatureKeys: string[], priceCtx: { closes, highs, lows, opens, volumes, benchCloses })
 *
 * Returns a Record<featureId, number[]> (one array per feature, aligned to closes.length).
 */
export function computeFeatures(
  _input: FeatureComputeInput | string[],
  _featureIds?: any
): FeatureVector[] | Record<string, number[]> {
  // Support dual calling convention:
  //   computeFeatures(featureIds: string[], priceCtx: FeatureComputeInput)  ← bundle form
  //   computeFeatures(priceCtx: FeatureComputeInput, featureIds: string[])  ← TypeScript stub form
  let featureIds: string[];
  let ctx: FeatureComputeInput;

  if (Array.isArray(_input)) {
    featureIds = _input as string[];
    ctx = _featureIds as FeatureComputeInput;
  } else {
    ctx = _input as FeatureComputeInput;
    featureIds = Array.isArray(_featureIds) ? _featureIds : featureKeys;
  }

  if (!ctx || !ctx.closes || ctx.closes.length === 0) return {};

  const closes = ctx.closes;
  const highs = ctx.highs ?? closes;
  const lows = ctx.lows ?? closes;
  const bench = ctx.benchCloses;
  const result: Record<string, number[]> = {};

  for (const fid of featureIds) {
    switch (fid) {
      case "price_z_60":
        result[fid] = priceZ60(closes);
        break;
      case "dist_200ma":
      case "dist_sma200":
        result[fid] = distFromMA(closes, 200);
        break;
      case "dist_50ma":
      case "dist_sma50":
        result[fid] = distFromMA(closes, 50);
        break;
      case "rsi14":
        result[fid] = rsi14(closes);
        break;
      case "bb_pctb_20":
        result[fid] = bollingerPctB(closes, 20, 2);
        break;
      case "expanding_pct":
        result[fid] = expandingPercentile(closes);
        break;
      case "ma_50_200_regime":
        result[fid] = ma50200Regime(closes);
        break;
      case "roc_20":
      case "ret20":
        result[fid] = roc(closes, 20);
        break;
      case "roc_60":
      case "ret63":
        result[fid] = roc(closes, 63);
        break;
      case "macd_hist_sign":
        result[fid] = macdHistSign(closes);
        break;
      case "atr_pct_percentile":
        result[fid] = atrPercentile(highs, lows, closes, 14);
        break;
      case "vol30":
        result[fid] = rolledVol(closes, 30);
        break;
      case "rel_to_spy_20":
        result[fid] = bench ? relReturn(closes, bench, 20) : new Array(closes.length).fill(NaN);
        break;
      case "rel_to_spy_60":
        result[fid] = bench ? relReturn(closes, bench, 60) : new Array(closes.length).fill(NaN);
        break;
      default:
        result[fid] = new Array(closes.length).fill(NaN);
    }
  }

  return result;
}

/**
 * Compute time-dimension features from a date array.
 * Recovered from function `$t` (computeTimeDim) in SimilarSetups bundle.
 * Returns a Record<featureId, number[]> aligned to times.length.
 */
export function computeTimeDim(
  _vectors: FeatureVector[] | string[],
  _options?: Record<string, any>
): number[][] | Record<string, number[]> {
  // Bundle calling convention: computeTimeDim(times: string[]) → Record<featureId, number[]>
  if (!Array.isArray(_vectors) || _vectors.length === 0) return {};

  // If the first element is a string, treat as times array (bundle convention)
  if (typeof _vectors[0] === "string") {
    const times = _vectors as string[];
    const n = times.length;
    const dayOfYear = new Array(n).fill(NaN);
    const monthSin = new Array(n).fill(NaN);
    const monthCos = new Array(n).fill(NaN);
    const TWO_PI = 2 * Math.PI;
    for (let i = 0; i < n; i++) {
      const dateStr = times[i];
      if (!dateStr || dateStr.length < 10) continue;
      try {
        const d = new Date(dateStr + "T00:00:00Z");
        const month = d.getUTCMonth() + 1; // 1..12
        const dayNum = Math.floor((d.getTime() - new Date(d.getUTCFullYear(), 0, 1).getTime()) / 86400000) + 1;
        const daysInYear = (d.getUTCFullYear() % 4 === 0) ? 366 : 365;
        dayOfYear[i] = dayNum / daysInYear;
        monthSin[i] = Math.sin(TWO_PI * month / 12);
        monthCos[i] = Math.cos(TWO_PI * month / 12);
      } catch {
        // skip
      }
    }
    return { day_of_year: dayOfYear, month_sin: monthSin, month_cos: monthCos } as any;
  }

  // FeatureVector[] path — return flat 2-D array of feature values
  return (_vectors as FeatureVector[]).map((fv) => Object.values(fv.features).map((v) => v ?? NaN));
}

// ── AlgoInput / AlgoResult types ─────────────────────────────────────────────

export interface AlgoInput {
  queryVector: Record<string, number | null>;
  candidates: FeatureVector[];
  algoKey: string;
  topK?: number;
  // Bundle form — direct bar access
  bars?: Array<{ date: string; closeIdx: number; zVec: number[]; fwd1M: number; fwd3M: number; fwd6M: number; fwd1Y: number }>;
  todayZ?: number[];
  n?: number;
  closes?: number[];
  lastIdx?: number;
  dtwWindow?: number;
  kernelH?: number;
  regimeK?: number;
  [key: string]: any;
}

export interface AlgoMatch {
  date: string;
  distance: number;
  weight: number;
  zVec?: number[];
  fwd1M?: number;
  fwd3M?: number;
  fwd6M?: number;
  fwd1Y?: number;
  [key: string]: any;
}

export interface AlgoResult {
  matches: AlgoMatch[];
  info: Record<string, any>;
}

// ── Distance helpers ──────────────────────────────────────────────────────────

function euclideanDist(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function cosineDist(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 1 : 1 - dot / denom;
}

/**
 * DTW distance between two 1-D sequences (Sakoe-Chiba band).
 */
function dtwDist(seqA: number[], seqB: number[], windowSize: number): number {
  const n = seqA.length, m = seqB.length;
  if (n === 0 || m === 0) return Infinity;
  const INF = Infinity;
  const prev = new Float64Array(m + 1).fill(INF);
  const curr = new Float64Array(m + 1).fill(INF);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    curr.fill(INF);
    const jLo = Math.max(1, i - windowSize);
    const jHi = Math.min(m, i + windowSize);
    for (let j = jLo; j <= jHi; j++) {
      const cost = (seqA[i - 1] - seqB[j - 1]) ** 2;
      curr[j] = cost + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.set(curr);
  }
  return Math.sqrt(prev[m]);
}

/**
 * Simple k-means (Euclidean, in-place) on zVec rows.
 * Returns cluster labels for each row (0..K-1).
 */
function kmeans(rows: number[][], k: number, maxIter = 50): number[] {
  if (rows.length === 0) return [];
  const n = rows.length, dim = rows[0].length;
  // Init centroids = first K rows
  const centroids: number[][] = rows.slice(0, k).map((r) => r.slice());
  const labels = new Array(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    // Assign
    for (let i = 0; i < n; i++) {
      let best = 0, bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = euclideanDist(rows[i], centroids[c]);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    if (!changed) break;
    // Recompute centroids
    const sums: number[][] = Array.from({ length: k }, () => new Array(dim).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      counts[labels[i]]++;
      for (let d = 0; d < dim; d++) sums[labels[i]][d] += rows[i][d];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dim; d++) centroids[c][d] = sums[c][d] / counts[c];
      }
    }
  }
  return labels;
}

/**
 * Dispatch the selected similarity algorithm to find the top-K matching setups.
 *
 * Recovered from function `Lt` (dispatchAlgo / r) in SimilarSetups bundle.
 * Called as: dispatchAlgo(algoKey: string, input: AlgoInput)
 *   where input contains { bars, todayZ, n, closes, lastIdx, dtwWindow, kernelH, regimeK }
 *
 * Algorithms recovered:
 *   knn         — KNN Euclidean (confirmed key in SetupsScreener/SimilarSetups bundle)
 *   knn_cosine  — KNN Cosine
 *   dtw         — DTW on recent log-return trajectory
 *   kernel      — Gaussian kernel weighting
 *   regime      — K-Means Regime clustering
 */
export function dispatchAlgo(_inputOrKey: AlgoInput | string, _optsOrInput?: any): AlgoResult {
  // Support both calling conventions:
  //   dispatchAlgo(algoKey: string, input: AlgoInput)  ← bundle convention
  //   dispatchAlgo(input: AlgoInput)                    ← TypeScript stub convention
  let algoKey: string;
  let input: AlgoInput;
  if (typeof _inputOrKey === "string") {
    algoKey = _inputOrKey;
    input = _optsOrInput as AlgoInput;
  } else {
    input = _inputOrKey as AlgoInput;
    algoKey = input.algoKey;
  }

  if (!input) return { matches: [], info: {} };

  // Bundle calling convention uses { bars, todayZ, n, ... }
  const bars = input.bars;
  const todayZ = input.todayZ;
  const topN = input.n ?? input.topK ?? 20;

  if (bars && todayZ) {
    return dispatchBundleAlgo(algoKey, bars, todayZ, topN, input);
  }

  // Fallback: FeatureVector candidate mode
  if (!input.candidates || input.candidates.length === 0) {
    return { matches: [], info: { algo: algoKey, candidates: 0 } };
  }
  const queryVec = input.queryVector
    ? Object.values(input.queryVector).map((v) => v ?? NaN)
    : [];
  const candidates = input.candidates;
  const matches: AlgoMatch[] = candidates
    .map((c) => {
      const cvec = Object.values(c.features).map((v) => v ?? NaN);
      const dist = (algoKey === "knn_cosine") ? cosineDist(queryVec, cvec) : euclideanDist(queryVec, cvec);
      return { date: c.date, distance: dist, weight: 1 / (1 + dist) };
    })
    .filter((m) => Number.isFinite(m.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topN);

  return { matches, info: { algo: algoKey } };
}

/**
 * Bundle form dispatch — works directly on pre-computed zVec bar arrays.
 * This is the primary path used by SimilarSetups and SetupsScreener.
 */
function dispatchBundleAlgo(
  algoKey: string,
  bars: NonNullable<AlgoInput["bars"]>,
  todayZ: number[],
  topN: number,
  input: AlgoInput
): AlgoResult {
  const n = bars.length;
  if (n === 0) return { matches: [], info: { algo: algoKey, candidates: 0 } };

  switch (algoKey) {
    // ── KNN Euclidean ──────────────────────────────────────────────────────
    case "knn":
    case "knn_euclidean": {
      const dists = bars.map((b) => ({
        bar: b,
        dist: euclideanDist(todayZ, b.zVec),
      }));
      dists.sort((a, b) => a.dist - b.dist);
      const top = dists.slice(0, topN);
      const maxDist = top[top.length - 1]?.dist ?? 1;
      const matches: AlgoMatch[] = top.map(({ bar, dist }) => ({
        ...bar,
        distance: dist,
        weight: maxDist > 0 ? 1 - dist / (maxDist + 1e-9) : 1,
      }));
      return { matches, info: `knn-euclidean top-${topN} of ${n}` as any };
    }

    // ── KNN Cosine ────────────────────────────────────────────────────────
    case "knn_cosine": {
      const dists = bars.map((b) => ({
        bar: b,
        dist: cosineDist(todayZ, b.zVec),
      }));
      dists.sort((a, b) => a.dist - b.dist);
      const top = dists.slice(0, topN);
      const maxDist = top[top.length - 1]?.dist ?? 1;
      const matches: AlgoMatch[] = top.map(({ bar, dist }) => ({
        ...bar,
        distance: dist,
        weight: maxDist > 0 ? 1 - dist / (maxDist + 1e-9) : 1,
      }));
      return { matches, info: `knn-cosine top-${topN} of ${n}` as any };
    }

    // ── DTW (log-return trajectory) ───────────────────────────────────────
    case "dtw": {
      const closes = input.closes ?? [];
      const lastIdx = input.lastIdx ?? (closes.length - 1);
      const window = input.dtwWindow ?? 60;
      if (closes.length < window || lastIdx < window) {
        return { matches: [], info: `dtw: insufficient bars (${closes.length})` as any };
      }
      // Build query trajectory (log returns over window)
      const qTraj: number[] = [];
      for (let i = lastIdx - window + 1; i <= lastIdx; i++) {
        if (i > 0 && closes[i - 1] > 0 && closes[i] > 0) {
          qTraj.push(Math.log(closes[i] / closes[i - 1]));
        } else {
          qTraj.push(0);
        }
      }
      // For each bar, build its trajectory and compute DTW distance
      const dists = bars
        .filter((b) => b.closeIdx >= window)
        .map((b) => {
          const traj: number[] = [];
          for (let i = b.closeIdx - window + 1; i <= b.closeIdx; i++) {
            if (i > 0 && closes[i - 1] > 0 && closes[i] > 0) {
              traj.push(Math.log(closes[i] / closes[i - 1]));
            } else {
              traj.push(0);
            }
          }
          return { bar: b, dist: dtwDist(qTraj, traj, Math.floor(window / 4)) };
        });
      dists.sort((a, b) => a.dist - b.dist);
      const top = dists.slice(0, topN);
      const maxDist = top[top.length - 1]?.dist ?? 1;
      const matches: AlgoMatch[] = top.map(({ bar, dist }) => ({
        ...bar,
        distance: dist,
        weight: maxDist > 0 ? 1 - dist / (maxDist + 1e-9) : 1,
      }));
      return { matches, info: `dtw top-${topN} of ${dists.length}` as any };
    }

    // ── Gaussian Kernel ───────────────────────────────────────────────────
    case "kernel": {
      // Auto-bandwidth: median of pairwise distances to today
      const dists = bars.map((b) => euclideanDist(todayZ, b.zVec));
      let h = input.kernelH ?? NaN;
      if (!Number.isFinite(h) || h <= 0) {
        // Use median distance as bandwidth
        const sorted = dists.filter(Number.isFinite).slice().sort((a, b) => a - b);
        h = sorted[Math.floor(sorted.length / 2)] ?? 1;
        if (h <= 0) h = 1;
      }
      const h2 = 2 * h * h;
      const weighted = bars.map((b, i) => ({
        bar: b,
        dist: dists[i],
        weight: Math.exp(-(dists[i] ** 2) / h2),
      }));
      // Filter zero-weight and sort by weight descending, take topN
      const meaningful = weighted.filter((w) => w.weight > 1e-9);
      meaningful.sort((a, b) => b.weight - a.weight);
      const top = meaningful.slice(0, topN);
      const matches: AlgoMatch[] = top.map(({ bar, dist, weight }) => ({
        ...bar,
        distance: dist,
        weight,
      }));
      return { matches, info: `kernel h=${h.toFixed(3)} top-${topN} of ${n}` as any };
    }

    // ── K-Means Regime ────────────────────────────────────────────────────
    case "regime": {
      const k = input.regimeK ?? 5;
      const rows = bars.map((b) => b.zVec);
      const labels = kmeans(rows, k);
      // Find today's cluster
      let todayCluster = 0;
      let minDist = Infinity;
      // Compute centroid for each cluster
      const dim = todayZ.length;
      const sums: number[][] = Array.from({ length: k }, () => new Array(dim).fill(0));
      const counts = new Array(k).fill(0);
      for (let i = 0; i < labels.length; i++) {
        counts[labels[i]]++;
        for (let d = 0; d < dim; d++) sums[labels[i]][d] += rows[i][d];
      }
      const centroids = sums.map((s, ci) => counts[ci] > 0 ? s.map((v) => v / counts[ci]) : s);
      for (let ci = 0; ci < k; ci++) {
        const d = euclideanDist(todayZ, centroids[ci]);
        if (d < minDist) { minDist = d; todayCluster = ci; }
      }
      const clusterBars = bars.filter((_, i) => labels[i] === todayCluster);
      const dists = clusterBars.map((b) => ({
        bar: b,
        dist: euclideanDist(todayZ, b.zVec),
      }));
      dists.sort((a, b) => a.dist - b.dist);
      const top = dists.slice(0, topN);
      const maxDist = top[top.length - 1]?.dist ?? 1;
      const matches: AlgoMatch[] = top.map(({ bar, dist }) => ({
        ...bar,
        distance: dist,
        weight: maxDist > 0 ? 1 - dist / (maxDist + 1e-9) : 1,
      }));
      return {
        matches,
        info: `regime k=${k} cluster=${todayCluster} (${clusterBars.length} bars) top-${topN}` as any,
      };
    }

    default: {
      // Fallback: plain Euclidean KNN
      const dists = bars.map((b) => ({ bar: b, dist: euclideanDist(todayZ, b.zVec) }));
      dists.sort((a, b) => a.dist - b.dist);
      const top = dists.slice(0, topN);
      const maxDist = top[top.length - 1]?.dist ?? 1;
      return {
        matches: top.map(({ bar, dist }) => ({
          ...bar,
          distance: dist,
          weight: maxDist > 0 ? 1 - dist / (maxDist + 1e-9) : 1,
        })),
        info: `fallback-knn top-${topN} of ${n} (unknown algo "${algoKey}")` as any,
      };
    }
  }
}
