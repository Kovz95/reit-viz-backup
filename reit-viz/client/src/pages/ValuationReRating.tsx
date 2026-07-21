// Valuation Re-Rating — what a multiple becomes after an X% price move, and where
// that sits vs the stock's own history, across the universe, for long/short ranking.
import { useState, useMemo, Fragment } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getMetricTrailing, getMetricSeries } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import { usePersistedState } from "@/lib/persistedState";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { navigateToPairs } from "@/lib/navigateToPairs";
import {
  PAIR_RATIO_METRIC, ratioSeries, unorderedPairs, MAX_PAIR_LEGS, type PairBasis,
} from "@/lib/pairValuation";
import RerateMetricPicker from "@/components/RerateMetricPicker";
import { useBasketScope, BasketScopeSelect } from "@/components/BasketScopeSelect";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, ArrowUpDown, Info, LineChart } from "lucide-react";
import {
  LOOKBACKS, getRerateMetric, buildRerateRow,
  type RerateRow, type RerateClassification, type RerateMetric,
} from "@/lib/valuationRerate";

// The six classification levels the table can be grouped by (plus "none").
const GROUP_LEVELS = [
  { value: "none", label: "No grouping" },
  { value: "economy", label: "Economy" },
  { value: "sector", label: "Sector" },
  { value: "subsector", label: "Subsector" },
  { value: "industryGroup", label: "Industry Group" },
  { value: "industry", label: "Industry" },
  { value: "subindustry", label: "Subindustry" },
] as const;
type GroupLevel = typeof GROUP_LEVELS[number]["value"];

// The six classification levels offered as filter dropdowns, coarse → fine.
const CLASS_FILTER_DEFS = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Ind. Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
] as const;
const DEFAULT_CLASS_FILTERS: Record<string, string> = Object.fromEntries(CLASS_FILTER_DEFS.map((d) => [d.key, "all"]));

// ── formatting / color helpers ─────────────────────────────────────────────
const fmtMult = (v: number, inverse: boolean) =>
  Number.isFinite(v) ? v.toFixed(inverse ? 2 : 1) : "—";
