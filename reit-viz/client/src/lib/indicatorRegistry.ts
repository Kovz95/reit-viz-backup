// ─────────────────────────────────────────────────────────────────────────
// Indicator registry
//
// A single descriptor table for chart indicators. Each entry declares an
// indicator's identity, its adjustable params (which drive the auto-generated
// panel controls), its render target (its own sub-pane, or an overlay on the
// price chart), and a render function that draws it with lightweight-charts.
//
// Adding a new indicator = one entry here + its compute fn in indicators.ts +
// its color keys in chartColors.ts. No edits to ChartPane's render switch, the
// sub-chart list, the ActiveIndicators interface, or the panel — those all
// iterate this table. Per-indicator UI state lives generically under
// `ActiveIndicators.registry[id]`, so there is no typed field to add either.
//
// NOTE: the pre-existing indicators (SMA/EMA/RSI/MACD/Bollinger/…) intentionally
// keep their own bespoke controls and typed ActiveIndicators fields — they
// predate this registry and have richer UX. New indicators go here.
// ─────────────────────────────────────────────────────────────────────────

import { LineSeries, LineStyle, HistogramSeries, createSeriesMarkers, type IChartApi, type ISeriesApi, type Time, type SeriesMarker } from "lightweight-charts";
import { computeKalmanTrend, computeCusumChangePoints, computeHmmRegimes } from "./adaptiveModels";
import type { OhlcBar } from "./indicators";
import { MA_TYPES } from "./maEngine";
import { computeMaSlopeSeries, defaultMaSlopeParams } from "./maSlope";
import { IchimokuCloudPrimitive, type CloudPoint } from "./ichimokuCloudPrimitive";
import {
  computeADX,
  computeCCI,
  computeWilliamsR,
  computeAroon,
  computeSupertrend,
  computePSAR,
  computeKeltner,
  computeDonchian,
  computeIchimoku,
  computeSlowStochastic,
  computeMADistance,
  computeRollingAutocorr,
  type AutocorrSource,
} from "./indicators";
import {
  computeRollingZScore,
  computeRollingPercentile,
  computeRealizedVol,
  computeRollingDrawdown,
  computeBollingerPctB,
  computeBollingerBandwidth,
  computeHalfLife,
  computeHurst,
  computeEfficiencyRatio,
  computeRegSlope,
} from "./quantIndicators";

export type IndicatorParam = {
  key: string;
  label: string;
  default: number;
  /** Per-frequency default overrides (keys: "hourly" | "daily" | "weekly" |
   *  "monthly"); falls back to `default`. Explicit user-set params always win. */
  defaultByFrequency?: Record<string, number>;
  min: number;
  max: number;
  /** Input step; use a fraction for decimal params (e.g. PSAR 0.02). Default 1. */
  step?: number;
  /** When set, the panel renders a dropdown of these choices instead of a
   *  number input. Values are still numbers (stored in params like any other). */
  options?: { value: number; label: string }[];
};

export type RenderTarget = "pane" | "overlay";

/** Generic per-indicator UI state, stored under ActiveIndicators.registry[id]. */
export type RegistryIndicatorState = {
  enabled?: boolean;
  /** A param flagged as `multiInstanceParam` on the def may hold a LIST —
   *  the indicator renders once per value (e.g. autocorr lag 1+6+21). */
  params?: Record<string, number | number[]>;
  /** Compute frequency: bars are resampled to weekly/monthly before the
   *  indicator runs (results plot on period-end dates of the chart axis).
   *  Default "chart" = the pane's own bar frequency. */
  freq?: "chart" | "weekly" | "monthly";
};

/** Resample bars to weekly/monthly periods. Each output bar carries the
 *  period's LAST trading date as its time (so points land on existing chart
 *  dates, using only data available by that date — no lookahead). */
export function resampleIndicatorBars(bars: OhlcBar[], freq: "weekly" | "monthly"): OhlcBar[] {
  // Only date-string axes ("YYYY-MM-DD") can be bucketed into weeks/months.
  // Hourly charts carry epoch-second times — return them untouched rather
  // than collapsing every bar into one "Invalid Date" bucket.
  if (!bars.length || typeof bars[0].time !== "string" || !/^\d{4}-\d{2}/.test(bars[0].time)) return bars;
  const keyOf = (t: string): string => {
    if (freq === "monthly") return t.slice(0, 7);
    const d = new Date(t + "T00:00:00Z");
    const day = (d.getUTCDay() + 6) % 7; // Mon=0
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10); // Monday of the ISO week
  };
  const out: OhlcBar[] = [];
  let cur: OhlcBar | null = null;
  let key = "";
  for (const b of bars) {
    const k = keyOf(b.time);
    if (k !== key) {
      if (cur) out.push(cur);
      cur = { ...b };
      key = k;
    } else if (cur) {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.time = b.time;
    }
  }
  if (cur) out.push(cur);
  return out;
}

type Colors = Record<string, string>;

/** Context handed to a sub-pane indicator's render fn. */
export type PaneRenderCtx = {
  chart: IChartApi;
  colors: Colors;
  baseLabel: string;
  /** Track a drawn series for crosshair readout + value sync (first = anchor). */
  register: (s: ISeriesApi<any>) => void;
  /** Draw a flat dotted reference line (e.g. overbought/oversold levels). */
  refLine: (level: number, color: string, first: string, last: string) => void;
};

/** Context handed to a price-chart overlay indicator's render fn. */
export type OverlayRenderCtx = {
  chart: IChartApi;
  colors: Colors;
  baseLabel: string;
  register: (s: ISeriesApi<any>) => void;
};

