// Basket symbols are special ticker strings prefixed with "BASKET:" to
// distinguish them from normal equity tickers (e.g. "BASKET:<uuid>").
// Same semantics as lib/basketUtils isBasketTicker/extractBasketId
// (case-insensitive prefix check, confirmed from the production bundle).

const BASKET_PREFIX = "BASKET:";

/** Return true if the symbol represents a basket (not a plain ticker). */
export function isBasketSymbol(symbol: string): boolean {
  return !!symbol && symbol.toUpperCase().startsWith(BASKET_PREFIX);
}

/** Parse a basket symbol string into its component id (returns the id string). */
export function parseBasketSymbol(symbol: string): string {
  return isBasketSymbol(symbol) ? symbol.slice(BASKET_PREFIX.length) : symbol;
}
