// Hand-written from call-site inference
// useGlobalUniverse is used in GlobalUniverseExplorer.tsx, Baskets.tsx, LevelsAndTrendlines.tsx

import { useState, useEffect, useMemo } from "react";
import { useExcludedTickers } from "@/lib/excludedTickers";

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

  // Tickers hidden via the Global Universe trash / Exclusions panel are filtered
  // out of the records every consumer reads (explorer grid, pair-combo, optimizer
  // "Global" mode, screeners) — fulfilling the trash action's promise.
  const excluded = useExcludedTickers("global");
  return useMemo(() => {
    if (excluded.size === 0) return state;
    const records = state.records.filter((r) => !excluded.has(String(r.ticker).toUpperCase()));
    return { ...state, records, metas: records };
  }, [state, excluded]);
}

// Per-ticker liquidity info ($ ADV) looked up by symbol. Sourced from the same
// global-universe dataset, which carries price / avg-daily share volume (adv) /
// avg-daily dollar volume (dollarVolMM) for ~9.4k names.
export interface AdvInfo {
  price?: number | null;
  /** Average daily share volume, in millions of shares. */
  adv?: number | null;
  /** Average daily dollar volume (= price × adv), in $ millions. This is "$ ADV". */
  dollarVolMM?: number | null;
}

/**
 * Returns a ticker → liquidity map keyed by UPPER-cased symbol, built from the
 * global-universe dataset. Used to enrich the workbook universe (which has no
 * volume of its own) with $ ADV. Reads the raw cache directly — deliberately
 * NOT filtered by global exclusions, since this is a metadata lookup, not a
 * universe.
 */
export function useGlobalAdvMap(): { advMap: Map<string, AdvInfo>; loading: boolean } {
  const [advMap, setAdvMap] = useState<Map<string, AdvInfo>>(() => new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadGlobalRecords()
      .then((records) => {
        if (cancelled) return;
        const m = new Map<string, AdvInfo>();
        for (const r of records) {
          const k = String(r.ticker).toUpperCase();
          // First record wins (records are de-duped enough for a liquidity lookup).
          if (!m.has(k)) {
            m.set(k, { price: r.price, adv: r.adv, dollarVolMM: r.dollarVolMM });
          }
        }
        setAdvMap(m);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { advMap, loading };
}

// Named export alias for destructured import `{ u as useGlobalUniverse }`
export { useGlobalUniverse as u };
