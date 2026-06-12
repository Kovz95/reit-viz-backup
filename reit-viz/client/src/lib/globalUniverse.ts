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

  _inFlight = fetch("/api/global-universe")
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const records: GlobalRecord[] = Array.isArray(data)
        ? data
        : (data.records ?? data.tickers ?? []);
      _cache = records;
      _inFlight = null;
      return records;
    })
    .catch((err) => {
      _inFlight = null;
      throw err;
    });

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
