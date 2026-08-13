import { useState, useEffect, useRef, useMemo, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import {
  useRouterState,
  PAIRS_HANDOFF_EVENT,
  pairsHandoffPending,
  takePairsHandoff,
  type PairsHandoff,
} from "@/lib/navigateToPairs";
import { useQuery } from "@tanstack/react-query";
import { getTickers, getPairsData, getCustomFundamentalMetrics, getTickersCacheSync } from "@/lib/dataService";
import { groupMetricsByCategory, DERIVED_METRICS } from "@/lib/metricCategories";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  PriceScaleMode,
  createSeriesMarkers,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time, LineWidth } from "lightweight-charts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, ArrowRightLeft, Maximize2, Minimize2, TrendingUp, X, Layers, ChevronsUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, LayoutGrid, Eye, EyeOff, ChevronsDownUp, ListFilter, Filter, AlertTriangle, Info, Star, Plus } from "lucide-react";
import { analyzePairSignals, signalLabel, signalValueFormat, reversionDir } from "@/lib/pairSignalAnalyzer";
import GridLayoutPicker, { gridContainerStyle, gridSlots, parseGrid } from "@/components/GridLayoutPicker";
import type { GridLayout } from "@/components/GridLayoutPicker";
import GridProminenceToggle from "@/components/GridProminenceToggle";
import { useGridColor } from "@/lib/gridPref";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { TickerMeta } from "@shared/schema";
import {
  computeSMA,
  computeEMA,
  computeHMA,
  computeRSI,
  computeMACD,
  computeMeanAndStdBands,
  computeRollingMeanBands,
  computeBollingerBands,
  computeATR,
  computeVWAP,
  computeROC,
  computeStochastic,
  computeOBV,
  computeHeikinAshi,
  computeHASignals,
  rollingAutocorrOfSeries,
} from "@/lib/indicators";
import { computeMaByType, type MaType } from "@/lib/maEngine";
import type { HASmoothType, HASmoothConfig, OhlcBar } from "@/lib/indicators";
import { INDICATOR_COLORS } from "@/lib/chartColors";
import { useIndicatorColors } from "@/lib/indicatorColorsContext";
import type { ActiveIndicators, MaLine, MaKey } from "@/components/ChartPane";
import { IndicatorColorEditor, RegistryIndicatorControls, IndicatorSetsSection, IndicatorOverlays, SectionHeader, MaRow, BuiltinInstanceSection } from "@/components/IndicatorsPanel";
import {
  getInstances,
  setInstances,
  paneGroups,
  subChartKeyFor,
  parseSubChartKey,
  effGroup,
  instanceLabel,
  effectiveFreq,
  freqSuffix,
  makeFreqSourceCache,
  type IndicatorInstance,
  type FreqSourceCache,
} from "@/lib/indicatorInstances";
import { computeFractalTrendlines, resampleWeekly, resampleMonthly } from "@/lib/fractalTrendlines";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { downsampleSeries } from "@/lib/chartFrequency";
import { detectChartPatterns, rankRelevance } from "@/lib/detectChartPatterns";
import { getPatternSettings } from "@/lib/patternSettings";
import PatternsPanel from "@/components/PatternsPanel";
import DateInput from "@/components/DateInput";
import { ResizableSidebar } from "@/components/ResizableSidebar";
import { indicatorPeriods, getMaLines, setMaLines, setSeriesAxisLabels, PANE_OVERLAY_TYPES, subChartSourceLabel, overlayPaneLabel } from "@/components/ChartPane";
import type { IndicatorOverlay } from "@/components/ChartPane";
import { useChartChrome } from "@/lib/gridPref";
import { ALL_REGISTRY_INDICATORS, getIndicatorDef, resolveParams, resolveParamList, resampleIndicatorBars, type RegistryIndicatorState } from "@/lib/indicatorRegistry";
import ExportMenu from "@/components/ExportMenu";
import { useTickerClassFilter, ClassFilterRow } from "@/components/ClassificationFilters";
import { useBaskets } from "@/lib/useBaskets";
import type { Basket } from "@/lib/useBaskets";
import { isBasketTicker, extractBasketId, basketDisplayName } from "@/lib/basketUtils";
import { buildBasketOhlc, getBasketOhlc } from "@/lib/basketOhlc";

const LOOKBACK_OPTIONS = [
  { label: "20d", value: 20 },
  { label: "60d", value: 60 },
  { label: "120d", value: 120 },
  { label: "250d", value: 250 },
];

// Stable empty indicators object — avoids re-creating {} on every render
const EMPTY_INDICATORS: ActiveIndicators = {};

// ── Shared chart registry + logical-range/crosshair sync harness ──
// Used by this page's chart grid AND the Pair Ratios detail view (same
// MiniChart register/unregister contract). Logical-range (bar index) sync so
// charts with different data start points align; only real pointer moves
// (param.sourceEvent) propagate the crosshair — programmatic sets echo back
// asynchronously and would flicker the hovered chart's horizontal line.
export function usePairChartSync(refChartId = "prices", debugKey?: string) {
  const chartsMapRef = useRef(new Map<string, IChartApi>());
  const seriesMapRef = useRef(new Map<string, ISeriesApi<any>>());
  const syncingRef = useRef(false);
  const syncHandlersRef = useRef(new Map<string, { rangeHandler: (r: any) => void; crosshairHandler: (p: any) => void }>());

  const setupSync = useCallback((id: string, chart: IChartApi) => {
    // No edge clamping — the Charts tab (ChartArea pane sync) syncs the raw
    // range and lets you pan freely into whitespace; a clamp here fought the
    // drag and made the chart lock near the data edges.
    const rangeHandler = () => {
      if (syncingRef.current) return;
      const logicalRange = chart.timeScale().getVisibleLogicalRange();
      if (!logicalRange) return;
      syncingRef.current = true;
      chartsMapRef.current.forEach((other, otherId) => {
        if (otherId !== id) {
          try { other.timeScale().setVisibleLogicalRange(logicalRange); } catch {}
        }
      });
      // Clear synchronously: LWC fires range callbacks synchronously, so echo
      // events are gated above, and setting an identical range fires no event
      // (ping-pong converges). A rAF-delayed clear here swallowed the SECOND
      // range-set of a chart rebuild (setData default range, then savedRange
      // restore in the same tick) — siblings kept the junk default range until
      // the next manual pan.
      syncingRef.current = false;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);

    const crosshairHandler = (param: any) => {
      if (syncingRef.current) return;
      if (!param.sourceEvent) return;
      syncingRef.current = true;
      chartsMapRef.current.forEach((other, otherId) => {
        if (otherId !== id) {
          try {
            if (param.time) {
              const otherSeries = seriesMapRef.current.get(otherId);
              if (otherSeries) {
                other.setCrosshairPosition(NaN, param.time, otherSeries);
              }
            } else {
              other.clearCrosshairPosition();
            }
          } catch {}
        }
      });
      syncingRef.current = false;
    };
    chart.subscribeCrosshairMove(crosshairHandler);

    syncHandlersRef.current.set(id, { rangeHandler, crosshairHandler });
  }, []);

  const registerChart = useCallback((id: string, chart: IChartApi, _dataLength?: number) => {
    chartsMapRef.current.set(id, chart);
    if (debugKey) (window as any)[debugKey] = chartsMapRef.current; // debug hook (e2e range assertions)
    setupSync(id, chart);
    // After a short delay, sync this chart to the reference chart's time range
    // so charts with different data start points align on initial load.
    requestAnimationFrame(() => {
      const entries = Array.from(chartsMapRef.current.entries());
      if (entries.length < 2) return;
      const refEntry = entries.find(([eid]) => eid === refChartId) || entries[0];
      if (refEntry[0] === id) return; // Don't sync to self
      try {
        const refRange = refEntry[1].timeScale().getVisibleLogicalRange();
        if (refRange) chart.timeScale().setVisibleLogicalRange(refRange);
      } catch {}
    });
  }, [setupSync, refChartId, debugKey]);

  const unregisterChart = useCallback((id: string) => {
    const handlers = syncHandlersRef.current.get(id);
    const chart = chartsMapRef.current.get(id);
    if (handlers && chart) {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handlers.rangeHandler); } catch {}
      try { chart.unsubscribeCrosshairMove(handlers.crosshairHandler); } catch {}
    }
    syncHandlersRef.current.delete(id);
    chartsMapRef.current.delete(id);
    seriesMapRef.current.delete(id);
  }, []);

  const registerSeries = useCallback((id: string, series: ISeriesApi<any>) => {
    seriesMapRef.current.set(id, series);
  }, []);

  return { registerChart, unregisterChart, registerSeries };
}

// Expanding-window mean ± k·σ envelope (used for "expanding" bands on Z charts).
// Emits a point once at least `minPeriods` finite values have accumulated.
function expandingMeanStdBands(
  series: { time: string; value: number }[],
  k: number = 2,
  minPeriods: number = 20,
): { upper: { time: string; value: number }[]; lower: { time: string; value: number }[] } {
  const upper: { time: string; value: number }[] = [];
  const lower: { time: string; value: number }[] = [];
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < series.length; i++) {
    const v = series[i].value;
    if (Number.isFinite(v)) {
      count += 1;
      sum += v;
      sumSq += v * v;
    }
    if (count >= minPeriods) {
      const mean = sum / count;
      const variance = Math.max(0, sumSq / count - mean * mean);
      const sd = Math.sqrt(variance);
      upper.push({ time: series[i].time, value: mean + k * sd });
      lower.push({ time: series[i].time, value: mean - k * sd });
    }
  }
  return { upper, lower };
}

// Default visible chart IDs (core 6)
// Default to just the A/B ratio chart — the core pairs view. Everything else
// (prices, z-score, percentile, correlation, OLS scatter, residence, signal
// analyzer, …) stays available via the "Visible Charts" picker.
const DEFAULT_VISIBLE_CHARTS = new Set(["ratio"]);

// All chart definitions with labels for the picker
const CHART_DEFS: { id: string; label: string; group: string }[] = [
  { id: "prices", label: "Prices", group: "Core" },
  { id: "ratio", label: "Ratio", group: "Core" },
  { id: "logRatio", label: "Log Ratio", group: "Core" },
  { id: "zscore", label: "Raw Z-Score", group: "Z-Scores" },
  { id: "spreadZ", label: "Spread Z", group: "Z-Scores" },
  { id: "olsResidZ", label: "OLS Residual Z", group: "Z-Scores" },
  { id: "percentileRank", label: "Percentile Rank", group: "Z-Scores" },
  { id: "correlation", label: "Correlation", group: "Stats" },
  { id: "spread", label: "Spread", group: "Stats" },
  { id: "rollingBeta", label: "Rolling Beta", group: "Stats" },
  { id: "betaAdjSpread", label: "Beta-Adj Spread", group: "Stats" },
  { id: "rollingR2", label: "Rolling R²", group: "Stats" },
  { id: "olsScatter", label: "OLS Scatter", group: "Stats" },
  { id: "residence", label: "% Residence Days", group: "Stats" },
  { id: "signalAnalyzer", label: "Predictive Signals", group: "Stats" },
];

const METRIC_OPTIONS: Record<string, string[]> = {
  Price: ["close"],
  Volume: ["Volume"],
  Valuation: [
    "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2",
    "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2",
    "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate",
  ],
  "Company Defaults": ["EPS (Default)", "EPS FY1 (Default)", "EPS Growth (Default)", "EPS Growth FY1 (Default)"],
  Yields: [
    "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
    "Dividend Yield",
  ],
  Estimates: [
    "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2",
    "EPS FY1", "EPS FY2", "EBITDA FY1", "EBITDA FY2",
  ],
  Growth: [
    "FY1 FFO Growth", "FY2 FFO Growth",
    "FY1 AFFO Growth", "FY2 AFFO Growth",
    "FY1 EPS Growth", "FY2 EPS Growth",
  ],
};

const PAIRS_TEMPLATES: { label: string; metricA: string; metricB: string }[] = [
  { label: "Price / Price", metricA: "close", metricB: "close" },
  { label: "P/FFO FY2 / P/FFO FY2", metricA: "P/FFO FY2", metricB: "P/FFO FY2" },
  { label: "P/FFO LTM / P/FFO LTM", metricA: "P/FFO LTM", metricB: "P/FFO LTM" },
  { label: "P/AFFO FY2 / P/AFFO FY2", metricA: "P/AFFO FY2", metricB: "P/AFFO FY2" },
  { label: "P/AFFO LTM / P/AFFO LTM", metricA: "P/AFFO LTM", metricB: "P/AFFO LTM" },
  { label: "FFO Yield FY2 / FFO Yield FY2", metricA: "FFO Yield FY2", metricB: "FFO Yield FY2" },
  { label: "AFFO Yield FY2 / AFFO Yield FY2", metricA: "AFFO Yield FY2", metricB: "AFFO Yield FY2" },
  { label: "Div Yield / Div Yield", metricA: "Dividend Yield", metricB: "Dividend Yield" },
  { label: "EV/EBITDA FY2 / EV/EBITDA FY2", metricA: "EV/EBITDA FY2", metricB: "EV/EBITDA FY2" },
  { label: "P/E FY2 / P/E FY2", metricA: "P/E FY2", metricB: "P/E FY2" },
  { label: "Price / P/FFO FY2", metricA: "close", metricB: "P/FFO FY2" },
  { label: "FFO Yield FY2 / Div Yield", metricA: "FFO Yield FY2", metricB: "Dividend Yield" },
];

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
  rightPriceScale: { borderColor: "rgba(255,255,255,0.1)", minimumWidth: 80 },
  timeScale: {
    borderColor: "rgba(255,255,255,0.1)",
    timeVisible: false,
    // Match the Charts tab (ChartPane) so zoom/scroll feel identical: a little
    // right padding, a sane default bar spacing, and a min spacing that caps how
    // far a wheel-zoom can zoom in.
    rightOffset: 5,
    barSpacing: 3,
    minBarSpacing: 1,
  },
  // Same interaction model as the Charts tab (ChartPane): wheel zooms
  // (cursor-anchored) without scrolling sideways; pan via click-drag.
  handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  handleScale: { mouseWheel: true, pinch: true },
};

interface DataPoint {
  time: string;
  value: number;
}

// ── Predictive Signals (pair signal analyzer) ──
const SIGNAL_TYPES = ["raw_z", "ols_z", "spread_z", "pct"];
const SIGNAL_HORIZONS = [
  { key: "5d", label: "5d" },
  { key: "10d", label: "10d" },
  { key: "20d", label: "20d" },
  { key: "60d", label: "60d" },
];

