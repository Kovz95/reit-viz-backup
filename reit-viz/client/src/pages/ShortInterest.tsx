import { useState, useMemo, useCallback, useEffect } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery } from "@tanstack/react-query";
import {
  getTickers,
  getMetricForAllTickers,
  getMetricSeries,
  getDates,
} from "@/lib/dataService";
import type { TickerMeta, RankRow } from "@/lib/dataService";
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
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────────────────────
interface SIRow {
  ticker: string;
  name: string;
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  industry: string;
  subindustry: string;
  siPct: number | null;
  delta1W: number | null;
  delta1M: number | null;
  delta3M: number | null;
  delta6M: number | null;
  // Historical data for sparkline
  sparkline: number[];
}

type ViewMode = "table" | "movers";
type SortKey = "ticker" | "name" | "siPct" | "delta1W" | "delta1M" | "delta3M" | "delta6M";

// ─── Cell Renderers ──────────────────────────────────────────────────────────
function SICell({ value, format }: { value: number | null; format: "pct" | "pp" }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground/50">-</span>;
  const color = format === "pp"
    ? (value > 0.1 ? "text-red-400" : value < -0.1 ? "text-emerald-400" : "text-foreground")
    : "text-foreground";
  const prefix = format === "pp" && value > 0 ? "+" : "";
  const suffix = format === "pct" ? "%" : "pp";
  return (
    <span className={`font-mono text-xs tabular-nums ${color}`}>
      {prefix}{value.toFixed(2)}{suffix}
    </span>
  );
}

