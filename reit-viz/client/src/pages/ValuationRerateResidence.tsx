// Re-Rate + Residence — the merged valuation-history explorer. One table, one
// data pass, per ticker × metric: where the metric sits now (level / richness /
// z), what a ±X% move does to it (pro-forma + how rare that level is), the
// implied moves to its historical anchors (median / rich / cheap ends), and how
// much time it has actually LIVED at each level (occupancy bands, tail visits,
// and the forward return that followed). Everything is oriented to "richness":
// 100 = most expensive vs own history, 0 = cheapest, regardless of the metric.
import { useState, useMemo, Fragment } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getMetricSeries } from "@/lib/dataService";
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
import { ArrowUp, ArrowDown, ArrowUpDown, Info, LineChart, X } from "lucide-react";
import {
  LOOKBACKS, getRerateMetric, buildRerateRow,
  type RerateRow, type RerateMetric, type CriticalLevel,
} from "@/lib/valuationRerate";
import {
  buildResidence, RESIDENCE_BAND_LABELS, type ResidenceResult, type PctBasis,
} from "@/lib/percentileResidence";

const HORIZONS = [
  { days: 21, label: "1M" },
  { days: 63, label: "3M" },
  { days: 126, label: "6M" },
];

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

const CLASS_FILTER_DEFS = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Ind. Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
] as const;
const DEFAULT_CLASS_FILTERS: Record<string, string> = Object.fromEntries(CLASS_FILTER_DEFS.map((d) => [d.key, "all"]));

type TickerMetaLite = {
  ticker: string; name: string;
  economy: string; sector: string; subsector: string;
  industryGroup: string; industry: string; subindustry: string;
  legA?: string; legB?: string;
};
// One table row per ticker; per metric it carries BOTH stat families computed
// from the same series (either may be null on thin history).
type Cell = { rr: RerateRow | null; res: ResidenceResult | null };
type MultiRow = { meta: TickerMetaLite; byMetric: Record<string, Cell> };

// ── formatting / color helpers ─────────────────────────────────────────────
const fmtVal = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(Math.abs(v) < 10 ? 2 : 1)) : "—");
const fmtPct = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v.toFixed(0) : "—");
const fmtMove = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` : "—");
const fmtZ = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}` : "—");
const fmtRet = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—");
const fmtNum = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? v.toFixed(0) : "—");

// richness: 100 = expensive/red, 0 = cheap/green — one convention everywhere
const richColor = (r: number | undefined) =>
  r === undefined || !Number.isFinite(r) ? "text-muted-foreground" : r >= 75 ? "text-red-400" : r >= 40 ? "text-amber-400" : "text-emerald-400";
const moveColor = (v: number | undefined) =>
  v === undefined || !Number.isFinite(v) ? "text-muted-foreground" : v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-muted-foreground";
const retColor = moveColor;
const richOf = (pctile: number, lowIsCheap: boolean): number =>
  lowIsCheap ? pctile : 100 - pctile;

const rrOf = (rr: RerateRow | null): number =>
  rr && Math.abs(rr.toCheap) > 0 && Number.isFinite(rr.toRich) ? rr.toRich / Math.abs(rr.toCheap) : NaN;

// Critical-mode reward:risk = upside room to resistance ÷ downside room to support.
const critRatio = (rr: RerateRow | null): number => {
  const s = rr?.critical?.support?.move, r = rr?.critical?.resistance?.move;
  return s !== undefined && r !== undefined && Math.abs(s) > 1e-6 && Number.isFinite(r) ? Math.abs(r) / Math.abs(s) : NaN;
};
const critTitle = (lvl: CriticalLevel | null | undefined, side: string): string =>
  lvl ? `${side}: ${lvl.label} @ ${fmtVal(lvl.price)} · ${fmtMove(lvl.move)} away · rich ${fmtPct(lvl.rich)}%` : `No ${side.toLowerCase()} level detected`;

const MIN_TAIL_N = 60;
const BAND_COLORS = ["#34d399", "#6ee7b7", "#fcd34d", "#fbbf24", "#f87171", "#ef4444"];
function OccupancyBar({ residence, wide = false }: { residence: number[]; wide?: boolean }) {
  return (
    <div className={`flex h-3 ${wide ? "w-full h-5" : "w-28"} rounded-sm overflow-hidden border border-border/40`} title={residence.map((p, i) => `${RESIDENCE_BAND_LABELS[i]}: ${p.toFixed(0)}%`).join("  ·  ")}>
      {residence.map((p, i) => (
        <div key={i} style={{ width: `${p}%`, backgroundColor: BAND_COLORS[i] }} className="flex items-center justify-center">
          {wide && p >= 8 && <span className="text-[8px] text-black/70 font-bold">{p.toFixed(0)}%</span>}
        </div>
      ))}
    </div>
  );
}

type SortCol =
  | "ticker"
  // core (level + pro-forma)
  | "m0" | "rich" | "z" | "proForma" | "pfRich" | "seen"
  // re-rate room
  | "toMedian" | "toRich" | "toCheap" | "rr"
  // residence
  | "richPctTime" | "cheapPctTime" | "richCount" | "cheapCount" | "fwdRich" | "fwdCheap" | "edge";
const FWD_COLS = new Set<SortCol>(["fwdRich", "fwdCheap", "edge"]);