const fmtPctile = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "—");
const fmtMove = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` : "—";
const fmtZ = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}` : "—");
const median = (nums: number[]): number => {
  const v = nums.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

// cheap → green, rich → red, depending on the metric's orientation
function cheapnessColor(pctile: number, lowIsCheap: boolean): string {
  if (!Number.isFinite(pctile)) return "text-muted-foreground";
  const cheap = lowIsCheap ? 100 - pctile : pctile; // 100 = cheapest
  if (cheap >= 70) return "text-emerald-400";
  if (cheap >= 45) return "text-amber-400";
  return "text-red-400";
}
const moveColor = (v: number) =>
  !Number.isFinite(v) ? "text-muted-foreground" : v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-muted-foreground";

type SortCol =
  | "ticker" | "m0" | "nowPctile" | "nowZ" | "proForma" | "proFormaPctile"
  | "proFormaZ" | "toMedian" | "toRich" | "toCheap" | "rr";

type TickerMetaLite = { ticker: string; name: string; legA?: string; legB?: string } & RerateClassification;
// One table row per ticker, holding a computed RerateRow per selected metric.
type MultiRow = { meta: TickerMetaLite; byMetric: Record<string, RerateRow> };

// Reward:risk = upside ÷ |downside|.
const rrOf = (rr: RerateRow): number =>
  Math.abs(rr.toCheap) > 0 && Number.isFinite(rr.toRich) ? rr.toRich / Math.abs(rr.toCheap) : NaN;

export default function ValuationReRating() {
  const [, setLocation] = useLocation();
  const { filteredTickersList } = useUniverse();
  // View-defining controls persist across reloads (localStorage). The metric is
  // a MULTI-select: the table shows a full stat group per selected multiple.
  const [metricKeys, setMetricKeys] = usePersistedState<string[]>("reit-viz:rerate:metricKeys", ["P/FFO FY2"]);
  const [pctMove, setPctMove] = usePersistedState("reit-viz:rerate:pctMove", 20);
  const [lookbackDays, setLookbackDays] = usePersistedState("reit-viz:rerate:lookbackDays", 1260);
  const [groupBy, setGroupBy] = usePersistedState<GroupLevel>("reit-viz:rerate:groupBy", "none");
  const [search, setSearch] = useState("");
  // Pairs mode: each row is an A/B ratio (price or the selected multiple).
  const [pairMode, setPairMode] = usePersistedState("reit-viz:rerate:pairMode", false);
  const [pairBasis, setPairBasis] = usePersistedState<PairBasis>("reit-viz:rerate:pairBasis", "price");
  const [classFilters, setClassFilters] = usePersistedState<Record<string, string>>("reit-viz:rerate:classFilters", DEFAULT_CLASS_FILTERS);
  // Changing a coarser level resets the finer ones (they may no longer apply).
  const setClassFilter = (key: string, value: string) => {
    const idx = CLASS_FILTER_DEFS.findIndex((d) => d.key === key);
    setClassFilters((prev) => {
      const next = { ...prev, [key]: value };
      for (let i = idx + 1; i < CLASS_FILTER_DEFS.length; i++) next[CLASS_FILTER_DEFS[i].key] = "all";
      return next;
    });
  };
  // Sort = one metric's one stat (sortMetric null → sort by Ticker).
  const [sortCol, setSortCol] = useState<SortCol>("toRich");
  const [sortMetric, setSortMetric] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const setMetrics = (keys: string[]) => setMetricKeys(keys.length ? keys : metricKeys);
  const removeMetric = (key: string) =>
    setMetricKeys(metricKeys.length > 1 ? metricKeys.filter((k) => k !== key) : metricKeys);
  const metrics = useMemo(() => metricKeys.map((k) => getRerateMetric(k)), [metricKeys]);
  // In pairs mode the table has a single synthetic "A/B ratio" column.
  const pairRatioMetric: RerateMetric = useMemo(
    () => ({ ...PAIR_RATIO_METRIC, label: pairBasis === "price" ? "A/B Price Ratio" : `A/B ${metricKeys[0]} Ratio` }),
    [pairBasis, metricKeys],
  );
  const effMetrics = pairMode ? [pairRatioMetric] : metrics;
  const effMetricKeys = pairMode ? [PAIR_RATIO_METRIC.key] : metricKeys;
  const effSortMetric = pairMode
    ? PAIR_RATIO_METRIC.key
    : (sortMetric && metricKeys.includes(sortMetric) ? sortMetric : metricKeys[0]);
  const tickers = useMemo(
    () => filteredTickersList.map((t) => ({
      ticker: t.ticker, name: t.name,
      economy: t.economy, sector: t.sector, subsector: t.subsector,
      industryGroup: t.industryGroup, industry: t.industry, subindustry: t.subindustry,
    })),
    [filteredTickersList],
  );
  const tickerKey = useMemo(() => tickers.map((t) => t.ticker).sort().join(","), [tickers]);

  // Country/exchange filter (workbook universe has no geo — resolved via geo map).
  const geo = useGeoFilter(tickers, "rerate-geo");

  // Optional basket scope on top of the universe filter (no-op when unset).
  const basketScope = useBasketScope("reit-viz:basket-scope:val-rerate");

  // Cascading options for each classification dropdown: each level's choices are
  // the distinct values present under the coarser selections above it.
  const classOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    CLASS_FILTER_DEFS.forEach((d, i) => {
      const coarser = CLASS_FILTER_DEFS.slice(0, i);
      const pool = tickers.filter((t) =>
        coarser.every((c) => classFilters[c.key] === "all" || (t as any)[c.key] === classFilters[c.key]));
      out[d.key] = ["all", ...Array.from(new Set(pool.map((t) => (t as any)[d.key]).filter(Boolean))).sort()];
    });
    return out;
  }, [tickers, classFilters]);

  // Fetch each ticker's trailing history for EVERY selected metric (batched),
  // keyed on the metric set + lookback + universe. Shape: metricKey → ticker → vals.
  const metricsSig = metricKeys.join("|");
  const { data: trailingByMetric = {}, isLoading: singleLoading } = useQuery({
    queryKey: ["rerate-trailing-multi", metricsSig, lookbackDays, tickerKey],
    queryFn: async () => {
      const out: Record<string, Record<string, number[]>> = {};
      const batchSize = 15;
      for (const mk of metricKeys) {
        const map: Record<string, number[]> = {};
        for (let b = 0; b < tickers.length; b += batchSize) {
          const batch = tickers.slice(b, b + batchSize);
          const results = await Promise.all(
            batch.map(async (t) => ({ ticker: t.ticker, vals: await getMetricTrailing(t.ticker, mk, lookbackDays) })),
          );
          for (const r of results) map[r.ticker] = r.vals;
        }
        out[mk] = map;
      }
      return out;
    },
    enabled: !pairMode && tickers.length > 0 && metricKeys.length > 0,
  });

  // One row per ticker; each carries a RerateRow per selected metric (present
  // only where that ticker has enough history for that multiple).
  const singleRows = useMemo<MultiRow[]>(() => {
    const out: MultiRow[] = [];
    for (const t of tickers) {
      const byMetric: Record<string, RerateRow> = {};
      for (const mk of metricKeys) {
        const trailing = trailingByMetric[mk]?.[t.ticker];
        if (!trailing) continue;
        const row = buildRerateRow(t, trailing, pctMove, getRerateMetric(mk));
        if (row) byMetric[mk] = row;
      }
      if (Object.keys(byMetric).length) out.push({ meta: t, byMetric });
    }
    return out;
  }, [tickers, trailingByMetric, pctMove, metricKeys]);

  // Legs that form pairs: the class/geo/search-filtered universe, capped (n²).
  const pairLegs = useMemo(() => {
    const q = search.trim().toUpperCase();
    return tickers
      .filter((t) => CLASS_FILTER_DEFS.every((d) => classFilters[d.key] === "all" || (t as any)[d.key] === classFilters[d.key]))
      .filter((t) => geo.matchesGeo(t.ticker))
      .filter((t) => basketScope.inScope(t.ticker))
      .filter((t) => !q || t.ticker.includes(q) || t.name.toUpperCase().includes(q))
      .sort((a, b) => a.ticker.localeCompare(b.ticker))
      .slice(0, MAX_PAIR_LEGS);
  }, [tickers, classFilters, geo.matchesGeo, basketScope.members, search]);
  const pairLegOverflow = pairMode
    ? tickers.filter((t) => CLASS_FILTER_DEFS.every((d) => classFilters[d.key] === "all" || (t as any)[d.key] === classFilters[d.key]) && geo.matchesGeo(t.ticker) && basketScope.inScope(t.ticker)).length - pairLegs.length
    : 0;
  const pairMetricKey = metricKeys[0];
  const pairLegKey = useMemo(() => pairLegs.map((t) => t.ticker).join(","), [pairLegs]);

  const { data: pairRows = [], isLoading: pairLoading } = useQuery({
    queryKey: ["rerate-pairs", pairBasis, pairMetricKey, lookbackDays, pctMove, pairLegKey],
    queryFn: async () => {
      const seriesKey = pairBasis === "price" ? "close" : pairMetricKey;
      const seriesByTicker = new Map<string, { time: string; value: number }[]>();
      const batchSize = 12;
      for (let b = 0; b < pairLegs.length; b += batchSize) {
        const batch = pairLegs.slice(b, b + batchSize);
        await Promise.all(batch.map(async (t) => {
          seriesByTicker.set(t.ticker, await getMetricSeries(t.ticker, seriesKey).catch(() => []));
        }));
      }
      const out: MultiRow[] = [];
      const pairs = unorderedPairs(pairLegs);
      for (let i = 0; i < pairs.length; i++) {
        const [A, B] = pairs[i];
        const ratio = ratioSeries(seriesByTicker.get(A.ticker) || [], seriesByTicker.get(B.ticker) || []);
        // Trailing ratio values, windowed to the selected history length.
        const vals = ratio.map((p) => p.value);
        const trailing = lookbackDays < vals.length ? vals.slice(-lookbackDays) : vals;
        const meta: TickerMetaLite = {
          ticker: `${A.ticker}/${B.ticker}`, name: `${A.name} / ${B.name}`,
          economy: A.economy, sector: A.sector, subsector: A.subsector,
          industryGroup: A.industryGroup, industry: A.industry, subindustry: A.subindustry,
          legA: A.ticker, legB: B.ticker,
        };
        // The ratio behaves like a direct, low-is-cheap multiple; a +X% relative
        // move of A vs B re-rates it by X%.
        const rr = buildRerateRow(meta, trailing, pctMove, PAIR_RATIO_METRIC);
        if (rr) out.push({ meta, byMetric: { [PAIR_RATIO_METRIC.key]: rr } });
        if (i % 300 === 299) await new Promise((r) => setTimeout(r));
      }
      return out;
    },
    enabled: pairMode && pairLegs.length >= 2 && (pairBasis === "price" || !!pairMetricKey),
  });

  const rows = pairMode ? pairRows : singleRows;
  const isLoading = pairMode ? pairLoading : singleLoading;

  const sortValueOf = (row: MultiRow): number | string => {
    if (sortCol === "ticker") return row.meta.ticker;
    const rr = row.byMetric[effSortMetric];
    if (!rr) return -Infinity;
    const v = sortCol === "rr" ? rrOf(rr) : (rr as any)[sortCol];
    return Number.isFinite(v) ? v : -Infinity;
  };

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    // Pairs mode filters its legs up front (see pairLegs); single mode filters
    // the computed rows here by classification + geography.
    let r = pairMode
      ? rows.slice()
      : rows.filter((x) =>
          CLASS_FILTER_DEFS.every((d) => classFilters[d.key] === "all" || (x.meta as any)[d.key] === classFilters[d.key])
          && geo.matchesGeo(x.meta.ticker)
          && basketScope.inScope(x.meta.ticker));
    if (q) r = r.filter((x) => x.meta.ticker.includes(q) || x.meta.name.toUpperCase().includes(q));
    r = [...r].sort((a, b) => {
      const av = sortValueOf(a), bv = sortValueOf(b);
      const cmp = typeof av === "string" || typeof bv === "string"
        ? String(av).localeCompare(String(bv))
        : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [rows, search, sortCol, effSortMetric, sortDir, classFilters, geo.matchesGeo, basketScope.members, pairMode]);

  // When grouping, partition the already-sorted rows by the chosen classification
  // (rows keep their sort order within each group; groups are ordered A→Z).
  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, MultiRow[]>();
    for (const r of visible) {
      const key = (r.meta[groupBy as keyof RerateClassification] as string) || "—";
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, groupBy]);

  const totalCols = 2 + effMetrics.length * 10;

  // Sort targets a (metric, stat) pair; metricKey null → the shared Ticker column.
  const isActiveSort = (col: SortCol, metricKey: string | null) =>
    sortCol === col && (col === "ticker" || (metricKey ?? effMetricKeys[0]) === effSortMetric);

  const toggleSort = (col: SortCol, metricKey: string | null) => {
    if (isActiveSort(col, metricKey)) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortMetric(metricKey); setSortDir(col === "ticker" ? "asc" : "desc"); }
  };

  const SortIcon = ({ col, metricKey }: { col: SortCol; metricKey: string | null }) =>
    !isActiveSort(col, metricKey) ? <ArrowUpDown className="w-3 h-3 inline opacity-40" />
      : sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />;

  const Th = ({ col, label, title, metricKey, sep }: { col: SortCol; label: string; title?: string; metricKey: string; sep?: boolean }) => (
    <th
      className={`px-2 py-1 text-right whitespace-nowrap cursor-pointer hover:text-foreground select-none ${sep ? "border-l border-border/60" : ""}`}
      onClick={() => toggleSort(col, metricKey)}
      title={title}
    >
      {label} <SortIcon col={col} metricKey={metricKey} />
    </th>
  );

  // The 10 stat headers for one metric's column group.
  const metricHeaderCells = (m: RerateMetric) => (
    <>
      <Th col="m0" label="Now" title="Current value" metricKey={m.key} sep />
      <Th col="nowPctile" label="%ile" title="Where the current value sits in its history (0=low, 100=high)" metricKey={m.key} />
      <Th col="nowZ" label="z" title="Current z-score vs history" metricKey={m.key} />
      <Th col="proForma" label={`@${fmtMove(pctMove)}`} title={`Pro-forma value after a ${fmtMove(pctMove)} move`} metricKey={m.key} />
      <Th col="proFormaPctile" label="%ile" title="Pro-forma value's historical percentile" metricKey={m.key} />
      <Th col="proFormaZ" label="z" title="Pro-forma z-score" metricKey={m.key} />
      <Th col="toMedian" label="→Med" title="Implied % move to re-rate to the historical median" metricKey={m.key} />
      <Th col="toRich" label="↑Rich" title="Implied % move to the rich end of history (upside room)" metricKey={m.key} />
      <Th col="toCheap" label="↓Cheap" title="Implied % move to the cheap end of history (downside risk)" metricKey={m.key} />
      <Th col="rr" label="R:R" title="Reward/risk = upside ÷ |downside|" metricKey={m.key} />
    </>
  );

  // Stash the row's ticker + current multiple/lookback and jump to the Charts
  // tab, which builds the 5-pane re-rating analysis on mount.
  const openInCharts = (ticker: string) => {
    try {
      sessionStorage.setItem(
        "reit-viz:rerate-to-charts",
        JSON.stringify({ ticker, metricKey: effSortMetric, lookbackDays }),
      );
    } catch {}
    setLocation("/");
  };

  // Frozen left columns so the ticker stays visible while scrolling metrics.
  const STICKY0 = "sticky left-0 bg-card z-10";
  const STICKY1 = "sticky left-7 bg-card z-10";

  // The 10 data cells for one metric's column group (blank when the ticker
  // lacks history for that multiple).
  const renderMetricCells = (rr: RerateRow | undefined, m: RerateMetric) => {
    if (!rr) return (
      <>
        {Array.from({ length: 10 }).map((_, i) => (
          <td key={i} className={`px-2 py-1 text-right text-muted-foreground/40 ${i === 0 ? "border-l border-border/60" : ""}`}>—</td>
        ))}
      </>
    );
    const inv = m.dir === "inverse";
    const rr2 = rrOf(rr);
    return (
      <>
        <td className="px-2 py-1 text-right border-l border-border/60">{fmtMult(rr.m0, inv)}</td>
        <td className={`px-2 py-1 text-right ${cheapnessColor(rr.nowPctile, m.lowIsCheap)}`}>{fmtPctile(rr.nowPctile)}</td>
        <td className="px-2 py-1 text-right text-muted-foreground">{fmtZ(rr.nowZ)}</td>
        <td className="px-2 py-1 text-right">{fmtMult(rr.proForma, inv)}</td>
        <td className={`px-2 py-1 text-right ${cheapnessColor(rr.proFormaPctile, m.lowIsCheap)}`}>{fmtPctile(rr.proFormaPctile)}</td>
        <td className="px-2 py-1 text-right text-muted-foreground">{fmtZ(rr.proFormaZ)}</td>
        <td className={`px-2 py-1 text-right ${moveColor(rr.toMedian)}`}>{fmtMove(rr.toMedian)}</td>
        <td className={`px-2 py-1 text-right ${moveColor(rr.toRich)}`}>{fmtMove(rr.toRich)}</td>
        <td className={`px-2 py-1 text-right ${moveColor(rr.toCheap)}`}>{fmtMove(rr.toCheap)}</td>
        <td className="px-2 py-1 text-right text-muted-foreground">{Number.isFinite(rr2) ? rr2.toFixed(2) : "—"}</td>
      </>
    );
  };

  const renderRow = (r: MultiRow) => (
    <tr key={r.meta.ticker} className="border-b border-border/40 hover:bg-muted/30">
      <td className={`px-1 py-1 text-center ${STICKY0}`}>
        <button
          type="button"
          onClick={() => pairMode && r.meta.legA && r.meta.legB ? navigateToPairs(r.meta.legA, r.meta.legB) : openInCharts(r.meta.ticker)}
          title={pairMode ? `Open ${r.meta.ticker} in Pairs` : `Chart ${r.meta.ticker} — ${effSortMetric} with percentile, z-score & reward:risk over time`}
          className="text-muted-foreground hover:text-foreground"
        >
          <LineChart className="w-3.5 h-3.5" />
        </button>
      </td>
      <td className={`px-2 py-1 text-left font-semibold ${STICKY1}`} title={`${r.meta.name} · ${r.meta.sector}`}>{r.meta.ticker}</td>
      {effMetricKeys.map((mk, i) => (
        <Fragment key={mk}>{renderMetricCells(r.byMetric[mk], effMetrics[i])}</Fragment>
      ))}
    </tr>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Mode</div>
          <div className="flex rounded border border-border/40 overflow-hidden h-7">
            {(["single", "pairs"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setPairMode(m === "pairs")}
                data-testid={`rerate-mode-${m}`}
                className={`px-2.5 text-xs font-medium ${(m === "pairs") === pairMode ? "bg-sky-500/20 text-sky-200" : "text-muted-foreground hover:bg-accent"}`}>
                {m === "single" ? "Single" : "Pairs"}
              </button>
            ))}
          </div>
        </div>
        {pairMode && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Ratio</div>
            <div className="flex rounded border border-border/40 overflow-hidden h-7">
              {(["price", "multiple"] as const).map((bss) => (
                <button key={bss} type="button" onClick={() => setPairBasis(bss)}
                  data-testid={`rerate-basis-${bss}`}
                  className={`px-2.5 text-xs font-medium ${pairBasis === bss ? "bg-sky-500/20 text-sky-200" : "text-muted-foreground hover:bg-accent"}`}>
                  {bss === "price" ? "Price" : "Metric"}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={pairMode && pairBasis === "price" ? "opacity-40 pointer-events-none" : ""}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{pairMode ? "Metric (for ratio)" : "Metrics"}</div>
          <RerateMetricPicker selected={metricKeys} onChange={setMetrics} />
        </div>
        <div title="For valuation multiples this is a PRICE move (the metric re-rates with it). For any other metric, read it as a move in the metric itself.">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Move %</div>
          <Input
            type="number" value={pctMove}
            onChange={(e) => setPctMove(Number(e.target.value))}
            className="h-7 w-24 text-xs" step={5}
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">History</div>
          <Select value={String(lookbackDays)} onValueChange={(v) => setLookbackDays(Number(v))}>
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOOKBACKS.map((l) => (
                <SelectItem key={l.days} value={String(l.days)} className="text-xs">{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Group by</div>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupLevel)}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GROUP_LEVELS.map((g) => (
                <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {CLASS_FILTER_DEFS.map((d) => (
          <div key={d.key}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{d.label}</div>
            <Select value={classFilters[d.key]} onValueChange={(v) => setClassFilter(d.key, v)}>
              <SelectTrigger className={`h-7 w-32 text-xs ${classFilters[d.key] !== "all" ? "border-primary/60 text-primary" : ""}`}><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {classOptions[d.key].map((s) => <SelectItem key={s} value={s} className="text-xs">{s === "all" ? "All" : s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Geography</div>
          <div className="flex items-center gap-1.5 h-7">{geo.geoFilterUI}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Basket</div>
          <BasketScopeSelect scope={basketScope} />
        </div>
        <div className="flex-1 min-w-[120px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Search</div>
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ticker / name" className="h-7 text-xs max-w-[220px]"
          />
        </div>
        <div className="text-[11px] text-muted-foreground ml-auto self-center">
          {visible.length} {pairMode ? "pairs" : "names"}
          {pairMode && pairLegOverflow > 0 && (
            <span className="text-amber-400/80" title={`Capped at ${MAX_PAIR_LEGS} legs — narrow the universe with the filters to include the other ${pairLegOverflow}.`}> · {pairLegOverflow} legs over cap</span>
          )}
        </div>
      </div>

      {/* Explainer */}
      <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border flex items-start gap-1.5">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          <b>Pro-forma</b> = the metric after a {fmtMove(pctMove)} move (a price move for valuation multiples; a move in the metric itself for anything else), with its percentile/z vs the stock's own {LOOKBACKS.find((l) => l.days === lookbackDays)?.label ?? ""} history.
          {" "}<b>→Median / ↑Rich / ↓Cheap</b> = implied % move to re-rate to that historical level — your upside/downside room.
          {effMetrics.some((m) => m.approx) && <em className="text-amber-400"> EV-based multiples assume EV moves with equity (ignores leverage) — approximate.</em>}
          {pairMode && <em className="text-sky-300/80"> Pairs: each row is the A/B {pairBasis === "price" ? "price" : "metric"} ratio; ↑Rich / ↓Cheap are implied relative moves to re-rate the ratio to its own extremes.</em>}
        </span>
      </div>

      {/* Table — one full stat group per selected metric, horizontally scrollable */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full text-xs font-mono">
          <thead className="sticky top-0 bg-card z-10 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className={`px-1 py-1 w-7 ${STICKY0} z-20`} title="Open in Charts" rowSpan={2} />
              <th
                className={`px-2 py-1 text-left cursor-pointer hover:text-foreground select-none ${STICKY1} z-20`}
                onClick={() => toggleSort("ticker", null)}
                rowSpan={2}
              >
                {pairMode ? "Pair" : "Ticker"} <SortIcon col="ticker" metricKey={null} />
              </th>
              {effMetrics.map((m, i) => (
                <th key={m.key} colSpan={10} className={`px-2 py-1 text-center normal-case ${i > 0 ? "border-l border-border/60" : ""}`}>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground/80">
                    {m.label}
                    {!pairMode && metricKeys.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMetric(m.key)}
                        title={`Remove ${m.label}`}
                        className="opacity-40 hover:opacity-100 hover:text-red-400 leading-none"
                      >×</button>
                    )}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {effMetrics.map((m) => <Fragment key={m.key}>{metricHeaderCells(m)}</Fragment>)}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={totalCols} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && visible.length === 0 && (
              <tr><td colSpan={totalCols} className="px-3 py-6 text-center text-muted-foreground">No data for the selected metrics / universe.</td></tr>
            )}
            {!isLoading && !grouped && visible.map(renderRow)}
            {!isLoading && grouped && grouped.map(([groupName, groupRows]) => (
              <Fragment key={groupName}>
                <tr className="bg-muted/40 border-y border-border">
                  <td colSpan={totalCols} className={`px-2 py-1 text-left text-[11px] font-semibold text-foreground/80 uppercase tracking-wider ${STICKY0}`}>
                    {groupName}
                    <span className="text-muted-foreground font-normal normal-case"> · {groupRows.length}</span>
                  </td>
                </tr>
                {groupRows.map(renderRow)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
