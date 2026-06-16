// Reconstructed from recovered-bundle/ZScoreOptimizer-Dl9PXr46.js on 2026-06-16
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
  scoreColor,
  scoreTextColor,
  hitRateColor,
  profitFactorColor,
  pct,
  pctSigned,
  FORWARD_HORIZONS,
  RETURN_BAND_PRESETS,
} from "@/lib/forwardReturns";
import type { ForwardReturnProfile, SignalSummary, CompositeScore, ReturnBand } from "@/lib/forwardReturns";
import {
  getTickers,
  getDates,
  getTickerRaw,
  metricMultiplier,
} from "@/lib/dataService";
import type { TickerMeta } from "@/lib/dataService";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { sliceDateRange } from "@/lib/datePresets";
import { resampleWeekly, isBasketTicker } from "@/lib/optimizerInputSeries";
import { weeklyDownsamplePrices, expandWeeklyToDaily } from "@/lib/weeklyDownsample";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/useBaskets";
import { buildBasketOhlc, getBasketOhlc } from "@/lib/basketOhlc";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { B as BasketTickerPill } from "@/components/BasketTickerPill";
import { B as BasketPicker } from "@/components/BasketPicker";
import { e as evaluateSignals, E as EvaluatorResultPanel, H as HitConditionsPanel } from "@/components/EvaluatorPanel";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import "@/lib/globalUniverse";
import "@/components/ClassificationFiltersWithSource";
import "@/lib/harsi";
import "@/lib/tva";

// ── Constants ──

const CANDIDATE_WINDOWS = [21, 42, 63, 126, 189, 252, 378, 504, 756, 1260];
const WINDOW_LABELS: Record<number, string> = {
  21: "21d (1M)",
  42: "42d (2M)",
  63: "63d (3M)",
  126: "126d (6M)",
  189: "189d (9M)",
  252: "252d (1Y)",
  378: "378d (1.5Y)",
  504: "504d (2Y)",
  756: "756d (3Y)",
  1260: "1260d (5Y)",
};

const METRICS = [
  "close",
  "P/E LTM",
  "P/E FY2",
  "P/FFO LTM",
  "P/FFO FY2",
  "P/AFFO LTM",
  "P/AFFO FY2",
  "P/S LTM",
  "P/S FY2",
  "EV/EBITDA LTM",
  "EV/EBITDA FY2",
  "FFO Yield LTM",
  "FFO Yield FY2",
  "AFFO Yield LTM",
  "AFFO Yield FY2",
  "Dividend Yield",
  "Implied Cap Rate",
  "Short Interest%",
];

// ── Index-chunk locals not available as matching shared exports (see sharedLibIssues) ──

/** Sign multiplier: yield-type metrics are inverted so that "cheap" maps to a low z-score. */
const YIELD_METRICS = new Set([
  "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
  "Dividend Yield", "Implied Cap Rate", "Short Interest%",
]);
function metricSign(metric: string): number {
  return YIELD_METRICS.has(metric) ? -1 : 1;
}

/** Date-range presets (index-chunk shape: { value, label, years }). */
const DATE_PRESETS = [
  { value: "all", label: "All", years: "all" as const },
  { value: "20y", label: "20Y", years: 20 },
  { value: "10y", label: "10Y", years: 10 },
  { value: "5y", label: "5Y", years: 5 },
  { value: "3y", label: "3Y", years: 3 },
  { value: "1y", label: "1Y", years: 1 },
  { value: "ytd", label: "YTD", years: "ytd" as const },
];
const DEFAULT_PRESET = "10y";

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function createDateRangeFromPreset(value: string, now: Date = new Date()): { start: string; end: string } {
  const end = fmtDate(now);
  const preset = DATE_PRESETS.find((p) => p.value === value);
  if (!preset) return { start: "1900-01-01", end };
  if (preset.years === "all") return { start: "1900-01-01", end };
  if (preset.years === "ytd") return { start: `${now.getUTCFullYear()}-01-01`, end };
  const s = new Date(now);
  s.setUTCFullYear(s.getUTCFullYear() - (preset.years as number));
  return { start: fmtDate(s), end };
}
function createDefaultDateRange(): { start: string; end: string } {
  return createDateRangeFromPreset(DEFAULT_PRESET);
}

/** Target return options (index-chunk shape: { value, label }). */
const TARGET_RETURN_OPTIONS = [
  { value: 0.02, label: "2%" },
  { value: 0.03, label: "3%" },
  { value: 0.05, label: "5%" },
  { value: 0.07, label: "7%" },
  { value: 0.1, label: "10%" },
  { value: 0.15, label: "15%" },
  { value: 0.2, label: "20%" },
];

/** Rank-by options (index-chunk shape: value/label/key{metric,horizon}). */
const RANK_METRIC_LABELS: Record<string, string> = {
  composite: "Composite Score",
  hitRate: "Hit Rate",
  bandHitRate: "Band Hit Rate",
  avgReturn: "Avg Return",
  profitFactor: "Profit Factor",
  returnRiskRatio: "Return/Risk",
  winRate: "Win Rate",
  count: "Signal Count",
};
interface RankKey { metric: string; horizon?: string }
const RANK_BY_OPTIONS: { value: string; label: string; key: RankKey }[] = (() => {
  const out: { value: string; label: string; key: RankKey }[] = [];
  out.push({ value: "composite", label: RANK_METRIC_LABELS.composite, key: { metric: "composite" } });
  out.push({ value: "count", label: RANK_METRIC_LABELS.count, key: { metric: "count" } });
  const metrics = ["hitRate", "bandHitRate", "avgReturn", "profitFactor", "returnRiskRatio", "winRate"];
  for (const m of metrics) {
    for (const { label } of FORWARD_HORIZONS) {
      out.push({ value: `${m}@${label}`, label: `${RANK_METRIC_LABELS[m]} @ ${label}`, key: { metric: m, horizon: label } });
    }
  }
  return out;
})();
function getScoreWeights(value: string): RankKey {
  if (value === "composite") return { metric: "composite" };
  if (value === "count") return { metric: "count" };
  const [metric, horizon] = value.split("@");
  return { metric, horizon };
}
function scoreSignalStat(summary: SignalSummary, compositeScore: number, direction: "buy" | "sell", key: RankKey): number {
  if (key.metric === "composite") return compositeScore;
  if (key.metric === "count") return summary.count;
  const h = key.horizon as keyof SignalSummary["hitRate"];
  switch (key.metric) {
    case "hitRate": return summary.hitRate[h] ?? 0;
    case "bandHitRate": return summary.bandHitRate[h] ?? 0;
    case "avgReturn": return direction === "buy" ? (summary.avgReturn[h] ?? 0) : -(summary.avgReturn[h] ?? 0);
    case "profitFactor": {
      const v = summary.profitFactor[h];
      return Number.isFinite(v) ? v : 0;
    }
    case "returnRiskRatio": {
      const v = summary.returnRiskRatio[h];
      return Number.isFinite(v) ? v : 0;
    }
    case "winRate": return summary.winRate[h] ?? 0;
  }
  return 0;
}

// ── Types ──

interface PriceContext {
  prices: number[];
  highs: number[];
  lows: number[];
  volumes: null;
  dates: string[];
  globalIndices: number[];
  benchmarkPrices: null;
  mode: "single" | "pair";
  pairLegA?: string;
  pairLegB?: string;
}

