import { useMemo, useState } from "react";
import type { SeasonalPatternRow, SeasonalWindow } from "@/lib/dataService";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Clock } from "lucide-react";

interface UpcomingEntry {
  ticker: string;
  name: string;
  window: SeasonalWindow;
  direction: "bullish" | "bearish";
  /** Days until window starts (0 = today is inside, negative = already active) */
  daysUntilStart: number;
  /** Days until window ends */
  daysUntilEnd: number;
  /** Is the window currently active? */
  isActive: boolean;
}

/** Parse "MM-DD" to a Date object in the current year (or next year if past) */
function mmddToDate(mmdd: string, refDate: Date): Date {
  const [mm, dd] = mmdd.split("-").map(Number);
  const thisYear = refDate.getFullYear();
  let d = new Date(thisYear, mm - 1, dd);
  return d;
}

/** Calculate days between two dates (can be negative) */
function daysBetween(from: Date, to: Date): number {
  const msPerDay = 86400000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

/**
 * Determine if a window is upcoming or active, given today's date.
 * Returns null if the window isn't relevant (ended > 7 days ago, starts > lookAheadDays away).
 */
function classifyWindow(
  w: SeasonalWindow,
  today: Date,
  lookAheadDays: number
): { daysUntilStart: number; daysUntilEnd: number; isActive: boolean } | null {
  const year = today.getFullYear();

  // Parse start/end as this-year dates
  let start = mmddToDate(w.startMMDD, today);
  let end = mmddToDate(w.endMMDD, today);

  // Handle cross-year windows (e.g., Dec 15 → Jan 28)
  if (end <= start) {
    // Could be: start is in this year, end is next year
    // OR start was last year, end is this year
    // Check both interpretations and pick the one most relevant to today

    // Interpretation A: start this year, end next year
    const endA = new Date(year + 1, end.getMonth(), end.getDate());
    const daysToStartA = daysBetween(today, start);
    const daysToEndA = daysBetween(today, endA);

    // Interpretation B: start last year, end this year
    const startB = new Date(year - 1, start.getMonth(), start.getDate());
    const daysToStartB = daysBetween(today, startB);
    const daysToEndB = daysBetween(today, end);

    // Pick the interpretation where the window is active or upcoming
    if (daysToEndB >= -7 && daysToStartB <= lookAheadDays) {
      // B: started last year, ending this year (or recently ended)
      const isActive = daysToStartB <= 0 && daysToEndB >= 0;
      if (daysToEndB < -7) return null;
      if (!isActive && daysToStartB > lookAheadDays) return null;
      return { daysUntilStart: daysToStartB, daysUntilEnd: daysToEndB, isActive };
    }

    // A: starting this year, ending next year
    const isActiveA = daysToStartA <= 0 && daysToEndA >= 0;
    if (daysToEndA < -7) return null;
    if (!isActiveA && daysToStartA > lookAheadDays) return null;
    return { daysUntilStart: daysToStartA, daysUntilEnd: daysToEndA, isActive: isActiveA };
  }

  // Same-year window
  const daysToStart = daysBetween(today, start);
  const daysToEnd = daysBetween(today, end);
  const isActive = daysToStart <= 0 && daysToEnd >= 0;

  // Skip if already ended more than 7 days ago
  if (daysToEnd < -7) return null;
  // Skip if too far in the future
  if (!isActive && daysToStart > lookAheadDays) return null;

  return { daysUntilStart: daysToStart, daysUntilEnd: daysToEnd, isActive };
}

// Look-ahead options
const LOOKAHEAD_OPTIONS = [
  { label: "2 weeks", days: 14 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
];

export default function UpcomingSeasonalWindows({
  data,
}: {
  data: SeasonalPatternRow[];
}) {
  const [lookAhead, setLookAhead] = useState(30);
  const [collapsed, setCollapsed] = useState(false);
  const [filterDir, setFilterDir] = useState<"all" | "bullish" | "bearish">("all");

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const upcoming: UpcomingEntry[] = useMemo(() => {
    const entries: UpcomingEntry[] = [];

    for (const row of data) {
      for (const w of row.bullish) {
        const c = classifyWindow(w, today, lookAhead);
        if (c) {
          entries.push({
            ticker: row.ticker,
            name: row.name,
            window: w,
            direction: "bullish",
            ...c,
          });
        }
      }
      for (const w of row.bearish) {
        const c = classifyWindow(w, today, lookAhead);
        if (c) {
          entries.push({
            ticker: row.ticker,
            name: row.name,
            window: w,
            direction: "bearish",
            ...c,
          });
        }
      }
    }

    // Sort: active first, then by days until start
    entries.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return a.daysUntilStart - b.daysUntilStart;
    });

    // Apply direction filter
    if (filterDir !== "all") {
      return entries.filter((e) => e.direction === filterDir);
    }
    return entries;
  }, [data, today, lookAhead, filterDir]);

  const activeCount = upcoming.filter((e) => e.isActive).length;
  const upcomingCount = upcoming.filter((e) => !e.isActive).length;

  return (
    <div className="border-b border-border bg-card/50">
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent/20 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Clock className="w-3.5 h-3.5 text-blue-400" />
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
        {upcoming.length === 0 && (
          <span className="text-[10px] text-muted-foreground">None in range</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 pb-2">
          {/* Controls row */}
          <div className="flex items-center gap-2 mb-1.5">
            {/* Look-ahead toggle */}
            <div className="flex items-center bg-muted rounded p-0.5">
              {LOOKAHEAD_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                    lookAhead === opt.days
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setLookAhead(opt.days)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Direction filter */}
            <div className="flex items-center bg-muted rounded p-0.5">
              {(["all", "bullish", "bearish"] as const).map((dir) => (
                <button
                  key={dir}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                    filterDir === dir
                      ? dir === "bullish"
                        ? "bg-emerald-600/30 text-emerald-400 shadow-sm"
                        : dir === "bearish"
                        ? "bg-red-600/30 text-red-400 shadow-sm"
                        : "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setFilterDir(dir)}
                >
                  {dir === "all" ? "All" : dir === "bullish" ? "Bullish" : "Bearish"}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {upcoming.length} window{upcoming.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Windows list */}
          {upcoming.length > 0 ? (
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
                  {upcoming.map((entry, i) => (
                    <tr
                      key={`${entry.ticker}-${entry.direction}-${entry.window.startMMDD}-${entry.window.endMMDD}-${i}`}
                      className={`border-b border-border/20 hover:bg-accent/30 transition-colors ${
                        entry.isActive ? "bg-amber-500/5" : ""
                      }`}
                    >
                      <td className="px-2 py-1">
                        {entry.isActive ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            Live
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Soon</span>
                        )}
                      </td>
                      <td className="px-2 py-1 font-mono font-semibold">{entry.ticker}</td>
                      <td className="px-2 py-1">
                        {entry.direction === "bullish" ? (
                          <TrendingUp className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-400" />
                        )}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        <span className={entry.direction === "bullish" ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                          {entry.window.startLabel}
                        </span>
                        <span className="text-muted-foreground mx-0.5">→</span>
                        <span className={entry.direction === "bullish" ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>
                          {entry.window.endLabel}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums">
                        {entry.isActive ? (
                          <span className="text-amber-400">{entry.daysUntilEnd}d left</span>
                        ) : entry.daysUntilEnd < 0 ? (
                          <span className="text-muted-foreground">Ended {Math.abs(entry.daysUntilEnd)}d ago</span>
                        ) : (
                          <span className="text-blue-400">In {entry.daysUntilStart}d</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <span className={`font-mono tabular-nums ${entry.window.avgReturn > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {entry.window.avgReturn > 0 ? "+" : ""}{entry.window.avgReturn.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-foreground">
                        {entry.window.winRate.toFixed(0)}%
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                        {entry.window.years}
                      </td>
                      <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                        {entry.window.tStat.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-3 text-[11px] text-muted-foreground">
              No seasonal windows starting within {lookAhead} days
            </div>
          )}
        </div>
      )}
    </div>
  );
}
