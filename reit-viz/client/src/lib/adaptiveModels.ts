// Adaptive / regime models for chart indicators:
//  - Kalman local-linear-trend filter (adaptive trend + slope, no fixed lookback)
//  - CUSUM change-point detection (mean AND volatility breaks in the returns)
//  - Gaussian hidden Markov model regimes (EM-fitted, 2–3 states)
//
// All operate on closes only (log returns), so they work on ratio/derived
// panes as well as real price series. Pure functions — no chart deps.

export interface TimePoint { time: string; value: number }

// ─────────────────────────────────────────────────────────────────────────
// Kalman local linear trend
// ─────────────────────────────────────────────────────────────────────────
//
// State [level, slope] on ln(price):  level' = level + slope.
// Process noise is tied to the observation noise R (variance of daily log
// returns) through an EFFECTIVE WINDOW W:  q_level = R/W², q_slope = R/W⁴ —
// the classic smoothing-bandwidth parameterization, so W behaves like an
// adaptive moving-average length (small W = fast, large W = smooth) and the
// filter is scale-invariant across assets.

export interface KalmanTrendResult {
  trend: TimePoint[];
  upper: TimePoint[];
  lower: TimePoint[];
  /** Smoothed slope, in % per bar (annualizing is the caller's business). */
  slopePct: TimePoint[];
}

