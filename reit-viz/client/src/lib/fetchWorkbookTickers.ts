// Hand-written from call-site inference

export interface TickerMeta {
  ticker: string;
  name?: string;
  economy?: string;
  sector?: string;
  subsector?: string;
  industryGroup?: string;
  industry?: string;
  subindustry?: string;
  metrics?: string[];
  [key: string]: any;
}

let _cachedTickers: TickerMeta[] | null = null;

export async function fetchWorkbookTickers(): Promise<TickerMeta[]> {
  if (_cachedTickers) return _cachedTickers;
  const res = await fetch("/api/tickers");
  if (!res.ok) throw new Error(`fetchWorkbookTickers: HTTP ${res.status}`);
  const data = await res.json();
  const tickers: TickerMeta[] = Array.isArray(data) ? data : (data.tickers ?? []);
  _cachedTickers = tickers;
  return tickers;
}
