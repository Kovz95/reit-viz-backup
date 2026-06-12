import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getTickers,
  getDates,
  getTickerRaw,
  metricMultiplier,
  type TickerMeta,
  type TimeValue,
  type ClassifiedBase,
} from "@/lib/dataService";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { fetchStaticSeries, type DataPoint } from "@/lib/macroStatic";
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
  ChevronLeft,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  createChart,
  LineSeries,
  PriceScaleMode,
  type IChartApi,
  type Time,
  ColorType,
} from "lightweight-charts";
import ExportMenu from "@/components/ExportMenu";

// ---- Constants ----
const TREASURY_OPTIONS = [
  { id: "DGS10", label: "10Y Treasury" },
  { id: "DGS2", label: "2Y Treasury" },
  { id: "DGS5", label: "5Y Treasury" },
  { id: "DGS30", label: "30Y Treasury" },
];

const LOOKBACK_OPTIONS = [
  { label: "3 Year", value: 756 },
  { label: "5 Year", value: 1260 },
  { label: "7 Year", value: 1764 },
  { label: "10 Year", value: 2520 },
  { label: "All", value: 99999 },
];

// ---- Types ----
interface SpreadRow extends ClassifiedBase {
  divYield: number | null; // current, in %
  treasuryRate: number | null; // current, in %
  spread: number | null; // divYield - treasuryRate, in %
  mean: number | null;
  std: number | null;
  zScore: number | null;
  histPctile: number | null;
  spreadSeries: TimeValue[]; // full time series of spread
  sparkValues: number[]; // last N values for sparkline
}

// ---- Helpers ----
function computeStats(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function percentile(values: number[], current: number): number {
  if (values.length <= 1) return 50;
  const below = values.filter((v) => v < current).length;
  return (below / (values.length - 1)) * 100;
}

/** Compute dividend yield spread vs treasury for ALL tickers */
async function computeAllSpreads(
  treasuryId: string,
  lookbackDays: number
): Promise<SpreadRow[]> {
  const [tickers, dates, treasuryData] = await Promise.all([
    getTickers(),
    getDates(),
    fetchStaticSeries(treasuryId),
  ]);

  // Build treasury map: date string -> value (already in %)
  const treasuryMap = new Map<string, number>();
  for (const d of treasuryData) {
    treasuryMap.set(d.time, d.value);
  }

  const mult = metricMultiplier("Dividend Yield"); // 100

  const results: SpreadRow[] = [];
  // Process in batches
  const batchSize = 20;
  for (let b = 0; b < tickers.length; b += batchSize) {
    const batch = tickers.slice(b, b + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const base: SpreadRow = {
          ticker: t.ticker,
          name: t.name,
          economy: t.economy || "",
          sector: t.sector || "",
          subsector: t.subsector || "",
          industryGroup: t.industryGroup || "",
          industry: t.industry || "",
          subindustry: t.subindustry || "",
          divYield: null,
          treasuryRate: null,
          spread: null,
          mean: null,
          std: null,
          zScore: null,
          histPctile: null,
          spreadSeries: [],
          sparkValues: [],
        };

        try {
          const rawData = await getTickerRaw(t.ticker);
          if (!rawData["Dividend Yield"]) return base;

          const dyPairs = rawData["Dividend Yield"] as [number, number][];
          // Build spread series: DivYield(%) - Treasury(%)
          const series: TimeValue[] = [];
          for (const [idx, val] of dyPairs) {
            if (idx >= dates.length) continue;
            const dateStr = dates[idx];
            const tRate = treasuryMap.get(dateStr);
            if (tRate === undefined) continue;
            const dyPct = val * mult; // convert decimal to %
            series.push({ time: dateStr, value: +(dyPct - tRate).toFixed(4) });
          }

          if (series.length === 0) return base;

          // Apply lookback
          const lookbackSeries =
            lookbackDays >= series.length
              ? series
              : series.slice(-lookbackDays);
          const allValues = lookbackSeries.map((s) => s.value);
          const { mean, std } = computeStats(allValues);
          const current = series[series.length - 1].value;
          const zScore = std > 0 ? (current - mean) / std : null;
          const histPctile = percentile(allValues, current);

          // Current div yield and treasury
          const lastDyPair = dyPairs[dyPairs.length - 1];
          const lastDy = lastDyPair[1] * mult;
          // Find the latest treasury rate (walk back if exact date not available)
          let lastTreasury: number | null = null;
          for (let walkIdx = lastDyPair[0]; walkIdx >= Math.max(0, lastDyPair[0] - 10); walkIdx--) {
            if (walkIdx < dates.length && treasuryMap.has(dates[walkIdx])) {
              lastTreasury = treasuryMap.get(dates[walkIdx])!;
              break;
            }
          }

          base.divYield = lastDy;
          base.treasuryRate = lastTreasury;
          base.spread = current;
          base.mean = mean;
          base.std = std;
          base.zScore = zScore;
          base.histPctile = histPctile;
          base.spreadSeries = series;
          base.sparkValues = allValues.slice(-200);
        } catch {
          // skip
        }
        return base;
      })
    );
    results.push(...batchResults);
  }
  return results;
}

