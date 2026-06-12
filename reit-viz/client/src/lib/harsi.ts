/**
 * HARSI — Heikin-Ashi RSI Hybrid Oscillator
 *
 * Algorithm (reverse-engineered from HarsiOptimizer-BXuhMFq0.js / harsi-NMVnsDcX.js):
 *
 * 1. Build Heikin-Ashi candles from raw OHLC data.
 *    haClose[i] = (open[i] + high[i] + low[i] + close[i]) / 4
 *    haOpen[i]  = (haOpen[i-1] + haClose[i-1]) / 2  (seed: first haOpen = close[0])
 *    haHigh[i]  = max(high[i], haOpen[i], haClose[i])
 *    haLow[i]   = min(low[i], haOpen[i], haClose[i])
 *
 * 2. Optionally smooth each HA series with an EMA of period `candleSmoothing`.
 *    (candleSmoothing=1 means no smoothing.)
 *
 * 3. Compute RSI of period `rsiLength` on the (smoothed) haClose series.
 *    When `rsiSmoothed=true` the Wilder/EMA-smoothed RSI formula is used;
 *    otherwise a simple SMA-of-gains formula is used.
 *    The raw 0-100 RSI is mapped to [-stochFit … +stochFit] so it aligns
 *    with the stochastic output: rsiFit = (rsi - 50) * (stochFit / 50).
 *
 * 4. Compute %K and %D stochastics from (smoothed) HA candles:
 *    rawK[i] = (haClose[i] - minLow[i, period]) / (maxHigh[i, period] - minLow[i, period]) * 100 - 50
 *    (centred at 0 like the RSI fit above)
 *    %K = EMA(rawK, smoothK),  %D = EMA(%K, smoothD)
 *
 * Consumer (EvaluatorPanel.tsx) reads:
 *   result.haClose[i], result.haOpen[i]    — for color direction
 *   result.rsi[i], result.stochK[i], result.stochD[i]
 */

export interface HarsiInput {
  closes: number[];
  highs?: number[];
  lows?: number[];
  period?: number;
  [key: string]: any;
}

export interface HarsiOutput {
  values: (number | null)[];
  signal?: (number | null)[];
  /** Smoothed Heikin-Ashi close series (length = closes.length) */
  haClose: (number | null)[];
  /** Smoothed Heikin-Ashi open series (length = closes.length) */
  haOpen: (number | null)[];
  /** Smoothed Heikin-Ashi high series */
  haHigh: (number | null)[];
  /** Smoothed Heikin-Ashi low series */
  haLow: (number | null)[];
  /** Centred RSI series mapped to ±stochFit */
  rsi: (number | null)[];
  /** Stochastic %K, centred at 0 */
  stochK: (number | null)[];
  /** Stochastic %D (EMA-smoothed %K), centred at 0 */
  stochD: (number | null)[];
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply Wilder-EMA smoothing (multiplicative, period-length init from SMA).
 * Returns `null` where insufficient data.
 */
function wilderEma(values: (number | null)[], period: number): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period) return out;

  // Seed: SMA of first `period` values
  let sum = 0;
  let validCount = 0;
  for (let i = 0; i < period; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) { sum += v; validCount++; }
  }
  if (validCount < period) return out;

  const k = 1 / period; // Wilder multiplier = 1/period
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) { out[i] = null; prev = NaN; continue; }
    if (!Number.isFinite(prev)) { out[i] = null; continue; }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Standard EMA (for stochastic smoothing, candleSmoothing).
 */
function ema(values: (number | null)[], period: number): (number | null)[] {
  if (period <= 1) return values.slice();
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n === 0) return out;

  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) { out[i] = null; prev = null; continue; }
    if (prev === null) { prev = v; out[i] = v; continue; }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Compute Heikin-Ashi candles from OHLC. `opens` approximated as previous close if not available. */
