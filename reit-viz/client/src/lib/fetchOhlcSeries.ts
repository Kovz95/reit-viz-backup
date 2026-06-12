// Stub — TODO: reverse-engineer from production bundle

export interface OhlcSeries {
  dates: string[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

/**
 * Fetch OHLCV data for a ticker.
 */
export async function fetchOhlcSeries(
  _ticker: string,
  _options?: { start?: string; end?: string; [key: string]: any }
): Promise<OhlcSeries> {
  // Stub — TODO: reverse-engineer from production bundle
  return { dates: [], opens: [], highs: [], lows: [], closes: [], volumes: [] };
}