export type IndicatorDef = {
  id: string;
  label: string;
  category: string;
  renderTarget: RenderTarget;
  /** True when the compute only reads closes — lets panes without real OHLC
   *  (ratio/derived series) feed synthesized o=h=l=c bars instead of skipping. */
  worksOnCloseOnly?: boolean;
  params: IndicatorParam[];
  /** Color keys this indicator reads from chartColors — for docs/discoverability. */
  colorKeys: string[];
  renderPane?: (ctx: PaneRenderCtx, bars: OhlcBar[], p: Record<string, number>) => void;
  renderOverlay?: (ctx: OverlayRenderCtx, bars: OhlcBar[], p: Record<string, number>) => void;
  /** Param key that may hold multiple values (stored as an array in state):
   *  the sub-chart renders the indicator once per value, extra instances in
   *  shaded colors. Only meaningful for renderTarget "pane". */
  multiInstanceParam?: string;
};

/** Resolve effective params for an indicator: state overrides, else the
 *  frequency-specific default (when the pane's bar frequency is known), else
 *  the base default. */
export function resolveParams(
  def: IndicatorDef,
  st?: RegistryIndicatorState,
  frequency?: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pr of def.params) {
    const raw = st?.params?.[pr.key];
    // Multi-instance params store arrays — collapse to the first value here so
    // every single-instance consumer (overlays, Pairs/Macro, lookback) still
    // sees a plain number; resolveParamList exposes the full list.
    const v = Array.isArray(raw) ? raw[0] : raw;
    const fallback = (frequency ? pr.defaultByFrequency?.[frequency] : undefined) ?? pr.default;
    out[pr.key] = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  }
  return out;
}

/** Full value list for a (potentially multi-instance) param: the stored array
 *  when present, else the single resolved value. */
export function resolveParamList(
  def: IndicatorDef,
  st: RegistryIndicatorState | undefined,
  frequency: string | undefined,
  key: string,
): number[] {
  const raw = st?.params?.[key];
  if (Array.isArray(raw)) {
    const list = [...new Set(raw.filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
    if (list.length) return list;
  }
  return [resolveParams(def, st, frequency)[key]];
}

// ── Small helpers shared by the render fns ──
type LinePoint = { time: Time; value?: number };
const asLine = (data: { time: string; value: number }[]): LinePoint[] =>
  data.map((d) => ({ time: d.time as unknown as Time, value: d.value }));

// ─────────────────────────────────────────────────────────────────────────
// Sub-pane indicators
// ─────────────────────────────────────────────────────────────────────────

const ADX: IndicatorDef = {
  id: "adx",
  label: "ADX / DMI",
  category: "Trend",
  renderTarget: "pane",
  params: [{ key: "period", label: "Period", default: 14, min: 2, max: 100 }],
  colorKeys: ["adx_adx", "adx_plus", "adx_minus", "adx_ref"],
  renderPane: (ctx, bars, p) => {
    const { adx, plusDI, minusDI } = computeADX(bars, p.period);
    if (plusDI.length === 0 && adx.length === 0) return;
    const add = (data: { time: string; value: number }[], color: string, title: string, width = 1) => {
      if (data.length === 0) return;
      const s = ctx.chart.addSeries(LineSeries, { color, lineWidth: width as any, title });
      s.setData(asLine(data));
      ctx.register(s);
    };
    add(plusDI, ctx.colors.adx_plus, "+DI");
    add(minusDI, ctx.colors.adx_minus, "-DI");
    add(adx, ctx.colors.adx_adx, `ADX ${p.period}${ctx.baseLabel}`, 2);
    const ref = adx.length ? adx : plusDI;
    if (ref.length >= 2) ctx.refLine(25, ctx.colors.adx_ref, ref[0].time, ref[ref.length - 1].time);
  },
};

const CCI: IndicatorDef = {
  id: "cci",
  label: "CCI",
  category: "Oscillators",
  renderTarget: "pane",
  multiInstanceParam: "period",
  params: [{ key: "period", label: "Period", default: 20, min: 2, max: 200 }],
  colorKeys: ["cci_line", "cci_ref"],
  renderPane: (ctx, bars, p) => {
    const data = computeCCI(bars, p.period);
    if (!data.length) return;
    const s = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.cci_line,
      lineWidth: 1,
      title: `CCI ${p.period}${ctx.baseLabel}`,
    });
    s.setData(asLine(data));
    ctx.register(s);
    const f = data[0].time;
    const l = data[data.length - 1].time;
    ctx.refLine(100, ctx.colors.cci_ref, f, l);
    ctx.refLine(-100, ctx.colors.cci_ref, f, l);
    ctx.refLine(0, "rgba(255,255,255,0.15)", f, l);
  },
};

const WILLIAMS_R: IndicatorDef = {
  id: "williamsr",
  label: "Williams %R",
  category: "Oscillators",
  renderTarget: "pane",
  multiInstanceParam: "period",
  params: [{ key: "period", label: "Period", default: 14, min: 2, max: 100 }],
  colorKeys: ["williamsr_line", "williamsr_ref"],
  renderPane: (ctx, bars, p) => {
    const data = computeWilliamsR(bars, p.period);
    if (!data.length) return;
    const s = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.williamsr_line,
      lineWidth: 1,
      title: `%R ${p.period}${ctx.baseLabel}`,
    });
    s.setData(asLine(data));
    ctx.register(s);
    const f = data[0].time;
    const l = data[data.length - 1].time;
    ctx.refLine(-20, ctx.colors.williamsr_ref, f, l);
    ctx.refLine(-80, ctx.colors.williamsr_ref, f, l);
  },
};

