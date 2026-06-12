// Stub — TODO: reverse-engineer from production bundle

export interface YahooPriceData {
  ticker: string;
  dates: string[];
  closes: number[];
  opens?: number[];
  highs?: number[];
  lows?: number[];
  volumes?: number[];
  [key: string]: any;
}

/**
 * Fetch OHLCV price data from Yahoo Finance for a given ticker.
 * Stub — TODO: reverse-engineer from production bundle.
 */
export async function fetchYahooPrices(
  _ticker: string,
  _forceRefresh?: boolean
): Promise<YahooPriceData> {
  // Stub — TODO: reverse-engineer from production bundle
  return { ticker: _ticker ?? "", dates: [], closes: [] };
}

/**
 * Clear the Yahoo price cache.
 * Stub — TODO: reverse-engineer from production bundle.
 */
export function clearCache(): void {
  // Stub — TODO: reverse-engineer from production bundle
}
