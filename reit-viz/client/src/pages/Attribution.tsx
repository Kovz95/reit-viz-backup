// Reconstructed from recovered-bundle/Attribution-DFOfL3Ra.js on 2026-06-11
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAppContext } from "@/lib/appContext";
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
import { makeSplitViewPreserver } from "@/lib/chartView";
import { Download, RefreshCw, Info, SortAsc, SortDesc, Megaphone, FlaskConical, Tag, EyeOff, Maximize2, Minimize2 } from "lucide-react";
import { VerticalLinePrimitive } from "@/lib/verticalLinePrimitive";
import { setSeriesAxisLabels } from "@/components/ChartPane";
import AttributionBacktestModal from "@/components/AttributionBacktestModal";
import { getTickerEvents } from "@/lib/dataService";
import { ArrowUpDown } from "@/components/ui/icons";
import GridProminenceToggle from "@/components/GridProminenceToggle";
import { useGridColor } from "@/lib/gridPref";
import ClassificationFilters, { emptyClassFilters, applyClassFilters, serializeClassFilters, deserializeClassFilters } from "@/components/ClassificationFilters";
import { PagePresets } from "@/components/PagePresets";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import AttributionCompare from "@/components/AttributionCompare";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { useBaskets } from "@/lib/useBaskets";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  WINDOW_OPTIONS,
  BASIS_FAMILIES,
  BASIS_PERIODS,
  getBasisDef,
  getStartIndex,
  loadBasisAligned,
  loadBasisAlignedAny,
  parseAttributionPair,
  resampleAlignedWeekly,
  computeAttributionRow,
  buildRollingPath,
  type RollingPoint,
  type BasisMode,
  type BasisFamily,
  type BasisPeriod,
  type AlignedData,
  type AttributionRow,
} from "@/lib/attribution";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CumPoint { date: string; total: number; mult: number; est: number }

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

// ── Constants ─────────────────────────────────────────────────────────────────

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
  timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: false, rightOffset: 5, barSpacing: 3, minBarSpacing: 0.05 },
  // Same interaction set as the Charts-tab panes: wheel/pinch zoom + drag pan.
  handleScroll: { mouseWheel: false, pressedMouseMove: true },
  handleScale: { mouseWheel: true, pinch: true },
};

// ── Cross-chart sync (cumulative ↔ rolling) ──────────────────────────────────
// Both charts carry an invisible spacer series over the SAME union-of-dates
// axis, so mirroring the visible LOGICAL range keeps them aligned without the
// clamp-echo feedback that time-range syncing causes on trimmed data.
// Crosshair mirroring gates on param.sourceEvent so programmatic echoes never
// bounce back (see the Pairs/Charts sync fixes).

