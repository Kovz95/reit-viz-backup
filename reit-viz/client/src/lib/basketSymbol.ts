// Stub — TODO: reverse-engineer from production bundle
// Basket symbols are special ticker strings prefixed to distinguish them from
// normal equity tickers (e.g. "basket:uuid").

const BASKET_PREFIX = "basket:";

/** Parse a basket symbol string into its component id (returns the id string). */
export function parseBasketSymbol(symbol: string): string {
  // Stub — TODO: reverse-engineer from production bundle
  return symbol.startsWith(BASKET_PREFIX) ? symbol.slice(BASKET_PREFIX.length) : symbol;
}

/** Return true if the symbol represents a basket (not a plain ticker). */
export function isBasketSymbol(symbol: string): boolean {
  // Stub — TODO: reverse-engineer from production bundle
  return symbol.startsWith(BASKET_PREFIX);
}
