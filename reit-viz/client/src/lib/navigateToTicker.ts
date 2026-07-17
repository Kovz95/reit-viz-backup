// Hand-written from call-site inference
// navigateToTicker: navigates to the charts/dashboard page for a single ticker.
// (navigateToPairs lives in @/lib/navigateToPairs — it pushes pair state and
//  navigates to a clean "#/pairs"; don't reintroduce a URL-query variant here.)

/** Navigates to the dashboard/charts page for a given ticker symbol.
 *  The Charts page (Dashboard) reads the ticker from the real query string
 *  (window.location.search), and the hash router matches on the hash path — so
 *  the symbol goes in searchParams and the hash stays a clean "#/" (mirrors
 *  Ranking's navigateToChart). Putting the param in the hash query instead
 *  (`#/?ticker=…`) both hides it from Dashboard AND makes the routed path
 *  "/?ticker=…" match no route → 404. */
export function navigateToTicker(ticker: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("ticker", ticker);
  url.hash = "#/";
  window.location.href = url.toString();
}
