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
