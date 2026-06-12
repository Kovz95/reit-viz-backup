// Hand-written from call-site inference
// Used by PairOptimizer.tsx (getMetricScalar, getMetricInverseFlag),
//         Scatter.tsx (isPercentMetric)

export { isPercentMetric } from "@/lib/dataService";

/**
 * Returns a numeric multiplier for a metric when used in ratio/spread calculations.
 * Yield-type metrics need to be divided by 100 to convert from pct display to decimal.
 */
export function getMetricScalar(metric: string): number {
  const yieldLike = new Set([
    "Dividend Yield",
    "FFO Yield LTM",
    "FFO Yield FY2",
    "AFFO Yield LTM",
    "AFFO Yield FY2",
    "Implied Cap Rate",
  ]);
  return yieldLike.has(metric) ? 0.01 : 1;
}

/**
 * Returns true if higher values of this metric are "worse" (e.g. P/E, valuation multiples).
 * Used to flip the sign when constructing pair spread signals.
 */
export function getMetricInverseFlag(metric: string): boolean {
  const inverseMetrics = new Set([
    "P/E LTM",
    "P/E FY2",
    "P/S LTM",
    "P/S FY2",
    "EV/EBITDA LTM",
    "EV/EBITDA FY2",
    "P/FFO LTM",
    "P/FFO FY2",
    "P/AFFO LTM",
    "P/AFFO FY2",
  ]);
  return inverseMetrics.has(metric);
}

/**
 * Returns a scalar multiplier for display (100x for yield metrics).
 * Alias used by ValuationRegime.tsx.
 */
export function getMetricMultiplier(metric: string): number {
  return getMetricScalar(metric) === 0.01 ? 100 : 1;
}

/** Returns true if the metric value should be displayed as a percentage. */
export { isPercentMetric as isPercentMetric2 } from "@/lib/dataService";

// ─── Formatting helpers (some callers import these from metricHelpers) ─────────

/**
 * Returns a Tailwind CSS class for a hit rate value.
 * Green for ≥60%, yellow for ≥50%, red for <50%.
 */
export function hitRateClass(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "text-muted-foreground";
  if (rate >= 0.65) return "text-emerald-400 font-bold";
  if (rate >= 0.6)  return "text-green-400";
  if (rate >= 0.55) return "text-yellow-300";
  if (rate >= 0.5)  return "text-yellow-400";
  return "text-red-400";
}

/** Tailwind class for a profit factor value. */
export function pfTextColor(pf: number | null | undefined): string {
  if (pf == null || !Number.isFinite(pf)) return "text-muted-foreground";
  if (pf >= 2)   return "text-emerald-400 font-bold";
  if (pf >= 1.5) return "text-green-400";
  if (pf >= 1)   return "text-yellow-300";
  return "text-red-400";
}

/** Tailwind text-color class for a composite score 0–100. */
export function scoreTextColor(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "#9ca3af";
  if (score >= 80) return "#ffffff";
  if (score >= 60) return "#ffffff";
  if (score >= 40) return "#1f2937";
  return "#9ca3af";
}

/** Background color (hex string) for a composite score badge 0–100. */
export function scoreBackgroundColor(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "transparent";
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#22c55e";
  if (score >= 40) return "#eab308";
  if (score >= 20) return "#f97316";
  return "#ef4444";
}

export { formatPct } from "@/lib/formatPct";
