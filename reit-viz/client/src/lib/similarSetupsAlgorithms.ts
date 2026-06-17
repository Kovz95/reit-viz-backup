// Faithful reconstruction of similarSetupsAlgorithms-CYRAhj-A.js (production chunk).
//
// Ground truth: recovered-bundle-min/similarSetupsAlgorithms-CYRAhj-A.js plus its
// dependencies (index-CsG73Aq_.js math helpers, oscillatorMath-DdsdJyTp.js,
// harsi-NMVnsDcX.js, tva-DaeKqI67.js). All indicator math below is transcribed
// verbatim from those minified sources, with the original local names noted.
//
// Export map (from the import aliases in SimilarSetups-B0jnj8dI.js):
//   D = defaultFeatures   (xt)
//   F = featurePresets     (zt)
//   A = algoMeta           (Ut)
//   a = algoKeys           (jt)
//   b = featureKeys        (qt = Object.keys(featureMeta))
//   T = TIME feature meta  (Yt)            → exported here as timeFeatureMeta
//   c = featureMeta        (Rt, technical) → exported here as featureMeta
//   d = computeFeatures    (Wt)
//   e = computeTimeDim     (Ht)
//   r = dispatchAlgo       ($t)

// ── Public types ──────────────────────────────────────────────────────────────

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

export interface FeatureComputeInput {
  closes: number[];
  highs?: number[];
  lows?: number[];
  volumes?: number[];
  opens?: number[];
  dates?: string[];
  benchCloses?: number[];
  fundamentals?: Record<string, (number | null)[]>;
  [key: string]: any;
}

export interface FeatureVector {
  date: string;
  features: Record<string, number | null>;
}

// Category ordering (Tt in SimilarSetups bundle).
export const featureCategories: string[] = [
  "Trend",
  "MA Distance",
  "MA Spread",
  "Momentum",
  "Oscillator",
  "Volatility",
  "Range / Channel",
  "Distribution",
  "Volume",
  "Cross-Sectional",
  "App-Specific",
  "Time",
];

// ════════════════════════════════════════════════════════════════════════════
//  Low-level math helpers
// ════════════════════════════════════════════════════════════════════════════

// {time,value} series adapters used by the index-module helpers (w / M in source).
interface SeriesPoint { time: string; value: number }

// w(t): number[] → [{time:index, value}]
function toSeries(arr: number[]): SeriesPoint[] {
  return arr.map((v, n) => ({ time: String(n), value: v }));
}

// M(series, len, fill): {time,value}[] → number[] (re-indexed by time)
function fromSeries(series: Array<{ time: string | number; value: number }>, len: number, fill = NaN): number[] {
  const out = new Array(len).fill(fill);
  for (const p of series) {
    const o = Number(p.time);
    if (o >= 0 && o < len) out[o] = p.value;
  }
  return out;
}

// D(arr): (number|null)[] → number[] (null → NaN)
function nullToNaN(arr: Array<number | null>): number[] {
  return arr.map((v) => (v === null ? NaN : (v as number)));
}

// ── Moving averages (index-CsG73Aq_.js) ──────────────────────────────────────

// U8e — SMA over number[]
function sma(arr: number[], period: number): (number | null)[] {
  const out = new Array(arr.length).fill(null);
  if (period < 1) return out;
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[i];
    if (i >= period) s -= arr[i - period];
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}

// V8e — EMA over number[]
function ema(arr: number[], period: number): (number | null)[] {
  const out = new Array(arr.length).fill(null);
  if (period < 1 || arr.length < period) return out;
  const k = 2 / (period + 1);
  let i0 = 0;
  for (let a = 0; a < period; a++) i0 += arr[a];
  let s = i0 / period;
  out[period - 1] = s;
  for (let a = period; a < arr.length; a++) {
    s = arr[a] * k + s * (1 - k);
    out[a] = s;
  }
  return out;
}

// W8e / KU — WMA over number[]
function wma(arr: number[], period: number): (number | null)[] {
  const out = new Array(arr.length).fill(null);
  if (period < 1 || arr.length < period) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < arr.length; i++) {
    let s = 0;
    for (let a = 0; a < period; a++) s += arr[i - a] * (period - a);
    out[i] = s / denom;
  }
  return out;
}

// q8e — HMA over number[]
function hma(arr: number[], period: number): (number | null)[] {
  const half = Math.max(1, Math.floor(period / 2));
  const root = Math.max(1, Math.floor(Math.sqrt(period)));
  const wHalf = wma(arr, half);
  const wFull = wma(arr, period);
  const diff = new Array(arr.length).fill(null);
  for (let c = 0; c < arr.length; c++) {
    if (wHalf[c] !== null && wFull[c] !== null) diff[c] = 2 * (wHalf[c] as number) - (wFull[c] as number);
  }
  const out = new Array(arr.length).fill(null);
  const denom = (root * (root + 1)) / 2;
  for (let c = root - 1; c < arr.length; c++) {
    let u = 0;
    let bad = false;
    for (let p = 0; p < root; p++) {
      const d = diff[c - p];
      if (d === null) { bad = true; break; }
      u += d * (root - p);
    }
    if (!bad) out[c] = u / denom;
  }
  return out;
}

// H8e — KAMA over number[]
function kama(arr: number[], period: number): (number | null)[] {
  const out = new Array(arr.length).fill(null);
  if (arr.length <= period || period < 1) return out;
  const fastest = 0.666;
  const slowest = 0.0645;
  let s = arr[period];
  out[period] = s;
  for (let a = period + 1; a < arr.length; a++) {
    const change = Math.abs(arr[a] - arr[a - period]);
    let vol = 0;
    for (let h = 0; h < period; h++) vol += Math.abs(arr[a - h] - arr[a - h - 1]);
    const er = vol !== 0 ? change / vol : 0;
    const sc = Math.pow(er * (fastest - slowest) + slowest, 2);
    s = s + sc * (arr[a] - s);
    out[a] = s;
  }
  return out;
}

// XU — T3 over number[] (volume factor r)
function t3(arr: number[], period: number, vfactor = 0.7, src?: number[]): (number | null)[] {
  const base = src ?? arr;
  const n = base.length;
  const out = new Array(n).fill(null);
  if (n === 0 || period < 1) return out;
  const k = 2 / (period + 1);
  const e = (seq: number[]): number[] => {
    const o = new Array(seq.length);
    o[0] = seq[0];
    for (let j = 1; j < seq.length; j++) o[j] = k * seq[j] + (1 - k) * o[j - 1];
    return o;
  };
  const e1 = e(base);
  const e2 = e(e1);
  const e3 = e(e2);
  const e4 = e(e3);
  const e5 = e(e4);
  const e6 = e(e5);
  const v2 = vfactor * vfactor;
  const v3 = v2 * vfactor;
  const c1 = -v3;
  const c2 = 3 * v2 + 3 * v3;
  const c3 = -6 * v2 - 3 * vfactor - 3 * v3;
  const c4 = 1 + 3 * vfactor + v3 + 3 * v2;
  const start = Math.min(n, 3 * period);
  for (let i = start; i < n; i++) out[i] = c1 * e6[i] + c2 * e5[i] + c3 * e4[i] + c4 * e3[i];
  return out;
}

// G8e — ALMA over number[]
function alma(arr: number[], period: number, offset = 0.85, sigma = 6): (number | null)[] {
  const n = arr.length;
  const out = new Array(n).fill(null);
  if (n === 0 || period < 2 || n < period) return out;
  const m = offset * (period - 1);
  const s = period / sigma;
  const w = new Array(period);
  let norm = 0;
  for (let u = 0; u < period; u++) {
    const ww = Math.exp(-Math.pow(u - m, 2) / (2 * s * s));
    w[u] = ww;
    norm += ww;
  }
  if (norm === 0) return out;
  for (let u = period - 1; u < n; u++) {
    let acc = 0;
    for (let p = 0; p < period; p++) acc += w[p] * arr[u - period + 1 + p];
    out[u] = acc / norm;
  }
  return out;
}

// Y8e — FRAMA over (highs, lows)
function frama(highs: number[], lows: number[], period: number, fc = 1, sc = 198): (number | null)[] {
  const n = highs.length;
  const out = new Array(n).fill(null);
  const win = period;
  const halfWin = Math.floor(win / 2);
  if (win < 2 || halfWin < 1 || n < win + halfWin) return out;
  const logFc = Math.log(2 / (sc + 1));
  const kFast = 2 / (sc + 1);
  const mid = new Array(n);
  for (let d = 0; d < n; d++) mid[d] = (highs[d] + lows[d]) / 2;
  let filt = mid[0];
  let prevDim: number | null = null;
  for (let d = 0; d < n; d++) {
    let alpha: number;
    let dim: number | null = null;
    if (d >= win + halfWin - 1) {
      let h1 = -Infinity, l1 = Infinity;
      for (let L = d - halfWin + 1; L <= d; L++) { if (highs[L] > h1) h1 = highs[L]; if (lows[L] < l1) l1 = lows[L]; }
      let h2 = -Infinity, l2 = Infinity;
      for (let L = d - halfWin - win + 1; L <= d - halfWin; L++) { if (highs[L] > h2) h2 = highs[L]; if (lows[L] < l2) l2 = lows[L]; }
      let h3 = -Infinity, l3 = Infinity;
      for (let L = d - win + 1; L <= d; L++) { if (highs[L] > h3) h3 = highs[L]; if (lows[L] < l3) l3 = lows[L]; }
      const n1 = (h1 - l1) / halfWin;
      const n2 = (h2 - l2) / halfWin;
      const n3 = (h3 - l3) / win;
      let D: number;
      if (n1 > 0 && n2 > 0 && n3 > 0) {
        D = (Math.log(n1 + n2) - Math.log(n3)) / Math.log(2);
        prevDim = D;
      } else {
        D = prevDim ?? 0;
      }
      dim = D;
    }
    if (dim !== null) {
      const ex = Math.exp(logFc * (dim - 1));
      const clamped = ex > 1 ? 1 : ex < 0.01 ? 0.01 : ex;
      const oldN = (2 - clamped) / clamped;
      const newAlpha = 2 / (((sc - fc) * (oldN - 1)) / (sc - 1) + fc + 1);
      alpha = newAlpha < kFast ? kFast : newAlpha > 1 ? 1 : newAlpha;
    } else {
      alpha = kFast;
    }
    filt = (1 - alpha) * filt + alpha * mid[d];
    if (d >= win + halfWin - 1) out[d] = filt;
  }
  return out;
}

// GP — linear-regression MA (LSMA) over number[]
function linregMA(arr: number[], period: number, offset = 0): (number | null)[] {
  const n = arr.length;
  const out = new Array(n).fill(null);
  if (n === 0 || period < 2 || n < period) return out;
  const s = period;
  const sumX = (s * (s - 1)) / 2;
  const sumX2 = ((s - 1) * s * (2 * s - 1)) / 6;
  const denom = s * sumX2 - sumX * sumX;
  if (denom === 0) return out;
  for (let c = period - 1; c < n; c++) {
    let sumY = 0, sumXY = 0, ok = true;
    for (let g = 0; g < period; g++) {
      const x = arr[c - period + 1 + g];
      if (x === null || !Number.isFinite(x)) { ok = false; break; }
      sumY += x;
      sumXY += g * x;
    }
    if (!ok) continue;
    const slope = (s * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / s;
    out[c] = intercept + slope * (period - 1 - offset);
  }
  return out;
}

// ── ROC / RSI / MACD / ATR / OBV / Bollinger ({time,value} series) ────────────

// lV — ROC over series (period default 12)
function rocSeries(series: SeriesPoint[], period = 12): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let n = period; n < series.length; n++) {
    const prev = series[n - period].value;
    const v = prev !== 0 ? ((series[n].value - prev) / prev) * 100 : 0;
    out.push({ time: series[n].time, value: v });
  }
  return out;
}

