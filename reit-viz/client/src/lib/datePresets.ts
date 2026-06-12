// Hand-written from call-site inference (LevelsAndTrendlines.tsx, PairRatios.tsx)

import type { OHLCVBar } from "@/lib/fetchTickerOHLCV";

export interface DatePreset {
  label: string;
  key: string;
  days: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export const DATE_PRESETS: DatePreset[] = [
  { label: "3 mo",  key: "3m",  days: 63  },
  { label: "6 mo",  key: "6m",  days: 126 },
  { label: "1 yr",  key: "1y",  days: 252 },
  { label: "2 yr",  key: "2y",  days: 504 },
  { label: "3 yr",  key: "3y",  days: 756 },
  { label: "5 yr",  key: "5y",  days: 1260 },
  { label: "10 yr", key: "10y", days: 2520 },
];

/**
 * Returns a `{ start, end }` range for a named preset.
 * `end` is today; `start` is `days` trading days back (approximated as calendar days).
 */
export function getDateRangeFromPreset(preset: string): DateRange {
  const p = DATE_PRESETS.find((d) => d.key === preset);
  const calendarDays = p ? Math.round(p.days * (365.25 / 252)) : 365;

  const end = new Date();
  const start = new Date(end.getTime() - calendarDays * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Filters an array of OHLCV bars to those whose `date` falls within [range.start, range.end].
 */
export function sliceDateRange(bars: OHLCVBar[], range: DateRange): OHLCVBar[] {
  const startStr = range.start.toISOString().slice(0, 10);
  const endStr = range.end.toISOString().slice(0, 10);
  return bars.filter((b) => b.date >= startStr && b.date <= endStr);
}
