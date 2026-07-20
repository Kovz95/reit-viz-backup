// Delegate to the canonical percent-metric detection so every consumer agrees
// (this used to be a stub returning false, which made FactorBacktest treat
// every percentage metric as a plain number).
export { isPercentMetric } from "@/lib/dataService";

// Friendly names for the raw price fields; workbook metric keys are already
// human-readable ("P/FFO FY2", "Dividend Yield", …) and pass through.
const FIELD_LABELS: Record<string, string> = {
  close: "Close",
  open: "Open",
  high: "High",
  low: "Low",
  volume: "Volume",
};

/**
 * Returns a human-readable label for a metric key.
 */
export function getMetricLabel(metricKey: string): string {
  if (!metricKey) return "";
  return FIELD_LABELS[metricKey] ?? metricKey;
}
