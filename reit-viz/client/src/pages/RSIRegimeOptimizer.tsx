// Reconstructed from recovered-bundle/RSIRegimeOptimizer-DgnHrF3m.js on 2026-06-11
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
import {
  filterByDateRange,
  createDateRange,
  defaultInputSelection,
  isBasketTicker,
} from "@/lib/optimizerInputSeries";
import { getTickers, getDates, getTickerRaw } from "@/lib/dataService";
import type { TickerMeta } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/useBaskets";
import { buildBasketOhlc as buildBasketOhlcFn, getBasketOhlc as getBasketOhlcFn } from "@/lib/basketOhlc";
const buildBasketOhlc = buildBasketOhlcFn as any;
const getBasketOhlc = getBasketOhlcFn as any;
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { weeklyDownsample as resampleWeekly } from "@/lib/weeklyDownsample";
import { getDailyIndexFromWeekly as getDailyIndexFromWeeklyFn } from "@/lib/getDailyIndexFromWeekly";
const getDailyIndexFromWeekly = getDailyIndexFromWeeklyFn as any;
import { fetchWorkbookSeriesForTicker as fetchWorkbookSeriesForTickerFn } from "@/lib/fetchWorkbookSeriesForTicker";
const fetchWorkbookSeriesForTicker = fetchWorkbookSeriesForTickerFn as any;
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { B as BasketTickerPill } from "@/components/BasketTickerPill";
import { B as BasketPicker } from "@/components/BasketPicker";
import {
  e as evaluateSignals,
  E as EvaluatorResultPanel,
  H as HitConditionsPanel,
} from "@/components/EvaluatorPanel";
import { InputSeriesPicker } from "@/components/InputSeriesPicker";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as React from "react";
import "@/lib/harsi";
import "@/lib/tva";

// ── RSI Categories ──────────────────────────────────────────────────────────

const RSI_CATEGORIES = {
  oversold: {
    label: "Oversold Zone",
    description: "RSI in oversold territory — historically cheap momentum, potential bounce",
    direction: "buy",
  },
  neutral_low: {
    label: "Neutral Low",
    description: "RSI between oversold and midpoint — recovering from weakness",
    direction: "buy",
  },
  neutral: {
    label: "Neutral",
    description: "RSI in the middle zone — no strong directional signal",
    direction: "buy",
  },
  neutral_high: {
    label: "Neutral High",
    description: "RSI between midpoint and overbought — strong but not extreme",
    direction: "buy",
  },
  overbought: {
    label: "Overbought Zone",
    description: "RSI in overbought territory — potentially overextended, risk of pullback",
    direction: "sell",
  },
  enter_oversold: {
    label: "Enter Oversold",
    description: "RSI crosses below oversold threshold — transition into weakness",
    direction: "buy",
  },
  exit_oversold: {
    label: "Exit Oversold",
    description: "RSI crosses above oversold threshold — recovery signal",
    direction: "buy",
  },
  enter_overbought: {
    label: "Enter Overbought",
    description: "RSI crosses above overbought threshold — momentum peak",
    direction: "sell",
  },
  exit_overbought: {
    label: "Exit Overbought",
    description: "RSI crosses below overbought threshold — momentum fading",
    direction: "sell",
  },
} as const;

const RSI_PERIODS = [7, 14, 21];
const OS_LEVELS = [20, 25, 30, 35];
const OB_LEVELS = [65, 70, 75, 80];

// ── RSI Math ─────────────────────────────────────────────────────────────────

function computeRSI(prices: number[], period: number): (number | null)[] {
  const result = new Array<number | null>(prices.length).fill(null);
  if (prices.length < period + 1) return result;
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);
  let avgGain = 0,
    avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  if (avgLoss === 0) result[period] = 100;
  else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - 100 / (1 + rs);
  }
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) result[i + 1] = 100;
    else {
      const rs = avgGain / avgLoss;
      result[i + 1] = 100 - 100 / (1 + rs);
    }
  }
  return result;
}

