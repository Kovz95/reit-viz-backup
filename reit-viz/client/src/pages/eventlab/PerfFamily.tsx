// PerfFamily — Event Lab port of pages/Performance.tsx (2026-07-28).
// Faithful copy except the Event Returns view, which now computes rows
// client-side via dataService.getEventReturns (the server feed returned
// eventCount 0 for every kind and carried no median).
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppContext } from "@/lib/appContext";
import { useWorkspaceState } from "@/lib/workspaceState";
import { getDefaultFilters, serializeFilters, deserializeFilters } from "@/lib/filterHelpers";
import { filterPerformanceData } from "@/lib/filterPerformanceData";
import { fetchPerfData } from "@/lib/fetchPerfData";
import { getMetricSeries } from "@/lib/dataService";
import { fetchMonthlySeasonality } from "@/lib/fetchMonthlySeasonality";
import { fetchSeasonalPatterns } from "@/lib/fetchSeasonalPatterns";
import { MONTHLY_LABELS } from "@/lib/monthlyLabels";
import {
  getEventReturns,
  EVENT_WINDOWS_PRE,
  EVENT_WINDOWS_POST,
  EVENT_WINDOW_LABELS,
  eventHasPreWindows,
  type EventType,
} from "@/lib/dataService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DateInput from "@/components/DateInput";
import { Download, Loader2, Search, X } from "lucide-react";
import { AddPairControl } from "@/components/AddPairControl";
import { navigateToTicker } from "@/lib/navigateToTicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingDown } from "@/lib/trending-down";
import { ArrowUpDown } from "@/lib/arrow-up-down";
import { SortAsc, SortDesc } from "lucide-react";
import ClassificationFilters from "@/components/ClassificationFilters";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { useBasketScope, BasketScopeSelect } from "@/components/BasketScopeSelect";
import { PagePresets } from "@/components/PagePresets";
import { useBaskets, type Basket } from "@/lib/useBaskets";
import { getBasketOhlc } from "@/lib/basketOhlc";

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

// ─── Basket composite rows ────────────────────────────────────────────────────
// Baskets appear as synthetic rows in the periods / seasonality / monthly
// views, computed from the equal-weight composite (getBasketOhlc bars).

interface BasketBar { date: string; close: number }

function isoSubtractDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** First bar index with date >= iso (or -1). */
function firstBarAtOrAfter(bars: BasketBar[], iso: string): number {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date >= iso) { ans = mid; hi = mid - 1; }
    else lo = mid + 1;
  }
  return ans;
}

function barReturn(bars: BasketBar[], fromIdx: number, toIdx: number): number | null {
  if (fromIdx < 0 || toIdx <= fromIdx || toIdx >= bars.length) return null;
  const a = bars[fromIdx].close, b = bars[toIdx].close;
  return a > 0 && b > 0 ? (b / a - 1) * 100 : null;
}

/** Periods + seasonality row for a basket composite. */
function basketPerfRow(basket: Basket, bars: BasketBar[], customStart?: string, customEnd?: string): any {
  const row: any = {
    ticker: basket.name,
    name: `Basket · ${basket.tickers.length} members`,
    isBasket: true,
    economy: "", sector: "", subsector: "", industryGroup: "", industry: "", subindustry: "",
    "1W": null, "1M": null, "3M": null, "6M": null, "12M": null,
    custom: null, Q1: null, Q2: null, Q3: null, Q4: null, lastClose: null,
  };
  if (bars.length < 2) return row;
  const lastIdx = bars.length - 1;
  const lastDate = bars[lastIdx].date;
  const periodOffsets: Record<string, number> = { "1W": 7, "1M": 30, "3M": 91, "6M": 182, "12M": 365 };
  // Intra-period excursion (highest/lowest close touched vs the period start).
  const excursion = (fromIdx: number, toIdx: number): { max: number; min: number } | null => {
    if (fromIdx < 0 || toIdx <= fromIdx || toIdx >= bars.length) return null;
    const base = bars[fromIdx].close;
    if (!(base > 0)) return null;
    let max = -Infinity, min = Infinity;
    for (let k = fromIdx + 1; k <= toIdx; k++) {
      const r = (bars[k].close / base - 1) * 100;
      if (r > max) max = r;
      if (r < min) min = r;
    }
    return max === -Infinity ? null : { max, min };
  };
  for (const [key, days] of Object.entries(periodOffsets)) {
    const fromIdx = firstBarAtOrAfter(bars, isoSubtractDays(lastDate, days));
    row[key] = barReturn(bars, fromIdx, lastIdx);
    const exc = excursion(fromIdx, lastIdx);
    row[`${key}Max`] = exc ? exc.max : null;
    row[`${key}Min`] = exc ? exc.min : null;
  }
  if (customStart && customEnd) {
    const fromIdx = firstBarAtOrAfter(bars, customStart);
    let toIdx = firstBarAtOrAfter(bars, customEnd);
    if (toIdx < 0) toIdx = lastIdx;
    else if (bars[toIdx].date > customEnd) toIdx--;
    row.custom = barReturn(bars, fromIdx, toIdx);
    const exc = excursion(fromIdx, toIdx);
    row.customMax = exc ? exc.max : null;
    row.customMin = exc ? exc.min : null;
  }
  // Average return per calendar quarter across years
  const qReturns: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
  let i = 0;
  while (i < bars.length) {
    const y = bars[i].date.slice(0, 4);
    const q = Math.floor((Number(bars[i].date.slice(5, 7)) - 1) / 3) + 1;
    let j = i;
    while (j + 1 < bars.length &&
      bars[j + 1].date.slice(0, 4) === y &&
      Math.floor((Number(bars[j + 1].date.slice(5, 7)) - 1) / 3) + 1 === q) j++;
    const ret = barReturn(bars, i, j);
    if (ret !== null) qReturns[q].push(ret);
    i = j + 1;
  }
  for (const q of [1, 2, 3, 4]) {
    const arr = qReturns[q];
    if (arr.length) row[`Q${q}`] = arr.reduce((s, v) => s + v, 0) / arr.length;
  }
  return row;
}

