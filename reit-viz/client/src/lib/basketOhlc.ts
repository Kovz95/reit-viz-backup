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

/** Basket definition object (as passed by call sites) */
export interface BasketDef {
  name: string;
  tickers: string[];
  weights?: number[];
  [key: string]: any;
}

/** Parallel-arrays result returned by getBasketOhlc */
export interface BasketOhlcResult {
  closes: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  volumes: number[];
  priceDates: string[];
  dates: string[];
  adjCloses: number[];
  dailyIndexMap: Map<string, number>;
  bars?: BasketOhlcBar[];
}

/**
 * Builds a basket definition object synchronously (does NOT fetch data).
 * Returns a BasketDef that can be passed to getBasketOhlc for data fetching.
 * Call sites use: const bkt = buildBasketOhlc(basketTickers, baskets)
 */
export function buildBasketOhlc(
  tickers: string[],
  baskets?: any,
  _opts?: any
): BasketDef {
  const name = Array.isArray(tickers) ? tickers.join("+") : String(tickers);
  return { name, tickers: Array.isArray(tickers) ? tickers : [tickers] };
}

/**
 * Fetches basket OHLCV data from the server.
 * Accepts a BasketDef object (from buildBasketOhlc) and optional dateRange.
 */
export async function getBasketOhlc(
  basket: BasketDef | null | undefined,
  dateRange?: any
): Promise<BasketOhlcResult | null> {
  if (!basket) return null;
  try {
    const body: any = { basket };
    if (dateRange) body.dateRange = dateRange;
    const res = await fetch("/api/basket/ohlc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();

    // Normalise to parallel arrays
    if (Array.isArray(data)) {
      const bars: BasketOhlcBar[] = data;
      const closes = bars.map((b) => b.close);
      const priceDates = bars.map((b) => b.date);
      const dailyIndexMap = new Map<string, number>();
      priceDates.forEach((d, i) => dailyIndexMap.set(d, i));
      return {
        closes,
        highs: bars.map((b) => b.high),
        lows: bars.map((b) => b.low),
        opens: bars.map((b) => b.open),
        volumes: bars.map((b) => b.volume ?? 0),
        priceDates,
        dates: priceDates,
        adjCloses: closes,
        dailyIndexMap,
        bars,
      };
    }

    // Already parallel arrays
    const closes = data.closes ?? [];
    const priceDates = data.priceDates ?? data.dates ?? [];
    const dailyIndexMap = new Map<string, number>();
    priceDates.forEach((d: string, i: number) => dailyIndexMap.set(d, i));
    return {
      closes,
      highs: data.highs ?? closes,
      lows: data.lows ?? closes,
      opens: data.opens ?? closes,
      volumes: data.volumes ?? new Array(closes.length).fill(0),
      priceDates,
      dates: priceDates,
      adjCloses: data.adjCloses ?? closes,
      dailyIndexMap,
    };
  } catch {
    return null;
  }
}
