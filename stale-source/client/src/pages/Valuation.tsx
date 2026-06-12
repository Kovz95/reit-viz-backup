import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery } from "@tanstack/react-query";
import { getMetricTrailingAllTickers, getCustomFundamentalMetrics } from "@/lib/dataService";
import type { ClassifiedBase } from "@/lib/dataService";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useUniverse } from "@/lib/universeContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowUpDown,
  Search,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ---- Constants ----
const METRIC_OPTIONS = [
  "P/FFO FY2",
  "P/FFO LTM",
  "P/AFFO FY2",
  "P/AFFO LTM",
  "P/E FY2",
  "P/E LTM",
  "P/S FY2",
  "P/S LTM",
  "EV/EBITDA FY2",
  "EV/EBITDA LTM",
  "FFO Yield FY2",
  "FFO Yield LTM",
  "AFFO Yield FY2",
  "AFFO Yield LTM",
  "Dividend Yield",
  "Implied Cap Rate",
  "FY1 FFO Growth",
  "FY2 FFO Growth",
  "FY1 AFFO Growth",
  "FY2 AFFO Growth",
  "FY1 EPS Growth",
  "FY2 EPS Growth",
];

const LOOKBACK_PRESETS = [
  { label: "1 Year", value: 252 },
  { label: "2 Year", value: 504 },
  { label: "3 Year", value: 756 },
  { label: "5 Year", value: 1260 },
  { label: "7 Year", value: 1764 },
  { label: "10 Year", value: 2520 },
  { label: "All", value: 99999 },
];

// ---- Stats helpers ----
function computeStats(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

// ---- Types ----
interface ValRow extends ClassifiedBase {
  current: number | null;
  mean5Y: number | null;
  std5Y: number | null;
  zScore: number | null;
  histPctile: number | null;
  premium: number | null; // (current - mean) / mean * 100
  values: number[];
  dates: string[];
}

// ---- Sparkline with mean ± std bands ----
function ValSparkline({
  values,
  mean,
  std,
  current,
  width = 120,
  height = 32,
}: {
  values: number[];
  mean: number | null;
  std: number | null;
  current: number | null;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || values.length < 2) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Determine range — include mean ± 2 std if available
    let allVals = [...values];
    if (mean !== null && std !== null) {
      allVals.push(mean + 2 * std, mean - 2 * std);
    }
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const range = max - min || 1;
    const pad = 2;
    const plotW = width - 2 * pad;
    const plotH = height - 2 * pad;

    const toY = (v: number) => pad + plotH - ((v - min) / range) * plotH;
    const toX = (i: number) => pad + (i / (values.length - 1)) * plotW;

    ctx.clearRect(0, 0, width, height);

    // Mean ± 1 std band (shaded)
    if (mean !== null && std !== null) {
      const bandTop = toY(mean + std);
      const bandBot = toY(mean - std);
      ctx.fillStyle = "rgba(14, 165, 233, 0.07)";
      ctx.fillRect(pad, bandTop, plotW, bandBot - bandTop);

      // Mean line
      ctx.beginPath();
      ctx.strokeStyle = "rgba(14, 165, 233, 0.35)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      const my = toY(mean);
      ctx.moveTo(pad, my);
      ctx.lineTo(pad + plotW, my);
      ctx.stroke();
      ctx.setLineDash([]);

      // ± 1 std dashed
      ctx.beginPath();
      ctx.strokeStyle = "rgba(14, 165, 233, 0.15)";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 2]);
      const topY = toY(mean + std);
      ctx.moveTo(pad, topY);
      ctx.lineTo(pad + plotW, topY);
      ctx.stroke();
      ctx.beginPath();
      const botY = toY(mean - std);
      ctx.moveTo(pad, botY);
      ctx.lineTo(pad + plotW, botY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // P/FFO line — color based on z-score
    let lineColor = "rgba(14, 165, 233, 0.7)"; // neutral blue
    if (mean !== null && std !== null && current !== null && std > 0) {
      const z = (current - mean) / std;
      if (z < -1) lineColor = "rgba(34, 197, 94, 0.75)"; // cheap green
      else if (z > 1) lineColor = "rgba(239, 68, 68, 0.75)"; // expensive red
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

    // Current value dot
    if (current !== null) {
      const cx = pad + plotW;
      const cy = toY(current);
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
    }
  }, [values, mean, std, current, width, height]);

  if (values.length < 2)
    return (
      <span className="text-[10px] text-muted-foreground/40">—</span>
    );
  return <canvas ref={canvasRef} style={{ width, height }} />;
}

