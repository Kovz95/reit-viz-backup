// ─────────────────────────────────────────────────────────────────────────
// Quant / mean-reversion pane indicators (close-only — safe on ratio panes).
// Consumed by indicatorRegistry.ts; keep each fn pure and OhlcBar-based so
// registry frequency resampling and the Pairs flat-bar path work unchanged.
// ─────────────────────────────────────────────────────────────────────────

import type { OhlcBar, DataPoint } from "./indicators";

const closesOf = (bars: OhlcBar[]): { t: (string | number)[]; c: number[] } => {
  const t: (string | number)[] = [], c: number[] = [];
  for (const b of bars) {
    if (Number.isFinite(b.close)) { t.push(b.time); c.push(b.close); }
  }
  return { t, c };
};

/** Log series when strictly positive, else the raw series (spread/z panes
 *  can be negative — log math falls back gracefully). */
const logOrRaw = (c: number[]): { x: number[]; isLog: boolean } => {
  const isLog = c.every((v) => v > 0);
  return { x: isLog ? c.map(Math.log) : c.slice(), isLog };
};

/** Rolling z-score of close vs its trailing-window mean/σ (sample). */
export function computeRollingZScore(bars: OhlcBar[], window = 63): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 3) return out;
  for (let i = window - 1; i < c.length; i++) {
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += c[j];
    const mean = sum / window;
    let ss = 0;
    for (let j = i - window + 1; j <= i; j++) ss += (c[j] - mean) ** 2;
    const sd = Math.sqrt(ss / (window - 1));
    if (sd > 0) out.push({ time: t[i] as string, value: (c[i] - mean) / sd });
  }
  return out;
}

/** Rolling percentile rank (0–100) of the current close within its trailing
 *  window (min of window → 0, max → 100). */
export function computeRollingPercentile(bars: OhlcBar[], window = 252): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 5) return out;
  for (let i = window - 1; i < c.length; i++) {
    let below = 0;
    for (let j = i - window + 1; j <= i; j++) if (c[j] <= c[i]) below++;
    out.push({ time: t[i] as string, value: ((below - 1) / (window - 1)) * 100 });
  }
  return out;
}

/** Percentile VALUE at p (0-100) of an ascending-sorted window.
 *  "nearest" returns an actually-observed value; "linear" interpolates between
 *  the two nearest ranks (both match TradingView's ta.percentile_* helpers). */
function percentileOf(sorted: number[], p: number, method: "linear" | "nearest"): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pp = Math.max(0, Math.min(100, p));
  if (method === "nearest") {
    const idx = Math.min(n, Math.max(1, Math.ceil((pp / 100) * n)));
    return sorted[idx - 1];
  }
  const rank = (pp / 100) * (n - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  return lo === hi ? sorted[lo] : sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo]);
}

// ── Smoothing (matches the Pine ma() helper) ──
export type SmoothType = "None" | "SMA" | "EMA" | "RMA" | "WMA" | "HMA";

function smaArr(v: number[], len: number): (number | null)[] {
  const n = v.length, out: (number | null)[] = new Array(n).fill(null);
  if (len < 1) return v.slice();
  let sum = 0;
  for (let i = 0; i < n; i++) { sum += v[i]; if (i >= len) sum -= v[i - len]; if (i >= len - 1) out[i] = sum / len; }
  return out;
}
/** EMA/RMA seeded with the SMA of the first `len` values (matches the app's EMA
 *  convention and TradingView's SMA-seed). alpha: EMA = 2/(len+1), RMA = 1/len. */
function recursiveMa(v: number[], len: number, alpha: number): (number | null)[] {
  const n = v.length, out: (number | null)[] = new Array(n).fill(null);
  if (n < len || len < 1) return out;
  let seed = 0;
  for (let i = 0; i < len; i++) seed += v[i];
  let m = seed / len;
  out[len - 1] = m;
  for (let i = len; i < n; i++) { m = alpha * v[i] + (1 - alpha) * m; out[i] = m; }
  return out;
}
function wmaArr(v: number[], len: number): (number | null)[] {
  const n = v.length, out: (number | null)[] = new Array(n).fill(null);
  if (len < 1) return v.slice();
  const denom = (len * (len + 1)) / 2;
  for (let i = len - 1; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < len; k++) acc += v[i - len + 1 + k] * (k + 1);
    out[i] = acc / denom;
  }
  return out;
}
function hmaArr(v: number[], len: number): (number | null)[] {
  const half = Math.max(1, Math.floor(len / 2));
  const sq = Math.max(1, Math.round(Math.sqrt(len)));
  const wHalf = wmaArr(v, half), wFull = wmaArr(v, len);
  const diff: number[] = v.map((_, i) => {
    const a = wHalf[i], b = wFull[i];
    return a != null && b != null ? 2 * a - b : NaN;
  });
  // wma over `diff` but honoring NaN warmup (start once we have `sq` finite values).
  const n = v.length, out: (number | null)[] = new Array(n).fill(null);
  const denom = (sq * (sq + 1)) / 2;
  for (let i = sq - 1; i < n; i++) {
    let acc = 0, ok = true;
    for (let k = 0; k < sq; k++) { const d = diff[i - sq + 1 + k]; if (!Number.isFinite(d)) { ok = false; break; } acc += d * (k + 1); }
    if (ok) out[i] = acc / denom;
  }
  return out;
}
function smoothArr(v: number[], type: SmoothType, len: number): (number | null)[] {
  if (type === "None" || len < 2) return v.slice();
  switch (type) {
    case "SMA": return smaArr(v, len);
    case "EMA": return recursiveMa(v, len, 2 / (len + 1));
    case "RMA": return recursiveMa(v, len, 1 / len);
    case "WMA": return wmaArr(v, len);
    case "HMA": return hmaArr(v, len);
    default: return v.slice();
  }
}
/** Smooth a DataPoint series' values, dropping the warm-up (leading nulls). */
function smoothSeries(series: DataPoint[], type: SmoothType, len: number): DataPoint[] {
  if (type === "None" || len < 2 || series.length === 0) return series;
  const sm = smoothArr(series.map((d) => d.value), type, len);
  const out: DataPoint[] = [];
  for (let i = 0; i < series.length; i++) if (sm[i] != null && Number.isFinite(sm[i]!)) out.push({ time: series[i].time, value: sm[i]! });
  return out;
}