interface WindowResult {
  window: number;
  buySummary: SignalSummary;
  sellSummary: SignalSummary;
  buyComposite: CompositeScore;
  sellComposite: CompositeScore;
  compositeScore: number;
  buyRevSummary?: SignalSummary;
  sellRevSummary?: SignalSummary;
  buyRevComposite?: CompositeScore;
  sellRevComposite?: CompositeScore;
  buyProfiles?: ForwardReturnProfile[];
  sellProfiles?: ForwardReturnProfile[];
  buyRevProfiles?: ForwardReturnProfile[];
  sellRevProfiles?: ForwardReturnProfile[];
}

interface TickerResult {
  ticker: string;
  name: string;
  results: WindowResult[];
  bestWindow: number;
  bestScore: number;
  priceContext?: PriceContext;
}

// ── Engine ──

function computeRollingZScores(values: number[], window: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 1; i < values.length; i++) {
    const start = Math.max(0, i - window);
    const slice = values.slice(start, i);
    const n = slice.length;
    if (n < 2) continue;
    let sum = 0;
    let sumSq = 0;
    for (let j = 0; j < n; j++) {
      sum += slice[j];
      sumSq += slice[j] * slice[j];
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    if (std > 0) result[i] = (values[i] - mean) / std;
  }
  return result;
}

function analyzeWindow(
  metricValues: number[],
  priceValues: number[],
  window: number,
  buyThreshold: number,
  sellThreshold: number,
  targetReturn: number,
  band: ReturnBand | null,
  signalType: "breakout" | "reversion" | "both",
  weeklyCloses?: number[],
  weeklyResult?: { dailyIndexMap: number[] }
): WindowResult {
  const zScores = computeRollingZScores(metricValues, window);
  const useBand = band !== null;
  const doBreakout = signalType === "breakout" || signalType === "both";
  const doReversion = signalType === "reversion" || signalType === "both";

  const profileFor = (i: number, direction: "buy" | "sell"): ForwardReturnProfile | null => {
    if (weeklyCloses && weeklyResult) {
      // Map weekly index back to its daily end-of-week index, then profile on weekly closes.
      const dailyIdx = weeklyResult.dailyIndexMap[i] ?? -1;
      if (dailyIdx < 0) return null;
      return computeForwardProfile(weeklyCloses, dailyIdx, targetReturn, direction, band);
    }
    return computeForwardProfile(priceValues, i, targetReturn, direction, band);
  };

  const buyBrk: ForwardReturnProfile[] = [];
  const sellBrk: ForwardReturnProfile[] = [];
  const buyRev: ForwardReturnProfile[] = [];
  const sellRev: ForwardReturnProfile[] = [];

  let prevZ: number | null = null;
  for (let i = 0; i < zScores.length; i++) {
    const z = zScores[i];
    if (z === null) { prevZ = null; continue; }
    if (prevZ !== null) {
      if (doBreakout && prevZ >= buyThreshold && z < buyThreshold) {
        const p = profileFor(i, "buy"); if (p !== null) buyBrk.push(p);
      }
      if (doBreakout && prevZ <= sellThreshold && z > sellThreshold) {
        const p = profileFor(i, "sell"); if (p !== null) sellBrk.push(p);
      }
      if (doReversion && prevZ < buyThreshold && z >= buyThreshold) {
        const p = profileFor(i, "buy"); if (p !== null) buyRev.push(p);
      }
      if (doReversion && prevZ > sellThreshold && z <= sellThreshold) {
        const p = profileFor(i, "sell"); if (p !== null) sellRev.push(p);
      }
    }
    prevZ = z;
  }

  const buySummary = summarizeSignals(doBreakout ? buyBrk : buyRev, "buy");
  const sellSummary = summarizeSignals(doBreakout ? sellBrk : sellRev, "sell");
  const buyComposite = computeCompositeScore(buySummary, "buy", useBand);
  const sellComposite = computeCompositeScore(sellSummary, "sell", useBand);

  let buyRevSummary: SignalSummary | undefined;
  let sellRevSummary: SignalSummary | undefined;
  let buyRevComposite: CompositeScore | undefined;
  let sellRevComposite: CompositeScore | undefined;
  if (signalType === "both") {
    buyRevSummary = summarizeSignals(buyRev, "buy");
    sellRevSummary = summarizeSignals(sellRev, "sell");
    buyRevComposite = computeCompositeScore(buyRevSummary, "buy", useBand);
    sellRevComposite = computeCompositeScore(sellRevSummary, "sell", useBand);
  }

  let directionCount = ((buySummary?.count ?? 0) > 0 ? 1 : 0) + ((sellSummary?.count ?? 0) > 0 ? 1 : 0);
  let scoreSum = buyComposite.score + sellComposite.score;
  if (signalType === "both") {
    if ((buyRevSummary?.count ?? 0) > 0) { directionCount++; scoreSum += buyRevComposite!.score; }
    if ((sellRevSummary?.count ?? 0) > 0) { directionCount++; scoreSum += sellRevComposite!.score; }
  }
  const compositeScore = directionCount > 0 ? scoreSum / directionCount : 0;

  return {
    window,
    buySummary,
    sellSummary,
    buyComposite,
    sellComposite,
    compositeScore: Math.round(compositeScore),
    buyRevSummary,
    sellRevSummary,
    buyRevComposite,
    sellRevComposite,
    buyProfiles: buyBrk,
    sellProfiles: sellBrk,
    buyRevProfiles: buyRev,
    sellRevProfiles: sellRev,
  };
}

// ── Component ──

