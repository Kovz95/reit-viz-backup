import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getCustomFundamentalMetrics } from "@/lib/dataService";
import { fetchMacroCatalog } from "@/lib/macroStatic";
import { fetchPairwiseCorrelation, fetchMatrixCorrelation } from "@/lib/correlationEngine";
import { useUniverse } from "@/lib/universeContext";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  HistogramSeries,
  PriceScaleMode,
} from "lightweight-charts";
import type { IChartApi, Time } from "lightweight-charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Check,
  Search,
  Download,
  Grid3X3,
  TrendingUp,
  BarChart3,
  Activity,
  Maximize2,
  Minimize2,
  Globe,
  Loader2,
} from "lucide-react";
import ExportMenu from "@/components/ExportMenu";

// ── Types ──
interface TickerMeta {
  ticker: string;
  name: string;
  subindustry: string;
}

interface MacroSeriesMeta {
  id: string;
  label: string;
  category: string;
  unit: string;
  freq: string;
}

interface PairwiseResult {
  summary: {
    correlation: number;
    rSquared: number;
    beta: number;
    alpha: number;
    observations: number;
    mode: string;
    autoCorrelationA: number;
    autoCorrelationB: number;
    effectiveN: number;
    tStat: number;
    pValue: number;
  };
  rolling: { time: string; value: number }[];
  multiWindowRolling: Record<number, { time: string; value: number }[]>;
  crossCorrelation: { lag: number; value: number }[];
  acfA: { lag: number; value: number }[];
  acfB: { lag: number; value: number }[];
  scatter: { x: number; y: number; date: string }[];
  levelsA: { time: string; value: number }[];
  levelsB: { time: string; value: number }[];
}

interface MatrixResult {
  labels: string[];
  matrix: number[][];
  pValues: number[][];
  observations: number;
  dateRange: { from: string; to: string };
  mode: string;
}

// ── Chart options ──
const CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid as const, color: "transparent" },
    textColor: "#7a8a9e",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
  },
  grid: {
    vertLines: { color: "rgba(255,255,255,0.04)" },
    horzLines: { color: "rgba(255,255,255,0.04)" },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
  timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: false },
  handleScroll: true,
  handleScale: true,
};

const STOCK_METRICS = [
  "close", "open", "high", "low",
  "EPS FY1", "EPS FY2", "EPS LTM",
  "FFO FY1", "FFO FY2", "FFO LTM",
  "AFFO FY1", "AFFO FY2", "AFFO LTM",
  "Dividend", "Dividend Yield",
  "P/E LTM", "P/E FY2",
  "EV/EBITDA LTM", "EV/EBITDA FY2",
  "P/FFO LTM", "P/FFO FY2",
  "P/AFFO LTM", "P/AFFO FY2",
  "FFO Yield LTM", "FFO Yield FY2",
  "AFFO Yield LTM", "AFFO Yield FY2",
  "FY1 FFO Growth", "FY2 FFO Growth",
  "FY1 AFFO Growth", "FY2 AFFO Growth",
  "FY1 EPS Growth", "FY2 EPS Growth",
  "Implied Cap Rate",
  "P/S LTM", "P/S FY2",
  "Enterprise Value",
  "EBITDA LTM", "EBITDA FY1", "EBITDA FY2",
  "Sales LTM", "Sales FY1", "Sales FY2",
  "Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M",
  "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
  "% off 52wk High", "% off 52wk Low",
  "Bull%", "Bear%",
];

function formatSpec(spec: string): string {
  if (spec.startsWith("MACRO:")) return spec.replace("MACRO:", "");
  return spec;
}

const COLORS = {
  primary: "#0ea5e9",
  secondary: "#f59e0b",
  positive: "#22c55e",
  negative: "#ef4444",
  purple: "#a855f7",
  cyan: "#06b6d4",
  pink: "#ec4899",
  teal: "#14b8a6",
};

const MULTI_WINDOW_COLORS: Record<number, string> = {
  30: "#ec4899",
  60: "#0ea5e9",
  120: "#22c55e",
  252: "#f59e0b",
};

// ── Helpers ──

function corrColor(val: number): string {
  if (val >= 0.7) return "#22c55e";
  if (val >= 0.3) return "#86efac";
  if (val >= -0.3) return "#94a3b8";
  if (val >= -0.7) return "#fca5a5";
  return "#ef4444";
}

function corrBgColor(val: number): string {
  const absVal = Math.abs(val);
  if (val > 0) return `rgba(34, 197, 94, ${absVal * 0.4})`;
  if (val < 0) return `rgba(239, 68, 68, ${absVal * 0.4})`;
  return "transparent";
}

