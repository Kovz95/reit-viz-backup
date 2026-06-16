// Reconstructed from recovered-bundle/PairOptimizer-Df5S8y_J.js on 2026-06-11
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { usePersistedState } from "@/lib/persistedState";
import { useAppContext } from "@/lib/appContext";
import { useWorkspaceState } from "@/lib/workspaceState";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { fetchWorkbookData } from "@/lib/fetchWorkbookData";
import { getMetricScalar, getMetricInverseFlag } from "@/lib/metricHelpers";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { getDailyIndexFromWeekly } from "@/lib/getDailyIndexFromWeekly";
import { computeSignalStats } from "@/lib/computeSignalStats";
import { scoreSignalStats } from "@/lib/scoreSignalStats";
import { fetchGlobalDates } from "@/lib/fetchGlobalDates";
import { useWorkspaceStateEx } from "@/lib/workspaceState";
import { TARGET_RETURN_OPTIONS, BAND_OPTIONS } from "@/lib/optimizerConstants";
import { FORWARD_HORIZONS } from "@/lib/forwardHorizons";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { hitRateClass, formatPct, pfClass, pfTextColor, scoreTextColor, scoreBackgroundColor } from "@/lib/formattingHelpers";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { useFrequency, isValidFrequency } from "@/lib/useFrequency";
import { ClassificationFiltersWithSource } from "@/components/ClassificationFiltersWithSource";
import { emptyClassFilters, applyClassFilters, type ClassFilters } from "@/lib/dataService";

// ─── Constants ───────────────────────────────────────────────────────────────

interface HorizonDef { label: string; days: number; }
const FWD_HORIZONS = FORWARD_HORIZONS as HorizonDef[];

const Z_SCORE_WINDOWS = [21, 42, 63, 126, 189, 252, 504];

const DEFAULT_METRICS = [
  "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2",
  "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2",
  "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
  "Dividend Yield", "Implied Cap Rate",
];

const GROUP_BY_OPTIONS = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Sub-Sector" },
  { key: "industryGroup", label: "Industry Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Sub-Industry" },
];

// ─── Math helpers ─────────────────────────────────────────────────────────────

function rollingZScore(series: number[], window: number): (number | null)[] {
  const result = new Array<number | null>(series.length).fill(null);
  for (let i = 1; i < series.length; i++) {
    const start = Math.max(0, i - window);
    const len = i - start;
    if (len < 2) continue;
    let sum = 0, sumSq = 0;
    for (let j = start; j < i; j++) { sum += series[j]; sumSq += series[j] * series[j]; }
    const mean = sum / len;
    const variance = sumSq / len - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    if (std > 0) result[i] = (series[i] - mean) / std;
  }
  return result;
}

function computeHalfLife(series: number[]): number {
  if (series.length < 20) return Infinity;
  const n = series.length - 1;
  let sumY = 0, sumDY = 0, sumYDY = 0, sumY2 = 0;
  for (let i = 1; i <= n; i++) {
    const y = series[i - 1];
    const dy = series[i] - series[i - 1];
    sumY += y; sumDY += dy; sumYDY += y * dy; sumY2 += y * y;
  }
  const beta = (n * sumYDY - sumY * sumDY) / (n * sumY2 - sumY * sumY);
  return beta >= 0 ? Infinity : -Math.log(2) / Math.log(1 + beta);
}

function computeHurst(series: number[]): number {
  if (series.length < 20) return 0.5;
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) returns.push(series[i] - series[i - 1]);
  const scales = [8, 16, 32, 64, 128].filter((s) => s <= returns.length / 2);
  if (scales.length < 2) return 0.5;
  const logScales: number[] = [], logRS: number[] = [];
  for (const scale of scales) {
    const numChunks = Math.floor(returns.length / scale);
    if (numChunks === 0) continue;
    let rsSum = 0;
    for (let chunk = 0; chunk < numChunks; chunk++) {
      const seg = returns.slice(chunk * scale, (chunk + 1) * scale);
      const mean = seg.reduce((a, v) => a + v, 0) / seg.length;
      const cumDev: number[] = [];
      let cum = 0;
      for (const v of seg) { cum += v - mean; cumDev.push(cum); }
      const range = Math.max(...cumDev) - Math.min(...cumDev);
      const std = Math.sqrt(seg.reduce((a, v) => a + (v - mean) ** 2, 0) / seg.length);
      rsSum += std > 0 ? range / std : 0;
    }
    const avgRS = rsSum / numChunks;
    if (avgRS > 0) { logScales.push(Math.log(scale)); logRS.push(Math.log(avgRS)); }
  }
  if (logScales.length < 2) return 0.5;
  const k = logScales.length;
  const sx = logScales.reduce((a, v) => a + v, 0);
  const sy = logRS.reduce((a, v) => a + v, 0);
  const sxy = logScales.reduce((a, v, i) => a + v * logRS[i], 0);
  const sxx = logScales.reduce((a, v) => a + v * v, 0);
  const slope = (k * sxy - sx * sy) / (k * sxx - sx * sx);
  return Math.max(0, Math.min(1, slope));
}

