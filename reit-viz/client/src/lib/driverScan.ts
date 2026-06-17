// Driver / factor scan engine.
//
// Faithful reconstruction of the production chunk driverScan-BlD7pNfH.js.
// De-minified back into TypeScript. The engine:
//   - Builds a factor catalog from the macro catalog (cached series only) plus
//     the ticker's uploaded fundamental ("Fund: …") metrics.
//   - Loads each factor's time series (macro JSON or per-ticker metric series).
//   - For each factor, scans every SCAN_WINDOWS lookback × SCAN_LAGS lead/lag,
//     finds the window/lag that maximizes |Pearson r| against the target series,
//     and reports Spearman, a cross-window stability score, and a two-sided
//     t-test p-value at the best window/lag.
//   - Ranks factors by best absolute correlation.
//
// Data is fetched through the same lib functions the bundle imported from the
// shared chunk (see mapping in the comments next to each import).

import { getMetricSeries, getTickersCacheSync, getTickers } from "./dataService";
import { fetchMacroCatalog, fetchStaticSeries } from "./macroStatic";

// ── Shared point type used throughout the scan ──
interface Point {
  time: string;
  value: number;
}

// ════════════════════════════════════════════════════════════════════════
// Statistics helpers (bundle: $, B, x, P, R)
// ════════════════════════════════════════════════════════════════════════

/** Pearson correlation over aligned numeric arrays (skips non-finite pairs). (bundle: $) */
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let count = 0,
    sumA = 0,
    sumB = 0,
    sumAB = 0,
    sumA2 = 0,
    sumB2 = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sumA += x;
    sumB += y;
    sumAB += x * y;
    sumA2 += x * x;
    sumB2 += y * y;
    count++;
  }
  if (count < 3) return 0;
  const meanA = sumA / count;
  const meanB = sumB / count;
  const varA = sumA2 - count * meanA * meanA;
  const varB = sumB2 - count * meanB * meanB;
  const cov = sumAB - count * meanA * meanB;
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

/** Fractional (average-tie) ranks of an array. (bundle: B) */
function ranks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((p, q) => p.v - q.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) out[indexed[k].i] = avgRank;
    i = j;
  }
  return out;
}

/** Spearman correlation = Pearson on the rank-transformed series. (bundle: x) */
export function spearman(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const cleanA: number[] = [];
  const cleanB: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      cleanA.push(a[i]);
      cleanB.push(b[i]);
    }
  }
  if (cleanA.length < 3) return 0;
  return pearson(ranks(cleanA), ranks(cleanB));
}

/** Standard normal CDF via Abramowitz & Stegun 7.1.26. (bundle: P) */
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * z);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

/** Two-sided p-value for a correlation r over n observations (t-test). (bundle: R) */
function corrPValue(r: number, n: number): number {
  if (n < 3) return 1;
  const r2 = r * r;
  if (r2 >= 1) return 0;
  const t = r * Math.sqrt((n - 2) / (1 - r2));
  return 2 * (1 - normalCdf(Math.abs(t)));
}

// ════════════════════════════════════════════════════════════════════════
// Constants (bundle: y = SCAN_WINDOWS, U = SCAN_LAGS)
// ════════════════════════════════════════════════════════════════════════

/** Rolling-window sizes (trading days) the scan correlates each factor over. */
export const SCAN_WINDOWS = [30, 60, 120, 252, 504, 756];

/**
 * Lead/lag offsets (trading days) tested for each factor. Positive lag = the
 * factor leads the stock; negative lag = the stock leads the factor.
 */
export const SCAN_LAGS = [-60, -30, -10, -5, -1, 0, 1, 5, 10, 30, 60];

// ════════════════════════════════════════════════════════════════════════
// Target transform (bundle: j)
// ════════════════════════════════════════════════════════════════════════

/**
 * Transform a price series into the scan target.
 *   "price" → raw level series.
 *   "1d" | "5d" | "21d" | "63d" → forward-aligned N-day simple returns.
 */