function fmtSignalPct(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fmtSignalHit(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? "—" : `${v.toFixed(0)}%`;
}
function fmtRatioLevel(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? "—" : v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toFixed(5);
}
function avgColorClass(v: number | null | undefined): string {
  return v == null ? "text-muted-foreground" : v > 0.5 ? "text-emerald-400" : v < -0.5 ? "text-rose-400" : "text-muted-foreground";
}
function hitColorClass(v: number | null | undefined): string {
  return v == null
    ? "text-muted-foreground"
    : v >= 65
    ? "text-emerald-400 font-semibold"
    : v >= 55
    ? "text-emerald-400/70"
    : v <= 35
    ? "text-rose-400 font-semibold"
    : v <= 45
    ? "text-rose-400/70"
    : "text-muted-foreground";
}

function SignalAnalyzerHeader({
  tickerA,
  tickerB,
  isMaximized,
  onMaximize,
}: {
  tickerA: string;
  tickerB: string;
  isMaximized: boolean;
  onMaximize: (id: string | null) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0"
      onDoubleClick={() => onMaximize(isMaximized ? null : "signalAnalyzer")}
    >
      <AlertTriangle className="w-3 h-3 text-amber-400" />
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        Predictive Signals — {tickerA}/{tickerB}
      </span>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0"
        onClick={(e) => { e.stopPropagation(); onMaximize(isMaximized ? null : "signalAnalyzer"); }}
        title={isMaximized ? "Restore" : "Maximize"}
      >
        {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
      </Button>
    </div>
  );
}

function SignalStat({ label, value, valueClass }: { label: string; value: any; valueClass?: string }) {
  return (
    <div className="bg-card/30 border border-border/30 rounded px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-[12px] font-mono font-semibold ${valueClass || "text-foreground"}`}>{value}</div>
    </div>
  );
}

function SignalHorizonCells({ avg, hit }: { avg: number | null; hit: number | null }) {
  return (
    <>
      <td className={`px-2 py-1 text-right ${avgColorClass(avg)}`}>{fmtSignalPct(avg)}</td>
      <td className={`px-2 py-1 text-right ${hitColorClass(hit)}`}>{fmtSignalHit(hit)}</td>
    </>
  );
}

function SignalAnalyzerChart({
  priceA,
  priceB,
  tickerA,
  tickerB,
  isMaximized,
  onMaximize,
}: {
  priceA: DataPoint[];
  priceB: DataPoint[];
  tickerA: string;
  tickerB: string;
  isMaximized: boolean;
  onMaximize: (id: string | null) => void;
}) {
  const [activeSignal, setActiveSignal] = useState("raw_z");
  // Analog matching granularity: daily bars (5/20/60d fwd) or month-end
  // sampling (distinct months, 1/3/6mo fwd) — see computeSignalAnalogsMonthly.
  const [analogBarMode, setAnalogBarMode] = useState<"daily" | "monthly">("daily");
  const analysis = useMemo(() => {
    if (!priceA || !priceB || priceA.length < 200 || priceB.length < 200) return null;
    try {
      return analyzePairSignals(priceA, priceB, tickerA, tickerB);
    } catch (err) {
      console.warn("[PairSignalAnalyzer]", err);
      return null;
    }
  }, [priceA, priceB, tickerA, tickerB]);

  if (!analysis) {
    return (
      <div
        className={`flex flex-col ${
          isMaximized ? "fixed inset-0 z-50 bg-background" : "w-full h-full border border-border/30 min-h-0 overflow-hidden"
        }`}
      >
        <SignalAnalyzerHeader tickerA={tickerA} tickerB={tickerB} isMaximized={isMaximized} onMaximize={onMaximize} />
        <div className="flex items-center justify-center h-full text-muted-foreground text-xs px-3">
          Need at least 200 overlapping trading days to run signal analysis.
        </div>
      </div>
    );
  }

  const best = analysis.bestNow;
  const buckets = (analysis.buckets as any)[activeSignal];
  const currentValue = analysis.currentSignals.find((s: any) => s.signal === activeSignal)?.value;
  const activeBucketIdx = buckets.findIndex(
    (b: any) => currentValue != null && currentValue >= b.low && currentValue < b.high
  );

  return (
    <div
      className={`flex flex-col ${
        isMaximized ? "fixed inset-0 z-50 bg-background" : "w-full h-full border border-border/30 min-h-0 overflow-hidden"
      }`}
    >
      <SignalAnalyzerHeader tickerA={tickerA} tickerB={tickerB} isMaximized={isMaximized} onMaximize={onMaximize} />
      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3 text-xs">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
          <SignalStat label="Pair" value={`${tickerA}/${tickerB}`} />
          <SignalStat label={`${tickerA}`} value={`$${analysis.currentA.toFixed(2)}`} />
          <SignalStat label={`${tickerB}`} value={`$${analysis.currentB.toFixed(2)}`} />
          <SignalStat label="Ratio" value={analysis.currentRatio.toFixed(4)} />
          <SignalStat label="Half-life" value={analysis.halfLifeDays ? `${analysis.halfLifeDays.toFixed(1)}d` : "—"} />
        </div>
        {best ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">Best signal right now</span>
              <span className="text-[10px] text-muted-foreground ml-auto">
                quality {best.bucket.quality.toFixed(2)} · n={best.bucket.n}
              </span>
            </div>
            <div className="text-[12px] text-foreground/90 leading-snug">
              {best.bucket.label} on <span className="font-semibold">{signalLabel(best.signal)}</span> (
              {signalValueFormat(best.signal, best.currentSignalValue)})
            </div>
            <div className="text-[11px] text-muted-foreground leading-snug">{best.rationale}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1 pt-2 border-t border-amber-500/20">
              <SignalStat
                label="20d expected"
                value={`${best.expectedMove20dPct >= 0 ? "+" : ""}${best.expectedMove20dPct.toFixed(2)}%`}
                valueClass={best.expectedMove20dPct < 0 ? "text-rose-400" : "text-emerald-400"}
              />
              <SignalStat label="Ratio target" value={best.expectedRatio20d.toFixed(4)} />
              <SignalStat label={`${tickerA} target (${tickerB} flat)`} value={`$${best.expectedAPrice20dIfBHolds.toFixed(2)}`} />
              <SignalStat label={`${tickerB} target (${tickerA} flat)`} value={`$${best.expectedBPrice20dIfAHolds.toFixed(2)}`} />
            </div>
            <div className="text-[10px] text-muted-foreground/80 pt-1 border-t border-amber-500/10">
              {best.direction === "short_ratio"
                ? `Setup: short ${tickerA} / long ${tickerB} (sell the ratio)`
                : best.direction === "long_ratio"
                ? `Setup: long ${tickerA} / short ${tickerB} (buy the ratio)`
                : "No actionable bias — the bucket is statistically flat."}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-border/40 bg-card/30 p-3 text-[11px] text-muted-foreground">
            <Info className="inline w-3 h-3 mr-1.5 -mt-0.5" />
            All four current signals sit in low-edge / neutral buckets (n &lt; 20 or |hit−50%| small). Wait for a stronger setup.
          </div>
        )}
        <div className="flex items-center gap-1 flex-wrap pt-1">
          {SIGNAL_TYPES.map((sig) => {
            const v = analysis.currentSignals.find((s: any) => s.signal === sig)?.value;
            return (
              <button
                key={sig}
                onClick={() => setActiveSignal(sig)}
                data-testid={`btn-signal-${sig}`}
                className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                  activeSignal === sig
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card/30 text-muted-foreground border-border/40 hover:border-border"
                }`}
              >
                {signalLabel(sig)}
                {v != null && <span className="ml-1.5 opacity-80">({signalValueFormat(sig, v)})</span>}
              </button>
            );
          })}
        </div>
        <div className="overflow-x-auto border border-border/30 rounded">
          <table className="w-full text-[10px] font-mono">
            <thead className="bg-card/40 text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1.5">Bucket</th>
                <th className="text-right px-2 py-1.5">n</th>
                {SIGNAL_HORIZONS.map((hz) => (
                  <th key={hz.key} className="text-right px-2 py-1.5" colSpan={2}>
                    {hz.label} avg / hit
                  </th>
                ))}
                <th className="text-right px-2 py-1.5">Ratio range</th>
                <th className="text-right px-2 py-1.5" title={`${tickerA} price if ${tickerB} stays flat at current`}>
                  {tickerA} $ tgt
                </th>
                <th className="text-right px-2 py-1.5" title={`${tickerB} price if ${tickerA} stays flat at current`}>
                  {tickerB} $ tgt
                </th>
                <th
                  className="text-right px-2 py-1.5"
                  title="Quality = |20d avg| × (20d hit% − 50) × log10(n+1)/100"
                >
                  Q
                </th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b: any, idx: number) => {
                const isActive = idx === activeBucketIdx;
                return (
                  <tr
                    key={b.label}
                    className={`border-t border-border/20 ${isActive ? "bg-amber-500/10" : ""}`}
                    data-testid={`signal-bucket-${activeSignal}-${idx}`}
                  >
                    <td className="px-2 py-1 text-foreground/90">
                      {isActive && <span className="text-amber-400 mr-1">▶</span>}
                      {b.label}
                    </td>
                    <td className={`px-2 py-1 text-right ${b.n < 20 ? "text-muted-foreground/50" : "text-foreground/80"}`}>
                      {b.n}
                    </td>
                    {SIGNAL_HORIZONS.map((hz) => (
                      <SignalHorizonCells key={hz.key} avg={b[`avg_${hz.key}`]} hit={b[`hit_${hz.key}`]} />
                    ))}
                    <td className="px-2 py-1 text-right text-foreground/70">
                      {fmtRatioLevel(b.ratioLevelLow)} – {fmtRatioLevel(b.ratioLevelHigh)}
                    </td>
                    <td className="px-2 py-1 text-right text-foreground/85">
                      {b.ratioLevelLow != null && b.ratioLevelHigh != null && analysis.currentB > 0
                        ? `$${(((b.ratioLevelLow + b.ratioLevelHigh) / 2) * analysis.currentB).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-2 py-1 text-right text-foreground/85">
                      {b.ratioLevelLow != null && b.ratioLevelHigh != null && analysis.currentA > 0
                        ? `$${(analysis.currentA / ((b.ratioLevelLow + b.ratioLevelHigh) / 2)).toFixed(2)}`
                        : "—"}
                    </td>
                    <td
                      className={`px-2 py-1 text-right ${
                        b.quality >= 1.5
                          ? "text-emerald-400 font-semibold"
                          : b.quality >= 0.5
                          ? "text-emerald-400/70"
                          : b.quality <= -0.5
                          ? "text-rose-400/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {b.quality.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[9.5px] text-muted-foreground/70 leading-snug px-1">
          <span className="font-semibold">avg</span> = mean forward % change in {tickerA}/{tickerB} ratio.{" "}
          <span className="font-semibold">hit</span> = % of observations that reverted in the expected direction (
          {reversionDir(activeSignal).trim()}). <span className="font-semibold">Q</span> = quality score on the 20-day
          horizon (size × edge × sample reliability).  Highlighted row = bucket the pair is currently sitting in.  Sample:{" "}
          {analysis.firstDate} → {analysis.lastDate} ({analysis.n.toLocaleString()} days).
        </div>
        {(() => {
          const monthly = analogBarMode === "monthly";
          const an = monthly
            ? (analysis as any).analogsMonthly?.[activeSignal] ?? (analysis as any).analogs?.[activeSignal]
            : (analysis as any).analogs?.[activeSignal];
          if (!an) return null;
          const isMo = monthly && (analysis as any).analogsMonthly?.[activeSignal];
          const hzLabels = isMo ? ["1mo", "3mo", "6mo"] : ["5d", "20d", "60d"];
          const horizons: Array<[string, any]> = [[hzLabels[0], an.h5d], [hzLabels[1], an.h20d], [hzLabels[2], an.h60d]];
          const midLabel = hzLabels[1];
          return (
            <div className="rounded-md border border-border/40 bg-card/30 p-3 space-y-2" data-testid={`analog-panel-${activeSignal}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">Analog episodes</span>
                <div className="inline-flex rounded border border-border/50 overflow-hidden">
                  {(["daily", "monthly"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setAnalogBarMode(m)}
                      data-testid={`analog-bars-${m}`}
                      title={m === "monthly" ? "Match distinct historical MONTHS (month-end readings) with 1/3/6-month forward returns" : "Match daily bars with 5/20/60-day forward returns"}
                      className={`px-1.5 py-0.5 text-[9px] font-mono font-bold ${m === "monthly" ? "border-l border-border/50" : ""} ${analogBarMode === m ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {m === "daily" ? "D" : "M"}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {an.matches.length} closest historical {isMo ? "month-end readings" : "matches"} to today's {signalLabel(activeSignal)} ({signalValueFormat(activeSignal, an.todayValue)})
                  · {isMo ? "min 2mo apart · last 6mo excluded" : "min 21d apart · last 60d excluded"}{an.droppedByGap ? ` · ${an.droppedByGap} dropped by spacing` : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {horizons.map(([hz, s]) => (
                  <div key={hz} className="bg-card/40 border border-border/30 rounded px-2 py-1.5" data-testid={`analog-h${hz}`}>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Forward {hz}</div>
                    {s ? (
                      <>
                        <div className="text-[12px] font-mono">
                          <span className={s.median > 0 ? "text-emerald-400" : s.median < 0 ? "text-rose-400" : "text-muted-foreground"}>
                            {fmtSignalPct(s.median)}
                          </span>
                          <span className="text-muted-foreground text-[10px]"> median · </span>
                          <span className={hitColorClass(s.hitRate)}>{s.hitRate.toFixed(0)}%</span>
                          <span className="text-muted-foreground text-[10px]"> reverted</span>
                        </div>
                        <div className="text-[9px] font-mono text-muted-foreground/80">
                          p25 {fmtSignalPct(s.p25)} · p75 {fmtSignalPct(s.p75)} · n={s.n}
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">too few matches</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {an.matches.map((m: any) => (
                  <span
                    key={m.date}
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                      m.fwd20d == null ? "border-border/30 text-muted-foreground/60"
                        : (an.isLong ? m.fwd20d >= 0 : m.fwd20d < 0)
                        ? "border-emerald-500/30 text-emerald-300/90 bg-emerald-500/5"
                        : "border-rose-500/30 text-rose-300/90 bg-rose-500/5"
                    }`}
                    title={`${signalLabel(activeSignal)} ${signalValueFormat(activeSignal, m.value)} · fwd ${midLabel} ${fmtSignalPct(m.fwd20d)}`}
                  >
                    {m.date}
                  </span>
                ))}
              </div>
              <div className="text-[9.5px] text-muted-foreground/70 leading-snug">
                Forward % change in the {tickerA}/{tickerB} ratio after each matched date. "Reverted" = moved in the
                mean-reversion direction implied by today's reading ({an.isLong ? "ratio up" : "ratio down"}). Chip color = {midLabel} outcome.
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── % Residence Days (how long the pair sits in each z / percentile band) ──
// For a mean-reverting pair, the ratio's z-score (or rolling percentile) is the
// natural coordinate. This panel answers "what fraction of trading days has
// A/B spent stretched vs. mean-reverted?" and, for the extreme tails, how long
// each excursion typically lasts (median dwell in days).
type ResidenceBasis = "zscore" | "percentile";

interface ResBand {
  label: string;
  lo: number; // inclusive
  hi: number; // exclusive (use Infinity for the top band)
  color: string;
}

// Z-score bands: both tails are "stretched" (reversion setups); centre is calm.
const Z_RES_BANDS: ResBand[] = [
  { label: "≤ −2σ", lo: -Infinity, hi: -2, color: "#0ea5e9" },
  { label: "−2 to −1σ", lo: -2, hi: -1, color: "#38bdf8" },
  { label: "−1 to 0σ", lo: -1, hi: 0, color: "#475569" },
  { label: "0 to +1σ", lo: 0, hi: 1, color: "#475569" },
  { label: "+1 to +2σ", lo: 1, hi: 2, color: "#fb7185" },
  { label: "≥ +2σ", lo: 2, hi: Infinity, color: "#f43f5e" },
];

// Percentile bands mirror the app-wide Residence tab (richness 0–100).
const PCT_RES_BANDS: ResBand[] = [
  { label: "0–10", lo: -Infinity, hi: 10, color: "#0ea5e9" },
  { label: "10–25", lo: 10, hi: 25, color: "#38bdf8" },
  { label: "25–50", lo: 25, hi: 50, color: "#475569" },
  { label: "50–75", lo: 50, hi: 75, color: "#475569" },
  { label: "75–90", lo: 75, hi: 90, color: "#fb7185" },
  { label: "90–100", lo: 90, hi: Infinity, color: "#f43f5e" },
];

function resMedian(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Count + median duration (trading days) of consecutive runs where pred holds.
function resExcursions(values: number[], pred: (v: number) => boolean) {
  const durations: number[] = [];
  let run = 0;
  for (const v of values) {
    if (Number.isFinite(v) && pred(v)) run++;
    else if (run > 0) { durations.push(run); run = 0; }
  }
  if (run > 0) durations.push(run);
  return { count: durations.length, medDur: resMedian(durations) };
}

function bandIndexOf(v: number, bands: ResBand[]): number {
  for (let i = 0; i < bands.length; i++) {
    if (v >= bands[i].lo && v < bands[i].hi) return i;
  }
  return -1;
}

function PairResidenceChart({
  zScore,
  percentileRank,
  tickerA,
  tickerB,
  zWindow,
  isMaximized,
  onMaximize,
}: {
  zScore: DataPoint[];
  percentileRank: DataPoint[];
  tickerA: string;
  tickerB: string;
  zWindow: number;
  isMaximized: boolean;
  onMaximize: (id: string | null) => void;
}) {
  const [basis, setBasis] = useState<ResidenceBasis>("zscore");

  const res = useMemo(() => {
    const bands = basis === "zscore" ? Z_RES_BANDS : PCT_RES_BANDS;
    const src = basis === "zscore" ? zScore : percentileRank;
    const values = src.map((d) => d.value).filter((v) => Number.isFinite(v));
    const n = values.length;
    if (n === 0) return null;

    const counts = new Array(bands.length).fill(0);
    for (const v of values) {
      const bi = bandIndexOf(v, bands);
      if (bi >= 0) counts[bi]++;
    }
    const pct = counts.map((c) => (c / n) * 100);

    // Tail dwell: extreme low band (index 0) and extreme high band (last).
    const lowBand = bands[0];
    const highBand = bands[bands.length - 1];
    const lowEx = resExcursions(values, (v) => v >= lowBand.lo && v < lowBand.hi);
    const highEx = resExcursions(values, (v) => v >= highBand.lo && v < highBand.hi);

    const current = values[values.length - 1];
    const currentIdx = bandIndexOf(current, bands);

    return { bands, counts, pct, n, current, currentIdx, lowEx, highEx };
  }, [basis, zScore, percentileRank]);

  const fmtPct = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : "—");
  const fmtDur = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)}d` : "—");
  const fmtCur = (v: number) =>
    Number.isFinite(v) ? (basis === "zscore" ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}σ` : `${v.toFixed(0)}`) : "—";

  return (
    <div
      className={`flex flex-col ${
        isMaximized ? "fixed inset-0 z-50 bg-background" : "w-full h-full border border-border/30 min-h-0 overflow-hidden"
      }`}
      onDoubleClick={() => onMaximize(isMaximized ? null : "residence")}
    >
      <div className="flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0">
        <Layers className="w-3 h-3 text-emerald-400" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          % Residence Days — {tickerA}/{tickerB}
        </span>
        <div className="flex items-center gap-0.5 ml-2">
          {(["zscore", "percentile"] as ResidenceBasis[]).map((b) => (
            <button
              key={b}
              onClick={(e) => { e.stopPropagation(); setBasis(b); }}
              data-testid={`pairs-residence-basis-${b}`}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors ${
                basis === b
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/30 text-muted-foreground border-border/40 hover:border-border"
              }`}
            >
              {b === "zscore" ? `Z (${zWindow}d)` : "Pctile"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost" size="sm" className="h-5 w-5 p-0"
          onClick={(e) => { e.stopPropagation(); onMaximize(isMaximized ? null : "residence"); }}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </Button>
      </div>

      {!res ? (
        <div className="flex items-center justify-center h-full text-muted-foreground text-xs px-3">
          No overlapping history to compute residence.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3 text-xs">
          {/* Segmented occupancy bar */}
          <div className="space-y-1">
            <div className="flex h-6 w-full rounded overflow-hidden border border-border/40">
              {res.pct.map((p, i) =>
                p > 0 ? (
                  <div
                    key={i}
                    className="h-full flex items-center justify-center overflow-hidden"
                    style={{ width: `${p}%`, backgroundColor: res.bands[i].color, opacity: i === res.currentIdx ? 1 : 0.72 }}
                    title={`${res.bands[i].label}: ${fmtPct(p)} (${res.counts[i]}d)`}
                  >
                    {p >= 8 && <span className="text-[9px] font-mono text-white/90">{p.toFixed(0)}%</span>}
                  </div>
                ) : null,
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Currently{" "}
              <span className="font-semibold text-foreground">{fmtCur(res.current)}</span>
              {res.currentIdx >= 0 && (
                <> · band <span className="font-semibold" style={{ color: res.bands[res.currentIdx].color }}>{res.bands[res.currentIdx].label}</span></>
              )}{" "}
              · {res.n.toLocaleString()} trading days
            </div>
          </div>

          {/* Per-band table */}
          <div className="overflow-x-auto border border-border/30 rounded">
            <table className="w-full text-[10px] font-mono">
              <thead className="bg-card/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5">Band</th>
                  <th className="text-right px-2 py-1.5">Days</th>
                  <th className="text-right px-2 py-1.5">% of history</th>
                </tr>
              </thead>
              <tbody>
                {res.bands.map((b, i) => (
                  <tr
                    key={b.label}
                    className={`border-t border-border/20 ${i === res.currentIdx ? "bg-emerald-500/10" : ""}`}
                    data-testid={`pairs-residence-row-${i}`}
                  >
                    <td className="px-2 py-1 text-foreground/90">
                      <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ backgroundColor: b.color }} />
                      {i === res.currentIdx && <span className="text-emerald-400 mr-1">▶</span>}
                      {b.label}
                    </td>
                    <td className="px-2 py-1 text-right text-foreground/80">{res.counts[i].toLocaleString()}</td>
                    <td className="px-2 py-1 text-right text-foreground/90">{fmtPct(res.pct[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tail dwell */}
          <div className="grid grid-cols-2 gap-2">
            <SignalStat
              label={`${res.bands[0].label} · dwell`}
              value={`${fmtDur(res.lowEx.medDur)} × ${res.lowEx.count}`}
              valueClass="text-sky-400"
            />
            <SignalStat
              label={`${res.bands[res.bands.length - 1].label} · dwell`}
              value={`${fmtDur(res.highEx.medDur)} × ${res.highEx.count}`}
              valueClass="text-rose-400"
            />
          </div>

          <div className="text-[9.5px] text-muted-foreground/70 leading-snug px-1">
            % of trading days the {tickerA}/{tickerB} ratio spent in each{" "}
            {basis === "zscore" ? `${zWindow}-day z-score` : "rolling-percentile"} band. <span className="font-semibold">Dwell</span> ={" "}
            median run length × number of excursions into that tail. A pair that spends little time in the middle and reverts
            quickly from the tails is a cleaner mean-reversion candidate.
          </div>
        </div>
      )}
    </div>
  );
}

interface PairsData {
  priceA: DataPoint[];
  priceB: DataPoint[];
  ratio: DataPoint[];
  logRatio: DataPoint[];
  spread: DataPoint[];
  zScore: DataPoint[];
  spreadZ: DataPoint[];
  olsResidZ: DataPoint[];
  percentileRank: DataPoint[];
  correlation: DataPoint[];
  rollingBeta: DataPoint[];
  betaAdjSpread: DataPoint[];
  rollingR2: DataPoint[];
  cointStats: {
    adfStat: number;
    pValue: number;
    halfLife: number;
    hedgeRatio: number;
  } | null;
}

// ── Pairs Indicators Panel (mirrors Charts IndicatorsPanel exactly) ──
// Exported for the Pair Ratios detail view (same charts/indicatorsMap contract).
export function PairsIndicatorsPanel({
  charts,
  indicatorsMap,
  activeChartId,
  onSelectChart,
  onChangeIndicators,
  onClose,
}: {
  charts: { id: string; title: string }[];
  indicatorsMap: Record<string, ActiveIndicators>;
  activeChartId: string;
  onSelectChart: (id: string) => void;
  onChangeIndicators: (chartId: string, i: ActiveIndicators) => void;
  onClose: () => void;
}) {
  const activeIndicators = indicatorsMap[activeChartId] || {};
  const setIndicators = (i: ActiveIndicators) => onChangeIndicators(activeChartId, i);
  const copyToAll = () => {
    for (const c of charts) {
      if (c.id !== activeChartId) onChangeIndicators(c.id, { ...activeIndicators });
    }
  };
  // Copy ONE indicator's state from the active chart to a target chart (or
  // all). Copies the full INSTANCE list (every pane/frequency of it),
  // replacing the target's — works for registry ids and instance-enabled
  // built-ins alike (setInstances keeps legacy fields in sync on the target).
  const copyIndicatorToChart = (defId: string, target: string | "all") => {
    const src = getInstances(activeIndicators, defId);
    if (!src.length) return;
    const ids = target === "all" ? charts.filter((c) => c.id !== activeChartId).map((c) => c.id) : [target];
    for (const id of ids) {
      onChangeIndicators(id, setInstances(indicatorsMap[id] || {}, defId, JSON.parse(JSON.stringify(src))));
    }
  };

  // Per-section collapse state (Charts-tab parity) — empty set = all expanded.
  const PAIRS_SECTIONS = [
    "Indicator Sets", "Moving Averages", "Oscillators", "Volatility",
    "Overlays", "Volume", "Trend", "Statistical", "More Indicators",
  ];
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const isCollapsed = (name: string) => collapsedSections.has(name);
  const toggleSection = (name: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const allCollapsed = PAIRS_SECTIONS.every((s) => collapsedSections.has(s));
  const toggleAll = () =>
    setCollapsedSections(allCollapsed ? new Set() : new Set(PAIRS_SECTIONS));

  const meanCfg = activeIndicators.mean;
  const [meanRolling, setMeanRolling] = useState(meanCfg?.rolling ?? false);
  const [meanPeriod, setMeanPeriod] = useState(meanCfg?.period ?? 200);
  const [ovlCollapsed, setOvlCollapsed] = useState(false);
  const [fractalN, setFractalN] = useState(activeIndicators.fractalLines?.n ?? 10);

  // Update fractal-lines config (Charts parity). anchorDate: undefined = keep
  // current, null = clear (live), string = set.
  const updateFractal = (
    on: boolean,
    n?: number,
    anchorDate?: string | null,
    timeframe?: "daily" | "weekly" | "monthly",
  ) => {
    if (!on) {
      setIndicators({ ...activeIndicators, fractalLines: undefined });
      return;
    }
    const cur = activeIndicators.fractalLines;
    const nextAnchor =
      anchorDate === undefined ? cur?.anchorDate : anchorDate === null ? undefined : anchorDate;
    setIndicators({
      ...activeIndicators,
      fractalLines: { n: n ?? fractalN, anchorDate: nextAnchor, timeframe: timeframe ?? cur?.timeframe },
    });
  };

  // Heikin-Ashi state
  const haVal = activeIndicators.heikinAshi;
  const isHaOn = !!haVal;
  const haSmoothCfg: HASmoothConfig =
    typeof haVal === "object" ? haVal : { type: "none", period: 10 };
  const [haSmoothType, setHaSmoothType] = useState<HASmoothType>(haSmoothCfg.type);
  const [haSmoothPeriod, setHaSmoothPeriod] = useState(haSmoothCfg.period);

  const updateHA = (type: HASmoothType, period: number) => {
    setHaSmoothType(type);
    setHaSmoothPeriod(period);
    if (isHaOn) {
      const val: boolean | HASmoothConfig = type === "none" ? true : { type, period };
      setIndicators({ ...activeIndicators, heikinAshi: val });
    }
  };
  const toggleHA = (on: boolean) => {
    if (!on) {
      setIndicators({ ...activeIndicators, heikinAshi: undefined });
    } else {
      const val: boolean | HASmoothConfig =
        haSmoothType === "none" ? true : { type: haSmoothType, period: haSmoothPeriod };
      setIndicators({ ...activeIndicators, heikinAshi: val });
    }
  };

  const updateMean = (on: boolean, rolling?: boolean, period?: number) => {
    const r = rolling ?? meanRolling;
    const p = period ?? meanPeriod;
    setIndicators({
      ...activeIndicators,
      mean: on ? { rolling: r, period: p } : undefined,
    });
  };

  return (
    // Docked side panel (charts yield space) instead of the old absolute
    // overlay that covered the right edge of the chart grid.
    <ResizableSidebar storageKey="pairs-indicators-width" defaultWidth={280}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Indicators</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] gap-1"
            onClick={toggleAll}
            title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
            data-testid="pairs-collapse-all-indicators"
          >
            {allCollapsed ? <ChevronsUpDown className="w-3.5 h-3.5" /> : <ChevronsDownUp className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Chart selector */}
      {charts.length > 0 && (
        <div className="px-3 pt-3 space-y-1.5">
          <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Apply to chart</Label>
          <div className="flex gap-1">
            <Select value={activeChartId} onValueChange={onSelectChart}>
              <SelectTrigger className="h-7 text-[11px] flex-1" data-testid="pairs-indicator-chart-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {charts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {charts.length > 1 && (
              <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] gap-1 flex-shrink-0"
                onClick={copyToAll} title="Copy to all charts" data-testid="pairs-copy-indicators-all">
                <Copy className="w-3 h-3" /> All
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="p-3 space-y-4">
        {/* ───── Indicator Sets (shared, server-synced) ───── */}
        <SectionHeader
          title="Indicator Sets"
          collapsed={isCollapsed("Indicator Sets")}
          onToggle={() => toggleSection("Indicator Sets")}
        />
        {!isCollapsed("Indicator Sets") && (
          <IndicatorSetsSection activeIndicators={activeIndicators} onApply={setIndicators} />
        )}

        {/* ───── Pattern Recognition (same panel + engine as the Charts tab) ───── */}
        <PatternsPanel paneId={activeChartId} />

        {/* ───── Moving Averages (full Charts-tab set) ───── */}
        <SectionHeader
          title="Moving Averages"
          collapsed={isCollapsed("Moving Averages")}
          onToggle={() => toggleSection("Moving Averages")}
        />
        {!isCollapsed("Moving Averages") && ([
          ["SMA", "sma", [20, 50, 100, 200], 50],
          ["EMA", "ema", [9, 21, 50, 100], 21],
          ["HMA", "hma", [9, 20, 50, 100], 20],
          ["WMA", "wma", [9, 20, 50, 100], 20],
          ["DEMA", "dema", [9, 21, 50, 100], 21],
          ["TEMA", "tema", [9, 21, 50, 100], 21],
          ["KAMA", "kama", [10, 20, 50, 100], 20],
          ["FRAMA", "frama", [16, 26, 50, 100], 26],
          ["T3", "t3", [5, 10, 21, 50], 10],
          ["ALMA", "alma", [9, 21, 50, 100], 21],
          ["LSMA", "lsma", [14, 25, 50, 100], 25],
          ["SLSMA", "slsma", [14, 25, 50, 100], 25],
        ] as [string, MaKey, number[], number][]).map(([label, field, presets, defaultLen]) => (
          <MaRow key={field} label={label} presets={presets} defaultLen={defaultLen} frequency="daily"
            lines={getMaLines(activeIndicators, field)}
            onChangeLines={(lines) => setIndicators(setMaLines(activeIndicators, field, lines))} />
        ))}

        {/* ───── Oscillators ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Oscillators"
            collapsed={isCollapsed("Oscillators")}
            onToggle={() => toggleSection("Oscillators")}
            className="mb-3"
          />
          {!isCollapsed("Oscillators") && (<>
          {/* Instance rows (shared with Charts): each row = params + freq +
              pane, so RSI 14 daily and RSI 14 weekly can run at once. */}
          <BuiltinInstanceSection frequency="daily" indKey="rsi" title="RSI"
            activeIndicators={activeIndicators} onChange={setIndicators} presets={[7, 14, 21]} />
          <BuiltinInstanceSection frequency="daily" indKey="macd" title="MACD"
            activeIndicators={activeIndicators} onChange={setIndicators} className="mt-3" />
          <BuiltinInstanceSection frequency="daily" indKey="stochastic" title="Stochastic"
            activeIndicators={activeIndicators} onChange={setIndicators} className="mt-3" />
          <BuiltinInstanceSection frequency="daily" indKey="roc" title="ROC (Rate of Change)"
            activeIndicators={activeIndicators} onChange={setIndicators} presets={[9, 12, 20, 50]} className="mt-3" />
          </>)}
        </div>

        {/* ───── Volatility ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Volatility"
            collapsed={isCollapsed("Volatility")}
            onToggle={() => toggleSection("Volatility")}
            className="mb-3"
          />
          {!isCollapsed("Volatility") && (<>
          {/* Bollinger — instance rows (overlay: no pane dropdown); ATR below. */}
          <BuiltinInstanceSection frequency="daily" indKey="bollinger" title="Bollinger Bands"
            activeIndicators={activeIndicators} onChange={setIndicators} presets={[10, 20, 50]} />
          <BuiltinInstanceSection frequency="daily" indKey="atr" title="ATR"
            activeIndicators={activeIndicators} onChange={setIndicators} presets={[7, 14, 21]} className="mt-3" />
          </>)}
        </div>

        {/* ───── Overlays ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Overlays"
            collapsed={isCollapsed("Overlays")}
            onToggle={() => toggleSection("Overlays")}
            className="mb-3"
          />
          {!isCollapsed("Overlays") && (
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">VWAP</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Cumulative avg overlay</p>
            </div>
            <Switch checked={!!activeIndicators.vwap}
              onCheckedChange={(on) => setIndicators({ ...activeIndicators, vwap: on || undefined })} data-testid="toggle-vwap" />
          </div>
          )}
        </div>

        {/* ───── Volume ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Volume"
            collapsed={isCollapsed("Volume")}
            onToggle={() => toggleSection("Volume")}
            className="mb-3"
          />
          {!isCollapsed("Volume") && (
          <BuiltinInstanceSection frequency="daily" indKey="obv" title="OBV"
            activeIndicators={activeIndicators} onChange={setIndicators} />
          )}
        </div>

        {/* ───── Trend ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Trend"
            collapsed={isCollapsed("Trend")}
            onToggle={() => toggleSection("Trend")}
            className="mb-3"
          />
          {!isCollapsed("Trend") && (<>
          {/* Heikin-Ashi */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Heikin-Ashi</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Candle overlay on chart</p>
              </div>
              <Switch checked={isHaOn} onCheckedChange={toggleHA} data-testid="toggle-heikin-ashi" />
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-12">Smooth:</span>
              {(["none", "SMA", "EMA", "WMA"] as HASmoothType[]).map((t) => (
                <Button key={t} variant={haSmoothType === t ? "default" : "secondary"} size="sm"
                  className="h-5 px-1.5 text-[9px] flex-1"
                  onClick={() => updateHA(t, haSmoothPeriod)}>
                  {t === "none" ? "Off" : t}
                </Button>
              ))}
            </div>
            {haSmoothType !== "none" && (
              <div className="flex gap-1 items-center">
                <span className="text-[10px] text-muted-foreground w-12">Period:</span>
                {[5, 10, 14, 20].map((p) => (
                  <Button key={p} variant={haSmoothPeriod === p ? "default" : "secondary"} size="sm"
                    className="h-5 px-1.5 text-[9px] flex-1"
                    onClick={() => updateHA(haSmoothType, p)}>
                    {p}
                  </Button>
                ))}
                <Input type="number" placeholder="#" className="h-5 w-12 text-[9px] px-1" min={2}
                  onChange={(e) => { const n = parseInt(e.target.value); if (n > 1) updateHA(haSmoothType, n); }}
                  data-testid="custom-ha-smooth-period" />
              </div>
            )}
          </div>
          {/* HA Signals */}
          <div className="flex items-center justify-between mt-3">
            <div>
              <Label className="text-xs font-medium">HA Signals</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                <span className="text-green-400">▲</span> / <span className="text-red-400">▼</span> arrows on color flips
              </p>
            </div>
            <Switch checked={!!activeIndicators.haSignals}
              onCheckedChange={(on) => setIndicators({ ...activeIndicators, haSignals: on || undefined })} data-testid="toggle-ha-signals" />
          </div>

          {/* Fractal Lines (DojiEmoji auto-trendline) — Charts parity */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Fractal Lines</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  <span className="text-red-400">R</span> /{" "}
                  <span className="text-green-400">S</span> trendlines from last 2 fractal pivots
                </p>
              </div>
              <Switch
                checked={activeIndicators.fractalLines !== undefined}
                onCheckedChange={(on) => updateFractal(on)}
                data-testid="pairs-toggle-fractal-lines"
              />
            </div>
            {activeIndicators.fractalLines !== undefined && (<>
              <div className="flex gap-1 items-center">
                <span className="text-[10px] text-muted-foreground w-12">Period</span>
                {[5, 10, 20].map((p) => (
                  <Button
                    key={p}
                    variant={fractalN === p ? "default" : "secondary"}
                    size="sm"
                    className="h-6 px-2 text-[10px] flex-1"
                    onClick={() => { setFractalN(p); updateFractal(true, p); }}
                  >
                    {p}
                  </Button>
                ))}
                <Input
                  type="number"
                  placeholder="#"
                  className="h-6 w-14 text-[10px] px-1.5"
                  min={2}
                  max={100}
                  value={fractalN}
                  onChange={(e) => {
                    const n = parseInt(e.target.value);
                    if (Number.isFinite(n) && n >= 2 && n <= 100) {
                      setFractalN(n);
                      updateFractal(true, n);
                    }
                  }}
                  data-testid="pairs-custom-fractal-period"
                />
              </div>
              <div className="flex gap-1 items-center">
                <span className="text-[10px] text-muted-foreground w-12">Timeframe</span>
                {(["daily", "weekly", "monthly"] as const).map((tf) => (
                  <Button
                    key={tf}
                    variant={(activeIndicators.fractalLines?.timeframe ?? "daily") === tf ? "default" : "secondary"}
                    size="sm"
                    className="h-6 px-2 text-[10px] flex-1"
                    onClick={() => updateFractal(true, undefined, undefined, tf)}
                    data-testid={`pairs-fractal-tf-${tf}`}
                  >
                    {tf === "daily" ? "Daily" : tf === "weekly" ? "Weekly" : "Monthly"}
                  </Button>
                ))}
              </div>
              <div className="flex gap-1 items-center">
                <span className="text-[10px] text-muted-foreground w-12">As of</span>
                <DateInput
                  wrapperClassName="flex-1"
                  className="h-6 text-[10px] px-1.5 flex-1"
                  value={activeIndicators.fractalLines.anchorDate ?? ""}
                  onChange={(v) => updateFractal(true, undefined, v || null)}
                  data-testid="pairs-fractal-anchor-date"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => updateFractal(true, undefined, null)}
                  title="Use the latest bar (live)"
                  disabled={!activeIndicators.fractalLines.anchorDate}
                >
                  Latest
                </Button>
              </div>
            </>)}
          </div>
          </>)}
        </div>

        {/* ───── Statistical ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Statistical"
            collapsed={isCollapsed("Statistical")}
            onToggle={() => toggleSection("Statistical")}
            className="mb-3"
          />
          {!isCollapsed("Statistical") && (<>
          {/* Mean + Std Bands */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Mean ± Std Bands</Label>
              <Switch checked={meanCfg !== undefined}
                onCheckedChange={(on) => updateMean(on)} data-testid="toggle-mean" />
            </div>
            <div className="flex gap-1">
              <Button variant={!meanRolling ? "default" : "secondary"} size="sm"
                className="h-6 px-3 text-[10px] flex-1"
                onClick={() => { setMeanRolling(false); if (meanCfg) updateMean(true, false); }}>
                Static
              </Button>
              <Button variant={meanRolling ? "default" : "secondary"} size="sm"
                className="h-6 px-3 text-[10px] flex-1"
                onClick={() => { setMeanRolling(true); if (meanCfg) updateMean(true, true); }}>
                Rolling
              </Button>
            </div>
            <div className="flex gap-1 items-center">
              {[50, 100, 200, 500].map((p) => (
                <Button key={p} variant={meanPeriod === p ? "default" : "secondary"} size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => { setMeanPeriod(p); if (meanCfg) updateMean(true, undefined, p); }}>
                  {p}
                </Button>
              ))}
              <Input type="number" placeholder="#" className="h-6 w-14 text-[10px] px-1.5" min={10}
                onChange={(e) => { const n = parseInt(e.target.value); if (n >= 10) { setMeanPeriod(n); if (meanCfg) updateMean(true, undefined, n); } }}
                data-testid="custom-mean-period" />
            </div>
          </div>
          </>)}
        </div>

        {/* ───── More Indicators (registry-driven, same list as the Charts tab) ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="More Indicators"
            collapsed={isCollapsed("More Indicators")}
            onToggle={() => toggleSection("More Indicators")}
            className="mb-3"
          />
          {!isCollapsed("More Indicators") && (
            <RegistryIndicatorControls
              activeIndicators={activeIndicators}
              onChange={setIndicators}
              frequency="daily"
              copyTargets={charts.length > 1 ? charts.filter((c) => c.id !== activeChartId).map((c) => ({ id: c.id, label: c.title })) : undefined}
              onCopyIndicator={charts.length > 1 ? (defId, target) => copyIndicatorToChart(defId, target as string | "all") : undefined}
            />
          )}
        </div>

        {/* ───── Indicator Overlays (indicator-on-indicator, same as Charts) ───── */}
        <IndicatorOverlays
          activeIndicators={activeIndicators}
          onChangeIndicators={setIndicators}
          collapsed={ovlCollapsed}
          onToggle={() => setOvlCollapsed(v => !v)}
        />

        {/* ───── Hidden sub-panes (eye on a sub-pane) — click to restore ───── */}
        {(activeIndicators.hiddenSubCharts?.length ?? 0) > 0 && (
          <div className="border-t border-border pt-3 space-y-1.5">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Hidden Sub-Panes</p>
            <div className="flex flex-wrap gap-1">
              {activeIndicators.hiddenSubCharts!.map((t) => (
                <button
                  key={t}
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                  onClick={() => {
                    const rest = activeIndicators.hiddenSubCharts!.filter((x) => x !== t);
                    setIndicators({ ...activeIndicators, hiddenSubCharts: rest.length ? rest : undefined });
                  }}
                  title="Show this sub-pane again"
                  data-testid={`pairs-unhide-sub-${t}`}
                >
                  <Eye className="w-3 h-3" /> {pairsSubChartLabel(t, activeIndicators)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground">
            MAs, Bollinger, VWAP, and overlay-type indicators draw on the chart. RSI, MACD, ATR, ROC, Stochastic, OBV, and sub-pane indicators render below. Select which chart to apply to above.
          </p>
        </div>

        {/* Colors editor */}
        <IndicatorColorEditor />
      </div>
    </ResizableSidebar>
  );
}

// ── OLS Scatter Chart (returns of A vs B with regression line) ──
function OlsScatterChart({
  priceA,
  priceB,
  tickerA,
  tickerB,
  isMaximized,
  onMaximize,
}: {
  priceA: DataPoint[];
  priceB: DataPoint[];
  tickerA: string;
  tickerB: string;
  isMaximized: boolean;
  onMaximize: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizeKey, setResizeKey] = useState(0);

  // Resize observer to trigger re-render
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setResizeKey(k => k + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute log returns and OLS
  const scatter = useMemo(() => {
    if (priceA.length < 3 || priceB.length < 3) return null;
    const retA: number[] = [];
    const retB: number[] = [];
    for (let i = 1; i < priceA.length; i++) {
      if (priceA[i].value > 0 && priceA[i - 1].value > 0 &&
          priceB[i].value > 0 && priceB[i - 1].value > 0) {
        retA.push(Math.log(priceA[i].value / priceA[i - 1].value));
        retB.push(Math.log(priceB[i].value / priceB[i - 1].value));
      }
    }
    if (retA.length < 10) return null;
    // OLS: retA = alpha + beta * retB
    const n = retA.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) {
      sx += retB[i]; sy += retA[i];
      sxy += retB[i] * retA[i]; sxx += retB[i] * retB[i];
    }
    const mx = sx / n;
    const my = sy / n;
    const ssxx = sxx - n * mx * mx;
    const ssxy = sxy - n * mx * my;
    const beta = ssxx === 0 ? 0 : ssxy / ssxx;
    const alpha = my - beta * mx;
    // R²
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      const pred = alpha + beta * retB[i];
      ssRes += (retA[i] - pred) ** 2;
      ssTot += (retA[i] - my) ** 2;
    }
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
    return { retA, retB, alpha, beta, r2, n };
  }, [priceA, priceB]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !scatter) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, w, h);

    const { retA, retB, alpha, beta, r2, n } = scatter;
    const margin = { top: 30, right: 20, bottom: 35, left: 55 };
    const pw = w - margin.left - margin.right;
    const ph = h - margin.top - margin.bottom;

    // Compute ranges
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (retB[i] < minX) minX = retB[i];
      if (retB[i] > maxX) maxX = retB[i];
      if (retA[i] < minY) minY = retA[i];
      if (retA[i] > maxY) maxY = retA[i];
    }
    // Pad
    const padX = (maxX - minX) * 0.05 || 0.01;
    const padY = (maxY - minY) * 0.05 || 0.01;
    minX -= padX; maxX += padX;
    minY -= padY; maxY += padY;

    const toX = (v: number) => margin.left + ((v - minX) / (maxX - minX)) * pw;
    const toY = (v: number) => margin.top + ph - ((v - minY) / (maxY - minY)) * ph;

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (ph / 4) * i;
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
      const x = margin.left + (pw / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + ph); ctx.stroke();
    }

    // Zero lines
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.5;
    if (minX < 0 && maxX > 0) {
      const x0 = toX(0);
      ctx.beginPath(); ctx.moveTo(x0, margin.top); ctx.lineTo(x0, margin.top + ph); ctx.stroke();
    }
    if (minY < 0 && maxY > 0) {
      const y0 = toY(0);
      ctx.beginPath(); ctx.moveTo(margin.left, y0); ctx.lineTo(w - margin.right, y0); ctx.stroke();
    }

    // Scatter points
    ctx.fillStyle = "rgba(14, 165, 233, 0.5)";
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(toX(retB[i]), toY(retA[i]), 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Regression line
    const rLineY1 = alpha + beta * minX;
    const rLineY2 = alpha + beta * maxX;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(toX(minX), toY(rLineY1));
    ctx.lineTo(toX(maxX), toY(rLineY2));
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = "#7a8a9e";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${tickerB} Log Returns`, margin.left + pw / 2, h - 5);
    ctx.save();
    ctx.translate(12, margin.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${tickerA} Log Returns`, 0, 0);
    ctx.restore();

    // Tick labels
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= 4; i++) {
      const v = minX + (maxX - minX) * (i / 4);
      ctx.fillText((v * 100).toFixed(1) + "%", toX(v), margin.top + ph + 4);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const v = minY + (maxY - minY) * (i / 4);
      ctx.fillText((v * 100).toFixed(1) + "%", margin.left - 5, toY(v));
    }

    // Stats text
    ctx.fillStyle = "#e0e0e0";
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`OLS: β = ${beta.toFixed(4)}, α = ${alpha.toFixed(6)}, R² = ${r2.toFixed(4)}, n = ${n}`, margin.left + 5, margin.top + 5);
  }, [scatter, tickerA, tickerB, resizeKey]);

  return (
    <div
      className={`flex flex-col ${
        isMaximized
          ? "fixed inset-0 z-50 bg-background"
          : "w-full h-full border border-border/30 min-h-0 overflow-hidden"
      }`}
      onDoubleClick={() => onMaximize(isMaximized ? null : "olsScatter")}
    >
      <div className="flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          OLS Scatter — {tickerA} vs {tickerB} Log Returns
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost" size="sm" className="h-5 w-5 p-0"
          onClick={(e) => { e.stopPropagation(); onMaximize(isMaximized ? null : "olsScatter"); }}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </Button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {scatter ? (
          <canvas ref={canvasRef} className="absolute inset-0" />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
            Insufficient data for OLS scatter
          </div>
        )}
      </div>
    </div>
  );
}

// ── Which indicators get their own sub-pane (oscillators/separate-scale) ──
// Registry-driven sub-pane indicators (ADX, CCI, Aroon, …) are encoded as
// "reg:<id>" so one component handles both the bespoke and registry kinds.
// Pane keys: bare ids for the legacy instance group ("rsi", "reg:adx"), or
// instance-group keys ("rsi#i2", "reg:adx#i2") — see lib/indicatorInstances.
type PairsSubChartType =
  | "rsi" | "macd" | "ha" | "roc" | "stochastic" | "atr" | "obv"
  | `${"rsi" | "macd" | "roc" | "stochastic" | "atr" | "obv"}#${string}`
  | `reg:${string}` | `ovl:${string}`;

const SUB_CHART_HEIGHT = 80;

// Stable empty fallback — a fresh [] per render would defeat the sub-chart
// effect's dependency check and recreate charts constantly.
const EMPTY_PAIR_INSTANCES: IndicatorInstance[] = [];

// Pairs plots are line series (ratio/z-score/price); registry indicators take
// OHLC bars, so synthesize flat bars (o=h=l=c) — the same degradation the
// bespoke ATR/Stochastic/HA on this page already use for line data.
function lineToBars(data: DataPoint[]): OhlcBar[] {
  return data.map((d) => ({ time: d.time, open: d.value, high: d.value, low: d.value, close: d.value }));
}

// Adaptive precision for the in-plot crosshair readout (ratios can be ~0.07,
// prices ~300, z-scores ~1.5 — one fixed precision misreads at least one).
function fmtReadoutVal(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

// Distinct-but-related color for the idx-th line of one indicator — local
// copy of ChartPane's shadeHex (not exported there).
function shadePairs(color: string, idx: number): string {
  if (idx === 0 || !/^#[0-9a-f]{6}$/i.test(color)) return color;
  const v = parseInt(color.slice(1), 16);
  let r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const step = Math.ceil(idx / 2);
  const a = Math.min(0.55, 0.3 * step);
  const t = idx % 2 === 1 ? 255 : 0; // odd instances lighter, even darker
  r = Math.round(r + (t - r) * a);
  g = Math.round(g + (t - g) * a);
  b = Math.round(b + (t - b) * a);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Strip the Pairs "reg:" pane prefix, leaving a Charts-style sub-chart key
// ("adx", "adx#i2", "rsi#i2") for parseSubChartKey/overlay-source matching.
function stripReg(t: string): string {
  return t.startsWith("reg:") ? t.slice(4) : t;
}

// Human label for a sub-pane type — shared by the sub-pane chip and the
// panel's "Hidden Sub-Panes" restore row. Instance panes ("rsi#i2",
// "reg:adx#i2") label by their instance ("RSI 14W") so twins read apart.
function pairsSubChartLabel(type: string, indicators: ActiveIndicators): string {
  if (type.startsWith("ovl:")) {
    const o = (indicators.indicatorOverlays ?? []).find((x) => `ovl:${x.id}` === type);
    return o ? overlayPaneLabel(o) : type;
  }
  const { baseId, group } = parseSubChartKey(stripReg(type));
  const insts = getInstances(indicators, baseId).filter((i) => effGroup(i) === group);
  if (insts.length === 1) return instanceLabel(baseId, insts[0]);
  return baseId === "rsi" ? "RSI" : baseId === "macd" ? "MACD" : baseId === "ha" ? "Heikin-Ashi"
    : baseId === "atr" ? "ATR" : baseId === "roc" ? "ROC" : baseId === "stochastic" ? "Stochastic" : baseId === "obv" ? "OBV"
    : (getIndicatorDef(baseId)?.label ?? baseId);
}

// One sub-pane per instance GROUP of each indicator (see indicatorInstances).
// Untouched legacy state derives one LEGACY_GROUP per indicator whose subKey
// is the bare id ("rsi", "reg:adx"), so saved hiddenSubCharts/subHeights/
// overlay-source keys keep matching byte-identically.
type PairsSubPaneDesc = { subKey: PairsSubChartType; baseId: string; instances: IndicatorInstance[] };

function getActiveSubPanes(indicators: ActiveIndicators): PairsSubPaneDesc[] {
  const out: PairsSubPaneDesc[] = [];
  const pushGroups = (baseId: string, prefix = "") => {
    for (const g of paneGroups(indicators, baseId)) {
      out.push({
        subKey: `${prefix}${subChartKeyFor(baseId, g.group)}` as PairsSubChartType,
        baseId,
        instances: g.instances,
      });
    }
  };
  pushGroups("rsi");
  pushGroups("macd");
  // HA is now rendered as an overlay inside MiniChart, not as a sub-pane
  pushGroups("roc");
  pushGroups("stochastic");
  pushGroups("atr");
  pushGroups("obv");
  for (const def of ALL_REGISTRY_INDICATORS) {
    if (def.renderTarget === "pane") pushGroups(def.id, "reg:");
  }
  // Derived overlay panes (MACD/RSI/ROC/Autocorr ON another indicator) slot
  // in right after their source pane — same as the Charts tab. Overlay
  // sources are Charts-style subKeys ("adx", "rsi#i2"); Pairs pane ids carry
  // the "reg:" prefix, so match on the stripped key.
  const paneOvls = (indicators.indicatorOverlays ?? []).filter((o) => PANE_OVERLAY_TYPES.has(o.type));
  if (paneOvls.length > 0) {
    const interleaved: PairsSubPaneDesc[] = [];
    for (const d of out) {
      interleaved.push(d);
      const src = stripReg(d.subKey);
      for (const o of paneOvls) {
        if (o.source === src) interleaved.push({ subKey: `ovl:${o.id}`, baseId: "", instances: [] });
      }
    }
    return interleaved;
  }
  return out;
}

// ── Sub-chart for oscillators rendered below the main Pairs MiniChart ──
function PairsSubIndicatorChart({
  type,
  indKey = "",
  instances = EMPTY_PAIR_INSTANCES,
  freqSources,
  closeData,
  axisTimes,
  activeIndicators,
  parentChart,
  parentSeries,
  overlayDef,
  sourceData,
  onPrimaryData,
  isMaximized,
  onToggleMaximize,
  onHide,
  onClose,
  height,
  onResizeStart,
}: {
  type: PairsSubChartType;
  /** Base indicator id this pane renders ("rsi", registry id) — `type` is
   *  the pane KEY ("rsi", "rsi#i2", "reg:adx#i2"). Empty for "ovl:" panes. */
  indKey?: string;
  /** The indicator instances rendered in THIS pane group — one line-set per
   *  instance (own params + compute frequency). */
  instances?: IndicatorInstance[];
  /** Shared per-frequency resample cache (one weekly/monthly resample per
   *  pane, reused by every instance). */
  freqSources?: FreqSourceCache;
  closeData: DataPoint[];
  /** Full parent axis (incl. whitespace warm-up bars) for the spacer series;
   *  defaults to closeData's times. */
  axisTimes?: string[];
  activeIndicators: ActiveIndicators;
  parentChart: IChartApi | null;
  parentSeries: ISeriesApi<any> | null;
  /** Set when type = "ovl:<id>": renders the overlay (MACD/RSI/ROC/Autocorr)
   *  computed ON `sourceData` — the source sub-pane's displayed series. */
  overlayDef?: IndicatorOverlay | null;
  sourceData?: DataPoint[];
  /** Non-ovl panes publish their first plotted series (keyed by plain source
   *  id — "rsi", "adx") so derived panes compute from what's displayed. */
  onPrimaryData?: (type: string, data: DataPoint[]) => void;
  /** Charts-tab pane parity: expand to fill the plot, hide (keep state),
   *  close (turn the indicator off), and drag-resize the top border. */
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onHide?: () => void;
  onClose?: () => void;
  height?: number;
  onResizeStart?: (defaultH: number, e: ReactMouseEvent) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const syncingRef = useRef(false);
  const { colors: IC } = useIndicatorColors();
  const gridColor = useGridColor("rgba(255,255,255,0.03)");
  const [chrome] = useChartChrome();
  // In-plot crosshair readout for this sub-pane (fires for both direct hover
  // and the parent chart's synced crosshair).
  const [hoverReadout, setHoverReadout] = useState<{
    time: string;
    items: { label: string; value: number; color: string }[];
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || closeData.length === 0) return;

    if (chartRef.current) {
      try { chartRef.current.remove(); } catch {}
      chartRef.current = null;
    }

    const rect = el.getBoundingClientRect();
    const chart = createChart(el, {
      width: rect.width || 300,
      height: rect.height || SUB_CHART_HEIGHT,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7a8a9e",
        fontSize: 10,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)", minimumWidth: 80 },
      timeScale: { borderColor: "rgba(255,255,255,0.06)", visible: false },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;

    // Record every series created so the global Labels/Px-line preference can
    // be applied at the end without touching each addSeries site.
    const createdSeries: ISeriesApi<any>[] = [];
    {
      const origAdd = chart.addSeries.bind(chart);
      (chart as any).addSeries = (...args: unknown[]) => {
        const s = (origAdd as any)(...args);
        createdSeries.push(s);
        return s;
      };
    }

    let firstSeries: ISeriesApi<any> | null = null;

    // Invisible spacer spanning the parent's FULL axis: indicator series are
    // trimmed by their warmup, so without it the sub-chart's axis is shorter
    // than the parent's — the old TIME-range sync then clamped to the sub's
    // extent and echoed back, yanking the parent while dragging (pan felt
    // dead once any sub-pane was visible). Identical axes also make the
    // logical-range sync below exact.
    try {
      const spacer = chart.addSeries(LineSeries, {
        visible: false,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
      });
      spacer.setData((axisTimes ?? closeData.map((d) => String(d.time))).map((t) => ({ time: t as Time })));
    } catch {}

    // ── Derived overlay pane: MACD/RSI/ROC/Autocorr ON another indicator
    // (type = "ovl:<id>") — same treatment as the Charts tab.
    if (type.startsWith("ovl:") && overlayDef) {
      const o = overlayDef;
      const src = (sourceData ?? []).filter((d) => Number.isFinite(d.value));
      if (src.length > 5) {
        const srcLabel = subChartSourceLabel(o.source);
        const addL = (data: { time: any; value: number }[], title: string, color: string, opts: Record<string, unknown> = {}) => {
          if (!data?.length) return null;
          const s = chart.addSeries(LineSeries, { color, lineWidth: 1, title, priceLineVisible: false, ...opts });
          s.setData(data.map((d) => ({ time: d.time as Time, value: d.value })));
          if (!firstSeries && title) firstSeries = s;
          return s;
        };
        const dotted = (pts: { time: any; value: number }[], color = "rgba(255,255,255,0.15)") =>
          addL(pts, "", color, { lineStyle: LineStyle.Dotted, crosshairMarkerVisible: false, lastValueVisible: false });
        const refSpan = (data: { time: any; value: number }[], lvl: number, color?: string) => {
          if (data.length >= 2) dotted([{ time: data[0].time, value: lvl }, { time: data[data.length - 1].time, value: lvl }], color);
        };
        try {
          if (o.type === "macd") {
            const mc = computeMACD(src, o.period, o.slow ?? 26, o.signal ?? 9);
            if (mc.histogram.length > 0) {
              const hist = chart.addSeries(HistogramSeries, { title: "", base: 0, lastValueVisible: false, priceLineVisible: false });
              hist.setData(mc.histogram.map((d) => ({
                time: d.time as Time, value: d.value,
                color: d.value >= 0 ? (IC as any).macd_histogram_pos ?? "#22c55e" : (IC as any).macd_histogram_neg ?? "#ef4444",
              })));
            }
            addL(mc.macdLine, `MACD on ${srcLabel}`, IC.macd_line);
            addL(mc.signalLine, "Signal", IC.macd_signal, { crosshairMarkerVisible: false });
            refSpan(mc.macdLine, 0);
          } else if (o.type === "rsi") {
            const rs = computeRSI(src, o.period);
            addL(rs, `RSI${o.period} on ${srcLabel}`, IC.rsi_line);
            refSpan(rs, 70, IC.rsi_overbought);
            refSpan(rs, 30, IC.rsi_oversold);
          } else if (o.type === "roc") {
            const rc = computeROC(src, o.period);
            addL(rc, `ROC${o.period} on ${srcLabel}`, IC.roc);
            refSpan(rc, 0);
          } else if (o.type === "autocorr") {
            const lag = Math.max(1, o.lag ?? 1);
            const ac = rollingAutocorrOfSeries(src, lag, o.period);
            addL(ac, `AC(lag ${lag}, w${o.period}) on ${srcLabel}`, (IC as any).autocorr_line ?? "#e879f9");
            const th = 1.96 / Math.sqrt(Math.max(1, o.period - lag));
            refSpan(ac, 0);
            refSpan(ac, th);
            refSpan(ac, -th);
          }
          chart.timeScale().fitContent();
        } catch {}
      }
    }

    // RSI — one line per INSTANCE (period × own compute frequency, so RSI 14
    // daily and RSI 14 weekly coexist; same instance loop as the Charts tab).
    if (indKey === "rsi" && instances.length > 0) {
      let refDrawn = false;
      let lineIdx = 0;
      for (const inst of instances) {
        const eff = effectiveFreq(undefined, inst);
        const rsiInput = eff && freqSources ? (freqSources.close(eff) as DataPoint[]) : closeData;
        for (const p of indicatorPeriods(inst.params.period as number | number[] | undefined)) {
          const rsiData = computeRSI(rsiInput, p);
          if (rsiData.length === 0) continue;
          const rsiLine = chart.addSeries(LineSeries, {
            color: shadePairs(IC.rsi_line, lineIdx), lineWidth: 1,
            title: `RSI ${p}${freqSuffix(eff)}`,
          });
          rsiLine.setData(rsiData.map(d => ({ time: d.time as Time, value: d.value })));
          if (!firstSeries) firstSeries = rsiLine;
          if (!refDrawn) {
            refDrawn = true;
            const first = rsiData[0].time as Time;
            const last = rsiData[rsiData.length - 1].time as Time;
            for (const [level, clr] of [[70, IC.rsi_overbought], [30, IC.rsi_oversold]] as [number, string][]) {
              const ref = chart.addSeries(LineSeries, {
                color: clr, lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", crosshairMarkerVisible: false,
              });
              ref.setData([{ time: first, value: level }, { time: last, value: level }]);
            }
          }
          chart.timeScale().fitContent();
          lineIdx++;
        }
      }
    }

    // MACD — one per instance (own fast/slow/signal + freq). Histogram only
    // for the FIRST instance of a merged pane; extras get shaded line pairs.
    if (indKey === "macd" && instances.length > 0) {
      let zeroSpan: { time: Time; value: number }[] = [];
      instances.forEach((inst, ii) => {
        const eff = effectiveFreq(undefined, inst);
        const input = eff && freqSources ? (freqSources.close(eff) as DataPoint[]) : closeData;
        const fast = typeof inst.params.fast === "number" ? inst.params.fast : 12;
        const slow = typeof inst.params.slow === "number" ? inst.params.slow : 26;
        const signal = typeof inst.params.signal === "number" ? inst.params.signal : 9;
        const macd = computeMACD(input, fast, slow, signal);
        if (macd.macdLine.length === 0) return;
        // Histogram first so the lines draw on top of the bars.
        if (ii === 0 && macd.histogram.length > 0) {
          const hist = chart.addSeries(HistogramSeries, {
            title: "", base: 0, lastValueVisible: false, priceLineVisible: false,
          });
          hist.setData(macd.histogram.map((d) => ({
            time: d.time as Time,
            value: d.value,
            color: d.value >= 0 ? (IC as any).macd_histogram_pos ?? "#22c55e" : (IC as any).macd_histogram_neg ?? "#ef4444",
          })));
        }
        const sfx = freqSuffix(eff);
        const ml = chart.addSeries(LineSeries, {
          color: shadePairs(IC.macd_line, ii), lineWidth: 1, title: sfx ? `MACD ${sfx}` : "MACD",
        });
        ml.setData(macd.macdLine.map(d => ({ time: d.time as Time, value: d.value })));
        if (!firstSeries) firstSeries = ml;
        const sl = chart.addSeries(LineSeries, {
          color: shadePairs(IC.macd_signal, ii), lineWidth: 1, title: sfx ? `Signal ${sfx}` : "Signal", crosshairMarkerVisible: false,
        });
        sl.setData(macd.signalLine.map(d => ({ time: d.time as Time, value: d.value })));
        if (!zeroSpan.length) zeroSpan = macd.macdLine as { time: Time; value: number }[];
      });
      if (zeroSpan.length >= 2) {
        const zl = chart.addSeries(LineSeries, {
          color: "rgba(255,255,255,0.15)", lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", crosshairMarkerVisible: false,
        });
        zl.setData([
          { time: zeroSpan[0].time as Time, value: 0 },
          { time: zeroSpan[zeroSpan.length - 1].time as Time, value: 0 },
        ]);
      }
      if (zeroSpan.length > 0) chart.timeScale().fitContent();
    }

    // Heikin-Ashi
    if (type === "ha" && activeIndicators.heikinAshi) {
      const haSmoothing: HASmoothConfig | undefined =
        typeof activeIndicators.heikinAshi === "object" ? activeIndicators.heikinAshi : undefined;
      const haCandles = computeHeikinAshi(closeData, haSmoothing);
      if (haCandles.length > 0) {
        const haSeries = chart.addSeries(CandlestickSeries, {
          upColor: IC.ha_up,
          downColor: IC.ha_down,
          borderUpColor: IC.ha_up,
          borderDownColor: IC.ha_down,
          wickUpColor: IC.ha_up,
          wickDownColor: IC.ha_down,
          title: "HA",
        });
        haSeries.setData(
          haCandles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }))
        );
        firstSeries = haSeries;
        chart.timeScale().fitContent();
      }
    }

    // ROC — one line per instance (period × own compute frequency)
    if (indKey === "roc" && instances.length > 0) {
      let zeroDrawn = false;
      let rocIdx = 0;
      for (const inst of instances) {
        const eff = effectiveFreq(undefined, inst);
        const input = eff && freqSources ? (freqSources.close(eff) as DataPoint[]) : closeData;
        for (const p of indicatorPeriods(inst.params.period as number | number[] | undefined)) {
          const rocData = computeROC(input, p);
          if (rocData.length === 0) continue;
          const rocLine = chart.addSeries(LineSeries, {
            color: shadePairs(IC.roc, rocIdx), lineWidth: 1, title: `ROC ${p}${freqSuffix(eff)}`,
          });
          rocLine.setData(rocData.map(d => ({ time: d.time as Time, value: d.value })));
          if (!firstSeries) firstSeries = rocLine;
          if (!zeroDrawn && rocData.length >= 2) {
            zeroDrawn = true;
            const zl = chart.addSeries(LineSeries, {
              color: "rgba(255,255,255,0.15)", lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", crosshairMarkerVisible: false,
            });
            zl.setData([
              { time: rocData[0].time as Time, value: 0 },
              { time: rocData[rocData.length - 1].time as Time, value: 0 },
            ]);
          }
          chart.timeScale().fitContent();
          rocIdx++;
        }
      }
    }

    // Stochastic — one %K/%D pair per instance
    if (indKey === "stochastic" && instances.length > 0) {
      let refSpan: { time: Time; value: number }[] = [];
      instances.forEach((inst, ii) => {
        const eff = effectiveFreq(undefined, inst);
        const input = eff && freqSources ? (freqSources.close(eff) as DataPoint[]) : closeData;
        const kPeriod = typeof inst.params.kPeriod === "number" ? inst.params.kPeriod : 14;
        const dPeriod = typeof inst.params.dPeriod === "number" ? inst.params.dPeriod : 3;
        const stoch = computeStochastic(input, kPeriod, dPeriod);
        if (stoch.k.length === 0) return;
        const sfx = freqSuffix(eff);
        const kLine = chart.addSeries(LineSeries, {
          color: shadePairs(IC.stoch_k, ii), lineWidth: 1, title: `%K(${kPeriod})${sfx}`,
        });
        kLine.setData(stoch.k.map(d => ({ time: d.time as Time, value: d.value })));
        if (!firstSeries) firstSeries = kLine;
        if (stoch.d.length > 0) {
          const dLine = chart.addSeries(LineSeries, {
            color: shadePairs(IC.stoch_d, ii), lineWidth: 1, title: `%D(${dPeriod})${sfx}`, crosshairMarkerVisible: false,
          });
          dLine.setData(stoch.d.map(d => ({ time: d.time as Time, value: d.value })));
        }
        if (!refSpan.length) refSpan = stoch.k as { time: Time; value: number }[];
      });
      if (refSpan.length > 0) {
        const first = refSpan[0].time as Time;
        const last = refSpan[refSpan.length - 1].time as Time;
        for (const [level, clr] of [[80, IC.stoch_overbought], [20, IC.stoch_oversold]] as [number, string][]) {
          const ref = chart.addSeries(LineSeries, {
            color: clr, lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", crosshairMarkerVisible: false,
          });
          ref.setData([{ time: first, value: level }, { time: last, value: level }]);
        }
        chart.timeScale().fitContent();
      }
    }

    // ATR — one line per instance (period × own compute frequency)
    if (indKey === "atr" && instances.length > 0) {
      let atrIdx = 0;
      for (const inst of instances) {
        const eff = effectiveFreq(undefined, inst);
        const input = eff && freqSources ? (freqSources.close(eff) as DataPoint[]) : closeData;
        for (const p of indicatorPeriods(inst.params.period as number | number[] | undefined)) {
          const atrData = computeATR(input, p);
          if (atrData.length === 0) continue;
          const atrLine = chart.addSeries(LineSeries, {
            color: shadePairs(IC.atr, atrIdx), lineWidth: 1, title: `ATR ${p}${freqSuffix(eff)}`,
          });
          atrLine.setData(atrData.map(d => ({ time: d.time as Time, value: d.value })));
          if (!firstSeries) firstSeries = atrLine;
          chart.timeScale().fitContent();
          atrIdx++;
        }
      }
    }

    // OBV — parameterless; instances differ only by compute frequency
    if (indKey === "obv" && instances.length > 0) {
      instances.forEach((inst, ii) => {
        const eff = effectiveFreq(undefined, inst);
        const input = eff && freqSources ? (freqSources.close(eff) as DataPoint[]) : closeData;
        const obvData = computeOBV(input);
        if (obvData.length === 0) return;
        const sfx = freqSuffix(eff);
        const obvLine = chart.addSeries(LineSeries, {
          color: shadePairs(IC.obv, ii), lineWidth: 1, title: sfx ? `OBV ${sfx}` : "OBV",
        });
        obvLine.setData(obvData.map(d => ({ time: d.time as Time, value: d.value })));
        if (!firstSeries) firstSeries = obvLine;
        chart.timeScale().fitContent();
      });
    }

    // Registry-driven sub-pane indicators (ADX, CCI, Williams %R, Aroon, Slow
    // Stoch, …) — one render per INSTANCE (own params + compute frequency);
    // extras get shaded colors and skip the reference lines.
    if (type.startsWith("reg:")) {
      const def = getIndicatorDef(indKey || stripReg(type));
      if (def?.renderPane && instances.length > 0) {
        // Resample the flat bars once per frequency (weekly high = max close
        // over the week — matches the pre-instance behavior exactly).
        const regBarsCache: Partial<Record<"weekly" | "monthly", OhlcBar[]>> = {};
        const baseBars = lineToBars(closeData);
        let drewAny = false;
        let lineIdx = 0; // shading index across instances AND multi-param values
        instances.forEach((inst, instIdx) => {
          const f = inst.freq === "weekly" || inst.freq === "monthly" ? inst.freq : undefined;
          const bars = f ? (regBarsCache[f] ??= resampleIndicatorBars(baseBars, f)) : baseBars;
          if (!bars.length) return;
          const regSt: RegistryIndicatorState = { enabled: true, params: inst.params };
          const params = resolveParams(def, regSt);
          // Multi-instance param (e.g. autocorr lag list) still renders once
          // per value WITHIN this instance.
          const instValues: (number | null)[] = def.multiInstanceParam
            ? resolveParamList(def, regSt, undefined, def.multiInstanceParam)
            : [null];
          const instLabel2 = f ? freqSuffix(f) : "";
          instValues.forEach((iv) => {
            const p2 = iv === null ? params : { ...params, [def.multiInstanceParam!]: iv };
            const lineKey = def.colorKeys[0];
            const colors =
              lineIdx === 0
                ? (IC as unknown as Record<string, string>)
                : { ...(IC as unknown as Record<string, string>), [lineKey]: shadePairs((IC as unknown as Record<string, string>)[lineKey], lineIdx) };
            def.renderPane!(
              {
                chart,
                colors,
                baseLabel: instLabel2,
                register: (s) => { if (!firstSeries) firstSeries = s; },
                refLine: instIdx === 0 && iv === instValues[0]
                  ? (level, color, first, last) => {
                      const rl = chart.addSeries(LineSeries, {
                        color, lineWidth: 1, lineStyle: LineStyle.Dotted, title: "",
                        crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
                      });
                      rl.setData([{ time: first as Time, value: level }, { time: last as Time, value: level }]);
                    }
                  : () => {},
              },
              bars,
              p2,
            );
            drewAny = true;
            lineIdx++;
          });
        });
        if (drewAny) chart.timeScale().fitContent();
      }
    }

    // ── Same-domain indicator-on-indicator overlays (EMA of RSI, Bollinger
    // on RSI, StochRSI, …) draw on the source sub-pane; MACD/RSI/ROC/Autocorr
    // get their own pane via the "ovl:" branch above (same as the Charts tab).
    {
      const srcId = type.startsWith("reg:") ? type.slice(4) : type;
      const inPaneOverlays = (activeIndicators.indicatorOverlays ?? []).filter(
        (o) => o.source === srcId && !PANE_OVERLAY_TYPES.has(o.type),
      );
      if (inPaneOverlays.length > 0 && firstSeries) {
        let srcData: { time: Time; value: number }[] = [];
        try {
          srcData = ((firstSeries as ISeriesApi<any>).data() as any[])
            .map((d) => ({ time: d.time, value: typeof d.value === "number" ? d.value : d.close }))
            .filter((d) => typeof d.value === "number" && Number.isFinite(d.value));
        } catch {}
        if (srcData.length > 5) {
          const OVERLAY_PALETTE = ["#38bdf8", "#f472b6", "#facc15", "#4ade80", "#c084fc", "#fb923c"];
          const srcLabel = subChartSourceLabel(srcId);
          inPaneOverlays.forEach((o, oi) => {
            const color = OVERLAY_PALETTE[oi % OVERLAY_PALETTE.length];
            const addLine = (data: { time: any; value: number }[], title: string, opts: Record<string, unknown> = {}) => {
              if (!data?.length) return null;
              const s = chart.addSeries(LineSeries, {
                color, lineWidth: 1, title, priceLineVisible: false, lastValueVisible: false, ...opts,
              });
              s.setData(data);
              return s;
            };
            try {
              if (o.type === "bollinger") {
                const bb = computeBollingerBands(srcData as any, o.period, o.mult ?? 2);
                addLine(bb.basis, `BB${o.period} on ${srcLabel}`);
                addLine(bb.upper, "", { lineStyle: LineStyle.Dotted });
                addLine(bb.lower, "", { lineStyle: LineStyle.Dotted });
              } else if (o.type === "meanband") {
                const rb = computeRollingMeanBands(srcData as any, o.period);
                addLine(rb.mean, `Mean${o.period} on ${srcLabel}`, { lineStyle: LineStyle.LargeDashed });
                const maxMult = o.mult ?? 2;
                for (const b of rb.bands) {
                  if (Math.abs(b.mult) <= maxMult) addLine(b.data, "", { lineStyle: LineStyle.Dotted });
                }
              } else if (o.type === "stochastic") {
                const so = computeStochastic(srcData as any, o.period, o.d ?? 3);
                addLine(so.k, `Stoch${o.period} on ${srcLabel}`);
                addLine(so.d, "", { lineStyle: LineStyle.Dotted });
              } else {
                const vals = srcData.map((d) => d.value);
                const ma = computeMaByType(vals, o.period, o.type.toUpperCase() as MaType);
                const data = srcData
                  .map((d, i) => ({ time: d.time, value: ma[i] as number }))
                  .filter((d) => typeof d.value === "number" && Number.isFinite(d.value));
                addLine(data, `${o.type.toUpperCase()}${o.period} on ${srcLabel}`);
              }
            } catch {}
          });
        }
      }
    }

    // Publish this pane's primary displayed series for derived overlay panes.
    if (onPrimaryData && !type.startsWith("ovl:")) {
      try {
        const d = firstSeries
          ? ((firstSeries as ISeriesApi<any>).data() as any[])
              .map((p) => ({ time: p.time, value: typeof p.value === "number" ? p.value : p.close }))
              .filter((p) => typeof p.value === "number" && Number.isFinite(p.value))
          : [];
        onPrimaryData(type.startsWith("reg:") ? type.slice(4) : type, d as DataPoint[]);
      } catch {}
    }

    // Sync time scale with parent chart using TIME-based range (not logical range)
    // because indicator data may have fewer points than the parent (e.g. HA skips
    // the first data point), so logical indices don't map to the same calendar dates.
    // In-plot readout: report this sub-pane's titled series at the crosshair.
    const readoutCb = (param: any) => {
      if (!param.time || !param.seriesData) { setHoverReadout(null); return; }
      const items: { label: string; value: number; color: string }[] = [];
      const seen = new Set<string>();
      param.seriesData.forEach((dp: any, series: any) => {
        const val = dp?.value ?? dp?.close;
        const opts = series.options?.() ?? {};
        if (val === undefined || val === null || !opts.title || seen.has(opts.title)) return;
        seen.add(opts.title);
        items.push({ label: opts.title, value: val, color: opts.color || "#e2e8f0" });
      });
      setHoverReadout(items.length > 0 ? { time: String(param.time), items } : null);
    };
    chart.subscribeCrosshairMove(readoutCb);

    // Parent-chart subscriptions must be torn down on cleanup: the parent keeps
    // firing them after this sub-chart (or a re-created parent) is disposed,
    // which raised "Object is disposed" errors on every indicator change.
    let removeParentSubs: (() => void) | null = null;
    if (parentChart) {
      // Track which chart initiated the sync to prevent infinite feedback loops.
      // Callbacks fire asynchronously so a simple boolean guard isn't enough.
      let syncSource: "parent" | "sub" | null = null;

      const syncToSub = () => {
        if (syncSource === "sub") return;
        syncSource = "parent";
        try {
          // LOGICAL range (valid because the spacer gives both charts the
          // same axis) — never clamped to the sub's trimmed data extent.
          const range = parentChart.timeScale().getVisibleLogicalRange();
          if (range) chart.timeScale().setVisibleLogicalRange(range);
        } catch {}
        requestAnimationFrame(() => { syncSource = null; });
      };
      const syncToParent = () => {
        if (syncSource === "parent") return;
        syncSource = "sub";
        try {
          const range = chart.timeScale().getVisibleLogicalRange();
          if (range) parentChart.timeScale().setVisibleLogicalRange(range);
        } catch {}
        requestAnimationFrame(() => { syncSource = null; });
      };
      parentChart.timeScale().subscribeVisibleLogicalRangeChange(syncToSub);
      chart.timeScale().subscribeVisibleLogicalRangeChange(syncToParent);

      // Initial sync — use requestAnimationFrame to ensure both charts are fully rendered
      requestAnimationFrame(() => {
        try {
          const range = parentChart.timeScale().getVisibleLogicalRange();
          if (range) chart.timeScale().setVisibleLogicalRange(range);
        } catch {}
      });

      // Parent → Sub crosshair sync
      let handleParentCrosshair: ((param: any) => void) | null = null;
      if (firstSeries) {
        handleParentCrosshair = (param: any) => {
          if (syncingRef.current) return;
          syncingRef.current = true;
          try {
            if (param.time && firstSeries) {
              chart.setCrosshairPosition(NaN, param.time, firstSeries);
            } else {
              chart.clearCrosshairPosition();
            }
          } catch {}
          syncingRef.current = false;
        };
        parentChart.subscribeCrosshairMove(handleParentCrosshair);
      }

      removeParentSubs = () => {
        try { parentChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncToSub); } catch {}
        if (handleParentCrosshair) {
          try { parentChart.unsubscribeCrosshairMove(handleParentCrosshair); } catch {}
        }
      };

      // Sub → Parent crosshair sync (bidirectional). Gate on sourceEvent:
      // parent→sub mirrors fire this callback asynchronously (after syncingRef
      // is cleared) and would echo a NaN-price crosshair back onto the parent,
      // wiping its horizontal line under the cursor (visible flicker). Only a
      // real pointer move over the sub-pane carries sourceEvent.
      if (parentSeries) {
        chart.subscribeCrosshairMove((param: any) => {
          if (syncingRef.current) return;
          if (!param.sourceEvent) return;
          syncingRef.current = true;
          try {
            if (param.time && parentSeries) {
              parentChart.setCrosshairPosition(NaN, param.time, parentSeries);
            } else {
              parentChart.clearCrosshairPosition();
            }
          } catch {}
          syncingRef.current = false;
        });
      }
    }

    // Global Labels/Px-line preference — only the OFF state is applied; the
    // chart is recreated with originals when toggled back on (chrome in deps).
    if (!chrome.axisLabels || !chrome.priceLines) {
      for (const s of createdSeries) {
        setSeriesAxisLabels(s, chrome.axisLabels, chrome.priceLines ? undefined : false);
      }
    }

    return () => {
      chartRef.current = null;
      removeParentSubs?.();
      setHoverReadout(null);
      try { chart.remove(); } catch {}
    };
  }, [closeData, axisTimes, activeIndicators, type, indKey, instances, freqSources, parentChart, parentSeries, IC, gridColor, chrome, overlayDef, sourceData, onPrimaryData]);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    const chart = chartRef.current;
    if (!el || !chart) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) chart.applyOptions({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  const label = pairsSubChartLabel(type, activeIndicators) || (overlayDef ? overlayPaneLabel(overlayDef) : type);
  const defaultH = type === "ha" ? 100 : SUB_CHART_HEIGHT;

  return (
    <div
      // Same chrome as the Charts tab (ChartPane SubIndicatorChart): strong top
      // rule, drag-resize handle, expand/hide/close buttons, double-click expands.
      className={`relative w-full border-t-2 border-border/80 bg-white/[0.015] ${isMaximized ? "flex-1 min-h-0" : "flex-shrink-0"}`}
      style={isMaximized ? undefined : { height: height ?? defaultH }}
      onDoubleClick={(e) => { e.stopPropagation(); onToggleMaximize?.(); }}
      onMouseLeave={() => setHoverReadout(null)}
      data-testid={`pairs-sub-indicator-${type}`}
    >
      {/* Drag the top border to resize this subplot (hidden while expanded). */}
      {!isMaximized && onResizeStart && (
        <div
          className="absolute -top-1 left-0 right-0 h-2 z-20 group"
          style={{ cursor: "row-resize" }}
          onMouseDown={(e) => onResizeStart(defaultH, e)}
          data-testid={`pairs-sub-indicator-${type}-resize`}
        >
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-transparent group-hover:bg-primary/60 transition-colors" />
        </div>
      )}
      <div className="absolute left-2 z-10 mt-0.5">
        <span className="text-[9px] font-mono text-muted-foreground/80 bg-background/90 border border-border/50 px-1 py-0.5 rounded">
          {label}
        </span>
      </div>
      <div className="absolute right-1.5 top-0.5 z-10 flex items-center gap-0.5">
        {onToggleMaximize && (
          <button
            className="text-muted-foreground/50 hover:text-foreground bg-background/80 rounded p-0.5"
            onClick={(e) => { e.stopPropagation(); onToggleMaximize(); }}
            title={isMaximized ? "Restore" : "Expand full pane"}
            data-testid={`pairs-sub-indicator-${type}-maximize`}
          >
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        )}
        {onHide && (
          <button
            className="text-muted-foreground/50 hover:text-foreground bg-background/80 rounded p-0.5"
            onClick={(e) => { e.stopPropagation(); onHide(); }}
            title={`Hide ${label} (keeps its settings — bring it back from the Indicators panel)`}
            data-testid={`pairs-sub-indicator-${type}-hide`}
          >
            <EyeOff className="w-3 h-3" />
          </button>
        )}
        {onClose && (
          <button
            className="text-muted-foreground/50 hover:text-destructive bg-background/80 rounded p-0.5"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            title={`Remove ${label} from this chart`}
            data-testid={`pairs-sub-indicator-${type}-close`}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {hoverReadout && hoverReadout.items.length > 0 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0.5 z-20 flex items-center gap-2 text-[9px] font-mono tabular-nums bg-background/85 px-1.5 py-0.5 rounded pointer-events-none max-w-[calc(100%-6rem)] overflow-hidden"
          data-testid={`pairs-sub-${type}-readout`}
        >
          {hoverReadout.items.map((it, i) => (
            <span key={i} className="whitespace-nowrap">
              <span style={{ color: it.color }}>{it.label}</span>{" "}
              <span className="text-foreground font-semibold">{fmtReadoutVal(it.value)}</span>
            </span>
          ))}
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

// ── MiniChart with indicator support + maximize button ──
// Exported for the Pair Ratios detail view. `data` may contain null values
// (warm-up bars) — they render as whitespace so several charts share one
// logical axis; indicators compute on the finite subset.
export function MiniChart({
  data: dataProp,
  title,
  color,
  height,
  useFlexHeight,
  refLines,
  refBands,
  secondaryData: secondaryDataProp,
  secondaryColor,
  secondaryLabel,
  id,
  activeIndicators,
  onMaximize,
  isMaximized,
  onRegisterChart,
  onUnregisterChart,
  onRegisterSeries,
  onCrosshairMove,
  onRemove,
  onChangeIndicators,
}: {
  data: { time: string; value: number | null }[];
  title: string;
  color: string;
  height: number;
  useFlexHeight?: boolean;
  refLines?: { value: number; color: string; style: number; label?: string }[];
  refBands?: { data: DataPoint[]; color: string; style: number; label?: string }[];
  secondaryData?: DataPoint[];
  secondaryColor?: string;
  secondaryLabel?: string;
  id: string;
  activeIndicators: ActiveIndicators;
  onMaximize: (id: string | null) => void;
  isMaximized: boolean;
  onRegisterChart: (id: string, chart: IChartApi, dataLength?: number) => void;
  onUnregisterChart: (id: string) => void;
  onRegisterSeries: (id: string, series: ISeriesApi<any>) => void;
  onCrosshairMove?: (id: string, data: { time: string; values: Record<string, number> } | null) => void;
  onRemove?: () => void;
  /** Enables the sub-panes' hide/close buttons (they mutate this chart's
   *  ActiveIndicators — same contract as the Charts tab's ChartArea). */
  onChangeIndicators?: (i: ActiveIndicators) => void;
}) {
  const effectiveFlexHeight = useFlexHeight || isMaximized;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { colors: IC } = useIndicatorColors();
  const gridColor = useGridColor("rgba(255,255,255,0.04)");
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  // Per-plot crosshair readout (same as ChartPane on the Charts tab): this
  // chart's own series values at the hovered time, shown inside the plot.
  const [hoverReadout, setHoverReadout] = useState<{
    time: string;
    items: { label: string; value: number; color: string }[];
  } | null>(null);
  const [logScale, setLogScale] = useState(false);
  // Per-chart display frequency (Charts-pane parity): downsample this chart's
  // main + secondary series to weekly/monthly period-end points. Pair charts
  // are daily-based, so W/M always resample. Ref bands stay at native
  // resolution (context lines). Shadows the props so the whole body — chart
  // series, indicators, fingerprints — rides the downsampled data.
  const [chartFreq, setChartFreq] = useState<"chart" | "weekly" | "monthly">("chart");
  const data = useMemo(
    () => (chartFreq === "chart" ? dataProp : (downsampleSeries(dataProp as any, chartFreq) as typeof dataProp)),
    [dataProp, chartFreq],
  );
  const secondaryData = useMemo(
    () =>
      secondaryDataProp && chartFreq !== "chart"
        ? (downsampleSeries(secondaryDataProp as any, chartFreq) as typeof secondaryDataProp)
        : secondaryDataProp,
    [secondaryDataProp, chartFreq],
  );
  const [chrome] = useChartChrome();
  // Counter that increments when chart + main series are ready, to trigger re-render
  // so sub-charts receive the actual parentChart/parentSeries refs (not null).
  const [chartReady, setChartReady] = useState(0);
  // Fingerprint of the underlying data. The effect below rebuilds the whole chart
  // on any dep change (indicator toggle, theme, maximize, …); without this we would
  // fitContent() every time and snap the user's pan/zoom back to full range — the
  // "scroll bounce-back" the Charts tab (ChartPane) guards against the same way.
  const dataFpRef = useRef<string>("");
  // Last visible range, captured in this effect's CLEANUP (which runs before the
  // next re-run and has already been where the chart is disposed) so it survives
  // the teardown/rebuild and can be restored below.
  const savedRangeRef = useRef<ReturnType<ReturnType<IChartApi["timeScale"]>["getVisibleLogicalRange"]> | null>(null);

  // Serialize activeIndicators to a stable string so the effect only fires when values actually change
  const indicatorsKey = useMemo(() => JSON.stringify(activeIndicators), [activeIndicators]);

  // Null warm-up values render as whitespace on the main series (shared axis);
  // every indicator/pattern/fractal computation runs on the finite subset.
  const finiteData: DataPoint[] = useMemo(
    () => data.filter((d): d is DataPoint => d.value != null && Number.isFinite(d.value)),
    [data],
  );

  // ── Pattern Recognition (same engine + window-event bus as ChartPane, keyed
  // by this chart's string id). Settings live in localStorage; a nonce forces
  // recomputation on settings-changed / rescan for this chart.
  const [patternNonce, setPatternNonce] = useState(0);
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent).detail?.paneId === id) setPatternNonce((x) => x + 1);
    };
    window.addEventListener("reit-viz:patterns-settings-changed", onChange);
    window.addEventListener("reit-viz:patterns-rescan", onChange);
    return () => {
      window.removeEventListener("reit-viz:patterns-settings-changed", onChange);
      window.removeEventListener("reit-viz:patterns-rescan", onChange);
    };
  }, [id]);

  const patternResults = useMemo(() => {
    const s = getPatternSettings(id);
    // Pairs plots are line series — detect on flat bars (o=h=l=c), the same
    // degradation every other OHLC consumer on this page uses.
    const flat = finiteData.map((d) => ({ time: String(d.time), open: d.value, high: d.value, low: d.value, close: d.value }));
    const empty = { patterns: [] as ReturnType<typeof detectChartPatterns>, relevant: [] as any[], bars: flat };
    if (!s.enabled) return empty;
    let detectionBars = flat;
    const tf = s.timeframe;
    if ((tf === "weekly" || tf === "monthly") && flat.length > 0) {
      try {
        const ds = weeklyDownsample(
          {
            dates: flat.map((b) => b.time),
            closes: flat.map((b) => b.close),
            adjCloses: flat.map((b) => b.close),
            highs: flat.map((b) => b.high),
            lows: flat.map((b) => b.low),
            opens: flat.map((b) => b.open),
          },
          tf,
        );
        detectionBars = ds.dates.map((d: string, i: number) => ({
          time: d, open: ds.opens[i], high: ds.highs[i], low: ds.lows[i], close: ds.closes[i],
        }));
      } catch { detectionBars = flat; }
    }
    if (detectionBars.length < 40) return { ...empty, bars: detectionBars };
    let patterns: ReturnType<typeof detectChartPatterns> = [];
    try {
      patterns = detectChartPatterns(detectionBars, {
        sensitivity: s.sensitivity, lookbackBars: s.lookbackBars, maxPatterns: s.maxPatterns, perPattern: s.perPattern,
      });
    } catch { patterns = []; }
    const relevant = s.showMostRelevant
      ? rankRelevance(patterns, detectionBars, s.lookbackBars).slice(0, 5).map((p) => ({
          id: `${p.key}-${p.endIdx}`,
          label: p.label,
          direction: p.direction,
          relevance: p.relevance ?? 0,
          components: p.components ?? { confidence: 0, recency: 0, proximity: 0 },
        }))
      : [];
    return { patterns, relevant, bars: detectionBars };
    // patternNonce forces re-read of localStorage settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finiteData, id, patternNonce]);

  // Publish results to the PatternsPanel (badge count + most-relevant list).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("reit-viz:patterns-detected", { detail: { paneId: id, patterns: patternResults.patterns } }));
    window.dispatchEvent(new CustomEvent("reit-viz:patterns-most-relevant", { detail: { paneId: id, relevant: patternResults.relevant } }));
  }, [patternResults, id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Defensive: React's cleanup normally disposes the old chart before this runs.
    if (chartRef.current) {
      onUnregisterChart(id);
      chartRef.current.remove();
      chartRef.current = null;
    }
    // Only reframe (fitContent) when the underlying data changes; otherwise restore
    // the pre-rebuild view so indicator/theme/maximize toggles don't snap pan/zoom
    // back to full range — the "scroll bounce-back" ChartPane guards against too.
    const dataFp =
      `${data.length}:${data[0]?.time ?? ""}:${data[data.length - 1]?.time ?? ""}:${data[data.length - 1]?.value ?? ""}` +
      `|sec:${secondaryData?.length ?? 0}:${secondaryData?.[secondaryData.length - 1]?.time ?? ""}`;
    const dataChanged = dataFp !== dataFpRef.current;
    dataFpRef.current = dataFp;

    const chart = createChart(el, {
      ...CHART_OPTIONS,
      grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
      width: el.clientWidth,
      height: effectiveFlexHeight ? el.clientHeight || 300 : height,
    });
    chartRef.current = chart;
    onRegisterChart(id, chart, data.length);
    try { (((window as any).__pairsCharts ||= new Set()) as Set<unknown>).add(chart); } catch {} // e2e hook (same pattern as ChartArea's __chartsPanes)

    // Record every series created so the global Labels/Px-line preference can
    // be applied at the end without touching each addSeries site.
    const createdSeries: ISeriesApi<any>[] = [];
    {
      const origAdd = chart.addSeries.bind(chart);
      (chart as any).addSeries = (...args: unknown[]) => {
        const s = (origAdd as any)(...args);
        createdSeries.push(s);
        return s;
      };
    }

    // Labels/colors for the in-plot readout, for principal series with no title.
    const readoutMeta = new Map<unknown, { label: string; color: string }>();

    // Main series
    const mainSeries = chart.addSeries(LineSeries, {
      color,
      lineWidth: 1.5 as LineWidth,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 3,
    });
    mainSeries.setData(data.map((d) => (d.value == null ? { time: d.time as Time } : { time: d.time as Time, value: d.value })));
    mainSeriesRef.current = mainSeries;
    onRegisterSeries(id, mainSeries);
    readoutMeta.set(mainSeries, { label: title, color });
    // Signal sub-charts that parentChart/parentSeries refs are now set
    setChartReady(c => c + 1);

    // Secondary series
    if (secondaryData && secondaryColor) {
      const sec = chart.addSeries(LineSeries, {
        color: secondaryColor,
        lineWidth: 1.5 as LineWidth,
        priceLineVisible: false,
        lastValueVisible: true,
        priceScaleId: "right2",
      });
      sec.setData(secondaryData.map((d) => ({ time: d.time as Time, value: d.value })));
      sec.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
      readoutMeta.set(sec, { label: secondaryLabel || "Secondary", color: secondaryColor });
    }

    // Reference lines
    if (refLines) {
      for (const rl of refLines) {
        const refSeries = chart.addSeries(LineSeries, {
          color: rl.color,
          lineWidth: 1,
          lineStyle: rl.style,
          title: rl.label || "",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        if (data.length >= 2) {
          refSeries.setData([
            { time: data[0].time as Time, value: rl.value },
            { time: data[data.length - 1].time as Time, value: rl.value },
          ]);
        }
      }
    }

    // Reference bands (expanding envelopes)
    if (refBands) {
      for (const rb of refBands) {
        if (!rb.data || rb.data.length < 2) continue;
        const bandSeries = chart.addSeries(LineSeries, {
          color: rb.color,
          lineWidth: 1,
          lineStyle: rb.style,
          title: rb.label || "",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        bandSeries.setData(rb.data.map((d) => ({ time: d.time as Time, value: d.value })));
      }
    }

    // ── Indicators on main data ──
    if (finiteData.length > 0) {
      // Shadow: every indicator/overlay/fractal computation in this block runs
      // on the finite subset (null warm-up bars excluded).
      const data = finiteData;
      // Per-instance MA compute frequency (Charts parity): each MA line carries
      // its own frequency, so the same period can appear at multiple frequencies
      // (e.g. SMA 200 daily AND 200 weekly). weekly/monthly resample the series
      // first — points land on period-end dates of the axis.
      const maFreqSrcCache: Partial<Record<"weekly" | "monthly", typeof data>> = {};
      const maSourceFor = (freq: MaLine["f"]): { src: typeof data; suffix: string } => {
        if (freq !== "weekly" && freq !== "monthly") return { src: data, suffix: "" };
        if (!maFreqSrcCache[freq]) {
          maFreqSrcCache[freq] = resampleIndicatorBars(
            data.map((d) => ({ time: String(d.time), open: d.value, high: d.value, low: d.value, close: d.value })),
            freq,
          ).map((b) => ({ time: b.time, value: b.close })) as typeof data;
        }
        return { src: maFreqSrcCache[freq]!, suffix: freq === "weekly" ? "W" : "M" };
      };
      // SMA (one line per instance)
      for (const { p, f } of getMaLines(activeIndicators, "sma")) {
        const { src, suffix } = maSourceFor(f);
        const smaData = computeSMA(src, p);
        if (smaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.sma, lineWidth: 1,
            title: `SMA ${p}${suffix}`, lineStyle: LineStyle.Dashed,
          });
          s.setData(smaData.map(d => ({ time: d.time as Time, value: d.value })));
        }
      }
      // EMA (one line per instance)
      for (const { p, f } of getMaLines(activeIndicators, "ema")) {
        const { src, suffix } = maSourceFor(f);
        const emaData = computeEMA(src, p);
        if (emaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.ema, lineWidth: 1,
            title: `EMA ${p}${suffix}`,
          });
          s.setData(emaData.map(d => ({ time: d.time as Time, value: d.value })));
        }
      }
      // HMA (one line per instance)
      for (const { p, f } of getMaLines(activeIndicators, "hma")) {
        const { src, suffix } = maSourceFor(f);
        const hmaData = computeHMA(src, p);
        if (hmaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.hma, lineWidth: 2,
            title: `HMA ${p}${suffix}`,
          });
          s.setData(hmaData.map(d => ({ time: d.time as Time, value: d.value })));
        }
      }
      // Extended MAs (WMA/DEMA/TEMA/KAMA/FRAMA/T3/ALMA/LSMA/SLSMA) — same
      // engine + colors as the Charts tab.
      {
        const EXTRA_MA: Array<[MaKey, MaType, number]> = [
          ["wma", "WMA", 1], ["dema", "DEMA", 2], ["tema", "TEMA", 2],
          ["kama", "KAMA", 2], ["frama", "FRAMA", 2], ["t3", "T3", 2],
          ["alma", "ALMA", 1], ["lsma", "LSMA", 1], ["slsma", "SLSMA", 2],
        ];
        for (const [field, maType, width] of EXTRA_MA) {
          for (const { p, f } of getMaLines(activeIndicators, field)) {
            const { src, suffix } = maSourceFor(f);
            const srcVals = src.map((d) => d.value);
            const series = computeMaByType(srcVals, p, maType);
            const maData: { time: Time; value: number }[] = [];
            for (let i = 0; i < src.length; i++) {
              const v = series[i];
              if (v != null && Number.isFinite(v)) maData.push({ time: src[i].time as Time, value: v });
            }
            if (maData.length > 0) {
              const s = chart.addSeries(LineSeries, {
                color: (IC as any)[field] ?? "#94a3b8",
                lineWidth: width as LineWidth,
                title: `${maType} ${p}${suffix}`,
              });
              s.setData(maData);
            }
          }
        }
      }
      // NOTE: RSI, MACD, Stochastic, ROC, ATR, OBV are now rendered in separate sub-panes below (PairsSubIndicatorChart)
      // Mean ± Std
      if (activeIndicators.mean) {
        const { rolling, period } = activeIndicators.mean;
        if (rolling) {
          const rb = computeRollingMeanBands(data, period);
          if (rb.mean.length > 0) {
            const ml = chart.addSeries(LineSeries, {
              color: IC.mean, lineWidth: 1,
              title: `Rolling Mean ${period}`, lineStyle: LineStyle.LargeDashed,
            });
            ml.setData(rb.mean.map(d => ({ time: d.time as Time, value: d.value })));
            for (const b of rb.bands) {
              const bs = chart.addSeries(LineSeries, {
                color: Math.abs(b.mult) === 1 ? "rgba(99,102,241,0.4)" : "rgba(99,102,241,0.25)",
                lineWidth: 1, title: `${b.mult > 0 ? "+" : ""}${b.mult}σ`,
                lineStyle: LineStyle.Dotted,
              });
              bs.setData(b.data.map(d => ({ time: d.time as Time, value: d.value })));
            }
          }
        } else {
          const subset = period < data.length ? data.slice(-period) : data;
          const stats = computeMeanAndStdBands(subset);
          if (subset.length >= 2) {
            const first = subset[0].time as Time;
            const last = subset[subset.length - 1].time as Time;
            const meanLine = chart.addSeries(LineSeries, {
              color: IC.mean, lineWidth: 1,
              title: `Mean (${stats.mean.toFixed(2)}) [${period}d]`,
              lineStyle: LineStyle.LargeDashed,
            });
            meanLine.setData([{ time: first, value: stats.mean }, { time: last, value: stats.mean }]);
            for (const mult of [1, -1, 2, -2]) {
              const band = chart.addSeries(LineSeries, {
                color: Math.abs(mult) === 1 ? "rgba(99,102,241,0.4)" : "rgba(99,102,241,0.25)",
                lineWidth: 1, title: `${mult > 0 ? "+" : ""}${mult}σ`,
                lineStyle: LineStyle.Dotted,
              });
              band.setData([
                { time: first, value: stats.mean + mult * stats.std },
                { time: last, value: stats.mean + mult * stats.std },
              ]);
            }
          }
        }
      }
      // Bollinger Bands (overlay) — one band set per instance (period/σ ×
      // own compute frequency; Charts parity)
      getInstances(activeIndicators, "bollinger").forEach((inst, bi) => {
        const bbP = typeof inst.params.period === "number" ? inst.params.period : 20;
        const bbM = typeof inst.params.mult === "number" ? inst.params.mult : 2;
        const { src, suffix } = maSourceFor(inst.freq ?? "chart");
        const bb = computeBollingerBands(src, bbP, bbM);
        if (bb.basis.length > 0) {
          const basisLine = chart.addSeries(LineSeries, {
            color: shadePairs(IC.bollinger_basis, bi), lineWidth: 1,
            title: `BB ${bbP},${bbM}${suffix}`, lineStyle: LineStyle.LargeDashed,
          });
          basisLine.setData(bb.basis.map(d => ({ time: d.time as Time, value: d.value })));
          const upperLine = chart.addSeries(LineSeries, {
            color: shadePairs(IC.bollinger_band, bi), lineWidth: 1,
            title: suffix ? `Upper ${suffix}` : `Upper`, lineStyle: LineStyle.Dotted,
          });
          upperLine.setData(bb.upper.map(d => ({ time: d.time as Time, value: d.value })));
          const lowerLine = chart.addSeries(LineSeries, {
            color: shadePairs(IC.bollinger_band, bi), lineWidth: 1,
            title: suffix ? `Lower ${suffix}` : `Lower`, lineStyle: LineStyle.Dotted,
          });
          lowerLine.setData(bb.lower.map(d => ({ time: d.time as Time, value: d.value })));
        }
      });
      // VWAP (overlay)
      if (activeIndicators.vwap) {
        const vwapData = computeVWAP(data);
        if (vwapData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.vwap, lineWidth: 1,
            title: "VWAP", lineStyle: LineStyle.LargeDashed,
          });
          s.setData(vwapData.map(d => ({ time: d.time as Time, value: d.value })));
        }
      }
      // ATR, ROC, Stochastic, OBV → rendered in sub-panes below

      // Heikin-Ashi candlestick overlay (rendered inside main chart for perfect crosshair alignment)
      if (activeIndicators.heikinAshi) {
        const haSmoothing: HASmoothConfig | undefined =
          typeof activeIndicators.heikinAshi === "object" ? activeIndicators.heikinAshi : undefined;
        const haCandles = computeHeikinAshi(data, haSmoothing);
        if (haCandles.length > 0) {
          const haSeries = chart.addSeries(CandlestickSeries, {
            upColor: IC.ha_up,
            downColor: IC.ha_down,
            borderUpColor: IC.ha_up,
            borderDownColor: IC.ha_down,
            wickUpColor: IC.ha_up,
            wickDownColor: IC.ha_down,
            title: "HA",
          });
          haSeries.setData(
            haCandles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }))
          );
        }
      }

      // Registry-driven overlays (Supertrend, PSAR, Keltner, Donchian, Ichimoku) —
      // same registry as the Charts tab, computed on flat bars from the line
      // data. One render per INSTANCE (own params + freq + hiddenParts);
      // extra instances get shaded line colors.
      {
        const overlayBars = lineToBars(data);
        // One resample per frequency, shared across overlay defs.
        const ovlBarsCache: Partial<Record<"weekly" | "monthly", OhlcBar[]>> = {};
        for (const def of ALL_REGISTRY_INDICATORS) {
          if (def.renderTarget !== "overlay" || !def.renderOverlay) continue;
          getInstances(activeIndicators, def.id).forEach((inst, ii) => {
            const f = inst.freq === "weekly" || inst.freq === "monthly" ? inst.freq : undefined;
            const defBars = f ? (ovlBarsCache[f] ??= resampleIndicatorBars(overlayBars, f)) : overlayBars;
            const regSt: RegistryIndicatorState = { enabled: true, params: inst.params };
            const p = resolveParams(def, regSt);
            try {
              const colors =
                ii === 0
                  ? (IC as unknown as Record<string, string>)
                  : Object.fromEntries(
                      Object.entries(IC as unknown as Record<string, string>).map(([k, v]) =>
                        def.colorKeys.includes(k) ? [k, shadePairs(v, ii)] : [k, v],
                      ),
                    );
              def.renderOverlay!(
                {
                  chart,
                  colors,
                  baseLabel: f ? freqSuffix(f) : "",
                  register: () => {},
                  ...(def.components?.length ? { hiddenParts: new Set(inst.hiddenParts ?? []) } : {}),
                },
                defBars,
                p,
              );
            } catch { /* one bad indicator must not kill the chart */ }
          });
        }
      }

      // ── Fractal trendlines (DojiEmoji auto-trendline) — same engine as the
      // Charts tab, run on the line values (pivots of the ratio/z series).
      if (activeIndicators.fractalLines) {
        const { n, anchorDate, timeframe } = activeIndicators.fractalLines;
        const daily = data.map((d) => ({ time: String(d.time), high: d.value, low: d.value }));
        const frBars =
          timeframe === "weekly" ? resampleWeekly(daily)
          : timeframe === "monthly" ? resampleMonthly(daily)
          : daily;
        const fr = computeFractalTrendlines(frBars, n, anchorDate);
        const tfLabel = timeframe === "weekly" ? ", W" : timeframe === "monthly" ? ", M" : "";
        const anchorLabel = anchorDate ? ` @ ${anchorDate}` : "";
        const drawFractal = (line: typeof fr.resistance, lineColor: string, label: string) => {
          if (!line || line.points.length < 2) return;
          const s = chart.addSeries(LineSeries, {
            color: lineColor,
            lineWidth: 4,
            lineStyle: LineStyle.Solid,
            title: label,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            pointMarkersVisible: true,
            pointMarkersRadius: 4,
            autoscaleInfoProvider: () => null,
          });
          s.setData(line.points.map((p) => ({ time: p.time as Time, value: p.value })));
        };
        drawFractal(fr.resistance, IC.fractal_resistance, `Fractal R (n${fr.n}${tfLabel})${anchorLabel}`);
        drawFractal(fr.support, IC.fractal_support, `Fractal S (n${fr.n}${tfLabel})${anchorLabel}`);
      }

      // ── Chart patterns (Pattern Recognition) — polylines index into the SAME
      // (possibly weekly/monthly-resampled) bars detection ran on.
      if (patternResults.patterns.length && patternResults.bars.length) {
        const timeAt = (idx: number) => patternResults.bars[idx]?.time;
        for (const pat of patternResults.patterns) {
          const patColor = pat.direction > 0 ? "#26a69a" : pat.direction < 0 ? "#ef5350" : "#3b82f6";
          let labelSeries: ISeriesApi<any> | null = null;
          for (const ln of pat.lines) {
            const lnData = ln.points
              .map((p) => ({ time: timeAt(p.idx) as Time, value: p.price }))
              .filter((d) => d.time != null)
              .sort((a, b) => String(a.time).localeCompare(String(b.time)));
            if (lnData.length < 2) continue;
            const s = chart.addSeries(LineSeries, {
              color: patColor,
              lineWidth: 2,
              lineStyle: ln.dashed ? LineStyle.Dashed : LineStyle.Solid,
              title: "",
              crosshairMarkerVisible: false,
              lastValueVisible: false,
              priceLineVisible: false,
              pointMarkersVisible: true,
              pointMarkersRadius: 3,
              autoscaleInfoProvider: () => null,
            });
            s.setData(lnData);
            if (!labelSeries) labelSeries = s;
          }
          if (labelSeries) {
            const endTime = timeAt(pat.endIdx);
            if (endTime) {
              try {
                createSeriesMarkers(labelSeries, [{
                  time: endTime as Time,
                  position: pat.direction < 0 ? "aboveBar" : "belowBar",
                  color: patColor,
                  shape: pat.direction > 0 ? "arrowUp" : pat.direction < 0 ? "arrowDown" : "circle",
                  text: pat.label,
                }] as any);
              } catch {}
            }
          }
        }
      }

      // HA Signal markers on main series
      if (activeIndicators.haSignals && mainSeries) {
        const haSmooth2: HASmoothConfig | undefined =
          typeof activeIndicators.heikinAshi === "object" ? activeIndicators.heikinAshi : undefined;
        const signals = computeHASignals(data, haSmooth2);
        if (signals.length > 0) {
          const signalMarkers = signals.map(s => ({
            time: s.time as Time,
            position: (s.direction === "bullish" ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
            color: s.direction === "bullish" ? IC.ha_signal_bull : IC.ha_signal_bear,
            shape: (s.direction === "bullish" ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
            text: s.direction === "bullish" ? "▲" : "▼",
          }));
          signalMarkers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
          try {
            createSeriesMarkers(mainSeries, signalMarkers);
          } catch (e) {
            console.warn("Failed to create HA signal markers in Pairs MiniChart:", e);
          }
        }
      }
    }

    // Crosshair value reporting + in-plot readout
    const crosshairCb = (param: any) => {
      if (!param.time || !param.seriesData) {
        onCrosshairMove?.(id, null);
        setHoverReadout(null);
        return;
      }
      const values: Record<string, number> = {};
      const items: { label: string; value: number; color: string }[] = [];
      const seen = new Set<string>();
      param.seriesData.forEach((dataPoint: any, series: any) => {
        const val = dataPoint?.value ?? dataPoint?.close;
        if (val !== undefined && val !== null) {
          const opts = series.options?.() ?? {};
          const seriesTitle = opts.title || title;
          values[seriesTitle || title] = val;
          // Readout: principal series via readoutMeta, otherwise titled series
          // only (ref/band helper lines have title "")
          const meta = readoutMeta.get(series);
          const label = meta?.label || opts.title;
          if (label && !seen.has(label)) {
            seen.add(label);
            items.push({ label, value: val, color: meta?.color || opts.color || "#e2e8f0" });
          }
        }
      });
      if (Object.keys(values).length > 0) {
        onCrosshairMove?.(id, { time: String(param.time), values });
      }
      setHoverReadout(items.length > 0 ? { time: String(param.time), items } : null);
    };
    chart.subscribeCrosshairMove(crosshairCb);

    // Reframe only on a real data change (new pair / metric / refresh); otherwise
    // restore the pre-rebuild view so pan/zoom/scroll survive indicator & UI toggles.
    if (dataChanged || !savedRangeRef.current) {
      chart.timeScale().fitContent();
      // Flex containers can report a narrow width at mount, clamping this fit
      // to a tail window (and de-syncing sibling charts); refit once after
      // layout settles.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (chartRef.current === chart) {
          try { chart.timeScale().fitContent(); } catch {}
        }
      }));
    } else {
      try { chart.timeScale().setVisibleLogicalRange(savedRangeRef.current); }
      catch { chart.timeScale().fitContent(); }
    }

    // Global Labels/Px-line preference — OFF state only; toggling back on
    // recreates the chart with original options (chrome in deps).
    if (!chrome.axisLabels || !chrome.priceLines) {
      for (const s of createdSeries) {
        setSeriesAxisLabels(s, chrome.axisLabels, chrome.priceLines ? undefined : false);
      }
    }

    const ro = new ResizeObserver(() => {
      // clientWidth is 0 while a sub-pane is expanded (main plot display:none) —
      // don't collapse the chart to zero, just skip until it's visible again.
      if (chartRef.current && el && el.clientWidth > 0) {
        chartRef.current.applyOptions({
          width: el.clientWidth,
          height: effectiveFlexHeight ? el.clientHeight || 300 : height,
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      // Save the current view so the next rebuild (indicator/theme/maximize toggle)
      // can restore it instead of fitting to full range.
      try {
        const r = chart.timeScale().getVisibleLogicalRange();
        if (r) savedRangeRef.current = r;
      } catch {}
      try { chart.unsubscribeCrosshairMove(crosshairCb); } catch {}
      onCrosshairMove?.(id, null);
      setHoverReadout(null);
      onUnregisterChart(id);
      try { ((window as any).__pairsCharts as Set<unknown> | undefined)?.delete(chart); } catch {}
      chart.remove();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, secondaryData, color, secondaryColor, height, id, indicatorsKey, isMaximized, effectiveFlexHeight, IC, refBands, gridColor, chrome, patternResults]);

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

  // Full axis (incl. whitespace warm-up bars) for the sub-panes' spacer, so
  // their logical axes stay identical to the parent's.
  const axisTimes = useMemo(() => data.map((d) => String(d.time)), [data]);

  // Hidden sub-panes unmount (state stays enabled) — same as the Charts tab.
  // Memoized: the descriptors' instance arrays flow into the sub-chart
  // effect's deps — fresh arrays every render would recreate every sub-chart.
  const subPaneDescs = useMemo(() => getActiveSubPanes(activeIndicators), [activeIndicators]);
  const hiddenSubSet = new Set(activeIndicators.hiddenSubCharts ?? []);
  const subPanes = subPaneDescs.filter((d) => !hiddenSubSet.has(d.subKey));

  // Shared per-frequency resample cache for every sub-pane instance (five
  // weekly indicators cost ONE weekly resample). Pairs plots are line data —
  // no real OHLC, so the cache only serves closes.
  const freqSources = useMemo(
    () => makeFreqSourceCache(finiteData.map((d) => ({ time: String(d.time), value: d.value })), []),
    [finiteData],
  );

  // Which sub-pane is expanded to fill the plot (null = none) + per-sub-pane
  // drag heights — mirrors ChartPane's maxSub/subHeights/startSubResize.
  const [maxSub, setMaxSub] = useState<PairsSubChartType | null>(null);
  const [subHeights, setSubHeights] = useState<Partial<Record<string, number>>>({});
  const effMaxSub = maxSub !== null && subPanes.some((d) => d.subKey === maxSub) ? maxSub : null;
  const startSubResize = useCallback((type: string, defaultH: number, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = subHeights[type] ?? defaultH;
    const onMove = (ev: globalThis.MouseEvent) => {
      // Dragging up (smaller clientY) grows the subplot; the flex main chart absorbs the delta.
      const next = Math.max(48, Math.min(600, startH + (startY - ev.clientY)));
      setSubHeights((prev) => ({ ...prev, [type]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "row-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [subHeights]);

  // ✕ on a sub-pane: drop just that pane GROUP's instances (same mapping as
  // the Charts tab) — setInstances keeps the legacy fields in sync, so
  // closing the last RSI pane clears rsi + rsiFreq and closing the last
  // registry pane flips registry[id].enabled off.
  const closeSub = useCallback((t: PairsSubChartType) => {
    if (!onChangeIndicators) return;
    let next = { ...activeIndicators };
    if (t.startsWith("ovl:")) {
      const oid = t.slice(4);
      next.indicatorOverlays = (next.indicatorOverlays ?? []).filter((o) => o.id !== oid);
      if (!next.indicatorOverlays.length) delete next.indicatorOverlays;
    } else {
      const { baseId, group } = parseSubChartKey(stripReg(t));
      next = setInstances(next, baseId, getInstances(next, baseId).filter((i) => effGroup(i) !== group));
    }
    if (next.hiddenSubCharts?.includes(t)) {
      const rest = next.hiddenSubCharts.filter((x) => x !== t);
      next.hiddenSubCharts = rest.length ? rest : undefined;
    }
    onChangeIndicators(next);
  }, [onChangeIndicators, activeIndicators]);

  // Eye on a sub-pane: hide it but keep the indicator's settings (restore from
  // the Indicators panel's "Hidden Sub-Panes" row).
  const hideSub = useCallback((t: PairsSubChartType) => {
    if (!onChangeIndicators) return;
    const hidden = activeIndicators.hiddenSubCharts ?? [];
    const nextHidden = hidden.includes(t) ? hidden.filter((x) => x !== t) : [...hidden, t];
    onChangeIndicators({ ...activeIndicators, hiddenSubCharts: nextHidden.length ? nextHidden : undefined });
  }, [onChangeIndicators, activeIndicators]);

  // Source sub-panes publish their displayed primary series; derived overlay
  // panes ("ovl:<id>") read it — see the Charts-tab pane-overlay machinery.
  const subPrimaryRef = useRef(new Map<string, DataPoint[]>());
  const [, setSubPrimaryVer] = useState(0);
  const handleSubPrimaryData = useCallback((t: string, data: DataPoint[]) => {
    const sig = (d: DataPoint[]) =>
      d.length ? `${d.length}:${String(d[0].time)}:${String(d[d.length - 1].time)}:${d[d.length - 1].value}` : "0";
    const prev = subPrimaryRef.current.get(t);
    if (prev && sig(prev) === sig(data)) return;
    subPrimaryRef.current.set(t, data);
    setSubPrimaryVer((v) => v + 1);
  }, []);

  return (
    <div
      className={`flex flex-col ${
        isMaximized
          ? "fixed inset-0 z-50 bg-background"
          : effectiveFlexHeight
            ? "w-full h-full border border-border/30 min-h-0 overflow-hidden"
            : "border-b border-border/30"
      }`}
      onDoubleClick={() => onMaximize(isMaximized ? null : id)}
    >
      <div className="flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        {secondaryLabel && (
          <span className="text-[10px] text-muted-foreground/60">
            {secondaryLabel}
          </span>
        )}
        <div className="flex-1" />
        {/* Per-chart display frequency (daily source -> weekly/monthly bars) */}
        <div className="flex items-center gap-px" onClick={(e) => e.stopPropagation()}>
          {(["chart", "weekly", "monthly"] as const).map((f) => (
            <button
              key={f}
              className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded transition-colors ${
                chartFreq === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground/60 hover:text-muted-foreground bg-transparent"
              }`}
              onClick={() => setChartFreq(f)}
              title={f === "chart" ? "Native (daily) bars" : `Downsample this chart to ${f === "weekly" ? "weekly" : "calendar-month"} period-end bars`}
              data-testid={`pairs-chart-${id}-freq-${f}`}
            >
              {f === "chart" ? "D" : f === "weekly" ? "W" : "M"}
            </button>
          ))}
        </div>
        <button
          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${
            logScale
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground/60 hover:text-muted-foreground bg-transparent"
          }`}
          onClick={(e) => { e.stopPropagation(); setLogScale(!logScale); }}
          title="Toggle logarithmic scale"
          data-testid={`pairs-chart-${id}-log`}
        >
          LOG
        </button>
        <div onClick={(e) => e.stopPropagation()}>
          <ExportMenu
            getChart={() => chartRef.current}
            label={`Pairs_${title}`}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={(e) => { e.stopPropagation(); onMaximize(isMaximized ? null : id); }}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </Button>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            title="Remove plot"
            data-testid={`pairs-chart-${id}-remove`}
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>
      {/* lightweight-charts does not reliably emit a final crosshairMove on
          pointer exit, so clear the readout on DOM mouseleave (as ChartPane does). */}
      <div
        style={effMaxSub ? undefined : effectiveFlexHeight ? { flex: 1 } : { height }}
        className={`relative ${effMaxSub ? "hidden" : effectiveFlexHeight ? "flex-1 min-h-0" : ""}`}
        onMouseLeave={() => setHoverReadout(null)}
      >
        <div ref={containerRef} className="w-full h-full" />
        {/* In-plot crosshair readout (same style as the Charts tab panes) */}
        {hoverReadout && hoverReadout.items.length > 0 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-1.5 z-20 flex items-center gap-2 text-[10px] font-mono tabular-nums bg-background/85 px-1.5 py-0.5 rounded pointer-events-none max-w-[calc(100%-1rem)] overflow-hidden"
            data-testid={`pairs-chart-${id}-readout`}
          >
            <span className="text-muted-foreground/70">{hoverReadout.time}</span>
            {hoverReadout.items.map((it, i) => (
              <span key={i} className="whitespace-nowrap">
                <span style={{ color: it.color }}>{it.label}</span>{" "}
                <span className="text-foreground font-semibold">{fmtReadoutVal(it.value)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {/* Sub-pane indicator charts (MACD, RSI, Stochastic, ROC, ATR, OBV, registry).
          Double-click one (or its expand button) to fill the plot; drag a top
          border to resize — same behavior as the Charts tab. */}
      {subPanes.map(desc => {
        const sc = desc.subKey;
        const ovlDef = sc.startsWith("ovl:")
          ? (activeIndicators.indicatorOverlays ?? []).find(o => `ovl:${o.id}` === sc) ?? null
          : null;
        const isMaxSub = effMaxSub === sc;
        const hiddenWhileMax = effMaxSub !== null && !isMaxSub;
        return (
          <div key={sc} className={hiddenWhileMax ? "hidden" : "contents"}>
            <PairsSubIndicatorChart
              type={sc}
              indKey={desc.baseId}
              instances={desc.instances}
              freqSources={freqSources}
              closeData={finiteData}
              axisTimes={axisTimes}
              activeIndicators={activeIndicators}
              parentChart={chartRef.current}
              parentSeries={mainSeriesRef.current}
              overlayDef={ovlDef}
              sourceData={ovlDef ? subPrimaryRef.current.get(ovlDef.source) : undefined}
              onPrimaryData={sc.startsWith("ovl:") ? undefined : handleSubPrimaryData}
              isMaximized={isMaxSub}
              onToggleMaximize={() => setMaxSub((cur) => (cur === sc ? null : sc))}
              onClose={onChangeIndicators ? () => { setMaxSub((cur) => (cur === sc ? null : cur)); closeSub(sc); } : undefined}
              onHide={onChangeIndicators ? () => { setMaxSub((cur) => (cur === sc ? null : cur)); hideSub(sc); } : undefined}
              height={subHeights[sc]}
              onResizeStart={(defaultH, e) => startSubResize(sc, defaultH, e)}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Extra OLS Residual Z chart (per user-added metric pair) ──
interface ExtraOlsZRow {
  id: string;
  metricA: string;
  metricB: string;
}

function ExtraOlsZChart({
  row,
  tickerA,
  tickerB,
  zWindow,
  betaLookback,
  spreadZWindow,
  olsResidWindow,
  bandsMode,
  height,
  isMaximized,
  onMaximize,
  onRegisterChart,
  onUnregisterChart,
  onRegisterSeries,
  onCrosshairMove,
  onRemove,
  indicatorsForChart,
  onChangeIndicators,
}: {
  row: ExtraOlsZRow;
  tickerA: string;
  tickerB: string;
  zWindow: number;
  betaLookback: number;
  spreadZWindow: number;
  olsResidWindow: number;
  bandsMode: "static" | "expanding";
  height: number;
  isMaximized: boolean;
  onMaximize: (id: string | null) => void;
  onRegisterChart: (id: string, chart: IChartApi, dataLength?: number) => void;
  onUnregisterChart: (id: string) => void;
  onRegisterSeries: (id: string, series: ISeriesApi<any>) => void;
  onCrosshairMove?: (id: string, data: { time: string; values: Record<string, number> } | null) => void;
  onRemove: () => void;
  indicatorsForChart: ActiveIndicators;
  onChangeIndicators?: (i: ActiveIndicators) => void;
}) {
  const chartId = `olsResidZ_extra_${row.id}`;
  const { data, isLoading } = useQuery({
    queryKey: ["pairs-extra-olsz", tickerA, tickerB, row.metricA, row.metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow],
    queryFn: () =>
      getPairsData(tickerA, tickerB, row.metricA, row.metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow),
    enabled: !!tickerA && !!tickerB,
  });
  const olsResidZ = data?.olsResidZ || [];

  const bands = useMemo(() => {
    if (bandsMode === "expanding") {
      const b2 = expandingMeanStdBands(olsResidZ, 2, 20);
      const b1 = expandingMeanStdBands(olsResidZ, 1, 20);
      const mid: DataPoint[] = [];
      for (let i = 0; i < b2.upper.length; i++) {
        mid.push({
          time: b2.upper[i].time,
          value: (b2.upper[i].value + b2.lower[i].value) / 2,
        });
      }
      return {
        refLines: undefined,
        refBands: [
          { data: b2.upper, color: "rgba(244,63,94,0.55)", style: LineStyle.Dashed, label: "+2σ" },
          { data: b1.upper, color: "rgba(255,255,255,0.18)", style: LineStyle.Dotted },
          { data: mid, color: "rgba(255,255,255,0.3)", style: LineStyle.Dashed },
          { data: b1.lower, color: "rgba(255,255,255,0.18)", style: LineStyle.Dotted },
          { data: b2.lower, color: "rgba(34,197,94,0.55)", style: LineStyle.Dashed, label: "-2σ" },
        ],
      };
    }
    return {
      refLines: [
        { value: 2, color: "rgba(244,63,94,0.45)", style: LineStyle.Dashed, label: "+2σ" },
        { value: 1, color: "rgba(255,255,255,0.12)", style: LineStyle.Dotted },
        { value: 0, color: "rgba(255,255,255,0.25)", style: LineStyle.Dashed },
        { value: -1, color: "rgba(255,255,255,0.12)", style: LineStyle.Dotted },
        { value: -2, color: "rgba(34,197,94,0.45)", style: LineStyle.Dashed, label: "-2σ" },
      ],
      refBands: undefined as { data: DataPoint[]; color: string; style: number; label?: string }[] | undefined,
    };
  }, [olsResidZ, bandsMode]);

  const title = `OLS Residual Z — ${row.metricA === row.metricB ? row.metricA : `${row.metricA} / ${row.metricB}`} (${olsResidWindow}d)`;

  if (isLoading && olsResidZ.length === 0) {
    return (
      <div className="flex flex-col border-b border-border/30" style={{ minHeight: height }}>
        <div className="flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400"
            onClick={onRemove}
            title="Remove plot"
            data-testid={`pairs-chart-${chartId}-remove`}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex items-center justify-center text-[10px] text-muted-foreground" style={{ height: height }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <MiniChart
      id={chartId}
      data={olsResidZ}
      title={title}
      color="#a78bfa"
      height={height}
      useFlexHeight={true}
      refLines={bands.refLines}
      refBands={bands.refBands}
      activeIndicators={indicatorsForChart}
      onMaximize={onMaximize}
      isMaximized={isMaximized}
      onRegisterChart={onRegisterChart}
      onUnregisterChart={onUnregisterChart}
      onRegisterSeries={onRegisterSeries}
      onCrosshairMove={onCrosshairMove}
      onRemove={onRemove}
      onChangeIndicators={onChangeIndicators}
    />
  );
}

export default function Pairs() {
  // Legs handed over by navigateToPairs (Heatmap matrix cells, Ranking pair rows, …).
  // Without this the hand-off silently dropped and every caller landed on ESS/MAA.
  // Read the cache for a cold mount, and listen for the event for the common case
  // where this page is already mounted when the hand-off happens.
  const handoff = useRouterState().getCachedState("pairs");
  const [tickerA, setTickerA] = useState(() => handoff?.tickerA || "ESS");
  const [tickerB, setTickerB] = useState(() => handoff?.tickerB || "MAA");
  const [metricA, setMetricA] = useState(() => handoff?.metricA || "close");
  const [metricB, setMetricB] = useState(() => handoff?.metricB || "close");

  const [zWindow, setZWindow] = useState(60);
  const [betaLookback, setBetaLookback] = useState(52);
  const [spreadZWindow, setSpreadZWindow] = useState(8);
  const [olsResidWindow, setOlsResidWindow] = useState(52);
  // Additional OLS Residual Z plots, each with its own metric pair
  const [extraOlsZPlots, setExtraOlsZPlots] = useState<{ id: string; metricA: string; metricB: string }[]>([]);
  // Bands mode (static vs expanding) for mean/std bands rendering
  const [bandsMode, setBandsMode] = useState<"static" | "expanding">("static");
  // EG-spread β mode (rolling/OOS-clean vs full-sample in-sample) for Beta-Adjusted Spread chart
  const [egBetaMode, setEgBetaMode] = useState<"rolling" | "insample">("rolling");

  const [search, setSearch] = useState("");
  const [maximizedChart, setMaximizedChart] = useState<string | null>(null);
  const [showIndicators, setShowIndicators] = useState(false);
  const [pageChrome, setPageChrome] = useChartChrome();
  // Per-chart indicator state: chartId → ActiveIndicators
  const [indicatorsMap, setIndicatorsMap] = useState<Record<string, ActiveIndicators>>({});
  const [indicatorChartId, setIndicatorChartId] = useState<string>("prices");
  const [pairsLayout, setPairsLayout] = useState<GridLayout>("1x1");
  // Which chart IDs are toggled on
  const [visibleChartIds, setVisibleChartIds] = useState<Set<string>>(() => new Set(DEFAULT_VISIBLE_CHARTS));

  // Saved baskets (for BASKET: pair tokens + quick presets)
  const { baskets } = useBaskets();

  // Display labels: raw leg tokens ("BASKET:<id>") stay in state / data fetches,
  // but everything user-facing shows the basket's name instead.
  const dispA = useMemo(() => basketDisplayName(tickerA, baskets), [tickerA, baskets]);
  const dispB = useMemo(() => basketDisplayName(tickerB, baskets), [tickerB, baskets]);

  const serializePairs = useCallback(() => ({
    tickerA,
    tickerB,
    metricA,
    metricB,
    zWindow,
    betaLookback,
    spreadZWindow,
    olsResidWindow,
    extraOlsZPlots,
    pairsLayout,
    visibleChartIds: [...visibleChartIds],
    indicatorsMap,
  }), [tickerA, tickerB, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow, extraOlsZPlots, pairsLayout, visibleChartIds, indicatorsMap]);

  const restorePairs = useCallback((state: any) => {
    // A pair the user just clicked through to beats the legs saved in the workspace.
    if (!pairsHandoffPending()) {
      if (state.tickerA !== undefined) setTickerA(state.tickerA);
      if (state.tickerB !== undefined) setTickerB(state.tickerB);
      if (state.metricA !== undefined) setMetricA(state.metricA);
      if (state.metricB !== undefined) setMetricB(state.metricB);
    }
    if (state.zWindow !== undefined) setZWindow(state.zWindow);
    if (state.betaLookback !== undefined) setBetaLookback(state.betaLookback);
    if (state.spreadZWindow !== undefined) setSpreadZWindow(state.spreadZWindow);
    if (state.olsResidWindow !== undefined) setOlsResidWindow(state.olsResidWindow);
    if (state.extraOlsZPlots !== undefined) setExtraOlsZPlots(state.extraOlsZPlots);
    if (state.pairsLayout !== undefined) setPairsLayout(state.pairsLayout);
    if (state.visibleChartIds) {
      // Migration: saved sets identical to the OLD 8-chart default were never
      // customized by the user — give them the new single-ratio-chart default
      // instead of resurrecting the old wall of charts. Genuine custom picks
      // (any other combination) are preserved.
      const OLD_DEFAULT = ["correlation", "olsScatter", "percentileRank", "prices", "ratio", "residence", "signalAnalyzer", "zscore"].join(",");
      const savedSig = [...state.visibleChartIds].sort().join(",");
      if (savedSig !== OLD_DEFAULT) setVisibleChartIds(new Set(state.visibleChartIds));
    }
    if (state.indicatorsMap !== undefined) setIndicatorsMap(state.indicatorsMap);
  }, []);

  useWorkspaceTab("pairs", serializePairs, restorePairs);

  // Declared AFTER useWorkspaceTab on purpose: effects run in declaration order, so
  // this claims the hand-off once restorePairs has had its turn. Both are needed —
  // the guard in restorePairs stops it clobbering, this puts the clicked legs in.
  useEffect(() => {
    const apply = (d: PairsHandoff | null) => {
      if (!d) return;
      if (d.tickerA) setTickerA(d.tickerA);
      if (d.tickerB) setTickerB(d.tickerB);
      if (d.metricA) setMetricA(d.metricA);
      if (d.metricB) setMetricB(d.metricB);
    };
    apply(takePairsHandoff());
    const onHandoff = (e: Event) => {
      apply((e as CustomEvent<PairsHandoff>).detail);
      takePairsHandoff();
    };
    window.addEventListener(PAIRS_HANDOFF_EVENT, onHandoff);
    return () => window.removeEventListener(PAIRS_HANDOFF_EVENT, onHandoff);
  }, []);

  const chartScrollRef = useRef<HTMLDivElement>(null);

  // ── Crosshair value aggregation ──
  const [pairsCrosshairData, setPairsCrosshairData] = useState<{
    time: string;
    values: Record<string, number>;
  } | null>(null);
  const pairsCrosshairValuesRef = useRef<Map<string, { time: string; values: Record<string, number> }>>(new Map());
  const pairsCrosshairFlushRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  const handlePairsCrosshairMove = useCallback((chartId: string, data: { time: string; values: Record<string, number> } | null) => {
    if (data) {
      pairsCrosshairValuesRef.current.set(chartId, data);
    } else {
      pairsCrosshairValuesRef.current.delete(chartId);
    }
    if (pairsCrosshairFlushRef.current) cancelAnimationFrame(pairsCrosshairFlushRef.current);
    pairsCrosshairFlushRef.current = requestAnimationFrame(() => {
      const entries = Array.from(pairsCrosshairValuesRef.current.values());
      if (entries.length === 0) {
        setPairsCrosshairData(null);
        return;
      }
      const merged: Record<string, number> = {};
      let latestTime = entries[0].time;
      for (const entry of entries) {
        if (entry.time >= latestTime) latestTime = entry.time;
        for (const [k, v] of Object.entries(entry.values)) {
          merged[k] = v;
        }
      }
      setPairsCrosshairData({ time: latestTime, values: merged });
    });
  }, []);

  // ── Sync infrastructure ──
  // Chart registry + range/crosshair sync (shared hook — also used by the
  // Pair Ratios detail view).
  const { registerChart, unregisterChart, registerSeries } = usePairChartSync("prices", "__pairCharts");

  // Ticker list
  const { data: tickers } = useQuery<TickerMeta[]>({
    queryKey: ["tickers"],
    queryFn: getTickers,
  });

  // Basket legs resolve to a server-aggregated close series (same weighting
  // engine the Charts tab uses); the basket contents are part of the query key
  // so editing a basket refetches.
  const basketLegSig = useCallback((tk: string): string => {
    if (!isBasketTicker(tk)) return tk;
    const b = baskets.find((x) => x.id === extractBasketId(tk));
    return b ? `${tk}:${b.tickers.join("|")}:${b.weighting ?? ""}` : tk;
  }, [baskets]);

  // Pairs data
  const { data: pairsData, isLoading, error: pairsError } = useQuery<PairsData>({
    queryKey: ["pairs", basketLegSig(tickerA), basketLegSig(tickerB), metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow],
    queryFn: async () => {
      const resolveLeg = async (tk: string) => {
        if (!isBasketTicker(tk)) return null;
        const id = extractBasketId(tk);
        const b = baskets.find((x) => x.id === id);
        if (!b) throw new Error(`Basket not found for ${tk} — it may have been deleted.`);
        if (b.tickers.length === 0) throw new Error(`Basket "${b.name}" is empty.`);
        const ohlc = await getBasketOhlc(buildBasketOhlc(b.tickers, b, { weighting: b.weighting, rebalance: b.rebalance }));
        if (!ohlc || !ohlc.dates || ohlc.dates.length === 0) throw new Error(`No data for basket "${b.name}".`);
        return { dates: ohlc.dates, values: ohlc.closes };
      };
      const [ovA, ovB] = await Promise.all([resolveLeg(tickerA), resolveLeg(tickerB)]);
      return getPairsData(tickerA, tickerB, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow, { a: ovA, b: ovB });
    },
    enabled: !!tickerA && !!tickerB,
  });

  // Swap tickers
  const handleSwap = useCallback(() => {
    setTickerA(tickerB);
    setTickerB(tickerA);
  }, [tickerA, tickerB]);

  // Stats summary
  const stats = useMemo(() => {
    if (!pairsData) return null;
    const { ratio, logRatio, zScore, spreadZ, olsResidZ, correlation, percentileRank } = pairsData;
    if (ratio.length === 0) return null;

    const lastRatio = ratio[ratio.length - 1]?.value;
    const lastLogRatio = logRatio[logRatio.length - 1]?.value;
    const lastZScore = zScore[zScore.length - 1]?.value;
    const lastSpreadZ = spreadZ.length > 0 ? spreadZ[spreadZ.length - 1]?.value : undefined;
    const lastOlsResidZ = olsResidZ.length > 0 ? olsResidZ[olsResidZ.length - 1]?.value : undefined;
    const lastCorr = correlation[correlation.length - 1]?.value;
    const lastPctRank = percentileRank.length > 0 ? percentileRank[percentileRank.length - 1]?.value : undefined;

    const ratioVals = ratio.map((d) => d.value);
    const ratioMean = ratioVals.reduce((s, v) => s + v, 0) / ratioVals.length;
    const ratioStd = Math.sqrt(
      ratioVals.reduce((s, v) => s + (v - ratioMean) ** 2, 0) / ratioVals.length
    );
    const ratioMin = Math.min(...ratioVals);
    const ratioMax = Math.max(...ratioVals);

    const lastBeta = pairsData.rollingBeta.length > 0 ? pairsData.rollingBeta[pairsData.rollingBeta.length - 1]?.value : undefined;
    const lastR2 = pairsData.rollingR2.length > 0 ? pairsData.rollingR2[pairsData.rollingR2.length - 1]?.value : undefined;

    return {
      lastRatio, lastLogRatio, lastZScore, lastSpreadZ, lastOlsResidZ, lastCorr,
      lastBeta, lastR2, lastPctRank,
      ratioMean, ratioStd, ratioMin, ratioMax,
      dataPoints: ratio.length,
      cointStats: pairsData.cointStats,
    };
  }, [pairsData]);

  // Export CSV
  const exportCSV = useCallback(() => {
    if (!pairsData) return;
    const { priceA, priceB, ratio, logRatio, zScore, spreadZ, olsResidZ, correlation, rollingBeta, betaAdjSpread, rollingR2, percentileRank } = pairsData;
    const dateMap = new Map<string, any>();
    const addSeries = (series: DataPoint[], key: string) => {
      for (const d of series) {
        const row = dateMap.get(d.time) || { date: d.time };
        row[key] = d.value;
        dateMap.set(d.time, row);
      }
    };
    addSeries(priceA, "priceA");
    addSeries(priceB, "priceB");
    addSeries(ratio, "ratio");
    addSeries(logRatio, "logRatio");
    addSeries(zScore, "zScore");
    addSeries(spreadZ, "spreadZ");
    addSeries(olsResidZ, "olsResidZ");
    addSeries(correlation, "correlation");
    addSeries(rollingBeta, "rollingBeta");
    addSeries(betaAdjSpread, "betaAdjSpread");
    addSeries(rollingR2, "rollingR2");
    addSeries(percentileRank, "percentileRank");

    const rows = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const header = `Date,${dispA} ${metricA},${dispB} ${metricB},Ratio,Log Ratio,Z-Score (${zWindow}d),Spread Z (${betaLookback}/${spreadZWindow}d),OLS Resid Z (${olsResidWindow}d),Pct Rank,Correlation (${zWindow}d),Rolling Beta,Beta-Adj Spread,Rolling R2`;
    const fmt = (v: number | undefined, dp: number) => v !== undefined ? v.toFixed(dp) : "";
    const lines = rows.map(
      (r) =>
        `${r.date},${fmt(r.priceA, 4)},${fmt(r.priceB, 4)},${fmt(r.ratio, 6)},${fmt(r.logRatio, 6)},${fmt(r.zScore, 4)},${fmt(r.spreadZ, 4)},${fmt(r.olsResidZ, 4)},${fmt(r.percentileRank, 2)},${fmt(r.correlation, 4)},${fmt(r.rollingBeta, 4)},${fmt(r.betaAdjSpread, 6)},${fmt(r.rollingR2, 4)}`
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pairs_${dispA}_${dispB}.csv`.replace(/[^\w.-]+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  }, [pairsData, dispA, dispB, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow]);

  // Chart heights
  const priceH = 180;
  const ratioH = 160;
  const zH = 140;
  const corrH = 120;

  // Chart configs
  const chartConfigs = useMemo(() => {
    if (!pairsData || pairsData.ratio.length === 0) return [];
    return [
      {
        id: "prices",
        data: pairsData.priceA,
        secondaryData: pairsData.priceB,
        title: `${dispA} vs ${dispB} — ${metricA === metricB ? metricA : metricA + " / " + metricB}`,
        secondaryLabel: `${dispA} (blue) · ${dispB} (orange)`,
        color: "#0ea5e9",
        secondaryColor: "#f59e0b",
        height: priceH,
        refLines: undefined,
      },
      {
        id: "ratio",
        data: pairsData.ratio,
        title: `Ratio (${dispA} / ${dispB})`,
        color: "#22c55e",
        height: ratioH,
      },
      {
        id: "logRatio",
        data: pairsData.logRatio,
        title: `Log Ratio — ln(${dispA} / ${dispB})`,
        color: "#a855f7",
        height: ratioH,
        refLines: [{ value: 0, color: "rgba(255,255,255,0.2)", style: LineStyle.Dashed }],
      },
      {
        id: "zscore",
        data: pairsData.zScore,
        title: `Raw Ratio Z (${zWindow}d)`,
        color: "#0ea5e9",
        height: zH,
        refLines: [
          { value: 0, color: "rgba(255,255,255,0.15)", style: LineStyle.Dashed },
        ],
      },
      {
        id: "spreadZ",
        data: pairsData.spreadZ,
        title: `Spread Z (\u03B2=${betaLookback}d, z=${spreadZWindow}d)`,
        color: "#f43f5e",
        height: zH,
        refLines: [
          { value: 0, color: "rgba(255,255,255,0.15)", style: LineStyle.Dashed },
        ],
      },
      {
        id: "olsResidZ",
        data: pairsData.olsResidZ,
        title: `OLS Residual Z (${olsResidWindow}d)`,
        color: "#a78bfa",
        height: zH,
        refLines: [
          { value: 0, color: "rgba(255,255,255,0.15)", style: LineStyle.Dashed },
        ],
      },
      {
        id: "percentileRank",
        data: pairsData.percentileRank,
        title: `Ratio Percentile Rank (${dispA} / ${dispB})`,
        color: "#10b981",
        height: zH,
        refLines: [
          { value: 50, color: "rgba(255,255,255,0.15)", style: LineStyle.Dashed },
          { value: 25, color: "rgba(255,255,255,0.08)", style: LineStyle.Dotted },
          { value: 75, color: "rgba(255,255,255,0.08)", style: LineStyle.Dotted },
        ],
      },
      {
        id: "correlation",
        data: pairsData.correlation,
        title: `Rolling Correlation (${zWindow}-day)`,
        color: "#f97316",
        height: corrH,
        refLines: [
          { value: 1, color: "rgba(255,255,255,0.1)", style: LineStyle.Dotted },
          { value: 0, color: "rgba(255,255,255,0.15)", style: LineStyle.Dashed },
          { value: -1, color: "rgba(255,255,255,0.1)", style: LineStyle.Dotted },
          { value: 0.5, color: "rgba(255,255,255,0.06)", style: LineStyle.Dotted },
          { value: -0.5, color: "rgba(255,255,255,0.06)", style: LineStyle.Dotted },
        ],
      },
      {
        id: "spread",
        data: pairsData.spread,
        title: `Spread (${dispA} − ${dispB})`,
        color: "#14b8a6",
        height: ratioH,
        refLines: [{ value: 0, color: "rgba(255,255,255,0.15)", style: LineStyle.Dashed }],
      },
      {
        id: "rollingBeta",
        data: pairsData.rollingBeta,
        title: `Rolling Beta (${dispA} vs ${dispB}, ${zWindow}d)`,
        color: "#ec4899",
        height: corrH,
        refLines: [
          { value: 1, color: "rgba(255,255,255,0.15)", style: LineStyle.Dashed },
          { value: 0, color: "rgba(255,255,255,0.1)", style: LineStyle.Dotted },
        ],
      },
      {
        id: "betaAdjSpread",
        data: pairsData.betaAdjSpread,
        title: `Beta-Adjusted Spread (EG Residual)`,
        color: "#06b6d4",
        height: ratioH,
        refLines: [{ value: 0, color: "rgba(255,255,255,0.15)", style: LineStyle.Dashed }],
      },
      {
        id: "rollingR2",
        data: pairsData.rollingR2,
        title: `Rolling R² (${zWindow}d)`,
        color: "#8b5cf6",
        height: corrH,
        refLines: [
          { value: 1, color: "rgba(255,255,255,0.1)", style: LineStyle.Dotted },
          { value: 0.5, color: "rgba(255,255,255,0.06)", style: LineStyle.Dotted },
          { value: 0, color: "rgba(255,255,255,0.1)", style: LineStyle.Dotted },
        ],
      },
    ];
  }, [pairsData, dispA, dispB, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow]);

  return (
    <div className="flex flex-col h-full bg-background" data-testid="pairs-page">
      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">A</span>
        <TickerPicker value={tickerA} onChange={setTickerA} tickers={tickers || []} baskets={baskets} testId="pairs-ticker-a" />

        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
          onClick={handleSwap} data-testid="pairs-swap" title="Swap tickers">
          <ArrowRightLeft className="w-3.5 h-3.5" />
        </Button>

        <span className="text-xs font-semibold text-muted-foreground">B</span>
        <TickerPicker value={tickerB} onChange={setTickerB} tickers={tickers || []} baskets={baskets} testId="pairs-ticker-b" />

        <div className="h-5 w-px bg-border mx-1" />

        {/* Basket quick presets */}
        {baskets.length >= 2 && (
          <BasketQuickPresets
            baskets={baskets}
            onPick={(aId, bId) => {
              setTickerA(`BASKET:${aId}`);
              setTickerB(`BASKET:${bId}`);
            }}
          />
        )}

        {baskets.length >= 2 && <div className="h-5 w-px bg-border mx-1" />}

        {/* Template presets */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] gap-1" data-testid="pairs-template-btn">
              <ListFilter className="w-3 h-3" />
              Templates
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[240px] p-0" align="start">
            <div className="px-3 py-2 border-b border-border">
              <span className="text-[11px] font-semibold">Metric Presets</span>
            </div>
            <div className="py-1 max-h-[300px] overflow-y-auto">
              {PAIRS_TEMPLATES.map((tpl, i) => {
                const isActive = metricA === tpl.metricA && metricB === tpl.metricB;
                return (
                  <button
                    key={i}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-accent/50 transition-colors ${
                      isActive ? "bg-accent/30 text-foreground font-medium" : "text-muted-foreground"
                    }`}
                    onClick={() => {
                      setMetricA(tpl.metricA);
                      setMetricB(tpl.metricB);
                    }}
                    data-testid={`pairs-template-${i}`}
                  >
                    {isActive && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                    {!isActive && <div className="w-3 flex-shrink-0" />}
                    <span className="font-mono">{tpl.label}</span>
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <div className="h-5 w-px bg-border mx-0.5" />

        <span className="text-xs font-semibold text-muted-foreground">Metric A</span>
        <MetricPicker value={metricA} onChange={setMetricA} testId="pairs-metric-a" />

        <span className="text-xs font-semibold text-muted-foreground">Metric B</span>
        <MetricPicker value={metricB} onChange={setMetricB} testId="pairs-metric-b" />

        <div className="h-5 w-px bg-border mx-1" />

        <span className="text-xs font-semibold text-muted-foreground">Raw Z</span>
        <div className="flex items-center gap-0.5">
          {LOOKBACK_OPTIONS.map((opt) => (
            <Button key={opt.value}
              variant={zWindow === opt.value ? "default" : "ghost"}
              size="sm" className="h-6 px-2 text-[10px]"
              onClick={() => setZWindow(opt.value)} data-testid={`pairs-z-${opt.value}`}>
              {opt.label}
            </Button>
          ))}
          <Input
            type="number" min={2} max={1000} step={1}
            value={zWindow}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (!isNaN(v) && v >= 2) setZWindow(v);
            }}
            className="h-6 w-[52px] text-[10px] font-mono px-1.5 text-center"
            data-testid="pairs-z-custom"
          />
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        <span className="text-xs font-semibold text-muted-foreground">Bands</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant={bandsMode === "static" ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setBandsMode("static")}
            data-testid="pairs-bands-static"
          >
            Static
          </Button>
          <Button
            variant={bandsMode === "expanding" ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setBandsMode("expanding")}
            data-testid="pairs-bands-expanding"
          >
            Expanding
          </Button>
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        <span className="text-xs font-semibold text-muted-foreground" title="Beta-Adjusted Spread chart β mode">EG-Spread β</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant={egBetaMode === "rolling" ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setEgBetaMode("rolling")}
            data-testid="pairs-eg-rolling"
            title="Rolling-window β (OOS-clean): β estimated using only past data at each bar. Eliminates look-ahead bias in the visualized spread."
          >
            Rolling
          </Button>
          <Button
            variant={egBetaMode === "insample" ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setEgBetaMode("insample")}
            data-testid="pairs-eg-insample"
            title="Full-sample β (in-sample): matches the ADF cointegration test exactly, but the chart shows residuals computed from β that uses future data."
          >
            In-sample
          </Button>
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1" data-testid="pairs-z-models-btn">
              Z-Models
              <ChevronsUpDown className="w-2.5 h-2.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-3 space-y-3" align="start">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-foreground">Spread Z (dual-window)</div>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground w-[50px] flex-shrink-0">{"\u03B2 lookback"}</Label>
                <Input
                  type="number" min={5} max={500} step={1}
                  value={betaLookback}
                  onChange={(e) => setBetaLookback(Math.max(5, parseInt(e.target.value) || 52))}
                  className="h-6 text-[10px] w-[60px] font-mono"
                  data-testid="pairs-beta-lookback"
                />
                <span className="text-[9px] text-muted-foreground">days</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground w-[50px] flex-shrink-0">Z window</Label>
                <Input
                  type="number" min={2} max={200} step={1}
                  value={spreadZWindow}
                  onChange={(e) => setSpreadZWindow(Math.max(2, parseInt(e.target.value) || 8))}
                  className="h-6 text-[10px] w-[60px] font-mono"
                  data-testid="pairs-spread-z-window"
                />
                <span className="text-[9px] text-muted-foreground">days</span>
              </div>
            </div>
            <div className="border-t border-border pt-2 space-y-2">
              <div className="text-[11px] font-semibold text-foreground">OLS Residual Z</div>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground w-[50px] flex-shrink-0">Window</Label>
                <Input
                  type="number" min={5} max={500} step={1}
                  value={olsResidWindow}
                  onChange={(e) => setOlsResidWindow(Math.max(5, parseInt(e.target.value) || 52))}
                  className="h-6 text-[10px] w-[60px] font-mono"
                  data-testid="pairs-ols-resid-window"
                />
                <span className="text-[9px] text-muted-foreground">days</span>
              </div>
            </div>
            <div className="border-t border-border pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-foreground">Extra OLS Z Plots</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 px-1.5 text-[9px] gap-1"
                  onClick={() => {
                    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
                    setExtraOlsZPlots((prev) => [...prev, { id, metricA: "P/FFO FY2", metricB: "P/FFO FY2" }]);
                  }}
                  data-testid="pairs-add-extra-olsz"
                >
                  <Plus className="w-2.5 h-2.5" />
                  Add
                </Button>
              </div>
              {extraOlsZPlots.length === 0 ? (
                <div className="text-[9px] text-muted-foreground/70 leading-tight">
                  Add additional OLS Residual Z plots with different metric pairs (e.g., P/FFO FY2, EV/EBITDA, FFO Yield).
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                  {extraOlsZPlots.map((row, u) => (
                    <div key={row.id} className="flex items-center gap-1" data-testid={`pairs-extra-olsz-row-${u}`}>
                      <span className="text-[9px] text-muted-foreground w-[10px]">{u + 1}</span>
                      <MetricPicker
                        value={row.metricA}
                        onChange={(v) =>
                          setExtraOlsZPlots((prev) => prev.map((p) => (p.id === row.id ? { ...p, metricA: v } : p)))
                        }
                        testId={`pairs-extra-olsz-${u}-a`}
                      />
                      <span className="text-[9px] text-muted-foreground">/</span>
                      <MetricPicker
                        value={row.metricB}
                        onChange={(v) =>
                          setExtraOlsZPlots((prev) => prev.map((p) => (p.id === row.id ? { ...p, metricB: v } : p)))
                        }
                        testId={`pairs-extra-olsz-${u}-b`}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400 flex-shrink-0"
                        onClick={() => setExtraOlsZPlots((prev) => prev.filter((p) => p.id !== row.id))}
                        title="Remove"
                        data-testid={`pairs-extra-olsz-${u}-remove`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="text-[9px] text-muted-foreground/70 leading-tight">
              Spread Z: log(A) - {"\u03B2"}*log(B), {"\u03B2"} from rolling OLS, then z-scored.<br />
              OLS Resid Z: residual from rolling OLS with intercept, then z = resid / {"\u03C3"}.
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {stats && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {pairsData?.ratio.length ?? 0} pts
          </span>
        )}

        {/* Chart picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1" data-testid="pairs-chart-picker-btn">
              <LayoutGrid className="w-3 h-3" />
              Charts ({visibleChartIds.size})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="end">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-[11px] font-semibold">Visible Charts</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px]"
                  onClick={() => setVisibleChartIds(new Set(CHART_DEFS.map(d => d.id)))}
                  data-testid="pairs-chart-picker-all"
                >All</Button>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px]"
                  onClick={() => setVisibleChartIds(new Set(DEFAULT_VISIBLE_CHARTS))}
                  data-testid="pairs-chart-picker-reset"
                >Reset</Button>
              </div>
            </div>
            <div className="py-1">
              {["Core", "Z-Scores", "Stats"].map(group => (
                <div key={group}>
                  <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
                  {CHART_DEFS.filter(d => d.group === group).map(def => (
                    <label key={def.id} className="flex items-center gap-2 px-3 py-1 hover:bg-accent/50 cursor-pointer">
                      <Checkbox
                        checked={visibleChartIds.has(def.id)}
                        onCheckedChange={(checked) => {
                          setVisibleChartIds(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(def.id);
                            else next.delete(def.id);
                            return next;
                          });
                        }}
                        className="h-3.5 w-3.5"
                        data-testid={`pairs-chart-toggle-${def.id}`}
                      />
                      <span className="text-[11px]">{def.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <GridLayoutPicker
          value={pairsLayout}
          onChange={setPairsLayout}
          testId="pairs-grid-picker"
        />

        <div className="h-5 w-px bg-border mx-0.5" />

        <Button
          variant={showIndicators ? "default" : "ghost"}
          size="sm" className="h-7 gap-1 text-xs"
          onClick={() => setShowIndicators(!showIndicators)}
          data-testid="pairs-indicators-toggle"
        >
          <TrendingUp className="w-3 h-3" />
          Indicators
        </Button>

        {/* Axis labels + current-value lines (Charts parity — global pref) */}
        <Button
          variant="ghost" size="sm"
          className={`h-7 gap-1 text-xs ${!pageChrome.axisLabels ? "text-muted-foreground/50" : ""}`}
          onClick={() => setPageChrome({ axisLabels: !pageChrome.axisLabels })}
          title={pageChrome.axisLabels ? "Hide the right-axis series labels — hover still shows all values" : "Show the right-axis series labels"}
          data-testid="pairs-toggle-axis-labels"
        >
          Labels
        </Button>
        <Button
          variant="ghost" size="sm"
          className={`h-7 gap-1 text-xs ${!pageChrome.priceLines ? "text-muted-foreground/50" : ""}`}
          onClick={() => setPageChrome({ priceLines: !pageChrome.priceLines })}
          title={pageChrome.priceLines ? "Hide the dashed current-value lines" : "Show the dashed current-value lines"}
          data-testid="pairs-toggle-price-lines"
        >
          Px line
        </Button>

        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
          onClick={exportCSV} data-testid="pairs-csv">
          <Download className="w-3 h-3" />
          CSV
        </Button>

        {/* Hand-off: remap the Charts tab's current layout onto this pair. */}
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
          onClick={() => {
            try { sessionStorage.setItem("reit-viz:pair-remap-to-charts", `${tickerA}/${tickerB}`); } catch {}
            window.location.hash = "#/";
          }}
          title={`Open ${tickerA}/${tickerB} on the Charts tab — keeps your Charts layout, remaps every pane to the ratio`}
          data-testid="pairs-open-in-charts">
          <TrendingUp className="w-3 h-3" />
          Open in Charts
        </Button>

        <div className="h-5 w-px bg-border mx-0.5" />

        <GridProminenceToggle />
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-b border-border/50 bg-card/30 flex-wrap">
          <StatChip label="Ratio" value={stats.lastRatio?.toFixed(4)} />
          <StatChip label="Log Ratio" value={stats.lastLogRatio?.toFixed(4)} />
          <StatChip
            label={`Raw Z (${zWindow}d)`}
            value={stats.lastZScore?.toFixed(3)}
            highlight={
              stats.lastZScore !== undefined
                ? Math.abs(stats.lastZScore) > 2 ? "red"
                : Math.abs(stats.lastZScore) > 1 ? "yellow"
                : "green"
                : undefined
            }
          />
          <StatChip
            label={`Spread Z`}
            value={stats.lastSpreadZ?.toFixed(3)}
            highlight={
              stats.lastSpreadZ !== undefined
                ? Math.abs(stats.lastSpreadZ) > 2 ? "red"
                : Math.abs(stats.lastSpreadZ) > 1 ? "yellow"
                : "green"
                : undefined
            }
          />
          <StatChip
            label={`OLS Z`}
            value={stats.lastOlsResidZ?.toFixed(3)}
            highlight={
              stats.lastOlsResidZ !== undefined
                ? Math.abs(stats.lastOlsResidZ) > 2 ? "red"
                : Math.abs(stats.lastOlsResidZ) > 1 ? "yellow"
                : "green"
                : undefined
            }
          />
          <StatChip
            label="Pct Rank"
            value={stats.lastPctRank !== undefined ? `${stats.lastPctRank.toFixed(1)}%` : undefined}
            highlight={
              stats.lastPctRank !== undefined
                ? stats.lastPctRank > 90 || stats.lastPctRank < 10 ? "red"
                : stats.lastPctRank > 75 || stats.lastPctRank < 25 ? "yellow"
                : "green"
                : undefined
            }
          />
          <StatChip label={`Corr (${zWindow}d)`} value={stats.lastCorr?.toFixed(3)} />
          <div className="h-4 w-px bg-border" />
          <StatChip label="Ratio μ" value={stats.ratioMean?.toFixed(4)} />
          <StatChip label="Ratio σ" value={stats.ratioStd?.toFixed(4)} />
          <StatChip label="Ratio Range" value={`${stats.ratioMin?.toFixed(3)} – ${stats.ratioMax?.toFixed(3)}`} />
          <div className="h-4 w-px bg-border" />
          <StatChip label="Beta" value={stats.lastBeta?.toFixed(3)} />
          <StatChip label="R²" value={stats.lastR2?.toFixed(3)} />
          {stats.cointStats && (
            <>
              <div className="h-4 w-px bg-border" />
              <StatChip label="ADF" value={stats.cointStats.adfStat.toFixed(3)} />
              <StatChip
                label="Coint p"
                value={stats.cointStats.pValue < 0.01 ? "<0.01" : stats.cointStats.pValue.toFixed(3)}
                highlight={stats.cointStats.pValue < 0.05 ? "green" : stats.cointStats.pValue < 0.10 ? "yellow" : "red"}
              />
              <StatChip label="Hedge" value={stats.cointStats.hedgeRatio.toFixed(3)} />
              <StatChip label="Half-Life" value={stats.cointStats.halfLife > 0 && stats.cointStats.halfLife < 9999 ? `${stats.cointStats.halfLife.toFixed(1)}d` : "N/A"} />
            </>
          )}
          {/* Crosshair values now render inside each plot (per-chart readout),
              matching the Charts tab — the merged top-strip readout is gone. */}
        </div>
      )}

      {/* Charts + indicators panel */}
      <div className="flex flex-1 overflow-hidden relative min-h-0">
        {(() => {
          // Filter chartConfigs by visibleChartIds
          const enabledCharts = chartConfigs.filter(c => visibleChartIds.has(c.id));
          const visibleCharts = maximizedChart
            ? enabledCharts.filter(c => c.id === maximizedChart)
            : enabledCharts;
          const isMaxMode = maximizedChart !== null;
          const showOlsScatter = visibleChartIds.has("olsScatter") && (maximizedChart === null || maximizedChart === "olsScatter");
          const showResidence = visibleChartIds.has("residence") && (maximizedChart === null || maximizedChart === "residence");
          const showSignalAnalyzer = visibleChartIds.has("signalAnalyzer") && (maximizedChart === null || maximizedChart === "signalAnalyzer");
          const visibleExtraOlsZ = extraOlsZPlots.filter(
            (row) => maximizedChart === null || maximizedChart === `olsResidZ_extra_${row.id}`,
          );
          const totalItems = visibleCharts.length + (showOlsScatter ? 1 : 0) + (showResidence ? 1 : 0) + (showSignalAnalyzer ? 1 : 0) + visibleExtraOlsZ.length;
          // In maximized mode, fill the entire container
          // Otherwise use a scrollable grid with minimum chart heights
          const containerStyle: React.CSSProperties = isMaxMode
            ? { display: "grid", gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }
            : (() => {
                const base = gridContainerStyle(pairsLayout, totalItems);
                // Override rows: use minmax(200px, 1fr) so charts have a minimum height
                // and the grid can exceed container height, enabling scrolling
                const { cols } = parseGrid(pairsLayout);
                const actualRows = Math.ceil(totalItems / cols);
                return {
                  ...base,
                  gridTemplateRows: `repeat(${actualRows}, 1fr)`,
                };
              })();
          return (
            <div
              ref={chartScrollRef}
              className="flex-1 min-h-0 overflow-hidden"
              style={containerStyle}
            >
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Loading pairs data...
                </div>
              ) : pairsError ? (
                <div className="flex items-center justify-center h-full text-rose-400 text-sm px-6 text-center" data-testid="pairs-error">
                  {(pairsError as Error)?.message || "Failed to load pairs data"}
                </div>
              ) : chartConfigs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Select two tickers to analyze their spread relationship
                </div>
              ) : (
                <>
                  {visibleCharts.map((c) => (
                    <MiniChart
                      key={c.id}
                      id={c.id}
                      data={c.data}
                      title={c.title}
                      color={c.color}
                      height={c.height}
                      useFlexHeight={true}
                      refLines={c.refLines}
                      secondaryData={(c as any).secondaryData}
                      secondaryColor={(c as any).secondaryColor}
                      secondaryLabel={(c as any).secondaryLabel}
                      activeIndicators={indicatorsMap[c.id] || EMPTY_INDICATORS}
                      onMaximize={setMaximizedChart}
                      isMaximized={maximizedChart === c.id}
                      onRegisterChart={registerChart}
                      onUnregisterChart={unregisterChart}
                      onRegisterSeries={registerSeries}
                      onCrosshairMove={handlePairsCrosshairMove}
                      onChangeIndicators={(i) => setIndicatorsMap(prev => ({ ...prev, [c.id]: i }))}
                    />
                  ))}
                  {/* OLS Scatter chart */}
                  {pairsData && showOlsScatter && (
                    <OlsScatterChart
                      priceA={pairsData.priceA}
                      priceB={pairsData.priceB}
                      tickerA={dispA}
                      tickerB={dispB}
                      isMaximized={maximizedChart === "olsScatter"}
                      onMaximize={setMaximizedChart}
                    />
                  )}
                  {/* % Residence Days panel */}
                  {pairsData && showResidence && (
                    <PairResidenceChart
                      zScore={pairsData.zScore}
                      percentileRank={pairsData.percentileRank}
                      tickerA={dispA}
                      tickerB={dispB}
                      zWindow={zWindow}
                      isMaximized={maximizedChart === "residence"}
                      onMaximize={setMaximizedChart}
                    />
                  )}
                  {/* Predictive Signals chart */}
                  {pairsData && showSignalAnalyzer && (
                    <SignalAnalyzerChart
                      priceA={pairsData.priceA}
                      priceB={pairsData.priceB}
                      tickerA={dispA}
                      tickerB={dispB}
                      isMaximized={maximizedChart === "signalAnalyzer"}
                      onMaximize={setMaximizedChart}
                    />
                  )}
                  {/* Extra OLS Residual Z plots */}
                  {visibleExtraOlsZ.map((row) => {
                    const extraId = `olsResidZ_extra_${row.id}`;
                    return (
                      <ExtraOlsZChart
                        key={row.id}
                        row={row}
                        tickerA={tickerA}
                        tickerB={tickerB}
                        zWindow={zWindow}
                        betaLookback={betaLookback}
                        spreadZWindow={spreadZWindow}
                        olsResidWindow={olsResidWindow}
                        bandsMode={bandsMode}
                        height={zH}
                        isMaximized={maximizedChart === extraId}
                        onMaximize={setMaximizedChart}
                        onRegisterChart={registerChart}
                        onUnregisterChart={unregisterChart}
                        onRegisterSeries={registerSeries}
                        onCrosshairMove={handlePairsCrosshairMove}
                        onRemove={() => setExtraOlsZPlots((prev) => prev.filter((p) => p.id !== row.id))}
                        indicatorsForChart={indicatorsMap[extraId] || EMPTY_INDICATORS}
                        onChangeIndicators={(i) => setIndicatorsMap(prev => ({ ...prev, [extraId]: i }))}
                      />
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}

        {showIndicators && (() => {
          // Only offer charts that are actually on screen (visibility picker +
          // user-added OLS plots) — hidden charts can't show indicators anyway.
          const panelCharts = [
            ...chartConfigs.filter(c => visibleChartIds.has(c.id)).map(c => ({ id: c.id, title: c.title })),
            ...extraOlsZPlots.map(r => ({
              id: `olsResidZ_extra_${r.id}`,
              title: `OLS Residual Z — ${r.metricA === r.metricB ? r.metricA : `${r.metricA} / ${r.metricB}`}`,
            })),
          ];
          const effectiveChartId = panelCharts.some(c => c.id === indicatorChartId)
            ? indicatorChartId
            : (panelCharts[0]?.id ?? indicatorChartId);
          return (
          <PairsIndicatorsPanel
            charts={panelCharts}
            indicatorsMap={indicatorsMap}
            activeChartId={effectiveChartId}
            onSelectChart={setIndicatorChartId}
            onChangeIndicators={(chartId, indicators) =>
              setIndicatorsMap(prev => ({ ...prev, [chartId]: indicators }))
            }
            onClose={() => setShowIndicators(false)}
          />
          );
        })()}
      </div>
    </div>
  );
}

// Basket quick presets: every basket-vs-basket pair, filterable, in a large popover
function BasketQuickPresets({
  baskets,
  onPick,
}: {
  baskets: Basket[];
  onPick: (aId: string, bId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const pairs = useMemo(() => {
    const out: { a: Basket; b: Basket }[] = [];
    baskets.forEach((a, u) => {
      baskets.slice(u + 1).forEach((b) => out.push({ a, b }));
    });
    const q = filter.trim().toLowerCase();
    if (!q) return out;
    return out.filter(
      ({ a, b }) => a.name.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)
    );
  }, [baskets, filter]);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFilter("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5" data-testid="pairs-basket-presets-btn">
          <Star className="w-3.5 h-3.5 text-amber-400" />
          Quick Pairs
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold">Basket Quick Presets</span>
          <span className="text-[10px] text-muted-foreground">{pairs.length} pairs</span>
        </div>
        <div className="px-2 py-1.5 border-b border-border/50">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter baskets..."
            className="h-7 text-xs"
            data-testid="pairs-basket-presets-filter"
          />
        </div>
        <div className="py-1 max-h-[60vh] overflow-y-auto">
          {pairs.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground">No matching pairs.</div>
          )}
          {pairs.map(({ a, b }) => (
            <button
              key={`${a.id}_${b.id}`}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50 transition-colors text-muted-foreground"
              onClick={() => {
                onPick(a.id, b.id);
                setOpen(false);
              }}
              data-testid={`pair-spec-a-basket-${a.id}`}
            >
              <Star className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
              <span className="font-mono text-foreground truncate">{a.name}</span>
              <span className="text-muted-foreground flex-shrink-0">/</span>
              <span className="font-mono text-foreground truncate">{b.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Ticker picker with searchable combobox
function TickerPicker({
  value,
  onChange,
  tickers,
  baskets = [],
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  tickers: TickerMeta[];
  baskets?: Basket[];
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Same six-level classification chips as the Charts-tab ticker carousel.
  const { classFilters, setClassFilters, classOptions, filtered: filteredTickers, anyActive } =
    useTickerClassFilter(tickers);
  // Collapsed by default so the ticker list is reachable without scrolling
  // past every basket; expansion is remembered across sessions.
  const [basketsOpen, setBasketsOpen] = useState<boolean>(() => {
    try { return localStorage.getItem("reit-viz:pairs-picker-baskets-open") === "1"; } catch { return false; }
  });
  const toggleBaskets = () => {
    setBasketsOpen((v) => {
      try { localStorage.setItem("reit-viz:pairs-picker-baskets-open", v ? "0" : "1"); } catch {}
      return !v;
    });
  };
  const searching = query.trim().length > 0;
  const showBasketItems = baskets.length > 0 && (basketsOpen || searching);
  const isBasket = value.startsWith("BASKET:");
  const basketId = isBasket ? value.slice(7) : null;
  const selectedBasket = basketId ? baskets.find((b) => b.id === basketId) : null;
  const displayValue = selectedBasket ? selectedBasket.name : value || "Select...";
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-7 w-[140px] justify-between px-2 font-mono font-bold text-xs ${
            isBasket ? "text-amber-300 border-amber-500/40" : ""
          }`}
          data-testid={testId}
        >
          <span className="truncate">{displayValue}</span>
          <span className="flex items-center gap-0.5 ml-1 flex-shrink-0">
            {anyActive && <Filter className="w-2.5 h-2.5 text-primary" />}
            <ChevronsUpDown className="w-3 h-3 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[440px] max-w-[560px] p-0" align="start">
        <ClassFilterRow
          filters={classFilters}
          onChange={setClassFilters}
          options={classOptions}
          testIdPrefix={testId}
        />
        <Command>
          <CommandInput
            placeholder="Search ticker or basket..."
            className="h-8 text-xs"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No match found.</CommandEmpty>
            {baskets.length > 0 && !searching && (
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-accent/50 transition-colors border-b border-border/50"
                onClick={toggleBaskets}
                data-testid={`${testId}-baskets-toggle`}
              >
                {basketsOpen ? (
                  <ChevronDown className="w-3 h-3 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 flex-shrink-0" />
                )}
                <Star className="w-3 h-3 text-amber-400 flex-shrink-0" />
                Baskets ({baskets.length})
              </button>
            )}
            {showBasketItems && (
              <CommandGroup heading={searching ? "Baskets" : undefined}>
                {baskets.map((b) => (
                  <CommandItem
                    key={b.id}
                    value={`BASKET:${b.id} ${b.name}`}
                    onSelect={() => {
                      onChange(`BASKET:${b.id}`);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={`w-3 h-3 mr-1.5 flex-shrink-0 ${
                        value === `BASKET:${b.id}` ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <Star className="w-3 h-3 mr-1 text-amber-400 flex-shrink-0" />
                    <span className="font-mono font-bold mr-1.5 text-amber-300">{b.name}</span>
                    <span className="text-muted-foreground text-[10px] truncate">
                      {b.tickers.slice(0, 4).join(", ")}
                      {b.tickers.length > 4 ? "…" : ""}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Tickers">
              {filteredTickers.map((t) => (
                <CommandItem
                  key={t.ticker}
                  value={`${t.ticker} ${t.name}`}
                  onSelect={() => {
                    onChange(t.ticker);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={`w-3 h-3 mr-1.5 flex-shrink-0 ${
                      value === t.ticker ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <span className="font-mono font-bold mr-1.5 whitespace-nowrap">{t.ticker}</span>
                  <span className="text-muted-foreground flex-1 min-w-0 truncate text-[10px]" title={t.name}>
                    {t.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Metric picker
function MetricPicker({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  const customMetrics = getCustomFundamentalMetrics();
  // Warm the tickers cache so the list below recomputes once it resolves.
  const { data: tickersMetaAll } = useQuery({ queryKey: ["/clf-tickers"], queryFn: getTickers });
  // Union curated metrics + the loaded universe's metrics + derived, grouped.
  const metricGroups = useMemo(() => {
    const s = new Set<string>([...Object.values(METRIC_OPTIONS).flat(), ...DERIVED_METRICS]);
    for (const t of tickersMetaAll || getTickersCacheSync() || []) for (const m of t.metrics || []) s.add(m);
    return groupMetricsByCategory([...s]);
  }, [tickersMetaAll]);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs w-auto min-w-[180px]" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
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

// Stat chip
function StatChip({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string;
  highlight?: "green" | "yellow" | "red";
}) {
  const colorClass =
    highlight === "red"
      ? "text-red-400"
      : highlight === "yellow"
      ? "text-amber-400"
      : highlight === "green"
      ? "text-emerald-400"
      : "text-foreground";

  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-mono font-semibold ${colorClass}`}>{value ?? "—"}</span>
    </div>
  );
}
