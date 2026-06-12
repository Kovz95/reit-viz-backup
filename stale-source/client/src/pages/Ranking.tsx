import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMultiMetricForAllTickers, getMetricTrailing, isPercentMetric, getRevisionMomentumAll, getCustomFundamentalMetrics } from "@/lib/dataService";
import type { RevisionData, ClassifiedBase } from "@/lib/dataService";
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
  ArrowUp,
  ArrowDown,
  Download,
  ExternalLink,
  Plus,
  X,
  BarChart3,
  LayoutTemplate,
  Save,
  Trash2,
  Columns3,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { apiRequest, API_BASE } from "@/lib/queryClient";

// ── Ranking Templates ──
interface RankingTemplate {
  label: string;
  metrics: string[];
  showRevisions?: boolean;
  revMetric?: string;
}

interface CustomTemplate {
  id: number;
  label: string;
  metrics: string[];
  showRevisions: boolean;
  revMetric: string | null;
}

/** True when running on the deployed static site (POST/PUT/DELETE blocked). */
const isDeployed = API_BASE !== "";

const RANKING_TEMPLATES: RankingTemplate[] = [
  {
    label: "REIT FFO Overview",
    metrics: ["Implied Cap Rate", "P/FFO FY2", "FFO FY2", "FY2 FFO Growth", "Dividend Yield"],
    showRevisions: true,
    revMetric: "FFO FY2",
  },
  {
    label: "REIT AFFO Overview",
    metrics: ["Implied Cap Rate", "P/AFFO FY2", "AFFO FY2", "FY2 AFFO Growth", "Dividend Yield"],
    showRevisions: true,
    revMetric: "AFFO FY2",
  },
  {
    label: "EPS Overview",
    metrics: ["P/E FY2", "EPS FY2", "FY2 EPS Growth", "Dividend Yield"],
    showRevisions: true,
    revMetric: "EPS FY2",
  },
  {
    label: "Valuation Multiples",
    metrics: ["P/FFO FY2", "P/AFFO FY2", "P/E FY2", "EV/EBITDA FY2", "Dividend Yield"],
  },
  {
    label: "Estimate Revisions",
    metrics: ["FFO FY2", "FFO FY1", "AFFO FY2", "EPS FY2"],
    showRevisions: true,
    revMetric: "FFO FY2",
  },
  {
    label: "Yields & Income",
    metrics: ["FFO Yield FY2", "AFFO Yield FY2", "Dividend Yield", "Implied Cap Rate"],
  },
  {
    label: "Growth",
    metrics: ["FY2 FFO Growth", "FY2 AFFO Growth", "FY2 EPS Growth", "1Y Price Chg%"],
  },
  {
    label: "Short Squeeze Screen",
    metrics: ["Short Interest%", "SI Δ 1M", "SI Δ 3M", "P/FFO FY2", "1M Price Chg%"],
  },
  {
    label: "Performance",
    metrics: ["1M Price Chg%", "3M Price Chg%", "6M Price Chg%", "1Y Price Chg%", "% off 52wk High"],
  },
];

const METRIC_OPTIONS: Record<string, string[]> = {
  Valuation: [
    "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2",
    "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2",
    "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate",
  ],
  Yields: [
    "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
    "Dividend Yield",
  ],
  Estimates: [
    "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2",
    "AFFO FY1", "AFFO FY2", "EBITDA FY1", "EBITDA FY2",
  ],
  Growth: [
    "FY1 EPS Growth", "FY2 EPS Growth",
    "FY1 FFO Growth", "FY2 FFO Growth",
    "FY1 AFFO Growth", "FY2 AFFO Growth",
  ],
  Performance: [
    "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
    "% off 52wk High", "% off 52wk Low",
  ],
  "Short Interest": [
    "Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M",
  ],
  Other: [
    "close", "Enterprise Value", "Dividend",
    "Buy Ratings", "Hold Ratings", "Sell Ratings",
  ],
};

const REVISION_METRICS = [
  "FFO FY2", "FFO FY1", "EPS FY2", "EPS FY1", "AFFO FY2", "AFFO FY1",
];

// Classification levels for group percentiles/z-scores
const CLASS_LEVELS = [
  { key: "economy", label: "Econ", fullLabel: "Economy" },
  { key: "sector", label: "Sect", fullLabel: "Sector" },
  { key: "subsector", label: "SubS", fullLabel: "Subsector" },
  { key: "industryGroup", label: "IndG", fullLabel: "Industry Group" },
  { key: "industry", label: "Ind", fullLabel: "Industry" },
  { key: "subindustry", label: "SubI", fullLabel: "Subindustry" },
] as const;

type ClassLevelKey = typeof CLASS_LEVELS[number]["key"];

// Column types that can be toggled on/off per metric
interface ColumnVisibility {
  value: boolean;
  zScore: boolean;
  histPctile: boolean;
  histZScore: boolean;
  sparkline: boolean;
  // per-level group percentiles
  groupPctile: Record<ClassLevelKey, boolean>;
  // per-level group z-scores
  groupZScore: Record<ClassLevelKey, boolean>;
}

const DEFAULT_COL_VIS: ColumnVisibility = {
  value: true,
  zScore: true,
  histPctile: true,
  histZScore: false,
  sparkline: true,
  groupPctile: {
    economy: false,
    sector: false,
    subsector: false,
    industryGroup: false,
    industry: false,
    subindustry: true,
  },
  groupZScore: {
    economy: false,
    sector: false,
    subsector: false,
    industryGroup: false,
    industry: false,
    subindustry: false,
  },
};