function createChartSyncGroup() {
  const members = new Map<IChartApi, { series: ISeriesApi<any> }>();
  let syncing = false;
  return {
    attach(chart: IChartApi, series: ISeriesApi<any>, el: HTMLElement) {
      members.set(chart, { series });
      const onRange = (range: { from: number; to: number } | null) => {
        if (syncing || !range) return;
        syncing = true;
        for (const [other] of members) {
          if (other === chart) continue;
          try { other.timeScale().setVisibleLogicalRange(range); } catch {}
        }
        requestAnimationFrame(() => { syncing = false; });
      };
      const onCross = (param: any) => {
        if (!param.sourceEvent) return;
        for (const [other, m] of members) {
          if (other === chart) continue;
          try {
            if (param.time != null) other.setCrosshairPosition(NaN, param.time, m.series);
            else other.clearCrosshairPosition();
          } catch {}
        }
      };
      const onLeave = () => {
        for (const [other] of members) {
          if (other === chart) continue;
          try { other.clearCrosshairPosition(); } catch {}
        }
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
      chart.subscribeCrosshairMove(onCross);
      el.addEventListener("mouseleave", onLeave);
      return () => {
        members.delete(chart);
        el.removeEventListener("mouseleave", onLeave);
      };
    },
  };
}
type ChartSyncGroup = ReturnType<typeof createChartSyncGroup>;

const COLOR_TOTAL = "#e5e7eb";
const COLOR_MULT = "#38bdf8";
const COLOR_EST = "#fbbf24";

// Fired by the header Auto-size button; SinglePanel resets chart heights and
// every chart refits its time scale (same pattern as reit-viz-reset-subcharts).
const ATTR_AUTOSIZE_EVENT = "reit-viz-attr-autosize";

/** Refit the chart's time scale when the Auto-size button fires. */
function useAutosizeRefit(chartRef: { current: IChartApi | null }) {
  useEffect(() => {
    // Double-rAF so the height reset has rendered before the refit.
    const onFit = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      try { chartRef.current?.timeScale().fitContent(); } catch {}
    }));
    window.addEventListener(ATTR_AUTOSIZE_EVENT, onFit);
    return () => window.removeEventListener(ATTR_AUTOSIZE_EVENT, onFit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── Utility functions ─────────────────────────────────────────────────────────

function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return { year: y, month: m, day: d };
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

// ── Earnings vertical-line helper (same idea as the Charts tab markers) ──────

function useEarningsLines(
  seriesRef: { current: ISeriesApi<any> | null },
  earningsDates: string[],
  deps: unknown[]
) {
  const primRef = useRef<VerticalLinePrimitive | null>(null);
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (primRef.current) {
      // setLines([]) fires requestUpdate so the removal actually repaints.
      try { primRef.current.setLines([]); series.detachPrimitive(primRef.current); } catch {}
      primRef.current = null;
    }
    if (earningsDates.length > 0) {
      const prim = new VerticalLinePrimitive([]);
      try {
        series.attachPrimitive(prim);
        // setLines AFTER attach so its requestUpdate triggers the initial paint.
        prim.setLines(earningsDates.map(d => ({ time: d, color: "#f59e0b", label: "E" })));
        primRef.current = prim;
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earningsDates, ...deps]);
}

// ── Cumulative Chart Component ────────────────────────────────────────────────

interface CumulativeChartProps { data: CumPoint[]; earningsDates?: string[]; spacerTimes?: string[]; sync?: ChartSyncGroup; height?: number; fill?: boolean; showAxisLabels?: boolean }

function CumulativeChart({ data, earningsDates = [], spacerTimes = [], sync, height = 280, fill = false, showAxisLabels = true }: CumulativeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const viewRef = useRef(makeSplitViewPreserver());
  const totalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const multSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const estSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const spacerSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const detachSyncRef = useRef<(() => void) | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; total: number; mult: number; est: number } | null>(null);
  const gridColor = useGridColor("rgba(255,255,255,0.04)");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const init = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(init); return; }
      const chart = createChart(el, { ...CHART_OPTIONS_BASE, grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } }, width: rect.width, height: rect.height });
      chartRef.current = chart;
      viewRef.current.markRecreated();
      const pf = { type: "price" as const, precision: 2, minMove: 0.01 };
      spacerSeriesRef.current = chart.addSeries(LineSeries, { color: "transparent", priceScaleId: "attr-spacer", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      estSeriesRef.current = chart.addSeries(LineSeries, { color: COLOR_EST, lineWidth: 2, title: "Estimates", priceFormat: pf, lastValueVisible: true, priceLineVisible: false });
      multSeriesRef.current = chart.addSeries(LineSeries, { color: COLOR_MULT, lineWidth: 2, title: "Multiple", priceFormat: pf, lastValueVisible: true, priceLineVisible: false });
      totalSeriesRef.current = chart.addSeries(LineSeries, { color: COLOR_TOTAL, lineWidth: 2, title: "Total", priceFormat: pf, lastValueVisible: true, priceLineVisible: false });
      if (sync) detachSyncRef.current = sync.attach(chart, totalSeriesRef.current, el);
      chart.subscribeCrosshairMove(param => {
        if (!param.time || !param.seriesData || !param.point || !(param as any).sourceEvent) { setTooltip(null); return; }
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
      detachSyncRef.current?.(); detachSyncRef.current = null;
      if (chartRef.current) viewRef.current.capture(chartRef.current);
      chartRef.current?.remove();
      chartRef.current = null; totalSeriesRef.current = null; multSeriesRef.current = null; estSeriesRef.current = null; spacerSeriesRef.current = null;
    };
  }, [gridColor]);

  useEffect(() => {
    if (!chartRef.current || !totalSeriesRef.current || !multSeriesRef.current || !estSeriesRef.current) return;
    spacerSeriesRef.current?.setData(spacerTimes.map(t => ({ time: t, value: 0 })));
    if (data.length < 2) {
      totalSeriesRef.current.setData([]); multSeriesRef.current.setData([]); estSeriesRef.current.setData([]);
      return;
    }
    const seen = new Set<string>();
    const deduped = data.filter(p => { const k = p.date.slice(0, 10); return seen.has(k) ? false : (seen.add(k), true); });
    totalSeriesRef.current.setData(deduped.map(p => ({ time: p.date.slice(0, 10), value: p.total })));
    multSeriesRef.current.setData(deduped.map(p => ({ time: p.date.slice(0, 10), value: p.mult })));
    estSeriesRef.current.setData(deduped.map(p => ({ time: p.date.slice(0, 10), value: p.est })));
    // Reframe only on a real data change; a theme recreate restores the prior view.
    viewRef.current.applyView(chartRef.current, `${data.length}:${data[data.length - 1]?.date ?? ""}`);
  }, [data, spacerTimes, gridColor]);

  useEarningsLines(totalSeriesRef, earningsDates, [data, gridColor]);
  useAutosizeRefit(chartRef);

  // Axis-label visibility (data dep so it re-applies after chart re-creation).
  useEffect(() => {
    for (const s of [totalSeriesRef.current, multSeriesRef.current, estSeriesRef.current]) {
      if (s) setSeriesAxisLabels(s, showAxisLabels);
    }
  }, [showAxisLabels, data, gridColor]);

  // NOTE: the container must always mount — the chart is created in a
  // [gridColor]-keyed effect, so an early return while data is still loading
  // would leave the chart uncreated forever once data arrives.
  return (
    <div className={`relative w-full ${fill ? "flex-1 min-h-0" : ""}`} style={fill ? undefined : { height }}>
      <div ref={containerRef} className="absolute inset-0" />
      {data.length < 2 && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          Insufficient data for cumulative decomposition.
        </div>
      )}
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

interface RollingChartProps { data: RollingPoint[]; earningsDates?: string[]; spacerTimes?: string[]; sync?: ChartSyncGroup; height?: number; fill?: boolean; showAxisLabels?: boolean }

function RollingChart({ data, earningsDates = [], spacerTimes = [], sync, height = 260, fill = false, showAxisLabels = true }: RollingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const viewRef = useRef(makeSplitViewPreserver());
  const multSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const estSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const totalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const spacerSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const detachSyncRef = useRef<(() => void) | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; total: number; mult: number; est: number } | null>(null);
  const gridColor = useGridColor("rgba(255,255,255,0.04)");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const init = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(init); return; }
      const chart = createChart(el, { ...CHART_OPTIONS_BASE, grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } }, width: rect.width, height: rect.height });
      chartRef.current = chart;
      viewRef.current.markRecreated();
      const pf = { type: "price" as const, precision: 2, minMove: 0.01 };
      spacerSeriesRef.current = chart.addSeries(LineSeries, { color: "transparent", priceScaleId: "attr-spacer", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      multSeriesRef.current = chart.addSeries(HistogramSeries, { color: COLOR_MULT + "b3", title: "Δln(Multiple)", priceFormat: pf, base: 0, priceLineVisible: false, lastValueVisible: true });
      estSeriesRef.current = chart.addSeries(HistogramSeries, { color: COLOR_EST + "b3", title: "Δln(Estimate)", priceFormat: pf, base: 0, priceLineVisible: false, lastValueVisible: true });
      totalSeriesRef.current = chart.addSeries(LineSeries, { color: COLOR_TOTAL, lineWidth: 2, title: "Total Δln(Price)", priceFormat: pf, lastValueVisible: true, priceLineVisible: false });
      if (sync) detachSyncRef.current = sync.attach(chart, totalSeriesRef.current, el);
      chart.subscribeCrosshairMove(param => {
        if (!param.time || !param.seriesData || !param.point || !(param as any).sourceEvent) { setTooltip(null); return; }
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
      detachSyncRef.current?.(); detachSyncRef.current = null;
      if (chartRef.current) viewRef.current.capture(chartRef.current);
      chartRef.current?.remove();
      chartRef.current = null; multSeriesRef.current = null; estSeriesRef.current = null; totalSeriesRef.current = null; spacerSeriesRef.current = null;
    };
  }, [gridColor]);

  useEffect(() => {
    if (!chartRef.current || !multSeriesRef.current || !estSeriesRef.current || !totalSeriesRef.current) return;
    spacerSeriesRef.current?.setData(spacerTimes.map(t => ({ time: t, value: 0 })));
    if (data.length < 2) {
      multSeriesRef.current.setData([]); estSeriesRef.current.setData([]); totalSeriesRef.current.setData([]);
      return;
    }
    const seen = new Set<string>();
    const deduped = data.filter(p => { const k = p.date.slice(0, 10); return seen.has(k) ? false : (seen.add(k), true); });
    multSeriesRef.current.setData(deduped.map(p => ({ time: p.date.slice(0, 10), value: p.mult, color: p.mult >= 0 ? COLOR_MULT + "b3" : "#0ea5e9b3" })));
    estSeriesRef.current.setData(deduped.map(p => ({ time: p.date.slice(0, 10), value: p.est, color: p.est >= 0 ? COLOR_EST + "b3" : "#d97706b3" })));
    totalSeriesRef.current.setData(deduped.map(p => ({ time: p.date.slice(0, 10), value: p.total })));
    // Reframe only on a real data change; a theme recreate restores the prior view.
    viewRef.current.applyView(chartRef.current, `${data.length}:${data[data.length - 1]?.date ?? ""}`);
  }, [data, spacerTimes, gridColor]);

  useEarningsLines(totalSeriesRef, earningsDates, [data, gridColor]);
  useAutosizeRefit(chartRef);

  useEffect(() => {
    for (const s of [multSeriesRef.current, estSeriesRef.current, totalSeriesRef.current]) {
      if (s) setSeriesAxisLabels(s, showAxisLabels);
    }
  }, [showAxisLabels, data, gridColor]);

  // Container must always mount — see CumulativeChart note.
  return (
    <div className={`relative w-full ${fill ? "flex-1 min-h-0" : ""}`} style={fill ? undefined : { height }}>
      <div ref={containerRef} className="absolute inset-0" />
      {data.length < 2 && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          Insufficient data for rolling decomposition (need at least one full rolling window after start).
        </div>
      )}
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

// ── Share-of-Move Chart Component ────────────────────────────────────────────
// Rolling |Δln M| / (|Δln M| + |Δln E|) as a percent — "over the trailing
// window, what % of the gross move came from the multiple vs estimates".
// The two lines sum to 100 by construction (same formula as the Charts-tab
// Attribution panel's "Share of move %" display).

interface ShareChartProps { data: RollingPoint[]; earningsDates?: string[]; spacerTimes?: string[]; sync?: ChartSyncGroup; height?: number; fill?: boolean; showAxisLabels?: boolean }

function ShareChart({ data, earningsDates = [], spacerTimes = [], sync, height = 200, fill = false, showAxisLabels = true }: ShareChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const viewRef = useRef(makeSplitViewPreserver());
  const multSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const estSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const midSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const spacerSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const detachSyncRef = useRef<(() => void) | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; mult: number; est: number } | null>(null);
  const gridColor = useGridColor("rgba(255,255,255,0.04)");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const init = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(init); return; }
      const chart = createChart(el, { ...CHART_OPTIONS_BASE, grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } }, width: rect.width, height: rect.height });
      chartRef.current = chart;
      viewRef.current.markRecreated();
      const pf = { type: "price" as const, precision: 0, minMove: 1 };
      spacerSeriesRef.current = chart.addSeries(LineSeries, { color: "transparent", priceScaleId: "attr-spacer", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      midSeriesRef.current = chart.addSeries(LineSeries, { color: "rgba(255,255,255,0.18)", lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
      estSeriesRef.current = chart.addSeries(LineSeries, { color: COLOR_EST, lineWidth: 2, title: "Est share %", priceFormat: pf, lastValueVisible: true, priceLineVisible: false });
      multSeriesRef.current = chart.addSeries(LineSeries, { color: COLOR_MULT, lineWidth: 2, title: "Multiple share %", priceFormat: pf, lastValueVisible: true, priceLineVisible: false });
      if (sync) detachSyncRef.current = sync.attach(chart, multSeriesRef.current, el);
      chart.subscribeCrosshairMove(param => {
        if (!param.time || !param.seriesData || !param.point || !(param as any).sourceEvent) { setTooltip(null); return; }
        const mv = multSeriesRef.current ? param.seriesData.get(multSeriesRef.current) : null;
        const ev = estSeriesRef.current ? param.seriesData.get(estSeriesRef.current) : null;
        if (!mv && !ev) { setTooltip(null); return; }
        const t = param.time;
        const dateStr = typeof t === "object" && (t as any).year
          ? `${(t as any).year}-${String((t as any).month).padStart(2, "0")}-${String((t as any).day).padStart(2, "0")}` : String(t);
        setTooltip({ x: param.point.x, y: param.point.y, date: dateStr, mult: (mv as any)?.value ?? 0, est: (ev as any)?.value ?? 0 });
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
      detachSyncRef.current?.(); detachSyncRef.current = null;
      if (chartRef.current) viewRef.current.capture(chartRef.current);
      chartRef.current?.remove();
      chartRef.current = null; multSeriesRef.current = null; estSeriesRef.current = null; midSeriesRef.current = null; spacerSeriesRef.current = null;
    };
  }, [gridColor]);

  useEffect(() => {
    if (!chartRef.current || !multSeriesRef.current || !estSeriesRef.current) return;
    spacerSeriesRef.current?.setData(spacerTimes.map(t => ({ time: t, value: 0 })));
    if (data.length < 2) {
      multSeriesRef.current.setData([]); estSeriesRef.current.setData([]); midSeriesRef.current?.setData([]);
      return;
    }
    const seen = new Set<string>();
    const deduped = data.filter(p => { const k = p.date.slice(0, 10); return seen.has(k) ? false : (seen.add(k), true); });
    const shares = deduped.map(p => {
      const denom = Math.abs(p.mult) + Math.abs(p.est);
      const mult = denom > 1e-12 ? (Math.abs(p.mult) / denom) * 100 : 50;
      return { time: p.date.slice(0, 10), mult, est: 100 - mult };
    });
    multSeriesRef.current.setData(shares.map(s => ({ time: s.time, value: s.mult })));
    estSeriesRef.current.setData(shares.map(s => ({ time: s.time, value: s.est })));
    midSeriesRef.current?.setData([
      { time: shares[0].time, value: 50 },
      { time: shares[shares.length - 1].time, value: 50 },
    ]);
    // Reframe only on a real data change; a theme recreate restores the prior view.
    viewRef.current.applyView(chartRef.current, `${data.length}:${data[data.length - 1]?.date ?? ""}`);
  }, [data, spacerTimes, gridColor]);

  useEarningsLines(multSeriesRef, earningsDates, [data, gridColor]);
  useAutosizeRefit(chartRef);

  useEffect(() => {
    for (const s of [multSeriesRef.current, estSeriesRef.current]) {
      if (s) setSeriesAxisLabels(s, showAxisLabels);
    }
  }, [showAxisLabels, data, gridColor]);

  // Container must always mount — see CumulativeChart note.
  return (
    <div className={`relative w-full ${fill ? "flex-1 min-h-0" : ""}`} style={fill ? undefined : { height }}>
      <div ref={containerRef} className="absolute inset-0" />
      {data.length < 2 && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          Insufficient data for share-of-move (needs the rolling decomposition).
        </div>
      )}
      {tooltip && (
        <div className="pointer-events-none absolute z-10 rounded border border-border bg-popover/95 px-2 py-1 text-[10px] shadow-md backdrop-blur"
          style={{ left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 0) - 170), top: Math.max(8, tooltip.y - 55) }}>
          <div className="text-muted-foreground mb-0.5">{tooltip.date}</div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: COLOR_MULT }}>Multiple share</span><span className="font-mono">{tooltip.mult.toFixed(0)}%</span></div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: COLOR_EST }}>Est share</span><span className="font-mono">{tooltip.est.toFixed(0)}%</span></div>
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

