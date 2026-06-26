// Real trailing-window $ ADV for the workbook universe, computed server-side
// from the Yahoo volume feed (POST /api/liquidity/adv). The workbook's own data
// has no volume, so this is the only source of a true, current ADV — it also
// covers names absent from the global-universe dataset.
//
// Results are memoized at module scope keyed by (window + sorted ticker set) so
// switching tabs / remounting doesn't refire the batch. The server keeps its own
// longer-lived cache, so a warm call returns near-instantly.
import { useEffect, useState } from "react";

export interface AdvEntry {
  advUsdMM: number | null;
  advShares: number | null;
  lastClose: number | null;
  days: number;
  asOf: string | null;
  window: number;
}

export type AdvMap = Map<string, AdvEntry>;

const _memo = new Map<string, Promise<AdvMap>>();

function keyFor(symbols: string[], window: number): string {
  return window + "|" + [...symbols].sort().join(",");
}

async function fetchAdv(symbols: string[], window: number, refresh: boolean): Promise<AdvMap> {
  const { API_BASE } = await import("@/lib/queryClient");
  const resp = await fetch(`${API_BASE}/api/liquidity/adv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers: symbols, window, refresh }),
  });
  if (!resp.ok) throw new Error(`ADV request failed: ${resp.status}`);
  const data = (await resp.json()) as { window: number; results: Record<string, AdvEntry> };
  const map: AdvMap = new Map();
  for (const [ticker, entry] of Object.entries(data.results || {})) {
    if (entry) map.set(ticker.toUpperCase(), entry);
  }
  return map;
}

/** Fetch (memoized) the trailing-window ADV for a set of symbols. */
export function loadWorkbookAdv(symbols: string[], window = 90): Promise<AdvMap> {
  const key = keyFor(symbols, window);
  let p = _memo.get(key);
  if (!p) {
    p = fetchAdv(symbols, window, false).catch((err) => {
      _memo.delete(key); // allow retry on next mount after a failure
      throw err;
    });
    _memo.set(key, p);
  }
  return p;
}

/** Force a server-side refresh (re-pull from Yahoo) and replace the memo. */
export function refreshWorkbookAdv(symbols: string[], window = 90): Promise<AdvMap> {
  const key = keyFor(symbols, window);
  const p = fetchAdv(symbols, window, true).catch((err) => {
    _memo.delete(key);
    throw err;
  });
  _memo.set(key, p);
  return p;
}

/**
 * Hook: returns the real $ ADV map for `symbols`. `refreshToken` is an opaque
 * value — bump it (e.g. Date.now()) to force a Yahoo re-pull.
 */
export function useWorkbookAdv(
  symbols: string[],
  window = 90,
  refreshToken = 0,
): { advMap: AdvMap; loading: boolean; error: string | null } {
  const [advMap, setAdvMap] = useState<AdvMap>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable dependency: sorted, de-duped symbol list.
  const sig = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).sort().join(",");

  useEffect(() => {
    if (!sig) {
      setAdvMap(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const list = sig.split(",");
    const promise = refreshToken > 0
      ? refreshWorkbookAdv(list, window)
      : loadWorkbookAdv(list, window);
    promise
      .then((map) => {
        if (!cancelled) {
          setAdvMap(map);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, window, refreshToken]);

  return { advMap, loading, error };
}
