// Valuation-percentile + short-interest-crowding chips for scan result rows
// (Disloc tab, Universal Screener) — sibling of seasonalNow.tsx.
//
// Valuation: where does the CURRENT multiple sit in the name's OWN history?
// Uses the val-rerate machinery (richness orientation: 100 = richest ever,
// 0 = cheapest) on the first P/FFO / P/AFFO basis with enough history. Chips
// only at the extremes (cheap ≤ 20th pct, rich ≥ 80th) so rows stay readable:
// "correlation diverged AND the laggard is cheap" is the trade-confirming read.
//
// Crowding: latest workbook "Short Interest%" vs the name's own SI history +
// its ~3-month change. Red = crowded short (≥80th pct of own history and
// SI ≥ 3%) — squeeze risk before pressing a short; amber = SI rising fast
// (≥ +1pp over ~3 months on ≥ 2% base) — the crowd is moving in.
//
// Both are computed lazily (only for tickers actually displayed), share the
// per-ticker data fetch via dataService's ticker cache, and memoize per
// session at module level.
import { useEffect, useMemo, useState } from "react";
import { getMetricSeries } from "@/lib/dataService";
import { inferRerateMetric, percentileRank } from "@/lib/valuationRerate";

export interface ValStatus {
  metric: string;
  latest: number;
  /** Richness percentile vs own full history: 0 = cheapest ever, 100 = richest. */
  richPct: number;
  n: number;
}

export interface SiStatus {
  latest: number;      // Short Interest % of float
  pct: number;         // percentile vs own SI history
  delta3m: number | null; // pp change over ~3 months
  n: number;
}

const VAL_METRIC_CANDIDATES = ["P/FFO FY2", "P/FFO FY1", "P/FFO (FY1)", "P/AFFO FY2", "P/AFFO FY1", "P/AFFO (FY1)"];
const VAL_MIN_OBS = 60;
const SI_MIN_OBS = 12;

const valCache = new Map<string, ValStatus | null>();
const siCache = new Map<string, SiStatus | null>();
const inFlight = new Set<string>();

async function computeVal(ticker: string): Promise<ValStatus | null> {
  for (const mk of VAL_METRIC_CANDIDATES) {
    try {
      const series = await getMetricSeries(ticker, mk);
      const vals = series.map((p) => p.value).filter((v) => Number.isFinite(v) && v > 0);
      if (vals.length < VAL_MIN_OBS) continue;
      const latest = vals[vals.length - 1];
      const pct = percentileRank(latest, vals);
      const dir = inferRerateMetric(mk).dir;
      return { metric: mk, latest, richPct: dir === "inverse" ? 100 - pct : pct, n: vals.length };
    } catch { /* try next basis */ }
  }
  return null;
}

async function computeSi(ticker: string): Promise<SiStatus | null> {
  try {
    const series = await getMetricSeries(ticker, "Short Interest%");
    const pts = series.filter((p) => Number.isFinite(p.value) && p.value >= 0);
    if (pts.length < SI_MIN_OBS) return null;
    const vals = pts.map((p) => p.value);
    const latest = vals[vals.length - 1];
    const lastDate = pts[pts.length - 1].time;
    const cutoff = new Date(new Date(lastDate + "T00:00:00Z").getTime() - 92 * 86400000).toISOString().slice(0, 10);
    let base: number | null = null;
    for (let i = pts.length - 1; i >= 0; i--) {
      if (pts[i].time <= cutoff) { base = pts[i].value; break; }
    }
    return { latest, pct: percentileRank(latest, vals), delta3m: base === null ? null : latest - base, n: vals.length };
  } catch {
    return null;
  }
}

