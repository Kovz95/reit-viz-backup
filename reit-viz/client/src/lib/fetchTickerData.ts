// fetchTickerData: returns per-ticker fundamentals + price as a sparse-pair map.
// Used in DividendSpread.tsx, ROCAnalysis.tsx, ValuationRegime.tsx — consumers read
// metrics as top-level keys of [index, value] pairs (e.g. data.close, data["FFO LTM"]).
//
// The live backend has no /api/ticker-data route; data comes from
// GET /api/ticker/<sym> ({ dates, metrics }), transformed to the original bundle's
// sparse-pair shape via toSparseMetrics (gL). See lib/tickerData.ts.

import { fetchTickerRaw, toSparseMetrics, type SparsePair } from "@/lib/tickerData";

export type TickerData = Record<string, SparsePair[]> & { dates?: string[] };

export async function fetchTickerData(
  ticker: string,
  _opts?: { start?: string; end?: string; [key: string]: any }
): Promise<TickerData> {
  const raw = await fetchTickerRaw(ticker);
  if (!raw) return {} as TickerData;
  const sparse = toSparseMetrics(raw.metrics) as TickerData;
  // Expose dates too; no metric is named "dates", so this is safe for key-based access.
  sparse.dates = raw.dates;
  return sparse;
}
