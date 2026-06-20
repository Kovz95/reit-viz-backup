// Reconstructed from recovered-bundle/ValuationRegime-BV1jZW8T.js on 2026-06-11
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppContext } from "@/lib/useAppContext";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { fetchGlobalDates } from "@/lib/fetchGlobalDates";
import { fetchTickerData } from "@/lib/fetchTickerData";
import { getMetricMultiplier } from "@/lib/getMetricMultiplier";
import { computeForwardReturns } from "@/lib/computeForwardReturns";
import { aggregateSignals } from "@/lib/aggregateSignals";
import { computeComposite } from "@/lib/computeComposite";
import { useWorkspaceState } from "@/lib/useWorkspaceState";
import { isBasketTicker } from "@/lib/basketUtils";
import { TARGET_RETURN_OPTIONS, BAND_OPTIONS } from "@/lib/optimizerConstants";
import { formatPct } from "@/lib/formatPct";
import { hitRateClass, formatAvgReturn, pfClass, pfTextColor, scoreTextColor, scoreBackgroundColor } from "@/lib/formattingHelpers";
import { FORWARD_HORIZONS } from "@/lib/forwardHorizons";
import { B as BasketTickerPill } from "@/components/BasketTickerPill";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface HorizonDef { label: string; days: number; }
const FWD_HORIZONS = FORWARD_HORIZONS as HorizonDef[];

const BAND_THRESHOLDS = [
  { key: "bottom10", label: "Bottom 10%", threshold: [0, 0.1], direction: "buy" },
  { key: "bottom20", label: "Bottom 20%", threshold: [0, 0.2], direction: "buy" },
  { key: "bottom30", label: "Bottom 30%", threshold: [0, 0.3], direction: "buy" },
  { key: "top30", label: "Top 30%", threshold: [0.7, 1], direction: "sell" },
  { key: "top20", label: "Top 20%", threshold: [0.8, 1], direction: "sell" },
  { key: "top10", label: "Top 10%", threshold: [0.9, 1], direction: "sell" },
];

const LOOKBACK_WINDOWS = [
  { days: 126, label: "6M" },
  { days: 252, label: "1Y" },
  { days: 504, label: "2Y" },
  { days: 756, label: "3Y" },
  { days: 1260, label: "5Y" },
  { days: 2520, label: "10Y" },
  { days: 0, label: "All" },
];

const DEFAULT_METRICS = [
  "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2",
  "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2",
  "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
  "Dividend Yield", "Implied Cap Rate",
];

const YIELD_METRICS = new Set([
  "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
  "Dividend Yield", "Implied Cap Rate",
]);