const SLOW_STOCH: IndicatorDef = {
  id: "slowstoch",
  label: "Slow Stochastic",
  category: "Oscillators",
  renderTarget: "pane",
  params: [
    { key: "kPeriod", label: "%K", default: 14, min: 1, max: 100 },
    { key: "dPeriod", label: "%D", default: 3, min: 1, max: 50 },
  ],
  colorKeys: ["slowstoch_k", "slowstoch_d", "slowstoch_ref"],
  renderPane: (ctx, bars, p) => {
    const { k, d } = computeSlowStochastic(bars, p.kPeriod, p.dPeriod);
    if (!k.length) return;
    const kS = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.slowstoch_k,
      lineWidth: 1,
      title: `Slow %K ${p.kPeriod}${ctx.baseLabel}`,
    });
    kS.setData(asLine(k));
    ctx.register(kS);
    const dS = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.slowstoch_d,
      lineWidth: 1,
      title: `%D ${p.dPeriod}`,
      crosshairMarkerVisible: false,
    });
    dS.setData(asLine(d));
    ctx.register(dS);
    ctx.refLine(80, ctx.colors.slowstoch_ref, k[0].time, k[k.length - 1].time);
    ctx.refLine(20, ctx.colors.slowstoch_ref, k[0].time, k[k.length - 1].time);
  },
};

const MA_DIST: IndicatorDef = {
  id: "madist",
  label: "% from MA",
  category: "Oscillators",
  renderTarget: "pane",
  params: [
    { key: "period", label: "MA Period", default: 200, min: 2, max: 400 },
    {
      key: "maType",
      label: "Type",
      default: 0,
      min: 0,
      max: MA_TYPES.length - 1,
      options: MA_TYPES.map((t, i) => ({ value: i, label: t })),
    },
    { key: "band", label: "Band %ile", default: 90, min: 51, max: 99 },
  ],
  colorKeys: ["madist_line", "madist_band", "madist_zero"],
  renderPane: (ctx, bars, p) => {
    const maType = MA_TYPES[p.maType] ?? "SMA";
    const data = computeMADistance(bars, p.period, maType);
    if (!data.length) return;
    const s = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.madist_line,
      lineWidth: 1,
      title: `% from ${maType} ${p.period}${ctx.baseLabel}`,
    });
    s.setData(asLine(data));
    ctx.register(s);
    const f = data[0].time;
    const l = data[data.length - 1].time;
    // Band lines sit at the series' own historical percentiles (band-th and
    // its mirror), so "stretched" is calibrated per ticker rather than fixed.
    const sorted = data.map((d) => d.value).sort((a, b) => a - b);
    const q = (frac: number) =>
      sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(frac * (sorted.length - 1))))];
    ctx.refLine(q(p.band / 100), ctx.colors.madist_band, f, l);
    ctx.refLine(q(1 - p.band / 100), ctx.colors.madist_band, f, l);
    ctx.refLine(0, ctx.colors.madist_zero, f, l);
  },
};

const AROON: IndicatorDef = {
  id: "aroon",
  label: "Aroon",
  category: "Trend",
  renderTarget: "pane",
  params: [{ key: "period", label: "Period", default: 14, min: 2, max: 200 }],
  colorKeys: ["aroon_up", "aroon_down", "aroon_ref"],
  renderPane: (ctx, bars, p) => {
    const { up, down } = computeAroon(bars, p.period);
    if (!up.length) return;
    const upS = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.aroon_up,
      lineWidth: 1,
      title: `Aroon Up ${p.period}${ctx.baseLabel}`,
    });
    upS.setData(asLine(up));
    ctx.register(upS);
    const dnS = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.aroon_down,
      lineWidth: 1,
      title: "Aroon Down",
      crosshairMarkerVisible: false,
    });
    dnS.setData(asLine(down));
    ctx.register(dnS);
    ctx.refLine(70, ctx.colors.aroon_ref, up[0].time, up[up.length - 1].time);
    ctx.refLine(30, ctx.colors.aroon_ref, up[0].time, up[up.length - 1].time);
  },
};

const AUTOCORR_SOURCES: { value: number; label: string; src: AutocorrSource }[] = [
  { value: 0, label: "Returns", src: "returns" },
  { value: 1, label: "RSI level", src: "rsi" },
  { value: 2, label: "RSI change", src: "rsiChange" },
];

/** Map the autocorr "source" param value (a <select> index) to its engine source. */
export function autocorrSourceFromParam(v: number | undefined): AutocorrSource {
  return AUTOCORR_SOURCES[v ?? 0]?.src ?? "returns";
}

