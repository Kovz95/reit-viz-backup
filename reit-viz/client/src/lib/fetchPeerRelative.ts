// Hand-written stub
export async function fetchPeerRelative(
  ticker: string,
  dimension: string,
  peerClass: string,
  metric: string,
  aggregation?: string,
  extra?: any,
  getDatesFn?: () => Promise<string[]>
): Promise<any> {
  const params = new URLSearchParams({ ticker, dimension, peerClass, metric });
  if (aggregation) params.set("aggregation", aggregation);
  const res = await fetch(`/api/peer-relative?${params.toString()}`);
  if (!res.ok) throw new Error(`fetchPeerRelative: HTTP ${res.status}`);
  return res.json();
}
