import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  getTickers,
  getDates,
  getTickerRaw,
  metricMultiplier,
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

// ── Types ──

type SignalCategory = "momentum_buy" | "momentum_sell" | "reversal_buy" | "reversal_sell" | "oversold_quality" | "value_trap";

interface CategoryResult {
  category: SignalCategory;
  label: string;
  description: string;
  summary: SignalSummary;
  composite: CompositeScore;
}

interface MomentumConfig {
  lookback: number;
  lookbackLabel: string;
  revisionMetric: string;
  revisionLookback: number;
}

interface TickerMomResult {
  ticker: string;
  name: string;
  configs: ConfigResult[];
  bestCategory: string;
  bestScore: number;
  currentSignal: string; // what bucket is the stock in RIGHT NOW
}

interface ConfigResult {
  config: MomentumConfig;
  categories: CategoryResult[];
  bestCategory: SignalCategory;
  bestScore: number;
}

// ── Momentum lookback windows ──
const MOMENTUM_LOOKBACKS = [
  { days: 21, label: "1M" },
  { days: 63, label: "3M" },
  { days: 126, label: "6M" },
  { days: 252, label: "1Y" },
];

// Revision metrics to cross-reference
const REVISION_METRICS = [
  "EPS FY1", "EPS FY2",
  "FFO FY1", "FFO FY2",
  "AFFO FY1", "AFFO FY2",
  "Sales FY1", "Sales FY2",
  "EBITDA FY1", "EBITDA FY2",
];

const REVISION_LOOKBACKS = [
  { days: 21, label: "1M" },
  { days: 42, label: "2M" },
  { days: 63, label: "3M" },
];

// ── Signal classification ──

