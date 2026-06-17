/**
 * pairSignalAnalyzer — Single-ticker and pair signal analysis
 *
 * Reverse-engineered from Scanner-d2v1M_Z9.js / Pairs-Sxv9BhcH.js /
 * pairSignalAnalyzer-DF9nOwTp.js.
 *
 * Single-ticker algorithm (analyzeSingleTicker / analyzeTicker):
 *  - Requires ≥ 250 days of {time, value} price data.
 *  - Computes four signals on the close series:
 *      price_z   : rolling 60-bar z-score of log(close)
 *      dist_200ma: (close − SMA200) / SMA200 × 100
 *      rsi14     : 14-bar Wilder RSI
 *      pct       : all-time running percentile rank
 *  - Bins each signal into fixed buckets; computes forward returns (5/10/20/60d)
 *    and a quality score per bucket.
 *  - Returns the best (highest |quality|) bucket across all four signals.
 *
 * Pair algorithm (analyzePairSignals / analyzePairRaw):
 *  - Aligns two price series on overlapping dates; requires ≥ 200 common bars.
 *  - Computes log-ratio = log(priceA / priceB).
 *  - Applies the same z-score / percentile / OLS-residual signals on the ratio.
 *  - Returns best bucket in ratio space with implied individual price targets.
 */

// ---------------------------------------------------------------------------
// Public types (preserved from original stub)
// ---------------------------------------------------------------------------

export interface SingleAnalysisResult {
  ticker: string;
  classification: string;
  currentPrice: number;
  bestSignal: string | null;
  bestSignalValue: number | null;
  bestBucketLabel: string;
  direction: "long_ratio" | "short_ratio" | "neutral" | null;
  quality: number;
  expectedMove20dPct: number | null;
  expectedPrice20d: number | null;
  hit20d: number | null;
  n: number;
  halfLifeDays: number | null;
}

export interface PairAnalysisResult {
  tickerA: string;
  tickerB: string;
  classA: string;
  classB: string;
  ratio: number;
  bestSignal: string | null;
  bestSignalValue: number | null;
  bestBucketLabel: string;
  direction: "long_ratio" | "short_ratio" | "neutral" | null;
  quality: number;
  expectedMove20dPct: number | null;
  expectedRatio20d: number | null;
  expectedAIfBFlat: number | null;
  expectedBIfAFlat: number | null;
  hit20d: number | null;
  n: number;
}

// ---------------------------------------------------------------------------
// Internal types (richer result returned by the raw analysis functions)
// ---------------------------------------------------------------------------

type SignalTypeSingle = "price_z" | "dist_200ma" | "rsi14" | "pct";
type SignalTypePair   = "raw_z" | "ols_z" | "spread_z" | "pct";

interface BucketRow {
  signal: string;
  label: string;
  low: number;
  high: number;
  n: number;
  avg_5d: number | null;
  hit_5d: number | null;
  avg_10d: number | null;
  hit_10d: number | null;
  avg_20d: number | null;
  hit_20d: number | null;
  avg_60d: number | null;
  hit_60d: number | null;
  quality: number;
  priceLevelLow: number | null;
  priceLevelHigh: number | null;
  ratioLevelLow?: number | null;
  ratioLevelHigh?: number | null;
}

/** Raw result from single-ticker analysis (richer than the flattened SingleAnalysisResult). */
export interface SingleSignalRawResult {
  ticker: string;
  firstDate: string;
  lastDate: string;
  n: number;
  currentPrice: number;
  currentSignals: Array<{ signal: SignalTypeSingle; value: number | null }>;
  buckets: Record<SignalTypeSingle, BucketRow[]>;
  bestNow: {
    signal: SignalTypeSingle;
    bucket: BucketRow;
    currentSignalValue: number;
    direction: "long_ratio" | "short_ratio" | "neutral";
    expectedMove20dPct: number;
    expectedPrice20d: number;
    rationale: string;
  } | null;
  halfLifeDays: number | null;
}

