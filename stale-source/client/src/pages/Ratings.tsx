import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMultiMetricForAllTickers,
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
} from "lucide-react";
import RatingsChart from "@/components/RatingsChart";

// ── Types ──

interface RatingsRow extends ClassifiedBase {
  buyCount: number | null;
  holdCount: number | null;
  sellCount: number | null;
  totalCount: number;
  buyPct: number | null;
  holdPct: number | null;
  sellPct: number | null;
  bullPct: number | null;  // from Bull% metric (decimal 0-1)
  bearPct: number | null;  // from Bear% metric (decimal 0-1)
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

function sellColor(pct: number): string {
  if (pct >= 20) return "bg-red-600/70 text-white";
  if (pct >= 10) return "bg-red-600/40 text-red-200";
  if (pct >= 5) return "bg-yellow-600/30 text-yellow-200";
  return "bg-emerald-600/30 text-emerald-200";
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

  const [groupBy, setGroupBy] = useState<GroupByKey>("subsector");
  const [sortKey, setSortKey] = useState<SortKey>("buyPct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters());
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Workspace persistence
  const serializeRatings = useCallback(() => ({
    groupBy,
    sortKey,
    sortDir,
    classFilters: serializeClassFilters(classFilters),
    search,
    manualTickers: [...manualTickers],
    collapsed: [...collapsed],
  }), [groupBy, sortKey, sortDir, classFilters, search, manualTickers, collapsed]);

  const restoreRatings = useCallback((state: any) => {
    if (state.groupBy !== undefined) setGroupBy(state.groupBy);
    if (state.sortKey !== undefined) setSortKey(state.sortKey);
    if (state.sortDir !== undefined) setSortDir(state.sortDir);
    if (state.classFilters !== undefined) setClassFilters(deserializeClassFilters(state.classFilters));
    if (state.search !== undefined) setSearch(state.search);
    if (state.manualTickers !== undefined) setManualTickers(new Set(state.manualTickers));
    if (state.collapsed !== undefined) setCollapsed(new Set(state.collapsed));
  }, []);

  useWorkspaceTab("ratings", serializeRatings, restoreRatings);

  const updateGroupBy = (v: GroupByKey) => {
    setGroupBy(v);
  };
  const updateSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" || key === "name" ? "asc" : "desc");
    }
  };
  const updateClassFilters = (f: ClassFilters) => {
    setClassFilters(f);
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

  // ── Build rows ──
  const rows: RatingsRow[] = useMemo(() => {
    if (!rawData) return [];
    const activeSet = activeTickers ? new Set(activeTickers) : null;

    const universeFiltered = rawData.filter((t) => !activeSet || activeSet.has(t.ticker));
    const classFiltered = applyClassFilters(universeFiltered, classFilters, search, manualTickers);

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
          bullPct: bullRaw != null ? bullRaw * 100 : null,
          bearPct: bearRaw != null ? bearRaw * 100 : null,
        } as RatingsRow;
      })
      .filter((r) => r.totalCount > 0);
  }, [rawData, activeTickers, classFilters, search, manualTickers]);

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
    const highestBuy = rows.reduce(
      (best, r) => ((r.buyPct ?? 0) > (best.buyPct ?? 0) ? r : best),
      rows[0]
    );
    const highestSell = rows.reduce(
      (best, r) => ((r.sellPct ?? 0) > (best.sellPct ?? 0) ? r : best),
      rows[0]
    );
    return { avgBuy, avgHold, avgSell, highestBuy, highestSell };
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
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No ratings data available. Upload a workbook with Buy/Hold/Sell ratings.
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
            onValueChange={(v) => updateGroupBy(v as GroupByKey)}
          >
            <SelectTrigger className="h-6 text-[11px] w-[120px] bg-muted border-0">
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

        <ClassificationFilters
          filters={classFilters}
          onFiltersChange={updateClassFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={rows.length}
          totalCount={rawData?.length ?? 0}
          testIdPrefix="ratings"
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
              <th className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground text-left w-[280px]">
                Rating Distribution
              </th>
              <SortHeader label="Buy%" field="buyPct" className="text-right w-14" />
              <SortHeader label="Hold%" field="holdPct" className="text-right w-14" />
              <SortHeader label="Sell%" field="sellPct" className="text-right w-14" />
              <SortHeader label="# Analysts" field="totalCount" className="text-right w-16" />
              <SortHeader label="Bull%" field="bullPct" className="text-right w-14" />
              <SortHeader label="Bear%" field="bearPct" className="text-right w-14" />
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
                      colSpan={groupBy !== "none" ? 4 : 3}
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
                      {/* Numeric columns */}
                      <td
                        className={`px-2 py-1 text-right font-mono tabular-nums ${
                          r.buyPct != null ? buyColor(r.buyPct) : ""
                        }`}
                      >
                        {r.buyPct != null ? `${r.buyPct.toFixed(0)}` : "—"}
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
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-emerald-400/80">
                        {r.bullPct != null ? `${r.bullPct.toFixed(0)}` : "—"}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-red-400/80">
                        {r.bearPct != null ? `${r.bearPct.toFixed(0)}` : "—"}
                      </td>
                    </tr>
                    {/* Expanded chart row */}
                    {expandedTicker === r.ticker && (
                      <tr>
                        <td colSpan={groupBy !== "none" ? 10 : 9} className="p-0 border-b border-border/30">
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
    </div>
  );
}
