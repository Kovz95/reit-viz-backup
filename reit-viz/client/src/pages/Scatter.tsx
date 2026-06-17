// Reconstructed from recovered-bundle/Scatter-BxBV76dr.js on 2026-06-11
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAppContext } from "@/lib/appContext";
import { useWorkspaceState } from "@/lib/workspaceState";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  LayoutGrid,
  TrendingDown,
  Layers,
  Palette,
  RotateCcw,
  Download,
} from "lucide-react";
import { navigateToTicker } from "@/lib/navigateToPairs";
import { isPercentMetric } from "@/lib/metricHelpers";
import { filterScatterPoints } from "@/lib/filterHelpers";
import { defaultClassFilters, serializeClassFilters, deserializeClassFilters } from "@/lib/filterHelpers";
import { ClassificationFiltersWithSource } from "@/lib/filterHelpers";
import { CanvasDownloadButton } from "@/lib/exportMenu";
import { fetchScatterData } from "@/lib/fetchWorkbookData";
import { useUploadedMetricColumns } from "@/lib/workspaceState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ScatterPoint {
  ticker: string;
  name: string;
  subindustry: string;
  industry: string;
  industryGroup: string;
  subsector: string;
  sector: string;
  economy: string;
  x: number;
  y: number;
  z?: number | null;
  colorVal?: number | null;
  _rawX?: number;
  _rawY?: number;
}

