import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery } from "@tanstack/react-query";
import { getScatterData, isPercentMetric, getCustomFundamentalMetrics } from "@/lib/dataService";
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
import { Download, TrendingUp, Crosshair, Maximize2, LayoutTemplate, Palette } from "lucide-react";
import ExportMenu from "@/components/ExportMenu";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

// ── Zoom/pan state ──
interface ZoomState {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface DragState {
  type: "select" | "pan";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const METRIC_OPTIONS: Record<string, string[]> = {
  Valuation: [
    "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2",
    "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2",
    "P/AFFO LTM", "P/AFFO FY2",
  ],
  Yields: [
    "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
    "Dividend Yield",
  ],
  Growth: [
    "FY1 FFO Growth", "FY2 FFO Growth",
    "FY1 AFFO Growth", "FY2 AFFO Growth",
    "FY1 EPS Growth", "FY2 EPS Growth",
  ],
  Performance: [
    "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
    "% off 52wk High", "% off 52wk Low",
  ],
  Estimates: [
    "EPS FY2", "FFO FY2", "AFFO FY2", "EBITDA FY2",
  ],
  "Short Interest": [
    "Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M",
  ],
  Other: [
    "close", "Enterprise Value", "Dividend Yield",
    "Buy Ratings",
  ],
};

const COLOR_CATEGORIES: { label: string; field: string }[] = [
  { label: "Subindustry", field: "subindustry" },
  { label: "Industry", field: "industry" },
  { label: "Industry Group", field: "industryGroup" },
  { label: "Subsector", field: "subsector" },
  { label: "Sector", field: "sector" },
  { label: "Economy", field: "economy" },
];

// ── Gradient helpers ──
// Produces red→yellow→green gradient for a normalised [0,1] value
function gradientColor(t: number): string {
  // Clamp
  const v = Math.max(0, Math.min(1, t));
  // 0 = red (0°), 0.5 = yellow (60°), 1 = green (120°)
  const hue = v * 120;
  return `hsl(${hue}, 85%, 50%)`;
}

function gradientColorHex(t: number): string {
  const v = Math.max(0, Math.min(1, t));
  const hue = v * 120;
  // Convert HSL to RGB
  const s = 0.85, l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else { r = 0; g = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// All metrics available for color-by-metric (same as axis metrics)
const COLOR_METRIC_OPTIONS = METRIC_OPTIONS;

const PALETTE = [
  "#0ea5e9", "#a855f7", "#22c55e", "#f59e0b", "#ef4444",
  "#06b6d4", "#f97316", "#ec4899", "#14b8a6", "#8b5cf6",
  "#eab308", "#6366f1", "#84cc16", "#e11d48", "#0891b2",
  "#7c3aed", "#64748b", "#d946ef", "#fb923c", "#4ade80",
];

function getCategoryColor(idx: number): string {
  return PALETTE[idx % PALETTE.length];
}

// ── Scatter Templates ──
const SCATTER_TEMPLATES: { label: string; x: string; y: string; z?: string }[] = [
  { label: "FFO Yield vs Growth", x: "FY2 FFO Growth", y: "FFO Yield FY2" },
  { label: "AFFO Yield vs Growth", x: "FY2 AFFO Growth", y: "AFFO Yield FY2" },
  { label: "P/FFO vs Div Yield", x: "P/FFO FY2", y: "Dividend Yield" },
  { label: "P/FFO vs FFO Growth", x: "P/FFO FY2", y: "FY2 FFO Growth" },
  { label: "P/AFFO vs AFFO Growth", x: "P/AFFO FY2", y: "FY2 AFFO Growth" },
  { label: "EV/EBITDA vs Growth", x: "EV/EBITDA FY2", y: "FY2 FFO Growth" },
  { label: "Implied Cap Rate vs Growth", x: "Implied Cap Rate", y: "FY2 FFO Growth" },
  { label: "Price Chg vs SI%", x: "Short Interest%", y: "1M Price Chg%" },
  { label: "SI% vs P/FFO", x: "Short Interest%", y: "P/FFO FY2" },
  { label: "Yield vs 52wk Drawdown", x: "% off 52wk High", y: "Dividend Yield" },
  { label: "6M vs 1M Momentum", x: "6M Price Chg%", y: "1M Price Chg%" },
  { label: "Valuation vs Size", x: "P/FFO FY2", y: "Dividend Yield", z: "Enterprise Value" },
];

// ── Regression group levels ──
const REGRESSION_LEVELS = [
  { key: "none", label: "All (universe)" },
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Industry Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
] as const;

type RegressionLevelKey = typeof REGRESSION_LEVELS[number]["key"];

// Colors for peer group regression lines
const GROUP_REG_COLORS = [
  "rgba(239, 68, 68, 0.7)", "rgba(34, 197, 94, 0.7)", "rgba(59, 130, 246, 0.7)",
  "rgba(168, 85, 247, 0.7)", "rgba(245, 158, 11, 0.7)", "rgba(6, 182, 212, 0.7)",
  "rgba(236, 72, 153, 0.7)", "rgba(132, 204, 22, 0.7)", "rgba(99, 102, 241, 0.7)",
  "rgba(249, 115, 22, 0.7)", "rgba(20, 184, 166, 0.7)", "rgba(139, 92, 246, 0.7)",
  "rgba(234, 179, 8, 0.7)", "rgba(225, 29, 72, 0.7)", "rgba(100, 116, 139, 0.7)",
];

// OLS regression: y = slope * x + intercept
function olsRegression(points: { x: number; y: number }[]): {
  slope: number; intercept: number; rSquared: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (const p of points) {
    sumX += p.x; sumY += p.y;
    sumXY += p.x * p.y; sumXX += p.x * p.x; sumYY += p.y * p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const ssXX = sumXX - n * meanX * meanX;
  const ssXY = sumXY - n * meanX * meanY;
  const ssYY = sumYY - n * meanY * meanY;
  const slope = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const rSquared = ssXX === 0 || ssYY === 0 ? 0 : (ssXY * ssXY) / (ssXX * ssYY);
  return { slope, intercept, rSquared };
}

interface ScatterPoint extends ClassifiedBase {
  x: number | null;
  y: number | null;
  z: number | null;
  colorVal: number | null;
}

interface ScatterResponse {
  points: ScatterPoint[];
  resolvedDate: string;
}

export default function Scatter() {
  const { universeTickers } = useUniverse();
  const [metricX, setMetricX] = useState("P/FFO FY2");
  const [metricY, setMetricY] = useState("Dividend Yield");
  const [metricZ, setMetricZ] = useState("none");
  const [search, setSearch] = useState("");
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [colorBy, setColorBy] = useState("subindustry");
  const [colorMode, setColorMode] = useState<"category" | "metric">("category");
  const [colorMetric, setColorMetric] = useState("Dividend Yield");
  const [dateInput, setDateInput] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Feature toggles
  const [showRegression, setShowRegression] = useState(true);
  const [showOutliers, setShowOutliers] = useState(true);
  const [showQuadrants, setShowQuadrants] = useState(false);
  const [refLineX, setRefLineX] = useState("");
  const [refLineY, setRefLineY] = useState("");
  const [logX, setLogX] = useState(false);
  const [logY, setLogY] = useState(false);
  const [regressionLevel, setRegressionLevel] = useState<RegressionLevelKey>("none");

  const serializeScatter = useCallback(() => ({
    metricX,
    metricY,
    metricZ,
    classFilters: serializeClassFilters(classFilters),
    manualTickers: [...manualTickers],
    colorBy,
    colorMode,
    colorMetric,
    showRegression,
    showOutliers,
    showQuadrants,
    refLineX,
    refLineY,
    logX,
    logY,
    regressionLevel,
  }), [metricX, metricY, metricZ, classFilters, manualTickers, colorBy, colorMode, colorMetric, showRegression, showOutliers, showQuadrants, refLineX, refLineY, logX, logY, regressionLevel]);

  const restoreScatter = useCallback((state: any) => {
    if (state.metricX !== undefined) setMetricX(state.metricX);
    if (state.metricY !== undefined) setMetricY(state.metricY);
    if (state.metricZ !== undefined) setMetricZ(state.metricZ);
    if (state.classFilters !== undefined) setClassFilters(deserializeClassFilters(state.classFilters));
    if (state.manualTickers !== undefined) setManualTickers(new Set(state.manualTickers));
    if (state.colorBy !== undefined) setColorBy(state.colorBy);
    if (state.colorMode !== undefined) setColorMode(state.colorMode);
    if (state.colorMetric !== undefined) setColorMetric(state.colorMetric);
    if (state.showRegression !== undefined) setShowRegression(state.showRegression);
    if (state.showOutliers !== undefined) setShowOutliers(state.showOutliers);
    if (state.showQuadrants !== undefined) setShowQuadrants(state.showQuadrants);
    if (state.refLineX !== undefined) setRefLineX(state.refLineX);
    if (state.refLineY !== undefined) setRefLineY(state.refLineY);
    if (state.logX !== undefined) setLogX(state.logX);
    if (state.logY !== undefined) setLogY(state.logY);
    if (state.regressionLevel !== undefined) setRegressionLevel(state.regressionLevel);
  }, []);

  useWorkspaceTab("scatter", serializeScatter, restoreScatter);

  // Zoom/pan state
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragRect, setDragRect] = useState<DragState | null>(null);
  const zoomHistoryRef = useRef<ZoomState[]>([]);

  // Reset zoom when metrics change
  useEffect(() => { setZoom(null); zoomHistoryRef.current = []; }, [metricX, metricY]);

  const activeColorMetric = colorMode === "metric" ? colorMetric : undefined;
  const { data: scatterData, isLoading } = useQuery<ScatterResponse>({
    queryKey: ["scatter", metricX, metricY, metricZ, dateInput, activeColorMetric],
    queryFn: () => getScatterData(
      metricX,
      metricY,
      metricZ !== "none" ? metricZ : undefined,
      dateInput || undefined,
      undefined,
      activeColorMetric,
    ),
  });

  const points = scatterData?.points ?? [];
  const resolvedDate = scatterData?.resolvedDate ?? "";

  const colorCategories = useMemo(() => {
    const set = new Set(points.map((p) => (p as any)[colorBy] as string).filter(Boolean));
    return Array.from(set).sort();
  }, [points, colorBy]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    colorCategories.forEach((cat, i) => { map[cat] = getCategoryColor(i); });
    return map;
  }, [colorCategories]);

  const filteredPoints = useMemo(() => {
    let pts = points.filter((p) => p.x !== null && p.y !== null);
    if (universeTickers) pts = pts.filter(p => universeTickers.has(p.ticker));
    pts = applyClassFilters(pts, classFilters, search, manualTickers);
    return pts as (ScatterPoint & { x: number; y: number })[];
  }, [points, search, classFilters, manualTickers, universeTickers]);

  // Apply log transforms (filter out non-positive values when log is on)
  const validPoints = useMemo(() => {
    return filteredPoints.filter(p => {
      if (logX && p.x <= 0) return false;
      if (logY && p.y <= 0) return false;
      return true;
    }).map(p => ({
      ...p,
      x: logX ? Math.log10(p.x) : p.x,
      y: logY ? Math.log10(p.y) : p.y,
      _rawX: p.x,
      _rawY: p.y,
    }));
  }, [filteredPoints, logX, logY]);

  // Regression stats — single universe-wide line
  const regressionResult = useMemo(() => {
    if (!showRegression || regressionLevel !== "none" || validPoints.length < 3) return null;
    return olsRegression(validPoints.map((p) => ({ x: p.x, y: p.y })));
  }, [validPoints, showRegression, regressionLevel]);

  // Peer-group regressions — one line per group
  const groupRegressions = useMemo(() => {
    if (!showRegression || regressionLevel === "none") return [] as { group: string; reg: { slope: number; intercept: number; rSquared: number }; points: { x: number; y: number }[] }[];
    const groups: Record<string, { x: number; y: number }[]> = {};
    for (const p of validPoints) {
      const groupName = (p as any)[regressionLevel] as string || "Other";
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push({ x: p.x, y: p.y });
    }
    return Object.entries(groups)
      .filter(([, pts]) => pts.length >= 3)
      .map(([group, pts]) => ({ group, reg: olsRegression(pts), points: pts }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [validPoints, showRegression, regressionLevel]);

  // Outlier detection: top/bottom 3 by residual distance from regression
  const outliers = useMemo(() => {
    if (!showOutliers || validPoints.length < 5) return { above: [] as string[], below: [] as string[] };
    // Use universe-wide regression for outliers
    const reg = regressionResult ?? (validPoints.length >= 3 ? olsRegression(validPoints.map(p => ({ x: p.x, y: p.y }))) : null);
    if (!reg) return { above: [] as string[], below: [] as string[] };
    const { slope, intercept } = reg;
    const residuals = validPoints.map((p) => ({
      ticker: p.ticker,
      residual: p.y - (slope * p.x + intercept),
    }));
    residuals.sort((a, b) => b.residual - a.residual);
    return {
      above: residuals.slice(0, 3).map((r) => r.ticker),
      below: residuals.slice(-3).map((r) => r.ticker),
    };
  }, [validPoints, regressionResult, showOutliers]);

  const zRange = useMemo(() => {
    if (metricZ === "none") return null;
    const zVals = validPoints.map((p) => p.z).filter((z) => z !== null) as number[];
    if (zVals.length === 0) return null;
    return { min: Math.min(...zVals), max: Math.max(...zVals) };
  }, [validPoints, metricZ]);

  // Color metric range for gradient
  const colorValRange = useMemo(() => {
    if (colorMode !== "metric") return null;
    const vals = validPoints.map(p => p.colorVal).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [validPoints, colorMode]);

  // Parsed reference lines
  const refX = refLineX !== "" ? parseFloat(refLineX) : null;
  const refY = refLineY !== "" ? parseFloat(refLineY) : null;

  // ── Shared axis helpers ──
  const PAD = useMemo(() => ({ top: 20, right: 30, bottom: 50, left: 60 }), []);

  const dataBounds = useMemo(() => {
    if (validPoints.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const xs = validPoints.map((p) => p.x);
    const ys = validPoints.map((p) => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xR = (xMax - xMin) || 1;
    const yR = (yMax - yMin) || 1;
    return { xMin: xMin - xR * 0.05, xMax: xMax + xR * 0.05, yMin: yMin - yR * 0.05, yMax: yMax + yR * 0.05 };
  }, [validPoints]);

  const viewBounds = zoom ?? dataBounds;

  const getTransformFns = useCallback((W: number, H: number) => {
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const { xMin, xMax, yMin, yMax } = viewBounds;
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const toCanvasX = (v: number) => PAD.left + ((v - xMin) / xRange) * plotW;
    const toCanvasY = (v: number) => PAD.top + plotH - ((v - yMin) / yRange) * plotH;
    const fromCanvasX = (cx: number) => xMin + ((cx - PAD.left) / plotW) * xRange;
    const fromCanvasY = (cy: number) => yMin + ((PAD.top + plotH - cy) / plotH) * yRange;
    return { toCanvasX, toCanvasY, fromCanvasX, fromCanvasY, plotW, plotH };
  }, [viewBounds, PAD]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || validPoints.length === 0) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = rect.width;
    const H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const { toCanvasX, toCanvasY, plotW, plotH } = getTransformFns(W, H);
    const { xMin, xMax, yMin, yMax } = viewBounds;

    // Background
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    const xTicks = 6;
    const yTicks = 6;
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    for (let i = 0; i <= xTicks; i++) {
      const v = xMin + (xRange * i) / xTicks;
      const cx = toCanvasX(v);
      ctx.beginPath();
      ctx.moveTo(cx, PAD.top);
      ctx.lineTo(cx, PAD.top + plotH);
      ctx.stroke();
      ctx.fillStyle = "#7a8a9e";
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      const xLabel = logX ? Math.pow(10, v).toFixed(1) : v.toFixed(1);
      ctx.fillText(xLabel + (isPercentMetric(metricX) ? "%" : ""), cx, PAD.top + plotH + 14);
    }
    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + (yRange * i) / yTicks;
      const cy = toCanvasY(v);
      ctx.beginPath();
      ctx.moveTo(PAD.left, cy);
      ctx.lineTo(PAD.left + plotW, cy);
      ctx.stroke();
      ctx.fillStyle = "#7a8a9e";
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      const yLabel = logY ? Math.pow(10, v).toFixed(2) : v.toFixed(2);
      ctx.fillText(yLabel + (isPercentMetric(metricY) ? "%" : ""), PAD.left - 6, cy + 3);
    }

    // Axis labels
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(metricX + (logX ? " (log)" : ""), PAD.left + plotW / 2, H - 8);

    ctx.save();
    ctx.translate(14, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(metricY + (logY ? " (log)" : ""), 0, 0);
    ctx.restore();

    // Plot border
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

    // Clip to plot area for points/lines
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top, plotW, plotH);
    ctx.clip();

    // Quadrant reference lines
    if (showQuadrants) {
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1;

      if (refX !== null) {
        const cx = toCanvasX(refX);
        ctx.strokeStyle = "rgba(251, 191, 36, 0.5)";
        ctx.beginPath();
        ctx.moveTo(cx, PAD.top);
        ctx.lineTo(cx, PAD.top + plotH);
        ctx.stroke();
      }
      if (refY !== null) {
        const cy = toCanvasY(refY);
        ctx.strokeStyle = "rgba(251, 191, 36, 0.5)";
        ctx.beginPath();
        ctx.moveTo(PAD.left, cy);
        ctx.lineTo(PAD.left + plotW, cy);
        ctx.stroke();
      }

      if (refX !== null && refY !== null) {
        ctx.setLineDash([]);
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
        const cxr = toCanvasX(refX);
        const cyr = toCanvasY(refY);
        ctx.textAlign = "center";
        ctx.fillText("Low X \u00b7 High Y", (PAD.left + cxr) / 2, (PAD.top + cyr) / 2);
        ctx.fillText("High X \u00b7 High Y", (cxr + PAD.left + plotW) / 2, (PAD.top + cyr) / 2);
        ctx.fillText("Low X \u00b7 Low Y", (PAD.left + cxr) / 2, (cyr + PAD.top + plotH) / 2);
        ctx.fillText("High X \u00b7 Low Y", (cxr + PAD.left + plotW) / 2, (cyr + PAD.top + plotH) / 2);
      }
      ctx.setLineDash([]);
    }

    // OLS Regression line
    if (showRegression && regressionResult) {
      const { slope, intercept, rSquared } = regressionResult;
      ctx.strokeStyle = "rgba(239, 68, 68, 0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);

      const regXMin = xMin;
      const regXMax = xMax;
      const regY1 = slope * regXMin + intercept;
      const regY2 = slope * regXMax + intercept;

      ctx.beginPath();
      ctx.moveTo(toCanvasX(regXMin), toCanvasY(regY1));
      ctx.lineTo(toCanvasX(regXMax), toCanvasY(regY2));
      ctx.stroke();
      ctx.setLineDash([]);

      // Stats label
      ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
      ctx.font = "bold 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      const statsText = `R\u00b2=${rSquared.toFixed(3)}  \u03b2=${slope.toFixed(3)}  \u03b1=${intercept.toFixed(2)}`;
      ctx.fillText(statsText, PAD.left + 6, PAD.top + 14);

      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(239, 68, 68, 0.45)";
      const rawXs = validPoints.map(p => p.x);
      const midX = (Math.min(...rawXs) + Math.max(...rawXs)) / 2;
      const regMidY = slope * midX + intercept;
      ctx.textAlign = "left";
      ctx.fillText("Above = expensive", PAD.left + 6, toCanvasY(regMidY) - 8);
      ctx.fillText("Below = cheap", PAD.left + 6, toCanvasY(regMidY) + 14);
    }

    // Peer group regression lines
    if (showRegression && groupRegressions.length > 0) {
      let statY = PAD.top + 14;
      groupRegressions.forEach((gr, gi) => {
        const color = GROUP_REG_COLORS[gi % GROUP_REG_COLORS.length];
        const { slope, intercept, rSquared } = gr.reg;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);

        // Find x range for this group's points
        const gxs = gr.points.map(p => p.x);
        const gxMin = Math.min(...gxs);
        const gxMax = Math.max(...gxs);
        const regY1 = slope * gxMin + intercept;
        const regY2 = slope * gxMax + intercept;
        ctx.beginPath();
        ctx.moveTo(toCanvasX(gxMin), toCanvasY(regY1));
        ctx.lineTo(toCanvasX(gxMax), toCanvasY(regY2));
        ctx.stroke();
        ctx.setLineDash([]);

        // Stats label
        ctx.fillStyle = color;
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        ctx.textAlign = "left";
        const shortName = gr.group.replace(" Equity REITs", "").slice(0, 20);
        ctx.fillText(`${shortName} R\u00b2=${rSquared.toFixed(2)} n=${gr.points.length}`, PAD.left + 6, statY);
        statY += 12;
      });
    }

    // Draw points
    const sortedPoints = [...validPoints].sort((a, b) => {
      const za = a.z ?? 0;
      const zb = b.z ?? 0;
      return Math.abs(zb) - Math.abs(za);
    });

    const isOutlierAbove = (ticker: string) => outliers.above.includes(ticker);
    const isOutlierBelow = (ticker: string) => outliers.below.includes(ticker);

    // Helper to get point color based on mode
    const getPointColor = (p: typeof sortedPoints[number]): string => {
      if (colorMode === "metric" && colorValRange) {
        if (p.colorVal === null || p.colorVal === undefined) return "#64748b";
        const range = colorValRange.max - colorValRange.min;
        const t = range === 0 ? 0.5 : (p.colorVal - colorValRange.min) / range;
        return gradientColorHex(t);
      }
      const catValue = (p as any)[colorBy] as string || "";
      return colorMap[catValue] || "#64748b";
    };

    for (const p of sortedPoints) {
      const cx = toCanvasX(p.x);
      const cy = toCanvasY(p.y);
      const isHovered = p.ticker === hoveredTicker;
      const color = getPointColor(p);
      const isOutlier = isOutlierAbove(p.ticker) || isOutlierBelow(p.ticker);

      let r = 4;
      if (zRange && p.z !== null) {
        const zNorm = zRange.max === zRange.min
          ? 0.5
          : (p.z - zRange.min) / (zRange.max - zRange.min);
        r = 3 + zNorm * 18;
      }
      if (isHovered) r = Math.max(r, 7);
      if (isOutlier && showOutliers) r = Math.max(r, 6);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (zRange) {
        ctx.fillStyle = color + "88";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = isHovered ? color : color + "cc";
        ctx.fill();
      }

      if (isOutlier && showOutliers) {
        ctx.strokeStyle = isOutlierAbove(p.ticker) ? "#ef4444" : "#22c55e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (isHovered) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const shouldShowLabel = isHovered || (isOutlier && showOutliers);
      if (shouldShowLabel || !isOutlier) {
        ctx.fillStyle = isHovered || isOutlier ? "#fff" : "rgba(255,255,255,0.7)";
        ctx.font = isHovered || isOutlier
          ? "bold 11px 'JetBrains Mono', monospace"
          : "10px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.ticker, cx, cy - r - 4);
      }
    }

    ctx.restore(); // un-clip

    // Tooltip for hovered point (draw outside clip)
    if (hoveredTicker) {
      const hp = validPoints.find((p) => p.ticker === hoveredTicker);
      if (hp) {
        const cx = toCanvasX(hp.x);
        const cy = toCanvasY(hp.y);
        const xSuf = isPercentMetric(metricX) ? "%" : "";
        const ySuf = isPercentMetric(metricY) ? "%" : "";
        const dispX = (hp as any)._rawX !== undefined ? (hp as any)._rawX : hp.x;
        const dispY = (hp as any)._rawY !== undefined ? (hp as any)._rawY : hp.y;
        let text = `${hp.ticker}: ${metricX}=${dispX.toFixed(2)}${xSuf}, ${metricY}=${dispY.toFixed(2)}${ySuf}`;
        if (metricZ !== "none" && hp.z !== null) {
          const zSuf = isPercentMetric(metricZ) ? "%" : "";
          text += `, ${metricZ}=${hp.z.toFixed(2)}${zSuf}`;
        }
        if (colorMode === "metric" && hp.colorVal !== null && hp.colorVal !== undefined) {
          const cSuf = isPercentMetric(colorMetric) ? "%" : "";
          text += `, ${colorMetric}=${hp.colorVal.toFixed(2)}${cSuf}`;
        }
        if (regressionResult) {
          const resid = hp.y - (regressionResult.slope * hp.x + regressionResult.intercept);
          text += ` (resid=${resid.toFixed(2)})`;
        }
        ctx.font = "11px 'JetBrains Mono', monospace";
        const tw = ctx.measureText(text).width;
        const tx = Math.max(PAD.left + 4, Math.min(cx - tw / 2, W - PAD.right - tw - 4));
        const ty = cy - (zRange ? 26 : 22);
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(tx - 4, ty - 12, tw + 8, 16);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.fillText(text, tx, ty);
      }
    }

    // Draw drag-selection rectangle
    if (dragRect && dragRect.type === "select") {
      const x1 = Math.min(dragRect.startX, dragRect.currentX);
      const y1 = Math.min(dragRect.startY, dragRect.currentY);
      const w = Math.abs(dragRect.currentX - dragRect.startX);
      const h = Math.abs(dragRect.currentY - dragRect.startY);
      ctx.strokeStyle = "rgba(14, 165, 233, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x1, y1, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(14, 165, 233, 0.1)";
      ctx.fillRect(x1, y1, w, h);
    }

    // Zoom indicator
    if (zoom) {
      ctx.fillStyle = "rgba(14, 165, 233, 0.7)";
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText("ZOOMED \u2014 scroll to zoom, drag to select, dbl-click to reset", W - PAD.right, PAD.top - 6);
    }
  }, [validPoints, metricX, metricY, metricZ, hoveredTicker, colorBy, colorMap, zRange,
      showRegression, regressionResult, groupRegressions, showOutliers, outliers, showQuadrants, refX, refY,
      viewBounds, getTransformFns, PAD, dragRect, zoom, logX, logY, colorMode, colorMetric, colorValRange]);

  // ── Mouse event handlers for zoom/pan/drag-select ──
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Right-click or middle-click or shift = pan
    const isPan = e.button === 1 || e.button === 2 || e.shiftKey;
    const drag: DragState = {
      type: isPan ? "pan" : "select",
      startX: mx,
      startY: my,
      currentX: mx,
      currentY: my,
    };
    dragRef.current = drag;
    if (!isPan) setDragRect(drag);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || validPoints.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Handle drag
    if (dragRef.current) {
      if (dragRef.current.type === "pan") {
        // Pan: shift the view by mouse delta
        const W = rect.width;
        const H = rect.height;
        const { fromCanvasX, fromCanvasY } = getTransformFns(W, H);
        const dx = fromCanvasX(mx) - fromCanvasX(dragRef.current.currentX);
        const dy = fromCanvasY(my) - fromCanvasY(dragRef.current.currentY);
        const cur = zoom ?? dataBounds;
        setZoom({
          xMin: cur.xMin - dx,
          xMax: cur.xMax - dx,
          yMin: cur.yMin - dy,
          yMax: cur.yMax - dy,
        });
        dragRef.current.currentX = mx;
        dragRef.current.currentY = my;
      } else {
        // Selection rectangle
        dragRef.current = { ...dragRef.current, currentX: mx, currentY: my };
        setDragRect({ ...dragRef.current });
      }
      return;
    }

    // Normal hover detection
    const W = rect.width;
    const H = rect.height;
    const { toCanvasX, toCanvasY } = getTransformFns(W, H);

    let closest: string | null = null;
    let minDist = 20;
    for (const p of validPoints) {
      const cx = toCanvasX(p.x);
      const cy = toCanvasY(p.y);
      const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
      if (d < minDist) {
        minDist = d;
        closest = p.ticker;
      }
    }
    setHoveredTicker(closest);
  }, [validPoints, getTransformFns, zoom, dataBounds]);

  const navigateToChart = useCallback((ticker: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("ticker", ticker);
    url.hash = "#/";
    window.location.href = url.toString();
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragRect(null);
    if (!drag || drag.type !== "select") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    const dx = Math.abs(drag.currentX - drag.startX);
    const dy = Math.abs(drag.currentY - drag.startY);
    // Click (not drag) — navigate to chart if hovering a point
    if (dx < 5 && dy < 5) {
      if (hoveredTicker) navigateToChart(hoveredTicker);
      return;
    }

    const { fromCanvasX, fromCanvasY } = getTransformFns(W, H);
    const x1 = fromCanvasX(Math.min(drag.startX, drag.currentX));
    const x2 = fromCanvasX(Math.max(drag.startX, drag.currentX));
    const y1 = fromCanvasY(Math.max(drag.startY, drag.currentY)); // canvas Y is inverted
    const y2 = fromCanvasY(Math.min(drag.startY, drag.currentY));

    // Save current zoom for back navigation
    if (zoom) zoomHistoryRef.current.push(zoom);
    else zoomHistoryRef.current.push(dataBounds);

    setZoom({ xMin: x1, xMax: x2, yMin: y1, yMax: y2 });
  }, [getTransformFns, zoom, dataBounds, hoveredTicker, navigateToChart]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const { fromCanvasX, fromCanvasY } = getTransformFns(W, H);
    const dataX = fromCanvasX(mx);
    const dataY = fromCanvasY(my);

    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15; // zoom out / in
    const cur = zoom ?? dataBounds;

    // Zoom centered on mouse position in data space
    const newXMin = dataX - (dataX - cur.xMin) * factor;
    const newXMax = dataX + (cur.xMax - dataX) * factor;
    const newYMin = dataY - (dataY - cur.yMin) * factor;
    const newYMax = dataY + (cur.yMax - dataY) * factor;

    setZoom({ xMin: newXMin, xMax: newXMax, yMin: newYMin, yMax: newYMax });
  }, [getTransformFns, zoom, dataBounds]);

  const handleDoubleClick = useCallback(() => {
    if (zoomHistoryRef.current.length > 0) {
      const prev = zoomHistoryRef.current.pop()!;
      // If prev matches dataBounds, reset fully
      const db = dataBounds;
      if (Math.abs(prev.xMin - db.xMin) < 1e-9 && Math.abs(prev.xMax - db.xMax) < 1e-9) {
        setZoom(null);
      } else {
        setZoom(prev);
      }
    } else {
      setZoom(null);
    }
  }, [dataBounds]);

  const resetZoom = useCallback(() => {
    setZoom(null);
    zoomHistoryRef.current = [];
  }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      setHoveredTicker((prev) => prev);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Prevent context menu on canvas (for right-click pan)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevent = (e: Event) => e.preventDefault();
    canvas.addEventListener("contextmenu", prevent);
    // Passive: false for wheel to allow preventDefault
    const wheelHandler = (e: WheelEvent) => e.preventDefault();
    canvas.addEventListener("wheel", wheelHandler, { passive: false });
    return () => {
      canvas.removeEventListener("contextmenu", prevent);
      canvas.removeEventListener("wheel", wheelHandler);
    };
  }, []);

  // Auto-set reference lines to median when quadrants toggled on
  useEffect(() => {
    if (showQuadrants && validPoints.length > 2) {
      const xs = validPoints.map(p => p.x).sort((a, b) => a - b);
      const ys = validPoints.map(p => p.y).sort((a, b) => a - b);
      const medX = xs[Math.floor(xs.length / 2)];
      const medY = ys[Math.floor(ys.length / 2)];
      if (refLineX === "") setRefLineX(medX.toFixed(2));
      if (refLineY === "") setRefLineY(medY.toFixed(2));
    }
  }, [showQuadrants, validPoints.length]);

  const exportCSV = () => {
    const colorCol = colorMode === "metric" ? "," + colorMetric : "";
    const header = `Ticker,Name,Subindustry,${metricX},${metricY}${metricZ !== "none" ? "," + metricZ : ""}${colorCol}${regressionResult ? ",Residual" : ""}`;
    const lines = validPoints.map((p) => {
      let line = `${p.ticker},"${p.name}","${p.subindustry}",${p.x},${p.y}${metricZ !== "none" ? "," + (p.z ?? "") : ""}`;
      if (colorMode === "metric") line += `,${p.colorVal ?? ""}`;
      if (regressionResult) {
        const resid = p.y - (regressionResult.slope * p.x + regressionResult.intercept);
        line += `,${resid.toFixed(4)}`;
      }
      return line;
    });
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scatter_${metricX}_vs_${metricY}.csv`.replace(/[^a-zA-Z0-9._-]/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-background" data-testid="scatter-page">
      {/* Controls row 1: templates + axes + bubble size */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px] px-2">
              <LayoutTemplate className="w-3 h-3" />
              Templates
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-[10px]">Preset Views</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SCATTER_TEMPLATES.map((t) => (
              <DropdownMenuItem
                key={t.label}
                className="text-[11px] cursor-pointer"
                onClick={() => {
                  setMetricX(t.x);
                  setMetricY(t.y);
                  if (t.z) setMetricZ(t.z); else setMetricZ("none");
                }}
              >
                {t.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-5 w-px bg-border" />

        <span className="text-xs font-semibold text-muted-foreground">X</span>
        <MetricSelect value={metricX} onChange={setMetricX} testId="scatter-x" />

        <span className="text-xs font-semibold text-muted-foreground">Y</span>
        <MetricSelect value={metricY} onChange={setMetricY} testId="scatter-y" />

        <span className="text-xs font-semibold text-muted-foreground">Size</span>
        <Select value={metricZ} onValueChange={setMetricZ}>
          <SelectTrigger className="h-6 text-[11px] w-[140px]" data-testid="scatter-z">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (uniform)</SelectItem>
            {Object.entries(METRIC_OPTIONS).map(([cat, metrics]) => (
              <div key={cat}>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {cat}
                </div>
                {metrics.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </div>
            ))}
            {(() => { const cm = getCustomFundamentalMetrics(); return cm.length > 0 ? (
              <div>
                <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Uploaded Fundamental</div>
                {cm.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </div>
            ) : null; })()}
          </SelectContent>
        </Select>

        <div className="h-5 w-px bg-border mx-0.5" />

        <span className="text-xs font-semibold text-muted-foreground">Color</span>
        <Select value={colorMode} onValueChange={(v) => setColorMode(v as "category" | "metric")}>
          <SelectTrigger className="h-6 text-[11px] w-[90px]" data-testid="scatter-color-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="category">Category</SelectItem>
            <SelectItem value="metric">Metric</SelectItem>
          </SelectContent>
        </Select>

        {colorMode === "category" ? (
          <Select value={colorBy} onValueChange={setColorBy}>
            <SelectTrigger className="h-6 text-[11px] w-[120px]" data-testid="scatter-color-by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLOR_CATEGORIES.map((c) => (
                <SelectItem key={c.field} value={c.field}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <MetricSelect value={colorMetric} onChange={setColorMetric} testId="scatter-color-metric" />
        )}

        <div className="h-5 w-px bg-border mx-0.5" />

        <span className="text-xs font-semibold text-muted-foreground">Date</span>
        <Input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="h-6 text-[11px] w-[130px] bg-background"
          data-testid="scatter-date"
        />
        {dateInput && (
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setDateInput("")}>
            Latest
          </Button>
        )}
      </div>

      {/* Controls row 2: analytics toggles */}
      <div className="flex items-center gap-3 px-3 py-1 border-b border-border/50 flex-wrap">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3 text-red-400" />
          <span className="text-[11px] text-muted-foreground">Regression</span>
          <Switch
            checked={showRegression}
            onCheckedChange={setShowRegression}
            className="scale-75"
            data-testid="toggle-regression"
          />
        </div>

        {showRegression && (
          <Select value={regressionLevel} onValueChange={(v) => setRegressionLevel(v as RegressionLevelKey)}>
            <SelectTrigger className="h-6 text-[11px] w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGRESSION_LEVELS.map((lv) => (
                <SelectItem key={lv.key} value={lv.key}>{lv.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Outliers</span>
          <Switch
            checked={showOutliers}
            onCheckedChange={setShowOutliers}
            className="scale-75"
            data-testid="toggle-outliers"
          />
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-1.5">
          <Crosshair className="w-3 h-3 text-amber-400" />
          <span className="text-[11px] text-muted-foreground">Quadrants</span>
          <Switch
            checked={showQuadrants}
            onCheckedChange={setShowQuadrants}
            className="scale-75"
            data-testid="toggle-quadrants"
          />
        </div>
        {showQuadrants && (
          <>
            <Input
              type="number"
              step="any"
              placeholder="X ref"
              value={refLineX}
              onChange={(e) => setRefLineX(e.target.value)}
              className="h-6 text-[11px] w-[70px] bg-background"
              data-testid="ref-line-x"
            />
            <Input
              type="number"
              step="any"
              placeholder="Y ref"
              value={refLineY}
              onChange={(e) => setRefLineY(e.target.value)}
              className="h-6 text-[11px] w-[70px] bg-background"
              data-testid="ref-line-y"
            />
          </>
        )}

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Log X</span>
          <Switch
            checked={logX}
            onCheckedChange={setLogX}
            className="scale-75"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Log Y</span>
          <Switch
            checked={logY}
            onCheckedChange={setLogY}
            className="scale-75"
          />
        </div>

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
          filteredCount={validPoints.length}
          totalCount={points.length}
          testIdPrefix="scatter"
        >
          {resolvedDate && (
            <span className="text-[10px] text-muted-foreground font-mono">{resolvedDate}</span>
          )}
          <ExportMenu
            getCanvas={() => canvasRef.current}
            label={`Scatter_${metricX}_vs_${metricY}`}
          />
          <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={exportCSV}>
            <Download className="w-3 h-3" />
            CSV
          </Button>
        </ClassificationFilters>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 px-3 py-0.5 border-b border-border/30 overflow-x-auto flex-shrink-0">
        {colorMode === "metric" && colorValRange ? (
          <div className="flex items-center gap-2">
            <Palette className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-mono">
              {colorMetric}{isPercentMetric(colorMetric) ? "%" : ""}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {colorValRange.min.toFixed(1)}
            </span>
            <div
              className="h-2.5 rounded-sm flex-shrink-0"
              style={{
                width: 120,
                background: `linear-gradient(to right, ${gradientColor(0)}, ${gradientColor(0.25)}, ${gradientColor(0.5)}, ${gradientColor(0.75)}, ${gradientColor(1)})`,
              }}
            />
            <span className="text-[10px] text-muted-foreground font-mono">
              {colorValRange.max.toFixed(1)}
            </span>
          </div>
        ) : (
          colorCategories.slice(0, 20).map((cat) => (
            <button
              key={cat}
              className={`flex items-center gap-1 text-[10px] whitespace-nowrap ${
                classFilters.subindustry.has(cat) ? "text-foreground font-semibold" : "text-muted-foreground"
              }`}
              onClick={() => {
                if (colorBy === "subindustry") {
                  const key = colorBy as keyof ClassFilters;
                  const next = new Set(classFilters[key]);
                  if (next.has(cat)) next.delete(cat); else { next.clear(); next.add(cat); }
                  setClassFilters({ ...classFilters, [key]: next });
                }
              }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: colorMap[cat] }}
              />
              {cat.replace(" Equity REITs", "")}
            </button>
          ))
        )}
        {/* Outlier legend */}
        {showOutliers && outliers.above.length > 0 && (
          <>
            <div className="h-3 w-px bg-border mx-1" />
            <span className="text-[10px] text-red-400 font-mono">
              Expensive: {outliers.above.join(", ")}
            </span>
            <span className="text-[10px] text-green-400 font-mono">
              Cheap: {outliers.below.join(", ")}
            </span>
          </>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="flex-1 relative min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading...
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ cursor: dragRef.current ? (dragRef.current.type === "pan" ? "grabbing" : "crosshair") : hoveredTicker ? "pointer" : "crosshair" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={(e) => {
              setHoveredTicker(null);
              if (dragRef.current) { dragRef.current = null; setDragRect(null); }
            }}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            data-testid="scatter-canvas"
          />
        )}
        {zoom && (
          <Button
            variant="outline"
            size="sm"
            className="absolute top-2 right-2 h-6 gap-1 text-[11px] bg-background/90 backdrop-blur-sm z-10"
            onClick={resetZoom}
            data-testid="scatter-reset-zoom"
          >
            <Maximize2 className="w-3 h-3" />
            Reset Zoom
          </Button>
        )}
      </div>
    </div>
  );
}

function MetricSelect({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  const customMetrics = getCustomFundamentalMetrics();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 text-[11px] w-[140px]" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(METRIC_OPTIONS).map(([cat, metrics]) => (
          <div key={cat}>
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {cat}
            </div>
            {metrics.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </div>
        ))}
        {customMetrics.length > 0 && (
          <div>
            <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Uploaded Fundamental</div>
            {customMetrics.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
