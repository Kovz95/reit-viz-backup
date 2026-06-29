// Reconstructed from recovered-bundle/Valuation-58qiOq4f.js on 2026-06-11

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import React from "react";
import { useUniverse } from "@/lib/universeContext";
import {
  emptyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  getCustomFundamentalMetrics,
  getMetricTrailingAllTickers,
  getTickers,
  getTickersCacheSync,
} from "@/lib/dataService";
import { groupMetricsByCategory, DERIVED_METRICS } from "@/lib/metricCategories";
import { usePageState } from "@/lib/pageState";
import { useQuery } from "@tanstack/react-query";
import { applyClassFilters } from "@/lib/classificationFilters";
import { ClassificationFilters } from "@/lib/classificationFilters";
import { navigateToTicker } from "@/lib/navigateToTicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Download, ChevronDown, ChevronRight, ArrowUpDown, ExternalLink } from "lucide-react";

const METRIC_GROUPS_BASE: Record<string, string[]> = {
  Valuation: [
    "P/FFO FY2", "P/FFO LTM", "P/AFFO FY2", "P/AFFO LTM", "P/E FY2", "P/E LTM",
    "P/S FY2", "P/S LTM", "EV/EBITDA FY2", "EV/EBITDA LTM", "Implied Cap Rate",
  ],
  Yields: [
    "FFO Yield FY2", "FFO Yield LTM", "AFFO Yield FY2", "AFFO Yield LTM", "Dividend Yield",
  ],
  Growth: [
    "FY1 FFO Growth", "FY2 FFO Growth", "FY1 AFFO Growth", "FY2 AFFO Growth",
    "FY1 EPS Growth", "FY2 EPS Growth",
  ],
};


const LOOKBACK_OPTIONS = [
  { label: "1 Year", value: 252 },
  { label: "2 Year", value: 504 },
  { label: "3 Year", value: 756 },
  { label: "5 Year", value: 1260 },
  { label: "7 Year", value: 1764 },
  { label: "10 Year", value: 2520 },
  { label: "All", value: 99999 },
];

interface ValuationStats {
  mean: number;
  std: number;
}