// JU — RSI over series
function rsiSeries(series: SeriesPoint[], period = 14): SeriesPoint[] {
  if (series.length < period + 1) return [];
  const out: SeriesPoint[] = [];
  let gain = 0, loss = 0;
  for (let a = 1; a <= period; a++) {
    const d = series[a].value - series[a - 1].value;
    if (d > 0) gain += d; else loss += Math.abs(d);
  }
  gain /= period; loss /= period;
  const rs = loss === 0 ? 100 : gain / loss;
  out.push({ time: series[period].time, value: 100 - 100 / (1 + rs) });
  for (let a = period + 1; a < series.length; a++) {
    const d = series[a].value - series[a - 1].value;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? Math.abs(d) : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    const v = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    out.push({ time: series[a].time, value: v });
  }
  return out;
}

// PKe / KP — MACD over series. Returns {macd, signal, histogram} keyed like the
// algorithms module expects (e.macd / e.signal / e.histogram).
function macdSeries(series: SeriesPoint[], fast = 12, slow = 26, signal = 9): {
  macd: SeriesPoint[];
  signal: SeriesPoint[];
  histogram: SeriesPoint[];
} {
  const emaSeries = (pts: SeriesPoint[], period: number): SeriesPoint[] => {
    const vals = pts.map((p) => p.value);
    const e = ema(vals, period);
    const out: SeriesPoint[] = [];
    for (let i = 0; i < pts.length; i++) if (e[i] !== null) out.push({ time: pts[i].time, value: e[i] as number });
    return out;
  };
  const f = emaSeries(series, Math.max(1, fast));
  const sl = emaSeries(series, Math.max(1, slow));
  const slMap = new Map(sl.map((p) => [p.time, p.value]));
  const macdLine: SeriesPoint[] = [];
  for (const p of f) {
    const g = slMap.get(p.time);
    if (g !== undefined) macdLine.push({ time: p.time, value: p.value - g });
  }
  const sig = emaSeries(macdLine, Math.max(1, signal));
  const sigMap = new Map(sig.map((p) => [p.time, p.value]));
  const hist: SeriesPoint[] = [];
  for (const p of macdLine) {
    const g = sigMap.get(p.time);
    if (g !== undefined) hist.push({ time: p.time, value: p.value - g });
  }
  return { macd: macdLine, signal: sig, histogram: hist };
}

// aV — ATR (Wilder) computed off close-only series; returns series of ATR values.
function atrCloseSeries(series: SeriesPoint[], period = 14): SeriesPoint[] {
  if (series.length < 2) return [];
  const diffs: number[] = [];
  for (let s = 1; s < series.length; s++) diffs.push(Math.abs(series[s].value - series[s - 1].value));
  if (diffs.length < period) return [];
  const out: SeriesPoint[] = [];
  let acc = 0;
  for (let s = 0; s < period; s++) acc += diffs[s];
  acc /= period;
  out.push({ time: series[period].time, value: acc });
  for (let s = period; s < diffs.length; s++) {
    acc = (acc * (period - 1) + diffs[s]) / period;
    out.push({ time: series[s + 1].time, value: acc });
  }
  return out;
}

// uV — OBV over series. Optional volume series keyed by time.
function obvSeries(series: SeriesPoint[], volume?: SeriesPoint[]): SeriesPoint[] {
  if (series.length < 2) return [];
  const out: SeriesPoint[] = [];
  let n = 0;
  if (volume && volume.length > 0) {
    const vMap = new Map(volume.map((p) => [p.time, p.value]));
    out.push({ time: series[0].time, value: 0 });
    for (let s = 1; s < series.length; s++) {
      const vol = vMap.get(series[s].time) ?? 0;
      if (series[s].value > series[s - 1].value) n += vol;
      else if (series[s].value < series[s - 1].value) n -= vol;
      out.push({ time: series[s].time, value: n });
    }
  } else {
    out.push({ time: series[0].time, value: 0 });
    for (let i = 1; i < series.length; i++) {
      if (series[i].value > series[i - 1].value) n += 1;
      else if (series[i].value < series[i - 1].value) n -= 1;
      out.push({ time: series[i].time, value: n });
    }
  }
  return out;
}

// ZP — Bollinger Bands over series.
function bollinger(series: SeriesPoint[], period = 20, mult = 2): {
  basis: SeriesPoint[];
  upper: SeriesPoint[];
  lower: SeriesPoint[];
} {
  const basis: SeriesPoint[] = [];
  const upper: SeriesPoint[] = [];
  const lower: SeriesPoint[] = [];
  for (let a = period - 1; a < series.length; a++) {
    let s = 0;
    for (let h = 0; h < period; h++) s += series[a - h].value;
    const m = s / period;
    let ss = 0;
    for (let h = 0; h < period; h++) { const d = series[a - h].value - m; ss += d * d; }
    const sd = Math.sqrt(ss / period);
    basis.push({ time: series[a].time, value: m });
    upper.push({ time: series[a].time, value: m + mult * sd });
    lower.push({ time: series[a].time, value: m - mult * sd });
  }
  return { basis, upper, lower };
}

// ── oscillatorMath-DdsdJyTp.js ────────────────────────────────────────────────

// m — SMA (null-aware) used inside oscillatorMath
function smaNullable(arr: Array<number | null>, period: number): (number | null)[] {
  const out = new Array(arr.length).fill(null);
  if (arr.length < period) return out;
  let s = 0;
  for (let i = 0; i < period; i++) s += arr[i] as number;
  out[period - 1] = s / period;
  for (let i = period; i < arr.length; i++) {
    s += (arr[i] as number) - (arr[i - period] as number);
    out[i] = s / period;
  }
  return out;
}

// A (oscillatorMath) — Stochastic %K/%D over highs/lows/closes.
function stochastic(
  highs: number[], lows: number[], closes: number[], length: number, smoothK: number, smoothD: number
): { k: (number | null)[]; d: (number | null)[] } {
  const t = closes.length;
  const raw = new Array(t).fill(null);
  for (let l = length - 1; l < t; l++) {
    let hh = -Infinity, ll = Infinity;
    for (let x = l - length + 1; x <= l; x++) { if (highs[x] > hh) hh = highs[x]; if (lows[x] < ll) ll = lows[x]; }
    const range = hh - ll;
    raw[l] = range === 0 || !isFinite(range) ? 50 : (100 * (closes[l] - ll)) / range;
  }
  const offset = length - 1;
  const rawTrim: Array<number | null> = [];
  for (let l = offset; l < t; l++) rawTrim.push(raw[l]);
  const kSm = smaNullable(rawTrim, smoothK);
  const kArr = new Array(t).fill(null);
  for (let l = 0; l < kSm.length; l++) kArr[offset + l] = kSm[l];
  const dStart = offset + smoothK - 1;
  const kTrim: number[] = [];
  for (let l = dStart; l < t; l++) {
    const v = kArr[l];
    if (v === null) break;
    kTrim.push(v);
  }
  const dSm = smaNullable(kTrim, smoothD);
  const dArr = new Array(t).fill(null);
  for (let l = 0; l < dSm.length; l++) dArr[dStart + l] = dSm[l];
  return { k: kArr, d: dArr };
}

// k (oscillatorMath) — Elliott Wave Oscillator = SMA(fast, (H+L)/2) − SMA(slow, (H+L)/2)
function ewo(highs: number[], lows: number[], fast: number, slow: number): (number | null)[] {
  const s = highs.length;
  const mid = new Array(s);
  for (let n = 0; n < s; n++) mid[n] = (highs[n] + lows[n]) / 2;
  const fastMa = smaNullable(mid, fast);
  const slowMa = smaNullable(mid, slow);
  const out = new Array(s).fill(null);
  for (let n = 0; n < s; n++) {
    if (fastMa[n] !== null && slowMa[n] !== null) out[n] = (fastMa[n] as number) - (slowMa[n] as number);
  }
  return out;
}

// ── harsi-NMVnsDcX.js ─────────────────────────────────────────────────────────

