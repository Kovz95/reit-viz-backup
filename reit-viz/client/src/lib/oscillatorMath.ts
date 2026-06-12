/**
 * oscillatorMath.ts
 *
 * Real implementations reconstructed from:
 *   - Oscillators-BTlPqSR6.js  (import aliases: c=stochOscillator, d=detectSignals,
 *                                                a=computeForwardProfileOsc, b=summarizeSignalsOsc)
 *   - SlowStochOptimizer-BINIVNO0.js  (stochastic math)
 *   - ComboOptimizer-DeA6DroV.js      (EWO pattern)
 *
 * IMPORTANT: In Oscillators.tsx the exports are re-aliased with swapped meanings:
 *
 *   const at = stochOscillator as any   → called as at(highs, lows, fast, slow)
 *                                          → EWO = SMA(mid, fast) − SMA(mid, slow)
 *
 *   const Ft = detectSignals as any     → called as Ft(ewoVals, threshold, startIdx)
 *                                          → EWO crossing signals
 *
 *   const Kt = computeForwardProfileOsc as any → called as Kt(highs, lows, closes, k, sk, sd)
 *                                                 → stochastic oscillator → { k, d }
 *
 *   const wo = summarizeSignalsOsc as any → called as wo(k, d, os, ob, mode, startIdx)
 *                                            → stochastic signal detection
 *
 * All `as any` casts bypass TypeScript typing so each function must work for
 * both its typed stub signature AND its actual runtime call pattern.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OscillatorInput {
  closes: number[];
  highs?: number[];
  lows?: number[];
  volumes?: number[];
  dates?: string[];
  [key: string]: any;
}

export interface StochResult {
  k: (number | null)[];
  d: (number | null)[];
}

export interface OscSignal {
  index: number;
  date?: string;
  type: string;
  value: number;
  [key: string]: any;
}

export interface OscForwardProfile {
  horizon: string;
  mean: number;
  median: number;
  n: number;
  hitRate: number;
  [key: string]: any;
}

export interface OscSignalSummary {
  signalType: string;
  count: number;
  profile: OscForwardProfile[];
  [key: string]: any;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Rolling simple moving average. Returns null until the window is full.
 */
function _sma(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * EWO = SMA(midprice, fast) − SMA(midprice, slow)
 * midprice = (high + low) / 2
 *
 * Reconstructed from Oscillators bundle: `at(highs, lows, fast, slow)`.
 */
function _ewo(
  highs: number[],
  lows: number[],
  fast: number,
  slow: number
): (number | null)[] {
  const n = highs.length;
  const mid: number[] = new Array(n);
  for (let i = 0; i < n; i++) mid[i] = (highs[i] + lows[i]) / 2;
  const fastSMA = _sma(mid, fast);
  const slowSMA = _sma(mid, slow);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (fastSMA[i] !== null && slowSMA[i] !== null) out[i] = fastSMA[i]! - slowSMA[i]!;
  }
  return out;
}

/**
 * Slow stochastic oscillator.
 *
 * Reconstructed from SlowStochOptimizer-BINIVNO0.js function `Ft(f, h, i, k, p, o)`:
 *   rawK[i] = 100 * (close[i] − lowestLow) / (highestHigh − lowestLow)  over kPeriod bars
 *   slowK[i] = SMA(rawK, smoothK)[i]   (null unless all smoothK bars have valid rawK)
 *   slowD[i] = SMA(slowK, smoothD)[i]  (null unless all smoothD bars have valid slowK)
 *
 * Consumed by Oscillators.tsx as `Kt(highs, lows, closes, kLen, smoothK, smoothD)`.
 */
function _stoch(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number,
  smoothK: number,
  smoothD: number
): StochResult {
  const n = closes.length;
  const rawK: (number | null)[] = new Array(n).fill(null);

  for (let i = kPeriod - 1; i < n; i++) {
    let lo = lows[i];
    let hi = highs[i];
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (lows[j] < lo) lo = lows[j];
      if (highs[j] > hi) hi = highs[j];
    }
    const range = hi - lo;
    rawK[i] = range === 0 ? null : (100 * (closes[i] - lo)) / range;
  }

  // Smooth %K
  const slowK: (number | null)[] = new Array(n).fill(null);
  for (let i = smoothK - 1; i < n; i++) {
    let s = 0, c = 0;
    for (let j = i - smoothK + 1; j <= i; j++) {
      if (rawK[j] !== null) { s += rawK[j]!; c++; }
    }
    if (c === smoothK) slowK[i] = s / smoothK;
  }

  // Smooth %D
  const slowD: (number | null)[] = new Array(n).fill(null);
  for (let i = smoothD - 1; i < n; i++) {
    let s = 0, c = 0;
    for (let j = i - smoothD + 1; j <= i; j++) {
      if (slowK[j] !== null) { s += slowK[j]!; c++; }
    }
    if (c === smoothD) slowD[i] = s / smoothD;
  }

  return { k: slowK, d: slowD };
}

