// Hand-written stub — fetchTickerData: returns full ticker data (OHLCV + fundamentals)
// Used in DividendSpread.tsx, ROCAnalysis.tsx, ValuationRegime.tsx

export async function fetchTickerData(
  ticker: string,
  opts?: { start?: string; end?: string; [key: string]: any }
): Promise<any | null> {
  const params = new URLSearchParams({ ticker });
  if (opts?.start) params.set("start", opts.start);
  if (opts?.end) params.set("end", opts.end);
  const res = await fetch(`/api/ticker-data?${params.toString()}`);
  if (!res.ok) return null;
  return res.json();
}
