// Consolidated Levels & Trendlines page.
//
// One unified tab (no more Method sub-tab switcher). A single control header +
// method toggles (Horizontal / Moving averages / Fibonacci / Diagonal trendlines)
// with each method's full config, and ONE "Run" that per ticker: detects S/R
// levels + diagonal trendlines AND finds recent crossings. Results show a
// per-ticker Detector (merged chart overlaying all four method types + combined
// levels/trendlines detail tables) on top, and the Crossing Screener table below,
// both filled by the same Run.
import { useOptimizerRunAll } from "@/lib/optimizerRunSignal";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppContext } from "@/lib/appContext";
import { useBaskets } from "@/lib/baskets";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { getDateRangeFromPreset } from "@/lib/datePresets";
import { useWorkspaceState } from "@/lib/workspaceState";
import { fetchGlobalDates } from "@/lib/fetchGlobalDates";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { sliceDateRange } from "@/lib/sliceDateRange";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { navigateToPairs } from "@/lib/navigateToPairs";
import { navigateToTicker } from "@/lib/navigateToTicker";
import { DATE_PRESETS } from "@/lib/datePresets";
import { computeMa } from "@/lib/computeMa";
import { D as DEFAULT_SR_CONFIG, d as detectSRLevels } from "@/components/SupportResistance";
import { d as detectTrendlines, D as DEFAULT_TRENDLINE_CONFIG } from "@/components/Trendlines";
import { g as getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { C as ClassificationFiltersWithSource } from "@/components/ClassificationFiltersWithSource";
import { u as useGlobalUniverse } from "@/lib/globalUniverse";
import { filterTickersByClassification } from "@/lib/filterTickersByClassification";
import { useGeoFilter } from "@/lib/useGeoFilter";
import ClassificationFilters from "@/components/ClassificationFilters";
import { useTableSort, SortHeader } from "@/lib/useTableSort";
import {
  createChart,
  CandlestickSeries,
  CrosshairMode,
  ColorType,
  LineSeries,
  LineStyle,
} from "lightweight-charts";

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_BARS = 100;
const ALL_MA_TYPES = ["SMA", "EMA", "WMA", "HMA", "KAMA", "FRAMA", "T3", "ALMA", "LSMA", "SLSMA"];
const ALL_MA_PERIODS = [10, 20, 50, 100, 150, 200];

// ─── Types ───────────────────────────────────────────────────────────────────

interface TickerMeta {
  ticker: string;
  name?: string;
  pairA?: string;
  pairB?: string;
}

interface CrossResult {
  ticker: string;
  name: string;
  currentPrice: number;
  kind: "level" | "trendline" | "breakout";
  subtype: string;
  direction: "up" | "down";
  candlesAgo: number;
  crossDate: string;
  closeAtCross: number;
  levelValueAtCross: number;
  distancePct: number;
  score: number;
  /** Cross-bar volume ÷ its trailing 20-bar average (null when no volume data, e.g. pair ratios). */
  volRatio?: number | null;
  /** How the score was computed (title tooltip on the Score cell). */
  scoreNote?: string;
  level?: any;
  trendline?: any;
  pairA?: string;
  pairB?: string;
}

interface DetectorBars {
  dates: string[];
  closes: number[];
  highs: number[];
  lows: number[];
  rawCloses?: number[];
}

interface DetectorResult {
  ticker: string;
  name: string;
  currentPrice: number;
  bars: DetectorBars;
  srLevels: any[];
  topLevels: any[];
  totalLevels: number;
  trendlines: any[];
  topLines: any[];
  totalLines: number;
  pairA?: string;
  pairB?: string;
  metric: string;
}

interface SkippedEntry {
  ticker: string;
  reason: string;
}

// ─── Helpers (crossing detection — shared by the run pipeline) ────────────────

function detectCrossDirection(
  prevClose: number,
  currClose: number,
  prevLevel: number,
  currLevel: number
): "up" | "down" | null {
  if (![prevClose, currClose, prevLevel, currLevel].every(Number.isFinite)) return null;
  const deltaClose = prevClose - currClose;
  const deltaLevel = prevLevel - currLevel;
  if (deltaClose === 0 || deltaLevel === 0) return null;
  if (deltaClose < 0 && deltaLevel > 0) return "up";
  if (deltaClose > 0 && deltaLevel < 0) return "down";
  return null;
}

function getLevelSeries(
  level: any,
  data: { closes: number[]; highs: number[]; lows: number[] }
): (number | null)[] {
  const len = data.closes.length;
  if (level.type === "horizontal" || level.type === "fib") {
    return new Array(len).fill(level.price);
  }
  if (level.type === "ma" && level.maType && level.maPeriod) {
    return computeMa(data.closes, level.maPeriod, level.maType);
  }
  return new Array(len).fill(null);
}

function getTrendlineValue(trendline: any, barIdx: number): number {
  return trendline.slope * (barIdx - trendline.i1) + trendline.price1;
}

function getLevelLabel(level: any): string {
  if (level.type === "ma") return `MA: ${level.maType ?? "MA"}(${level.maPeriod ?? "?"})`;
  if (level.type === "fib") return `Fib ${((level.fibLevel ?? 0) * 100).toFixed(1)}%`;
  return "Horizontal";
}

// ─── Helpers (breakout detection — Donchian / squeeze / volume surge) ─────────

/**
 * For each index t, the max (isMax) or min of arr[t-N .. t-1] (the PRIOR N bars,
 * excluding t itself). NaN while the window isn't full (t < N). Monotonic deque,
 * O(n).
 */
function rollingExtremePrior(arr: number[], N: number, isMax: boolean): number[] {
  const n = arr.length;
  const out = new Array<number>(n).fill(NaN);
  const deque: number[] = []; // indices with monotonically decreasing (max) / increasing (min) values
  for (let i = 0; i < n; i++) {
    const j = i - 1;
    if (j >= 0 && Number.isFinite(arr[j])) {
      while (deque.length && (isMax ? arr[deque[deque.length - 1]] <= arr[j] : arr[deque[deque.length - 1]] >= arr[j])) deque.pop();
      deque.push(j);
    }
    while (deque.length && deque[0] < i - N) deque.shift();
    if (i >= N && deque.length) out[i] = arr[deque[0]];
  }
  return out;
}

/** Rolling mean + population std of the trailing `w` bars (inclusive of t). NaN while t < w-1. */
function rollingMeanStd(values: number[], w: number): { mean: number[]; sd: number[] } {
  const n = values.length;
  const mean = new Array<number>(n).fill(NaN);
  const sd = new Array<number>(n).fill(NaN);
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    sum += v; sumSq += v * v;
    if (i >= w) { const o = values[i - w]; sum -= o; sumSq -= o * o; }
    if (i >= w - 1 && Number.isFinite(sum)) {
      const m = sum / w;
      mean[i] = m;
      sd[i] = Math.sqrt(Math.max(0, sumSq / w - m * m));
    }
  }
  return { mean, sd };
}

/** Volume at idx ÷ average of the prior ≤20 bars' volumes. Null when volume data is missing/zero. */
function volumeRatioAt(volumes: number[] | undefined, idx: number): number | null {
  if (!volumes || idx < 1) return null;
  const start = Math.max(0, idx - 20);
  let sum = 0, cnt = 0;
  for (let i = start; i < idx; i++) {
    const v = volumes[i];
    if (Number.isFinite(v) && v > 0) { sum += v; cnt++; }
  }
  if (cnt < 5) return null;
  const avg = sum / cnt;
  const v = volumes[idx];
  if (!Number.isFinite(v) || v <= 0 || avg <= 0) return null;
  return v / avg;
}

// ─── Helpers (presentation — replicated from the SR / Trendlines panels) ──────

function levelLabel(level: any): string {
  if (level.type === "ma") return `${level.maType ?? "MA"} ${level.maPeriod ?? ""}`.trim();
  if (level.type === "fib") return `Fib ${((level.fibLevel ?? 0) * 100).toFixed(1)}%`;
  return "Horizontal";
}