/**
 * Detect stochastic signals.
 *
 * Signal modes (from SlowStochOptimizer-BINIVNO0.js):
 *   "cross_out_of_band" / "k_threshold":
 *     buy  = %K crosses UP through osThreshold (exits oversold)
 *     sell = %K crosses DOWN through obThreshold (exits overbought)
 *
 *   "kd_cross_in_zone":
 *     buy  = K crosses above D while both are below obThreshold
 *     sell = K crosses below D while both are above osThreshold
 *
 *   default "kd_cross":
 *     buy  = K crosses above D
 *     sell = K crosses below D
 *
 * Consumed by Oscillators.tsx as `wo(k, d, osThreshold, obThreshold, signalMode, startIdx)`.
 */
function _detectStochSignals(
  k: (number | null)[],
  d: (number | null)[],
  osThreshold: number,
  obThreshold: number,
  signalMode: string,
  startIdx: number
): Array<{ index: number; direction: "buy" | "sell"; type: string; value: number }> {
  const out: Array<{ index: number; direction: "buy" | "sell"; type: string; value: number }> = [];
  const n = k.length;

  if (signalMode === "cross_out_of_band" || signalMode === "k_threshold") {
    for (let i = Math.max(1, startIdx); i < n; i++) {
      const kc = k[i], kp = k[i - 1];
      if (kc === null || kp === null) continue;
      if (kp <= osThreshold && kc > osThreshold)
        out.push({ index: i, direction: "buy", type: "stoch_exit_os", value: kc });
      else if (kp >= obThreshold && kc < obThreshold)
        out.push({ index: i, direction: "sell", type: "stoch_exit_ob", value: kc });
    }
  } else if (signalMode === "kd_cross_in_zone") {
    for (let i = Math.max(1, startIdx); i < n; i++) {
      const kc = k[i], kp = k[i - 1], dc = d[i], dp = d[i - 1];
      if (kc === null || kp === null || dc === null || dp === null) continue;
      const bullCross = kp <= dp && kc > dc;
      const bearCross = kp >= dp && kc < dc;
      if (bullCross && kc < obThreshold && dc < obThreshold)
        out.push({ index: i, direction: "buy", type: "stoch_kd_zone_buy", value: kc });
      else if (bearCross && kc > osThreshold && dc > osThreshold)
        out.push({ index: i, direction: "sell", type: "stoch_kd_zone_sell", value: kc });
    }
  } else {
    // Default: plain K/D crossover
    for (let i = Math.max(1, startIdx); i < n; i++) {
      const kc = k[i], kp = k[i - 1], dc = d[i], dp = d[i - 1];
      if (kc === null || kp === null || dc === null || dp === null) continue;
      if (kp <= dp && kc > dc)
        out.push({ index: i, direction: "buy", type: "stoch_kd_cross_buy", value: kc });
      else if (kp >= dp && kc < dc)
        out.push({ index: i, direction: "sell", type: "stoch_kd_cross_sell", value: kc });
    }
  }
  return out;
}

/**
 * Detect EWO crossing signals.
 *
 * Scalar threshold: buy when ewo crosses zero-or-+thr; sell when crosses zero-or-(-thr).
 * Array threshold: buy when ewo[i] crosses above threshold[i]; sell when crosses below negative.
 *
 * Consumed by Oscillators.tsx as `Ft(ewoVals, threshold, startIdx)`.
 */
