// Upcoming-earnings chips for scan result rows — sibling of seasonalNow /
// rowChips. Feed: /api/earnings-calendar (FMP forward calendar, server-cached
// 12h; empty in environments without the FMP key, so chips simply don't
// render there). An "E−4" chip means the name reports in 4 days — the single
// most common reason a mean-reversion pair trade gets blown up.
import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/queryClient";

export interface EarningsStatus {
  date: string;
  days: number;
  time: string; // "bmo" | "amc" | ""
  epsEstimated: number | null;
}

interface CalRow { symbol: string; date: string; time: string; epsEstimated: number | null }

let cache: CalRow[] | null = null;
let inflight: Promise<CalRow[]> | null = null;

async function loadCalendar(): Promise<CalRow[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/earnings-calendar`);
      if (!res.ok || !(res.headers.get("content-type") || "").includes("application/json")) return [];
      const rows = await res.json();
      cache = Array.isArray(rows) ? rows : [];
      return cache;
    } catch {
      return [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Session-cached upcoming-earnings lookup. Lazy — pass enabled=false until rows exist. */
export function useEarningsNow(enabled: boolean): { statusFor: (ticker: string) => EarningsStatus | null } {
  const [rows, setRows] = useState<CalRow[]>(cache ?? []);
  useEffect(() => {
    if (!enabled || cache) return;
    let cancelled = false;
    void loadCalendar().then((r) => { if (!cancelled) setRows(r); });
    return () => { cancelled = true; };
  }, [enabled]);

  const map = useMemo(() => {
    // Index by exact FMP symbol AND by its pre-dot base, so "BKG.L" is
    // reachable from the workbook's "BKG-GB". Keep the EARLIEST upcoming date.
    const m = new Map<string, EarningsStatus>();
    const today = new Date().toISOString().slice(0, 10);
    const todayMs = new Date(today + "T00:00:00Z").getTime();
    const put = (key: string, st: EarningsStatus) => {
      const k = key.toUpperCase();
      const prev = m.get(k);
      if (!prev || st.date < prev.date) m.set(k, st);
    };
    for (const r of rows) {
      if (r.date < today) continue;
      const days = Math.round((new Date(r.date + "T00:00:00Z").getTime() - todayMs) / 86400000);
      const st: EarningsStatus = { date: r.date, days, time: r.time, epsEstimated: r.epsEstimated };
      put(r.symbol, st);
      const base = r.symbol.split(".")[0];
      if (base !== r.symbol) put(base, st);
    }
    return m;
  }, [rows]);

  return {
    statusFor: (ticker: string) => {
      const t = ticker.toUpperCase();
      return map.get(t) ?? map.get(t.split("-")[0]) ?? null;
    },
  };
}

/** "E−n" chip: red ≤2 days, amber ≤7, gray ≤14, hidden beyond that. */
export function EarningsChip({ ticker, status }: { ticker: string; status: EarningsStatus | null }) {
  if (!status || status.days > 14) return null;
  const cls =
    status.days <= 2
      ? "text-red-400 border-red-500/50 bg-red-500/15"
      : status.days <= 7
        ? "text-amber-400 border-amber-500/50 bg-amber-500/15"
        : "text-muted-foreground border-border bg-muted/30";
  const when = status.time === "bmo" ? " (pre-market)" : status.time === "amc" ? " (after close)" : "";
  const title =
    `${ticker}: earnings ${status.days === 0 ? "TODAY" : `in ${status.days}d`} — ${status.date}${when}` +
    (status.epsEstimated !== null ? `, est EPS ${status.epsEstimated}` : "");
  return (
    <span
      className={`inline-flex items-center justify-center h-3.5 px-0.5 rounded-sm border text-[8px] font-bold leading-none align-middle cursor-help whitespace-nowrap ${cls}`}
      title={title}
      data-testid={`earn-chip-${ticker}`}
    >
      E−{status.days}
    </span>
  );
}
