/**
 * TVA — Trend / Volume / Alpha Oscillator
 *
 * Algorithm (reverse-engineered from TVAOptimizer-D4A65F3C.js /
 * tva-DaeKqI67.js via EvaluatorPanel-BcObXxAZ.js):
 *
 * Called as: tvaCompute(closes, volumes, length, smo, mult)
 *   - length  : lookback window (default 15)
 *   - smo     : EMA smoothing period for the oscillator (default 3)
 *   - mult    : envelope multiplier (default 5)
 *
 * Steps:
 * 1. Compute VWMA (volume-weighted moving average) of close over `length`.
 * 2. Compute SMA of close over `length`.
 * 3. os_raw[i] = VWMA[i] − SMA[i]   (the raw oscillator)
 * 4. os[i]     = EMA(os_raw, smo)    (smoothed oscillator; the sign of os
 *                drives the regime signal: +1 = bull, −1 = bear)
 * 5. Compute a rolling standard-deviation of os_raw over `length` (σ).
 * 6. a[i] = os_raw[i] + mult * σ[i]  (upper envelope / bull pressure)
 *    b[i] = os_raw[i] − mult * σ[i]  (lower envelope / bear pressure)
 * 7. bullPressure[i] = EMA(a, smo)
 *    bearPressure[i] = EMA(b, smo)
 *
 * Consumer (EvaluatorPanel.tsx) reads:
 *   result.os[i]             — for regime sign and flip recency
 * TVAOptimizer additionally uses:
 *   result.bullPressure[i], result.bearPressure[i],
 *   result.a[i], result.b[i] — for threshold-cross and divergence signals
 */

export interface TvaInput {
  closes: number[];
  highs?: number[];
  lows?: number[];
  dates?: string[];
  period?: number;
  [key: string]: any;
}

export interface TvaOutput {
  values: (number | null)[];
  signal?: (number | null)[];
  /** Raw oscillator: VWMA(close,length) − SMA(close,length) */
  os_raw?: (number | null)[];
  /** Smoothed oscillator (EMA of os_raw over smo): regime sign +1 bull / −1 bear */
  os: (number | null)[];
  /** Upper envelope = os_raw + mult*σ, then EMA-smoothed */
  bullPressure: (number | null)[];
  /** Lower envelope = os_raw − mult*σ, then EMA-smoothed */
  bearPressure: (number | null)[];
  /** Unsmoothed upper envelope */
  a: (number | null)[];
  /** Unsmoothed lower envelope */
  b: (number | null)[];
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Standard EMA. Returns same-length array; null where not yet seeded. */
function ema(values: (number | null)[], period: number): (number | null)[] {
  if (period <= 1) return values.slice();
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) { prev = null; continue; }
    prev = prev === null ? v : v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exported function
// ---------------------------------------------------------------------------

/**
 * Compute the TVA indicator series.
 * Accepts either a TvaInput object OR positional args (closes, volumes, p1?, p2?, p3?).
 *
 * @param closes  - Close price array
 * @param volumes - Volume array (same length as closes)
 * @param p1      - length: VWMA / SMA lookback window (default 15)
 * @param p2      - smo: EMA smoothing period for the oscillator (default 3)
 * @param p3      - mult: envelope multiplier (default 5)
 */
export function tvaCompute(input: TvaInput): TvaOutput;
export function tvaCompute(closes: number[], volumes: number[], p1?: number, p2?: number, p3?: number): TvaOutput;
export function tvaCompute(
  closesOrInput: number[] | TvaInput,
  _volumes?: number[],
  _p1?: number,
  _p2?: number,
  _p3?: number
): TvaOutput {
  // Normalise arguments
  let closes: number[];
  let volumes: number[];
  let length: number;
  let smo: number;
  let mult: number;

  if (Array.isArray(closesOrInput)) {
    closes  = closesOrInput;
    volumes = _volumes ?? [];
    length  = _p1 ?? 15;
    smo     = _p2 ?? 3;
    mult    = _p3 ?? 5;
  } else {
    closes  = closesOrInput.closes;
    volumes = closesOrInput.volumes ?? [];
    length  = closesOrInput.period ?? 15;
    smo     = (closesOrInput.smo as number | undefined) ?? 3;
    mult    = (closesOrInput.mult as number | undefined) ?? 5;
  }

  const n = closes.length;
  const nullArr = (): (number | null)[] => new Array(n).fill(null);

  const empty = (): TvaOutput => ({
    values:       [],
    signal:       [],
    os_raw:       [],
    os:           [],
    bullPressure: [],
    bearPressure: [],
    a:            [],
    b:            [],
  });

  if (n < length + 2 || volumes.length !== n) return empty();

  // --- Step 1 & 2: VWMA and SMA ---
  const osRaw: (number | null)[] = nullArr();
  for (let i = length - 1; i < n; i++) {
    let volSum = 0, volPriceSum = 0, smaSum = 0, valid = true;
    for (let k = i - length + 1; k <= i; k++) {
      const c = closes[k], v = volumes[k];
      if (!Number.isFinite(c) || !Number.isFinite(v) || v < 0) { valid = false; break; }
      volPriceSum += c * v;
      volSum      += v;
      smaSum      += c;
    }
    if (!valid) continue;
    const sma  = smaSum / length;
    const vwma = volSum > 0 ? volPriceSum / volSum : sma; // fall back to SMA if no volume
    osRaw[i] = vwma - sma;
  }

  // --- Step 3: smooth oscillator ---
  const osSmoothed = ema(osRaw, smo);

  // --- Step 4: rolling σ of os_raw over `length`, then envelopes ---
  const aArr: (number | null)[] = nullArr();
  const bArr: (number | null)[] = nullArr();
  for (let i = 2 * length - 2; i < n; i++) {
    let sum = 0, sum2 = 0, cnt = 0;
    for (let k = i - length + 1; k <= i; k++) {
      const v = osRaw[k];
      if (v === null || !Number.isFinite(v)) { cnt = 0; break; }
      sum += v; sum2 += v * v; cnt++;
    }
    if (cnt !== length) continue;
    const mean = sum / length;
    const variance = Math.max(0, sum2 / length - mean * mean);
    const sigma = Math.sqrt(variance);
    const raw = osRaw[i]!;
    aArr[i] = raw + mult * sigma;
    bArr[i] = raw - mult * sigma;
  }

  // --- Step 5: smooth envelopes ---
  const bullPressure = ema(aArr, smo);
  const bearPressure = ema(bArr, smo);

  return {
    values:       osSmoothed,
    signal:       osSmoothed,
    os_raw:       osRaw,
    os:           osSmoothed,
    bullPressure,
    bearPressure,
    a:            aArr,
    b:            bArr,
  };
}
