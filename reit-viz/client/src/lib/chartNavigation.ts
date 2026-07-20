// Imperative helpers for navigating to the Charts page (with optional
// ticker / pair pre-selection). Delegates to the canonical navigation
// helpers: single tickers go to Charts (#/ + ?ticker=), pairs go to the
// Pairs page with both legs pre-set.

import { navigateToTicker } from "@/lib/navigateToTicker";
import { navigateToPairs } from "@/lib/navigateToPairs";

/** Navigate to the Charts page for a single ticker. */
export function navigateToCharts(ticker: string, _options?: Record<string, any>): void {
  if (!ticker) return;
  navigateToTicker(ticker.toUpperCase());
}

/** Navigate to the Pairs page with a pair of tickers pre-selected. */
export function navigateToChartsWithPair(
  legA: string,
  legB: string,
  options?: Record<string, any>
): void {
  if (!legA || !legB) return;
  navigateToPairs(legA.toUpperCase(), legB.toUpperCase(), options?.metric);
}
