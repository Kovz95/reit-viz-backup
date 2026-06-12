// Hand-written stub — returns a display multiplier for dividend yield metrics.
// Dividend Yield is stored as a decimal (e.g. 0.05 = 5%); display as percentage.
export function getDividendYieldMultiplier(metric: string): number {
  const pctMetrics = new Set([
    "Dividend Yield",
    "FFO Yield LTM",
    "FFO Yield FY2",
    "AFFO Yield LTM",
    "AFFO Yield FY2",
    "Implied Cap Rate",
  ]);
  return pctMetrics.has(metric) ? 100 : 1;
}
