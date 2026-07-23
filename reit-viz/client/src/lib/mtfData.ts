// Multi-Timeframe Setups — data bundle + alignment maps.
//
// Builds hourly (Yahoo 60m, ≤729 days, raw closes) / daily (adjusted) /
// weekly (Friday-ending, derived from daily) series for one ticker, plus the
// completed-bar alignment maps the MTF engine projects conditions through.
//
// THE correctness rule: a higher-timeframe condition evaluated on a lower-
// timeframe bar may use only COMPLETED higher-TF bars. Today's daily RSI is
// unknowable intra-day and this week's bar is unknowable mid-week — the
// chart-overlay helper fillDailyOntoHourlyAxis uses `<=` (same-day inclusion)
// which is fine for display but LOOKAHEAD for backtests, so these maps use
// strict `<` (hourly→daily/weekly) and exclude trailing partial weekly bars.
//
// UTC-day nuance: hourly bar times are epoch-seconds UTC. A 16:00-ET US close
// is 20/21:00 UTC (same calendar date) and LSE sessions (08:00–16:30 London)
// are also same-UTC-date, so "daily date < hourly bar's UTC date" means "the
// prior completed session" for both venues.

import { fetchIntradayBars, type IntradayBar } from "@/lib/fetchIntradayBars";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { dateOfTimestamp } from "@/lib/chartFrequency";
import type { DataPoint, OhlcBar } from "@/lib/indicators";

export type Timeframe = "H" | "D" | "W";

export interface TfSeries {
  tf: Timeframe;
  /** Bar keys: H = stringified epoch-seconds; D/W = "YYYY-MM-DD". */
  keys: string[];
  /** Close series for DataPoint-based indicators (time === keys[i]). */
  points: DataPoint[];
  /** OHLC bars for bar-based indicators (time === keys[i]). */
  bars: OhlcBar[];
  closes: number[];
}

export interface MtfBundle {
  ticker: string;
  /** null when the symbol has no usable 60m data (page falls back to Daily). */
  hourly: TfSeries | null;
  daily: TfSeries;
  weekly: TfSeries;
  /** Per weekly bar, its end (last daily) date. */
  weeklyEndDates: string[];
  /** Per weekly bar, the daily index of its end bar. */
  weeklyDailyIndexMap: number[];
  /** Does the final weekly bar end on a Friday (i.e. is it complete)? */
  lastWeeklyComplete: boolean;
  /** UTC calendar date per hourly bar. */
  hourlyDates: string[];
  /** Last COMPLETED daily idx per hourly bar (-1 = none yet). */
  hourlyToDaily: Int32Array;
  /** Last COMPLETED weekly idx per hourly bar (-1 = none yet). */
  hourlyToWeekly: Int32Array;
  /** Last USABLE weekly idx per daily bar (-1 = none yet). */
  dailyToWeekly: Int32Array;
}

const MIN_HOURLY_BARS = 250; // below this, hourly analysis is meaningless

function mkTf(tf: Timeframe, keys: string[], opens: number[], highs: number[], lows: number[], closes: number[]): TfSeries {
  const points: DataPoint[] = new Array(keys.length);
  const bars: OhlcBar[] = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    points[i] = { time: keys[i], value: closes[i] };
    bars[i] = { time: keys[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] };
  }
  return { tf, keys, points, bars, closes };
}

