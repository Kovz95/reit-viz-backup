import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  getTickers,
  getDates,
  getTickerRaw,
  getMetricSeries,
  metricMultiplier,
} from "@/lib/dataService";
import type { TickerMeta, TimeValue } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";

// ── Types ──

interface SignalEvent {
  date: string;
  zScore: number;
  direction: "buy" | "sell";
  fwd1M: number | null;
  fwd3M: number | null;
  fwd6M: number | null;
}

interface WindowResult {
  window: number;
  buySignals: number;
  sellSignals: number;
  buyHitRate1M: number;
  buyHitRate3M: number;
  buyHitRate6M: number;
  sellHitRate1M: number;
  sellHitRate3M: number;
  sellHitRate6M: number;
  buyAvgReturn1M: number;
  buyAvgReturn3M: number;
  buyAvgReturn6M: number;
  sellAvgReturn1M: number;
  sellAvgReturn3M: number;
  sellAvgReturn6M: number;
  compositeScore: number;
}

interface TickerResult {
  ticker: string;
  name: string;
  results: WindowResult[];
  bestWindow: number;
  bestScore: number;
}

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

// Trading days per forward period
const FWD_1M = 21;
const FWD_3M = 63;
const FWD_6M = 126;

// ── Engine: compute z-score signals and forward returns ──

function computeRollingZScores(
  values: number[],
  window: number
): (number | null)[] {
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
    if (std > 0) {
      result[i] = (values[i] - mean) / std;
    }
  }
  return result;
}

function analyzeWindow(
  metricValues: number[],
  priceValues: number[],
  dates: string[],
  window: number,
  buyThreshold: number,
  sellThreshold: number
): WindowResult {
  const zScores = computeRollingZScores(metricValues, window);

  // Detect signal crossings
  const signals: SignalEvent[] = [];
  let prevZ: number | null = null;

  for (let i = 0; i < zScores.length; i++) {
    const z = zScores[i];
    if (z === null) { prevZ = null; continue; }

    // Buy signal: z crosses below buyThreshold (e.g. -2)
    if (prevZ !== null && prevZ >= buyThreshold && z < buyThreshold) {
      const fwd1M = i + FWD_1M < priceValues.length
        ? (priceValues[i + FWD_1M] - priceValues[i]) / priceValues[i]
        : null;
      const fwd3M = i + FWD_3M < priceValues.length
        ? (priceValues[i + FWD_3M] - priceValues[i]) / priceValues[i]
        : null;
      const fwd6M = i + FWD_6M < priceValues.length
        ? (priceValues[i + FWD_6M] - priceValues[i]) / priceValues[i]
        : null;
      signals.push({ date: dates[i], zScore: z, direction: "buy", fwd1M, fwd3M, fwd6M });
    }
    // Sell signal: z crosses above sellThreshold (e.g. +2)
    if (prevZ !== null && prevZ <= sellThreshold && z > sellThreshold) {
      const fwd1M = i + FWD_1M < priceValues.length
        ? (priceValues[i + FWD_1M] - priceValues[i]) / priceValues[i]
        : null;
      const fwd3M = i + FWD_3M < priceValues.length
        ? (priceValues[i + FWD_3M] - priceValues[i]) / priceValues[i]
        : null;
      const fwd6M = i + FWD_6M < priceValues.length
        ? (priceValues[i + FWD_6M] - priceValues[i]) / priceValues[i]
        : null;
      signals.push({ date: dates[i], zScore: z, direction: "sell", fwd1M, fwd3M, fwd6M });
    }

    prevZ = z;
  }

  const buySignals = signals.filter((s) => s.direction === "buy");
  const sellSignals = signals.filter((s) => s.direction === "sell");

  const hitRate = (arr: SignalEvent[], key: "fwd1M" | "fwd3M" | "fwd6M", positive: boolean) => {
    const valid = arr.filter((s) => s[key] !== null);
    if (valid.length === 0) return 0;
    const hits = valid.filter((s) => positive ? s[key]! > 0 : s[key]! < 0);
    return hits.length / valid.length;
  };

  const avgReturn = (arr: SignalEvent[], key: "fwd1M" | "fwd3M" | "fwd6M") => {
    const valid = arr.filter((s) => s[key] !== null);
    if (valid.length === 0) return 0;
    return valid.reduce((sum, s) => sum + s[key]!, 0) / valid.length;
  };

  const buyHitRate1M = hitRate(buySignals, "fwd1M", true);
  const buyHitRate3M = hitRate(buySignals, "fwd3M", true);
  const buyHitRate6M = hitRate(buySignals, "fwd6M", true);
  const sellHitRate1M = hitRate(sellSignals, "fwd1M", false);
  const sellHitRate3M = hitRate(sellSignals, "fwd3M", false);
  const sellHitRate6M = hitRate(sellSignals, "fwd6M", false);

  const buyAvgReturn1M = avgReturn(buySignals, "fwd1M");
  const buyAvgReturn3M = avgReturn(buySignals, "fwd3M");
  const buyAvgReturn6M = avgReturn(buySignals, "fwd6M");
  const sellAvgReturn1M = avgReturn(sellSignals, "fwd1M");
  const sellAvgReturn3M = avgReturn(sellSignals, "fwd3M");
  const sellAvgReturn6M = avgReturn(sellSignals, "fwd6M");

  // Composite score: weighted average of hit rates, penalize low signal count
  const totalSignals = buySignals.length + sellSignals.length;
  const signalPenalty = totalSignals < 3 ? 0.5 : totalSignals < 5 ? 0.75 : 1;

  const buyScore = (buyHitRate1M * 0.2 + buyHitRate3M * 0.35 + buyHitRate6M * 0.45) *
    (buySignals.length > 0 ? 1 : 0);
  const sellScore = (sellHitRate1M * 0.2 + sellHitRate3M * 0.35 + sellHitRate6M * 0.45) *
    (sellSignals.length > 0 ? 1 : 0);

  const directionCount = (buySignals.length > 0 ? 1 : 0) + (sellSignals.length > 0 ? 1 : 0);
  const compositeScore = directionCount > 0
    ? ((buyScore + sellScore) / directionCount) * signalPenalty
    : 0;

  return {
    window,
    buySignals: buySignals.length,
    sellSignals: sellSignals.length,
    buyHitRate1M, buyHitRate3M, buyHitRate6M,
    sellHitRate1M, sellHitRate3M, sellHitRate6M,
    buyAvgReturn1M, buyAvgReturn3M, buyAvgReturn6M,
    sellAvgReturn1M, sellAvgReturn3M, sellAvgReturn6M,
    compositeScore,
  };
}

