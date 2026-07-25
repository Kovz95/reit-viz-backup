// Cross-wiring of the Performance tab's seasonal-pattern windows into scan
// results (Disloc tab, Universal Screener): a tiny chip on a result row when
// a ticker is INSIDE (or about to enter) a statistically significant seasonal
// window, so a mean-reversion long doesn't unknowingly fight a seasonally
// bearish stretch — and vice versa.
//
// Data: the same /api/performance/seasonal-patterns feed the Performance tab
// uses (5+ years of history), fetched lazily (only when a scan has results)
// and cached for the session. Significance gate: |t| ≥ 2 — roughly the 95%
// band the Performance tab's own windows are ranked by.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSeasonalPatterns } from "@/lib/fetchPerfData";

const MIN_ABS_T = 2;
const LOOKAHEAD_DAYS = 14;
const WINDOW_MIN_DAYS = 10;
const WINDOW_MAX_DAYS = 60;

interface RawWindow {
  startMMDD: string;
  endMMDD: string;
  startLabel: string;
  endLabel: string;
  avgReturn: number;
  winRate: number;
  years: number;
  tStat: number;
  calendarDays?: number;
}

export interface SeasonalStatus {
  dir: "bull" | "bear";
  /** 0 = inside the window now; otherwise days until it starts (≤ LOOKAHEAD_DAYS). */
  startsInDays: number;
  window: RawWindow;
}

/** Day-of-year (1-based, fixed 366-day calendar so MM-DD maps stably). */
function doy(mmdd: string): number {
  const CUM = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const m = parseInt(mmdd.slice(0, 2), 10);
  const d = parseInt(mmdd.slice(3, 5), 10);
  return CUM[m - 1] + d;
}

/** Is `today` inside [start, end], where the window may wrap the year end? */
function inWindow(today: number, start: number, end: number): boolean {
  return start <= end ? today >= start && today <= end : today >= start || today <= end;
}

/** Days from `today` until `start` on a circular 366-day calendar. */
function daysUntil(today: number, start: number): number {
  return start >= today ? start - today : 366 - today + start;
}

function statusFromWindows(row: { bullish?: RawWindow[]; bearish?: RawWindow[] }, today: number): SeasonalStatus | null {
  let best: SeasonalStatus | null = null;
  const consider = (w: RawWindow, dir: "bull" | "bear") => {
    if (Math.abs(w.tStat) < MIN_ABS_T) return;
    const s = doy(w.startMMDD);
    const e = doy(w.endMMDD);
    let startsInDays: number;
    if (inWindow(today, s, e)) startsInDays = 0;
    else {
      const until = daysUntil(today, s);
      if (until > LOOKAHEAD_DAYS) return;
      startsInDays = until;
    }
    // Prefer active over upcoming, then the stronger |t|.
    if (
      !best ||
      (startsInDays === 0 && best.startsInDays > 0) ||
      (startsInDays === 0) === (best.startsInDays === 0) && Math.abs(w.tStat) > Math.abs(best.window.tStat)
    ) {
      best = { dir, startsInDays, window: w };
    }
  };
  for (const w of row.bullish || []) consider(w, "bull");
  for (const w of row.bearish || []) consider(w, "bear");
  return best;
}

/**
 * Session-cached seasonal-window lookup. Pass enabled=false until there are
 * rows to decorate — the feed scans every ticker's full history server-side.
 */
export function useSeasonalNow(enabled: boolean): { statusFor: (ticker: string) => SeasonalStatus | null; loaded: boolean } {
  const { data } = useQuery<any[]>({
    queryKey: ["/seasonal-now", WINDOW_MIN_DAYS, WINDOW_MAX_DAYS],
    queryFn: () => fetchSeasonalPatterns(5, WINDOW_MIN_DAYS, WINDOW_MAX_DAYS),
    staleTime: Infinity,
    enabled,
  });
  const map = useMemo(() => {
    const m = new Map<string, SeasonalStatus>();
    if (!data) return m;
    const now = new Date();
    const today = doy(`${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    for (const row of data) {
      const st = statusFromWindows(row, today);
      if (st) m.set(String(row.ticker).toUpperCase(), st);
    }
    return m;
  }, [data]);
  return {
    statusFor: (ticker: string) => map.get(String(ticker).toUpperCase()) ?? null,
    loaded: !!data,
  };
}

/** Tiny inline chip: green = bullish window, red = bearish; solid = active now, hollow = starting soon. */
export function SeasonalChip({ ticker, status }: { ticker: string; status: SeasonalStatus | null }) {
  if (!status) return null;
  const { dir, startsInDays, window: w } = status;
  const active = startsInDays === 0;
  const color = dir === "bull" ? "text-emerald-400 border-emerald-500/50" : "text-red-400 border-red-500/50";
  const fill = active ? (dir === "bull" ? "bg-emerald-500/20" : "bg-red-500/20") : "bg-transparent";
  const title =
    `${ticker}: seasonally ${dir === "bull" ? "BULLISH" : "BEARISH"} ${w.startLabel}–${w.endLabel}` +
    ` (avg ${w.avgReturn >= 0 ? "+" : ""}${w.avgReturn.toFixed(1)}%, win ${w.winRate.toFixed(0)}%, t ${w.tStat.toFixed(1)}, ${w.years}y)` +
    (active ? " — window ACTIVE now" : ` — starts in ${startsInDays}d`);
  return (
    <span
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border text-[8px] font-bold leading-none align-middle cursor-help ${color} ${fill}`}
      title={title}
      data-testid={`seasonal-chip-${ticker}`}
    >
      S
    </span>
  );
}