const AUTOCORR: IndicatorDef = {
  id: "autocorr",
  label: "Autocorrelation",
  category: "Statistics",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  // Lag accepts a list — one AC line per lag in the same sub-pane.
  multiInstanceParam: "lag",
  params: [
    {
      key: "source",
      label: "Source",
      default: 0,
      min: 0,
      max: AUTOCORR_SOURCES.length - 1,
      options: AUTOCORR_SOURCES.map(({ value, label }) => ({ value, label })),
    },
    // Universe-wide PACF analysis (2026-07-24): the ~1-week reversal at lag 6
    // is the strongest daily-return signal; on weekly/monthly bars the lag-1
    // reversal (weekly mean AC −0.11) dominates; on hourly bars lag 7 (one
    // trading day of 60m bars, +0.02 momentum echo) is the strongest.
    { key: "lag", label: "Lag (bars)", default: 6, defaultByFrequency: { hourly: 7, weekly: 1, monthly: 1 }, min: 1, max: 60 },
    { key: "window", label: "Window", default: 63, min: 20, max: 500 },
    { key: "rsiPeriod", label: "RSI Period", default: 14, min: 2, max: 100 },
  ],
  colorKeys: ["autocorr_line", "autocorr_band", "autocorr_zero"],
  renderPane: (ctx, bars, p) => {
    const src = AUTOCORR_SOURCES[p.source]?.src ?? "returns";
    const data = computeRollingAutocorr(bars, src, p.lag, p.window, p.rsiPeriod);
    if (!data.length) return;
    const srcLabel = src === "returns" ? "ret" : src === "rsi" ? `RSI${p.rsiPeriod}` : `ΔRSI${p.rsiPeriod}`;
    const s = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.autocorr_line,
      lineWidth: 1,
      title: `AC ${srcLabel} k=${p.lag} w=${p.window}${ctx.baseLabel}`,
    });
    s.setData(asLine(data));
    ctx.register(s);
    const f = data[0].time;
    const l = data[data.length - 1].time;
    // ±1.96/√pairs: white-noise 95% significance band for the window size.
    const sig = 1.96 / Math.sqrt(Math.max(1, p.window - p.lag));
    ctx.refLine(sig, ctx.colors.autocorr_band, f, l);
    ctx.refLine(-sig, ctx.colors.autocorr_band, f, l);
    ctx.refLine(0, ctx.colors.autocorr_zero, f, l);
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Overlay indicators (drawn on the price chart)
// ─────────────────────────────────────────────────────────────────────────

/** Split a trend-tagged series into up/down line data with whitespace gaps so
 *  a single logical line renders in two colors (one series per trend side). */
function splitByTrend(pts: { time: string; value: number; trend: 1 | -1 }[]): {
  up: LinePoint[];
  down: LinePoint[];
} {
  const up: LinePoint[] = [];
  const down: LinePoint[] = [];
  for (const pt of pts) {
    const t = pt.time as unknown as Time;
    up.push(pt.trend === 1 ? { time: t, value: pt.value } : { time: t });
    down.push(pt.trend === -1 ? { time: t, value: pt.value } : { time: t });
  }
  return { up, down };
}

const SUPERTREND: IndicatorDef = {
  id: "supertrend",
  label: "Supertrend",
  category: "Trend",
  renderTarget: "overlay",
  params: [
    { key: "period", label: "ATR Period", default: 10, min: 1, max: 100 },
    { key: "mult", label: "Multiplier", default: 3, min: 0.5, max: 20, step: 0.5 },
  ],
  colorKeys: ["supertrend_up", "supertrend_down"],
  renderOverlay: (ctx, bars, p) => {
    const st = computeSupertrend(bars, p.period, p.mult);
    if (!st.length) return;
    const { up, down } = splitByTrend(st);
    const upS = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.supertrend_up,
      lineWidth: 2,
      title: `Supertrend ${p.period},${p.mult}`,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    upS.setData(up);
    ctx.register(upS);
    const dnS = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.supertrend_down,
      lineWidth: 2,
      title: "",
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    dnS.setData(down);
    ctx.register(dnS);
  },
};

const PSAR: IndicatorDef = {
  id: "psar",
  label: "Parabolic SAR",
  category: "Trend",
  renderTarget: "overlay",
  params: [
    { key: "step", label: "Step", default: 0.02, min: 0.001, max: 0.2, step: 0.001 },
    { key: "max", label: "Max Step", default: 0.2, min: 0.05, max: 1, step: 0.05 },
  ],
  colorKeys: ["psar_up", "psar_down"],
  renderOverlay: (ctx, bars, p) => {
    const psar = computePSAR(bars, p.step, p.max);
    if (!psar.length) return;
    // Dot markers only (no connecting line) — up dots below price, down above.
    const mk = (trend: 1 | -1, color: string, title: string) => {
      const data: LinePoint[] = psar.map((pt) =>
        pt.trend === trend
          ? { time: pt.time as unknown as Time, value: pt.value }
          : { time: pt.time as unknown as Time },
      );
      const s = ctx.chart.addSeries(LineSeries, {
        color,
        lineVisible: false,
        pointMarkersVisible: true,
        pointMarkersRadius: 1.5,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
        title,
      });
      s.setData(data);
      ctx.register(s);
    };
    mk(1, ctx.colors.psar_up, `PSAR`);
    mk(-1, ctx.colors.psar_down, "");
  },
};

const KELTNER: IndicatorDef = {
  id: "keltner",
  label: "Keltner Channels",
  category: "Volatility",
  renderTarget: "overlay",
  params: [
    { key: "period", label: "EMA Period", default: 20, min: 2, max: 200 },
    { key: "mult", label: "ATR Mult", default: 2, min: 0.5, max: 10, step: 0.5 },
    { key: "atrPeriod", label: "ATR Period", default: 10, min: 1, max: 100 },
  ],
  colorKeys: ["keltner_basis", "keltner_band"],
  renderOverlay: (ctx, bars, p) => {
    const { basis, upper, lower } = computeKeltner(bars, p.period, p.mult, p.atrPeriod);
    if (!basis.length) return;
    const b = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.keltner_basis,
      lineWidth: 1,
      title: `KC ${p.period},${p.mult}${ctx.baseLabel}`,
      lineStyle: LineStyle.LargeDashed,
    });
    b.setData(asLine(basis));
    ctx.register(b);
    for (const [data, title] of [
      [upper, "KC Upper"],
      [lower, "KC Lower"],
    ] as [{ time: string; value: number }[], string][]) {
      const s = ctx.chart.addSeries(LineSeries, {
        color: ctx.colors.keltner_band,
        lineWidth: 1,
        title,
        lineStyle: LineStyle.Dotted,
      });
      s.setData(asLine(data));
      ctx.register(s);
    }
  },
};

