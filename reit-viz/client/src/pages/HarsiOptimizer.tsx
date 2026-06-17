// Reconstructed from recovered-bundle/HarsiOptimizer-BXuhMFq0.js on 2026-06-11
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import React from "react";
import {
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
import type { SignalSummary, CompositeScore } from "@/lib/forwardReturns";
import { TARGET_RETURN_OPTIONS } from "@/lib/optimizerConstants";
import { filterByDateRange, createDateRange, defaultInputSelection, resampleWeekly } from "@/lib/optimizerInputSeries";
import { getTickers, getDates, getTickerRaw, refreshTickerData } from "@/lib/dataService";
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
import { weeklyDownsample as weeklyDownsampleFn } from "@/lib/weeklyDownsample";
const weeklyDownsampleD = weeklyDownsampleFn as any;
import { fetchWorkbookSeriesForTicker as fetchWorkbookSeriesForTickerFn } from "@/lib/fetchWorkbookSeriesForTicker";
const fetchWorkbookSeriesForTicker = fetchWorkbookSeriesForTickerFn as any;
import { P as PresetBar } from "@/components/PresetBar";
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { B as BasketTickerPill } from "@/components/BasketTickerPill";
import {
  e as evaluateSignals,
  E as EvaluatorResultPanel,
  H as HitConditionsPanel,
} from "@/components/EvaluatorPanel";
import { B as BasketPicker } from "@/components/BasketPicker";
import { InputSeriesPicker } from "@/components/InputSeriesPicker";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import "@/lib/harsi";
import "@/lib/tva";

// ── Constants ─────────────────────────────────────────────────────────────────

const SIGNAL_KIND_LABELS: Record<string, string> = {
  rsi_threshold: "RSI OB/OS Cross",
  stoch_kd_cross: "Stoch K-D Cross",
  ha_flip: "HA Color Flip",
  composite: "Composite (RSI + Stoch)",
};

const SIGNAL_KIND_DESCRIPTIONS: Record<string, string> = {
  rsi_threshold:
    "Long when smoothed RSI crosses up through OS threshold (negative). Short when it crosses down through OB threshold (positive).",
  stoch_kd_cross:
    "Long when %K crosses above %D in OS zone (both negative). Short when %K crosses below %D in OB zone.",
  ha_flip:
    "HA candle color change (haClose crossing zero). Optional N-bar confirmation requires same color for N bars.",
  composite:
    "Long when smoothed RSI is in OS AND %K below %D within last L bars (agreement). Short symmetric.",
};

const GRID_PRESETS: Record<string, any> = {
  quick: {
    candleLength: [14],
    candleSmoothing: [1, 2, 3, 4, 5],
    rsiLength: [7, 14],
    stochLength: [14],
    smoothK: [3],
    smoothD: [3],
    obThresholds: [20, 25],
    osThresholds: [-20, -25],
    confirmation: [0, 1],
    compositeLookback: [3, 5],
  },
  standard: {
    candleLength: [10, 14, 21],
    candleSmoothing: [1, 2, 3, 4, 5, 6, 7, 8],
    rsiLength: [7, 9, 14],
    stochLength: [10, 14, 21],
    smoothK: [3, 5],
    smoothD: [3, 5],
    obThresholds: [15, 20, 25, 30],
    osThresholds: [-15, -20, -25, -30],
    confirmation: [0, 1, 2],
    compositeLookback: [3, 5, 8],
  },
  deep: {
    candleLength: [8, 10, 12, 14, 18, 21, 28],
    candleSmoothing: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    rsiLength: [5, 7, 9, 14],
    stochLength: [10, 14, 21],
    smoothK: [2, 3, 5],
    smoothD: [2, 3, 5],
    obThresholds: [15, 20, 25, 30],
    osThresholds: [-15, -20, -25, -30],
    confirmation: [0, 1, 2],
    compositeLookback: [3, 5, 8],
  },
};

const SIGNAL_KINDS = ["rsi_threshold", "stoch_kd_cross", "ha_flip", "composite"];
const GRID_SIZES = ["quick", "standard", "deep"];
const GRID_SIZE_LABELS: Record<string, string> = { quick: "Quick", standard: "Standard", deep: "Deep" };

// ── Helper: count combos ───────────────────────────────────────────────────────

function countCombos(grid: any, kind: string): number {
  const a = grid.candleLength.length;
  const S = grid.candleSmoothing.length;
  const y = grid.rsiLength.length;
  const c = grid.stochLength.length;
  const x = grid.smoothK.length;
  const l = grid.smoothD.length;
  const s = grid.obThresholds.length;
  const i = grid.osThresholds.length;
  const o = grid.confirmation.length;
  const j = grid.compositeLookback.length;
  switch (kind) {
    case "rsi_threshold":
      return a * y * s * i;
    case "stoch_kd_cross":
      return a * y * c * x * l * s * i;
    case "ha_flip":
      return a * S * o;
    case "composite":
      return a * y * c * x * l * s * i * j;
    default:
      return 0;
  }
}

// ── Signal detection helpers (used for evaluate) ───────────────────────────────

function detectRsiThresholdSignals(
  rsi: (number | null)[],
  obThreshold: number,
  osThreshold: number,
  minIdx: number
): { index: number; direction: string }[] {
  const result: { index: number; direction: string }[] = [];
  for (let i = Math.max(1, minIdx); i < rsi.length; i++) {
    const cur = rsi[i];
    const prev = rsi[i - 1];
    if (cur === null || prev === null) continue;
    if (prev <= osThreshold && cur > osThreshold) result.push({ index: i, direction: "buy" });
    else if (prev >= obThreshold && cur < obThreshold) result.push({ index: i, direction: "sell" });
  }
  return result;
}

function detectStochKDCross(
  stochK: (number | null)[],
  stochD: (number | null)[],
  obThreshold: number,
  osThreshold: number,
  minIdx: number
): { index: number; direction: string }[] {
  const result: { index: number; direction: string }[] = [];
  for (let i = Math.max(1, minIdx); i < stochK.length; i++) {
    const kCur = stochK[i];
    const kPrev = stochK[i - 1];
    const dCur = stochD[i];
    const dPrev = stochD[i - 1];
    if (kCur === null || kPrev === null || dCur === null || dPrev === null) continue;
    const crossUp = kPrev <= dPrev && kCur > dCur;
    const crossDown = kPrev >= dPrev && kCur < dCur;
    if (crossUp && kCur < osThreshold && dCur < osThreshold)
      result.push({ index: i, direction: "buy" });
    else if (crossDown && kCur > obThreshold && dCur > obThreshold)
      result.push({ index: i, direction: "sell" });
  }
  return result;
}

function detectHaFlip(
  haClose: (number | null)[],
  haOpen: (number | null)[],
  confirmation: number,
  minIdx: number
): { index: number; direction: string }[] {
  const result: { index: number; direction: string }[] = [];
  let signTracker = 0;
  let consecutiveCount = 0;
  let lastDir: string | null = null;
  let flipStart = -1;
  for (let i = Math.max(0, minIdx); i < haClose.length; i++) {
    const hc = haClose[i];
    const ho = haOpen[i];
    if (hc === null || ho === null) {
      signTracker = 0;
      lastDir = null;
      consecutiveCount = 0;
      continue;
    }
    const diff = hc - ho;
    const dir = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    if (dir === 0) {
      if (lastDir) consecutiveCount += 1;
      continue;
    }
    if (signTracker === 0) {
      signTracker = dir;
      continue;
    }
    if (dir !== signTracker) {
      lastDir = dir > 0 ? "buy" : "sell";
      flipStart = i;
      consecutiveCount = 0;
      signTracker = dir;
    } else if (lastDir) consecutiveCount += 1;
    if (lastDir && consecutiveCount >= confirmation) {
      const emitIdx = flipStart + confirmation;
      if (emitIdx < haClose.length) result.push({ index: emitIdx, direction: lastDir });
      lastDir = null;
      consecutiveCount = 0;
    }
  }
  return result;
}

function detectComposite(
  rsi: (number | null)[],
  stochK: (number | null)[],
  stochD: (number | null)[],
  obThreshold: number,
  osThreshold: number,
  lookback: number,
  minIdx: number
): { index: number; direction: string }[] {
  const result: { index: number; direction: string }[] = [];
  const lb = Math.max(1, lookback);
  let lastEmit = "none";
  for (let i = Math.max(1, minIdx); i < rsi.length; i++) {
    const rsiVal = rsi[i];
    if (rsiVal === null) {
      lastEmit = "none";
      continue;
    }
    let hasBuyStoch = false;
    let hasSellStoch = false;
    for (let f = i; f > Math.max(0, i - lb); f--) {
      const k = stochK[f];
      const d = stochD[f];
      if (k !== null && d !== null) {
        if (k < d) hasBuyStoch = true;
        if (k > d) hasSellStoch = true;
      }
    }
    let sig = "none";
    if (rsiVal <= osThreshold && hasBuyStoch) sig = "buy";
    else if (rsiVal >= obThreshold && hasSellStoch) sig = "sell";
    if (sig !== "none" && sig !== lastEmit) result.push({ index: i, direction: sig });
    lastEmit = sig;
  }
  return result;
}

// ── Worker factory ─────────────────────────────────────────────────────────────

function createHarsiWorker(opts?: { name?: string }): Worker {
  return new Worker(
    "" + new URL("harsiOptimizer.worker-D5NE8xS_.js", import.meta.url).href,
    { name: opts?.name }
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface HarsiCategoryResult {
  category: string; // "buy" | "sell"
  summary: SignalSummary;
  composite: CompositeScore;
  profiles?: any[];
}

interface HarsiConfig {
  kind: string;
  configLabel: string;
  configKey: string;
  categories: HarsiCategoryResult[];
  bestScore: number;
}

interface HarsiTickerResult {
  ticker: string;
  name?: string;
  kind: string;
  configs: HarsiConfig[];
  currentSignal: string;
  currentRsi: number | null;
  currentStochK: number | null;
  currentStochD: number | null;
  currentHaClose: number | null;
}

interface ProcessedRow {
  tr: HarsiTickerResult;
  longBest: { cfg: HarsiConfig; summary: SignalSummary; score: number; comp: CompositeScore } | null;
  shortBest: { cfg: HarsiConfig; summary: SignalSummary; score: number; comp: CompositeScore } | null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface HarsiDetailPanelProps {
  tr: HarsiTickerResult;
  horizons: typeof FORWARD_HORIZONS;
  useBand: boolean;
  priceContext: any;
  hitConditionsOpen: Set<string>;
  toggleHitConditions: (key: string) => void;
}

function HarsiDetailPanel({
  tr,
  horizons,
  useBand,
  priceContext,
  hitConditionsOpen,
  toggleHitConditions,
}: HarsiDetailPanelProps) {
  const topConfigs = useMemo(
    () => [...tr.configs].sort((a, b) => b.bestScore - a.bestScore).slice(0, 8),
    [tr.configs]
  );
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Top configs for {tr.ticker} · {SIGNAL_KIND_LABELS[tr.kind]}
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-2 py-1">Config</th>
            <th className="text-left px-2 py-1">Side</th>
            <th className="text-right px-2 py-1">Score</th>
            <th className="text-right px-2 py-1">Sigs</th>
            {horizons.map((h) => (
              <th key={"hh" + h.label} className="text-right px-1.5 py-1">
                {h.label}
              </th>
            ))}
            <th className="text-right px-2 py-1">PF best</th>
          </tr>
        </thead>
        <tbody>
          {topConfigs.map((cfg) => {
            const bestCat = cfg.categories.reduce(
              (a, b) => (a.composite.score > b.composite.score ? a : b)
            );
            const summary = bestCat.summary;
            const bestPF = Math.max(...horizons.map((h) => summary.profitFactor[h.label] ?? 0));
            const expandKey = `${tr.ticker}::${cfg.configLabel}::${bestCat.category}`;
            const isOpen = hitConditionsOpen.has(expandKey);
            const hasProfiles = !!(bestCat.profiles && bestCat.profiles.length >= 10 && priceContext);
            return (
              <React.Fragment key={cfg.configKey}>
                <tr className="border-b border-border/40">
                  <td
                    className="px-2 py-1 truncate max-w-[280px]"
                    title={cfg.configLabel}
                  >
                    {cfg.configLabel}
                  </td>
                  <td className="px-2 py-1">
                    <span
                      className={
                        bestCat.category === "buy" ? "text-emerald-400" : "text-rose-400"
                      }
                    >
                      {bestCat.category === "buy" ? "Long" : "Short"}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    <span
                      style={{
                        backgroundColor: scoreBackgroundColor(bestCat.composite.score),
                        color: scoreTextColor(bestCat.composite.score),
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontWeight: 600,
                      }}
                    >
                      {bestCat.composite.score}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{summary.count}</td>
                  {horizons.map((h) => {
                    const val = useBand
                      ? (summary as any).bandHitRate?.[h.label] ?? summary.hitRate[h.label]
                      : summary.hitRate[h.label];
                    return (
                      <td
                        key={"hh" + h.label + cfg.configKey}
                        className={`px-1.5 py-1 text-right tabular-nums ${hitRateColor(val)}`}
                      >
                        {(val * 100).toFixed(0)}%
                      </td>
                    );
                  })}
                  <td className={`px-2 py-1 text-right tabular-nums ${profitFactorColor(bestPF)}`}>
                    {hasProfiles ? (
                      <button
                        type="button"
                        onClick={() => toggleHitConditions(expandKey)}
                        className={`mr-2 px-1.5 py-0.5 rounded text-[9px] font-bold border align-middle ${
                          isOpen
                            ? "bg-violet-500/25 text-violet-200 border-violet-400/40"
                            : "bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"
                        }`}
                        title="Profile what other indicators looked like at hit-bars vs miss-bars"
                      >
                        {isOpen ? "▾" : "▸"} HC
                      </button>
                    ) : null}
                    {bestPF.toFixed(2)}
                  </td>
                </tr>
                {isOpen && hasProfiles && priceContext && bestCat.profiles ? (
                  <tr className="border-b border-border/40 bg-muted/10">
                    <td colSpan={5 + horizons.length} className="px-2 py-2">
                      <HitConditionsPanel
                        ticker={
                          priceContext.mode === "pair" && priceContext.pairLegA
                            ? priceContext.pairLegA
                            : tr.ticker
                        }
                        priceContext={priceContext}
                        signals={bestCat.profiles}
                        direction={bestCat.category}
                        title={`${cfg.configLabel} — ${bestCat.category === "buy" ? "Long" : "Short"}`}
                        useBand={useBand}
                      />
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface HarsiRowProps {
  er: ProcessedRow;
  best: { side: string; cfg: HarsiConfig; summary: SignalSummary; score: number; comp: CompositeScore };
  expanded: boolean;
  onToggle: () => void;
  horizons: typeof FORWARD_HORIZONS;
  useBand: boolean;
  priceContext: any;
  hitConditionsOpen: Set<string>;
  toggleHitConditions: (key: string) => void;
}

function HarsiRow({
  er,
  best,
  expanded,
  onToggle,
  horizons,
  useBand,
  priceContext,
  hitConditionsOpen,
  toggleHitConditions,
}: HarsiRowProps) {
  const tr = er.tr;
  return (
    <React.Fragment>
      <tr
        className="border-b border-border/50 hover:bg-accent/40 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-1.5 font-mono font-semibold">{tr.ticker}</td>
        <td className="px-2 py-1.5">
          <span
            className={
              tr.currentSignal.startsWith("→ Buy")
                ? "text-emerald-400 font-semibold"
                : tr.currentSignal.startsWith("→ Sell")
                ? "text-rose-400 font-semibold"
                : "text-muted-foreground"
            }
          >
            {tr.currentSignal}
          </span>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {tr.currentRsi !== null ? tr.currentRsi.toFixed(1) : "—"}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {tr.currentStochK !== null ? tr.currentStochK.toFixed(1) : "—"}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {tr.currentStochD !== null ? tr.currentStochD.toFixed(1) : "—"}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {tr.currentHaClose !== null ? tr.currentHaClose.toFixed(1) : "—"}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          <span
            style={{
              backgroundColor: scoreBackgroundColor(best.score),
              color: scoreTextColor(best.score),
              padding: "1px 6px",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            {best.score}
          </span>
        </td>
        <td className="px-2 py-1.5 max-w-[260px] truncate" title={best.cfg.configLabel}>
          {best.cfg.configLabel}
        </td>
        <td className="px-2 py-1.5">
          <span className={best.side === "Long" ? "text-emerald-400" : "text-rose-400"}>
            {best.side}
          </span>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{best.summary.count}</td>
        {horizons.map((h) => {
          const val = useBand
            ? (best.summary as any).bandHitRate?.[h.label] ?? best.summary.hitRate[h.label]
            : best.summary.hitRate[h.label];
          return (
            <td
              key={"hit" + h.label}
              className={`px-1.5 py-1.5 text-right tabular-nums ${hitRateColor(val)}`}
            >
              {(val * 100).toFixed(0)}%
            </td>
          );
        })}
        {horizons.map((h) => (
          <td key={"avg" + h.label} className="px-1.5 py-1.5 text-right tabular-nums">
            {pctSigned(best.summary.avgReturn[h.label] ?? 0)}
          </td>
        ))}
      </tr>
      {expanded && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={10 + horizons.length * 2} className="px-3 py-2">
            <HarsiDetailPanel
              tr={tr}
              horizons={horizons}
              useBand={useBand}
              priceContext={priceContext}
              hitConditionsOpen={hitConditionsOpen}
              toggleHitConditions={toggleHitConditions}
            />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HarsiOptimizer() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [runMode, setRunMode] = useState("single");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = useState("stocks");
  const { baskets } = useBaskets();
  const [signalKind, setSignalKind] = useState("rsi_threshold");
  const [gridSize, setGridSize] = useState("deep");
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState(() => (createDateRange as any)());
  const [rsiSmoothed, setRsiSmoothed] = useState(true);
  const [candleSmoothing, setCandleSmoothing] = useState(1);
  const [stochFit, setStochFit] = useState(80);
  const [returnMode, setReturnMode] = useState("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.03);
  const [bandMax, setBandMax] = useState(0.07);
  const [minHold, setMinHold] = useState(1);
  const [running, setRunning] = useState(false);
  const { frequency, setFrequency, frequencyUI } = useFrequency("harsi", "daily", running);
  const resampleMode = frequency === "weekly" ? "weekly" : "daily";
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [workerProgress, setWorkerProgress] = useState<{
    ticker: string;
    done: number;
    total: number;
  } | null>(null);
  const [inputSelection, setInputSelection] = usePersistedState(
    "harsi-input-selection",
    defaultInputSelection
  );
  const [results, setResults] = usePersistedState<HarsiTickerResult[]>("harsi:results", []);
  const [priceContextMap, setPriceContextMap] = useState<Map<string, any>>(new Map());
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [hitConditionsOpen, setHitConditionsOpen] = useState<Set<string>>(new Set());
  const toggleHitConditions = useCallback((key: string) => {
    setHitConditionsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const [filterText, setFilterText] = useState("");
  const [sortState, setSortState] = useState<{ col: string; dir: string }>({
    col: "score",
    dir: "desc",
  });
  const [rankBy, setRankBy] = useState("composite");
  const scoreWeights = useMemo(() => (getScoreWeights as any)(rankBy), [rankBy]);
  const [activeTab, setActiveTab] = useState("optimize");
  const [evalSide, setEvalSide] = useState("long");
  const [evalResult, setEvalResult] = usePersistedState<any>("harsi:evalResult", null);
  const [evalPriceContext, setEvalPriceContext] = useState<any>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalSignalKind, setEvalSignalKind] = useState("rsi_threshold");
  const [evalCandleLen, setEvalCandleLen] = useState(14);
  const [evalRsiLen, setEvalRsiLen] = useState(14);
  const [evalStochLen, setEvalStochLen] = useState(14);
  const [evalSmoothK, setEvalSmoothK] = useState(3);
  const [evalSmoothD, setEvalSmoothD] = useState(3);
  const [evalObThreshold, setEvalObThreshold] = useState(20);
  const [evalOsThreshold, setEvalOsThreshold] = useState(-20);
  const [evalConfirmation, setEvalConfirmation] = useState(0);
  const [evalCompositeLookback, setEvalCompositeLookback] = useState(5);

  const cancelRef = useRef(false);
  const tickerInitRef = useRef(false);
  const workerPoolRef = useRef<any>(null);

  const { universeTickers } = useUniverse();
  const filteredByUniverse = useMemo(
    () => (universeTickers ? allTickers.filter((t) => universeTickers.has(t.ticker)) : allTickers),
    [allTickers, universeTickers]
  );
  const classFilter = useOptimizerClassFilter(
    filteredByUniverse,
    runMode === "universe",
    "harsi-clf"
  );
  const pairComboPicker = usePairComboPicker(
    allTickers.map((t) => t.ticker),
    runMode === "pairCombo",
    "harsi-pc"
  );
  const universeTicks = classFilter.filteredTickers;

  useEffect(() => {
    getTickers().then((tickers) => {
      setAllTickers(tickers);
      if (tickers.length > 0 && !tickerInitRef.current) setSelectedTicker(tickers[0].ticker);
      if (tickers.length > 0) {
        setPairTickerA((prev) => prev || tickers[0].ticker);
        setPairTickerB((prev) => prev || (tickers[1]?.ticker ?? tickers[0].ticker));
      }
    });
  }, []);

  useEffect(() => {
    if (filteredByUniverse.length > 0 && selectedTicker && filteredByUniverse.find((t) => t.ticker === selectedTicker)) {
      // no-op, ticker is valid
    }
  }, [filteredByUniverse, selectedTicker]);

  // Fetch last-updated timestamp for single ticker
  useEffect(() => {
    if (runMode !== "single" || !selectedTicker) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await getTickerRaw(selectedTicker);
        if (!cancelled) setLastFetchedAt((raw as any).fetchedAt ?? Date.now());
      } catch {
        if (!cancelled) setLastFetchedAt(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runMode, selectedTicker]);

  const handleRefresh = async () => {
    if (runMode !== "single" || !selectedTicker) return;
    setRefreshing(true);
    try {
      const result = await refreshTickerData(selectedTicker);
      setLastFetchedAt((result as any).fetchedAt ?? Date.now());
    } finally {
      setRefreshing(false);
    }
  };

  const comboCount = useMemo(
    () => countCombos(GRID_PRESETS[gridSize], signalKind),
    [gridSize, signalKind]
  );

  // ── Load data for a ticker ─────────────────────────────────────────────────

  async function loadTickerData(
    ticker: string,
    freqMode: string,
    dates: string[],
    dr: any
  ): Promise<{
    closes: number[];
    highs: number[];
    lows: number[];
    volumes: number[] | null;
    priceDates: string[];
    globalIndices: number[];
  } | null> {
    try {
      const raw = await getTickerRaw(ticker);
      const filtered: any = (filterByDateRange as any)(raw, dr ?? null);
      const adjCloses: number[] = filtered.adjCloses;
      const closes: number[] = filtered.closes;
      const rawHighs: number[] = filtered.highs;
      const rawLows: number[] = filtered.lows;
      const opens: number[] = filtered.opens;
      const volumes: number[] = filtered.volumes;
      const rawDates: string[] = filtered.dates;
      const adjFactors = closes.map((c, i) => {
        const adj = adjCloses[i];
        return c > 0 && Number.isFinite(c) && Number.isFinite(adj) ? adj / c : 1;
      });
      const adjHighs = rawHighs.map((h, i) => h * adjFactors[i]);
      const adjLows = rawLows.map((l, i) => l * adjFactors[i]);
      const adjOpens = opens.map((o, i) => o * adjFactors[i]);

      const dateMap = new Map<string, number>();
      for (let i = 0; i < dates.length; i++) dateMap.set(dates[i], i);
      const globalIdxFromRaw = rawDates.map((d) => dateMap.get(d) ?? -1);

      const resampled: any = (resampleWeekly as any)(
        {
          dates: rawDates,
          opens: adjOpens,
          highs: adjHighs,
          lows: adjLows,
          closes: adjCloses,
          adjCloses,
          volumes,
        },
        freqMode
      );
      const minLen = freqMode === "weekly" ? 52 : 252;
      if (resampled.closes.length < minLen) return null;
      const resampledGlobal = resampled.dailyIndexMap
        ? resampled.dailyIndexMap.map((f: number) =>
            f >= 0 ? (globalIdxFromRaw[f] ?? -1) : -1
          )
        : resampled.priceDates.map((d: string) => dateMap.get(d) ?? -1);
      return {
        closes: resampled.closes,
        highs: resampled.highs,
        lows: resampled.lows,
        volumes: resampled.volumes,
        priceDates: resampled.dates ?? resampled.priceDates,
        globalIndices: resampledGlobal,
      };
    } catch {
      return null;
    }
  }

  async function loadPairData(
    tickerA: string,
    tickerB: string,
    dates: string[],
    dr: any
  ): Promise<{
    closes: number[];
    highs: number[];
    lows: number[];
    volumes: number[];
    priceDates: string[];
    globalIndices: number[];
  } | null> {
    try {
      const ratio = await getYahooPairsRatio(tickerA, tickerB, dates);
      if (!ratio || ratio.indices.length < 252) return null;
      let prices = ratio.prices.slice();
      let priceDates = ratio.indices.map((i: number) => dates[i] || "");
      let globalIdx = ratio.indices.slice();
      if (dr) {
        const s = dr.start, e = dr.end;
        let lo = 0;
        while (lo < priceDates.length && priceDates[lo] < s) lo++;
        let hi = priceDates.length - 1;
        while (hi >= 0 && priceDates[hi] > e) hi--;
        if (lo > hi) return null;
        prices = prices.slice(lo, hi + 1);
        priceDates = priceDates.slice(lo, hi + 1);
        globalIdx = globalIdx.slice(lo, hi + 1);
      }
      return {
        closes: prices,
        highs: prices.slice(),
        lows: prices.slice(),
        volumes: [],
        priceDates,
        globalIndices: globalIdx,
      };
    } catch {
      return null;
    }
  }

  const handleRunOptimizer = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setPriceContextMap(new Map());
    setHitConditionsOpen(new Set());
    setWorkerProgress(null);
    cancelRef.current = false;

    let tickerList: any[];
    if (runMode === "pair") {
      if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
        setRunning(false);
        return;
      }
      const label = `${pairTickerA}/${pairTickerB}`;
      tickerList = [{ ticker: label, name: label }];
    } else if (runMode === "single") {
      if (!selectedTicker) {
        setRunning(false);
        return;
      }
      const found = filteredByUniverse.find((t) => t.ticker === selectedTicker);
      tickerList = found ? [found] : [{ ticker: selectedTicker, name: selectedTicker }];
    } else if (runMode === "basket") {
      if (basketMode === "combined") {
        if (basketTickers.length === 0) {
          setRunning(false);
          return;
        }
        const basket = buildBasketOhlc(basketTickers, baskets);
        tickerList = [{ ticker: `BASKET:${basket.name}`, name: `BASKET:${basket.name}` }];
      } else {
        tickerList = basketTickers.map(
          (t) =>
            filteredByUniverse.find((v) => v.ticker.toUpperCase() === t.toUpperCase()) ?? {
              ticker: t,
              name: t,
            }
        );
      }
    } else if (runMode === "pairCombo") {
      if (pairComboPicker.pairs.length === 0) {
        setRunning(false);
        return;
      }
      tickerList = pairComboPicker.pairs.map((p: any) => ({
        ticker: p.label,
        name: p.label,
        pairA: p.a,
        pairB: p.b,
      }));
    } else {
      tickerList = universeTicks;
    }

    if (tickerList.length === 0) {
      setRunning(false);
      return;
    }

    const combinedBasket =
      runMode === "basket" && basketMode === "combined"
        ? buildBasketOhlc(basketTickers, baskets)
        : null;

    setProgress({ current: 0, total: tickerList.length });

    // Set up worker pool for universe mode
    let pool: any = null;
    if (runMode === "universe") {
      const cores = Math.min(Math.max(2, navigator.hardwareConcurrency || 4), 8);
      // workerPool import
      try {
        const { W: WorkerPool } = await import("@/lib/workerPool" as any);
        pool = new WorkerPool(() => createHarsiWorker(), cores);
        workerPoolRef.current = pool;
      } catch {
        workerPoolRef.current = null;
      }
    } else {
      workerPoolRef.current = null;
    }

    const optimizerParams = {
      kind: signalKind,
      grid: GRID_PRESETS[gridSize],
      rsiSmoothed,
      candleSmoothing,
      stochFit,
      targetReturn,
      returnMode,
      bandMin,
      bandMax,
      minHold,
    };

    const accumulated: HarsiTickerResult[] = [];
    const ctxMap = new Map<string, any>();
    let completedCount = 0;
    const dates = await getDates();

    const tickerPromises = tickerList.map(async (ticker: any) => {
      if (cancelRef.current) return;
      try {
        let data: any;
        if ((frequency as string) === "weekly_on_daily" && runMode !== "pair" && runMode !== "pairCombo") {
          const daily = await loadTickerData(ticker.ticker, "daily", dates, dateRange);
          if (!daily) return;
          const wC = weeklyDownsampleD(daily.closes, daily.priceDates);
          const wH = weeklyDownsampleD(daily.highs, daily.priceDates);
          const wL = weeklyDownsampleD(daily.lows, daily.priceDates);
          if (wC.prices.length < 52) return;
          const wVol = (() => {
            if (!daily.volumes) return [];
            const vol = daily.volumes;
            const result = new Array(wC.weekIndex.length);
            let lastIdx = -1;
            for (let i = 0; i < wC.weekIndex.length; i++) {
              const wi = wC.weekIndex[i];
              let sum = 0;
              for (let j = lastIdx + 1; j <= wi; j++) sum += vol[j] || 0;
              result[i] = sum;
              lastIdx = wi;
            }
            return result;
          })();
          data = {
            closes: wC.prices,
            highs: wH.prices,
            lows: wL.prices,
            volumes: wVol,
            priceDates: wC.weekIndex.map((d: number) => daily.priceDates[d] ?? ""),
            globalIndices: wC.weekIndex.map((d: number) => daily.globalIndices[d] ?? -1),
          };
        } else if (combinedBasket && runMode === "basket") {
          const bar = await getBasketOhlc(combinedBasket, dateRange);
          if (!bar || bar.closes.length < 252) return;
          const dateMap = new Map<string, number>();
          for (let i = 0; i < dates.length; i++) dateMap.set(dates[i], i);
          data = {
            closes: bar.closes,
            highs: bar.highs,
            lows: bar.lows,
            volumes: bar.volumes,
            priceDates: bar.priceDates,
            globalIndices: bar.priceDates.map((d: string) => dateMap.get(d) ?? -1),
          };
        } else {
          const isPair = runMode === "pair" || runMode === "pairCombo";
          if (isPair) {
            const legA = runMode === "pairCombo" ? ticker.pairA : pairTickerA;
            const legB = runMode === "pairCombo" ? ticker.pairB : pairTickerB;
            data = await loadPairData(legA, legB, dates, dateRange);
          } else {
            data = await loadTickerData(ticker.ticker, resampleMode, dates, dateRange);
          }
        }
        if (!data || cancelRef.current) return;

        const priceContext = {
          prices: data.closes,
          highs: data.highs,
          lows: data.lows,
          volumes: data.volumes,
          dates: data.priceDates,
          globalIndices: data.globalIndices,
          benchmarkPrices: null,
          mode: runMode === "pair" || runMode === "pairCombo" ? "pair" : "single",
          pairLegA:
            runMode === "pairCombo" ? ticker.pairA : runMode === "pair" ? pairTickerA : undefined,
          pairLegB:
            runMode === "pairCombo" ? ticker.pairB : runMode === "pair" ? pairTickerB : undefined,
        };

        if (runMode === "single" || runMode === "pair") {
          // single-threaded worker
          const worker = createHarsiWorker();
          const result: HarsiTickerResult = await new Promise((resolve, reject) => {
            const onMsg = (event: MessageEvent) => {
              const msg = event.data;
              if (msg.type === "progress") {
                setWorkerProgress({
                  ticker: ticker.ticker,
                  done: msg.configsDone,
                  total: msg.configsTotal,
                });
              } else if (msg.type === "result") {
                if (msg.result) {
                  accumulated.push(msg.result);
                  ctxMap.set(msg.result.ticker, priceContext);
                }
                worker.removeEventListener("message", onMsg);
                worker.terminate();
                resolve(msg.result);
              } else if (msg.type === "error") {
                worker.removeEventListener("message", onMsg);
                worker.terminate();
                reject(new Error(msg.error));
              }
            };
            worker.addEventListener("message", onMsg);
            worker.postMessage({
              type: "run",
              id: 1,
              ticker: ticker.ticker,
              name: ticker.name ?? ticker.ticker,
              closes: data.closes,
              highs: data.highs,
              lows: data.lows,
              params: optimizerParams,
              frequency,
              timeframe: resampleMode,
            });
          });
        } else if (pool) {
          const result = await pool.run({
            type: "run",
            ticker: ticker.ticker,
            name: ticker.name ?? ticker.ticker,
            closes: data.closes,
            highs: data.highs,
            lows: data.lows,
            params: optimizerParams,
            frequency,
            timeframe: resampleMode,
          });
          if (result) {
            accumulated.push(result);
            ctxMap.set(result.ticker, priceContext);
          }
        }
      } catch {}
      finally {
        completedCount++;
        setProgress({ current: completedCount, total: tickerList.length });
        if (completedCount % 3 === 0 || completedCount === tickerList.length) {
          setResults([...accumulated]);
          setPriceContextMap(new Map(ctxMap));
        }
      }
    });

    await Promise.all(tickerPromises);
    setResults([...accumulated]);
    setPriceContextMap(new Map(ctxMap));
    pool?.terminate();
    workerPoolRef.current = null;
    setWorkerProgress(null);
    setRunning(false);
  }, [
    runMode,
    frequency,
    selectedTicker,
    pairTickerA,
    pairTickerB,
    filteredByUniverse,
    signalKind,
    gridSize,
    rsiSmoothed,
    candleSmoothing,
    stochFit,
    returnMode,
    targetReturn,
    bandMin,
    bandMax,
    minHold,
    dateRange,
    basketTickers,
    basketMode,
    baskets,
    universeTicks,
    pairComboPicker.pairs,
  ]);

  const handleCancel = () => {
    cancelRef.current = true;
    workerPoolRef.current?.terminate();
    workerPoolRef.current = null;
    setRunning(false);
    setWorkerProgress(null);
  };

  const handleEvaluate = useCallback(async () => {
    setEvaluating(true);
    setEvalResult(null);
    setEvalPriceContext(null);
    try {
      const dates = await getDates();
      let data: any;
      if (runMode === "pair") {
        if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
          setEvaluating(false);
          return;
        }
        data = await loadPairData(pairTickerA, pairTickerB, dates, dateRange);
      } else if (runMode === "basket") {
        if (basketTickers.length === 0) {
          setEvaluating(false);
          return;
        }
        if (basketMode === "combined") {
          const basket = buildBasketOhlc(basketTickers, baskets);
          const bar = await getBasketOhlc(basket, dateRange);
          if (!bar || bar.closes.length < 252) {
            setEvaluating(false);
            return;
          }
          const dateMap = new Map<string, number>();
          for (let i = 0; i < dates.length; i++) dateMap.set(dates[i], i);
          data = {
            closes: bar.closes,
            highs: bar.highs,
            lows: bar.lows,
            volumes: bar.volumes,
            priceDates: bar.priceDates,
            globalIndices: bar.priceDates.map((d: string) => dateMap.get(d) ?? -1),
          };
        } else {
          const t0 = basketTickers[0];
          data = await loadTickerData(t0, resampleMode, dates, dateRange);
        }
      } else {
        const sym =
          runMode === "single" ? selectedTicker : filteredByUniverse[0]?.ticker ?? "";
        if (!sym) return;
        data = await loadTickerData(sym, resampleMode, dates, dateRange);
      }
      if (!data) {
        setEvaluating(false);
        return;
      }

      // Compute HARSI indicators via the harsi module
      const harsiModule = await import("@/lib/harsi" as any);
      const computeHarsi = harsiModule.c ?? harsiModule.default;
      const indicators = computeHarsi(data.closes, data.highs, data.lows, {
        candleLength: evalCandleLen,
        candleSmoothing,
        rsiLength: evalRsiLen,
        rsiSmoothed,
        stochLength: evalStochLen,
        smoothK: evalSmoothK,
        smoothD: evalSmoothD,
        stochFit,
      });

      const warmup = Math.max(evalCandleLen, evalRsiLen, evalStochLen) + 30;
      const evalDir = evalSide === "long" ? "buy" : "sell";
      let signals: { index: number; direction: string }[] = [];

      if (evalSignalKind === "rsi_threshold") {
        signals = detectRsiThresholdSignals(
          indicators.rsi,
          evalObThreshold,
          evalOsThreshold,
          warmup
        );
      } else if (evalSignalKind === "stoch_kd_cross") {
        signals = detectStochKDCross(
          indicators.stochK,
          indicators.stochD,
          evalObThreshold,
          evalOsThreshold,
          warmup
        );
      } else if (evalSignalKind === "ha_flip") {
        signals = detectHaFlip(indicators.haClose, indicators.haOpen, evalConfirmation, warmup);
      } else if (evalSignalKind === "composite") {
        signals = detectComposite(
          indicators.rsi,
          indicators.stochK,
          indicators.stochD,
          evalObThreshold,
          evalOsThreshold,
          evalCompositeLookback,
          warmup
        );
      }

      const filteredIndices = signals
        .filter((s) => s.direction === evalDir)
        .map((s) => s.index)
        .sort((a, b) => a - b);

      const evalRes = (evaluateSignals as any)(
        data.closes,
        data.priceDates,
        filteredIndices,
        evalSide,
        targetReturn,
        minHold,
        null,
        "3M"
      );
      setEvalResult(evalRes);
      setEvalPriceContext({
        prices: data.closes,
        highs: data.highs,
        lows: data.lows,
        volumes: data.volumes,
        dates: data.priceDates,
        globalIndices: data.globalIndices,
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
    resampleMode,
    selectedTicker,
    pairTickerA,
    pairTickerB,
    filteredByUniverse,
    evalSignalKind,
    evalCandleLen,
    evalRsiLen,
    evalStochLen,
    evalSmoothK,
    evalSmoothD,
    evalObThreshold,
    evalOsThreshold,
    evalConfirmation,
    evalCompositeLookback,
    evalSide,
    targetReturn,
    minHold,
    dateRange,
    basketTickers,
    basketMode,
    baskets,
    candleSmoothing,
    rsiSmoothed,
    stochFit,
  ]);

  const evalSetupLabel = useMemo(() => {
    const label = SIGNAL_KIND_LABELS[evalSignalKind];
    if (evalSignalKind === "rsi_threshold")
      return `HARSI ${label} RSI(${evalRsiLen}) OB${evalObThreshold}/OS${evalOsThreshold} [${evalSide}]`;
    if (evalSignalKind === "stoch_kd_cross")
      return `HARSI ${label} Stoch(${evalStochLen},${evalSmoothK},${evalSmoothD}) OB${evalObThreshold}/OS${evalOsThreshold} [${evalSide}]`;
    if (evalSignalKind === "ha_flip")
      return `HARSI ${label} len=${evalCandleLen} sm=${candleSmoothing} conf=${evalConfirmation} [${evalSide}]`;
    return `HARSI ${label} RSI(${evalRsiLen}) Stoch(${evalStochLen},${evalSmoothK},${evalSmoothD}) lb=${evalCompositeLookback} OB${evalObThreshold}/OS${evalOsThreshold} [${evalSide}]`;
  }, [
    evalSignalKind,
    evalCandleLen,
    evalRsiLen,
    evalStochLen,
    evalSmoothK,
    evalSmoothD,
    evalObThreshold,
    evalOsThreshold,
    evalConfirmation,
    evalCompositeLookback,
    evalSide,
    candleSmoothing,
  ]);

  const evalTickerLabel = useMemo(
    () =>
      runMode === "pair"
        ? `${pairTickerA || "A"}/${pairTickerB || "B"}`
        : runMode === "single"
        ? selectedTicker || "—"
        : filteredByUniverse[0]?.ticker || "—",
    [runMode, pairTickerA, pairTickerB, selectedTicker, filteredByUniverse]
  );

  // ── Workspace persistence ─────────────────────────────────────────────────

  const getWorkspaceState = useCallback(
    () => ({
      selectedTicker,
      pairTickerA,
      pairTickerB,
      basketTickers,
      basketMode,
      mode: runMode,
      frequency,
      signalKind,
      gridSize,
      rsiSmoothed,
      candleSmoothing,
      stochFit,
      returnMode,
      targetReturn,
      bandMin,
      bandMax,
      minHold,
      results,
      expandedTicker,
      runSort: sortState,
      pairCombo: pairComboPicker.serialize(),
      inputSelection,
    }),
    [
      selectedTicker,
      pairTickerA,
      pairTickerB,
      basketTickers,
      basketMode,
      runMode,
      frequency,
      signalKind,
      gridSize,
      rsiSmoothed,
      candleSmoothing,
      stochFit,
      returnMode,
      targetReturn,
      bandMin,
      bandMax,
      minHold,
      results,
      expandedTicker,
      sortState,
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
      if (
        state.mode === "single" ||
        state.mode === "universe" ||
        state.mode === "pair" ||
        state.mode === "pairCombo" ||
        state.mode === "basket"
      )
        setRunMode(state.mode);
      if (state.pairCombo) pairComboPicker.hydrate(state.pairCombo);
      if (state.pairTickerA) setPairTickerA(state.pairTickerA);
      if (state.pairTickerB) setPairTickerB(state.pairTickerB);
      if (Array.isArray(state.basketTickers))
        setBasketTickers(state.basketTickers.filter((t: any) => typeof t === "string"));
      if (state.basketMode === "stocks" || state.basketMode === "combined")
        setBasketMode(state.basketMode);
      if (
        state.frequency === "daily" ||
        state.frequency === "weekly" ||
        state.frequency === "weekly_on_daily"
      )
        setFrequency(state.frequency);
      else if (
        (state.timeframe === "weekly" && state.frequency === undefined) ||
        (state.barInterval === "weekly" && state.frequency === undefined)
      )
        setFrequency("weekly");
      if (SIGNAL_KINDS.includes(state.signalKind)) setSignalKind(state.signalKind);
      if (GRID_SIZES.includes(state.gridSize)) setGridSize(state.gridSize);
      if (typeof state.rsiSmoothed === "boolean") setRsiSmoothed(state.rsiSmoothed);
      if (typeof state.candleSmoothing === "number") setCandleSmoothing(state.candleSmoothing);
      if (typeof state.stochFit === "number") setStochFit(state.stochFit);
      if (state.returnMode === "threshold" || state.returnMode === "band")
        setReturnMode(state.returnMode);
      if (typeof state.targetReturn === "number") setTargetReturn(state.targetReturn);
      if (typeof state.bandMin === "number") setBandMin(state.bandMin);
      if (typeof state.bandMax === "number") setBandMax(state.bandMax);
      if (typeof state.minHold === "number") setMinHold(state.minHold);
      if (Array.isArray(state.results)) setResults(state.results);
      if (state.expandedTicker !== undefined) setExpandedTicker(state.expandedTicker);
      if (state.runSort && state.runSort.col && state.runSort.dir) setSortState(state.runSort);
      if (state.inputSelection && typeof state.inputSelection === "object") {
        const sel = state.inputSelection;
        if (sel.kind === "close") setInputSelection({ kind: "close" as any });
        else if (sel.kind === "workbook" && typeof sel.metric === "string")
          setInputSelection({ kind: "workbook", metric: sel.metric });
      }
    },
    [setFrequency, setInputSelection]
  );

  // captureInputs / applyInputs for PresetBar (excludes per-run state)
  const captureInputs = useCallback(() => {
    const state = getWorkspaceState();
    const { selectedTicker: _s, results: _r, expandedTicker: _e, runSort: _rs, ...rest } = state;
    return rest;
  }, [getWorkspaceState]);

  const applyInputs = useCallback(
    (state: any) => restoreWorkspaceState(state),
    [restoreWorkspaceState]
  );

  useWorkspaceTab("harsi-optimizer", getWorkspaceState, restoreWorkspaceState);

  // ── Processed rows ─────────────────────────────────────────────────────────

  const processedRows = useMemo<ProcessedRow[]>(
    () =>
      results.map((tr) => {
        const findBest = (side: string) => {
          const category = side;
          let bestScore = -Infinity;
          let bestCfg: HarsiConfig | null = null;
          let bestSummary: SignalSummary | null = null;
          let bestComp: CompositeScore | null = null;
          for (const cfg of tr.configs) {
            const cat = cfg.categories.find((c) => c.category === category);
            if (!cat || cat.summary.count === 0) continue;
            const score = (pickBestByRankMode as any)(
              cat.summary,
              cat.composite.score,
              category,
              scoreWeights
            );
            if (score > bestScore) {
              bestScore = score;
              bestCfg = cfg;
              bestSummary = cat.summary;
              bestComp = cat.composite;
            }
          }
          return bestCfg && bestSummary && bestComp
            ? { cfg: bestCfg, summary: bestSummary, score: bestScore, comp: bestComp }
            : null;
        };
        return { tr, longBest: findBest("buy"), shortBest: findBest("sell") };
      }),
    [results, scoreWeights]
  );

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const filtered = q
      ? processedRows.filter(
          (r) =>
            r.tr.ticker.toLowerCase().includes(q) ||
            (r.tr.name && r.tr.name.toLowerCase().includes(q))
        )
      : [...processedRows];
    const { col, dir } = sortState;
    filtered.sort((a, b) => {
      const scoreA = Math.max(a.longBest?.score ?? -1, a.shortBest?.score ?? -1);
      const scoreB = Math.max(b.longBest?.score ?? -1, b.shortBest?.score ?? -1);
      let cmp = 0;
      if (col === "ticker") cmp = a.tr.ticker.localeCompare(b.tr.ticker);
      else if (col === "currentSignal")
        cmp = a.tr.currentSignal.localeCompare(b.tr.currentSignal);
      else cmp = scoreA - scoreB;
      return dir === "asc" ? cmp : -cmp;
    });
    return filtered;
  }, [processedRows, filterText, sortState]);

  const handleSort = (col: string) => {
    setSortState((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { col, dir: col === "ticker" ? "asc" : "desc" }
    );
  };

  const handleExportCsv = () => {
    const horizons = FORWARD_HORIZONS;
    const headers = [
      "ticker",
      "name",
      "side",
      "currentSignal",
      "currentRsi",
      "currentStochK",
      "currentStochD",
      "currentHaClose",
      "kind",
      "bestConfig",
      "score",
      "signals",
    ];
    for (const h of horizons) headers.push(`hit_${h.label}`, `avg_${h.label}`, `pf_${h.label}`);
    const rows = [headers.join(",")];
    for (const row of filteredRows) {
      for (const side of ["long", "short"]) {
        const best = side === "long" ? row.longBest : row.shortBest;
        if (!best) continue;
        const vals: any[] = [
          row.tr.ticker,
          row.tr.name ?? "",
          side,
          row.tr.currentSignal,
          row.tr.currentRsi,
          row.tr.currentStochK,
          row.tr.currentStochD,
          row.tr.currentHaClose,
          best.cfg.kind,
          best.cfg.configLabel,
          best.score,
          best.summary.count,
        ];
        for (const h of horizons) {
          const val =
            returnMode === "band"
              ? (best.summary as any).bandHitRate?.[h.label] ?? best.summary.hitRate[h.label]
              : best.summary.hitRate[h.label];
          vals.push(
            (val * 100).toFixed(1) + "%",
            (best.summary.avgReturn[h.label] * 100).toFixed(2) + "%",
            best.summary.profitFactor[h.label].toFixed(2)
          );
        }
        const escaped = vals.map((v) => {
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        });
        rows.push(escaped.join(","));
      }
    }
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harsi-opt-${signalKind}-${gridSize}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const useBand = returnMode === "band";
  const horizons = FORWARD_HORIZONS;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">HARSI Optimizer</h2>
        <div className="flex gap-px">
          <button
            data-testid="harsi-view-optimize"
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
            data-testid="harsi-view-evaluate"
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
            ? "Search parameter space by hit rate"
            : "Score one specific setup"}
        </span>
        <div className="flex items-center gap-1">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            DATE RANGE
          </label>
          <div className="flex items-center gap-0.5">
            {DATE_PRESETS.map((p: any) => (
              <button
                key={p.value}
                data-testid={`harsi-date-preset-${p.value}`}
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
            data-testid="harsi-date-start"
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
            data-testid="harsi-date-end"
            value={dateRange.end}
            onChange={(e) => {
              setDatePreset("custom");
              setDateRange({ ...dateRange, end: e.target.value });
            }}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <PresetBar kind="harsi" captureInputs={captureInputs} applyInputs={applyInputs} />
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

              {/* Ticker */}
              {runMode === "single" && (
                <div className="flex items-end gap-2">
                  <div
                    className={
                      selectedTicker.startsWith("BASKET:") ? "opacity-40 pointer-events-none" : ""
                    }
                  >
                    <UnifiedTickerPicker
                      tickers={filteredByUniverse}
                      value={selectedTicker.startsWith("BASKET:") ? "" : selectedTicker}
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
                      family="harsi"
                      label=""
                    />
                  </div>
                </div>
              )}
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

              {/* Signal Kind */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Signal Kind
                </label>
                <div className="flex gap-px">
                  {SIGNAL_KINDS.map((k) => (
                    <button
                      key={k}
                      title={SIGNAL_KIND_DESCRIPTIONS[k]}
                      className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors whitespace-nowrap ${
                        evalSignalKind === k
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:text-foreground border border-border"
                      }`}
                      onClick={() => setEvalSignalKind(k)}
                    >
                      {SIGNAL_KIND_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Candle Len */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Candle Len
                </label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={evalCandleLen}
                  onChange={(e) => setEvalCandleLen(parseInt(e.target.value) || 14)}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                />
              </div>

              {/* RSI Len (not for ha_flip) */}
              {evalSignalKind !== "ha_flip" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    RSI Len
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={evalRsiLen}
                    onChange={(e) => setEvalRsiLen(parseInt(e.target.value) || 14)}
                    className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                  />
                </div>
              )}

              {/* OB / OS thresholds (not for ha_flip) */}
              {evalSignalKind !== "ha_flip" && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      OB Thr
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={evalObThreshold}
                      onChange={(e) => setEvalObThreshold(parseInt(e.target.value) || 20)}
                      className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      OS Thr
                    </label>
                    <input
                      type="number"
                      min={-50}
                      max={-1}
                      value={evalOsThreshold}
                      onChange={(e) => setEvalOsThreshold(parseInt(e.target.value) || -20)}
                      className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                    />
                  </div>
                </>
              )}

              {/* Stoch params (stoch_kd_cross / composite) */}
              {(evalSignalKind === "stoch_kd_cross" || evalSignalKind === "composite") && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Stoch Len
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={50}
                      value={evalStochLen}
                      onChange={(e) => setEvalStochLen(parseInt(e.target.value) || 14)}
                      className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Smooth K
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={evalSmoothK}
                      onChange={(e) => setEvalSmoothK(parseInt(e.target.value) || 3)}
                      className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Smooth D
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={evalSmoothD}
                      onChange={(e) => setEvalSmoothD(parseInt(e.target.value) || 3)}
                      className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                    />
                  </div>
                </>
              )}

              {/* HA flip params */}
              {evalSignalKind === "ha_flip" && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Open Smooth
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={candleSmoothing}
                      onChange={(e) => setCandleSmoothing(parseInt(e.target.value) || 1)}
                      className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Confirm
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={evalConfirmation}
                      onChange={(e) => setEvalConfirmation(parseInt(e.target.value) || 0)}
                      className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                    />
                  </div>
                </>
              )}

              {/* Composite lookback */}
              {evalSignalKind === "composite" && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    Lookback
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={evalCompositeLookback}
                    onChange={(e) => setEvalCompositeLookback(parseInt(e.target.value) || 5)}
                    className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                  />
                </div>
              )}

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
                  data-testid="harsi-eval-run"
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
          {/* Optimize tab */}
          <div className="flex flex-col h-full bg-background text-foreground">
            {/* Optimize sub-header with PresetBar */}
            <div className="flex items-center justify-between gap-3 px-4 py-1 border-b border-border flex-shrink-0">
              <span className="text-[11px] text-muted-foreground">
                Heikin Ashi RSI · {SIGNAL_KIND_LABELS[signalKind]}
              </span>
              <PresetBar kind="harsi" captureInputs={captureInputs} applyInputs={applyInputs} />
            </div>

            {/* Optimize toolbar */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border bg-card/50 flex-shrink-0 text-xs">
              {/* Run mode */}
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Mode:</span>
                <div className="flex rounded-md overflow-hidden border border-border">
                  {["single", "universe", "pair", "pairCombo", "basket"].map((m) => (
                    <button
                      key={m}
                      onClick={() => setRunMode(m)}
                      disabled={running}
                      data-testid={`optimizer-mode-${m}`}
                      className={`px-2.5 py-1 text-xs ${
                        runMode === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
                      }`}
                    >
                      {m === "single"
                        ? "Single"
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

              {/* Pair mode */}
              {runMode === "pair" && (
                <div className="flex items-center gap-2">
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
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Ratio:{" "}
                    <span className="text-foreground font-bold">
                      {pairTickerA || "A"}/{pairTickerB || "B"}
                    </span>
                  </span>
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
                    testIdPrefix="harsi-basket"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Basket Run Mode
                    </label>
                    <div className="flex gap-px" data-testid="harsi-basket-mode">
                      {["stocks", "combined"].map((m) => (
                        <button
                          key={m}
                          data-testid={`harsi-basket-mode-${m}`}
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

              {/* Pair combo */}
              {runMode === "pairCombo" && (
                <div className="flex flex-col gap-1 w-full">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                    Pair Combo — Leg Set
                  </label>
                  {pairComboPicker.ui}
                </div>
              )}

              {/* Universe classification filter */}
              {runMode === "universe" && classFilter.classFilterUI && (
                <div className="flex flex-col gap-1 w-full">
                  {classFilter.universeSourceUI}
                  <div className="flex items-center gap-1.5 w-full">
                    <span className="text-muted-foreground whitespace-nowrap">Class Filter:</span>
                    <div className="flex-1">{classFilter.classFilterUI}</div>
                  </div>
                </div>
              )}

              {/* Single ticker */}
              {runMode === "single" && (
                <div className="flex items-center gap-1.5">
                  <UnifiedTickerPicker
                    value={selectedTicker}
                    onChange={(t) => setSelectedTicker(t)}
                    tickers={filteredByUniverse}
                    label="Ticker"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      Input Series
                    </label>
                    <InputSeriesPicker
                      value={inputSelection}
                      onChange={setInputSelection}
                      family="harsi"
                      label=""
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={refreshing || !selectedTicker}
                    className="h-7 px-2 text-xs"
                  >
                    {refreshing ? "…" : "↻"}
                  </Button>
                  {lastFetchedAt && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(lastFetchedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              )}

              {/* Frequency UI */}
              {frequencyUI}

              {/* Signal kind */}
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Signal:</span>
                <div className="flex rounded-md overflow-hidden border border-border">
                  {SIGNAL_KINDS.map((k) => (
                    <button
                      key={k}
                      onClick={() => setSignalKind(k)}
                      title={SIGNAL_KIND_DESCRIPTIONS[k]}
                      className={`px-2.5 py-1 text-xs whitespace-nowrap ${
                        signalKind === k
                          ? "bg-primary text-primary-foreground"
                          : "bg-card hover:bg-accent"
                      }`}
                    >
                      {SIGNAL_KIND_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid size */}
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Grid:</span>
                <div className="flex rounded-md overflow-hidden border border-border">
                  {GRID_SIZES.map((g) => (
                    <button
                      key={g}
                      onClick={() => setGridSize(g)}
                      className={`px-2.5 py-1 text-xs ${
                        gridSize === g ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
                      }`}
                    >
                      {GRID_SIZE_LABELS[g]}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground ml-1">
                  ~{comboCount.toLocaleString()} combos
                </span>
              </div>

              {/* Target */}
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Target:</span>
                <select
                  value={returnMode}
                  onChange={(e) => setReturnMode(e.target.value)}
                  className="h-7 rounded-md bg-card border border-border px-1.5 text-xs"
                >
                  <option value="threshold">Threshold</option>
                  <option value="band">Band</option>
                </select>
                {returnMode === "threshold" ? (
                  <select
                    value={targetReturn}
                    onChange={(e) => setTargetReturn(parseFloat(e.target.value))}
                    className="h-7 rounded-md bg-card border border-border px-1.5 text-xs"
                  >
                    {TARGET_RETURN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={`${bandMin}-${bandMax}`}
                    onChange={(e) => {
                      const preset = RETURN_BAND_PRESETS.find(
                        (p) => `${p.band.minReturn}-${p.band.maxReturn}` === e.target.value
                      );
                      if (preset) {
                        setBandMin(preset.band.minReturn);
                        setBandMax(preset.band.maxReturn);
                      }
                    }}
                    className="h-7 rounded-md bg-card border border-border px-1.5 text-xs"
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
                )}
              </div>

              {/* Min hold */}
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Min hold:</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={minHold}
                  onChange={(e) =>
                    setMinHold(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))
                  }
                  className="h-7 w-12 rounded-md bg-card border border-border px-1.5 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">d</span>
              </div>

              {/* RSI smoothed */}
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rsiSmoothed}
                  onChange={(e) => setRsiSmoothed(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-muted-foreground">RSI smoothed</span>
              </label>

              {/* Stoch fit */}
              <div
                className="flex items-center gap-1"
                title="Stochastic-RSI fit length (bars). Higher = smoother, slower to turn."
              >
                <span className="text-muted-foreground">Stoch fit:</span>
                <input
                  type="number"
                  min={5}
                  max={200}
                  step={1}
                  value={stochFit}
                  onChange={(e) =>
                    setStochFit(Math.max(5, Math.min(200, parseInt(e.target.value) || 80)))
                  }
                  className="h-7 w-14 rounded-md bg-card border border-border px-1.5 text-xs"
                />
              </div>

              {/* Candle smooth */}
              <div
                className="flex items-center gap-1"
                title="Heikin-Ashi candle smoothing (1 = none)."
              >
                <span className="text-muted-foreground">Candle smooth:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={candleSmoothing}
                  onChange={(e) =>
                    setCandleSmoothing(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
                  }
                  className="h-7 w-12 rounded-md bg-card border border-border px-1.5 text-xs"
                />
              </div>

              {/* Run / Cancel + Export */}
              <div className="ml-auto flex items-center gap-2">
                {running ? (
                  <Button onClick={handleCancel} size="sm" variant="destructive" className="h-7 px-3 text-xs">
                    Cancel
                  </Button>
                ) : (
                  <Button
                    onClick={handleRunOptimizer}
                    size="sm"
                    disabled={
                      runMode === "single"
                        ? !selectedTicker
                        : runMode === "pair"
                        ? !pairTickerA || !pairTickerB || pairTickerA === pairTickerB
                        : filteredByUniverse.length === 0
                    }
                    className="h-7 px-3 text-xs"
                  >
                    Run Optimizer
                  </Button>
                )}
                {results.length > 0 && (
                  <Button
                    onClick={handleExportCsv}
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    title="Export results to CSV"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    CSV
                  </Button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {running && (
              <div className="px-4 py-1.5 border-b border-border bg-muted/30 flex-shrink-0 text-xs flex items-center gap-3">
                <span>
                  Tickers: {progress.current}/{progress.total}
                </span>
                {workerProgress && (
                  <span className="text-muted-foreground">
                    {workerProgress.ticker}: {workerProgress.done.toLocaleString()}/
                    {workerProgress.total.toLocaleString()} configs
                  </span>
                )}
                <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden max-w-md">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${
                        progress.total
                          ? Math.round((progress.current / progress.total) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Filter bar */}
            {results.length > 0 && (
              <div className="px-4 py-1.5 border-b border-border flex-shrink-0 text-xs flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter ticker or name…"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="h-7 w-56 rounded-md bg-card border border-border px-2 text-xs"
                />
                <span className="text-muted-foreground">
                  {filteredRows.length} of {results.length} rows
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  <label className="text-[10px] font-mono text-muted-foreground">RANK BY</label>
                  <select
                    data-testid="harsi-rank-by"
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
              </div>
            )}

            {/* Results table */}
            <div className="flex-1 overflow-auto">
              {results.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  {running
                    ? "Running optimizer…"
                    : `Configure parameters and click Run Optimizer. Estimated ${comboCount.toLocaleString()} combos for ${SIGNAL_KIND_LABELS[signalKind]} (${gridSize}).`}
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      <th
                        className="text-left px-3 py-1.5 cursor-pointer hover:bg-accent"
                        onClick={() => handleSort("ticker")}
                      >
                        Ticker{" "}
                        {sortState.col === "ticker" &&
                          (sortState.dir === "asc" ? "▲" : "▼")}
                      </th>
                      <th
                        className="text-left px-2 py-1.5 cursor-pointer hover:bg-accent"
                        onClick={() => handleSort("currentSignal")}
                      >
                        Live Signal
                      </th>
                      <th className="text-right px-2 py-1.5">RSI</th>
                      <th className="text-right px-2 py-1.5">K</th>
                      <th className="text-right px-2 py-1.5">D</th>
                      <th className="text-right px-2 py-1.5">HA</th>
                      <th
                        className="text-right px-2 py-1.5 cursor-pointer hover:bg-accent"
                        onClick={() => handleSort("score")}
                      >
                        Score{" "}
                        {sortState.col === "score" &&
                          (sortState.dir === "asc" ? "▲" : "▼")}
                      </th>
                      <th className="text-left px-2 py-1.5">Best Config</th>
                      <th className="text-left px-2 py-1.5">Side</th>
                      <th className="text-right px-2 py-1.5">Sigs</th>
                      {horizons.map((h) => (
                        <th key={h.label} className="text-right px-1.5 py-1.5">
                          {h.label} hit
                        </th>
                      ))}
                      {horizons.map((h) => (
                        <th key={"avg" + h.label} className="text-right px-1.5 py-1.5">
                          {h.label} avg
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const best =
                        row.longBest && row.shortBest
                          ? row.longBest.score >= row.shortBest.score
                            ? { side: "Long", ...row.longBest }
                            : { side: "Short", ...row.shortBest }
                          : row.longBest
                          ? { side: "Long", ...row.longBest }
                          : row.shortBest
                          ? { side: "Short", ...row.shortBest }
                          : null;

                      if (!best) {
                        return (
                          <tr key={row.tr.ticker} className="border-b border-border/50">
                            <td className="px-3 py-1.5 font-mono">{row.tr.ticker}</td>
                            <td
                              colSpan={14}
                              className="px-2 py-1.5 text-muted-foreground italic"
                            >
                              No qualifying signals
                            </td>
                          </tr>
                        );
                      }

                      const isExpanded = expandedTicker === row.tr.ticker;
                      return (
                        <HarsiRow
                          key={row.tr.ticker}
                          er={row}
                          best={best}
                          expanded={isExpanded}
                          onToggle={() =>
                            setExpandedTicker(isExpanded ? null : row.tr.ticker)
                          }
                          horizons={horizons}
                          useBand={useBand}
                          priceContext={priceContextMap.get(row.tr.ticker)}
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
        </>
      )}
    </div>
  );
}
