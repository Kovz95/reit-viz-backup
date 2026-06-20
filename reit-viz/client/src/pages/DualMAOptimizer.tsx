// Reconstructed from recovered-bundle/DualMAOptimizer-Cbga92QD.js on 2026-06-11
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { getTickers, getDates, getTickerRaw } from "@/lib/dataService";
import type { TickerMeta } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/useBaskets";
import { computeMA, MA_TYPES } from "@/lib/movingAverages";
import type { MAType } from "@/lib/movingAverages";
import { filterByDateRange, resampleWeekly, createDateRange, getWorkbookSeries, isBasketTicker } from "@/lib/optimizerInputSeries";
import { defaultInputSelection } from "@/lib/optimizerInputSeries";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { weeklyDownsamplePrices } from "@/lib/weeklyDownsample";
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { B as BasketTickerPill } from "@/components/BasketTickerPill";
import { B as BasketPicker } from "@/components/BasketPicker";
import { buildBasketOhlc, getBasketOhlc } from "@/lib/basketOhlc";
import CartesianGrid from "@/components/CartesianGrid";
import { InputSeriesPicker } from "@/components/InputSeriesPicker";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Download } from "lucide-react";
import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  XAxis,
  YAxis,
  Tooltip,
  Line,
} from "recharts";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";

// ── Constants ──

const SLOPE_METHODS: Record<string, string> = {
  diff: "Lookback Diff",
  ols: "OLS Slope",
  diff_pct: "Diff + Magnitude",
};

// ── Types ──

interface DualMAParams {
  biasMAType: string;
  biasLen: number;
  triggerMAType: string;
  triggerLen: number;
  slopeMethod: string;
  slopeLookback: number;
  slopeMinPct: number;
  allowShort: boolean;
  maOpts?: any;
}

interface TradeRecord {
  side: "long" | "short";
  entryIdx: number;
  exitIdx: number;
  entryPrice: number;
  exitPrice: number;
  bars: number;
  ret: number;
}

interface BacktestStats {
  nTrades: number;
  nWins: number;
  hitRate: number;
  meanRet: number;
  medianRet: number;
  winRet: number;
  lossRet: number;
  profitFactor: number;
  totalReturn: number;
  annualReturn: number;
  annualVol: number;
  sharpe: number;
  maxDD: number;
  timeInMarket: number;
  buyHoldReturn: number;
}

interface BacktestResult {
  params: DualMAParams;
  trades: TradeRecord[];
  equity: number[];
  bias: Int8Array;
  position: Int8Array;
  stats: BacktestStats;
}

interface ParamResult {
  params: DualMAParams;
  stats: BacktestStats;
}

interface TickerResult {
  ticker: string;
  name: string;
  topK: ParamResult[];
}

interface GridConfig {
  biasMATypes: string[];
  biasLens: number[];
  triggerMATypes: string[];
  triggerLens: number[];
  slopeMethods: string[];
  slopeLookbacks: number[];
  slopeMinPcts: number[];
  allowShortOptions: boolean[];
  maOpts?: any;
}

// ── Grid configs ──

const GRID_CONFIGS: Record<string, GridConfig> = {
  quick: {
    biasMATypes: ["EMA"],
    biasLens: [20, 50, 100, 200],
    triggerMATypes: ["WMA"],
    triggerLens: [10, 20, 50],
    slopeMethods: ["diff"],
    slopeLookbacks: [5, 10],
    slopeMinPcts: [0],
    allowShortOptions: [true],
  },
  standard: {
    biasMATypes: ["EMA", "SMA", "HMA"],
    biasLens: [20, 34, 50, 89, 100, 150, 200],
    triggerMATypes: ["WMA", "EMA", "HMA"],
    triggerLens: [8, 13, 20, 34, 50],
    slopeMethods: ["diff", "ols"],
    slopeLookbacks: [3, 5, 10, 20],
    slopeMinPcts: [0],
    allowShortOptions: [true],
  },
  deep: {
    biasMATypes: ["EMA", "SMA", "HMA", "WMA", "KAMA", "T3", "ALMA"],
    biasLens: [10, 20, 34, 50, 89, 100, 150, 200, 250],
    triggerMATypes: ["WMA", "EMA", "HMA", "SMA", "ALMA"],
    triggerLens: [5, 8, 13, 20, 34, 50, 100],
    slopeMethods: ["diff", "ols", "diff_pct"],
    slopeLookbacks: [3, 5, 10, 20, 40],
    slopeMinPcts: [0, 5e-4, 0.001, 0.002],
    allowShortOptions: [true],
  },
};

function countGridCombos(cfg: GridConfig): number {
  let n = 0;
  for (const slopeMethod of cfg.slopeMethods) {
    const minPcts = slopeMethod === "diff_pct" ? cfg.slopeMinPcts : [0];
    n +=
      cfg.biasMATypes.length *
      cfg.biasLens.length *
      cfg.triggerMATypes.length *
      cfg.triggerLens.length *
      cfg.slopeLookbacks.length *
      minPcts.length *
      cfg.allowShortOptions.length;
  }
  return n;
}

// ── Slope helper ──

function computeSlopeSignal(
  prices: (number | null)[],
  idx: number,
  lookback: number,
  method: string,
  rawPrices: number[],
  minPct: number
): number {
  const cur = prices[idx];
  if (cur == null) return 0;
  if (method === "ols") {
    if (idx - lookback < 0) return 0;
    let sx = 0, sy = 0, sxy = 0, sxx = 0, n = 0;
    for (let i = 0; i <= lookback; i++) {
      const p = prices[idx - lookback + i];
      if (p == null) return 0;
      sx += i; sy += p; sxy += i * p; sxx += i * i; n++;
    }
    const denom = n * sxx - sx * sx;
    if (denom === 0) return 0;
    const slope = (n * sxy - sx * sy) / denom;
    return slope > 0 ? 1 : slope < 0 ? -1 : 0;
  }
  if (idx - lookback < 0) return 0;
  const prev = prices[idx - lookback];
  if (prev == null) return 0;
  const diff = (cur - prev) / lookback;
  if (method === "diff_pct") {
    const raw = rawPrices[idx];
    if (!Number.isFinite(raw) || raw <= 0 || Math.abs(diff) / raw < minPct) return 0;
  }
  return diff > 0 ? 1 : diff < 0 ? -1 : 0;
}

// ── Buy & hold ──

