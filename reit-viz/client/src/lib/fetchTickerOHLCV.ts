// Hand-written from call-site inference
// Used in AutoTrendlineBacktest.tsx, LevelsAndTrendlines.tsx, PairOptimizer.tsx, PatternScreener.tsx

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** Extended result with parallel arrays (used by some callers directly). */
export interface OHLCVResult {
  dates: string[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes?: number[];
  bars?: OHLCVBar[];
}

export async function fetchTickerOHLCV(
  ticker: string,
  opts?: { freq?: "daily" | "weekly" | "monthly" }
): Promise<OHLCVResult> {
  const params = new URLSearchParams({ ticker });
  if (opts?.freq) params.set("freq", opts.freq);

  const res = await fetch(`/api/ohlcv?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchTickerOHLCV: HTTP ${res.status}`);
  const data = await res.json();

  // Normalise into parallel arrays regardless of server response shape
  if (Array.isArray(data)) {
    const bars: OHLCVBar[] = data;
    return {
      dates: bars.map((b) => b.date),
      opens: bars.map((b) => b.open),
      highs: bars.map((b) => b.high),
      lows: bars.map((b) => b.low),
      closes: bars.map((b) => b.close),
      volumes: bars.map((b) => b.volume ?? 0),
      bars,
    };
  }

  // Server already returned parallel arrays
  return data as OHLCVResult;
}