export default function ZScoreOptimizer() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const [selectedMetric, setSelectedMetric] = useState("P/FFO LTM");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [mode, setMode] = useState<string>("single");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = usePersistedState("zscore-basket-mode", "stocks");
  const { baskets } = useBaskets();
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [buyThreshold, setBuyThreshold] = useState(-2);
  const [sellThreshold, setSellThreshold] = useState(2);
  const [returnMode, setReturnMode] = useState<"threshold" | "band">("threshold");
  const [signalType, setSignalType] = useState<"breakout" | "reversion" | "both">("breakout");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.1);
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState(() => createDefaultDateRange());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = usePersistedState<TickerResult[]>("zscore:results", []);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"bestScore" | "ticker">("bestScore");
  const [rankBy, setRankBy] = useState("composite");
  const scoreWeights = useMemo(() => getScoreWeights(rankBy), [rankBy]);
  const [hitConditionsOpen, setHitConditionsOpen] = useState<Set<string>>(new Set());
  const toggleHitConditions = useCallback((key: string) => {
    setHitConditionsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const abortRef = useRef(false);
  const restoredTickerRef = useRef(false);
  const [activeTab, setActiveTab] = useState<"optimize" | "evaluate">("optimize");
  const [evalSide, setEvalSide] = useState<"long" | "short">("long");
  const [evalResult, setEvalResult] = usePersistedState<any>("zscore:evalResult", null);
  const [evalPriceContext, setEvalPriceContext] = useState<PriceContext | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalSignalType, setEvalSignalType] = useState<"breakout" | "reversion" | "both">("breakout");
  const [evalWindow, setEvalWindow] = useState(63);
  const [evalThreshold, setEvalThreshold] = useState(2);
  const [evalHold, setEvalHold] = useState(0);

  const { universeTickers: universeSet, isFiltered } = useUniverse();
  const tickers = useMemo(
    () => (universeSet ? allTickers.filter((t) => universeSet.has(t.ticker)) : allTickers),
    [allTickers, universeSet]
  );
  const classFilter = useOptimizerClassFilter(tickers, mode === "universe", "zs-clf");
  const filteredTickers = classFilter.filteredTickers;
  const pairComboPicker = usePairComboPicker(allTickers, mode === "pairCombo", "zs-pc");
  const { frequency, setFrequency, frequencyUI } = useFrequency("zs", "daily", running);
  const freqKey = frequency === "weekly" ? "weekly" : "daily";

  useEffect(() => {
    getTickers().then((t) => {
      setAllTickers(t);
      if (t.length > 0 && !restoredTickerRef.current) setSelectedTicker(t[0].ticker);
      if (t.length > 0) {
        setPairTickerA((a) => a || t[0].ticker);
        setPairTickerB((a) => a || (t[1]?.ticker ?? t[0].ticker));
      }
    });
  }, []);

  useEffect(() => {
    if (tickers.length > 0 && selectedTicker && allTickers.some((t) => t.ticker === selectedTicker) && !tickers.find((t) => t.ticker === selectedTicker)) {
      setSelectedTicker(tickers[0].ticker);
    }
  }, [tickers, selectedTicker, allTickers]);

  // ── Run optimizer ──
  const runOptimizer = useCallback(async () => {
    setRunning(true);
    setResults([]);
    abortRef.current = false;
    const globalDates = await getDates();

    let tickerList: Array<{ ticker: string; name: string; pairA?: string; pairB?: string }>;
    if (mode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) { setRunning(false); return; }
      tickerList = [{ ticker: `${pairTickerA}/${pairTickerB}`, name: `${pairTickerA}/${pairTickerB}` }];
    } else if (mode === "pairCombo") {
      if (pairComboPicker.pairs.length === 0) { setRunning(false); return; }
      tickerList = pairComboPicker.pairs.map((p: any) => ({ ticker: p.label, name: p.label, pairA: p.a, pairB: p.b }));
    } else if (mode === "single") {
      tickerList = tickers.filter((t) => t.ticker === selectedTicker) as any;
    } else if (mode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) { setRunning(false); return; }
        const bkt = buildBasketOhlc(basketTickers, baskets);
        tickerList = [{ ticker: `BASKET:${bkt.name}`, name: `BASKET:${bkt.name}` }];
      } else {
        tickerList = basketTickers.map((t) => tickers.find((m) => m.ticker.toUpperCase() === t.toUpperCase()) ?? { ticker: t, name: t }) as any;
      }
    } else {
      tickerList = filteredTickers as any;
    }
    if (tickerList.length === 0) { setRunning(false); return; }

    setProgress({ current: 0, total: tickerList.length });
    const basketObj = mode === "basket" && basketMode === "combined" ? buildBasketOhlc(basketTickers, baskets) : null;
    const band = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
    const out: TickerResult[] = [];

    for (let si = 0; si < tickerList.length && !abortRef.current; si++) {
      const item = tickerList[si];
      setProgress({ current: si + 1, total: tickerList.length });
      try {
        let allIndices: number[];
        let metricVals: number[];
        let priceVals: number[];
        let alignedDates: string[];

        if (mode === "pair" || mode === "pairCombo") {
          const legA = mode === "pairCombo" ? item.pairA! : pairTickerA;
          const legB = mode === "pairCombo" ? item.pairB! : pairTickerB;
          const ratio = await getYahooPairsRatio(legA, legB, globalDates);
          if (!ratio || ratio.indices.length < 50) continue;
          allIndices = ratio.indices.slice();
          priceVals = ratio.prices.slice();
          metricVals = ratio.prices.slice();
          alignedDates = allIndices.map((z: number) => globalDates[z] || "");
        } else if (basketObj) {
          const ohlc = await getBasketOhlc(basketObj, dateRange);
          if (!ohlc || ohlc.closes.length < 252) continue;
          const dmap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dmap.set(globalDates[i], i);
          allIndices = [];
          priceVals = [];
          for (let i = 0; i < ohlc.priceDates.length; i++) {
            const gi = dmap.get(ohlc.priceDates[i]) ?? -1;
            if (gi >= 0) { allIndices.push(gi); priceVals.push(ohlc.closes[i]); }
          }
          metricVals = priceVals.slice();
          alignedDates = allIndices.map((i) => globalDates[i] || "");
          if (allIndices.length < 50) continue;
        } else {
          const raw = await getTickerRaw(item.ticker);
          const mult = metricMultiplier(selectedMetric);
          const sign = metricSign(selectedMetric);
          const metricPairs = raw[selectedMetric];
          if (!metricPairs || metricPairs.length === 0) continue;
          const metricMap = new Map<number, number>();
          for (const [idx, val] of metricPairs as [number, number][]) metricMap.set(idx, val * mult * sign);
          const ohlcRaw = await fetchTickerOHLCV(item.ticker);
          const ohlc = sliceDateRange(ohlcRaw, dateRange);
          if (!ohlc || ohlc.adjCloses.length < 252) continue;
          const ohlcDates = ohlc.dates.slice(0, ohlc.adjCloses.length);
          const dmap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dmap.set(globalDates[i], i);
          allIndices = [];
          metricVals = [];
          priceVals = [];
          for (let i = 0; i < ohlc.adjCloses.length; i++) {
            const gi = dmap.get(ohlcDates[i]);
            if (gi != null && gi >= 0 && metricMap.has(gi)) {
              allIndices.push(gi);
              metricVals.push(metricMap.get(gi)!);
              priceVals.push(ohlc.adjCloses[i]);
            }
          }
          if (allIndices.length < 50) continue;
          alignedDates = allIndices.map((i) => globalDates[i] || "");
        }

        const effFreq = mode === "pair" || mode === "pairCombo" ? "daily" : freqKey;
        const resampled = resampleWeekly({ dates: alignedDates, closes: priceVals, adjCloses: priceVals }, effFreq);

        let metricSeries: number[];
        let priceSeries: number[];
        const effFrequency = mode === "pair" || mode === "pairCombo" ? "daily" : frequency;
        if (effFreq === "weekly") {
          metricSeries = resampled.dailyIndexMap.map((c: number) => metricVals[c]);
          priceSeries = resampled.adjCloses;
        } else if (effFrequency === "weekly_on_daily") {
          const wk = weeklyDownsamplePrices(metricVals, alignedDates);
          metricSeries = expandWeeklyToDaily(wk.prices, wk.weekIndex, metricVals.length).map((w) => (Number.isNaN(w) ? metricVals[0] : w));
          priceSeries = priceVals;
        } else {
          metricSeries = metricVals;
          priceSeries = priceVals;
        }

        const minBars = effFreq === "weekly" ? 52 : 252;
        if (metricSeries.length < minBars) continue;
        const weeklyCloses = effFreq === "weekly" ? priceVals : undefined;
        const weeklyResult = effFreq === "weekly" ? resampled : undefined;

        const windowResults: WindowResult[] = [];
        for (const w of CANDIDATE_WINDOWS) {
          if (w > metricSeries.length * 0.8) continue;
          windowResults.push(analyzeWindow(metricSeries, priceSeries, w, buyThreshold, sellThreshold, targetReturn, band, signalType, weeklyCloses, weeklyResult));
        }
        if (windowResults.length === 0) continue;

        const best = windowResults.reduce((a, b) => (a.compositeScore > b.compositeScore ? a : b));
        // Drop per-bar profiles for non-best windows to keep persisted state small.
        for (const wr of windowResults) {
          if (wr.window !== best.window) {
            wr.buyProfiles = undefined;
            wr.sellProfiles = undefined;
            wr.buyRevProfiles = undefined;
            wr.sellRevProfiles = undefined;
          }
        }

        const ctxDates = allIndices.map((i) => globalDates[i] || "");
        const priceContext: PriceContext = {
          prices: priceVals,
          highs: priceVals.slice(),
          lows: priceVals.slice(),
          volumes: null,
          dates: ctxDates,
          globalIndices: allIndices.slice(),
          benchmarkPrices: null,
          mode: mode === "pair" || mode === "pairCombo" ? "pair" : "single",
          pairLegA: mode === "pairCombo" ? item.pairA : mode === "pair" ? pairTickerA : undefined,
          pairLegB: mode === "pairCombo" ? item.pairB : mode === "pair" ? pairTickerB : undefined,
        };

        out.push({
          ticker: item.ticker,
          name: item.name,
          results: windowResults,
          bestWindow: best.window,
          bestScore: best.compositeScore,
          priceContext,
        });
        if (si % 5 === 0 || si === tickerList.length - 1) setResults([...out]);
      } catch {}
    }

    setResults(out);
    setRunning(false);
  }, [tickers, selectedTicker, pairTickerA, pairTickerB, basketTickers, selectedMetric, mode, buyThreshold, sellThreshold, targetReturn, returnMode, bandMin, bandMax, signalType, frequency, freqKey, dateRange, pairComboPicker.pairs, basketMode, baskets, filteredTickers]);

  // ── Evaluate ──
  const handleEvaluate = useCallback(async () => {
    setEvaluating(true);
    setEvalResult(null);
    setEvalPriceContext(null);
    try {
      const globalDates = await getDates();
      const evalTickerStr = mode === "pair" ? "__PAIR__" : mode === "single" ? selectedTicker : tickers[0]?.ticker ?? "";
      if (mode === "pair" && (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB)) { setEvaluating(false); return; }
      if (!evalTickerStr && mode !== "pair" && mode !== "basket") { setEvaluating(false); return; }

      let indices: number[];
      let metricVals: number[];
      let priceVals: number[];
      let dates: string[];

      if (mode === "pair") {
        const ratio = await getYahooPairsRatio(pairTickerA, pairTickerB, globalDates);
        if (!ratio || ratio.indices.length < 50) { setEvaluating(false); return; }
        indices = ratio.indices.slice();
        priceVals = ratio.prices.slice();
        metricVals = ratio.prices.slice();
        dates = indices.map((g: number) => globalDates[g] || "");
      } else if (mode === "basket") {
        if (basketTickers.length === 0) { setEvaluating(false); return; }
        if (basketMode === "combined") {
          const bkt = buildBasketOhlc(basketTickers, baskets);
          const ohlc = await getBasketOhlc(bkt, dateRange);
          if (!ohlc || ohlc.closes.length < 252) { setEvaluating(false); return; }
          const dmap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dmap.set(globalDates[i], i);
          indices = [];
          priceVals = [];
          for (let i = 0; i < ohlc.priceDates.length; i++) {
            const gi = dmap.get(ohlc.priceDates[i]) ?? -1;
            if (gi >= 0) { indices.push(gi); priceVals.push(ohlc.closes[i]); }
          }
          metricVals = priceVals.slice();
          dates = indices.map((i) => globalDates[i] || "");
          if (indices.length < 50) { setEvaluating(false); return; }
        } else {
          const t = basketTickers[0];
          if (!t) { setEvaluating(false); return; }
          const raw = await getTickerRaw(t);
          const mult = metricMultiplier(selectedMetric);
          const sign = metricSign(selectedMetric);
          const metricPairs = raw[selectedMetric];
          if (!metricPairs || metricPairs.length === 0) { setEvaluating(false); return; }
          const metricMap = new Map<number, number>();
          for (const [idx, val] of metricPairs as [number, number][]) metricMap.set(idx, val * mult * sign);
          let ohlcRaw;
          try { ohlcRaw = await fetchTickerOHLCV(t); } catch { setEvaluating(false); return; }
          const ohlc = sliceDateRange(ohlcRaw, dateRange);
          if (!ohlc || ohlc.adjCloses.length < 252) { setEvaluating(false); return; }
          const ohlcDates = ohlc.dates.slice(0, ohlc.adjCloses.length);
          const dmap = new Map<string, number>();
          for (let i = 0; i < globalDates.length; i++) dmap.set(globalDates[i], i);
          indices = [];
          metricVals = [];
          priceVals = [];
          for (let i = 0; i < ohlc.adjCloses.length; i++) {
            const gi = dmap.get(ohlcDates[i]);
            if (gi != null && gi >= 0 && metricMap.has(gi)) {
              indices.push(gi); metricVals.push(metricMap.get(gi)!); priceVals.push(ohlc.adjCloses[i]);
            }
          }
          if (indices.length < 50) { setEvaluating(false); return; }
          dates = indices.map((i) => globalDates[i] || "");
        }
      } else {
        const t = mode === "single" ? selectedTicker : tickers[0]?.ticker ?? "";
        if (!t) { setEvaluating(false); return; }
        const raw = await getTickerRaw(t);
        const mult = metricMultiplier(selectedMetric);
        const sign = metricSign(selectedMetric);
        const metricPairs = raw[selectedMetric];
        if (!metricPairs || metricPairs.length === 0) { setEvaluating(false); return; }
        const metricMap = new Map<number, number>();
        for (const [idx, val] of metricPairs as [number, number][]) metricMap.set(idx, val * mult * sign);
        let ohlcRaw;
        try { ohlcRaw = await fetchTickerOHLCV(t); } catch { setEvaluating(false); return; }
        const ohlc = sliceDateRange(ohlcRaw, dateRange);
        if (!ohlc || ohlc.adjCloses.length < 252) { setEvaluating(false); return; }
        const ohlcDates = ohlc.dates.slice(0, ohlc.adjCloses.length);
        const dmap = new Map<string, number>();
        for (let i = 0; i < globalDates.length; i++) dmap.set(globalDates[i], i);
        indices = [];
        metricVals = [];
        priceVals = [];
        for (let i = 0; i < ohlc.adjCloses.length; i++) {
          const gi = dmap.get(ohlcDates[i]);
          if (gi != null && gi >= 0 && metricMap.has(gi)) {
            indices.push(gi); metricVals.push(metricMap.get(gi)!); priceVals.push(ohlc.adjCloses[i]);
          }
        }
        if (indices.length < 50) { setEvaluating(false); return; }
        dates = indices.map((i) => globalDates[i] || "");
      }

      const zScores = computeRollingZScores(metricVals, evalWindow);
      const doBreakout = evalSignalType === "breakout" || evalSignalType === "both";
      const doReversion = evalSignalType === "reversion" || evalSignalType === "both";
      const direction = evalSide === "long" ? "buy" : "sell";
      const buyIdx: number[] = [];
      const sellIdx: number[] = [];
      const lo = -Math.abs(evalThreshold);
      const hi = Math.abs(evalThreshold);
      let prevZ: number | null = null;
      for (let i = 0; i < zScores.length; i++) {
        const z = zScores[i];
        if (z === null) { prevZ = null; continue; }
        if (prevZ !== null) {
          if (doBreakout && prevZ >= lo && z < lo) buyIdx.push(i);
          if (doBreakout && prevZ <= hi && z > hi) sellIdx.push(i);
          if (doReversion && prevZ < lo && z >= lo) buyIdx.push(i);
          if (doReversion && prevZ > hi && z <= hi) sellIdx.push(i);
        }
        prevZ = z;
      }
      const signalIndices = (direction === "buy" ? buyIdx : sellIdx).sort((a, b) => a - b);
      const result = evaluateSignals(priceVals, dates, signalIndices, evalSide, targetReturn, evalHold, null, "3M");
      setEvalResult(result);
      setEvalPriceContext({
        prices: priceVals,
        highs: priceVals.slice(),
        lows: priceVals.slice(),
        volumes: null,
        dates,
        globalIndices: indices.slice(),
        benchmarkPrices: null,
        mode: mode === "pair" ? "pair" : "single",
        pairLegA: mode === "pair" ? pairTickerA : undefined,
        pairLegB: mode === "pair" ? pairTickerB : undefined,
      });
    } finally {
      setEvaluating(false);
    }
  }, [mode, selectedTicker, pairTickerA, pairTickerB, tickers, selectedMetric, evalSignalType, evalWindow, evalThreshold, evalSide, targetReturn, evalHold, dateRange, basketTickers, basketMode, baskets]);

  const evalLabel = useMemo(() => {
    const t = `±${Math.abs(evalThreshold).toFixed(1)}σ`;
    return `ZScore ${evalWindow}d ${evalSignalType} ${t} [${evalSide}]`;
  }, [evalWindow, evalSignalType, evalThreshold, evalSide]);

  const evalTickerLabel = useMemo(
    () => (mode === "pair" ? `${pairTickerA || "A"}/${pairTickerB || "B"}` : mode === "single" ? selectedTicker || "—" : tickers[0]?.ticker || "—"),
    [mode, pairTickerA, pairTickerB, selectedTicker, tickers]
  );

  // ── Workspace state ──
  const serializeState = useCallback(() => ({
    selectedMetric,
    selectedTicker,
    pairTickerA,
    pairTickerB,
    basketTickers,
    basketMode,
    mode,
    buyThreshold,
    sellThreshold,
    returnMode,
    targetReturn,
    bandMin,
    bandMax,
    results,
    expandedTicker,
    sortBy,
    signalType,
    frequency,
    pairCombo: pairComboPicker.serialize(),
  }), [selectedMetric, selectedTicker, pairTickerA, pairTickerB, basketTickers, basketMode, mode, buyThreshold, sellThreshold, returnMode, targetReturn, bandMin, bandMax, results, expandedTicker, sortBy, signalType, frequency, pairComboPicker]);

  const hydrateState = useCallback((saved: any) => {
    if (!saved) return;
    if (saved.selectedMetric) setSelectedMetric(saved.selectedMetric);
    if (saved.selectedTicker) { setSelectedTicker(saved.selectedTicker); restoredTickerRef.current = true; }
    if (saved.pairTickerA) setPairTickerA(saved.pairTickerA);
    if (saved.pairTickerB) setPairTickerB(saved.pairTickerB);
    if (saved.mode === "single" || saved.mode === "universe" || saved.mode === "pair" || saved.mode === "pairCombo" || saved.mode === "basket") setMode(saved.mode);
    if (saved.pairCombo) pairComboPicker.hydrate(saved.pairCombo);
    if (Array.isArray(saved.basketTickers)) setBasketTickers(saved.basketTickers.filter((t: any) => typeof t === "string"));
    if (saved.basketMode === "stocks" || saved.basketMode === "combined") setBasketMode(saved.basketMode);
    if (typeof saved.buyThreshold === "number") setBuyThreshold(saved.buyThreshold);
    if (typeof saved.sellThreshold === "number") setSellThreshold(saved.sellThreshold);
    if (saved.returnMode) setReturnMode(saved.returnMode);
    if (typeof saved.targetReturn === "number") setTargetReturn(saved.targetReturn);
    if (typeof saved.bandMin === "number") setBandMin(saved.bandMin);
    if (typeof saved.bandMax === "number") setBandMax(saved.bandMax);
    if (Array.isArray(saved.results)) setResults(saved.results);
    if (saved.expandedTicker !== undefined) setExpandedTicker(saved.expandedTicker);
    if (saved.sortBy) setSortBy(saved.sortBy);
    if (saved.signalType) setSignalType(saved.signalType);
    if (saved.frequency === "daily" || saved.frequency === "weekly" || saved.frequency === "weekly_on_daily") setFrequency(saved.frequency);
    else if (saved.timeframe === "weekly") setFrequency("weekly");
  }, [setFrequency, setResults, setBasketMode, pairComboPicker]);

  useWorkspaceTab("z-optimizer", serializeState, hydrateState);

  // ── Ranked / sorted results ──
  const enrichedResults = useMemo(() => results.map((e) => {
    let best = -Infinity;
    let bestWindow = e.bestWindow;
    for (const wr of e.results) {
      const b = scoreSignalStat(wr.buySummary, wr.buyComposite.score, "buy", scoreWeights);
      const s = scoreSignalStat(wr.sellSummary, wr.sellComposite.score, "sell", scoreWeights);
      const m = Math.max(b, s);
      if (m > best) { best = m; bestWindow = wr.window; }
    }
    return { ...e, bestScore: best === -Infinity ? e.bestScore : best, bestWindow };
  }), [results, scoreWeights]);

  const sortedResults = useMemo(() => {
    const r = [...enrichedResults];
    if (sortBy === "bestScore") r.sort((a, b) => b.bestScore - a.bestScore);
    else r.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return r;
  }, [enrichedResults, sortBy]);

  const handleExportCSV = () => {
    const horizons = FORWARD_HORIZONS.filter((_, i) => i >= 2);
    const rows = sortedResults.map((s) => {
      const wr = s.results.find((u) => u.window === s.bestWindow);
      const row: Record<string, any> = { ticker: s.ticker, name: s.name, bestWindow: s.bestWindow, bestScore: s.bestScore };
      horizons.forEach((h) => {
        row[`buy_hitRate_${h.label}`] = wr?.buySummary?.hitRate[h.label] ?? null;
        row[`sell_hitRate_${h.label}`] = wr?.sellSummary?.hitRate[h.label] ?? null;
      });
      return row;
    });
    const cols = Object.keys(rows[0] || {});
    const csv = [cols.join(","), ...rows.map((s) => cols.map((c) => `"${String(s[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `zscore_optimizer_${selectedMetric.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    a.click();
  };

  // ── Heatmap (universe mode) ──
  const heatmapData = useMemo(() => {
    if (results.length === 0) return null;
    const windowSet = new Set<number>();
    for (const r of results) for (const wr of r.results) windowSet.add(wr.window);
    const windows = Array.from(windowSet).sort((a, b) => a - b);
    const sorted = [...results].sort((a, b) => b.bestScore - a.bestScore);
    const matrix: { ticker: string; scores: (number | null)[] }[] = [];
    for (const r of sorted) {
      const scoreMap = new Map(r.results.map((wr) => [wr.window, wr.compositeScore]));
      matrix.push({ ticker: r.ticker, scores: windows.map((w) => scoreMap.get(w) ?? null) });
    }
    return { windows, matrix };
  }, [results]);

  const isBand = returnMode === "band";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">Z-Score Optimizer</h2>
        <div className="flex gap-px">
          <button
            data-testid="z-view-optimize"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${activeTab === "optimize" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setActiveTab("optimize")}
          >Optimize</button>
          <button
            data-testid="z-view-evaluate"
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${activeTab === "evaluate" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setActiveTab("evaluate")}
          >Evaluate</button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {activeTab === "optimize" ? "Search parameter space by hit rate" : "Score one specific setup"}
        </span>
      </div>

      {activeTab === "evaluate" ? (
        <>
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-start gap-4 flex-wrap">
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
                    <UnifiedTickerPicker tickers={tickers} value={isBasketTicker(selectedTicker) ? "" : selectedTicker} onChange={setSelectedTicker} label="Ticker" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
                    <BasketTickerPill activeTicker={selectedTicker} onSelectTicker={setSelectedTicker} fallbackTicker={tickers[0]?.ticker ?? null} />
                  </div>
                </div>
              )}
              {mode === "pair" && (
                <>
                  <UnifiedTickerPicker tickers={tickers} value={pairTickerA} onChange={setPairTickerA} label="Ticker A" />
                  <UnifiedTickerPicker tickers={tickers} value={pairTickerB} onChange={setPairTickerB} label="Ticker B" />
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
                  {(["breakout", "reversion", "both"] as const).map((e) => (
                    <button key={e} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${evalSignalType === e ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setEvalSignalType(e)}>
                      {e === "breakout" ? "Breakout" : e === "reversion" ? "Reversion" : "Both"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Window</label>
                <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary" value={evalWindow} onChange={(e) => setEvalWindow(Number(e.target.value))}>
                  {CANDIDATE_WINDOWS.map((e) => <option key={e} value={e}>{WINDOW_LABELS[e] || `${e}d`}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Threshold ±σ</label>
                <input type="number" step="0.5" min="0.5" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14 focus:outline-none focus:ring-1 focus:ring-primary" value={evalThreshold} onChange={(e) => setEvalThreshold(Number(e.target.value))} />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target %</label>
                <input type="number" step="0.5" min="0.5" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px] focus:outline-none focus:ring-1 focus:ring-primary" value={+(targetReturn * 100).toFixed(4)} onChange={(e) => setTargetReturn((parseFloat(e.target.value) || 5) / 100)} title="Hit-rate threshold in percent. 5 = 5%." />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Hold</label>
                <input type="number" min="0" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[60px] focus:outline-none focus:ring-1 focus:ring-primary" value={evalHold} onChange={(e) => setEvalHold(parseInt(e.target.value) || 0)} />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
                <div className="flex items-center gap-0.5">
                  {DATE_PRESETS.map((e) => (
                    <button key={e.value} data-testid={`z-eval-date-preset-${e.value}`} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === e.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`} onClick={() => { setDatePreset(e.value); setDateRange(createDateRangeFromPreset(e.value)); }}>{e.label}</button>
                  ))}
                </div>
                <input type="date" data-testid="z-eval-date-start" value={dateRange.start} onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, start: e.target.value }); }} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
                <span className="text-[10px] font-mono text-muted-foreground">→</span>
                <input type="date" data-testid="z-eval-date-end" value={dateRange.end} onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, end: e.target.value }); }} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                <button data-testid="z-eval-run" className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50" onClick={handleEvaluate} disabled={evaluating}>
                  {evaluating ? "Evaluating…" : "Evaluate"}
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3">
            <EvaluatorResultPanel result={evalResult} loading={evaluating} setupLabel={evalLabel} tickerLabel={evalTickerLabel} />
            {evalResult && evalPriceContext && evalResult.profiles.length >= 10 ? (
              <HitConditionsPanel
                ticker={evalPriceContext.mode === "pair" ? evalPriceContext.pairLegA || "" : selectedTicker || tickers[0]?.ticker || ""}
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
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-foreground tracking-tight">Z-Score Optimizer</h2>
                  {isFiltered && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                      {tickers.length} / {allTickers.length} tickers
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Find the rolling z-score window where extreme signals produce the most reliable forward returns
                </p>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Metric</label>
                <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary min-w-[140px]" value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)} disabled={running} data-testid="optimizer-metric">
                  {METRICS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px">
                  {["single", "universe", "pair", "pairCombo", "basket"].map((e) => (
                    <button key={e} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === e ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setMode(e)} disabled={running} data-testid={`optimizer-mode-${e}`}>
                      {e === "single" ? "Single Ticker" : e === "universe" ? "Universe" : e === "pair" ? "Pair (A/B)" : e === "pairCombo" ? "Pair Combo" : "Basket"}
                    </button>
                  ))}
                </div>
              </div>
              {mode === "pair" && (
                <div className="flex items-end gap-2">
                  <UnifiedTickerPicker tickers={tickers} value={pairTickerA} onChange={setPairTickerA} disabled={running} label="A" />
                  <UnifiedTickerPicker tickers={tickers} value={pairTickerB} onChange={setPairTickerB} disabled={running} label="B" />
                  <span className="text-[10px] font-mono text-muted-foreground pb-1">
                    Ratio: <span className="text-foreground font-bold">{pairTickerA || "A"}/{pairTickerB || "B"}</span>
                  </span>
                </div>
              )}
              {mode === "basket" && (
                <div className="flex flex-col gap-2">
                  <BasketPicker tickers={tickers} value={basketTickers} onChange={setBasketTickers} disabled={running} testIdPrefix="zscore-basket" />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket Run Mode</label>
                    <div className="flex gap-px" data-testid="zscore-basket-mode">
                      {["stocks", "combined"].map((e) => (
                        <button key={e} data-testid={`zscore-basket-mode-${e}`} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${basketMode === e ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setBasketMode(e)} disabled={running} title={e === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme"}>
                          {e === "stocks" ? "Stock by Stock" : "Combined"}
                        </button>
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
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Classification Filter</label>
                  {classFilter.universeSourceUI}
                  {classFilter.classFilterUI}
                </div>
              )}
              {mode === "single" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker</label>
                  <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary min-w-[80px]" value={selectedTicker} onChange={(e) => setSelectedTicker(e.target.value)} disabled={running} data-testid="optimizer-ticker">
                    {tickers.map((e) => <option key={e.ticker} value={e.ticker}>{e.ticker}</option>)}
                  </select>
                </div>
              )}
              {frequencyUI}
              <div className="flex items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
                <div className="flex items-center gap-0.5">
                  {DATE_PRESETS.map((e) => (
                    <button key={e.value} data-testid={`z-date-preset-${e.value}`} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === e.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`} onClick={() => { setDatePreset(e.value); setDateRange(createDateRangeFromPreset(e.value)); }}>{e.label}</button>
                  ))}
                </div>
                <input type="date" data-testid="z-date-start" value={dateRange.start} onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, start: e.target.value }); }} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
                <span className="text-[10px] font-mono text-muted-foreground">→</span>
                <input type="date" data-testid="z-date-end" value={dateRange.end} onChange={(e) => { setDatePreset("custom"); setDateRange({ ...dateRange, end: e.target.value }); }} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Buy σ</label>
                <input type="number" step="0.5" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14 focus:outline-none focus:ring-1 focus:ring-primary" value={buyThreshold} onChange={(e) => setBuyThreshold(Number(e.target.value))} disabled={running} data-testid="optimizer-buy-threshold" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Sell σ</label>
                <input type="number" step="0.5" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14 focus:outline-none focus:ring-1 focus:ring-primary" value={sellThreshold} onChange={(e) => setSellThreshold(Number(e.target.value))} disabled={running} data-testid="optimizer-sell-threshold" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal</label>
                <div className="flex gap-px">
                  {(["breakout", "reversion", "both"] as const).map((e) => (
                    <button key={e} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${signalType === e ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setSignalType(e)} disabled={running} title={e === "breakout" ? "Signal when Z crosses through threshold (entering extreme)" : e === "reversion" ? "Signal when Z crosses back inside threshold (leaving extreme)" : "Show both breakout and reversion signals"}>
                      {e === "breakout" ? "Breakout" : e === "reversion" ? "Reversion" : "Both"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Return</label>
                <div className="flex gap-px">
                  {(["threshold", "band"] as const).map((e) => (
                    <button key={e} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${returnMode === e ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setReturnMode(e)} disabled={running}>
                      {e === "threshold" ? "Threshold" : "Band"}
                    </button>
                  ))}
                </div>
              </div>
              {returnMode === "threshold" ? (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target</label>
                  <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]" value={targetReturn} onChange={(e) => setTargetReturn(Number(e.target.value))} disabled={running}>
                    {TARGET_RETURN_OPTIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Band</label>
                    <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[80px]" value={`${bandMin}-${bandMax}`} onChange={(e) => { const [l, r] = e.target.value.split("-").map(Number); setBandMin(l); setBandMax(r); }} disabled={running}>
                      {RETURN_BAND_PRESETS.map((e) => <option key={e.label} value={`${e.band.minReturn}-${e.band.maxReturn}`}>{e.label}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min %</label>
                    <input type="number" step="1" min="0" max="100" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14" value={Math.round(bandMin * 100)} onChange={(e) => setBandMin(Number(e.target.value) / 100)} disabled={running} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Max %</label>
                    <input type="number" step="1" min="0" max="100" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14" value={Math.round(bandMax * 100)} onChange={(e) => setBandMax(Number(e.target.value) / 100)} disabled={running} />
                  </div>
                </>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                {running ? (
                  <button className="text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500 transition-colors" onClick={() => { abortRef.current = true; }} data-testid="optimizer-cancel">
                    Cancel ({progress.current}/{progress.total})
                  </button>
                ) : (
                  <button className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" onClick={runOptimizer} data-testid="optimizer-run">
                    Run Optimizer
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-4 py-3">
            {results.length === 0 && !running && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a metric and click "Run Optimizer" to find the best z-score lookback window
              </div>
            )}
            {running && results.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">Analyzing...</div>
                  <div className="text-xs font-mono text-muted-foreground">{progress.current} / {progress.total} tickers</div>
                  <div className="w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            )}

            {mode === "universe" && heatmapData && heatmapData.matrix.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Composite Score Heatmap — {selectedMetric}</h3>
                  <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground">
                    {[0, 25, 50, 75, 100].map((e) => (
                      <span key={e} className="flex items-center gap-1">
                        <span className="w-4 h-3 rounded-sm border border-white/10" style={{ background: scoreColor(e) }} />
                        <span style={{ color: scoreTextColor(e) }}>{e}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto border border-border rounded">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="bg-card">
                        <th className="text-left px-2 py-1 text-muted-foreground font-bold sticky left-0 bg-card z-10 border-r border-border">Ticker</th>
                        {heatmapData.windows.map((e) => (
                          <th key={e} className="text-center px-2 py-1 text-muted-foreground font-bold whitespace-nowrap">{WINDOW_LABELS[e] || `${e}d`}</th>
                        ))}
                        <th className="text-center px-2 py-1 text-muted-foreground font-bold">Best</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapData.matrix.map((e) => {
                        const tr = results.find((r) => r.ticker === e.ticker);
                        return (
                          <tr key={e.ticker} className="hover:bg-white/5 cursor-pointer" onClick={() => setExpandedTicker(expandedTicker === e.ticker ? null : e.ticker)}>
                            <td className="px-2 py-1 text-foreground font-bold sticky left-0 bg-card z-10 border-r border-border">{e.ticker}</td>
                            {e.scores.map((r, d) => (
                              <td key={d} className="text-center px-2 py-1 font-bold" style={{ backgroundColor: r !== null ? scoreColor(r) : "rgba(255,255,255,0.04)", color: r !== null ? scoreTextColor(r) : "#555" }} title={r !== null ? `${r}` : "N/A"}>
                                {r !== null ? r : "–"}
                              </td>
                            ))}
                            <td className="text-center px-2 py-1 text-foreground font-bold">{tr ? WINDOW_LABELS[tr.bestWindow] || `${tr.bestWindow}d` : "–"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {sortedResults.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    {mode === "single" ? "Window Analysis" : "Results by Ticker"} — {selectedMetric}
                    {signalType !== "breakout" && ` — ${signalType === "reversion" ? "Reversion" : "Breakout + Reversion"}`}
                    {returnMode === "band" ? ` — band ${pct(bandMin)}–${pct(bandMax)}` : ` — target ${pct(targetReturn)}`}
                  </h3>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-mono text-muted-foreground">RANK BY</label>
                      <select data-testid="z-rank-by" value={rankBy} onChange={(e) => setRankBy(e.target.value)} className="text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5">
                        {RANK_BY_OPTIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                      </select>
                    </div>
                    {mode === "universe" && (
                      <>
                        <button className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === "bestScore" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`} onClick={() => setSortBy("bestScore")}>Sort: Score</button>
                        <button className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === "ticker" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`} onClick={() => setSortBy("ticker")}>Sort: Ticker</button>
                      </>
                    )}
                    <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={handleExportCSV} data-testid="export-csv">
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {sortedResults.map((e) => {
                  const isExpanded = mode === "single" || expandedTicker === e.ticker;
                  return (
                    <div key={e.ticker} className="mb-3">
                      {mode === "universe" && (
                        <button className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-white/5 transition-colors" onClick={() => setExpandedTicker(isExpanded ? null : e.ticker)}>
                          <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                          <span className="text-xs font-mono font-bold text-foreground">{e.ticker}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{e.name}</span>
                          <span className="ml-auto text-[10px] font-mono">
                            Best: <span className="text-primary font-bold">{WINDOW_LABELS[e.bestWindow] || `${e.bestWindow}d`}</span>{" "}Score: <span className="inline-block px-1 py-0 rounded font-bold" style={{ backgroundColor: scoreColor(e.bestScore), color: scoreTextColor(e.bestScore) }}>{e.bestScore}</span>
                          </span>
                        </button>
                      )}
                      {isExpanded && (
                        <div className="overflow-x-auto border border-border rounded mt-1">
                          <table className="w-full text-[10px] font-mono">
                            <thead>
                              <tr className="bg-card text-muted-foreground">
                                <th className="text-left px-2 py-1 font-bold">Window</th>
                                {signalType === "both" && <th className="text-center px-2 py-1 font-bold">Type</th>}
                                <th className="text-center px-2 py-1 font-bold">Buy Sig</th>
                                <th className="text-center px-2 py-1 font-bold">Sell Sig</th>
                                {FORWARD_HORIZONS.map((r) => <th key={`bh-${r.label}`} className="text-center px-2 py-1 font-bold">Buy {isBand ? "Band" : "Hit"} {r.label}</th>)}
                                {FORWARD_HORIZONS.filter((_, d) => d >= 2).map((r) => <th key={`ba-${r.label}`} className="text-center px-2 py-1 font-bold">Buy Avg {r.label}</th>)}
                                {FORWARD_HORIZONS.map((r) => <th key={`sh-${r.label}`} className="text-center px-2 py-1 font-bold">Sell {isBand ? "Band" : "Hit"} {r.label}</th>)}
                                {FORWARD_HORIZONS.filter((_, d) => d >= 2).map((r) => <th key={`sa-${r.label}`} className="text-center px-2 py-1 font-bold">Sell Avg {r.label}</th>)}
                                {FORWARD_HORIZONS.filter((_, d) => d >= 2).map((r) => <th key={`pf-${r.label}`} className="text-center px-2 py-1 font-bold">PF {r.label}</th>)}
                                <th className="text-center px-2 py-1 font-bold">Score</th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.results.filter((r) => r.buySummary && r.sellSummary).flatMap((r) => {
                                const isBest = r.window === e.bestWindow;
                                const subRows: { key: string; label: string; bs: SignalSummary; ss: SignalSummary; score: number | null; highlight: boolean }[] = [];
                                if (signalType === "both") {
                                  subRows.push({ key: `${r.window}-brk`, label: "BRK", bs: r.buySummary, ss: r.sellSummary, score: null, highlight: false });
                                  if (r.buyRevSummary && r.sellRevSummary) subRows.push({ key: `${r.window}-rev`, label: "REV", bs: r.buyRevSummary, ss: r.sellRevSummary, score: null, highlight: false });
                                } else {
                                  subRows.push({ key: `${r.window}`, label: "", bs: r.buySummary, ss: r.sellSummary, score: r.compositeScore, highlight: isBest });
                                }
                                return subRows.map((s, x) => (
                                  <tr key={s.key} className={`${s.highlight ? "bg-primary/15 ring-1 ring-inset ring-primary/30" : signalType === "both" && x === 1 ? "bg-white/[0.02] border-b border-border/30" : "hover:bg-white/5"}`}>
                                    {x === 0 ? (
                                      <td className={`px-2 py-1 font-bold ${isBest ? "text-primary" : "text-foreground"}`} rowSpan={signalType === "both" ? subRows.length : 1}>
                                        {WINDOW_LABELS[r.window] || `${r.window}d`}{isBest && " ★"}
                                      </td>
                                    ) : null}
                                    {signalType === "both" && <td className={`text-center px-2 py-1 font-bold ${s.label === "REV" ? "text-amber-400" : "text-blue-400"}`}>{s.label}</td>}
                                    <td className="text-center px-2 py-1 text-foreground">{s.bs.count}</td>
                                    <td className="text-center px-2 py-1 text-foreground">{s.ss.count}</td>
                                    {FORWARD_HORIZONS.map((i) => {
                                      const v = isBand ? (s.bs.bandHitRate?.[i.label] ?? 0) : s.bs.hitRate[i.label];
                                      return <td key={`bh-${i.label}`} className={`text-center px-2 py-1 ${s.bs.count > 0 ? hitRateColor(v) : ""}`}>{s.bs.count > 0 ? pct(v) : "–"}</td>;
                                    })}
                                    {FORWARD_HORIZONS.filter((_, u) => u >= 2).map((i) => (
                                      <td key={`ba-${i.label}`} className={`text-center px-2 py-1 ${s.bs.count > 0 ? (s.bs.avgReturn[i.label] >= 0 ? "text-green-400" : "text-red-400") : ""}`}>{s.bs.count > 0 ? pctSigned(s.bs.avgReturn[i.label]) : "–"}</td>
                                    ))}
                                    {FORWARD_HORIZONS.map((i) => {
                                      const v = isBand ? (s.ss.bandHitRate?.[i.label] ?? 0) : s.ss.hitRate[i.label];
                                      return <td key={`sh-${i.label}`} className={`text-center px-2 py-1 ${s.ss.count > 0 ? hitRateColor(v) : ""}`}>{s.ss.count > 0 ? pct(v) : "–"}</td>;
                                    })}
                                    {FORWARD_HORIZONS.filter((_, u) => u >= 2).map((i) => (
                                      <td key={`sa-${i.label}`} className={`text-center px-2 py-1 ${s.ss.count > 0 ? (s.ss.avgReturn[i.label] <= 0 ? "text-green-400" : "text-red-400") : ""}`}>{s.ss.count > 0 ? pctSigned(s.ss.avgReturn[i.label]) : "–"}</td>
                                    ))}
                                    {FORWARD_HORIZONS.filter((_, u) => u >= 2).map((i) => {
                                      const v = s.bs.count > 0 ? s.bs.profitFactor[i.label] : s.ss.profitFactor[i.label];
                                      const has = s.bs.count > 0 || s.ss.count > 0;
                                      return <td key={`pf-${i.label}`} className={`text-center px-2 py-1 ${has ? profitFactorColor(v) : ""}`}>{has ? (v >= 99 ? "∞" : v.toFixed(2)) : "–"}</td>;
                                    })}
                                    {x === 0 ? (
                                      <td className="text-center px-2 py-1" rowSpan={signalType === "both" ? subRows.length : 1}>
                                        <span className="inline-block px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: scoreColor(r.compositeScore), color: scoreTextColor(r.compositeScore) }}>{r.compositeScore}</span>
                                      </td>
                                    ) : null}
                                  </tr>
                                ));
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {isExpanded && e.priceContext && (() => {
                        const r = e.results.find((n) => n.window === e.bestWindow);
                        if (!r) return null;
                        const panels: { key: string; label: string; profiles: ForwardReturnProfile[]; direction: "buy" | "sell"; title: string }[] = [];
                        if (r.buyProfiles && r.buyProfiles.length >= 10) panels.push({ key: `${e.ticker}::brk-buy`, label: `Buy BRK (${r.buyProfiles.length})`, profiles: r.buyProfiles, direction: "buy", title: `${WINDOW_LABELS[e.bestWindow] || e.bestWindow + "d"} — Buy Breakout` });
                        if (r.sellProfiles && r.sellProfiles.length >= 10) panels.push({ key: `${e.ticker}::brk-sell`, label: `Sell BRK (${r.sellProfiles.length})`, profiles: r.sellProfiles, direction: "sell", title: `${WINDOW_LABELS[e.bestWindow] || e.bestWindow + "d"} — Sell Breakout` });
                        if (r.buyRevProfiles && r.buyRevProfiles.length >= 10) panels.push({ key: `${e.ticker}::rev-buy`, label: `Buy REV (${r.buyRevProfiles.length})`, profiles: r.buyRevProfiles, direction: "buy", title: `${WINDOW_LABELS[e.bestWindow] || e.bestWindow + "d"} — Buy Reversion` });
                        if (r.sellRevProfiles && r.sellRevProfiles.length >= 10) panels.push({ key: `${e.ticker}::rev-sell`, label: `Sell REV (${r.sellRevProfiles.length})`, profiles: r.sellRevProfiles, direction: "sell", title: `${WINDOW_LABELS[e.bestWindow] || e.bestWindow + "d"} — Sell Reversion` });
                        if (panels.length === 0) return null;
                        return (
                          <div className="mt-2 px-2">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Hit Conditions (best window):</span>
                              {panels.map((n) => {
                                const open = hitConditionsOpen.has(n.key);
                                return (
                                  <button key={n.key} type="button" onClick={() => toggleHitConditions(n.key)} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${open ? "bg-violet-500/25 text-violet-200 border-violet-400/40" : "bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`} title="Profile what other indicators looked like at hit-bars vs miss-bars">
                                    {open ? "▾" : "▸"} {n.label}
                                  </button>
                                );
                              })}
                            </div>
                            {panels.filter((n) => hitConditionsOpen.has(n.key)).map((n) => (
                              <div key={`${n.key}-panel`} className="mt-1">
                                <HitConditionsPanel ticker={e.ticker} priceContext={e.priceContext} signals={n.profiles} direction={n.direction} title={n.title} useBand={isBand} />
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
