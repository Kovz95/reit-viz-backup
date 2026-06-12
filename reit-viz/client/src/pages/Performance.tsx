// Reconstructed from recovered-bundle/Performance-CUtKWd0D.js on 2026-06-11
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppContext } from "@/lib/appContext";
import { useWorkspaceState } from "@/lib/workspaceState";
import { getDefaultFilters, serializeFilters, deserializeFilters } from "@/lib/filterHelpers";
import { filterPerformanceData } from "@/lib/filterPerformanceData";
import { fetchPerfData } from "@/lib/fetchPerfData";
import { fetchMonthlySeasonality } from "@/lib/fetchMonthlySeasonality";
import { fetchEventReturns } from "@/lib/fetchEventReturns";
import { fetchSeasonalPatterns } from "@/lib/fetchSeasonalPatterns";
import { MONTHLY_LABELS } from "@/lib/monthlyLabels";
import { PRE_EARNINGS_WINDOWS, POST_EARNINGS_WINDOWS, WINDOW_LABELS } from "@/lib/eventWindows";
import { hasPreEarningsWindows } from "@/lib/hasPreEarningsWindows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { TrendingDown } from "@/lib/trending-down";
import { ArrowUpDown } from "@/lib/arrow-up-down";
import { SortAsc, SortDesc } from "lucide-react";
import ClassificationFilters from "@/components/ClassificationFilters";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SeasonalWindow {
  startMMDD: string;
  endMMDD: string;
  startLabel: string;
  endLabel: string;
  avgReturn: number;
  winRate: number;
  years: number;
  tStat: number;
  calendarDays?: number;
  medianReturn?: number;
}

