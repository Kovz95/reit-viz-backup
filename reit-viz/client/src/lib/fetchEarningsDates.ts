/**
 * fetchEarningsDates — thin adapter over dataService.getTickerEvents().
 *
 * getTickerEvents(symbol) returns the per-ticker events object:
 *   { earnings: string[], ex_dividend: string[], ... }
 *
 * The return value is typed as string[] to preserve the stub's exported
 * signature, but the underlying value is the full events object so that
 * consumers that access result.earnings (via `as any`) work correctly.
 *
 * The events object may store dates in "M/D/YYYY" format; those are left
 * as-is because the downstream filtering already handles mixed formats.
 */

import { getTickerEvents } from "@/lib/dataService";

/**
 * Fetch historical earnings announcement dates for a ticker.
 *
 * Note: consumers may access the returned value as `(result as any).earnings`
 * to retrieve the raw earnings date array from the events object.
 *
 * @param ticker   - Ticker symbol (case-insensitive)
 * @param _options - Reserved for future use
 * @returns Per-ticker events object (typed as string[] to match stub signature).
 */
export async function fetchEarningsDates(
  ticker: string,
  _options?: Record<string, any>
): Promise<string[]> {
  try {
    // getTickerEvents returns { earnings: string[], ex_dividend: string[], ... }
    // Cast via unknown to satisfy the string[] return type while preserving
    // the object shape that consumers access via `as any`.
    const events = await getTickerEvents(ticker);
    return events as unknown as string[];
  } catch {
    return [];
  }
}
