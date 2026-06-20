// Reconstructed from the production index chunk (functions U8e/V8e/W8e/q8e/H8e/
// Y8e/XU/G8e/GP/jF) on 2026-06-17. The full 10-type moving-average engine used by
// the "Find Best MA" optimizer and chart MA overlays. Source's movingAverages.ts
// stub only covered 6 types; this is the faithful superset.

export type MaType =
  | "SMA" | "EMA" | "WMA" | "HMA" | "KAMA"
  | "FRAMA" | "T3" | "ALMA" | "LSMA" | "SLSMA";

export const MA_TYPES: MaType[] =
  ["SMA", "EMA", "WMA", "HMA", "KAMA", "FRAMA", "T3", "ALMA", "LSMA", "SLSMA"];

export interface MaOptions {
  highs?: number[];
  lows?: number[];
  t3VolumeFactor?: number;
  t3Source?: string;
  almaOffset?: number;
  almaSigma?: number;
  lsmaOffset?: number;
  framaFC?: number;
  framaSC?: number;
}

type Series = (number | null)[];

// U8e — SMA
export function smaSeries(values: number[], period: number): Series {
  const r: Series = new Array(values.length).fill(null);
  if (period < 1) return r;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    n += values[i];
    if (i >= period) n -= values[i - period];
    if (i >= period - 1) r[i] = n / period;
  }
  return r;
}

// V8e — EMA (seeded with the SMA of the first `period` values)
export function emaSeries(values: number[], period: number): Series {
  const r: Series = new Array(values.length).fill(null);
  if (period < 1 || values.length < period) return r;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let a = 0; a < period; a++) seed += values[a];
  let s = seed / period;
  r[period - 1] = s;
  for (let a = period; a < values.length; a++) {
    s = values[a] * k + s * (1 - k);
    r[a] = s;
  }
  return r;
}

// W8e / KU — WMA
export function wmaSeries(values: number[], period: number): Series {
  const r: Series = new Array(values.length).fill(null);
  if (period < 1 || values.length < period) return r;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let a = 0; a < period; a++) s += values[i - a] * (period - a);
    r[i] = s / denom;
  }
  return r;
}

// q8e — HMA = WMA(2*WMA(n/2) - WMA(n), sqrt(n))
export function hmaSeries(values: number[], period: number): Series {
  const half = Math.max(1, Math.floor(period / 2));
  const sqrtN = Math.max(1, Math.floor(Math.sqrt(period)));
  const wHalf = wmaSeries(values, half);
  const wFull = wmaSeries(values, period);
  const diff: Series = new Array(values.length).fill(null);
  for (let c = 0; c < values.length; c++) {
    if (wHalf[c] !== null && wFull[c] !== null) {
      diff[c] = 2 * (wHalf[c] as number) - (wFull[c] as number);
    }
  }
  const out: Series = new Array(values.length).fill(null);
  const denom = (sqrtN * (sqrtN + 1)) / 2;
  for (let c = sqrtN - 1; c < values.length; c++) {
    let u = 0;
    let hole = false;
    for (let p = 0; p < sqrtN; p++) {
      const d = diff[c - p];
      if (d === null) { hole = true; break; }
      u += d * (sqrtN - p);
    }
    if (!hole) out[c] = u / denom;
  }
  return out;
}

// H8e — KAMA (Kaufman adaptive; fast=2, slow=30 baked into the .666/.0645 consts)
export function kamaSeries(values: number[], period: number): Series {
  const r: Series = new Array(values.length).fill(null);
  if (values.length <= period || period < 1) return r;
  const fast = 0.666;
  const slow = 0.0645;
  let s = values[period];
  r[period] = s;
  for (let a = period + 1; a < values.length; a++) {
    const change = Math.abs(values[a] - values[a - period]);
    let volatility = 0;
    for (let h = 0; h < period; h++) volatility += Math.abs(values[a - h] - values[a - h - 1]);
    const er = volatility !== 0 ? change / volatility : 0;
    const sc = Math.pow(er * (fast - slow) + slow, 2);
    s = s + sc * (values[a] - s);
    r[a] = s;
  }
  return r;
}