/** Monthly-seasonality row for a basket composite (avg return per calendar month). */
function basketMonthlyRow(basket: Basket, bars: BasketBar[], touchPct = 3): any {
  const row: any = { ticker: basket.name, name: `Basket · ${basket.tickers.length} members`, isBasket: true, yearsOfData: 0 };
  for (const m of MONTHLY_LABELS) row[m] = null;
  if (bars.length < 2) return row;
  const byMonth: Record<number, number[]> = {};
  const maxByMonth: Record<number, number[]> = {};
  const years = new Set<string>();
  let i = 0;
  while (i < bars.length) {
    const ym = bars[i].date.slice(0, 7);
    let j = i;
    while (j + 1 < bars.length && bars[j + 1].date.slice(0, 7) === ym) j++;
    const ret = barReturn(bars, i, j);
    if (ret !== null) {
      const m = Number(ym.slice(5, 7)) - 1;
      (byMonth[m] ??= []).push(ret);
      // Intra-month peak vs the month's first bar.
      let hi = -Infinity;
      for (let k = i + 1; k <= j; k++) {
        const r = (bars[k].close / bars[i].close - 1) * 100;
        if (r > hi) hi = r;
      }
      if (hi !== -Infinity) (maxByMonth[m] ??= []).push(hi);
      years.add(ym.slice(0, 4));
    }
    i = j + 1;
  }
  MONTHLY_LABELS.forEach((label: string, m: number) => {
    const arr = byMonth[m];
    if (arr?.length) {
      row[label] = arr.reduce((s, v) => s + v, 0) / arr.length;
      row[`${label}Win`] = (arr.filter((v) => v > 0).length / arr.length) * 100;
    }
    const mx = maxByMonth[m];
    if (mx?.length) {
      row[`${label}Hit`] = (mx.filter((v) => v >= touchPct).length / mx.length) * 100;
    }
  });
  row.yearsOfData = years.size;
  return row;
}

/** Seasonal-pattern row for a basket composite — same candidate-window grid as
 *  the server route (1st/15th starts × min/mid/max durations, ranked by t-stat). */
