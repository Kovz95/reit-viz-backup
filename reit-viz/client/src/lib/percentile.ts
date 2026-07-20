// Percentile helpers used by PremiumDiscount.

function toValues(input: any): number[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v: any) => (typeof v === "number" ? v : v?.value))
    .filter((v: any) => Number.isFinite(v));
}

/**
 * Percentile rank (0-100) of `target` within the distribution. When `target`
 * is omitted, ranks the LAST value of the series (PremiumDiscount passes a
 * {time,value}[] series and wants "where is today vs history").
 */
export function computePercentile(values: any, target?: number): number {
  const vals = toValues(values);
  if (vals.length === 0) return NaN;
  const t = Number.isFinite(target) ? (target as number) : vals[vals.length - 1];
  if (!Number.isFinite(t)) return NaN;
  let below = 0;
  let equal = 0;
  for (const v of vals) {
    if (v < t) below++;
    else if (v === t) equal++;
  }
  // midpoint convention for ties
  return ((below + equal / 2) / vals.length) * 100;
}

/**
 * Value at the given percentile (0-100), linear interpolation.
 */
export function percentileValue(values: number[], pct: number): number {
  const vals = toValues(values).sort((a, b) => a - b);
  if (vals.length === 0) return NaN;
  const p = Math.min(100, Math.max(0, pct)) / 100;
  const idx = p * (vals.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return vals[lo];
  return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
}
