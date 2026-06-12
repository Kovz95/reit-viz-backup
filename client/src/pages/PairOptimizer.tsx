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
  ALL_METRICS,
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
  type ReturnBand,
} from "@/lib/forwardReturns";

// ── Types ──

interface PairResult {
  tickerA: string;
  tickerB: string;
  metric: string;
  halfLife: number;
  adfPValue: number;
  hurstExponent: number;
  /** Best z-score window and thresholds for trading this pair */
  bestWindow: number;
  /** Buy = long spread (spread is cheap), Sell = short spread (spread is rich) */
  buySummary: SignalSummary;
  sellSummary: SignalSummary;
  compositeScore: number;
  bestHorizon: HorizonLabel;
}

// ── Statistical helpers ──

function computeSpreadZScores(
  spreadValues: number[],
  window: number
): (number | null)[] {
  const result: (number | null)[] = new Array(spreadValues.length).fill(null);
  for (let i = 1; i < spreadValues.length; i++) {
    const start = Math.max(0, i - window + 1);
    const n = i - start + 1;
    if (n < 2) continue;
    let sum = 0;
    let sumSq = 0;
    for (let j = start; j <= i; j++) {
      sum += spreadValues[j];
      sumSq += spreadValues[j] * spreadValues[j];
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    if (std > 0) result[i] = (spreadValues[i] - mean) / std;
  }
  return result;
}

/**
 * Estimate half-life of mean reversion via OLS regression:
 *   Δspread(t) = α + β * spread(t-1) + ε
 *   halfLife = -ln(2) / ln(1 + β)
 */
function estimateHalfLife(values: number[]): number {
  if (values.length < 20) return Infinity;
  const n = values.length - 1;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 1; i <= n; i++) {
    const x = values[i - 1];
    const y = values[i] - values[i - 1];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const beta = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  if (beta >= 0) return Infinity; // no mean reversion
  return -Math.log(2) / Math.log(1 + beta);
}

/**
 * Hurst exponent via R/S analysis (simplified).
 * H < 0.5 = mean-reverting, H ≈ 0.5 = random walk, H > 0.5 = trending
 */
function estimateHurst(values: number[]): number {
  if (values.length < 20) return 0.5;
  const returns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    returns.push(values[i] - values[i - 1]);
  }

  const sizes = [8, 16, 32, 64, 128].filter((s) => s <= returns.length / 2);
  if (sizes.length < 2) return 0.5;

  const logN: number[] = [];
  const logRS: number[] = [];

  for (const sz of sizes) {
    const chunks = Math.floor(returns.length / sz);
    if (chunks === 0) continue;
    let rsSum = 0;
    for (let c = 0; c < chunks; c++) {
      const seg = returns.slice(c * sz, (c + 1) * sz);
      const mean = seg.reduce((a, b) => a + b, 0) / seg.length;
      const cumDev: number[] = [];
      let cum = 0;
      for (const r of seg) {
        cum += r - mean;
        cumDev.push(cum);
      }
      const R = Math.max(...cumDev) - Math.min(...cumDev);
      const S = Math.sqrt(seg.reduce((s, r) => s + (r - mean) ** 2, 0) / seg.length);
      rsSum += S > 0 ? R / S : 0;
    }
    const avgRS = rsSum / chunks;
    if (avgRS > 0) {
      logN.push(Math.log(sz));
      logRS.push(Math.log(avgRS));
    }
  }

  if (logN.length < 2) return 0.5;

  // Simple linear regression: logRS = H * logN + c
  const n = logN.length;
  const sumX = logN.reduce((a, b) => a + b, 0);
  const sumY = logRS.reduce((a, b) => a + b, 0);
  const sumXY = logN.reduce((s, x, i) => s + x * logRS[i], 0);
  const sumXX = logN.reduce((s, x) => s + x * x, 0);
  const H = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  return Math.max(0, Math.min(1, H));
}

/**
 * Augmented Dickey-Fuller test (simplified) — returns approximate p-value.
 * Tests: Δy(t) = α + β*y(t-1) + Σ γ*Δy(t-k) + ε
 * If β < 0 and t-stat is very negative, the spread is stationary (mean-reverting).
 */
