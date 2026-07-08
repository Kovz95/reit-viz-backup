// Principal Component Analysis for the REIT cross-section.
//
// Zero external dependencies — a hand-rolled symmetric-Jacobi eigensolver plus a
// small linear-algebra kit (OLS via normal equations, replicated from the block
// inlined inside `adfTest` in correlationEngine.ts). This matches the codebase's
// no-math-dependency convention: an 82×82 symmetric eigendecomposition converges
// in a handful of Jacobi sweeps (<50ms), so a dependency buys nothing.
//
// Powers four page modes (see pages/PCA.tsx):
//   1. Factor decomposition of the daily-return cross-section (PC1 ≈ market).
//   2. Ticker similarity / clustering in loading space.
//   3. Risk / residual analysis (factor model → idiosyncratic residuals).
//   4. Fundamentals PCA (PCA over a snapshot of fundamental metrics).

import { getDates, getMetricSeries, getMultiMetricForAllTickers } from "./dataService";

export type PcaStandardizeMode = "correlation" | "covariance";

export interface PcaInput {
  rowLabels: string[]; // observations (dates for modes 1-3; tickers for mode 4)
  colLabels: string[]; // variables (tickers for modes 1-3; metrics for mode 4)
  matrix: number[][]; // observations × variables
}

export interface PcaResult {
  variables: string[];
  observations: string[];
  eigenvalues: number[]; // sorted descending
  varianceExplained: number[]; // eigenvalue / Σ eigenvalues
  cumulativeVariance: number[];
  loadings: number[][]; // variables × components (eigenvectors as columns)
  scores: number[][]; // observations × components (X_centered · V)
  means: number[];
  stds: number[];
  mode: PcaStandardizeMode;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Data assembly — every metric array is index-aligned to getDates(), so
//    cross-ticker alignment is a direct array-index placement (no date joins).
// ────────────────────────────────────────────────────────────────────────────

export interface PriceMatrix {
  dates: string[];
  tickers: string[];
  prices: (number | null)[][]; // dates × tickers
}

export async function buildPriceMatrix(
  tickers: string[],
  priceMetric = "close",
  onProgress?: (done: number, total: number) => void,
): Promise<PriceMatrix> {
  const dates = await getDates();
  const dateIndex = new Map<string, number>();
  for (let i = 0; i < dates.length; i++) dateIndex.set(dates[i], i);

  const prices: (number | null)[][] = Array.from({ length: dates.length }, () =>
    new Array<number | null>(tickers.length).fill(null),
  );

  let done = 0;
  // Fire concurrently; getTickerRaw's internal 6-way limiter + in-flight dedup
  // throttles the underlying network. Progress ticks as each ticker resolves.
  await Promise.all(
    tickers.map(async (t, col) => {
      try {
        const series = await getMetricSeries(t, priceMetric);
        for (const pt of series) {
          const idx = dateIndex.get(pt.time);
          if (idx !== undefined && Number.isFinite(pt.value)) prices[idx][col] = pt.value;
        }
      } catch {
        /* leave column null — dropped later by alignAndClean */
      }
      done++;
      onProgress?.(done, tickers.length);
    }),
  );

  return { dates, tickers, prices };
}

export interface CleanedMatrix {
  dates: string[];
  tickers: string[];
  prices: number[][]; // dates(window) × tickers, no nulls
  dropped: string[];
}

/**
 * Forward-fill each ticker within its own coverage (never across its listing
 * boundary), drop tickers with too little history, then trim to the common
 * [first,last] window shared by the survivors.
 */
export function alignAndClean(pm: PriceMatrix, minObs: number): CleanedMatrix {
  const { dates, tickers, prices } = pm;
  const nT = tickers.length;
  const T = dates.length;

  // Per-ticker coverage bounds + forward-filled column copies.
  const firstValid = new Array(nT).fill(-1);
  const lastValid = new Array(nT).fill(-1);
  const validCount = new Array(nT).fill(0);
  const filled: (number | null)[][] = Array.from({ length: T }, () =>
    new Array<number | null>(nT).fill(null),
  );

  for (let c = 0; c < nT; c++) {
    let last: number | null = null;
    let fv = -1;
    let lv = -1;
    let cnt = 0;
    for (let r = 0; r < T; r++) {
      const v = prices[r][c];
      if (v !== null) {
        if (fv < 0) fv = r;
        lv = r;
        cnt++;
        last = v;
      }
      // Carry last value forward only after coverage has begun.
      filled[r][c] = fv >= 0 ? last : null;
    }
    firstValid[c] = fv;
    lastValid[c] = lv;
    validCount[c] = cnt;
  }

  // Pass 1: keep tickers with enough of their own history.
  let keep = new Set<number>();
  const dropped: string[] = [];
  for (let c = 0; c < nT; c++) {
    if (validCount[c] >= minObs && firstValid[c] >= 0) keep.add(c);
    else dropped.push(tickers[c]);
  }

  // Pass 2: shrink to the common window; if it is shorter than minObs, drop the
  // ticker imposing the binding constraint and retry (capped iterations).
  let start = 0;
  let end = T - 1;
  const keptArr = () => [...keep];
  for (let iter = 0; iter < nT + 1; iter++) {
    const ks = keptArr();
    if (ks.length < 2) break;
    start = Math.max(...ks.map((c) => firstValid[c]));
    end = Math.min(...ks.map((c) => lastValid[c]));
    if (end - start + 1 >= minObs) break;
    // Drop whichever endpoint constraint is binding.
    const latestStart = ks.reduce((a, c) => (firstValid[c] > firstValid[a] ? c : a), ks[0]);
    const earliestEnd = ks.reduce((a, c) => (lastValid[c] < lastValid[a] ? c : a), ks[0]);
    // Removing the late starter usually recovers the most history.
    const victim = firstValid[latestStart] - start >= end - lastValid[earliestEnd] ? latestStart : earliestEnd;
    keep.delete(victim);
    dropped.push(tickers[victim]);
  }

  const keptCols = keptArr();
  const outTickers = keptCols.map((c) => tickers[c]);
  const outDates = dates.slice(start, end + 1);
  const out: number[][] = [];
  for (let r = start; r <= end; r++) {
    const row = new Array<number>(keptCols.length);
    for (let k = 0; k < keptCols.length; k++) {
      const v = filled[r][keptCols[k]];
      row[k] = v === null ? 0 : v; // window ⊆ coverage, so nulls shouldn't occur
    }
    out.push(row);
  }

  return { dates: outDates, tickers: outTickers, prices: out, dropped };
}

/** Row-differenced natural-log returns: (T-1) × N. */
export function toLogReturns(prices: number[][]): number[][] {
  const out: number[][] = [];
  for (let r = 1; r < prices.length; r++) {
    const prev = prices[r - 1];
    const cur = prices[r];
    const row = new Array<number>(cur.length);
    for (let c = 0; c < cur.length; c++) {
      row[c] = prev[c] > 0 && cur[c] > 0 ? Math.log(cur[c] / prev[c]) : 0;
    }
    out.push(row);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Core PCA
// ────────────────────────────────────────────────────────────────────────────

export function standardize(
  matrix: number[][],
  mode: PcaStandardizeMode,
): { X: number[][]; means: number[]; stds: number[] } {
  const n = matrix.length;
  const p = n > 0 ? matrix[0].length : 0;
  const means = new Array(p).fill(0);
  const stds = new Array(p).fill(1);
  if (n === 0) return { X: [], means, stds };

  for (let j = 0; j < p; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += matrix[i][j];
    means[j] = sum / n;
  }
  if (mode === "correlation") {
    for (let j = 0; j < p; j++) {
      let ss = 0;
      for (let i = 0; i < n; i++) {
        const d = matrix[i][j] - means[j];
        ss += d * d;
      }
      const sd = Math.sqrt(ss / Math.max(1, n - 1));
      stds[j] = sd > 1e-12 ? sd : 1;
    }
  }
  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(p);
    for (let j = 0; j < p; j++) row[j] = (matrix[i][j] - means[j]) / stds[j];
    X.push(row);
  }
  return { X, means, stds };
}

/** Gram (variable×variable) matrix XᵀX/(n-1). Covariance if X is demeaned only,
 *  correlation if X is z-scored. */
export function gramMatrix(X: number[][]): number[][] {
  const n = X.length;
  const p = n > 0 ? X[0].length : 0;
  const C: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const row = X[i];
    for (let a = 0; a < p; a++) {
      const xa = row[a];
      if (xa === 0) continue;
      for (let b = a; b < p; b++) C[a][b] += xa * row[b];
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = a; b < p; b++) {
      const v = C[a][b] / denom;
      C[a][b] = v;
      C[b][a] = v;
    }
  }
  return C;
}

/** Symmetric-Jacobi eigendecomposition. Returns eigenvalues (unordered) and V
 *  such that A = V·diag(values)·Vᵀ (columns of V are eigenvectors). */
export function jacobiEigen(
  Ain: number[][],
  maxSweeps = 100,
  tol = 1e-10,
): { values: number[]; vectors: number[][] } {
  const n = Ain.length;
  const A = Ain.map((r) => r.slice());
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < tol) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = A[p][p];
        const aqq = A[q][q];
        // Givens rotation RᵀAR zeros the (p,q) entry when tan(2θ) = 2·a_pq/(a_qq − a_pp).
        const theta = 0.5 * Math.atan2(2 * apq, aqq - app);
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        // A := Rᵀ A R  (R rotates the (p,q) plane). Columns first, then rows.
        for (let i = 0; i < n; i++) {
          const aip = A[i][p];
          const aiq = A[i][q];
          A[i][p] = c * aip - s * aiq;
          A[i][q] = s * aip + c * aiq;
        }
        for (let i = 0; i < n; i++) {
          const api = A[p][i];
          const aqi = A[q][i];
          A[p][i] = c * api - s * aqi;
          A[q][i] = s * api + c * aqi;
        }
        for (let i = 0; i < n; i++) {
          const vip = V[i][p];
          const viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
  }

