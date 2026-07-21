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

import { LineSeries, LineStyle, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import type { OhlcBar } from "./indicators";
import { MA_TYPES } from "./maEngine";
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
} from "./indicators";

export type IndicatorParam = {
  key: string;
  label: string;
  default: number;
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
  params?: Record<string, number>;
};

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
  params: IndicatorParam[];
  /** Color keys this indicator reads from chartColors — for docs/discoverability. */
  colorKeys: string[];
  renderPane?: (ctx: PaneRenderCtx, bars: OhlcBar[], p: Record<string, number>) => void;
  renderOverlay?: (ctx: OverlayRenderCtx, bars: OhlcBar[], p: Record<string, number>) => void;
};

/** Resolve effective params for an indicator: state overrides, else defaults. */
export function resolveParams(def: IndicatorDef, st?: RegistryIndicatorState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pr of def.params) {
    const v = st?.params?.[pr.key];
    out[pr.key] = typeof v === "number" && Number.isFinite(v) ? v : pr.default;
  }
  return out;
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

// ── The registry ──
export const PANE_INDICATORS: IndicatorDef[] = [ADX, CCI, WILLIAMS_R, SLOW_STOCH, AROON, MA_DIST];
export const OVERLAY_INDICATORS: IndicatorDef[] = [SUPERTREND, PSAR, KELTNER, DONCHIAN, ICHIMOKU];
export const ALL_REGISTRY_INDICATORS: IndicatorDef[] = [...PANE_INDICATORS, ...OVERLAY_INDICATORS];

const BY_ID = new Map(ALL_REGISTRY_INDICATORS.map((d) => [d.id, d]));
export function getIndicatorDef(id: string): IndicatorDef | undefined {
  return BY_ID.get(id);
}