function pctSigned(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

function scoreBg(score: number): string {
  if (score >= 0.7) return "rgba(34,197,94,0.20)";
  if (score >= 0.5) return "rgba(234,179,8,0.20)";
  if (score >= 0.3) return "rgba(249,115,22,0.20)";
  return "rgba(239,68,68,0.15)";
}

function futureWeekdays(lastDate: string, n: number): string[] {
  const out: string[] = [];
  const [y, m, d] = lastDate.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return [];
  const dt = new Date(y, m - 1, d);
  let count = 0;
  while (count < n) {
    dt.setDate(dt.getDate() + 1);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue;
    const yr = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    out.push(`${yr}-${mo}-${day}`);
    count++;
  }
  return out;
}

// ─── Combined chart — overlays candles + horizontal/fib price lines + MA line
//     series + diagonal trendline segments + future projection + touch markers ─

interface CombinedChartProps {
  bars: DetectorBars;
  levels: any[];
  lines: any[];
  ticker: string;
  height?: number;
  futureBars?: number;
}

function CombinedChart({ bars, levels, lines, ticker, height = 480, futureBars = 60 }: CombinedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const priceLineRefs = useRef<any[]>([]);
  const lineSeriesRefs = useRef<any[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9ca3af", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
      grid: { vertLines: { color: "rgba(75,85,99,0.15)" }, horzLines: { color: "rgba(75,85,99,0.15)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(75,85,99,0.3)" },
      timeScale: { borderColor: "rgba(75,85,99,0.3)", timeVisible: false, secondsVisible: false },
    });
    chartRef.current = chart;
    const cs = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444", priceFormat: { type: "price", precision: 2, minMove: 0.01 } } as any);
    candleSeriesRef.current = cs;
    const ro = new ResizeObserver(() => { if (containerRef.current && chartRef.current) chartRef.current.applyOptions({ width: containerRef.current.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; candleSeriesRef.current = null; priceLineRefs.current = []; lineSeriesRefs.current = []; };
  }, [height]);

  // Candlesticks
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;
    const n = bars.dates.length;
    const data: any[] = [];
    let prev = bars.closes[0] ?? 0;
    for (let i = 0; i < n; i++) {
      const c = bars.closes[i], h = bars.highs[i], lo = bars.lows[i];
      if (!Number.isFinite(c) || !Number.isFinite(h) || !Number.isFinite(lo)) continue;
      data.push({ time: bars.dates[i], open: i === 0 ? c : prev, high: h, low: lo, close: c });
      prev = c;
    }
    cs.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [bars]);

  // Overlays: SR levels + trendlines
  useEffect(() => {
    const cs = candleSeriesRef.current;
    const chart = chartRef.current;
    if (!cs || !chart) return;
    for (const pl of priceLineRefs.current) { try { cs.removePriceLine(pl); } catch {} }
    priceLineRefs.current = [];
    for (const s of lineSeriesRefs.current) { try { chart.removeSeries(s); } catch {} }
    lineSeriesRefs.current = [];

    const n = bars.dates.length;
    if (n === 0) return;
    const lastClose = bars.closes[bars.closes.length - 1];
    const lastDate = bars.dates[n - 1];

    // ── Horizontal / MA / Fib levels ──
    const safeLevels = (levels || []).filter(Boolean);
    const hasHorizOrFib = safeLevels.some((l) => l.type === "horizontal" || l.type === "fib");
    const levelFutureDates = futureBars > 0 && hasHorizOrFib ? futureWeekdays(lastDate, futureBars) : [];
    safeLevels.forEach((level, idx) => {
      const isAbove = level.price > lastClose;
      const color = isAbove ? "#ef4444" : "#22c55e";
      const futureColor = isAbove ? "#fca5a5" : "#86efac";
      const label = `${levelLabel(level)} @ $${level.price.toFixed(2)} · ${(level.compositeScore * 100).toFixed(1)}`;
      if (level.type === "horizontal" || level.type === "fib") {
        const pl = cs.createPriceLine({ price: level.price, color, lineWidth: 2, lineStyle: level.type === "fib" ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: idx === 0, title: label });
        priceLineRefs.current.push(pl);
        if (levelFutureDates.length > 0) {
          const futData = [{ time: lastDate, value: level.price }, ...levelFutureDates.map((d: string) => ({ time: d, value: level.price }))];
          try {
            const fs = chart.addSeries(LineSeries, { color: futureColor, lineWidth: 2, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null });
            fs.setData(futData);
            lineSeriesRefs.current.push(fs);
          } catch {}
        }
      } else if (level.type === "ma" && level.maType && level.maPeriod) {
        try {
          const maVals = computeMa(bars.closes, level.maPeriod, level.maType);
          const maData: any[] = [];
          for (let i = 0; i < maVals.length; i++) {
            const v = maVals[i];
            if (v !== null && Number.isFinite(v)) maData.push({ time: bars.dates[i], value: v });
          }
          const ms = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: idx === 0, title: idx === 0 ? label : "" });
          ms.setData(maData);
          lineSeriesRefs.current.push(ms);
        } catch {
          try {
            const pl = cs.createPriceLine({ price: level.price, color, lineWidth: 2, lineStyle: LineStyle.Dotted, axisLabelVisible: idx === 0, title: label });
            priceLineRefs.current.push(pl);
          } catch {}
        }
      }
    });
    // First horizontal/fib level's touch markers
    const firstHorizOrFib = safeLevels.find((l) => l && l.touches && l.touches.length > 0 && (l.type === "horizontal" || l.type === "fib"));
    if (firstHorizOrFib) {
      try {
        const touchData = firstHorizOrFib.touches.filter((t: any) => t.date).map((t: any) => ({ time: t.date, value: firstHorizOrFib.price }))
          .sort((a: any, b: any) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
          .filter((t: any, i: number, arr: any[]) => i === 0 || arr[i - 1].time !== t.time);
        if (touchData.length > 0) {
          const ts = chart.addSeries(LineSeries, { color: "rgba(250,204,21,0.9)", lineWidth: 1, lineStyle: LineStyle.Dotted, pointMarkersVisible: true, pointMarkersRadius: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          ts.setData(touchData);
          lineSeriesRefs.current.push(ts);
        }
      } catch {}
    }

    // ── Diagonal trendlines ──
    const safeLines = (lines || []).filter(Boolean);
    const lineFutureDates = futureBars > 0 ? futureWeekdays(lastDate, futureBars) : [];
    safeLines.forEach((line, idx) => {
      const color = line.kind === "resistance" ? "#ef4444" : "#22c55e";
      const style = line.broken ? LineStyle.Dashed : LineStyle.Solid;
      const histPoints: any[] = [];
      for (let i = line.i1; i < n; i++) {
        const val = line.price1 + line.slope * (i - line.i1);
        if (Number.isFinite(val) && val > 0) histPoints.push({ time: bars.dates[i], value: val });
      }
      const futurePoints: any[] = [];
      for (let fi = 0; fi < lineFutureDates.length; fi++) {
        const barOffset = n - 1 + fi + 1 - line.i1;
        const val = line.price1 + line.slope * barOffset;
        if (Number.isFinite(val) && val > 0) futurePoints.push({ time: lineFutureDates[fi], value: val });
      }
      const label = `${line.kind === "resistance" ? "R" : "S"} ${(line.slopePctPerYear * 100).toFixed(1)}%/yr · ${(line.compositeScore * 100).toFixed(0)}${line.broken ? " · BROKEN" : ""}`;
      if (histPoints.length > 0) {
        const s = chart.addSeries(LineSeries, { color, lineWidth: 2, lineStyle: style, priceLineVisible: false, lastValueVisible: idx === 0, title: idx === 0 && safeLevels.length === 0 ? label : "" });
        s.setData(histPoints);
        lineSeriesRefs.current.push(s);
      }
      if (futurePoints.length > 0) {
        const combined = histPoints.length > 0 ? [histPoints[histPoints.length - 1], ...futurePoints] : futurePoints;
        const futureColor = line.kind === "resistance" ? "#fca5a5" : "#86efac";
        const fs = chart.addSeries(LineSeries, { color: futureColor, lineWidth: 2, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, title: "" });
        fs.setData(combined);
        lineSeriesRefs.current.push(fs);
      }
      if (idx === 0 && line.touches && line.touches.length > 0) {
        try {
          const touchData = line.touches
            .filter((t: any) => t.date && Number.isFinite(t.projectedValue))
            .map((t: any) => ({ time: t.date, value: t.projectedValue }))
            .sort((a: any, b: any) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
            .filter((t: any, i: number, arr: any[]) => i === 0 || arr[i - 1].time !== t.time);
          if (touchData.length > 0) {
            const ts = chart.addSeries(LineSeries, { color: "rgba(250,204,21,0.95)", lineWidth: 1, lineStyle: LineStyle.Dotted, pointMarkersVisible: true, pointMarkersRadius: 4, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
            ts.setData(touchData);
            lineSeriesRefs.current.push(ts);
          }
        } catch {}
      }
    });
  }, [levels, lines, bars, futureBars]);

  const nSel = (levels?.length || 0) + (lines?.length || 0);
  const futureLabel = futureBars > 0 ? ` · projected ${futureBars}b forward` : "";
  return (
    <div className="border border-border rounded bg-card p-2">
      <div className="text-[10px] font-mono text-muted-foreground mb-1">
        {ticker} · {nSel > 0 ? `${levels?.length || 0} level${(levels?.length || 0) === 1 ? "" : "s"} + ${lines?.length || 0} trendline${(lines?.length || 0) === 1 ? "" : "s"} plotted${futureLabel}` : "select levels / trendlines from the tables above"}
      </div>
      <div ref={containerRef} style={{ width: "100%", height: `${height}px` }} data-testid="lt-combined-chart" />
    </div>
  );
}

// ─── Main consolidated component ──────────────────────────────────────────────

export default function LevelsAndTrendlines() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const {
    universeTickers,
    filters,
    setFilters,
    search,
    setSearch,
    manualTickers,
    setManualTickers,
    filteredCount,
    totalCount,
  } = useAppContext();
  const { baskets, getBasket } = useBaskets();

  useEffect(() => {
    fetchWorkbookTickers()
      .then((tickers: any[]) => setAllTickers(tickers as TickerMeta[]))
      .catch(() => {});
  }, []);

  // ── Source / mode ──
  const [source, setSource] = useState("universe");
  const [basketId, setBasketId] = useState("");
  const [singleTicker, setSingleTicker] = useState("");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [pcFilters, setPcFilters] = useState(() => ({
    economy: new Set<string>(),
    sector: new Set<string>(),
    subsector: new Set<string>(),
    industryGroup: new Set<string>(),
    industry: new Set<string>(),
    subindustry: new Set<string>(),
  }));
  const [pcClassSearch, setPcClassSearch] = useState("");
  const [pcManualTickers, setPcManualTickers] = useState(() => new Set<string>());
  const [pcSource, setPcSource] = useState("workbook");
  const { metas: universeMetas } = useGlobalUniverse();

  const PC_MAX_PAIRS = 500;
  const PC_WARN_PAIRS = 50;

  const [datePreset, setDatePreset] = useState("3y");
  const [dateRange, setDateRange] = useState(() => getDateRangeFromPreset("3y"));
  const [timeframe, setTimeframe] = useState("daily");

  // ── Method toggles ──
  const [scanHorizontal, setScanHorizontal] = useState(true);
  const [scanMA, setScanMA] = useState(true);
  const [scanFib, setScanFib] = useState(true);
  const [scanTrendlines, setScanTrendlines] = useState(true);
  const [scanDonchian, setScanDonchian] = useState(true);
  const [donchianNs, setDonchianNs] = useState<number[]>([20, 55, 252]);
  const [scanSqueeze, setScanSqueeze] = useState(true);
  const [squeezePctile, setSqueezePctile] = useState(20);
  const anyLevelScan = scanHorizontal || scanMA || scanFib;
  const anyBreakoutScan = (scanDonchian && donchianNs.length > 0) || scanSqueeze;
  const anyDetector = anyLevelScan || scanTrendlines || anyBreakoutScan;
  const toggleDonchianN = (n: number) => setDonchianNs((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));

  // ── Shared params ──
  const [lookback, setLookback] = useState(1);
  const [minScore, setMinScore] = useState(0);
  const [minVolX, setMinVolX] = useState(0);
  const [topN, setTopN] = useState(10);
  const [futureBars, setFutureBars] = useState(60);

  // ── S/R detection knobs ──
  const [srTolerancePct, setSrTolerancePct] = useState(0.5);
  const [srBounceThresholdPct, setSrBounceThresholdPct] = useState(1.5);
  const [srBounceLookahead, setSrBounceLookahead] = useState(5);
  const [srHoldBars, setSrHoldBars] = useState(5);
  const [srMinTouches, setSrMinTouches] = useState(3);
  const [srPivotLeft, setSrPivotLeft] = useState(5);
  const [srPivotRight, setSrPivotRight] = useState(5);
  const [maTypesList, setMaTypesList] = useState<string[]>((DEFAULT_SR_CONFIG as any).maTypes);
  const [maPeriodsList, setMaPeriodsList] = useState<number[]>((DEFAULT_SR_CONFIG as any).maPeriods);
  const toggleMaType = (t: string) => setMaTypesList((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const toggleMaPeriod = (p: number) => setMaPeriodsList((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p].sort((a, b) => a - b)));

  // ── Trendline detection knobs ──
  const [tlMethod, setTlMethod] = useState("pivot-pairs");
  const [tlTolerancePct, setTlTolerancePct] = useState(0.5);
  const [tlBreakTolerancePct, setTlBreakTolerancePct] = useState(1.5);
  const [tlMinTouchCount, setTlMinTouchCount] = useState(3);
  const [tlMinSpanBars, setTlMinSpanBars] = useState(20);
  const [tlMaxAnchorGapBars, setTlMaxAnchorGapBars] = useState(250);
  const [tlPivotLR, setTlPivotLR] = useState(5);
  const [tlUseAtr, setTlUseAtr] = useState(false);
  const [tlAtrMultiplier, setTlAtrMultiplier] = useState(0.5);
  const [tlRansacIters, setTlRansacIters] = useState(500);
  const [tlRansacMinInliers, setTlRansacMinInliers] = useState(4);
  const [tlFilterBroken, setTlFilterBroken] = useState(false);

  const srConfig = useMemo(
    () => ({
      ...(DEFAULT_SR_CONFIG as any),
      tolerancePct: srTolerancePct / 100,
      bounceThresholdPct: srBounceThresholdPct / 100,
      bounceLookahead: srBounceLookahead,
      holdBars: srHoldBars,
      minTouches: srMinTouches,
      pivotLeft: srPivotLeft,
      pivotRight: srPivotRight,
      enableHorizontal: scanHorizontal,
      enableMA: scanMA,
      enableFib: scanFib,
      maTypes: maTypesList,
      maPeriods: maPeriodsList,
    }),
    [srTolerancePct, srBounceThresholdPct, srBounceLookahead, srHoldBars, srMinTouches, srPivotLeft, srPivotRight, scanHorizontal, scanMA, scanFib, maTypesList, maPeriodsList]
  );

  const trendlineConfig = useMemo(
    () => ({
      ...(DEFAULT_TRENDLINE_CONFIG as any),
      method: tlMethod,
      tolerancePct: tlTolerancePct / 100,
      useAtrTolerance: tlUseAtr,
      atrToleranceMultiplier: tlAtrMultiplier,
      breakTolerancePct: tlBreakTolerancePct / 100,
      minTouchCount: tlMinTouchCount,
      minSpanBars: tlMinSpanBars,
      maxAnchorGapBars: tlMaxAnchorGapBars,
      pivotLeft: tlPivotLR,
      pivotRight: tlPivotLR,
      ransacIterations: tlRansacIters,
      ransacMinInliers: tlRansacMinInliers,
      topN,
      filterBrokenLines: tlFilterBroken,
    }),
    [tlMethod, tlTolerancePct, tlUseAtr, tlAtrMultiplier, tlBreakTolerancePct, tlMinTouchCount, tlMinSpanBars, tlMaxAnchorGapBars, tlPivotLR, tlRansacIters, tlRansacMinInliers, topN, tlFilterBroken]
  );

  // ── Run state ──
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<CrossResult[]>([]);
  const [detResults, setDetResults] = useState<DetectorResult[]>([]);
  const [skipped, setSkipped] = useState<SkippedEntry[]>([]);
  const cancelRef = useRef(false);

  // ── Detector view state ──
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [detectorCollapsed, setDetectorCollapsed] = useState(false);
  const [screenerCollapsed, setScreenerCollapsed] = useState(false);
  const [selectedLevelIdxs, setSelectedLevelIdxs] = useState<Record<string, Set<number>>>({});
  const [selectedLineIdxs, setSelectedLineIdxs] = useState<Record<string, Set<number>>>({});
  const [levelSort, setLevelSort] = useState({ key: "score", dir: "desc" });
  const [lineSort, setLineSort] = useState({ key: "score", dir: "desc" });
  const [outerSort, setOuterSort] = useState({ key: "bestScore", dir: "desc" });

  const toggleLevelSort = useCallback((key: string) => {
    setLevelSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "rank" || key === "type" || key === "sr" ? "asc" : "desc" }));
  }, []);
  const toggleLineSort = useCallback((key: string) => {
    setLineSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "rank" || key === "kind" || key === "broken" ? "asc" : "desc" }));
  }, []);
  const toggleOuterSort = useCallback((key: string) => {
    setOuterSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "ticker" ? "asc" : "desc" }));
  }, []);
  const levelSI = (k: string) => (levelSort.key === k ? (levelSort.dir === "asc" ? " ↑" : " ↓") : "");
  const lineSI = (k: string) => (lineSort.key === k ? (lineSort.dir === "asc" ? " ↑" : " ↓") : "");
  const outerSI = (k: string) => (outerSort.key === k ? (outerSort.dir === "asc" ? " ↑" : " ↓") : "");

  const toggleLevelSelection = useCallback((ticker: string, idx: number) => {
    setSelectedLevelIdxs((prev) => {
      const cur = prev[ticker] ? new Set(prev[ticker]) : new Set([0]);
      if (cur.has(idx)) cur.delete(idx); else cur.add(idx);
      return { ...prev, [ticker]: cur };
    });
  }, []);
  const toggleLineSelection = useCallback((ticker: string, idx: number) => {
    setSelectedLineIdxs((prev) => {
      const cur = prev[ticker] ? new Set(prev[ticker]) : new Set([0]);
      if (cur.has(idx)) cur.delete(idx); else cur.add(idx);
      return { ...prev, [ticker]: cur };
    });
  }, []);

  // Crossing-screener table sort (header-click; "" keeps candles-ago-then-score order).
  const sort = useTableSort<CrossResult>("", "desc", "desc", "levels-crossings");
  const volFilteredResults = useMemo(
    () => (minVolX > 0 ? results.filter((r) => r.volRatio != null && r.volRatio >= minVolX) : results),
    [results, minVolX]
  );
  const sortedResults = sort.apply(volFilteredResults, (row, key) => {
    switch (key) {
      case "ticker": return row.ticker;
      case "kind": return row.subtype;
      case "direction": return row.direction;
      case "candlesAgo": return row.candlesAgo;
      case "crossDate": return row.crossDate;
      case "closeAtCross": return row.closeAtCross;
      case "levelValueAtCross": return row.levelValueAtCross;
      case "currentPrice": return row.currentPrice;
      case "distancePct": return row.distancePct;
      case "score": return row.score;
      case "volRatio": return row.volRatio ?? null;
      default: return null;
    }
  });

  const pcGeo = useGeoFilter(pcSource === "global" ? universeMetas : allTickers, "cs-paircombo-filter-geo");

  const pcLegs = useMemo(() => {
    if (source !== "pairCombo") return [];
    const noFilters =
      (pcFilters.economy.size + pcFilters.sector.size + pcFilters.subsector.size + pcFilters.industryGroup.size + pcFilters.industry.size + pcFilters.subindustry.size + pcManualTickers.size + (pcClassSearch.trim().length > 0 ? 1 : 0) === 0) && !pcGeo.hasActiveGeo;
    if (noFilters) return [];
    const source_ = pcSource === "global" ? universeMetas : allTickers;
    return pcGeo.filterByGeo(filterTickersByClassification(source_, pcFilters, pcClassSearch, pcManualTickers))
      .map((t: any) => t.ticker.toUpperCase())
      .filter((t: string, idx: number, arr: string[]) => arr.indexOf(t) === idx);
  }, [source, allTickers, universeMetas, pcSource, pcFilters, pcClassSearch, pcManualTickers, pcGeo.filterByGeo, pcGeo.hasActiveGeo]);

  const pcPairCount = useMemo(() => {
    const n = pcLegs.length;
    return n >= 2 ? (n * (n - 1)) / 2 : 0;
  }, [pcLegs]);

  const tickerList = useMemo<TickerMeta[]>(() => {
    if (source === "single") {
      const t = (singleTicker || "").toUpperCase().trim();
      return t ? [allTickers.find((x) => x.ticker.toUpperCase() === t) || { ticker: t, name: t }] : [];
    }
    if (source === "pair") {
      const a = (pairTickerA || "").toUpperCase().trim();
      const b = (pairTickerB || "").toUpperCase().trim();
      if (!a || !b || a === b) return [];
      const label = `${a}/${b}`;
      return [{ ticker: label, name: label, pairA: a, pairB: b }];
    }
    if (source === "pairCombo") {
      const pairs: TickerMeta[] = [];
      const legs = pcLegs;
      for (let i = 0; i < legs.length; i++) {
        for (let j = i + 1; j < legs.length; j++) {
          const a = legs[i], b = legs[j];
          const label = `${a}/${b}`;
          pairs.push({ ticker: label, name: label, pairA: a, pairB: b });
          if (pairs.length >= PC_MAX_PAIRS) break;
        }
        if (pairs.length >= PC_MAX_PAIRS) break;
      }
      return pairs;
    }
    if (source === "basket") {
      if (!basketId) return [];
      const basket = getBasket(basketId);
      if (!basket) return [];
      const basketSet = new Set(basket.tickers.map((t: string) => t.toUpperCase()));
      const matched = allTickers.filter((t) => basketSet.has(t.ticker.toUpperCase()));
      const matchedSet = new Set(matched.map((t) => t.ticker.toUpperCase()));
      const extras: TickerMeta[] = [];
      for (const t of basket.tickers) {
        if (!matchedSet.has(t.toUpperCase())) extras.push({ ticker: t.toUpperCase(), name: t.toUpperCase() });
      }
      return [...matched, ...extras];
    }
    return universeTickers ? allTickers.filter((t) => universeTickers.has(t.ticker)) : allTickers;
  }, [source, basketId, singleTicker, pairTickerA, pairTickerB, pcLegs, getBasket, universeTickers, allTickers]);

  // ── Workspace state (one consolidated key) ──
  const serializeState = useCallback(
    () => {
      const serSel = (m: Record<string, Set<number>>) => { const o: Record<string, number[]> = {}; for (const [k, v] of Object.entries(m)) o[k] = Array.from(v); return o; };
      return {
        source, basketId, singleTicker, pairTickerA, pairTickerB,
        pcFiltersSer: {
          economy: Array.from(pcFilters.economy), sector: Array.from(pcFilters.sector), subsector: Array.from(pcFilters.subsector),
          industryGroup: Array.from(pcFilters.industryGroup), industry: Array.from(pcFilters.industry), subindustry: Array.from(pcFilters.subindustry),
        },
        pcClassSearch, pcManualTickersSer: Array.from(pcManualTickers), pcSource,
        datePreset, dateRange, timeframe,
        scanHorizontal, scanMA, scanFib, scanTrendlines,
        scanDonchian, donchianNs, scanSqueeze, squeezePctile, minVolX,
        lookback, minScore, topN, futureBars,
        srTolerancePct, srBounceThresholdPct, srBounceLookahead, srHoldBars, srMinTouches, srPivotLeft, srPivotRight, maTypesList, maPeriodsList,
        tlMethod, tlTolerancePct, tlBreakTolerancePct, tlMinTouchCount, tlMinSpanBars, tlMaxAnchorGapBars, tlPivotLR, tlUseAtr, tlAtrMultiplier, tlRansacIters, tlRansacMinInliers, tlFilterBroken,
        rows: results, detRows: detResults, skipped, expandedTicker,
        detectorCollapsed, screenerCollapsed,
        selLevels: serSel(selectedLevelIdxs), selLines: serSel(selectedLineIdxs),
        levelSort, lineSort, outerSort,
      };
    },
    [source, basketId, singleTicker, pairTickerA, pairTickerB, pcFilters, pcClassSearch, pcManualTickers, pcSource, datePreset, dateRange, timeframe, scanHorizontal, scanMA, scanFib, scanTrendlines, scanDonchian, donchianNs, scanSqueeze, squeezePctile, minVolX, lookback, minScore, topN, futureBars, srTolerancePct, srBounceThresholdPct, srBounceLookahead, srHoldBars, srMinTouches, srPivotLeft, srPivotRight, maTypesList, maPeriodsList, tlMethod, tlTolerancePct, tlBreakTolerancePct, tlMinTouchCount, tlMinSpanBars, tlMaxAnchorGapBars, tlPivotLR, tlUseAtr, tlAtrMultiplier, tlRansacIters, tlRansacMinInliers, tlFilterBroken, results, detResults, skipped, expandedTicker, detectorCollapsed, screenerCollapsed, selectedLevelIdxs, selectedLineIdxs, levelSort, lineSort, outerSort]
  );

  const hydrateState = useCallback((state: any) => {
    if (!state || typeof state !== "object") return;
    const hydrateSel = (o: any): Record<string, Set<number>> => { const out: Record<string, Set<number>> = {}; if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) out[k] = new Set(Array.isArray(v) ? (v as number[]) : []); return out; };
    if (typeof state.source === "string") setSource(state.source);
    if (typeof state.basketId === "string") setBasketId(state.basketId);
    if (typeof state.singleTicker === "string") setSingleTicker(state.singleTicker);
    if (typeof state.pairTickerA === "string") setPairTickerA(state.pairTickerA);
    if (typeof state.pairTickerB === "string") setPairTickerB(state.pairTickerB);
    if (state.pcFiltersSer && typeof state.pcFiltersSer === "object") {
      const f = state.pcFiltersSer;
      setPcFilters({
        economy: new Set(Array.isArray(f.economy) ? f.economy : []),
        sector: new Set(Array.isArray(f.sector) ? f.sector : []),
        subsector: new Set(Array.isArray(f.subsector) ? f.subsector : []),
        industryGroup: new Set(Array.isArray(f.industryGroup) ? f.industryGroup : []),
        industry: new Set(Array.isArray(f.industry) ? f.industry : []),
        subindustry: new Set(Array.isArray(f.subindustry) ? f.subindustry : []),
      });
    }
    if (typeof state.pcClassSearch === "string") setPcClassSearch(state.pcClassSearch);
    if (Array.isArray(state.pcManualTickersSer)) setPcManualTickers(new Set(state.pcManualTickersSer));
    if (typeof state.pcSource === "string") setPcSource(state.pcSource);
    if (typeof state.datePreset === "string") setDatePreset(state.datePreset);
    if (state.dateRange) setDateRange(state.dateRange);
    if (state.timeframe) setTimeframe(state.timeframe);
    if (typeof state.scanHorizontal === "boolean") setScanHorizontal(state.scanHorizontal);
    if (typeof state.scanMA === "boolean") setScanMA(state.scanMA);
    if (typeof state.scanFib === "boolean") setScanFib(state.scanFib);
    if (typeof state.scanTrendlines === "boolean") setScanTrendlines(state.scanTrendlines);
    if (typeof state.scanDonchian === "boolean") setScanDonchian(state.scanDonchian);
    if (Array.isArray(state.donchianNs)) setDonchianNs(state.donchianNs.filter((n: any) => typeof n === "number"));
    if (typeof state.scanSqueeze === "boolean") setScanSqueeze(state.scanSqueeze);
    if (typeof state.squeezePctile === "number") setSqueezePctile(state.squeezePctile);
    if (typeof state.minVolX === "number") setMinVolX(state.minVolX);
    if (typeof state.lookback === "number") setLookback(state.lookback);
    if (typeof state.minScore === "number") setMinScore(state.minScore);
    if (typeof state.topN === "number") setTopN(state.topN);
    if (typeof state.futureBars === "number") setFutureBars(state.futureBars);
    if (typeof state.srTolerancePct === "number") setSrTolerancePct(state.srTolerancePct);
    if (typeof state.srBounceThresholdPct === "number") setSrBounceThresholdPct(state.srBounceThresholdPct);
    if (typeof state.srBounceLookahead === "number") setSrBounceLookahead(state.srBounceLookahead);
    if (typeof state.srHoldBars === "number") setSrHoldBars(state.srHoldBars);
    if (typeof state.srMinTouches === "number") setSrMinTouches(state.srMinTouches);
    if (typeof state.srPivotLeft === "number") setSrPivotLeft(state.srPivotLeft);
    if (typeof state.srPivotRight === "number") setSrPivotRight(state.srPivotRight);
    if (Array.isArray(state.maTypesList)) setMaTypesList(state.maTypesList);
    if (Array.isArray(state.maPeriodsList)) setMaPeriodsList(state.maPeriodsList);
    if (typeof state.tlMethod === "string") setTlMethod(state.tlMethod);
    if (typeof state.tlTolerancePct === "number") setTlTolerancePct(state.tlTolerancePct);
    if (typeof state.tlBreakTolerancePct === "number") setTlBreakTolerancePct(state.tlBreakTolerancePct);
    if (typeof state.tlMinTouchCount === "number") setTlMinTouchCount(state.tlMinTouchCount);
    if (typeof state.tlMinSpanBars === "number") setTlMinSpanBars(state.tlMinSpanBars);
    if (typeof state.tlMaxAnchorGapBars === "number") setTlMaxAnchorGapBars(state.tlMaxAnchorGapBars);
    if (typeof state.tlPivotLR === "number") setTlPivotLR(state.tlPivotLR);
    if (typeof state.tlUseAtr === "boolean") setTlUseAtr(state.tlUseAtr);
    if (typeof state.tlAtrMultiplier === "number") setTlAtrMultiplier(state.tlAtrMultiplier);
    if (typeof state.tlRansacIters === "number") setTlRansacIters(state.tlRansacIters);
    if (typeof state.tlRansacMinInliers === "number") setTlRansacMinInliers(state.tlRansacMinInliers);
    if (typeof state.tlFilterBroken === "boolean") setTlFilterBroken(state.tlFilterBroken);
    if (Array.isArray(state.rows)) setResults(state.rows);
    if (Array.isArray(state.detRows)) setDetResults(state.detRows);
    if (Array.isArray(state.skipped)) setSkipped(state.skipped);
    if (typeof state.expandedTicker === "string" || state.expandedTicker === null) setExpandedTicker(state.expandedTicker);
    if (typeof state.detectorCollapsed === "boolean") setDetectorCollapsed(state.detectorCollapsed);
    if (typeof state.screenerCollapsed === "boolean") setScreenerCollapsed(state.screenerCollapsed);
    if (state.selLevels) setSelectedLevelIdxs(hydrateSel(state.selLevels));
    if (state.selLines) setSelectedLineIdxs(hydrateSel(state.selLines));
    if (state.levelSort) setLevelSort(state.levelSort);
    if (state.lineSort) setLineSort(state.lineSort);
    if (state.outerSort) setOuterSort(state.outerSort);
  }, []);

  useWorkspaceState("levels-trendlines", serializeState, hydrateState);

  // ── Run: detector + screener in one pass ──
  const handleRun = useCallback(async () => {
    if (!anyDetector || tickerList.length === 0 || lookback < 1 || !Number.isFinite(lookback)) return;
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setDetResults([]);
    setSkipped([]);
    setExpandedTicker(null);
    setProgress({ current: 0, total: tickerList.length });

    const crossRows: CrossResult[] = [];
    const detRows: DetectorResult[] = [];
    const resultSkipped: SkippedEntry[] = [];

    let globalDates: string[] = [];
    if (source === "pair" || source === "pairCombo") {
      try { globalDates = await fetchGlobalDates(); } catch {}
    }

    for (let i = 0; i < tickerList.length && !cancelRef.current; i++) {
      const item = tickerList[i];
      try {
        let dates: string[];
        let closes: number[];
        let highs: number[];
        let lows: number[];
        let volumes: number[] | undefined;
        let rawCloses: number[] | undefined;
        let barCount: number;
        let metric = "close";
        const isPair = source === "pair" || source === "pairCombo";

        if (isPair) {
          const pA = (item.pairA || "").toUpperCase().trim();
          const pB = (item.pairB || "").toUpperCase().trim();
          if (!pA || !pB) { resultSkipped.push({ ticker: item.ticker, reason: "missing pair legs" }); setProgress({ current: i + 1, total: tickerList.length }); continue; }
          const pairData = await getYahooPairsRatio(pA, pB, globalDates);
          if (!pairData || pairData.prices.length < MIN_BARS) {
            resultSkipped.push({ ticker: item.ticker, reason: pairData ? `only ${pairData.prices.length} bars (need ${MIN_BARS})` : "no pair data" });
            setProgress({ current: i + 1, total: tickerList.length }); continue;
          }
          const pairDates = pairData.indices.map((idx: number) => globalDates[idx] || "");
          const pairPrices = pairData.prices;
          const { start: rangeStart, end: rangeEnd } = dateRange;
          const rangeStartStr = rangeStart instanceof Date ? rangeStart.toISOString().slice(0, 10) : rangeStart;
          const rangeEndStr = rangeEnd instanceof Date ? rangeEnd.toISOString().slice(0, 10) : rangeEnd;
          const rangeIndices: number[] = [];
          for (let v = 0; v < pairDates.length; v++) {
            const d = pairDates[v];
            if (d && !(rangeStartStr && d < rangeStartStr) && !(rangeEndStr && d > rangeEndStr)) rangeIndices.push(v);
          }
          if (rangeIndices.length < MIN_BARS) { resultSkipped.push({ ticker: item.ticker, reason: `only ${rangeIndices.length} bars in range (need ${MIN_BARS})` }); setProgress({ current: i + 1, total: tickerList.length }); continue; }
          dates = rangeIndices.map((v) => pairDates[v]);
          closes = rangeIndices.map((v) => pairPrices[v]);
          highs = closes.slice();
          lows = closes.slice();
          volumes = undefined; // ratio series has no volume
          rawCloses = closes.slice();
          barCount = closes.length;
          metric = "ratio";
        } else {
          const ohlcv = await fetchTickerOHLCV(item.ticker);
          if (!ohlcv) { resultSkipped.push({ ticker: item.ticker, reason: "no data" }); setProgress({ current: i + 1, total: tickerList.length }); continue; }
          const sliced = sliceDateRange(ohlcv, dateRange);
          barCount = sliced.adjCloses.length;
          if (barCount < MIN_BARS) { resultSkipped.push({ ticker: item.ticker, reason: `only ${barCount} bars (need ${MIN_BARS})` }); setProgress({ current: i + 1, total: tickerList.length }); continue; }
          closes = sliced.adjCloses;
          highs = sliced.highs.map((h: number, idx: number) => { const c = sliced.closes[idx]; const ac = sliced.adjCloses[idx]; return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? h * (ac / c) : h; });
          lows = sliced.lows.map((l: number, idx: number) => { const c = sliced.closes[idx]; const ac = sliced.adjCloses[idx]; return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? l * (ac / c) : l; });
          dates = sliced.dates.slice(0, barCount);
          rawCloses = sliced.closes.slice(0, barCount);
          volumes = Array.isArray(sliced.volumes) ? sliced.volumes.slice(0, barCount) : undefined;
        }

        if (timeframe === "weekly" || timeframe === "monthly") {
          const minBucketBars = timeframe === "weekly" ? 30 : 24;
          const ds = weeklyDownsample({ dates, closes, adjCloses: closes, highs, lows, volumes }, timeframe);
          if (ds.closes.length < minBucketBars) { resultSkipped.push({ ticker: item.ticker, reason: `only ${ds.closes.length} ${timeframe} bars (need ${minBucketBars})` }); setProgress({ current: i + 1, total: tickerList.length }); continue; }
          // Downsample raw closes on the same grid so send-to-Charts can map adj→raw.
          let dsRaw: number[] | undefined;
          if (rawCloses) { try { dsRaw = weeklyDownsample({ dates, closes: rawCloses, adjCloses: rawCloses, highs, lows }, timeframe).closes; } catch { dsRaw = undefined; } }
          dates = ds.dates;
          closes = ds.closes;
          highs = ds.highs;
          lows = ds.lows;
          volumes = volumes ? ds.volumes : undefined; // summed per bucket; keep undefined when source had none
          rawCloses = dsRaw && dsRaw.length === ds.closes.length ? dsRaw : undefined;
          barCount = closes.length;
        }

        const currentPrice = closes[barCount - 1];
        const effectiveLookback = Math.min(Math.max(1, Math.floor(lookback)), barCount - 1);
        const barsForDetector: DetectorBars = { dates, closes, highs, lows, rawCloses };

        let srLevels: any[] = [];
        let topLevels: any[] = [];
        let trendlines: any[] = [];
        let topLines: any[] = [];

        // Level detection + crosses
        if (anyLevelScan) {
          srLevels = detectSRLevels({ dates, closes, highs, lows }, srConfig);
          topLevels = srLevels.slice(0, topN);
          for (const level of topLevels) {
            if (level.compositeScore < minScore) continue;
            const series = getLevelSeries(level, { closes, highs, lows });
            const currentVal = series[barCount - 1];
            if (currentVal == null || !Number.isFinite(currentVal)) continue;
            for (let lb = 0; lb < effectiveLookback; lb++) {
              const idxCurr = barCount - 1 - lb;
              const idxPrev = idxCurr - 1;
              if (idxPrev < 0) break;
              const vc = series[idxCurr];
              const vp = series[idxPrev];
              if (vc == null || vp == null) continue;
              const dir = detectCrossDirection(closes[idxPrev], closes[idxCurr], vp, vc);
              if (dir) {
                crossRows.push({ ticker: item.ticker, name: item.name || item.ticker, currentPrice, kind: "level", subtype: getLevelLabel(level), direction: dir, candlesAgo: lb + 1, crossDate: dates[idxCurr], closeAtCross: closes[idxCurr], levelValueAtCross: vc, distancePct: (currentPrice - currentVal) / currentVal, score: level.compositeScore, volRatio: volumeRatioAt(volumes, idxCurr), level, pairA: item.pairA, pairB: item.pairB });
                break;
              }
            }
          }
        }

        // Trendline detection + crosses
        if (scanTrendlines) {
          trendlines = detectTrendlines({ dates, closes, highs, lows }, trendlineConfig);
          topLines = trendlines.slice(0, topN);
          for (const tl of topLines) {
            if (tl.compositeScore < minScore) continue;
            const currentTlVal = getTrendlineValue(tl, barCount - 1);
            if (!Number.isFinite(currentTlVal)) continue;
            for (let lb = 0; lb < effectiveLookback; lb++) {
              const idxCurr = barCount - 1 - lb;
              const idxPrev = idxCurr - 1;
              if (idxPrev < 0) break;
              const vc = getTrendlineValue(tl, idxCurr);
              const vp = getTrendlineValue(tl, idxPrev);
              const dir = detectCrossDirection(closes[idxPrev], closes[idxCurr], vp, vc);
              if (dir) {
                crossRows.push({ ticker: item.ticker, name: item.name || item.ticker, currentPrice, kind: "trendline", subtype: `Trendline (${tl.kind})`, direction: dir, candlesAgo: lb + 1, crossDate: dates[idxCurr], closeAtCross: closes[idxCurr], levelValueAtCross: vc, distancePct: (currentPrice - currentTlVal) / currentTlVal, score: tl.compositeScore, volRatio: volumeRatioAt(volumes, idxCurr), trendline: tl, pairA: item.pairA, pairB: item.pairB });
                break;
              }
            }
          }
        }

        // Donchian N-bar high/low breakouts (fresh crosses only)
        if (scanDonchian && donchianNs.length > 0) {
          for (const N of donchianNs) {
            if (!Number.isFinite(N) || N < 2 || barCount <= N + 1) continue;
            const label = `${N}d`;
            const priorHigh = rollingExtremePrior(highs, N, true);
            const priorLow = rollingExtremePrior(lows, N, false);
            for (let lb = 0; lb < effectiveLookback; lb++) {
              const t = barCount - 1 - lb;
              if (t < N + 1) break;
              const hi = priorHigh[t], hiPrev = priorHigh[t - 1];
              const lo = priorLow[t], loPrev = priorLow[t - 1];
              let dir: "up" | "down" | null = null;
              let levelVal = NaN;
              if (Number.isFinite(hi) && Number.isFinite(hiPrev) && closes[t] > hi && closes[t - 1] <= hiPrev) { dir = "up"; levelVal = hi; }
              else if (Number.isFinite(lo) && Number.isFinite(loPrev) && closes[t] < lo && closes[t - 1] >= loPrev) { dir = "down"; levelVal = lo; }
              if (!dir) continue;
              const distPct = (closes[t] - levelVal) / levelVal;
              const vr = volumeRatioAt(volumes, t);
              const score = Math.min(1, Math.abs(distPct) * 10 + (vr != null && vr >= 2 ? 0.2 : 0));
              if (score < minScore) break;
              crossRows.push({ ticker: item.ticker, name: item.name || item.ticker, currentPrice, kind: "breakout", subtype: dir === "up" ? `New ${label} High` : `New ${label} Low`, direction: dir, candlesAgo: lb + 1, crossDate: dates[t], closeAtCross: closes[t], levelValueAtCross: levelVal, distancePct: distPct, score, volRatio: vr, scoreNote: "score = min(1, |break distance| × 10 + 0.2 volume-surge bonus when Vol× ≥ 2)", pairA: item.pairA, pairB: item.pairB });
              break; // most recent breakout per N
            }
          }
        }

        // Squeeze → expansion (Bollinger bandwidth compression then band break)
        if (scanSqueeze && barCount >= 60) {
          const { mean: sma20, sd: sd20 } = rollingMeanStd(closes, 20);
          const bw = closes.map((_, t) => (Number.isFinite(sma20[t]) && sma20[t] > 0 && Number.isFinite(sd20[t]) ? (4 * sd20[t]) / sma20[t] : NaN));
          const bwPct = new Array<number>(barCount).fill(NaN);
          for (let t = 0; t < barCount; t++) {
            if (!Number.isFinite(bw[t])) continue;
            const start = Math.max(0, t - 125);
            let below = 0, total = 0;
            for (let k = start; k <= t; k++) { const v = bw[k]; if (Number.isFinite(v)) { total++; if (v <= bw[t]) below++; } }
            if (total >= 40) bwPct[t] = (below / total) * 100;
          }
          for (let lb = 0; lb < effectiveLookback; lb++) {
            const t = barCount - 1 - lb;
            if (t < 20) break;
            const upBand = sma20[t] + 2 * sd20[t];
            const dnBand = sma20[t] - 2 * sd20[t];
            if (!Number.isFinite(upBand) || !Number.isFinite(dnBand)) continue;
            let hadSqueeze = false, minPct = 100;
            for (let s = Math.max(0, t - 10); s <= t - 1; s++) {
              if (Number.isFinite(bwPct[s]) && bwPct[s] <= squeezePctile) { hadSqueeze = true; if (bwPct[s] < minPct) minPct = bwPct[s]; }
            }
            if (!hadSqueeze) continue;
            let dir: "up" | "down" | null = null;
            let band = NaN;
            if (closes[t] > upBand) { dir = "up"; band = upBand; }
            else if (closes[t] < dnBand) { dir = "down"; band = dnBand; }
            if (!dir) continue;
            const distPct = (closes[t] - band) / band;
            const vr = volumeRatioAt(volumes, t);
            const tightBonus = Math.max(0, 1 - minPct / 100) * 0.5;
            const score = Math.min(1, tightBonus + Math.abs(distPct) * 10);
            if (score < minScore) break;
            crossRows.push({ ticker: item.ticker, name: item.name || item.ticker, currentPrice, kind: "breakout", subtype: "Squeeze Breakout", direction: dir, candlesAgo: lb + 1, crossDate: dates[t], closeAtCross: closes[t], levelValueAtCross: band, distancePct: distPct, score, volRatio: vr, scoreNote: `score = min(1, tightness × 0.5 + |band-break distance| × 10); tightest bandwidth pctile in prior 10 bars = ${minPct.toFixed(0)}`, pairA: item.pairA, pairB: item.pairB });
            break; // most recent squeeze breakout
          }
        }

        detRows.push({ ticker: item.ticker, name: item.name || item.ticker, currentPrice, bars: barsForDetector, srLevels, topLevels, totalLevels: srLevels.length, trendlines, topLines, totalLines: trendlines.length, pairA: item.pairA, pairB: item.pairB, metric });
      } catch (err: any) {
        resultSkipped.push({ ticker: item.ticker, reason: err?.message || "error" });
      }
      setProgress({ current: i + 1, total: tickerList.length });
      if (i % 5 === 4) await new Promise((res) => setTimeout(res, 0));
    }

    crossRows.sort((a, b) => (a.candlesAgo !== b.candlesAgo ? a.candlesAgo - b.candlesAgo : b.score - a.score));
    setResults(crossRows);
    setDetResults(detRows);
    setSkipped(resultSkipped);
    // Auto-expand the detector when exactly one ticker was analyzed.
    if (detRows.length === 1) setExpandedTicker(detRows[0].ticker);
    setSelectedLevelIdxs(Object.fromEntries(detRows.map((r) => [r.ticker, new Set([0])])));
    setSelectedLineIdxs(Object.fromEntries(detRows.map((r) => [r.ticker, new Set([0])])));
    setRunning(false);
  }, [anyDetector, anyLevelScan, scanTrendlines, scanDonchian, donchianNs, scanSqueeze, squeezePctile, tickerList, lookback, dateRange, timeframe, srConfig, trendlineConfig, topN, minScore, source]);
  useOptimizerRunAll(handleRun); // unified /optimizers "Run selected" fan-out

  const handleStop = useCallback(() => { cancelRef.current = true; }, []);

  // ── Send levels to Charts (price direct; SR seed keys) ──
  const sendLevelsToCharts = useCallback((ticker: string, levels: any[], pairA?: string, pairB?: string) => {
    if (!levels || levels.length === 0) return;
    try {
      const isPair = !!(pairA && pairB);
      const primary = isPair && pairA ? pairA.toUpperCase() : ticker.toUpperCase();
      const payload = levels.map((lvl) => ({ type: lvl.type, price: lvl.price, maType: lvl.maType ?? null, maPeriod: lvl.maPeriod ?? null, fibLevel: lvl.fibLevel ?? null, touchCount: lvl.touchCount, bounceReverseRate: lvl.bounceReverseRate, holdRate: lvl.holdRate, compositeScore: lvl.compositeScore, futureBars, createdAt: Date.now() }));
      for (const key of ["reit-viz-srlevel-seeds-v1", "reit-viz-srlevel-persistent-v1"]) {
        const raw = localStorage.getItem(key);
        let store: Record<string, any[]> = {};
        try { store = raw ? JSON.parse(raw) : {}; } catch { store = {}; }
        const existing = Array.isArray(store[primary]) ? store[primary] : [];
        existing.push(...payload);
        store[primary] = existing;
        localStorage.setItem(key, JSON.stringify(store));
      }
      const toast = document.createElement("div");
      toast.textContent = `Sent ${levels.length} level${levels.length === 1 ? "" : "s"} for ${primary} → Charts`;
      toast.className = "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-cyan-500/20 text-cyan-300 text-xs font-mono border border-cyan-500/40 shadow-lg";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
      if (isPair && pairA && pairB) navigateToPairs(pairA.toUpperCase(), pairB.toUpperCase()); else navigateToTicker(primary);
    } catch (err) { console.error("[LevelsAndTrendlines] send levels failed", err); }
  }, [futureBars]);

  // ── Send trendlines to Charts (adj→raw conversion; trendline seed keys) ──
  const sendLinesToCharts = useCallback((det: DetectorResult, lines: any[]) => {
    if (!lines || lines.length === 0) return;
    try {
      const isPair = !!(det.pairA && det.pairB);
      const primary = isPair && det.pairA ? det.pairA.toUpperCase() : det.ticker.toUpperCase();
      const metric = det.metric;
      const rawClosesData = det.bars.rawCloses;
      const datesData = det.bars.dates;
      const hasRaw = Array.isArray(rawClosesData) && Array.isArray(datesData) && rawClosesData.length === datesData.length && rawClosesData.length > 0;
      const dateMap = hasRaw ? (() => { const m = new Map<string, number>(); for (let i = 0; i < datesData.length; i++) m.set(datesData[i], i); return m; })() : null;
      const payload = lines.map((line) => {
        let price1 = line.price1, price2 = line.price2, slope = line.slope, converted = false;
        if (hasRaw && dateMap && rawClosesData) {
          const i1 = dateMap.get(line.date1), i2 = dateMap.get(line.date2);
          if (i1 !== undefined && i2 !== undefined && i2 > i1) {
            const rp1 = rawClosesData[i1], rp2 = rawClosesData[i2];
            if (Number.isFinite(rp1) && Number.isFinite(rp2) && rp1 > 0 && rp2 > 0) { price1 = rp1; price2 = rp2; slope = (rp2 - rp1) / (i2 - i1); converted = true; }
          }
        }
        if (!converted) console.warn(`[LevelsAndTrendlines] adj→raw conversion failed for ${primary} line (${line.date1} → ${line.date2}); sending adj-space coords.`);
        return { kind: line.kind, date1: line.date1, price1, date2: line.date2, price2, slope, slopePctPerYear: line.slopePctPerYear, broken: !!line.broken, compositeScore: line.compositeScore, futureBars, createdAt: Date.now(), metric };
      });
      for (const key of ["reit-viz-trendline-seeds-v1", "reit-viz-trendline-persistent-v1"]) {
        const raw = localStorage.getItem(key);
        let store: Record<string, any[]> = {};
        try { store = raw ? JSON.parse(raw) : {}; } catch { store = {}; }
        const existing = Array.isArray(store[primary]) ? store[primary] : [];
        existing.push(...payload);
        store[primary] = existing;
        localStorage.setItem(key, JSON.stringify(store));
      }
      const toast = document.createElement("div");
      toast.textContent = `Sent ${lines.length} trendline${lines.length === 1 ? "" : "s"} for ${primary} → Charts`;
      toast.className = "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-cyan-500/20 text-cyan-300 text-xs font-mono border border-cyan-500/40 shadow-lg";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
      if (isPair && det.pairA && det.pairB) navigateToPairs(det.pairA.toUpperCase(), det.pairB.toUpperCase()); else navigateToTicker(primary);
    } catch (err) { console.error("[LevelsAndTrendlines] send lines failed", err); }
  }, [futureBars]);

  // ── Send a crossing row to Charts ──
  const handleSendCross = useCallback((row: CrossResult) => {
    if (row.kind === "level" && row.level) sendLevelsToCharts(row.ticker, [row.level], row.pairA, row.pairB);
    else if (row.kind === "trendline" && row.trendline) {
      const det = detResults.find((d) => d.ticker === row.ticker);
      if (det) sendLinesToCharts(det, [row.trendline]);
      else sendLevelsToCharts(row.ticker, [], row.pairA, row.pairB); // fallback: nav only
    } else if (row.kind === "breakout") {
      // Send the broken level (prior N-bar extreme / Bollinger band) as a horizontal overlay.
      sendLevelsToCharts(row.ticker, [{ type: "horizontal", price: row.levelValueAtCross, touchCount: 0, bounceReverseRate: 0, holdRate: 0, compositeScore: row.score }], row.pairA, row.pairB);
    }
  }, [detResults, sendLevelsToCharts, sendLinesToCharts]);

  // ── Sorted detector rows (outer table) ──
  const sortedDetResults = useMemo(() => {
    const arr = [...detResults];
    const dirMult = outerSort.dir === "asc" ? 1 : -1;
    const levelScore = (r: DetectorResult) => r.topLevels[0]?.compositeScore ?? -1;
    const lineScore = (r: DetectorResult) => r.topLines[0]?.compositeScore ?? -1;
    const bestScore = (r: DetectorResult) => Math.max(levelScore(r), lineScore(r));
    arr.sort((a, b) => {
      switch (outerSort.key) {
        case "ticker": return a.ticker.localeCompare(b.ticker) * dirMult;
        case "currentPrice": return (a.currentPrice - b.currentPrice) * dirMult;
        case "totalLevels": return (a.totalLevels - b.totalLevels) * dirMult;
        case "totalLines": return (a.totalLines - b.totalLines) * dirMult;
        case "levelScore": return (levelScore(a) - levelScore(b)) * dirMult;
        case "lineScore": return (lineScore(a) - lineScore(b)) * dirMult;
        default: return (bestScore(a) - bestScore(b)) * dirMult;
      }
    });
    return arr;
  }, [detResults, outerSort]);

  const inputCls = "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground";

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 text-xs font-mono space-y-3">
        {/* Title */}
        <div>
          <h1 className="text-base font-bold">Levels &amp; Trendlines</h1>
          <p className="text-[10px] text-muted-foreground">
            One pass detects horizontal S/R pivots, moving-average bounces, Fibonacci retracements, and diagonal
            trendlines for the selected source — drawn together on the merged chart below — and screens the same set
            for recent crossings and breakouts (fresh N-bar high/low breaks, squeeze → expansion moves), each with
            volume-surge confirmation. Configure the source, methods, and detection knobs, then click Run.
          </p>
        </div>

        {/* Source picker */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Source</span>
          {["single", "pair", "pairCombo", "basket", "universe"].map((mode) => (
            <button
              key={mode}
              data-testid={`cs-source-${mode}`}
              onClick={() => setSource(mode)}
              className={`text-[11px] font-bold px-2 py-0.5 rounded border ${source === mode ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:text-foreground"}`}
              title={mode === "pairCombo" ? "Generate all unordered A/B pair ratios from a classification-filter selection (A/B and B/A treated as same)" : undefined}
            >
              {mode === "single" ? "Single" : mode === "pair" ? "Pair (A/B)" : mode === "pairCombo" ? "Pair combo" : mode === "basket" ? "Basket" : "Universe"}
            </button>
          ))}

          {source === "single" && (
            <input type="text" value={singleTicker} onChange={(e) => setSingleTicker(e.target.value.toUpperCase())} placeholder="Ticker (e.g. O)" className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 font-mono w-32" data-testid="cs-single-ticker" />
          )}
          {source === "pair" && (
            <>
              <input type="text" value={pairTickerA} onChange={(e) => setPairTickerA(e.target.value.toUpperCase())} placeholder="A" className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 font-mono w-24" data-testid="cs-pair-a" />
              <span className="text-[11px] text-muted-foreground">/</span>
              <input type="text" value={pairTickerB} onChange={(e) => setPairTickerB(e.target.value.toUpperCase())} placeholder="B" className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 font-mono w-24" data-testid="cs-pair-b" />
            </>
          )}
          {source === "basket" && (
            <select value={basketId} onChange={(e) => setBasketId(e.target.value)} className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5" data-testid="cs-basket-select">
              <option value="">Pick basket…</option>
              {baskets.map((basket: any) => (<option key={basket.id} value={basket.id}>{basket.name} ({basket.tickers.length})</option>))}
            </select>
          )}

          <span className="ml-2 text-[10px] text-muted-foreground">
            {source === "pairCombo" ? `${pcLegs.length} leg${pcLegs.length === 1 ? "" : "s"} → ${tickerList.length} pair${tickerList.length === 1 ? "" : "s"} queued${pcPairCount > tickerList.length ? ` (capped from ${pcPairCount})` : ""}` : `${tickerList.length} ticker${tickerList.length === 1 ? "" : "s"} queued`}
          </span>
          {source === "pairCombo" && tickerList.length >= PC_WARN_PAIRS && (
            <span className="text-[10px] font-bold text-amber-400" title="Heads up: many pairs queued. Each pair fetches two Yahoo series and runs full S/R + trendline detection. Larger scans take longer.">⚠ {tickerList.length} pairs — this may take a while</span>
          )}
        </div>

        {/* Universe filter */}
        {source === "universe" && (
          <ClassificationFilters filters={filters} onFiltersChange={setFilters} search={search} onSearchChange={setSearch} manualTickers={manualTickers} onManualTickersChange={setManualTickers} filteredCount={filteredCount} totalCount={totalCount} testIdPrefix="cs-universe-filter" />
        )}

        {/* PairCombo filter */}
        {source === "pairCombo" && (
          <div className="space-y-1">
            <ClassificationFiltersWithSource workbookTickers={allTickers} filters={pcFilters} onFiltersChange={setPcFilters} search={pcClassSearch} onSearchChange={setPcClassSearch} manualTickers={pcManualTickers} onManualTickersChange={setPcManualTickers} filteredCount={pcLegs.length} totalCount={allTickers.length} testIdPrefix="cs-paircombo-filter" source={pcSource} onSourceChange={setPcSource} extraFilters={pcGeo.geoFilterUI} />
            <div className="text-[10px] text-muted-foreground">
              {pcLegs.length < 2 ? ("Pick at least two legs to generate pairs. Each selection level intersects with the others.") : (
                <>{pcLegs.length} legs → <span className="font-bold">{pcPairCount}</span> unordered pairs (A/B == B/A) {pcPairCount > PC_MAX_PAIRS && (<span className="text-amber-400 font-bold">— capped at {PC_MAX_PAIRS}</span>)}</>
              )}
              {pcLegs.length > 0 && pcLegs.length <= 24 && (<span className="ml-2 text-muted-foreground/70">[{pcLegs.join(", ")}]</span>)}
            </div>
          </div>
        )}

        {/* Row: date / timeframe / shared params */}
        <div className="flex flex-wrap items-end gap-3 border border-border rounded p-2 bg-card/40">
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider">Date range</label>
            <select value={datePreset} onChange={(e) => { setDatePreset(e.target.value); setDateRange(getDateRangeFromPreset(e.target.value)); }} className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5" data-testid="cs-date-preset">
              {DATE_PRESETS.map((p: any) => (<option key={p.key} value={p.key}>{p.label}</option>))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider">Timeframe</label>
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5" data-testid="cs-timeframe">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider" title="How many recent candles back to look for a cross. 1 = only the most recent candle vs the one before it. Larger = wider window, more results.">Lookback (candles)</label>
            <input type="number" min={1} step={1} value={lookback} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 1) setLookback(v); }} className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20" data-testid="cs-lookback" />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider">Top-N per ticker</label>
            <input type="number" min={1} step={1} value={topN} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 1) setTopN(v); }} className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20" data-testid="cs-topn" />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider">Min score</label>
            <input type="number" min={0} max={1} step={0.05} value={minScore} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0 && v <= 1) setMinScore(v); }} className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20" data-testid="cs-minscore" />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider" title="Hide screener rows whose cross-bar volume is below this multiple of its trailing 20-bar average. 0 = off. Rows without volume data (pair ratios) are hidden when the filter is on.">Min Vol×</label>
            <input type="number" min={0} step={0.5} value={minVolX} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) setMinVolX(v); }} className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20" data-testid="cs-min-volx" />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider" title="Weekday bars to project horizontal/fib levels and trendlines into the future on the merged chart.">Project (bars)</label>
            <input type="number" min={0} max={500} value={futureBars} onChange={(e) => setFutureBars(Math.max(0, Math.min(500, parseInt(e.target.value) || 0)))} className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20" data-testid="lt-future-bars" />
          </div>

          {/* Run / Stop */}
          <div className="ml-auto flex items-center gap-2">
            {running ? (
              <button onClick={handleStop} className="text-[11px] font-bold px-3 py-1 rounded bg-destructive text-destructive-foreground" data-testid="cs-stop">Stop</button>
            ) : (
              <button onClick={handleRun} disabled={tickerList.length === 0 || !anyDetector} title={!anyDetector ? "Select at least one detector method" : undefined} className="text-[11px] font-bold px-4 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50" data-testid="cs-run">Run</button>
            )}
          </div>
        </div>

        {/* Methods + per-method config */}
        <div className="border border-border rounded p-2 bg-card/40 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] uppercase text-muted-foreground tracking-wider">Methods</span>
            <label className="flex items-center gap-1 text-[11px]" title="Horizontal support / resistance pivots"><input type="checkbox" checked={scanHorizontal} onChange={(e) => setScanHorizontal(e.target.checked)} data-testid="cs-scan-horizontal" />Horizontal</label>
            <label className="flex items-center gap-1 text-[11px]" title="Moving-average bounce levels"><input type="checkbox" checked={scanMA} onChange={(e) => setScanMA(e.target.checked)} data-testid="cs-scan-ma" />Moving averages</label>
            <label className="flex items-center gap-1 text-[11px]" title="Fibonacci retracement levels"><input type="checkbox" checked={scanFib} onChange={(e) => setScanFib(e.target.checked)} data-testid="cs-scan-fib" />Fibonacci</label>
            <label className="flex items-center gap-1 text-[11px]" title="Diagonal trendlines (pivot-pair, fractals, or RANSAC)"><input type="checkbox" checked={scanTrendlines} onChange={(e) => setScanTrendlines(e.target.checked)} data-testid="cs-scan-trendlines" />Diagonal trendlines</label>
            <label className="flex items-center gap-1 text-[11px]" title="Donchian breakout: close breaks above the prior N-bar high (or below the prior N-bar low) as a fresh cross."><input type="checkbox" checked={scanDonchian} onChange={(e) => setScanDonchian(e.target.checked)} data-testid="cs-scan-donchian" />N-bar high/low</label>
            {scanDonchian && (
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {[{ n: 20, lbl: "20 (1mo)" }, { n: 55, lbl: "55" }, { n: 252, lbl: "252 (52wk)" }].map(({ n, lbl }) => (
                  <label key={n} className="flex items-center gap-0.5" title={`Breakout of the prior ${n}-bar high/low`}><input type="checkbox" checked={donchianNs.includes(n)} onChange={() => toggleDonchianN(n)} data-testid={`cs-donchian-${n}`} />{lbl}</label>
                ))}
              </span>
            )}
            <label className="flex items-center gap-1 text-[11px]" title="Squeeze → expansion: Bollinger(20,2) bandwidth in the bottom percentile of its trailing 126 bars, followed by a close outside the band within 10 bars."><input type="checkbox" checked={scanSqueeze} onChange={(e) => setScanSqueeze(e.target.checked)} data-testid="cs-scan-squeeze" />Squeeze breakout</label>
            {scanSqueeze && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Bandwidth percentile threshold that counts as a squeeze (lower = tighter).">
                pctile ≤ <input type="number" min={1} max={50} step={1} value={squeezePctile} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 1 && v <= 50) setSqueezePctile(v); }} className="text-[10px] bg-background border border-border rounded px-1 py-0.5 w-12" data-testid="cs-squeeze-pctile" />
              </span>
            )}
            <span className="text-[10px] text-muted-foreground ml-1" data-testid="cs-detect-summary">
              {[scanHorizontal && "Horizontal", scanMA && "MA", scanFib && "Fib", scanTrendlines && "Trendlines", scanDonchian && donchianNs.length > 0 && `Donchian ${donchianNs.join("/")}`, scanSqueeze && "Squeeze"].filter(Boolean).join(" · ") || <span className="text-amber-400">none selected</span>}
            </span>
          </div>

          {/* Horizontal / MA / Fib knobs */}
          {anyLevelScan && (
            <div className="flex flex-wrap items-end gap-3 border-t border-border/50 pt-2">
              <span className="text-[9px] uppercase text-muted-foreground tracking-wider self-center">S/R</span>
              {scanMA && (
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">MA Types</label>
                    {ALL_MA_TYPES.map((t) => (<button key={t} type="button" data-testid={`sr-ma-type-${t.toLowerCase()}`} onClick={() => toggleMaType(t)} disabled={running} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${maTypesList.includes(t) ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}>{t}</button>))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">MA Periods</label>
                    {ALL_MA_PERIODS.map((p) => (<button key={p} type="button" data-testid={`sr-ma-period-${p}`} onClick={() => toggleMaPeriod(p)} disabled={running} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${maPeriodsList.includes(p) ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}>{p}</button>))}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="% band around each level. A 'touch' fires when the bar's close, high, or low is within this % of the level price.">Tolerance %</label>
                <input type="number" data-testid="sr-tolerance" value={srTolerancePct} min={0.1} max={5} step={0.1} onChange={(e) => setSrTolerancePct(parseFloat(e.target.value) || 0.5)} disabled={running} className={`${inputCls} w-[70px]`} />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Minimum % reversal away from the level to count as a clean bounce.">Bounce Threshold %</label>
                <input type="number" data-testid="sr-bounce-threshold" value={srBounceThresholdPct} min={0.5} max={10} step={0.1} onChange={(e) => setSrBounceThresholdPct(parseFloat(e.target.value) || 1.5)} disabled={running} className={`${inputCls} w-[70px]`} />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Bars after each touch to look for a bounce reversal.">Bounce Lookahead</label>
                <input type="number" data-testid="sr-bounce-lookahead" value={srBounceLookahead} min={1} max={20} step={1} onChange={(e) => setSrBounceLookahead(parseInt(e.target.value) || 5)} disabled={running} className={`${inputCls} w-[60px]`} />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Bars after each touch over which the level must NOT be violated to count as a 'hold'.">Hold Bars</label>
                <input type="number" data-testid="sr-hold-bars" value={srHoldBars} min={1} max={20} step={1} onChange={(e) => setSrHoldBars(parseInt(e.target.value) || 5)} disabled={running} className={`${inputCls} w-[60px]`} />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Discard any level with fewer than this many touches.">Min Touches</label>
                <input type="number" data-testid="sr-min-touches" value={srMinTouches} min={1} max={10} step={1} onChange={(e) => setSrMinTouches(parseInt(e.target.value) || 3)} disabled={running} className={`${inputCls} w-[60px]`} />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Pivot detection window (bars to left/right of a swing).">Pivot L / R</label>
                <div className="flex gap-1">
                  <input type="number" data-testid="sr-pivot-left" value={srPivotLeft} min={1} max={50} step={1} onChange={(e) => setSrPivotLeft(parseInt(e.target.value) || 5)} disabled={running} className={`${inputCls} w-[52px]`} />
                  <input type="number" data-testid="sr-pivot-right" value={srPivotRight} min={1} max={50} step={1} onChange={(e) => setSrPivotRight(parseInt(e.target.value) || 5)} disabled={running} className={`${inputCls} w-[52px]`} />
                </div>
              </div>
            </div>
          )}

          {/* Trendline knobs */}
          {scanTrendlines && (
            <div className="flex flex-wrap items-end gap-3 border-t border-border/50 pt-2">
              <span className="text-[9px] uppercase text-muted-foreground tracking-wider self-center">Trendlines</span>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Detection methodology.">Method</label>
                <select data-testid="tl-method" value={tlMethod} onChange={(e) => setTlMethod(e.target.value)} className="w-32 px-1 py-0.5 text-[10px] bg-background border border-border rounded">
                  <option value="pivot-pairs">Pivot Pairs</option>
                  <option value="fractals">Fractals (5-bar)</option>
                  <option value="ransac">RANSAC</option>
                </select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="If on, the touch tolerance band is k×ATR(14) instead of a fixed %.">ATR Tolerance</label>
                <label className="flex items-center gap-1 text-[10px]"><input type="checkbox" data-testid="tl-use-atr" checked={tlUseAtr} onChange={(e) => setTlUseAtr(e.target.checked)} />Use ATR</label>
              </div>
              {tlUseAtr && (
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="ATR multiplier k.">ATR Mult (k)</label>
                  <input type="number" data-testid="tl-atr-mult" value={tlAtrMultiplier} step={0.1} min={0.1} onChange={(e) => setTlAtrMultiplier(Number(e.target.value))} className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
                </div>
              )}
              {tlMethod === "ransac" && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Number of random pivot pairs RANSAC samples.">RANSAC Iters</label>
                    <input type="number" data-testid="tl-ransac-iters" value={tlRansacIters} step={50} min={50} onChange={(e) => setTlRansacIters(Number(e.target.value))} className="w-20 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Minimum pivots within tolerance for a line to be accepted.">Min Inliers</label>
                    <input type="number" data-testid="tl-ransac-min-inliers" value={tlRansacMinInliers} min={2} onChange={(e) => setTlRansacMinInliers(Number(e.target.value))} className="w-14 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
                  </div>
                </>
              )}
              <div className={`flex flex-col gap-0.5 ${tlUseAtr ? "opacity-40" : ""}`}>
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title={tlUseAtr ? "Overridden by ATR Tolerance." : "% band around the projected trendline."}>{`Tolerance %${tlUseAtr ? " (off)" : ""}`}</label>
                <input type="number" data-testid="tl-tolerance" value={tlTolerancePct} step={0.1} disabled={tlUseAtr} onChange={(e) => setTlTolerancePct(Number(e.target.value))} className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="% close-through beyond the line that counts as a break.">Break Tol %</label>
                <input type="number" data-testid="tl-break-tolerance" value={tlBreakTolerancePct} step={0.25} onChange={(e) => setTlBreakTolerancePct(Number(e.target.value))} className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Discard trendlines with fewer than this many total touches.">Min Touches</label>
                <input type="number" data-testid="tl-min-touches" value={tlMinTouchCount} onChange={(e) => setTlMinTouchCount(Number(e.target.value))} className="w-14 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Line must persist at least this many bars between first and last touch.">Min Span (bars)</label>
                <input type="number" data-testid="tl-min-span" value={tlMinSpanBars} onChange={(e) => setTlMinSpanBars(Number(e.target.value))} className="w-14 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Max bars between the two anchor pivots.">Max Anchor Gap</label>
                <input type="number" data-testid="tl-max-gap" value={tlMaxAnchorGapBars} onChange={(e) => setTlMaxAnchorGapBars(Number(e.target.value))} className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
              </div>
              <div className={`flex flex-col gap-0.5 ${tlMethod === "fractals" ? "opacity-40" : ""}`}>
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title={tlMethod === "fractals" ? "Fixed at 2/2 for Williams fractals." : "Pivot detection window."}>{`Pivot L/R${tlMethod === "fractals" ? " (=2)" : ""}`}</label>
                <input type="number" data-testid="tl-pivot-lr" value={tlMethod === "fractals" ? 2 : tlPivotLR} disabled={tlMethod === "fractals"} onChange={(e) => setTlPivotLR(Number(e.target.value))} className="w-14 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="If checked, broken trendlines are filtered out entirely.">Broken Lines</label>
                <label className="flex items-center gap-1 text-[10px]"><input type="checkbox" data-testid="tl-filter-broken" checked={tlFilterBroken} onChange={(e) => setTlFilterBroken(e.target.checked)} />Hide broken</label>
              </div>
            </div>
          )}
        </div>

        {/* Progress */}
        {running && (<div className="text-[10px] text-muted-foreground">Scanning {progress.current} / {progress.total}…</div>)}

        {/* ── Detector results ── */}
        <div className="border border-border rounded">
          <button
            type="button"
            onClick={() => setDetectorCollapsed((c) => !c)}
            className={`w-full flex items-center justify-between px-2 py-1 bg-card/50 hover:bg-card/80 transition-colors ${detectorCollapsed ? "" : "border-b border-border"}`}
            data-testid="cs-detector-collapse"
          >
            <span className="text-[11px] font-bold flex items-center gap-1.5">
              <span className="font-mono text-muted-foreground">{detectorCollapsed ? "▸" : "▾"}</span>
              Detector: {detResults.length} ticker{detResults.length === 1 ? "" : "s"}
            </span>
            <span className="text-[10px] text-muted-foreground">{detectorCollapsed ? "click to expand" : "Expand a ticker to see levels, trendlines & the merged chart"}</span>
          </button>
          {!detectorCollapsed && (detResults.length === 0 && !running ? (
            <div className="p-3 text-[11px] text-muted-foreground">No detections yet. Configure the source and methods above, then click Run.</div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-3 py-1.5 bg-muted/30 text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                <div className="cursor-pointer hover:text-foreground select-none" onClick={() => toggleOuterSort("ticker")} data-testid="lt-outer-sort-ticker">Ticker{outerSI("ticker")}</div>
                <div className="cursor-pointer hover:text-foreground select-none" onClick={() => toggleOuterSort("currentPrice")}>Current Price{outerSI("currentPrice")}</div>
                <div className="cursor-pointer hover:text-foreground select-none" onClick={() => toggleOuterSort("totalLevels")}>Levels{outerSI("totalLevels")}</div>
                <div className="cursor-pointer hover:text-foreground select-none" onClick={() => toggleOuterSort("levelScore")}>Best Level{outerSI("levelScore")}</div>
                <div className="cursor-pointer hover:text-foreground select-none" onClick={() => toggleOuterSort("totalLines")}>Trendlines{outerSI("totalLines")}</div>
                <div className="cursor-pointer hover:text-foreground select-none" onClick={() => toggleOuterSort("lineScore")}>Best Line{outerSI("lineScore")}</div>
                <div />
              </div>
              {sortedDetResults.map((item) => {
                const isExpanded = expandedTicker === item.ticker;
                const bestLevel = item.topLevels[0];
                const bestLine = item.topLines[0];
                const selLevelSet = selectedLevelIdxs[item.ticker] ?? new Set([0]);
                const selLineSet = selectedLineIdxs[item.ticker] ?? new Set([0]);
                const selectedLevels = Array.from(selLevelSet).sort((a, b) => a - b).map((i) => item.topLevels[i]).filter(Boolean);
                const selectedLines = Array.from(selLineSet).sort((a, b) => a - b).map((i) => item.topLines[i]).filter(Boolean);
                return (
                  <div key={item.ticker} className="border-t border-border">
                    <button className="w-full grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-3 py-2 hover:bg-accent/30 text-left items-center" onClick={() => setExpandedTicker(isExpanded ? null : item.ticker)} data-testid={`lt-det-row-${item.ticker}`}>
                      <span className="font-mono text-xs font-bold">{item.ticker}</span>
                      <span className="font-mono text-[11px]">${item.currentPrice.toFixed(2)}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{item.totalLevels}{bestLevel ? ` · ${levelLabel(bestLevel)}` : ""}</span>
                      <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded w-fit" style={{ backgroundColor: scoreBg(bestLevel?.compositeScore ?? 0) }}>{bestLevel ? (bestLevel.compositeScore * 100).toFixed(1) : "—"}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{item.totalLines}{bestLine ? ` · ${bestLine.kind === "resistance" ? "R" : "S"}` : ""}</span>
                      <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded w-fit" style={{ backgroundColor: scoreBg(bestLine?.compositeScore ?? 0) }}>{bestLine ? (bestLine.compositeScore * 100).toFixed(1) : "—"}</span>
                      <span className="text-[10px] font-mono text-muted-foreground w-6 text-center">{isExpanded ? "▾" : "▸"}</span>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3 bg-card/20 space-y-3">
                        {/* Levels detail */}
                        {item.topLevels.length > 0 && (
                          <div>
                            <div className="text-[9px] font-mono text-muted-foreground mb-1 pt-1">Levels — top {item.topLevels.length} of {item.totalLevels}:</div>
                            {(() => {
                              const allRows = item.topLevels.map((level: any, originalIdx: number) => ({ level, originalIdx, dist: item.currentPrice > 0 ? (level.price - item.currentPrice) / item.currentPrice : 0, isResistance: level.price > item.currentPrice }));
                              const dirMult = levelSort.dir === "asc" ? 1 : -1;
                              allRows.sort((a: any, b: any) => {
                                switch (levelSort.key) {
                                  case "rank": return (a.originalIdx - b.originalIdx) * dirMult;
                                  case "type": return levelLabel(a.level).localeCompare(levelLabel(b.level)) * dirMult;
                                  case "sr": return ((a.isResistance ? 1 : 0) - (b.isResistance ? 1 : 0)) * dirMult;
                                  case "price": return (a.level.price - b.level.price) * dirMult;
                                  case "dist": return (a.dist - b.dist) * dirMult;
                                  case "touches": return (a.level.touchCount - b.level.touchCount) * dirMult;
                                  case "bounce": return (a.level.bounceReverseRate - b.level.bounceReverseRate) * dirMult;
                                  case "avgBounce": return (a.level.avgBounceMagnitudePct - b.level.avgBounceMagnitudePct) * dirMult;
                                  case "hold": return (a.level.holdRate - b.level.holdRate) * dirMult;
                                  case "days": { const ad = a.level.daysSinceLastTouch ?? Number.POSITIVE_INFINITY, bd = b.level.daysSinceLastTouch ?? Number.POSITIVE_INFINITY; return (ad - bd) * dirMult; }
                                  case "score": return (a.level.compositeScore - b.level.compositeScore) * dirMult;
                                  default: return 0;
                                }
                              });
                              const groups = [
                                { key: "horizontal", label: "Horizontal levels", rows: allRows.filter((r: any) => r.level.type === "horizontal") },
                                { key: "ma", label: "Moving averages", rows: allRows.filter((r: any) => r.level.type === "ma") },
                                { key: "fib", label: "Fibonacci retracements", rows: allRows.filter((r: any) => r.level.type === "fib") },
                              ].filter((g) => g.rows.length > 0);
                              return groups.map((g) => (
                                <details key={g.key} open className="mb-1" data-testid={`lt-levels-group-${g.key}`}>
                                  <summary className="cursor-pointer select-none text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground py-0.5">{g.label} ({g.rows.length})</summary>
                                  <table className="w-full text-[10px] font-mono border-collapse">
                                    <thead>
                                      <tr className="border-b border-border text-muted-foreground text-[9px] uppercase tracking-wider">
                                        <th className="py-1 px-1 w-6" />
                                        <th className="text-left py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("rank")} data-testid={`sr-sort-rank-${g.key}`}>#{levelSI("rank")}</th>
                                        <th className="text-left py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("type")} data-testid={`sr-sort-type-${g.key}`}>Type{levelSI("type")}</th>
                                        <th className="text-left py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("sr")} data-testid={`sr-sort-sr-${g.key}`}>S/R{levelSI("sr")}</th>
                                        <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("price")} data-testid={`sr-sort-price-${g.key}`}>Level ${levelSI("price")}</th>
                                        <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("dist")} data-testid={`sr-sort-dist-${g.key}`}>Dist %{levelSI("dist")}</th>
                                        <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("touches")} data-testid={`sr-sort-touches-${g.key}`}>Touches{levelSI("touches")}</th>
                                        <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("bounce")} data-testid={`sr-sort-bounce-${g.key}`}>Bounce %{levelSI("bounce")}</th>
                                        <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("avgBounce")} data-testid={`sr-sort-avgBounce-${g.key}`}>Avg Bounce{levelSI("avgBounce")}</th>
                                        <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("hold")} data-testid={`sr-sort-hold-${g.key}`}>Hold %{levelSI("hold")}</th>
                                        <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("days")} data-testid={`sr-sort-days-${g.key}`}>Days Since{levelSI("days")}</th>
                                        <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLevelSort("score")} data-testid={`sr-sort-score-${g.key}`}>Score{levelSI("score")}</th>
                                        <th className="py-1 px-1 text-right">Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {g.rows.map(({ level, originalIdx, dist, isResistance }: any) => {
                                        const isSelected = selLevelSet.has(originalIdx);
                                        return (
                                          <tr key={originalIdx} className={`border-b border-border/30 cursor-pointer transition-colors ${isSelected ? "bg-cyan-500/15 ring-1 ring-cyan-400/40" : "hover:bg-accent/10"}`} onClick={() => toggleLevelSelection(item.ticker, originalIdx)} data-testid={`sr-level-row-${originalIdx}`}>
                                            <td className="py-1 px-1 text-center" onClick={(e) => { e.stopPropagation(); toggleLevelSelection(item.ticker, originalIdx); }}><input type="checkbox" checked={isSelected} readOnly className="cursor-pointer" data-testid={`sr-level-check-${originalIdx}`} /></td>
                                            <td className="py-1 px-1 text-muted-foreground">{originalIdx + 1}</td>
                                            <td className="py-1 px-1"><span className={`px-1 py-0.5 rounded text-[9px] font-bold ${level.type === "horizontal" ? "bg-blue-500/20 text-blue-400" : level.type === "ma" ? "bg-violet-500/20 text-violet-400" : "bg-amber-500/20 text-amber-400"}`}>{levelLabel(level)}</span></td>
                                            <td className="py-1 px-1"><span className={`px-1 py-0.5 rounded text-[9px] font-bold ${isResistance ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>{isResistance ? "R" : "S"}</span></td>
                                            <td className="py-1 px-1 text-right">${level.price.toFixed(2)}</td>
                                            <td className={`py-1 px-1 text-right ${dist >= 0 ? "text-green-400" : "text-red-400"}`}>{pctSigned(dist)}</td>
                                            <td className="py-1 px-1 text-right">{level.touchCount}</td>
                                            <td className="py-1 px-1 text-right">{(level.bounceReverseRate * 100).toFixed(1)}%</td>
                                            <td className="py-1 px-1 text-right">{level.avgBounceMagnitudePct.toFixed(2)}%</td>
                                            <td className="py-1 px-1 text-right">{(level.holdRate * 100).toFixed(1)}%</td>
                                            <td className="py-1 px-1 text-right text-muted-foreground">{level.daysSinceLastTouch !== null ? `${level.daysSinceLastTouch}d` : "—"}</td>
                                            <td className="py-1 px-1 text-right"><span className="px-1 py-0.5 rounded font-bold" style={{ backgroundColor: scoreBg(level.compositeScore) }}>{(level.compositeScore * 100).toFixed(1)}</span></td>
                                            <td className="py-1 px-1 text-right"><button onClick={(e) => { e.stopPropagation(); sendLevelsToCharts(item.ticker, [level], item.pairA, item.pairB); }} className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 hover:text-cyan-300" data-testid={`sr-send-charts-${originalIdx}`}>→ Charts</button></td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </details>
                              ));
                            })()}
                            <div className="flex items-center gap-2 text-[10px] mt-1 flex-wrap">
                              <span className="text-muted-foreground">Plotting {selectedLevels.length} of {item.topLevels.length} levels</span>
                              <button onClick={() => setSelectedLevelIdxs((prev) => ({ ...prev, [item.ticker]: new Set(item.topLevels.map((_: any, i: number) => i)) }))} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground" data-testid={`sr-select-all-${item.ticker}`}>Select all</button>
                              <button onClick={() => setSelectedLevelIdxs((prev) => ({ ...prev, [item.ticker]: new Set() }))} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground" data-testid={`sr-clear-${item.ticker}`}>Clear</button>
                              <button onClick={() => sendLevelsToCharts(item.ticker, selectedLevels, item.pairA, item.pairB)} disabled={selectedLevels.length === 0} className={`px-2 py-0.5 rounded ${selectedLevels.length === 0 ? "bg-muted text-muted-foreground/40 cursor-not-allowed" : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"}`} data-testid={`sr-send-all-charts-${item.ticker}`}>Send {selectedLevels.length} → Charts</button>
                            </div>
                          </div>
                        )}

                        {/* Trendlines detail */}
                        {item.topLines.length > 0 && (
                          <div>
                            <div className="text-[9px] font-mono text-muted-foreground mb-1 pt-1">Trendlines — top {item.topLines.length} of {item.totalLines}:</div>
                            <details open data-testid="lt-lines-group-diagonal">
                            <summary className="cursor-pointer select-none text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground py-0.5">Diagonal trendlines ({item.topLines.length})</summary>
                            <table className="w-full text-[10px] font-mono border-collapse">
                              <thead>
                                <tr className="border-b border-border text-muted-foreground text-[9px] uppercase tracking-wider">
                                  <th className="py-1 px-1 w-6" />
                                  <th className="text-left py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLineSort("rank")} data-testid="tl-sort-rank">#{lineSI("rank")}</th>
                                  <th className="text-left py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLineSort("kind")} data-testid="tl-sort-kind">Kind{lineSI("kind")}</th>
                                  <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLineSort("slope")} data-testid="tl-sort-slope">Slope %/yr{lineSI("slope")}</th>
                                  <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLineSort("touches")} data-testid="tl-sort-touches">Touches{lineSI("touches")}</th>
                                  <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLineSort("rSquared")} data-testid="tl-sort-r2">R²{lineSI("rSquared")}</th>
                                  <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLineSort("span")} data-testid="tl-sort-span">Span (b){lineSI("span")}</th>
                                  <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLineSort("days")} data-testid="tl-sort-days">Days{lineSI("days")}</th>
                                  <th className="text-left py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLineSort("broken")} data-testid="tl-sort-broken">B?{lineSI("broken")}</th>
                                  <th className="text-right py-1 px-1 cursor-pointer hover:text-foreground select-none" onClick={() => toggleLineSort("score")} data-testid="tl-sort-score">Score{lineSI("score")}</th>
                                  <th className="py-1 px-1 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  const dirMult = lineSort.dir === "asc" ? 1 : -1;
                                  const rows = item.topLines.map((line: any, originalIdx: number) => ({ line, originalIdx }));
                                  rows.sort((a: any, b: any) => {
                                    switch (lineSort.key) {
                                      case "rank": return (a.originalIdx - b.originalIdx) * dirMult;
                                      case "kind": return a.line.kind.localeCompare(b.line.kind) * dirMult;
                                      case "slope": return (a.line.slopePctPerYear - b.line.slopePctPerYear) * dirMult;
                                      case "touches": return (a.line.touchCount - b.line.touchCount) * dirMult;
                                      case "rSquared": return (a.line.rSquared - b.line.rSquared) * dirMult;
                                      case "span": return (a.line.spanBars - b.line.spanBars) * dirMult;
                                      case "days": { const ad = a.line.daysSinceLastTouch ?? Number.POSITIVE_INFINITY, bd = b.line.daysSinceLastTouch ?? Number.POSITIVE_INFINITY; return (ad - bd) * dirMult; }
                                      case "broken": return ((a.line.broken ? 1 : 0) - (b.line.broken ? 1 : 0)) * dirMult;
                                      case "score": return (a.line.compositeScore - b.line.compositeScore) * dirMult;
                                      default: return 0;
                                    }
                                  });
                                  return rows.map(({ line, originalIdx }: any) => {
                                    const isSelected = selLineSet.has(originalIdx);
                                    return (
                                      <tr key={originalIdx} className={`border-b border-border/30 cursor-pointer transition-colors ${isSelected ? "bg-cyan-500/15 ring-1 ring-cyan-400/40" : "hover:bg-accent/10"}`} onClick={() => toggleLineSelection(item.ticker, originalIdx)} data-testid={`tl-line-row-${originalIdx}`}>
                                        <td className="py-1 px-1 text-center" onClick={(e) => { e.stopPropagation(); toggleLineSelection(item.ticker, originalIdx); }}><input type="checkbox" checked={isSelected} readOnly className="cursor-pointer" data-testid={`tl-line-check-${originalIdx}`} /></td>
                                        <td className="py-1 px-1 text-muted-foreground">{originalIdx + 1}</td>
                                        <td className="py-1 px-1"><span className={`px-1 py-0.5 rounded text-[9px] font-bold ${line.kind === "resistance" ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>{line.kind === "resistance" ? "R" : "S"}</span></td>
                                        <td className={`py-1 px-1 text-right ${line.slopePctPerYear >= 0 ? "text-green-400" : "text-red-400"}`}>{line.slopePctPerYear >= 0 ? "+" : ""}{(line.slopePctPerYear * 100).toFixed(1)}%</td>
                                        <td className="py-1 px-1 text-right">{line.touchCount}</td>
                                        <td className="py-1 px-1 text-right">{(line.rSquared * 100).toFixed(1)}%</td>
                                        <td className="py-1 px-1 text-right">{line.spanBars}</td>
                                        <td className="py-1 px-1 text-right text-muted-foreground">{line.daysSinceLastTouch !== null ? `${line.daysSinceLastTouch}d` : "—"}</td>
                                        <td className="py-1 px-1">{line.broken ? <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400">B</span> : <span className="text-muted-foreground/40">—</span>}</td>
                                        <td className="py-1 px-1 text-right"><span className="px-1 py-0.5 rounded font-bold" style={{ backgroundColor: scoreBg(line.compositeScore) }}>{(line.compositeScore * 100).toFixed(1)}</span></td>
                                        <td className="py-1 px-1 text-right"><button onClick={(e) => { e.stopPropagation(); sendLinesToCharts(item, [line]); }} className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 hover:text-cyan-300" data-testid={`tl-send-charts-${originalIdx}`}>→ Charts</button></td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                            </details>
                            <div className="flex items-center gap-2 text-[10px] mt-1 flex-wrap">
                              <span className="text-muted-foreground">Plotting {selectedLines.length} of {item.topLines.length} trendlines</span>
                              <button onClick={() => setSelectedLineIdxs((prev) => ({ ...prev, [item.ticker]: new Set(item.topLines.map((_: any, i: number) => i)) }))} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground" data-testid={`tl-select-all-${item.ticker}`}>Select all</button>
                              <button onClick={() => setSelectedLineIdxs((prev) => ({ ...prev, [item.ticker]: new Set() }))} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground" data-testid={`tl-clear-${item.ticker}`}>Clear</button>
                              <button onClick={() => sendLinesToCharts(item, selectedLines)} disabled={selectedLines.length === 0} className={`px-2 py-0.5 rounded ${selectedLines.length === 0 ? "bg-muted text-muted-foreground/40 cursor-not-allowed" : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"}`} data-testid={`tl-send-all-charts-${item.ticker}`}>Send {selectedLines.length} → Charts</button>
                            </div>
                          </div>
                        )}

                        {item.topLevels.length === 0 && item.topLines.length === 0 && (
                          <div className="py-2 text-[10px] font-mono text-muted-foreground">No levels or trendlines detected with current settings.</div>
                        )}

                        {/* Merged chart */}
                        <CombinedChart ticker={item.ticker} bars={item.bars} levels={selectedLevels} lines={selectedLines} height={480} futureBars={futureBars} />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>

        {/* ── Crossing Screener results ── */}
        <div className="border border-border rounded">
          <button
            type="button"
            onClick={() => setScreenerCollapsed((c) => !c)}
            className={`w-full flex items-center justify-between px-2 py-1 bg-card/50 hover:bg-card/80 transition-colors ${screenerCollapsed ? "" : "border-b border-border"}`}
            data-testid="cs-screener-collapse"
          >
            <span className="text-[11px] font-bold flex items-center gap-1.5">
              <span className="font-mono text-muted-foreground">{screenerCollapsed ? "▸" : "▾"}</span>
              Crossing Screener: {volFilteredResults.length} signal{volFilteredResults.length === 1 ? "" : "s"}
              {minVolX > 0 && results.length > volFilteredResults.length && (<span className="ml-2 text-[10px] text-amber-400">({results.length - volFilteredResults.length} hidden by Vol× ≥ {minVolX})</span>)}
              {skipped.length > 0 && (<span className="ml-2 text-[10px] text-muted-foreground">({skipped.length} skipped)</span>)}
            </span>
            <span className="text-[10px] text-muted-foreground">{screenerCollapsed ? "click to expand" : "Crossings + breakouts · sorted by candles ago, then score"}</span>
          </button>
          {!screenerCollapsed && (results.length === 0 && !running ? (
            <div className="p-3 text-[11px] text-muted-foreground">No crossings or breakouts yet. Configure source, lookback, and methods, then click Run.</div>
          ) : (
            <div className="overflow-x-auto p-1 space-y-1">
              {(() => {
                const categoryOf = (row: CrossResult): string =>
                  row.kind === "trendline" ? "Diagonal trendlines"
                    : row.kind === "breakout" ? (row.subtype.startsWith("New") ? "Donchian breakouts" : "Squeeze breakouts")
                    : row.subtype.startsWith("MA") ? "Moving averages"
                    : row.subtype.startsWith("Fib") ? "Fibonacci"
                    : "Horizontal levels";
                const ORDER = ["Horizontal levels", "Moving averages", "Fibonacci", "Diagonal trendlines", "Donchian breakouts", "Squeeze breakouts"];
                const grouped = new Map<string, CrossResult[]>();
                for (const r of sortedResults) { const c = categoryOf(r); if (!grouped.has(c)) grouped.set(c, []); grouped.get(c)!.push(r); }
                return ORDER.filter((c) => grouped.has(c)).map((c) => {
                  const rows = grouped.get(c)!;
                  const slug = c.toLowerCase().replace(/[^a-z]+/g, "-");
                  return (
                    <details key={c} open data-testid={`cs-group-${slug}`}>
                      <summary className="cursor-pointer select-none text-[10px] font-mono font-bold text-muted-foreground hover:text-foreground py-0.5">{c} ({rows.length})</summary>
                      <table className="w-full text-[11px]">
                        <thead className="bg-card/40">
                          <tr>
                            <th className="text-left px-2 py-1 font-mono"><SortHeader label="Ticker" columnKey="ticker" sort={sort} /></th>
                            <th className="text-left px-2 py-1 font-mono"><SortHeader label="Kind" columnKey="kind" sort={sort} /></th>
                            <th className="text-left px-2 py-1 font-mono"><SortHeader label="Direction" columnKey="direction" sort={sort} /></th>
                            <th className="text-right px-2 py-1 font-mono"><SortHeader label="Candles ago" columnKey="candlesAgo" sort={sort} align="right" /></th>
                            <th className="text-left px-2 py-1 font-mono"><SortHeader label="Cross date" columnKey="crossDate" sort={sort} /></th>
                            <th className="text-right px-2 py-1 font-mono"><SortHeader label="Close @ cross" columnKey="closeAtCross" sort={sort} align="right" /></th>
                            <th className="text-right px-2 py-1 font-mono"><SortHeader label="Level @ cross" columnKey="levelValueAtCross" sort={sort} align="right" /></th>
                            <th className="text-right px-2 py-1 font-mono"><SortHeader label="Current" columnKey="currentPrice" sort={sort} align="right" /></th>
                            <th className="text-right px-2 py-1 font-mono"><SortHeader label="Dist from level" columnKey="distancePct" sort={sort} align="right" /></th>
                            <th className="text-right px-2 py-1 font-mono" title="Cross-bar volume ÷ trailing 20-bar average volume. — when no volume data (e.g. pair ratios)."><SortHeader label="Vol×" columnKey="volRatio" sort={sort} align="right" /></th>
                            <th className="text-right px-2 py-1 font-mono"><SortHeader label="Score" columnKey="score" sort={sort} align="right" /></th>
                            <th className="px-2 py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => (
                            <tr key={`${row.ticker}-${row.kind}-${idx}`} className="border-t border-border hover:bg-card/40" data-testid={`cs-row-${row.ticker}-${slug}-${idx}`}>
                              <td className="px-2 py-1 font-bold">{row.ticker}</td>
                              <td className="px-2 py-1">{row.subtype}</td>
                              <td className="px-2 py-1">
                                <span className={row.direction === "up" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"} title={row.direction === "up" ? "Close moved from below to above the level" : "Close moved from above to below the level"}>{row.direction === "up" ? "▲ up" : "▼ down"}</span>
                              </td>
                              <td className="px-2 py-1 text-right">{row.candlesAgo}</td>
                              <td className="px-2 py-1">{row.crossDate}</td>
                              <td className="px-2 py-1 text-right">{row.closeAtCross.toFixed(2)}</td>
                              <td className="px-2 py-1 text-right">{row.levelValueAtCross.toFixed(2)}</td>
                              <td className="px-2 py-1 text-right">{row.currentPrice.toFixed(2)}</td>
                              <td className="px-2 py-1 text-right">{(row.distancePct * 100).toFixed(2)}%</td>
                              <td className={`px-2 py-1 text-right ${row.volRatio != null && row.volRatio >= 2 ? "text-emerald-400 font-bold" : ""}`}>{row.volRatio != null ? `${row.volRatio.toFixed(1)}×` : "—"}</td>
                              <td className="px-2 py-1 text-right" title={row.scoreNote}>{row.score.toFixed(2)}</td>
                              <td className="px-2 py-1">
                                <button onClick={() => handleSendCross(row)} className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30" data-testid={`cs-send-${row.ticker}-${slug}-${idx}`} title="Send this level/line to the Charts tab as an overlay">→ Charts</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  );
                });
              })()}
            </div>
          ))}
        </div>

        {/* Skipped */}
        {skipped.length > 0 && (
          <details className="text-[10px] text-muted-foreground">
            <summary className="cursor-pointer">Skipped tickers ({skipped.length})</summary>
            <ul className="mt-1 pl-4 list-disc">
              {skipped.map((s, idx) => (<li key={idx}>{s.ticker}: {s.reason}</li>))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