// ---- Z-score color ----
function zScoreColor(z: number | null): string {
  if (z === null) return "";
  if (z <= -2) return "text-green-400 font-semibold";
  if (z <= -1) return "text-green-400";
  if (z <= -0.5) return "text-green-300/80";
  if (z >= 2) return "text-red-400 font-semibold";
  if (z >= 1) return "text-red-400";
  if (z >= 0.5) return "text-red-300/80";
  return "text-muted-foreground";
}

function zScoreBg(z: number | null): string {
  if (z === null) return "";
  if (z <= -2) return "bg-green-500/10";
  if (z <= -1) return "bg-green-500/5";
  if (z >= 2) return "bg-red-500/10";
  if (z >= 1) return "bg-red-500/5";
  return "";
}

// ---- Main component ----
export default function Valuation() {
  const { universeTickers } = useUniverse();
  const [metric, setMetric] = useState("P/FFO FY2");
  const [lookback, setLookback] = useState(1260);
  const [sortCol, setSortCol] = useState<string>("zScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set()
  );
  const [groupByLevel, setGroupByLevel] = useState<string>("none");

  const serializeValuation = useCallback(() => ({
    metric,
    lookback,
    sortCol,
    sortDir,
    classFilters: serializeClassFilters(classFilters),
    manualTickers: [...manualTickers],
    groupByLevel,
  }), [metric, lookback, sortCol, sortDir, classFilters, manualTickers, groupByLevel]);

  const restoreValuation = useCallback((state: any) => {
    if (state.metric !== undefined) setMetric(state.metric);
    if (state.lookback !== undefined) setLookback(state.lookback);
    if (state.sortCol !== undefined) setSortCol(state.sortCol);
    if (state.sortDir !== undefined) setSortDir(state.sortDir);
    if (state.classFilters !== undefined) setClassFilters(deserializeClassFilters(state.classFilters));
    if (state.manualTickers !== undefined) setManualTickers(new Set(state.manualTickers));
    if (state.groupByLevel !== undefined) setGroupByLevel(state.groupByLevel);
    else if (state.groupBySubind !== undefined) setGroupByLevel(state.groupBySubind ? "subindustry" : "none");
  }, []);

  useWorkspaceTab("valuation", serializeValuation, restoreValuation);

  // Fetch trailing data for all tickers
  const { data: rawData = [], isLoading } = useQuery({
    queryKey: ["valuation-trailing", metric, lookback],
    queryFn: () => getMetricTrailingAllTickers(metric, lookback),
  });

  // Compute stats rows
  const rows: ValRow[] = useMemo(() => {
    return rawData
      .filter((r) => r.values.length > 20)
      .map((r) => {
        const { mean, std } = computeStats(r.values);
        const current = r.current;
        const zScore =
          current !== null && std > 0 ? (current - mean) / std : null;
        // Percentile: count at or below current / total observations
        const histPctile =
          current !== null && r.values.length > 0
            ? (r.values.filter((v) => v <= current).length /
                r.values.length) *
              100
            : null;
        const premium =
          current !== null && mean !== 0
            ? ((current - mean) / mean) * 100
            : null;

        return {
          ticker: r.ticker,
          name: r.name,
          economy: r.economy,
          sector: r.sector,
          subsector: r.subsector,
          industryGroup: r.industryGroup,
          industry: r.industry,
          subindustry: r.subindustry,
          current,
          mean5Y: mean,
          std5Y: std,
          zScore,
          histPctile,
          premium,
          values: r.values,
          dates: r.dates,
        };
      });
  }, [rawData]);

  // Filter + sort
  const sorted = useMemo(() => {
    let filtered = rows.filter((r) => r.current !== null);
    if (universeTickers) filtered = filtered.filter(r => universeTickers.has(r.ticker));
    filtered = applyClassFilters(filtered, classFilters, search, manualTickers);

    return filtered.sort((a, b) => {
      const getter = (row: ValRow): number => {
        switch (sortCol) {
          case "ticker":
            return 0; // handled differently
          case "current":
            return row.current ?? (sortDir === "asc" ? Infinity : -Infinity);
          case "mean5Y":
            return row.mean5Y ?? (sortDir === "asc" ? Infinity : -Infinity);
          case "std5Y":
            return row.std5Y ?? (sortDir === "asc" ? Infinity : -Infinity);
          case "zScore":
            return row.zScore ?? (sortDir === "asc" ? Infinity : -Infinity);
          case "histPctile":
            return (
              row.histPctile ?? (sortDir === "asc" ? Infinity : -Infinity)
            );
          case "premium":
            return row.premium ?? (sortDir === "asc" ? Infinity : -Infinity);
          default:
            return row.zScore ?? (sortDir === "asc" ? Infinity : -Infinity);
        }
      };

      if (sortCol === "ticker") {
        return sortDir === "asc"
          ? a.ticker.localeCompare(b.ticker)
          : b.ticker.localeCompare(a.ticker);
      }
      const av = getter(a);
      const bv = getter(b);
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortCol, sortDir, search, classFilters, manualTickers, universeTickers]);

  // Group by selected classification level
  const grouped = useMemo(() => {
    if (groupByLevel === "none") return null;
    const map = new Map<string, ValRow[]>();
    for (const r of sorted) {
      const key = (r as any)[groupByLevel] || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    // Sort groups by average z-score
    return Array.from(map.entries()).sort((a, b) => {
      const avgZ = (rows: ValRow[]) => {
        const valid = rows.filter((r) => r.zScore !== null);
        if (valid.length === 0) return 0;
        return valid.reduce((s, r) => s + r.zScore!, 0) / valid.length;
      };
      return avgZ(a[1]) - avgZ(b[1]);
    });
  }, [sorted, groupByLevel]);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const navigateToChart = useCallback((ticker: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("ticker", ticker);
    url.hash = "#/";
    window.location.href = url.toString();
  }, []);

  const exportCSV = () => {
    const headers = [
      "Rank",
      "Ticker",
      "Name",
      "Subindustry",
      `Current ${metric}`,
      "5Y Mean",
      "5Y Std Dev",
      "Z-Score",
      "Pctile",
      "Premium/Disc %",
    ];
    const lines = sorted.map((r, i) =>
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
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `valuation_${metric.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summary stats
  const summaryStats = useMemo(() => {
    const valid = sorted.filter((r) => r.zScore !== null);
    if (valid.length === 0) return null;
    const cheapCount = valid.filter((r) => r.zScore! < -1).length;
    const fairCount = valid.filter(
      (r) => r.zScore! >= -1 && r.zScore! <= 1
    ).length;
    const richCount = valid.filter((r) => r.zScore! > 1).length;
    const medianZ = [...valid]
      .sort((a, b) => a.zScore! - b.zScore!)
      [Math.floor(valid.length / 2)].zScore!;
    const avgZ =
      valid.reduce((s, r) => s + r.zScore!, 0) / valid.length;
    return { cheapCount, fairCount, richCount, medianZ, avgZ, total: valid.length };
  }, [sorted]);

  const SortHeader = ({
    col,
    label,
    className = "",
  }: {
    col: string;
    label: string;
    className?: string;
  }) => (
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

  const renderRow = (row: ValRow, idx: number) => (
    <tr
      key={row.ticker}
      className={`group border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer ${zScoreBg(row.zScore)}`}
      onClick={() => navigateToChart(row.ticker)}
      data-testid={`val-row-${row.ticker}`}
    >
      <td className="px-2 py-1 text-muted-foreground font-mono tabular-nums text-center">
        {idx + 1}
      </td>
      <td className="px-2 py-1 font-mono font-bold">
        <button
          className="text-primary hover:text-primary/80 hover:underline inline-flex items-center gap-0.5"
          onClick={(e) => {
            e.stopPropagation();
            navigateToChart(row.ticker);
          }}
        >
          {row.ticker}
          <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60" />
        </button>
      </td>
      <td className="px-2 py-1 text-foreground truncate max-w-[140px]">
        {row.name}
      </td>
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
      <td
        className={`px-2 py-1 text-right font-mono tabular-nums ${zScoreColor(row.zScore)}`}
      >
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
        <ValSparkline
          values={row.values}
          mean={row.mean5Y}
          std={row.std5Y}
          current={row.current}
        />
      </td>
    </tr>
  );

  return (
    <div
      className="flex flex-col h-full bg-background"
      data-testid="valuation-page"
    >
      {/* Controls bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">
          Metric
        </span>
        <Select value={metric} onValueChange={setMetric}>
          <SelectTrigger
            className="h-6 text-[11px] w-[130px]"
            data-testid="val-metric-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRIC_OPTIONS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
            {(() => { const cm = getCustomFundamentalMetrics(); return cm.length > 0 ? (
              <>
                <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Uploaded Fundamental</div>
                {cm.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </>
            ) : null; })()}
          </SelectContent>
        </Select>

        <div className="h-5 w-px bg-border mx-1" />

        <span className="text-xs font-semibold text-muted-foreground">
          Lookback
        </span>
        <Select
          value={LOOKBACK_PRESETS.find(p => p.value === lookback) ? String(lookback) : "custom"}
          onValueChange={(v) => { if (v !== "custom") setLookback(parseInt(v)); }}
        >
          <SelectTrigger
            className="h-6 text-[11px] w-[90px]"
            data-testid="val-lookback"
          >
            <SelectValue>
              {LOOKBACK_PRESETS.find(p => p.value === lookback)?.label ?? `${lookback}d`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LOOKBACK_PRESETS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom...</SelectItem>
          </SelectContent>
        </Select>
        {!LOOKBACK_PRESETS.find(p => p.value === lookback) && (
          <Input
            type="number"
            className="h-6 text-[11px] w-[65px] font-mono px-1.5"
            value={lookback}
            min={20}
            max={10000}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (v >= 20) setLookback(v);
            }}
            placeholder="days"
          />
        )}

        <div className="h-5 w-px bg-border mx-1" />

        <Select value={groupByLevel} onValueChange={(v) => { setGroupByLevel(v); setExpandedGroups(new Set()); }}>
          <SelectTrigger className="h-6 text-[11px] w-[120px]" data-testid="val-group-select">
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

        {/* Summary badges */}
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
          onClick={exportCSV}
          data-testid="val-export"
        >
          <Download className="w-3 h-3" />
          CSV
        </Button>
      </div>

      {/* Classification Filters Row */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border/50 flex-wrap">
        <ClassificationFilters
          filters={classFilters}
          onFiltersChange={setClassFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={sorted.length}
          totalCount={rows.length}
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
          <table
            className="w-full text-[11px]"
            data-testid="valuation-table"
          >
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                <th className="text-center px-2 py-1.5 w-8 text-muted-foreground font-medium">
                  #
                </th>
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
              {groupByLevel !== "none" && grouped
                ? grouped.map(([groupName, groupRows]) => {
                    const isOpen = expandedGroups.has(groupName);
                    const avgZ =
                      groupRows.filter((r) => r.zScore !== null).length > 0
                        ? groupRows
                            .filter((r) => r.zScore !== null)
                            .reduce((s, r) => s + r.zScore!, 0) /
                          groupRows.filter((r) => r.zScore !== null).length
                        : null;
                    return (
                      <React.Fragment key={groupName}>
                        <tr
                          className="bg-card/60 border-b border-border/40 cursor-pointer hover:bg-accent/20"
                          onClick={() => toggleGroup(groupName)}
                        >
                          <td
                            colSpan={11}
                            className="px-2 py-1.5"
                          >
                            <div className="flex items-center gap-2">
                              {isOpen ? (
                                <ChevronDown className="w-3 h-3 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                              )}
                              <span className="text-[11px] font-semibold text-foreground">
                                {groupName.replace(" Equity REITs", "")}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                ({groupRows.length})
                              </span>
                              {avgZ !== null && (
                                <span
                                  className={`text-[10px] font-mono ${zScoreColor(avgZ)}`}
                                >
                                  Avg Z: {avgZ.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isOpen &&
                          groupRows.map((row, i) => renderRow(row, i))}
                      </React.Fragment>
                    );
                  })
                : sorted.map((row, i) => renderRow(row, i))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