export default function ValuationRerateResidence() {
  const [, setLocation] = useLocation();
  const { filteredTickersList } = useUniverse();
  // View-defining controls persist across reloads.
  const [metricKeys, setMetricKeys] = usePersistedState<string[]>("reit-viz:vrr:metricKeys", ["P/FFO FY2"]);
  const [pctMove, setPctMove] = usePersistedState("reit-viz:vrr:pctMove", 20);
  // Scenario anchor: a fixed % move, or the nearest critical levels (support /
  // resistance) detected on each metric's own history.
  const [levelMode, setLevelMode] = usePersistedState<"percent" | "critical">("reit-viz:vrr:levelMode", "percent");
  const criticalMode = levelMode === "critical";
  const [lookbackDays, setLookbackDays] = usePersistedState("reit-viz:vrr:lookbackDays", 1260);
  const [basis, setBasis] = usePersistedState<PctBasis>("reit-viz:vrr:basis", "trailing");
  const [horizon, setHorizon] = usePersistedState("reit-viz:vrr:horizon", 63);
  const [showRerate, setShowRerate] = usePersistedState("reit-viz:vrr:showRerate", true);
  const [showResidence, setShowResidence] = usePersistedState("reit-viz:vrr:showResidence", true);
  const [groupBy, setGroupBy] = usePersistedState<GroupLevel>("reit-viz:vrr:groupBy", "none");
  const [search, setSearch] = useState("");
  const [pairMode, setPairMode] = usePersistedState("reit-viz:vrr:pairMode", false);
  const [pairBasis, setPairBasis] = usePersistedState<PairBasis>("reit-viz:vrr:pairBasis", "price");
  // User-pinned pair rows ("A/B") shown alongside single-ticker rows: per
  // selected metric, the A÷B ratio of the two names' MULTIPLES runs through the
  // same rerate/residence math, with forward returns on the A/B PRICE ratio.
  const [customPairs, setCustomPairs] = usePersistedState<string[]>("reit-viz:rerate-pairs", []);
  const addCustomPair = (raw: string) => {
    const m = raw.trim().toUpperCase().match(/^([A-Z0-9.\-]{1,12})\s*\/\s*([A-Z0-9.\-]{1,12})$/);
    if (!m || m[1] === m[2]) return;
    const key = `${m[1]}/${m[2]}`;
    setCustomPairs((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };
  const [classFilters, setClassFilters] = usePersistedState<Record<string, string>>("reit-viz:vrr:classFilters", DEFAULT_CLASS_FILTERS);
  const setClassFilter = (key: string, value: string) => {
    const idx = CLASS_FILTER_DEFS.findIndex((d) => d.key === key);
    setClassFilters((prev) => {
      const next = { ...prev, [key]: value };
      for (let i = idx + 1; i < CLASS_FILTER_DEFS.length; i++) next[CLASS_FILTER_DEFS[i].key] = "all";
      return next;
    });
  };
  const [sortCol, setSortCol] = useState<SortCol>("rich");
  const [sortMetric, setSortMetric] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detail, setDetail] = useState<{ meta: TickerMetaLite; cell: Cell; metric: RerateMetric } | null>(null);

  // At least one section stays on.
  const toggleSection = (which: "rerate" | "residence") => {
    if (which === "rerate") setShowRerate(showRerate && showResidence ? false : true);
    else setShowResidence(showResidence && showRerate ? false : true);
  };

  const setMetrics = (keys: string[]) => setMetricKeys(keys.length ? keys : metricKeys);
  const removeMetric = (key: string) =>
    setMetricKeys(metricKeys.length > 1 ? metricKeys.filter((k) => k !== key) : metricKeys);
  const metrics = useMemo(() => metricKeys.map((k) => getRerateMetric(k)), [metricKeys]);
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
  const geo = useGeoFilter(tickers, "vrr-geo");
  const basketScope = useBasketScope("reit-viz:basket-scope:val-rerate-residence");

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

  // Both stat families from ONE series fetch per ticker × metric.
  const computeCell = (
    meta: { ticker: string; name: string } & Partial<TickerMetaLite>,
    series: { time: string; value: number }[],
    close: { time: string; value: number }[],
    metric: RerateMetric,
  ): Cell | null => {
    const res = buildResidence(series, close, {
      basis, window: lookbackDays, pctMove,
      dir: metric.dir, lowIsCheap: metric.lowIsCheap,
      horizons: HORIZONS.map((h) => h.days),
      skipFirstYear: true,
    });
    const vals = series.map((p) => p.value);
    // Match the residence basis: expanding judges vs ALL history, trailing vs
    // the window — so Rich% and the re-rate stats share one reference frame.
    const trailing = basis === "expanding" || lookbackDays >= vals.length ? vals : vals.slice(-lookbackDays);
    const rr = buildRerateRow(meta, trailing, pctMove, metric, { critical: criticalMode });
    if (!rr && !res) return null;
    return { rr, res };
  };

  const metricsSig = metricKeys.join("|");
  const { data: singleRows = [], isLoading: singleLoading } = useQuery({
    queryKey: ["vrr-single", metricsSig, basis, lookbackDays, pctMove, levelMode, tickerKey],
    queryFn: async () => {
      const out: MultiRow[] = [];
      const batchSize = 12;
      for (let b = 0; b < tickers.length; b += batchSize) {
        const batch = tickers.slice(b, b + batchSize);
        const results = await Promise.all(batch.map(async (t) => {
          const close = await getMetricSeries(t.ticker, "close").catch(() => []);
          const byMetric: Record<string, Cell> = {};
          for (const mk of metricKeys) {
            const m = getRerateMetric(mk);
            const series = await getMetricSeries(t.ticker, mk).catch(() => []);
            const cell = computeCell(t, series, close, m);
            if (cell) byMetric[mk] = cell;
          }
          return Object.keys(byMetric).length ? { meta: t, byMetric } : null;
        }));
        for (const r of results) if (r) out.push(r);
      }
      return out;
    },
    enabled: !pairMode && tickers.length > 0 && metricKeys.length > 0,
  });

  // Pairs: the filtered universe forms the legs, capped (n²).
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
    queryKey: ["vrr-pairs", pairBasis, pairMetricKey, basis, lookbackDays, pctMove, levelMode, pairLegKey],
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
        if (ratio.length < 30) continue;
        const meta: TickerMetaLite = {
          ticker: `${A.ticker}/${B.ticker}`, name: `${A.name} / ${B.name}`,
          economy: A.economy, sector: A.sector, subsector: A.subsector,
          industryGroup: A.industryGroup, industry: A.industry, subindustry: A.subindustry,
          legA: A.ticker, legB: B.ticker,
        };
        // Forward returns are the ratio's own (pass ratio as the "close").
        const cell = computeCell(meta, ratio, ratio, PAIR_RATIO_METRIC);
        if (cell) out.push({ meta, byMetric: { [PAIR_RATIO_METRIC.key]: cell } });
        if (i % 200 === 199) await new Promise((r) => setTimeout(r));
      }
      return out;
    },
    enabled: pairMode && pairLegs.length >= 2 && (pairBasis === "price" || !!pairMetricKey),
  });

  // User-pinned pair rows (single mode): multiple-ratio series judged against
  // its own history, forward returns conditioned on the price ratio. A pair ×
  // metric where either leg lacks the metric is skipped quietly.
  const customPairsSig = customPairs.join("|");
  const { data: customPairRows = [] } = useQuery({
    queryKey: ["vrr-custom-pairs", metricsSig, basis, lookbackDays, pctMove, levelMode, customPairsSig, tickerKey],
    queryFn: async () => {
      const out: MultiRow[] = [];
      for (const pairKey of customPairs) {
        const [a, b] = pairKey.split("/");
        const [closeA, closeB] = await Promise.all([
          getMetricSeries(a, "close").catch(() => []),
          getMetricSeries(b, "close").catch(() => []),
        ]);
        const priceRatio = ratioSeries(closeA, closeB);
        if (priceRatio.length < 30) continue;
        const A = tickers.find((t) => t.ticker === a), B = tickers.find((t) => t.ticker === b);
        const meta: TickerMetaLite = {
          ticker: pairKey, name: `${A?.name ?? a} / ${B?.name ?? b}`,
          economy: A?.economy ?? "", sector: A?.sector ?? "", subsector: A?.subsector ?? "",
          industryGroup: A?.industryGroup ?? "", industry: A?.industry ?? "", subindustry: A?.subindustry ?? "",
          legA: a, legB: b,
        };
        const byMetric: Record<string, Cell> = {};
        for (const mk of metricKeys) {
          const m = getRerateMetric(mk);
          const [sA, sB] = await Promise.all([
            getMetricSeries(a, mk).catch(() => []),
            getMetricSeries(b, mk).catch(() => []),
          ]);
          if (!sA.length || !sB.length) continue;
          const mulRatio = ratioSeries(sA, sB);
          if (mulRatio.length < 30) continue;
          // Same orientation as the underlying metric: for direct multiples a
          // LOW ratio = A cheap vs B; for yields the reading inverts with it.
          const cell = computeCell(meta, mulRatio, priceRatio, m);
          if (cell) byMetric[mk] = cell;
        }
        if (Object.keys(byMetric).length) out.push({ meta, byMetric });
      }
      return out;
    },
    enabled: !pairMode && customPairs.length > 0 && metricKeys.length > 0,
  });

  const rows = pairMode ? pairRows : singleRows;
  const isLoading = pairMode ? pairLoading : singleLoading;

  // Unified richness for a cell (residence's as-of value wins; falls back to the
  // re-rate percentile converted to the richness orientation).
  const cellRich = (c: Cell | undefined, m: RerateMetric): number =>
    c?.res ? c.res.currentRich : c?.rr ? richOf(c.rr.nowPctile, m.lowIsCheap) : NaN;
  const cellPfRich = (c: Cell | undefined, m: RerateMetric): number =>
    c?.res ? c.res.proFormaRich : c?.rr ? richOf(c.rr.proFormaPctile, m.lowIsCheap) : NaN;

  const tailReliable = (c: Cell | undefined, col: SortCol): boolean => {
    const f = c?.res?.fwd[horizon];
    if (!f) return false;
    return (col === "fwdCheap" ? f.cheap.n : f.rich.n) >= MIN_TAIL_N;
  };

  const sortValue = (row: MultiRow, col: SortCol): number | string => {
    if (col === "ticker") return row.meta.ticker;
    const c = row.byMetric[effSortMetric];
    if (!c) return -Infinity;
    const m = effMetrics[effMetricKeys.indexOf(effSortMetric)] ?? effMetrics[0];
    let v: number;
    switch (col) {
      case "m0": v = c.rr?.m0 ?? c.res?.m0 ?? NaN; break;
      case "rich": v = cellRich(c, m); break;
      case "z": v = c.rr?.nowZ ?? NaN; break;
      case "proForma": v = criticalMode ? (c.rr?.critical?.support?.move ?? NaN) : (c.rr?.proForma ?? NaN); break;
      case "pfRich": v = criticalMode ? (c.rr?.critical?.resistance?.move ?? NaN) : cellPfRich(c, m); break;
      case "seen": v = criticalMode ? critRatio(c.rr) : (c.res?.proFormaFreqRicher ?? NaN); break;
      case "toMedian": v = c.rr?.toMedian ?? NaN; break;
      case "toRich": v = c.rr?.toRich ?? NaN; break;
      case "toCheap": v = c.rr?.toCheap ?? NaN; break;
      case "rr": v = rrOf(c.rr); break;
      case "richPctTime": v = c.res?.richPctTime ?? NaN; break;
      case "cheapPctTime": v = c.res?.cheapPctTime ?? NaN; break;
      case "richCount": v = c.res?.richCount ?? NaN; break;
      case "cheapCount": v = c.res?.cheapCount ?? NaN; break;
      case "fwdRich": v = c.res?.fwd[horizon]?.rich.median ?? NaN; break;
      case "fwdCheap": v = c.res?.fwd[horizon]?.cheap.median ?? NaN; break;
      case "edge": {
        const f = c.res?.fwd[horizon];
        v = f ? f.rich.median - f.base.median : NaN; break;
      }
      default: v = NaN;
    }
    return Number.isFinite(v) ? v : -Infinity;
  };

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    let r = pairMode
      ? rows.slice()
      // Pinned pair rows bypass the universe filters (they're explicit picks).
      : [...customPairRows, ...rows.filter((x) =>
          CLASS_FILTER_DEFS.every((d) => classFilters[d.key] === "all" || (x.meta as any)[d.key] === classFilters[d.key])
          && geo.matchesGeo(x.meta.ticker)
          && basketScope.inScope(x.meta.ticker))];
    if (q) r = r.filter((x) => x.meta.ticker.includes(q) || x.meta.name.toUpperCase().includes(q));
    r = [...r].sort((a, b) => {
      if (FWD_COLS.has(sortCol)) {
        const ra = tailReliable(a.byMetric[effSortMetric], sortCol), rb = tailReliable(b.byMetric[effSortMetric], sortCol);
        if (ra !== rb) return ra ? -1 : 1;
      }
      const av = sortValue(a, sortCol), bv = sortValue(b, sortCol);
      const cmp = typeof av === "string" || typeof bv === "string"
        ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [rows, customPairRows, search, sortCol, effSortMetric, sortDir, horizon, classFilters, geo.matchesGeo, basketScope.members, pairMode]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, MultiRow[]>();
    for (const r of visible) {
      const key = ((r.meta as any)[groupBy] as string) || "—";
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, groupBy]);

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
    <th className={`px-2 py-1 text-right whitespace-nowrap cursor-pointer hover:text-foreground select-none ${sep ? "border-l border-border/60" : ""}`}
      onClick={() => toggleSort(col, metricKey)} title={title}>
      {label} <SortIcon col={col} metricKey={metricKey} />
    </th>
  );

  const hLabel = HORIZONS.find((h) => h.days === horizon)?.label ?? "";
  const colsPerMetric = 6 + (showRerate ? 4 : 0) + (showResidence ? 8 : 0);
  const totalCols = 2 + effMetrics.length * colsPerMetric;

  const metricHeaderCells = (m: RerateMetric) => (
    <>
      {/* Level + pro-forma (always) */}
      <Th col="m0" label="Now" title="Current value" metricKey={m.key} sep />
      <Th col="rich" label="Rich%" title="Richness percentile vs own history (100 = most expensive, 0 = cheapest; orientation-aware)" metricKey={m.key} />
      <Th col="z" label="z" title="Current z-score vs history" metricKey={m.key} />
      {criticalMode ? (
        <>
          <Th col="proForma" label="↓Supp" title="Implied % move to the nearest SUPPORT level (downside room) detected on this metric's own history" metricKey={m.key} />
          <Th col="pfRich" label="↑Res" title="Implied % move to the nearest RESISTANCE level (upside room) detected on this metric's own history" metricKey={m.key} />
          <Th col="seen" label="S↔R" title="Reward:risk to the nearest levels = upside room to resistance ÷ downside room to support" metricKey={m.key} />
        </>
      ) : (
        <>
          <Th col="proForma" label={`@${fmtMove(pctMove)}`} title={`Pro-forma value after a ${fmtMove(pctMove)} move (price move for valuation multiples)`} metricKey={m.key} />
          <Th col="pfRich" label="Rich%" title="Pro-forma richness percentile (ATH = never been this rich)" metricKey={m.key} />
          <Th col="seen" label="Seen%" title="% of history at least as rich as the pro-forma level (low = rare)" metricKey={m.key} />
        </>
      )}
      {/* Re-rate room */}
      {showRerate && (
        <>
          <Th col="toMedian" label="→Med" title="Implied % move to re-rate to the historical median" metricKey={m.key} sep />
          <Th col="toRich" label="↑Rich" title="Implied % move to the rich end of history (p90) — upside room" metricKey={m.key} />
          <Th col="toCheap" label="↓Cheap" title="Implied % move to the cheap end of history (p10) — downside risk" metricKey={m.key} />
          <Th col="rr" label="R:R" title="Reward/risk = upside ÷ |downside|" metricKey={m.key} />
        </>
      )}
      {/* Residence */}
      {showResidence && (
        <>
          <Th col="richPctTime" label="≥90%" title="% of history spent in the rich tail (≥90th richness)" metricKey={m.key} sep />
          <Th col="cheapPctTime" label="≤10%" title="% of history spent in the cheap tail (≤10th richness)" metricKey={m.key} />
          <Th col="richCount" label="Runs≥90" title="Distinct visits to the rich tail (median run length)" metricKey={m.key} />
          <Th col="cheapCount" label="Runs≤10" title="Distinct visits to the cheap tail (median run length)" metricKey={m.key} />
          <Th col="fwdRich" label={`Fwd@90`} title={`Median ${hLabel} forward return when rich (≥90)`} metricKey={m.key} />
          <Th col="fwdCheap" label={`Fwd@10`} title={`Median ${hLabel} forward return when cheap (≤10)`} metricKey={m.key} />
          <Th col="edge" label="Edge" title="Rich-tail forward return minus unconditional baseline" metricKey={m.key} />
          <th className="px-2 py-1 text-left" title="Time spent per richness band (green = cheap, red = rich)">Occ.</th>
        </>
      )}
    </>
  );

  const openInCharts = (ticker: string) => {
    try {
      sessionStorage.setItem("reit-viz:rerate-to-charts",
        JSON.stringify({ ticker, metricKey: effSortMetric, lookbackDays }));
    } catch {}
    setLocation("/");
  };

  const STICKY0 = "sticky left-0 bg-card z-10";
  const STICKY1 = "sticky left-7 bg-card z-10";
  const lowMark = <span className="text-[8px] align-super text-amber-400/70">*</span>;

  const renderMetricCells = (meta: TickerMetaLite, c: Cell | undefined, m: RerateMetric) => {
    if (!c) return (
      <>
        {Array.from({ length: colsPerMetric }).map((_, i) => (
          <td key={i} className={`px-2 py-1 text-right text-muted-foreground/40 ${i === 0 ? "border-l border-border/60" : ""}`}>—</td>
        ))}
      </>
    );
    const { rr, res } = c;
    const f = res?.fwd[horizon];
    const edge = f ? f.rich.median - f.base.median : NaN;
    const richLow = !f || f.rich.n < MIN_TAIL_N;
    const cheapLow = !f || f.cheap.n < MIN_TAIL_N;
    const rich = cellRich(c, m), pfRich = cellPfRich(c, m);
    const onCell = () => setDetail({ meta, cell: c, metric: m });
    const cls = "px-2 py-1 text-right cursor-pointer";
    return (
      <>
        <td onClick={onCell} className={`${cls} border-l border-border/60`}>{fmtVal(rr?.m0 ?? res?.m0)}</td>
        <td onClick={onCell} className={`${cls} ${richColor(rich)}`}>{fmtPct(rich)}</td>
        <td onClick={onCell} className={`${cls} text-muted-foreground`}>{fmtZ(rr?.nowZ)}</td>
        {criticalMode ? (
          <>
            <td onClick={onCell} className={`${cls} ${moveColor(rr?.critical?.support?.move)}`} title={critTitle(rr?.critical?.support, "Support")}>{fmtMove(rr?.critical?.support?.move)}</td>
            <td onClick={onCell} className={`${cls} ${moveColor(rr?.critical?.resistance?.move)}`} title={critTitle(rr?.critical?.resistance, "Resistance")}>{fmtMove(rr?.critical?.resistance?.move)}</td>
            <td onClick={onCell} className={`${cls} text-muted-foreground`}>{Number.isFinite(critRatio(rr)) ? critRatio(rr).toFixed(2) : "—"}</td>
          </>
        ) : (
          <>
            <td onClick={onCell} className={cls}>{fmtVal(rr?.proForma)}</td>
            <td onClick={onCell} className={`${cls} ${richColor(pfRich)}`}>
              {fmtPct(pfRich)}{res?.proFormaUnprecedented && <span className="ml-1 text-[9px] text-red-400 font-bold">ATH</span>}
            </td>
            <td onClick={onCell} className={`${cls} text-muted-foreground`}>{fmtPct(res?.proFormaFreqRicher)}</td>
          </>
        )}
        {showRerate && (
          <>
            <td onClick={onCell} className={`${cls} border-l border-border/60 ${moveColor(rr?.toMedian)}`}>{fmtMove(rr?.toMedian)}</td>
            <td onClick={onCell} className={`${cls} ${moveColor(rr?.toRich)}`}>{fmtMove(rr?.toRich)}</td>
            <td onClick={onCell} className={`${cls} ${moveColor(rr?.toCheap)}`}>{fmtMove(rr?.toCheap)}</td>
            <td onClick={onCell} className={`${cls} text-muted-foreground`}>{Number.isFinite(rrOf(rr)) ? rrOf(rr).toFixed(2) : "—"}</td>
          </>
        )}
        {showResidence && (
          <>
            <td onClick={onCell} className={`${cls} border-l border-border/60 text-red-400/80`}>{fmtPct(res?.richPctTime)}</td>
            <td onClick={onCell} className={`${cls} text-emerald-400/80`}>{fmtPct(res?.cheapPctTime)}</td>
            <td onClick={onCell} className={`${cls} text-muted-foreground`}>
              {fmtNum(res?.richCount)}{res && Number.isFinite(res.richMedDur) ? <span className="text-muted-foreground/50"> ({fmtNum(res.richMedDur)}d)</span> : null}
            </td>
            <td onClick={onCell} className={`${cls} text-muted-foreground`}>
              {fmtNum(res?.cheapCount)}{res && Number.isFinite(res.cheapMedDur) ? <span className="text-muted-foreground/50"> ({fmtNum(res.cheapMedDur)}d)</span> : null}
            </td>
            <td onClick={onCell} className={`${cls} ${retColor(f?.rich.median)} ${richLow ? "opacity-40" : ""}`} title={f ? `n=${f.rich.n} days${richLow ? " — low sample" : ""}` : ""}>{fmtRet(f?.rich.median)}{richLow && f ? lowMark : null}</td>
            <td onClick={onCell} className={`${cls} ${retColor(f?.cheap.median)} ${cheapLow ? "opacity-40" : ""}`} title={f ? `n=${f.cheap.n} days${cheapLow ? " — low sample" : ""}` : ""}>{fmtRet(f?.cheap.median)}{cheapLow && f ? lowMark : null}</td>
            <td onClick={onCell} className={`${cls} ${retColor(edge)} ${richLow ? "opacity-40" : ""}`}>{fmtRet(edge)}{richLow && f ? lowMark : null}</td>
            <td onClick={onCell} className="px-2 py-1 cursor-pointer">{res ? <OccupancyBar residence={res.residence} /> : <span className="text-muted-foreground/40">—</span>}</td>
          </>
        )}
      </>
    );
  };

  const renderRow = (row: MultiRow) => {
    const isPairRow = !!(row.meta.legA && row.meta.legB);
    return (
    <tr key={row.meta.ticker} className="border-b border-border/40 hover:bg-muted/30" data-testid={isPairRow && !pairMode ? `rerate-pair-row-${row.meta.ticker.replace("/", "-")}` : undefined}>
      <td className={`px-1 py-1 text-center ${STICKY0}`}>
        <button type="button"
          onClick={() => isPairRow ? navigateToPairs(row.meta.legA!, row.meta.legB!) : openInCharts(row.meta.ticker)}
          title={isPairRow ? `Open ${row.meta.ticker} in Pairs` : `Chart ${row.meta.ticker} — ${effSortMetric} with percentile, z-score & reward:risk over time`}
          className="text-muted-foreground hover:text-foreground">
          <LineChart className="w-3.5 h-3.5" />
        </button>
      </td>
      <td className={isPairRow && !pairMode ? `px-2 py-1 text-left font-semibold ${STICKY1} text-purple-300` : `px-2 py-1 text-left font-semibold ${STICKY1}`}
        title={isPairRow && !pairMode ? `${row.meta.name} · A/B multiple ratio (fwd returns on the price ratio)` : `${row.meta.name} · ${row.meta.sector}`}>{row.meta.ticker}</td>
      {effMetricKeys.map((mk, i) => (
        <Fragment key={mk}>{renderMetricCells(row.meta, row.byMetric[mk], effMetrics[i])}</Fragment>
      ))}
    </tr>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="vrr-page">
      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Mode</div>
          <div className="flex rounded border border-border/40 overflow-hidden h-7">
            {(["single", "pairs"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setPairMode(m === "pairs")}
                data-testid={`vrr-mode-${m}`}
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
                  data-testid={`vrr-basis-${bss}`}
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
        {!pairMode && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Pairs</div>
            <div className="flex items-center gap-1 flex-wrap min-h-7">
              <Input placeholder="Pair A/B" data-testid="rerate-pair-input" className="h-7 w-24 text-xs"
                title="Pin a relative-value pair row (e.g. WELL/VTR): each selected metric's A÷B multiple ratio runs through the same rerate/residence stats, with forward returns on the A/B price ratio."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addCustomPair((e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = "";
                  }
                }} />
              {customPairs.map((p) => (
                <span key={p} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-purple-500/40 bg-purple-500/10 text-purple-300 text-[10px] font-mono" data-testid={`rerate-pair-chip-${p.replace("/", "-")}`}>
                  {p}
                  <button className="hover:text-foreground" onClick={() => setCustomPairs((prev) => prev.filter((x) => x !== p))} title="Remove pair">×</button>
                </span>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Columns</div>
          <div className="flex rounded border border-border/40 overflow-hidden h-7">
            <button type="button" onClick={() => toggleSection("rerate")} data-testid="vrr-cols-rerate"
              title="Implied re-rate moves: →Med / ↑Rich / ↓Cheap / R:R"
              className={`px-2.5 text-xs font-medium ${showRerate ? "bg-sky-500/20 text-sky-200" : "text-muted-foreground hover:bg-accent"}`}>
              Re-rate
            </button>
            <button type="button" onClick={() => toggleSection("residence")} data-testid="vrr-cols-residence"
              title="Time-in-band occupancy, tail visits & forward returns"
              className={`px-2.5 text-xs font-medium ${showResidence ? "bg-sky-500/20 text-sky-200" : "text-muted-foreground hover:bg-accent"}`}>
              Residence
            </button>
          </div>
        </div>
        <div title="Anchor the scenario on a fixed % move, or on the nearest critical levels (support/resistance, MAs, Fibonacci, 52wk high/low) detected on each metric's own history.">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Anchor</div>
          <div className="inline-flex h-7 rounded border border-border overflow-hidden">
            <button
              className={`px-2 text-xs ${!criticalMode ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setLevelMode("percent")}
              data-testid="vrr-anchor-percent"
            >% Move</button>
            <button
              className={`px-2 text-xs ${criticalMode ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setLevelMode("critical")}
              data-testid="vrr-anchor-critical"
            >Critical</button>
          </div>
        </div>
        {!criticalMode && (
          <div title="For valuation multiples this is a PRICE move (the metric re-rates with it). For any other metric, read it as a move in the metric itself.">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Move %</div>
            <Input type="number" value={pctMove} onChange={(e) => setPctMove(Number(e.target.value))} className="h-7 w-20 text-xs" step={5} data-testid="vrr-pctmove" />
          </div>
        )}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Basis</div>
          <Select value={basis} onValueChange={(v) => setBasis(v as PctBasis)}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="trailing" className="text-xs">Trailing</SelectItem>
              <SelectItem value="expanding" className="text-xs">Expanding</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className={basis === "trailing" ? "" : "opacity-40 pointer-events-none"}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">History</div>
          <Select value={String(lookbackDays)} onValueChange={(v) => setLookbackDays(Number(v))}>
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOOKBACKS.map((l) => <SelectItem key={l.days} value={String(l.days)} className="text-xs">{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Fwd horizon</div>
          <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HORIZONS.map((h) => <SelectItem key={h.days} value={String(h.days)} className="text-xs">{h.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Group by</div>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupLevel)}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GROUP_LEVELS.map((g) => <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>)}
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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ticker / name" className="h-7 text-xs max-w-[220px]" />
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
          <b>Rich%</b> = richness vs the stock's own {basis === "trailing" ? `trailing ${LOOKBACKS.find((l) => l.days === lookbackDays)?.label}` : "expanding"} history (100 = most expensive, 0 = cheapest; orientation-aware, so yields invert).
          {" "}<b>@{fmtMove(pctMove)}</b> = pro-forma level after the move (a price move for valuation multiples), <b>Seen%</b> = how much of history was at least that rich (<b>ATH</b> = never).
          {showRerate && <> <b>→Med / ↑Rich / ↓Cheap</b> = implied % move to re-rate to that historical anchor — upside/downside room.</>}
          {showResidence && <> <b>≥90 / ≤10</b> = share of history in the rich/cheap tail; <b>Fwd@90 / Fwd@10</b> = median {hLabel} forward return from those tails; <b>Edge</b> = rich-tail return − baseline; <b>Occ.</b> = time per richness band. Dimmed (*) = fewer than {MIN_TAIL_N} tail days.</>}
          {" "}Click any cell for the full distribution detail.
          {pairMode && <em className="text-sky-300/80"> Pairs: each row is the A/B {pairBasis === "price" ? "price" : "metric"} ratio, judged against its own history.</em>}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full text-xs font-mono">
          <thead className="sticky top-0 bg-card z-10 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className={`px-1 py-1 w-7 ${STICKY0} z-20`} title="Open in Charts" rowSpan={2} />
              <th className={`px-2 py-1 text-left cursor-pointer hover:text-foreground select-none ${STICKY1} z-20`} onClick={() => toggleSort("ticker", null)} rowSpan={2}>
                {pairMode ? "Pair" : "Ticker"} <SortIcon col="ticker" metricKey={null} />
              </th>
              {effMetrics.map((m, i) => (
                <th key={m.key} colSpan={colsPerMetric} className={`px-2 py-1 text-center normal-case ${i > 0 ? "border-l border-border/60" : ""}`}>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground/80">
                    {m.label}
                    {!pairMode && metricKeys.length > 1 && (
                      <button type="button" onClick={() => removeMetric(m.key)} title={`Remove ${m.label}`} className="opacity-40 hover:opacity-100 hover:text-red-400 leading-none">×</button>
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
            {isLoading && <tr><td colSpan={totalCols} className="px-3 py-6 text-center text-muted-foreground">Computing re-rate + residence across the universe…</td></tr>}
            {!isLoading && visible.length === 0 && <tr><td colSpan={totalCols} className="px-3 py-6 text-center text-muted-foreground">No data for the selected metrics / universe.</td></tr>}
            {!isLoading && !grouped && visible.map(renderRow)}
            {!isLoading && grouped && grouped.map(([name, gr]) => (
              <Fragment key={name}>
                <tr className="bg-muted/40 border-y border-border">
                  <td colSpan={totalCols} className={`px-2 py-1 text-left text-[11px] font-semibold text-foreground/80 uppercase tracking-wider ${STICKY0}`}>
                    {name}<span className="text-muted-foreground font-normal normal-case"> · {gr.length}</span>
                  </td>
                </tr>
                {gr.map(renderRow)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Unified detail modal: level → re-rate room → occupancy → forward returns */}
      {detail && (() => {
        const { rr, res } = detail.cell;
        const m = detail.metric;
        const rich = cellRich(detail.cell, m), pfRich = cellPfRich(detail.cell, m);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
            <div className="bg-card border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between px-4 py-3 border-b border-border">
                <div>
                  <div className="text-sm font-semibold">{detail.meta.ticker} <span className="text-muted-foreground font-normal">· {detail.meta.name}</span></div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {m.label}{detail.meta.legA && !pairMode ? <span className="text-purple-300/80"> (A/B ratio · fwd = price ratio)</span> : null} · {basis === "trailing" ? `trailing ${LOOKBACKS.find((l) => l.days === lookbackDays)?.label}` : "expanding history"}{res ? ` · ${res.n.toLocaleString()} obs` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!pairMode && !detail.meta.legA && (
                    <button onClick={() => openInCharts(detail.meta.ticker)} className="text-[11px] px-2 py-1 rounded bg-muted hover:bg-muted/70 flex items-center gap-1" title="Open in Charts">
                      <LineChart className="w-3 h-3" /> Chart
                    </button>
                  )}
                  {!pairMode && detail.meta.legA && detail.meta.legB && (
                    <button onClick={() => navigateToPairs(detail.meta.legA!, detail.meta.legB!)} className="text-[11px] px-2 py-1 rounded bg-muted hover:bg-muted/70 flex items-center gap-1" title="Open in Pairs">
                      <LineChart className="w-3 h-3" /> Pairs
                    </button>
                  )}
                  <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Level + pro-forma */}
              <div className="grid grid-cols-4 gap-2 px-4 py-3 text-xs">
                <div><div className="text-[10px] uppercase text-muted-foreground">Now</div><div className="text-lg font-mono">{fmtVal(rr?.m0 ?? res?.m0)}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Richness</div><div className={`text-lg font-mono ${richColor(rich)}`}>{fmtPct(rich)}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">After {fmtMove(pctMove)}</div><div className={`text-lg font-mono ${richColor(pfRich)}`}>{fmtPct(pfRich)}{res?.proFormaUnprecedented && <span className="ml-1 text-[10px] text-red-400 font-bold align-middle">ATH</span>}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Seen this rich</div><div className="text-lg font-mono text-muted-foreground">{res ? <>{fmtPct(res.proFormaFreqRicher)}%<span className="text-[10px]"> of history</span></> : "—"}</div></div>
              </div>

              {/* Re-rate room */}
              {rr && (
                <div className="px-4 pb-3">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Re-rate room (implied % move to historical anchors)</div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div><div className="text-[10px] text-muted-foreground">→ Median ({fmtVal(rr.stats.median)})</div><div className={`font-mono text-sm ${moveColor(rr.toMedian)}`}>{fmtMove(rr.toMedian)}</div></div>
                    <div><div className="text-[10px] text-muted-foreground">↑ Rich end ({fmtVal(m.lowIsCheap ? rr.stats.p90 : rr.stats.p10)})</div><div className={`font-mono text-sm ${moveColor(rr.toRich)}`}>{fmtMove(rr.toRich)}</div></div>
                    <div><div className="text-[10px] text-muted-foreground">↓ Cheap end ({fmtVal(m.lowIsCheap ? rr.stats.p10 : rr.stats.p90)})</div><div className={`font-mono text-sm ${moveColor(rr.toCheap)}`}>{fmtMove(rr.toCheap)}</div></div>
                    <div><div className="text-[10px] text-muted-foreground">Reward : Risk</div><div className="font-mono text-sm">{Number.isFinite(rrOf(rr)) ? rrOf(rr).toFixed(2) : "—"}</div></div>
                  </div>
                </div>
              )}

              {/* Occupancy */}
              {res && (
                <div className="px-4 pb-3">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Time spent by richness band</div>
                  <OccupancyBar residence={res.residence} wide />
                  <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5"><span>cheap (0)</span><span>rich (100)</span></div>
                  <div className="text-[11px] text-muted-foreground mt-2">
                    Rich tail (≥90): <b className="text-red-400/90">{fmtPct(res.richPctTime)}%</b> of time over <b>{fmtNum(res.richCount)}</b> visits (median {fmtNum(res.richMedDur)}d).
                    {" "}Cheap tail (≤10): <b className="text-emerald-400/90">{fmtPct(res.cheapPctTime)}%</b> over <b>{fmtNum(res.cheapCount)}</b> visits (median {fmtNum(res.cheapMedDur)}d).
                  </div>
                </div>
              )}

              {/* Forward returns */}
              {res && (
                <div className="px-4 pb-4">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">Forward return by horizon (median · hit-rate · n days)</div>
                  <table className="w-full text-[11px] font-mono">
                    <thead className="text-[9px] uppercase text-muted-foreground border-b border-border">
                      <tr><th className="text-left py-1">Horizon</th><th className="text-right">Rich (≥90)</th><th className="text-right">Cheap (≤10)</th><th className="text-right">Baseline</th><th className="text-right">Edge (rich−base)</th></tr>
                    </thead>
                    <tbody>
                      {HORIZONS.map((h) => {
                        const f = res.fwd[h.days];
                        if (!f) return null;
                        const edge = f.rich.median - f.base.median;
                        const rLow = f.rich.n < MIN_TAIL_N, cLow = f.cheap.n < MIN_TAIL_N;
                        return (
                          <tr key={h.days} className="border-b border-border/30">
                            <td className="text-left py-1 text-muted-foreground">{h.label}</td>
                            <td className={`text-right ${retColor(f.rich.median)} ${rLow ? "opacity-40" : ""}`} title={rLow ? "low sample" : ""}>{fmtRet(f.rich.median)} · {fmtPct(f.rich.hitRate)}% · {f.rich.n}{rLow ? "*" : ""}</td>
                            <td className={`text-right ${retColor(f.cheap.median)} ${cLow ? "opacity-40" : ""}`} title={cLow ? "low sample" : ""}>{fmtRet(f.cheap.median)} · {fmtPct(f.cheap.hitRate)}% · {f.cheap.n}{cLow ? "*" : ""}</td>
                            <td className={`text-right ${retColor(f.base.median)}`}>{fmtRet(f.base.median)} · {f.base.n}</td>
                            <td className={`text-right ${retColor(edge)} ${rLow ? "opacity-40" : ""}`}>{fmtRet(edge)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="text-[10px] text-muted-foreground mt-1.5">Forward returns are price-only (the ratio's own in pairs mode) and use overlapping windows — read n as days, not independent samples.</div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