const CATEGORY_DEFS: Record<SignalCategory, { label: string; description: string }> = {
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

// ── Helpers ──

function computeMomentum(prices: number[], lookback: number): (number | null)[] {
  const result: (number | null)[] = new Array(prices.length).fill(null);
  for (let i = lookback; i < prices.length; i++) {
    if (prices[i - lookback] > 0) {
      result[i] = (prices[i] - prices[i - lookback]) / prices[i - lookback];
    }
  }
  return result;
}

function computeRevisionChange(values: number[], lookback: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  for (let i = lookback; i < values.length; i++) {
    if (values[i - lookback] !== 0) {
      result[i] = (values[i] - values[i - lookback]) / Math.abs(values[i - lookback]);
    }
  }
  return result;
}

function computePercentileRank(values: (number | null)[], i: number, window: number): number | null {
  const start = Math.max(0, i - window + 1);
  const valid: number[] = [];
  for (let j = start; j <= i; j++) {
    if (values[j] !== null) valid.push(values[j]!);
  }
  if (valid.length < 10) return null;
  const cur = values[i];
  if (cur === null) return null;
  const below = valid.filter((v) => v < cur).length;
  return below / valid.length;
}

// ── Component ──

export default function MomentumOptimizer() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [returnMode, setReturnMode] = useState<"threshold" | "band">("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.10);
  const [selectedRevMetric, setSelectedRevMetric] = useState("FFO FY2");
  const [momThreshold, setMomThreshold] = useState(0.20); // 20th/80th percentile
  const [revThreshold, setRevThreshold] = useState(0.02); // 2% revision = meaningful
  const [mode, setMode] = useState<"single" | "universe">("single");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<TickerMomResult[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "ticker" | "signal">("score");
  const abortRef = useRef(false);
  const restoredTickerRef = useRef(false);

  const { universeTickers, isFiltered } = useUniverse();

  const tickers = useMemo(() => {
    if (!universeTickers) return allTickers;
    return allTickers.filter((t) => universeTickers.has(t.ticker));
  }, [allTickers, universeTickers]);

  const [availableRevMetrics, setAvailableRevMetrics] = useState<string[]>(REVISION_METRICS);

  useEffect(() => {
    getTickers().then((t) => {
      setAllTickers(t);
      if (t.length > 0 && !restoredTickerRef.current) setSelectedTicker(t[0].ticker);
      if (t.length > 0 && t[0].metrics) {
        const metricNames = t[0].metrics.map((m: any) => typeof m === "string" ? m : m.name || m);
        const available = REVISION_METRICS.filter((m) => metricNames.includes(m));
        if (available.length > 0) setAvailableRevMetrics(available);
      }
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

    const allResults: TickerMomResult[] = [];

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

        // Load revision metric
        const revPairs = rawData[selectedRevMetric];
        const revMap = new Map<number, number>();
        const revMult = metricMultiplier(selectedRevMetric);
        if (revPairs?.length) {
          for (const [idx, val] of revPairs) revMap.set(idx, val * revMult);
        }

        // Build aligned arrays
        const indices: number[] = [];
        for (let i = 0; i < dates.length; i++) {
          if (closeMap.has(i)) indices.push(i);
        }
        if (indices.length < 252) continue;

        const priceValues = indices.map((i) => closeMap.get(i)!);
        const revValues = indices.map((i) => revMap.get(i) ?? NaN);
        const hasRevisions = revValues.some((v) => !isNaN(v));

        const configResults: ConfigResult[] = [];

        for (const momLB of MOMENTUM_LOOKBACKS) {
          const momentum = computeMomentum(priceValues, momLB.days);

          for (const revLB of (hasRevisions ? REVISION_LOOKBACKS : [{ days: 63, label: "3M" }])) {
            const revChanges = hasRevisions ? computeRevisionChange(revValues, revLB.days) : null;

            // Classify each day into a signal category
            const categoryProfiles: Record<SignalCategory, ForwardReturnProfile[]> = {
              momentum_buy: [],
              momentum_sell: [],
              reversal_buy: [],
              reversal_sell: [],
              oversold_quality: [],
              value_trap: [],
            };

            // Track the most recent signal for "current signal"
            let lastSignal: SignalCategory | null = null;

            for (let i = Math.max(momLB.days, revLB.days) + 252; i < priceValues.length; i++) {
              const mom = momentum[i];
              if (mom === null) continue;

              // Compute momentum percentile rank (within 1Y rolling window)
              const momPctile = computePercentileRank(momentum, i, 252);
              if (momPctile === null) continue;

              // Estimate revision direction
              let revDirection: "positive" | "negative" | "neutral" = "neutral";
              if (revChanges && revChanges[i] !== null) {
                if (revChanges[i]! > revThreshold) revDirection = "positive";
                else if (revChanges[i]! < -revThreshold) revDirection = "negative";
              }

              // Classify
              let category: SignalCategory | null = null;

              const isStrongMom = momPctile >= (1 - momThreshold); // top quintile
              const isWeakMom = momPctile <= momThreshold; // bottom quintile
              const isExtremeWeak = momPctile <= momThreshold / 2; // bottom 10%

              if (isExtremeWeak && revDirection === "positive") {
                category = "oversold_quality";
              } else if (isExtremeWeak && revDirection === "negative") {
                category = "value_trap";
              } else if (isWeakMom && revDirection !== "negative") {
                category = "reversal_buy";
              } else if (isStrongMom && revDirection === "negative") {
                category = "reversal_sell";
              } else if (isStrongMom && revDirection !== "negative") {
                category = "momentum_buy";
              } else if (isWeakMom && revDirection === "negative") {
                category = "momentum_sell";
              }

              if (category === null) {
                lastSignal = null;
                continue;
              }

              // Only record entry signals (transition into category)
              if (lastSignal !== category) {
                const direction = ["momentum_buy", "reversal_buy", "oversold_quality"].includes(category) ? "buy" : "sell";
                const activeBand: ReturnBand | null = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
                categoryProfiles[category].push(
                  computeForwardProfile(priceValues, i, targetReturn, direction as "buy" | "sell", activeBand)
                );
              }

              lastSignal = category;
            }

            const categoryResults: CategoryResult[] = [];
            for (const [cat, profiles] of Object.entries(categoryProfiles)) {
              const sc = cat as SignalCategory;
              const direction = ["momentum_buy", "reversal_buy", "oversold_quality"].includes(sc) ? "buy" : "sell";
              const useBand = returnMode === "band";
              const summary = summarizeSignals(profiles, direction as "buy" | "sell");
              const composite = computeCompositeScore(summary, direction as "buy" | "sell", useBand);
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
              config: {
                lookback: momLB.days,
                lookbackLabel: momLB.label,
                revisionMetric: selectedRevMetric,
                revisionLookback: revLB.days,
              },
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
          const momLB = bestConfig.config.lookback;
          const momentum = computeMomentum(priceValues, momLB);
          const lastMom = momentum[momentum.length - 1];
          const lastMomPctile = computePercentileRank(momentum, momentum.length - 1, 252);
          const revChanges = hasRevisions ? computeRevisionChange(revValues, bestConfig.config.revisionLookback) : null;
          const lastRev = revChanges ? revChanges[revChanges.length - 1] : null;

          if (lastMomPctile !== null) {
            const isStrong = lastMomPctile >= (1 - momThreshold);
            const isWeak = lastMomPctile <= momThreshold;
            const isExtreme = lastMomPctile <= momThreshold / 2;
            const revDir = lastRev !== null ? (lastRev > revThreshold ? "positive" : lastRev < -revThreshold ? "negative" : "neutral") : "neutral";

            if (isExtreme && revDir === "positive") currentSignal = "Deep Value";
            else if (isExtreme && revDir === "negative") currentSignal = "Value Trap";
            else if (isWeak && revDir !== "negative") currentSignal = "Oversold Quality";
            else if (isStrong && revDir === "negative") currentSignal = "Overbought Fade";
            else if (isStrong && revDir !== "negative") currentSignal = "Momentum Long";
            else if (isWeak && revDir === "negative") currentSignal = "Momentum Short";
          }
        }

        allResults.push({
          ticker: tmeta.ticker,
          name: tmeta.name,
          configs: configResults,
          bestCategory: CATEGORY_DEFS[bestConfig.bestCategory].label,
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
  }, [tickers, selectedTicker, selectedRevMetric, momThreshold, revThreshold, targetReturn, mode, returnMode, bandMin, bandMax]);

  // ── Persistence ──
  const serialize = useCallback(() => ({
    selectedTicker, targetReturn, selectedRevMetric, momThreshold, revThreshold, mode, results, expandedTicker, sortBy, returnMode, bandMin, bandMax,
  }), [selectedTicker, targetReturn, selectedRevMetric, momThreshold, revThreshold, mode, results, expandedTicker, sortBy, returnMode, bandMin, bandMax]);

  const restore = useCallback((saved: any) => {
    if (!saved) return;
    if (saved.selectedTicker) { setSelectedTicker(saved.selectedTicker); restoredTickerRef.current = true; }
    if (typeof saved.targetReturn === "number") setTargetReturn(saved.targetReturn);
    if (saved.returnMode) setReturnMode(saved.returnMode);
    if (typeof saved.bandMin === "number") setBandMin(saved.bandMin);
    if (typeof saved.bandMax === "number") setBandMax(saved.bandMax);
    if (saved.selectedRevMetric) setSelectedRevMetric(saved.selectedRevMetric);
    if (typeof saved.momThreshold === "number") setMomThreshold(saved.momThreshold);
    if (typeof saved.revThreshold === "number") setRevThreshold(saved.revThreshold);
    if (saved.mode) setMode(saved.mode);
    if (Array.isArray(saved.results)) setResults(saved.results);
    if (saved.expandedTicker !== undefined) setExpandedTicker(saved.expandedTicker);
    if (saved.sortBy) setSortBy(saved.sortBy);
  }, []);

  useWorkspaceTab("momentum-optimizer", serialize, restore);

  const sortedResults = useMemo(() => {
    const r = [...results];
    if (sortBy === "score") r.sort((a, b) => b.bestScore - a.bestScore);
    else if (sortBy === "ticker") r.sort((a, b) => a.ticker.localeCompare(b.ticker));
    else r.sort((a, b) => a.currentSignal.localeCompare(b.currentSignal));
    return r;
  }, [results, sortBy]);

  const signalBadgeColor = (signal: string): string => {
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground tracking-tight">Momentum / Reversal</h2>
              {isFiltered && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                  {tickers.length}/{allTickers.length}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Cross momentum with estimate revisions to classify: momentum, oversold quality, value trap, overbought fade
            </p>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Revision Metric</label>
            <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[110px]" value={selectedRevMetric} onChange={(e) => setSelectedRevMetric(e.target.value)} disabled={running}>
              {availableRevMetrics.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
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
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mom %ile</label>
            <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[60px]" value={momThreshold} onChange={(e) => setMomThreshold(Number(e.target.value))} disabled={running}>
              <option value={0.10}>10%</option>
              <option value={0.15}>15%</option>
              <option value={0.20}>20%</option>
              <option value={0.25}>25%</option>
              <option value={0.30}>30%</option>
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Rev Δ</label>
            <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[60px]" value={revThreshold} onChange={(e) => setRevThreshold(Number(e.target.value))} disabled={running}>
              <option value={0.01}>1%</option>
              <option value={0.02}>2%</option>
              <option value={0.03}>3%</option>
              <option value={0.05}>5%</option>
            </select>
          </div>

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
            Cross-references price momentum with estimate revision direction to classify buy/sell signals
          </div>
        )}

        {running && results.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Classifying signals...</div>
              <div className="text-xs font-mono text-muted-foreground">{progress.current}/{progress.total} tickers × {MOMENTUM_LOOKBACKS.length} windows × {REVISION_LOOKBACKS.length} rev windows</div>
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
                {sortedResults.length} tickers — {selectedRevMetric} revisions — {returnMode === "band" ? `band ${pct(bandMin)}–${pct(bandMax)}` : `target ${pct(targetReturn)}`}
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
                    <th className="text-center px-2 py-1 font-bold">Best Category</th>
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
              const bestConfig = tr.configs.reduce((a, b) => a.bestScore > b.bestScore ? a : b, tr.configs[0]);

              return (
                <div className="border border-border rounded p-3 bg-card/50 mb-4">
                  <h4 className="text-xs font-bold text-foreground mb-1">
                    {tr.ticker} — {tr.name}
                  </h4>
                  <p className="text-[9px] text-muted-foreground mb-3">
                    Best config: {bestConfig.config.lookbackLabel} momentum × {bestConfig.config.revisionLookback}d revision lookback on {bestConfig.config.revisionMetric}
                  </p>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {bestConfig.categories.filter((c) => c.summary.count > 0).sort((a, b) => b.composite.score - a.composite.score).map((cat) => (
                      <div key={cat.category} className="border border-border/50 rounded p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-mono font-bold ${signalBadgeColor(cat.label).split(" ").filter(c => c.startsWith("text-")).join(" ")}`}>
                            {cat.label}
                          </span>
                          <span className="text-[9px] text-muted-foreground">{cat.summary.count} signals</span>
                          <span className="ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: scoreColor(cat.composite.score), color: scoreTextColor(cat.composite.score) }}>
                            {cat.composite.score}
                          </span>
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
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