function harsiRsiRaw(arr: number[], len: number): (number | null)[] {
  const u = arr.length;
  const out = new Array(u).fill(null);
  if (u < 2 || len < 1) return out;
  let gain = 0, loss = 0, count = 0;
  for (let e = 1; e < u; e++) {
    const d = arr[e] - arr[e - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    if (count < len) {
      gain += g; loss += l; count++;
      if (count === len) {
        gain /= len; loss /= len;
        const rs = loss === 0 ? Infinity : gain / loss;
        out[e] = loss === 0 ? 100 : 100 - 100 / (1 + rs);
      }
    } else {
      gain = (gain * (len - 1) + g) / len;
      loss = (loss * (len - 1) + l) / len;
      const rs = loss === 0 ? Infinity : gain / loss;
      out[e] = loss === 0 ? 100 : 100 - 100 / (1 + rs);
    }
  }
  return out;
}

function harsiRsiCentered(arr: number[], len: number): (number | null)[] {
  return harsiRsiRaw(arr, len).map((v) => (v === null ? null : v - 50));
}

function harsiRsiSmoothed(arr: number[], len: number, smoothed: boolean): (number | null)[] {
  const base = harsiRsiCentered(arr, len);
  if (!smoothed) return base;
  const out = new Array(base.length).fill(null);
  let prev: number | null = null;
  for (let s = 0; s < base.length; s++) {
    const e = base[s];
    if (e === null) { prev = null; continue; }
    if (prev === null) { prev = e; out[s] = e; } else { prev = (prev + e) / 2; out[s] = prev; }
  }
  return out;
}

function harsiSmaNull(arr: Array<number | null>, period: number): (number | null)[] {
  const out = new Array(arr.length).fill(null);
  if (period < 1) return out;
  let sum = 0, count = 0;
  const ring = new Array(period).fill(null);
  for (let s = 0; s < arr.length; s++) {
    const e = ring[s % period];
    if (e !== null) { sum -= e; count--; }
    const i = arr[s];
    ring[s % period] = i;
    if (i !== null) { sum += i; count++; }
    if (count === period) out[s] = sum / period;
  }
  return out;
}

function harsiStochRsiRaw(arr: Array<number | null>, len: number): (number | null)[] {
  const out = new Array(arr.length).fill(null);
  for (let t = len - 1; t < arr.length; t++) {
    let hi = -Infinity, lo = Infinity, ok = true;
    for (let h = 0; h < len; h++) {
      const a = arr[t - h];
      if (a === null) { ok = false; break; }
      if (a > hi) hi = a;
      if (a < lo) lo = a;
    }
    if (!ok) continue;
    const e = arr[t] as number;
    const range = hi - lo;
    out[t] = range > 0 ? ((e - lo) / range) * 100 : 50;
  }
  return out;
}

function harsiStoch(arr: Array<number | null>, len: number, smoothK: number, fit: number): (number | null)[] {
  const centered = harsiStochRsiRaw(arr, len).map((e) => (e === null ? null : e - 50));
  return harsiSmaNull(centered, smoothK).map((e) => (e === null ? null : (e / 100) * fit));
}

// T (harsi) — full HARSI computation. Returns rsi/haClose/stochK/stochKD.
function harsi(
  closes: number[], highs: number[], lows: number[], opts: Record<string, any> = {}, opens?: number[]
): { rsi: (number | null)[]; haClose: (number | null)[]; stochK: (number | null)[]; stochKD: (number | null)[] } {
  const candleLength = opts.candleLength ?? 14;
  const candleSmoothing = Math.max(1, opts.candleSmoothing ?? 1);
  const rsiLength = opts.rsiLength ?? 7;
  const rsiSmoothed = opts.rsiSmoothed ?? true;
  const stochLength = opts.stochLength ?? 14;
  const smoothK = opts.smoothK ?? 3;
  const smoothD = opts.smoothD ?? 3;
  const stochFit = opts.stochFit ?? 80;
  const m = closes.length;

  const rsiSrc = new Array(m);
  for (let o = 0; o < m; o++) {
    const open = opens ? opens[o] : (highs[o] + lows[o] + closes[o]) / 3;
    rsiSrc[o] = (open + highs[o] + lows[o] + closes[o]) / 4;
  }
  const rsi = harsiRsiSmoothed(rsiSrc, rsiLength, rsiSmoothed);

  const cClose = harsiRsiCentered(closes, candleLength);
  const cHigh = harsiRsiCentered(highs, candleLength);
  const cLow = harsiRsiCentered(lows, candleLength);

  const haClose = new Array(m).fill(null);
  const haOpen = new Array(m).fill(null);
  for (let o = 0; o < m; o++) {
    const f = cClose[o];
    if (f === null) continue;
    const prevClose = o > 0 ? cClose[o - 1] : null;
    const openVal = prevClose !== null ? prevClose : f;
    const hi = cHigh[o], lo = cLow[o];
    if (hi === null || lo === null) continue;
    const hh = Math.max(hi, lo), ll = Math.min(hi, lo);
    const haC = (openVal + hh + ll + f) / 4;
    const prevHaOpen = o > 0 ? haOpen[o - 1] : null;
    const prevHaClose = o > 0 ? haClose[o - 1] : null;
    const haO = prevHaOpen === null || prevHaClose === null
      ? (openVal + f) / 2
      : (prevHaOpen * candleSmoothing + prevHaClose) / (candleSmoothing + 1);
    haOpen[o] = haO;
    haClose[o] = haC;
  }

  const stochK = harsiStoch(rsi, stochLength, smoothK, stochFit);
  const stochD = harsiSmaNull(stochK, smoothD);
  const stochKD = stochK.map((o, f) => (o !== null && stochD[f] !== null ? o - (stochD[f] as number) : null));

  return { rsi, haClose, stochK, stochKD };
}

// ── tva-DaeKqI67.js (Trading Volume Activity) ─────────────────────────────────

function tvaWma(arr: number[], period: number): number[] {
  const c = arr.length;
  const out = new Array(c).fill(NaN);
  if (period <= 0 || c === 0) return out;
  const denom = (period * (period + 1)) / 2;
  for (let r = period - 1; r < c; r++) {
    let n = 0, ok = true;
    for (let t = 0; t < period; t++) {
      const f = arr[r - (period - 1 - t)];
      if (!Number.isFinite(f)) { ok = false; break; }
      n += f * (t + 1);
    }
    if (ok) out[r] = n / denom;
  }
  return out;
}

function tvaSma(arr: number[], period: number): number[] {
  const c = arr.length;
  const out = new Array(c).fill(NaN);
  if (period <= 0 || c === 0) return out;
  let u = 0, r = 0;
  for (let n = 0; n < c; n++) {
    const s = arr[n];
    if (Number.isFinite(s)) { u += s; r += 1; }
    if (n >= period) {
      const t = arr[n - period];
      if (Number.isFinite(t)) { u -= t; r -= 1; }
    }
    if (n >= period - 1 && r === period) out[n] = u / period;
  }
  return out;
}

function tva(closes: number[], volumes: number[], length = 15, smooth = 3, mult = 5): {
  os: number[]; bullPressure: number[]; bearPressure: number[];
} {
  const r = closes.length;
  const os = new Array(r).fill(NaN);
  const risingBull = new Array(r).fill(NaN);
  const risingBear = new Array(r).fill(NaN);
  const decliningBull = new Array(r).fill(NaN);
  const decliningBear = new Array(r).fill(NaN);
  const bullPressure = new Array(r).fill(NaN);
  const bearPressure = new Array(r).fill(NaN);
  if (r === 0) return { os, bullPressure, bearPressure };

  const w = tvaWma(closes, length);
  const s = tvaSma(closes, length);
  for (let i = 0; i < r; i++) if (Number.isFinite(w[i]) && Number.isFinite(s[i])) os[i] = w[i] - s[i];

  const upVol = new Array(r).fill(0);
  const downVol = new Array(r).fill(0);
  for (let i = 1; i < r; i++) {
    const change = volumes[i] - volumes[i - 1]; // NOTE: source uses e[i]-e[i-1] where e=volumes
    const a = volumes[i];
    if (Number.isFinite(a)) {
      if (Number.isFinite(change) && change > 0) upVol[i] = a;
      else if (Number.isFinite(change) && change < 0) downVol[i] = a;
    }
  }
  const upSm = tvaSma(upVol, smooth);
  const downSm = tvaSma(downVol, smooth);

  for (let i = 0; i < r; i++) {
    const N = os[i];
    const a = Number.isFinite(upSm[i]) ? upSm[i] : 0;
    const x = Number.isFinite(downSm[i]) ? downSm[i] : 0;
    const T = i > 0 && Number.isFinite(risingBull[i - 1]) ? risingBull[i - 1] : 0;
    const V = i > 0 && Number.isFinite(risingBear[i - 1]) ? risingBear[i - 1] : 0;
    const j = i > 0 && Number.isFinite(decliningBull[i - 1]) ? decliningBull[i - 1] : 0;
    const q = i > 0 && Number.isFinite(decliningBear[i - 1]) ? decliningBear[i - 1] : 0;
    if (!Number.isFinite(N)) continue;
    let rBull = 0, rBear = 0, dBull = 0, dBear = 0;
    if (N > 0) { rBull = T + a; dBull = j - x; }
    else if (N < 0) { rBear = V + a; dBear = q - x; }
    risingBull[i] = rBull;
    risingBear[i] = rBear;
    decliningBull[i] = dBull;
    decliningBear[i] = dBear;
    bullPressure[i] = rBull + dBear;
    bearPressure[i] = rBear + dBull;
  }
  // mult only affects the (unused here) a/b smoothed outputs; os/pressures returned as-is.
  void mult;
  return { os, bullPressure, bearPressure };
}

// ════════════════════════════════════════════════════════════════════════════
//  Feature-level helpers (similarSetupsAlgorithms-CYRAhj-A.js)
// ════════════════════════════════════════════════════════════════════════════

// _ — simple return over period
function pctReturn(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    const prev = arr[i - period];
    if (prev > 0 && arr[i] > 0) out[i] = arr[i] / prev - 1;
  }
  return out;
}

// C — annualised realised vol over period (log-returns × √252)
function realisedVol(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  const logRet = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) if (arr[i - 1] > 0 && arr[i] > 0) logRet[i] = Math.log(arr[i] / arr[i - 1]);
  for (let i = period; i < n; i++) {
    let s = 0, count = 0;
    for (let c = i - period + 1; c <= i; c++) if (Number.isFinite(logRet[c])) { s += logRet[c]; count++; }
    if (count < period) continue;
    const m = s / count;
    let ss = 0;
    for (let c = i - period + 1; c <= i; c++) ss += (logRet[c] - m) ** 2;
    out[i] = Math.sqrt((ss / count) * 252);
  }
  return out;
}

// O — rolling max
function rollMax(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let m = -Infinity;
    for (let a = i - period + 1; a <= i; a++) if (arr[a] > m) m = arr[a];
    out[i] = m;
  }
  return out;
}

// E — rolling min
function rollMin(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let m = Infinity;
    for (let a = i - period + 1; a <= i; a++) if (arr[a] < m) m = arr[a];
    out[i] = m;
  }
  return out;
}

// it — distance to rolling 52w high
function distToRollHigh(arr: number[], period: number): number[] {
  const hi = rollMax(arr, period);
  return arr.map((r, i) => (Number.isFinite(hi[i]) && hi[i] > 0 && r > 0 ? r / hi[i] - 1 : NaN));
}

// at — distance to rolling 52w low
function distToRollLow(arr: number[], period: number): number[] {
  const lo = rollMin(arr, period);
  return arr.map((r, i) => (Number.isFinite(lo[i]) && lo[i] > 0 && r > 0 ? r / lo[i] - 1 : NaN));
}

// ot — drawdown from running ATH
function drawdownFromAth(arr: number[]): number[] {
  const out = new Array(arr.length).fill(NaN);
  let peak = -Infinity;
  for (let r = 0; r < arr.length; r++) {
    if (arr[r] > peak) peak = arr[r];
    if (peak > 0 && arr[r] > 0) out[r] = arr[r] / peak - 1;
  }
  return out;
}

// q — days since rolling extreme (max|min)
function daysSinceExtreme(arr: number[], period: number, mode: "max" | "min"): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  for (let o = period - 1; o < n; o++) {
    let idx = o, best = arr[o];
    for (let s = o - period + 1; s <= o; s++) {
      const c = arr[s];
      if (Number.isFinite(c) && (mode === "max" ? c > best : c < best)) { best = c; idx = s; }
    }
    out[o] = o - idx;
  }
  return out;
}

// lt — days since all-time high
function daysSinceAth(arr: number[]): number[] {
  const out = new Array(arr.length).fill(NaN);
  let idx = 0, best = arr[0];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > best) { best = arr[i]; idx = i; }
    out[i] = i - idx;
  }
  return out;
}

// st — Bollinger %B
function bbPctB(arr: number[], period: number, mult: number): number[] {
  const bb = bollinger(toSeries(arr), period, mult);
  const upper = fromSeries(bb.upper, arr.length);
  const lower = fromSeries(bb.lower, arr.length);
  return arr.map((a, l) => {
    const u = upper[l], lo = lower[l];
    return Number.isFinite(u) && Number.isFinite(lo) && u !== lo ? (a - lo) / (u - lo) : NaN;
  });
}

// ct — Bollinger width = (upper − lower) / basis
function bbWidth(arr: number[], period: number, mult: number): number[] {
  const bb = bollinger(toSeries(arr), period, mult);
  const upper = fromSeries(bb.upper, arr.length);
  const lower = fromSeries(bb.lower, arr.length);
  const basis = fromSeries(bb.basis, arr.length);
  return arr.map((_, s) =>
    Number.isFinite(upper[s]) && Number.isFinite(lower[s]) && Number.isFinite(basis[s]) && basis[s] !== 0
      ? (upper[s] - lower[s]) / basis[s]
      : NaN
  );
}

// j — Wilder ATR over highs/lows/closes
function atr(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const i = closes.length;
  const tr = new Array(i).fill(NaN);
  for (let c = 1; c < i; c++) {
    const u = highs[c] - lows[c];
    const m = Math.abs(highs[c] - closes[c - 1]);
    const f = Math.abs(lows[c] - closes[c - 1]);
    tr[c] = Math.max(u, m, f);
  }
  const out = new Array(i).fill(NaN);
  if (i < period + 1) return out;
  let l = 0, s = 0;
  for (let c = 1; c <= period; c++) if (Number.isFinite(tr[c])) { l += tr[c]; s++; }
  if (s === 0) return out;
  l /= s;
  out[period] = l;
  for (let c = period + 1; c < i; c++) if (Number.isFinite(tr[c])) { l = (l * (period - 1) + tr[c]) / period; out[c] = l; }
  return out;
}

// ut — Keltner %: (close − EMA) / (mult × ATR)
function keltnerPct(highs: number[], lows: number[], closes: number[], emaLen = 20, atrLen = 14, mult = 2): number[] {
  const mid = nullToNaN(ema(closes, emaLen));
  const a = atr(highs, lows, closes, atrLen);
  return closes.map((s, c) =>
    !Number.isFinite(mid[c]) || !Number.isFinite(a[c]) || a[c] === 0 ? NaN : (s - mid[c]) / (mult * a[c])
  );
}

// ft — Donchian %: position of close inside the rolling high/low channel
function donchianPct(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const hi = rollMax(highs, period);
  const lo = rollMin(lows, period);
  return closes.map((a, l) =>
    !Number.isFinite(hi[l]) || !Number.isFinite(lo[l]) || hi[l] === lo[l] ? NaN : (a - lo[l]) / (hi[l] - lo[l])
  );
}

// dt — Williams %R
function williamsR(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const hi = rollMax(highs, period);
  const lo = rollMin(lows, period);
  return closes.map((a, l) =>
    !Number.isFinite(hi[l]) || !Number.isFinite(lo[l]) || hi[l] === lo[l] ? NaN : ((hi[l] - a) / (hi[l] - lo[l])) * -100
  );
}

