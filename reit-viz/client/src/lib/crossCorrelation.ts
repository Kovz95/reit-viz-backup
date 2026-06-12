// Recovered from recovered-bundle/Correlation-TbSje8f3.js

export interface CrossCorrelationResult {
  lag: number;
  correlation: number;
  /** Alias for correlation (Pearson rho at this lag). */
  rho: number;
}

/**
 * Pearson correlation coefficient between two numeric arrays.
 * Recovered from function `ie` in Correlation-TbSje8f3.js.
 */
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let count = 0, sumA = 0, sumB = 0, sumAB = 0, sumAA = 0, sumBB = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sumA += x; sumB += y; sumAB += x * y; sumAA += x * x; sumBB += y * y;
    count++;
  }
  if (count < 3) return 0;
  const meanA = sumA / count;
  const meanB = sumB / count;
  const varA = sumAA - count * meanA * meanA;
  const varB = sumBB - count * meanB * meanB;
  const cov = sumAB - count * meanA * meanB;
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

/**
 * Compute the cross-correlation between two series for each integer lag.
 * Returns an array of { lag, correlation, rho } sorted by lag ascending.
 *
 * Recovered from the cross-correlation loop in Correlation-TbSje8f3.js
 * (loop over w = -maxLag..maxLag, shifting seriesA by w bars).
 *
 * At positive lag w: seriesA is shifted forward by w — i.e. we correlate
 *   a[w..] with b[0..n-w-1]  (A leads B by w bars).
 * At negative lag w: b is shifted forward by |w|.
 */
export function crossCorrelate(
  seriesA: number[],
  seriesB: number[],
  maxLag = 20
): CrossCorrelationResult[] {
  const results: CrossCorrelationResult[] = [];
  const n = Math.min(seriesA.length, seriesB.length);
  const aSlice = seriesA.slice(0, n);
  const bSlice = seriesB.slice(0, n);

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let aWindow: number[], bWindow: number[];
    if (lag >= 0) {
      aWindow = aSlice.slice(lag);
      bWindow = bSlice.slice(0, n - lag);
    } else {
      aWindow = aSlice.slice(0, n + lag);
      bWindow = bSlice.slice(-lag);
    }
    const len = Math.min(aWindow.length, bWindow.length);
    let rho = 0;
    if (len >= 10) {
      rho = Math.round(pearson(aWindow.slice(0, len), bWindow.slice(0, len)) * 1e4) / 1e4;
    }
    results.push({ lag, correlation: rho, rho });
  }
  return results;
}

/**
 * Return the lag that maximises the absolute cross-correlation.
 * Accepts either a CCF result array (1 arg) or two raw series (2-3 args).
 */
export function findBestLag(ccf: CrossCorrelationResult[]): CrossCorrelationResult | null;
export function findBestLag(seriesA: number[], seriesB: number[], maxLag?: number): CrossCorrelationResult | null;
export function findBestLag(
  arg0: CrossCorrelationResult[] | number[],
  arg1?: number[],
  arg2?: number
): CrossCorrelationResult | null {
  let ccf: CrossCorrelationResult[];

  if (arg1 !== undefined) {
    // Called with (seriesA, seriesB, maxLag?)
    ccf = crossCorrelate(arg0 as number[], arg1, arg2);
  } else {
    ccf = arg0 as CrossCorrelationResult[];
  }

  if (!ccf || ccf.length === 0) return null;

  let best = ccf[0];
  for (const entry of ccf) {
    if (Math.abs(entry.rho) > Math.abs(best.rho)) {
      best = entry;
    }
  }
  return best;
}
