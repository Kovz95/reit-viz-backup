// Hand-written from call-site inference (Performance.tsx)
//
// NOTE — these four feeds (period performance, monthly seasonality, event returns,
// seasonal patterns) were COMPUTED CLIENT-SIDE in the original frontend from base
// data; they were never backend GET routes. The reconstruction split them into
// /api/performance* GET calls, which the LIVE production backend does not serve — it
// returned the SPA index.html, so res.json() blew up as "Unexpected token '<'".
//
// The reconstruction's own server DOES implement these routes, so they will resolve
// after a FULL server+client deploy ("Deploy reit-viz FULL"). Until then we degrade
// gracefully: try the static export, then the API, guard against HTML, and return an
// empty result on a miss (so the Performance page renders empty instead of crashing).
// FLAG: to fully restore these features on the client-only deploy, port the original
// client-side computation or run a FULL deploy.

async function fetchJsonArray(url: string): Promise<any[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trimStart().startsWith("<")) return null; // HTML, not JSON
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    return null;
  } catch {
    return null;
  }
}

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
  const qs = params.toString();
  return (
    (await fetchJsonArray("/data/performance.json")) ??
    (await fetchJsonArray(`/api/performance${qs ? `?${qs}` : ""}`)) ??
    []
  );
}

export async function fetchMonthlySeasonality(_tickerOrOpts?: string | any): Promise<any[]> {
  return (
    (await fetchJsonArray("/data/performance-monthly-seasonality.json")) ??
    (await fetchJsonArray("/api/performance/monthly-seasonality")) ??
    []
  );
}

export async function fetchEventReturns(eventKind: string): Promise<any[]> {
  const params = new URLSearchParams({ kind: eventKind });
  return (
    (await fetchJsonArray(`/data/performance-event-returns.json`)) ??
    (await fetchJsonArray(`/api/performance/event-returns?${params.toString()}`)) ??
    []
  );
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
  return (
    (await fetchJsonArray(`/data/performance-seasonal-patterns.json`)) ??
    (await fetchJsonArray(`/api/performance/seasonal-patterns?${params.toString()}`)) ??
    []
  );
}