export interface PercentRankBands {
  pr: DataPoint[];    // percent rank of the current close, 0-100
  srcN: DataPoint[];  // source min-max normalized to 0-100 over the window
  hiN: DataPoint[];   // upper percentile band, normalized 0-100
  midN: DataPoint[];  // middle percentile band, normalized 0-100
  loN: DataPoint[];   // lower percentile band, normalized 0-100
  hiRaw: DataPoint[]; // upper percentile band, SOURCE units (for a price overlay)
  midRaw: DataPoint[];
  loRaw: DataPoint[];
}

/** Percent rank line + percentile bands (upper/mid/lower) of the close over a
 *  trailing window. Bands are min-max normalized to 0-100 so they share the
 *  percent-rank axis (a port of the TradingView "Percent Rank + Percentile
 *  Bands" indicator's normalized view). Close-only ⇒ safe on ratio/derived
 *  panes; frequency is applied upstream by resampleIndicatorBars.
 *
 *  Optional smoothing (matches the Pine calc order): SOURCE smoothing is
 *  applied first (rank/percentile the smoothed series), then OUTPUT smoothing
 *  is applied to the percent-rank line and the bands (not the source line or
 *  the min/max used for normalization). */
export function computePercentRankBands(
  bars: OhlcBar[], window: number, pHi: number, pMid: number, pLo: number, method: "linear" | "nearest",
  smooth?: { srcType?: SmoothType; srcLen?: number; outType?: SmoothType; outLen?: number },
): PercentRankBands {
  const empty: PercentRankBands = { pr: [], srcN: [], hiN: [], midN: [], loN: [], hiRaw: [], midRaw: [], loRaw: [] };
  let { t, c } = closesOf(bars);

  // ── Source smoothing (before ranking) ──
  const srcType = smooth?.srcType ?? "None", srcLen = smooth?.srcLen ?? 5;
  if (srcType !== "None" && srcLen >= 2) {
    const sm = smoothArr(c, srcType, srcLen);
    const cc: number[] = [], tt: (string | number)[] = [];
    for (let i = 0; i < c.length; i++) if (sm[i] != null && Number.isFinite(sm[i]!)) { cc.push(sm[i]!); tt.push(t[i]); }
    c = cc; t = tt;
  }
  if (c.length < window || window < 5) return empty;

  // ── Per-window raw stats on the (smoothed) source ──
  const pr0: DataPoint[] = [], hi0: DataPoint[] = [], mid0: DataPoint[] = [], lo0: DataPoint[] = [];
  const srcRaw: DataPoint[] = [];
  const winMM = new Map<string, { min: number; max: number }>();
  for (let i = window - 1; i < c.length; i++) {
    const win = c.slice(i - window + 1, i + 1);
    const sorted = [...win].sort((a, b) => a - b);
    const min = sorted[0], max = sorted[sorted.length - 1];
    let below = 0;
    for (const v of win) if (v <= c[i]) below++;
    const time = t[i] as string;
    pr0.push({ time, value: ((below - 1) / (window - 1)) * 100 });
    hi0.push({ time, value: percentileOf(sorted, pHi, method) });
    mid0.push({ time, value: percentileOf(sorted, pMid, method) });
    lo0.push({ time, value: percentileOf(sorted, pLo, method) });
    srcRaw.push({ time, value: c[i] });
    winMM.set(time, { min, max });
  }

  // ── Output smoothing (after ranking) — pr line + bands only ──
  const outType = smooth?.outType ?? "None", outLen = smooth?.outLen ?? 3;
  const pr = smoothSeries(pr0, outType, outLen);
  const hiRaw = smoothSeries(hi0, outType, outLen);
  const midRaw = smoothSeries(mid0, outType, outLen);
  const loRaw = smoothSeries(lo0, outType, outLen);

  // ── Normalized (0-100) using each bar's own window min/max of the source ──
  const nrm = (d: DataPoint): DataPoint => {
    const mm = winMM.get(d.time as string);
    const rng = mm ? mm.max - mm.min : 0;
    return { time: d.time, value: mm && rng > 0 ? ((d.value - mm.min) / rng) * 100 : 50 };
  };
  return {
    pr,
    srcN: srcRaw.map(nrm),
    hiN: hiRaw.map(nrm),
    midN: midRaw.map(nrm),
    loN: loRaw.map(nrm),
    hiRaw, midRaw, loRaw,
  };
}

/** OHLC arrays aligned to bars with a finite close; high/low fall back to
 *  close (so these run on ratio/derived panes where o=h=l=c is synthesized). */
function ohlcOf(bars: OhlcBar[]): { t: (string | number)[]; h: number[]; l: number[]; c: number[] } {
  const t: (string | number)[] = [], h: number[] = [], l: number[] = [], c: number[] = [];
  for (const b of bars) {
    if (!Number.isFinite(b.close)) continue;
    t.push(b.time); c.push(b.close);
    h.push(Number.isFinite(b.high) ? b.high : b.close);
    l.push(Number.isFinite(b.low) ? b.low : b.close);
  }
  return { t, h, l, c };
}

/** Choppiness Index (0-100): how trending vs. choppy the last `window` bars are.
 *  100·log10(ΣTR / (maxHigh−minLow)) / log10(window). HIGH (>~61.8) = choppy/
 *  ranging, LOW (<~38.2) = trending. */
export function computeChoppiness(bars: OhlcBar[], window = 14): DataPoint[] {
  const { t, h, l, c } = ohlcOf(bars);
  const n = c.length, out: DataPoint[] = [];
  if (n < window + 1 || window < 2) return out;
  const tr = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n; i++) { const pc = c[i - 1]; tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - pc), Math.abs(l[i] - pc)); }
  const logN = Math.log10(window);
  for (let i = window; i < n; i++) {
    let sumTr = 0, maxH = -Infinity, minL = Infinity;
    for (let j = i - window + 1; j <= i; j++) { sumTr += tr[j]; if (h[j] > maxH) maxH = h[j]; if (l[j] < minL) minL = l[j]; }
    const rng = maxH - minL;
    if (rng > 0 && sumTr > 0) out.push({ time: t[i] as string, value: (100 * Math.log10(sumTr / rng)) / logN });
  }
  return out;
}

