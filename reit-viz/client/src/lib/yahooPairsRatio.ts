// Hand-written from call-site inference
// getYahooPairsRatio: fetches ratio price series for a ticker pair.
// Called as `g` (minified alias) in some imports.

export interface RatioBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PairRatioData {
  prices: number[];
  indices: number[];
  dates?: string[];
  /** Ratio values (alias for prices) */
  ratio: number[];
}

/**
 * Fetches the price ratio series for tickerA / tickerB.
 * Returns parallel arrays of prices (ratio values) and date-string indices.
 */
export async function getYahooPairsRatio(
  tickerA: string,
  tickerB: string,
  globalDates?: string[],
  opts?: Record<string, any>
): Promise<PairRatioData | null> {
  try {
    const params = new URLSearchParams({ a: tickerA, b: tickerB });
    if (opts) {
      for (const [k, v] of Object.entries(opts)) {
        params.set(k, String(v));
      }
    }
    const res = await fetch(`/api/pairs/ratio?${params.toString()}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Named export alias for destructured import `{ g as getYahooPairsRatio }`
export { getYahooPairsRatio as g };

/** Alias for getYahooPairsRatio */
export const yahooPairsRatio = getYahooPairsRatio;