// ht — CCI(period)
function cci(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const i = closes.length;
  const tp = new Array(i);
  for (let l = 0; l < i; l++) tp[l] = (highs[l] + lows[l] + closes[l]) / 3;
  const out = new Array(i).fill(NaN);
  for (let l = period - 1; l < i; l++) {
    let s = 0;
    for (let m = l - period + 1; m <= l; m++) s += tp[m];
    const mean = s / period;
    let md = 0;
    for (let m = l - period + 1; m <= l; m++) md += Math.abs(tp[m] - mean);
    md /= period;
    out[l] = md === 0 ? 0 : (tp[l] - mean) / (0.015 * md);
  }
  return out;
}

// gt — MFI(period)
function mfi(highs: number[], lows: number[], closes: number[], volumes: number[], period: number): number[] {
  const o = closes.length;
  const tp = new Array(o);
  for (let u = 0; u < o; u++) tp[u] = (highs[u] + lows[u] + closes[u]) / 3;
  const pos = new Array(o).fill(0);
  const neg = new Array(o).fill(0);
  for (let u = 1; u < o; u++) {
    const m = tp[u] * volumes[u];
    if (tp[u] > tp[u - 1]) pos[u] = m;
    else if (tp[u] < tp[u - 1]) neg[u] = m;
  }
  const out = new Array(o).fill(NaN);
  for (let u = period; u < o; u++) {
    let p = 0, n = 0;
    for (let h = u - period + 1; h <= u; h++) { p += pos[h]; n += neg[h]; }
    if (n === 0) { out[u] = 100; continue; }
    const ratio = p / n;
    out[u] = 100 - 100 / (1 + ratio);
  }
  return out;
}

// yt — True Strength Index
function tsi(arr: number[], long = 25, short = 13): number[] {
  const r = arr.length;
  const mom = new Array(r).fill(NaN);
  const absMom = new Array(r).fill(NaN);
  for (let f = 1; f < r; f++) { mom[f] = arr[f] - arr[f - 1]; absMom[f] = Math.abs(mom[f]); }
  const dEma = (seq: number[], len: number): number[] => {
    const out = new Array(r).fill(NaN);
    const k = 2 / (len + 1);
    let start = -1;
    for (let b = 0; b < r; b++) if (Number.isFinite(seq[b])) { start = b; break; }
    if (start < 0 || start + len > r) return out;
    let acc = 0;
    for (let b = start; b < start + len; b++) acc += seq[b];
    let val = acc / len;
    out[start + len - 1] = val;
    for (let b = start + len; b < r; b++) { val = seq[b] * k + val * (1 - k); out[b] = val; }
    return out;
  };
  const e1 = dEma(mom, long);
  const e2 = dEma(e1, short);
  const a1 = dEma(absMom, long);
  const a2 = dEma(a1, short);
  const out = new Array(r).fill(NaN);
  for (let f = 0; f < r; f++) if (Number.isFinite(e2[f]) && Number.isFinite(a2[f]) && a2[f] !== 0) out[f] = 100 * (e2[f] / a2[f]);
  return out;
}

// Nt — Ultimate Oscillator
function ultimateOsc(highs: number[], lows: number[], closes: number[]): number[] {
  const r = closes.length;
  const bp = new Array(r).fill(0);
  const trr = new Array(r).fill(0);
  for (let s = 1; s < r; s++) {
    const low = Math.min(lows[s], closes[s - 1]);
    const high = Math.max(highs[s], closes[s - 1]);
    bp[s] = closes[s] - low;
    trr[s] = high - low;
  }
  const out = new Array(r).fill(NaN);
  const sumWin = (seq: number[], c: number, u: number): number => {
    let m = 0;
    for (let f = c - u + 1; f <= c; f++) m += seq[f];
    return m;
  };
  for (let s = 28; s < r; s++) {
    const avg7 = sumWin(bp, s, 7) / Math.max(1e-12, sumWin(trr, s, 7));
    const avg14 = sumWin(bp, s, 14) / Math.max(1e-12, sumWin(trr, s, 14));
    const avg28 = sumWin(bp, s, 28) / Math.max(1e-12, sumWin(trr, s, 28));
    out[s] = (100 * (4 * avg7 + 2 * avg14 + avg28)) / 7;
  }
  return out;
}

// bt — Stochastic RSI (source mt() = uncentered Wilder RSI, then stochastic of it)
function stochRsi(arr: number[], rsiLen = 14, stochLen = 14): number[] {
  const r = harsiRsiRawUncentered(arr, rsiLen);
  const i = arr.length;
  const out = new Array(i).fill(NaN);
  for (let a = rsiLen + stochLen - 1; a < i; a++) {
    let hi = -Infinity, lo = Infinity, ok = true;
    for (let u = a - stochLen + 1; u <= a; u++) {
      const m = r[u];
      if (!Number.isFinite(m)) { ok = false; break; }
      if (m > hi) hi = m;
      if (m < lo) lo = m;
    }
    if (ok && hi !== lo) out[a] = ((r[a] - lo) / (hi - lo)) * 100;
  }
  return out;
}