function buildTarget(series: Point[], mode: string): Point[] {
  if (mode === "price") return series;
  const horizon =
    mode === "1d" ? 1 : mode === "5d" ? 5 : mode === "21d" ? 21 : 63;
  const out: Point[] = [];
  for (let i = horizon; i < series.length; i++) {
    const prev = series[i - horizon].value;
    const cur = series[i].value;
    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(cur)) {
      out.push({ time: series[i].time, value: (cur - prev) / prev });
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════
// Alignment & lag shifting (bundle: q, D)
// ════════════════════════════════════════════════════════════════════════

/** Inner-join two series on `time`, returning aligned value arrays. (bundle: q) */
function alignSeries(
  a: Point[],
  b: Point[]
): { datesA: string[]; valuesA: number[]; valuesB: number[] } {
  const mapB = new Map(b.map((p) => [p.time, p.value]));
  const datesA: string[] = [];
  const valuesA: number[] = [];
  const valuesB: number[] = [];
  for (const p of a) {
    const vb = mapB.get(p.time);
    if (vb !== undefined && Number.isFinite(p.value) && Number.isFinite(vb)) {
      datesA.push(p.time);
      valuesA.push(p.value);
      valuesB.push(vb);
    }
  }
  return { datesA, valuesA, valuesB };
}

/**
 * Apply a lag shift to aligned arrays. (bundle: D)
 *   lag === 0 → unchanged.
 *   lag  >  0 → drop last `lag` of A, drop first `lag` of B (factor leads stock).
 *   lag  <  0 → drop first `|lag|` of A, drop last `|lag|` of B (stock leads factor).
 */
function applyLag(
  a: number[],
  b: number[],
  lag: number
): { f: number[]; t: number[] } {
  const n = a.length;
  if (lag === 0) return { f: a, t: b };
  if (lag > 0) {
    if (lag >= n) return { f: [], t: [] };
    return { f: a.slice(0, n - lag), t: b.slice(lag) };
  }
  const k = -lag;
  if (k >= n) return { f: [], t: [] };
  return { f: a.slice(k), t: b.slice(0, n - k) };
}

// ════════════════════════════════════════════════════════════════════════
// Factor types
// ════════════════════════════════════════════════════════════════════════

interface Factor {
  spec: string;
  label: string;
  category: string;
  data: Point[];
}

export interface DriverScanRow {
  rank: number;
  label: string;
  spec: string;
  category: string;
  bestAbsCorr: number;
  bestCorr: number;
  spearman: number;
  bestWindow: number;
  bestLag: number;
  stability: number;
  nObs: number;
  pVal: number;
  windowCorrs: number[];
}

export interface DriverScanRunResult {
  ticker: string;
  targetMode: string;
  rows: DriverScanRow[];
  totalFactors: number;
  durationMs: number;
}

export interface RunDriverScanOptions {
  ticker: string;
  targetMode: string;
  includeMacro?: boolean;
  includeFund?: boolean;
  minObs?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, phase: string) => void;
}

// ════════════════════════════════════════════════════════════════════════
// Per-factor scan (bundle: G)
// ════════════════════════════════════════════════════════════════════════

/**
 * Scan one factor against the (already-transformed) target series across all
 * windows and lags. Returns the best row, or null if there is insufficient
 * overlapping data. The factor is series B; the target is series A.
 */
function scanFactor(
  factor: Factor,
  target: Point[],
  minObs: number
): DriverScanRow | null {
  const { valuesA, valuesB } = alignSeries(target, factor.data);
  if (valuesA.length < minObs) return null;

  let bestAbs = -1;
  let bestCorr = 0;
  let bestWindow = SCAN_WINDOWS[0];
  let bestLag = 0;
  let bestNObs = 0;
  // Per-window best |corr| across all lags → drives stability + sparkline.
  const windowCorrs = new Array<number>(SCAN_WINDOWS.length).fill(0);

  for (const lag of SCAN_LAGS) {
    const { f, t } = applyLag(valuesA, valuesB, lag);
    if (f.length < minObs) continue;
    for (let w = 0; w < SCAN_WINDOWS.length; w++) {
      const win = SCAN_WINDOWS[w];
      const start = Math.max(0, f.length - win);
      const fSlice = f.slice(start);
      const tSlice = t.slice(start);
      if (fSlice.length < minObs) continue;
      const corr = pearson(fSlice, tSlice);
      const absCorr = Math.abs(corr);
      if (absCorr > windowCorrs[w]) windowCorrs[w] = absCorr;
      if (absCorr > bestAbs) {
        bestAbs = absCorr;
        bestCorr = corr;
        bestWindow = win;
        bestLag = lag;
        bestNObs = fSlice.length;
      }
    }
  }

  if (bestAbs < 0) return null;

  // Spearman at the best lag / best window.
  const { f: lagF, t: lagT } = applyLag(valuesA, valuesB, bestLag);
  const bStart = Math.max(0, lagF.length - bestWindow);
  const spear = spearman(lagF.slice(bStart), lagT.slice(bStart));

  // Stability = mean of the positive per-window best correlations.
  const nonZero = windowCorrs.filter((v) => v > 0);
  const stability =
    nonZero.length > 0
      ? nonZero.reduce((acc, v) => acc + v, 0) / nonZero.length
      : 0;

  const pVal = corrPValue(bestCorr, bestNObs);

  return {
    rank: 0,
    spec: factor.spec,
    label: factor.label,
    category: factor.category,
    bestAbsCorr: bestAbs,
    bestCorr,
    spearman: spear,
    bestWindow,
    bestLag,
    stability,
    nObs: bestNObs,
    pVal,
    windowCorrs,
  };
}

// ════════════════════════════════════════════════════════════════════════
// Factor catalog construction + data loading (bundle: H)
// ════════════════════════════════════════════════════════════════════════

/**
 * Build the factor catalog for a ticker and load each factor's time series.
 *   Macro factors: every cached series in the macro catalog (spec "MACRO:<id>").
 *   Fundamental factors: the ticker's uploaded "Fund: …" metrics (spec
 *     "FUND:Fund: …"), discovered from the in-memory ticker cache (sync) or,
 *     as a fallback, the async ticker list.
 * Data is fetched in batches of 8 with a yield between batches so the UI stays
 * responsive and progress can be reported. Only factors with data are kept.
 */
async function loadFactors(
  ticker: string,
  includeMacro: boolean,
  includeFund: boolean,
  onProgress?: (done: number, total: number) => void
): Promise<Factor[]> {
  const factors: Factor[] = [];

  if (includeMacro) {
    const catalog = await fetchMacroCatalog();
    for (const m of catalog) {
      if (m.cached) {
        factors.push({
          spec: `MACRO:${m.id}`,
          label: m.label || m.id,
          category: `Macro / ${m.category || "General"}`,
          data: [],
        });
      }
    }
  }

  if (includeFund) {
    const sync = getTickersCacheSync();
    if (sync) {
      const meta = sync.find((t) => t.ticker === ticker);
      if (meta) {
        for (const metric of meta.metrics) {
          if (metric.startsWith("Fund: ")) {
            factors.push({
              spec: `FUND:${metric}`,
              label: metric.replace(/^Fund:\s*/, ""),
              category: "Fundamentals",
              data: [],
            });
          }
        }
      }
    } else {
      try {
        const all = await getTickers();
        const meta = all.find((t) => t.ticker === ticker);
        if (meta) {
          for (const metric of meta.metrics) {
            if (metric.startsWith("Fund: ")) {
              factors.push({
                spec: `FUND:${metric}`,
                label: metric.replace(/^Fund:\s*/, ""),
                category: "Fundamentals",
                data: [],
              });
            }
          }
        }
      } catch {
        // ignore — no fundamentals available
      }
    }
  }

  const total = factors.length;
  let done = 0;
  const batchSize = 8;
  for (let i = 0; i < factors.length; i += batchSize) {
    const batch = factors.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (f) => {
        try {
          if (f.spec.startsWith("MACRO:")) {
            const id = f.spec.replace("MACRO:", "");
            f.data = await fetchStaticSeries(id);
          } else if (f.spec.startsWith("FUND:")) {
            const metric = f.spec.replace("FUND:", "");
            f.data = await getMetricSeries(ticker, metric);
          }
        } catch {
          f.data = [];
        }
      })
    );
    done += batch.length;
    onProgress?.(done, total);
    await new Promise((r) => setTimeout(r, 0));
  }

  return factors.filter((f) => f.data.length > 0);
}