function classifyRSIZone(rsi: number, osLevel: number, obLevel: number): string {
  const mid = (osLevel + obLevel) / 2;
  if (rsi <= osLevel) return "oversold";
  if (rsi >= obLevel) return "overbought";
  if (rsi < mid - 5) return "neutral_low";
  if (rsi > mid + 5) return "neutral_high";
  return "neutral";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RsiCategoryResult {
  category: string;
  label: string;
  description: string;
  summary: SignalSummary;
  composite: CompositeScore;
  profiles?: ForwardReturnProfile[];
}

interface RsiConfig {
  config: { rsiPeriod: number; oversoldLevel: number; overboughtLevel: number };
  configLabel: string;
  categories: RsiCategoryResult[];
  bestCategory: string;
  bestScore: number;
}

interface RsiTickerResult {
  ticker: string;
  name: string;
  configs: RsiConfig[];
  bestCategory: string;
  bestScore: number;
  currentSignal: string;
  currentRSI: number | null;
  priceContext: any;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function RSIRegimeOptimizer() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [returnMode, setReturnMode] = useState("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.1);
  const [signalMode, setSignalMode] = useState("zone");
  const [runMode, setRunMode] = useState("single");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = usePersistedState("rsi-basket-mode", "stocks");
  const { baskets } = useBaskets();
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [inputSelection, setInputSelection] = usePersistedState(
    "rsi-regime-input-selection",
    defaultInputSelection
  );
  const [results, setResults] = usePersistedState<RsiTickerResult[]>("rsi:results", []);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set());
  const toggleExpandedConfig = useCallback((key: string) => {
    setExpandedConfigs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const [sortBy, setSortBy] = useState("score");
  const [rankBy, setRankBy] = useState("composite");
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState(() => (createDateRange as any)());
  const scoreWeights = useMemo(() => (getScoreWeights as any)(rankBy), [rankBy]);
  const cancelRef = useRef(false);
  const tickerInitRef = useRef(false);
  const [activeTab, setActiveTab] = useState("optimize");
  const [evalSide, setEvalSide] = useState("long");
  const [evalResult, setEvalResult] = usePersistedState<any>("rsi:evalResult", null);
  const [evalPriceContext, setEvalPriceContext] = useState<any>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalSignalMode, setEvalSignalMode] = useState("exit_oversold");
  const [evalRsiPeriod, setEvalRsiPeriod] = useState(14);
  const [evalOsLevel, setEvalOsLevel] = useState(30);
  const [evalObLevel, setEvalObLevel] = useState(70);
  const [minHold, setMinHold] = useState(0);

  const { universeTickers, isFiltered } = useUniverse();
  const filteredByUniverse = useMemo(
    () => (universeTickers ? allTickers.filter((e) => universeTickers.has(e.ticker)) : allTickers),
    [allTickers, universeTickers]
  );
  const classFilter = useOptimizerClassFilter(
    filteredByUniverse,
    runMode === "universe",
    "rsiregime-clf"
  );
  const pairComboPicker = usePairComboPicker(allTickers, runMode === "pairCombo", "rsi-pc");
  const universeTicks = classFilter.filteredTickers;
  const { frequency, setFrequency, frequencyUI } = useFrequency("rsiregime", "daily", running);
  const resampleMode = frequency === "weekly" ? "weekly" : "daily";

  useEffect(() => {
    getTickers().then((tickers) => {
      setAllTickers(tickers);
      if (tickers.length > 0 && !tickerInitRef.current) {
        setSelectedTicker(tickers[0].ticker);
      }
      if (tickers.length > 0) {
        setPairTickerA((prev) => prev || tickers[0].ticker);
        setPairTickerB((prev) => prev || (tickers[1]?.ticker ?? tickers[0].ticker));
      }
    });
  }, []);

  useEffect(() => {
    if (
      filteredByUniverse.length > 0 &&
      selectedTicker &&
      allTickers.some((e) => e.ticker === selectedTicker) &&
      !filteredByUniverse.find((e) => e.ticker === selectedTicker)
    ) {
      setSelectedTicker(filteredByUniverse[0].ticker);
    }
  }, [filteredByUniverse, selectedTicker, allTickers]);

  const handleRunOptimizer = useCallback(async () => {
    setRunning(true);
    setResults([]);
    cancelRef.current = false;

    const dates = await getDates();
    let tickers: any[];

    if (runMode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
        setRunning(false);
        return;
      }
      tickers = [{ ticker: `${pairTickerA}/${pairTickerB}`, name: `${pairTickerA}/${pairTickerB}` }];
    } else if (runMode === "pairCombo") {
      if (pairComboPicker.pairs.length === 0) {
        setRunning(false);
        return;
      }
      tickers = pairComboPicker.pairs.map((p: any) => ({
        ticker: p.label,
        name: p.label,
        pairA: p.a,
        pairB: p.b,
      }));
    } else if (runMode === "single") {
      tickers = filteredByUniverse.filter((t) => t.ticker === selectedTicker);
    } else if (runMode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) {
          setRunning(false);
          return;
        }
        const basket = buildBasketOhlc(basketTickers, baskets);
        tickers = [{ ticker: `BASKET:${(basket as any).name}`, name: `BASKET:${(basket as any).name}` }];
      } else {
        tickers = basketTickers.map(
          (t) =>
            filteredByUniverse.find((v) => v.ticker.toUpperCase() === t.toUpperCase()) ?? {
              ticker: t,
              name: t,
            }
        );
      }
    } else {
      tickers = universeTicks;
    }

    if (tickers.length === 0) {
      setRunning(false);
      return;
    }

    setProgress({ current: 0, total: tickers.length });
    const combinedBasket =
      runMode === "basket" && basketMode === "combined"
        ? buildBasketOhlc(basketTickers, baskets)
        : null;
    const accumulated: RsiTickerResult[] = [];

    for (let i = 0; i < tickers.length && !cancelRef.current; i++) {
      const ticker = tickers[i];
      setProgress({ current: i + 1, total: tickers.length });
      try {
        let globalIndices: number[], prices: number[];

        if (runMode === "pair" || runMode === "pairCombo") {
          const legA = runMode === "pairCombo" ? ticker.pairA : pairTickerA;
          const legB = runMode === "pairCombo" ? ticker.pairB : pairTickerB;
          const ratio = await getYahooPairsRatio(legA, legB, dates);
          if (!ratio || ratio.indices.length < 252) continue;
          const filteredIdx: number[] = [];
          const filteredPrices: number[] = [];
          for (let k = 0; k < ratio.indices.length; k++) {
            const d = dates[ratio.indices[k]] || "";
            if (d >= dateRange.start && d <= dateRange.end) {
              filteredIdx.push(ratio.indices[k]);
              filteredPrices.push(ratio.prices[k]);
            }
          }
          if (filteredIdx.length < 252) continue;
          globalIndices = filteredIdx;
          prices = filteredPrices;
        } else if (combinedBasket) {
          const bar = await getBasketOhlc(combinedBasket, dateRange);
          if (!bar || (bar as any).closes.length < 252) continue;
          const dateMap = new Map<string, number>();
          for (let x = 0; x < dates.length; x++) dateMap.set(dates[x], x);
          globalIndices = [];
          prices = [];
          for (let x = 0; x < (bar as any).priceDates.length; x++) {
            const idx = dateMap.get((bar as any).priceDates[x]) ?? -1;
            if (idx >= 0) {
              globalIndices.push(idx);
              prices.push((bar as any).closes[x]);
            }
          }
          if (globalIndices.length < 252) continue;
        } else {
          globalIndices = [];
          prices = [];
          const dateMap = new Map<string, number>();
          for (let m = 0; m < dates.length; m++) dateMap.set(dates[m], m);

          if (inputSelection.kind === "workbook") {
            const series = await fetchWorkbookSeriesForTicker(ticker.ticker, inputSelection, {
              dateRange,
            });
            if (!series || (series as any).closes.length < 252) continue;
            for (let x = 0; x < (series as any).closes.length; x++) {
              const idx = dateMap.get((series as any).priceDates[x] ?? "");
              if (idx != null && idx >= 0) {
                globalIndices.push(idx);
                prices.push((series as any).closes[x]);
              }
            }
          } else {
            const raw = await getTickerRaw(ticker.ticker);
            if (!raw || (raw as any).adjCloses.length < 252) continue;
            const filtered = (filterByDateRange as any)(raw, dateRange);
            if (!filtered || filtered.adjCloses.length < 252) continue;
            const filteredDates = filtered.dates.slice(0, filtered.adjCloses.length);
            for (let j = 0; j < filtered.adjCloses.length; j++) {
              const idx = dateMap.get(filteredDates[j]);
              if (idx != null && idx >= 0) {
                globalIndices.push(idx);
                prices.push(filtered.adjCloses[j]);
              }
            }
          }
          if (globalIndices.length < 252) continue;
        }

        const tickerDates = globalIndices.map((idx) => dates[idx] || "");
        const freqForCalc =
          runMode === "pair" || runMode === "pairCombo" ? "daily" : (frequency as string);
        const freqForResample =
          runMode === "pair" || runMode === "pairCombo" ? "daily" : resampleMode;
        const weekly = (resampleWeekly as any)(
          { dates: tickerDates, closes: prices, adjCloses: prices },
          freqForResample
        ) as any;
        const rawPrices = prices;
        let weeklyExpanded: (number | null)[] | null = null;
        let computePrices: number[];
        if (freqForCalc === "weekly_on_daily") {
          weeklyExpanded = (resampleWeekly as any)(prices, tickerDates);
          computePrices = prices;
        } else {
          computePrices = (weekly as any).closes as number[];
        }
        const minLen = freqForResample === "weekly" ? 52 : 252;
        if (
          (freqForCalc === "weekly_on_daily" ? prices.length : computePrices.length) < minLen
        )
          continue;

        const configs: RsiConfig[] = [];

        for (const period of RSI_PERIODS) {
          let rsiValues: (number | null)[];
          if (freqForCalc === "weekly_on_daily" && weeklyExpanded) {
            const wRsi = computeRSI(weeklyExpanded as number[], period);
            rsiValues = (resampleWeekly as any).expandWeeklyToDaily(
              wRsi.map((v: number | null) => (v === null ? NaN : v)),
              (weeklyExpanded as any).weekIndex,
              prices.length
            ).map((v: number) => (Number.isNaN(v) ? null : v));
          } else {
            rsiValues = computeRSI(computePrices, period);
          }

          const isWeeklyOnDaily = freqForCalc === "weekly_on_daily";
          const workLen = isWeeklyOnDaily ? prices.length : computePrices.length;

          if (signalMode === "zone") {
            for (const osLevel of OS_LEVELS) {
              for (const obLevel of OB_LEVELS) {
                if (osLevel >= obLevel) continue;
                const zoneBuckets: Record<string, ForwardReturnProfile[]> = {
                  oversold: [],
                  neutral_low: [],
                  neutral: [],
                  neutral_high: [],
                  overbought: [],
                };
                let prevZone: string | null = null;
                const startIdx = period + 126;
                for (let n = startIdx; n < workLen; n++) {
                  if (rsiValues[n] === null) continue;
                  const zone = classifyRSIZone(rsiValues[n]!, osLevel, obLevel);
                  if (prevZone === null) {
                    prevZone = zone;
                    continue;
                  }
                  if (zone !== prevZone) {
                    const dir = RSI_CATEGORIES[zone as keyof typeof RSI_CATEGORIES].direction;
                    const band =
                      returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
                    const dailyIdx =
                      freqForResample === "weekly" && !isWeeklyOnDaily
                        ? getDailyIndexFromWeekly(n, weekly)
                        : n;
                    if (dailyIdx < 0) {
                      prevZone = zone;
                      continue;
                    }
                    const profile = (computeForwardProfile as any)(
                      rawPrices,
                      dailyIdx,
                      targetReturn,
                      dir,
                      band
                    );
                    zoneBuckets[zone].push(profile);
                  }
                  prevZone = zone;
                }

                const categoryResults: RsiCategoryResult[] = [];
                for (const [catKey, profiles] of Object.entries(zoneBuckets)) {
                  const catDef =
                    RSI_CATEGORIES[catKey as keyof typeof RSI_CATEGORIES];
                  const dir = catDef.direction;
                  const useBand = returnMode === "band";
                  const summary = summarizeSignals(profiles, dir);
                  const composite = computeCompositeScore(summary, dir, useBand);
                  categoryResults.push({
                    category: catKey,
                    label: catDef.label,
                    description: catDef.description,
                    summary,
                    composite,
                    profiles,
                  });
                }
                const bestCat = categoryResults.reduce(
                  (a, b) => (a.composite.score > b.composite.score ? a : b),
                  categoryResults[0]
                );
                configs.push({
                  config: { rsiPeriod: period, oversoldLevel: osLevel, overboughtLevel: obLevel },
                  configLabel: `RSI(${period}) ${osLevel}/${obLevel}`,
                  categories: categoryResults,
                  bestCategory: bestCat.category,
                  bestScore: bestCat.composite.score,
                });
              }
            }
          } else {
            // transition mode
            for (const osLevel of OS_LEVELS) {
              for (const obLevel of OB_LEVELS) {
                if (osLevel >= obLevel) continue;
                const transitionBuckets: Record<string, ForwardReturnProfile[]> = {
                  enter_oversold: [],
                  exit_oversold: [],
                  enter_overbought: [],
                  exit_overbought: [],
                };
                const startIdx = period + 126;
                for (let n = startIdx + 1; n < workLen; n++) {
                  if (rsiValues[n] === null || rsiValues[n - 1] === null) continue;
                  const cur = rsiValues[n]!;
                  const prev = rsiValues[n - 1]!;
                  const fired: string[] = [];
                  if (cur <= osLevel && prev > osLevel) fired.push("enter_oversold");
                  if (cur > osLevel && prev <= osLevel) fired.push("exit_oversold");
                  if (cur >= obLevel && prev < obLevel) fired.push("enter_overbought");
                  if (cur < obLevel && prev >= obLevel) fired.push("exit_overbought");
                  const band =
                    returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
                  for (const key of fired) {
                    const dir =
                      RSI_CATEGORIES[key as keyof typeof RSI_CATEGORIES].direction;
                    const dailyIdx =
                      freqForResample === "weekly" && !isWeeklyOnDaily
                        ? getDailyIndexFromWeekly(n, weekly)
                        : n;
                    if (dailyIdx < 0) continue;
                    transitionBuckets[key].push(
                      (computeForwardProfile as any)(rawPrices, dailyIdx, targetReturn, dir, band)
                    );
                  }
                }

                const categoryResults: RsiCategoryResult[] = [];
                for (const [catKey, profiles] of Object.entries(transitionBuckets)) {
                  const catDef =
                    RSI_CATEGORIES[catKey as keyof typeof RSI_CATEGORIES];
                  const dir = catDef.direction;
                  const useBand = returnMode === "band";
                  const summary = summarizeSignals(profiles, dir);
                  const composite = computeCompositeScore(summary, dir, useBand);
                  categoryResults.push({
                    category: catKey,
                    label: catDef.label,
                    description: catDef.description,
                    summary,
                    composite,
                    profiles,
                  });
                }
                const bestCat = categoryResults.reduce(
                  (a, b) => (a.composite.score > b.composite.score ? a : b),
                  categoryResults[0]
                );
                configs.push({
                  config: { rsiPeriod: period, oversoldLevel: osLevel, overboughtLevel: obLevel },
                  configLabel: `RSI(${period}) ${osLevel}/${obLevel}`,
                  categories: categoryResults,
                  bestCategory: bestCat.category,
                  bestScore: bestCat.composite.score,
                });
              }
            }
          }
        }

        if (configs.length === 0) continue;

        const bestConfig = configs.reduce((a, b) => (a.bestScore > b.bestScore ? a : b));
        const currentRsiArr =
          freqForCalc === "weekly_on_daily" && weeklyExpanded
            ? (() => {
                const wRsi = computeRSI(weeklyExpanded as number[], bestConfig.config.rsiPeriod);
                return (resampleWeekly as any).expandWeeklyToDaily(
                  wRsi.map((v: number | null) => (v === null ? NaN : v)),
                  (weeklyExpanded as any).weekIndex,
                  prices.length
                ).map((v: number) => (Number.isNaN(v) ? null : v));
              })()
            : computeRSI(computePrices, bestConfig.config.rsiPeriod);

        const lastRsi = currentRsiArr[currentRsiArr.length - 1];
        let currentSignal = "None";
        if (lastRsi !== null) {
          const zone = classifyRSIZone(
            lastRsi,
            bestConfig.config.oversoldLevel,
            bestConfig.config.overboughtLevel
          );
          currentSignal = RSI_CATEGORIES[zone as keyof typeof RSI_CATEGORIES].label;
          const prevRsi = currentRsiArr[currentRsiArr.length - 2];
          if (prevRsi !== null) {
            const os = bestConfig.config.oversoldLevel;
            const ob = bestConfig.config.overboughtLevel;
            if (lastRsi <= os && prevRsi > os) currentSignal = "→ Oversold";
            else if (lastRsi > os && prevRsi <= os) currentSignal = "← Oversold";
            else if (lastRsi >= ob && prevRsi < ob) currentSignal = "→ Overbought";
            else if (lastRsi < ob && prevRsi >= ob) currentSignal = "← Overbought";
          }
        }

        // Keep profiles only for top 6 configs
        const TOP_CONFIGS = 6;
        const topSet = new Set(
          [...configs].sort((a, b) => b.bestScore - a.bestScore).slice(0, TOP_CONFIGS)
        );
        for (const cfg of configs) {
          if (!topSet.has(cfg)) {
            for (const cat of cfg.categories) cat.profiles = undefined;
          }
        }

        const priceContext = {
          prices: rawPrices,
          highs: rawPrices.slice(),
          lows: rawPrices.slice(),
          volumes: null,
          dates: globalIndices.map((idx) => dates[idx] || ""),
          globalIndices: globalIndices.slice(),
          benchmarkPrices: null,
          mode: runMode === "pair" || runMode === "pairCombo" ? "pair" : "single",
          pairLegA:
            runMode === "pairCombo"
              ? ticker.pairA
              : runMode === "pair"
              ? pairTickerA
              : undefined,
          pairLegB:
            runMode === "pairCombo"
              ? ticker.pairB
              : runMode === "pair"
              ? pairTickerB
              : undefined,
        };

        accumulated.push({
          ticker: ticker.ticker,
          name: ticker.name,
          configs,
          bestCategory:
            RSI_CATEGORIES[bestConfig.bestCategory as keyof typeof RSI_CATEGORIES]?.label ??
            bestConfig.bestCategory,
          bestScore: bestConfig.bestScore,
          currentSignal,
          currentRSI: lastRsi !== null ? Math.round(lastRsi * 10) / 10 : null,
          priceContext,
        });

        if (i % 5 === 0 || i === tickers.length - 1) setResults([...accumulated]);
      } catch {}
    }

    setResults(accumulated);
    setRunning(false);
  }, [
    filteredByUniverse,
    selectedTicker,
    pairTickerA,
    pairTickerB,
    basketTickers,
    runMode,
    signalMode,
    targetReturn,
    returnMode,
    bandMin,
    bandMax,
    frequency,
    resampleMode,
    universeTicks,
    dateRange,
    pairComboPicker.pairs,
    inputSelection,
    basketMode,
    baskets,
  ]);

  const handleEvaluate = useCallback(async () => {
    setEvaluating(true);
    setEvalResult(null);
    setEvalPriceContext(null);
    try {
      const dates = await getDates();
      let prices: number[], globalIndices: number[];

      if (runMode === "pair") {
        if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) return;
        const ratio = await getYahooPairsRatio(pairTickerA, pairTickerB, dates);
        if (!ratio || ratio.indices.length < 252) return;
        const filteredIdx: number[] = [];
        const filteredPrices: number[] = [];
        for (let c = 0; c < ratio.indices.length; c++) {
          const d = dates[ratio.indices[c]] || "";
          if (d >= dateRange.start && d <= dateRange.end) {
            filteredIdx.push(ratio.indices[c]);
            filteredPrices.push(ratio.prices[c]);
          }
        }
        if (filteredIdx.length < 252) return;
        globalIndices = filteredIdx;
        prices = filteredPrices;
      } else if (runMode === "basket") {
        if (basketTickers.length === 0) {
          setEvaluating(false);
          return;
        }
        if (basketMode === "combined") {
          const basket = buildBasketOhlc(basketTickers, baskets);
          const bar = await getBasketOhlc(basket, dateRange);
          if (!bar || (bar as any).closes.length < 252) {
            setEvaluating(false);
            return;
          }
          const dateMap = new Map<string, number>();
          for (let c = 0; c < dates.length; c++) dateMap.set(dates[c], c);
          globalIndices = [];
          prices = [];
          for (let c = 0; c < (bar as any).priceDates.length; c++) {
            const idx = dateMap.get((bar as any).priceDates[c]) ?? -1;
            if (idx >= 0) {
              globalIndices.push(idx);
              prices.push((bar as any).closes[c]);
            }
          }
          if (globalIndices.length < 252) {
            setEvaluating(false);
            return;
          }
        } else {
          const t0 = basketTickers[0];
          if (!t0) {
            setEvaluating(false);
            return;
          }
          const dateMap = new Map<string, number>();
          for (let l = 0; l < dates.length; l++) dateMap.set(dates[l], l);
          globalIndices = [];
          prices = [];
          if (inputSelection.kind === "workbook") {
            const series = await fetchWorkbookSeriesForTicker(t0, inputSelection, { dateRange });
            if (!series || (series as any).closes.length < 252) {
              setEvaluating(false);
              return;
            }
            for (let c = 0; c < (series as any).closes.length; c++) {
              const idx = dateMap.get((series as any).priceDates[c] ?? "");
              if (idx != null && idx >= 0) {
                globalIndices.push(idx);
                prices.push((series as any).closes[c]);
              }
            }
          } else {
            const raw = await getTickerRaw(t0);
            if (!raw || (raw as any).adjCloses.length < 252) {
              setEvaluating(false);
              return;
            }
            const filtered = (filterByDateRange as any)(raw, dateRange);
            if (!filtered || filtered.adjCloses.length < 252) {
              setEvaluating(false);
              return;
            }
            const filteredDates = filtered.dates.slice(0, filtered.adjCloses.length);
            for (let p = 0; p < filtered.adjCloses.length; p++) {
              const idx = dateMap.get(filteredDates[p]);
              if (idx != null && idx >= 0) {
                globalIndices.push(idx);
                prices.push(filtered.adjCloses[p]);
              }
            }
          }
          if (globalIndices.length < 252) {
            setEvaluating(false);
            return;
          }
        }
      } else {
        const tickerSym =
          runMode === "single" ? selectedTicker : filteredByUniverse[0]?.ticker ?? "";
        if (!tickerSym) return;
        const dateMap = new Map<string, number>();
        for (let l = 0; l < dates.length; l++) dateMap.set(dates[l], l);
        globalIndices = [];
        prices = [];
        if (inputSelection.kind === "workbook") {
          const series = await fetchWorkbookSeriesForTicker(tickerSym, inputSelection, {
            dateRange,
          });
          if (!series || (series as any).closes.length < 252) return;
          for (let c = 0; c < (series as any).closes.length; c++) {
            const idx = dateMap.get((series as any).priceDates[c] ?? "");
            if (idx != null && idx >= 0) {
              globalIndices.push(idx);
              prices.push((series as any).closes[c]);
            }
          }
        } else {
          const raw = await getTickerRaw(tickerSym);
          if (!raw || (raw as any).adjCloses.length < 252) return;
          const filtered = (filterByDateRange as any)(raw, dateRange);
          if (!filtered || filtered.adjCloses.length < 252) return;
          const filteredDates = filtered.dates.slice(0, filtered.adjCloses.length);
          for (let p = 0; p < filtered.adjCloses.length; p++) {
            const idx = dateMap.get(filteredDates[p]);
            if (idx != null && idx >= 0) {
              globalIndices.push(idx);
              prices.push(filtered.adjCloses[p]);
            }
          }
        }
        if (globalIndices.length < 252) return;
      }

      const tickerDates = globalIndices.map((idx) => dates[idx] || "");
      const rsiValues = computeRSI(prices, evalRsiPeriod);
      const signalIndices: number[] = [];
      const isTransition =
        evalSignalMode === "enter_oversold" ||
        evalSignalMode === "exit_oversold" ||
        evalSignalMode === "enter_overbought" ||
        evalSignalMode === "exit_overbought";
      const startIdx = evalRsiPeriod + 126;

      if (isTransition) {
        for (let d = startIdx + 1; d < prices.length; d++) {
          if (rsiValues[d] === null || rsiValues[d - 1] === null) continue;
          const cur = rsiValues[d]!;
          const prev = rsiValues[d - 1]!;
          const fired: string[] = [];
          if (cur <= evalOsLevel && prev > evalOsLevel) fired.push("enter_oversold");
          if (cur > evalOsLevel && prev <= evalOsLevel) fired.push("exit_oversold");
          if (cur >= evalObLevel && prev < evalObLevel) fired.push("enter_overbought");
          if (cur < evalObLevel && prev >= evalObLevel) fired.push("exit_overbought");
          if (fired.includes(evalSignalMode)) signalIndices.push(d);
        }
      } else {
        let prevZone: string | null = null;
        for (let d = startIdx; d < prices.length; d++) {
          if (rsiValues[d] === null) continue;
          const zone = classifyRSIZone(rsiValues[d]!, evalOsLevel, evalObLevel);
          if (prevZone === null) {
            prevZone = zone;
            continue;
          }
          if (zone !== prevZone && zone === evalSignalMode) signalIndices.push(d);
          prevZone = zone;
        }
      }

      signalIndices.sort((a, b) => a - b);
      const evalRes = evaluateSignals(
        prices,
        tickerDates,
        signalIndices,
        evalSide,
        targetReturn,
        minHold,
        null,
        "3M"
      );
      setEvalResult(evalRes);
      setEvalPriceContext({
        prices,
        highs: prices.slice(),
        lows: prices.slice(),
        volumes: null,
        dates: tickerDates,
        globalIndices: globalIndices.slice(),
        benchmarkPrices: null,
        mode: runMode === "pair" ? "pair" : "single",
        pairLegA: runMode === "pair" ? pairTickerA : undefined,
        pairLegB: runMode === "pair" ? pairTickerB : undefined,
      });
    } finally {
      setEvaluating(false);
    }
  }, [
    runMode,
    pairTickerA,
    pairTickerB,
    selectedTicker,
    filteredByUniverse,
    evalSignalMode,
    evalRsiPeriod,
    evalOsLevel,
    evalObLevel,
    evalSide,
    targetReturn,
    minHold,
    dateRange,
    inputSelection,
    basketTickers,
    basketMode,
    baskets,
  ]);

  const evalSetupLabel = useMemo(() => {
    const label =
      RSI_CATEGORIES[evalSignalMode as keyof typeof RSI_CATEGORIES]?.label ?? evalSignalMode;
    return `RSI(${evalRsiPeriod}) OS=${evalOsLevel} OB=${evalObLevel} [${label}] [${evalSide}]`;
  }, [evalSignalMode, evalRsiPeriod, evalOsLevel, evalObLevel, evalSide]);

  const evalTickerLabel = useMemo(
    () =>
      runMode === "pair"
        ? `${pairTickerA || "A"}/${pairTickerB || "B"}`
        : runMode === "single"
        ? selectedTicker || "—"
        : filteredByUniverse[0]?.ticker || "—",
    [runMode, pairTickerA, pairTickerB, selectedTicker, filteredByUniverse]
  );

  const getWorkspaceState = useCallback(
    () => ({
      selectedTicker,
      pairTickerA,
      pairTickerB,
      basketTickers,
      basketMode,
      targetReturn,
      signalMode,
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
    }),
    [
      selectedTicker,
      pairTickerA,
      pairTickerB,
      basketTickers,
      basketMode,
      targetReturn,
      signalMode,
      runMode,
      results,
      expandedTicker,
      sortBy,
      returnMode,
      bandMin,
      bandMax,
      frequency,
      pairComboPicker,
      inputSelection,
    ]
  );

  const restoreWorkspaceState = useCallback(
    (state: any) => {
      if (!state) return;
      if (state.selectedTicker) {
        setSelectedTicker(state.selectedTicker);
        tickerInitRef.current = true;
      }
      if (state.pairTickerA) setPairTickerA(state.pairTickerA);
      if (state.pairTickerB) setPairTickerB(state.pairTickerB);
      if (
        state.mode === "single" ||
        state.mode === "universe" ||
        state.mode === "pair" ||
        state.mode === "pairCombo" ||
        state.mode === "basket"
      )
        setRunMode(state.mode);
      if (state.pairCombo) pairComboPicker.hydrate(state.pairCombo);
      if (Array.isArray(state.basketTickers))
        setBasketTickers(state.basketTickers.filter((t: any) => typeof t === "string"));
      if (state.basketMode === "stocks" || state.basketMode === "combined")
        setBasketMode(state.basketMode);
      if (typeof state.targetReturn === "number") setTargetReturn(state.targetReturn);
      if (state.returnMode) setReturnMode(state.returnMode);
      if (typeof state.bandMin === "number") setBandMin(state.bandMin);
      if (typeof state.bandMax === "number") setBandMax(state.bandMax);
      if (state.signalMode) setSignalMode(state.signalMode);
      if (Array.isArray(state.results)) setResults(state.results);
      if (state.expandedTicker !== undefined) setExpandedTicker(state.expandedTicker);
      if (state.sortBy) setSortBy(state.sortBy);
      if (
        state.frequency === "daily" ||
        state.frequency === "weekly" ||
        state.frequency === "weekly_on_daily"
      )
        setFrequency(state.frequency);
      else if (state.timeframe === "weekly") setFrequency("weekly");
      if (state.inputSelection && typeof state.inputSelection === "object") {
        const sel = state.inputSelection;
        if (sel.kind === "close") setInputSelection({ kind: "close" as any });
        else if (sel.kind === "workbook" && typeof sel.metric === "string")
          setInputSelection({ kind: "workbook", metric: sel.metric });
      }
    },
    [setFrequency, setInputSelection]
  );

  useWorkspaceTab("rsi-regime-optimizer", getWorkspaceState, restoreWorkspaceState);

  // Recompute results with updated rank weights
  const rankedResults = useMemo(
    () =>
      results
        .map((r) => ({
          ...r,
          configs: r.configs.map((cfg) => {
            let bestScore = -Infinity;
            let bestCat = cfg.categories[0];
            for (const cat of cfg.categories) {
              const dir =
                RSI_CATEGORIES[cat.category as keyof typeof RSI_CATEGORIES]?.direction ?? "buy";
              const score = (pickBestByRankMode as any)(cat.summary, cat.composite.score, dir, scoreWeights);
              if (score > bestScore) {
                bestScore = score;
                bestCat = cat;
              }
            }
            return { ...cfg, bestScore, bestCategory: bestCat.category };
          }),
        }))
        .map((r) => {
          const best = r.configs.reduce(
            (a, b) => (a.bestScore > b.bestScore ? a : b),
            r.configs[0]
          );
          return {
            ...r,
            bestScore: best?.bestScore ?? r.bestScore,
            bestCategory:
              RSI_CATEGORIES[best?.bestCategory as keyof typeof RSI_CATEGORIES]?.label ??
              best?.bestCategory ??
              r.bestCategory,
          };
        }),
    [results, scoreWeights]
  );

  const sortedResults = useMemo(() => {
    const list = [...rankedResults];
    if (sortBy === "score") list.sort((a, b) => b.bestScore - a.bestScore);
    else if (sortBy === "ticker") list.sort((a, b) => a.ticker.localeCompare(b.ticker));
    else if (sortBy === "rsi") list.sort((a, b) => (b.currentRSI ?? 0) - (a.currentRSI ?? 0));
    else list.sort((a, b) => a.currentSignal.localeCompare(b.currentSignal));
    return list;
  }, [rankedResults, sortBy]);

  const handleExportCsv = () => {
    const horizons = FORWARD_HORIZONS.filter((_, i) => i >= 2);
    const rows = sortedResults.map((r) => {
      const bestCfg = r.configs.reduce(
        (a, b) => (a.bestScore > b.bestScore ? a : b),
        r.configs[0]
      );
      const summary = (
        bestCfg?.categories.find((c) => c.category === bestCfg.bestCategory) ??
        bestCfg?.categories.reduce(
          (a, b) => (a.composite.score > b.composite.score ? a : b),
          bestCfg.categories[0]
        )
      )?.summary;
      const row: Record<string, any> = {
        ticker: r.ticker,
        name: r.name,
        currentRSI: r.currentRSI ?? null,
        currentSignal: r.currentSignal,
        bestCategory: r.bestCategory,
        bestScore: r.bestScore,
      };
      horizons.forEach((h) => {
        row[`hitRate_${h.label}`] = summary?.hitRate[h.label] ?? null;
        row[`avgReturn_${h.label}`] = summary?.avgReturn[h.label] ?? null;
      });
      return row;
    });
    const keys = Object.keys(rows[0] || {});
    const csv = [
      keys.join(","),
      ...rows.map((r) =>
        keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "rsi_regime_optimizer.csv";
    a.click();
  };

  const rsiColorClass = (rsi: number | null) => {
    if (rsi === null) return "text-muted-foreground";
    if (rsi <= 30) return "text-emerald-400";
    if (rsi <= 40) return "text-green-400";
    if (rsi >= 70) return "text-red-400";
    if (rsi >= 60) return "text-orange-400";
    return "text-yellow-400";
  };

  const signalBadgeClass = (signal: string) => {
    if (signal.includes("Oversold")) return "bg-emerald-600/20 text-emerald-400 border-emerald-600/30";
    if (signal.includes("Neutral Low")) return "bg-green-600/20 text-green-400 border-green-600/30";
    if (signal.includes("Neutral High")) return "bg-orange-600/20 text-orange-400 border-orange-600/30";
    if (signal.includes("Overbought")) return "bg-red-600/20 text-red-400 border-red-600/30";
    if (signal.includes("Neutral")) return "bg-yellow-600/20 text-yellow-400 border-yellow-600/30";
    if (signal.includes("→")) return "bg-blue-600/20 text-blue-400 border-blue-600/30";
    if (signal.includes("←")) return "bg-purple-600/20 text-purple-400 border-purple-600/30";
    return "bg-muted text-muted-foreground border-border";
  };

  const configCount =
    RSI_PERIODS.length *
    OS_LEVELS.filter((os) => OB_LEVELS.some((ob) => os < ob)).length *
    OB_LEVELS.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">RSI Regime</h2>
        <div className="flex gap-px">
          <button
            data-testid="rsi-view-optimize"
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
            data-testid="rsi-view-evaluate"
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
            ? "Search RSI parameter space by hit rate"
            : "Score one specific RSI setup"}
        </span>
        <div className="flex items-center gap-1">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            DATE RANGE
          </label>
          <div className="flex items-center gap-0.5">
            {DATE_PRESETS.map((p: any) => (
              <button
                key={p.value}
                data-testid={`rsi-date-preset-${p.value}`}
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
            data-testid="rsi-date-start"
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
            data-testid="rsi-date-end"
            value={dateRange.end}
            onChange={(e) => {
              setDatePreset("custom");
              setDateRange({ ...dateRange, end: e.target.value });
            }}
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
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Mode
                </label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                      runMode === "single"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                    onClick={() => setRunMode("single")}
                  >
                    Single
                  </button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                      runMode === "pair"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                    onClick={() => setRunMode("pair")}
                  >
                    Pair
                  </button>
                </div>
              </div>

              {/* Single ticker */}
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
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Basket
                    </label>
                    <BasketTickerPill
                      activeTicker={selectedTicker}
                      onSelectTicker={setSelectedTicker}
                      fallbackTicker={filteredByUniverse[0]?.ticker ?? null}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Input Series
                    </label>
                    <InputSeriesPicker
                      value={inputSelection}
                      onChange={setInputSelection}
                      family="rsi_regime"
                      label=""
                    />
                  </div>
                </div>
              )}

              {/* Pair tickers */}
              {runMode === "pair" && (
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

              {/* Side */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Side
                </label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                      evalSide === "long"
                        ? "bg-emerald-600 text-white"
                        : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                    onClick={() => setEvalSide("long")}
                  >
                    Long
                  </button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                      evalSide === "short"
                        ? "bg-red-600 text-white"
                        : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                    onClick={() => setEvalSide("short")}
                  >
                    Short
                  </button>
                </div>
              </div>

              {/* Signal Mode */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Signal Mode
                </label>
                <select
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground"
                  value={evalSignalMode}
                  onChange={(e) => setEvalSignalMode(e.target.value)}
                >
                  <optgroup label="Zone Entry">
                    <option value="oversold">Oversold Zone</option>
                    <option value="neutral_low">Neutral Low Zone</option>
                    <option value="neutral">Neutral Zone</option>
                    <option value="neutral_high">Neutral High Zone</option>
                    <option value="overbought">Overbought Zone</option>
                  </optgroup>
                  <optgroup label="Transitions">
                    <option value="enter_oversold">Enter Oversold</option>
                    <option value="exit_oversold">Exit Oversold</option>
                    <option value="enter_overbought">Enter Overbought</option>
                    <option value="exit_overbought">Exit Overbought</option>
                  </optgroup>
                </select>
              </div>

              {/* RSI Length */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  RSI Length
                </label>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={evalRsiPeriod}
                  onChange={(e) => setEvalRsiPeriod(parseInt(e.target.value) || 14)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                />
              </div>

              {/* OS */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  OS
                </label>
                <input
                  type="number"
                  min={1}
                  max={49}
                  value={evalOsLevel}
                  onChange={(e) => setEvalOsLevel(parseInt(e.target.value) || 30)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[55px]"
                />
              </div>

              {/* OB */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  OB
                </label>
                <input
                  type="number"
                  min={51}
                  max={99}
                  value={evalObLevel}
                  onChange={(e) => setEvalObLevel(parseInt(e.target.value) || 70)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[55px]"
                />
              </div>

              {/* Target % */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Target %
                </label>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  value={+(targetReturn * 100).toFixed(4)}
                  onChange={(e) => setTargetReturn((parseFloat(e.target.value) || 5) / 100)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
                />
              </div>

              {/* Hold */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Hold
                </label>
                <input
                  type="number"
                  min={0}
                  value={minHold}
                  onChange={(e) => setMinHold(parseInt(e.target.value) || 0)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                />
              </div>

              {/* Evaluate button */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  {" "}
                </label>
                <button
                  data-testid="rsi-eval-run"
                  className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={handleEvaluate}
                  disabled={evaluating}
                >
                  {evaluating ? "Evaluating…" : "Evaluate"}
                </button>
              </div>
            </div>
          </div>

          {/* Evaluate results */}
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <EvaluatorResultPanel
              result={evalResult}
              loading={evaluating}
              setupLabel={evalSetupLabel}
              tickerLabel={evalTickerLabel}
            />
            {evalResult && evalPriceContext && evalResult.profiles.length >= 10 ? (
              <HitConditionsPanel
                ticker={
                  evalPriceContext.mode === "pair"
                    ? evalPriceContext.pairLegA || ""
                    : selectedTicker || filteredByUniverse[0]?.ticker || ""
                }
                priceContext={evalPriceContext}
                signals={evalResult.profiles}
                direction={evalSide === "long" ? "buy" : "sell"}
                title={`Hit Conditions — ${evalSetupLabel} on ${evalTickerLabel}`}
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
              {/* Title */}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground tracking-tight">RSI Regime</h2>
                  {isFiltered && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                      {filteredByUniverse.length}/{allTickers.length}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Classify RSI regimes and transitions, measure forward returns from each zone
                </p>
              </div>

              {/* Signal Mode */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Signal Mode
                </label>
                <div className="flex gap-px">
                  {["zone", "transition"].map((m) => (
                    <button
                      key={m}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                        signalMode === m
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:text-foreground border border-border"
                      }`}
                      onClick={() => setSignalMode(m)}
                      disabled={running}
                    >
                      {m === "zone" ? "Zone Entry" : "Transition"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Run Mode */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Mode
                </label>
                <div className="flex gap-px">
                  {["single", "universe", "pair", "pairCombo", "basket"].map((m) => (
                    <button
                      key={m}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                        runMode === m
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:text-foreground border border-border"
                      }`}
                      onClick={() => setRunMode(m)}
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

              {/* Pair mode controls */}
              {runMode === "pair" && (
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
              {runMode === "pairCombo" && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    Pair Combo — Leg Set
                  </label>
                  {pairComboPicker.ui}
                </div>
              )}

              {/* Basket */}
              {runMode === "basket" && (
                <div className="flex flex-col gap-2">
                  <BasketPicker
                    tickers={filteredByUniverse}
                    value={basketTickers}
                    onChange={setBasketTickers}
                    disabled={running}
                    testIdPrefix="rsi-basket"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Basket Run Mode
                    </label>
                    <div
                      className="flex gap-px"
                      data-testid="rsi-basket-mode"
                    >
                      {["stocks", "combined"].map((m) => (
                        <button
                          key={m}
                          data-testid={`rsi-basket-mode-${m}`}
                          className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                            basketMode === m
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:text-foreground border border-border"
                          }`}
                          onClick={() => setBasketMode(m)}
                          disabled={running}
                          title={
                            m === "stocks"
                              ? "Run optimizer on each basket constituent separately"
                              : "Run optimizer on a single synthetic series using the basket's weighting scheme"
                          }
                        >
                          {m === "stocks" ? "Stock by Stock" : "Combined"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Frequency UI */}
              {frequencyUI}

              {/* Universe classification filter */}
              {runMode === "universe" && classFilter.classFilterUI && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    Classification Filter
                  </label>
                  {classFilter.universeSourceUI}
                  {classFilter.classFilterUI}
                </div>
              )}

              {/* Single ticker controls */}
              {runMode === "single" && (
                <div className="flex items-end gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Ticker
                    </label>
                    <select
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]"
                      value={selectedTicker}
                      onChange={(e) => setSelectedTicker(e.target.value)}
                      disabled={running}
                    >
                      {filteredByUniverse.map((t) => (
                        <option key={t.ticker} value={t.ticker}>
                          {t.ticker}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Input Series
                    </label>
                    <InputSeriesPicker
                      value={inputSelection}
                      onChange={setInputSelection}
                      family="rsi_regime"
                      label=""
                    />
                  </div>
                </div>
              )}

              {/* Return Measure */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Return Measure
                </label>
                <div className="flex gap-px">
                  {["threshold", "band"].map((m) => (
                    <button
                      key={m}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                        returnMode === m
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:text-foreground border border-border"
                      }`}
                      onClick={() => setReturnMode(m)}
                      disabled={running}
                    >
                      {m === "threshold" ? "Threshold" : "Band"}
                    </button>
                  ))}
                </div>
              </div>

              {returnMode === "threshold" ? (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    Target
                  </label>
                  <select
                    className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]"
                    value={targetReturn}
                    onChange={(e) => setTargetReturn(Number(e.target.value))}
                    disabled={running}
                  >
                    {TARGET_RETURN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Band
                    </label>
                    <select
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[80px]"
                      value={`${bandMin}-${bandMax}`}
                      onChange={(e) => {
                        const [mn, mx] = e.target.value.split("-").map(Number);
                        setBandMin(mn);
                        setBandMax(mx);
                      }}
                      disabled={running}
                    >
                      {RETURN_BAND_PRESETS.map((p) => (
                        <option
                          key={p.label}
                          value={`${p.band.minReturn}-${p.band.maxReturn}`}
                        >
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Min %
                    </label>
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
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Max %
                    </label>
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

              {/* Run/Cancel button */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  {" "}
                </label>
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
                    onClick={handleRunOptimizer}
                  >
                    Run Optimizer
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-auto px-4 py-3">
            {results.length === 0 && !running && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Classifies RSI regimes (oversold / neutral / overbought) and measures forward
                returns from each zone entry or transition
              </div>
            )}

            {running && results.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">
                    Computing RSI regimes...
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {progress.current}/{progress.total} tickers × {configCount} configs
                  </div>
                  <div className="w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          progress.total > 0
                            ? (progress.current / progress.total) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {sortedResults.length > 0 && (
              <div>
                {/* Results header */}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    {sortedResults.length} tickers — RSI {signalMode} —{" "}
                    {returnMode === "band"
                      ? `band ${pct(bandMin)}–${pct(bandMax)}`
                      : `target ${pct(targetReturn)}`}
                  </h3>
                  <div className="flex items-center gap-1">
                    {["score", "rsi", "signal", "ticker"].map((s) => (
                      <button
                        key={s}
                        className={`text-[9px] font-mono px-2 py-0.5 rounded ${
                          sortBy === s
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground border border-border"
                        }`}
                        onClick={() => setSortBy(s)}
                      >
                        {s === "score"
                          ? "Score"
                          : s === "rsi"
                          ? "RSI"
                          : s === "signal"
                          ? "Signal"
                          : "Ticker"}
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-mono text-muted-foreground">
                        RANK BY
                      </label>
                      <select
                        data-testid="rsi-rank-by"
                        value={rankBy}
                        onChange={(e) => setRankBy(e.target.value)}
                        className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5"
                      >
                        {RANK_BY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 text-[11px]"
                      onClick={handleExportCsv}
                      data-testid="export-csv"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Results table */}
                <div className="overflow-x-auto border border-border rounded mb-4">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="bg-card text-muted-foreground">
                        <th className="text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border">
                          Ticker
                        </th>
                        <th className="text-center px-2 py-1 font-bold">RSI</th>
                        <th className="text-center px-2 py-1 font-bold">Current Signal</th>
                        <th className="text-center px-2 py-1 font-bold">Best Config</th>
                        <th className="text-center px-2 py-1 font-bold">Best Signal</th>
                        {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                          <th key={h.label} className="text-center px-2 py-1 font-bold">
                            {returnMode === "band" ? "Band" : "Hit"} {h.label}
                          </th>
                        ))}
                        {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                          <th key={`avg-${h.label}`} className="text-center px-2 py-1 font-bold">
                            Avg {h.label}
                          </th>
                        ))}
                        {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                          <th key={`pf-${h.label}`} className="text-center px-2 py-1 font-bold">
                            PF {h.label}
                          </th>
                        ))}
                        <th className="text-center px-2 py-1 font-bold">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedResults.map((row) => {
                        const isExpanded = expandedTicker === row.ticker;
                        const bestCfg = row.configs.reduce(
                          (a, b) => (a.bestScore > b.bestScore ? a : b),
                          row.configs[0]
                        );
                        const summary = (
                          bestCfg?.categories.find(
                            (c) => c.category === bestCfg.bestCategory
                          ) ??
                          bestCfg?.categories.reduce(
                            (a, b) =>
                              a.composite.score > b.composite.score ? a : b,
                            bestCfg.categories[0]
                          )
                        )?.summary;
                        return (
                          <tr
                            key={row.ticker}
                            className={`${
                              isExpanded ? "bg-primary/10" : "hover:bg-white/5"
                            } cursor-pointer`}
                            onClick={() =>
                              setExpandedTicker(isExpanded ? null : row.ticker)
                            }
                          >
                            <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border">
                              {row.ticker}
                            </td>
                            <td
                              className={`text-center px-2 py-1 font-bold ${rsiColorClass(
                                row.currentRSI
                              )}`}
                            >
                              {row.currentRSI !== null ? row.currentRSI.toFixed(1) : "–"}
                            </td>
                            <td className="text-center px-2 py-1">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${signalBadgeClass(
                                  row.currentSignal
                                )}`}
                              >
                                {row.currentSignal}
                              </span>
                            </td>
                            <td className="text-center px-2 py-1 text-muted-foreground">
                              {bestCfg?.configLabel}
                            </td>
                            <td className="text-center px-2 py-1 text-primary font-bold">
                              {row.bestCategory}
                            </td>
                            {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => {
                              const val = summary
                                ? returnMode === "band"
                                  ? (summary as any).bandHitRate?.[h.label] ??
                                    summary.hitRate[h.label]
                                  : summary.hitRate[h.label]
                                : 0;
                              return (
                                <td
                                  key={h.label}
                                  className={`text-center px-2 py-1 ${
                                    summary ? hitRateColor(val) : ""
                                  }`}
                                >
                                  {summary ? pct(val) : "–"}
                                </td>
                              );
                            })}
                            {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                              <td
                                key={`avg-${h.label}`}
                                className={`text-center px-2 py-1 ${
                                  summary
                                    ? summary.avgReturn[h.label] >= 0
                                      ? "text-green-400"
                                      : "text-red-400"
                                    : ""
                                }`}
                              >
                                {summary ? pctSigned(summary.avgReturn[h.label]) : "–"}
                              </td>
                            ))}
                            {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                              <td
                                key={`pf-${h.label}`}
                                className={`text-center px-2 py-1 ${
                                  summary ? profitFactorColor(summary.profitFactor[h.label]) : ""
                                }`}
                              >
                                {summary
                                  ? summary.profitFactor[h.label] >= 99
                                    ? "∞"
                                    : summary.profitFactor[h.label].toFixed(2)
                                  : "–"}
                              </td>
                            ))}
                            <td className="text-center px-2 py-1">
                              <span
                                className="inline-block px-1.5 py-0.5 rounded font-bold"
                                style={{
                                  backgroundColor: scoreBackgroundColor(row.bestScore),
                                  color: scoreTextColor(row.bestScore),
                                }}
                              >
                                {row.bestScore}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Expanded detail */}
                {expandedTicker &&
                  (() => {
                    const row = rankedResults.find((r) => r.ticker === expandedTicker);
                    if (!row) return null;
                    const sortedConfigs = [...row.configs].sort(
                      (a, b) => b.bestScore - a.bestScore
                    );
                    return (
                      <div className="border border-border rounded p-3 bg-card/50 mb-4">
                        <h4 className="text-xs font-bold text-foreground mb-1">
                          {row.ticker} — {row.name} — RSI{" "}
                          {row.currentRSI !== null ? row.currentRSI.toFixed(1) : "N/A"}
                        </h4>
                        <p className="text-[9px] text-muted-foreground mb-3">
                          {sortedConfigs.length} configurations tested — showing top results
                        </p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {sortedConfigs.slice(0, 6).map((cfg, cfgIdx) => {
                            const bestCat =
                              cfg.categories.find(
                                (c) => c.category === cfg.bestCategory
                              ) ??
                              cfg.categories.reduce(
                                (a, b) =>
                                  a.composite.score > b.composite.score ? a : b,
                                cfg.categories[0]
                              );
                            return (
                              <div
                                key={cfg.configLabel}
                                className="border border-border/50 rounded p-2"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-mono font-bold text-foreground">
                                    {cfg.configLabel}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground">
                                    → {bestCat.label}
                                  </span>
                                  <span
                                    className="ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-bold"
                                    style={{
                                      backgroundColor: scoreBackgroundColor(cfg.bestScore),
                                      color: scoreTextColor(cfg.bestScore),
                                    }}
                                  >
                                    {cfg.bestScore}
                                  </span>
                                </div>
                                {cfg.categories
                                  .filter((cat) => cat.summary.count > 0)
                                  .sort((a, b) => b.composite.score - a.composite.score)
                                  .map((cat) => {
                                    const expandKey = `${row.ticker}::${cfg.configLabel}::${cat.category}`;
                                    const isExpKey = expandedConfigs.has(expandKey);
                                    const hasProfiles = !!(
                                      cat.profiles &&
                                      cat.profiles.length >= 10 &&
                                      row.priceContext
                                    );
                                    const catDir =
                                      RSI_CATEGORIES[
                                        cat.category as keyof typeof RSI_CATEGORIES
                                      ]?.direction === "sell"
                                        ? "sell"
                                        : "buy";
                                    return (
                                      <div key={cat.category} className="mt-1">
                                        <div className="flex items-center gap-1 mb-0.5">
                                          <span
                                            className={`text-[9px] font-bold ${signalBadgeClass(
                                              cat.label
                                            )
                                              .split(" ")
                                              .filter((s) => s.startsWith("text-"))
                                              .join(" ")}`}
                                          >
                                            {cat.label}
                                          </span>
                                          <span className="text-[8px] text-muted-foreground">
                                            {cat.summary.count} signals
                                          </span>
                                          {hasProfiles ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                toggleExpandedConfig(expandKey)
                                              }
                                              className={`ml-auto px-1.5 py-0.5 rounded text-[8px] font-bold border ${
                                                isExpKey
                                                  ? "bg-violet-500/25 text-violet-200 border-violet-400/40"
                                                  : "bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"
                                              }`}
                                              title="Profile what other indicators looked like at hit-bars vs miss-bars"
                                            >
                                              {isExpKey ? "▾" : "▸"} Hit Conditions
                                            </button>
                                          ) : null}
                                        </div>
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
                                            {FORWARD_HORIZONS.map((h) => (
                                              <tr key={h.label}>
                                                <td className="px-1 py-0.5 text-foreground font-bold">
                                                  {h.label}
                                                </td>
                                                <td
                                                  className={`text-center px-1 py-0.5 ${hitRateColor(
                                                    cat.summary.hitRate[h.label]
                                                  )}`}
                                                >
                                                  {pct(cat.summary.hitRate[h.label])}
                                                </td>
                                                <td
                                                  className={`text-center px-1 py-0.5 ${hitRateColor(
                                                    cat.summary.winRate[h.label]
                                                  )}`}
                                                >
                                                  {pct(cat.summary.winRate[h.label])}
                                                </td>
                                                <td
                                                  className={`text-center px-1 py-0.5 ${
                                                    cat.summary.avgReturn[h.label] >= 0
                                                      ? "text-green-400"
                                                      : "text-red-400"
                                                  }`}
                                                >
                                                  {pctSigned(
                                                    cat.summary.avgReturn[h.label]
                                                  )}
                                                </td>
                                                <td
                                                  className={`text-center px-1 py-0.5 ${
                                                    cat.summary.medianReturn[h.label] >= 0
                                                      ? "text-green-400"
                                                      : "text-red-400"
                                                  }`}
                                                >
                                                  {pctSigned(
                                                    cat.summary.medianReturn[h.label]
                                                  )}
                                                </td>
                                                <td className="text-center px-1 py-0.5 text-green-400">
                                                  {pctSigned(
                                                    cat.summary.avgPeak[h.label]
                                                  )}
                                                </td>
                                                <td className="text-center px-1 py-0.5 text-red-400">
                                                  {pctSigned(
                                                    cat.summary.avgTrough[h.label]
                                                  )}
                                                </td>
                                                <td
                                                  className={`text-center px-1 py-0.5 ${profitFactorColor(
                                                    cat.summary.profitFactor[h.label]
                                                  )}`}
                                                >
                                                  {cat.summary.profitFactor[h.label] >= 99
                                                    ? "∞"
                                                    : cat.summary.profitFactor[
                                                        h.label
                                                      ].toFixed(2)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {isExpKey &&
                                        row.priceContext &&
                                        cat.profiles ? (
                                          <div className="mt-2">
                                            <HitConditionsPanel
                                              ticker={row.ticker}
                                              priceContext={row.priceContext}
                                              signals={cat.profiles}
                                              direction={catDir}
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
          </div>
        </>
      )}
    </div>
  );
}