export async function buildMtfBundle(ticker: string): Promise<MtfBundle> {
  const [daily0, hourlyBars] = await Promise.all([
    fetchTickerOHLCV(ticker),
    fetchIntradayBars(ticker, "60m", 729).catch(() => [] as IntradayBar[]),
  ]);
  if (!daily0.dates.length) throw new Error(`No daily data for ${ticker}`);

  // Daily on adjusted closes (highs/lows stay unadjusted — they only feed the
  // stochastic, where a small level offset is immaterial for OB/OS states).
  const dCloses = daily0.adjCloses.length === daily0.dates.length ? daily0.adjCloses : daily0.closes;
  const daily = mkTf("D", daily0.dates, daily0.opens, daily0.highs, daily0.lows, dCloses);

  // Weekly derived from the adjusted daily arrays (Friday-ending).
  const w = weeklyDownsample({
    dates: daily0.dates,
    closes: dCloses,
    adjCloses: dCloses,
    highs: daily0.highs,
    lows: daily0.lows,
    opens: daily0.opens,
    volumes: daily0.volumes ?? [],
  });
  const weekly = mkTf("W", w.dates, w.opens, w.highs, w.lows, w.closes);
  const weeklyEndDates = w.dates;
  const weeklyDailyIndexMap = w.dailyIndexMap;
  const lastEnd = weeklyEndDates[weeklyEndDates.length - 1];
  // getUTCDay: 5 = Friday. weeklyDownsample flushes a trailing partial week,
  // so a non-Friday final bar means "this week, still forming".
  const lastWeeklyComplete = !!lastEnd && new Date(lastEnd + "T00:00:00Z").getUTCDay() === 5;

  // Hourly (may be unavailable/thin — Yahoo 60m, raw closes).
  let hourly: TfSeries | null = null;
  let hourlyDates: string[] = [];
  if (hourlyBars.length >= MIN_HOURLY_BARS) {
    const keys = hourlyBars.map((b) => String(b.time));
    hourly = mkTf(
      "H",
      keys,
      hourlyBars.map((b) => b.open),
      hourlyBars.map((b) => b.high),
      hourlyBars.map((b) => b.low),
      hourlyBars.map((b) => b.close),
    );
    hourlyDates = hourlyBars.map((b) => dateOfTimestamp(b.time));
  }

  // ── Alignment maps (completed bars only) ──
  const usableWeeklyLast = lastWeeklyComplete ? weeklyEndDates.length - 1 : weeklyEndDates.length - 2;

  const hourlyToDaily = new Int32Array(hourlyDates.length);
  const hourlyToWeekly = new Int32Array(hourlyDates.length);
  {
    let di = -1;
    let wi = -1;
    for (let h = 0; h < hourlyDates.length; h++) {
      const day = hourlyDates[h];
      while (di + 1 < daily.keys.length && daily.keys[di + 1] < day) di++;
      while (wi + 1 <= usableWeeklyLast && weeklyEndDates[wi + 1] < day) wi++;
      hourlyToDaily[h] = di;
      hourlyToWeekly[h] = wi;
    }
  }

  // Daily→weekly: a weekly bar becomes usable AT its own Friday close (the
  // weekly close IS that day's daily close — matches expandWeeklyToDaily),
  // but a trailing partial week is never usable.
  const dailyToWeekly = new Int32Array(daily.keys.length);
  {
    let wi = -1;
    for (let i = 0; i < daily.keys.length; i++) {
      while (wi + 1 <= usableWeeklyLast && weeklyDailyIndexMap[wi + 1] <= i) wi++;
      dailyToWeekly[i] = wi;
    }
  }

  if (import.meta.env.DEV) {
    // Invariants: maps are non-decreasing; hourly→daily changes only when the
    // bar's UTC date changes (state can flip only at day boundaries).
    for (let h = 1; h < hourlyDates.length; h++) {
      if (hourlyToDaily[h] < hourlyToDaily[h - 1] || hourlyToWeekly[h] < hourlyToWeekly[h - 1]) {
        console.error("[mtfData] alignment map decreased at hourly bar", h);
        break;
      }
      if (hourlyToDaily[h] !== hourlyToDaily[h - 1] && hourlyDates[h] === hourlyDates[h - 1]) {
        console.error("[mtfData] hourlyToDaily changed mid-day at bar", h);
        break;
      }
    }
  }

  return {
    ticker: ticker.toUpperCase(),
    hourly,
    daily,
    weekly,
    weeklyEndDates,
    weeklyDailyIndexMap,
    lastWeeklyComplete,
    hourlyDates,
    hourlyToDaily,
    hourlyToWeekly,
    dailyToWeekly,
  };
}
