// Reconstructed from recovered-bundle/MomentumOptimizer-rZsUBkFq.js on 2026-06-11
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
import { pct } from "@/lib/forwardReturns";
import { TARGET_RETURN_OPTIONS } from "@/lib/optimizerConstants";
import { filterByDateRange, isBasketTicker } from "@/lib/optimizerInputSeries";
import { getTickers, getDates, getTickerRaw, refreshTickerData } from "@/lib/dataService";
import type { TickerMeta } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/useBaskets";
import { buildBasketOhlc, getBasketOhlc } from "@/lib/basketOhlc";
import type { BasketOhlcBar } from "@/lib/basketOhlc";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { getDailyIndexFromWeekly } from "@/lib/getDailyIndexFromWeekly";
import { fetchWorkbookSeriesForTicker } from "@/lib/fetchWorkbookSeriesForTicker";
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { B as BasketTickerPill } from "@/components/BasketTickerPill";
import { B as BasketPicker } from "@/components/BasketPicker";
import { e as evaluateSignals, E as EvaluatorResultPanel, H as HitConditionsPanel } from "@/components/EvaluatorPanel";
import { InputSeriesPicker } from "@/components/InputSeriesPicker";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as React from "react";
import "@/lib/harsi";
import "@/lib/tva";

// ── Constants ──

const MOMENTUM_HORIZONS = [
  { days: 21,  label: "1M" },
  { days: 63,  label: "3M" },
  { days: 126, label: "6M" },
  { days: 252, label: "1Y" },
];

const DEFAULT_REVISION_METRICS = [
  "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2",
  "AFFO FY1", "AFFO FY2", "Sales FY1", "Sales FY2",
  "EBITDA FY1", "EBITDA FY2",
];

const REVISION_HORIZONS = [
  { days: 21,  label: "1M" },
  { days: 42,  label: "2M" },
  { days: 63,  label: "3M" },
];

const SIGNAL_CATEGORY_META: Record<string, { label: string; description: string }> = {
  momentum_buy: {
    label: "Momentum Long",
    description: "Strong price momentum + positive estimate revisions → ride the trend",
  },
  momentum_sell: {
    label: "Momentum Short",
    description: "Weak price momentum + negative estimate revisions → short the weakness",
  },
  reversal_buy: {
    label: "Oversold Quality",
    description: "Negative price momentum BUT positive/stable revisions → oversold, fundamentals intact",
  },
  reversal_sell: {
    label: "Overbought Fade",
    description: "Positive price momentum BUT negative revisions → overbought, fundamentals deteriorating",
  },
  oversold_quality: {
    label: "Deep Value",
    description: "Extreme negative momentum + strongly positive revisions → biggest reversal opportunity",
  },
  value_trap: {
    label: "Value Trap",
    description: "Extreme negative momentum + negative revisions → falling knife, avoid",
  },
};

const MIN_MAGNITUDE = 0.1;
const MAX_EXPAND = 6;

// ── Helper functions ──

function computeMomentumReturn(prices: number[], lookback: number): (number | null)[] {
  const out = new Array(prices.length).fill(null);
  for (let i = lookback; i < prices.length; i++) {
    if (prices[i - lookback] > 0) {
      out[i] = (prices[i] - prices[i - lookback]) / prices[i - lookback];
    }
  }
  return out;
}

function computeRevisionMomentum(revValues: number[], lookback: number): (number | null)[] {
  const out = new Array(revValues.length).fill(null);
  for (let i = lookback; i < revValues.length; i++) {
    const prev = revValues[i - lookback];
    if (Number.isFinite(prev) && Math.abs(prev) >= MIN_MAGNITUDE) {
      out[i] = (revValues[i] - prev) / Math.abs(prev);
    }
  }
  return out;
}

function computePercentileRank(
  series: (number | null)[],
  atIdx: number,
  window: number
): number | null {
  const start = Math.max(0, atIdx - window + 1);
  const values: number[] = [];
  for (let i = start; i <= atIdx; i++) {
    if (series[i] !== null) values.push(series[i]!);
  }
  if (values.length < 10) return null;
  const cur = series[atIdx];
  if (cur === null) return null;
  return values.filter(v => v < cur).length / values.length;
}

// ── Types ──

type RunMode = "single" | "universe" | "pair" | "pairCombo" | "basket";
type SignalMode = "momentum" | "revision" | "percentile";
type ReturnMode = "threshold" | "band";

interface MomentumCategoryResult {
  category: string;
  label: string;
  description: string;
  summary: SignalSummary;
  composite: CompositeScore;
  profiles?: ForwardReturnProfile[];
}

interface MomentumConfig {
  lookback: number;
  lookbackLabel: string;
  revisionMetric: string;
  revisionLookback: number;
}

interface MomentumConfigResult {
  config: MomentumConfig;
  categories: MomentumCategoryResult[];
  bestCategory: string;
  bestScore: number;
}

interface MomentumTickerResult {
  ticker: string;
  name: string;
  configs: MomentumConfigResult[];
  bestCategory: string;
  bestScore: number;
  currentSignal: string;
  priceContext?: any;
}

interface SeriesData {
  closes: number[];
  priceDates: string[];
  globalIndices: number[];
  revValues: number[];
  hasRevisions: boolean;
}

// ── Component ──

