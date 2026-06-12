// Reconstructed from recovered-bundle/ComboOptimizer-DeA6DroV.js on 2026-06-11

import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/useBaskets";
import { getScoreWeights, createDateRangeFromPreset, pct, hitRateColor, pctSigned,
  profitFactorColor, RANK_BY_OPTIONS, DATE_PRESETS, summarizeSignals } from "@/lib/forwardReturns";
import { createDateRange } from "@/lib/optimizerInputSeries";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useUniverse } from "@/lib/universeContext";
import { getTickers, getDates } from "@/lib/dataService";
import { getTickerRaw } from "@/lib/dataService";
import { refreshTickerData } from "@/lib/dataService";
import { isBasketTicker, defaultInputSelection } from "@/lib/optimizerInputSeries";
import { weeklyDownsample as weeklyDownsampleFn } from "@/lib/weeklyDownsample";
const expandWeeklyToDailyRaw = (weeklyDownsampleFn as any).expandWeeklyToDaily ?? ((arr: any, idx: any, n: any) => arr);
import { getDailyIndexFromWeekly as getDailyIndexFromWeeklyFn } from "@/lib/getDailyIndexFromWeekly";
import { computeForwardProfile } from "@/lib/forwardReturns";
import { fetchWorkbookSeriesForTicker as fetchWorkbookSeriesForTickerFn } from "@/lib/fetchWorkbookSeriesForTicker";
import { buildBasketOhlc as buildBasketOhlcFn, getBasketOhlc as getBasketOhlcFn } from "@/lib/basketOhlc";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputSeriesPicker } from "@/components/InputSeriesPicker";
import { PresetBar } from "@/components/PresetBar";
import { UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { BasketTickerPill } from "@/components/BasketTickerPill";
import {
  e as evaluateSignals,
  E as EvaluatorResultPanel,
  H as HitConditionsPanel,
} from "@/components/EvaluatorPanel";
import { BasketPicker } from "@/components/BasketPicker";

// ─── Cast helpers ────────────────────────────────────────────────────────────
const buildBasketOhlc = buildBasketOhlcFn as any;
const getBasketOhlc = getBasketOhlcFn as any;
const weeklyDownsample = weeklyDownsampleFn as any;
const expandWeeklyToDailyFn = expandWeeklyToDailyRaw as any;
const getDailyIndexFromWeekly = getDailyIndexFromWeeklyFn as any;
const pickBestByRankMode = (getScoreWeights as any);
const fetchWorkbookSeriesForTicker = fetchWorkbookSeriesForTickerFn as any;

// rocSignalDetect (c from rocSignalDetect-B1VJ2Cnc.js): ROC array over period
// Unresolved: @/lib/rocSignalDetect
const rocSignalDetect = ((_prices: number[], _period: number) => [] as number[]) as any;

// dk = clipArraysByDateRange(dates, range, ...arrays) → { dates, arrays }
// dl = compareSummaries(summaryA, scoreA, summaryB, scoreB, direction, weights) → number
// Unresolved: @/lib/clipArraysByDateRange
const clipArraysByDateRange = ((..._args: any[]) => ({ dates: [] as string[], arrays: [] as any[][] })) as any;
const compareSummaries = ((_a: any, _b: any, _c: any, _d: any, _e: any, _f: any) => 0) as any;

// ─── Types ───────────────────────────────────────────────────────────────────

interface DateRange {
  start: string;
  end: string;
}

interface InputSelection {
  kind: "close" | "workbook";
  metric?: string;
}

/** A trigger event — price-cross or momentum crossover that generates signal indices */
interface TriggerDef {
  kind: string;
  label: string;
  direction: "buy" | "sell";
  fastPeriod?: number;
  slowPeriod?: number;
  maPeriod?: number;
  rocPeriod?: number;
  threshold?: number;
}

/** A filter condition — AND-conjoined on top of a trigger */
interface FilterDef {
  kind: string;
  label: string;
  period?: number;
  threshold?: number;
  bandLow?: number;
  bandHigh?: number;
  slopeLookback?: number;
}

/** Precomputed indicator cache for a price series */
interface IndicatorCache {
  rsi14: (number | null)[];
  rocByPeriod: Map<number, number[]>;
  smaByPeriod: Map<number, (number | null)[]>;
  slopeByPeriod: Map<number, (number | null)[]>;
}

interface ComboEntry {
  triggerLabel: string;
  triggerKind: string;
  direction: "buy" | "sell";
  filterLabels: string[];
  summary: any;
  baselineHitRate: number;
  baselineCount: number;
  signalIndices: number[];
  profiles: any[];
}

interface ComboResult {
  ticker: string;
  name?: string;
  topCombos: ComboEntry[];
  bestHitRate: number;
  triggerCount: number;
  priceContext: PriceContext;
}

interface PriceContext {
  prices: number[];
  highs: number[];
  lows: number[];
  volumes: number[] | null;
  dates: string[];
  globalIndices: number[];
  benchmarkPrices: null;
  mode: "pair" | "single";
  pairLegA?: string;
  pairLegB?: string;
}

// ─── Local helpers ───────────────────────────────────────────────────────────

/** Simple moving average */
function computeSMA(prices: number[], period: number): (number | null)[] {
  const result = new Array(prices.length).fill(null);
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

/** Wilder RSI(14) */
function computeRSI14(prices: number[]): (number | null)[] {
  const result = new Array(prices.length).fill(null);
  if (prices.length < 15) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= 14; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= 14;
  avgLoss /= 14;
  result[14] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = 15; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
    result[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

/** ROC-of-MA slope: 5-bar change of MA */
function computeMASlope(ma: (number | null)[], slopeLookback: number): (number | null)[] {
  const result = new Array(ma.length).fill(null);
  for (let i = slopeLookback; i < ma.length; i++) {
    const cur = ma[i];
    const prev = ma[i - slopeLookback];
    if (cur !== null && prev !== null && prev !== 0) {
      result[i] = cur / prev - 1;
    }
  }
  return result;
}

/** Build all trigger definitions */
function buildTriggers(): TriggerDef[] {
  const triggers: TriggerDef[] = [];
  for (const [fast, slow] of [[10, 50], [20, 50], [50, 200]] as [number, number][]) {
    triggers.push({ kind: "golden_cross", label: `Golden ${fast}/${slow}`, direction: "buy", fastPeriod: fast, slowPeriod: slow });
    triggers.push({ kind: "death_cross",  label: `Death ${fast}/${slow}`,  direction: "sell", fastPeriod: fast, slowPeriod: slow });
  }
  for (const period of [20, 50, 200]) {
    triggers.push({ kind: "price_above", label: `Px↑MA${period}`, direction: "buy",  maPeriod: period });
    triggers.push({ kind: "price_below", label: `Px↓MA${period}`, direction: "sell", maPeriod: period });
  }
  for (const period of [20, 50, 200]) {
    triggers.push({ kind: "roc_above_thresh", label: `ROC(${period})↑+5%`, direction: "buy",  rocPeriod: period, threshold: 0.05 });
    triggers.push({ kind: "roc_below_thresh", label: `ROC(${period})↓-5%`, direction: "sell", rocPeriod: period, threshold: 0.05 });
    triggers.push({ kind: "roc_zero_up",      label: `ROC(${period})↑0`,   direction: "buy",  rocPeriod: period });
    triggers.push({ kind: "roc_zero_down",    label: `ROC(${period})↓0`,   direction: "sell", rocPeriod: period });
  }
  triggers.push({ kind: "rsi_cross_up_lo",   label: "RSI(14)↑30", direction: "buy" });
  triggers.push({ kind: "rsi_cross_down_hi", label: "RSI(14)↓70", direction: "sell" });
  return triggers;
}

/** Build all filter definitions */
function buildFilters(): FilterDef[] {
  const filters: FilterDef[] = [];
  for (const period of [20, 50]) {
    filters.push({ kind: "roc_above", label: `ROC(${period})>+5%`,  period, threshold: 0.05 });
    filters.push({ kind: "roc_above", label: `ROC(${period})>+10%`, period, threshold: 0.10 });
    filters.push({ kind: "roc_below", label: `ROC(${period})<-5%`,  period, threshold: 0.05 });
    filters.push({ kind: "roc_below", label: `ROC(${period})<-10%`, period, threshold: 0.10 });
  }
  filters.push({ kind: "rsi_below", label: "RSI<30", threshold: 30 });
  filters.push({ kind: "rsi_below", label: "RSI<40", threshold: 40 });
  filters.push({ kind: "rsi_above", label: "RSI>60", threshold: 60 });
  filters.push({ kind: "rsi_above", label: "RSI>70", threshold: 70 });
  filters.push({ kind: "rsi_band",  label: "RSI∈[40,60]", bandLow: 40, bandHigh: 60 });
  for (const period of [50, 200]) {
    filters.push({ kind: "price_above_ma", label: `Px>MA${period}`, period });
    filters.push({ kind: "price_below_ma", label: `Px<MA${period}`, period });
  }
  for (const period of [50, 200]) {
    filters.push({ kind: "ma_slope_up",   label: `MA${period}↗`, period, slopeLookback: 5 });
    filters.push({ kind: "ma_slope_down", label: `MA${period}↘`, period, slopeLookback: 5 });
  }
  return filters;
}

/** Precompute all indicators for a price series */
function computeIndicators(prices: number[]): IndicatorCache {
  const rsi14 = computeRSI14(prices);
  const rocByPeriod = new Map<number, number[]>();
  for (const period of [20, 50, 200]) {
    rocByPeriod.set(period, rocSignalDetect(prices, period));
  }
  const smaByPeriod = new Map<number, (number | null)[]>();
  for (const period of [10, 20, 50, 200]) {
    smaByPeriod.set(period, computeSMA(prices, period));
  }
  const slopeByPeriod = new Map<number, (number | null)[]>();
  for (const period of [50, 200]) {
    slopeByPeriod.set(period, computeMASlope(smaByPeriod.get(period)!, 5));
  }
  return { rsi14, rocByPeriod, smaByPeriod, slopeByPeriod };
}

/** Detect all signal indices for a trigger definition */
function detectTriggerSignals(trigger: TriggerDef, prices: number[], cache: IndicatorCache): number[] {
  const indices: number[] = [];
  switch (trigger.kind) {
    case "golden_cross":
    case "death_cross": {
      const fast = cache.smaByPeriod.get(trigger.fastPeriod!) ?? computeSMA(prices, trigger.fastPeriod!);
      const slow = cache.smaByPeriod.get(trigger.slowPeriod!) ?? computeSMA(prices, trigger.slowPeriod!);
      if (!cache.smaByPeriod.has(trigger.fastPeriod!)) cache.smaByPeriod.set(trigger.fastPeriod!, fast);
      if (!cache.smaByPeriod.has(trigger.slowPeriod!)) cache.smaByPeriod.set(trigger.slowPeriod!, slow);
      for (let i = 1; i < prices.length; i++) {
        if (fast[i] === null || slow[i] === null || fast[i-1] === null || slow[i-1] === null) continue;
        const above = fast[i]! > slow[i]!;
        const prevAbove = fast[i-1]! > slow[i-1]!;
        if (trigger.kind === "golden_cross" && above && !prevAbove) indices.push(i);
        if (trigger.kind === "death_cross"  && !above && prevAbove) indices.push(i);
      }
      break;
    }
    case "price_above":
    case "price_below": {
      const ma = cache.smaByPeriod.get(trigger.maPeriod!) ?? computeSMA(prices, trigger.maPeriod!);
      if (!cache.smaByPeriod.has(trigger.maPeriod!)) cache.smaByPeriod.set(trigger.maPeriod!, ma);
      for (let i = 1; i < prices.length; i++) {
        if (ma[i] === null || ma[i-1] === null) continue;
        const above = prices[i] > ma[i]!;
        const prevAbove = prices[i-1] > ma[i-1]!;
        if (trigger.kind === "price_above" && above && !prevAbove) indices.push(i);
        if (trigger.kind === "price_below" && !above && prevAbove) indices.push(i);
      }
      break;
    }
    case "roc_above_thresh":
    case "roc_below_thresh": {
      const roc = cache.rocByPeriod.get(trigger.rocPeriod!) ?? rocSignalDetect(prices, trigger.rocPeriod!);
      if (!cache.rocByPeriod.has(trigger.rocPeriod!)) cache.rocByPeriod.set(trigger.rocPeriod!, roc);
      const thresh = trigger.threshold!;
      for (let i = 1; i < prices.length; i++) {
        if (!Number.isFinite(roc[i]) || !Number.isFinite(roc[i-1])) continue;
        if (trigger.kind === "roc_above_thresh" && roc[i-1] <= thresh  && roc[i] > thresh)  indices.push(i);
        if (trigger.kind === "roc_below_thresh" && roc[i-1] >= -thresh && roc[i] < -thresh) indices.push(i);
      }
      break;
    }
    case "roc_zero_up":
    case "roc_zero_down": {
      const roc = cache.rocByPeriod.get(trigger.rocPeriod!) ?? rocSignalDetect(prices, trigger.rocPeriod!);
      if (!cache.rocByPeriod.has(trigger.rocPeriod!)) cache.rocByPeriod.set(trigger.rocPeriod!, roc);
      for (let i = 1; i < prices.length; i++) {
        if (!Number.isFinite(roc[i]) || !Number.isFinite(roc[i-1])) continue;
        if (trigger.kind === "roc_zero_up"   && roc[i-1] <= 0 && roc[i] > 0) indices.push(i);
        if (trigger.kind === "roc_zero_down" && roc[i-1] >= 0 && roc[i] < 0) indices.push(i);
      }
      break;
    }
    case "rsi_cross_up_lo":
    case "rsi_cross_down_hi": {
      const rsi = cache.rsi14;
      for (let i = 1; i < rsi.length; i++) {
        const cur = rsi[i], prev = rsi[i-1];
        if (cur === null || prev === null) continue;
        if (trigger.kind === "rsi_cross_up_lo"   && prev <= 30 && cur > 30) indices.push(i);
        if (trigger.kind === "rsi_cross_down_hi" && prev >= 70 && cur < 70) indices.push(i);
      }
      break;
    }
  }
  return indices;
}

/** Evaluate a filter condition at a given signal index */
function evalFilterCondition(
  filter: FilterDef,
  idx: number,
  prices: number[],
  cache: IndicatorCache
): boolean | null {
  switch (filter.kind) {
    case "roc_above": {
      const roc = cache.rocByPeriod.get(filter.period!);
      if (!roc) return null;
      return Number.isFinite(roc[idx]) ? roc[idx] > filter.threshold! : null;
    }
    case "roc_below": {
      const roc = cache.rocByPeriod.get(filter.period!);
      if (!roc) return null;
      return Number.isFinite(roc[idx]) ? roc[idx] < -filter.threshold! : null;
    }
    case "rsi_below": {
      const v = cache.rsi14[idx];
      return v === null ? null : v < filter.threshold!;
    }
    case "rsi_above": {
      const v = cache.rsi14[idx];
      return v === null ? null : v > filter.threshold!;
    }
    case "rsi_band": {
      const v = cache.rsi14[idx];
      return v === null ? null : v >= filter.bandLow! && v <= filter.bandHigh!;
    }
    case "price_above_ma": {
      const ma = cache.smaByPeriod.get(filter.period!);
      if (!ma || ma[idx] === null) return null;
      return prices[idx] > ma[idx]!;
    }
    case "price_below_ma": {
      const ma = cache.smaByPeriod.get(filter.period!);
      if (!ma || ma[idx] === null) return null;
      return prices[idx] < ma[idx]!;
    }
    case "ma_slope_up": {
      const slope = cache.slopeByPeriod.get(filter.period!);
      if (!slope || slope[idx] === null) return null;
      return slope[idx]! > 0;
    }
    case "ma_slope_down": {
      const slope = cache.slopeByPeriod.get(filter.period!);
      if (!slope || slope[idx] === null) return null;
      return slope[idx]! < 0;
    }
  }
  return null;
}

/** Load ticker OHLCV data */
async function loadTickerData(
  ticker: string,
  globalDates: string[],
  inputSelection: InputSelection | null
): Promise<{ closes: number[]; highs: number[]; lows: number[]; volumes: number[]; priceDates: string[] } | null> {
  const sel = inputSelection ?? defaultInputSelection;
  if ((sel as any).kind !== "close") {
    const result = await fetchWorkbookSeriesForTicker(ticker, sel);
    if (!result) return null;
    return {
      closes: result.closes,
      highs: result.highs,
      lows: result.lows,
      volumes: result.volumes,
      priceDates: result.priceDates,
    };
  }
  try {
    const raw = await getTickerRaw(ticker) as any;
    if (raw.adjCloses.length > 0) {
      const n = raw.adjCloses.length;
      const rawHighs = raw.highs ?? raw.adjCloses;
      const rawLows  = raw.lows  ?? raw.adjCloses;
      const adjHighs = new Array(n);
      const adjLows  = new Array(n);
      for (let i = 0; i < n; i++) {
        const close    = raw.closes ? raw.closes[i] : NaN;
        const adjClose = raw.adjCloses[i];
        const ratio    = Number.isFinite(close) && close > 0 && Number.isFinite(adjClose) ? adjClose / close : 1;
        adjHighs[i] = rawHighs[i] * ratio;
        adjLows[i]  = rawLows[i]  * ratio;
      }
      return {
        closes: raw.adjCloses as number[],
        highs: adjHighs as number[],
        lows: adjLows as number[],
        volumes: (raw.volumes ?? []) as number[],
        priceDates: (raw.dates ?? []) as string[],
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ComboOptimizer() {
  const [tickers, setTickers] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [inputSelection, setInputSelection] = usePersistedState<InputSelection>("combo-input-selection", defaultInputSelection as any);
  const [lastRefreshTime, setLastRefreshTime] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [runMode, setRunMode] = useState<"single" | "universe" | "pair" | "pairCombo" | "basket">("single");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = useState<"stocks" | "combined">("stocks");
  const { baskets } = useBaskets();
  const [horizon, setHorizon] = useState<"1M" | "2M" | "3M" | "6M">("3M");
  const [rankBy, setRankBy] = useState("composite");
  const scoreWeights = useMemo(() => (getScoreWeights as any)(rankBy), [rankBy]);
  const [direction, setDirection] = useState<"both" | "buy" | "sell">("both");
  const [maxFilters, setMaxFilters] = useState(2);
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [minSignals, setMinSignals] = useState(15);
  const [minLift, setMinLift] = useState(0);
  const [minHold, setMinHold] = useState(1);
  const [topN, setTopN] = useState(10);
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState<DateRange>(() => (createDateRange as any)());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = usePersistedState<ComboResult[]>("combo:results", []);
  const [filterText, setFilterText] = useState("");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [expandedHCKeys, setExpandedHCKeys] = useState<Set<string>>(new Set());
  const toggleHCKey = useCallback((key: string) => {
    setExpandedHCKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const [view, setView] = useState<"optimize" | "evaluate">("optimize");
  const [evalTriggerKey, setEvalTriggerKey] = useState("");
  const [evalFilterKeys, setEvalFilterKeys] = useState<string[]>([]);
  const [evalDirection, setEvalDirection] = useState<"long" | "short">("long");
  const [evalResult, setEvalResult] = usePersistedState<any>("combo:evalResult", null);
  const [evalPriceCtx, setEvalPriceCtx] = useState<PriceContext | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const cancelRef = useRef(false);
  const initRef = useRef(false);

  const { frequency, setFrequency, frequencyUI } = useFrequency("combo", "daily", running);
  const resampleMode = frequency === "weekly" ? "weekly" : "daily";

  // captureInputs: snapshot of persistent/UI state (excludes ephemeral per-run state)
  const captureInputs = useCallback(() => {
    const full: any = {
      selectedTicker,
      pairTickerA,
      pairTickerB,
      basketTickers,
      basketMode,
      mode: runMode,
      horizon,
      direction,
      maxFilters,
      targetReturn,
      minSignals,
      minLift,
      minHold,
      topN,
      view,
      evalDirection,
      evalTriggerKey,
      evalFilterKeys,
      results,
      expandedTicker,
      evalResult,
      frequency,
      inputSelection,
    };
    return full;
  }, [selectedTicker, pairTickerA, pairTickerB, basketTickers, basketMode, runMode, horizon,
      direction, maxFilters, targetReturn, minSignals, minLift, minHold, topN, view, evalDirection,
      evalTriggerKey, evalFilterKeys, results, expandedTicker, evalResult, frequency, inputSelection]);

  // captureInputsForPreset: strip ephemeral state before saving preset
  const captureInputsForPreset = useCallback(() => {
    const {
      selectedTicker: _t,
      pairTickerA: _a,
      pairTickerB: _b,
      results: _r,
      gridResults: _gr,
      expandedTicker: _e,
      expandedGridTicker: _eg,
      sortBy: _sb,
      runSort: _rs,
      gridLongSort: _gls,
      gridShortSort: _gss,
      evalResult: _er,
      evalTriggerKey: _etk,
      evalFilterKeys: _efk,
      ...rest
    } = captureInputs() as any;
    return rest;
  }, [captureInputs]);

  const applyInputs = useCallback((state: any) => {
    applyInputsFn(state);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyInputsFn(state: any) {
    if (!state) return;
    if (state.selectedTicker) { setSelectedTicker(state.selectedTicker); initRef.current = true; }
    if (state.pairTickerA) setPairTickerA(state.pairTickerA);
    if (state.pairTickerB) setPairTickerB(state.pairTickerB);
    if (["single", "universe", "pair", "pairCombo", "basket"].includes(state.mode)) setRunMode(state.mode);
    if (pairComboPickerRef.current?.hydrate && state.pairCombo) pairComboPickerRef.current.hydrate(state.pairCombo);
    if (Array.isArray(state.basketTickers)) setBasketTickers(state.basketTickers.filter((t: any) => typeof t === "string"));
    if (state.basketMode === "stocks" || state.basketMode === "combined") setBasketMode(state.basketMode);
    if (["1M", "2M", "3M", "6M"].includes(state.horizon)) setHorizon(state.horizon);
    if (["both", "buy", "sell"].includes(state.direction)) setDirection(state.direction);
    if (typeof state.maxFilters === "number") setMaxFilters(state.maxFilters);
    if (typeof state.targetReturn === "number") setTargetReturn(state.targetReturn);
    if (typeof state.minSignals === "number") setMinSignals(state.minSignals);
    if (typeof state.minLift === "number") setMinLift(state.minLift);
    if (typeof state.minHold === "number") setMinHold(state.minHold);
    if (typeof state.topN === "number") setTopN(state.topN);
    if (state.view === "optimize" || state.view === "evaluate") setView(state.view);
    if (state.evalDirection === "long" || state.evalDirection === "short") setEvalDirection(state.evalDirection);
    if (typeof state.evalTriggerKey === "string") setEvalTriggerKey(state.evalTriggerKey);
    if (Array.isArray(state.evalFilterKeys)) setEvalFilterKeys(state.evalFilterKeys);
    if (Array.isArray(state.results)) setResults(state.results);
    if (state.expandedTicker !== undefined) setExpandedTicker(state.expandedTicker);
    if (state.evalResult !== undefined) setEvalResult(state.evalResult);
    if (state.frequency === "daily" || state.frequency === "weekly" || state.frequency === "weekly_on_daily") {
      setFrequency(state.frequency);
    } else if (state.timeframe === "weekly" && state.frequency === undefined) {
      setFrequency("weekly");
    }
    if (state.inputSelection && typeof state.inputSelection === "object") {
      const sel = state.inputSelection;
      if (sel.kind === "close") {
        setInputSelection({ kind: "close" });
      } else if (sel.kind === "workbook" && typeof sel.metric === "string") {
        setInputSelection({ kind: "workbook", metric: sel.metric });
      }
    }
  }

  useWorkspaceTab("combo-optimizer", captureInputs, applyInputs);

  // Pair combo picker ref (for hydrate)
  const pairComboPickerRef = useRef<any>(null);

  const { universeTickers, isFiltered } = useUniverse();
  const filteredAllTickers = useMemo(
    () => universeTickers ? tickers.filter(t => universeTickers.has(t.ticker)) : tickers,
    [tickers, universeTickers]
  );

  const classFilter = useOptimizerClassFilter(filteredAllTickers, runMode === "universe", "combo-clf");
  const pairCombo   = usePairComboPicker(filteredAllTickers.map((t: any) => t.ticker), runMode === "pairCombo", "combo-pc");
  pairComboPickerRef.current = pairCombo;

  const visibleTickers = classFilter.filteredTickers;

  // Load tickers on mount
  useEffect(() => {
    getTickers().then(list => {
      setTickers(list);
      if (list.length > 0) {
        setSelectedTicker(list[0].ticker);
        setPairTickerA(list[0].ticker);
        setPairTickerB(list[1]?.ticker ?? list[0].ticker);
      }
    });
  }, []);

  // Keep selectedTicker valid when universe changes
  useEffect(() => {
    if (filteredAllTickers.length > 0 && selectedTicker && tickers.some(t => t.ticker === selectedTicker) && !filteredAllTickers.find(t => t.ticker === selectedTicker)) {
      setSelectedTicker(filteredAllTickers[0].ticker);
    }
  }, [filteredAllTickers, selectedTicker, tickers]);

  const allTriggers  = useMemo(() => buildTriggers(), []);
  const allFilters   = useMemo(() => buildFilters(), []);

  // ─── Run Optimizer ──────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    setRunning(true);
    setResults([]);
    cancelRef.current = false;

    const globalDates = await getDates();
    let tickerList: any[];

    if (runMode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) { setRunning(false); return; }
      tickerList = [{ ticker: `${pairTickerA}/${pairTickerB}` }];
    } else if (runMode === "single") {
      const meta = filteredAllTickers.find(t => t.ticker === selectedTicker);
      tickerList = meta ? [meta] : selectedTicker ? [{ ticker: selectedTicker, name: selectedTicker }] : [];
    } else if (runMode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) { setRunning(false); return; }
        const basket = buildBasketOhlc(basketTickers, baskets);
        tickerList = [{ ticker: `BASKET:${basket.name}`, name: `BASKET:${basket.name}` }];
      } else {
        tickerList = basketTickers.map(t => filteredAllTickers.find(m => m.ticker.toUpperCase() === t.toUpperCase()) ?? { ticker: t, name: t });
      }
    } else if (runMode === "pairCombo") {
      if (pairCombo.pairs.length === 0) { setRunning(false); return; }
      tickerList = pairCombo.pairs.map((p: any) => ({ ticker: p.label, name: p.label, pairA: p.a, pairB: p.b }));
    } else {
      tickerList = visibleTickers;
    }

    if (tickerList.length === 0) { setRunning(false); return; }

    const combinedBasket = runMode === "basket" && basketMode === "combined" ? buildBasketOhlc(basketTickers, baskets) : null;

    setProgress({ current: 0, total: tickerList.length });
    const accumulated: ComboResult[] = [];

    for (let idx = 0; idx < tickerList.length && !cancelRef.current; idx++) {
      const tickerEntry = tickerList[idx];
      setProgress({ current: idx + 1, total: tickerList.length });

      try {
        // Resolve prices, highs, lows, dates, globalIndices
        let prices: number[], highs: number[], lows: number[], dates: string[];
        let rawPrices: number[] | null = null;
        let volumes: number[] | null = null;
        let globalIndices: number[];
        let resampledResult: any = null;

        const pairA = runMode === "pairCombo" ? tickerEntry.pairA : pairTickerA;
        const pairB = runMode === "pairCombo" ? tickerEntry.pairB : pairTickerB;

        if (runMode === "pair" || runMode === "pairCombo") {
          const pairData = await getYahooPairsRatio(pairA, pairB, globalDates);
          if (!pairData || pairData.indices.length < 252) continue;
          const pairDates = pairData.indices.map((i: number) => globalDates[i] || "");
          const pairIndices = pairData.indices.slice();
          const clipped = clipArraysByDateRange(pairDates, dateRange, pairData.prices, pairIndices);
          const clippedPrices = clipped.arrays[0];
          const clippedIndices = clipped.arrays[1];
          if (clippedPrices.length < 252) continue;
          prices = clippedPrices;
          highs = prices.slice();
          lows  = prices.slice();
          dates = clipped.dates;
          globalIndices = clippedIndices;
        } else if (combinedBasket && runMode === "basket") {
          const basketData = await getBasketOhlc(combinedBasket, dateRange);
          if (!basketData || basketData.closes.length < 252) continue;
          rawPrices = basketData.closes;
          volumes   = basketData.volumes;
          const dateIndexMap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dateIndexMap.set(globalDates[i], i);

          if ((frequency as string) === "weekly_on_daily") {
            prices = rawPrices;
            highs  = basketData.highs;
            lows   = basketData.lows;
            dates  = basketData.priceDates;
            globalIndices = dates.map((d: string) => dateIndexMap.get(d) ?? -1);
            if (prices.length < 252) continue;
          } else {
            const resampled = weeklyDownsample({ dates: basketData.priceDates, closes: rawPrices, adjCloses: rawPrices, highs: basketData.highs, lows: basketData.lows }, resampleMode);
            resampledResult = resampled;
            if (resampleMode === "weekly" && volumes) {
              const weeklyVols = new Array(resampled.dailyIndexMap.length);
              let prevIdx = -1;
              for (let k = 0; k < resampled.dailyIndexMap.length; k++) {
                const di = resampled.dailyIndexMap[k];
                let sum = 0;
                for (let j = prevIdx + 1; j <= di; j++) sum += volumes[j] || 0;
                weeklyVols[k] = sum;
                prevIdx = di;
              }
              volumes = weeklyVols;
            }
            prices = resampled.adjCloses;
            highs  = resampled.highs;
            lows   = resampled.lows;
            dates  = resampled.dates;
            globalIndices = dates.map((d: string) => dateIndexMap.get(d) ?? -1);
            const minLen = resampleMode === "weekly" ? 52 : 252;
            if (prices.length < minLen) continue;
          }
        } else {
          const ohlcv = await loadTickerData(tickerEntry.ticker, globalDates, inputSelection as any);
          if (!ohlcv || ohlcv.closes.length < 252) continue;
          const clipped = clipArraysByDateRange(ohlcv.priceDates, dateRange, ohlcv.closes, ohlcv.highs, ohlcv.lows, ohlcv.volumes);
          rawPrices = clipped.arrays[0];
          const clippedHighs = clipped.arrays[1];
          const clippedLows  = clipped.arrays[2];
          volumes   = clipped.arrays[3];
          const clippedDates = clipped.dates;
          if (rawPrices.length < 252) continue;

          const dateIndexMap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dateIndexMap.set(globalDates[i], i);

          if ((frequency as string) === "weekly_on_daily") {
            prices = rawPrices;
            highs  = clippedHighs;
            lows   = clippedLows;
            dates  = clippedDates;
            globalIndices = dates.map((d: string) => dateIndexMap.get(d) ?? -1);
            if (prices.length < 252) continue;
          } else {
            const resampled = weeklyDownsample({ dates: clippedDates, closes: rawPrices, adjCloses: rawPrices, highs: clippedHighs, lows: clippedLows }, resampleMode);
            resampledResult = resampled;
            if (resampleMode === "weekly" && volumes) {
              const weeklyVols = new Array(resampled.dailyIndexMap.length);
              let prevIdx = -1;
              for (let k = 0; k < resampled.dailyIndexMap.length; k++) {
                const di = resampled.dailyIndexMap[k];
                let sum = 0;
                for (let j = prevIdx + 1; j <= di; j++) sum += volumes[j] || 0;
                weeklyVols[k] = sum;
                prevIdx = di;
              }
              volumes = weeklyVols;
            }
            prices = resampled.adjCloses;
            highs  = resampled.highs;
            lows   = resampled.lows;
            dates  = resampled.dates;
            const dateMap2 = new Map<string, number>();
            for (let i = 0; i < globalDates.length; i++) dateMap2.set(globalDates[i], i);
            globalIndices = dates.map((d: string) => dateMap2.get(d) ?? -1);
            const minLen = resampleMode === "weekly" ? 52 : 252;
            if (prices.length < minLen) continue;
          }
        }

        // Compute indicator cache — for weekly_on_daily, compute on weekly-expanded version
        let indCache: IndicatorCache;
        if ((frequency as string) === "weekly_on_daily" && rawPrices !== null) {
          const weeklyResult = weeklyDownsample(rawPrices, dates) as any;
          const n = rawPrices.length;
          const weeklyCache = computeIndicators(weeklyResult.prices);
          const expandToDaily = (arr: (number | null)[]): (number | null)[] => {
            const filled = arr.map((v: number | null) => v === null ? NaN : v);
            return expandWeeklyToDailyFn(filled, weeklyResult.weekIndex, n).map((v: number) => Number.isFinite(v) ? v : null);
          };
          const expandToDailyRaw = (arr: number[]): number[] =>
            expandWeeklyToDailyFn(arr, weeklyResult.weekIndex, n);
          const expandedRsi = expandToDaily(weeklyCache.rsi14);
          const expandedRoc = new Map<number, number[]>();
          Array.from(weeklyCache.rocByPeriod.entries()).forEach(([p, arr]) => expandedRoc.set(p, expandToDailyRaw(arr)));
          const expandedSma = new Map<number, (number | null)[]>();
          Array.from(weeklyCache.smaByPeriod.entries()).forEach(([p, arr]) => expandedSma.set(p, expandToDaily(arr)));
          const expandedSlope = new Map<number, (number | null)[]>();
          Array.from(weeklyCache.slopeByPeriod.entries()).forEach(([p, arr]) => expandedSlope.set(p, expandToDaily(arr)));
          indCache = { rsi14: expandedRsi, rocByPeriod: expandedRoc, smaByPeriod: expandedSma, slopeByPeriod: expandedSlope };
        } else {
          indCache = computeIndicators(prices);
        }

        const activeTriggers = allTriggers.filter(tr => direction === "both" ? true : tr.direction === direction);
        const combos: ComboEntry[] = [];
        let totalTriggerCount = 0;

        // Helper: compute forward return profiles then summarize
        const getProfile = (sigIdx: number, dir: "buy" | "sell") => {
          if (resampleMode === "weekly" && resampledResult !== null && rawPrices !== null) {
            const dailyIdx = getDailyIndexFromWeekly(sigIdx, resampledResult);
            if (dailyIdx < 0) return null;
            return (computeForwardProfile as any)(rawPrices, dailyIdx, targetReturn, dir, null, minHold);
          }
          return (computeForwardProfile as any)(rawPrices !== null ? rawPrices : prices, sigIdx, targetReturn, dir, null, minHold);
        };

        for (const trigger of activeTriggers) {
          const signalIndices = detectTriggerSignals(trigger, prices, indCache);
          if (signalIndices.length === 0) continue;
          totalTriggerCount += signalIndices.length;

          const evalCombo = (indices: number[], filterLabels: string[]): ComboEntry | null => {
            if (indices.length < minSignals) return null;
            const profiles = indices
              .map(i => getProfile(i, trigger.direction === "buy" ? "buy" : "sell"))
              .filter(p => p !== null && p.returns[horizon] !== null);
            if (profiles.length < minSignals) return null;
            const summary = summarizeSignals(profiles, trigger.direction === "buy" ? "buy" : "sell");
            return {
              triggerLabel: trigger.label,
              triggerKind: trigger.kind,
              direction: trigger.direction,
              filterLabels,
              summary,
              baselineHitRate: 0, // filled below
              baselineCount: 0,
              signalIndices: indices,
              profiles,
            };
          };

          // Baseline (no filters)
          const baseEntry = evalCombo(signalIndices, []);
          const baseHitRate  = baseEntry ? baseEntry.summary.hitRate[horizon] ?? 0 : 0;
          const baseCount    = baseEntry ? baseEntry.summary.count : 0;

          if (baseEntry) {
            baseEntry.baselineHitRate = baseHitRate;
            baseEntry.baselineCount   = baseCount;
            combos.push(baseEntry);
          }

          // 1-filter combos
          if (maxFilters >= 1) {
            for (let fi = 0; fi < allFilters.length; fi++) {
              const filt = allFilters[fi];
              const filtered1 = signalIndices.filter(i => evalFilterCondition(filt, i, prices, indCache) === true);
              const entry1 = evalCombo(filtered1, [filt.label]);
              if (entry1) { entry1.baselineHitRate = baseHitRate; entry1.baselineCount = baseCount; combos.push(entry1); }
            }
          }

          // 2-filter combos
          if (maxFilters >= 2) {
            for (let fi = 0; fi < allFilters.length; fi++) {
              const filt1 = allFilters[fi];
              const filtered1 = signalIndices.filter(i => evalFilterCondition(filt1, i, prices, indCache) === true);
              if (filtered1.length < minSignals) continue;
              for (let fj = fi + 1; fj < allFilters.length; fj++) {
                const filt2 = allFilters[fj];
                const filtered2 = filtered1.filter(i => evalFilterCondition(filt2, i, prices, indCache) === true);
                const entry2 = evalCombo(filtered2, [filt1.label, filt2.label]);
                if (entry2) { entry2.baselineHitRate = baseHitRate; entry2.baselineCount = baseCount; combos.push(entry2); }
              }
            }
          }
        }

        if (combos.length === 0) continue;

        const minLiftFraction = minLift / 100;
        const qualified = combos.filter(c =>
          c.filterLabels.length === 0
            ? true
            : (c.summary.hitRate[horizon] ?? 0) - c.baselineHitRate >= minLiftFraction
        );
        qualified.sort((a, b) => compareSummaries(a.summary, 0, b.summary, 0, a.direction, scoreWeights));
        const topCombos = qualified.slice(0, topN);
        const bestHitRate = topCombos.length > 0 ? (pickBestByRankMode as any)(topCombos[0].summary, 0, topCombos[0].direction, scoreWeights) : 0;

        const priceContext: PriceContext = {
          prices,
          highs,
          lows,
          volumes,
          dates,
          globalIndices,
          benchmarkPrices: null,
          mode: runMode === "pair" || runMode === "pairCombo" ? "pair" : "single",
          pairLegA: runMode === "pair" || runMode === "pairCombo" ? pairA : undefined,
          pairLegB: runMode === "pair" || runMode === "pairCombo" ? pairB : undefined,
        };

        accumulated.push({
          ticker: tickerEntry.ticker,
          name: tickerEntry.name,
          topCombos,
          bestHitRate,
          triggerCount: totalTriggerCount,
          priceContext,
        });

        if (idx % 3 === 0 || idx === tickerList.length - 1) setResults([...accumulated]);
      } catch { /* skip ticker on error */ }
    }

    setResults(accumulated);
    setRunning(false);
  }, [filteredAllTickers, selectedTicker, pairTickerA, pairTickerB, runMode, direction, horizon,
      targetReturn, pairCombo.pairs, minSignals, minLift, minHold, maxFilters, topN, allTriggers,
      allFilters, frequency, scoreWeights, dateRange, basketTickers, basketMode, baskets]);

  // ─── Evaluate Mode ──────────────────────────────────────────────────────────
  const handleEvaluate = useCallback(async () => {
    setEvaluating(true);
    setEvalResult(null);
    setEvalPriceCtx(null);
    try {
      const trigger = allTriggers.find(t => t.label === evalTriggerKey);
      if (!trigger) { setEvaluating(false); return; }

      const globalDates = await getDates();
      let prices: number[], highs: number[], lows: number[], dates: string[];
      let volumes: number[] | null = null;
      let globalIndices: number[];

      if (runMode === "pair") {
        if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) { setEvaluating(false); return; }
        const pairData = await getYahooPairsRatio(pairTickerA, pairTickerB, globalDates);
        if (!pairData || pairData.indices.length < 252) { setEvaluating(false); return; }
        const pairDates = pairData.indices.map((i: number) => globalDates[i] ?? "");
        const pairIndices = pairData.indices.slice();
        const clipped = clipArraysByDateRange(pairDates, dateRange, pairData.prices, pairIndices);
        const clippedPrices = clipped.arrays[0];
        const clippedIndices = clipped.arrays[1];
        if (clippedPrices.length < 252) { setEvaluating(false); return; }
        prices = clippedPrices;
        highs  = prices.slice();
        lows   = prices.slice();
        dates  = clipped.dates;
        globalIndices = clippedIndices;
      } else if (runMode === "basket") {
        if (basketTickers.length === 0) { setEvaluating(false); return; }
        if (basketMode === "combined") {
          const basket = buildBasketOhlc(basketTickers, baskets);
          const basketData = await getBasketOhlc(basket, dateRange);
          if (!basketData || basketData.closes.length < 252) { setEvaluating(false); return; }
          prices = basketData.closes;
          highs  = basketData.highs;
          lows   = basketData.lows;
          volumes = basketData.volumes;
          const dateIndexMap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dateIndexMap.set(globalDates[i], i);
          globalIndices = basketData.priceDates.map((d: string) => dateIndexMap.get(d) ?? -1);
          dates = basketData.priceDates;
        } else {
          const firstTicker = basketTickers[0];
          const ohlcv = await loadTickerData(firstTicker, globalDates, inputSelection as any);
          if (!ohlcv || ohlcv.closes.length < 252) { setEvaluating(false); return; }
          const clipped = clipArraysByDateRange(ohlcv.priceDates, dateRange, ohlcv.closes, ohlcv.highs, ohlcv.lows, ohlcv.volumes);
          if (clipped.arrays[0].length < 252) { setEvaluating(false); return; }
          prices = clipped.arrays[0]; highs = clipped.arrays[1]; lows = clipped.arrays[2]; volumes = clipped.arrays[3];
          dates  = clipped.dates;
          const dateIndexMap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dateIndexMap.set(globalDates[i], i);
          globalIndices = dates.map((d: string) => dateIndexMap.get(d) ?? -1);
        }
      } else {
        const ticker = runMode === "single" ? selectedTicker : filteredAllTickers[0]?.ticker ?? "";
        if (!ticker) { setEvaluating(false); return; }
        const ohlcv = await loadTickerData(ticker, globalDates, inputSelection as any);
        if (!ohlcv || ohlcv.closes.length < 252) { setEvaluating(false); return; }
        const clipped = clipArraysByDateRange(ohlcv.priceDates, dateRange, ohlcv.closes, ohlcv.highs, ohlcv.lows, ohlcv.volumes);
        if (clipped.arrays[0].length < 252) { setEvaluating(false); return; }
        prices = clipped.arrays[0]; highs = clipped.arrays[1]; lows = clipped.arrays[2]; volumes = clipped.arrays[3];
        dates  = clipped.dates;
        const dateIndexMap = new Map<string, number>();
        for (let i = 0; i < globalDates.length; i++) dateIndexMap.set(globalDates[i], i);
        globalIndices = dates.map((d: string) => dateIndexMap.get(d) ?? -1);
      }

      // Resample if weekly
      let workPrices = prices, workHighs = highs, workLows = lows, workVolumes = volumes;
      let workGlobalIndices = globalIndices;
      if (frequency === "weekly") {
        const resampled = weeklyDownsample({ dates, closes: prices, adjCloses: prices, highs, lows }, "weekly");
        workPrices = resampled.adjCloses;
        workHighs  = resampled.highs;
        workLows   = resampled.lows;
        workGlobalIndices = resampled.dailyIndexMap.map((di: number) => globalIndices[di] ?? -1);
        dates = resampled.dates;
        if (volumes) {
          const weeklyVols = new Array(resampled.dailyIndexMap.length);
          let prevIdx = -1;
          for (let k = 0; k < resampled.dailyIndexMap.length; k++) {
            const di = resampled.dailyIndexMap[k];
            let sum = 0;
            for (let j = prevIdx + 1; j <= di; j++) sum += volumes[j] || 0;
            weeklyVols[k] = sum;
            prevIdx = di;
          }
          workVolumes = weeklyVols;
        }
      }

      const indCache = computeIndicators(workPrices);
      const signalIndices = detectTriggerSignals(trigger, workPrices, indCache);
      const activeFilters = allFilters.filter(f => evalFilterKeys.includes(f.label));
      const filteredIndices: number[] = [];
      for (const si of signalIndices) {
        let pass = true;
        for (const filt of activeFilters) {
          if (evalFilterCondition(filt, si, workPrices, indCache) !== true) { pass = false; break; }
        }
        if (pass) filteredIndices.push(si);
      }

      const evalResult = evaluateSignals(workPrices, dates, filteredIndices, evalDirection === "long" ? "buy" : "sell", targetReturn, minHold, null, horizon);
      setEvalResult(evalResult);
      setEvalPriceCtx({
        prices: workPrices, highs: workHighs, lows: workLows, volumes: workVolumes,
        dates, globalIndices: workGlobalIndices, benchmarkPrices: null,
        mode: runMode === "pair" ? "pair" : "single",
        pairLegA: runMode === "pair" ? pairTickerA : undefined,
        pairLegB: runMode === "pair" ? pairTickerB : undefined,
      });
    } finally {
      setEvaluating(false);
    }
  }, [allTriggers, allFilters, evalTriggerKey, evalFilterKeys, evalDirection, runMode, selectedTicker,
      pairTickerA, pairTickerB, filteredAllTickers, targetReturn, minHold, horizon, frequency,
      dateRange, basketTickers, basketMode, baskets]);

  // Auto-select first trigger
  useEffect(() => {
    if (!evalTriggerKey && allTriggers.length > 0) {
      setEvalTriggerKey(allTriggers[0].label);
    }
  }, [allTriggers, evalTriggerKey]);

  // Computed display label for evaluate mode
  const evalSetupLabel = useMemo(() => {
    const trigger = allTriggers.find(t => t.label === evalTriggerKey);
    if (!trigger) return "";
    const filterStr = evalFilterKeys.length > 0 ? " ∧ " + evalFilterKeys.join(" ∧ ") : "";
    return `${trigger.label}${filterStr} [${evalDirection}]`;
  }, [evalTriggerKey, evalFilterKeys, evalDirection, allTriggers]);

  // Direction mismatch warning
  const directionMismatch = useMemo(() => {
    const trigger = allTriggers.find(t => t.label === evalTriggerKey);
    if (!trigger) return null;
    const natural = trigger.direction === "buy" ? "long" : "short";
    return natural !== evalDirection ? {
      triggerLabel: trigger.label,
      triggerDir: trigger.direction,
      expected: natural,
      chosen: evalDirection,
    } : null;
  }, [evalTriggerKey, evalDirection, allTriggers]);

  const tickerLabel = useMemo(
    () => runMode === "pair" ? `${pairTickerA || "A"}/${pairTickerB || "B"}` :
          runMode === "single" ? selectedTicker || "—" :
          filteredAllTickers[0]?.ticker || "—",
    [runMode, pairTickerA, pairTickerB, selectedTicker, filteredAllTickers]
  );

  // Filtered + sorted results
  const displayResults = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const filtered = q
      ? results.filter(r => r.ticker.toLowerCase().includes(q) || (r.name && r.name.toLowerCase().includes(q)))
      : [...results];
    filtered.sort((a, b) => {
      const ca = a.topCombos[0], cb = b.topCombos[0];
      if (!ca && !cb) return 0;
      if (!ca) return 1;
      if (!cb) return -1;
      return compareSummaries(ca.summary, 0, cb.summary, 0, ca.direction, scoreWeights);
    });
    return filtered;
  }, [results, filterText, scoreWeights]);

  // CSV export
  const handleExportCSV = () => {
    const rows: Record<string, any>[] = [];
    for (const res of displayResults) {
      for (const combo of res.topCombos) {
        rows.push({
          ticker: res.ticker,
          name: res.name,
          trigger: combo.triggerLabel,
          direction: combo.direction,
          filters: combo.filterLabels.join(" & ") || "(none)",
          n: combo.summary.count,
          hitRate: combo.summary.hitRate[horizon] ?? null,
          baselineHitRate: combo.baselineHitRate,
          lift: (combo.summary.hitRate[horizon] ?? 0) - combo.baselineHitRate,
          baselineN: combo.baselineCount,
          avgReturn: combo.summary.avgReturn[horizon] ?? null,
          profitFactor: combo.summary.profitFactor[horizon] ?? null,
        });
      }
    }
    const cols = Object.keys(rows[0] || {});
    const csv  = [cols.join(","), ...rows.map(r => cols.map(c => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "combo_optimizer.csv";
    a.click();
  };

  // Lift color
  const liftColor = (lift: number) =>
    lift >= 0.10 ? "text-emerald-400 font-bold" :
    lift >= 0.05 ? "text-emerald-400" :
    lift >= 0.02 ? "text-emerald-500/80" :
    lift > 0     ? "text-foreground" :
    lift > -0.02 ? "text-muted-foreground" :
                   "text-red-400";

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top header bar */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-foreground tracking-tight">Combo</h2>

        {/* View toggle */}
        <div className="flex gap-px">
          <button
            data-testid="combo-view-optimize"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${view === "optimize" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setView("optimize")}
          >Optimize</button>
          <button
            data-testid="combo-view-evaluate"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${view === "evaluate" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setView("evaluate")}
          >Evaluate</button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {view === "optimize" ? "Search trigger+filter patterns by hit rate" : "Score one specific trigger+filter setup"}
        </span>

        {/* Date range */}
        <div className="flex items-center gap-1">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
          <div className="flex items-center gap-0.5">
            {(DATE_PRESETS as any[]).map((p: any) => (
              <button
                key={p.value}
                data-testid={`combo-date-preset-${p.value}`}
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === p.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}
                onClick={() => { setDatePreset(p.value); setDateRange(createDateRangeFromPreset(p.value) as any); }}
              >{p.label}</button>
            ))}
          </div>
          <input
            type="date"
            data-testid="combo-date-start"
            value={dateRange.start}
            onChange={e => { setDatePreset("custom"); setDateRange({ ...dateRange, start: e.target.value }); }}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
          />
          <span className="text-[10px] font-mono text-muted-foreground">→</span>
          <input
            type="date"
            data-testid="combo-date-end"
            value={dateRange.end}
            onChange={e => { setDatePreset("custom"); setDateRange({ ...dateRange, end: e.target.value }); }}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
          />
        </div>
      </div>

      {/* ── OPTIMIZE VIEW ──────────────────────────────────────────────────── */}
      {view === "optimize" ? (
        <>
          <PresetBar kind="combo" captureInputs={captureInputsForPreset} applyInputs={applyInputs} />

          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Title + Yahoo badge + refresh */}
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground">Find Trigger + Filter patterns that maximize hit rate</p>
                <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  Yahoo Finance
                </span>
                {lastRefreshTime && (
                  <span className="text-[9px] font-mono text-muted-foreground">
                    {Math.round((Date.now() - lastRefreshTime) / 60000)}m ago
                  </span>
                )}
                <button
                  onClick={async () => {
                    if (selectedTicker) {
                      setIsRefreshing(true);
                      try {
                        await refreshTickerData(selectedTicker);
                        setLastRefreshTime(Date.now());
                      } catch {} finally {
                        setIsRefreshing(false);
                      }
                    }
                  }}
                  disabled={isRefreshing}
                  title="Force refresh Yahoo price cache"
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >{isRefreshing ? "…" : "↻"}</button>
              </div>

              {/* Mode */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  {(["single", "universe", "pair", "pairCombo", "basket"] as const).map(m => (
                    <button
                      key={m}
                      data-testid={`combo-mode-${m}`}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${runMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setRunMode(m)}
                      disabled={running}
                    >{m === "pairCombo" ? "Pair Combo" : m.charAt(0).toUpperCase() + m.slice(1)}</button>
                  ))}
                </div>
              </div>

              {/* Frequency (not pair modes) */}
              {runMode !== "pair" && runMode !== "pairCombo" && frequencyUI}

              {/* Pair Combo leg set */}
              {runMode === "pairCombo" && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Pair Combo — Leg Set</label>
                  {pairCombo.ui}
                </div>
              )}

              {/* Universe class filter */}
              {runMode === "universe" && classFilter.classFilterUI && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Classification Filter</label>
                  {classFilter.universeSourceUI}
                  {classFilter.classFilterUI}
                </div>
              )}

              {/* Single mode: ticker + basket pill */}
              {runMode === "single" && (
                <div className="flex items-end gap-2">
                  <div className="flex items-end gap-2">
                    <div className={isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                      <UnifiedTickerPicker
                        tickers={filteredAllTickers}
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
                        fallbackTicker={filteredAllTickers[0]?.ticker ?? null}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Pair mode: two tickers */}
              {runMode === "pair" && (
                <>
                  <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerA} onChange={setPairTickerA} disabled={running} label="Ticker A" />
                  <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerB} onChange={setPairTickerB} disabled={running} label="Ticker B" />
                  <div className="flex flex-col gap-0.5 justify-end pb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Ratio: <span className="text-foreground font-bold">{pairTickerA || "A"}/{pairTickerB || "B"}</span>
                    </span>
                  </div>
                </>
              )}

              {/* Basket mode */}
              {runMode === "basket" && (
                <div className="flex flex-col gap-2">
                  <BasketPicker
                    tickers={filteredAllTickers}
                    value={basketTickers}
                    onChange={setBasketTickers}
                    disabled={running}
                    testIdPrefix="combo-basket"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket Run Mode</label>
                    <div className="flex gap-px" data-testid="combo-basket-mode">
                      {(["stocks", "combined"] as const).map(m => (
                        <button
                          key={m}
                          data-testid={`combo-basket-mode-${m}`}
                          className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${basketMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                          onClick={() => setBasketMode(m)}
                          disabled={running}
                          title={m === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme"}
                        >{m === "stocks" ? "Stock by Stock" : "Combined"}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Input series (single mode only) */}
              {runMode === "single" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                  <InputSeriesPicker value={inputSelection} onChange={setInputSelection} family="combo" label="" disabled={running} />
                </div>
              )}

              {/* Direction */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Direction</label>
                <div className="flex gap-px">
                  {(["both", "buy", "sell"] as const).map(d => (
                    <button
                      key={d}
                      data-testid={`combo-dir-${d}`}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${direction === d ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setDirection(d)}
                      disabled={running}
                    >{d === "both" ? "Both" : d === "buy" ? "Buy" : "Sell"}</button>
                  ))}
                </div>
              </div>

              {/* Horizon */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Horizon</label>
                <div className="flex gap-px">
                  {(["1M", "2M", "3M", "6M"] as const).map(h => (
                    <button
                      key={h}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${horizon === h ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setHorizon(h)}
                      disabled={running}
                    >{h}</button>
                  ))}
                </div>
              </div>

              {/* Target % */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target %</label>
                <input
                  type="number" step="0.5" min={0.5} max={50}
                  data-testid="combo-target"
                  className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-16"
                  value={(targetReturn * 100).toFixed(1)}
                  onChange={e => setTargetReturn(Math.max(0.005, Math.min(0.5, Number(e.target.value) / 100 || 0.05)))}
                  disabled={running}
                  title="Hit threshold: peak (or trough for sell signals) must reach this %"
                />
              </div>

              {/* Max Filters */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Max Filters</label>
                <div className="flex gap-px">
                  {([0, 1, 2] as const).map(n => (
                    <button
                      key={n}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${maxFilters === n ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setMaxFilters(n)}
                      disabled={running}
                      title={n === 0 ? "Trigger alone (baseline only)" : `Up to ${n} AND-combined filters`}
                    >{n}</button>
                  ))}
                </div>
              </div>

              {/* Min N */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min N</label>
                <input
                  type="number" step="1" min={1} max={500}
                  data-testid="combo-min-n"
                  className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14"
                  value={minSignals}
                  onChange={e => setMinSignals(Math.max(1, Math.min(500, Math.floor(Number(e.target.value) || 1))))}
                  disabled={running}
                  title="Minimum sample size — combos with fewer signals are discarded"
                />
              </div>

              {/* Min Lift % */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min Lift %</label>
                <input
                  type="number" step="1" min={-100} max={100}
                  data-testid="combo-min-lift"
                  className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14"
                  value={minLift}
                  onChange={e => setMinLift(Number(e.target.value) || 0)}
                  disabled={running}
                  title="Minimum improvement (in percentage points) over the trigger's baseline hit rate. 0 = keep all combos. 5 = only show combos that lift hit rate by ≥ 5pp."
                />
              </div>

              {/* Min Hold */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min Hold</label>
                <input
                  type="number" step="1" min={0} max={60}
                  className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14"
                  value={minHold}
                  onChange={e => setMinHold(Math.max(0, Math.min(60, Math.floor(Number(e.target.value) || 0))))}
                  disabled={running}
                  title="Minimum holding days before hit detection starts"
                />
              </div>

              {/* Top N */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Top N</label>
                <input
                  type="number" step="1" min={1} max={50}
                  className="text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14"
                  value={topN}
                  onChange={e => setTopN(Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 10))))}
                  disabled={running}
                  title="Show only the top N combos per ticker"
                />
              </div>

              {/* Run / Cancel */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"> </label>
                {running ? (
                  <button
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500"
                    onClick={() => { cancelRef.current = true; }}
                  >Cancel ({progress.current}/{progress.total})</button>
                ) : (
                  <button
                    data-testid="combo-run"
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={handleRun}
                  >Run Optimizer</button>
                )}
              </div>
            </div>

            {/* Summary stats */}
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground mt-2">
              <span>Triggers: <span className="text-foreground">{allTriggers.filter(t => direction === "both" || t.direction === direction).length}</span></span>
              <span>Filters: <span className="text-foreground">{allFilters.length}</span></span>
              <span>Combos/trigger: <span className="text-foreground">
                {maxFilters === 0 ? 1 : maxFilters === 1 ? 1 + allFilters.length : 1 + allFilters.length + allFilters.length * (allFilters.length - 1) / 2}
              </span></span>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto p-4">
            {results.length === 0 && !running && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm font-mono">
                Press <span className="px-2 mx-1 bg-primary text-primary-foreground rounded font-bold">Run Optimizer</span> to search for high-hit-rate trigger + filter patterns.
              </div>
            )}
            {results.length > 0 && (
              <>
                {/* Filter + rank + export */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Filter ticker..."
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                    className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[180px] focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {filterText && (
                    <button onClick={() => setFilterText("")} className="text-[10px] font-mono px-2 py-1 rounded border border-border bg-background text-muted-foreground hover:text-foreground">Clear</button>
                  )}
                  <span className="text-[10px] font-mono text-muted-foreground">{displayResults.length} ticker{displayResults.length !== 1 ? "s" : ""}</span>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] font-mono text-muted-foreground">RANK BY</label>
                    <select
                      data-testid="combo-rank-by"
                      value={rankBy}
                      onChange={e => setRankBy(e.target.value)}
                      className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5"
                    >
                      {(RANK_BY_OPTIONS as any[]).map((opt: any) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px] ml-auto" onClick={handleExportCSV}>
                    <Download className="w-3 h-3" /> CSV
                  </Button>
                </div>

                {/* Results table */}
                <div className="border border-border rounded mb-4">
                  <table className="w-full text-[10px] font-mono">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-card text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">
                        <th className="text-left px-2 py-1 font-bold sticky left-0 bg-card z-30 border-r border-border">Ticker</th>
                        <th className="text-left px-2 py-1 font-bold bg-card">Trigger</th>
                        <th className="text-left px-2 py-1 font-bold bg-card">Filters</th>
                        <th className="text-center px-2 py-1 font-bold bg-card">Dir</th>
                        <th className="text-center px-2 py-1 font-bold bg-card">N</th>
                        <th className="text-center px-2 py-1 font-bold bg-card">Hit {horizon}</th>
                        <th className="text-center px-2 py-1 font-bold bg-card" title="Trigger-alone hit rate">Base {horizon}</th>
                        <th className="text-center px-2 py-1 font-bold bg-card" title="Hit rate improvement over baseline">Lift</th>
                        <th className="text-center px-2 py-1 font-bold bg-card">Avg {horizon}</th>
                        <th className="text-center px-2 py-1 font-bold bg-card">PF {horizon}</th>
                        <th className="text-center px-2 py-1 font-bold bg-card" title="Hit Conditions — profile what other indicators looked like at hit-bars vs miss-bars">HC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayResults.map(tickerResult => {
                        const expanded = expandedTicker === tickerResult.ticker;
                        return (expanded ? tickerResult.topCombos : tickerResult.topCombos.slice(0, 1)).flatMap((combo, comboIdx) => {
                          const hitRate  = combo.summary.hitRate[horizon] ?? 0;
                          const lift     = hitRate - combo.baselineHitRate;
                          const avgRet   = combo.summary.avgReturn[horizon] ?? 0;
                          const pf       = combo.summary.profitFactor[horizon] ?? 0;
                          const isFirst  = comboIdx === 0;
                          const rowBg    = combo.direction === "buy" ? "bg-emerald-600/5 hover:bg-emerald-600/10" : "bg-red-600/5 hover:bg-red-600/10";
                          const hcKey    = `${tickerResult.ticker}::${comboIdx}::${combo.triggerLabel}::${combo.filterLabels.join("|")}`;
                          const hcExpanded = expandedHCKeys.has(hcKey);
                          const canShowHC = !!(expanded && combo.profiles && combo.profiles.length >= 10 && tickerResult.priceContext);

                          const rows = [
                            <tr
                              key={`${tickerResult.ticker}-${comboIdx}`}
                              className={`${rowBg} cursor-pointer ${isFirst ? "border-t border-border" : "border-t border-border/30"}`}
                              onClick={() => setExpandedTicker(expanded ? null : tickerResult.ticker)}
                            >
                              <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border">
                                {isFirst ? (
                                  <span className="flex items-center gap-1">
                                    <span className="text-muted-foreground/60">{expanded ? "▼" : "▶"}</span>
                                    {tickerResult.ticker}
                                  </span>
                                ) : ""}
                              </td>
                              <td className="text-left px-2 py-1 text-foreground">{combo.triggerLabel}</td>
                              <td className="text-left px-2 py-1 text-muted-foreground">
                                {combo.filterLabels.length === 0
                                  ? <span className="italic text-muted-foreground/60">(trigger alone)</span>
                                  : combo.filterLabels.join(" & ")}
                              </td>
                              <td className="text-center px-2 py-1">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${combo.direction === "buy" ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" : "bg-red-600/20 text-red-400 border-red-600/30"}`}>
                                  {combo.direction === "buy" ? "Buy" : "Sell"}
                                </span>
                              </td>
                              <td className="text-center px-2 py-1 text-muted-foreground tabular-nums">{combo.summary.count}</td>
                              <td className={`text-center px-2 py-1 ${hitRateColor(hitRate)}`}>{pct(hitRate)}</td>
                              <td className="text-center px-2 py-1 text-muted-foreground tabular-nums">{pct(combo.baselineHitRate)}</td>
                              <td className={`text-center px-2 py-1 tabular-nums ${liftColor(lift)}`}>{pctSigned(lift)}</td>
                              <td className={`text-center px-2 py-1 tabular-nums ${avgRet >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(avgRet)}</td>
                              <td className={`text-center px-2 py-1 tabular-nums ${profitFactorColor(pf)}`}>
                                {pf >= 99 ? "∞" : pf.toFixed(2)}
                              </td>
                              <td className="text-center px-2 py-1" onClick={e => e.stopPropagation()}>
                                {canShowHC ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleHCKey(hcKey)}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${hcExpanded ? "bg-violet-500/25 text-violet-200 border-violet-400/40" : "bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`}
                                    title="Profile what other indicators looked like at hit-bars vs miss-bars"
                                  >{hcExpanded ? "▾" : "▸"}</button>
                                ) : null}
                              </td>
                            </tr>,
                          ];

                          if (hcExpanded && canShowHC && combo.profiles && tickerResult.priceContext) {
                            rows.push(
                              <tr key={`${tickerResult.ticker}-${comboIdx}-hc`} className="border-t border-border/30">
                                <td colSpan={11} className="px-3 py-2 bg-card/30">
                                  <HitConditionsPanel
                                    ticker={tickerResult.priceContext.mode === "pair" && tickerResult.priceContext.pairLegA ? tickerResult.priceContext.pairLegA : tickerResult.ticker}
                                    priceContext={tickerResult.priceContext}
                                    signals={combo.profiles}
                                    direction={combo.direction}
                                    title={`${combo.triggerLabel}${combo.filterLabels.length > 0 ? " + " + combo.filterLabels.join(" & ") : " (trigger alone)"}`}
                                    useBand={false}
                                  />
                                </td>
                              </tr>
                            );
                          }

                          return rows;
                        });
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="text-[10px] font-mono text-muted-foreground/70 italic">
                  Click a row to expand all top {topN} combos for that ticker. Lift = combo hit rate − trigger-alone hit rate.
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* ── EVALUATE VIEW ─────────────────────────────────────────────────── */
        <>
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-start gap-4 flex-wrap">
              {/* Mode (single + pair only in evaluate) */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${runMode === "single" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setRunMode("single")}
                  >Single</button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${runMode === "pair" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setRunMode("pair")}
                  >Pair</button>
                </div>
              </div>

              {runMode === "single" && (
                <div className="flex items-end gap-2">
                  <div className={isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                    <UnifiedTickerPicker
                      tickers={filteredAllTickers}
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
                      fallbackTicker={filteredAllTickers[0]?.ticker ?? null}
                    />
                  </div>
                </div>
              )}

              {runMode === "pair" && (
                <>
                  <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerA} onChange={setPairTickerA} label="Ticker A" />
                  <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerB} onChange={setPairTickerB} label="Ticker B" />
                </>
              )}

              {runMode === "single" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                  <InputSeriesPicker value={inputSelection} onChange={setInputSelection} family="combo" label="" />
                </div>
              )}

              {/* Side */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Side</label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalDirection === "long" ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setEvalDirection("long")}
                  >Long</button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalDirection === "short" ? "bg-red-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setEvalDirection("short")}
                  >Short</button>
                </div>
              </div>

              {/* Trigger select */}
              <div className="flex flex-col gap-0.5 min-w-[180px]">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Trigger</label>
                <select
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground"
                  value={evalTriggerKey}
                  onChange={e => setEvalTriggerKey(e.target.value)}
                >
                  {allTriggers.map(t => (
                    <option key={t.label} value={t.label}>{t.label} ({t.direction})</option>
                  ))}
                </select>
              </div>

              {/* Target % */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target %</label>
                <input
                  type="number" step={0.5} min={0.5}
                  value={+(targetReturn * 100).toFixed(4)}
                  onChange={e => setTargetReturn((parseFloat(e.target.value) || 5) / 100)}
                  title="Hit-rate threshold in percent. 5 = 5%."
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
                />
              </div>

              {/* Hold */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Hold</label>
                <input
                  type="number" step={1} min={0}
                  value={minHold}
                  onChange={e => setMinHold(parseInt(e.target.value) || 0)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                />
              </div>

              {/* Horizon */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Horizon</label>
                <div className="flex gap-px">
                  {(["1M", "2M", "3M", "6M"] as const).map(h => (
                    <button
                      key={h}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${horizon === h ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setHorizon(h)}
                    >{h}</button>
                  ))}
                </div>
              </div>

              {/* Evaluate button */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"> </label>
                <button
                  data-testid="combo-eval-run"
                  className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={handleEvaluate}
                  disabled={evaluating}
                >{evaluating ? "Evaluating…" : "Evaluate"}</button>
              </div>
            </div>

            {/* Filter chips */}
            <div className="mt-2">
              <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1">Filters (AND-conjoined; click to toggle)</div>
              <div className="flex flex-wrap gap-1">
                {allFilters.map(f => {
                  const active = evalFilterKeys.includes(f.label);
                  return (
                    <button
                      key={f.label}
                      onClick={() => setEvalFilterKeys(prev => active ? prev.filter(k => k !== f.label) : [...prev, f.label])}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${active ? "bg-amber-500/20 border-amber-500/50 text-amber-200" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}
                    >{f.label}</button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Evaluate results */}
          <div className="flex-1 overflow-auto p-4">
            {directionMismatch && (
              <div className="mb-3 px-3 py-2 rounded border border-amber-500/50 bg-amber-500/10 text-amber-200 text-[11px] font-mono">
                <span className="font-bold">Direction mismatch:</span> trigger "{directionMismatch.triggerLabel}" is a{" "}
                <span className="uppercase">{directionMismatch.triggerDir}</span>-side event (typically traded {directionMismatch.expected}){" "}
                but you are scoring it as <span className="uppercase">{directionMismatch.chosen}</span>.{" "}
                Results will reflect that fade. Switch Side to <span className="font-bold uppercase">{directionMismatch.expected}</span> to score in the trigger's natural direction.
              </div>
            )}

            <EvaluatorResultPanel result={evalResult} loading={evaluating} setupLabel={evalSetupLabel} tickerLabel={tickerLabel} />

            {evalResult && evalPriceCtx && evalResult.profiles.length >= 10 ? (
              <HitConditionsPanel
                ticker={evalPriceCtx.mode === "pair" ? evalPriceCtx.pairLegA || "" : selectedTicker || filteredAllTickers[0]?.ticker || ""}
                priceContext={evalPriceCtx}
                signals={evalResult.profiles}
                direction={evalDirection === "long" ? "buy" : "sell"}
                title={`Hit Conditions — ${evalSetupLabel} on ${tickerLabel}`}
                useBand={false}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
