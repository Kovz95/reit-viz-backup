// Intraday bars for the Charts hourly frequency — GET /api/intraday/:ticker.
// Bars carry epoch-second times (lightweight-charts intraday time type).

export interface IntradayBar {
  time: number; // epoch seconds UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

import { boundedSet } from "@/lib/boundedCache";

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_CAP = 60; // TTL alone never deletes — bound stale entries too
const cache = new Map<string, { at: number; bars: IntradayBar[] }>();
const inflight = new Map<string, Promise<IntradayBar[]>>();

export async function fetchIntradayBars(
  ticker: string,
  interval = "60m",
  days?: number,
): Promise<IntradayBar[]> {
  const key = `${ticker.toUpperCase()}|${interval}|${days ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.bars;
  const running = inflight.get(key);
  if (running) return running;

  const p = (async () => {
    try {
      const qs = new URLSearchParams({ interval });
      if (days) qs.set("days", String(days));
      const res = await fetch(`/api/intraday/${encodeURIComponent(ticker.toUpperCase())}?${qs}`);
      if (!res.ok) return [];
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json")) return []; // SPA fallback (old server without the route)
      const data = await res.json();
      if (!Array.isArray(data?.timestamps)) return [];
      const bars: IntradayBar[] = [];
      for (let i = 0; i < data.timestamps.length; i++) {
        bars.push({
          time: data.timestamps[i],
          open: data.opens[i],
          high: data.highs[i],
          low: data.lows[i],
          close: data.closes[i],
          volume: data.volumes?.[i] ?? 0,
        });
      }
      boundedSet(cache, key, { at: Date.now(), bars }, CACHE_CAP);
      return bars;
    } catch {
      return [];
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
