// Reconstructed from recovered-bundle/ShortInterest-CduJ1tqP.js on 2026-06-11

import { useState, useMemo, useCallback } from "react";
import { useUniverse } from "@/lib/universeContext";
import { emptyClassFilters, serializeClassFilters, deserializeClassFilters } from "@/lib/dataService";
import { usePageState } from "@/lib/pageState";
import { useQuery } from "@tanstack/react-query";
import { applyClassFilters } from "@/lib/classificationFilters";
import { ClassificationFilters } from "@/lib/classificationFilters";
import { getTickers, getDates, getMetricSeries } from "@/lib/dataService";
import { getLatestMetricForAllTickers } from "@/lib/dataService";
import { Button } from "@/components/ui/button";
import {
  TrendingDown,
  TrendingUp,
  Minus,
  ChevronUp,
  ChevronDown,
  Download,
  ArrowUpDown,
} from "lucide-react";

interface SICell {
  value: number | null;
  format: "pct" | "pp";
}

function SIValue({ value, format }: { value: number | null; format: "pct" | "pp" }) {
  if (value == null)
    return <span className="text-muted-foreground/50">-</span>;
  const colorClass =
    format === "pp"
      ? value > 0.1
        ? "text-red-400"
        : value < -0.1
        ? "text-emerald-400"
        : "text-foreground"
      : "text-foreground";
  const prefix = format === "pp" && value > 0 ? "+" : "";
  const suffix = format === "pct" ? "%" : "pp";
  return (
    <span className={`font-mono text-xs tabular-nums ${colorClass}`}>
      {prefix}
      {value.toFixed(2)}
      {suffix}
    </span>
  );
}

