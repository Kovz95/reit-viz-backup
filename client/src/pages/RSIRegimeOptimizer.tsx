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

// ── RSI Types ──

type RSIZone = "oversold" | "neutral_low" | "neutral" | "neutral_high" | "overbought";
type RSITransition = "enter_oversold" | "exit_oversold" | "enter_overbought" | "exit_overbought";
type SignalCategory = RSIZone | RSITransition;

interface CategoryResult {
  category: SignalCategory;
  label: string;
  description: string;
  summary: SignalSummary;
  composite: CompositeScore;
}

interface RSIConfig {
  rsiPeriod: number;
  oversoldLevel: number;
  overboughtLevel: number;
}

interface ConfigResult {
  config: RSIConfig;
  configLabel: string;
  categories: CategoryResult[];
  bestCategory: SignalCategory;
  bestScore: number;
}

interface TickerRSIResult {
  ticker: string;
  name: string;
  configs: ConfigResult[];
  bestCategory: string;
  bestScore: number;
  currentSignal: string;
  currentRSI: number | null;
}

// ── Category definitions ──

const CATEGORY_DEFS: Record<SignalCategory, { label: string; description: string; direction: "buy" | "sell" }> = {
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
};

// ── RSI periods and thresholds to test ──

const RSI_PERIODS = [7, 14, 21];
const OVERSOLD_LEVELS = [20, 25, 30, 35];
const OVERBOUGHT_LEVELS = [65, 70, 75, 80];

// ── RSI computation ──

function computeRSI(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(prices.length).fill(null);
  if (prices.length < period + 1) return result;

  // Compute price changes
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  // Seed averages with first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // First RSI value
  if (avgLoss === 0) {
    result[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - 100 / (1 + rs);
  }

  // Subsequent values using Wilder's smoothing
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i + 1] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i + 1] = 100 - 100 / (1 + rs);
    }
  }

  return result;
}

function classifyZone(rsi: number, oversold: number, overbought: number): RSIZone {
  const mid = (oversold + overbought) / 2;
  if (rsi <= oversold) return "oversold";
  if (rsi >= overbought) return "overbought";
  if (rsi < mid - 5) return "neutral_low";
  if (rsi > mid + 5) return "neutral_high";
  return "neutral";
}

// ── Component ──

