// Reconstructed from recovered-bundle/SlowStochOptimizer-BINIVNO0.js on 2026-06-11
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
  getScoreWeights,
  pickBestByRankMode,
  scoreTextColor,
  scoreBackgroundColor,
  hitRateColor,
  profitFactorColor,
  pctSigned,
  FORWARD_HORIZONS,
  RETURN_BAND_PRESETS,
  RANK_BY_OPTIONS,
  DATE_PRESETS,
  createDateRangeFromPreset,
} from "@/lib/forwardReturns";
import type { ForwardReturnProfile, SignalSummary, CompositeScore } from "@/lib/forwardReturns";
import { TARGET_RETURN_OPTIONS } from "@/lib/optimizerConstants";
import { filterByDateRange, resampleWeekly, createDateRange, defaultInputSelection, isBasketTicker } from "@/lib/optimizerInputSeries";
import { getTickers, getDates, getTickerRaw, refreshTickerData } from "@/lib/dataService";
import type { TickerMeta } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/useBaskets";
import { buildBasketOhlc, getBasketOhlc } from "@/lib/basketOhlc";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { B as BasketTickerPill } from "@/components/BasketTickerPill";
import { B as BasketPicker } from "@/components/BasketPicker";
import { P as PresetBar } from "@/components/PresetBar";
import { e as evaluateSignals, E as EvaluatorResultPanel, H as HitConditionsPanel } from "@/components/EvaluatorPanel";
import { InputSeriesPicker } from "@/components/InputSeriesPicker";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as React from "react";
import "@/lib/harsi";
import "@/lib/tva";

// ── Types ──

type SignalKind = "kd_cross" | "k_threshold" | "kd_cross_in_zone";
type GridSize = "quick" | "standard" | "deep";
type ReturnMode = "threshold" | "band";

interface StochParams {
  kLength: number;
  smoothK: number;
  smoothD: number;
  obThreshold: number;
  osThreshold: number;
}

interface CategoryResult {
  category: "buy" | "sell";
  label: string;
  description: string;
  summary: SignalSummary;
  composite: CompositeScore;
  profiles?: ForwardReturnProfile[];
}

interface StochConfigResult {
  configLabel: string;
  configKey: string;
  kind: SignalKind;
  params: StochParams;
  categories: CategoryResult[];
  bestCategory: "buy" | "sell";
  bestScore: number;
  totalSignals: number;
}

interface TickerStochResult {
  ticker: string;
  name?: string;
  kind: SignalKind;
  configs: StochConfigResult[];
  bestConfigLabel: string;
  bestCategory: "buy" | "sell";
  bestScore: number;
  currentSlowK: number | null;
  currentSlowD: number | null;
  currentSignal: string;
}

interface PriceContext {
  prices: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  dates: string[];
  globalIndices: number[];
  benchmarkPrices: null;
  mode: "single" | "pair";
  pairLegA?: string;
  pairLegB?: string;
}

interface SeriesData {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  priceDates: string[];
  globalIndices: number[];
}

// ── Signal kind labels / descriptions ──

const SIGNAL_KIND_LABELS: Record<SignalKind, string> = {
  kd_cross: "K-D Cross",
  k_threshold: "K OB/OS Cross",
  kd_cross_in_zone: "K-D Cross in Zone",
};

const SIGNAL_KIND_DESCRIPTIONS: Record<SignalKind, string> = {
  kd_cross: "Long when Slow %K crosses above %D. Short when Slow %K crosses below %D.",
  k_threshold: "Long when %K crosses up through OS threshold (exits oversold). Short when %K crosses down through OB threshold (exits overbought).",
  kd_cross_in_zone: "Long when %K crosses above %D while both are below the OS threshold. Short when %K crosses below %D while both are above the OB threshold. Most discriminating mode.",
};

const SIGNAL_KIND_CATEGORY_META = {
  buy: { label: "Buy Signal", description: "Long-side signal — entry into long position" },
  sell: { label: "Sell Signal", description: "Short-side signal — entry into short position" },
};

const ALL_SIGNAL_KINDS: SignalKind[] = ["kd_cross", "k_threshold", "kd_cross_in_zone"];
const ALL_GRID_SIZES: GridSize[] = ["quick", "standard", "deep"];
const GRID_SIZE_LABELS: Record<GridSize, string> = { quick: "Quick", standard: "Standard", deep: "Deep" };

// ── Grid configurations ──

interface StochGrid {
  kLength: number[];
  smoothK: number[];
  smoothD: number[];
  obThresholds: number[];
  osThresholds: number[];
}

const STOCH_GRIDS: Record<GridSize, StochGrid> = {
  quick: { kLength: [14], smoothK: [3], smoothD: [3], obThresholds: [80], osThresholds: [20] },
  standard: { kLength: [9, 14, 21], smoothK: [3], smoothD: [3, 5], obThresholds: [75, 80, 85], osThresholds: [15, 20, 25] },
  deep: { kLength: [5, 9, 14, 21, 28], smoothK: [1, 3, 5], smoothD: [3, 5, 9], obThresholds: [70, 75, 80, 85], osThresholds: [15, 20, 25, 30] },
};

function countCombos(grid: StochGrid, kind: SignalKind): number {
  const i = grid.kLength.length, k = grid.smoothK.length, p = grid.smoothD.length;
  const o = grid.obThresholds.length, a = grid.osThresholds.length;
  switch (kind) {
    case "kd_cross": return i * k * p;
    case "k_threshold": return i * k * o * a;
    case "kd_cross_in_zone": return i * k * p * o * a;
    default: return 0;
  }
}

// ── Stochastic calculation ──

function computeSlowStoch(
  closes: number[],
  highs: number[],
  lows: number[],
  kLength: number,
  smoothK: number,
  smoothD: number
): { slowK: (number | null)[]; slowD: (number | null)[] } {
  const n = closes.length;
  const rawK: (number | null)[] = new Array(n).fill(null);
  for (let i = kLength - 1; i < n; i++) {
    let lo = lows[i], hi = highs[i];
    for (let j = i - kLength + 1; j <= i; j++) {
      if (lows[j] < lo) lo = lows[j];
      if (highs[j] > hi) hi = highs[j];
    }
    const range = hi - lo;
    rawK[i] = range === 0 ? null : (100 * (closes[i] - lo)) / range;
  }
  const slowK: (number | null)[] = new Array(n).fill(null);
  for (let i = smoothK - 1; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - smoothK + 1; j <= i; j++) {
      if (rawK[j] !== null) { sum += rawK[j] as number; cnt++; }
    }
    if (cnt === smoothK) slowK[i] = sum / smoothK;
  }
  const slowD: (number | null)[] = new Array(n).fill(null);
  for (let i = smoothD - 1; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - smoothD + 1; j <= i; j++) {
      if (slowK[j] !== null) { sum += slowK[j] as number; cnt++; }
    }
    if (cnt === smoothD) slowD[i] = sum / smoothD;
  }
  return { slowK, slowD };
}

// ── Signal generators ──

interface SignalEvent { index: number; direction: "buy" | "sell" }

function kdCrossSignals(slowK: (number | null)[], slowD: (number | null)[], warmup: number): SignalEvent[] {
  const signals: SignalEvent[] = [];
  for (let i = Math.max(1, warmup); i < slowK.length; i++) {
    const k = slowK[i], kp = slowK[i - 1], d = slowD[i], dp = slowD[i - 1];
    if (k === null || kp === null || d === null || dp === null) continue;
    if (kp <= dp && k > d) signals.push({ index: i, direction: "buy" });
    else if (kp >= dp && k < d) signals.push({ index: i, direction: "sell" });
  }
  return signals;
}

function kThresholdSignals(slowK: (number | null)[], obThr: number, osThr: number, warmup: number): SignalEvent[] {
  const signals: SignalEvent[] = [];
  for (let i = Math.max(1, warmup); i < slowK.length; i++) {
    const k = slowK[i], kp = slowK[i - 1];
    if (k === null || kp === null) continue;
    if (kp <= osThr && k > osThr) signals.push({ index: i, direction: "buy" });
    else if (kp >= obThr && k < obThr) signals.push({ index: i, direction: "sell" });
  }
  return signals;
}