/** Raw result from pair analysis (richer than the flattened PairAnalysisResult). */
export interface PairSignalRawResult {
  tickerA: string;
  tickerB: string;
  firstDate: string;
  lastDate: string;
  n: number;
  currentA: number;
  currentB: number;
  currentRatio: number;
  currentSignals: Array<{ signal: SignalTypePair; value: number | null }>;
  buckets: Record<SignalTypePair, BucketRow[]>;
  bestNow: {
    signal: SignalTypePair;
    bucket: BucketRow;
    currentSignalValue: number;
    /**
     * "long" = buy the ratio (long A / short B),
     * "short" = sell the ratio (short A / long B),
     * "neutral" = flat.
     */
    direction: "long_ratio" | "short_ratio" | "neutral";
    expectedMove20dPct: number;
    expectedRatio20d: number;
    expectedAPrice20dIfBHolds: number;
    expectedBPrice20dIfAHolds: number;
    rationale: string;
  } | null;
  halfLifeDays: number | null;
}

// ---------------------------------------------------------------------------
// Bin definitions
// ---------------------------------------------------------------------------

const ZSCORE_BINS: [number, number, string][] = [
  [-Infinity, -2.5, "z ≤ −2.5"],
  [-2.5, -2, "−2.5 < z ≤ −2.0"],
  [-2, -1.5, "−2.0 < z ≤ −1.5"],
  [-1.5, -1, "−1.5 < z ≤ −1.0"],
  [-1, -0.5, "−1.0 < z ≤ −0.5"],
  [-0.5, 0.5, "−0.5 < z ≤ +0.5"],
  [0.5, 1, "+0.5 < z ≤ +1.0"],
  [1, 1.5, "+1.0 < z ≤ +1.5"],
  [1.5, 2, "+1.5 < z ≤ +2.0"],
  [2, 2.5, "+2.0 < z ≤ +2.5"],
  [2.5, Infinity, "z > +2.5"],
];

const DIST200_BINS: [number, number, string][] = [
  [-Infinity, -30, "≤ −30%"],
  [-30, -20, "−30% to −20%"],
  [-20, -10, "−20% to −10%"],
  [-10, -5, "−10% to −5%"],
  [-5, 0, "−5% to 0%"],
  [0, 5, "0% to +5%"],
  [5, 10, "+5% to +10%"],
  [10, 20, "+10% to +20%"],
  [20, 30, "+20% to +30%"],
  [30, Infinity, "≥ +30%"],
];

const RSI_BINS: [number, number, string][] = [
  [0, 20, "0–20 (extreme oversold)"],
  [20, 30, "20–30 (oversold)"],
  [30, 40, "30–40 (weak)"],
  [40, 50, "40–50 (mild weak)"],
  [50, 60, "50–60 (mild strong)"],
  [60, 70, "60–70 (strong)"],
  [70, 80, "70–80 (overbought)"],
  [80, 100.0001, "80–100 (extreme overbought)"],
];

const PCT_BINS: [number, number, string][] = [
  [0, 5, "0–5 pct"],
  [5, 10, "5–10 pct"],
  [10, 25, "10–25 pct"],
  [25, 40, "25–40 pct"],
  [40, 60, "40–60 pct"],
  [60, 75, "60–75 pct"],
  [75, 90, "75–90 pct"],
  [90, 95, "90–95 pct"],
  [95, 100.0001, "95–100 pct"],
];

const HORIZON_DAYS = [5, 10, 20, 60] as const;
const Z_WINDOW = 60;

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/** Rolling z-score of `values` over `window` bars. */
function rollingZScore(values: number[], window: number): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  for (let i = window - 1; i < values.length; i++) {
    let sum = 0, sum2 = 0, cnt = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const v = values[j];
      if (v == null || !isFinite(v)) { cnt = 0; break; }
      sum += v; sum2 += v * v; cnt++;
    }
    if (cnt !== window) continue;
    const mean = sum / window;
    const variance = Math.max(0, sum2 / window - mean * mean);
    const std = Math.sqrt(variance);
    out[i] = std === 0 ? 0 : (values[i] - mean) / std;
  }
  return out;
}

/** Rolling simple mean over `window` bars. */
function rollingMean(values: number[], window: number): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

/** Wilder RSI(period). */
function computeRSI(values: number[], period = 14): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  if (values.length < period + 1) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Running (expanding) percentile rank. */
function computePercentile(values: number[]): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  const sorted: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; sorted[mid] <= values[i] ? lo = mid + 1 : hi = mid; }
    sorted.splice(lo, 0, values[i]);
    out[i] = (lo + 1) / sorted.length * 100;
  }
  return out;
}