function adfPValue(values: number[]): number {
  if (values.length < 30) return 1;
  const n = values.length;
  const lags = Math.min(Math.floor(Math.cbrt(n)), 12);
  
  // Compute differences
  const dy: number[] = [];
  for (let i = 1; i < n; i++) dy.push(values[i] - values[i - 1]);
  
  // Simple ADF: regress Δy on y(t-1) (no lagged diffs for speed)
  const nObs = dy.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < nObs; i++) {
    const x = values[i]; // y(t-1)
    const y = dy[i]; // Δy(t)
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const beta = (nObs * sumXY - sumX * sumY) / (nObs * sumXX - sumX * sumX);
  const meanY = sumY / nObs;
  const meanX = sumX / nObs;
  
  // Compute t-statistic
  let ssr = 0;
  for (let i = 0; i < nObs; i++) {
    const predicted = meanY + beta * (values[i] - meanX);
    ssr += (dy[i] - predicted) ** 2;
  }
  const se = Math.sqrt(ssr / (nObs - 2)) / Math.sqrt(sumXX / nObs - meanX ** 2);
  const tStat = se > 0 ? beta / (se / Math.sqrt(nObs)) : 0;

  // Approximate p-value from ADF critical values (with intercept, no trend)
  // 1%: -3.43, 5%: -2.86, 10%: -2.57
  if (tStat < -3.43) return 0.01;
  if (tStat < -2.86) return 0.05;
  if (tStat < -2.57) return 0.10;
  if (tStat < -1.94) return 0.20;
  return 0.50;
}

// ── Candidate windows for spread z-score ──
const PAIR_WINDOWS = [21, 42, 63, 126, 189, 252, 504];

// ── Component ──

