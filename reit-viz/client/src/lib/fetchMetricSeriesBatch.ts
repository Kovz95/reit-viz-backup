// Stub — TODO: reverse-engineer from production bundle

export interface MetricSeriesBatchResult {
  ticker: string;
  name: string;
  sector: string;
  subindustry: string;
  metricKey: string;
  dates: string[];
  values: (number | null)[];
}

/**
 * Fetch multiple metric series for multiple tickers in a single batched request.
 * Can be called as:
 *   fetchMetricSeriesBatch(tickers, metricKeys, options?) - batch mode
 *   fetchMetricSeriesBatch(metricKey, minBars?) - single-metric mode (returns all tickers)
 */
export default async function fetchMetricSeriesBatch(
  _tickersOrMetric: string[] | string,
  _metricKeysOrMinBars?: string[] | number,
  _options?: Record<string, any>
): Promise<MetricSeriesBatchResult[]> {
  return [];
}
