import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUniverse } from "@/lib/universeContext";
import { getTickers, getTickerRaw, getDates, type ClassifiedBase } from "@/lib/dataService";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
} from "lightweight-charts";
import type { IChartApi, Time } from "lightweight-charts";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Download,
  Loader2,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Search,
  X,
  Filter,
  RotateCcw,
} from "lucide-react";

// ── Metric options ──
const RATIO_METRICS = [
  { value: "close", label: "Stock Price" },
  { value: "P/FFO FY2", label: "P/FFO FY2" },
  { value: "P/AFFO FY2", label: "P/AFFO FY2" },
  { value: "P/FFO LTM", label: "P/FFO LTM" },
  { value: "P/E FY2", label: "P/E FY2" },
  { value: "EV/EBITDA FY2", label: "EV/EBITDA FY2" },
  { value: "Dividend Yield", label: "Div Yield" },
  { value: "FFO Yield FY2", label: "FFO Yield FY2" },
  { value: "AFFO Yield FY2", label: "AFFO Yield FY2" },
  { value: "FFO FY2", label: "FFO FY2" },
  { value: "AFFO FY2", label: "AFFO FY2" },
  { value: "Enterprise Value", label: "Enterprise Value" },
];

const LOOKBACK_OPTIONS = [
  { value: "60", label: "60d" },
  { value: "120", label: "120d" },
  { value: "252", label: "1Y" },
  { value: "504", label: "2Y" },
  { value: "all", label: "All" },
];

const ZSCORE_THRESHOLDS = [1, 1.5, 2, 2.5, 3];

interface PairData {
  tickerA: string;
  tickerB: string;
  currentRatio: number;
  zScore: number;
  mean: number;
  std: number;
  ratioSeries: { time: string; value: number }[];
  zScoreSeries: { time: string; value: number }[];
  pctChange30d: number;
  pctChange90d: number;
}

// ── Helpers ──
function zScoreColor(z: number): string {
  const abs = Math.abs(z);
  if (abs >= 2.5) return z > 0 ? "#ef4444" : "#22c55e";
  if (abs >= 2) return z > 0 ? "#f97316" : "#4ade80";
  if (abs >= 1.5) return z > 0 ? "#fbbf24" : "#6ee7b7";
  return "#94a3b8";
}

function zScoreBg(z: number): string {
  const abs = Math.abs(z);
  if (abs >= 2.5) return z > 0 ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)";
  if (abs >= 2) return z > 0 ? "rgba(249,115,22,0.08)" : "rgba(74,222,128,0.08)";
  return "transparent";
}

// ── Compute pair ratios ──
// RawTickerData format: Record<metric, [dateIndex, value][]>
// We need the global dates array to resolve dateIndex → date string
function computePairRatios(
  tickers: string[],
  tickerDataMap: Map<string, any>,
  globalDates: string[],
  metric: string,
  lookback: string,
  zThreshold: number
): PairData[] {
  const results: PairData[] = [];

  // Pre-build per-ticker dateIndex→value maps for the selected metric
  const metricMaps = new Map<string, Map<number, number>>();
  for (const ticker of tickers) {
    const raw = tickerDataMap.get(ticker);
    if (!raw) continue;
    const tuples: [number, number][] = raw[metric] || [];
    if (tuples.length === 0) continue;
    const m = new Map<number, number>();
    for (const [idx, val] of tuples) {
      if (val != null && val > 0) m.set(idx, val);
    }
    if (m.size > 0) metricMaps.set(ticker, m);
  }

  const validTickers = tickers.filter((t) => metricMaps.has(t));

  for (let i = 0; i < validTickers.length; i++) {
    for (let j = i + 1; j < validTickers.length; j++) {
      const tickerA = validTickers[i];
      const tickerB = validTickers[j];
      const mapA = metricMaps.get(tickerA)!;
      const mapB = metricMaps.get(tickerB)!;

      // Find common date indices where both have data
      const commonIndices: number[] = [];
      for (const [idx] of mapA) {
        if (mapB.has(idx)) commonIndices.push(idx);
      }
      commonIndices.sort((a, b) => a - b);

      if (commonIndices.length < 30) continue;

      // Apply lookback for z-score/stats computation
      let indices = commonIndices;
      if (lookback !== "all") {
        const lb = parseInt(lookback);
        if (indices.length > lb) indices = indices.slice(-lb);
      }

      // Compute lookback-limited ratio series (for table z-score/stats)
      const ratioSeries: { time: string; value: number }[] = [];
      for (const idx of indices) {
        const valA = mapA.get(idx)!;
        const valB = mapB.get(idx)!;
        const ratio = valA / valB;
        if (isFinite(ratio) && !isNaN(ratio)) {
          ratioSeries.push({ time: globalDates[idx], value: ratio });
        }
      }

      if (ratioSeries.length < 20) continue;

      // Z-score the ratio (using lookback window)
      const values = ratioSeries.map((r) => r.value);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      const std = Math.sqrt(variance);

      const currentRatio = values[values.length - 1];
      const zScore = std === 0 ? 0 : (currentRatio - mean) / std;

      const zScoreSeries = ratioSeries.map((r) => ({
        time: r.time,
        value: std === 0 ? 0 : (r.value - mean) / std,
      }));

      // Percent changes
      const len = values.length;
      const pctChange30d =
        len > 30 ? ((values[len - 1] / values[len - 31]) - 1) * 100 : 0;
      const pctChange90d =
        len > 90 ? ((values[len - 1] / values[len - 91]) - 1) * 100 : 0;

      results.push({
        tickerA,
        tickerB,
        currentRatio,
        zScore,
        mean,
        std,
        ratioSeries,
        zScoreSeries,
        pctChange30d,
        pctChange90d,
      });
    }
  }

  return results;
}