function _detectEWOSignals(
  ewoVals: (number | null | number)[],
  threshold: number | (number | null)[],
  startIdx: number
): Array<{ index: number; direction: "buy" | "sell"; type: string; value: number }> {
  const out: Array<{ index: number; direction: "buy" | "sell"; type: string; value: number }> = [];
  const n = ewoVals.length;

  if (Array.isArray(threshold)) {
    for (let i = Math.max(1, startIdx); i < n; i++) {
      const cur = ewoVals[i] as number | null;
      const prev = ewoVals[i - 1] as number | null;
      const tc = threshold[i] as number | null;
      const tp = threshold[i - 1] as number | null;
      if (cur === null || prev === null || tc === null || tp === null) continue;
      if (!Number.isFinite(cur) || !Number.isFinite(prev)) continue;
      // Crossover of ewo above positive threshold line
      if (prev <= (tp ?? 0) && cur > (tc ?? 0))
        out.push({ index: i, direction: "buy", type: "ewo_cross_up", value: cur });
      // Crossunder below negative threshold line
      else if (prev >= -(tp ?? 0) && cur < -(tc ?? 0))
        out.push({ index: i, direction: "sell", type: "ewo_cross_down", value: cur });
    }
  } else {
    const thr = typeof threshold === "number" ? threshold : 0;
    for (let i = Math.max(1, startIdx); i < n; i++) {
      const cur = ewoVals[i] as number | null;
      const prev = ewoVals[i - 1] as number | null;
      if (cur === null || prev === null) continue;
      if (!Number.isFinite(cur) || !Number.isFinite(prev)) continue;
      if (prev <= thr && cur > thr)
        out.push({ index: i, direction: "buy", type: "ewo_zero_up", value: cur });
      else if (prev >= -thr && cur < -thr)
        out.push({ index: i, direction: "sell", type: "ewo_zero_down", value: cur });
    }
  }
  return out;
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Compute stochastic oscillator (classic slow stochastic).
 *
 * **Runtime alias in Oscillators.tsx**: `computeForwardProfileOsc as any`
 * called as `Kt(highs, lows, closes, kLength, smoothK, smoothD)`.
 *
 * Standard signature: `stochOscillator(input, kPeriod?, dPeriod?)`.
 * When called via `as any` with arrays, the function detects the multi-arg pattern.
 *
 * @param input  OscillatorInput OR highs array (when called as at(highs, lows, fast, slow) for EWO)
 * @param kPeriod  K-line period OR lows array (in EWO 4-arg call)
 * @param dPeriod  D-line smooth period OR fast period (in EWO 4-arg call)
 * @returns StochResult { k, d } OR EWO array depending on call pattern
 */
export function stochOscillator(input: OscillatorInput, kPeriod?: number, dPeriod?: number): StochResult {
  // Multi-arity dispatch via rest args (the as-any caller can pass more args)
  const args = arguments as any;
  const arg0 = args[0];
  const arg1 = args[1];
  const arg2 = args[2];
  const arg3 = args[3];

  // EWO form: stochOscillator(highs: number[], lows: number[], fast: number, slow: number)
  if (Array.isArray(arg0) && Array.isArray(arg1) && typeof arg2 === "number" && typeof arg3 === "number") {
    return _ewo(arg0, arg1, arg2, arg3) as any;
  }

  // OscillatorInput form (typed signature)
  const osc = arg0 as OscillatorInput;
  const highs = osc.highs ?? osc.closes;
  const lows = osc.lows ?? osc.closes;
  const kP = typeof arg1 === "number" ? arg1 : 14;
  const dP = typeof arg2 === "number" ? arg2 : 3;
  return _stoch(highs, lows, osc.closes, kP, dP, dP);
}

/**
 * Detect oscillator signals.
 *
 * **Runtime alias in Oscillators.tsx**: `detectSignals as any`
 * called as `Ft(ewoVals, threshold, startIdx)`.
 *
 * Standard signature: `detectSignals(input, params?)`.
 * When called via `as any` with an array as first arg, handles EWO signal detection.
 *
 * @param input  OscillatorInput OR EWO values array
 * @param params Signal params OR threshold (number or array) OR lows array
 * @returns OscSignal[] — { index, direction, type, value }
 */
export function detectSignals(input: OscillatorInput, params?: Record<string, any>): OscSignal[] {
  const args = arguments as any;
  const arg0 = args[0];
  const arg1 = args[1];
  const arg2 = args[2];

  // EWO form: detectSignals(ewoVals: array, threshold: number|array, startIdx: number)
  if (Array.isArray(arg0)) {
    const startIdx = typeof arg2 === "number" ? arg2 : 0;
    return _detectEWOSignals(arg0, arg1, startIdx) as any;
  }

  // OscillatorInput form
  const osc = arg0 as OscillatorInput;
  const highs = osc.highs ?? osc.closes;
  const lows = osc.lows ?? osc.closes;
  const kP = (arg1 as any)?.kPeriod ?? 14;
  const dP = (arg1 as any)?.dPeriod ?? 3;
  const os = (arg1 as any)?.osThreshold ?? 20;
  const ob = (arg1 as any)?.obThreshold ?? 80;
  const mode = (arg1 as any)?.signalMode ?? "cross_out_of_band";
  const start = (arg1 as any)?.startIdx ?? 0;
  const { k, d } = _stoch(highs, lows, osc.closes, kP, dP, dP);
  return _detectStochSignals(k, d, os, ob, mode, start) as any;
}

/**
 * Compute stochastic oscillator (forward-profile named stub preserved).
 *
 * **Runtime alias in Oscillators.tsx**: `computeForwardProfileOsc as any`
 * called as `Kt(highs, lows, closes, kLength, smoothK, smoothD)`.
 *
 * Returns `{ k: (number|null)[], d: (number|null)[] }` when called in stoch mode.
 * Returns `OscForwardProfile[]` when called in typed forward-profile mode.
 *
 * @param signals  Array of signals OR highs array
 * @param closes   Close prices OR lows array
 * @param horizons Horizon bars to look forward OR closes array
 */
export function computeForwardProfileOsc(
  signals: OscSignal[],
  closes: number[],
  horizons?: number[]
): OscForwardProfile[] {
  const args = arguments as any;
  const arg0 = args[0];
  const arg1 = args[1];
  const arg2 = args[2];
  const arg3 = args[3];
  const arg4 = args[4];
  const arg5 = args[5];

  // Stoch form: computeForwardProfileOsc(highs, lows, closes, kLen, smoothK, smoothD)
  if (Array.isArray(arg0) && Array.isArray(arg1) && Array.isArray(arg2) && typeof arg3 === "number") {
    const kLen = arg3 as number;
    const sk = typeof arg4 === "number" ? arg4 : 3;
    const sd = typeof arg5 === "number" ? arg5 : 3;
    return _stoch(arg0, arg1, arg2, kLen, sk, sd) as any;
  }

  // Standard forward-profile form: compute per-signal forward returns
  const sigs = arg0 as OscSignal[];
  const prices = arg1 as number[];
  const hzs = (arg2 as number[] | undefined) ?? [21, 42, 63, 126];

  if (!sigs || !prices || sigs.length === 0) return [];

  const profiles: OscForwardProfile[] = [];
  for (const hz of hzs) {
    const label = hz <= 5 ? `${hz}d` : hz <= 10 ? "2w" : hz <= 21 ? "1M" : hz <= 42 ? "2M" : hz <= 63 ? "3M" : hz <= 126 ? "6M" : "1Y";
    const returns: number[] = [];
    for (const sig of sigs) {
      const entryIdx = sig.index;
      const exitIdx = entryIdx + hz;
      if (exitIdx >= prices.length) continue;
      const entry = prices[entryIdx];
      const exit = prices[exitIdx];
      if (!entry || entry === 0) continue;
      const ret = sig.direction === "sell" ? (entry - exit) / entry : (exit - entry) / entry;
      returns.push(ret);
    }
    if (returns.length === 0) {
      profiles.push({ horizon: label, mean: 0, median: 0, n: 0, hitRate: 0 });
      continue;
    }
    returns.sort((a, b) => a - b);
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const median = returns[Math.floor(returns.length / 2)];
    const hitRate = returns.filter((r) => r > 0).length / returns.length;
    profiles.push({ horizon: label, mean, median, n: returns.length, hitRate });
  }
  return profiles;
}

/**
 * Summarize oscillator signals by type.
 *
 * **Runtime alias in Oscillators.tsx**: `summarizeSignalsOsc as any`
 * called as `wo(k, d, osThreshold, obThreshold, signalMode, startIdx)`.
 *
 * Returns stochastic signals when called in stoch-detect mode.
 * Returns OscSignalSummary[] in typed summarize mode.
 *
 * @param signals   Array of signals OR %K array
 * @param profile   Array of profiles OR %D array
 */
export function summarizeSignalsOsc(signals: OscSignal[], profile: OscForwardProfile[]): OscSignalSummary[] {
  const args = arguments as any;
  const arg0 = args[0];
  const arg1 = args[1];
  const arg2 = args[2];
  const arg3 = args[3];
  const arg4 = args[4];
  const arg5 = args[5];

  // Stoch detect form: summarizeSignalsOsc(k, d, osThreshold, obThreshold, signalMode, startIdx)
  if (Array.isArray(arg0) && Array.isArray(arg1)) {
    const k = arg0 as (number | null)[];
    const d = arg1 as (number | null)[];
    const os = typeof arg2 === "number" ? arg2 : 20;
    const ob = typeof arg3 === "number" ? arg3 : 80;
    const mode = typeof arg4 === "string" ? arg4 : "cross_out_of_band";
    const start = typeof arg5 === "number" ? arg5 : 0;
    return _detectStochSignals(k, d, os, ob, mode, start) as any;
  }

  // Standard summarize form
  const sigs = arg0 as OscSignal[];
  if (!sigs || sigs.length === 0) return [];

  const byType = new Map<string, OscSignal[]>();
  for (const s of sigs) {
    const arr = byType.get(s.type) ?? [];
    arr.push(s);
    byType.set(s.type, arr);
  }

  const summaries: OscSignalSummary[] = [];
  for (const [type, typeSigs] of byType) {
    const relevantProfiles = (profile as OscForwardProfile[]).filter((_, i) => i < typeSigs.length);
    summaries.push({
      signalType: type,
      count: typeSigs.length,
      profile: relevantProfiles,
    });
  }
  return summaries;
}
