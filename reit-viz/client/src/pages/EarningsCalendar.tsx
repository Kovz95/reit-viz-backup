// Earnings Calendar — month-grid view of upcoming earnings dates (FMP forward
// calendar via /api/earnings-calendar) with the standard 6-classification +
// Country/Exchange filters, so you can see e.g. only one subindustry's prints.
// Near-term dates are effectively company-confirmed; further-out ones are
// FMP's projection from past cadence (noted in tooltips).
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { useGlobalUniverse } from "@/lib/globalUniverse";
import { API_BASE } from "@/lib/queryClient";

interface CalRow { symbol: string; date: string; time: string; epsEstimated: number | null }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function EarningsCalendar() {
  const { records } = useGlobalUniverse();
  const [rows, setRows] = useState<CalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const [monthAnchor, setMonthAnchor] = useState(() => today.slice(0, 7)); // YYYY-MM

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/earnings-calendar`);
        const data = res.ok && (res.headers.get("content-type") || "").includes("application/json") ? await res.json() : [];
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Filters (same bar as everywhere else) ──
  const [classFilters, setClassFilters] = useState<ClassFilters>(() => emptyClassFilters());
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const geo = useGeoFilter(records as { ticker: string }[], "earncal-geo");

  const filteredTickerSet = useMemo(() => {
    const pool = geo.filterByGeo(applyClassFilters(records as any[], classFilters, search, manualTickers));
    const s = new Set<string>();
    for (const r of pool) {
      const tk = String(r.ticker).toUpperCase();
      s.add(tk);
      s.add(tk.split("-")[0]); // match FMP bases (BKG-GB ↔ BKG.L)
    }
    return s;
  }, [records, classFilters, search, manualTickers, geo.filterByGeo]);

  const metaByBase = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of records as any[]) {
      const tk = String(r.ticker).toUpperCase();
      m.set(tk, r);
      m.set(tk.split("-")[0], r);
    }
    return m;
  }, [records]);

  // Calendar rows filtered to the classification pool, keyed by date.
  const byDate = useMemo(() => {
    const m = new Map<string, CalRow[]>();
    for (const r of rows) {
      const base = r.symbol.toUpperCase().split(".")[0];
      if (!filteredTickerSet.has(r.symbol.toUpperCase()) && !filteredTickerSet.has(base)) continue;
      const arr = m.get(r.date) ?? [];
      // dedupe (FMP has duplicate rows)
      if (!arr.some((x) => x.symbol === r.symbol)) arr.push(r);
      m.set(r.date, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return m;
  }, [rows, filteredTickerSet]);

  const visibleCount = useMemo(() => [...byDate.values()].reduce((s, a) => s + a.length, 0), [byDate]);

  // ── Month grid (Mon-first) ──
  const [y, mo] = monthAnchor.split("-").map(Number);
  const shiftMonth = (d: number) => {
    const nd = new Date(Date.UTC(y, mo - 1 + d, 1));
    setMonthAnchor(nd.toISOString().slice(0, 7));
  };
  const weeks = useMemo(() => {
    const first = new Date(Date.UTC(y, mo - 1, 1));
    const startOffset = (first.getUTCDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const out: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [y, mo]);

  const tickerLabel = (r: CalRow) => {
    const meta = metaByBase.get(r.symbol.toUpperCase()) ?? metaByBase.get(r.symbol.toUpperCase().split(".")[0]);
    return meta ? String(meta.ticker) : r.symbol;
  };
  const tickerTitle = (r: CalRow, d: string) => {
    const meta = metaByBase.get(r.symbol.toUpperCase()) ?? metaByBase.get(r.symbol.toUpperCase().split(".")[0]);
    const when = r.time === "bmo" ? "pre-market" : r.time === "amc" ? "after close" : "time TBD";
    return `${meta?.name ?? r.symbol} — ${d} (${when})` +
      (r.epsEstimated !== null ? `, est EPS ${r.epsEstimated}` : "") +
      (meta?.subindustry ? `\n${meta.subindustry}` : "") +
      `\nSource: FMP calendar — nearer dates are effectively confirmed, further-out ones are projections`;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="earnings-calendar-page">
      <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-card space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold">
            <CalendarDays className="w-4 h-4 text-primary" /> Earnings Calendar
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => shiftMonth(-1)} data-testid="earncal-prev">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs font-semibold w-32 text-center" data-testid="earncal-month">
              {MONTHS[mo - 1]} {y}
            </span>
            <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => shiftMonth(1)} data-testid="earncal-next">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setMonthAnchor(today.slice(0, 7))}>
              Today
            </Button>
          </div>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {loading ? "Loading…" : `${visibleCount} prints in view · rolling ~90-day FMP calendar (near = confirmed, far = projected)`}
          </span>
        </div>
        <ClassificationFilters
          filters={classFilters}
          onFiltersChange={setClassFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={visibleCount}
          totalCount={rows.length}
          testIdPrefix="earncal"
          extraFilters={geo.geoFilterUI}
        />
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-7 gap-px bg-border/60 rounded overflow-hidden text-xs">
          {DOW.map((d) => (
            <div key={d} className="bg-card px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center">
              {d}
            </div>
          ))}
          {weeks.flat().map((date, i) => {
            const prints = date ? byDate.get(date) ?? [] : [];
            const isToday = date === today;
            const isPast = date !== null && date < today;
            return (
              <div
                key={i}
                className={`bg-background min-h-[92px] p-1.5 ${isPast ? "opacity-40" : ""} ${isToday ? "ring-1 ring-inset ring-primary/60" : ""}`}
                data-testid={date ? `earncal-day-${date}` : undefined}
              >
                {date && (
                  <>
                    <div className={`text-[10px] font-mono mb-1 ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {Number(date.slice(8))}
                    </div>
                    <div className="flex flex-wrap gap-0.5">
                      {prints.map((r) => (
                        <span
                          key={r.symbol}
                          className={`px-1 py-px rounded text-[9px] font-mono font-semibold leading-tight cursor-help ${
                            r.time === "bmo"
                              ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                              : r.time === "amc"
                                ? "bg-violet-500/15 text-violet-300 border border-violet-500/30"
                                : "bg-muted text-muted-foreground border border-border"
                          }`}
                          title={tickerTitle(r, date)}
                          data-testid={`earncal-print-${tickerLabel(r)}`}
                        >
                          {tickerLabel(r)}
                          {r.time === "bmo" ? "·am" : r.time === "amc" ? "·pm" : ""}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span><span className="inline-block w-2 h-2 rounded-sm bg-sky-500/40 mr-1" />pre-market</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-violet-500/40 mr-1" />after close</span>
          <span><span className="inline-block w-2 h-2 rounded-sm bg-muted mr-1" />time TBD</span>
        </div>
      </div>
    </div>
  );
}
