// Stub — TODO: reverse-engineer from production bundle

export interface MetricSeriesBatchResult {
  ticker: string;
  metricKey: string;
  dates: string[];
  values: (number | null)[];
}

/**
 * Fetch multiple metric series for multiple tickers in a single batched request.
 * Default export (used as `import fetchMetricSeriesBatch from "@/lib/fetchMetricSeriesBatch"`).
 */
export default async function fetchMetricSeriesBatch(
  _tickers: string[],
  _metricKeys: string[],
  _options?: Record<string, any>
): Promise<MetricSeriesBatchResult[]> {
  // Stub — TODO: reverse-engineer from production bundle
  return [];
}
