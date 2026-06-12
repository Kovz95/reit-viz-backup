/**
 * fetchCloseSeries — thin adapter over dataService.getOhlcData().
 *
 * Maps OhlcPoint[] { time, open, high, low, close } returned by dataService
 * into the CloseSeries shape { time, close, high?, low?, open? }, then
 * applies optional start/end date filtering.
 */

import { getOhlcData } from "@/lib/dataService";

export type CloseSeries = Array<{ time: string; close: number; high?: number; low?: number; open?: number }>;

/**
 * Fetch the daily close price series for a ticker.
 *
 * @param ticker - Uppercase ticker symbol (e.g. "SPY")
 * @param options.start - ISO date string lower bound (inclusive), e.g. "2020-01-01"
 * @param options.end   - ISO date string upper bound (inclusive), e.g. "2024-12-31"
 * @returns Array of { time, close, high, low, open } sorted ascending, or [] on error.
 */
export async function fetchCloseSeries(
  ticker: string,
  options?: { start?: string; end?: string; [key: string]: any }
): Promise<CloseSeries> {
  try {
    const ohlc = await getOhlcData(ticker);
    let series: CloseSeries = ohlc.map(({ time, close, high, low, open }) => ({
      time,
      close,
      high,
      low,
      open,
    }));

    const { start, end } = options ?? {};
    if (start) series = series.filter((p) => p.time >= start!);
    if (end)   series = series.filter((p) => p.time <= end!);

    return series;
  } catch {
    return [];
  }
}
