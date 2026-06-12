// Hand-written from call-site inference (AutoTrendlineBacktest.tsx, PatternScreener.tsx)

export interface WorkbookSeriesResult {
  closes: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  priceDates: string[];
  metric?: string;
}

export async function fetchWorkbookSeriesForTicker(
  ticker: string,
  selection?: { kind?: string; metric?: string; [key: string]: any }
): Promise<WorkbookSeriesResult | null> {
  const params = new URLSearchParams({ ticker });
  if (selection?.metric) params.set("metric", selection.metric);
  if (selection?.kind) params.set("kind", selection.kind);

  const res = await fetch(`/api/workbook/series?${params.toString()}`);
  if (!res.ok) return null;
  return res.json();
}