/** Vertical Horizontal Filter: |range of close over n| / Σ|Δclose| over n.
 *  HIGH = trending (net move dominates noise), LOW = ranging. Close-only. */
export function computeVHF(bars: OhlcBar[], window = 28): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window + 1 || window < 2) return out;
  for (let i = window; i < c.length; i++) {
    let maxC = -Infinity, minC = Infinity, sumChg = 0;
    for (let j = i - window + 1; j <= i; j++) { if (c[j] > maxC) maxC = c[j]; if (c[j] < minC) minC = c[j]; sumChg += Math.abs(c[j] - c[j - 1]); }
    if (sumChg > 0) out.push({ time: t[i] as string, value: (maxC - minC) / sumChg });
  }
  return out;
}

/** Vortex Indicator VI+ / VI− over a trailing window. VI+ > VI− = uptrend,
 *  crossovers mark trend changes, both near 1 / converged = range. */
export function computeVortex(bars: OhlcBar[], window = 14): { plus: DataPoint[]; minus: DataPoint[] } {
  const { t, h, l, c } = ohlcOf(bars);
  const n = c.length, plus: DataPoint[] = [], minus: DataPoint[] = [];
  if (n < window + 1 || window < 2) return { plus, minus };
  const vmP = new Array<number>(n).fill(NaN), vmM = new Array<number>(n).fill(NaN), tr = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    vmP[i] = Math.abs(h[i] - l[i - 1]);
    vmM[i] = Math.abs(l[i] - h[i - 1]);
    const pc = c[i - 1];
    tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - pc), Math.abs(l[i] - pc));
  }
  for (let i = window; i < n; i++) {
    let sp = 0, sm = 0, st = 0;
    for (let j = i - window + 1; j <= i; j++) { sp += vmP[j]; sm += vmM[j]; st += tr[j]; }
    if (st > 0) { plus.push({ time: t[i] as string, value: sp / st }); minus.push({ time: t[i] as string, value: sm / st }); }
  }
  return { plus, minus };
}

export interface TtmSqueeze {
  mom: DataPoint[];    // TTM momentum (linreg histogram value)
  sqzOn: boolean[];    // squeeze state per mom point (BB inside Keltner)
}

/** TTM Squeeze: momentum histogram + squeeze state. Squeeze ON = Bollinger
 *  Bands (length, bbMult σ) inside Keltner Channels (length, kcMult·SMA(TR)) —
 *  volatility coiling / range. Momentum = linreg over `length` of
 *  close − avg( (highestHigh+lowestLow)/2 , SMA(close) ). Rising momentum out
 *  of a squeeze = trend breakout. */
export function computeTTMSqueeze(bars: OhlcBar[], length = 20, bbMult = 2, kcMult = 1.5): TtmSqueeze {
  const { t, h, l, c } = ohlcOf(bars);
  const n = c.length, mom: DataPoint[] = [], sqzOn: boolean[] = [];
  if (n < 2 * length || length < 3) return { mom, sqzOn };
  const tr = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n; i++) { const pc = c[i - 1]; tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - pc), Math.abs(l[i] - pc)); }
  // m[i] = close − avg( midpoint(highestHigh, lowestLow) , SMA(close) ) over `length`.
  const m = new Array<number>(n).fill(NaN);
  for (let i = length - 1; i < n; i++) {
    let sum = 0, hi = -Infinity, lo = Infinity;
    for (let j = i - length + 1; j <= i; j++) { sum += c[j]; if (h[j] > hi) hi = h[j]; if (l[j] < lo) lo = l[j]; }
    m[i] = c[i] - ((hi + lo) / 2 + sum / length) / 2;
  }
  const sx = (length * (length - 1)) / 2;
  const sxx = ((length - 1) * length * (2 * length - 1)) / 6;
  const denom = length * sxx - sx * sx;
  for (let i = 2 * length - 2; i < n; i++) {
    // Linreg of m over the window, evaluated at the last point.
    let sy = 0, sxy = 0;
    for (let k = 0; k < length; k++) { const y = m[i - length + 1 + k]; sy += y; sxy += k * y; }
    const b = denom !== 0 ? (length * sxy - sx * sy) / denom : 0;
    const a = (sy - b * sx) / length;
    // Bollinger + Keltner over the same window.
    let cs = 0, trs = 0;
    for (let j = i - length + 1; j <= i; j++) { cs += c[j]; trs += tr[j]; }
    const basis = cs / length;
    let ss = 0;
    for (let j = i - length + 1; j <= i; j++) ss += (c[j] - basis) ** 2;
    const sd = Math.sqrt(ss / length); // population σ, matching ta.stdev
    const rangeMa = trs / length;
    const bbUpper = basis + bbMult * sd, bbLower = basis - bbMult * sd;
    const kcUpper = basis + kcMult * rangeMa, kcLower = basis - kcMult * rangeMa;
    mom.push({ time: t[i] as string, value: a + b * (length - 1) });
    sqzOn.push(bbLower > kcLower && bbUpper < kcUpper);
  }
  return { mom, sqzOn };
}

/** Annualized realized volatility (%) of log returns over a trailing window. */
export function computeRealizedVol(bars: OhlcBar[], window = 21, periodsPerYear = 252): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window + 1 || window < 5) return out;
  const { x } = logOrRaw(c);
  const rets: number[] = [];
  for (let i = 1; i < x.length; i++) rets.push(x[i] - x[i - 1]);
  for (let i = window - 1; i < rets.length; i++) {
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += rets[j];
    const mean = sum / window;
    let ss = 0;
    for (let j = i - window + 1; j <= i; j++) ss += (rets[j] - mean) ** 2;
    const sd = Math.sqrt(ss / (window - 1));
    out.push({ time: t[i + 1] as string, value: sd * Math.sqrt(periodsPerYear) * 100 });
  }
  return out;
}

