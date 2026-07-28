import { useRef, useEffect, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineSeries,
  BaselineSeries,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
  PriceScaleMode,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time, SeriesMarker } from "lightweight-charts";
import type { PlottedSeries, ChartConfig } from "@/pages/Dashboard";
import { getDates } from "@/lib/dataService";
import { computeMaByType, type MaType } from "@/lib/maEngine";
import {
  computeSMA,
  computeEMA,
  computeHMA,
  computeRSI,
  computeMACD,
  computeMeanAndStdBands,
  computeRollingMeanBands,
  computeHeikinAshi,
  computeHASignals,
  computeBollingerBands,
  computeATR,
  computeVWAP,
  computeROC,
  computeStochastic,
  rollingAutocorrOfSeries,
  computeOBV,
} from "@/lib/indicators";
import type { HASmoothConfig, OhlcBar } from "@/lib/indicators";
import {
  PANE_INDICATORS,
  OVERLAY_INDICATORS,
  getIndicatorDef,
  resolveParams,
  resolveParamList,
  resampleIndicatorBars,
  type RegistryIndicatorState,
} from "@/lib/indicatorRegistry";
import { INDICATOR_COLORS } from "@/lib/chartColors";
import { computeFractalTrendlines, resampleWeekly, resampleMonthly } from "@/lib/fractalTrendlines";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { useIndicatorColors } from "@/lib/indicatorColorsContext";
import { GradientLinePrimitive } from "@/lib/gradientLinePrimitive";
import { attachQuarterShading } from "@/lib/quarterShading";
import { applyTransform } from "@/lib/transforms";
import type { DataTransform } from "@/lib/transforms";
import { Info, Maximize2, Minimize2, Trash2, Rows3, X, EyeOff } from "lucide-react";
import { VerticalLinePrimitive } from "@/lib/verticalLinePrimitive";
import { MeasurePrimitive } from "@/lib/measurePrimitive";
import { IchimokuCloudPrimitive, type CloudPoint } from "@/lib/ichimokuCloudPrimitive";
import { LookbackWindowPrimitive, type LookbackEntry } from "@/lib/lookbackWindowPrimitive";
import { detectTrendlines, TrendlinesPanel as TRENDLINE_CFG } from "@/components/Trendlines";
import { d as detectSRLevels, D as DEFAULT_SR_CFG } from "@/components/SupportResistance";
import { detectChartPatterns, rankRelevance } from "@/lib/detectChartPatterns";
import { getPatternSettings } from "@/lib/patternSettings";
import ExportMenu from "@/components/ExportMenu";

// ── Gradient color helper for color-by-variable ──
// Maps normalised [0,1] → red→yellow→green hex
function gradientColorHex(t: number): string {
  const v = Math.max(0, Math.min(1, t));
  const hue = v * 120; // 0=red, 60=yellow, 120=green
  const s = 0.90, l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else { r = 0; g = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function gradientColorHsl(t: number): string {
  const v = Math.max(0, Math.min(1, t));
  return `hsl(${v * 120}, 90%, 55%)`;
}

// ── Future trading-day generator (skips weekends) for projecting seed lines ──
function generateFutureBars(lastDate: string, count: number): string[] {
  const out: string[] = [];
  const [y, m, d] = lastDate.split("-").map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  while (out.length < count) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const dow = cur.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const yy = cur.getUTCFullYear();
    const mm = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(cur.getUTCDate()).padStart(2, "0");
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
}

/** Chart bars spanned by ONE bar of an indicator computed on weekly/monthly
 *  resampled data — scales lookback-window hover lines so "RSI 14 weekly" on a
 *  daily chart marks ~70 daily bars, not 14. Resampling no-ops when the chart
 *  is already at (or coarser than) the indicator frequency, and on hourly
 *  epoch axes (see resampleIndicatorBars), so those return 1. */
function chartBarsPerIndicatorBar(chartFreq: string | undefined, indFreq: string | undefined): number {
  if (indFreq !== "weekly" && indFreq !== "monthly") return 1;
  const cf = chartFreq ?? "daily";
  if (cf === "daily") return indFreq === "weekly" ? 5 : 21;
  if (cf === "weekly") return indFreq === "monthly" ? 4 : 1;
  return 1;
}

/** Period-style indicator fields accept one period OR a list — multiple
 *  instances of the same indicator (SMA 50 + SMA 200, RSI 14 + RSI 21) render
 *  as one line per period. This normalizes either shape to a clean list. */
export function indicatorPeriods(v: number | number[] | undefined): number[] {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return [v];
  if (Array.isArray(v)) return v.filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0);
  return [];
}

/** Distinct-but-related color for the idx-th instance of one indicator:
 *  base color first, then alternating lighter/darker shades. */
function shadeHex(color: string, idx: number): string {
  if (idx === 0 || !/^#[0-9a-f]{6}$/i.test(color)) return color;
  const v = parseInt(color.slice(1), 16);
  let r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const step = Math.ceil(idx / 2);
  const a = Math.min(0.55, 0.3 * step);
  const t = idx % 2 === 1 ? 255 : 0; // odd instances lighter, even darker
  r = Math.round(r + (t - r) * a);
  g = Math.round(g + (t - g) * a);
  b = Math.round(b + (t - b) * a);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ── Axis-label hiding (toolbar "Labels" toggle) ──
// LWC renders the series TITLE chip on the price axis regardless of
// lastValueVisible, so hiding labels must also blank the title. The original
// is stashed on the series object; every readout builder goes through
// readSeriesTitle so hover values keep their names while labels are hidden.
/** priceLinesOn: true/false forces the dashed current-value line on/off;
 *  undefined leaves the series' own setting untouched (sub-charts use that so
 *  re-showing never forces lines onto series designed without one). */
export function setSeriesAxisLabels(s: any, labelsOn: boolean, priceLinesOn?: boolean): void {
  try {
    const o = s.options();
    if (!labelsOn) {
      if (o.title) s.__labelsOffTitle = o.title;
      s.applyOptions({ title: "", lastValueVisible: false });
    } else {
      const saved = s.__labelsOffTitle;
      s.applyOptions({ lastValueVisible: true, ...(saved ? { title: saved } : {}) });
      delete s.__labelsOffTitle;
    }
    if (priceLinesOn !== undefined) s.applyOptions({ priceLineVisible: priceLinesOn });
  } catch {}
}
export function readSeriesTitle(s: any): string {
  try {
    return s.options().title || s.__labelsOffTitle || "";
  } catch {
    return s?.__labelsOffTitle || "";
  }
}

/** An indicator computed ON another indicator, drawn on top of that
 *  indicator's sub-chart (e.g. EMA of RSI, Bollinger on RSI, StochRSI,
 *  MACD of RSI). `source` is the sub-chart type id (built-in or registry);
 *  `type` is one of the 12 maEngine MA types (lowercase), "bollinger",
 *  "meanband", "stochastic", or "macd". */
export interface IndicatorOverlay {
  id: string;
  source: string;
  type: string;
  /** MA/Bollinger/mean period; Stoch %K period; MACD fast period. */
  period: number;
  /** Bollinger / mean-band σ multiplier. */
  mult?: number;
  /** Stochastic %D smoothing. */
  d?: number;
  /** MACD slow period. */
  slow?: number;
  /** MACD signal period. */
  signal?: number;
  /** Autocorrelation lag (period = trailing window). */
  lag?: number;
}

/** Overlay types that render as their OWN sub-chart pane (indicator-on-
 *  indicator whose value domain differs from the source — MACD/RSI/ROC/
 *  Autocorr of RSI etc.) instead of a squeezed bottom band on the source
 *  pane. Their sub-chart type id is "ovl:<overlay id>". */
export const PANE_OVERLAY_TYPES = new Set(["rsi", "roc", "macd", "autocorr"]);

/** Short display label for a sub-chart type (built-in or registry id). */
export function subChartSourceLabel(type: string): string {
  return type === "rsi" ? "RSI" : type === "roc" ? "ROC" : type === "atr" ? "ATR"
    : type === "stochastic" ? "Stoch" : type === "obv" ? "OBV" : type === "macd" ? "MACD"
    : type === "ha" ? "HA" : (getIndicatorDef(type)?.label ?? type);
}

/** Header/badge label for a pane-overlay ("MACD(12,26,9) on RSI"). */
export function overlayPaneLabel(o: IndicatorOverlay): string {
  const src = subChartSourceLabel(o.source);
  if (o.type === "macd") return `MACD(${o.period},${o.slow ?? 26},${o.signal ?? 9}) on ${src}`;
  if (o.type === "autocorr") return `AC(lag ${Math.max(1, o.lag ?? 1)}, w${o.period}) on ${src}`;
  return `${o.type.toUpperCase()}${o.period} on ${src}`;
}

export interface ActiveIndicators {
  /** Hover lookback-window lines (dashed vline N bars behind the crosshair
   *  per period indicator). Default ON; set false to hide. */
  showLookbackWindow?: boolean;
  /** RSI compute frequency — weekly/monthly resample the closes first
   *  (weekly RSI on a daily chart). Default the chart's own bars. */
  rsiFreq?: "chart" | "weekly" | "monthly";
  // MA overlays: one period or a list (one line per period — see indicatorPeriods).
  sma?: number | number[];
  ema?: number | number[];
  hma?: number | number[];
  // Extended moving-average overlays (periods); toggleable from the Moving
  // Averages section and also driven by the Find Best MA panel.
  wma?: number | number[];
  dema?: number | number[];
  tema?: number | number[];
  kama?: number | number[];
  frama?: number | number[];
  t3?: number | number[];
  alma?: number | number[];
  lsma?: number | number[];
  slsma?: number | number[];
  rsi?: number | number[];       // period(s)
  macd?: boolean;
  /** Mean ± σ bands. bandOpacity drives band-line alpha (default 0.8);
   *  shade (rolling only, default on) fills the ±1σ/±2σ areas. */
  mean?: { rolling: boolean; period: number; bandOpacity?: number; shade?: boolean };
  heikinAshi?: boolean | HASmoothConfig; // true = no smoothing, object = smoothing config
  haSignals?: boolean;
  bollinger?: { period: number; mult: number };
  atr?: number | number[];       // period(s)
  vwap?: boolean;
  roc?: number | number[];       // period(s)
  stochastic?: { kPeriod: number; dPeriod: number };
  obv?: boolean;
  ad?: boolean;
  cmf?: number;       // period
  /** DojiEmoji fractal trendlines. n = fractal period; anchorDate = "as-of" replay date (undefined = latest bar);
   *  timeframe = bar granularity pivots are detected on ("weekly"/"monthly" resample daily bars first; default "daily"). */
  fractalLines?: { n: number; anchorDate?: string; timeframe?: "daily" | "weekly" | "monthly" };
  /** Auto-detected diagonal support/resistance trendlines (pivot-pair RANSAC). */
  autoTrendlines?: boolean;
  /** Auto-detected horizontal support/resistance levels. */
  srLevels?: boolean;
  /** Fibonacci retracement levels from the recent swing. */
  fibLevels?: boolean;
  indicatorOverlays?: IndicatorOverlay[];
  /** Sub-chart types (rsi, roc, registry ids, …) temporarily HIDDEN: the
   *  subplot unmounts (its vertical space is reclaimed) but the indicator's
   *  state stays enabled, so toggling visibility loses nothing. */
  hiddenSubCharts?: string[];
  /** Generic state for registry-driven indicators (see indicatorRegistry.ts),
   *  keyed by indicator id. Each new indicator is one entry here at runtime —
   *  no typed field per indicator. */
  registry?: Record<string, RegistryIndicatorState>;
}

interface Drawing {
  id: string;
  type: "hline" | "trendline" | "freehand";
  color: string;
  // For hline: price level
  price?: number;
  // For trendline / freehand: points
  points?: { time: string; price: number }[];
  seriesRef?: ISeriesApi<any>;
  // Set when drawn in "all panes" mode: the same groupId is shared by the mirror
  // copies on every other pane, so deleting one deletes them all.
  groupId?: string;
}

// A location-only spec for an "all panes" drawing (no chart/series binding).
type DrawSpec = {
  groupId: string;
  type: Drawing["type"];
  color: string;
  price?: number;
  points?: { time: string; price: number }[];
};

// Registry of the "all panes" drawings that currently exist, keyed by groupId and
// shared across every ChartPane (same module). A pane that mounts *after* a drawing
// was made reads this to catch up, so newly-added panes get the drawings too.
// Kept in sync at the create / delete / clear-all choke points below.
const allPanesDrawings = new Map<string, DrawSpec>();

// A right-click "delete on all panes" target: identify the same drawing on every
// pane by its shared group id, or (for lines drawn independently per pane) by its
// geometry — same type at the same price / points, within a small tolerance.
type DeleteSpec = { groupId?: string; type: Drawing["type"]; price?: number; points?: { time: string; price: number }[] };
const priceTol = (p: number) => Math.max(1e-6, Math.abs(p) * 0.005); // ~0.5%
function drawingMatchesSpec(d: Drawing, spec: DeleteSpec): boolean {
  if (spec.groupId && d.groupId === spec.groupId) return true;
  if (d.type !== spec.type) return false;
  if (spec.type === "hline") {
    if (d.price == null || spec.price == null) return false;
    return Math.abs(d.price - spec.price) <= priceTol(spec.price);
  }
  const a = d.points, b = spec.points;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].time !== b[i].time || Math.abs(a[i].price - b[i].price) > priceTol(b[i].price)) return false;
  }
  return true;
}

export interface ChartPaneHandle {
  getChart: () => IChartApi | null;
  fitContent: () => void;
  clearDrawings: () => void;
}

interface ChartPaneProps {
  paneId: number;
  paneLabel: string;
  series: PlottedSeries[];
  ohlcData: any;
  activeTicker: string | null;
  chartConfig: ChartConfig;
  activeIndicators: ActiveIndicators;
  timeRange: string;
  activeTool: string;
  /** Hourly-frequency mode: series use epoch-second times; date-keyed extras
   *  (seeds, annotations, quarter shading) are skipped. */
  intraday?: boolean;
  /** Override for the invisible spacer axis (non-daily frequencies). When set,
   *  the pane's shared time axis uses these times instead of the global daily
   *  date list, keeping logical-range sync aligned across panes. */
  spacerTimes?: (string | number)[] | null;
  drawColor: string;
  /** Measure tool: fill the shaded rectangle (vs. line + box only). */
  measureShade?: boolean;
  /** Measure tool: snap endpoints to the nearest data point (magnet mode). */
  measureMagnet?: boolean;
  /** Measure tool: mirror the measurement across all panes over the same time span. */
  measureAll?: boolean;
  /** "All panes" mode: mirror drawings (hline/trendline/freehand) and fractal
   *  anchoring onto every pane at the same time/price spot. */
  drawAll?: boolean;
  onCrosshairMove?: (data: { time: string; values: Record<string, number> } | null) => void;
  onDrawingAdded?: () => void;
  onDrawingDeleted?: () => void;
  /** Called when the user clicks a candle while the "fractal-anchor" tool is active. */
  onFractalAnchorPick?: (date: string) => void;
  /** Called when the user right-click-deletes a fractal line — turns the indicator off. */
  onDeleteFractal?: () => void;
  /** Right-click "delete on all panes" for fractal lines — turns them off everywhere. */
  onDeleteFractalAll?: () => void;
  /** ✕ on a sub-indicator chart (RSI, ROC, registry, …) — turns that indicator
   *  off for this pane. Omitting it hides the close buttons. */
  onCloseSubIndicator?: (type: string) => void;
  /** Eye on a sub-indicator chart — toggles it into hiddenSubCharts (subplot
   *  unmounts, indicator state preserved). */
  onToggleHideSubIndicator?: (type: string) => void;
  isActive?: boolean;
  onChartReady?: (paneId: number, chart: IChartApi) => void;
  onChartDestroyed?: (paneId: number) => void;
  onSeriesMapUpdate?: (paneId: number, seriesMap: Map<string, ISeriesApi<any>>) => void;
  showQuarterShading?: boolean;
  /** Earnings dates as YYYY-MM-DD strings to mark on charts */
  earningsDates?: string[];
  /** Ex-dividend dates as YYYY-MM-DD strings */
  exDivDates?: string[];
  /** Macro event vertical lines (CPI, NFP, FOMC, GDP) */
  macroEventLines?: { time: string; color: string; label?: string }[];
  /** Fiscal-year boundary lines (first earnings of each year), labeled FY{year} */
  fyBoundaryLines?: { time: string; color: string; label?: string }[];
  /** Color-by-variable: map of time → normalised [0,1] value for gradient coloring */
  colorByData?: Map<string, number> | null;
  /** Name of the color-by metric (for legend display) */
  colorByMetric?: string;
  /** Min/max range of the color-by variable (for legend display) */
  colorByRange?: { min: number; max: number } | null;
  /** Callback to clear color-by for this pane */
  onClearColorBy?: () => void;
}

// Background grid line color by the user's prominence setting. "normal" is a
// touch brighter than the old hardcoded value; "bold" is clearly visible.
export function gridColorFor(prominence?: "off" | "normal" | "bold"): string {
  if (prominence === "off") return "rgba(255,255,255,0)";
  if (prominence === "bold") return "rgba(255,255,255,0.14)";
  return "rgba(255,255,255,0.06)";
}

/** Map a moving-average line-style token to lightweight-charts' LineStyle enum. */
function maLineStyle(token?: string): LineStyle {
  switch (token) {
    case "dashed": return LineStyle.Dashed;
    case "dotted": return LineStyle.Dotted;
    case "largeDashed": return LineStyle.LargeDashed;
    case "sparseDotted": return LineStyle.SparseDotted;
    default: return LineStyle.Solid;
  }
}

/** Canvas dash pattern (px) for an MA line-style token, scaled by width — used by
 *  the gradient primitive so a gradient line keeps its chosen dash pattern. */
function maDashArray(token: string | undefined, w: number): number[] {
  switch (token) {
    case "dashed": return [w * 4, w * 3];
    case "dotted": return [w, w * 2];
    case "largeDashed": return [w * 8, w * 4];
    case "sparseDotted": return [w, w * 5];
    default: return [];
  }
}

/** Apply an alpha (0–1) to a hex or rgb(a) colour, returning an rgba() string.
 *  Undefined/≥1 opacity returns the colour unchanged. */
