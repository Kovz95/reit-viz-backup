// Hand-written from call-site inference (BasketTickerPill.tsx, BasketPicker.tsx)
// Basket ticker prefix confirmed as "BASKET:" from production bundle (index-CsG73Aq_.js)

const BASKET_PREFIX = "BASKET:";

/**
 * Returns true if the given ticker string is a basket reference (starts with "BASKET:").
 */
export function isBasketTicker(ticker: string): boolean {
  return ticker.startsWith(BASKET_PREFIX);
}

/**
 * Extracts the basket ID from a basket-ticker string like "BASKET:<id>".
 * Returns null if the ticker is not a basket reference.
 */
export function extractBasketId(ticker: string): string | null {
  if (!isBasketTicker(ticker)) return null;
  const id = ticker.slice(BASKET_PREFIX.length);
  return id.length > 0 ? id : null;
}

/**
 * Uppercases all tickers, deduplicates (case-insensitive), and caps the result at 50 entries.
 */
export function dedupeUpperTickers(tickers: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tickers) {
    if (typeof t !== "string") continue;
    const upper = t.trim().toUpperCase();
    if (!upper || seen.has(upper)) continue;
    seen.add(upper);
    result.push(upper);
    if (result.length >= 50) break;
  }
  return result;
}