export default function PairOptimizer() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const [selectedMetric, setSelectedMetric] = useState("P/FFO LTM");
  const [returnMode, setReturnMode] = useState<"threshold" | "band">("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.10);
  const [buyThreshold, setBuyThreshold] = useState(-2);
  const [sellThreshold, setSellThreshold] = useState(2);
  const [mode, setMode] = useState<"manual" | "scan">("scan");
  const [tickerA, setTickerA] = useState("");
  const [tickerB, setTickerB] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [results, setResults] = useState<PairResult[]>([]);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "halfLife" | "hurst">("score");
  const abortRef = useRef(false);
  const restoredTickerRef = useRef(false);

  const { universeTickers, isFiltered } = useUniverse();

  const tickers = useMemo(() => {
    if (!universeTickers) return allTickers;
    return allTickers.filter((t) => universeTickers.has(t.ticker));
  }, [allTickers, universeTickers]);

  // Available metrics = intersection of ALL_METRICS and what the data actually has
  const [availableMetrics, setAvailableMetrics] = useState<string[]>(ALL_METRICS);

  useEffect(() => {
    getTickers().then((t) => {
      setAllTickers(t);
      if (t.length > 0 && !restoredTickerRef.current) {
        setTickerA(t[0].ticker);
        setTickerB(t.length > 1 ? t[1].ticker : t[0].ticker);
      }
      // Detect available metrics from first ticker
      if (t.length > 0 && t[0].metrics) {
        const metricNames = t[0].metrics.map((m: any) => typeof m === "string" ? m : m.name || m);
        const available = ALL_METRICS.filter((m) => metricNames.includes(m));
        if (available.length > 0) setAvailableMetrics(available);
      }
    });
  }, []);

  const analyzePair = useCallback(async (
    tA: string, tB: string, metric: string, dates: string[],
    target: number, buyTh: number, sellTh: number,
    band: ReturnBand | null
  ): Promise<PairResult | null> => {
    try {
      const [rawA, rawB] = await Promise.all([getTickerRaw(tA), getTickerRaw(tB)]);
      const mult = metricMultiplier(metric);

      const metricA = rawA[metric];
      const metricB = rawB[metric];
      const closeA = rawA["close"];
      const closeB = rawB["close"];
      if (!metricA?.length || !metricB?.length || !closeA?.length || !closeB?.length) return null;

      // Build maps
      const mapA = new Map<number, number>();
      for (const [idx, val] of metricA) mapA.set(idx, val * mult);
      const mapB = new Map<number, number>();
      for (const [idx, val] of metricB) mapB.set(idx, val * mult);
      const closeMapA = new Map<number, number>();
      for (const [idx, val] of closeA) closeMapA.set(idx, val);
      const closeMapB = new Map<number, number>();
      for (const [idx, val] of closeB) closeMapB.set(idx, val);

      // Find overlapping indices where both tickers have metric AND close data
      const indices: number[] = [];
      for (let i = 0; i < dates.length; i++) {
        if (mapA.has(i) && mapB.has(i) && closeMapA.has(i) && closeMapB.has(i)) {
          indices.push(i);
        }
      }
      if (indices.length < 100) return null;

      // Compute spread = metric(A) - metric(B)
      const spread = indices.map((i) => mapA.get(i)! - mapB.get(i)!);
      // Compute pair return = avg of the two stocks' returns (for forward return measurement)
      const pairPrices = indices.map((i) => {
        // Normalise both prices to 1 at start, then average
        return (closeMapA.get(i)! / closeMapA.get(indices[0])! + closeMapB.get(i)! / closeMapB.get(indices[0])!) / 2;
      });
      // For pair trades: long A short B return
      const longShortPrices = indices.map((i) => {
        return closeMapA.get(i)! / closeMapA.get(indices[0])! - closeMapB.get(i)! / closeMapB.get(indices[0])! + 1;
      });

      // Statistical tests on the spread
      const halfLife = estimateHalfLife(spread);
      const hurst = estimateHurst(spread);
      const adfP = adfPValue(spread);

      // Test each candidate window
      let bestResult: {
        window: number;
        buySummary: SignalSummary;
        sellSummary: SignalSummary;
        compositeScore: number;
        bestHorizon: HorizonLabel;
      } | null = null;
      let bestComposite = -1;

      for (const w of PAIR_WINDOWS) {
        if (w > spread.length * 0.8) continue;
        const zScores = computeSpreadZScores(spread, w);

        // Detect signals
        const buyProfiles: ForwardReturnProfile[] = [];
        const sellProfiles: ForwardReturnProfile[] = [];
        let prevZ: number | null = null;

        for (let i = 0; i < zScores.length; i++) {
          const z = zScores[i];
          if (z === null) { prevZ = null; continue; }

          // Buy signal: spread z crosses below buyThreshold (spread is cheap → long A/short B)
          if (prevZ !== null && prevZ >= buyTh && z < buyTh) {
            buyProfiles.push(computeForwardProfile(longShortPrices, i, target, "buy", band));
          }
          // Sell signal: spread z crosses above sellThreshold (spread is rich → short A/long B)
          if (prevZ !== null && prevZ <= sellTh && z > sellTh) {
            sellProfiles.push(computeForwardProfile(longShortPrices, i, target, "sell", band));
          }
          prevZ = z;
        }

        const buySummary = summarizeSignals(buyProfiles, "buy");
        const sellSummary = summarizeSignals(sellProfiles, "sell");

        // Combined score
        const useBand = band !== null;
        const buyComp = computeCompositeScore(buySummary, "buy", useBand);
        const sellComp = computeCompositeScore(sellSummary, "sell", useBand);
        const dirCount = (buySummary.count > 0 ? 1 : 0) + (sellSummary.count > 0 ? 1 : 0);
        const composite = dirCount > 0 ? (buyComp.score + sellComp.score) / (dirCount * 2) * 100 : 0;

        // Boost score for statistically significant mean reversion
        const statBoost = (hurst < 0.45 ? 1.15 : 1) * (adfP <= 0.05 ? 1.10 : 1);
        const adjustedComposite = Math.min(100, composite * statBoost);

        if (adjustedComposite > bestComposite) {
          bestComposite = adjustedComposite;
          bestResult = {
            window: w,
            buySummary,
            sellSummary,
            compositeScore: Math.round(adjustedComposite),
            bestHorizon: buyComp.score >= sellComp.score ? buyComp.bestHorizon : sellComp.bestHorizon,
          };
        }
      }

      if (!bestResult) return null;

      return {
        tickerA: tA,
        tickerB: tB,
        metric,
        halfLife: Math.round(halfLife * 10) / 10,
        adfPValue: adfP,
        hurstExponent: Math.round(hurst * 1000) / 1000,
        bestWindow: bestResult.window,
        buySummary: bestResult.buySummary,
        sellSummary: bestResult.sellSummary,
        compositeScore: bestResult.compositeScore,
        bestHorizon: bestResult.bestHorizon,
      };
    } catch {
      return null;
    }
  }, []);

  const runOptimizer = useCallback(async () => {
    setRunning(true);
    setResults([]);
    abortRef.current = false;

    const dates = await getDates();

    if (mode === "manual") {
      setProgress({ current: 0, total: 1, label: `${tickerA}/${tickerB}` });
      const activeBand: ReturnBand | null = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
      const result = await analyzePair(tickerA, tickerB, selectedMetric, dates, targetReturn, buyThreshold, sellThreshold, activeBand);
      if (result) setResults([result]);
      setProgress({ current: 1, total: 1, label: "" });
    } else {
      // Scan: test all pairs within same subsector
      const subsectorGroups = new Map<string, TickerMeta[]>();
      for (const t of tickers) {
        const key = t.subsector || t.sector || "Other";
        if (!subsectorGroups.has(key)) subsectorGroups.set(key, []);
        subsectorGroups.get(key)!.push(t);
      }

      // Generate all pairs
      const pairs: [string, string][] = [];
      for (const [, group] of subsectorGroups) {
        if (group.length < 2) continue;
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            pairs.push([group[i].ticker, group[j].ticker]);
          }
        }
      }

      setProgress({ current: 0, total: pairs.length, label: "Scanning pairs..." });
      const allResults: PairResult[] = [];

      for (let pi = 0; pi < pairs.length; pi++) {
        if (abortRef.current) break;
        const [a, b] = pairs[pi];
        setProgress({ current: pi + 1, total: pairs.length, label: `${a}/${b}` });

        const activeBand: ReturnBand | null = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
        const result = await analyzePair(a, b, selectedMetric, dates, targetReturn, buyThreshold, sellThreshold, activeBand);
        if (result && result.compositeScore > 0) {
          allResults.push(result);
        }

        // Stream results
        if (pi % 10 === 0 || pi === pairs.length - 1) {
          setResults([...allResults]);
        }
      }

      setResults(allResults);
    }

    setRunning(false);
  }, [tickers, tickerA, tickerB, selectedMetric, mode, targetReturn, buyThreshold, sellThreshold, returnMode, bandMin, bandMax, analyzePair]);

  // ── Persistence ──
  const serialize = useCallback(() => ({
    selectedMetric, targetReturn, buyThreshold, sellThreshold, mode, tickerA, tickerB, results, expandedPair, sortBy, returnMode, bandMin, bandMax,
  }), [selectedMetric, targetReturn, buyThreshold, sellThreshold, mode, tickerA, tickerB, results, expandedPair, sortBy, returnMode, bandMin, bandMax]);

  const restore = useCallback((saved: any) => {
    if (!saved) return;
    if (saved.selectedMetric) setSelectedMetric(saved.selectedMetric);
    if (typeof saved.targetReturn === "number") setTargetReturn(saved.targetReturn);
    if (typeof saved.buyThreshold === "number") setBuyThreshold(saved.buyThreshold);
    if (typeof saved.sellThreshold === "number") setSellThreshold(saved.sellThreshold);
    if (saved.mode) setMode(saved.mode);
    if (saved.returnMode) setReturnMode(saved.returnMode);
    if (typeof saved.bandMin === "number") setBandMin(saved.bandMin);
    if (typeof saved.bandMax === "number") setBandMax(saved.bandMax);
    if (saved.tickerA) { setTickerA(saved.tickerA); restoredTickerRef.current = true; }
    if (saved.tickerB) { setTickerB(saved.tickerB); restoredTickerRef.current = true; }
    if (Array.isArray(saved.results)) setResults(saved.results);
    if (saved.expandedPair !== undefined) setExpandedPair(saved.expandedPair);
    if (saved.sortBy) setSortBy(saved.sortBy);
  }, []);

  useWorkspaceTab("pair-optimizer", serialize, restore);

  const sortedResults = useMemo(() => {
    const r = [...results];
    if (sortBy === "score") r.sort((a, b) => b.compositeScore - a.compositeScore);
    else if (sortBy === "halfLife") r.sort((a, b) => a.halfLife - b.halfLife);
    else r.sort((a, b) => a.hurstExponent - b.hurstExponent);
    return r;
  }, [results, sortBy]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground tracking-tight">Pair Optimizer</h2>
              {isFiltered && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                  {tickers.length}/{allTickers.length}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Find mean-reverting pairs with optimal z-score entry/exit — half-life, Hurst, ADF stationarity
            </p>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Metric</label>
            <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[140px]" value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)} disabled={running}>
              {availableMetrics.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
            <div className="flex gap-px">
              {(["scan", "manual"] as const).map((m) => (
                <button key={m} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setMode(m)} disabled={running}>
                  {m === "scan" ? "Subsector Scan" : "Manual Pair"}
                </button>
              ))}
            </div>
          </div>

          {mode === "manual" && (
            <>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker A</label>
                <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]" value={tickerA} onChange={(e) => setTickerA(e.target.value)} disabled={running}>
                  {tickers.map((t) => <option key={t.ticker} value={t.ticker}>{t.ticker}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker B</label>
                <select className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]" value={tickerB} onChange={(e) => setTickerB(e.target.value)} disabled={running}>
                  {tickers.map((t) => <option key={t.ticker} value={t.ticker}>{t.ticker}</option>)}
                </select>
              </div>
            </>
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
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Buy σ</label>
            <input type="number" step="0.5" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14" value={buyThreshold} onChange={(e) => setBuyThreshold(Number(e.target.value))} disabled={running} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Sell σ</label>
            <input type="number" step="0.5" className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14" value={sellThreshold} onChange={(e) => setSellThreshold(Number(e.target.value))} disabled={running} />
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
            {mode === "scan"
              ? "Scans all pairs within the same subsector for mean-reversion signals"
              : "Select two tickers and click \"Run Optimizer\" to test pair mean reversion"}
          </div>
        )}

        {running && results.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Analyzing pairs...</div>
              <div className="text-xs font-mono text-muted-foreground">{progress.label}</div>
              <div className="text-xs font-mono text-muted-foreground mt-1">{progress.current}/{progress.total}</div>
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
                {sortedResults.length} pairs — {selectedMetric} — {returnMode === "band" ? `band ${pct(bandMin)}–${pct(bandMax)}` : `target ${pct(targetReturn)}`}
              </h3>
              <div className="flex gap-1">
                {(["score", "halfLife", "hurst"] as const).map((s) => (
                  <button key={s} className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`} onClick={() => setSortBy(s)}>
                    {s === "score" ? "Score" : s === "halfLife" ? "Half-Life" : "Hurst"}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-border rounded">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="bg-card text-muted-foreground">
                    <th className="text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border">Pair</th>
                    <th className="text-center px-2 py-1 font-bold">Half-Life</th>
                    <th className="text-center px-2 py-1 font-bold">Hurst</th>
                    <th className="text-center px-2 py-1 font-bold">ADF p</th>
                    <th className="text-center px-2 py-1 font-bold">Window</th>
                    <th className="text-center px-2 py-1 font-bold">Buy Sigs</th>
                    <th className="text-center px-2 py-1 font-bold">Sell Sigs</th>
                    {FORWARD_HORIZONS.map((h) => (
                      <th key={h.label} className="text-center px-2 py-1 font-bold">{returnMode === "band" ? "Band" : "Hit"} {h.label}</th>
                    ))}
                    {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                      <th key={`pf-${h.label}`} className="text-center px-2 py-1 font-bold">PF {h.label}</th>
                    ))}
                    <th className="text-center px-2 py-1 font-bold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((pr) => {
                    const pairKey = `${pr.tickerA}/${pr.tickerB}`;
                    const isExpanded = expandedPair === pairKey;
                    const buySig = pr.buySummary;
                    const sellSig = pr.sellSummary;
                    return (
                      <tr key={pairKey} className={`${isExpanded ? "bg-primary/10" : "hover:bg-white/5"} cursor-pointer`} onClick={() => setExpandedPair(isExpanded ? null : pairKey)}>
                        <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border whitespace-nowrap">
                          {pr.tickerA} / {pr.tickerB}
                        </td>
                        <td className={`text-center px-2 py-1 ${pr.halfLife < 30 ? "text-emerald-400 font-bold" : pr.halfLife < 63 ? "text-green-400" : pr.halfLife < 126 ? "text-yellow-300" : "text-muted-foreground"}`}>
                          {pr.halfLife === Infinity ? "∞" : `${pr.halfLife}d`}
                        </td>
                        <td className={`text-center px-2 py-1 ${pr.hurstExponent < 0.4 ? "text-emerald-400 font-bold" : pr.hurstExponent < 0.5 ? "text-green-400" : "text-orange-400"}`}>
                          {pr.hurstExponent.toFixed(3)}
                        </td>
                        <td className={`text-center px-2 py-1 ${pr.adfPValue <= 0.05 ? "text-emerald-400 font-bold" : pr.adfPValue <= 0.10 ? "text-green-400" : "text-muted-foreground"}`}>
                          {pr.adfPValue <= 0.01 ? "<.01" : pr.adfPValue.toFixed(2)}
                        </td>
                        <td className="text-center px-2 py-1 text-foreground">{pr.bestWindow}d</td>
                        <td className="text-center px-2 py-1 text-foreground">{buySig.count}</td>
                        <td className="text-center px-2 py-1 text-foreground">{sellSig.count}</td>
                        {FORWARD_HORIZONS.map((h) => {
                          const rateKey = returnMode === "band" ? "bandHitRate" : "hitRate";
                          const buyRate = buySig[rateKey]?.[h.label] ?? buySig.hitRate[h.label];
                          const sellRate = sellSig[rateKey]?.[h.label] ?? sellSig.hitRate[h.label];
                          const combinedHit = (buySig.count > 0 && sellSig.count > 0)
                            ? (buyRate * buySig.count + sellRate * sellSig.count) / (buySig.count + sellSig.count)
                            : buySig.count > 0 ? buyRate : sellRate;
                          return (
                            <td key={h.label} className={`text-center px-2 py-1 ${hitRateColor(combinedHit)}`}>
                              {pct(combinedHit)}
                            </td>
                          );
                        })}
                        {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => {
                          const combinedPF = buySig.count > 0 ? buySig.profitFactor[h.label] : sellSig.profitFactor[h.label];
                          return (
                            <td key={`pf-${h.label}`} className={`text-center px-2 py-1 ${profitFactorColor(combinedPF)}`}>
                              {combinedPF >= 99 ? "∞" : combinedPF.toFixed(2)}
                            </td>
                          );
                        })}
                        <td className="text-center px-2 py-1">
                          <span className="inline-block px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: scoreColor(pr.compositeScore), color: scoreTextColor(pr.compositeScore) }}>
                            {pr.compositeScore}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Expanded detail for selected pair */}
            {expandedPair && (() => {
              const pr = results.find((r) => `${r.tickerA}/${r.tickerB}` === expandedPair);
              if (!pr) return null;
              return (
                <div className="mt-4 border border-border rounded p-3 bg-card/50">
                  <h4 className="text-xs font-bold text-foreground mb-2">
                    {pr.tickerA} / {pr.tickerB} — Detailed Forward Returns ({selectedMetric})
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Buy side */}
                    <div>
                      <div className="text-[10px] font-mono text-emerald-400 font-bold mb-1">
                        BUY SPREAD (Long {pr.tickerA} / Short {pr.tickerB}) — {pr.buySummary.count} signals
                      </div>
                      <table className="w-full text-[10px] font-mono">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left px-1 py-0.5">Horizon</th>
                            <th className="text-center px-1 py-0.5">Hit Rate</th>
                            <th className="text-center px-1 py-0.5">Win Rate</th>
                            <th className="text-center px-1 py-0.5">Avg Ret</th>
                            <th className="text-center px-1 py-0.5">Median</th>
                            <th className="text-center px-1 py-0.5">Avg Peak</th>
                            <th className="text-center px-1 py-0.5">Avg Trough</th>
                            <th className="text-center px-1 py-0.5">PF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {FORWARD_HORIZONS.map((h) => (
                            <tr key={h.label}>
                              <td className="px-1 py-0.5 text-foreground font-bold">{h.label}</td>
                              <td className={`text-center px-1 py-0.5 ${hitRateColor(pr.buySummary.hitRate[h.label])}`}>{pct(pr.buySummary.hitRate[h.label])}</td>
                              <td className={`text-center px-1 py-0.5 ${hitRateColor(pr.buySummary.winRate[h.label])}`}>{pct(pr.buySummary.winRate[h.label])}</td>
                              <td className={`text-center px-1 py-0.5 ${pr.buySummary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(pr.buySummary.avgReturn[h.label])}</td>
                              <td className={`text-center px-1 py-0.5 ${pr.buySummary.medianReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(pr.buySummary.medianReturn[h.label])}</td>
                              <td className="text-center px-1 py-0.5 text-green-400">{pctSigned(pr.buySummary.avgPeak[h.label])}</td>
                              <td className="text-center px-1 py-0.5 text-red-400">{pctSigned(pr.buySummary.avgTrough[h.label])}</td>
                              <td className={`text-center px-1 py-0.5 ${profitFactorColor(pr.buySummary.profitFactor[h.label])}`}>{pr.buySummary.profitFactor[h.label] >= 99 ? "∞" : pr.buySummary.profitFactor[h.label].toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Sell side */}
                    <div>
                      <div className="text-[10px] font-mono text-red-400 font-bold mb-1">
                        SELL SPREAD (Short {pr.tickerA} / Long {pr.tickerB}) — {pr.sellSummary.count} signals
                      </div>
                      <table className="w-full text-[10px] font-mono">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left px-1 py-0.5">Horizon</th>
                            <th className="text-center px-1 py-0.5">Hit Rate</th>
                            <th className="text-center px-1 py-0.5">Win Rate</th>
                            <th className="text-center px-1 py-0.5">Avg Ret</th>
                            <th className="text-center px-1 py-0.5">Median</th>
                            <th className="text-center px-1 py-0.5">Avg Peak</th>
                            <th className="text-center px-1 py-0.5">Avg Trough</th>
                            <th className="text-center px-1 py-0.5">PF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {FORWARD_HORIZONS.map((h) => (
                            <tr key={h.label}>
                              <td className="px-1 py-0.5 text-foreground font-bold">{h.label}</td>
                              <td className={`text-center px-1 py-0.5 ${hitRateColor(pr.sellSummary.hitRate[h.label])}`}>{pct(pr.sellSummary.hitRate[h.label])}</td>
                              <td className={`text-center px-1 py-0.5 ${hitRateColor(pr.sellSummary.winRate[h.label])}`}>{pct(pr.sellSummary.winRate[h.label])}</td>
                              <td className={`text-center px-1 py-0.5 ${pr.sellSummary.avgReturn[h.label] <= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(pr.sellSummary.avgReturn[h.label])}</td>
                              <td className={`text-center px-1 py-0.5 ${pr.sellSummary.medianReturn[h.label] <= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(pr.sellSummary.medianReturn[h.label])}</td>
                              <td className="text-center px-1 py-0.5 text-green-400">{pctSigned(pr.sellSummary.avgPeak[h.label])}</td>
                              <td className="text-center px-1 py-0.5 text-red-400">{pctSigned(pr.sellSummary.avgTrough[h.label])}</td>
                              <td className={`text-center px-1 py-0.5 ${profitFactorColor(pr.sellSummary.profitFactor[h.label])}`}>{pr.sellSummary.profitFactor[h.label] >= 99 ? "∞" : pr.sellSummary.profitFactor[h.label].toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
