// Cross-sectional ridge ranker with walk-forward information coefficients.
//
// Monthly panel: for each ticker at each month-end, features (momentum, vol,
// valuation richness, short-interest change) and the NEXT month's
// cross-sectionally demeaned return (the target). Each month t we fit ridge
// regression on the trailing `trainMonths` of pooled (features → forward
// demeaned return), predict the cross-section at t, and record the Spearman
// rank IC against the realized t+1 returns. Honest by construction: every IC
// is out-of-sample; if the mean IC isn't significant the page says so.

export interface RankerFeatureRow {
  ticker: string;
  ym: string;              // month key YYYY-MM (as-of month end)
  features: number[];      // raw feature values (NaN allowed → row dropped)
  fwdRet: number | null;   // next-month return, cross-sectionally demeaned later
}

export const RANKER_FEATURES = ["mom12_1", "mom3", "vol63", "valRich", "siChg3m"] as const;

export interface RankerMonthResult {
  ym: string;
  ic: number;              // Spearman IC of prediction vs realized fwd ret
  n: number;
  weights: number[];       // fitted ridge weights (standardized features)
}

export interface RankerResult {
  months: RankerMonthResult[];
  meanIC: number;
  icTStat: number;
  hitRate: number;         // % months IC > 0
  /** Latest-month cross-section: predictions for TODAY's deciles. */
  latest: { ticker: string; score: number }[];
  featureNames: string[];
}

function rank(values: number[]): number[] {
  const idx = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length).fill(0);
  idx.forEach(([, i], r) => { out[i] = r; });
  return out;
}

export function spearman(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 3) return NaN;
  const ra = rank(a);
  const rb = rank(b);
  const ma = ra.reduce((s, v) => s + v, 0) / n;
  const mb = rb.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : NaN;
}

/** Closed-form ridge: w = (XᵀX + λI)⁻¹ Xᵀy, small dims via Gaussian elimination. */
function ridgeFit(X: number[][], y: number[], lambda: number): number[] {
  const p = X[0].length;
  const A: number[][] = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => {
      let s = 0;
      for (let r = 0; r < X.length; r++) s += X[r][i] * X[r][j];
      return s + (i === j ? lambda * X.length : 0);
    }),
  );
  const b: number[] = Array.from({ length: p }, (_, i) => {
    let s = 0;
    for (let r = 0; r < X.length; r++) s += X[r][i] * y[r];
    return s;
  });
  // Solve A w = b
  for (let col = 0; col < p; col++) {
    let piv = col;
    for (let r = col + 1; r < p; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const d = A[col][col];
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      for (let c = col; c < p; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  return b.map((v, i) => (Math.abs(A[i][i]) > 1e-12 ? v / A[i][i] : 0));
}

/** Z-score each feature column within a month's cross-section (NaN-safe). */
function standardizeMonth(rows: RankerFeatureRow[]): { X: number[][]; keep: number[] } {
  const p = rows[0]?.features.length ?? 0;
  const keep: number[] = [];
  for (let i = 0; i < rows.length; i++) if (rows[i].features.every((f) => Number.isFinite(f))) keep.push(i);
  const X = keep.map((i) => [...rows[i].features]);
  for (let j = 0; j < p; j++) {
    const col = X.map((r) => r[j]);
    const m = col.reduce((s, v) => s + v, 0) / col.length;
    const sd = Math.sqrt(col.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, col.length - 1)) || 1;
    for (const r of X) r[j] = (r[j] - m) / sd;
  }
  return { X, keep };
}

export function runWalkForward(
  panel: Map<string, RankerFeatureRow[]>, // ym → rows
  trainMonths: number,
  lambda: number,
): RankerResult | null {
  const yms = [...panel.keys()].sort();
  if (yms.length < trainMonths + 3) return null;
  const months: RankerMonthResult[] = [];
  let latest: { ticker: string; score: number }[] = [];

  for (let t = trainMonths; t < yms.length; t++) {
    // Train pool: months [t-trainMonths, t) with realized fwd returns.
    const Xp: number[][] = [];
    const yp: number[] = [];
    for (let k = t - trainMonths; k < t; k++) {
      const rows = panel.get(yms[k])!;
      const withRet = rows.filter((r) => r.fwdRet !== null);
      if (withRet.length < 10) continue;
      const mean = withRet.reduce((s, r) => s + (r.fwdRet as number), 0) / withRet.length;
      const { X, keep } = standardizeMonth(withRet);
      keep.forEach((idx, i) => {
        Xp.push(X[i]);
        yp.push((withRet[idx].fwdRet as number) - mean);
      });
    }
    if (Xp.length < 50) continue;
    const w = ridgeFit(Xp, yp, lambda);

    // Predict month t; score IC if t has realized returns (it won't for the last month).
    const rowsT = panel.get(yms[t])!;
    const { X: Xt, keep: keepT } = standardizeMonth(rowsT);
    const preds = Xt.map((x) => x.reduce((s, v, j) => s + v * w[j], 0));
    const scored = keepT.map((idx, i) => ({ ticker: rowsT[idx].ticker, score: preds[i], fwd: rowsT[idx].fwdRet }));
    // Keep the most recent month with a scoreable cross-section (the newest
    // month can have all-NaN features when a monthly input like short
    // interest lags the price data).
    if (scored.length >= 10) {
      latest = scored.map(({ ticker, score }) => ({ ticker, score })).sort((a, b) => b.score - a.score);
    }
    const withRet = scored.filter((s) => s.fwd !== null);
    if (withRet.length >= 10) {
      const ic = spearman(withRet.map((s) => s.score), withRet.map((s) => s.fwd as number));
      if (Number.isFinite(ic)) months.push({ ym: yms[t], ic, n: withRet.length, weights: w });
    }
  }
  if (months.length < 6) return null;
  const ics = months.map((m) => m.ic);
  const mean = ics.reduce((s, v) => s + v, 0) / ics.length;
  const sd = Math.sqrt(ics.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, ics.length - 1));
  return {
    months,
    meanIC: mean,
    icTStat: sd > 0 ? (mean / (sd / Math.sqrt(ics.length))) : 0,
    hitRate: (ics.filter((v) => v > 0).length / ics.length) * 100,
    latest,
    featureNames: [...RANKER_FEATURES],
  };
}