function buyHoldReturn(prices: number[]): number {
  let first = -1, last = -1;
  for (let i = 0; i < prices.length; i++) {
    if (Number.isFinite(prices[i]) && prices[i] > 0) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return first < 0 || last <= first ? 0 : prices[last] / prices[first] - 1;
}

function calcStats(
  trades: TradeRecord[],
  equity: Float64Array,
  position: Int8Array,
  prices: number[]
): BacktestStats {
  const n = trades.length;
  if (n === 0) {
    return {
      nTrades: 0, nWins: 0, hitRate: NaN, meanRet: NaN, medianRet: NaN,
      winRet: NaN, lossRet: NaN, profitFactor: NaN, totalReturn: 0,
      annualReturn: 0, annualVol: NaN, sharpe: NaN, maxDD: 0,
      timeInMarket: 0, buyHoldReturn: buyHoldReturn(prices),
    };
  }
  const rets = trades.map(t => t.ret);
  const wins = rets.filter(r => r > 0);
  const losses = rets.filter(r => r <= 0);
  const winSum = wins.reduce((a, b) => a + b, 0);
  const lossSum = losses.reduce((a, b) => a + b, 0);
  const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sorted = [...rets].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianRet = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const totalReturn = equity[equity.length - 1] - 1;
  const years = Math.max(0.001, prices.length / 252);
  const annualReturn = (1 + totalReturn) ** (1 / years) - 1;
  let variance = 0;
  for (const r of rets) variance += (r - meanRet) ** 2;
  const tradeStd = rets.length > 1 ? Math.sqrt(variance / (rets.length - 1)) : NaN;
  const tradesPerYear = rets.length / years;
  const annualVol = Number.isFinite(tradeStd) ? tradeStd * Math.sqrt(tradesPerYear) : NaN;
  const sharpe = Number.isFinite(annualVol) && annualVol > 0 ? annualReturn / annualVol : NaN;
  let peak = equity[0], maxDD = 0;
  for (let i = 0; i < equity.length; i++) {
    if (equity[i] > peak) peak = equity[i];
    const dd = (equity[i] - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  let inMarket = 0;
  for (let i = 0; i < position.length; i++) if (position[i] !== 0) inMarket++;
  return {
    nTrades: n, nWins: wins.length,
    hitRate: wins.length / n,
    meanRet, medianRet,
    winRet: wins.length ? winSum / wins.length : NaN,
    lossRet: losses.length ? lossSum / losses.length : NaN,
    profitFactor: losses.length > 0 && lossSum < 0 ? winSum / Math.abs(lossSum) : winSum > 0 ? Infinity : NaN,
    totalReturn, annualReturn, annualVol, sharpe, maxDD,
    timeInMarket: inMarket / position.length,
    buyHoldReturn: buyHoldReturn(prices),
  };
}

function runBacktest(prices: number[], params: DualMAParams): BacktestResult {
  const n = prices.length;
  const biasMa = computeMA(prices, params.biasLen, params.biasMAType as MAType, params.maOpts);
  const trigMa = computeMA(prices, params.triggerLen, params.triggerMAType as MAType, params.maOpts);
  const bias = new Int8Array(n);
  const position = new Int8Array(n);
  const trades: TradeRecord[] = [];
  const equity = new Float64Array(n);
  let curEquity = 1;
  let activePos: "long" | "short" | null = null;
  let entryIdx = -1;
  let entryPrice = NaN;

  for (let i = 0; i < n; i++) {
    equity[i] = curEquity;
    const price = prices[i];
    const prevPrice = i > 0 ? prices[i - 1] : NaN;
    const trig = trigMa[i];
    const prevTrig = i > 0 ? trigMa[i - 1] : null;
    const biasVal = biasMa[i];

    let biasSignal = 0;
    if (Number.isFinite(price) && biasVal != null) {
      const slope = computeSlopeSignal(biasMa, i, params.slopeLookback, params.slopeMethod, prices, params.slopeMinPct);
      if (price > biasVal && slope === 1) biasSignal = 1;
      else if (price < biasVal && slope === -1 && params.allowShort) biasSignal = -1;
    }
    bias[i] = biasSignal;

    const hasData = i > 0 && Number.isFinite(price) && Number.isFinite(prevPrice) && trig != null && prevTrig != null;
    const crossUp = hasData && prevPrice <= (prevTrig as number) && price > (trig as number);
    const crossDown = hasData && prevPrice >= (prevTrig as number) && price < (trig as number);

    if (activePos === "long") {
      if (crossDown || biasSignal !== 1) {
        const ret = (price - entryPrice) / entryPrice;
        trades.push({ side: "long", entryIdx, exitIdx: i, entryPrice, exitPrice: price, bars: i - entryIdx, ret });
        curEquity *= 1 + ret;
        activePos = null; entryIdx = -1; entryPrice = NaN;
      }
    } else if (activePos === "short" && (crossUp || biasSignal !== -1)) {
      const ret = (entryPrice - price) / entryPrice;
      trades.push({ side: "short", entryIdx, exitIdx: i, entryPrice, exitPrice: price, bars: i - entryIdx, ret });
      curEquity *= 1 + ret;
      activePos = null; entryIdx = -1; entryPrice = NaN;
    }

    if (activePos === null) {
      if (biasSignal === 1 && crossUp) { activePos = "long"; entryIdx = i; entryPrice = price; }
      else if (biasSignal === -1 && crossDown && params.allowShort) { activePos = "short"; entryIdx = i; entryPrice = price; }
    }

    position[i] = activePos === "long" ? 1 : activePos === "short" ? -1 : 0;
    equity[i] = curEquity;
  }

  if (activePos !== null) {
    const i = n - 1;
    const price = prices[i];
    const ret = activePos === "long" ? (price - entryPrice) / entryPrice : (entryPrice - price) / entryPrice;
    trades.push({ side: activePos, entryIdx, exitIdx: i, entryPrice, exitPrice: price, bars: i - entryIdx, ret });
    curEquity *= 1 + ret;
    equity[i] = curEquity;
  }

  const stats = calcStats(trades, equity, position, prices);
  return { params, trades, equity: Array.from(equity), bias, position, stats };
}

// ── Grid search ──

function runGridSearch(prices: number[], cfg: GridConfig, topK = 50): ParamResult[] {
  const results: ParamResult[] = [];
  for (const biasMAType of cfg.biasMATypes)
    for (const biasLen of cfg.biasLens)
      for (const triggerMAType of cfg.triggerMATypes)
        for (const triggerLen of cfg.triggerLens) {
          if (triggerLen >= biasLen) continue;
          for (const slopeMethod of cfg.slopeMethods) {
            const minPcts = slopeMethod === "diff_pct" ? cfg.slopeMinPcts : [0];
            for (const slopeLookback of cfg.slopeLookbacks)
              for (const slopeMinPct of minPcts)
                for (const allowShort of cfg.allowShortOptions) {
                  const params: DualMAParams = {
                    biasMAType, biasLen, triggerMAType, triggerLen,
                    slopeMethod, slopeLookback, slopeMinPct, allowShort,
                    maOpts: cfg.maOpts,
                  };
                  const result = runBacktest(prices, params);
                  results.push({ params, stats: result.stats });
                }
          }
        }
  results.sort((a, b) => {
    const sa = Number.isFinite(a.stats.sharpe) ? a.stats.sharpe : -Infinity;
    const sb = Number.isFinite(b.stats.sharpe) ? b.stats.sharpe : -Infinity;
    return sb - sa;
  });
  return results.slice(0, topK);
}

function paramsLabel(p: DualMAParams): string {
  const slopeStr =
    p.slopeMethod === "diff_pct"
      ? `${SLOPE_METHODS[p.slopeMethod]}(${p.slopeLookback}, ${(p.slopeMinPct * 100).toFixed(2)}%)`
      : `${SLOPE_METHODS[p.slopeMethod]}(${p.slopeLookback})`;
  return `${p.biasMAType}${p.biasLen}/${p.triggerMAType}${p.triggerLen} · ${slopeStr}${p.allowShort ? "" : " · long-only"}`;
}

// ── Default state ──

const DEFAULT_CFG = {
  biasMAType: "EMA",
  biasLen: 50,
  triggerMAType: "WMA",
  triggerLen: 20,
  slopeMethod: "diff",
  slopeLookback: 5,
  slopeMinPct: 0.001,
  allowShort: true,
  gridSize: "quick",
  topK: 10,
  mode: "single",
};

// ── Formatters ──

function fmtNum(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "–" : v.toFixed(2);
}

function fmtPct(v: number | null | undefined, decimals = 1): string {
  return v == null || !Number.isFinite(v) ? "–" : (v * 100).toFixed(decimals) + "%";
}

function fmtPctSigned(v: number | null | undefined, decimals = 1): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const s = (v * 100).toFixed(decimals) + "%";
  return v >= 0 ? "+" + s : s;
}

function sharpeColor(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v)
    ? "text-muted-foreground"
    : v >= 1 ? "text-emerald-400" : v >= 0.5 ? "text-green-400" : v >= 0 ? "text-yellow-400" : "text-red-400";
}

function signedColor(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v)
    ? "text-muted-foreground"
    : v >= 0 ? "text-green-400" : "text-red-400";
}

