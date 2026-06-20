// Reconstructed from recovered-bundle/DividendSpread-Ck9w3CYe.js on 2026-06-11
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppContext } from "@/lib/useAppContext";
import { makeDefaultFilters, serializeFilters, deserializeFilters } from "@/lib/classFilters";
import { useWorkspaceState } from "@/lib/useWorkspaceState";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType, LineSeries, PriceScaleMode } from "lightweight-charts";
import { ChevronLeft, TrendingUp, TrendingDown, Download, ExternalLink, ArrowUpDown, Zap } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import ClassificationFilters from "@/components/ClassificationFilters";
import { navigateToTicker } from "@/lib/navigateToTicker";
import ExportMenu from "@/components/ExportMenu";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { fetchGlobalDatesList } from "@/lib/fetchGlobalDatesList";
import { fetchMonthlySeasonality } from "@/lib/fetchMonthlySeasonality";
import { getDividendYieldMultiplier } from "@/lib/getDividendYieldMultiplier";
import { fetchTickerData } from "@/lib/fetchTickerData";
import { filterTickers } from "@/lib/classFilters";

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

interface SpreadStats {
  mean: number;
  std: number;
}

function computeStats(values: number[]): SpreadStats {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function computeHistPctile(values: number[], current: number): number {
  if (values.length <= 1) return 50;
  return (values.filter(v => v < current).length / (values.length - 1)) * 100;
}

interface SpreadRow {
  ticker: string;
  name: string;
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  industry: string;
  subindustry: string;
  divYield: number | null;
  treasuryRate: number | null;
  spread: number | null;
  mean: number | null;
  std: number | null;
  zScore: number | null;
  histPctile: number | null;
  spreadSeries: { time: string; value: number }[];
  sparkValues: number[];
}

async function loadSpreadData(treasuryId: string, lookback: number): Promise<SpreadRow[]> {
  const [workbookTickers, datesList, treasurySeries] = await Promise.all([
    fetchWorkbookTickers(),
    fetchGlobalDatesList(),
    fetchMonthlySeasonality(treasuryId),
  ]);
  const treasuryMap = new Map<string, number>();
  for (const item of treasurySeries) treasuryMap.set(item.time, item.value);
  const filledTreasury = new Map<string, number>();
  let lastValue: number | null = null;
  for (const date of datesList) {
    const v = treasuryMap.get(date);
    if (v !== undefined && Number.isFinite(v)) {
      lastValue = v;
      filledTreasury.set(date, v);
    } else if (lastValue !== null) {
      filledTreasury.set(date, lastValue);
    }
  }
  const multiplier = getDividendYieldMultiplier("Dividend Yield");
  const results: SpreadRow[] = [];
  const BATCH = 20;
  for (let i = 0; i < workbookTickers.length; i += BATCH) {
    const batch = workbookTickers.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map(async (ticker: any) => {
        const row: SpreadRow = {
          ticker: ticker.ticker,
          name: ticker.name,
          economy: ticker.economy || "",
          sector: ticker.sector || "",
          subsector: ticker.subsector || "",
          industryGroup: ticker.industryGroup || "",
          industry: ticker.industry || "",
          subindustry: ticker.subindustry || "",
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
          const data = await fetchTickerData(ticker.ticker);
          if (!data["Dividend Yield"]) return row;
          const divYieldSeries = data["Dividend Yield"];
          const spreadSeries: { time: string; value: number }[] = [];
          for (const [idx, val] of divYieldSeries) {
            if (idx >= datesList.length) continue;
            const date = datesList[idx];
            const tRate = filledTreasury.get(date);
            if (tRate === undefined) continue;
            const scaledYield = val * multiplier;
            spreadSeries.push({ time: date, value: +(scaledYield - tRate).toFixed(4) });
          }
          if (spreadSeries.length === 0) return row;
          const sliced = (lookback >= spreadSeries.length ? spreadSeries : spreadSeries.slice(-lookback)).map(s => s.value);
          const { mean, std } = computeStats(sliced);
          const current = spreadSeries[spreadSeries.length - 1].value;
          const zScore = std > 0 ? (current - mean) / std : null;
          const histPctile = computeHistPctile(sliced, current);
          const lastEntry = divYieldSeries[divYieldSeries.length - 1];
          const divYieldScaled = lastEntry[1] * multiplier;
          let treasuryRate: number | null = null;
          for (let c = lastEntry[0]; c >= Math.max(0, lastEntry[0] - 10); c--) {
            if (c < datesList.length && filledTreasury.has(datesList[c])) {
              treasuryRate = filledTreasury.get(datesList[c])!;
              break;
            }
          }
          row.divYield = divYieldScaled;
          row.treasuryRate = treasuryRate;
          row.spread = current;
          row.mean = mean;
          row.std = std;
          row.zScore = zScore;
          row.histPctile = histPctile;
          row.spreadSeries = spreadSeries;
          row.sparkValues = sliced.slice(-200);
        } catch {}
        return row;
      })
    );
    results.push(...batchResults);
  }
  return results;
}

