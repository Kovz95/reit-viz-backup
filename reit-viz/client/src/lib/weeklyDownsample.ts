// Hand-written from call-site inference
// weeklyDownsample: collapses daily OHLCV bars into weekly Friday-ending bars.

import type { OHLCVBar } from "@/lib/fetchTickerOHLCV";

export { OHLCVBar };

/**
 * Down-samples an array of daily OHLCV bars into weekly bars ending on Friday
 * (or the last trading day of the week when Friday is missing).
 */
export function weeklyDownsample(bars: OHLCVBar[]): OHLCVBar[] {
  if (!bars || bars.length === 0) return [];

  const result: OHLCVBar[] = [];
  let weekBars: OHLCVBar[] = [];

  function flush() {
    if (weekBars.length === 0) return;
    const last = weekBars[weekBars.length - 1];
    result.push({
      date: last.date,
      open: weekBars[0].open,
      high: Math.max(...weekBars.map((b) => b.high)),
      low: Math.min(...weekBars.map((b) => b.low)),
      close: last.close,
      volume: weekBars.reduce((s, b) => s + (b.volume ?? 0), 0),
    });
    weekBars = [];
  }

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    weekBars.push(bar);

    const d = new Date(bar.date + "T00:00:00Z");
    const dow = d.getUTCDay(); // 0=Sun, 5=Fri

    const isLastBar = i === bars.length - 1;
    const isFriday = dow === 5;

    // Flush at Friday or when the next bar belongs to a new ISO week
    if (isFriday || isLastBar) {
      flush();
    } else if (i < bars.length - 1) {
      const nextD = new Date(bars[i + 1].date + "T00:00:00Z");
      // New week starts if next bar's Sunday differs
      const currSunday = new Date(d);
      currSunday.setUTCDate(d.getUTCDate() + (7 - dow) % 7);
      const nextSunday = new Date(nextD);
      nextSunday.setUTCDate(nextD.getUTCDate() + (7 - nextD.getUTCDay()) % 7);
      if (currSunday.getTime() !== nextSunday.getTime()) {
        flush();
      }
    }
  }

  return result;
}
