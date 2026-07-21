// Shared basket weight computation — extracted from BasketMetricInspector so
// the basket PRICE pipeline (basketOhlc → /api/basket/ohlc) can weight the
// index by the basket's configured scheme instead of always equal-weighting.
// The inspector and the price path now share one implementation.
//
// Weights are a STATIC snapshot (today's caps / prices / vol) applied across
// the whole index history — i.e. initial weights of a buy-and-hold portfolio.
// (Bundle helpers Od/dd/bY/wY/ug.)

import { fetchMetricSeries, type MetricSeriesPoint } from "@/lib/fetchMetricSeries";

export type MetricFetcher = (ticker: string, metric: string) => Promise<MetricSeriesPoint[]>;

export interface WeightableBasket {
  tickers: string[];
  weighting?: string;
  customWeights?: Record<string, number>;
  volLookback?: number;
  fmpHistCapsSnapshot?: { series?: Record<string, { date: string; marketCap: number }[]> };
  yahooCapSnapshot?: { caps?: Record<string, number> };
  [key: string]: unknown;
}

export interface BasketWeightsResult {
  weights: Record<string, number>;
  usingEqualWeight: boolean;
}

/** Normalize a raw weight map to sum to 1 (equal-weight fallback when total ≤ 0). */
export function normalizeWeights(raw: Record<string, number>): Record<string, number> {
  const keys = Object.keys(raw);
  if (keys.length === 0) return {};
  const total = keys.reduce((acc, key) => acc + (raw[key] || 0), 0);
  if (total <= 0) {
    const equal = 1 / keys.length;
    return Object.fromEntries(keys.map((key) => [key, equal]));
  }
  return Object.fromEntries(keys.map((key) => [key, (raw[key] || 0) / total]));
}

// Population standard deviation.
function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Resolve a single ticker's market cap (bundle wY) via the metric fetcher. */
export async function fetchMarketCap(
  ticker: string,
  fetcher: MetricFetcher,
): Promise<number | null> {
  const sources = [
    "Fund: Market Cap",
    "Market Cap",
    "Fund: Enterprise Value",
    "Enterprise Value",
  ];
  for (const source of sources) {
    try {
      const series = await fetcher(ticker, source);
      if (series.length > 0) {
        const latest = series[series.length - 1].value;
        if (latest > 0 && isFinite(latest)) return latest;
      }
    } catch {
      // try next source
    }
  }
  return null;
}

/** Compute basket weights (bundle ug). `closeSeriesByTicker` provides per-ticker
 *  close series for price/inverse-vol schemes; `fetcher` is used for market-cap
 *  lookups. */