// Y8e — FRAMA (fractal-adaptive; needs highs & lows)
export function framaSeries(
  highs: number[],
  lows: number[],
  period: number,
  fc = 1,
  sc = 198
): Series {
  const out: Series = new Array(highs.length).fill(null);
  const n = period;
  const half = Math.floor(n / 2);
  if (n < 2 || half < 1 || highs.length < n + half) return out;
  const logSc = Math.log(2 / (sc + 1));
  const w = 2 / (sc + 1);
  const mid = new Array(highs.length);
  for (let d = 0; d < highs.length; d++) mid[d] = (highs[d] + lows[d]) / 2;
  let prev = mid[0];
  let lastDim: number | null = null;
  for (let d = 0; d < highs.length; d++) {
    let alpha: number;
    let dim: number | null = null;
    if (d >= n + half - 1) {
      let h1 = -Infinity, l1 = Infinity;
      for (let L = d - half + 1; L <= d; L++) { if (highs[L] > h1) h1 = highs[L]; if (lows[L] < l1) l1 = lows[L]; }
      let h2 = -Infinity, l2 = Infinity;
      for (let L = d - half - n + 1; L <= d - half; L++) { if (highs[L] > h2) h2 = highs[L]; if (lows[L] < l2) l2 = lows[L]; }
      let h3 = -Infinity, l3 = Infinity;
      for (let L = d - n + 1; L <= d; L++) { if (highs[L] > h3) h3 = highs[L]; if (lows[L] < l3) l3 = lows[L]; }
      const n1 = (h1 - l1) / half;
      const n2 = (h2 - l2) / half;
      const n3 = (h3 - l3) / n;
      let D: number;
      if (n1 > 0 && n2 > 0 && n3 > 0) {
        D = (Math.log(n1 + n2) - Math.log(n3)) / Math.log(2);
        lastDim = D;
      } else {
        D = lastDim ?? 0;
      }
      dim = D;
    }
    if (dim !== null) {
      const e = Math.exp(logSc * (dim - 1));
      const clamped = e > 1 ? 1 : e < 0.01 ? 0.01 : e;
      const oldN = (2 - clamped) / clamped;
      const newAlpha = 2 / (((sc - fc) * (oldN - 1)) / (sc - 1) + fc + 1);
      alpha = newAlpha < w ? w : newAlpha > 1 ? 1 : newAlpha;
    } else {
      alpha = w;
    }
    prev = (1 - alpha) * prev + alpha * mid[d];
    if (d >= n + half - 1) out[d] = prev;
  }
  return out;
}

// XU — T3 (Tillson; generalized DEMA chain over 6 EMAs)
export function t3Series(values: number[], period: number, volumeFactor = 0.7, source?: number[]): Series {
  const input = source ?? values;
  const s = input.length;
  const out: Series = new Array(s).fill(null);
  if (s === 0 || period < 1) return out;
  const k = 2 / (period + 1);
  const ema = (arr: number[]): number[] => {
    const a = new Array(arr.length);
    a[0] = arr[0];
    for (let j = 1; j < arr.length; j++) a[j] = k * arr[j] + (1 - k) * a[j - 1];
    return a;
  };
  const e1 = ema(input);
  const e2 = ema(e1);
  const e3 = ema(e2);
  const e4 = ema(e3);
  const e5 = ema(e4);
  const e6 = ema(e5);
  const b = volumeFactor;
  const b2 = b * b;
  const b3 = b2 * b;
  const c1 = -b3;
  const c2 = 3 * b2 + 3 * b3;
  const c3 = -6 * b2 - 3 * b - 3 * b3;
  const c4 = 1 + 3 * b + b3 + 3 * b2;
  const start = Math.min(s, 3 * period);
  for (let i = start; i < s; i++) out[i] = c1 * e6[i] + c2 * e5[i] + c3 * e4[i] + c4 * e3[i];
  return out;
}

