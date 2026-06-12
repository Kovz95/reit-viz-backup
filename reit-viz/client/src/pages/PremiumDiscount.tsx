// Reconstructed from recovered-bundle/PremiumDiscount-CTjk2iA0.js on 2026-06-12
import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from "react";
import * as React from "react";
import { createLucideIcon } from "@/lib/createLucideIcon";
import { createChart, ColorType, CrosshairMode, AreaSeries, LineSeries, HistogramSeries, BarSeries } from "lightweight-charts";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/useBaskets";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { getTickers } from "@/lib/dataService";
import { getEarningsDates } from "@/lib/dataService";
import { filterTickersByDimension } from "@/lib/dataService";
import { getCapWeightedBasketSeries } from "@/lib/basketAggregation";
import { getGroupMedianSeries } from "@/lib/dataService";
import { computePremiumSeries } from "@/lib/premiumDiscount";
import { getMetricSeries } from "@/lib/dataService";
import { computePremiumDiff } from "@/lib/premiumDiscount";
import { computePremiumDiffAbs } from "@/lib/premiumDiscount";
import { getCloseSeries } from "@/lib/dataService";
import { getCapWeightedPriceSeries } from "@/lib/basketAggregation";
import { EarningsDatePrimitive } from "@/lib/earningsPrimitive";
import { BasketEditorPanel } from "@/lib/basketEditorPanel";
import { CLASSIFICATION_DIMENSIONS } from "@/lib/dataService";
import { crossCorrelate } from "@/lib/crossCorrelation";
import { findBestLag } from "@/lib/crossCorrelation";
import { computePercentile } from "@/lib/percentile";
import { computeStats } from "@/lib/computeStats";
import { computeRollingCorr } from "@/lib/rollingCorr";
import { LayoutDashboard as LayoutIcon } from "lucide-react";
import { Download } from "lucide-react";
import { Loader2 } from "lucide-react";
import { TrendingUp } from "lucide-react";
import { TrendingDown } from "lucide-react";
import { X } from "lucide-react";
import { useUniverseDefaults } from "@/lib/universeDefaults";
import { useUniverseSignature } from "@/lib/universeSignature";

