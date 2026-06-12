// Reconstructed from recovered-bundle/TVAOptimizer-D4A65F3C.js on 2026-06-11
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  getScoreWeights,
  createDateRangeFromPreset,
  DATE_PRESETS,
  summarizeSignals,
  computeCompositeScore,
  computeForwardProfile,
  pickBestByRankMode,
  hitRateColor,
  pctSigned,
  scoreTextColor,
  scoreBackgroundColor,
  FORWARD_HORIZONS,
  defaultInputSelection,
  isBasketTicker,
  RANK_BY_OPTIONS,
} from "@/lib/forwardReturns";
import { createDateRange } from "@/lib/optimizerInputSeries";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/useBaskets";
import { getTickers, getDates, getTickerRaw, filterByDateRange } from "@/lib/dataService";
import { getDailyIndexFromWeekly } from "@/lib/getDailyIndexFromWeekly";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { buildBasketOhlc, getBasketOhlc } from "@/lib/basketOhlc";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { BasketTickerPill } from "@/components/BasketTickerPill";
import { BasketPicker } from "@/components/BasketPicker";
import { InputSeriesPicker } from "@/components/InputSeriesPicker";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as React from "react";
import "@/lib/harsi";
import "@/lib/tva";
import { buildBacktestResult as buildEvalResult, EvaluatorPanelResult, EvaluatorPanelLoader as HitConditionsPanel } from "@/components/EvaluatorPanel";
const EvalResultPanel = EvaluatorPanelResult;

// tva compute function — loaded as side-effect from @/lib/tva
const computeTva = ((globalThis as any).__computeTva ?? ((_p: any, _v: any, _l: any, _s: any, _m: any) => ({ os: [], bullPressure: [], bearPressure: [], a: [], b: [] }))) as any;

// ── Constants ──────────────────────────────────────────────────────────────────

const SIGNAL_TYPES = [
  {
    key: "regime",
    label: "Regime Flip",
    description: "os crosses 0 (WMA-SMA trend oscillator)",
  },
  {
    key: "threshold_cross",
    label: "Threshold Cross",
    description: "bull/bear pressure crosses k × |envelope|",
  },
  {
    key: "divergence",
    label: "Bull / Bear Divergence",
    description: "bullPressure crosses bearPressure",
  },
];

const LENGTH_OPTIONS = [10, 15, 20, 30, 50];
const SMO_OPTIONS = [3, 5, 10];
const MULT_OPTIONS = [3, 5, 7, 10];
const THRESHOLD_OPTIONS = [0.3, 0.5, 0.7, 0.9];
const MIN_HISTORY_DAILY = 252;
const MIN_HISTORY_WEEKLY = 52;
const MIN_SIGNALS = 5;
const TOP_N = 6;

// ── Types ──────────────────────────────────────────────────────────────────────

interface TvaParams {
  length: number;
  smo: number;
  mult: number;
  threshold: number;
  signalType: string;
}

interface TvaDirectionResult {
  direction: "long" | "short";
  summary: any;
  composite: any;
  profiles: any[];
}

interface TvaConfigResult {
  length: number;
  smo: number;
  mult: number;
  threshold: number;
  signalType: string;
  configLabel: string;
  directions: TvaDirectionResult[];
  bestDirection: "long" | "short";
  bestScore: number;
}

interface TvaPriceContext {
  prices: number[];
  highs: number[];
  lows: number[];
  volumes: number[] | null;
  dates: string[];
  globalIndices: number[];
  benchmarkPrices: null;
  mode: "single" | "pair";
  pairLegA?: string;
  pairLegB?: string;
}

interface TvaTickerResult {
  ticker: string;
  name: string;
  configs: TvaConfigResult[];
  bestConfigLabel: string;
  bestDirection: "long" | "short";
  bestScore: number;
  currentOs: number;
  currentBullP: number;
  currentBearP: number;
  priceContext: TvaPriceContext;
}

interface SkippedEntry {
  ticker: string;
  reason: string;
}

// ── Signal detection ───────────────────────────────────────────────────────────

