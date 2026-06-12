import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { getTickers, getTickerRaw, getDates, metricMultiplier, isPercentMetric, type TickerMeta } from "@/lib/dataService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, Pin, PinOff, ArrowUpDown, ChevronsUpDown, Check, X, ChevronLeft, ChevronRight, Columns, Filter } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useWorkspaceTab } from "@/lib/workspaceContext";

// ── Data Explorer — mini Excel-like tab ──
export default function DataExplorer() {
  const [tickers, setTickers] = useState<TickerMeta[]>([]);
  const [activeTicker, setActiveTicker] = useState<string>("ESS");
  const [search, setSearch] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, [number, number][]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [pinnedMetrics, setPinnedMetrics] = useState<Set<string>>(new Set(["close"]));
  const [metricFilter, setMetricFilter] = useState("");
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState<Set<string> | null>(null); // null = all
  const tableRef = useRef<HTMLDivElement>(null);

  const serializeState = useCallback(() => ({
    activeTicker,
    sortAsc,
    pinnedMetrics: [...pinnedMetrics],
    visibleMetrics: visibleMetrics ? [...visibleMetrics] : null,
  }), [activeTicker, sortAsc, pinnedMetrics, visibleMetrics]);
  const restoreState = useCallback((state: any) => {
    if (state.activeTicker) setActiveTicker(state.activeTicker);
    if (typeof state.sortAsc === "boolean") setSortAsc(state.sortAsc);
    if (Array.isArray(state.pinnedMetrics)) setPinnedMetrics(new Set(state.pinnedMetrics));
    if (state.visibleMetrics === null) setVisibleMetrics(null);
    else if (Array.isArray(state.visibleMetrics)) setVisibleMetrics(new Set(state.visibleMetrics));
  }, []);
  useWorkspaceTab("data-explorer", serializeState, restoreState);

  // Load tickers
  useEffect(() => {
    getTickers().then(setTickers);
  }, []);

  // Load dates and ticker data
  useEffect(() => {
    if (!activeTicker) return;
    setIsLoading(true);
    Promise.all([getDates(), getTickerRaw(activeTicker)])
      .then(([d, r]) => {
        setDates(d);
        setRawData(r);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [activeTicker]);

  // Ticker search/nav
  const tickerIndex = tickers.findIndex((t) => t.ticker === activeTicker);
  const filteredTickers = useMemo(() => {
    if (!search) return tickers;
    const q = search.toLowerCase();
    return tickers.filter(
      (t) =>
        t.ticker.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.subindustry?.toLowerCase().includes(q)
    );
  }, [tickers, search]);

  // All metric names from the raw data
  const allMetrics = useMemo(() => {
    return Object.keys(rawData).sort((a, b) => a.localeCompare(b));
  }, [rawData]);

  // Metrics to display (filtered, with pinned first)
  const displayMetrics = useMemo(() => {
    let metrics = visibleMetrics ? allMetrics.filter((m) => visibleMetrics.has(m)) : allMetrics;
    if (metricFilter) {
      const q = metricFilter.toLowerCase();
      metrics = metrics.filter((m) => m.toLowerCase().includes(q));
    }
    // Pinned metrics first
    const pinned = metrics.filter((m) => pinnedMetrics.has(m));
    const unpinned = metrics.filter((m) => !pinnedMetrics.has(m));
    return [...pinned, ...unpinned];
  }, [allMetrics, visibleMetrics, metricFilter, pinnedMetrics]);

  // Build table data: all dates with values
  const tableData = useMemo(() => {
    if (dates.length === 0 || displayMetrics.length === 0) return [];

    // Build lookup maps per metric
    const maps = displayMetrics.map((metric) => {
      const m = new Map<number, number>();
      const pairs = rawData[metric];
      if (pairs) {
        for (const [idx, val] of pairs) m.set(idx, val);
      }
      return m;
    });

    // Collect all date indices that have data for at least one metric
    const dateIndices = new Set<number>();
    for (const metric of displayMetrics) {
      const pairs = rawData[metric];
      if (pairs) {
        for (const [idx] of pairs) dateIndices.add(idx);
      }
    }

    const sortedIndices = Array.from(dateIndices).sort((a, b) => a - b);
    if (!sortAsc) sortedIndices.reverse();

    return sortedIndices.map((dateIdx) => ({
      dateIdx,
      date: dates[dateIdx] ?? `idx:${dateIdx}`,
      values: maps.map((m) => m.get(dateIdx) ?? null),
    }));
  }, [dates, displayMetrics, rawData, sortAsc]);

  // Format a cell value
  const formatValue = (val: number | null, metric: string) => {
    if (val === null) return "";
    const mult = metricMultiplier(metric);
    const adjusted = val * mult;
    if (isPercentMetric(metric)) {
      return adjusted.toFixed(2) + "%";
    }
    if (Math.abs(adjusted) >= 1000) return adjusted.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (Math.abs(adjusted) >= 1) return adjusted.toFixed(2);
    return adjusted.toFixed(4);
  };

  // Export CSV
  const exportCSV = () => {
    if (tableData.length === 0) return;
    const header = ["Date", ...displayMetrics].join(",");
    const rows = tableData.map((row) =>
      [row.date, ...row.values.map((v, i) => {
        if (v === null) return "";
        const mult = metricMultiplier(displayMetrics[i]);
        return (v * mult).toString();
      })].join(",")
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
      if (next.has(metric)) next.delete(metric);
      else next.add(metric);
      return next;
    });
  };

  const toggleColumnVisibility = (metric: string) => {
    setVisibleMetrics((prev) => {
      if (!prev) {
        // First toggle: show all except this one
        const next = new Set(allMetrics);
        next.delete(metric);
        return next;
      }
      const next = new Set(prev);
      if (next.has(metric)) next.delete(metric);
      else next.add(metric);
      return next;
    });
  };

  const tickerMeta = tickers.find((t) => t.ticker === activeTicker);

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0 flex-wrap">
        {/* Ticker picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 min-w-[100px]" data-testid="data-ticker-picker">
              <span className="font-bold">{activeTicker}</span>
              <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  className="h-7 text-xs pl-7"
                  placeholder="Search tickers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="data-ticker-search"
                />
              </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto py-1">
              {filteredTickers.map((t) => (
                <button
                  key={t.ticker}
                  className={`w-full flex items-center gap-2 px-3 py-1 text-xs hover:bg-accent/50 ${
                    t.ticker === activeTicker ? "bg-accent text-accent-foreground" : ""
                  }`}
                  onClick={() => {
                    setActiveTicker(t.ticker);
                    setSearch("");
                  }}
                  data-testid={`data-ticker-${t.ticker}`}
                >
                  <span className="font-bold w-14 text-left">{t.ticker}</span>
                  <span className="text-muted-foreground truncate">{t.name}</span>
                  {t.ticker === activeTicker && <Check className="w-3 h-3 ml-auto text-primary" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Prev / Next */}
        <div className="flex gap-0.5">
          <Button
            variant="ghost" size="sm" className="h-7 w-7 p-0"
            disabled={tickerIndex <= 0}
            onClick={() => tickerIndex > 0 && setActiveTicker(tickers[tickerIndex - 1].ticker)}
            data-testid="data-ticker-prev"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost" size="sm" className="h-7 w-7 p-0"
            disabled={tickerIndex >= tickers.length - 1}
            onClick={() => tickerIndex < tickers.length - 1 && setActiveTicker(tickers[tickerIndex + 1].ticker)}
            data-testid="data-ticker-next"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {tickerMeta && (
          <span className="text-[10px] text-muted-foreground">
            {tickerMeta.name} · {tickerMeta.subindustry}
          </span>
        )}

        <div className="flex-1" />

        {/* Metric filter */}
        <div className="relative">
          <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            className="h-7 text-xs pl-7 w-[160px]"
            placeholder="Filter metrics..."
            value={metricFilter}
            onChange={(e) => setMetricFilter(e.target.value)}
            data-testid="data-metric-filter"
          />
          {metricFilter && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setMetricFilter("")}>
              <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Column picker */}
        <Popover open={showColumnPicker} onOpenChange={setShowColumnPicker}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1" data-testid="data-column-picker">
              <Columns className="w-3 h-3" />
              Columns ({visibleMetrics ? visibleMetrics.size : allMetrics.length}/{allMetrics.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[250px] p-0" align="end">
            <div className="max-h-[300px] overflow-y-auto py-1">
              <button
                className="w-full text-left px-3 py-1 text-xs font-semibold hover:bg-accent/50 text-primary"
                onClick={() => setVisibleMetrics(null)}
              >
                Show All
              </button>
              {allMetrics.map((m) => {
                const checked = !visibleMetrics || visibleMetrics.has(m);
                return (
                  <button
                    key={m}
                    className="w-full flex items-center gap-2 px-3 py-0.5 text-xs hover:bg-accent/50"
                    onClick={() => toggleColumnVisibility(m)}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${checked ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                      {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                    </div>
                    <span className={pinnedMetrics.has(m) ? "font-semibold" : ""}>{m}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort toggle */}
        <Button
          variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1"
          onClick={() => setSortAsc(!sortAsc)}
          data-testid="data-sort-toggle"
        >
          <ArrowUpDown className="w-3 h-3" />
          {sortAsc ? "Oldest" : "Newest"}
        </Button>

        {/* Export */}
        <Button
          variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1"
          onClick={exportCSV}
          data-testid="data-export-csv"
        >
          <Download className="w-3 h-3" />
          CSV
        </Button>

        <span className="text-[10px] text-muted-foreground tabular-nums">
          {tableData.length} rows · {displayMetrics.length} cols
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
          Loading {activeTicker} data...
        </div>
      ) : (
        <div ref={tableRef} className="flex-1 overflow-auto min-h-0">
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 bg-card z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-card text-left px-2 py-1.5 font-semibold text-muted-foreground border-b border-r border-border min-w-[90px]">
                  Date
                </th>
                {displayMetrics.map((m) => (
                  <th
                    key={m}
                    className={`text-right px-2 py-1.5 font-medium border-b border-border whitespace-nowrap min-w-[80px] group cursor-default ${
                      pinnedMetrics.has(m) ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
                        onClick={() => togglePin(m)}
                        title={pinnedMetrics.has(m) ? "Unpin" : "Pin to left"}
                      >
                        {pinnedMetrics.has(m) ? <PinOff className="w-2.5 h-2.5" /> : <Pin className="w-2.5 h-2.5" />}
                      </button>
                      <span className="text-[10px]">{m}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row) => (
                <tr key={row.dateIdx} className="hover:bg-accent/20 border-b border-border/30">
                  <td className="sticky left-0 z-10 bg-card px-2 py-0.5 font-mono text-muted-foreground border-r border-border tabular-nums">
                    {row.date}
                  </td>
                  {row.values.map((val, i) => (
                    <td
                      key={i}
                      className={`text-right px-2 py-0.5 font-mono tabular-nums ${
                        pinnedMetrics.has(displayMetrics[i]) ? "bg-primary/5" : ""
                      } ${val !== null && val < 0 ? "text-red-400" : ""}`}
                    >
                      {formatValue(val, displayMetrics[i])}
                    </td>
                  ))}
                </tr>
              ))}
              {tableData.length === 0 && (
                <tr>
                  <td colSpan={displayMetrics.length + 1} className="text-center py-8 text-muted-foreground">
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