  const values = A.map((row, i) => row[i]);
  return { values, vectors: V };
}

/** Sort eigenpairs descending and apply a deterministic sign convention (each
 *  eigenvector's largest-magnitude entry is made positive) for reproducibility. */
export function sortAndSignFix(eig: { values: number[]; vectors: number[][] }): {
  eigenvalues: number[];
  loadings: number[][];
} {
  const p = eig.values.length;
  const order = Array.from({ length: p }, (_, i) => i).sort((a, b) => eig.values[b] - eig.values[a]);
  const eigenvalues = order.map((idx) => eig.values[idx]);
  const loadings: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let comp = 0; comp < p; comp++) {
    const src = order[comp];
    // Determine sign from the dominant entry.
    let maxAbs = 0;
    let sign = 1;
    for (let v = 0; v < p; v++) {
      const val = eig.vectors[v][src];
      if (Math.abs(val) > maxAbs) {
        maxAbs = Math.abs(val);
        sign = val < 0 ? -1 : 1;
      }
    }
    for (let v = 0; v < p; v++) loadings[v][comp] = eig.vectors[v][src] * sign;
  }
  return { eigenvalues, loadings };
}

/** Project observations onto components: scores[i][c] = Σ_v X[i][v]·loadings[v][c]. */
export function projectScores(X: number[][], loadings: number[][]): number[][] {
  const n = X.length;
  const p = loadings.length;
  const k = p > 0 ? loadings[0].length : 0;
  const scores: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(k).fill(0);
    for (let v = 0; v < p; v++) {
      const xv = X[i][v];
      if (xv === 0) continue;
      const lv = loadings[v];
      for (let c = 0; c < k; c++) row[c] += xv * lv[c];
    }
    scores.push(row);
  }
  return scores;
}