export default function ValuationRegime() {
  const [allTickers, setAllTickers] = useState<any[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState(["P/FFO LTM", "P/E LTM", "EV/EBITDA LTM", "Dividend Yield"]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [returnMode, setReturnMode] = useState<"threshold" | "band">("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.1);
  const [mode, setMode] = useState<"single" | "universe">("single");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<any[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "ticker">("score");
  const [viewMetric, setViewMetric] = useState("best");
  const [availableMetrics, setAvailableMetrics] = useState(DEFAULT_METRICS);
  const cancelRef = useRef(false);
  const tickerLockedRef = useRef(false);

  const { universeTickers, isFiltered } = useAppContext();

  const filteredTickers = useMemo(
    () => (universeTickers ? allTickers.filter(t => universeTickers.has(t.ticker)) : allTickers),
    [allTickers, universeTickers]
  );

  useEffect(() => {
    fetchWorkbookTickers().then((tickers: any[]) => {
      setAllTickers(tickers);
      if (tickers.length > 0 && !tickerLockedRef.current) {
        setSelectedTicker(tickers[0].ticker);
      }
      const metricsInWorkbook = new Set<string>();
      for (const t of tickers) {
        if (t.metrics) {
          for (const m of t.metrics) metricsInWorkbook.add(typeof m === "string" ? m : m.name || m);
        }
      }
      const filtered = DEFAULT_METRICS.filter(m => metricsInWorkbook.has(m));
      if (filtered.length > 0) setAvailableMetrics(filtered);
    });
  }, []);

  useEffect(() => {
    if (filteredTickers.length > 0 && selectedTicker && allTickers.some(t => t.ticker === selectedTicker) && !filteredTickers.find(t => t.ticker === selectedTicker)) {
      setSelectedTicker(filteredTickers[0].ticker);
    }
  }, [filteredTickers, selectedTicker, allTickers]);

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    setResults([]);
    cancelRef.current = false;
    const dates = await fetchGlobalDates();
    const scope = mode === "single" ? filteredTickers.filter(t => t.ticker === selectedTicker) : filteredTickers;
    if (scope.length === 0) { setRunning(false); return; }
    setProgress({ current: 0, total: scope.length });
    const output: any[] = [];
    for (let i = 0; i < scope.length && !cancelRef.current; i++) {
      const ticker = scope[i];
      setProgress({ current: i + 1, total: scope.length });
      try {
        const data = await fetchTickerData(ticker.ticker);
        const closePrices = data.close;
        if (!closePrices?.length) continue;
        const priceMap = new Map<number, number>();
        for (const [idx, val] of closePrices) priceMap.set(idx, val);
        const tickerResults: any[] = [];
        for (const metric of selectedMetrics) {
          const metricSeries = data[metric];
          if (!metricSeries?.length) continue;
          const multiplier = getMetricMultiplier(metric);
          const isYield = YIELD_METRICS.has(metric);
          const metricMap = new Map<number, number>();
          for (const [idx, val] of metricSeries) metricMap.set(idx, val * multiplier);
          const validIdxs: number[] = [];
          for (let d = 0; d < dates.length; d++) {
            if (metricMap.has(d) && priceMap.has(d)) validIdxs.push(d);
          }
          if (validIdxs.length < 100) continue;
          const metricVals = validIdxs.map(d => metricMap.get(d)!);
          const priceVals = validIdxs.map(d => priceMap.get(d)!);
          for (const { days, label } of LOOKBACK_WINDOWS) {
            const windowResults: any[] = [];
            for (const band of BAND_THRESHOLDS) {
              const signals: number[] = [];
              for (let g = 0; g < metricVals.length; g++) {
                const windowStart = days === 0 ? 0 : Math.max(0, g - days + 1);
                const windowSlice = metricVals.slice(windowStart, g + 1);
                if (windowSlice.length < 20) continue;
                const sorted = [...windowSlice].sort((a, b) => a - b);
                const rawPctile = sorted.filter(v => v <= metricVals[g]).length / sorted.length;
                const pctile = isYield ? 1 - rawPctile : rawPctile;
                const isTopInclusive = band.threshold[1] >= 1;
                if (!(pctile >= band.threshold[0] && (isTopInclusive ? pctile <= band.threshold[1] : pctile < band.threshold[1]))) continue;
                if (g > 0) {
                  const prevStart = days === 0 ? 0 : Math.max(0, g - 1 - days + 1);
                  const prevSlice = metricVals.slice(prevStart, g);
                  if (prevSlice.length >= 20) {
                    const prevSorted = [...prevSlice].sort((a, b) => a - b);
                    const prevRaw = prevSorted.filter(v => v <= metricVals[g - 1]).length / prevSorted.length;
                    const prevPctile = isYield ? 1 - prevRaw : prevRaw;
                    if (prevPctile >= band.threshold[0] && (isTopInclusive ? prevPctile <= band.threshold[1] : prevPctile < band.threshold[1])) continue;
                  }
                }
                signals.push(g);
              }
              const bandParam = returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null;
              const returnsByHorizon = computeForwardReturns(priceVals, signals, FWD_HORIZONS, band.direction, bandParam);
              const aggregated = aggregateSignals(returnsByHorizon, band.direction as "buy" | "sell");
              const bandBool = returnMode === "band";
              const composite = computeComposite(aggregated, band.direction, bandBool);
              windowResults.push({
                band: band.key,
                bandLabel: band.label,
                direction: band.direction,
                summary: aggregated,
                composite,
              });
            }
            if (windowResults.length === 0) continue;
            const bestBand = windowResults.reduce((best, cur) => cur.composite.score > best.composite.score ? cur : best);
            tickerResults.push({
              window: days,
              windowLabel: label,
              metric,
              bands: windowResults,
              bestBand: bestBand.band,
              bestScore: bestBand.composite.score,
            });
          }
        }
        if (tickerResults.length === 0) continue;
        const best = tickerResults.reduce((a, b) => a.bestScore > b.bestScore ? a : b);
        output.push({
          ticker: ticker.ticker,
          name: ticker.name,
          results: tickerResults,
          bestMetric: best.metric,
          bestWindow: best.windowLabel,
          bestBand: BAND_THRESHOLDS.find(b => b.key === best.bestBand)?.label || best.bestBand,
          bestScore: best.bestScore,
        });
        if (i % 5 === 0 || i === scope.length - 1) setResults([...output]);
      } catch {}
    }
    setResults(output);
    setRunning(false);
  }, [filteredTickers, selectedTicker, selectedMetrics, mode, targetReturn, returnMode, bandMin, bandMax]);

  const getState = useCallback(() => ({
    selectedMetrics,
    selectedTicker,
    targetReturn,
    mode,
    results,
    expandedTicker,
    sortBy,
    viewMetric,
    returnMode,
    bandMin,
    bandMax,
  }), [selectedMetrics, selectedTicker, targetReturn, mode, results, expandedTicker, sortBy, viewMetric, returnMode, bandMin, bandMax]);

  const restoreState = useCallback((s: any) => {
    if (!s) return;
    if (Array.isArray(s.selectedMetrics)) setSelectedMetrics(s.selectedMetrics);
    if (s.selectedTicker) { setSelectedTicker(s.selectedTicker); tickerLockedRef.current = true; }
    if (typeof s.targetReturn === "number") setTargetReturn(s.targetReturn);
    if (s.returnMode) setReturnMode(s.returnMode);
    if (typeof s.bandMin === "number") setBandMin(s.bandMin);
    if (typeof s.bandMax === "number") setBandMax(s.bandMax);
    if (s.mode) setMode(s.mode);
    if (Array.isArray(s.results)) setResults(s.results);
    if (s.expandedTicker !== undefined) setExpandedTicker(s.expandedTicker);
    if (s.sortBy) setSortBy(s.sortBy);
    if (s.viewMetric) setViewMetric(s.viewMetric);
  }, []);

  useWorkspaceState("val-regime", getState, restoreState);

  const sortedResults = useMemo(() => {
    const copy = [...results];
    if (sortBy === "score") copy.sort((a, b) => b.bestScore - a.bestScore);
    else copy.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return copy;
  }, [results, sortBy]);

  const handleExportCSV = () => {
    const horizons = FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2);
    const rows = sortedResults.map(r => {
      const bestResult = r.results.reduce((a: any, b: any) => a.bestScore > b.bestScore ? a : b, r.results[0]);
      const bestSummary = bestResult?.bands.reduce((a: any, b: any) => a.composite.score > b.composite.score ? a : b, bestResult?.bands[0])?.summary;
      const row: any = {
        ticker: r.ticker, name: r.name, bestMetric: r.bestMetric,
        bestWindow: r.bestWindow, bestBand: r.bestBand, bestScore: r.bestScore,
      };
      horizons.forEach((h: HorizonDef) => {
        row[`hitRate_${h.label}`] = bestSummary?.hitRate[h.label] ?? null;
      });
      return row;
    });
    const keys = Object.keys(rows[0] || {});
    const csv = [keys.join(","), ...rows.map(r => keys.map(k => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "valuation_regime.csv";
    a.click();
  };

  const toggleMetric = (metric: string) => {
    setSelectedMetrics(prev => prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric]);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground tracking-tight">Valuation Regime</h2>
              {isFiltered && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                  {filteredTickers.length}/{allTickers.length}
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
              {availableMetrics.map(metric => (
                <button
                  key={metric}
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                    selectedMetrics.includes(metric)
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground border border-border hover:text-foreground"
                  }`}
                  onClick={() => toggleMetric(metric)}
                  disabled={running}
                >
                  {metric}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
            <div className="flex gap-px">
              {(["single", "universe"] as const).map(m => (
                <button
                  key={m}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                    mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"
                  }`}
                  onClick={() => setMode(m)}
                  disabled={running}
                >
                  {m === "single" ? "Single Ticker" : "Universe"}
                </button>
              ))}
            </div>
          </div>
          {mode === "single" && (
            <>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker</label>
                <select
                  className={`text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px] ${
                    isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""
                  }`}
                  value={isBasketTicker(selectedTicker) ? "" : selectedTicker}
                  onChange={e => setSelectedTicker(e.target.value)}
                  disabled={running}
                >
                  {filteredTickers.map(t => (
                    <option key={t.ticker} value={t.ticker}>{t.ticker}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
                <BasketTickerPill
                  activeTicker={selectedTicker}
                  onSelectTicker={setSelectedTicker}
                  fallbackTicker={filteredTickers[0]?.ticker ?? null}
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Return Measure</label>
            <div className="flex gap-px">
              {(["threshold", "band"] as const).map(m => (
                <button
                  key={m}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                    returnMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"
                  }`}
                  onClick={() => setReturnMode(m)}
                  disabled={running}
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
                onChange={e => setTargetReturn(Number(e.target.value))}
                disabled={running}
              >
                {TARGET_RETURN_OPTIONS.map((o: any) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
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
                  onChange={e => {
                    const [min, max] = e.target.value.split("-").map(Number);
                    setBandMin(min);
                    setBandMax(max);
                  }}
                  disabled={running}
                >
                  {BAND_OPTIONS.map((o: any) => (
                    <option key={o.label} value={`${o.band.minReturn}-${o.band.maxReturn}`}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min %</label>
                <input
                  type="number" step="1" min="0" max="100"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                  value={Math.round(bandMin * 100)}
                  onChange={e => setBandMin(Number(e.target.value) / 100)}
                  disabled={running}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Max %</label>
                <input
                  type="number" step="1" min="0" max="100"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                  value={Math.round(bandMax * 100)}
                  onChange={e => setBandMax(Number(e.target.value) / 100)}
                  disabled={running}
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"> </label>
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
                onClick={runAnalysis}
                disabled={selectedMetrics.length === 0}
              >
                Run Optimizer
              </button>
            )}
          </div>
        </div>
      </div>
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
              <div className="text-xs font-mono text-muted-foreground">
                {progress.current}/{progress.total} tickers × {selectedMetrics.length} metrics × {LOOKBACK_WINDOWS.length} windows
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
                {sortedResults.length} tickers — {returnMode === "band" ? `band ${formatPct(bandMin)}–${formatPct(bandMax)}` : `target ${formatPct(targetReturn)}`}
              </h3>
              <div className="flex items-center gap-1">
                {(["score", "ticker"] as const).map(s => (
                  <button
                    key={s}
                    className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`}
                    onClick={() => setSortBy(s)}
                  >
                    {s === "score" ? "Score" : "Ticker"}
                  </button>
                ))}
                <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={handleExportCSV} data-testid="export-csv">
                  <Download className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto border border-border rounded mb-4">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="bg-card text-muted-foreground">
                    <th className="text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border">Ticker</th>
                    <th className="text-center px-2 py-1 font-bold">Best Metric</th>
                    <th className="text-center px-2 py-1 font-bold">Lookback</th>
                    <th className="text-center px-2 py-1 font-bold">Best Band</th>
                    {FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2).map((h: HorizonDef) => (
                      <th key={h.label} className="text-center px-2 py-1 font-bold">
                        {returnMode === "band" ? "Band" : "Hit"} {h.label}
                      </th>
                    ))}
                    {FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2).map((h: HorizonDef) => (
                      <th key={`avg-${h.label}`} className="text-center px-2 py-1 font-bold">Avg {h.label}</th>
                    ))}
                    {FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2).map((h: HorizonDef) => (
                      <th key={`pf-${h.label}`} className="text-center px-2 py-1 font-bold">PF {h.label}</th>
                    ))}
                    <th className="text-center px-2 py-1 font-bold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map(row => {
                    const bestResult = row.results.reduce((a: any, b: any) => a.bestScore > b.bestScore ? a : b, row.results[0]);
                    const bestSummary = bestResult?.bands.reduce((a: any, b: any) => a.composite.score > b.composite.score ? a : b, bestResult?.bands[0])?.summary;
                    const isExpanded = expandedTicker === row.ticker;
                    return (
                      <tr
                        key={row.ticker}
                        className={`${isExpanded ? "bg-primary/10" : "hover:bg-white/5"} cursor-pointer`}
                        onClick={() => setExpandedTicker(isExpanded ? null : row.ticker)}
                      >
                        <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border">{row.ticker}</td>
                        <td className="text-center px-2 py-1 text-primary font-bold">{row.bestMetric}</td>
                        <td className="text-center px-2 py-1 text-foreground">{row.bestWindow}</td>
                        <td className={`text-center px-2 py-1 font-bold ${row.bestBand.includes("Bottom") ? "text-emerald-400" : "text-red-400"}`}>{row.bestBand}</td>
                        {FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2).map((h: HorizonDef) => {
                          const hr = bestSummary ? (returnMode === "band" ? bestSummary.bandHitRate?.[h.label] ?? bestSummary.hitRate[h.label] : bestSummary.hitRate[h.label]) : 0;
                          return (
                            <td key={h.label} className={`text-center px-2 py-1 ${bestSummary ? hitRateClass(hr) : ""}`}>
                              {bestSummary ? formatPct(hr) : "–"}
                            </td>
                          );
                        })}
                        {FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2).map((h: HorizonDef) => (
                          <td key={`avg-${h.label}`} className={`text-center px-2 py-1 ${bestSummary ? (bestSummary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400") : ""}`}>
                            {bestSummary ? formatAvgReturn(bestSummary.avgReturn[h.label]) : "–"}
                          </td>
                        ))}
                        {FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2).map((h: HorizonDef) => (
                          <td key={`pf-${h.label}`} className={`text-center px-2 py-1 ${bestSummary ? pfClass(bestSummary.profitFactor[h.label]) : ""}`}>
                            {bestSummary ? (bestSummary.profitFactor[h.label] >= 99 ? "∞" : bestSummary.profitFactor[h.label].toFixed(2)) : "–"}
                          </td>
                        ))}
                        <td className="text-center px-2 py-1">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded font-bold"
                            style={{ backgroundColor: scoreBackgroundColor(row.bestScore), color: scoreTextColor(row.bestScore) }}
                          >
                            {row.bestScore}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {expandedTicker && (() => {
              const expanded = results.find(r => r.ticker === expandedTicker);
              if (!expanded) return null;
              const metricGroups = new Map<string, any[]>();
              for (const r of expanded.results) {
                if (!metricGroups.has(r.metric)) metricGroups.set(r.metric, []);
                metricGroups.get(r.metric)!.push(r);
              }
              return (
                <div className="border border-border rounded p-3 bg-card/50 mb-4">
                  <h4 className="text-xs font-bold text-foreground mb-3">
                    {expanded.ticker} — {expanded.name} — All Metric × Window × Band Results
                  </h4>
                  {[...metricGroups.entries()].map(([metric, windows]) => (
                    <div key={metric} className="mb-4">
                      <div className="text-[10px] font-mono text-primary font-bold mb-1 uppercase">{metric}</div>
                      <div className="overflow-x-auto border border-border/50 rounded">
                        <table className="w-full text-[9px] font-mono">
                          <thead>
                            <tr className="text-muted-foreground bg-card">
                              <th className="text-left px-1.5 py-0.5 font-bold">Window</th>
                              <th className="text-left px-1.5 py-0.5 font-bold">Band</th>
                              <th className="text-center px-1.5 py-0.5 font-bold">Signals</th>
                              {FWD_HORIZONS.map((h: HorizonDef) => <th key={h.label} className="text-center px-1.5 py-0.5 font-bold">Hit {h.label}</th>)}
                              {FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2).map((h: HorizonDef) => <th key={`avg-${h.label}`} className="text-center px-1.5 py-0.5 font-bold">Avg {h.label}</th>)}
                              <th className="text-center px-1.5 py-0.5 font-bold">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {windows.map(win => win.bands.filter((b: any) => b.summary.count > 0).map((band: any) => (
                              <tr
                                key={`${win.windowLabel}-${band.band}`}
                                className={band.band === win.bestBand ? "bg-primary/10" : "hover:bg-white/5"}
                              >
                                <td className="px-1.5 py-0.5 text-foreground">{win.windowLabel}</td>
                                <td className={`px-1.5 py-0.5 font-bold ${band.direction === "buy" ? "text-emerald-400" : "text-red-400"}`}>{band.bandLabel}</td>
                                <td className="text-center px-1.5 py-0.5 text-foreground">{band.summary.count}</td>
                                {FWD_HORIZONS.map((h: HorizonDef) => (
                                  <td key={h.label} className={`text-center px-1.5 py-0.5 ${hitRateClass(band.summary.hitRate[h.label])}`}>
                                    {formatPct(band.summary.hitRate[h.label])}
                                  </td>
                                ))}
                                {FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2).map((h: HorizonDef) => (
                                  <td key={`avg-${h.label}`} className={`text-center px-1.5 py-0.5 ${band.summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>
                                    {formatAvgReturn(band.summary.avgReturn[h.label])}
                                  </td>
                                ))}
                                <td className="text-center px-1.5 py-0.5">
                                  <span
                                    className="inline-block px-1 py-0 rounded font-bold"
                                    style={{ backgroundColor: scoreBackgroundColor(band.composite.score), color: scoreTextColor(band.composite.score) }}
                                  >
                                    {band.composite.score}
                                  </span>
                                </td>
                              </tr>
                            )))}
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