interface SparklineCanvasProps {
  values: number[];
  mean: number | null;
  std: number | null;
  current: number | null;
  width?: number;
  height?: number;
}

function SparklineCanvas({ values, mean, std, current, width = 130, height = 32 }: SparklineCanvasProps) {
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
    let extended = [...values];
    if (mean !== null && std !== null) extended.push(mean + 2 * std, mean - 2 * std);
    const minVal = Math.min(...extended);
    const range = Math.max(...extended) - minVal || 1;
    const pad = 2;
    const w = width - 2 * pad;
    const h = height - 2 * pad;
    const toY = (v: number) => pad + h - ((v - minVal) / range) * h;
    const toX = (i: number) => pad + (i / (values.length - 1)) * w;
    ctx.clearRect(0, 0, width, height);
    if (mean !== null && std !== null) {
      const y1 = toY(mean + std);
      const y2 = toY(mean - std);
      ctx.fillStyle = "rgba(14, 165, 233, 0.07)";
      ctx.fillRect(pad, y1, w, y2 - y1);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(14, 165, 233, 0.35)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      const meanY = toY(mean);
      ctx.moveTo(pad, meanY);
      ctx.lineTo(pad + w, meanY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    let lineColor = "rgba(14, 165, 233, 0.7)";
    if (mean !== null && std !== null && current !== null && std > 0) {
      const z = (current - mean) / std;
      if (z > 1) lineColor = "rgba(34, 197, 94, 0.75)";
      else if (z < -1) lineColor = "rgba(239, 68, 68, 0.75)";
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
      const cx = pad + w;
      const cy = toY(current);
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
    }
  }, [values, mean, std, current, width, height]);

  if (values.length < 2) {
    return <span className="text-[10px] text-muted-foreground/40">—</span>;
  }
  return <canvas ref={canvasRef} style={{ width, height }} />;
}

function zScoreClass(z: number | null): string {
  if (z === null) return "";
  if (z >= 2) return "text-green-400 font-semibold";
  if (z >= 1) return "text-green-400";
  if (z >= 0.5) return "text-green-300/80";
  if (z <= -2) return "text-red-400 font-semibold";
  if (z <= -1) return "text-red-400";
  if (z <= -0.5) return "text-red-300/80";
  return "text-muted-foreground";
}

function zScoreRowBg(z: number | null): string {
  if (z === null) return "";
  if (z >= 2) return "bg-green-500/10";
  if (z >= 1) return "bg-green-500/5";
  if (z <= -2) return "bg-red-500/10";
  if (z <= -1) return "bg-red-500/5";
  return "";
}

function pctileClass(p: number | null): string {
  if (p === null) return "";
  if (p > 80) return "text-green-400";
  if (p < 20) return "text-red-400";
  return "text-muted-foreground";
}

interface SpreadDetailProps {
  row: SpreadRow;
  treasuryLabel: string;
  onBack: () => void;
}

