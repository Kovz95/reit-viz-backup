// Hand-written stub — basketOhlc: builds and caches basket-level OHLCV data
// by combining individual ticker OHLCV series with basket weights.

import { computeStaticBasketWeights, type WeightableBasket } from "@/lib/basketWeights";

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
 *
 * When the 2nd arg is a single basket object (has a `weighting`) — or opts
 * carry one — its weighting config rides along on the def so getBasketOhlc can
 * weight the price index by the configured scheme. Call sites that pass the
 * whole baskets LIST (the optimizers' plain ticker unions) keep equal weights.
 */
export function buildBasketOhlc(
  tickers: string[],
  basketOrList?: any,
  opts?: any
): BasketDef {
  const name = Array.isArray(tickers) ? tickers.join("+") : String(tickers);
  const def: BasketDef = { name, tickers: Array.isArray(tickers) ? tickers : [tickers] };
  const src =
    basketOrList && !Array.isArray(basketOrList) && typeof basketOrList === "object" && "weighting" in basketOrList
      ? basketOrList
      : undefined;
  for (const key of ["weighting", "customWeights", "volLookback", "fmpHistCapsSnapshot", "yahooCapSnapshot"]) {
    const v = opts?.[key] ?? src?.[key];
    if (v !== undefined) (def as any)[key] = v;
  }
  return def;
}

/** Resolve the def's static weights (ordered like def.tickers) per its
 *  weighting scheme; null → equal weight (server default). */
async function resolveDefWeights(basket: BasketDef): Promise<number[] | null> {
  if (Array.isArray(basket.weights) && basket.weights.length === basket.tickers.length) {
    return basket.weights;
  }
  const weighting = (basket as WeightableBasket).weighting;
  if (!weighting || weighting === "equal" || basket.tickers.length === 0) return null;
  try {
    const { weights } = await computeStaticBasketWeights(basket as WeightableBasket);
    const arr = basket.tickers.map((t) => weights[t] ?? weights[t.toUpperCase()] ?? 0);
    return arr.some((w) => w > 0) ? arr : null;
  } catch {
    return null; // fall back to the server's equal weighting
  }
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
    const weights = await resolveDefWeights(basket);
    const body: any = { basket: weights ? { ...basket, weights } : basket };
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
