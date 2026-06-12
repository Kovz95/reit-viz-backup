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
  type CompositeScore,
  type ReturnBand,
} from "@/lib/forwardReturns";

// ── Types ──

/** Which percentile band the valuation falls into */
type PercentileBand = "bottom10" | "bottom20" | "bottom30" | "top30" | "top20" | "top10";

const PERCENTILE_BANDS: { key: PercentileBand; label: string; threshold: [number, number]; direction: "buy" | "sell" }[] = [
  { key: "bottom10", label: "Bottom 10%", threshold: [0, 0.10], direction: "buy" },
  { key: "bottom20", label: "Bottom 20%", threshold: [0, 0.20], direction: "buy" },
  { key: "bottom30", label: "Bottom 30%", threshold: [0, 0.30], direction: "buy" },
  { key: "top30", label: "Top 30%", threshold: [0.70, 1.0], direction: "sell" },
  { key: "top20", label: "Top 20%", threshold: [0.80, 1.0], direction: "sell" },
  { key: "top10", label: "Top 10%", threshold: [0.90, 1.0], direction: "sell" },
];

const LOOKBACK_WINDOWS = [
  { days: 126, label: "6M" },
  { days: 252, label: "1Y" },
  { days: 504, label: "2Y" },
  { days: 756, label: "3Y" },
  { days: 1260, label: "5Y" },
  { days: 2520, label: "10Y" },
  { days: 0, label: "All" }, // 0 = expanding
];

interface BandResult {
  band: PercentileBand;
  bandLabel: string;
  direction: "buy" | "sell";
  summary: SignalSummary;
  composite: CompositeScore;
}

interface WindowMetricResult {
  window: number;
  windowLabel: string;
  metric: string;
  bands: BandResult[];
  bestBand: PercentileBand;
  bestScore: number;
}

interface TickerValResult {
  ticker: string;
  name: string;
  /** Results per (window, metric) combination */
  results: WindowMetricResult[];
  bestMetric: string;
  bestWindow: string;
  bestBand: string;
  bestScore: number;
}

// ── Valuation metrics to test ──
const VALUATION_METRICS = [
  "P/E LTM", "P/E FY2",
  "P/S LTM", "P/S FY2",
  "EV/EBITDA LTM", "EV/EBITDA FY2",
  "P/FFO LTM", "P/FFO FY2",
  "P/AFFO LTM", "P/AFFO FY2",
  "FFO Yield LTM", "FFO Yield FY2",
  "AFFO Yield LTM", "AFFO Yield FY2",
  "Dividend Yield",
  "Implied Cap Rate",
];

// Yield/cap rate metrics are inverted: low = expensive, high = cheap
const INVERTED_METRICS = new Set([
  "FFO Yield LTM", "FFO Yield FY2",
  "AFFO Yield LTM", "AFFO Yield FY2",
  "Dividend Yield",
  "Implied Cap Rate",
]);

// ── Component ──