function useChipData<T>(
  enabled: boolean,
  tickers: string[],
  cache: Map<string, T | null>,
  compute: (t: string) => Promise<T | null>,
  kind: string,
) {
  const [, bump] = useState(0);
  const key = tickers.join(",");
  useEffect(() => {
    if (!enabled || tickers.length === 0) return;
    let cancelled = false;
    const missing = [...new Set(tickers.map((t) => t.toUpperCase()))]
      .slice(0, 150)
      .filter((t) => !cache.has(t) && !inFlight.has(`${kind}:${t}`));
    if (missing.length === 0) return;
    for (const t of missing) inFlight.add(`${kind}:${t}`);
    void (async () => {
      // Small concurrency — the underlying ticker JSON is cached, so most of
      // these resolve from memory after the first metric of a ticker loads.
      const CONC = 6;
      let idx = 0;
      await Promise.all(Array.from({ length: Math.min(CONC, missing.length) }, async () => {
        while (idx < missing.length) {
          const t = missing[idx++];
          try { cache.set(t, await compute(t)); }
          catch { cache.set(t, null); }
          finally { inFlight.delete(`${kind}:${t}`); }
          if (!cancelled) bump((v) => v + 1);
        }
      }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
}

/** Valuation-percentile lookup for the given (displayed) tickers. */
export function useValuationNow(enabled: boolean, tickers: string[]) {
  useChipData(enabled, tickers, valCache, computeVal, "val");
  return useMemo(() => ({
    statusFor: (t: string): ValStatus | null => valCache.get(t.toUpperCase()) ?? null,
  }), [tickers.join(","), valCache.size]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Short-interest crowding lookup for the given (displayed) tickers. */
export function useCrowdingNow(enabled: boolean, tickers: string[]) {
  useChipData(enabled, tickers, siCache, computeSi, "si");
  return useMemo(() => ({
    statusFor: (t: string): SiStatus | null => siCache.get(t.toUpperCase()) ?? null,
  }), [tickers.join(","), siCache.size]); // eslint-disable-line react-hooks/exhaustive-deps
}

const ordinal = (p: number) => `${Math.round(p)}th`;

/** "$" chip at valuation extremes: green = cheap vs own history, red = rich. */
export function ValuationChip({ ticker, status }: { ticker: string; status: ValStatus | null }) {
  if (!status) return null;
  const cheap = status.richPct <= 20;
  const rich = status.richPct >= 80;
  if (!cheap && !rich) return null;
  const cls = cheap
    ? "text-emerald-400 border-emerald-500/50 bg-emerald-500/15"
    : "text-red-400 border-red-500/50 bg-red-500/15";
  const title =
    `${ticker}: ${status.metric} ${status.latest.toFixed(1)}x — ${ordinal(status.richPct)} pct of own history ` +
    `(${cheap ? "CHEAP" : "RICH"}, 0 = cheapest ever, 100 = richest, n=${status.n})`;
  return (
    <span
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border text-[8px] font-bold leading-none align-middle cursor-help ${cls}`}
      title={title}
      data-testid={`val-chip-${ticker}`}
    >
      $
    </span>
  );
}

/** "C" chip on crowded / fast-rising short interest. */
export function CrowdingChip({ ticker, status }: { ticker: string; status: SiStatus | null }) {
  if (!status) return null;
  const crowded = status.pct >= 80 && status.latest >= 3;
  const rising = status.delta3m !== null && status.delta3m >= 1 && status.latest >= 2;
  if (!crowded && !rising) return null;
  const cls = crowded
    ? "text-red-400 border-red-500/50 bg-red-500/15"
    : "text-amber-400 border-amber-500/50 bg-amber-500/15";
  const title =
    `${ticker}: short interest ${status.latest.toFixed(1)}% of float — ${ordinal(status.pct)} pct of own history` +
    (status.delta3m !== null ? `, ${status.delta3m >= 0 ? "+" : ""}${status.delta3m.toFixed(1)}pp over ~3m` : "") +
    ` — ${crowded ? "CROWDED short (squeeze risk if shorting)" : "shorts moving in fast"}`;
  return (
    <span
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border text-[8px] font-bold leading-none align-middle cursor-help ${cls}`}
      title={title}
      data-testid={`crowd-chip-${ticker}`}
    >
      C
    </span>
  );
}
