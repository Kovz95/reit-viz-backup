// Filter a ticker-meta list by classification dimension sets + free-text
// search + manually added tickers. Used by the classification filter bars on
// SimilarSetups / Trendlines / SupportResistance / PairsScreener / L&T.

const CLASS_DIMS = [
  "economy",
  "sector",
  "subsector",
  "industryGroup",
  "industry",
  "subindustry",
] as const;

/**
 * Returns tickers that match every non-empty classification dimension AND the
 * search text; tickers named in manualTickers are always included (union).
 * With no active criteria at all, returns the full list (callers gate on
 * "no filters" themselves when they want an empty default).
 */
export function filterTickersByClassification(
  tickers: any[],
  classFilters?: Record<string, Set<string> | undefined>,
  industrySearch?: string,
  manualTickers?: Set<string> | string[] | null
): any[] {
  const list = Array.isArray(tickers) ? tickers : [];
  const search = (industrySearch ?? "").trim().toLowerCase();
  const manual = new Set(
    Array.from(manualTickers ?? []).map((t) => String(t).toUpperCase())
  );

  const activeDims = CLASS_DIMS.filter(
    (d) => classFilters?.[d] instanceof Set && (classFilters[d] as Set<string>).size > 0
  );

  if (activeDims.length === 0 && !search && manual.size === 0) return list;

  const matched = list.filter((t) => {
    if (!t) return false;
    if (manual.has(String(t.ticker ?? "").toUpperCase())) return true;
    for (const dim of activeDims) {
      const allowed = classFilters![dim] as Set<string>;
      if (!allowed.has(String(t[dim] ?? ""))) return false;
    }
    if (search) {
      const hay = `${t.ticker ?? ""} ${t.name ?? ""} ${CLASS_DIMS.map((d) => t[d] ?? "").join(" ")}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  return matched;
}
