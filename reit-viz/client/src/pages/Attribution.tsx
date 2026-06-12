// Reconstructed from recovered-bundle/Attribution-DFOfL3Ra.js on 2026-06-11
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAppContext } from "@/lib/appContext";
import { fetchMetricSeries } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  HistogramSeries,
  LineStyle,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { Download, RefreshCw, Info, SortAsc, SortDesc } from "lucide-react";
import { ArrowUpDown } from "@/components/ui/icons";

// ── Types ─────────────────────────────────────────────────────────────────────

type BasisMode = "auto" | "FFO" | "EPS";

interface BasisDef {
  multiple: string;
  estimate: string;
  label: string;
}

interface AlignedData {
  dates: string[];
  close: number[];
  multiple: number[];
  estimate: number[];
}

interface CumPoint { date: string; total: number; mult: number; est: number }
interface RollingPoint { date: string; total: number; mult: number; est: number }

interface AttributionSummary {
  total: number;
  mult: number;
  est: number;
  multShare: number;
  estShare: number;
  totalSimple: number;
  startDate: string;
  endDate: string;
}

interface AttributionRow {
  ticker: string;
  basis: string;
  totalPct: number;
  multiplePct: number;
  estimatePct: number;
  multipleShare: number;
  estimateShare: number;
  sameDirection: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BASIS_DEFS: Record<"FFO" | "EPS", BasisDef> = {
  FFO: { multiple: "P/FFO FY2", estimate: "FFO FY2", label: "P/FFO × FFO FY2" },
  EPS: { multiple: "P/E FY2", estimate: "EPS FY2", label: "P/E × EPS FY2" },
};

const WINDOW_OPTIONS = [
  { label: "1M", days: 21 }, { label: "3M", days: 63 }, { label: "6M", days: 126 },
  { label: "YTD", days: 0 }, { label: "1Y", days: 252 }, { label: "2Y", days: 504 },
  { label: "3Y", days: 756 }, { label: "5Y", days: 1260 },
];
const ROLLING_OPTIONS = [
  { label: "5d", days: 5 }, { label: "21d", days: 21 }, { label: "63d", days: 63 }, { label: "126d", days: 126 },
];

// Chart options shared across both charts
const CHART_OPTIONS_BASE = {
  layout: {
    background: { type: ColorType.Solid, color: "transparent" },
    textColor: "#7a8a9e",
    fontSize: 11,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
  },
  grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: "rgba(14, 165, 233, 0.3)", width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: "#0ea5e9" },
    horzLine: { color: "rgba(14, 165, 233, 0.3)", width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: "#0ea5e9" },
  },
  rightPriceScale: { borderColor: "rgba(255,255,255,0.08)", scaleMargins: { top: 0.1, bottom: 0.1 }, minimumWidth: 70 },
  timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: false, rightOffset: 5, barSpacing: 3, minBarSpacing: 1 },
  handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  handleScale: false,
  kineticScroll: { mouse: false, touch: false },
};

const COLOR_TOTAL = "#e5e7eb";
const COLOR_MULT = "#38bdf8";
const COLOR_EST = "#fbbf24";

// ── Utility functions ─────────────────────────────────────────────────────────

function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return { year: y, month: m, day: d };
}

function alignData(
  close: Array<{ time: string; value: number }>,
  multiple: Array<{ time: string; value: number }>,
  estimate: Array<{ time: string; value: number }>
): AlignedData {
  const multMap = new Map<string, number>();
  for (const p of multiple) if (Number.isFinite(p.value) && p.value > 0) multMap.set(p.time, p.value);
  const estMap = new Map<string, number>();
  for (const p of estimate) if (Number.isFinite(p.value) && p.value > 0) estMap.set(p.time, p.value);
  const dates: string[] = [], closes: number[] = [], mults: number[] = [], ests: number[] = [];
  for (const p of close) {
    if (!Number.isFinite(p.value) || p.value <= 0) continue;
    const m = multMap.get(p.time), e = estMap.get(p.time);
    if (m === undefined || e === undefined) continue;
    dates.push(p.time); closes.push(p.value); mults.push(m); ests.push(e);
  }
  return { dates, close: closes, multiple: mults, estimate: ests };
}

function getStartIndex(dates: string[], windowDays: number): number {
  if (!dates.length) return 0;
  if (windowDays === 0) {
    const year = dates[dates.length - 1].slice(0, 4);
    for (let i = dates.length - 1; i >= 0; i--) if (dates[i].slice(0, 4) !== year) return i;
    return 0;
  }
  return Math.max(0, dates.length - 1 - windowDays);
}

