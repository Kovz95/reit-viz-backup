// Shared numeric range / comparison filter parser used by column filters and
// liquidity ($ ADV) thresholds across the universe explorers.
//
// Accepts (commas and whitespace are ignored):
//   "5-50" or "5..50"  → range  (5 ≤ v ≤ 50)
//   ">5"  ">=5"  "<100"  "<=100"  "=10"  → comparison
//   bare number "5"    → treated as ">= 5"
// Returns a predicate over (number | null | undefined), or null when the input
// is blank / unparseable. Null / non-finite values never satisfy a predicate,
// so rows with unknown values drop out when a filter is active.
export function parseNumericFilter(
  raw: string,
): ((val: number | null | undefined) => boolean) | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const noCommas = trimmed.replace(/,/g, "").replace(/\s+/g, "");
  const rangeMatch = noCommas.match(/^(-?\d+(?:\.\d+)?)(?:-|\.\.)(-?\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1]);
    const hi = parseFloat(rangeMatch[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi))
      return (v) => v != null && Number.isFinite(v) && v >= lo && v <= hi;
  }
  const opMatch = noCommas.match(/^(>=|<=|>|<|=)(-?\d+(?:\.\d+)?)$/);
  if (opMatch) {
    const op = opMatch[1];
    const num = parseFloat(opMatch[2]);
    if (!Number.isFinite(num)) return null;
    switch (op) {
      case ">":
        return (v) => v != null && Number.isFinite(v) && v > num;
      case ">=":
        return (v) => v != null && Number.isFinite(v) && v >= num;
      case "<":
        return (v) => v != null && Number.isFinite(v) && v < num;
      case "<=":
        return (v) => v != null && Number.isFinite(v) && v <= num;
      case "=":
        return (v) => v != null && Number.isFinite(v) && v === num;
    }
  }
  const single = parseFloat(noCommas);
  return Number.isFinite(single)
    ? (v) => v != null && Number.isFinite(v) && v >= single
    : null;
}

// Format a value already expressed in $-millions as a compact USD string.
//   36868 → "$36.9B"   12.34 → "$12.3M"   0.42 → "$420K"
export function fmtUsdMM(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  const abs = Math.abs(val);
  if (abs >= 1000) return "$" + (val / 1000).toFixed(2) + "B";
  if (abs >= 1) return "$" + val.toFixed(1) + "M";
  return "$" + (val * 1000).toFixed(0) + "K";
}
