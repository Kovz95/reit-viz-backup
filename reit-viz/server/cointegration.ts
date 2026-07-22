// Engle-Granger two-step cointegration test on a pair of log-price series.
//
// Step 1: OLS cointegrating regression  logA = α + β·logB  → residuals e_t.
// Step 2: ADF test on the residuals (no constant — they are OLS residuals and
// mean-zero by construction) with augmentation lags; the t-statistic on the
// level term is compared against MacKinnon-style critical values for the
// 2-variable, constant-in-first-stage case. p-values are piecewise-linear
// interpolations over standard anchor points — approximate, but monotone in
// the t-stat, which is what ranking and the p<0.05 gate need.
//
// Also reports the OU half-life of the residual (days, from Δe = λ·e_{t-1})
// and a Hurst exponent from the aggregated-variance method (<0.5 = mean
// reverting).

export interface EngleGrangerResult {
  adfPValue: number;
  ouHalfLife: number;
  hurstH: number;
  isCointegrated: boolean;
  /** ADF t-statistic on the residual level term (more negative = stronger). */
  adfTStat?: number;
  [key: string]: any;
}

const NOT_COINTEGRATED: EngleGrangerResult = {
  adfPValue: 1,
  ouHalfLife: NaN,
  hurstH: 0.5,
  isCointegrated: false,
};

/** Solve the normal equations X'X b = X'y via Gaussian elimination. */
function olsSolve(X: number[][], y: number[]): number[] | null {
  const n = X.length;
  if (n === 0) return null;
  const k = X[0].length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let s = 0;
      for (let r = 0; r < n; r++) s += X[r][i] * X[r][j];
      xtx[i][j] = s;
      if (j !== i) xtx[j][i] = s;
    }
    let sy = 0;
    for (let r = 0; r < n; r++) sy += X[r][i] * y[r];
    xtx[i][k] = sy;
  }
  // Gaussian elimination with partial pivoting on the augmented matrix.
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(xtx[r][col]) > Math.abs(xtx[pivot][col])) pivot = r;
    }
    if (Math.abs(xtx[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [xtx[col], xtx[pivot]] = [xtx[pivot], xtx[col]];
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = xtx[r][col] / xtx[col][col];
      for (let c = col; c <= k; c++) xtx[r][c] -= f * xtx[col][c];
    }
  }
  const b = new Array(k);
  for (let i = 0; i < k; i++) b[i] = xtx[i][k] / xtx[i][i];
  return b;
}

/**
 * MacKinnon-style approximate p-value for the Engle-Granger residual ADF
 * t-stat (2 variables, constant in the cointegrating regression). Anchors:
 * 1% ≈ −3.90, 5% ≈ −3.34, 10% ≈ −3.05 (asymptotic), extended on both tails.
 */
function egPValue(t: number): number {
  const anchors: [number, number][] = [
    [-6.0, 0.0001],
    [-4.6, 0.001],
    [-3.9, 0.01],
    [-3.59, 0.025],
    [-3.34, 0.05],
    [-3.05, 0.1],
    [-2.57, 0.25],
    [-2.02, 0.5],
    [-1.2, 0.85],
    [-0.3, 0.97],
    [0.5, 0.995],
  ];
  if (t <= anchors[0][0]) return anchors[0][1];
  if (t >= anchors[anchors.length - 1][0]) return 1;
  for (let i = 1; i < anchors.length; i++) {
    if (t <= anchors[i][0]) {
      const [t0, p0] = anchors[i - 1];
      const [t1, p1] = anchors[i];
      // Interpolate in log-p space so the tail stays sane.
      const w = (t - t0) / (t1 - t0);
      return Math.exp(Math.log(p0) + w * (Math.log(p1) - Math.log(p0)));
    }
  }
  return 1;
}

