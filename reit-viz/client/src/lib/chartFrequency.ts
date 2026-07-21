// Frequency transforms for the Charts page (chartConfig.frequency).
//
// Pane time-axis sync is LOGICAL-RANGE based, so every pane must keep the same
// bar density:
//  - weekly/monthly: every pane's series + OHLC are downsampled to period bars
//    (last value / OHLC aggregate, stamped with the period's last trading date —
//    times stay "YYYY-MM-DD" strings, so nothing else changes).
//  - hourly: every pane rides the SAME hourly epoch-second axis (the active
//    ticker's intraday bars). The price series/candles use real hourly data;
//    daily metric series are forward-filled onto the hourly axis (one step per
//    day — "daily RSI under hourly price").

import type { IntradayBar } from "@/lib/fetchIntradayBars";

export type ChartFrequency = "hourly" | "daily" | "weekly" | "monthly";

export const CHART_FREQUENCIES: { key: ChartFrequency; label: string }[] = [
  { key: "hourly", label: "1H" },
  { key: "daily", label: "D" },
  { key: "weekly", label: "W" },
  { key: "monthly", label: "M" },
];

type TimeValue = { time: string; value: number; [key: string]: any };
type OhlcBar = { time: string; open: number; high: number; low: number; close: number; [key: string]: any };

// ── Period keys ──────────────────────────────────────────────────────────────

function periodKey(date: string, freq: "weekly" | "monthly"): string {
  if (freq === "monthly") return date.slice(0, 7);
  // ISO week key
  const dt = new Date(date + "T00:00:00Z");
  const tmp = new Date(dt);
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${week}`;
}

// ── Weekly / monthly downsampling ────────────────────────────────────────────

/** Last value per period, stamped with the period's last date. */
export function downsampleSeries(data: TimeValue[], freq: "weekly" | "monthly"): TimeValue[] {
  if (!Array.isArray(data) || data.length === 0) return data ?? [];
  const out: TimeValue[] = [];
  let curKey = "";
  for (const pt of data) {
    if (!pt || typeof pt.time !== "string") continue;
    const k = periodKey(pt.time, freq);
    if (k === curKey && out.length) out[out.length - 1] = pt;
    else {
      out.push(pt);
      curKey = k;
    }
  }
  return out;
}

/** OHLC aggregate per period (first open, max high, min low, last close). */
export function downsampleOhlc(bars: OhlcBar[], freq: "weekly" | "monthly"): OhlcBar[] {
  if (!Array.isArray(bars) || bars.length === 0) return bars ?? [];
  const out: OhlcBar[] = [];
  let curKey = "";
  for (const b of bars) {
    if (!b || typeof b.time !== "string") continue;
    const k = periodKey(b.time, freq);
    if (k === curKey && out.length) {
      const agg = out[out.length - 1];
      out[out.length - 1] = {
        ...agg,
        time: b.time,
        high: Math.max(agg.high, b.high),
        low: Math.min(agg.low, b.low),
        close: b.close,
      };
    } else {
      out.push({ ...b });
      curKey = k;
    }
  }
  return out;
}

// ── Hourly transforms ────────────────────────────────────────────────────────

/** UTC date string of an epoch-second bar time. */
export function dateOfTimestamp(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** Intraday bars → candlestick data (epoch-second times, typed loosely for LWC). */
export function intradayToOhlc(bars: IntradayBar[]): any[] {
  return bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
}

/** Intraday bars → close line series. */
export function intradayToLine(bars: IntradayBar[]): any[] {
  return bars.map((b) => ({ time: b.time, value: b.close }));
}

/**
 * Forward-fill a daily {time,value} series onto the hourly axis: each hourly
 * bar takes the value of the latest daily point whose date ≤ the bar's date.
 * Points before the first daily value are omitted.
 */
export function fillDailyOntoHourlyAxis(daily: TimeValue[], axis: IntradayBar[]): any[] {
  if (!Array.isArray(daily) || daily.length === 0 || !axis?.length) return [];
  const pts = daily
    .filter((p) => p && typeof p.time === "string" && Number.isFinite(p.value))
    .sort((a, b) => a.time.localeCompare(b.time));
  if (!pts.length) return [];
  const out: any[] = [];
  let i = 0;
  let cur: number | null = null;
  for (const bar of axis) {
    const d = dateOfTimestamp(bar.time);
    while (i < pts.length && pts[i].time <= d) {
      cur = pts[i].value;
      i++;
    }
    if (cur != null) out.push({ time: bar.time, value: cur });
  }
  return out;
}

/**
 * Align another ticker's intraday closes onto the canonical hourly axis
 * (timestamp match, forward-filled through gaps).
 */
export function alignIntradayToAxis(bars: IntradayBar[], axis: IntradayBar[]): any[] {
  if (!bars?.length || !axis?.length) return [];
  const map = new Map<number, number>();
  for (const b of bars) map.set(b.time, b.close);
  const out: any[] = [];
  let cur: number | null = null;
  for (const a of axis) {
    const v = map.get(a.time);
    if (v != null) cur = v;
    if (cur != null) out.push({ time: a.time, value: cur });
  }
  return out;
}

// ── Vertical-line date helpers ───────────────────────────────────────────────

/** Snap "YYYY-MM-DD" dates to the first axis date ≥ each (weekly/monthly). */
export function snapDatesToAxisDates(dates: string[], axisDates: string[]): string[] {
  if (!dates?.length || !axisDates?.length) return [];
  const out: string[] = [];
  for (const d of dates) {
    let lo = 0;
    let hi = axisDates.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (axisDates[mid] >= d) { ans = mid; hi = mid - 1; }
      else lo = mid + 1;
    }
    if (ans >= 0) out.push(axisDates[ans]);
  }
  return [...new Set(out)];
}

/** Map dates to each date's first hourly bar timestamp (as any, for LWC). */
export function datesToAxisTimestamps(dates: string[], axis: IntradayBar[]): any[] {
  if (!dates?.length || !axis?.length) return [];
  const firstOfDay = new Map<string, number>();
  for (const b of axis) {
    const d = dateOfTimestamp(b.time);
    if (!firstOfDay.has(d)) firstOfDay.set(d, b.time);
  }
  const out: any[] = [];
  for (const d of dates) {
    const ts = firstOfDay.get(d);
    if (ts != null) out.push(ts);
  }
  return out;
}