/** % drawdown from the trailing-window high (≤ 0; 0 = at the high). */
export function computeRollingDrawdown(bars: OhlcBar[], window = 252): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < 2 || window < 2) return out;
  for (let i = 0; i < c.length; i++) {
    const from = Math.max(0, i - window + 1);
    let hi = -Infinity;
    for (let j = from; j <= i; j++) hi = Math.max(hi, c[j]);
    if (hi > 0) out.push({ time: t[i] as string, value: (c[i] / hi - 1) * 100 });
  }
  return out;
}

/** Bollinger stats per bar (SMA basis + sample σ) shared by %B / bandwidth. */
function bollingerStats(c: number[], period: number): { mean: number; sd: number }[] {
  const out: { mean: number; sd: number }[] = [];
  for (let i = period - 1; i < c.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += c[j];
    const mean = sum / period;
    let ss = 0;
    for (let j = i - period + 1; j <= i; j++) ss += (c[j] - mean) ** 2;
    out.push({ mean, sd: Math.sqrt(ss / (period - 1)) });
  }
  return out;
}

/** Bollinger %B: (close − lower) / (upper − lower). 0 = lower band, 1 = upper. */
export function computeBollingerPctB(bars: OhlcBar[], period = 20, mult = 2): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < period || period < 3) return out;
  const stats = bollingerStats(c, period);
  stats.forEach((s, k) => {
    const i = k + period - 1;
    const span = 2 * mult * s.sd;
    if (span > 0) out.push({ time: t[i] as string, value: (c[i] - (s.mean - mult * s.sd)) / span });
  });
  return out;
}

/** Bollinger bandwidth: (upper − lower) / |basis| × 100. */
export function computeBollingerBandwidth(bars: OhlcBar[], period = 20, mult = 2): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < period || period < 3) return out;
  const stats = bollingerStats(c, period);
  stats.forEach((s, k) => {
    const i = k + period - 1;
    if (Math.abs(s.mean) > 1e-12) out.push({ time: t[i] as string, value: ((2 * mult * s.sd) / Math.abs(s.mean)) * 100 });
  });
  return out;
}

/** Rolling AR(1) mean-reversion half-life in bars: regress Δx on x(t−1)
 *  within the window; HL = −ln2 / ln(1+β) when −1 < β < 0. Gaps where the
 *  series is NOT mean-reverting (β ≥ 0); capped at 3× the window. */
export function computeHalfLife(bars: OhlcBar[], window = 126): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window + 1 || window < 20) return out;
  const { x } = logOrRaw(c);
  for (let i = window; i < x.length; i++) {
    let sx = 0, sy = 0;
    for (let j = i - window + 1; j <= i; j++) { sx += x[j - 1]; sy += x[j] - x[j - 1]; }
    const mx = sx / window, my = sy / window;
    let cov = 0, varx = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const dx = x[j - 1] - mx;
      cov += dx * (x[j] - x[j - 1] - my);
      varx += dx * dx;
    }
    if (varx <= 0) continue;
    const beta = cov / varx;
    if (beta >= 0 || beta <= -1) continue; // not mean-reverting (or degenerate)
    const hl = -Math.LN2 / Math.log(1 + beta);
    if (Number.isFinite(hl) && hl > 0) out.push({ time: t[i] as string, value: Math.min(hl, window * 3) });
  }
  return out;
}

/** Rolling Hurst exponent from the scaling of τ-difference dispersions
 *  (τ = 1,2,4,8,16): E[(x(t) − x(t−τ))²] ∝ τ^(2H). NON-centered second
 *  moment on purpose — drift IS persistence for a trending-vs-reverting
 *  regime dial (centering would strip the trend and read ~0). Below 0.5 =
 *  mean-reverting, 0.5 = random walk, above 0.5 = trending. */
export function computeHurst(bars: OhlcBar[], window = 252): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 48) return out;
  const { x } = logOrRaw(c);
  const taus = [1, 2, 4, 8, 16];
  for (let i = window - 1; i < x.length; i++) {
    const from = i - window + 1;
    const pts: { lt: number; ls: number }[] = [];
    for (const tau of taus) {
      let n = 0, ss = 0;
      for (let j = from + tau; j <= i; j++) {
        const d = x[j] - x[j - tau];
        n++; ss += d * d;
      }
      if (n < 8) continue;
      const vard = ss / n;
      if (vard <= 0) continue;
      pts.push({ lt: Math.log(tau), ls: 0.5 * Math.log(vard) });
    }
    if (pts.length < 3) continue;
    const mlt = pts.reduce((a, p) => a + p.lt, 0) / pts.length;
    const mls = pts.reduce((a, p) => a + p.ls, 0) / pts.length;
    let cov = 0, varlt = 0;
    for (const p of pts) { cov += (p.lt - mlt) * (p.ls - mls); varlt += (p.lt - mlt) ** 2; }
    if (varlt <= 0) continue;
    const h = cov / varlt;
    out.push({ time: t[i] as string, value: Math.max(0, Math.min(1.5, h)) });
  }
  return out;
}

/** Kaufman Efficiency Ratio: |net move| ÷ path length over the period (0–1). */
export function computeEfficiencyRatio(bars: OhlcBar[], period = 20): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < period + 1 || period < 2) return out;
  for (let i = period; i < c.length; i++) {
    let path = 0;
    for (let j = i - period + 1; j <= i; j++) path += Math.abs(c[j] - c[j - 1]);
    if (path > 0) out.push({ time: t[i] as string, value: Math.abs(c[i] - c[i - period]) / path });
  }
  return out;
}

/** Rolling OLS of log close on time: annualized slope (%) + R². Falls back to
 *  raw units per year when the series isn't strictly positive. */