function basketSeasonalRow(basket: Basket, bars: BasketBar[], minDays: number, maxDays: number): SeasonalPatternRow {
  const row: any = { ticker: basket.name, name: `Basket · ${basket.tickers.length} members`, isBasket: true, yearsOfData: 0, bullish: [], bearish: [] };
  if (bars.length < 30) return row;
  const years: number[] = [];
  {
    const ySet = new Set<number>();
    for (const b of bars) ySet.add(parseInt(b.date.slice(0, 4)));
    years.push(...[...ySet].sort());
  }
  row.yearsOfData = years.length;
  const MIN_YEARS = 5;
  if (years.length < MIN_YEARS) return row;

  const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const labelOf = (iso: string) => `${MONTHS_ABBR[parseInt(iso.slice(5, 7)) - 1]} ${parseInt(iso.slice(8, 10))}`;
  const starts: string[] = [];
  for (let m = 1; m <= 12; m++) {
    starts.push(`${String(m).padStart(2, "0")}-01`, `${String(m).padStart(2, "0")}-15`);
  }
  const durations = [minDays, Math.round((minDays + maxDays) / 2), maxDays].filter((v, i, arr) => arr.indexOf(v) === i);
  const median = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    const m = s.length;
    return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
  };

  const windows: SeasonalWindow[] = [];
  for (const sMMDD of starts) {
    for (const dur of durations) {
      const rets: number[] = [];
      let startD = "", endD = "";
      for (const y of years) {
        const sDate = `${y}-${sMMDD}`;
        const eDate = isoSubtractDays(sDate, -dur);
        const si = firstBarAtOrAfter(bars, sDate);
        const ei = firstBarAtOrAfter(bars, eDate);
        if (si < 0 || ei < 0 || ei <= si) continue;
        // Guard: the located bars must still be near the target window (a
        // basket whose history starts mid-range would otherwise fabricate returns).
        if (bars[si].date > isoSubtractDays(sDate, -7)) continue;
        const r = barReturn(bars, si, ei);
        if (r === null) continue;
        rets.push(r);
        if (!startD) { startD = sDate; endD = eDate; }
      }
      if (rets.length < MIN_YEARS) continue;
      const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
      const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, rets.length - 1);
      const std = Math.sqrt(variance);
      windows.push({
        startLabel: labelOf(startD), endLabel: labelOf(endD),
        startMMDD: sMMDD, endMMDD: endD.slice(5),
        calendarDays: dur, avgReturn: mean, medianReturn: median(rets),
        winRate: (rets.filter((v) => v > 0).length / rets.length) * 100,
        years: rets.length,
        tStat: std === 0 ? 0 : mean / (std / Math.sqrt(rets.length)),
      });
    }
  }
  const byT = [...windows].sort((a, b) => b.tStat - a.tStat);
  row.bullish = byT.filter((w) => w.avgReturn > 0).slice(0, 5);
  row.bearish = byT.filter((w) => w.avgReturn < 0).sort((a, b) => a.tStat - b.tStat).slice(0, 5);
  return row;
}

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

    if (daysUntilEndCurr >= -7 && daysUntilStartPrev <= lookaheadDays) {
      const isActive = daysUntilStartPrev <= 0 && daysUntilEndCurr >= 0;
      if (daysUntilEndCurr < -7 || (!isActive && daysUntilStartPrev > lookaheadDays)) return null;
      return { daysUntilStart: daysUntilStartPrev, daysUntilEnd: daysUntilEndCurr, isActive };
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

type UpcomingSortKey = "starts" | "avg" | "median" | "win" | "n" | "t" | "ticker" | "status" | "name" | "dir" | "window";

function UpcomingWindowsPanel({ data }: { data: SeasonalPatternRow[] }) {
  const [lookaheadDays, setLookaheadDays] = useState(30);
  const [collapsed, setCollapsed] = useState(false);
  const [tall, setTall] = useState(false);
  const [dirFilter, setDirFilter] = useState<"all" | "bullish" | "bearish">("all");
  const [search, setSearch] = useState("");
  // Default order: active first, then soonest start (the original behavior).
  const [sortKey, setSortKey] = useState<UpcomingSortKey>("starts");
  const [sortAsc, setSortAsc] = useState(true);

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
    let filtered = dirFilter !== "all" ? results.filter((r) => r.direction === dirFilter) : results;
    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (r) => r.ticker.toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q)
      );
    }
    const val = (r: any): number | string => {
      switch (sortKey) {
        case "ticker": return r.ticker;
        case "name": return r.name ?? "";
        case "dir": return r.direction ?? "";
        case "window": return r.window.startLabel ?? "";
        // Live (2) → Soon/upcoming (1) → Ended (0); asc reverses.
        case "status": return r.isActive ? 2 : r.daysUntilEnd < 0 ? 0 : 1;
        case "avg": return r.window.avgReturn;
        case "median": return r.window.medianReturn ?? r.window.avgReturn;
        case "win": return r.window.winRate;
        case "n": return r.window.years;
        case "t": return r.window.tStat;
        default: return r.daysUntilStart;
      }
    };
    return filtered.sort((a, b) => {
      // Active windows always float to the top under the default sort.
      if (sortKey === "starts") {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      }
      const av = val(a), bv = val(b);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortAsc ? cmp : -cmp;
    });
  }, [data, today, lookaheadDays, dirFilter, search, sortKey, sortAsc]);

  const activeCount = windows.filter((w) => w.isActive).length;
  const upcomingCount = windows.filter((w) => !w.isActive && w.daysUntilStart > 0).length;

  const handleSort = (key: UpcomingSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    // Numbers default to descending (biggest edge first), text/date ascending.
    else { setSortKey(key); setSortAsc(key === "starts" || key === "ticker" || key === "name" || key === "dir" || key === "window"); }
  };

  const SortableTh = ({ k, label, className }: { k: UpcomingSortKey; label: string; className?: string }) => (
    <th
      className={`px-2 py-1 text-[10px] font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap ${className || ""}`}
      onClick={() => handleSort(k)}
      data-testid={`upcoming-sort-${k}`}
    >
      {label}{sortKey === k ? (sortAsc ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div className="border-b border-border bg-card/50">
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent/20 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
        data-testid="upcoming-windows-header"
      >
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
          <span className="text-[10px] text-muted-foreground">{collapsed ? "Show" : "Hide"}</span>
          <span className="w-3.5 h-3.5 text-muted-foreground">{collapsed ? "▼" : "▲"}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
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
            <div className="relative flex items-center">
              <Search className="absolute left-1.5 w-3 h-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter ticker/name…"
                className="h-6 pl-6 pr-6 text-[10px] bg-background border border-border rounded w-[150px] focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="upcoming-windows-search"
              />
              {search && (
                <button
                  className="absolute right-1 p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch("")}
                  aria-label="Clear filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                tall ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTall((v) => !v)}
              title="Toggle a taller list"
              data-testid="upcoming-windows-tall"
            >
              {tall ? "Compact" : "Expand"}
            </button>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {windows.length} window{windows.length !== 1 ? "s" : ""} · click a row to open in Charts
            </span>
          </div>

          {windows.length > 0 ? (
            <div className={`${tall ? "max-h-[70vh]" : "max-h-[38vh]"} overflow-y-auto rounded border border-border/50`}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b border-border/50 z-10">
                  <tr>
                    <SortableTh k="status" label="Status" className="text-left w-12" />
                    <SortableTh k="ticker" label="Ticker" className="text-left w-16" />
                    <SortableTh k="name" label="Name" className="text-left" />
                    <SortableTh k="dir" label="Dir" className="text-left w-10" />
                    <SortableTh k="window" label="Window" className="text-left" />
                    <SortableTh k="starts" label="Starts" className="text-right w-20" />
                    <SortableTh k="avg" label="Avg" className="text-right w-14" />
                    <SortableTh k="median" label="Med" className="text-right w-14" />
                    <SortableTh k="win" label="Win%" className="text-right w-12" />
                    <SortableTh k="n" label="N" className="text-right w-8" />
                    <SortableTh k="t" label="t-stat" className="text-right w-12" />
                  </tr>
                </thead>
                <tbody>
                  {windows.map((row, idx) => {
                    const ended = !row.isActive && row.daysUntilEnd < 0;
                    const plainTicker = !row.ticker.includes("/") && !(row as any).isBasket && !(row.name || "").startsWith("Basket");
                    return (
                    <tr
                      key={`${row.ticker}-${row.direction}-${row.window.startMMDD}-${row.window.endMMDD}-${idx}`}
                      className={`border-b border-border/20 hover:bg-accent/30 transition-colors ${row.isActive ? "bg-amber-500/5" : ""} ${plainTicker ? "cursor-pointer" : ""}`}
                      onClick={() => { if (plainTicker) navigateToTicker(row.ticker); }}
                      title={plainTicker ? `Open ${row.ticker} in Charts` : undefined}
                      data-testid={`upcoming-row-${row.ticker}-${idx}`}
                    >
                      <td className="px-2 py-1">
                        {row.isActive ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            Live
                          </span>
                        ) : ended ? (
                          <span className="text-[10px] text-muted-foreground/70">Ended</span>
                        ) : (
                          <span className="text-[10px] text-blue-400">Soon</span>
                        )}
                      </td>
                      <td className="px-2 py-1 font-mono font-semibold">{row.ticker}</td>
                      <td className="px-2 py-1 text-muted-foreground truncate max-w-[160px]" title={row.name}>{row.name}</td>
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
                      <td className="px-2 py-1 text-right font-mono tabular-nums whitespace-nowrap">
                        {row.isActive ? (
                          <span className="text-amber-400">{row.daysUntilEnd}d left</span>
                        ) : ended ? (
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
                      <td className="px-2 py-1 text-right">
                        {row.window.medianReturn != null ? (
                          <span className={`font-mono tabular-nums ${row.window.medianReturn > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {row.window.medianReturn > 0 ? "+" : ""}{row.window.medianReturn.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-3 text-[11px] text-muted-foreground">
              {search.trim()
                ? `No windows match "${search.trim()}" within ${lookaheadDays} days`
                : `No seasonal windows starting within ${lookaheadDays} days`}
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

/** Win-rate cell: 0–100%, colored by distance from a coin flip. */
function WinRateCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  const edge = (value - 50) / 50; // -1..1
  const intensity = Math.min(1, Math.abs(edge) * 1.6) * 0.25;
  const bg = edge > 0 ? `rgba(34, 197, 94, ${intensity})` : edge < 0 ? `rgba(239, 68, 68, ${intensity})` : "transparent";
  const colorClass = value >= 65 ? "text-emerald-400" : value <= 35 ? "text-red-400" : "text-foreground";
  return (
    <span className={`font-mono text-xs tabular-nums ${colorClass} px-1.5 py-0.5 rounded`} style={{ backgroundColor: bg }}>
      {Math.round(value)}%
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

export default function PerfFamily() {
  const { universeTickers } = useAppContext();
  const basketScope = useBasketScope("reit-viz:basket-scope:performance");

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
  const [showBaskets, setShowBaskets] = useState(false);
  // User-defined pair rows ("A/B") — computed like basket composites but on
  // the A/B close ratio, so every view shows the SPREAD's behavior.
  const [pairDefs, setPairDefs] = useState<string[]>([]);
  const addPair = useCallback((a: string, b: string) => {
    const key = `${a}/${b}`;
    setPairDefs((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);
  // Group rows by one of the six classification levels (main-table views).
  const [groupBy, setGroupBy] = useState<string>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (label: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  const { baskets } = useBaskets();
  // Monthly view statistic: avg return / win rate (% of years positive) /
  // return relative to the subindustry peer mean (seasonal alpha) / hit rate
  // of touching +X% at ANY point intra-month (not just where the month ends).
  const [monthlyStat, setMonthlyStat] = useState<"avg" | "win" | "rel" | "hit">("avg");
  const [touchPct, setTouchPct] = useState("3");
  // Periods view statistic: period-end return / highest / lowest point
  // touched within the period vs its start ("did it hit X% intra-period?").
  const [periodStat, setPeriodStat] = useState<"end" | "max" | "min">("end");

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
      showBaskets,
      pairDefs,
      groupBy,
      collapsedGroups: [...collapsedGroups],
      monthlyStat,
      periodStat,
      touchPct,
    }),
    [viewMode, filters, manualTickers, customStart, customEnd, sortKey, sortAsc, eventType, eventStat, seasonalMinDays, seasonalMaxDays, showBaskets, pairDefs, monthlyStat, periodStat, touchPct, groupBy, collapsedGroups]
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
    if (state.showBaskets !== undefined) setShowBaskets(state.showBaskets);
    if (Array.isArray(state.pairDefs)) setPairDefs(state.pairDefs.filter((p: any) => typeof p === "string"));
    if (state.groupBy !== undefined) setGroupBy(state.groupBy);
    if (state.collapsedGroups !== undefined) setCollapsedGroups(new Set(state.collapsedGroups));
    if (state.monthlyStat !== undefined) setMonthlyStat(state.monthlyStat);
    if (state.periodStat !== undefined) setPeriodStat(state.periodStat);
    if (state.touchPct !== undefined) setTouchPct(state.touchPct);
  }, []);

  useWorkspaceState("performance", serializeState, hydrateState);

  // ── Data queries ──
  const { data: perfData, isLoading: perfLoading } = useQuery({
    queryKey: ["/perf-data", customStart, customEnd],
    queryFn: () => fetchPerfData(customStart || undefined, customEnd || undefined),
  });
  const touchNum = Math.max(0.5, parseFloat(touchPct) || 3);
  const { data: monthlyData, isLoading: monthlyLoading } = useQuery<any[]>({
    queryKey: ["/monthly-seasonality", touchNum],
    queryFn: () => fetchMonthlySeasonality(touchNum),
    enabled: viewMode === "monthly",
  });
  const { data: eventData, isLoading: eventLoading } = useQuery({
    queryKey: ["/event-returns-local", eventType],
    queryFn: () => getEventReturns(eventType as EventType),
    enabled: viewMode === "events",
  });
  const { data: seasonalData, isLoading: seasonalLoading } = useQuery({
    queryKey: ["/seasonal-patterns", seasonalMinDays, seasonalMaxDays],
    queryFn: () => fetchSeasonalPatterns(5, seasonalMinDays, seasonalMaxDays),
    enabled: viewMode === "seasonal-patterns",
  });

  // Basket composite rows (periods/seasonality + monthly views)
  const basketsKey = useMemo(
    () => baskets.map((b) => `${b.id}:${b.tickers.join(",")}`).join("|"),
    [baskets]
  );
  const { data: basketRowData, isFetching: basketsComputing } = useQuery({
    queryKey: ["/perf-basket-rows", basketsKey, customStart, customEnd, seasonalMinDays, seasonalMaxDays, touchNum],
    enabled: showBaskets && baskets.length > 0,
    queryFn: async () => {
      const perf: any[] = [];
      const monthly: any[] = [];
      const seasonal: any[] = [];
      // Concurrency 6 — the serial loop took ~90s over 40+ auto-baskets, which
      // read as "the button does nothing". Row order doesn't matter (merged
      // rows are re-sorted with the rest of the table).
      const list = baskets.filter((b) => b.tickers?.length);
      let next = 0;
      async function worker() {
        for (;;) {
          const idx = next++;
          if (idx >= list.length) return;
          const b = list[idx];
          try {
            const ohlc = await getBasketOhlc(b);
            if (!ohlc || !ohlc.closes.length) continue;
            const bars: BasketBar[] = ohlc.priceDates.map((d: string, i: number) => ({ date: d, close: ohlc.closes[i] }));
            perf.push(basketPerfRow(b, bars, customStart || undefined, customEnd || undefined));
            monthly.push(basketMonthlyRow(b, bars, touchNum));
            seasonal.push(basketSeasonalRow(b, bars, seasonalMinDays, seasonalMaxDays));
          } catch { /* skip basket */ }
        }
      }
      await Promise.all(Array.from({ length: 6 }, () => worker()));
      return { perf, monthly, seasonal };
    },
  });

  // Pair ratio rows — same row builders as baskets, fed the A/B close ratio.
  // Legs resolve from the workbook, falling back to the Yahoo/FMP proxy for
  // external symbols.
  const { data: pairRowData, isFetching: pairsComputing } = useQuery({
    queryKey: ["/perf-pair-rows", pairDefs.join("|"), customStart, customEnd, seasonalMinDays, seasonalMaxDays, touchNum],
    enabled: pairDefs.length > 0,
    queryFn: async () => {
      const legSeries = async (sym: string): Promise<Array<{ time: string; value: number }>> => {
        try {
          const s = await getMetricSeries(sym, "close");
          if (s.length) return s;
        } catch { /* fall through */ }
        try {
          const resp = await fetch(`/api/yahoo-prices/${encodeURIComponent(sym)}`);
          if (!resp.ok) return [];
          const j = await resp.json();
          const closes: number[] = (j.adjCloses?.length ? j.adjCloses : j.closes) ?? [];
          return (j.dates ?? []).map((d: string, i: number) => ({ time: d, value: closes[i] })).filter((p: any) => Number.isFinite(p.value));
        } catch { return []; }
      };
      const perf: any[] = [];
      const monthly: any[] = [];
      const seasonal: any[] = [];
      for (const def of pairDefs) {
        const [a, b] = def.split("/");
        try {
          const [sa, sb] = await Promise.all([legSeries(a), legSeries(b)]);
          if (!sa.length || !sb.length) continue;
          const mb = new Map(sb.map((p) => [p.time, p.value]));
          const bars: BasketBar[] = [];
          for (const p of sa) {
            const v = mb.get(p.time);
            if (v != null && v > 0 && p.value > 0) bars.push({ date: p.time, close: p.value / v });
          }
          if (bars.length < 30) continue;
          const pseudo: any = { id: `PAIR:${def}`, name: def, tickers: [a, b] };
          const brand = (row: any) => row && Object.assign(row, { name: "Pair · ratio", isPair: true });
          perf.push(brand(basketPerfRow(pseudo, bars, customStart || undefined, customEnd || undefined)));
          monthly.push(brand(basketMonthlyRow(pseudo, bars, touchNum)));
          seasonal.push(brand(basketSeasonalRow(pseudo, bars, seasonalMinDays, seasonalMaxDays)));
        } catch { /* skip pair */ }
      }
      return { perf: perf.filter(Boolean), monthly: monthly.filter(Boolean), seasonal: seasonal.filter(Boolean) };
    },
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
  // Base (pre-filter) pool for the current view — feeds Country/Exchange options.
  const geoBasePool = useMemo<any[]>(() => {
    if (viewMode === "periods" || viewMode === "seasonality") return perfData || [];
    if (viewMode === "monthly") return monthlyData || [];
    if (viewMode === "seasonal-patterns") return seasonalData || [];
    return eventData || [];
  }, [perfData, monthlyData, seasonalData, eventData, viewMode]);
  const geo = useGeoFilter(geoBasePool, "perf-geo");

  const displayRows = useMemo(() => {
    let rows: any[] = [];
    if (viewMode === "periods" || viewMode === "seasonality") rows = perfData || [];
    else if (viewMode === "monthly") rows = monthlyData || [];
    else if (viewMode === "seasonal-patterns") rows = seasonalData || [];
    else rows = eventData || [];

    if (universeTickers) {
      rows = rows.filter((r: any) => universeTickers.has(r.ticker));
    }

    if (basketScope.members) {
      rows = rows.filter((r: any) => basketScope.inScope(r.ticker));
    }

    // Basket composite rows: bypass universe/classification/geo filters
    // (baskets aren't tickers), but respect the free-text search.
    let basketExtras: any[] = [];
    if (showBaskets && basketRowData) {
      if (viewMode === "periods" || viewMode === "seasonality") basketExtras = basketRowData.perf;
      else if (viewMode === "monthly") basketExtras = basketRowData.monthly;
      else if (viewMode === "seasonal-patterns") basketExtras = basketRowData.seasonal ?? [];
    }
    if (pairDefs.length && pairRowData) {
      if (viewMode === "periods" || viewMode === "seasonality") basketExtras = [...basketExtras, ...pairRowData.perf];
      else if (viewMode === "monthly") basketExtras = [...basketExtras, ...pairRowData.monthly];
      else if (viewMode === "seasonal-patterns") basketExtras = [...basketExtras, ...(pairRowData.seasonal ?? [])];
    }
    {
      const q = searchText.trim().toLowerCase();
      if (q) {
        basketExtras = basketExtras.filter(
          (r: any) => r.ticker.toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q)
        );
      }
    }

    return [...geo.filterByGeo(filterPerformanceData(rows, filters, searchText, manualTickers)), ...basketExtras].sort(
      (a: any, b: any) => {
        let av: any, bv: any;
        if (viewMode === "events" && sortKey.startsWith("w_")) {
          const windowId = parseInt(sortKey.replace("w_", ""));
          av = a[eventStat]?.[windowId] ?? null;
          bv = b[eventStat]?.[windowId] ?? null;
        } else if (viewMode === "monthly" && monthlyStat !== "avg" && (MONTHLY_LABELS as string[]).includes(sortKey)) {
          // Month columns sort by the statistic currently displayed.
          const suffix = monthlyStat === "win" ? "Win" : monthlyStat === "hit" ? "Hit" : "Rel";
          av = a[sortKey + suffix] ?? null;
          bv = b[sortKey + suffix] ?? null;
        } else if (viewMode === "periods" && periodStat !== "end" && (PERIOD_COLUMNS.includes(sortKey) || sortKey === "custom")) {
          // Period columns sort by the displayed excursion statistic.
          const suffix = periodStat === "max" ? "Max" : "Min";
          av = a[sortKey + suffix] ?? null;
          bv = b[sortKey + suffix] ?? null;
        } else if (viewMode === "seasonal-patterns" && (sortKey.startsWith("bull_") || sortKey.startsWith("bear_"))) {
          // Seasonal sub-columns sort tickers by their TOP window's stat.
          const side = sortKey.startsWith("bull_") ? "bullish" : "bearish";
          const stat = sortKey.slice(5);
          const pick = (r: any) => {
            const w = r[side]?.[0];
            if (!w) return null;
            switch (stat) {
              case "avg": return w.avgReturn;
              case "med": return w.medianReturn ?? w.avgReturn;
              case "win": return w.winRate;
              case "n": return w.years;
              case "t": return w.tStat;
              case "days": return w.calendarDays ?? null;
              default: return w.startLabel ?? null;
            }
          };
          av = pick(a);
          bv = pick(b);
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
  }, [perfData, monthlyData, eventData, seasonalData, viewMode, filters, searchText, manualTickers, sortKey, sortAsc, universeTickers, basketScope.members, eventStat, geo.filterByGeo, showBaskets, basketRowData, pairDefs, pairRowData, monthlyStat, periodStat]);

  // Classification lookup for rows whose feed omits those fields (monthly
  // rows carry only ticker + month stats) — join from the periods feed.
  const classByTicker = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of perfData ?? []) m.set(r.ticker, r);
    return m;
  }, [perfData]);

  // Grouped render list for the main table (periods/quarterly/monthly/events).
  // Groups appear in order of their best row under the current sort; rows stay
  // sorted within groups; baskets group under "Baskets".
  const renderItems = useMemo(() => {
    const grpActive = groupBy !== "none" && viewMode !== "seasonal-patterns";
    if (!grpActive) return displayRows.map((row: any) => ({ type: "row" as const, row }));
    const map = new Map<string, any[]>();
    for (const row of displayRows) {
      const cls = (row as any)[groupBy] ?? classByTicker.get(row.ticker)?.[groupBy];
      const key = row.isBasket ? "Baskets" : (cls || "Other");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    const items: any[] = [];
    for (const [label, rows] of map) {
      items.push({ type: "group", label, count: rows.length });
      if (!collapsedGroups.has(label)) for (const row of rows) items.push({ type: "row", row });
    }
    return items;
  }, [displayRows, groupBy, viewMode, collapsedGroups, classByTicker]);

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
      colKeys = [
        "ticker", "name", "lastClose",
        ...PERIOD_COLUMNS,
        ...PERIOD_COLUMNS.map((c) => `${c}Max`),
        ...PERIOD_COLUMNS.map((c) => `${c}Min`),
        ...(customStart && customEnd ? ["custom", "customMax", "customMin"] : []),
      ];
      colLabels = colKeys.map((k) =>
        k === "lastClose" ? "Last Close" : k.startsWith("custom") ? `${k.replace("custom", "Custom ")}(${customStart} to ${customEnd})` : k
      );
    } else if (viewMode === "seasonality") {
      colKeys = ["ticker", "name", "lastClose", ...QUARTER_COLUMNS];
      colLabels = colKeys.map((k) => (k === "lastClose" ? "Last Close" : `Avg ${k}`));
    } else if (viewMode === "monthly") {
      colKeys = [
        "ticker", "name",
        ...MONTHLY_LABELS.map((m: string) => m),
        ...MONTHLY_LABELS.map((m: string) => `${m}Win`),
        ...MONTHLY_LABELS.map((m: string) => `${m}Rel`),
        ...MONTHLY_LABELS.map((m: string) => `${m}Hit`),
        "yearsOfData",
      ];
      colLabels = [
        "ticker", "name",
        ...MONTHLY_LABELS.map((m: string) => `${m} Avg %`),
        ...MONTHLY_LABELS.map((m: string) => `${m} Win %`),
        ...MONTHLY_LABELS.map((m: string) => `${m} vs Subind %`),
        ...MONTHLY_LABELS.map((m: string) => `${m} Hit ≥${touchPct}% %yrs`),
        "yearsOfData",
      ];
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
      const windowCols = eventHasPreWindows(eventType as EventType) ? [...EVENT_WINDOWS_PRE, ...EVENT_WINDOWS_POST] : [...EVENT_WINDOWS_POST];
      colKeys = ["ticker", "name", "eventCount", ...windowCols.map((w) => `${EVENT_WINDOW_LABELS[w]} Avg`), ...windowCols.map((w) => `${EVENT_WINDOW_LABELS[w]} WinRate`)];
      colLabels = colKeys;
    }

    const lines = [colLabels.join(",")];
    for (const row of displayRows) {
      if (viewMode === "events") {
        const windowCols = eventHasPreWindows(eventType as EventType) ? [...EVENT_WINDOWS_PRE, ...EVENT_WINDOWS_POST] : [...EVENT_WINDOWS_POST];
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
  }, [displayRows, viewMode, customStart, customEnd, eventType, touchPct]);

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
          <PagePresets
            storageKey="reit-viz:performance:presets"
            label="Templates"
            testIdPrefix="perf-presets"
            capture={serializeState}
            apply={(cfg) => { if (cfg) hydrateState(cfg); }}
          />
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

          {/* Period statistic toggle */}
          {viewMode === "periods" && (
            <div className="flex items-center bg-muted rounded p-0.5">
              {([
                { key: "end", label: "End %", title: "Return from period start to period end" },
                { key: "max", label: "Max %", title: "Highest point TOUCHED within the period vs its start — did it hit +X% at some point, even if it faded?" },
                { key: "min", label: "Min %", title: "Lowest point touched within the period vs its start — worst drawdown from the period start" },
              ] as const).map((s) => (
                <button
                  key={s.key}
                  title={s.title}
                  className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    periodStat === s.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setPeriodStat(s.key)}
                  data-testid={`period-stat-${s.key}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Custom date range (periods) */}
          {viewMode === "periods" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Custom:</span>
              <DateInput
                value={customStart}
                onChange={setCustomStart}
                className="h-6 w-28 text-[11px]"
                data-testid="custom-start"
              />
              <span className="text-[11px] text-muted-foreground">to</span>
              <DateInput
                value={customEnd}
                onChange={setCustomEnd}
                className="h-6 w-28 text-[11px]"
                data-testid="custom-end"
              />
            </div>
          )}

          {/* Monthly statistic toggle */}
          {viewMode === "monthly" && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center bg-muted rounded p-0.5">
                {([
                  { key: "avg", label: "Avg %", title: "Average return per calendar month" },
                  { key: "win", label: "Win %", title: "Share of years the month closed positive — consistency check on the average" },
                  { key: "rel", label: "vs Subind", title: "Average return minus the same-month subindustry peer mean — the seasonal alpha a long/short trade captures" },
                  { key: "hit", label: `Hit ≥%`, title: "Share of years the month TOUCHED the threshold at ANY point intra-month (vs the prior month-end close) — not just where the month ended. Set the threshold in the box." },
                ] as const).map((s) => (
                  <button
                    key={s.key}
                    title={s.title}
                    className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition-colors ${
                      monthlyStat === s.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setMonthlyStat(s.key)}
                    data-testid={`monthly-stat-${s.key}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {monthlyStat === "hit" && (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={touchPct}
                    onChange={(e) => setTouchPct(e.target.value)}
                    className="h-6 w-14 text-[11px] text-center"
                    title="Intra-month touch threshold (%)"
                    data-testid="monthly-touch-pct"
                  />
                  <span className="text-[11px] text-muted-foreground">%</span>
                </div>
              )}
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

          {/* Basket scope + CSV export */}
          <div className="ml-auto flex items-center gap-1.5">
            {viewMode !== "seasonal-patterns" && (
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground">Group:</span>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger className="h-6 text-[11px] w-auto min-w-[120px]" data-testid="perf-group-by">
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
            )}
            <Button
              variant={showBaskets ? "default" : "outline"}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setShowBaskets((v) => !v)}
              data-testid="perf-show-baskets"
              title="Show each basket as a composite row (periods, quarterly, monthly, and seasonal-pattern views)"
            >
              {basketsComputing && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Baskets{showBaskets && baskets.length > 0 ? ` (${basketRowData ? baskets.length : "…"})` : ""}
            </Button>
            {/* Pair ratio rows: robust A/B picker; chips live inside the popover */}
            <div className="flex items-center gap-1">
              <AddPairControl
                tickers={perfData ?? []}
                onAdd={addPair}
                existing={pairDefs}
                onRemove={(p) => setPairDefs((prev) => prev.filter((x) => x !== p))}
                testIdPrefix="perf-pair"
              />
              {pairsComputing && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            <BasketScopeSelect scope={basketScope} className="h-6 text-[11px] w-auto min-w-[130px]" />
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
          extraFilters={geo.geoFilterUI}
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
                  <ColHeader col="ticker" label="Ticker" className="w-16" />
                  <ColHeader col="name" label="Name" className="w-44" />
                  <ColHeader col="yearsOfData" label="Yrs" className="w-10" />
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-emerald-500" colSpan={7}>Top Bullish Windows</th>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-red-500" colSpan={7}>Top Bearish Windows</th>
                </tr>
                <tr className="border-b border-border/30">
                  <th colSpan={3} />
                  {(["bull", "bear"] as const).map((side) =>
                    ([["window", "Window", "text-left"], ["days", "Days", "text-right"], ["avg", "Avg", "text-right"], ["med", "Med", "text-right"], ["win", "Win%", "text-right"], ["n", "N", "text-right"], ["t", "t-stat", "text-right"]] as const).map(([stat, label, align]) => (
                      <th
                        key={`${side}_${stat}`}
                        className={`px-1.5 py-1 text-[10px] text-muted-foreground font-normal cursor-pointer select-none hover:text-foreground ${align}`}
                        onClick={() => handleSort(`${side}_${stat}`)}
                        title={`Sort tickers by their top ${side === "bull" ? "bullish" : "bearish"} window's ${label}`}
                        data-testid={`seasonal-sort-${side}-${stat}`}
                      >
                        {label}{sortKey === `${side}_${stat}` ? (sortAsc ? " ▲" : " ▼") : ""}
                      </th>
                    ))
                  )}
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
                          <td className={`px-2 py-1 font-mono font-semibold text-xs ${(row as any).isBasket ? "text-amber-300" : ""}`} rowSpan={maxLen}>{row.ticker}</td>
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
                    {MONTHLY_LABELS.map((col: string, mi: number) => (
                      <ColHeader
                        key={col}
                        col={col}
                        label={col}
                        className={`text-right ${mi === new Date().getMonth() ? "!text-primary" : ""}`}
                      />
                    ))}
                    <ColHeader col="yearsOfData" label="Years" className="text-right" />
                  </>
                )}
                {viewMode === "events" && (
                  <>
                    <ColHeader col="eventCount" label="Events" className="text-right" />
                    {eventHasPreWindows(eventType as EventType) && (
                      <>
                        {EVENT_WINDOWS_PRE.map((w: number) => (
                          <ColHeader key={w} col={`w_${w}`} label={EVENT_WINDOW_LABELS[w]} className="text-right" />
                        ))}
                        <th className="px-0.5 py-1.5 w-[1px] bg-border/50" />
                      </>
                    )}
                    {EVENT_WINDOWS_POST.map((w: number) => (
                      <ColHeader key={w} col={`w_${w}`} label={EVENT_WINDOW_LABELS[w]} className="text-right" />
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {renderItems.map((item: any, idx: number) => {
                if (item.type === "group") return (
                  <tr
                    key={`grp-${item.label}`}
                    className="bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => toggleGroup(item.label)}
                    data-testid={`perf-group-${item.label}`}
                  >
                    <td colSpan={99} className="px-2 py-1 text-[11px] font-semibold">
                      <span className="text-muted-foreground text-[10px] mr-1.5">{collapsedGroups.has(item.label) ? "▶" : "▼"}</span>
                      {item.label} <span className="text-[10px] font-normal text-muted-foreground">({item.count})</span>
                    </td>
                  </tr>
                );
                const row = item.row;
                return (
                <tr
                  key={row.ticker}
                  className={`border-b border-border/50 hover:bg-accent/50 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
                  data-testid={`perf-row-${row.ticker}`}
                >
                  <td className={`px-2 py-1.5 font-mono font-semibold text-xs sticky left-0 bg-inherit ${row.isBasket ? "text-amber-300" : ""}`}>{row.ticker}</td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground max-w-[200px] truncate" title={row.name}>{row.name}</td>
                  {viewMode === "periods" && (
                    <>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
                        {row.lastClose !== null ? `$${row.lastClose.toFixed(2)}` : "-"}
                      </td>
                      {PERIOD_COLUMNS.map((col) => (
                        <td key={col} className="px-2 py-1.5 text-right">
                          <ReturnCell value={periodStat === "end" ? row[col] : row[`${col}${periodStat === "max" ? "Max" : "Min"}`] ?? null} />
                        </td>
                      ))}
                      {customStart && customEnd && (
                        <td className="px-2 py-1.5 text-right">
                          <ReturnCell value={periodStat === "end" ? row.custom : row[`custom${periodStat === "max" ? "Max" : "Min"}`] ?? null} />
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
                      {MONTHLY_LABELS.map((col: string, mi: number) => (
                        <td key={col} className={`px-2 py-1.5 text-right ${mi === new Date().getMonth() ? "bg-primary/5" : ""}`}>
                          {monthlyStat === "win" || monthlyStat === "hit" ? (
                            <WinRateCell value={row[`${col}${monthlyStat === "win" ? "Win" : "Hit"}`] ?? null} />
                          ) : (
                            <HeatCell value={monthlyStat === "rel" ? row[`${col}Rel`] ?? null : row[col]} />
                          )}
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
                      {eventHasPreWindows(eventType as EventType) && (
                        <>
                          {EVENT_WINDOWS_PRE.map((w: number) => {
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
                      {EVENT_WINDOWS_POST.map((w: number) => {
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
                );
              })}
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