const DONCHIAN: IndicatorDef = {
  id: "donchian",
  label: "Donchian Channels",
  category: "Volatility",
  renderTarget: "overlay",
  params: [{ key: "period", label: "Period", default: 20, min: 2, max: 300 }],
  colorKeys: ["donchian_upper", "donchian_lower", "donchian_mid"],
  renderOverlay: (ctx, bars, p) => {
    const { upper, lower, mid } = computeDonchian(bars, p.period);
    if (!upper.length) return;
    const u = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.donchian_upper,
      lineWidth: 1,
      title: `Donchian ${p.period} Up${ctx.baseLabel}`,
    });
    u.setData(asLine(upper));
    ctx.register(u);
    const lw = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.donchian_lower,
      lineWidth: 1,
      title: "Donchian Low",
    });
    lw.setData(asLine(lower));
    ctx.register(lw);
    const m = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.donchian_mid,
      lineWidth: 1,
      title: "Donchian Mid",
      lineStyle: LineStyle.LargeDashed,
      crosshairMarkerVisible: false,
    });
    m.setData(asLine(mid));
    ctx.register(m);
  },
};

/** Generate the next `count` weekday date strings (YYYY-MM-DD) after `last`.
 *  Used to project Ichimoku's leading spans forward past the last bar. */