interface SeasonalPatternRow {
  ticker: string;
  name: string;
  yearsOfData: number;
  bullish: SeasonalWindow[];
  bearish: SeasonalWindow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LOOKAHEAD_OPTIONS = [
  { label: "2 weeks", days: 14 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
];

const EVENT_TYPE_LABELS: Record<string, string> = {
  earnings: "Post-Earnings",
  ex_div: "Post-Ex-Div",
  CPI: "CPI",
  NFP: "NFP",
  FOMC: "FOMC",
  GDP: "GDP",
};

const PERIOD_COLUMNS = ["1W", "1M", "3M", "6M", "12M"];
const QUARTER_COLUMNS = ["Q1", "Q2", "Q3", "Q4"];

// ─── Parse MM/DD from string ──────────────────────────────────────────────────

function parseMMDD(mmdd: string, ref: Date): Date {
  const [month, day] = mmdd.split("-").map(Number);
  const year = ref.getFullYear();
  return new Date(year, month - 1, day);
}

function daysDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

interface WindowCheckResult {
  daysUntilStart: number;
  daysUntilEnd: number;
  isActive: boolean;
}

function checkWindowRelevance(
  window: SeasonalWindow,
  today: Date,
  lookaheadDays: number
): WindowCheckResult | null {
  const year = today.getFullYear();
  let start = parseMMDD(window.startMMDD, today);
  let end = parseMMDD(window.endMMDD, today);

  if (end <= start) {
    // Wraps year boundary
    const nextYearEnd = new Date(year + 1, end.getMonth(), end.getDate());
    const daysUntilEndNextYear = daysDiff(today, nextYearEnd);
    const daysUntilStart = daysDiff(today, start);
    const prevYearStart = new Date(year - 1, start.getMonth(), start.getDate());
    const daysUntilStartPrev = daysDiff(today, prevYearStart);
    const daysUntilEndCurr = daysDiff(today, end);

    if (daysUntilEndNextYear >= -7 && daysUntilStartPrev <= lookaheadDays) {
      const isActive = daysUntilStartPrev <= 0 && daysUntilEndNextYear >= 0;
      if (daysUntilEndNextYear < -7 || (!isActive && daysUntilStartPrev > lookaheadDays)) return null;
      return { daysUntilStart: daysUntilStartPrev, daysUntilEnd: daysUntilEndNextYear, isActive };
    }
    const isActiveCurr = daysUntilStart <= 0 && daysUntilEndNextYear >= 0;
    if (daysUntilEndNextYear < -7 || (!isActiveCurr && daysUntilStart > lookaheadDays)) return null;
    return { daysUntilStart, daysUntilEnd: daysUntilEndNextYear, isActive: isActiveCurr };
  }

  const daysUntilStart = daysDiff(today, start);
  const daysUntilEnd = daysDiff(today, end);
  const isActive = daysUntilStart <= 0 && daysUntilEnd >= 0;
  if (daysUntilEnd < -7 || (!isActive && daysUntilStart > lookaheadDays)) return null;
  return { daysUntilStart, daysUntilEnd, isActive };
}

// ─── Upcoming Windows Panel ───────────────────────────────────────────────────

function UpcomingWindowsPanel({ data }: { data: SeasonalPatternRow[] }) {
  const [lookaheadDays, setLookaheadDays] = useState(30);
  const [expanded, setExpanded] = useState(false);
  const [dirFilter, setDirFilter] = useState<"all" | "bullish" | "bearish">("all");

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const windows = useMemo(() => {
    const results: any[] = [];
    for (const row of data) {
      for (const w of row.bullish) {
        const check = checkWindowRelevance(w, today, lookaheadDays);
        if (check) results.push({ ticker: row.ticker, name: row.name, window: w, direction: "bullish", ...check });
      }
      for (const w of row.bearish) {
        const check = checkWindowRelevance(w, today, lookaheadDays);
        if (check) results.push({ ticker: row.ticker, name: row.name, window: w, direction: "bearish", ...check });
      }
    }
    const sorted = results.sort((a, b) =>
      a.isActive && !b.isActive ? -1 : !a.isActive && b.isActive ? 1 : a.daysUntilStart - b.daysUntilStart
    );
    return dirFilter !== "all" ? sorted.filter((r) => r.direction === dirFilter) : sorted;
  }, [data, today, lookaheadDays, dirFilter]);

  const activeCount = windows.filter((w) => w.isActive).length;
  const upcomingCount = windows.filter((w) => !w.isActive).length;

  return (
    <div className="border-b border-border bg-card/50">
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Calendar icon placeholder */}
        <span className="w-3.5 h-3.5 text-blue-400">📅</span>
        <span className="text-xs font-medium text-foreground">Upcoming Windows</span>
        {activeCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
            {activeCount} active now
          </span>
        )}
        {upcomingCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">
            {upcomingCount} upcoming
          </span>
        )}
        {windows.length === 0 && (
          <span className="text-[10px] text-muted-foreground">None in range</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {expanded ? (
            <span className="w-3.5 h-3.5 text-muted-foreground">▲</span>
          ) : (
            <span className="w-3.5 h-3.5 text-muted-foreground">▼</span>
          )}
        </div>
      </div>

      {!expanded && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex items-center bg-muted rounded p-0.5">
              {LOOKAHEAD_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                    lookaheadDays === opt.days
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setLookaheadDays(opt.days)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center bg-muted rounded p-0.5">
              {(["all", "bullish", "bearish"] as const).map((d) => (
                <button
                  key={d}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                    dirFilter === d
                      ? d === "bullish"
                        ? "bg-emerald-600/30 text-emerald-400 shadow-sm"
                        : d === "bearish"
                        ? "bg-red-600/30 text-red-400 shadow-sm"
                        : "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setDirFilter(d)}
                >
                  {d === "all" ? "All" : d === "bullish" ? "Bullish" : "Bearish"}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {windows.length} window{windows.length !== 1 ? "s" : ""}
            </span>
          </div>

          {windows.length > 0 ? (
            <div className="max-h-[220px] overflow-y-auto rounded border border-border/50">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b border-border/50">
                  <tr>
                    <th className="px-2 py-1 text-left text-[10px] font-medium text-muted-foreground w-10">Status</th>
                    <th className="px-2 py-1 text-left text-[10px] font-medium text-muted-foreground w-14">Ticker</th>
                    <th className="px-2 py-1 text-left text-[10px] font-medium text-muted-foreground w-10">Dir</th>
                    <th className="px-2 py-1 text-left text-[10px] font-medium text-muted-foreground">Window</th>
                    <th className="px-2 py-1 text-right text-[10px] font-medium text-muted-foreground w-14">Starts</th>
                    <th className="px-2 py-1 text-right text-[10px] font-medium text-muted-foreground w-12">Avg</th>
                    <th className="px-2 py-1 text-right text-[10px] font-medium text-muted-foreground w-12">Win%</th>
                    <th className="px-2 py-1 text-right text-[10px] font-medium text-muted-foreground w-8">N</th>
                    <th className="px-2 py-1 text-right text-[10px] font-medium text-muted-foreground w-12">t-stat</th>
                  </tr>
                </thead>
                <tbody>
                  {windows.map((row, idx) => (
                    <tr
                      key={`${row.ticker}-${row.direction}-${row.window.startMMDD}-${row.window.endMMDD}-${idx}`}
                      className={`border-b border-border/20 hover:bg-accent/30 transition-colors ${row.isActive ? "bg-amber-500/5" : ""}`}
                    >
                      <td className="px-2 py-1">
                        {row.isActive ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            Live
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Soon</span>
                        )}
                      </td>
                      <td className="px-2 py-1 font-mono font-semibold">{row.ticker}</td>
                      <td className="px-2 py-1">
                        {row.direction === "bullish" ? (
                          <span className="w-3 h-3 text-emerald-400">▲</span>
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-400" />
                        )}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        <span className={row.direction === "bullish" ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                          {row.window.startLabel}
                        </span>
                        <span className="text-muted-foreground mx-0.5">→</span>
                        <span className={row.direction === "bullish" ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                          {row.window.endLabel}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">
                        {row.isActive ? (
                          <span className="text-amber-400">{row.daysUntilEnd}d left</span>
                        ) : row.daysUntilEnd < 0 ? (
                          <span className="text-muted-foreground">Ended {Math.abs(row.daysUntilEnd)}d ago</span>
                        ) : (
                          <span className="text-blue-400">In {row.daysUntilStart}d</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className={`font-mono tabular-nums ${row.window.avgReturn > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {row.window.avgReturn > 0 ? "+" : ""}{row.window.avgReturn.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-foreground">
                        {row.window.winRate.toFixed(0)}%
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                        {row.window.years}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                        {row.window.tStat.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-3 text-[11px] text-muted-foreground">
              No seasonal windows starting within {lookaheadDays} days
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Cell helpers ─────────────────────────────────────────────────────────────

function ReturnCell({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  const colorClass = value > 0 ? "text-emerald-500" : value < 0 ? "text-red-500" : "text-foreground";
  return (
    <span className={`font-mono text-xs tabular-nums ${colorClass}`}>
      {value > 0 ? "+" : ""}{value.toFixed(2)}{suffix}
    </span>
  );
}

function HeatCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  const clamped = Math.max(-5, Math.min(5, value)) / 5;
  const intensity = Math.abs(clamped) * 0.25;
  const bg =
    clamped > 0
      ? `rgba(34, 197, 94, ${intensity})`
      : clamped < 0
      ? `rgba(239, 68, 68, ${intensity})`
      : "transparent";
  const colorClass = value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-foreground";
  return (
    <span
      className={`font-mono text-xs tabular-nums ${colorClass} px-1.5 py-0.5 rounded`}
      style={{ backgroundColor: bg }}
    >
      {value > 0 ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Performance() {
  const { universeTickers } = useAppContext();

  const [viewMode, setViewMode] = useState("periods");
  const [filters, setFilters] = useState(getDefaultFilters);
  const [manualTickers, setManualTickers] = useState(new Set<string>());
  const [searchText, setSearchText] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sortKey, setSortKey] = useState("12M");
  const [sortAsc, setSortAsc] = useState(false);
  const [eventType, setEventType] = useState("earnings");
  const [eventStat, setEventStat] = useState("avg");
  const [seasonalMinDays, setSeasonalMinDays] = useState(30);
  const [seasonalMaxDays, setSeasonalMaxDays] = useState(180);

  // ── Workspace state ──
  const serializeState = useCallback(
    () => ({
      viewMode,
      filters: serializeFilters(filters),
      manualTickers: [...manualTickers],
      customStart,
      customEnd,
      sortKey,
      sortAsc,
      eventType,
      eventStat,
      seasonalMinDays,
      seasonalMaxDays,
    }),
    [viewMode, filters, manualTickers, customStart, customEnd, sortKey, sortAsc, eventType, eventStat, seasonalMinDays, seasonalMaxDays]
  );

  const hydrateState = useCallback((state: any) => {
    if (state.viewMode !== undefined) setViewMode(state.viewMode);
    if (state.filters !== undefined) setFilters(deserializeFilters(state.filters));
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

  useWorkspaceState("performance", serializeState, hydrateState);

  // ── Data queries ──
  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ["/perf-data", customStart, customEnd],
    queryFn: () => fetchPerfData(customStart || undefined, customEnd || undefined),
  });
  const { data: monthlyData, isLoading: monthlyLoading } = useQuery<any[]>({
    queryKey: ["/monthly-seasonality"],
    queryFn: fetchMonthlySeasonality,
    enabled: viewMode === "monthly",
  });
  const { data: eventData, isLoading: eventLoading } = useQuery({
    queryKey: ["/event-returns", eventType],
    queryFn: () => fetchEventReturns(eventType),
    enabled: viewMode === "events",
  });
  const { data: seasonalData, isLoading: seasonalLoading } = useQuery({
    queryKey: ["/seasonal-patterns", seasonalMinDays, seasonalMaxDays],
    queryFn: () => fetchSeasonalPatterns(5, seasonalMinDays, seasonalMaxDays),
    enabled: viewMode === "seasonal-patterns",
  });

  const isLoading =
    viewMode === "periods" || viewMode === "seasonality"
      ? perfLoading
      : viewMode === "monthly"
      ? monthlyLoading
      : viewMode === "seasonal-patterns"
      ? seasonalLoading
      : eventLoading;

  // ── Filtered & sorted rows ──
  const displayRows = useMemo(() => {
    let rows: any[] = [];
    if (viewMode === "periods" || viewMode === "seasonality") rows = perfData || [];
    else if (viewMode === "monthly") rows = monthlyData || [];
    else if (viewMode === "seasonal-patterns") rows = seasonalData || [];
    else rows = eventData || [];

    if (universeTickers) {
      rows = rows.filter((r: any) => universeTickers.has(r.ticker));
    }

    return [...filterPerformanceData(rows, filters, searchText, manualTickers)].sort(
      (a: any, b: any) => {
        let av: any, bv: any;
        if (viewMode === "events" && sortKey.startsWith("w_")) {
          const windowId = parseInt(sortKey.replace("w_", ""));
          av = a[eventStat]?.[windowId] ?? null;
          bv = b[eventStat]?.[windowId] ?? null;
        } else {
          av = a[sortKey];
          bv = b[sortKey];
        }
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        if (typeof av === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortAsc ? av - bv : bv - av;
      }
    );
  }, [perfData, monthlyData, eventData, seasonalData, viewMode, filters, searchText, manualTickers, sortKey, sortAsc, universeTickers, eventStat]);

  const handleSort = useCallback(
    (col: string) => {
      if (sortKey === col) setSortAsc(!sortAsc);
      else { setSortKey(col); setSortAsc(false); }
    },
    [sortKey, sortAsc]
  );

  // ── CSV export ──
  const handleExportCsv = useCallback(() => {
    if (!displayRows.length) return;
    let colKeys: string[];
    let colLabels: string[];

    if (viewMode === "periods") {
      colKeys = ["ticker", "name", "lastClose", ...PERIOD_COLUMNS, ...(customStart && customEnd ? ["custom"] : [])];
      colLabels = colKeys.map((k) =>
        k === "lastClose" ? "Last Close" : k === "custom" ? `Custom (${customStart} to ${customEnd})` : k
      );
    } else if (viewMode === "seasonality") {
      colKeys = ["ticker", "name", "lastClose", ...QUARTER_COLUMNS];
      colLabels = colKeys.map((k) => (k === "lastClose" ? "Last Close" : `Avg ${k}`));
    } else if (viewMode === "monthly") {
      colKeys = ["ticker", "name", ...MONTHLY_LABELS.map((m: string) => m), "yearsOfData"];
      colLabels = colKeys;
    } else if (viewMode === "seasonal-patterns") {
      const lines = [
        ["Ticker", "Name", "Years", "Type", "Window Start", "Window End", "Days", "Avg Return %", "Median Return %", "Win Rate %", "N", "t-stat"].join(","),
      ];
      for (const row of displayRows) {
        const r = row as SeasonalPatternRow;
        for (const w of r.bullish) {
          lines.push([r.ticker, `"${r.name}"`, r.yearsOfData, "Bullish", w.startLabel, w.endLabel, w.calendarDays ?? "", w.avgReturn.toFixed(4), w.medianReturn?.toFixed(4) ?? "", w.winRate.toFixed(1), w.years, w.tStat.toFixed(2)].join(","));
        }
        for (const w of r.bearish) {
          lines.push([r.ticker, `"${r.name}"`, r.yearsOfData, "Bearish", w.startLabel, w.endLabel, w.calendarDays ?? "", w.avgReturn.toFixed(4), w.medianReturn?.toFixed(4) ?? "", w.winRate.toFixed(1), w.years, w.tStat.toFixed(2)].join(","));
        }
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seasonal_patterns_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    } else {
      const windowCols = hasPreEarningsWindows(eventType) ? [...PRE_EARNINGS_WINDOWS, ...POST_EARNINGS_WINDOWS] : [...POST_EARNINGS_WINDOWS];
      colKeys = ["ticker", "name", "eventCount", ...windowCols.map((w) => `${WINDOW_LABELS[w]} Avg`), ...windowCols.map((w) => `${WINDOW_LABELS[w]} WinRate`)];
      colLabels = colKeys;
    }

    const lines = [colLabels.join(",")];
    for (const row of displayRows) {
      if (viewMode === "events") {
        const windowCols = hasPreEarningsWindows(eventType) ? [...PRE_EARNINGS_WINDOWS, ...POST_EARNINGS_WINDOWS] : [...POST_EARNINGS_WINDOWS];
        lines.push([
          row.ticker,
          `"${row.name}"`,
          row.eventCount,
          ...windowCols.map((w) => row.avg?.[w]?.toFixed(4) ?? ""),
          ...windowCols.map((w) => row.winRate?.[w]?.toFixed(1) ?? ""),
        ].join(","));
      } else {
        lines.push(colKeys.map((k) => {
          const v = row[k];
          return v == null ? "" : typeof v === "number" ? v.toFixed(4) : `"${String(v).replace(/"/g, '""')}"`;
        }).join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance_${viewMode}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayRows, viewMode, customStart, customEnd, eventType]);

  // ── Sort icon component ──
  const SortIcon = ({ col }: { col: string }) =>
    sortKey !== col ? (
      <ArrowUpDown className="w-3 h-3 opacity-40" />
    ) : sortAsc ? (
      <SortAsc className="w-3 h-3" />
    ) : (
      <SortDesc className="w-3 h-3" />
    );

  const ColHeader = ({
    col,
    label,
    className,
  }: {
    col: string;
    label: string;
    className?: string;
  }) => (
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

  const VIEW_TABS = [
    { key: "periods", label: "Periods" },
    { key: "seasonality", label: "Quarterly" },
    { key: "monthly", label: "Monthly" },
    { key: "events", label: "Event Returns" },
    { key: "seasonal-patterns", label: "Seasonal Patterns" },
  ];

  const totalRowCount =
    (viewMode === "periods" || viewMode === "seasonality"
      ? perfData
      : viewMode === "monthly"
      ? monthlyData
      : viewMode === "seasonal-patterns"
      ? seasonalData
      : eventData)?.length ?? 0;

  return (
    <div className="flex flex-col h-full" data-testid="performance-page">
      {/* ── Header ── */}
      <div className="flex flex-col gap-1.5 px-3 py-1.5 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* View tabs */}
          <div className="flex items-center bg-muted rounded p-0.5">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.key}
                className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition-colors ${
                  viewMode === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setViewMode(tab.key);
                  setSortKey(
                    tab.key === "monthly"
                      ? "Jan"
                      : tab.key === "events"
                      ? "w_21"
                      : tab.key === "seasonality"
                      ? "Q1"
                      : tab.key === "seasonal-patterns"
                      ? "ticker"
                      : "12M"
                  );
                }}
                data-testid={`view-${tab.key}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Custom date range (periods) */}
          {viewMode === "periods" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Custom:</span>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-6 w-28 text-[11px]"
                data-testid="custom-start"
              />
              <span className="text-[11px] text-muted-foreground">to</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-6 w-28 text-[11px]"
                data-testid="custom-end"
              />
            </div>
          )}

          {/* Seasonal pattern window range */}
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

          {/* Event controls */}
          {viewMode === "events" && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-muted rounded p-0.5">
                {["earnings", "ex_div"].map((t) => (
                  <button
                    key={t}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      eventType === t
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setEventType(t)}
                    data-testid={`event-${t}`}
                  >
                    {EVENT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <div className="flex items-center bg-muted rounded p-0.5">
                {/* Macro event types from MACRO_EVENT_TYPES constant */}
                {["CPI", "NFP", "FOMC", "GDP"].map((t) => (
                  <button
                    key={t}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      eventType === t
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setEventType(t)}
                    data-testid={`event-${t}`}
                  >
                    {EVENT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <div className="flex items-center bg-muted rounded p-0.5">
                {(["avg", "median", "winRate"] as const).map((stat) => (
                  <button
                    key={stat}
                    className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      eventStat === stat
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setEventStat(stat)}
                    data-testid={`event-stat-${stat}`}
                  >
                    {stat === "avg" ? "Avg Return" : stat === "median" ? "Median" : "Win Rate"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CSV export */}
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={handleExportCsv}
              data-testid="export-csv"
            >
              <Download className="w-3 h-3 mr-1" />
              CSV
            </Button>
          </div>
        </div>

        {/* Classification filter */}
        <ClassificationFilters
          filters={filters}
          onFiltersChange={setFilters}
          search={searchText}
          onSearchChange={setSearchText}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={displayRows.length}
          totalCount={totalRowCount}
          testIdPrefix="perf"
        />
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {viewMode === "seasonal-patterns"
              ? "Detecting seasonal patterns (this may take a moment)..."
              : "Loading..."}
          </div>
        ) : viewMode === "seasonal-patterns" ? (
          <>
            <UpcomingWindowsPanel data={displayRows as SeasonalPatternRow[]} />
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
                  <th colSpan={3} />
                  <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal">Window</th>
                  <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Days</th>
                  <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Avg</th>
                  <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Med</th>
                  <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">Win%</th>
                  <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">N</th>
                  <th className="px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right">t-stat</th>
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
                {(displayRows as SeasonalPatternRow[]).map((row, rowIdx) => {
                  const maxLen = Math.max(row.bullish.length, row.bearish.length, 1);
                  return Array.from({ length: maxLen }, (_, r) => (
                    <tr
                      key={`${row.ticker}-${r}`}
                      className={`border-b border-border/20 hover:bg-accent/30 transition-colors ${rowIdx % 2 === 0 ? "" : "bg-muted/10"}`}
                      data-testid={r === 0 ? `perf-row-${row.ticker}` : undefined}
                    >
                      {r === 0 && (
                        <>
                          <td className="px-2 py-1 font-mono font-semibold text-xs" rowSpan={maxLen}>{row.ticker}</td>
                          <td className="px-2 py-1 text-xs text-muted-foreground truncate max-w-[180px]" rowSpan={maxLen} title={row.name}>{row.name}</td>
                          <td className="px-2 py-1 text-center font-mono text-xs text-muted-foreground" rowSpan={maxLen}>{row.yearsOfData}</td>
                        </>
                      )}
                      {row.bullish[r] ? (
                        <>
                          <td className="px-1.5 py-1 text-xs whitespace-nowrap">
                            <span className="text-emerald-400 font-medium">{row.bullish[r].startLabel}</span>
                            <span className="text-muted-foreground mx-0.5">→</span>
                            <span className="text-emerald-400 font-medium">{row.bullish[r].endLabel}</span>
                          </td>
                          <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{row.bullish[r].calendarDays ?? "—"}</td>
                          <td className="px-1.5 py-1 text-right"><HeatCell value={row.bullish[r].avgReturn} /></td>
                          <td className="px-1.5 py-1 text-right"><HeatCell value={row.bullish[r].medianReturn ?? null} /></td>
                          <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-foreground">{row.bullish[r].winRate.toFixed(0)}%</td>
                          <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{row.bullish[r].years}</td>
                          <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{row.bullish[r].tStat.toFixed(2)}</td>
                        </>
                      ) : (
                        <td colSpan={7} />
                      )}
                      {row.bearish[r] ? (
                        <>
                          <td className="px-1.5 py-1 text-xs whitespace-nowrap">
                            <span className="text-red-400 font-medium">{row.bearish[r].startLabel}</span>
                            <span className="text-muted-foreground mx-0.5">→</span>
                            <span className="text-red-400 font-medium">{row.bearish[r].endLabel}</span>
                          </td>
                          <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{row.bearish[r].calendarDays ?? "—"}</td>
                          <td className="px-1.5 py-1 text-right"><HeatCell value={row.bearish[r].avgReturn} /></td>
                          <td className="px-1.5 py-1 text-right"><HeatCell value={row.bearish[r].medianReturn ?? null} /></td>
                          <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-foreground">{row.bearish[r].winRate.toFixed(0)}%</td>
                          <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{row.bearish[r].years}</td>
                          <td className="px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground">{row.bearish[r].tStat.toFixed(2)}</td>
                        </>
                      ) : (
                        <td colSpan={7} />
                      )}
                    </tr>
                  ));
                })}
                {displayRows.length === 0 && !isLoading && (
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
          <table className="w-full text-xs" data-testid="performance-table">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr>
                <ColHeader col="ticker" label="Ticker" className="text-left sticky left-0 bg-card z-20" />
                <ColHeader col="name" label="Name" className="text-left" />
                {viewMode === "periods" && (
                  <>
                    <ColHeader col="lastClose" label="Last Close" className="text-right" />
                    {PERIOD_COLUMNS.map((col) => (
                      <ColHeader key={col} col={col} label={col} className="text-right" />
                    ))}
                    {customStart && customEnd && (
                      <ColHeader col="custom" label="Custom" className="text-right" />
                    )}
                  </>
                )}
                {viewMode === "seasonality" && (
                  <>
                    <ColHeader col="lastClose" label="Last Close" className="text-right" />
                    {QUARTER_COLUMNS.map((col) => (
                      <ColHeader key={col} col={col} label={`Avg ${col}`} className="text-right" />
                    ))}
                  </>
                )}
                {viewMode === "monthly" && (
                  <>
                    {MONTHLY_LABELS.map((col: string) => (
                      <ColHeader key={col} col={col} label={col} className="text-right" />
                    ))}
                    <ColHeader col="yearsOfData" label="Years" className="text-right" />
                  </>
                )}
                {viewMode === "events" && (
                  <>
                    <ColHeader col="eventCount" label="Events" className="text-right" />
                    {hasPreEarningsWindows(eventType) && (
                      <>
                        {PRE_EARNINGS_WINDOWS.map((w: number) => (
                          <ColHeader key={w} col={`w_${w}`} label={WINDOW_LABELS[w]} className="text-right" />
                        ))}
                        <th className="px-0.5 py-1.5 w-[1px] bg-border/50" />
                      </>
                    )}
                    {POST_EARNINGS_WINDOWS.map((w: number) => (
                      <ColHeader key={w} col={`w_${w}`} label={WINDOW_LABELS[w]} className="text-right" />
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row: any, idx: number) => (
                <tr
                  key={row.ticker}
                  className={`border-b border-border/50 hover:bg-accent/50 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
                  data-testid={`perf-row-${row.ticker}`}
                >
                  <td className="px-2 py-1.5 font-mono font-semibold text-xs sticky left-0 bg-inherit">{row.ticker}</td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground max-w-[200px] truncate" title={row.name}>{row.name}</td>
                  {viewMode === "periods" && (
                    <>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
                        {row.lastClose !== null ? `$${row.lastClose.toFixed(2)}` : "-"}
                      </td>
                      {PERIOD_COLUMNS.map((col) => (
                        <td key={col} className="px-2 py-1.5 text-right">
                          <ReturnCell value={row[col]} />
                        </td>
                      ))}
                      {customStart && customEnd && (
                        <td className="px-2 py-1.5 text-right">
                          <ReturnCell value={row.custom} />
                        </td>
                      )}
                    </>
                  )}
                  {viewMode === "seasonality" && (
                    <>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
                        {row.lastClose !== null ? `$${row.lastClose.toFixed(2)}` : "-"}
                      </td>
                      {QUARTER_COLUMNS.map((col) => (
                        <td key={col} className="px-2 py-1.5 text-right">
                          <HeatCell value={row[col]} />
                        </td>
                      ))}
                    </>
                  )}
                  {viewMode === "monthly" && (
                    <>
                      {MONTHLY_LABELS.map((col: string) => (
                        <td key={col} className="px-2 py-1.5 text-right">
                          <HeatCell value={row[col]} />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
                        {row.yearsOfData}
                      </td>
                    </>
                  )}
                  {viewMode === "events" && (
                    <>
                      <td className="px-2 py-1.5 text-right font-mono text-xs text-muted-foreground tabular-nums">{row.eventCount}</td>
                      {hasPreEarningsWindows(eventType) && (
                        <>
                          {PRE_EARNINGS_WINDOWS.map((w: number) => {
                            const val = row[eventStat]?.[w] ?? null;
                            return (
                              <td key={w} className="px-2 py-1.5 text-right">
                                {eventStat === "winRate" ? <ReturnCell value={val} suffix="%" /> : <HeatCell value={val} />}
                              </td>
                            );
                          })}
                          <td className="px-0 py-1.5 w-[1px] bg-border/50" />
                        </>
                      )}
                      {POST_EARNINGS_WINDOWS.map((w: number) => {
                        const val = row[eventStat]?.[w] ?? null;
                        return (
                          <td key={w} className="px-2 py-1.5 text-right">
                            {eventStat === "winRate" ? <ReturnCell value={val} suffix="%" /> : <HeatCell value={val} />}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))}
              {displayRows.length === 0 && !isLoading && (
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