function buildCumulativePath(data: AlignedData, startIdx: number): CumPoint[] {
  const result: CumPoint[] = [];
  const c0 = data.close[startIdx], m0 = data.multiple[startIdx], e0 = data.estimate[startIdx];
  if (!Number.isFinite(c0) || !Number.isFinite(m0) || !Number.isFinite(e0)) return result;
  for (let i = startIdx; i < data.dates.length; i++) {
    result.push({
      date: data.dates[i],
      total: Math.log(data.close[i] / c0) * 100,
      mult: Math.log(data.multiple[i] / m0) * 100,
      est: Math.log(data.estimate[i] / e0) * 100,
    });
  }
  return result;
}

function buildRollingPath(data: AlignedData, startIdx: number, rollingDays: number): RollingPoint[] {
  const result: RollingPoint[] = [];
  for (let i = Math.max(startIdx, rollingDays); i < data.dates.length; i++) {
    const j = i - rollingDays;
    if (j < 0 || data.close[j] <= 0 || data.multiple[j] <= 0 || data.estimate[j] <= 0) continue;
    result.push({
      date: data.dates[i],
      total: Math.log(data.close[i] / data.close[j]) * 100,
      mult: Math.log(data.multiple[i] / data.multiple[j]) * 100,
      est: Math.log(data.estimate[i] / data.estimate[j]) * 100,
    });
  }
  return result;
}

