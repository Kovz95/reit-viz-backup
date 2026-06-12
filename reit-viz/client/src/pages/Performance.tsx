import { useState, useMemo, useCallback } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery } from "@tanstack/react-query";
import {
  getPerformanceData,
  getMonthlySeasonality,
  getEventReturns,
  getSeasonalPatterns,
  MONTH_KEYS,
  EVENT_WINDOWS,
  EVENT_WINDOWS_POST,
  EVENT_WINDOWS_PRE,
  EVENT_WINDOW_LABELS,
  MACRO_EVENT_TYPES,
  isMacroEvent,
  eventHasPreWindows,
} from "@/lib/dataService";
import type {
  PerformanceRow,
  MonthlySeasonalityRow,
  EventReturnRow,
  SeasonalPatternRow,
  SeasonalWindow,
  MonthKey,
  EventType,
} from "@/lib/dataService";

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  earnings: "Post-Earnings",
  ex_div: "Post-Ex-Div",
  CPI: "CPI",
  NFP: "NFP",
  FOMC: "FOMC",
  GDP: "GDP",
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useUniverse } from "@/lib/universeContext";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
} from "lucide-react";
import UpcomingSeasonalWindows from "@/components/UpcomingSeasonalWindows";

// ---- Column config ----
const PRESET_PERIODS = ["1W", "1M", "3M", "6M", "12M"] as const;
const QUARTER_KEYS = ["Q1", "Q2", "Q3", "Q4"] as const;

type ViewMode = "periods" | "seasonality" | "monthly" | "events" | "seasonal-patterns";
type EventStat = "avg" | "median" | "winRate";

// ---- Return cell ----
function ReturnCell({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  const color =
    value > 0 ? "text-emerald-500" : value < 0 ? "text-red-500" : "text-foreground";
  return (
    <span className={`font-mono text-xs tabular-nums ${color}`}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}{suffix}
    </span>
  );
}

