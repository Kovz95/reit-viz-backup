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
  globalDatesOrMetricA?: string[] | string,
  optsOrMetricB?: Record<string, any> | string
): Promise<PairRatioData | null> {
  try {
    const params = new URLSearchParams({ a: tickerA, b: tickerB });
    // Some callers pass (a, b, metricA, metricB) field selectors instead of
    // (a, b, globalDates, opts); fold those into query params.
    if (typeof globalDatesOrMetricA === "string") params.set("metricA", globalDatesOrMetricA);
    if (typeof optsOrMetricB === "string") params.set("metricB", optsOrMetricB);
    const opts = optsOrMetricB && typeof optsOrMetricB === "object" ? optsOrMetricB : undefined;
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