function computeAttributionRow(ticker: string, basis: string, data: AlignedData, windowDays: number): AttributionRow | null {
  if (data.dates.length < 2) return null;
  const startIdx = getStartIndex(data.dates, windowDays);
  const endIdx = data.dates.length - 1;
  if (startIdx >= endIdx) return null;
  const c0 = data.close[startIdx], c1 = data.close[endIdx];
  const m0 = data.multiple[startIdx], m1 = data.multiple[endIdx];
  const e0 = data.estimate[startIdx], e1 = data.estimate[endIdx];
  if ([c0, c1, m0, m1, e0, e1].some(v => !Number.isFinite(v))) return null;
  const multPct = Math.log(m1 / m0) * 100;
  const estPct = Math.log(e1 / e0) * 100;
  const sumAbs = Math.abs(multPct) + Math.abs(estPct);
  const multipleShare = sumAbs > 0 ? Math.abs(multPct) / sumAbs : 0;
  const estimateShare = sumAbs > 0 ? Math.abs(estPct) / sumAbs : 0;
  return {
    ticker, basis,
    totalPct: (c1 / c0 - 1) * 100,
    multiplePct: multPct,
    estimatePct: estPct,
    multipleShare,
    estimateShare,
    sameDirection: Math.sign(multPct) === Math.sign(estPct) && multPct !== 0,
  };
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Format helpers ────────────────────────────────────────────────────────────

const fmtPct = (v: number, dp = 2) => Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%` : "—";
const fmtShare = (v: number) => Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : "—";
const colorForValue = (v: number) => !Number.isFinite(v) || v === 0 ? "text-muted-foreground" : v > 0 ? "text-emerald-500" : "text-rose-500";

// ── Cumulative Chart Component ────────────────────────────────────────────────

interface CumulativeChartProps { data: CumPoint[] }

function CumulativeChart({ data }: CumulativeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const totalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const multSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const estSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; total: number; mult: number; est: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const init = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(init); return; }
      const chart = createChart(el, { ...CHART_OPTIONS_BASE, width: rect.width, height: rect.height });
      chart.applyOptions({ handleScale: { mouseWheel: true, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: false } });
      chartRef.current = chart;
      const pf = { type: "price" as const, precision: 2, minMove: 0.01 };
      estSeriesRef.current = chart.addSeries(LineSeries, { color: COLOR_EST, lineWidth: 2, title: "Estimates", priceFormat: pf, lastValueVisible: true, priceLineVisible: false });
      multSeriesRef.current = chart.addSeries(LineSeries, { color: COLOR_MULT, lineWidth: 2, title: "Multiple", priceFormat: pf, lastValueVisible: true, priceLineVisible: false });
      totalSeriesRef.current = chart.addSeries(LineSeries, { color: COLOR_TOTAL, lineWidth: 2, title: "Total", priceFormat: pf, lastValueVisible: true, priceLineVisible: false });
      chart.subscribeCrosshairMove(param => {
        if (!param.time || !param.seriesData || !param.point) { setTooltip(null); return; }
        const tv = totalSeriesRef.current ? param.seriesData.get(totalSeriesRef.current) : null;
        const mv = multSeriesRef.current ? param.seriesData.get(multSeriesRef.current) : null;
        const ev = estSeriesRef.current ? param.seriesData.get(estSeriesRef.current) : null;
        if (!tv && !mv && !ev) { setTooltip(null); return; }
        const t = param.time;
        const dateStr = typeof t === "object" && (t as any).year
          ? `${(t as any).year}-${String((t as any).month).padStart(2, "0")}-${String((t as any).day).padStart(2, "0")}` : String(t);
        setTooltip({ x: param.point.x, y: param.point.y, date: dateStr, total: (tv as any)?.value ?? 0, mult: (mv as any)?.value ?? 0, est: (ev as any)?.value ?? 0 });
      });
      const ro = new ResizeObserver(entries => {
        if (!chartRef.current) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) chartRef.current.applyOptions({ width, height });
      });
      ro.observe(el);
      (chart as any).__ro = ro;
    };
    init();
    return () => {
      const c = chartRef.current;
      if ((c as any)?.__ro) (c as any).__ro.disconnect();
      chartRef.current?.remove();
      chartRef.current = null; totalSeriesRef.current = null; multSeriesRef.current = null; estSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !totalSeriesRef.current || !multSeriesRef.current || !estSeriesRef.current) return;
    if (data.length < 2) {
      totalSeriesRef.current.setData([]); multSeriesRef.current.setData([]); estSeriesRef.current.setData([]);
      return;
    }
    const seen = new Set<string>();
    const deduped = data.filter(p => { const k = p.date.slice(0, 10); return seen.has(k) ? false : (seen.add(k), true); });
    totalSeriesRef.current.setData(deduped.map(p => ({ time: parseDate(p.date), value: p.total })));
    multSeriesRef.current.setData(deduped.map(p => ({ time: parseDate(p.date), value: p.mult })));
    estSeriesRef.current.setData(deduped.map(p => ({ time: parseDate(p.date), value: p.est })));
    chartRef.current.timeScale().fitContent();
  }, [data]);

  if (data.length < 2) return <div className="text-[10px] text-muted-foreground p-4">Insufficient data for cumulative decomposition.</div>;
  return (
    <div className="relative w-full" style={{ height: 280 }}>
      <div ref={containerRef} className="absolute inset-0" />
      {tooltip && (
        <div className="pointer-events-none absolute z-10 rounded border border-border bg-popover/95 px-2 py-1 text-[10px] shadow-md backdrop-blur"
          style={{ left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 0) - 160), top: Math.max(8, tooltip.y - 60) }}>
          <div className="text-muted-foreground mb-0.5">{tooltip.date}</div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: COLOR_TOTAL }}>Total</span><span className="font-mono">{tooltip.total.toFixed(2)}%</span></div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: COLOR_MULT }}>Multiple</span><span className="font-mono">{tooltip.mult.toFixed(2)}%</span></div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: COLOR_EST }}>Estimates</span><span className="font-mono">{tooltip.est.toFixed(2)}%</span></div>
        </div>
      )}
    </div>
  );
}

// ── Rolling Chart Component ───────────────────────────────────────────────────

interface RollingChartProps { data: RollingPoint[] }

function RollingChart({ data }: RollingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const multSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const estSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const totalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; total: number; mult: number; est: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const init = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(init); return; }
      const chart = createChart(el, { ...CHART_OPTIONS_BASE, width: rect.width, height: rect.height });
      chart.applyOptions({ handleScale: { mouseWheel: true, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: false } });
      chartRef.current = chart;
      const pf = { type: "price" as const, precision: 2, minMove: 0.01 };
      multSeriesRef.current = chart.addSeries(HistogramSeries, { color: COLOR_MULT + "b3", title: "Δln(Multiple)", priceFormat: pf, base: 0, priceLineVisible: false, lastValueVisible: false });
      estSeriesRef.current = chart.addSeries(HistogramSeries, { color: COLOR_EST + "b3", title: "Δln(Estimate)", priceFormat: pf, base: 0, priceLineVisible: false, lastValueVisible: false });
      totalSeriesRef.current = chart.addSeries(LineSeries, { color: COLOR_TOTAL, lineWidth: 2, title: "Total Δln(Price)", priceFormat: pf, lastValueVisible: true, priceLineVisible: false });
      chart.subscribeCrosshairMove(param => {
        if (!param.time || !param.seriesData || !param.point) { setTooltip(null); return; }
        const tv = totalSeriesRef.current ? param.seriesData.get(totalSeriesRef.current) : null;
        const mv = multSeriesRef.current ? param.seriesData.get(multSeriesRef.current) : null;
        const ev = estSeriesRef.current ? param.seriesData.get(estSeriesRef.current) : null;
        if (!tv && !mv && !ev) { setTooltip(null); return; }
        const t = param.time;
        const dateStr = typeof t === "object" && (t as any).year
          ? `${(t as any).year}-${String((t as any).month).padStart(2, "0")}-${String((t as any).day).padStart(2, "0")}` : String(t);
        setTooltip({ x: param.point.x, y: param.point.y, date: dateStr, total: (tv as any)?.value ?? 0, mult: (mv as any)?.value ?? 0, est: (ev as any)?.value ?? 0 });
      });
      const ro = new ResizeObserver(entries => {
        if (!chartRef.current) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) chartRef.current.applyOptions({ width, height });
      });
      ro.observe(el); (chart as any).__ro = ro;
    };
    init();
    return () => {
      const c = chartRef.current;
      if ((c as any)?.__ro) (c as any).__ro.disconnect();
      chartRef.current?.remove();
      chartRef.current = null; multSeriesRef.current = null; estSeriesRef.current = null; totalSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !multSeriesRef.current || !estSeriesRef.current || !totalSeriesRef.current) return;
    if (data.length < 2) {
      multSeriesRef.current.setData([]); estSeriesRef.current.setData([]); totalSeriesRef.current.setData([]);
      return;
    }
    const seen = new Set<string>();
    const deduped = data.filter(p => { const k = p.date.slice(0, 10); return seen.has(k) ? false : (seen.add(k), true); });
    multSeriesRef.current.setData(deduped.map(p => ({ time: parseDate(p.date), value: p.mult, color: p.mult >= 0 ? COLOR_MULT + "b3" : "#0ea5e9b3" })));
    estSeriesRef.current.setData(deduped.map(p => ({ time: parseDate(p.date), value: p.est, color: p.est >= 0 ? COLOR_EST + "b3" : "#d97706b3" })));
    totalSeriesRef.current.setData(deduped.map(p => ({ time: parseDate(p.date), value: p.total })));
    chartRef.current.timeScale().fitContent();
  }, [data]);

  if (data.length < 2) return <div className="text-[10px] text-muted-foreground p-4">Insufficient data for rolling decomposition (need at least one full rolling window after start).</div>;
  return (
    <div className="relative w-full" style={{ height: 260 }}>
      <div ref={containerRef} className="absolute inset-0" />
      {tooltip && (
        <div className="pointer-events-none absolute z-10 rounded border border-border bg-popover/95 px-2 py-1 text-[10px] shadow-md backdrop-blur"
          style={{ left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 0) - 180), top: Math.max(8, tooltip.y - 70) }}>
          <div className="text-muted-foreground mb-0.5">{tooltip.date}</div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: COLOR_TOTAL }}>Total Δln(P)</span><span className="font-mono">{tooltip.total.toFixed(2)}%</span></div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: COLOR_MULT }}>Δln(Multiple)</span><span className="font-mono">{tooltip.mult.toFixed(2)}%</span></div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: COLOR_EST }}>Δln(Estimate)</span><span className="font-mono">{tooltip.est.toFixed(2)}%</span></div>
        </div>
      )}
    </div>
  );
}

// ── Composition Bar ───────────────────────────────────────────────────────────

interface CompositionBarProps { multShare: number; estShare: number; multSign: number; estSign: number }
function CompositionBar({ multShare, estShare, multSign, estSign }: CompositionBarProps) {
  const mW = Math.round(multShare * 200);
  const eW = Math.round(estShare * 200);
  return (
    <svg width={200} height={12} className="block">
      <rect x={0} y={0} width={200} height={12} fill="hsl(var(--muted) / 0.3)" />
      <rect x={0} y={0} width={mW} height={12} fill={multSign >= 0 ? COLOR_MULT : "#0ea5e9"} opacity={multSign >= 0 ? 0.85 : 0.55} />
      <rect x={mW} y={0} width={eW} height={12} fill={estSign >= 0 ? COLOR_EST : "#d97706"} opacity={estSign >= 0 ? 0.85 : 0.55} />
    </svg>
  );
}

// ── Single Ticker Panel ───────────────────────────────────────────────────────

interface SinglePanelProps {
  visibleTickers: string[];
  activeTicker: string;
  setActiveTicker: (t: string) => void;
  tickerSearch: string;
  setTickerSearch: (s: string) => void;
  aligned: AlignedData | null;
  cumPath: CumPoint[];
  rollingPath: RollingPoint[];
  summary: AttributionSummary | null;
  resolvedBasis: "FFO" | "EPS";
  windowDays: number;
  rollingDays: number;
  loadingSingle: boolean;
}

function SinglePanel({ visibleTickers, activeTicker, setActiveTicker, tickerSearch, setTickerSearch, aligned, cumPath, rollingPath, summary, resolvedBasis, windowDays, rollingDays, loadingSingle }: SinglePanelProps) {
  return (
    <div className="flex h-full">
      {/* Ticker sidebar */}
      <div className="w-32 border-r border-border flex flex-col flex-shrink-0">
        <div className="p-1.5 border-b border-border">
          <input value={tickerSearch} onChange={e => setTickerSearch(e.target.value)} placeholder="Search…" className="w-full px-1.5 py-1 text-[10px] bg-input border border-border rounded outline-none focus:border-primary" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {visibleTickers.map(t => (
            <button key={t} onClick={() => setActiveTicker(t)} className={`w-full text-left px-2 py-1 text-[10px] border-b border-border/50 ${t === activeTicker ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{t}</button>
          ))}
        </div>
      </div>
      {/* Charts */}
      <div className="flex-1 flex flex-col overflow-auto">
        {/* Summary header */}
        <div className="px-3 py-2 border-b border-border bg-muted/20">
          {loadingSingle ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-3 h-3 animate-spin" /> Loading {activeTicker}…
            </div>
          ) : !summary || !aligned ? (
            <div className="text-muted-foreground">
              No data for {activeTicker}. {resolvedBasis === "EPS" ? "" : "(FFO not available — try forcing EPS basis)"}
            </div>
          ) : (
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Ticker / Basis</div>
                <div className="text-sm font-bold">{activeTicker} <span className="text-[10px] text-muted-foreground font-normal">({BASIS_DEFS[resolvedBasis].label})</span></div>
                <div className="text-[9px] text-muted-foreground">{summary.startDate} → {summary.endDate}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Total Return (price)</div>
                <div className={`text-sm font-bold ${colorForValue(summary.totalSimple)}`}>{fmtPct(summary.totalSimple)}</div>
                <div className="text-[9px] text-muted-foreground">ln: {fmtPct(summary.total)}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Multiple Contribution</div>
                <div className={`text-sm font-bold ${colorForValue(summary.mult)}`}>{fmtPct(summary.mult)}</div>
                <div className="text-[9px] text-muted-foreground">share of |move|: {fmtShare(summary.multShare)}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Estimate Contribution</div>
                <div className={`text-sm font-bold ${colorForValue(summary.est)}`}>{fmtPct(summary.est)}</div>
                <div className="text-[9px] text-muted-foreground">share of |move|: {fmtShare(summary.estShare)}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Identity Check</div>
                <div className="text-[10px] font-mono">
                  M + E = {fmtPct(summary.mult + summary.est)} <span className="text-muted-foreground">vs Total ln {fmtPct(summary.total)}</span>
                </div>
                <div className="text-[9px] text-muted-foreground flex items-center gap-1" title="P = M×E should hold exactly, but estimate vs price feeds can drift (estimate updates, currency, etc). Large residuals indicate data inconsistency, not a bug in the decomposition.">
                  <Info className="w-2.5 h-2.5" /> Residual {fmtPct(summary.total - summary.mult - summary.est, 2)}
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Cumulative chart */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-semibold">Cumulative Decomposition (anchored at window start)</div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-foreground" /> Total Price</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-sky-400" /> Multiple</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-amber-400" /> Estimates</span>
            </div>
          </div>
          <CumulativeChart data={cumPath} />
        </div>
        {/* Rolling chart */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-semibold">Rolling {rollingDays}-day Contribution (stacked)</div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-sky-400/70" /> Δln(Multiple)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-amber-400/70" /> Δln(Estimate)</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-foreground" /> Total Δln(Price)</span>
            </div>
          </div>
          <RollingChart data={rollingPath} />
        </div>
      </div>
    </div>
  );
}