// ── Component ──

export default function ZScoreOptimizer() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const [selectedMetric, setSelectedMetric] = useState("P/FFO LTM");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [mode, setMode] = useState<"single" | "universe">("single");
  const [buyThreshold, setBuyThreshold] = useState(-2);
  const [sellThreshold, setSellThreshold] = useState(2);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<TickerResult[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"bestScore" | "ticker">("bestScore");
  const abortRef = useRef(false);
  const restoredTickerRef = useRef(false);

  const { universeTickers, isFiltered } = useUniverse();

  // Filter tickers by universe
  const tickers = useMemo(() => {
    if (!universeTickers) return allTickers;
    return allTickers.filter((t) => universeTickers.has(t.ticker));
  }, [allTickers, universeTickers]);

  // Load tickers on mount
  useEffect(() => {
    getTickers().then((t) => {
      setAllTickers(t);
      // Only set default ticker if restore hasn't already filled it
      if (t.length > 0 && !restoredTickerRef.current) setSelectedTicker(t[0].ticker);
    });
  }, []);

  // If selected ticker gets filtered out by universe, pick first available
  // (skip when selectedTicker is empty — let restore fill it first)
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

    if (tickerList.length === 0) {
      setRunning(false);
      return;
    }

    setProgress({ current: 0, total: tickerList.length });

    const allResults: TickerResult[] = [];

    for (let ti = 0; ti < tickerList.length; ti++) {
      if (abortRef.current) break;

      const tmeta = tickerList[ti];
      setProgress({ current: ti + 1, total: tickerList.length });

      try {
        const rawData = await getTickerRaw(tmeta.ticker);
        const mult = metricMultiplier(selectedMetric);

        // Build aligned arrays: metric values and price values indexed by date
        const metricPairs = rawData[selectedMetric];
        const closePairs = rawData["close"];
        if (!metricPairs || metricPairs.length === 0 || !closePairs || closePairs.length === 0) continue;

        // Create dense arrays aligned to dates
        const metricMap = new Map<number, number>();
        for (const [idx, val] of metricPairs) metricMap.set(idx, val * mult);
        const closeMap = new Map<number, number>();
        for (const [idx, val] of closePairs) closeMap.set(idx, val);

        // Find range where both metric and close exist
        const allIndices: number[] = [];
        for (let i = 0; i < dates.length; i++) {
          if (metricMap.has(i) && closeMap.has(i)) allIndices.push(i);
        }
        if (allIndices.length < 50) continue; // too few data points

        const metricValues = allIndices.map((i) => metricMap.get(i)!);
        const priceValues = allIndices.map((i) => closeMap.get(i)!);
        const alignedDates = allIndices.map((i) => dates[i]);

        // Test each candidate window
        const windowResults: WindowResult[] = [];
        for (const w of CANDIDATE_WINDOWS) {
          if (w > metricValues.length * 0.8) continue; // skip windows larger than 80% of data
          const wr = analyzeWindow(metricValues, priceValues, alignedDates, w, buyThreshold, sellThreshold);
          windowResults.push(wr);
        }

        if (windowResults.length === 0) continue;

        // Find best window
        const best = windowResults.reduce((a, b) => a.compositeScore > b.compositeScore ? a : b);

        allResults.push({
          ticker: tmeta.ticker,
          name: tmeta.name,
          results: windowResults,
          bestWindow: best.window,
          bestScore: best.compositeScore,
        });

        // Stream results incrementally
        if (ti % 5 === 0 || ti === tickerList.length - 1) {
          setResults([...allResults]);
        }
      } catch {
        // skip ticker on error
      }
    }

    setResults(allResults);
    setRunning(false);
  }, [tickers, selectedTicker, selectedMetric, mode, buyThreshold, sellThreshold]);

  // ── Workspace tab persistence ──
  const serialize = useCallback(() => ({
    selectedMetric,
    selectedTicker,
    mode,
    buyThreshold,
    sellThreshold,
    results,
    expandedTicker,
    sortBy,
  }), [selectedMetric, selectedTicker, mode, buyThreshold, sellThreshold, results, expandedTicker, sortBy]);

  const restore = useCallback((saved: any) => {
    if (!saved) return;
    if (saved.selectedMetric) setSelectedMetric(saved.selectedMetric);
    if (saved.selectedTicker) {
      setSelectedTicker(saved.selectedTicker);
      restoredTickerRef.current = true;
    }
    if (saved.mode) setMode(saved.mode);
    if (typeof saved.buyThreshold === "number") setBuyThreshold(saved.buyThreshold);
    if (typeof saved.sellThreshold === "number") setSellThreshold(saved.sellThreshold);
    if (Array.isArray(saved.results)) setResults(saved.results);
    if (saved.expandedTicker !== undefined) setExpandedTicker(saved.expandedTicker);
    if (saved.sortBy) setSortBy(saved.sortBy);
  }, []);

  useWorkspaceTab("z-optimizer", serialize, restore);

  const sortedResults = useMemo(() => {
    const r = [...results];
    if (sortBy === "bestScore") r.sort((a, b) => b.bestScore - a.bestScore);
    else r.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return r;
  }, [results, sortBy]);

  // ── Heatmap data for universe mode ──
  const heatmapData = useMemo(() => {
    if (results.length === 0) return null;
    // Get all windows that appear in any result
    const windowSet = new Set<number>();
    for (const r of results) for (const wr of r.results) windowSet.add(wr.window);
    const windows = [...windowSet].sort((a, b) => a - b);

    // Build matrix: rows = tickers sorted by best score, cols = windows
    const sorted = [...results].sort((a, b) => b.bestScore - a.bestScore);
    const matrix: { ticker: string; scores: (number | null)[] }[] = [];
    for (const tr of sorted) {
      const scoreMap = new Map(tr.results.map((wr) => [wr.window, wr.compositeScore]));
      matrix.push({
        ticker: tr.ticker,
        scores: windows.map((w) => scoreMap.get(w) ?? null),
      });
    }
    return { windows, matrix };
  }, [results]);

  // Helper to format percentage
  const pct = (v: number) => (v * 100).toFixed(1) + "%";
  const pctSigned = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";

  // Color scale for heatmap — dark-friendly with strong contrast
  const scoreColor = (score: number | null) => {
    if (score === null) return "rgba(255,255,255,0.04)";
    const t = Math.max(0, Math.min(1, score));
    // Deep red → dark orange → muted gold → olive → forest green
    // Low lightness so text stays readable on dark bg
    if (t < 0.3) {
      // Red zone: deep crimson to dark red
      return `hsl(0, 70%, ${12 + t * 30}%)`;
    } else if (t < 0.5) {
      // Orange-amber transition
      const p = (t - 0.3) / 0.2;
      return `hsl(${p * 35}, 65%, ${20 + p * 5}%)`;
    } else if (t < 0.7) {
      // Gold-olive transition
      const p = (t - 0.5) / 0.2;
      return `hsl(${35 + p * 40}, 55%, ${25 + p * 3}%)`;
    } else {
      // Green zone: olive to deep green
      const p = (t - 0.7) / 0.3;
      return `hsl(${75 + p * 50}, ${50 + p * 20}%, ${22 + p * 8}%)`;
    }
  };

  // Text color for score cells — always bright for readability
  const scoreTextColor = (score: number | null) => {
    if (score === null) return "#555";
    const t = Math.max(0, Math.min(1, score));
    if (t < 0.3) return "#ff8a8a";
    if (t < 0.5) return "#ffc170";
    if (t < 0.7) return "#e8d44d";
    return "#7ddf7d";
  };

  const hitRateColor = (rate: number) => {
    if (rate === 0) return "text-muted-foreground/40";
    if (rate >= 0.75) return "text-emerald-400 font-bold";
    if (rate >= 0.6) return "text-green-400";
    if (rate >= 0.5) return "text-yellow-300";
    if (rate >= 0.4) return "text-orange-400";
    return "text-red-400";
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header / Controls */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-6 flex-wrap">
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

          {/* Metric picker */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Metric</label>
            <select
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary min-w-[160px]"
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              disabled={running}
              data-testid="optimizer-metric"
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Mode toggle */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
            <div className="flex gap-px">
              {(["single", "universe"] as const).map((m) => (
                <button
                  key={m}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground border border-border"
                  }`}
                  onClick={() => setMode(m)}
                  disabled={running}
                  data-testid={`optimizer-mode-${m}`}
                >
                  {m === "single" ? "Single Ticker" : "Universe"}
                </button>
              ))}
            </div>
          </div>

          {/* Ticker picker (single mode) */}
          {mode === "single" && (
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker</label>
              <select
                className="text-xs font-mono bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary min-w-[100px]"
                value={selectedTicker}
                onChange={(e) => setSelectedTicker(e.target.value)}
                disabled={running}
                data-testid="optimizer-ticker"
              >
                {tickers.map((t) => (
                  <option key={t.ticker} value={t.ticker}>{t.ticker}</option>
                ))}
              </select>
            </div>
          )}

          {/* Thresholds */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Buy Threshold (σ)</label>
            <input
              type="number"
              step="0.5"
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-16 focus:outline-none focus:ring-1 focus:ring-primary"
              value={buyThreshold}
              onChange={(e) => setBuyThreshold(Number(e.target.value))}
              disabled={running}
              data-testid="optimizer-buy-threshold"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Sell Threshold (σ)</label>
            <input
              type="number"
              step="0.5"
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-16 focus:outline-none focus:ring-1 focus:ring-primary"
              value={sellThreshold}
              onChange={(e) => setSellThreshold(Number(e.target.value))}
              disabled={running}
              data-testid="optimizer-sell-threshold"
            />
          </div>

          {/* Run / Cancel */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">&nbsp;</label>
            {running ? (
              <button
                className="text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500 transition-colors"
                onClick={() => { abortRef.current = true; }}
                data-testid="optimizer-cancel"
              >
                Cancel ({progress.current}/{progress.total})
              </button>
            ) : (
              <button
                className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                onClick={runOptimizer}
                data-testid="optimizer-run"
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
            Select a metric and click "Run Optimizer" to find the best z-score lookback window
          </div>
        )}

        {running && results.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Analyzing...</div>
              <div className="text-xs font-mono text-muted-foreground">
                {progress.current} / {progress.total} tickers
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

        {/* Heatmap (universe mode) */}
        {mode === "universe" && heatmapData && heatmapData.matrix.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Composite Score Heatmap — {selectedMetric}
              </h3>
              <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-4 h-3 rounded-sm border border-white/10" style={{ background: scoreColor(0) }} />
                  <span style={{ color: scoreTextColor(0) }}>0%</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-3 rounded-sm border border-white/10" style={{ background: scoreColor(0.25) }} />
                  <span style={{ color: scoreTextColor(0.25) }}>25%</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-3 rounded-sm border border-white/10" style={{ background: scoreColor(0.5) }} />
                  <span style={{ color: scoreTextColor(0.5) }}>50%</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-3 rounded-sm border border-white/10" style={{ background: scoreColor(0.75) }} />
                  <span style={{ color: scoreTextColor(0.75) }}>75%</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 h-3 rounded-sm border border-white/10" style={{ background: scoreColor(1) }} />
                  <span style={{ color: scoreTextColor(1) }}>100%</span>
                </span>
              </div>
            </div>
            <div className="overflow-x-auto border border-border rounded">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="bg-card">
                    <th className="text-left px-2 py-1 text-muted-foreground font-bold sticky left-0 bg-card z-10 border-r border-border">
                      Ticker
                    </th>
                    {heatmapData.windows.map((w) => (
                      <th key={w} className="text-center px-2 py-1 text-muted-foreground font-bold whitespace-nowrap">
                        {WINDOW_LABELS[w] || `${w}d`}
                      </th>
                    ))}
                    <th className="text-center px-2 py-1 text-muted-foreground font-bold">Best</th>
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.matrix.map((row) => {
                    const tickerResult = results.find((r) => r.ticker === row.ticker);
                    return (
                      <tr
                        key={row.ticker}
                        className="hover:bg-white/5 cursor-pointer"
                        onClick={() => setExpandedTicker(expandedTicker === row.ticker ? null : row.ticker)}
                      >
                        <td className="px-2 py-1 text-foreground font-bold sticky left-0 bg-card z-10 border-r border-border">
                          {row.ticker}
                        </td>
                        {row.scores.map((score, i) => (
                          <td
                            key={i}
                            className="text-center px-2 py-1 font-bold"
                            style={{ backgroundColor: scoreColor(score), color: scoreTextColor(score) }}
                            title={score !== null ? `${(score * 100).toFixed(0)}%` : "N/A"}
                          >
                            {score !== null ? (score * 100).toFixed(0) : "–"}
                          </td>
                        ))}
                        <td className="text-center px-2 py-1 text-foreground font-bold">
                          {tickerResult ? WINDOW_LABELS[tickerResult.bestWindow] || `${tickerResult.bestWindow}d` : "–"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detail table */}
        {sortedResults.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                {mode === "single" ? "Window Analysis" : "Results by Ticker"} — {selectedMetric}
              </h3>
              {mode === "universe" && (
                <div className="flex gap-1">
                  <button
                    className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === "bestScore" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`}
                    onClick={() => setSortBy("bestScore")}
                  >
                    Sort: Score
                  </button>
                  <button
                    className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === "ticker" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`}
                    onClick={() => setSortBy("ticker")}
                  >
                    Sort: Ticker
                  </button>
                </div>
              )}
            </div>

            {sortedResults.map((tr) => {
              const isExpanded = mode === "single" || expandedTicker === tr.ticker;
              return (
                <div key={tr.ticker} className="mb-3">
                  {mode === "universe" && (
                    <button
                      className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
                      onClick={() => setExpandedTicker(isExpanded ? null : tr.ticker)}
                    >
                      <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                      <span className="text-xs font-mono font-bold text-foreground">{tr.ticker}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{tr.name}</span>
                      <span className="ml-auto text-[10px] font-mono">
                        Best: <span className="text-primary font-bold">{WINDOW_LABELS[tr.bestWindow] || `${tr.bestWindow}d`}</span>
                        {" "}Score: <span className={`font-bold ${tr.bestScore >= 0.75 ? "text-emerald-400" : tr.bestScore >= 0.6 ? "text-green-400" : tr.bestScore >= 0.5 ? "text-yellow-300" : tr.bestScore >= 0.4 ? "text-orange-400" : "text-red-400"}`}>
                          {(tr.bestScore * 100).toFixed(0)}%
                        </span>
                      </span>
                    </button>
                  )}
                  {isExpanded && (
                    <div className="overflow-x-auto border border-border rounded mt-1">
                      <table className="w-full text-[10px] font-mono">
                        <thead>
                          <tr className="bg-card text-muted-foreground">
                            <th className="text-left px-2 py-1 font-bold">Window</th>
                            <th className="text-center px-2 py-1 font-bold">Buy Signals</th>
                            <th className="text-center px-2 py-1 font-bold">Sell Signals</th>
                            <th className="text-center px-2 py-1 font-bold">Buy Hit 1M</th>
                            <th className="text-center px-2 py-1 font-bold">Buy Hit 3M</th>
                            <th className="text-center px-2 py-1 font-bold">Buy Hit 6M</th>
                            <th className="text-center px-2 py-1 font-bold">Buy Avg 6M</th>
                            <th className="text-center px-2 py-1 font-bold">Sell Hit 1M</th>
                            <th className="text-center px-2 py-1 font-bold">Sell Hit 3M</th>
                            <th className="text-center px-2 py-1 font-bold">Sell Hit 6M</th>
                            <th className="text-center px-2 py-1 font-bold">Sell Avg 6M</th>
                            <th className="text-center px-2 py-1 font-bold">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tr.results.map((wr) => {
                            const isBest = wr.window === tr.bestWindow;
                            return (
                              <tr key={wr.window} className={`${isBest ? "bg-primary/15 ring-1 ring-inset ring-primary/30" : "hover:bg-white/5"}`}>
                                <td className={`px-2 py-1 font-bold ${isBest ? "text-primary" : "text-foreground"}`}>
                                  {WINDOW_LABELS[wr.window] || `${wr.window}d`}
                                  {isBest && " ★"}
                                </td>
                                <td className="text-center px-2 py-1 text-foreground">{wr.buySignals}</td>
                                <td className="text-center px-2 py-1 text-foreground">{wr.sellSignals}</td>
                                <td className={`text-center px-2 py-1 ${hitRateColor(wr.buyHitRate1M)}`}>
                                  {wr.buySignals > 0 ? pct(wr.buyHitRate1M) : "–"}
                                </td>
                                <td className={`text-center px-2 py-1 ${hitRateColor(wr.buyHitRate3M)}`}>
                                  {wr.buySignals > 0 ? pct(wr.buyHitRate3M) : "–"}
                                </td>
                                <td className={`text-center px-2 py-1 ${hitRateColor(wr.buyHitRate6M)}`}>
                                  {wr.buySignals > 0 ? pct(wr.buyHitRate6M) : "–"}
                                </td>
                                <td className={`text-center px-2 py-1 ${wr.buyAvgReturn6M >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {wr.buySignals > 0 ? pctSigned(wr.buyAvgReturn6M) : "–"}
                                </td>
                                <td className={`text-center px-2 py-1 ${hitRateColor(wr.sellHitRate1M)}`}>
                                  {wr.sellSignals > 0 ? pct(wr.sellHitRate1M) : "–"}
                                </td>
                                <td className={`text-center px-2 py-1 ${hitRateColor(wr.sellHitRate3M)}`}>
                                  {wr.sellSignals > 0 ? pct(wr.sellHitRate3M) : "–"}
                                </td>
                                <td className={`text-center px-2 py-1 ${hitRateColor(wr.sellHitRate6M)}`}>
                                  {wr.sellSignals > 0 ? pct(wr.sellHitRate6M) : "–"}
                                </td>
                                <td className={`text-center px-2 py-1 ${wr.sellAvgReturn6M <= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {wr.sellSignals > 0 ? pctSigned(wr.sellAvgReturn6M) : "–"}
                                </td>
                                <td className="text-center px-2 py-1">
                                  <span
                                    className="inline-block px-1.5 py-0.5 rounded font-bold"
                                    style={{ backgroundColor: scoreColor(wr.compositeScore), color: scoreTextColor(wr.compositeScore) }}
                                  >
                                    {(wr.compositeScore * 100).toFixed(0)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
