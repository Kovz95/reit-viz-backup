import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery } from "@tanstack/react-query";
import { getTickers, getPairsData, getCustomFundamentalMetrics } from "@/lib/dataService";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  CandlestickSeries,
  LineStyle,
  PriceScaleMode,
  createSeriesMarkers,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, ArrowRightLeft, Maximize2, Minimize2, TrendingUp, X, Layers, ChevronsUpDown, Check, ChevronLeft, ChevronRight, Copy, LayoutGrid, Eye, ListFilter, AlertTriangle, Info } from "lucide-react";
import { analyzePairSignals, signalLabel, signalValueFormat, reversionDir } from "@/lib/pairSignalAnalyzer";
import GridLayoutPicker, { gridContainerStyle, gridSlots, parseGrid } from "@/components/GridLayoutPicker";
import type { GridLayout } from "@/components/GridLayoutPicker";
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
} from "@/lib/indicators";
import type { HASmoothType, HASmoothConfig } from "@/lib/indicators";
import { INDICATOR_COLORS } from "@/lib/chartColors";
import { useIndicatorColors } from "@/lib/indicatorColorsContext";
import type { ActiveIndicators } from "@/components/ChartPane";
import { IndicatorColorEditor } from "@/components/IndicatorsPanel";
import ExportMenu from "@/components/ExportMenu";

const LOOKBACK_OPTIONS = [
  { label: "20d", value: 20 },
  { label: "60d", value: 60 },
  { label: "120d", value: 120 },
  { label: "250d", value: 250 },
];

// Stable empty indicators object — avoids re-creating {} on every render
const EMPTY_INDICATORS: ActiveIndicators = {};