// ════════════════════════════════════════════════════════════════════════
// Main entry point (bundle: _)
// ════════════════════════════════════════════════════════════════════════

/**
 * Run the driver / factor scan for one ticker against the macro + fundamental
 * factor catalog across SCAN_WINDOWS and SCAN_LAGS. Honors the AbortSignal and
 * reports progress through onProgress(done, total, phase) where phase is
 * "load" (loading factor data) then "scan" (correlating).
 */
export async function runDriverScan(
  opts: RunDriverScanOptions
): Promise<DriverScanRunResult> {
  const startTime = performance.now();
  const {
    ticker,
    targetMode,
    includeMacro = true,
    includeFund = true,
    minObs = 60,
    onProgress,
    signal,
  } = opts;

  const price = await getMetricSeries(ticker, "close");
  if (price.length === 0) {
    throw new Error(`No price data found for ${ticker}`);
  }

  const target = buildTarget(price, targetMode);
  if (target.length < minObs) {
    throw new Error(`Insufficient data for ${ticker} with minObs=${minObs}`);
  }

  const factors = await loadFactors(
    ticker,
    includeMacro,
    includeFund,
    (done, total) => onProgress?.(done, total, "load")
  );

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const rows: DriverScanRow[] = [];
  const totalFactors = factors.length;
  const batchSize = 50;
  for (let i = 0; i < factors.length; i += batchSize) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = factors.slice(i, i + batchSize);
    for (const factor of batch) {
      const row = scanFactor(factor, target, minObs);
      if (row) rows.push(row);
    }
    onProgress?.(Math.min(i + batchSize, totalFactors), totalFactors, "scan");
    await new Promise((r) => setTimeout(r, 0));
  }

  rows.sort((a, b) => b.bestAbsCorr - a.bestAbsCorr);
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  return {
    rows,
    ticker,
    targetMode,
    totalFactors,
    durationMs: Math.round(performance.now() - startTime),
  };
}

