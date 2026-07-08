// Delegate to the canonical percent-metric detection so every consumer agrees
// (this used to be a stub returning false, which made FactorBacktest treat
// every percentage metric as a plain number).
export { isPercentMetric } from "@/lib/dataService";

/**
 * Returns a human-readable label for a metric key.
 */
export function getMetricLabel(_metricKey: string): string {
  // Stub — TODO: reverse-engineer from production bundle
  return _metricKey;
}
