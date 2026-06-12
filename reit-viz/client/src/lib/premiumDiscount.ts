// Stub — TODO: reverse-engineer algorithm from production bundle

export interface PremiumSeriesInput {
  metricValues: (number | null)[];
  priceValues: (number | null)[];
  [key: string]: any;
}

export interface PremiumSeriesResult {
  dates: string[];
  values: (number | null)[];
  targetSeries: (number | null)[];
  groupSeries: (number | null)[];
  peerTickers: string[];
}

/**
 * Compute the premium/discount series.
 * Accepts a full set of arguments from the call site:
 *   computePremiumSeries(target, dimension, peerLabel, metric, aggregation, opts?, getMetricSeries?)
 */
export function computePremiumSeries(
  _target: any,
  _dimension?: any,
  _peerLabel?: any,
  _metric?: any,
  _aggregation?: any,
  _opts?: any,
  _getMetricSeries?: any
): Promise<PremiumSeriesResult> {
  return Promise.resolve({ dates: [], values: [], targetSeries: [], groupSeries: [], peerTickers: [] });
}

/**
 * Compute the diff between two series.
 *   computePremiumDiff(seriesA, seriesB, mode)
 */
export function computePremiumDiff(
  _seriesA: any,
  _seriesB?: any,
  _mode?: any
): (number | null)[] {
  return [];
}

/**
 * Compute the absolute value diff.
 *   computePremiumDiffAbs(dim, value, metric, aggregation, getMetricSeries)
 */
export function computePremiumDiffAbs(
  _dim: any,
  _value?: any,
  _metric?: any,
  _aggregation?: any,
  _getMetricSeries?: any
): Promise<(number | null)[]> {
  return Promise.resolve([]);
}
