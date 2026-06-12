// Hand-written from call-site inference
// navigateToTicker: navigates to the charts/dashboard page for a single ticker.
// navigateToPairs: convenience wrapper.
// sendAutoTrendlineToCharts: posts a trendline payload to the charts page session.

/** Navigates to the dashboard/charts page for a given ticker symbol. */
export function navigateToTicker(ticker: string): void {
  if (typeof window === "undefined") return;
  window.location.hash = `#/?ticker=${encodeURIComponent(ticker)}`;
}

/** Navigates to the pairs page with tickerA and tickerB. */
export function navigateToPairs(tickerA: string, tickerB: string, metric?: string): void {
  if (typeof window === "undefined") return;
  window.location.hash = `#/pairs?a=${encodeURIComponent(tickerA)}&b=${encodeURIComponent(tickerB)}${metric ? `&metric=${encodeURIComponent(metric)}` : ""}`;
}
