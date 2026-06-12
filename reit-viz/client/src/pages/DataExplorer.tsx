// Reconstructed from recovered-bundle/DataExplorer-Y0Xg6AZ4.js on 2026-06-11

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createLucideIcon } from "@/lib/createLucideIcon";
import { usePageState } from "@/lib/pageState";
import { getTickers } from "@/lib/dataService";
import { getDates } from "@/lib/dataService";
import { getTickerRaw } from "@/lib/dataService";
import { metricMultiplier, isPercentMetric } from "@/lib/dataService";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronsUpDown,
  Search,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
} from "lucide-react";
import { ArrowUpDown } from "lucide-react";
import { Pin } from "lucide-react";

const Columns2Icon = createLucideIcon("Columns2", [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M12 3v18", key: "108xh3" }],
]);

const PinOffIcon = createLucideIcon("PinOff", [
  ["path", { d: "M12 17v5", key: "bb1du9" }],
  ["path", {
    d: "M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89",
    key: "znwnzq",
  }],
  ["path", { d: "m2 2 20 20", key: "1ooewy" }],
  ["path", {
    d: "M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11",
    key: "c9qhm2",
  }],
]);

interface TickerEntry {
  ticker: string;
  name?: string;
  subindustry?: string;
}

export default function DataExplorer() {
  const [tickers, setTickers] = useState<TickerEntry[]>([]);
  const [activeTicker, setActiveTicker] = useState("ESS");
  const [tickerSearch, setTickerSearch] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, [number, number][]>>({});
  const [loading, setLoading] = useState(false);
  const [pinnedMetrics, setPinnedMetrics] = useState<Set<string>>(new Set(["close"]));
  const [metricFilter, setMetricFilter] = useState("");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState<Set<string> | null>(null);
  const [columnSearch, setColumnSearch] = useState("");

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const ROW_HEIGHT = 20;
  const OVERSCAN = 12;
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => setContainerHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(el.scrollTop);
    });
  }, []);

  const getState = useCallback(
    () => ({
      activeTicker,
      sortAsc,
      pinnedMetrics: [...pinnedMetrics],
      visibleMetrics: visibleMetrics ? [...visibleMetrics] : null,
    }),
    [activeTicker, sortAsc, pinnedMetrics, visibleMetrics]
  );

  const restoreState = useCallback((saved: any) => {
    if (saved.activeTicker) setActiveTicker(saved.activeTicker);
    if (typeof saved.sortAsc === "boolean") setSortAsc(saved.sortAsc);
    if (Array.isArray(saved.pinnedMetrics)) setPinnedMetrics(new Set(saved.pinnedMetrics));
    if (saved.visibleMetrics === null) {
      setVisibleMetrics(null);
    } else if (Array.isArray(saved.visibleMetrics)) {
      setVisibleMetrics(new Set(saved.visibleMetrics));
    }
  }, []);

  usePageState("data-explorer", getState, restoreState);

  useEffect(() => {
    let cancelled = false;
    getTickers().then((t) => {
      if (!cancelled) setTickers(t as TickerEntry[]);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeTicker) return;
    setLoading(true);
    Promise.all([getDates(), getTickerRaw(activeTicker)])
      .then(([d, raw]) => {
        setDates(d as string[]);
        setRawData(raw as any);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeTicker]);

  const tickerIndex = tickers.findIndex((t) => t.ticker === activeTicker);

  const filteredTickers = useMemo(() => {
    if (!tickerSearch) return tickers;
    const q = tickerSearch.toLowerCase();
    return tickers.filter(
      (t) =>
        t.ticker.toLowerCase().includes(q) ||
        (t.name || "").toLowerCase().includes(q) ||
        (t.subindustry || "").toLowerCase().includes(q)
    );
  }, [tickers, tickerSearch]);

  const allMetrics = useMemo(
    () => Object.keys(rawData).sort((a, b) => a.localeCompare(b)),
    [rawData]
  );

  const METRIC_GROUPS: Record<string, string[]> = {
    Price: ["close", "open", "high", "low"],
    Valuation: [
      "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2",
      "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate",
    ],
    Yields: ["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield"],
    Estimates: [
      "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2",
      "EBITDA FY1", "EBITDA FY2", "Sales FY1", "Sales FY2",
    ],
    LTM: ["EPS LTM", "FFO LTM", "AFFO LTM", "EBITDA LTM", "Sales LTM", "EPS FY0", "FFO FY0", "AFFO FY0"],
    Growth: [
      "FY1 EPS Growth", "FY2 EPS Growth", "FY1 FFO Growth", "FY2 FFO Growth",
      "FY1 AFFO Growth", "FY2 AFFO Growth",
    ],
    Performance: [
      "52wk High", "52wk Low", "% off 52wk High", "% off 52wk Low",
      "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
    ],
    "Short Interest": ["Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M"],
    Volatility: [
      "HV 30D", "HV 60D", "HV 90D", "HV 180D", "HVOL 30D", "HVOL 60D", "HVOL 90D", "HVOL 180D",
    ],
    Other: [
      "Dividend", "Enterprise Value", "Buy Ratings", "Hold Ratings", "Sell Ratings", "Bull%", "Bear%",
    ],
  };

  const groupedMetrics = useMemo(() => {
    const knownSet = new Set<string>();
    const result: [string, string[]][] = [];
    const q = columnSearch.trim().toLowerCase();
    const matchQ = (m: string) => !q || m.toLowerCase().includes(q);

    for (const [group, cols] of Object.entries(METRIC_GROUPS)) {
      const matching = cols.filter((m) => allMetrics.includes(m) && matchQ(m));
      if (matching.length) result.push([group, matching]);
      for (const m of cols) knownSet.add(m);
    }
    const uncategorized = allMetrics.filter((m) => !knownSet.has(m) && matchQ(m));
    if (uncategorized.length) result.push(["Uncategorized", uncategorized]);
    return result;
  }, [allMetrics, columnSearch]);

  const displayMetrics = useMemo(() => {
    let cols = visibleMetrics ? allMetrics.filter((m) => visibleMetrics.has(m)) : allMetrics;
    if (metricFilter) {
      const q = metricFilter.toLowerCase();
      cols = cols.filter((m) => m.toLowerCase().includes(q));
    }
    const pinned = cols.filter((m) => pinnedMetrics.has(m));
    const rest = cols.filter((m) => !pinnedMetrics.has(m));
    return [...pinned, ...rest];
  }, [allMetrics, visibleMetrics, metricFilter, pinnedMetrics]);

  const tableRows = useMemo(() => {
    if (dates.length === 0 || displayMetrics.length === 0) return [];
    const metricMaps = displayMetrics.map((m) => {
      const map = new Map<number, number>();
      const pairs = rawData[m];
      if (pairs) for (const [idx, val] of pairs) map.set(idx, val);
      return map;
    });
    const allDateIdxs = new Set<number>();
    for (const m of displayMetrics) {
      const pairs = rawData[m];
      if (pairs) for (const [idx] of pairs) allDateIdxs.add(idx);
    }
    const dateIdxArr = Array.from(allDateIdxs).sort((a, b) => a - b);
    if (!sortAsc) dateIdxArr.reverse();
    return dateIdxArr.map((dateIdx) => ({
      dateIdx,
      date: dates[dateIdx] ?? `idx:${dateIdx}`,
      values: metricMaps.map((m) => m.get(dateIdx) ?? null),
    }));
  }, [dates, displayMetrics, rawData, sortAsc]);

  const formatValue = (val: number | null, metric: string): string => {
    if (val === null) return "";
    const multiplier = metricMultiplier(metric);
    const scaled = val * multiplier;
    if (isPercentMetric(metric)) return scaled.toFixed(2) + "%";
    if (Math.abs(scaled) >= 1e3)
      return scaled.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (Math.abs(scaled) >= 1) return scaled.toFixed(2);
    return scaled.toFixed(4);
  };

  const handleExportCsv = () => {
    if (tableRows.length === 0) return;
    const header = ["Date", ...displayMetrics].join(",");
    const rows = tableRows.map((row) =>
      [
        row.date,
        ...row.values.map((v, i) => {
          if (v === null) return "";
          const multiplier = metricMultiplier(displayMetrics[i]);
          return (v * multiplier).toString();
        }),
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTicker}_data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const togglePin = (metric: string) => {
    setPinnedMetrics((prev) => {
      const next = new Set(prev);
      next.has(metric) ? next.delete(metric) : next.add(metric);
      return next;
    });
  };

  const toggleVisible = (metric: string) => {
    setVisibleMetrics((prev) => {
      if (!prev) {
        const next = new Set(allMetrics);
        next.delete(metric);
        return next;
      }
      const next = new Set(prev);
      next.has(metric) ? next.delete(metric) : next.add(metric);
      return next;
    });
  };

  const activeMeta = tickers.find((t) => t.ticker === activeTicker);

  // Virtual scroll
  const totalRows = tableRows.length;
  const totalHeight = totalRows * ROW_HEIGHT;
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleRows = tableRows.slice(startRow, endRow);
  const paddingTop = startRow * ROW_HEIGHT;
  const paddingBottom = Math.max(0, totalHeight - endRow * ROW_HEIGHT);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0 flex-wrap">
        {/* Ticker Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 min-w-[100px]"
              data-testid="data-ticker-picker"
            >
              <span className="font-bold">{activeTicker}</span>
              <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[440px] p-0" align="start">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  className="h-7 text-xs pl-7"
                  placeholder="Search tickers..."
                  value={tickerSearch}
                  onChange={(e) => setTickerSearch(e.target.value)}
                  data-testid="data-ticker-search"
                />
              </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto py-1">
              {filteredTickers.map((t) => (
                <button
                  key={t.ticker}
                  className={`w-full flex items-center gap-2 px-3 py-1 text-xs hover:bg-accent/50 ${t.ticker === activeTicker ? "bg-accent text-accent-foreground" : ""}`}
                  onClick={() => {
                    setActiveTicker(t.ticker);
                    setTickerSearch("");
                  }}
                  data-testid={`data-ticker-${t.ticker}`}
                >
                  <span className="font-bold w-14 text-left whitespace-nowrap">{t.ticker}</span>
                  <span
                    className="text-muted-foreground flex-1 min-w-0 truncate text-left"
                    title={t.name}
                  >
                    {t.name}
                  </span>
                  {t.ticker === activeTicker && (
                    <Check className="w-3 h-3 ml-auto text-primary" />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Prev/Next */}
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={tickerIndex <= 0}
            onClick={() => tickerIndex > 0 && setActiveTicker(tickers[tickerIndex - 1].ticker)}
            data-testid="data-ticker-prev"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={tickerIndex >= tickers.length - 1}
            onClick={() =>
              tickerIndex < tickers.length - 1 &&
              setActiveTicker(tickers[tickerIndex + 1].ticker)
            }
            data-testid="data-ticker-next"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {activeMeta && (
          <span className="text-[10px] text-muted-foreground">
            {activeMeta.name} · {activeMeta.subindustry}
          </span>
        )}

        <div className="flex-1" />

        {/* Metric filter */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            className="h-7 text-xs pl-7 w-[160px]"
            placeholder="Filter metrics..."
            value={metricFilter}
            onChange={(e) => setMetricFilter(e.target.value)}
            data-testid="data-metric-filter"
          />
          {metricFilter && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setMetricFilter("")}
            >
              <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Column picker */}
        <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] gap-1"
              data-testid="data-column-picker"
            >
              <Columns2Icon className="w-3 h-3" />
              Columns ({visibleMetrics ? visibleMetrics.size : allMetrics.length}/{allMetrics.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="end">
            <div className="p-2 border-b border-border/40 flex items-center gap-2">
              <Search className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="Search columns..."
                value={columnSearch}
                onChange={(e) => setColumnSearch(e.target.value)}
                className="h-7 text-xs flex-1"
              />
              <button
                className="text-[10px] text-primary hover:underline whitespace-nowrap"
                onClick={() => setVisibleMetrics(null)}
              >
                Show all
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto py-1">
              {groupedMetrics.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No columns match.</div>
              )}
              {groupedMetrics.map(([group, cols]) => (
                <div key={group}>
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                    {group}
                  </div>
                  {cols.map((m) => {
                    const isVisible = !visibleMetrics || visibleMetrics.has(m);
                    return (
                      <button
                        key={m}
                        className="w-full flex items-center gap-2 px-3 py-0.5 text-xs hover:bg-accent/50"
                        onClick={() => toggleVisible(m)}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isVisible ? "bg-primary border-primary" : "border-muted-foreground/30"}`}
                        >
                          {isVisible && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <span
                          className={`${pinnedMetrics.has(m) ? "font-semibold" : ""} truncate`}
                          title={m}
                        >
                          {m}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[10px] gap-1"
          onClick={() => setSortAsc((v) => !v)}
          data-testid="data-sort-toggle"
        >
          <ArrowUpDown className="w-3 h-3" />
          {sortAsc ? "Oldest" : "Newest"}
        </Button>

        {/* Export */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[10px] gap-1"
          onClick={handleExportCsv}
          data-testid="data-export-csv"
        >
          <Download className="w-3 h-3" />
          CSV
        </Button>

        <span className="text-[10px] text-muted-foreground tabular-nums">
          {tableRows.length} rows · {displayMetrics.length} cols
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
          Loading {activeTicker} data...
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto min-h-0"
        >
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 bg-card z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-card text-left px-2 py-1.5 font-semibold text-muted-foreground border-b border-r border-border min-w-[90px]">
                  Date
                </th>
                {displayMetrics.map((m) => (
                  <th
                    key={m}
                    className={`text-right px-2 py-1.5 font-medium border-b border-border whitespace-nowrap min-w-[80px] group cursor-default ${pinnedMetrics.has(m) ? "bg-primary/5" : ""}`}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
                        onClick={() => togglePin(m)}
                        title={pinnedMetrics.has(m) ? "Unpin" : "Pin to left"}
                      >
                        {pinnedMetrics.has(m) ? (
                          <PinOffIcon className="w-2.5 h-2.5" />
                        ) : (
                          <Pin className="w-2.5 h-2.5" />
                        )}
                      </button>
                      <span className="text-[10px]">{m}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paddingTop > 0 && (
                <tr style={{ height: paddingTop }}>
                  <td colSpan={displayMetrics.length + 1} />
                </tr>
              )}
              {visibleRows.map((row) => (
                <tr
                  key={row.dateIdx}
                  className="hover:bg-accent/20 border-b border-border/30"
                  style={{ height: ROW_HEIGHT }}
                >
                  <td className="sticky left-0 z-10 bg-card px-2 py-0.5 font-mono text-muted-foreground border-r border-border tabular-nums">
                    {row.date}
                  </td>
                  {row.values.map((val, i) => (
                    <td
                      key={i}
                      className={`text-right px-2 py-0.5 font-mono tabular-nums ${pinnedMetrics.has(displayMetrics[i]) ? "bg-primary/5" : ""} ${val !== null && val < 0 ? "text-red-400" : ""}`}
                    >
                      {formatValue(val, displayMetrics[i])}
                    </td>
                  ))}
                </tr>
              ))}
              {paddingBottom > 0 && (
                <tr style={{ height: paddingBottom }}>
                  <td colSpan={displayMetrics.length + 1} />
                </tr>
              )}
              {tableRows.length === 0 && (
                <tr>
                  <td
                    colSpan={displayMetrics.length + 1}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No data available for {activeTicker}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