// ════════════════════════════════════════════════════════════════════════
// CSV export (bundle: K)
// ════════════════════════════════════════════════════════════════════════

/** Serialize a scan result to CSV. */
export function driverScanToCsv(result: DriverScanRunResult): string {
  const header = [
    "Rank",
    "Spec",
    "Label",
    "Category",
    "BestAbsCorr",
    "BestCorr",
    "Spearman",
    "BestWindow",
    "BestLag",
    "Stability",
    "NObs",
    "PValue",
  ].join(",");
  const rows = (result.rows ?? []).map((r) =>
    [
      r.rank,
      `"${r.spec}"`,
      `"${r.label.replace(/"/g, '""')}"`,
      `"${r.category}"`,
      r.bestAbsCorr.toFixed(4),
      r.bestCorr.toFixed(4),
      r.spearman.toFixed(4),
      r.bestWindow,
      r.bestLag,
      r.stability.toFixed(4),
      r.nObs,
      r.pVal.toFixed(4),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

// ════════════════════════════════════════════════════════════════════════
// Legacy export
// ════════════════════════════════════════════════════════════════════════
//
// RelativeStrength.tsx imports `driverScan` and calls it as
// `(x: number[], y: number[]) => number | null` to compute an Information
// Coefficient (rank correlation of factor scores vs. forward returns). This is
// not part of the production driverScan chunk, but the consumer exists in this
// repo, so we keep a compatible export that returns the Spearman IC (or null
// when there is insufficient overlapping data).
export function driverScan(x: number[], y: number[]): number | null {
  if (!x || !y) return null;
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  return spearman(x, y);
}