function SpreadDetail({ row, treasuryLabel, onBack }: SpreadDetailProps) {
  const [logScale, setLogScale] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || row.spreadSeries.length < 2) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
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
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
    });
    chartRef.current = chart;
    chart.addSeries(LineSeries, {
      color: "rgba(14, 165, 233, 0.9)",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(2) + "%" },
    }).setData(row.spreadSeries.map(s => ({ time: s.time, value: s.value })));

    if (row.mean !== null) {
      chart.addSeries(LineSeries, {
        color: "rgba(14, 165, 233, 0.35)",
        lineWidth: 1,
        lineStyle: 2,
        priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(2) + "%" },
        crosshairMarkerVisible: false,
        lastValueVisible: true,
      }).setData(row.spreadSeries.map(s => ({ time: s.time, value: row.mean! })));
    }

    if (row.mean !== null && row.std !== null) {
      chart.addSeries(LineSeries, {
        color: "rgba(14, 165, 233, 0.15)",
        lineWidth: 1,
        lineStyle: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      }).setData(row.spreadSeries.map(s => ({ time: s.time, value: row.mean! + row.std! })));
      chart.addSeries(LineSeries, {
        color: "rgba(14, 165, 233, 0.15)",
        lineWidth: 1,
        lineStyle: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      }).setData(row.spreadSeries.map(s => ({ time: s.time, value: row.mean! - row.std! })));
      chart.addSeries(LineSeries, {
        color: "rgba(239, 68, 68, 0.15)",
        lineWidth: 1,
        lineStyle: 3,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      }).setData(row.spreadSeries.map(s => ({ time: s.time, value: row.mean! + 2 * row.std! })));
      chart.addSeries(LineSeries, {
        color: "rgba(239, 68, 68, 0.15)",
        lineWidth: 1,
        lineStyle: 3,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
      }).setData(row.spreadSeries.map(s => ({ time: s.time, value: row.mean! - 2 * row.std! })));
    }

    chart.timeScale().fitContent();
    const handleResize = () => {
      if (el) chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(el);
    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [row]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart) {
      try {
        chart.priceScale("right").applyOptions({
          mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        });
      } catch {}
    }
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
        <span className="font-mono font-bold text-sm text-primary">{row.ticker}</span>
        <span className="text-xs text-muted-foreground">{row.name}</span>
        <span className="text-xs text-muted-foreground">—</span>
        <span className="text-xs text-foreground">Dividend Yield − {treasuryLabel} Spread</span>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span>
            Current:{" "}
            <span className={zScoreClass(row.zScore)}>{row.spread?.toFixed(2)}%</span>
          </span>
          <span className="text-muted-foreground">Mean: {row.mean?.toFixed(2)}%</span>
          <span className="text-muted-foreground">σ: {row.std?.toFixed(2)}%</span>
          <span className={zScoreClass(row.zScore)}>Z: {row.zScore?.toFixed(2)}</span>
          <span className={pctileClass(row.histPctile)}>Pctile: {row.histPctile?.toFixed(0)}%</span>
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
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}

