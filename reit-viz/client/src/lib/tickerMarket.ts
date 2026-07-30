// Market of a ticker inferred from its suffix: "-GB" = UK, ".HK" = Hong Kong,
// "-XX"/".XX" = that 2–3 letter code; otherwise US. A pair whose two legs sit in
// different markets is "cross-calendar" — the close series come off different
// holiday calendars / session times, so any statistic built on their joined ratio
// (mean-reversion half-life, return-distribution tails, …) is non-synchronous and
// unreliable.
export function marketOf(ticker: string): string {
  const m = ticker.match(/[.\-]([A-Z]{2,3})$/);
  return m ? m[1] : "US";
}

/** True when the two legs trade on different market calendars. */
export function isCrossCalendar(a: string, b: string): boolean {
  return marketOf(a) !== marketOf(b);
}
