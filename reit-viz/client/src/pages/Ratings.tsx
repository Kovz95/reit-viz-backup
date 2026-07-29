import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  getMultiMetricForAllTickers,
  getMetricSeries,
  type ClassifiedBase,
  CLASSIFICATION_KEYS,
} from "@/lib/dataService";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  ThumbsUp,
  ThumbsDown,
  Minus,
  LineChart,
  FlaskConical,
  CandlestickChart,
} from "lucide-react";
import RatingsChart from "@/components/RatingsChart";
import RatingsBacktestModal from "@/components/RatingsBacktestModal";
import { useBasketScope, BasketScopeSelect } from "@/components/BasketScopeSelect";

// ── Types ──

interface RatingsRow extends ClassifiedBase {
  buyCount: number | null;
  holdCount: number | null;
  sellCount: number | null;
  totalCount: number;
  buyPct: number | null;
  holdPct: number | null;
  sellPct: number | null;
  // Bull%/Bear% scaling note: stored as 0–1 decimals in the workbook. The
  // BATCH path (getMultiMetricForAllTickers → metricDisplayMult server-side)
  // pre-scales ×100, but the per-ticker getMetricSeries path does NOT —
  // RatingsChart multiplies by 100 itself. Keep that asymmetry in mind when
  // consuming these metrics anywhere new.
  bullPct: number | null;  // 0-100 (pre-scaled by the batch path)
  bearPct: number | null;  // 0-100 (pre-scaled like bullPct)
  /** Buy% change over trailing 21 / 63 obs (pp). */
  buyD1M: number | null;
  buyD3M: number | null;
  /** Net analyst-count change over trailing 63 obs. */
  anD3M: number | null;
  /** Midrank percentile of current Buy% within trailing 2Y own history. */
  pctile2Y: number | null;
  /** Buy% minus subsector peer-median Buy% (pp, self excluded). */
  exSub: number | null;
  spark: number[];
}

type SortKey =
  | "ticker"
  | "name"
  | "buyPct"
  | "holdPct"
  | "sellPct"
  | "totalCount"
  | "bullPct"
  | "bearPct"
  | "buyD1M"
  | "buyD3M"
  | "anD3M"
  | "pctile2Y"
  | "exSub"
  | "group";
type SortDir = "asc" | "desc";

type GroupByKey = (typeof CLASSIFICATION_KEYS)[number] | "none";

// ── Color helpers ──

function buyColor(pct: number): string {
  // 0% → red, 50% → yellow, 100% → green
  if (pct >= 70) return "bg-emerald-600/70 text-white";
  if (pct >= 50) return "bg-emerald-600/40 text-emerald-200";
  if (pct >= 30) return "bg-yellow-600/40 text-yellow-200";
  return "bg-red-600/40 text-red-200";
}

/** Buy% cell color, PEER-relative when possible: colored by the excess over
 *  the subsector median (REIT subsectors have very different baseline
 *  optimism, so absolute thresholds mislead). Falls back to the absolute
 *  scale when no peer group exists. */
function buyCellClass(buyPct: number | null, exSub: number | null): string {
  if (buyPct == null) return "";
  if (exSub != null) {
    if (exSub >= 15) return "bg-emerald-600/70 text-white";
    if (exSub >= 5) return "bg-emerald-600/40 text-emerald-200";
    if (exSub <= -15) return "bg-red-600/40 text-red-200";
    if (exSub <= -5) return "bg-yellow-600/40 text-yellow-200";
    return "";
  }
  return buyColor(buyPct);
}

function avgOrNull(vals: Array<number | null>): number | null {
  const v = vals.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function sellColor(pct: number): string {
  if (pct >= 20) return "bg-red-600/70 text-white";
  if (pct >= 10) return "bg-red-600/40 text-red-200";
  if (pct >= 5) return "bg-yellow-600/30 text-yellow-200";
  return "bg-emerald-600/30 text-emerald-200";
}

/** Buy% percentile vs own trailing history — extremes colored (100 = most loved it has been). */
function PctileCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground/50">—</span>;
  const cls = value >= 90 ? "text-emerald-400" : value >= 70 ? "text-emerald-400/70" : value <= 10 ? "text-red-400" : value <= 30 ? "text-red-400/70" : "text-foreground";
  return <span className={`font-mono tabular-nums ${cls}`}>{value.toFixed(0)}</span>;
}