export default function RSIRegimeOptimizer() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [returnMode, setReturnMode] = useState<"threshold" | "band">("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.10);
  const [signalMode, setSignalMode] = useState<"zone" | "transition">("zone");
  const [mode, setMode] = useState<"single" | "universe">("single");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<TickerRSIResult[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "ticker" | "signal" | "rsi">("score");
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

    const allResults: TickerRSIResult[] = [];

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

        for (const period of RSI_PERIODS) {
          const rsiValues = computeRSI(priceValues, period);

          if (signalMode === "zone") {
            // Test each oversold/overbought combo
            for (const os of OVERSOLD_LEVELS) {
              for (const ob of OVERBOUGHT_LEVELS) {
                if (os >= ob) continue;

                const categoryProfiles: Record<RSIZone, ForwardReturnProfile[]> = {
                  oversold: [],
                  neutral_low: [],
                  neutral: [],
                  neutral_high: [],
                  overbought: [],
                };

                let lastZone: RSIZone | null = null;

                // Start after burn-in
                const startIdx = period + 126;
                for (let i = startIdx; i < priceValues.length; i++) {
                  if (rsiValues[i] === null) continue;
                  const zone = classifyZone(rsiValues[i]!, os, ob);

                  // Only record on zone ENTRY (transition)
                  if (zone !== lastZone) {
                    const direction = CATEGORY_DEFS[zone].direction;
                    const activeBand: ReturnBand | null = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
                    categoryProfiles[zone].push(
                      computeForwardProfile(priceValues, i, targetReturn, direction, activeBand)
                    );
                  }
                  lastZone = zone;
                }

                const categoryResults: CategoryResult[] = [];
                for (const [cat, profiles] of Object.entries(categoryProfiles)) {
                  const sc = cat as RSIZone;
                  const direction = CATEGORY_DEFS[sc].direction;
                  const useBand = returnMode === "band";
                  const summary = summarizeSignals(profiles, direction);
                  const composite = computeCompositeScore(summary, direction, useBand);
                  categoryResults.push({
                    category: sc,
                    label: CATEGORY_DEFS[sc].label,
                    description: CATEGORY_DEFS[sc].description,
                    summary,
                    composite,
                  });
                }

                const best = categoryResults.reduce((a, b) =>
                  a.composite.score > b.composite.score ? a : b, categoryResults[0]);

                configResults.push({
                  config: { rsiPeriod: period, oversoldLevel: os, overboughtLevel: ob },
                  configLabel: `RSI(${period}) ${os}/${ob}`,
                  categories: categoryResults,
                  bestCategory: best.category,
                  bestScore: best.composite.score,
                });
              }
            }
          } else {
            // Transition mode — test enter/exit oversold/overbought
            for (const os of OVERSOLD_LEVELS) {
              for (const ob of OVERBOUGHT_LEVELS) {
                if (os >= ob) continue;

                const categoryProfiles: Record<RSITransition, ForwardReturnProfile[]> = {
                  enter_oversold: [],
                  exit_oversold: [],
                  enter_overbought: [],
                  exit_overbought: [],
                };

                const startIdx = period + 126;
                for (let i = startIdx + 1; i < priceValues.length; i++) {
                  if (rsiValues[i] === null || rsiValues[i - 1] === null) continue;
                  const cur = rsiValues[i]!;
                  const prev = rsiValues[i - 1]!;

                  let signal: RSITransition | null = null;

                  if (cur <= os && prev > os) signal = "enter_oversold";
                  else if (cur > os && prev <= os) signal = "exit_oversold";
                  else if (cur >= ob && prev < ob) signal = "enter_overbought";
                  else if (cur < ob && prev >= ob) signal = "exit_overbought";

                  if (signal) {
                    const direction = CATEGORY_DEFS[signal].direction;
                    const activeBand: ReturnBand | null = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
                    categoryProfiles[signal].push(
                      computeForwardProfile(priceValues, i, targetReturn, direction, activeBand)
                    );
                  }
                }

                const categoryResults: CategoryResult[] = [];
                for (const [cat, profiles] of Object.entries(categoryProfiles)) {
                  const sc = cat as RSITransition;
                  const direction = CATEGORY_DEFS[sc].direction;
                  const useBand = returnMode === "band";
                  const summary = summarizeSignals(profiles, direction);
                  const composite = computeCompositeScore(summary, direction, useBand);
                  categoryResults.push({
                    category: sc,
                    label: CATEGORY_DEFS[sc].label,
                    description: CATEGORY_DEFS[sc].description,
                    summary,
                    composite,
                  });
                }

                const best = categoryResults.reduce((a, b) =>
                  a.composite.score > b.composite.score ? a : b, categoryResults[0]);

                configResults.push({
                  config: { rsiPeriod: period, oversoldLevel: os, overboughtLevel: ob },
                  configLabel: `RSI(${period}) ${os}/${ob}`,
                  categories: categoryResults,
                  bestCategory: best.category,
                  bestScore: best.composite.score,
                });
              }
            }
          }
        }

        if (configResults.length === 0) continue;

        const bestConfig = configResults.reduce((a, b) => a.bestScore > b.bestScore ? a : b);

        // Current RSI + signal
        const rsi14 = computeRSI(priceValues, bestConfig.config.rsiPeriod);
        const currentRSI = rsi14[rsi14.length - 1];
        let currentSignal = "None";

        if (currentRSI !== null) {
          const zone = classifyZone(currentRSI, bestConfig.config.oversoldLevel, bestConfig.config.overboughtLevel);
          currentSignal = CATEGORY_DEFS[zone].label;

          // Check if we just transitioned
          const prevRSI = rsi14[rsi14.length - 2];
          if (prevRSI !== null) {
            const os = bestConfig.config.oversoldLevel;
            const ob = bestConfig.config.overboughtLevel;
            if (currentRSI <= os && prevRSI > os) currentSignal = "→ Oversold";
            else if (currentRSI > os && prevRSI <= os) currentSignal = "← Oversold";
            else if (currentRSI >= ob && prevRSI < ob) currentSignal = "→ Overbought";
            else if (currentRSI < ob && prevRSI >= ob) currentSignal = "← Overbought";
          }
        }

        allResults.push({
          ticker: tmeta.ticker,
          name: tmeta.name,
          configs: configResults,
          bestCategory: CATEGORY_DEFS[bestConfig.bestCategory]?.label ?? bestConfig.bestCategory,
          bestScore: bestConfig.bestScore,
          currentSignal,
          currentRSI: currentRSI !== null ? Math.round(currentRSI * 10) / 10 : null,
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
  }, [tickers, selectedTicker, mode, signalMode, targetReturn, returnMode, bandMin, bandMax]);

  // ── Persistence ──
  const serialize = useCallback(() => ({
    selectedTicker, targetReturn, signalMode, mode, results, expandedTicker, sortBy, returnMode, bandMin, bandMax,
  }), [selectedTicker, targetReturn, signalMode, mode, results, expandedTicker, sortBy, returnMode, bandMin, bandMax]);

  const restore = useCallback((saved: any) => {
    if (!saved) return;
    if (saved.selectedTicker) { setSelectedTicker(saved.selectedTicker); restoredTickerRef.current = true; }
    if (typeof saved.targetReturn === "number") setTargetReturn(saved.targetReturn);
    if (saved.returnMode) setReturnMode(saved.returnMode);
    if (typeof saved.bandMin === "number") setBandMin(saved.bandMin);
    if (typeof saved.bandMax === "number") setBandMax(saved.bandMax);
    if (saved.signalMode) setSignalMode(saved.signalMode);
    if (saved.mode) setMode(saved.mode);
    if (Array.isArray(saved.results)) setResults(saved.results);
    if (saved.expandedTicker !== undefined) setExpandedTicker(saved.expandedTicker);
    if (saved.sortBy) setSortBy(saved.sortBy);
  }, []);

  useWorkspaceTab("rsi-regime-optimizer", serialize, restore);

  const sortedResults = useMemo(() => {
    const r = [...results];
    if (sortBy === "score") r.sort((a, b) => b.bestScore - a.bestScore);
    else if (sortBy === "ticker") r.sort((a, b) => a.ticker.localeCompare(b.ticker));
    else if (sortBy === "rsi") r.sort((a, b) => (b.currentRSI ?? 0) - (a.currentRSI ?? 0));
    else r.sort((a, b) => a.currentSignal.localeCompare(b.currentSignal));
    return r;
  }, [results, sortBy]);

  const rsiBadgeColor = (rsi: number | null): string => {
    if (rsi === null) return "text-muted-foreground";
    if (rsi <= 30) return "text-emerald-400";
    if (rsi <= 40) return "text-green-400";
    if (rsi >= 70) return "text-red-400";
    if (rsi >= 60) return "text-orange-400";
    return "text-yellow-400";
  };

  const signalBadgeColor = (signal: string): string => {
    if (signal.includes("Oversold")) return "bg-emerald-600/20 text-emerald-400 border-emerald-600/30";
    if (signal.includes("Neutral Low")) return "bg-green-600/20 text-green-400 border-green-600/30";
    if (signal.includes("Neutral High")) return "bg-orange-600/20 text-orange-400 border-orange-600/30";
    if (signal.includes("Overbought")) return "bg-red-600/20 text-red-400 border-red-600/30";
    if (signal.includes("Neutral")) return "bg-yellow-600/20 text-yellow-400 border-yellow-600/30";
    if (signal.includes("→")) return "bg-blue-600/20 text-blue-400 border-blue-600/30";
    if (signal.includes("←")) return "bg-purple-600/20 text-purple-400 border-purple-600/30";
    return "bg-muted text-muted-foreground border-border";
  };

  const configCount = RSI_PERIODS.length * OVERSOLD_LEVELS.filter((os) => OVERBOUGHT_LEVELS.some((ob) => os < ob)).length * OVERBOUGHT_LEVELS.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground tracking-tight">RSI Regime</h2>
              {isFiltered && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                  {tickers.length}/{allTickers.length}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Classify RSI regimes and transitions, measure forward returns from each zone
            </p>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal Mode</label>
            <div className="flex gap-px">
              {(["zone", "transition"] as const).map((sm) => (
                <button key={sm} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${signalMode === sm ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setSignalMode(sm)} disabled={running}>
                  {sm === "zone" ? "Zone Entry" : "Transition"}
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
            Classifies RSI regimes (oversold / neutral / overbought) and measures forward returns from each zone entry or transition
          </div>
        )}

        {running && results.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Computing RSI regimes...</div>
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
                {sortedResults.length} tickers — RSI {signalMode} — {returnMode === "band" ? `band ${pct(bandMin)}–${pct(bandMax)}` : `target ${pct(targetReturn)}`}
              </h3>
              <div className="flex gap-1">
                {(["score", "rsi", "signal", "ticker"] as const).map((s) => (
                  <button key={s} className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`} onClick={() => setSortBy(s)}>
                    {s === "score" ? "Score" : s === "rsi" ? "RSI" : s === "signal" ? "Signal" : "Ticker"}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-border rounded mb-4">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="bg-card text-muted-foreground">
                    <th className="text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border">Ticker</th>
                    <th className="text-center px-2 py-1 font-bold">RSI</th>
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
                        <td className={`text-center px-2 py-1 font-bold ${rsiBadgeColor(tr.currentRSI)}`}>
                          {tr.currentRSI !== null ? tr.currentRSI.toFixed(1) : "–"}
                        </td>
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

              const sortedConfigs = [...tr.configs].sort((a, b) => b.bestScore - a.bestScore);

              return (
                <div className="border border-border rounded p-3 bg-card/50 mb-4">
                  <h4 className="text-xs font-bold text-foreground mb-1">
                    {tr.ticker} — {tr.name} — RSI {tr.currentRSI !== null ? tr.currentRSI.toFixed(1) : "N/A"}
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

                          {cfg.categories.filter((c) => c.summary.count > 0).sort((a, b) => b.composite.score - a.composite.score).map((cat) => (
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