export function engleGranger(logA: number[], logB: number[]): EngleGrangerResult {
  const n = Math.min(logA.length, logB.length);
  if (n < 60) return { ...NOT_COINTEGRATED };

  // ── Step 1: cointegrating regression logA = α + β·logB ──
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += logB[i];
    sy += logA[i];
    sxy += logB[i] * logA[i];
    sxx += logB[i] * logB[i];
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return { ...NOT_COINTEGRATED };
  const beta = (n * sxy - sx * sy) / denom;
  const alpha = (sy - beta * sx) / n;
  const e: number[] = new Array(n);
  for (let i = 0; i < n; i++) e[i] = logA[i] - alpha - beta * logB[i];

  // ── Step 2: ADF on residuals — Δe_t = φ·e_{t−1} + Σ ψ_i·Δe_{t−i} ──
  const de: number[] = new Array(n - 1);
  for (let i = 1; i < n; i++) de[i - 1] = e[i] - e[i - 1];
  const lags = Math.min(Math.max(1, Math.floor(Math.cbrt(n))), 12);
  const rows = n - 1 - lags;
  if (rows < 30) return { ...NOT_COINTEGRATED };
  const X: number[][] = new Array(rows);
  const y: number[] = new Array(rows);
  for (let r = 0; r < rows; r++) {
    const t = r + lags; // index into de; level term is e[t]
    const row = new Array(1 + lags);
    row[0] = e[t];
    for (let l = 1; l <= lags; l++) row[l] = de[t - l];
    X[r] = row;
    y[r] = de[t];
  }
  const coef = olsSolve(X, y);
  if (!coef) return { ...NOT_COINTEGRATED };

  // Residual variance + se(φ) from (X'X)⁻¹₀₀ — recompute via projection.
  let sse = 0;
  for (let r = 0; r < rows; r++) {
    let fit = 0;
    for (let c = 0; c < coef.length; c++) fit += X[r][c] * coef[c];
    const resid = y[r] - fit;
    sse += resid * resid;
  }
  const sigma2 = sse / (rows - coef.length);
  // se(φ): φ is coefficient 0 — need [ (X'X)^-1 ]_00. Solve X'X v = unit0.
  const unit: number[] = new Array(coef.length).fill(0);
  unit[0] = 1;
  // Reuse olsSolve on the system X'X v = e0 by passing an identity-style
  // trick: build pseudo-X = chol? Simpler: solve normal equations directly.
  const k = coef.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let s = 0;
      for (let r = 0; r < rows; r++) s += X[r][i] * X[r][j];
      xtx[i][j] = s;
      xtx[j][i] = s;
    }
  }
  // Gaussian elimination to solve xtx · v = unit.
  const aug: number[][] = xtx.map((row, i) => [...row, unit[i]]);
  let ok = true;
  for (let col = 0; col < k && ok; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
    }
    if (Math.abs(aug[pivot][col]) < 1e-12) { ok = false; break; }
    if (pivot !== col) [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = aug[r][col] / aug[col][col];
      for (let c = col; c <= k; c++) aug[r][c] -= f * aug[col][c];
    }
  }
  if (!ok) return { ...NOT_COINTEGRATED };
  const invDiag0 = aug[0][k] / aug[0][0];
  const sePhi = Math.sqrt(Math.max(sigma2 * invDiag0, 1e-18));
  const tStat = coef[0] / sePhi;

  const adfPValue = egPValue(tStat);
  const isCointegrated = adfPValue < 0.05;

  // ── OU half-life from Δe_t = λ·e_{t−1} (simple regression, no lags) ──
  let ouHalfLife = NaN;
  {
    let sxx2 = 0, sxy2 = 0;
    for (let i = 1; i < n; i++) {
      sxx2 += e[i - 1] * e[i - 1];
      sxy2 += e[i - 1] * (e[i] - e[i - 1]);
    }
    if (sxx2 > 0) {
      const lambda = sxy2 / sxx2;
      if (lambda < 0) ouHalfLife = -Math.log(2) / lambda;
    }
  }

  // ── Hurst exponent (aggregated variance of residual increments) ──
  let hurstH = 0.5;
  {
    const taus = [1, 2, 4, 8, 16, 32].filter((t) => t * 4 < n);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const tau of taus) {
      let s = 0, s2 = 0, m = 0;
      for (let i = tau; i < n; i++) {
        const d = e[i] - e[i - tau];
        s += d;
        s2 += d * d;
        m++;
      }
      const mean = s / m;
      const variance = Math.max(s2 / m - mean * mean, 1e-18);
      xs.push(Math.log(tau));
      ys.push(Math.log(variance));
    }
    if (xs.length >= 3) {
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let num = 0, den = 0;
      for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - mx) * (ys[i] - my);
        den += (xs[i] - mx) * (xs[i] - mx);
      }
      if (den > 0) hurstH = Math.min(Math.max(num / den / 2, 0), 1);
    }
  }

  return { adfPValue, ouHalfLife, hurstH, isCointegrated, adfTStat: tStat };
}
