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