function drawdownColor(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v)
    ? "text-muted-foreground"
    : v >= -0.05 ? "text-green-400" : v >= -0.15 ? "text-yellow-400" : "text-red-400";
}

// ── Main component ──

export default function DualMAOptimizer() {
  const [tickers, setTickers] = useState<TickerMeta[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = useState("stocks");
  const { baskets } = useBaskets();
  const tickerSetRef = useRef(false);
  const [inputSelection, setInputSelection] = usePersistedState("dual-ma-input-selection", defaultInputSelection);
  const [savedCfg, setSavedCfg] = usePersistedState("dualma:cfg", DEFAULT_CFG);
  const [mode, setMode] = useState<string>(savedCfg.mode ?? "single");
  const [gridSize, setGridSize] = useState<string>(savedCfg.gridSize ?? "quick");
  const [topK] = useState<number>(savedCfg.topK ?? 10);
  const cfgRef = savedCfg;
  const [biasMAType, setBiasMAType] = useState<string>(savedCfg.biasMAType ?? "EMA");
  const [biasLen, setBiasLen] = useState<number>(savedCfg.biasLen ?? (cfgRef as any).emaLen ?? 50);
  const [triggerMAType, setTriggerMAType] = useState<string>(savedCfg.triggerMAType ?? "WMA");
  const [triggerLen, setTriggerLen] = useState<number>(savedCfg.triggerLen ?? (cfgRef as any).wmaLen ?? 20);
  const [slopeMethod, setSlopeMethod] = useState<string>(savedCfg.slopeMethod ?? "diff");
  const [slopeLookback, setSlopeLookback] = useState<number>(savedCfg.slopeLookback ?? 5);
  const [slopeMinPct, setSlopeMinPct] = useState<number>(savedCfg.slopeMinPct ?? 0.001);
  const [allowShort, setAllowShort] = useState<boolean>(savedCfg.allowShort ?? true);
  const [evalTicker, setEvalTicker] = useState("");
  const [results, setResults] = usePersistedState<TickerResult[]>("dualma:results", []);
  const [evalResult, setEvalResult] = usePersistedState<BacktestResult | null>("dualma:evalResult", null);
  const [activeTab, setActiveTab] = useState("optimize");
  const [running, setRunning] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState("sharpe");
  const [sortAsc, setSortAsc] = useState(false);
  const [dateRange] = useState(() => createDateRange());
  const cancelRef = useRef(false);
  const { universeTickers, isFiltered } = useUniverse();
  const filteredTickers = useMemo(
    () => (universeTickers ? tickers.filter(t => universeTickers.has(t.ticker)) : tickers),
    [tickers, universeTickers]
  );
  const classFilter = useOptimizerClassFilter(filteredTickers, mode === "universe", "dualma-clf");
  const pairComboPicker = usePairComboPicker(filteredTickers.map(t => t.ticker), mode === "pairCombo", "dualma-pc");
  const { frequency, setFrequency, frequencyUI } = useFrequency("dualma", "daily", running);

  useEffect(() => {
    getTickers().then(t => {
      setTickers(t);
      if (t.length > 0 && !tickerSetRef.current) {
        setSelectedTicker(t[0].ticker);
        setEvalTicker(t[0].ticker);
      }
      if (t.length > 0) {
        setPairTickerA(a => a || t[0].ticker);
        setPairTickerB(a => a || (t[1]?.ticker ?? t[0].ticker));
      }
    });
  }, []);

  const combosCount = useMemo(() => countGridCombos(GRID_CONFIGS[gridSize] ?? GRID_CONFIGS.quick), [gridSize]);

  useEffect(() => {
    setSavedCfg((c: typeof DEFAULT_CFG) => ({
      ...c,
      mode, gridSize,
      biasMAType, biasLen, triggerMAType, triggerLen,
      slopeMethod, slopeLookback, slopeMinPct, allowShort,
    }));
  }, [mode, gridSize, biasMAType, biasLen, triggerMAType, triggerLen, slopeMethod, slopeLookback, slopeMinPct, allowShort, setSavedCfg]);

  const serializeState = useCallback(
    () => ({
      selectedTicker, pairTickerA, pairTickerB,
      basketTickers, basketMode, mode, gridSize, results,
      expandedTicker, sortKey, sortAsc, evalTicker,
      evalBiasMAType: biasMAType, evalBiasLen: biasLen,
      evalTriggerMAType: triggerMAType, evalTriggerLen: triggerLen,
      evalSlopeMethod: slopeMethod, evalSlopeLookback: slopeLookback,
      evalSlopeMinPct: slopeMinPct, evalAllowShort: allowShort,
      frequency, pairCombo: pairComboPicker.serialize(),
      inputSelection,
    }),
    [
      selectedTicker, pairTickerA, pairTickerB,
      basketTickers, basketMode, mode, gridSize, results,
      expandedTicker, sortKey, sortAsc, evalTicker,
      biasMAType, biasLen, triggerMAType, triggerLen,
      slopeMethod, slopeLookback, slopeMinPct, allowShort,
      frequency, pairComboPicker, inputSelection,
    ]
  );

  const hydrateState = useCallback(
    (saved: any) => {
      if (!saved) return;
      if (saved.selectedTicker && typeof saved.selectedTicker === "string") {
        setSelectedTicker(saved.selectedTicker);
        tickerSetRef.current = true;
      }
      if (saved.evalTicker && typeof saved.evalTicker === "string") setEvalTicker(saved.evalTicker);
      if (saved.pairTickerA && typeof saved.pairTickerA === "string") setPairTickerA(saved.pairTickerA);
      if (saved.pairTickerB && typeof saved.pairTickerB === "string") setPairTickerB(saved.pairTickerB);
      if (saved.mode === "single" || saved.mode === "universe" || saved.mode === "pair" || saved.mode === "pairCombo" || saved.mode === "basket") setMode(saved.mode);
      if (saved.gridSize === "quick" || saved.gridSize === "standard" || saved.gridSize === "deep") setGridSize(saved.gridSize);
      if (saved.pairCombo) pairComboPicker.hydrate(saved.pairCombo);
      if (Array.isArray(saved.basketTickers)) setBasketTickers(saved.basketTickers.filter((t: any) => typeof t === "string"));
      if (saved.basketMode === "stocks" || saved.basketMode === "combined") setBasketMode(saved.basketMode);
      if (Array.isArray(saved.results)) setResults(saved.results);
      if (saved.expandedTicker !== undefined) setExpandedTicker(saved.expandedTicker);
      if (saved.sortKey && typeof saved.sortKey === "string") setSortKey(saved.sortKey);
      if (typeof saved.sortAsc === "boolean") setSortAsc(saved.sortAsc);
      if (typeof saved.evalBiasLen === "number") setBiasLen(saved.evalBiasLen);
      if (typeof saved.evalTriggerLen === "number") setTriggerLen(saved.evalTriggerLen);
      if (typeof saved.evalBiasMAType === "string" && MA_TYPES.includes(saved.evalBiasMAType)) setBiasMAType(saved.evalBiasMAType);
      if (typeof saved.evalTriggerMAType === "string" && MA_TYPES.includes(saved.evalTriggerMAType)) setTriggerMAType(saved.evalTriggerMAType);
      if (typeof saved.evalEmaLen === "number" && saved.evalBiasLen == null) setBiasLen(saved.evalEmaLen);
      if (typeof saved.evalWmaLen === "number" && saved.evalTriggerLen == null) setTriggerLen(saved.evalWmaLen);
      if (saved.evalSlopeMethod === "diff" || saved.evalSlopeMethod === "ols" || saved.evalSlopeMethod === "diff_pct") setSlopeMethod(saved.evalSlopeMethod);
      if (typeof saved.evalSlopeLookback === "number") setSlopeLookback(saved.evalSlopeLookback);
      if (typeof saved.evalSlopeMinPct === "number") setSlopeMinPct(saved.evalSlopeMinPct);
      if (typeof saved.evalAllowShort === "boolean") setAllowShort(saved.evalAllowShort);
      if (saved.frequency === "daily" || saved.frequency === "weekly" || saved.frequency === "weekly_on_daily") setFrequency(saved.frequency);
      if (saved.inputSelection && typeof saved.inputSelection === "object") {
        const sel = saved.inputSelection;
        if (sel.kind === "close") setInputSelection({ kind: "close" });
        else if (sel.kind === "workbook" && typeof sel.metric === "string") setInputSelection({ kind: "workbook", metric: sel.metric });
      }
    },
    [pairComboPicker, setResults, setFrequency, setInputSelection]
  );

  useWorkspaceTab("dual-ma-optimizer", serializeState, hydrateState);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResults([]);
    cancelRef.current = false;
    const dates = mode === "pair" || mode === "pairCombo" ? await getDates() : [];
    const gridCfg = GRID_CONFIGS[gridSize] ?? GRID_CONFIGS.quick;
    let tickerList: Array<{ ticker: string; name: string; pairA?: string; pairB?: string }>;

    if (mode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) { setRunning(false); return; }
      tickerList = [{ ticker: `${pairTickerA}/${pairTickerB}`, name: `${pairTickerA}/${pairTickerB}` }];
    } else if (mode === "pairCombo") {
      if (pairComboPicker.pairs.length === 0) { setRunning(false); return; }
      tickerList = pairComboPicker.pairs.map((r: any) => ({ ticker: r.label, name: r.label, pairA: r.a, pairB: r.b }));
    } else if (mode === "single") {
      tickerList = filteredTickers.filter(t => t.ticker === selectedTicker);
    } else if (mode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) { setRunning(false); return; }
        const bkt = buildBasketOhlc(basketTickers, baskets);
        tickerList = [{ ticker: `BASKET:${bkt.name}`, name: `BASKET:${bkt.name}` }];
      } else {
        tickerList = basketTickers.map(t => filteredTickers.find(m => m.ticker.toUpperCase() === t.toUpperCase()) ?? { ticker: t, name: t });
      }
    } else {
      tickerList = classFilter.filteredTickers;
    }

    if (tickerList.length === 0) { setRunning(false); return; }

    const basketObj = mode === "basket" && basketMode === "combined" ? buildBasketOhlc(basketTickers, baskets) : null;
    setProgress({ current: 0, total: tickerList.length });

    const out: TickerResult[] = [];
    for (let i = 0; i < tickerList.length && !cancelRef.current; i++) {
      const item = tickerList[i];
      setProgress({ current: i + 1, total: tickerList.length });
      if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      try {
        const isPair = mode === "pair" || mode === "pairCombo";
        const pA = isPair ? (item.pairA ?? pairTickerA) : "";
        const pB = isPair ? (item.pairB ?? pairTickerB) : "";
        let prices: number[] | null = null;

        if (isPair) {
          const allDates = dates.length ? dates : await getDates();
          const ratio = await getYahooPairsRatio(pA, pB, allDates);
          prices = ratio && ratio.prices.length >= 50 ? ratio.prices : null;
        } else if (basketObj && mode === "basket") {
          const ohlc = await getBasketOhlc(basketObj, dateRange);
          if (!ohlc || ohlc.closes.length < 50) continue;
          prices = ohlc.closes;
        } else if (inputSelection.kind === "workbook") {
          const ws = await getWorkbookSeries(item.ticker, inputSelection, { dateRange });
          if (!ws || ws.closes.length < 50) continue;
          prices = ws.closes;
        } else {
          const raw = await getTickerRaw(item.ticker);
          if (!raw || raw.adjCloses.length < 50) continue;
          prices = filterByDateRange(raw, dateRange).adjCloses;
        }

        if (!prices) continue;

        let series = prices;
        if (!isPair && frequency === "weekly") {
          const fakeDates = prices.map((_, idx) => `d${idx}`);
          series = resampleWeekly({ dates: fakeDates, closes: prices, adjCloses: prices }, "weekly").closes;
        } else if (!isPair && frequency === "weekly_on_daily") {
          const fakeDates = prices.map((_, idx) => `d${idx}`);
          series = weeklyDownsamplePrices(prices, fakeDates).prices;
        }

        if (series.length < 50) continue;

        const topResults = runGridSearch(series, gridCfg, topK);
        if (topResults.length === 0) continue;
        out.push({ ticker: item.ticker, name: (item as any).name ?? item.ticker, topK: topResults });
        if (i % 5 === 0 || i === tickerList.length - 1) setResults([...out]);
      } catch {}
    }
    setResults(out);
    setRunning(false);
  }, [filteredTickers, selectedTicker, pairTickerA, pairTickerB, basketTickers, basketMode, baskets, mode, gridSize, topK, frequency, dateRange, pairComboPicker.pairs, classFilter.filteredTickers, inputSelection]);

  const handleEvaluate = useCallback(async () => {
    setEvaluating(true);
    setEvalResult(null);
    try {
      let prices: number[];

      if (mode === "basket") {
        if (basketTickers.length === 0) { setEvaluating(false); return; }
        if (basketMode === "combined") {
          const bkt = buildBasketOhlc(basketTickers, baskets);
          const ohlc = await getBasketOhlc(bkt, dateRange);
          if (!ohlc || ohlc.closes.length < 50) { setEvaluating(false); return; }
          prices = ohlc.closes;
        } else {
          const first = basketTickers[0];
          const raw = await getTickerRaw(first);
          if (!raw || raw.adjCloses.length < 50) { setEvaluating(false); return; }
          prices = filterByDateRange(raw, dateRange).adjCloses;
        }
      } else {
        const ticker = evalTicker || selectedTicker || filteredTickers[0]?.ticker;
        if (!ticker) { setEvaluating(false); return; }
        if (inputSelection.kind === "workbook") {
          const ws = await getWorkbookSeries(ticker, inputSelection, { dateRange });
          if (!ws || ws.closes.length < 50) { setEvaluating(false); return; }
          prices = ws.closes;
        } else {
          const raw = await getTickerRaw(ticker);
          if (!raw || raw.adjCloses.length < 50) { setEvaluating(false); return; }
          prices = filterByDateRange(raw, dateRange).adjCloses;
        }
      }

      if (frequency === "weekly") {
        const fakeDates = prices.map((_, i) => `d${i}`);
        prices = resampleWeekly({ dates: fakeDates, closes: prices, adjCloses: prices }, "weekly").closes;
      } else if (frequency === "weekly_on_daily") {
        const fakeDates = prices.map((_, i) => `d${i}`);
        prices = weeklyDownsamplePrices(prices, fakeDates).prices;
      }

      if (prices.length < 50) { setEvaluating(false); return; }

      const result = runBacktest(prices, {
        biasMAType, biasLen, triggerMAType, triggerLen,
        slopeMethod, slopeLookback, slopeMinPct, allowShort,
      });
      setEvalResult(result);
    } catch {} finally {
      setEvaluating(false);
    }
  }, [evalTicker, selectedTicker, filteredTickers, biasMAType, biasLen, triggerMAType, triggerLen, slopeMethod, slopeLookback, slopeMinPct, allowShort, frequency, dateRange, inputSelection, mode, basketTickers, basketMode, baskets]);

  const sortedResults = useMemo(() => {
    const arr = [...results];
    arr.sort((a, b) => {
      const ta = a.topK[0], tb = b.topK[0];
      if (!ta || !tb) return 0;
      let va: number, vb: number;
      switch (sortKey) {
        case "sharpe": va = ta.stats.sharpe; vb = tb.stats.sharpe; break;
        case "totalReturn": va = ta.stats.totalReturn; vb = tb.stats.totalReturn; break;
        case "hitRate": va = ta.stats.hitRate; vb = tb.stats.hitRate; break;
        case "profitFactor": va = ta.stats.profitFactor; vb = tb.stats.profitFactor; break;
        case "maxDD": va = ta.stats.maxDD; vb = tb.stats.maxDD; break;
        case "nTrades": va = ta.stats.nTrades; vb = tb.stats.nTrades; break;
        case "ticker": return sortAsc ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
        default: va = ta.stats.sharpe; vb = tb.stats.sharpe;
      }
      if (!Number.isFinite(va)) va = -Infinity;
      if (!Number.isFinite(vb)) vb = -Infinity;
      return sortAsc ? va - vb : vb - va;
    });
    return arr;
  }, [results, sortKey, sortAsc]);

  function handleSortClick(key: string) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  function sortIcon(key: string) {
    if (sortKey !== key) return null;
    return <span className="ml-0.5">{sortAsc ? "↑" : "↓"}</span>;
  }

  const handleExportCSV = () => {
    if (sortedResults.length === 0) return;
    const rows = sortedResults.map(r => {
      const top = r.topK[0];
      return top ? {
        ticker: r.ticker, name: r.name,
        params: paramsLabel(top.params),
        nTrades: top.stats.nTrades, hitRate: top.stats.hitRate,
        meanRet: top.stats.meanRet, sharpe: top.stats.sharpe,
        profitFactor: top.stats.profitFactor, maxDD: top.stats.maxDD,
        totalReturn: top.stats.totalReturn, buyHoldReturn: top.stats.buyHoldReturn,
      } : null;
    }).filter(Boolean) as any[];
    const keys = Object.keys(rows[0] ?? {});
    const csv = [keys.join(","), ...rows.map(r => keys.map(k => `"${String(r[k] ?? "")}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "dualma_optimizer.csv";
    a.click();
  };

  const equityChartData = useMemo(() => {
    if (!evalResult) return [];
    const step = Math.max(1, Math.floor(evalResult.equity.length / 500));
    return evalResult.equity
      .filter((_, i) => i % step === 0)
      .map((v, i) => ({ bar: i * step, equity: +v.toFixed(4) }));
  }, [evalResult]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">DualMA Optimizer</h2>
        <div className="flex gap-px">
          <button
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${activeTab === "optimize" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setActiveTab("optimize")}
          >Optimize</button>
          <button
            className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${activeTab === "evaluate" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            onClick={() => setActiveTab("evaluate")}
          >Evaluate</button>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {activeTab === "optimize" ? "Grid-search EMA/WMA parameter space" : "Run one specific DualMA config"}
        </span>
      </div>

      {/* Optimize tab */}
      {activeTab === "optimize" && (
        <>
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-start gap-4 flex-wrap">
              {/* Grid Size */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Grid Size</label>
                <div className="flex gap-px">
                  {(["quick", "standard", "deep"] as const).map(s => (
                    <button
                      key={s}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${gridSize === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setGridSize(s)}
                      disabled={running}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                <span className="text-[9px] font-mono text-muted-foreground">{combosCount} combos</span>
              </div>

              {/* Mode */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
                <div className="flex gap-px flex-wrap">
                  {(["single", "universe", "pair", "pairCombo", "basket"] as const).map(m => (
                    <button
                      key={m}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                      onClick={() => setMode(m)}
                      disabled={running}
                    >
                      {m === "single" ? "Single" : m === "universe" ? "Universe" : m === "pair" ? "Pair" : m === "pairCombo" ? "Pair Combo" : "Basket"}
                    </button>
                  ))}
                </div>
              </div>

              {frequencyUI}

              {/* Single mode */}
              {mode === "single" && (
                <div className="flex items-end gap-2">
                  <div className={isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
                    <UnifiedTickerPicker
                      tickers={filteredTickers}
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
                      fallbackTicker={filteredTickers[0]?.ticker ?? null}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                    <InputSeriesPicker
                      value={inputSelection}
                      onChange={setInputSelection}
                      family="dual_ma"
                      label=""
                    />
                  </div>
                </div>
              )}

              {/* Pair mode */}
              {mode === "pair" && (
                <div className="flex items-end gap-2">
                  <UnifiedTickerPicker tickers={filteredTickers} value={pairTickerA} onChange={setPairTickerA} disabled={running} label="A" />
                  <UnifiedTickerPicker tickers={filteredTickers} value={pairTickerB} onChange={setPairTickerB} disabled={running} label="B" />
                </div>
              )}

              {/* Pair combo mode */}
              {mode === "pairCombo" && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Pair Combo — Leg Set</label>
                  {pairComboPicker.ui}
                </div>
              )}

              {/* Basket mode */}
              {mode === "basket" && (
                <div className="flex flex-col gap-2">
                  <BasketPicker
                    tickers={filteredTickers}
                    value={basketTickers}
                    onChange={setBasketTickers}
                    disabled={running}
                    testIdPrefix="dualma-basket"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket Run Mode</label>
                    <div className="flex gap-px" data-testid="dualma-basket-mode">
                      {(["stocks", "combined"] as const).map(m => (
                        <button
                          key={m}
                          data-testid={`dualma-basket-mode-${m}`}
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

              {/* Universe classification filter */}
              {mode === "universe" && classFilter.classFilterUI && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Classification Filter</label>
                  {classFilter.universeSourceUI}
                  {classFilter.classFilterUI}
                </div>
              )}

              {isFiltered && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30 self-end mb-1">
                  {filteredTickers.length}/{tickers.length}
                </span>
              )}

              {/* Run / Cancel */}
              <div className="flex flex-col gap-0.5 ml-auto">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                {running ? (
                  <button
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500"
                    onClick={() => { cancelRef.current = true; }}
                  >
                    Cancel ({progress.current}/{progress.total})
                  </button>
                ) : (
                  <button
                    className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={handleRun}
                  >
                    Run
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto px-4 py-3">
            {results.length === 0 && !running && (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                EMA-bias + WMA-trigger dual moving average strategy grid search
              </div>
            )}
            {running && results.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">Running grid search…</div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {progress.current}/{progress.total} tickers × {combosCount} combos
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
                    {sortedResults.length} tickers — {gridSize} grid — top-{topK} per ticker
                  </h3>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={handleExportCSV}>
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto border border-border rounded mb-4">
                  <table className="w-full text-[10px] font-mono">
                    <thead>
                      <tr className="bg-card text-muted-foreground">
                        <th className="text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border cursor-pointer" onClick={() => handleSortClick("ticker")}>
                          Ticker {sortIcon("ticker")}
                        </th>
                        <th className="text-left px-2 py-1 font-bold">Best Params</th>
                        <th className="text-center px-2 py-1 font-bold cursor-pointer" onClick={() => handleSortClick("nTrades")}>
                          Trades {sortIcon("nTrades")}
                        </th>
                        <th className="text-center px-2 py-1 font-bold cursor-pointer" onClick={() => handleSortClick("hitRate")}>
                          Hit% {sortIcon("hitRate")}
                        </th>
                        <th className="text-center px-2 py-1 font-bold">Mean Ret</th>
                        <th className="text-center px-2 py-1 font-bold cursor-pointer" onClick={() => handleSortClick("sharpe")}>
                          Sharpe {sortIcon("sharpe")}
                        </th>
                        <th className="text-center px-2 py-1 font-bold cursor-pointer" onClick={() => handleSortClick("profitFactor")}>
                          PF {sortIcon("profitFactor")}
                        </th>
                        <th className="text-center px-2 py-1 font-bold cursor-pointer" onClick={() => handleSortClick("maxDD")}>
                          MaxDD {sortIcon("maxDD")}
                        </th>
                        <th className="text-center px-2 py-1 font-bold cursor-pointer" onClick={() => handleSortClick("totalReturn")}>
                          Total Ret {sortIcon("totalReturn")}
                        </th>
                        <th className="text-center px-2 py-1 font-bold">vs B&H</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedResults.map(r => {
                        const top = r.topK[0];
                        if (!top) return null;
                        const expanded = expandedTicker === r.ticker;
                        const vsAlpha =
                          Number.isFinite(top.stats.totalReturn) && Number.isFinite(top.stats.buyHoldReturn)
                            ? top.stats.totalReturn - top.stats.buyHoldReturn
                            : NaN;
                        return (
                          <React.Fragment key={r.ticker}>
                            <tr
                              className={`${expanded ? "bg-primary/10" : "hover:bg-white/5"} cursor-pointer border-b border-border/30`}
                              onClick={() => setExpandedTicker(expanded ? null : r.ticker)}
                            >
                              <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border">
                                {r.ticker}
                                <span className="ml-1 text-[8px] text-muted-foreground">{expanded ? "▲" : "▼"}</span>
                              </td>
                              <td className="px-2 py-1 text-muted-foreground max-w-[200px] truncate">{paramsLabel(top.params)}</td>
                              <td className="text-center px-2 py-1">{top.stats.nTrades}</td>
                              <td className={`text-center px-2 py-1 ${top.stats.hitRate >= 0.5 ? "text-green-400" : "text-red-400"}`}>{fmtPct(top.stats.hitRate)}</td>
                              <td className={`text-center px-2 py-1 ${signedColor(top.stats.meanRet)}`}>{fmtPctSigned(top.stats.meanRet)}</td>
                              <td className={`text-center px-2 py-1 ${sharpeColor(top.stats.sharpe)}`}>{fmtNum(top.stats.sharpe)}</td>
                              <td className={`text-center px-2 py-1 ${top.stats.profitFactor >= 1 ? "text-green-400" : "text-red-400"}`}>
                                {Number.isFinite(top.stats.profitFactor) ? top.stats.profitFactor > 99 ? "∞" : fmtNum(top.stats.profitFactor) : "–"}
                              </td>
                              <td className={`text-center px-2 py-1 ${drawdownColor(top.stats.maxDD)}`}>{fmtPct(top.stats.maxDD)}</td>
                              <td className={`text-center px-2 py-1 ${signedColor(top.stats.totalReturn)}`}>{fmtPctSigned(top.stats.totalReturn)}</td>
                              <td className={`text-center px-2 py-1 ${Number.isFinite(vsAlpha) ? vsAlpha >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground"}`}>
                                {Number.isFinite(vsAlpha) ? fmtPctSigned(vsAlpha) : "–"}
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="bg-card/50">
                                <td colSpan={10} className="px-3 py-2">
                                  <div className="text-[9px] font-mono text-muted-foreground mb-1 uppercase tracking-wider">
                                    Top-{r.topK.length} configs (sorted by Sharpe)
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-[9px] font-mono">
                                      <thead>
                                        <tr className="text-muted-foreground border-b border-border/30">
                                          <th className="text-left px-1 py-0.5">#</th>
                                          <th className="text-left px-1 py-0.5">Params</th>
                                          <th className="text-center px-1 py-0.5">Trades</th>
                                          <th className="text-center px-1 py-0.5">Hit%</th>
                                          <th className="text-center px-1 py-0.5">Mean Ret</th>
                                          <th className="text-center px-1 py-0.5">Sharpe</th>
                                          <th className="text-center px-1 py-0.5">PF</th>
                                          <th className="text-center px-1 py-0.5">MaxDD</th>
                                          <th className="text-center px-1 py-0.5">Total Ret</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {r.topK.map((res, idx) => (
                                          <tr key={idx} className="hover:bg-white/5 border-b border-border/10">
                                            <td className="px-1 py-0.5 text-muted-foreground">{idx + 1}</td>
                                            <td className="px-1 py-0.5 text-foreground max-w-[220px] truncate">{paramsLabel(res.params)}</td>
                                            <td className="text-center px-1 py-0.5">{res.stats.nTrades}</td>
                                            <td className={`text-center px-1 py-0.5 ${res.stats.hitRate >= 0.5 ? "text-green-400" : "text-red-400"}`}>{fmtPct(res.stats.hitRate)}</td>
                                            <td className={`text-center px-1 py-0.5 ${signedColor(res.stats.meanRet)}`}>{fmtPctSigned(res.stats.meanRet)}</td>
                                            <td className={`text-center px-1 py-0.5 ${sharpeColor(res.stats.sharpe)}`}>{fmtNum(res.stats.sharpe)}</td>
                                            <td className={`text-center px-1 py-0.5 ${res.stats.profitFactor >= 1 ? "text-green-400" : "text-red-400"}`}>
                                              {Number.isFinite(res.stats.profitFactor) ? res.stats.profitFactor > 99 ? "∞" : fmtNum(res.stats.profitFactor) : "–"}
                                            </td>
                                            <td className={`text-center px-1 py-0.5 ${drawdownColor(res.stats.maxDD)}`}>{fmtPct(res.stats.maxDD)}</td>
                                            <td className={`text-center px-1 py-0.5 ${signedColor(res.stats.totalReturn)}`}>{fmtPctSigned(res.stats.totalReturn)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Evaluate tab */}
      {activeTab === "evaluate" && (
        <>
          <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
            <div className="flex items-start gap-4 flex-wrap">
              {/* Ticker */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker</label>
                <select
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]"
                  value={evalTicker || selectedTicker}
                  onChange={e => setEvalTicker(e.target.value)}
                  disabled={evaluating}
                >
                  {filteredTickers.map(t => (
                    <option key={t.ticker} value={t.ticker}>{t.ticker}</option>
                  ))}
                </select>
              </div>

              {/* Input Series */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                <InputSeriesPicker
                  value={inputSelection}
                  onChange={setInputSelection}
                  family="dual_ma"
                  label=""
                  disabled={evaluating}
                />
              </div>

              {frequencyUI}

              {/* Bias MA */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Bias MA</label>
                <select
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1"
                  value={biasMAType}
                  onChange={e => setBiasMAType(e.target.value)}
                  disabled={evaluating}
                >
                  {(MA_TYPES as string[]).map((t: string) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Bias Len */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Bias Len</label>
                <input
                  type="number" min={2} max={500} step={1} value={biasLen}
                  onChange={e => setBiasLen(Math.max(2, parseInt(e.target.value, 10) || 50))}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 w-[70px]"
                  disabled={evaluating}
                />
              </div>

              {/* Trigger MA */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Trigger MA</label>
                <select
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1"
                  value={triggerMAType}
                  onChange={e => setTriggerMAType(e.target.value)}
                  disabled={evaluating}
                >
                  {(MA_TYPES as string[]).map((t: string) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Trigger Len */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Trigger Len</label>
                <input
                  type="number" min={2} max={500} step={1} value={triggerLen}
                  onChange={e => setTriggerLen(Math.max(2, parseInt(e.target.value, 10) || 20))}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 w-[70px]"
                  disabled={evaluating}
                />
              </div>

              {/* Slope Method */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Slope Method</label>
                <select
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1"
                  value={slopeMethod}
                  onChange={e => setSlopeMethod(e.target.value)}
                  disabled={evaluating}
                >
                  {Object.entries(SLOPE_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* Slope LB */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Slope LB</label>
                <input
                  type="number" min={1} max={100} step={1} value={slopeLookback}
                  onChange={e => setSlopeLookback(Math.max(1, parseInt(e.target.value, 10) || 5))}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 w-[65px]"
                  disabled={evaluating}
                />
              </div>

              {/* Min Slope% (diff_pct only) */}
              {slopeMethod === "diff_pct" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min Slope%</label>
                  <input
                    type="number" min={0} max={1} step={1e-4} value={slopeMinPct}
                    onChange={e => setSlopeMinPct(parseFloat(e.target.value) || 0.001)}
                    className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 w-[80px]"
                    disabled={evaluating}
                  />
                </div>
              )}

              {/* Allow Short */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Allow Short</label>
                <div className="flex items-center gap-1 py-1">
                  <Switch checked={allowShort} onCheckedChange={setAllowShort} disabled={evaluating} />
                  <span className="text-[10px] font-mono text-muted-foreground">{allowShort ? "Yes" : "No"}</span>
                </div>
              </div>

              {/* Evaluate button */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
                <button
                  className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={handleEvaluate}
                  disabled={evaluating}
                >
                  {evaluating ? "Evaluating…" : "Evaluate"}
                </button>
              </div>
            </div>
          </div>

          {/* Eval results */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {!evalResult && !evaluating && (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Configure params above and click Evaluate
              </div>
            )}
            {evaluating && (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Running backtest…
              </div>
            )}
            {evalResult && (
              <>
                <div className="border border-border rounded p-3 bg-card/50">
                  <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
                    {paramsLabel(evalResult.params)}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    {[
                      { label: "Trades", value: String(evalResult.stats.nTrades) },
                      { label: "Hit Rate", value: fmtPct(evalResult.stats.hitRate), color: evalResult.stats.hitRate >= 0.5 ? "text-green-400" : "text-red-400" },
                      { label: "Mean Ret", value: fmtPctSigned(evalResult.stats.meanRet), color: signedColor(evalResult.stats.meanRet) },
                      { label: "Sharpe", value: fmtNum(evalResult.stats.sharpe), color: sharpeColor(evalResult.stats.sharpe) },
                      { label: "Profit Factor", value: Number.isFinite(evalResult.stats.profitFactor) ? evalResult.stats.profitFactor > 99 ? "∞" : fmtNum(evalResult.stats.profitFactor) : "–", color: evalResult.stats.profitFactor >= 1 ? "text-green-400" : "text-red-400" },
                      { label: "Max DD", value: fmtPct(evalResult.stats.maxDD), color: drawdownColor(evalResult.stats.maxDD) },
                      { label: "Total Ret", value: fmtPctSigned(evalResult.stats.totalReturn), color: signedColor(evalResult.stats.totalReturn) },
                      { label: "Buy & Hold", value: fmtPctSigned(evalResult.stats.buyHoldReturn), color: signedColor(evalResult.stats.buyHoldReturn) },
                      { label: "Ann. Return", value: fmtPctSigned(evalResult.stats.annualReturn), color: signedColor(evalResult.stats.annualReturn) },
                      { label: "Ann. Vol", value: fmtPct(evalResult.stats.annualVol) },
                      { label: "Time in Mkt", value: fmtPct(evalResult.stats.timeInMarket) },
                      { label: "Win Ret", value: fmtPctSigned(evalResult.stats.winRet), color: "text-green-400" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex flex-col gap-0.5">
                        <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
                        <span className={`text-[12px] font-mono font-bold ${color ?? "text-foreground"}`}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {equityChartData.length > 1 && (
                  <div className="border border-border rounded p-3 bg-card/50">
                    <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Equity Curve</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={equityChartData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="bar" tick={{ fontSize: 9, fill: "#888" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: "#888" }} tickLine={false} axisLine={false} tickFormatter={(v: any) => v.toFixed(2)} width={44} />
                        <Tooltip
                          contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 4, fontSize: 10 }}
                          formatter={(v: any) => [v.toFixed(4), "Equity"]}
                          labelFormatter={(v: any) => `Bar ${v}`}
                        />
                        <Line type="monotone" dataKey="equity" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {evalResult.trades.length > 0 && (
                  <div className="border border-border rounded p-3 bg-card/50">
                    <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
                      Last {Math.min(50, evalResult.trades.length)} of {evalResult.trades.length} Trades
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[9px] font-mono">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border/30">
                            <th className="text-left px-1 py-0.5">#</th>
                            <th className="text-center px-1 py-0.5">Side</th>
                            <th className="text-center px-1 py-0.5">Entry Bar</th>
                            <th className="text-center px-1 py-0.5">Exit Bar</th>
                            <th className="text-center px-1 py-0.5">Bars</th>
                            <th className="text-right px-1 py-0.5">Entry Px</th>
                            <th className="text-right px-1 py-0.5">Exit Px</th>
                            <th className="text-right px-1 py-0.5">Return</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evalResult.trades.slice(-50).map((t, i) => {
                            const globalIdx = evalResult.trades.length - Math.min(50, evalResult.trades.length) + i;
                            return (
                              <tr
                                key={globalIdx}
                                className={`border-b border-border/10 ${t.ret >= 0 ? "hover:bg-green-900/10" : "hover:bg-red-900/10"}`}
                              >
                                <td className="px-1 py-0.5 text-muted-foreground">{globalIdx + 1}</td>
                                <td className="text-center px-1 py-0.5">
                                  <span className={`px-1 rounded text-[8px] font-bold ${t.side === "long" ? "bg-blue-600/20 text-blue-400" : "bg-orange-600/20 text-orange-400"}`}>
                                    {t.side}
                                  </span>
                                </td>
                                <td className="text-center px-1 py-0.5">{t.entryIdx}</td>
                                <td className="text-center px-1 py-0.5">{t.exitIdx}</td>
                                <td className="text-center px-1 py-0.5">{t.bars}</td>
                                <td className="text-right px-1 py-0.5">{t.entryPrice.toFixed(2)}</td>
                                <td className="text-right px-1 py-0.5">{t.exitPrice.toFixed(2)}</td>
                                <td className={`text-right px-1 py-0.5 font-bold ${t.ret >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {fmtPctSigned(t.ret)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