function adfPValue(series: number[]): number {
  if (series.length < 30) return 1;
  const n = series.length;
  const returns: number[] = [];
  for (let i = 1; i < n; i++) returns.push(series[i] - series[i - 1]);
  const c = returns.length;
  let sx = 0, sdx = 0, sxdx = 0, sx2 = 0;
  for (let i = 0; i < c; i++) {
    const x = series[i], dx = returns[i];
    sx += x; sdx += dx; sxdx += x * dx; sx2 += x * x;
  }
  const beta = (c * sxdx - sx * sdx) / (c * sx2 - sx * sx);
  const meanDX = sdx / c;
  const meanX = sx / c;
  let sse = 0;
  for (let i = 0; i < c; i++) {
    const predicted = meanDX + beta * (series[i] - meanX);
    sse += (returns[i] - predicted) ** 2;
  }
  const se = Math.sqrt(sse / (c - 2)) / Math.sqrt(sx2 / c - meanX ** 2);
  const tStat = se > 0 ? beta / (se / Math.sqrt(c)) : 0;
  return tStat < -3.43 ? 0.01 : tStat < -2.86 ? 0.05 : tStat < -2.57 ? 0.1 : tStat < -1.94 ? 0.2 : 0.5;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface PairResult {
  tickerA: string;
  tickerB: string;
  metric: string;
  halfLife: number;
  adfPValue: number;
  hurstExponent: number;
  bestWindow: number;
  buySummary: any;
  sellSummary: any;
  compositeScore: number;
  bestHorizon: string;
  buyRevSummary?: any;
  sellRevSummary?: any;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PairOptimizer() {
  const [allTickers, setAllTickers] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState("P/FFO LTM");
  const [returnMode, setReturnMode] = useState("threshold");
  const [targetReturn, setTargetReturn] = useState(0.05);
  const [bandMin, setBandMin] = useState(0.05);
  const [bandMax, setBandMax] = useState(0.1);
  const [buyThreshold, setBuyThreshold] = useState(-2);
  const [sellThreshold, setSellThreshold] = useState(2);
  const [signalType, setSignalType] = useState("breakout");
  const [mode, setMode] = useState("scan");
  const [groupBy, setGroupBy] = useState("subsector");
  const [spreadMethod, setSpreadMethod] = useState("ratio");
  const [tickerA, setTickerA] = useState("");
  const [tickerB, setTickerB] = useState("");
  const [showLoading, setShowLoading] = useState(false);
  const { frequency, setFrequency, frequencyUI } = useFrequency("pair", "daily", showLoading);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [results, setResults] = usePersistedState<PairResult[]>("pair:results", []);
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("score");
  const cancelRef = useRef(false);
  const tickerInitialized = useRef(false);
  const { universeTickers, isFiltered } = useAppContext();
  const filteredTickers = useMemo(
    () => (universeTickers ? allTickers.filter((t) => universeTickers.has(t.ticker)) : allTickers),
    [allTickers, universeTickers]
  );
  const classFilter = useOptimizerClassFilter(filteredTickers, mode === "scan", "pair-opt-clf");

  // Classification-filter + manual-ticker state for scan mode
  const [clfFilters, setClfFilters] = useState<ClassFilters>(() => emptyClassFilters());
  const [clfSearch, setClfSearch] = useState("");
  const [clfManualTickers, setClfManualTickers] = useState<Set<string>>(new Set());
  const scanFilteredTickers = useMemo(
    () => applyClassFilters(filteredTickers as any[], clfFilters, clfSearch, clfManualTickers),
    [filteredTickers, clfFilters, clfSearch, clfManualTickers]
  );

  const effectiveTickers = mode === "scan" ? scanFilteredTickers : filteredTickers;
  const [availableMetrics, setAvailableMetrics] = useState<string[]>(DEFAULT_METRICS);

  useEffect(() => {
    fetchWorkbookTickers().then((tickers: any[]) => {
      setAllTickers(tickers);
      if (tickers.length > 0 && !tickerInitialized.current) {
        setTickerA(tickers[0].ticker);
        setTickerB(tickers.length > 1 ? tickers[1].ticker : tickers[0].ticker);
      }
      if (tickers.length > 0 && tickers[0].metrics) {
        const metricNames = tickers[0].metrics.map((m: any) => typeof m === "string" ? m : m.name || m);
        const filtered = DEFAULT_METRICS.filter((m) => metricNames.includes(m));
        if (filtered.length > 0) setAvailableMetrics(filtered);
      }
    });
  }, []);

  // ── Workspace state ──
  const serializeState = useCallback(
    () => ({
      selectedMetric,
      targetReturn,
      buyThreshold,
      sellThreshold,
      signalType,
      mode,
      groupBy,
      spreadMethod,
      tickerA,
      tickerB,
      results,
      expandedPair,
      sortBy,
      returnMode,
      bandMin,
      bandMax,
      frequency,
    }),
    [selectedMetric, targetReturn, buyThreshold, sellThreshold, signalType, mode, groupBy, spreadMethod, tickerA, tickerB, results, expandedPair, sortBy, returnMode, bandMin, bandMax, frequency]
  );

  const hydrateState = useCallback(
    (state: any) => {
      if (!state) return;
      if (state.selectedMetric) setSelectedMetric(state.selectedMetric);
      if (typeof state.targetReturn === "number") setTargetReturn(state.targetReturn);
      if (typeof state.buyThreshold === "number") setBuyThreshold(state.buyThreshold);
      if (typeof state.sellThreshold === "number") setSellThreshold(state.sellThreshold);
      if (state.signalType) setSignalType(state.signalType);
      if (state.mode) setMode(state.mode);
      if (state.groupBy) setGroupBy(state.groupBy);
      if (state.spreadMethod) setSpreadMethod(state.spreadMethod);
      if (state.returnMode) setReturnMode(state.returnMode);
      if (typeof state.bandMin === "number") setBandMin(state.bandMin);
      if (typeof state.bandMax === "number") setBandMax(state.bandMax);
      if (state.tickerA) { setTickerA(state.tickerA); tickerInitialized.current = true; }
      if (state.tickerB) { setTickerB(state.tickerB); tickerInitialized.current = true; }
      if (Array.isArray(state.results)) setResults(state.results);
      if (state.expandedPair !== undefined) setExpandedPair(state.expandedPair);
      if (state.sortBy) setSortBy(state.sortBy);
      if (isValidFrequency(state.frequency)) setFrequency(state.frequency);
    },
    [setFrequency, setResults]
  );

  useWorkspaceState("pair-optimizer", serializeState, hydrateState);

  // ── Run pair analysis ──
  const runAnalysis = useCallback(async (
    tA: string, tB: string, metric: string, dates: string[],
    tgtReturn: number, buyZ: number, sellZ: number,
    bandParam: { minReturn: number; maxReturn: number } | null,
    spread: string, sig: string, freq: string
  ): Promise<PairResult | null> => {
    try {
      const [dataA, dataB] = await Promise.all([fetchWorkbookData(tA), fetchWorkbookData(tB)]);
      const scalar = getMetricScalar(metric);
      const inverse = getMetricInverseFlag(metric);
      const seriesA = dataA[metric] || [];
      const seriesB = dataB[metric] || [];
      const closesA = dataA.close || [];
      const closesB = dataB.close || [];
      if (!seriesA.length || !seriesB.length || !closesA.length || !closesB.length) return null;

      const mapA = new Map<number, number>();
      for (const [idx, val] of seriesA) mapA.set(idx, val * scalar * inverse);
      const mapB = new Map<number, number>();
      for (const [idx, val] of seriesB) mapB.set(idx, val * scalar * inverse);
      const mapCA = new Map<number, number>();
      for (const [idx, val] of closesA) mapCA.set(idx, val);
      const mapCB = new Map<number, number>();
      for (const [idx, val] of closesB) mapCB.set(idx, val);

      const overlapIndices: number[] = [];
      for (let i = 0; i < dates.length; i++) {
        if (mapA.has(i) && mapB.has(i) && mapCA.has(i) && mapCB.has(i)) {
          if (spread === "ratio") {
            const bVal = mapB.get(i)!;
            if (!Number.isFinite(bVal) || bVal <= 0) continue;
          }
          overlapIndices.push(i);
        }
      }
      if (overlapIndices.length < 100) return null;

      const spreadSeries = spread === "ratio"
        ? overlapIndices.map((i) => mapA.get(i)! / mapB.get(i)!)
        : overlapIndices.map((i) => mapA.get(i)! - mapB.get(i)!);

      const priceRatioSeries = overlapIndices.map(
        (i) => (mapCA.get(i)! / mapCA.get(overlapIndices[0])! + mapCB.get(i)! / mapCB.get(overlapIndices[0])!) / 2
      );
      const hedgeSeries = overlapIndices.map(
        (i) => mapCA.get(i)! / mapCA.get(overlapIndices[0])! - mapCB.get(i)! / mapCB.get(overlapIndices[0])! + 1
      );

      const freqMode = freq === "weekly" ? "weekly" : "daily";
      const overlapDates = overlapIndices.map((i) => dates[i]);
      let workingSeries: number[];
      let mapToDaily: (idx: number) => number;

      if (freqMode === "weekly") {
        const downsampled = weeklyDownsample(
          { dates: overlapDates, closes: spreadSeries, adjCloses: spreadSeries },
          "weekly"
        );
        if (downsampled.closes.length < 30) return null;
        if (freq === "weekly_on_daily") {
          const mapped = new Array<number>(spreadSeries.length);
          let wi = 0;
          for (let di = 0; di < spreadSeries.length; di++) {
            while (wi + 1 < downsampled.dailyIndexMap.length && downsampled.dailyIndexMap[wi + 1] <= di) wi++;
            mapped[di] = downsampled.closes[wi];
          }
          workingSeries = mapped;
          mapToDaily = (i) => i;
        } else {
          workingSeries = downsampled.closes;
          mapToDaily = (i) => getDailyIndexFromWeekly(i, downsampled);
        }
      } else {
        workingSeries = spreadSeries;
        mapToDaily = (i) => i;
      }

      const halfLife = computeHalfLife(workingSeries);
      const hurst = computeHurst(workingSeries);
      const adfP = adfPValue(workingSeries);

      let bestResult: any = null;
      let bestScore = -1;

      for (const win of Z_SCORE_WINDOWS) {
        if (win > workingSeries.length * 0.8) continue;
        const zScores = rollingZScore(workingSeries, win);
        const isBreakout = sig === "breakout" || sig === "both";
        const isReversion = sig === "reversion" || sig === "both";

        const buyBreakoutSignals: any[] = [], sellBreakoutSignals: any[] = [];
        const buyRevSignals: any[] = [], sellRevSignals: any[] = [];

        let prevZ: number | null = null;
        for (let i = 0; i < zScores.length; i++) {
          const z = zScores[i];
          if (z === null) { prevZ = null; continue; }
          if (prevZ !== null) {
            const dailyIdx = mapToDaily(i);
            if (dailyIdx >= 0) {
              if (isBreakout && prevZ >= buyZ && z < buyZ) buyBreakoutSignals.push(computeSignalStats(hedgeSeries, dailyIdx, tgtReturn, "buy", bandParam));
              if (isBreakout && prevZ <= sellZ && z > sellZ) sellBreakoutSignals.push(computeSignalStats(hedgeSeries, dailyIdx, tgtReturn, "sell", bandParam));
              if (isReversion && prevZ < buyZ && z >= buyZ) buyRevSignals.push(computeSignalStats(hedgeSeries, dailyIdx, tgtReturn, "buy", bandParam));
              if (isReversion && prevZ > sellZ && z <= sellZ) sellRevSignals.push(computeSignalStats(hedgeSeries, dailyIdx, tgtReturn, "sell", bandParam));
            }
          }
          prevZ = z;
        }

        const buySummary = scoreSignalStats(isBreakout ? buyBreakoutSignals : buyRevSignals, "buy");
        const sellSummary = scoreSignalStats(isBreakout ? sellBreakoutSignals : sellRevSignals, "sell");
        const buyRevSummary = sig === "both" ? scoreSignalStats(buyRevSignals, "buy") : undefined;
        const sellRevSummary = sig === "both" ? scoreSignalStats(sellRevSignals, "sell") : undefined;
        const hasBand = bandParam !== null;
        const buyScore = scoreSignalStats(buySummary, "buy", hasBand);
        const sellScore = scoreSignalStats(sellSummary, "sell", hasBand);

        let sigCount = ((buySummary?.count ?? 0) > 0 ? 1 : 0) + ((sellSummary?.count ?? 0) > 0 ? 1 : 0);
        let totalScore = buyScore.score + sellScore.score;
        if (sig === "both") {
          const brs = scoreSignalStats(buyRevSummary, "buy", hasBand);
          const srs = scoreSignalStats(sellRevSummary, "sell", hasBand);
          if ((buyRevSummary?.count ?? 0) > 0) { sigCount++; totalScore += brs.score; }
          if ((sellRevSummary?.count ?? 0) > 0) { sigCount++; totalScore += srs.score; }
        }
        const avgScore = sigCount > 0 ? totalScore / sigCount : 0;
        const hurstBonus = hurst < 0.45 ? 1.15 : 1;
        const adfBonus = adfP <= 0.05 ? 1.1 : 1;
        const composite = Math.min(100, avgScore * hurstBonus * adfBonus);

        if (composite > bestScore) {
          bestScore = composite;
          bestResult = {
            window: win,
            buySummary,
            sellSummary,
            compositeScore: Math.round(composite),
            bestHorizon: buyScore.score >= sellScore.score ? buyScore.bestHorizon : sellScore.bestHorizon,
            buyRevSummary,
            sellRevSummary,
          };
        }
      }

      return bestResult
        ? {
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
            buyRevSummary: bestResult.buyRevSummary,
            sellRevSummary: bestResult.sellRevSummary,
          }
        : null;
    } catch {
      return null;
    }
  }, []);

  const handleRun = useCallback(async () => {
    setShowLoading(true);
    setResults([]);
    cancelRef.current = false;

    const dates = await fetchGlobalDates();

    if (mode === "manual") {
      setProgress({ current: 0, total: 1, label: `${tickerA}/${tickerB}` });
      const result = await runAnalysis(
        tickerA, tickerB, selectedMetric, dates,
        targetReturn, buyThreshold, sellThreshold,
        returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null,
        spreadMethod, signalType, frequency
      );
      if (result) setResults([result]);
      setProgress({ current: 1, total: 1, label: "" });
    } else {
      const groupMap = new Map<string, any[]>();
      for (const t of effectiveTickers) {
        const group = t[groupBy] || "Other";
        if (!groupMap.has(group)) groupMap.set(group, []);
        groupMap.get(group)!.push(t);
      }
      const pairs: [string, string][] = [];
      for (const [, members] of groupMap) {
        if (members.length < 2) continue;
        for (let a = 0; a < members.length; a++) {
          for (let b = a + 1; b < members.length; b++) {
            pairs.push([members[a].ticker, members[b].ticker]);
          }
        }
      }
      setProgress({ current: 0, total: pairs.length, label: "Scanning pairs..." });
      const accumulated: PairResult[] = [];
      for (let i = 0; i < pairs.length && !cancelRef.current; i++) {
        const [pA, pB] = pairs[i];
        setProgress({ current: i + 1, total: pairs.length, label: `${pA}/${pB}` });
        const result = await runAnalysis(
          pA, pB, selectedMetric, dates,
          targetReturn, buyThreshold, sellThreshold,
          returnMode === "band" ? { minReturn: bandMin, maxReturn: bandMax } : null,
          spreadMethod, signalType, frequency
        );
        if (result && result.compositeScore > 0) accumulated.push(result);
        if (i % 10 === 0 || i === pairs.length - 1) setResults([...accumulated]);
      }
      setResults(accumulated);
    }
    setShowLoading(false);
  }, [effectiveTickers, mode, tickerA, tickerB, selectedMetric, targetReturn, buyThreshold, sellThreshold, returnMode, bandMin, bandMax, spreadMethod, signalType, frequency, groupBy, runAnalysis, setResults]);

  // ── Sorted results ──
  const sortedResults = useMemo(() => {
    const copy = [...results];
    if (sortBy === "score") copy.sort((a, b) => b.compositeScore - a.compositeScore);
    else if (sortBy === "halfLife") copy.sort((a, b) => a.halfLife - b.halfLife);
    else copy.sort((a, b) => a.hurstExponent - b.hurstExponent);
    return copy;
  }, [results, sortBy]);

  // ── CSV export ──
  const handleExportCsv = () => {
    const horizonCols = FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2);
    const rows = sortedResults.map((r) => {
      const row: Record<string, any> = {
        tickerA: r.tickerA,
        tickerB: r.tickerB,
        metric: r.metric,
        halfLife: r.halfLife,
        adfPValue: r.adfPValue,
        hurstExponent: r.hurstExponent,
        bestWindow: r.bestWindow,
        compositeScore: r.compositeScore,
      };
      horizonCols.forEach((h: HorizonDef) => {
        row[`buy_hitRate_${h.label}`] = r.buySummary?.hitRate[h.label] ?? null;
        row[`sell_hitRate_${h.label}`] = r.sellSummary?.hitRate[h.label] ?? null;
      });
      return row;
    });
    const colKeys = Object.keys(rows[0] || {});
    const csv = [
      colKeys.join(","),
      ...rows.map((r) => colKeys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `pair_optimizer_${selectedMetric.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground tracking-tight">Pair Optimizer</h2>
              {isFiltered && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30">
                  {effectiveTickers.length}/{allTickers.length}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Find mean-reverting pairs with optimal z-score entry/exit — half-life, Hurst, ADF stationarity
            </p>
          </div>

          {/* Metric */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Metric</label>
            <select
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[140px]"
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              disabled={showLoading}
            >
              {availableMetrics.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Mode */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
            <div className="flex gap-px">
              {(["scan", "manual"] as const).map((m) => (
                <button
                  key={m}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                  onClick={() => setMode(m)}
                  disabled={showLoading}
                >
                  {m === "scan" ? "Subsector Scan" : "Manual Pair"}
                </button>
              ))}
            </div>
          </div>

          {/* Universe source + classification filter (scan mode) */}
          {mode === "scan" && (
            <div className="flex flex-col gap-0.5 w-full mt-1">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Classification Filter</label>
              <ClassificationFiltersWithSource
                workbookTickers={filteredTickers}
                filters={clfFilters}
                onFiltersChange={setClfFilters}
                search={clfSearch}
                onSearchChange={setClfSearch}
                manualTickers={clfManualTickers}
                onManualTickersChange={setClfManualTickers}
                filteredCount={scanFilteredTickers.length}
                totalCount={filteredTickers.length}
                testIdPrefix="pair-opt-clf"
              />
            </div>
          )}

          {/* Manual pair pickers */}
          {mode === "manual" ? (
            <>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker A</label>
                <select
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]"
                  value={tickerA}
                  onChange={(e) => setTickerA(e.target.value)}
                  disabled={showLoading}
                >
                  {(effectiveTickers as any[]).map((t: any) => (
                    <option key={t.ticker} value={t.ticker}>{t.ticker}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker B</label>
                <select
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]"
                  value={tickerB}
                  onChange={(e) => setTickerB(e.target.value)}
                  disabled={showLoading}
                >
                  {(effectiveTickers as any[]).map((t: any) => (
                    <option key={t.ticker} value={t.ticker}>{t.ticker}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Group By</label>
              <select
                className="text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[120px]"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                disabled={showLoading}
              >
                {GROUP_BY_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Spread */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Spread</label>
            <div className="flex gap-px">
              {(["ratio", "difference"] as const).map((m) => (
                <button
                  key={m}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${spreadMethod === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                  onClick={() => setSpreadMethod(m)}
                  disabled={showLoading}
                >
                  {m === "ratio" ? "A / B" : "A − B"}
                </button>
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div title="Frequency at which the spread z-scores and signals are computed.">
            {frequencyUI}
          </div>

          {/* Return mode */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Return Measure</label>
            <div className="flex gap-px">
              {(["threshold", "band"] as const).map((m) => (
                <button
                  key={m}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${returnMode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                  onClick={() => setReturnMode(m)}
                  disabled={showLoading}
                >
                  {m === "threshold" ? "Threshold" : "Band"}
                </button>
              ))}
            </div>
          </div>

          {/* Target / Band params */}
          {returnMode === "threshold" ? (
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Target</label>
              <select
                className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]"
                value={targetReturn}
                onChange={(e) => setTargetReturn(Number(e.target.value))}
                disabled={showLoading}
              >
                {TARGET_RETURN_OPTIONS.map((opt: any) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                  onChange={(e) => {
                    const [min, max] = e.target.value.split("-").map(Number);
                    setBandMin(min);
                    setBandMax(max);
                  }}
                  disabled={showLoading}
                >
                  {BAND_OPTIONS.map((opt: any) => (
                    <option key={opt.label} value={`${opt.band.minReturn}-${opt.band.maxReturn}`}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Min %</label>
                <input
                  type="number" step="1" min="0" max="100"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                  value={Math.round(bandMin * 100)}
                  onChange={(e) => setBandMin(Number(e.target.value) / 100)}
                  disabled={showLoading}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Max %</label>
                <input
                  type="number" step="1" min="0" max="100"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
                  value={Math.round(bandMax * 100)}
                  onChange={(e) => setBandMax(Number(e.target.value) / 100)}
                  disabled={showLoading}
                />
              </div>
            </>
          )}

          {/* Buy/Sell sigma */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Buy σ</label>
            <input
              type="number" step="0.5"
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
              value={buyThreshold}
              onChange={(e) => setBuyThreshold(Number(e.target.value))}
              disabled={showLoading}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Sell σ</label>
            <input
              type="number" step="0.5"
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14"
              value={sellThreshold}
              onChange={(e) => setSellThreshold(Number(e.target.value))}
              disabled={showLoading}
            />
          </div>

          {/* Signal type */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Signal</label>
            <div className="flex gap-px">
              {(["breakout", "reversion", "both"] as const).map((s) => (
                <button
                  key={s}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${signalType === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
                  onClick={() => setSignalType(s)}
                  disabled={showLoading}
                  title={s === "breakout" ? "Signal when Z crosses through threshold (entering extreme)" : s === "reversion" ? "Signal when Z crosses back inside threshold (leaving extreme)" : "Show both breakout and reversion signals"}
                >
                  {s === "breakout" ? "Breakout" : s === "reversion" ? "Reversion" : "Both"}
                </button>
              ))}
            </div>
          </div>

          {/* Run / Cancel */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"> </label>
            {showLoading ? (
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
                Run Optimizer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {results.length === 0 && !showLoading && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {mode === "scan"
              ? `Scans all pairs within the same ${GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label?.toLowerCase() || "group"} for mean-reversion signals`
              : 'Select two tickers and click "Run Optimizer" to test pair mean reversion'}
          </div>
        )}
        {showLoading && results.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Analyzing pairs...</div>
              <div className="text-xs font-mono text-muted-foreground">{progress.label}</div>
              <div className="text-xs font-mono text-muted-foreground mt-1">{progress.current}/{progress.total}</div>
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
                {sortedResults.length} pairs — {selectedMetric} ({spreadMethod === "ratio" ? "A/B" : "A−B"}) —{" "}
                {mode === "scan" ? `by ${GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label || groupBy}` : "manual"} —{" "}
                {returnMode === "band" ? `band ${formatPct(bandMin)}–${formatPct(bandMax)}` : `target ${formatPct(targetReturn)}`}
              </h3>
              <div className="flex items-center gap-1">
                {(["score", "halfLife", "hurst"] as const).map((s) => (
                  <button
                    key={s}
                    className={`text-[9px] font-mono px-2 py-0.5 rounded ${sortBy === s ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"}`}
                    onClick={() => setSortBy(s)}
                  >
                    {s === "score" ? "Score" : s === "halfLife" ? "Half-Life" : "Hurst"}
                  </button>
                ))}
                <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={handleExportCsv} data-testid="export-csv">
                  <Download className="w-3 h-3" />
                </Button>
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
                    {FWD_HORIZONS.map((h: HorizonDef) => (
                      <th key={h.label} className="text-center px-2 py-1 font-bold">
                        {returnMode === "band" ? "Band" : "Hit"} {h.label}
                      </th>
                    ))}
                    {FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2).map((h: HorizonDef) => (
                      <th key={`pf-${h.label}`} className="text-center px-2 py-1 font-bold">PF {h.label}</th>
                    ))}
                    <th className="text-center px-2 py-1 font-bold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((row) => {
                    const pairKey = `${row.tickerA}/${row.tickerB}`;
                    const isExpanded = expandedPair === pairKey;
                    const buy = row.buySummary;
                    const sell = row.sellSummary;
                    return (
                      <tr
                        key={pairKey}
                        className={`${isExpanded ? "bg-primary/10" : "hover:bg-white/5"} cursor-pointer`}
                        onClick={() => setExpandedPair(isExpanded ? null : pairKey)}
                      >
                        <td className="px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border whitespace-nowrap">
                          {row.tickerA} / {row.tickerB}
                        </td>
                        <td className={`text-center px-2 py-1 ${row.halfLife < 30 ? "text-emerald-400 font-bold" : row.halfLife < 63 ? "text-green-400" : row.halfLife < 126 ? "text-yellow-300" : "text-muted-foreground"}`}>
                          {row.halfLife === Infinity ? "∞" : `${row.halfLife}d`}
                        </td>
                        <td className={`text-center px-2 py-1 ${row.hurstExponent < 0.4 ? "text-emerald-400 font-bold" : row.hurstExponent < 0.5 ? "text-green-400" : "text-orange-400"}`}>
                          {row.hurstExponent.toFixed(3)}
                        </td>
                        <td className={`text-center px-2 py-1 ${row.adfPValue <= 0.05 ? "text-emerald-400 font-bold" : row.adfPValue <= 0.1 ? "text-green-400" : "text-muted-foreground"}`}>
                          {row.adfPValue <= 0.01 ? "<.01" : row.adfPValue.toFixed(2)}
                        </td>
                        <td className="text-center px-2 py-1 text-foreground">{row.bestWindow}d</td>
                        <td className="text-center px-2 py-1 text-foreground">{buy?.count}</td>
                        <td className="text-center px-2 py-1 text-foreground">{sell?.count}</td>
                        {FWD_HORIZONS.map((h: HorizonDef) => {
                          const rateField = returnMode === "band" ? "bandHitRate" : "hitRate";
                          const br = buy?.[rateField]?.[h.label] ?? buy?.hitRate[h.label];
                          const sr = sell?.[rateField]?.[h.label] ?? sell?.hitRate[h.label];
                          const combined = buy?.count > 0 && sell?.count > 0
                            ? (br * buy.count + sr * sell.count) / (buy.count + sell.count)
                            : buy?.count > 0 ? br : sr;
                          return (
                            <td key={h.label} className={`text-center px-2 py-1 ${hitRateClass(combined)}`}>
                              {formatPct(combined)}
                            </td>
                          );
                        })}
                        {FWD_HORIZONS.filter((_: HorizonDef, i: number) => i >= 2).map((h: HorizonDef) => {
                          const pf = buy?.count > 0 ? buy.profitFactor[h.label] : sell?.profitFactor[h.label];
                          return (
                            <td key={`pf-${h.label}`} className={`text-center px-2 py-1 ${pfTextColor(pf)}`}>
                              {pf >= 99 ? "∞" : pf?.toFixed(2)}
                            </td>
                          );
                        })}
                        <td className="text-center px-2 py-1">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded font-bold"
                            style={{
                              backgroundColor: scoreBackgroundColor(row.compositeScore),
                              color: scoreTextColor(row.compositeScore),
                            }}
                          >
                            {row.compositeScore}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Expanded pair detail */}
            {expandedPair && (() => {
              const detail = (results as PairResult[]).find((r: PairResult) => `${r.tickerA}/${r.tickerB}` === expandedPair);
              if (!detail) return null;
              const renderSummaryTable = (summary: any, side: "buy" | "sell") => (
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
                    {FWD_HORIZONS.map((h: HorizonDef) => (
                      <tr key={h.label}>
                        <td className="px-1 py-0.5 text-foreground font-bold">{h.label}</td>
                        <td className={`text-center px-1 py-0.5 ${hitRateClass(summary.hitRate[h.label])}`}>{formatPct(summary.hitRate[h.label])}</td>
                        <td className={`text-center px-1 py-0.5 ${hitRateClass(summary.winRate[h.label])}`}>{formatPct(summary.winRate[h.label])}</td>
                        <td className={`text-center px-1 py-0.5 ${side === "buy" ? summary.avgReturn[h.label] >= 0 ? "text-green-400" : "text-red-400" : summary.avgReturn[h.label] <= 0 ? "text-green-400" : "text-red-400"}`}>{formatPct(summary.avgReturn[h.label])}</td>
                        <td className={`text-center px-1 py-0.5 ${side === "buy" ? summary.medianReturn[h.label] >= 0 ? "text-green-400" : "text-red-400" : summary.medianReturn[h.label] <= 0 ? "text-green-400" : "text-red-400"}`}>{formatPct(summary.medianReturn[h.label])}</td>
                        <td className="text-center px-1 py-0.5 text-green-400">{formatPct(summary.avgPeak[h.label])}</td>
                        <td className="text-center px-1 py-0.5 text-red-400">{formatPct(summary.avgTrough[h.label])}</td>
                        <td className={`text-center px-1 py-0.5 ${pfTextColor(summary.profitFactor[h.label])}`}>
                          {summary.profitFactor[h.label] >= 99 ? "∞" : summary.profitFactor[h.label]?.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
              return (
                <div className="mt-4 border border-border rounded p-3 bg-card/50">
                  <h4 className="text-xs font-bold text-foreground mb-2">
                    {detail.tickerA} / {detail.tickerB} — Detailed Forward Returns ({selectedMetric})
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] font-mono text-emerald-400 font-bold mb-1">
                        BUY SPREAD (Long {detail.tickerA} / Short {detail.tickerB}) — {detail.buySummary?.count ?? 0} signals
                      </div>
                      {renderSummaryTable(detail.buySummary, "buy")}
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-red-400 font-bold mb-1">
                        SELL SPREAD (Short {detail.tickerA} / Long {detail.tickerB}) — {detail.sellSummary?.count ?? 0} signals
                      </div>
                      {renderSummaryTable(detail.sellSummary, "sell")}
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
