// Reconstructed from recovered-bundle/PairRatios-B1PiWPRS.js on 2026-06-11
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAppContext } from "@/lib/appContext";
import { useWorkspaceState } from "@/lib/workspaceState";
import { useRouterState } from "@/lib/navigateToPairs";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Download, Loader2, ExternalLink } from "lucide-react";
import { fetchWorkbookData } from "@/lib/fetchWorkbookData";
import { fetchGlobalDates } from "@/lib/fetchGlobalDates";
import { useUniverseSignature } from "@/lib/universeSignature";
import {
  createChart,
  CrosshairMode,
  ColorType,
  LineSeries,
} from "lightweight-charts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RatioPair {
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

interface ValueFilter {
  min: string;
  max: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const METRIC_OPTIONS = [
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

const Z_THRESHOLDS = [1, 1.5, 2, 2.5, 3];

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
function zScoreColor(z: number): string {
  const abs = Math.abs(z);
  return abs >= 2.5
    ? z > 0 ? "#ef4444" : "#22c55e"
    : abs >= 2
    ? z > 0 ? "#f97316" : "#4ade80"
    : abs >= 1.5
    ? z > 0 ? "#fbbf24" : "#6ee7b7"
    : "#94a3b8";
}

function zScoreBgColor(z: number): string {
  const abs = Math.abs(z);
  return abs >= 2.5
    ? z > 0 ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)"
    : abs >= 2
    ? z > 0 ? "rgba(249,115,22,0.08)" : "rgba(74,222,128,0.08)"
    : "transparent";
}

// ---------------------------------------------------------------------------
// Compute all pair ratio objects
// ---------------------------------------------------------------------------
function computePairRatios(
  tickers: string[],
  dataMap: Map<string, any>,
  dates: string[],
  metric: string,
  lookback: string
): RatioPair[] {
  const results: RatioPair[] = [];
  const cleanMap = new Map<string, Map<number, number>>();

  for (const ticker of tickers) {
    const tickerData = dataMap.get(ticker);
    if (!tickerData) continue;
    const series: [number, number][] = tickerData[metric] || [];
    if (series.length === 0) continue;
    const valueMap = new Map<number, number>();
    for (const [idx, val] of series) {
      if (val != null && isFinite(val) && val !== 0) valueMap.set(idx, val);
    }
    if (valueMap.size > 0) cleanMap.set(ticker, valueMap);
  }

  const validTickers = tickers.filter((t) => cleanMap.has(t));

  for (let i = 0; i < validTickers.length; i++) {
    for (let j = i + 1; j < validTickers.length; j++) {
      const tickerA = validTickers[i];
      const tickerB = validTickers[j];
      const mapA = cleanMap.get(tickerA)!;
      const mapB = cleanMap.get(tickerB)!;

      const sharedIndices: number[] = [];
      for (const [idx] of mapA) {
        if (mapB.has(idx)) sharedIndices.push(idx);
      }
      sharedIndices.sort((a, b) => a - b);
      if (sharedIndices.length < 30) continue;

      let indices = sharedIndices;
      if (lookback !== "all") {
        const n = parseInt(lookback);
        if (indices.length > n) indices = indices.slice(-n);
      }

      const ratioSeries: { time: string; value: number }[] = [];
      for (const idx of indices) {
        if (idx >= dates.length) continue;
        const a = mapA.get(idx)!;
        const b = mapB.get(idx)!;
        if (!(a > 0) || !(b > 0)) continue;
        const ratio = a / b;
        if (isFinite(ratio) && !isNaN(ratio)) {
          ratioSeries.push({ time: dates[idx], value: ratio });
        }
      }
      if (ratioSeries.length < 20) continue;

      const values = ratioSeries.map((p) => p.value);
      const logValues = values.map((v) => Math.log(v));
      const logMean = logValues.reduce((s, v) => s + v, 0) / logValues.length;
      const logVar = logValues.reduce((s, v) => s + (v - logMean) ** 2, 0) / logValues.length;
      const logStd = Math.sqrt(logVar);

      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);

      const last = values[values.length - 1];
      const zScore = logStd === 0 ? 0 : (Math.log(last) - logMean) / logStd;
      const zScoreSeries = ratioSeries.map((p) => ({
        time: p.time,
        value: logStd === 0 ? 0 : (Math.log(p.value) - logMean) / logStd,
      }));

      const n = values.length;
      const pctChange30d = n > 30 ? (values[n - 1] / values[n - 31] - 1) * 100 : 0;
      const pctChange90d = n > 90 ? (values[n - 1] / values[n - 91] - 1) * 100 : 0;

      results.push({
        tickerA,
        tickerB,
        currentRatio: last,
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

// ---------------------------------------------------------------------------
// Chart options
// ---------------------------------------------------------------------------
const CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid, color: "transparent" },
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
  timeScale: {
    borderColor: "rgba(255,255,255,0.08)",
    timeVisible: false,
  },
  handleScroll: true,
  handleScale: true,
};

// ---------------------------------------------------------------------------
// PairRatioChart component
// ---------------------------------------------------------------------------
interface PairRatioChartProps {
  ratioSeries: { time: string; value: number }[];
  zScoreSeries: { time: string; value: number }[];
  ratioTitle: string;
  zScoreTitle: string;
}

function PairRatioChart({ ratioSeries, zScoreSeries, ratioTitle, zScoreTitle }: PairRatioChartProps) {
  const ratioRef = useRef<HTMLDivElement>(null);
  const zScoreRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<any[]>([]);
  const seriesRef = useRef<any[]>([]);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const ratioEl = ratioRef.current;
    const zScoreEl = zScoreRef.current;
    if (!ratioEl || !zScoreEl || ratioSeries.length === 0) return;

    chartsRef.current.forEach((c) => {
      try { c.remove(); } catch {}
    });
    chartsRef.current = [];
    seriesRef.current = [];

    const charts: any[] = [];
    const allSeries: any[] = [];

    const chart1 = createChart(ratioEl, {
      ...CHART_OPTIONS,
      width: ratioEl.clientWidth,
      height: ratioEl.clientHeight || 300,
    });
    const rSeries = (chart1 as any).addSeries(LineSeries, {
      color: "#0ea5e9",
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 3,
    });
    rSeries.setData(ratioSeries.map((p) => ({ time: p.time, value: p.value })));
    charts.push(chart1);
    allSeries.push(rSeries);

    const chart2 = createChart(zScoreEl, {
      ...CHART_OPTIONS,
      width: zScoreEl.clientWidth,
      height: zScoreEl.clientHeight || 300,
    });
    const zSeries = (chart2 as any).addSeries(LineSeries, {
      color: "#0ea5e9",
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 3,
    });
    zSeries.setData(zScoreSeries.map((p) => ({ time: p.time, value: p.value })));

    for (const [level, color] of [
      [0, "rgba(148,163,184,0.4)"],
      [2, "rgba(239,68,68,0.3)"],
      [-2, "rgba(34,197,94,0.3)"],
    ] as [number, string][]) {
      const bandSeries = (chart2 as any).addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        lineStyle: 2,
      });
      bandSeries.setData(zScoreSeries.map((p) => ({ time: p.time, value: level })));
    }

    charts.push(chart2);
    allSeries.push(zSeries);
    chartsRef.current = charts;
    seriesRef.current = allSeries;

    charts.forEach((chart, idx) => {
      chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
        if (isSyncingRef.current || !range) return;
        isSyncingRef.current = true;
        charts.forEach((other, otherIdx) => {
          if (otherIdx !== idx) {
            try { other.timeScale().setVisibleLogicalRange(range); } catch {}
          }
        });
        isSyncingRef.current = false;
      });
      chart.subscribeCrosshairMove((param: any) => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        charts.forEach((other, otherIdx) => {
          if (otherIdx !== idx) {
            try {
              if (param.time) {
                other.setCrosshairPosition(NaN, param.time, allSeries[otherIdx]);
              } else {
                other.clearCrosshairPosition();
              }
            } catch {}
          }
        });
        isSyncingRef.current = false;
      });
    });

    charts.forEach((c) => c.timeScale().fitContent());

    const resizeObserver = new ResizeObserver(() => {
      if (ratioEl.clientWidth > 0) chart1.applyOptions({ width: ratioEl.clientWidth });
      if (zScoreEl.clientWidth > 0) chart2.applyOptions({ width: zScoreEl.clientWidth });
    });
    resizeObserver.observe(ratioEl);
    resizeObserver.observe(zScoreEl);

    return () => {
      resizeObserver.disconnect();
      charts.forEach((c) => {
        try { c.remove(); } catch {}
      });
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
        <div ref={zScoreRef} style={{ width: "100%", height: 300 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini sparkline canvas for table rows
// ---------------------------------------------------------------------------
const SPARK_WIDTH = 160;
const SPARK_HEIGHT = 28;
const SPARK_SAMPLES = 100;

function downsample(arr: { time: string; value: number }[], n: number) {
  if (arr.length <= n) return arr;
  const step = (arr.length - 1) / (n - 1);
  const result = [];
  for (let i = 0; i < n; i++) result.push(arr[Math.round(i * step)]);
  return result;
}

function PairSparkline({ pair }: { pair: RatioPair }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pair.zScoreSeries.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = SPARK_WIDTH;
    const h = SPARK_HEIGHT;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const samples = downsample(pair.zScoreSeries, SPARK_SAMPLES);
    const maxAbs = Math.max(3, ...samples.map((p) => Math.abs(p.value)));
    const pad = 2;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;
    const midY = pad + plotH / 2;
    const yPlus2 = midY - (2 / maxAbs) * (plotH / 2);
    const yMinus2 = midY + (2 / maxAbs) * (plotH / 2);

    ctx.fillStyle = "rgba(239,68,68,0.06)";
    ctx.fillRect(pad, pad, plotW, yPlus2 - pad);
    ctx.fillStyle = "rgba(34,197,94,0.06)";
    ctx.fillRect(pad, yMinus2, plotW, h - pad - yMinus2);

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad, midY);
    ctx.lineTo(w - pad, midY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(pad, yPlus2);
    ctx.lineTo(w - pad, yPlus2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad, yMinus2);
    ctx.lineTo(w - pad, yMinus2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const x = pad + (i / (samples.length - 1)) * plotW;
      const y = midY - (samples[i].value / maxAbs) * (plotH / 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    const lastY = midY - (samples[samples.length - 1].value / maxAbs) * (plotH / 2);
    ctx.beginPath();
    ctx.arc(w - pad, lastY, 2, 0, Math.PI * 2);
    ctx.fillStyle = zScoreColor(pair.zScore);
    ctx.fill();
  }, [pair]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: SPARK_WIDTH, height: SPARK_HEIGHT }}
      className="block"
    />
  );
}

// ---------------------------------------------------------------------------
// Main PairRatios page
// ---------------------------------------------------------------------------
export default function PairRatios() {
  const [metric, setMetric] = useState("close");
  const [lookback, setLookback] = useState("252");
  const [zThreshold, setZThreshold] = useState(2);
  const [sortBy, setSortBy] = useState("zscore");
  const [showZScore, setShowZScore] = useState(true);
  const [selectedPair, setSelectedPair] = useState<RatioPair | null>(null);
  const [filterMode, setFilterMode] = useState("all");
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const emptyFilter = (): ValueFilter => ({ min: "", max: "" });
  const [vfZScore, setVfZScore] = useState<ValueFilter>(emptyFilter());
  const [vfRatio, setVfRatio] = useState<ValueFilter>(emptyFilter());
  const [vfChg30, setVfChg30] = useState<ValueFilter>(emptyFilter());
  const [vfChg90, setVfChg90] = useState<ValueFilter>(emptyFilter());
  const [vfMean, setVfMean] = useState<ValueFilter>(emptyFilter());
  const [vfStd, setVfStd] = useState<ValueFilter>(emptyFilter());

  const hasActiveValueFilters = [vfZScore, vfRatio, vfChg30, vfChg90, vfMean, vfStd].some(
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
  } = useAppContext();

  const getState = useCallback(
    () => ({
      metric,
      lookback,
      zThreshold,
      sortBy,
      showZScore,
      filterMode,
      searchQuery,
      vfZScore,
      vfRatio,
      vfChg30,
      vfChg90,
      vfMean,
      vfStd,
    }),
    [metric, lookback, zThreshold, sortBy, showZScore, filterMode, searchQuery, vfZScore, vfRatio, vfChg30, vfChg90, vfMean, vfStd]
  );

  const restoreState = useCallback((saved: any) => {
    if (saved?.metric) setMetric(saved.metric);
    if (saved?.lookback) setLookback(saved.lookback);
    if (saved?.zThreshold) setZThreshold(saved.zThreshold);
    if (saved?.sortBy) setSortBy(saved.sortBy);
    if (saved?.showZScore !== undefined) setShowZScore(saved.showZScore);
    if (saved?.filterMode) setFilterMode(saved.filterMode);
    if (saved?.searchQuery !== undefined) setSearchQuery(saved.searchQuery);
    if (saved?.vfZScore) setVfZScore(saved.vfZScore);
    if (saved?.vfRatio) setVfRatio(saved.vfRatio);
    if (saved?.vfChg30) setVfChg30(saved.vfChg30);
    if (saved?.vfChg90) setVfChg90(saved.vfChg90);
    if (saved?.vfMean) setVfMean(saved.vfMean);
    if (saved?.vfStd) setVfStd(saved.vfStd);
  }, []);

  const universeSig = useUniverseSignature();
  useWorkspaceState("pair-ratios", getState, restoreState, {
    universeSig,
    resultFields: ["searchQuery"],
  });

  const VALID_RATIO_METRICS = new Set([
    "close","P/E LTM","P/E FY2","P/S LTM","P/S FY2","EV/EBITDA LTM","EV/EBITDA FY2",
    "P/FFO LTM","P/FFO FY2","P/AFFO LTM","P/AFFO FY2","Implied Cap Rate",
    "FFO Yield LTM","FFO Yield FY2","AFFO Yield LTM","AFFO Yield FY2","Dividend Yield",
    "FFO FY1","FFO FY2","AFFO FY1","AFFO FY2","EPS FY1","EPS FY2","EBITDA FY1",
    "EBITDA FY2","FY1 FFO Growth","FY2 FFO Growth","FY1 AFFO Growth","FY2 AFFO Growth",
    "FY1 EPS Growth","FY2 EPS Growth",
  ]);

  const routerState = useRouterState();
  const [, navigate] = useLocation();

  const navigateToPairsDetail = useCallback(
    (tickerA: string, tickerB: string, m: string) => {
      const resolvedMetric = VALID_RATIO_METRICS.has(m) ? m : "close";
      const cached = routerState.getCachedState("pairs") || {};
      routerState.pushState("pairs", {
        ...cached,
        tickerA,
        tickerB,
        metricA: resolvedMetric,
        metricB: resolvedMetric,
      });
      navigate("/pairs");
    },
    [routerState, navigate]
  );

  const tickerList = useMemo(
    () =>
      ((isFiltered ? filteredTickersList : allTickers) as { ticker: string }[])
        .filter((t) => t.ticker !== "TEST" && t.ticker !== "TST2")
        .map((t) => t.ticker)
        .sort(),
    [isFiltered, filteredTickersList, allTickers]
  );

  const { data: globalDates } = useQuery<string[]>({
    queryKey: ["global-dates"],
    queryFn: fetchGlobalDates,
  });

  const { data: workbookData, isLoading: isLoadingWorkbook } = useQuery<Map<string, any>>({
    queryKey: ["pair-ratio-data", tickerList.join(",")],
    queryFn: async () => {
      const map = new Map<string, any>();
      const batchSize = 20;
      for (let i = 0; i < tickerList.length; i += batchSize) {
        const batch = tickerList.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (ticker: string) => {
            try {
              const data = await fetchWorkbookData(ticker);
              if (data) map.set(ticker, data);
            } catch {}
          })
        );
      }
      return map;
    },
    enabled: tickerList.length >= 2,
  });

  const allPairs = useMemo(
    () =>
      !workbookData || workbookData.size < 2 || !globalDates || globalDates.length === 0
        ? []
        : computePairRatios(tickerList, workbookData, globalDates, metric, lookback),
    [tickerList, workbookData, globalDates, metric, lookback, zThreshold]
  );

  const filteredPairs = useMemo(() => {
    let list = [...allPairs];
    if (filterMode === "extreme") {
      list = list.filter((p) => Math.abs(p.zScore) >= zThreshold);
    }

    const applyFilter = (
      arr: RatioPair[],
      vf: ValueFilter,
      getter: (p: RatioPair) => number
    ) => {
      const min = vf.min.trim() !== "" ? parseFloat(vf.min) : null;
      const max = vf.max.trim() !== "" ? parseFloat(vf.max) : null;
      if (min === null && max === null) return arr;
      return arr.filter((p) => {
        const val = getter(p);
        return !(
          (min !== null && !isNaN(min) && val < min) ||
          (max !== null && !isNaN(max) && val > max)
        );
      });
    };

    list = applyFilter(list, vfZScore, (p) => p.zScore);
    list = applyFilter(list, vfRatio, (p) => p.currentRatio);
    list = applyFilter(list, vfChg30, (p) => p.pctChange30d);
    list = applyFilter(list, vfChg90, (p) => p.pctChange90d);
    list = applyFilter(list, vfMean, (p) => p.mean);
    list = applyFilter(list, vfStd, (p) => p.std);

    switch (sortBy) {
      case "zscore":
        list.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
        break;
      case "name":
        list.sort((a, b) =>
          `${a.tickerA}/${a.tickerB}`.localeCompare(`${b.tickerA}/${b.tickerB}`)
        );
        break;
      case "change30":
        list.sort((a, b) => Math.abs(b.pctChange30d) - Math.abs(a.pctChange30d));
        break;
      case "change90":
        list.sort((a, b) => Math.abs(b.pctChange90d) - Math.abs(a.pctChange90d));
        break;
    }
    return list;
  }, [allPairs, filterMode, sortBy, zThreshold, vfZScore, vfRatio, vfChg30, vfChg90, vfMean, vfStd]);

  const searchFilteredPairs = useMemo(() => {
    if (!searchQuery.trim()) return filteredPairs;
    const parts = searchQuery.trim().toUpperCase().split(/[\/\s,]+/).filter(Boolean);
    if (parts.length === 0) return filteredPairs;
    if (parts.length === 1) {
      return filteredPairs.filter(
        (p) => p.tickerA.includes(parts[0]) || p.tickerB.includes(parts[0])
      );
    }
    return filteredPairs.filter(
      (p) =>
        (p.tickerA.includes(parts[0]) && p.tickerB.includes(parts[1])) ||
        (p.tickerA.includes(parts[1]) && p.tickerB.includes(parts[0]))
    );
  }, [filteredPairs, searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [filterMode, sortBy, metric, lookback, zThreshold, searchQuery, vfZScore, vfRatio, vfChg30, vfChg90, vfMean, vfStd]);

  const totalPages = Math.max(1, Math.ceil(searchFilteredPairs.length / 100));
  const pagedPairs = useMemo(
    () => searchFilteredPairs.slice(page * 100, (page + 1) * 100),
    [searchFilteredPairs, page]
  );

  const extremeCount = useMemo(
    () => allPairs.filter((p) => Math.abs(p.zScore) >= zThreshold).length,
    [allPairs, zThreshold]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement?.tagName !== "INPUT"
      ) {
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

  const handleExportCsv = useCallback(() => {
    const header = "Pair,Current Ratio,Z-Score,Mean,Std Dev,30d Chg%,90d Chg%";
    const rows = filteredPairs.map(
      (p) =>
        `${p.tickerA}/${p.tickerB},${p.currentRatio.toFixed(4)},${p.zScore.toFixed(3)},${p.mean.toFixed(4)},${p.std.toFixed(4)},${p.pctChange30d.toFixed(2)},${p.pctChange90d.toFixed(2)}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pair_ratios_${metric}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredPairs, metric]);

  const detailChartData = useMemo(() => {
    if (!selectedPair || !workbookData || !globalDates) return null;
    const dataA = workbookData.get(selectedPair.tickerA);
    const dataB = workbookData.get(selectedPair.tickerB);
    if (!dataA || !dataB) return null;

    const seriesA: [number, number][] = dataA[metric] || [];
    const seriesB: [number, number][] = dataB[metric] || [];

    const mapA = new Map<number, number>();
    for (const [idx, val] of seriesA) {
      if (val != null && isFinite(val) && val !== 0) mapA.set(idx, val);
    }
    const mapB = new Map<number, number>();
    for (const [idx, val] of seriesB) {
      if (val != null && isFinite(val) && val !== 0) mapB.set(idx, val);
    }

    const sharedIndices: number[] = [];
    for (const [idx] of mapA) if (mapB.has(idx)) sharedIndices.push(idx);
    sharedIndices.sort((a, b) => a - b);

    const ratioSeries: { time: string; value: number }[] = [];
    for (const idx of sharedIndices) {
      if (idx >= globalDates.length) continue;
      const a = mapA.get(idx)!;
      const b = mapB.get(idx)!;
      if (!(a > 0) || !(b > 0)) continue;
      const ratio = a / b;
      if (isFinite(ratio) && !isNaN(ratio)) {
        ratioSeries.push({ time: globalDates[idx], value: ratio });
      }
    }
    if (ratioSeries.length === 0) return null;

    const values = ratioSeries.map((p) => p.value);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const n = Math.max(1, values.length - 1);
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n);

    const zScoreSeries = ratioSeries.map((p) => ({
      time: p.time,
      value: std === 0 ? 0 : (p.value - mean) / std,
    }));

    return { fullRatio: ratioSeries, fullZ: zScoreSeries, fullMean: mean, fullStd: std };
  }, [selectedPair, workbookData, globalDates, metric]);

  const valueFilterDefs = [
    { label: "Z-Score", vf: vfZScore, set: setVfZScore },
    { label: "Ratio", vf: vfRatio, set: setVfRatio },
    { label: "30d Chg%", vf: vfChg30, set: setVfChg30 },
    { label: "90d Chg%", vf: vfChg90, set: setVfChg90 },
    { label: "Mean", vf: vfMean, set: setVfMean },
    { label: "Std", vf: vfStd, set: setVfStd },
  ];

  // ---- Detail view ----
  if (selectedPair) {
    return (
      <div className="flex h-full bg-background" data-testid="pair-ratios-page">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card/50">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setSelectedPair(null)}
            >
              <ChevronLeft className="w-3 h-3" /> Back
            </Button>
            <div className="text-sm font-bold font-mono">
              {selectedPair.tickerA} / {selectedPair.tickerB}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Metric: {METRIC_OPTIONS.find((o) => o.value === metric)?.label}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1"
              title={`Open ${selectedPair.tickerA} / ${selectedPair.tickerB} in the Pairs deep-dive (13 charts: prices, log ratio, OLS residual Z, rolling β, beta-adj spread, etc.)`}
              onClick={() => navigateToPairsDetail(selectedPair.tickerA, selectedPair.tickerB, metric)}
              data-testid="open-in-pairs"
            >
              <ExternalLink className="w-3 h-3" /> Open in Pairs
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <div className="border border-border/30 rounded px-2 py-1 text-[10px]">
                <span className="text-muted-foreground">Ratio: </span>
                <span className="font-mono font-bold">{selectedPair.currentRatio.toFixed(4)}</span>
              </div>
              <div className="border border-border/30 rounded px-2 py-1 text-[10px]">
                <span className="text-muted-foreground">
                  Z ({LOOKBACK_OPTIONS.find((o) => o.value === lookback)?.label}):{" "}
                </span>
                <span
                  className="font-mono font-bold"
                  style={{ color: zScoreColor(selectedPair.zScore) }}
                >
                  {selectedPair.zScore.toFixed(3)}
                </span>
              </div>
              <div className="border border-border/30 rounded px-2 py-1 text-[10px]">
                <span className="text-muted-foreground">μ: </span>
                <span className="font-mono">{selectedPair.mean.toFixed(4)}</span>
              </div>
              <div className="border border-border/30 rounded px-2 py-1 text-[10px]">
                <span className="text-muted-foreground">σ: </span>
                <span className="font-mono">{selectedPair.std.toFixed(4)}</span>
              </div>
              {detailChartData && (
                <div className="border border-border/30 rounded px-2 py-1 text-[10px]">
                  <span className="text-muted-foreground">Pts: </span>
                  <span className="font-mono">{detailChartData.fullRatio.length}</span>
                </div>
              )}
            </div>
          </div>
          {detailChartData ? (
            <PairRatioChart
              ratioSeries={detailChartData.fullRatio}
              zScoreSeries={detailChartData.fullZ}
              ratioTitle={`Ratio: ${selectedPair.tickerA} / ${selectedPair.tickerB} — ${METRIC_OPTIONS.find((o) => o.value === metric)?.label} (${detailChartData.fullRatio.length} pts)`}
              zScoreTitle={`Z-Score (±2σ bands — mean/σ from ${LOOKBACK_OPTIONS.find((o) => o.value === lookback)?.label} window)`}
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

  // ---- List view ----
  return (
    <div className="flex h-full bg-background" data-testid="pair-ratios-page">
      {/* Sidebar */}
      <div className="w-[240px] border-r border-border bg-card flex flex-col flex-shrink-0 overflow-y-auto">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs font-bold tracking-tight">Pair Ratios</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {isFiltered ? `${filteredCount} tickers (filtered)` : `${totalCount} tickers (all)`}
          </div>
        </div>
        <div className="p-3 space-y-3 flex-1">
          {/* Metric */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Ratio Metric
            </div>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="h-7 text-[11px]" data-testid="ratio-metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRIC_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
                {Z_THRESHOLDS.map((t) => (
                  <SelectItem key={t} value={String(t)}>±{t}σ</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Sort By */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Sort By
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
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
          {/* Show: All / Extreme */}
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
                All ({allPairs.length})
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
                <SlidersHorizontal className="w-3 h-3" /> Value Filters
              </div>
              {hasActiveValueFilters && (
                <button
                  onClick={clearValueFilters}
                  className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                  title="Clear all value filters"
                >
                  <X className="w-2.5 h-2.5" /> Reset
                </button>
              )}
            </div>
            {valueFilterDefs.map(({ label, vf, set }) => (
              <div key={label} className="flex items-center gap-1">
                <span
                  className="text-[9px] text-muted-foreground w-[52px] flex-shrink-0 truncate"
                  title={label}
                >
                  {label}
                </span>
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
            {hasActiveValueFilters && (
              <div className="text-[9px] text-muted-foreground">
                {filteredPairs.length.toLocaleString()} pairs match filters
              </div>
            )}
          </div>
          {/* Summary */}
          <div className="border border-border/30 rounded p-2 bg-card/30 space-y-1">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
              Summary
            </div>
            <div className="text-[11px] font-mono space-y-0.5">
              <div>
                Total pairs: <span className="font-bold">{allPairs.length}</span>
              </div>
              <div>
                Above +{zThreshold}σ:{" "}
                <span className="font-bold text-red-400">
                  {allPairs.filter((p) => p.zScore >= zThreshold).length}
                </span>
              </div>
              <div>
                Below -{zThreshold}σ:{" "}
                <span className="font-bold text-green-400">
                  {allPairs.filter((p) => p.zScore <= -zThreshold).length}
                </span>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs gap-1.5"
            onClick={handleExportCsv}
            disabled={filteredPairs.length === 0}
          >
            <Download className="w-3 h-3" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {isLoadingWorkbook ? (
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
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
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
                  onClick={() => {
                    setSearchQuery("");
                    searchRef.current?.focus();
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {searchQuery.trim() && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {searchFilteredPairs.length.toLocaleString()} match
                  {searchFilteredPairs.length !== 1 ? "es" : ""}
                </span>
              )}
            </div>
            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full table-fixed text-[11px] font-mono">
                <thead className="sticky top-0 z-10 bg-card border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground w-[140px]">Pair (A/B)</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[90px]">Ratio</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[70px]">Z-Score</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[60px]">Mean</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[60px]">Std</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[65px]">30d Chg</th>
                    <th className="text-right px-2 py-2 font-semibold text-muted-foreground w-[65px]">90d Chg</th>
                    <th className="px-2 py-2 font-semibold text-muted-foreground w-[180px] min-w-[180px] max-w-[180px]">Ratio Z-Score Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPairs.map((pair, idx) => (
                    <tr
                      key={`${pair.tickerA}-${pair.tickerB}`}
                      className="border-b border-border/20 hover:bg-accent/30 cursor-pointer group"
                      style={{ backgroundColor: zScoreBgColor(pair.zScore) }}
                      onClick={() => setSelectedPair(pair)}
                      data-testid={`pair-row-${idx}`}
                    >
                      <td className="px-3 py-1.5 font-bold">
                        <span className="text-foreground">{pair.tickerA}</span>
                        <span className="text-muted-foreground/60">/</span>
                        <span className="text-foreground">{pair.tickerB}</span>
                      </td>
                      <td className="text-right px-2 py-1.5">{pair.currentRatio.toFixed(3)}</td>
                      <td className="text-right px-2 py-1.5">
                        <span className="font-bold" style={{ color: zScoreColor(pair.zScore) }}>
                          {pair.zScore >= 0 ? "+" : ""}{pair.zScore.toFixed(2)}
                        </span>
                      </td>
                      <td className="text-right px-2 py-1.5 text-muted-foreground">{pair.mean.toFixed(3)}</td>
                      <td className="text-right px-2 py-1.5 text-muted-foreground">{pair.std.toFixed(3)}</td>
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
                          {pair.pctChange30d >= 0 ? "+" : ""}{pair.pctChange30d.toFixed(1)}%
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
                          {pair.pctChange90d >= 0 ? "+" : ""}{pair.pctChange90d.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-2 py-0.5 w-[180px] min-w-[180px] max-w-[180px]">
                        <PairSparkline pair={pair} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Pagination */}
              {searchFilteredPairs.length > 100 && (
                <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-card/50 text-xs">
                  <span className="text-muted-foreground">
                    Showing {page * 100 + 1}–{Math.min((page + 1) * 100, searchFilteredPairs.length)} of{" "}
                    {searchFilteredPairs.length.toLocaleString()} pairs
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={page === 0} onClick={() => setPage(0)}>First</Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                    <span className="px-2 font-mono text-muted-foreground">{page + 1} / {totalPages}</span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Last</Button>
                  </div>
                </div>
              )}
              {searchFilteredPairs.length === 0 && (
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