export async function computeBasketWeights(
  basket: WeightableBasket,
  closeSeriesByTicker: Record<string, MetricSeriesPoint[]>,
  fetcher: MetricFetcher,
): Promise<BasketWeightsResult> {
  const weighting = basket.weighting ?? "market_cap";
  const volLookback = basket.volLookback ?? 60;
  const customWeights = basket.customWeights ?? {};
  const tickers = basket.tickers;

  if (tickers.length === 0) return { weights: {}, usingEqualWeight: false };

  if (weighting === "equal") {
    const equal = 1 / tickers.length;
    return {
      weights: Object.fromEntries(tickers.map((t) => [t, equal])),
      usingEqualWeight: false,
    };
  }

  if (weighting === "price") {
    const raw: Record<string, number> = {};
    for (const ticker of tickers) {
      const series = closeSeriesByTicker[ticker];
      raw[ticker] = series && series.length > 0 ? series[series.length - 1].value : 1;
    }
    return { weights: normalizeWeights(raw), usingEqualWeight: false };
  }

  if (weighting === "custom") {
    const raw: Record<string, number> = {};
    for (const ticker of tickers) {
      raw[ticker] = customWeights[ticker] ?? 1 / tickers.length;
    }
    return { weights: normalizeWeights(raw), usingEqualWeight: false };
  }

  if (weighting === "fmp_cap_daily") {
    const snapshot = basket.fmpHistCapsSnapshot;
    if (!snapshot || !snapshot.series) {
      const equal = 1 / tickers.length;
      return {
        weights: Object.fromEntries(tickers.map((t) => [t, equal])),
        usingEqualWeight: true,
      };
    }
    const raw: Record<string, number> = {};
    for (const ticker of tickers) {
      const series = snapshot.series[ticker.toUpperCase()] || [];
      const cap = series.length ? series[series.length - 1].marketCap : 0;
      raw[ticker] = cap > 0 ? cap : 0;
    }
    if (Object.values(raw).reduce((acc, v) => acc + v, 0) <= 0) {
      const equal = 1 / tickers.length;
      return {
        weights: Object.fromEntries(tickers.map((t) => [t, equal])),
        usingEqualWeight: true,
      };
    }
    return { weights: normalizeWeights(raw), usingEqualWeight: false };
  }

  if (weighting === "yahoo_cap") {
    const snapshot = basket.yahooCapSnapshot;
    if (!snapshot || !snapshot.caps || Object.keys(snapshot.caps).length === 0) {
      const equal = 1 / tickers.length;
      return {
        weights: Object.fromEntries(tickers.map((t) => [t, equal])),
        usingEqualWeight: true,
      };
    }
    const raw: Record<string, number> = {};
    const missing: string[] = [];
    for (const ticker of tickers) {
      const cap = snapshot.caps[ticker];
      if (cap && cap > 0) {
        raw[ticker] = cap;
      } else {
        missing.push(ticker);
        raw[ticker] = 0;
      }
    }
    if (missing.length > 0) {
      console.warn(
        `[basketSeries] yahoo_cap: missing caps for ${missing.join(", ")} — excluded from weights`,
      );
    }
    if (Object.values(raw).reduce((acc, v) => acc + v, 0) <= 0) {
      const equal = 1 / tickers.length;
      return {
        weights: Object.fromEntries(tickers.map((t) => [t, equal])),
        usingEqualWeight: true,
      };
    }
    return { weights: normalizeWeights(raw), usingEqualWeight: false };
  }

  if (weighting === "inverse_vol") {
    const lookback = volLookback;
    const raw: Record<string, number> = {};
    for (const ticker of tickers) {
      const series = closeSeriesByTicker[ticker];
      if (!series || series.length < 2) {
        raw[ticker] = 1;
        continue;
      }
      const window = series.slice(Math.max(0, series.length - lookback));
      const returns: number[] = [];
      for (let i = 1; i < window.length; i++) {
        if (window[i - 1].value > 0) {
          returns.push(Math.log(window[i].value / window[i - 1].value));
        }
      }
      const vol = stdev(returns);
      raw[ticker] = vol > 0 ? 1 / vol : 1;
    }
    return { weights: normalizeWeights(raw), usingEqualWeight: false };
  }

  // Default: market_cap (resolved live via the metric fetcher).
  const raw: Record<string, number> = {};
  let missing = false;
  await Promise.all(
    tickers.map(async (ticker) => {
      const cap = await fetchMarketCap(ticker, fetcher);
      if (cap !== null) {
        raw[ticker] = cap;
      } else {
        missing = true;
        raw[ticker] = 0;
      }
    }),
  );
  if (Object.values(raw).reduce((acc, v) => acc + v, 0) <= 0 || missing) {
    const equal = 1 / tickers.length;
    return {
      weights: Object.fromEntries(tickers.map((t) => [t, equal])),
      usingEqualWeight: true,
    };
  }
  return { weights: normalizeWeights(raw), usingEqualWeight: false };
}

/** Convenience wrapper: computes the weights with the default metric fetcher,
 *  fetching per-ticker close series only when the scheme needs them. */
export async function computeStaticBasketWeights(
  basket: WeightableBasket,
): Promise<BasketWeightsResult> {
  const weighting = basket.weighting ?? "market_cap";
  let closeSeriesByTicker: Record<string, MetricSeriesPoint[]> = {};
  if (weighting === "price" || weighting === "inverse_vol") {
    const entries = await Promise.all(
      basket.tickers.map(async (t) => {
        try {
          return [t, await fetchMetricSeries(t, "close")] as const;
        } catch {
          return [t, []] as const;
        }
      }),
    );
    closeSeriesByTicker = Object.fromEntries(entries);
  }
  return computeBasketWeights(basket, closeSeriesByTicker, fetchMetricSeries);
}