export function computeRegSlope(
  bars: OhlcBar[],
  window = 63,
  periodsPerYear = 252,
): { slope: DataPoint[]; r2: DataPoint[] } {
  const { t, c } = closesOf(bars);
  const slope: DataPoint[] = [], r2: DataPoint[] = [];
  if (c.length < window || window < 10) return { slope, r2 };
  const { x, isLog } = logOrRaw(c);
  const mi = (window - 1) / 2;
  let varI = 0;
  for (let k = 0; k < window; k++) varI += (k - mi) ** 2;
  for (let i = window - 1; i < x.length; i++) {
    const from = i - window + 1;
    let my = 0;
    for (let k = 0; k < window; k++) my += x[from + k];
    my /= window;
    let cov = 0, ssy = 0;
    for (let k = 0; k < window; k++) {
      const dy = x[from + k] - my;
      cov += (k - mi) * dy;
      ssy += dy * dy;
    }
    const b = cov / varI;
    const ann = isLog ? (Math.exp(b * periodsPerYear) - 1) * 100 : b * periodsPerYear;
    if (!Number.isFinite(ann)) continue;
    slope.push({ time: t[i] as string, value: Math.max(-1000, Math.min(1000, ann)) });
    const rr = ssy > 0 ? (cov * cov) / (varI * ssy) : 0;
    r2.push({ time: t[i] as string, value: Math.max(0, Math.min(1, rr)) });
  }
  return { slope, r2 };
}

// ─────────────────────────────────────────────────────────────────────────
// Distribution / detrend transforms (close-only) — companions to the z-score
// and percentile transforms above. Robust standardization, bounded scaling,
// trend removal, and stationarization.
// ─────────────────────────────────────────────────────────────────────────

/** Median of a numeric array (does not mutate the input). */
function medianOf(a: number[]): number {
  const s = [...a].sort((x, y) => x - y), n = s.length, m = n >> 1;
  return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Rolling ROBUST z-score: (x − median) / (1.4826·MAD) over a trailing window.
 *  MAD-based ⇒ outlier-resistant vs the mean/σ z-score (one earnings gap won't
 *  inflate the scale and mute every later extreme). 1.4826 rescales MAD to a
 *  σ-equivalent under normality, so the ±2/±3.5 thresholds read like a normal z
 *  (|z|>3.5 = outlier, Iglewicz–Hoaglin). */
export function computeRobustZScore(bars: OhlcBar[], window = 63): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 3) return out;
  for (let i = window - 1; i < c.length; i++) {
    const win = c.slice(i - window + 1, i + 1);
    const med = medianOf(win);
    const mad = medianOf(win.map((v) => Math.abs(v - med)));
    if (mad > 0) out.push({ time: t[i] as string, value: (c[i] - med) / (1.4826 * mad) });
  }
  return out;
}

/** Rolling MIN-MAX normalization: (x − min)/(max − min)·100 over a trailing
 *  window ⇒ 0 at the window low, 100 at the high. Stochastic %K generalized to
 *  any source: the LINEAR position within the range (vs percentile's RANK
 *  position). Bounds any series to a shared 0–100 scale for cross-comparison. */
export function computeMinMaxNorm(bars: OhlcBar[], window = 63): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 2) return out;
  for (let i = window - 1; i < c.length; i++) {
    let lo = Infinity, hi = -Infinity;
    for (let j = i - window + 1; j <= i; j++) { if (c[j] < lo) lo = c[j]; if (c[j] > hi) hi = c[j]; }
    if (hi > lo) out.push({ time: t[i] as string, value: ((c[i] - lo) / (hi - lo)) * 100 });
  }
  return out;
}

/** Position (0–100) of the current value within its rolling [loPct, hiPct]
 *  percentile band — a WINSORIZED min-max: values at/below the lower percentile
 *  read 0, at/above the upper read 100. Outlier-robust vs true-range min-max
 *  (a single spike can't stretch the band). */
export function computePctBandPosition(bars: OhlcBar[], window = 63, hiPct = 80, loPct = 20): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 5) return out;
  for (let i = window - 1; i < c.length; i++) {
    const win = c.slice(i - window + 1, i + 1).sort((a, b) => a - b);
    const lo = percentileOf(win, loPct, "linear");
    const hi = percentileOf(win, hiPct, "linear");
    if (hi > lo) {
      const pos = Math.max(0, Math.min(1, (c[i] - lo) / (hi - lo))) * 100;
      out.push({ time: t[i] as string, value: pos });
    }
  }
  return out;
}

/** Rolling regression RESIDUAL (detrend): value minus its local linear-trend
 *  fit at the current bar. On a positive series the fit is on ln(price) and the
 *  residual is expressed as % deviation from trend; on a signed series it's the
 *  raw residual. Zero = on trend; +/− = above/below the local line — the
 *  cyclical/mean-reverting component left after the drift is removed. */
export function computeRegResidual(bars: OhlcBar[], window = 63): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 10) return out;
  const { x, isLog } = logOrRaw(c);
  const mi = (window - 1) / 2;
  let varI = 0;
  for (let k = 0; k < window; k++) varI += (k - mi) ** 2;
  for (let i = window - 1; i < x.length; i++) {
    const from = i - window + 1;
    let my = 0;
    for (let k = 0; k < window; k++) my += x[from + k];
    my /= window;
    let cov = 0;
    for (let k = 0; k < window; k++) cov += (k - mi) * (x[from + k] - my);
    const b = cov / varI;                    // slope (per bar)
    const fitted = my + b * ((window - 1) - mi); // fit at the last (current) point
    const resid = x[i] - fitted;
    const val = isLog ? (Math.exp(resid) - 1) * 100 : resid;
    if (Number.isFinite(val)) out.push({ time: t[i] as string, value: val });
  }
  return out;
}

/** FRACTIONAL differencing (López de Prado, fixed-width window). Applies the
 *  binomial fractional-difference weights of order d∈(0,1] so the series becomes
 *  (near-)stationary while retaining maximum long memory — d=1 ≈ an ordinary
 *  first difference (memory erased), small d keeps most of the level. Weights
 *  w₀=1, wₖ = −wₖ₋₁·(d−k+1)/k, truncated where |wₖ| < thresh; the fracdiff value
 *  is the dot product of the trailing window with those weights. Runs on
 *  ln(price) when positive so it's scale-free. */