function calcStats(values: number[]): ValuationStats {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

interface SparklineProps {
  values: number[];
  mean: number | null;
  std: number | null;
  current: number | null;
  width?: number;
  height?: number;
}

function Sparkline({ values, mean, std, current, width = 120, height = 32 }: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || values.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    let allVals = [...values];
    if (mean !== null && std !== null) allVals.push(mean + 2 * std, mean - 2 * std);
    const minVal = Math.min(...allVals);
    const range = Math.max(...allVals) - minVal || 1;
    const pad = 2;
    const drawW = width - 2 * pad;
    const drawH = height - 2 * pad;
    const toY = (v: number) => pad + drawH - ((v - minVal) / range) * drawH;
    const toX = (i: number) => pad + (i / (values.length - 1)) * drawW;

    ctx.clearRect(0, 0, width, height);

    if (mean !== null && std !== null) {
      const bandTop = toY(mean + std);
      const bandBot = toY(mean - std);
      ctx.fillStyle = "rgba(14, 165, 233, 0.07)";
      ctx.fillRect(pad, bandTop, drawW, bandBot - bandTop);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(14, 165, 233, 0.35)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      const meanY = toY(mean);
      ctx.moveTo(pad, meanY);
      ctx.lineTo(pad + drawW, meanY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(14, 165, 233, 0.15)";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 2]);
      const plusSigY = toY(mean + std);
      ctx.moveTo(pad, plusSigY);
      ctx.lineTo(pad + drawW, plusSigY);
      ctx.stroke();
      ctx.beginPath();
      const minusSigY = toY(mean - std);
      ctx.moveTo(pad, minusSigY);
      ctx.lineTo(pad + drawW, minusSigY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    let lineColor = "rgba(14, 165, 233, 0.7)";
    if (mean !== null && std !== null && current !== null && std > 0) {
      const z = (current - mean) / std;
      if (z < -1) lineColor = "rgba(34, 197, 94, 0.75)";
      else if (z > 1) lineColor = "rgba(239, 68, 68, 0.75)";
    }

    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < values.length; i++) {
      const x = toX(i);
      const y = toY(values[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (current !== null) {
      const cx = pad + drawW;
      const cy = toY(current);
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
    }
  }, [values, mean, std, current, width, height]);

  if (values.length < 2)
    return <span className="text-[10px] text-muted-foreground/40">—</span>;

  return <canvas ref={canvasRef} style={{ width, height }} />;
}

function zScoreTextClass(z: number | null): string {
  if (z === null) return "";
  if (z <= -2) return "text-green-400 font-semibold";
  if (z <= -1) return "text-green-400";
  if (z <= -0.5) return "text-green-300/80";
  if (z >= 2) return "text-red-400 font-semibold";
  if (z >= 1) return "text-red-400";
  if (z >= 0.5) return "text-red-300/80";
  return "text-muted-foreground";
}

function zScoreRowClass(z: number | null): string {
  if (z === null) return "";
  if (z <= -2) return "bg-green-500/10";
  if (z <= -1) return "bg-green-500/5";
  if (z >= 2) return "bg-red-500/10";
  if (z >= 1) return "bg-red-500/5";
  return "";
}

interface ValuationRow {
  ticker: string;
  name: string;
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  industry: string;
  subindustry: string;
  current: number | null;
  mean5Y: number;
  std5Y: number;
  zScore: number | null;
  histPctile: number | null;
  premium: number | null;
  values: number[];
  dates: string[];
}

interface SummaryStats {
  cheapCount: number;
  fairCount: number;
  richCount: number;
  medianZ: number;
  avgZ: number;
  total: number;
}

export default function Valuation() {
  const { universeTickers } = useUniverse();
  const [metric, setMetric] = useState("P/FFO FY2");
  const [lookback, setLookback] = useState(1260);
  const [sortCol, setSortCol] = useState("zScore");
  const [sortDir, setSortDir] = useState("asc");
  const [search, setSearch] = useState("");
  const [classFilters, setClassFilters] = useState(emptyClassFilters);
  const [manualTickers, setManualTickers] = useState(new Set<string>());
  const [expandedGroups, setExpandedGroups] = useState(new Set<string>());
  const [groupByLevel, setGroupByLevel] = useState("none");

  const getState = useCallback(
    () => ({
      metric,
      lookback,
      sortCol,
      sortDir,
      classFilters: serializeClassFilters(classFilters),
      manualTickers: [...manualTickers],
      groupByLevel,
    }),
    [metric, lookback, sortCol, sortDir, classFilters, manualTickers, groupByLevel]
  );

  const restoreState = useCallback((saved: any) => {
    if (saved.metric !== undefined) setMetric(saved.metric);
    if (saved.lookback !== undefined) setLookback(saved.lookback);
    if (saved.sortCol !== undefined) setSortCol(saved.sortCol);
    if (saved.sortDir !== undefined) setSortDir(saved.sortDir);
    if (saved.classFilters !== undefined) setClassFilters(deserializeClassFilters(saved.classFilters));
    if (saved.manualTickers !== undefined) setManualTickers(new Set(saved.manualTickers));
    if (saved.groupByLevel !== undefined) {
      setGroupByLevel(saved.groupByLevel);
    } else if (saved.groupBySubind !== undefined) {
      setGroupByLevel(saved.groupBySubind ? "subindustry" : "none");
    }
  }, []);

  usePageState("valuation", getState, restoreState);

  // Built-in metrics (curated + universe + derived) grouped by category.
  // Uploaded fundamental columns remain a separate group in the picker.
  const [dataMetrics, setDataMetrics] = useState<string[]>(() => {
    const c = getTickersCacheSync();
    return c ? [...new Set(c.flatMap((t) => t.metrics || []))] : [];
  });
  useEffect(() => {
    let cancelled = false;
    getTickers()
      .then((ts) => { if (!cancelled) setDataMetrics([...new Set(ts.flatMap((t) => t.metrics || []))]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const metricGroups = useMemo(
    () => groupMetricsByCategory([...new Set([...Object.values(METRIC_GROUPS_BASE).flat(), ...DERIVED_METRICS, ...dataMetrics])]),
    [dataMetrics],
  );

  const { data: rawData = [], isLoading } = useQuery<any[]>({
    queryKey: ["valuation-trailing", metric, lookback],
    queryFn: () => getMetricTrailingAllTickers(metric, lookback),
  });

  const enrichedRows = useMemo<ValuationRow[]>(() => {
    return rawData
      .filter((row) => row.values.length > 20)
      .map((row) => {
        const { mean, std } = calcStats(row.values);
        const current = row.current;
        const zScore = current !== null && std > 0 ? (current - mean) / std : null;
        const histPctile =
          current !== null && row.values.length > 1
            ? (row.values.filter((v: number) => v < current).length / (row.values.length - 1)) * 100
            : current !== null && row.values.length === 1
            ? 50
            : null;
        const premium = current !== null && mean !== 0 ? ((current - mean) / mean) * 100 : null;
        return {
          ticker: row.ticker,
          name: row.name,
          economy: row.economy,
          sector: row.sector,
          subsector: row.subsector,
          industryGroup: row.industryGroup,
          industry: row.industry,
          subindustry: row.subindustry,
          current,
          mean5Y: mean,
          std5Y: std,
          zScore,
          histPctile,
          premium,
          values: row.values,
          dates: row.dates,
        };
      });
  }, [rawData]);

  const filteredRows = useMemo<ValuationRow[]>(() => {
    let rows = enrichedRows.filter((r) => r.current !== null);
    if (universeTickers) rows = rows.filter((r) => universeTickers.has(r.ticker));
    rows = applyClassFilters(rows, classFilters, search, manualTickers);
    rows.sort((a, b) => {
      const getValue = (row: ValuationRow): number => {
        switch (sortCol) {
          case "ticker":
            return 0;
          case "current":
            return row.current ?? (sortDir === "asc" ? Infinity : -Infinity);
          case "mean5Y":
            return row.mean5Y ?? (sortDir === "asc" ? Infinity : -Infinity);
          case "std5Y":
            return row.std5Y ?? (sortDir === "asc" ? Infinity : -Infinity);
          case "zScore":
            return row.zScore ?? (sortDir === "asc" ? Infinity : -Infinity);
          case "histPctile":
            return row.histPctile ?? (sortDir === "asc" ? Infinity : -Infinity);
          case "premium":
            return row.premium ?? (sortDir === "asc" ? Infinity : -Infinity);
          default:
            return row.zScore ?? (sortDir === "asc" ? Infinity : -Infinity);
        }
      };
      if (sortCol === "ticker")
        return sortDir === "asc" ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
      const va = getValue(a);
      const vb = getValue(b);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return rows;
  }, [enrichedRows, sortCol, sortDir, search, classFilters, manualTickers, universeTickers]);

  const groupedRows = useMemo<[string, ValuationRow[]][] | null>(() => {
    if (groupByLevel === "none") return null;
    const map = new Map<string, ValuationRow[]>();
    for (const row of filteredRows) {
      const key = (row as any)[groupByLevel] || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const avgZ = (rows: ValuationRow[]) => {
        const valid = rows.filter((r) => r.zScore !== null);
        return valid.length === 0 ? 0 : valid.reduce((acc, r) => acc + r.zScore!, 0) / valid.length;
      };
      return avgZ(a[1]) - avgZ(b[1]);
    });
  }, [filteredRows, groupByLevel]);

  const handleToggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const handleExportCsv = () => {
    const headers = [
      "Rank", "Ticker", "Name", "Subindustry", `Current ${metric}`,
      "5Y Mean", "5Y Std Dev", "Z-Score", "Pctile", "Premium/Disc %",
    ];
    const rows = filteredRows.map((r, i) =>
      [
        i + 1,
        r.ticker,
        `"${r.name}"`,
        `"${r.subindustry}"`,
        r.current?.toFixed(2) ?? "",
        r.mean5Y?.toFixed(2) ?? "",
        r.std5Y?.toFixed(2) ?? "",
        r.zScore?.toFixed(2) ?? "",
        r.histPctile?.toFixed(1) ?? "",
        r.premium?.toFixed(1) ?? "",
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `valuation_${metric.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const summaryStats = useMemo<SummaryStats | null>(() => {
    const valid = filteredRows.filter((r) => r.zScore !== null);
    if (valid.length === 0) return null;
    const cheapCount = valid.filter((r) => r.zScore! < -1).length;
    const fairCount = valid.filter((r) => r.zScore! >= -1 && r.zScore! <= 1).length;
    const richCount = valid.filter((r) => r.zScore! > 1).length;
    const sorted = [...valid].sort((a, b) => a.zScore! - b.zScore!);
    const medianZ = sorted[Math.floor(valid.length / 2)].zScore!;
    const avgZ = valid.reduce((acc, r) => acc + r.zScore!, 0) / valid.length;
    return { cheapCount, fairCount, richCount, medianZ, avgZ, total: valid.length };
  }, [filteredRows]);

  const SortHeader = ({ col, label, className = "" }: { col: string; label: string; className?: string }) => (
    <th className={`px-2 py-1.5 text-muted-foreground font-medium ${className}`}>
      <button
        className="inline-flex items-center gap-0.5 hover:text-foreground"
        onClick={() => handleSort(col)}
        data-testid={`sort-${col}`}
      >
        {label}
        <ArrowUpDown className="w-2.5 h-2.5" />
      </button>
    </th>
  );

  const renderRow = (row: ValuationRow, index: number) => (
    <tr
      key={row.ticker}
      className={`group border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer ${zScoreRowClass(row.zScore)}`}
      onClick={() => navigateToTicker(row.ticker)}
      data-testid={`val-row-${row.ticker}`}
    >
      <td className="px-2 py-1 text-muted-foreground font-mono tabular-nums text-center">
        {index + 1}
      </td>
      <td className="px-2 py-1 font-mono font-bold">
        <button
          className="text-primary hover:text-primary/80 hover:underline inline-flex items-center gap-0.5"
          onClick={(e) => { e.stopPropagation(); navigateToTicker(row.ticker); }}
        >
          {row.ticker}
          <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60" />
        </button>
      </td>
      <td className="px-2 py-1 text-foreground truncate max-w-[140px]">{row.name}</td>
      <td className="px-2 py-1 text-muted-foreground text-[10px] truncate">
        {row.subindustry.replace(" Equity REITs", "")}
      </td>
      <td className="px-2 py-1 text-right font-mono tabular-nums">
        {row.current?.toFixed(1) ?? "—"}
      </td>
      <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
        {row.mean5Y?.toFixed(1) ?? "—"}
      </td>
      <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground/60">
        {row.std5Y?.toFixed(2) ?? "—"}
      </td>
      <td className={`px-2 py-1 text-right font-mono tabular-nums ${zScoreTextClass(row.zScore)}`}>
        {row.zScore !== null ? row.zScore.toFixed(2) : "—"}
      </td>
      <td
        className={`px-2 py-1 text-right font-mono tabular-nums ${
          row.histPctile !== null
            ? row.histPctile < 20
              ? "text-green-400"
              : row.histPctile > 80
              ? "text-red-400"
              : "text-muted-foreground"
            : ""
        }`}
      >
        {row.histPctile !== null ? `${row.histPctile.toFixed(0)}%` : "—"}
      </td>
      <td
        className={`px-2 py-1 text-right font-mono tabular-nums ${
          row.premium !== null
            ? row.premium < -10
              ? "text-green-400"
              : row.premium > 10
              ? "text-red-400"
              : "text-muted-foreground"
            : ""
        }`}
      >
        {row.premium !== null
          ? `${row.premium > 0 ? "+" : ""}${row.premium.toFixed(1)}%`
          : "—"}
      </td>
      <td className="px-1 py-1">
        <Sparkline
          values={row.values}
          mean={row.mean5Y}
          std={row.std5Y}
          current={row.current}
        />
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col h-full bg-background" data-testid="valuation-page">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">Metric</span>
        <Select value={metric} onValueChange={setMetric}>
          <SelectTrigger
            className="h-6 text-[11px] w-[180px]"
            data-testid="val-metric-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[420px]">
            {metricGroups.map(({ category, metrics }) => (
              <div key={category}>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </div>
                {metrics.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </div>
            ))}
            {(() => {
              const customMetrics = getCustomFundamentalMetrics();
              return customMetrics.length > 0 ? (
                <React.Fragment>
                  <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                    Uploaded Fundamental
                  </div>
                  {customMetrics.map((m: string) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </React.Fragment>
              ) : null;
            })()}
          </SelectContent>
        </Select>

        <div className="h-5 w-px bg-border mx-1" />

        <span className="text-xs font-semibold text-muted-foreground">Lookback</span>
        <Select
          value={LOOKBACK_OPTIONS.find((o) => o.value === lookback) ? String(lookback) : "custom"}
          onValueChange={(v) => { if (v !== "custom") setLookback(parseInt(v)); }}
        >
          <SelectTrigger className="h-6 text-[11px] w-auto min-w-[120px]" data-testid="val-lookback">
            <SelectValue>
              {LOOKBACK_OPTIONS.find((o) => o.value === lookback)?.label ?? `${lookback}d`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LOOKBACK_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom...</SelectItem>
          </SelectContent>
        </Select>

        {!LOOKBACK_OPTIONS.find((o) => o.value === lookback) && (
          <Input
            type="number"
            className="h-6 text-[11px] w-[65px] font-mono px-1.5"
            value={lookback}
            min={20}
            max={10000}
            onChange={(e) => {
              const n = parseInt(e.target.value);
              if (n >= 20) setLookback(n);
            }}
            placeholder="days"
          />
        )}

        <div className="h-5 w-px bg-border mx-1" />

        <Select
          value={groupByLevel}
          onValueChange={(v) => { setGroupByLevel(v); setExpandedGroups(new Set()); }}
        >
          <SelectTrigger
            className="h-6 text-[11px] w-auto min-w-[155px]"
            data-testid="val-group-select"
          >
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No grouping</SelectItem>
            <SelectItem value="economy">Economy</SelectItem>
            <SelectItem value="sector">Sector</SelectItem>
            <SelectItem value="subsector">Subsector</SelectItem>
            <SelectItem value="industryGroup">Industry Group</SelectItem>
            <SelectItem value="industry">Industry</SelectItem>
            <SelectItem value="subindustry">Subindustry</SelectItem>
          </SelectContent>
        </Select>

        {summaryStats && (
          <div className="flex items-center gap-2 ml-auto mr-2">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 font-mono">
              Cheap: {summaryStats.cheapCount}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground font-mono">
              Fair: {summaryStats.fairCount}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 font-mono">
              Rich: {summaryStats.richCount}
            </span>
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              Med Z: {summaryStats.medianZ.toFixed(2)}
            </span>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 text-[11px]"
          onClick={handleExportCsv}
          data-testid="val-export"
        >
          <Download className="w-3 h-3" />
          CSV
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border/50 flex-wrap">
        <ClassificationFilters
          filters={classFilters}
          onFiltersChange={setClassFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={filteredRows.length}
          totalCount={enrichedRows.length}
          testIdPrefix="val"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Loading valuation data for all tickers...
          </div>
        ) : (
          <table className="w-full text-[11px]" data-testid="valuation-table">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                <th className="text-center px-2 py-1.5 w-8 text-muted-foreground font-medium">#</th>
                <SortHeader col="ticker" label="Ticker" className="text-left w-14" />
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium max-w-[140px]">
                  Name
                </th>
                <th className="text-left px-2 py-1.5 w-28 text-muted-foreground font-medium">
                  SubInd
                </th>
                <SortHeader col="current" label="Current" className="text-right" />
                <SortHeader col="mean5Y" label="Mean" className="text-right" />
                <SortHeader col="std5Y" label="Std" className="text-right" />
                <SortHeader col="zScore" label="Z-Score" className="text-right" />
                <SortHeader col="histPctile" label="Pctile" className="text-right" />
                <SortHeader col="premium" label="Prem/Disc" className="text-right" />
                <th className="text-center px-2 py-1.5 text-muted-foreground font-medium w-[130px]">
                  Trail
                </th>
              </tr>
            </thead>
            <tbody>
              {groupByLevel !== "none" && groupedRows
                ? groupedRows.map(([groupKey, groupRows]) => {
                    const isExpanded = expandedGroups.has(groupKey);
                    const validRows = groupRows.filter((r) => r.zScore !== null);
                    const avgZ =
                      validRows.length > 0
                        ? validRows.reduce((acc, r) => acc + r.zScore!, 0) / validRows.length
                        : null;
                    return (
                      <React.Fragment key={groupKey}>
                        <tr
                          className="bg-card/60 border-b border-border/40 cursor-pointer hover:bg-accent/20"
                          onClick={() => handleToggleGroup(groupKey)}
                        >
                          <td colSpan={11} className="px-2 py-1.5">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                              )}
                              <span className="text-[11px] font-semibold text-foreground">
                                {groupKey.replace(" Equity REITs", "")}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                ({groupRows.length})
                              </span>
                              {avgZ !== null && (
                                <span className={`text-[10px] font-mono ${zScoreTextClass(avgZ)}`}>
                                  Avg Z: {avgZ.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && groupRows.map((row, i) => renderRow(row, i))}
                      </React.Fragment>
                    );
                  })
                : filteredRows.map((row, i) => renderRow(row, i))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
