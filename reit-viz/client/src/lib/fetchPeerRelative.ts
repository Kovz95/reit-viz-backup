// fetchPeerRelative — used by PremiumDiscountScreener.tsx, which reads
// result.targetSeries and result.groupSeries.
//
// NOTE — peer-relative comparisons were COMPUTED CLIENT-SIDE in the original
// frontend (from per-ticker + peer-group base data); /api/peer-relative was never a
// backend GET route. The LIVE production backend doesn't serve it (it returned the
// SPA index.html, blowing up res.json() as "Unexpected token '<'"). The
// reconstruction's own server implements it, so it resolves after a FULL deploy.
//
// Until then, degrade gracefully: try the API (guarding against HTML) and return an
// empty {targetSeries, groupSeries} on a miss so the screener doesn't crash.
// FLAG: full functionality on a client-only deploy needs the original client-side
// computation, or a FULL server+client deploy.

export async function fetchPeerRelative(
  ticker: string,
  dimension: string,
  peerClass: string,
  metric: string,
  aggregation?: string,
  _extra?: any,
  _getDatesFn?: () => Promise<string[]>
): Promise<{ targetSeries: any[]; groupSeries: any[]; [key: string]: any }> {
  const empty = { targetSeries: [], groupSeries: [] };
  const params = new URLSearchParams({ ticker, dimension, peerClass, metric });
  if (aggregation) params.set("aggregation", aggregation);
  try {
    const res = await fetch(`/api/peer-relative?${params.toString()}`);
    if (!res.ok) return empty;
    const text = await res.text();
    if (!text || text.trimStart().startsWith("<")) return empty; // HTML, not JSON
    const data = JSON.parse(text);
    return {
      targetSeries: Array.isArray(data?.targetSeries) ? data.targetSeries : [],
      groupSeries: Array.isArray(data?.groupSeries) ? data.groupSeries : [],
      ...data,
    };
  } catch {
    return empty;
  }
}