export function computeFracDiff(bars: OhlcBar[], d = 0.4, thresh = 1e-4): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < 20 || d <= 0) return out;
  const { x } = logOrRaw(c);
  const w: number[] = [1];
  let k = 1;
  while (k < x.length) {
    const wk = (-w[k - 1] * (d - k + 1)) / k;
    if (Math.abs(wk) < thresh) break;
    w.push(wk);
    k++;
  }
  const width = w.length;
  for (let i = width - 1; i < x.length; i++) {
    let dot = 0;
    for (let j = 0; j < width; j++) dot += w[j] * x[i - j];
    if (Number.isFinite(dot)) out.push({ time: t[i] as string, value: dot });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Distribution-shape diagnostics (on log RETURNS) + robust position/dynamics
// measures (on the LEVEL). Shape reads explain why percentile and ±σ bands
// disagree; the level measures are outlier-robust alternatives to the z-score.
// ─────────────────────────────────────────────────────────────────────────

/** Trailing log-return series aligned to bars (ret[0]=NaN). */
function logRetOf(c: number[]): number[] {
  const r = new Array<number>(c.length).fill(NaN);
  for (let i = 1; i < c.length; i++) r[i] = c[i] > 0 && c[i - 1] > 0 ? Math.log(c[i] / c[i - 1]) : 0;
  return r;
}

/** Rolling SKEWNESS of window log-returns (0 = symmetric; + = fat upside tail). */
export function computeRollingSkew(bars: OhlcBar[], window = 63): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window + 1 || window < 5) return out;
  const r = logRetOf(c);
  for (let i = window; i < c.length; i++) {
    let mean = 0;
    for (let j = i - window + 1; j <= i; j++) mean += r[j];
    mean /= window;
    let m2 = 0, m3 = 0;
    for (let j = i - window + 1; j <= i; j++) { const d = r[j] - mean; m2 += d * d; m3 += d * d * d; }
    m2 /= window; m3 /= window;
    const sd = Math.sqrt(m2);
    if (sd > 0) out.push({ time: t[i] as string, value: m3 / (sd * sd * sd) });
  }
  return out;
}

/** Rolling EXCESS KURTOSIS of window log-returns (0 = normal; >0 = fat tails,
 *  so ±σ bands understate the true extremes). */
export function computeRollingKurtosis(bars: OhlcBar[], window = 63): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window + 1 || window < 5) return out;
  const r = logRetOf(c);
  for (let i = window; i < c.length; i++) {
    let mean = 0;
    for (let j = i - window + 1; j <= i; j++) mean += r[j];
    mean /= window;
    let m2 = 0, m4 = 0;
    for (let j = i - window + 1; j <= i; j++) { const d = r[j] - mean; const d2 = d * d; m2 += d2; m4 += d2 * d2; }
    m2 /= window; m4 /= window;
    if (m2 > 0) out.push({ time: t[i] as string, value: m4 / (m2 * m2) - 3 });
  }
  return out;
}

/** Rolling normalized SHANNON ENTROPY (0–1) of the window's log-returns binned
 *  into `bins` equal-width buckets. 1 = maximally disordered/uniform (chop),
 *  0 = concentrated (calm/trending). Level-independent. */
export function computeRollingEntropy(bars: OhlcBar[], window = 63, bins = 8): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window + 1 || window < 8 || bins < 2) return out;
  const r = logRetOf(c);
  const invLogBins = 1 / Math.log(bins);
  for (let i = window; i < c.length; i++) {
    let lo = Infinity, hi = -Infinity;
    for (let j = i - window + 1; j <= i; j++) { if (r[j] < lo) lo = r[j]; if (r[j] > hi) hi = r[j]; }
    if (hi <= lo) { out.push({ time: t[i] as string, value: 0 }); continue; }
    const counts = new Array<number>(bins).fill(0);
    for (let j = i - window + 1; j <= i; j++) {
      let b = Math.floor(((r[j] - lo) / (hi - lo)) * bins);
      if (b >= bins) b = bins - 1; if (b < 0) b = 0;
      counts[b]++;
    }
    let H = 0;
    for (const cnt of counts) if (cnt > 0) { const p = cnt / window; H -= p * Math.log(p); }
    out.push({ time: t[i] as string, value: H * invLogBins });
  }
  return out;
}

/** Rolling WINSORIZED z-score: clip the window to [clipPct, 100−clipPct]
 *  percentiles, take the clipped mean/σ (robust scale), then measure the RAW
 *  current value against it — outliers still read large, but one spike no longer
 *  inflates σ. Middle ground between raw z and median/MAD. */
export function computeWinsorizedZScore(bars: OhlcBar[], window = 63, clipPct = 5): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 5) return out;
  for (let i = window - 1; i < c.length; i++) {
    const win = c.slice(i - window + 1, i + 1).sort((a, b) => a - b);
    const loV = percentileOf(win, clipPct, "linear");
    const hiV = percentileOf(win, 100 - clipPct, "linear");
    let sum = 0;
    for (let k = 0; k < window; k++) { const cv = Math.min(Math.max(win[k], loV), hiV); sum += cv; }
    const mean = sum / window;
    let ss = 0;
    for (let k = 0; k < window; k++) { const cv = Math.min(Math.max(win[k], loV), hiV); ss += (cv - mean) ** 2; }
    const sd = Math.sqrt(ss / window);
    if (sd > 0) out.push({ time: t[i] as string, value: (c[i] - mean) / sd });
  }
  return out;
}

/** Rolling IQR POSITION (unclamped): (x − Q1)/(Q3 − Q1)·100, so Q1→0, Q3→100.
 *  The Tukey outlier fences Q1−1.5·IQR / Q3+1.5·IQR sit at position −150 / +250. */
export function computeIqrPosition(bars: OhlcBar[], window = 63): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 5) return out;
  for (let i = window - 1; i < c.length; i++) {
    const win = c.slice(i - window + 1, i + 1).sort((a, b) => a - b);
    const q1 = percentileOf(win, 25, "linear"), q3 = percentileOf(win, 75, "linear");
    const iqr = q3 - q1;
    if (iqr > 0) out.push({ time: t[i] as string, value: ((c[i] - q1) / iqr) * 100 });
  }
  return out;
}