// ── Chart options shared by all pair ratio charts ──
const PR_CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid as const, color: "transparent" },
    textColor: "#7a8a9e",
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
  },
  grid: {
    vertLines: { color: "rgba(255,255,255,0.03)" },
    horzLines: { color: "rgba(255,255,255,0.03)" },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
  timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: false },
  handleScroll: true,
  handleScale: true,
};

// ── Mini Ratio Chart (sparkline in table rows — no sync needed) ──
function MiniRatioChart({
  pair,
  showZScore,
  height = 200,
}: {
  pair: PairData;
  showZScore: boolean;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const series = showZScore ? pair.zScoreSeries : pair.ratioSeries;

  useEffect(() => {
    const el = ref.current;
    if (!el || series.length === 0) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    const chart = createChart(el, { ...PR_CHART_OPTIONS, width: el.clientWidth, height });
    chartRef.current = chart;
    const lineSeries = chart.addSeries(LineSeries, { color: "#0ea5e9", lineWidth: 1.5 as any, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 3 });
    lineSeries.setData(series.map((d) => ({ time: d.time as Time, value: d.value })));
    if (showZScore) {
      for (const [val, clr] of [[0, "rgba(148,163,184,0.4)"], [2, "rgba(239,68,68,0.3)"], [-2, "rgba(34,197,94,0.3)"]] as [number, string][]) {
        const l = chart.addSeries(LineSeries, { color: clr, lineWidth: 1 as any, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
        l.setData(series.map((d) => ({ time: d.time as Time, value: val })));
      }
    }
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => { if (el.clientWidth > 0) chart.applyOptions({ width: el.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [series, showZScore, height]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}

// ── Synced Detail Charts (ratio + z-score, fully synced crosshair & scroll) ──
function SyncedDetailCharts({
  ratioSeries,
  zScoreSeries,
  ratioTitle,
  zScoreTitle,
}: {
  ratioSeries: { time: string; value: number }[];
  zScoreSeries: { time: string; value: number }[];
  ratioTitle: string;
  zScoreTitle: string;
}) {
  const ratioRef = useRef<HTMLDivElement>(null);
  const zRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<IChartApi[]>([]);
  const seriesRef = useRef<(ReturnType<IChartApi["addSeries"]>)[]>([]);
  const syncingRef = useRef(false);

  useEffect(() => {
    const ratioEl = ratioRef.current;
    const zEl = zRef.current;
    if (!ratioEl || !zEl || ratioSeries.length === 0) return;

    // Clean up previous
    chartsRef.current.forEach((c) => { try { c.remove(); } catch {} });
    chartsRef.current = [];
    seriesRef.current = [];

    const charts: IChartApi[] = [];
    const mainSeries: (ReturnType<IChartApi["addSeries"]>)[] = [];

    // --- Ratio chart ---
    const ratioChart = createChart(ratioEl, { ...PR_CHART_OPTIONS, width: ratioEl.clientWidth, height: ratioEl.clientHeight || 300 });
    const ratioLine = ratioChart.addSeries(LineSeries, { color: "#0ea5e9", lineWidth: 1.5 as any, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 3 });
    ratioLine.setData(ratioSeries.map((d) => ({ time: d.time as Time, value: d.value })));
    charts.push(ratioChart);
    mainSeries.push(ratioLine);

    // --- Z-Score chart ---
    const zChart = createChart(zEl, { ...PR_CHART_OPTIONS, width: zEl.clientWidth, height: zEl.clientHeight || 300 });
    const zLine = zChart.addSeries(LineSeries, { color: "#0ea5e9", lineWidth: 1.5 as any, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 3 });
    zLine.setData(zScoreSeries.map((d) => ({ time: d.time as Time, value: d.value })));
    // Reference lines: 0, ±2
    for (const [val, clr] of [[0, "rgba(148,163,184,0.4)"], [2, "rgba(239,68,68,0.3)"], [-2, "rgba(34,197,94,0.3)"]] as [number, string][]) {
      const l = zChart.addSeries(LineSeries, { color: clr, lineWidth: 1 as any, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
      l.setData(zScoreSeries.map((d) => ({ time: d.time as Time, value: val })));
    }
    charts.push(zChart);
    mainSeries.push(zLine);

    chartsRef.current = charts;
    seriesRef.current = mainSeries;

    // --- Sync: scroll/zoom ---
    charts.forEach((chart, i) => {
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncingRef.current || !range) return;
        syncingRef.current = true;
        charts.forEach((other, j) => {
          if (j !== i) { try { other.timeScale().setVisibleLogicalRange(range); } catch {} }
        });
        syncingRef.current = false;
      });

      // --- Sync: crosshair ---
      chart.subscribeCrosshairMove((param) => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        charts.forEach((other, j) => {
          if (j !== i) {
            try {
              if (param.time) {
                other.setCrosshairPosition(NaN, param.time, mainSeries[j]);
              } else {
                other.clearCrosshairPosition();
              }
            } catch {}
          }
        });
        syncingRef.current = false;
      });
    });

    // Fit content
    charts.forEach((c) => c.timeScale().fitContent());

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (ratioEl.clientWidth > 0) ratioChart.applyOptions({ width: ratioEl.clientWidth });
      if (zEl.clientWidth > 0) zChart.applyOptions({ width: zEl.clientWidth });
    });
    ro.observe(ratioEl);
    ro.observe(zEl);

    return () => {
      ro.disconnect();
      charts.forEach((c) => { try { c.remove(); } catch {} });
      chartsRef.current = [];
      seriesRef.current = [];
    };
  }, [ratioSeries, zScoreSeries]);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <div className="border border-border/30 rounded overflow-hidden">
        <div className="px-3 py-1.5 bg-card/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {ratioTitle}
        </div>
        <div ref={ratioRef} style={{ width: "100%", height: 300 }} />
      </div>
      <div className="border border-border/30 rounded overflow-hidden">
        <div className="px-3 py-1.5 bg-card/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {zScoreTitle}
        </div>
        <div ref={zRef} style={{ width: "100%", height: 300 }} />
      </div>
    </div>
  );
}

// ── Main Page ──
export default function PairRatios() {
  const PAGE_SIZE = 100;
  const [metric, setMetric] = useState("close");
  const [lookback, setLookback] = useState("252");
  const [zThreshold, setZThreshold] = useState(2);
  const [sortBy, setSortBy] = useState<"zscore" | "name" | "change30" | "change90">("zscore");
  const [showZScore, setShowZScore] = useState(true);
  const [selectedPair, setSelectedPair] = useState<PairData | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "extreme">("all");
  const [pageNum, setPageNum] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Value filters: min/max for each filterable column
  interface ValueFilter { min: string; max: string }
  const emptyFilter = (): ValueFilter => ({ min: "", max: "" });
  const [vfZScore, setVfZScore] = useState<ValueFilter>(emptyFilter());
  const [vfRatio, setVfRatio] = useState<ValueFilter>(emptyFilter());
  const [vfChg30, setVfChg30] = useState<ValueFilter>(emptyFilter());
  const [vfChg90, setVfChg90] = useState<ValueFilter>(emptyFilter());
  const [vfMean, setVfMean] = useState<ValueFilter>(emptyFilter());
  const [vfStd, setVfStd] = useState<ValueFilter>(emptyFilter());

  const hasValueFilters = [vfZScore, vfRatio, vfChg30, vfChg90, vfMean, vfStd].some(
    (f) => f.min.trim() !== "" || f.max.trim() !== ""
  );
  const clearValueFilters = () => {
    setVfZScore(emptyFilter());
    setVfRatio(emptyFilter());
    setVfChg30(emptyFilter());
    setVfChg90(emptyFilter());
    setVfMean(emptyFilter());
    setVfStd(emptyFilter());
  };

  const {
    universeTickers,
    isFiltered,
    filteredTickersList,
    allTickers,
    filteredCount,
    totalCount,
  } = useUniverse();

  // Serialize/restore state
  const serializeState = useCallback(
    () => ({ metric, lookback, zThreshold, sortBy, showZScore, filterMode, searchQuery, vfZScore, vfRatio, vfChg30, vfChg90, vfMean, vfStd }),
    [metric, lookback, zThreshold, sortBy, showZScore, filterMode, searchQuery, vfZScore, vfRatio, vfChg30, vfChg90, vfMean, vfStd]
  );
  const restoreState = useCallback((s: any) => {
    if (s?.metric) setMetric(s.metric);
    if (s?.lookback) setLookback(s.lookback);
    if (s?.zThreshold) setZThreshold(s.zThreshold);
    if (s?.sortBy) setSortBy(s.sortBy);
    if (s?.showZScore !== undefined) setShowZScore(s.showZScore);
    if (s?.filterMode) setFilterMode(s.filterMode);
    if (s?.searchQuery !== undefined) setSearchQuery(s.searchQuery);
    if (s?.vfZScore) setVfZScore(s.vfZScore);
    if (s?.vfRatio) setVfRatio(s.vfRatio);
    if (s?.vfChg30) setVfChg30(s.vfChg30);
    if (s?.vfChg90) setVfChg90(s.vfChg90);
    if (s?.vfMean) setVfMean(s.vfMean);
    if (s?.vfStd) setVfStd(s.vfStd);
  }, []);
  useWorkspaceTab("pair-ratios", serializeState, restoreState);

  // Get tickers
  const tickerList = useMemo(() => {
    const list = isFiltered ? filteredTickersList : allTickers;
    return list
      .filter((t) => t.ticker !== "TEST" && t.ticker !== "TST2")
      .map((t) => t.ticker)
      .sort();
  }, [isFiltered, filteredTickersList, allTickers]);

  // Load global dates array
  const { data: globalDates } = useQuery({
    queryKey: ["global-dates"],
    queryFn: getDates,
  });

  // Load all ticker data (batch in chunks of 20 to avoid overwhelming)
  const { data: tickerDataMap, isLoading } = useQuery({
    queryKey: ["pair-ratio-data", tickerList.join(",")],
    queryFn: async () => {
      const map = new Map<string, any>();
      const CHUNK = 20;
      for (let start = 0; start < tickerList.length; start += CHUNK) {
        const chunk = tickerList.slice(start, start + CHUNK);
        await Promise.all(
          chunk.map(async (ticker) => {
            try {
              const data = await getTickerRaw(ticker);
              if (data) map.set(ticker, data);
            } catch {}
          })
        );
      }
      return map;
    },
    enabled: tickerList.length >= 2,
  });

  // Compute all pair ratios
  const pairResults = useMemo(() => {
    if (!tickerDataMap || tickerDataMap.size < 2 || !globalDates || globalDates.length === 0) return [];
    return computePairRatios(tickerList, tickerDataMap, globalDates, metric, lookback, zThreshold);
  }, [tickerList, tickerDataMap, globalDates, metric, lookback, zThreshold]);

  // Filter and sort
  const displayPairs = useMemo(() => {
    let pairs = [...pairResults];
    if (filterMode === "extreme") {
      pairs = pairs.filter((p) => Math.abs(p.zScore) >= zThreshold);
    }

    // Apply value filters
    const applyVF = (pairs: PairData[], vf: ValueFilter, getter: (p: PairData) => number) => {
      const minVal = vf.min.trim() !== "" ? parseFloat(vf.min) : null;
      const maxVal = vf.max.trim() !== "" ? parseFloat(vf.max) : null;
      if (minVal === null && maxVal === null) return pairs;
      return pairs.filter((p) => {
        const v = getter(p);
        if (minVal !== null && !isNaN(minVal) && v < minVal) return false;
        if (maxVal !== null && !isNaN(maxVal) && v > maxVal) return false;
        return true;
      });
    };
    pairs = applyVF(pairs, vfZScore, (p) => p.zScore);
    pairs = applyVF(pairs, vfRatio, (p) => p.currentRatio);
    pairs = applyVF(pairs, vfChg30, (p) => p.pctChange30d);
    pairs = applyVF(pairs, vfChg90, (p) => p.pctChange90d);
    pairs = applyVF(pairs, vfMean, (p) => p.mean);
    pairs = applyVF(pairs, vfStd, (p) => p.std);

    switch (sortBy) {
      case "zscore":
        pairs.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
        break;
      case "name":
        pairs.sort((a, b) =>
          `${a.tickerA}/${a.tickerB}`.localeCompare(`${b.tickerA}/${b.tickerB}`)
        );
        break;
      case "change30":
        pairs.sort((a, b) => Math.abs(b.pctChange30d) - Math.abs(a.pctChange30d));
        break;
      case "change90":
        pairs.sort((a, b) => Math.abs(b.pctChange90d) - Math.abs(a.pctChange90d));
        break;
    }
    return pairs;
  }, [pairResults, filterMode, sortBy, zThreshold, vfZScore, vfRatio, vfChg30, vfChg90, vfMean, vfStd]);

  // Apply search filter on top of displayPairs
  const searchedPairs = useMemo(() => {
    if (!searchQuery.trim()) return displayPairs;
    const q = searchQuery.trim().toUpperCase();
    // Support "AMT/SBAC" or "AMT SBAC" or just "AMT"
    const parts = q.split(/[\/\s,]+/).filter(Boolean);
    if (parts.length === 0) return displayPairs;
    if (parts.length === 1) {
      // Match either ticker
      return displayPairs.filter(
        (p) => p.tickerA.includes(parts[0]) || p.tickerB.includes(parts[0])
      );
    }
    // Two terms: match A contains first AND B contains second, or vice versa
    return displayPairs.filter(
      (p) =>
        (p.tickerA.includes(parts[0]) && p.tickerB.includes(parts[1])) ||
        (p.tickerA.includes(parts[1]) && p.tickerB.includes(parts[0]))
    );
  }, [displayPairs, searchQuery]);

  // Reset page when filters or search change
  useEffect(() => { setPageNum(0); }, [filterMode, sortBy, metric, lookback, zThreshold, searchQuery, vfZScore, vfRatio, vfChg30, vfChg90, vfMean, vfStd]);

  const totalPages = Math.max(1, Math.ceil(searchedPairs.length / PAGE_SIZE));
  const pagedPairs = useMemo(
    () => searchedPairs.slice(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE),
    [searchedPairs, pageNum]
  );

  const extremeCount = useMemo(
    () => pairResults.filter((p) => Math.abs(p.zScore) >= zThreshold).length,
    [pairResults, zThreshold]
  );

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearchQuery("");
        searchRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // CSV export
  const exportCSV = useCallback(() => {
    const header = "Pair,Current Ratio,Z-Score,Mean,Std Dev,30d Chg%,90d Chg%";
    const lines = displayPairs.map(
      (p) =>
        `${p.tickerA}/${p.tickerB},${p.currentRatio.toFixed(4)},${p.zScore.toFixed(3)},${p.mean.toFixed(4)},${p.std.toFixed(4)},${p.pctChange30d.toFixed(2)},${p.pctChange90d.toFixed(2)}`
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pair_ratios_${metric}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayPairs, metric]);

  // Compute full-history series on-demand when a pair is selected
  const detailSeries = useMemo(() => {
    if (!selectedPair || !tickerDataMap || !globalDates) return null;
    const rawA = tickerDataMap.get(selectedPair.tickerA);
    const rawB = tickerDataMap.get(selectedPair.tickerB);
    if (!rawA || !rawB) return null;

    const tuplesA: [number, number][] = rawA[metric] || [];
    const tuplesB: [number, number][] = rawB[metric] || [];
    const mapA = new Map<number, number>();
    for (const [idx, val] of tuplesA) { if (val != null && val > 0) mapA.set(idx, val); }
    const mapB = new Map<number, number>();
    for (const [idx, val] of tuplesB) { if (val != null && val > 0) mapB.set(idx, val); }

    const commonIndices: number[] = [];
    for (const [idx] of mapA) { if (mapB.has(idx)) commonIndices.push(idx); }
    commonIndices.sort((a, b) => a - b);

    const fullRatio: { time: string; value: number }[] = [];
    for (const idx of commonIndices) {
      const ratio = mapA.get(idx)! / mapB.get(idx)!;
      if (isFinite(ratio) && !isNaN(ratio)) {
        fullRatio.push({ time: globalDates[idx], value: ratio });
      }
    }
    if (fullRatio.length === 0) return null;

    const { mean, std } = selectedPair;
    const fullZ = fullRatio.map((r) => ({
      time: r.time,
      value: std === 0 ? 0 : (r.value - mean) / std,
    }));

    return { fullRatio, fullZ };
  }, [selectedPair, tickerDataMap, globalDates, metric]);

  // ── Detail View ──
  if (selectedPair) {
    return (
      <div className="flex h-full bg-background" data-testid="pair-ratios-page">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/50">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setSelectedPair(null)}
            >
              <ArrowLeft className="w-3 h-3" /> Back
            </Button>
            <div className="text-sm font-bold font-mono">
              {selectedPair.tickerA} / {selectedPair.tickerB}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Metric: {RATIO_METRICS.find((m) => m.value === metric)?.label}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <div className="border border-border/30 rounded px-2 py-1 text-[10px]">
                <span className="text-muted-foreground">Ratio: </span>
                <span className="font-mono font-bold">
                  {selectedPair.currentRatio.toFixed(4)}
                </span>
              </div>
              <div className="border border-border/30 rounded px-2 py-1 text-[10px]">
                <span className="text-muted-foreground">Z ({LOOKBACK_OPTIONS.find(o => o.value === lookback)?.label}): </span>
                <span
                  className="font-mono font-bold"
                  style={{ color: zScoreColor(selectedPair.zScore) }}
                >
                  {selectedPair.zScore.toFixed(3)}
                </span>
              </div>
              <div className="border border-border/30 rounded px-2 py-1 text-[10px]">
                <span className="text-muted-foreground">μ: </span>
                <span className="font-mono">
                  {selectedPair.mean.toFixed(4)}
                </span>
              </div>
              <div className="border border-border/30 rounded px-2 py-1 text-[10px]">
                <span className="text-muted-foreground">σ: </span>
                <span className="font-mono">
                  {selectedPair.std.toFixed(4)}
                </span>
              </div>
              {detailSeries && (
                <div className="border border-border/30 rounded px-2 py-1 text-[10px]">
                  <span className="text-muted-foreground">Pts: </span>
                  <span className="font-mono">{detailSeries.fullRatio.length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Synced Charts */}
          {detailSeries ? (
            <SyncedDetailCharts
              ratioSeries={detailSeries.fullRatio}
              zScoreSeries={detailSeries.fullZ}
              ratioTitle={`Ratio: ${selectedPair.tickerA} / ${selectedPair.tickerB} — ${RATIO_METRICS.find((m) => m.value === metric)?.label} (${detailSeries.fullRatio.length} pts)`}
              zScoreTitle={`Z-Score (±2σ bands — mean/σ from ${LOOKBACK_OPTIONS.find(o => o.value === lookback)?.label} window)`}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading chart data...
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Table View ──
  return (
    <div className="flex h-full bg-background" data-testid="pair-ratios-page">
      {/* Sidebar */}
      <div className="w-[240px] border-r border-border bg-card flex flex-col flex-shrink-0 overflow-y-auto">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs font-bold tracking-tight">Pair Ratios</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {isFiltered
              ? `${filteredCount} tickers (filtered)`
              : `${totalCount} tickers (all)`}
          </div>
        </div>

        <div className="p-3 space-y-3 flex-1">
          {/* Metric selector */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Ratio Metric
            </div>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="h-7 text-[11px]" data-testid="ratio-metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATIO_METRICS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lookback */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Lookback
            </div>
            <Select value={lookback} onValueChange={setLookback}>
              <SelectTrigger className="h-7 text-[11px]" data-testid="ratio-lookback">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOOKBACK_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Z-Score Threshold */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Z-Score Threshold
            </div>
            <Select
              value={String(zThreshold)}
              onValueChange={(v) => setZThreshold(parseFloat(v))}
            >
              <SelectTrigger className="h-7 text-[11px]" data-testid="ratio-z-thresh">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZSCORE_THRESHOLDS.map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    ±{t}σ
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sort By */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Sort By
            </div>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="h-7 text-[11px]" data-testid="ratio-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zscore">|Z-Score| (extreme first)</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
                <SelectItem value="change30">|30d Change|</SelectItem>
                <SelectItem value="change90">|90d Change|</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filter mode */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Show
            </div>
            <div className="flex gap-1">
              <Button
                variant={filterMode === "all" ? "default" : "secondary"}
                size="sm"
                className="flex-1 h-6 text-[10px]"
                onClick={() => setFilterMode("all")}
              >
                All ({pairResults.length})
              </Button>
              <Button
                variant={filterMode === "extreme" ? "default" : "secondary"}
                size="sm"
                className="flex-1 h-6 text-[10px]"
                onClick={() => setFilterMode("extreme")}
              >
                Extreme ({extremeCount})
              </Button>
            </div>
          </div>

          {/* Value Filters */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider flex items-center gap-1">
                <Filter className="w-3 h-3" /> Value Filters
              </div>
              {hasValueFilters && (
                <button
                  onClick={clearValueFilters}
                  className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                  title="Clear all value filters"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Reset
                </button>
              )}
            </div>
            {([
              { label: "Z-Score", vf: vfZScore, set: setVfZScore },
              { label: "Ratio", vf: vfRatio, set: setVfRatio },
              { label: "30d Chg%", vf: vfChg30, set: setVfChg30 },
              { label: "90d Chg%", vf: vfChg90, set: setVfChg90 },
              { label: "Mean", vf: vfMean, set: setVfMean },
              { label: "Std", vf: vfStd, set: setVfStd },
            ] as const).map(({ label, vf, set }) => (
              <div key={label} className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground w-[52px] flex-shrink-0 truncate" title={label}>{label}</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Min"
                  value={vf.min}
                  onChange={(e) => set({ ...vf, min: e.target.value })}
                  className="h-5 text-[10px] font-mono px-1.5 flex-1 min-w-0"
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Max"
                  value={vf.max}
                  onChange={(e) => set({ ...vf, max: e.target.value })}
                  className="h-5 text-[10px] font-mono px-1.5 flex-1 min-w-0"
                />
              </div>
            ))}
            {hasValueFilters && (
              <div className="text-[9px] text-muted-foreground">
                {displayPairs.length.toLocaleString()} pairs match filters
              </div>
            )}
          </div>

          {/* Stats summary */}
          <div className="border border-border/30 rounded p-2 bg-card/30 space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Summary
            </div>
            <div className="text-[11px] font-mono space-y-0.5">
              <div>
                Total pairs:{" "}
                <span className="font-bold">{pairResults.length}</span>
              </div>
              <div>
                Above +{zThreshold}σ:{" "}
                <span className="font-bold text-red-400">
                  {pairResults.filter((p) => p.zScore >= zThreshold).length}
                </span>
              </div>
              <div>
                Below -{zThreshold}σ:{" "}
                <span className="font-bold text-green-400">
                  {pairResults.filter((p) => p.zScore <= -zThreshold).length}
                </span>
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs gap-1.5"
            onClick={exportCSV}
            disabled={displayPairs.length === 0}
          >
            <Download className="w-3 h-3" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading ticker data...
          </div>
        ) : tickerList.length < 2 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Apply a Universe filter with at least 2 tickers to see pair ratios
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Search bar */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50 flex-shrink-0">
              <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <Input
                ref={searchRef}
                type="text"
                placeholder='Search pairs — e.g. "AMT", "AMT/SBAC", "PLD REXR"'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-6 text-[11px] font-mono bg-transparent border-none shadow-none focus-visible:ring-0 px-0 placeholder:text-muted-foreground/50"
                data-testid="pair-search"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {searchQuery.trim() && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {searchedPairs.length.toLocaleString()} match{searchedPairs.length !== 1 ? "es" : ""}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto">
            {/* Table header */}
            <table className="w-full table-fixed text-[11px] font-mono">
              <thead className="sticky top-0 z-10 bg-card border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-[140px]">
                    Pair (A/B)
                  </th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[90px]">
                    Ratio
                  </th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[70px]">
                    Z-Score
                  </th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[60px]">
                    Mean
                  </th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[60px]">
                    Std
                  </th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[65px]">
                    30d Chg
                  </th>
                  <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[65px]">
                    90d Chg
                  </th>
                  <th className="px-2 py-2 font-semibold text-muted-foreground w-[180px] min-w-[180px] max-w-[180px]">
                    Ratio Z-Score Chart
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedPairs.map((pair, idx) => (
                  <tr
                    key={`${pair.tickerA}-${pair.tickerB}`}
                    className="border-b border-border/20 hover:bg-accent/30 cursor-pointer group"
                    style={{ backgroundColor: zScoreBg(pair.zScore) }}
                    onClick={() => setSelectedPair(pair)}
                    data-testid={`pair-row-${idx}`}
                  >
                    <td className="px-3 py-1.5 font-bold">
                      <span className="text-foreground">
                        {pair.tickerA}
                      </span>
                      <span className="text-muted-foreground/60">/</span>
                      <span className="text-foreground">
                        {pair.tickerB}
                      </span>
                    </td>
                    <td className="text-right px-2 py-1.5">
                      {pair.currentRatio.toFixed(3)}
                    </td>
                    <td className="text-right px-2 py-1.5">
                      <span
                        className="font-bold"
                        style={{ color: zScoreColor(pair.zScore) }}
                      >
                        {pair.zScore >= 0 ? "+" : ""}
                        {pair.zScore.toFixed(2)}
                      </span>
                    </td>
                    <td className="text-right px-2 py-1.5 text-muted-foreground">
                      {pair.mean.toFixed(3)}
                    </td>
                    <td className="text-right px-2 py-1.5 text-muted-foreground">
                      {pair.std.toFixed(3)}
                    </td>
                    <td className="text-right px-2 py-1.5">
                      <span
                        style={{
                          color:
                            pair.pctChange30d > 0
                              ? "#22c55e"
                              : pair.pctChange30d < 0
                              ? "#ef4444"
                              : "#94a3b8",
                        }}
                      >
                        {pair.pctChange30d >= 0 ? "+" : ""}
                        {pair.pctChange30d.toFixed(1)}%
                      </span>
                    </td>
                    <td className="text-right px-2 py-1.5">
                      <span
                        style={{
                          color:
                            pair.pctChange90d > 0
                              ? "#22c55e"
                              : pair.pctChange90d < 0
                              ? "#ef4444"
                              : "#94a3b8",
                        }}
                      >
                        {pair.pctChange90d >= 0 ? "+" : ""}
                        {pair.pctChange90d.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-2 py-0.5 w-[180px] min-w-[180px] max-w-[180px]">
                      <MiniSparkline pair={pair} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Pagination controls */}
            {searchedPairs.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-card/50 text-xs">
                <span className="text-muted-foreground">
                  Showing {pageNum * PAGE_SIZE + 1}–{Math.min((pageNum + 1) * PAGE_SIZE, searchedPairs.length)} of {searchedPairs.length.toLocaleString()} pairs
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={pageNum === 0}
                    onClick={() => setPageNum(0)}
                  >
                    First
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={pageNum === 0}
                    onClick={() => setPageNum(p => p - 1)}
                  >
                    Prev
                  </Button>
                  <span className="px-2 font-mono text-muted-foreground">
                    {pageNum + 1} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={pageNum >= totalPages - 1}
                    onClick={() => setPageNum(p => p + 1)}
                  >
                    Next
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={pageNum >= totalPages - 1}
                    onClick={() => setPageNum(totalPages - 1)}
                  >
                    Last
                  </Button>
                </div>
              </div>
            )}
            {searchedPairs.length === 0 && (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                {searchQuery.trim()
                  ? `No pairs matching "${searchQuery.trim()}"`
                  : filterMode === "extreme"
                  ? `No pairs beyond ±${zThreshold}σ`
                  : "No valid pairs found"}
              </div>
            )}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sparkline ──
const SPARKLINE_W = 160;
const SPARKLINE_H = 28;
const SPARKLINE_MAX_PTS = 100;

function downsample(
  data: { time: string; value: number }[],
  maxPts: number
): { time: string; value: number }[] {
  if (data.length <= maxPts) return data;
  const step = (data.length - 1) / (maxPts - 1);
  const out: { time: string; value: number }[] = [];
  for (let i = 0; i < maxPts; i++) {
    out.push(data[Math.round(i * step)]);
  }
  return out;
}

function MiniSparkline({ pair }: { pair: PairData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pair.zScoreSeries.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = SPARKLINE_W;
    const h = SPARKLINE_H;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const data = downsample(pair.zScoreSeries, SPARKLINE_MAX_PTS);
    const maxAbs = Math.max(3, ...data.map((d) => Math.abs(d.value)));
    const pad = 2;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;
    const yCenter = pad + plotH / 2;

    // ±2σ bands
    const upper2Y = yCenter - (2 / maxAbs) * (plotH / 2);
    const lower2Y = yCenter + (2 / maxAbs) * (plotH / 2);
    ctx.fillStyle = "rgba(239,68,68,0.06)";
    ctx.fillRect(pad, pad, plotW, upper2Y - pad);
    ctx.fillStyle = "rgba(34,197,94,0.06)";
    ctx.fillRect(pad, lower2Y, plotW, h - pad - lower2Y);

    // Zero line
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad, yCenter);
    ctx.lineTo(w - pad, yCenter);
    ctx.stroke();

    // ±2 lines
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(pad, upper2Y);
    ctx.lineTo(w - pad, upper2Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad, lower2Y);
    ctx.lineTo(w - pad, lower2Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Z-score line
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = pad + (i / (data.length - 1)) * plotW;
      const y = yCenter - (data[i].value / maxAbs) * (plotH / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Current value dot
    const lastY =
      yCenter - (data[data.length - 1].value / maxAbs) * (plotH / 2);
    ctx.beginPath();
    ctx.arc(w - pad, lastY, 2, 0, Math.PI * 2);
    ctx.fillStyle = zScoreColor(pair.zScore);
    ctx.fill();
  }, [pair]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: SPARKLINE_W, height: SPARKLINE_H }}
      className="block"
    />
  );
}