function kdCrossInZoneSignals(slowK: (number | null)[], slowD: (number | null)[], obThr: number, osThr: number, warmup: number): SignalEvent[] {
  const signals: SignalEvent[] = [];
  for (let i = Math.max(1, warmup); i < slowK.length; i++) {
    const k = slowK[i], kp = slowK[i - 1], d = slowD[i], dp = slowD[i - 1];
    if (k === null || kp === null || d === null || dp === null) continue;
    const crossUp = kp <= dp && k > d;
    const crossDown = kp >= dp && k < d;
    if (crossUp && k < osThr && d < osThr) signals.push({ index: i, direction: "buy" });
    else if (crossDown && k > obThr && d > obThr) signals.push({ index: i, direction: "sell" });
  }
  return signals;
}

// ── Optimizer core ──

interface OptimizerOptions {
  kind: SignalKind;
  grid: StochGrid;
  targetReturn: number;
  returnMode: ReturnMode;
  bandMin: number;
  bandMax: number;
  minHold: number;
}

function runStochOptimizer(
  ticker: string,
  name: string,
  closes: number[],
  highs: number[],
  lows: number[],
  opts: OptimizerOptions,
  onProgress?: (done: number, total: number) => void
): TickerStochResult | null {
  const grid = opts.grid;
  const totalCombos = countCombos(grid, opts.kind);
  if (totalCombos === 0) return null;

  const stochCache = new Map<string, { slowK: (number | null)[]; slowD: (number | null)[] }>();
  const getStoch = (kLen: number, sk: number, sd: number) => {
    const key = `${kLen}_${sk}_${sd}`;
    let v = stochCache.get(key);
    if (!v) { v = computeSlowStoch(closes, highs, lows, kLen, sk, sd); stochCache.set(key, v); }
    return v;
  };

  const bandOpts = opts.returnMode === "band" ? { minReturn: opts.bandMin, maxReturn: opts.bandMax } : null;
  const isBand = opts.returnMode === "band";
  const results: StochConfigResult[] = [];
  let done = 0;
  const progressInterval = Math.max(10, Math.floor(totalCombos / 20));

  const maxKLen = Math.max(...grid.kLength);
  const maxSK = Math.max(...grid.smoothK);
  const maxSD = Math.max(...grid.smoothD);
  const warmup = maxKLen + maxSK + maxSD + 20;

  const processSignals = (
    signals: SignalEvent[],
    configLabel: string,
    configKey: string,
    kind: SignalKind,
    params: StochParams
  ) => {
    const buyProfiles: ForwardReturnProfile[] = [];
    const sellProfiles: ForwardReturnProfile[] = [];
    let lastIdx = -1;
    for (const sig of signals) {
      if (opts.minHold > 0 && sig.index < lastIdx) continue;
      const profile = (computeForwardProfile as any)(closes, sig.index, opts.targetReturn, sig.direction, bandOpts, opts.minHold);
      if (sig.direction === "buy") buyProfiles.push(profile);
      else sellProfiles.push(profile);
      if (opts.minHold > 0) lastIdx = sig.index + opts.minHold;
    }
    const buySummary = summarizeSignals(buyProfiles, "buy");
    const sellSummary = summarizeSignals(sellProfiles, "sell");
    const buyComposite = computeCompositeScore(buySummary, "buy", isBand);
    const sellComposite = computeCompositeScore(sellSummary, "sell", isBand);
    const categories: CategoryResult[] = [
      { category: "buy", label: SIGNAL_KIND_CATEGORY_META.buy.label, description: SIGNAL_KIND_CATEGORY_META.buy.description, summary: buySummary, composite: buyComposite, profiles: buyProfiles },
      { category: "sell", label: SIGNAL_KIND_CATEGORY_META.sell.label, description: SIGNAL_KIND_CATEGORY_META.sell.description, summary: sellSummary, composite: sellComposite, profiles: sellProfiles },
    ];
    const bestCat = categories.reduce((a, b) => a.composite.score > b.composite.score ? a : b, categories[0]);
    results.push({ configLabel, configKey, kind, params, categories, bestCategory: bestCat.category, bestScore: bestCat.composite.score, totalSignals: signals.length });
  };

  if (opts.kind === "kd_cross") {
    for (const kLen of grid.kLength)
      for (const sk of grid.smoothK)
        for (const sd of grid.smoothD) {
          const { slowK, slowD } = getStoch(kLen, sk, sd);
          const signals = kdCrossSignals(slowK, slowD, warmup);
          processSignals(signals, `K-D Cross(${kLen},${sk},${sd})`, `kd_${kLen}_${sk}_${sd}`, "kd_cross", { kLength: kLen, smoothK: sk, smoothD: sd, obThreshold: 80, osThreshold: 20 });
          done++; if (done % progressInterval === 0 && onProgress) onProgress(done, totalCombos);
        }
  } else if (opts.kind === "k_threshold") {
    for (const kLen of grid.kLength)
      for (const sk of grid.smoothK) {
        const sd = grid.smoothD[0];
        const { slowK } = getStoch(kLen, sk, sd);
        for (const ob of grid.obThresholds)
          for (const os of grid.osThresholds) {
            const signals = kThresholdSignals(slowK, ob, os, warmup);
            processSignals(signals, `K Thr(${kLen},${sk}) OB${ob}/OS${os}`, `kthr_${kLen}_${sk}_${ob}_${os}`, "k_threshold", { kLength: kLen, smoothK: sk, smoothD: sd, obThreshold: ob, osThreshold: os });
            done++; if (done % progressInterval === 0 && onProgress) onProgress(done, totalCombos);
          }
      }
  } else if (opts.kind === "kd_cross_in_zone") {
    for (const kLen of grid.kLength)
      for (const sk of grid.smoothK)
        for (const sd of grid.smoothD) {
          const { slowK, slowD } = getStoch(kLen, sk, sd);
          for (const ob of grid.obThresholds)
            for (const os of grid.osThresholds) {
              const signals = kdCrossInZoneSignals(slowK, slowD, ob, os, warmup);
              processSignals(signals, `KD Zone(${kLen},${sk},${sd}) OB${ob}/OS${os}`, `kdzone_${kLen}_${sk}_${sd}_${ob}_${os}`, "kd_cross_in_zone", { kLength: kLen, smoothK: sk, smoothD: sd, obThreshold: ob, osThreshold: os });
              done++; if (done % progressInterval === 0 && onProgress) onProgress(done, totalCombos);
            }
        }
  }

  if (onProgress) onProgress(done, totalCombos);
  if (results.length === 0) return null;

  // Keep profiles only for top-8
  const TOP_K = 8;
  const sorted = [...results].sort((a, b) => b.bestScore - a.bestScore);
  const topKeys = new Set(sorted.slice(0, TOP_K).map(r => r.configKey));
  for (const r of results) {
    if (!topKeys.has(r.configKey)) {
      for (const cat of r.categories) cat.profiles = undefined;
    }
  }

  const best = results.reduce((a, b) => a.bestScore > b.bestScore ? a : b);
  const { slowK: bestSlowK, slowD: bestSlowD } = getStoch(best.params.kLength, best.params.smoothK, best.params.smoothD);
  const lastIdx = closes.length - 1;
  const curK = bestSlowK[lastIdx] != null ? Math.round((bestSlowK[lastIdx] as number) * 100) / 100 : null;
  const curD = bestSlowD[lastIdx] != null ? Math.round((bestSlowD[lastIdx] as number) * 100) / 100 : null;
  const ob = best.params.obThreshold, os = best.params.osThreshold;

  let currentSignal = "—";
  if (opts.kind === "kd_cross" && curK !== null && curD !== null) {
    const prevK = lastIdx > 0 ? bestSlowK[lastIdx - 1] : null;
    const prevD = lastIdx > 0 ? bestSlowD[lastIdx - 1] : null;
    if (prevK !== null && prevD !== null) {
      if (prevK <= (prevD ?? 0) && curK > curD) currentSignal = "→ Buy (K↑D)";
      else if (prevK >= (prevD ?? 0) && curK < curD) currentSignal = "→ Sell (K↓D)";
      else currentSignal = curK > curD ? "K above D" : "K below D";
    }
  } else if (opts.kind === "k_threshold" && curK !== null) {
    const prevK = lastIdx > 0 ? bestSlowK[lastIdx - 1] : null;
    if (prevK !== null) {
      if (prevK <= os && curK > os) currentSignal = "→ Buy (K↑OS)";
      else if (prevK >= ob && curK < ob) currentSignal = "→ Sell (K↓OB)";
      else if (curK < os) currentSignal = "In OS zone";
      else if (curK > ob) currentSignal = "In OB zone";
      else currentSignal = "Neutral";
    }
  } else if (opts.kind === "kd_cross_in_zone" && curK !== null && curD !== null) {
    const prevK = lastIdx > 0 ? bestSlowK[lastIdx - 1] : null;
    const prevD = lastIdx > 0 ? bestSlowD[lastIdx - 1] : null;
    if (prevK !== null && prevD !== null) {
      const crossUp = prevK <= prevD && curK > curD;
      const crossDown = prevK >= prevD && curK < curD;
      if (crossUp && curK < os && curD < os) currentSignal = "→ Buy (K↑D in OS)";
      else if (crossDown && curK > ob && curD > ob) currentSignal = "→ Sell (K↓D in OB)";
      else if (curK < os && curD < os) currentSignal = "OS zone";
      else if (curK > ob && curD > ob) currentSignal = "OB zone";
      else currentSignal = curK > curD ? "K above D" : "K below D";
    }
  }

  return {
    ticker,
    name,
    kind: opts.kind,
    configs: results,
    bestConfigLabel: best.configLabel,
    bestCategory: best.bestCategory,
    bestScore: best.bestScore,
    currentSlowK: curK,
    currentSlowD: curD,
    currentSignal,
  };
}