function heikinAshi(
  closes: number[],
  highs: number[],
  lows: number[]
): { haOpen: number[]; haClose: number[]; haHigh: number[]; haLow: number[] } {
  const n = closes.length;
  const haOpen = new Array<number>(n);
  const haClose = new Array<number>(n);
  const haHigh = new Array<number>(n);
  const haLow = new Array<number>(n);

  // Approximate raw open as previous close (standard for close-only data)
  const opens = new Array<number>(n);
  opens[0] = closes[0];
  for (let i = 1; i < n; i++) opens[i] = closes[i - 1];

  // First bar
  haClose[0] = (opens[0] + highs[0] + lows[0] + closes[0]) / 4;
  haOpen[0] = (opens[0] + closes[0]) / 2;
  haHigh[0] = Math.max(highs[0], haOpen[0], haClose[0]);
  haLow[0] = Math.min(lows[0], haOpen[0], haClose[0]);

  for (let i = 1; i < n; i++) {
    haClose[i] = (opens[i] + highs[i] + lows[i] + closes[i]) / 4;
    haOpen[i] = (haOpen[i - 1] + haClose[i - 1]) / 2;
    haHigh[i] = Math.max(highs[i], haOpen[i], haClose[i]);
    haLow[i] = Math.min(lows[i], haOpen[i], haClose[i]);
  }

  return { haOpen, haClose, haHigh, haLow };
}

/**
 * RSI using Wilder EMA smoothing.
 * Returns raw 0-100 scale.
 */
function rsiWilder(values: (number | null)[], period: number): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return out;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < n; i++) {
    const prev = values[i - 1];
    const cur = values[i];
    if (prev === null || cur === null || !Number.isFinite(prev) || !Number.isFinite(cur)) {
      gains.push(NaN);
      losses.push(NaN);
    } else {
      const d = cur - prev;
      gains.push(d > 0 ? d : 0);
      losses.push(d < 0 ? -d : 0);
    }
  }

  // Seed from SMA of first `period` changes
  let seedGain = 0, seedLoss = 0, seedValid = true;
  for (let i = 0; i < period; i++) {
    if (!Number.isFinite(gains[i])) { seedValid = false; break; }
    seedGain += gains[i];
    seedLoss += losses[i];
  }
  if (!seedValid) return out;

  let avgGain = seedGain / period;
  let avgLoss = seedLoss / period;
  const rsiVal = (ag: number, al: number) => al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  out[period] = rsiVal(avgGain, avgLoss);

  for (let i = period; i < gains.length; i++) {
    if (!Number.isFinite(gains[i])) { out[i + 1] = null; avgGain = NaN; avgLoss = NaN; continue; }
    if (!Number.isFinite(avgGain)) { out[i + 1] = null; continue; }
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    out[i + 1] = rsiVal(avgGain, avgLoss);
  }
  return out;
}

/**
 * RSI using simple SMA (non-smoothed variant).
 */
function rsiSimple(values: (number | null)[], period: number): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    let gain = 0, loss = 0, valid = true;
    for (let k = i - period + 1; k <= i; k++) {
      const prev = values[k - 1];
      const cur = values[k];
      if (prev === null || cur === null || !Number.isFinite(prev) || !Number.isFinite(cur)) {
        valid = false; break;
      }
      const d = cur - prev;
      if (d > 0) gain += d; else loss -= d;
    }
    if (!valid) continue;
    const avgG = gain / period, avgL = loss / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exported function
// ---------------------------------------------------------------------------

/**
 * Compute the HARSI indicator series.
 * Accepts either a HarsiInput object OR positional args (closes, highs, lows, opts?).
 */
