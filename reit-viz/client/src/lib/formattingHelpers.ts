// Hand-written from call-site inference
// Used by PairOptimizer.tsx, ValuationRegime.tsx

export {
  hitRateClass,
  pfTextColor,
  scoreTextColor,
  scoreBackgroundColor,
  formatPct,
} from "@/lib/metricHelpers";

// pfClass: returns a CSS class for profit-factor text, same as pfTextColor
export { pfTextColor as pfClass } from "@/lib/metricHelpers";

import { formatPct } from "@/lib/formatPct";

/**
 * Formats an average return as a percentage string with sign.
 * 0.023 → "+2.30%"  -0.01 → "-1.00%"
 */
export function formatAvgReturn(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}
