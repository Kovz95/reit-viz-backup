// Stub — TODO: reverse-engineer from production bundle

export interface CloseSeries {
  dates: string[];
  closes: number[];
}

/**
 * Fetch the daily close price series for a ticker.
 */
export async function fetchCloseSeries(
  _ticker: string,
  _options?: { start?: string; end?: string; [key: string]: any }
): Promise<CloseSeries> {
  // Stub — TODO: reverse-engineer from production bundle
  return { dates: [], closes: [] };
}