// Default visible chart IDs (core 6)
const DEFAULT_VISIBLE_CHARTS = new Set(["prices", "ratio", "zscore", "percentileRank", "correlation", "olsScatter", "signalAnalyzer"]);

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
  },
  handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  handleScale: false,
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
      </div>
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
function PairsIndicatorsPanel({
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

  const meanCfg = activeIndicators.mean;
  const [meanRolling, setMeanRolling] = useState(meanCfg?.rolling ?? false);
  const [meanPeriod, setMeanPeriod] = useState(meanCfg?.period ?? 200);
  const [rsiPeriod, setRsiPeriod] = useState(
    typeof activeIndicators.rsi === "number" ? activeIndicators.rsi : 14
  );
  const [bbPeriod, setBbPeriod] = useState(activeIndicators.bollinger?.period ?? 20);
  const [bbMult, setBbMult] = useState(activeIndicators.bollinger?.mult ?? 2);
  const [atrPeriod, setAtrPeriod] = useState(typeof activeIndicators.atr === "number" ? activeIndicators.atr : 14);
  const [rocPeriod, setRocPeriod] = useState(typeof activeIndicators.roc === "number" ? activeIndicators.roc : 12);
  const [stochK, setStochK] = useState(activeIndicators.stochastic?.kPeriod ?? 14);
  const [stochD, setStochD] = useState(activeIndicators.stochastic?.dPeriod ?? 3);

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
    <div className="absolute right-0 top-0 bottom-0 w-[260px] border-l border-border bg-card/95 backdrop-blur overflow-y-auto z-30 flex-shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Indicators</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
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
        {/* ───── Moving Averages ───── */}
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Moving Averages</p>
        <MiniMaRow label="SMA" presets={[20, 50, 100, 200]} defaultLen={50}
          active={activeIndicators.sma}
          onToggle={(v) => setIndicators({ ...activeIndicators, sma: v })} />
        <MiniMaRow label="EMA" presets={[9, 21, 50, 100]} defaultLen={21}
          active={activeIndicators.ema}
          onToggle={(v) => setIndicators({ ...activeIndicators, ema: v })} />
        <MiniMaRow label="HMA" presets={[9, 20, 50, 100]} defaultLen={20}
          active={activeIndicators.hma}
          onToggle={(v) => setIndicators({ ...activeIndicators, hma: v })} />

        {/* ───── Oscillators ───── */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">Oscillators</p>
          {/* RSI */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">RSI</Label>
              <Switch checked={activeIndicators.rsi !== undefined}
                onCheckedChange={(on) => setIndicators({ ...activeIndicators, rsi: on ? rsiPeriod : undefined })} data-testid="toggle-rsi" />
            </div>
            <div className="flex gap-1 items-center">
              {[7, 14, 21].map((p) => (
                <Button key={p} variant={rsiPeriod === p ? "default" : "secondary"} size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => { setRsiPeriod(p); if (activeIndicators.rsi !== undefined) setIndicators({ ...activeIndicators, rsi: p }); }}>
                  {p}
                </Button>
              ))}
              <Input type="number" placeholder="#" className="h-6 w-14 text-[10px] px-1.5" min={2}
                onChange={(e) => { const n = parseInt(e.target.value); if (n > 1) { setRsiPeriod(n); if (activeIndicators.rsi !== undefined) setIndicators({ ...activeIndicators, rsi: n }); } }}
                data-testid="custom-rsi" />
            </div>
          </div>
          {/* MACD */}
          <div className="flex items-center justify-between mt-3">
            <Label className="text-xs font-medium">MACD (12, 26, 9)</Label>
            <Switch checked={!!activeIndicators.macd}
              onCheckedChange={(on) => setIndicators({ ...activeIndicators, macd: on || undefined })} data-testid="toggle-macd" />
          </div>
          {/* Stochastic */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Stochastic</Label>
              <Switch checked={activeIndicators.stochastic !== undefined}
                onCheckedChange={(on) => setIndicators({ ...activeIndicators, stochastic: on ? { kPeriod: stochK, dPeriod: stochD } : undefined })} data-testid="toggle-stochastic" />
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-8">%K:</span>
              {[9, 14, 21].map((p) => (
                <Button key={p} variant={stochK === p ? "default" : "secondary"} size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => { setStochK(p); if (activeIndicators.stochastic) setIndicators({ ...activeIndicators, stochastic: { kPeriod: p, dPeriod: stochD } }); }}>
                  {p}
                </Button>
              ))}
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-8">%D:</span>
              {[3, 5, 7].map((p) => (
                <Button key={p} variant={stochD === p ? "default" : "secondary"} size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => { setStochD(p); if (activeIndicators.stochastic) setIndicators({ ...activeIndicators, stochastic: { kPeriod: stochK, dPeriod: p } }); }}>
                  {p}
                </Button>
              ))}
            </div>
          </div>
          {/* ROC */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">ROC (Rate of Change)</Label>
              <Switch checked={activeIndicators.roc !== undefined}
                onCheckedChange={(on) => setIndicators({ ...activeIndicators, roc: on ? rocPeriod : undefined })} data-testid="toggle-roc" />
            </div>
            <div className="flex gap-1 items-center">
              {[9, 12, 20, 50].map((p) => (
                <Button key={p} variant={rocPeriod === p ? "default" : "secondary"} size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => { setRocPeriod(p); if (activeIndicators.roc !== undefined) setIndicators({ ...activeIndicators, roc: p }); }}>
                  {p}
                </Button>
              ))}
              <Input type="number" placeholder="#" className="h-6 w-14 text-[10px] px-1.5" min={1}
                onChange={(e) => { const n = parseInt(e.target.value); if (n > 0) { setRocPeriod(n); if (activeIndicators.roc !== undefined) setIndicators({ ...activeIndicators, roc: n }); } }}
                data-testid="custom-roc" />
            </div>
          </div>
        </div>

        {/* ───── Volatility ───── */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">Volatility</p>
          {/* Bollinger Bands */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Bollinger Bands</Label>
              <Switch checked={activeIndicators.bollinger !== undefined}
                onCheckedChange={(on) => setIndicators({ ...activeIndicators, bollinger: on ? { period: bbPeriod, mult: bbMult } : undefined })} data-testid="toggle-bollinger" />
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-12">Period:</span>
              {[10, 20, 50].map((p) => (
                <Button key={p} variant={bbPeriod === p ? "default" : "secondary"} size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => { setBbPeriod(p); if (activeIndicators.bollinger) setIndicators({ ...activeIndicators, bollinger: { period: p, mult: bbMult } }); }}>
                  {p}
                </Button>
              ))}
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-12">Width:</span>
              {[1, 1.5, 2, 2.5, 3].map((m) => (
                <Button key={m} variant={bbMult === m ? "default" : "secondary"} size="sm"
                  className="h-6 px-1.5 text-[10px] flex-1"
                  onClick={() => { setBbMult(m); if (activeIndicators.bollinger) setIndicators({ ...activeIndicators, bollinger: { period: bbPeriod, mult: m } }); }}>
                  {m}σ
                </Button>
              ))}
            </div>
          </div>
          {/* ATR */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">ATR</Label>
              <Switch checked={activeIndicators.atr !== undefined}
                onCheckedChange={(on) => setIndicators({ ...activeIndicators, atr: on ? atrPeriod : undefined })} data-testid="toggle-atr" />
            </div>
            <div className="flex gap-1 items-center">
              {[7, 14, 21].map((p) => (
                <Button key={p} variant={atrPeriod === p ? "default" : "secondary"} size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => { setAtrPeriod(p); if (activeIndicators.atr !== undefined) setIndicators({ ...activeIndicators, atr: p }); }}>
                  {p}
                </Button>
              ))}
              <Input type="number" placeholder="#" className="h-6 w-14 text-[10px] px-1.5" min={2}
                onChange={(e) => { const n = parseInt(e.target.value); if (n > 1) { setAtrPeriod(n); if (activeIndicators.atr !== undefined) setIndicators({ ...activeIndicators, atr: n }); } }}
                data-testid="custom-atr" />
            </div>
          </div>
        </div>

        {/* ───── Overlays ───── */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">Overlays</p>
          {/* VWAP */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">VWAP</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Cumulative avg overlay</p>
            </div>
            <Switch checked={!!activeIndicators.vwap}
              onCheckedChange={(on) => setIndicators({ ...activeIndicators, vwap: on || undefined })} data-testid="toggle-vwap" />
          </div>
        </div>

        {/* ───── Volume ───── */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">Volume</p>
          {/* OBV */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">OBV</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">On Balance Volume sub-pane</p>
            </div>
            <Switch checked={!!activeIndicators.obv}
              onCheckedChange={(on) => setIndicators({ ...activeIndicators, obv: on || undefined })} data-testid="toggle-obv" />
          </div>
        </div>

        {/* ───── Trend ───── */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">Trend</p>
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
        </div>

        {/* ───── Statistical ───── */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">Statistical</p>
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
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground">
            MAs, Bollinger, and VWAP overlay the chart. RSI, MACD, ATR, ROC, Stochastic, and OBV render in sub-panes below. Select which chart to apply to above.
          </p>
        </div>

        {/* Colors editor */}
        <IndicatorColorEditor />
      </div>
    </div>
  );
}

function MiniMaRow({ label, presets, defaultLen, active, onToggle }: {
  label: string; presets: number[]; defaultLen: number;
  active: number | undefined; onToggle: (v: number | undefined) => void;
}) {
  const [len, setLen] = useState(active ?? defaultLen);
  const [custom, setCustom] = useState("");
  const applyLen = (n: number) => { setLen(n); if (active !== undefined) onToggle(n); };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <Switch checked={active !== undefined} onCheckedChange={(on) => onToggle(on ? len : undefined)} />
      </div>
      <div className="flex gap-1 items-center">
        {presets.map((p) => (
          <Button key={p} variant={len === p ? "default" : "secondary"} size="sm"
            className="h-5 px-2 text-[10px] flex-1" onClick={() => applyLen(p)}>
            {p}
          </Button>
        ))}
        <Input
          type="number"
          placeholder="Custom"
          className="h-5 w-16 text-[10px] px-1.5"
          value={custom}
          min={1}
          onChange={(e) => {
            setCustom(e.target.value);
            const n = parseInt(e.target.value);
            if (n > 0) applyLen(n);
          }}
          data-testid={`custom-${label.toLowerCase()}`}
        />
      </div>
    </div>
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
type PairsSubChartType = "rsi" | "macd" | "ha" | "roc" | "stochastic" | "atr" | "obv";

const SUB_CHART_HEIGHT = 70;

function getActiveSubCharts(indicators: ActiveIndicators): PairsSubChartType[] {
  const out: PairsSubChartType[] = [];
  if (typeof indicators.rsi === "number") out.push("rsi");
  if (indicators.macd) out.push("macd");
  // HA is now rendered as an overlay inside MiniChart, not as a sub-pane
  // if (indicators.heikinAshi) out.push("ha");
  if (typeof indicators.roc === "number") out.push("roc");
  if (indicators.stochastic) out.push("stochastic");
  if (typeof indicators.atr === "number") out.push("atr");
  if (indicators.obv) out.push("obv");
  return out;
}

// ── Sub-chart for oscillators rendered below the main Pairs MiniChart ──
function PairsSubIndicatorChart({
  type,
  closeData,
  activeIndicators,
  parentChart,
  parentSeries,
}: {
  type: PairsSubChartType;
  closeData: DataPoint[];
  activeIndicators: ActiveIndicators;
  parentChart: IChartApi | null;
  parentSeries: ISeriesApi<any> | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const syncingRef = useRef(false);
  const { colors: IC } = useIndicatorColors();

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
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)", minimumWidth: 80 },
      timeScale: { borderColor: "rgba(255,255,255,0.06)", visible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: false,
    });
    chartRef.current = chart;

    let firstSeries: ISeriesApi<any> | null = null;

    // RSI
    if (type === "rsi" && typeof activeIndicators.rsi === "number") {
      const rsiData = computeRSI(closeData, activeIndicators.rsi);
      if (rsiData.length > 0) {
        const rsiLine = chart.addSeries(LineSeries, {
          color: IC.rsi_line, lineWidth: 1,
          title: `RSI ${activeIndicators.rsi}`,
        });
        rsiLine.setData(rsiData.map(d => ({ time: d.time as Time, value: d.value })));
        firstSeries = rsiLine;
        const first = rsiData[0].time as Time;
        const last = rsiData[rsiData.length - 1].time as Time;
        for (const [level, clr] of [[70, IC.rsi_overbought], [30, IC.rsi_oversold]] as [number, string][]) {
          const ref = chart.addSeries(LineSeries, {
            color: clr, lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", crosshairMarkerVisible: false,
          });
          ref.setData([{ time: first, value: level }, { time: last, value: level }]);
        }
        chart.timeScale().fitContent();
      }
    }

    // MACD
    if (type === "macd" && activeIndicators.macd) {
      const macd = computeMACD(closeData, 12, 26, 9);
      if (macd.macdLine.length > 0) {
        const ml = chart.addSeries(LineSeries, {
          color: IC.macd_line, lineWidth: 1, title: "MACD",
        });
        ml.setData(macd.macdLine.map(d => ({ time: d.time as Time, value: d.value })));
        firstSeries = ml;
        const sl = chart.addSeries(LineSeries, {
          color: IC.macd_signal, lineWidth: 1, title: "Signal", crosshairMarkerVisible: false,
        });
        sl.setData(macd.signalLine.map(d => ({ time: d.time as Time, value: d.value })));
        if (macd.macdLine.length >= 2) {
          const zl = chart.addSeries(LineSeries, {
            color: "rgba(255,255,255,0.15)", lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", crosshairMarkerVisible: false,
          });
          zl.setData([
            { time: macd.macdLine[0].time as Time, value: 0 },
            { time: macd.macdLine[macd.macdLine.length - 1].time as Time, value: 0 },
          ]);
        }
        chart.timeScale().fitContent();
      }
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

    // ROC
    if (type === "roc" && typeof activeIndicators.roc === "number") {
      const rocData = computeROC(closeData, activeIndicators.roc);
      if (rocData.length > 0) {
        const rocLine = chart.addSeries(LineSeries, {
          color: IC.roc, lineWidth: 1, title: `ROC ${activeIndicators.roc}`,
        });
        rocLine.setData(rocData.map(d => ({ time: d.time as Time, value: d.value })));
        firstSeries = rocLine;
        if (rocData.length >= 2) {
          const zl = chart.addSeries(LineSeries, {
            color: "rgba(255,255,255,0.15)", lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", crosshairMarkerVisible: false,
          });
          zl.setData([
            { time: rocData[0].time as Time, value: 0 },
            { time: rocData[rocData.length - 1].time as Time, value: 0 },
          ]);
        }
        chart.timeScale().fitContent();
      }
    }

    // Stochastic
    if (type === "stochastic" && activeIndicators.stochastic) {
      const { kPeriod, dPeriod } = activeIndicators.stochastic;
      const stoch = computeStochastic(closeData, kPeriod, dPeriod);
      if (stoch.k.length > 0) {
        const kLine = chart.addSeries(LineSeries, {
          color: IC.stoch_k, lineWidth: 1, title: `%K(${kPeriod})`,
        });
        kLine.setData(stoch.k.map(d => ({ time: d.time as Time, value: d.value })));
        firstSeries = kLine;
        if (stoch.d.length > 0) {
          const dLine = chart.addSeries(LineSeries, {
            color: IC.stoch_d, lineWidth: 1, title: `%D(${dPeriod})`, crosshairMarkerVisible: false,
          });
          dLine.setData(stoch.d.map(d => ({ time: d.time as Time, value: d.value })));
        }
        const first = stoch.k[0].time as Time;
        const last = stoch.k[stoch.k.length - 1].time as Time;
        for (const [level, clr] of [[80, IC.stoch_overbought], [20, IC.stoch_oversold]] as [number, string][]) {
          const ref = chart.addSeries(LineSeries, {
            color: clr, lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", crosshairMarkerVisible: false,
          });
          ref.setData([{ time: first, value: level }, { time: last, value: level }]);
        }
        chart.timeScale().fitContent();
      }
    }

    // ATR
    if (type === "atr" && typeof activeIndicators.atr === "number") {
      const atrData = computeATR(closeData, activeIndicators.atr);
      if (atrData.length > 0) {
        const atrLine = chart.addSeries(LineSeries, {
          color: IC.atr, lineWidth: 1, title: `ATR ${activeIndicators.atr}`,
        });
        atrLine.setData(atrData.map(d => ({ time: d.time as Time, value: d.value })));
        firstSeries = atrLine;
        chart.timeScale().fitContent();
      }
    }

    // OBV
    if (type === "obv" && activeIndicators.obv) {
      const obvData = computeOBV(closeData);
      if (obvData.length > 0) {
        const obvLine = chart.addSeries(LineSeries, {
          color: IC.obv, lineWidth: 1, title: "OBV",
        });
        obvLine.setData(obvData.map(d => ({ time: d.time as Time, value: d.value })));
        firstSeries = obvLine;
        chart.timeScale().fitContent();
      }
    }

    // Sync time scale with parent chart using TIME-based range (not logical range)
    // because indicator data may have fewer points than the parent (e.g. HA skips
    // the first data point), so logical indices don't map to the same calendar dates.
    if (parentChart) {
      // Track which chart initiated the sync to prevent infinite feedback loops.
      // Callbacks fire asynchronously so a simple boolean guard isn't enough.
      let syncSource: "parent" | "sub" | null = null;

      const syncToSub = () => {
        if (syncSource === "sub") return;
        syncSource = "parent";
        try {
          const range = parentChart.timeScale().getVisibleRange();
          if (range) chart.timeScale().setVisibleRange(range);
        } catch {}
        requestAnimationFrame(() => { syncSource = null; });
      };
      const syncToParent = () => {
        if (syncSource === "parent") return;
        syncSource = "sub";
        try {
          const range = chart.timeScale().getVisibleRange();
          if (range) parentChart.timeScale().setVisibleRange(range);
        } catch {}
        requestAnimationFrame(() => { syncSource = null; });
      };
      parentChart.timeScale().subscribeVisibleLogicalRangeChange(syncToSub);
      chart.timeScale().subscribeVisibleLogicalRangeChange(syncToParent);

      // Initial sync — use requestAnimationFrame to ensure both charts are fully rendered
      requestAnimationFrame(() => {
        try {
          const range = parentChart.timeScale().getVisibleRange();
          if (range) chart.timeScale().setVisibleRange(range);
        } catch {}
      });

      // Parent → Sub crosshair sync
      if (firstSeries) {
        const handleParentCrosshair = (param: any) => {
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

      // Sub → Parent crosshair sync (bidirectional)
      if (parentSeries) {
        chart.subscribeCrosshairMove((param: any) => {
          if (syncingRef.current) return;
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

    return () => {
      chartRef.current = null;
      try { chart.remove(); } catch {}
    };
  }, [closeData, activeIndicators, type, parentChart, parentSeries, IC]);

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

  const label = type === "rsi" ? "RSI" : type === "macd" ? "MACD" : type === "ha" ? "Heikin-Ashi"
    : type === "atr" ? "ATR" : type === "roc" ? "ROC" : type === "stochastic" ? "Stochastic" : type === "obv" ? "OBV" : type;

  return (
    <div className="relative w-full border-t border-border/30 flex-shrink-0" style={{ height: type === "ha" ? 100 : SUB_CHART_HEIGHT }}>
      <div className="absolute left-2 z-10 mt-0.5">
        <span className="text-[9px] font-mono text-muted-foreground/50 bg-background/80 px-1 py-0.5 rounded">
          {label}
        </span>
      </div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

// ── MiniChart with indicator support + maximize button ──
function MiniChart({
  data,
  title,
  color,
  height,
  useFlexHeight,
  refLines,
  secondaryData,
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
}: {
  data: DataPoint[];
  title: string;
  color: string;
  height: number;
  useFlexHeight?: boolean;
  refLines?: { value: number; color: string; style: number; label?: string }[];
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
}) {
  const effectiveFlexHeight = useFlexHeight || isMaximized;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { colors: IC } = useIndicatorColors();
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const [logScale, setLogScale] = useState(false);
  // Counter that increments when chart + main series are ready, to trigger re-render
  // so sub-charts receive the actual parentChart/parentSeries refs (not null).
  const [chartReady, setChartReady] = useState(0);

  // Serialize activeIndicators to a stable string so the effect only fires when values actually change
  const indicatorsKey = useMemo(() => JSON.stringify(activeIndicators), [activeIndicators]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (chartRef.current) {
      onUnregisterChart(id);
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(el, {
      ...CHART_OPTIONS,
      width: el.clientWidth,
      height: effectiveFlexHeight ? el.clientHeight || 300 : height,
    });
    chartRef.current = chart;
    onRegisterChart(id, chart, data.length);

    // Main series
    const mainSeries = chart.addSeries(LineSeries, {
      color,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 3,
    });
    mainSeries.setData(data.map((d) => ({ time: d.time as Time, value: d.value })));
    mainSeriesRef.current = mainSeries;
    onRegisterSeries(id, mainSeries);
    // Signal sub-charts that parentChart/parentSeries refs are now set
    setChartReady(c => c + 1);

    // Secondary series
    if (secondaryData && secondaryColor) {
      const sec = chart.addSeries(LineSeries, {
        color: secondaryColor,
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: true,
        priceScaleId: "right2",
      });
      sec.setData(secondaryData.map((d) => ({ time: d.time as Time, value: d.value })));
      sec.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
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

    // ── Indicators on main data ──
    if (data.length > 0) {
      // SMA
      if (activeIndicators.sma) {
        const smaData = computeSMA(data, activeIndicators.sma);
        if (smaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.sma, lineWidth: 1,
            title: `SMA ${activeIndicators.sma}`, lineStyle: LineStyle.Dashed,
          });
          s.setData(smaData.map(d => ({ time: d.time as Time, value: d.value })));
        }
      }
      // EMA
      if (activeIndicators.ema) {
        const emaData = computeEMA(data, activeIndicators.ema);
        if (emaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.ema, lineWidth: 1,
            title: `EMA ${activeIndicators.ema}`,
          });
          s.setData(emaData.map(d => ({ time: d.time as Time, value: d.value })));
        }
      }
      // HMA
      if (activeIndicators.hma) {
        const hmaData = computeHMA(data, activeIndicators.hma);
        if (hmaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.hma, lineWidth: 2,
            title: `HMA ${activeIndicators.hma}`,
          });
          s.setData(hmaData.map(d => ({ time: d.time as Time, value: d.value })));
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
      // Bollinger Bands (overlay)
      if (activeIndicators.bollinger) {
        const { period: bbP, mult: bbM } = activeIndicators.bollinger;
        const bb = computeBollingerBands(data, bbP, bbM);
        if (bb.basis.length > 0) {
          const basisLine = chart.addSeries(LineSeries, {
            color: IC.bollinger_basis, lineWidth: 1,
            title: `BB ${bbP},${bbM}`, lineStyle: LineStyle.LargeDashed,
          });
          basisLine.setData(bb.basis.map(d => ({ time: d.time as Time, value: d.value })));
          const upperLine = chart.addSeries(LineSeries, {
            color: IC.bollinger_band, lineWidth: 1,
            title: `Upper`, lineStyle: LineStyle.Dotted,
          });
          upperLine.setData(bb.upper.map(d => ({ time: d.time as Time, value: d.value })));
          const lowerLine = chart.addSeries(LineSeries, {
            color: IC.bollinger_band, lineWidth: 1,
            title: `Lower`, lineStyle: LineStyle.Dotted,
          });
          lowerLine.setData(bb.lower.map(d => ({ time: d.time as Time, value: d.value })));
        }
      }
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

    // Crosshair value reporting
    const crosshairCb = (param: any) => {
      if (!param.time || !param.seriesData) {
        onCrosshairMove?.(id, null);
        return;
      }
      const values: Record<string, number> = {};
      param.seriesData.forEach((dataPoint: any, series: any) => {
        const val = dataPoint?.value ?? dataPoint?.close;
        if (val !== undefined && val !== null) {
          const seriesTitle = series.options?.()?.title || title;
          values[seriesTitle || title] = val;
        }
      });
      if (Object.keys(values).length > 0) {
        onCrosshairMove?.(id, { time: String(param.time), values });
      }
    };
    chart.subscribeCrosshairMove(crosshairCb);

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (chartRef.current && el) {
        chartRef.current.applyOptions({
          width: el.clientWidth,
          height: effectiveFlexHeight ? el.clientHeight || 300 : height,
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      try { chart.unsubscribeCrosshairMove(crosshairCb); } catch {}
      onCrosshairMove?.(id, null);
      onUnregisterChart(id);
      chart.remove();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, secondaryData, color, secondaryColor, height, id, indicatorsKey, isMaximized, effectiveFlexHeight, IC]);

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

  const subCharts = getActiveSubCharts(activeIndicators);

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
      </div>
      <div ref={containerRef} style={effectiveFlexHeight ? { flex: 1 } : { height }} className={effectiveFlexHeight ? "flex-1 min-h-0" : ""} />
      {/* Sub-pane indicator charts (MACD, RSI, Stochastic, ROC, ATR, OBV) */}
      {subCharts.map(sc => (
        <PairsSubIndicatorChart
          key={sc}
          type={sc}
          closeData={data}
          activeIndicators={activeIndicators}
          parentChart={chartRef.current}
          parentSeries={mainSeriesRef.current}
        />
      ))}
    </div>
  );
}

export default function Pairs() {
  const [tickerA, setTickerA] = useState("ESS");
  const [tickerB, setTickerB] = useState("MAA");
  const [metricA, setMetricA] = useState("close");
  const [metricB, setMetricB] = useState("close");
  const [zWindow, setZWindow] = useState(60);
  const [betaLookback, setBetaLookback] = useState(52);
  const [spreadZWindow, setSpreadZWindow] = useState(8);
  const [olsResidWindow, setOlsResidWindow] = useState(52);
  // Bands mode (static vs expanding) for mean/std bands rendering
  const [bandsMode, setBandsMode] = useState<"static" | "expanding">("static");
  // EG-spread β mode (rolling/OOS-clean vs full-sample in-sample) for Beta-Adjusted Spread chart
  const [egBetaMode, setEgBetaMode] = useState<"rolling" | "insample">("rolling");

  const [search, setSearch] = useState("");
  const [maximizedChart, setMaximizedChart] = useState<string | null>(null);
  const [showIndicators, setShowIndicators] = useState(false);
  // Per-chart indicator state: chartId → ActiveIndicators
  const [indicatorsMap, setIndicatorsMap] = useState<Record<string, ActiveIndicators>>({});
  const [indicatorChartId, setIndicatorChartId] = useState<string>("prices");
  const [pairsLayout, setPairsLayout] = useState<GridLayout>("1x1");
  // Which chart IDs are toggled on
  const [visibleChartIds, setVisibleChartIds] = useState<Set<string>>(() => new Set(DEFAULT_VISIBLE_CHARTS));

  const serializePairs = useCallback(() => ({
    tickerA,
    tickerB,
    metricA,
    metricB,
    zWindow,
    betaLookback,
    spreadZWindow,
    olsResidWindow,
    pairsLayout,
    visibleChartIds: [...visibleChartIds],
    indicatorsMap,
  }), [tickerA, tickerB, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow, pairsLayout, visibleChartIds, indicatorsMap]);

  const restorePairs = useCallback((state: any) => {
    if (state.tickerA !== undefined) setTickerA(state.tickerA);
    if (state.tickerB !== undefined) setTickerB(state.tickerB);
    if (state.metricA !== undefined) setMetricA(state.metricA);
    if (state.metricB !== undefined) setMetricB(state.metricB);
    if (state.zWindow !== undefined) setZWindow(state.zWindow);
    if (state.betaLookback !== undefined) setBetaLookback(state.betaLookback);
    if (state.spreadZWindow !== undefined) setSpreadZWindow(state.spreadZWindow);
    if (state.olsResidWindow !== undefined) setOlsResidWindow(state.olsResidWindow);
    if (state.pairsLayout !== undefined) setPairsLayout(state.pairsLayout);
    if (state.visibleChartIds) setVisibleChartIds(new Set(state.visibleChartIds));
    if (state.indicatorsMap !== undefined) setIndicatorsMap(state.indicatorsMap);
  }, []);

  useWorkspaceTab("pairs", serializePairs, restorePairs);

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
  const chartsMapRef = useRef(new Map<string, IChartApi>());
  const seriesMapRef = useRef(new Map<string, ISeriesApi<any>>());
  const syncingRef = useRef(false);
  const syncHandlersRef = useRef(new Map<string, { rangeHandler: (r: any) => void; crosshairHandler: (p: any) => void }>());
  const dataLengthsRef = useRef(new Map<string, number>());

  const registerChart = useCallback((id: string, chart: IChartApi, dataLength?: number) => {
    chartsMapRef.current.set(id, chart);
    if (dataLength != null) dataLengthsRef.current.set(id, dataLength);
    setupSync(id, chart);
    // After a short delay, sync this chart to the first registered chart's time range
    // This ensures charts with different data start points align on initial load
    requestAnimationFrame(() => {
      const entries = Array.from(chartsMapRef.current.entries());
      if (entries.length < 2) return;
      // Use the "prices" chart as reference, or fall back to the first chart
      const refEntry = entries.find(([eid]) => eid === "prices") || entries[0];
      if (refEntry[0] === id) return; // Don't sync to self
      try {
        const refRange = refEntry[1].timeScale().getVisibleLogicalRange();
        if (refRange) chart.timeScale().setVisibleLogicalRange(refRange);
      } catch {}
    });
  }, []);

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
    dataLengthsRef.current.delete(id);
  }, []);

  const registerSeries = useCallback((id: string, series: ISeriesApi<any>) => {
    seriesMapRef.current.set(id, series);
  }, []);

  const setupSync = useCallback((id: string, chart: IChartApi) => {
    // Clamp a logical range so it doesn't scroll past data boundaries.
    // Allows a small buffer of 20 bars of whitespace on either side.
    const clampRange = (range: { from: number; to: number }): { from: number; to: number } | null => {
      const maxLen = Math.max(1, ...Array.from(dataLengthsRef.current.values()));
      const pad = 20;
      let { from, to } = range;
      const barCount = to - from;
      let clamped = false;
      if (to > maxLen - 1 + pad) {
        to = maxLen - 1 + pad;
        from = to - barCount;
        clamped = true;
      }
      if (from < -pad) {
        from = -pad;
        to = from + barCount;
        clamped = true;
      }
      return clamped ? { from, to } : null;
    };

    // Scroll/zoom sync using LOGICAL range (bar indices) so charts
    // with different data start points align correctly without feedback loops
    const rangeHandler = () => {
      if (syncingRef.current) return;
      const logicalRange = chart.timeScale().getVisibleLogicalRange();
      if (!logicalRange) return;

      // Clamp the range to prevent scrolling past data boundaries
      const clampedRange = clampRange(logicalRange);
      const rangeToSync = clampedRange || logicalRange;

      syncingRef.current = true;
      if (clampedRange) {
        try { chart.timeScale().setVisibleLogicalRange(clampedRange); } catch {}
      }
      chartsMapRef.current.forEach((other, otherId) => {
        if (otherId !== id) {
          try { other.timeScale().setVisibleLogicalRange(rangeToSync); } catch {}
        }
      });
      // Use rAF to clear the flag after all sync callbacks have fired
      requestAnimationFrame(() => { syncingRef.current = false; });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);

    // Crosshair sync
    const crosshairHandler = (param: any) => {
      if (syncingRef.current) return;
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

  // Ticker list
  const { data: tickers } = useQuery<TickerMeta[]>({
    queryKey: ["tickers"],
    queryFn: getTickers,
  });

  // Pairs data
  const { data: pairsData, isLoading } = useQuery<PairsData>({
    queryKey: ["pairs", tickerA, tickerB, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow],
    queryFn: () => getPairsData(tickerA, tickerB, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow),
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
    const header = `Date,${tickerA} ${metricA},${tickerB} ${metricB},Ratio,Log Ratio,Z-Score (${zWindow}d),Spread Z (${betaLookback}/${spreadZWindow}d),OLS Resid Z (${olsResidWindow}d),Pct Rank,Correlation (${zWindow}d),Rolling Beta,Beta-Adj Spread,Rolling R2`;
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
    a.download = `pairs_${tickerA}_${tickerB}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pairsData, tickerA, tickerB, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow]);

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
        title: `${tickerA} vs ${tickerB} — ${metricA === metricB ? metricA : metricA + " / " + metricB}`,
        secondaryLabel: `${tickerA} (blue) · ${tickerB} (orange)`,
        color: "#0ea5e9",
        secondaryColor: "#f59e0b",
        height: priceH,
        refLines: undefined,
      },
      {
        id: "ratio",
        data: pairsData.ratio,
        title: `Ratio (${tickerA} / ${tickerB})`,
        color: "#22c55e",
        height: ratioH,
      },
      {
        id: "logRatio",
        data: pairsData.logRatio,
        title: `Log Ratio — ln(${tickerA} / ${tickerB})`,
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
        title: `Ratio Percentile Rank (${tickerA} / ${tickerB})`,
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
        title: `Spread (${tickerA} − ${tickerB})`,
        color: "#14b8a6",
        height: ratioH,
        refLines: [{ value: 0, color: "rgba(255,255,255,0.15)", style: LineStyle.Dashed }],
      },
      {
        id: "rollingBeta",
        data: pairsData.rollingBeta,
        title: `Rolling Beta (${tickerA} vs ${tickerB}, ${zWindow}d)`,
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
  }, [pairsData, tickerA, tickerB, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow]);

  return (
    <div className="flex flex-col h-full bg-background" data-testid="pairs-page">
      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">A</span>
        <TickerPicker value={tickerA} onChange={setTickerA} tickers={tickers || []} testId="pairs-ticker-a" />

        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
          onClick={handleSwap} data-testid="pairs-swap" title="Swap tickers">
          <ArrowRightLeft className="w-3.5 h-3.5" />
        </Button>

        <span className="text-xs font-semibold text-muted-foreground">B</span>
        <TickerPicker value={tickerB} onChange={setTickerB} tickers={tickers || []} testId="pairs-ticker-b" />

        <div className="h-5 w-px bg-border mx-1" />

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

        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
          onClick={exportCSV} data-testid="pairs-csv">
          <Download className="w-3 h-3" />
          CSV
        </Button>
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
          {pairsCrosshairData && (
            <>
              <div className="h-4 w-px bg-border" />
              <span className="text-[10px] font-mono text-muted-foreground">{pairsCrosshairData.time}</span>
              {Object.entries(pairsCrosshairData.values).map(([key, val]) => (
                <span key={key} className="text-[10px] font-mono whitespace-nowrap">
                  <span className="text-muted-foreground">{key}: </span>
                  <span className="text-foreground font-semibold">{typeof val === "number" ? val.toFixed(4) : val}</span>
                </span>
              ))}
            </>
          )}
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
          const showSignalAnalyzer = visibleChartIds.has("signalAnalyzer") && (maximizedChart === null || maximizedChart === "signalAnalyzer");
          const totalItems = visibleCharts.length + (showOlsScatter ? 1 : 0) + (showSignalAnalyzer ? 1 : 0);
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
                    />
                  ))}
                  {/* OLS Scatter chart */}
                  {pairsData && showOlsScatter && (
                    <OlsScatterChart
                      priceA={pairsData.priceA}
                      priceB={pairsData.priceB}
                      tickerA={tickerA}
                      tickerB={tickerB}
                      isMaximized={maximizedChart === "olsScatter"}
                      onMaximize={setMaximizedChart}
                    />
                  )}
                  {/* Predictive Signals chart */}
                  {pairsData && showSignalAnalyzer && (
                    <SignalAnalyzerChart
                      priceA={pairsData.priceA}
                      priceB={pairsData.priceB}
                      tickerA={tickerA}
                      tickerB={tickerB}
                      isMaximized={maximizedChart === "signalAnalyzer"}
                      onMaximize={setMaximizedChart}
                    />
                  )}
                </>
              )}
            </div>
          );
        })()}

        {showIndicators && (
          <PairsIndicatorsPanel
            charts={chartConfigs.map(c => ({ id: c.id, title: c.title }))}
            indicatorsMap={indicatorsMap}
            activeChartId={indicatorChartId}
            onSelectChart={setIndicatorChartId}
            onChangeIndicators={(chartId, indicators) =>
              setIndicatorsMap(prev => ({ ...prev, [chartId]: indicators }))
            }
            onClose={() => setShowIndicators(false)}
          />
        )}
      </div>
    </div>
  );
}

// Ticker picker with searchable combobox
function TickerPicker({
  value,
  onChange,
  tickers,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  tickers: TickerMeta[];
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-[120px] justify-between px-2 font-mono font-bold text-xs"
          data-testid={testId}
        >
          {value || "Select..."}
          <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search ticker..." className="h-8 text-xs" />
          <CommandList className="max-h-[250px]">
            <CommandEmpty>No ticker found.</CommandEmpty>
            <CommandGroup>
              {tickers.map((t) => (
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
                  <span className="font-mono font-bold mr-1.5">{t.ticker}</span>
                  <span className="text-muted-foreground truncate text-[10px]">
                    {t.name.length > 22 ? t.name.slice(0, 22) + "…" : t.name}
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
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs w-[140px]" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(METRIC_OPTIONS).map(([cat, metrics]) => (
          <div key={cat}>
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {cat}
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
