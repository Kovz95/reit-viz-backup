// Size-weighted basket aggregation used by PremiumDiscount / ChartsPdSubplots.
//
// The workbook has no market-cap series, so "cap-weighted" uses the
// per-date "Enterprise Value" metric as the size proxy, falling back to
// equal weights on dates where no member has EV data.

import { getMetricSeries } from "@/lib/dataService";

export interface WeightedSeries {
  series: any[];
  dates: string[];
  values: number[];
  [key: string]: any;
}

export type Basket = string[] | { tickers: string[]; [key: string]: any } | any;

const SIZE_METRIC = "Enterprise Value";

type Point = { time: string; value: number };
type GetVal = (ticker: string, metric: string) => Promise<Point[] | any[]>;

function basketTickers(basket: Basket): string[] {
  if (Array.isArray(basket)) return basket.filter((t) => typeof t === "string");
  return Array.isArray(basket?.tickers) ? basket.tickers : [];
}

function toMap(pts: any[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pts ?? []) {
    if (p && typeof p.time === "string" && Number.isFinite(p.value)) m.set(p.time, p.value);
  }
  return m;
}

async function loadMaps(tickers: string[], metric: string, getVal: GetVal): Promise<Map<string, number>[]> {
  return Promise.all(
    tickers.map(async (t) => {
      try { return toMap(await getVal(t, metric)); } catch { return new Map<string, number>(); }
    })
  );
}

async function weightedAggregate(
  tickers: string[],
  valueMaps: Map<string, number>[],
  sizeMaps: Map<string, number>[]
): Promise<WeightedSeries> {
  const dateSet = new Set<string>();
  for (const m of valueMaps) for (const t of m.keys()) dateSet.add(t);
  const dates = Array.from(dateSet).sort();

  const series: Point[] = [];
  for (const d of dates) {
    let wSum = 0;
    let vSum = 0;
    let n = 0;
    let eqSum = 0;
    for (let i = 0; i < tickers.length; i++) {
      const v = valueMaps[i].get(d);
      if (v === undefined) continue;
      n++;
      eqSum += v;
      const w = sizeMaps[i]?.get(d);
      if (w !== undefined && w > 0) { wSum += w; vSum += v * w; }
    }
    if (n === 0) continue;
    // Size-weighted when any member has a size value on this date, else equal.
    const value = wSum > 0 ? vSum / wSum : eqSum / n;
    if (Number.isFinite(value)) series.push({ time: d, value });
  }

  return { series, dates: series.map((p) => p.time), values: series.map((p) => p.value) };
}

/**
 * Size-weighted (EV-proxy) series of `metric` for a basket of tickers.
 * `getVal(ticker, metric)` supplies each member's {time,value}[] series.
 */
export async function getCapWeightedBasketSeries(
  basket: Basket,
  metricKey?: string,
  getVal?: GetVal,
  _options?: Record<string, any>
): Promise<WeightedSeries> {
  const tickers = basketTickers(basket);
  const fetcher: GetVal = getVal ?? ((t, m) => getMetricSeries(t, m));
  if (!tickers.length || !metricKey) return { series: [], dates: [], values: [] };
  const [valueMaps, sizeMaps] = await Promise.all([
    loadMaps(tickers, metricKey, fetcher),
    loadMaps(tickers, SIZE_METRIC, (t, m) => getMetricSeries(t, m)),
  ]);
  return weightedAggregate(tickers, valueMaps, sizeMaps);
}

/**
 * Size-weighted price index for a basket. Each member's closes are rebased to
 * its first value so the weighting acts on relative performance, then the
 * result is returned as a {time,value}[] array (call sites assign it straight
 * to a closes-series state).
 */
export async function getCapWeightedPriceSeries(
  basket: Basket,
  getCloseSeriesFn?: GetVal | Record<string, any>,
  _extra1?: any,
  _extra2?: any,
  _extra3?: any
): Promise<any> {
  const tickers = basketTickers(basket);
  if (!tickers.length) return [];
  const fetchClose: GetVal =
    typeof getCloseSeriesFn === "function"
      ? (getCloseSeriesFn as GetVal)
      : (t) => getMetricSeries(t, "close");

  const [rawMaps, sizeMaps] = await Promise.all([
    loadMaps(tickers, "close", fetchClose),
    loadMaps(tickers, SIZE_METRIC, (t, m) => getMetricSeries(t, m)),
  ]);

  // Rebase each member to its first positive close.
  const rebased = rawMaps.map((m) => {
    const entries = Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const first = entries.find(([, v]) => v > 0);
    const out = new Map<string, number>();
    if (!first) return out;
    for (const [t, v] of entries) if (v > 0) out.set(t, v / first[1]);
    return out;
  });

  const agg = await weightedAggregate(tickers, rebased, sizeMaps);
  return agg.series;
}
