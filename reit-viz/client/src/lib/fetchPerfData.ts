// Hand-written from call-site inference (Performance.tsx)

export async function fetchPerfData(
  start?: string,
  end?: string,
  opts?: Record<string, any>
): Promise<any[]> {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (opts) {
    for (const [k, v] of Object.entries(opts)) params.set(k, String(v));
  }
  const res = await fetch(`/api/performance?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchPerfData: HTTP ${res.status}`);
  return res.json();
}

export async function fetchMonthlySeasonality(): Promise<any[]> {
  const res = await fetch("/api/performance/monthly-seasonality");
  if (!res.ok) throw new Error(`fetchMonthlySeasonality: HTTP ${res.status}`);
  return res.json();
}

export async function fetchEventReturns(eventKind: string): Promise<any[]> {
  const params = new URLSearchParams({ kind: eventKind });
  const res = await fetch(`/api/performance/event-returns?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchEventReturns: HTTP ${res.status}`);
  return res.json();
}

export async function fetchSeasonalPatterns(
  minYears?: number,
  minDays?: number,
  maxDays?: number
): Promise<any[]> {
  const params = new URLSearchParams();
  if (minYears !== undefined) params.set("minYears", String(minYears));
  if (minDays !== undefined) params.set("minDays", String(minDays));
  if (maxDays !== undefined) params.set("maxDays", String(maxDays));
  const res = await fetch(`/api/performance/seasonal-patterns?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchSeasonalPatterns: HTTP ${res.status}`);
  return res.json();
}