// mt — uncentered Wilder RSI as number[] (used by stochRsi)
function harsiRsiRawUncentered(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  if (n < period + 1) return out;
  let gain = 0, loss = 0;
  for (let a = 1; a <= period; a++) {
    const d = arr[a] - arr[a - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let a = period + 1; a < n; a++) {
    const d = arr[a] - arr[a - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[a] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// P — ADX / +DI / −DI
function adxFull(highs: number[], lows: number[], closes: number[], period = 14): {
  adx: number[]; plusDI: number[]; minusDI: number[];
} {
  const i = closes.length;
  const tr = new Array(i).fill(0);
  const plusDM = new Array(i).fill(0);
  const minusDM = new Array(i).fill(0);
  for (let g = 1; g < i; g++) {
    const up = highs[g] - highs[g - 1];
    const down = lows[g - 1] - lows[g];
    plusDM[g] = up > down && up > 0 ? up : 0;
    minusDM[g] = down > up && down > 0 ? down : 0;
    const b = highs[g] - lows[g];
    const v = Math.abs(highs[g] - closes[g - 1]);
    const dd = Math.abs(lows[g] - closes[g - 1]);
    tr[g] = Math.max(b, v, dd);
  }
  const smooth = (seq: number[]): number[] => {
    const out = new Array(i).fill(NaN);
    if (i < period + 1) return out;
    let acc = 0;
    for (let b = 1; b <= period; b++) acc += seq[b];
    out[period] = acc;
    for (let b = period + 1; b < i; b++) { acc = acc - acc / period + seq[b]; out[b] = acc; }
    return out;
  };
  const trS = smooth(tr);
  const plusS = smooth(plusDM);
  const minusS = smooth(minusDM);
  const plusDI = new Array(i).fill(NaN);
  const minusDI = new Array(i).fill(NaN);
  const dx = new Array(i).fill(NaN);
  for (let g = period; g < i; g++) {
    if (!Number.isFinite(trS[g]) || trS[g] === 0) continue;
    plusDI[g] = 100 * (plusS[g] / trS[g]);
    minusDI[g] = 100 * (minusS[g] / trS[g]);
    const sum = plusDI[g] + minusDI[g];
    dx[g] = sum === 0 ? 0 : (100 * Math.abs(plusDI[g] - minusDI[g])) / sum;
  }
  const adx = new Array(i).fill(NaN);
  if (i >= period * 2) {
    let acc = 0, count = 0;
    for (let n = period; n < period * 2; n++) if (Number.isFinite(dx[n])) { acc += dx[n]; count++; }
    if (count > 0) {
      adx[period * 2 - 1] = acc / count;
      for (let n = period * 2; n < i; n++) if (Number.isFinite(adx[n - 1]) && Number.isFinite(dx[n])) adx[n] = (adx[n - 1] * (period - 1) + dx[n]) / period;
    }
  }
  return { adx, plusDI, minusDI };
}

// B — Aroon up/down/osc
function aroon(highs: number[], lows: number[], period = 25): { up: number[]; down: number[]; osc: number[] } {
  const r = highs.length;
  const up = new Array(r).fill(NaN);
  const down = new Array(r).fill(NaN);
  for (let a = period; a < r; a++) {
    let hiIdx = a, loIdx = a;
    for (let c = a - period; c <= a; c++) {
      if (highs[c] >= highs[hiIdx]) hiIdx = c;
      if (lows[c] <= lows[loIdx]) loIdx = c;
    }
    up[a] = ((period - (a - hiIdx)) / period) * 100;
    down[a] = ((period - (a - loIdx)) / period) * 100;
  }
  const osc = up.map((a, l) => (Number.isFinite(a) ? a - down[l] : NaN));
  return { up, down, osc };
}

// F — log returns
function logReturns(arr: number[]): number[] {
  const out = new Array(arr.length).fill(NaN);
  for (let n = 1; n < arr.length; n++) if (arr[n - 1] > 0 && arr[n] > 0) out[n] = Math.log(arr[n] / arr[n - 1]);
  return out;
}

// z — rolling skew / kurtosis of log-returns
function rollMoment(arr: number[], period: number, mode: "skew" | "kurt"): number[] {
  const lr = logReturns(arr);
  const i = arr.length;
  const out = new Array(i).fill(NaN);
  for (let a = period; a < i; a++) {
    let mean = 0, count = 0;
    for (let f = a - period + 1; f <= a; f++) if (Number.isFinite(lr[f])) { mean += lr[f]; count++; }
    if (count < period) continue;
    mean /= count;
    let m2 = 0, m3 = 0, m4 = 0;
    for (let f = a - period + 1; f <= a; f++) {
      const d = lr[f] - mean;
      m2 += d * d;
      if (mode === "skew") m3 += d * d * d;
      if (mode === "kurt") m4 += d * d * d * d;
    }
    m2 /= count;
    if (m2 <= 0) continue;
    out[a] = mode === "skew" ? m3 / count / Math.pow(m2, 1.5) : m4 / count / (m2 * m2) - 3;
  }
  return out;
}

// At — up-day ratio over period
function upDayRatio(arr: number[], period: number): number[] {
  const n = arr.length;
  const up = new Array(n).fill(0);
  for (let a = 1; a < n; a++) up[a] = arr[a] > arr[a - 1] ? 1 : 0;
  const out = new Array(n).fill(NaN);
  let acc = 0;
  for (let a = 1; a < n; a++) {
    acc += up[a];
    if (a > period) acc -= up[a - period];
    if (a >= period) out[a] = acc / period;
  }
  return out;
}

// H — up/down streak
function streak(arr: number[], dir: "up" | "down"): number[] {
  const n = arr.length;
  const out = new Array(n).fill(0);
  let run = 0;
  for (let o = 1; o < n; o++) {
    run = (dir === "up" ? arr[o] > arr[o - 1] : arr[o] < arr[o - 1]) ? run + 1 : 0;
    out[o] = run;
  }
  return out;
}

// Y — rolling linear regression slope + R² of log price
function linregStats(arr: number[], period: number): { slope: number[]; r2: number[] } {
  const n = arr.length;
  const slope = new Array(n).fill(NaN);
  const r2 = new Array(n).fill(NaN);
  const logP = arr.map((a) => (a > 0 ? Math.log(a) : NaN));
  for (let a = period - 1; a < n; a++) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, count = 0;
    for (let A = a - period + 1; A <= a; A++) {
      const N = logP[A];
      if (!Number.isFinite(N)) continue;
      const x = A - (a - period + 1);
      sx += x; sy += N; sxx += x * x; sxy += x * N; syy += N * N; count++;
    }
    if (count < period) continue;
    const denom = count * sxx - sx * sx;
    if (denom === 0) continue;
    const b = (count * sxy - sx * sy) / denom;
    const ssTot = syy - (sy * sy) / count;
    const ssRegNum = (count * sxy - sx * sy) * (count * sxy - sx * sy) / denom / count;
    slope[a] = b;
    r2[a] = ssTot > 0 ? Math.max(0, Math.min(1, ssRegNum / ssTot)) : NaN;
  }
  return { slope, r2 };
}

// Mt — Hurst exponent via aggregated-variance / structure-function regression
function hurst(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  const lr = logReturns(arr);
  const lags = [2, 4, 8, 16, 32].filter((a) => a <= period / 2);
  if (lags.length < 3) return out;
  for (let a = period; a < n; a++) {
    const window: number[] = [];
    for (let h = a - period + 1; h <= a; h++) if (Number.isFinite(lr[h])) window.push(lr[h]);
    if (window.length < period * 0.9) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const h of lags) {
      const diffs: number[] = [];
      for (let b = h; b < window.length; b++) diffs.push(window[b] - window[b - h]);
      if (diffs.length < 5) continue;
      const mean = diffs.reduce((b, v) => b + v, 0) / diffs.length;
      let v = 0;
      for (const b of diffs) v += (b - mean) ** 2;
      const sd = Math.sqrt(v / diffs.length);
      if (sd > 0) { xs.push(Math.log(h)); ys.push(Math.log(sd)); }
    }
    if (xs.length < 3) continue;
    const mx = xs.reduce((h, y) => h + y, 0) / xs.length;
    const my = ys.reduce((h, y) => h + y, 0) / ys.length;
    let num = 0, den = 0;
    for (let h = 0; h < xs.length; h++) { num += (xs[h] - mx) * (ys[h] - my); den += (xs[h] - mx) ** 2; }
    if (den > 0) out[a] = num / den;
  }
  return out;
}

// wt — rolling correlation of two series
function rollCorr(a: number[], b: number[], period: number): number[] {
  const r = a.length;
  const out = new Array(r).fill(NaN);
  for (let o = period - 1; o < r; o++) {
    let sa = 0, sb = 0, sab = 0, saa = 0, sbb = 0, count = 0;
    for (let h = o - period + 1; h <= o; h++) {
      const y = a[h], g = b[h];
      if (!Number.isFinite(y) || !Number.isFinite(g)) continue;
      sa += y; sb += g; sab += y * g; saa += y * y; sbb += g * g; count++;
    }
    if (count < period / 2) continue;
    const cov = count * sab - sa * sb;
    const d = Math.sqrt((count * saa - sa * sa) * (count * sbb - sb * sb));
    if (d > 0) out[o] = cov / d;
  }
  return out;
}

// pt — rolling beta of asset returns on benchmark returns
function rollBeta(assetRet: number[], benchRet: number[], period: number): number[] {
  const r = assetRet.length;
  const out = new Array(r).fill(NaN);
  for (let o = period - 1; o < r; o++) {
    let sb = 0, sa = 0, sbb = 0, sab = 0, count = 0;
    for (let f = o - period + 1; f <= o; f++) {
      const d = benchRet[f], h = assetRet[f];
      if (!Number.isFinite(d) || !Number.isFinite(h)) continue;
      sb += d; sa += h; sbb += d * d; sab += d * h; count++;
    }
    if (count < period / 2) continue;
    const denom = count * sbb - sb * sb;
    if (denom > 0) out[o] = (count * sab - sb * sa) / denom;
  }
  return out;
}

// Dt — Chaikin Money Flow
function cmf(highs: number[], lows: number[], closes: number[], volumes: number[], period: number): number[] {
  const o = closes.length;
  const mfv = new Array(o).fill(0);
  for (let s = 0; s < o; s++) {
    const range = highs[s] - lows[s];
    if (range > 0) {
      const mult = (closes[s] - lows[s] - (highs[s] - closes[s])) / range;
      mfv[s] = mult * volumes[s];
    }
  }
  const out = new Array(o).fill(NaN);
  for (let s = period - 1; s < o; s++) {
    let c = 0, u = 0;
    for (let m = s - period + 1; m <= s; m++) { c += mfv[m]; u += volumes[m]; }
    if (u > 0) out[s] = c / u;
  }
  return out;
}

// _t — rolling z-score of a series
function rollZ(arr: number[], period: number): number[] {
  const n = arr.length;
  const out = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let s = 0, ss = 0, count = 0;
    for (let u = i - period + 1; u <= i; u++) {
      const m = arr[u];
      if (m > 0) { s += m; ss += m * m; count++; }
    }
    if (count < period / 2) continue;
    const mean = s / count;
    const variance = ss / count - mean * mean;
    if (variance > 0) out[i] = (arr[i] - mean) / Math.sqrt(variance);
  }
  return out;
}

// St — advance ratio: SMA(short)/SMA(long) − 1
function advRatio(arr: number[], shortN = 20, longN = 60): number[] {
  const r = arr.length;
  const out = new Array(r).fill(NaN);
  let s = 0, l = 0;
  for (let i = 0; i < r; i++) {
    s += arr[i]; l += arr[i];
    if (i >= shortN) s -= arr[i - shortN];
    if (i >= longN) l -= arr[i - longN];
    if (i >= longN - 1) {
      const sm = s / shortN;
      const lm = l / longN;
      if (lm > 0) out[i] = sm / lm - 1;
    }
  }
  return out;
}

// vt — VWAP distance over period
function vwapDist(closes: number[], volumes: number[], period: number): number[] {
  const r = closes.length;
  const out = new Array(r).fill(NaN);
  for (let o = period - 1; o < r; o++) {
    let pv = 0, v = 0;
    for (let s = o - period + 1; s <= o; s++) { pv += closes[s] * volumes[s]; v += volumes[s]; }
    if (v > 0) { const vwap = pv / v; out[o] = (closes[o] - vwap) / closes[o]; }
  }
  return out;
}

// Ft — OBV slope over period (normalised by max |OBV| in window)
function obvSlope(closes: number[], volumes: number[], period: number): number[] {
  const obv = fromSeries(obvSeries(toSeries(closes), toSeries(volumes)), closes.length);
  const o = closes.length;
  const out = new Array(o).fill(NaN);
  for (let l = period; l < o; l++) {
    const s = obv[l - period];
    const c = obv[l];
    if (Number.isFinite(s) && Number.isFinite(c)) {
      const u = Math.max(Math.abs(s), Math.abs(c), 1);
      out[l] = (c - s) / u;
    }
  }
  return out;
}

// p — generic distance to a (number|null)[] MA series: close/ma − 1
function distToMA(closes: number[], ma: (number | null)[]): number[] {
  return closes.map((n, r) => {
    const i = ma[r];
    return i !== null && (i as number) > 0 ? n / (i as number) - 1 : NaN;
  });
}

// spread helper: maA/maB − 1
function spread(maA: (number | null)[], maB: (number | null)[]): number[] {
  const a = nullToNaN(maA);
  const b = nullToNaN(maB);
  return a.map((r, i) => (Number.isFinite(r) && Number.isFinite(b[i]) && b[i] > 0 ? r / b[i] - 1 : NaN));
}

// ════════════════════════════════════════════════════════════════════════════
//  Feature computation table (kt) + metadata (Rt)
// ════════════════════════════════════════════════════════════════════════════

type FeatureFn = (ctx: FeatureComputeInput) => number[];

const FEATURE_FNS: Record<string, FeatureFn> = {
  // ── MA Distance ──────────────────────────────────────────────────────────
  smaDist20: ({ closes }) => distToMA(closes, sma(closes, 20)),
  smaDist50: ({ closes }) => distToMA(closes, sma(closes, 50)),
  smaDist100: ({ closes }) => distToMA(closes, sma(closes, 100)),
  smaDist200: ({ closes }) => distToMA(closes, sma(closes, 200)),
  emaDist20: ({ closes }) => distToMA(closes, ema(closes, 20)),
  emaDist50: ({ closes }) => distToMA(closes, ema(closes, 50)),
  emaDist100: ({ closes }) => distToMA(closes, ema(closes, 100)),
  emaDist200: ({ closes }) => distToMA(closes, ema(closes, 200)),
  wmaDist50: ({ closes }) => distToMA(closes, wma(closes, 50)),
  hmaDist50: ({ closes }) => distToMA(closes, hma(closes, 50)),
  hmaDist200: ({ closes }) => distToMA(closes, hma(closes, 200)),
  kamaDist50: ({ closes }) => distToMA(closes, kama(closes, 50)),
  t3Dist50: ({ closes }) => distToMA(closes, t3(closes, 50, 0.7)),
  almaDist50: ({ closes }) => distToMA(closes, alma(closes, 50, 0.85, 6)),
  framaDist50: ({ closes, highs, lows }) => distToMA(closes, frama(highs ?? closes, lows ?? closes, 50, 1, 198)),
  linregDist50: ({ closes }) => distToMA(closes, linregMA(closes, 50)),

  // ── MA Spread ────────────────────────────────────────────────────────────
  spread_sma20_50: ({ closes }) => spread(sma(closes, 20), sma(closes, 50)),
  spread_sma50_200: ({ closes }) => spread(sma(closes, 50), sma(closes, 200)),
  spread_ema12_26: ({ closes }) => spread(ema(closes, 12), ema(closes, 26)),

  // ── Trend ────────────────────────────────────────────────────────────────
  dist52wHigh: ({ closes }) => distToRollHigh(closes, 252),
  dist52wLow: ({ closes }) => distToRollLow(closes, 252),
  drawdown: ({ closes }) => drawdownFromAth(closes),
  daysSince52wHigh: ({ closes }) => daysSinceExtreme(closes, 252, "max"),
  daysSince52wLow: ({ closes }) => daysSinceExtreme(closes, 252, "min"),
  daysSinceAth: ({ closes }) => daysSinceAth(closes),

  // ── Momentum ─────────────────────────────────────────────────────────────
  ret5: ({ closes }) => pctReturn(closes, 5),
  ret10: ({ closes }) => pctReturn(closes, 10),
  ret20: ({ closes }) => pctReturn(closes, 20),
  ret63: ({ closes }) => pctReturn(closes, 63),
  ret126: ({ closes }) => pctReturn(closes, 126),
  ret252: ({ closes }) => pctReturn(closes, 252),
  momAccel: ({ closes }) => {
    const a = pctReturn(closes, 20);
    const b = pctReturn(closes, 60);
    return a.map((r, i) => (Number.isFinite(r) && Number.isFinite(b[i]) ? r - b[i] : NaN));
  },
  roc5: ({ closes }) => fromSeries(rocSeries(toSeries(closes), 5), closes.length),
  roc10: ({ closes }) => fromSeries(rocSeries(toSeries(closes), 10), closes.length),
  roc20: ({ closes }) => fromSeries(rocSeries(toSeries(closes), 20), closes.length),
  roc60: ({ closes }) => fromSeries(rocSeries(toSeries(closes), 60), closes.length),
  roc120: ({ closes }) => fromSeries(rocSeries(toSeries(closes), 120), closes.length),

  // ── Oscillator ───────────────────────────────────────────────────────────
  rsi7: ({ closes }) => fromSeries(rsiSeries(toSeries(closes), 7), closes.length),
  rsi14: ({ closes }) => fromSeries(rsiSeries(toSeries(closes), 14), closes.length),
  rsi21: ({ closes }) => fromSeries(rsiSeries(toSeries(closes), 21), closes.length),
  rsiSpread_14_50: ({ closes }) => {
    const a = fromSeries(rsiSeries(toSeries(closes), 14), closes.length);
    const b = fromSeries(rsiSeries(toSeries(closes), 50), closes.length);
    return a.map((r, i) => (Number.isFinite(r) && Number.isFinite(b[i]) ? r - b[i] : NaN));
  },
  stoch_k14: ({ closes, highs, lows }) => nullToNaN(stochastic(highs ?? closes, lows ?? closes, closes, 14, 3, 3).k),
  stoch_d14: ({ closes, highs, lows }) => nullToNaN(stochastic(highs ?? closes, lows ?? closes, closes, 14, 3, 3).d),
  stochRsi14: ({ closes }) => stochRsi(closes, 14, 14),
  williamsR14: ({ closes, highs, lows }) => williamsR(highs ?? closes, lows ?? closes, closes, 14),
  cci20: ({ closes, highs, lows }) => cci(highs ?? closes, lows ?? closes, closes, 20),
  mfi14: ({ closes, highs, lows, volumes }) => mfi(highs ?? closes, lows ?? closes, closes, volumes ?? closes.map(() => 0), 14),
  tsi: ({ closes }) => tsi(closes, 25, 13),
  ultOsc: ({ closes, highs, lows }) => ultimateOsc(highs ?? closes, lows ?? closes, closes),
  ewo_5_35: ({ closes, highs, lows }) => nullToNaN(ewo(highs ?? closes, lows ?? closes, 5, 35)),
  macd_line: ({ closes }) => fromSeries(macdSeries(toSeries(closes), 12, 26, 9).macd, closes.length),
  macd_signal: ({ closes }) => fromSeries(macdSeries(toSeries(closes), 12, 26, 9).signal, closes.length),
  macd_hist: ({ closes }) => fromSeries(macdSeries(toSeries(closes), 12, 26, 9).histogram, closes.length),

  // ── Trend (directional) ──────────────────────────────────────────────────
  adx14: ({ closes, highs, lows }) => adxFull(highs ?? closes, lows ?? closes, closes, 14).adx,
  plusDI14: ({ closes, highs, lows }) => adxFull(highs ?? closes, lows ?? closes, closes, 14).plusDI,
  minusDI14: ({ closes, highs, lows }) => adxFull(highs ?? closes, lows ?? closes, closes, 14).minusDI,
  aroonUp25: ({ highs, lows, closes }) => aroon(highs ?? closes, lows ?? closes, 25).up,
  aroonDown25: ({ highs, lows, closes }) => aroon(highs ?? closes, lows ?? closes, 25).down,
  aroonOsc25: ({ highs, lows, closes }) => aroon(highs ?? closes, lows ?? closes, 25).osc,
  linreg_slope60: ({ closes }) => linregStats(closes, 60).slope,
  linreg_r2_60: ({ closes }) => linregStats(closes, 60).r2,
  hurst100: ({ closes }) => hurst(closes, 100),

  // ── Volatility ───────────────────────────────────────────────────────────
  vol30: ({ closes }) => realisedVol(closes, 30),
  vol90: ({ closes }) => realisedVol(closes, 90),
  volOfVol60: ({ closes }) => {
    const v = realisedVol(closes, 30);
    const n = closes.length;
    const out = new Array(n).fill(NaN);
    for (let i = 60; i < n; i++) {
      let s = 0, count = 0;
      for (let c = i - 59; c <= i; c++) if (Number.isFinite(v[c])) { s += v[c]; count++; }
      if (count < 30) continue;
      const mean = s / count;
      let ss = 0;
      for (let c = i - 59; c <= i; c++) if (Number.isFinite(v[c])) ss += (v[c] - mean) ** 2;
      out[i] = Math.sqrt(ss / count);
    }
    return out;
  },
  atrPct14: ({ closes, highs, lows }) => {
    const a = atr(highs ?? closes, lows ?? closes, closes, 14);
    return closes.map((c, i) => (Number.isFinite(a[i]) && c > 0 ? a[i] / c : NaN));
  },
  atrPctClose14: ({ closes }) => {
    const a = fromSeries(atrCloseSeries(toSeries(closes), 14), closes.length);
    return closes.map((c, i) => (Number.isFinite(a[i]) && c > 0 ? a[i] / c : NaN));
  },
  bbWidth20: ({ closes }) => bbWidth(closes, 20, 2),

  // ── Range / Channel ──────────────────────────────────────────────────────
  bbPctB20: ({ closes }) => bbPctB(closes, 20, 2),
  keltnerPct: ({ closes, highs, lows }) => keltnerPct(highs ?? closes, lows ?? closes, closes, 20, 14, 2),
  donchianPct20: ({ closes, highs, lows }) => donchianPct(highs ?? closes, lows ?? closes, closes, 20),

  // ── Distribution ─────────────────────────────────────────────────────────
  skew60: ({ closes }) => rollMoment(closes, 60, "skew"),
  kurt60: ({ closes }) => rollMoment(closes, 60, "kurt"),
  upDayRatio60: ({ closes }) => upDayRatio(closes, 60),
  upStreak: ({ closes }) => streak(closes, "up"),
  downStreak: ({ closes }) => streak(closes, "down"),
  avgGap20: ({ closes, opens }) => {
    const o = opens ?? closes;
    const n = closes.length;
    const gap = new Array(n).fill(NaN);
    for (let l = 1; l < n; l++) if (closes[l - 1] > 0 && o[l] > 0) gap[l] = o[l] / closes[l - 1] - 1;
    const out = new Array(n).fill(NaN);
    let acc = 0, count = 0;
    for (let l = 0; l < n; l++) {
      if (Number.isFinite(gap[l])) { acc += gap[l]; count++; }
      if (l >= 20 && Number.isFinite(gap[l - 20])) { acc -= gap[l - 20]; count--; }
      if (l >= 19 && count > 0) out[l] = acc / count;
    }
    return out;
  },
  closeLocValue20: ({ closes, highs, lows }) => {
    const h = highs ?? closes;
    const lo = lows ?? closes;
    const r = closes.length;
    const clv = new Array(r).fill(NaN);
    for (let s = 0; s < r; s++) {
      const range = h[s] - lo[s];
      if (range > 0) clv[s] = (closes[s] - lo[s] - (h[s] - closes[s])) / range;
    }
    const out = new Array(r).fill(NaN);
    let acc = 0, count = 0;
    for (let s = 0; s < r; s++) {
      if (Number.isFinite(clv[s])) { acc += clv[s]; count++; }
      if (s >= 20 && Number.isFinite(clv[s - 20])) { acc -= clv[s - 20]; count--; }
      if (s >= 19 && count > 0) out[s] = acc / count;
    }
    return out;
  },

  // ── Volume ───────────────────────────────────────────────────────────────
  volumeZ20: ({ volumes, closes }) => rollZ(volumes ?? closes.map(() => 0), 20),
  obvSlope60: ({ closes, volumes }) => obvSlope(closes, volumes ?? closes.map(() => 0), 60),
  cmf20: ({ closes, highs, lows, volumes }) => cmf(highs ?? closes, lows ?? closes, closes, volumes ?? closes.map(() => 0), 20),
  advRatio_20_60: ({ volumes, closes }) => advRatio(volumes ?? closes.map(() => 0), 20, 60),
  vwapDist20: ({ closes, volumes }) => vwapDist(closes, volumes ?? closes.map(() => 0), 20),

  // ── Cross-Sectional (vs benchmark) ───────────────────────────────────────
  relStr20: ({ closes, benchCloses }) => {
    if (!benchCloses) return new Array(closes.length).fill(NaN);
    const a = pctReturn(closes, 20);
    const b = pctReturn(benchCloses, 20);
    return a.map((i, o) => (Number.isFinite(i) && Number.isFinite(b[o]) ? i - b[o] : NaN));
  },
  relStr63: ({ closes, benchCloses }) => {
    if (!benchCloses) return new Array(closes.length).fill(NaN);
    const a = pctReturn(closes, 63);
    const b = pctReturn(benchCloses, 63);
    return a.map((i, o) => (Number.isFinite(i) && Number.isFinite(b[o]) ? i - b[o] : NaN));
  },
  ratioVsBench: ({ closes, benchCloses }) =>
    benchCloses
      ? closes.map((n, r) => (Number.isFinite(benchCloses[r]) && benchCloses[r] > 0 ? n / benchCloses[r] : NaN))
      : new Array(closes.length).fill(NaN),
  rollCorr60Bench: ({ closes, benchCloses }) => {
    if (!benchCloses) return new Array(closes.length).fill(NaN);
    return rollCorr(logReturns(closes), logReturns(benchCloses), 60);
  },
  rollBeta60Bench: ({ closes, benchCloses }) => {
    if (!benchCloses) return new Array(closes.length).fill(NaN);
    return rollBeta(logReturns(closes), logReturns(benchCloses), 60);
  },

  // ── App-Specific (HARSI / TVA) ───────────────────────────────────────────
  harsi_rsi: ({ closes, highs, lows, opens }) => nullToNaN(harsi(closes, highs ?? closes, lows ?? closes, {}, opens).rsi),
  harsi_haClose: ({ closes, highs, lows, opens }) => nullToNaN(harsi(closes, highs ?? closes, lows ?? closes, {}, opens).haClose),
  harsi_stochK: ({ closes, highs, lows, opens }) => nullToNaN(harsi(closes, highs ?? closes, lows ?? closes, {}, opens).stochK),
  harsi_stochKD: ({ closes, highs, lows, opens }) => nullToNaN(harsi(closes, highs ?? closes, lows ?? closes, {}, opens).stochKD),
  tva_os: ({ closes, volumes }) => tva(closes, volumes ?? closes.map(() => 0), 15, 3, 5).os,
  tva_bullPressure: ({ closes, volumes }) => tva(closes, volumes ?? closes.map(() => 0), 15, 3, 5).bullPressure,
  tva_bearPressure: ({ closes, volumes }) => tva(closes, volumes ?? closes.map(() => 0), 15, 3, 5).bearPressure,
};

/** Technical feature metadata (Rt in source). */
export const featureMeta: Record<string, FeatureDef> = {
  smaDist20: { id: "smaDist20", label: "Δ vs SMA20", category: "MA Distance" },
  smaDist50: { id: "smaDist50", label: "Δ vs SMA50", category: "MA Distance" },
  smaDist100: { id: "smaDist100", label: "Δ vs SMA100", category: "MA Distance" },
  smaDist200: { id: "smaDist200", label: "Δ vs SMA200", category: "MA Distance" },
  emaDist20: { id: "emaDist20", label: "Δ vs EMA20", category: "MA Distance" },
  emaDist50: { id: "emaDist50", label: "Δ vs EMA50", category: "MA Distance" },
  emaDist100: { id: "emaDist100", label: "Δ vs EMA100", category: "MA Distance" },
  emaDist200: { id: "emaDist200", label: "Δ vs EMA200", category: "MA Distance" },
  wmaDist50: { id: "wmaDist50", label: "Δ vs WMA50", category: "MA Distance" },
  hmaDist50: { id: "hmaDist50", label: "Δ vs HMA50", category: "MA Distance" },
  hmaDist200: { id: "hmaDist200", label: "Δ vs HMA200", category: "MA Distance" },
  kamaDist50: { id: "kamaDist50", label: "Δ vs KAMA50", category: "MA Distance" },
  t3Dist50: { id: "t3Dist50", label: "Δ vs T3(50)", category: "MA Distance" },
  almaDist50: { id: "almaDist50", label: "Δ vs ALMA50", category: "MA Distance" },
  framaDist50: { id: "framaDist50", label: "Δ vs FRAMA50", category: "MA Distance" },
  linregDist50: { id: "linregDist50", label: "Δ vs LinReg50", category: "MA Distance" },
  spread_sma20_50: { id: "spread_sma20_50", label: "SMA20/50 spread", category: "MA Spread" },
  spread_sma50_200: { id: "spread_sma50_200", label: "SMA50/200 spread", category: "MA Spread" },
  spread_ema12_26: { id: "spread_ema12_26", label: "EMA12/26 spread", category: "MA Spread" },
  dist52wHigh: { id: "dist52wHigh", label: "Δ to 52w high", category: "Trend" },
  dist52wLow: { id: "dist52wLow", label: "Δ to 52w low", category: "Trend" },
  drawdown: { id: "drawdown", label: "Drawdown (ATH)", category: "Trend" },
  daysSince52wHigh: { id: "daysSince52wHigh", label: "Days since 52w hi", category: "Trend" },
  daysSince52wLow: { id: "daysSince52wLow", label: "Days since 52w lo", category: "Trend" },
  daysSinceAth: { id: "daysSinceAth", label: "Days since ATH", category: "Trend" },
  ret5: { id: "ret5", label: "1W return", category: "Momentum" },
  ret10: { id: "ret10", label: "2W return", category: "Momentum" },
  ret20: { id: "ret20", label: "1M return", category: "Momentum" },
  ret63: { id: "ret63", label: "3M return", category: "Momentum" },
  ret126: { id: "ret126", label: "6M return", category: "Momentum" },
  ret252: { id: "ret252", label: "1Y return", category: "Momentum" },
  momAccel: { id: "momAccel", label: "Mom accel", category: "Momentum" },
  roc5: { id: "roc5", label: "ROC(5)", category: "Momentum" },
  roc10: { id: "roc10", label: "ROC(10)", category: "Momentum" },
  roc20: { id: "roc20", label: "ROC(20)", category: "Momentum" },
  roc60: { id: "roc60", label: "ROC(60)", category: "Momentum" },
  roc120: { id: "roc120", label: "ROC(120)", category: "Momentum" },
  rsi7: { id: "rsi7", label: "RSI-7", category: "Oscillator" },
  rsi14: { id: "rsi14", label: "RSI-14", category: "Oscillator" },
  rsi21: { id: "rsi21", label: "RSI-21", category: "Oscillator" },
  rsiSpread_14_50: { id: "rsiSpread_14_50", label: "RSI14 − RSI50", category: "Oscillator" },
  stoch_k14: { id: "stoch_k14", label: "Stoch %K(14,3)", category: "Oscillator" },
  stoch_d14: { id: "stoch_d14", label: "Stoch %D(14,3)", category: "Oscillator" },
  stochRsi14: { id: "stochRsi14", label: "Stoch RSI(14)", category: "Oscillator" },
  williamsR14: { id: "williamsR14", label: "Williams %R(14)", category: "Oscillator" },
  cci20: { id: "cci20", label: "CCI(20)", category: "Oscillator" },
  mfi14: { id: "mfi14", label: "MFI(14)", category: "Oscillator", requiresVolume: true },
  tsi: { id: "tsi", label: "TSI(25,13)", category: "Oscillator" },
  ultOsc: { id: "ultOsc", label: "Ultimate Osc", category: "Oscillator" },
  ewo_5_35: { id: "ewo_5_35", label: "EWO(5,35)", category: "Oscillator" },
  macd_line: { id: "macd_line", label: "MACD line", category: "Oscillator" },
  macd_signal: { id: "macd_signal", label: "MACD signal", category: "Oscillator" },
  macd_hist: { id: "macd_hist", label: "MACD hist", category: "Oscillator" },
  adx14: { id: "adx14", label: "ADX(14)", category: "Trend" },
  plusDI14: { id: "plusDI14", label: "+DI(14)", category: "Trend" },
  minusDI14: { id: "minusDI14", label: "−DI(14)", category: "Trend" },
  aroonUp25: { id: "aroonUp25", label: "Aroon up(25)", category: "Trend" },
  aroonDown25: { id: "aroonDown25", label: "Aroon dn(25)", category: "Trend" },
  aroonOsc25: { id: "aroonOsc25", label: "Aroon osc", category: "Trend" },
  linreg_slope60: { id: "linreg_slope60", label: "LinReg slope(60)", category: "Trend" },
  linreg_r2_60: { id: "linreg_r2_60", label: "LinReg R²(60)", category: "Trend" },
  hurst100: { id: "hurst100", label: "Hurst(100)", category: "Trend" },
  vol30: { id: "vol30", label: "30d real vol", category: "Volatility" },
  vol90: { id: "vol90", label: "90d real vol", category: "Volatility" },
  volOfVol60: { id: "volOfVol60", label: "Vol-of-vol(60)", category: "Volatility" },
  atrPct14: { id: "atrPct14", label: "ATR%/close(14)", category: "Volatility" },
  atrPctClose14: { id: "atrPctClose14", label: "ATR%/close (C-only)", category: "Volatility" },
  bbWidth20: { id: "bbWidth20", label: "BB width(20)", category: "Volatility" },
  bbPctB20: { id: "bbPctB20", label: "BB %B(20)", category: "Range / Channel" },
  keltnerPct: { id: "keltnerPct", label: "Keltner %(20,14)", category: "Range / Channel" },
  donchianPct20: { id: "donchianPct20", label: "Donchian %(20)", category: "Range / Channel" },
  skew60: { id: "skew60", label: "Skew(60)", category: "Distribution" },
  kurt60: { id: "kurt60", label: "Kurt(60)", category: "Distribution" },
  upDayRatio60: { id: "upDayRatio60", label: "Up-day % (60)", category: "Distribution" },
  upStreak: { id: "upStreak", label: "Up streak", category: "Distribution" },
  downStreak: { id: "downStreak", label: "Down streak", category: "Distribution" },
  avgGap20: { id: "avgGap20", label: "Avg gap(20)", category: "Distribution" },
  closeLocValue20: { id: "closeLocValue20", label: "CLV(20)", category: "Distribution" },
  volumeZ20: { id: "volumeZ20", label: "Volume z(20)", category: "Volume", requiresVolume: true },
  obvSlope60: { id: "obvSlope60", label: "OBV slope(60)", category: "Volume", requiresVolume: true },
  cmf20: { id: "cmf20", label: "CMF(20)", category: "Volume", requiresVolume: true },
  advRatio_20_60: { id: "advRatio_20_60", label: "ADV 20/60", category: "Volume", requiresVolume: true },
  vwapDist20: { id: "vwapDist20", label: "VWAP dist(20)", category: "Volume", requiresVolume: true },
  relStr20: { id: "relStr20", label: "Rel str vs SPY (20)", category: "Cross-Sectional", requiresBench: true },
  relStr63: { id: "relStr63", label: "Rel str vs SPY (63)", category: "Cross-Sectional", requiresBench: true },
  ratioVsBench: { id: "ratioVsBench", label: "Close / SPY ratio", category: "Cross-Sectional", requiresBench: true },
  rollCorr60Bench: { id: "rollCorr60Bench", label: "Corr to SPY (60)", category: "Cross-Sectional", requiresBench: true },
  rollBeta60Bench: { id: "rollBeta60Bench", label: "Beta to SPY (60)", category: "Cross-Sectional", requiresBench: true },
  harsi_rsi: { id: "harsi_rsi", label: "HARSI RSI", category: "App-Specific" },
  harsi_haClose: { id: "harsi_haClose", label: "HARSI candle", category: "App-Specific" },
  harsi_stochK: { id: "harsi_stochK", label: "HARSI %K", category: "App-Specific" },
  harsi_stochKD: { id: "harsi_stochKD", label: "HARSI %K−%D", category: "App-Specific" },
  tva_os: { id: "tva_os", label: "TVA osc", category: "App-Specific", requiresVolume: true },
  tva_bullPressure: { id: "tva_bullPressure", label: "TVA bull press", category: "App-Specific", requiresVolume: true },
  tva_bearPressure: { id: "tva_bearPressure", label: "TVA bear press", category: "App-Specific", requiresVolume: true },
};

/** All technical feature key strings (qt = Object.keys(Rt)). */
export const featureKeys: string[] = Object.keys(featureMeta);

/** Default feature set (xt). */
export const defaultFeatures: string[] = ["smaDist50", "smaDist200", "ret20", "ret63", "vol30", "rsi14"];

/** Named feature presets (zt). */
export const featurePresets: Record<string, string[]> = {
  "Classic (6)": [...defaultFeatures],
  Trend: ["smaDist50", "smaDist200", "emaDist50", "spread_sma50_200", "dist52wHigh", "dist52wLow", "drawdown", "adx14", "linreg_slope60", "linreg_r2_60"],
  Momentum: ["ret5", "ret20", "ret63", "ret252", "roc10", "roc60", "rsi14", "macd_hist", "momAccel"],
  Oscillators: ["rsi14", "stoch_k14", "stochRsi14", "williamsR14", "cci20", "mfi14", "tsi", "ultOsc", "ewo_5_35"],
  "Volatility / Range": ["vol30", "vol90", "atrPct14", "bbWidth20", "bbPctB20", "keltnerPct", "donchianPct20", "drawdown"],
  Volume: ["volumeZ20", "obvSlope60", "cmf20", "advRatio_20_60", "vwapDist20", "mfi14"],
  "Cross-Sectional (SPY)": ["relStr20", "relStr63", "rollCorr60Bench", "rollBeta60Bench", "ret63", "vol30"],
  Distribution: ["skew60", "kurt60", "upDayRatio60", "vol30", "drawdown"],
  "App-Specific": ["harsi_rsi", "harsi_stochK", "tva_os", "tva_bullPressure", "tva_bearPressure", "ewo_5_35"],
  "Kitchen Sink (recommended)": ["smaDist50", "smaDist200", "ret20", "ret63", "ret252", "rsi14", "macd_hist", "stochRsi14", "vol30", "bbPctB20", "drawdown", "relStr63", "rollCorr60Bench", "skew60", "adx14", "linreg_slope60", "volumeZ20", "cmf20"],
};

// ── Time-dimension features (Ht / Yt) ─────────────────────────────────────────

/** Time-dimension feature metadata (Yt). */
export const timeFeatureMeta: Record<string, FeatureDef> = {
  dowSin: { id: "dowSin", label: "Day-of-week sin", category: "Time" },
  dowCos: { id: "dowCos", label: "Day-of-week cos", category: "Time" },
  moySin: { id: "moySin", label: "Month-of-year sin", category: "Time" },
  moyCos: { id: "moyCos", label: "Month-of-year cos", category: "Time" },
};

// ════════════════════════════════════════════════════════════════════════════
//  computeFeatures (Wt) + computeTimeDim (Ht)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Compute technical features. Bundle form: computeFeatures(featureIds, ctx).
 * Also accepts the legacy (ctx, featureIds) order for backward compatibility.
 * Returns Record<featureId, number[]> aligned to ctx.closes.length.
 */
export function computeFeatures(
  _input: FeatureComputeInput | string[],
  _featureIds?: any
): Record<string, number[]> {
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

  const out: Record<string, number[]> = {};
  for (const id of featureIds) {
    const fn = FEATURE_FNS[id];
    if (!fn) continue;
    try {
      out[id] = fn(ctx);
    } catch {
      out[id] = new Array(ctx.closes.length).fill(NaN);
    }
  }
  return out;
}

/**
 * Compute time-dimension features from a date array (Ht).
 * Bundle form: computeTimeDim(times: string[]) → {dowSin, dowCos, moySin, moyCos}.
 */
export function computeTimeDim(
  _times: string[] | FeatureVector[],
  _options?: Record<string, any>
): Record<string, number[]> {
  if (!Array.isArray(_times) || _times.length === 0) return {};
  // FeatureVector[] path is not used by production; only the string[] form is.
  if (typeof _times[0] !== "string") return {};
  const times = _times as string[];
  const e = times.length;
  const dowSin = new Array(e).fill(NaN);
  const dowCos = new Array(e).fill(NaN);
  const moySin = new Array(e).fill(NaN);
  const moyCos = new Array(e).fill(NaN);
  for (let a = 0; a < e; a++) {
    const l = times[a];
    if (!l) continue;
    const s = new Date(l + "T00:00:00Z");
    if (Number.isNaN(s.getTime())) continue;
    const dow = s.getUTCDay();
    const moy = s.getUTCMonth();
    dowSin[a] = Math.sin((2 * Math.PI * dow) / 7);
    dowCos[a] = Math.cos((2 * Math.PI * dow) / 7);
    moySin[a] = Math.sin((2 * Math.PI * moy) / 12);
    moyCos[a] = Math.cos((2 * Math.PI * moy) / 12);
  }
  return { dowSin, dowCos, moySin, moyCos };
}

// ════════════════════════════════════════════════════════════════════════════
//  Algorithm metadata (Ut) + dispatch ($t)
// ════════════════════════════════════════════════════════════════════════════

/** Algorithm metadata (Ut). */
export const algoMeta: Record<string, AlgoDef> = {
  knn: { id: "knn", label: "KNN", tooltip: "Euclidean nearest neighbors in z-space (top N, equal weight)" },
  kernel: { id: "kernel", label: "Kernel KNN", tooltip: "Gaussian-weighted neighbors. Close matches count more, far matches fade smoothly." },
  dtw: { id: "dtw", label: "DTW path", tooltip: "Match the recent price trajectory (log-return shape) against every window in history" },
  regime: { id: "regime", label: "Regime", tooltip: "K-Means cluster all bars; summarize forwards of bars in today's regime" },
};

/** Algorithm key strings (jt). */
export const algoKeys: string[] = ["knn", "kernel", "dtw", "regime"];

export interface AlgoBar {
  date: string;
  closeIdx: number;
  zVec: number[];
  fwd1M: number;
  fwd3M: number;
  fwd6M: number;
  fwd1Y: number;
  [key: string]: any;
}

export interface AlgoInput {
  bars: AlgoBar[];
  todayZ: number[];
  n: number;
  closes?: number[];
  lastIdx?: number;
  dtwWindow?: number;
  kernelH?: number;
  regimeK?: number;
  [key: string]: any;
}

export interface AlgoMatch {
  i: number;
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
  info: string;
  [key: string]: any;
}

// Vt — KNN (Euclidean, equal weight)
function algoKnn(t: AlgoInput): AlgoResult {
  const { bars, todayZ, n } = t;
  const scored = bars.map((a) => {
    let l = 0;
    for (let s = 0; s < a.zVec.length; s++) { const c = a.zVec[s] - todayZ[s]; l += c * c; }
    return { ...a, distance: Math.sqrt(l) };
  });
  scored.sort((a, b) => a.distance - b.distance);
  const matches = scored
    .slice(0, n)
    .map((a) => ({ i: 0, date: a.date, distance: a.distance, weight: 1, zVec: a.zVec, fwd1M: a.fwd1M, fwd3M: a.fwd3M, fwd6M: a.fwd6M, fwd1Y: a.fwd1Y }))
    .map((a, l) => ({ ...a, i: l }));
  return { matches, info: `KNN · ${matches.length} neighbors · equal-weighted` };
}

// Tt — Kernel KNN (Gaussian weighting, auto bandwidth)
function algoKernel(t: AlgoInput): AlgoResult {
  const { bars, todayZ, n } = t;
  const scored = bars.map((c) => {
    let u = 0;
    for (let m = 0; m < c.zVec.length; m++) { const f = c.zVec[m] - todayZ[m]; u += f * f; }
    return { ...c, distance: Math.sqrt(u) };
  });
  scored.sort((c, u) => c.distance - u.distance);
  let h = t.kernelH ?? NaN;
  if (!Number.isFinite(h) || !(h > 0)) {
    const u = scored.slice(0, Math.min(scored.length, n * 3)).map((m) => m.distance).sort((m, f) => m - f);
    h = u.length ? u[Math.floor(u.length / 2)] : 1;
    if (!(h > 0)) h = 1;
  }
  const candidates = scored.slice(0, Math.min(scored.length, Math.max(n, n * 3))).map((c) => ({
    i: 0,
    date: c.date,
    distance: c.distance,
    weight: Math.exp(-(c.distance * c.distance) / (h * h)),
    zVec: c.zVec,
    fwd1M: c.fwd1M,
    fwd3M: c.fwd3M,
    fwd6M: c.fwd6M,
    fwd1Y: c.fwd1Y,
  }));
  const sum = candidates.reduce((c, u) => c + u.weight, 0) || 1;
  for (const c of candidates) c.weight /= sum;
  candidates.sort((c, u) => c.distance - u.distance);
  return { matches: candidates.map((c, u) => ({ ...c, i: u })), info: `Kernel KNN · ${candidates.length} weighted neighbors · h=${h.toFixed(2)}` };
}

// It — DTW distance (Sakoe-Chiba band)
function dtwDistance(a: number[], b: number[]): number {
  const n = a.length, r = b.length;
  if (n === 0 || r === 0) return Infinity;
  const band = Math.max(1, Math.floor(Math.max(n, r) / 4));
  const INF = Infinity;
  let prev = new Array(r + 1).fill(INF);
  let curr = new Array(r + 1).fill(INF);
  prev[0] = 0;
  for (let s = 1; s <= n; s++) {
    curr.fill(INF);
    const lo = Math.max(1, s - band);
    const hi = Math.min(r, s + band);
    for (let m = lo; m <= hi; m++) {
      const cost = Math.abs(a[s - 1] - b[m - 1]);
      const d = prev[m], h = curr[m - 1], y = prev[m - 1];
      let g = d < h ? d : h;
      if (y < g) g = y;
      curr[m] = cost + (g === INF ? 0 : g);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[r];
}

// W — z-normalise an array (ignoring non-finite for stats)
function zNormalise(arr: number[]): number[] {
  if (arr.length === 0) return arr;
  let s = 0, count = 0;
  for (const a of arr) if (Number.isFinite(a)) { s += a; count++; }
  if (count === 0) return arr.slice();
  const mean = s / count;
  let v = 0;
  for (const a of arr) if (Number.isFinite(a)) v += (a - mean) ** 2;
  const sd = Math.sqrt(v / count);
  return sd > 0 ? arr.map((a) => (Number.isFinite(a) ? (a - mean) / sd : 0)) : arr.map(() => 0);
}

// Ct — DTW path matching on recent log-return trajectory
function algoDtw(t: AlgoInput): AlgoResult {
  const { bars, closes, lastIdx, n } = t;
  const c = closes ?? [];
  const li = lastIdx ?? c.length - 1;
  const window = Math.max(10, Math.min(252, t.dtwWindow ?? 60));
  if (li < window) return { matches: [], info: `DTW · insufficient history (need ${window} bars)` };
  const logRet = new Array(c.length).fill(NaN);
  for (let u = 1; u < c.length; u++) if (c[u - 1] > 0 && c[u] > 0) logRet[u] = Math.log(c[u] / c[u - 1]);
  const query = zNormalise(logRet.slice(li - window + 1, li + 1));
  if (query.length < window) return { matches: [], info: "DTW · insufficient history" };
  const scored: Array<{ date: string; closeIdx: number; distance: number; zVec: number[]; fwd1M: number; fwd3M: number; fwd6M: number; fwd1Y: number }> = [];
  for (const bar of bars) {
    const m = bar.closeIdx;
    if (m < window) continue;
    const traj = zNormalise(logRet.slice(m - window + 1, m + 1));
    if (traj.length < window) continue;
    let bad = 0;
    for (let y = 0; y < traj.length; y++) if (!Number.isFinite(traj[y])) bad++;
    if (bad > Math.floor(window * 0.1)) continue;
    const d = dtwDistance(query, traj) / window;
    scored.push({ date: bar.date, closeIdx: bar.closeIdx, distance: d, zVec: bar.zVec, fwd1M: bar.fwd1M, fwd3M: bar.fwd3M, fwd6M: bar.fwd6M, fwd1Y: bar.fwd1Y });
  }
  if (scored.length === 0) return { matches: [], info: "DTW · no valid windows" };
  scored.sort((u, m) => u.distance - m.distance);
  const matches = scored.slice(0, n).map((u, m) => ({ i: m, date: u.date, distance: u.distance, weight: 1, zVec: u.zVec, fwd1M: u.fwd1M, fwd3M: u.fwd3M, fwd6M: u.fwd6M, fwd1Y: u.fwd1Y }));
  return { matches, info: `DTW · window=${window} bars · ${matches.length} closest trajectories` };
}

// Pt — k-means++ (returns assignments + centroids)
function kmeansPP(rows: number[][], k: number, maxIter = 50): { assignments: number[]; centroids: number[][] } {
  const r = rows.length;
  if (r === 0 || k <= 0) return { assignments: [], centroids: [] };
  const dim = rows[0].length;
  const centroids: number[][] = [];
  let seed = (r * 2654435761) >>> 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967295; };
  centroids.push(rows[Math.floor(rand() * r)].slice());
  for (let c = 1; c < k; c++) {
    const d2 = rows.map((h) => {
      let best = Infinity;
      for (const g of centroids) {
        let acc = 0;
        for (let N = 0; N < dim; N++) acc += (h[N] - g[N]) ** 2;
        if (acc < best) best = acc;
      }
      return best;
    });
    const total = d2.reduce((h, y) => h + y, 0);
    if (total <= 0) { centroids.push(rows[Math.floor(rand() * r)].slice()); continue; }
    let target = rand() * total, idx = 0;
    for (; idx < r - 1; idx++) { target -= d2[idx]; if (target <= 0) break; }
    centroids.push(rows[idx].slice());
  }
  const assignments = new Array(r).fill(0);
  for (let c = 0; c < maxIter; c++) {
    let changed = 0;
    for (let d = 0; d < r; d++) {
      let best = 0, bestDist = Infinity;
      for (let g = 0; g < k; g++) {
        let acc = 0;
        for (let N = 0; N < dim; N++) acc += (rows[d][N] - centroids[g][N]) ** 2;
        if (acc < bestDist) { bestDist = acc; best = g; }
      }
      if (assignments[d] !== best) { assignments[d] = best; changed++; }
    }
    const sums = Array.from({ length: k }, () => new Array(dim).fill(0));
    const counts = new Array(k).fill(0);
    for (let d = 0; d < r; d++) {
      const h = assignments[d];
      counts[h]++;
      for (let y = 0; y < dim; y++) sums[h][y] += rows[d][y];
    }
    for (let d = 0; d < k; d++) if (counts[d] > 0) for (let h = 0; h < dim; h++) centroids[d][h] = sums[d][h] / counts[d];
    if (changed === 0) break;
  }
  return { assignments, centroids };
}

// Bt — Regime (k-means cluster; today's cluster)
function algoRegime(t: AlgoInput): AlgoResult {
  const { bars, todayZ, n } = t;
  const k = Math.max(2, Math.min(12, t.regimeK ?? 5));
  if (bars.length < k * 5) return { matches: [], info: `Regime · need ≥${k * 5} bars` };
  const rows = bars.map((f) => f.zVec);
  const { assignments, centroids } = kmeansPP(rows, k);
  let cluster = 0, best = Infinity;
  for (let f = 0; f < centroids.length; f++) {
    let d = 0;
    for (let h = 0; h < todayZ.length; h++) d += (todayZ[h] - centroids[f][h]) ** 2;
    if (d < best) { best = d; cluster = f; }
  }
  const inCluster: Array<{ date: string; distance: number; zVec: number[]; fwd1M: number; fwd3M: number; fwd6M: number; fwd1Y: number }> = [];
  for (let f = 0; f < bars.length; f++) {
    if (assignments[f] !== cluster) continue;
    let d = 0;
    for (let h = 0; h < todayZ.length; h++) { const y = bars[f].zVec[h] - todayZ[h]; d += y * y; }
    inCluster.push({ date: bars[f].date, distance: Math.sqrt(d), zVec: bars[f].zVec, fwd1M: bars[f].fwd1M, fwd3M: bars[f].fwd3M, fwd6M: bars[f].fwd6M, fwd1Y: bars[f].fwd1Y });
  }
  inCluster.sort((f, d) => f.distance - d.distance);
  return {
    matches: inCluster.slice(0, n).map((f, d) => ({ i: d, date: f.date, distance: f.distance, weight: 1, zVec: f.zVec, fwd1M: f.fwd1M, fwd3M: f.fwd3M, fwd6M: f.fwd6M, fwd1Y: f.fwd1Y })),
    info: `Regime · k=${k} clusters · today∈C${cluster + 1} (${inCluster.length} bars)`,
    clusterId: cluster,
    clusterSize: inCluster.length,
  };
}

/**
 * Dispatch the selected similarity algorithm ($t).
 * Bundle form: dispatchAlgo(algoKey, input). Also accepts (input) with input.algoKey.
 */
export function dispatchAlgo(_keyOrInput: string | AlgoInput, _input?: AlgoInput): AlgoResult {
  let key: string;
  let input: AlgoInput;
  if (typeof _keyOrInput === "string") {
    key = _keyOrInput;
    input = _input as AlgoInput;
  } else {
    input = _keyOrInput as AlgoInput;
    key = (input as any).algoKey ?? "knn";
  }
  if (!input) return { matches: [], info: "no input" };
  switch (key) {
    case "knn": return algoKnn(input);
    case "kernel": return algoKernel(input);
    case "dtw": return algoDtw(input);
    case "regime": return algoRegime(input);
    default: return algoKnn(input);
  }
}