// ── Data fetchers ──

async function fetchTickerSeries(
  ticker: string,
  frequency: string,
  globalDates: string[],
  dateRange: any
): Promise<SeriesData | null> {
  try {
    const raw = await getTickerRaw(ticker);
    const filtered = filterByDateRange(raw, dateRange ?? null);
    const n = filtered.adjCloses.length;
    const adjFactor = filtered.closes.map((c: number, i: number) => {
      const adj = filtered.adjCloses[i];
      return c > 0 && Number.isFinite(c) && Number.isFinite(adj) ? adj / c : 1;
    });
    const highs = filtered.highs.map((h: number, i: number) => h * adjFactor[i]);
    const lows = filtered.lows.map((l: number, i: number) => l * adjFactor[i]);
    const opens = filtered.opens.map((o: number, i: number) => o * adjFactor[i]);
    const dateMap = new Map<string, number>();
    for (let i = 0; i < globalDates.length; i++) dateMap.set(globalDates[i], i);
    const globalIndices = filtered.dates.map((d: string) => dateMap.get(d) ?? -1);

    const resampled: any = (resampleWeekly as any)({
      dates: filtered.dates, opens, highs, lows,
      closes: filtered.adjCloses, adjCloses: filtered.adjCloses, volumes: filtered.volumes
    }, frequency);
    const minLength = frequency === "weekly" ? 52 : 252;
    if (resampled.closes.length < minLength) return null;
    const resampledGlobalIndices = resampled.dailyIndexMap.map((idx: number) => idx >= 0 ? globalIndices[idx] ?? -1 : -1);
    return {
      closes: resampled.closes,
      highs: resampled.highs,
      lows: resampled.lows,
      volumes: resampled.volumes,
      priceDates: resampled.dates,
      globalIndices: resampledGlobalIndices,
    };
  } catch {
    return null;
  }
}

async function fetchPairSeries(
  tickerA: string,
  tickerB: string,
  globalDates: string[],
  dateRange: any
): Promise<SeriesData | null> {
  try {
    const ratio = await getYahooPairsRatio(tickerA, tickerB, globalDates);
    if (!ratio || ratio.indices.length < 252) return null;
    let prices = ratio.prices.slice();
    let dates = ratio.indices.map((i: number) => globalDates[i] || "");
    let indices = ratio.indices.slice();
    if (dateRange) {
      const { start, end } = dateRange;
      let lo = 0;
      while (lo < dates.length && dates[lo] < start) lo++;
      let hi = dates.length - 1;
      while (hi >= 0 && dates[hi] > end) hi--;
      if (lo > hi) return null;
      prices = prices.slice(lo, hi + 1);
      dates = dates.slice(lo, hi + 1);
      indices = indices.slice(lo, hi + 1);
    }
    return {
      closes: prices,
      highs: prices.slice(),
      lows: prices.slice(),
      volumes: [],
      priceDates: dates,
      globalIndices: indices,
    };
  } catch {
    return null;
  }
}

// ── Main component ──