/**
 * Estimate AR(1) half-life from a series of z-score values.
 * Returns null if < 60 finite values or if the series shows no mean-reversion.
 */
function computeHalfLife(values: (number | null)[]): number | null {
  const finite = values.filter((v): v is number => v != null && isFinite(v));
  if (finite.length < 60) return null;
  const x = finite.slice(0, -1), y = finite.slice(1);
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) ** 2; }
  const beta = den === 0 ? 0 : num / den;
  if (beta <= 0 || beta >= 1) return null;
  return -Math.log(2) / Math.log(beta);
}

/**
 * Compute per-bucket forward-return statistics.
 *
 * @param signal   - signal type label
 * @param signalValues - per-bar signal value
 * @param closePrices  - per-bar close price (same length)
 * @param bins         - bin definitions [low, high, label]
 */
function computeBuckets(
  signal: string,
  signalValues: (number | null)[],
  closePrices: number[],
  bins: [number, number, string][]
): BucketRow[] {
  const n = closePrices.length;
  const rows: BucketRow[] = [];
  for (const [low, high, label] of bins) {
    const idxs: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = signalValues[i];
      if (v != null && v >= low && v < high) idxs.push(i);
    }
    const midVal = low === -Infinity ? high - 5 : high === Infinity ? low + 5 : (low + high) / 2;
    // For RSI and percentile: midpoint > 50 is "overbought" / mean-reversion expects down
    const isLong = (signal === "rsi14" || signal === "pct") ? midVal > 50 : midVal > 0;
    const row: BucketRow = {
      signal, label, low, high, n: idxs.length,
      avg_5d: null, hit_5d: null,
      avg_10d: null, hit_10d: null,
      avg_20d: null, hit_20d: null,
      avg_60d: null, hit_60d: null,
      quality: 0,
      priceLevelLow: null, priceLevelHigh: null,
    };
    for (const days of HORIZON_DAYS) {
      const rets: number[] = [];
      for (const idx of idxs) {
        if (idx + days >= n || closePrices[idx] <= 0) continue;
        rets.push((closePrices[idx + days] - closePrices[idx]) / closePrices[idx] * 100);
      }
      if (!rets.length) continue;
      const avg = rets.reduce((s, v) => s + v, 0) / rets.length;
      // hitRate: fraction of observations that moved in the mean-reversion direction
      // For long (oversold/below avg): a hit is a positive return
      // For short (overbought/above avg): a hit is a negative return
      const hitRate = rets.filter(v => isLong ? v >= 0 : v < 0).length / rets.length * 100;
      (row as any)[`avg_${days}d`] = avg;
      (row as any)[`hit_${days}d`] = hitRate;
    }
    if (row.avg_20d != null && row.hit_20d != null && row.n >= 20) {
      row.quality = Math.abs(row.avg_20d) * (row.hit_20d - 50) * Math.log10(row.n + 1) / 100;
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Signal label / value formatters (exported for consumer use)
// ---------------------------------------------------------------------------

/** Human-readable label for a signal type. */
export function signalLabel(signal: string): string {
  switch (signal) {
    case "price_z":   return "Price z";
    case "dist_200ma": return "% from 200MA";
    case "rsi14":     return "RSI(14)";
    case "pct":       return "Percentile";
    case "raw_z":     return "Ratio z";
    case "ols_z":     return "OLS resid z";
    case "spread_z":  return "Spread z";
    default:          return signal;
  }
}

/** Formatted value string for a signal type. */
export function signalValueFormat(signal: string, value: number): string {
  if (signal === "rsi14") return value.toFixed(1);
  if (signal === "pct")   return value.toFixed(0);
  if (signal === "dist_200ma") return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

/** Reversion direction label (appended to rationale). */
export function reversionDir(signal: string): string {
  return signal === "rsi14" ? " toward 50" : signal === "pct" ? " toward median" : " toward zero";
}

// ---------------------------------------------------------------------------
// Core single-ticker analysis
// ---------------------------------------------------------------------------

/**
 * Analyse predictive signals for a single ticker from its price series.
 *
 * @param prices - Array of {time: ISO date string, value: close price}
 * @param ticker - Ticker symbol (used in rationale text)
 * @returns Raw analysis result, or null if insufficient data (< 250 bars)
 */
export function analyzeTicker(
  prices: Array<{ time: string; value: number }>,
  ticker: string
): SingleSignalRawResult | null {
  const clean = prices.filter(p => p.value > 0 && isFinite(p.value));
  if (clean.length < 250) return null;

  const vals  = clean.map(p => p.value);
  const logVals = vals.map(v => Math.log(v));
  const dates = clean.map(p => p.time);
  const n = vals.length;
  const lastIdx = n - 1;

  const zScores  = rollingZScore(logVals, Z_WINDOW);
  const ma200    = rollingMean(vals, 200);
  const dist200  = vals.map((v, i) =>
    ma200[i] != null && ma200[i]! > 0 ? (v - ma200[i]!) / ma200[i]! * 100 : null
  );
  const rsi      = computeRSI(vals, 14);
  const pct      = computePercentile(vals);

  const priceZBuckets  = computeBuckets("price_z",   zScores,  vals, ZSCORE_BINS);
  const dist200Buckets = computeBuckets("dist_200ma", dist200,  vals, DIST200_BINS);
  const rsiBuckets     = computeBuckets("rsi14",      rsi,      vals, RSI_BINS);
  const pctBuckets     = computeBuckets("pct",        pct,      vals, PCT_BINS);

  // Compute price-level ranges for z-score buckets
  const curZ = zScores[lastIdx];
  if (curZ != null) {
    const logSlice = logVals.slice(lastIdx - Z_WINDOW + 1, lastIdx + 1);
    const mu = logSlice.reduce((s, v) => s + v, 0) / Z_WINDOW;
    const sigma = Math.sqrt(logSlice.reduce((s, v) => s + (v - mu) ** 2, 0) / Z_WINDOW);
    for (const b of priceZBuckets) {
      const lo = b.low  === -Infinity ? -3.5 : b.low;
      const hi = b.high === Infinity  ?  3.5 : b.high;
      b.priceLevelLow  = Math.exp(mu + lo * sigma);
      b.priceLevelHigh = Math.exp(mu + hi * sigma);
    }
  }
  // Dist-200MA price-level ranges
  const curDist = dist200[lastIdx], curMa200 = ma200[lastIdx];
  if (curDist != null && curMa200 != null) {
    for (const b of dist200Buckets) {
      const lo = b.low  === -Infinity ? -50 : b.low;
      const hi = b.high === Infinity  ?  60 : b.high;
      b.priceLevelLow  = curMa200 * (1 + lo / 100);
      b.priceLevelHigh = curMa200 * (1 + hi / 100);
    }
  }
  // Percentile price-level ranges (via interpolation on sorted prices)
  const sortedVals = [...vals].sort((a, b) => a - b);
  const interpPct = (p: number) => {
    if (p <= 0)   return sortedVals[0];
    if (p >= 100) return sortedVals[sortedVals.length - 1];
    const fi = p / 100 * (sortedVals.length - 1);
    const lo = Math.floor(fi), hi = Math.ceil(fi);
    if (lo === hi) return sortedVals[lo];
    return sortedVals[lo] * (1 - (fi - lo)) + sortedVals[hi] * (fi - lo);
  };
  for (const b of pctBuckets) {
    b.priceLevelLow  = interpPct(b.low);
    b.priceLevelHigh = interpPct(Math.min(b.high, 100));
  }

  const currentSignals: Array<{ signal: SignalTypeSingle; value: number | null }> = [
    { signal: "price_z",    value: zScores[lastIdx] },
    { signal: "dist_200ma", value: dist200[lastIdx] },
    { signal: "rsi14",      value: rsi[lastIdx] },
    { signal: "pct",        value: pct[lastIdx] },
  ];

  const buckets = {
    price_z:    priceZBuckets,
    dist_200ma: dist200Buckets,
    rsi14:      rsiBuckets,
    pct:        pctBuckets,
  };

  // Find best signal
  let bestNow: SingleSignalRawResult["bestNow"] = null;
  let bestQ = -Infinity;

  for (const sig of currentSignals) {
    if (sig.value == null) continue;
    const allBuckets = buckets[sig.signal];
    const b = allBuckets.find(r => sig.value! >= r.low && sig.value! < r.high);
    if (!b || b.n < 20 || b.avg_20d == null) continue;
    if (Math.abs(b.quality) > bestQ) {
      bestQ = Math.abs(b.quality);
      const expectedMove = b.avg_20d;
      const expectedPrice = vals[lastIdx] * (1 + expectedMove / 100);
      const dir: "long_ratio" | "short_ratio" | "neutral" =
        expectedMove > 0.3 ? "long_ratio" : expectedMove < -0.3 ? "short_ratio" : "neutral";
      const hr = b.hit_20d ?? 50;
      const edgeLabel =
        hr >= 55 ? "actionable edge" :
        hr >= 50 ? "marginal edge" :
        "NO edge (coin-flip or worse — do not trade)";
      bestNow = {
        signal: sig.signal,
        bucket: b,
        currentSignalValue: sig.value,
        direction: dir,
        expectedMove20dPct: expectedMove,
        expectedPrice20d: expectedPrice,
        rationale: `${signalLabel(sig.signal)} = ${signalValueFormat(sig.signal, sig.value)} sits in the "${b.label}" bucket. Historically, ${ticker} moved ${expectedMove >= 0 ? "+" : ""}${expectedMove.toFixed(2)}% on average over the next 20 trading days (n=${b.n}, hit ${hr.toFixed(0)}% reverting${reversionDir(sig.signal)}). ${edgeLabel}.`,
      };
    }
  }

  return {
    ticker,
    firstDate: dates[0],
    lastDate:  dates[lastIdx],
    n,
    currentPrice: vals[lastIdx],
    currentSignals,
    buckets,
    bestNow,
    halfLifeDays: computeHalfLife(zScores),
  };
}

// ---------------------------------------------------------------------------
// Core pair analysis
// ---------------------------------------------------------------------------

/**
 * Analyse pair (A/B ratio) signals from two aligned price series.
 *
 * @param pricesA - Array of {time: ISO date, value: close} for ticker A
 * @param pricesB - Array of {time: ISO date, value: close} for ticker B
 * @param tickerA - Label for leg A
 * @param tickerB - Label for leg B
 * @returns Raw pair analysis result, or null if < 200 overlapping bars
 */
export function analyzePairRaw(
  pricesA: Array<{ time: string; value: number }>,
  pricesB: Array<{ time: string; value: number }>,
  tickerA: string,
  tickerB: string
): PairSignalRawResult | null {
  // Align on common dates
  const mapA = new Map(pricesA.filter(p => p.value > 0 && isFinite(p.value)).map(p => [p.time, p.value]));
  const mapB = new Map(pricesB.filter(p => p.value > 0 && isFinite(p.value)).map(p => [p.time, p.value]));

  const dates: string[]  = [];
  const valsA: number[]  = [];
  const valsB: number[]  = [];
  const ratio: number[]  = [];
  const logRatio: number[] = [];

  // Walk through dates in A's order to preserve time-ordering
  const sortedDates = [...mapA.keys()].sort();
  for (const d of sortedDates) {
    const a = mapA.get(d)!, b = mapB.get(d);
    if (b == null || !isFinite(b) || b <= 0) continue;
    dates.push(d);
    valsA.push(a);
    valsB.push(b);
    const r = a / b;
    ratio.push(r);
    logRatio.push(Math.log(r));
  }

  const n = ratio.length;
  if (n < 200) return null;

  const lastIdx = n - 1;
  const currentA = valsA[lastIdx];
  const currentB = valsB[lastIdx];
  const currentRatio = ratio[lastIdx];

  // --- Signal 1: rolling z-score of log-ratio ---
  const rawZ = rollingZScore(logRatio, Z_WINDOW);

  // --- Signal 2: OLS-residual z-score ---
  // OLS: log(retA) ~ beta * log(retB) => residual = logRetA − (alpha + beta * logRetB)
  // Compute on price-level residuals: logRatioOLS = logRatio − betaOLS * logValsB
  const logValsA = valsA.map(v => Math.log(v));
  const logValsB = valsB.map(v => Math.log(v));
  const olsResid = computeOLSResiduals(logValsA, logValsB);
  // OLS residuals are always finite (logValsA/B are all finite by construction)
  const olsZFull = rollingZScore(olsResid, Z_WINDOW);

  // --- Signal 3: spread z-score (log-ratio − rolling mean, rolling std) ---
  // Same as raw_z but uses 200-bar window
  const spreadZ = rollingZScore(logRatio, 200);

  // --- Signal 4: running percentile of log-ratio ---
  const pct = computePercentile(logRatio);

  const rawZBuckets    = computeBuckets("raw_z",    rawZ,    ratio, ZSCORE_BINS);
  const olsZBuckets    = computeBuckets("ols_z",    olsZFull, ratio, ZSCORE_BINS);
  const spreadZBuckets = computeBuckets("spread_z", spreadZ, ratio, ZSCORE_BINS);
  const pctBuckets     = computeBuckets("pct",      pct,     ratio, PCT_BINS);

  // Compute ratio-level ranges for z-score buckets
  const curZ = rawZ[lastIdx];
  if (curZ != null) {
    const slice = logRatio.slice(Math.max(0, lastIdx - Z_WINDOW + 1), lastIdx + 1);
    const mu = slice.reduce((s, v) => s + v, 0) / slice.length;
    const sigma = Math.sqrt(slice.reduce((s, v) => s + (v - mu) ** 2, 0) / slice.length);
    for (const b of rawZBuckets) {
      const lo = b.low  === -Infinity ? -3.5 : b.low;
      const hi = b.high === Infinity  ?  3.5 : b.high;
      b.ratioLevelLow  = Math.exp(mu + lo * sigma);
      b.ratioLevelHigh = Math.exp(mu + hi * sigma);
      b.priceLevelLow  = b.ratioLevelLow;
      b.priceLevelHigh = b.ratioLevelHigh;
    }
  }
  // Percentile ratio-level ranges
  const sortedRatio = [...ratio].sort((a, b) => a - b);
  const interpPct = (p: number) => {
    if (p <= 0)   return sortedRatio[0];
    if (p >= 100) return sortedRatio[sortedRatio.length - 1];
    const fi = p / 100 * (sortedRatio.length - 1);
    const lo = Math.floor(fi), hi = Math.ceil(fi);
    if (lo === hi) return sortedRatio[lo];
    return sortedRatio[lo] * (1 - (fi - lo)) + sortedRatio[hi] * (fi - lo);
  };
  for (const b of pctBuckets) {
    b.ratioLevelLow  = interpPct(b.low);
    b.ratioLevelHigh = interpPct(Math.min(b.high, 100));
    b.priceLevelLow  = b.ratioLevelLow;
    b.priceLevelHigh = b.ratioLevelHigh;
  }

  const currentSignals: Array<{ signal: SignalTypePair; value: number | null }> = [
    { signal: "raw_z",    value: rawZ[lastIdx] },
    { signal: "ols_z",    value: olsZFull[lastIdx] },
    { signal: "spread_z", value: spreadZ[lastIdx] },
    { signal: "pct",      value: pct[lastIdx] },
  ];

  const buckets = {
    raw_z:    rawZBuckets,
    ols_z:    olsZBuckets,
    spread_z: spreadZBuckets,
    pct:      pctBuckets,
  };

  // Find best signal
  let bestNow: PairSignalRawResult["bestNow"] = null;
  let bestQ = -Infinity;

  for (const sig of currentSignals) {
    if (sig.value == null) continue;
    const allBuckets = buckets[sig.signal];
    const b = allBuckets.find(r => sig.value! >= r.low && sig.value! < r.high);
    if (!b || b.n < 20 || b.avg_20d == null) continue;
    if (Math.abs(b.quality) > bestQ) {
      bestQ = Math.abs(b.quality);
      const expectedMove = b.avg_20d; // % change in ratio
      const expectedRatio20d = currentRatio * (1 + expectedMove / 100);
      // If ratio rises: A rises relative to B → long ratio (long A / short B)
      const dir: "long_ratio" | "short_ratio" | "neutral" =
        expectedMove > 0.3 ? "long_ratio" : expectedMove < -0.3 ? "short_ratio" : "neutral";
      // Implied individual prices (if the other leg stays flat)
      const expectedAPrice20dIfBHolds = expectedRatio20d * currentB;
      const expectedBPrice20dIfAHolds = currentA / expectedRatio20d;
      const hr = b.hit_20d ?? 50;
      const edgeLabel =
        hr >= 55 ? "actionable edge" :
        hr >= 50 ? "marginal edge" :
        "NO edge (coin-flip or worse — do not trade)";
      bestNow = {
        signal: sig.signal,
        bucket: b,
        currentSignalValue: sig.value,
        direction: dir,
        expectedMove20dPct: expectedMove,
        expectedRatio20d,
        expectedAPrice20dIfBHolds,
        expectedBPrice20dIfAHolds,
        rationale: `${signalLabel(sig.signal)} = ${signalValueFormat(sig.signal, sig.value)} sits in the "${b.label}" bucket. Historically, ${tickerA}/${tickerB} ratio moved ${expectedMove >= 0 ? "+" : ""}${expectedMove.toFixed(2)}% on average over the next 20 trading days (n=${b.n}, hit ${hr.toFixed(0)}% reverting${reversionDir(sig.signal)}). ${edgeLabel}.`,
      };
    }
  }

  return {
    tickerA, tickerB,
    firstDate: dates[0],
    lastDate:  dates[lastIdx],
    n,
    currentA, currentB, currentRatio,
    currentSignals,
    buckets,
    bestNow,
    halfLifeDays: computeHalfLife(rawZ),
  };
}

/**
 * Compute OLS residuals of logA ~ alpha + beta * logB.
 * Returns residuals (same length as inputs).
 */
function computeOLSResiduals(logA: number[], logB: number[]): number[] {
  const m = Math.min(logA.length, logB.length);
  let sumB = 0, sumA = 0, sumBB = 0, sumAB = 0;
  for (let i = 0; i < m; i++) {
    sumB  += logB[i];
    sumA  += logA[i];
    sumBB += logB[i] * logB[i];
    sumAB += logA[i] * logB[i];
  }
  const denom = m * sumBB - sumB * sumB;
  const beta  = denom === 0 ? 1 : (m * sumAB - sumA * sumB) / denom;
  const alpha = (sumA - beta * sumB) / m;
  const resid: number[] = new Array(m);
  for (let i = 0; i < m; i++) resid[i] = logA[i] - (alpha + beta * logB[i]);
  return resid;
}

// ---------------------------------------------------------------------------
// Synchronous overload (used by Scanner.tsx)
// ---------------------------------------------------------------------------

/**
 * Synchronous pair analysis — called as analyzePairSignals(pricesA, pricesB, tickerA, tickerB)
 * from Scanner.tsx. Returns the raw PairSignalRawResult (or null).
 *
 * This overload preserves the original async signature while also supporting
 * the direct synchronous calling convention used by the Scanner page.
 */
export function analyzePairSignals(
  pricesA: Array<{ time: string; value: number }>,
  pricesB: Array<{ time: string; value: number }>,
  tickerA: string,
  tickerB: string
): PairSignalRawResult | null;

/**
 * Async pair analysis — original stub signature.
 * Fetches price data for two tickers and returns a flattened PairAnalysisResult.
 */
export async function analyzePairSignals(
  tickerA: string,
  tickerB: string,
  options?: Record<string, any>
): Promise<PairAnalysisResult | null>;

// Implementation
export function analyzePairSignals(
  tickerAOrPricesA: string | Array<{ time: string; value: number }>,
  tickerBOrPricesB: string | Array<{ time: string; value: number }>,
  tickerAOrOpts?: string | Record<string, any>,
  tickerB?: string
): PairSignalRawResult | null | Promise<PairAnalysisResult | null> {
  // Synchronous overload: (pricesA, pricesB, tickerA, tickerB)
  if (Array.isArray(tickerAOrPricesA) && Array.isArray(tickerBOrPricesB)) {
    return analyzePairRaw(
      tickerAOrPricesA,
      tickerBOrPricesB,
      (tickerAOrOpts as string) ?? "A",
      tickerB ?? "B"
    );
  }
  // Async overload: (tickerA, tickerB, opts?)
  // TODO: if a data-fetching layer becomes available, call it here
  return Promise.resolve(null);
}

// ---------------------------------------------------------------------------
// Public async functions (original stub signatures, preserved)
// ---------------------------------------------------------------------------

/**
 * Analyse signals for a single ticker.
 * Fetches price history and returns a flattened SingleAnalysisResult.
 *
 * TODO: wire up a data-fetching call when a fetch API is available.
 * For now returns null (the Scanner page uses the inline analyzeTicker instead).
 */
export async function analyzeSingleTicker(
  _ticker: string,
  _options?: Record<string, any>
): Promise<SingleAnalysisResult | null> {
  // TODO: fetch price series for _ticker, call analyzeTicker(), flatten result
  return null;
}
