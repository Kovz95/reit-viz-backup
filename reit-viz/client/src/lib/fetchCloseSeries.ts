// Stub — TODO: reverse-engineer from production bundle

export type CloseSeries = Array<{ time: string; close: number; high?: number; low?: number; open?: number }>;

/**
 * Fetch the daily close price series for a ticker.
 */
export async function fetchCloseSeries(
  _ticker: string,
  _options?: { start?: string; end?: string; [key: string]: any }
): Promise<CloseSeries> {
  return [];
}