/** Mini sparkline using SVG */
function MiniSparkline({ data, width = 80, height = 22 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  // Color based on trend
  const last = data[data.length - 1];
  const first = data[0];
  const stroke = last > first + 0.1 ? "#ef4444" : last < first - 0.1 ? "#22c55e" : "#94a3b8";

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

/** Bar showing SI level relative to the universe */
function SIBar({ value, max }: { value: number | null; max: number }) {
  if (value === null || max === 0) return null;
  const pct = Math.min(100, (value / max) * 100);
  const color = pct > 66 ? "bg-red-500/60" : pct > 33 ? "bg-amber-500/50" : "bg-emerald-500/40";
  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-foreground w-12 text-right">
        {value.toFixed(2)}%
      </span>
    </div>
  );
}

/** Delta indicator with icon */
function DeltaIndicator({ value }: { value: number | null }) {
  if (value === null) return <Minus className="w-3 h-3 text-muted-foreground" />;
  if (value > 0.1) return <TrendingUp className="w-3 h-3 text-red-400" />;
  if (value < -0.1) return <TrendingDown className="w-3 h-3 text-emerald-400" />;
  return <Minus className="w-3 h-3 text-muted-foreground/50" />;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ShortInterest() {
  const { universeTickers } = useUniverse();
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [filters, setFilters] = useState<ClassFilters>(emptyClassFilters);
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("siPct");
  const [sortAsc, setSortAsc] = useState(false);

  const serializeShortInterest = useCallback(() => ({
    viewMode,
    filters: serializeClassFilters(filters),
    manualTickers: [...manualTickers],
    sortKey,
    sortAsc,
  }), [viewMode, filters, manualTickers, sortKey, sortAsc]);

  const restoreShortInterest = useCallback((state: any) => {
    if (state.viewMode !== undefined) setViewMode(state.viewMode);
    if (state.filters !== undefined) setFilters(deserializeClassFilters(state.filters));
    if (state.manualTickers !== undefined) setManualTickers(new Set(state.manualTickers));
    if (state.sortKey !== undefined) setSortKey(state.sortKey);
    if (state.sortAsc !== undefined) setSortAsc(state.sortAsc);
  }, []);

  useWorkspaceTab("shortInterest", serializeShortInterest, restoreShortInterest);

  // ── Data queries ─────────────────────────────────────────────────
  const { data: tickers } = useQuery({
    queryKey: ["/si-tickers"],
    queryFn: getTickers,
  });

  // Fetch all SI metrics in one composite query
  const { data: allSIData } = useQuery({
    queryKey: ["/si-all-metrics"],
    queryFn: async () => {
      const [siPct, d1w, d1m, d3m, d6m] = await Promise.all([
        getMetricForAllTickers("Short Interest%"),
        getMetricForAllTickers("SI Δ 1W"),
        getMetricForAllTickers("SI Δ 1M"),
        getMetricForAllTickers("SI Δ 3M"),
        getMetricForAllTickers("SI Δ 6M"),
      ]);
      // Convert arrays to ticker-keyed maps
      const toMap = (arr: RankRow[]) => {
        const m: Record<string, number | null> = {};
        for (const r of arr) m[r.ticker] = r.value;
        return m;
      };
      return {
        siPct: toMap(siPct),
        d1W: toMap(d1w),
        d1M: toMap(d1m),
        d3M: toMap(d3m),
        d6M: toMap(d6m),
      };
    },
  });

  // Build sparkline data — fetch last 52 weeks of SI% for each ticker
  const { data: sparklineData } = useQuery({
    queryKey: ["/si-sparklines"],
    queryFn: async () => {
      if (!tickers) return {};
      const result: Record<string, number[]> = {};
      const dates = await getDates();
      const startIdx = Math.max(0, dates.length - 260);

      // Process in batches of 20
      for (let b = 0; b < tickers.length; b += 20) {
        const batch = tickers.slice(b, b + 20);
        await Promise.all(
          batch.map(async (t) => {
            try {
              const series = await getMetricSeries(t.ticker, "Short Interest%");
              if (series && series.length > 0) {
                const vals: number[] = [];
                // series is TimeValue[] = { time: string, value: number }[]
                const sliceStart = Math.max(0, series.length - 260);
                for (let i = sliceStart; i < series.length; i += 5) {
                  const pt = series[i];
                  if (pt && pt.value !== null && pt.value !== undefined) {
                    vals.push(pt.value);
                  }
                }
                if (vals.length > 1) result[t.ticker] = vals;
              }
            } catch { /* skip */ }
          })
        );
      }
      return result;
    },
    enabled: !!tickers,
  });

  // ── Build rows ───────────────────────────────────────────────────
  const rows: SIRow[] = useMemo(() => {
    if (!tickers || !allSIData) return [];
    return tickers.map((t) => ({
      ticker: t.ticker,
      name: t.name,
      economy: t.economy || "",
      sector: t.sector || "",
      subsector: t.subsector || "",
      industryGroup: t.industryGroup || "",
      industry: t.industry || "",
      subindustry: t.subindustry || "",
      siPct: allSIData.siPct[t.ticker] ?? null,
      delta1W: allSIData.d1W[t.ticker] ?? null,
      delta1M: allSIData.d1M[t.ticker] ?? null,
      delta3M: allSIData.d3M[t.ticker] ?? null,
      delta6M: allSIData.d6M[t.ticker] ?? null,
      sparkline: sparklineData?.[t.ticker] || [],
    }));
  }, [tickers, allSIData, sparklineData]);

  // ── Filter + sort ────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let list = rows;
    if (universeTickers && universeTickers.size > 0) {
      list = list.filter(r => universeTickers.has(r.ticker));
    }
    // applyClassFilters takes (rows[], filters, search, manualTickers) and returns filtered rows[]
    list = applyClassFilters(list, filters, search, manualTickers);
    // Sort
    list = [...list].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return list;
  }, [rows, filters, universeTickers, search, sortKey, sortAsc]);

  const maxSI = useMemo(() => Math.max(...filteredRows.map(r => r.siPct ?? 0), 1), [filteredRows]);

  // Top movers: biggest 1M increase and decrease (respect universe filter)
  const topIncreasers = useMemo(() =>
    [...filteredRows].filter(r => r.delta1M !== null).sort((a, b) => (b.delta1M ?? 0) - (a.delta1M ?? 0)).slice(0, 10),
    [filteredRows]
  );
  const topDecreasers = useMemo(() =>
    [...filteredRows].filter(r => r.delta1M !== null).sort((a, b) => (a.delta1M ?? 0) - (b.delta1M ?? 0)).slice(0, 10),
    [filteredRows]
  );

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }, [sortKey, sortAsc]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 ml-0.5 opacity-30" />;
    return sortAsc
      ? <ArrowUp className="w-3 h-3 ml-0.5 text-primary" />
      : <ArrowDown className="w-3 h-3 ml-0.5 text-primary" />;
  };

  // ── Export ───────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const headers = ["Ticker", "Name", "SI%", "Δ 1W (pp)", "Δ 1M (pp)", "Δ 3M (pp)", "Δ 6M (pp)"];
    const lines = filteredRows.map(r => [
      r.ticker, `"${r.name}"`, r.siPct?.toFixed(2) ?? "", r.delta1W?.toFixed(2) ?? "",
      r.delta1M?.toFixed(2) ?? "", r.delta3M?.toFixed(2) ?? "", r.delta6M?.toFixed(2) ?? "",
    ]);
    const csv = [headers.join(","), ...lines.map(l => l.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `short_interest_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }, [filteredRows]);

  // ── Summary stats ────────────────────────────────────────────────
  const avgSI = useMemo(() => {
    const vals = filteredRows.filter(r => r.siPct !== null).map(r => r.siPct!);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }, [filteredRows]);

  const highSICount = useMemo(() => filteredRows.filter(r => (r.siPct ?? 0) > 5).length, [filteredRows]);
  const increasingCount = useMemo(() => filteredRows.filter(r => (r.delta1M ?? 0) > 0.1).length, [filteredRows]);
  const decreasingCount = useMemo(() => filteredRows.filter(r => (r.delta1M ?? 0) < -0.1).length, [filteredRows]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-2 border-b border-border flex-wrap flex-shrink-0">
        <div className="flex items-center bg-muted rounded p-0.5">
          {(["table", "movers"] as ViewMode[]).map(vm => (
            <button
              key={vm}
              className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition-colors ${
                viewMode === vm ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode(vm)}
              data-testid={`si-view-${vm}`}
            >
              {vm === "table" ? "Overview" : "Top Movers"}
            </button>
          ))}
        </div>

        <ClassificationFilters
          filters={filters}
          onFiltersChange={setFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          totalCount={rows.length}
          filteredCount={filteredRows.length}
          testIdPrefix="si"
        />

        {/* Summary badges */}
        <div className="flex items-center gap-2 ml-2 text-[10px]">
          <span className="text-muted-foreground">
            Avg SI: <span className="text-foreground font-medium">{avgSI.toFixed(2)}%</span>
          </span>
          <span className="text-muted-foreground">
            High (&gt;5%): <span className="text-red-400 font-medium">{highSICount}</span>
          </span>
          <span className="text-muted-foreground">
            1M ▲: <span className="text-red-400 font-medium">{increasingCount}</span>
          </span>
          <span className="text-muted-foreground">
            1M ▼: <span className="text-emerald-400 font-medium">{decreasingCount}</span>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{filteredRows.length} / {rows.length}</span>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={exportCSV}>
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "table" ? (
        <div className="flex-1 overflow-auto">
          <table className="text-xs" style={{ tableLayout: 'fixed', width: '880px' }}>
            <colgroup>
              <col style={{ width: '56px' }} />
              <col style={{ width: '230px' }} />
              <col style={{ width: '146px' }} />
              <col style={{ width: '88px' }} />
              <col style={{ width: '24px' }} />
              <col style={{ width: '82px' }} />
              <col style={{ width: '82px' }} />
              <col style={{ width: '82px' }} />
              <col style={{ width: '90px' }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card border-b border-border">
              <tr>
                <th className="text-left px-2 py-1.5 whitespace-nowrap">
                  <button className="inline-flex items-center text-muted-foreground font-medium hover:text-foreground" onClick={() => handleSort("ticker")}>
                    Ticker <SortIcon col="ticker" />
                  </button>
                </th>
                <th className="text-left px-2 py-1.5 whitespace-nowrap">
                  <button className="inline-flex items-center text-muted-foreground font-medium hover:text-foreground" onClick={() => handleSort("name")}>
                    Name <SortIcon col="name" />
                  </button>
                </th>
                <th className="text-right px-2 py-1.5 whitespace-nowrap">
                  <button className="inline-flex items-center justify-end text-muted-foreground font-medium hover:text-foreground" onClick={() => handleSort("siPct")}>
                    SI % <SortIcon col="siPct" />
                  </button>
                </th>
                <th className="text-center px-2 py-1.5 whitespace-nowrap">
                  <span className="text-muted-foreground font-medium text-[10px]">1Y Trend</span>
                </th>
                <th className="text-center px-1 py-1.5 w-5">
                  <span className="text-muted-foreground text-[10px]"></span>
                </th>
                <th className="text-right px-2 py-1.5 whitespace-nowrap">
                  <button className="inline-flex items-center justify-end text-muted-foreground font-medium hover:text-foreground" onClick={() => handleSort("delta1W")}>
                    Δ 1W <SortIcon col="delta1W" />
                  </button>
                </th>
                <th className="text-right px-2 py-1.5 whitespace-nowrap">
                  <button className="inline-flex items-center justify-end text-muted-foreground font-medium hover:text-foreground" onClick={() => handleSort("delta1M")}>
                    Δ 1M <SortIcon col="delta1M" />
                  </button>
                </th>
                <th className="text-right px-2 py-1.5 whitespace-nowrap">
                  <button className="inline-flex items-center justify-end text-muted-foreground font-medium hover:text-foreground" onClick={() => handleSort("delta3M")}>
                    Δ 3M <SortIcon col="delta3M" />
                  </button>
                </th>
                <th className="text-right px-2 py-1.5 whitespace-nowrap">
                  <button className="inline-flex items-center justify-end text-muted-foreground font-medium hover:text-foreground" onClick={() => handleSort("delta6M")}>
                    Δ 6M <SortIcon col="delta6M" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.ticker} className="border-b border-border/20 hover:bg-accent/30 transition-colors" data-testid={`si-row-${r.ticker}`}>
                  <td className="px-2 py-1 font-mono font-bold text-primary whitespace-nowrap">{r.ticker}</td>
                  <td className="px-2 py-1 text-muted-foreground truncate max-w-[240px] whitespace-nowrap">{r.name}</td>
                  <td className="px-2 py-1 whitespace-nowrap"><SIBar value={r.siPct} max={maxSI} /></td>
                  <td className="px-2 py-1 text-center whitespace-nowrap"><MiniSparkline data={r.sparkline} /></td>
                  <td className="px-1 py-1 text-center"><DeltaIndicator value={r.delta1M} /></td>
                  <td className="px-2 py-1 text-right"><SICell value={r.delta1W} format="pp" /></td>
                  <td className="px-2 py-1 text-right"><SICell value={r.delta1M} format="pp" /></td>
                  <td className="px-2 py-1 text-right"><SICell value={r.delta3M} format="pp" /></td>
                  <td className="px-2 py-1 text-right"><SICell value={r.delta6M} format="pp" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Top Movers View */
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Biggest Increases */}
            <div>
              <h3 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Biggest 1M SI Increases (bearish signal)
              </h3>
              <div className="space-y-0.5">
                {topIncreasers.map((r, i) => (
                  <div key={r.ticker} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/30" data-testid={`si-mover-up-${r.ticker}`}>
                    <span className="text-muted-foreground/60 font-mono w-5 text-right">{i + 1}</span>
                    <span className="font-mono font-bold text-primary w-14">{r.ticker}</span>
                    <span className="text-muted-foreground text-xs truncate flex-1">{r.name}</span>
                    <span className="font-mono text-xs text-muted-foreground w-14 text-right">{r.siPct?.toFixed(2)}%</span>
                    <span className="font-mono text-xs text-red-400 w-16 text-right font-medium">
                      +{r.delta1M?.toFixed(2)}pp
                    </span>
                    <MiniSparkline data={r.sparkline} width={60} height={18} />
                  </div>
                ))}
              </div>
            </div>

            {/* Biggest Decreases */}
            <div>
              <h3 className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" />
                Biggest 1M SI Decreases (bullish signal)
              </h3>
              <div className="space-y-0.5">
                {topDecreasers.map((r, i) => (
                  <div key={r.ticker} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/30" data-testid={`si-mover-down-${r.ticker}`}>
                    <span className="text-muted-foreground/60 font-mono w-5 text-right">{i + 1}</span>
                    <span className="font-mono font-bold text-primary w-14">{r.ticker}</span>
                    <span className="text-muted-foreground text-xs truncate flex-1">{r.name}</span>
                    <span className="font-mono text-xs text-muted-foreground w-14 text-right">{r.siPct?.toFixed(2)}%</span>
                    <span className="font-mono text-xs text-emerald-400 w-16 text-right font-medium">
                      {r.delta1M?.toFixed(2)}pp
                    </span>
                    <MiniSparkline data={r.sparkline} width={60} height={18} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
