// Per-frequency price series for the MA slope inflection analysis.
//
// Frequencies and their conventions (mirrors mtfData.ts):
//  - daily:  adjusted closes, workbook-first with Yahoo fallback (any symbol).
//  - weekly: Friday-ending bars derived from adjusted daily; a trailing
//            PARTIAL week is dropped — an inflection may only exist on a
//            completed weekly bar (no lookahead). dailyDates = week-end date.
//  - hourly: server intraday store (raw closes — fine for ≤1M horizons, small
//            ex-div bias on longer ones). Symbols with < MIN_HOURLY_BARS bars
//            return null so pages can show a "no usable hourly data" badge.
//
// dailyDates gives every bar a daily calendar date so events can be handed to
// the Charts page as day markers regardless of frequency.

import { fetchIntradayBars, type IntradayBar } from "@/lib/fetchIntradayBars";
import { fetchDailyAnySymbol } from "@/lib/mtfData";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { dateOfTimestamp } from "@/lib/chartFrequency";
import type { SlopeFreq } from "@/lib/maSlope";

export interface SlopeSeriesData {
  freq: SlopeFreq;
  /** Bar keys: hourly = stringified epoch-seconds; daily/weekly = "YYYY-MM-DD". */
  keys: string[];
  closes: number[];
  highs: number[];
  lows: number[];
  /** Daily calendar date per bar (hourly = the bar's UTC date; weekly = the
   *  week's last daily date) — used for chartBridge markers + display. */
  dailyDates: string[];
}

const MIN_HOURLY_BARS = 250;
const MAX_HOURLY_DAYS = 3650;

/** Approximate bars per year, for event-frequency stats. */
export const BARS_PER_YEAR: Record<SlopeFreq, number> = {
  hourly: 252 * 6.5,
  daily: 252,
  weekly: 52,
};

/** Forward horizons in BARS per frequency, with display labels. */
export const SLOPE_HORIZONS: Record<SlopeFreq, Array<{ bars: number; label: string }>> = {
  daily: [
    { bars: 5, label: "1W" }, { bars: 10, label: "2W" }, { bars: 21, label: "1M" },
    { bars: 42, label: "2M" }, { bars: 63, label: "3M" }, { bars: 126, label: "6M" },
  ],
  weekly: [
    { bars: 1, label: "1W" }, { bars: 2, label: "2W" }, { bars: 4, label: "1M" },
    { bars: 8, label: "2M" }, { bars: 13, label: "3M" }, { bars: 26, label: "6M" },
  ],
  // 6.5 trading hours per day.
  hourly: [
    { bars: 7, label: "1D" }, { bars: 14, label: "2D" }, { bars: 33, label: "1W" },
    { bars: 65, label: "2W" }, { bars: 130, label: "1M" },
  ],
};

export function defaultPrimaryHorizon(freq: SlopeFreq): number {
  const hs = SLOPE_HORIZONS[freq];
  // 1M equivalent: daily 21, weekly 4, hourly 130.
  const oneM = hs.find((h) => h.label === "1M");
  return (oneM ?? hs[hs.length - 1]).bars;
}

export function horizonLabel(freq: SlopeFreq, bars: number): string {
  return SLOPE_HORIZONS[freq].find((h) => h.bars === bars)?.label ?? `${bars}b`;
}

export async function loadSlopeSeries(ticker: string, freq: SlopeFreq): Promise<SlopeSeriesData | null> {
  if (freq === "hourly") {
    const bars = await fetchIntradayBars(ticker, "60m", MAX_HOURLY_DAYS).catch(() => [] as IntradayBar[]);
    if (bars.length < MIN_HOURLY_BARS) return null;
    return {
      freq,
      keys: bars.map((b) => String(b.time)),
      closes: bars.map((b) => b.close),
      highs: bars.map((b) => b.high),
      lows: bars.map((b) => b.low),
      dailyDates: bars.map((b) => dateOfTimestamp(b.time)),
    };
  }

  const daily = await fetchDailyAnySymbol(ticker);
  if (!daily || !daily.dates.length) return null;
  const adj = daily.adjCloses.length === daily.dates.length ? daily.adjCloses : daily.closes;

  if (freq === "daily") {
    return { freq, keys: daily.dates, closes: adj, highs: daily.highs, lows: daily.lows, dailyDates: daily.dates };
  }

  const w = weeklyDownsample({
    dates: daily.dates,
    closes: adj,
    adjCloses: adj,
    highs: daily.highs,
    lows: daily.lows,
    opens: daily.opens,
    volumes: daily.volumes ?? [],
  });
  // Drop a trailing partial week — weeklyDownsample flushes it, so a non-Friday
  // final bar means "this week, still forming" (same rule as mtfData).
  let end = w.dates.length;
  const lastEnd = w.dates[end - 1];
  if (lastEnd && new Date(lastEnd + "T00:00:00Z").getUTCDay() !== 5) end--;
  if (end < 2) return null;
  return {
    freq,
    keys: w.dates.slice(0, end),
    closes: w.closes.slice(0, end),
    highs: w.highs.slice(0, end),
    lows: w.lows.slice(0, end),
    dailyDates: w.dates.slice(0, end),
  };
}