/** Count how many per-metric sub-columns are visible */
function countVisibleCols(cv: ColumnVisibility): number {
  let n = 0;
  if (cv.value) n++;
  if (cv.zScore) n++;
  if (cv.histPctile) n++;
  if (cv.histZScore) n++;
  if (cv.sparkline) n++;
  for (const lv of CLASS_LEVELS) {
    if (cv.groupPctile[lv.key]) n++;
    if (cv.groupZScore[lv.key]) n++;
  }
  return n;
}

// Revision sparkline — shows estimate trajectory with up/down coloring
function RevisionSparkline({ values, width = 80, height = 22 }: {
  values: number[];
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

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 2;
    const plotW = width - 2 * pad;
    const plotH = height - 2 * pad;

    ctx.clearRect(0, 0, width, height);

    // Determine if trending up or down
    const first = values[0];
    const last = values[values.length - 1];
    const isUp = last >= first;

    // Gradient fill under the line
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (isUp) {
      gradient.addColorStop(0, "rgba(34, 197, 94, 0.15)");
      gradient.addColorStop(1, "rgba(34, 197, 94, 0.0)");
    } else {
      gradient.addColorStop(0, "rgba(239, 68, 68, 0.15)");
      gradient.addColorStop(1, "rgba(239, 68, 68, 0.0)");
    }

    // Build path
    const toX = (i: number) => pad + (i / (values.length - 1)) * plotW;
    const toY = (v: number) => pad + plotH - ((v - min) / range) * plotH;

    // Fill area
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < values.length; i++) {
      ctx.lineTo(toX(i), toY(values[i]));
    }
    ctx.lineTo(toX(values.length - 1), pad + plotH);
    ctx.lineTo(toX(0), pad + plotH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = isUp ? "rgba(34, 197, 94, 0.7)" : "rgba(239, 68, 68, 0.7)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < values.length; i++) {
      const x = toX(i);
      const y = toY(values[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // End dot
    ctx.beginPath();
    ctx.arc(toX(values.length - 1), toY(last), 2, 0, Math.PI * 2);
    ctx.fillStyle = isUp ? "#22c55e" : "#ef4444";
    ctx.fill();
  }, [values, width, height]);

  if (values.length < 2) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  return <canvas ref={canvasRef} style={{ width, height }} />;
}

// Momentum color helper
function revColor(rev: number | null): string {
  if (rev === null) return "text-muted-foreground/40";
  if (rev > 2) return "text-green-400 font-semibold";
  if (rev > 0.5) return "text-green-400";
  if (rev > 0) return "text-green-300/60";
  if (rev < -2) return "text-red-400 font-semibold";
  if (rev < -0.5) return "text-red-400";
  if (rev < 0) return "text-red-300/60";
  return "text-muted-foreground";
}

function revBg(rev: number | null): string {
  if (rev === null) return "";
  if (rev > 2) return "bg-green-500/8";
  if (rev < -2) return "bg-red-500/8";
  return "";
}

const AVG_PRESETS = [
  { label: "Latest", value: "0" },
  { label: "5-day avg", value: "5" },
  { label: "10-day avg", value: "10" },
  { label: "20-day avg", value: "20" },
  { label: "60-day avg", value: "60" },
  { label: "120-day avg", value: "120" },
  { label: "250-day avg", value: "250" },
];

// Sparkline mini canvas renderer
function Sparkline({ values, currentValue, width = 80, height = 24 }: {
  values: number[];
  currentValue: number | null;
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

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 2;
    const plotW = width - 2 * pad;
    const plotH = height - 2 * pad;

    ctx.clearRect(0, 0, width, height);

    // Fill range
    ctx.fillStyle = "rgba(14, 165, 233, 0.08)";
    ctx.fillRect(pad, pad, plotW, plotH);

    // Line
    ctx.beginPath();
    ctx.strokeStyle = "rgba(14, 165, 233, 0.5)";
    ctx.lineWidth = 1;
    for (let i = 0; i < values.length; i++) {
      const x = pad + (i / (values.length - 1)) * plotW;
      const y = pad + plotH - ((values[i] - min) / range) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Current value marker
    if (currentValue !== null) {
      const cy = pad + plotH - ((currentValue - min) / range) * plotH;
      ctx.beginPath();
      ctx.arc(pad + plotW, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0ea5e9";
      ctx.fill();
    }
  }, [values, currentValue, width, height]);

  if (values.length < 2) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  return <canvas ref={canvasRef} style={{ width, height }} />;
}

// Z-score computation for a set of numbers
function computeZScores(values: (number | null)[]): (number | null)[] {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2) return values.map(() => null);
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  const std = Math.sqrt(valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length);
  if (std === 0) return values.map((v) => (v !== null ? 0 : null));
  return values.map((v) => (v !== null ? (v - mean) / std : null));
}

// Percentile rank (0-100)
function computePercentileRank(value: number, allValues: number[]): number {
  const sorted = [...allValues].sort((a, b) => a - b);
  const idx = sorted.findIndex((v) => v >= value);
  if (idx < 0) return 100;
  return (idx / sorted.length) * 100;
}

// Historical percentile: where does current value sit in its own trailing data
// Uses (count strictly below) / (N - 1) which gives 0% at the min and 100% at
// the max — consistent with Bloomberg / FactSet PERCENTRANK conventions.
function histPercentile(currentValue: number, trailingValues: number[]): number {
  if (trailingValues.length <= 1) return 50;
  const below = trailingValues.filter((v) => v < currentValue).length;
  return (below / (trailingValues.length - 1)) * 100;
}

interface CompositeRow extends ClassifiedBase {
  values: Record<string, number | null>;
  zScores: Record<string, number | null>;
  compositeZ: number | null;
  /** Percentile within each classification group: groupPctile[metric][levelKey] */
  groupPctile: Record<string, Record<ClassLevelKey, number | null>>;
  /** Z-score within each classification group: groupZScore[metric][levelKey] */
  groupZScore: Record<string, Record<ClassLevelKey, number | null>>;
  histPctile: Record<string, number | null>;
  /** Historical z-score: (current - trailingMean) / trailingStd */
  histZScore: Record<string, number | null>;
  sparklineData: Record<string, number[]>;
}

export default function Ranking() {
  const qc = useQueryClient();
  const { universeTickers } = useUniverse();
  const [metrics, setMetrics] = useState<string[]>(["P/FFO FY2"]);
  const [pendingMetric, setPendingMetric] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const navigateToChart = (ticker: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("ticker", ticker);
    url.hash = "#/";
    window.location.href = url.toString();
  };

  // ── In-memory fallback for static mode (no backend) ──
  const [memTemplates, setMemTemplates] = useState<CustomTemplate[]>([]);

  // ── Custom templates: fetch from backend when available ──
  const { data: backendTemplatesRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/ranking-templates"],
    enabled: !isDeployed,
  });

  const customTemplates: CustomTemplate[] = useMemo(() => {
    if (isDeployed) return memTemplates;
    return backendTemplatesRaw.map((t: any) => ({
      id: t.id,
      label: t.label,
      metrics: typeof t.metrics === "string" ? JSON.parse(t.metrics) : t.metrics,
      showRevisions: !!t.showRevisions,
      revMetric: t.revMetric,
    }));
  }, [isDeployed, memTemplates, backendTemplatesRaw]);

  const saveTemplateMut = useMutation({
    mutationFn: async (tmpl: { label: string; metrics: string[]; showRevisions: boolean; revMetric: string }) => {
      if (isDeployed) {
        // In-memory for static mode
        const newTmpl: CustomTemplate = {
          id: Date.now(),
          label: tmpl.label,
          metrics: tmpl.metrics,
          showRevisions: tmpl.showRevisions,
          revMetric: tmpl.revMetric,
        };
        setMemTemplates((prev) => [...prev, newTmpl]);
        return newTmpl;
      }
      const res = await apiRequest("POST", "/api/ranking-templates", tmpl);
      return res.json();
    },
    onSuccess: () => {
      if (!isDeployed) qc.invalidateQueries({ queryKey: ["/api/ranking-templates"] });
    },
  });

  const deleteTemplateMut = useMutation({
    mutationFn: async (id: number) => {
      if (isDeployed) {
        setMemTemplates((prev) => prev.filter((t) => t.id !== id));
        return;
      }
      await apiRequest("POST", `/api/ranking-templates/${id}/delete`, {});
    },
    onSuccess: () => {
      if (!isDeployed) qc.invalidateQueries({ queryKey: ["/api/ranking-templates"] });
    },
  });

  const handleSaveTemplate = () => {
    const name = newTemplateName.trim();
    if (!name || metrics.length === 0) return;
    saveTemplateMut.mutate({
      label: name,
      metrics: [...metrics],
      showRevisions,
      revMetric,
    });
    setNewTemplateName("");
    setShowSaveInput(false);
  };

  const [sortCol, setSortCol] = useState<string>("compositeZ");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [avgDays, setAvgDays] = useState("0");
  const [customDays, setCustomDays] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [sparklineLookback, setSparklineLookback] = useState(250);
  const [showRevisions, setShowRevisions] = useState(false);
  const [revMetric, setRevMetric] = useState("FFO FY2");
  const [colVis, setColVis] = useState<ColumnVisibility>(DEFAULT_COL_VIS);

  const toggleColVis = useCallback((path: string) => {
    setColVis(prev => {
      const next = { ...prev, groupPctile: { ...prev.groupPctile }, groupZScore: { ...prev.groupZScore } };
      if (path.startsWith("groupPctile.")) {
        const key = path.split(".")[1] as ClassLevelKey;
        next.groupPctile[key] = !prev.groupPctile[key];
      } else if (path.startsWith("groupZScore.")) {
        const key = path.split(".")[1] as ClassLevelKey;
        next.groupZScore[key] = !prev.groupZScore[key];
      } else {
        (next as any)[path] = !(prev as any)[path];
      }
      return next;
    });
  }, []);

  const serializeRanking = useCallback(() => ({
    metrics,
    sortCol,
    sortDir,
    classFilters: serializeClassFilters(classFilters),
    manualTickers: [...manualTickers],
    avgDays,
    customDays,
    dateInput,
    sparklineLookback,
    showRevisions,
    revMetric,
    customTemplates: memTemplates,
    colVis,
  }), [metrics, sortCol, sortDir, classFilters, manualTickers, avgDays, customDays, dateInput, sparklineLookback, showRevisions, revMetric, memTemplates, colVis]);

  const restoreRanking = useCallback((state: any) => {
    if (state.metrics !== undefined) setMetrics(state.metrics);
    if (state.sortCol !== undefined) setSortCol(state.sortCol);
    if (state.sortDir !== undefined) setSortDir(state.sortDir);
    if (state.classFilters !== undefined) setClassFilters(deserializeClassFilters(state.classFilters));
    if (state.manualTickers !== undefined) setManualTickers(new Set(state.manualTickers));
    if (state.avgDays !== undefined) setAvgDays(state.avgDays);
    if (state.customDays !== undefined) setCustomDays(state.customDays);
    if (state.dateInput !== undefined) setDateInput(state.dateInput);
    if (state.sparklineLookback !== undefined) setSparklineLookback(state.sparklineLookback);
    if (state.showRevisions !== undefined) setShowRevisions(state.showRevisions);
    if (state.revMetric !== undefined) setRevMetric(state.revMetric);
    if (state.customTemplates !== undefined) setMemTemplates(state.customTemplates);
    if (state.colVis !== undefined) setColVis({ ...DEFAULT_COL_VIS, ...state.colVis, groupPctile: { ...DEFAULT_COL_VIS.groupPctile, ...state.colVis?.groupPctile }, groupZScore: { ...DEFAULT_COL_VIS.groupZScore, ...state.colVis?.groupZScore } });
  }, []);

  useWorkspaceTab("ranking", serializeRanking, restoreRanking);

  const effectiveAvgDays = avgDays === "custom" ? (parseInt(customDays) || 0) : parseInt(avgDays);

  // Fetch multi-metric data
  const { data: rawRows = [], isLoading } = useQuery({
    queryKey: ["multi-metric-rank", metrics.join(","), dateInput, effectiveAvgDays],
    queryFn: () => getMultiMetricForAllTickers(metrics, dateInput || undefined, effectiveAvgDays),
    enabled: metrics.length > 0,
  });

  // Fetch revision momentum data
  const { data: revisionData = [], isLoading: revLoading } = useQuery({
    queryKey: ["revision-momentum", revMetric],
    queryFn: () => getRevisionMomentumAll(revMetric),
    enabled: showRevisions,
  });

  // Build revision lookup by ticker
  const revisionMap = useMemo(() => {
    const map = new Map<string, RevisionData>();
    for (const r of revisionData) map.set(r.ticker, r);
    return map;
  }, [revisionData]);

  // Fetch sparkline/historical data for each ticker's metrics
  const { data: sparklineMap = {} } = useQuery({
    queryKey: ["sparklines", metrics.join(","), sparklineLookback],
    queryFn: async () => {
      const map: Record<string, Record<string, number[]>> = {};
      // Only fetch for tickers that have data
      const tickers = rawRows.filter(r => Object.values(r.values).some(v => v !== null)).map(r => r.ticker);
      for (const metric of metrics) {
        const batchSize = 15;
        for (let b = 0; b < tickers.length; b += batchSize) {
          const batch = tickers.slice(b, b + batchSize);
          const results = await Promise.all(
            batch.map(async (ticker) => {
              const vals = await getMetricTrailing(ticker, metric, sparklineLookback);
              return { ticker, vals };
            })
          );
          for (const r of results) {
            if (!map[r.ticker]) map[r.ticker] = {};
            map[r.ticker][metric] = r.vals;
          }
        }
      }
      return map;
    },
    enabled: rawRows.length > 0 && metrics.length > 0,
  });

  // Build composite rows with Z-scores, percentiles (all classification levels), sparklines
  const compositeRows = useMemo(() => {
    if (rawRows.length === 0) return [];

    // Cross-sectional z-scores for each metric (across all tickers)
    const zScoresByMetric: Record<string, (number | null)[]> = {};
    for (const metric of metrics) {
      const vals = rawRows.map((r) => r.values[metric] ?? null);
      zScoresByMetric[metric] = computeZScores(vals);
    }

    // Build group value maps for all 6 classification levels
    // groupValuesMap[metric][levelKey][groupName] = array of values
    const groupValuesMap: Record<string, Record<ClassLevelKey, Record<string, number[]>>> = {};
    for (const metric of metrics) {
      groupValuesMap[metric] = {} as any;
      for (const lv of CLASS_LEVELS) {
        groupValuesMap[metric][lv.key] = {};
      }
      for (const r of rawRows) {
        const val = r.values[metric];
        if (val !== null) {
          for (const lv of CLASS_LEVELS) {
            const groupName = (r as any)[lv.key] as string;
            if (!groupValuesMap[metric][lv.key][groupName]) groupValuesMap[metric][lv.key][groupName] = [];
            groupValuesMap[metric][lv.key][groupName].push(val);
          }
        }
      }
    }

    return rawRows.map((r, idx) => {
      const zScores: Record<string, number | null> = {};
      const groupPctileMap: Record<string, Record<ClassLevelKey, number | null>> = {};
      const groupZScoreMap: Record<string, Record<ClassLevelKey, number | null>> = {};
      const histPctileMap: Record<string, number | null> = {};
      const histZScoreMap: Record<string, number | null> = {};
      const sparkData: Record<string, number[]> = {};
      let zSum = 0;
      let zCount = 0;

      for (const metric of metrics) {
        const z = zScoresByMetric[metric][idx];
        zScores[metric] = z;
        if (z !== null) { zSum += z; zCount++; }

        const val = r.values[metric];

        // Group percentiles and z-scores for all 6 levels
        groupPctileMap[metric] = {} as Record<ClassLevelKey, number | null>;
        groupZScoreMap[metric] = {} as Record<ClassLevelKey, number | null>;
        for (const lv of CLASS_LEVELS) {
          const groupName = (r as any)[lv.key] as string;
          const groupVals = groupValuesMap[metric]?.[lv.key]?.[groupName] || [];
          if (val !== null && groupVals.length > 1) {
            groupPctileMap[metric][lv.key] = computePercentileRank(val, groupVals);
            // Group z-score: (val - groupMean) / groupStd
            const gMean = groupVals.reduce((s, v) => s + v, 0) / groupVals.length;
            const gStd = Math.sqrt(groupVals.reduce((s, v) => s + (v - gMean) ** 2, 0) / groupVals.length);
            groupZScoreMap[metric][lv.key] = gStd > 0 ? (val - gMean) / gStd : 0;
          } else {
            groupPctileMap[metric][lv.key] = null;
            groupZScoreMap[metric][lv.key] = null;
          }
        }

        // Historical percentile + historical z-score
        const trailing = sparklineMap[r.ticker]?.[metric] || [];
        sparkData[metric] = trailing;
        if (val !== null && trailing.length > 5) {
          histPctileMap[metric] = histPercentile(val, trailing);
          const hMean = trailing.reduce((s, v) => s + v, 0) / trailing.length;
          const hStd = Math.sqrt(trailing.reduce((s, v) => s + (v - hMean) ** 2, 0) / trailing.length);
          histZScoreMap[metric] = hStd > 0 ? (val - hMean) / hStd : 0;
        } else {
          histPctileMap[metric] = null;
          histZScoreMap[metric] = null;
        }
      }

      return {
        ticker: r.ticker,
        name: r.name,
        economy: r.economy,
        sector: r.sector,
        subsector: r.subsector,
        industryGroup: r.industryGroup,
        industry: r.industry,
        subindustry: r.subindustry,
        values: r.values,
        zScores,
        compositeZ: zCount > 0 ? zSum / zCount : null,
        groupPctile: groupPctileMap,
        groupZScore: groupZScoreMap,
        histPctile: histPctileMap,
        histZScore: histZScoreMap,
        sparklineData: sparkData,
      } as CompositeRow;
    });
  }, [rawRows, metrics, sparklineMap]);

  const sorted = useMemo(() => {
    let filtered = compositeRows.filter((r) =>
      metrics.some((m) => r.values[m] !== null)
    );
    if (universeTickers) filtered = filtered.filter(r => universeTickers.has(r.ticker));
    filtered = applyClassFilters(filtered, classFilters, search, manualTickers);

    return filtered.sort((a, b) => {
      let av: number, bv: number;
      const inf = sortDir === "asc" ? Infinity : -Infinity;
      if (sortCol === "compositeZ") {
        av = a.compositeZ ?? inf;
        bv = b.compositeZ ?? inf;
      } else if (sortCol === "rev30d" || sortCol === "rev60d" || sortCol === "rev90d") {
        const ra = revisionMap.get(a.ticker);
        const rb = revisionMap.get(b.ticker);
        av = (ra?.[sortCol as keyof RevisionData] as number) ?? inf;
        bv = (rb?.[sortCol as keyof RevisionData] as number) ?? inf;
      } else {
        av = a.values[sortCol] ?? inf;
        bv = b.values[sortCol] ?? inf;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [compositeRows, sortCol, sortDir, search, classFilters, manualTickers, metrics, revisionMap, showRevisions, universeTickers]);

  const addMetric = () => {
    if (pendingMetric && !metrics.includes(pendingMetric)) {
      setMetrics((prev) => [...prev, pendingMetric]);
      setPendingMetric("");
    }
  };

  const removeMetric = (m: string) => {
    setMetrics((prev) => prev.filter((x) => x !== m));
    if (sortCol === m) setSortCol("compositeZ");
  };

  const exportCSV = () => {
    // Build headers dynamically based on visible columns
    const baseHeaders = ["Rank", "Ticker", "Name", "Subindustry"];
    const metricHeaders: string[] = [];
    for (const m of metrics) {
      if (colVis.value) metricHeaders.push(m);
      if (colVis.zScore) metricHeaders.push(`Z(${m})`);
      for (const lv of CLASS_LEVELS) {
        if (colVis.groupPctile[lv.key]) metricHeaders.push(`${lv.fullLabel} %ile(${m})`);
        if (colVis.groupZScore[lv.key]) metricHeaders.push(`${lv.fullLabel} Z(${m})`);
      }
      if (colVis.histPctile) metricHeaders.push(`Hist %ile(${m})`);
      if (colVis.histZScore) metricHeaders.push(`Hist Z(${m})`);
    }
    const headers = [...baseHeaders, ...metricHeaders, ...(metrics.length > 1 ? ["Composite Z"] : [])];
    const lines = sorted.map((r, i) => {
      const base = [i + 1, r.ticker, `"${r.name}"`, `"${r.subindustry}"`];
      const metricVals: (string | number)[] = [];
      for (const m of metrics) {
        if (colVis.value) metricVals.push(r.values[m]?.toFixed(2) ?? "");
        if (colVis.zScore) metricVals.push(r.zScores[m]?.toFixed(2) ?? "");
        for (const lv of CLASS_LEVELS) {
          if (colVis.groupPctile[lv.key]) metricVals.push(r.groupPctile[m]?.[lv.key]?.toFixed(1) ?? "");
          if (colVis.groupZScore[lv.key]) metricVals.push(r.groupZScore[m]?.[lv.key]?.toFixed(2) ?? "");
        }
        if (colVis.histPctile) metricVals.push(r.histPctile[m]?.toFixed(1) ?? "");
        if (colVis.histZScore) metricVals.push(r.histZScore[m]?.toFixed(2) ?? "");
      }
      if (metrics.length > 1) metricVals.push(r.compositeZ?.toFixed(2) ?? "");
      return [...base, ...metricVals].join(",");
    });
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ranking_composite_${metrics.join("_").replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Percentile color (green=low valuation=cheap, red=high)
  const pctileColor = (pctile: number | null, invert: boolean = false) => {
    if (pctile === null) return "";
    const p = invert ? 100 - pctile : pctile;
    if (p < 20) return "text-green-400";
    if (p < 40) return "text-green-300/70";
    if (p > 80) return "text-red-400";
    if (p > 60) return "text-red-300/70";
    return "text-muted-foreground";
  };

  // Z-score color
  const zColor = (z: number | null) => {
    if (z === null) return "";
    if (z < -1.5) return "text-green-400";
    if (z < -0.5) return "text-green-300/70";
    if (z > 1.5) return "text-red-400";
    if (z > 0.5) return "text-red-300/70";
    return "text-muted-foreground";
  };

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex flex-col h-full bg-background" data-testid="ranking-page">
      {/* Controls Row 1: Templates + Metrics + Period + Date */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px] px-2" data-testid="template-dropdown">
              <LayoutTemplate className="w-3 h-3" />
              Templates
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-[10px]">Preset Views</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {RANKING_TEMPLATES.map((t) => (
              <DropdownMenuItem
                key={t.label}
                className="text-[11px] cursor-pointer"
                onClick={() => {
                  setMetrics(t.metrics);
                  if (t.showRevisions !== undefined) setShowRevisions(t.showRevisions);
                  else setShowRevisions(false);
                  if (t.revMetric) setRevMetric(t.revMetric);
                  setSortCol("compositeZ");
                  setSortDir("asc");
                }}
                data-testid={`template-${t.label.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {t.label}
              </DropdownMenuItem>
            ))}
            {customTemplates.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px]">Custom Templates</DropdownMenuLabel>
                {customTemplates.map((ct) => (
                  <DropdownMenuItem
                    key={`custom-${ct.id}`}
                    className="text-[11px] cursor-pointer flex items-center justify-between group/item"
                    onClick={() => {
                      setMetrics(ct.metrics);
                      setShowRevisions(ct.showRevisions);
                      if (ct.revMetric) setRevMetric(ct.revMetric);
                      setSortCol("compositeZ");
                      setSortDir("asc");
                    }}
                    data-testid={`custom-template-${ct.id}`}
                  >
                    <span className="truncate">{ct.label}</span>
                    <button
                      className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTemplateMut.mutate(ct.id);
                      }}
                      data-testid={`delete-template-${ct.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            {showSaveInput ? (
              <div className="px-2 py-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Input
                  autoFocus
                  placeholder="Template name..."
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTemplate();
                    if (e.key === "Escape") { setShowSaveInput(false); setNewTemplateName(""); }
                  }}
                  className="h-6 text-[11px] flex-1 bg-background"
                  data-testid="template-name-input"
                />
                <Button
                  variant="default"
                  size="sm"
                  className="h-6 w-6 p-0"
                  disabled={!newTemplateName.trim() || saveTemplateMut.isPending}
                  onClick={(e) => { e.stopPropagation(); handleSaveTemplate(); }}
                  data-testid="save-template-confirm"
                >
                  <Save className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => { e.stopPropagation(); setShowSaveInput(false); setNewTemplateName(""); }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <DropdownMenuItem
                className="text-[11px] cursor-pointer gap-1.5 text-primary"
                onClick={(e) => {
                  e.preventDefault();
                  setShowSaveInput(true);
                }}
                data-testid="save-current-template"
              >
                <Save className="w-3 h-3" />
                Save Current as Template
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-5 w-px bg-border" />

        <span className="text-xs font-semibold text-muted-foreground">Metrics</span>
        <div className="flex items-center gap-1 flex-wrap">
          {metrics.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-mono"
            >
              {m}
              {metrics.length > 1 && (
                <button onClick={() => removeMetric(m)} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
          <div className="flex items-center gap-0.5">
            <Select value={pendingMetric} onValueChange={setPendingMetric}>
              <SelectTrigger className="h-6 text-[11px] w-[140px]" data-testid="add-metric-select">
                <SelectValue placeholder="Add metric..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(METRIC_OPTIONS).map(([cat, ms]) => (
                  <div key={cat}>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {cat}
                    </div>
                    {ms.filter((m) => !metrics.includes(m)).map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </div>
                ))}
                {(() => { const cm = getCustomFundamentalMetrics().filter(m => !metrics.includes(m)); return cm.length > 0 ? (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Uploaded Fundamental</div>
                    {cm.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </div>
                ) : null; })()}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={addMetric}
              disabled={!pendingMetric}
              data-testid="add-metric-btn"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        <span className="text-xs font-semibold text-muted-foreground" title="Averaging window for metric values (e.g. 20-day avg of P/FFO)">Metric Avg</span>
        <Select value={avgDays} onValueChange={setAvgDays}>
          <SelectTrigger className="h-6 text-[11px] w-[110px]" data-testid="rank-avg-days">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AVG_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
            <SelectItem value="custom">Custom...</SelectItem>
          </SelectContent>
        </Select>
        {avgDays === "custom" && (
          <Input
            type="number"
            placeholder="Days"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            className="h-6 text-[11px] w-[60px] bg-background"
          />
        )}

        <span className="text-xs font-semibold text-muted-foreground">Date</span>
        <Input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="h-6 text-[11px] w-[130px] bg-background"
          data-testid="rank-date"
        />
        {dateInput && (
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setDateInput("")}>
            Latest
          </Button>
        )}

        <div className="h-5 w-px bg-border mx-1" />

        <Button
          variant={showRevisions ? "default" : "outline"}
          size="sm"
          className="h-6 text-[11px] px-2 gap-1"
          onClick={() => setShowRevisions(!showRevisions)}
          data-testid="toggle-revisions"
        >
          <BarChart3 className="w-3 h-3" />
          Est. Revisions
        </Button>

        {showRevisions && (
          <Select value={revMetric} onValueChange={setRevMetric}>
            <SelectTrigger className="h-6 text-[11px] w-[100px]" data-testid="rev-metric-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REVISION_METRICS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="h-5 w-px bg-border mx-1" />

        <span className="text-xs font-semibold text-muted-foreground" title="Lookback window for Hist% / HistZ percentiles and sparkline trail">History</span>
        <Select value={String(sparklineLookback)} onValueChange={(v) => setSparklineLookback(parseInt(v))}>
          <SelectTrigger className="h-6 text-[11px] w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="60">60d</SelectItem>
            <SelectItem value="120">120d</SelectItem>
            <SelectItem value="250">1yr</SelectItem>
            <SelectItem value="500">2yr</SelectItem>
            <SelectItem value="1260">5yr</SelectItem>
            <SelectItem value="2520">10yr</SelectItem>
          </SelectContent>
        </Select>

        <div className="h-5 w-px bg-border mx-1" />

        {/* Column visibility dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px] px-2">
              <Columns3 className="w-3 h-3" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 max-h-[400px] overflow-y-auto">
            <DropdownMenuLabel className="text-[10px]">Per-Metric Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {[
              { path: "value", label: "Value" },
              { path: "zScore", label: "Cross-Sectional Z-Score" },
            ].map(({ path, label }) => (
              <DropdownMenuItem key={path} className="text-[11px] cursor-pointer gap-2" onClick={(e) => { e.preventDefault(); toggleColVis(path); }}>
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${(colVis as any)[path] ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                  {(colVis as any)[path] && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </span>
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px]">Group Percentiles</DropdownMenuLabel>
            {CLASS_LEVELS.map((lv) => (
              <DropdownMenuItem key={`gp-${lv.key}`} className="text-[11px] cursor-pointer gap-2" onClick={(e) => { e.preventDefault(); toggleColVis(`groupPctile.${lv.key}`); }}>
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${colVis.groupPctile[lv.key] ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                  {colVis.groupPctile[lv.key] && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </span>
                {lv.fullLabel} %ile
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px]">Group Z-Scores</DropdownMenuLabel>
            {CLASS_LEVELS.map((lv) => (
              <DropdownMenuItem key={`gz-${lv.key}`} className="text-[11px] cursor-pointer gap-2" onClick={(e) => { e.preventDefault(); toggleColVis(`groupZScore.${lv.key}`); }}>
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${colVis.groupZScore[lv.key] ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                  {colVis.groupZScore[lv.key] && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </span>
                {lv.fullLabel} Z
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px]">Historical (Own History)</DropdownMenuLabel>
            {[
              { path: "histPctile", label: "History Percentile" },
              { path: "histZScore", label: "History Z-Score" },
            ].map(({ path, label }) => (
              <DropdownMenuItem key={path} className="text-[11px] cursor-pointer gap-2" onClick={(e) => { e.preventDefault(); toggleColVis(path); }}>
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${(colVis as any)[path] ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                  {(colVis as any)[path] && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </span>
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {[
              { path: "sparkline", label: "Sparkline" },
            ].map(({ path, label }) => (
              <DropdownMenuItem key={path} className="text-[11px] cursor-pointer gap-2" onClick={(e) => { e.preventDefault(); toggleColVis(path); }}>
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${(colVis as any)[path] ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                  {(colVis as any)[path] && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </span>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Controls Row 2: Classification Filters */}
      <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border/50 flex-wrap">
        <ClassificationFilters
          filters={classFilters}
          onFiltersChange={setClassFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={sorted.length}
          totalCount={compositeRows.length}
          testIdPrefix="rank"
        >
          <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={exportCSV}>
            <Download className="w-3 h-3" />
            CSV
          </Button>
        </ClassificationFilters>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Loading...
          </div>
        ) : (
          <table className="w-full text-[11px]" data-testid="rank-table">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                <th className="text-left px-2 py-1.5 w-8 text-muted-foreground font-medium">#</th>
                <th className="text-left px-2 py-1.5 w-14 text-muted-foreground font-medium">Ticker</th>
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium max-w-[140px]">Name</th>
                <th className="text-left px-2 py-1.5 w-32 text-muted-foreground font-medium">SubInd</th>
                {metrics.map((m) => (
                  <th key={m} colSpan={countVisibleCols(colVis)} className="text-center px-1 py-1 border-l border-border/30">
                    <button
                      className="inline-flex items-center gap-0.5 hover:text-foreground text-muted-foreground font-medium text-[10px]"
                      onClick={() => handleSort(m)}
                    >
                      {m}
                      <ArrowUpDown className="w-2.5 h-2.5" />
                    </button>
                  </th>
                ))}
                {metrics.length > 1 && (
                  <th className="text-center px-2 py-1.5 border-l border-border/30">
                    <button
                      className="inline-flex items-center gap-0.5 hover:text-foreground text-muted-foreground font-medium text-[10px]"
                      onClick={() => handleSort("compositeZ")}
                    >
                      Comp Z
                      <ArrowUpDown className="w-2.5 h-2.5" />
                    </button>
                  </th>
                )}
                {showRevisions && (
                  <th colSpan={5} className="text-center px-1 py-1 border-l border-border/30">
                    <span className="text-muted-foreground font-medium text-[10px]">
                      Est. Rev ({revMetric})
                    </span>
                  </th>
                )}
              </tr>
              {/* Dynamic sub-headers based on colVis */}
              <tr className="border-b border-border/30 text-[9px] text-muted-foreground/60">
                <th /><th /><th /><th />
                {metrics.map((m) => (
                  <React.Fragment key={m + "-sub"}>
                    {colVis.value && <th className="px-1 py-0.5 text-right border-l border-border/20">Value</th>}
                    {colVis.zScore && <th className="px-1 py-0.5 text-right">AllZ</th>}
                    {CLASS_LEVELS.map((lv) => (
                      <React.Fragment key={lv.key}>
                        {colVis.groupPctile[lv.key] && <th className="px-1 py-0.5 text-right">{lv.label}%</th>}
                        {colVis.groupZScore[lv.key] && <th className="px-1 py-0.5 text-right">{lv.label}Z</th>}
                      </React.Fragment>
                    ))}
                    {colVis.histPctile && <th className="px-1 py-0.5 text-right">Hist%</th>}
                    {colVis.histZScore && <th className="px-1 py-0.5 text-right">HistZ</th>}
                    {colVis.sparkline && <th className="px-1 py-0.5 text-center">Trail</th>}
                  </React.Fragment>
                ))}
                {metrics.length > 1 && <th />}
                {showRevisions && (
                  <React.Fragment>
                    <th className="px-1 py-0.5 text-right border-l border-border/20">
                      <button className="hover:text-foreground" onClick={() => handleSort("rev30d")}>30d <ArrowUpDown className="w-2 h-2 inline" /></button>
                    </th>
                    <th className="px-1 py-0.5 text-right">
                      <button className="hover:text-foreground" onClick={() => handleSort("rev60d")}>60d <ArrowUpDown className="w-2 h-2 inline" /></button>
                    </th>
                    <th className="px-1 py-0.5 text-right">
                      <button className="hover:text-foreground" onClick={() => handleSort("rev90d")}>90d <ArrowUpDown className="w-2 h-2 inline" /></button>
                    </th>
                    <th className="px-1 py-0.5 text-right">Est</th>
                    <th className="px-1 py-0.5 text-center">Trail</th>
                  </React.Fragment>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr
                  key={row.ticker}
                  className="group border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => navigateToChart(row.ticker)}
                  data-testid={`rank-row-${row.ticker}`}
                >
                  <td className="px-2 py-1 text-muted-foreground font-mono tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1 font-mono font-bold">
                    <button
                      className="text-primary hover:text-primary/80 hover:underline inline-flex items-center gap-0.5"
                      onClick={(e) => { e.stopPropagation(); navigateToChart(row.ticker); }}
                    >
                      {row.ticker}
                      <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60" />
                    </button>
                  </td>
                  <td className="px-2 py-1 text-foreground truncate max-w-[140px]">{row.name}</td>
                  <td className="px-2 py-1 text-muted-foreground truncate text-[10px]">
                    {row.subindustry.replace(" Equity REITs", "")}
                  </td>
                  {metrics.map((m) => {
                    const val = row.values[m];
                    const z = row.zScores[m];
                    const hp = row.histPctile[m];
                    const hz = row.histZScore[m];
                    const isNeg = (val ?? 0) < 0;
                    return (
                      <React.Fragment key={m + "-data"}>
                        {colVis.value && (
                          <td className={`px-1 py-1 text-right font-mono tabular-nums border-l border-border/20 ${isNeg ? "text-red-400" : ""}`}>
                            {val !== null ? `${val.toFixed(2)}${isPercentMetric(m) ? "%" : ""}` : "—"}
                          </td>
                        )}
                        {colVis.zScore && (
                          <td className={`px-1 py-1 text-right font-mono tabular-nums ${zColor(z)}`}>
                            {z !== null ? z.toFixed(2) : "—"}
                          </td>
                        )}
                        {CLASS_LEVELS.map((lv) => {
                          const gp = row.groupPctile[m]?.[lv.key];
                          const gz = row.groupZScore[m]?.[lv.key];
                          return (
                            <React.Fragment key={lv.key}>
                              {colVis.groupPctile[lv.key] && (
                                <td className={`px-1 py-1 text-right font-mono tabular-nums ${pctileColor(gp)}`}>
                                  {gp !== null ? `${gp.toFixed(0)}%` : "—"}
                                </td>
                              )}
                              {colVis.groupZScore[lv.key] && (
                                <td className={`px-1 py-1 text-right font-mono tabular-nums ${zColor(gz)}`}>
                                  {gz !== null ? gz.toFixed(2) : "—"}
                                </td>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {colVis.histPctile && (
                          <td className={`px-1 py-1 text-right font-mono tabular-nums ${pctileColor(hp)}`}>
                            {hp !== null ? `${hp.toFixed(0)}%` : "—"}
                          </td>
                        )}
                        {colVis.histZScore && (
                          <td className={`px-1 py-1 text-right font-mono tabular-nums ${zColor(hz)}`}>
                            {hz !== null ? hz.toFixed(2) : "—"}
                          </td>
                        )}
                        {colVis.sparkline && (
                          <td className="px-1 py-1 text-center">
                            <Sparkline
                              values={row.sparklineData[m] || []}
                              currentValue={val}
                              width={64}
                              height={18}
                            />
                          </td>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {metrics.length > 1 && (
                    <td className={`px-2 py-1 text-center font-mono font-semibold tabular-nums border-l border-border/30 ${zColor(row.compositeZ)}`}>
                      {row.compositeZ !== null ? row.compositeZ.toFixed(2) : "—"}
                    </td>
                  )}
                  {showRevisions && (() => {
                    const rd = revisionMap.get(row.ticker);
                    return (
                      <React.Fragment>
                        <td className={`px-1 py-1 text-right font-mono tabular-nums border-l border-border/20 ${revColor(rd?.rev30d ?? null)} ${revBg(rd?.rev30d ?? null)}`}>
                          {rd?.rev30d !== null && rd?.rev30d !== undefined
                            ? `${rd.rev30d > 0 ? "+" : ""}${rd.rev30d.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className={`px-1 py-1 text-right font-mono tabular-nums ${revColor(rd?.rev60d ?? null)}`}>
                          {rd?.rev60d !== null && rd?.rev60d !== undefined
                            ? `${rd.rev60d > 0 ? "+" : ""}${rd.rev60d.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className={`px-1 py-1 text-right font-mono tabular-nums ${revColor(rd?.rev90d ?? null)}`}>
                          {rd?.rev90d !== null && rd?.rev90d !== undefined
                            ? `${rd.rev90d > 0 ? "+" : ""}${rd.rev90d.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-1 py-1 text-right font-mono tabular-nums text-muted-foreground">
                          {rd?.currentEstimate !== null && rd?.currentEstimate !== undefined
                            ? rd.currentEstimate.toFixed(2)
                            : "—"}
                        </td>
                        <td className="px-1 py-1 text-center">
                          <RevisionSparkline
                            values={rd?.trailValues || []}
                            width={70}
                            height={18}
                          />
                        </td>
                      </React.Fragment>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Need React import for fragments
import React from "react";
