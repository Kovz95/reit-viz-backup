// Stub — TODO: reverse-engineer algorithm from production bundle

export interface PremiumSeriesInput {
  metricValues: (number | null)[];
  priceValues: (number | null)[];
  [key: string]: any;
}

export interface PremiumSeriesResult {
  dates: string[];
  values: (number | null)[];
}

/**
 * Compute the premium/discount series (price vs. fundamental-derived fair value).
 * Stub — TODO: reverse-engineer algorithm from production bundle.
 */
export function computePremiumSeries(
  _input: PremiumSeriesInput
): PremiumSeriesResult {
  return { dates: [], values: [] };
}

/**
 * Compute the first difference of the premium/discount series.
 * Stub — TODO: reverse-engineer algorithm from production bundle.
 */
export function computePremiumDiff(
  _values: (number | null)[]
): (number | null)[] {
  return [];
}

/**
 * Compute the absolute value of the premium/discount diff series.
 * Stub — TODO: reverse-engineer algorithm from production bundle.
 */
export function computePremiumDiffAbs(
  _values: (number | null)[]
): (number | null)[] {
  return [];
}