/** Heatmap-style background for seasonality cells */
function SeasonalCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  // Scale: -5% red ... 0 neutral ... +5% green
  const clamped = Math.max(-5, Math.min(5, value));
  const norm = clamped / 5; // -1 to 1
  const alpha = Math.abs(norm) * 0.25;
  const bg = norm > 0
    ? `rgba(34, 197, 94, ${alpha})`
    : norm < 0
    ? `rgba(239, 68, 68, ${alpha})`
    : "transparent";
  const color =
    value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-foreground";
  return (
    <span
      className={`font-mono text-xs tabular-nums ${color} px-1.5 py-0.5 rounded`}
      style={{ backgroundColor: bg }}
    >
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export default function Performance() {
  const { universeTickers } = useUniverse();
  const [viewMode, setViewMode] = useState<ViewMode>("periods");
  const [filters, setFilters] = useState<ClassFilters>(emptyClassFilters);
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sortKey, setSortKey] = useState<string>("12M");
  const [sortAsc, setSortAsc] = useState(false);
  const [eventType, setEventType] = useState<EventType>("earnings");
  const [eventStat, setEventStat] = useState<EventStat>("avg");
  const [seasonalMinDays, setSeasonalMinDays] = useState(30);
  const [seasonalMaxDays, setSeasonalMaxDays] = useState(180);

  const serializePerformance = useCallback(() => ({
    viewMode,
    filters: serializeClassFilters(filters),
    manualTickers: [...manualTickers],
    customStart,
    customEnd,
    sortKey,
    sortAsc,
    eventType,
    eventStat,
    seasonalMinDays,
    seasonalMaxDays,
  }), [viewMode, filters, manualTickers, customStart, customEnd, sortKey, sortAsc, eventType, eventStat, seasonalMinDays, seasonalMaxDays]);

  const restorePerformance = useCallback((state: any) => {
    if (state.viewMode !== undefined) setViewMode(state.viewMode);
    if (state.filters !== undefined) setFilters(deserializeClassFilters(state.filters));
    if (state.manualTickers !== undefined) setManualTickers(new Set(state.manualTickers));
    if (state.customStart !== undefined) setCustomStart(state.customStart);
    if (state.customEnd !== undefined) setCustomEnd(state.customEnd);
    if (state.sortKey !== undefined) setSortKey(state.sortKey);
    if (state.sortAsc !== undefined) setSortAsc(state.sortAsc);
    if (state.eventType !== undefined) setEventType(state.eventType);
    if (state.eventStat !== undefined) setEventStat(state.eventStat);
    if (state.seasonalMinDays !== undefined) setSeasonalMinDays(state.seasonalMinDays);
    if (state.seasonalMaxDays !== undefined) setSeasonalMaxDays(state.seasonalMaxDays);
  }, []);

  useWorkspaceTab("performance", serializePerformance, restorePerformance);

  // ---- Data queries ----
  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ["/perf-data", customStart, customEnd],
    queryFn: () => getPerformanceData(customStart || undefined, customEnd || undefined),
  });

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ["/monthly-seasonality"],
    queryFn: getMonthlySeasonality,
    enabled: viewMode === "monthly",
  });

  const { data: eventData, isLoading: eventLoading } = useQuery({
    queryKey: ["/event-returns", eventType],
    queryFn: () => getEventReturns(eventType),
    enabled: viewMode === "events",
  });

  const { data: seasonalData, isLoading: seasonalLoading } = useQuery({
    queryKey: ["/seasonal-patterns", seasonalMinDays, seasonalMaxDays],
    queryFn: () => getSeasonalPatterns(5, seasonalMinDays, seasonalMaxDays),
    enabled: viewMode === "seasonal-patterns",
  });

  const isLoading = viewMode === "periods" || viewMode === "seasonality"
    ? perfLoading
    : viewMode === "monthly"
    ? monthlyLoading
    : viewMode === "seasonal-patterns"
    ? seasonalLoading
    : eventLoading;

  // ---- Filtering + sorting ----
  const filteredData = useMemo(() => {
    let source: any[] = [];
    if (viewMode === "periods" || viewMode === "seasonality") source = perfData || [];
    else if (viewMode === "monthly") source = monthlyData || [];
    else if (viewMode === "seasonal-patterns") source = seasonalData || [];
    else source = eventData || [];

    if (universeTickers) source = source.filter((r: any) => universeTickers.has(r.ticker));
    let rows = applyClassFilters(source, filters, search, manualTickers);

    return [...rows].sort((a: any, b: any) => {
      let va: any, vb: any;
      // For event returns, sort by the stat within the window
      if (viewMode === "events" && sortKey.startsWith("w_")) {
        const w = parseInt(sortKey.replace("w_", ""));
        va = (a as EventReturnRow)[eventStat]?.[w] ?? null;
        vb = (b as EventReturnRow)[eventStat]?.[w] ?? null;
      } else {
        va = a[sortKey];
        vb = b[sortKey];
      }
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
  }, [perfData, monthlyData, eventData, seasonalData, viewMode, filters, search, manualTickers, sortKey, sortAsc, universeTickers, eventType, eventStat]);

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) setSortAsc(!sortAsc);
      else { setSortKey(key); setSortAsc(false); }
    },
    [sortKey, sortAsc]
  );

  // ---- Export CSV ----
  const exportCSV = useCallback(() => {
    if (!filteredData.length) return;
    let cols: string[];
    let header: string[];

    if (viewMode === "periods") {
      cols = ["ticker", "name", "lastClose", ...PRESET_PERIODS, ...(customStart && customEnd ? ["custom"] : [])];
      header = cols.map(c => c === "lastClose" ? "Last Close" : c === "custom" ? `Custom (${customStart} to ${customEnd})` : c);
    } else if (viewMode === "seasonality") {
      cols = ["ticker", "name", "lastClose", ...QUARTER_KEYS];
      header = cols.map(c => c === "lastClose" ? "Last Close" : `Avg ${c}`);
    } else if (viewMode === "monthly") {
      cols = ["ticker", "name", ...MONTH_KEYS.map(m => m), "yearsOfData"];
      header = cols;
    } else if (viewMode === "seasonal-patterns") {
      // Special export for seasonal patterns
      const spHeader = ["Ticker","Name","Years","Type","Window Start","Window End","Days","Avg Return %","Median Return %","Win Rate %","N","t-stat"];
      const csvRows2 = [spHeader.join(",")];
      for (const row of filteredData) {
        const sp = row as SeasonalPatternRow;
        for (const w of sp.bullish) {
          csvRows2.push([sp.ticker, `"${sp.name}"`, sp.yearsOfData, "Bullish", w.startLabel, w.endLabel, w.calendarDays ?? "", w.avgReturn.toFixed(4), w.medianReturn.toFixed(4), w.winRate.toFixed(1), w.years, w.tStat.toFixed(2)].join(","));
        }
        for (const w of sp.bearish) {
          csvRows2.push([sp.ticker, `"${sp.name}"`, sp.yearsOfData, "Bearish", w.startLabel, w.endLabel, w.calendarDays ?? "", w.avgReturn.toFixed(4), w.medianReturn.toFixed(4), w.winRate.toFixed(1), w.years, w.tStat.toFixed(2)].join(","));
        }
      }
      const blob2 = new Blob([csvRows2.join("\n")], { type: "text/csv" });
      const url2 = URL.createObjectURL(blob2);
      const a2 = document.createElement("a");
      a2.href = url2;
      a2.download = `seasonal_patterns_${new Date().toISOString().slice(0, 10)}.csv`;
      a2.click();
      URL.revokeObjectURL(url2);
      return;
    } else {
      const csvWindows = eventHasPreWindows(eventType) ? [...EVENT_WINDOWS_PRE, ...EVENT_WINDOWS_POST] : [...EVENT_WINDOWS_POST];
      cols = ["ticker", "name", "eventCount", ...csvWindows.map(w => `${(EVENT_WINDOW_LABELS as any)[w]} Avg`), ...csvWindows.map(w => `${(EVENT_WINDOW_LABELS as any)[w]} WinRate`)];
      header = cols;
    }

    const csvRows = [header.join(",")];
    for (const row of filteredData) {
      if (viewMode === "events") {
        const er = row as EventReturnRow;
        const csvWindows = eventHasPreWindows(eventType) ? [...EVENT_WINDOWS_PRE, ...EVENT_WINDOWS_POST] : [...EVENT_WINDOWS_POST];
        csvRows.push([
          er.ticker, `"${er.name}"`, er.eventCount,
          ...csvWindows.map(w => er.avg[w]?.toFixed(4) ?? ""),
          ...csvWindows.map(w => er.winRate[w]?.toFixed(1) ?? ""),
        ].join(","));
      } else {
        csvRows.push(cols.map(c => {
          const v = (row as any)[c];
          if (v === null || v === undefined) return "";
          if (typeof v === "number") return v.toFixed(4);
          return `"${String(v).replace(/"/g, '""')}"`;
        }).join(","));
      }
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance_${viewMode}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredData, viewMode, customStart, customEnd, eventType]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const ColHeader = ({ col, label, className }: { col: string; label: string; className?: string }) => (
    <th
      className={`px-2 py-1.5 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap ${className || ""}`}
      onClick={() => handleSort(col)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon col={col} />
      </div>
    </th>
  );

  // ---- View mode tabs ----
  const VIEW_MODES: { key: ViewMode; label: string }[] = [
    { key: "periods", label: "Periods" },
    { key: "seasonality", label: "Quarterly" },
    { key: "monthly", label: "Monthly" },
    { key: "events", label: "Event Returns" },
    { key: "seasonal-patterns", label: "Seasonal Patterns" },
  ];

  return (
    <div className="flex flex-col h-full" data-testid="performance-page">
      {/* Toolbar */}
      <div className="flex flex-col gap-1.5 px-3 py-1.5 border-b border-border bg-card flex-shrink-0">
        {/* Row 1: View toggle + controls + export */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-muted rounded p-0.5">
            {VIEW_MODES.map(vm => (
              <button
                key={vm.key}
                className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition-colors ${
                  viewMode === vm.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => { setViewMode(vm.key); setSortKey(vm.key === "monthly" ? "Jan" : vm.key === "events" ? "w_21" : vm.key === "seasonality" ? "Q1" : vm.key === "seasonal-patterns" ? "ticker" : "12M"); }}
                data-testid={`view-${vm.key}`}
              >
                {vm.label}
              </button>
            ))}
          </div>

          {viewMode === "periods" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Custom:</span>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-6 w-28 text-[11px]" data-testid="custom-start" />
              <span className="text-[11px] text-muted-foreground">to</span>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-6 w-28 text-[11px]" data-testid="custom-end" />
            </div>
          )}

          {viewMode === "seasonal-patterns" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Window:</span>
              <Input
                type="number"
                min={5}
                max={365}
                value={seasonalMinDays}
                onChange={(e) => setSeasonalMinDays(Math.max(5, parseInt(e.target.value) || 5))}
                className="h-6 w-16 text-[11px] text-center"
                data-testid="seasonal-min-days"
              />
              <span className="text-[11px] text-muted-foreground">to</span>
              <Input
                type="number"
                min={5}
                max={365}
                value={seasonalMaxDays}
                onChange={(e) => setSeasonalMaxDays(Math.max(5, parseInt(e.target.value) || 180))}
                className="h-6 w-16 text-[11px] text-center"
                data-testid="seasonal-max-days"
              />
              <span className="text-[11px] text-muted-foreground">days</span>
            </div>
          )}

          {viewMode === "events" && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Ticker-specific events */}
              <div className="flex items-center bg-muted rounded p-0.5">
                {(["earnings", "ex_div"] as EventType[]).map(et => (
                  <button
                    key={et}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      eventType === et ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setEventType(et)}
                    data-testid={`event-${et}`}
                  >
                    {EVENT_TYPE_LABELS[et]}
                  </button>
                ))}
              </div>
              {/* Macro events */}
              <div className="flex items-center bg-muted rounded p-0.5">
                {MACRO_EVENT_TYPES.map(et => (
                  <button
                    key={et}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      eventType === et ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setEventType(et)}
                    data-testid={`event-${et}`}
                  >
                    {EVENT_TYPE_LABELS[et]}
                  </button>
                ))}
              </div>
              {/* Stat toggle */}
              <div className="flex items-center bg-muted rounded p-0.5">
                {(["avg", "median", "winRate"] as EventStat[]).map(s => (
                  <button
                    key={s}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      eventStat === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setEventStat(s)}
                    data-testid={`event-stat-${s}`}
                  >
                    {s === "avg" ? "Avg Return" : s === "median" ? "Median" : "Win Rate"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ml-auto">
            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={exportCSV} data-testid="export-csv">
              <Download className="w-3 h-3 mr-1" />CSV
            </Button>
          </div>
        </div>

        {/* Row 2: Classification filters */}
        <ClassificationFilters
          filters={filters}
          onFiltersChange={setFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={filteredData.length}
          totalCount={(viewMode === "periods" || viewMode === "seasonality" ? perfData : viewMode === "monthly" ? monthlyData : viewMode === "seasonal-patterns" ? seasonalData : eventData)?.length ?? 0}
          testIdPrefix="perf"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {viewMode === "seasonal-patterns" ? "Detecting seasonal patterns (this may take a moment)..." : "Loading..."}
          </div>
        ) : viewMode === "seasonal-patterns" ? (
          <>
          {/* Upcoming windows panel */}
          <UpcomingSeasonalWindows data={filteredData as SeasonalPatternRow[]} />
          /* ── Seasonal Patterns View ─────────────────────── */
          <table className="w-full text-xs" data-testid="seasonal-patterns-table">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr>
                <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground w-16">Ticker</th>
                <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground w-44">Name</th>
                <th className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground w-10">Yrs</th>
                <th className="px-2 py-1.5 text-left text-xs font-medium text-emerald-500" colSpan={7}>Top Bullish Windows</th>
                <th className="px-2 py-1.5 text-left text-xs font-medium text-red-500" colSpan={7}>Top Bearish Windows</th>
              </tr>
              <tr className="border-b border-border/30">
                <th colSpan={3}></th>
                {/* Bullish sub-headers */}
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal">Window</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Days</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Avg</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Med</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Win%</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">N</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">t-stat</th>
                {/* Bearish sub-headers */}
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal">Window</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Days</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Avg</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Med</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Win%</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">N</th>
                <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">t-stat</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row: any, idx: number) => {
                const sp = row as SeasonalPatternRow;
                const maxRows = Math.max(sp.bullish.length, sp.bearish.length, 1);
                return Array.from({ length: maxRows }, (_, wi) => (
                  <tr
                    key={`${sp.ticker}-${wi}`}
                    className={`border-b border-border/20 hover:bg-accent/30 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                    data-testid={wi === 0 ? `perf-row-${sp.ticker}` : undefined}
                  >
                    {wi === 0 ? (
                      <>
                        <td className="px-2 py-1 font-mono font-semibold text-xs" rowSpan={maxRows}>{sp.ticker}</td>
                        <td className="px-2 py-1 text-xs text-muted-foreground truncate max-w-[180px]" rowSpan={maxRows} title={sp.name}>{sp.name}</td>
                        <td className="px-2 py-1 text-center font-mono text-xs text-muted-foreground" rowSpan={maxRows}>{sp.yearsOfData}</td>
                      </>
                    ) : null}
                    {/* Bullish window */}
                    {sp.bullish[wi] ? (
                      <>
                        <td className="px-1.5 py-1 text-xs whitespace-nowrap">
                          <span className="text-emerald-400 font-medium">{sp.bullish[wi].startLabel}</span>
                          <span className="text-muted-foreground mx-0.5">→</span>
                          <span className="text-emerald-400 font-medium">{sp.bullish[wi].endLabel}</span>
                        </td>
                        <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{sp.bullish[wi].calendarDays ?? "—"}</td>
                        <td className="px-1.5 py-1 text-right"><SeasonalCell value={sp.bullish[wi].avgReturn} /></td>
                        <td className="px-1.5 py-1 text-right"><SeasonalCell value={sp.bullish[wi].medianReturn} /></td>
                        <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-foreground">{sp.bullish[wi].winRate.toFixed(0)}%</td>
                        <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{sp.bullish[wi].years}</td>
                        <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{sp.bullish[wi].tStat.toFixed(2)}</td>
                      </>
                    ) : (
                      <><td colSpan={7}></td></>
                    )}
                    {/* Bearish window */}
                    {sp.bearish[wi] ? (
                      <>
                        <td className="px-1.5 py-1 text-xs whitespace-nowrap">
                          <span className="text-red-400 font-medium">{sp.bearish[wi].startLabel}</span>
                          <span className="text-muted-foreground mx-0.5">→</span>
                          <span className="text-red-400 font-medium">{sp.bearish[wi].endLabel}</span>
                        </td>
                        <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{sp.bearish[wi].calendarDays ?? "—"}</td>
                        <td className="px-1.5 py-1 text-right"><SeasonalCell value={sp.bearish[wi].avgReturn} /></td>
                        <td className="px-1.5 py-1 text-right"><SeasonalCell value={sp.bearish[wi].medianReturn} /></td>
                        <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-foreground">{sp.bearish[wi].winRate.toFixed(0)}%</td>
                        <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{sp.bearish[wi].years}</td>
                        <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{sp.bearish[wi].tStat.toFixed(2)}</td>
                      </>
                    ) : (
                      <><td colSpan={7}></td></>
                    )}
                  </tr>
                ));
              })}
              {filteredData.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={17} className="text-center py-8 text-muted-foreground">
                    No tickers match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </>
        ) : (
          /* ── Standard Table Views ─────────────────────── */
          <table className="w-full text-xs" data-testid="performance-table">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr>
                <ColHeader col="ticker" label="Ticker" className="text-left sticky left-0 bg-card z-20" />
                <ColHeader col="name" label="Name" className="text-left" />

                {/* Periods view */}
                {viewMode === "periods" && (
                  <>
                    <ColHeader col="lastClose" label="Last Close" className="text-right" />
                    {PRESET_PERIODS.map(p => <ColHeader key={p} col={p} label={p} className="text-right" />)}
                    {customStart && customEnd && <ColHeader col="custom" label="Custom" className="text-right" />}
                  </>
                )}

                {/* Quarterly seasonality */}
                {viewMode === "seasonality" && (
                  <>
                    <ColHeader col="lastClose" label="Last Close" className="text-right" />
                    {QUARTER_KEYS.map(q => <ColHeader key={q} col={q} label={`Avg ${q}`} className="text-right" />)}
                  </>
                )}

                {/* Monthly seasonality */}
                {viewMode === "monthly" && (
                  <>
                    {MONTH_KEYS.map(m => <ColHeader key={m} col={m} label={m} className="text-right" />)}
                    <ColHeader col="yearsOfData" label="Years" className="text-right" />
                  </>
                )}

                {/* Event returns */}
                {viewMode === "events" && (
                  <>
                    <ColHeader col="eventCount" label="Events" className="text-right" />
                    {eventHasPreWindows(eventType) && (
                      <>
                        {EVENT_WINDOWS_PRE.map(w => (
                          <ColHeader key={w} col={`w_${w}`} label={(EVENT_WINDOW_LABELS as any)[w]} className="text-right" />
                        ))}
                        <th className="px-0.5 py-1.5 w-[1px] bg-border/50" />
                      </>
                    )}
                    {EVENT_WINDOWS_POST.map(w => (
                      <ColHeader key={w} col={`w_${w}`} label={(EVENT_WINDOW_LABELS as any)[w]} className="text-right" />
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row: any, idx: number) => (
                <tr key={row.ticker} className={`border-b border-border/50 hover:bg-accent/50 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/20"}`} data-testid={`perf-row-${row.ticker}`}>
                  <td className="px-2 py-1.5 font-mono font-semibold text-xs sticky left-0 bg-inherit">{row.ticker}</td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground max-w-[200px] truncate" title={row.name}>{row.name}</td>

                  {/* Periods */}
                  {viewMode === "periods" && (
                    <>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
                        {row.lastClose !== null ? `$${row.lastClose.toFixed(2)}` : "-"}
                      </td>
                      {PRESET_PERIODS.map(p => <td key={p} className="px-2 py-1.5 text-right"><ReturnCell value={row[p]} /></td>)}
                      {customStart && customEnd && <td className="px-2 py-1.5 text-right"><ReturnCell value={row.custom} /></td>}
                    </>
                  )}

                  {/* Quarterly */}
                  {viewMode === "seasonality" && (
                    <>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
                        {row.lastClose !== null ? `$${row.lastClose.toFixed(2)}` : "-"}
                      </td>
                      {QUARTER_KEYS.map(q => <td key={q} className="px-2 py-1.5 text-right"><SeasonalCell value={row[q]} /></td>)}
                    </>
                  )}

                  {/* Monthly */}
                  {viewMode === "monthly" && (
                    <>
                      {MONTH_KEYS.map(m => (
                        <td key={m} className="px-2 py-1.5 text-right">
                          <SeasonalCell value={(row as MonthlySeasonalityRow)[m]} />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
                        {(row as MonthlySeasonalityRow).yearsOfData}
                      </td>
                    </>
                  )}

                  {/* Event returns */}
                  {viewMode === "events" && (
                    <>
                      <td className="px-2 py-1.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
                        {(row as EventReturnRow).eventCount}
                      </td>
                      {eventHasPreWindows(eventType) && (
                        <>
                          {EVENT_WINDOWS_PRE.map(w => {
                            const er = row as EventReturnRow;
                            const val = er[eventStat]?.[w] ?? null;
                            return (
                              <td key={w} className="px-2 py-1.5 text-right">
                                {eventStat === "winRate" ? (
                                  <ReturnCell value={val} suffix="%" />
                                ) : (
                                  <SeasonalCell value={val} />
                                )}
                              </td>
                            );
                          })}
                          <td className="px-0 py-1.5 w-[1px] bg-border/50" />
                        </>
                      )}
                      {EVENT_WINDOWS_POST.map(w => {
                        const er = row as EventReturnRow;
                        const val = er[eventStat]?.[w] ?? null;
                        return (
                          <td key={w} className="px-2 py-1.5 text-right">
                            {eventStat === "winRate" ? (
                              <ReturnCell value={val} suffix="%" />
                            ) : (
                              <SeasonalCell value={val} />
                            )}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))}
              {filteredData.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={20} className="text-center py-8 text-muted-foreground">
                    No tickers match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
