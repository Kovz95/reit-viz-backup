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
  adjCloses: number[];
  volumes?: number[];
  bars?: OHLCVBar[];
  /** Map from date string → index position */
  dailyIndexMap?: Map<string, number>;
}

export async function fetchTickerOHLCV(
  ticker: string,
  opts?: { freq?: "daily" | "weekly" | "monthly" },
  _extraArg?: any
): Promise<OHLCVResult> {
  const params = new URLSearchParams({ ticker });
  if (opts?.freq) params.set("freq", opts.freq);

  const res = await fetch(`/api/ohlcv?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchTickerOHLCV: HTTP ${res.status}`);
  const data = await res.json();

  // Normalise into parallel arrays regardless of server response shape
  if (Array.isArray(data)) {
    const bars: OHLCVBar[] = data;
    const closes = bars.map((b) => b.close);
    const dailyIndexMap = new Map<string, number>();
    bars.forEach((b, i) => dailyIndexMap.set(b.date, i));
    return {
      dates: bars.map((b) => b.date),
      opens: bars.map((b) => b.open),
      highs: bars.map((b) => b.high),
      lows: bars.map((b) => b.low),
      closes,
      adjCloses: closes,
      volumes: bars.map((b) => b.volume ?? 0),
      bars,
      dailyIndexMap,
    };
  }

  // Server already returned parallel arrays
  const result = data as OHLCVResult;
  if (!result.adjCloses) result.adjCloses = result.closes ?? [];
  if (!result.dailyIndexMap && result.dates) {
    const m = new Map<string, number>();
    result.dates.forEach((d, i) => m.set(d, i));
    result.dailyIndexMap = m;
  }
  return result;
}