/** Single entry point used by all four page modes. */
export function computePCA(
  input: PcaInput,
  opts: { mode: PcaStandardizeMode; maxComponents?: number },
): PcaResult {
  const { X, means, stds } = standardize(input.matrix, opts.mode);
  const C = gramMatrix(X);
  const { eigenvalues, loadings } = sortAndSignFix(jacobiEigen(C));
  const scores = projectScores(X, loadings);

  const total = eigenvalues.reduce((a, v) => a + Math.max(0, v), 0) || 1;
  const varianceExplained = eigenvalues.map((v) => Math.max(0, v) / total);
  const cumulativeVariance: number[] = [];
  let run = 0;
  for (const ve of varianceExplained) {
    run += ve;
    cumulativeVariance.push(run);
  }

  const k = opts.maxComponents ? Math.min(opts.maxComponents, eigenvalues.length) : eigenvalues.length;
  return {
    variables: input.colLabels,
    observations: input.rowLabels,
    eigenvalues: eigenvalues.slice(0, k),
    varianceExplained: varianceExplained.slice(0, k),
    cumulativeVariance: cumulativeVariance.slice(0, k),
    loadings: loadings.map((row) => row.slice(0, k)),
    scores: scores.map((row) => row.slice(0, k)),
    means,
    stds,
    mode: opts.mode,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Small linear-algebra kit (replicated from correlationEngine.ts adfTest) —
//    used by the mode-3 factor-model regression.
// ────────────────────────────────────────────────────────────────────────────

/** OLS β for X·β ≈ y via normal equations XᵀX β = Xᵀy (Gaussian elimination
 *  with partial pivoting). X is rows×k (include an intercept column if wanted). */
export function solveOLS(X: number[][], y: number[]): number[] {
  const rows = X.length;
  const k = rows > 0 ? X[0].length : 0;
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const XtY: number[] = new Array(k).fill(0);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < k; j++) {
      XtY[j] += X[i][j] * y[i];
      for (let m = 0; m < k; m++) XtX[j][m] += X[i][j] * X[i][m];
    }
  }
  const aug: number[][] = XtX.map((row, i) => [...row, XtY[i]]);
  for (let col = 0; col < k; col++) {
    let maxRow = col;
    for (let row = col + 1; row < k; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (Math.abs(aug[col][col]) < 1e-12) return new Array(k).fill(0);
    for (let row = col + 1; row < k; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= k; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  const beta = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    beta[i] = aug[i][k];
    for (let j = i + 1; j < k; j++) beta[i] -= aug[i][j] * beta[j];
    beta[i] /= aug[i][i];
  }
  return beta;
}

export interface ResidualRow {
  ticker: string;
  betas: number[]; // factor loadings (excludes intercept)
  residualZ: number; // current residual, standardized by residual std
  halfLife: number; // AR(1) mean-reversion half-life (trading days); Infinity if non-reverting
  residualCum: number[]; // cumulative residual series (for plotting)
}

/**
 * Factor model for mode 3: OLS-regress each ticker's return series on the first
 * `k` principal-component score columns (the factors). Residual = actual − fitted;
 * we surface the current residual z-score and an AR(1) half-life to rank
 * mean-reversion candidates.
 */
export function factorModelResiduals(
  returns: number[][], // obs × N
  scores: number[][], // obs × comps (obs aligned with returns rows)
  k: number,
  tickers: string[],
): ResidualRow[] {
  const obs = returns.length;
  const nT = tickers.length;
  const kf = Math.min(k, scores.length > 0 ? scores[0].length : 0);

  // Design matrix: [1, factor_1..factor_kf].
  const design: number[][] = [];
  for (let i = 0; i < obs; i++) {
    const row = new Array<number>(kf + 1);
    row[0] = 1;
    for (let c = 0; c < kf; c++) row[c + 1] = scores[i][c];
    design.push(row);
  }

  const out: ResidualRow[] = [];
  for (let j = 0; j < nT; j++) {
    const y = new Array<number>(obs);
    for (let i = 0; i < obs; i++) y[i] = returns[i][j];
    const beta = solveOLS(design, y);

    const resid = new Array<number>(obs);
    for (let i = 0; i < obs; i++) {
      let fit = beta[0];
      for (let c = 0; c < kf; c++) fit += beta[c + 1] * scores[i][c];
      resid[i] = y[i] - fit;
    }

    // Residual std for z-scoring the latest observation.
    let mean = 0;
    for (const r of resid) mean += r;
    mean /= obs || 1;
    let ss = 0;
    for (const r of resid) ss += (r - mean) * (r - mean);
    const sd = Math.sqrt(ss / Math.max(1, obs - 1)) || 1;

    // AR(1) half-life on the residual: r_t = a + φ·r_{t-1}.
    let sxx = 0;
    let sxy = 0;
    let sx = 0;
    let sy = 0;
    const m = obs - 1;
    for (let i = 1; i < obs; i++) {
      const x = resid[i - 1];
      const yy = resid[i];
      sx += x;
      sy += yy;
      sxx += x * x;
      sxy += x * yy;
    }
    const denom = m * sxx - sx * sx;
    const phi = denom !== 0 ? (m * sxy - sx * sy) / denom : 0;
    const halfLife = phi > 0 && phi < 1 ? -Math.log(2) / Math.log(phi) : Infinity;

    // Cumulative residual (mean-reversion level indicator).
    const residualCum = new Array<number>(obs);
    let acc = 0;
    for (let i = 0; i < obs; i++) {
      acc += resid[i];
      residualCum[i] = acc;
    }

    out.push({
      ticker: tickers[j],
      betas: beta.slice(1),
      residualZ: (resid[obs - 1] - mean) / sd,
      halfLife,
      residualCum,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Clustering in loading space (mode 2) — k-means++ (replicated; the version
//    in similarSetupsAlgorithms.ts is module-private).
// ────────────────────────────────────────────────────────────────────────────

function dist2(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

/**
 * Cluster tickers by their rows in loading space (first `dims` components).
 * Deterministic init (no Math.random — unavailable in this environment and
 * undesirable for reproducibility): seed farthest-point / k-means++ style using
 * a fixed starting index.
 */
export function clusterLoadings(loadings: number[][], dims: number, k: number, iters = 50): number[] {
  const n = loadings.length;
  const d = Math.min(dims, n > 0 ? loadings[0].length : 0);
  const pts = loadings.map((row) => row.slice(0, d));
  if (n === 0 || k <= 1) return new Array(n).fill(0);
  const kk = Math.min(k, n);

  // Deterministic k-means++ seeding: first centroid = point 0, each subsequent
  // = the point with max distance to the nearest chosen centroid.
  const centroids: number[][] = [pts[0].slice()];
  while (centroids.length < kk) {
    let bestIdx = 0;
    let bestD = -1;
    for (let i = 0; i < n; i++) {
      let nearest = Infinity;
      for (const c of centroids) nearest = Math.min(nearest, dist2(pts[i], c));
      if (nearest > bestD) {
        bestD = nearest;
        bestIdx = i;
      }
    }
    centroids.push(pts[bestIdx].slice());
  }

  const assign = new Array(n).fill(0);
  for (let it = 0; it < iters; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < kk; c++) {
        const dd = dist2(pts[i], centroids[c]);
        if (dd < bestD) {
          bestD = dd;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    // Recompute centroids.
    const sums = Array.from({ length: kk }, () => new Array(d).fill(0));
    const counts = new Array(kk).fill(0);
    for (let i = 0; i < n; i++) {
      counts[assign[i]]++;
      for (let j = 0; j < d; j++) sums[assign[i]][j] += pts[i][j];
    }
    for (let c = 0; c < kk; c++) {
      if (counts[c] > 0) for (let j = 0; j < d; j++) centroids[c][j] = sums[c][j] / counts[c];
    }
    if (!changed && it > 0) break;
  }
  return assign;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Fundamentals snapshot matrix (mode 4)
// ────────────────────────────────────────────────────────────────────────────

export interface FundamentalsMatrix {
  rowLabels: string[]; // tickers
  colLabels: string[]; // metrics
  matrix: number[][]; // tickers × metrics (mean-imputed)
  dropped: string[];
  sectorByTicker: Record<string, string>;
}

/**
 * Build a ticker × metric matrix from a single cross-sectional snapshot. Tickers
 * missing more than half their metrics are dropped; remaining nulls are
 * column-mean imputed. Always paired with correlation standardization (mixed
 * units).
 */
export async function buildFundamentalsMatrix(
  tickers: string[],
  metrics: string[],
  dateParam?: string,
): Promise<FundamentalsMatrix> {
  const rows = await getMultiMetricForAllTickers(metrics, dateParam);
  const wanted = new Set(tickers.map((t) => t.toUpperCase()));
  const picked = rows.filter((r) => wanted.has(r.ticker.toUpperCase()));

  const rowLabels: string[] = [];
  const raw: (number | null)[][] = [];
  const dropped: string[] = [];
  const sectorByTicker: Record<string, string> = {};

  for (const r of picked) {
    const vals = metrics.map((m) => {
      const v = r.values[m];
      return v !== null && v !== undefined && Number.isFinite(v) ? v : null;
    });
    const nullCount = vals.filter((v) => v === null).length;
    if (nullCount > metrics.length / 2) {
      dropped.push(r.ticker);
      continue;
    }
    rowLabels.push(r.ticker);
    raw.push(vals);
    sectorByTicker[r.ticker] = r.sector || "";
  }

  // Column-mean imputation.
  const p = metrics.length;
  const colMean = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let sum = 0;
    let cnt = 0;
    for (const row of raw) {
      if (row[j] !== null) {
        sum += row[j] as number;
        cnt++;
      }
    }
    colMean[j] = cnt > 0 ? sum / cnt : 0;
  }
  const matrix = raw.map((row) => row.map((v, j) => (v === null ? colMean[j] : v)));

  return { rowLabels, colLabels: metrics, matrix, dropped, sectorByTicker };
}