// ── Universe Table Panel ──────────────────────────────────────────────────────

interface TablePanelProps {
  rows: AttributionRow[];
  sortKey: string;
  sortDir: "asc" | "desc";
  handleSort: (k: string) => void;
  loadingTable: boolean;
  tableProgress: { done: number; total: number } | null;
  windowDays: number;
}

function TablePanel({ rows, sortKey, sortDir, handleSort, loadingTable, tableProgress, windowDays }: TablePanelProps) {
  const windowLabel = windowDays === 0 ? "YTD" : (WINDOW_OPTIONS.find(o => o.days === windowDays)?.label ?? `${windowDays}d`);

  function SortableHeader({ k, label, align = "right" }: { k: string; label: string; align?: "left" | "right" }) {
    return (
      <th onClick={() => handleSort(k)} className={`px-2 py-1.5 cursor-pointer hover:bg-muted/40 select-none ${align === "right" ? "text-right" : "text-left"}`}>
        <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
          <span>{label}</span>
          {sortKey === k ? (sortDir === "asc" ? <SortAsc className="w-2.5 h-2.5" /> : <SortDesc className="w-2.5 h-2.5" />) : <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
        </div>
      </th>
    );
  }

  return (
    <div className="p-3">
      {loadingTable && tableProgress ? (
        <div className="flex items-center gap-2 mb-2 text-[10px] text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" />Computing {tableProgress.done} / {tableProgress.total}…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          Click "Run on N" above to compute the attribution table for the active universe over the {windowLabel} window. Each row decomposes the ticker's total log-return into multiple-expansion vs estimate-revision contributions.
        </div>
      ) : (
        <table className="w-full border-collapse text-[10px]">
          <thead className="bg-muted/30 border-b border-border sticky top-0">
            <tr>
              <SortableHeader k="ticker" label="Ticker" align="left" />
              <th className="px-2 py-1.5 text-left">Basis</th>
              <SortableHeader k="totalPct" label={`Total % (${windowLabel})`} />
              <SortableHeader k="multiplePct" label="Multiple %" />
              <SortableHeader k="estimatePct" label="Estimate %" />
              <SortableHeader k="multipleShare" label="Multiple Share" />
              <th className="px-2 py-1.5 text-center">Direction</th>
              <th className="px-2 py-1.5 text-left w-[200px]">Composition</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.ticker} className="border-b border-border/40 hover:bg-muted/20">
                <td className="px-2 py-1 font-semibold">{row.ticker}</td>
                <td className="px-2 py-1 text-muted-foreground">{row.basis}</td>
                <td className={`px-2 py-1 text-right font-mono ${colorForValue(row.totalPct)}`}>{fmtPct(row.totalPct)}</td>
                <td className={`px-2 py-1 text-right font-mono ${colorForValue(row.multiplePct)}`}>{fmtPct(row.multiplePct)}</td>
                <td className={`px-2 py-1 text-right font-mono ${colorForValue(row.estimatePct)}`}>{fmtPct(row.estimatePct)}</td>
                <td className="px-2 py-1 text-right font-mono">{fmtShare(row.multipleShare)}</td>
                <td className="px-2 py-1 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] ${row.sameDirection ? "bg-emerald-500/15 text-emerald-500" : "bg-rose-500/15 text-rose-500"}`}>
                    {row.sameDirection ? "aligned" : "offsetting"}
                  </span>
                </td>
                <td className="px-2 py-1">
                  <CompositionBar multShare={row.multipleShare} estShare={row.estimateShare} multSign={Math.sign(row.multiplePct)} estSign={Math.sign(row.estimatePct)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Attribution() {
  const { filteredTickersList } = useAppContext();
  const tickers = useMemo(() => filteredTickersList.map(t => t.ticker), [filteredTickersList]);

  const [mode, setMode] = useState<"single" | "table">("single");
  const [basisMode, setBasisMode] = useState<BasisMode>("auto");
  const [tickerSearch, setTickerSearch] = useState("");
  const [windowDays, setWindowDays] = useState(252);
  const [rollingDays, setRollingDays] = useState(21);
  const [searchInput, setSearchInput] = useState("");
  const [aligned, setAligned] = useState<AlignedData | null>(null);
  const [resolvedBasis, setResolvedBasis] = useState<"FFO" | "EPS">("FFO");
  const [loadingSingle, setLoadingSingle] = useState(false);
  const [tableRows, setTableRows] = useState<AttributionRow[]>([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [tableProgress, setTableProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeTicker, setActiveTicker] = useState("");
  const [sortKey, setSortKey] = useState("multipleShare");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Auto-select first default ticker
  useEffect(() => {
    if (!activeTicker && tickers.length > 0) {
      const preferred = ["O", "SPG", "PLD", "AMT", "EQIX", "VICI", "WELL"].find(t => tickers.includes(t)) ?? tickers[0];
      setActiveTicker(preferred);
    }
  }, [tickers, activeTicker]);

  // Load single ticker data
  const loadSingle = useCallback(async () => {
    if (!activeTicker) return;
    setLoadingSingle(true);
    try {
      const closeSeries = await fetchMetricSeries(activeTicker, "close");
      let basis: "FFO" | "EPS" = basisMode === "auto" ? "FFO" : basisMode;
      let multSeries = await fetchMetricSeries(activeTicker, BASIS_DEFS[basis].multiple);
      let estSeries = await fetchMetricSeries(activeTicker, BASIS_DEFS[basis].estimate);
      if (basisMode === "auto" && (!multSeries.length || !estSeries.length)) {
        basis = "EPS";
        multSeries = await fetchMetricSeries(activeTicker, BASIS_DEFS.EPS.multiple);
        estSeries = await fetchMetricSeries(activeTicker, BASIS_DEFS.EPS.estimate);
      }
      const data = alignData(closeSeries, multSeries, estSeries);
      setAligned(data);
      setResolvedBasis(basis);
    } catch (err) {
      console.error("Attribution single loader failed", err);
      setAligned(null);
    } finally {
      setLoadingSingle(false);
    }
  }, [activeTicker, basisMode]);

  useEffect(() => { loadSingle(); }, [loadSingle]);

  // Run universe table
  const cancelRef = useRef({ cancelled: false });
  const runUniverseTable = useCallback(async () => {
    cancelRef.current.cancelled = true;
    const token = { cancelled: false };
    cancelRef.current = token;
    setLoadingTable(true); setTableRows([]); setTableProgress({ done: 0, total: tickers.length });
    const results: AttributionRow[] = [];
    const CONCURRENCY = 8;
    let idx = 0, done = 0;
    async function worker() {
      for (;;) {
        if (token.cancelled) return;
        const i = idx++;
        if (i >= tickers.length) return;
        const ticker = tickers[i];
        try {
          const closeSeries = await fetchMetricSeries(ticker, "close");
          let basis: "FFO" | "EPS" = basisMode === "auto" ? "FFO" : basisMode;
          let multSeries = await fetchMetricSeries(ticker, BASIS_DEFS[basis].multiple);
          let estSeries = await fetchMetricSeries(ticker, BASIS_DEFS[basis].estimate);
          if (basisMode === "auto" && (!multSeries.length || !estSeries.length)) {
            basis = "EPS";
            multSeries = await fetchMetricSeries(ticker, BASIS_DEFS.EPS.multiple);
            estSeries = await fetchMetricSeries(ticker, BASIS_DEFS.EPS.estimate);
          }
          if (!closeSeries.length || !multSeries.length || !estSeries.length) { done++; setTableProgress({ done, total: tickers.length }); continue; }
          const data = alignData(closeSeries, multSeries, estSeries);
          const row = computeAttributionRow(ticker, basis, data, windowDays);
          if (row) results.push(row);
        } catch { /* skip */ }
        done++;
        if (!token.cancelled) setTableProgress({ done, total: tickers.length });
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    if (!token.cancelled) { setTableRows(results); setLoadingTable(false); setTableProgress(null); }
  }, [tickers, windowDays, basisMode]);

  // Derived paths
  const cumPath = useMemo(() => aligned ? buildCumulativePath(aligned, getStartIndex(aligned.dates, windowDays)) : [], [aligned, windowDays]);
  const rollingPath = useMemo(() => aligned ? buildRollingPath(aligned, getStartIndex(aligned.dates, windowDays), rollingDays) : [], [aligned, windowDays, rollingDays]);
  const summary: AttributionSummary | null = useMemo(() => {
    if (!cumPath.length || !aligned) return null;
    const last = cumPath[cumPath.length - 1];
    const sumAbs = Math.abs(last.mult) + Math.abs(last.est);
    return {
      total: last.total, mult: last.mult, est: last.est,
      multShare: sumAbs > 0 ? Math.abs(last.mult) / sumAbs : 0,
      estShare: sumAbs > 0 ? Math.abs(last.est) / sumAbs : 0,
      totalSimple: (aligned.close[aligned.close.length - 1] / aligned.close[getStartIndex(aligned.dates, windowDays)] - 1) * 100,
      startDate: cumPath[0].date,
      endDate: last.date,
    };
  }, [cumPath, aligned, windowDays]);

  // Sort table rows
  const sortedRows = useMemo(() => {
    const arr = [...tableRows];
    arr.sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "ticker": va = a.ticker; vb = b.ticker; break;
        case "totalPct": va = a.totalPct; vb = b.totalPct; break;
        case "multiplePct": va = a.multiplePct; vb = b.multiplePct; break;
        case "estimatePct": va = a.estimatePct; vb = b.estimatePct; break;
        default: va = a.multipleShare; vb = b.multipleShare; break;
      }
      if (typeof va === "string" && typeof vb === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return arr;
  }, [tableRows, sortKey, sortDir]);

  function handleSort(k: string) {
    if (k === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "ticker" ? "asc" : "desc"); }
  }

  // CSV export
  function handleExport() {
    if (mode === "single") {
      if (!cumPath.length) return;
      const header = "date,total_ln_pct,multiple_ln_pct,estimate_ln_pct";
      const rows = cumPath.map(p => `${p.date},${p.total.toFixed(4)},${p.mult.toFixed(4)},${p.est.toFixed(4)}`);
      const meta = `# ${activeTicker} | basis=${resolvedBasis} | window=${windowDays === 0 ? "YTD" : `${windowDays}d`} | start=${summary?.startDate ?? ""} | end=${summary?.endDate ?? ""}`;
      downloadCsv([meta, header, ...rows].join("\n"), `attribution_${activeTicker}_${windowDays === 0 ? "ytd" : `${windowDays}d`}.csv`);
    } else {
      if (!sortedRows.length) return;
      const header = "ticker,basis,total_pct,multiple_pct,estimate_pct,multiple_share,estimate_share,same_direction";
      const rows = sortedRows.map(r => [r.ticker, r.basis, r.totalPct.toFixed(4), r.multiplePct.toFixed(4), r.estimatePct.toFixed(4), r.multipleShare.toFixed(4), r.estimateShare.toFixed(4), r.sameDirection ? "1" : "0"].join(","));
      const meta = `# universe attribution | window=${windowDays === 0 ? "YTD" : `${windowDays}d`} | basis=${basisMode === "auto" ? "auto(FFO->EPS)" : basisMode}`;
      downloadCsv([meta, header, ...rows].join("\n"), `attribution_universe_${windowDays === 0 ? "ytd" : `${windowDays}d`}.csv`);
    }
  }

  const visibleTickers = useMemo(() => {
    const q = tickerSearch.trim().toUpperCase();
    return q ? tickers.filter(t => t.toUpperCase().includes(q)).slice(0, 200) : tickers.slice(0, 200);
  }, [tickers, tickerSearch]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground font-mono text-xs">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-tight">Price Attribution</h1>
          <span className="text-[10px] text-muted-foreground">Δln(P) = Δln(M) + Δln(E) — decompose returns into multiple expansion vs estimate revisions</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 border border-border rounded">
            {(["single", "table"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`px-2 py-1 text-[10px] ${mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {m === "single" ? "Single Ticker" : "Universe Table"}
              </button>
            ))}
          </div>
          {/* Basis */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Basis:</span>
            <div className="flex items-center gap-0.5 border border-border rounded">
              {(["auto", "FFO", "EPS"] as const).map(b => (
                <button key={b} onClick={() => setBasisMode(b)} className={`px-1.5 py-0.5 text-[10px] ${basisMode === b ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {b === "auto" ? "Auto" : b}
                </button>
              ))}
            </div>
          </div>
          {/* Window */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Window:</span>
            <div className="flex items-center gap-0.5 border border-border rounded">
              {WINDOW_OPTIONS.map(o => (
                <button key={o.label} onClick={() => setWindowDays(o.days)} className={`px-1.5 py-0.5 text-[10px] ${windowDays === o.days ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{o.label}</button>
              ))}
            </div>
          </div>
          {/* Rolling (single mode only) */}
          {mode === "single" && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Rolling:</span>
              <div className="flex items-center gap-0.5 border border-border rounded">
                {ROLLING_OPTIONS.map(o => (
                  <button key={o.label} onClick={() => setRollingDays(o.days)} className={`px-1.5 py-0.5 text-[10px] ${rollingDays === o.days ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{o.label}</button>
                ))}
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} className="h-7 px-2 text-[10px]">
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
          {mode === "table" && (
            <Button variant="default" size="sm" onClick={runUniverseTable} disabled={loadingTable || tickers.length === 0} className="h-7 px-2 text-[10px]">
              {loadingTable ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Run on {tickers.length}
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {mode === "single" ? (
          <SinglePanel
            visibleTickers={visibleTickers}
            activeTicker={activeTicker}
            setActiveTicker={setActiveTicker}
            tickerSearch={tickerSearch}
            setTickerSearch={setTickerSearch}
            aligned={aligned}
            cumPath={cumPath}
            rollingPath={rollingPath}
            summary={summary}
            resolvedBasis={resolvedBasis}
            windowDays={windowDays}
            rollingDays={rollingDays}
            loadingSingle={loadingSingle}
          />
        ) : (
          <TablePanel
            rows={sortedRows}
            sortKey={sortKey}
            sortDir={sortDir}
            handleSort={handleSort}
            loadingTable={loadingTable}
            tableProgress={tableProgress}
            windowDays={windowDays}
          />
        )}
      </div>
    </div>
  );
}