function futureWeekdays(last: string, count: number): string[] {
  const out: string[] = [];
  const d = new Date(last + "T00:00:00Z");
  while (out.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const ICHIMOKU: IndicatorDef = {
  id: "ichimoku",
  label: "Ichimoku Cloud",
  category: "Trend",
  renderTarget: "overlay",
  params: [
    { key: "conv", label: "Conversion", default: 9, min: 1, max: 100 },
    { key: "base", label: "Base", default: 26, min: 1, max: 200 },
    { key: "spanB", label: "Lead Span B", default: 52, min: 1, max: 300 },
    { key: "displacement", label: "Displacement", default: 26, min: 0, max: 100 },
  ],
  colorKeys: [
    "ichimoku_conversion",
    "ichimoku_base",
    "ichimoku_lead_a",
    "ichimoku_lead_b",
    "ichimoku_lagging",
  ],
  renderOverlay: (ctx, bars, p) => {
    const ich = computeIchimoku(bars, p.conv, p.base, p.spanB, p.displacement);
    if (!ich.conversion.length) return;
    const disp = p.displacement;

    const dates = bars.map((b) => b.time);
    const dateIndex = new Map(dates.map((t, i) => [t, i]));
    const allDates = disp > 0 ? [...dates, ...futureWeekdays(dates[dates.length - 1], disp)] : dates;

    // Shift a series forward (leads) or backward (lagging) along the date axis.
    const shift = (arr: { time: string; value: number }[], by: number): LinePoint[] => {
      const out: LinePoint[] = [];
      for (const pt of arr) {
        const idx = dateIndex.get(pt.time);
        if (idx === undefined) continue;
        const ni = idx + by;
        const t = ni >= 0 && ni < allDates.length ? allDates[ni] : undefined;
        if (t) out.push({ time: t as unknown as Time, value: pt.value });
      }
      return out;
    };

    const draw = (data: LinePoint[], color: string, title: string, style?: LineStyle) => {
      if (!data.length) return undefined;
      const s = ctx.chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        title,
        lastValueVisible: false,
        priceLineVisible: false,
        ...(style !== undefined ? { lineStyle: style } : {}),
      });
      s.setData(data);
      ctx.register(s);
      return s;
    };

    const leadAData = shift(ich.leadA, disp);
    const leadBData = shift(ich.leadB, disp);

    draw(asLine(ich.conversion), ctx.colors.ichimoku_conversion, `Tenkan ${p.conv}${ctx.baseLabel}`);
    draw(asLine(ich.base), ctx.colors.ichimoku_base, `Kijun ${p.base}`);
    const leadASeries = draw(leadAData, ctx.colors.ichimoku_lead_a, "Senkou A", LineStyle.Solid);
    draw(leadBData, ctx.colors.ichimoku_lead_b, "Senkou B", LineStyle.Solid);
    draw(shift(ich.lagging, -disp), ctx.colors.ichimoku_lagging, "Chikou", LineStyle.Dotted);

    // Fill the kumo cloud between the two leading spans (behind the lines).
    if (leadASeries && leadAData.length > 1 && leadBData.length > 1) {
      const cloud = new IchimokuCloudPrimitive(
        leadAData as unknown as CloudPoint[],
        leadBData as unknown as CloudPoint[],
      );
      (leadASeries as unknown as { attachPrimitive: (p: unknown) => void }).attachPrimitive(cloud);
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Adaptive / regime overlays (close-only — work on ratio panes too)
// ─────────────────────────────────────────────────────────────────────────

const barsToCloses = (bars: OhlcBar[]) => bars.map((b) => ({ time: b.time, value: b.close }));

/** Hex "#rrggbb" → rgba() at the given opacity. */
function hexA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}

const KALMAN: IndicatorDef = {
  id: "kalman",
  label: "Kalman Trend",
  category: "Adaptive / Regime",
  renderTarget: "overlay",
  worksOnCloseOnly: true,
  params: [
    // W acts like an adaptive MA length: q_level = R/W², q_slope = R/W⁴.
    { key: "window", label: "Window (bars)", default: 60, min: 5, max: 500 },
    { key: "bandMult", label: "Band σ", default: 2, min: 0.5, max: 4, step: 0.5 },
  ],
  colorKeys: ["kalman_line", "kalman_band"],
  renderOverlay: (ctx, bars, p) => {
    const res = computeKalmanTrend(barsToCloses(bars), p.window, p.bandMult);
    if (!res.trend.length) return;
    const t = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.kalman_line,
      lineWidth: 2,
      title: `Kalman ${p.window}${ctx.baseLabel}`,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    t.setData(asLine(res.trend));
    ctx.register(t);
    for (const [data, title] of [[res.upper, "Kalman Up"], [res.lower, "Kalman Low"]] as const) {
      const s = ctx.chart.addSeries(LineSeries, {
        color: ctx.colors.kalman_band,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        title,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(asLine(data));
      ctx.register(s);
    }
  },
};

const CUSUM_CP: IndicatorDef = {
  id: "cusumcp",
  label: "Change Points (CUSUM)",
  category: "Adaptive / Regime",
  renderTarget: "overlay",
  worksOnCloseOnly: true,
  params: [
    { key: "k", label: "Drift k", default: 0.5, min: 0.1, max: 2, step: 0.1 },
    { key: "h", label: "Threshold h", default: 5, min: 1, max: 20, step: 0.5 },
    { key: "baseWin", label: "Baseline HL", default: 100, min: 20, max: 500 },
  ],
  colorKeys: ["cusum_mean_up", "cusum_mean_down", "cusum_vol_up", "cusum_vol_down"],
  renderOverlay: (ctx, bars, p) => {
    const cps = computeCusumChangePoints(barsToCloses(bars), p.k, p.h, p.baseWin);
    if (!cps.length) return;
    // Invisible carrier at the closes so markers pin to price bars.
    const carrier = ctx.chart.addSeries(LineSeries, {
      color: "rgba(0,0,0,0)",
      lineVisible: false,
      title: "",
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    carrier.setData(asLine(barsToCloses(bars)));
    ctx.register(carrier);
    const style: Record<string, { color: string; shape: "arrowUp" | "arrowDown" | "circle"; position: "aboveBar" | "belowBar"; text: string }> = {
      meanUp: { color: ctx.colors.cusum_mean_up, shape: "arrowUp", position: "belowBar", text: "μ+" },
      meanDown: { color: ctx.colors.cusum_mean_down, shape: "arrowDown", position: "aboveBar", text: "μ−" },
      volUp: { color: ctx.colors.cusum_vol_up, shape: "circle", position: "aboveBar", text: "σ+" },
      volDown: { color: ctx.colors.cusum_vol_down, shape: "circle", position: "belowBar", text: "σ−" },
    };
    const markers: SeriesMarker<Time>[] = cps.map((cp) => ({
      time: cp.time as unknown as Time,
      position: style[cp.kind].position,
      color: style[cp.kind].color,
      shape: style[cp.kind].shape,
      text: style[cp.kind].text,
      size: 1,
    }));
    createSeriesMarkers(carrier, markers);
  },
};

const HMM_REGIME: IndicatorDef = {
  id: "hmmregime",
  label: "HMM Regimes",
  category: "Adaptive / Regime",
  renderTarget: "overlay",
  worksOnCloseOnly: true,
  params: [
    {
      key: "states",
      label: "States",
      default: 3,
      min: 2,
      max: 3,
      options: [
        { value: 2, label: "2 (bear/bull)" },
        { value: 3, label: "3 (bear/chop/bull)" },
      ],
    },
    { key: "alpha", label: "Shade %", default: 12, min: 3, max: 40 },
  ],
  colorKeys: ["hmm_bear", "hmm_chop", "hmm_bull"],
  renderOverlay: (ctx, bars, p) => {
    const res = computeHmmRegimes(barsToCloses(bars), p.states);
    if (!res || !res.points.length) return;
    const a = Math.max(0.03, Math.min(0.4, p.alpha / 100));
    const stateColor = (s: number): string => {
      if (p.states === 2) return s === 0 ? ctx.colors.hmm_bear : ctx.colors.hmm_bull;
      return s === 0 ? ctx.colors.hmm_bear : s === 1 ? ctx.colors.hmm_chop : ctx.colors.hmm_bull;
    };
    const last = res.points[res.points.length - 1];
    // Full-height translucent columns on a dedicated 0–1 scale: bar height =
    // posterior probability of the assigned state (uncertainty reads as
    // shorter bars), color = regime.
    const shade = ctx.chart.addSeries(HistogramSeries, {
      priceScaleId: "hmm-shade",
      base: 0,
      title: `HMM ${res.labels[last.state]}`,
      lastValueVisible: false,
      priceLineVisible: false,
      color: hexA(stateColor(last.state), a),
      priceFormat: { type: "custom", formatter: (v: number) => `${Math.round(v * 100)}%` },
    });
    shade.setData(res.points.map((pt) => ({
      time: pt.time as unknown as Time,
      value: pt.prob,
      color: hexA(stateColor(pt.state), a),
    })));
    try { shade.priceScale().applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false }); } catch {}
    ctx.register(shade);
  },
};

// ── The registry ──
// ── Quant / mean-reversion panes (close-only, see quantIndicators.ts) ──

const simpleLinePane = (
  compute: (bars: OhlcBar[], p: Record<string, number>) => { time: string | number; value: number }[],
  colorKey: string,
  title: (p: Record<string, number>) => string,
  refs?: (p: Record<string, number>) => { level: number; colorKey?: string }[],
) => (ctx: PaneRenderCtx, bars: OhlcBar[], p: Record<string, number>): void => {
  const data = compute(bars, p);
  if (!data.length) return;
  const s = ctx.chart.addSeries(LineSeries, {
    color: ctx.colors[colorKey],
    lineWidth: 1,
    title: `${title(p)}${ctx.baseLabel}`,
  });
  s.setData(asLine(data as { time: string; value: number }[]));
  ctx.register(s);
  if (data.length >= 2 && refs) {
    const f = String(data[0].time), l = String(data[data.length - 1].time);
    for (const r of refs(p)) {
      ctx.refLine(r.level, r.colorKey ? ctx.colors[r.colorKey] : "rgba(255,255,255,0.15)", f, l);
    }
  }
};

const ZSCORE: IndicatorDef = {
  id: "zscore",
  label: "Rolling Z-Score",
  category: "Quant",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  multiInstanceParam: "window",
  params: [{ key: "window", label: "Window", default: 63, min: 5, max: 1000, defaultByFrequency: { weekly: 26, monthly: 12 } }],
  colorKeys: ["zscore_line", "zscore_ref"],
  renderPane: simpleLinePane(
    (bars, p) => computeRollingZScore(bars, p.window),
    "zscore_line",
    (p) => `Z ${p.window}`,
    () => [{ level: 0 }, { level: 2, colorKey: "zscore_ref" }, { level: -2, colorKey: "zscore_ref" }],
  ),
};

const PCTRANK: IndicatorDef = {
  id: "pctrank",
  label: "Percentile Rank",
  category: "Quant",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  multiInstanceParam: "window",
  params: [{ key: "window", label: "Window", default: 252, min: 20, max: 2520, defaultByFrequency: { weekly: 52, monthly: 36 } }],
  colorKeys: ["pctrank_line", "pctrank_ref"],
  renderPane: simpleLinePane(
    (bars, p) => computeRollingPercentile(bars, p.window),
    "pctrank_line",
    (p) => `PctRank ${p.window}`,
    () => [{ level: 50 }, { level: 90, colorKey: "pctrank_ref" }, { level: 10, colorKey: "pctrank_ref" }],
  ),
};

const REALIZED_VOL: IndicatorDef = {
  id: "realizedvol",
  label: "Realized Vol (ann. %)",
  category: "Quant",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  multiInstanceParam: "window",
  params: [{ key: "window", label: "Window", default: 21, min: 5, max: 504, defaultByFrequency: { weekly: 13, monthly: 12 } }],
  colorKeys: ["realizedvol_line"],
  renderPane: (ctx, bars, p) => {
    // Annualization follows the COMPUTE frequency (weekly bars → √52).
    const ppy = bars.length >= 2 && typeof bars[0].time === "string" && typeof bars[1].time === "string"
      ? (() => {
          const gap = (new Date(bars[bars.length - 1].time as string).getTime() - new Date(bars[0].time as string).getTime()) / 86400000 / Math.max(1, bars.length - 1);
          return gap > 20 ? 12 : gap > 4 ? 52 : 252;
        })()
      : 252;
    simpleLinePane(
      (b, pp) => computeRealizedVol(b, pp.window, ppy),
      "realizedvol_line",
      (pp) => `RVol ${pp.window}`,
    )(ctx, bars, p);
  },
};

const DRAWDOWN: IndicatorDef = {
  id: "drawdown",
  label: "Rolling Drawdown %",
  category: "Quant",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  params: [{ key: "window", label: "Window", default: 252, min: 10, max: 2520, defaultByFrequency: { weekly: 52, monthly: 36 } }],
  colorKeys: ["drawdown_line"],
  renderPane: simpleLinePane(
    (bars, p) => computeRollingDrawdown(bars, p.window),
    "drawdown_line",
    (p) => `DD ${p.window}`,
    () => [{ level: 0 }],
  ),
};

const BB_PCTB: IndicatorDef = {
  id: "bbpctb",
  label: "Bollinger %B",
  category: "Quant",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  params: [
    { key: "period", label: "Period", default: 20, min: 3, max: 200 },
    { key: "mult", label: "σ", default: 2, min: 0.5, max: 4, step: 0.5 },
  ],
  colorKeys: ["bbpctb_line", "bbpctb_ref"],
  renderPane: simpleLinePane(
    (bars, p) => computeBollingerPctB(bars, p.period, p.mult),
    "bbpctb_line",
    (p) => `%B ${p.period}`,
    () => [{ level: 1, colorKey: "bbpctb_ref" }, { level: 0.5 }, { level: 0, colorKey: "bbpctb_ref" }],
  ),
};

const BB_WIDTH: IndicatorDef = {
  id: "bbwidth",
  label: "BB Bandwidth %",
  category: "Quant",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  params: [
    { key: "period", label: "Period", default: 20, min: 3, max: 200 },
    { key: "mult", label: "σ", default: 2, min: 0.5, max: 4, step: 0.5 },
  ],
  colorKeys: ["bbwidth_line"],
  renderPane: simpleLinePane(
    (bars, p) => computeBollingerBandwidth(bars, p.period, p.mult),
    "bbwidth_line",
    (p) => `BBW ${p.period}`,
  ),
};

const HALF_LIFE: IndicatorDef = {
  id: "halflife",
  label: "AR(1) Half-Life",
  category: "Quant",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  params: [{ key: "window", label: "Window", default: 126, min: 20, max: 1008, defaultByFrequency: { weekly: 52, monthly: 24 } }],
  colorKeys: ["halflife_line"],
  renderPane: simpleLinePane(
    (bars, p) => computeHalfLife(bars, p.window),
    "halflife_line",
    (p) => `HL ${p.window}`,
  ),
};

const HURST: IndicatorDef = {
  id: "hurst",
  label: "Hurst Exponent",
  category: "Quant",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  params: [{ key: "window", label: "Window", default: 252, min: 48, max: 1008, defaultByFrequency: { weekly: 104, monthly: 60 } }],
  colorKeys: ["hurst_line", "hurst_ref"],
  renderPane: simpleLinePane(
    (bars, p) => computeHurst(bars, p.window),
    "hurst_line",
    (p) => `Hurst ${p.window}`,
    () => [{ level: 0.5, colorKey: "hurst_ref" }],
  ),
};

const EFF_RATIO: IndicatorDef = {
  id: "effratio",
  label: "Efficiency Ratio",
  category: "Quant",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  multiInstanceParam: "period",
  params: [{ key: "period", label: "Period", default: 20, min: 2, max: 200 }],
  colorKeys: ["effratio_line", "effratio_ref"],
  renderPane: simpleLinePane(
    (bars, p) => computeEfficiencyRatio(bars, p.period),
    "effratio_line",
    (p) => `ER ${p.period}`,
    () => [{ level: 0.3, colorKey: "effratio_ref" }],
  ),
};

const REG_SLOPE: IndicatorDef = {
  id: "regslope",
  label: "Regression Slope + R²",
  category: "Quant",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  params: [{ key: "window", label: "Window", default: 63, min: 10, max: 1008, defaultByFrequency: { weekly: 26, monthly: 12 } }],
  colorKeys: ["regslope_line", "regslope_r2"],
  renderPane: (ctx, bars, p) => {
    const { slope, r2 } = computeRegSlope(bars, p.window);
    if (!slope.length) return;
    const s = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.regslope_line,
      lineWidth: 1,
      title: `Slope ${p.window} (ann.%)${ctx.baseLabel}`,
    });
    s.setData(asLine(slope as { time: string; value: number }[]));
    ctx.register(s);
    ctx.refLine(0, "rgba(255,255,255,0.15)", String(slope[0].time), String(slope[slope.length - 1].time));
    // R² rides its own hidden bottom band (0–1 vs slope's % scale).
    const rs = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.regslope_r2,
      lineWidth: 1,
      title: "R²",
      priceScaleId: "regslope-r2",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    rs.setData(asLine(r2 as { time: string; value: number }[]));
    ctx.register(rs);
    try {
      rs.priceScale().applyOptions({ scaleMargins: { top: 0.72, bottom: 0.02 }, visible: false });
    } catch { /* scale may not exist yet */ }
  },
};

const MA_SLOPE: IndicatorDef = {
  id: "maslope",
  label: "MA Slope",
  category: "Trend",
  renderTarget: "pane",
  worksOnCloseOnly: true,
  params: [
    { key: "period", label: "MA Period", default: 50, min: 2, max: 400 },
    {
      key: "maType",
      label: "Type",
      default: 1, // EMA
      min: 0,
      max: MA_TYPES.length - 1,
      options: MA_TYPES.map((t, i) => ({ value: i, label: t })),
    },
    { key: "lookback", label: "Slope Lookback", default: 3, min: 1, max: 30 },
  ],
  colorKeys: ["maslope_line", "maslope_zero"],
  renderPane: (ctx, bars, p) => {
    const maType = MA_TYPES[p.maType] ?? "EMA";
    const closes = bars.map((b) => b.close);
    const { slope } = computeMaSlopeSeries(closes, {
      ...defaultMaSlopeParams(maType, p.period),
      slopeLookback: p.lookback,
      detectCurvature: false,
    }, { highs: bars.map((b) => b.high), lows: bars.map((b) => b.low) });
    const data: { time: string; value: number }[] = [];
    for (let i = 0; i < bars.length; i++) {
      const v = slope[i];
      if (v != null && Number.isFinite(v)) data.push({ time: String(bars[i].time), value: v });
    }
    if (!data.length) return;
    const s = ctx.chart.addSeries(LineSeries, {
      color: ctx.colors.maslope_line,
      lineWidth: 1,
      title: `${maType} ${p.period} slope (bps/bar)${ctx.baseLabel}`,
    });
    s.setData(asLine(data));
    ctx.register(s);
    ctx.refLine(0, ctx.colors.maslope_zero, data[0].time, data[data.length - 1].time);
  },
};

export const PANE_INDICATORS: IndicatorDef[] = [
  ADX, CCI, WILLIAMS_R, SLOW_STOCH, AROON, MA_DIST, MA_SLOPE, AUTOCORR,
  ZSCORE, PCTRANK, REALIZED_VOL, DRAWDOWN, BB_PCTB, BB_WIDTH, HALF_LIFE, HURST, EFF_RATIO, REG_SLOPE,
];
export const OVERLAY_INDICATORS: IndicatorDef[] = [SUPERTREND, PSAR, KELTNER, DONCHIAN, ICHIMOKU, KALMAN, CUSUM_CP, HMM_REGIME];
export const ALL_REGISTRY_INDICATORS: IndicatorDef[] = [...PANE_INDICATORS, ...OVERLAY_INDICATORS];

const BY_ID = new Map(ALL_REGISTRY_INDICATORS.map((d) => [d.id, d]));
export function getIndicatorDef(id: string): IndicatorDef | undefined {
  return BY_ID.get(id);
}
