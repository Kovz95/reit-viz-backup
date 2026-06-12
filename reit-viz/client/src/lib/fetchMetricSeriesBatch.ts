/**
 * fetchMetricSeriesBatch — thin adapter over dataService.getMetricSeries() + getTickers().
 *
 * Supports two calling modes:
 *
 * 1. **Single-metric mode** — `fetchMetricSeriesBatch(metricKey, minBars?)`
 *    When the first argument is a string, fetches that one metric for ALL tickers
 *    returned by getTickers(). Optionally filters out tickers whose series has
 *    fewer than `minBars` non-null values.
 *
 * 2. **Batch mode** — `fetchMetricSeriesBatch(tickers[], metricKeys[], options?)`
 *    Fetches every (ticker, metricKey) pair and returns a flat array of rows.
 *
 * Both modes use Promise.all for concurrency and return the same row shape.
 * Name/sector/subindustry metadata comes from getTickers().
 */

import { getTickers, getMetricSeries } from "@/lib/dataService";

export interface MetricSeriesBatchResult {
  ticker: string;
  name: string;
  sector: string;
  subindustry: string;
  metricKey: string;
  dates: string[];
  values: (number | null)[];
}

/**
 * Fetch multiple metric series for multiple tickers in a single batched call.
 *
 * @param tickersOrMetric
 *   - `string`   → single-metric mode: fetch this metric for ALL tickers.
 *   - `string[]` → batch mode: list of ticker symbols.
 *
 * @param metricKeysOrMinBars
 *   - In single-metric mode: optional `number` — minimum non-null bars required
 *     to include a row (rows with fewer values are omitted).
 *   - In batch mode: `string[]` — list of metric keys to fetch for each ticker.
 *
 * @param _options - Reserved for future use (ignored).
 *
 * @returns Flat array of MetricSeriesBatchResult, one row per (ticker, metricKey).
 */
export default async function fetchMetricSeriesBatch(
  tickersOrMetric: string[] | string,
  metricKeysOrMinBars?: string[] | number,
  _options?: Record<string, any>
): Promise<MetricSeriesBatchResult[]> {
  // Fetch ticker metadata once — needed in both modes for name/sector/subindustry
  const tickersMeta = await getTickers();
  const metaByTicker = new Map(tickersMeta.map((t) => [t.ticker.toUpperCase(), t]));

  // ── Single-metric mode ────────────────────────────────────────────────────
  if (typeof tickersOrMetric === "string") {
    const metricKey = tickersOrMetric;
    const minBars = typeof metricKeysOrMinBars === "number" ? metricKeysOrMinBars : 0;

    const rows = await Promise.all(
      tickersMeta.map(async (meta): Promise<MetricSeriesBatchResult | null> => {
        try {
          const series = await getMetricSeries(meta.ticker, metricKey);
          if (series.length < minBars) return null;

          return {
            ticker: meta.ticker,
            name: meta.name,
            sector: meta.sector ?? "",
            subindustry: meta.subindustry ?? "",
            metricKey,
            dates: series.map((p) => p.time),
            values: series.map((p) => p.value),
          };
        } catch {
          return null;
        }
      })
    );

    return rows.filter((r): r is MetricSeriesBatchResult => r !== null);
  }

  // ── Batch mode ────────────────────────────────────────────────────────────
  const tickers = tickersOrMetric;
  const metricKeys = Array.isArray(metricKeysOrMinBars) ? metricKeysOrMinBars : [];

  const pairs: Array<{ ticker: string; metricKey: string }> = [];
  for (const ticker of tickers) {
    for (const metricKey of metricKeys) {
      pairs.push({ ticker: ticker.toUpperCase(), metricKey });
    }
  }

  const rows = await Promise.all(
    pairs.map(async ({ ticker, metricKey }): Promise<MetricSeriesBatchResult | null> => {
      try {
        const meta = metaByTicker.get(ticker);
        const series = await getMetricSeries(ticker, metricKey);
        return {
          ticker,
          name: meta?.name ?? ticker,
          sector: meta?.sector ?? "",
          subindustry: meta?.subindustry ?? "",
          metricKey,
          dates: series.map((p) => p.time),
          values: series.map((p) => p.value),
        };
      } catch {
        return null;
      }
    })
  );

  return rows.filter((r): r is MetricSeriesBatchResult => r !== null);
}
