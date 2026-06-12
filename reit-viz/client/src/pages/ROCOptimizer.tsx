// Reconstructed from recovered-bundle/ROCOptimizer-BRhXmIfg.js on 2026-06-12

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as React from "react";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/useBaskets";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { BasketPicker } from "@/components/BasketPicker";
import { buildBasketOhlc, getBasketOhlc } from "@/lib/basketOhlc";
import { PresetBar } from "@/components/PresetBar";
import { UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { BasketTickerPill } from "@/components/BasketTickerPill";
import { buildBacktestResult as buildBacktestResult, EvaluatorPanelResult, EvaluatorPanelLoader } from "@/components/EvaluatorPanel";
import { computeROC, ROC_SIGNAL_HANDLERS, detectSignals, SIGNAL_META } from "@/lib/rocSignalDetect";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { getTickers, getDates, getGroupMedianByIndex } from "@/lib/dataService";
import { filterByDateRange, fetchInputSeries } from "@/lib/optimizerInputSeries";
import { getTickerRaw } from "@/lib/dataService";
import { defaultInputSelection } from "@/lib/optimizerInputSeries";
import { DATE_PRESETS, createDateRangeFromPreset } from "@/lib/forwardReturns";
import { downsampleWeekly, mapWeeklyIndexToDaily } from "@/lib/weeklyDownsample";
import { computeForwardProfile, summarizeSignals, computeCompositeScore } from "@/lib/forwardReturns";
import { TARGET_RETURN_OPTIONS, RETURN_BAND_PRESETS } from "@/lib/optimizerConstants";
import { scoreTextColor, hitRateColor, pctSigned, profitFactorColor } from "@/lib/forwardReturns";
import { FORWARD_HORIZONS } from "@/lib/forwardReturns";
import { getScoreWeights, pickBestByRankMode } from "@/lib/forwardReturns";
import { isBasketTicker } from "@/lib/basketUtils";
import { refreshTickerData } from "@/lib/dataService";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { InputSeriesPicker } from "@/components/InputSeriesPicker";
import { useUniverse } from "@/lib/universeContext";
import { CLASSIFICATION_DIMENSION_KEYS } from "@/lib/dataService";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import "@/lib/harsi";
import "@/lib/tva";
import "@/lib/globalUniverse";
import "@/lib/classificationFiltersWithSource";

// ─── Constants ───────────────────────────────────────────────────────────────

const BULL_CATEGORIES = [
  "roc_zero_up",
  "roc_thresh_up",
  "roc_thresh_down_rev",
  "roc_fast_above",
  "roc_slope_up",
  "roc_curv_up",
];

const BEAR_CATEGORIES = [
  "roc_zero_down",
  "roc_thresh_down",
  "roc_thresh_up_rev",
  "roc_fast_below",
  "roc_slope_down",
  "roc_curv_down",
];

const ZERO_CROSS_PERIODS = [5, 10, 14, 20, 30, 50, 100, 200];
const FAST_SLOW_PAIRS: [number, number][] = [
  [5, 20],
  [10, 30],
  [10, 50],
  [14, 50],
  [20, 50],
  [20, 100],
  [50, 100],
  [50, 200],
];
const THRESHOLD_VALUES = [0.02, 0.05, 0.1];
const SLOPE_LOOKBACKS = [3, 5, 10];

// ─── Types ────────────────────────────────────────────────────────────────────

interface RocConfig {
  signalType: string;
  period: number;
  slowPeriod?: number;
  threshold?: number;
  slopeLookback?: number;
}

interface SignalDate {
  date: string;
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
}

interface CategoryResult {
  category: string;
  label: string;
  description: string;
  summary: any;
  composite: any;
  signalDates?: SignalDate[];
  profiles?: any[];
}

interface ConfigResult {
  config: RocConfig;
  configLabel: string;
  categories: CategoryResult[];
  bestCategory: string;
  bestScore: number;
}

interface TickerResult {
  ticker: string;
  name: string;
  configs: ConfigResult[];
  bestCategory: string;
  bestScore: number;
  currentSignal: string;
  currentROCByPeriod: Record<number, number>;
  currentSlowROCByPeriod: Record<number, number>;
  priceContext: any;
}

interface GridTickerResult {
  ticker: string;
  name: string;
  topCombos: GridCombo[];
}

interface GridCombo {
  configLabel: string;
  config: RocConfig;
  bullSummary: any;
  bullScore: number;
  bullSignals: number;
  bearSummary: any;
  bearScore: number;
  bearSignals: number;
  bestSide: string;
  bestScore: number;
  bullDates?: SignalDate[];
  bearDates?: SignalDate[];
}

interface SortState {
  col: string;
  dir: "asc" | "desc";
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function buildConfigLabel(cfg: RocConfig): string {
  switch (cfg.signalType) {
    case "zero_cross":
      return `ROC(${cfg.period}) cross 0`;
    case "threshold_cross":
      return `ROC(${cfg.period}) cross ±${pctSigned(cfg.threshold ?? 0.05)}`;
    case "threshold_reversion":
      return `ROC(${cfg.period}) ±${pctSigned(cfg.threshold ?? 0.05)} reversion`;
    case "fast_slow_cross":
      return `ROC fast=${cfg.period} vs slow=${cfg.slowPeriod ?? 0}`;
    case "slope_curvature":
      return `ROC(${cfg.period}) slope/curv lkb=${cfg.slopeLookback ?? 5}`;
    default:
      return `ROC(${cfg.period})`;
  }
}

function buildShortLabel(cfg: RocConfig): string {
  switch (cfg.signalType) {
    case "zero_cross":
      return `ROC(${cfg.period}) ↕0`;
    case "fast_slow_cross":
      return `ROC F=${cfg.period}/S=${cfg.slowPeriod ?? 0}`;
    case "threshold_cross":
      return `ROC(${cfg.period}) ±${pctSigned(cfg.threshold ?? 0.05)} cont`;
    case "threshold_reversion":
      return `ROC(${cfg.period}) ±${pctSigned(cfg.threshold ?? 0.05)} rev`;
    case "slope_curvature":
      return `ROC(${cfg.period}) slp/crv lkb=${cfg.slopeLookback ?? 5}`;
    default:
      return buildConfigLabel(cfg);
  }
}

function getBestCategoryForSide(cfg: ConfigResult, side: "long" | "short"): CategoryResult | null {
  const validCats = side === "long" ? BULL_CATEGORIES : BEAR_CATEGORIES;
  return cfg.categories.find((c) => validCats.includes(c.category)) ?? null;
}

function buildConfigsForGridSize(gridSize: string): RocConfig[] {
  const configs: RocConfig[] = [];
  if (gridSize === "quick") {
    for (const p of [5, 10, 14, 20, 30, 50, 100, 200])
      configs.push({ signalType: "zero_cross", period: p });
    for (const [f, s] of [
      [5, 20],
      [10, 30],
      [10, 50],
      [14, 50],
      [20, 50],
      [20, 100],
      [50, 100],
      [50, 200],
    ] as [number, number][])
      configs.push({ signalType: "fast_slow_cross", period: f, slowPeriod: s });
    return configs;
  }
  if (gridSize === "standard") {
    for (let p = 5; p <= 200; p += 5) configs.push({ signalType: "zero_cross", period: p });
    const fastPeriods = [5, 10, 14, 20, 30, 50];
    const slowPeriods = [20, 30, 50, 100, 150, 200];
    for (const f of fastPeriods)
      for (const s of slowPeriods)
        if (s > f) configs.push({ signalType: "fast_slow_cross", period: f, slowPeriod: s });
    for (const p of [5, 10, 14, 20, 30, 50, 100, 200])
      for (const t of [0.02, 0.05, 0.1, 0.15]) {
        configs.push({ signalType: "threshold_cross", period: p, threshold: t });
        configs.push({ signalType: "threshold_reversion", period: p, threshold: t });
      }
    for (const p of [5, 10, 14, 20, 30, 50, 100, 200])
      for (const slb of [5, 10])
        configs.push({ signalType: "slope_curvature", period: p, slopeLookback: slb });
    return configs;
  }
  if (gridSize === "deep") {
    for (let p = 5; p <= 200; p += 2) configs.push({ signalType: "zero_cross", period: p });
    const fastP = [5, 10, 14, 20, 30, 50];
    const slowP = [20, 30, 50, 75, 100, 150, 200];
    for (const f of fastP)
      for (const s of slowP)
        if (s > f) configs.push({ signalType: "fast_slow_cross", period: f, slowPeriod: s });
    const periods2 = [5, 10, 14, 20, 30, 50, 75, 100, 125, 150, 175, 200];
    const thresholds2 = [0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2];
    for (const p of periods2)
      for (const t of thresholds2) {
        configs.push({ signalType: "threshold_cross", period: p, threshold: t });
        configs.push({ signalType: "threshold_reversion", period: p, threshold: t });
      }
    for (const p of periods2)
      for (const slb of [3, 5, 10, 20])
        configs.push({ signalType: "slope_curvature", period: p, slopeLookback: slb });
    return configs;
  }
  // exhaustive
  for (let p = 2; p <= 200; p++) configs.push({ signalType: "zero_cross", period: p });
  for (let f = 5; f <= 50; f++)
    for (let s = 20; s <= 200; s += 5)
      if (s > f) configs.push({ signalType: "fast_slow_cross", period: f, slowPeriod: s });
  const ePeriods = [5, 10, 14, 20, 30, 40, 50, 75, 100, 125, 150, 175, 200];
  const eThresholds: number[] = [];
  for (let v = 1; v <= 20; v += 0.5) eThresholds.push(v / 100);
  for (const p of ePeriods)
    for (const t of eThresholds) {
      configs.push({ signalType: "threshold_cross", period: p, threshold: t });
      configs.push({ signalType: "threshold_reversion", period: p, threshold: t });
    }
  for (const p of ePeriods)
    for (const slb of [3, 5, 8, 10, 15, 20])
      configs.push({ signalType: "slope_curvature", period: p, slopeLookback: slb });
  return configs;
}

function getGridComboSortValue(combo: GridCombo, side: "long" | "short", col: string): any {
  const summary = side === "long" ? combo.bullSummary : combo.bearSummary;
  const signals = side === "long" ? combo.bullSignals : combo.bearSignals;
  const score = side === "long" ? combo.bullScore : combo.bearScore;
  switch (col) {
    case "side":
      return side === "long" ? "Long" : "Short";
    case "config":
      return combo.configLabel;
    case "signals":
      return signals;
    case "score":
      return score;
    case "hit-1M":
      return summary?.hitRate?.["1M"] ?? -Infinity;
    case "hit-3M":
      return summary?.hitRate?.["3M"] ?? -Infinity;
    case "hit-6M":
      return summary?.hitRate?.["6M"] ?? -Infinity;
    case "avg-3M":
      return summary?.avgReturn?.["3M"] ?? -Infinity;
    case "pf-3M":
      return summary?.profitFactor?.["3M"] ?? -Infinity;
    default:
      return -Infinity;
  }
}

function sortGridCombos(combos: GridCombo[], side: "long" | "short", sort: SortState): GridCombo[] {
  const sorted = [...combos];
  sorted.sort((a, b) => {
    const va = getGridComboSortValue(a, side, sort.col);
    const vb = getGridComboSortValue(b, side, sort.col);
    let diff = 0;
    if (typeof va === "string" || typeof vb === "string") {
      diff = String(va).localeCompare(String(vb));
    } else {
      diff = va - vb;
    }
    return sort.dir === "asc" ? diff : -diff;
  });
  return sorted;
}

function getCurrentSignalLabel(signalType: string): string {
  return signalType === "zero_cross"
    ? "ROC Above 0 (Bull)"
    : signalType.includes("Bear")
    ? "ROC Below 0 (Bear)"
    : "None";
}

function classifyCurrentSignal(label: string): "buy" | "short" | "neutral" {
  if (!label || label.includes("Neutral") || label.includes("in band") || label === "None")
    return "neutral";
  if (
    label.includes("Bounce Long") ||
    label.includes("Bull") ||
    label.includes("Above") ||
    label.includes("Up") ||
    label.includes("Breakout")
  )
    return "buy";
  if (
    label.includes("Fade Short") ||
    label.includes("Bear") ||
    label.includes("Below") ||
    label.includes("Down") ||
    label.includes("Breakdown")
  )
    return "short";
  return "neutral";
}

function getSignalLabelClass(label: string): string {
  if (
    label.includes("Bull") ||
    label.includes("Above") ||
    label.includes("Up") ||
    label.includes("Breakout")
  )
    return "bg-emerald-600/20 text-emerald-400 border-emerald-600/30";
  if (
    label.includes("Bear") ||
    label.includes("Below") ||
    label.includes("Down") ||
    label.includes("Breakdown")
  )
    return "bg-red-600/20 text-red-400 border-red-600/30";
  if (label.includes("Bullish") || label.includes("Acceleration"))
    return "bg-blue-600/20 text-blue-400 border-blue-600/30";
  if (label.includes("Bearish") || label.includes("Deceleration"))
    return "bg-orange-600/20 text-orange-400 border-orange-600/30";
  return "bg-muted text-muted-foreground border-border";
}

function getTickerCurrentSignal(
  ticker: TickerResult,
  cfg: RocConfig | undefined,
  signalType: string
): string {
  if (!cfg) return "None";
  const roc = ticker.currentROCByPeriod?.[cfg.period];
  if (!Number.isFinite(roc)) return "None";
  if (signalType === "zero_cross") return roc > 0 ? "ROC Above 0 (Bull)" : "ROC Below 0 (Bear)";
  if (signalType === "threshold_cross") {
    const t = cfg.threshold ?? 0.05;
    return roc > t
      ? `ROC > +${pctSigned(t)} (Bull)`
      : roc < -t
      ? `ROC < -${pctSigned(t)} (Bear)`
      : "ROC in band (Neutral)";
  }
  if (signalType === "threshold_reversion") {
    const t = cfg.threshold ?? 0.05;
    return roc > t
      ? `ROC > +${pctSigned(t)} (Fade Short)`
      : roc < -t
      ? `ROC < -${pctSigned(t)} (Bounce Long)`
      : "ROC in band (Neutral)";
  }
  if (signalType === "fast_slow_cross") {
    const slow = cfg.slowPeriod ?? 50;
    const slowRoc = ticker.currentSlowROCByPeriod?.[slow];
    return Number.isFinite(slowRoc)
      ? roc > slowRoc
        ? "Fast ROC > Slow (Bull)"
        : "Fast ROC < Slow (Bear)"
      : "None";
  }
  return ticker.currentSignal;
}

function getTickerCurrentROCFormatted(ticker: TickerResult, cfg: RocConfig | undefined): string | null {
  if (!cfg) return null;
  const roc = ticker.currentROCByPeriod?.[cfg.period];
  return Number.isFinite(roc) ? pctSigned(roc) : null;
}

// ─── Downsample weekly helper ─────────────────────────────────────────────────

function downsampleWeeklyLocal(prices: number[], dates: string[]): { prices: number[]; weekIndex: number[] } {
  const weekPrices: number[] = [];
  const weekIndex: number[] = [];
  let lastWeek = "";
  let lastPrice = NaN;
  let lastIdx = -1;
  const getWeek = (d: string): string => {
    const dt = new Date(d + "T00:00:00Z");
    if (isNaN(dt.getTime())) return d;
    const thu = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    thu.setUTCDate(thu.getUTCDate() + 4 - (thu.getUTCDay() || 7));
    const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
    const wn = Math.ceil(((thu.getTime() - jan1.getTime()) / 864e5 + 1) / 7);
    return `${thu.getUTCFullYear()}-W${String(wn).padStart(2, "0")}`;
  };
  for (let i = 0; i < prices.length; i++) {
    const w = getWeek(dates[i]);
    if (w !== lastWeek) {
      if (lastIdx >= 0) {
        weekPrices.push(lastPrice);
        weekIndex.push(lastIdx);
      }
      lastWeek = w;
    }
    lastPrice = prices[i];
    lastIdx = i;
  }
  if (lastIdx >= 0) {
    weekPrices.push(lastPrice);
    weekIndex.push(lastIdx);
  }
  return { prices: weekPrices, weekIndex: weekIndex };
}

function mapWeeklyToDaily(
  weeklyValues: number[],
  weekIndex: number[],
  dailyLength: number
): number[] {
  const v = computeROC(weeklyValues, weekIndex[0] ?? 1);
  const out = new Array(dailyLength).fill(NaN);
  let c = -1;
  for (let i = 0; i < dailyLength; i++) {
    while (c + 1 < weekIndex.length && weekIndex[c + 1] <= i) c++;
    if (c >= 0 && Number.isFinite(v[c])) out[i] = v[c];
  }
  return out;
}

// ─── Fetch price data ─────────────────────────────────────────────────────────

async function fetchTickerPriceData(
  ticker: string,
  dates: string[],
  dateRange: any,
  inputSel: any
): Promise<{ closes: number[]; priceDates: string[]; highs: number[]; lows: number[]; volumes: number[] } | null> {
  const sel = inputSel ?? defaultInputSelection;
  if (sel.kind !== "close") {
    const result = await fetchInputSeries(ticker, sel, { dateRange: dateRange ?? null });
    return result
      ? {
          closes: result.closes,
          priceDates: result.priceDates,
          highs: result.highs,
          lows: result.lows,
          volumes: result.volumes,
        }
      : null;
  }
  try {
    const raw = await getTickerRaw(ticker);
    const filtered = filterByDateRange(raw, dateRange ?? null);
    if (filtered.adjCloses.length > 0) {
      const n = filtered.adjCloses.length;
      const highs = new Array(n);
      const lows = new Array(n);
      for (let i = 0; i < n; i++) {
        const c = filtered.closes[i];
        const ac = filtered.adjCloses[i];
        const ratio = Number.isFinite(c) && c > 0 && Number.isFinite(ac) ? ac / c : 1;
        highs[i] = filtered.highs[i] * ratio;
        lows[i] = filtered.lows[i] * ratio;
      }
      return {
        closes: filtered.adjCloses,
        priceDates: filtered.dates,
        highs,
        lows,
        volumes: filtered.volumes ?? [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ROCOptimizer() {
  const [tickers, setTickers] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [inputSelection, setInputSelection] = usePersistedState("roc-input-selection", defaultInputSelection);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [returnMode, setReturnMode] = useState<"threshold" | "band">("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.03);
  const [bandMax, setBandMax] = useState(0.07);
  const [minHold, setMinHold] = useState(1);
  const [minSignals, setMinSignals] = useState(0);
  const [returnBasis, setReturnBasis] = useState<"absolute" | "relative">("absolute");
  const [peerLevel, setPeerLevel] = useState("subsector");
  const [signalType, setSignalType] = useState("zero_cross");
  const [period, setPeriod] = useState(14);
  const [slowPeriod, setSlowPeriod] = useState(50);
  const [threshold, setThreshold] = useState(0.05);
  const [slopeLookback, setSlopeLookback] = useState(5);
  const [mode, setMode] = useState<"single" | "universe" | "pair" | "pairCombo" | "basket">("single");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = usePersistedState<"stocks" | "combined">("roc-basket-mode", "stocks");
  const { baskets: userBaskets } = useBaskets();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = usePersistedState<TickerResult[]>("roc:results", []);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [expandedSignals, setExpandedSignals] = useState<Set<string>>(() => new Set());
  const toggleExpandedSignal = useCallback((key: string) => {
    setExpandedSignals((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState<any>(() => createDateRangeFromPreset("10y"));
  const [sortBy, setSortBy] = useState("score");
  const [rankBy, setRankBy] = useState("composite");
  const scoreWeights = useMemo(() => getScoreWeights(rankBy), [rankBy]);
  const [filterText, setFilterText] = useState("");
  const [runSort, setRunSort] = useState<SortState>({ col: "score", dir: "desc" });
  const [gridLongSort, setGridLongSort] = useState<SortState>({ col: "score", dir: "desc" });
  const [gridShortSort, setGridShortSort] = useState<SortState>({ col: "score", dir: "desc" });
  const [gridResults, setGridResults] = usePersistedState<GridTickerResult[]>("roc:gridResults", []);
  const [expandedGridTicker, setExpandedGridTicker] = useState<string | null>(null);
  const [gridSize, setGridSize] = useState("standard");
  const cancelRef = useRef(false);
  const tickerSetRef = useRef(false);
  const [expandedSignalsSet, setExpandedSignalsSet] = useState<Set<string>>(() => new Set());
  const [activeTab, setActiveTab] = useState<"optimize" | "evaluate">("optimize");
  const [evalSide, setEvalSide] = useState<"long" | "short">("long");
  const [evalResult, setEvalResult] = usePersistedState<any>("roc:evalResult", null);
  const [evalPriceContext, setEvalPriceContext] = useState<any>(null);
  const [evaluating, setEvaluating] = useState(false);

  const { universeTickers: globalUniverseTickers, isFiltered: universeIsFiltered } = useUniverse();
  const filteredByUniverse = useMemo(
    () => (globalUniverseTickers ? tickers.filter((t) => globalUniverseTickers.has(t.ticker)) : tickers),
    [tickers, globalUniverseTickers]
  );

  const classFilterState = useOptimizerClassFilter(filteredByUniverse, mode === "universe", "roc-clf");
  const pairComboState = usePairComboPicker(
    filteredByUniverse.map((t) => t.ticker),
    mode === "pairCombo",
    "roc-pc"
  );
  const classFilteredTickers = classFilterState.filteredTickers;
  const { frequency, setFrequency, frequencyUI } = useFrequency("roc", "daily", running);
  const timeframeMode = frequency === "weekly" ? "weekly" : "daily";

  useEffect(() => {
    getTickers().then((t) => {
      setTickers(t);
      if (t.length > 0 && !tickerSetRef.current) {
        setSelectedTicker(t[0].ticker);
      }
      if (t.length > 0) {
        setPairTickerA((prev) => prev || t[0].ticker);
        setPairTickerB((prev) => prev || (t[1]?.ticker ?? t[0].ticker));
      }
    });
  }, []);

  useEffect(() => {
    if (
      filteredByUniverse.length > 0 &&
      selectedTicker &&
      tickers.some((t) => t.ticker === selectedTicker) &&
      !filteredByUniverse.find((t) => t.ticker === selectedTicker)
    ) {
      setSelectedTicker(filteredByUniverse[0].ticker);
    }
  }, [filteredByUniverse, selectedTicker, tickers]);

  // ── Optimize run ────────────────────────────────────────────────────────────

  const runOptimize = useCallback(async () => {
    setRunning(true);
    setResults([]);
    cancelRef.current = false;

    const dates = await getDates();
    let tickersToRun: any[];

    if (mode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
        setRunning(false);
        return;
      }
      tickersToRun = [{ ticker: `${pairTickerA}/${pairTickerB}` }];
    } else if (mode === "pairCombo") {
      if (pairComboState.pairs.length === 0) {
        setRunning(false);
        return;
      }
      tickersToRun = pairComboState.pairs.map((p: any) => ({
        ticker: p.label,
        name: p.label,
        pairA: p.a,
        pairB: p.b,
      }));
    } else if (mode === "single") {
      const ticker = selectedTicker;
      if (ticker) {
        const found = filteredByUniverse.find((t) => t.ticker === ticker);
        tickersToRun = found ? [found] : [{ ticker, name: ticker }];
      } else {
        tickersToRun = [];
      }
    } else if (mode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) {
          setRunning(false);
          return;
        }
        const bkt = buildBasketOhlc(basketTickers, userBaskets);
        tickersToRun = [{ ticker: `BASKET:${bkt.name}`, name: `BASKET:${bkt.name}` }];
      } else {
        tickersToRun = basketTickers.map(
          (t) =>
            filteredByUniverse.find((u) => u.ticker.toUpperCase() === t.toUpperCase()) ?? {
              ticker: t,
              name: t,
            }
        );
      }
    } else {
      tickersToRun = classFilteredTickers;
    }

    if (tickersToRun.length === 0) {
      setRunning(false);
      return;
    }

    setProgress({ current: 0, total: tickersToRun.length });
    const combinedBasket =
      mode === "basket" && basketMode === "combined" ? buildBasketOhlc(basketTickers, userBaskets) : null;
    const allResults: TickerResult[] = [];

    for (let i = 0; i < tickersToRun.length && !cancelRef.current; i++) {
      const ticker = tickersToRun[i];
      setProgress({ current: i + 1, total: tickersToRun.length });
      const legA = mode === "pairCombo" ? ticker.pairA : pairTickerA;
      const legB = mode === "pairCombo" ? ticker.pairB : pairTickerB;

      try {
        let closes: number[], highs: number[], lows: number[];
        let volumes: number[] | null = null;
        let priceDates: string[];
        let globalIndexMap: number[];

        if (mode === "pair" || mode === "pairCombo") {
          const ratio = await getYahooPairsRatio(legA, legB, dates);
          if (!ratio || ratio.indices.length < 252) continue;
          const idxMap = new Map<number, number>();
          for (let j = 0; j < ratio.indices.length; j++) idxMap.set(ratio.indices[j], ratio.prices[j]);
          const validIdxs: number[] = [];
          for (let j = 0; j < dates.length; j++) if (idxMap.has(j)) validIdxs.push(j);
          if (validIdxs.length < 252) continue;
          closes = validIdxs.map((j) => idxMap.get(j)!);
          priceDates = validIdxs.map((j) => dates[j]);
          globalIndexMap = validIdxs;
          highs = closes.slice();
          lows = closes.slice();
        } else {
          const priceData = combinedBasket
            ? await getBasketOhlc(combinedBasket, dateRange)
            : await fetchTickerPriceData(ticker.ticker, dates, dateRange, inputSelection);
          if (!priceData || priceData.closes.length < 252) continue;
          closes = priceData.closes;
          priceDates = priceData.priceDates;
          highs =
            priceData.highs.length === closes.length ? priceData.highs : closes.slice();
          lows = priceData.lows.length === closes.length ? priceData.lows : closes.slice();
          volumes = priceData.volumes ?? null;
          const dateIdxMap = new Map<string, number>();
          for (let j = 0; j < dates.length; j++) dateIdxMap.set(dates[j], j);
          globalIndexMap = priceDates.map((d) => dateIdxMap.get(d) ?? -1);
        }

        const effectiveFreq =
          mode === "pair" || mode === "pairCombo" ? "daily" : timeframeMode;
        const downsampled = downsampleWeekly(
          {
            dates: priceDates,
            highs,
            lows,
            closes,
            adjCloses: closes,
            volumes: volumes ?? undefined,
          },
          effectiveFreq
        );
        const rawCloses = closes;
        const minBars = effectiveFreq === "weekly" ? 52 : 252;
        if (downsampled.closes.length < minBars) continue;

        let workingCloses: number[];
        let workingDates: string[];
        let weeklyData: { prices: number[]; weekIndex: number[] } | null = null;

        if (effectiveFreq === "weekly") {
          workingCloses = downsampled.closes;
          workingDates = downsampled.dates;
        } else if (frequency === "weekly_on_daily") {
          workingCloses = closes;
          workingDates = priceDates;
          weeklyData = downsampleWeeklyLocal(closes, priceDates);
          if (weeklyData.prices.length < 60) continue;
        } else {
          workingCloses = closes;
          workingDates = priceDates;
        }

        const barMultiplier = effectiveFreq === "weekly" || frequency === "weekly" ? 5 : 1;

        let benchmarkSeries: number[] | null = null;
        if (returnBasis === "relative" && ticker[peerLevel]) {
          try {
            const peerMedian = await getGroupMedianByIndex(peerLevel, ticker[peerLevel], ticker.ticker, "median");
            const peerMapped = globalIndexMap.map((gi) => {
              if (gi < 0) return NaN;
              const v = peerMedian[gi];
              return Number.isFinite(v) ? v : NaN;
            });
            if (frequency === "weekly") {
              const wl: number[] = [];
              let lastWk = "";
              let lastVal = NaN;
              let started = false;
              for (let j = 0; j < peerMapped.length; j++) {
                const wk = (() => {
                  const dt = new Date(priceDates[j] + "T00:00:00Z");
                  if (isNaN(dt.getTime())) return priceDates[j];
                  const thu = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
                  thu.setUTCDate(thu.getUTCDate() + 4 - (thu.getUTCDay() || 7));
                  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
                  const wn = Math.ceil(((thu.getTime() - jan1.getTime()) / 864e5 + 1) / 7);
                  return `${thu.getUTCFullYear()}-W${String(wn).padStart(2, "0")}`;
                })();
                if (wk !== lastWk) {
                  if (started) wl.push(lastVal);
                  lastWk = wk;
                  started = true;
                }
                if (Number.isFinite(peerMapped[j])) lastVal = peerMapped[j];
              }
              if (started) wl.push(lastVal);
              benchmarkSeries = wl;
            } else {
              benchmarkSeries = peerMapped;
            }
            if (benchmarkSeries) {
              let lastFinite = NaN;
              for (let j = 0; j < benchmarkSeries.length; j++) {
                if (Number.isFinite(benchmarkSeries[j])) lastFinite = benchmarkSeries[j];
                else benchmarkSeries[j] = lastFinite;
              }
            }
          } catch {
            benchmarkSeries = null;
          }
        }

        const configsForType: {
          cfg: RocConfig;
          startIdx: number;
          opts: any;
        }[] = [];

        const startIdxCalc = (p: number) =>
          frequency === "weekly_on_daily"
            ? Math.max(p * 5, 21) + 126
            : effectiveFreq === "weekly" || frequency === "weekly"
            ? p + Math.ceil(126 / barMultiplier)
            : p + 126;

        if (signalType === "zero_cross") {
          for (const p of ZERO_CROSS_PERIODS)
            configsForType.push({
              cfg: { signalType: "zero_cross", period: p },
              startIdx: startIdxCalc(p),
              opts: { period: p },
            });
        } else if (signalType === "threshold_cross") {
          for (const p of ZERO_CROSS_PERIODS)
            for (const t of THRESHOLD_VALUES)
              configsForType.push({
                cfg: { signalType: "threshold_cross", period: p, threshold: t },
                startIdx: startIdxCalc(p),
                opts: { period: p, threshold: t },
              });
        } else if (signalType === "threshold_reversion") {
          for (const p of ZERO_CROSS_PERIODS)
            for (const t of THRESHOLD_VALUES)
              configsForType.push({
                cfg: { signalType: "threshold_reversion", period: p, threshold: t },
                startIdx: startIdxCalc(p),
                opts: { period: p, threshold: t },
              });
        } else if (signalType === "fast_slow_cross") {
          for (const [f, s] of FAST_SLOW_PAIRS)
            configsForType.push({
              cfg: { signalType: "fast_slow_cross", period: f, slowPeriod: s },
              startIdx: startIdxCalc(Math.max(f, s)),
              opts: { period: f, slowPeriod: s },
            });
        } else {
          for (const p of ZERO_CROSS_PERIODS)
            for (const slb of SLOPE_LOOKBACKS)
              configsForType.push({
                cfg: { signalType: "slope_curvature", period: p, slopeLookback: slb },
                startIdx: startIdxCalc(p + slb),
                opts: { period: p, slopeLookback: slb },
              });
        }

        const allConfigs: ConfigResult[] = [];

        for (const { cfg, startIdx, opts } of configsForType) {
          if (workingCloses.length <= startIdx + 5) continue;
          const optsWithPrecomputed = { ...opts } as any;
          if (frequency === "weekly_on_daily" && weeklyData) {
            optsWithPrecomputed.precomputedROC = mapWeeklyToDaily(
              weeklyData.prices,
              weeklyData.weekIndex,
              workingCloses.length
            );
            if (opts.slowPeriod !== undefined) {
              optsWithPrecomputed.precomputedSlowROC = mapWeeklyToDaily(
                weeklyData.prices,
                weeklyData.weekIndex,
                workingCloses.length
              );
            }
          }

          const handler = ROC_SIGNAL_HANDLERS[signalType];
          const detected = detectSignals(workingCloses, handler, optsWithPrecomputed, startIdx);
          const bandOpts =
            returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
          const categoryResults: CategoryResult[] = [];
          let totalSignalCount = 0;

          for (const cat of handler) {
            const catMeta = SIGNAL_META[cat];
            const direction = catMeta?.direction;
            const profiles: any[] = [];
            const signalDates: SignalDate[] = [];
            let lastSignalIdx = -1;

            for (const sigIdx of detected[cat]) {
              if (minHold > 0 && lastSignalIdx >= 0 && sigIdx < lastSignalIdx + minHold) continue;
              const dailyIdx =
                effectiveFreq === "weekly"
                  ? mapWeeklyIndexToDaily(sigIdx, downsampled)
                  : sigIdx;
              if (dailyIdx < 0) continue;
              const profile = computeForwardProfile(
                effectiveFreq === "weekly" ? rawCloses : workingCloses,
                dailyIdx,
                targetReturn,
                direction,
                bandOpts,
                minHold,
                effectiveFreq === "weekly" ? null : benchmarkSeries
              );
              profiles.push(profile);
              signalDates.push({
                date: workingDates[sigIdx] ?? "",
                ret1m: profile.returns["1M"] ?? null,
                ret3m: profile.returns["3M"] ?? null,
                ret6m: profile.returns["6M"] ?? null,
              });
              lastSignalIdx = sigIdx;
            }

            const isBand = returnMode === "band";
            const summary = summarizeSignals(profiles, direction);
            const composite = computeCompositeScore(summary, direction, isBand);
            totalSignalCount += summary.count;
            categoryResults.push({
              category: cat,
              label: catMeta?.label ?? cat,
              description: catMeta?.description ?? "",
              summary,
              composite,
              signalDates,
              profiles,
            });
          }

          if (totalSignalCount < 3) continue;
          const bestCat = categoryResults.reduce((best, cur) =>
            best.composite.score > cur.composite.score ? best : cur
          );
          allConfigs.push({
            config: cfg,
            configLabel: buildConfigLabel(cfg),
            categories: categoryResults,
            bestCategory: bestCat.category,
            bestScore: bestCat.composite.score,
          });
        }

        if (allConfigs.length === 0) continue;

        const bestConfig = allConfigs.reduce((best, cur) =>
          best.bestScore > cur.bestScore ? best : cur
        );

        // Compute current signal state
        let currentSignal = "None";
        const currentROCByPeriod: Record<number, number> = {};
        const currentSlowROCByPeriod: Record<number, number> = {};

        {
          const src =
            frequency === "weekly_on_daily" && weeklyData ? weeklyData.prices : workingCloses;
          const lastIdx = src.length - 1;
          const periodSet = new Set<number>();
          const slowSet = new Set<number>();
          for (const c of allConfigs) {
            if (c.config.period) periodSet.add(c.config.period);
            if (c.config.slowPeriod) slowSet.add(c.config.slowPeriod);
          }
          for (const p of Array.from(periodSet)) {
            if (lastIdx >= p) {
              const cur = src[lastIdx];
              const prev = src[lastIdx - p];
              if (Number.isFinite(cur) && Number.isFinite(prev) && prev !== 0)
                currentROCByPeriod[p] = cur / prev - 1;
            }
          }
          for (const p of Array.from(slowSet)) {
            if (lastIdx >= p) {
              const cur = src[lastIdx];
              const prev = src[lastIdx - p];
              if (Number.isFinite(cur) && Number.isFinite(prev) && prev !== 0)
                currentSlowROCByPeriod[p] = cur / prev - 1;
            }
          }

          const bestROC = computeROC(src, bestConfig.config.period);
          const bestROCVal = bestROC[src.length - 1];
          if (Number.isFinite(bestROCVal)) {
            if (signalType === "zero_cross") {
              currentSignal = bestROCVal > 0 ? "ROC Above 0 (Bull)" : "ROC Below 0 (Bear)";
            } else if (signalType === "threshold_cross") {
              const t = bestConfig.config.threshold ?? 0.05;
              currentSignal =
                bestROCVal > t
                  ? `ROC > +${pctSigned(t)} (Bull)`
                  : bestROCVal < -t
                  ? `ROC < -${pctSigned(t)} (Bear)`
                  : "ROC in band (Neutral)";
            } else if (signalType === "threshold_reversion") {
              const t = bestConfig.config.threshold ?? 0.05;
              currentSignal =
                bestROCVal > t
                  ? `ROC > +${pctSigned(t)} (Fade Short)`
                  : bestROCVal < -t
                  ? `ROC < -${pctSigned(t)} (Bounce Long)`
                  : "ROC in band (Neutral)";
            } else if (signalType === "fast_slow_cross") {
              const slowROC = computeROC(src, bestConfig.config.slowPeriod ?? 50);
              const slowVal = slowROC[src.length - 1];
              if (Number.isFinite(slowVal))
                currentSignal =
                  bestROCVal > slowVal ? "Fast ROC > Slow (Bull)" : "Fast ROC < Slow (Bear)";
            } else {
              const slb = bestConfig.config.slopeLookback ?? 5;
              const rocArr = computeROC(src, bestConfig.config.period);
              const rocCur = rocArr[src.length - 1];
              const rocPrev = rocArr[src.length - 1 - slb];
              if (src.length > slb && Number.isFinite(rocPrev))
                currentSignal =
                  rocCur - rocPrev > 0 ? "ROC Slope Up (Bull)" : "ROC Slope Down (Bear)";
            }
          }
        }

        // Keep only profiles for top 6 configs to save memory
        const topN = 6;
        const topLabels = new Set(
          [...allConfigs].sort((a, b) => b.bestScore - a.bestScore).slice(0, topN).map((c) => c.configLabel)
        );
        for (const c of allConfigs)
          if (!topLabels.has(c.configLabel))
            for (const cat of c.categories) cat.profiles = undefined;

        const priceContext = {
          prices: workingCloses,
          highs: effectiveFreq === "weekly" ? downsampled.highs : highs,
          lows: effectiveFreq === "weekly" ? downsampled.lows : lows,
          volumes: effectiveFreq === "weekly" ? (downsampled.volumes ?? null) : volumes,
          dates: workingDates,
          globalIndices: globalIndexMap,
          benchmarkPrices: benchmarkSeries,
          mode: mode === "pair" || mode === "pairCombo" ? "pair" : "single",
          pairLegA: mode === "pair" || mode === "pairCombo" ? legA : undefined,
          pairLegB: mode === "pair" || mode === "pairCombo" ? legB : undefined,
        };

        allResults.push({
          ticker: ticker.ticker,
          name: ticker.name,
          configs: allConfigs,
          bestCategory: SIGNAL_META[bestConfig.bestCategory]?.label ?? bestConfig.bestCategory,
          bestScore: bestConfig.bestScore,
          currentSignal,
          currentROCByPeriod,
          currentSlowROCByPeriod,
          priceContext,
        });

        if (i % 5 === 0 || i === tickersToRun.length - 1) setResults([...allResults]);
      } catch {}
    }

    setResults(allResults);
    setRunning(false);
  }, [
    filteredByUniverse,
    selectedTicker,
    pairTickerA,
    pairTickerB,
    pairComboState.pairs,
    mode,
    signalType,
    period,
    slowPeriod,
    threshold,
    slopeLookback,
    returnBasis,
    returnMode,
    bandMin,
    bandMax,
    minHold,
    frequency,
    peerLevel,
    timeframeMode,
    dateRange,
    basketTickers,
    basketMode,
    userBaskets,
  ]);

  // ── Evaluate function ───────────────────────────────────────────────────────

  const runEvaluate = useCallback(async () => {
    setEvaluating(true);
    setEvalResult(null);
    setEvalPriceContext(null);

    try {
      const dates = await getDates();
      let closes: number[], highs: number[], lows: number[];
      let volumes: number[] | null = null;
      let priceDates: string[];
      let globalIndexMap: number[];

      if (mode === "pair") {
        if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
          setEvaluating(false);
          return;
        }
        const ratio = await getYahooPairsRatio(pairTickerA, pairTickerB, dates);
        if (!ratio || ratio.indices.length < 252) {
          setEvaluating(false);
          return;
        }
        closes = ratio.prices;
        highs = ratio.prices.slice();
        lows = ratio.prices.slice();
        priceDates = ratio.indices.map((i: number) => dates[i] ?? "");
        globalIndexMap = ratio.indices.slice();
      } else if (mode === "basket") {
        if (basketTickers.length === 0) {
          setEvaluating(false);
          return;
        }
        if (basketMode === "combined") {
          const bkt = buildBasketOhlc(basketTickers, userBaskets);
          const data = await getBasketOhlc(bkt, dateRange);
          if (!data || data.closes.length < 252) {
            setEvaluating(false);
            return;
          }
          closes = data.closes;
          highs = data.highs;
          lows = data.lows;
          volumes = data.volumes;
          priceDates = data.priceDates;
          const dateIdxMap = new Map<string, number>();
          for (let j = 0; j < dates.length; j++) dateIdxMap.set(dates[j], j);
          globalIndexMap = priceDates.map((d) => dateIdxMap.get(d) ?? -1);
        } else {
          const firstTicker = basketTickers[0];
          const data = await fetchTickerPriceData(firstTicker, dates, dateRange, inputSelection);
          if (!data || data.closes.length < 252) {
            setEvaluating(false);
            return;
          }
          closes = data.closes;
          highs = data.highs.length === closes.length ? data.highs : closes.slice();
          lows = data.lows.length === closes.length ? data.lows : closes.slice();
          volumes = data.volumes;
          priceDates = data.priceDates;
          const dateIdxMap = new Map<string, number>();
          for (let j = 0; j < dates.length; j++) dateIdxMap.set(dates[j], j);
          globalIndexMap = priceDates.map((d) => dateIdxMap.get(d) ?? -1);
        }
      } else {
        const tickerSymbol = mode === "single" ? selectedTicker : filteredByUniverse[0]?.ticker ?? "";
        if (!tickerSymbol) {
          setEvaluating(false);
          return;
        }
        const data = await fetchTickerPriceData(tickerSymbol, dates, dateRange, inputSelection);
        if (!data || data.closes.length < 252) {
          setEvaluating(false);
          return;
        }
        closes = data.closes;
        highs = data.highs.length === closes.length ? data.highs : closes.slice();
        lows = data.lows.length === closes.length ? data.lows : closes.slice();
        volumes = data.volumes;
        priceDates = data.priceDates;
        const dateIdxMap = new Map<string, number>();
        for (let j = 0; j < dates.length; j++) dateIdxMap.set(dates[j], j);
        globalIndexMap = priceDates.map((d) => dateIdxMap.get(d) ?? -1);
      }

      const effectiveFreq = mode === "pair" ? "daily" : timeframeMode;
      const downsampled = downsampleWeekly(
        {
          dates: priceDates,
          highs,
          lows,
          closes,
          adjCloses: closes,
          volumes: volumes ?? undefined,
        },
        effectiveFreq
      );

      let workingCloses: number[], workingDates: string[];
      if (effectiveFreq === "weekly") {
        workingCloses = downsampled.closes;
        workingDates = downsampled.dates;
        globalIndexMap = downsampled.dailyIndexMap.map((j: number) => globalIndexMap[j] ?? -1);
      } else {
        workingCloses = closes;
        workingDates = priceDates;
      }

      const handler = ROC_SIGNAL_HANDLERS[signalType];
      const opts: any = { period };
      if (signalType === "threshold_cross" || signalType === "threshold_reversion")
        opts.threshold = threshold;
      if (signalType === "fast_slow_cross") opts.slowPeriod = slowPeriod;
      if (signalType === "slope_curvature") opts.slopeLookback = slopeLookback;

      const startIdx =
        (signalType === "fast_slow_cross"
          ? Math.max(period, slowPeriod)
          : signalType === "slope_curvature"
          ? period + slopeLookback
          : period) + 126;

      const detected = detectSignals(workingCloses, handler, opts, startIdx);
      const direction = evalSide === "long" ? "buy" : "sell";
      const signalIndices: number[] = [];
      for (const cat of handler) {
        if (SIGNAL_META[cat]?.direction === direction) {
          for (const idx of detected[cat]) signalIndices.push(idx);
        }
      }
      signalIndices.sort((a, b) => a - b);

      const evalResultData = buildBacktestResult(workingCloses, workingDates, signalIndices, evalSide, returnBasis, minHold, null, "3M");
      setEvalResult(evalResultData);
      setEvalPriceContext({
        prices: workingCloses,
        highs: effectiveFreq === "weekly" ? downsampled.highs : highs,
        lows: effectiveFreq === "weekly" ? downsampled.lows : lows,
        volumes: effectiveFreq === "weekly" ? (downsampled.volumes ?? null) : volumes,
        dates: workingDates,
        globalIndices: globalIndexMap,
        benchmarkPrices: null,
        mode: mode === "pair" || mode === "pairCombo" ? "pair" : "single",
        pairLegA: mode === "pair" || mode === "pairCombo" ? pairTickerA : undefined,
        pairLegB: mode === "pair" || mode === "pairCombo" ? pairTickerB : undefined,
      });
    } finally {
      setEvaluating(false);
    }
  }, [
    mode,
    pairTickerA,
    pairTickerB,
    selectedTicker,
    filteredByUniverse,
    signalType,
    period,
    slowPeriod,
    threshold,
    slopeLookback,
    returnBasis,
    targetReturn,
    minHold,
    evalSide,
    frequency,
    timeframeMode,
    dateRange,
    basketTickers,
    basketMode,
    userBaskets,
  ]);

  // ── Grid search ─────────────────────────────────────────────────────────────

  const runGridSearch = useCallback(async () => {
    if (mode === "universe" && (gridSize === "deep" || gridSize === "exhaustive")) {
      const n = buildConfigsForGridSize(gridSize).length;
      if (
        !window.confirm(
          `Grid Search (${gridSize}) will evaluate ${n} configs × ${filteredByUniverse.length} tickers. This may take several minutes. Continue?`
        )
      )
        return;
    }

    setRunning(true);
    setGridResults([]);
    cancelRef.current = false;
    const dates = await getDates();

    let tickersToRun: any[];
    if (mode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
        setRunning(false);
        return;
      }
      tickersToRun = [{ ticker: `${pairTickerA}/${pairTickerB}` }];
    } else if (mode === "pairCombo") {
      if (pairComboState.pairs.length === 0) {
        setRunning(false);
        return;
      }
      tickersToRun = pairComboState.pairs.map((p: any) => ({
        ticker: p.label,
        name: p.label,
        pairA: p.a,
        pairB: p.b,
      }));
    } else if (mode === "single") {
      const sym = selectedTicker;
      const found = filteredByUniverse.find((t) => t.ticker === sym);
      tickersToRun = found ? [found] : sym ? [{ ticker: sym, name: sym }] : [];
    } else if (mode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) {
          setRunning(false);
          return;
        }
        const bkt = buildBasketOhlc(basketTickers, userBaskets);
        tickersToRun = [{ ticker: `BASKET:${bkt.name}`, name: `BASKET:${bkt.name}` }];
      } else {
        tickersToRun = basketTickers.map(
          (t) =>
            filteredByUniverse.find((u) => u.ticker.toUpperCase() === t.toUpperCase()) ?? {
              ticker: t,
              name: t,
            }
        );
      }
    } else {
      tickersToRun = classFilteredTickers;
    }

    if (tickersToRun.length === 0) {
      setRunning(false);
      return;
    }

    const combinedBasket =
      mode === "basket" && basketMode === "combined" ? buildBasketOhlc(basketTickers, userBaskets) : null;
    const gridConfigs = buildConfigsForGridSize(gridSize);
    const totalWork = tickersToRun.length * gridConfigs.length;
    setProgress({ current: 0, total: totalWork });

    const allGridResults: GridTickerResult[] = [];

    for (let i = 0; i < tickersToRun.length && !cancelRef.current; i++) {
      const ticker = tickersToRun[i];
      const legA = mode === "pairCombo" ? ticker.pairA : pairTickerA;
      const legB = mode === "pairCombo" ? ticker.pairB : pairTickerB;

      try {
        let closes: number[], priceDates: string[], globalIndexMap: number[];

        if (mode === "pair" || mode === "pairCombo") {
          const ratio = await getYahooPairsRatio(legA, legB, dates);
          if (!ratio || ratio.indices.length < 252) {
            setProgress({ current: (i + 1) * gridConfigs.length, total: totalWork });
            continue;
          }
          const idxMap = new Map<number, number>();
          for (let j = 0; j < ratio.indices.length; j++) idxMap.set(ratio.indices[j], ratio.prices[j]);
          const validIdxs: number[] = [];
          for (let j = 0; j < dates.length; j++) if (idxMap.has(j)) validIdxs.push(j);
          if (validIdxs.length < 252) {
            setProgress({ current: (i + 1) * gridConfigs.length, total: totalWork });
            continue;
          }
          closes = validIdxs.map((j) => idxMap.get(j)!);
          priceDates = validIdxs.map((j) => dates[j]);
          globalIndexMap = validIdxs;
        } else {
          const priceData = combinedBasket
            ? await getBasketOhlc(combinedBasket, dateRange)
            : await fetchTickerPriceData(ticker.ticker, dates, dateRange, inputSelection);
          if (!priceData || priceData.closes.length < 252) {
            setProgress({ current: (i + 1) * gridConfigs.length, total: totalWork });
            continue;
          }
          closes = priceData.closes;
          priceDates = priceData.priceDates;
          const dateIdxMap = new Map<string, number>();
          for (let j = 0; j < dates.length; j++) dateIdxMap.set(dates[j], j);
          globalIndexMap = priceDates.map((d) => dateIdxMap.get(d) ?? -1);
        }

        const effectiveFreq =
          mode === "pair" || mode === "pairCombo" ? "daily" : timeframeMode;
        const downsampled = downsampleWeekly(
          { dates: priceDates, closes, adjCloses: closes, volumes: undefined },
          effectiveFreq
        );
        const rawCloses = closes;
        const minBars = effectiveFreq === "weekly" ? 52 : 252;
        if (downsampled.closes.length < minBars) {
          setProgress({ current: (i + 1) * gridConfigs.length, total: totalWork });
          continue;
        }

        let workingCloses: number[];
        let workingDates: string[];
        let weeklyData: { prices: number[]; weekIndex: number[] } | null = null;

        if (effectiveFreq === "weekly") {
          workingCloses = downsampled.closes;
          workingDates = downsampled.dates;
        } else if (frequency === "weekly_on_daily") {
          workingCloses = closes;
          workingDates = priceDates;
          weeklyData = downsampleWeeklyLocal(closes, priceDates);
          if (weeklyData.prices.length < 60) {
            setProgress({ current: (i + 1) * gridConfigs.length, total: totalWork });
            continue;
          }
        } else {
          workingCloses = closes;
          workingDates = priceDates;
        }

        let benchmarkSeries: number[] | null = null;
        if (returnBasis === "relative" && ticker[peerLevel]) {
          try {
            const peerMedian = await getGroupMedianByIndex(peerLevel, ticker[peerLevel], ticker.ticker, "median");
            const peerMapped = globalIndexMap.map((gi) => {
              if (gi < 0) return NaN;
              const v = peerMedian[gi];
              return Number.isFinite(v) ? v : NaN;
            });
            if (frequency === "weekly") {
              const wl: number[] = [];
              let lastWk = "";
              let lastVal = NaN;
              let started = false;
              for (let j = 0; j < peerMapped.length; j++) {
                const wk = (() => {
                  const dt = new Date(priceDates[j] + "T00:00:00Z");
                  if (isNaN(dt.getTime())) return priceDates[j];
                  const thu = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
                  thu.setUTCDate(thu.getUTCDate() + 4 - (thu.getUTCDay() || 7));
                  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
                  const wn = Math.ceil(((thu.getTime() - jan1.getTime()) / 864e5 + 1) / 7);
                  return `${thu.getUTCFullYear()}-W${String(wn).padStart(2, "0")}`;
                })();
                if (wk !== lastWk) {
                  if (started) wl.push(lastVal);
                  lastWk = wk;
                  started = true;
                }
                if (Number.isFinite(peerMapped[j])) lastVal = peerMapped[j];
              }
              if (started) wl.push(lastVal);
              benchmarkSeries = wl;
            } else {
              benchmarkSeries = peerMapped;
            }
            if (benchmarkSeries) {
              let lastF = NaN;
              for (let j = 0; j < benchmarkSeries.length; j++) {
                if (Number.isFinite(benchmarkSeries[j])) lastF = benchmarkSeries[j];
                else benchmarkSeries[j] = lastF;
              }
            }
          } catch {
            benchmarkSeries = null;
          }
        }

        const combos: GridCombo[] = [];
        const isBand = returnMode === "band";
        const bandOpts = isBand ? { minReturn: bandMin, maxReturn: bandMax } : null;

        for (let b = 0; b < gridConfigs.length && !cancelRef.current; b++) {
          const gcfg = gridConfigs[b];
          const gHandler = ROC_SIGNAL_HANDLERS[gcfg.signalType];
          const bullCats = gHandler.filter((c: string) => BULL_CATEGORIES.includes(c));
          const bearCats = gHandler.filter((c: string) => BEAR_CATEGORIES.includes(c));
          const allCats = [...bullCats, ...bearCats];
          const startIdx =
            gcfg.signalType === "fast_slow_cross"
              ? Math.max(gcfg.period, gcfg.slowPeriod ?? gcfg.period) + 126
              : gcfg.signalType === "slope_curvature"
              ? gcfg.period + (gcfg.slopeLookback ?? 5) + 126
              : gcfg.period + 126;

          if (workingCloses.length <= startIdx + 5) {
            if (b % 30 === 0) {
              setProgress({ current: i * gridConfigs.length + b + 1, total: totalWork });
              await new Promise((r) => setTimeout(r, 0));
            }
            continue;
          }

          const gopts: any = {
            period: gcfg.period,
            slowPeriod: gcfg.slowPeriod,
            threshold: gcfg.threshold,
            slopeLookback: gcfg.slopeLookback,
          };
          if (frequency === "weekly_on_daily" && weeklyData) {
            gopts.precomputedROC = mapWeeklyToDaily(weeklyData.prices, weeklyData.weekIndex, workingCloses.length);
            if (gcfg.slowPeriod !== undefined)
              gopts.precomputedSlowROC = mapWeeklyToDaily(weeklyData.prices, weeklyData.weekIndex, workingCloses.length);
          }

          const detected = detectSignals(workingCloses, allCats, gopts, startIdx);
          const bullProfiles: any[] = [];
          const bearProfiles: any[] = [];
          const bullDates: SignalDate[] = [];
          const bearDates: SignalDate[] = [];
          let lastBull = -1;
          let lastBear = -1;

          for (const cat of bullCats) {
            for (const idx of detected[cat]) {
              if (minHold > 0 && lastBull >= 0 && idx < lastBull + minHold) continue;
              const di = effectiveFreq === "weekly" ? mapWeeklyIndexToDaily(idx, downsampled) : idx;
              if (di < 0) continue;
              const profile = computeForwardProfile(
                effectiveFreq === "weekly" ? rawCloses : workingCloses,
                di,
                targetReturn,
                "buy",
                bandOpts,
                minHold,
                effectiveFreq === "weekly" ? null : benchmarkSeries
              );
              bullProfiles.push(profile);
              bullDates.push({
                date: workingDates[idx] ?? "",
                ret1m: profile.returns["1M"] ?? null,
                ret3m: profile.returns["3M"] ?? null,
                ret6m: profile.returns["6M"] ?? null,
              });
              lastBull = idx;
            }
          }

          for (const cat of bearCats) {
            for (const idx of detected[cat]) {
              if (minHold > 0 && lastBear >= 0 && idx < lastBear + minHold) continue;
              const di = effectiveFreq === "weekly" ? mapWeeklyIndexToDaily(idx, downsampled) : idx;
              if (di < 0) continue;
              const profile = computeForwardProfile(
                effectiveFreq === "weekly" ? rawCloses : workingCloses,
                di,
                targetReturn,
                "sell",
                bandOpts,
                minHold,
                effectiveFreq === "weekly" ? null : benchmarkSeries
              );
              bearProfiles.push(profile);
              bearDates.push({
                date: workingDates[idx] ?? "",
                ret1m: profile.returns["1M"] ?? null,
                ret3m: profile.returns["3M"] ?? null,
                ret6m: profile.returns["6M"] ?? null,
              });
              lastBear = idx;
            }
          }

          const bullSummary = bullProfiles.length > 0 ? summarizeSignals(bullProfiles, "buy") : null;
          const bearSummary = bearProfiles.length > 0 ? summarizeSignals(bearProfiles, "sell") : null;
          const bullScore = bullSummary ? computeCompositeScore(bullSummary, "buy", isBand).score : 0;
          const bearScore = bearSummary ? computeCompositeScore(bearSummary, "sell", isBand).score : 0;
          const bestSide = bullScore >= bearScore ? "bull" : "bear";
          const bestScore = Math.max(bullScore, bearScore);

          combos.push({
            configLabel: buildShortLabel(gcfg),
            config: gcfg,
            bullSummary,
            bullScore,
            bullSignals: bullProfiles.length,
            bearSummary,
            bearScore,
            bearSignals: bearProfiles.length,
            bestSide,
            bestScore,
            bullDates,
            bearDates,
          });

          if (b % 30 === 0) {
            setProgress({ current: i * gridConfigs.length + b + 1, total: totalWork });
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        const validCombos = combos.filter((c) => c.bullSignals + c.bearSignals > 0);
        validCombos.sort((a, b) => b.bestScore - a.bestScore);
        const top50 = validCombos.slice(0, 50);

        allGridResults.push({ ticker: ticker.ticker, name: ticker.name, topCombos: top50 });
        setProgress({ current: (i + 1) * gridConfigs.length, total: totalWork });
        setGridResults([...allGridResults]);
      } catch {
        setProgress({ current: (i + 1) * gridConfigs.length, total: totalWork });
      }
    }

    setGridResults(allGridResults);
    setRunning(false);
  }, [
    filteredByUniverse,
    selectedTicker,
    pairTickerA,
    pairTickerB,
    pairComboState.pairs,
    mode,
    gridSize,
    returnBasis,
    returnMode,
    bandMin,
    bandMax,
    minHold,
    frequency,
    peerLevel,
    timeframeMode,
    dateRange,
    basketTickers,
    basketMode,
    userBaskets,
    classFilteredTickers,
  ]);

  // ── Workspace tab serialization ─────────────────────────────────────────────

  const captureInputs = useCallback(
    () => ({
      selectedTicker,
      targetReturn,
      signalType,
      period,
      slowPeriod,
      threshold,
      slopeLookback,
      mode,
      results,
      expandedTicker,
      sortBy,
      runSort,
      gridLongSort,
      gridShortSort,
      returnMode,
      bandMin,
      bandMax,
      minHold,
      minSignals,
      gridResults,
      expandedGridTicker,
      frequency,
      returnBasis,
      peerLevel,
      gridSize,
      timeframe: timeframeMode,
      pairTickerA,
      pairTickerB,
      basketTickers,
      basketMode,
      pairCombo: pairComboState.serialize(),
      inputSelection,
    }),
    [
      selectedTicker,
      targetReturn,
      signalType,
      period,
      slowPeriod,
      threshold,
      slopeLookback,
      mode,
      results,
      expandedTicker,
      sortBy,
      runSort,
      gridLongSort,
      gridShortSort,
      returnMode,
      bandMin,
      bandMax,
      minHold,
      minSignals,
      gridResults,
      expandedGridTicker,
      frequency,
      returnBasis,
      peerLevel,
      gridSize,
      timeframeMode,
      pairTickerA,
      pairTickerB,
      basketTickers,
      basketMode,
      pairComboState,
      inputSelection,
    ]
  );

  const applyInputs = useCallback(
    (data: any) => {
      if (!data) return;
      if (data.selectedTicker) {
        setSelectedTicker(data.selectedTicker);
        tickerSetRef.current = true;
      }
      if (typeof data.targetReturn === "number") setTargetReturn(data.targetReturn);
      if (data.returnMode) setReturnMode(data.returnMode);
      if (typeof data.bandMin === "number") setBandMin(data.bandMin);
      if (typeof data.bandMax === "number") setBandMax(data.bandMax);
      if (typeof data.minHold === "number") setMinHold(data.minHold);
      if (typeof data.minSignals === "number") setMinSignals(Math.max(0, data.minSignals | 0));
      if (data.signalType) setSignalType(data.signalType);
      if (
        data.frequency === "daily" ||
        data.frequency === "weekly" ||
        data.frequency === "weekly_on_daily"
      )
        setFrequency(data.frequency);
      else if (data.timeframe === "weekly" && data.frequency === undefined)
        setFrequency("weekly");
      if (typeof data.period === "number") setPeriod(data.period);
      if (typeof data.slowPeriod === "number") setSlowPeriod(data.slowPeriod);
      if (typeof data.threshold === "number") setThreshold(data.threshold);
      if (typeof data.slopeLookback === "number") setSlopeLookback(data.slopeLookback);
      if (
        data.mode === "single" ||
        data.mode === "universe" ||
        data.mode === "pair" ||
        data.mode === "pairCombo" ||
        data.mode === "basket"
      )
        setMode(data.mode);
      if (data.pairCombo) pairComboState.hydrate(data.pairCombo);
      if (typeof data.pairTickerA === "string") setPairTickerA(data.pairTickerA);
      if (typeof data.pairTickerB === "string") setPairTickerB(data.pairTickerB);
      if (Array.isArray(data.basketTickers))
        setBasketTickers(data.basketTickers.filter((t: any) => typeof t === "string"));
      if (data.basketMode === "stocks" || data.basketMode === "combined")
        setBasketMode(data.basketMode);
      if (Array.isArray(data.results)) setResults(data.results);
      if (data.expandedTicker !== undefined) setExpandedTicker(data.expandedTicker);
      if (data.sortBy) setSortBy(data.sortBy);
      if (data.runSort?.col && data.runSort?.dir) setRunSort(data.runSort);
      if (data.gridLongSort?.col && data.gridLongSort?.dir) setGridLongSort(data.gridLongSort);
      if (data.gridShortSort?.col && data.gridShortSort?.dir) setGridShortSort(data.gridShortSort);
      if (Array.isArray(data.gridResults)) setGridResults(data.gridResults);
      if (data.expandedGridTicker !== undefined) setExpandedGridTicker(data.expandedGridTicker);
      if (data.returnBasis === "absolute" || data.returnBasis === "relative")
        setReturnBasis(data.returnBasis);
      if (typeof data.peerLevel === "string" && CLASSIFICATION_DIMENSION_KEYS.includes(data.peerLevel))
        setPeerLevel(data.peerLevel);
      if (
        data.gridSize === "quick" ||
        data.gridSize === "standard" ||
        data.gridSize === "deep" ||
        data.gridSize === "exhaustive"
      )
        setGridSize(data.gridSize);
      if (data.inputSelection && typeof data.inputSelection === "object") {
        const sel = data.inputSelection;
        if (sel.kind === "close") setInputSelection({ kind: "close" });
        else if (sel.kind === "workbook" && typeof sel.metric === "string")
          setInputSelection({ kind: "workbook", metric: sel.metric });
      }
    },
    [pairComboState]
  );

  useWorkspaceTab("roc-optimizer", captureInputs, applyInputs);

  const captureInputsForPreset = useCallback(() => {
    const all = captureInputs();
    const {
      selectedTicker: _s,
      pairTickerA: _a,
      pairTickerB: _b,
      results: _r,
      gridResults: _g,
      expandedTicker: _et,
      expandedGridTicker: _egt,
      sortBy: _sb,
      runSort: _rs,
      gridLongSort: _gls,
      gridShortSort: _gss,
      evalResult: _er,
      evalTriggerKey: _etk,
      evalFilterKeys: _efk,
      ...rest
    } = all as any;
    return rest;
  }, [captureInputs]);

  const applyInputsFromPreset = useCallback((data: any) => applyInputs(data), [applyInputs]);

  // ── Derived sorted results ──────────────────────────────────────────────────

  const resultsWithBest = useMemo(
    () =>
      results.map((tr) => ({
        ...tr,
        configs: tr.configs.map((cfg) => {
          let bestScore = -Infinity;
          let bestCat = cfg.categories[0];
          for (const cat of cfg.categories) {
            const dir = SIGNAL_META[cat.category]?.direction === "sell" ? "sell" : "buy";
            const score = pickBestByRankMode(cat.summary, cat.composite.score, dir, scoreWeights);
            if (score > bestScore) {
              bestScore = score;
              bestCat = cat;
            }
          }
          return { ...cfg, bestScore, bestCategory: bestCat.category };
        }),
      })),
    [results, scoreWeights]
  );

  const resultsWithLongShortBest = useMemo(
    () =>
      resultsWithBest.map((tr) => {
        const getBest = (side: "long" | "short") => {
          let bestScore = -1;
          let bestCfg: ConfigResult | null = null;
          let bestCat: CategoryResult | null = null;
          for (const cfg of tr.configs) {
            const cat = getBestCategoryForSide(cfg, side);
            if (!cat || cat.summary.count === 0) continue;
            if (cat.composite.score > bestScore) {
              bestScore = cat.composite.score;
              bestCfg = cfg as any;
              bestCat = cat;
            }
          }
          return bestCfg && bestCat ? { cfg: bestCfg, cat: bestCat, score: bestScore } : null;
        };
        return { tr, longBest: getBest("long"), shortBest: getBest("short") };
      }),
    [resultsWithBest]
  );

  const getSortValue = (row: (typeof resultsWithLongShortBest)[0], col: string): any => {
    const { tr, longBest, shortBest } = row;
    const best = longBest && shortBest ? (longBest.score >= shortBest.score ? longBest : shortBest) : longBest ?? shortBest;
    const summary = best?.cat.summary ?? null;
    switch (col) {
      case "ticker":
        return tr.ticker;
      case "currentSignal":
        return tr.currentSignal;
      case "side":
        return best === longBest ? "Long" : "Short";
      case "bestConfig":
        return best?.cfg.configLabel ?? "";
      case "bestSignal":
        return best?.cat.label ?? "";
      case "signals":
        return best?.cat.summary.count ?? -1;
      case "score":
        return Math.max(longBest?.score ?? -1, shortBest?.score ?? -1);
      default: {
        const m = col.match(/^(hit|avg|pf)-(1M|2M|3M|6M)$/);
        if (!m || !summary) return -Infinity;
        const [, type, hz] = m;
        return type === "hit"
          ? returnMode === "band"
            ? summary.bandHitRate?.[hz] ?? summary.hitRate[hz]
            : summary.hitRate[hz]
          : type === "avg"
          ? summary.avgReturn[hz]
          : type === "pf"
          ? summary.profitFactor[hz]
          : -Infinity;
      }
    }
  };

  const sortedResults = useMemo(() => {
    const filterLower = filterText.trim().toLowerCase();
    const filtered = filterLower
      ? resultsWithLongShortBest.filter(
          (r) =>
            r.tr.ticker.toLowerCase().includes(filterLower) ||
            (r.tr.name && r.tr.name.toLowerCase().includes(filterLower))
        )
      : [...resultsWithLongShortBest];
    const { col, dir } = runSort;
    filtered.sort((a, b) => {
      const va = getSortValue(a, col);
      const vb = getSortValue(b, col);
      let diff = 0;
      if (typeof va === "string" || typeof vb === "string") {
        diff = String(va).localeCompare(String(vb));
      } else {
        diff = va - vb;
      }
      return dir === "asc" ? diff : -diff;
    });
    return filtered;
  }, [resultsWithLongShortBest, runSort, filterText, returnMode]);

  const handleRunSortColumn = (col: string) => {
    setRunSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "desc" ? "asc" : "desc" }
        : {
            col,
            dir:
              col === "ticker" ||
              col === "currentSignal" ||
              col === "side" ||
              col === "bestConfig" ||
              col === "bestSignal"
                ? "asc"
                : "desc",
          }
    );
  };

  const exportCsv = () => {
    const horizons = FORWARD_HORIZONS.filter((_: any, i: number) => i >= 2);
    const rows: any[] = [];
    for (const row of sortedResults) {
      const { tr } = row;
      for (const side of ["long", "short"] as const) {
        let bestCfg: ConfigResult | null = null;
        let bestCat: CategoryResult | null = null;
        let bestScore = -1;
        for (const cfg of tr.configs) {
          const cat = getBestCategoryForSide(cfg as any, side);
          if (!cat || cat.summary.count === 0) continue;
          if (cat.composite.score > bestScore) {
            bestScore = cat.composite.score;
            bestCfg = cfg as any;
            bestCat = cat;
          }
        }
        const summary = bestCat?.summary;
        const rowData: any = {
          ticker: tr.ticker,
          name: tr.name,
          side: side === "long" ? "Long" : "Short",
          currentSignal: tr.currentSignal,
          bestConfig: bestCfg?.configLabel ?? "",
          bestSignal: bestCat?.label ?? "",
          score: bestScore < 0 ? null : bestScore,
        };
        horizons.forEach((h: any) => {
          rowData[`hitRate_${h.label}`] = summary?.hitRate[h.label] ?? null;
          rowData[`avgReturn_${h.label}`] = summary?.avgReturn[h.label] ?? null;
          rowData[`pf_${h.label}`] = summary?.profitFactor[h.label] ?? null;
        });
        rows.push(rowData);
      }
    }
    const keys = Object.keys(rows[0] || {});
    const csv = [
      keys.join(","),
      ...rows.map((r) =>
        keys
          .map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "roc_optimizer.csv";
    a.click();
  };

  // ── Config count for current signal type ────────────────────────────────────

  const configCountForSignalType =
    signalType === "zero_cross"
      ? ZERO_CROSS_PERIODS.length
      : signalType === "threshold_cross" || signalType === "threshold_reversion"
      ? ZERO_CROSS_PERIODS.length * THRESHOLD_VALUES.length
      : signalType === "fast_slow_cross"
      ? FAST_SLOW_PAIRS.length
      : ZERO_CROSS_PERIODS.length * SLOPE_LOOKBACKS.length;

  const gridConfigCount = useMemo(() => buildConfigsForGridSize(gridSize).length, [gridSize]);

  const evalLabel = useMemo(() => {
    let paramsStr = `(${period})`;
    if (signalType === "fast_slow_cross") paramsStr = `(${period},${slowPeriod})`;
    else if (signalType === "threshold_cross" || signalType === "threshold_reversion")
      paramsStr = `(${period}, t=${(threshold * 100).toFixed(1)}%)`;
    else if (signalType === "slope_curvature") paramsStr = `(${period}, slb=${slopeLookback})`;
    return `ROC ${signalType}${paramsStr} [${evalSide}]`;
  }, [signalType, period, slowPeriod, threshold, slopeLookback, evalSide]);

  const evalTickerLabel = useMemo(
    () =>
      mode === "pair"
        ? `${pairTickerA || "A"}/${pairTickerB || "B"}`
        : mode === "single"
        ? selectedTicker || "—"
        : filteredByUniverse[0]?.ticker || "—",
    [mode, pairTickerA, pairTickerB, selectedTicker, filteredByUniverse]
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  const horizonsFiltered = FORWARD_HORIZONS.filter((_: any, i: number) => i >= 2);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header / tab bar */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">ROC</h2>
        <div className="flex gap-px">
          <button
            data-testid="roc-view-optimize"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${
              activeTab === "optimize"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground border border-border"
            }`}
            onClick={() => setActiveTab("optimize")}
          >
            Optimize
          </button>
          <button
            data-testid="roc-view-evaluate"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${
              activeTab === "evaluate"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground border border-border"
            }`}
            onClick={() => setActiveTab("evaluate")}
          >
            Evaluate
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {activeTab === "optimize"
            ? "Search ROC parameter space by hit rate"
            : "Score one specific ROC setup"}
        </span>
      </div>

      {activeTab === "evaluate" ? (
        <>
          {/* Evaluate controls */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-start gap-4 flex-wrap">
              {/* Mode */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                      mode === "single"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                    onClick={() => setMode("single")}
                  >
                    Single
                  </button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                      mode === "pair"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                    onClick={() => setMode("pair")}
                  >
                    Pair
                  </button>
                </div>
              </div>
              {/* Ticker pickers */}
              {mode === "single" && (
                <div className="flex items-end gap-2">
                  <div className={isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                    <UnifiedTickerPicker
                      tickers={filteredByUniverse}
                      value={isBasketTicker(selectedTicker) ? "" : selectedTicker}
                      onChange={setSelectedTicker}
                      label="Ticker"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
                    <BasketTickerPill
                      activeTicker={selectedTicker}
                      onSelectTicker={setSelectedTicker}
                      fallbackTicker={filteredByUniverse[0]?.ticker ?? null}
                    />
                  </div>
                </div>
              )}
              {mode === "pair" && (
                <>
                  <UnifiedTickerPicker
                    tickers={filteredByUniverse}
                    value={pairTickerA}
                    onChange={setPairTickerA}
                    label="Ticker A"
                  />
                  <UnifiedTickerPicker
                    tickers={filteredByUniverse}
                    value={pairTickerB}
                    onChange={setPairTickerB}
                    label="Ticker B"
                  />
                </>
              )}
              {mode === "single" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                  <InputSeriesPicker value={inputSelection} onChange={setInputSelection} family="roc" label="" />
                </div>
              )}
              {/* Side */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Side</label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                      evalSide === "long" ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                    onClick={() => setEvalSide("long")}
                  >
                    Long
                  </button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                      evalSide === "short" ? "bg-red-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                    onClick={() => setEvalSide("short")}
                  >
                    Short
                  </button>
                </div>
              </div>
              {/* Signal */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal</label>
                <select
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground"
                  value={signalType}
                  onChange={(e) => setSignalType(e.target.value)}
                >
                  <option value="zero_cross">Zero Cross</option>
                  <option value="threshold_cross">Threshold Cross</option>
                  <option value="threshold_reversion">Threshold Reversion</option>
                  <option value="fast_slow_cross">Fast/Slow Cross</option>
                  <option value="slope_curvature">Slope/Curvature</option>
                </select>
              </div>
              {/* Period */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Period</label>
                <input
                  type="number"
                  min={2}
                  max={400}
                  value={period}
                  onChange={(e) => setPeriod(parseInt(e.target.value) || 14)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
                />
              </div>
              {signalType === "fast_slow_cross" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Slow</label>
                  <input
                    type="number"
                    min={3}
                    max={400}
                    value={slowPeriod}
                    onChange={(e) => setSlowPeriod(parseInt(e.target.value) || 50)}
                    className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
                  />
                </div>
              )}
              {(signalType === "threshold_cross" || signalType === "threshold_reversion") && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Threshold</label>
                  <input
                    type="number"
                    step={0.01}
                    min={0.01}
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value) || 0.05)}
                    className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
                  />
                </div>
              )}
              {signalType === "slope_curvature" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Slope LB</label>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={slopeLookback}
                    onChange={(e) => setSlopeLookback(parseInt(e.target.value) || 5)}
                    className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
                  />
                </div>
              )}
              {/* Target % */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target %</label>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  value={+(targetReturn * 100).toFixed(4)}
                  onChange={(e) => setTargetReturn((parseFloat(e.target.value) || 5) / 100)}
                  title="Hit-rate threshold in percent. 5 = 5%."
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
                />
              </div>
              {/* Hold */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Hold</label>
                <input
                  type="number"
                  min={0}
                  value={minHold}
                  onChange={(e) => setMinHold(parseInt(e.target.value) || 0)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                />
              </div>
              {/* Date range */}
              <div className="flex items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
                <div className="flex items-center gap-0.5">
                  {DATE_PRESETS.map((p: any) => (
                    <button
                      key={p.value}
                      data-testid={`roc-eval-date-preset-${p.value}`}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                        datePreset === p.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground border border-border hover:text-foreground"
                      }`}
                      onClick={() => {
                        setDatePreset(p.value);
                        setDateRange(createDateRangeFromPreset(p.value));
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  data-testid="roc-eval-date-start"
                  value={dateRange.start}
                  onChange={(e) => {
                    setDatePreset("custom");
                    setDateRange({ ...dateRange, start: e.target.value });
                  }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                />
                <span className="text-[10px] font-mono text-muted-foreground">→</span>
                <input
                  type="date"
                  data-testid="roc-eval-date-end"
                  value={dateRange.end}
                  onChange={(e) => {
                    setDatePreset("custom");
                    setDateRange({ ...dateRange, end: e.target.value });
                  }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                />
              </div>
              {/* Run */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"> </label>
                <button
                  data-testid="roc-eval-run"
                  className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={runEvaluate}
                  disabled={evaluating}
                >
                  {evaluating ? "Evaluating…" : "Evaluate"}
                </button>
              </div>
            </div>
          </div>
          {/* Evaluate results */}
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <EvaluatorPanelResult
              result={evalResult}
              loading={evaluating}
              setupLabel={evalLabel}
              tickerLabel={evalTickerLabel}
            />
            {evalResult && evalPriceContext && evalResult.profiles.length >= 10 ? (
              <EvaluatorPanelLoader
                ticker={
                  evalPriceContext.mode === "pair"
                    ? evalPriceContext.pairLegA || ""
                    : selectedTicker || filteredByUniverse[0]?.ticker || ""
                }
                priceContext={evalPriceContext}
                signals={evalResult.profiles}
                direction={evalSide === "long" ? "buy" : "sell"}
                title={`Hit Conditions — ${evalLabel} on ${evalTickerLabel}`}
                useBand={false}
              />
            ) : null}
          </div>
        </>
      ) : (
        <>
          {/* PresetBar */}
          <PresetBar kind="roc" captureInputs={captureInputsForPreset} applyInputs={applyInputsFromPreset} />

          {/* Optimize controls */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Info bar */}
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground">Rate of Change momentum signals</p>
                <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  Yahoo Finance
                </span>
                {lastFetchedAt && (
                  <span className="text-[9px] font-mono text-muted-foreground">
                    Last fetched: {Math.round((Date.now() - lastFetchedAt) / 60000)}m ago
                  </span>
                )}
                <button
                  onClick={async () => {
                    const t = selectedTicker;
                    if (t) {
                      setRefreshing(true);
                      try {
                        await refreshTickerData(t);
                        setLastFetchedAt(Date.now());
                      } catch {} finally {
                        setRefreshing(false);
                      }
                    }
                  }}
                  disabled={refreshing}
                  title="Force refresh Yahoo price cache"
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {refreshing ? "…" : "↻"}
                </button>
              </div>

              {/* Signal type */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal Type</label>
                <div className="flex gap-px">
                  {["zero_cross", "threshold_cross", "threshold_reversion", "fast_slow_cross", "slope_curvature"].map(
                    (t) => (
                      <button
                        key={t}
                        data-testid={`signal-type-${t}`}
                        className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                          signalType === t
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:text-foreground border border-border"
                        }`}
                        onClick={() => setSignalType(t)}
                        disabled={running}
                      >
                        {t === "zero_cross"
                          ? "Zero Cross"
                          : t === "threshold_cross"
                          ? "Threshold"
                          : t === "threshold_reversion"
                          ? "Thresh Rev"
                          : t === "fast_slow_cross"
                          ? "Fast/Slow"
                          : "Slope/Curv"}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Period */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  {signalType === "fast_slow_cross" ? "Fast Period" : "Period"}
                </label>
                <input
                  type="number"
                  min={2}
                  max={400}
                  step={1}
                  data-testid="roc-period"
                  className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14"
                  value={period}
                  onChange={(e) => setPeriod(Math.max(2, Math.min(400, Math.floor(Number(e.target.value) || 2))))}
                  disabled={running}
                  title="Primary ROC period"
                />
              </div>

              {signalType === "fast_slow_cross" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Slow Period</label>
                  <input
                    type="number"
                    min={2}
                    max={400}
                    step={1}
                    data-testid="roc-slow-period"
                    className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14"
                    value={slowPeriod}
                    onChange={(e) => setSlowPeriod(Math.max(2, Math.min(400, Math.floor(Number(e.target.value) || 2))))}
                    disabled={running}
                    title="Slow ROC period"
                  />
                </div>
              )}

              {(signalType === "threshold_cross" || signalType === "threshold_reversion") && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Threshold %</label>
                  <input
                    type="number"
                    min={0.1}
                    max={50}
                    step={0.1}
                    data-testid="roc-threshold"
                    className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-16"
                    value={(threshold * 100).toFixed(1)}
                    onChange={(e) => setThreshold(Math.max(0.001, Math.min(0.5, Number(e.target.value) / 100)))}
                    disabled={running}
                    title="Threshold as percentage (e.g. 5 = 5%)"
                  />
                </div>
              )}

              {signalType === "slope_curvature" && (
                <div className="flex flex-col gap-0.5">
                  <label
                    className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"
                    title="Slope lookback: slope[i] = ROC[i] - ROC[i - lookback]"
                  >
                    Slope LB
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    data-testid="roc-slope-lookback"
                    className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-12"
                    value={slopeLookback}
                    onChange={(e) => setSlopeLookback(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    disabled={running}
                    title={`Slope lookback: ${slopeLookback} bars`}
                  />
                </div>
              )}

              {/* Frequency UI */}
              {frequencyUI}

              {/* Date range */}
              <div className="flex items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
                <div className="flex items-center gap-0.5">
                  {DATE_PRESETS.map((p: any) => (
                    <button
                      key={p.value}
                      data-testid={`roc-date-preset-${p.value}`}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                        datePreset === p.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground border border-border hover:text-foreground"
                      }`}
                      onClick={() => {
                        setDatePreset(p.value);
                        setDateRange(createDateRangeFromPreset(p.value));
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  data-testid="roc-date-start"
                  value={dateRange.start}
                  onChange={(e) => {
                    setDatePreset("custom");
                    setDateRange({ ...dateRange, start: e.target.value });
                  }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                />
                <span className="text-[10px] font-mono text-muted-foreground">→</span>
                <input
                  type="date"
                  data-testid="roc-date-end"
                  value={dateRange.end}
                  onChange={(e) => {
                    setDatePreset("custom");
                    setDateRange({ ...dateRange, end: e.target.value });
                  }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                />
              </div>

              {/* Return basis */}
              <div
                className="flex flex-col gap-0.5"
                title="Relative: subtract the peer-group median return at each horizon."
              >
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Return Basis</label>
                <div className="flex gap-px">
                  {["absolute", "relative"].map((b) => (
                    <button
                      key={b}
                      data-testid={`return-basis-${b}`}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                        returnBasis === b
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:text-foreground border border-border"
                      }`}
                      onClick={() => setReturnBasis(b as any)}
                      disabled={running}
                    >
                      {b === "absolute" ? "Absolute" : "Relative"}
                    </button>
                  ))}
                </div>
              </div>

              {returnBasis === "relative" && (
                <div
                  className="flex flex-col gap-0.5"
                  title="Each ticker is compared to the median forward return of all tickers sharing its value at this classification level."
                >
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Peer Level</label>
                  <select
                    data-testid="peer-level"
                    className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-1"
                    value={peerLevel}
                    onChange={(e) => setPeerLevel(e.target.value)}
                    disabled={running}
                  >
                    <option value="economy">Economy</option>
                    <option value="sector">Sector</option>
                    <option value="subsector">Subsector</option>
                    <option value="industryGroup">Ind. Group</option>
                    <option value="industry">Industry</option>
                    <option value="subindustry">Subindustry</option>
                  </select>
                </div>
              )}

              {/* Mode */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  {(["single", "universe", "pair", "pairCombo", "basket"] as const).map((m) => (
                    <button
                      key={m}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                        mode === m
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:text-foreground border border-border"
                      }`}
                      onClick={() => setMode(m)}
                      disabled={running}
                      data-testid={`optimizer-mode-${m}`}
                    >
                      {m === "single"
                        ? "Single Ticker"
                        : m === "universe"
                        ? "Universe"
                        : m === "pair"
                        ? "Pair (A/B)"
                        : m === "pairCombo"
                        ? "Pair Combo"
                        : "Basket"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Universe class filter */}
              {mode === "universe" && classFilterState.classFilterUI && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    Classification Filter
                  </label>
                  {classFilterState.universeSourceUI}
                  {classFilterState.classFilterUI}
                </div>
              )}

              {/* Single ticker */}
              {mode === "single" && (
                <div className="flex items-end gap-2">
                  <div className="flex items-end gap-2">
                    <div className={isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                      <UnifiedTickerPicker
                        tickers={filteredByUniverse}
                        value={isBasketTicker(selectedTicker) ? "" : selectedTicker}
                        onChange={setSelectedTicker}
                        disabled={running}
                        label="Ticker"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
                      <BasketTickerPill
                        activeTicker={selectedTicker}
                        onSelectTicker={setSelectedTicker}
                        fallbackTicker={filteredByUniverse[0]?.ticker ?? null}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Pair */}
              {mode === "pair" && (
                <div className="flex items-end gap-2">
                  <UnifiedTickerPicker
                    tickers={filteredByUniverse}
                    value={pairTickerA}
                    onChange={setPairTickerA}
                    disabled={running}
                    label="A"
                  />
                  <UnifiedTickerPicker
                    tickers={filteredByUniverse}
                    value={pairTickerB}
                    onChange={setPairTickerB}
                    disabled={running}
                    label="B"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground pb-1">
                    Ratio:{" "}
                    <span className="text-foreground font-bold">
                      {pairTickerA || "A"}/{pairTickerB || "B"}
                    </span>
                  </span>
                </div>
              )}

              {/* Pair combo */}
              {mode === "pairCombo" && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    Pair Combo — Leg Set
                  </label>
                  {pairComboState.ui}
                </div>
              )}

              {/* Basket */}
              {mode === "basket" && (
                <div className="flex flex-col gap-2">
                  <BasketPicker
                    tickers={filteredByUniverse}
                    value={basketTickers}
                    onChange={setBasketTickers}
                    disabled={running}
                    testIdPrefix="roc-basket"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Basket Run Mode
                    </label>
                    <div className="flex gap-px" data-testid="roc-basket-mode">
                      {(["stocks", "combined"] as const).map((bm) => (
                        <button
                          key={bm}
                          data-testid={`roc-basket-mode-${bm}`}
                          className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                            basketMode === bm
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:text-foreground border border-border"
                          }`}
                          onClick={() => setBasketMode(bm)}
                          disabled={running}
                          title={
                            bm === "stocks"
                              ? "Run optimizer on each basket constituent separately"
                              : "Run optimizer on a single synthetic series using the basket's weighting scheme"
                          }
                        >
                          {bm === "stocks" ? "Stock by Stock" : "Combined"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Return measure */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Return Measure</label>
                <div className="flex gap-px">
                  {(["threshold", "band"] as const).map((rm) => (
                    <button
                      key={rm}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                        returnMode === rm
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:text-foreground border border-border"
                      }`}
                      onClick={() => setReturnMode(rm)}
                      disabled={running}
                    >
                      {rm === "threshold" ? "Threshold" : "Band"}
                    </button>
                  ))}
                </div>
              </div>

              {returnMode === "threshold" ? (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target</label>
                  <select
                    className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]"
                    value={targetReturn}
                    onChange={(e) => setTargetReturn(Number(e.target.value))}
                    disabled={running}
                  >
                    {TARGET_RETURN_OPTIONS.map((o: any) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Band</label>
                    <select
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[80px]"
                      value={`${bandMin}-${bandMax}`}
                      onChange={(e) => {
                        const [lo, hi] = e.target.value.split("-").map(Number);
                        setBandMin(lo);
                        setBandMax(hi);
                      }}
                      disabled={running}
                    >
                      {RETURN_BAND_PRESETS.map((p: any) => (
                        <option key={p.label} value={`${p.band.minReturn}-${p.band.maxReturn}`}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min %</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                      value={Math.round(bandMin * 100)}
                      onChange={(e) => setBandMin(Number(e.target.value) / 100)}
                      disabled={running}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Max %</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                      value={Math.round(bandMax * 100)}
                      onChange={(e) => setBandMax(Number(e.target.value) / 100)}
                      disabled={running}
                    />
                  </div>
                </>
              )}

              {/* Min hold */}
              <div className="flex flex-col gap-0.5">
                <label
                  className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"
                  title="Minimum holding period in trading days."
                >
                  Min Hold
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="126"
                  data-testid="min-hold"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                  value={minHold}
                  onChange={(e) => setMinHold(Math.max(0, Math.min(126, Math.floor(Number(e.target.value) || 0))))}
                  disabled={running}
                  title="Trading days. Forces hold for at least N days before counting hits and before allowing a new signal."
                />
              </div>

              {/* Min signals */}
              <div className="flex flex-col gap-0.5">
                <label
                  className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"
                  title="Grid Search only: hides combos with fewer than N signals on a side."
                >
                  Min Signals
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="500"
                  data-testid="min-signals"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                  value={minSignals}
                  onChange={(e) => setMinSignals(Math.max(0, Math.min(500, Math.floor(Number(e.target.value) || 0))))}
                  title="Grid Search only — hides any combo whose signal count is below this on a given side."
                />
              </div>

              {/* Run / Cancel button */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"> </label>
                {running ? (
                  <button
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500"
                    onClick={() => {
                      cancelRef.current = true;
                    }}
                  >
                    Cancel ({progress.current}/{progress.total})
                  </button>
                ) : (
                  <button
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={runOptimize}
                  >
                    Run Optimizer
                  </button>
                )}
              </div>

              {/* Grid search controls */}
              {!running && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Grid Size</label>
                    <select
                      data-testid="grid-size"
                      className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-1"
                      value={gridSize}
                      onChange={(e) => setGridSize(e.target.value)}
                      disabled={running}
                    >
                      <option value="quick">Quick (~16)</option>
                      <option value="standard">Standard (~150)</option>
                      <option value="deep">Deep (~370)</option>
                      <option value="exhaustive">Exhaustive (~2k+)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"> </label>
                    <button
                      className="text-xs font-mono font-bold px-4 py-1 rounded bg-violet-600 text-white hover:bg-violet-500"
                      onClick={runGridSearch}
                    >
                      Grid Search
                    </button>
                  </div>
                </>
              )}

              {/* Input series */}
              {mode === "single" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input</label>
                  <InputSeriesPicker value={inputSelection} onChange={setInputSelection} family="roc" label="" />
                </div>
              )}
            </div>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-auto px-4 py-3">
            {/* Grid results */}
            {gridResults.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                  Grid Search Results — {gridResults.length} tickers
                </h3>
                {gridResults.map((gr) => {
                  const bullCombos = gr.topCombos
                    .filter((c) => c.bullSignals >= minSignals)
                    .filter((_, i) => i < 20);
                  const bearCombos = gr.topCombos
                    .filter((c) => c.bearSignals >= minSignals)
                    .filter((_, i) => i < 20);
                  const sortedBull = sortGridCombos(bullCombos, "long", gridLongSort);
                  const sortedBear = sortGridCombos(bearCombos, "short", gridShortSort);
                  const isExpanded = expandedGridTicker === gr.ticker;
                  return (
                    <div key={gr.ticker} className="border border-border rounded mb-2">
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30"
                        onClick={() => setExpandedGridTicker(isExpanded ? null : gr.ticker)}
                        data-testid={`grid-ticker-${gr.ticker}`}
                      >
                        <span className="font-bold text-sm text-foreground">{gr.ticker}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{gr.name}</span>
                        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                          {gr.topCombos.length} combos {isExpanded ? "▾" : "▸"}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border">
                          {/* Long table */}
                          {sortedBull.length > 0 && (
                            <>
                              <div className="px-3 py-1.5 bg-emerald-600/10 border-b border-emerald-600/20">
                                <span className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-wider">
                                  Top Long Configs — Bull Signals
                                </span>
                              </div>
                              <table className="w-full text-[10px] font-mono">
                                <thead className="bg-card border-b border-border">
                                  <tr className="text-muted-foreground">
                                    {(() => {
                                      const thCls = (col: string, base: string) =>
                                        `${base} cursor-pointer select-none hover:text-foreground ${gridLongSort.col === col ? "text-foreground" : ""}`;
                                      const arrow = (col: string) =>
                                        gridLongSort.col === col
                                          ? gridLongSort.dir === "desc"
                                            ? " ▼"
                                            : " ▲"
                                          : "";
                                      const onSort = (col: string) =>
                                        setGridLongSort((prev) =>
                                          prev.col === col
                                            ? { col, dir: prev.dir === "desc" ? "asc" : "desc" }
                                            : {
                                                col,
                                                dir:
                                                  col === "config" || col === "side" ? "asc" : "desc",
                                              }
                                        );
                                      return (
                                        <>
                                          <th className="text-left px-2 py-1 font-medium">#</th>
                                          <th className={thCls("side", "text-left px-2 py-1 font-medium")} onClick={() => onSort("side")} data-testid={`sort-grid-long-${gr.ticker}-side`}>Side{arrow("side")}</th>
                                          <th className={thCls("config", "text-left px-2 py-1 font-medium")} onClick={() => onSort("config")} data-testid={`sort-grid-long-${gr.ticker}-config`}>Config{arrow("config")}</th>
                                          <th className={thCls("signals", "text-right px-2 py-1 font-medium")} onClick={() => onSort("signals")} data-testid={`sort-grid-long-${gr.ticker}-signals`}>Signals{arrow("signals")}</th>
                                          <th className={thCls("hit-1M", "text-right px-2 py-1 font-medium")} onClick={() => onSort("hit-1M")} data-testid={`sort-grid-long-${gr.ticker}-hit-1M`}>Hit 1M{arrow("hit-1M")}</th>
                                          <th className={thCls("hit-3M", "text-right px-2 py-1 font-medium")} onClick={() => onSort("hit-3M")} data-testid={`sort-grid-long-${gr.ticker}-hit-3M`}>Hit 3M{arrow("hit-3M")}</th>
                                          <th className={thCls("hit-6M", "text-right px-2 py-1 font-medium")} onClick={() => onSort("hit-6M")} data-testid={`sort-grid-long-${gr.ticker}-hit-6M`}>Hit 6M{arrow("hit-6M")}</th>
                                          <th className={thCls("avg-3M", "text-right px-2 py-1 font-medium")} onClick={() => onSort("avg-3M")} data-testid={`sort-grid-long-${gr.ticker}-avg-3M`}>Avg 3M{arrow("avg-3M")}</th>
                                          <th className={thCls("pf-3M", "text-right px-2 py-1 font-medium")} onClick={() => onSort("pf-3M")} data-testid={`sort-grid-long-${gr.ticker}-pf-3M`}>PF 3M{arrow("pf-3M")}</th>
                                          <th className={thCls("score", "text-right px-2 py-1 font-medium")} onClick={() => onSort("score")} data-testid={`sort-grid-long-${gr.ticker}-score`}>Score{arrow("score")}</th>
                                        </>
                                      );
                                    })()}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedBull.map((combo, idx) => {
                                    const s = combo.bullSummary;
                                    const expandKey = `${gr.ticker}:${combo.configLabel}:long`;
                                    const isExpSig = expandedSignalsSet.has(expandKey);
                                    const dates = combo.bullDates ?? [];
                                    const shown = dates.slice(-50).reverse();
                                    const extra = dates.length > 50 ? dates.length - 50 : 0;
                                    return (
                                      <React.Fragment key={`l-frag-${idx}`}>
                                        <tr className="border-b border-border/50 hover:bg-accent/30">
                                          <td className="px-2 py-1 text-muted-foreground">{idx + 1}</td>
                                          <td className="px-2 py-1">
                                            <span className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-emerald-600/20 text-emerald-400 border-emerald-600/30">
                                              Long
                                            </span>
                                          </td>
                                          <td className="px-2 py-1">
                                            <span>{combo.configLabel}</span>
                                            <button
                                              className="ml-2 text-[8px] font-mono px-1 py-0 rounded border border-border bg-background text-muted-foreground hover:text-foreground"
                                              onClick={() =>
                                                setExpandedSignalsSet((prev) => {
                                                  const next = new Set(prev);
                                                  next.has(expandKey) ? next.delete(expandKey) : next.add(expandKey);
                                                  return next;
                                                })
                                              }
                                            >
                                              {isExpSig ? "▾" : "▸"} Signals ({dates.length})
                                            </button>
                                          </td>
                                          <td className="px-2 py-1 text-right text-muted-foreground">{combo.bullSignals}</td>
                                          <td className={`px-2 py-1 text-right ${s?.hitRate["1M"] != null ? hitRateColor(s.hitRate["1M"]) : "text-muted-foreground/40"}`}>
                                            {s?.hitRate["1M"] != null ? pctSigned(s.hitRate["1M"]) : "—"}
                                          </td>
                                          <td className={`px-2 py-1 text-right ${s?.hitRate["3M"] != null ? hitRateColor(s.hitRate["3M"]) : "text-muted-foreground/40"}`}>
                                            {s?.hitRate["3M"] != null ? pctSigned(s.hitRate["3M"]) : "—"}
                                          </td>
                                          <td className={`px-2 py-1 text-right ${s?.hitRate["6M"] != null ? hitRateColor(s.hitRate["6M"]) : "text-muted-foreground/40"}`}>
                                            {s?.hitRate["6M"] != null ? pctSigned(s.hitRate["6M"]) : "—"}
                                          </td>
                                          <td className="px-2 py-1 text-right">
                                            {s?.avgReturn["3M"] != null ? pctSigned(s.avgReturn["3M"]) : "—"}
                                          </td>
                                          <td className={`px-2 py-1 text-right ${s?.profitFactor["3M"] != null ? profitFactorColor(s.profitFactor["3M"]) : "text-muted-foreground/40"}`}>
                                            {s?.profitFactor["3M"] != null ? s.profitFactor["3M"].toFixed(2) : "—"}
                                          </td>
                                          <td className={`px-2 py-1 text-right font-bold ${scoreTextColor(combo.bullScore)}`}>
                                            {combo.bullScore.toFixed(0)}
                                          </td>
                                        </tr>
                                        {isExpSig && (
                                          <tr className="border-b border-border/50 bg-emerald-600/5">
                                            <td colSpan={10} className="px-3 py-1">
                                              {extra > 0 && (
                                                <div className="text-[8px] font-mono text-muted-foreground mb-0.5">
                                                  + {extra} older signals not shown
                                                </div>
                                              )}
                                              <table className="text-[9px] font-mono">
                                                <thead>
                                                  <tr className="text-muted-foreground">
                                                    <th className="text-left pr-4 py-0.5">Date</th>
                                                    <th className="text-right pr-4 py-0.5">1M</th>
                                                    <th className="text-right pr-4 py-0.5">3M</th>
                                                    <th className="text-right py-0.5">6M</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {shown.map((d, di) => (
                                                    <tr key={di}>
                                                      <td className="pr-4 py-0.5 text-foreground">{d.date}</td>
                                                      <td className={`pr-4 py-0.5 text-right ${d.ret1m !== null ? d.ret1m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                        {d.ret1m !== null ? pctSigned(d.ret1m) : "—"}
                                                      </td>
                                                      <td className={`pr-4 py-0.5 text-right ${d.ret3m !== null ? d.ret3m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                        {d.ret3m !== null ? pctSigned(d.ret3m) : "—"}
                                                      </td>
                                                      <td className={`py-0.5 text-right ${d.ret6m !== null ? d.ret6m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                        {d.ret6m !== null ? pctSigned(d.ret6m) : "—"}
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </>
                          )}
                          {/* Short table */}
                          {sortedBear.length > 0 && (
                            <>
                              <div className="px-3 py-1.5 bg-red-600/10 border-b border-t border-red-600/20">
                                <span className="text-[10px] font-bold font-mono text-red-400 uppercase tracking-wider">
                                  Top Short Configs — Bear Signals
                                </span>
                              </div>
                              <table className="w-full text-[10px] font-mono">
                                <thead className="bg-card border-b border-border">
                                  <tr className="text-muted-foreground">
                                    {(() => {
                                      const thCls = (col: string, base: string) =>
                                        `${base} cursor-pointer select-none hover:text-foreground ${gridShortSort.col === col ? "text-foreground" : ""}`;
                                      const arrow = (col: string) =>
                                        gridShortSort.col === col
                                          ? gridShortSort.dir === "desc"
                                            ? " ▼"
                                            : " ▲"
                                          : "";
                                      const onSort = (col: string) =>
                                        setGridShortSort((prev) =>
                                          prev.col === col
                                            ? { col, dir: prev.dir === "desc" ? "asc" : "desc" }
                                            : {
                                                col,
                                                dir: col === "config" || col === "side" ? "asc" : "desc",
                                              }
                                        );
                                      return (
                                        <>
                                          <th className="text-left px-2 py-1 font-medium">#</th>
                                          <th className={thCls("side", "text-left px-2 py-1 font-medium")} onClick={() => onSort("side")} data-testid={`sort-grid-short-${gr.ticker}-side`}>Side{arrow("side")}</th>
                                          <th className={thCls("config", "text-left px-2 py-1 font-medium")} onClick={() => onSort("config")} data-testid={`sort-grid-short-${gr.ticker}-config`}>Config{arrow("config")}</th>
                                          <th className={thCls("signals", "text-right px-2 py-1 font-medium")} onClick={() => onSort("signals")} data-testid={`sort-grid-short-${gr.ticker}-signals`}>Signals{arrow("signals")}</th>
                                          <th className={thCls("hit-1M", "text-right px-2 py-1 font-medium")} onClick={() => onSort("hit-1M")} data-testid={`sort-grid-short-${gr.ticker}-hit-1M`}>Hit 1M{arrow("hit-1M")}</th>
                                          <th className={thCls("hit-3M", "text-right px-2 py-1 font-medium")} onClick={() => onSort("hit-3M")} data-testid={`sort-grid-short-${gr.ticker}-hit-3M`}>Hit 3M{arrow("hit-3M")}</th>
                                          <th className={thCls("hit-6M", "text-right px-2 py-1 font-medium")} onClick={() => onSort("hit-6M")} data-testid={`sort-grid-short-${gr.ticker}-hit-6M`}>Hit 6M{arrow("hit-6M")}</th>
                                          <th className={thCls("avg-3M", "text-right px-2 py-1 font-medium")} onClick={() => onSort("avg-3M")} data-testid={`sort-grid-short-${gr.ticker}-avg-3M`}>Avg 3M{arrow("avg-3M")}</th>
                                          <th className={thCls("pf-3M", "text-right px-2 py-1 font-medium")} onClick={() => onSort("pf-3M")} data-testid={`sort-grid-short-${gr.ticker}-pf-3M`}>PF 3M{arrow("pf-3M")}</th>
                                          <th className={thCls("score", "text-right px-2 py-1 font-medium")} onClick={() => onSort("score")} data-testid={`sort-grid-short-${gr.ticker}-score`}>Score{arrow("score")}</th>
                                        </>
                                      );
                                    })()}
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedBear.map((combo, idx) => {
                                    const s = combo.bearSummary;
                                    const expandKey = `${gr.ticker}:${combo.configLabel}:short`;
                                    const isExpSig = expandedSignalsSet.has(expandKey);
                                    const dates = combo.bearDates ?? [];
                                    const shown = dates.slice(-50).reverse();
                                    const extra = dates.length > 50 ? dates.length - 50 : 0;
                                    return (
                                      <React.Fragment key={`s-frag-${idx}`}>
                                        <tr className="border-b border-border/50 hover:bg-accent/30">
                                          <td className="px-2 py-1 text-muted-foreground">{idx + 1}</td>
                                          <td className="px-2 py-1">
                                            <span className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-red-600/20 text-red-400 border-red-600/30">
                                              Short
                                            </span>
                                          </td>
                                          <td className="px-2 py-1">
                                            <span>{combo.configLabel}</span>
                                            <button
                                              className="ml-2 text-[8px] font-mono px-1 py-0 rounded border border-border bg-background text-muted-foreground hover:text-foreground"
                                              onClick={() =>
                                                setExpandedSignalsSet((prev) => {
                                                  const next = new Set(prev);
                                                  next.has(expandKey) ? next.delete(expandKey) : next.add(expandKey);
                                                  return next;
                                                })
                                              }
                                            >
                                              {isExpSig ? "▾" : "▸"} Signals ({dates.length})
                                            </button>
                                          </td>
                                          <td className="px-2 py-1 text-right text-muted-foreground">{combo.bearSignals}</td>
                                          <td className={`px-2 py-1 text-right ${s?.hitRate["1M"] != null ? hitRateColor(s.hitRate["1M"]) : "text-muted-foreground/40"}`}>
                                            {s?.hitRate["1M"] != null ? pctSigned(s.hitRate["1M"]) : "—"}
                                          </td>
                                          <td className={`px-2 py-1 text-right ${s?.hitRate["3M"] != null ? hitRateColor(s.hitRate["3M"]) : "text-muted-foreground/40"}`}>
                                            {s?.hitRate["3M"] != null ? pctSigned(s.hitRate["3M"]) : "—"}
                                          </td>
                                          <td className={`px-2 py-1 text-right ${s?.hitRate["6M"] != null ? hitRateColor(s.hitRate["6M"]) : "text-muted-foreground/40"}`}>
                                            {s?.hitRate["6M"] != null ? pctSigned(s.hitRate["6M"]) : "—"}
                                          </td>
                                          <td className="px-2 py-1 text-right">
                                            {s?.avgReturn["3M"] != null ? pctSigned(s.avgReturn["3M"]) : "—"}
                                          </td>
                                          <td className={`px-2 py-1 text-right ${s?.profitFactor["3M"] != null ? profitFactorColor(s.profitFactor["3M"]) : "text-muted-foreground/40"}`}>
                                            {s?.profitFactor["3M"] != null ? s.profitFactor["3M"].toFixed(2) : "—"}
                                          </td>
                                          <td className={`px-2 py-1 text-right font-bold ${scoreTextColor(combo.bearScore)}`}>
                                            {combo.bearScore.toFixed(0)}
                                          </td>
                                        </tr>
                                        {isExpSig && (
                                          <tr className="border-b border-border/50 bg-red-600/5">
                                            <td colSpan={10} className="px-3 py-1">
                                              {extra > 0 && (
                                                <div className="text-[8px] font-mono text-muted-foreground mb-0.5">
                                                  + {extra} older signals not shown
                                                </div>
                                              )}
                                              <table className="text-[9px] font-mono">
                                                <thead>
                                                  <tr className="text-muted-foreground">
                                                    <th className="text-left pr-4 py-0.5">Date</th>
                                                    <th className="text-right pr-4 py-0.5">1M</th>
                                                    <th className="text-right pr-4 py-0.5">3M</th>
                                                    <th className="text-right py-0.5">6M</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {shown.map((d, di) => (
                                                    <tr key={di}>
                                                      <td className="pr-4 py-0.5 text-foreground">{d.date}</td>
                                                      <td className={`pr-4 py-0.5 text-right ${d.ret1m !== null ? d.ret1m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                        {d.ret1m !== null ? pctSigned(d.ret1m) : "—"}
                                                      </td>
                                                      <td className={`pr-4 py-0.5 text-right ${d.ret3m !== null ? d.ret3m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                        {d.ret3m !== null ? pctSigned(d.ret3m) : "—"}
                                                      </td>
                                                      <td className={`py-0.5 text-right ${d.ret6m !== null ? d.ret6m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                        {d.ret6m !== null ? pctSigned(d.ret6m) : "—"}
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Computing indicator */}
            {running && results.length === 0 && gridResults.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">Computing ROC signals...</div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {progress.current}/{progress.total} tickers × {configCountForSignalType} configs
                  </div>
                  <div className="w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Optimize results table */}
            {results.length > 0 && (
              <div>
                {/* Table header controls */}
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    {sortedResults.length}
                    {filterText ? ` of ${results.length}` : ""} tickers — ROC{" "}
                    {signalType.replace(/_/g, " ")} —{" "}
                    {returnMode === "band"
                      ? `band ${pctSigned(bandMin)}–${pctSigned(bandMax)}`
                      : `target ${pctSigned(targetReturn)}`}
                    {returnBasis === "relative" ? ` — vs ${peerLevel} median` : ""}
                  </h3>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-mono text-muted-foreground">RANK BY</label>
                      <select
                        data-testid="roc-rank-by"
                        value={rankBy}
                        onChange={(e) => setRankBy(e.target.value)}
                        className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5"
                      >
                        {/* rank options come from SIGNAL_META or a static list */}
                        <option value="composite">Composite</option>
                        <option value="hitRate">Hit Rate</option>
                        <option value="profitFactor">Profit Factor</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      placeholder="Filter ticker / name…"
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      data-testid="input-results-filter"
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[180px] focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {filterText && (
                      <button
                        onClick={() => setFilterText("")}
                        data-testid="button-clear-results-filter"
                        className="text-[10px] font-mono px-2 py-1 rounded border border-border bg-background text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                    <span className="text-[9px] font-mono text-muted-foreground/70 mx-1">
                      click column to sort
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 text-[11px]"
                      onClick={exportCsv}
                      data-testid="export-csv"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Main results table */}
                <div className="border border-border rounded mb-4">
                  <table className="w-full text-[10px] font-mono">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-card text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">
                        {(() => {
                          const thCls = (col: string, base: string) =>
                            `${base} cursor-pointer select-none hover:text-foreground ${runSort.col === col ? "text-foreground" : ""}`;
                          const arrow = (col: string) =>
                            runSort.col === col ? (runSort.dir === "desc" ? " ▼" : " ▲") : "";
                          return (
                            <>
                              <th className={thCls("ticker", "text-left px-2 py-1 font-bold sticky left-0 bg-card z-30 border-r border-border")} onClick={() => handleRunSortColumn("ticker")} data-testid="sort-header-ticker">Ticker{arrow("ticker")}</th>
                              <th className={thCls("currentSignal", "text-center px-2 py-1 font-bold bg-card")} onClick={() => handleRunSortColumn("currentSignal")} data-testid="sort-header-currentSignal">Current Signal{arrow("currentSignal")}</th>
                              <th className={thCls("side", "text-center px-2 py-1 font-bold bg-card")} onClick={() => handleRunSortColumn("side")} data-testid="sort-header-side">Side{arrow("side")}</th>
                              <th className={thCls("bestConfig", "text-center px-2 py-1 font-bold bg-card")} onClick={() => handleRunSortColumn("bestConfig")} data-testid="sort-header-bestConfig">Best Config{arrow("bestConfig")}</th>
                              <th className={thCls("bestSignal", "text-center px-2 py-1 font-bold bg-card")} onClick={() => handleRunSortColumn("bestSignal")} data-testid="sort-header-bestSignal">Best Signal{arrow("bestSignal")}</th>
                              <th className={thCls("signals", "text-center px-2 py-1 font-bold bg-card")} onClick={() => handleRunSortColumn("signals")} data-testid="sort-header-signals" title="Sample size — number of signal occurrences for this configuration">N{arrow("signals")}</th>
                              {horizonsFiltered.map((h: any) => (
                                <th key={h.label} className={thCls(`hit-${h.label}`, "text-center px-2 py-1 font-bold bg-card")} onClick={() => handleRunSortColumn(`hit-${h.label}`)} data-testid={`sort-header-hit-${h.label}`}>
                                  {returnMode === "band" ? "Band" : "Hit"} {h.label}{arrow(`hit-${h.label}`)}
                                </th>
                              ))}
                              {horizonsFiltered.map((h: any) => (
                                <th key={`avg-${h.label}`} className={thCls(`avg-${h.label}`, "text-center px-2 py-1 font-bold bg-card")} onClick={() => handleRunSortColumn(`avg-${h.label}`)} data-testid={`sort-header-avg-${h.label}`}>
                                  Avg {h.label}{arrow(`avg-${h.label}`)}
                                </th>
                              ))}
                              {horizonsFiltered.map((h: any) => (
                                <th key={`pf-${h.label}`} className={thCls(`pf-${h.label}`, "text-center px-2 py-1 font-bold bg-card")} onClick={() => handleRunSortColumn(`pf-${h.label}`)} data-testid={`sort-header-pf-${h.label}`}>
                                  PF {h.label}{arrow(`pf-${h.label}`)}
                                </th>
                              ))}
                              <th className={thCls("score", "text-center px-2 py-1 font-bold bg-card")} onClick={() => handleRunSortColumn("score")} data-testid="sort-header-score">Score{arrow("score")}</th>
                            </>
                          );
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedResults.flatMap((row) => {
                        const { tr, longBest, shortBest } = row;
                        const isExpanded = expandedTicker === tr.ticker;
                        return (
                          [
                            { key: "long", data: longBest },
                            { key: "short", data: shortBest },
                          ] as const
                        ).map(({ key: side, data: best }, rowIdx) => {
                          const isLong = side === "long";
                          const sideLabel = isLong ? "Long" : "Short";
                          const sideCls = isLong
                            ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30"
                            : "bg-red-600/20 text-red-400 border-red-600/30";
                          const summary = best?.cat.summary ?? null;
                          const score = best?.score ?? 0;
                          const isFirst = rowIdx === 0;
                          const currentSig = getTickerCurrentSignal(tr, best?.cfg.config, signalType);
                          const currentROCFmt = getTickerCurrentROCFormatted(tr, best?.cfg.config);
                          const sigClass = classifyCurrentSignal(currentSig);
                          const rowBg = isExpanded
                            ? "bg-primary/10"
                            : sigClass === "buy"
                            ? "bg-emerald-600/10 hover:bg-emerald-600/15"
                            : sigClass === "short"
                            ? "bg-red-600/10 hover:bg-red-600/15"
                            : "hover:bg-white/5";
                          return (
                            <tr
                              key={`${tr.ticker}-${side}`}
                              className={`${rowBg} cursor-pointer ${isFirst ? "border-t border-border" : "border-t border-border/30"}`}
                              onClick={() => setExpandedTicker(isExpanded ? null : tr.ticker)}
                              data-testid={`row-${tr.ticker}-${side}`}
                            >
                              <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border">
                                {isFirst ? tr.ticker : ""}
                              </td>
                              <td className="text-center px-2 py-1">
                                {best ? (
                                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${getSignalLabelClass(currentSig)}`}>
                                      {currentSig}
                                    </span>
                                    {currentROCFmt && (
                                      <span className={`text-[10px] font-bold tabular-nums ${(tr.currentROCByPeriod?.[best.cfg.config.period] ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                        {currentROCFmt}
                                      </span>
                                    )}
                                  </div>
                                ) : null}
                              </td>
                              <td className="text-center px-2 py-1">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${sideCls}`}>
                                  {sideLabel}
                                </span>
                              </td>
                              <td className="text-center px-2 py-1 text-muted-foreground">
                                {best ? best.cfg.configLabel : "–"}
                              </td>
                              <td className="text-center px-2 py-1 text-foreground">
                                {best ? best.cat.label : "–"}
                              </td>
                              <td className="text-center px-2 py-1 text-muted-foreground tabular-nums">
                                {summary ? summary.count : "–"}
                              </td>
                              {horizonsFiltered.map((h: any) => {
                                const hitVal = summary
                                  ? returnMode === "band"
                                    ? summary.bandHitRate?.[h.label] ?? summary.hitRate[h.label]
                                    : summary.hitRate[h.label]
                                  : 0;
                                return (
                                  <td key={h.label} className={`text-center px-2 py-1 ${summary ? hitRateColor(hitVal) : ""}`}>
                                    {summary ? pctSigned(hitVal) : "–"}
                                  </td>
                                );
                              })}
                              {horizonsFiltered.map((h: any) => (
                                <td key={`avg-${h.label}`} className={`text-center px-2 py-1 ${summary ? (summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400") : ""}`}>
                                  {summary ? pctSigned(summary.avgReturn[h.label]) : "–"}
                                </td>
                              ))}
                              {horizonsFiltered.map((h: any) => (
                                <td key={`pf-${h.label}`} className={`text-center px-2 py-1 ${summary ? profitFactorColor(summary.profitFactor[h.label]) : ""}`}>
                                  {summary
                                    ? summary.profitFactor[h.label] >= 99
                                      ? "∞"
                                      : summary.profitFactor[h.label].toFixed(2)
                                    : "–"}
                                </td>
                              ))}
                              <td className="text-center px-2 py-1">
                                {best ? (
                                  <span
                                    className="inline-block px-1.5 py-0.5 rounded font-bold"
                                    style={{
                                      backgroundColor: (() => {
                                        // scoreBackground color computed inline
                                        const s = score;
                                        if (s >= 80) return "rgba(34,197,94,0.3)";
                                        if (s >= 60) return "rgba(132,204,22,0.25)";
                                        if (s >= 40) return "rgba(234,179,8,0.25)";
                                        if (s >= 20) return "rgba(249,115,22,0.25)";
                                        return "rgba(239,68,68,0.25)";
                                      })(),
                                      color: scoreTextColor(score),
                                    }}
                                  >
                                    {score.toFixed(0)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/40">–</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Expanded ticker detail */}
                {expandedTicker &&
                  (() => {
                    const tickerData = resultsWithBest.find((t) => t.ticker === expandedTicker);
                    if (!tickerData) return null;
                    const sortedConfigs = [...tickerData.configs].sort(
                      (a, b) => b.bestScore - a.bestScore
                    );
                    return (
                      <div className="border border-border rounded p-3 bg-card/50 mb-4">
                        <h4 className="text-xs font-bold text-foreground mb-1">
                          {tickerData.ticker} — {tickerData.name}
                        </h4>
                        <p className="text-[9px] text-muted-foreground mb-3">
                          {sortedConfigs.length} configurations tested — showing top results
                        </p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {sortedConfigs.slice(0, 6).map((cfg, cfgIdx) => {
                            const bestCatForCfg = cfg.categories.reduce(
                              (best, cur) => (best.composite.score > cur.composite.score ? best : cur),
                              cfg.categories[0]
                            );
                            return (
                              <div key={cfgIdx} className="border border-border/50 rounded p-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-mono font-bold text-foreground">
                                    {cfg.configLabel}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground">
                                    → {bestCatForCfg.label}
                                  </span>
                                  <span
                                    className="ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-bold"
                                    style={{
                                      backgroundColor: (() => {
                                        const s = cfg.bestScore;
                                        if (s >= 80) return "rgba(34,197,94,0.3)";
                                        if (s >= 60) return "rgba(132,204,22,0.25)";
                                        if (s >= 40) return "rgba(234,179,8,0.25)";
                                        if (s >= 20) return "rgba(249,115,22,0.25)";
                                        return "rgba(239,68,68,0.25)";
                                      })(),
                                      color: scoreTextColor(cfg.bestScore),
                                    }}
                                  >
                                    {cfg.bestScore}
                                  </span>
                                </div>
                                {cfg.categories
                                  .filter((cat) => cat.summary.count > 0)
                                  .map((cat) => {
                                    const expandKey = `${tickerData.ticker}:${cfg.configLabel}:${cat.category}`;
                                    const isExpSig = expandedSignalsSet.has(expandKey);
                                    const signalKey = `${tickerData.ticker}::${cfg.configLabel}::${cat.category}`;
                                    const isExpHitCond = expandedSignals.has(signalKey);
                                    const catDates = cat.signalDates ?? [];
                                    const shown = catDates.slice(-50).reverse();
                                    const extra = catDates.length > 50 ? catDates.length - 50 : 0;
                                    const hasHitCond =
                                      !!(cat.profiles && cat.profiles.length >= 10 && tickerData.priceContext);
                                    const direction =
                                      SIGNAL_META[cat.category]?.direction === "sell" ? "sell" : "buy";
                                    return (
                                      <div key={cat.category} className="mt-1">
                                        <div className="flex items-center gap-1 mb-0.5">
                                          <span
                                            className={`text-[9px] font-bold ${getSignalLabelClass(cat.label)
                                              .split(" ")
                                              .filter((c) => c.startsWith("text-"))
                                              .join(" ")}`}
                                          >
                                            {cat.label}
                                          </span>
                                          <span className="text-[8px] text-muted-foreground">
                                            {cat.summary.count} signals
                                          </span>
                                          <button
                                            className="text-[8px] font-mono px-1 py-0 rounded border border-border bg-background text-muted-foreground hover:text-foreground ml-1"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedSignalsSet((prev) => {
                                                const next = new Set(prev);
                                                next.has(expandKey)
                                                  ? next.delete(expandKey)
                                                  : next.add(expandKey);
                                                return next;
                                              });
                                            }}
                                          >
                                            Signals ({catDates.length}) {isExpSig ? "▾" : "▸"}
                                          </button>
                                          {hasHitCond ? (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleExpandedSignal(signalKey);
                                              }}
                                              className={`ml-auto px-1.5 py-0.5 rounded text-[8px] font-bold border ${
                                                isExpHitCond
                                                  ? "bg-violet-500/25 text-violet-200 border-violet-400/40"
                                                  : "bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"
                                              }`}
                                              title="Profile what other indicators looked like at hit-bars vs miss-bars"
                                            >
                                              {isExpHitCond ? "▾" : "▸"} Hit Conditions
                                            </button>
                                          ) : null}
                                        </div>
                                        {/* Summary stats table */}
                                        <table className="w-full text-[9px] font-mono">
                                          <thead>
                                            <tr className="text-muted-foreground">
                                              <th className="text-left px-1 py-0.5">Hz</th>
                                              <th className="text-center px-1 py-0.5">Hit</th>
                                              <th className="text-center px-1 py-0.5">Win</th>
                                              <th className="text-center px-1 py-0.5">Avg</th>
                                              <th className="text-center px-1 py-0.5">Med</th>
                                              <th className="text-center px-1 py-0.5">Peak</th>
                                              <th className="text-center px-1 py-0.5">Trough</th>
                                              <th className="text-center px-1 py-0.5">PF</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {FORWARD_HORIZONS.map((h: any) => (
                                              <tr key={h.label}>
                                                <td className="px-1 py-0.5 text-foreground font-bold">{h.label}</td>
                                                <td className={`text-center px-1 py-0.5 ${hitRateColor(cat.summary.hitRate[h.label])}`}>
                                                  {pctSigned(cat.summary.hitRate[h.label])}
                                                </td>
                                                <td className={`text-center px-1 py-0.5 ${hitRateColor(cat.summary.winRate[h.label])}`}>
                                                  {pctSigned(cat.summary.winRate[h.label])}
                                                </td>
                                                <td className={`text-center px-1 py-0.5 ${cat.summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                  {pctSigned(cat.summary.avgReturn[h.label])}
                                                </td>
                                                <td className={`text-center px-1 py-0.5 ${cat.summary.medianReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                  {pctSigned(cat.summary.medianReturn[h.label])}
                                                </td>
                                                <td className="text-center px-1 py-0.5 text-green-400">
                                                  {pctSigned(cat.summary.avgPeak[h.label])}
                                                </td>
                                                <td className="text-center px-1 py-0.5 text-red-400">
                                                  {pctSigned(cat.summary.avgTrough[h.label])}
                                                </td>
                                                <td className={`text-center px-1 py-0.5 ${profitFactorColor(cat.summary.profitFactor[h.label])}`}>
                                                  {cat.summary.profitFactor[h.label] >= 99
                                                    ? "∞"
                                                    : cat.summary.profitFactor[h.label].toFixed(2)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {/* Signal dates table */}
                                        {isExpSig && (
                                          <div className="mt-1 border border-border/40 rounded overflow-hidden">
                                            {extra > 0 && (
                                              <div className="px-2 py-0.5 text-[8px] font-mono text-muted-foreground bg-card/50">
                                                + {extra} older signals not shown
                                              </div>
                                            )}
                                            <table className="w-full text-[9px] font-mono">
                                              <thead className="bg-card">
                                                <tr className="text-muted-foreground">
                                                  <th className="text-left px-2 py-0.5">Date</th>
                                                  <th className="text-right px-2 py-0.5">1M</th>
                                                  <th className="text-right px-2 py-0.5">3M</th>
                                                  <th className="text-right px-2 py-0.5">6M</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {shown.map((sd: any, sdIdx: number) => (
                                                  <tr key={sdIdx} className="border-t border-border/20">
                                                    <td className="px-2 py-0.5 text-foreground">{sd.date}</td>
                                                    <td className={`px-2 py-0.5 text-right ${sd.ret1m !== null ? sd.ret1m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                      {sd.ret1m !== null ? pctSigned(sd.ret1m) : "—"}
                                                    </td>
                                                    <td className={`px-2 py-0.5 text-right ${sd.ret3m !== null ? sd.ret3m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                      {sd.ret3m !== null ? pctSigned(sd.ret3m) : "—"}
                                                    </td>
                                                    <td className={`px-2 py-0.5 text-right ${sd.ret6m !== null ? sd.ret6m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                      {sd.ret6m !== null ? pctSigned(sd.ret6m) : "—"}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                        {/* Hit conditions evaluator */}
                                        {isExpHitCond && tickerData.priceContext && cat.profiles ? (
                                          <div className="mt-2">
                                            <EvaluatorPanelLoader
                                              ticker={
                                                tickerData.priceContext.mode === "pair" && tickerData.priceContext.pairLegA
                                                  ? tickerData.priceContext.pairLegA
                                                  : tickerData.ticker
                                              }
                                              priceContext={tickerData.priceContext}
                                              signals={cat.profiles}
                                              direction={direction}
                                              title={`${cfg.configLabel} — ${cat.label}`}
                                              useBand={returnMode === "band"}
                                            />
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
              </div>
            )}

            {/* Loading state when optimize running */}
            {running && filteredSortedResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">
                  Running… {progress.current} / {progress.total}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
