/**
 * fetchTradingDates — thin adapter over dataService.getDates().
 *
 * getDates() returns the authoritative ordered list of trading-day ISO strings
 * that the backend uses as the shared date index.  Applies optional start/end
 * filtering and returns the slice as a plain string[].
 */

import { getDates } from "@/lib/dataService";

/**
 * Fetch the ordered list of valid trading dates (NYSE calendar).
 * Returns ISO date strings (YYYY-MM-DD) sorted ascending.
 *
 * @param options.start - ISO date lower bound (inclusive)
 * @param options.end   - ISO date upper bound (inclusive)
 */
export async function fetchTradingDates(
  options?: { start?: string; end?: string; [key: string]: any }
): Promise<string[]> {
  try {
    let dates = await getDates();

    const { start, end } = options ?? {};
    if (start) dates = dates.filter((d) => d >= start!);
    if (end)   dates = dates.filter((d) => d <= end!);

    return dates;
  } catch {
    return [];
  }
}