/** Rolling percentile rank (0–100) of the current level within its window —
 *  helper for persistence + rank rate-of-change. */
function rollPctRank(c: number[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(c.length).fill(null);
  for (let i = window - 1; i < c.length; i++) {
    let below = 0;
    for (let j = i - window + 1; j <= i; j++) if (c[j] <= c[i]) below++;
    out[i] = ((below - 1) / (window - 1)) * 100;
  }
  return out;
}

/** Rolling PERSISTENCE: signed run-length of consecutive bars the level has sat
 *  past a percentile band. +N = N bars at/above the (100−pct)th percentile,
 *  −N = N bars at/below the pctth, 0 = inside. Turns single-bar band touches
 *  into a "how long has it been stuck there" read. */
export function computePersistence(bars: OhlcBar[], window = 63, pct = 20): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 5) return out;
  const rank = rollPctRank(c, window);
  let run = 0, prevState = 0;
  for (let i = window - 1; i < c.length; i++) {
    const rk = rank[i];
    const state = rk == null ? 0 : rk <= pct ? -1 : rk >= 100 - pct ? 1 : 0;
    if (state !== 0 && state === prevState) run += 1; else run = state === 0 ? 0 : 1;
    prevState = state;
    out.push({ time: t[i] as string, value: state * run });
  }
  return out;
}

/** Rolling RATE-OF-CHANGE OF PERCENTILE RANK: rank[i] − rank[i−lookback]
 *  (−100..+100). Positive = compressing UP out of a low band / pushing into a
 *  high one; negative = expanding down. Reads the direction of the rank itself. */
export function computeRankRoc(bars: OhlcBar[], window = 63, lookback = 10): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window + lookback || window < 5 || lookback < 1) return out;
  const rank = rollPctRank(c, window);
  for (let i = window - 1 + lookback; i < c.length; i++) {
    const a = rank[i], b = rank[i - lookback];
    if (a != null && b != null) out.push({ time: t[i] as string, value: a - b });
  }
  return out;
}

/** Rolling INTER-PERCENTILE DISPERSION: the width between the hiPct and loPct
 *  percentiles of the window, as a % of the window median — a robust,
 *  outlier-resistant volatility proxy (P90−P10 by default; set 75/25 for the
 *  IQR). Falls back to raw width when the median is ≤ 0. */
