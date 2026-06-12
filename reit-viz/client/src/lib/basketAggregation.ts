// Stub — TODO: reverse-engineer from production bundle

export interface WeightedSeries {
  dates: string[];
  values: number[];
}

/**
 * Compute a cap-weighted series for a basket of tickers using metric (fundamental) data.
 */
export function getCapWeightedBasketSeries(
  tickers: string[],
  _metricKey: string,
  _options?: Record<string, any>
): WeightedSeries {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return { dates: [], values: [] };
}

/**
 * Compute a cap-weighted price series for a basket.
 */
export function getCapWeightedPriceSeries(
  tickers: string[],
  _options?: Record<string, any>
): WeightedSeries {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return { dates: [], values: [] };
}