const MapPin = createLucideIcon("MapPin", [
  ["path", { d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", key: "1r0f0z" }],
  ["circle", { cx: "12", cy: "10", r: "3", key: "ilqhr7" }],
]);

const Settings2 = createLucideIcon("Settings2", [
  ["path", { d: "M20 7h-9", key: "3s1dr2" }],
  ["path", { d: "M14 17H5", key: "gfn3mx" }],
  ["circle", { cx: "17", cy: "17", r: "3", key: "18b49y" }],
  ["circle", { cx: "7", cy: "7", r: "3", key: "dfmy0x" }],
]);

const VALUATION_METRICS = [
  { id: "P/FFO FY2", label: "P/FFO FY2" },
  { id: "P/FFO LTM", label: "P/FFO LTM" },
  { id: "P/AFFO FY2", label: "P/AFFO FY2" },
  { id: "EV/EBITDA FY2", label: "EV/EBITDA FY2" },
  { id: "EV/EBITDA LTM", label: "EV/EBITDA LTM" },
  { id: "P/E FY2", label: "P/E FY2" },
  { id: "P/E LTM", label: "P/E LTM" },
  { id: "P/S FY2", label: "P/S FY2" },
  { id: "P/S LTM", label: "P/S LTM" },
  { id: "Dividend Yield", label: "Dividend Yield" },
  { id: "FFO Yield FY2", label: "FFO Yield FY2" },
  { id: "AFFO Yield FY2", label: "AFFO Yield FY2" },
];

const GROWTH_METRICS = [
  { id: "FY1 EPS Growth", label: "FY1 EPS Growth" },
  { id: "FY2 EPS Growth", label: "FY2 EPS Growth" },
  { id: "FY1 FFO Growth", label: "FY1 FFO Growth" },
  { id: "FY2 FFO Growth", label: "FY2 FFO Growth" },
  { id: "FY2 AFFO Growth", label: "FY2 AFFO Growth" },
  { id: "EBITDA Fwd Growth%", label: "EBITDA Fwd Growth (FY1/LTM)" },
  { id: "EBITDA FY2 Growth%", label: "EBITDA FY2 Growth (FY2/FY1)" },
  { id: "Sales LTM YoY%", label: "Sales LTM YoY %" },
];

const DIMENSION_LABELS: Record<string, string> = {
  economy: "Economy",
  sector: "Sector",
  subsector: "Subsector",
  industryGroup: "Industry Group",
  industry: "Industry",
  subindustry: "Subindustry",
};

const CHART_IDS = ["premium", "growth", "ratio", "rollCorr", "relReturn", "relRatio", "rawRatio", "rvVerdictTs", "similar"];

const CHART_LABELS: Record<string, string> = {
  premium: "Premium",
  growth: "Growth Diff",
  ratio: "Prem ÷ Δg",
  rollCorr: "Rolling Corr",
  relReturn: "Rel Return",
  relRatio: "Rel Strength",
  rawRatio: "A / B Ratio",
  rvVerdictTs: "RV Verdict",
  similar: "Similar Setups",
};

const TRANSPARENT_COLOR = "transparent";
const TEXT_COLOR = "rgba(255,255,255,0.55)";
const GRID_LINE_COLOR = "rgba(255,255,255,0.05)";
const TODAY_MARKER_COLOR = "rgba(245,158,11,0.95)";
const ZERO_LINE_COLOR = "rgba(255,255,255,0.35)";
const ALL_REITS_KEY = "__ALL__"; // placeholder; actual value comes from persistedState

function formatPercent(val: number, decimals = 1): string {
  return Number.isFinite(val) ? `${val > 0 ? "+" : ""}${val.toFixed(decimals)}%` : "—";
}

function formatFixed(val: number, decimals = 2): string {
  return Number.isFinite(val) ? val.toFixed(decimals) : "—";
}

function toTimeValue(series: any[]) {
  return series.map((p) => ({ time: p.time, value: p.value }));
}

function parsePeriodFilter(str: string): ((date: string) => boolean) | null {
  const s = (str || "").trim();
  if (!s) return null;
  if (/^\d{4}$/.test(s)) return (x) => x.startsWith(s);
  if (/^\d{4}-\d{2}$/.test(s)) return (x) => x.startsWith(s);
  const qMatch = s.match(/^(\d{4})-Q([1-4])$/i);
  if (qMatch) {
    const year = qMatch[1];
    const q = parseInt(qMatch[2], 10);
    const mStart = String((q - 1) * 3 + 1).padStart(2, "0");
    const mEnd = String((q - 1) * 3 + 3).padStart(2, "0");
    const dateStart = `${year}-${mStart}`;
    const dateEnd = `${year}-${mEnd}`;
    return (d) => {
      const m = d.slice(0, 7);
      return m >= dateStart && m <= dateEnd;
    };
  }
  const rangeMatch = s.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (rangeMatch) {
    let from = rangeMatch[1];
    let to = rangeMatch[2];
    if (from > to) {
      const tmp = from;
      from = to;
      to = tmp;
    }
    return (d) => d >= from && d <= to;
  }
  return null;
}

// ─── HoverValue sub-component ─────────────────────────────────────────────────
interface HoverValueProps {
  hoverTime: string | null;
  value: number | undefined;
  format: (v: number) => string;
  color: string;
  testId?: string;
}
function HoverValue({ hoverTime, value, format, color, testId }: HoverValueProps) {
  if (!hoverTime) return null;
  const display = value != null && Number.isFinite(value) ? format(value) : "—";
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-mono" data-testid={testId}>
      <span className="text-muted-foreground">{hoverTime}</span>
      <span className={`${color} tabular-nums font-semibold`}>{display}</span>
    </span>
  );
}

// ─── StatCard sub-component ───────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  tone: "rich" | "cheap" | "neutral";
}
function StatCard({ label, value, sub, tone }: StatCardProps) {
  const valueClass = tone === "rich" ? "text-red-400" : tone === "cheap" ? "text-green-400" : "text-foreground";
  const Icon = tone === "rich" ? TrendingUp : tone === "cheap" ? TrendingDown : null;
  return (
    <div className="bg-card px-3 py-2 flex flex-col gap-0.5">
      <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-base font-mono font-semibold flex items-center gap-1 ${valueClass}`}>
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {value}
      </span>
      <span className="text-[9px] font-mono text-muted-foreground/70 truncate">{sub}</span>
    </div>
  );
}

// ─── SimilarStatsCard sub-component ──────────────────────────────────────────
interface SimilarStats {
  median: number;
  mean: number;
  p25: number;
  p75: number;
  hitRate: number;
  n: number;
  min: number;
  max: number;
}
interface SimilarStatsCardProps {
  label: string;
  stats: SimilarStats | null;
}
function SimilarStatsCard({ label, stats }: SimilarStatsCardProps) {
  if (!stats) {
    return (
      <div className="bg-card px-3 py-2.5 flex flex-col gap-1">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-base font-mono text-muted-foreground/50">—</span>
        <span className="text-[9px] font-mono text-muted-foreground/60">no data</span>
      </div>
    );
  }
  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;
  const valueClass = stats.median > 0 ? "text-green-400" : stats.median < 0 ? "text-red-400" : "text-foreground";
  return (
    <div className="bg-card px-3 py-2.5 flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-[9px] font-mono text-muted-foreground/70">n={stats.n}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-base font-mono font-semibold ${valueClass}`}>{fmt(stats.median)}</span>
        <span className="text-[10px] font-mono text-muted-foreground">median</span>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/80 flex flex-wrap gap-x-3">
        <span>mean {fmt(stats.mean)}</span>
        <span>hit {stats.hitRate.toFixed(0)}%</span>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/60 flex flex-wrap gap-x-3">
        <span>p25 {fmt(stats.p25)}</span>
        <span>p75 {fmt(stats.p75)}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PremiumDiscount() {
  const [tickers, setTickers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("");
  const [dimension, setDimension] = useState("subindustry");
  const {
    available: availableMetrics,
    valuationMetric: defaultValMetric,
    growthMetric: defaultGrowthMetric,
  } = useUniverseDefaults();
  const valMetricOverrideRef = useRef(false);
  const growthMetricOverrideRef = useRef(false);
  const [valMetric, setValMetric] = useState(defaultValMetric);
  const [growthMetric, setGrowthMetric] = useState(defaultGrowthMetric);
  const availableMetricsRef = useRef(availableMetrics);

  useEffect(() => {
    availableMetricsRef.current = availableMetrics;
  }, [availableMetrics]);

  const valMetricDefaultRef = useRef(defaultValMetric);
  const growthMetricDefaultRef = useRef(defaultGrowthMetric);
  useEffect(() => {
    valMetricDefaultRef.current = defaultValMetric;
  }, [defaultValMetric]);
  useEffect(() => {
    growthMetricDefaultRef.current = defaultGrowthMetric;
  }, [defaultGrowthMetric]);
  useEffect(() => {
    if (availableMetrics.size !== 0) {
      if (!valMetricOverrideRef.current && !availableMetrics.has(valMetric)) setValMetric(defaultValMetric);
      if (!growthMetricOverrideRef.current && !availableMetrics.has(growthMetric)) setGrowthMetric(defaultGrowthMetric);
    }
  }, [availableMetrics, defaultValMetric, defaultGrowthMetric, valMetric, growthMetric]);

  const [pinDate, setPinDate] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [scatterView, setScatterView] = useState<"heatmap" | "points">("heatmap");
  const [rollWindow, setRollWindow] = useState(60);
  const [rollLag, setRollLag] = useState(0);
  const [similarN, setSimilarN] = useState(20);
  const [similarExclusion, setSimilarExclusion] = useState(252);
  const [similarMinGap, setSimilarMinGap] = useState(30);
  const [rvBand, setRvBand] = useState(0.2);
  const [showEarnings, setShowEarnings] = useState(false);
  const [earningsDates, setEarningsDates] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState<"peer" | "ticker" | "group" | "basket">("peer");
  const [peerTicker, setPeerTicker] = useState("");
  const [peerValueOverride, setPeerValueOverride] = useState("");
  const [groupADim, setGroupADim] = useState("subindustry");
  const [groupAValue, setGroupAValue] = useState("");
  const [groupBDim, setGroupBDim] = useState("subindustry");
  const [groupBValue, setGroupBValue] = useState(ALL_REITS_KEY);
  const [groupAKind, setGroupAKind] = useState<"classification" | "basket">("classification");
  const [groupBKind, setGroupBKind] = useState<"classification" | "basket">("classification");
  const [groupABasketId, setGroupABasketId] = useState("");
  const [groupBBasketId, setGroupBBasketId] = useState("");
  const [basketId, setBasketId] = useState<string | null>(null);
  const [basketAggregation, setBasketAggregation] = useState<"capWeighted" | "median">("capWeighted");
  const [visibleCharts, setVisibleCharts] = useState<Set<string>>(
    () => new Set(["premium", "growth", "relReturn", "similar"])
  );
  const [premiumSeries, setPremiumSeries] = useState<any[]>([]);
  const [growthSeries, setGrowthSeries] = useState<any[]>([]);
  const [peerCount, setPeerCount] = useState(0);
  const [peerLabel, setPeerLabel] = useState("");
  const [closesA, setClosesA] = useState<any[]>([]);
  const [closesB, setClosesB] = useState<any[]>([]);
  const [loadingCloses, setLoadingCloses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerCountA, setPeerCountA] = useState(0);
  const [peerCountB, setPeerCountB] = useState(0);
  const [basketEditorOpen, setBasketEditorOpen] = useState(false);
  const { baskets, getBasket } = useBaskets();
  const [crosshairTime, setCrosshairTime] = useState<string | null>(null);
  const stateRestoredRef = useRef(false);

  // ── Workspace tab persistence ────────────────────────────────────────────
  const captureState = useCallback(() => ({
    target,
    dimension,
    valMetric,
    growthMetric,
    pinDate,
    periodFilter,
    rollWindow,
    rollLag,
    showEarnings,
    compareMode,
    peerTicker,
    peerValueOverride,
    groupADim,
    groupAValue,
    groupBDim,
    groupBValue,
    groupAKind,
    groupBKind,
    groupABasketId,
    groupBBasketId,
    basketId,
    basketAggregation,
    visibleCharts: Array.from(visibleCharts),
    similarN,
    similarExclusion,
    similarMinGap,
    scatterView,
    rvBand,
  }), [
    target, dimension, valMetric, growthMetric, pinDate, periodFilter, rollWindow, rollLag,
    showEarnings, compareMode, peerTicker, peerValueOverride, groupADim, groupAValue, groupBDim,
    groupBValue, groupAKind, groupBKind, groupABasketId, groupBBasketId, basketId,
    basketAggregation, visibleCharts, similarN, similarExclusion, similarMinGap, scatterView, rvBand,
  ]);

  const applyState = useCallback((data: any) => {
    if (!data) return;
    if (typeof data.target === "string" && data.target) setTarget(data.target);
    if (typeof data.dimension === "string" && data.dimension) setDimension(data.dimension);
    if (typeof data.valMetric === "string" && data.valMetric) {
      const avail = availableMetricsRef.current;
      avail.size === 0 || avail.has(data.valMetric) ? setValMetric(data.valMetric) : setValMetric(valMetricDefaultRef.current);
    }
    if (typeof data.growthMetric === "string" && data.growthMetric) {
      const avail = availableMetricsRef.current;
      avail.size === 0 || avail.has(data.growthMetric) ? setGrowthMetric(data.growthMetric) : setGrowthMetric(growthMetricDefaultRef.current);
    }
    if (typeof data.pinDate === "string") setPinDate(data.pinDate);
    if (typeof data.periodFilter === "string") setPeriodFilter(data.periodFilter);
    if (data.scatterView === "heatmap" || data.scatterView === "points") setScatterView(data.scatterView);
    if (typeof data.rollWindow === "number" && data.rollWindow > 1) setRollWindow(data.rollWindow);
    if (typeof data.rollLag === "number" && Number.isFinite(data.rollLag)) setRollLag(data.rollLag);
    if (typeof data.showEarnings === "boolean") setShowEarnings(data.showEarnings);
    if (data.compareMode === "peer" || data.compareMode === "ticker" || data.compareMode === "group" || data.compareMode === "basket") setCompareMode(data.compareMode);
    if (typeof data.peerTicker === "string") setPeerTicker(data.peerTicker);
    if (typeof data.peerValueOverride === "string") setPeerValueOverride(data.peerValueOverride);
    if (typeof data.groupADim === "string") setGroupADim(data.groupADim);
    if (typeof data.groupAValue === "string") setGroupAValue(data.groupAValue);
    if (typeof data.groupBDim === "string") setGroupBDim(data.groupBDim);
    if (typeof data.groupBValue === "string") setGroupBValue(data.groupBValue);
    if (data.groupAKind === "classification" || data.groupAKind === "basket") setGroupAKind(data.groupAKind);
    if (data.groupBKind === "classification" || data.groupBKind === "basket") setGroupBKind(data.groupBKind);
    if (typeof data.groupABasketId === "string") setGroupABasketId(data.groupABasketId);
    if (typeof data.groupBBasketId === "string") setGroupBBasketId(data.groupBBasketId);
    if (data.basketAggregation === "capWeighted" || data.basketAggregation === "median") setBasketAggregation(data.basketAggregation);
    if (typeof data.basketId === "string") setBasketId(data.basketId);
    if (Array.isArray(data.visibleCharts)) {
      const valid = data.visibleCharts.filter((c: any) => typeof c === "string" && CHART_IDS.includes(c));
      if (valid.length) setVisibleCharts(new Set(valid));
    }
    if (typeof data.similarN === "number" && data.similarN >= 5 && data.similarN <= 200) setSimilarN(data.similarN);
    if (typeof data.similarExclusion === "number" && data.similarExclusion >= 0 && data.similarExclusion <= 1000) setSimilarExclusion(data.similarExclusion);
    if (typeof data.similarMinGap === "number" && data.similarMinGap >= 0 && data.similarMinGap <= 504) setSimilarMinGap(data.similarMinGap);
    if (typeof data.rvBand === "number" && data.rvBand >= 0.05 && data.rvBand <= 2) setRvBand(data.rvBand);
    stateRestoredRef.current = true;
  }, []);

  const universeSig = useUniverseSignature();
  useWorkspaceTab("premium-discount", captureState, applyState, {
    universeSig,
    resultFields: ["target", "peerTicker", "peerValueOverride", "basketId", "groupABasketId", "groupBBasketId"],
  });

  // Screener handoff
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pd-screener-handoff");
      if (!raw) return;
      sessionStorage.removeItem("pd-screener-handoff");
      const data = JSON.parse(raw);
      if (typeof data.ticker === "string" && data.ticker) setTarget(data.ticker);
      if (typeof data.valMetric === "string" && data.valMetric) setValMetric(data.valMetric);
      if (typeof data.growthMetric === "string" && data.growthMetric) setGrowthMetric(data.growthMetric);
      if (typeof data.dimension === "string" && data.dimension) setDimension(data.dimension);
      stateRestoredRef.current = true;
    } catch {}
  }, []);

  // ── Chart refs ────────────────────────────────────────────────────────────
  const premiumContainerRef = useRef<HTMLDivElement>(null);
  const growthContainerRef = useRef<HTMLDivElement>(null);
  const ratioContainerRef = useRef<HTMLDivElement>(null);
  const rollCorrContainerRef = useRef<HTMLDivElement>(null);
  const relReturnContainerRef = useRef<HTMLDivElement>(null);
  const relRatioContainerRef = useRef<HTMLDivElement>(null);
  const rawRatioContainerRef = useRef<HTMLDivElement>(null);
  const rvVerdictContainerRef = useRef<HTMLDivElement>(null);
  const scatterCanvasRef = useRef<HTMLCanvasElement>(null);

  const premiumChartRef = useRef<any>(null);
  const growthChartRef = useRef<any>(null);
  const ratioChartRef = useRef<any>(null);
  const rollCorrChartRef = useRef<any>(null);
  const relReturnChartRef = useRef<any>(null);
  const relRatioChartRef = useRef<any>(null);
  const rawRatioChartRef = useRef<any>(null);
  const rvVerdictChartRef = useRef<any>(null);

  const premiumSeriesRef = useRef<any>(null);
  const growthSeriesRef = useRef<any>(null);
  const ratioSeriesRef = useRef<any>(null);
  const rollCorrSeriesRef = useRef<any>(null);
  const rollCorrRatioSeriesRef = useRef<any>(null);
  const relReturnSeriesRef = useRef<any>(null);
  const relRatioSeriesRef = useRef<any>(null);
  const rawRatioSeriesRef = useRef<any>(null);
  const rvVerdictSeriesRef = useRef<any>(null);

  // Earnings primitive refs
  const earnPremRef = useRef<any>(null);
  const earnGrowthRef = useRef<any>(null);
  const earnRatioRef = useRef<any>(null);
  const earnRollCorrRef = useRef<any>(null);
  const earnRelReturnRef = useRef<any>(null);
  const earnRelRatioRef = useRef<any>(null);
  const earnRawRatioRef = useRef<any>(null);

  // ── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    getTickers().then((list) => {
      if (!alive) return;
      setTickers(list);
      if (list.length && !target && !stateRestoredRef.current) {
        const def = list.find((t: any) => /AVB|EQR|O$|PLD|AMT|SPG/.test(t.ticker)) || list[0];
        setTarget(def.ticker);
      }
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Auto-set peer label from ticker's own dimension value
  useEffect(() => {
    if (peerValueOverride) {
      setPeerLabel(peerValueOverride);
      return;
    }
    if (!target || tickers.length === 0) return;
    const t = tickers.find((t: any) => t.ticker === target);
    if (t) {
      const val = t[dimension] || "";
      setPeerLabel(val);
    }
  }, [target, tickers, dimension, peerValueOverride]);

  // Auto-set groupAValue when in group mode
  useEffect(() => {
    if (compareMode !== "group" || tickers.length === 0 || !target || groupAValue) return;
    const t = tickers.find((t: any) => t.ticker === target);
    if (t) {
      const val = t[groupADim] || "";
      if (val) setGroupAValue(val);
    }
  }, [compareMode, target, tickers, groupADim, groupAValue]);

  // Fetch earnings dates
  useEffect(() => {
    if (!target) {
      setEarningsDates([]);
      return;
    }
    let alive = true;
    getEarningsDates(target).then((res: any) => {
      if (alive) {
        setEarningsDates(
          ((res?.earnings || []) as string[])
            .map((r) => {
              if (r.includes("-")) return r;
              const [m, d, y] = r.split("/");
              return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
            })
            .filter((r) => r && r.length === 10)
            .sort()
        );
      }
    }).catch(() => {
      if (alive) setEarningsDates([]);
    });
    return () => { alive = false; };
  }, [target]);

  // Peer tickers (filtered by dimension+label)
  const peerTickers = useMemo(
    () => (!peerLabel || tickers.length === 0 ? [] : filterTickersByDimension(tickers, dimension, peerLabel)),
    [tickers, dimension, peerLabel]
  );

  // Unique dimension values map
  const dimensionValues = useMemo(() => {
    const map: Record<string, string[]> = {
      economy: [], sector: [], subsector: [], industryGroup: [], industry: [], subindustry: [],
    };
    for (const t of tickers) {
      const row = t as any;
      Object.keys(map).forEach((dim) => {
        const v = row[dim];
        if (v && !map[dim].includes(v)) map[dim].push(v);
      });
    }
    Object.keys(map).forEach((dim) => map[dim].sort());
    return map;
  }, [tickers]);

  const basketSelected = useMemo(() => getBasket(basketId ?? ""), [getBasket, basketId]);
  const basketGroupA = useMemo(() => getBasket(groupABasketId), [getBasket, groupABasketId]);
  const basketGroupB = useMemo(() => getBasket(groupBBasketId), [getBasket, groupBBasketId]);

  // ── Basket aggregation helper ─────────────────────────────────────────────
  const fetchBasketMetric = useCallback(async (basket: any, metric: string) => {
    if (basketAggregation === "capWeighted") {
      const getVal = async (ticker: string, m: string) => {
        try {
          return await getMetricSeries(ticker, m);
        } catch {
          return await getCloseSeries(ticker, "close");
        }
      };
      const { series } = await getCapWeightedBasketSeries(basket, metric, getVal);
      const peerCount = new Array(series.length).fill(basket.tickers.length);
      return { groupSeries: series, peerTickers: basket.tickers, peerCount };
    }
    return getGroupMedianSeries(basket.tickers, metric, getMetricSeries);
  }, [basketAggregation]);

  // ── Compute premium/growth series ─────────────────────────────────────────
  useEffect(() => {
    if (
      (compareMode !== "group" && compareMode !== "basket" && !target) ||
      (compareMode === "peer" && !peerLabel) ||
      (compareMode === "ticker" && (!peerTicker || peerTicker === target)) ||
      (compareMode === "basket" && (!target || !basketSelected || basketSelected.tickers.length < 2))
    ) return;
    if (compareMode === "group") {
      const validA = groupAKind === "basket" ? basketGroupA && basketGroupA.tickers.length >= 2 : !!groupAValue;
      const validB = groupBKind === "basket" ? basketGroupB && basketGroupB.tickers.length >= 2 : !!groupBValue;
      if (
        !validA || !validB ||
        (groupAKind === "classification" && groupBKind === "classification" && groupADim === groupBDim && groupAValue === groupBValue)
      ) return;
    }
    let alive = true;
    setError(null);
    (async () => {
      try {
        if (compareMode === "peer") {
          const resVal = await computePremiumSeries(target, dimension, peerLabel, valMetric, "median", undefined, getMetricSeries);
          const premDiff = computePremiumDiff(resVal.targetSeries, resVal.groupSeries, "pct");
          const resGrowth = await computePremiumSeries(target, dimension, peerLabel, growthMetric, "median", undefined, getMetricSeries);
          const growthDiff = computePremiumDiff(resGrowth.targetSeries, resGrowth.groupSeries, "abs");
          if (!alive) return;
          setPremiumSeries(premDiff);
          setGrowthSeries(growthDiff);
          setPeerCount(resVal.peerTickers.length);
        } else if (compareMode === "ticker") {
          const [aVal, bVal, aGrowth, bGrowth] = await Promise.all([
            getMetricSeries(target, valMetric).catch(() => []),
            getMetricSeries(peerTicker, valMetric).catch(() => []),
            getMetricSeries(target, growthMetric).catch(() => []),
            getMetricSeries(peerTicker, growthMetric).catch(() => []),
          ]);
          const premDiff = computePremiumDiff(aVal, bVal, "pct");
          const growthDiff = computePremiumDiff(aGrowth, bGrowth, "abs");
          if (!alive) return;
          setPremiumSeries(premDiff);
          setGrowthSeries(growthDiff);
          setPeerCount(1);
        } else if (compareMode === "basket") {
          const basket = basketSelected!;
          const [aVal, aGrowth, bValRes, bGrowthRes] = await Promise.all([
            getMetricSeries(target, valMetric).catch(() => []),
            getMetricSeries(target, growthMetric).catch(() => []),
            fetchBasketMetric(basket, valMetric),
            fetchBasketMetric(basket, growthMetric),
          ]);
          const premDiff = computePremiumDiff(aVal, bValRes.groupSeries, "pct");
          const growthDiff = computePremiumDiff(aGrowth, bGrowthRes.groupSeries, "abs");
          if (!alive) return;
          setPremiumSeries(premDiff);
          setGrowthSeries(growthDiff);
          setPeerCount(basket.tickers.length);
        } else {
          // group mode
          const aValPromise = groupAKind === "basket" && basketGroupA
            ? [fetchBasketMetric(basketGroupA, valMetric), fetchBasketMetric(basketGroupA, growthMetric)]
            : [computePremiumDiffAbs(groupADim, groupAValue, valMetric, "median", getMetricSeries), computePremiumDiffAbs(groupADim, groupAValue, growthMetric, "median", getMetricSeries)];
          const bValPromise = groupBKind === "basket" && basketGroupB
            ? [fetchBasketMetric(basketGroupB, valMetric), fetchBasketMetric(basketGroupB, growthMetric)]
            : [computePremiumDiffAbs(groupBDim, groupBValue, valMetric, "median", getMetricSeries), computePremiumDiffAbs(groupBDim, groupBValue, growthMetric, "median", getMetricSeries)];
          const [aValRes, aGrowthRes, bValRes, bGrowthRes] = await Promise.all([...aValPromise, ...bValPromise]);
          const premDiff = computePremiumDiff(aValRes.groupSeries, bValRes.groupSeries, "pct");
          const growthDiff = computePremiumDiff(aGrowthRes.groupSeries, bGrowthRes.groupSeries, "abs");
          if (!alive) return;
          setPremiumSeries(premDiff);
          setGrowthSeries(growthDiff);
          setPeerCount(aValRes.peerTickers.length);
          setPeerCountA(aValRes.peerTickers.length);
          setPeerCountB(bValRes.peerTickers.length);
        }
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Failed to compute");
      }
    })();
    return () => { alive = false; };
  }, [target, dimension, peerLabel, valMetric, growthMetric, compareMode, peerTicker,
    groupADim, groupAValue, groupBDim, groupBValue, groupAKind, groupBKind,
    basketGroupA, basketGroupB, basketSelected, basketId, basketAggregation, fetchBasketMetric]);

  // ── Compute close-price series (for rel return / rel ratio / raw ratio) ───
  useEffect(() => {
    if (
      (compareMode !== "group" && compareMode !== "basket" && !target) ||
      (compareMode === "peer" && (!peerLabel || peerTickers.length === 0)) ||
      (compareMode === "ticker" && (!peerTicker || peerTicker === target)) ||
      (compareMode === "basket" && (!basketSelected || basketSelected.tickers.length < 2)) ||
      (compareMode === "group" && (
        !(groupAKind === "basket" ? !!basketGroupA : !!groupAValue) ||
        !(groupBKind === "basket" ? !!basketGroupB : !!groupBValue)
      ))
    ) return;
    let alive = true;
    setLoadingCloses(true);

    const medianFromSeries = (allSeries: any[][]): any[] => {
      const times = new Set<string>();
      const maps: Map<string, number>[] = [];
      for (const s of allSeries) {
        const m = new Map<string, number>();
        let base: number | null = null;
        for (const pt of s) {
          if (!Number.isFinite(pt.value) || pt.value <= 0) continue;
          if (base === null) base = pt.value;
          m.set(pt.time, pt.value / base);
          times.add(pt.time);
        }
        maps.push(m);
      }
      const sorted = Array.from(times).sort();
      const result: any[] = [];
      for (const t of sorted) {
        const vals: number[] = [];
        for (const m of maps) {
          const v = m.get(t);
          if (v != null && Number.isFinite(v)) vals.push(v);
        }
        if (vals.length < 3) continue;
        vals.sort((a, b) => a - b);
        const mid = Math.floor(vals.length / 2);
        const median = vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
        result.push({ time: t, value: median });
      }
      return result;
    };

    (async () => {
      try {
        if (compareMode === "group") {
          const tickersA = groupAKind === "basket" && basketGroupA
            ? basketGroupA.tickers
            : filterTickersByDimension(tickers, groupADim, groupAValue).map((t: any) => t.ticker);
          const tickersB = groupBKind === "basket" && basketGroupB
            ? basketGroupB.tickers
            : filterTickersByDimension(tickers, groupBDim, groupBValue).map((t: any) => t.ticker);
          const [seriesA, seriesB] = await Promise.all([
            Promise.all(tickersA.map((t: string) => getCloseSeries(t, "close").catch(() => []))),
            Promise.all(tickersB.map((t: string) => getCloseSeries(t, "close").catch(() => []))),
          ]);
          if (!alive) return;
          setClosesA(medianFromSeries(seriesA));
          setClosesB(medianFromSeries(seriesB));
          return;
        }
        if (compareMode === "basket") {
          const basket = basketSelected!;
          const targetClose = await getCloseSeries(target, "close").catch(() => []);
          if (basketAggregation === "capWeighted") {
            const basketWithoutTarget = {
              ...basket,
              tickers: basket.tickers.filter((t: string) => t !== target),
            };
            const basketClose = await getCapWeightedPriceSeries(
              basketWithoutTarget.tickers.length === basket.tickers.length ? basket : basketWithoutTarget,
              getCloseSeries
            );
            if (!alive) return;
            setClosesA(targetClose);
            setClosesB(basketClose);
          } else {
            const peers = await Promise.all(
              basket.tickers.filter((t: string) => t !== target).map((t: string) => getCloseSeries(t, "close").catch(() => []))
            );
            if (!alive) return;
            setClosesA(targetClose);
            setClosesB(medianFromSeries(peers));
          }
          return;
        }
        const targetClose = await getCloseSeries(target, "close").catch(() => []);
        if (compareMode === "ticker") {
          const peerClose = await getCloseSeries(peerTicker, "close").catch(() => []);
          if (!alive) return;
          setClosesA(targetClose);
          setClosesB(peerClose);
        } else {
          const peerList = peerTickers.filter((t: any) => t.ticker !== target).map((t: any) => t.ticker);
          const peerCloses = await Promise.all(peerList.map((t: string) => getCloseSeries(t, "close").catch(() => [])));
          if (!alive) return;
          setClosesA(targetClose);
          setClosesB(medianFromSeries(peerCloses));
        }
      } finally {
        if (alive) setLoadingCloses(false);
      }
    })();
    return () => { alive = false; };
  }, [target, compareMode, peerTicker, peerLabel, peerTickers, tickers,
    groupADim, groupAValue, groupBDim, groupBValue, groupAKind, groupBKind,
    basketGroupA, basketGroupB, basketSelected, basketId, basketAggregation]);

  // ── Derived memos ──────────────────────────────────────────────────────────
  const peerTickerName = useMemo(() => peerTicker ? tickers.find((t: any) => t.ticker === peerTicker)?.name || peerTicker : "", [tickers, peerTicker]);
  const groupALabel = useMemo(() =>
    groupAKind === "basket" ? (basketGroupA ? basketGroupA.name : "—") : (groupAValue === ALL_REITS_KEY ? "All REITs" : groupAValue || "—"),
    [groupAKind, basketGroupA, groupAValue]);
  const groupBLabel = useMemo(() =>
    groupBKind === "basket" ? (basketGroupB ? basketGroupB.name : "—") : (groupBValue === ALL_REITS_KEY ? "All REITs" : groupBValue || "—"),
    [groupBKind, basketGroupB, groupBValue]);
  const basketLabel = useMemo(() => basketSelected ? basketSelected.name : "—", [basketSelected]);

  // Basket auto-select
  useEffect(() => {
    if (compareMode === "basket" && (basketId && baskets.find((b: any) => b.id === basketId) || (baskets.length > 0 ? setBasketId(baskets[0].id) : basketId && setBasketId(null)))) return;
  }, [baskets, basketId, compareMode]);
  useEffect(() => {
    if (compareMode === "basket" && !basketId && baskets.length > 0) setBasketId(baskets[0].id);
  }, [compareMode, baskets, basketId]);

  // Auto-set peer ticker for ticker mode
  useEffect(() => {
    if (compareMode !== "ticker" || tickers.length === 0 || !target || (peerTicker && peerTicker !== target)) return;
    const sameDim = tickers.find((t: any) => t.ticker !== target && t[dimension] === peerLabel);
    const anyOther = tickers.find((t: any) => t.ticker !== target);
    const chosen = sameDim?.ticker || anyOther?.ticker || "";
    if (chosen) setPeerTicker(chosen);
  }, [compareMode, target, peerTicker, tickers, dimension, peerLabel]);

  // ── Ratio series ──────────────────────────────────────────────────────────
  const RATIO_MIN_GROWTH = 0.5;
  const RATIO_MAX = 50;
  const ratioSeries = useMemo(() => {
    if (premiumSeries.length === 0 || growthSeries.length === 0) return [];
    const growthMap = new Map<string, number>();
    for (const pt of growthSeries) growthMap.set(pt.time, pt.value);
    const result: any[] = [];
    for (const pt of premiumSeries) {
      const g = growthMap.get(pt.time);
      if (g === undefined || !Number.isFinite(g) || !Number.isFinite(pt.value) || Math.abs(g) < RATIO_MIN_GROWTH) continue;
      const ratio = pt.value / g;
      if (!Number.isFinite(ratio) || Math.abs(ratio) > RATIO_MAX) continue;
      result.push({ time: pt.time, value: ratio });
    }
    return result;
  }, [premiumSeries, growthSeries]);

  // Rolling correlation series
  const rollCorrSeries = useMemo(() => computeRollingCorr(premiumSeries, growthSeries, rollWindow, rollLag), [premiumSeries, growthSeries, rollWindow, rollLag]);
  const rollCorrRatioVsAB = useMemo(() => computeRollingCorr(ratioSeries, rawRatioSeriesForCorr, rollWindow, rollLag), [ratioSeries, rollWindow, rollLag]); // will fix below
  const bestLag = useMemo(() => {
    if (premiumSeries.length < 30 || growthSeries.length < 30) return null;
    const ccf = crossCorrelate(premiumSeries, growthSeries, 60);
    return findBestLag(ccf);
  }, [premiumSeries, growthSeries]);

  // Relative return / ratio (anchor-based)
  const relReturnData = useMemo(() => {
    if (closesA.length === 0 || closesB.length === 0) return { relReturn: [], relRatio: [], anchorDate: null };
    const bMap = new Map<string, number>();
    for (const pt of closesB) {
      if (Number.isFinite(pt.value) && pt.value > 0) bMap.set(pt.time, pt.value);
    }
    const combined: Array<{ t: string; a: number; b: number }> = [];
    for (const pt of closesA) {
      if (!Number.isFinite(pt.value) || pt.value <= 0) continue;
      const bv = bMap.get(pt.time);
      if (bv != null) combined.push({ t: pt.time, a: pt.value, b: bv });
    }
    if (combined.length < 2) return { relReturn: [], relRatio: [], anchorDate: null };
    let anchorIdx = 0;
    if (pinDate && /^\d{4}-\d{2}-\d{2}$/.test(pinDate)) {
      let minDiff = Infinity;
      const pinMs = Date.parse(pinDate);
      if (Number.isFinite(pinMs)) {
        for (let i = 0; i < combined.length; i++) {
          const ms = Date.parse(combined[i].t);
          if (!Number.isFinite(ms)) continue;
          const diff = Math.abs(ms - pinMs);
          if (diff < minDiff) { minDiff = diff; anchorIdx = i; }
        }
      }
    }
    const baseA = combined[anchorIdx].a;
    const baseB = combined[anchorIdx].b;
    const relReturn: any[] = [];
    const relRatio: any[] = [];
    for (let i = anchorIdx; i < combined.length; i++) {
      const pt = combined[i];
      const retA = pt.a / baseA - 1;
      const retB = pt.b / baseB - 1;
      const relRet = (retA - retB) * 100;
      const ratio = (pt.a / baseA) / (pt.b / baseB);
      if (Number.isFinite(relRet)) relReturn.push({ time: pt.t, value: relRet });
      if (Number.isFinite(ratio) && ratio > 0) relRatio.push({ time: pt.t, value: ratio });
    }
    return { relReturn, relRatio, anchorDate: combined[anchorIdx].t };
  }, [closesA, closesB, pinDate]);

  const relReturnSeries = relReturnData.relReturn;
  const relRatioSeries = relReturnData.relRatio;
  const anchorDate = relReturnData.anchorDate;

  // Raw A/B price ratio
  const rawRatioSeries = useMemo(() => {
    if (closesA.length === 0 || closesB.length === 0) return [];
    const bMap = new Map<string, number>();
    for (const pt of closesB) {
      if (Number.isFinite(pt.value) && pt.value > 0) bMap.set(pt.time, pt.value);
    }
    const result: any[] = [];
    for (const pt of closesA) {
      if (!Number.isFinite(pt.value) || pt.value <= 0) continue;
      const bv = bMap.get(pt.time);
      if (bv == null || !Number.isFinite(bv) || bv <= 0) continue;
      const r = pt.value / bv;
      if (Number.isFinite(r) && r > 0) result.push({ time: pt.time, value: r });
    }
    return result;
  }, [closesA, closesB]);

  // Fix rollCorrRatioVsAB to use rawRatioSeries
  const rollCorrRatioVsABSeries = useMemo(() => computeRollingCorr(ratioSeries, rawRatioSeries, rollWindow, rollLag), [ratioSeries, rawRatioSeries, rollWindow, rollLag]);

  // Deferred rvBand for perf
  const deferredRvBand = useDeferredValue(rvBand);

  // RV Verdict time series
  const rvVerdictEnabled = visibleCharts.has("rvVerdictTs");
  const rvVerdictSeries = useMemo(() => {
    if (!rvVerdictEnabled) return [];
    if (premiumSeries.length < 60 || growthSeries.length < 60) return [];
    const growthMap = new Map<string, number>();
    for (const pt of growthSeries) growthMap.set(pt.time, pt.value);
    const n = premiumSeries.length;
    const times: string[] = new Array(n);
    const premArr = new Float64Array(n);
    const growthArr = new Float64Array(n);
    let count = 0;
    for (const pt of premiumSeries) {
      const gv = growthMap.get(pt.time);
      if (gv !== undefined && Number.isFinite(pt.value) && Number.isFinite(gv)) {
        times[count] = pt.time;
        premArr[count] = pt.value;
        growthArr[count] = gv;
        count++;
      }
    }
    if (count < 60) return [];

    const scratchArr = new Float64Array(count);

    function conditionalPctile(
      len: number, condOnGrowth: boolean, condValue: number, condStd: number,
      bandMult: number, minN: number, targetValue: number
    ): number | null {
      let mult = bandMult;
      let found = 0;
      for (let iter = 0; iter < 5; iter++) {
        const lo = condValue - mult * condStd;
        const hi = condValue + mult * condStd;
        found = 0;
        if (condOnGrowth) {
          for (let i = 0; i < len; i++) {
            const cv = growthArr[i];
            if (cv >= lo && cv <= hi) scratchArr[found++] = premArr[i];
          }
        } else {
          for (let i = 0; i < len; i++) {
            const cv = premArr[i];
            if (cv >= lo && cv <= hi) scratchArr[found++] = growthArr[i];
          }
        }
        if (found >= minN) break;
        mult *= 1.4;
      }
      if (found < minN) return null;
      const sub = scratchArr.subarray(0, found);
      sub.sort();
      let below = 0;
      for (let i = 0; i < found && sub[i] < targetValue; i++) below++;
      return found > 1 ? (below / (found - 1)) * 100 : 50;
    }

    const result: any[] = [];
    let sumP = 0, sumG = 0, sumP2 = 0, sumG2 = 0;
    for (let i = 0; i < count; i++) {
      const pv = premArr[i];
      const gv = growthArr[i];
      if (i >= 60) {
        const meanP = sumP / i, meanG = sumG / i;
        const varP = sumP2 / i - meanP * meanP;
        const varG = sumG2 / i - meanG * meanG;
        const stdP = Math.sqrt(Math.max(0, varP));
        const stdG = Math.sqrt(Math.max(0, varG));
        if (stdP > 0 && stdG > 0) {
          const pGivenG = conditionalPctile(i, true, gv, stdG, deferredRvBand, 20, pv);
          const gGivenP = conditionalPctile(i, false, pv, stdP, deferredRvBand, 20, gv);
          let scoreP = 0, scoreG = 0;
          if (pGivenG != null) scoreP = pGivenG <= 25 ? 1 : pGivenG >= 75 ? -1 : 0;
          if (gGivenP != null) scoreG = gGivenP >= 75 ? 1 : gGivenP <= 25 ? -1 : 0;
          const totalScore = scoreP + scoreG;
          let label = "Neutral";
          if (scoreP === 1 && scoreG === 1) label = "Attractive";
          else if (scoreP === -1 && scoreG === -1) label = "Expensive";
          else if (scoreP === 1 && scoreG >= 0) label = "Attractive";
          else if (scoreP === -1 && scoreG <= 0) label = "Expensive";
          else if (scoreG === 1 && scoreP >= 0) label = "Attractive";
          else if (scoreG === -1 && scoreP <= 0) label = "Expensive";
          result.push({ time: times[i], score: totalScore, label });
        }
      }
      sumP += pv; sumG += gv; sumP2 += pv * pv; sumG2 += gv * gv;
    }
    return result;
  }, [premiumSeries, growthSeries, deferredRvBand, rvVerdictEnabled]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const lastP = premiumSeries.length ? premiumSeries[premiumSeries.length - 1].value : NaN;
    const lastG = growthSeries.length ? growthSeries[growthSeries.length - 1].value : NaN;
    const pctile = computePercentile(premiumSeries);
    const corr = computeStats(premiumSeries, growthSeries);
    const corrRatioVsAB = computeStats(ratioSeries, rawRatioSeries);
    let zscore = NaN;
    if (premiumSeries.length > 30) {
      const vals = premiumSeries.map((p: any) => p.value).filter(Number.isFinite);
      const mean = vals.reduce((s: number, v: number) => s + v, 0) / vals.length;
      const std = Math.sqrt(vals.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / vals.length);
      zscore = std > 0 ? (lastP - mean) / std : NaN;
    }
    const relReturnSinceAnchor = relReturnSeries.length ? relReturnSeries[relReturnSeries.length - 1].value : NaN;
    let forwardRelReturn252 = NaN;
    if (relReturnSeries.length > 0 && anchorDate) {
      const anchorIdx = relReturnSeries.findIndex((p: any) => p.time === anchorDate);
      const aIdx = anchorIdx >= 0 ? anchorIdx : 0;
      const fwdIdx = Math.min(aIdx + 252, relReturnSeries.length - 1);
      if (fwdIdx > aIdx + 5) forwardRelReturn252 = relReturnSeries[fwdIdx].value;
    }
    return { lastP, lastG, pctile, corr, corrRatioVsAB, z: zscore, relReturnSinceAnchor, forwardRelReturn252 };
  }, [premiumSeries, growthSeries, ratioSeries, rawRatioSeries, relReturnSeries, anchorDate]);

  // RV Verdict scatter analysis
  const rvVerdictAnalysis = useMemo(() => {
    const empty = {
      premGivenGrowth: null, growthGivenPrem: null, impliedPrem: NaN, premGap: NaN,
      impliedGrowth: NaN, growthGap: NaN, label: "—", score: 0, rationale: "insufficient history",
    };
    if (premiumSeries.length < 60 || growthSeries.length < 60) return empty;
    const { lastP, lastG } = summaryStats;
    if (!Number.isFinite(lastP) || !Number.isFinite(lastG)) return empty;
    const gMap = new Map<string, number>();
    for (const pt of growthSeries) gMap.set(pt.time, pt.value);
    const pairs: Array<{ p: number; g: number }> = [];
    for (const pt of premiumSeries) {
      const gv = gMap.get(pt.time);
      if (gv !== undefined && Number.isFinite(pt.value) && Number.isFinite(gv)) pairs.push({ p: pt.value, g: gv });
    }
    if (pairs.length < 60) return empty;
    const meanP = pairs.reduce((s, v) => s + v.p, 0) / pairs.length;
    const meanG = pairs.reduce((s, v) => s + v.g, 0) / pairs.length;
    const stdP = Math.sqrt(pairs.reduce((s, v) => s + (v.p - meanP) ** 2, 0) / pairs.length);
    const stdG = Math.sqrt(pairs.reduce((s, v) => s + (v.g - meanG) ** 2, 0) / pairs.length);
    if (stdP === 0 || stdG === 0) return empty;

    function conditionalSample(
      axis: "p" | "g", condValue: number, condStd: number, bandMult: number, minN: number, targetVal: number
    ) {
      const lo = condValue - bandMult * condStd;
      const hi = condValue + bandMult * condStd;
      const sample: number[] = [];
      for (const pair of pairs) {
        const cv = axis === "p" ? pair.g : pair.p;
        if (cv >= lo && cv <= hi) sample.push(axis === "p" ? pair.p : pair.g);
      }
      if (sample.length < minN) return null;
      sample.sort((a, b) => a - b);
      const pct = (f: number) => {
        const i = Math.min(sample.length - 1, Math.max(0, Math.floor(f * (sample.length - 1))));
        return sample[i];
      };
      let below = 0;
      for (const v of sample) { if (v < targetVal) below++; else break; }
      const todayPctile = sample.length > 1 ? (below / (sample.length - 1)) * 100 : 50;
      return { n: sample.length, median: pct(0.5), p25: pct(0.25), p75: pct(0.75), bandLo: lo, bandHi: hi, todayPctile };
    }

    const pGivenG = conditionalSample("p", lastG, stdG, rvBand, 20, lastP);
    const gGivenP = conditionalSample("g", lastP, stdP, rvBand, 20, lastG);
    const impliedPrem = pGivenG ? pGivenG.median : NaN;
    const premGap = Number.isFinite(impliedPrem) ? lastP - impliedPrem : NaN;
    const impliedGrowth = gGivenP ? gGivenP.median : NaN;
    const growthGap = Number.isFinite(impliedGrowth) ? lastG - impliedGrowth : NaN;

    let scoreP = 0, scoreG = 0;
    if (pGivenG) scoreP = pGivenG.todayPctile <= 25 ? 1 : pGivenG.todayPctile >= 75 ? -1 : 0;
    if (gGivenP) scoreG = gGivenP.todayPctile >= 75 ? 1 : gGivenP.todayPctile <= 25 ? -1 : 0;
    const score = scoreP + scoreG;
    let label = "Neutral";
    let rationale = "";
    if (scoreP === 1 && scoreG === 1) { label = "Attractive"; rationale = "premium below fair-for-growth & growth above fair-for-premium"; }
    else if (scoreP === -1 && scoreG === -1) { label = "Expensive"; rationale = "premium above fair-for-growth & growth below fair-for-premium"; }
    else if (scoreP === 1 && scoreG >= 0) { label = "Attractive"; rationale = "premium below what history pays for this growth"; }
    else if (scoreP === -1 && scoreG <= 0) { label = "Expensive"; rationale = "premium above what history pays for this growth"; }
    else if (scoreG === 1 && scoreP >= 0) { label = "Attractive"; rationale = "growth above what history accompanies this premium"; }
    else if (scoreG === -1 && scoreP <= 0) { label = "Expensive"; rationale = "growth below what history accompanies this premium"; }
    else if (scoreP === 1 && scoreG === -1) { label = "Neutral"; rationale = "cheap-for-growth but growth lagging — mixed"; }
    else if (scoreP === -1 && scoreG === 1) { label = "Neutral"; rationale = "rich-for-growth but growth ripping — mixed"; }
    else { label = "Neutral"; rationale = "within historical range"; }
    return { premGivenGrowth: pGivenG, growthGivenPrem: gGivenP, impliedPrem, premGap, impliedGrowth, growthGap, label, score, rationale };
  }, [premiumSeries, growthSeries, summaryStats, rvBand]);

  // Similar setups analysis
  const similarAnalysis = useMemo(() => {
    if (premiumSeries.length < 60 || growthSeries.length < 60 || closesA.length < 60 || closesB.length < 60) return null;
    const gMap = new Map<string, number>();
    for (const pt of growthSeries) if (Number.isFinite(pt.value)) gMap.set(pt.time, pt.value);
    const pairs: Array<{ t: string; p: number; g: number }> = [];
    for (const pt of premiumSeries) {
      const gv = gMap.get(pt.time);
      if (gv !== undefined && Number.isFinite(pt.value) && Number.isFinite(gv)) pairs.push({ t: pt.time, p: pt.value, g: gv });
    }
    if (pairs.length < 60) return null;
    const pVals = pairs.map((p) => p.p);
    const gVals = pairs.map((p) => p.g);
    const meanP = pVals.reduce((s, v) => s + v, 0) / pVals.length;
    const meanG = gVals.reduce((s, v) => s + v, 0) / gVals.length;
    const ddof = Math.max(1, pVals.length - 1);
    const stdP = Math.sqrt(pVals.reduce((s, v) => s + (v - meanP) ** 2, 0) / ddof);
    const stdG = Math.sqrt(gVals.reduce((s, v) => s + (v - meanG) ** 2, 0) / ddof);
    if (stdP <= 0 || stdG <= 0) return null;

    const last = pairs[pairs.length - 1];
    const todayZP = (last.p - meanP) / stdP;
    const todayZG = (last.g - meanG) / stdG;

    // Running mean/std for historical normalization
    const runMeanP = new Float64Array(pairs.length);
    const runMeanG = new Float64Array(pairs.length);
    const runStdP = new Float64Array(pairs.length);
    const runStdG = new Float64Array(pairs.length);
    {
      let cnt = 0, rP = 0, rG = 0, rP2 = 0, rG2 = 0;
      for (let i = 0; i < pairs.length; i++) {
        cnt++;
        const zP = pairs[i].p - rP; rP += zP / cnt; rP2 += zP * (pairs[i].p - rP);
        const zG = pairs[i].g - rG; rG += zG / cnt; rG2 += zG * (pairs[i].g - rG);
        runMeanP[i] = rP; runMeanG[i] = rG;
        runStdP[i] = cnt >= 2 ? Math.sqrt(rP2 / (cnt - 1)) : stdP;
        runStdG[i] = cnt >= 2 ? Math.sqrt(rG2 / (cnt - 1)) : stdG;
      }
    }

    const bMap = new Map<string, number>();
    for (const pt of closesB) if (Number.isFinite(pt.value) && pt.value > 0) bMap.set(pt.time, pt.value);
    const pricePairs: Array<{ t: string; a: number; b: number }> = [];
    for (const pt of closesA) {
      if (!Number.isFinite(pt.value) || pt.value <= 0) continue;
      const bv = bMap.get(pt.time);
      if (bv != null) pricePairs.push({ t: pt.time, a: pt.value, b: bv });
    }
    if (pricePairs.length < 252) return null;
    const pairIdxMap = new Map<string, number>();
    pricePairs.forEach((pt, i) => pairIdxMap.set(pt.t, i));

    const maxLookback = Math.max(0, pairs.length - 1 - similarExclusion);
    const candidates: any[] = [];
    for (let i = 0; i < maxLookback; i++) {
      const pt = pairs[i];
      const sp = runStdP[i] > 0 ? runStdP[i] : stdP;
      const sg = runStdG[i] > 0 ? runStdG[i] : stdG;
      const zP = (pt.p - runMeanP[i]) / sp;
      const zG = (pt.g - runMeanG[i]) / sg;
      const dP = zP - todayZP;
      const dG = zG - todayZG;
      const dist = Math.sqrt(dP * dP + dG * dG);
      const pidx = pairIdxMap.get(pt.t);
      if (pidx === undefined) continue;
      const aBase = pricePairs[pidx].a;
      const bBase = pricePairs[pidx].b;
      if (!(aBase > 0) || !(bBase > 0)) continue;
      const fwd = (steps: number) => {
        const fi = pidx + steps;
        if (fi >= pricePairs.length) return NaN;
        return ((pricePairs[fi].a / aBase - 1) - (pricePairs[fi].b / bBase - 1)) * 100;
      };
      candidates.push({ date: pt.t, zPrem: zP, zGrowth: zG, distance: dist, fwd3M: fwd(63), fwd6M: fwd(126), fwd1Y: fwd(252), _pairIdx: pidx });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.distance - b.distance);

    const accepted: any[] = [];
    const acceptedPairIdxs: number[] = [];
    let droppedByGap = 0;
    for (const c of candidates) {
      if (accepted.length >= similarN) break;
      let tooClose = false;
      if (similarMinGap > 0) {
        for (const pidx of acceptedPairIdxs) {
          if (Math.abs(c._pairIdx - pidx) < similarMinGap) { tooClose = true; break; }
        }
      }
      if (tooClose) { droppedByGap++; continue; }
      accepted.push(c);
      acceptedPairIdxs.push(c._pairIdx);
    }

    const matches = accepted.map(({ _pairIdx: _, ...rest }) => rest);

    const summarize = (vals: number[]) => {
      const finite = vals.filter(Number.isFinite);
      if (finite.length === 0) return null;
      const sorted = [...finite].sort((a, b) => a - b);
      const pct = (f: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(f * (sorted.length - 1))))];
      const mean = finite.reduce((s, v) => s + v, 0) / finite.length;
      return {
        median: pct(0.5), mean, p25: pct(0.25), p75: pct(0.75),
        hitRate: finite.filter((v) => v > 0).length / finite.length * 100,
        n: finite.length, min: sorted[0], max: sorted[sorted.length - 1],
      };
    };

    const yearCounts = new Map<number, number>();
    let yearMin = Infinity, yearMax = -Infinity;
    for (const m of matches) {
      const yr = parseInt(m.date.slice(0, 4), 10);
      if (Number.isFinite(yr)) {
        yearCounts.set(yr, (yearCounts.get(yr) || 0) + 1);
        if (yr < yearMin) yearMin = yr;
        if (yr > yearMax) yearMax = yr;
      }
    }
    if (!Number.isFinite(yearMin)) { yearMin = 0; yearMax = 0; }

    let cluster = null;
    if (accepted.length >= 4) {
      const sorted = [...accepted].sort((a, b) => a._pairIdx - b._pairIdx);
      const windowDays = 90;
      let maxCount = 0, bestStart = 0, bestEnd = 0, tail = 0;
      for (let i = 0; i < sorted.length; i++) {
        while (sorted[i]._pairIdx - sorted[tail]._pairIdx > windowDays) tail++;
        const cnt = i - tail + 1;
        if (cnt > maxCount) { maxCount = cnt; bestStart = tail; bestEnd = i; }
      }
      const share = maxCount / accepted.length;
      if (share > 0.5) {
        const mid = Math.floor((bestStart + bestEnd) / 2);
        cluster = { dominantMonth: sorted[mid].date.slice(0, 7), share };
      }
    }

    return {
      matches, todayZPrem: todayZP, todayZGrowth: todayZG,
      h3M: summarize(matches.map((m: any) => m.fwd3M)),
      h6M: summarize(matches.map((m: any) => m.fwd6M)),
      h1Y: summarize(matches.map((m: any) => m.fwd1Y)),
      totalCandidates: candidates.length, droppedByGap, yearCounts, yearMin, yearMax, cluster,
    };
  }, [premiumSeries, growthSeries, closesA, closesB, similarN, similarExclusion, similarMinGap]);

  // ── Crosshair value maps ───────────────────────────────────────────────────
  const premiumMap = useMemo(() => { const m = new Map<string, number>(); for (const p of premiumSeries) m.set(p.time, p.value); return m; }, [premiumSeries]);
  const growthMap2 = useMemo(() => { const m = new Map<string, number>(); for (const p of growthSeries) m.set(p.time, p.value); return m; }, [growthSeries]);
  const ratioMap = useMemo(() => { const m = new Map<string, number>(); for (const p of ratioSeries) m.set(p.time, p.value); return m; }, [ratioSeries]);
  const rollCorrMap = useMemo(() => { const m = new Map<string, number>(); for (const p of rollCorrSeries) m.set(p.time, p.value); return m; }, [rollCorrSeries]);
  const relReturnMap = useMemo(() => { const m = new Map<string, number>(); for (const p of relReturnSeries) m.set(p.time, p.value); return m; }, [relReturnSeries]);
  const relRatioMap = useMemo(() => { const m = new Map<string, number>(); for (const p of relRatioSeries) m.set(p.time, p.value); return m; }, [relRatioSeries]);
  const rawRatioMap = useMemo(() => { const m = new Map<string, number>(); for (const p of rawRatioSeries) m.set(p.time, p.value); return m; }, [rawRatioSeries]);

  // ── Chart creation helpers ─────────────────────────────────────────────────
  const createBaseChart = (container: HTMLElement) => {
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: TRANSPARENT_COLOR }, textColor: TEXT_COLOR, fontSize: 11 },
      grid: { vertLines: { color: GRID_LINE_COLOR }, horzLines: { color: GRID_LINE_COLOR } },
      rightPriceScale: { borderColor: GRID_LINE_COLOR },
      timeScale: { borderColor: GRID_LINE_COLOR, timeVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: false,
      kineticScroll: { mouse: false, touch: false },
      height: 0,
    });
    chart.applyOptions({ handleScale: { mouseWheel: true, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: false } });
    return chart;
  };

  // ── Premium chart ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!premiumContainerRef.current) return;
    if (!premiumChartRef.current) {
      premiumChartRef.current = createBaseChart(premiumContainerRef.current);
      const addSeriesFn = (premiumChartRef.current as any).addSeries || (premiumChartRef.current as any).addAreaSeries?.bind(premiumChartRef.current);
      const series = premiumChartRef.current.addSeries(AreaSeries, {
        lineColor: TODAY_MARKER_COLOR, topColor: "rgba(245,158,11,0.30)", bottomColor: "rgba(245,158,11,0.02)",
        lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      });
      premiumSeriesRef.current = series;
      series.createPriceLine({ price: 0, color: ZERO_LINE_COLOR, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    }
    if (premiumSeriesRef.current) {
      premiumSeriesRef.current.setData(toTimeValue(premiumSeries));
      premiumChartRef.current?.timeScale().fitContent();
    }
  }, [premiumSeries]);

  // ── Growth chart ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!growthContainerRef.current) return;
    if (!growthChartRef.current) {
      growthChartRef.current = createBaseChart(growthContainerRef.current);
      const series = growthChartRef.current.addSeries(LineSeries, {
        color: "rgba(56,189,248,0.95)", lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      });
      growthSeriesRef.current = series;
      series.createPriceLine({ price: 0, color: ZERO_LINE_COLOR, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    }
    if (growthSeriesRef.current) {
      growthSeriesRef.current.setData(toTimeValue(growthSeries));
      growthChartRef.current?.timeScale().fitContent();
    }
  }, [growthSeries]);

  // ── Ratio chart ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ratioContainerRef.current) return;
    if (!ratioChartRef.current) {
      ratioChartRef.current = createBaseChart(ratioContainerRef.current);
      const series = ratioChartRef.current.addSeries(LineSeries, {
        color: "rgba(168,85,247,0.95)", lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      });
      ratioSeriesRef.current = series;
      series.createPriceLine({ price: 0, color: ZERO_LINE_COLOR, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    }
    if (ratioSeriesRef.current) {
      ratioSeriesRef.current.setData(toTimeValue(ratioSeries));
      ratioChartRef.current?.timeScale().fitContent();
    }
  }, [ratioSeries]);

  // ── Rolling Corr chart ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!rollCorrContainerRef.current) return;
    if (!rollCorrChartRef.current) {
      rollCorrChartRef.current = createBaseChart(rollCorrContainerRef.current);
      (rollCorrChartRef.current as any).applyOptions?.({ rightPriceScale: { borderColor: GRID_LINE_COLOR } });
      const seriesA = rollCorrChartRef.current.addSeries(AreaSeries, {
        lineColor: "rgba(20,184,166,0.95)", topColor: "rgba(20,184,166,0.30)", bottomColor: "rgba(20,184,166,0.02)",
        lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: -1, maxValue: 1 } }),
      });
      rollCorrSeriesRef.current = seriesA;
      seriesA.createPriceLine({ price: 0, color: ZERO_LINE_COLOR, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      seriesA.createPriceLine({ price: 1, color: "rgba(255,255,255,0.10)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      seriesA.createPriceLine({ price: -1, color: "rgba(255,255,255,0.10)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      const seriesB = rollCorrChartRef.current.addSeries(LineSeries, {
        color: "rgba(217,70,239,0.95)", lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: -1, maxValue: 1 } }),
      });
      rollCorrRatioSeriesRef.current = seriesB;
    }
    if (rollCorrSeriesRef.current) rollCorrSeriesRef.current.setData(toTimeValue(rollCorrSeries));
    if (rollCorrRatioSeriesRef.current) rollCorrRatioSeriesRef.current.setData(toTimeValue(rollCorrRatioVsABSeries));
  }, [rollCorrSeries, rollCorrRatioVsABSeries, visibleCharts]);

  // ── Rel Return chart ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!relReturnContainerRef.current) return;
    if (!relReturnChartRef.current) {
      relReturnChartRef.current = createBaseChart(relReturnContainerRef.current);
      const series = relReturnChartRef.current.addSeries(AreaSeries, {
        lineColor: "rgba(16,185,129,0.95)", topColor: "rgba(16,185,129,0.30)", bottomColor: "rgba(16,185,129,0.02)",
        lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      });
      relReturnSeriesRef.current = series;
      series.createPriceLine({ price: 0, color: ZERO_LINE_COLOR, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    }
    if (relReturnSeriesRef.current) relReturnSeriesRef.current.setData(toTimeValue(relReturnSeries));
  }, [relReturnSeries, visibleCharts]);

  // ── Rel Ratio chart ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!relRatioContainerRef.current) return;
    if (!relRatioChartRef.current) {
      const opts: any = {};
      relRatioChartRef.current = createBaseChart(relRatioContainerRef.current);
      relRatioChartRef.current.applyOptions?.({ rightPriceScale: { borderColor: GRID_LINE_COLOR, mode: 1 } });
      const series = relRatioChartRef.current.addSeries(LineSeries, {
        color: "rgba(244,63,94,0.95)", lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      });
      relRatioSeriesRef.current = series;
      series.createPriceLine({ price: 1, color: ZERO_LINE_COLOR, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    }
    if (relRatioSeriesRef.current) relRatioSeriesRef.current.setData(toTimeValue(relRatioSeries));
  }, [relRatioSeries, visibleCharts]);

  // ── Raw Ratio chart ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rawRatioContainerRef.current) return;
    if (!rawRatioChartRef.current) {
      rawRatioChartRef.current = createBaseChart(rawRatioContainerRef.current);
      rawRatioChartRef.current.applyOptions?.({ rightPriceScale: { borderColor: GRID_LINE_COLOR, mode: 1 } });
      const series = rawRatioChartRef.current.addSeries(LineSeries, {
        color: "rgba(56,189,248,0.95)", lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      });
      rawRatioSeriesRef.current = series;
    }
    if (rawRatioSeriesRef.current) rawRatioSeriesRef.current.setData(toTimeValue(rawRatioSeries));
  }, [rawRatioSeries, visibleCharts]);

  // ── RV Verdict chart ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!rvVerdictContainerRef.current) return;
    if (!rvVerdictChartRef.current) {
      rvVerdictChartRef.current = createBaseChart(rvVerdictContainerRef.current);
      const series = rvVerdictChartRef.current.addSeries(HistogramSeries, {
        priceFormat: { type: "price", precision: 0, minMove: 1 },
        priceLineVisible: false, lastValueVisible: true, base: 0,
      });
      rvVerdictSeriesRef.current = series;
    }
    if (rvVerdictSeriesRef.current) {
      const greenHigh = "rgba(34,197,94,0.95)";
      const greenMid = "rgba(34,197,94,0.55)";
      const redHigh = "rgba(239,68,68,0.95)";
      const redMid = "rgba(239,68,68,0.55)";
      const gray = "rgba(156,163,175,0.55)";
      const bars = rvVerdictSeries.map((pt: any) => {
        let color = gray;
        if (pt.score >= 2) color = greenHigh;
        else if (pt.score === 1) color = greenMid;
        else if (pt.score <= -2) color = redHigh;
        else if (pt.score === -1) color = redMid;
        return { time: pt.time, value: pt.score, color };
      });
      rvVerdictSeriesRef.current.setData(bars);
    }
  }, [rvVerdictSeries, visibleCharts]);

  // ── Fit all charts when data changes ──────────────────────────────────────
  useEffect(() => {
    if (premiumSeries.length === 0 && relReturnSeries.length === 0) return;
    const raf = requestAnimationFrame(() => {
      const refs = [premiumChartRef, growthChartRef, ratioChartRef, rollCorrChartRef,
        relReturnChartRef, relRatioChartRef, rawRatioChartRef, rvVerdictChartRef];
      for (const ref of refs) {
        try { ref.current?.timeScale().fitContent(); } catch {}
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [premiumSeries, growthSeries, ratioSeries, rollCorrSeries, relReturnSeries, relRatioSeries, rawRatioSeries, rvVerdictSeries]);

  // ── Earnings primitives ────────────────────────────────────────────────────
  useEffect(() => {
    const attached: Array<{ series: any; primitive: any }> = [];
    const cleanup = () => {
      for (const { series, primitive } of attached) {
        try { series.detachPrimitive(primitive); } catch {}
      }
      earnPremRef.current = null;
      earnGrowthRef.current = null;
      earnRatioRef.current = null;
      earnRollCorrRef.current = null;
      earnRelReturnRef.current = null;
      earnRelRatioRef.current = null;
      earnRawRatioRef.current = null;
    };
    if (!showEarnings || earningsDates.length === 0) return cleanup;
    const markers = earningsDates.map((d) => ({ time: d, color: "#f59e0b", label: "E" }));
    const attach = (ref: React.MutableRefObject<any>, series: any) => {
      if (!series) return;
      const prim = new EarningsDatePrimitive(markers);
      try {
        series.attachPrimitive(prim);
        ref.current = prim;
        attached.push({ series, primitive: prim });
      } catch (e) {
        console.warn("Failed to attach earnings primitive:", e);
      }
    };
    attach(earnPremRef, premiumSeriesRef.current);
    attach(earnGrowthRef, growthSeriesRef.current);
    attach(earnRatioRef, ratioSeriesRef.current);
    attach(earnRollCorrRef, rollCorrSeriesRef.current);
    attach(earnRelReturnRef, relReturnSeriesRef.current);
    attach(earnRelRatioRef, relRatioSeriesRef.current);
    attach(earnRawRatioRef, rawRatioSeriesRef.current);
    requestAnimationFrame(() => {
      const chartRefs = [premiumChartRef, growthChartRef, ratioChartRef, rollCorrChartRef, relReturnChartRef, relRatioChartRef, rawRatioChartRef];
      for (const ref of chartRefs) {
        try { ref.current?.applyOptions({}); } catch {}
      }
    });
    return cleanup;
  }, [earningsDates, showEarnings,
    premiumSeries.length === 0, growthSeries.length === 0, ratioSeries.length === 0,
    rollCorrSeries.length === 0, relReturnSeries.length === 0, relRatioSeries.length === 0, rawRatioSeries.length === 0]);

  // ── Chart sync: logical range ──────────────────────────────────────────────
  useEffect(() => {
    const charts = [
      { chart: premiumChartRef.current, hasData: premiumSeries.length > 0 },
      { chart: growthChartRef.current, hasData: growthSeries.length > 0 },
      { chart: ratioChartRef.current, hasData: ratioSeries.length > 0 },
      { chart: rollCorrChartRef.current, hasData: rollCorrSeries.length > 0 },
      { chart: relReturnChartRef.current, hasData: relReturnSeries.length > 0 },
      { chart: relRatioChartRef.current, hasData: relRatioSeries.length > 0 },
      { chart: rawRatioChartRef.current, hasData: rawRatioSeries.length > 0 },
      { chart: rvVerdictChartRef.current, hasData: rvVerdictSeries.length > 0 },
    ].filter((c) => c.chart && c.hasData).map((c) => c.chart);
    if (charts.length < 2) return;
    let syncing = false;
    const sync = (range: any, source: any) => {
      if (syncing || !range) return;
      try {
        syncing = true;
        for (const ch of charts) if (ch !== source) ch.timeScale().setVisibleLogicalRange(range);
      } catch {} finally { syncing = false; }
    };
    const subs: Array<{ chart: any; fn: any }> = [];
    for (const ch of charts) {
      const fn = (range: any) => sync(range, ch);
      ch.timeScale().subscribeVisibleLogicalRangeChange(fn);
      subs.push({ chart: ch, fn });
    }
    return () => {
      for (const { chart, fn } of subs) {
        try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(fn); } catch {}
      }
    };
  }, [premiumSeries.length === 0, growthSeries.length === 0, ratioSeries.length === 0, rollCorrSeries.length === 0,
    relReturnSeries.length === 0, relRatioSeries.length === 0, rawRatioSeries.length === 0, rvVerdictSeries.length === 0, visibleCharts]);

  // ── Chart sync: crosshair ─────────────────────────────────────────────────
  useEffect(() => {
    const normTime = (t: any): string | null => {
      if (t == null) return null;
      if (typeof t === "string") return t;
      if (typeof t === "object" && "year" in t) {
        const p = (n: number) => String(n).padStart(2, "0");
        return `${t.year}-${p(t.month)}-${p(t.day)}`;
      }
      if (typeof t === "number") {
        const d = new Date(t * 1000);
        const p = (n: number) => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
      }
      return null;
    };
    const items = [
      { chart: premiumChartRef.current, series: premiumSeriesRef.current, hasData: premiumSeries.length > 0 },
      { chart: growthChartRef.current, series: growthSeriesRef.current, hasData: growthSeries.length > 0 },
      { chart: ratioChartRef.current, series: ratioSeriesRef.current, hasData: ratioSeries.length > 0 },
      { chart: rollCorrChartRef.current, series: rollCorrSeriesRef.current, hasData: rollCorrSeries.length > 0 },
      { chart: relReturnChartRef.current, series: relReturnSeriesRef.current, hasData: relReturnSeries.length > 0 },
      { chart: relRatioChartRef.current, series: relRatioSeriesRef.current, hasData: relRatioSeries.length > 0 },
      { chart: rawRatioChartRef.current, series: rawRatioSeriesRef.current, hasData: rawRatioSeries.length > 0 },
      { chart: rvVerdictChartRef.current, series: rvVerdictSeriesRef.current, hasData: rvVerdictSeries.length > 0 },
    ].filter((i) => !!i.chart && !!i.series && i.hasData);
    if (items.length === 0) return;
    let syncing = false;
    const makeHandler = (sourceChart: any) => (param: any) => {
      if (syncing) return;
      syncing = true;
      try {
        const timeStr = param?.time ? normTime(param.time) : null;
        for (const { chart, series } of items) {
          if (chart === sourceChart) continue;
          try {
            if (param?.time && series) chart.setCrosshairPosition(NaN, param.time, series);
            else chart.clearCrosshairPosition();
          } catch {}
        }
        setCrosshairTime((prev) => (prev === timeStr ? prev : timeStr));
      } finally { syncing = false; }
    };
    const subs: Array<{ chart: any; fn: any }> = [];
    for (const { chart } of items) {
      const fn = makeHandler(chart);
      chart.subscribeCrosshairMove(fn);
      subs.push({ chart, fn });
    }
    return () => {
      for (const { chart, fn } of subs) {
        try { chart.unsubscribeCrosshairMove(fn); } catch {}
      }
      setCrosshairTime(null);
    };
  }, [premiumSeries.length === 0, growthSeries.length === 0, ratioSeries.length === 0, rollCorrSeries.length === 0,
    relReturnSeries.length === 0, relRatioSeries.length === 0, rawRatioSeries.length === 0, rvVerdictSeries.length === 0, visibleCharts]);

  // ── Resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const pairs = [
        [premiumContainerRef.current, premiumChartRef.current],
        [growthContainerRef.current, growthChartRef.current],
        [ratioContainerRef.current, ratioChartRef.current],
        [rollCorrContainerRef.current, rollCorrChartRef.current],
        [relReturnContainerRef.current, relReturnChartRef.current],
        [relRatioContainerRef.current, relRatioChartRef.current],
        [rawRatioContainerRef.current, rawRatioChartRef.current],
        [rvVerdictContainerRef.current, rvVerdictChartRef.current],
      ];
      for (const [container, chart] of pairs) {
        if (container && chart) {
          chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
        }
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    const containers = [
      premiumContainerRef.current, growthContainerRef.current, ratioContainerRef.current,
      rollCorrContainerRef.current, relReturnContainerRef.current, relRatioContainerRef.current,
      rawRatioContainerRef.current, rvVerdictContainerRef.current,
    ];
    for (const c of containers) if (c) ro.observe(c);
    window.addEventListener("resize", resize);
    return () => { ro.disconnect(); window.removeEventListener("resize", resize); };
  }, []);

  // ── Chart cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const charts = [premiumChartRef, growthChartRef, ratioChartRef, rollCorrChartRef,
        relReturnChartRef, relRatioChartRef, rawRatioChartRef, rvVerdictChartRef];
      for (const ref of charts) {
        try { ref.current?.remove(); } catch {}
        ref.current = null;
      }
      const seriesRefs = [premiumSeriesRef, growthSeriesRef, ratioSeriesRef, rollCorrSeriesRef,
        rollCorrRatioSeriesRef, relReturnSeriesRef, relRatioSeriesRef, rawRatioSeriesRef, rvVerdictSeriesRef];
      for (const ref of seriesRefs) ref.current = null;
    };
  }, []);

  // ── Scatter canvas ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = scatterCanvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const gMap = new Map<string, number>();
    for (const pt of growthSeries) gMap.set(pt.time, pt.value);
    const points: Array<{ x: number; y: number; t: string; ageRatio: number }> = [];
    let idx = 0;
    const total = premiumSeries.length;
    for (const pt of premiumSeries) {
      const gv = gMap.get(pt.time);
      if (gv !== undefined && Number.isFinite(gv) && Number.isFinite(pt.value)) {
        points.push({ x: gv, y: pt.value, t: pt.time, ageRatio: total > 1 ? idx / (total - 1) : 1 });
      }
      idx++;
    }

    const margin = { l: 64, r: 24, t: 16, b: 56 };
    const pw = Math.max(0, w - margin.l - margin.r);
    const ph = Math.max(0, h - margin.t - margin.b);

    if (points.length < 5) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "12px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(loadingCloses ? "Computing…" : "Not enough overlapping data", w / 2, h / 2);
      return;
    }

    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const pt of points) {
      if (pt.x < xMin) xMin = pt.x;
      if (pt.x > xMax) xMax = pt.x;
      if (pt.y < yMin) yMin = pt.y;
      if (pt.y > yMax) yMax = pt.y;
    }
    const xPad = (xMax - xMin) * 0.06 || 1;
    const yPad = (yMax - yMin) * 0.06 || 1;
    xMin -= xPad; xMax += xPad; yMin -= yPad; yMax += yPad;
    if (xMin > 0 && xMin < xMax - xMin) xMin = 0;
    if (xMax < 0 && xMax > -(xMax - xMin)) xMax = 0;
    if (yMin > 0 && yMin < yMax - yMin) yMin = 0;
    if (yMax < 0 && yMax > -(yMax - yMin)) yMax = 0;

    const toX = (v: number) => margin.l + (v - xMin) / (xMax - xMin) * pw;
    const toY = (v: number) => margin.t + (1 - (v - yMin) / (yMax - yMin)) * ph;

    // Axes
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(margin.l, margin.t, pw, ph);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const v = yMin + i / 4 * (yMax - yMin);
      const sy = toY(v);
      ctx.fillText(`${Math.round(v)}%`, margin.l - 6, sy);
      ctx.strokeStyle = GRID_LINE_COLOR;
      ctx.beginPath(); ctx.moveTo(margin.l, sy); ctx.lineTo(margin.l + pw, sy); ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= 4; i++) {
      const v = xMin + i / 4 * (xMax - xMin);
      const sx = toX(v);
      ctx.fillText(`${Math.round(v)}`, sx, margin.t + ph + 6);
      ctx.strokeStyle = GRID_LINE_COLOR;
      ctx.beginPath(); ctx.moveTo(sx, margin.t); ctx.lineTo(sx, margin.t + ph); ctx.stroke();
    }

    // Zero lines
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.setLineDash([3, 3]);
    if (xMin < 0 && xMax > 0) {
      const sx = toX(0);
      ctx.beginPath(); ctx.moveTo(sx, margin.t); ctx.lineTo(sx, margin.t + ph); ctx.stroke();
    }
    if (yMin < 0 && yMax > 0) {
      const sy = toY(0);
      ctx.beginPath(); ctx.moveTo(margin.l, sy); ctx.lineTo(margin.l + pw, sy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`Growth differential (pp) — ${growthMetric}`, margin.l + pw / 2, h - 14);
    ctx.save();
    ctx.translate(16, margin.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`Premium / Discount (%) — ${valMetric}`, 0, 0);
    ctx.restore();

    const periodFilterFn = parsePeriodFilter(periodFilter);
    const hasFilter = periodFilterFn !== null;
    const isHighlighted = (t: string) => hasFilter && periodFilterFn!(t);

    if (scatterView === "heatmap") {
      const cellSize = Math.max(8, Math.floor(pw / 32));
      const cols = Math.max(1, Math.floor(pw / cellSize));
      const rows = Math.max(1, Math.floor(ph / cellSize));
      const grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
      let maxCount = 0;
      for (const pt of points) {
        const col = Math.floor((toX(pt.x) - margin.l) / cellSize);
        const row = Math.floor((toY(pt.y) - margin.t) / cellSize);
        if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
        grid[row][col]++;
        if (grid[row][col] > maxCount) maxCount = grid[row][col];
      }
      const heatColor = (t: number): [number, number, number] => {
        const f = Math.pow(Math.max(0, Math.min(1, t)), 0.55);
        if (f < 0.5) {
          const g = f / 0.5;
          return [Math.round(20 + 25 * g), Math.round(30 + 140 * g), Math.round(60 + 120 * g)];
        } else {
          const g = (f - 0.5) / 0.5;
          return [Math.round(45 + 200 * g), Math.round(170 - 12 * g), Math.round(180 - 169 * g)];
        }
      };
      if (maxCount > 0) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cnt = grid[r][c];
            if (cnt === 0) continue;
            const [ri, gi, bi] = heatColor(cnt / maxCount);
            const alpha = 0.45 + 0.5 * (cnt / maxCount);
            ctx.fillStyle = `rgba(${ri}, ${gi}, ${bi}, ${alpha})`;
            ctx.fillRect(margin.l + c * cellSize, margin.t + r * cellSize, cellSize, cellSize);
          }
        }
        // Legend
        const legW = 100, legH = 8;
        const legX = margin.l + pw - legW - 4, legY = margin.t + 6;
        for (let i = 0; i < legW; i++) {
          const [ri, gi, bi] = heatColor(i / (legW - 1));
          ctx.fillStyle = `rgba(${ri}, ${gi}, ${bi}, 0.95)`;
          ctx.fillRect(legX + i, legY, 1, legH);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1;
        ctx.strokeRect(legX, legY, legW, legH);
        ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText("low", legX, legY + legH + 2);
        ctx.textAlign = "right";
        ctx.fillText(`${maxCount} days`, legX + legW, legY + legH + 2);
      }
      if (hasFilter) {
        for (const pt of points) {
          if (isHighlighted(pt.t)) {
            ctx.fillStyle = "rgba(56,189,248,0.95)";
            ctx.beginPath(); ctx.arc(toX(pt.x), toY(pt.y), 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "rgba(15,23,42,0.6)"; ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    } else if (hasFilter) {
      for (const pt of points) {
        if (!isHighlighted(pt.t)) {
          ctx.fillStyle = "rgba(255,255,255,0.06)";
          ctx.beginPath(); ctx.arc(toX(pt.x), toY(pt.y), 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      for (const pt of points) {
        if (isHighlighted(pt.t)) {
          ctx.fillStyle = "rgba(56,189,248,0.85)";
          ctx.beginPath(); ctx.arc(toX(pt.x), toY(pt.y), 4, 0, Math.PI * 2); ctx.fill();
        }
      }
    } else {
      for (const pt of points) {
        const alpha = 0.18 + 0.65 * pt.ageRatio;
        const radius = 2 + 2.5 * pt.ageRatio;
        const r = Math.round(245 - 60 * (1 - pt.ageRatio));
        const g = Math.round(158 - 80 * (1 - pt.ageRatio));
        const b = Math.round(11 + 180 * (1 - pt.ageRatio));
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.beginPath(); ctx.arc(toX(pt.x), toY(pt.y), radius, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Today marker
    if (points.length > 0) {
      const today = points[points.length - 1];
      ctx.strokeStyle = TODAY_MARKER_COLOR; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(toX(today.x), toY(today.y), 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(245,158,11,0.95)";
      ctx.font = "10px ui-monospace, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText("today", toX(today.x) + 9, toY(today.y));
    }

    // Pin date marker
    let pinDateMatch: { x: number; y: number; t: string } | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(pinDate.trim()) && points.length > 0) {
      let best = points[0], minDiff = Infinity;
      const pinMs = Date.parse(pinDate.trim());
      if (Number.isFinite(pinMs)) {
        for (const pt of points) {
          const ptMs = Date.parse(pt.t);
          if (!Number.isFinite(ptMs)) continue;
          const diff = Math.abs(ptMs - pinMs);
          if (diff < minDiff) { minDiff = diff; best = pt; }
        }
        pinDateMatch = { x: best.x, y: best.y, t: best.t };
      }
    }
    if (pinDateMatch) {
      const px = toX(pinDateMatch.x), py = toY(pinDateMatch.y);
      const color = "rgba(34,197,94,0.95)";
      ctx.strokeStyle = "rgba(34,197,94,0.35)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(margin.l, py); ctx.lineTo(margin.l + pw, py); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, margin.t); ctx.lineTo(px, margin.t + ph); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke();
      const label = `${pinDateMatch.t}  •  prem ${pinDateMatch.y.toFixed(1)}%  •  Δg ${pinDateMatch.x.toFixed(1)}pp`;
      ctx.font = "10px ui-monospace, monospace";
      const labelW = ctx.measureText(label).width + 12;
      const labelH = 18;
      let lx = px + 12, ly = py - labelH - 12;
      if (lx + labelW > margin.l + pw) lx = px - labelW - 12;
      if (ly < margin.t) ly = py + 12;
      ctx.fillStyle = "rgba(20,20,20,0.92)"; ctx.fillRect(lx, ly, labelW, labelH);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(lx, ly, labelW, labelH);
      ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(label, lx + 6, ly + labelH / 2);
    }
  }, [premiumSeries, growthSeries, valMetric, growthMetric, loadingCloses, pinDate, periodFilter, scatterView]);

  // ── CSV export ─────────────────────────────────────────────────────────────
  function handleExportCSV() {
    const gMap = new Map<string, number>();
    for (const pt of growthSeries) gMap.set(pt.time, pt.value);
    const rows = ["date,premium_pct,growth_diff_pp,rel_return_pp,rel_ratio"];
    for (const pt of premiumSeries) {
      const gv = gMap.get(pt.time);
      const relRet = relReturnMap.get(pt.time);
      const relRat = relRatioMap.get(pt.time);
      rows.push(`${pt.time},${pt.value.toFixed(4)},${gv !== undefined ? gv.toFixed(4) : ""},${relRet !== undefined ? relRet.toFixed(4) : ""},${relRat !== undefined ? relRat.toFixed(6) : ""}`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = compareMode === "peer"
      ? `${target}_vs_${dimension}_${valMetric}_${growthMetric}.csv`
      : compareMode === "ticker"
      ? `${target}_vs_${peerTicker}_${valMetric}_${growthMetric}.csv`
      : compareMode === "basket"
      ? `${target}_vs_basket_${basketLabel}_${valMetric}_${growthMetric}.csv`
      : `${groupALabel}_vs_${groupBLabel}_${valMetric}_${growthMetric}.csv`;
    a.download = filename.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Inline IQR bar helper ─────────────────────────────────────────────────
  function IQRBar({ p25, p50, p75, today, fmt }: { p25: number; p50: number; p75: number; today: number; fmt: (v: number) => string }) {
    const allVals = [p25, p50, p75, today];
    const lo = Math.min(...allVals) - 0.5;
    const hi = Math.max(...allVals) + 0.5;
    const range = Math.max(0.001, hi - lo);
    const pct = (v: number) => `${((v - lo) / range) * 100}%`;
    return (
      <div className="relative h-5 w-full bg-muted/20 rounded-sm overflow-hidden">
        <div
          className="absolute top-0 bottom-0 bg-cyan-500/15 border-l border-r border-cyan-400/40"
          style={{ left: pct(p25), width: `calc(${pct(p75)} - ${pct(p25)})` }}
          title={`IQR: ${fmt(p25)} … ${fmt(p75)}`}
        />
        <div className="absolute top-0 bottom-0 w-px bg-cyan-300" style={{ left: pct(p50) }} title={`Implied: ${fmt(p50)}`} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-amber-300" style={{ left: pct(today) }} title={`Today: ${fmt(today)}`} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const rvVerdictLabelClass =
    rvVerdictAnalysis.label === "Attractive"
      ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
      : rvVerdictAnalysis.label === "Expensive"
      ? "text-rose-300 border-rose-500/40 bg-rose-500/10"
      : "text-amber-300/90 border-amber-500/30 bg-amber-500/5";
  const fmtPP = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;
  const fmtPct2 = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* ── Header ── */}
      <div className="border-b border-border bg-card px-4 py-2.5 flex-shrink-0">
        <div className="flex items-end gap-3 flex-wrap">
          {/* Ticker */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker</label>
            <select
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[200px]"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={loading}
              data-testid="select-target"
            >
              {tickers.map((t: any) => (
                <option key={t.ticker} value={t.ticker}>{t.ticker} — {t.name}</option>
              ))}
            </select>
          </div>

          {/* Compare mode */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Compare To</label>
            <div className="flex border border-border rounded overflow-hidden text-[10px] font-mono">
              <button onClick={() => setCompareMode("peer")} className={`px-2 py-1 transition-colors ${compareMode === "peer" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`} data-testid="btn-mode-peer" title="Compare target ticker against peer group median">Peer Group</button>
              <button onClick={() => setCompareMode("ticker")} className={`px-2 py-1 transition-colors border-l border-border ${compareMode === "ticker" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`} data-testid="btn-mode-ticker" title="Compare target ticker against a single chosen ticker">Ticker</button>
              <button onClick={() => setCompareMode("group")} className={`px-2 py-1 transition-colors border-l border-border ${compareMode === "group" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`} data-testid="btn-mode-group" title="Compare an entire classification group vs another (e.g. Net Lease vs All REITs)">Group</button>
              <button onClick={() => setCompareMode("basket")} className={`px-2 py-1 transition-colors border-l border-border ${compareMode === "basket" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`} data-testid="btn-mode-basket" title="Compare target ticker against a named custom basket">Basket</button>
            </div>
          </div>

          {/* Basket mode UI */}
          {compareMode === "basket" && (
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
              <div className="flex gap-1 items-center">
                {baskets.length === 0 ? (
                  <button type="button" onClick={() => setBasketEditorOpen(true)} className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 border border-amber-500/60 bg-amber-500/10 text-amber-300 rounded hover:bg-amber-500/20 transition-colors" data-testid="btn-create-first-basket" title="Create your first basket">
                    <Settings2 className="w-3 h-3" /> + Create your first basket
                  </button>
                ) : (
                  <>
                    <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[180px]" value={basketId ?? ""} onChange={(e) => setBasketId(e.target.value)} data-testid="select-basket">
                      {!basketId && <option value="">— select basket —</option>}
                      {baskets.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.tickers.length})</option>)}
                    </select>
                    <button type="button" onClick={() => setBasketEditorOpen(true)} className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 border border-dashed border-border rounded text-muted-foreground hover:text-foreground hover:border-amber-500/40 transition-colors" title="Manage baskets">
                      <Settings2 className="w-3 h-3" /> Manage
                    </button>
                  </>
                )}
              </div>
              {basketSelected && basketSelected.tickers.length < 2 && (
                <span className="text-[10px] font-mono text-amber-400">Add at least 2 tickers to this basket</span>
              )}
              {basketSelected && basketSelected.tickers.length >= 2 && (
                <span className="text-[10px] font-mono text-muted-foreground">{basketSelected.tickers.length} tickers</span>
              )}
              <div className="flex items-center gap-1 mt-1" data-testid="basket-aggregation-toggle">
                <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Aggregation</span>
                <div className="flex border border-border rounded overflow-hidden">
                  <button type="button" onClick={() => setBasketAggregation("capWeighted")} className={`text-[10px] font-mono px-2 py-0.5 transition-colors ${basketAggregation === "capWeighted" ? "bg-amber-500/20 text-amber-300" : "text-muted-foreground hover:text-foreground"}`} title="Cap-weighted">Cap-wtd</button>
                  <button type="button" onClick={() => setBasketAggregation("median")} className={`text-[10px] font-mono px-2 py-0.5 transition-colors ${basketAggregation === "median" ? "bg-amber-500/20 text-amber-300" : "text-muted-foreground hover:text-foreground"}`} title="Plain cross-sectional median">Median</button>
                </div>
              </div>
            </div>
          )}

          {/* Peer mode */}
          {compareMode === "peer" ? (
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Peer Group</label>
              <div className="flex gap-1">
                <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[110px]" value={dimension} onChange={(e) => { setDimension(e.target.value); setPeerValueOverride(""); }} data-testid="select-dimension" title="Classification dimension for the peer group">
                  {CLASSIFICATION_DIMENSIONS.map((d: string) => <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>)}
                </select>
                <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[170px]" value={peerValueOverride || peerLabel || ""} onChange={(e) => setPeerValueOverride(e.target.value)} data-testid="select-peer-value" title="Classification value: defaults to the target ticker's own group">
                  {peerLabel && peerLabel !== ALL_REITS_KEY && <option value={peerLabel}>{peerLabel}{peerValueOverride ? "" : " (auto)"}</option>}
                  <option value={ALL_REITS_KEY}>All REITs</option>
                  {(dimensionValues[dimension] || []).filter((v) => v !== peerLabel).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
          ) : compareMode === "ticker" ? (
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">vs Ticker</label>
              <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[200px]" value={peerTicker} onChange={(e) => setPeerTicker(e.target.value)} disabled={loading} data-testid="select-peer-ticker">
                {peerTicker === "" && <option value="">— select a ticker —</option>}
                {tickers.filter((t: any) => t.ticker !== target).map((t: any) => <option key={t.ticker} value={t.ticker}>{t.ticker} — {t.name}</option>)}
              </select>
            </div>
          ) : compareMode === "group" ? (
            <>
              {/* Group A */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Group A</label>
                  <div className="flex border border-border rounded overflow-hidden text-[9px] font-mono">
                    <button type="button" onClick={() => setGroupAKind("classification")} className={`px-1.5 py-0.5 transition-colors ${groupAKind === "classification" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent"}`}>Class</button>
                    <button type="button" onClick={() => setGroupAKind("basket")} className={`px-1.5 py-0.5 border-l border-border transition-colors ${groupAKind === "basket" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent"}`}>Basket</button>
                  </div>
                </div>
                {groupAKind === "classification" ? (
                  <div className="flex gap-1">
                    <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[110px]" value={groupADim} onChange={(e) => { setGroupADim(e.target.value); setGroupAValue(""); }} data-testid="select-group-a-dim">
                      {CLASSIFICATION_DIMENSIONS.map((d: string) => <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>)}
                    </select>
                    <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[170px]" value={groupAValue} onChange={(e) => setGroupAValue(e.target.value)} data-testid="select-group-a-value">
                      {groupAValue === "" && <option value="">— select —</option>}
                      <option value={ALL_REITS_KEY}>All REITs</option>
                      {(dimensionValues[groupADim] || []).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-1 items-center">
                    {baskets.length === 0 ? (
                      <span className="text-[10px] font-mono text-muted-foreground italic">No baskets</span>
                    ) : (
                      <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[180px]" value={groupABasketId} onChange={(e) => setGroupABasketId(e.target.value)} data-testid="select-group-a-basket">
                        {!groupABasketId && <option value="">— select basket —</option>}
                        {baskets.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.tickers.length})</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => setBasketEditorOpen(true)} className="p-1 border border-dashed border-border rounded text-muted-foreground hover:text-amber-400 hover:border-amber-500/40 transition-colors" title="Manage baskets">
                      <Settings2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              {/* Group B */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Group B</label>
                  <div className="flex border border-border rounded overflow-hidden text-[9px] font-mono">
                    <button type="button" onClick={() => setGroupBKind("classification")} className={`px-1.5 py-0.5 transition-colors ${groupBKind === "classification" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent"}`}>Class</button>
                    <button type="button" onClick={() => setGroupBKind("basket")} className={`px-1.5 py-0.5 border-l border-border transition-colors ${groupBKind === "basket" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent"}`}>Basket</button>
                  </div>
                </div>
                {groupBKind === "classification" ? (
                  <div className="flex gap-1">
                    <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[110px]" value={groupBDim} onChange={(e) => { setGroupBDim(e.target.value); setGroupBValue(ALL_REITS_KEY); }} data-testid="select-group-b-dim">
                      {CLASSIFICATION_DIMENSIONS.map((d: string) => <option key={d} value={d}>{DIMENSION_LABELS[d]}</option>)}
                    </select>
                    <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[170px]" value={groupBValue} onChange={(e) => setGroupBValue(e.target.value)} data-testid="select-group-b-value" title="Classification value for Group B (or All REITs for entire universe)">
                      <option value={ALL_REITS_KEY}>All REITs</option>
                      {(dimensionValues[groupBDim] || []).map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="flex gap-1 items-center">
                    {baskets.length === 0 ? (
                      <span className="text-[10px] font-mono text-muted-foreground italic">No baskets</span>
                    ) : (
                      <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[180px]" value={groupBBasketId} onChange={(e) => setGroupBBasketId(e.target.value)} data-testid="select-group-b-basket">
                        {!groupBBasketId && <option value="">— select basket —</option>}
                        {baskets.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.tickers.length})</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => setBasketEditorOpen(true)} className="p-1 border border-dashed border-border rounded text-muted-foreground hover:text-amber-400 hover:border-amber-500/40 transition-colors" title="Manage baskets">
                      <Settings2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}

          {/* Valuation metric */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Valuation</label>
            <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[170px]" value={valMetric} onChange={(e) => { valMetricOverrideRef.current = true; setValMetric(e.target.value); }} data-testid="select-val-metric">
              {VALUATION_METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          {/* Growth metric */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Growth</label>
            <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[230px]" value={growthMetric} onChange={(e) => { growthMetricOverrideRef.current = true; setGrowthMetric(e.target.value); }} data-testid="select-growth-metric">
              {GROWTH_METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          <div className="flex-1" />

          {/* Chart toggles */}
          <div className="flex items-center gap-1.5" data-testid="chart-toggles">
            <span className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1">
              <LayoutIcon className="w-3 h-3" /> Charts
            </span>
            {CHART_IDS.map((id) => {
              const active = visibleCharts.has(id);
              return (
                <button
                  key={id}
                  onClick={() => setVisibleCharts((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
                  className={`text-[10px] font-mono px-2 py-1 border rounded transition-colors ${active ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-border hover:bg-accent text-muted-foreground hover:text-foreground"}`}
                  data-testid={`toggle-chart-${id}`}
                  title={`Show/hide ${CHART_LABELS[id]} chart`}
                >
                  {CHART_LABELS[id]}
                </button>
              );
            })}
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowEarnings(!showEarnings)} className={`flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 border rounded ${showEarnings ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-border hover:bg-accent text-muted-foreground hover:text-foreground"}`} data-testid="toggle-earnings" title="Toggle earnings date markers">
              {/* Calendar icon placeholder */}
              <span className="w-3.5 h-3.5 inline-block" /> Earnings
            </button>
            <button onClick={handleExportCSV} className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 border border-border rounded hover:bg-accent text-muted-foreground hover:text-foreground" data-testid="btn-csv" disabled={premiumSeries.length === 0}>
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            {loadingCloses && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400">
                <Loader2 className="w-3 h-3 animate-spin" /> computing
              </span>
            )}
          </div>
        </div>

        {/* Status line */}
        <div className="mt-2 text-[10px] font-mono text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          {compareMode === "peer" ? (
            <>
              <span><span className="text-muted-foreground/60">PEER GROUP:</span> <span className="text-foreground">{peerLabel || "—"}</span> <span className="text-muted-foreground/60">({DIMENSION_LABELS[dimension]})</span></span>
              <span><span className="text-muted-foreground/60">PEERS:</span> <span className="text-foreground">{peerTickers.length}</span>{peerCount > 0 && peerCount !== peerTickers.length && <span className="text-muted-foreground/60"> · {peerCount} with data</span>}</span>
              <span><span className="text-muted-foreground/60">METHOD:</span> <span className="text-foreground">median, % diff vs peer</span></span>
            </>
          ) : compareMode === "ticker" ? (
            <>
              <span><span className="text-muted-foreground/60">PAIR:</span> <span className="text-foreground">{target || "—"}</span> <span className="text-muted-foreground/60">vs</span> <span className="text-foreground">{peerTicker || "—"}</span>{peerTickerName && peerTickerName !== peerTicker && <span className="text-muted-foreground/60"> · {peerTickerName}</span>}</span>
              <span><span className="text-muted-foreground/60">METHOD:</span> <span className="text-foreground">% diff vs ticker</span></span>
            </>
          ) : compareMode === "basket" ? (
            <>
              <span><span className="text-muted-foreground/60">BASKET:</span> <span className="text-foreground">{basketLabel}</span> {basketSelected && <span className="text-muted-foreground/60">({basketSelected.tickers.length} tickers)</span>}</span>
              <span><span className="text-muted-foreground/60">TARGET:</span> <span className="text-foreground">{target || "—"}</span></span>
              <span><span className="text-muted-foreground/60">METHOD:</span> <span className="text-foreground">basket median, % diff</span></span>
            </>
          ) : (
            <>
              <span><span className="text-muted-foreground/60">GROUP A:</span> <span className="text-foreground">{groupALabel}</span> <span className="text-muted-foreground/60">({groupAKind === "basket" ? `basket · ${peerCountA}` : `${DIMENSION_LABELS[groupADim]} · ${peerCountA}`})</span></span>
              <span><span className="text-muted-foreground/60">GROUP B:</span> <span className="text-foreground">{groupBLabel}</span> <span className="text-muted-foreground/60">({groupBKind === "basket" ? `basket · ${peerCountB}` : `${DIMENSION_LABELS[groupBDim]} · ${peerCountB}`})</span></span>
              <span><span className="text-muted-foreground/60">METHOD:</span> <span className="text-foreground">median × median, % diff A vs B</span></span>
            </>
          )}
          {error && <span className="text-red-400">{error}</span>}
        </div>
      </div>

      {/* ── Summary stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-px bg-border border-b border-border flex-shrink-0">
        <StatCard
          label="Premium / Discount"
          value={formatPercent(summaryStats.lastP)}
          sub={compareMode === "peer" ? `vs ${valMetric}` : compareMode === "ticker" ? `vs ${peerTicker || "—"} · ${valMetric}` : compareMode === "basket" ? `vs basket ${basketLabel} · ${valMetric}` : `${groupALabel} vs ${groupBLabel} · ${valMetric}`}
          tone={summaryStats.lastP > 0 ? "rich" : summaryStats.lastP < 0 ? "cheap" : "neutral"}
        />
        <StatCard
          label="History percentile"
          value={Number.isFinite(summaryStats.pctile) ? `${summaryStats.pctile.toFixed(0)}%` : "—"}
          sub={summaryStats.pctile > 80 ? "richest 20%" : summaryStats.pctile < 20 ? "cheapest 20%" : "mid-range"}
          tone={summaryStats.pctile > 80 ? "rich" : summaryStats.pctile < 20 ? "cheap" : "neutral"}
        />
        <StatCard label="Z-score" value={formatFixed(summaryStats.z)} sub="vs own history" tone={summaryStats.z > 1.5 ? "rich" : summaryStats.z < -1.5 ? "cheap" : "neutral"} />
        <StatCard
          label="Growth differential"
          value={formatPercent(summaryStats.lastG)}
          sub={compareMode === "peer" ? "pp vs peer median" : compareMode === "ticker" ? `pp vs ${peerTicker || "—"}` : compareMode === "basket" ? `pp vs basket ${basketLabel}` : `pp · ${groupALabel} vs ${groupBLabel}`}
          tone={summaryStats.lastG > 0 ? "cheap" : summaryStats.lastG < 0 ? "rich" : "neutral"}
        />
        <StatCard label="Premium ↔ Growth corr" value={formatFixed(summaryStats.corr)} sub={summaryStats.corr > 0.4 ? "premium tracks growth" : summaryStats.corr < -0.4 ? "premium fights growth" : "weak relationship"} tone="neutral" />
        <StatCard label="Prem÷Δg ↔ A/B corr" value={formatFixed(summaryStats.corrRatioVsAB)} sub={summaryStats.corrRatioVsAB > 0.4 ? "ratio tracks price spread" : summaryStats.corrRatioVsAB < -0.4 ? "ratio fights price spread" : "weak relationship"} tone="neutral" />
        <StatCard
          label="Rel return since anchor"
          value={Number.isFinite(summaryStats.relReturnSinceAnchor) ? `${summaryStats.relReturnSinceAnchor >= 0 ? "+" : ""}${summaryStats.relReturnSinceAnchor.toFixed(1)}pp` : "—"}
          sub={anchorDate ? `since ${anchorDate}${pinDate ? " (pin)" : ""}` : compareMode === "peer" ? "vs peer median" : compareMode === "ticker" ? `vs ${peerTicker || "—"}` : compareMode === "basket" ? `vs basket ${basketLabel}` : `${groupALabel} vs ${groupBLabel}`}
          tone={summaryStats.relReturnSinceAnchor > 0 ? "cheap" : summaryStats.relReturnSinceAnchor < 0 ? "rich" : "neutral"}
        />
        <StatCard
          label="Forward 1Y rel return"
          value={Number.isFinite(summaryStats.forwardRelReturn252) ? `${summaryStats.forwardRelReturn252 >= 0 ? "+" : ""}${summaryStats.forwardRelReturn252.toFixed(1)}pp` : "—"}
          sub="252d after anchor"
          tone={summaryStats.forwardRelReturn252 > 0 ? "cheap" : summaryStats.forwardRelReturn252 < 0 ? "rich" : "neutral"}
        />
      </div>

      {/* ── RV Verdict panel ── */}
      {(() => {
        const rv = rvVerdictAnalysis;
        return (
          <div className="border-b border-border bg-card/60 flex-shrink-0" data-testid="rv-verdict-panel">
            <div className="px-3 py-2 flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-mono text-amber-300 uppercase tracking-wider">RV Verdict</span>
              <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${rvVerdictLabelClass}`} data-testid="rv-verdict-label">{rv.label}</span>
              <span className="text-[10px] font-mono text-muted-foreground" data-testid="rv-verdict-rationale">{rv.rationale}</span>
              <div className="ml-auto flex items-center gap-2">
                <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Band</label>
                <select data-testid="rv-band-select" value={String(rvBand)} onChange={(e) => setRvBand(parseFloat(e.target.value))} className="h-6 text-[11px] font-mono bg-background border border-border rounded px-1.5">
                  <option value="0.05">Ultra Tight (0.05σ)</option>
                  <option value="0.10">Very Tight (0.10σ)</option>
                  <option value="0.20">Tight (0.20σ)</option>
                  <option value="0.35">Default (0.35σ)</option>
                  <option value="0.50">Loose (0.50σ)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border-t border-border">
              {/* Premium given growth */}
              <div className="px-3 py-2 bg-card/60" data-testid="rv-prem-given-growth">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Premium given growth</span>
                  <span className="text-[10px] font-mono text-muted-foreground/70">
                    when Δg ∈ [{fmtPct2(rv.premGivenGrowth?.bandLo ?? NaN)}, {fmtPct2(rv.premGivenGrowth?.bandHi ?? NaN)}]{rv.premGivenGrowth ? ` · n=${rv.premGivenGrowth.n}` : ""}
                  </span>
                </div>
                {rv.premGivenGrowth ? (
                  <>
                    <div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
                      <span className="text-[11px] font-mono"><span className="text-muted-foreground">today </span><span className="text-amber-300">{fmtPct2(summaryStats.lastP)}</span></span>
                      <span className="text-[11px] font-mono"><span className="text-muted-foreground">implied </span><span className="text-cyan-300">{fmtPct2(rv.impliedPrem)}</span></span>
                      <span className={`text-[11px] font-mono ${rv.premGap < 0 ? "text-emerald-300" : rv.premGap > 0 ? "text-rose-300" : "text-muted-foreground"}`} data-testid="rv-prem-gap">
                        gap {fmtPP(rv.premGap)} {rv.premGap < 0 ? "→ cheap-for-growth" : rv.premGap > 0 ? "→ rich-for-growth" : ""}
                      </span>
                    </div>
                    <IQRBar p25={rv.premGivenGrowth.p25} p50={rv.premGivenGrowth.median} p75={rv.premGivenGrowth.p75} today={summaryStats.lastP} fmt={fmtPct2} />
                    <div className="flex justify-between text-[9px] font-mono text-muted-foreground/70 mt-1">
                      <span>p25 {fmtPct2(rv.premGivenGrowth.p25)}</span>
                      <span>median {fmtPct2(rv.premGivenGrowth.median)}</span>
                      <span>p75 {fmtPct2(rv.premGivenGrowth.p75)}</span>
                    </div>
                    <div className="text-[9px] font-mono text-muted-foreground/70 mt-0.5">
                      today is at <span className="text-amber-300">{rv.premGivenGrowth.todayPctile.toFixed(0)}th pctile</span> of conditional sample
                    </div>
                  </>
                ) : (
                  <span className="text-[11px] font-mono text-muted-foreground">insufficient sample</span>
                )}
              </div>
              {/* Growth given premium */}
              <div className="px-3 py-2 bg-card/60" data-testid="rv-growth-given-prem">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Growth given premium</span>
                  <span className="text-[10px] font-mono text-muted-foreground/70">
                    when premium ∈ [{fmtPct2(rv.growthGivenPrem?.bandLo ?? NaN)}, {fmtPct2(rv.growthGivenPrem?.bandHi ?? NaN)}]{rv.growthGivenPrem ? ` · n=${rv.growthGivenPrem.n}` : ""}
                  </span>
                </div>
                {rv.growthGivenPrem ? (
                  <>
                    <div className="flex items-baseline gap-3 mb-1.5 flex-wrap">
                      <span className="text-[11px] font-mono"><span className="text-muted-foreground">today </span><span className="text-amber-300">{fmtPct2(summaryStats.lastG)}</span></span>
                      <span className="text-[11px] font-mono"><span className="text-muted-foreground">implied </span><span className="text-cyan-300">{fmtPct2(rv.impliedGrowth)}</span></span>
                      <span className={`text-[11px] font-mono ${rv.growthGap > 0 ? "text-emerald-300" : rv.growthGap < 0 ? "text-rose-300" : "text-muted-foreground"}`} data-testid="rv-growth-gap">
                        gap {fmtPP(rv.growthGap)} {rv.growthGap > 0 ? "→ excess growth" : rv.growthGap < 0 ? "→ weak growth" : ""}
                      </span>
                    </div>
                    <IQRBar p25={rv.growthGivenPrem.p25} p50={rv.growthGivenPrem.median} p75={rv.growthGivenPrem.p75} today={summaryStats.lastG} fmt={fmtPct2} />
                    <div className="flex justify-between text-[9px] font-mono text-muted-foreground/70 mt-1">
                      <span>p25 {fmtPct2(rv.growthGivenPrem.p25)}</span>
                      <span>median {fmtPct2(rv.growthGivenPrem.median)}</span>
                      <span>p75 {fmtPct2(rv.growthGivenPrem.p75)}</span>
                    </div>
                    <div className="text-[9px] font-mono text-muted-foreground/70 mt-0.5">
                      today is at <span className="text-amber-300">{rv.growthGivenPrem.todayPctile.toFixed(0)}th pctile</span> of conditional sample
                    </div>
                  </>
                ) : (
                  <span className="text-[11px] font-mono text-muted-foreground">insufficient sample</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Similar Setups panel ── */}
      {visibleCharts.has("similar") && (
        <div className="border-b border-border bg-card/60 flex-shrink-0" data-testid="similar-setups-panel">
          <div className="px-3 py-2 border-b border-border flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-amber-300 uppercase tracking-wider">Similar Setups</span>
              {similarAnalysis && (
                <span className="text-[9px] font-mono text-muted-foreground">
                  today z=({similarAnalysis.todayZPrem.toFixed(2)}, {similarAnalysis.todayZGrowth.toFixed(2)}) · {similarAnalysis.matches.length}/{similarAnalysis.totalCandidates} bars matched
                  {similarAnalysis.droppedByGap > 0 && <span className="text-muted-foreground/70"> · {similarAnalysis.droppedByGap} dropped by gap</span>}
                </span>
              )}
            </div>
            {similarAnalysis && similarAnalysis.matches.length > 0 && similarAnalysis.yearMax >= similarAnalysis.yearMin && (
              <div className="flex items-end gap-px h-5" data-testid="similar-year-spark" title="Matches by calendar year">
                {(() => {
                  const bars: React.ReactNode[] = [];
                  let maxCount = 1;
                  for (const v of similarAnalysis.yearCounts.values()) if (v > maxCount) maxCount = v;
                  for (let yr = similarAnalysis.yearMin; yr <= similarAnalysis.yearMax; yr++) {
                    const cnt = similarAnalysis.yearCounts.get(yr) || 0;
                    const barH = cnt === 0 ? 2 : Math.max(3, Math.round(cnt / maxCount * 18));
                    bars.push(<div key={yr} className={cnt > 0 ? "bg-amber-400/80" : "bg-muted-foreground/20"} style={{ width: 4, height: `${barH}px` }} title={`${yr}: ${cnt}`} />);
                  }
                  return bars;
                })()}
                <span className="text-[8px] font-mono text-muted-foreground/70 ml-1 leading-none self-center">{similarAnalysis.yearMin}–{similarAnalysis.yearMax}</span>
              </div>
            )}
            {similarAnalysis?.cluster && (
              <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5" title="More than half of the matches fall in a single ~4-month window. Forward stats reflect that one regime, not a broad base rate." data-testid="similar-cluster-warning">
                ⚠ {Math.round(similarAnalysis.cluster.share * 100)}% in {similarAnalysis.cluster.dominantMonth}
              </span>
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">N</label>
              <select value={similarN} onChange={(e) => setSimilarN(Number(e.target.value))} className="text-[10px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground" data-testid="similar-n-select">
                {[10, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">exclude last</label>
              <select value={similarExclusion} onChange={(e) => setSimilarExclusion(Number(e.target.value))} className="text-[10px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground" data-testid="similar-exclude-select">
                {[{ v: 63, l: "3M" }, { v: 126, l: "6M" }, { v: 252, l: "1Y" }, { v: 504, l: "2Y" }].map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Minimum trading-day spacing between accepted matches — prevents N matches from collapsing into a single regime.">min gap</label>
              <select value={similarMinGap} onChange={(e) => setSimilarMinGap(Number(e.target.value))} className="text-[10px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground" data-testid="similar-mingap-select" title="Minimum trading-day spacing between accepted matches">
                {[{ v: 0, l: "none" }, { v: 5, l: "5d" }, { v: 21, l: "1M" }, { v: 30, l: "~6w" }, { v: 63, l: "3M" }, { v: 126, l: "6M" }, { v: 252, l: "1Y" }].map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>
          {similarAnalysis ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
              <SimilarStatsCard label="Forward 3M" stats={similarAnalysis.h3M} />
              <SimilarStatsCard label="Forward 6M" stats={similarAnalysis.h6M} />
              <SimilarStatsCard label="Forward 1Y" stats={similarAnalysis.h1Y} />
            </div>
          ) : (
            <div className="px-3 py-3 text-[10px] font-mono text-muted-foreground">
              Need at least 60 aligned bars and 252 paired closes — still loading or insufficient history.
            </div>
          )}
          {similarAnalysis && similarAnalysis.matches.length > 0 && (
            <details className="border-t border-border">
              <summary className="px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer select-none">
                Show top-{similarAnalysis.matches.length} matched dates
              </summary>
              <div className="px-3 pb-2 overflow-x-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr className="text-muted-foreground/70 uppercase tracking-wider">
                      <th className="text-left font-normal pr-3 py-1">Date</th>
                      <th className="text-right font-normal pr-3 py-1">z‑prem</th>
                      <th className="text-right font-normal pr-3 py-1">z‑growth</th>
                      <th className="text-right font-normal pr-3 py-1">dist</th>
                      <th className="text-right font-normal pr-3 py-1">fwd 3M</th>
                      <th className="text-right font-normal pr-3 py-1">fwd 6M</th>
                      <th className="text-right font-normal py-1">fwd 1Y</th>
                    </tr>
                  </thead>
                  <tbody>
                    {similarAnalysis.matches.map((m: any) => (
                      <tr key={m.date} className="border-t border-border/40" data-testid={`similar-row-${m.date}`}>
                        <td className="text-foreground pr-3 py-0.5">{m.date}</td>
                        <td className="text-right text-muted-foreground pr-3 py-0.5">{m.zPrem.toFixed(2)}</td>
                        <td className="text-right text-muted-foreground pr-3 py-0.5">{m.zGrowth.toFixed(2)}</td>
                        <td className="text-right text-muted-foreground pr-3 py-0.5">{m.distance.toFixed(2)}</td>
                        <td className={`text-right pr-3 py-0.5 ${Number.isFinite(m.fwd3M) ? m.fwd3M >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/50"}`}>{Number.isFinite(m.fwd3M) ? `${m.fwd3M >= 0 ? "+" : ""}${m.fwd3M.toFixed(1)}` : "—"}</td>
                        <td className={`text-right pr-3 py-0.5 ${Number.isFinite(m.fwd6M) ? m.fwd6M >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/50"}`}>{Number.isFinite(m.fwd6M) ? `${m.fwd6M >= 0 ? "+" : ""}${m.fwd6M.toFixed(1)}` : "—"}</td>
                        <td className={`text-right py-0.5 ${Number.isFinite(m.fwd1Y) ? m.fwd1Y >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/50"}`}>{Number.isFinite(m.fwd1Y) ? `${m.fwd1Y >= 0 ? "+" : ""}${m.fwd1Y.toFixed(1)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Main chart area ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-px bg-border min-h-0 overflow-hidden">
        {/* Left column: time-series charts */}
        <div className="lg:col-span-3 flex flex-col gap-px bg-border min-h-0">
          {/* Premium chart */}
          <div className="flex flex-col bg-card flex-1 min-h-0" style={{ display: visibleCharts.has("premium") ? undefined : "none" }}>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">Premium / Discount (%)</span>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <HoverValue hoverTime={crosshairTime} value={crosshairTime != null ? premiumMap.get(crosshairTime) : undefined} format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`} color="text-amber-300" testId="hover-premium" />
                <span className="text-foreground">{valMetric}</span>
              </div>
            </div>
            <div ref={premiumContainerRef} className="flex-1 min-h-0" data-testid="chart-premium" />
          </div>

          {/* Growth chart */}
          <div className="flex flex-col bg-card flex-1 min-h-0" style={{ display: visibleCharts.has("growth") ? undefined : "none" }}>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">Growth Differential (pp)</span>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <HoverValue hoverTime={crosshairTime} value={crosshairTime != null ? growthMap2.get(crosshairTime) : undefined} format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}pp`} color="text-sky-300" testId="hover-growth" />
                <span className="text-foreground">{growthMetric}</span>
              </div>
            </div>
            <div ref={growthContainerRef} className="flex-1 min-h-0" data-testid="chart-growth" />
          </div>

          {/* Ratio chart */}
          <div className="flex flex-col bg-card flex-1 min-h-0" style={{ display: visibleCharts.has("ratio") ? undefined : "none" }}>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">Premium ÷ Growth Diff (ratio)</span>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <HoverValue hoverTime={crosshairTime} value={crosshairTime != null ? ratioMap.get(crosshairTime) : undefined} format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}×`} color="text-violet-300" testId="hover-ratio" />
                <span className="text-purple-300" title="Dropped when |Δg| < 0.5pp or |ratio| > 50">{ratioSeries.length} pts</span>
              </div>
            </div>
            <div ref={ratioContainerRef} className="flex-1 min-h-0" data-testid="chart-ratio" />
          </div>

          {/* Rolling Corr chart */}
          <div className="flex flex-col bg-card flex-1 min-h-0" style={{ display: visibleCharts.has("rollCorr") ? undefined : "none" }}>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap flex items-center gap-2">
                <span>Rolling Corr</span>
                <span className="flex items-center gap-1 normal-case tracking-normal">
                  <span className="inline-block w-2 h-0.5 bg-teal-400" />
                  <span className="text-teal-300">Prem↔Δg</span>
                </span>
                <span className="flex items-center gap-1 normal-case tracking-normal">
                  <span className="inline-block w-2 h-0.5 bg-fuchsia-500" />
                  <span className="text-fuchsia-400">Prem÷Δg↔A/B</span>
                </span>
              </span>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                <label className="flex items-center gap-1 text-muted-foreground">
                  <span className="uppercase tracking-wider">Win</span>
                  <select value={rollWindow} onChange={(e) => setRollWindow(Number(e.target.value))} className="bg-background border border-border rounded px-1.5 py-0.5 text-[10px] font-mono text-foreground" data-testid="select-roll-window">
                    <option value={30}>30 (1M)</option>
                    <option value={60}>60 (3M)</option>
                    <option value={120}>120 (6M)</option>
                    <option value={252}>252 (1Y)</option>
                  </select>
                </label>
                <label className="flex items-center gap-1 text-muted-foreground">
                  <span className="uppercase tracking-wider" title="lag>0: growth leads premium · lag<0: premium leads growth">Lag</span>
                  <input
                    type="number" min={-60} max={60} step={1} value={rollLag}
                    onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setRollLag(Math.max(-60, Math.min(60, Math.round(v)))); }}
                    className="bg-background border border-border rounded px-1.5 py-0.5 w-[52px] text-[10px] font-mono text-foreground"
                    data-testid="input-roll-lag"
                  />
                  <span className="text-foreground">d</span>
                </label>
                {bestLag ? (
                  <span className="text-teal-300" title="Best lag from full-sample cross-correlation (±60d)">Peak: {bestLag.lag >= 0 ? "+" : ""}{bestLag.lag}d · ρ={bestLag.rho.toFixed(2)}</span>
                ) : (
                  <span className="text-muted-foreground">Peak: —</span>
                )}
                <HoverValue hoverTime={crosshairTime} value={crosshairTime != null ? rollCorrMap.get(crosshairTime) : undefined} format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`} color="text-teal-300" testId="hover-rollcorr" />
              </div>
            </div>
            <div ref={rollCorrContainerRef} className="flex-1 min-h-0" data-testid="chart-roll-corr" />
          </div>

          {/* Rel Return chart */}
          <div className="flex flex-col bg-card flex-1 min-h-0" style={{ display: visibleCharts.has("relReturn") ? undefined : "none" }}>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Rel Return (pp) <span className="text-muted-foreground/60 normal-case tracking-normal">vs anchor: {anchorDate || "—"}</span>
              </span>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <HoverValue hoverTime={crosshairTime} value={crosshairTime != null ? relReturnMap.get(crosshairTime) : undefined} format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}pp`} color="text-emerald-300" testId="hover-relreturn" />
                {loadingCloses ? (
                  <span className="text-muted-foreground/60">loading…</span>
                ) : (
                  <span className="text-emerald-300">
                    {compareMode === "peer" ? "A vs peer median" : compareMode === "ticker" ? `A vs ${peerTicker || "—"}` : `${groupALabel} vs ${groupBLabel}`}
                  </span>
                )}
              </div>
            </div>
            <div ref={relReturnContainerRef} className="flex-1 min-h-0" data-testid="chart-rel-return" />
          </div>

          {/* Rel Ratio chart */}
          <div className="flex flex-col bg-card flex-1 min-h-0" style={{ display: visibleCharts.has("relRatio") ? undefined : "none" }}>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Rel Strength (×, log) <span className="text-muted-foreground/60 normal-case tracking-normal">vs anchor: {anchorDate || "—"}</span>
              </span>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <HoverValue hoverTime={crosshairTime} value={crosshairTime != null ? relRatioMap.get(crosshairTime) : undefined} format={(v) => `${v.toFixed(3)}×`} color="text-rose-300" testId="hover-relratio" />
                {loadingCloses ? (
                  <span className="text-muted-foreground/60">loading…</span>
                ) : (
                  <span className="text-rose-300">
                    {compareMode === "peer" ? "A / peer median" : compareMode === "ticker" ? `A / ${peerTicker || "—"}` : `${groupALabel} / ${groupBLabel}`}
                  </span>
                )}
              </div>
            </div>
            <div ref={relRatioContainerRef} className="flex-1 min-h-0" data-testid="chart-rel-ratio" />
          </div>

          {/* Raw Ratio chart */}
          <div className="flex flex-col bg-card flex-1 min-h-0" style={{ display: visibleCharts.has("rawRatio") ? undefined : "none" }}>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                A / B Ratio (×, log) <span className="text-muted-foreground/60 normal-case tracking-normal">raw price ratio — no anchor</span>
              </span>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <HoverValue hoverTime={crosshairTime} value={crosshairTime != null ? rawRatioMap.get(crosshairTime) : undefined} format={(v) => `${v.toFixed(3)}×`} color="text-sky-300" testId="hover-rawratio" />
                {loadingCloses ? (
                  <span className="text-muted-foreground/60">loading…</span>
                ) : (
                  <span className="text-sky-300">
                    {compareMode === "peer" ? "A / peer median" : compareMode === "ticker" ? `A / ${peerTicker || "—"}` : `${groupALabel} / ${groupBLabel}`}
                  </span>
                )}
              </div>
            </div>
            <div ref={rawRatioContainerRef} className="flex-1 min-h-0" data-testid="chart-raw-ratio" />
          </div>

          {/* RV Verdict history chart */}
          <div className="flex flex-col bg-card flex-1 min-h-0" style={{ display: visibleCharts.has("rvVerdictTs") ? undefined : "none" }}>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                RV Verdict (history){" "}
                <span className="text-muted-foreground/60 normal-case tracking-normal">
                  green = attractive · red = expensive · gray = neutral
                </span>
              </span>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                {(() => {
                  const lastEntry = rvVerdictData.length ? rvVerdictData[rvVerdictData.length - 1] : null;
                  if (!lastEntry) return <span className="text-muted-foreground/60">—</span>;
                  const labelClass =
                    lastEntry.label === "Attractive" ? "text-emerald-400" :
                    lastEntry.label === "Expensive" ? "text-rose-400" :
                    "text-muted-foreground";
                  return (
                    <span className={labelClass} data-testid="hover-rvverdict">
                      {lastEntry.label} ({lastEntry.score >= 0 ? "+" : ""}{lastEntry.score})
                    </span>
                  );
                })()}
              </div>
            </div>
            <div ref={rvVerdictContainerRef} className="flex-1 min-h-0" data-testid="chart-rv-verdict" />
          </div>
        </div>

        {/* Right col: scatter plot */}
        <div className="flex flex-col bg-card min-h-0 lg:col-span-2">
          <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Growth × Premium (history)
            </span>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <div className="flex border border-border rounded overflow-hidden">
                <button
                  onClick={() => setScatterView("heatmap")}
                  className={`px-2 py-0.5 transition-colors ${scatterView === "heatmap" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  data-testid="btn-scatter-heatmap"
                  title="Density heatmap — best for dense, multi-year history"
                >
                  Heatmap
                </button>
                <button
                  onClick={() => setScatterView("points")}
                  className={`px-2 py-0.5 transition-colors border-l border-border ${scatterView === "points" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  data-testid="btn-scatter-points"
                  title="Point cloud — each dot is one trading day, with age fade"
                >
                  Points
                </button>
              </div>
              {pinDate && <span className="text-green-400">pin</span>}
              {periodFilter && <span className="text-sky-400">filter</span>}
              <span className="text-amber-400">today</span>
            </div>
          </div>

          {/* Scatter controls: pin date + highlight range */}
          <div className="px-3 py-2 border-b border-border flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5" /> Pin date
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={pinDate}
                  onChange={(e) => setPinDate(e.target.value)}
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[150px] text-foreground"
                  data-testid="input-pin-date"
                />
                {pinDate && (
                  <button
                    onClick={() => setPinDate("")}
                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"
                    title="Clear pin"
                    data-testid="btn-clear-pin"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" /> Highlight range
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={(() => {
                    const m = periodFilter.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
                    return m ? m[1] : "";
                  })()}
                  onChange={(e) => {
                    const start = e.target.value;
                    const m = periodFilter.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
                    const end = m ? m[2] : "";
                    setPeriodFilter(start && end ? `${start}..${end}` : start ? `${start}..${start}` : "");
                  }}
                  title="Start date"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[140px] text-foreground placeholder:text-muted-foreground/50 [color-scheme:dark]"
                  data-testid="input-period-start"
                />
                <span className="text-[10px] font-mono text-muted-foreground">to</span>
                <input
                  type="date"
                  value={(() => {
                    const m = periodFilter.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
                    return m ? m[2] : "";
                  })()}
                  onChange={(e) => {
                    const end = e.target.value;
                    const m = periodFilter.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
                    const start = m ? m[1] : "";
                    setPeriodFilter(start && end ? `${start}..${end}` : end ? `${end}..${end}` : "");
                  }}
                  title="End date"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[140px] text-foreground placeholder:text-muted-foreground/50 [color-scheme:dark]"
                  data-testid="input-period-end"
                />
                {periodFilter && (
                  <button
                    onClick={() => setPeriodFilter("")}
                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"
                    title="Clear filter"
                    data-testid="btn-clear-period"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            {periodFilter && (
              <span className="text-[10px] font-mono text-sky-400 ml-auto">
                {(() => {
                  const filterFn = parsePeriodFilter(periodFilter);
                  if (!filterFn) return "invalid format";
                  const growthMap = new Map<string, number>();
                  for (const pt of growthSeries ?? []) growthMap.set(pt.time as string, pt.value);
                  let count = 0;
                  for (const pt of premiumSeries ?? []) {
                    if (growthMap.has(pt.time as string) && filterFn(pt.time as string)) count++;
                  }
                  return `${count} dots highlighted`;
                })()}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 relative">
            <canvas ref={scatterCanvasRef} className="w-full h-full block" data-testid="canvas-scatter" />
          </div>

          <div className="px-3 py-1.5 border-t border-border text-[9px] font-mono text-muted-foreground/70 leading-snug">
            {scatterView === "heatmap" ? (
              <>
                Each cell shows how many trading days landed in that (Δgrowth, premium) bucket — brighter = more frequent. Top-right = expensive AND faster-growing than{" "}
                {compareMode === "peer" ? "peers" : compareMode === "ticker" ? peerTicker || "comparison" : compareMode === "basket" ? basketLabel : groupBLabel}
                ; bottom-left = cheap AND slower-growing. Switch to Points to see individual days.
              </>
            ) : (
              <>
                Each dot is one trading day. Older points fade purple→amber. Top-right = expensive AND faster-growing than{" "}
                {compareMode === "peer" ? "peers" : compareMode === "ticker" ? peerTicker || "comparison" : compareMode === "basket" ? basketLabel : groupBLabel}
                ; bottom-left = cheap AND slower-growing. Pin a date or pick a start/end date range to inspect specific windows.
              </>
            )}
          </div>
        </div>
      </div>

      {/* Basket editor modal */}
      {showBasketEditor && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24"
          onClick={(e) => { if (e.target === e.currentTarget) setShowBasketEditor(false); }}
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          <BasketEditorPanel
            tickers={tickers}
            onClose={() => setShowBasketEditor(false)}
            initialBasketId={basketId || undefined}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface HoverValueProps {
  hoverTime: string | null;
  value: number | undefined;
  format: (v: number) => string;
  color: string;
  testId: string;
}

function HoverValue({ hoverTime, value, format, color, testId }: HoverValueProps) {
  if (!hoverTime) return null;
  const display = value != null && Number.isFinite(value) ? format(value) : "—";
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-mono" data-testid={testId}>
      <span className="text-muted-foreground">{hoverTime}</span>
      <span className={`${color} tabular-nums font-semibold`}>{display}</span>
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "rich" | "cheap" | "neutral";
}

function StatCard({ label, value, sub, tone }: StatCardProps) {
  const valueClass = tone === "rich" ? "text-red-400" : tone === "cheap" ? "text-green-400" : "text-foreground";
  const ToneIcon = tone === "rich" ? TrendingUp : tone === "cheap" ? TrendingDown : null;
  return (
    <div className="bg-card px-3 py-2 flex flex-col gap-0.5">
      <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-base font-mono font-semibold flex items-center gap-1 ${valueClass}`}>
        {ToneIcon && <ToneIcon className="w-3.5 h-3.5" />}
        {value}
      </span>
      <span className="text-[9px] font-mono text-muted-foreground/70 truncate">{sub}</span>
    </div>
  );
}

interface SimilarStats {
  n: number;
  median: number;
  mean: number;
  hitRate: number;
  p25: number;
  p75: number;
}

interface SimilarStatsCardProps {
  label: string;
  stats: SimilarStats | null | undefined;
}

function SimilarStatsCard({ label, stats }: SimilarStatsCardProps) {
  if (!stats) {
    return (
      <div className="bg-card px-3 py-2.5 flex flex-col gap-1">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-base font-mono text-muted-foreground/50">—</span>
        <span className="text-[9px] font-mono text-muted-foreground/60">no data</span>
      </div>
    );
  }
  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;
  const valueClass = stats.median > 0 ? "text-green-400" : stats.median < 0 ? "text-red-400" : "text-foreground";
  return (
    <div className="bg-card px-3 py-2.5 flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-[9px] font-mono text-muted-foreground/70">n={stats.n}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-base font-mono font-semibold ${valueClass}`}>{fmt(stats.median)}</span>
        <span className="text-[10px] font-mono text-muted-foreground">median</span>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/80 flex flex-wrap gap-x-3">
        <span>mean {fmt(stats.mean)}</span>
        <span>hit {stats.hitRate.toFixed(0)}%</span>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/60 flex flex-wrap gap-x-3">
        <span>p25 {fmt(stats.p25)}</span>
        <span>p75 {fmt(stats.p75)}</span>
      </div>
    </div>
  );
}
