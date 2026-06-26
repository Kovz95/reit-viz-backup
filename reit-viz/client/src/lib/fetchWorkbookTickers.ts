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

// Server-side excluded ("workbook") tickers, fetched fresh each call so the
// hidden set stays current. Screeners and other consumers that load tickers
// through this helper inherit the exclusions (hidden from all tabs).
async function fetchExcludedWorkbook(): Promise<Set<string>> {
  try {
    const res = await fetch("/api/excluded-tickers/workbook");
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set((data.tickers ?? []).map((t: string) => String(t).toUpperCase()));
  } catch {
    return new Set();
  }
}

export async function fetchWorkbookTickers(): Promise<TickerMeta[]> {
  if (!_cachedTickers) {
    const res = await fetch("/api/tickers");
    if (!res.ok) throw new Error(`fetchWorkbookTickers: HTTP ${res.status}`);
    const data = await res.json();
    _cachedTickers = Array.isArray(data) ? data : (data.tickers ?? []);
  }
  const base = _cachedTickers ?? [];
  const excluded = await fetchExcludedWorkbook();
  return excluded.size > 0
    ? base.filter((t) => !excluded.has(String(t.ticker).toUpperCase()))
    : base;
}