function withOpacity(color: string, opacity?: number): string {
  if (opacity === undefined || opacity >= 1) return color;
  const a = Math.max(0, opacity);
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(",").map((s) => s.trim());
    const a0 = p[3] !== undefined ? parseFloat(p[3]) : 1;
    return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a0 * a})`;
  }
  return color;
}

// ── Sub-chart for oscillators/indicators (RSI, MACD, HA) rendered below the main chart ──
// Built-in ids plus any registry pane-indicator id (see indicatorRegistry.ts),
// so the union is widened to string.
type SubChartType = "rsi" | "macd" | "ha" | "atr" | "roc" | "stochastic" | "obv" | string;

function SubIndicatorChart({
  type,
  closeData,
  ohlcBars,
  fullDates,
  spacerTimes,
  activeIndicators,
  parentChart,
  baseLabel,
  lookbackEntries,
  axisLabelsVisible = true,
  priceLinesVisible = true,
  isMaximized = false,
  onToggleMaximize,
  onClose,
  onHide,
  height,
  onResizeStart,
  gridColor,
  frequency,
  overlayDef,
  sourceData,
  onPrimaryData,
}: {
  type: SubChartType;
  closeData: { time: string; value: number }[];
  /** Raw price OHLC bars for the active ticker — used by registry pane
   *  indicators (ADX, CCI, …) that need real high/low, not close-only. */
  ohlcBars: OhlcBar[];
  /** Global trading-date axis — used for the invisible spacer so the sub-chart
   *  shares identical logical indices with the parent pane (see below). */
  fullDates: string[];
  /** Non-daily frequency axis (weekly/monthly period-end dates or hourly epoch
   *  seconds). When set, the spacer MUST use it instead of the daily fullDates —
   *  the parent pane's spacer does (see the spacerSeriesRef effect), and the
   *  logical-range sync copies raw indices, so a daily spacer here would map
   *  the parent's window onto a completely different date span. */
  spacerTimes?: (string | number)[] | null;
  activeIndicators: ActiveIndicators;
  parentChart: IChartApi | null;
  baseLabel: string;
  /** Hover lookback-window lines drawn on THIS sub-chart (e.g. autocorr's
   *  window over RSI values renders on the RSI sub-chart, not the price
   *  chart). Undefined = no lines here. */
  lookbackEntries?: LookbackEntry[];
  /** Toolbar "Labels" toggle — false hides the right-axis badges here too. */
  axisLabelsVisible?: boolean;
  /** Toolbar "Px line" toggle — false hides the current-value lines here too. */
  priceLinesVisible?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  /** Remove this indicator from the pane (the ✕ button in the header). */
  onClose?: () => void;
  /** Temporarily hide this subplot (state kept — see hiddenSubCharts). */
  onHide?: () => void;
  height?: number;
  onResizeStart?: (defaultH: number, e: React.MouseEvent) => void;
  gridColor: string;
  /** Pane bar frequency ("hourly"|"daily"|"weekly"|"monthly") — drives
   *  frequency-specific registry param defaults. */
  frequency?: string;
  /** Set when type = "ovl:<id>": this pane renders the overlay indicator
   *  (MACD/RSI/ROC/Autocorr) computed ON `sourceData`. */
  overlayDef?: IndicatorOverlay | null;
  /** The source sub-chart's primary displayed series (published upward via
   *  onPrimaryData by the source pane). */
  sourceData?: { time: Time; value: number }[];
  /** Non-ovl panes publish their first plotted series here so derived
   *  overlay panes can compute from exactly what's displayed. */
  onPrimaryData?: (type: string, data: { time: Time; value: number }[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const syncingRef = useRef(false);
  const { colors: IC } = useIndicatorColors();

  // Create chart + populate data (recreated when deps change)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || closeData.length === 0) return;

    // Destroy old chart
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch {}
      chartRef.current = null;
    }

    const rect = el.getBoundingClientRect();
    const chart = createChart(el, {
      width: rect.width || 300,
      height: rect.height || 80,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7a8a9e",
        fontSize: 10,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(125, 211, 252, 0.9)", width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: "#0ea5e9" },
        horzLine: { color: "rgba(125, 211, 252, 0.9)", width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: "#0ea5e9" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)", minimumWidth: 70 },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        visible: false,
        rightOffset: 5,
        barSpacing: 3,
        // Match the parent pane: hourly axes need sub-pixel bar spacing or the
        // logical-range sync clamps this sub-chart short of the parent's window.
        minBarSpacing: frequency === "hourly" ? 0.05 : 1,
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;
    let firstSubSeries: any = null;
    // Collect all named series in this sub-chart for value extraction
    const subSeriesList: any[] = [];

    // Invisible spacer spanning the full global date axis — identical to the one
    // the main panes carry (see the `spacerSeriesRef` effect below). Without it,
    // this sub-chart's logical index 0 would be its first indicator bar (RSI is
    // trimmed by its warmup period, ~14 bars in), so the logical-range sync with
    // the parent (see "Sync time scale with parent" below) would slide the
    // oscillator horizontally off the price bars it is derived from. Giving the
    // sub-chart the same full-axis spacer makes logical index i map to the same
    // date here as in the parent, so RSI/MACD/etc. stay aligned by date.
    const axisTimes: (string | number)[] = spacerTimes?.length ? spacerTimes : fullDates;
    if (axisTimes.length > 0) {
      try {
        const spacer = chart.addSeries(LineSeries, {
          visible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => null,
        });
        spacer.setData(axisTimes.map((t) => ({ time: t as unknown as Time })));
      } catch {}
    }

    // ── Derived overlay pane: MACD/RSI/ROC/Autocorr computed ON another
    // indicator's displayed series (type = "ovl:<id>"). Renders exactly like
    // a built-in sub-chart — own axis, reference lines, readout titles.
    if (type.startsWith("ovl:") && overlayDef) {
      const o = overlayDef;
      const src = (sourceData ?? []).filter((d) => typeof d.value === "number" && Number.isFinite(d.value));
      if (src.length > 5) {
        const srcLabel = subChartSourceLabel(o.source);
        const addL = (
          data: { time: any; value: number }[],
          title: string,
          color: string,
          opts: Record<string, unknown> = {},
        ) => {
          if (!data?.length) return null;
          const s = chart.addSeries(LineSeries, {
            color, lineWidth: 1, title,
            priceLineVisible: false,
            ...opts,
          });
          s.setData(data);
          if (title) subSeriesList.push(s);
          if (!firstSubSeries && title) firstSubSeries = s;
          return s;
        };
        const dotted = (points: { time: any; value: number }[], color = "rgba(255,255,255,0.15)") =>
          addL(points, "", color, { lineStyle: LineStyle.Dotted, crosshairMarkerVisible: false, lastValueVisible: false });
        const refSpan = (data: { time: any; value: number }[], lvl: number, color?: string) => {
          if (data.length >= 2) dotted([{ time: data[0].time, value: lvl }, { time: data[data.length - 1].time, value: lvl }], color);
        };
        try {
          if (o.type === "macd") {
            const mc = computeMACD(src as any, o.period, o.slow ?? 26, o.signal ?? 9);
            if (mc.histogram.length > 0) {
              const hist = chart.addSeries(HistogramSeries, {
                title: "", base: 0, lastValueVisible: false, priceLineVisible: false,
              });
              hist.setData(mc.histogram.map((d) => ({
                time: d.time as Time,
                value: d.value,
                color: d.value >= 0 ? (IC as any).macd_histogram_pos ?? "#22c55e" : (IC as any).macd_histogram_neg ?? "#ef4444",
              })));
            }
            addL(mc.macdLine, `MACD on ${srcLabel}`, IC.macd_line);
            addL(mc.signalLine, `Signal`, IC.macd_signal, { crosshairMarkerVisible: false });
            refSpan(mc.macdLine, 0);
          } else if (o.type === "rsi") {
            const rs = computeRSI(src as any, o.period);
            addL(rs, `RSI${o.period} on ${srcLabel}`, IC.rsi_line);
            refSpan(rs, 70, IC.rsi_overbought);
            refSpan(rs, 30, IC.rsi_oversold);
          } else if (o.type === "roc") {
            const rc = computeROC(src as any, o.period);
            addL(rc, `ROC${o.period} on ${srcLabel}`, IC.roc);
            refSpan(rc, 0);
          } else if (o.type === "autocorr") {
            const lag = Math.max(1, o.lag ?? 1);
            const ac = rollingAutocorrOfSeries(src as any, lag, o.period);
            addL(ac, `AC(lag ${lag}, w${o.period}) on ${srcLabel}`, (IC as any).autocorr_line ?? "#e879f9");
            const th = 1.96 / Math.sqrt(Math.max(1, o.period - lag));
            refSpan(ac, 0);
            refSpan(ac, th);
            refSpan(ac, -th);
          }
          chart.timeScale().fitContent();
        } catch {}
      }
    }

    const rsiPeriods = indicatorPeriods(activeIndicators.rsi);
    if (type === "rsi" && rsiPeriods.length > 0) {
      // Optional weekly/monthly compute frequency: resample closes first so a
      // daily chart can show a weekly RSI (points on period-end dates).
      const rsiFreq = activeIndicators.rsiFreq;
      const rsiInput =
        rsiFreq === "weekly" || rsiFreq === "monthly"
          ? resampleIndicatorBars(
              closeData.map((d: any) => ({ time: String(d.time), open: d.value, high: d.value, low: d.value, close: d.value })),
              rsiFreq,
            ).map((b) => ({ time: b.time as unknown as Time, value: b.close }))
          : closeData;
      // One RSI line per period (shaded variants of the RSI color).
      let rsiData: { time: Time; value: number }[] = [];
      rsiPeriods.forEach((p, pi) => {
        const data = computeRSI(rsiInput as typeof closeData, p);
        if (!data.length) return;
        const rsiLine = chart.addSeries(LineSeries, {
          color: shadeHex(IC.rsi_line, pi),
          lineWidth: 1,
          title: `RSI ${p}${rsiFreq === "weekly" ? "W" : rsiFreq === "monthly" ? "M" : ""}${baseLabel}`,
        });
        rsiLine.setData(data);
        subSeriesList.push(rsiLine);
        if (!firstSubSeries) firstSubSeries = rsiLine;
        if (!rsiData.length) rsiData = data as any;
      });
      if (rsiData.length > 0) {
        // Overbought/oversold reference lines
        const first = rsiData[0].time;
        const last = rsiData[rsiData.length - 1].time;
        for (const [level, color] of [
          [70, IC.rsi_overbought],
          [30, IC.rsi_oversold],
        ] as [number, string][]) {
          const ref = chart.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: "",
            crosshairMarkerVisible: false,
          });
          ref.setData([{ time: first, value: level }, { time: last, value: level }]);
        }
        chart.timeScale().fitContent();
      }
    }

    if (type === "macd" && activeIndicators.macd) {
      const macd = computeMACD(closeData, 12, 26, 9);
      if (macd.macdLine.length > 0) {
        // Histogram first so the MACD/signal lines draw on top of the bars.
        if (macd.histogram.length > 0) {
          const hist = chart.addSeries(HistogramSeries, {
            title: "",
            base: 0,
            lastValueVisible: false,
            priceLineVisible: false,
          });
          hist.setData(macd.histogram.map((d) => ({
            time: d.time as Time,
            value: d.value,
            color: d.value >= 0 ? (IC as any).macd_histogram_pos ?? "#22c55e" : (IC as any).macd_histogram_neg ?? "#ef4444",
          })));
        }
        const ml = chart.addSeries(LineSeries, {
          color: IC.macd_line,
          lineWidth: 1,
          title: `MACD${baseLabel}`,
        });
        ml.setData(macd.macdLine);
        subSeriesList.push(ml);
        if (!firstSubSeries) firstSubSeries = ml;

        const sl = chart.addSeries(LineSeries, {
          color: IC.macd_signal,
          lineWidth: 1,
          title: "Signal",
          crosshairMarkerVisible: false,
        });
        sl.setData(macd.signalLine);
        subSeriesList.push(sl);

        if (macd.macdLine.length >= 2) {
          const zl = chart.addSeries(LineSeries, {
            color: "rgba(255,255,255,0.15)",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: "",
            crosshairMarkerVisible: false,
          });
          zl.setData([
            { time: macd.macdLine[0].time, value: 0 },
            { time: macd.macdLine[macd.macdLine.length - 1].time, value: 0 },
          ]);
        }
        chart.timeScale().fitContent();
      }
    }

    if (type === "ha" && activeIndicators.heikinAshi) {
      const haSmoothing: HASmoothConfig | undefined =
        typeof activeIndicators.heikinAshi === "object" ? activeIndicators.heikinAshi : undefined;
      const haCandles = computeHeikinAshi(closeData, haSmoothing);
      if (haCandles.length > 0) {
        const haSeries = chart.addSeries(CandlestickSeries, {
          upColor: IC.ha_up,
          downColor: IC.ha_down,
          borderUpColor: IC.ha_up,
          borderDownColor: IC.ha_down,
          wickUpColor: IC.ha_up,
          wickDownColor: IC.ha_down,
          title: `HA${baseLabel}`,
        });
        haSeries.setData(
          haCandles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }))
        );
        subSeriesList.push(haSeries);
        if (!firstSubSeries) firstSubSeries = haSeries;
        chart.timeScale().fitContent();
      }
    }

    // ── ATR (one line per period) ──
    if (type === "atr") {
      indicatorPeriods(activeIndicators.atr).forEach((p, pi) => {
        const atrData = computeATR(closeData, p);
        if (!atrData.length) return;
        const atrLine = chart.addSeries(LineSeries, {
          color: shadeHex(IC.atr, pi),
          lineWidth: 1,
          title: `ATR ${p}${baseLabel}`,
        });
        atrLine.setData(atrData);
        subSeriesList.push(atrLine);
        if (!firstSubSeries) firstSubSeries = atrLine;
        chart.timeScale().fitContent();
      });
    }

    // ── ROC (one line per period) ──
    if (type === "roc" && indicatorPeriods(activeIndicators.roc).length > 0) {
      let rocData: { time: Time; value: number }[] = [];
      indicatorPeriods(activeIndicators.roc).forEach((p, pi) => {
        const data = computeROC(closeData, p);
        if (!data.length) return;
        const rocLine = chart.addSeries(LineSeries, {
          color: shadeHex(IC.roc, pi),
          lineWidth: 1,
          title: `ROC ${p}${baseLabel}`,
        });
        rocLine.setData(data);
        subSeriesList.push(rocLine);
        if (!firstSubSeries) firstSubSeries = rocLine;
        if (!rocData.length) rocData = data as any;
      });
      if (rocData.length > 0) {
        // Zero line
        if (rocData.length >= 2) {
          const zl = chart.addSeries(LineSeries, {
            color: "rgba(255,255,255,0.15)",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: "",
            crosshairMarkerVisible: false,
          });
          zl.setData([
            { time: rocData[0].time, value: 0 },
            { time: rocData[rocData.length - 1].time, value: 0 },
          ]);
        }
        chart.timeScale().fitContent();
      }
    }

    // ── Stochastic ──
    if (type === "stochastic" && activeIndicators.stochastic) {
      const { kPeriod, dPeriod } = activeIndicators.stochastic;
      const stoch = computeStochastic(closeData, kPeriod, dPeriod);
      if (stoch.k.length > 0) {
        const kLine = chart.addSeries(LineSeries, {
          color: IC.stoch_k,
          lineWidth: 1,
          title: `%K(${kPeriod})${baseLabel}`,
        });
        kLine.setData(stoch.k);
        subSeriesList.push(kLine);
        if (!firstSubSeries) firstSubSeries = kLine;

        if (stoch.d.length > 0) {
          const dLine = chart.addSeries(LineSeries, {
            color: IC.stoch_d,
            lineWidth: 1,
            title: `%D(${dPeriod})`,
            crosshairMarkerVisible: false,
          });
          dLine.setData(stoch.d);
          subSeriesList.push(dLine);
        }

        // Overbought/Oversold reference lines
        const first = stoch.k[0].time;
        const last = stoch.k[stoch.k.length - 1].time;
        for (const [level, color] of [
          [80, IC.stoch_overbought],
          [20, IC.stoch_oversold],
        ] as [number, string][]) {
          const ref = chart.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: "",
            crosshairMarkerVisible: false,
          });
          ref.setData([{ time: first, value: level }, { time: last, value: level }]);
        }
        chart.timeScale().fitContent();
      }
    }

    // ── OBV ──
    if (type === "obv" && activeIndicators.obv) {
      const obvData = computeOBV(closeData);
      if (obvData.length > 0) {
        const obvLine = chart.addSeries(LineSeries, {
          color: IC.obv,
          lineWidth: 1,
          title: `OBV${baseLabel}`,
        });
        obvLine.setData(obvData);
        subSeriesList.push(obvLine);
        if (!firstSubSeries) firstSubSeries = obvLine;
        chart.timeScale().fitContent();
      }
    }

    // ── Registry-driven pane indicators (ADX, CCI, Williams %R, Aroon, …) ──
    // Any sub-chart whose `type` is a registry id renders here generically:
    // compute on real OHLC, draw its series, add reference lines. No per-
    // indicator branch — the descriptor's renderPane does the work.
    const regDef = getIndicatorDef(type);
    // Close-only indicators still work on panes without real OHLC (ratios,
    // derived series) via synthesized o=h=l=c bars from the primary series.
    let regBars: OhlcBar[] =
      ohlcBars.length > 0
        ? ohlcBars
        : regDef?.worksOnCloseOnly
          ? closeData.map((d) => ({ time: d.time, open: d.value, high: d.value, low: d.value, close: d.value }))
          : [];
    if (regDef?.renderPane && regBars.length > 0) {
      // Per-indicator compute frequency: resample to weekly/monthly bars first.
      const regFreq = activeIndicators.registry?.[type]?.freq;
      if (regFreq === "weekly" || regFreq === "monthly") {
        regBars = resampleIndicatorBars(regBars, regFreq);
      }
      const params = resolveParams(regDef, activeIndicators.registry?.[type], frequency);
      const drawRefLine = (level: number, color: string, first: unknown, last: unknown) => {
        const ref = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          title: "",
          crosshairMarkerVisible: false,
        });
        ref.setData([
          { time: first as Time, value: level },
          { time: last as Time, value: level },
        ]);
      };
      // Multi-instance param (e.g. autocorr lag list): render once per value —
      // extra instances get shaded line colors and skip the reference lines.
      const instValues: (number | null)[] = regDef.multiInstanceParam
        ? resolveParamList(regDef, activeIndicators.registry?.[type], frequency, regDef.multiInstanceParam)
        : [null];
      instValues.forEach((iv, ii) => {
        const p2 = iv === null ? params : { ...params, [regDef.multiInstanceParam!]: iv };
        const lineKey = regDef.colorKeys[0];
        const colors =
          ii === 0
            ? (IC as unknown as Record<string, string>)
            : { ...(IC as unknown as Record<string, string>), [lineKey]: shadeHex((IC as Record<string, string>)[lineKey], ii) };
        regDef.renderPane!(
          {
            chart,
            colors,
            baseLabel,
            register: (s) => {
              subSeriesList.push(s);
              if (!firstSubSeries) firstSubSeries = s;
            },
            refLine: ii === 0 ? drawRefLine : () => {},
          },
          regBars,
          p2,
        );
      });
      chart.timeScale().fitContent();
    }

    // ── Indicator-on-indicator overlays (EMA of RSI, Bollinger on RSI,
    // StochRSI, MACD of RSI, …). Source values come straight from the first
    // plotted series, so this works identically for built-in AND registry
    // sub-charts. MACD gets its own hidden bottom-band scale — its values
    // live near 0, not on the source's scale.
    // (MACD/RSI/ROC/Autocorr overlays render as their OWN panes — see the
    // "ovl:" branch above — so only same-domain overlays stay in-pane here.)
    const paneOverlays = (activeIndicators.indicatorOverlays ?? []).filter(
      (o) => o.source === type && !PANE_OVERLAY_TYPES.has(o.type),
    );
    if (paneOverlays.length > 0 && firstSubSeries) {
      let srcData: { time: Time; value: number }[] = [];
      try {
        srcData = ((firstSubSeries as ISeriesApi<any>).data() as any[])
          .map((d) => ({ time: d.time, value: typeof d.value === "number" ? d.value : d.close }))
          .filter((d) => typeof d.value === "number" && Number.isFinite(d.value));
      } catch {}
      if (srcData.length > 5) {
        const OVERLAY_PALETTE = ["#38bdf8", "#f472b6", "#facc15", "#4ade80", "#c084fc", "#fb923c"];
        const srcLabel = type === "rsi" ? "RSI" : type === "roc" ? "ROC" : type === "atr" ? "ATR"
          : type === "stochastic" ? "Stoch" : type === "obv" ? "OBV" : type === "macd" ? "MACD"
          : type === "ha" ? "HA" : (getIndicatorDef(type)?.label ?? type);
        paneOverlays.forEach((o, oi) => {
          const color = OVERLAY_PALETTE[oi % OVERLAY_PALETTE.length];
          const addLine = (data: { time: any; value: number }[], title: string, opts: Record<string, unknown> = {}) => {
            if (!data?.length) return null;
            const s = chart.addSeries(LineSeries, {
              color, lineWidth: 1, title,
              priceLineVisible: false, lastValueVisible: false,
              ...opts,
            });
            s.setData(data);
            subSeriesList.push(s);
            return s;
          };
          try {
            if (o.type === "bollinger") {
              const bb = computeBollingerBands(srcData as any, o.period, o.mult ?? 2);
              addLine(bb.basis, `BB${o.period} on ${srcLabel}`);
              addLine(bb.upper, "", { lineStyle: LineStyle.Dotted });
              addLine(bb.lower, "", { lineStyle: LineStyle.Dotted });
            } else if (o.type === "meanband") {
              const rb = computeRollingMeanBands(srcData as any, o.period);
              addLine(rb.mean, `Mean${o.period} on ${srcLabel}`, { lineStyle: LineStyle.LargeDashed });
              const maxMult = o.mult ?? 2;
              for (const b of rb.bands) {
                if (Math.abs(b.mult) <= maxMult) addLine(b.data, "", { lineStyle: LineStyle.Dotted });
              }
            } else if (o.type === "stochastic") {
              const so = computeStochastic(srcData as any, o.period, o.d ?? 3);
              addLine(so.k, `Stoch${o.period} on ${srcLabel}`);
              addLine(so.d, "", { lineStyle: LineStyle.Dotted });
            } else if (o.type === "macd") {
              const mc = computeMACD(srcData as any, o.period, o.slow ?? 26, o.signal ?? 9);
              const scaleId = `ovl-macd-${o.id}`;
              if (mc.histogram.length > 0) {
                const hist = chart.addSeries(HistogramSeries, {
                  title: "", base: 0, lastValueVisible: false, priceLineVisible: false,
                  priceScaleId: scaleId,
                });
                hist.setData(mc.histogram.map((d) => ({
                  time: d.time as Time,
                  value: d.value,
                  color: d.value >= 0 ? (IC as any).macd_histogram_pos ?? "#22c55e" : (IC as any).macd_histogram_neg ?? "#ef4444",
                })));
              }
              const m1 = addLine(mc.macdLine, `MACD on ${srcLabel}`, { priceScaleId: scaleId });
              addLine(mc.signalLine, "", { priceScaleId: scaleId, lineStyle: LineStyle.Dotted });
              try {
                m1?.priceScale().applyOptions({ scaleMargins: { top: 0.7, bottom: 0.02 }, visible: false });
              } catch {}
            } else if (o.type === "roc") {
              // ROC of the indicator — percent around 0, own hidden bottom
              // band with a zero reference line.
              const rc = computeROC(srcData as any, o.period);
              const scaleId = `ovl-roc-${o.id}`;
              const line = addLine(rc, `ROC${o.period} on ${srcLabel}`, { priceScaleId: scaleId });
              if (rc.length >= 2) {
                addLine(
                  [{ time: rc[0].time, value: 0 }, { time: rc[rc.length - 1].time, value: 0 }],
                  "",
                  { priceScaleId: scaleId, lineStyle: LineStyle.Dotted },
                );
              }
              try {
                line?.priceScale().applyOptions({ scaleMargins: { top: 0.68, bottom: 0.02 }, visible: false });
              } catch {}
            } else if (o.type === "autocorr") {
              // Rolling autocorrelation OF the indicator itself (e.g. AC of
              // RSI on the RSI pane). Own hidden bottom scale with a zero
              // line and the ±1.96/√(window−lag) white-noise band.
              const lag = Math.max(1, o.lag ?? 1);
              const ac = rollingAutocorrOfSeries(srcData as any, lag, o.period);
              const scaleId = `ovl-ac-${o.id}`;
              const line = addLine(ac, `AC(lag ${lag}, w${o.period}) on ${srcLabel}`, { priceScaleId: scaleId });
              if (ac.length >= 2) {
                const th = 1.96 / Math.sqrt(Math.max(1, o.period - lag));
                for (const lvl of [0, th, -th]) {
                  addLine(
                    [{ time: ac[0].time, value: lvl }, { time: ac[ac.length - 1].time, value: lvl }],
                    "",
                    { priceScaleId: scaleId, lineStyle: LineStyle.Dotted },
                  );
                }
              }
              try {
                line?.priceScale().applyOptions({ scaleMargins: { top: 0.68, bottom: 0.02 }, visible: false });
              } catch {}
            } else if (o.type === "rsi") {
              // RSI of the indicator (e.g. RSI on % from MA). Own hidden
              // bottom-band scale — the source pane usually isn't 0–100 —
              // with 30/70 overbought/oversold reference lines.
              const rs = computeRSI(srcData as any, o.period);
              const scaleId = `ovl-rsi-${o.id}`;
              const line = addLine(rs, `RSI${o.period} on ${srcLabel}`, { priceScaleId: scaleId });
              if (rs.length >= 2) {
                for (const lvl of [70, 30]) {
                  addLine(
                    [{ time: rs[0].time, value: lvl }, { time: rs[rs.length - 1].time, value: lvl }],
                    "",
                    { priceScaleId: scaleId, lineStyle: LineStyle.Dotted },
                  );
                }
              }
              try {
                line?.priceScale().applyOptions({ scaleMargins: { top: 0.68, bottom: 0.02 }, visible: false });
              } catch {}
            } else {
              // One of the 12 maEngine moving averages (lowercase type id).
              const vals = srcData.map((d) => d.value);
              const ma = computeMaByType(vals, o.period, o.type.toUpperCase() as MaType);
              const data = srcData
                .map((d, i) => ({ time: d.time, value: ma[i] as number }))
                .filter((d) => typeof d.value === "number" && Number.isFinite(d.value));
              addLine(data, `${o.type.toUpperCase()}${o.period} on ${srcLabel}`);
            }
          } catch {}
        });
      }
    }

    // Toolbar "Labels"/"Px line" toggles — strip the axis badges/title chips
    // and current-value lines from every sub-chart series too. Only the OFF
    // state is applied here; toggling back on recreates this chart with the
    // original options (both flags are in this effect's deps).
    if (!axisLabelsVisible || !priceLinesVisible) {
      for (const s of subSeriesList) {
        setSeriesAxisLabels(s, axisLabelsVisible, priceLinesVisible ? undefined : false);
      }
    }

    // Hover lookback-window lines on this sub-chart (see lookbackEntries prop).
    let lbPrim: LookbackWindowPrimitive | null = null;
    if (lookbackEntries?.length && firstSubSeries) {
      try {
        lbPrim = new LookbackWindowPrimitive();
        (firstSubSeries as unknown as { attachPrimitive: (p: unknown) => void }).attachPrimitive(lbPrim);
        lbPrim.setEntries(lookbackEntries);
      } catch {}
    }
    // Hover from this sub-chart itself (fires for real pointer moves AND for
    // the parent-mirrored programmatic sets — both carry param.logical).
    if (lbPrim) {
      chart.subscribeCrosshairMove((param: any) => {
        lbPrim!.setHover(typeof param.logical === "number" ? param.logical : null);
      });
    }

    // Sync time scale with parent
    if (parentChart) {
      const syncToSub = (range: any) => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        try { chart.timeScale().setVisibleLogicalRange(range); } catch {}
        syncingRef.current = false;
      };
      const syncToParent = (range: any) => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        try { parentChart.timeScale().setVisibleLogicalRange(range); } catch {}
        syncingRef.current = false;
      };

      parentChart.timeScale().subscribeVisibleLogicalRangeChange(syncToSub);
      chart.timeScale().subscribeVisibleLogicalRangeChange(syncToParent);

      // Sync price scale width so plot areas align vertically
      const syncPriceScaleWidth = () => {
        try {
          const parentWidth = parentChart.priceScale("right").width();
          if (parentWidth > 0) {
            chart.applyOptions({ rightPriceScale: { minimumWidth: parentWidth } });
          }
        } catch {}
      };
      syncPriceScaleWidth();
      // Re-sync whenever the parent chart resizes (which may change price scale width)
      const parentSizeHandler = () => { requestAnimationFrame(syncPriceScaleWidth); };
      (parentChart as any).subscribeSizeChange?.(parentSizeHandler);

      // Initial sync
      try {
        const range = parentChart.timeScale().getVisibleLogicalRange();
        if (range) chart.timeScale().setVisibleLogicalRange(range);
      } catch {}

      // Crosshair sync: bidirectional between parent and sub-chart
      if (firstSubSeries) {
        // Helper: extract values from sub-chart series at a given time
        const extractSubValues = (time: any): Record<string, number> => {
          const values: Record<string, number> = {};
          const ts = chart.timeScale();
          try {
            const x = ts.timeToCoordinate(time);
            if (x == null) return values;
            const logical = ts.coordinateToLogical(x);
            if (logical == null) return values;
            const idx = Math.round(logical);
            for (const series of subSeriesList) {
              try {
                const d = (series as any).dataByIndex(idx);
                if (!d) continue;
                const title = readSeriesTitle(series);
                if (!title) continue;
                if ("value" in d && d.value != null) {
                  values[title] = d.value;
                } else if ("close" in d && d.close != null) {
                  values[title] = d.close;
                }
              } catch {}
            }
          } catch {}
          return values;
        };

        // Parent → sub: when the parent crosshair moves, mirror it on the sub-chart
        // and also dispatch sub-chart values upward for the crosshair readout
        const handleParentCrosshair = (param: any) => {
          // Parent and sub share one spacer axis, so the parent's logical index
          // is valid here directly — drive the lookback lines from it even when
          // the mirrored setCrosshairPosition below doesn't echo a logical.
          lbPrim?.setHover(typeof param.logical === "number" ? param.logical : null);
          if (syncingRef.current) return;
          syncingRef.current = true;
          try {
            if (param.time && firstSubSeries) {
              chart.setCrosshairPosition(NaN, param.time, firstSubSeries);
              // Extract and dispatch sub-chart values to the parent
              const container = el.parentElement;
              if (container) {
                const values = extractSubValues(param.time);
                container.dispatchEvent(new CustomEvent("sub-crosshair-move", {
                  detail: { time: param.time, values, fromParent: true },
                  bubbles: true,
                }));
              }
            } else {
              chart.clearCrosshairPosition();
              const container = el.parentElement;
              if (container) {
                container.dispatchEvent(new CustomEvent("sub-crosshair-move", {
                  detail: { time: null, values: {}, fromParent: true },
                  bubbles: true,
                }));
              }
            }
          } catch {}
          syncingRef.current = false;
        };
        parentChart.subscribeCrosshairMove(handleParentCrosshair);

        // Sub → parent: when the sub-chart crosshair moves, mirror it on the parent.
        // This lets hovering over the ROC/RSI/etc. sub-chart sync the main chart's
        // crosshair (and in turn cascade to all other panes via ChartArea sync).
        // We fire a custom event on the ChartPane wrapper which the parent listens for.
        // Include series values so the parent can show them in the crosshair readout.
        chart.subscribeCrosshairMove((param: any) => {
          if (syncingRef.current) return;
          // Only REAL pointer interaction on the sub-chart propagates upward.
          // Programmatic mirrors (parent → sub via setCrosshairPosition) fire
          // this callback asynchronously — after syncingRef is already false —
          // and would re-set the parent's crosshair at price NaN, wiping the
          // horizontal line under the user's cursor between mouse moves (the
          // "flickering horizontal crosshair" bug). sourceEvent is only present
          // for genuine mouse/touch moves.
          if (!param.sourceEvent) return;
          syncingRef.current = true;
          try {
            const container = el.parentElement; // the ChartPane wrapper
            if (param.time && param.seriesData) {
              // Extract values from all sub-chart series
              const values: Record<string, number> = {};
              param.seriesData.forEach((data: any, series: any) => {
                const title = readSeriesTitle(series);
                if (!title) return; // skip reference lines (empty title)
                if ("value" in data && data.value != null) {
                  values[title] = data.value;
                } else if ("close" in data && data.close != null) {
                  values[title] = data.close;
                }
              });
              if (container) {
                container.dispatchEvent(new CustomEvent("sub-crosshair-move", {
                  detail: { time: param.time, values },
                  bubbles: true,
                }));
              }
            } else {
              if (container) {
                container.dispatchEvent(new CustomEvent("sub-crosshair-move", {
                  detail: { time: null, values: {} },
                  bubbles: true,
                }));
              }
            }
          } catch {}
          syncingRef.current = false;
        });
      }
    }

    // Publish this pane's primary displayed series so derived overlay panes
    // (autocorr/MACD/... ON this indicator) compute from exactly what's shown.
    if (onPrimaryData && !type.startsWith("ovl:")) {
      try {
        const d = firstSubSeries
          ? ((firstSubSeries as ISeriesApi<any>).data() as any[])
              .map((p) => ({ time: p.time, value: typeof p.value === "number" ? p.value : p.close }))
              .filter((p) => typeof p.value === "number" && Number.isFinite(p.value))
          : [];
        onPrimaryData(type, d);
      } catch {}
    }

    return () => {
      chartRef.current = null;
      try { chart.remove(); } catch {}
    };
  }, [closeData, ohlcBars, fullDates, spacerTimes, activeIndicators, type, baseLabel, lookbackEntries, axisLabelsVisible, priceLinesVisible, parentChart, IC, gridColor, frequency, overlayDef, sourceData, onPrimaryData]);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    const chart = chartRef.current;
    if (!el || !chart) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) chart.applyOptions({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  const label = type.startsWith("ovl:") && overlayDef ? overlayPaneLabel(overlayDef)
    : type === "rsi" ? "RSI" : type === "macd" ? "MACD" : type === "ha" ? "Heikin-Ashi"
    : type === "atr" ? "ATR" : type === "roc" ? "ROC" : type === "stochastic" ? "Stochastic"
    : type === "obv" ? "OBV" : (getIndicatorDef(type)?.label ?? type);

  return (
    <div
      // Strong top rule + faint tint so each subplot's start/end reads at a
      // glance when several stack under the price chart.
      className={`relative w-full border-t-2 border-border/80 bg-white/[0.015] ${isMaximized ? "flex-1 min-h-0" : "flex-shrink-0"}`}
      style={isMaximized ? undefined : { height: height ?? (type === "ha" ? 100 : 80) }}
      onDoubleClick={(e) => { e.stopPropagation(); onToggleMaximize?.(); }}
      data-testid={`sub-indicator-${type}`}
    >
      {/* Drag the top border to resize this subplot (hidden while expanded). */}
      {!isMaximized && onResizeStart && (
        <div
          className="absolute -top-1 left-0 right-0 h-2 z-20 group"
          style={{ cursor: "row-resize" }}
          onMouseDown={(e) => onResizeStart(type === "ha" ? 100 : 80, e)}
          data-testid={`sub-indicator-${type}-resize`}
        >
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-transparent group-hover:bg-primary/60 transition-colors" />
        </div>
      )}
      <div className="absolute left-2 z-10 mt-0.5">
        <span className="text-[9px] font-mono text-muted-foreground/80 bg-background/90 border border-border/50 px-1 py-0.5 rounded">
          {label}
        </span>
      </div>
      <div className="absolute right-1.5 top-0.5 z-10 flex items-center gap-0.5">
        {onToggleMaximize && (
          <button
            className="text-muted-foreground/50 hover:text-foreground bg-background/80 rounded p-0.5"
            onClick={(e) => { e.stopPropagation(); onToggleMaximize(); }}
            title={isMaximized ? "Restore" : "Expand full pane"}
            data-testid={`sub-indicator-${type}-maximize`}
          >
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        )}
        {onHide && (
          <button
            className="text-muted-foreground/50 hover:text-foreground bg-background/80 rounded p-0.5"
            onClick={(e) => { e.stopPropagation(); onHide(); }}
            title={`Hide ${label} (keeps its settings — bring it back from the sidebar's Current Layout)`}
            data-testid={`sub-indicator-${type}-hide`}
          >
            <EyeOff className="w-3 h-3" />
          </button>
        )}
        {onClose && (
          <button
            className="text-muted-foreground/50 hover:text-destructive bg-background/80 rounded p-0.5"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            title={`Remove ${label} from this pane`}
            data-testid={`sub-indicator-${type}-close`}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

const ChartPane = forwardRef<ChartPaneHandle, ChartPaneProps>(({
  paneId,
  paneLabel,
  series: paneSeries,
  ohlcData,
  activeTicker,
  chartConfig,
  activeIndicators,
  timeRange,
  activeTool,
  intraday = false,
  spacerTimes = null,
  drawColor,
  measureShade = true,
  measureMagnet = false,
  measureAll = false,
  drawAll = false,
  onCrosshairMove,
  onDrawingAdded,
  onDrawingDeleted,
  onFractalAnchorPick,
  onDeleteFractal,
  onDeleteFractalAll,
  onCloseSubIndicator,
  onToggleHideSubIndicator,
  isActive,
  onChartReady,
  onChartDestroyed,
  onSeriesMapUpdate,
  showQuarterShading = false,
  earningsDates = [],
  fyBoundaryLines = [],
  exDivDates = [],
  macroEventLines = [],
  colorByData = null,
  colorByMetric,
  colorByRange = null,
  onClearColorBy,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef<Map<string, ISeriesApi<any>>>(new Map());
  const { colors: IC, widths: IC_W, styles: IC_S, opacities: IC_O, gradients: IC_G } = useIndicatorColors();
  const indicatorSeriesRef = useRef<ISeriesApi<any>[]>([]);
  // Hover lookback-window primitive. The main series persists across
  // indicator re-renders, so the primitive must be explicitly detached from
  // its anchor before each re-render (unlike overlay-series primitives that
  // die with their series).
  const lookbackPrimRef = useRef<LookbackWindowPrimitive | null>(null);
  const lookbackAnchorRef = useRef<ISeriesApi<any> | null>(null);
  // Geometry of the fractal indicator lines (resistance/support), kept alongside
  // indicatorSeriesRef so right-click can hit-test them — they're indicator
  // overlays, not drawings, so pickDrawingAt/the eraser can't see them.
  const fractalLinesRef = useRef<{ points: { time: string; value: number }[] }[]>([]);
  // Invisible whitespace series spanning the full global date axis. It forces
  // every pane's time scale to be identical so that stacked panes (e.g. price
  // over premium-to-NTA) line up by date even when their real series cover
  // different/sparser date ranges. Without it, lightweight-charts assigns
  // per-chart logical indices and the logical-range sync misaligns the panes.
  const spacerSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const [fullDates, setFullDates] = useState<string[]>([]);
  // Stores latest values from sub-indicator charts (RSI, MACD, etc.) for crosshair readout
  const subIndicatorValuesRef = useRef<Record<string, number>>({});
  const drawingsRef = useRef<Drawing[]>([]);
  // Tracks signatures of seeds already applied to this chart so we don't
  // re-draw the same support/resistance level or trendline twice.
  const appliedSeedsRef = useRef<Set<string>>(new Set());
  // Bump counter used to re-run seed-restore effects after a "seeds-restored" event.
  const [seedRestoreNonce, setSeedRestoreNonce] = useState(0);
  const quarterShadingCleanupRef = useRef<(() => void) | null>(null);
  const markersPluginRef = useRef<any>(null);
  const haSignalsPluginRef = useRef<any>(null);
  const vertLinePrimitivesRef = useRef<VerticalLinePrimitive[]>([]);
  // Keep a stable ref to onCrosshairMove so the subscription closure never goes stale
  const onCrosshairMoveRef = useRef(onCrosshairMove);
  onCrosshairMoveRef.current = onCrosshairMove;

  // Per-pane hover readout (TradingView-style): each pane shows its own series
  // names + values at the crosshair time, rendered in this pane's legend.
  const [hoverReadout, setHoverReadout] = useState<{
    time: string;
    items: { label: string; value: number; color: string }[];
  } | null>(null);

  // Clear this pane's readout when any pane broadcasts a pointer-leave.
  useEffect(() => {
    const clear = () => setHoverReadout(null);
    window.addEventListener("reit-viz-crosshair-leave", clear);
    return () => window.removeEventListener("reit-viz-crosshair-leave", clear);
  }, []);

  // Map a pane's crosshair `values` (title → number) to labelled, colored items
  // by looking up each series' color from the pane's series map.
  // The setState is coalesced through requestAnimationFrame: LWC fires crosshair
  // updates synchronously during zoom/scale animations, and a direct setState in
  // that callback can chain into React's nested-update cap ("Maximum update
  // depth exceeded") — one readout update per frame is all the UI needs anyway.
  const readoutRafRef = useRef(0);
  const pendingReadoutRef = useRef<{ time: string; items: { label: string; value: number; color: string }[] } | null>(null);
  const scheduleReadout = useCallback((next: { time: string; items: { label: string; value: number; color: string }[] } | null) => {
    pendingReadoutRef.current = next;
    if (readoutRafRef.current) return;
    readoutRafRef.current = requestAnimationFrame(() => {
      readoutRafRef.current = 0;
      setHoverReadout(pendingReadoutRef.current);
    });
  }, []);
  const applyLocalReadout = useCallback((time: string | null, values: Record<string, number> | null) => {
    if (!time || !values || Object.keys(values).length === 0) {
      scheduleReadout(null);
      return;
    }
    const colorByTitle: Record<string, string> = {};
    for (const s of seriesMapRef.current.values()) {
      try {
        const o: any = s.options();
        const t = readSeriesTitle(s);
        if (t) colorByTitle[t] = o.color || o.upColor || "#94a3b8";
        if (o.upColor) colorByTitle["Price"] = o.upColor; // candlestick main series
      } catch {}
    }
    // Indicator overlays (MAs, mean ± σ bands, Bollinger…) live in a separate
    // list — pick up their colors too so readout entries aren't all gray.
    for (const s of indicatorSeriesRef.current) {
      try {
        const o: any = s.options();
        const t = readSeriesTitle(s);
        if (t && !colorByTitle[t]) colorByTitle[t] = o.color || "#94a3b8";
      } catch {}
    }
    const items = Object.entries(values).map(([label, value]) => ({
      label,
      value,
      color: colorByTitle[label] || "#94a3b8",
    }));
    scheduleReadout({ time, items });
  }, [scheduleReadout]);
  const [chartReady, setChartReady] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [dataTransform, setDataTransform] = useState<DataTransform>("raw");
  const [zScoreWindow, setZScoreWindow] = useState<number>(0); // 0 = expanding, >0 = rolling
  // Track data fingerprint so we only fitContent when actual series data changes,
  // not on indicator/marker/transform toggles that cause scroll bounce-back
  const prevDataFingerprintRef = useRef<string>("");
  const drawStateRef = useRef<{
    pending: boolean;
    startPoint?: { time: string; price: number };
  }>({ pending: false });
  // Measure tool (TradingView-style ruler): transient primitive overlay + info box.
  const measurePrimRef = useRef<{ prim: MeasurePrimitive; series: ISeriesApi<any> } | null>(null);
  // Detach the measure overlay from its series ahead of any chart teardown, so the
  // still-attached primitive isn't poked during disposal ("Object is disposed").
  // Measurements survive tool switches, not full chart rebuilds/unmounts — those
  // already clear every overlay.
  const detachMeasurePrim = () => {
    const ref = measurePrimRef.current;
    if (!ref) return;
    try { ref.series.detachPrimitive(ref.prim); } catch {}
    measurePrimRef.current = null;
  };
  // Latest shade-toggle value, read by the drag handler without re-running its effect.
  const measureShadeRef = useRef(measureShade);
  measureShadeRef.current = measureShade;
  // Latest magnet-toggle value, read by the drag handler.
  const measureMagnetRef = useRef(measureMagnet);
  measureMagnetRef.current = measureMagnet;
  // Latest all-panes-toggle value.
  const measureAllRef = useRef(measureAll);
  measureAllRef.current = measureAll;

  const drawAllRef = useRef(drawAll);
  drawAllRef.current = drawAll;
  const [measureBox, setMeasureBox] = useState<{
    clientX: number;
    clientY: number;
    bars: number;
    days: number;
    angle: number;
    absChange: number;
    pctChange: number;
    up: boolean;
  } | null>(null);

  // Right-click "Delete" menu for removing a single drawing (line/trendline/freehand).
  const [drawingMenu, setDrawingMenu] = useState<{
    clientX: number;
    clientY: number;
    kind: "drawing" | "fractal";
    id?: string;
    label: string;
  } | null>(null);

  // Which sub-indicator subplot (RSI/MACD/…) is expanded to fill the pane (null = none).
  const [maxSub, setMaxSub] = useState<SubChartType | null>(null);
  // Per-subplot custom heights (drag the top border to resize). Empty = defaults.
  const [subHeights, setSubHeights] = useState<Partial<Record<SubChartType, number>>>({});
  // Auto-size resets the expanded subplot and custom heights back to defaults.
  useEffect(() => {
    const reset = () => { setMaxSub(null); setSubHeights({}); };
    window.addEventListener("reit-viz-reset-subcharts", reset);
    return () => window.removeEventListener("reit-viz-reset-subcharts", reset);
  }, []);

  // Drag a subplot's top border to resize its height (main chart absorbs the delta).
  const startSubResize = useCallback((type: SubChartType, defaultH: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = subHeights[type] ?? defaultH;
    const onMove = (ev: MouseEvent) => {
      // Dragging up (smaller clientY) grows the subplot.
      const next = Math.max(48, Math.min(600, startH + (startY - ev.clientY)));
      setSubHeights((prev) => ({ ...prev, [type]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "row-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [subHeights]);

  // Helper: find any usable series for coordinate conversion (not limited to :close/:ohlc)
  const getAnySeries = useCallback((): ISeriesApi<any> | null => {
    // Prefer :ohlc or :close, but fall back to any available series
    for (const [k, s] of seriesMapRef.current) {
      if (k.includes(":ohlc") || k.includes(":close")) return s;
    }
    // Fall back to the first series in the map
    const first = seriesMapRef.current.values().next();
    return first.done ? null : first.value;
  }, []);

  // ── Auto-detection overlays (trendlines / S-R / Fibonacci) ──
  // OHLC arrays for the detectors, rebuilt only when the pane's OHLC changes.
  const detectorOhlc = useMemo(() => {
    if (!Array.isArray(ohlcData) || ohlcData.length === 0) return null;
    const bars = (ohlcData as any[]).filter((b) => b && typeof b.time === "string");
    if (bars.length === 0) return null;
    return {
      dates: bars.map((b) => b.time as string),
      closes: bars.map((b) => Number(b.close)),
      highs: bars.map((b) => Number(b.high)),
      lows: bars.map((b) => Number(b.low)),
    };
  }, [ohlcData]);

  // Diagonal support/resistance trendlines (top few by score).
  const autoTrendlineResults = useMemo(() => {
    if (!activeIndicators.autoTrendlines || !detectorOhlc || detectorOhlc.closes.length < 40) return [];
    try { return detectTrendlines(detectorOhlc, TRENDLINE_CFG).slice(0, 6); } catch { return []; }
  }, [activeIndicators.autoTrendlines, detectorOhlc]);

  // Horizontal support/resistance levels (top few by composite score).
  const srLevelResults = useMemo(() => {
    if (!activeIndicators.srLevels || !detectorOhlc) return [];
    try {
      return detectSRLevels(detectorOhlc, { ...DEFAULT_SR_CFG, enableHorizontal: true, enableMA: false, enableFib: false }).slice(0, 6);
    } catch { return []; }
  }, [activeIndicators.srLevels, detectorOhlc]);

  // Fibonacci retracement of the most recent swing (same swing logic as the
  // standalone S/R tool, but showing every ratio rather than only touched ones).
  const fibLevelResults = useMemo(() => {
    if (!activeIndicators.fibLevels || !detectorOhlc) return [];
    const { highs, lows, closes } = detectorOhlc;
    const lookback = Math.min(252, closes.length);
    const start = closes.length - lookback;
    let hi = start, lo = start;
    for (let i = start; i < closes.length; i++) {
      if (highs[i] > highs[hi]) hi = i;
      if (lows[i] < lows[lo]) lo = i;
    }
    const H = highs[hi], L = lows[lo], range = H - L;
    if (!(range > 0)) return [];
    const highFirst = hi >= lo;
    return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((r) => ({
      ratio: r,
      price: highFirst ? H - range * r : L + range * r,
    }));
  }, [activeIndicators.fibLevels, detectorOhlc]);

  // ── Pattern Recognition ──
  // Settings live in localStorage (per pane) and change via window events, so a
  // nonce forces recomputation on settings-changed / rescan for this pane.
  const [patternNonce, setPatternNonce] = useState(0);
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent).detail?.paneId === paneId) setPatternNonce((x) => x + 1);
    };
    window.addEventListener("reit-viz:patterns-settings-changed", onChange);
    window.addEventListener("reit-viz:patterns-rescan", onChange);
    return () => {
      window.removeEventListener("reit-viz:patterns-settings-changed", onChange);
      window.removeEventListener("reit-viz:patterns-rescan", onChange);
    };
  }, [paneId]);

  const patternBars = useMemo(() => {
    if (!Array.isArray(ohlcData)) return [];
    return (ohlcData as any[])
      .filter((b) => b && typeof b.time === "string")
      .map((b) => ({ time: b.time as string, open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close) }));
  }, [ohlcData]);

  const patternResults = useMemo(() => {
    const s = getPatternSettings(paneId);
    const empty = { patterns: [] as ReturnType<typeof detectChartPatterns>, relevant: [] as any[], bars: patternBars };
    if (!s.enabled) return empty;
    // Resample to the selected timeframe before detection. The downsampled bars
    // keep real daily dates (each bucket's last trading day), so pattern lines
    // drawn by time land correctly on the daily chart.
    let detectionBars = patternBars;
    const tf = s.timeframe;
    if ((tf === "weekly" || tf === "monthly") && patternBars.length > 0) {
      try {
        const ds = weeklyDownsample(
          {
            dates: patternBars.map((b) => b.time),
            closes: patternBars.map((b) => b.close),
            adjCloses: patternBars.map((b) => b.close),
            highs: patternBars.map((b) => b.high),
            lows: patternBars.map((b) => b.low),
            opens: patternBars.map((b) => b.open),
          },
          tf,
        );
        detectionBars = ds.dates.map((d: string, i: number) => ({
          time: d, open: ds.opens[i], high: ds.highs[i], low: ds.lows[i], close: ds.closes[i],
        }));
      } catch { detectionBars = patternBars; }
    }
    if (detectionBars.length < 40) return { ...empty, bars: detectionBars };
    let patterns: ReturnType<typeof detectChartPatterns> = [];
    try {
      patterns = detectChartPatterns(detectionBars, {
        sensitivity: s.sensitivity, lookbackBars: s.lookbackBars, maxPatterns: s.maxPatterns, perPattern: s.perPattern,
      });
    } catch { patterns = []; }
    const relevant = s.showMostRelevant
      ? rankRelevance(patterns, detectionBars, s.lookbackBars).slice(0, 5).map((p) => ({
          id: `${p.key}-${p.endIdx}`,
          label: p.label,
          direction: p.direction,
          relevance: p.relevance ?? 0,
          components: p.components ?? { confidence: 0, recency: 0, proximity: 0 },
        }))
      : [];
    return { patterns, relevant, bars: detectionBars };
    // patternNonce forces re-read of localStorage settings.
  }, [patternBars, paneId, patternNonce]);

  // Publish results to the PatternsPanel (badge count + most-relevant list).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("reit-viz:patterns-detected", { detail: { paneId, patterns: patternResults.patterns } }));
    window.dispatchEvent(new CustomEvent("reit-viz:patterns-most-relevant", { detail: { paneId, relevant: patternResults.relevant } }));
  }, [patternResults, paneId]);

  // Remove all of this pane's measurements (keeps the primitive attached so new
  // measurements can be drawn again) and hide the floating readout box.
  const clearMeasureOverlay = useCallback(() => {
    try { measurePrimRef.current?.prim.clearAll(); } catch {}
    setMeasureBox(null);
  }, []);

  // This pane's own series value at a given axis time (close for candles, value
  // for lines) — used by "all panes" mode to mirror a measurement onto series
  // that the cursor never touched.
  const valueAtTime = useCallback((time: string): { value: number; logical: number } | null => {
    const chart = chartRef.current;
    if (!chart) return null;
    const ts = chart.timeScale();
    const x = ts.timeToCoordinate(time as Time);
    if (x == null) return null;
    const logical = ts.coordinateToLogical(x);
    if (logical == null) return null;
    const idx = Math.round(logical as number);
    for (const s of seriesMapRef.current.values()) {
      try {
        const d: any = (s as any).dataByIndex(idx);
        if (!d) continue;
        if ("value" in d && d.value != null) return { value: d.value, logical: logical as number };
        if ("close" in d && d.close != null) return { value: d.close, logical: logical as number };
      } catch {}
    }
    return null;
  }, []);

  // "All panes" follower: draw this pane's measurement over [startTime, endTime]
  // using its OWN series values at those times (so magnet-like on every series),
  // with the info box anchored to this pane's end point.
  const drawSpanMeasure = useCallback((startTime: string, endTime: string) => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;
    const s = valueAtTime(startTime);
    const e = valueAtTime(endTime);
    if (!s || !e) return;
    const series = getAnySeries();
    if (!series) return;

    const up = e.value >= s.value;
    try {
      if (!measurePrimRef.current) {
        const prim = new MeasurePrimitive();
        series.attachPrimitive(prim);
        measurePrimRef.current = { prim, series };
      }
      measurePrimRef.current.prim.updateCurrent({
        startTime, startPrice: s.value, endTime, endPrice: e.value, up,
        showRect: measureShadeRef.current,
      });
    } catch { return; }

    const ts = chart.timeScale();
    const bars = Math.abs(Math.round(e.logical) - Math.round(s.logical));
    const ta = Date.parse(startTime), tb = Date.parse(endTime);
    const days = isFinite(ta) && isFinite(tb) ? Math.round(Math.abs(tb - ta) / 86400000) : NaN;
    const x1 = ts.timeToCoordinate(startTime as Time) ?? 0;
    const x2 = ts.timeToCoordinate(endTime as Time) ?? 0;
    const y1 = series.priceToCoordinate(s.value as any) ?? 0;
    const y2 = series.priceToCoordinate(e.value as any) ?? 0;
    const angle = (Math.atan2(-(y2 - y1), x2 - x1) * 180) / Math.PI;
    const absChange = e.value - s.value;
    const pctChange = s.value !== 0 ? (absChange / s.value) * 100 : 0;
    const rect = container.getBoundingClientRect();
    setMeasureBox({
      clientX: rect.left + x2 + 12,
      clientY: rect.top + y2 + 12,
      bars, days, angle, absChange, pctChange, up,
    });
  }, [getAnySeries, valueAtTime]);

  // "All panes" wiring: follower panes redraw on span broadcasts; every pane
  // clears on a clear broadcast.
  useEffect(() => {
    const onSpan = (ev: Event) => {
      const d = (ev as CustomEvent).detail;
      if (!measureAllRef.current || activeTool !== "measure") return;
      if (d.originPaneId === paneId) return; // origin draws itself
      drawSpanMeasure(d.startTime, d.endTime);
    };
    const onClear = () => clearMeasureOverlay();
    // Origin finished its drag: followers commit their mirrored measure so it
    // persists alongside any earlier ones instead of being overwritten.
    const onCommit = () => { try { measurePrimRef.current?.prim.commitCurrent(); } catch {} };
    window.addEventListener("reit-viz-measure-span", onSpan);
    window.addEventListener("reit-viz-measure-clear", onClear);
    window.addEventListener("reit-viz-measure-commit", onCommit);
    return () => {
      window.removeEventListener("reit-viz-measure-span", onSpan);
      window.removeEventListener("reit-viz-measure-clear", onClear);
      window.removeEventListener("reit-viz-measure-commit", onCommit);
    };
  }, [paneId, activeTool, drawSpanMeasure, clearMeasureOverlay]);

  useImperativeHandle(ref, () => ({
    getChart: () => chartRef.current,
    fitContent: () => { try { chartRef.current?.timeScale().fitContent(); } catch {} },
    clearDrawings: () => {
      const chart = chartRef.current;
      if (!chart) return;
      for (const d of drawingsRef.current) {
        if (d.seriesRef) {
          try { chart.removeSeries(d.seriesRef); } catch {}
        }
      }
      drawingsRef.current = [];
      // Clear All wipes the shared registry too, so a later-added pane starts clean.
      allPanesDrawings.clear();
    },
  }));

  // Create chart
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean up previous
    if (chartRef.current) {
      detachMeasurePrim();
      chartRef.current.remove();
      chartRef.current = null;
      seriesMapRef.current.clear();
      indicatorSeriesRef.current = [];
      fractalLinesRef.current = [];
      spacerSeriesRef.current = null;
      setChartReady(false);
    }

    const tryInit = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        requestAnimationFrame(tryInit);
        return;
      }

      const chart = createChart(container, {
        width: rect.width,
        height: rect.height,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#7a8a9e",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        },
        grid: {
          vertLines: { color: gridColorFor(chartConfig.gridProminence) },
          horzLines: { color: gridColorFor(chartConfig.gridProminence) },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: "rgba(125, 211, 252, 0.9)",
            width: 1,
            style: LineStyle.LargeDashed,
            labelBackgroundColor: "#0ea5e9",
          },
          horzLine: {
            color: "rgba(125, 211, 252, 0.9)",
            width: 1,
            style: LineStyle.LargeDashed,
            labelBackgroundColor: "#0ea5e9",
          },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.08)",
          scaleMargins: { top: 0.1, bottom: 0.1 },
          minimumWidth: 70,
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.08)",
          timeVisible: false,
          rightOffset: 5,
          barSpacing: 3,
          minBarSpacing: 1,
        },
        // Wheel zooms (cursor-anchored) but does NOT scroll: pointing devices that
        // emit a horizontal delta (tilt wheels, trackpads) would otherwise pan the
        // chart sideways while zooming. Pan is still available via click-drag.
        handleScroll: { mouseWheel: false, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true },
      });

      chartRef.current = chart;
      setChartReady(true);
      onChartReady?.(paneId, chart);

      chart.subscribeCrosshairMove((param: any) => {
        lookbackPrimRef.current?.setHover(
          param.time && param.logical != null ? Number(param.logical) : null,
        );
        if (!param.time || !param.seriesData) {
          onCrosshairMoveRef.current?.(null);
          applyLocalReadout(null, null);
          return;
        }
        const values: Record<string, number> = {};
        param.seriesData.forEach((data: any, series: any) => {
          if ("value" in data) {
            const title = readSeriesTitle(series);
            if (title) values[title] = data.value;
          } else if ("close" in data) {
            values["Price"] = data.close;
          }
        });
        // Merge sub-chart indicator values (RSI, MACD, etc.)
        const subVals = subIndicatorValuesRef.current;
        for (const [k, v] of Object.entries(subVals)) {
          if (v != null) values[k] = v;
        }
        onCrosshairMoveRef.current?.({ time: String(param.time), values });
        applyLocalReadout(String(param.time), values);
      });

      const ro = new ResizeObserver((entries) => {
        if (!chartRef.current) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      });
      ro.observe(container);
    };

    tryInit();

    return () => {
      if (chartRef.current) {
        onChartDestroyed?.(paneId);
        detachMeasurePrim();
        chartRef.current.remove();
        chartRef.current = null;
        setChartReady(false);
        seriesMapRef.current.clear();
        indicatorSeriesRef.current = [];
        fractalLinesRef.current = [];
        spacerSeriesRef.current = null;
      }
    };
  }, []);

  // Load the global date axis once (cached in dataService) for the spacer series.
  useEffect(() => {
    let cancelled = false;
    getDates()
      .then((d) => { if (!cancelled) setFullDates(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Maintain the invisible spacer series so every pane shares one global time
  // axis. Whitespace points ({ time } with no value) extend the time scale
  // without drawing anything or affecting the price scale, giving all stacked
  // panes identical logical indexing — the precondition for the logical-range
  // sync in ChartArea to keep them aligned by date.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    // Non-daily frequencies swap in their own axis (weekly/monthly period-end
    // dates or hourly epoch seconds) so logical indexes still match the data.
    const axisTimes: (string | number)[] = spacerTimes?.length ? spacerTimes : fullDates;
    if (axisTimes.length === 0) return;
    if (!spacerSeriesRef.current) {
      try {
        spacerSeriesRef.current = chart.addSeries(LineSeries, {
          visible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          // Never let the spacer influence the visible price scale.
          autoscaleInfoProvider: () => null,
        });
      } catch {}
    }
    if (spacerSeriesRef.current) {
      try {
        spacerSeriesRef.current.setData(
          axisTimes.map((t) => ({ time: t as unknown as Time }))
        );
        // On a custom axis (frequency switch), any previously-saved visible
        // range points at daily logical indexes — refit to the new axis.
        if (spacerTimes?.length) chart.timeScale().fitContent();
      } catch {}
    }
  }, [chartReady, fullDates, spacerTimes]);

  // Store last known pointer position so we can re-extract values after scroll/zoom
  const lastPointerXRef = useRef<number | null>(null);

  // Helper: extract crosshair data at a given x coordinate
  const extractCrosshairAt = useCallback((x: number) => {
    const ch = chartRef.current;
    if (!ch) return;
    const ts = ch.timeScale();
    const time = ts.coordinateToTime(x);
    if (time == null) return;
    const values: Record<string, number> = {};
    const logical = ts.coordinateToLogical(x);
    if (logical == null) return;
    const idx = Math.round(logical);
    // Iterate both main series and overlay indicator series
    const allSeries: Iterable<ISeriesApi<any>> = (function* () {
      for (const [, s] of seriesMapRef.current) yield s;
      for (const s of indicatorSeriesRef.current) yield s;
    })();
    for (const series of allSeries) {
      try {
        const d = (series as any).dataByIndex(idx);
        if (!d) continue;
        const opts = series.options() as any;
        if ("value" in d && d.value != null) {
          const title = opts.title || "";
          if (title) values[title] = d.value;
        } else if ("close" in d && d.close != null) {
          values["Price"] = d.close;
        }
      } catch {}
    }
    // Merge sub-chart indicator values stored via custom events
    const subVals = subIndicatorValuesRef.current;
    for (const [k, v] of Object.entries(subVals)) {
      if (v != null) values[k] = v;
    }
    if (Object.keys(values).length > 0) {
      onCrosshairMoveRef.current?.({ time: String(time), values });
      applyLocalReadout(String(time), values);
    }
  }, [applyLocalReadout]);

  // Fallback: native pointermove handler extracts crosshair data when
  // LWC's subscribeCrosshairMove doesn't fire (e.g. during hover without click).
  // Also handles wheel/scroll events so values update when the chart pans under the cursor.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !chartRef.current || !chartReady) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      lastPointerXRef.current = x;
      extractCrosshairAt(x);
    };

    const handlePointerLeave = () => {
      lastPointerXRef.current = null;
      // Clear every pane's readout: synced panes get their crosshair set via
      // setCrosshairPosition (fires the move event) but cleared via
      // clearCrosshairPosition (does NOT), so they'd keep a stale value. A
      // window broadcast clears them all reliably.
      window.dispatchEvent(new CustomEvent("reit-viz-crosshair-leave"));
    };

    // When the user scrolls (wheel) the chart pans/zooms, so re-extract at the
    // last known pointer position after a short delay for the chart to settle.
    const handleWheel = () => {
      if (lastPointerXRef.current != null) {
        requestAnimationFrame(() => extractCrosshairAt(lastPointerXRef.current!));
      }
    };

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);
    container.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [chartReady, extractCrosshairAt, applyLocalReadout]);

  // Listen for sub-chart crosshair events (sub → parent sync).
  // When the user hovers over a sub-indicator chart (ROC, RSI, etc.),
  // it dispatches a custom event with the time. We mirror that time
  // onto the parent chart's crosshair so ChartArea can cascade it.
  useEffect(() => {
    const wrapper = containerRef.current?.parentElement;
    if (!wrapper || !chartRef.current || !chartReady) return;

    const handleSubCrosshair = (e: Event) => {
      const chart = chartRef.current;
      if (!chart) return;
      const { time, values, fromParent } = (e as CustomEvent).detail;
      // Store sub-indicator values so they appear in crosshair readout
      if (values && typeof values === "object") {
        subIndicatorValuesRef.current = { ...subIndicatorValuesRef.current, ...values };
      }
      // If this event originated from the parent's crosshair move,
      // don't re-set the parent crosshair (would cause infinite loop).
      // Just store the values — the parent's crosshair is already positioned.
      if (fromParent) return;
      if (time) {
        // Need any series reference to set crosshair
        const firstSeries = seriesMapRef.current.values().next();
        if (!firstSeries.done && firstSeries.value) {
          try { chart.setCrosshairPosition(NaN, time, firstSeries.value); } catch {}
        }
      } else {
        // Clear sub-indicator values when crosshair leaves
        subIndicatorValuesRef.current = {};
        try { chart.clearCrosshairPosition(); } catch {}
      }
    };
    wrapper.addEventListener("sub-crosshair-move", handleSubCrosshair);
    return () => wrapper.removeEventListener("sub-crosshair-move", handleSubCrosshair);
  }, [chartReady]);

  // Log scale mode
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    try {
      chart.priceScale("right").applyOptions({
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      });
    } catch {}
  }, [logScale, chartReady]);

  // Background grid line prominence — applied live so the toggle updates the
  // main chart without recreating it (sub-charts pick it up via their gridColor prop).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    const c = gridColorFor(chartConfig.gridProminence);
    try {
      chart.applyOptions({
        grid: { vertLines: { color: c }, horzLines: { color: c } },
      });
    } catch {}
  }, [chartConfig.gridProminence, chartReady]);

  // Quarter shading — attach/detach inside the series rendering effect
  // (handled below in the main Sync series useEffect since it needs a series ref)

  // When a drawing tool is active, disable chart scroll-drag so clicks/drags are for drawing
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    if (activeTool !== "none") {
      chart.applyOptions({ handleScroll: { mouseWheel: false, pressedMouseMove: false } });
    } else {
      chart.applyOptions({ handleScroll: { mouseWheel: false, pressedMouseMove: true } });
    }
  }, [activeTool, chartReady]);

  // Handle drawing clicks via LWC subscribeClick (more reliable than raw DOM click)
  // Create a drawing series from a plain spec. Used both to render "all panes"
  // mirror copies broadcast from other panes and (indirectly) to keep a single
  // code path for the hline/trendline/freehand geometry.
  // Returns true only if a drawing was actually created — callers must gate their
  // onDrawingAdded() count bump on this, or an early-return (e.g. a pane still
  // loading its data) would inflate the count with no drawing to ever remove.
  const addDrawingFromSpec = useCallback((spec: {
    id: string;
    groupId?: string;
    type: Drawing["type"];
    color: string;
    price?: number;
    points?: { time: string; price: number }[];
  }): boolean => {
    const chart = chartRef.current;
    if (!chart) return false;
    let seriesRef: ISeriesApi<any> | undefined;
    if (spec.type === "hline" && spec.price != null) {
      // Span the shared global date axis so the line renders on every pane at the
      // same price — even panes whose own series is sparse (e.g. a P/FFO ratio
      // with few points). Fall back to this pane's own dates only if the global
      // axis isn't loaded yet; bail (so the caller can retry) if neither is ready.
      const sortedTimes = fullDates.length >= 2
        ? fullDates
        : [...new Set(paneSeries.flatMap((ps) => ps.data.map((d) => d.time)))].sort();
      if (sortedTimes.length < 2) return false;
      const s = chart.addSeries(LineSeries, {
        color: spec.color, lineWidth: 2, lineStyle: LineStyle.Dashed, title: "",
        crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        autoscaleInfoProvider: () => null,
      });
      s.setData([
        { time: sortedTimes[0] as Time, value: spec.price },
        { time: sortedTimes[sortedTimes.length - 1] as Time, value: spec.price },
      ]);
      seriesRef = s;
    } else if ((spec.type === "trendline" || spec.type === "freehand") && spec.points && spec.points.length >= 2) {
      const s = chart.addSeries(LineSeries, {
        color: spec.color, lineWidth: 2, lineStyle: LineStyle.Solid, title: "",
        crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        autoscaleInfoProvider: () => null,
      });
      s.setData(spec.points.map((p) => ({ time: p.time as Time, value: p.price })));
      seriesRef = s;
    }
    if (!seriesRef) return false;
    drawingsRef.current.push({
      id: spec.id, groupId: spec.groupId, type: spec.type, color: spec.color,
      price: spec.price, points: spec.points, seriesRef,
    });
    return true;
  }, [paneSeries, fullDates]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    if (activeTool === "none" || activeTool === "freehand" || activeTool === "eraser" || activeTool === "measure") {
      drawStateRef.current = { pending: false };
      return;
    }

    const handleClick = (param: any) => {
      if (!param.time) return;

      // Fractal anchor only needs the clicked bar's time (not a price coordinate).
      if (activeTool === "fractal-anchor") {
        onFractalAnchorPick?.(String(param.time));
        return;
      }

      if (!param.point) return;
      const anySeries = getAnySeries();
      if (!anySeries) return;

      const priceCoord = anySeries.coordinateToPrice(param.point.y);
      if (priceCoord === null || priceCoord === undefined) return;

      const timeStr = String(param.time);

      if (activeTool === "hline") {
        // Create horizontal line at click price
        const drawId = `draw-${Date.now()}`;
        const hSeries = chart.addSeries(LineSeries, {
          color: drawColor,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          title: "",
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          autoscaleInfoProvider: () => null,
        });

        // Get the full time range of the chart data
        const allTimes = paneSeries.flatMap(s => s.data.map(d => d.time));
        const sortedTimes = [...new Set(allTimes)].sort();
        if (sortedTimes.length >= 2) {
          hSeries.setData([
            { time: sortedTimes[0] as Time, value: priceCoord },
            { time: sortedTimes[sortedTimes.length - 1] as Time, value: priceCoord },
          ]);
        }

        const groupId = drawAllRef.current ? `grp-${Date.now()}` : undefined;
        drawingsRef.current.push({
          id: drawId,
          groupId,
          type: "hline",
          color: drawColor,
          price: priceCoord,
          seriesRef: hSeries,
        });
        onDrawingAdded?.();
        if (groupId) {
          allPanesDrawings.set(groupId, { groupId, type: "hline", color: drawColor, price: priceCoord });
          window.dispatchEvent(new CustomEvent("reit-viz-draw-add", {
            detail: { originPaneId: paneId, groupId, type: "hline", color: drawColor, price: priceCoord },
          }));
        }
      } else if (activeTool === "trendline") {
        if (!drawStateRef.current.pending) {
          // First click — store start point
          drawStateRef.current = {
            pending: true,
            startPoint: { time: timeStr, price: priceCoord },
          };
        } else {
          // Second click — draw the line
          const start = drawStateRef.current.startPoint!;
          const drawId = `draw-${Date.now()}`;
          const tSeries = chart.addSeries(LineSeries, {
            color: drawColor,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            title: "",
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: () => null,
          });
          tSeries.setData([
            { time: start.time as Time, value: start.price },
            { time: timeStr as Time, value: priceCoord },
          ]);

          const groupId = drawAllRef.current ? `grp-${Date.now()}` : undefined;
          const points = [start, { time: timeStr, price: priceCoord }];
          drawingsRef.current.push({
            id: drawId,
            groupId,
            type: "trendline",
            color: drawColor,
            points,
            seriesRef: tSeries,
          });
          drawStateRef.current = { pending: false };
          onDrawingAdded?.();
          if (groupId) {
            allPanesDrawings.set(groupId, { groupId, type: "trendline", color: drawColor, points });
            window.dispatchEvent(new CustomEvent("reit-viz-draw-add", {
              detail: { originPaneId: paneId, groupId, type: "trendline", color: drawColor, points },
            }));
          }
        }
      }
    };

    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [activeTool, drawColor, chartReady, paneSeries, getAnySeries, onFractalAnchorPick]);

  // Freehand drawing: mousedown → mousemove → mouseup
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart || !chartReady) return;
    if (activeTool !== "freehand") return;

    let isDrawing = false;
    const freehandPoints: { time: string; price: number }[] = [];
    let liveSeries: ISeriesApi<any> | null = null;

    const coordToPoint = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const timeCoord = chart.timeScale().coordinateToTime(x);
      const anySeries = getAnySeries();
      if (!anySeries || timeCoord === null) return null;
      const priceCoord = anySeries.coordinateToPrice(y);
      if (priceCoord === null) return null;
      return { time: String(timeCoord), price: priceCoord };
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left click only
      const pt = coordToPoint(e);
      if (!pt) return;
      isDrawing = true;
      freehandPoints.length = 0;
      freehandPoints.push(pt);

      // Create a live series to show drawing in progress
      liveSeries = chart.addSeries(LineSeries, {
        color: drawColor,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: "",
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
        autoscaleInfoProvider: () => null,
      });
      liveSeries.setData([{ time: pt.time as Time, value: pt.price }]);

      // Disable ALL chart interaction while freehand drawing
      chart.applyOptions({ handleScroll: false, handleScale: false });
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing || !liveSeries) return;
      const pt = coordToPoint(e);
      if (!pt) return;
      // Only add point if time differs from last (series requires ascending times)
      const lastPt = freehandPoints[freehandPoints.length - 1];
      if (pt.time > lastPt.time) {
        freehandPoints.push(pt);
        liveSeries.setData(
          freehandPoints.map(p => ({ time: p.time as Time, value: p.price }))
        );
      }
    };

    const handleMouseUp = () => {
      if (!isDrawing) return;
      isDrawing = false;
      // Re-enable chart interaction (keep pressedMouseMove off since freehand tool is active)
      chart.applyOptions({ handleScroll: { mouseWheel: false, pressedMouseMove: false }, handleScale: { mouseWheel: true, pinch: true } });

      if (freehandPoints.length >= 2 && liveSeries) {
        const drawId = `draw-${Date.now()}`;
        const groupId = drawAllRef.current ? `grp-${Date.now()}` : undefined;
        const points = [...freehandPoints];
        drawingsRef.current.push({
          id: drawId,
          groupId,
          type: "freehand",
          color: drawColor,
          points,
          seriesRef: liveSeries,
        });
        onDrawingAdded?.();
        if (groupId) {
          allPanesDrawings.set(groupId, { groupId, type: "freehand", color: drawColor, points });
          window.dispatchEvent(new CustomEvent("reit-viz-draw-add", {
            detail: { originPaneId: paneId, groupId, type: "freehand", color: drawColor, points },
          }));
        }
      } else if (liveSeries) {
        // Too few points — remove the series
        try { chart.removeSeries(liveSeries); } catch {}
      }
      liveSeries = null;
    };

    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      // Ensure chart interaction is re-enabled on cleanup (the tool-level effect handles pressedMouseMove)
      try { chart.applyOptions({ handleScroll: { mouseWheel: false, pressedMouseMove: true }, handleScale: { mouseWheel: true, pinch: true } }); } catch {}
    };
  }, [activeTool, drawColor, chartReady, paneSeries, onDrawingAdded, getAnySeries]);

  // Measure tool (TradingView-style ruler): press → drag → release.
  // While dragging, draws a live line and a floating box with bars / days /
  // angle / absolute + % price change. Result stays until the next drag or
  // until the tool is switched off. Nothing is persisted to drawingsRef.
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart || !chartReady) return;

    if (activeTool !== "measure") {
      // Keep any drawn measurements on screen after the tool is deselected;
      // only hide the cursor-following readout box.
      setMeasureBox(null);
      return;
    }

    const ts = chart.timeScale();
    // Logical index → axis date. The logical space is defined by the spacer
    // series (fullDates), NOT this pane's own series data, so snap against that
    // axis; only fall back to the pane's dates if the spacer isn't set yet.
    const axisDates = fullDates.length
      ? fullDates
      : [...new Set(paneSeries.flatMap((s) => s.data.map((d) => d.time)))].sort();
    const daysBetween = (a: string, b: string) => {
      const ta = Date.parse(a), tb = Date.parse(b);
      if (!isFinite(ta) || !isFinite(tb)) return NaN;
      return Math.round(Math.abs(tb - ta) / 86400000);
    };
    // Magnet: nearest actual data value (OHLC or line value) at a bar to the
    // cursor price, so the endpoint sticks to the data point.
    const snapPriceAt = (logical: number, cursorPrice: number): number | null => {
      const idx = Math.round(logical);
      let best: number | null = null, bestDist = Infinity;
      for (const s of seriesMapRef.current.values()) {
        try {
          const d: any = (s as any).dataByIndex(idx);
          if (!d) continue;
          const cands: number[] = [];
          if ("close" in d) cands.push(d.open, d.high, d.low, d.close);
          else if ("value" in d && d.value != null) cands.push(d.value);
          for (const c of cands) {
            if (c == null) continue;
            const dist = Math.abs(c - cursorPrice);
            if (dist < bestDist) { bestDist = dist; best = c; }
          }
        } catch {}
      }
      return best;
    };

    type MPoint = { x: number; y: number; logical: number; time: string; price: number; series: ISeriesApi<any> };
    const resolvePoint = (e: MouseEvent): MPoint | null => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const logical = ts.coordinateToLogical(x);
      if (logical === null) return null;
      // Find a series whose price scale yields a valid price at y (getAnySeries
      // may return a close-line series that reports null — not the scale owner).
      let series = getAnySeries();
      let raw = series?.coordinateToPrice(y) ?? null;
      if (raw === null || raw === undefined) {
        for (const s of seriesMapRef.current.values()) {
          const pr = s.coordinateToPrice(y);
          if (pr !== null && pr !== undefined) { series = s; raw = pr; break; }
        }
      }
      if (raw === null || raw === undefined || !series) return null;
      // Snapped bar time under the cursor — use the chart's own axis mapping so
      // the drawn point lines up exactly with the cursor.
      const t = ts.coordinateToTime(x);
      let time = t != null ? String(t) : null;
      if (time === null && axisDates.length) {
        const idx = Math.max(0, Math.min(axisDates.length - 1, Math.round(logical as number)));
        time = axisDates[idx];
      }
      if (time === null) return null;
      let price: number = raw;
      if (measureMagnetRef.current) {
        const snapped = snapPriceAt(logical as number, raw);
        if (snapped != null) price = snapped;
      }
      return { x, y, logical: logical as number, time, price, series };
    };

    let isMeasuring = false;
    let start: MPoint | null = null;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left click only
      const pt = resolvePoint(e);
      if (!pt) return;
      // Don't clear prior measurements — each drag adds another persistent one.
      isMeasuring = true;
      start = pt;
      // Disable all chart interaction while measuring so the drag is ours.
      chart.applyOptions({ handleScroll: false, handleScale: false });
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMeasuring || !start) return;
      const end = resolvePoint(e);
      if (!end) return;

      const bars = Math.abs(Math.round(end.logical) - Math.round(start.logical));
      const days = daysBetween(start.time, end.time);
      const absChange = end.price - start.price;
      const pctChange = start.price !== 0 ? (absChange / start.price) * 100 : 0;
      const up = absChange >= 0;
      // Angle from the actual drawn endpoints (matches the line, incl. magnet snap).
      const x1 = ts.timeToCoordinate(start.time as Time) ?? start.x;
      const x2 = ts.timeToCoordinate(end.time as Time) ?? end.x;
      const y1 = start.series.priceToCoordinate(start.price as any) ?? start.y;
      const y2 = end.series.priceToCoordinate(end.price as any) ?? end.y;
      const angle = (Math.atan2(-(y2 - y1), x2 - x1) * 180) / Math.PI;

      setMeasureBox({
        clientX: e.clientX,
        clientY: e.clientY,
        bars,
        days,
        angle,
        absChange,
        pctChange,
        up,
      });

      // Live overlay: shaded rectangle + diagonal line via the measure primitive.
      try {
        if (!measurePrimRef.current) {
          const series = getAnySeries();
          if (series) {
            const prim = new MeasurePrimitive();
            series.attachPrimitive(prim);
            measurePrimRef.current = { prim, series };
          }
        }
        measurePrimRef.current?.prim.updateCurrent({
          startTime: start.time,
          startPrice: start.price,
          endTime: end.time,
          endPrice: end.price,
          up,
          showRect: measureShadeRef.current,
        });
      } catch {}

      // "All panes" mode: mirror this time span onto every other pane.
      if (measureAllRef.current) {
        window.dispatchEvent(new CustomEvent("reit-viz-measure-span", {
          detail: { startTime: start.time, endTime: end.time, originPaneId: paneId },
        }));
      }
    };

    const handleMouseUp = () => {
      if (!isMeasuring) return;
      isMeasuring = false;
      // Re-enable chart interaction (pressedMouseMove stays off — tool is still active).
      chart.applyOptions({
        handleScroll: { mouseWheel: false, pressedMouseMove: false },
        handleScale: { mouseWheel: true, pinch: true },
      });
      // Finalize this measurement so it persists; the next drag adds another.
      try { measurePrimRef.current?.prim.commitCurrent(); } catch {}
      // All-panes mode: tell follower panes to finalize their mirror too.
      if (measureAllRef.current) {
        window.dispatchEvent(new CustomEvent("reit-viz-measure-commit"));
      }
      // Leave the drawn line + box on screen; the readout clears on tool switch.
    };

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      try {
        chart.applyOptions({
          handleScroll: { mouseWheel: false, pressedMouseMove: true },
          handleScale: { mouseWheel: true, pinch: true },
        });
      } catch {}
    };
  }, [activeTool, chartReady, paneSeries, getAnySeries, fullDates, clearMeasureOverlay]);

  // Live-update an already-drawn measurement when the shade toggle flips.
  useEffect(() => {
    measurePrimRef.current?.prim.setShowRect(measureShade);
  }, [measureShade]);

  // Hit-test the drawings at a pane-relative pixel point; returns the index of the
  // nearest drawing within tolerance, or -1. Shared by the eraser and right-click delete.
  const pickDrawingAt = useCallback((x: number, y: number): number => {
    const chart = chartRef.current;
    const anySeries = getAnySeries();
    if (!chart || !anySeries) return -1;

    const clickPrice = anySeries.coordinateToPrice(y);
    const clickTime = chart.timeScale().coordinateToTime(x);
    if (clickPrice === null || clickPrice === undefined) return -1;
    const clickTimeStr = clickTime ? String(clickTime) : null;

    let bestIdx = -1;
    let bestDist = Infinity;

    // Use chart height to compute a pixel-based tolerance
    const container = containerRef.current;
    const chartHeight = container?.clientHeight ?? 400;
    let priceRange = 1;
    try {
      const topPrice = anySeries.coordinateToPrice(0);
      const bottomPrice = anySeries.coordinateToPrice(chartHeight);
      if (topPrice !== null && bottomPrice !== null) {
        priceRange = Math.abs(topPrice - bottomPrice) || 1;
      }
    } catch {}
    const priceTol = priceRange * 0.03; // ~3% of visible price range (generous hit target)

    for (let i = 0; i < drawingsRef.current.length; i++) {
      const d = drawingsRef.current[i];
      if (d.type === "hline" && d.price !== undefined) {
        const dist = Math.abs(clickPrice - d.price);
        if (dist < priceTol && dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      } else if ((d.type === "trendline" || d.type === "freehand") && d.points && d.points.length >= 2) {
        // Check distance to each segment via linear interpolation in price at clickTime
        for (let j = 0; j < d.points.length - 1; j++) {
          const p1 = d.points[j];
          const p2 = d.points[j + 1];
          if (clickTimeStr && clickTimeStr >= p1.time && clickTimeStr <= p2.time) {
            const t1 = new Date(p1.time).getTime();
            const t2 = new Date(p2.time).getTime();
            const tc = new Date(clickTimeStr).getTime();
            const frac = t2 === t1 ? 0 : (tc - t1) / (t2 - t1);
            const interpPrice = p1.price + frac * (p2.price - p1.price);
            const dist = Math.abs(clickPrice - interpPrice);
            if (dist < priceTol && dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
        }
        // Also check proximity to any point directly (for freehand with sparse points)
        for (const pt of d.points) {
          const dist = Math.abs(clickPrice - pt.price);
          if (dist < priceTol && dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
      }
    }
    return bestIdx;
  }, [getAnySeries]);

  // Hit-test the fractal indicator lines at a pane-relative pixel point. Returns
  // true if near either the resistance or support line. Uses the same price-space
  // interpolation as pickDrawingAt, since fractal lines are stored as point pairs.
  const pickFractalAt = useCallback((x: number, y: number): boolean => {
    const chart = chartRef.current;
    const anySeries = getAnySeries();
    if (!chart || !anySeries || fractalLinesRef.current.length === 0) return false;

    const clickPrice = anySeries.coordinateToPrice(y);
    const clickTime = chart.timeScale().coordinateToTime(x);
    if (clickPrice === null || clickPrice === undefined || !clickTime) return false;
    const clickTimeStr = String(clickTime);

    const container = containerRef.current;
    const chartHeight = container?.clientHeight ?? 400;
    let priceRange = 1;
    try {
      const topPrice = anySeries.coordinateToPrice(0);
      const bottomPrice = anySeries.coordinateToPrice(chartHeight);
      if (topPrice !== null && bottomPrice !== null) {
        priceRange = Math.abs(topPrice - bottomPrice) || 1;
      }
    } catch {}
    const priceTol = priceRange * 0.03; // ~3% of visible price range (matches drawings)

    for (const line of fractalLinesRef.current) {
      const pts = line.points;
      for (let j = 0; j < pts.length - 1; j++) {
        const p1 = pts[j];
        const p2 = pts[j + 1];
        if (clickTimeStr >= p1.time && clickTimeStr <= p2.time) {
          const t1 = new Date(p1.time).getTime();
          const t2 = new Date(p2.time).getTime();
          const tc = new Date(clickTimeStr).getTime();
          const frac = t2 === t1 ? 0 : (tc - t1) / (t2 - t1);
          const interp = p1.value + frac * (p2.value - p1.value);
          if (Math.abs(clickPrice - interp) < priceTol) return true;
        }
      }
    }
    return false;
  }, [getAnySeries]);

  // Remove a single drawing (its series + record) from THIS pane only, and notify
  // the parent count. "Delete on all panes" is a separate, explicit action below.
  const deleteDrawingById = useCallback((id: string) => {
    const chart = chartRef.current;
    const idx = drawingsRef.current.findIndex((d) => d.id === id);
    if (idx < 0) return;
    const d = drawingsRef.current[idx];
    if (d.seriesRef && chart) { try { chart.removeSeries(d.seriesRef); } catch {} }
    drawingsRef.current.splice(idx, 1);
    onDrawingDeleted?.();
  }, [onDrawingDeleted]);

  // Remove every local drawing matching a delete-spec (shared group id, or same
  // geometry). Used both by the origin pane and — via broadcast — by the others.
  const deleteMatchingDrawings = useCallback((spec: DeleteSpec) => {
    const chart = chartRef.current;
    let removed = false;
    for (let i = drawingsRef.current.length - 1; i >= 0; i--) {
      const d = drawingsRef.current[i];
      if (drawingMatchesSpec(d, spec)) {
        if (d.seriesRef && chart) { try { chart.removeSeries(d.seriesRef); } catch {} }
        if (d.groupId) allPanesDrawings.delete(d.groupId);
        drawingsRef.current.splice(i, 1);
        removed = true;
      }
    }
    if (removed) onDrawingDeleted?.();
  }, [onDrawingDeleted]);

  // "Delete on all panes": drop this drawing here and tell every other pane to drop
  // the matching one (so a later-added pane won't resurrect it, clear the registry).
  const deleteDrawingEverywhere = useCallback((id: string) => {
    const d = drawingsRef.current.find((x) => x.id === id);
    if (!d) return;
    const spec: DeleteSpec = { groupId: d.groupId, type: d.type, price: d.price, points: d.points };
    if (spec.groupId) allPanesDrawings.delete(spec.groupId);
    deleteMatchingDrawings(spec);
    window.dispatchEvent(new CustomEvent("reit-viz-draw-delete-all", {
      detail: { ...spec, originPaneId: paneId },
    }));
  }, [deleteMatchingDrawings]);

  // "All panes" wiring: mirror drawing create/delete broadcasts from other panes so
  // the same line/trend/freehand appears — and disappears — on every pane at once.
  useEffect(() => {
    const onAdd = (ev: Event) => {
      const d = (ev as CustomEvent).detail;
      if (!d || d.originPaneId === paneId || !drawAllRef.current) return;
      const added = addDrawingFromSpec({
        id: `${d.groupId}-${paneId}`, groupId: d.groupId, type: d.type,
        color: d.color, price: d.price, points: d.points,
      });
      if (added) onDrawingAdded?.();
    };
    const onDeleteAll = (ev: Event) => {
      const d = (ev as CustomEvent).detail;
      if (!d || d.originPaneId === paneId) return;
      deleteMatchingDrawings(d);
    };
    window.addEventListener("reit-viz-draw-add", onAdd);
    window.addEventListener("reit-viz-draw-delete-all", onDeleteAll);
    return () => {
      window.removeEventListener("reit-viz-draw-add", onAdd);
      window.removeEventListener("reit-viz-draw-delete-all", onDeleteAll);
    };
  }, [paneId, addDrawingFromSpec, deleteMatchingDrawings, onDrawingAdded]);

  // Catch-up for panes added *after* an "all panes" drawing was made: once this
  // pane's chart is ready (and its data has loaded, needed for hline ranges),
  // render any registry drawing it doesn't already have. Re-runs on paneSeries so
  // an hline that couldn't get a range on first pass renders when data arrives.
  useEffect(() => {
    if (!chartReady || allPanesDrawings.size === 0) return;
    for (const [groupId, spec] of allPanesDrawings) {
      if (drawingsRef.current.some((d) => d.groupId === groupId)) continue;
      const added = addDrawingFromSpec({
        id: `${groupId}-${paneId}`, groupId, type: spec.type,
        color: spec.color, price: spec.price, points: spec.points,
      });
      if (added) onDrawingAdded?.();
    }
  }, [chartReady, paneSeries, paneId, addDrawingFromSpec, onDrawingAdded]);

  // Eraser tool: click to delete nearest drawing
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    if (activeTool !== "eraser") return;

    const handleClick = (param: any) => {
      if (!param.point) return;
      const bestIdx = pickDrawingAt(param.point.x, param.point.y);
      if (bestIdx >= 0) deleteDrawingById(drawingsRef.current[bestIdx].id);
    };

    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [activeTool, chartReady, pickDrawingAt, deleteDrawingById]);

  // Right-click a drawing to delete just that one — works regardless of the active
  // tool, so you don't have to switch to the eraser first.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !chartReady) return;
    const onContextMenu = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const idx = pickDrawingAt(px, py);
      if (idx >= 0) {
        e.preventDefault(); // suppress the browser menu only when we hit a drawing
        const d = drawingsRef.current[idx];
        const label = d.type === "hline" ? "line" : d.type === "trendline" ? "trendline" : "drawing";
        setDrawingMenu({ clientX: e.clientX, clientY: e.clientY, kind: "drawing", id: d.id, label });
        return;
      }
      // No drawing hit — fall back to the fractal indicator lines.
      if (pickFractalAt(px, py)) {
        e.preventDefault();
        setDrawingMenu({ clientX: e.clientX, clientY: e.clientY, kind: "fractal", label: "fractal lines" });
        return;
      }
      setDrawingMenu(null);
    };
    container.addEventListener("contextmenu", onContextMenu);
    return () => container.removeEventListener("contextmenu", onContextMenu);
  }, [chartReady, pickDrawingAt, pickFractalAt]);

  // Dismiss the drawing menu on any outside click, wheel scroll, or Escape.
  useEffect(() => {
    if (!drawingMenu) return;
    const close = () => setDrawingMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawingMenu(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("wheel", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [drawingMenu]);

  // Clear drawings function
  const clearDrawings = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const d of drawingsRef.current) {
      if (d.seriesRef) {
        try { chart.removeSeries(d.seriesRef); } catch {}
      }
    }
    drawingsRef.current = [];
  }, []);

  // Sync series to chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    // Apply data transform to all series
    const transformedPaneSeries = dataTransform === "raw"
      ? paneSeries
      : paneSeries.map(s => ({
          ...s,
          data: applyTransform(s.data, dataTransform, zScoreWindow || undefined),
        }));

    // Determine if this pane has the active ticker's close/ohlc
    const hasClose = transformedPaneSeries.some(s => s.metric === "close" && s.ticker === activeTicker);

    // When color-by is active it writes per-point colors into the line data,
    // which suppresses lightweight-charts' built-in point markers (verified in
    // isolation: a per-point-colored line never draws pointMarkers). For L+Dot
    // we then draw the dots via a separate marker-only overlay series keyed
    // `${id}:markers` (plain data, no per-point color, no line).
    const needMarkers =
      chartConfig.chartType === "line-scatter" && !!colorByData && colorByData.size > 0;

    // Remove stale series
    const currentIds = new Set(paneSeries.map((s) => s.id));
    if (needMarkers) {
      for (const s of transformedPaneSeries) {
        if (s.visible && s.data.length > 0) currentIds.add(`${s.id}:markers`);
      }
    }
    // Only keep ohlc if candlestick mode AND raw transform
    if (ohlcData && activeTicker && chartConfig.chartType === "candlestick" && hasClose && dataTransform === "raw") {
      currentIds.add(`${activeTicker}:ohlc`);
    }
    // Remove ohlc key if not candlestick or if transformed
    if (chartConfig.chartType !== "candlestick" || dataTransform !== "raw") {
      currentIds.delete(`${activeTicker}:ohlc`);
    }

    for (const [id, series] of seriesMapRef.current) {
      if (!currentIds.has(id)) {
        try { chart.removeSeries(series); } catch {}
        seriesMapRef.current.delete(id);
      }
    }

    // Remove old indicators
    for (const s of indicatorSeriesRef.current) {
      try { chart.removeSeries(s); } catch {}
    }
    indicatorSeriesRef.current = [];
    fractalLinesRef.current = [];

    // Add OHLC candlestick if this pane has the close series AND chart type is candlestick
    // (only in raw mode — candlestick doesn't make sense for z-score/percentile)
    if (ohlcData && activeTicker && chartConfig.chartType === "candlestick" && hasClose && dataTransform === "raw") {
      const key = `${activeTicker}:ohlc`;
      if (!seriesMapRef.current.has(key)) {
        const closeKey = `${activeTicker}:close`;
        if (seriesMapRef.current.has(closeKey)) {
          try { chart.removeSeries(seriesMapRef.current.get(closeKey)!); } catch {}
          seriesMapRef.current.delete(closeKey);
        }
        const cs = chart.addSeries(CandlestickSeries, {
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderUpColor: "#22c55e",
          borderDownColor: "#ef4444",
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
        });
        cs.setData(ohlcData);
        seriesMapRef.current.set(key, cs);
      } else {
        try { seriesMapRef.current.get(key)!.setData(ohlcData); } catch {}
      }
    }

    // Determine if we have multiple series that need dual axis.
    // When 2+ visible series exist, put the 2nd+ on the left price scale
    // so they each get their own Y-axis and don't distort each other.
    const visibleSeries = transformedPaneSeries.filter(s => s.visible && s.data.length > 0);
    const firstSeriesId = visibleSeries[0]?.id;
    const useLeftScale = visibleSeries.length >= 2;

    // Chart type rendering options
    const isLineScatter = chartConfig.chartType === "line-scatter";
    const isLineLike = chartConfig.chartType === "line" || isLineScatter;

    // Helper: apply per-point gradient colors when colorByData is active
    const applyColorByToData = (data: { time: string; value: number }[]) => {
      if (!colorByData || colorByData.size === 0) return data;
      return data.map(d => {
        const norm = colorByData.get(d.time);
        if (norm !== undefined) {
          return { ...d, color: gradientColorHex(norm) };
        }
        return d;
      });
    };

    // Add/update line series (using transformed data)
    for (const ps of transformedPaneSeries) {
      if (!ps.visible) {
        if (seriesMapRef.current.has(ps.id)) {
          try { chart.removeSeries(seriesMapRef.current.get(ps.id)!); } catch {}
          seriesMapRef.current.delete(ps.id);
        }
        continue;
      }
      if (
        ps.metric === "close" &&
        chartConfig.chartType === "candlestick" &&
        ohlcData &&
        ps.ticker === activeTicker &&
        dataTransform === "raw"
      ) {
        // Rendered as candlestick instead — and remove any line series left
        // over from a previous non-candle render, or it lingers with stale
        // data (invisible under daily candles, visibly divergent in hourly).
        const leftover = seriesMapRef.current.get(ps.id);
        if (leftover) {
          try { chart.removeSeries(leftover); } catch {}
          seriesMapRef.current.delete(ps.id);
        }
        continue;
      }

      if (!seriesMapRef.current.has(ps.id)) {
        const isOverlay = useLeftScale && ps.id !== firstSeriesId && !ps.sharedScale;
        if (ps.seriesType === "area") {
          // Zero-anchored shaded area (baseline series): fill between the value
          // and zero on both sides, tinted from the series color. Used for
          // stacked attribution components, which must share one price scale.
          const fill = (alpha: number) => {
            const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ps.color);
            if (!m) return ps.color;
            return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
          };
          const as = chart.addSeries(BaselineSeries, {
            baseValue: { type: "price", price: 0 },
            topLineColor: ps.color,
            bottomLineColor: ps.color,
            topFillColor1: fill(0.55),
            topFillColor2: fill(0.15),
            bottomFillColor1: fill(0.15),
            bottomFillColor2: fill(0.55),
            lineWidth: (ps.lineWidth ?? 1) as any,
            title: ps.label,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            ...(isOverlay ? { priceScaleId: "left" } : {}),
          });
          as.setData(ps.data);
          seriesMapRef.current.set(ps.id, as as any);
          continue;
        }
        const ls = chart.addSeries(LineSeries, {
          color: ps.color,
          lineWidth: (ps.lineWidth ?? 2) as any,
          lineStyle: ps.lineStyle ?? 0,
          title: ps.label,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: isLineScatter ? 3.5 : 4,
          // For line+scatter, show persistent point markers
          pointMarkersVisible: isLineScatter,
          pointMarkersRadius: isLineScatter ? 2.5 : undefined,
          ...(isOverlay ? { priceScaleId: "left" } : {}),
        });
        ls.setData(applyColorByToData(ps.data));
        seriesMapRef.current.set(ps.id, ls);

        if (isOverlay) {
          chart.applyOptions({
            leftPriceScale: {
              visible: true,
              borderColor: "rgba(255,255,255,0.08)",
              scaleMargins: { top: 0.1, bottom: 0.1 },
            },
          });
        }
      } else if (ps.seriesType === "area") {
        // Baseline-area series: only the data refreshes; line-style options
        // don't apply to it.
        try { seriesMapRef.current.get(ps.id)!.setData(ps.data as any); } catch {}
        continue;
      } else {
        // Update existing series data and style. Include the point-marker opts
        // so switching Line <-> L+Dot on a series that persists across the
        // chart-type change actually toggles the dots (otherwise the markers
        // keep whatever state they had when the series was first created).
        const existing = seriesMapRef.current.get(ps.id)!;
        try {
          existing.applyOptions({
            color: ps.color,
            lineWidth: (ps.lineWidth ?? 2) as any,
            lineStyle: ps.lineStyle ?? 0,
            crosshairMarkerRadius: isLineScatter ? 3.5 : 4,
            pointMarkersVisible: isLineScatter,
            pointMarkersRadius: isLineScatter ? 2.5 : undefined,
          });
          existing.setData(applyColorByToData(ps.data));
        } catch {}
      }

      // Draw L+Dot markers via a dedicated overlay when color-by is on (its
      // per-point colors otherwise hide the line's own point markers). The
      // overlay carries plain data (no per-point color) so its markers render,
      // and rides the same price scale so the dots sit exactly on the line.
      const markerKey = `${ps.id}:markers`;
      if (needMarkers) {
        const isOverlay = useLeftScale && ps.id !== firstSeriesId;
        if (!seriesMapRef.current.has(markerKey)) {
          const mk = chart.addSeries(LineSeries, {
            // No title: LWC would otherwise render a second price-axis tag for
            // it. Empty-title series are also skipped by every crosshair-readout
            // builder, so the overlay stays invisible everywhere but the dots.
            color: ps.color,
            lineVisible: false,
            pointMarkersVisible: true,
            pointMarkersRadius: 2.5,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            ...(isOverlay ? { priceScaleId: "left" } : {}),
          });
          mk.setData(ps.data);
          seriesMapRef.current.set(markerKey, mk);
        } else {
          try {
            const mk = seriesMapRef.current.get(markerKey)!;
            mk.applyOptions({ color: ps.color });
            mk.setData(ps.data);
          } catch {}
        }
      }
    }

    // Hide left scale if no overlays
    if (!useLeftScale) {
      chart.applyOptions({ leftPriceScale: { visible: false } });
    }

    // Indicators on every pane's primary visible series (not just the close pane)
    // For each pane: pick the first visible series as the base data for indicators
    // Use transformed data so indicators (SMA, RSI, MACD etc.) operate on the transformed values
    const primarySeries = transformedPaneSeries.find((s) => s.visible && s.data.length > 0);
    if (primarySeries && primarySeries.data.length > 0) {
      const closeData = primarySeries.data;
      // Short label for indicator titles so you know what series the indicator is computed on
      const baseLabel = primarySeries.metric === "close" ? "" : ` (${primarySeries.metric})`;

      // When an MA has gradient mode on, its solid line is hidden (`lineVisible:
      // false`, so the crosshair marker / last-value tag / legend still work) and a
      // GradientLinePrimitive strokes it faint→full by value instead (low values
      // faint at the bottom of the pane, high values full at the top).
      const attachGradient = (
        s: ISeriesApi<any>,
        data: { time: any; value: number }[],
        key: string,
        colorHex: string,
      ) => {
        const w = IC_W[key] ?? 1;
        const op = IC_O[key] ?? 1;
        (s as any).attachPrimitive(
          new GradientLinePrimitive(data as any, {
            color: colorHex,
            width: w,
            dash: maDashArray(IC_S[key], w),
            startAlpha: op * 0.12,
            endAlpha: op,
          }),
        );
      };

      // ── SMA / EMA / HMA (one line per period — see indicatorPeriods) ──
      const CORE_MA: Array<["sma" | "ema" | "hma", string, (d: typeof closeData, p: number) => typeof closeData]> = [
        ["sma", "SMA", computeSMA],
        ["ema", "EMA", computeEMA],
        ["hma", "HMA", computeHMA],
      ];
      for (const [key, name, compute] of CORE_MA) {
        indicatorPeriods(activeIndicators[key]).forEach((p, pi) => {
          const maData = compute(closeData, p);
          if (maData.length === 0) return;
          const grad = !!IC_G[key];
          const base = shadeHex(IC[key], pi);
          const s = chart.addSeries(LineSeries, {
            color: withOpacity(base, IC_O[key]),
            lineWidth: IC_W[key] as any,
            title: `${name} ${p}${baseLabel}`,
            lineStyle: maLineStyle(IC_S[key]),
            lineVisible: !grad,
          });
          s.setData(maData);
          indicatorSeriesRef.current.push(s);
          if (grad) attachGradient(s, maData, key, base);
        });
      }

      // ── Extended MAs (WMA/KAMA/FRAMA/T3/ALMA/LSMA/SLSMA), driven by Find Best MA ──
      const EXTRA_MA: Array<[keyof ActiveIndicators, MaType, number, string]> = [
        ["wma", "WMA", 1, IC.wma],
        ["dema", "DEMA", 2, IC.dema],
        ["tema", "TEMA", 2, IC.tema],
        ["kama", "KAMA", 2, IC.kama],
        ["frama", "FRAMA", 2, IC.frama],
        ["t3", "T3", 2, IC.t3],
        ["alma", "ALMA", 1, IC.alma],
        ["lsma", "LSMA", 1, IC.lsma],
        ["slsma", "SLSMA", 2, IC.slsma],
      ];
      const closeVals = closeData.map((d) => d.value as number);
      for (const [field, maType, width, color] of EXTRA_MA) {
        indicatorPeriods(activeIndicators[field] as number | number[] | undefined).forEach((period, pi) => {
          const series = computeMaByType(closeVals, period, maType);
          const maData: { time: Time; value: number }[] = [];
          for (let i = 0; i < closeData.length; i++) {
            const v = series[i];
            if (v != null && Number.isFinite(v)) maData.push({ time: closeData[i].time, value: v as number });
          }
          if (maData.length > 0) {
            const grad = !!IC_G[field];
            const base = shadeHex(color, pi);
            const s = chart.addSeries(LineSeries, {
              color: withOpacity(base, IC_O[field]),
              lineWidth: (IC_W[field] ?? width) as any,
              title: `${maType} ${period}${baseLabel}`,
              lineStyle: maLineStyle(IC_S[field]),
              lineVisible: !grad,
            });
            s.setData(maData);
            indicatorSeriesRef.current.push(s);
            if (grad) attachGradient(s, maData, field as string, base);
          }
        });
      }

      // ── Bollinger Bands ── (overlay on main chart)
      if (activeIndicators.bollinger) {
        const { period, mult } = activeIndicators.bollinger;
        const bb = computeBollingerBands(closeData, period, mult);
        if (bb.basis.length > 0) {
          const basisLine = chart.addSeries(LineSeries, {
            color: IC.bollinger_basis,
            lineWidth: 1,
            title: `BB ${period},${mult}${baseLabel}`,
            lineStyle: LineStyle.LargeDashed,
          });
          basisLine.setData(bb.basis);
          indicatorSeriesRef.current.push(basisLine);

          const upperLine = chart.addSeries(LineSeries, {
            color: IC.bollinger_band,
            lineWidth: 1,
            title: `Upper`,
            lineStyle: LineStyle.Dotted,
          });
          upperLine.setData(bb.upper);
          indicatorSeriesRef.current.push(upperLine);

          const lowerLine = chart.addSeries(LineSeries, {
            color: IC.bollinger_band,
            lineWidth: 1,
            title: `Lower`,
            lineStyle: LineStyle.Dotted,
          });
          lowerLine.setData(bb.lower);
          indicatorSeriesRef.current.push(lowerLine);
        }
      }

      // ── VWAP ── (overlay on main chart)
      if (activeIndicators.vwap) {
        const vwapData = computeVWAP(closeData);
        if (vwapData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.vwap,
            lineWidth: 1,
            title: `VWAP${baseLabel}`,
            lineStyle: LineStyle.LargeDashed,
          });
          s.setData(vwapData);
          indicatorSeriesRef.current.push(s);
        }
      }

      // ── Registry-driven overlays (Supertrend, PSAR, Keltner, Donchian, Ichimoku, Kalman, CUSUM, HMM) ──
      // OHLC-based overlays compute on the `ohlcData` prop (the candlestick
      // bars). Close-only overlays (worksOnCloseOnly) also run on ratio /
      // derived panes via synthesized o=h=l=c bars — same rule as the
      // sub-pane indicators.
      {
        const realBars: OhlcBar[] = Array.isArray(ohlcData) && ohlcData.length > 0 ? (ohlcData as OhlcBar[]) : [];
        const closeBars: OhlcBar[] = realBars.length > 0
          ? realBars
          : closeData
              .filter((d) => Number.isFinite(d.value))
              .map((d) => ({ time: String(d.time), open: d.value, high: d.value, low: d.value, close: d.value }));
        const octx = {
          chart,
          colors: IC as unknown as Record<string, string>,
          baseLabel,
          register: (s: ISeriesApi<any>) => indicatorSeriesRef.current.push(s),
        };
        for (const def of OVERLAY_INDICATORS) {
          if (!def.renderOverlay) continue;
          const regSt = activeIndicators.registry?.[def.id];
          if (!regSt?.enabled) continue;
          let bars = def.worksOnCloseOnly ? closeBars : realBars;
          if (!bars.length) continue;
          // Per-indicator compute frequency (weekly/monthly resample).
          if (regSt.freq === "weekly" || regSt.freq === "monthly") {
            bars = resampleIndicatorBars(bars, regSt.freq);
          }
          try {
            def.renderOverlay(octx, bars, resolveParams(def, regSt, (chartConfig as { frequency?: string }).frequency ?? "daily"));
          } catch {
            // Never let one indicator's failure blank the whole chart.
          }
        }
      }

      // ── Hover lookback-window lines (dashed vline N bars behind the
      // crosshair per period indicator, so the compute window is visible) ──
      if (lookbackPrimRef.current && lookbackAnchorRef.current) {
        try {
          (lookbackAnchorRef.current as unknown as { detachPrimitive: (p: unknown) => void }).detachPrimitive(lookbackPrimRef.current);
        } catch {}
      }
      lookbackPrimRef.current = null;
      lookbackAnchorRef.current = null;
      if (activeIndicators.showLookbackWindow !== false) {
        const lbEntries: LookbackEntry[] = [];
        const pushLb = (bars: unknown, color: string, label: string) => {
          if (typeof bars === "number" && Number.isFinite(bars) && bars > 1) {
            lbEntries.push({ bars: Math.round(bars), color, label });
          }
        };
        for (const k of ["sma", "ema", "hma", "wma", "dema", "tema", "kama", "frama", "t3", "alma", "lsma", "slsma"] as const) {
          for (const p of indicatorPeriods((activeIndicators as any)[k])) {
            pushLb(p, (IC as any)[k] ?? "#94a3b8", k.toUpperCase());
          }
        }
        const rsiMult = chartBarsPerIndicatorBar((chartConfig as { frequency?: string }).frequency, activeIndicators.rsiFreq);
        for (const p of indicatorPeriods(activeIndicators.rsi)) {
          pushLb(p * rsiMult, (IC as any).rsi ?? "#a855f7", "RSI");
        }
        pushLb(activeIndicators.bollinger?.period, (IC as any).bollinger_basis ?? "#f59e0b", "BB");
        for (const p of indicatorPeriods(activeIndicators.atr)) pushLb(p, (IC as any).atr ?? "#f59e0b", "ATR");
        for (const p of indicatorPeriods(activeIndicators.roc)) pushLb(p, (IC as any).roc ?? "#38bdf8", "ROC");
        pushLb(activeIndicators.stochastic?.kPeriod, (IC as any).stoch_k ?? "#22c55e", "Stoch");
        if (activeIndicators.mean?.rolling) pushLb(activeIndicators.mean.period, (IC as any).mean ?? "#94a3b8", "Mean");
        for (const [regId, st] of Object.entries(activeIndicators.registry ?? {})) {
          if (!st?.enabled) continue;
          const def = getIndicatorDef(regId);
          if (!def) continue;
          const p = resolveParams(def, st, (chartConfig as { frequency?: string }).frequency ?? "daily");
          // Autocorr on an RSI source windows over RSI values, not price — its
          // line is drawn on the RSI/autocorr sub-chart instead (subLookback).
          if (regId === "autocorr" && (p.source ?? 0) !== 0) continue;
          const barsKey = ["period", "window"].find((k2) => typeof p[k2] === "number" && p[k2] > 1);
          // A weekly/monthly compute-freq override means period/window count
          // RESAMPLED bars — scale to chart bars so the line marks the real span.
          const mult = chartBarsPerIndicatorBar((chartConfig as { frequency?: string }).frequency, st.freq);
          if (barsKey) pushLb(p[barsKey] * mult, (IC as any)[def.colorKeys[0]] ?? "#94a3b8", def.label.split(" ")[0]);
        }
        const lbAnchor = seriesMapRef.current.values().next().value;
        if (lbEntries.length > 0 && lbAnchor) {
          const prim = new LookbackWindowPrimitive();
          (lbAnchor as unknown as { attachPrimitive: (p: unknown) => void }).attachPrimitive(prim);
          prim.setEntries(lbEntries);
          lookbackPrimRef.current = prim;
          lookbackAnchorRef.current = lbAnchor;
        }
      }

      // ATR, ROC, Stochastic, OBV are rendered in separate sub-charts below (see SubIndicatorChart)
      // RSI, MACD, and Heikin-Ashi are rendered in separate sub-charts below (see SubIndicatorChart)

      // ── Mean ± Std Bands ──
      if (activeIndicators.mean) {
        const { rolling, period } = activeIndicators.mean;
        const bandOp = activeIndicators.mean.bandOpacity ?? 0.8;
        const shade = activeIndicators.mean.shade !== false;
        // Band-line colors derive from the mean's own color at the chosen
        // opacity (±2σ slightly fainter than ±1σ), replacing the old
        // hardcoded rgba(...,0.4)/(...,0.25) that was near-invisible.
        const meanRgb = (() => {
          const m = /^#([0-9a-f]{6})$/i.exec(IC.mean ?? "");
          if (!m) return "99, 102, 241";
          const v = parseInt(m[1], 16);
          return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
        })();
        const bandColor = (mult: number) =>
          `rgba(${meanRgb}, ${(Math.abs(mult) === 1 ? bandOp : bandOp * 0.65).toFixed(2)})`;

        if (rolling) {
          // Rolling mean + rolling σ bands
          const rb = computeRollingMeanBands(closeData, period);
          if (rb.mean.length > 0) {
            const ml = chart.addSeries(LineSeries, {
              color: IC.mean,
              lineWidth: 1,
              title: `Rolling Mean ${period}`,
              lineStyle: LineStyle.LargeDashed,
            });
            ml.setData(rb.mean);
            indicatorSeriesRef.current.push(ml);

            for (const b of rb.bands) {
              const bs = chart.addSeries(LineSeries, {
                color: bandColor(b.mult),
                lineWidth: Math.abs(b.mult) === 1 ? 2 : 1,
                title: `${b.mult > 0 ? "+" : ""}${b.mult}σ`,
                lineStyle: LineStyle.Dotted,
              });
              bs.setData(b.data);
              indicatorSeriesRef.current.push(bs);
            }

            // Background shading between the bands so the envelope reads at a
            // glance: light fill across ±2σ, a second pass across ±1σ (the
            // overlap makes the inner band read stronger). Primitives attach
            // to the mean-line series, so they die with it on re-render.
            if (shade) {
              const band = (mult: number) => rb.bands.find((b) => b.mult === mult)?.data as unknown as CloudPoint[] | undefined;
              const fills = (alpha: number) => {
                const c = `rgba(${meanRgb}, ${alpha.toFixed(3)})`;
                return { up: c, down: c };
              };
              const outerA = band(2), outerB = band(-2), innerA = band(1), innerB = band(-1);
              try {
                if (outerA?.length && outerB?.length) {
                  (ml as unknown as { attachPrimitive: (p: unknown) => void })
                    .attachPrimitive(new IchimokuCloudPrimitive(outerA, outerB, fills(0.07 * bandOp)));
                }
                if (innerA?.length && innerB?.length) {
                  (ml as unknown as { attachPrimitive: (p: unknown) => void })
                    .attachPrimitive(new IchimokuCloudPrimitive(innerA, innerB, fills(0.1 * bandOp)));
                }
              } catch {}
            }
          }
        } else {
          // Static mean + σ bands over the lookback window
          const subset = period < closeData.length ? closeData.slice(-period) : closeData;
          const stats = computeMeanAndStdBands(subset);
          if (subset.length >= 2) {
            const first = subset[0].time;
            const last = subset[subset.length - 1].time;

            const meanLine = chart.addSeries(LineSeries, {
              color: IC.mean,
              lineWidth: 1,
              title: `Mean (${stats.mean.toFixed(2)}) [${period}d]`,
              lineStyle: LineStyle.LargeDashed,
            });
            meanLine.setData([
              { time: first, value: stats.mean },
              { time: last, value: stats.mean },
            ]);
            indicatorSeriesRef.current.push(meanLine);

            for (const mult of [1, -1, 2, -2]) {
              const band = chart.addSeries(LineSeries, {
                color: bandColor(mult),
                lineWidth: Math.abs(mult) === 1 ? 2 : 1,
                title: `${mult > 0 ? "+" : ""}${mult}σ`,
                lineStyle: LineStyle.Dotted,
              });
              band.setData([
                { time: first, value: stats.mean + mult * stats.std },
                { time: last, value: stats.mean + mult * stats.std },
              ]);
              indicatorSeriesRef.current.push(band);
            }
          }
        }
      }

      // HA candles are rendered in sub-chart below (see SubIndicatorChart)
    }

    // ── HA Color-Change Signal markers on the primary line series ──
    if (haSignalsPluginRef.current) {
      try { haSignalsPluginRef.current.detach(); } catch {}
      haSignalsPluginRef.current = null;
    }
    if (activeIndicators.haSignals && primarySeries && primarySeries.data.length > 0) {
      const haSmooth2: HASmoothConfig | undefined =
        typeof activeIndicators.heikinAshi === "object" ? activeIndicators.heikinAshi : undefined;
      const signals = computeHASignals(primarySeries.data, haSmooth2);
      // Prefer the line series for markers, but fall back to OHLC candlestick series
      // when in candlestick mode (the line series for "close" is removed)
      let signalTarget = seriesMapRef.current.get(primarySeries.id);
      if (!signalTarget && activeTicker) {
        signalTarget = seriesMapRef.current.get(`${activeTicker}:ohlc`);
      }
      if (!signalTarget) {
        // Last resort: pick the first available series
        signalTarget = seriesMapRef.current.values().next().value;
      }
      if (signalTarget && signals.length > 0) {
        const signalMarkers = signals.map(s => ({
          time: s.time,
          position: s.direction === "bullish" ? "belowBar" : "aboveBar",
          color: s.direction === "bullish" ? IC.ha_signal_bull : IC.ha_signal_bear,
          shape: s.direction === "bullish" ? "arrowUp" : "arrowDown",
          text: s.direction === "bullish" ? "▲" : "▼",
        }));
        signalMarkers.sort((a: any, b: any) => a.time.localeCompare(b.time));
        try {
          haSignalsPluginRef.current = createSeriesMarkers(signalTarget, signalMarkers as SeriesMarker<Time>[]);
        } catch (e) {
          console.warn("Failed to create HA signal markers:", e);
        }
      }
    }

    // ── Fractal trendlines (DojiEmoji auto-trendline) ──
    // Operates on raw OHLC highs/lows. Connects the last two confirmed fractal
    // pivots into resistance/support lines, projected forward to the as-of bar.
    if (
      activeIndicators.fractalLines &&
      Array.isArray(ohlcData) &&
      ohlcData.length > 0
    ) {
      const { n, anchorDate, timeframe } = activeIndicators.fractalLines;
      const daily = (ohlcData as any[])
        .filter((b) => b && typeof b.time === "string")
        .map((b) => ({ time: b.time as string, high: Number(b.high), low: Number(b.low) }));
      // Weekly/Monthly: collapse each period's daily bars into one (high=max,
      // low=min), dated to the period's last bar (a real chart date) so pivots
      // detect weekly/monthly swings.
      const bars =
        timeframe === "weekly" ? resampleWeekly(daily)
        : timeframe === "monthly" ? resampleMonthly(daily)
        : daily;
      const fr = computeFractalTrendlines(bars, n, anchorDate);
      const tfLabel = timeframe === "weekly" ? ", W" : timeframe === "monthly" ? ", M" : "";
      const anchorLabel = anchorDate ? ` @ ${anchorDate}` : "";

      const drawLine = (line: typeof fr.resistance, color: string, label: string) => {
        if (!line || line.points.length < 2) return;
        const s = chart.addSeries(LineSeries, {
          color,
          lineWidth: 4,
          lineStyle: LineStyle.Solid,
          title: label,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          pointMarkersVisible: true,
          pointMarkersRadius: 4,
          autoscaleInfoProvider: () => null,
        });
        s.setData(line.points.map((p) => ({ time: p.time as Time, value: p.value })));
        indicatorSeriesRef.current.push(s);
        fractalLinesRef.current.push({
          points: line.points.map((p) => ({ time: String(p.time), value: p.value })),
        });
      };

      drawLine(fr.resistance, IC.fractal_resistance, `Fractal R (n${fr.n}${tfLabel})${anchorLabel}`);
      drawLine(fr.support, IC.fractal_support, `Fractal S (n${fr.n}${tfLabel})${anchorLabel}`);
    }

    // ── Auto trendlines (pivot-pair RANSAC) ──
    if (activeIndicators.autoTrendlines && detectorOhlc && autoTrendlineResults.length) {
      const lastDate = detectorOhlc.dates[detectorOhlc.dates.length - 1];
      for (const tl of autoTrendlineResults) {
        if (!(tl.date1 <= lastDate)) continue;
        const color = tl.kind === "resistance" ? "#ef5350" : "#26a69a";
        const s = chart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          lineStyle: tl.broken ? LineStyle.Dashed : LineStyle.Solid,
          title: "",
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          autoscaleInfoProvider: () => null,
        });
        s.setData([
          { time: tl.date1 as Time, value: tl.price1 },
          { time: lastDate as Time, value: tl.currentProjection },
        ]);
        indicatorSeriesRef.current.push(s);
      }
    }

    // ── Horizontal support / resistance levels ──
    if (activeIndicators.srLevels && detectorOhlc && srLevelResults.length) {
      const firstDate = detectorOhlc.dates[0];
      const lastDate = detectorOhlc.dates[detectorOhlc.dates.length - 1];
      for (const lv of srLevelResults) {
        const s = chart.addSeries(LineSeries, {
          color: "#60a5fa",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          title: "",
          crosshairMarkerVisible: false,
          lastValueVisible: true,
          priceLineVisible: false,
          autoscaleInfoProvider: () => null,
        });
        s.setData([
          { time: firstDate as Time, value: lv.price },
          { time: lastDate as Time, value: lv.price },
        ]);
        indicatorSeriesRef.current.push(s);
      }
    }

    // ── Fibonacci retracement levels ──
    if (activeIndicators.fibLevels && detectorOhlc && fibLevelResults.length) {
      const firstDate = detectorOhlc.dates[0];
      const lastDate = detectorOhlc.dates[detectorOhlc.dates.length - 1];
      const FIB_COLORS: Record<string, string> = {
        "0": "#94a3b8", "0.236": "#22c55e", "0.382": "#84cc16",
        "0.5": "#eab308", "0.618": "#f59e0b", "0.786": "#f97316", "1": "#94a3b8",
      };
      for (const f of fibLevelResults) {
        const s = chart.addSeries(LineSeries, {
          color: FIB_COLORS[String(f.ratio)] || "#eab308",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          title: "",
          crosshairMarkerVisible: false,
          lastValueVisible: true,
          priceLineVisible: false,
          autoscaleInfoProvider: () => null,
        });
        s.setData([
          { time: firstDate as Time, value: f.price },
          { time: lastDate as Time, value: f.price },
        ]);
        indicatorSeriesRef.current.push(s);
      }
    }

    // ── Chart patterns (Pattern Recognition) ──
    // Index into the SAME (possibly weekly/monthly-resampled) bars detection ran
    // on — their dates are real trading days, so they plot on the daily chart.
    if (patternResults.patterns.length && patternResults.bars.length) {
      const timeAt = (idx: number) => patternResults.bars[idx]?.time;
      for (const pat of patternResults.patterns) {
        const color = pat.direction > 0 ? "#26a69a" : pat.direction < 0 ? "#ef5350" : "#3b82f6";
        let labelSeries: ISeriesApi<any> | null = null;
        for (const ln of pat.lines) {
          const data = ln.points
            .map((p) => ({ time: timeAt(p.idx) as Time, value: p.price }))
            .filter((d) => d.time != null)
            .sort((a, b) => String(a.time).localeCompare(String(b.time)));
          if (data.length < 2) continue;
          const s = chart.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            lineStyle: ln.dashed ? LineStyle.Dashed : LineStyle.Solid,
            title: "",
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            pointMarkersVisible: true,
            pointMarkersRadius: 3,
            autoscaleInfoProvider: () => null,
          });
          s.setData(data);
          indicatorSeriesRef.current.push(s);
          if (!labelSeries) labelSeries = s;
        }
        if (labelSeries) {
          const endTime = timeAt(pat.endIdx);
          if (endTime) {
            try {
              createSeriesMarkers(labelSeries, [{
                time: endTime as Time,
                position: pat.direction < 0 ? "aboveBar" : "belowBar",
                color,
                shape: pat.direction > 0 ? "arrowUp" : pat.direction < 0 ? "arrowDown" : "circle",
                text: pat.label,
              }] as SeriesMarker<Time>[]);
            } catch {}
          }
        }
      }
    }

    // ── Clean up previous primitives (quarter shading + vertical lines) ──
    // Detach quarter shading primitive
    if (quarterShadingCleanupRef.current) {
      quarterShadingCleanupRef.current();
      quarterShadingCleanupRef.current = null;
    }
    // Detach vertical line primitives
    for (const prim of vertLinePrimitivesRef.current) {
      try {
        for (const s of seriesMapRef.current.values()) {
          try { s.detachPrimitive(prim); } catch {}
        }
        for (const s of indicatorSeriesRef.current) {
          try { s.detachPrimitive(prim); } catch {}
        }
      } catch {}
    }
    vertLinePrimitivesRef.current = [];
    if (markersPluginRef.current) {
      try { markersPluginRef.current.detach(); } catch {}
      markersPluginRef.current = null;
    }

    // Get first series for attaching primitives
    const firstSeries = seriesMapRef.current.values().next().value;

    // ── Quarter shading via canvas primitive ──
    if (showQuarterShading && firstSeries && containerRef.current) {
      quarterShadingCleanupRef.current = attachQuarterShading(
        chart,
        containerRef.current,
        firstSeries,
      );
    }

    // ── Earnings & Ex-Div & Macro vertical lines ──
    {
      const lineEntries: { time: string; color: string; label?: string }[] = [];
      for (const d of earningsDates) {
        lineEntries.push({ time: d, color: "#f59e0b", label: "E" });
      }
      for (const d of exDivDates) {
        lineEntries.push({ time: d, color: "#8b5cf6", label: "D" });
      }
      for (const e of macroEventLines) {
        lineEntries.push(e);
      }
      for (const e of fyBoundaryLines) {
        lineEntries.push(e);
      }
      // Fractal "as-of" anchor marker — shows the point in time the lines are drawn at.
      if (activeIndicators.fractalLines?.anchorDate) {
        lineEntries.push({
          time: activeIndicators.fractalLines.anchorDate,
          color: "rgba(148, 163, 184, 0.7)",
          label: "⚓",
        });
      }

      if (lineEntries.length > 0 && firstSeries) {
        const primitive = new VerticalLinePrimitive(lineEntries);
        try {
          firstSeries.attachPrimitive(primitive);
          vertLinePrimitivesRef.current.push(primitive);
        } catch (e) {
          console.warn("Failed to attach vertical line primitive:", e);
        }
      }
    }

    // Only fitContent when underlying series data actually changes (new ticker,
    // new metric, data refresh), NOT when indicators/markers/transforms toggle.
    // This prevents the scroll "bounce-back" where the user pans the chart and
    // it snaps back to full range on the next render.
    const dataFingerprint = paneSeries.map(s => `${s.id}:${s.data.length}:${s.visible}`).join("|") + `|ohlc:${ohlcData?.length ?? 0}|transform:${dataTransform}|win:${zScoreWindow}`;
    if (dataFingerprint !== prevDataFingerprintRef.current) {
      prevDataFingerprintRef.current = dataFingerprint;
      // Fit to this pane's REAL data extent rather than chart.fitContent(), which
      // would zoom out to the full spacer axis. This keeps a single pane framed on
      // its own data; multi-pane alignment is handled by ChartArea's coordinated
      // sync, which copies the reference pane's range onto the shared time axis.
      try {
        const realTimes: string[] = [];
        for (const s of transformedPaneSeries) {
          if (s.visible && s.data.length) {
            realTimes.push(s.data[0].time, s.data[s.data.length - 1].time);
          }
        }
        if (ohlcData?.length) {
          realTimes.push(ohlcData[0].time, ohlcData[ohlcData.length - 1].time);
        }
        if (spacerSeriesRef.current && realTimes.length) {
          realTimes.sort();
          chart.timeScale().setVisibleRange({
            from: realTimes[0] as Time,
            to: realTimes[realTimes.length - 1] as Time,
          });
        } else {
          chart.timeScale().fitContent();
        }
      } catch {
        try { chart.timeScale().fitContent(); } catch {}
      }
    }

    // Notify parent about current series map for crosshair sync
    onSeriesMapUpdate?.(paneId, seriesMapRef.current);
  }, [paneSeries, ohlcData, activeTicker, chartConfig, activeIndicators, chartReady, earningsDates, exDivDates, macroEventLines, fyBoundaryLines, dataTransform, zScoreWindow, showQuarterShading, colorByData, IC, IC_W, IC_S, IC_O, IC_G, detectorOhlc, autoTrendlineResults, srLevelResults, fibLevelResults, patternResults, patternBars]);

  // Toolbar "Labels" toggle: hide/show the right-axis last-value badges +
  // price lines on every series in this pane. Runs AFTER the render effect
  // above (definition order) so freshly recreated series get the state too.
  // Marker-carrier series (":markers" keys) are permanently badge-less — skip
  // them so re-showing doesn't surface badges that never existed.
  const axisLabelsOn = (chartConfig as { axisLabels?: boolean }).axisLabels !== false;
  const priceLinesOn = (chartConfig as { priceLines?: boolean }).priceLines !== false;
  useEffect(() => {
    if (!chartReady) return;
    for (const [key, s] of seriesMapRef.current) {
      if (key.endsWith(":markers")) continue;
      setSeriesAxisLabels(s, axisLabelsOn, priceLinesOn);
    }
    for (const s of indicatorSeriesRef.current) {
      setSeriesAxisLabels(s, axisLabelsOn, priceLinesOn);
    }
  }, [axisLabelsOn, priceLinesOn, chartReady, paneSeries, ohlcData, activeIndicators, chartConfig, dataTransform, IC, IC_W, IC_S, IC_O, IC_G, colorByData]);

  // ── Seed persistence: clear any previously-applied seed series when the ticker changes ──
  // Seed series are tagged with ids beginning "sr-seed-" / "tl-seed-"; everything else
  // (user-drawn lines) is preserved.
  useEffect(() => {
    const chart = chartRef.current;
    if (chart) {
      const kept: Drawing[] = [];
      for (const d of drawingsRef.current) {
        const id = d.id || "";
        if (id.startsWith("sr-seed-") || id.startsWith("tl-seed-")) {
          if (d.seriesRef) {
            try { chart.removeSeries(d.seriesRef); } catch {}
          }
        } else {
          kept.push(d);
        }
      }
      drawingsRef.current = kept;
    }
    appliedSeedsRef.current = new Set();
  }, [activeTicker]);

  // ── Seed persistence: when another tab/page writes seeds and dispatches
  // "reit-viz-seeds-restored", drop already-applied seed series and re-run the
  // restore effects (via the nonce) so the new seeds get drawn. ──
  useEffect(() => {
    const handleSeedsRestored = () => {
      const chart = chartRef.current;
      if (chart) {
        const kept: Drawing[] = [];
        for (const d of drawingsRef.current) {
          const id = d.id || "";
          if (id.startsWith("sr-seed-") || id.startsWith("tl-seed-")) {
            if (d.seriesRef) {
              try { chart.removeSeries(d.seriesRef); } catch {}
            }
          } else {
            kept.push(d);
          }
        }
        drawingsRef.current = kept;
      }
      appliedSeedsRef.current = new Set();
      setSeedRestoreNonce((n) => n + 1);
    };
    window.addEventListener("reit-viz-seeds-restored", handleSeedsRestored);
    return () => window.removeEventListener("reit-viz-seeds-restored", handleSeedsRestored);
  }, []);

  // Hour marks on the time axis in intraday mode. Hourly axes carry years of
  // bars (~7/day), far more than one bar per pixel — the default minBarSpacing
  // of 1 would cap the visible window at ~chart-width bars, silently clamping
  // 5Y/Max to the last few months.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    try {
      chart.applyOptions({
        timeScale: { timeVisible: intraday, secondsVisible: false, minBarSpacing: intraday ? 0.05 : 1 },
      });
    } catch {}
  }, [intraday, chartReady]);

  // ── Restore persisted trendline seeds for the active ticker ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady || !activeTicker || intraday) return;
    // Collect the metrics rendered in this pane so each seed lands on a matching pane.
    const paneMetrics = new Set<string>();
    for (const s of paneSeries) {
      if (s?.metric) paneMetrics.add(String(s.metric));
    }
    if (paneMetrics.size === 0) return;

    const SEEDS_KEY = "reit-viz-trendline-seeds-v1";
    const PERSIST_KEY = "reit-viz-trendline-persistent-v1";
    const MAX_AGE_MS = 1440 * 60 * 1000;
    const now = Date.now();
    const isFresh = (x: any) => !x || typeof x.createdAt !== "number" || now - x.createdAt <= MAX_AGE_MS;

    let seedsStore: Record<string, any[]> = {};
    let persistStore: Record<string, any[]> = {};
    try { seedsStore = JSON.parse(localStorage.getItem(SEEDS_KEY) || "{}"); } catch {}
    try { persistStore = JSON.parse(localStorage.getItem(PERSIST_KEY) || "{}"); } catch {}

    // Prune expired persistent entries.
    let pruned = false;
    for (const key of Object.keys(persistStore)) {
      const arr = Array.isArray(persistStore[key]) ? persistStore[key] : [];
      const fresh = arr.filter(isFresh);
      if (fresh.length !== arr.length) { persistStore[key] = fresh; pruned = true; }
      if (fresh.length === 0) delete persistStore[key];
    }
    if (pruned) { try { localStorage.setItem(PERSIST_KEY, JSON.stringify(persistStore)); } catch {} }

    const upper = activeTicker.toUpperCase();
    const seedList = Array.isArray(seedsStore[upper]) ? seedsStore[upper] : [];
    const persistList = Array.isArray(persistStore[upper]) ? persistStore[upper] : [];
    const visibleSeeds = seedList.filter((x: any) => !x?.hidden && isFresh(x));
    const visiblePersist = persistList.filter((x: any) => !x?.hidden && isFresh(x));
    const sig = (x: any) =>
      `tl|${x.kind}|${x.date1}|${x.price1}|${x.date2}|${x.price2}|${x.broken ? 1 : 0}|${x.futureBars}|${x.metric || "close"}`;
    const persistToApply = visiblePersist.filter((x: any) => !appliedSeedsRef.current.has(sig(x)));

    const seen = new Set<string>();
    const merged: any[] = [];
    for (const x of visibleSeeds) {
      const s = sig(x);
      if (!seen.has(s)) { seen.add(s); merged.push(x); }
    }
    for (const x of persistToApply) {
      const s = sig(x);
      if (!seen.has(s)) { seen.add(s); merged.push(x); }
    }
    if (merged.length === 0) return;

    // Only apply seeds whose metric matches a series shown in this pane.
    const matching: any[] = [];
    const waiting: any[] = [];
    for (const x of merged) {
      const metric = String(x?.metric || "close");
      if (paneMetrics.has(metric)) matching.push(x); else waiting.push(x);
    }
    if (matching.length === 0) {
      if (waiting.length > 0) {
        console.log(
          `[ChartPane] ${waiting.length} trendline seed(s) waiting for a matching pane (metrics: ${[...new Set(waiting.map((x) => x?.metric || "close"))].join(", ")}).`
        );
      }
      return;
    }

    // Build the sorted set of available bar times across ohlc + line series.
    const times: string[] = [];
    if (ohlcData && Array.isArray(ohlcData)) {
      for (const bar of ohlcData) if (bar && typeof bar.time === "string") times.push(bar.time);
    }
    for (const s of paneSeries) {
      if (s?.data) for (const pt of s.data) if (typeof pt.time === "string") times.push(pt.time);
    }
    const allTimes = [...new Set(times)].sort();
    if (allTimes.length < 2) return;
    const lastTime = allTimes[allTimes.length - 1];

    let applied = 0;
    for (const seed of matching) {
      try {
        const fb = Math.max(0, Math.min(500, parseInt(seed.futureBars) || 60));
        const startDate = seed.date1;
        const startPrice = Number(seed.price1);
        const slope = Number(seed.slope);
        if (!startDate || !Number.isFinite(startPrice) || !Number.isFinite(slope)) continue;

        let startIdx = allTimes.indexOf(startDate);
        if (startIdx < 0) {
          for (let i = 0; i < allTimes.length; i++) {
            if (allTimes[i] >= startDate) { startIdx = i; break; }
          }
        }
        if (startIdx < 0) startIdx = 0;

        const linePts: { time: string; value: number }[] = [];
        for (let i = startIdx; i < allTimes.length; i++) {
          const v = startPrice + slope * (i - startIdx);
          if (Number.isFinite(v) && v > 0) linePts.push({ time: allTimes[i], value: v });
        }

        const futureTimes = fb > 0 ? generateFutureBars(lastTime, fb) : [];
        const futurePts: { time: string; value: number }[] = [];
        for (let i = 0; i < futureTimes.length; i++) {
          const idxFromStart = allTimes.length - 1 + i + 1 - startIdx;
          const v = startPrice + slope * idxFromStart;
          if (Number.isFinite(v) && v > 0) futurePts.push({ time: futureTimes[i], value: v });
        }

        const isResistance = seed.kind === "resistance";
        const mainColor = isResistance ? "#ef4444" : "#22c55e";
        const futureColor = isResistance ? "#fca5a5" : "#86efac";
        const mainStyle = seed.broken ? LineStyle.Dashed : LineStyle.Solid;

        if (linePts.length >= 2) {
          const ls = chart.addSeries(LineSeries, {
            color: mainColor,
            lineWidth: 2,
            lineStyle: mainStyle,
            priceLineVisible: false,
            lastValueVisible: false,
            title: "",
            crosshairMarkerVisible: false,
            autoscaleInfoProvider: () => null,
          });
          ls.setData(linePts as any);
          drawingsRef.current.push({
            id: `tl-seed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: "trendline",
            color: mainColor,
            points: [
              { time: allTimes[startIdx], price: startPrice },
              { time: allTimes[allTimes.length - 1], price: startPrice + slope * (allTimes.length - 1 - startIdx) },
            ],
            seriesRef: ls,
          });
        }

        if (futurePts.length > 0) {
          const segPts: { time: string; value: number }[] = [];
          if (linePts.length > 0) segPts.push(linePts[linePts.length - 1]);
          segPts.push(...futurePts);
          const fs = chart.addSeries(LineSeries, {
            color: futureColor,
            lineWidth: 2,
            lineStyle: LineStyle.Dotted,
            priceLineVisible: false,
            lastValueVisible: false,
            title: "",
            crosshairMarkerVisible: false,
            autoscaleInfoProvider: () => null,
          });
          fs.setData(segPts as any);
          drawingsRef.current.push({
            id: `tl-seed-fut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: "trendline",
            color: futureColor,
            points: segPts.map((p) => ({ time: String(p.time), price: p.value })),
            seriesRef: fs,
          });
        }
        applied++;
      } catch (e) {
        console.warn("[ChartPane] failed to apply trendline seed", e);
      }
    }

    for (const seed of matching) appliedSeedsRef.current.add(sig(seed));

    if (applied > 0) {
      try {
        // Consume one-shot seeds (the persistent copy is retained).
        if (visibleSeeds.length > 0) {
          const appliedSigs = new Set(matching.map(sig));
          const remaining = seedList.filter((x: any) => !appliedSigs.has(sig(x)));
          if (remaining.length === 0) delete seedsStore[upper]; else seedsStore[upper] = remaining;
          localStorage.setItem(SEEDS_KEY, JSON.stringify(seedsStore));
        }
        console.log(`[ChartPane] Applied ${applied} trendline seed(s) for ${upper} (persistent retained).`);
        onDrawingAdded?.();
      } catch {}
    }
  }, [activeTicker, chartReady, ohlcData, paneSeries, seedRestoreNonce]);

  // ── Restore persisted support/resistance level seeds for the active ticker ──
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady || !activeTicker || intraday) return;
    // S/R levels only apply to close/ratio panes.
    if (!paneSeries.some((s) => s?.metric === "close" || s?.metric === "ratio")) return;

    const SEEDS_KEY = "reit-viz-srlevel-seeds-v1";
    const PERSIST_KEY = "reit-viz-srlevel-persistent-v1";
    const MAX_AGE_MS = 1440 * 60 * 1000;
    const now = Date.now();
    const isFresh = (x: any) => !x || typeof x.createdAt !== "number" || now - x.createdAt <= MAX_AGE_MS;

    let seedsStore: Record<string, any[]> = {};
    let persistStore: Record<string, any[]> = {};
    try { seedsStore = JSON.parse(localStorage.getItem(SEEDS_KEY) || "{}"); } catch {}
    try { persistStore = JSON.parse(localStorage.getItem(PERSIST_KEY) || "{}"); } catch {}

    let pruned = false;
    for (const key of Object.keys(persistStore)) {
      const arr = Array.isArray(persistStore[key]) ? persistStore[key] : [];
      const fresh = arr.filter(isFresh);
      if (fresh.length !== arr.length) { persistStore[key] = fresh; pruned = true; }
      if (fresh.length === 0) delete persistStore[key];
    }
    if (pruned) { try { localStorage.setItem(PERSIST_KEY, JSON.stringify(persistStore)); } catch {} }

    const upper = activeTicker.toUpperCase();
    const seedList = Array.isArray(seedsStore[upper]) ? seedsStore[upper] : [];
    const persistList = Array.isArray(persistStore[upper]) ? persistStore[upper] : [];
    const visibleSeeds = seedList.filter((x: any) => !x?.hidden && isFresh(x));
    const visiblePersist = persistList.filter((x: any) => !x?.hidden && isFresh(x));
    const sig = (x: any) =>
      `sr|${x.type}|${x.price}|${x.price2 ?? ""}|${x.maType ?? ""}|${x.maPeriod ?? ""}|${x.fibLevel ?? ""}|${x.futureBars}`;
    const persistToApply = visiblePersist.filter((x: any) => !appliedSeedsRef.current.has(sig(x)));

    const seen = new Set<string>();
    const merged: any[] = [];
    for (const x of visibleSeeds) {
      const s = sig(x);
      if (!seen.has(s)) { seen.add(s); merged.push(x); }
    }
    for (const x of persistToApply) {
      const s = sig(x);
      if (!seen.has(s)) { seen.add(s); merged.push(x); }
    }
    if (merged.length === 0) return;

    // Build aligned time/value arrays for the close (or ratio) series.
    const seriesTimes: string[] = [];
    const seriesValues: number[] = [];
    if (ohlcData && Array.isArray(ohlcData)) {
      for (const bar of ohlcData) {
        if (bar && typeof bar.time === "string" && Number.isFinite(bar.close)) {
          seriesTimes.push(bar.time); seriesValues.push(bar.close);
        }
      }
    }
    if (seriesTimes.length < 2) {
      for (const s of paneSeries) {
        if (s?.data) {
          for (const pt of s.data) {
            if (typeof pt.time === "string" && Number.isFinite(pt.value)) {
              seriesTimes.push(pt.time); seriesValues.push(pt.value);
            }
          }
          if (seriesTimes.length >= 2) break;
        }
      }
    }
    if (seriesTimes.length < 2) return;
    const lastTime = seriesTimes[seriesTimes.length - 1];
    const firstTime = seriesTimes[0];

    let applied = 0;
    for (const seed of merged) {
      try {
        const fb = Math.max(0, Math.min(500, parseInt(seed.futureBars) || 60));
        const price = Number(seed.price);
        if (!Number.isFinite(price)) continue;
        const isAbove = price > (seriesValues[seriesValues.length - 1] ?? price);
        const mainColor = isAbove ? "#ef4444" : "#22c55e";
        const futureColor = isAbove ? "#fca5a5" : "#86efac";

        if (seed.type === "horizontal" || seed.type === "fib") {
          const linePts = [
            { time: firstTime, value: price },
            { time: lastTime, value: price },
          ];
          const style = seed.type === "fib" ? LineStyle.Dashed : LineStyle.Solid;
          const ls = chart.addSeries(LineSeries, {
            color: mainColor,
            lineWidth: 2,
            lineStyle: style,
            priceLineVisible: false,
            lastValueVisible: false,
            title: "",
            crosshairMarkerVisible: false,
            autoscaleInfoProvider: () => null,
          });
          ls.setData(linePts as any);
          drawingsRef.current.push({
            id: `sr-seed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: "trendline",
            color: mainColor,
            points: [
              { time: firstTime, price },
              { time: lastTime, price },
            ],
            seriesRef: ls,
          });

          if (fb > 0) {
            const futureTimes = generateFutureBars(lastTime, fb);
            if (futureTimes.length > 0) {
              const segPts = [
                { time: lastTime, value: price },
                ...futureTimes.map((t) => ({ time: t, value: price })),
              ];
              const fs = chart.addSeries(LineSeries, {
                color: futureColor,
                lineWidth: 2,
                lineStyle: LineStyle.Dotted,
                priceLineVisible: false,
                lastValueVisible: false,
                title: "",
                crosshairMarkerVisible: false,
                autoscaleInfoProvider: () => null,
              });
              fs.setData(segPts as any);
              drawingsRef.current.push({
                id: `sr-seed-fut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                type: "trendline",
                color: futureColor,
                points: segPts.map((p) => ({ time: String(p.time), price: p.value })),
                seriesRef: fs,
              });
            }
          }
          applied++;
        } else if (seed.type === "gapzone" && Number.isFinite(Number(seed.price2))) {
          // Unfilled price gap: shaded band between the fill level (solid edge)
          // and the far edge of the gap (dashed), extended futureBars ahead.
          // Colored by gap direction: up-gaps green (support below), down-gaps red.
          const price2 = Number(seed.price2);
          const dirUp = seed.direction !== "down";
          const zoneColor = dirUp ? "#22c55e" : "#ef4444";
          const zoneFill = dirUp ? "rgba(34, 197, 94, 0.22)" : "rgba(239, 68, 68, 0.22)";
          // Start the band at the gap date when it's inside the series range.
          const startIdx = typeof seed.gapDate === "string" ? seriesTimes.indexOf(seed.gapDate) : -1;
          const bandTimes = seriesTimes.slice(Math.max(0, startIdx));
          const futureTimes = fb > 0 ? generateFutureBars(lastTime, fb) : [];
          const allTimes = [...bandTimes, ...futureTimes];
          if (allTimes.length >= 2) {
            const mkLine = (level: number, style: LineStyle) => {
              const s = chart.addSeries(LineSeries, {
                color: zoneColor,
                lineWidth: style === LineStyle.Solid ? 2 : 1,
                lineStyle: style,
                priceLineVisible: false,
                lastValueVisible: false,
                title: "",
                crosshairMarkerVisible: false,
                autoscaleInfoProvider: () => null,
              });
              s.setData(allTimes.map((t) => ({ time: t, value: level })) as any);
              drawingsRef.current.push({
                id: `sr-seed-gap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                type: "trendline",
                color: zoneColor,
                points: [
                  { time: allTimes[0], price: level },
                  { time: allTimes[allTimes.length - 1], price: level },
                ],
                seriesRef: s,
              });
              return s;
            };
            const fillLine = mkLine(price, LineStyle.Solid);
            mkLine(price2, LineStyle.Dashed);
            // Shade between the two edges (per-bar points so the fill survives
            // edges scrolling off-screen, same approach as the Ichimoku kumo).
            const top = Math.max(price, price2);
            const bottom = Math.min(price, price2);
            const topPts = allTimes.map((t) => ({ time: t, value: top })) as unknown as CloudPoint[];
            const botPts = allTimes.map((t) => ({ time: t, value: bottom })) as unknown as CloudPoint[];
            const band = new IchimokuCloudPrimitive(topPts, botPts, { up: zoneFill, down: zoneFill });
            (fillLine as unknown as { attachPrimitive: (p: unknown) => void }).attachPrimitive(band);
            applied++;
          }
        } else if (seed.type === "ma" && seed.maType && seed.maPeriod && seriesValues.length >= seed.maPeriod) {
          // Build time-keyed data points and run the matching MA from the indicators lib.
          const maInput: { time: string; value: number }[] = [];
          for (let i = 0; i < seriesTimes.length; i++) {
            maInput.push({ time: seriesTimes[i], value: seriesValues[i] });
          }
          const maType = String(seed.maType).toUpperCase();
          const maData =
            maType === "EMA" ? computeEMA(maInput, seed.maPeriod)
            : maType === "HMA" ? computeHMA(maInput, seed.maPeriod)
            : computeSMA(maInput, seed.maPeriod);
          const maPts = maData.filter((p) => Number.isFinite(p.value));
          if (maPts.length >= 2) {
            const ls = chart.addSeries(LineSeries, {
              color: mainColor,
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: false,
              title: "",
              crosshairMarkerVisible: false,
              autoscaleInfoProvider: () => null,
            });
            ls.setData(maPts as any);
            drawingsRef.current.push({
              id: `sr-seed-ma-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: "trendline",
              color: mainColor,
              points: [
                { time: maPts[0].time, price: maPts[0].value },
                { time: maPts[maPts.length - 1].time, price: maPts[maPts.length - 1].value },
              ],
              seriesRef: ls,
            });
            applied++;
          }
        }
      } catch (e) {
        console.warn("[ChartPane] failed to apply S/R level seed", e);
      }
    }

    for (const seed of merged) appliedSeedsRef.current.add(sig(seed));

    if (applied > 0) {
      try {
        if (visibleSeeds.length > 0) {
          delete seedsStore[upper];
          localStorage.setItem(SEEDS_KEY, JSON.stringify(seedsStore));
        }
        console.log(`[ChartPane] Applied ${applied} S/R level seed(s) for ${upper} (persistent retained).`);
        onDrawingAdded?.();
      } catch {}
    }
  }, [activeTicker, chartReady, ohlcData, paneSeries, seedRestoreNonce]);

  // Time range — applied on button change AND re-applied when the pane's series
  // data arrives/changes (rangeDataKey). A pane restored before its series load
  // has an empty chart: setVisibleRange throws ("Value is null"), the fallback
  // is a no-op, and without the re-apply the pane stays stuck on a stale window
  // with the range buttons dead until something else reloads the series.
  const rangeDataKey =
    paneSeries.map((s) => `${s.id}:${s.data.length}:${s.visible}`).join("|") +
    `|ohlc:${ohlcData?.length ?? 0}`;
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    const now = new Date();
    let from: Date | null = null;
    switch (timeRange) {
      case "1Y": from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
      case "3Y": from = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()); break;
      case "5Y": from = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate()); break;
      case "YTD": from = new Date(now.getFullYear(), 0, 1); break;
      default: from = null; // Max
    }

    if (intraday) {
      // Epoch-second axis in hourly mode
      try {
        if (from === null) {
          chart.timeScale().fitContent();
        } else {
          chart.timeScale().setVisibleRange({
            from: Math.floor(from.getTime() / 1000) as unknown as Time,
            to: Math.floor(now.getTime() / 1000) as unknown as Time,
          });
        }
      } catch {
        try { chart.timeScale().fitContent(); } catch {}
      }
      return;
    }

    // Daily axis: clamp the window to the pane's REAL data extent. The spacer
    // series spans the full global date axis, so Max via fitContent() would zoom
    // far past the pane's own data, and an unclamped window can sit entirely on
    // empty axis (blank pane).
    const realTimes: string[] = [];
    for (const s of paneSeries) {
      if (s.visible && s.data.length) {
        realTimes.push(String(s.data[0].time), String(s.data[s.data.length - 1].time));
      }
    }
    if (ohlcData?.length) {
      realTimes.push(String(ohlcData[0].time), String(ohlcData[ohlcData.length - 1].time));
    }
    if (!realTimes.length) {
      // Nothing loaded yet — rangeDataKey re-runs this effect once data lands.
      try { chart.timeScale().fitContent(); } catch {}
      return;
    }
    realTimes.sort();
    const first = realTimes[0];
    const last = realTimes[realTimes.length - 1];

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let fromStr = from === null ? first : fmt(from);
    let toStr = fmt(now);
    if (fromStr < first) fromStr = first;
    if (toStr > last) toStr = last;
    if (fromStr > toStr) fromStr = first;

    try {
      chart.timeScale().setVisibleRange({ from: fromStr as Time, to: toStr as Time });
    } catch {
      try { chart.timeScale().fitContent(); } catch {}
    }
  }, [timeRange, chartReady, intraday, rangeDataKey]);

  // Resize when container changes
  useEffect(() => {
    if (!chartRef.current || !containerRef.current) return;
    const resize = () => {
      // The deferred timeouts below can fire after unmount (fast page
      // navigation) — both refs may already be null.
      if (!containerRef.current || !chartRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height });
      }
    };
    const t1 = setTimeout(resize, 0);
    const t2 = setTimeout(resize, 50);
    const t3 = setTimeout(resize, 200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  });

  // Determine which sub-indicator charts to show
  const subCharts: SubChartType[] = [];
  if (indicatorPeriods(activeIndicators.rsi).length > 0) subCharts.push("rsi");
  if (activeIndicators.macd) subCharts.push("macd");
  if (activeIndicators.heikinAshi) subCharts.push("ha");
  if (indicatorPeriods(activeIndicators.atr).length > 0) subCharts.push("atr");
  if (indicatorPeriods(activeIndicators.roc).length > 0) subCharts.push("roc");
  if (activeIndicators.stochastic) subCharts.push("stochastic");
  if (activeIndicators.obv) subCharts.push("obv");
  // Registry-driven sub-pane indicators (see indicatorRegistry.ts).
  for (const def of PANE_INDICATORS) {
    if (activeIndicators.registry?.[def.id]?.enabled) subCharts.push(def.id);
  }
  // Derived overlay panes (MACD/RSI/ROC/Autocorr ON another indicator) slot
  // in right after their source pane.
  const paneOverlayDefs = (activeIndicators.indicatorOverlays ?? []).filter((o) => PANE_OVERLAY_TYPES.has(o.type));
  if (paneOverlayDefs.length > 0) {
    const interleaved: SubChartType[] = [];
    for (const st of subCharts) {
      interleaved.push(st);
      for (const o of paneOverlayDefs) if (o.source === st) interleaved.push(`ovl:${o.id}`);
    }
    subCharts.length = 0;
    subCharts.push(...interleaved);
  }
  // Temporarily hidden subplots unmount entirely (state stays enabled).
  const hiddenSet = new Set(activeIndicators.hiddenSubCharts ?? []);
  const visibleSubCharts = subCharts.filter((st) => !hiddenSet.has(st));

  // Raw price OHLC bars for registry pane indicators (need real high/low).
  const ohlcBars: OhlcBar[] = Array.isArray(ohlcData) ? (ohlcData as OhlcBar[]) : [];

  // Lookback-window hover entries routed to a SUB-chart instead of the main
  // price chart: autocorr on an RSI source windows over RSI values, so its
  // line belongs on the RSI sub-chart (falls back to autocorr's own sub-chart
  // when the RSI panel is off). Memoized — a fresh array every render would
  // recreate the sub-charts on every ChartPane render.
  const subLookback = useMemo(() => {
    const out: Record<string, LookbackEntry[]> = {};
    if (activeIndicators.showLookbackWindow === false) return out;
    const acSt = activeIndicators.registry?.["autocorr"];
    if (acSt?.enabled) {
      const def = getIndicatorDef("autocorr");
      if (def) {
        const p = resolveParams(def, acSt, (chartConfig as { frequency?: string }).frequency ?? "daily");
        if ((p.source ?? 0) !== 0 && typeof p.window === "number" && p.window > 1) {
          const target = indicatorPeriods(activeIndicators.rsi).length > 0 ? "rsi" : "autocorr";
          const mult = chartBarsPerIndicatorBar((chartConfig as { frequency?: string }).frequency, acSt.freq);
          out[target] = [{
            bars: Math.round(p.window * mult),
            color: (IC as Record<string, string>).autocorr_line ?? "#e879f9",
            label: "AC",
          }];
        }
      }
    }
    // Derived overlay panes window over their SOURCE indicator's values, so
    // their lookback lines belong on the source sub-chart (e.g. autocorr-on-
    // RSI's trailing window renders on the RSI pane).
    for (const o of activeIndicators.indicatorOverlays ?? []) {
      if (!PANE_OVERLAY_TYPES.has(o.type)) continue;
      const bars = o.type === "macd" ? (o.slow ?? 26) : o.period;
      if (!(bars > 1)) continue;
      // RSI sources may be resampled (weekly/monthly RSI on a daily chart) —
      // scale the window into chart bars like the registry autocorr does.
      const srcFreq = o.source === "rsi" ? activeIndicators.rsiFreq : undefined;
      const mult = srcFreq === "weekly" || srcFreq === "monthly"
        ? chartBarsPerIndicatorBar((chartConfig as { frequency?: string }).frequency, srcFreq)
        : 1;
      const color = o.type === "autocorr" ? ((IC as Record<string, string>).autocorr_line ?? "#e879f9")
        : o.type === "macd" ? IC.macd_line
        : o.type === "rsi" ? IC.rsi_line
        : IC.roc;
      (out[o.source] ??= []).push({
        bars: Math.round(bars * mult),
        color,
        label: o.type === "autocorr" ? "AC" : o.type.toUpperCase(),
      });
    }
    return out;
  }, [activeIndicators, chartConfig, IC]);

  // Close data for sub-charts: use the first visible series data
  const primaryForSub = paneSeries.find((s) => s.visible && s.data.length > 0);
  const subCloseData = primaryForSub ? primaryForSub.data : [];
  const subBaseLabel = primaryForSub && primaryForSub.metric !== "close" ? ` (${primaryForSub.metric})` : "";

  // Source sub-charts publish their primary displayed series here; derived
  // overlay panes ("ovl:<id>") read it. The version bump re-renders so the
  // overlay pane picks up fresh data; the signature check stops ping-pong.
  const subPrimaryRef = useRef(new Map<string, { time: Time; value: number }[]>());
  const [, setSubPrimaryVer] = useState(0);
  const handleSubPrimaryData = useCallback((t: string, data: { time: Time; value: number }[]) => {
    const sig = (d: { time: Time; value: number }[]) =>
      d.length ? `${d.length}:${String(d[0].time)}:${String(d[d.length - 1].time)}:${d[d.length - 1].value}` : "0";
    const prev = subPrimaryRef.current.get(t);
    if (prev && sig(prev) === sig(data)) return;
    subPrimaryRef.current.set(t, data);
    setSubPrimaryVer((v) => v + 1);
  }, []);

  return (
    <div
      className={`relative w-full h-full min-w-0 min-h-0 overflow-hidden border border-border/50 rounded flex flex-col ${
        isActive ? "ring-1 ring-primary/30" : ""
      }`}
      style={{ cursor: activeTool === "eraser" ? "pointer" : activeTool !== "none" ? "crosshair" : "default" }}
    >
      {/* Pane label */}
      <div className="absolute top-1 left-2 z-10 flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-muted-foreground/60 bg-background/80 px-1.5 py-0.5 rounded">
          {paneLabel}
        </span>
        {paneSeries.length > 0 && (
          <span className="text-[10px] text-muted-foreground/40">
            {paneSeries.length} series
          </span>
        )}
        <button
          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${
            logScale
              ? "bg-primary text-primary-foreground"
              : "bg-background/80 text-muted-foreground/60 hover:text-muted-foreground"
          }`}
          onClick={() => setLogScale(!logScale)}
          title="Toggle logarithmic scale"
          data-testid={`chart-pane-${paneId}-log`}
        >
          LOG
        </button>
        {/* Per-pane data transform toggle */}
        <div className="flex items-center gap-px ml-0.5">
          {(["raw", "zscore", "percentile", "symlog"] as DataTransform[]).map((t) => {
            const label = t === "raw" ? "Raw" : t === "zscore" ? "Z" : t === "percentile" ? "%" : "SymLog";
            const title = t === "raw" ? "Raw data"
              : t === "zscore" ? "Z-Score"
              : t === "percentile" ? "Percentile"
              : "Sign-preserving log — compresses spikes, works with negatives";
            return (
              <button
                key={t}
                className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded transition-colors ${
                  dataTransform === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-background/80 text-muted-foreground/60 hover:text-muted-foreground"
                }`}
                onClick={() => setDataTransform(t)}
                title={title}
                data-testid={`chart-pane-${paneId}-transform-${t}`}
              >
                {label}
              </button>
            );
          })}
          {/* Z-Score / Percentile window selector (symlog has no window) */}
          {(dataTransform === "zscore" || dataTransform === "percentile") && (
            <div className="flex items-center gap-0.5 ml-1">
              <select
                className="text-[9px] font-mono bg-background/80 text-muted-foreground border border-border/50 rounded px-0.5 py-0.5 h-[18px] focus:outline-none focus:ring-1 focus:ring-primary"
                value={zScoreWindow}
                onChange={(e) => setZScoreWindow(Number(e.target.value))}
                title="Lookback window (0 = expanding / all history)"
                data-testid={`chart-pane-${paneId}-zscore-window`}
              >
                <option value={0}>All</option>
                <option value={63}>63d</option>
                <option value={126}>126d</option>
                <option value={252}>1Y</option>
                <option value={504}>2Y</option>
                <option value={756}>3Y</option>
                <option value={1260}>5Y</option>
              </select>
            </div>
          )}
          {/* Info: explains the Log (symlog) transform */}
          <span
            className="ml-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help"
            data-testid={`chart-pane-${paneId}-transform-info`}
            title={
              "Log — symmetric log scale: sign(v) · log10(1 + |v|).\n\n" +
              "Compresses large spikes while keeping the sign and the zero line, so " +
              "extreme reward:risk / z-score values stay readable without dropping the " +
              "negatives a plain log axis can't show (it can't plot values ≤ 0).\n\n" +
              "The axis is in log units; the crosshair data table still shows raw values.\n" +
              "Z = z-score vs window, % = percentile (0–100), Raw = unchanged."
            }
          >
            <Info className="w-3 h-3 inline" />
          </span>
        </div>
        <ExportMenu
          getChart={() => chartRef.current}
          label={`${paneLabel}_${paneSeries.map(s => s.label).join("_")}`}
          className="ml-0.5"
        />
      </div>
      {/* Per-pane crosshair readout — this pane's own series names + values at
          the hovered time (TradingView-style, in each plot instead of one shared
          readout in the top toolbar). */}
      {hoverReadout && hoverReadout.items.length > 0 && (
        <div
          // Sits BELOW the pane header row (label/LOG/transform buttons top-left,
          // export/expand top-right) so it never covers those controls, and
          // wraps onto extra lines instead of clipping — with mean ± σ bands or
          // several MAs/RSIs active, every value stays visible.
          className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-wrap justify-center items-center gap-x-2 gap-y-0.5 text-[10px] font-mono tabular-nums bg-background/85 px-1.5 py-0.5 rounded pointer-events-none max-w-[calc(100%-5rem)]"
          style={{ top: colorByMetric ? 44 : 26 }}
          data-testid={`chart-pane-${paneId}-readout`}
        >
          <span className="text-muted-foreground/70">{hoverReadout.time}</span>
          {hoverReadout.items.map((it, i) => (
            <span key={i} className="whitespace-nowrap">
              <span style={{ color: it.color }}>{it.label}</span>{" "}
              <span className="text-foreground font-semibold">{it.value.toFixed(2)}</span>
            </span>
          ))}
        </div>
      )}
      {/* Color-by gradient legend — separate row to avoid overlapping right-side buttons */}
      {colorByMetric && colorByRange && (
        <div className="absolute top-6 left-2 z-10 flex items-center gap-1.5 bg-background/90 px-1.5 py-0.5 rounded">
          <span className="text-[10px] font-mono text-muted-foreground font-bold">
            {colorByRange.min.toFixed(1)}
          </span>
          <div
            className="h-4 rounded-sm flex-shrink-0 border border-white/20"
            style={{
              width: 120,
              background: `linear-gradient(to right, ${gradientColorHsl(0)}, ${gradientColorHsl(0.25)}, ${gradientColorHsl(0.5)}, ${gradientColorHsl(0.75)}, ${gradientColorHsl(1)})`,
            }}
          />
          <span className="text-[10px] font-mono text-muted-foreground font-bold">
            {colorByRange.max.toFixed(1)}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground ml-0.5">
            {colorByMetric}
          </span>
          {onClearColorBy && (
            <button
              onClick={onClearColorBy}
              className="text-[10px] text-muted-foreground/60 hover:text-foreground ml-0.5 font-bold"
              title="Clear color-by"
              data-testid={`chart-pane-${paneId}-clear-colorby`}
            >
              ×
            </button>
          )}
        </div>
      )}
      {/* Main chart area — flex-1 takes remaining space after sub-charts.
          Hidden while a sub-indicator subplot is expanded to fill the pane. */}
      <div ref={containerRef} className={maxSub ? "hidden" : "w-full flex-1 min-h-0"} data-testid={`chart-pane-${paneId}`} />
      {/* Measure tool readout (TradingView-style) — follows the cursor while dragging */}
      {measureBox && (
        <div
          className="rounded shadow-lg text-white text-[11px] leading-tight px-2 py-1.5 whitespace-nowrap"
          style={{
            position: "fixed",
            left: measureBox.clientX + 16,
            top: measureBox.clientY + 16,
            zIndex: 60,
            pointerEvents: "none",
            background: measureBox.up ? "rgba(8,153,129,0.92)" : "rgba(242,54,69,0.92)",
          }}
          data-testid={`measure-box-${paneId}`}
        >
          <div className="font-semibold text-[13px]">
            {measureBox.absChange >= 0 ? "+" : ""}
            {measureBox.absChange.toFixed(2)}{"  "}
            ({measureBox.pctChange >= 0 ? "+" : ""}
            {measureBox.pctChange.toFixed(2)}%)
          </div>
          <div className="opacity-90">
            {measureBox.bars} bar{measureBox.bars === 1 ? "" : "s"}
            {Number.isFinite(measureBox.days) ? `, ${measureBox.days} day${measureBox.days === 1 ? "" : "s"}` : ""}
          </div>
          <div className="opacity-90">Angle {measureBox.angle.toFixed(1)}°</div>
        </div>
      )}
      {/* Right-click "Delete" menu for a single drawing */}
      {drawingMenu && (
        <div
          className="rounded border border-border bg-popover shadow-lg text-xs overflow-hidden"
          style={{ position: "fixed", left: drawingMenu.clientX, top: drawingMenu.clientY, zIndex: 70 }}
          onMouseDown={(e) => e.stopPropagation()}
          data-testid={`drawing-menu-${paneId}`}
        >
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-destructive hover:bg-destructive/10 w-full text-left"
            onClick={() => {
              if (drawingMenu.kind === "fractal") onDeleteFractal?.();
              else if (drawingMenu.id) deleteDrawingById(drawingMenu.id);
              setDrawingMenu(null);
            }}
            data-testid={`drawing-delete-${paneId}`}
          >
            <Trash2 className="w-3 h-3" />
            Delete {drawingMenu.label}
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-destructive hover:bg-destructive/10 w-full text-left border-t border-border/60"
            onClick={() => {
              if (drawingMenu.kind === "fractal") (onDeleteFractalAll ?? onDeleteFractal)?.();
              else if (drawingMenu.id) deleteDrawingEverywhere(drawingMenu.id);
              setDrawingMenu(null);
            }}
            data-testid={`drawing-delete-all-${paneId}`}
          >
            <Rows3 className="w-3 h-3" />
            Delete on all panes
          </button>
        </div>
      )}
      {/* Sub-indicator charts (RSI, MACD, HA) stacked below. Double-click one
          (or its expand button) to fill the pane; others hide while expanded. */}
      {subCloseData.length > 0 && visibleSubCharts.map((st) => {
        const isMax = maxSub === st;
        const hidden = maxSub !== null && !isMax;
        const ovlDef = st.startsWith("ovl:")
          ? (activeIndicators.indicatorOverlays ?? []).find((o) => `ovl:${o.id}` === st) ?? null
          : null;
        return (
          <div key={st} className={hidden ? "hidden" : "contents"}>
            <SubIndicatorChart
              type={st}
              overlayDef={ovlDef}
              sourceData={ovlDef ? subPrimaryRef.current.get(ovlDef.source) : undefined}
              onPrimaryData={st.startsWith("ovl:") ? undefined : handleSubPrimaryData}
              closeData={subCloseData}
              ohlcBars={ohlcBars}
              fullDates={fullDates}
              spacerTimes={spacerTimes}
              activeIndicators={activeIndicators}
              parentChart={chartRef.current}
              baseLabel={subBaseLabel}
              lookbackEntries={subLookback[st]}
              axisLabelsVisible={axisLabelsOn}
              priceLinesVisible={priceLinesOn}
              isMaximized={isMax}
              onToggleMaximize={() => setMaxSub((cur) => (cur === st ? null : st))}
              onClose={onCloseSubIndicator ? () => {
                setMaxSub((cur) => (cur === st ? null : cur));
                onCloseSubIndicator(st);
              } : undefined}
              onHide={onToggleHideSubIndicator ? () => {
                setMaxSub((cur) => (cur === st ? null : cur));
                onToggleHideSubIndicator(st);
              } : undefined}
              height={subHeights[st]}
              onResizeStart={(defaultH, e) => startSubResize(st, defaultH, e)}
              gridColor={gridColorFor(chartConfig.gridProminence)}
              frequency={(chartConfig as { frequency?: string }).frequency ?? "daily"}
            />
          </div>
        );
      })}
      {paneSeries.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-muted-foreground/40">Empty pane — add series</span>
        </div>
      )}
    </div>
  );
});

ChartPane.displayName = "ChartPane";
export default ChartPane;