export function computeKalmanTrend(
  closes: TimePoint[],
  windowBars: number,
  bandMult: number,
): KalmanTrendResult {
  const pts = closes.filter((p) => Number.isFinite(p.value) && p.value > 0);
  const n = pts.length;
  const out: KalmanTrendResult = { trend: [], upper: [], lower: [], slopePct: [] };
  if (n < 10) return out;

  const y = pts.map((p) => Math.log(p.value));
  let mean = 0;
  const diffs: number[] = [];
  for (let i = 1; i < n; i++) diffs.push(y[i] - y[i - 1]);
  for (const d of diffs) mean += d;
  mean /= diffs.length;
  let R = 0;
  for (const d of diffs) R += (d - mean) ** 2;
  R = Math.max(R / Math.max(1, diffs.length - 1), 1e-12);

  const W = Math.max(2, windowBars);
  const ql = R / (W * W);
  const qs = R / (W * W * W * W);

  let l = y[0];
  let s = 0;
  let P00 = R * 10, P01 = 0, P11 = R;

  for (let t = 0; t < n; t++) {
    if (t > 0) {
      // Predict
      const lp = l + s;
      const P00p = P00 + 2 * P01 + P11 + ql;
      const P01p = P01 + P11;
      const P11p = P11 + qs;
      // Update
      const S = P00p + R;
      const K0 = P00p / S;
      const K1 = P01p / S;
      const innov = y[t] - lp;
      l = lp + K0 * innov;
      s = s + K1 * innov;
      P00 = (1 - K0) * P00p;
      P01 = (1 - K0) * P01p;
      P11 = P11p - K1 * P01p;
    }
    const sd = Math.sqrt(Math.max(P00 + R, 0));
    out.trend.push({ time: pts[t].time, value: Math.exp(l) });
    out.upper.push({ time: pts[t].time, value: Math.exp(l + bandMult * sd) });
    out.lower.push({ time: pts[t].time, value: Math.exp(l - bandMult * sd) });
    out.slopePct.push({ time: pts[t].time, value: s * 100 });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// CUSUM change-points
// ─────────────────────────────────────────────────────────────────────────
//
// Two-sided Page CUSUM on standardized log returns against a LAGGED EWMA
// baseline (halflife `baselineHl` bars): mean shifts via z, volatility shifts
// via (z²−1)/√2. Alarm at S > h with drift k; alarms reset the statistics and
// start a short refractory window so one break doesn't spray markers.

export type ChangePointKind = "meanUp" | "meanDown" | "volUp" | "volDown";
export interface ChangePoint { time: string; kind: ChangePointKind }

export function computeCusumChangePoints(
  closes: TimePoint[],
  k: number,
  h: number,
  baselineHl: number,
): ChangePoint[] {
  const pts = closes.filter((p) => Number.isFinite(p.value) && p.value > 0);
  const n = pts.length;
  const cps: ChangePoint[] = [];
  if (n < 40) return cps;

  const alpha = 1 - Math.exp(-Math.LN2 / Math.max(5, baselineHl));
  let mu = 0, va = 0;
  let Sp = 0, Sm = 0, Vp = 0, Vm = 0;
  let refractory = 0;
  const WARMUP = 30;
  const SQRT2 = Math.SQRT2;

  let initialized = false;
  let count = 0;
  for (let i = 1; i < n; i++) {
    const r = Math.log(pts[i].value / pts[i - 1].value);
    if (!Number.isFinite(r)) continue;
    count++;
    if (!initialized) { mu = r; va = r * r + 1e-10; initialized = true; continue; }

    if (count > WARMUP && refractory === 0) {
      const sigma = Math.sqrt(Math.max(va, 1e-12));
      const z = (r - mu) / sigma;
      Sp = Math.max(0, Sp + z - k);
      Sm = Math.max(0, Sm - z - k);
      const v = (z * z - 1) / SQRT2;
      Vp = Math.max(0, Vp + v - k);
      Vm = Math.max(0, Vm - v - k);
      let fired: ChangePointKind | null = null;
      if (Sp > h) fired = "meanUp";
      else if (Sm > h) fired = "meanDown";
      else if (Vp > h) fired = "volUp";
      else if (Vm > h) fired = "volDown";
      if (fired) {
        cps.push({ time: pts[i].time, kind: fired });
        Sp = Sm = Vp = Vm = 0;
        refractory = 5;
      }
    } else if (refractory > 0) {
      refractory--;
    }

    // Baseline update AFTER testing (lagged baseline).
    const d = r - mu;
    mu += alpha * d;
    va = (1 - alpha) * (va + alpha * d * d);
  }
  return cps;
}

// ─────────────────────────────────────────────────────────────────────────
// Gaussian HMM regimes
// ─────────────────────────────────────────────────────────────────────────
//
// K-state HMM with Gaussian emissions on log returns, fitted by Baum-Welch
// (scaled forward–backward, sticky-diagonal init, quantile-split means).
// State identity comes out sorted by mean: 2 states → BEAR/BULL,
// 3 states → BEAR/CHOP/BULL. Output is the smoothed (posterior) state per
// bar plus its probability — the caller shades the chart with it.

export interface HmmRegimesResult {
  /** One entry per return bar (i.e. closes[1..]). */
  points: { time: string; state: number; prob: number }[];
  /** Per (sorted) state: mean/vol of daily log return, annualized-ish display strings are the caller's business. */
  stateMeans: number[];
  stateVols: number[];
  /** Label per sorted state index. */
  labels: string[];
  iterations: number;
  logLik: number;
}

export function computeHmmRegimes(
  closes: TimePoint[],
  nStates: number,
  maxIter = 50,
): HmmRegimesResult | null {
  const pts = closes.filter((p) => Number.isFinite(p.value) && p.value > 0);
  const K = Math.max(2, Math.min(3, Math.round(nStates)));
  const times: string[] = [];
  const r: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const v = Math.log(pts[i].value / pts[i - 1].value);
    if (Number.isFinite(v)) { r.push(v); times.push(pts[i].time); }
  }
  const T = r.length;
  if (T < 80) return null;

  // Init: quantile split by return level → per-group mean/var.
  const sorted = [...r].sort((a, b) => a - b);
  const mu: number[] = [];
  const va: number[] = [];
  for (let j = 0; j < K; j++) {
    const lo = Math.floor((j * T) / K);
    const hi = Math.max(lo + 1, Math.floor(((j + 1) * T) / K));
    const seg = sorted.slice(lo, hi);
    const m = seg.reduce((s, v) => s + v, 0) / seg.length;
    let vv = 0;
    for (const v of seg) vv += (v - m) ** 2;
    mu.push(m);
    va.push(Math.max(vv / seg.length, 1e-10));
  }
  let A: number[][] = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (_, j) => (i === j ? 0.94 : 0.06 / (K - 1))),
  );
  let pi = Array.from({ length: K }, () => 1 / K);

  const B = (j: number, x: number) => {
    const d = x - mu[j];
    const e = Math.exp(-(d * d) / (2 * va[j])) / Math.sqrt(2 * Math.PI * va[j]);
    return e > 1e-300 ? e : 1e-300;
  };

  const alpha = Array.from({ length: T }, () => new Float64Array(K));
  const beta = Array.from({ length: T }, () => new Float64Array(K));
  const gamma = Array.from({ length: T }, () => new Float64Array(K));
  const scale = new Float64Array(T);

  let logLik = -Infinity;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    // Forward (scaled)
    let c = 0;
    for (let j = 0; j < K; j++) { alpha[0][j] = pi[j] * B(j, r[0]); c += alpha[0][j]; }
    scale[0] = c > 0 ? c : 1e-300;
    for (let j = 0; j < K; j++) alpha[0][j] /= scale[0];
    for (let t = 1; t < T; t++) {
      c = 0;
      for (let j = 0; j < K; j++) {
        let s = 0;
        for (let i = 0; i < K; i++) s += alpha[t - 1][i] * A[i][j];
        alpha[t][j] = s * B(j, r[t]);
        c += alpha[t][j];
      }
      scale[t] = c > 0 ? c : 1e-300;
      for (let j = 0; j < K; j++) alpha[t][j] /= scale[t];
    }
    let ll = 0;
    for (let t = 0; t < T; t++) ll += Math.log(scale[t]);

    // Backward (same scaling)
    for (let j = 0; j < K; j++) beta[T - 1][j] = 1;
    for (let t = T - 2; t >= 0; t--) {
      for (let i = 0; i < K; i++) {
        let s = 0;
        for (let j = 0; j < K; j++) s += A[i][j] * B(j, r[t + 1]) * beta[t + 1][j];
        beta[t][i] = s / scale[t + 1];
      }
    }

    // Gamma + re-estimation
    for (let t = 0; t < T; t++) {
      let s = 0;
      for (let j = 0; j < K; j++) { gamma[t][j] = alpha[t][j] * beta[t][j]; s += gamma[t][j]; }
      if (s > 0) for (let j = 0; j < K; j++) gamma[t][j] /= s;
    }
    const Anew = Array.from({ length: K }, () => new Float64Array(K));
    const denom = new Float64Array(K);
    for (let t = 0; t < T - 1; t++) {
      for (let i = 0; i < K; i++) {
        for (let j = 0; j < K; j++) {
          Anew[i][j] += (alpha[t][i] * A[i][j] * B(j, r[t + 1]) * beta[t + 1][j]) / scale[t + 1];
        }
        denom[i] += gamma[t][i];
      }
    }
    for (let i = 0; i < K; i++) {
      const di = denom[i] > 0 ? denom[i] : 1e-300;
      for (let j = 0; j < K; j++) A[i][j] = Math.max(Anew[i][j] / di, 1e-6);
      const rowSum = A[i].reduce((s, v) => s + v, 0);
      for (let j = 0; j < K; j++) A[i][j] /= rowSum;
    }
    pi = Array.from({ length: K }, (_, j) => Math.max(gamma[0][j], 1e-6));
    {
      const s = pi.reduce((a, b) => a + b, 0);
      pi = pi.map((v) => v / s);
    }
    for (let j = 0; j < K; j++) {
      let gs = 0, ms = 0;
      for (let t = 0; t < T; t++) { gs += gamma[t][j]; ms += gamma[t][j] * r[t]; }
      const m = gs > 0 ? ms / gs : mu[j];
      let vs = 0;
      for (let t = 0; t < T; t++) vs += gamma[t][j] * (r[t] - m) ** 2;
      mu[j] = m;
      va[j] = Math.max(gs > 0 ? vs / gs : va[j], 1e-10);
    }

    if (Number.isFinite(logLik) && Math.abs(ll - logLik) < 1e-7 * Math.abs(ll)) { logLik = ll; break; }
    logLik = ll;
  }

  // Sort states by mean return (ascending) and remap.
  const order = mu.map((m, j) => ({ m, j })).sort((a, b) => a.m - b.m).map((x) => x.j);
  const rank = new Array<number>(K);
  order.forEach((origJ, sortedIdx) => { rank[origJ] = sortedIdx; });
  const labels = K === 2 ? ["BEAR", "BULL"] : ["BEAR", "CHOP", "BULL"];

  const points = times.map((time, t) => {
    let best = 0;
    for (let j = 1; j < K; j++) if (gamma[t][j] > gamma[t][best]) best = j;
    return { time, state: rank[best], prob: gamma[t][best] };
  });
  return {
    points,
    stateMeans: order.map((j) => mu[j]),
    stateVols: order.map((j) => Math.sqrt(va[j])),
    labels,
    iterations: iter + 1,
    logLik,
  };
}
