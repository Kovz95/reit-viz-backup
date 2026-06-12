// Stub — TODO: reverse-engineer from production bundle

export interface WeightedSeries {
  series: any[];
  dates: string[];
  values: number[];
  [key: string]: any;
}

export type Basket = string[] | { tickers: string[]; [key: string]: any } | any;

/**
 * Compute a cap-weighted series for a basket of tickers using metric (fundamental) data.
 *   getCapWeightedBasketSeries(basket, metric, getVal) → { series, ... }
 */
export function getCapWeightedBasketSeries(
  _basket: Basket,
  _metricKey?: string,
  _getVal?: any,
  _options?: Record<string, any>
): WeightedSeries {
  return { series: [], dates: [], values: [] };
}

/**
 * Compute a cap-weighted price series for a basket (async, extra args).
 */
export async function getCapWeightedPriceSeries(
  _basket: Basket,
  _options?: Record<string, any>,
  _extra1?: any,
  _extra2?: any,
  _extra3?: any
): Promise<WeightedSeries> {
  return { series: [], dates: [], values: [] };
}
