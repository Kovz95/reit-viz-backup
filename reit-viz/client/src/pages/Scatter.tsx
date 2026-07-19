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
import DateInput from "@/components/DateInput";
import {
  LayoutGrid,
  TrendingDown,
  Layers,
  Palette,
  RotateCcw,
  Download,
  Hand,
  Plus,
  X,
  Save,
} from "lucide-react";
import { navigateToTicker } from "@/lib/navigateToPairs";
import { isPercentMetric } from "@/lib/metricHelpers";
import { getTickers, getTickersCacheSync, getDates, metricMultiplier } from "@/lib/dataService";
import { groupMetricsByCategory, DERIVED_METRICS } from "@/lib/metricCategories";
import { filterScatterPoints } from "@/lib/filterHelpers";
import { defaultClassFilters, serializeClassFilters, deserializeClassFilters } from "@/lib/filterHelpers";
import { ClassificationFiltersWithSource } from "@/lib/filterHelpers";
import { useGeoFilter } from "@/lib/useGeoFilter";
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
  button?: number;
}

interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const METRIC_GROUPS_BASE: Record<string, string[]> = {
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

const BT_STEPS = [
  { key: "1", label: "Daily" },
  { key: "5", label: "Weekly" },
  { key: "21", label: "Monthly" },
];
const BT_LOOKBACKS = [
  { key: "252", label: "1Y" },
  { key: "504", label: "2Y" },
  { key: "756", label: "3Y" },
  { key: "1260", label: "5Y" },
];
const BT_SIGNALS = [
  { key: "residual", label: "Residual (Y vs X)" },
  { key: "x", label: "X value" },
  { key: "y", label: "Y value" },
];
const BT_Q = 5;
const BT_QUINT_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"];

const FWD_HORIZONS = [
  { key: "21", label: "1M", days: 21 },
  { key: "63", label: "3M", days: 63 },
  { key: "126", label: "6M", days: 126 },
  { key: "252", label: "1Y", days: 252 },
];

// User-saved layout presets — full pane-state snapshots in localStorage
// (durable across sessions, shared by all panes).
const PRESETS_STORAGE_KEY = "reit-viz-scatter-presets";

function loadSavedPresets(): Record<string, any> {
  try {
    return JSON.parse(window.localStorage.getItem(PRESETS_STORAGE_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}

function persistSavedPresets(presets: Record<string, any>) {
  try {
    window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch { /* storage full / unavailable */ }
}

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
// Stats / ML helpers — all pure & deterministic (no Math.random / Date)
// ---------------------------------------------------------------------------
interface XY { x: number; y: number }

// Cluster palette (reuse category colors)
const CLUSTER_COLORS = CATEGORY_COLORS;

// Deterministic PRNG (seeded) — Math.random is unavailable in this environment.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pearsonCorr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  const denom = Math.sqrt(saa * sbb);
  return denom < 1e-12 ? 0 : sab / denom;
}

function retSummary(rets: number[]): { n: number; mean: number; median: number; hitRate: number } | null {
  const n = rets.length;
  if (n === 0) return null;
  const sorted = [...rets].sort((x, y) => x - y);
  const mean = rets.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const hitRate = (rets.filter((v) => v > 0).length / n) * 100;
  return { n, mean, median, hitRate };
}

// Average-tie ranks for Spearman correlation.
function rankArray(vals: number[]): number[] {
  const order = vals.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(vals.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2;
    for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

function spearmanCorr(a: number[], b: number[]): number {
  return pearsonCorr(rankArray(a), rankArray(b));
}

function sampleStdArr(vals: number[]): number {
  const n = vals.length;
  if (n < 2) return 0;
  const m = vals.reduce((s, v) => s + v, 0) / n;
  const v = vals.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1);
  return Math.sqrt(v);
}

// k-means (k-means++ init, deterministic seed) over already-normalized coords.
function kMeans(pts: XY[], k: number, seed = 0x9e3779b1): { labels: number[]; centroids: XY[] } {
  const n = pts.length;
  if (n === 0 || k < 1) return { labels: [], centroids: [] };
  const K = Math.min(k, n);
  const rng = mulberry32(seed ^ (n * 2654435761));
  const centroids: XY[] = [{ ...pts[Math.floor(rng() * n) % n] }];
  while (centroids.length < K) {
    const d2 = pts.map((p) => {
      let best = Infinity;
      for (const c of centroids) { const dd = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (dd < best) best = dd; }
      return best;
    });
    const sum = d2.reduce((s, v) => s + v, 0);
    if (sum <= 0) { centroids.push({ ...pts[centroids.length % n] }); continue; }
    let r = rng() * sum, idx = 0;
    for (; idx < n; idx++) { r -= d2[idx]; if (r <= 0) break; }
    centroids.push({ ...pts[Math.min(idx, n - 1)] });
  }
  const labels = new Array(n).fill(0);
  for (let iter = 0; iter < 60; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < K; c++) {
        const dd = (pts[i].x - centroids[c].x) ** 2 + (pts[i].y - centroids[c].y) ** 2;
        if (dd < bestD) { bestD = dd; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    const acc = Array.from({ length: K }, () => ({ x: 0, y: 0, n: 0 }));
    for (let i = 0; i < n; i++) { const c = labels[i]; acc[c].x += pts[i].x; acc[c].y += pts[i].y; acc[c].n++; }
    for (let c = 0; c < K; c++) if (acc[c].n > 0) centroids[c] = { x: acc[c].x / acc[c].n, y: acc[c].y / acc[c].n };
    if (!changed && iter > 0) break;
  }
  return { labels, centroids };
}

// Andrew monotone-chain convex hull (returns hull vertices in input coords).
function convexHull(points: XY[]): XY[] {
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length < 3) return pts;
  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: XY[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: XY[] = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// LOESS (local linear, tricube weights) — returns a sorted smooth curve.
function loessCurve(points: XY[], span: number, nOut = 64): XY[] {
  const n = points.length;
  if (n < 4) return [];
  const pts = points.slice().sort((a, b) => a.x - b.x);
  const xs = pts.map((p) => p.x);
  const xMin = xs[0], xMax = xs[n - 1];
  if (xMax - xMin < 1e-12) return [];
  const k = Math.max(2, Math.floor(Math.min(1, Math.max(0.1, span)) * n));
  const out: XY[] = [];
  for (let i = 0; i < nOut; i++) {
    const x0 = xMin + ((xMax - xMin) * i) / (nOut - 1);
    const sorted = xs.map((x) => Math.abs(x - x0)).sort((a, b) => a - b);
    const h = sorted[Math.min(k, n) - 1] || 1e-9;
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (let j = 0; j < n; j++) {
      const d = Math.abs(pts[j].x - x0) / (h || 1e-9);
      if (d >= 1) continue;
      const w = (1 - d ** 3) ** 3;
      sw += w; swx += w * pts[j].x; swy += w * pts[j].y; swxx += w * pts[j].x * pts[j].x; swxy += w * pts[j].x * pts[j].y;
    }
    if (sw === 0) continue;
    const denom = sw * swxx - swx * swx;
    const yhat = Math.abs(denom) < 1e-12
      ? swy / sw
      : (() => { const b = (sw * swxy - swx * swy) / denom; const a = (swy - b * swx) / sw; return a + b * x0; })();
    out.push({ x: x0, y: yhat });
  }
  return out;
}

// Mahalanobis distance of each point from the joint centroid (2D).
function mahalanobisDist(points: XY[]): number[] {
  const n = points.length;
  if (n < 3) return points.map(() => 0);
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of points) { sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; sxy += (p.x - mx) * (p.y - my); }
  sxx /= (n - 1); syy /= (n - 1); sxy /= (n - 1);
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-12) return points.map(() => 0);
  const ixx = syy / det, iyy = sxx / det, ixy = -sxy / det;
  return points.map((p) => {
    const dx = p.x - mx, dy = p.y - my;
    return Math.sqrt(Math.max(0, dx * dx * ixx + dy * dy * iyy + 2 * dx * dy * ixy));
  });
}

// Inverse normal CDF (Acklam) — for confidence-band z, then bumped to a t-quantile.
function invNorm(p: number): number {
  if (p <= 0) return -6; if (p >= 1) return 6;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
function tCritical(conf: number, dof: number): number {
  const z = invNorm(1 - (1 - conf) / 2);
  if (dof >= 100) return z;
  // Cornish–Fisher bump from z to Student-t
  return z + (z ** 3 + z) / (4 * dof) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * dof * dof);
}

// ---------------------------------------------------------------------------
// Multi-pane wrapper: add/remove independent scatter panes, each one screen
// tall with its own metrics, filters, overlays, and saved workspace state.
// ---------------------------------------------------------------------------
export default function ScatterPage() {
  const [paneIds, setPaneIds] = useState<number[]>([1]);
  const nextIdRef = useRef(2);

  const getPanesState = useCallback(
    () => ({ paneIds, nextId: nextIdRef.current }),
    [paneIds]
  );
  const restorePanesState = useCallback((saved: any) => {
    if (Array.isArray(saved?.paneIds) && saved.paneIds.length > 0) setPaneIds(saved.paneIds);
    if (typeof saved?.nextId === "number") nextIdRef.current = saved.nextId;
  }, []);
  useWorkspaceState("scatter-panes", getPanesState, restorePanesState);

  const addPane = useCallback(() => {
    setPaneIds((p) => [...p, nextIdRef.current++]);
  }, []);
  const removePane = useCallback((id: number) => {
    setPaneIds((p) => (p.length > 1 ? p.filter((x) => x !== id) : p));
  }, []);

  return (
    <div className="h-full overflow-y-auto flex flex-col" data-testid="scatter-page-multi">
      {paneIds.map((id) => (
        <div
          key={id}
          className="h-full flex-shrink-0 flex flex-col border-b-2 border-border"
          data-testid={`scatter-pane-wrap-${id}`}
        >
          <ScatterPane
            // Pane 1 keeps the historical "scatter" key so existing saved state survives.
            stateKey={id === 1 ? "scatter" : `scatter-${id}`}
            paneId={id}
            paneCount={paneIds.length}
            onAdd={addPane}
            onRemove={() => removePane(id)}
          />
        </div>
      ))}
    </div>
  );
}

interface ScatterPaneProps {
  stateKey: string;
  paneId: number;
  paneCount: number;
  onAdd: () => void;
  onRemove: () => void;
}

// ---------------------------------------------------------------------------
// Single scatter pane (the original page content)
// ---------------------------------------------------------------------------
function ScatterPane({ stateKey, paneId, paneCount, onAdd, onRemove }: ScatterPaneProps) {
  const { universeTickers } = useAppContext();
  const [metricX, setMetricX] = useState("P/FFO FY2");
  const [metricY, setMetricY] = useState("Dividend Yield");
  const [metricZ, setMetricZ] = useState("none");
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
  // Built-in metrics (curated + universe + derived), grouped by category.
  // Uploaded fundamental columns are kept as a separate group in the picker.
  const metricGroups = useMemo(
    () => groupMetricsByCategory([...new Set([...Object.values(METRIC_GROUPS_BASE).flat(), ...DERIVED_METRICS, ...dataMetrics])]),
    [dataMetrics],
  );
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
  // "select" = drag draws a zoom/select box (shift+drag pans); "pan" = drag pans.
  const [dragMode, setDragMode] = useState<"select" | "pan">("select");

  // ── Stats / ML overlays ──
  const [showKnn, setShowKnn] = useState(false);
  const [knnK, setKnnK] = useState(5);
  const [knnAnchor, setKnnAnchor] = useState<string | null>(null);
  const [showKmeans, setShowKmeans] = useState(false);
  const [kmeansK, setKmeansK] = useState(4);
  const [showMahalanobis, setShowMahalanobis] = useState(false);
  const [mahalThreshold, setMahalThreshold] = useState(2.5);
  const [showHulls, setShowHulls] = useState(false);
  const [showKde, setShowKde] = useState(false);
  const [showLoess, setShowLoess] = useState(false);
  const [loessSpan, setLoessSpan] = useState(0.5);
  const [showConfBand, setShowConfBand] = useState(false);
  const [confLevel, setConfLevel] = useState(95);
  const [showMarginals, setShowMarginals] = useState(false);
  // Forward-return analytics (requires a historical as-of date)
  const [showFwd, setShowFwd] = useState(false);
  const [fwdHorizon, setFwdHorizon] = useState("63");
  const [colorByFwd, setColorByFwd] = useState(false);
  // Quintile backtest of the current plane as a factor
  const [showBacktest, setShowBacktest] = useState(false);
  const [btSignal, setBtSignal] = useState("residual");
  const [btStep, setBtStep] = useState("21");
  const [btLookback, setBtLookback] = useState("756");
  const [btRun, setBtRun] = useState<{ x: string; y: string; step: number; periods: number; end?: string } | null>(null);

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
      dragMode,
      showKnn, knnK, knnAnchor, showKmeans, kmeansK, showMahalanobis, mahalThreshold,
      showHulls, showKde, showLoess, loessSpan, showConfBand, confLevel, showMarginals,
      showFwd, fwdHorizon, colorByFwd,
      showBacktest, btSignal, btStep, btLookback,
    }),
    [metricX, metricY, metricZ, classFilters, manualTickers, colorBy, colorMode, colorMetric,
      showRegression, showOutliers, showQuadrants, refLineX, refLineY, logX, logY, regressionLevel, dragMode,
      showKnn, knnK, knnAnchor, showKmeans, kmeansK, showMahalanobis, mahalThreshold,
      showHulls, showKde, showLoess, loessSpan, showConfBand, confLevel, showMarginals,
      showFwd, fwdHorizon, colorByFwd,
      showBacktest, btSignal, btStep, btLookback]
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
    if (saved.dragMode !== undefined) setDragMode(saved.dragMode);
    if (saved.showKnn !== undefined) setShowKnn(saved.showKnn);
    if (saved.knnK !== undefined) setKnnK(saved.knnK);
    if (saved.knnAnchor !== undefined) setKnnAnchor(saved.knnAnchor);
    if (saved.showKmeans !== undefined) setShowKmeans(saved.showKmeans);
    if (saved.kmeansK !== undefined) setKmeansK(saved.kmeansK);
    if (saved.showMahalanobis !== undefined) setShowMahalanobis(saved.showMahalanobis);
    if (saved.mahalThreshold !== undefined) setMahalThreshold(saved.mahalThreshold);
    if (saved.showHulls !== undefined) setShowHulls(saved.showHulls);
    if (saved.showKde !== undefined) setShowKde(saved.showKde);
    if (saved.showLoess !== undefined) setShowLoess(saved.showLoess);
    if (saved.loessSpan !== undefined) setLoessSpan(saved.loessSpan);
    if (saved.showConfBand !== undefined) setShowConfBand(saved.showConfBand);
    if (saved.confLevel !== undefined) setConfLevel(saved.confLevel);
    if (saved.showMarginals !== undefined) setShowMarginals(saved.showMarginals);
    if (saved.showFwd !== undefined) setShowFwd(saved.showFwd);
    if (saved.fwdHorizon !== undefined) setFwdHorizon(saved.fwdHorizon);
    if (saved.colorByFwd !== undefined) setColorByFwd(saved.colorByFwd);
    if (saved.showBacktest !== undefined) setShowBacktest(saved.showBacktest);
    if (saved.btSignal !== undefined) setBtSignal(saved.btSignal);
    if (saved.btStep !== undefined) setBtStep(saved.btStep);
    if (saved.btLookback !== undefined) setBtLookback(saved.btLookback);
  }, []);

  useWorkspaceState(stateKey, getState, restoreState);

  // ── Saved layout presets ──
  const [savedPresets, setSavedPresets] = useState<Record<string, any>>(() => loadSavedPresets());
  const handleSavePreset = useCallback(() => {
    const name = window.prompt("Preset name:", `${metricX} vs ${metricY}`);
    if (!name || !name.trim()) return;
    const next = { ...loadSavedPresets(), [name.trim()]: getState() };
    persistSavedPresets(next);
    setSavedPresets(next);
  }, [metricX, metricY, getState]);
  const handleApplyPreset = useCallback((name: string) => {
    const preset = loadSavedPresets()[name];
    if (preset) restoreState(preset);
  }, [restoreState]);
  const handleDeletePreset = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const next = { ...loadSavedPresets() };
    delete next[name];
    persistSavedPresets(next);
    setSavedPresets(next);
  }, []);

  const [resizeTick, setResizeTick] = useState(0);
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

  // Scale decimal-stored percent metrics (growth, yields, cap rate, …) to percent
  // units at ingestion, so axes/tooltips/CSV show 5% instead of 0.05 with a % suffix.
  const rawPoints: ScatterPoint[] = useMemo(() => {
    const pts = (queryData?.points ?? []) as unknown as ScatterPoint[];
    const mx = metricMultiplier(metricX);
    const my = metricMultiplier(metricY);
    const mz = metricZ !== "none" ? metricMultiplier(metricZ) : 1;
    const mc = resolvedColorMetric ? metricMultiplier(resolvedColorMetric) : 1;
    if (mx === 1 && my === 1 && mz === 1 && mc === 1) return pts;
    return pts.map((p) => ({
      ...p,
      x: p.x !== null && p.x !== undefined ? p.x * mx : p.x,
      y: p.y !== null && p.y !== undefined ? p.y * my : p.y,
      z: p.z !== null && p.z !== undefined ? p.z * mz : p.z,
      colorVal: p.colorVal !== null && p.colorVal !== undefined ? p.colorVal * mc : p.colorVal,
    }));
  }, [queryData, metricX, metricY, metricZ, resolvedColorMetric]);
  const resolvedDate: string = queryData?.resolvedDate ?? "";

  // Country / Exchange geo filter (options derived from the full point pool).
  const geo = useGeoFilter(rawPoints, `${stateKey}-geo`);

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
    pts = geo.filterByGeo(pts);
    return pts;
  }, [rawPoints, searchText, classFilters, manualTickers, universeTickers, geo.filterByGeo]);

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

  const MARGINAL_SIZE = 46;
  const margins = useMemo(
    () => ({ top: 20 + (showMarginals ? MARGINAL_SIZE : 0), right: 30 + (showMarginals ? MARGINAL_SIZE : 0), bottom: 50, left: 60 }),
    [showMarginals]
  );

  // σ-scale of each axis (data units) for distance-based methods & KDE bandwidth.
  const axisStd = useMemo(() => {
    const sx = sampleStdArr(transformedPoints.map((p) => p.x)) || 1;
    const sy = sampleStdArr(transformedPoints.map((p) => p.y)) || 1;
    return { sx, sy };
  }, [transformedPoints]);

  // k-Means clustering over σ-normalized coords → cluster per ticker + centroids (data coords).
  const kmeansResult = useMemo(() => {
    if (!showKmeans || transformedPoints.length < 2) return null;
    const k = Math.max(1, Math.min(kmeansK, transformedPoints.length));
    const norm = transformedPoints.map((p) => ({ x: p.x / axisStd.sx, y: p.y / axisStd.sy }));
    const { labels, centroids } = kMeans(norm, k);
    const clusterOf: Record<string, number> = {};
    transformedPoints.forEach((p, i) => { clusterOf[p.ticker] = labels[i]; });
    return { clusterOf, centroids: centroids.map((c) => ({ x: c.x * axisStd.sx, y: c.y * axisStd.sy })), k };
  }, [showKmeans, kmeansK, transformedPoints, axisStd]);

  // k-Nearest-Neighbors of the clicked anchor (σ-normalized Euclidean).
  const knnResult = useMemo(() => {
    if (!showKnn || !knnAnchor) return null;
    const anchor = transformedPoints.find((p) => p.ticker === knnAnchor);
    if (!anchor) return null;
    const ax = anchor.x / axisStd.sx, ay = anchor.y / axisStd.sy;
    const dists = transformedPoints
      .filter((p) => p.ticker !== knnAnchor)
      .map((p) => ({ ticker: p.ticker, d: Math.hypot(p.x / axisStd.sx - ax, p.y / axisStd.sy - ay) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.max(1, knnK));
    return { anchor: knnAnchor, neighbors: dists, neighborSet: new Set(dists.map((n) => n.ticker)) };
  }, [showKnn, knnAnchor, knnK, transformedPoints, axisStd]);

  // ── Forward-return analytics ──
  // Trading-date axis (for horizon → forward-date resolution).
  const { data: allDates } = useQuery({
    queryKey: ["dates"],
    queryFn: getDates,
    staleTime: Infinity,
    enabled: showFwd,
  });

  // Resolve as-of + forward trading dates. Null when as-of is the latest date
  // (no forward window exists) — the UI hints to pick a historical date.
  const fwdInfo = useMemo(() => {
    if (!showFwd || !allDates || allDates.length === 0 || !resolvedDate) return null;
    const asOfIdx = allDates.indexOf(resolvedDate);
    if (asOfIdx < 0) return null;
    const wantIdx = asOfIdx + (parseInt(fwdHorizon) || 63);
    const fwdIdx = Math.min(wantIdx, allDates.length - 1);
    if (fwdIdx <= asOfIdx) return null;
    return {
      asOfDate: allDates[asOfIdx],
      fwdDate: allDates[fwdIdx],
      actualDays: fwdIdx - asOfIdx,
      truncated: wantIdx > allDates.length - 1,
    };
  }, [showFwd, allDates, resolvedDate, fwdHorizon]);

  // ticker → forward return % over the horizon, from two whole-universe close snapshots.
  const { data: fwdReturns } = useQuery({
    queryKey: ["scatter-fwd", fwdInfo?.asOfDate, fwdInfo?.fwdDate],
    enabled: !!fwdInfo,
    staleTime: Infinity,
    queryFn: async () => {
      const [asOf, fwd] = await Promise.all([
        fetchScatterData("close", "close", undefined, fwdInfo!.asOfDate),
        fetchScatterData("close", "close", undefined, fwdInfo!.fwdDate),
      ]);
      const asOfClose: Record<string, number> = {};
      for (const p of asOf.points) if (p.x !== null && p.x !== undefined) asOfClose[p.ticker] = p.x;
      const rets: Record<string, number> = {};
      for (const p of fwd.points) {
        const c0 = asOfClose[p.ticker];
        if (p.x !== null && p.x !== undefined && c0 !== undefined && c0 > 0) {
          rets[p.ticker] = (p.x / c0 - 1) * 100;
        }
      }
      return rets;
    },
  });

  const activeFwdReturns = showFwd && fwdInfo ? fwdReturns : undefined;

  // Universe (visible points) forward-return summary — the benchmark.
  const universeFwd = useMemo(() => {
    if (!activeFwdReturns) return null;
    return retSummary(
      transformedPoints
        .map((p) => activeFwdReturns[p.ticker])
        .filter((v): v is number => v !== undefined)
    );
  }, [activeFwdReturns, transformedPoints]);

  // KNN cohort forward performance: anchor, each neighbor, and cohort stats vs universe.
  const knnFwd = useMemo(() => {
    if (!activeFwdReturns || !knnResult) return null;
    const anchorRet = activeFwdReturns[knnResult.anchor];
    const rows = knnResult.neighbors.map((n) => ({
      ticker: n.ticker,
      d: n.d,
      ret: activeFwdReturns[n.ticker],
    }));
    const cohort = retSummary(rows.map((r) => r.ret).filter((v): v is number => v !== undefined));
    return { anchorRet, rows, cohort };
  }, [activeFwdReturns, knnResult]);

  // Neighborhood IC: corr(own fwd return, avg fwd return of k nearest neighbors).
  // High IC ⇒ position in this X/Y plane clustered forward outcomes (was predictive).
  const neighborhoodIC = useMemo(() => {
    if (!activeFwdReturns) return null;
    const pts = transformedPoints
      .filter((p) => activeFwdReturns[p.ticker] !== undefined)
      .map((p) => ({ x: p.x / axisStd.sx, y: p.y / axisStd.sy, ret: activeFwdReturns[p.ticker]! }));
    const n = pts.length;
    if (n < 10) return null;
    const own: number[] = [], nbAvg: number[] = [];
    for (let i = 0; i < n; i++) {
      const ds: { d: number; ret: number }[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        ds.push({ d: (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2, ret: pts[j].ret });
      }
      ds.sort((a, b) => a.d - b.d);
      const kk = Math.min(Math.max(1, knnK), ds.length);
      let s = 0;
      for (let m = 0; m < kk; m++) s += ds[m].ret;
      own.push(pts[i].ret);
      nbAvg.push(s / kk);
    }
    return { ic: pearsonCorr(own, nbAvg), n };
  }, [activeFwdReturns, transformedPoints, axisStd, knnK]);

  // Symmetric color scale for fwd-return coloring (red = worst, green = best).
  const fwdColorScale = useMemo(() => {
    if (!colorByFwd || !activeFwdReturns) return null;
    let maxAbs = 0;
    for (const p of transformedPoints) {
      const r = activeFwdReturns[p.ticker];
      if (r !== undefined && Math.abs(r) > maxAbs) maxAbs = Math.abs(r);
    }
    return maxAbs > 0 ? { maxAbs } : null;
  }, [colorByFwd, activeFwdReturns, transformedPoints]);

  // ── Quintile backtest of the plane ──
  // Universe membership for the backtest: current classification/search/manual/geo
  // filters, but WITHOUT the x/y-non-null requirement (that's per-date in history).
  const eligibleTickers = useMemo(() => {
    let pts = rawPoints;
    if (universeTickers) pts = pts.filter((p) => universeTickers.has(p.ticker));
    pts = filterScatterPoints(pts, classFilters, searchText, manualTickers);
    pts = geo.filterByGeo(pts);
    return new Set(pts.map((p) => p.ticker));
  }, [rawPoints, universeTickers, classFilters, searchText, manualTickers, geo.filterByGeo]);

  const { data: btData, isFetching: btLoading, error: btError } = useQuery({
    queryKey: ["scatter-backtest", btRun],
    enabled: !!btRun,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const params = new URLSearchParams({
        x: btRun!.x, y: btRun!.y,
        step: String(btRun!.step), periods: String(btRun!.periods),
      });
      if (btRun!.end) params.set("end", btRun!.end);
      const res = await fetch(`/api/scatter-backtest?${params.toString()}`);
      if (!res.ok) throw new Error(`Backtest data: HTTP ${res.status}`);
      return res.json() as Promise<{
        dates: string[];
        step: number;
        tickers: { ticker: string; x: (number | null)[] | null; y: (number | null)[] | null; close: (number | null)[] | null }[];
      }>;
    },
  });

  // Rebalance each sampled date: rank by signal into quintiles, hold to the next
  // sample, compound equal-weight quintile returns + Q5−Q1 spread + Spearman IC.
  const btResult = useMemo(() => {
    if (!btData) return null;
    const rows = btData.tickers.filter((t) => eligibleTickers.has(t.ticker));
    const nD = btData.dates.length;
    const quintRets: number[][] = [];
    const ics: number[] = [];
    const usedDates: string[] = [];
    let namesSum = 0;
    for (let t = 0; t + 1 < nD; t++) {
      const entries: { x: number; y: number; ret: number }[] = [];
      for (const r of rows) {
        const x = r.x?.[t], y = r.y?.[t], c0 = r.close?.[t], c1 = r.close?.[t + 1];
        if (x == null || y == null || c0 == null || c1 == null || c0 <= 0) continue;
        entries.push({ x, y, ret: c1 / c0 - 1 });
      }
      if (entries.length < 2 * BT_Q) continue;
      // Skip dead periods (stale/ffilled closes at the data edge → all-zero returns).
      if (entries.filter((e) => e.ret !== 0).length < entries.length * 0.2) continue;
      let sigs: number[];
      if (btSignal === "x") sigs = entries.map((e) => e.x);
      else if (btSignal === "y") sigs = entries.map((e) => e.y);
      else {
        const reg = computeRegression(entries);
        sigs = entries.map((e) => e.y - (reg.slope * e.x + reg.intercept));
      }
      const order = sigs.map((s, i) => [s, i] as [number, number]).sort((a, b) => a[0] - b[0]);
      const qSum = new Array(BT_Q).fill(0);
      const qN = new Array(BT_Q).fill(0);
      order.forEach(([, i], pos) => {
        const q = Math.min(BT_Q - 1, Math.floor((pos * BT_Q) / order.length));
        qSum[q] += entries[i].ret;
        qN[q]++;
      });
      quintRets.push(qSum.map((s, q) => (qN[q] ? s / qN[q] : 0)));
      ics.push(spearmanCorr(sigs, entries.map((e) => e.ret)));
      usedDates.push(btData.dates[t + 1]);
      namesSum += entries.length;
    }
    if (quintRets.length < 3) return null;
    const curves: number[][] = Array.from({ length: BT_Q }, () => [1]);
    const spreadCurve: number[] = [1];
    for (let t = 0; t < quintRets.length; t++) {
      for (let q = 0; q < BT_Q; q++) curves[q].push(curves[q][t] * (1 + quintRets[t][q]));
      spreadCurve.push(spreadCurve[t] * (1 + quintRets[t][BT_Q - 1] - quintRets[t][0]));
    }
    const perYear = 252 / btData.step;
    const ann = (curve: number[]) =>
      (Math.pow(curve[curve.length - 1], perYear / (curve.length - 1)) - 1) * 100;
    const icMean = ics.reduce((s, v) => s + v, 0) / ics.length;
    const icStd = sampleStdArr(ics);
    return {
      usedDates,
      curves,
      spreadCurve,
      annQ: curves.map(ann),
      annSpread: ann(spreadCurve),
      spreadHit: (quintRets.filter((r) => r[BT_Q - 1] - r[0] > 0).length / quintRets.length) * 100,
      icMean,
      icT: icStd > 0 ? icMean / (icStd / Math.sqrt(ics.length)) : 0,
      nPeriods: quintRets.length,
      avgNames: namesSum / quintRets.length,
    };
  }, [btData, btSignal, eligibleTickers]);

  const btCanvasRef = useRef<HTMLCanvasElement>(null);

  // Draw the backtest equity curves (Q1..Q5 + Q5−Q1 spread).
  useEffect(() => {
    const canvas = btCanvasRef.current;
    if (!canvas || !btResult) return;
    const rect = canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width, h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const mL = 44, mR = 10, mT = 10, mB = 22;
    const plotW = w - mL - mR, plotH = h - mT - mB;
    const all = [...btResult.curves.flat(), ...btResult.spreadCurve];
    let vMin = Math.min(...all), vMax = Math.max(...all);
    const pad = (vMax - vMin || 1) * 0.05;
    vMin -= pad; vMax += pad;
    const n = btResult.curves[0].length;
    const px = (i: number) => mL + (plotW * i) / (n - 1);
    const py = (v: number) => mT + plotH - ((v - vMin) / (vMax - vMin)) * plotH;

    // Grid + y labels (growth multiples)
    ctx.font = "9px 'JetBrains Mono', monospace";
    for (let g = 0; g <= 4; g++) {
      const v = vMin + ((vMax - vMin) * g) / 4;
      const y = py(v);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(mL, y); ctx.lineTo(mL + plotW, y); ctx.stroke();
      ctx.fillStyle = "#7a8a9e";
      ctx.textAlign = "right";
      ctx.fillText(`${v.toFixed(2)}x`, mL - 4, y + 3);
    }
    // 1.0x reference
    const y1 = py(1);
    if (y1 >= mT && y1 <= mT + plotH) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(mL, y1); ctx.lineTo(mL + plotW, y1); ctx.stroke();
      ctx.setLineDash([]);
    }
    // x date labels
    ctx.fillStyle = "#7a8a9e";
    ctx.textAlign = "center";
    for (let g = 0; g <= 3; g++) {
      const i = Math.round(((n - 1) * g) / 3);
      const di = Math.max(0, Math.min(btResult.usedDates.length - 1, i - 1));
      ctx.fillText(btResult.usedDates[di], px(i), h - 8);
    }

    const drawCurve = (curve: number[], color: string, width: number, dash?: number[]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      curve.forEach((v, i) => { const X = px(i), Y = py(v); if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
      ctx.stroke();
      ctx.setLineDash([]);
    };
    btResult.curves.forEach((c, q) => drawCurve(c, BT_QUINT_COLORS[q], q === 0 || q === BT_Q - 1 ? 2 : 1.25));
    drawCurve(btResult.spreadCurve, "#06b6d4", 2, [6, 3]);
  }, [btResult, showBacktest, resizeTick]);

  // Mahalanobis outliers (scale-invariant, uses X/Y covariance).
  const mahalResult = useMemo(() => {
    if (!showMahalanobis || transformedPoints.length < 4) return null;
    const dists = mahalanobisDist(transformedPoints.map((p) => ({ x: p.x, y: p.y })));
    const flagged = new Set<string>();
    transformedPoints.forEach((p, i) => { if (dists[i] > mahalThreshold) flagged.add(p.ticker); });
    return { flagged };
  }, [showMahalanobis, mahalThreshold, transformedPoints]);

  // Convex hulls per current color-by classification group (data coords).
  const hullsResult = useMemo(() => {
    if (!showHulls) return null;
    const groups: Record<string, XY[]> = {};
    for (const p of transformedPoints) { const key = (p as any)[colorBy] || "Other"; (groups[key] ||= []).push({ x: p.x, y: p.y }); }
    return Object.entries(groups)
      .filter(([, pts]) => pts.length >= 3)
      .map(([group, pts]) => ({ group, hull: convexHull(pts) }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [showHulls, transformedPoints, colorBy]);

  // LOESS smooth curve (data coords).
  const loessResult = useMemo(
    () => (!showLoess || transformedPoints.length < 6 ? null : loessCurve(transformedPoints.map((p) => ({ x: p.x, y: p.y })), loessSpan)),
    [showLoess, transformedPoints, loessSpan]
  );

  // Confidence band around the OLS mean response.
  const confBandResult = useMemo(() => {
    if (!showConfBand || !overallRegression || transformedPoints.length < 4) return null;
    const { slope, intercept } = overallRegression;
    const n = transformedPoints.length;
    const mx = transformedPoints.reduce((s, p) => s + p.x, 0) / n;
    const ssxx = transformedPoints.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    let sse = 0;
    for (const p of transformedPoints) { const r = p.y - (slope * p.x + intercept); sse += r * r; }
    const dof = n - 2;
    if (dof < 1 || ssxx <= 0) return null;
    const se = Math.sqrt(sse / dof);
    return { slope, intercept, se, t: tCritical(confLevel / 100, dof), mx, ssxx, n };
  }, [showConfBand, overallRegression, transformedPoints, confLevel]);

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

    // KDE density heat layer (under everything)
    if (showKde && transformedPoints.length >= 5) {
      const nP = transformedPoints.length;
      const bwx = (1.06 * axisStd.sx * Math.pow(nP, -0.2)) || 1e-6;
      const bwy = (1.06 * axisStd.sy * Math.pow(nP, -0.2)) || 1e-6;
      const GN = 44;
      const grid: number[] = new Array(GN * GN).fill(0);
      let maxD = 0;
      for (let gy = 0; gy < GN; gy++) {
        const dataY = yMin + ((gy + 0.5) / GN) * (yMax - yMin);
        for (let gx = 0; gx < GN; gx++) {
          const dataX = xMin + ((gx + 0.5) / GN) * (xMax - xMin);
          let d = 0;
          for (const p of transformedPoints) {
            const ux = (dataX - p.x) / bwx, uy = (dataY - p.y) / bwy;
            d += Math.exp(-0.5 * (ux * ux + uy * uy));
          }
          grid[gy * GN + gx] = d;
          if (d > maxD) maxD = d;
        }
      }
      if (maxD > 0) {
        const xEdge = (i: number) => tx(xMin + (i / GN) * (xMax - xMin));
        const yEdge = (j: number) => ty(yMin + (j / GN) * (yMax - yMin));
        for (let gy = 0; gy < GN; gy++) {
          for (let gx = 0; gx < GN; gx++) {
            const t = grid[gy * GN + gx] / maxD;
            if (t < 0.08) continue;
            const band = Math.ceil(t * 5) / 5; // quantize into contour-like bands
            ctx.fillStyle = `rgba(14,165,233,${(0.05 + 0.32 * band).toFixed(3)})`;
            const l = xEdge(gx), r = xEdge(gx + 1), b = yEdge(gy), tEdge = yEdge(gy + 1);
            ctx.fillRect(l - 0.5, tEdge - 0.5, (r - l) + 1, (b - tEdge) + 1);
          }
        }
      }
    }

    // Convex hulls per color-by group (under points)
    if (hullsResult) {
      hullsResult.forEach((h, idx) => {
        if (h.hull.length < 3) return;
        const base = GROUP_COLORS[idx % GROUP_COLORS.length];
        ctx.beginPath();
        h.hull.forEach((pt, i) => { const px = tx(pt.x), py = ty(pt.y); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
        ctx.closePath();
        ctx.fillStyle = base.replace("0.7)", "0.08)");
        ctx.fill();
        ctx.strokeStyle = base.replace("0.7)", "0.55)");
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

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

    // Regression confidence band (mean-response CI around the OLS line)
    if (confBandResult) {
      const { slope, intercept, se, t, mx, ssxx, n: nB } = confBandResult;
      const steps = 48;
      const upper: [number, number][] = [];
      const lower: [number, number][] = [];
      for (let i = 0; i <= steps; i++) {
        const xv = xMin + ((xMax - xMin) * i) / steps;
        const yv = slope * xv + intercept;
        const half = t * se * Math.sqrt(1 / nB + ((xv - mx) ** 2) / ssxx);
        upper.push([tx(xv), ty(yv + half)]);
        lower.push([tx(xv), ty(yv - half)]);
      }
      ctx.beginPath();
      upper.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i][0], lower[i][1]);
      ctx.closePath();
      ctx.fillStyle = "rgba(239,68,68,0.10)";
      ctx.fill();
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
      if (fwdColorScale && activeFwdReturns) {
        const r = activeFwdReturns[p.ticker];
        if (r === undefined) return "#475569";
        return hslGradientHex(0.5 + r / (2 * fwdColorScale.maxAbs));
      }
      if (kmeansResult) {
        const c = kmeansResult.clusterOf[p.ticker] ?? 0;
        return CLUSTER_COLORS[c % CLUSTER_COLORS.length];
      }
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

      if (mahalResult?.flagged.has(p.ticker)) {
        ctx.strokeStyle = "#d946ef";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.arc(px, py, radius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (knnResult) {
        if (p.ticker === knnResult.anchor) {
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(px, py, radius + 4, 0, Math.PI * 2); ctx.stroke();
        } else if (knnResult.neighborSet.has(p.ticker)) {
          ctx.strokeStyle = "#06b6d4";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(px, py, radius + 3, 0, Math.PI * 2); ctx.stroke();
        }
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

    // KNN connector lines
    if (knnResult) {
      const anchorP = transformedPoints.find((p) => p.ticker === knnResult.anchor);
      if (anchorP) {
        const ax = tx(anchorP.x), ay = ty(anchorP.y);
        ctx.strokeStyle = "rgba(6,182,212,0.5)";
        ctx.lineWidth = 1;
        for (const nb of knnResult.neighbors) {
          const np = transformedPoints.find((p) => p.ticker === nb.ticker);
          if (!np) continue;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx(np.x), ty(np.y)); ctx.stroke();
        }
      }
    }

    // k-means centroids (diamond markers)
    if (kmeansResult) {
      kmeansResult.centroids.forEach((c, i) => {
        const cx = tx(c.x), cy = ty(c.y);
        ctx.fillStyle = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 7, cy); ctx.closePath();
        ctx.fill(); ctx.stroke();
      });
    }

    // LOESS smooth curve (over points)
    if (loessResult && loessResult.length > 1) {
      ctx.strokeStyle = "rgba(168,85,247,0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      loessResult.forEach((pt, i) => { const px = tx(pt.x), py = ty(pt.y); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
      ctx.stroke();
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
        if (activeFwdReturns && activeFwdReturns[p.ticker] !== undefined) {
          const r = activeFwdReturns[p.ticker];
          label += `, fwd=${r >= 0 ? "+" : ""}${r.toFixed(1)}%`;
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

    // Marginal histograms (in the top & right margins, outside the plot clip)
    if (showMarginals && transformedPoints.length > 1) {
      const BINS = 24;
      const xSpanM = (xMax - xMin) || 1;
      const ySpanM = (yMax - yMin) || 1;
      // X histogram along the top strip
      const binX = new Array(BINS).fill(0);
      for (const p of transformedPoints) { let b = Math.floor(((p.x - xMin) / xSpanM) * BINS); b = Math.max(0, Math.min(BINS - 1, b)); binX[b]++; }
      const maxX = Math.max(...binX, 1);
      const areaH = MARGINAL_SIZE - 8;
      const bwX = plotW / BINS;
      ctx.fillStyle = "rgba(14,165,233,0.5)";
      for (let b = 0; b < BINS; b++) {
        const hgt = (binX[b] / maxX) * areaH;
        ctx.fillRect(margins.left + b * bwX + 0.5, margins.top - 4 - hgt, bwX - 1, hgt);
      }
      // Y histogram along the right strip
      const binY = new Array(BINS).fill(0);
      for (const p of transformedPoints) { let b = Math.floor(((p.y - yMin) / ySpanM) * BINS); b = Math.max(0, Math.min(BINS - 1, b)); binY[b]++; }
      const maxY = Math.max(...binY, 1);
      const areaW = MARGINAL_SIZE - 8;
      const rightX = margins.left + plotW + 4;
      const bhY = plotH / BINS;
      for (let b = 0; b < BINS; b++) {
        const wdt = (binY[b] / maxY) * areaW;
        const yTop = ty(yMin + ((b + 1) / BINS) * ySpanM);
        ctx.fillRect(rightX, yTop, wdt, bhY - 1);
      }
    }
  }, [
    transformedPoints, metricX, metricY, metricZ, hoveredTicker, colorBy, categoryColorMap,
    bubbleSizeRange, showRegression, overallRegression, groupRegressions, showOutliers, outlierTickers,
    showQuadrants, refX, refY, activeRange, getScaleHelpers, margins, dragState, viewRange,
    logX, logY, colorMode, colorMetric, colorMetricRange,
    kmeansResult, knnResult, mahalResult, hullsResult, loessResult, confBandResult,
    showKde, showMarginals, axisStd, activeFwdReturns, fwdColorScale, resizeTick,
  ]);

  // ---- Mouse handlers ----
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const isPan = e.button === 1 || e.button === 2 || e.shiftKey || dragMode === "pan";
    const state: DragState = { type: isPan ? "pan" : "select", startX: x, startY: y, currentX: x, currentY: y, button: e.button };
    dragRef.current = state;
    if (!isPan) setDragState(state);
  }, [dragMode]);

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
      if (!drag) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const dw = Math.abs(drag.currentX - drag.startX);
      const dh = Math.abs(drag.currentY - drag.startY);
      // A near-stationary LEFT press counts as a click in both drag modes, so
      // point navigation / KNN anchoring keep working in pan mode.
      if (dw < 5 && dh < 5 && (drag.button ?? 0) === 0) {
        if (hoveredTicker) {
          if (showKnn) setKnnAnchor((prev) => (prev === hoveredTicker ? null : hoveredTicker));
          else navigateToTicker(hoveredTicker);
        }
        return;
      }
      if (drag.type !== "select") return;
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
    [getScaleHelpers, viewRange, naturalRange, hoveredTicker, showKnn]
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
    // Bump a real state value — setHoveredTicker(t => t) bails out on identical
    // values, so the chart never redrew (and the canvas kept a stale overhanging
    // size) when the container resized, e.g. when the backtest panel opens.
    const observer = new ResizeObserver(() => {
      setResizeTick((t) => t + 1);
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
    const fwdCol = activeFwdReturns && fwdInfo ? `,Fwd ${FWD_HORIZONS.find((h) => h.key === fwdHorizon)?.label ?? fwdHorizon} %` : "";
    const header = `Ticker,Name,Subindustry,${metricX},${metricY}${metricZ !== "none" ? "," + metricZ : ""}${extraCol}${overallRegression ? ",Residual" : ""}${fwdCol}`;
    const rows = transformedPoints.map((p) => {
      let row = `${p.ticker},"${p.name}","${p.subindustry}",${p.x},${p.y}${metricZ !== "none" ? "," + (p.z ?? "") : ""}`;
      if (colorMode === "metric") row += `,${p.colorVal ?? ""}`;
      if (overallRegression) {
        const resid = p.y - (overallRegression.slope * p.x + overallRegression.intercept);
        row += `,${resid.toFixed(4)}`;
      }
      if (activeFwdReturns && fwdInfo) row += `,${activeFwdReturns[p.ticker]?.toFixed(4) ?? ""}`;
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
        <DropdownMenu onOpenChange={(open) => { if (open) setSavedPresets(loadSavedPresets()); }}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px] px-2">
              <LayoutGrid className="w-3 h-3" />
              Templates
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem
              className="text-[11px] cursor-pointer gap-1.5"
              onClick={handleSavePreset}
              data-testid="scatter-save-preset"
            >
              <Save className="w-3 h-3" />
              Save current layout as preset…
            </DropdownMenuItem>
            {Object.keys(savedPresets).length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px]">My Presets</DropdownMenuLabel>
                {Object.keys(savedPresets).sort().map((name) => (
                  <DropdownMenuItem
                    key={name}
                    className="text-[11px] cursor-pointer flex items-center justify-between gap-2"
                    onClick={() => handleApplyPreset(name)}
                    data-testid={`scatter-preset-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                  >
                    <span className="truncate">{name}</span>
                    <button
                      className="flex-shrink-0 text-muted-foreground hover:text-red-400"
                      onClick={(e) => handleDeletePreset(name, e)}
                      title="Delete preset"
                      data-testid={`scatter-preset-del-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px]">Preset Views</DropdownMenuLabel>
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
        <MetricPicker value={metricX} onChange={setMetricX} testId="scatter-x" uploadedColumns={uploadedColumns} groups={metricGroups} />
        <span className="text-xs font-semibold text-muted-foreground">Y</span>
        <MetricPicker value={metricY} onChange={setMetricY} testId="scatter-y" uploadedColumns={uploadedColumns} groups={metricGroups} />
        <span className="text-xs font-semibold text-muted-foreground">Size</span>
        <Select value={metricZ} onValueChange={setMetricZ}>
          <SelectTrigger className="h-6 text-[11px] w-[180px]" data-testid="scatter-z">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (uniform)</SelectItem>
            {metricGroups.map(({ category, metrics }) => (
              <div key={category}>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{category}</div>
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
          <SelectTrigger className="h-6 text-[11px] w-auto min-w-[120px]" data-testid="scatter-color-mode">
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
          <MetricPicker value={colorMetric} onChange={setColorMetric} testId="scatter-color-metric" uploadedColumns={uploadedColumns} groups={metricGroups} />
        )}
        <div className="h-5 w-px bg-border mx-0.5" />
        <span className="text-xs font-semibold text-muted-foreground">Date</span>
        <DateInput
          value={dateOverride}
          onChange={setDateOverride}
          className="h-6 text-[11px] w-[130px] bg-background"
          data-testid="scatter-date"
        />
        {dateOverride && (
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setDateOverride("")}>
            Latest
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {paneCount > 1 && (
            <span className="text-[10px] text-muted-foreground font-mono">pane {paneId}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 text-[11px] px-2"
            onClick={onAdd}
            title="Add another independent scatter below"
            data-testid="scatter-add-pane"
          >
            <Plus className="w-3 h-3" />
            Add scatter
          </Button>
          {paneCount > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 text-[11px] px-2 text-red-400 hover:text-red-300"
              onClick={onRemove}
              title="Remove this scatter pane"
              data-testid={`scatter-remove-pane-${paneId}`}
            >
              <X className="w-3 h-3" />
              Remove
            </Button>
          )}
        </div>
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
            <SelectTrigger className="h-6 text-[11px] w-auto min-w-[155px]">
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
            <span className="text-[10px] text-muted-foreground" title="Vertical divider position on the X axis (defaults to the median)">X split</span>
            <Input
              type="number"
              step="any"
              placeholder="X ref"
              value={refLineX}
              onChange={(e) => setRefLineX(e.target.value)}
              className="h-6 text-[11px] w-[70px] bg-background"
              data-testid="ref-line-x"
              title="Vertical divider position on the X axis (defaults to the median)"
            />
            <span className="text-[10px] text-muted-foreground" title="Horizontal divider position on the Y axis (defaults to the median)">Y split</span>
            <Input
              type="number"
              step="any"
              placeholder="Y ref"
              value={refLineY}
              onChange={(e) => setRefLineY(e.target.value)}
              className="h-6 text-[11px] w-[70px] bg-background"
              data-testid="ref-line-y"
              title="Horizontal divider position on the Y axis (defaults to the median)"
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
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-1.5" title="On: drag pans the view (shift+drag always pans). Off: drag draws a zoom box.">
          <Hand className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">Pan drag</span>
          <Switch
            checked={dragMode === "pan"}
            onCheckedChange={(v) => setDragMode(v ? "pan" : "select")}
            className="scale-75"
            data-testid="scatter-pan-mode"
          />
        </div>
      </div>

      {/* Toolbar row 2.5: Stats / ML overlays */}
      <div className="flex items-center gap-3 px-3 py-1 border-b border-border/50 flex-wrap">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Stats / ML</span>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">KNN</span>
          <Switch checked={showKnn} onCheckedChange={setShowKnn} className="scale-75" data-testid="scatter-knn" />
          {showKnn && (
            <>
              <span className="text-[10px] text-muted-foreground" title="Number of nearest neighbors">k</span>
              <Input type="number" min={1} max={30} value={knnK} onChange={(e) => setKnnK(Math.max(1, Math.min(30, parseInt(e.target.value) || 5)))} className="h-6 w-[54px] text-[11px] bg-background" title="Number of nearest neighbors" />
              <span className="text-[10px] text-cyan-400 font-mono">{knnAnchor ? `→ ${knnAnchor}` : "click a point"}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">k-Means</span>
          <Switch checked={showKmeans} onCheckedChange={setShowKmeans} className="scale-75" data-testid="scatter-kmeans" />
          {showKmeans && (
            <>
              <span className="text-[10px] text-muted-foreground" title="Number of clusters">k</span>
              <Input type="number" min={2} max={12} value={kmeansK} onChange={(e) => setKmeansK(Math.max(1, Math.min(12, parseInt(e.target.value) || 4)))} className="h-6 w-[54px] text-[11px] bg-background" title="Number of clusters" />
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Mahalanobis</span>
          <Switch checked={showMahalanobis} onCheckedChange={setShowMahalanobis} className="scale-75" data-testid="scatter-mahalanobis" />
          {showMahalanobis && (
            <>
              <span className="text-[10px] text-muted-foreground" title="Flag points farther than this many σ from the centroid">σ ≥</span>
              <Input type="number" step="0.1" min={0.5} value={mahalThreshold} onChange={(e) => setMahalThreshold(parseFloat(e.target.value) || 2.5)} className="h-6 w-[62px] text-[11px] bg-background" title="Flag points farther than this many σ from the centroid" />
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Hulls</span>
          <Switch checked={showHulls} onCheckedChange={setShowHulls} className="scale-75" data-testid="scatter-hulls" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Density</span>
          <Switch checked={showKde} onCheckedChange={setShowKde} className="scale-75" data-testid="scatter-kde" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">LOESS</span>
          <Switch checked={showLoess} onCheckedChange={setShowLoess} className="scale-75" data-testid="scatter-loess" />
          {showLoess && (
            <>
              <span className="text-[10px] text-muted-foreground" title="Smoothing span: fraction of points in each local fit (higher = smoother)">span</span>
              <Input type="number" step="0.05" min={0.1} max={1} value={loessSpan} onChange={(e) => setLoessSpan(Math.max(0.1, Math.min(1, parseFloat(e.target.value) || 0.5)))} className="h-6 w-[62px] text-[11px] bg-background" title="Smoothing span: fraction of points in each local fit (higher = smoother)" />
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Conf band</span>
          <Switch checked={showConfBand} onCheckedChange={setShowConfBand} className="scale-75" data-testid="scatter-confband" />
          {showConfBand && (
            <>
              <span className="text-[10px] text-muted-foreground" title="Confidence level of the band around the regression line">CI %</span>
              <Input type="number" step="1" min={50} max={99.9} value={confLevel} onChange={(e) => setConfLevel(Math.max(50, Math.min(99.9, parseFloat(e.target.value) || 95)))} className="h-6 w-[62px] text-[11px] bg-background" title="Confidence level of the band around the regression line" />
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Marginals</span>
          <Switch checked={showMarginals} onCheckedChange={setShowMarginals} className="scale-75" data-testid="scatter-marginals" />
        </div>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Fwd returns</span>
          <Switch checked={showFwd} onCheckedChange={setShowFwd} className="scale-75" data-testid="scatter-fwd" />
          {showFwd && (
            <>
              <Select value={fwdHorizon} onValueChange={setFwdHorizon}>
                <SelectTrigger className="h-6 text-[11px] w-[58px]" data-testid="scatter-fwd-horizon">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FWD_HORIZONS.map((h) => (
                    <SelectItem key={h.key} value={h.key}>{h.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground">color</span>
              <Switch checked={colorByFwd} onCheckedChange={setColorByFwd} className="scale-75" data-testid="scatter-fwd-color" />
              {!fwdInfo && (
                <span className="text-[10px] text-amber-400 font-mono">set a past as-of date</span>
              )}
              {fwdInfo && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {fwdInfo.asOfDate} → {fwdInfo.fwdDate}{fwdInfo.truncated ? ` (only ${fwdInfo.actualDays}d avail)` : ""}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Backtest</span>
          <Switch checked={showBacktest} onCheckedChange={setShowBacktest} className="scale-75" data-testid="scatter-backtest" />
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
          extraFilters={geo.geoFilterUI}
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
        {fwdColorScale ? null : colorMode === "metric" && colorMetricRange ? (
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
                  const updated = new Set<string>((classFilters as any)[colorBy]);
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
        {fwdColorScale && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="h-3 w-px bg-border mx-1" />
            <span className="text-[10px] text-muted-foreground font-mono">
              Fwd {FWD_HORIZONS.find((h) => h.key === fwdHorizon)?.label}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">-{fwdColorScale.maxAbs.toFixed(0)}%</span>
            <div
              className="h-2.5 rounded-sm flex-shrink-0"
              style={{
                width: 90,
                background: `linear-gradient(to right, ${hslGradientColor(0)}, ${hslGradientColor(0.5)}, ${hslGradientColor(1)})`,
              }}
            />
            <span className="text-[10px] text-muted-foreground font-mono">+{fwdColorScale.maxAbs.toFixed(0)}%</span>
          </div>
        )}
        {universeFwd && (
          <div className="flex items-center gap-2 flex-shrink-0" data-testid="scatter-fwd-summary">
            <div className="h-3 w-px bg-border mx-1" />
            <span className="text-[10px] text-sky-400 font-mono">
              Universe fwd (n={universeFwd.n}): avg {universeFwd.mean >= 0 ? "+" : ""}{universeFwd.mean.toFixed(1)}% · med {universeFwd.median >= 0 ? "+" : ""}{universeFwd.median.toFixed(1)}% · hit {universeFwd.hitRate.toFixed(0)}%
            </span>
            {neighborhoodIC && (
              <span
                className="text-[10px] text-purple-400 font-mono"
                title="Corr(own fwd return, avg fwd return of k nearest neighbors). High ⇒ position in this plane clustered outcomes."
              >
                Nbhd IC (k={knnK}): {neighborhoodIC.ic.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative min-h-0 overflow-hidden">
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
                : hoveredTicker ? "pointer" : dragMode === "pan" ? "grab" : "crosshair",
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
        {knnFwd && fwdInfo && (
          <div
            className="absolute bottom-2 left-2 z-10 bg-background/95 backdrop-blur-sm border border-border rounded-md px-3 py-2 max-w-[300px] shadow-lg"
            data-testid="scatter-knn-fwd-panel"
          >
            <div className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider mb-1">
              KNN Fwd Performance · {FWD_HORIZONS.find((h) => h.key === fwdHorizon)?.label}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono mb-1.5">
              {fwdInfo.asOfDate} → {fwdInfo.fwdDate}
            </div>
            <div className="text-[11px] font-mono mb-1">
              <span className="text-amber-400 font-semibold">{knnResult!.anchor}</span>{" "}
              {knnFwd.anchorRet !== undefined ? (
                <span className={knnFwd.anchorRet >= 0 ? "text-green-400" : "text-red-400"}>
                  {knnFwd.anchorRet >= 0 ? "+" : ""}{knnFwd.anchorRet.toFixed(1)}%
                </span>
              ) : (
                <span className="text-muted-foreground">n/a</span>
              )}
            </div>
            <div className="max-h-[130px] overflow-y-auto mb-1.5">
              {knnFwd.rows.map((r) => (
                <div key={r.ticker} className="flex items-center justify-between text-[10px] font-mono gap-3">
                  <span className="text-cyan-300">{r.ticker}</span>
                  <span className="text-muted-foreground">d={r.d.toFixed(2)}</span>
                  {r.ret !== undefined ? (
                    <span className={r.ret >= 0 ? "text-green-400" : "text-red-400"}>
                      {r.ret >= 0 ? "+" : ""}{r.ret.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">n/a</span>
                  )}
                </div>
              ))}
            </div>
            {knnFwd.cohort && (
              <div className="text-[10px] font-mono text-foreground border-t border-border/50 pt-1">
                Neighbors: avg {knnFwd.cohort.mean >= 0 ? "+" : ""}{knnFwd.cohort.mean.toFixed(1)}% · med {knnFwd.cohort.median >= 0 ? "+" : ""}{knnFwd.cohort.median.toFixed(1)}% · hit {knnFwd.cohort.hitRate.toFixed(0)}%
              </div>
            )}
            {knnFwd.cohort && universeFwd && (
              <div className="text-[10px] font-mono text-muted-foreground">
                vs universe avg:{" "}
                <span className={knnFwd.cohort.mean - universeFwd.mean >= 0 ? "text-green-400" : "text-red-400"}>
                  {knnFwd.cohort.mean - universeFwd.mean >= 0 ? "+" : ""}{(knnFwd.cohort.mean - universeFwd.mean).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        )}
        {showFwd && !fwdInfo && !isLoading && (
          <div className="absolute bottom-2 left-2 z-10 bg-background/95 border border-amber-500/40 rounded-md px-3 py-1.5 text-[10px] text-amber-400 font-mono">
            Fwd returns need history: set the as-of Date to a past date, then forward performance is measured from there.
          </div>
        )}
        {!isLoading && (
          <div className="absolute bottom-1 right-2 z-10 text-[9px] text-muted-foreground/60 font-mono pointer-events-none select-none">
            {dragMode === "pan" ? "drag: pan" : "drag: zoom-select · shift+drag: pan"} · scroll: zoom · dbl-click: reset
          </div>
        )}
      </div>

      {/* Backtest panel */}
      {showBacktest && (
        <div className="h-[290px] border-t border-border flex flex-shrink-0 bg-card/40" data-testid="scatter-backtest-panel">
          <div className="w-[340px] border-r border-border/50 p-2.5 flex flex-col gap-2 overflow-y-auto flex-shrink-0">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Plane Backtest — quintiles rebalanced through history
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Select value={btSignal} onValueChange={setBtSignal}>
                <SelectTrigger className="h-6 text-[11px] w-[150px]" data-testid="scatter-bt-signal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BT_SIGNALS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={btStep} onValueChange={setBtStep}>
                <SelectTrigger className="h-6 text-[11px] w-[86px]" data-testid="scatter-bt-step">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BT_STEPS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={btLookback} onValueChange={setBtLookback}>
                <SelectTrigger className="h-6 text-[11px] w-[58px]" data-testid="scatter-bt-lookback">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BT_LOOKBACKS.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2.5"
                disabled={btLoading}
                data-testid="scatter-bt-run"
                onClick={() => {
                  const step = parseInt(btStep) || 21;
                  setBtRun({
                    x: metricX,
                    y: metricY,
                    step,
                    periods: Math.max(2, Math.floor((parseInt(btLookback) || 756) / step)),
                    end: dateOverride || undefined,
                  });
                }}
              >
                {btLoading ? "Running…" : "Run"}
              </Button>
            </div>
            {btRun && (
              <div className="text-[10px] text-muted-foreground font-mono">
                {btRun.x} / {btRun.y} · every {btRun.step}d · {btRun.periods} rebalances{btRun.end ? ` · to ${btRun.end}` : ""}
              </div>
            )}
            {!!btError && (
              <div className="text-[10px] text-red-400 font-mono">{String((btError as Error).message)}</div>
            )}
            {btResult && (
              <div className="flex flex-col gap-0.5" data-testid="scatter-bt-stats">
                {btResult.annQ.map((a, q) => (
                  <div key={q} className="flex items-center justify-between text-[10px] font-mono">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BT_QUINT_COLORS[q] }} />
                      Q{q + 1}{q === 0 ? " (low sig)" : q === BT_Q - 1 ? " (high sig)" : ""}
                    </span>
                    <span className={a >= 0 ? "text-green-400" : "text-red-400"}>
                      {a >= 0 ? "+" : ""}{a.toFixed(1)}%/yr
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-[10px] font-mono border-t border-border/50 pt-1 mt-0.5">
                  <span className="text-cyan-400">Q5−Q1 spread</span>
                  <span className={btResult.annSpread >= 0 ? "text-green-400" : "text-red-400"}>
                    {btResult.annSpread >= 0 ? "+" : ""}{btResult.annSpread.toFixed(1)}%/yr · hit {btResult.spreadHit.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-purple-400">Spearman IC</span>
                  <span>{btResult.icMean.toFixed(3)} (t={btResult.icT.toFixed(1)})</span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {btResult.nPeriods} periods · ~{btResult.avgNames.toFixed(0)} names/rebalance
                </div>
                {btSignal === "residual" && (
                  <div className="text-[9px] text-muted-foreground">
                    Residual: above the fit line = expensive (high signal) — a working valuation plane shows Q1 &gt; Q5 (negative spread).
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 relative min-h-0">
            {btLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">Loading backtest data…</div>
            ) : btResult ? (
              <canvas ref={btCanvasRef} className="w-full h-full" data-testid="scatter-bt-canvas" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                {btData ? "Not enough qualifying history for this configuration." : "Pick signal / frequency / lookback and hit Run."}
              </div>
            )}
          </div>
        </div>
      )}
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
  groups: Array<{ category: string; metrics: string[] }>;
}

function MetricPicker({ value, onChange, testId, uploadedColumns, groups }: MetricPickerProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 text-[11px] w-[180px]" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      {/* No max-h cap: fill the available viewport height below the trigger */}
      <SelectContent>
        {groups.map(({ category, metrics }) => (
          <div key={category}>
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{category}</div>
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
