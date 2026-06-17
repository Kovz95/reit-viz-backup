// Hand-written from call-site inference
// useGlobalUniverse is used in GlobalUniverseExplorer.tsx, Baskets.tsx, LevelsAndTrendlines.tsx

import { useState, useEffect } from "react";

export interface GlobalRecord {
  ticker: string;
  fdsTicker?: string;
  name?: string;
  nation?: string;
  exchange?: string;
  economy?: string;
  sector?: string;
  subsector?: string;
  industryGroup?: string;
  industry?: string;
  subindustry?: string;
  price?: number | null;
  marketCapMM?: number | null;
  salesMM?: number | null;
  adv?: number | null;
  dollarVolMM?: number | null;
  peFy2?: number | null;
  [key: string]: any;
}

interface GlobalUniverseState {
  records: GlobalRecord[];
  metas: GlobalRecord[];
  loading: boolean;
  error: string | null;
}

let _cache: GlobalRecord[] | null = null;
let _inFlight: Promise<GlobalRecord[]> | null = null;

async function loadGlobalRecords(): Promise<GlobalRecord[]> {
  if (_cache) return _cache;
  if (_inFlight) return _inFlight;

  // Production serves the global universe as a static file (/data/global-universe.json);
  // the reconstructed dev server exposes /api/global-universe. Try the static file first,
  // fall back to the API. Guard against the SPA index.html being returned for a missing
  // route (which would otherwise blow up as "Unexpected token '<'" in JSON.parse).
  const tryFetch = async (url: string): Promise<GlobalRecord[] | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      if (!text || text.trimStart().startsWith("<")) return null; // HTML, not JSON
      const data = JSON.parse(text);
      return Array.isArray(data) ? data : (data.records ?? data.tickers ?? []);
    } catch {
      return null;
    }
  };

  _inFlight = (async () => {
    const records =
      (await tryFetch("/data/global-universe.json")) ??
      (await tryFetch("/api/global-universe")) ??
      [];
    _cache = records;
    _inFlight = null;
    return records;
  })();

  return _inFlight;
}

export function useGlobalUniverse(): GlobalUniverseState {
  const [state, setState] = useState<GlobalUniverseState>({
    records: [],
    metas: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    loadGlobalRecords()
      .then((records) => {
        if (!cancelled) {
          setState({ records, metas: records, loading: false, error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// Named export alias for destructured import `{ u as useGlobalUniverse }`
export { useGlobalUniverse as u };