function detectTvaSignals(prices: number[], volumes: number[], params: TvaParams) {
  const tva = (computeTva as any)(prices, volumes, params.length, params.smo, params.mult);
  const longIdx: number[] = [];
  const shortIdx: number[] = [];

  for (let x = Math.max(params.length, params.smo) + 1; x < prices.length; x++) {
    if (params.signalType === "regime") {
      const prev = tva.os[x - 1];
      const cur = tva.os[x];
      if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
      if (prev <= 0 && cur > 0) longIdx.push(x);
      else if (prev >= 0 && cur < 0) shortIdx.push(x);
    } else if (params.signalType === "threshold_cross") {
      const bPrev = tva.bullPressure[x - 1];
      const bCur = tva.bullPressure[x];
      const rPrev = tva.bearPressure[x - 1];
      const rCur = tva.bearPressure[x];
      const aPrev = tva.a[x - 1];
      const aCur = tva.a[x];
      const bPrev2 = tva.b[x - 1];
      const bCur2 = tva.b[x];
      if (!Number.isFinite(bPrev) || !Number.isFinite(bCur) || !Number.isFinite(aPrev) || !Number.isFinite(aCur)) continue;
      const threshBullPrev = Math.abs(aPrev) * params.threshold;
      const threshBullCur = Math.abs(aCur) * params.threshold;
      const threshBearPrev = Math.abs(bPrev2) * params.threshold;
      const threshBearCur = Math.abs(bCur2) * params.threshold;
      if (bPrev <= threshBullPrev && bCur > threshBullCur) longIdx.push(x);
      if (rPrev <= threshBearPrev && rCur > threshBearCur) shortIdx.push(x);
    } else if (params.signalType === "divergence") {
      const bPrev = tva.bullPressure[x - 1];
      const bCur = tva.bullPressure[x];
      const rPrev = tva.bearPressure[x - 1];
      const rCur = tva.bearPressure[x];
      if (!Number.isFinite(bPrev) || !Number.isFinite(bCur) || !Number.isFinite(rPrev) || !Number.isFinite(rCur)) continue;
      const diffPrev = bPrev - rPrev;
      const diffCur = bCur - rCur;
      if (diffPrev <= 0 && diffCur > 0) longIdx.push(x);
      else if (diffPrev >= 0 && diffCur < 0) shortIdx.push(x);
    }
  }

  const lastFinite = (arr: number[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (Number.isFinite(arr[i])) return arr[i];
    return NaN;
  };

  return {
    longIdx,
    shortIdx,
    currentOs: lastFinite(tva.os),
    currentBullP: lastFinite(tva.bullPressure),
    currentBearP: lastFinite(tva.bearPressure),
  };
}

function formatOsSignal(os: number | null | undefined): string {
  if (os == null || !Number.isFinite(os)) return "—";
  if (os > 0) return "BULL";
  if (os < 0) return "BEAR";
  return "FLAT";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TVAOptimizer() {
  const [allTickers, setAllTickers] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [runMode, setRunMode] = useState<"single" | "universe" | "pair" | "pairCombo" | "basket">("single");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = usePersistedState<"stocks" | "combined">("tva-basket-mode", "stocks");
  const { baskets } = useBaskets();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [inputSelection, setInputSelection] = usePersistedState<any>("tva-input-selection", defaultInputSelection);
  const [results, setResults] = usePersistedState<TvaTickerResult[]>("tva:results", []);
  const [skipped, setSkipped] = useState<SkippedEntry[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("score");
  const [rankBy, setRankBy] = useState("composite");
  const scoreWeights = useMemo(() => (getScoreWeights as any)(rankBy), [rankBy]);
  const [filterText, setFilterText] = useState("");
  const [expandedRows, setExpandedRows] = useState(new Set<string>());
  const toggleRow = useCallback((key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => (createDateRange as any)());
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [includeRegime, setIncludeRegime] = useState(true);
  const [includeThreshold, setIncludeThreshold] = useState(true);
  const [includeDivergence, setIncludeDivergence] = useState(true);
  const [view, setView] = useState<"optimize" | "evaluate">("optimize");
  const [evalSide, setEvalSide] = useState<"long" | "short">("long");
  const [evalResult, setEvalResult] = usePersistedState<any>("tva:evalResult", null);
  const [evalPriceCtx, setEvalPriceCtx] = useState<TvaPriceContext | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [signalType, setSignalType] = useState("regime");
  const [length, setLength] = useState(20);
  const [smo, setSmo] = useState(5);
  const [mult, setMult] = useState(5);
  const [threshold, setThreshold] = useState(0.5);
  const [minHold, setMinHold] = useState(0);

  const cancelRef = useRef(false);
  const tickerInitRef = useRef(false);

  const { universeTickers } = useUniverse();
  const filteredAllTickers = useMemo(
    () => (universeTickers ? allTickers.filter(e => universeTickers.has(e.ticker)) : allTickers),
    [allTickers, universeTickers]
  );

  const classFilter = useOptimizerClassFilter(filteredAllTickers, runMode === "universe", "tva-clf");
  const pairComboPicker = usePairComboPicker(filteredAllTickers.map(e => e.ticker), runMode === "pairCombo", "tva-pc");
  const filteredTickers = classFilter.filteredTickers;

  const { frequency, frequencyUI, setFrequency } = useFrequency("tva", "daily", running);
  const resampleMode = frequency === "weekly" ? "weekly" : "daily";

  useEffect(() => {
    (getTickers as any)().then((tickers: any[]) => {
      setAllTickers(tickers);
      if (tickers.length > 0 && !tickerInitRef.current) {
        setSelectedTicker(tickers[0].ticker);
        tickerInitRef.current = true;
      }
      if (tickers.length > 0) {
        setPairTickerA(prev => prev || tickers[0].ticker);
        setPairTickerB(prev => prev || (tickers[1]?.ticker ?? tickers[0].ticker));
      }
    });
  }, []);

  const getWorkspaceState = useCallback(() => ({
    selectedTicker,
    pairTickerA,
    pairTickerB,
    basketTickers,
    basketMode,
    mode: runMode,
    frequency,
    targetReturn,
    includeRegime,
    includeThreshold,
    includeDivergence,
    pairCombo: pairComboPicker.serialize(),
    inputSelection,
  }), [selectedTicker, pairTickerA, pairTickerB, basketTickers, basketMode, runMode, frequency, targetReturn, includeRegime, includeThreshold, includeDivergence, pairComboPicker, inputSelection]);

  const restoreWorkspaceState = useCallback((state: any) => {
    if (!state || typeof state !== "object") return;
    if (typeof state.selectedTicker === "string") { setSelectedTicker(state.selectedTicker); tickerInitRef.current = true; }
    if (typeof state.pairTickerA === "string") setPairTickerA(state.pairTickerA);
    if (typeof state.pairTickerB === "string") setPairTickerB(state.pairTickerB);
    if (state.mode === "single" || state.mode === "universe" || state.mode === "pair" || state.mode === "pairCombo" || state.mode === "basket") setRunMode(state.mode);
    if (state.pairCombo) pairComboPicker.hydrate(state.pairCombo);
    if (Array.isArray(state.basketTickers)) setBasketTickers(state.basketTickers.filter((t: any) => typeof t === "string"));
    if (state.basketMode === "stocks" || state.basketMode === "combined") setBasketMode(state.basketMode);
    if (state.frequency === "daily" || state.frequency === "weekly" || state.frequency === "weekly_on_daily") setFrequency(state.frequency as any);
    else if (state.timeframe === "weekly") setFrequency("weekly");
    if (typeof state.targetReturn === "number") setTargetReturn(state.targetReturn);
    if (typeof state.includeRegime === "boolean") setIncludeRegime(state.includeRegime);
    if (typeof state.includeThreshold === "boolean") setIncludeThreshold(state.includeThreshold);
    if (typeof state.includeDivergence === "boolean") setIncludeDivergence(state.includeDivergence);
    if (state.inputSelection && typeof state.inputSelection === "object") {
      const sel = state.inputSelection;
      if (sel.kind === "close") setInputSelection({ kind: "close" });
      else if (sel.kind === "workbook" && typeof sel.metric === "string") setInputSelection({ kind: "workbook", metric: sel.metric });
    }
  }, [pairComboPicker, setBasketMode, setFrequency, setInputSelection]);

  useWorkspaceTab("tva-optimizer", getWorkspaceState, restoreWorkspaceState);

  const enabledSignalTypes = useMemo(() => {
    const types: string[] = [];
    if (includeRegime) types.push("regime");
    if (includeThreshold) types.push("threshold_cross");
    if (includeDivergence) types.push("divergence");
    return types;
  }, [includeRegime, includeThreshold, includeDivergence]);

  const handleCancel = useCallback(() => { cancelRef.current = true; }, []);

  // ── Evaluate single setup ──────────────────────────────────────────────────

  const handleEvaluate = useCallback(async () => {
    if (evaluating) return;
    setEvaluating(true);
    setEvalResult(null);
    setEvalPriceCtx(null);
    try {
      if (runMode === "pair" && (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB)) {
        setEvaluating(false); return;
      }
      if (runMode === "single" && !selectedTicker) { setEvaluating(false); return; }

      const globalDates = await (getDates as any)();
      let prices: number[], volumes: number[], highs: number[], lows: number[], dates: string[], globalIndices: number[];
      let rawVolumes: number[] | null = null;

      if (runMode === "pair") {
        const ratio = await getYahooPairsRatio(pairTickerA, pairTickerB, globalDates);
        if (!ratio || ratio.indices.length < MIN_HISTORY_DAILY) { setEvaluating(false); return; }
        const rawA = await (getTickerRaw as any)(pairTickerA);
        if (!rawA) { setEvaluating(false); return; }
        const filteredA = (filterByDateRange as any)(rawA, dateRange);
        const volMap = new Map<string, number>();
        for (let i = 0; i < filteredA.dates.length; i++) {
          const v = filteredA.volumes[i];
          if (Number.isFinite(v) && v > 0) volMap.set(filteredA.dates[i], v);
        }
        dates = ratio.indices.map((idx: number) => globalDates[idx] || "");
        const volArr = dates.map((d: string) => volMap.get(d) ?? 0);
        prices = ratio.prices.slice(); volumes = volArr;
        highs = prices.slice(); lows = prices.slice(); globalIndices = ratio.indices.slice();
      } else if (runMode === "basket") {
        if (basketTickers.length === 0) { setEvaluating(false); return; }
        if (basketMode === "combined") {
          const def = (buildBasketOhlc as any)(basketTickers, baskets);
          const data = await (getBasketOhlc as any)(def, dateRange);
          if (!data || data.closes.length < MIN_HISTORY_DAILY) { setEvaluating(false); return; }
          prices = data.closes; volumes = data.volumes; rawVolumes = data.volumes;
          highs = data.highs; lows = data.lows; dates = data.priceDates;
          const idxMap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) idxMap.set(globalDates[i], i);
          globalIndices = dates.map((d: string) => idxMap.get(d) ?? -1);
        } else {
          const raw = await (getTickerRaw as any)(basketTickers[0]);
          if (!raw) { setEvaluating(false); return; }
          const filtered = (filterByDateRange as any)(raw, dateRange);
          if (filtered.adjCloses.length < MIN_HISTORY_DAILY) { setEvaluating(false); return; }
          prices = filtered.adjCloses; volumes = filtered.volumes; rawVolumes = filtered.volumes;
          highs = filtered.highs.map((h: number, i: number) => {
            const c = filtered.closes[i], adj = filtered.adjCloses[i];
            return c && c > 0 && Number.isFinite(c) && Number.isFinite(adj) ? h * (adj / c) : h;
          });
          lows = filtered.lows.map((lo: number, i: number) => {
            const c = filtered.closes[i], adj = filtered.adjCloses[i];
            return c && c > 0 && Number.isFinite(c) && Number.isFinite(adj) ? lo * (adj / c) : lo;
          });
          dates = filtered.dates.slice(0, filtered.adjCloses.length);
          const idxMap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) idxMap.set(globalDates[i], i);
          globalIndices = dates.map((d: string) => idxMap.get(d) ?? -1);
        }
      } else {
        const ticker = runMode === "single" ? selectedTicker : (filteredAllTickers[0]?.ticker ?? "");
        if (!ticker) { setEvaluating(false); return; }
        const raw = await (getTickerRaw as any)(ticker);
        if (!raw) { setEvaluating(false); return; }
        const filtered = (filterByDateRange as any)(raw, dateRange);
        if (filtered.adjCloses.length < MIN_HISTORY_DAILY) { setEvaluating(false); return; }
        if (filtered.volumes.reduce((a: number, v: number) => a + (Number.isFinite(v) ? v : 0), 0) <= 0) { setEvaluating(false); return; }
        prices = filtered.adjCloses; volumes = filtered.volumes; rawVolumes = filtered.volumes;
        highs = filtered.highs.map((h: number, i: number) => {
          const c = filtered.closes[i], adj = filtered.adjCloses[i];
          return c && c > 0 && Number.isFinite(c) && Number.isFinite(adj) ? h * (adj / c) : h;
        });
        lows = filtered.lows.map((lo: number, i: number) => {
          const c = filtered.closes[i], adj = filtered.adjCloses[i];
          return c && c > 0 && Number.isFinite(c) && Number.isFinite(adj) ? lo * (adj / c) : lo;
        });
        dates = filtered.dates.slice(0, filtered.adjCloses.length);
        const idxMap = new Map<string, number>();
        for (let i = 0; i < globalDates.length; i++) idxMap.set(globalDates[i], i);
        globalIndices = dates.map((d: string) => idxMap.get(d) ?? -1);
      }

      const signals = detectTvaSignals(prices, volumes, { length, smo, mult, threshold, signalType });
      const side = evalSide === "long" ? "long" : "short";
      const signalIdx = evalSide === "long" ? signals.longIdx.slice() : signals.shortIdx.slice();
      signalIdx.sort((a: number, b: number) => a - b);

      const evalRes = (buildEvalResult as any)(prices, dates, signalIdx, side, targetReturn, minHold, undefined, "3M");
      setEvalResult(evalRes);
      setEvalPriceCtx({
        prices,
        highs,
        lows,
        volumes: runMode === "pair" ? volumes : rawVolumes,
        dates,
        globalIndices,
        benchmarkPrices: null,
        mode: runMode === "pair" ? "pair" : "single",
        pairLegA: runMode === "pair" ? pairTickerA : undefined,
        pairLegB: runMode === "pair" ? pairTickerB : undefined,
      });
    } finally {
      setEvaluating(false);
    }
  }, [evaluating, runMode, selectedTicker, pairTickerA, pairTickerB, filteredAllTickers, basketTickers, basketMode, baskets, dateRange, length, smo, mult, threshold, signalType, evalSide, targetReturn, minHold]);

  // ── Run optimization ───────────────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    if (running) return;
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setSkipped([]);
    setExpandedTicker(null);

    let tickerEntries: Array<{ ticker: string; name: string; pairA?: string; pairB?: string }>;

    if (runMode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) { setRunning(false); return; }
      const label = `${pairTickerA}/${pairTickerB}`;
      tickerEntries = [{ ticker: label, name: label }];
    } else if (runMode === "single") {
      const found = filteredAllTickers.find(t => t.ticker === selectedTicker);
      tickerEntries = found ? [found] : (selectedTicker ? [{ ticker: selectedTicker, name: selectedTicker }] : []);
    } else if (runMode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) { setRunning(false); return; }
        const def = (buildBasketOhlc as any)(basketTickers, baskets);
        tickerEntries = [{ ticker: `BASKET:${def.name}`, name: `BASKET:${def.name}` }];
      } else {
        tickerEntries = basketTickers.map(t => filteredAllTickers.find(e => e.ticker.toUpperCase() === t.toUpperCase()) ?? { ticker: t, name: t });
      }
    } else if (runMode === "pairCombo") {
      if (pairComboPicker.pairs.length === 0) { setRunning(false); return; }
      tickerEntries = pairComboPicker.pairs.map((p: any) => ({ ticker: p.label, name: p.label, pairA: p.a, pairB: p.b }));
    } else {
      tickerEntries = filteredTickers;
    }

    if (tickerEntries.length === 0) { setRunning(false); return; }

    const combinedBasketDef = runMode === "basket" && basketMode === "combined" ? (buildBasketOhlc as any)(basketTickers, baskets) : null;

    if (enabledSignalTypes.length === 0) {
      setSkipped([{ ticker: "ALL", reason: "No signal type selected" }]);
      setRunning(false);
      return;
    }

    setProgress({ current: 0, total: tickerEntries.length });

    const allResults: TvaTickerResult[] = [];
    const allSkipped: SkippedEntry[] = [];
    const globalDates = (runMode === "pair" || runMode === "pairCombo") ? await (getDates as any)() : [];

    for (let s = 0; s < tickerEntries.length && !cancelRef.current; s++) {
      const entry = tickerEntries[s];
      try {
        const freq = (runMode === "pair" || runMode === "pairCombo") ? "daily" : resampleMode;
        const legA = runMode === "pairCombo" ? entry.pairA! : pairTickerA;
        const legB = runMode === "pairCombo" ? entry.pairB! : pairTickerB;

        let workPrices: number[], workVolumes: number[], dailyPrices: number[];
        let rawVolumes2: number[] | null = null;
        let workDates: string[], workGlobalIndices: number[];
        let weeklyResult: any = null;
        let weeklyResampled: any = null;

        if (runMode === "pair" || runMode === "pairCombo") {
          const ratio = await getYahooPairsRatio(legA, legB, globalDates);
          if (!ratio || ratio.indices.length < MIN_HISTORY_DAILY) {
            allSkipped.push({ ticker: entry.ticker, reason: "insufficient pair history" });
            setProgress({ current: s + 1, total: tickerEntries.length }); continue;
          }
          const rawA = await (getTickerRaw as any)(legA);
          if (!rawA) {
            allSkipped.push({ ticker: entry.ticker, reason: `no leg A data (${legA})` });
            setProgress({ current: s + 1, total: tickerEntries.length }); continue;
          }
          const filteredA = (filterByDateRange as any)(rawA, dateRange);
          const volMap = new Map<string, number>();
          for (let i = 0; i < filteredA.dates.length; i++) {
            const v = filteredA.volumes[i];
            if (Number.isFinite(v) && v > 0) volMap.set(filteredA.dates[i], v);
          }
          workDates = ratio.indices.map((idx: number) => globalDates[idx] || "");
          const volArr = workDates.map((d: string) => volMap.get(d) ?? 0);
          if (volArr.reduce((a: number, v: number) => a + v, 0) <= 0) {
            allSkipped.push({ ticker: entry.ticker, reason: `no leg A volume (${legA})` });
            setProgress({ current: s + 1, total: tickerEntries.length }); continue;
          }
          workPrices = ratio.prices.slice(); workVolumes = volArr;
          dailyPrices = workPrices; workGlobalIndices = ratio.indices.slice();
        } else if (combinedBasketDef) {
          const data = await (getBasketOhlc as any)(combinedBasketDef, dateRange);
          if (!data || data.closes.length < MIN_HISTORY_DAILY) {
            allSkipped.push({ ticker: entry.ticker, reason: "insufficient basket history" });
            setProgress({ current: s + 1, total: tickerEntries.length }); continue;
          }
          workPrices = data.closes; workVolumes = data.volumes; dailyPrices = data.closes;
          rawVolumes2 = data.volumes; workDates = data.priceDates; workGlobalIndices = [];
        } else {
          const raw = await (getTickerRaw as any)(entry.ticker);
          if (!raw) {
            allSkipped.push({ ticker: entry.ticker, reason: "insufficient history" });
            setProgress({ current: s + 1, total: tickerEntries.length }); continue;
          }
          const filtered = (filterByDateRange as any)(raw, dateRange);
          if (filtered.adjCloses.length < MIN_HISTORY_DAILY) {
            allSkipped.push({ ticker: entry.ticker, reason: "insufficient history" });
            setProgress({ current: s + 1, total: tickerEntries.length }); continue;
          }
          if (filtered.volumes.reduce((a: number, v: number) => a + (Number.isFinite(v) ? v : 0), 0) <= 0) {
            allSkipped.push({ ticker: entry.ticker, reason: "no volume" });
            setProgress({ current: s + 1, total: tickerEntries.length }); continue;
          }
          rawVolumes2 = filtered.volumes;

          if ((frequency as string) === "weekly_on_daily") {
            weeklyResult = (weeklyDownsample as any)(filtered.adjCloses, filtered.dates);
            if (weeklyResult.prices.length < MIN_HISTORY_WEEKLY) {
              allSkipped.push({ ticker: entry.ticker, reason: "insufficient weekly history" });
              setProgress({ current: s + 1, total: tickerEntries.length }); continue;
            }
            const weeklyVols = weeklyResult.weekIndex.map((wi: number) => filtered.volumes[wi] ?? 0);
            workPrices = weeklyResult.prices; workVolumes = weeklyVols;
            dailyPrices = filtered.adjCloses; workDates = filtered.dates; workGlobalIndices = [];
          } else {
            weeklyResampled = (weeklyDownsample as any)(
              { dates: filtered.dates, closes: filtered.adjCloses, adjCloses: filtered.adjCloses, highs: filtered.highs, lows: filtered.lows },
              freq
            );
            if (freq === "weekly" && weeklyResampled.adjCloses.length < MIN_HISTORY_WEEKLY) {
              allSkipped.push({ ticker: entry.ticker, reason: "insufficient weekly history" });
              setProgress({ current: s + 1, total: tickerEntries.length }); continue;
            }
            workPrices = weeklyResampled.adjCloses; workVolumes = weeklyResampled.volumes;
            dailyPrices = filtered.adjCloses;
            workDates = freq === "weekly" ? weeklyResampled.dates : filtered.dates;
            workGlobalIndices = [];
          }
        }

        // Build global index map
        if (runMode !== "pair" && runMode !== "pairCombo" && workGlobalIndices.length === 0) {
          try {
            const gDates = globalDates.length > 0 ? globalDates : await (getDates as any)();
            if (globalDates.length === 0) globalDates.push(...gDates);
            const gMap = new Map<string, number>();
            for (let i = 0; i < gDates.length; i++) gMap.set(gDates[i], i);
            workGlobalIndices = workDates.map((d: string) => gMap.get(d) ?? -1);
          } catch {
            workGlobalIndices = workDates.map(() => -1);
          }
        }

        // Grid search
        const configs: any[] = [];
        for (const sigType of enabledSignalTypes) {
          for (const len of LENGTH_OPTIONS) {
            for (const smoV of SMO_OPTIONS) {
              for (const multV of MULT_OPTIONS) {
                const thresholds = sigType === "threshold_cross" ? THRESHOLD_OPTIONS : [0];
                for (const thresh of thresholds) {
                  const params: TvaParams = { length: len, smo: smoV, mult: multV, threshold: thresh, signalType: sigType };
                  const signals = detectTvaSignals(workPrices, workVolumes, params);
                  const dirResults: TvaDirectionResult[] = [];
                  for (const dir of ["long", "short"] as const) {
                    const sigIdx = dir === "long" ? signals.longIdx : signals.shortIdx;
                    if (sigIdx.length < MIN_SIGNALS) continue;
                    const side = dir === "long" ? "buy" : "sell";
                    const profiles = sigIdx.map((ye: number) => {
                      let dailyIdx: number;
                      if ((frequency as string) === "weekly_on_daily" && weeklyResult) {
                        dailyIdx = weeklyResult.weekIndex[ye] ?? -1;
                      } else if (freq === "weekly" && weeklyResampled) {
                        dailyIdx = (getDailyIndexFromWeekly as any)(ye, weeklyResampled);
                      } else {
                        dailyIdx = ye;
                      }
                      if (dailyIdx < 0) return null;
                      return (computeForwardProfile as any)(dailyPrices, dailyIdx, targetReturn, side);
                    }).filter((p: any) => p !== null);
                    if (profiles.length < MIN_SIGNALS) continue;
                    const summary = (summarizeSignals as any)(profiles, side);
                    const composite = (computeCompositeScore as any)(summary, side);
                    dirResults.push({ direction: dir, summary, composite, profiles });
                  }
                  if (dirResults.length === 0) continue;
                  const best = dirResults.reduce((a, b) => a.composite.score >= b.composite.score ? a : b);
                  const label = sigType === "threshold_cross"
                    ? `${SIGNAL_TYPES.find(s => s.key === sigType)!.label} · L=${len} smo=${smoV} m=${multV} k=${thresh}`
                    : `${SIGNAL_TYPES.find(s => s.key === sigType)!.label} · L=${len} smo=${smoV} m=${multV}`;
                  configs.push({ ...params, configLabel: label, directions: dirResults, bestDirection: best.direction, bestScore: best.composite.score });
                }
              }
            }
          }
          await new Promise(r => setTimeout(r, 0));
          if (cancelRef.current) break;
        }

        configs.sort((a, b) => b.bestScore - a.bestScore);
        const topConfigs = configs.slice(0, TOP_N);
        if (topConfigs.length === 0) {
          allSkipped.push({ ticker: entry.ticker, reason: "no signals met thresholds" });
          setProgress({ current: s + 1, total: tickerEntries.length }); continue;
        }

        const bestConf = topConfigs[0];
        const bestSignals = detectTvaSignals(workPrices, workVolumes, {
          length: bestConf.length, smo: bestConf.smo, mult: bestConf.mult, threshold: bestConf.threshold, signalType: bestConf.signalType,
        });

        const finalDailyPrices = (runMode === "pair" || runMode === "pairCombo") ? workPrices : dailyPrices;
        let finalDates: string[];
        let finalGlobalIndices: number[];

        if (runMode !== "pair" && runMode !== "pairCombo" && freq === "weekly" && (frequency as string) !== "weekly_on_daily") {
          try {
            const gDates = globalDates.length > 0 ? globalDates : await (getDates as any)();
            if (globalDates.length === 0) globalDates.push(...gDates);
            const raw2 = await (getTickerRaw as any)(entry.ticker);
            finalDates = raw2 ? raw2.dates : workDates;
            const gMap = new Map<string, number>();
            for (let i = 0; i < gDates.length; i++) gMap.set(gDates[i], i);
            finalGlobalIndices = finalDates.map((d: string) => gMap.get(d) ?? -1);
          } catch {
            finalDates = workDates;
            finalGlobalIndices = workDates.map(() => -1);
          }
        } else {
          finalDates = (runMode === "pair" || runMode === "pairCombo") ? workDates : workDates;
          finalGlobalIndices = workGlobalIndices;
        }

        const priceCtx: TvaPriceContext = {
          prices: finalDailyPrices,
          highs: finalDailyPrices.slice(),
          lows: finalDailyPrices.slice(),
          volumes: (runMode === "pair" || runMode === "pairCombo") ? workVolumes : rawVolumes2,
          dates: finalDates,
          globalIndices: finalGlobalIndices,
          benchmarkPrices: null,
          mode: (runMode === "pair" || runMode === "pairCombo") ? "pair" : "single",
          pairLegA: (runMode === "pair" || runMode === "pairCombo") ? legA : undefined,
          pairLegB: (runMode === "pair" || runMode === "pairCombo") ? legB : undefined,
        };

        allResults.push({
          ticker: entry.ticker,
          name: entry.name || entry.ticker,
          configs: topConfigs,
          bestConfigLabel: bestConf.configLabel,
          bestDirection: bestConf.bestDirection,
          bestScore: bestConf.bestScore,
          currentOs: bestSignals.currentOs,
          currentBullP: bestSignals.currentBullP,
          currentBearP: bestSignals.currentBearP,
          priceContext: priceCtx,
        });
      } catch (err: any) {
        allSkipped.push({ ticker: entry.ticker, reason: err?.message || "error" });
      }

      setProgress({ current: s + 1, total: tickerEntries.length });
      if (s % 3 === 2) await new Promise(r => setTimeout(r, 0));
    }

    setSkipped(allSkipped);
    setResults(allResults);
    setRunning(false);
  }, [running, runMode, filteredAllTickers, selectedTicker, pairTickerA, pairTickerB, basketTickers, basketMode, baskets, filteredTickers, enabledSignalTypes, targetReturn, frequency, resampleMode, dateRange, pairComboPicker.pairs]);

  // ── Sorted/filtered results ────────────────────────────────────────────────

  const rankedResults = useMemo(() => {
    return results.map(e => {
      const sortedConfigs = [...e.configs.map((c: any) => {
        let best = -Infinity, bestDir = c.directions[0];
        for (const dir of c.directions) {
          const side = dir.direction === "long" ? "buy" : "sell";
          const score = (pickBestByRankMode as any)(dir.summary, dir.composite.score, side, scoreWeights);
          if (score > best) { best = score; bestDir = dir; }
        }
        return { ...c, bestScore: best, bestDirection: bestDir.direction };
      })].sort((a: any, b: any) => b.bestScore - a.bestScore);
      const top = sortedConfigs[0];
      return { ...e, configs: sortedConfigs, bestScore: top ? top.bestScore : e.bestScore, bestDirection: top ? top.bestDirection : e.bestDirection, bestConfigLabel: top ? top.configLabel : e.bestConfigLabel };
    });
  }, [results, scoreWeights]);

  const displayResults = useMemo(() => {
    const q = filterText.trim().toUpperCase();
    let list = rankedResults;
    if (q) list = list.filter(e => e.ticker.toUpperCase().includes(q) || e.name.toUpperCase().includes(q));
    const sorted = [...list];
    sorted.sort((a, b) =>
      sortBy === "ticker" ? a.ticker.localeCompare(b.ticker)
        : sortBy === "signal" ? formatOsSignal(a.currentOs).localeCompare(formatOsSignal(b.currentOs))
        : b.bestScore - a.bestScore
    );
    return sorted;
  }, [rankedResults, sortBy, filterText]);

  // ── CSV export ─────────────────────────────────────────────────────────────

  const handleExportCsv = useCallback(() => {
    const rows: any[][] = [
      ["Ticker", "Name", "Current OS", "Current Bull P", "Current Bear P", "Current Signal", "Best Config", "Best Direction", "Best Score",
        ...(FORWARD_HORIZONS as unknown as any[]).flatMap(({ label }: any) => [`HitRate_${label}`, `AvgRet_${label}`, `PF_${label}`])]
    ];
    for (const e of displayResults) {
      const topConf = e.configs[0];
      if (!topConf) continue;
      const topDir = topConf.directions.find((d: any) => d.direction === e.bestDirection) ?? topConf.directions[0];
      if (!topDir) continue;
      const s = topDir.summary;
      rows.push([e.ticker, e.name, e.currentOs?.toFixed(4) ?? "", e.currentBullP?.toFixed(0) ?? "", e.currentBearP?.toFixed(0) ?? "",
        formatOsSignal(e.currentOs), e.bestConfigLabel, e.bestDirection, e.bestScore.toFixed(1),
        ...(FORWARD_HORIZONS as unknown as any[]).flatMap(({ label }: any) => [
          (s.hitRate[label] * 100).toFixed(1) + "%",
          (s.avgReturn[label] * 100).toFixed(2) + "%",
          (s.profitFactor[label] || 0).toFixed(2),
        ])
      ]);
    }
    const csv = rows.map(r => r.map((v: any) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tva-optimizer-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [displayResults]);

  // ── Computed labels for evaluate ──────────────────────────────────────────

  const evalSetupLabel = useMemo(() => {
    const base = `${SIGNAL_TYPES.find(s => s.key === signalType)?.label ?? signalType} L=${length} smo=${smo} m=${mult}`;
    return signalType === "threshold_cross" ? `${base} k=${threshold}` : base;
  }, [signalType, length, smo, mult, threshold]);

  const evalTickerLabel = useMemo(() =>
    runMode === "pair" ? `${pairTickerA || "A"}/${pairTickerB || "B"}`
      : runMode === "single" ? selectedTicker || "—"
      : filteredAllTickers[0]?.ticker || "—",
    [runMode, pairTickerA, pairTickerB, selectedTicker, filteredAllTickers]
  );

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full text-foreground bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">TVA Optimizer</h2>
        <div className="flex gap-px">
          <button
            data-testid="tva-view-optimize"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${view === "optimize" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setView("optimize")}
          >Optimize</button>
          <button
            data-testid="tva-view-evaluate"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${view === "evaluate" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setView("evaluate")}
          >Evaluate</button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {view === "optimize" ? "Search parameter space by hit rate" : "Score one specific setup"}
        </span>
      </div>

      {view === "evaluate" ? (
        <>
          {/* Evaluate controls */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  <button className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${runMode === "single" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setRunMode("single")}>Single</button>
                  <button className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${runMode === "pair" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setRunMode("pair")}>Pair</button>
                </div>
              </div>

              {runMode === "single" && (
                <div className="flex items-end gap-2">
                  <div className={(isBasketTicker as any)(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                    <UnifiedTickerPicker tickers={filteredAllTickers} value={(isBasketTicker as any)(selectedTicker) ? "" : selectedTicker} onChange={setSelectedTicker} label="Ticker" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
                    <BasketTickerPill activeTicker={selectedTicker} onSelectTicker={setSelectedTicker} fallbackTicker={filteredAllTickers[0]?.ticker ?? null} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                    <InputSeriesPicker value={inputSelection as any} onChange={setInputSelection as any} family="tva" label="" />
                  </div>
                </div>
              )}

              {runMode === "pair" && (
                <>
                  <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerA} onChange={setPairTickerA} label="Ticker A" />
                  <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerB} onChange={setPairTickerB} label="Ticker B" />
                </>
              )}

              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Side</label>
                <div className="flex gap-px">
                  <button className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSide === "long" ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setEvalSide("long")}>Long</button>
                  <button className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSide === "short" ? "bg-red-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setEvalSide("short")}>Short</button>
                </div>
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal Type</label>
                <div className="flex gap-px">
                  {SIGNAL_TYPES.map(s => (
                    <button key={s.key} title={s.description}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${signalType === s.key ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setSignalType(s.key)}>{s.label}</button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Length</label>
                <select className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground" value={length} onChange={e => setLength(parseInt(e.target.value))}>
                  {LENGTH_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Smo</label>
                <select className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground" value={smo} onChange={e => setSmo(parseInt(e.target.value))}>
                  {SMO_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mult</label>
                <select className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground" value={mult} onChange={e => setMult(parseInt(e.target.value))}>
                  {MULT_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              {signalType === "threshold_cross" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Threshold k</label>
                  <select className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))}>
                    {THRESHOLD_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}

              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target %</label>
                <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1" value={targetReturn} onChange={e => setTargetReturn(parseFloat(e.target.value))}>
                  {[0.02, 0.03, 0.05, 0.07, 0.1, 0.15].map(v => <option key={v} value={v}>{(v * 100).toFixed(0)}%</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Hold</label>
                <input type="number" min={0} value={minHold} onChange={e => setMinHold(parseInt(e.target.value) || 0)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>

              <div className="flex items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
                <div className="flex items-center gap-0.5">
                  {(DATE_PRESETS as unknown as any[]).map((p: any) => (
                    <button key={p.value} data-testid={`tva-eval-date-preset-${p.value}`}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === p.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}
                      onClick={() => { setDatePreset(p.value); setDateRange((createDateRangeFromPreset as any)(p.value)); }}
                    >{p.label}</button>
                  ))}
                  <input type="date" data-testid="tva-eval-date-start" value={dateRange.start}
                    onChange={e => { setDatePreset("custom"); setDateRange({ ...dateRange, start: e.target.value }); }}
                    className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
                  <span className="text-[10px] font-mono text-muted-foreground">→</span>
                  <input type="date" data-testid="tva-eval-date-end" value={dateRange.end}
                    onChange={e => { setDatePreset("custom"); setDateRange({ ...dateRange, end: e.target.value }); }}
                    className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
                </div>
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                <button data-testid="tva-eval-run"
                  className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={handleEvaluate} disabled={evaluating}>
                  {evaluating ? "Evaluating…" : "Evaluate"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            <EvalResultPanel result={evalResult} loading={evaluating} setupLabel={evalSetupLabel} tickerLabel={evalTickerLabel} />
            {evalResult && evalPriceCtx && evalResult.profiles.length >= 10 && (
              <HitConditionsPanel
                ticker={evalPriceCtx.mode === "pair" ? evalPriceCtx.pairLegA || "" : selectedTicker || filteredAllTickers[0]?.ticker || ""}
                priceContext={evalPriceCtx}
                signals={evalResult.profiles}
                direction={evalSide === "long" ? "buy" : "sell"}
                title={`Hit Conditions — ${evalSetupLabel} on ${evalTickerLabel}`}
                useBand={false}
              />
            )}
          </div>
        </>
      ) : (
        <>
          {/* Optimize header */}
          <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-card/30 flex-shrink-0">
            <div>
              <h2 className="text-sm font-bold font-mono">TVA Optimizer</h2>
              <p className="text-[10px] font-mono text-muted-foreground">
                Trend Volume Accumulations (LuxAlgo) — grid search across length × smo × mult × threshold × signal type
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-end gap-3 px-4 py-2 border-b border-border bg-card/30 flex-shrink-0">
            {/* Mode */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
              <div className="flex gap-px">
                {(["single", "universe", "pair", "pairCombo", "basket"] as const).map(m => (
                  <button key={m}
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${runMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setRunMode(m)} disabled={running}
                    data-testid={`optimizer-mode-${m}`}
                  >{m === "single" ? "Single Ticker" : m === "universe" ? "Universe" : m === "pair" ? "Pair (A/B)" : m === "pairCombo" ? "Pair Combo" : "Basket"}</button>
                ))}
              </div>
            </div>

            {runMode === "universe" && classFilter.classFilterUI && (
              <div className="flex flex-col gap-1 w-full">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Classification Filter</label>
                {classFilter.universeSourceUI}
                {classFilter.classFilterUI}
              </div>
            )}

            {runMode === "single" && (
              <div className="flex items-end gap-2">
                <div className="flex items-end gap-2">
                  <div className={(isBasketTicker as any)(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                    <UnifiedTickerPicker tickers={filteredAllTickers} value={(isBasketTicker as any)(selectedTicker) ? "" : selectedTicker} onChange={setSelectedTicker} disabled={running} label="Ticker" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
                    <BasketTickerPill activeTicker={selectedTicker} onSelectTicker={setSelectedTicker} fallbackTicker={filteredAllTickers[0]?.ticker ?? null} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                    <InputSeriesPicker value={inputSelection as any} onChange={setInputSelection as any} family="tva" label="" />
                  </div>
                </div>
              </div>
            )}

            {runMode === "pair" && (
              <div className="flex items-end gap-2">
                <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerA} onChange={setPairTickerA} disabled={running} label="A" />
                <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerB} onChange={setPairTickerB} disabled={running} label="B" />
                <span className="text-[10px] font-mono text-muted-foreground pb-1">
                  Ratio: <span className="text-foreground font-bold">{pairTickerA || "A"}/{pairTickerB || "B"}</span>
                </span>
              </div>
            )}

            {runMode === "basket" && (
              <div className="flex flex-col gap-2">
                <BasketPicker tickers={filteredAllTickers} value={basketTickers} onChange={setBasketTickers} disabled={running} testIdPrefix="tva-basket" />
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket Run Mode</label>
                  <div className="flex gap-px" data-testid="tva-basket-mode">
                    {(["stocks", "combined"] as const).map(m => (
                      <button key={m} data-testid={`tva-basket-mode-${m}`}
                        className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${basketMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                        onClick={() => setBasketMode(m)} disabled={running}
                        title={m === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme"}
                      >{m === "stocks" ? "Stock by Stock" : "Combined"}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {runMode === "pairCombo" && (
              <div className="flex flex-col gap-1 w-full">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Pair Combo — Leg Set</label>
                {pairComboPicker.ui}
              </div>
            )}

            {runMode !== "pair" && runMode !== "pairCombo" && frequencyUI}

            {/* Date range */}
            <div className="flex items-center gap-1">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
              <div className="flex items-center gap-0.5">
                {(DATE_PRESETS as unknown as any[]).map((p: any) => (
                  <button key={p.value} data-testid={`tva-date-preset-${p.value}`}
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === p.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}
                    onClick={() => { setDatePreset(p.value); setDateRange((createDateRangeFromPreset as any)(p.value)); }}
                  >{p.label}</button>
                ))}
                <input type="date" data-testid="tva-date-start" value={dateRange.start}
                  onChange={e => { setDatePreset("custom"); setDateRange({ ...dateRange, start: e.target.value }); }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
                <span className="text-[10px] font-mono text-muted-foreground">→</span>
                <input type="date" data-testid="tva-date-end" value={dateRange.end}
                  onChange={e => { setDatePreset("custom"); setDateRange({ ...dateRange, end: e.target.value }); }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
              </div>
            </div>

            {/* Target return */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target Return</label>
              <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1" value={targetReturn} onChange={e => setTargetReturn(parseFloat(e.target.value))} disabled={running}>
                {[0.02, 0.03, 0.05, 0.07, 0.1, 0.15].map(v => <option key={v} value={v}>{(v * 100).toFixed(0)}%</option>)}
              </select>
            </div>

            {/* Signal types */}
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal Types</label>
              <div className="flex gap-2 text-[10px] font-mono">
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={includeRegime} onChange={e => setIncludeRegime(e.target.checked)} disabled={running} /> Regime</label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={includeThreshold} onChange={e => setIncludeThreshold(e.target.checked)} disabled={running} /> Threshold</label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={includeDivergence} onChange={e => setIncludeDivergence(e.target.checked)} disabled={running} /> Divergence</label>
              </div>
            </div>

            {/* Run/Cancel + CSV */}
            <div className="flex items-end gap-2 ml-auto">
              {running ? (
                <button className="text-xs font-mono font-bold px-4 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleCancel}>Cancel</button>
              ) : (
                <button className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={handleRun}
                  disabled={runMode === "single" ? !selectedTicker : runMode === "pair" ? !pairTickerA || !pairTickerB || pairTickerA === pairTickerB : filteredTickers.length === 0}
                  data-testid="tva-run">Run Optimization</button>
              )}
              <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={results.length === 0}>
                <Download className="w-3 h-3 mr-1" /> CSV
              </Button>
            </div>
          </div>

          {/* Progress */}
          {running && (
            <div className="px-4 py-1 text-[10px] font-mono text-muted-foreground border-b border-border bg-card/20">
              Running… {progress.current} / {progress.total}
              <div className="h-1 bg-background rounded overflow-hidden mt-1">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress.current / Math.max(1, progress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {displayResults.length > 0 && (
              <div className="px-4 py-2 flex items-center gap-3 border-b border-border bg-card/10 sticky top-0 z-10 text-[10px] font-mono">
                <span className="text-muted-foreground">{displayResults.length} tickers</span>
                <input type="text" placeholder="Filter ticker…" value={filterText} onChange={e => setFilterText(e.target.value)}
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-40" />
                <span className="text-muted-foreground">Sort:</span>
                <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="score">Best Score</option>
                  <option value="ticker">Ticker A-Z</option>
                  <option value="signal">Current Signal</option>
                </select>
                <div className="flex items-center gap-1">
                  <label className="text-[10px] font-mono text-muted-foreground">RANK BY</label>
                  <select data-testid="tva-rank-by" value={rankBy} onChange={e => setRankBy(e.target.value)}
                    className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5">
                    {(RANK_BY_OPTIONS as unknown as any[]).map((opt: any) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                {skipped.length > 0 && <span className="text-muted-foreground ml-auto">{skipped.length} skipped</span>}
              </div>
            )}

            {displayResults.length === 0 && !running && (
              <div className="p-6 text-xs font-mono text-muted-foreground text-center">
                Configure the grid and click Run Optimization. TVA needs Yahoo price data with non-zero volume — tickers without volume will be skipped.
              </div>
            )}

            {displayResults.map(e => {
              const isExpanded = expandedTicker === e.ticker;
              const signal = formatOsSignal(e.currentOs);
              return (
                <div key={e.ticker} className="border-b border-border">
                  <button className="w-full px-4 py-2 flex items-center gap-3 hover:bg-accent/30 text-left"
                    onClick={() => setExpandedTicker(isExpanded ? null : e.ticker)}>
                    <span className="font-mono text-xs font-bold w-16">{e.ticker}</span>
                    <span className="text-[10px] font-mono text-muted-foreground flex-1 truncate">{e.name}</span>
                    <span className={`font-mono text-[10px] font-bold w-12 text-center ${signal === "BULL" ? "text-green-500" : signal === "BEAR" ? "text-red-500" : "text-muted-foreground"}`}>{signal}</span>
                    <span className={`font-mono text-[10px] w-16 text-center ${e.bestDirection === "long" ? "text-green-500" : "text-red-500"}`}>{e.bestDirection.toUpperCase()}</span>
                    <span className="font-mono text-xs font-bold w-12 text-center rounded px-1 py-0.5"
                      style={{ backgroundColor: (scoreBackgroundColor as any)(e.bestScore), color: (scoreTextColor as any)(e.bestScore) }}>
                      {e.bestScore.toFixed(0)}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground hidden md:inline truncate max-w-[280px]">{e.bestConfigLabel}</span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 py-2 bg-card/20">
                      <div className="text-[10px] font-mono text-muted-foreground mb-1">
                        Top {e.configs.length} configs (best per signal type/length/smo/mult/threshold):
                      </div>
                      <table className="w-full text-[10px] font-mono">
                        <thead className="text-muted-foreground">
                          <tr className="border-b border-border">
                            <th className="text-left p-1">Config</th>
                            <th className="p-1">Dir</th>
                            <th className="p-1"># Sig</th>
                            <th className="p-1">Score</th>
                            <th className="p-1">HC</th>
                            {(FORWARD_HORIZONS as unknown as any[]).map((h: any) => <th key={h.label} className="p-1">{h.label} Hit</th>)}
                            {(FORWARD_HORIZONS as unknown as any[]).map((h: any) => <th key={h.label + "ret"} className="p-1">{h.label} Ret</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {e.configs.flatMap((c: any) =>
                            c.directions.map((dir: any) => {
                              const rowKey = `${e.ticker}::${c.configLabel}::${dir.direction}`;
                              const expanded = expandedRows.has(rowKey);
                              const hasHC = !!(dir.profiles && dir.profiles.length >= 10 && e.priceContext);
                              const sideLabel = dir.direction === "long" ? "buy" : "sell";
                              const colSpan = 5 + (FORWARD_HORIZONS as unknown as any[]).length * 2;
                              return (
                                <React.Fragment key={c.configLabel + dir.direction}>
                                  <tr className="border-b border-border/30">
                                    <td className="p-1 truncate max-w-[260px]">{c.configLabel}</td>
                                    <td className={`p-1 text-center ${dir.direction === "long" ? "text-green-500" : "text-red-500"}`}>{dir.direction === "long" ? "L" : "S"}</td>
                                    <td className="p-1 text-center">{dir.summary.count}</td>
                                    <td className="p-1 text-center"
                                      style={{ color: (scoreTextColor as any)(dir.composite.score), backgroundColor: (scoreBackgroundColor as any)(dir.composite.score) }}>
                                      {dir.composite.score.toFixed(0)}
                                    </td>
                                    <td className="p-1 text-center">
                                      {hasHC ? (
                                        <button type="button" onClick={() => toggleRow(rowKey)}
                                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${expanded ? "bg-violet-500/25 text-violet-200 border-violet-400/40" : "bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`}
                                          title="Profile what other indicators looked like at hit-bars vs miss-bars">
                                          {expanded ? "▾" : "▸"}
                                        </button>
                                      ) : (
                                        <span className="text-muted-foreground/40">—</span>
                                      )}
                                    </td>
                                    {(FORWARD_HORIZONS as unknown as any[]).map((h: any) => (
                                      <td key={h.label} className="p-1 text-center" style={{ color: (hitRateColor as any)(dir.summary.hitRate[h.label]) }}>
                                        {(dir.summary.hitRate[h.label] * 100).toFixed(0)}%
                                      </td>
                                    ))}
                                    {(FORWARD_HORIZONS as unknown as any[]).map((h: any) => (
                                      <td key={h.label + "ret"} className="p-1 text-center">
                                        {(pctSigned as any)(dir.summary.avgReturn[h.label])}
                                      </td>
                                    ))}
                                  </tr>
                                  {expanded && hasHC && e.priceContext && dir.profiles && (
                                    <tr>
                                      <td colSpan={colSpan} className="p-2 bg-card/10">
                                        <HitConditionsPanel
                                          ticker={e.priceContext.mode === "pair" && e.priceContext.pairLegA || e.ticker}
                                          priceContext={e.priceContext}
                                          signals={dir.profiles}
                                          direction={sideLabel}
                                          title={`${c.configLabel} — ${dir.direction.toUpperCase()}`}
                                        />
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {skipped.length > 0 && !running && (
              <div className="p-4 text-[10px] font-mono text-muted-foreground border-t border-border">
                <details>
                  <summary className="cursor-pointer">Skipped ({skipped.length})</summary>
                  <ul className="mt-2 space-y-0.5">
                    {skipped.map((e, i) => <li key={i}>{e.ticker}: {e.reason}</li>)}
                  </ul>
                </details>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}


