import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  getTickers,
  getDates,
  getTickerRaw,
} from "@/lib/dataService";
import type { TickerMeta } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import {
  FORWARD_HORIZONS,
  TARGET_THRESHOLDS,
  RETURN_BAND_PRESETS,
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
  scoreColor,
  scoreTextColor,
  hitRateColor,
  profitFactorColor,
  pct,
  pctSigned,
  type ForwardReturnProfile,
  type SignalSummary,
  type HorizonLabel,
  type CompositeScore,
  type ReturnBand,
} from "@/lib/forwardReturns";

// ── MA Types ──

type MAType = "SMA" | "EMA";
type SignalType = "crossover" | "price_cross";

interface MAConfig {
  signalType: SignalType;
  maType: MAType;
  fastPeriod: number;
  slowPeriod: number; // only for crossover
}

type CrossoverSignal = "golden_cross" | "death_cross";
type PriceCrossSignal = "price_above" | "price_below";
type SignalCategory = CrossoverSignal | PriceCrossSignal;

interface CategoryResult {
  category: SignalCategory;
  label: string;
  description: string;
  summary: SignalSummary;
  composite: CompositeScore;
}

interface ConfigResult {
  config: MAConfig;
  configLabel: string;
  categories: CategoryResult[];
  bestCategory: SignalCategory;
  bestScore: number;
}

interface TickerMAResult {
  ticker: string;
  name: string;
  configs: ConfigResult[];
  bestCategory: string;
  bestScore: number;
  currentSignal: string;
}

// ── Category definitions ──

const CROSSOVER_DEFS: Record<CrossoverSignal, { label: string; description: string }> = {
  golden_cross: {
    label: "Golden Cross",
    description: "Fast MA crosses above slow MA — bullish trend change",
  },
  death_cross: {
    label: "Death Cross",
    description: "Fast MA crosses below slow MA — bearish trend change",
  },
};

const PRICE_CROSS_DEFS: Record<PriceCrossSignal, { label: string; description: string }> = {
  price_above: {
    label: "Price Cross Above",
    description: "Price crosses above MA from below — bullish breakout",
  },
  price_below: {
    label: "Price Cross Below",
    description: "Price crosses below MA from above — bearish breakdown",
  },
};

// ── MA periods to test ──

const FAST_PERIODS = [10, 20, 50];
const SLOW_PERIODS = [50, 100, 200];
const PRICE_CROSS_PERIODS = [20, 50, 100, 200];

// ── MA computation helpers ──

function computeSMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(prices.length).fill(null);
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

function computeEMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(prices.length).fill(null);
  const k = 2 / (period + 1);
  // seed with SMA of first `period` prices
  let sum = 0;
  for (let i = 0; i < period && i < prices.length; i++) sum += prices[i];
  if (prices.length < period) return result;
  let ema = sum / period;
  result[period - 1] = ema;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

function computeMA(prices: number[], period: number, type: MAType): (number | null)[] {
  return type === "SMA" ? computeSMA(prices, period) : computeEMA(prices, period);
}

// ── Component ──

