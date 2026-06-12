// Hand-written from call-site inference (LevelsAndTrendlines.tsx, PairRatios.tsx)

import type { OHLCVBar, OHLCVResult } from "@/lib/fetchTickerOHLCV";

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

export interface SlicedResult {
  dates: string[];
  closes: number[];
  adjCloses: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  volumes: number[];
  dailyIndexMap: Map<string, number>;
  bars?: OHLCVBar[];
}

/**
 * Filters an OHLCV result (or OHLCVBar[]) to those whose `date` falls within [range.start, range.end].
 * Returns a parallel-arrays result object.
 */
export function sliceDateRange(
  input: OHLCVBar[] | OHLCVResult | any,
  range: DateRange | any
): SlicedResult {
  const startStr = range?.start instanceof Date
    ? range.start.toISOString().slice(0, 10)
    : typeof range?.start === "string" ? range.start : null;
  const endStr = range?.end instanceof Date
    ? range.end.toISOString().slice(0, 10)
    : typeof range?.end === "string" ? range.end : null;

  let dates: string[] = [];
  let closes: number[] = [];
  let adjCloses: number[] = [];
  let highs: number[] = [];
  let lows: number[] = [];
  let opens: number[] = [];
  let volumes: number[] = [];
  let bars: OHLCVBar[] | undefined;

  if (Array.isArray(input)) {
    const barArr = input as OHLCVBar[];
    dates = barArr.map((b) => b.date);
    closes = barArr.map((b) => b.close);
    adjCloses = closes;
    highs = barArr.map((b) => b.high);
    lows = barArr.map((b) => b.low);
    opens = barArr.map((b) => b.open);
    volumes = barArr.map((b) => b.volume ?? 0);
    bars = barArr;
  } else if (input && typeof input === "object" && input.dates) {
    dates = input.dates;
    closes = input.closes ?? [];
    adjCloses = input.adjCloses ?? closes;
    highs = input.highs ?? closes;
    lows = input.lows ?? closes;
    opens = input.opens ?? closes;
    volumes = input.volumes ?? new Array(closes.length).fill(0);
    bars = input.bars;
  }

  const mask: boolean[] = dates.map((d) => {
    if (startStr && d < startStr) return false;
    if (endStr && d > endStr) return false;
    return true;
  });

  const fDates = dates.filter((_, i) => mask[i]);
  const fCloses = closes.filter((_, i) => mask[i]);
  const fAdjCloses = adjCloses.filter((_, i) => mask[i]);
  const fHighs = highs.filter((_, i) => mask[i]);
  const fLows = lows.filter((_, i) => mask[i]);
  const fOpens = opens.filter((_, i) => mask[i]);
  const fVolumes = volumes.filter((_, i) => mask[i]);
  const fBars = bars ? bars.filter((_, i) => mask[i]) : undefined;

  const dailyIndexMap = new Map<string, number>();
  fDates.forEach((d, i) => dailyIndexMap.set(d, i));

  return {
    dates: fDates,
    closes: fCloses,
    adjCloses: fAdjCloses,
    highs: fHighs,
    lows: fLows,
    opens: fOpens,
    volumes: fVolumes,
    dailyIndexMap,
    bars: fBars,
  };
}