// ---- Sparkline component ----
function SpreadSparkline({
  values,
  mean,
  std,
  current,
  width = 130,
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

    // Mean ± 1 std band
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
    }

    // Spread line — color by z-score
    let lineColor = "rgba(14, 165, 233, 0.7)";
    if (mean !== null && std !== null && current !== null && std > 0) {
      const z = (current - mean) / std;
      // For spreads: wider (positive z) = more attractive = green
      // Tighter (negative z) = less attractive = red
      if (z > 1) lineColor = "rgba(34, 197, 94, 0.75)"; // wide = green
      else if (z < -1) lineColor = "rgba(239, 68, 68, 0.75)"; // tight = red
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
    return <span className="text-[10px] text-muted-foreground/40">—</span>;
  return <canvas ref={canvasRef} style={{ width, height }} />;
}

// ---- z-score color helpers (inverted: wide spread = green = attractive) ----
function spreadZColor(z: number | null): string {
  if (z === null) return "";
  // Wide spread (positive z) = cheap/attractive = green
  if (z >= 2) return "text-green-400 font-semibold";
  if (z >= 1) return "text-green-400";
  if (z >= 0.5) return "text-green-300/80";
  // Tight spread (negative z) = expensive = red
  if (z <= -2) return "text-red-400 font-semibold";
  if (z <= -1) return "text-red-400";
  if (z <= -0.5) return "text-red-300/80";
  return "text-muted-foreground";
}

function spreadZBg(z: number | null): string {
  if (z === null) return "";
  if (z >= 2) return "bg-green-500/10";
  if (z >= 1) return "bg-green-500/5";
  if (z <= -2) return "bg-red-500/10";
  if (z <= -1) return "bg-red-500/5";
  return "";
}

function pctileColor(pctile: number | null): string {
  if (pctile === null) return "";
  // High percentile = wide spread = attractive = green
  if (pctile > 80) return "text-green-400";
  if (pctile < 20) return "text-red-400";
  return "text-muted-foreground";
}

// ---- Detail chart for a single ticker ----
function SpreadDetailChart({
  row,
  treasuryLabel,
  onBack,
}: {
  row: SpreadRow;
  treasuryLabel: string;
  onBack: () => void;
}) {
  const [logScale, setLogScale] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || row.spreadSeries.length < 2) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(156,163,175,0.9)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: {
        vertLine: { color: "rgba(255,255,255,0.15)", width: 1 },
        horzLine: { color: "rgba(255,255,255,0.15)", width: 1 },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
      },
    });
    chartRef.current = chart;

    // Spread line
    const spreadLine = chart.addSeries(LineSeries, {
      color: "rgba(14, 165, 233, 0.9)",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(2) + "%" },
    });
    spreadLine.setData(
      row.spreadSeries.map((d) => ({
        time: d.time as Time,
        value: d.value,
      }))
    );

    // Mean line
    if (row.mean !== null) {
      const meanLine = chart.addSeries(LineSeries, {
        color: "rgba(14, 165, 233, 0.35)",
        lineWidth: 1,
        lineStyle: 2, // dashed
        priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(2) + "%" },
        crosshairMarkerVisible: false,
        lastValueVisible: true,
      });
      meanLine.setData(
        row.spreadSeries.map((d) => ({
          time: d.time as Time,
          value: row.mean!,
        }))
      );
    }

    // +/- 1 std bands
    if (row.mean !== null && row.std !== null) {
      const plusStd = chart.addSeries(LineSeries, {
        color: "rgba(14, 165, 233, 0.15)",
        lineWidth: 1,
        lineStyle: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      plusStd.setData(
        row.spreadSeries.map((d) => ({
          time: d.time as Time,
          value: row.mean! + row.std!,
        }))
      );

      const minusStd = chart.addSeries(LineSeries, {
        color: "rgba(14, 165, 233, 0.15)",
        lineWidth: 1,
        lineStyle: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      minusStd.setData(
        row.spreadSeries.map((d) => ({
          time: d.time as Time,
          value: row.mean! - row.std!,
        }))
      );

      // +/- 2 std
      const plus2Std = chart.addSeries(LineSeries, {
        color: "rgba(239, 68, 68, 0.15)",
        lineWidth: 1,
        lineStyle: 3,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      plus2Std.setData(
        row.spreadSeries.map((d) => ({
          time: d.time as Time,
          value: row.mean! + 2 * row.std!,
        }))
      );

      const minus2Std = chart.addSeries(LineSeries, {
        color: "rgba(239, 68, 68, 0.15)",
        lineWidth: 1,
        lineStyle: 3,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      });
      minus2Std.setData(
        row.spreadSeries.map((d) => ({
          time: d.time as Time,
          value: row.mean! - 2 * row.std!,
        }))
      );
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (container) {
        chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [row]);

  // Log scale
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.priceScale("right").applyOptions({
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      });
    } catch {}
  }, [logScale]);

  return (
    <div className="flex flex-col h-full" data-testid="spread-detail">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-card">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] gap-1"
          onClick={onBack}
          data-testid="spread-back-btn"
        >
          <ChevronLeft className="w-3 h-3" /> Back
        </Button>
        <span className="font-mono font-bold text-sm text-primary">
          {row.ticker}
        </span>
        <span className="text-xs text-muted-foreground">{row.name}</span>
        <span className="text-xs text-muted-foreground">—</span>
        <span className="text-xs text-foreground">
          Dividend Yield − {treasuryLabel} Spread
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span>
            Current:{" "}
            <span className={spreadZColor(row.zScore)}>
              {row.spread?.toFixed(2)}%
            </span>
          </span>
          <span className="text-muted-foreground">
            Mean: {row.mean?.toFixed(2)}%
          </span>
          <span className="text-muted-foreground">
            σ: {row.std?.toFixed(2)}%
          </span>
          <span className={spreadZColor(row.zScore)}>
            Z: {row.zScore?.toFixed(2)}
          </span>
          <span className={pctileColor(row.histPctile)}>
            Pctile: {row.histPctile?.toFixed(0)}%
          </span>
        </div>
        <Button
          variant={logScale ? "default" : "ghost"}
          size="sm"
          className="h-6 px-1.5 text-[10px] font-mono font-bold"
          onClick={() => setLogScale(!logScale)}
          data-testid="spread-log-scale"
          title="Toggle logarithmic price scale"
        >
          LOG
        </Button>
        <ExportMenu
          getChart={() => chartRef.current}
          label={`DivSpread_${row.ticker}_vs_${treasuryLabel}`}
        />
      </div>
      <div ref={chartContainerRef} className="flex-1 min-h-0" />
    </div>
  );
}

// ---- Main component ----
export default function DividendSpread() {
  const { universeTickers } = useUniverse();
  const [treasuryId, setTreasuryId] = useState("DGS10");
  const [lookback, setLookback] = useState(1260);
  const [sortCol, setSortCol] = useState<string>("spread");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const treasuryLabel =
    TREASURY_OPTIONS.find((t) => t.id === treasuryId)?.label ?? treasuryId;

  // ── Workspace save/restore ──
  const serializeDivSpread = useCallback(() => ({
    treasuryId,
    lookback,
    sortCol,
    sortDir,
    search,
    classFilters: serializeClassFilters(classFilters),
    manualTickers: [...manualTickers],
    selectedTicker,
  }), [treasuryId, lookback, sortCol, sortDir, search, classFilters, manualTickers, selectedTicker]);

  const restoreDivSpread = useCallback((state: any) => {
    if (state.treasuryId !== undefined) setTreasuryId(state.treasuryId);
    if (state.lookback !== undefined) setLookback(state.lookback);
    if (state.sortCol !== undefined) setSortCol(state.sortCol);
    if (state.sortDir !== undefined) setSortDir(state.sortDir);
    if (state.search !== undefined) setSearch(state.search);
    if (state.classFilters !== undefined) setClassFilters(deserializeClassFilters(state.classFilters));
    if (state.manualTickers !== undefined) setManualTickers(new Set(state.manualTickers));
    if (state.selectedTicker !== undefined) setSelectedTicker(state.selectedTicker);
  }, []);

  useWorkspaceTab("dividendSpread", serializeDivSpread, restoreDivSpread);

  // Fetch all spread data
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["dividend-spread", treasuryId, lookback],
    queryFn: () => computeAllSpreads(treasuryId, lookback),
  });

  // Filter + sort
  const sorted = useMemo(() => {
    let filtered = rows.filter((r) => r.spread !== null);
    if (universeTickers) filtered = filtered.filter(r => universeTickers.has(r.ticker));
    filtered = applyClassFilters(filtered, classFilters, search, manualTickers);
    return filtered.sort((a, b) => {
      const getter = (row: SpreadRow): number => {
        const inf = sortDir === "asc" ? Infinity : -Infinity;
        switch (sortCol) {
          case "ticker": return 0;
          case "divYield": return row.divYield ?? inf;
          case "treasuryRate": return row.treasuryRate ?? inf;
          case "spread": return row.spread ?? inf;
          case "mean": return row.mean ?? inf;
          case "zScore": return row.zScore ?? inf;
          case "histPctile": return row.histPctile ?? inf;
          default: return row.spread ?? inf;
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

  // Summary stats
  const summaryStats = useMemo(() => {
    const valid = sorted.filter((r) => r.zScore !== null);
    if (valid.length === 0) return null;
    const wideCount = valid.filter((r) => r.zScore! > 1).length;
    const fairCount = valid.filter(
      (r) => r.zScore! >= -1 && r.zScore! <= 1
    ).length;
    const tightCount = valid.filter((r) => r.zScore! < -1).length;
    const medianZ = [...valid]
      .sort((a, b) => a.zScore! - b.zScore!)
      [Math.floor(valid.length / 2)].zScore!;
    return { wideCount, fairCount, tightCount, medianZ, total: valid.length };
  }, [sorted]);

  // Selected detail row
  const selectedRow = useMemo(() => {
    if (!selectedTicker) return null;
    return rows.find((r) => r.ticker === selectedTicker) ?? null;
  }, [selectedTicker, rows]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir(col === "ticker" ? "asc" : "desc");
    }
  };

  const exportCSV = () => {
    const headers = [
      "Rank",
      "Ticker",
      "Name",
      "Subindustry",
      "Div Yield %",
      `${treasuryLabel} %`,
      "Spread %",
      "Mean %",
      "Z-Score",
      "Hist %ile",
    ];
    const lines = sorted.map((r, i) =>
      [
        i + 1,
        r.ticker,
        `"${r.name}"`,
        `"${r.subindustry}"`,
        r.divYield?.toFixed(2) ?? "",
        r.treasuryRate?.toFixed(2) ?? "",
        r.spread?.toFixed(2) ?? "",
        r.mean?.toFixed(2) ?? "",
        r.zScore?.toFixed(2) ?? "",
        r.histPctile?.toFixed(0) ?? "",
      ].join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dividend_spread_vs_${treasuryId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({
    col,
    label,
    className = "",
  }: {
    col: string;
    label: string;
    className?: string;
  }) => (
    <th
      className={`px-2 py-1.5 text-muted-foreground font-medium ${className}`}
    >
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

  // If a ticker is selected, show the detail chart
  if (selectedRow) {
    return (
      <SpreadDetailChart
        row={selectedRow}
        treasuryLabel={treasuryLabel}
        onBack={() => setSelectedTicker(null)}
      />
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-background"
      data-testid="dividend-spread-page"
    >
      {/* Controls bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">
          Rate
        </span>
        <Select value={treasuryId} onValueChange={setTreasuryId}>
          <SelectTrigger
            className="h-6 text-[11px] w-[120px]"
            data-testid="spread-rate-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TREASURY_OPTIONS.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="h-5 w-px bg-border mx-1" />

        <span className="text-xs font-semibold text-muted-foreground">
          Lookback
        </span>
        <Select
          value={String(lookback)}
          onValueChange={(v) => setLookback(parseInt(v))}
        >
          <SelectTrigger
            className="h-6 text-[11px] w-[90px]"
            data-testid="spread-lookback"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOOKBACK_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Summary badges */}
        {summaryStats && (
          <div className="flex items-center gap-2 ml-auto mr-2">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 font-mono">
              <TrendingUp className="w-2.5 h-2.5" /> Wide: {summaryStats.wideCount}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground font-mono">
              Fair: {summaryStats.fairCount}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 font-mono">
              <TrendingDown className="w-2.5 h-2.5" /> Tight: {summaryStats.tightCount}
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
          data-testid="spread-export"
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
          testIdPrefix="spread"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Computing dividend spreads for all tickers...
          </div>
        ) : (
          <table
            className="w-full text-[11px]"
            data-testid="spread-table"
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
                <SortHeader
                  col="divYield"
                  label="Div Yld"
                  className="text-right"
                />
                <SortHeader
                  col="treasuryRate"
                  label={treasuryLabel.replace(" Treasury", "")}
                  className="text-right"
                />
                <SortHeader
                  col="spread"
                  label="Spread"
                  className="text-right"
                />
                <SortHeader
                  col="mean"
                  label="Mean"
                  className="text-right"
                />
                <SortHeader
                  col="zScore"
                  label="Z-Score"
                  className="text-right"
                />
                <SortHeader
                  col="histPctile"
                  label="Hist%"
                  className="text-right"
                />
                <th className="text-center px-2 py-1.5 text-muted-foreground font-medium w-[140px]">
                  Trail
                </th>
                <th className="text-center px-2 py-1.5 text-muted-foreground font-medium w-10">
                  Flag
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const isExtreme =
                  row.zScore !== null &&
                  (row.zScore > 2 || row.zScore < -2);
                return (
                  <tr
                    key={row.ticker}
                    className={`group border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer ${spreadZBg(row.zScore)}`}
                    onClick={() => {
                      const url = new URL(window.location.href);
                      url.searchParams.set("ticker", row.ticker);
                      url.hash = "#/";
                      window.location.href = url.toString();
                    }}
                    data-testid={`spread-row-${row.ticker}`}
                  >
                    <td className="px-2 py-1 text-muted-foreground font-mono tabular-nums text-center">
                      {i + 1}
                    </td>
                    <td className="px-2 py-1 font-mono font-bold">
                      <button
                        className="text-primary hover:text-primary/80 hover:underline inline-flex items-center gap-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = new URL(window.location.href);
                          url.searchParams.set("ticker", row.ticker);
                          url.hash = "#/";
                          window.location.href = url.toString();
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
                      {row.divYield?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                      {row.treasuryRate?.toFixed(2) ?? "—"}%
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-mono tabular-nums font-semibold ${
                        row.spread !== null
                          ? row.spread > 0
                            ? "text-green-400"
                            : "text-red-400"
                          : ""
                      }`}
                    >
                      {row.spread !== null
                        ? `${row.spread > 0 ? "+" : ""}${row.spread.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                      {row.mean?.toFixed(2) ?? "—"}%
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-mono tabular-nums ${spreadZColor(row.zScore)}`}
                    >
                      {row.zScore !== null
                        ? row.zScore.toFixed(2)
                        : "—"}
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-mono tabular-nums ${pctileColor(row.histPctile)}`}
                    >
                      {row.histPctile !== null
                        ? `${row.histPctile.toFixed(0)}%`
                        : "—"}
                    </td>
                    <td className="px-1 py-1">
                      <SpreadSparkline
                        values={row.sparkValues}
                        mean={row.mean}
                        std={row.std}
                        current={row.spread}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      {isExtreme && (
                        <AlertTriangle
                          className={`w-3.5 h-3.5 mx-auto ${
                            row.zScore! > 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