function Sparkline({ data, width = 80, height = 22 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const range = Math.max(...data) - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const last = data[data.length - 1];
  const first = data[0];
  const stroke =
    last > first + 0.1 ? "#ef4444" : last < first - 0.1 ? "#22c55e" : "#94a3b8";
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function SIBar({ value, max }: { value: number | null; max: number }) {
  if (value === null || max === 0) return null;
  const pct = Math.min(100, (value / max) * 100);
  const barClass =
    pct > 66 ? "bg-red-500/60" : pct > 33 ? "bg-amber-500/50" : "bg-emerald-500/40";
  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
        <div className={`h-full rounded ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-foreground w-12 text-right">
        {value.toFixed(2)}%
      </span>
    </div>
  );
}

function DeltaIcon({ value }: { value: number | null }) {
  if (value === null) return <Minus className="w-3 h-3 text-muted-foreground" />;
  if (value > 0.1) return <TrendingUp className="w-3 h-3 text-red-400" />;
  if (value < -0.1) return <TrendingDown className="w-3 h-3 text-emerald-400" />;
  return <Minus className="w-3 h-3 text-muted-foreground/50" />;
}

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
  sparkline: number[];
}

type SortKey = keyof SIRow;

export default function ShortInterest() {
  const { universeTickers } = useUniverse();
  const [viewMode, setViewMode] = useState<"table" | "movers">("table");
  const [classFilters, setClassFilters] = useState(() => emptyClassFilters());
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string>("siPct");
  const [sortAsc, setSortAsc] = useState(false);

  const getState = useCallback(
    () => ({
      viewMode,
      filters: serializeClassFilters(classFilters),
      manualTickers: [...manualTickers],
      sortKey,
      sortAsc,
    }),
    [viewMode, classFilters, manualTickers, sortKey, sortAsc]
  );

  const restoreState = useCallback((saved: any) => {
    if (saved.viewMode !== undefined) setViewMode(saved.viewMode);
    if (saved.filters !== undefined) setClassFilters(deserializeClassFilters(saved.filters));
    if (saved.manualTickers !== undefined) setManualTickers(new Set(saved.manualTickers));
    if (saved.sortKey !== undefined) setSortKey(saved.sortKey);
    if (saved.sortAsc !== undefined) setSortAsc(saved.sortAsc);
  }, []);

  usePageState("shortInterest", getState, restoreState);

  const { data: siTickers } = useQuery({
    queryKey: ["/si-tickers"],
    queryFn: getTickers,
  });

  const { data: siMetrics } = useQuery({
    queryKey: ["/si-all-metrics"],
    queryFn: async () => {
      const [siPctData, d1WData, d1MData, d3MData, d6MData] = await Promise.all([
        getLatestMetricForAllTickers("Short Interest%"),
        getLatestMetricForAllTickers("SI Δ 1W"),
        getLatestMetricForAllTickers("SI Δ 1M"),
        getLatestMetricForAllTickers("SI Δ 3M"),
        getLatestMetricForAllTickers("SI Δ 6M"),
      ]);
      const toMap = (arr: any[]) => {
        const map: Record<string, number> = {};
        for (const item of arr) map[item.ticker] = item.value;
        return map;
      };
      return {
        siPct: toMap(siPctData),
        d1W: toMap(d1WData),
        d1M: toMap(d1MData),
        d3M: toMap(d3MData),
        d6M: toMap(d6MData),
      };
    },
  });

  const { data: sparklineData } = useQuery({
    queryKey: ["/si-sparklines"],
    queryFn: async () => {
      if (!siTickers) return {};
      const result: Record<string, number[]> = {};
      const dates = await getDates();
      for (let i = 0; i < (siTickers as any[]).length; i += 20) {
        const chunk = (siTickers as any[]).slice(i, i + 20);
        await Promise.all(
          chunk.map(async (t: any) => {
            try {
              const series = await getMetricSeries(t.ticker, "Short Interest%");
              if (series && series.length > 0) {
                const values: number[] = [];
                const startIdx = Math.max(0, series.length - 260);
                for (let j = startIdx; j < series.length; j += 5) {
                  const pt = series[j];
                  if (pt && pt.value !== null && pt.value !== undefined) {
                    values.push(pt.value);
                  }
                }
                if (values.length > 1) result[t.ticker] = values;
              }
            } catch {}
          })
        );
      }
      return result;
    },
    enabled: !!siTickers,
  });

  const allRows: SIRow[] = useMemo(() => {
    if (!siTickers || !siMetrics) return [];
    return (siTickers as any[]).map((t: any) => ({
      ticker: t.ticker,
      name: t.name,
      economy: t.economy || "",
      sector: t.sector || "",
      subsector: t.subsector || "",
      industryGroup: t.industryGroup || "",
      industry: t.industry || "",
      subindustry: t.subindustry || "",
      siPct: siMetrics.siPct[t.ticker] ?? null,
      delta1W: siMetrics.d1W[t.ticker] ?? null,
      delta1M: siMetrics.d1M[t.ticker] ?? null,
      delta3M: siMetrics.d3M[t.ticker] ?? null,
      delta6M: siMetrics.d6M[t.ticker] ?? null,
      sparkline: sparklineData?.[t.ticker] || [],
    }));
  }, [siTickers, siMetrics, sparklineData]);

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (universeTickers && universeTickers.size > 0) {
      rows = rows.filter((r) => universeTickers.has(r.ticker));
    }
    rows = applyClassFilters(rows as any[], classFilters, search, manualTickers) as unknown as SIRow[];
    rows = [...rows].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string")
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
    return rows;
  }, [allRows, classFilters, universeTickers, search, sortKey, sortAsc]);

  const maxSI = useMemo(
    () => Math.max(...filteredRows.map((r) => r.siPct ?? 0), 1),
    [filteredRows]
  );

  const topIncreasers = useMemo(
    () =>
      [...filteredRows]
        .filter((r) => r.delta1M !== null)
        .sort((a, b) => (b.delta1M ?? 0) - (a.delta1M ?? 0))
        .slice(0, 10),
    [filteredRows]
  );

  const topDecreasers = useMemo(
    () =>
      [...filteredRows]
        .filter((r) => r.delta1M !== null)
        .sort((a, b) => (a.delta1M ?? 0) - (b.delta1M ?? 0))
        .slice(0, 10),
    [filteredRows]
  );

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortAsc((v) => !v);
      } else {
        setSortKey(key);
        setSortAsc(false);
      }
    },
    [sortKey]
  );

  const SortIcon = ({ col }: { col: string }) =>
    sortKey !== col ? (
      <ArrowUpDown className="w-3 h-3 ml-0.5 opacity-30" />
    ) : sortAsc ? (
      <ChevronUp className="w-3 h-3 ml-0.5 text-primary" />
    ) : (
      <ChevronDown className="w-3 h-3 ml-0.5 text-primary" />
    );

  const handleExportCsv = useCallback(() => {
    const headers = ["Ticker", "Name", "SI%", "Δ 1W (pp)", "Δ 1M (pp)", "Δ 3M (pp)", "Δ 6M (pp)"];
    const rows = filteredRows.map((r) => [
      r.ticker,
      `"${r.name}"`,
      r.siPct?.toFixed(2) ?? "",
      r.delta1W?.toFixed(2) ?? "",
      r.delta1M?.toFixed(2) ?? "",
      r.delta3M?.toFixed(2) ?? "",
      r.delta6M?.toFixed(2) ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `short_interest_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }, [filteredRows]);

  const avgSI = useMemo(() => {
    const vals = filteredRows.filter((r) => r.siPct !== null).map((r) => r.siPct!);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [filteredRows]);

  const highSICount = useMemo(
    () => filteredRows.filter((r) => (r.siPct ?? 0) > 5).length,
    [filteredRows]
  );
  const up1MCount = useMemo(
    () => filteredRows.filter((r) => (r.delta1M ?? 0) > 0.1).length,
    [filteredRows]
  );
  const down1MCount = useMemo(
    () => filteredRows.filter((r) => (r.delta1M ?? 0) < -0.1).length,
    [filteredRows]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-border flex-wrap flex-shrink-0">
        <div className="flex items-center bg-muted rounded p-0.5">
          {(["table", "movers"] as const).map((mode) => (
            <button
              key={mode}
              className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition-colors ${
                viewMode === mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setViewMode(mode)}
              data-testid={`si-view-${mode}`}
            >
              {mode === "table" ? "Overview" : "Top Movers"}
            </button>
          ))}
        </div>
        <ClassificationFilters
          filters={classFilters}
          onFiltersChange={setClassFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          totalCount={allRows.length}
          filteredCount={filteredRows.length}
          testIdPrefix="si"
        />
        <div className="flex items-center gap-2 ml-2 text-[10px]">
          <span className="text-muted-foreground">
            Avg SI:{" "}
            <span className="text-foreground font-medium">{avgSI.toFixed(2)}%</span>
          </span>
          <span className="text-muted-foreground">
            High (&gt;5%):{" "}
            <span className="text-red-400 font-medium">{highSICount}</span>
          </span>
          <span className="text-muted-foreground">
            1M ▲: <span className="text-red-400 font-medium">{up1MCount}</span>
          </span>
          <span className="text-muted-foreground">
            1M ▼: <span className="text-emerald-400 font-medium">{down1MCount}</span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {filteredRows.length} / {allRows.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={handleExportCsv}
          >
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {viewMode === "table" ? (
        <div className="flex-1 overflow-auto">
          <table
            className="text-xs"
            style={{ tableLayout: "fixed", width: "880px" }}
          >
            <colgroup>
              <col style={{ width: "56px" }} />
              <col style={{ width: "230px" }} />
              <col style={{ width: "146px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "24px" }} />
              <col style={{ width: "82px" }} />
              <col style={{ width: "82px" }} />
              <col style={{ width: "82px" }} />
              <col style={{ width: "90px" }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card border-b border-border">
              <tr>
                <th className="text-left px-2 py-1.5 whitespace-nowrap">
                  <button
                    className="inline-flex items-center text-muted-foreground font-medium hover:text-foreground"
                    onClick={() => handleSort("ticker")}
                  >
                    Ticker <SortIcon col="ticker" />
                  </button>
                </th>
                <th className="text-left px-2 py-1.5 whitespace-nowrap">
                  <button
                    className="inline-flex items-center text-muted-foreground font-medium hover:text-foreground"
                    onClick={() => handleSort("name")}
                  >
                    Name <SortIcon col="name" />
                  </button>
                </th>
                <th className="text-right px-2 py-1.5 whitespace-nowrap">
                  <button
                    className="inline-flex items-center justify-end text-muted-foreground font-medium hover:text-foreground"
                    onClick={() => handleSort("siPct")}
                  >
                    SI % <SortIcon col="siPct" />
                  </button>
                </th>
                <th className="text-center px-2 py-1.5 whitespace-nowrap">
                  <span className="text-muted-foreground font-medium text-[10px]">1Y Trend</span>
                </th>
                <th className="text-center px-1 py-1.5 w-5">
                  <span className="text-muted-foreground text-[10px]" />
                </th>
                <th className="text-right px-2 py-1.5 whitespace-nowrap">
                  <button
                    className="inline-flex items-center justify-end text-muted-foreground font-medium hover:text-foreground"
                    onClick={() => handleSort("delta1W")}
                  >
                    Δ 1W <SortIcon col="delta1W" />
                  </button>
                </th>
                <th className="text-right px-2 py-1.5 whitespace-nowrap">
                  <button
                    className="inline-flex items-center justify-end text-muted-foreground font-medium hover:text-foreground"
                    onClick={() => handleSort("delta1M")}
                  >
                    Δ 1M <SortIcon col="delta1M" />
                  </button>
                </th>
                <th className="text-right px-2 py-1.5 whitespace-nowrap">
                  <button
                    className="inline-flex items-center justify-end text-muted-foreground font-medium hover:text-foreground"
                    onClick={() => handleSort("delta3M")}
                  >
                    Δ 3M <SortIcon col="delta3M" />
                  </button>
                </th>
                <th className="text-right px-2 py-1.5 whitespace-nowrap">
                  <button
                    className="inline-flex items-center justify-end text-muted-foreground font-medium hover:text-foreground"
                    onClick={() => handleSort("delta6M")}
                  >
                    Δ 6M <SortIcon col="delta6M" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.ticker}
                  className="border-b border-border/20 hover:bg-accent/30 transition-colors"
                  data-testid={`si-row-${row.ticker}`}
                >
                  <td className="px-2 py-1 font-mono font-bold text-primary whitespace-nowrap">
                    {row.ticker}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground truncate max-w-[240px] whitespace-nowrap">
                    {row.name}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <SIBar value={row.siPct} max={maxSI} />
                  </td>
                  <td className="px-2 py-1 text-center whitespace-nowrap">
                    <Sparkline data={row.sparkline} />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <DeltaIcon value={row.delta1M} />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <SIValue value={row.delta1W} format="pp" />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <SIValue value={row.delta1M} format="pp" />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <SIValue value={row.delta3M} format="pp" />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <SIValue value={row.delta6M} format="pp" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Biggest 1M SI Increases (bearish signal)
              </h3>
              <div className="space-y-0.5">
                {topIncreasers.map((row, idx) => (
                  <div
                    key={row.ticker}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/30"
                    data-testid={`si-mover-up-${row.ticker}`}
                  >
                    <span className="text-muted-foreground/60 font-mono w-5 text-right">
                      {idx + 1}
                    </span>
                    <span className="font-mono font-bold text-primary w-14">{row.ticker}</span>
                    <span className="text-muted-foreground text-xs truncate flex-1">{row.name}</span>
                    <span className="font-mono text-xs text-muted-foreground w-14 text-right">
                      {row.siPct?.toFixed(2)}%
                    </span>
                    <span className="font-mono text-xs text-red-400 w-16 text-right font-medium">
                      +{row.delta1M?.toFixed(2)}pp
                    </span>
                    <Sparkline data={row.sparkline} width={60} height={18} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" />
                Biggest 1M SI Decreases (bullish signal)
              </h3>
              <div className="space-y-0.5">
                {topDecreasers.map((row, idx) => (
                  <div
                    key={row.ticker}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/30"
                    data-testid={`si-mover-down-${row.ticker}`}
                  >
                    <span className="text-muted-foreground/60 font-mono w-5 text-right">
                      {idx + 1}
                    </span>
                    <span className="font-mono font-bold text-primary w-14">{row.ticker}</span>
                    <span className="text-muted-foreground text-xs truncate flex-1">{row.name}</span>
                    <span className="font-mono text-xs text-muted-foreground w-14 text-right">
                      {row.siPct?.toFixed(2)}%
                    </span>
                    <span className="font-mono text-xs text-emerald-400 w-16 text-right font-medium">
                      {row.delta1M?.toFixed(2)}pp
                    </span>
                    <Sparkline data={row.sparkline} width={60} height={18} />
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