// G8e — ALMA (Arnaud Legoux)
export function almaSeries(values: number[], period: number, offset = 0.85, sigma = 6): Series {
  const len = values.length;
  const out: Series = new Array(len).fill(null);
  if (len === 0 || period < 2 || len < period) return out;
  const m = offset * (period - 1);
  const s = period / sigma;
  const w = new Array(period);
  let norm = 0;
  for (let i = 0; i < period; i++) {
    const weight = Math.exp(-Math.pow(i - m, 2) / (2 * s * s));
    w[i] = weight;
    norm += weight;
  }
  if (norm === 0) return out;
  for (let i = period - 1; i < len; i++) {
    let acc = 0;
    for (let p = 0; p < period; p++) acc += w[p] * values[i - period + 1 + p];
    out[i] = acc / norm;
  }
  return out;
}

// GP — Least-squares (linear-regression) MA core; offset projects the fit forward
function lsmaCore(values: number[], period: number, offset = 0): Series {
  const n = values.length;
  const out: Series = new Array(n).fill(null);
  if (n === 0 || period < 2 || n < period) return out;
  const sx = (period * (period - 1)) / 2;
  const sxx = ((period - 1) * period * (2 * period - 1)) / 6;
  const det = period * sxx - sx * sx;
  if (det === 0) return out;
  for (let c = period - 1; c < n; c++) {
    let sy = 0;
    let sxy = 0;
    let ok = true;
    for (let g = 0; g < period; g++) {
      const x = values[c - period + 1 + g];
      if (x === null || !Number.isFinite(x)) { ok = false; break; }
      sy += x;
      sxy += g * x;
    }
    if (!ok) continue;
    const slope = (period * sxy - sx * sy) / det;
    const intercept = (sy - slope * sx) / period;
    out[c] = intercept + slope * (period - 1 - offset);
  }
  return out;
}

// K8e — LSMA
export function lsmaSeries(values: number[], period: number, offset = 0): Series {
  return lsmaCore(values, period, offset);
}

// X8e — SLSMA (smoothed: LSMA applied twice)
export function slsmaSeries(values: number[], period: number, offset = 0): Series {
  const first = lsmaCore(values, period, offset);
  return lsmaCore(first.map((v) => (v == null ? NaN : v)) as number[], period, offset);
}

// J8e — hlc2_close blend used as an alternate T3 source
function hlc2CloseBlend(highs: number[], lows: number[], closes: number[]): number[] {
  const n = closes.length;
  const out = new Array(n);
  for (let s = 0; s < n; s++) out[s] = (highs[s] + lows[s] + 2 * closes[s]) / 4;
  return out;
}

// jF — dispatcher: (values, period, type, opts) → MA series
export function computeMaByType(
  values: number[],
  period: number,
  type: MaType,
  opts?: MaOptions
): Series {
  switch (type) {
    case "SMA": return smaSeries(values, period);
    case "EMA": return emaSeries(values, period);
    case "WMA": return wmaSeries(values, period);
    case "HMA": return hmaSeries(values, period);
    case "KAMA": return kamaSeries(values, period);
    case "T3": {
      const vf = opts?.t3VolumeFactor ?? 0.7;
      if (
        opts?.t3Source === "hlc2_close" &&
        opts.highs && opts.lows &&
        opts.highs.length === values.length &&
        opts.lows.length === values.length
      ) {
        const src = hlc2CloseBlend(opts.highs, opts.lows, values);
        return t3Series(values, period, vf, src);
      }
      return t3Series(values, period, vf);
    }
    case "ALMA": return almaSeries(values, period, opts?.almaOffset ?? 0.85, opts?.almaSigma ?? 6);
    case "LSMA": return lsmaSeries(values, period, opts?.lsmaOffset ?? 0);
    case "SLSMA": return slsmaSeries(values, period, opts?.lsmaOffset ?? 0);
    case "FRAMA":
    default: {
      const highs = opts?.highs ?? values;
      const lows = opts?.lows ?? values;
      return framaSeries(highs, lows, period, opts?.framaFC ?? 1, opts?.framaSC ?? 198);
    }
  }
}