// ── Simple LWC chart wrapper ──
function MiniChart({
  data,
  color,
  height,
  title,
  showZeroLine,
  histogram,
  secondData,
  secondColor,
  thirdData,
  thirdColor,
  fourthData,
  fourthColor,
  bandUpper,
  bandLower,
  bandColor,
  isMaximized,
  onMaximize,
  chartId,
}: {
  data: { time: string; value: number }[];
  color: string;
  height: number;
  title: string;
  showZeroLine?: boolean;
  histogram?: boolean;
  secondData?: { time: string; value: number }[];
  secondColor?: string;
  thirdData?: { time: string; value: number }[];
  thirdColor?: string;
  fourthData?: { time: string; value: number }[];
  fourthColor?: string;
  bandUpper?: { time: string; value: number }[];
  bandLower?: { time: string; value: number }[];
  bandColor?: string;
  isMaximized?: boolean;
  onMaximize?: (id: string | null) => void;
  chartId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [logScale, setLogScale] = useState(false);

  // Use flex-height: measure the container instead of using a fixed height
  const effectiveHeight = isMaximized ? undefined : height;

  useEffect(() => {
    const el = ref.current;
    if (!el || data.length === 0) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }

    const h = el.clientHeight || height;
    const chart = createChart(el, { ...CHART_OPTIONS, width: el.clientWidth, height: h });
    chartRef.current = chart;

    if (histogram) {
      const series = chart.addSeries(HistogramSeries, {
        color,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(data.map(d => ({
        time: d.time as Time,
        value: d.value,
        color: d.value >= 0 ? COLORS.positive : COLORS.negative,
      })));
    } else {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 3,
        title: title.split(" ").slice(0, 2).join(" "),
      });
      series.setData(data.map(d => ({ time: d.time as Time, value: d.value })));
    }

    if (secondData && secondData.length > 0) {
      const s2 = chart.addSeries(LineSeries, {
        color: secondColor || COLORS.secondary,
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 3,
      });
      s2.setData(secondData.map(d => ({ time: d.time as Time, value: d.value })));
    }
    if (thirdData && thirdData.length > 0) {
      const s3 = chart.addSeries(LineSeries, {
        color: thirdColor || COLORS.positive,
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerRadius: 3,
      });
      s3.setData(thirdData.map(d => ({ time: d.time as Time, value: d.value })));
    }
    if (fourthData && fourthData.length > 0) {
      const s4 = chart.addSeries(LineSeries, {
        color: fourthColor || COLORS.purple,
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerRadius: 3,
      });
      s4.setData(fourthData.map(d => ({ time: d.time as Time, value: d.value })));
    }

    // Confidence interval bands (dashed, semi-transparent)
    if (bandUpper && bandUpper.length > 0) {
      const sBandUp = chart.addSeries(LineSeries, {
        color: bandColor || "rgba(255,255,255,0.2)",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      sBandUp.setData(bandUpper.map(d => ({ time: d.time as Time, value: d.value })));
    }
    if (bandLower && bandLower.length > 0) {
      const sBandLo = chart.addSeries(LineSeries, {
        color: bandColor || "rgba(255,255,255,0.2)",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      sBandLo.setData(bandLower.map(d => ({ time: d.time as Time, value: d.value })));
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (chartRef.current && el) {
        chartRef.current.applyOptions({ width: el.clientWidth, height: el.clientHeight || h });
      }
    });
    ro.observe(el);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [data, secondData, thirdData, fourthData, bandUpper, bandLower, color, height, histogram, isMaximized]);

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
    <div
      className={`border border-border/30 flex flex-col ${
        isMaximized ? "fixed inset-0 z-50 bg-background" : "min-h-0"
      }`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onMaximize && chartId) onMaximize(isMaximized ? null : chartId);
      }}
    >
      <div className="flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <div className="flex-1" />
        <button
          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${
            logScale
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground/60 hover:text-muted-foreground bg-transparent"
          }`}
          onClick={(e) => { e.stopPropagation(); setLogScale(!logScale); }}
          title="Toggle logarithmic scale"
        >
          LOG
        </button>
        {onMaximize && chartId && (
          <button
            className="text-muted-foreground/60 hover:text-muted-foreground p-0.5"
            onClick={(e) => { e.stopPropagation(); onMaximize(isMaximized ? null : chartId); }}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        )}
        <ExportMenu
          getChart={() => chartRef.current}
          label={`Correlation_${title}`}
        />
      </div>
      <div ref={ref} className={isMaximized ? "flex-1 min-h-0" : ""} style={isMaximized ? undefined : { height }} />
    </div>
  );
}

// ── Correlation heatmap matrix ──
function HeatmapMatrix({
  matrix,
  labels,
  pValues,
}: {
  matrix: number[][];
  labels: string[];
  pValues: number[][];
}) {
  return (
    <div className="overflow-auto">
      <table className="text-[10px] font-mono border-collapse">
        <thead>
          <tr>
            <th className="p-1 border border-border/30 bg-card/50 sticky left-0 z-10" />
            {labels.map((l, i) => (
              <th key={i} className="p-1 border border-border/30 bg-card/50 text-muted-foreground whitespace-nowrap max-w-[80px] truncate" title={l}>
                {formatSpec(l)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="p-1 border border-border/30 bg-card/50 font-semibold text-muted-foreground whitespace-nowrap sticky left-0 z-10" title={labels[i]}>
                {formatSpec(labels[i])}
              </td>
              {row.map((val, j) => (
                <td
                  key={j}
                  className="p-1 border border-border/30 text-center"
                  style={{ backgroundColor: i === j ? "rgba(255,255,255,0.05)" : corrBgColor(val) }}
                  title={`${formatSpec(labels[i])} × ${formatSpec(labels[j])}: ${val.toFixed(4)} (p=${pValues[i][j].toFixed(4)})`}
                >
                  <span style={{ color: i === j ? "rgba(255,255,255,0.3)" : corrColor(val) }}>
                    {i === j ? "1.00" : val.toFixed(2)}
                  </span>
                  {i !== j && pValues[i][j] > 0.05 && (
                    <span className="text-[8px] text-muted-foreground/40 block">ns</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ACF Bar Chart (canvas) ──
function ACFChart({
  data,
  nObs,
  title,
  height = 120,
}: {
  data: { lag: number; value: number }[];
  nObs: number;
  title: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;
    const pad = { top: 10, bottom: 20, left: 35, right: 10 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // Draw zero line
    const yCenter = pad.top + plotH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, yCenter);
    ctx.lineTo(w - pad.right, yCenter);
    ctx.stroke();

    // Draw significance bands (95%)
    const se = 1 / Math.sqrt(nObs);
    const sigUpper = yCenter - (1.96 * se) * (plotH / 2);
    const sigLower = yCenter + (1.96 * se) * (plotH / 2);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, sigUpper);
    ctx.lineTo(w - pad.right, sigUpper);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.left, sigLower);
    ctx.lineTo(w - pad.right, sigLower);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw bars
    const barWidth = Math.max(3, plotW / data.length - 2);
    data.forEach((d, i) => {
      const x = pad.left + (i / data.length) * plotW + (plotW / data.length - barWidth) / 2;
      const barH = d.value * (plotH / 2);
      const y = d.value >= 0 ? yCenter - barH : yCenter;
      ctx.fillStyle = Math.abs(d.value) > 1.96 * se ? "#0ea5e9" : "rgba(14, 165, 233, 0.4)";
      ctx.fillRect(x, y, barWidth, Math.abs(barH));
    });

    // Y-axis labels
    ctx.fillStyle = "#7a8a9e";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("1.0", pad.left - 4, pad.top + 6);
    ctx.fillText("0", pad.left - 4, yCenter + 3);
    ctx.fillText("-1.0", pad.left - 4, h - pad.bottom);

    // X-axis labels
    ctx.textAlign = "center";
    for (let i = 0; i < data.length; i += 5) {
      const x = pad.left + ((i + 0.5) / data.length) * plotW;
      ctx.fillText(String(data[i].lag), x, h - 4);
    }
  }, [data, nObs, height]);

  return (
    <div className="border border-border/30">
      <div className="px-3 py-1 bg-card/50">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />
    </div>
  );
}

// ── Cross-correlation Bar Chart (canvas) ──
function CrossCorrChart({
  data,
  labelA,
  labelB,
  height = 140,
  hideTitle,
}: {
  data: { lag: number; value: number }[];
  labelA: string;
  labelB: string;
  height?: number;
  hideTitle?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;
    const pad = { top: 10, bottom: 22, left: 35, right: 10 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    const yCenter = pad.top + plotH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, yCenter);
    ctx.lineTo(w - pad.right, yCenter);
    ctx.stroke();

    // Vertical line at lag=0
    const lag0Idx = data.findIndex(d => d.lag === 0);
    if (lag0Idx >= 0) {
      const x0 = pad.left + ((lag0Idx + 0.5) / data.length) * plotW;
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.moveTo(x0, pad.top);
      ctx.lineTo(x0, h - pad.bottom);
      ctx.stroke();
    }

    const barWidth = Math.max(3, plotW / data.length - 1);
    data.forEach((d, i) => {
      const x = pad.left + (i / data.length) * plotW + (plotW / data.length - barWidth) / 2;
      const barH = d.value * (plotH / 2);
      const y = d.value >= 0 ? yCenter - barH : yCenter;
      ctx.fillStyle = d.lag === 0
        ? "#f59e0b"
        : d.value >= 0 ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)";
      ctx.fillRect(x, y, barWidth, Math.abs(barH));
    });

    // Labels
    ctx.fillStyle = "#7a8a9e";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("1.0", pad.left - 4, pad.top + 6);
    ctx.fillText("0", pad.left - 4, yCenter + 3);
    ctx.fillText("-1.0", pad.left - 4, h - pad.bottom);

    ctx.textAlign = "center";
    for (let i = 0; i < data.length; i += 5) {
      const x = pad.left + ((i + 0.5) / data.length) * plotW;
      ctx.fillText(String(data[i].lag), x, h - 4);
    }

    // Lag direction labels
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText(`← ${labelA} leads`, pad.left + 2, h - pad.bottom + 14);
    ctx.textAlign = "right";
    ctx.fillText(`${labelB} leads →`, w - pad.right - 2, h - pad.bottom + 14);
  }, [data, labelA, labelB, height]);

  if (hideTitle) {
    return <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />;
  }
  return (
    <div className="border border-border/30">
      <div className="px-3 py-1 bg-card/50">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Cross-Correlation (Lag {data[0]?.lag} to {data[data.length - 1]?.lag})
        </span>
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />
    </div>
  );
}

// ── Scatter canvas ──
function ScatterCanvas({
  data,
  labelX,
  labelY,
  beta,
  alpha,
  height = 250,
  hideTitle,
}: {
  data: { x: number; y: number; date: string }[];
  labelX: string;
  labelY: string;
  beta: number;
  alpha: number;
  height?: number;
  hideTitle?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;
    const pad = { top: 10, bottom: 30, left: 50, right: 10 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // Compute bounds
    const xs = data.map(d => d.x);
    const ys = data.map(d => d.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const xPad = xRange * 0.05;
    const yPad = yRange * 0.05;

    const toX = (v: number) => pad.left + ((v - xMin + xPad) / (xRange + 2 * xPad)) * plotW;
    const toY = (v: number) => pad.top + plotH - ((v - yMin + yPad) / (yRange + 2 * yPad)) * plotH;

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      const x = pad.left + (i / 4) * plotW;
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, h - pad.bottom); ctx.stroke();
    }

    // Zero lines
    if (xMin < 0 && xMax > 0) {
      const zx = toX(0);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(zx, pad.top); ctx.lineTo(zx, h - pad.bottom); ctx.stroke();
    }
    if (yMin < 0 && yMax > 0) {
      const zy = toY(0);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, zy); ctx.lineTo(w - pad.right, zy); ctx.stroke();
    }

    // Regression line
    const regX1 = xMin - xPad;
    const regX2 = xMax + xPad;
    const regY1 = alpha + beta * regX1;
    const regY2 = alpha + beta * regX2;
    ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(toX(regX1), toY(regY1));
    ctx.lineTo(toX(regX2), toY(regY2));
    ctx.stroke();
    ctx.setLineDash([]);

    // Points
    data.forEach(d => {
      ctx.beginPath();
      ctx.arc(toX(d.x), toY(d.y), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(14, 165, 233, 0.5)";
      ctx.fill();
    });

    // Axis labels
    ctx.fillStyle = "#7a8a9e";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(labelX, pad.left + plotW / 2, h - 4);
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const val = yMin - yPad + (yRange + 2 * yPad) * (1 - i / 4);
      ctx.fillText(val.toFixed(4), pad.left - 4, pad.top + (i / 4) * plotH + 3);
    }
  }, [data, beta, alpha, height, labelX, labelY]);

  if (hideTitle) {
    return <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />;
  }
  return (
    <div className="border border-border/30">
      <div className="px-3 py-1 bg-card/50">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Scatter: {labelY} vs {labelX}
        </span>
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />
    </div>
  );
}

// ── Chart maximize wrapper for canvas-based charts ──
function CanvasChartWrapper({
  title,
  children,
  chartId,
  isMaximized,
  onMaximize,
  height,
}: {
  title: string;
  children: (h: number) => React.ReactNode;
  chartId: string;
  isMaximized: boolean;
  onMaximize: (id: string | null) => void;
  height: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(height);

  useEffect(() => {
    if (!isMaximized || !containerRef.current) {
      setMeasuredHeight(height);
      return;
    }
    // When maximized, measure the content area
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setMeasuredHeight(h);
      }
    });
    ro.observe(containerRef.current);
    // Initial measure
    const h = containerRef.current.clientHeight;
    if (h > 0) setMeasuredHeight(h);
    return () => ro.disconnect();
  }, [isMaximized, height]);

  return (
    <div
      className={`border border-border/30 flex flex-col ${
        isMaximized ? "fixed inset-0 z-50 bg-background" : ""
      }`}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onMaximize(isMaximized ? null : chartId);
      }}
    >
      <div className="flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <div className="flex-1" />
        <button
          className="text-muted-foreground/60 hover:text-muted-foreground p-0.5"
          onClick={(e) => { e.stopPropagation(); onMaximize(isMaximized ? null : chartId); }}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </button>
      </div>
      <div ref={containerRef} className={isMaximized ? "flex-1 min-h-0" : ""}>
        {children(isMaximized ? measuredHeight : height)}
      </div>
    </div>
  );
}

// ── Series Picker Component ──
function SeriesPicker({
  label,
  value,
  onChange,
  tickers,
  macroCatalog,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tickers: TickerMeta[];
  macroCatalog: MacroSeriesMeta[];
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"stock" | "macro">(
    value.startsWith("MACRO:") ? "macro" : "stock"
  );
  const [ticker, setTicker] = useState(() => {
    if (!value.startsWith("MACRO:")) {
      const parts = value.split(":");
      return parts[0] || "";
    }
    return "";
  });
  const [metric, setMetric] = useState(() => {
    if (value.startsWith("MACRO:")) return value.replace("MACRO:", "");
    const parts = value.split(":");
    return parts.slice(1).join(":") || "close";
  });
  const [tickerOpen, setTickerOpen] = useState(false);

  const macroByCat = useMemo(() => {
    const map: Record<string, MacroSeriesMeta[]> = {};
    for (const s of macroCatalog) {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    }
    return map;
  }, [macroCatalog]);

  const handleApply = useCallback(() => {
    if (sourceType === "macro") {
      if (metric) onChange(`MACRO:${metric}`);
    } else {
      const resolvedMetric = (STOCK_METRICS.includes(metric) || getCustomFundamentalMetrics().includes(metric)) ? metric : "close";
      if (ticker) onChange(`${ticker}:${resolvedMetric}`);
    }
    setOpen(false);
  }, [sourceType, ticker, metric, onChange]);

  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">{label}</div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 justify-between px-2 text-[11px] font-mono"
            data-testid={testId}
          >
            <span className="truncate">{value ? formatSpec(value) : "Select series..."}</span>
            <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50 flex-shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-2 space-y-2" align="start">
          {/* Source type toggle */}
          <div className="flex gap-1">
            <Button
              variant={sourceType === "stock" ? "default" : "secondary"}
              size="sm"
              className="flex-1 h-6 text-[10px]"
              onClick={() => { setSourceType("stock"); setMetric("close"); }}
            >
              <TrendingUp className="w-3 h-3 mr-1" /> Stock
            </Button>
            <Button
              variant={sourceType === "macro" ? "default" : "secondary"}
              size="sm"
              className="flex-1 h-6 text-[10px]"
              onClick={() => { setSourceType("macro"); setMetric(""); }}
            >
              <Activity className="w-3 h-3 mr-1" /> Macro
            </Button>
          </div>

          {sourceType === "stock" ? (
            <>
              {/* Ticker picker */}
              <Popover open={tickerOpen} onOpenChange={setTickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full h-6 justify-between px-2 text-[11px] font-mono">
                    {ticker || "Select ticker"}
                    <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search ticker..." className="h-7 text-[11px]" />
                    <CommandList className="max-h-[200px]">
                      <CommandEmpty>No ticker found.</CommandEmpty>
                      <CommandGroup>
                        {tickers.map(t => (
                          <CommandItem
                            key={t.ticker}
                            value={`${t.ticker} ${t.name}`}
                            onSelect={() => { setTicker(t.ticker); setTickerOpen(false); }}
                            className="text-[11px]"
                          >
                            <Check className={`w-3 h-3 mr-1 flex-shrink-0 ${ticker === t.ticker ? "opacity-100" : "opacity-0"}`} />
                            <span className="font-mono font-bold mr-1">{t.ticker}</span>
                            <span className="text-muted-foreground truncate text-[10px]">{t.name.slice(0, 20)}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {/* Metric picker */}
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger className="h-6 text-[11px]">
                  <SelectValue placeholder="Metric" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {STOCK_METRICS.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                  {(() => { const cm = getCustomFundamentalMetrics(); return cm.length > 0 ? (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Uploaded Fundamental</div>
                      {cm.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </>
                  ) : null; })()}
                </SelectContent>
              </Select>
            </>
          ) : (
            <div className="max-h-[200px] overflow-y-auto space-y-0.5">
              {Object.entries(macroByCat).map(([cat, items]) => (
                <div key={cat}>
                  <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-1 py-0.5">{cat}</div>
                  {items.map(s => (
                    <button
                      key={s.id}
                      className={`flex items-center w-full text-left px-2 py-0.5 text-[11px] rounded ${metric === s.id ? "bg-primary/20 text-primary" : "hover:bg-accent"}`}
                      onClick={() => setMetric(s.id)}
                    >
                      {s.label}
                      <span className="text-[9px] text-muted-foreground/50 ml-auto">{s.freq}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <Button size="sm" className="w-full h-6 text-[10px]" onClick={handleApply}>Apply</Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ── MAIN CORRELATION PAGE ──
// ═══════════════════════════════════════════════════════════════
const ROLLING_WINDOWS = [30, 60, 120, 252] as const;
const ROLLING_WINDOW_LABELS: Record<number, string> = {
  30: "30d",
  60: "60d",
  120: "120d",
  252: "252d (1Y)",
};

export default function Correlation() {
  const [activeTab, setActiveTab] = useState<"pairwise" | "matrix" | "universe">("pairwise");

  // Pairwise state
  const [specA, setSpecA] = useState("SPG:close");
  const [specB, setSpecB] = useState("MACRO:DGS10");
  const [corrMode, setCorrMode] = useState("returns");
  const [corrWindow, setCorrWindow] = useState("60");
  // Which rolling windows are visible (user can toggle)
  const [visibleWindows, setVisibleWindows] = useState<Set<number>>(new Set([60, 252]));

  // Matrix state
  const [matrixSpecs, setMatrixSpecs] = useState<string[]>([
    "SPG:close", "O:close", "PLD:close", "PSA:close", "MACRO:DGS10", "MACRO:VIXCLS",
  ]);
  const [matrixMode, setMatrixMode] = useState("returns");
  const [matrixWindow, setMatrixWindow] = useState("252");
  const [newMatrixSpec, setNewMatrixSpec] = useState("");

  const toggleWindow = useCallback((w: number) => {
    setVisibleWindows(prev => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  }, []);

  // Universe matrix state
  const { universeTickers, isFiltered, filteredCount, totalCount, filteredTickersList } = useUniverse();
  const [uniMode, setUniMode] = useState("returns");
  const [uniWindow, setUniWindow] = useState("252");
  const [uniMetric, setUniMetric] = useState("close");

  const serializeCorrelation = useCallback(() => ({
    activeTab,
    specA,
    specB,
    corrMode,
    corrWindow,
    matrixSpecs,
    matrixMode,
    matrixWindow,
    visibleWindows: Array.from(visibleWindows),
    uniMode,
    uniWindow,
    uniMetric,
  }), [activeTab, specA, specB, corrMode, corrWindow, matrixSpecs, matrixMode, matrixWindow, visibleWindows, uniMode, uniWindow, uniMetric]);

  const restoreCorrelation = useCallback((state: any) => {
    if (state.activeTab !== undefined) setActiveTab(state.activeTab);
    if (state.specA !== undefined) setSpecA(state.specA);
    if (state.specB !== undefined) setSpecB(state.specB);
    if (state.corrMode !== undefined) setCorrMode(state.corrMode);
    if (state.corrWindow !== undefined) setCorrWindow(state.corrWindow);
    if (state.matrixSpecs !== undefined) setMatrixSpecs(state.matrixSpecs);
    if (state.matrixMode !== undefined) setMatrixMode(state.matrixMode);
    if (state.matrixWindow !== undefined) setMatrixWindow(state.matrixWindow);
    if (state.visibleWindows !== undefined) setVisibleWindows(new Set(state.visibleWindows));
    if (state.uniMode !== undefined) setUniMode(state.uniMode);
    if (state.uniWindow !== undefined) setUniWindow(state.uniWindow);
    if (state.uniMetric !== undefined) setUniMetric(state.uniMetric);
  }, []);

  useWorkspaceTab("correlation", serializeCorrelation, restoreCorrelation);

  // Fetch tickers + macro catalog
  const { data: tickers = [] } = useQuery<TickerMeta[]>({ queryKey: ["tickers-list"], queryFn: async () => {
    const { getTickers } = await import("@/lib/dataService");
    return getTickers();
  } });
  const { data: macroCatalog = [] } = useQuery<MacroSeriesMeta[]>({ queryKey: ["macro-catalog"], queryFn: fetchMacroCatalog });

  // Build specs from universe tickers
  const universeSpecs = useMemo(() => {
    if (isFiltered && universeTickers) {
      return filteredTickersList.map(t => `${t.ticker}:${uniMetric}`);
    }
    return tickers.map(t => `${t.ticker}:${uniMetric}`);
  }, [universeTickers, isFiltered, filteredTickersList, tickers, uniMetric]);

  // Pairwise query
  const { data: pairwise, isLoading: pairLoading } = useQuery<PairwiseResult>({
    queryKey: ["correlation-pairwise", specA, specB, corrWindow, corrMode],
    queryFn: () => fetchPairwiseCorrelation(specA, specB, parseInt(corrWindow) || 60, corrMode),
    enabled: activeTab === "pairwise" && !!specA && !!specB,
  });

  // Matrix query
  const { data: matrixData, isLoading: matrixLoading } = useQuery<MatrixResult>({
    queryKey: ["correlation-matrix", matrixSpecs.join(","), matrixMode, matrixWindow],
    queryFn: () => fetchMatrixCorrelation(matrixSpecs, matrixMode, matrixWindow),
    enabled: activeTab === "matrix" && matrixSpecs.length >= 2,
  });

  // Universe matrix query
  const { data: uniMatrixData, isLoading: uniMatrixLoading } = useQuery<MatrixResult>({
    queryKey: ["correlation-universe-matrix", universeSpecs.join(","), uniMode, uniWindow],
    queryFn: () => fetchMatrixCorrelation(universeSpecs, uniMode, uniWindow),
    enabled: activeTab === "universe" && universeSpecs.length >= 2,
  });

  // CSV export for pairwise rolling
  const exportPairwiseCSV = useCallback(() => {
    if (!pairwise) return;
    const header = "Date,Rolling_Correlation";
    const lines = pairwise.rolling.map(d => `${d.time},${d.value}`);
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `correlation_${formatSpec(specA)}_${formatSpec(specB)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [pairwise, specA, specB]);

  // CSV export for matrix
  const exportMatrixCSV = useCallback(() => {
    if (!matrixData) return;
    const labels = matrixData.labels.map(formatSpec);
    const header = `,${labels.join(",")}`;
    const lines = matrixData.matrix.map((row, i) =>
      `${labels[i]},${row.map(v => v.toFixed(4)).join(",")}`
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `correlation_matrix.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [matrixData]);

  // CSV export for universe matrix
  const exportUniMatrixCSV = useCallback(() => {
    if (!uniMatrixData) return;
    const labels = uniMatrixData.labels.map(formatSpec);
    const header = `,${labels.join(",")}`;
    const lines = uniMatrixData.matrix.map((row, i) =>
      `${labels[i]},${row.map(v => v.toFixed(4)).join(",")}`
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `universe_correlation_matrix.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [uniMatrixData]);

  const addMatrixSpec = useCallback((spec: string) => {
    if (spec && !matrixSpecs.includes(spec)) {
      setMatrixSpecs(prev => [...prev, spec]);
    }
  }, [matrixSpecs]);

  const removeMatrixSpec = useCallback((spec: string) => {
    setMatrixSpecs(prev => prev.filter(s => s !== spec));
  }, []);

  return (
    <div className="flex h-full bg-background" data-testid="correlation-page">
      {/* Sidebar */}
      <div className="w-[250px] border-r border-border bg-card flex flex-col flex-shrink-0 overflow-y-auto">
        {/* Tab toggle */}
        <div className="px-2 py-2 border-b border-border">
          <div className="flex gap-0.5">
            <Button
              variant={activeTab === "pairwise" ? "default" : "secondary"}
              size="sm"
              className="flex-1 h-7 text-[10px] px-1.5"
              onClick={() => setActiveTab("pairwise")}
              data-testid="tab-pairwise"
            >
              <BarChart3 className="w-3 h-3 mr-0.5" /> Pair
            </Button>
            <Button
              variant={activeTab === "matrix" ? "default" : "secondary"}
              size="sm"
              className="flex-1 h-7 text-[10px] px-1.5"
              onClick={() => setActiveTab("matrix")}
              data-testid="tab-matrix"
            >
              <Grid3X3 className="w-3 h-3 mr-0.5" /> Matrix
            </Button>
            <Button
              variant={activeTab === "universe" ? "default" : "secondary"}
              size="sm"
              className="flex-1 h-7 text-[10px] px-1.5"
              onClick={() => setActiveTab("universe")}
              data-testid="tab-universe-corr"
            >
              <Globe className="w-3 h-3 mr-0.5" /> Univ
            </Button>
          </div>
        </div>

        {activeTab === "pairwise" ? (
          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            <SeriesPicker
              label="Series A"
              value={specA}
              onChange={setSpecA}
              tickers={tickers}
              macroCatalog={macroCatalog}
              testId="corr-series-a"
            />
            <SeriesPicker
              label="Series B"
              value={specB}
              onChange={setSpecB}
              tickers={tickers}
              macroCatalog={macroCatalog}
              testId="corr-series-b"
            />

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Correlation Mode
              </div>
              <Select value={corrMode} onValueChange={setCorrMode}>
                <SelectTrigger className="h-6 text-[11px]" data-testid="corr-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="returns">Log Returns</SelectItem>
                  <SelectItem value="changes">Simple Changes</SelectItem>
                  <SelectItem value="levels">Levels</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Rolling Windows
              </div>
              {ROLLING_WINDOWS.map(w => (
                <label key={w} className="flex items-center gap-2 cursor-pointer group">
                  <Checkbox
                    checked={visibleWindows.has(w)}
                    onCheckedChange={() => toggleWindow(w)}
                    className="h-3.5 w-3.5"
                    data-testid={`corr-window-${w}`}
                  />
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: MULTI_WINDOW_COLORS[w] }} />
                    {ROLLING_WINDOW_LABELS[w]}
                  </span>
                </label>
              ))}
            </div>

            {/* Quick presets */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Quick Pairs</div>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "SPG vs 10Y", a: "SPG:close", b: "MACRO:DGS10" },
                  { label: "O vs Mtg30", a: "O:close", b: "MACRO:MORTGAGE30US" },
                  { label: "PLD vs VIX", a: "PLD:close", b: "MACRO:VIXCLS" },
                  { label: "SPG vs O", a: "SPG:close", b: "O:close" },
                  { label: "EQR vs Starts", a: "EQR:close", b: "MACRO:HOUST5F" },
                  { label: "PSA vs CPI", a: "PSA:close", b: "MACRO:CPIAUCSL" },
                ].map(p => (
                  <Button key={p.label} variant="ghost" size="sm"
                    className="h-5 px-2 text-[10px]"
                    onClick={() => { setSpecA(p.a); setSpecB(p.b); }}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5"
              onClick={exportPairwiseCSV} disabled={!pairwise}>
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          </div>
        ) : activeTab === "matrix" ? (
          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Matrix Series ({matrixSpecs.length})
              </div>
              <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                {matrixSpecs.map(spec => (
                  <div key={spec} className="flex items-center gap-1 px-1 py-0.5 rounded text-[11px] hover:bg-accent group">
                    <span className="truncate flex-1 font-mono">{formatSpec(spec)}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-destructive"
                      onClick={() => removeMatrixSpec(spec)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <SeriesPicker
              label="Add Series"
              value={newMatrixSpec}
              onChange={(v) => { addMatrixSpec(v); setNewMatrixSpec(""); }}
              tickers={tickers}
              macroCatalog={macroCatalog}
              testId="matrix-add-series"
            />

            {/* Quick matrix presets */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Presets</div>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "REITs + Rates", specs: ["SPG:close", "O:close", "PLD:close", "PSA:close", "MACRO:DGS10", "MACRO:DGS2", "MACRO:MORTGAGE30US"] },
                  { label: "REITs + Housing", specs: ["EQR:close", "AVB:close", "MAA:close", "CPT:close", "MACRO:HOUST5F", "MACRO:PERMIT5", "MACRO:COMPU"] },
                  { label: "REITs + Macro", specs: ["SPG:close", "O:close", "PLD:close", "MACRO:DGS10", "MACRO:VIXCLS", "MACRO:CPIAUCSL", "MACRO:UNRATE"] },
                  { label: "Net Lease", specs: ["O:close", "NNN:close", "EPRT:close", "ADC:close", "MACRO:DGS10"] },
                ].map(p => (
                  <Button key={p.label} variant="ghost" size="sm"
                    className="h-5 px-2 text-[10px]"
                    onClick={() => setMatrixSpecs(p.specs)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Mode</div>
              <Select value={matrixMode} onValueChange={setMatrixMode}>
                <SelectTrigger className="h-6 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="returns">Log Returns</SelectItem>
                  <SelectItem value="changes">Simple Changes</SelectItem>
                  <SelectItem value="levels">Levels</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Lookback</div>
              <Select value={matrixWindow} onValueChange={setMatrixWindow}>
                <SelectTrigger className="h-6 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="120">120 days</SelectItem>
                  <SelectItem value="252">252 days (1Y)</SelectItem>
                  <SelectItem value="504">504 days (2Y)</SelectItem>
                  <SelectItem value="1260">1260 days (5Y)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5"
              onClick={exportMatrixCSV} disabled={!matrixData}>
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          </div>
        ) : (
          /* Universe tab sidebar */
          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            <div className="border border-border/30 rounded p-2 bg-card/30">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-1">Universe</div>
              <div className="text-sm font-mono font-bold text-primary">
                {isFiltered ? filteredCount : totalCount} tickers
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isFiltered ? `Filtered from ${totalCount} total` : "All tickers (no filter)"}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Metric</div>
              <Select value={uniMetric} onValueChange={setUniMetric}>
                <SelectTrigger className="h-6 text-[11px]" data-testid="uni-corr-metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="close">Close Price</SelectItem>
                  <SelectItem value="Dividend Yield">Div Yield</SelectItem>
                  <SelectItem value="P/FFO FY2">P/FFO FY2</SelectItem>
                  <SelectItem value="P/AFFO FY2">P/AFFO FY2</SelectItem>
                  <SelectItem value="FFO Yield FY2">FFO Yield FY2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Mode</div>
              <Select value={uniMode} onValueChange={setUniMode}>
                <SelectTrigger className="h-6 text-[11px]" data-testid="uni-corr-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="returns">Log Returns</SelectItem>
                  <SelectItem value="changes">Simple Changes</SelectItem>
                  <SelectItem value="levels">Levels</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Lookback</div>
              <Select value={uniWindow} onValueChange={setUniWindow}>
                <SelectTrigger className="h-6 text-[11px]" data-testid="uni-corr-window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="120">120 days</SelectItem>
                  <SelectItem value="252">252 days (1Y)</SelectItem>
                  <SelectItem value="504">504 days (2Y)</SelectItem>
                  <SelectItem value="1260">1260 days (5Y)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ticker list preview */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Tickers ({universeSpecs.length})
              </div>
              <div className="space-y-0 max-h-[300px] overflow-y-auto border border-border/20 rounded">
                {universeSpecs.map(spec => (
                  <div key={spec} className="px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-accent/30 border-b border-border/10 last:border-b-0">
                    {formatSpec(spec)}
                  </div>
                ))}
              </div>
            </div>

            <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5"
              onClick={exportUniMatrixCSV} disabled={!uniMatrixData}>
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {activeTab === "pairwise" ? (
          <PairwiseView
            data={pairwise}
            loading={pairLoading}
            specA={specA}
            specB={specB}
            mode={corrMode}
            visibleWindows={visibleWindows}
          />
        ) : activeTab === "matrix" ? (
          <MatrixView
            data={matrixData}
            loading={matrixLoading}
          />
        ) : (
          <UniverseMatrixView
            data={uniMatrixData}
            loading={uniMatrixLoading}
            tickerCount={universeSpecs.length}
          />
        )}
      </div>
    </div>
  );
}

// ── Methodology Panel ──
function MethodologyPanel({ mode }: { mode: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/30 rounded bg-card/20">
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="methodology-toggle"
      >
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Methodology &amp; Interpretation Guide</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 text-[11px] text-muted-foreground leading-relaxed">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Pearson vs Spearman */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">Pearson vs Spearman</div>
              <div>Pearson measures linear association between two series. Spearman uses rank ordering, making it robust to outliers and nonlinearity. If they diverge by more than ~0.15, the relationship may be driven by a few extreme observations or be nonlinear.</div>
            </div>
            {/* Fisher CI */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">Fisher-Transform Confidence Intervals</div>
              <div>The dashed lines on the rolling correlation chart show the 95% confidence interval using the Fisher z-transformation. Narrow bands indicate a precise estimate; wide bands suggest the window may be too short or the relationship too noisy to trust.</div>
            </div>
            {/* ADF & Stationarity */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">ADF Stationarity Test</div>
              <div>The Augmented Dickey-Fuller test checks whether each series has a unit root (non-stationary). Correlating two non-stationary series in levels often produces spurious results. If both series are non-stationary, use Log Returns mode or check for cointegration.</div>
            </div>
            {/* Cointegration */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">Engle-Granger Cointegration</div>
              <div>Even if two series are individually non-stationary, they may share a long-run equilibrium (cointegrated). The EG test runs an ADF test on OLS residuals. If cointegrated (p&lt;0.05), the level relationship is meaningful and the spread is mean-reverting — useful for pairs trading.</div>
            </div>
            {/* Rolling Beta */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">Rolling Beta</div>
              <div>Rolling OLS slope of series A on series B, using the same window as the rolling correlation. A stable beta suggests a consistent linear relationship; a drifting beta indicates the sensitivity of A to B is changing over time, which matters for hedge ratios.</div>
            </div>
            {/* Mode guidance */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">When to Use Which Mode</div>
              <div>
                {mode === "levels" ? (
                  <><strong>Levels mode (current):</strong> Best for identifying cointegrated pairs or long-run equilibrium relationships. Watch out for spurious correlation if series are non-stationary and not cointegrated.&nbsp;</>
                ) : (
                  <><strong>Log Returns mode (current):</strong> Removes trend and makes series stationary. The standard choice for measuring co-movement and beta estimation. Pearson and Spearman should be compared here.&nbsp;</>
                )}
                Cross-correlation lags show lead/lag relationships. ACF plots reveal serial dependence — high AC(1) inflates correlation significance, which is why Effective N adjusts downward.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pairwise View ──
function PairwiseView({
  data,
  loading,
  specA,
  specB,
  mode,
  visibleWindows,
}: {
  data: PairwiseResult | undefined;
  loading: boolean;
  specA: string;
  specB: string;
  mode: string;
  visibleWindows: Set<number>;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Computing correlation...
      </div>
    );
  }

  if (!data || (data as any).error) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {(data as any)?.error || "Select two series to analyze"}
      </div>
    );
  }

  const s = data.summary;
  const labelA = formatSpec(specA);
  const labelB = formatSpec(specB);
  const [maximizedChart, setMaximizedChart] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* Summary stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-2">
        {[
          { label: "Pearson ρ", value: s.correlation.toFixed(4), color: corrColor(s.correlation), sub: data.diagnostics?.fisherCI ? `95% CI [${data.diagnostics.fisherCI.lower.toFixed(3)}, ${data.diagnostics.fisherCI.upper.toFixed(3)}]` : undefined },
          { label: "Spearman ρₛ", value: (s.spearmanCorrelation ?? 0).toFixed(4), color: corrColor(s.spearmanCorrelation ?? 0) },
          { label: "R²", value: s.rSquared.toFixed(4), color: "#94a3b8" },
          { label: "Beta (β)", value: s.beta.toFixed(4), color: "#94a3b8" },
          { label: "Observations", value: String(s.observations), color: "#94a3b8" },
          { label: "Eff. N*", value: String(s.effectiveN), color: s.effectiveN < s.observations * 0.5 ? "#ef4444" : "#94a3b8" },
          { label: "t-Stat", value: s.tStat.toFixed(3), color: "#94a3b8" },
          { label: "p-Value", value: s.pValue < 0.001 ? "<0.001" : s.pValue.toFixed(4), color: s.pValue < 0.05 ? "#22c55e" : "#ef4444" },
          ...(data.diagnostics?.cointegration ? [{
            label: "Coint. (EG)",
            value: data.diagnostics.cointegration.isCointegrated ? "Yes" : "No",
            color: data.diagnostics.cointegration.isCointegrated ? "#22c55e" : "#94a3b8",
            sub: `ADF=${data.diagnostics.cointegration.stat.toFixed(2)}, p=${data.diagnostics.cointegration.pValue < 0.001 ? "<.001" : data.diagnostics.cointegration.pValue.toFixed(3)}`,
          }] : []),
        ].map(stat => (
          <div key={stat.label} className="border border-border/30 rounded p-2 bg-card/30">
            <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">{stat.label}</div>
            <div className="text-sm font-mono font-bold" style={{ color: stat.color }}>{stat.value}</div>
            {(stat as any).sub && <div className="text-[8px] font-mono text-muted-foreground/60 mt-0.5">{(stat as any).sub}</div>}
          </div>
        ))}
      </div>

      {/* Diagnostics panel */}
      {data.diagnostics && (() => {
        const d = data.diagnostics;
        const warnings: string[] = [];
        if (Math.abs(s.autoCorrelationA) > 0.3 || Math.abs(s.autoCorrelationB) > 0.3) {
          warnings.push(`High autocorrelation: ${labelA} AC(1)=${s.autoCorrelationA.toFixed(3)}, ${labelB} AC(1)=${s.autoCorrelationB.toFixed(3)}. Effective N reduced to ${s.effectiveN}.`);
        }
        if (mode === "levels" && d.adfA && !d.adfA.isStationary) {
          warnings.push(`${labelA} is non-stationary (ADF=${d.adfA.stat.toFixed(2)}, p=${d.adfA.pValue.toFixed(3)}). Level correlation may be spurious.`);
        }
        if (mode === "levels" && d.adfB && !d.adfB.isStationary) {
          warnings.push(`${labelB} is non-stationary (ADF=${d.adfB.stat.toFixed(2)}, p=${d.adfB.pValue.toFixed(3)}). Level correlation may be spurious.`);
        }
        if (mode === "levels" && d.cointegration && !d.cointegration.isCointegrated && d.adfA && !d.adfA.isStationary) {
          warnings.push(`No cointegration detected (EG stat=${d.cointegration.stat.toFixed(2)}, p=${d.cointegration.pValue.toFixed(3)}). The level relationship may not represent a stable equilibrium. Consider using Log Returns mode.`);
        }
        if (mode === "levels" && d.cointegration?.isCointegrated) {
          warnings.push(`Cointegrated pair (EG p=${d.cointegration.pValue.toFixed(3)}). The spread is mean-reverting — pair/equilibrium analysis is valid.`);
        }
        if (mode === "returns" && Math.abs(s.correlation - (s.spearmanCorrelation ?? 0)) > 0.15) {
          warnings.push(`Pearson (${s.correlation.toFixed(3)}) and Spearman (${(s.spearmanCorrelation ?? 0).toFixed(3)}) diverge, suggesting nonlinear or outlier-driven relationship.`);
        }
        if (warnings.length === 0) return null;
        return (
          <div className="border border-amber-500/30 bg-amber-500/5 rounded p-2 space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="text-[11px] text-amber-400">{w}</div>
            ))}
          </div>
        );
      })()}

      {/* Methodology & Guidance Panel */}
      <MethodologyPanel mode={mode} />

      {/* Charts grid — show only maximized chart if one is expanded */}
      <div className={`grid gap-3 ${maximizedChart ? "" : "grid-cols-1 lg:grid-cols-2"}`}>
        {/* Dual-axis level series */}
        {(!maximizedChart || maximizedChart === "levels") && (
          <MiniChart
            data={data.levelsA}
            color={COLORS.primary}
            height={350}
            title={`${labelA} vs ${labelB} (Levels)`}
            secondData={data.levelsB}
            secondColor={COLORS.secondary}
            chartId="levels"
            isMaximized={maximizedChart === "levels"}
            onMaximize={setMaximizedChart}
          />
        )}

        {/* Rolling correlation — multi-window with user-selected windows + CI bands */}
        {data.multiWindowRolling && visibleWindows.size > 0 && (!maximizedChart || maximizedChart === "rolling") && (() => {
          const windows = Array.from(visibleWindows).sort((a, b) => a - b);
          const [first, second, third, fourth] = windows;
          const legendParts = windows.map(w => `${w}d`).join(" / ");
          // Convert rollingCI to bandUpper / bandLower arrays
          const ciUpper = data.rollingCI?.map(d => ({ time: d.time, value: d.upper }));
          const ciLower = data.rollingCI?.map(d => ({ time: d.time, value: d.lower }));
          return (
            <MiniChart
              data={data.multiWindowRolling[first] || []}
              color={MULTI_WINDOW_COLORS[first]}
              height={350}
              title={`Rolling Correlation (${legendParts})`}
              showZeroLine
              secondData={second !== undefined ? data.multiWindowRolling[second] || [] : undefined}
              secondColor={second !== undefined ? MULTI_WINDOW_COLORS[second] : undefined}
              thirdData={third !== undefined ? data.multiWindowRolling[third] || [] : undefined}
              thirdColor={third !== undefined ? MULTI_WINDOW_COLORS[third] : undefined}
              fourthData={fourth !== undefined ? data.multiWindowRolling[fourth] || [] : undefined}
              fourthColor={fourth !== undefined ? MULTI_WINDOW_COLORS[fourth] : undefined}
              bandUpper={ciUpper}
              bandLower={ciLower}
              bandColor="rgba(100,180,255,0.3)"
              chartId="rolling"
              isMaximized={maximizedChart === "rolling"}
              onMaximize={setMaximizedChart}
            />
          );
        })()}

        {/* Rolling beta */}
        {data.rollingBeta && data.rollingBeta.length > 0 && (!maximizedChart || maximizedChart === "rollingBeta") && (
          <MiniChart
            data={data.rollingBeta}
            color="#ec4899"
            height={280}
            title={`Rolling Beta: ${labelA} vs ${labelB}`}
            showZeroLine
            chartId="rollingBeta"
            isMaximized={maximizedChart === "rollingBeta"}
            onMaximize={setMaximizedChart}
          />
        )}

        {/* Scatter plot */}
        {(!maximizedChart || maximizedChart === "scatter") && (
          <CanvasChartWrapper
            title={`Scatter: ${labelA} vs ${labelB}`}
            chartId="scatter"
            isMaximized={maximizedChart === "scatter"}
            onMaximize={setMaximizedChart}
            height={350}
          >
            {(h) => (
              <ScatterCanvas
                data={data.scatter}
                labelX={labelB}
                labelY={labelA}
                beta={s.beta}
                alpha={s.alpha}
                height={h}
                hideTitle
              />
            )}
          </CanvasChartWrapper>
        )}

        {/* Cross-correlation lag chart */}
        {(!maximizedChart || maximizedChart === "crossCorr") && (
          <CanvasChartWrapper
            title={`Cross-Correlation (Lag ${data.crossCorrelation[0]?.lag} to ${data.crossCorrelation[data.crossCorrelation.length - 1]?.lag})`}
            chartId="crossCorr"
            isMaximized={maximizedChart === "crossCorr"}
            onMaximize={setMaximizedChart}
            height={280}
          >
            {(h) => (
              <CrossCorrChart
                data={data.crossCorrelation}
                labelA={labelA}
                labelB={labelB}
                height={h}
                hideTitle
              />
            )}
          </CanvasChartWrapper>
        )}

        {/* ACF panels */}
        {!maximizedChart && (
          <div className="grid grid-cols-2 gap-3">
            <ACFChart
              data={data.acfA}
              nObs={s.observations}
              title={`ACF: ${labelA}`}
              height={200}
            />
            <ACFChart
              data={data.acfB}
              nObs={s.observations}
              title={`ACF: ${labelB}`}
              height={200}
            />
          </div>
        )}
        {maximizedChart === "acfA" && (
          <CanvasChartWrapper title={`ACF: ${labelA}`} chartId="acfA" isMaximized onMaximize={setMaximizedChart} height={200}>
            {(h) => <ACFChart data={data.acfA} nObs={s.observations} title={`ACF: ${labelA}`} height={h} />}
          </CanvasChartWrapper>
        )}
        {maximizedChart === "acfB" && (
          <CanvasChartWrapper title={`ACF: ${labelB}`} chartId="acfB" isMaximized onMaximize={setMaximizedChart} height={200}>
            {(h) => <ACFChart data={data.acfB} nObs={s.observations} title={`ACF: ${labelB}`} height={h} />}
          </CanvasChartWrapper>
        )}
      </div>
    </div>
  );
}

// ── Matrix View ──
function MatrixView({
  data,
  loading,
}: {
  data: MatrixResult | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Computing correlation matrix...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Add at least 2 series to generate a matrix
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-3 space-y-3">
      {/* Matrix info */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>{data.observations} obs</span>
        <span>·</span>
        <span>{data.dateRange.from} to {data.dateRange.to}</span>
        <span>·</span>
        <span>{data.mode} mode</span>
        <span>·</span>
        <span className="text-[9px]">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />+corr
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 mx-1 ml-2" />−corr
          <span className="text-muted-foreground/40 ml-2">ns = not significant (p&gt;0.05)</span>
        </span>
      </div>

      {/* Heatmap */}
      <HeatmapMatrix
        matrix={data.matrix}
        labels={data.labels}
        pValues={data.pValues}
      />

      {/* Top positive and negative correlations */}
      <div className="grid grid-cols-2 gap-3">
        <TopCorrelations matrix={data.matrix} labels={data.labels} type="positive" />
        <TopCorrelations matrix={data.matrix} labels={data.labels} type="negative" />
      </div>
    </div>
  );
}

// ── Universe Matrix View ──
function UniverseMatrixView({
  data,
  loading,
  tickerCount,
}: {
  data: MatrixResult | undefined;
  loading: boolean;
  tickerCount: number;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 animate-spin" />
        Computing {tickerCount}×{tickerCount} correlation matrix...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {tickerCount < 2 ? "Need at least 2 tickers — apply a Universe filter or load data" : "Loading..."}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-3 space-y-3">
      {/* Matrix info bar */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        <span className="font-semibold text-foreground">{data.labels.length}×{data.labels.length} matrix</span>
        <span>·</span>
        <span>{data.observations} obs</span>
        <span>·</span>
        <span>{data.dateRange.from} to {data.dateRange.to}</span>
        <span>·</span>
        <span>{data.mode === "returns" ? "Log Returns" : data.mode === "changes" ? "Simple Changes" : "Levels"}</span>
        <span>·</span>
        <span className="text-[9px]">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />+corr
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 mx-1 ml-2" />−corr
          <span className="text-muted-foreground/40 ml-2">ns = not significant (p&gt;0.05)</span>
        </span>
      </div>

      {/* Heatmap */}
      <HeatmapMatrix
        matrix={data.matrix}
        labels={data.labels}
        pValues={data.pValues}
      />

      {/* Top positive and negative correlations */}
      <div className="grid grid-cols-2 gap-3">
        <TopCorrelations matrix={data.matrix} labels={data.labels} type="positive" />
        <TopCorrelations matrix={data.matrix} labels={data.labels} type="negative" />
      </div>
    </div>
  );
}

// ── Top correlations list ──
function TopCorrelations({
  matrix,
  labels,
  type,
}: {
  matrix: number[][];
  labels: string[];
  type: "positive" | "negative";
}) {
  const pairs = useMemo(() => {
    const arr: { a: string; b: string; corr: number }[] = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        arr.push({ a: labels[i], b: labels[j], corr: matrix[i][j] });
      }
    }
    if (type === "positive") {
      return arr.sort((a, b) => b.corr - a.corr).slice(0, 10);
    } else {
      return arr.sort((a, b) => a.corr - b.corr).slice(0, 10);
    }
  }, [matrix, labels, type]);

  return (
    <div className="border border-border/30 rounded p-2">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {type === "positive" ? "Highest Positive" : "Most Negative"} Correlations
      </div>
      <div className="space-y-0.5">
        {pairs.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
            <span style={{ color: corrColor(p.corr) }} className="font-bold w-12 text-right">
              {p.corr.toFixed(3)}
            </span>
            <span className="text-muted-foreground truncate">
              {formatSpec(p.a)} × {formatSpec(p.b)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