export function computePctileDispersion(bars: OhlcBar[], window = 63, hiPct = 90, loPct = 10): DataPoint[] {
  const { t, c } = closesOf(bars);
  const out: DataPoint[] = [];
  if (c.length < window || window < 5) return out;
  for (let i = window - 1; i < c.length; i++) {
    const win = c.slice(i - window + 1, i + 1).sort((a, b) => a - b);
    const hi = percentileOf(win, hiPct, "linear");
    const lo = percentileOf(win, loPct, "linear");
    const med = percentileOf(win, 50, "linear");
    const width = hi - lo;
    out.push({ time: t[i] as string, value: med > 0 ? (width / med) * 100 : width });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// DeMark TD Sequential — Setup (1–9, price-flip + perfection) then Countdown
// (1–13). Trend-exhaustion timing. Returns per-bar markers for the overlay.
// ─────────────────────────────────────────────────────────────────────────

export interface TDMarker {
  time: string | number;
  phase: "setup" | "countdown";
  side: "buy" | "sell";
  count: number;        // 1..9 (setup) or 1..13 (countdown)
  perfected?: boolean;  // set on a perfected setup 9
}

/** DeMark TD Sequential. Setup: 9 consecutive closes each below (buy) / above
 *  (sell) the close 4 bars earlier — the streak resets on the opposite
 *  relationship, so count 1 IS the TD price flip; the 9 is "perfected" when the
 *  low(8|9)≤low(6&7) [buy] / high(8|9)≥high(6&7) [sell]. Countdown (after a 9):
 *  count bars, not necessarily consecutive, where close≤low[-2] [buy] /
 *  close≥high[-2] [sell] up to 13; an opposite setup completion cancels it.
 *  `signalsOnly` emits only the 9s and 13s. `aggressive` counts the countdown
 *  off the bar's own low/high instead of the close. `combo` uses the stricter
 *  TD Combo countdown (close≤low[-2] AND lower low AND lower close [buy]). */
export function computeTDSequential(bars: OhlcBar[], signalsOnly = 0, aggressive = 0, combo = 0): TDMarker[] {
  const { t, h, l, c } = ohlcOf(bars);
  const n = c.length;
  const out: TDMarker[] = [];
  if (n < 6) return out;
  const emit = (m: TDMarker) => {
    if (!signalsOnly || (m.phase === "setup" && m.count === 9) || (m.phase === "countdown" && m.count === 13)) out.push(m);
  };

  let buyS = 0, sellS = 0;             // consecutive setup counts
  const buyRun: number[] = [], sellRun: number[] = []; // bar indices of the current setup run
  let cdSide: "buy" | "sell" | null = null;
  let cdCount = 0;

  for (let i = 4; i < n; i++) {
    const down = c[i] < c[i - 4];
    const up = c[i] > c[i - 4];
    let completedBuy = false, completedSell = false;

    if (down) {
      buyS += 1; sellS = 0; sellRun.length = 0;
      buyRun.push(i); if (buyRun.length > 9) buyRun.shift();
      if (buyS <= 9) {
        const perfected = buyS === 9 && Math.min(l[buyRun[7]], l[buyRun[8]]) <= Math.min(l[buyRun[5]], l[buyRun[6]]);
        emit({ time: t[i], phase: "setup", side: "buy", count: buyS, perfected });
        if (buyS === 9) completedBuy = true;
      }
    } else if (up) {
      sellS += 1; buyS = 0; buyRun.length = 0;
      sellRun.push(i); if (sellRun.length > 9) sellRun.shift();
      if (sellS <= 9) {
        const perfected = sellS === 9 && Math.max(h[sellRun[7]], h[sellRun[8]]) >= Math.max(h[sellRun[5]], h[sellRun[6]]);
        emit({ time: t[i], phase: "setup", side: "sell", count: sellS, perfected });
        if (sellS === 9) completedSell = true;
      }
    } else {
      buyS = 0; sellS = 0; buyRun.length = 0; sellRun.length = 0;
    }

    // Countdown starts on a setup 9; opposite setup cancels an active countdown.
    if (completedBuy) { cdSide = "buy"; cdCount = 0; }
    else if (completedSell) { cdSide = "sell"; cdCount = 0; }

    if (i >= 2) {
      const buyQual = combo
        ? c[i] <= l[i - 2] && l[i] < l[i - 1] && c[i] < c[i - 1]
        : aggressive ? l[i] <= l[i - 2] : c[i] <= l[i - 2];
      const sellQual = combo
        ? c[i] >= h[i - 2] && h[i] > h[i - 1] && c[i] > c[i - 1]
        : aggressive ? h[i] >= h[i - 2] : c[i] >= h[i - 2];
      if (cdSide === "buy" && buyQual) {
        cdCount += 1;
        emit({ time: t[i], phase: "countdown", side: "buy", count: cdCount });
        if (cdCount >= 13) cdSide = null;
      } else if (cdSide === "sell" && sellQual) {
        cdCount += 1;
        emit({ time: t[i], phase: "countdown", side: "sell", count: cdCount });
        if (cdCount >= 13) cdSide = null;
      }
    }
  }
  return out;
}

/** TD Setup Trend (TDST): support/resistance from completed setups. A BUY setup
 *  (falling price) prints RESISTANCE = the highest true-high of its 9 bars; a
 *  SELL setup prints SUPPORT = the lowest true-low. Each level holds (stepped)
 *  until the next same-type setup replaces it — a close beyond TDST negates the
 *  opposing setup's exhaustion signal. */
export function computeTDST(bars: OhlcBar[]): { resistance: DataPoint[]; support: DataPoint[] } {
  const { t, h, l, c } = ohlcOf(bars);
  const n = c.length;
  const resistance: DataPoint[] = [], support: DataPoint[] = [];
  if (n < 6) return { resistance, support };
  const trueHigh = (i: number) => (i > 0 ? Math.max(h[i], c[i - 1]) : h[i]);
  const trueLow = (i: number) => (i > 0 ? Math.min(l[i], c[i - 1]) : l[i]);
  let buyS = 0, sellS = 0;
  const buyRun: number[] = [], sellRun: number[] = [];
  let curRes: number | null = null, curSup: number | null = null;
  for (let i = 4; i < n; i++) {
    const down = c[i] < c[i - 4], up = c[i] > c[i - 4];
    if (down) {
      buyS += 1; sellS = 0; sellRun.length = 0; buyRun.push(i); if (buyRun.length > 9) buyRun.shift();
      if (buyS === 9) { let mx = -Infinity; for (const b of buyRun) mx = Math.max(mx, trueHigh(b)); curRes = mx; }
    } else if (up) {
      sellS += 1; buyS = 0; buyRun.length = 0; sellRun.push(i); if (sellRun.length > 9) sellRun.shift();
      if (sellS === 9) { let mn = Infinity; for (const b of sellRun) mn = Math.min(mn, trueLow(b)); curSup = mn; }
    } else { buyS = 0; sellS = 0; buyRun.length = 0; sellRun.length = 0; }
    if (curRes !== null) resistance.push({ time: t[i] as string, value: curRes });
    if (curSup !== null) support.push({ time: t[i] as string, value: curSup });
  }
  return { resistance, support };
}

/** TD DeMarker (DeM): momentum oscillator 0–1 from bar-to-bar high/low
 *  expansion — SMA(up-moves)/(SMA(up)+SMA(down)) over `period`. Overbought >0.7,
 *  oversold <0.3. Smoother / fewer whipsaws than RSI (uses highs & lows). */
export function computeDeMarker(bars: OhlcBar[], period = 13): DataPoint[] {
  const { t, h, l } = ohlcOf(bars);
  const n = h.length;
  const out: DataPoint[] = [];
  if (n < period + 1 || period < 2) return out;
  const deMax = new Array<number>(n).fill(0), deMin = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    deMax[i] = h[i] > h[i - 1] ? h[i] - h[i - 1] : 0;
    deMin[i] = l[i] < l[i - 1] ? l[i - 1] - l[i] : 0;
  }
  for (let i = period; i < n; i++) {
    let sMax = 0, sMin = 0;
    for (let j = i - period + 1; j <= i; j++) { sMax += deMax[j]; sMin += deMin[j]; }
    const denom = sMax + sMin;
    out.push({ time: t[i] as string, value: denom > 0 ? sMax / denom : 0.5 });
  }
  return out;
}

/** TD Range Expansion Index (REI): −100…+100 momentum oscillator over `period`
 *  (5). Sum of the 2-bar high + low expansion over the window, divided by the
 *  sum of its absolute magnitude → bounded ±100, +ve in up-expansion, −ve in
 *  down. Less whippy than RSI (built on highs & lows). +40/−40 = strong momentum.
 *  (Range-expansion form; the full DeMark condition-gating has several published
 *  variants and zeros the read during clean trends, so this uses the ungated
 *  momentum core.) */
export function computeTDREI(bars: OhlcBar[], period = 5): DataPoint[] {
  const { t, h, l } = ohlcOf(bars);
  const n = h.length;
  const out: DataPoint[] = [];
  if (n < period + 2 || period < 2) return out;
  for (let i = period + 1; i < n; i++) {
    let num = 0, den = 0;
    for (let k = 0; k < period; k++) {
      const j = i - k;
      if (j < 2) continue;
      const hd = h[j] - h[j - 2];
      const ld = l[j] - l[j - 2];
      num += hd + ld;
      den += Math.abs(hd) + Math.abs(ld);
    }
    out.push({ time: t[i] as string, value: den > 0 ? (num / den) * 100 : 0 });
  }
  return out;
}