export function harsiCompute(input: HarsiInput): HarsiOutput;
export function harsiCompute(closes: number[], highs: number[], lows: number[], opts?: Record<string, any>): HarsiOutput;
export function harsiCompute(
  closesOrInput: number[] | HarsiInput,
  _highs?: number[],
  _lows?: number[],
  _opts?: any
): HarsiOutput {
  // Normalise arguments
  let closes: number[];
  let highs: number[];
  let lows: number[];
  let opts: Record<string, any>;

  if (Array.isArray(closesOrInput)) {
    closes = closesOrInput;
    highs = _highs ?? closes;
    lows = _lows ?? closes;
    opts = _opts ?? {};
  } else {
    closes = closesOrInput.closes;
    highs = closesOrInput.highs ?? closes;
    lows = closesOrInput.lows ?? closes;
    opts = closesOrInput;
  }

  const {
    candleLength = 14,
    candleSmoothing = 1,
    rsiLength = 7,
    rsiSmoothed = true,
    stochLength = 14,
    smoothK = 3,
    smoothD = 3,
    stochFit = 80,
  } = opts;

  const n = closes.length;
  const empty = (): HarsiOutput => ({
    values: [],
    signal: [],
    haClose: [],
    haOpen: [],
    haHigh: [],
    haLow: [],
    rsi: [],
    stochK: [],
    stochD: [],
  });

  if (n < Math.max(candleLength, rsiLength, stochLength) + 2) return empty();

  // Step 1: Heikin-Ashi candles
  const ha = heikinAshi(closes, highs, lows);

  // Step 2: Optional EMA smoothing on all HA series
  const smoothedClose = candleSmoothing > 1 ? ema(ha.haClose, candleSmoothing) : ha.haClose.slice() as (number | null)[];
  const smoothedOpen  = candleSmoothing > 1 ? ema(ha.haOpen, candleSmoothing)  : ha.haOpen.slice() as (number | null)[];
  const smoothedHigh  = candleSmoothing > 1 ? ema(ha.haHigh, candleSmoothing)  : ha.haHigh.slice() as (number | null)[];
  const smoothedLow   = candleSmoothing > 1 ? ema(ha.haLow, candleSmoothing)   : ha.haLow.slice() as (number | null)[];

  // Step 3: RSI on smoothed haClose, then centre/scale to [-stochFit, +stochFit]
  const rawRsi = rsiSmoothed
    ? rsiWilder(smoothedClose, rsiLength)
    : rsiSimple(smoothedClose, rsiLength);

  const rsiScale = stochFit / 50;
  const rsiArr: (number | null)[] = rawRsi.map(v =>
    v === null || !Number.isFinite(v) ? null : (v - 50) * rsiScale
  );

  // Step 4: Stochastic on HA candles (haLow for min, haHigh for max, haClose for close)
  const rawK: (number | null)[] = new Array(n).fill(null);
  for (let i = stochLength - 1; i < n; i++) {
    let lo = Infinity, hi = -Infinity;
    let valid = true;
    for (let k = i - stochLength + 1; k <= i; k++) {
      const L = smoothedLow[k], H = smoothedHigh[k];
      if (L === null || H === null || !Number.isFinite(L) || !Number.isFinite(H)) {
        valid = false; break;
      }
      if (L < lo) lo = L;
      if (H > hi) hi = H;
    }
    const c = smoothedClose[i];
    if (!valid || c === null || !Number.isFinite(c)) continue;
    rawK[i] = hi === lo ? 0 : ((c - lo) / (hi - lo)) * 100 - 50;
  }

  // EMA-smooth %K and then %D, centred at 0
  const stochKArr = ema(rawK, smoothK);
  const stochDArr = ema(stochKArr, smoothD);

  // values = haClose - haOpen (candle body direction, same sign as the main oscillator)
  const values: (number | null)[] = smoothedClose.map((c, i) => {
    const o = smoothedOpen[i];
    if (c === null || o === null || !Number.isFinite(c) || !Number.isFinite(o)) return null;
    return c - o;
  });

  return {
    values,
    signal: rsiArr,
    haClose: smoothedClose,
    haOpen: smoothedOpen,
    haHigh: smoothedHigh,
    haLow: smoothedLow,
    rsi: rsiArr,
    stochK: stochKArr,
    stochD: stochDArr,
  };
}
