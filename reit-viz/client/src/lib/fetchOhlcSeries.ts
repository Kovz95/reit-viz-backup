/**
 * fetchOhlcSeries — thin adapter over dataService.getOhlcData().
 *
 * Transposes the OhlcPoint[] array-of-objects returned by dataService into
 * the columnar OhlcSeries shape { dates[], opens[], highs[], lows[], closes[], volumes[] }.
 * Applies optional start/end date filtering before transposing.
 * Volume is not available in OhlcPoint, so volumes[] is filled with 0.
 */

import { getOhlcData } from "@/lib/dataService";

export interface OhlcSeries {
  dates: string[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

/**
 * Fetch OHLCV data for a ticker in columnar format.
 *
 * @param ticker - Uppercase ticker symbol (e.g. "SPY")
 * @param options.start - ISO date string lower bound (inclusive)
 * @param options.end   - ISO date string upper bound (inclusive)
 * @returns Columnar OHLCV arrays sorted ascending, or empty arrays on error.
 */
export async function fetchOhlcSeries(
  ticker: string,
  options?: { start?: string; end?: string; [key: string]: any }
): Promise<OhlcSeries> {
  const empty: OhlcSeries = { dates: [], opens: [], highs: [], lows: [], closes: [], volumes: [] };
  try {
    let ohlc = await getOhlcData(ticker);

    const { start, end } = options ?? {};
    if (start) ohlc = ohlc.filter((p) => p.time >= start!);
    if (end)   ohlc = ohlc.filter((p) => p.time <= end!);

    // Transpose array-of-objects → columnar arrays
    const dates:  string[] = [];
    const opens:  number[] = [];
    const highs:  number[] = [];
    const lows:   number[] = [];
    const closes: number[] = [];
    const volumes: number[] = [];

    for (const { time, open, high, low, close } of ohlc) {
      dates.push(time);
      opens.push(open);
      highs.push(high);
      lows.push(low);
      closes.push(close);
      volumes.push(0); // volume not stored in OhlcPoint; callers check hasVolume
    }

    return { dates, opens, highs, lows, closes, volumes };
  } catch {
    return empty;
  }
}