export default function DividendSpread() {
  const { universeTickers } = useAppContext();
  const [treasuryId, setTreasuryId] = useState("DGS10");
  const [lookback, setLookback] = useState(1260);
  const [sortCol, setSortCol] = useState("spread");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [classFilters, setClassFilters] = useState(makeDefaultFilters);
  const [manualTickers, setManualTickers] = useState(new Set<string>());
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const treasuryLabel = TREASURY_OPTIONS.find(t => t.id === treasuryId)?.label ?? treasuryId;

  const getState = useCallback(
    () => ({
      treasuryId,
      lookback,
      sortCol,
      sortDir,
      search,
      classFilters: serializeFilters(classFilters),
      manualTickers: [...manualTickers],
      selectedTicker,
    }),
    [treasuryId, lookback, sortCol, sortDir, search, classFilters, manualTickers, selectedTicker]
  );

  const setState = useCallback((s: any) => {
    if (s.treasuryId !== undefined) setTreasuryId(s.treasuryId);
    if (s.lookback !== undefined) setLookback(s.lookback);
    if (s.sortCol !== undefined) setSortCol(s.sortCol);
    if (s.sortDir !== undefined) setSortDir(s.sortDir);
    if (s.search !== undefined) setSearch(s.search);
    if (s.classFilters !== undefined) setClassFilters(deserializeFilters(s.classFilters));
    if (s.manualTickers !== undefined) setManualTickers(new Set(s.manualTickers));
    if (s.selectedTicker !== undefined) setSelectedTicker(s.selectedTicker);
  }, []);

  useWorkspaceState("dividendSpread", getState, setState);

  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ["dividend-spread", treasuryId, lookback],
    queryFn: () => loadSpreadData(treasuryId, lookback),
  });

  const sortedRows = useMemo(() => {
    let rows = allRows.filter(r => r.spread !== null);
    if (universeTickers) rows = rows.filter(r => universeTickers.has(r.ticker));
    rows = filterTickers(rows, classFilters, search, manualTickers);
    rows.sort((a, b) => {
      const sentinel = sortDir === "asc" ? Infinity : -Infinity;
      const getValue = (row: SpreadRow) => {
        switch (sortCol) {
          case "ticker": return 0;
          case "divYield": return row.divYield ?? sentinel;
          case "treasuryRate": return row.treasuryRate ?? sentinel;
          case "spread": return row.spread ?? sentinel;
          case "mean": return row.mean ?? sentinel;
          case "zScore": return row.zScore ?? sentinel;
          case "histPctile": return row.histPctile ?? sentinel;
          default: return row.spread ?? sentinel;
        }
      };
      if (sortCol === "ticker") {
        return sortDir === "asc" ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
      }
      const va = getValue(a);
      const vb = getValue(b);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return rows;
  }, [allRows, sortCol, sortDir, search, classFilters, manualTickers, universeTickers]);

  const summary = useMemo(() => {
    const withZ = sortedRows.filter(r => r.zScore !== null);
    if (withZ.length === 0) return null;
    const wideCount = withZ.filter(r => r.zScore! > 1).length;
    const fairCount = withZ.filter(r => r.zScore! >= -1 && r.zScore! <= 1).length;
    const tightCount = withZ.filter(r => r.zScore! < -1).length;
    const medianZ = [...withZ].sort((a, b) => a.zScore! - b.zScore!)[Math.floor(withZ.length / 2)].zScore!;
    return { wideCount, fairCount, tightCount, medianZ, total: withZ.length };
  }, [sortedRows]);

  const detailRow = useMemo(
    () => (selectedTicker ? allRows.find(r => r.ticker === selectedTicker) ?? null : null),
    [selectedTicker, allRows]
  );

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir(col === "ticker" ? "asc" : "desc");
    }
  };

  const handleExportCSV = () => {
    const headers = ["Rank", "Ticker", "Name", "Subindustry", "Div Yield %", `${treasuryLabel} %`, "Spread %", "Mean %", "Z-Score", "Hist %ile"];
    const rows = sortedRows.map((r, i) =>
      [
        i + 1, r.ticker, `"${r.name}"`, `"${r.subindustry}"`,
        r.divYield?.toFixed(2) ?? "", r.treasuryRate?.toFixed(2) ?? "",
        r.spread?.toFixed(2) ?? "", r.mean?.toFixed(2) ?? "",
        r.zScore?.toFixed(2) ?? "", r.histPctile?.toFixed(0) ?? "",
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dividend_spread_vs_${treasuryId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  if (detailRow) {
    return (
      <SpreadDetail
        row={detailRow}
        treasuryLabel={treasuryLabel}
        onBack={() => setSelectedTicker(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-background" data-testid="dividend-spread-page">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">Rate</span>
        <Select value={treasuryId} onValueChange={setTreasuryId}>
          <SelectTrigger className="h-6 text-[11px] w-[120px]" data-testid="spread-rate-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TREASURY_OPTIONS.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="h-5 w-px bg-border mx-1" />
        <span className="text-xs font-semibold text-muted-foreground">Lookback</span>
        <Select value={String(lookback)} onValueChange={v => setLookback(parseInt(v))}>
          <SelectTrigger className="h-6 text-[11px] w-[90px]" data-testid="spread-lookback">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOOKBACK_OPTIONS.map(o => (
              <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="h-5 w-px bg-border mx-1" />
        {summary && (
          <div className="flex items-center gap-2 ml-auto mr-2">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 font-mono">
              <TrendingUp className="w-2.5 h-2.5" /> Wide: {summary.wideCount}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground font-mono">
              Fair: {summary.fairCount}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 font-mono">
              <TrendingDown className="w-2.5 h-2.5" /> Tight: {summary.tightCount}
            </span>
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              Med Z: {summary.medianZ.toFixed(2)}
            </span>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 text-[11px]"
          onClick={handleExportCSV}
          data-testid="spread-export"
        >
          <Download className="w-3 h-3" />
          CSV
        </Button>
      </div>
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border/50 flex-wrap">
        <ClassificationFilters
          filters={classFilters}
          onFiltersChange={setClassFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={sortedRows.length}
          totalCount={allRows.length}
          testIdPrefix="spread"
        />
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Computing dividend spreads for all tickers...
          </div>
        ) : (
          <table className="w-full text-[11px]" data-testid="spread-table">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                <th className="text-center px-2 py-1.5 w-8 text-muted-foreground font-medium">#</th>
                <SortHeader col="ticker" label="Ticker" className="text-left w-14" />
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium max-w-[140px]">Name</th>
                <th className="text-left px-2 py-1.5 w-28 text-muted-foreground font-medium">SubInd</th>
                <SortHeader col="divYield" label="Div Yld" className="text-right" />
                <SortHeader col="treasuryRate" label={treasuryLabel.replace(" Treasury", "")} className="text-right" />
                <SortHeader col="spread" label="Spread" className="text-right" />
                <SortHeader col="mean" label="Mean" className="text-right" />
                <SortHeader col="zScore" label="Z-Score" className="text-right" />
                <SortHeader col="histPctile" label="Hist%" className="text-right" />
                <th className="text-center px-2 py-1.5 text-muted-foreground font-medium w-[140px]">Trail</th>
                <th className="text-center px-2 py-1.5 text-muted-foreground font-medium w-10">Flag</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => {
                const isExtreme = row.zScore !== null && (row.zScore > 2 || row.zScore < -2);
                return (
                  <tr
                    key={row.ticker}
                    className={`group border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer ${zScoreRowBg(row.zScore)}`}
                    onClick={() => navigateToTicker(row.ticker)}
                    data-testid={`spread-row-${row.ticker}`}
                  >
                    <td className="px-2 py-1 text-muted-foreground font-mono tabular-nums text-center">{idx + 1}</td>
                    <td className="px-2 py-1 font-mono font-bold">
                      <button
                        className="text-primary hover:text-primary/80 hover:underline inline-flex items-center gap-0.5"
                        onClick={e => { e.stopPropagation(); navigateToTicker(row.ticker); }}
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
                      {row.divYield?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                      {row.treasuryRate?.toFixed(2) ?? "—"}%
                    </td>
                    <td className={`px-2 py-1 text-right font-mono tabular-nums font-semibold ${row.spread !== null ? (row.spread > 0 ? "text-green-400" : "text-red-400") : ""}`}>
                      {row.spread !== null
                        ? `${row.spread > 0 ? "+" : ""}${row.spread.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-muted-foreground">
                      {row.mean?.toFixed(2) ?? "—"}%
                    </td>
                    <td className={`px-2 py-1 text-right font-mono tabular-nums ${zScoreClass(row.zScore)}`}>
                      {row.zScore !== null ? row.zScore.toFixed(2) : "—"}
                    </td>
                    <td className={`px-2 py-1 text-right font-mono tabular-nums ${pctileClass(row.histPctile)}`}>
                      {row.histPctile !== null ? `${row.histPctile.toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-1 py-1">
                      <SparklineCanvas
                        values={row.sparkValues}
                        mean={row.mean}
                        std={row.std}
                        current={row.spread}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      {isExtreme && (
                        <Zap
                          className={`w-3.5 h-3.5 mx-auto ${row.zScore! > 0 ? "text-green-400" : "text-red-400"}`}
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