export default function ValuationRegime() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["P/FFO LTM", "P/E LTM", "EV/EBITDA LTM", "Dividend Yield"]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [returnMode, setReturnMode] = useState<"threshold" | "band">("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.10);
  const [mode, setMode] = useState<"single" | "universe">("single");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<TickerValResult[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "ticker">("score");
  const [viewMetric, setViewMetric] = useState<string>("best");
  const abortRef = useRef(false);
  const restoredTickerRef = useRef(false);

  const { universeTickers, isFiltered } = useUniverse();

  const tickers = useMemo(() => {
    if (!universeTickers) return allTickers;
    return allTickers.filter((t) => universeTickers.has(t.ticker));
  }, [allTickers, universeTickers]);

  const [availableMetrics, setAvailableMetrics] = useState<string[]>(VALUATION_METRICS);

  useEffect(() => {
    getTickers().then((t) => {
      setAllTickers(t);
      if (t.length > 0 && !restoredTickerRef.current) setSelectedTicker(t[0].ticker);
      if (t.length > 0 && t[0].metrics) {
        const metricNames = t[0].metrics.map((m: any) => typeof m === "string" ? m : m.name || m);
        const available = VALUATION_METRICS.filter((m) => metricNames.includes(m));
        if (available.length > 0) setAvailableMetrics(available);
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

    const allResults: TickerValResult[] = [];

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

        const wmResults: WindowMetricResult[] = [];

        for (const metric of selectedMetrics) {
          const metricPairs = rawData[metric];
          if (!metricPairs?.length) continue;
          const mult = metricMultiplier(metric);
          const isInverted = INVERTED_METRICS.has(metric);

          const metricMap = new Map<number, number>();
          for (const [idx, val] of metricPairs) metricMap.set(idx, val * mult);

          // Build aligned arrays
          const indices: number[] = [];
          for (let i = 0; i < dates.length; i++) {
            if (metricMap.has(i) && closeMap.has(i)) indices.push(i);
          }
          if (indices.length < 100) continue;

          const metricValues = indices.map((i) => metricMap.get(i)!);
          const priceValues = indices.map((i) => closeMap.get(i)!);

          for (const { days: lookback, label: wLabel } of LOOKBACK_WINDOWS) {
            const bandResults: BandResult[] = [];

            for (const band of PERCENTILE_BANDS) {
              const profiles: ForwardReturnProfile[] = [];

              for (let i = 0; i < metricValues.length; i++) {
                // Compute percentile rank within lookback window
                const start = lookback === 0 ? 0 : Math.max(0, i - lookback + 1);
                const window = metricValues.slice(start, i + 1);
                if (window.length < 20) continue;

                const sorted = [...window].sort((a, b) => a - b);
                const rank = sorted.filter((v) => v < metricValues[i]).length / sorted.length;

                // For inverted metrics (yields), low value = expensive (sell), high value = cheap (buy)
                // So we flip the percentile interpretation
                const effectiveRank = isInverted ? 1 - rank : rank;

                const inBand = effectiveRank >= band.threshold[0] && effectiveRank < band.threshold[1];
                if (!inBand) continue;

                // Check if this is an entry point (wasn't in band yesterday)
                if (i > 0) {
                  const prevStart = lookback === 0 ? 0 : Math.max(0, i - 1 - lookback + 1);
                  const prevWindow = metricValues.slice(prevStart, i);
                  if (prevWindow.length >= 20) {
                    const prevSorted = [...prevWindow].sort((a, b) => a - b);
                    const prevRank = prevSorted.filter((v) => v < metricValues[i - 1]).length / prevSorted.length;
                    const prevEffective = isInverted ? 1 - prevRank : prevRank;
                    const wasInBand = prevEffective >= band.threshold[0] && prevEffective < band.threshold[1];
                    if (wasInBand) continue; // already in band, not a new entry
                  }
                }

                const activeBand: ReturnBand | null = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
                profiles.push(computeForwardProfile(priceValues, i, targetReturn, band.direction, activeBand));
              }

              const summary = summarizeSignals(profiles, band.direction);
              const useBand = returnMode === "band";
              const composite = computeCompositeScore(summary, band.direction, useBand);

              bandResults.push({
                band: band.key,
                bandLabel: band.label,
                direction: band.direction,
                summary,
                composite,
              });
            }

            if (bandResults.length === 0) continue;
            const best = bandResults.reduce((a, b) => a.composite.score > b.composite.score ? a : b);

            wmResults.push({
              window: lookback,
              windowLabel: wLabel,
              metric,
              bands: bandResults,
              bestBand: best.band,
              bestScore: best.composite.score,
            });
          }
        }

        if (wmResults.length === 0) continue;

        const best = wmResults.reduce((a, b) => a.bestScore > b.bestScore ? a : b);
        allResults.push({
          ticker: tmeta.ticker,
          name: tmeta.name,
          results: wmResults,
          bestMetric: best.metric,
          bestWindow: best.windowLabel,
          bestBand: PERCENTILE_BANDS.find((b) => b.key === best.bestBand)?.label || best.bestBand,
          bestScore: best.bestScore,
        });

        if (ti % 5 === 0 || ti === tickerList.length - 1) {
          setResults([...allResults]);
        }
      } catch {
        // skip ticker
      }
    }

    setResults(allResults);
    setRunning(false);
  }, [tickers, selectedTicker, selectedMetrics, mode, targetReturn, returnMode, bandMin, bandMax]);

  // ── Persistence ──
  const serialize = useCallback(() => ({
    selectedMetrics, selectedTicker, targetReturn, mode, results, expandedTicker, sortBy, viewMetric, returnMode, bandMin, bandMax,
  }), [selectedMetrics, selectedTicker, targetReturn, mode, results, expandedTicker, sortBy, viewMetric, returnMode, bandMin, bandMax]);

  const restore = useCallback((saved: any) => {
    if (!saved) return;
    if (Array.isArray(saved.selectedMetrics)) setSelectedMetrics(saved.selectedMetrics);
    if (saved.selectedTicker) { setSelectedTicker(saved.selectedTicker); restoredTickerRef.current = true; }
    if (typeof saved.targetReturn === "number") setTargetReturn(saved.targetReturn);
    if (saved.returnMode) setReturnMode(saved.returnMode);
    if (typeof saved.bandMin === "number") setBandMin(saved.bandMin);
    if (typeof saved.bandMax === "number") setBandMax(saved.bandMax);
    if (saved.mode) setMode(saved.mode);
    if (Array.isArray(saved.results)) setResults(saved.results);
    if (saved.expandedTicker !== undefined) setExpandedTicker(saved.expandedTicker);
    if (saved.sortBy) setSortBy(saved.sortBy);
    if (saved.viewMetric) setViewMetric(saved.viewMetric);
  }, []);

  useWorkspaceTab("val-regime", serialize, restore);

  const sortedResults = useMemo(() => {
    const r = [...results];
    if (sortBy === "score") r.sort((a, b) => b.bestScore - a.bestScore);
    else r.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return r;
  }, [results, sortBy]);

  const toggleMetric = (m: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground tracking-tight">Valuation Regime</h2>
              {isFiltered && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                  {tickers.length}/{allTickers.length}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Which valuation metric best predicts forward returns at historical extremes?
            </p>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Metrics to Test</label>
            <div className="flex gap-1 flex-wrap max-w-[400px]">
              {availableMetrics.map((m) => (
                <button key={m} className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors ${selectedMetrics.includes(m) ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`} onClick={() => toggleMetric(m)} disabled={running}>
                  {m}
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
              <button className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90" onClick={runOptimizer} disabled={selectedMetrics.length === 0}>
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
            Tests each metric × lookback window × percentile band to find the best valuation signal
          </div>
        )}

        {running && results.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Testing valuation regimes...</div>
              <div className="text-xs font-mono text-muted-foreground">{progress.current}/{progress.total} tickers × {selectedMetrics.length} metrics × {LOOKBACK_WINDOWS.length} windows</div>
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
                {sortedResults.length} tickers — {returnMode === "band" ? `band ${pct(bandMin)}–${pct(bandMax)}` : `target ${pct(targetReturn)}`}
              </h3>
              <div className="flex gap-1">
                {(["score", "ticker"] as const).map((s) => (
                  <button key={s} className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`} onClick={() => setSortBy(s)}>
                    {s === "score" ? "Score" : "Ticker"}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary table */}
            <div className="overflow-x-auto border border-border rounded mb-4">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="bg-card text-muted-foreground">
                    <th className="text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border">Ticker</th>
                    <th className="text-center px-2 py-1 font-bold">Best Metric</th>
                    <th className="text-center px-2 py-1 font-bold">Lookback</th>
                    <th className="text-center px-2 py-1 font-bold">Best Band</th>
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
                    const bestWM = tr.results.reduce((a, b) => a.bestScore > b.bestScore ? a : b, tr.results[0]);
                    const bestBandResult = bestWM?.bands.reduce((a, b) => a.composite.score > b.composite.score ? a : b, bestWM.bands[0]);
                    const summary = bestBandResult?.summary;
                    const isExpanded = expandedTicker === tr.ticker;

                    return (
                      <tr key={tr.ticker} className={`${isExpanded ? "bg-primary/10" : "hover:bg-white/5"} cursor-pointer`} onClick={() => setExpandedTicker(isExpanded ? null : tr.ticker)}>
                        <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border">{tr.ticker}</td>
                        <td className="text-center px-2 py-1 text-primary font-bold">{tr.bestMetric}</td>
                        <td className="text-center px-2 py-1 text-foreground">{tr.bestWindow}</td>
                        <td className={`text-center px-2 py-1 font-bold ${tr.bestBand.includes("Bottom") ? "text-emerald-400" : "text-red-400"}`}>{tr.bestBand}</td>
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

              // Group results by metric
              const byMetric = new Map<string, WindowMetricResult[]>();
              for (const r of tr.results) {
                if (!byMetric.has(r.metric)) byMetric.set(r.metric, []);
                byMetric.get(r.metric)!.push(r);
              }

              return (
                <div className="border border-border rounded p-3 bg-card/50 mb-4">
                  <h4 className="text-xs font-bold text-foreground mb-3">
                    {tr.ticker} — {tr.name} — All Metric × Window × Band Results
                  </h4>
                  {[...byMetric.entries()].map(([metric, wmResults]) => (
                    <div key={metric} className="mb-4">
                      <div className="text-[10px] font-mono text-primary font-bold mb-1 uppercase">{metric}</div>
                      <div className="overflow-x-auto border border-border/50 rounded">
                        <table className="w-full text-[9px] font-mono">
                          <thead>
                            <tr className="text-muted-foreground bg-card">
                              <th className="text-left px-1.5 py-0.5 font-bold">Window</th>
                              <th className="text-left px-1.5 py-0.5 font-bold">Band</th>
                              <th className="text-center px-1.5 py-0.5 font-bold">Signals</th>
                              {FORWARD_HORIZONS.map((h) => (
                                <th key={h.label} className="text-center px-1.5 py-0.5 font-bold">Hit {h.label}</th>
                              ))}
                              {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                                <th key={`avg-${h.label}`} className="text-center px-1.5 py-0.5 font-bold">Avg {h.label}</th>
                              ))}
                              <th className="text-center px-1.5 py-0.5 font-bold">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wmResults.map((wm) =>
                              wm.bands.filter((b) => b.summary.count > 0).map((b) => (
                                <tr key={`${wm.windowLabel}-${b.band}`} className={b.band === wm.bestBand ? "bg-primary/10" : "hover:bg-white/5"}>
                                  <td className="px-1.5 py-0.5 text-foreground">{wm.windowLabel}</td>
                                  <td className={`px-1.5 py-0.5 font-bold ${b.direction === "buy" ? "text-emerald-400" : "text-red-400"}`}>{b.bandLabel}</td>
                                  <td className="text-center px-1.5 py-0.5 text-foreground">{b.summary.count}</td>
                                  {FORWARD_HORIZONS.map((h) => (
                                    <td key={h.label} className={`text-center px-1.5 py-0.5 ${hitRateColor(b.summary.hitRate[h.label])}`}>{pct(b.summary.hitRate[h.label])}</td>
                                  ))}
                                  {FORWARD_HORIZONS.filter((_, i) => i >= 2).map((h) => (
                                    <td key={`avg-${h.label}`} className={`text-center px-1.5 py-0.5 ${b.summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(b.summary.avgReturn[h.label])}</td>
                                  ))}
                                  <td className="text-center px-1.5 py-0.5">
                                    <span className="inline-block px-1 py-0 rounded font-bold" style={{ backgroundColor: scoreColor(b.composite.score), color: scoreTextColor(b.composite.score) }}>
                                      {b.composite.score}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