/** Signed pp delta — upgrades green, downgrades red (0.5pp deadband). */
function DeltaCell({ value, dp = 1 }: { value: number | null; dp?: number }) {
  if (value == null) return <span className="text-muted-foreground/50">—</span>;
  const cls = value > 0.5 ? "text-emerald-400" : value < -0.5 ? "text-red-400" : "text-muted-foreground";
  return <span className={`font-mono tabular-nums ${cls}`}>{value >= 0 ? "+" : ""}{value.toFixed(dp)}</span>;
}

function BuySparkline({ data, width = 72, height = 18 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const range = Math.max(...data) - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(" ");
  const last = data[data.length - 1], first = data[0];
  const stroke = last > first + 0.5 ? "#22c55e" : last < first - 0.5 ? "#ef4444" : "#94a3b8";
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function barSegment(
  pct: number,
  color: string,
  label: string,
  textColor: string
) {
  if (pct <= 0) return null;
  return (
    <div
      className={`${color} flex items-center justify-center text-[10px] font-semibold ${textColor} transition-all`}
      style={{ width: `${pct}%`, minWidth: pct > 5 ? "20px" : "0px" }}
      title={`${label}: ${pct.toFixed(1)}%`}
    >
      {pct >= 8 ? `${Math.round(pct)}%` : ""}
    </div>
  );
}

// ── Main component ──

export default function Ratings() {
  const { activeTickers } = useUniverse();
  const basketScope = useBasketScope("reit-viz:basket-scope:ratings");

  const [groupBy, setGroupBy] = useState<GroupByKey>("subsector");
  const [sortKey, setSortKey] = useState<SortKey>("buyPct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters());
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [backtestRow, setBacktestRow] = useState<{ ticker: string; name: string } | null>(null);
  const [, navigate] = useLocation();

  // Row button → Charts with price + Buy Ratings panes via the metric-agnostic
  // rerate hand-off Dashboard drains (same pattern as Short Interest rows).
  const openOnCharts = useCallback((ticker: string) => {
    try {
      sessionStorage.setItem(
        "reit-viz:rerate-to-charts",
        JSON.stringify({ ticker, metricKey: "Buy Ratings", lookbackDays: 756 }),
      );
    } catch {}
    navigate("/");
  }, [navigate]);

  // Workspace persistence
  const serializeRatings = useCallback(() => ({
    groupBy,
    sortKey,
    sortDir,
    classFilters: serializeClassFilters(classFilters),
    search,
    manualTickers: [...manualTickers],
    collapsed: [...collapsed],
    expandedTicker,
  }), [groupBy, sortKey, sortDir, classFilters, search, manualTickers, collapsed, expandedTicker]);

  const restoreRatings = useCallback((state: any) => {
    if (state.groupBy !== undefined) setGroupBy(state.groupBy);
    if (state.sortKey !== undefined) setSortKey(state.sortKey);
    if (state.sortDir !== undefined) setSortDir(state.sortDir);
    if (state.classFilters !== undefined) setClassFilters(deserializeClassFilters(state.classFilters));
    if (state.search !== undefined) setSearch(state.search);
    if (state.manualTickers !== undefined) setManualTickers(new Set(state.manualTickers));
    if (state.collapsed !== undefined) setCollapsed(new Set(state.collapsed));
    if (state.expandedTicker !== undefined) setExpandedTicker(state.expandedTicker);
  }, []);

  useWorkspaceTab("ratings", serializeRatings, restoreRatings);

  const updateSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" || key === "name" ? "asc" : "desc");
    }
  };

  // ── Fetch data ──
  const METRICS = [
    "Buy Ratings",
    "Hold Ratings",
    "Sell Ratings",
    "Bull%",
    "Bear%",
  ];
  const { data: rawData, isLoading } = useQuery({
    queryKey: ["ratings-data"],
    queryFn: () => getMultiMetricForAllTickers(METRICS),
    staleTime: 5 * 60_000,
  });

  // Per-ticker rating HISTORY: one chunked pass computes the Buy% sparkline,
  // Δ1M/Δ3M momentum, net analyst change, and the trailing-2Y midrank
  // percentile (ties at half weight — ratings are step-held between changes,
  // so counting equals fully would read a flat history as 100th percentile).
  const { data: ratingsHistory } = useQuery({
    queryKey: ["ratings-history"],
    enabled: !!rawData,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: Record<string, { spark: number[]; buyD1M: number | null; buyD3M: number | null; anD3M: number | null; pctile2Y: number | null }> = {};
      const list = (rawData ?? []).map((t) => t.ticker);
      for (let i = 0; i < list.length; i += 20) {
        await Promise.all(
          list.slice(i, i + 20).map(async (tk) => {
            try {
              const [buy, hold, sell] = await Promise.all([
                getMetricSeries(tk, "Buy Ratings"),
                getMetricSeries(tk, "Hold Ratings"),
                getMetricSeries(tk, "Sell Ratings"),
              ]);
              const hm = new Map(hold.map((p) => [p.time, p.value]));
              const sm = new Map(sell.map((p) => [p.time, p.value]));
              const buyPct: number[] = [], totals: number[] = [];
              for (const p of buy) {
                const hv = hm.get(p.time), sv = sm.get(p.time);
                if (!Number.isFinite(p.value) || hv == null || sv == null || !Number.isFinite(hv) || !Number.isFinite(sv)) continue;
                const tot = p.value + hv + sv;
                if (tot <= 0) continue;
                buyPct.push((p.value / tot) * 100);
                totals.push(tot);
              }
              if (buyPct.length < 2) return;
              const last = buyPct.length - 1;
              const delta = (arr: number[], lb: number) => (last - lb >= 0 ? arr[last] - arr[last - lb] : null);
              const spark: number[] = [];
              for (let j = Math.max(0, buyPct.length - 260); j < buyPct.length; j += 5) spark.push(buyPct[j]);
              const win = buyPct.slice(Math.max(0, buyPct.length - 504));
              let pctile2Y: number | null = null;
              if (win.length >= 60) {
                const cur = win[win.length - 1];
                let below = 0, equal = 0;
                for (const v of win) { if (v < cur) below++; else if (v === cur) equal++; }
                pctile2Y = ((below + 0.5 * equal) / win.length) * 100;
              }
              out[tk] = { spark, buyD1M: delta(buyPct, 21), buyD3M: delta(buyPct, 63), anD3M: delta(totals, 63), pctile2Y };
            } catch {}
          })
        );
      }
      return out;
    },
  });

  const geo = useGeoFilter(rawData ?? [], "ratings-geo");

  // ── Build rows ──
  const rows: RatingsRow[] = useMemo(() => {
    if (!rawData) return [];
    const activeSet = activeTickers ? new Set(activeTickers) : null;

    const universeFiltered = rawData.filter(
      (t) => (!activeSet || activeSet.has(t.ticker)) && basketScope.inScope(t.ticker)
    );
    const classFiltered = geo.filterByGeo(applyClassFilters(universeFiltered, classFilters, search, manualTickers));

    const buyPctOf = (t: (typeof rawData)[number]): number | null => {
      const buy = t.values["Buy Ratings"], hold = t.values["Hold Ratings"], sell = t.values["Sell Ratings"];
      const total = (buy ?? 0) + (hold ?? 0) + (sell ?? 0);
      return total > 0 && buy != null ? (buy / total) * 100 : null;
    };
    // Subsector Buy% values over the FULL roster (stable as filters change);
    // each row compares against the median of its peers EXCLUDING itself.
    const bySub = new Map<string, number[]>();
    for (const t of rawData) {
      const v = buyPctOf(t);
      const sub = t.subsector || "";
      if (!sub || v == null) continue;
      const arr = bySub.get(sub) ?? [];
      arr.push(v);
      bySub.set(sub, arr);
    }
    const peerMedian = (sub: string, own: number): number | undefined => {
      const vals = bySub.get(sub);
      if (!vals) return undefined;
      const others = [...vals];
      const i = others.indexOf(own);
      if (i >= 0) others.splice(i, 1);
      if (others.length < 2) return undefined;
      others.sort((a, b) => a - b);
      const m = others.length >> 1;
      return others.length % 2 ? others[m] : (others[m - 1] + others[m]) / 2;
    };

    return classFiltered
      .map((t) => {
        const buy = t.values["Buy Ratings"];
        const hold = t.values["Hold Ratings"];
        const sell = t.values["Sell Ratings"];
        const total =
          (buy ?? 0) + (hold ?? 0) + (sell ?? 0);
        const buyPct = total > 0 && buy != null ? (buy / total) * 100 : null;
        const holdPct =
          total > 0 && hold != null ? (hold / total) * 100 : null;
        const sellPct =
          total > 0 && sell != null ? (sell / total) * 100 : null;
        const bullRaw = t.values["Bull%"];
        const bearRaw = t.values["Bear%"];
        const med = buyPct != null ? peerMedian(t.subsector || "", buyPct) : undefined;
        const hist = ratingsHistory?.[t.ticker];

        return {
          ticker: t.ticker,
          name: t.name,
          economy: t.economy,
          sector: t.sector,
          subsector: t.subsector,
          industryGroup: t.industryGroup,
          industry: t.industry,
          subindustry: t.subindustry,
          buyCount: buy,
          holdCount: hold,
          sellCount: sell,
          totalCount: total,
          buyPct,
          holdPct,
          sellPct,
          bullPct: bullRaw ?? null,
          bearPct: bearRaw ?? null,
          buyD1M: hist?.buyD1M ?? null,
          buyD3M: hist?.buyD3M ?? null,
          anD3M: hist?.anD3M ?? null,
          pctile2Y: hist?.pctile2Y ?? null,
          exSub: buyPct != null && med !== undefined ? buyPct - med : null,
          spark: hist?.spark ?? [],
        } as RatingsRow;
      })
      .filter((r) => r.totalCount > 0);
  }, [rawData, ratingsHistory, activeTickers, basketScope.members, classFilters, search, manualTickers, geo.filterByGeo]);

  // ── Sort ──
  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "ticker") return dir * a.ticker.localeCompare(b.ticker);
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      if (sortKey === "group") {
        const ga = groupBy !== "none" ? (a as any)[groupBy] || "" : "";
        const gb = groupBy !== "none" ? (b as any)[groupBy] || "" : "";
        if (ga !== gb) return dir * ga.localeCompare(gb);
        return (b.buyPct ?? 0) - (a.buyPct ?? 0);
      }
      const va = (a as any)[sortKey] ?? -Infinity;
      const vb = (b as any)[sortKey] ?? -Infinity;
      return dir * (va - vb);
    });
    return arr;
  }, [rows, sortKey, sortDir, groupBy]);

  // ── Group ──
  const groups: { label: string; rows: RatingsRow[] }[] = useMemo(() => {
    if (groupBy === "none") return [{ label: "", rows: sortedRows }];

    const map = new Map<string, RatingsRow[]>();
    for (const r of sortedRows) {
      const key = (r as any)[groupBy] || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }

    // Sort groups by average buyPct descending
    return [...map.entries()]
      .sort(([, a], [, b]) => {
        const avgA =
          a.reduce((s, r) => s + (r.buyPct ?? 0), 0) / a.length;
        const avgB =
          b.reduce((s, r) => s + (r.buyPct ?? 0), 0) / b.length;
        return avgB - avgA;
      })
      .map(([label, rows]) => ({ label, rows }));
  }, [sortedRows, groupBy]);

  // ── Summary stats ──
  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const avgBuy =
      rows.reduce((s, r) => s + (r.buyPct ?? 0), 0) / rows.length;
    const avgHold =
      rows.reduce((s, r) => s + (r.holdPct ?? 0), 0) / rows.length;
    const avgSell =
      rows.reduce((s, r) => s + (r.sellPct ?? 0), 0) / rows.length;
    return { avgBuy, avgHold, avgSell };
  }, [rows]);

  // Toggle group collapse
  const toggleGroup = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // ── Export CSV ──
  const exportCsv = () => {
    const header = [
      "Ticker",
      "Name",
      "Subsector",
      "Industry",
      "Buy",
      "Hold",
      "Sell",
      "Total",
      "Buy%",
      "Hold%",
      "Sell%",
      "Buy% D1M",
      "Buy% D3M",
      "Buy% %ile 2Y",
      "Buy% vs Subsector (pp)",
      "DAnalysts 3M",
      "Bull%",
      "Bear%",
    ].join(",");
    const csvRows = sortedRows.map((r) =>
      [
        r.ticker,
        `"${r.name}"`,
        `"${r.subsector}"`,
        `"${r.industry}"`,
        r.buyCount ?? "",
        r.holdCount ?? "",
        r.sellCount ?? "",
        r.totalCount,
        r.buyPct != null ? r.buyPct.toFixed(1) : "",
        r.holdPct != null ? r.holdPct.toFixed(1) : "",
        r.sellPct != null ? r.sellPct.toFixed(1) : "",
        r.buyD1M != null ? r.buyD1M.toFixed(1) : "",
        r.buyD3M != null ? r.buyD3M.toFixed(1) : "",
        r.pctile2Y != null ? r.pctile2Y.toFixed(0) : "",
        r.exSub != null ? r.exSub.toFixed(1) : "",
        r.anD3M != null ? r.anD3M.toFixed(0) : "",
        r.bullPct != null ? r.bullPct.toFixed(1) : "",
        r.bearPct != null ? r.bearPct.toFixed(1) : "",
      ].join(",")
    );
    const blob = new Blob([header + "\n" + csvRows.join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ratings_heatmap.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Column header helper ──
  const SortHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field: SortKey;
    className?: string;
  }) => (
    <th
      className={`px-2 py-1.5 text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none ${className ?? ""}`}
      onClick={() => updateSort(field)}
    >
      <span className="flex items-center gap-0.5">
        {label}
        {sortKey === field ? (
          sortDir === "asc" ? (
            <ArrowUp className="w-2.5 h-2.5" />
          ) : (
            <ArrowDown className="w-2.5 h-2.5" />
          )
        ) : (
          <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />
        )}
      </span>
    </th>
  );

  // ── Group summary bar ──
  const GroupSummaryBar = ({ rows: gr }: { rows: RatingsRow[] }) => {
    const avgBuy = gr.reduce((s, r) => s + (r.buyPct ?? 0), 0) / gr.length;
    const avgHold = gr.reduce((s, r) => s + (r.holdPct ?? 0), 0) / gr.length;
    const avgSell = gr.reduce((s, r) => s + (r.sellPct ?? 0), 0) / gr.length;
    return (
      <div className="flex h-4 rounded overflow-hidden w-24">
        {barSegment(avgBuy, "bg-emerald-600", "Buy", "text-white")}
        {barSegment(avgHold, "bg-zinc-500", "Hold", "text-white")}
        {barSegment(avgSell, "bg-red-600", "Sell", "text-white")}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading ratings data...
      </div>
    );
  }

  if (rows.length === 0) {
    // A basket scope can filter out every row — keep an escape hatch visible
    // so the selection (persisted in localStorage) can still be cleared.
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full text-muted-foreground text-sm">
        {basketScope.members ? (
          <>
            <span>No ratings rows in basket “{basketScope.basketName}”.</span>
            <button
              className="h-6 px-2 rounded bg-muted text-[11px] text-foreground hover:bg-muted/80"
              onClick={() => basketScope.setBasketId("")}
            >
              Clear basket filter
            </button>
          </>
        ) : (
          <span>No ratings data available. Upload a workbook with Buy/Hold/Sell ratings.</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Top controls ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50 flex-shrink-0 flex-wrap">
        {/* Summary cards */}
        {summary && (
          <div className="flex items-center gap-3 mr-3">
            <div className="flex items-center gap-1">
              <ThumbsUp className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-muted-foreground">Avg Buy:</span>
              <span className="text-xs font-semibold text-emerald-400">
                {summary.avgBuy.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Minus className="w-3 h-3 text-zinc-400" />
              <span className="text-[10px] text-muted-foreground">Hold:</span>
              <span className="text-xs font-semibold text-zinc-300">
                {summary.avgHold.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1">
              <ThumbsDown className="w-3 h-3 text-red-400" />
              <span className="text-[10px] text-muted-foreground">Sell:</span>
              <span className="text-xs font-semibold text-red-400">
                {summary.avgSell.toFixed(1)}%
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <span className="text-[10px] text-muted-foreground">
              {rows.length} tickers
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Group:</span>
          <Select
            value={groupBy}
            onValueChange={(v) => setGroupBy(v as GroupByKey)}
          >
            <SelectTrigger className="h-6 text-[11px] w-auto min-w-[155px] bg-muted border-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="economy">Economy</SelectItem>
              <SelectItem value="sector">Sector</SelectItem>
              <SelectItem value="subsector">Subsector</SelectItem>
              <SelectItem value="industryGroup">Industry Group</SelectItem>
              <SelectItem value="industry">Industry</SelectItem>
              <SelectItem value="subindustry">Sub-Industry</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Basket:</span>
          <BasketScopeSelect
            scope={basketScope}
            className="h-6 text-[11px] w-auto min-w-[130px] bg-muted border-0"
          />
        </div>

        <ClassificationFilters
          filters={classFilters}
          onFiltersChange={setClassFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={rows.length}
          totalCount={rawData?.length ?? 0}
          testIdPrefix="ratings"
          extraFilters={geo.geoFilterUI}
        />

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr>
              <SortHeader label="Ticker" field="ticker" className="text-left w-16" />
              <SortHeader label="Name" field="name" className="text-left w-36" />
              {groupBy !== "none" && (
                <SortHeader label="Group" field="group" className="text-left w-32" />
              )}
              <th className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground text-left w-[220px]">
                Rating Distribution
              </th>
              <th className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground text-center w-20" title="Trailing 1Y Buy% trend">
                Buy% 1Y
              </th>
              <SortHeader label="Buy%" field="buyPct" className="text-right w-14" />
              <SortHeader label="Δ1M" field="buyD1M" className="text-right w-12" />
              <SortHeader label="Δ3M" field="buyD3M" className="text-right w-12" />
              <SortHeader label="%ile 2Y" field="pctile2Y" className="text-right w-14" />
              <SortHeader label="vs Sub" field="exSub" className="text-right w-14" />
              <SortHeader label="Hold%" field="holdPct" className="text-right w-14" />
              <SortHeader label="Sell%" field="sellPct" className="text-right w-14" />
              <SortHeader label="# An" field="totalCount" className="text-right w-12" />
              <SortHeader label="ΔAn 3M" field="anD3M" className="text-right w-14" />
              <SortHeader label="Bull%" field="bullPct" className="text-right w-14" />
              <SortHeader label="Bear%" field="bearPct" className="text-right w-14" />
              <th className="px-1 py-1.5 w-14" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g.label || "__all__"}>
                {/* Group header */}
                {g.label && (
                  <tr
                    className="bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => toggleGroup(g.label)}
                  >
                    <td
                      colSpan={groupBy !== "none" ? 5 : 4}
                      className="px-2 py-1 text-[11px] font-semibold text-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground text-[10px]">
                          {collapsed.has(g.label) ? "▶" : "▼"}
                        </span>
                        {g.label}
                        <span className="text-[10px] font-normal text-muted-foreground">
                          ({g.rows.length})
                        </span>
                        <GroupSummaryBar rows={g.rows} />
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right text-[10px] text-emerald-400 font-medium">
                      {(
                        g.rows.reduce((s, r) => s + (r.buyPct ?? 0), 0) /
                        g.rows.length
                      ).toFixed(0)}
                    </td>
                    <td className="px-2 py-1 text-right text-[10px]">
                      <DeltaCell value={avgOrNull(g.rows.map((r) => r.buyD1M))} />
                    </td>
                    <td className="px-2 py-1 text-right text-[10px]">
                      <DeltaCell value={avgOrNull(g.rows.map((r) => r.buyD3M))} />
                    </td>
                    <td className="px-2 py-1 text-right text-[10px] text-muted-foreground" />
                    <td className="px-2 py-1 text-right text-[10px] text-muted-foreground" />
                    <td className="px-2 py-1 text-right text-[10px] text-zinc-400 font-medium">
                      {(
                        g.rows.reduce((s, r) => s + (r.holdPct ?? 0), 0) /
                        g.rows.length
                      ).toFixed(0)}
                    </td>
                    <td className="px-2 py-1 text-right text-[10px] text-red-400 font-medium">
                      {(
                        g.rows.reduce((s, r) => s + (r.sellPct ?? 0), 0) /
                        g.rows.length
                      ).toFixed(0)}
                    </td>
                    <td className="px-2 py-1 text-right text-[10px] text-muted-foreground">
                      {(
                        g.rows.reduce((s, r) => s + r.totalCount, 0) /
                        g.rows.length
                      ).toFixed(0)}
                    </td>
                    <td className="px-2 py-1 text-right text-[10px] text-muted-foreground" />
                    <td className="px-2 py-1 text-right text-[10px] text-muted-foreground" />
                    <td className="px-2 py-1 text-right text-[10px] text-muted-foreground" />
                    <td className="px-1 py-1" />
                  </tr>
                )}

                {/* Data rows */}
                {!collapsed.has(g.label) &&
                  g.rows.map((r) => (
                    <React.Fragment key={r.ticker}>
                    <tr
                      className={`border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer ${
                        expandedTicker === r.ticker ? "bg-accent/40" : ""
                      }`}
                      onClick={() => setExpandedTicker(expandedTicker === r.ticker ? null : r.ticker)}
                    >
                      <td className="px-2 py-1 font-mono font-semibold text-foreground">
                        <span className="flex items-center gap-1">
                          {expandedTicker === r.ticker ? (
                            <LineChart className="w-3 h-3 text-primary flex-shrink-0" />
                          ) : null}
                          {r.ticker}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-muted-foreground truncate max-w-[180px]">
                        {r.name}
                      </td>
                      {groupBy !== "none" && (
                        <td className="px-2 py-1 text-muted-foreground text-[10px] truncate max-w-[160px]">
                          {(r as any)[groupBy] || ""}
                        </td>
                      )}
                      {/* Stacked bar */}
                      <td className="px-2 py-1">
                        <div className="flex h-5 rounded overflow-hidden bg-muted/30">
                          {barSegment(
                            r.buyPct ?? 0,
                            "bg-emerald-600",
                            "Buy",
                            "text-white"
                          )}
                          {barSegment(
                            r.holdPct ?? 0,
                            "bg-zinc-500",
                            "Hold",
                            "text-white"
                          )}
                          {barSegment(
                            r.sellPct ?? 0,
                            "bg-red-600",
                            "Sell",
                            "text-white"
                          )}
                        </div>
                      </td>
                      {/* Buy% 1Y sparkline */}
                      <td className="px-2 py-1 text-center whitespace-nowrap">
                        <BuySparkline data={r.spark} />
                      </td>
                      {/* Numeric columns */}
                      <td
                        className={`px-2 py-1 text-right font-mono tabular-nums ${buyCellClass(r.buyPct, r.exSub)}`}
                        title={r.exSub != null ? `colored vs subsector median (${r.exSub >= 0 ? "+" : ""}${r.exSub.toFixed(1)}pp)` : undefined}
                      >
                        {r.buyPct != null ? `${r.buyPct.toFixed(0)}` : "—"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <DeltaCell value={r.buyD1M} />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <DeltaCell value={r.buyD3M} />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <PctileCell value={r.pctile2Y} />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <DeltaCell value={r.exSub} />
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-zinc-300">
                        {r.holdPct != null ? `${r.holdPct.toFixed(0)}` : "—"}
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-mono tabular-nums ${
                          r.sellPct != null ? sellColor(r.sellPct) : ""
                        }`}
                      >
                        {r.sellPct != null ? `${r.sellPct.toFixed(0)}` : "—"}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                        {r.totalCount}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <DeltaCell value={r.anD3M} dp={0} />
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-emerald-400/80">
                        {r.bullPct != null ? `${r.bullPct.toFixed(0)}` : "—"}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-red-400/80">
                        {r.bearPct != null ? `${r.bearPct.toFixed(0)}` : "—"}
                      </td>
                      {/* Actions: open on Charts · backtest */}
                      <td className="px-1 py-1 text-center whitespace-nowrap">
                        <button
                          className="p-0.5 rounded text-muted-foreground/60 hover:text-primary hover:bg-accent"
                          onClick={(e) => { e.stopPropagation(); openOnCharts(r.ticker); }}
                          title="Open on Charts: price + Buy Ratings"
                          data-testid={`ratings-charts-${r.ticker}`}
                        >
                          <CandlestickChart className="w-3 h-3" />
                        </button>
                        <button
                          className="p-0.5 rounded text-muted-foreground/60 hover:text-primary hover:bg-accent"
                          onClick={(e) => { e.stopPropagation(); setBacktestRow({ ticker: r.ticker, name: r.name }); }}
                          title="Backtest: forward returns conditioned on this name's Buy% state"
                          data-testid={`ratings-bt-open-${r.ticker}`}
                        >
                          <FlaskConical className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                    {/* Expanded chart row */}
                    {expandedTicker === r.ticker && (
                      <tr>
                        <td colSpan={groupBy !== "none" ? 17 : 16} className="p-0 border-b border-border/30">
                          <RatingsChart ticker={r.ticker} />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {backtestRow && (
        <RatingsBacktestModal
          ticker={backtestRow.ticker}
          name={backtestRow.name}
          onClose={() => setBacktestRow(null)}
        />
      )}
    </div>
  );
}