// ── Searchable single-ticker picker (symbol OR company name) ─────────────────

/** `label` overrides how the option renders (baskets show their name while
 *  `ticker` carries the canonical "BASKET:<id>" value). */
export interface TickerOption { ticker: string; name?: string; label?: string }

export function TickerSearchSelect({ options, value, valueLabel, onChange }: {
  options: TickerOption[];
  value: string;
  valueLabel?: string;
  onChange: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options.slice(0, 60);
    return options
      .filter(o => o.ticker.toLowerCase().includes(s) || (o.label ?? "").toLowerCase().includes(s) || (o.name ?? "").toLowerCase().includes(s))
      .slice(0, 60);
  }, [options, q]);
  // Typing "A/B" offers the pair (ratio) — attribution runs on the combined
  // legs (P_A/P_B = M_A/M_B × E_A/E_B keeps the identity exact). Each side
  // resolves to a ticker OR a basket by name ("WELL/healthcare" →
  // "WELL/BASKET:<id>").
  const resolveLeg = useMemo(() => (raw: string): { value: string; label: string } | null => {
    const t = raw.trim();
    if (!t) return null;
    if (/^BASKET:[^/]+$/.test(t)) {
      const b = options.find(o => o.ticker === t);
      return { value: t, label: b?.label ?? t };
    }
    const up = t.toUpperCase();
    const exact = options.find(o => !o.ticker.startsWith("BASKET:") && o.ticker.toUpperCase() === up);
    if (exact) return { value: exact.ticker, label: exact.ticker };
    // Basket by name: exact match, then prefix, then substring (shortest name
    // wins on ties — several baskets can share a stem, e.g. auto-baskets).
    const low = t.toLowerCase();
    const bs = options.filter(o => o.ticker.startsWith("BASKET:"));
    const byLen = (arr: TickerOption[]) => arr.sort((x, y) => (x.label ?? "").length - (y.label ?? "").length)[0];
    const cand =
      bs.find(o => (o.label ?? "").toLowerCase() === low)
      ?? byLen(bs.filter(o => (o.label ?? "").toLowerCase().startsWith(low)))
      ?? byLen(bs.filter(o => (o.label ?? "").toLowerCase().includes(low)));
    if (cand) return { value: cand.ticker, label: cand.label ?? cand.ticker };
    if (/^[A-Za-z0-9.\-]{1,12}$/.test(t)) return { value: up, label: up };
    return null;
  }, [options]);
  const pairQ = useMemo(() => {
    const idx = q.indexOf("/");
    if (idx <= 0 || idx === q.length - 1) return null;
    const a = resolveLeg(q.slice(0, idx));
    const b = resolveLeg(q.slice(idx + 1));
    if (!a || !b) return null;
    return { value: `${a.value}/${b.value}`, label: `${a.label}/${b.label}` };
  }, [q, resolveLeg]);
  return (
    <div className="relative" data-testid="attr-ticker-select">
      <input
        value={open ? q : (valueLabel ?? value)}
        placeholder="Ticker, pair, or basket…"
        onFocus={() => { setOpen(true); setQ(""); }}
        onClick={() => { if (!open) { setOpen(true); setQ(""); } }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && pairQ) { onChange(pairQ.value); setOpen(false); (e.target as HTMLInputElement).blur(); } }}
        className="w-60 px-2 py-1 text-[11px] bg-input border border-border rounded outline-none focus:border-primary"
        data-testid="attr-ticker-input"
      />
      {open && (
        <div className="absolute z-30 mt-1 w-80 max-h-72 overflow-y-auto bg-popover border border-border rounded shadow-lg">
          {pairQ && (
            <button
              onMouseDown={() => { onChange(pairQ.value); setOpen(false); }}
              className="w-full text-left px-2 py-1 text-[10px] hover:bg-muted flex items-center gap-2 border-b border-border"
              data-testid="attr-ticker-pair-opt"
            >
              <span className="font-semibold flex-shrink-0">{pairQ.label}</span>
              <span className="text-muted-foreground">pair — ratio attribution</span>
            </button>
          )}
          {matches.map(o => (
            <button
              key={o.ticker}
              onMouseDown={() => { onChange(o.ticker); setOpen(false); }}
              className={`w-full text-left px-2 py-1 text-[10px] hover:bg-muted flex items-center justify-between gap-2 ${o.ticker === value ? "bg-primary/20" : ""}`}
              data-testid={`attr-ticker-opt-${o.ticker}`}
            >
              <span className="font-semibold flex-shrink-0">{o.label ?? o.ticker}</span>
              <span className="text-muted-foreground truncate">{o.name ?? ""}</span>
            </button>
          ))}
          {matches.length === 0 && <div className="px-2 py-1 text-[10px] text-muted-foreground">No matches</div>}
        </div>
      )}
    </div>
  );
}

