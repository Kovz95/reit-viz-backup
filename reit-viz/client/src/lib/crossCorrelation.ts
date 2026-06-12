// Stub — TODO: reverse-engineer algorithm from production bundle

export interface CrossCorrelationResult {
  lag: number;
  correlation: number;
  /** Alias for correlation (Pearson rho at this lag). */
  rho: number;
}

/**
 * Compute the cross-correlation between two series for each integer lag.
 * Returns an array of { lag, correlation, rho } sorted by lag ascending.
 */
export function crossCorrelate(
  _seriesA: any[],
  _seriesB: any[],
  _maxLag?: number
): CrossCorrelationResult[] {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return [];
}

/**
 * Return the lag that maximises the absolute cross-correlation.
 * Accepts either a CCF result array (1 arg) or two raw series (2-3 args).
 */
export function findBestLag(ccf: CrossCorrelationResult[]): CrossCorrelationResult | null;
export function findBestLag(seriesA: any[], seriesB: any[], maxLag?: number): CrossCorrelationResult | null;
export function findBestLag(
  _arg0: any,
  _arg1?: any,
  _arg2?: any
): CrossCorrelationResult | null {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return null;
}