interface ViewRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface DragState {
  type: "pan" | "select";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const METRIC_GROUPS: Record<string, string[]> = {
  Valuation: ["P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2",
    "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2"],
  Yields: ["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield"],
  Growth: ["FY1 FFO Growth", "FY2 FFO Growth", "FY1 AFFO Growth", "FY2 AFFO Growth",
    "FY1 EPS Growth", "FY2 EPS Growth"],
  Performance: ["1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
    "% off 52wk High", "% off 52wk Low"],
  Estimates: ["EPS FY2", "FFO FY2", "AFFO FY2", "EBITDA FY2"],
  "Short Interest": ["Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M"],
  Other: ["close", "Enterprise Value", "Buy Ratings"],
};

const COLOR_BY_OPTIONS = [
  { label: "Subindustry", field: "subindustry" },
  { label: "Industry", field: "industry" },
  { label: "Industry Group", field: "industryGroup" },
  { label: "Subsector", field: "subsector" },
  { label: "Sector", field: "sector" },
  { label: "Economy", field: "economy" },
];

const CATEGORY_COLORS = [
  "#0ea5e9", "#a855f7", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#f97316", "#ec4899",
  "#14b8a6", "#8b5cf6", "#eab308", "#6366f1", "#84cc16", "#e11d48", "#0891b2", "#7c3aed",
  "#64748b", "#d946ef", "#fb923c", "#4ade80",
];

const GROUP_COLORS = [
  "rgba(239, 68, 68, 0.7)", "rgba(34, 197, 94, 0.7)", "rgba(59, 130, 246, 0.7)",
  "rgba(168, 85, 247, 0.7)", "rgba(245, 158, 11, 0.7)", "rgba(6, 182, 212, 0.7)",
  "rgba(236, 72, 153, 0.7)", "rgba(132, 204, 22, 0.7)", "rgba(99, 102, 241, 0.7)",
  "rgba(249, 115, 22, 0.7)", "rgba(20, 184, 166, 0.7)", "rgba(139, 92, 246, 0.7)",
  "rgba(234, 179, 8, 0.7)", "rgba(225, 29, 72, 0.7)", "rgba(100, 116, 139, 0.7)",
];

const PRESET_VIEWS = [
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

const REGRESSION_LEVEL_OPTIONS = [
  { key: "none", label: "All (universe)" },
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Industry Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hslGradientColor(t: number): string {
  return `hsl(${Math.max(0, Math.min(1, t)) * 120}, 85%, 50%)`;
}

function hslGradientHex(t: number): string {
  const h = Math.max(0, Math.min(1, t)) * 120;
  const s = 0.85;
  const l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else { r = 0; g = c; b = x; }
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function getCategoryColor(idx: number): string {
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
}

function computeRegression(points: { x: number; y: number }[]): RegressionResult {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y; }
  const mx = sx / n;
  const my = sy / n;
  const ssxx = sxx - n * mx * mx;
  const ssxy = sxy - n * mx * my;
  const ssyy = syy - n * my * my;
  const slope = ssxx === 0 ? 0 : ssxy / ssxx;
  const intercept = my - slope * mx;
  const rSquared = ssxx === 0 || ssyy === 0 ? 0 : (ssxy * ssxy) / (ssxx * ssyy);
  return { slope, intercept, rSquared };
}

// ---------------------------------------------------------------------------
// Main Scatter page
// ---------------------------------------------------------------------------
export default function Scatter() {
  const { universeTickers } = useAppContext();
  const [metricX, setMetricX] = useState("P/FFO FY2");
  const [metricY, setMetricY] = useState("Dividend Yield");
  const [metricZ, setMetricZ] = useState("none");
  const [searchText, setSearchText] = useState("");
  const [hoveredTicker, setHoveredTicker] = useState<string | null>(null);
  const [classFilters, setClassFilters] = useState(defaultClassFilters);
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [colorBy, setColorBy] = useState("subindustry");
  const [colorMode, setColorMode] = useState("category");
  const [colorMetric, setColorMetric] = useState("Dividend Yield");
  const [dateOverride, setDateOverride] = useState("");
  const [showRegression, setShowRegression] = useState(true);
  const [showOutliers, setShowOutliers] = useState(true);
  const [showQuadrants, setShowQuadrants] = useState(false);
  const [refLineX, setRefLineX] = useState("");
  const [refLineY, setRefLineY] = useState("");
  const [logX, setLogX] = useState(false);
  const [logY, setLogY] = useState(false);
  const [regressionLevel, setRegressionLevel] = useState("none");

  const getState = useCallback(
    () => ({
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
    }),
    [metricX, metricY, metricZ, classFilters, manualTickers, colorBy, colorMode, colorMetric,
      showRegression, showOutliers, showQuadrants, refLineX, refLineY, logX, logY, regressionLevel]
  );

  const restoreState = useCallback((saved: any) => {
    if (saved.metricX !== undefined) setMetricX(saved.metricX);
    if (saved.metricY !== undefined) setMetricY(saved.metricY);
    if (saved.metricZ !== undefined) setMetricZ(saved.metricZ);
    if (saved.classFilters !== undefined) setClassFilters(deserializeClassFilters(saved.classFilters));
    if (saved.manualTickers !== undefined) setManualTickers(new Set(saved.manualTickers));
    if (saved.colorBy !== undefined) setColorBy(saved.colorBy);
    if (saved.colorMode !== undefined) setColorMode(saved.colorMode);
    if (saved.colorMetric !== undefined) setColorMetric(saved.colorMetric);
    if (saved.showRegression !== undefined) setShowRegression(saved.showRegression);
    if (saved.showOutliers !== undefined) setShowOutliers(saved.showOutliers);
    if (saved.showQuadrants !== undefined) setShowQuadrants(saved.showQuadrants);
    if (saved.refLineX !== undefined) setRefLineX(saved.refLineX);
    if (saved.refLineY !== undefined) setRefLineY(saved.refLineY);
    if (saved.logX !== undefined) setLogX(saved.logX);
    if (saved.logY !== undefined) setLogY(saved.logY);
    if (saved.regressionLevel !== undefined) setRegressionLevel(saved.regressionLevel);
  }, []);

  useWorkspaceState("scatter", getState, restoreState);

  const [viewRange, setViewRange] = useState<ViewRange | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const zoomHistoryRef = useRef<ViewRange[]>([]);

  useEffect(() => {
    setViewRange(null);
    zoomHistoryRef.current = [];
  }, [metricX, metricY]);

  const resolvedColorMetric = colorMode === "metric" ? colorMetric : undefined;

  const { data: queryData, isLoading } = useQuery({
    queryKey: ["scatter", metricX, metricY, metricZ, dateOverride, resolvedColorMetric],
    queryFn: () =>
      fetchScatterData(
        metricX,
        metricY,
        metricZ !== "none" ? metricZ : undefined,
        dateOverride || undefined,
        undefined,
        resolvedColorMetric
      ),
  });

  const rawPoints: ScatterPoint[] = queryData?.points ?? [];
  const resolvedDate: string = queryData?.resolvedDate ?? "";

  const categoryValues = useMemo(() => {
    const vals = new Set(rawPoints.map((p: any) => p[colorBy]).filter(Boolean));
    return Array.from(vals).sort() as string[];
  }, [rawPoints, colorBy]);

  const categoryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    categoryValues.forEach((val, idx) => { map[val] = getCategoryColor(idx); });
    return map;
  }, [categoryValues]);

  const filteredPoints = useMemo(() => {
    let pts = rawPoints.filter((p) => p.x !== null && p.y !== null);
    if (universeTickers) pts = pts.filter((p) => universeTickers.has(p.ticker));
    pts = filterScatterPoints(pts, classFilters, searchText, manualTickers);
    return pts;
  }, [rawPoints, searchText, classFilters, manualTickers, universeTickers]);

  const transformedPoints = useMemo(
    () =>
      filteredPoints
        .filter((p) => !(logX && p.x <= 0) && !(logY && p.y <= 0))
        .map((p) => ({
          ...p,
          x: logX ? Math.log10(p.x) : p.x,
          y: logY ? Math.log10(p.y) : p.y,
          _rawX: p.x,
          _rawY: p.y,
        })),
    [filteredPoints, logX, logY]
  );

  const overallRegression = useMemo(
    () =>
      !showRegression || regressionLevel !== "none" || transformedPoints.length < 3
        ? null
        : computeRegression(transformedPoints.map((p) => ({ x: p.x, y: p.y }))),
    [transformedPoints, showRegression, regressionLevel]
  );

  const groupRegressions = useMemo(() => {
    if (!showRegression || regressionLevel === "none") return [];
    const groups: Record<string, { x: number; y: number }[]> = {};
    for (const p of transformedPoints) {
      const key = (p as any)[regressionLevel] || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push({ x: p.x, y: p.y });
    }
    return Object.entries(groups)
      .filter(([, pts]) => pts.length >= 3)
      .map(([group, pts]) => ({ group, reg: computeRegression(pts), points: pts }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [transformedPoints, showRegression, regressionLevel]);

  const outlierTickers = useMemo(() => {
    if (!showOutliers || transformedPoints.length < 5) return { above: [], below: [] };
    const reg =
      overallRegression ??
      (transformedPoints.length >= 3
        ? computeRegression(transformedPoints.map((p) => ({ x: p.x, y: p.y })))
        : null);
    if (!reg) return { above: [], below: [] };
    const { slope, intercept } = reg;
    const residuals = transformedPoints.map((p) => ({
      ticker: p.ticker,
      residual: p.y - (slope * p.x + intercept),
    }));
    residuals.sort((a, b) => b.residual - a.residual);
    return {
      above: residuals.slice(0, 3).map((r) => r.ticker),
      below: residuals.slice(-3).map((r) => r.ticker),
    };
  }, [transformedPoints, overallRegression, showOutliers]);

  const bubbleSizeRange = useMemo(() => {
    if (metricZ === "none") return null;
    const zVals = transformedPoints.map((p) => p.z).filter((z) => z !== null) as number[];
    if (zVals.length === 0) return null;
    return { min: Math.min(...zVals), max: Math.max(...zVals) };
  }, [transformedPoints, metricZ]);

  const colorMetricRange = useMemo(() => {
    if (colorMode !== "metric") return null;
    const vals = transformedPoints.map((p) => p.colorVal).filter((v) => v !== null) as number[];
    if (vals.length === 0) return null;
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [transformedPoints, colorMode]);

  const refX = refLineX !== "" ? parseFloat(refLineX) : null;
  const refY = refLineY !== "" ? parseFloat(refLineY) : null;

  const margins = useMemo(() => ({ top: 20, right: 30, bottom: 50, left: 60 }), []);

  const naturalRange = useMemo(() => {
    if (transformedPoints.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const xs = transformedPoints.map((p) => p.x);
    const ys = transformedPoints.map((p) => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const xSpan = xMax - xMin || 1;
    const ySpan = yMax - yMin || 1;
    return {
      xMin: xMin - xSpan * 0.05,
      xMax: xMax + xSpan * 0.05,
      yMin: yMin - ySpan * 0.05,
      yMax: yMax + ySpan * 0.05,
    };
  }, [transformedPoints]);

  const activeRange = viewRange ?? naturalRange;

  const getScaleHelpers = useCallback(
    (canvasW: number, canvasH: number) => {
      const plotW = canvasW - margins.left - margins.right;
      const plotH = canvasH - margins.top - margins.bottom;
      const { xMin, xMax, yMin, yMax } = activeRange;
      const xSpan = xMax - xMin || 1;
      const ySpan = yMax - yMin || 1;
      return {
        toCanvasX: (v: number) => margins.left + ((v - xMin) / xSpan) * plotW,
        toCanvasY: (v: number) => margins.top + plotH - ((v - yMin) / ySpan) * plotH,
        fromCanvasX: (c: number) => xMin + ((c - margins.left) / plotW) * xSpan,
        fromCanvasY: (c: number) => yMin + ((margins.top + plotH - c) / plotH) * ySpan,
        plotW,
        plotH,
      };
    },
    [activeRange, margins]
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || transformedPoints.length === 0) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const { toCanvasX: tx, toCanvasY: ty, plotW, plotH } = getScaleHelpers(w, h);
    const { xMin, xMax, yMin, yMax } = activeRange;

    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    const gridX = 6;
    const gridY = 6;
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    for (let i = 0; i <= gridX; i++) {
      const val = xMin + xRange * i / gridX;
      const px = tx(val);
      ctx.beginPath();
      ctx.moveTo(px, margins.top);
      ctx.lineTo(px, margins.top + plotH);
      ctx.stroke();
      ctx.fillStyle = "#7a8a9e";
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      const label = logX ? Math.pow(10, val).toFixed(1) : val.toFixed(1);
      ctx.fillText(label + (isPercentMetric(metricX) ? "%" : ""), px, margins.top + plotH + 14);
    }
    for (let i = 0; i <= gridY; i++) {
      const val = yMin + yRange * i / gridY;
      const py = ty(val);
      ctx.beginPath();
      ctx.moveTo(margins.left, py);
      ctx.lineTo(margins.left + plotW, py);
      ctx.stroke();
      ctx.fillStyle = "#7a8a9e";
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      const label = logY ? Math.pow(10, val).toFixed(2) : val.toFixed(2);
      ctx.fillText(label + (isPercentMetric(metricY) ? "%" : ""), margins.left - 6, py + 3);
    }

    // Axis labels
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(metricX + (logX ? " (log)" : ""), margins.left + plotW / 2, h - 8);
    ctx.save();
    ctx.translate(14, margins.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(metricY + (logY ? " (log)" : ""), 0, 0);
    ctx.restore();

    // Border
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(margins.left, margins.top, plotW, plotH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(margins.left, margins.top, plotW, plotH);
    ctx.clip();

    // Quadrant lines
    if (showQuadrants) {
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1;
      if (refX !== null) {
        const rx = tx(refX);
        ctx.strokeStyle = "rgba(251, 191, 36, 0.5)";
        ctx.beginPath();
        ctx.moveTo(rx, margins.top);
        ctx.lineTo(rx, margins.top + plotH);
        ctx.stroke();
      }
      if (refY !== null) {
        const ry = ty(refY);
        ctx.strokeStyle = "rgba(251, 191, 36, 0.5)";
        ctx.beginPath();
        ctx.moveTo(margins.left, ry);
        ctx.lineTo(margins.left + plotW, ry);
        ctx.stroke();
      }
      if (refX !== null && refY !== null) {
        ctx.setLineDash([]);
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
        const rx = tx(refX);
        const ry = ty(refY);
        ctx.textAlign = "center";
        ctx.fillText("Low X · High Y", (margins.left + rx) / 2, (margins.top + ry) / 2);
        ctx.fillText("High X · High Y", (rx + margins.left + plotW) / 2, (margins.top + ry) / 2);
        ctx.fillText("Low X · Low Y", (margins.left + rx) / 2, (ry + margins.top + plotH) / 2);
        ctx.fillText("High X · Low Y", (rx + margins.left + plotW) / 2, (ry + margins.top + plotH) / 2);
      }
      ctx.setLineDash([]);
    }

    // Overall regression
    if (showRegression && overallRegression) {
      const { slope, intercept, rSquared } = overallRegression;
      ctx.strokeStyle = "rgba(239, 68, 68, 0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(tx(xMin), ty(slope * xMin + intercept));
      ctx.lineTo(tx(xMax), ty(slope * xMax + intercept));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
      ctx.font = "bold 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(
        `R²=${rSquared.toFixed(3)}  β=${slope.toFixed(3)}  α=${intercept.toFixed(2)}`,
        margins.left + 6,
        margins.top + 14
      );
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(239, 68, 68, 0.45)";
      const midX = (Math.min(...transformedPoints.map((p) => p.x)) + Math.max(...transformedPoints.map((p) => p.x))) / 2;
      const midRegY = slope * midX + intercept;
      ctx.textAlign = "left";
      ctx.fillText("Above = expensive", margins.left + 6, ty(midRegY) - 8);
      ctx.fillText("Below = cheap", margins.left + 6, ty(midRegY) + 14);
    }

    // Group regressions
    if (showRegression && groupRegressions.length > 0) {
      let labelY = margins.top + 14;
      groupRegressions.forEach((grp, idx) => {
        const color = GROUP_COLORS[idx % GROUP_COLORS.length];
        const { slope, intercept, rSquared } = grp.reg;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);
        const xs = grp.points.map((p) => p.x);
        const gxMin = Math.min(...xs);
        const gxMax = Math.max(...xs);
        ctx.beginPath();
        ctx.moveTo(tx(gxMin), ty(slope * gxMin + intercept));
        ctx.lineTo(tx(gxMax), ty(slope * gxMax + intercept));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        ctx.textAlign = "left";
        const grpLabel = grp.group.replace(" Equity REITs", "").slice(0, 20);
        ctx.fillText(
          `${grpLabel} R²=${rSquared.toFixed(2)} n=${grp.points.length}`,
          margins.left + 6,
          labelY
        );
        labelY += 12;
      });
    }

    // Points (sorted by bubble size desc so small ones render on top)
    const sortedPoints = [...transformedPoints].sort((a, b) => {
      const az = a.z ?? 0;
      const bz = b.z ?? 0;
      return Math.abs(bz) - Math.abs(az);
    });

    const getPointColor = (p: ScatterPoint) => {
      if (colorMode === "metric" && colorMetricRange) {
        if (p.colorVal === null || p.colorVal === undefined) return "#64748b";
        const t = colorMetricRange.max === colorMetricRange.min
          ? 0.5
          : (p.colorVal - colorMetricRange.min) / (colorMetricRange.max - colorMetricRange.min);
        return hslGradientHex(t);
      }
      const key = (p as any)[colorBy] || "";
      return categoryColorMap[key] || "#64748b";
    };

    for (const p of sortedPoints) {
      const px = tx(p.x);
      const py = ty(p.y);
      const isHovered = p.ticker === hoveredTicker;
      const isOutlier = outlierTickers.above.includes(p.ticker) || outlierTickers.below.includes(p.ticker);
      const color = getPointColor(p);

      let radius = 4;
      if (bubbleSizeRange && p.z !== null && p.z !== undefined) {
        radius = 3 + (bubbleSizeRange.max === bubbleSizeRange.min
          ? 0.5
          : (p.z - bubbleSizeRange.min) / (bubbleSizeRange.max - bubbleSizeRange.min)) * 18;
      }
      if (isHovered) radius = Math.max(radius, 7);
      if (isOutlier && showOutliers) radius = Math.max(radius, 6);

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      if (bubbleSizeRange) {
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
        ctx.strokeStyle = outlierTickers.above.includes(p.ticker) ? "#ef4444" : "#22c55e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (isHovered) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (isHovered || (isOutlier && showOutliers) || !isOutlier) {
        ctx.fillStyle =
          isHovered || isOutlier ? "#fff" : "rgba(255,255,255,0.7)";
        ctx.font =
          isHovered || isOutlier
            ? "bold 11px 'JetBrains Mono', monospace"
            : "10px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.ticker, px, py - radius - 4);
      }
    }

    // Hovered tooltip
    if (hoveredTicker) {
      const p = transformedPoints.find((pt) => pt.ticker === hoveredTicker);
      if (p) {
        const px = tx(p.x);
        const py = ty(p.y);
        const pctX = isPercentMetric(metricX) ? "%" : "";
        const pctY = isPercentMetric(metricY) ? "%" : "";
        const rawX = p._rawX !== undefined ? p._rawX : p.x;
        const rawY = p._rawY !== undefined ? p._rawY : p.y;
        let label = `${p.ticker}: ${metricX}=${rawX.toFixed(2)}${pctX}, ${metricY}=${rawY.toFixed(2)}${pctY}`;
        if (metricZ !== "none" && p.z !== null) {
          const pctZ = isPercentMetric(metricZ) ? "%" : "";
          label += `, ${metricZ}=${p.z!.toFixed(2)}${pctZ}`;
        }
        if (colorMode === "metric" && p.colorVal !== null && p.colorVal !== undefined) {
          const pctC = isPercentMetric(colorMetric) ? "%" : "";
          label += `, ${colorMetric}=${p.colorVal.toFixed(2)}${pctC}`;
        }
        if (overallRegression) {
          const resid = p.y - (overallRegression.slope * p.x + overallRegression.intercept);
          label += ` (resid=${resid.toFixed(2)})`;
        }
        ctx.font = "11px 'JetBrains Mono', monospace";
        const labelW = ctx.measureText(label).width;
        const labelX = Math.max(margins.left + 4, Math.min(px - labelW / 2, w - margins.right - labelW - 4));
        const labelY = py - (bubbleSizeRange ? 26 : 22);
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(labelX - 4, labelY - 12, labelW + 8, 16);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.fillText(label, labelX, labelY);
      }
    }

    // Selection rectangle
    if (dragState && dragState.type === "select") {
      const x = Math.min(dragState.startX, dragState.currentX);
      const y = Math.min(dragState.startY, dragState.currentY);
      const bw = Math.abs(dragState.currentX - dragState.startX);
      const bh = Math.abs(dragState.currentY - dragState.startY);
      ctx.strokeStyle = "rgba(14, 165, 233, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x, y, bw, bh);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(14, 165, 233, 0.1)";
      ctx.fillRect(x, y, bw, bh);
    }

    // Zoom indicator
    if (viewRange) {
      ctx.fillStyle = "rgba(14, 165, 233, 0.7)";
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(
        "ZOOMED — scroll to zoom, drag to select, dbl-click to reset",
        w - margins.right,
        margins.top - 6
      );
    }

    ctx.restore();
  }, [
    transformedPoints, metricX, metricY, metricZ, hoveredTicker, colorBy, categoryColorMap,
    bubbleSizeRange, showRegression, overallRegression, groupRegressions, showOutliers, outlierTickers,
    showQuadrants, refX, refY, activeRange, getScaleHelpers, margins, dragState, viewRange,
    logX, logY, colorMode, colorMetric, colorMetricRange,
  ]);

  // ---- Mouse handlers ----
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const isPan = e.button === 1 || e.button === 2 || e.shiftKey;
    const state: DragState = { type: isPan ? "pan" : "select", startX: x, startY: y, currentX: x, currentY: y };
    dragRef.current = state;
    if (!isPan) setDragState(state);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || transformedPoints.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (dragRef.current) {
        if (dragRef.current.type === "pan") {
          const { fromCanvasX, fromCanvasY } = getScaleHelpers(rect.width, rect.height);
          const dx = fromCanvasX(x) - fromCanvasX(dragRef.current.currentX);
          const dy = fromCanvasY(y) - fromCanvasY(dragRef.current.currentY);
          const base = viewRange ?? naturalRange;
          setViewRange({
            xMin: base.xMin - dx,
            xMax: base.xMax - dx,
            yMin: base.yMin - dy,
            yMax: base.yMax - dy,
          });
          dragRef.current.currentX = x;
          dragRef.current.currentY = y;
        } else {
          dragRef.current = { ...dragRef.current, currentX: x, currentY: y };
          setDragState({ ...dragRef.current });
        }
        return;
      }

      const { toCanvasX, toCanvasY } = getScaleHelpers(rect.width, rect.height);
      let nearest: string | null = null;
      let minDist = 20;
      for (const p of transformedPoints) {
        const px = toCanvasX(p.x);
        const py = toCanvasY(p.y);
        const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        if (dist < minDist) { minDist = dist; nearest = p.ticker; }
      }
      setHoveredTicker(nearest);
    },
    [transformedPoints, getScaleHelpers, viewRange, naturalRange]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragState(null);
      if (!drag || drag.type !== "select") return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dw = Math.abs(drag.currentX - drag.startX);
      const dh = Math.abs(drag.currentY - drag.startY);
      if (dw < 5 && dh < 5) {
        if (hoveredTicker) navigateToTicker(hoveredTicker);
        return;
      }
      const { fromCanvasX, fromCanvasY } = getScaleHelpers(w, h);
      const x1 = fromCanvasX(Math.min(drag.startX, drag.currentX));
      const x2 = fromCanvasX(Math.max(drag.startX, drag.currentX));
      const y1 = fromCanvasY(Math.max(drag.startY, drag.currentY));
      const y2 = fromCanvasY(Math.min(drag.startY, drag.currentY));
      if (viewRange) {
        zoomHistoryRef.current.push(viewRange);
      } else {
        zoomHistoryRef.current.push(naturalRange);
      }
      setViewRange({ xMin: x1, xMax: x2, yMin: y1, yMax: y2 });
    },
    [getScaleHelpers, viewRange, naturalRange, hoveredTicker]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const { fromCanvasX, fromCanvasY } = getScaleHelpers(rect.width, rect.height);
      const mx = fromCanvasX(cx);
      const my = fromCanvasY(cy);
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const base = viewRange ?? naturalRange;
      setViewRange({
        xMin: mx - (mx - base.xMin) * factor,
        xMax: mx + (base.xMax - mx) * factor,
        yMin: my - (my - base.yMin) * factor,
        yMax: my + (base.yMax - my) * factor,
      });
    },
    [getScaleHelpers, viewRange, naturalRange]
  );

  const handleDoubleClick = useCallback(() => {
    if (zoomHistoryRef.current.length > 0) {
      const prev = zoomHistoryRef.current.pop()!;
      const close =
        Math.abs(prev.xMin - naturalRange.xMin) < 1e-9 &&
        Math.abs(prev.xMax - naturalRange.xMax) < 1e-9;
      setViewRange(close ? null : prev);
    } else {
      setViewRange(null);
    }
  }, [naturalRange]);

  const handleResetZoom = useCallback(() => {
    setViewRange(null);
    zoomHistoryRef.current = [];
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      setHoveredTicker((t) => t);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventContext = (e: Event) => e.preventDefault();
    const preventWheel = (e: Event) => e.preventDefault();
    canvas.addEventListener("contextmenu", preventContext);
    canvas.addEventListener("wheel", preventWheel, { passive: false });
    return () => {
      canvas.removeEventListener("contextmenu", preventContext);
      canvas.removeEventListener("wheel", preventWheel);
    };
  }, []);

  useEffect(() => {
    if (showQuadrants && transformedPoints.length > 2) {
      const xs = transformedPoints.map((p) => p.x).sort((a, b) => a - b);
      const ys = transformedPoints.map((p) => p.y).sort((a, b) => a - b);
      const medX = xs[Math.floor(xs.length / 2)];
      const medY = ys[Math.floor(ys.length / 2)];
      if (refLineX === "") setRefLineX(medX.toFixed(2));
      if (refLineY === "") setRefLineY(medY.toFixed(2));
    }
  }, [showQuadrants, transformedPoints.length]);

  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `scatter_${metricX}_vs_${metricY}.png`.replace(/[^a-zA-Z0-9._-]/g, "_");
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const handleExportCsv = () => {
    const extraCol = colorMode === "metric" ? "," + colorMetric : "";
    const header = `Ticker,Name,Subindustry,${metricX},${metricY}${metricZ !== "none" ? "," + metricZ : ""}${extraCol}${overallRegression ? ",Residual" : ""}`;
    const rows = transformedPoints.map((p) => {
      let row = `${p.ticker},"${p.name}","${p.subindustry}",${p.x},${p.y}${metricZ !== "none" ? "," + (p.z ?? "") : ""}`;
      if (colorMode === "metric") row += `,${p.colorVal ?? ""}`;
      if (overallRegression) {
        const resid = p.y - (overallRegression.slope * p.x + overallRegression.intercept);
        row += `,${resid.toFixed(4)}`;
      }
      return row;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scatter_${metricX}_vs_${metricY}.csv`.replace(/[^a-zA-Z0-9._-]/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadedColumns = useUploadedMetricColumns();

  return (
    <div className="flex flex-col h-full bg-background" data-testid="scatter-page">
      {/* Toolbar row 1 */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px] px-2">
              <LayoutGrid className="w-3 h-3" />
              Templates
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-[10px]">Preset Views</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PRESET_VIEWS.map((preset) => (
              <DropdownMenuItem
                key={preset.label}
                className="text-[11px] cursor-pointer"
                onClick={() => {
                  setMetricX(preset.x);
                  setMetricY(preset.y);
                  if ((preset as any).z) setMetricZ((preset as any).z);
                  else setMetricZ("none");
                }}
              >
                {preset.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="h-5 w-px bg-border" />
        <span className="text-xs font-semibold text-muted-foreground">X</span>
        <MetricPicker value={metricX} onChange={setMetricX} testId="scatter-x" uploadedColumns={uploadedColumns} />
        <span className="text-xs font-semibold text-muted-foreground">Y</span>
        <MetricPicker value={metricY} onChange={setMetricY} testId="scatter-y" uploadedColumns={uploadedColumns} />
        <span className="text-xs font-semibold text-muted-foreground">Size</span>
        <Select value={metricZ} onValueChange={setMetricZ}>
          <SelectTrigger className="h-6 text-[11px] w-[180px]" data-testid="scatter-z">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[420px]">
            <SelectItem value="none">None (uniform)</SelectItem>
            {Object.entries(METRIC_GROUPS).map(([group, metrics]) => (
              <div key={group}>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
                {metrics.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </div>
            ))}
            {(() => {
              const cols = uploadedColumns;
              return cols.length > 0 ? (
                <div>
                  <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Uploaded Fundamental</div>
                  {cols.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </div>
              ) : null;
            })()}
          </SelectContent>
        </Select>
        <div className="h-5 w-px bg-border mx-0.5" />
        <span className="text-xs font-semibold text-muted-foreground">Color</span>
        <Select value={colorMode} onValueChange={setColorMode}>
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
            <SelectTrigger className="h-6 text-[11px] w-[160px]" data-testid="scatter-color-by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COLOR_BY_OPTIONS.map((o) => (
                <SelectItem key={o.field} value={o.field}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <MetricPicker value={colorMetric} onChange={setColorMetric} testId="scatter-color-metric" uploadedColumns={uploadedColumns} />
        )}
        <div className="h-5 w-px bg-border mx-0.5" />
        <span className="text-xs font-semibold text-muted-foreground">Date</span>
        <Input
          type="date"
          value={dateOverride}
          onChange={(e) => setDateOverride(e.target.value)}
          className="h-6 text-[11px] w-[130px] bg-background"
          data-testid="scatter-date"
        />
        {dateOverride && (
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setDateOverride("")}>
            Latest
          </Button>
        )}
      </div>

      {/* Toolbar row 2: toggles */}
      <div className="flex items-center gap-3 px-3 py-1 border-b border-border/50 flex-wrap">
        <div className="flex items-center gap-1.5">
          <TrendingDown className="w-3 h-3 text-red-400" />
          <span className="text-[11px] text-muted-foreground">Regression</span>
          <Switch checked={showRegression} onCheckedChange={setShowRegression} className="scale-75" data-testid="toggle-regression" />
        </div>
        {showRegression && (
          <Select value={regressionLevel} onValueChange={setRegressionLevel}>
            <SelectTrigger className="h-6 text-[11px] w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGRESSION_LEVEL_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Outliers</span>
          <Switch checked={showOutliers} onCheckedChange={setShowOutliers} className="scale-75" data-testid="toggle-outliers" />
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-amber-400" />
          <span className="text-[11px] text-muted-foreground">Quadrants</span>
          <Switch checked={showQuadrants} onCheckedChange={setShowQuadrants} className="scale-75" data-testid="toggle-quadrants" />
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
          <Switch checked={logX} onCheckedChange={setLogX} className="scale-75" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Log Y</span>
          <Switch checked={logY} onCheckedChange={setLogY} className="scale-75" />
        </div>
      </div>

      {/* Toolbar row 3: filters */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border/50 flex-wrap">
        <ClassificationFiltersWithSource
          filters={classFilters}
          onFiltersChange={setClassFilters}
          search={searchText}
          onSearchChange={setSearchText}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={transformedPoints.length}
          totalCount={rawPoints.length}
          testIdPrefix="scatter"
        >
          {resolvedDate && (
            <span className="text-[10px] text-muted-foreground font-mono">{resolvedDate}</span>
          )}
          <CanvasDownloadButton
            getCanvas={() => canvasRef.current}
            label={`Scatter_${metricX}_vs_${metricY}`}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-0.5 rounded bg-background/80 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="Export chart"
                data-testid="export-chart"
              >
                <Download className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[120px]">
              <DropdownMenuItem onClick={handleExportPng} data-testid="export-png">
                Export PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCsv} data-testid="export-csv">
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={handleExportCsv}>
            <Download className="w-3 h-3" />
            CSV
          </Button>
        </ClassificationFiltersWithSource>
      </div>

      {/* Legend row */}
      <div className="flex items-center gap-2 px-3 py-0.5 border-b border-border/30 overflow-x-auto flex-shrink-0">
        {colorMode === "metric" && colorMetricRange ? (
          <div className="flex items-center gap-2">
            <Palette className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-mono">
              {colorMetric}{isPercentMetric(colorMetric) ? "%" : ""}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {colorMetricRange.min.toFixed(1)}
            </span>
            <div
              className="h-2.5 rounded-sm flex-shrink-0"
              style={{
                width: 120,
                background: `linear-gradient(to right, ${hslGradientColor(0)}, ${hslGradientColor(0.25)}, ${hslGradientColor(0.5)}, ${hslGradientColor(0.75)}, ${hslGradientColor(1)})`,
              }}
            />
            <span className="text-[10px] text-muted-foreground font-mono">
              {colorMetricRange.max.toFixed(1)}
            </span>
          </div>
        ) : (
          categoryValues.slice(0, 20).map((cat) => (
            <button
              key={cat}
              className={`flex items-center gap-1 text-[10px] whitespace-nowrap ${
                (classFilters as any).subindustry?.has(cat) ? "text-foreground font-semibold" : "text-muted-foreground"
              }`}
              onClick={() => {
                if (colorBy === "subindustry") {
                  const updated = new Set((classFilters as any)[colorBy]);
                  if (updated.has(cat)) updated.delete(cat);
                  else { updated.clear(); updated.add(cat); }
                  setClassFilters({ ...classFilters, [colorBy]: updated });
                }
              }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: categoryColorMap[cat] }}
              />
              {cat.replace(" Equity REITs", "")}
            </button>
          ))
        )}
        {showOutliers && outlierTickers.above.length > 0 && (
          <>
            <div className="h-3 w-px bg-border mx-1" />
            <span className="text-[10px] text-red-400 font-mono">
              Expensive: {outlierTickers.above.join(", ")}
            </span>
            <span className="text-[10px] text-green-400 font-mono">
              Cheap: {outlierTickers.below.join(", ")}
            </span>
          </>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading...
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{
              cursor: dragRef.current
                ? dragRef.current.type === "pan" ? "grabbing" : "crosshair"
                : hoveredTicker ? "pointer" : "crosshair",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              setHoveredTicker(null);
              if (dragRef.current) { dragRef.current = null; setDragState(null); }
            }}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            data-testid="scatter-canvas"
          />
        )}
        {viewRange && (
          <Button
            variant="outline"
            size="sm"
            className="absolute top-2 right-2 h-6 gap-1 text-[11px] bg-background/90 backdrop-blur-sm z-10"
            onClick={handleResetZoom}
            data-testid="scatter-reset-zoom"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Zoom
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricPicker sub-component
// ---------------------------------------------------------------------------
interface MetricPickerProps {
  value: string;
  onChange: (v: string) => void;
  testId?: string;
  uploadedColumns: string[];
}

function MetricPicker({ value, onChange, testId, uploadedColumns }: MetricPickerProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 text-[11px] w-[180px]" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[420px]">
        {Object.entries(METRIC_GROUPS).map(([group, metrics]) => (
          <div key={group}>
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
            {metrics.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </div>
        ))}
        {uploadedColumns.length > 0 && (
          <div>
            <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Uploaded Fundamental</div>
            {uploadedColumns.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
