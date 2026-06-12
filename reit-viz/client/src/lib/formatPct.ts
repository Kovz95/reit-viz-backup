// Hand-written from call-site inference
// formatPct: used in ValuationRegime.tsx, PairOptimizer.tsx (via formattingHelpers)

/**
 * Formats a decimal fraction as a percentage string.
 * Example: 0.0523 → "5.23%"   0.5 → "50.00%"   null/undefined/NaN → "—"
 */
export function formatPct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return (value * 100).toFixed(digits) + "%";
}