// ── Single Ticker Panel ───────────────────────────────────────────────────────

interface SinglePanelProps {
  activeTickerLabel: string;
  freqUnit: "day" | "week" | "month";
  tickerOptions: TickerOption[];
  activeTicker: string;
  setActiveTicker: (t: string) => void;
  aligned: AlignedData | null;
  cumPath: CumPoint[];
  rollingPath: RollingPoint[];
  summary: AttributionSummary | null;
  resolvedBasis: BasisFamily;
  basisPeriod: BasisPeriod;
  windowDays: number;
  rollingDays: number;
  loadingSingle: boolean;
  earningsDates: string[];
  showAxisLabels: boolean;
}

const CHART_HEIGHTS_KEY = "reit-viz:attr-chart-heights";
const DEFAULT_CHART_HEIGHTS = [280, 260, 200];
const MIN_CHART_HEIGHT = 120;

function SinglePanel({ tickerOptions, activeTicker, activeTickerLabel, freqUnit, setActiveTicker, aligned, cumPath, rollingPath, summary, resolvedBasis, basisPeriod, windowDays, rollingDays, loadingSingle, earningsDates, showAxisLabels }: SinglePanelProps) {
  // One sync group per mounted panel: the cumulative + rolling charts share a
  // spacer axis (union of both date lists) and mirror pan/zoom + crosshair.
  const syncRef = useRef<ChartSyncGroup | null>(null);
  if (!syncRef.current) syncRef.current = createChartSyncGroup();
  const spacerTimes = useMemo(() => {
    const seen = new Set<string>();
    for (const p of cumPath) seen.add(p.date.slice(0, 10));
    for (const p of rollingPath) seen.add(p.date.slice(0, 10));
    return Array.from(seen).sort();
  }, [cumPath, rollingPath]);

  // Per-chart heights (drag the divider under a chart to resize it) + a
  // per-chart maximize that gives one chart the whole panel.
  const [heights, setHeights] = useState<number[]>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CHART_HEIGHTS_KEY) || "");
      if (Array.isArray(s) && s.length === 3 && s.every(n => Number.isFinite(n) && n >= MIN_CHART_HEIGHT)) return s;
    } catch {}
    return DEFAULT_CHART_HEIGHTS;
  });
  const [expanded, setExpanded] = useState<"cum" | "roll" | "share" | null>(null);
  const heightsRef = useRef(heights);
  heightsRef.current = heights;
  // Auto-size: restore default heights + un-maximize (charts refit themselves
  // via useAutosizeRefit on the same event).
  useEffect(() => {
    const onAutosize = () => {
      setHeights(DEFAULT_CHART_HEIGHTS);
      setExpanded(null);
      try { localStorage.setItem(CHART_HEIGHTS_KEY, JSON.stringify(DEFAULT_CHART_HEIGHTS)); } catch {}
    };
    window.addEventListener(ATTR_AUTOSIZE_EVENT, onAutosize);
    return () => window.removeEventListener(ATTR_AUTOSIZE_EVENT, onAutosize);
  }, []);
  const startDividerDrag = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = heightsRef.current[idx];
    const onMove = (ev: MouseEvent) => {
      setHeights(h => {
        const next = [...h];
        next[idx] = Math.max(MIN_CHART_HEIGHT, startH + ev.clientY - startY);
        return next;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      setHeights(h => { try { localStorage.setItem(CHART_HEIGHTS_KEY, JSON.stringify(h)); } catch {} return h; });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
  }, []);

  const expandBtn = (id: "cum" | "roll" | "share", title: string) => (
    <button
      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
      onClick={() => setExpanded(v => (v === id ? null : id))}
      title={expanded === id ? "Restore" : `Expand ${title}`}
      data-testid={`attr-expand-${id}`}
    >
      {expanded === id ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
    </button>
  );
  const divider = (idx: number) => (
    <div
      className="h-[9px] -my-[3px] relative z-10 cursor-row-resize group flex items-center justify-center"
      onMouseDown={e => startDividerDrag(idx, e)}
      data-testid={`attr-divider-${idx}`}
    >
      <div className="h-[3px] w-16 rounded bg-border/60 group-hover:bg-primary/60" />
    </div>
  );
  const sectionCls = (id: "cum" | "roll" | "share", base: string) =>
    expanded === id ? "p-3 flex-1 min-h-0 flex flex-col" : base;
  return (
    <div className="flex h-full">
      {/* Charts */}
      <div className="flex-1 flex flex-col overflow-auto">
        {/* Ticker picker + summary header */}
        <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-start gap-4 flex-wrap">
          <TickerSearchSelect options={tickerOptions} value={activeTicker} valueLabel={activeTickerLabel} onChange={setActiveTicker} />
          {loadingSingle ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-3 h-3 animate-spin" /> Loading {activeTickerLabel}…
            </div>
          ) : !summary || !aligned ? (
            <div className="text-muted-foreground">
              No data for {activeTickerLabel}. {resolvedBasis === "EPS" ? "" : "(FFO not available — try forcing EPS basis)"}
            </div>
          ) : (
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Ticker / Basis</div>
                <div className="text-sm font-bold">{activeTickerLabel} <span className="text-[10px] text-muted-foreground font-normal">({getBasisDef(resolvedBasis, basisPeriod).label})</span></div>
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
        {(expanded === null || expanded === "cum") && (
          <div className={sectionCls("cum", "p-3 border-b border-border")}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold">Cumulative Decomposition (anchored at window start)</div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-foreground" /> Total Price</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-sky-400" /> Multiple</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-amber-400" /> Estimates</span>
                {expandBtn("cum", "Cumulative")}
              </div>
            </div>
            <CumulativeChart data={cumPath} earningsDates={earningsDates} spacerTimes={spacerTimes} sync={syncRef.current!} height={heights[0]} fill={expanded === "cum"} showAxisLabels={showAxisLabels} />
          </div>
        )}
        {expanded === null && divider(0)}
        {/* Rolling chart */}
        {(expanded === null || expanded === "roll") && (
          <div className={sectionCls("roll", "p-3")}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold">Rolling {rollingDays}-{freqUnit} Contribution (stacked)</div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-sky-400/70" /> Δln(Multiple)</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-amber-400/70" /> Δln(Estimate)</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-foreground" /> Total Δln(Price)</span>
                {expandBtn("roll", "Rolling")}
              </div>
            </div>
            <RollingChart data={rollingPath} earningsDates={earningsDates} spacerTimes={spacerTimes} sync={syncRef.current!} height={heights[1]} fill={expanded === "roll"} showAxisLabels={showAxisLabels} />
          </div>
        )}
        {expanded === null && divider(1)}
        {/* Share-of-move chart */}
        {(expanded === null || expanded === "share") && (
          <div className={sectionCls("share", "p-3 border-t border-border")}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold" title="Over each trailing window: |Δln M| / (|Δln M| + |Δln E|). The two lines sum to 100%.">
                Share of Rolling {rollingDays}-{freqUnit} Move (% multiple vs % estimates)
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-sky-400" /> Multiple share %</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-amber-400" /> Estimate share %</span>
                {expandBtn("share", "Share of move")}
              </div>
            </div>
            <ShareChart data={rollingPath} earningsDates={earningsDates} spacerTimes={spacerTimes} sync={syncRef.current!} height={heights[2]} fill={expanded === "share"} showAxisLabels={showAxisLabels} />
          </div>
        )}
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

  const [mode, setMode] = useState<"single" | "compare" | "basket" | "table">("single");
  const [basisMode, setBasisMode] = useState<BasisMode>("auto");
  const [basisPeriod, setBasisPeriod] = useState<BasisPeriod>("FY2");
  const [windowDays, setWindowDays] = useState(252);
  const [rollingDays, setRollingDays] = useState(21);
  // Chart/decomposition frequency: weekly/monthly sample one point per ISO
  // week / calendar month and make the Rolling number mean bars of that
  // frequency instead of trading days.
  const [attrFreq, setAttrFreq] = useState<"daily" | "weekly" | "monthly">("daily");
  const [aligned, setAligned] = useState<AlignedData | null>(null);
  // Universe-table filters (classification + country/exchange)
  const [classFilters, setClassFilters] = useState(emptyClassFilters());
  const [clfSearch, setClfSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const geo = useGeoFilter(filteredTickersList, "attr-geo");
  // Basket mode
  const { baskets } = useBaskets();
  const [basketId, setBasketId] = useState("");
  const [resolvedBasis, setResolvedBasis] = useState<BasisFamily>("FFO");
  const [loadingSingle, setLoadingSingle] = useState(false);
  const [tableRows, setTableRows] = useState<AttributionRow[]>([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [tableProgress, setTableProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeTicker, setActiveTicker] = useState("");
  const [sortKey, setSortKey] = useState("multipleShare");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Earnings-date vertical lines on the single-ticker charts (Charts-tab style)
  const [showEarnings, setShowEarnings] = useState(false);
  const [earningsDates, setEarningsDates] = useState<string[]>([]);
  const [showBacktest, setShowBacktest] = useState(false);
  // Axis "Labels" toggle (same behavior as the Charts-tab toolbar button).
  const [showAxisLabels, setShowAxisLabels] = useState(() => {
    try { return localStorage.getItem("reit-viz:attr-axis-labels") !== "0"; } catch { return true; }
  });
  const toggleAxisLabels = useCallback(() => {
    setShowAxisLabels(v => {
      try { localStorage.setItem("reit-viz:attr-axis-labels", v ? "0" : "1"); } catch {}
      return !v;
    });
  }, []);

  // ── Workspace persistence (config only) — shared with the Templates button ──
  const captureState = useCallback(() => ({
    mode, basisMode, basisPeriod, windowDays, rollingDays, attrFreq,
    activeTicker, basketId, sortKey, sortDir, showEarnings,
    classFilters: serializeClassFilters(classFilters),
    clfSearch,
    manualTickers: [...manualTickers],
    geo: { nations: [...geo.state.nations], exchanges: [...geo.state.exchanges] },
  }), [mode, basisMode, basisPeriod, windowDays, rollingDays, attrFreq, activeTicker, basketId,
    sortKey, sortDir, showEarnings, classFilters, clfSearch, manualTickers, geo.state]);

  const applyState = useCallback((c: any) => {
    if (c?.mode === "single" || c?.mode === "compare" || c?.mode === "basket" || c?.mode === "table") setMode(c.mode);
    if (typeof c?.basisMode === "string" && c.basisMode) setBasisMode(c.basisMode);
    if (typeof c?.basisPeriod === "string" && c.basisPeriod) setBasisPeriod(c.basisPeriod);
    if (Number.isFinite(c?.windowDays)) setWindowDays(c.windowDays);
    if (Number.isFinite(c?.rollingDays)) setRollingDays(c.rollingDays);
    if (c?.attrFreq === "daily" || c?.attrFreq === "weekly" || c?.attrFreq === "monthly") setAttrFreq(c.attrFreq);
    if (typeof c?.activeTicker === "string" && c.activeTicker) setActiveTicker(c.activeTicker);
    if (typeof c?.basketId === "string") setBasketId(c.basketId);
    if (typeof c?.sortKey === "string" && c.sortKey) setSortKey(c.sortKey);
    if (c?.sortDir === "asc" || c?.sortDir === "desc") setSortDir(c.sortDir);
    if (typeof c?.showEarnings === "boolean") setShowEarnings(c.showEarnings);
    if (c?.classFilters) setClassFilters(deserializeClassFilters(c.classFilters));
    if (typeof c?.clfSearch === "string") setClfSearch(c.clfSearch);
    if (Array.isArray(c?.manualTickers)) setManualTickers(new Set(c.manualTickers.filter((t: any) => typeof t === "string")));
    if (c?.geo) {
      geo.setNations(new Set(Array.isArray(c.geo.nations) ? c.geo.nations : []));
      geo.setExchanges(new Set(Array.isArray(c.geo.exchanges) ? c.geo.exchanges : []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.setNations, geo.setExchanges]);

  useWorkspaceTab("attribution", captureState, applyState);

  useEffect(() => {
    if (!showEarnings || !activeTicker) {
      setEarningsDates([]);
      return;
    }
    let cancelled = false;
    // Dates may be YYYY-MM-DD or MM/DD/YYYY — normalize to YYYY-MM-DD
    const normalize = (arr: string[] | undefined) =>
      (arr || []).map(d => {
        if (d.includes("-")) return d;
        const [m, day, y] = d.split("/");
        return `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }).filter(d => d && d.length === 10).sort();
    const pair = parseAttributionPair(activeTicker);
    // Basket legs have no single earnings series — only plain-ticker legs mark.
    const legs = (pair ? [pair.a, pair.b] : [activeTicker]).filter(l => !l.startsWith("BASKET:"));
    Promise.all(legs.map(t => getTickerEvents(t).catch(() => null))).then(results => {
      if (cancelled) return;
      const merged = new Set<string>();
      for (const events of results) for (const d of normalize((events as any)?.earnings)) merged.add(d);
      setEarningsDates(Array.from(merged).sort());
    });
    return () => { cancelled = true; };
  }, [showEarnings, activeTicker]);

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
      const res = await loadBasisAlignedAny(
        activeTicker, basisMode, basisPeriod, undefined,
        (id) => { const b = baskets.find(x => x.id === id); return b ? { ...b } : undefined; },
      );
      setAligned(res?.aligned ?? null);
      if (res) setResolvedBasis(res.basis);
    } catch (err) {
      console.error("Attribution single loader failed", err);
      setAligned(null);
    } finally {
      setLoadingSingle(false);
    }
  }, [activeTicker, basisMode, basisPeriod, baskets]);

  useEffect(() => { loadSingle(); }, [loadSingle]);

  // Universe list after classification + geo filters (drives the table mode).
  const filteredUniverseTickers = useMemo(() => {
    let rows = applyClassFilters(filteredTickersList, classFilters, clfSearch, manualTickers);
    rows = geo.filterByGeo(rows);
    return rows.map((t: any) => t.ticker as string);
  }, [filteredTickersList, classFilters, clfSearch, manualTickers, geo.filterByGeo]);

  const activeBasket = useMemo(() => baskets.find(b => b.id === basketId) ?? null, [baskets, basketId]);

  // Run attribution over an arbitrary ticker list (universe table or basket members).
  const cancelRef = useRef({ cancelled: false });
  const runTable = useCallback(async (list: string[]) => {
    cancelRef.current.cancelled = true;
    const token = { cancelled: false };
    cancelRef.current = token;
    setLoadingTable(true); setTableRows([]); setTableProgress({ done: 0, total: list.length });
    const results: AttributionRow[] = [];
    const CONCURRENCY = 8;
    let idx = 0, done = 0;
    async function worker() {
      for (;;) {
        if (token.cancelled) return;
        const i = idx++;
        if (i >= list.length) return;
        const ticker = list[i];
        try {
          const res = await loadBasisAligned(ticker, basisMode, basisPeriod);
          if (!res) { done++; setTableProgress({ done, total: list.length }); continue; }
          const row = computeAttributionRow(ticker, `${res.basis} ${basisPeriod}`, res.aligned, windowDays);
          if (row) results.push(row);
        } catch { /* skip */ }
        done++;
        if (!token.cancelled) setTableProgress({ done, total: list.length });
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    if (!token.cancelled) { setTableRows(results); setLoadingTable(false); setTableProgress(null); }
  }, [windowDays, basisMode, basisPeriod]);

  // Basket mode: recompute automatically whenever the basket or settings change.
  useEffect(() => {
    if (mode !== "basket") return;
    if (!activeBasket || activeBasket.tickers.length === 0) { setTableRows([]); return; }
    runTable(activeBasket.tickers);
  }, [mode, activeBasket, runTable]);

  // Equal-weight aggregate across the computed rows (basket summary strip).
  const aggregate = useMemo(() => {
    if (!tableRows.length) return null;
    const mean = (f: (r: AttributionRow) => number) => tableRows.reduce((s, r) => s + f(r), 0) / tableRows.length;
    const mult = mean(r => r.multiplePct), est = mean(r => r.estimatePct);
    const sumAbs = Math.abs(mult) + Math.abs(est);
    return {
      n: tableRows.length,
      total: mean(r => r.totalPct),
      mult, est,
      multShare: sumAbs > 0 ? Math.abs(mult) / sumAbs : 0,
      estShare: sumAbs > 0 ? Math.abs(est) / sumAbs : 0,
    };
  }, [tableRows]);

  // Derived paths. Weekly frequency: sample the aligned data to one point per
  // ISO week (identity survives pointwise) and convert the calendar window
  // from trading days to bars; the Rolling number then means BARS of the
  // chosen frequency (21 = 21 weeks on weekly).
  const alignedView = useMemo(
    () => (aligned && attrFreq !== "daily" ? resampleAlignedWeekly(aligned, attrFreq) : aligned),
    [aligned, attrFreq],
  );
  const effWindowDays = attrFreq !== "daily" && windowDays > 0
    ? Math.max(2, Math.round(windowDays / (attrFreq === "monthly" ? 21 : 5)))
    : windowDays;
  const cumPath = useMemo(() => alignedView ? buildCumulativePath(alignedView, getStartIndex(alignedView.dates, effWindowDays)) : [], [alignedView, effWindowDays]);
  const rollingPath = useMemo(() => alignedView ? buildRollingPath(alignedView, getStartIndex(alignedView.dates, effWindowDays), rollingDays) : [], [alignedView, effWindowDays, rollingDays]);
  const summary: AttributionSummary | null = useMemo(() => {
    if (!cumPath.length || !alignedView) return null;
    const last = cumPath[cumPath.length - 1];
    const sumAbs = Math.abs(last.mult) + Math.abs(last.est);
    return {
      total: last.total, mult: last.mult, est: last.est,
      multShare: sumAbs > 0 ? Math.abs(last.mult) / sumAbs : 0,
      estShare: sumAbs > 0 ? Math.abs(last.est) / sumAbs : 0,
      totalSimple: (alignedView.close[alignedView.close.length - 1] / alignedView.close[getStartIndex(alignedView.dates, effWindowDays)] - 1) * 100,
      startDate: cumPath[0].date,
      endDate: last.date,
    };
  }, [cumPath, alignedView, effWindowDays]);

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
      const meta = `# ${activeTickerLabel} | basis=${resolvedBasis} ${basisPeriod} | window=${windowDays === 0 ? "YTD" : `${windowDays}d`} | start=${summary?.startDate ?? ""} | end=${summary?.endDate ?? ""}`;
      const safeName = activeTickerLabel.replace(/[^A-Za-z0-9._\-]+/g, "-");
      downloadCsv([meta, header, ...rows].join("\n"), `attribution_${safeName}_${windowDays === 0 ? "ytd" : `${windowDays}d`}.csv`);
    } else {
      if (!sortedRows.length) return;
      const header = "ticker,basis,total_pct,multiple_pct,estimate_pct,multiple_share,estimate_share,same_direction";
      const rows = sortedRows.map(r => [r.ticker, r.basis, r.totalPct.toFixed(4), r.multiplePct.toFixed(4), r.estimatePct.toFixed(4), r.multipleShare.toFixed(4), r.estimateShare.toFixed(4), r.sameDirection ? "1" : "0"].join(","));
      const meta = `# universe attribution | window=${windowDays === 0 ? "YTD" : `${windowDays}d`} | basis=${basisMode === "auto" ? "auto(FFO->EPS)" : basisMode} ${basisPeriod}`;
      downloadCsv([meta, header, ...rows].join("\n"), `attribution_universe_${windowDays === 0 ? "ytd" : `${windowDays}d`}.csv`);
    }
  }

  const tickerOptions = useMemo(
    () => [
      ...filteredTickersList.map((t: any) => ({ ticker: t.ticker as string, name: t.name as string | undefined })),
      // Baskets are selectable directly or as pair legs ("WELL/healthcare").
      ...baskets.map(b => ({ ticker: `BASKET:${b.id}`, name: `${b.tickers.length} names · ${b.weighting || "equal"}`, label: b.name })),
    ],
    [filteredTickersList, baskets]
  );

  // Friendly display for pickers/headers: swap BASKET:<id> legs for names.
  const displaySymbol = useCallback((sym: string) => {
    const nameOf = (leg: string) => {
      if (!leg.startsWith("BASKET:")) return leg;
      const b = baskets.find(x => x.id === leg.slice("BASKET:".length));
      return b ? b.name : leg;
    };
    const pair = parseAttributionPair(sym);
    return pair ? `${nameOf(pair.a)}/${nameOf(pair.b)}` : nameOf(sym);
  }, [baskets]);
  const activeTickerLabel = useMemo(() => displaySymbol(activeTicker), [displaySymbol, activeTicker]);
  const resolveBasketFn = useCallback((id: string) => {
    const b = baskets.find(x => x.id === id);
    return b ? { ...b } : undefined;
  }, [baskets]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground font-mono text-xs">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-tight">Price Attribution</h1>
          <span className="text-[10px] text-muted-foreground">Δln(P) = Δln(M) + Δln(E) — decompose returns into multiple expansion vs estimate revisions</span>
          <PagePresets
            storageKey="reit-viz:attribution:presets"
            label="Templates"
            testIdPrefix="attr-presets"
            capture={captureState}
            apply={applyState}
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 border border-border rounded">
            {(["single", "compare", "basket", "table"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} className={`px-2 py-1 text-[10px] ${mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} data-testid={`attr-mode-${m}`}>
                {m === "single" ? "Single Ticker" : m === "compare" ? "Compare" : m === "basket" ? "Basket" : "Universe Table"}
              </button>
            ))}
          </div>
          {/* Basis */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Basis:</span>
            <div className="flex items-center gap-0.5 border border-border rounded">
              {(["auto", ...BASIS_FAMILIES] as BasisMode[]).map(b => (
                <button key={b} onClick={() => setBasisMode(b)} className={`px-1.5 py-0.5 text-[10px] ${basisMode === b ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {b === "auto" ? "Auto" : b}
                </button>
              ))}
            </div>
          </div>
          {/* Estimate period */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Est:</span>
            <div className="flex items-center gap-0.5 border border-border rounded">
              {BASIS_PERIODS.map(p => (
                <button key={p} onClick={() => setBasisPeriod(p)} className={`px-1.5 py-0.5 text-[10px] ${basisPeriod === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  {p}
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
            <input
              type="number"
              min={2}
              max={5000}
              placeholder="custom d"
              defaultValue={WINDOW_OPTIONS.some(o => o.days === windowDays) ? "" : windowDays}
              className={`w-[64px] bg-transparent border rounded px-1 py-0.5 text-[10px] ${WINDOW_OPTIONS.some(o => o.days === windowDays) ? "border-border" : "border-primary text-primary"}`}
              title="Custom look-back window in trading days"
              onBlur={e => {
                const v = parseInt(e.target.value);
                if (!isNaN(v) && v >= 2 && v <= 5000) setWindowDays(v);
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const v = parseInt((e.target as HTMLInputElement).value);
                  if (!isNaN(v) && v >= 2 && v <= 5000) setWindowDays(v);
                }
              }}
            />
          </div>
          {/* Rolling (single mode only) */}
          {(mode === "single" || mode === "compare") && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Freq:</span>
              <div className="flex items-center gap-0.5 border border-border rounded">
                {(["daily", "weekly", "monthly"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setAttrFreq(f)}
                    className={`px-1.5 py-0.5 text-[10px] ${attrFreq === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    title={f === "weekly" ? "One point per week — Rolling counts weeks" : f === "monthly" ? "One point per calendar month — Rolling counts months" : "Daily bars — Rolling counts trading days"}
                    data-testid={`attr-freq-${f}`}
                  >
                    {f === "daily" ? "D" : f === "weekly" ? "W" : "M"}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground ml-1">Rolling:</span>
              <div className="flex items-center gap-0.5 border border-border rounded">
                {ROLLING_OPTIONS.map(o => (
                  <button key={o.label} onClick={() => setRollingDays(o.days)} className={`px-1.5 py-0.5 text-[10px] ${rollingDays === o.days ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    {attrFreq === "weekly" ? `${o.days}w` : attrFreq === "monthly" ? `${o.days}mo` : o.label}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={2}
                max={1000}
                placeholder={attrFreq === "weekly" ? "custom w" : attrFreq === "monthly" ? "custom mo" : "custom d"}
                defaultValue={ROLLING_OPTIONS.some(o => o.days === rollingDays) ? "" : rollingDays}
                className={`w-[64px] bg-transparent border rounded px-1 py-0.5 text-[10px] ${ROLLING_OPTIONS.some(o => o.days === rollingDays) ? "border-border" : "border-primary text-primary"}`}
                title={`Custom rolling window in ${attrFreq === "weekly" ? "weeks" : attrFreq === "monthly" ? "months" : "trading days"}`}
                data-testid="attr-rolling-custom"
                onBlur={e => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 2 && v <= 1000) setRollingDays(v);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const v = parseInt((e.target as HTMLInputElement).value);
                    if (!isNaN(v) && v >= 2 && v <= 1000) setRollingDays(v);
                  }
                }}
              />
            </div>
          )}
          {/* Earnings-date markers (single mode only) */}
          {mode === "single" && (
            <Button
              variant={showEarnings ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={() => setShowEarnings(v => !v)}
              data-testid="attr-toggle-earnings"
              title="Toggle earnings-date vertical lines on the charts"
            >
              <Megaphone className="w-3 h-3 mr-1" /> Earnings
            </Button>
          )}
          {mode === "single" && (
            <Button
              variant="outline"
              size="sm"
              className={`h-7 px-2 text-[10px] ${showAxisLabels ? "" : "text-muted-foreground/50"}`}
              onClick={toggleAxisLabels}
              data-testid="attr-toggle-labels"
              title={showAxisLabels ? "Hide series name + current-value labels on the price axes" : "Show series name + current-value labels on the price axes"}
            >
              {showAxisLabels ? <Tag className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />} Labels
            </Button>
          )}
          {mode === "single" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={() => window.dispatchEvent(new CustomEvent(ATTR_AUTOSIZE_EVENT))}
              data-testid="attr-autosize"
              title="Reset all chart sizes to defaults and refit their time scales"
            >
              <Maximize2 className="w-3 h-3 mr-1" /> Auto-size
            </Button>
          )}
          {mode === "single" && (
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={() => setShowBacktest(true)}
              disabled={!alignedView}
              data-testid="attr-backtest-open"
              title="Historical forward returns conditioned on the current est-vs-multiple attribution state"
            >
              <FlaskConical className="w-3 h-3 mr-1" /> Backtest
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} className="h-7 px-2 text-[10px]">
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
          {mode === "table" && (
            <Button variant="default" size="sm" onClick={() => runTable(filteredUniverseTickers)} disabled={loadingTable || filteredUniverseTickers.length === 0} className="h-7 px-2 text-[10px]" data-testid="attr-run-table">
              {loadingTable ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Run on {filteredUniverseTickers.length}
            </Button>
          )}
          <GridProminenceToggle />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {mode === "single" ? (
          <SinglePanel
            tickerOptions={tickerOptions}
            activeTicker={activeTicker}
            activeTickerLabel={activeTickerLabel}
            setActiveTicker={setActiveTicker}
            aligned={alignedView}
            freqUnit={attrFreq === "weekly" ? "week" : attrFreq === "monthly" ? "month" : "day"}
            cumPath={cumPath}
            rollingPath={rollingPath}
            summary={summary}
            resolvedBasis={resolvedBasis}
            basisPeriod={basisPeriod}
            windowDays={windowDays}
            rollingDays={rollingDays}
            loadingSingle={loadingSingle}
            earningsDates={showEarnings ? earningsDates : []}
            showAxisLabels={showAxisLabels}
          />
        ) : mode === "compare" ? (
          <AttributionCompare
            tickerOptions={tickerOptions}
            universeTickers={filteredUniverseTickers}
            basisMode={basisMode}
            period={basisPeriod}
            windowDays={windowDays}
            rollingDays={rollingDays}
            freq={attrFreq}
            displaySymbol={displaySymbol}
            resolveBasket={resolveBasketFn}
            onOpenSingle={(sym) => { setActiveTicker(sym); setMode("single"); }}
          />
        ) : mode === "basket" ? (
          <div>
            <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center gap-4 flex-wrap">
              <Select value={basketId || undefined} onValueChange={setBasketId}>
                <SelectTrigger className="h-7 text-[11px] w-[240px]" data-testid="attr-basket-select">
                  <SelectValue placeholder="Pick a basket…" />
                </SelectTrigger>
                <SelectContent>
                  {baskets.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name} ({b.tickers.length})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {baskets.length === 0 && <span className="text-[10px] text-muted-foreground">No baskets yet — create one on the Baskets tab.</span>}
              {aggregate && activeBasket && !loadingTable && (
                <div className="flex items-center gap-5 flex-wrap" data-testid="attr-basket-summary">
                  <div>
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Basket (equal-weight, n={aggregate.n})</div>
                    <div className="text-sm font-bold">{activeBasket.name}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Avg Total</div>
                    <div className={`text-sm font-bold ${colorForValue(aggregate.total)}`}>{fmtPct(aggregate.total)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Avg Multiple</div>
                    <div className={`text-sm font-bold ${colorForValue(aggregate.mult)}`}>{fmtPct(aggregate.mult)}</div>
                    <div className="text-[9px] text-muted-foreground">share {fmtShare(aggregate.multShare)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Avg Estimate</div>
                    <div className={`text-sm font-bold ${colorForValue(aggregate.est)}`}>{fmtPct(aggregate.est)}</div>
                    <div className="text-[9px] text-muted-foreground">share {fmtShare(aggregate.estShare)}</div>
                  </div>
                </div>
              )}
            </div>
            {activeBasket ? (
              <TablePanel
                rows={sortedRows}
                sortKey={sortKey}
                sortDir={sortDir}
                handleSort={handleSort}
                loadingTable={loadingTable}
                tableProgress={tableProgress}
                windowDays={windowDays}
              />
            ) : (
              <div className="p-4 text-[11px] text-muted-foreground">Pick a basket to decompose each member's return and see the equal-weight aggregate.</div>
            )}
          </div>
        ) : (
          <div>
            <div className="px-3 py-1.5 border-b border-border bg-muted/10">
              <ClassificationFilters
                filters={classFilters}
                onFiltersChange={setClassFilters}
                search={clfSearch}
                onSearchChange={setClfSearch}
                manualTickers={manualTickers}
                onManualTickersChange={setManualTickers}
                filteredCount={filteredUniverseTickers.length}
                totalCount={filteredTickersList.length}
                testIdPrefix="attr"
                extraFilters={geo.geoFilterUI}
              />
            </div>
            <TablePanel
              rows={sortedRows}
              sortKey={sortKey}
              sortDir={sortDir}
              handleSort={handleSort}
              loadingTable={loadingTable}
              tableProgress={tableProgress}
              windowDays={windowDays}
            />
          </div>
        )}
      </div>
      {showBacktest && alignedView && (
        <AttributionBacktestModal
          aligned={alignedView}
          symbolLabel={activeTickerLabel}
          basisLabel={getBasisDef(resolvedBasis, basisPeriod).label}
          rollingDays={rollingDays}
          freqUnit={attrFreq === "weekly" ? "week" : attrFreq === "monthly" ? "month" : "day"}
          onClose={() => setShowBacktest(false)}
        />
      )}
    </div>
  );
}
