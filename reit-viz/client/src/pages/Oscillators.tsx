// Reconstructed from recovered-bundle/Oscillators-BTlPqSR6.js on 2026-06-12
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
  getScoreWeights,
  pickBestByRankMode,
  hitRateColor,
  profitFactorColor,
  scoreTextColor,
  scoreBackgroundColor,
  pct,
  pctSigned,
  FORWARD_HORIZONS,
  RANK_BY_OPTIONS,
  DATE_PRESETS,
  createDateRangeFromPreset,
  TARGET_RETURN_OPTIONS,
  RETURN_BAND_PRESETS,
} from "@/lib/forwardReturns";
import { filterByDateRange, createDateRange } from "@/lib/optimizerInputSeries";
import { useUniverse } from "@/lib/universeContext";
import { useBaskets } from "@/lib/basketContext";
import { getScoreWeights as getScoreWeightsAlias } from "@/lib/forwardReturns";
import { getDates, getTickers, getTickerRaw } from "@/lib/dataService";
import { refreshTickerData } from "@/lib/dataService";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { PresetBar } from "@/components/PresetBar";
import {
  stochOscillator,
  detectSignals,
  computeForwardProfileOsc,
  summarizeSignalsOsc,
} from "@/lib/oscillatorMath";
import {
  buildBacktestResult,
  EvaluatorPanelResult,
  EvaluatorPanelLoader,
} from "@/components/EvaluatorPanel";
import { WorkerPool } from "@/lib/workerPool";
import { UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { BasketTickerPill } from "@/components/BasketTickerPill";
import { BasketPicker } from "@/components/BasketPicker";
import { buildBasketOhlc, getBasketOhlc } from "@/lib/basketOhlc";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { weeklyDownsamplePrices, expandWeeklyToDaily } from "@/lib/weeklyDownsample";
import { getDailyIndexFromWeekly } from "@/lib/getDailyIndexFromWeekly";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import "@/lib/harsi";
import "@/lib/tva";

// Re-alias bundle names to real names
const at = stochOscillator as any;
const Ft = detectSignals as any;
const Kt = computeForwardProfileOsc as any;
const wo = summarizeSignalsOsc as any;
const hr = buildBacktestResult as any;
const yr = EvaluatorPanelResult as any;
const vo = EvaluatorPanelLoader as any;
// Declare custom JSX element names so TypeScript accepts them
declare global { namespace JSX { interface IntrinsicElements { yr: any; vo: any; } } }
const kr = WorkerPool as any;
const gr = getYahooPairsRatio as any;
const br = PresetBar as any;
const lt = pctSigned;
const ho = profitFactorColor;
const yo = scoreTextColor;
const ko = scoreBackgroundColor;
const ze = pct;
const Dt = hitRateColor;
const je = FORWARD_HORIZONS;
const ur = RANK_BY_OPTIONS;
const go = DATE_PRESETS;
const bo = createDateRangeFromPreset;
const cr = TARGET_RETURN_OPTIONS;
const dr = RETURN_BAND_PRESETS;
const xo = getDates;
const nr = getDates as any;
const mr = getTickerRaw as any;
const fr = filterByDateRange as any;
const mo = weeklyDownsamplePrices as any;
const fo = getDailyIndexFromWeekly as any;
const Lt = computeForwardProfile as any;
const Ve = summarizeSignals as any;
const He = computeCompositeScore as any;
const No = buildBasketOhlc as any;
const wt = getBasketOhlc as any;
const ir = refreshTickerData as any;
const or = getScoreWeights as any;
const rr = createDateRange as any;
const ar = (pickBestByRankMode as any);
const kt = (ticker: string) => ticker?.startsWith?.("BASKET:") ?? false;
const qe = (closes: number[], dates: string[]) => (weeklyDownsamplePrices as any)(closes, dates);
const Vt = (arr: any[], weekIndex: number[], n: number) => (expandWeeklyToDaily as any)(arr, weekIndex, n);

function createOscWorker(opts?: { name?: string }) {
  return new Worker("" + new URL("oscillatorOptimizer.worker-C5wv6LuK.js", import.meta.url).href, {
    name: opts?.name,
  });
}

const SIGNAL_LABELS = {
  buy: {
    label: "Buy Signal",
    description: "Long-side signal — entry into long position",
  },
  sell: {
    label: "Sell Signal",
    description: "Short-side signal — entry into short position",
  },
};

const STOCH_PERIODS = [5, 14, 21];
const SMOOTH_K_OPTIONS = [1, 3, 5];
const SMOOTH_D_OPTIONS = [3, 5];
const OS_OPTIONS = [15, 20, 25];
const OB_OPTIONS = [75, 80, 85];

const EWO_FAST_PARAMS: number[] = (() => {
  const arr: number[] = [];
  for (let i = 2; i <= 100; i += 2) arr.push(i);
  return arr;
})();

const EWO_SLOW_PARAMS: number[] = (() => {
  const arr: number[] = [];
  for (let i = 4; i <= 200; i += 2) arr.push(i);
  return arr;
})();

const EWO_THRESH_PCT = [0, 0.25, 0.5, 1, 1.5, 2];

export default function Oscillators() {
  const [allTickers, setAllTickers] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [subMode, setSubMode] = useState("stoch");
  const [stochSignalMode, setStochSignalMode] = useState("cross_out_of_band");
  const [returnMode, setReturnMode] = useState("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.1);
  const [minHold, setMinHold] = useState(0);
  const [ewoDisplay, setEwoDisplay] = useState("raw");
  const [mode, setMode] = useState("single");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketRunMode, setBasketRunMode] = useState("stocks");
  const { baskets: basketsDef } = (useBaskets as any)();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<any[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const toggleExpandedKey = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);
  const [sortBy, setSortBy] = useState("score");
  const [rankBy, setRankBy] = useState("composite");
  const scoreWeights = useMemo(() => or(rankBy), [rankBy]);
  const [filterText, setFilterText] = useState("");
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState(() => rr());
  const [viewMode, setViewMode] = useState("optimize");
  const [evalSide, setEvalSide] = useState("long");
  const [evalResult, setEvalResult] = useState<any>(null);
  const [evalPriceContext, setEvalPriceContext] = useState<any>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  // Stoch eval params
  const [stochK, setStochK] = useState(14);
  const [stochSmoothK, setStochSmoothK] = useState(3);
  const [stochSmoothD, setStochSmoothD] = useState(3);
  const [stochOS, setStochOS] = useState(20);
  const [stochOB, setStochOB] = useState(80);
  // EWO eval params
  const [ewoFast, setEwoFast] = useState(5);
  const [ewoSlow, setEwoSlow] = useState(34);
  const [ewoThreshPct, setEwoThreshPct] = useState(0);

  const cancelRef = useRef(false);
  const wasInitializedRef = useRef(false);
  const workerPoolRef = useRef<any>(null);

  const { universeTickers, isFiltered: isUniverseFiltered } = (useUniverse as any)();

  const filteredAllTickers = useMemo(
    () => (universeTickers ? allTickers.filter((e) => universeTickers.has(e.ticker)) : allTickers),
    [allTickers, universeTickers]
  );

  const classFilter = useOptimizerClassFilter(filteredAllTickers, mode === "universe", "osc-clf");
  const pairComboPicker = usePairComboPicker(
    filteredAllTickers.map((e) => e.ticker),
    mode === "pairCombo",
    "osc-pc"
  );

  const { frequency, setFrequency, frequencyUI } = useFrequency(
    "osc",
    "daily",
    isRunning || mode === "pair" || mode === "pairCombo"
  );
  const ht = frequency === "weekly" ? "weekly" : "daily";

  useEffect(() => {
    (getTickers as any)().then((tickers: any[]) => {
      setAllTickers(tickers);
      if (tickers.length > 0 && !wasInitializedRef.current) {
        setSelectedTicker((prev) => prev || tickers[0].ticker);
        setPairTickerA((prev) => prev || tickers[0].ticker);
        setPairTickerB((prev) => prev || (tickers[1]?.ticker ?? tickers[0].ticker));
      }
    });
  }, []);

  useEffect(() => {
    if (
      filteredAllTickers.length > 0 &&
      selectedTicker &&
      allTickers.some((e) => e.ticker === selectedTicker) &&
      !filteredAllTickers.find((e) => e.ticker === selectedTicker)
    ) {
      setSelectedTicker(filteredAllTickers[0].ticker);
    }
  }, [filteredAllTickers, selectedTicker, allTickers]);

  const fetchTickerData = async (ticker: string, allDates: string[]) => {
    if (ticker === "__PAIR__" || ticker.startsWith("__PAIR__:")) {
      const [legA, legB] = ticker.startsWith("__PAIR__:")
        ? ticker.slice(9).split(":")
        : [pairTickerA, pairTickerB];
      const ratio = await gr(legA, legB, allDates);
      if (!ratio || ratio.indices.length < 252) return null;
      const priceDates = ratio.indices.map((g: number) => allDates[g] ?? "");
      return {
        closes: ratio.prices,
        highs: ratio.prices.slice(),
        lows: ratio.prices.slice(),
        volumes: [],
        priceDates,
        globalIndices: ratio.indices.slice(),
      };
    }
    try {
      const raw = await mr(ticker);
      const filtered = fr(raw, dateRange);
      if (filtered.adjCloses.length >= 252) {
        const adjClose = filtered.adjCloses as number[];
        const rawClose = filtered.closes as number[];
        const adjHighs = new Array(adjClose.length);
        const adjLows = new Array(adjClose.length);
        for (let i = 0; i < adjClose.length; i++) {
          const c = rawClose[i];
          const ac = adjClose[i];
          if (c && c > 0 && Number.isFinite(c) && Number.isFinite(ac)) {
            const ratio = ac / c;
            adjHighs[i] = filtered.highs[i] * ratio;
            adjLows[i] = filtered.lows[i] * ratio;
          } else {
            adjHighs[i] = filtered.highs[i];
            adjLows[i] = filtered.lows[i];
          }
        }
        const priceDates = filtered.dates.slice(0, adjClose.length);
        const globalMap = new Map<string, number>();
        for (let i = 0; i < allDates.length; i++) globalMap.set(allDates[i], i);
        const globalIndices = priceDates.map((d: string) => globalMap.get(d) ?? -1);
        return {
          closes: adjClose,
          highs: adjHighs,
          lows: adjLows,
          volumes: filtered.volumes ?? [],
          priceDates,
          globalIndices,
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const runOptimizer = useCallback(async () => {
    setIsRunning(true);
    setResults([]);
    cancelRef.current = false;

    const allDates = await xo();
    let tickerList: any[];

    if (mode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
        setIsRunning(false);
        return;
      }
      tickerList = [{ ticker: "__PAIR__", name: `${pairTickerA}/${pairTickerB}` }];
    } else if (mode === "single") {
      const found = filteredAllTickers.find((r) => r.ticker === selectedTicker);
      tickerList = found
        ? [found]
        : selectedTicker
        ? [{ ticker: selectedTicker, name: selectedTicker }]
        : [];
    } else if (mode === "basket") {
      if (basketRunMode === "combined") {
        if (basketTickers.length === 0) {
          setIsRunning(false);
          return;
        }
        const combined = No(basketTickers, basketsDef);
        tickerList = [{ ticker: `BASKET:${combined.name}`, name: `BASKET:${combined.name}` }];
      } else {
        tickerList = basketTickers.map(
          (t) =>
            filteredAllTickers.find((r) => r.ticker.toUpperCase() === t.toUpperCase()) ?? {
              ticker: t,
              name: t,
            }
        );
      }
    } else if (mode === "pairCombo") {
      if (pairComboPicker.pairs.length === 0) {
        setIsRunning(false);
        return;
      }
      tickerList = pairComboPicker.pairs.map((n: any) => ({
        ticker: `__PAIR__:${n.a}:${n.b}`,
        name: n.label,
        pairA: n.a,
        pairB: n.b,
      }));
    } else {
      tickerList = classFilter.filteredTickers;
    }

    if (tickerList.length === 0) {
      setIsRunning(false);
      return;
    }

    const combinedBasket =
      mode === "basket" && basketRunMode === "combined" ? No(basketTickers, basketsDef) : null;

    setProgress({ current: 0, total: tickerList.length });

    // EWO mode — daily with worker pool
    if (subMode === "ewo") {
      if (frequency === "daily") {
        workerPoolRef.current?.terminate();
        const concurrency = Math.min(Math.max(2, navigator.hardwareConcurrency || 4), 8);
        const pool = new kr(() => createOscWorker(), concurrency);
        workerPoolRef.current = pool;

        const ewoParams = {
          ewoFast: EWO_FAST_PARAMS,
          ewoSlow: EWO_SLOW_PARAMS,
          ewoThresholdPct: EWO_THRESH_PCT,
          targetReturn,
          returnMode,
          bandMin,
          bandMax,
          minHold,
        };

        const accumulated: any[] = [];
        let doneCount = 0;

        const tasks = tickerList.map(async (ticker: any) => {
          if (cancelRef.current) return;
          try {
            const priceData = combinedBasket
              ? await wt(combinedBasket, dateRange).then((s: any) =>
                  s
                    ? {
                        closes: s.closes,
                        highs: s.highs,
                        lows: s.lows,
                        volumes: s.volumes,
                        priceDates: s.priceDates,
                        globalIndices: [],
                      }
                    : null
                )
              : await fetchTickerData(ticker.ticker, allDates);

            if (!priceData || priceData.closes.length < 252 || cancelRef.current) return;

            const label =
              ticker.ticker === "__PAIR__"
                ? `${pairTickerA}/${pairTickerB}`
                : (ticker.ticker.startsWith("__PAIR__:") && ticker.name) || ticker.ticker;

            const workerResult = await pool.run({
              type: "run",
              ticker: label,
              name: ticker.name,
              closes: priceData.closes,
              highs: priceData.highs,
              lows: priceData.lows,
              params: ewoParams,
            });

            if (!workerResult) return;

            const priceContext = {
              prices: priceData.closes,
              highs: priceData.highs,
              lows: priceData.lows,
              volumes: priceData.volumes,
              dates: priceData.priceDates,
              globalIndices: priceData.globalIndices,
              benchmarkPrices: null,
              mode: mode === "pair" || mode === "pairCombo" ? "pair" : "single",
              pairLegA: mode === "pairCombo" ? ticker.pairA : mode === "pair" ? pairTickerA : undefined,
              pairLegB: mode === "pairCombo" ? ticker.pairB : mode === "pair" ? pairTickerB : undefined,
            };

            accumulated.push({
              ticker: workerResult.ticker,
              name: workerResult.name,
              configs: workerResult.configs,
              bestConfigLabel: workerResult.bestConfigLabel,
              bestCategory: SIGNAL_LABELS[workerResult.bestCategory as keyof typeof SIGNAL_LABELS]?.label ?? workerResult.bestCategory,
              bestScore: workerResult.bestScore,
              currentSignal: workerResult.currentSignal,
              currentValue: workerResult.currentValue,
              currentValuePct: workerResult.currentValuePct,
              priceContext,
            });
          } catch {
          } finally {
            doneCount++;
            setProgress({ current: doneCount, total: tickerList.length });
            if (doneCount % 3 === 0 || doneCount === tickerList.length) setResults([...accumulated]);
          }
        });

        await Promise.all(tasks);
        setResults([...accumulated]);
        pool.terminate();
        workerPoolRef.current = null;
        setIsRunning(false);
        return;
      }

      // EWO weekly_on_daily
      if (frequency === "weekly_on_daily") {
        const accumulated: any[] = [];
        for (let idx = 0; idx < tickerList.length && !cancelRef.current; idx++) {
          const ticker = tickerList[idx];
          setProgress({ current: idx + 1, total: tickerList.length });
          try {
            const priceData = combinedBasket
              ? await wt(combinedBasket, dateRange).then((d: any) =>
                  d
                    ? { closes: d.closes, highs: d.highs, lows: d.lows, volumes: d.volumes, priceDates: d.priceDates, globalIndices: [] }
                    : null
                )
              : await fetchTickerData(ticker.ticker, allDates);

            if (!priceData) continue;
            const dailyLen = priceData.closes.length;
            if (dailyLen < 252) continue;

            const wkCloses = qe(priceData.closes, priceData.priceDates);
            const wkHighs = qe(priceData.highs, priceData.priceDates);
            const wkLows = qe(priceData.lows, priceData.priceDates);
            if (wkCloses.prices.length < 52) continue;

            const rawDailyCloses = priceData.closes;
            const MA_LEN = 52;
            const maWeekly = new Array(wkCloses.prices.length).fill(null);
            let sum = 0; let cnt = 0;
            for (let i = 0; i < wkCloses.prices.length; i++) {
              sum += wkCloses.prices[i]; cnt++;
              if (i >= MA_LEN) { sum -= wkCloses.prices[i - MA_LEN]; cnt--; }
              if (cnt > 0) maWeekly[i] = sum / cnt;
            }
            const recentWk = wkCloses.prices.slice(-MA_LEN);
            const avgWk = recentWk.reduce((a: number, b: number) => a + b, 0) / Math.max(recentWk.length, 1);

            const configs: any[] = [];
            const isBand = returnMode === "band";
            const bandObj = isBand ? { minReturn: bandMin, maxReturn: bandMax } : null;

            for (const fast of EWO_FAST_PARAMS) {
              for (const slow of EWO_SLOW_PARAMS) {
                if (fast >= slow) continue;
                const ewoVals = at(wkHighs.prices, wkLows.prices, fast, slow).map((v: number | null) =>
                  v === null ? NaN : v
                );
                const ewoDaily = Vt(ewoVals, wkCloses.weekIndex, dailyLen).map((v: number) =>
                  Number.isFinite(v) ? v : null
                );
                const maDaily = Vt(
                  maWeekly.map((v: number | null) => (v === null ? NaN : v)),
                  wkCloses.weekIndex,
                  dailyLen
                ).map((v: number) => (Number.isFinite(v) ? v : null));
                const warmup = Math.max(slow * 5, 21) + 126;

                for (const thr of EWO_THRESH_PCT) {
                  const thrLine = maDaily.map((v: number | null) => (v === null ? null : (thr / 100) * v));
                  const signals = Ft(ewoDaily, thrLine, warmup);
                  const buyProfiles: any[] = [];
                  const sellProfiles: any[] = [];
                  let lastIdx = -1;
                  for (const sig of signals) {
                    if (minHold > 0 && sig.index < lastIdx) continue;
                    if (sig.index < 0 || sig.index >= dailyLen) continue;
                    const profile = Lt(rawDailyCloses, sig.index, targetReturn, sig.direction, bandObj, minHold);
                    sig.direction === "buy" ? buyProfiles.push(profile) : sellProfiles.push(profile);
                    if (minHold > 0) lastIdx = sig.index + minHold;
                  }
                  const buySummary = Ve(buyProfiles, "buy");
                  const sellSummary = Ve(sellProfiles, "sell");
                  const buyComposite = He(buySummary, "buy", isBand);
                  const sellComposite = He(sellSummary, "sell", isBand);
                  const cats = [
                    { category: "buy", label: SIGNAL_LABELS.buy.label, description: SIGNAL_LABELS.buy.description, summary: buySummary, composite: buyComposite, profiles: buyProfiles },
                    { category: "sell", label: SIGNAL_LABELS.sell.label, description: SIGNAL_LABELS.sell.description, summary: sellSummary, composite: sellComposite, profiles: sellProfiles },
                  ];
                  const best = cats.reduce((a, b) => (a.composite.score > b.composite.score ? a : b), cats[0]);
                  configs.push({
                    configLabel: `EWO(${fast},${slow}) thr ${thr}%`,
                    configKey: `${fast}_${slow}_${thr}`,
                    categories: cats,
                    bestCategory: best.category,
                    bestScore: best.composite.score,
                  });
                }
              }
            }

            if (configs.length === 0) continue;
            const TOP_N = 6;
            const sorted = [...configs].sort((a, b) => b.bestScore - a.bestScore);
            const topKeys = new Set(sorted.slice(0, TOP_N).map((c) => c.configKey));
            for (const c of configs) {
              if (!topKeys.has(c.configKey)) {
                for (const cat of c.categories) cat.profiles = undefined;
              }
            }
            const bestCfg = configs.reduce((a, b) => (a.bestScore > b.bestScore ? a : b));
            const parts = bestCfg.configKey.split("_");
            const [bFast, bSlow, bThr] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
            const ewoLast = at(wkHighs.prices, wkLows.prices, bFast, bSlow);
            const lastVal = ewoLast[ewoLast.length - 1];
            const prevVal = ewoLast[ewoLast.length - 2] ?? null;
            const currentValue = lastVal !== null ? Math.round(lastVal * 1000) / 1000 : null;
            let currentValuePct: number | null = null;
            if (lastVal !== null) {
              const slice = wkCloses.prices.slice(-bSlow);
              const avg = slice.reduce((a: number, b: number) => a + b, 0) / Math.max(slice.length, 1);
              if (avg > 0) currentValuePct = Math.round((lastVal / avg) * 1000) / 10;
            }
            const thrAbs = (bThr / 100) * avgWk;
            let currentSignal = "None";
            if (lastVal !== null) {
              if (lastVal > thrAbs) currentSignal = thrAbs > 0 ? "Above +Thr" : "Above 0";
              else if (lastVal < -thrAbs) currentSignal = thrAbs > 0 ? "Below -Thr" : "Below 0";
              else currentSignal = "In Zone";
              if (prevVal !== null) {
                if (thrAbs === 0) {
                  if (prevVal <= 0 && lastVal > 0) currentSignal = "→ Cross Up";
                  else if (prevVal >= 0 && lastVal < 0) currentSignal = "→ Cross Down";
                } else {
                  if (prevVal <= thrAbs && lastVal > thrAbs) currentSignal = "→ Cross +Thr";
                  else if (prevVal >= -thrAbs && lastVal < -thrAbs) currentSignal = "→ Cross -Thr";
                }
              }
            }

            const tickerLabel =
              ticker.ticker === "__PAIR__"
                ? `${pairTickerA}/${pairTickerB}`
                : (ticker.ticker.startsWith("__PAIR__:") && ticker.name) || ticker.ticker;

            accumulated.push({
              ticker: tickerLabel,
              name: ticker.name,
              configs,
              bestConfigLabel: bestCfg.configLabel,
              bestCategory: SIGNAL_LABELS[bestCfg.bestCategory as keyof typeof SIGNAL_LABELS]?.label ?? bestCfg.bestCategory,
              bestScore: bestCfg.bestScore,
              priceContext: {
                prices: priceData.closes,
                highs: priceData.highs,
                lows: priceData.lows,
                volumes: priceData.volumes,
                dates: priceData.priceDates,
                globalIndices: priceData.globalIndices,
                benchmarkPrices: null,
                mode: mode === "pair" || mode === "pairCombo" ? "pair" : "single",
                pairLegA: mode === "pairCombo" ? ticker.pairA : mode === "pair" ? pairTickerA : undefined,
                pairLegB: mode === "pairCombo" ? ticker.pairB : mode === "pair" ? pairTickerB : undefined,
              },
              currentSignal,
              currentValue,
              currentValuePct,
            });
            if (idx % 3 === 0 || idx === tickerList.length - 1) setResults([...accumulated]);
          } catch {}
        }
        setResults(accumulated);
        setIsRunning(false);
        return;
      }

      // EWO weekly
      const accumulated: any[] = [];
      for (let idx = 0; idx < tickerList.length && !cancelRef.current; idx++) {
        const ticker = tickerList[idx];
        setProgress({ current: idx + 1, total: tickerList.length });
        try {
          const priceData = combinedBasket
            ? await wt(combinedBasket, dateRange).then((x: any) =>
                x
                  ? { closes: x.closes, highs: x.highs, lows: x.lows, volumes: x.volumes, priceDates: x.priceDates, globalIndices: [] }
                  : null
              )
            : await fetchTickerData(ticker.ticker, allDates);

          if (!priceData) continue;
          const weekly = mo({ dates: priceData.priceDates, closes: priceData.closes, adjCloses: priceData.closes, highs: priceData.highs, lows: priceData.lows }, "weekly");
          if (weekly.adjCloses.length < 52) continue;

          const dailyCloses = priceData.closes;
          const MA_LEN = 52;
          const maWeekly = new Array(weekly.closes.length).fill(null);
          let sum = 0; let cnt = 0;
          for (let i = 0; i < weekly.closes.length; i++) {
            sum += weekly.closes[i]; cnt++;
            if (i >= MA_LEN) { sum -= weekly.closes[i - MA_LEN]; cnt--; }
            if (cnt > 0) maWeekly[i] = sum / cnt;
          }
          const recentWk = weekly.closes.slice(-MA_LEN);
          const avgWk = recentWk.reduce((a: number, b: number) => a + b, 0) / Math.max(recentWk.length, 1);

          const configs: any[] = [];
          const isBand = returnMode === "band";
          const bandObj = isBand ? { minReturn: bandMin, maxReturn: bandMax } : null;

          for (const fast of EWO_FAST_PARAMS) {
            for (const slow of EWO_SLOW_PARAMS) {
              if (fast >= slow) continue;
              const warmup = slow + 26;
              for (const thr of EWO_THRESH_PCT) {
                const thrLine = maWeekly.map((v: number | null) => (v === null ? null : (thr / 100) * v));
                const ewoVals = at(weekly.highs, weekly.lows, fast, slow);
                const signals = Ft(ewoVals, thrLine, warmup);
                const buyProfiles: any[] = [];
                const sellProfiles: any[] = [];
                let lastIdx = -1;
                for (const sig of signals) {
                  if (minHold > 0 && sig.index < lastIdx) continue;
                  const dailyIdx = fo(sig.index, weekly);
                  if (dailyIdx < 0) continue;
                  const profile = Lt(dailyCloses, dailyIdx, targetReturn, sig.direction, bandObj, minHold);
                  sig.direction === "buy" ? buyProfiles.push(profile) : sellProfiles.push(profile);
                  if (minHold > 0) lastIdx = sig.index + minHold;
                }
                const buySummary = Ve(buyProfiles, "buy");
                const sellSummary = Ve(sellProfiles, "sell");
                const buyComposite = He(buySummary, "buy", isBand);
                const sellComposite = He(sellSummary, "sell", isBand);
                const cats = [
                  { category: "buy", label: SIGNAL_LABELS.buy.label, description: SIGNAL_LABELS.buy.description, summary: buySummary, composite: buyComposite, profiles: buyProfiles },
                  { category: "sell", label: SIGNAL_LABELS.sell.label, description: SIGNAL_LABELS.sell.description, summary: sellSummary, composite: sellComposite, profiles: sellProfiles },
                ];
                const best = cats.reduce((a, b) => (a.composite.score > b.composite.score ? a : b), cats[0]);
                configs.push({
                  configLabel: `EWO(${fast},${slow}) thr ${thr}%`,
                  configKey: `${fast}_${slow}_${thr}`,
                  categories: cats,
                  bestCategory: best.category,
                  bestScore: best.composite.score,
                });
              }
            }
          }

          if (configs.length === 0) continue;
          const TOP_N = 6;
          const sorted = [...configs].sort((a, b) => b.bestScore - a.bestScore);
          const topKeys = new Set(sorted.slice(0, TOP_N).map((c) => c.configKey));
          for (const c of configs) {
            if (!topKeys.has(c.configKey)) {
              for (const cat of c.categories) cat.profiles = undefined;
            }
          }
          const bestCfg = configs.reduce((a, b) => (a.bestScore > b.bestScore ? a : b));
          const parts = bestCfg.configKey.split("_").map(Number);
          const [bFast, bSlow, bThr] = parts;
          const ewoLast = at(weekly.highs, weekly.lows, bFast, bSlow);
          const lastVal = ewoLast[ewoLast.length - 1];
          const prevVal = ewoLast[ewoLast.length - 2] ?? null;
          const currentValue = lastVal !== null ? Math.round(lastVal * 1000) / 1000 : null;
          let currentValuePct: number | null = null;
          if (lastVal !== null) {
            const slice = weekly.closes.slice(-bSlow);
            const avg = slice.reduce((a: number, b: number) => a + b, 0) / Math.max(slice.length, 1);
            if (avg > 0) currentValuePct = Math.round((lastVal / avg) * 1000) / 10;
          }
          const thrAbs = (bThr / 100) * avgWk;
          let currentSignal = "None";
          if (lastVal !== null) {
            if (lastVal > thrAbs) currentSignal = thrAbs > 0 ? "Above +Thr" : "Above 0";
            else if (lastVal < -thrAbs) currentSignal = thrAbs > 0 ? "Below -Thr" : "Below 0";
            else currentSignal = "In Zone";
            if (prevVal !== null) {
              if (thrAbs === 0) {
                if (prevVal <= 0 && lastVal > 0) currentSignal = "→ Cross Up";
                else if (prevVal >= 0 && lastVal < 0) currentSignal = "→ Cross Down";
              } else {
                if (prevVal <= thrAbs && lastVal > thrAbs) currentSignal = "→ Cross +Thr";
                else if (prevVal >= -thrAbs && lastVal < -thrAbs) currentSignal = "→ Cross -Thr";
              }
            }
          }

          const tickerLabel =
            ticker.ticker === "__PAIR__"
              ? `${pairTickerA}/${pairTickerB}`
              : (ticker.ticker.startsWith("__PAIR__:") && ticker.name) || ticker.ticker;

          const priceContext = {
            prices: weekly.closes,
            highs: weekly.highs,
            lows: weekly.lows,
            volumes: weekly.volumes,
            dates: weekly.dates,
            globalIndices: weekly.dailyIndexMap.map((x: number) => priceData.globalIndices[x] ?? -1),
            benchmarkPrices: null,
            mode: mode === "pair" || mode === "pairCombo" ? "pair" : "single",
            pairLegA: mode === "pairCombo" ? ticker.pairA : mode === "pair" ? pairTickerA : undefined,
            pairLegB: mode === "pairCombo" ? ticker.pairB : mode === "pair" ? pairTickerB : undefined,
          };

          accumulated.push({
            ticker: tickerLabel,
            name: ticker.name,
            configs,
            bestConfigLabel: bestCfg.configLabel,
            bestCategory: SIGNAL_LABELS[bestCfg.bestCategory as keyof typeof SIGNAL_LABELS]?.label ?? bestCfg.bestCategory,
            bestScore: bestCfg.bestScore,
            priceContext,
            currentSignal,
            currentValue,
            currentValuePct,
          });
          if (idx % 3 === 0 || idx === tickerList.length - 1) setResults([...accumulated]);
        } catch {}
      }
      setResults(accumulated);
      setIsRunning(false);
      return;
    }

    // Stoch mode
    const accumulated: any[] = [];
    for (let idx = 0; idx < tickerList.length && !cancelRef.current; idx++) {
      const ticker = tickerList[idx];
      setProgress({ current: idx + 1, total: tickerList.length });
      try {
        const priceData = combinedBasket
          ? await wt(combinedBasket, dateRange).then((x: any) =>
              x
                ? { closes: x.closes, highs: x.highs, lows: x.lows, volumes: x.volumes, priceDates: x.priceDates, globalIndices: [] }
                : null
            )
          : await fetchTickerData(ticker.ticker, allDates);

        if (!priceData) continue;
        const dailyCloses = priceData.closes;
        const dailyLen = priceData.closes.length;

        let wkHighs: number[], wkLows: number[], wkCloses_: number[], weeklyObj: any | null = null;
        let wkData_daily: any | null = null, wkData_wod: any | null = null;

        if (frequency === "weekly_on_daily") {
          if (dailyLen < 252) continue;
          const wkC = qe(priceData.closes, priceData.priceDates);
          const wkH = qe(priceData.highs, priceData.priceDates);
          const wkL = qe(priceData.lows, priceData.priceDates);
          if (wkC.prices.length < 52) continue;
          wkCloses_ = wkC.prices; wkHighs = wkH.prices; wkLows = wkL.prices;
          wkData_wod = wkC;
        } else {
          weeklyObj = mo({ dates: priceData.priceDates, closes: priceData.closes, adjCloses: priceData.closes, highs: priceData.highs, lows: priceData.lows }, ht);
          const minLen = ht === "weekly" ? 52 : 252;
          if (weeklyObj.closes.length < minLen) continue;
          wkCloses_ = weeklyObj.closes; wkHighs = weeklyObj.highs; wkLows = weeklyObj.lows;
        }

        const configs: any[] = [];
        const isBand = returnMode === "band";
        const bandObj = isBand ? { minReturn: bandMin, maxReturn: bandMax } : null;

        for (const kLen of STOCH_PERIODS) {
          for (const sk of SMOOTH_K_OPTIONS) {
            for (const sd of SMOOTH_D_OPTIONS) {
              for (const os of OS_OPTIONS) {
                for (const ob of OB_OPTIONS) {
                  if (os >= ob) continue;
                  const { k: kLine, d: dLine } = Kt(wkHighs, wkLows, wkCloses_, kLen, sk, sd);
                  let kDaily: any[], dDaily: any[];

                  if (frequency === "weekly_on_daily" && wkData_wod) {
                    const mapToDaily = (arr: any[]) => {
                      const mapped = arr.map((v: number | null) => (v === null ? NaN : v));
                      return Vt(mapped, wkData_wod.weekIndex, dailyLen).map((v: number) =>
                        Number.isFinite(v) ? v : null
                      );
                    };
                    kDaily = mapToDaily(kLine);
                    dDaily = mapToDaily(dLine);
                  } else {
                    kDaily = kLine;
                    dDaily = dLine;
                  }

                  const warmup =
                    frequency === "weekly_on_daily"
                      ? Math.max((kLen + sk + sd) * 5, 21) + 126
                      : ht === "weekly"
                      ? kLen + sk + sd + 26
                      : kLen + sk + sd + 126;

                  const signals = wo(kDaily, dDaily, os, ob, stochSignalMode, warmup);
                  const buyProfiles: any[] = [];
                  const sellProfiles: any[] = [];
                  let lastIdx = -1;

                  for (const sig of signals) {
                    if (minHold > 0 && sig.index < lastIdx) continue;
                    const dailyIdx =
                      ht === "weekly" && weeklyObj ? fo(sig.index, weeklyObj) : sig.index;
                    if (dailyIdx < 0) continue;
                    const profile = Lt(dailyCloses, dailyIdx, targetReturn, sig.direction, bandObj, minHold);
                    sig.direction === "buy" ? buyProfiles.push(profile) : sellProfiles.push(profile);
                    if (minHold > 0) lastIdx = sig.index + minHold;
                  }

                  const buySummary = Ve(buyProfiles, "buy");
                  const sellSummary = Ve(sellProfiles, "sell");
                  const buyComposite = He(buySummary, "buy", isBand);
                  const sellComposite = He(sellSummary, "sell", isBand);
                  const cats = [
                    { category: "buy", label: SIGNAL_LABELS.buy.label, description: SIGNAL_LABELS.buy.description, summary: buySummary, composite: buyComposite, profiles: buyProfiles },
                    { category: "sell", label: SIGNAL_LABELS.sell.label, description: SIGNAL_LABELS.sell.description, summary: sellSummary, composite: sellComposite, profiles: sellProfiles },
                  ];
                  const best = cats.reduce((a, b) => (a.composite.score > b.composite.score ? a : b), cats[0]);
                  configs.push({
                    configLabel: `Stoch(${kLen},${sk},${sd}) ${os}/${ob}`,
                    configKey: `${kLen}_${sk}_${sd}_${os}_${ob}`,
                    categories: cats,
                    bestCategory: best.category,
                    bestScore: best.composite.score,
                  });
                }
              }
            }
          }
        }

        if (configs.length === 0) continue;
        const TOP_N = 6;
        const sortedC = [...configs].sort((a, b) => b.bestScore - a.bestScore);
        const topKeys = new Set(sortedC.slice(0, TOP_N).map((c) => c.configKey));
        for (const c of configs) {
          if (!topKeys.has(c.configKey)) {
            for (const cat of c.categories) cat.profiles = undefined;
          }
        }
        const bestCfg = configs.reduce((a, b) => (a.bestScore > b.bestScore ? a : b));
        const partsK = bestCfg.configKey.split("_").map(Number);
        const [bKLen, bSK, bSD, bOS, bOB] = partsK;
        const { k: bestK, d: bestD } = Kt(wkHighs!, wkLows!, wkCloses_!, bKLen, bSK, bSD);
        const lastK = bestK[bestK.length - 1];
        const prevK = bestK[bestK.length - 2] ?? null;
        const currentValue = lastK !== null ? Math.round(lastK * 10) / 10 : null;

        let currentSignal = "None";
        if (lastK !== null) {
          if (lastK <= bOS) currentSignal = "Oversold";
          else if (lastK >= bOB) currentSignal = "Overbought";
          else currentSignal = "Neutral";
          if (prevK !== null) {
            if (stochSignalMode === "cross_out_of_band") {
              if (prevK <= bOS && lastK > bOS) currentSignal = "→ Exit OS";
              else if (prevK >= bOB && lastK < bOB) currentSignal = "→ Exit OB";
            } else {
              const lastD = bestD[bestD.length - 1];
              const prevD = bestD[bestD.length - 2] ?? null;
              if (lastD !== null && prevD !== null) {
                if (prevK <= prevD && lastK > lastD && lastK <= bOS && lastD <= bOS) currentSignal = "→ K×D Buy";
                else if (prevK >= prevD && lastK < lastD && lastK >= bOB && lastD >= bOB) currentSignal = "→ K×D Sell";
              }
            }
          }
        }

        const tickerLabel =
          ticker.ticker === "__PAIR__"
            ? `${pairTickerA}/${pairTickerB}`
            : (ticker.ticker.startsWith("__PAIR__:") && ticker.name) || ticker.ticker;

        const priceCtx = weeklyObj
          ? {
              prices: weeklyObj.closes,
              highs: weeklyObj.highs,
              lows: weeklyObj.lows,
              volumes: weeklyObj.volumes,
              dates: weeklyObj.dates,
              globalIndices: weeklyObj.dailyIndexMap.map((x: number) => priceData.globalIndices[x] ?? -1),
              benchmarkPrices: null,
              mode: mode === "pair" || mode === "pairCombo" ? "pair" : "single",
              pairLegA: mode === "pairCombo" ? ticker.pairA : mode === "pair" ? pairTickerA : undefined,
              pairLegB: mode === "pairCombo" ? ticker.pairB : mode === "pair" ? pairTickerB : undefined,
            }
          : {
              prices: priceData.closes,
              highs: priceData.highs,
              lows: priceData.lows,
              volumes: priceData.volumes,
              dates: priceData.priceDates,
              globalIndices: priceData.globalIndices,
              benchmarkPrices: null,
              mode: mode === "pair" || mode === "pairCombo" ? "pair" : "single",
              pairLegA: mode === "pairCombo" ? ticker.pairA : mode === "pair" ? pairTickerA : undefined,
              pairLegB: mode === "pairCombo" ? ticker.pairB : mode === "pair" ? pairTickerB : undefined,
            };

        accumulated.push({
          ticker: tickerLabel,
          name: ticker.name,
          configs,
          bestConfigLabel: bestCfg.configLabel,
          bestCategory: SIGNAL_LABELS[bestCfg.bestCategory as keyof typeof SIGNAL_LABELS]?.label ?? bestCfg.bestCategory,
          bestScore: bestCfg.bestScore,
          priceContext: priceCtx,
          currentSignal,
          currentValue,
          currentValuePct: null,
        });
        if (idx % 5 === 0 || idx === tickerList.length - 1) setResults([...accumulated]);
      } catch {}
    }
    setResults(accumulated);
    setIsRunning(false);
  }, [
    filteredAllTickers, selectedTicker, pairTickerA, pairTickerB, mode, subMode, stochSignalMode,
    targetReturn, returnMode, bandMin, bandMax, minHold, frequency, dateRange, basketTickers,
    basketRunMode, basketsDef,
  ]);

  const runEvaluate = useCallback(async () => {
    setIsEvaluating(true);
    setEvalResult(null);
    setEvalPriceContext(null);
    try {
      const allDates = await xo();
      const ticker =
        mode === "pair" ? "__PAIR__" : mode === "single" ? selectedTicker : filteredAllTickers[0]?.ticker ?? "";
      if (mode === "pair" && (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB)) {
        setIsEvaluating(false);
        return;
      }
      if (!ticker) { setIsEvaluating(false); return; }
      const priceData = await fetchTickerData(ticker, allDates);
      if (!priceData) { setIsEvaluating(false); return; }

      const { closes, highs, lows, volumes, priceDates, globalIndices } = priceData;
      const datesArr = priceDates.length === closes.length ? priceDates : new Array(closes.length).fill("");
      const side = evalSide === "long" ? "buy" : "sell";
      const signalIndices: number[] = [];

      if (subMode === "stoch") {
        const { k, d } = Kt(highs, lows, closes, stochK, stochSmoothK, stochSmoothD);
        const warmup = stochK + stochSmoothK + stochSmoothD + 5;
        const signals = wo(k, d, stochOS, stochOB, stochSignalMode, warmup);
        for (const sig of signals) if (sig.direction === side) signalIndices.push(sig.index);
      } else {
        const ewoVals = at(highs, lows, ewoFast, ewoSlow);
        const lastPrice = closes[closes.length - 1] ?? 0;
        const thrAbs = (ewoThreshPct / 100) * lastPrice;
        const warmup = Math.max(ewoFast, ewoSlow) + 5;
        const signals = Ft(ewoVals, thrAbs, warmup);
        for (const sig of signals) if (sig.direction === side) signalIndices.push(sig.index);
      }

      signalIndices.sort((a, b) => a - b);
      const result = hr(closes, datesArr, signalIndices, evalSide, targetReturn, minHold, null, "3M");
      setEvalResult(result);
      setEvalPriceContext({
        prices: closes,
        highs,
        lows,
        volumes,
        dates: datesArr,
        globalIndices,
        benchmarkPrices: null,
        mode: mode === "pair" ? "pair" : "single",
        pairLegA: mode === "pair" ? pairTickerA : undefined,
        pairLegB: mode === "pair" ? pairTickerB : undefined,
      });
    } finally {
      setIsEvaluating(false);
    }
  }, [
    mode, pairTickerA, pairTickerB, selectedTicker, filteredAllTickers, subMode, stochSignalMode,
    stochK, stochSmoothK, stochSmoothD, stochOS, stochOB, ewoFast, ewoSlow, ewoThreshPct,
    targetReturn, minHold, evalSide, dateRange,
  ]);

  const evalLabel = useMemo(() => {
    if (subMode === "stoch") return `Stoch ${stochK}/${stochSmoothK}/${stochSmoothD} OS=${stochOS} OB=${stochOB} (${stochSignalMode}) [${evalSide}]`;
    const thr = ewoThreshPct === 0 ? "zero" : `±${ewoThreshPct.toFixed(2)}%`;
    return `EWO ${ewoFast}/${ewoSlow} ${thr} [${evalSide}]`;
  }, [subMode, stochSignalMode, stochK, stochSmoothK, stochSmoothD, stochOS, stochOB, ewoFast, ewoSlow, ewoThreshPct, evalSide]);

  const evalTickerLabel = useMemo(
    () =>
      mode === "pair"
        ? `${pairTickerA || "A"}/${pairTickerB || "B"}`
        : mode === "single"
        ? selectedTicker || "—"
        : filteredAllTickers[0]?.ticker || "—",
    [mode, pairTickerA, pairTickerB, selectedTicker, filteredAllTickers]
  );

  const captureInputs = useCallback(
    () => ({
      selectedTicker,
      subMode,
      stochSignalMode,
      targetReturn,
      mode,
      results,
      expandedTicker,
      sortBy,
      returnMode,
      bandMin,
      bandMax,
      minHold,
      ewoDisplay,
      frequency,
      pairTickerA,
      pairTickerB,
      basketTickers,
    }),
    [selectedTicker, subMode, stochSignalMode, targetReturn, mode, results, expandedTicker, sortBy, returnMode, bandMin, bandMax, minHold, ewoDisplay, frequency, pairTickerA, pairTickerB, basketTickers]
  );

  const applyInputs = useCallback((saved: any) => {
    if (!saved) return;
    if (saved.selectedTicker) { setSelectedTicker(saved.selectedTicker); wasInitializedRef.current = true; }
    if (saved.subMode) setSubMode(saved.subMode);
    if (saved.stochSignalMode) setStochSignalMode(saved.stochSignalMode);
    if (typeof saved.targetReturn === "number") setTargetReturn(saved.targetReturn);
    if (saved.returnMode) setReturnMode(saved.returnMode);
    if (typeof saved.bandMin === "number") setBandMin(saved.bandMin);
    if (typeof saved.bandMax === "number") setBandMax(saved.bandMax);
    if (typeof saved.minHold === "number") setMinHold(saved.minHold);
    if (saved.ewoDisplay === "raw" || saved.ewoDisplay === "pct") setEwoDisplay(saved.ewoDisplay);
    if (saved.frequency === "daily" || saved.frequency === "weekly" || saved.frequency === "weekly_on_daily") {
      setFrequency(saved.frequency);
    } else if (saved.timeframe === "weekly" && saved.frequency === undefined) {
      setFrequency("weekly");
    }
    if (["single", "universe", "pair", "pairCombo", "basket"].includes(saved.mode)) setMode(saved.mode);
    if (saved.pairCombo) pairComboPicker.hydrate(saved.pairCombo);
    if (Array.isArray(saved.results)) setResults(saved.results);
    if (saved.expandedTicker !== undefined) setExpandedTicker(saved.expandedTicker);
    if (saved.sortBy) setSortBy(saved.sortBy);
    if (saved.pairTickerA) setPairTickerA(saved.pairTickerA);
    if (saved.pairTickerB) setPairTickerB(saved.pairTickerB);
    if (Array.isArray(saved.basketTickers)) setBasketTickers(saved.basketTickers.filter((s: any) => typeof s === "string"));
  }, []);

  (useWorkspaceTab as any)("oscillators", captureInputs, applyInputs);

  const presetCaptureInputs = useCallback(() => {
    const state = captureInputs();
    const { selectedTicker: _a, pairTickerA: _b, pairTickerB: _c, results: _d, expandedTicker: _e, sortBy: _f, ...rest } = state as any;
    return rest;
  }, [captureInputs]);

  const presetApplyInputs = useCallback((saved: any) => { applyInputs(saved); }, [applyInputs]);

  const rankedResults = useMemo(
    () =>
      results.map((e) => ({
        ...e,
        configs: e.configs.map((cfg: any) => {
          let bestScore = -Infinity;
          let bestCat = cfg.categories[0];
          for (const cat of cfg.categories) {
            const dir = cat.category.startsWith("buy") ? "buy" : "sell";
            const score = ar(cat.summary, cat.composite.score, dir, scoreWeights);
            if (score > bestScore) { bestScore = score; bestCat = cat; }
          }
          return { ...cfg, bestScore, bestCategory: bestCat };
        }),
      })),
    [results, scoreWeights]
  );

  const filteredSortedResults = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const filtered = q
      ? rankedResults.filter((e) => e.ticker.toLowerCase().includes(q) || (e.name && e.name.toLowerCase().includes(q)))
      : [...rankedResults];
    if (sortBy === "score") filtered.sort((a, b) => b.bestScore - a.bestScore);
    else if (sortBy === "ticker") filtered.sort((a, b) => a.ticker.localeCompare(b.ticker));
    else if (sortBy === "value") {
      const usePct = subMode === "ewo" && ewoDisplay === "pct";
      filtered.sort((a, b) => {
        const va = usePct ? (a.currentValuePct ?? -Infinity) : (a.currentValue ?? -Infinity);
        const vb = usePct ? (b.currentValuePct ?? -Infinity) : (b.currentValue ?? -Infinity);
        return vb - va;
      });
    } else filtered.sort((a, b) => a.currentSignal.localeCompare(b.currentSignal));
    return filtered;
  }, [rankedResults, sortBy, subMode, ewoDisplay, filterText]);

  const exportCsv = () => {
    const horizons = je.filter((_: any, i: number) => i >= 2);
    const rows = filteredSortedResults.map((e) => {
      const bestCfg = e.configs.reduce((a: any, b: any) => (a.bestScore > b.bestScore ? a : b), e.configs[0]);
      const bestSummary = bestCfg?.categories.reduce(
        (a: any, b: any) => (a.composite.score > b.composite.score ? a : b),
        bestCfg.categories[0]
      )?.summary;
      const row: any = {
        ticker: e.ticker, name: e.name,
        currentValue: e.currentValue ?? null, currentValuePct: e.currentValuePct ?? null,
        currentSignal: e.currentSignal, bestConfig: e.bestConfigLabel,
        bestCategory: e.bestCategory, bestScore: e.bestScore,
      };
      horizons.forEach((h: any) => {
        row[`hitRate_${h.label}`] = bestSummary?.hitRate[h.label] ?? null;
        row[`avgReturn_${h.label}`] = bestSummary?.avgReturn[h.label] ?? null;
      });
      return row;
    });
    const keys = Object.keys(rows[0] || {});
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `oscillator_optimizer_${subMode}.csv`;
    a.click();
  };

  const getValueColor = (v: number | null) => {
    if (v === null) return "text-muted-foreground";
    if (subMode === "stoch") {
      if (v <= 20) return "text-emerald-400";
      if (v <= 40) return "text-green-400";
      if (v >= 80) return "text-red-400";
      if (v >= 60) return "text-orange-400";
      return "text-yellow-400";
    }
    return v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-yellow-400";
  };

  const getSignalClass = (sig: string) => {
    if (sig.includes("Oversold") || sig.includes("Buy") || sig.includes("Cross Up") || sig.includes("Above +Thr") || sig.includes("Above 0") || sig.includes("Exit OS"))
      return "bg-emerald-600/20 text-emerald-400 border-emerald-600/30";
    if (sig.includes("Overbought") || sig.includes("Sell") || sig.includes("Cross Down") || sig.includes("Below -Thr") || sig.includes("Below 0") || sig.includes("Exit OB"))
      return "bg-red-600/20 text-red-400 border-red-600/30";
    if (sig.includes("→")) return "bg-blue-600/20 text-blue-400 border-blue-600/30";
    if (sig.includes("Neutral") || sig.includes("In Zone")) return "bg-yellow-600/20 text-yellow-400 border-yellow-600/30";
    return "bg-muted text-muted-foreground border-border";
  };

  const totalStochConfigs =
    STOCH_PERIODS.length * SMOOTH_K_OPTIONS.length * SMOOTH_D_OPTIONS.length *
    OS_OPTIONS.filter((o) => OB_OPTIONS.some((b) => o < b)).length * OB_OPTIONS.length;

  const totalEwoConfigs = (() => {
    let c = 0;
    for (const f of EWO_FAST_PARAMS) for (const s of EWO_SLOW_PARAMS) if (f < s) c++;
    return c * EWO_THRESH_PCT.length;
  })();

  const totalConfigs = subMode === "stoch" ? totalStochConfigs : totalEwoConfigs;
  const valueColLabel = subMode === "stoch" ? "%K" : ewoDisplay === "pct" ? "EWO %" : "EWO";

  const formatValue = (e: any) => {
    if (subMode === "stoch") return e.currentValue != null ? e.currentValue.toFixed(1) : "–";
    const raw = e.currentValue != null ? e.currentValue.toFixed(3) : "–";
    const pctStr = e.currentValuePct != null ? `${e.currentValuePct >= 0 ? "+" : ""}${e.currentValuePct.toFixed(2)}%` : "–";
    return ewoDisplay === "raw" ? (pctStr === "–" ? raw : `${raw}  (${pctStr})`) : raw === "–" ? pctStr : `${pctStr}  (${raw})`;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">Oscillators</h2>
        <div className="flex gap-px">
          <button
            data-testid="osc-view-optimize"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${viewMode === "optimize" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setViewMode("optimize")}
          >
            Optimize
          </button>
          <button
            data-testid="osc-view-evaluate"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${viewMode === "evaluate" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setViewMode("evaluate")}
          >
            Evaluate
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {viewMode === "optimize"
            ? "Search Stoch/EWO parameter space by hit rate"
            : "Score one specific oscillator setup"}
        </span>
      </div>

      {viewMode === "evaluate" ? (
        <>
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === "single" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setMode("single")}
                  >
                    Single
                  </button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === "pair" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setMode("pair")}
                  >
                    Pair
                  </button>
                </div>
              </div>
              {mode === "single" && (
                <div className="flex items-end gap-2">
                  <div className={kt(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                    <UnifiedTickerPicker
                      tickers={filteredAllTickers}
                      value={kt(selectedTicker) ? "" : selectedTicker}
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
              {mode === "pair" && (
                <>
                  <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerA} onChange={setPairTickerA} label="Ticker A" />
                  <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerB} onChange={setPairTickerB} label="Ticker B" />
                </>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Side</label>
                <div className="flex gap-px">
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSide === "long" ? "bg-emerald-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setEvalSide("long")}
                  >
                    Long
                  </button>
                  <button
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSide === "short" ? "bg-red-600 text-white" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                    onClick={() => setEvalSide("short")}
                  >
                    Short
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Family</label>
                <div className="flex gap-px">
                  {["stoch", "ewo"].map((s) => (
                    <button
                      key={s}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${subMode === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setSubMode(s)}
                    >
                      {s === "stoch" ? "Stoch" : "EWO"}
                    </button>
                  ))}
                </div>
              </div>
              {subMode === "stoch" && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                    <select
                      className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground"
                      value={stochSignalMode}
                      onChange={(e) => setStochSignalMode(e.target.value)}
                    >
                      <option value="cross_out_of_band">Cross Out of Band</option>
                      <option value="k_crosses_d_in_zone">%K Crosses %D in Zone</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">%K</label>
                    <input type="number" min={2} max={100} value={stochK} onChange={(e) => setStochK(parseInt(e.target.value) || 14)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Smooth %K</label>
                    <input type="number" min={1} max={20} value={stochSmoothK} onChange={(e) => setStochSmoothK(parseInt(e.target.value) || 3)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Smooth %D</label>
                    <input type="number" min={1} max={20} value={stochSmoothD} onChange={(e) => setStochSmoothD(parseInt(e.target.value) || 3)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">OS</label>
                    <input type="number" min={1} max={50} value={stochOS} onChange={(e) => setStochOS(parseInt(e.target.value) || 20)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[55px]" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">OB</label>
                    <input type="number" min={50} max={99} value={stochOB} onChange={(e) => setStochOB(parseInt(e.target.value) || 80)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[55px]" />
                  </div>
                </>
              )}
              {subMode === "ewo" && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Fast</label>
                    <input type="number" min={2} max={200} value={ewoFast} onChange={(e) => setEwoFast(parseInt(e.target.value) || 5)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Slow</label>
                    <input type="number" min={4} max={400} value={ewoSlow} onChange={(e) => setEwoSlow(parseInt(e.target.value) || 34)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Thresh % (0=zero)</label>
                    <input type="number" step={0.05} min={0} value={ewoThreshPct} onChange={(e) => setEwoThreshPct(parseFloat(e.target.value) || 0)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[80px]" />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target %</label>
                <input
                  type="number" step={0.5} min={0.5}
                  value={+(targetReturn * 100).toFixed(4)}
                  onChange={(e) => setTargetReturn((parseFloat(e.target.value) || 5) / 100)}
                  title="Hit-rate threshold in percent. 5 = 5%."
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Hold</label>
                <input type="number" min={0} value={minHold} onChange={(e) => setMinHold(parseInt(e.target.value) || 0)} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
                <div className="flex items-center gap-0.5">
                  {go.map((e: any) => (
                    <button
                      key={e.value}
                      data-testid={`osc-eval-date-preset-${e.value}`}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === e.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}
                      onClick={() => { setDatePreset(e.value); setDateRange(bo(e.value)); }}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  data-testid="osc-eval-date-start"
                  value={dateRange.start}
                  onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, start: e.target.value }); }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                />
                <span className="text-[10px] font-mono text-muted-foreground">→</span>
                <input
                  type="date"
                  data-testid="osc-eval-date-end"
                  value={dateRange.end}
                  onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, end: e.target.value }); }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"> </label>
                <button
                  data-testid="osc-eval-run"
                  className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={runEvaluate}
                  disabled={isEvaluating}
                >
                  {isEvaluating ? "Evaluating…" : "Evaluate"}
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <yr result={evalResult} loading={isEvaluating} setupLabel={evalLabel} tickerLabel={evalTickerLabel} />
            {evalResult && evalPriceContext && evalResult.profiles.length >= 10 ? (
              <vo
                ticker={evalPriceContext.mode === "pair" ? evalPriceContext.pairLegA || "" : selectedTicker || filteredAllTickers[0]?.ticker || ""}
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
          <br kind="osc" captureInputs={presetCaptureInputs} applyInputs={presetApplyInputs} />
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground tracking-tight">Oscillators</h2>
                  {isUniverseFiltered && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                      {filteredAllTickers.length}/{allTickers.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] text-muted-foreground">Slow Stochastic &amp; Elliott Wave Oscillator parameter optimizer</p>
                  <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    Yahoo Finance
                  </span>
                  {lastFetchTime && (
                    <span className="text-[9px] font-mono text-muted-foreground">
                      Last fetched: {Math.round((Date.now() - lastFetchTime) / 60000)}m ago
                    </span>
                  )}
                  <button
                    onClick={async () => {
                      const t = selectedTicker;
                      if (t) {
                        setIsRefreshing(true);
                        try {
                          await ir(t);
                          setLastFetchTime(Date.now());
                        } catch {} finally {
                          setIsRefreshing(false);
                        }
                      }
                    }}
                    disabled={isRefreshing}
                    title="Force refresh Yahoo price cache"
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {isRefreshing ? "…" : "↻"}
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Indicator</label>
                <div className="flex gap-px">
                  {["stoch", "ewo"].map((s) => (
                    <button
                      key={s}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${subMode === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setSubMode(s)}
                      disabled={isRunning}
                    >
                      {s === "stoch" ? "Slow Stoch" : "EWO"}
                    </button>
                  ))}
                </div>
              </div>
              {subMode === "stoch" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Stoch Signal</label>
                  <div className="flex gap-px">
                    {["cross_out_of_band", "k_crosses_d_in_zone"].map((s) => (
                      <button
                        key={s}
                        className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${stochSignalMode === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                        onClick={() => setStochSignalMode(s)}
                        disabled={isRunning}
                      >
                        {s === "cross_out_of_band" ? "Exit Band" : "K×D in Zone"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {subMode === "ewo" && (
                <div className="flex flex-col gap-0.5">
                  <label
                    className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"
                    title="EWO display unit. Raw shows price-units (SMA(fast) − SMA(slow)). % shows EWO normalized as a percent of the slow MA — comparable across tickers."
                  >
                    EWO Display
                  </label>
                  <div className="flex gap-px">
                    {["raw", "pct"].map((s) => (
                      <button
                        key={s}
                        data-testid={`ewo-display-${s}`}
                        className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ewoDisplay === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                        onClick={() => setEwoDisplay(s)}
                      >
                        {s === "raw" ? "Raw" : "% of Slow MA"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  {["single", "universe", "pair", "pairCombo", "basket"].map((m) => (
                    <button
                      key={m}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setMode(m)}
                      disabled={isRunning}
                      data-testid={`optimizer-mode-${m}`}
                    >
                      {m === "single" ? "Single Ticker" : m === "universe" ? "Universe" : m === "pair" ? "Pair (A/B)" : m === "pairCombo" ? "Pair Combo" : "Basket"}
                    </button>
                  ))}
                </div>
              </div>
              {mode !== "pair" && frequencyUI}
              <div className="flex items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
                <div className="flex items-center gap-0.5">
                  {go.map((e: any) => (
                    <button
                      key={e.value}
                      data-testid={`osc-date-preset-${e.value}`}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === e.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}
                      onClick={() => { setDatePreset(e.value); setDateRange(bo(e.value)); }}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  data-testid="osc-date-start"
                  value={dateRange.start}
                  onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, start: e.target.value }); }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                />
                <span className="text-[10px] font-mono text-muted-foreground">→</span>
                <input
                  type="date"
                  data-testid="osc-date-end"
                  value={dateRange.end}
                  onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, end: e.target.value }); }}
                  className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                />
              </div>
              {mode === "universe" && classFilter.classFilterUI && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Classification Filter</label>
                  {classFilter.universeSourceUI}
                  {classFilter.classFilterUI}
                </div>
              )}
              {mode === "single" && (
                <div className="flex items-end gap-2">
                  <div className={kt(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                    <UnifiedTickerPicker
                      tickers={filteredAllTickers}
                      value={kt(selectedTicker) ? "" : selectedTicker}
                      onChange={setSelectedTicker}
                      disabled={isRunning}
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
              {mode === "pair" && (
                <div className="flex items-end gap-2">
                  <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerA} onChange={setPairTickerA} disabled={isRunning} label="A" />
                  <UnifiedTickerPicker tickers={filteredAllTickers} value={pairTickerB} onChange={setPairTickerB} disabled={isRunning} label="B" />
                  <span className="text-[10px] font-mono text-muted-foreground pb-1" title="Stochastic uses high=low=close on the ratio (close-only stochastic).">
                    Ratio: <span className="text-foreground font-bold">{pairTickerA || "A"}/{pairTickerB || "B"}</span>
                  </span>
                </div>
              )}
              {mode === "pairCombo" && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Pair Combo — Leg Set</label>
                  {pairComboPicker.ui}
                </div>
              )}
              {mode === "basket" && (
                <div className="flex flex-col gap-2">
                  <BasketPicker
                    tickers={filteredAllTickers}
                    value={basketTickers}
                    onChange={setBasketTickers}
                    disabled={isRunning}
                    testIdPrefix="osc-basket"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket Run Mode</label>
                    <div className="flex gap-px" data-testid="osc-basket-mode">
                      {["stocks", "combined"].map((m) => (
                        <button
                          key={m}
                          data-testid={`osc-basket-mode-${m}`}
                          className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${basketRunMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                          onClick={() => setBasketRunMode(m)}
                          disabled={isRunning}
                          title={m === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme"}
                        >
                          {m === "stocks" ? "Stock by Stock" : "Combined"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Return Measure</label>
                <div className="flex gap-px">
                  {["threshold", "band"].map((m) => (
                    <button
                      key={m}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${returnMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setReturnMode(m)}
                      disabled={isRunning}
                    >
                      {m === "threshold" ? "Threshold" : "Band"}
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
                    disabled={isRunning}
                  >
                    {(cr as any[]).map((v: any) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
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
                        const [s, l] = e.target.value.split("-").map(Number);
                        setBandMin(s); setBandMax(l);
                      }}
                      disabled={isRunning}
                    >
                      {(dr as any[]).map((e: any) => (
                        <option key={e.label} value={`${e.band.minReturn}-${e.band.maxReturn}`}>{e.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min %</label>
                    <input
                      type="number" step="1" min="0" max="100"
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                      value={Math.round(bandMin * 100)}
                      onChange={(e) => setBandMin(Number(e.target.value) / 100)}
                      disabled={isRunning}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Max %</label>
                    <input
                      type="number" step="1" min="0" max="100"
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                      value={Math.round(bandMax * 100)}
                      onChange={(e) => setBandMax(Number(e.target.value) / 100)}
                      disabled={isRunning}
                    />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-0.5">
                <label
                  className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"
                  title="Minimum holding period in trading days. After a signal fires, suppress new signals for N bars and require the position be held N days before counting hits/peaks/troughs. 0 = off."
                >
                  Min Hold
                </label>
                <input
                  type="number" step="1" min="0" max="126"
                  data-testid="min-hold"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                  value={minHold}
                  onChange={(e) => setMinHold(Math.max(0, Math.min(126, Math.floor(Number(e.target.value) || 0))))}
                  disabled={isRunning}
                  title="Trading days. Forces hold for at least N days before counting hits and before allowing a new signal."
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"> </label>
                {isRunning ? (
                  <button
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500"
                    onClick={() => {
                      cancelRef.current = true;
                      workerPoolRef.current?.terminate();
                      workerPoolRef.current = null;
                      setIsRunning(false);
                    }}
                  >
                    Cancel ({progress.current}/{progress.total})
                  </button>
                ) : (
                  <button
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={runOptimizer}
                  >
                    Run Optimizer
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-4 py-3">
            {results.length === 0 && !isRunning && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                {subMode === "stoch"
                  ? "Slow Stochastic optimizer — sweeps K period × smoothK × smoothD × OS × OB; measures forward returns from each signal entry"
                  : "Elliott Wave Oscillator optimizer — sweeps fast/slow lengths × threshold; measures forward returns from each zero-cross or threshold-cross"}
              </div>
            )}
            {isRunning && results.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">
                    Computing {subMode === "stoch" ? "Slow Stochastic" : "EWO"} signals...
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {progress.current}/{progress.total} tickers × {totalConfigs} configs
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
            {results.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    {filteredSortedResults.length}{filterText ? ` of ${results.length}` : ""} tickers — {subMode === "stoch" ? `Stoch (${stochSignalMode === "cross_out_of_band" ? "Exit Band" : "K×D"})` : "EWO"} — {returnMode === "band" ? `band ${ze(bandMin)}–${ze(bandMax)}` : `target ${ze(targetReturn)}`}
                    {minHold > 0 ? ` — min hold ${minHold}d` : ""}
                  </h3>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      placeholder="Filter ticker / name…"
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      data-testid="input-results-filter"
                      className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[160px] focus:outline-none focus:ring-1 focus:ring-primary"
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
                    {["score", "value", "signal", "ticker"].map((s) => (
                      <button
                        key={s}
                        className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`}
                        onClick={() => setSortBy(s)}
                      >
                        {s === "score" ? "Score" : s === "value" ? valueColLabel : s === "signal" ? "Signal" : "Ticker"}
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-mono text-muted-foreground">RANK BY</label>
                      <select
                        data-testid="osc-rank-by"
                        value={rankBy}
                        onChange={(e) => setRankBy(e.target.value)}
                        className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5"
                      >
                        {(ur as any[]).map((e: any) => (
                          <option key={e.value} value={e.value}>{e.label}</option>
                        ))}
                      </select>
                    </div>
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
                <div className="overflow-x-auto border border-border rounded mb-4">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="bg-card text-muted-foreground">
                        <th className="text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border">Ticker</th>
                        <th className="text-center px-2 py-1 font-bold">{valueColLabel}</th>
                        <th className="text-center px-2 py-1 font-bold">Current Signal</th>
                        <th className="text-center px-2 py-1 font-bold">Best Config</th>
                        <th className="text-center px-2 py-1 font-bold">Best Side</th>
                        {(je as any[]).filter((_: any, i: number) => i >= 2).map((h: any) => (
                          <th key={h.label} className="text-center px-2 py-1 font-bold">{returnMode === "band" ? "Band" : "Hit"} {h.label}</th>
                        ))}
                        {(je as any[]).filter((_: any, i: number) => i >= 2).map((h: any) => (
                          <th key={`avg-${h.label}`} className="text-center px-2 py-1 font-bold">Avg {h.label}</th>
                        ))}
                        {(je as any[]).filter((_: any, i: number) => i >= 2).map((h: any) => (
                          <th key={`pf-${h.label}`} className="text-center px-2 py-1 font-bold">PF {h.label}</th>
                        ))}
                        <th className="text-center px-2 py-1 font-bold">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSortedResults.map((e) => {
                        const isExpanded = expandedTicker === e.ticker;
                        const bestCfg = e.configs.reduce(
                          (a: any, b: any) => (a.bestScore > b.bestScore ? a : b),
                          e.configs[0]
                        );
                        const bestSummary = bestCfg?.categories.reduce(
                          (a: any, b: any) => (a.composite.score > b.composite.score ? a : b),
                          bestCfg.categories[0]
                        )?.summary;
                        return (
                          <tr
                            key={e.ticker}
                            className={`${isExpanded ? "bg-primary/10" : "hover:bg-white/5"} cursor-pointer`}
                            onClick={() => setExpandedTicker(isExpanded ? null : e.ticker)}
                          >
                            <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border">{e.ticker}</td>
                            <td className={`text-center px-2 py-1 font-bold ${getValueColor(e.currentValue)} whitespace-nowrap`}>{formatValue(e)}</td>
                            <td className="text-center px-2 py-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${getSignalClass(e.currentSignal)}`}>
                                {e.currentSignal}
                              </span>
                            </td>
                            <td className="text-center px-2 py-1 text-muted-foreground">{bestCfg?.configLabel}</td>
                            <td className="text-center px-2 py-1 text-primary font-bold">{e.bestCategory}</td>
                            {(je as any[]).filter((_: any, i: number) => i >= 2).map((h: any) => {
                              const rate = bestSummary
                                ? returnMode === "band"
                                  ? (bestSummary.bandHitRate?.[h.label] ?? bestSummary.hitRate[h.label])
                                  : bestSummary.hitRate[h.label]
                                : 0;
                              return (
                                <td key={h.label} className={`text-center px-2 py-1 ${bestSummary ? Dt(rate) : ""}`}>
                                  {bestSummary ? ze(rate) : "–"}
                                </td>
                              );
                            })}
                            {(je as any[]).filter((_: any, i: number) => i >= 2).map((h: any) => (
                              <td key={`avg-${h.label}`} className={`text-center px-2 py-1 ${bestSummary ? (bestSummary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400") : ""}`}>
                                {bestSummary ? lt(bestSummary.avgReturn[h.label]) : "–"}
                              </td>
                            ))}
                            {(je as any[]).filter((_: any, i: number) => i >= 2).map((h: any) => (
                              <td key={`pf-${h.label}`} className={`text-center px-2 py-1 ${bestSummary ? ho(bestSummary.profitFactor[h.label]) : ""}`}>
                                {bestSummary ? (bestSummary.profitFactor[h.label] >= 99 ? "∞" : bestSummary.profitFactor[h.label].toFixed(2)) : "–"}
                              </td>
                            ))}
                            <td className="text-center px-2 py-1">
                              <span
                                className="inline-block px-1.5 py-0.5 rounded font-bold"
                                style={{ backgroundColor: ko(e.bestScore), color: yo(e.bestScore) }}
                              >
                                {e.bestScore}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {expandedTicker &&
                  (() => {
                    const e = rankedResults.find((r) => r.ticker === expandedTicker);
                    if (!e) return null;
                    const sortedCfgs = [...e.configs].sort((a, b) => b.bestScore - a.bestScore);
                    return (
                      <div className="border border-border rounded p-3 bg-card/50 mb-4">
                        <h4 className="text-xs font-bold text-foreground mb-1">
                          {e.ticker} — {e.name} — {valueColLabel} {formatValue(e)}
                        </h4>
                        <p className="text-[9px] text-muted-foreground mb-3">
                          {sortedCfgs.length} configurations tested — showing top results
                        </p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {sortedCfgs.slice(0, 6).map((cfg, cfgIdx) => {
                            const bestCat = cfg.categories.reduce(
                              (a: any, b: any) => (a.composite.score > b.composite.score ? a : b),
                              cfg.categories[0]
                            );
                            return (
                              <div key={cfgIdx} className="border border-border/50 rounded p-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-mono font-bold text-foreground">{cfg.configLabel}</span>
                                  <span className="text-[9px] text-muted-foreground">→ {bestCat.label}</span>
                                  <span
                                    className="ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-bold"
                                    style={{ backgroundColor: ko(cfg.bestScore), color: yo(cfg.bestScore) }}
                                  >
                                    {cfg.bestScore}
                                  </span>
                                </div>
                                {cfg.categories
                                  .filter((cat: any) => cat.summary.count > 0)
                                  .sort((a: any, b: any) => b.composite.score - a.composite.score)
                                  .map((cat: any) => {
                                    const rowKey = `${e.ticker}::${cfg.configLabel}::${cat.category}`;
                                    const isOpen = expandedKeys.has(rowKey);
                                    const canExpand = !!(cat.profiles && cat.profiles.length >= 10 && e.priceContext);
                                    return (
                                      <div key={cat.category} className="mt-1">
                                        <div className="flex items-center gap-1 mb-0.5">
                                          <span className={`text-[9px] font-bold ${getSignalClass(cat.label).split(" ").filter((c: string) => c.startsWith("text-")).join(" ")}`}>
                                            {cat.label}
                                          </span>
                                          <span className="text-[8px] text-muted-foreground">{cat.summary.count} signals</span>
                                          {canExpand ? (
                                            <button
                                              type="button"
                                              onClick={() => toggleExpandedKey(rowKey)}
                                              className={`ml-auto px-1.5 py-0.5 rounded text-[8px] font-bold border ${isOpen ? "bg-violet-500/25 text-violet-200 border-violet-400/40" : "bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`}
                                              title="Profile what other indicators looked like at hit-bars vs miss-bars"
                                            >
                                              {isOpen ? "▾" : "▸"} Hit Conditions
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
                                            {(je as any[]).map((h: any) => (
                                              <tr key={h.label}>
                                                <td className="px-1 py-0.5 text-foreground font-bold">{h.label}</td>
                                                <td className={`text-center px-1 py-0.5 ${Dt(cat.summary.hitRate[h.label])}`}>{ze(cat.summary.hitRate[h.label])}</td>
                                                <td className={`text-center px-1 py-0.5 ${Dt(cat.summary.winRate[h.label])}`}>{ze(cat.summary.winRate[h.label])}</td>
                                                <td className={`text-center px-1 py-0.5 ${cat.summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{lt(cat.summary.avgReturn[h.label])}</td>
                                                <td className={`text-center px-1 py-0.5 ${cat.summary.medianReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{lt(cat.summary.medianReturn[h.label])}</td>
                                                <td className="text-center px-1 py-0.5 text-green-400">{lt(cat.summary.avgPeak[h.label])}</td>
                                                <td className="text-center px-1 py-0.5 text-red-400">{lt(cat.summary.avgTrough[h.label])}</td>
                                                <td className={`text-center px-1 py-0.5 ${ho(cat.summary.profitFactor[h.label])}`}>
                                                  {cat.summary.profitFactor[h.label] >= 99 ? "∞" : cat.summary.profitFactor[h.label].toFixed(2)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {isOpen && e.priceContext && cat.profiles ? (
                                          <div className="mt-2">
                                            <vo
                                              ticker={e.priceContext.mode === "pair" && e.priceContext.pairLegA || e.ticker}
                                              priceContext={e.priceContext}
                                              signals={cat.profiles}
                                              direction={cat.category}
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
