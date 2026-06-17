// Hand-written from call-site inference
// Used in AutoTrendlineBacktest.tsx, LevelsAndTrendlines.tsx, PairOptimizer.tsx, PatternScreener.tsx
//
// The live backend has no /api/ohlcv route — per-ticker prices come from
// GET /api/ticker/<sym> ({ dates, metrics }). See lib/tickerData.ts.

import { fetchTickerRaw, toDenseOHLCV } from "@/lib/tickerData";

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
  const empty: OHLCVResult = {
    dates: [], opens: [], highs: [], lows: [], closes: [], adjCloses: [],
    volumes: [], bars: [], dailyIndexMap: new Map(),
  };

  const raw = await fetchTickerRaw(ticker);
  if (!raw) return empty;

  const d = toDenseOHLCV(raw);
  const bars: OHLCVBar[] = d.dates.map((date, i) => ({
    date,
    open: d.opens[i],
    high: d.highs[i],
    low: d.lows[i],
    close: d.closes[i],
    volume: d.volumes[i],
  }));
  const dailyIndexMap = new Map<string, number>();
  d.dates.forEach((date, i) => dailyIndexMap.set(date, i));

  return {
    dates: d.dates,
    opens: d.opens,
    highs: d.highs,
    lows: d.lows,
    closes: d.closes,
    adjCloses: d.closes,
    volumes: d.volumes,
    bars,
    dailyIndexMap,
  };
}