export default function MomentumOptimizer() {
  const [tickers, setTickers] = useState<TickerMeta[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [returnMode, setReturnMode] = useState<ReturnMode>("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.10);
  const [selectedRevMetric, setSelectedRevMetric] = useState("FFO FY2");
  const [momThreshold, setMomThreshold] = useState(0.2);
  const [revThreshold, setRevThreshold] = useState(0.02);
  const [minHold, setMinHold] = useState(0);
  const [runMode, setRunMode] = useState<RunMode>("single");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = usePersistedState("momentum-basket-mode", "stocks");
  const { baskets } = useBaskets();
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = usePersistedState<MomentumTickerResult[]>("mom:results", []);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [hitConditionsOpen, setHitConditionsOpen] = useState<Set<string>>(new Set());
  const toggleHitConditions = useCallback((key: string) => {
    setHitConditionsOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const [sortBy, setSortBy] = useState("score");
  const [rankBy, setRankBy] = useState("composite");
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState(() => (createDateRangeFromPreset as any)());
  const scoreWeights = useMemo(() => (getScoreWeights as any)(rankBy), [rankBy]);
  const cancelRef = useRef(false);
  const tickerSetRef = useRef(false);
  const [activeTab, setActiveTab] = useState<"optimize" | "evaluate">("optimize");
  const [evalSide, setEvalSide] = useState<"long" | "short">("long");
  const [evalResult, setEvalResult] = usePersistedState<any>("mom:evalResult", null);
  const [evalPriceContext, setEvalPriceContext] = useState<any>(null);
  const [evalRunning, setEvalRunning] = useState(false);
  const [signalMode, setSignalMode] = useState<SignalMode>("momentum");
  const [momentumLookback, setMomentumLookback] = useState(MOMENTUM_HORIZONS[1].days);
  const [evalThreshold, setEvalThreshold] = useState(0.05);
  const [evalRevMetric, setEvalRevMetric] = useState("FFO FY2");
  const [evalRevLookback, setEvalRevLookback] = useState(63);
  const { universeTickers, isFiltered } = useUniverse();
  const classFilter = useOptimizerClassFilter(tickers, runMode === "universe", "mom-clf");
  const pairComboPicker = usePairComboPicker(tickers, runMode === "pairCombo", "mom-pc");
  const filteredTickers = classFilter.filteredTickers;
  const { frequency, setFrequency, frequencyUI } = useFrequency("mom", "daily", running);
  const [inputSelection, setInputSelection] = usePersistedState<any>("momentum-input-selection", { kind: "ohlcv", series: "close" });
  const freqKey = frequency === "weekly" ? "weekly" : "daily";
  const [availableRevMetrics, setAvailableRevMetrics] = useState<string[]>(DEFAULT_REVISION_METRICS);

  const filteredByUniverse = useMemo(
    () => universeTickers ? tickers.filter(t => universeTickers.has(t.ticker)) : tickers,
    [tickers, universeTickers]
  );

  useEffect(() => {
    getTickers().then(ts => {
      setTickers(ts);
      if (ts.length > 0 && !tickerSetRef.current) {
        setSelectedTicker(p => p || ts[0].ticker);
        setPairTickerA(p => p || ts[0].ticker);
        setPairTickerB(p => p || (ts[1]?.ticker ?? ts[0].ticker));
      }
      const metricSet = new Set<string>();
      for (const t of ts) {
        if (t.metrics) {
          for (const m of t.metrics) {
            metricSet.add(typeof m === "string" ? m : (m as any).name || m);
          }
        }
      }
      const filtered = DEFAULT_REVISION_METRICS.filter(m => metricSet.has(m));
      if (filtered.length > 0) setAvailableRevMetrics(filtered);
    });
  }, []);

  useEffect(() => {
    if (filteredByUniverse.length > 0 && selectedTicker &&
        tickers.some(t => t.ticker === selectedTicker) &&
        !filteredByUniverse.find(t => t.ticker === selectedTicker)) {
      setSelectedTicker(filteredByUniverse[0].ticker);
    }
  }, [filteredByUniverse, selectedTicker, tickers]);

  const fetchSeriesData = useCallback(async (
    ticker: string,
    globalDates: string[]
  ): Promise<SeriesData | null> => {
    if (ticker === "__PAIR__") {
      const ratio = await getYahooPairsRatio(pairTickerA, pairTickerB, globalDates);
      if (!ratio || ratio.indices.length < 252) return null;
      const priceDates = ratio.indices.map((idx: number) => globalDates[idx] ?? "");
      return {
        closes: ratio.prices,
        priceDates,
        globalIndices: ratio.indices.slice(),
        revValues: new Array(ratio.prices.length).fill(NaN),
        hasRevisions: false,
      };
    }

    let globalIndices: number[] = [];
    let closes: number[] = [];

    if (inputSelection.kind === "workbook") {
      const wb = await fetchWorkbookSeriesForTicker(ticker, inputSelection);
      if (!wb || wb.closes.length < 252) return null;
      const dateMap = new Map<string, number>();
      for (let i = 0; i < globalDates.length; i++) dateMap.set(globalDates[i], i);
      for (let i = 0; i < wb.closes.length; i++) {
        const idx = dateMap.get(wb.priceDates[i] ?? "");
        if (idx != null && idx >= 0) { globalIndices.push(idx); closes.push(wb.closes[i]); }
      }
      if (globalIndices.length < 252) return null;
    } else {
      const raw = await getTickerRaw(ticker);
      if (!raw || (raw as any).adjCloses.length < 252) return null;
      const filtered = (filterByDateRange as any)(raw, dateRange);
      const dates = filtered.dates.slice(0, filtered.adjCloses.length);
      const dateMap = new Map<string, number>();
      for (let i = 0; i < globalDates.length; i++) dateMap.set(globalDates[i], i);
      for (let i = 0; i < filtered.adjCloses.length; i++) {
        const idx = dateMap.get(dates[i]);
        if (idx != null && idx >= 0) { globalIndices.push(idx); closes.push(filtered.adjCloses[i]); }
      }
      if (globalIndices.length < 252) return null;
    }

    let revValues = new Array(closes.length).fill(NaN);
    let hasRevisions = false;
    if (signalMode === "revision") {
      try {
        const revData = await (getTickerRaw as any)(ticker);
        const metricData = revData?.[selectedRevMetric];
        if (metricData?.length) {
          const revMap = new Map<number, number>();
          for (const [idx, val] of metricData) revMap.set(idx, val);
          revValues = globalIndices.map(idx => revMap.get(idx) ?? NaN);
          hasRevisions = revValues.some(v => !isNaN(v));
        }
      } catch {}
    }

    const priceDates = globalIndices.map(idx => globalDates[idx] || "");
    return { closes, priceDates, globalIndices, revValues, hasRevisions };
  }, [pairTickerA, pairTickerB, selectedRevMetric, signalMode, dateRange, inputSelection]);

  const runEvaluate = useCallback(async () => {
    setEvalRunning(true);
    setEvalResult(null);
    setEvalPriceContext(null);
    try {
      const globalDates = await getDates();
      if (runMode === "pair" && (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB)) {
        setEvalRunning(false);
        return;
      }
      let closes: number[], priceDates: string[], globalIndices: number[],
        revValues: number[], hasRevisions: boolean;

      if (runMode === "basket" && basketMode === "combined") {
        if (basketTickers.length === 0) { setEvalRunning(false); return; }
        const basket = (buildBasketOhlc as any)(basketTickers, baskets);
        const basketData = await (getBasketOhlc as any)(basket, dateRange);
        if (!basketData || basketData.closes.length < 252) { setEvalRunning(false); return; }
        const dateMap = new Map<string, number>();
        for (let i = 0; i < globalDates.length; i++) dateMap.set(globalDates[i], i);
        globalIndices = [];
        closes = [];
        for (let i = 0; i < basketData.priceDates.length; i++) {
          const idx = dateMap.get(basketData.priceDates[i]) ?? -1;
          if (idx >= 0) { globalIndices.push(idx); closes.push(basketData.closes[i]); }
        }
        if (closes.length < 252) { setEvalRunning(false); return; }
        priceDates = globalIndices.map(idx => globalDates[idx] || "");
        revValues = new Array(closes.length).fill(NaN);
        hasRevisions = false;
      } else {
        const ticker =
          runMode === "pair" ? "__PAIR__" :
          runMode === "basket" ? (basketTickers[0] ?? "") :
          runMode === "single" ? selectedTicker :
          filteredByUniverse[0]?.ticker ?? "";
        if (!ticker) { setEvalRunning(false); return; }
        const data = await fetchSeriesData(ticker, globalDates);
        if (!data) { setEvalRunning(false); return; }
        ({ closes, priceDates, globalIndices, revValues, hasRevisions } = data);
      }

      const side = evalSide === "long" ? "buy" : "sell";
      const signalIndices: number[] = [];

      if (signalMode === "momentum") {
        const mom = computeMomentumReturn(closes, momentumLookback);
        let prevAbove: boolean | null = null;
        for (let i = momentumLookback; i < closes.length; i++) {
          const val = mom[i];
          if (val === null) { prevAbove = null; continue; }
          const above = val >= evalThreshold;
          if (prevAbove !== null) {
            if (side === "buy" && !prevAbove && above) signalIndices.push(i);
            if (side === "sell" && prevAbove && !above) signalIndices.push(i);
          }
          prevAbove = above;
        }
      } else if (signalMode === "revision") {
        if (!hasRevisions) { setEvalRunning(false); return; }
        const rev = computeRevisionMomentum(revValues, evalRevLookback);
        let prevAbove: boolean | null = null;
        for (let i = evalRevLookback; i < rev.length; i++) {
          const val = rev[i];
          if (val === null) { prevAbove = null; continue; }
          const above = val >= evalThreshold;
          if (prevAbove !== null) {
            if (side === "buy" && !prevAbove && above) signalIndices.push(i);
            if (side === "sell" && prevAbove && !above) signalIndices.push(i);
          }
          prevAbove = above;
        }
      } else {
        const mom = computeMomentumReturn(closes, momentumLookback);
        const window = 252;
        const warmup = momentumLookback + window;
        let prevAbove: boolean | null = null;
        for (let i = warmup; i < closes.length; i++) {
          const pctile = computePercentileRank(mom, i, window);
          if (pctile === null) { prevAbove = null; continue; }
          const above = pctile >= evalThreshold;
          if (prevAbove !== null) {
            if (side === "buy" && !prevAbove && above) signalIndices.push(i);
            if (side === "sell" && prevAbove && !above) signalIndices.push(i);
          }
          prevAbove = above;
        }
      }

      signalIndices.sort((a, b) => a - b);
      const evalRes = (evaluateSignals as any)(closes, priceDates, signalIndices, evalSide, targetReturn, minHold, null, "3M");
      setEvalResult(evalRes);
      setEvalPriceContext({
        prices: closes,
        highs: closes.slice(),
        lows: closes.slice(),
        volumes: null,
        dates: priceDates,
        globalIndices,
        benchmarkPrices: null,
        mode: runMode === "pair" ? "pair" : "single",
        pairLegA: runMode === "pair" ? pairTickerA : undefined,
        pairLegB: runMode === "pair" ? pairTickerB : undefined,
      });
    } finally {
      setEvalRunning(false);
    }
  }, [runMode, selectedTicker, pairTickerA, pairTickerB, basketTickers, basketMode, baskets,
      dateRange, signalMode, momentumLookback, evalThreshold, evalRevLookback, evalRevMetric,
      evalSide, targetReturn, minHold, fetchSeriesData, filteredByUniverse]);

  const setupLabel = useMemo(() => {
    const hLabel = MOMENTUM_HORIZONS.find(h => h.days === momentumLookback)?.label ?? `${momentumLookback}d`;
    if (signalMode === "momentum") return `Mom ${hLabel} >${(evalThreshold * 100).toFixed(0)}% cross`;
    if (signalMode === "revision") return `Rev ${evalRevLookback}d >${(evalThreshold * 100).toFixed(0)}% cross (${evalRevMetric})`;
    return `Pctile ${hLabel} >${(evalThreshold * 100).toFixed(0)}th cross`;
  }, [signalMode, momentumLookback, evalThreshold, evalRevLookback, evalRevMetric]);

  const tickerLabel = useMemo(() =>
    runMode === "pair" ? `${pairTickerA || "A"}/${pairTickerB || "B"}` :
    runMode === "single" ? selectedTicker || "—" :
    filteredByUniverse[0]?.ticker || "—",
    [runMode, pairTickerA, pairTickerB, selectedTicker, filteredByUniverse]
  );

  const runOptimizer = useCallback(async () => {
    setRunning(true);
    setResults([]);
    cancelRef.current = false;
    const globalDates = await getDates();

    let tickersToRun: { ticker: string; name: string; pairA?: string; pairB?: string }[];

    if (runMode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
        setRunning(false); return;
      }
      tickersToRun = [{ ticker: `${pairTickerA}/${pairTickerB}`, name: `${pairTickerA}/${pairTickerB}` }];
    } else if (runMode === "pairCombo") {
      if (pairComboPicker.pairs.length === 0) { setRunning(false); return; }
      tickersToRun = pairComboPicker.pairs.map((p: any) => ({
        ticker: p.label, name: p.label, pairA: p.a, pairB: p.b,
      }));
    } else if (runMode === "single") {
      tickersToRun = filteredByUniverse.filter(t => t.ticker === selectedTicker);
    } else if (runMode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) { setRunning(false); return; }
        const basket = (buildBasketOhlc as any)(basketTickers, baskets);
        tickersToRun = [{ ticker: `BASKET:${basket.name}`, name: `BASKET:${basket.name}` }];
      } else {
        tickersToRun = basketTickers.map(t =>
          filteredByUniverse.find(m => m.ticker.toUpperCase() === t.toUpperCase()) ?? { ticker: t, name: t }
        );
      }
    } else {
      tickersToRun = filteredTickers;
    }

    if (tickersToRun.length === 0) { setRunning(false); return; }

    setProgress({ current: 0, total: tickersToRun.length });
    const combinedBasket =
      runMode === "basket" && basketMode === "combined"
        ? (buildBasketOhlc as any)(basketTickers, baskets)
        : null;

    const accumulated: MomentumTickerResult[] = [];

    for (let s = 0; s < tickersToRun.length && !cancelRef.current; s++) {
      const entry = tickersToRun[s];
      setProgress({ current: s + 1, total: tickersToRun.length });
      try {
        let globalIndices: number[], closes: number[],
          revValues: number[], hasRevisions: boolean;

        if (runMode === "pair" || runMode === "pairCombo") {
          const legA = runMode === "pairCombo" ? entry.pairA! : pairTickerA;
          const legB = runMode === "pairCombo" ? entry.pairB! : pairTickerB;
          const ratio = await getYahooPairsRatio(legA, legB, globalDates);
          if (!ratio || ratio.indices.length < 252) continue;
          globalIndices = ratio.indices.slice();
          closes = ratio.prices.slice();
          revValues = new Array(globalIndices.length).fill(NaN);
          hasRevisions = false;
        } else if (combinedBasket) {
          const basketData = await (getBasketOhlc as any)(combinedBasket, dateRange);
          if (!basketData || basketData.closes.length < 252) continue;
          const dateMap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dateMap.set(globalDates[i], i);
          globalIndices = [];
          closes = [];
          for (let i = 0; i < basketData.priceDates.length; i++) {
            const idx = dateMap.get(basketData.priceDates[i]) ?? -1;
            if (idx >= 0) { globalIndices.push(idx); closes.push(basketData.closes[i]); }
          }
          if (closes.length < 252) continue;
          revValues = new Array(closes.length).fill(NaN);
          hasRevisions = false;
        } else {
          globalIndices = [];
          closes = [];
          if (inputSelection.kind === "workbook") {
            const wb = await fetchWorkbookSeriesForTicker(entry.ticker, inputSelection);
            if (!wb || wb.closes.length < 252) continue;
            const dateMap = new Map<string, number>();
            for (let i = 0; i < globalDates.length; i++) dateMap.set(globalDates[i], i);
            for (let i = 0; i < wb.closes.length; i++) {
              const idx = dateMap.get(wb.priceDates[i] ?? "");
              if (idx != null && idx >= 0) { globalIndices.push(idx); closes.push(wb.closes[i]); }
            }
          } else {
            const raw = await getTickerRaw(entry.ticker);
            if (!raw || (raw as any).adjCloses.length < 252) continue;
            const filtered = (filterByDateRange as any)(raw, dateRange);
            const dates = filtered.dates.slice(0, filtered.adjCloses.length);
            const dateMap = new Map<string, number>();
            for (let i = 0; i < globalDates.length; i++) dateMap.set(globalDates[i], i);
            for (let i = 0; i < filtered.adjCloses.length; i++) {
              const idx = dateMap.get(dates[i]);
              if (idx != null && idx >= 0) { globalIndices.push(idx); closes.push(filtered.adjCloses[i]); }
            }
          }
          if (globalIndices.length < 252) continue;
          revValues = new Array(closes.length).fill(NaN);
          hasRevisions = false;
          try {
            const revRaw = await (getTickerRaw as any)(entry.ticker);
            const metricData = revRaw?.[selectedRevMetric];
            if (metricData?.length) {
              const revMap = new Map<number, number>();
              for (const [idx, val] of metricData) revMap.set(idx, val);
              revValues = globalIndices.map(idx => revMap.get(idx) ?? NaN);
              hasRevisions = revValues.some(v => !isNaN(v));
            }
          } catch {}
        }

        const priceDates = globalIndices.map(idx => globalDates[idx] || "");
        const actualFreq = (runMode === "pair" || runMode === "pairCombo" ? "daily" : frequency) as string;
        const fKey = runMode === "pair" || runMode === "pairCombo" ? "daily" : freqKey;

        // Resample for weekly
        const resampledData = (weeklyDownsample as any)({ dates: priceDates, closes, adjCloses: closes }, fKey);
        const rawPrices = closes;
        let weeklyAgg: any = null;
        let effectivePrices: number[];

        if (actualFreq === "weekly_on_daily" && (weeklyDownsample as any).aggregate) {
          weeklyAgg = (weeklyDownsample as any).aggregate(closes, priceDates);
          effectivePrices = closes;
        } else {
          effectivePrices = resampledData.closes;
        }

        const minLength = fKey === "weekly" ? 52 : 252;
        const effLen = actualFreq === "weekly_on_daily" ? closes.length : effectivePrices.length;
        if (effLen < minLength) continue;

        const configResults: MomentumConfigResult[] = [];

        for (const horizonCfg of MOMENTUM_HORIZONS) {
          const horizonDays = fKey === "weekly"
            ? Math.max(1, Math.round(horizonCfg.days / 5))
            : horizonCfg.days;

          let momSeries: (number | null)[];
          if (actualFreq === "weekly_on_daily" && weeklyAgg) {
            const weeklyHorizon = Math.max(1, Math.round(horizonCfg.days / 5));
            const weeklyMom = computeMomentumReturn(weeklyAgg.prices, weeklyHorizon);
            // Expand back to daily using weekIndex
            momSeries = weeklyMom.map(v => v === null ? NaN : v) as any;
            momSeries = closes.map(() => null); // placeholder
          } else {
            momSeries = computeMomentumReturn(effectivePrices, horizonDays);
          }

          const revHorizons = hasRevisions ? REVISION_HORIZONS : [{ days: 63, label: "3M" }];

          for (const revHorizon of revHorizons) {
            const revMom: (number | null)[] | null = hasRevisions
              ? computeRevisionMomentum(revValues, revHorizon.days)
              : null;

            const catAccumulator: Record<string, ForwardReturnProfile[]> = {
              momentum_buy: [], momentum_sell: [], reversal_buy: [],
              reversal_sell: [], oversold_quality: [], value_trap: [],
            };

            let prevCategory: string | null = null;
            const isWeeklyOnDaily = actualFreq === "weekly_on_daily";
            const pctileWindow = fKey === "weekly" || isWeeklyOnDaily ? 52 : 252;
            const warmup = Math.max(
              horizonDays + (fKey === "weekly" || isWeeklyOnDaily ? 52 : 252),
              fKey === "weekly" ? Math.round(revHorizon.days / 5) : revHorizon.days
            );
            const effectiveLen = isWeeklyOnDaily ? closes.length : effectivePrices.length;

            for (let i = warmup; i < effectiveLen; i++) {
              const momVal = momSeries[i];
              if (momVal === null) continue;
              const pctile = computePercentileRank(momSeries, i, pctileWindow);
              if (pctile === null) continue;

              const dailyIdx = isWeeklyOnDaily ? i : (resampledData.dailyIndexMap?.[i] ?? i);
              let revTrend: "positive" | "negative" | "neutral" = "neutral";
              if (revMom && dailyIdx !== undefined && revMom[dailyIdx] !== null) {
                if (revMom[dailyIdx]! > revThreshold) revTrend = "positive";
                else if (revMom[dailyIdx]! < -revThreshold) revTrend = "negative";
              }

              const isTopQ = pctile >= 1 - momThreshold;
              const isBottomQ = pctile <= momThreshold;
              const isDeepBottom = pctile <= momThreshold / 2;

              let category: string | null = null;
              if (isDeepBottom && revTrend === "positive") category = "oversold_quality";
              else if (isDeepBottom && revTrend === "negative") category = "value_trap";
              else if (isBottomQ && revTrend !== "negative") category = "reversal_buy";
              else if (isTopQ && revTrend === "negative") category = "reversal_sell";
              else if (isTopQ && revTrend !== "negative") category = "momentum_buy";
              else if (isBottomQ && revTrend === "negative") category = "momentum_sell";

              if (category !== null) {
                if (category !== prevCategory) {
                  const isBuy = ["momentum_buy", "reversal_buy", "oversold_quality"].includes(category);
                  const dir = isBuy ? "buy" : "sell";
                  const bandOpts = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
                  const entryIdx = fKey === "weekly" && !isWeeklyOnDaily
                    ? (getDailyIndexFromWeekly as any)(i, resampledData, { closes })
                    : i;
                  if (entryIdx < 0) { prevCategory = category; continue; }
                  catAccumulator[category].push(
                    (computeForwardProfile as any)(rawPrices, entryIdx, targetReturn, dir, bandOpts, minHold)
                  );
                }
                prevCategory = category;
              }
            }

            const categoryResults: MomentumCategoryResult[] = [];
            for (const [cat, profiles] of Object.entries(catAccumulator)) {
              const isBuy = ["momentum_buy", "reversal_buy", "oversold_quality"].includes(cat);
              const dir = isBuy ? "buy" : "sell";
              const isBand = returnMode === "band";
              const summary = summarizeSignals(profiles, dir);
              const composite = computeCompositeScore(summary, dir, isBand);
              categoryResults.push({
                category: cat,
                label: SIGNAL_CATEGORY_META[cat].label,
                description: SIGNAL_CATEGORY_META[cat].description,
                summary,
                composite,
                profiles,
              });
            }

            const bestCat = categoryResults.reduce(
              (a, b) => a.composite.score > b.composite.score ? a : b,
              categoryResults[0]
            );

            configResults.push({
              config: {
                lookback: horizonCfg.days,
                lookbackLabel: horizonCfg.label,
                revisionMetric: selectedRevMetric,
                revisionLookback: revHorizon.days,
              },
              categories: categoryResults,
              bestCategory: bestCat.category,
              bestScore: bestCat.composite.score,
            });
          }
        }

        if (configResults.length === 0) continue;
        const bestConfig = configResults.reduce((a, b) => a.bestScore > b.bestScore ? a : b);

        // Determine current signal
        let currentSignal = "None";
        {
          const hDays = bestConfig.config.lookback;
          const hDaysEff = fKey === "weekly" ? Math.max(1, Math.round(hDays / 5)) : hDays;
          const isWeeklyOnDailyNow = actualFreq === "weekly_on_daily";
          const momNow = computeMomentumReturn(effectivePrices, hDaysEff);
          const pctileWindow2 = fKey === "weekly" || isWeeklyOnDailyNow ? 52 : 252;
          const lastIdx = isWeeklyOnDailyNow ? closes.length - 1 : effectivePrices.length - 1;
          const lastPctile = computePercentileRank(momNow, lastIdx, pctileWindow2);
          const revNow = hasRevisions ? computeRevisionMomentum(revValues, bestConfig.config.revisionLookback) : null;
          const lastRevVal = revNow && lastIdx >= 0 ? revNow[lastIdx] : null;

          if (lastPctile !== null) {
            const isTopQ = lastPctile >= 1 - momThreshold;
            const isBottomQ = lastPctile <= momThreshold;
            const isDeepBottom = lastPctile <= momThreshold / 2;
            const revTrend = lastRevVal !== null
              ? (lastRevVal > revThreshold ? "positive" : lastRevVal < -revThreshold ? "negative" : "neutral")
              : "neutral";

            if (isDeepBottom && revTrend === "positive") currentSignal = "Deep Value";
            else if (isDeepBottom && revTrend === "negative") currentSignal = "Value Trap";
            else if (isBottomQ && revTrend !== "negative") currentSignal = "Oversold Quality";
            else if (isTopQ && revTrend === "negative") currentSignal = "Overbought Fade";
            else if (isTopQ && revTrend !== "negative") currentSignal = "Momentum Long";
            else if (isBottomQ && revTrend === "negative") currentSignal = "Momentum Short";
          }
        }

        // Trim profile arrays for non-top configs
        const sortedConfigs = [...configResults].sort((a, b) => b.bestScore - a.bestScore);
        const topSet = new Set(sortedConfigs.slice(0, MAX_EXPAND));
        for (const cfg of configResults) {
          if (!topSet.has(cfg)) {
            for (const cat of cfg.categories) cat.profiles = undefined;
          }
        }

        const priceContext = {
          prices: rawPrices,
          highs: rawPrices.slice(),
          lows: rawPrices.slice(),
          volumes: null,
          dates: priceDates,
          globalIndices: globalIndices.slice(),
          benchmarkPrices: null,
          mode: runMode === "pair" || runMode === "pairCombo" ? "pair" : "single",
          pairLegA: runMode === "pairCombo" ? entry.pairA : runMode === "pair" ? pairTickerA : undefined,
          pairLegB: runMode === "pairCombo" ? entry.pairB : runMode === "pair" ? pairTickerB : undefined,
        };

        accumulated.push({
          ticker: entry.ticker,
          name: entry.name,
          configs: configResults,
          bestCategory: SIGNAL_CATEGORY_META[bestConfig.bestCategory].label,
          bestScore: bestConfig.bestScore,
          currentSignal,
          priceContext,
        });

        if (s % 5 === 0 || s === tickersToRun.length - 1) {
          setResults([...accumulated]);
        }
      } catch {}
    }

    setResults(accumulated);
    setRunning(false);
  }, [filteredByUniverse, selectedTicker, pairTickerA, pairTickerB, basketTickers, basketMode,
      baskets, selectedRevMetric, momThreshold, revThreshold, targetReturn, runMode, returnMode,
      bandMin, bandMax, minHold, frequency, freqKey, dateRange, pairComboPicker.pairs,
      inputSelection, filteredTickers]);

  // ── Serialize / hydrate ──

  const serializeState = useCallback(() => ({
    selectedTicker,
    pairTickerA,
    pairTickerB,
    basketTickers,
    basketMode,
    targetReturn,
    selectedRevMetric,
    momThreshold,
    revThreshold,
    mode: runMode,
    results,
    expandedTicker,
    sortBy,
    returnMode,
    bandMin,
    bandMax,
    frequency,
    pairCombo: pairComboPicker.serialize(),
    inputSelection,
  }), [selectedTicker, pairTickerA, pairTickerB, basketTickers, basketMode, targetReturn,
      selectedRevMetric, momThreshold, revThreshold, runMode, results, expandedTicker, sortBy,
      returnMode, bandMin, bandMax, frequency, pairComboPicker, inputSelection]);

  const hydrateState = useCallback((saved: any) => {
    if (!saved) return;
    if (saved.selectedTicker) { setSelectedTicker(saved.selectedTicker); tickerSetRef.current = true; }
    if (saved.pairTickerA) setPairTickerA(saved.pairTickerA);
    if (saved.pairTickerB) setPairTickerB(saved.pairTickerB);
    if (saved.mode === "single" || saved.mode === "universe" || saved.mode === "pair" ||
        saved.mode === "pairCombo" || saved.mode === "basket") setRunMode(saved.mode);
    if (saved.pairCombo) pairComboPicker.hydrate(saved.pairCombo);
    if (Array.isArray(saved.basketTickers)) setBasketTickers(saved.basketTickers.filter((t: any) => typeof t === "string"));
    if (saved.basketMode === "stocks" || saved.basketMode === "combined") setBasketMode(saved.basketMode);
    if (typeof saved.targetReturn === "number") setTargetReturn(saved.targetReturn);
    if (saved.returnMode) setReturnMode(saved.returnMode);
    if (typeof saved.bandMin === "number") setBandMin(saved.bandMin);
    if (typeof saved.bandMax === "number") setBandMax(saved.bandMax);
    if (saved.selectedRevMetric) setSelectedRevMetric(saved.selectedRevMetric);
    if (typeof saved.momThreshold === "number") setMomThreshold(saved.momThreshold);
    if (typeof saved.revThreshold === "number") setRevThreshold(saved.revThreshold);
    if (Array.isArray(saved.results)) setResults(saved.results);
    if (saved.expandedTicker !== undefined) setExpandedTicker(saved.expandedTicker);
    if (saved.sortBy) setSortBy(saved.sortBy);
    if (saved.frequency === "daily" || saved.frequency === "weekly" || saved.frequency === "weekly_on_daily") {
      setFrequency(saved.frequency);
    } else if (saved.timeframe === "weekly") {
      setFrequency("weekly");
    }
    if (saved.inputSelection && typeof saved.inputSelection === "object") {
      const sel = saved.inputSelection;
      if (sel.kind === "close") setInputSelection({ kind: "close" as any });
      else if (sel.kind === "workbook" && typeof sel.metric === "string") setInputSelection({ kind: "workbook", metric: sel.metric });
    }
  }, [pairComboPicker, setResults, setFrequency, setInputSelection, setBasketMode]);

  useWorkspaceTab("momentum-optimizer", serializeState, hydrateState);

  // ── Derived sorted results ──

  const scoredResults = useMemo(() =>
    results.map(r => ({
      ...r,
      configs: r.configs.map(cfg => {
        let bestScore = -Infinity;
        let bestCategory = cfg.bestCategory;
        for (const cat of cfg.categories) {
          const isBuy = ["momentum_buy", "reversal_buy", "oversold_quality"].includes(cat.category);
          const dir = isBuy ? "buy" : "sell";
          const s = (pickBestByRankMode as any)(cat.summary, cat.composite.score, dir, scoreWeights);
          if (s > bestScore) { bestScore = s; bestCategory = cat.category; }
        }
        return { ...cfg, bestScore, bestCategory };
      }),
      bestScore: (() => {
        let best = -Infinity;
        for (const cfg of r.configs) {
          for (const cat of cfg.categories) {
            const isBuy = ["momentum_buy", "reversal_buy", "oversold_quality"].includes(cat.category);
            const dir = isBuy ? "buy" : "sell";
            const s = (pickBestByRankMode as any)(cat.summary, cat.composite.score, dir, scoreWeights);
            if (s > best) best = s;
          }
        }
        return best;
      })(),
    })),
    [results, scoreWeights]
  );

  const sortedResults = useMemo(() => {
    const arr = [...scoredResults];
    if (sortBy === "score") arr.sort((a, b) => b.bestScore - a.bestScore);
    else if (sortBy === "ticker") arr.sort((a, b) => a.ticker.localeCompare(b.ticker));
    else arr.sort((a, b) => a.currentSignal.localeCompare(b.currentSignal));
    return arr;
  }, [scoredResults, sortBy]);

  const exportCsv = () => {
    if (!sortedResults || sortedResults.length === 0) return;
    const horizons = FORWARD_HORIZONS.filter((_, i) => i >= 2);
    const rows = sortedResults.map(r => {
      const bestCfg = r.configs.reduce((a, b) => a.bestScore > b.bestScore ? a : b, r.configs[0]);
      const bestCatResult = bestCfg?.categories.reduce((a, b) => a.composite.score > b.composite.score ? a : b, bestCfg.categories[0])?.summary;
      const row: Record<string, any> = {
        ticker: r.ticker,
        name: r.name,
        currentSignal: r.currentSignal,
        bestCategory: r.bestCategory,
        bestScore: r.bestScore,
      };
      horizons.forEach(h => {
        row[`hitRate_${h.label}`] = bestCatResult?.hitRate[h.label] ?? null;
        row[`avgReturn_${h.label}`] = bestCatResult?.avgReturn[h.label] ?? null;
      });
      return row;
    });
    const keys = Object.keys(rows[0] || {});
    const csv = [keys.join(","), ...rows.map(r => keys.map(k => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "momentum_optimizer.csv";
    a.click();
  };

  const signalBadgeClass = (signal: string): string => {
    switch (signal) {
      case "Deep Value": return "bg-emerald-600/30 text-emerald-400 border-emerald-600/40";
      case "Oversold Quality": return "bg-green-600/20 text-green-400 border-green-600/30";
      case "Momentum Long": return "bg-blue-600/20 text-blue-400 border-blue-600/30";
      case "Overbought Fade": return "bg-orange-600/20 text-orange-400 border-orange-600/30";
      case "Momentum Short": return "bg-red-600/20 text-red-400 border-red-600/30";
      case "Value Trap": return "bg-red-800/30 text-red-300 border-red-800/40";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  // ── Render ──

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">Momentum / Reversal</h2>
        <div className="flex gap-px">
          <button
            data-testid="mom-view-optimize"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${activeTab === "optimize" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setActiveTab("optimize")}
          >Optimize</button>
          <button
            data-testid="mom-view-evaluate"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${activeTab === "evaluate" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setActiveTab("evaluate")}
          >Evaluate</button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {activeTab === "optimize" ? "Search parameter space by hit rate" : "Score one specific setup"}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
          <div className="flex items-center gap-0.5">
            {DATE_PRESETS.map((preset: any) => (
              <button
                key={preset.value}
                data-testid={`mom-date-preset-${preset.value}`}
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === preset.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}
                onClick={() => { setDatePreset(preset.value); setDateRange(createDateRangeFromPreset(preset.value as any)); }}
              >{preset.label}</button>
            ))}
          </div>
          <input
            type="date"
            data-testid="mom-date-start"
            value={(dateRange as any).start}
            onChange={e => { setDatePreset("custom"); setDateRange({ ...(dateRange as any), start: e.target.value }); }}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
          />
          <span className="text-[10px] font-mono text-muted-foreground">→</span>
          <input
            type="date"
            data-testid="mom-date-end"
            value={(dateRange as any).end}
            onChange={e => { setDatePreset("custom"); setDateRange({ ...(dateRange as any), end: e.target.value }); }}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
          />
        </div>
      </div>

      {activeTab === "evaluate" ? (
        <>
          {/* Evaluate toolbar */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-start gap-4 flex-wrap">
              {/* Mode */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  {(["single", "pair"] as const).map(m => (
                    <button
                      key={m}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${runMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setRunMode(m)}
                    >{m === "single" ? "Single" : "Pair"}</button>
                  ))}
                </div>
              </div>
              {runMode === "single" && (
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
                    <BasketTickerPill activeTicker={selectedTicker} onSelectTicker={setSelectedTicker} fallbackTicker={filteredByUniverse[0]?.ticker ?? null} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                    <InputSeriesPicker value={inputSelection} onChange={setInputSelection} family="momentum" label="" />
                  </div>
                </div>
              )}
              {runMode === "pair" && (
                <>
                  <UnifiedTickerPicker tickers={filteredByUniverse} value={pairTickerA} onChange={setPairTickerA} label="Ticker A" />
                  <UnifiedTickerPicker tickers={filteredByUniverse} value={pairTickerB} onChange={setPairTickerB} label="Ticker B" />
                </>
              )}
              {/* Side */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Side</label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSide === "long" ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setEvalSide("long")}
                  >Long</button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSide === "short" ? "bg-red-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setEvalSide("short")}
                  >Short</button>
                </div>
              </div>
              {/* Signal Mode */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal Mode</label>
                <div className="flex gap-px">
                  {(["momentum", "revision", "percentile"] as const).map(m => (
                    <button
                      key={m}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${signalMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setSignalMode(m)}
                    >{m === "momentum" ? "Momentum" : m === "revision" ? "Revision" : "Percentile"}</button>
                  ))}
                </div>
              </div>
              {(signalMode === "momentum" || signalMode === "percentile") && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Lookback</label>
                  <select
                    className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground"
                    value={momentumLookback}
                    onChange={e => setMomentumLookback(Number(e.target.value))}
                  >
                    {MOMENTUM_HORIZONS.map(h => <option key={h.days} value={h.days}>{h.label}</option>)}
                  </select>
                </div>
              )}
              {signalMode === "revision" && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Rev Metric</label>
                    <select
                      className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground min-w-[100px]"
                      value={evalRevMetric}
                      onChange={e => setEvalRevMetric(e.target.value)}
                    >
                      {availableRevMetrics.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Rev Lookback</label>
                    <select
                      className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground"
                      value={evalRevLookback}
                      onChange={e => setEvalRevLookback(Number(e.target.value))}
                    >
                      {REVISION_HORIZONS.map(h => <option key={h.days} value={h.days}>{h.label}</option>)}
                    </select>
                  </div>
                </>
              )}
              {/* Threshold */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  {signalMode === "percentile" ? "Pctile Thresh" : "Threshold %"}
                </label>
                <input
                  type="number"
                  step={signalMode === "percentile" ? 0.05 : 1}
                  min={signalMode === "percentile" ? 0.01 : -100}
                  max={signalMode === "percentile" ? 0.99 : 1000}
                  value={signalMode === "percentile" ? evalThreshold : +(evalThreshold * 100).toFixed(4)}
                  onChange={e => setEvalThreshold(signalMode === "percentile" ? parseFloat(e.target.value) || 0.5 : (parseFloat(e.target.value) || 5) / 100)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[75px]"
                  title={signalMode === "percentile" ? "Percentile 0–1 (e.g. 0.7 = 70th)" : "Threshold in percent (e.g. 5 = 5%)"}
                />
              </div>
              {/* Target % */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target %</label>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  value={+(targetReturn * 100).toFixed(4)}
                  onChange={e => setTargetReturn((parseFloat(e.target.value) || 5) / 100)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
                />
              </div>
              {/* Hold */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Hold</label>
                <input
                  type="number"
                  min={0}
                  max={252}
                  value={minHold}
                  onChange={e => setMinHold(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                />
              </div>
              {/* Run button */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                <button
                  data-testid="mom-eval-run"
                  className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={runEvaluate}
                  disabled={evalRunning}
                >{evalRunning ? "Evaluating…" : "Evaluate"}</button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <EvaluatorResultPanel result={evalResult} loading={evalRunning} setupLabel={setupLabel} tickerLabel={tickerLabel} />
            {evalResult && evalPriceContext && evalResult.profiles.length >= 10 ? (
              <HitConditionsPanel
                ticker={evalPriceContext.mode === "pair" ? (evalPriceContext.pairLegA || "") : (selectedTicker || filteredByUniverse[0]?.ticker || "")}
                priceContext={evalPriceContext}
                signals={evalResult.profiles}
                direction={evalSide === "long" ? "buy" : "sell"}
                title={`Hit Conditions — ${setupLabel} on ${tickerLabel}`}
                useBand={false}
              />
            ) : null}
          </div>
        </>
      ) : (
        <>
          {/* Optimize toolbar */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground tracking-tight">Momentum / Reversal</h2>
                  {isFiltered && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                      {filteredByUniverse.length}/{tickers.length}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Cross momentum with estimate revisions to classify: momentum, oversold quality, value trap, overbought fade
                </p>
              </div>
              {/* Revision Metric */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Revision Metric</label>
                <select
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[110px]"
                  value={selectedRevMetric}
                  onChange={e => setSelectedRevMetric(e.target.value)}
                  disabled={running}
                >
                  {availableRevMetrics.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {frequencyUI}
              {/* Mode */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  {(["single", "universe", "pair", "pairCombo", "basket"] as const).map(m => (
                    <button
                      key={m}
                      data-testid={`optimizer-mode-${m}`}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${runMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setRunMode(m)}
                      disabled={running}
                    >
                      {m === "single" ? "Single Ticker" : m === "universe" ? "Universe" : m === "pair" ? "Pair (A/B)" : m === "pairCombo" ? "Pair Combo" : "Basket"}
                    </button>
                  ))}
                </div>
              </div>
              {runMode === "pair" && (
                <div className="flex items-end gap-2">
                  <UnifiedTickerPicker tickers={filteredByUniverse} value={pairTickerA} onChange={setPairTickerA} disabled={running} label="A" />
                  <UnifiedTickerPicker tickers={filteredByUniverse} value={pairTickerB} onChange={setPairTickerB} disabled={running} label="B" />
                  <span className="text-[10px] font-mono text-muted-foreground pb-1">
                    Ratio: <span className="text-foreground font-bold">{pairTickerA || "A"}/{pairTickerB || "B"}</span>
                  </span>
                </div>
              )}
              {runMode === "basket" && (
                <div className="flex flex-col gap-2">
                  <BasketPicker tickers={filteredByUniverse} value={basketTickers} onChange={setBasketTickers} disabled={running} testIdPrefix="momentum-basket" />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket Run Mode</label>
                    <div className="flex gap-px" data-testid="momentum-basket-mode">
                      {(["stocks", "combined"] as const).map(m => (
                        <button
                          key={m}
                          data-testid={`momentum-basket-mode-${m}`}
                          className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${basketMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                          onClick={() => setBasketMode(m)}
                          disabled={running}
                          title={m === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme"}
                        >
                          {m === "stocks" ? "Stock by Stock" : "Combined"}
                        </button>
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
              {runMode === "universe" && classFilter.classFilterUI && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Classification Filter</label>
                  {classFilter.universeSourceUI}
                  {classFilter.classFilterUI}
                </div>
              )}
              {runMode === "single" && (
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker</label>
                    <select
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]"
                      value={selectedTicker}
                      onChange={e => setSelectedTicker(e.target.value)}
                      disabled={running}
                    >
                      {filteredByUniverse.map(t => <option key={t.ticker} value={t.ticker}>{t.ticker}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                    <InputSeriesPicker value={inputSelection} onChange={setInputSelection} family="momentum" label="" />
                  </div>
                </div>
              )}
              {/* Return Measure */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Return Measure</label>
                <div className="flex gap-px">
                  {(["threshold", "band"] as const).map(m => (
                    <button
                      key={m}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${returnMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setReturnMode(m)}
                      disabled={running}
                    >{m === "threshold" ? "Threshold" : "Band"}</button>
                  ))}
                </div>
              </div>
              {returnMode === "threshold" ? (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target</label>
                  <select
                    className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]"
                    value={targetReturn}
                    onChange={e => setTargetReturn(Number(e.target.value))}
                    disabled={running}
                  >
                    {TARGET_RETURN_OPTIONS.map((opt: any) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                      onChange={e => {
                        const [mn, mx] = e.target.value.split("-").map(Number);
                        setBandMin(mn); setBandMax(mx);
                      }}
                      disabled={running}
                    >
                      {RETURN_BAND_PRESETS.map((p: any) => (
                        <option key={p.label} value={`${p.band.minReturn}-${p.band.maxReturn}`}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min %</label>
                    <input
                      type="number" step="1" min="0" max="100"
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                      value={Math.round(bandMin * 100)}
                      onChange={e => setBandMin(Number(e.target.value) / 100)}
                      disabled={running}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Max %</label>
                    <input
                      type="number" step="1" min="0" max="100"
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                      value={Math.round(bandMax * 100)}
                      onChange={e => setBandMax(Number(e.target.value) / 100)}
                      disabled={running}
                    />
                  </div>
                </>
              )}
              {/* Mom %ile */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mom %ile</label>
                <select
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[60px]"
                  value={momThreshold}
                  onChange={e => setMomThreshold(Number(e.target.value))}
                  disabled={running}
                >
                  <option value={0.10}>10%</option>
                  <option value={0.15}>15%</option>
                  <option value={0.20}>20%</option>
                  <option value={0.25}>25%</option>
                  <option value={0.30}>30%</option>
                </select>
              </div>
              {/* Rev Δ */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Rev Δ</label>
                <select
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[60px]"
                  value={revThreshold}
                  onChange={e => setRevThreshold(Number(e.target.value))}
                  disabled={running}
                >
                  <option value={0.01}>1%</option>
                  <option value={0.02}>2%</option>
                  <option value={0.03}>3%</option>
                  <option value={0.05}>5%</option>
                </select>
              </div>
              {/* Min Hold */}
              <div className="flex flex-col gap-0.5">
                <label
                  className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"
                  title="Minimum holding period (trading days). Hit/peak/trough detection ignores the first N days."
                >Min Hold</label>
                <input
                  type="number" min={0} max={252} step={1}
                  value={minHold}
                  onChange={e => setMinHold(Math.max(0, Math.min(252, parseInt(e.target.value, 10) || 0)))}
                  disabled={running}
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[60px]"
                  title="Trading days"
                />
              </div>
              {/* Run / Cancel */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                {running ? (
                  <button
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500"
                    onClick={() => { cancelRef.current = true; }}
                  >Cancel ({progress.current}/{progress.total})</button>
                ) : (
                  <button
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={runOptimizer}
                  >Run Optimizer</button>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto px-4 py-3">
            {results.length === 0 && !running && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Cross-references price momentum with estimate revision direction to classify buy/sell signals
              </div>
            )}
            {running && results.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">Classifying signals...</div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {progress.current}/{progress.total} tickers × {MOMENTUM_HORIZONS.length} windows × {REVISION_HORIZONS.length} rev windows
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
            {sortedResults.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    {sortedResults.length} tickers — {selectedRevMetric} revisions —{" "}
                    {returnMode === "band" ? `band ${pct(bandMin)}–${pct(bandMax)}` : `target ${pct(targetReturn)}`}
                  </h3>
                  <div className="flex items-center gap-1">
                    {(["score", "signal", "ticker"] as const).map(s => (
                      <button
                        key={s}
                        className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`}
                        onClick={() => setSortBy(s)}
                      >{s === "score" ? "Score" : s === "signal" ? "Signal" : "Ticker"}</button>
                    ))}
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-mono text-muted-foreground">RANK BY</label>
                      <select
                        data-testid="mom-rank-by"
                        value={rankBy}
                        onChange={e => setRankBy(e.target.value)}
                        className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5"
                      >
                        {RANK_BY_OPTIONS.map((opt: any) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={exportCsv} data-testid="export-csv">
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-border rounded mb-4">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="bg-card text-muted-foreground">
                        <th className="text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border">Ticker</th>
                        <th className="text-center px-2 py-1 font-bold">Current Signal</th>
                        <th className="text-center px-2 py-1 font-bold">Best Category</th>
                        {FORWARD_HORIZONS.filter((_, i) => i >= 2).map(h => (
                          <th key={h.label} className="text-center px-2 py-1 font-bold">
                            {returnMode === "band" ? "Band" : "Hit"} {h.label}
                          </th>
                        ))}
                        {FORWARD_HORIZONS.filter((_, i) => i >= 2).map(h => (
                          <th key={`avg-${h.label}`} className="text-center px-2 py-1 font-bold">Avg {h.label}</th>
                        ))}
                        {FORWARD_HORIZONS.filter((_, i) => i >= 2).map(h => (
                          <th key={`pf-${h.label}`} className="text-center px-2 py-1 font-bold">PF {h.label}</th>
                        ))}
                        <th className="text-center px-2 py-1 font-bold">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedResults.map(r => {
                        const isExpanded = expandedTicker === r.ticker;
                        const bestCfg = r.configs.reduce((a, b) => a.bestScore > b.bestScore ? a : b, r.configs[0]);
                        const bestSummary = bestCfg?.categories.reduce((a, b) => a.composite.score > b.composite.score ? a : b, bestCfg.categories[0])?.summary;
                        return (
                          <tr
                            key={r.ticker}
                            className={`${isExpanded ? "bg-primary/10" : "hover:bg-white/5"} cursor-pointer`}
                            onClick={() => setExpandedTicker(isExpanded ? null : r.ticker)}
                          >
                            <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border">{r.ticker}</td>
                            <td className="text-center px-2 py-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${signalBadgeClass(r.currentSignal)}`}>
                                {r.currentSignal}
                              </span>
                            </td>
                            <td className="text-center px-2 py-1 text-primary font-bold">{r.bestCategory}</td>
                            {FORWARD_HORIZONS.filter((_, i) => i >= 2).map(h => {
                              const val = bestSummary ? (returnMode === "band" ? (bestSummary.bandHitRate?.[h.label] ?? bestSummary.hitRate[h.label]) : bestSummary.hitRate[h.label]) : 0;
                              return (
                                <td key={h.label} className={`text-center px-2 py-1 ${bestSummary ? hitRateColor(val) : ""}`}>
                                  {bestSummary ? pct(val) : "–"}
                                </td>
                              );
                            })}
                            {FORWARD_HORIZONS.filter((_, i) => i >= 2).map(h => (
                              <td key={`avg-${h.label}`} className={`text-center px-2 py-1 ${bestSummary ? (bestSummary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400") : ""}`}>
                                {bestSummary ? pctSigned(bestSummary.avgReturn[h.label]) : "–"}
                              </td>
                            ))}
                            {FORWARD_HORIZONS.filter((_, i) => i >= 2).map(h => (
                              <td key={`pf-${h.label}`} className={`text-center px-2 py-1 ${bestSummary ? profitFactorColor(bestSummary.profitFactor[h.label]) : ""}`}>
                                {bestSummary ? (bestSummary.profitFactor[h.label] >= 99 ? "∞" : bestSummary.profitFactor[h.label].toFixed(2)) : "–"}
                              </td>
                            ))}
                            <td className="text-center px-2 py-1">
                              <span
                                className="inline-block px-1.5 py-0.5 rounded font-bold"
                                style={{ backgroundColor: scoreBackgroundColor(r.bestScore), color: scoreTextColor(r.bestScore) }}
                              >{r.bestScore}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {expandedTicker && (() => {
                  const r = scoredResults.find(x => x.ticker === expandedTicker);
                  if (!r) return null;
                  const bestCfg = r.configs.reduce((a, b) => a.bestScore > b.bestScore ? a : b, r.configs[0]);
                  return (
                    <div className="border border-border rounded p-3 bg-card/50 mb-4">
                      <h4 className="text-xs font-bold text-foreground mb-1">{r.ticker} — {r.name}</h4>
                      <p className="text-[9px] text-muted-foreground mb-3">
                        Best config: {bestCfg.config.lookbackLabel} momentum × {bestCfg.config.revisionLookback}d revision lookback on {bestCfg.config.revisionMetric}
                      </p>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {bestCfg.categories.filter(cat => cat.summary.count > 0)
                          .sort((a, b) => b.composite.score - a.composite.score)
                          .map(cat => {
                            const hcKey = `${r.ticker}::${cat.category}`;
                            const hcOpen = hitConditionsOpen.has(hcKey);
                            const canShowHC = !!(cat.profiles && cat.profiles.length >= 10 && r.priceContext);
                            const isBuy = ["momentum_buy", "reversal_buy", "oversold_quality"].includes(cat.category);
                            const dir = isBuy ? "buy" : "sell";
                            return (
                              <div key={cat.category} className="border border-border/50 rounded p-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-[10px] font-mono font-bold ${signalBadgeClass(cat.label).split(" ").filter((c: string) => c.startsWith("text-")).join(" ")}`}>
                                    {cat.label}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground">{cat.summary.count} signals</span>
                                  <span
                                    className="ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-bold"
                                    style={{ backgroundColor: scoreBackgroundColor(cat.composite.score), color: scoreTextColor(cat.composite.score) }}
                                  >{cat.composite.score}</span>
                                  {canShowHC ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleHitConditions(hcKey)}
                                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${hcOpen ? "bg-violet-500/25 text-violet-200 border-violet-400/40" : "bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`}
                                      title="Profile what other indicators looked like at hit-bars vs miss-bars"
                                    >{hcOpen ? "▾" : "▸"} HC</button>
                                  ) : null}
                                </div>
                                <p className="text-[8px] text-muted-foreground mb-1">{cat.description}</p>
                                <table className="w-full text-[9px] font-mono">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left px-1 py-0.5">Horizon</th>
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
                                    {FORWARD_HORIZONS.map(h => (
                                      <tr key={h.label}>
                                        <td className="px-1 py-0.5 text-foreground font-bold">{h.label}</td>
                                        <td className={`text-center px-1 py-0.5 ${hitRateColor(cat.summary.hitRate[h.label])}`}>{pct(cat.summary.hitRate[h.label])}</td>
                                        <td className={`text-center px-1 py-0.5 ${hitRateColor(cat.summary.winRate[h.label])}`}>{pct(cat.summary.winRate[h.label])}</td>
                                        <td className={`text-center px-1 py-0.5 ${cat.summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(cat.summary.avgReturn[h.label])}</td>
                                        <td className={`text-center px-1 py-0.5 ${cat.summary.medianReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(cat.summary.medianReturn[h.label])}</td>
                                        <td className="text-center px-1 py-0.5 text-green-400">{pctSigned(cat.summary.avgPeak[h.label])}</td>
                                        <td className="text-center px-1 py-0.5 text-red-400">{pctSigned(cat.summary.avgTrough[h.label])}</td>
                                        <td className={`text-center px-1 py-0.5 ${profitFactorColor(cat.summary.profitFactor[h.label])}`}>
                                          {cat.summary.profitFactor[h.label] >= 99 ? "∞" : cat.summary.profitFactor[h.label].toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {hcOpen && r.priceContext && cat.profiles ? (
                                  <div className="mt-2">
                                    <HitConditionsPanel
                                      ticker={r.ticker}
                                      priceContext={r.priceContext}
                                      signals={cat.profiles}
                                      direction={dir}
                                      title={`${bestCfg.config.lookbackLabel} × ${bestCfg.config.revisionLookback}d — ${cat.label}`}
                                      useBand={returnMode === "band"}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