export default function MACrossoverOptimizer() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [returnMode, setReturnMode] = useState<"threshold" | "band">("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.10);
  const [signalType, setSignalType] = useState<SignalType>("crossover");
  const [maType, setMAType] = useState<MAType>("SMA");
  const [mode, setMode] = useState<"single" | "universe">("single");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<TickerMAResult[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "ticker" | "signal">("score");
  const abortRef = useRef(false);
  const restoredTickerRef = useRef(false);

  const { universeTickers, isFiltered } = useUniverse();

  const tickers = useMemo(() => {
    if (!universeTickers) return allTickers;
    return allTickers.filter((t) => universeTickers.has(t.ticker));
  }, [allTickers, universeTickers]);

  useEffect(() => {
    getTickers().then((t) => {
      setAllTickers(t);
      if (t.length > 0 && !restoredTickerRef.current) setSelectedTicker(t[0].ticker);
    });
  }, []);

  useEffect(() => {
    if (tickers.length > 0 && selectedTicker && !tickers.find((t) => t.ticker === selectedTicker)) {
      setSelectedTicker(tickers[0].ticker);
    }
  }, [tickers, selectedTicker]);

  const runOptimizer = useCallback(async () => {
    setRunning(true);
    setResults([]);
    abortRef.current = false;

    const dates = await getDates();
    const tickerList = mode === "single"
      ? tickers.filter((t) => t.ticker === selectedTicker)
      : tickers;

    if (tickerList.length === 0) { setRunning(false); return; }
    setProgress({ current: 0, total: tickerList.length });

    const allResults: TickerMAResult[] = [];

    for (let ti = 0; ti < tickerList.length; ti++) {
      if (abortRef.current) break;
      const tmeta = tickerList[ti];
      setProgress({ current: ti + 1, total: tickerList.length });

      try {
        const rawData = await getTickerRaw(tmeta.ticker);
        const closePairs = rawData["close"];
        if (!closePairs?.length) continue;

        const closeMap = new Map<number, number>();
        for (const [idx, val] of closePairs) closeMap.set(idx, val);

        const indices: number[] = [];
        for (let i = 0; i < dates.length; i++) {
          if (closeMap.has(i)) indices.push(i);
        }
        if (indices.length < 252) continue;

        const priceValues = indices.map((i) => closeMap.get(i)!);

        const configResults: ConfigResult[] = [];

        if (signalType === "crossover") {
          // Test all fast/slow combos
          for (const fast of FAST_PERIODS) {
            for (const slow of SLOW_PERIODS) {
              if (fast >= slow) continue;

              const fastMA = computeMA(priceValues, fast, maType);
              const slowMA = computeMA(priceValues, slow, maType);

              const categoryProfiles: Record<CrossoverSignal, ForwardReturnProfile[]> = {
                golden_cross: [],
                death_cross: [],
              };

              let prevAbove: boolean | null = null;

              // Start after enough data for slowMA + burn-in
              const startIdx = slow + 126;
              for (let i = startIdx; i < priceValues.length; i++) {
                if (fastMA[i] === null || slowMA[i] === null) continue;
                const above = fastMA[i]! > slowMA[i]!;

                if (prevAbove !== null && above !== prevAbove) {
                  const signal: CrossoverSignal = above ? "golden_cross" : "death_cross";
                  const direction = above ? "buy" : "sell";
                  const activeBand: ReturnBand | null = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
                  categoryProfiles[signal].push(
                    computeForwardProfile(priceValues, i, targetReturn, direction, activeBand)
                  );
                }
                prevAbove = above;
              }

              const categoryResults: CategoryResult[] = [];
              for (const [cat, profiles] of Object.entries(categoryProfiles)) {
                const sc = cat as CrossoverSignal;
                const direction = sc === "golden_cross" ? "buy" : "sell";
                const useBand = returnMode === "band";
                const summary = summarizeSignals(profiles, direction);
                const composite = computeCompositeScore(summary, direction, useBand);
                categoryResults.push({
                  category: sc,
                  label: CROSSOVER_DEFS[sc].label,
                  description: CROSSOVER_DEFS[sc].description,
                  summary,
                  composite,
                });
              }

              const best = categoryResults.reduce((a, b) =>
                a.composite.score > b.composite.score ? a : b, categoryResults[0]);

              configResults.push({
                config: { signalType: "crossover", maType, fastPeriod: fast, slowPeriod: slow },
                configLabel: `${maType} ${fast}/${slow}`,
                categories: categoryResults,
                bestCategory: best.category,
                bestScore: best.composite.score,
              });
            }
          }
        } else {
          // Price cross MA
          for (const period of PRICE_CROSS_PERIODS) {
            const ma = computeMA(priceValues, period, maType);

            const categoryProfiles: Record<PriceCrossSignal, ForwardReturnProfile[]> = {
              price_above: [],
              price_below: [],
            };

            let prevAbove: boolean | null = null;
            const startIdx = period + 126;

            for (let i = startIdx; i < priceValues.length; i++) {
              if (ma[i] === null) continue;
              const above = priceValues[i] > ma[i]!;

              if (prevAbove !== null && above !== prevAbove) {
                const signal: PriceCrossSignal = above ? "price_above" : "price_below";
                const direction = above ? "buy" : "sell";
                const activeBand: ReturnBand | null = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
                categoryProfiles[signal].push(
                  computeForwardProfile(priceValues, i, targetReturn, direction, activeBand)
                );
              }
              prevAbove = above;
            }

            const categoryResults: CategoryResult[] = [];
            for (const [cat, profiles] of Object.entries(categoryProfiles)) {
              const sc = cat as PriceCrossSignal;
              const direction = sc === "price_above" ? "buy" : "sell";
              const useBand = returnMode === "band";
              const summary = summarizeSignals(profiles, direction);
              const composite = computeCompositeScore(summary, direction, useBand);
              categoryResults.push({
                category: sc,
                label: PRICE_CROSS_DEFS[sc].label,
                description: PRICE_CROSS_DEFS[sc].description,
                summary,
                composite,
              });
            }

            const best = categoryResults.reduce((a, b) =>
              a.composite.score > b.composite.score ? a : b, categoryResults[0]);

            configResults.push({
              config: { signalType: "price_cross", maType, fastPeriod: period, slowPeriod: 0 },
              configLabel: `Price × ${maType} ${period}`,
              categories: categoryResults,
              bestCategory: best.category,
              bestScore: best.composite.score,
            });
          }
        }

        if (configResults.length === 0) continue;

        const bestConfig = configResults.reduce((a, b) => a.bestScore > b.bestScore ? a : b);

        // Determine current signal
        let currentSignal = "None";
        {
          if (signalType === "crossover") {
            const fastMA = computeMA(priceValues, bestConfig.config.fastPeriod, maType);
            const slowMA = computeMA(priceValues, bestConfig.config.slowPeriod, maType);
            const last = priceValues.length - 1;
            if (fastMA[last] !== null && slowMA[last] !== null) {
              // Find the most recent crossover
              for (let i = last; i > Math.max(0, last - 63); i--) {
                if (fastMA[i] === null || slowMA[i] === null || fastMA[i - 1] === null || slowMA[i - 1] === null) continue;
                const nowAbove = fastMA[i]! > slowMA[i]!;
                const prevAbove = fastMA[i - 1]! > slowMA[i - 1]!;
                if (nowAbove !== prevAbove) {
                  currentSignal = nowAbove ? "Golden Cross" : "Death Cross";
                  break;
                }
              }
              if (currentSignal === "None") {
                currentSignal = fastMA[last]! > slowMA[last]! ? "Above (Bullish)" : "Below (Bearish)";
              }
            }
          } else {
            const ma = computeMA(priceValues, bestConfig.config.fastPeriod, maType);
            const last = priceValues.length - 1;
            if (ma[last] !== null) {
              for (let i = last; i > Math.max(0, last - 21); i--) {
                if (ma[i] === null || ma[i - 1] === null) continue;
                const nowAbove = priceValues[i] > ma[i]!;
                const prevAbove = priceValues[i - 1] > ma[i - 1]!;
                if (nowAbove !== prevAbove) {
                  currentSignal = nowAbove ? "Price Cross Above" : "Price Cross Below";
                  break;
                }
              }
              if (currentSignal === "None") {
                currentSignal = priceValues[last] > ma[last]! ? "Above MA" : "Below MA";
              }
            }
          }
        }

        const allCatDefs = { ...CROSSOVER_DEFS, ...PRICE_CROSS_DEFS };

        allResults.push({
          ticker: tmeta.ticker,
          name: tmeta.name,
          configs: configResults,
          bestCategory: (allCatDefs as any)[bestConfig.bestCategory]?.label ?? bestConfig.bestCategory,
          bestScore: bestConfig.bestScore,
          currentSignal,
        });

        if (ti % 5 === 0 || ti === tickerList.length - 1) {
          setResults([...allResults]);
        }
      } catch {
        // skip
      }
    }

    setResults(allResults);
    setRunning(false);
  }, [tickers, selectedTicker, mode, signalType, maType, targetReturn, returnMode, bandMin, bandMax]);

  // ── Persistence ──
  const serialize = useCallback(() => ({
    selectedTicker, targetReturn, signalType, maType, mode, results, expandedTicker, sortBy, returnMode, bandMin, bandMax,
  }), [selectedTicker, targetReturn, signalType, maType, mode, results, expandedTicker, sortBy, returnMode, bandMin, bandMax]);

  const restore = useCallback((saved: any) => {
    if (!saved) return;
    if (saved.selectedTicker) { setSelectedTicker(saved.selectedTicker); restoredTickerRef.current = true; }
    if (typeof saved.targetReturn === "number") setTargetReturn(saved.targetReturn);
    if (saved.returnMode) setReturnMode(saved.returnMode);
    if (typeof saved.bandMin === "number") setBandMin(saved.bandMin);
    if (typeof saved.bandMax === "number") setBandMax(saved.bandMax);
    if (saved.signalType) setSignalType(saved.signalType);
    if (saved.maType) setMAType(saved.maType);
    if (saved.mode) setMode(saved.mode);
    if (Array.isArray(saved.results)) setResults(saved.results);
    if (saved.expandedTicker !== undefined) setExpandedTicker(saved.expandedTicker);
    if (saved.sortBy) setSortBy(saved.sortBy);
  }, []);

  useWorkspaceTab("ma-crossover-optimizer", serialize, restore);

  const sortedResults = useMemo(() => {
    const r = [...results];
    if (sortBy === "score") r.sort((a, b) => b.bestScore - a.bestScore);
    else if (sortBy === "ticker") r.sort((a, b) => a.ticker.localeCompare(b.ticker));
    else r.sort((a, b) => a.currentSignal.localeCompare(b.currentSignal));
    return r;
  }, [results, sortBy]);

  const signalBadgeColor = (signal: string): string => {
    if (signal.includes("Golden") || signal.includes("Above")) return "bg-emerald-600/20 text-emerald-400 border-emerald-600/30";
    if (signal.includes("Death") || signal.includes("Below")) return "bg-red-600/20 text-red-400 border-red-600/30";
    if (signal.includes("Bullish")) return "bg-blue-600/20 text-blue-400 border-blue-600/30";
    if (signal.includes("Bearish")) return "bg-orange-600/20 text-orange-400 border-orange-600/30";
    return "bg-muted text-muted-foreground border-border";
  };

  const configCount = signalType === "crossover"
    ? FAST_PERIODS.filter((f) => SLOW_PERIODS.some((s) => f < s)).length * SLOW_PERIODS.length
    : PRICE_CROSS_PERIODS.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground tracking-tight">MA Crossover</h2>
              {isFiltered && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                  {tickers.length}/{allTickers.length}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Test MA crossover & price-cross-MA signals against forward returns
            </p>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal</label>
            <div className="flex gap-px">
              {(["crossover", "price_cross"] as const).map((st) => (
                <button key={st} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${signalType === st ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setSignalType(st)} disabled={running}>
                  {st === "crossover" ? "MA Crossover" : "Price × MA"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">MA Type</label>
            <div className="flex gap-px">
              {(["SMA", "EMA"] as const).map((mt) => (
                <button key={mt} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${maType === mt ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setMAType(mt)} disabled={running}>
                  {mt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
            <div className="flex gap-px">
              {(["single", "universe"] as const).map((m) => (
                <button key={m} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setMode(m)} disabled={running}>
                  {m === "single" ? "Single Ticker" : "Universe"}
                </button>
              ))}
            </div>
          </div>

          {mode === "single" && (
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker</label>
              <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]" value={selectedTicker} onChange={(e) => setSelectedTicker(e.target.value)} disabled={running}>
                {tickers.map((t) => <option key={t.ticker} value={t.ticker}>{t.ticker}</option>)}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Return Measure</label>
            <div className="flex gap-px">
              {(["threshold", "band"] as const).map((m) => (
                <button key={m} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${returnMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setReturnMode(m)} disabled={running}>
                  {m === "threshold" ? "Threshold" : "Band"}
                </button>
              ))}
            </div>
          </div>

          {returnMode === "threshold" ? (
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target</label>
              <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]" value={targetReturn} onChange={(e) => setTargetReturn(Number(e.target.value))} disabled={running}>
                {TARGET_THRESHOLDS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Band</label>
                <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[80px]" value={`${bandMin}-${bandMax}`} onChange={(e) => { const [mn, mx] = e.target.value.split("-").map(Number); setBandMin(mn); setBandMax(mx); }} disabled={running}>
                  {RETURN_BAND_PRESETS.map((p) => <option key={p.label} value={`${p.band.minReturn}-${p.band.maxReturn}`}>{p.label}</option>)}
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
              <button className="text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500" onClick={() => { abortRef.current = true; }}>
                Cancel ({progress.current}/{progress.total})
              </button>
            ) : (
              <button className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90" onClick={runOptimizer}>
                Run Optimizer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {results.length === 0 && !running && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Tests SMA/EMA crossover and price-cross-MA signals against historical forward returns
          </div>
        )}

        {running && results.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Computing MA signals...</div>
              <div className="text-xs font-mono text-muted-foreground">{progress.current}/{progress.total} tickers × {configCount} configs</div>
              <div className="w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        )}

        {sortedResults.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                {sortedResults.length} tickers — {maType} {signalType === "crossover" ? "crossover" : "price cross"} — {returnMode === "band" ? `band ${pct(bandMin)}–${pct(bandMax)}` : `target ${pct(targetReturn)}`}
              </h3>
              <div className="flex gap-1">
                {(["score", "signal", "ticker"] as const).map((s) => (
                  <button key={s} className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`} onClick={() => setSortBy(s)}>
                    {s === "score" ? "Score" : s === "signal" ? "Signal" : "Ticker"}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-border rounded mb-4">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="bg-card text-muted-foreground">
                    <th className="text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border">Ticker</th>
                    <th className="text-center px-2 py-1 font-bold">Current Signal</th>
                    <th className="text-center px-2 py-1 font-bold">Best Config</th>
                    <th className="text-center px-2 py-1 font-bold">Best Signal</th>
                    {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                      <th key={h.label} className="text-center px-2 py-1 font-bold">{returnMode === "band" ? "Band" : "Hit"} {h.label}</th>
                    ))}
                    {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                      <th key={`avg-${h.label}`} className="text-center px-2 py-1 font-bold">Avg {h.label}</th>
                    ))}
                    {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                      <th key={`pf-${h.label}`} className="text-center px-2 py-1 font-bold">PF {h.label}</th>
                    ))}
                    <th className="text-center px-2 py-1 font-bold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((tr) => {
                    const isExpanded = expandedTicker === tr.ticker;
                    const bestConfig = tr.configs.reduce((a, b) => a.bestScore > b.bestScore ? a : b, tr.configs[0]);
                    const bestCat = bestConfig?.categories.reduce((a, b) => a.composite.score > b.composite.score ? a : b, bestConfig.categories[0]);
                    const summary = bestCat?.summary;

                    return (
                      <tr key={tr.ticker} className={`${isExpanded ? "bg-primary/10" : "hover:bg-white/5"} cursor-pointer`} onClick={() => setExpandedTicker(isExpanded ? null : tr.ticker)}>
                        <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border">{tr.ticker}</td>
                        <td className="text-center px-2 py-1">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${signalBadgeColor(tr.currentSignal)}`}>
                            {tr.currentSignal}
                          </span>
                        </td>
                        <td className="text-center px-2 py-1 text-muted-foreground">{bestConfig?.configLabel}</td>
                        <td className="text-center px-2 py-1 text-primary font-bold">{tr.bestCategory}</td>
                        {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => {
                          const rate = summary ? (returnMode === "band" ? (summary.bandHitRate?.[h.label] ?? summary.hitRate[h.label]) : summary.hitRate[h.label]) : 0;
                          return (
                            <td key={h.label} className={`text-center px-2 py-1 ${summary ? hitRateColor(rate) : ""}`}>
                              {summary ? pct(rate) : "–"}
                            </td>
                          );
                        })}
                        {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                          <td key={`avg-${h.label}`} className={`text-center px-2 py-1 ${summary ? (summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400") : ""}`}>
                            {summary ? pctSigned(summary.avgReturn[h.label]) : "–"}
                          </td>
                        ))}
                        {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                          <td key={`pf-${h.label}`} className={`text-center px-2 py-1 ${summary ? profitFactorColor(summary.profitFactor[h.label]) : ""}`}>
                            {summary ? (summary.profitFactor[h.label] >= 99 ? "∞" : summary.profitFactor[h.label].toFixed(2)) : "–"}
                          </td>
                        ))}
                        <td className="text-center px-2 py-1">
                          <span className="inline-block px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: scoreColor(tr.bestScore), color: scoreTextColor(tr.bestScore) }}>
                            {tr.bestScore}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Expanded detail */}
            {expandedTicker && (() => {
              const tr = results.find((r) => r.ticker === expandedTicker);
              if (!tr) return null;

              // Show all configs sorted by score
              const sortedConfigs = [...tr.configs].sort((a, b) => b.bestScore - a.bestScore);

              return (
                <div className="border border-border rounded p-3 bg-card/50 mb-4">
                  <h4 className="text-xs font-bold text-foreground mb-1">
                    {tr.ticker} — {tr.name}
                  </h4>
                  <p className="text-[9px] text-muted-foreground mb-3">
                    {sortedConfigs.length} configurations tested — showing top results
                  </p>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {sortedConfigs.slice(0, 6).map((cfg, ci) => {
                      const bestCat = cfg.categories.reduce((a, b) => a.composite.score > b.composite.score ? a : b, cfg.categories[0]);
                      return (
                        <div key={ci} className="border border-border/50 rounded p-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-mono font-bold text-foreground">{cfg.configLabel}</span>
                            <span className="text-[9px] text-muted-foreground">→ {bestCat.label}</span>
                            <span className="ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: scoreColor(cfg.bestScore), color: scoreTextColor(cfg.bestScore) }}>
                              {cfg.bestScore}
                            </span>
                          </div>

                          {cfg.categories.filter((c) => c.summary.count > 0).map((cat) => (
                            <div key={cat.category} className="mt-1">
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className={`text-[9px] font-bold ${signalBadgeColor(cat.label).split(" ").filter(c => c.startsWith("text-")).join(" ")}`}>
                                  {cat.label}
                                </span>
                                <span className="text-[8px] text-muted-foreground">{cat.summary.count} signals</span>
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
                                      <td className="px-1 py-0.5 text-foreground font-bold">{h.label}</td>
                                      <td className={`text-center px-1 py-0.5 ${hitRateColor(cat.summary.hitRate[h.label])}`}>{pct(cat.summary.hitRate[h.label])}</td>
                                      <td className={`text-center px-1 py-0.5 ${hitRateColor(cat.summary.winRate[h.label])}`}>{pct(cat.summary.winRate[h.label])}</td>
                                      <td className={`text-center px-1 py-0.5 ${cat.summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(cat.summary.avgReturn[h.label])}</td>
                                      <td className={`text-center px-1 py-0.5 ${cat.summary.medianReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(cat.summary.medianReturn[h.label])}</td>
                                      <td className="text-center px-1 py-0.5 text-green-400">{pctSigned(cat.summary.avgPeak[h.label])}</td>
                                      <td className="text-center px-1 py-0.5 text-red-400">{pctSigned(cat.summary.avgTrough[h.label])}</td>
                                      <td className={`text-center px-1 py-0.5 ${profitFactorColor(cat.summary.profitFactor[h.label])}`}>{cat.summary.profitFactor[h.label] >= 99 ? "∞" : cat.summary.profitFactor[h.label].toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
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
    </div>
  );
}
