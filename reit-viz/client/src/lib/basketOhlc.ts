// Hand-written stub — basketOhlc: builds and caches basket-level OHLCV data
// by combining individual ticker OHLCV series with basket weights.

export interface BasketOhlcBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Builds a basket OHLCV series from a basket definition.
 * Returns null if data cannot be assembled.
 */
export async function buildBasketOhlc(
  basket: any,
  fetchFn?: (ticker: string) => Promise<any>
): Promise<BasketOhlcBar[] | null> {
  try {
    const res = await fetch("/api/basket/ohlc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basket }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Returns a cached basket OHLCV series or null.
 * The cache is maintained server-side; this just fetches it.
 */
export async function getBasketOhlc(
  basketId: string
): Promise<BasketOhlcBar[] | null> {
  try {
    const res = await fetch(`/api/basket/ohlc/${encodeURIComponent(basketId)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