export default function SlowStochOptimizer() {
  const [tickers, setTickers] = useState<TickerMeta[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<string>("single");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = useState("stocks");
  const { baskets } = useBaskets();
  const [signalKind, setSignalKind] = useState<SignalKind>("kd_cross_in_zone");
  const [gridSize, setGridSize] = useState<GridSize>("deep");
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState(() => (createDateRange as any)());
  const [returnMode, setReturnMode] = useState<ReturnMode>("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.03);
  const [bandMax, setBandMax] = useState(0.07);
  const [minHold, setMinHold] = useState(1);
  const [running, setRunning] = useState(false);
  const { frequency, setFrequency, frequencyUI } = useFrequency("slowstoch", "daily", running);
  const freqKey = frequency === "weekly" ? "weekly" : "daily";
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [runningConfig, setRunningConfig] = useState<{ ticker: string; done: number; total: number } | null>(null);
  const [inputSelection, setInputSelection] = usePersistedState("slow-stoch-input-selection", defaultInputSelection);
  const [results, setResults] = usePersistedState<TickerStochResult[]>("slowstoch:results", []);
  const [priceContextMap, setPriceContextMap] = useState<Map<string, PriceContext>>(new Map());
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [hitConditionsOpen, setHitConditionsOpen] = useState<Set<string>>(new Set());
  const toggleHitConditions = useCallback((key: string) => {
    setHitConditionsOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const [filterText, setFilterText] = useState("");
  const [runSort, setRunSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "score", dir: "desc" });
  const [rankBy, setRankBy] = useState("composite");
  const scoreWeights = useMemo(() => (getScoreWeights as any)(rankBy), [rankBy]);
  const [activeTab, setActiveTab] = useState<"optimize" | "evaluate">("optimize");
  const [evalSide, setEvalSide] = useState<"long" | "short">("long");
  const [evalResult, setEvalResult] = usePersistedState<any>("slowstoch:evalResult", null);
  const [evalPriceContext, setEvalPriceContext] = useState<PriceContext | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalSignalKind, setEvalSignalKind] = useState<SignalKind>("kd_cross_in_zone");
  const [evalKLength, setEvalKLength] = useState(14);
  const [evalSmoothK, setEvalSmoothK] = useState(3);
  const [evalSmoothD, setEvalSmoothD] = useState(3);
  const [evalOBThr, setEvalOBThr] = useState(80);
  const [evalOSThr, setEvalOSThr] = useState(20);
  const cancelRef = useRef(false);
  const tickerSetRef = useRef(false);
  const { universeTickers } = useUniverse();
  const filteredTickers = useMemo(
    () => (universeTickers ? tickers.filter(t => universeTickers.has(t.ticker)) : tickers),
    [tickers, universeTickers]
  );
  const classFilter = useOptimizerClassFilter(filteredTickers, mode === "universe", "slowstoch-clf");
  const pairComboPicker = usePairComboPicker(filteredTickers.map(t => t.ticker), mode === "pairCombo", "slowstoch-pc");

  useEffect(() => {
    getTickers().then(t => {
      setTickers(t);
      if (t.length > 0 && !tickerSetRef.current) setSelectedTicker(t[0].ticker);
      if (t.length > 0) {
        setPairTickerA(a => a || t[0].ticker);
        setPairTickerB(a => a || (t[1]?.ticker ?? t[0].ticker));
      }
    });
  }, []);

  useEffect(() => {
    if (mode !== "single" || !selectedTicker) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await getTickerRaw(selectedTicker);
        if (!cancelled) setFetchedAt((raw as any).fetchedAt ?? Date.now());
      } catch { if (!cancelled) setFetchedAt(null); }
    })();
    return () => { cancelled = true; };
  }, [mode, selectedTicker]);

  const handleRefresh = async () => {
    if (mode !== "single" || !selectedTicker) return;
    setRefreshing(true);
    try {
      const fresh = await refreshTickerData(selectedTicker);
      setFetchedAt((fresh as any).fetchedAt ?? Date.now());
    } finally { setRefreshing(false); }
  };

  const combosCount = useMemo(() => countCombos(STOCH_GRIDS[gridSize], signalKind), [gridSize, signalKind]);

  // ── Workspace state ──
  const serializeState = useCallback(() => ({
    selectedTicker, pairTickerA, pairTickerB, basketTickers, mode,
    frequency, signalKind, gridSize, returnMode, targetReturn, bandMin, bandMax,
    minHold, results, expandedTicker, runSort, pairCombo: pairComboPicker.serialize(),
    inputSelection, basketMode,
  }), [selectedTicker, pairTickerA, pairTickerB, basketTickers, mode, frequency, signalKind, gridSize, returnMode, targetReturn, bandMin, bandMax, minHold, results, expandedTicker, runSort, inputSelection, basketMode]);

  const hydrateState = useCallback((saved: any) => {
    if (!saved) return;
    if (saved.selectedTicker) { setSelectedTicker(saved.selectedTicker); tickerSetRef.current = true; }
    if (saved.mode === "single" || saved.mode === "universe" || saved.mode === "pair" || saved.mode === "pairCombo" || saved.mode === "basket") setMode(saved.mode);
    if (saved.pairCombo) pairComboPicker.hydrate(saved.pairCombo);
    if (saved.pairTickerA) setPairTickerA(saved.pairTickerA);
    if (saved.pairTickerB) setPairTickerB(saved.pairTickerB);
    if (Array.isArray(saved.basketTickers)) setBasketTickers(saved.basketTickers.filter((t: any) => typeof t === "string"));
    if (saved.frequency === "daily" || saved.frequency === "weekly" || saved.frequency === "weekly_on_daily") setFrequency(saved.frequency);
    else if ((saved.timeframe === "weekly" && saved.frequency === undefined) || (saved.barInterval === "weekly" && saved.frequency === undefined)) setFrequency("weekly");
    if (ALL_SIGNAL_KINDS.includes(saved.signalKind)) setSignalKind(saved.signalKind);
    if (ALL_GRID_SIZES.includes(saved.gridSize)) setGridSize(saved.gridSize);
    if (saved.returnMode === "threshold" || saved.returnMode === "band") setReturnMode(saved.returnMode);
    if (typeof saved.targetReturn === "number") setTargetReturn(saved.targetReturn);
    if (typeof saved.bandMin === "number") setBandMin(saved.bandMin);
    if (typeof saved.bandMax === "number") setBandMax(saved.bandMax);
    if (typeof saved.minHold === "number") setMinHold(saved.minHold);
    if (Array.isArray(saved.results)) setResults(saved.results);
    if (saved.expandedTicker !== undefined) setExpandedTicker(saved.expandedTicker);
    if (saved.runSort?.col && saved.runSort?.dir) setRunSort(saved.runSort);
    if (saved.inputSelection && typeof saved.inputSelection === "object") {
      const sel = saved.inputSelection;
      if (sel.kind === "close") setInputSelection({ kind: "close" as any });
      else if (sel.kind === "workbook" && typeof sel.metric === "string") setInputSelection({ kind: "workbook", metric: sel.metric });
    }
    if (saved.basketMode === "stocks" || saved.basketMode === "combined") setBasketMode(saved.basketMode);
  }, [pairComboPicker, setResults, setFrequency, setInputSelection]);

  useWorkspaceTab("slow-stoch-optimizer", serializeState, hydrateState);

  const captureInputs = useCallback(() => {
    const { selectedTicker: _st, results: _r, expandedTicker: _et, runSort: _rs, ...rest } = serializeState();
    return rest;
  }, [serializeState]);

  const applyInputs = useCallback((saved: any) => hydrateState(saved), [hydrateState]);

  // ── Run optimizer ──
  const handleRun = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setPriceContextMap(new Map());
    setHitConditionsOpen(new Set());
    setRunningConfig(null);
    cancelRef.current = false;

    let tickerList: Array<{ ticker: string; name?: string; pairA?: string; pairB?: string }>;
    if (mode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) { setRunning(false); return; }
      const label = `${pairTickerA}/${pairTickerB}`;
      tickerList = [{ ticker: label, name: label }];
    } else if (mode === "single") {
      const t = selectedTicker;
      if (!t) { setRunning(false); return; }
      const meta = filteredTickers.find(m => m.ticker === t);
      tickerList = meta ? [meta] : [{ ticker: t, name: t }];
    } else if (mode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) { setRunning(false); return; }
        const bkt = buildBasketOhlc(basketTickers, baskets);
        tickerList = [{ ticker: `BASKET:${bkt.name}`, name: `BASKET:${bkt.name}` }];
      } else {
        tickerList = basketTickers.map(t => filteredTickers.find(m => m.ticker.toUpperCase() === t.toUpperCase()) ?? { ticker: t, name: t });
      }
    } else if (mode === "pairCombo") {
      if (pairComboPicker.pairs.length === 0) { setRunning(false); return; }
      tickerList = pairComboPicker.pairs.map((p: any) => ({ ticker: p.label, name: p.label, pairA: p.a, pairB: p.b }));
    } else {
      tickerList = classFilter.filteredTickers;
    }
    if (tickerList.length === 0) { setRunning(false); return; }

    setProgress({ current: 0, total: tickerList.length });
    const basketObj = mode === "basket" && basketMode === "combined" ? buildBasketOhlc(basketTickers, baskets) : null;
    const opts: OptimizerOptions = { kind: signalKind, grid: STOCH_GRIDS[gridSize], targetReturn, returnMode, bandMin, bandMax, minHold };
    const out: TickerStochResult[] = [];
    const ctxMap = new Map<string, PriceContext>();
    let done = 0;
    const globalDates = await getDates();

    const tasks = tickerList.map(async item => {
      if (cancelRef.current) return;
      try {
        let series: SeriesData | null = null;
        if (basketObj && mode === "basket") {
          const ohlc = await getBasketOhlc(basketObj, dateRange);
          if (!ohlc || ohlc.closes.length < 252) return;
          const dmap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dmap.set(globalDates[i], i);
          series = {
            closes: ohlc.closes, highs: ohlc.highs, lows: ohlc.lows, volumes: ohlc.volumes,
            priceDates: ohlc.priceDates,
            globalIndices: ohlc.priceDates.map((d: string) => dmap.get(d) ?? -1),
          };
        } else if (frequency === "weekly_on_daily" && mode !== "pair" && mode !== "pairCombo") {
          const daily = await fetchTickerSeries(item.ticker, "daily", globalDates, dateRange);
          if (!daily) return;
          const wkCloses = weeklyDownsample(daily.closes as any, daily.priceDates as any) as any;
          const wkHighs = weeklyDownsample(daily.highs as any, daily.priceDates as any) as any;
          const wkLows = weeklyDownsample(daily.lows as any, daily.priceDates as any) as any;
          if ((wkCloses.prices ?? wkCloses)?.length < 52) return;
          const weekIdx = wkCloses.weekIndex ?? [];
          const volsWeekly = (() => {
            if (!daily.volumes) return [];
            const out: number[] = new Array(weekIdx.length);
            let prev = -1;
            for (let i = 0; i < weekIdx.length; i++) {
              const wi = weekIdx[i];
              let sum = 0;
              for (let j = prev + 1; j <= wi; j++) sum += daily.volumes[j] || 0;
              out[i] = sum; prev = wi;
            }
            return out;
          })();
          series = {
            closes: wkCloses.prices ?? wkCloses,
            highs: wkHighs.prices ?? wkHighs,
            lows: wkLows.prices ?? wkLows,
            volumes: volsWeekly,
            priceDates: weekIdx.map((i: number) => daily.priceDates[i] ?? ""),
            globalIndices: weekIdx.map((i: number) => daily.globalIndices[i] ?? -1),
          };
        } else if (mode === "pair") {
          series = await fetchPairSeries(pairTickerA, pairTickerB, globalDates, dateRange);
        } else if (mode === "pairCombo") {
          series = await fetchPairSeries(item.pairA ?? "", item.pairB ?? "", globalDates, dateRange);
        } else {
          series = await fetchTickerSeries(item.ticker, freqKey, globalDates, dateRange);
        }
        if (!series || cancelRef.current) return;

        const ctx: PriceContext = {
          prices: series.closes, highs: series.highs, lows: series.lows, volumes: series.volumes,
          dates: series.priceDates, globalIndices: series.globalIndices, benchmarkPrices: null,
          mode: mode === "pair" || mode === "pairCombo" ? "pair" : "single",
          pairLegA: mode === "pairCombo" ? item.pairA : mode === "pair" ? pairTickerA : undefined,
          pairLegB: mode === "pairCombo" ? item.pairB : mode === "pair" ? pairTickerB : undefined,
        };

        setRunningConfig({ ticker: item.ticker, done: 0, total: combosCount });
        const res = runStochOptimizer(item.ticker, item.name ?? item.ticker, series.closes, series.highs, series.lows, opts, (d, t) => {
          setRunningConfig({ ticker: item.ticker, done: d, total: t });
        });
        if (res) { out.push(res); ctxMap.set(res.ticker, ctx); }
      } catch {} finally {
        done++;
        setProgress({ current: done, total: tickerList.length });
        if (done % 3 === 0 || done === tickerList.length) {
          setResults([...out]);
          setPriceContextMap(new Map(ctxMap));
        }
      }
    });

    await Promise.all(tasks);
    setResults([...out]);
    setPriceContextMap(new Map(ctxMap));
    setRunningConfig(null);
    setRunning(false);
  }, [mode, frequency, selectedTicker, pairTickerA, pairTickerB, filteredTickers, signalKind, gridSize, returnMode, targetReturn, bandMin, bandMax, minHold, dateRange, basketTickers, basketMode, baskets, pairComboPicker.pairs, classFilter.filteredTickers, combosCount]);

  const handleCancel = () => { cancelRef.current = true; setRunning(false); setRunningConfig(null); };

  // ── Evaluate ──
  const handleEvaluate = useCallback(async () => {
    setEvaluating(true);
    setEvalResult(null);
    setEvalPriceContext(null);
    try {
      const globalDates = await getDates();
      if (mode === "pair" && (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB)) { setEvaluating(false); return; }
      const evalTickerStr = mode === "pair" ? "__PAIR__" : mode === "single" ? selectedTicker : mode === "basket" ? (basketTickers[0] ?? "") : filteredTickers[0]?.ticker ?? "";
      if (!evalTickerStr && mode !== "basket") { setEvaluating(false); return; }

      let series: SeriesData | null = null;
      if (mode === "pair") {
        series = await fetchPairSeries(pairTickerA, pairTickerB, globalDates, dateRange);
      } else if (mode === "basket") {
        if (basketTickers.length === 0) { setEvaluating(false); return; }
        if (basketMode === "combined") {
          const bkt = buildBasketOhlc(basketTickers, baskets);
          const ohlc = await getBasketOhlc(bkt, dateRange);
          if (!ohlc || ohlc.closes.length < 252) { setEvaluating(false); return; }
          const dmap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dmap.set(globalDates[i], i);
          series = {
            closes: ohlc.closes, highs: ohlc.highs, lows: ohlc.lows, volumes: ohlc.volumes,
            priceDates: ohlc.priceDates,
            globalIndices: ohlc.priceDates.map((d: string) => dmap.get(d) ?? -1),
          };
        } else {
          series = await fetchTickerSeries(basketTickers[0], freqKey, globalDates, dateRange);
        }
      } else {
        series = await fetchTickerSeries(evalTickerStr, freqKey, globalDates, dateRange);
      }
      if (!series) { setEvaluating(false); return; }

      const { closes, highs, lows, volumes, priceDates, globalIndices } = series;
      const { slowK, slowD } = computeSlowStoch(closes, highs, lows, evalKLength, evalSmoothK, evalSmoothD);
      const warmup = evalKLength + evalSmoothK + evalSmoothD + 20;
      const direction = evalSide === "long" ? "buy" : "sell";
      const signalIndices: number[] = [];
      if (evalSignalKind === "kd_cross") {
        const sigs = kdCrossSignals(slowK, slowD, warmup);
        for (const s of sigs) if (s.direction === direction) signalIndices.push(s.index);
      } else if (evalSignalKind === "k_threshold") {
        const sigs = kThresholdSignals(slowK, evalOBThr, evalOSThr, warmup);
        for (const s of sigs) if (s.direction === direction) signalIndices.push(s.index);
      } else if (evalSignalKind === "kd_cross_in_zone") {
        const sigs = kdCrossInZoneSignals(slowK, slowD, evalOBThr, evalOSThr, warmup);
        for (const s of sigs) if (s.direction === direction) signalIndices.push(s.index);
      }
      signalIndices.sort((a, b) => a - b);
      const evalResult = evaluateSignals(closes, priceDates, signalIndices, evalSide, targetReturn, minHold, null, "3M");
      setEvalResult(evalResult);
      setEvalPriceContext({
        prices: closes, highs, lows, volumes, dates: priceDates, globalIndices, benchmarkPrices: null,
        mode: mode === "pair" ? "pair" : "single",
        pairLegA: mode === "pair" ? pairTickerA : undefined,
        pairLegB: mode === "pair" ? pairTickerB : undefined,
      });
    } finally { setEvaluating(false); }
  }, [mode, freqKey, selectedTicker, pairTickerA, pairTickerB, filteredTickers, evalSignalKind, evalKLength, evalSmoothK, evalSmoothD, evalOBThr, evalOSThr, evalSide, targetReturn, minHold, dateRange, basketTickers, basketMode, baskets]);

  // ── Eval label ──
  const evalLabel = useMemo(() => {
    const kind = evalSignalKind;
    const lbl = SIGNAL_KIND_LABELS[kind];
    if (kind === "kd_cross") return `SlowStoch ${lbl} (${evalKLength},${evalSmoothK},${evalSmoothD}) [${evalSide}]`;
    if (kind === "k_threshold") return `SlowStoch ${lbl} (${evalKLength},${evalSmoothK}) OB${evalOBThr}/OS${evalOSThr} [${evalSide}]`;
    return `SlowStoch ${lbl} (${evalKLength},${evalSmoothK},${evalSmoothD}) OB${evalOBThr}/OS${evalOSThr} [${evalSide}]`;
  }, [evalSignalKind, evalKLength, evalSmoothK, evalSmoothD, evalOBThr, evalOSThr, evalSide]);

  const evalTickerLabel = useMemo(() => {
    if (mode === "pair") return `${pairTickerA || "A"}/${pairTickerB || "B"}`;
    if (mode === "single") return selectedTicker || "—";
    return filteredTickers[0]?.ticker || "—";
  }, [mode, pairTickerA, pairTickerB, selectedTicker, filteredTickers]);

  // ── Table helpers ──
  const enrichedResults = useMemo(() => results.map(r => {
    const pickBest = (cat: "buy" | "sell") => {
      let bestCfg: StochConfigResult | null = null;
      let bestSummary: SignalSummary | null = null;
      let bestComp: CompositeScore | null = null;
      let bestScore = -Infinity;
      for (const cfg of r.configs || []) {
        if (!cfg || !Array.isArray(cfg.categories)) continue;
        const catData = cfg.categories.find(c => c.category === cat);
        if (!catData || catData.summary.count === 0) continue;
        const score = pickBestByRankMode(catData.summary, catData.composite.score, cat, scoreWeights);
        if (score > bestScore) { bestScore = score; bestCfg = cfg; bestSummary = catData.summary; bestComp = catData.composite; }
      }
      return bestCfg && bestSummary && bestComp ? { cfg: bestCfg, summary: bestSummary, score: bestScore, comp: bestComp } : null;
    };
    return { tr: r, longBest: pickBest("buy"), shortBest: pickBest("sell") };
  }), [results, scoreWeights]);

  const filteredSortedResults = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    const filtered = query
      ? enrichedResults.filter(e => e.tr.ticker.toLowerCase().includes(query) || (e.tr.name && e.tr.name.toLowerCase().includes(query)))
      : [...enrichedResults];
    const { col, dir } = runSort;
    filtered.sort((a, b) => {
      const aScore = Math.max(a.longBest?.score ?? -1, a.shortBest?.score ?? -1);
      const bScore = Math.max(b.longBest?.score ?? -1, b.shortBest?.score ?? -1);
      let d = 0;
      if (col === "ticker") d = a.tr.ticker.localeCompare(b.tr.ticker);
      else if (col === "currentSignal") d = a.tr.currentSignal.localeCompare(b.tr.currentSignal);
      else d = aScore - bScore;
      return dir === "asc" ? d : -d;
    });
    return filtered;
  }, [enrichedResults, runSort, filterText]);

  const handleSort = (col: string) => {
    setRunSort(prev => prev.col === col ? { col, dir: prev.dir === "desc" ? "asc" : "desc" } : { col, dir: col === "ticker" ? "asc" : "desc" });
  };

  const handleExportCSV = () => {
    const horizons = FORWARD_HORIZONS;
    const cols = ["ticker", "name", "side", "currentSignal", "currentSlowK", "currentSlowD", "kind", "bestConfig", "score", "signals"];
    for (const h of horizons) cols.push(`hit_${h.label}`, `avg_${h.label}`, `pf_${h.label}`);
    const rows = [cols.join(",")];
    for (const e of filteredSortedResults) {
      for (const side of ["long", "short"]) {
        const best = side === "long" ? e.longBest : e.shortBest;
        if (!best) continue;
        const row: any[] = [e.tr.ticker, e.tr.name ?? "", side, e.tr.currentSignal, e.tr.currentSlowK, e.tr.currentSlowD, best.cfg.kind, best.cfg.configLabel, best.score, best.summary.count];
        for (const h of horizons) {
          const hitRate = returnMode === "band" ? (best.summary.bandHitRate?.[h.label] ?? best.summary.hitRate[h.label]) : best.summary.hitRate[h.label];
          row.push((hitRate * 100).toFixed(1) + "%", (best.summary.avgReturn[h.label] * 100).toFixed(2) + "%", best.summary.profitFactor[h.label].toFixed(2));
        }
        const escaped = row.map(v => {
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
        });
        rows.push(escaped.join(","));
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `slowstoch-opt-${signalKind}-${gridSize}-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const horizons = FORWARD_HORIZONS;
  const isBand = returnMode === "band";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">Slow Stochastic Optimizer</h2>
        <div className="flex gap-px">
          <button
            data-testid="slowstoch-view-optimize"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${activeTab === "optimize" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setActiveTab("optimize")}
          >Optimize</button>
          <button
            data-testid="slowstoch-view-evaluate"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${activeTab === "evaluate" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setActiveTab("evaluate")}
          >Evaluate</button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {activeTab === "optimize" ? "Search parameter space by hit rate" : "Score one specific setup"}
        </span>
        <div className="flex items-center gap-1">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
          <div className="flex items-center gap-0.5">
            {DATE_PRESETS.map((p: any) => (
              <button
                key={p.value}
                data-testid={`slowstoch-date-preset-${p.value}`}
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === p.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}
                onClick={() => { setDatePreset(p.value); setDateRange(createDateRangeFromPreset(p.value)); }}
              >{p.label}</button>
            ))}
          </div>
          <input
            type="date"
            data-testid="slowstoch-date-start"
            value={dateRange.start}
            onChange={e => { setDatePreset("custom"); setDateRange({ ...dateRange, start: e.target.value }); }}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
          />
          <span className="text-[10px] font-mono text-muted-foreground">→</span>
          <input
            type="date"
            data-testid="slowstoch-date-end"
            value={dateRange.end}
            onChange={e => { setDatePreset("custom"); setDateRange({ ...dateRange, end: e.target.value }); }}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <PresetBar kind="slowstoch" captureInputs={captureInputs} applyInputs={applyInputs} />
        </div>
      </div>

      {/* Evaluate tab */}
      {activeTab === "evaluate" ? (
        <>
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-start gap-4 flex-wrap">
              {/* Mode (single/pair) */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  <button className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === "single" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setMode("single")}>Single</button>
                  <button className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === "pair" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setMode("pair")}>Pair</button>
                </div>
              </div>
              {mode === "single" && (
                <div className="flex items-end gap-2">
                  <div className={isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                    <UnifiedTickerPicker tickers={filteredTickers} value={isBasketTicker(selectedTicker) ? "" : selectedTicker} onChange={setSelectedTicker} label="Ticker" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
                    <BasketTickerPill activeTicker={selectedTicker} onSelectTicker={setSelectedTicker} fallbackTicker={filteredTickers[0]?.ticker ?? null} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                    <InputSeriesPicker value={inputSelection} onChange={setInputSelection} family="slow_stoch" label="" />
                  </div>
                </div>
              )}
              {mode === "pair" && (
                <>
                  <UnifiedTickerPicker tickers={filteredTickers} value={pairTickerA} onChange={setPairTickerA} label="Ticker A" />
                  <UnifiedTickerPicker tickers={filteredTickers} value={pairTickerB} onChange={setPairTickerB} label="Ticker B" />
                </>
              )}
              {/* Side */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Side</label>
                <div className="flex gap-px">
                  <button className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSide === "long" ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setEvalSide("long")}>Long</button>
                  <button className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSide === "short" ? "bg-red-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setEvalSide("short")}>Short</button>
                </div>
              </div>
              {/* Signal Kind */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal Kind</label>
                <div className="flex gap-px">
                  {ALL_SIGNAL_KINDS.map(k => (
                    <button key={k} title={SIGNAL_KIND_DESCRIPTIONS[k]}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors whitespace-nowrap ${evalSignalKind === k ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setEvalSignalKind(k)}>{SIGNAL_KIND_LABELS[k]}</button>
                  ))}
                </div>
              </div>
              {/* K Length */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">K Length</label>
                <input type="number" min={2} max={50} value={evalKLength} onChange={e => setEvalKLength(parseInt(e.target.value) || 14)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>
              {/* Smooth K */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Smooth K</label>
                <input type="number" min={1} max={20} value={evalSmoothK} onChange={e => setEvalSmoothK(parseInt(e.target.value) || 3)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>
              {/* Smooth D (not for k_threshold) */}
              {evalSignalKind !== "k_threshold" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Smooth D</label>
                  <input type="number" min={1} max={20} value={evalSmoothD} onChange={e => setEvalSmoothD(parseInt(e.target.value) || 3)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                </div>
              )}
              {/* OB/OS (not for kd_cross) */}
              {evalSignalKind !== "kd_cross" && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">OB Thr</label>
                    <input type="number" min={50} max={99} value={evalOBThr} onChange={e => setEvalOBThr(parseInt(e.target.value) || 80)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">OS Thr</label>
                    <input type="number" min={1} max={49} value={evalOSThr} onChange={e => setEvalOSThr(parseInt(e.target.value) || 20)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                </>
              )}
              {/* Target % */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target %</label>
                <input type="number" step={0.5} min={0.5} value={+(targetReturn * 100).toFixed(4)} onChange={e => setTargetReturn((parseFloat(e.target.value) || 5) / 100)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]" />
              </div>
              {/* Hold */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Hold</label>
                <input type="number" min={0} value={minHold} onChange={e => setMinHold(parseInt(e.target.value) || 0)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                <button
                  data-testid="slowstoch-eval-run"
                  className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={handleEvaluate}
                  disabled={evaluating}
                >
                  {evaluating ? "Evaluating…" : "Evaluate"}
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <EvaluatorResultPanel result={evalResult} loading={evaluating} setupLabel={evalLabel} tickerLabel={evalTickerLabel} />
            {evalResult && evalPriceContext && evalResult.profiles?.length >= 10 ? (
              <HitConditionsPanel
                ticker={evalPriceContext.mode === "pair" ? (evalPriceContext.pairLegA || "") : (selectedTicker || filteredTickers[0]?.ticker || "")}
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
        // Optimize tab
        <div className="flex flex-col h-full bg-background text-foreground">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 px-4 py-1 border-b border-border flex-shrink-0">
            <span className="text-[11px] text-muted-foreground">Slow Stochastic · {SIGNAL_KIND_LABELS[signalKind]}</span>
            <PresetBar kind="slowstoch" captureInputs={captureInputs} applyInputs={applyInputs} />
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border bg-card/50 flex-shrink-0 text-xs">
            {/* Mode */}
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Mode:</span>
              <div className="flex rounded-md overflow-hidden border border-border">
                {(["single", "universe", "pair", "pairCombo", "basket"] as const).map(m => (
                  <button
                    key={m} onClick={() => setMode(m)} disabled={running}
                    data-testid={`slowstoch-mode-${m}`}
                    className={`px-2.5 py-1 text-xs ${mode === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}
                  >
                    {m === "single" ? "Single" : m === "universe" ? "Universe" : m === "pair" ? "Pair (A/B)" : m === "pairCombo" ? "Pair Combo" : "Basket"}
                  </button>
                ))}
              </div>
            </div>

            {mode === "pair" && (
              <div className="flex items-center gap-2">
                <UnifiedTickerPicker tickers={filteredTickers} value={pairTickerA} onChange={setPairTickerA} disabled={running} label="A" />
                <UnifiedTickerPicker tickers={filteredTickers} value={pairTickerB} onChange={setPairTickerB} disabled={running} label="B" />
                <span className="text-[10px] font-mono text-muted-foreground">Ratio: <span className="text-foreground font-bold">{pairTickerA || "A"}/{pairTickerB || "B"}</span></span>
              </div>
            )}

            {mode === "basket" && (
              <div className="flex flex-col gap-2">
                <BasketPicker tickers={filteredTickers} value={basketTickers} onChange={setBasketTickers} disabled={running} testIdPrefix="slowstoch-basket" />
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket Run Mode</label>
                  <div className="flex gap-px" data-testid="slowstoch-basket-mode">
                    {(["stocks", "combined"] as const).map(m => (
                      <button
                        key={m} data-testid={`slowstoch-basket-mode-${m}`}
                        className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${basketMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                        onClick={() => setBasketMode(m)} disabled={running}
                        title={m === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme"}
                      >{m === "stocks" ? "Stock by Stock" : "Combined"}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {mode === "pairCombo" && (
              <div className="flex flex-col gap-1 w-full">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Pair Combo — Leg Set</label>
                {pairComboPicker.ui}
              </div>
            )}

            {mode === "universe" && classFilter.classFilterUI && (
              <div className="flex flex-col gap-1 w-full">
                {classFilter.universeSourceUI}
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-muted-foreground whitespace-nowrap">Class Filter:</span>
                  <div className="flex-1">{classFilter.classFilterUI}</div>
                </div>
              </div>
            )}

            {mode === "single" && (
              <div className="flex items-center gap-1.5">
                <UnifiedTickerPicker value={selectedTicker} onChange={e => setSelectedTicker(e)} tickers={filteredTickers} label="Ticker" />
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                  <InputSeriesPicker value={inputSelection} onChange={setInputSelection} family="slow_stoch" label="" />
                </div>
                <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing || !selectedTicker} className="h-7 px-2 text-xs">
                  {refreshing ? "…" : "↻"}
                </Button>
                {fetchedAt && <span className="text-[10px] text-muted-foreground">{new Date(fetchedAt).toLocaleTimeString()}</span>}
              </div>
            )}

            {frequencyUI}

            {/* Signal */}
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Signal:</span>
              <div className="flex rounded-md overflow-hidden border border-border">
                {ALL_SIGNAL_KINDS.map(k => (
                  <button key={k} onClick={() => setSignalKind(k)} title={SIGNAL_KIND_DESCRIPTIONS[k]}
                    className={`px-2.5 py-1 text-xs whitespace-nowrap ${signalKind === k ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}
                  >{SIGNAL_KIND_LABELS[k]}</button>
                ))}
              </div>
            </div>

            {/* Grid */}
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Grid:</span>
              <div className="flex rounded-md overflow-hidden border border-border">
                {ALL_GRID_SIZES.map(g => (
                  <button key={g} onClick={() => setGridSize(g)}
                    className={`px-2.5 py-1 text-xs ${gridSize === g ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}
                  >{GRID_SIZE_LABELS[g]}</button>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground ml-1">~{combosCount.toLocaleString()} combos</span>
            </div>

            {/* Target */}
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Target:</span>
              <select value={returnMode} onChange={e => setReturnMode(e.target.value as ReturnMode)} className="h-7 rounded-md bg-card border border-border px-1.5 text-xs">
                <option value="threshold">Threshold</option>
                <option value="band">Band</option>
              </select>
              {returnMode === "threshold" ? (
                <select value={targetReturn} onChange={e => setTargetReturn(parseFloat(e.target.value))} className="h-7 rounded-md bg-card border border-border px-1.5 text-xs">
                  {TARGET_RETURN_OPTIONS.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <select value={`${bandMin}-${bandMax}`} onChange={e => {
                  const found = RETURN_BAND_PRESETS.find((p: any) => `${p.band.minReturn}-${p.band.maxReturn}` === e.target.value);
                  if (found) { setBandMin(found.band.minReturn); setBandMax(found.band.maxReturn); }
                }} className="h-7 rounded-md bg-card border border-border px-1.5 text-xs">
                  {RETURN_BAND_PRESETS.map((p: any) => <option key={p.label} value={`${p.band.minReturn}-${p.band.maxReturn}`}>{p.label}</option>)}
                </select>
              )}
            </div>

            {/* Min hold */}
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Min hold:</span>
              <input type="number" min={0} max={60} value={minHold} onChange={e => setMinHold(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))} className="h-7 w-12 rounded-md bg-card border border-border px-1.5 text-xs" />
              <span className="text-[10px] text-muted-foreground">d</span>
            </div>

            {/* Run/Cancel + CSV */}
            <div className="ml-auto flex items-center gap-2">
              {running ? (
                <Button onClick={handleCancel} size="sm" variant="destructive" className="h-7 px-3 text-xs">Cancel</Button>
              ) : (
                <Button
                  onClick={handleRun} size="sm"
                  disabled={mode === "single" ? !selectedTicker : mode === "pair" ? !pairTickerA || !pairTickerB || pairTickerA === pairTickerB : filteredTickers.length === 0}
                  className="h-7 px-3 text-xs"
                >Run Optimizer</Button>
              )}
              {results.length > 0 && (
                <Button onClick={handleExportCSV} size="sm" variant="outline" className="h-7 px-2 text-xs" title="Export results to CSV">
                  <Download className="w-3.5 h-3.5 mr-1" />CSV
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {running && (
            <div className="px-4 py-1.5 border-b border-border bg-muted/30 flex-shrink-0 text-xs flex items-center gap-3">
              <span>Tickers: {progress.current}/{progress.total}</span>
              {runningConfig && (
                <span className="text-muted-foreground">{runningConfig.ticker}: {runningConfig.done.toLocaleString()}/{runningConfig.total.toLocaleString()} configs</span>
              )}
              <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden max-w-md">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? Math.round(progress.current / progress.total * 100) : 0}%` }} />
              </div>
            </div>
          )}

          {/* Filter + rank-by bar */}
          {results.length > 0 && (
            <div className="px-4 py-1.5 border-b border-border flex-shrink-0 text-xs flex items-center gap-2">
              <input
                type="text" placeholder="Filter ticker or name…" value={filterText}
                onChange={e => setFilterText(e.target.value)}
                className="h-7 w-56 rounded-md bg-card border border-border px-2 text-xs"
              />
              <span className="text-muted-foreground">{filteredSortedResults.length} of {results.length} rows</span>
              <div className="flex items-center gap-1 ml-auto">
                <label className="text-[10px] font-mono text-muted-foreground">RANK BY</label>
                <select
                  data-testid="slowstoch-rank-by"
                  value={rankBy} onChange={e => setRankBy(e.target.value)}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5"
                >
                  {RANK_BY_OPTIONS.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Results table */}
          <div className="flex-1 overflow-auto">
            {results.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                {running ? "Running optimizer…" : `Configure parameters and click Run Optimizer. Estimated ${combosCount.toLocaleString()} combos for ${SIGNAL_KIND_LABELS[signalKind]} (${gridSize}).`}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-1.5 cursor-pointer hover:bg-accent" onClick={() => handleSort("ticker")}>
                      Ticker {runSort.col === "ticker" && (runSort.dir === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="text-left px-2 py-1.5 cursor-pointer hover:bg-accent" onClick={() => handleSort("currentSignal")}>Live Signal</th>
                    <th className="text-right px-2 py-1.5">Slow K</th>
                    <th className="text-right px-2 py-1.5">Slow D</th>
                    <th className="text-right px-2 py-1.5 cursor-pointer hover:bg-accent" onClick={() => handleSort("score")}>
                      Score {runSort.col === "score" && (runSort.dir === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="text-left px-2 py-1.5">Best Config</th>
                    <th className="text-left px-2 py-1.5">Side</th>
                    <th className="text-right px-2 py-1.5">Sigs</th>
                    {horizons.map((h: any) => <th key={h.label} className="text-right px-1.5 py-1.5">{h.label} hit</th>)}
                    {horizons.map((h: any) => <th key={"avg" + h.label} className="text-right px-1.5 py-1.5">{h.label} avg</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredSortedResults.map(e => {
                    const best = e.longBest && e.shortBest
                      ? (e.longBest.score >= e.shortBest.score ? { side: "Long", ...e.longBest } : { side: "Short", ...e.shortBest })
                      : e.longBest ? { side: "Long", ...e.longBest }
                      : e.shortBest ? { side: "Short", ...e.shortBest }
                      : null;
                    if (!best) {
                      return (
                        <tr key={e.tr.ticker} className="border-b border-border/50">
                          <td className="px-3 py-1.5 font-mono">{e.tr.ticker}</td>
                          <td colSpan={12} className="px-2 py-1.5 text-muted-foreground italic">No qualifying signals</td>
                        </tr>
                      );
                    }
                    const isExpanded = expandedTicker === e.tr.ticker;
                    return (
                      <ResultRow
                        key={e.tr.ticker}
                        er={e}
                        best={best as any}
                        expanded={isExpanded}
                        onToggle={() => setExpandedTicker(isExpanded ? null : e.tr.ticker)}
                        horizons={horizons}
                        useBand={isBand}
                        priceContext={priceContextMap.get(e.tr.ticker)}
                        hitConditionsOpen={hitConditionsOpen}
                        toggleHitConditions={toggleHitConditions}
                      />
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

interface ResultRowProps {
  er: any;
  best: any;
  expanded: boolean;
  onToggle: () => void;
  horizons: any[];
  useBand: boolean;
  priceContext?: PriceContext;
  hitConditionsOpen: Set<string>;
  toggleHitConditions: (key: string) => void;
}

function ResultRow({ er, best, expanded, onToggle, horizons, useBand, priceContext, hitConditionsOpen, toggleHitConditions }: ResultRowProps) {
  const tr = er.tr as TickerStochResult;
  return (
    <React.Fragment>
      <tr className="border-b border-border/50 hover:bg-accent/40 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-1.5 font-mono font-semibold">{tr.ticker}</td>
        <td className="px-2 py-1.5">
          <span className={tr.currentSignal.startsWith("→ Buy") ? "text-emerald-400 font-semibold" : tr.currentSignal.startsWith("→ Sell") ? "text-rose-400 font-semibold" : "text-muted-foreground"}>
            {tr.currentSignal}
          </span>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{tr.currentSlowK !== null ? tr.currentSlowK.toFixed(1) : "—"}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{tr.currentSlowD !== null ? tr.currentSlowD.toFixed(1) : "—"}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          <span style={{ backgroundColor: scoreBackgroundColor(best.score), color: scoreTextColor(best.score), padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>
            {best.score}
          </span>
        </td>
        <td className="px-2 py-1.5 max-w-[260px] truncate" title={best.cfg.configLabel}>{best.cfg.configLabel}</td>
        <td className="px-2 py-1.5"><span className={best.side === "Long" ? "text-emerald-400" : "text-rose-400"}>{best.side}</span></td>
        <td className="px-2 py-1.5 text-right tabular-nums">{best.summary.count}</td>
        {horizons.map((h: any) => {
          const hitRate = useBand ? (best.summary.bandHitRate?.[h.label] ?? best.summary.hitRate[h.label]) : best.summary.hitRate[h.label];
          return <td key={"hit" + h.label} className={`px-1.5 py-1.5 text-right tabular-nums ${hitRateColor(hitRate)}`}>{(hitRate * 100).toFixed(0)}%</td>;
        })}
        {horizons.map((h: any) => (
          <td key={"avg" + h.label} className="px-1.5 py-1.5 text-right tabular-nums">{pctSigned(best.summary.avgReturn[h.label] ?? 0)}</td>
        ))}
      </tr>
      {expanded && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={8 + horizons.length * 2} className="px-3 py-2">
            <ExpandedDetail tr={tr} horizons={horizons} useBand={useBand} priceContext={priceContext} hitConditionsOpen={hitConditionsOpen} toggleHitConditions={toggleHitConditions} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

interface ExpandedDetailProps {
  tr: TickerStochResult;
  horizons: any[];
  useBand: boolean;
  priceContext?: PriceContext;
  hitConditionsOpen: Set<string>;
  toggleHitConditions: (key: string) => void;
}

function ExpandedDetail({ tr, horizons, useBand, priceContext, hitConditionsOpen, toggleHitConditions }: ExpandedDetailProps) {
  const topConfigs = useMemo(() => [...tr.configs].sort((a, b) => b.bestScore - a.bestScore).slice(0, 8), [tr.configs]);
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Top configs for {tr.ticker} · {SIGNAL_KIND_LABELS[tr.kind]}</div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-2 py-1">Config</th>
            <th className="text-left px-2 py-1">Side</th>
            <th className="text-right px-2 py-1">Score</th>
            <th className="text-right px-2 py-1">Sigs</th>
            {horizons.map((h: any) => <th key={"hh" + h.label} className="text-right px-1.5 py-1">{h.label}</th>)}
            <th className="text-right px-2 py-1">PF best</th>
          </tr>
        </thead>
        <tbody>
          {topConfigs.map(cfg => {
            const bestCat = cfg.categories.reduce((a, b) => a.composite.score > b.composite.score ? a : b);
            const summary = bestCat.summary;
            const maxPF = Math.max(...horizons.map((h: any) => summary.profitFactor[h.label] ?? 0));
            const hitCondKey = `${tr.ticker}::${cfg.configLabel}::${bestCat.category}`;
            const isHCOpen = hitConditionsOpen.has(hitCondKey);
            const hasHC = !!(bestCat.profiles && bestCat.profiles.length >= 10 && priceContext);
            return (
              <React.Fragment key={cfg.configKey}>
                <tr className="border-b border-border/40">
                  <td className="px-2 py-1 truncate max-w-[280px]" title={cfg.configLabel}>{cfg.configLabel}</td>
                  <td className="px-2 py-1">
                    <span className={bestCat.category === "buy" ? "text-emerald-400" : "text-rose-400"}>
                      {bestCat.category === "buy" ? "Long" : "Short"}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    <span style={{ backgroundColor: scoreBackgroundColor(bestCat.composite.score), color: scoreTextColor(bestCat.composite.score), padding: "1px 5px", borderRadius: 3, fontWeight: 600 }}>
                      {bestCat.composite.score}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{summary.count}</td>
                  {horizons.map((h: any) => {
                    const hitRate = useBand ? (summary.bandHitRate?.[h.label] ?? summary.hitRate[h.label]) : summary.hitRate[h.label];
                    return <td key={"hh" + h.label + cfg.configKey} className={`px-1.5 py-1 text-right tabular-nums ${hitRateColor(hitRate)}`}>{(hitRate * 100).toFixed(0)}%</td>;
                  })}
                  <td className={`px-2 py-1 text-right tabular-nums ${profitFactorColor(maxPF)}`}>
                    {hasHC ? (
                      <button
                        type="button"
                        onClick={() => toggleHitConditions(hitCondKey)}
                        className={`mr-2 px-1.5 py-0.5 rounded text-[9px] font-bold border align-middle ${isHCOpen ? "bg-violet-500/25 text-violet-200 border-violet-400/40" : "bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`}
                        title="Profile what other indicators looked like at hit-bars vs miss-bars"
                      >{isHCOpen ? "▾" : "▸"} HC</button>
                    ) : null}
                    {maxPF.toFixed(2)}
                  </td>
                </tr>
                {isHCOpen && hasHC && priceContext && bestCat.profiles && (
                  <tr className="border-b border-border/40 bg-muted/10">
                    <td colSpan={5 + horizons.length} className="px-2 py-2">
                      <HitConditionsPanel
                        ticker={priceContext.mode === "pair" && priceContext.pairLegA ? priceContext.pairLegA : tr.ticker}
                        priceContext={priceContext}
                        signals={bestCat.profiles}
                        direction={bestCat.category}
                        title={`${cfg.configLabel} — ${bestCat.category === "buy" ? "Long" : "Short"}`}
                        useBand={useBand}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
