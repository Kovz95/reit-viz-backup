import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTickers, getOhlcData, getMetricSeries, getPairsData } from "@/lib/dataService";
import type { PairsData } from "@/lib/dataService";
import { emptyClassFilters, applyClassFilters, type ClassFilters } from "@/components/ClassificationFilters";
import { CLASSIFICATION_KEYS } from "@/lib/classificationKeys";
import type { TickerMeta } from "@shared/schema";
import Sidebar from "@/components/Sidebar";
import { useUpload } from "@/lib/uploadContext";
import ChartArea from "@/components/ChartArea";
import type { GridLayout } from "@/components/GridLayoutPicker";
import DataTable from "@/components/DataTable";
import WorkspaceManager from "@/components/WorkspaceManager";
import { getSeriesColor } from "@/lib/chartColors";
import { useUniverse } from "@/lib/universeContext";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { useWorkspaceContext, useWorkspaceTab } from "@/lib/workspaceContext";
import { useBaskets } from "@/lib/useBaskets";
import type { Basket } from "@/lib/useBaskets";
import { isBasketTicker, extractBasketId } from "@/lib/basketUtils";
import { getBasketOhlc, buildBasketOhlc } from "@/lib/basketOhlc";
import { computeBasketWeights } from "@/lib/basketWeights";
import type { BasketOhlcResult } from "@/lib/basketOhlc";
import { getRerateMetric, LOOKBACKS } from "@/lib/valuationRerate";
import { buildRerateSeries } from "@/lib/valuationRerateSeries";

export interface CustomChartView {
  id: number;
  label: string;
  metrics: string[];
}

const isDeployed = API_BASE !== "";

export interface PlottedSeries {
  id: string;
  ticker: string;
  metric: string;
  color: string;
  lineWidth?: number;    // 1-5, default 2
  lineStyle?: number;    // 0=Solid, 1=Dotted, 2=Dashed, 3=LargeDashed, 4=SparseDotted
  /** "area" renders a zero-anchored shaded baseline area instead of a line. */
  seriesType?: "line" | "area";
  /** Keep on the pane's main (right) price scale even when 2+ series would
   *  normally move overlays to the left axis — for series whose magnitudes
   *  must stay directly comparable (e.g. attribution components). */
  sharedScale?: boolean;
  /** Per-series display frequency: downsample THIS series to weekly/monthly
   *  period-end points on the shared axis (overrides the pane's C/W/M chip;
   *  coarser-than-chart only). Absent = the pane/chart frequency. */
  freq?: "weekly" | "monthly";
  paneIndex: number;
  data: { time: string; value: number }[];
  visible: boolean;
  label: string;
}

export interface ChartConfig {
  chartType: "candlestick" | "line" | "line-scatter";
  showVolume: boolean;
  /** Prominence of the chart background grid lines. */
  gridProminence?: "off" | "normal" | "bold";
  /** Price-bar frequency: hourly (Yahoo intraday, ~2y) / daily / weekly / monthly. */
  frequency?: "hourly" | "daily" | "weekly" | "monthly";
  /** Show the right-axis last-value badges (series title + value). Default
   *  true; toggled from the toolbar when long series labels crowd the axis —
   *  hover readout still shows every value. */
  axisLabels?: boolean;
  /** Show the dashed full-width line at each series' current value. Default
   *  true; separate from axisLabels so the line can extend (or not) on its own. */
  priceLines?: boolean;
}

export interface PaneInfo {
  id: number;
  label: string;
  ticker?: string; // primary ticker for this pane (for OHLC)
  /** Per-pane display frequency (C/W/M header chip) — persisted with the
   *  workspace so mixed-frequency layouts survive reloads. */
  freq?: "chart" | "weekly" | "monthly";
}

// Preset view definitions
const PRESET_VIEWS: Record<string, string[]> = {
  "Price vs P/FFO FY2": ["close", "P/FFO FY2"],
  "Price | P/FFO FY2 | FFO FY2": ["close", "P/FFO FY2", "FFO FY2"],
  "Price | P/E FY2 | EPS FY2": ["close", "P/E FY2", "EPS FY2"],
  "Price | EV/EBITDA FY2 | EBITDA FY2": ["close", "EV/EBITDA FY2", "EBITDA FY2"],
  "Price vs P/E LTM": ["close", "P/E LTM"],
  "Price vs Dividend Yield": ["close", "Dividend Yield"],
  "Price vs EV/EBITDA LTM": ["close", "EV/EBITDA LTM"],
  "Price vs P/FFO LTM": ["close", "P/FFO LTM"],
  "Price vs P/AFFO FY2": ["close", "P/AFFO FY2"],
  "Estimate Revisions (FFO)": ["FFO FY1", "FFO FY2"],
  "Estimate Revisions (EPS)": ["EPS FY1", "EPS FY2"],
  "Estimate Revisions (AFFO)": ["AFFO FY1", "AFFO FY2"],
  "Estimates vs Price": ["close", "FFO FY2", "FFO FY1"],
  "P/FFO FY2 Only": ["P/FFO FY2"],
  "Price Only": ["close"],
};

const FUNDAMENTAL_VIEWS: Record<string, string[]> = {
  "FFO & AFFO Estimates": ["FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2"],
  "EPS Estimates (FY0/FY1/FY2)": ["EPS FY0", "EPS FY1", "EPS FY2"],
  "Revenue Estimates": ["Sales LTM", "Sales FY1", "Sales FY2"],
  "EBITDA Estimates": ["EBITDA LTM", "EBITDA FY1", "EBITDA FY2"],
  "Growth Rates (FFO)": ["FY1 FFO Growth", "FY2 FFO Growth"],
  "Growth Rates (EPS)": ["FY1 EPS Growth", "FY2 EPS Growth"],
  "Yield Stack": ["Dividend Yield", "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield FY2"],
  "Valuation Multiples (FY2)": ["P/FFO FY2", "P/AFFO FY2", "P/E FY2", "EV/EBITDA FY2"],
  "Valuation Multiples (LTM)": ["P/FFO LTM", "P/E LTM", "EV/EBITDA LTM", "P/S LTM"],
  "Implied Cap Rate vs Div Yield": ["Implied Cap Rate", "Dividend Yield"],
  "Enterprise Value vs EBITDA": ["Enterprise Value", "EBITDA LTM"],
  "Analyst Sentiment": ["Buy Ratings", "Hold Ratings", "Sell Ratings"],
  "Sentiment + Short Interest": ["Bull%", "Bear%", "Short Interest%"],
  "Price vs Implied Cap Rate": ["close", "Implied Cap Rate"],
};

const INTERVIEW_VIEWS: Record<string, string[]> = {
  "NAV Proxy (Cap Rate + Yield)": ["close", "Implied Cap Rate", "Dividend Yield"],
  "Earnings Power": ["close", "FFO FY2", "AFFO FY2"],
  "Multiple Expansion/Compression": ["P/FFO FY2", "FFO Yield FY2"],
  "Estimate Momentum": ["FFO FY1", "FFO FY2", "EPS FY1", "EPS FY2"],
  "Relative Value Quick Look": ["close", "P/FFO FY2", "Dividend Yield"],
  "Growth vs Valuation": ["FY1 FFO Growth", "FY2 FFO Growth", "P/FFO FY2"],
  "Positioning & Crowding": ["close", "Short Interest%", "Bull%", "Bear%"],
  "Private vs Public (Cap Rate vs Multiple)": ["Implied Cap Rate", "P/FFO FY2"],
  "Dividend Safety": ["Dividend", "FFO FY2", "AFFO FY2"],
  "52-Week Range Context": ["close", "52wk High", "52wk Low"],
  "EV & EBITDA Trajectory": ["Enterprise Value", "EBITDA LTM", "EBITDA FY2"],
  "Full Valuation Stack": ["P/FFO FY2", "P/AFFO FY2", "EV/EBITDA FY2", "Dividend Yield"],
};

// ── Pairs Presets: multi-ticker derived views with baked-in indicators ──
export interface PairsPresetDef {
  label: string;
  /** Which derived series to create, in pane order */
  panes: {
    key: keyof PairsData | "priceA" | "priceB";
    label: (a: string, b: string) => string;
    /** Auto-applied indicators */
    indicators?: ActiveIndicators;
  }[];
}

import type { ActiveIndicators } from "@/components/ChartPane";

const PAIRS_PRESETS: PairsPresetDef[] = [
  {
    label: "Pair Ratio + Correlation",
    panes: [
      {
        key: "ratio",
        label: (a, b) => `Ratio: ${a}/${b}`,
        indicators: { mean: { rolling: true, period: 252 } },
      },
      {
        key: "correlation",
        label: (a, b) => `Corr: ${a}/${b} (60d)`,
      },
    ],
  },
  {
    label: "Pair Z-Score + Ratio",
    panes: [
      {
        key: "ratio",
        label: (a, b) => `Ratio: ${a}/${b}`,
        indicators: { mean: { rolling: true, period: 252 } },
      },
      {
        key: "zScore",
        label: (a, b) => `Z-Score: ${a}/${b}`,
        indicators: { mean: { rolling: false, period: 252 } },
      },
    ],
  },
  {
    label: "Full Pairs Suite",
    panes: [
      {
        key: "ratio",
        label: (a, b) => `Ratio: ${a}/${b}`,
        indicators: { mean: { rolling: true, period: 252 } },
      },
      {
        key: "zScore",
        label: (a, b) => `Z-Score: ${a}/${b}`,
      },
      {
        key: "correlation",
        label: (a, b) => `Corr: ${a}/${b} (60d)`,
      },
      {
        key: "rollingBeta",
        label: (a, b) => `Beta: ${a}/${b}`,
      },
    ],
  },
  {
    label: "Spread + Spread Z",
    panes: [
      {
        key: "spread",
        label: (a, b) => `Spread: ${a}−${b}`,
        indicators: { mean: { rolling: true, period: 252 } },
      },
      {
        key: "spreadZ",
        label: (a, b) => `Spread Z: ${a}/${b}`,
        indicators: { mean: { rolling: false, period: 252 } },
      },
    ],
  },
  {
    label: "Percentile Rank + Ratio",
    panes: [
      {
        key: "ratio",
        label: (a, b) => `Ratio: ${a}/${b}`,
        indicators: { sma: 252 },
      },
      {
        key: "percentileRank",
        label: (a, b) => `Pct Rank: ${a}/${b}`,
      },
    ],
  },
];

export { PAIRS_PRESETS };

// ── Relative-Value Presets: per-metric A/B ratio series across panes ──
export interface RelativeValuePresetDef {
  label: string;
  panes: {
    metric: string;
    label: (a: string, b: string) => string;
    indicators?: ActiveIndicators;
  }[];
}

const RELATIVE_VALUE_PRESETS: RelativeValuePresetDef[] = [
  {
    label: "Rel Val: P/FFO + FFO Growth",
    panes: [
      { metric: "P/FFO FY2", label: (a, b) => `P/FFO FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FY2 FFO Growth", label: (a, b) => `FY2 FFO Growth: ${a}/${b}` },
    ],
  },
  {
    label: "Rel Val: P/E + EPS Growth",
    panes: [
      { metric: "P/E FY2", label: (a, b) => `P/E FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FY2 EPS Growth", label: (a, b) => `FY2 EPS Growth: ${a}/${b}` },
    ],
  },
  {
    label: "Rel Val: EV/EBITDA + EBITDA Growth",
    panes: [
      { metric: "EV/EBITDA FY2", label: (a, b) => `EV/EBITDA FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FY2 EBITDA Growth", label: (a, b) => `FY2 EBITDA Growth: ${a}/${b}` },
    ],
  },
  {
    label: "Rel Val: Price + P/FFO + FFO Growth",
    panes: [
      { metric: "close", label: (a, b) => `Price: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "P/FFO FY2", label: (a, b) => `P/FFO FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FY2 FFO Growth", label: (a, b) => `FY2 FFO Growth: ${a}/${b}` },
    ],
  },
  {
    label: "Rel Val: Price + P/E + EPS Growth",
    panes: [
      { metric: "close", label: (a, b) => `Price: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "P/E FY2", label: (a, b) => `P/E FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FY2 EPS Growth", label: (a, b) => `FY2 EPS Growth: ${a}/${b}` },
    ],
  },
  {
    label: "Rel Val: Dividend Yield + FFO Yield",
    panes: [
      { metric: "Dividend Yield", label: (a, b) => `Div Yield: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FFO Yield FY2", label: (a, b) => `FFO Yield FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
    ],
  },
];

export { RELATIVE_VALUE_PRESETS };

// ── Server-backed custom chart (persistent blank canvas) ──
export interface SavedCustomChart {
  id: number;
  name: string;
  state: string;
  createdAt?: string;
  updatedAt?: string;
}

const DEFAULT_VIEW = "Price vs P/FFO FY2";

let nextPaneId = 1;
let nextSeriesSeq = 1; // unique series ID counter
// Generation counter to invalidate stale pane-cleanup timeouts
let paneGeneration = 0;
// Module-level map to persist custom series styling across component re-mounts
// Keys are series IDs, values are { color, lineWidth, lineStyle }
const seriesStyleOverrides = new Map<string, { color?: string; lineWidth?: number; lineStyle?: number }>();

// ── Basket series resolution ──────────────────────────────────────────────
// Resolve a BASKET:<id> ticker's OHLCV via the basket infrastructure
// (buildBasketOhlc + getBasketOhlc → /api/basket/ohlc) instead of the normal
// per-ticker getTickerRaw path. Mirrors the bundle, where getOhlcData /
// getMetricSeries dispatch on the "BASKET:" prefix and delegate to the
// basket OHLC helpers (index-CsG73Aq_.js ~15077, 15168, 15262).

/** Fetch and cache the BasketOhlcResult for a BASKET:<id> ticker. */
async function fetchBasketOhlc(
  basketTicker: string,
  resolve: (id: string) => Basket | undefined
): Promise<BasketOhlcResult | null> {
  const id = extractBasketId(basketTicker);
  if (!id) return null;
  const basket = resolve(id);
  if (!basket) return null;
  const def = buildBasketOhlc(basket.tickers, basket, {
    weighting: basket.weighting,
    rebalance: basket.rebalance,
    customWeights: basket.customWeights,
    volLookback: basket.volLookback,
  });
  // Preserve the basket's display name for any downstream labelling.
  (def as any).name = basket.name ?? def.name;
  return getBasketOhlc(def);
}

/** Convert a BasketOhlcResult into lightweight-charts OHLC candle points. */
function basketOhlcToCandles(res: BasketOhlcResult): { time: string; open: number; high: number; low: number; close: number }[] {
  const out: { time: string; open: number; high: number; low: number; close: number }[] = [];
  const n = Math.min(
    res.priceDates.length,
    res.closes.length
  );
  for (let i = 0; i < n; i++) {
    const close = res.closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    const open = res.opens?.[i];
    const high = res.highs?.[i];
    const low = res.lows?.[i];
    out.push({
      time: res.priceDates[i],
      open: Number.isFinite(open) ? open : close,
      high: Number.isFinite(high) ? high : close,
      low: Number.isFinite(low) ? low : close,
      close,
    });
  }
  out.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}

/** Extract a single metric (close/open/high/low/volume) as {time,value}[] from a BasketOhlcResult. */
function basketMetricSeries(res: BasketOhlcResult, metric: string): { time: string; value: number }[] {
  let arr: number[] | undefined;
  switch (metric) {
    case "close": arr = res.closes; break;
    case "open": arr = res.opens; break;
    case "high": arr = res.highs; break;
    case "low": arr = res.lows; break;
    case "Volume": arr = res.volumes; break;
    default: arr = undefined;
  }
  if (!arr) return [];
  const out: { time: string; value: number }[] = [];
  const n = Math.min(res.priceDates.length, arr.length);
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    if (v != null && Number.isFinite(v)) out.push({ time: res.priceDates[i], value: v });
  }
  return out;
}

/**
 * Basket-aware replacement for getMetricSeries: routes BASKET: tickers through
 * the basket OHLC pipeline, everything else through the normal path.
 */
/** "AKR/BXP"-style pair ticker → its two legs, or null. A pair target plots
 *  leg-A ÷ leg-B for EVERY metric (close ratio, relative P/FFO, …), letting
 *  the whole current layout be remapped onto a ratio without rebuilding. */
export function parsePairTicker(t: string | null | undefined): { a: string; b: string } | null {
  if (!t) return null;
  // Legs are plain tickers OR BASKET:<id> tokens. Basket ids keep their case
  // and may contain spaces/colons (auto-basket ids do) — anything but "/".
  const m = /^(BASKET:[^/]+|[A-Za-z0-9.\-]{1,12})\s*\/\s*(BASKET:[^/]+|[A-Za-z0-9.\-]{1,12})$/.exec(t.trim());
  if (!m) return null;
  const norm = (x: string) => {
    const v = x.trim();
    return v.toUpperCase().startsWith("BASKET:") ? v : v.toUpperCase();
  };
  return { a: norm(m[1]), b: norm(m[2]) };
}

/** Metrics quoted in percent/rate units combine as a SPREAD (A − B) — a ratio
 *  of two growth rates or yields is meaningless and explodes near zero.
 *  Prices, multiples, and per-share estimates combine as a RATIO (A ÷ B). */
export function pairCombineMode(metric: string): "ratio" | "spread" {
  return /growth|yield|margin|rate|payout|occupancy|roe|roic|spread|beta|cagr|return|%/i.test(metric)
    ? "spread"
    : "ratio";
}

function combineAligned(
  sa: { time: string; value: number }[],
  sb: { time: string; value: number }[],
  mode: "ratio" | "spread",
): { time: string; value: number }[] {
  const bm = new Map(sb.map((p) => [p.time, p.value]));
  const out: { time: string; value: number }[] = [];
  for (const p of sa) {
    const bv = bm.get(p.time);
    if (bv == null || !Number.isFinite(p.value) || !Number.isFinite(bv)) continue;
    if (mode === "spread") {
      out.push({ time: p.time, value: p.value - bv });
    } else if (Math.abs(bv) > 1e-12) {
      out.push({ time: p.time, value: p.value / bv });
    }
  }
  return out;
}

async function getMetricSeriesResolved(
  ticker: string,
  metric: string,
  resolve: (id: string) => Basket | undefined,
  basketCache?: Map<string, BasketOhlcResult | null>
): Promise<{ time: string; value: number }[]> {
  const pair = parsePairTicker(ticker);
  if (pair) {
    const [sa, sb] = await Promise.all([
      getMetricSeriesResolved(pair.a, metric, resolve, basketCache),
      getMetricSeriesResolved(pair.b, metric, resolve, basketCache),
    ]);
    return combineAligned(sa, sb, pairCombineMode(metric));
  }
  if (isBasketTicker(ticker)) {
    // Price-family metrics come from the basket OHLC pipeline (weighted index).
    if (["close", "open", "high", "low", "Volume"].includes(metric)) {
      let res = basketCache?.get(ticker);
      if (res === undefined) {
        res = await fetchBasketOhlc(ticker, resolve);
        basketCache?.set(ticker, res);
      }
      if (!res) return [];
      return basketMetricSeries(res, metric);
    }
    // Fundamental metrics (P/FFO FY2, growth, yields, …): weighted average
    // across the basket's constituents using the basket's OWN weighting
    // scheme (equal / custom / market-cap / price / inverse-vol — the same
    // computeBasketWeights the price index uses), on dates where at least
    // half the members with any data have a value. Weights renormalize over
    // the members present at each date so gaps don't deflate the average.
    const id = extractBasketId(ticker);
    const basket = id ? resolve(id) : undefined;
    if (!basket?.tickers?.length) return [];
    const legs = await Promise.all(
      basket.tickers.map((t) => getMetricSeries(t, metric).catch(() => [] as { time: string; value: number }[]))
    );
    const withData = legs.filter((l) => l.length > 0).length;
    if (withData === 0) return [];
    let weights: Record<string, number> = {};
    try {
      const needCloses = basket.weighting === "price" || basket.weighting === "inverse_vol";
      const closesByTicker: Record<string, { time: string; value: number }[]> = {};
      if (needCloses) {
        const closes = await Promise.all(
          basket.tickers.map((t) => getMetricSeries(t, "close").catch(() => [] as { time: string; value: number }[]))
        );
        basket.tickers.forEach((t, i) => { closesByTicker[t] = closes[i]; });
      }
      weights = (await computeBasketWeights({ ...basket }, closesByTicker, getMetricSeries)).weights;
    } catch { /* fall back to equal below */ }
    const wOf = (t: string) => {
      const w = weights[t];
      return Number.isFinite(w) && w! > 0 ? w! : 1 / basket.tickers.length;
    };
    const minCount = Math.max(1, Math.ceil(withData / 2));
    const byDate = new Map<string, { v: number; w: number; n: number }>();
    basket.tickers.forEach((t, i) => {
      const w = wOf(t);
      for (const p of legs[i]) {
        if (!Number.isFinite(p.value)) continue;
        const e = byDate.get(p.time) ?? { v: 0, w: 0, n: 0 };
        e.v += w * p.value;
        e.w += w;
        e.n += 1;
        byDate.set(p.time, e);
      }
    });
    return [...byDate.entries()]
      .filter(([, e]) => e.n >= minCount && e.w > 0)
      .map(([time, e]) => ({ time, value: e.v / e.w }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }
  return getMetricSeries(ticker, metric);
}

// Synthetic tickers back client-derived series (ratios, z-scores, attribution…):
// no server data exists for them, and their series data persists inline in
// workspace saves rather than being re-fetched.
const SYNTHETIC_TICKERS = new Set([
  "CORR", "RATIO", "LOGRATIO", "ZSCORE", "SPREADZ",
  "OLSRESIDZ", "PERCENTILE", "BETA", "R2", "BETAADJSPREAD",
  "SPREAD", "BETASPRD", "PCTRANK", "RELVAL", "PAIRS", "ATTR",
]);

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [plottedSeries, setPlottedSeries] = useState<PlottedSeries[]>([]);
  const plottedSeriesRef = useRef<PlottedSeries[]>([]);
  plottedSeriesRef.current = plottedSeries;
  // Metrics the user has added on top of the active preset. Carried across
  // carousel/company switches so an added fundamental series doesn't get wiped
  // by the preset rebuild in loadViewForTicker; reset when a preset is picked.
  const extraMetricsRef = useRef<string[]>([]);
  const [panes, setPanes] = useState<PaneInfo[]>([]);
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    chartType: "candlestick",
    showVolume: false,
    gridProminence: "normal",
  });
  const [crosshairTime, setCrosshairTime] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string>(DEFAULT_VIEW);
  const [isLoadingView, setIsLoadingView] = useState(false);
  // Per-ticker OHLC cache
  const [ohlcCache, setOhlcCache] = useState<Record<string, any>>({});
  // Fundamental sheets from upload context
  const { fundamentalSheets, setFundamentalSheets } = useUpload();
  // Force-open sidebar section (for macro overlay quick access)
  const [forceOpenSection, setForceOpenSection] = useState<string | null>(null);
  // Universe context (for workspace save/load)
  const universe = useUniverse();

  // Basket store (for resolving BASKET: chart series).
  // Mirrored to a ref so async callbacks (loadViewForTicker / refetchSeriesData)
  // can resolve a basket by id without being re-created on every basket change.
  const { baskets, getBasket } = useBaskets();
  const basketsRef = useRef<Basket[]>([]);
  basketsRef.current = baskets;
  const resolveBasket = useCallback(
    (id: string): Basket | undefined => basketsRef.current.find((b) => b.id === id),
    []
  );

  // Human-facing label for a ticker: BASKET:<id> tokens resolve to the basket's
  // name (falling back to the raw token if the basket was deleted); everything
  // else is shown verbatim. Used for pane titles, series labels, and the carousel
  // so a plotted basket reads as its name instead of "BASKET:<uuid>".
  const tickerDisplayName = useCallback(
    (tk: string): string => {
      // Pair targets: show each leg's resolved name ("WELL/Healthcare REITs").
      const pair = parsePairTicker(tk);
      if (pair && (pair.a.startsWith("BASKET:") || pair.b.startsWith("BASKET:"))) {
        const leg = (x: string) => {
          const lid = extractBasketId(x);
          return lid ? resolveBasket(lid)?.name ?? x : x;
        };
        return `${leg(pair.a)}/${leg(pair.b)}`;
      }
      const id = extractBasketId(tk);
      return id ? resolveBasket(id)?.name ?? tk : tk;
    },
    [resolveBasket]
  );

  // Workspace tracking (manual save/load only — autosave handled by AutoSaveManager)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [layoutMode, setLayoutMode] = useState<GridLayout>("1x1");
  // Per-pane indicator state (lifted here for workspace persistence)
  const [indicatorsMap, setIndicatorsMap] = useState<Record<number, any>>({});
  // Per-pane color-by-metric state (lifted here for workspace persistence)
  const [colorByMap, setColorByMap] = useState<Record<number, string>>({});

  // Refs mirroring current state, for the custom-chart autosave snapshot
  const panesRef = useRef<PaneInfo[]>([]);
  panesRef.current = panes;
  const activeTickerRef = useRef<string | null>(null);
  activeTickerRef.current = activeTicker;
  const chartConfigRef = useRef<ChartConfig>(chartConfig);
  chartConfigRef.current = chartConfig;
  const layoutModeRef = useRef<GridLayout>(layoutMode);
  layoutModeRef.current = layoutMode;
  const indicatorsMapRef = useRef<Record<number, any>>(indicatorsMap);
  indicatorsMapRef.current = indicatorsMap;

  // ── Custom Chart View Templates ──
  const qc = useQueryClient();
  const [memChartViews, setMemChartViews] = useState<CustomChartView[]>([]);

  const { data: backendChartViewsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/chart-view-templates"],
    enabled: !isDeployed,
  });

  const customChartViews: CustomChartView[] = useMemo(() => {
    if (isDeployed) return memChartViews;
    return backendChartViewsRaw.map((t: any) => ({
      id: t.id,
      label: t.label,
      metrics: typeof t.metrics === "string" ? JSON.parse(t.metrics) : t.metrics,
    }));
  }, [isDeployed, memChartViews, backendChartViewsRaw]);

  const saveChartViewMut = useMutation({
    mutationFn: async (tmpl: { label: string; metrics: string[] }) => {
      if (isDeployed) {
        const newView: CustomChartView = { id: Date.now(), label: tmpl.label, metrics: tmpl.metrics };
        setMemChartViews((prev) => [...prev, newView]);
        return newView;
      }
      const res = await apiRequest("POST", "/api/chart-view-templates", tmpl);
      return res.json();
    },
    onSuccess: () => {
      if (!isDeployed) qc.invalidateQueries({ queryKey: ["/api/chart-view-templates"] });
    },
  });

  const deleteChartViewMut = useMutation({
    mutationFn: async (id: number) => {
      if (isDeployed) {
        setMemChartViews((prev) => prev.filter((v) => v.id !== id));
        return;
      }
      await apiRequest("POST", `/api/chart-view-templates/${id}/delete`, {});
    },
    onSuccess: () => {
      if (!isDeployed) qc.invalidateQueries({ queryKey: ["/api/chart-view-templates"] });
    },
  });

  // Build a merged view lookup: presets + custom
  const allViews = useMemo(() => {
    const merged: Record<string, string[]> = { ...PRESET_VIEWS, ...FUNDAMENTAL_VIEWS, ...INTERVIEW_VIEWS };
    for (const cv of customChartViews) {
      merged[cv.label] = cv.metrics;
    }
    return merged;
  }, [customChartViews]);



  const { serializeAll: serializeAllTabs, restoreAll: restoreAllTabs } = useWorkspaceContext();

  // ── Workspace serialization (for useWorkspaceTab + manual workspace save/load) ──
  const serializeCharts = useCallback(() => {
    // Strip data from series that can be re-fetched to keep the blob small.
    // Keep data inline for uploaded series AND derived (synthetic) series.
    // BASKET: series are kept inline too — they are synthetic (computed from a
    // basket definition that lives in localStorage and may differ on reload),
    // mirroring how the bundle groups "BASKET:" with the synthetic-ticker set.
    const lightSeries = plottedSeries.map(s => {
      const isUploaded = s.id.startsWith("uploaded:") || s.metric.startsWith("xl:");
      const isDerived = SYNTHETIC_TICKERS.has(s.ticker) || isBasketTicker(s.ticker);
      return (isUploaded || isDerived) ? s : { ...s, data: [] };
    });
    return {
      plottedSeries: lightSeries,
      panes,
      activeTicker,
      chartConfig,
      activeView,
      uploadedSheets: fundamentalSheets,
      nextPaneId,
      customChartViews: memChartViews,
      layoutMode,
      indicatorsMap,
      colorByMap,
    };
  }, [plottedSeries, panes, activeTicker, chartConfig, activeView, fundamentalSheets, memChartViews, layoutMode, indicatorsMap, colorByMap]);

  const refetchSeriesData = useCallback((stateSeries: PlottedSeries[]) => {
    // Per-call cache so a basket's OHLC is fetched once even if it backs both
    // an OHLC pane and multiple metric series.
    const basketCache = new Map<string, BasketOhlcResult | null>();

    // Re-fetch OHLC for tickers (skip synthetic). BASKET: tickers resolve their
    // OHLC via the basket pipeline (getBasketOhlc) rather than getOhlcData.
    const tks = new Set<string>();
    for (const s of stateSeries) {
      if (s.ticker && s.ticker !== "MACRO" && !SYNTHETIC_TICKERS.has(s.ticker) && s.metric === "close") tks.add(s.ticker);
    }
    for (const tk of tks) {
      if (isBasketTicker(tk)) {
        fetchBasketOhlc(tk, resolveBasket).then(res => {
          basketCache.set(tk, res ?? null);
          if (res) setOhlcCache(prev => ({ ...prev, [tk]: basketOhlcToCandles(res) }));
        }).catch(() => {});
        continue;
      }
      getOhlcData(tk).then(data => {
        setOhlcCache(prev => ({ ...prev, [tk]: data }));
      }).catch(() => {});
    }
    // Re-fetch data for all non-uploaded, non-derived series with empty data.
    // (BASKET: series persist their data inline, so they normally skip this;
    //  the basket-aware getMetricSeriesResolved handles any that are empty.)
    // close/open/high/low are included: candlestick panes render from ohlcCache,
    // but line/L+Dot panes and the Data Table read the series' own data, so a
    // restored workspace in line mode stays blank until these are refilled.
    const seriesToFetch = stateSeries.filter(
      (s: any) => !s.id.startsWith("uploaded:") && !s.metric.startsWith("xl:") && !SYNTHETIC_TICKERS.has(s.ticker) && (!s.data || s.data.length === 0)
    );
    for (const s of seriesToFetch) {
      if (s.id.startsWith("macro:")) {
        const macroId = s.id.replace("macro:", "");
        fetch(`data/macro/${macroId}.json`)
          .then(r => r.json())
          .then(json => {
            const points = (json.observations || []).map((o: any) => ({
              time: o.date,
              value: parseFloat(o.value),
            })).filter((p: any) => !isNaN(p.value));
            setPlottedSeries(prev => prev.map(ps =>
              ps.id === s.id ? { ...ps, data: points } : ps
            ));
          })
          .catch(() => {});
        continue;
      }
      getMetricSeriesResolved(s.ticker, s.metric, resolveBasket, basketCache)
        .then(data => {
          setPlottedSeries(prev => prev.map(ps =>
            ps.id === s.id ? { ...ps, data } : ps
          ));
        })
        .catch(() => {});
    }
  }, [resolveBasket]);

  // Set when the page was entered via a cross-page ?ticker= navigation (gap
  // screener, Ranking, etc.). The async workspace restore must NOT clobber that
  // navigation: bumping paneGeneration would abort the target ticker's in-flight
  // load, and the saved panes/activeTicker would put the previous ticker back.
  const navIntentRef = useRef<string | null>(null);

  const restoreCharts = useCallback((state: any) => {
    if (!state) return;
    const navPending = navIntentRef.current !== null;
    if (navPending) navIntentRef.current = null;
    if (!navPending) {
      paneGeneration++;
      if (state.nextPaneId) nextPaneId = state.nextPaneId;
      if (state.panes) setPanes(state.panes);
      if (state.activeTicker) setActiveTicker(state.activeTicker);
      if (state.activeView) setActiveView(state.activeView);
      if (state.plottedSeries) {
        setPlottedSeries(state.plottedSeries);
        refetchSeriesData(state.plottedSeries);
      }
    }
    if (state.chartConfig) setChartConfig(state.chartConfig);
    if (state.uploadedSheets) {
      setFundamentalSheets(state.uploadedSheets);
    }
    if (state.customChartViews) setMemChartViews(state.customChartViews);
    if (state.layoutMode) setLayoutMode(state.layoutMode);
    if (state.indicatorsMap) setIndicatorsMap(state.indicatorsMap);
    setColorByMap(state.colorByMap && typeof state.colorByMap === "object" ? state.colorByMap : {});
  }, [refetchSeriesData]);

  // ── Layout undo (Ctrl/Cmd+Z) ── snapshot the layout before each destructive
  // edit (remove pane/series, metric swap, preset pick, clear-all); Ctrl+Z pops
  // and re-applies via restoreCharts. restoreCharts never pushes, so undo can't
  // recurse. Capped at 25 levels.
  const layoutHistoryRef = useRef<any[]>([]);
  const pushLayoutHistory = useCallback(() => {
    try {
      layoutHistoryRef.current.push(serializeCharts());
      if (layoutHistoryRef.current.length > 25) layoutHistoryRef.current.shift();
    } catch {}
  }, [serializeCharts]);
  const undoLayout = useCallback(() => {
    const snap = layoutHistoryRef.current.pop();
    if (snap) restoreCharts(snap);
  }, [restoreCharts]);

  // Register with workspace tab system so charts state is auto-saved/loaded
  useWorkspaceTab("charts", serializeCharts, restoreCharts);

  // Manual workspace save/load uses the full state (all tabs + universe)
  const serializeState = useCallback(() => {
    const s: Record<string, any> = {
      ...serializeCharts(),
      universe: universe.serialize(),
      tabs: serializeAllTabs(),
    };
    if (fundamentalSheets.length > 0) {
      s.fundamentalSheets = fundamentalSheets;
    }
    return s;
  }, [serializeCharts, universe, serializeAllTabs, fundamentalSheets]);

  const restoreState = useCallback((state: any) => {
    if (!state) return;
    if (state.universe) universe.restore(state.universe);
    if (state.fundamentalSheets && Array.isArray(state.fundamentalSheets) && state.fundamentalSheets.length > 0) {
      setFundamentalSheets(state.fundamentalSheets);
    }
    if (state.tabs) restoreAllTabs(state.tabs);
    restoreCharts(state);
  }, [universe, restoreAllTabs, restoreCharts, setFundamentalSheets]);

  const { data: tickers = [] } = useQuery<TickerMeta[]>({
    queryKey: ["tickers"],
    queryFn: getTickers,
  });

  // Gather all unique tickers used in panes (synthetic tickers have no
  // server-side OHLC to fetch)
  const uniquePaneTickers = useMemo(() => {
    const tks = new Set<string>();
    for (const s of plottedSeries) {
      if (s.ticker && s.ticker !== "MACRO" && !SYNTHETIC_TICKERS.has(s.ticker) && s.metric === "close") {
        tks.add(s.ticker);
      }
    }
    return Array.from(tks);
  }, [plottedSeries]);

  // Fetch OHLC data for all unique tickers. BASKET: tickers resolve their OHLC
  // through the basket pipeline (getBasketOhlc) rather than getOhlcData.
  useEffect(() => {
    for (const tk of uniquePaneTickers) {
      if (!ohlcCache[tk]) {
        const pair = parsePairTicker(tk);
        if (pair) {
          // Ratio candles: component-wise A÷B with high/low taken as the
          // envelope of the divided fields (the true intrabar ratio extremes
          // aren't observable — this bounded approximation renders sensibly).
          // Legs may be baskets — their candles come from the basket pipeline.
          const legCandles = async (leg: string): Promise<any[]> => {
            if (isBasketTicker(leg)) {
              const res = await fetchBasketOhlc(leg, resolveBasket);
              return res ? basketOhlcToCandles(res) : [];
            }
            return getOhlcData(leg);
          };
          Promise.all([legCandles(pair.a), legCandles(pair.b)]).then(([ca, cb]) => {
            if (!Array.isArray(ca) || !Array.isArray(cb)) return;
            const bm = new Map(cb.map((c: any) => [c.time, c]));
            const out: any[] = [];
            for (const c of ca as any[]) {
              const d = bm.get(c.time);
              if (!d || !(d.open > 0) || !(d.close > 0) || !(d.high > 0) || !(d.low > 0)) continue;
              const vals = [c.open / d.open, c.close / d.close, c.high / d.high, c.low / d.low];
              out.push({
                time: c.time,
                open: c.open / d.open,
                close: c.close / d.close,
                high: Math.max(...vals),
                low: Math.min(...vals),
              });
            }
            if (out.length) setOhlcCache(prev => ({ ...prev, [tk]: out }));
          }).catch(() => {});
          continue;
        }
        if (isBasketTicker(tk)) {
          fetchBasketOhlc(tk, resolveBasket).then(res => {
            if (res) setOhlcCache(prev => ({ ...prev, [tk]: basketOhlcToCandles(res) }));
          }).catch(() => {});
          continue;
        }
        getOhlcData(tk).then(data => {
          setOhlcCache(prev => ({ ...prev, [tk]: data }));
        }).catch(() => {});
      }
    }
  // ohlcCache in deps: deleting an entry (live basket-edit refetch above)
  // re-runs this effect so the candles rebuild; existing entries are guarded
  // by the !ohlcCache[tk] check, so this doesn't loop.
  }, [uniquePaneTickers, ohlcCache]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live basket updates: when a basket is edited (weighting scheme, members,
  // custom weights), refetch every plotted series that depends on it — plain
  // BASKET: tickers and A/B pairs with a basket leg — and drop their cached
  // candles so the OHLC effect rebuilds them with the new weights. Deferred a
  // tick so basketsRef has the updated basket by the time we resolve it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onBasketsChanged = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const affected = plottedSeriesRef.current.filter((s) => {
          if (isBasketTicker(s.ticker)) return true;
          const pair = parsePairTicker(s.ticker);
          return !!pair && (isBasketTicker(pair.a) || isBasketTicker(pair.b));
        });
        if (affected.length === 0) return;
        setOhlcCache((prev) => {
          const next = { ...prev };
          for (const s of affected) delete next[s.ticker];
          return next;
        });
        const basketCache = new Map<string, BasketOhlcResult | null>();
        await Promise.all(
          affected.map(async (s) => {
            try {
              const data = await getMetricSeriesResolved(s.ticker, s.metric, resolveBasket, basketCache);
              setPlottedSeries((prev) => prev.map((ps) => (ps.id === s.id ? { ...ps, data } : ps)));
            } catch { /* keep the old data on failure */ }
          })
        );
      }, 200);
    };
    window.addEventListener("reit-viz:baskets:changed", onBasketsChanged);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("reit-viz:baskets:changed", onBasketsChanged);
    };
  }, [resolveBasket]);

  // For backward compat: ohlcData for the active ticker
  const ohlcData = activeTicker ? ohlcCache[activeTicker] : undefined;

  // Flat sorted ticker list for carousel
  const tickerList = useMemo(() => {
    if (!tickers.length) return [];
    const groups: Record<string, TickerMeta[]> = {};
    for (const t of tickers) {
      const key = t.subindustry || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    const sorted: TickerMeta[] = [];
    for (const key of Object.keys(groups).sort()) {
      sorted.push(...groups[key]);
    }
    return sorted;
  }, [tickers]);

  // Carousel classification filter — narrows the ticker dropdown + prev/next
  // navigation to the selected classifications (Economy → Subindustry).
  const [carouselClassFilters, setCarouselClassFilters] = useState<ClassFilters>(emptyClassFilters);

  const filteredTickerList = useMemo(
    () => applyClassFilters(tickerList as any, carouselClassFilters, "", new Set<string>()) as TickerMeta[],
    [tickerList, carouselClassFilters]
  );

  // Unique values per classification level (full universe) — feeds the filter chips.
  const classFilterOptions = useMemo(() => {
    const opts: Record<string, Set<string>> = {};
    for (const key of CLASSIFICATION_KEYS) opts[key] = new Set();
    for (const t of tickers) {
      for (const key of CLASSIFICATION_KEYS) {
        const v = (t as any)[key];
        if (v) opts[key].add(v);
      }
    }
    const result: Record<string, string[]> = {};
    for (const key of CLASSIFICATION_KEYS) result[key] = [...opts[key]].sort();
    return result;
  }, [tickers]);

  // Index of the active ticker within the FILTERED list (drives x/N + navigation).
  const currentTickerIndex = useMemo(() => {
    if (!activeTicker || !filteredTickerList.length) return -1;
    return filteredTickerList.findIndex((t) => t.ticker === activeTicker);
  }, [activeTicker, filteredTickerList]);

  // Remove a pane and its series
  const removePane = useCallback((paneId: number) => {
    pushLayoutHistory();
    paneGeneration++;
    setPanes((prev) => prev.filter((p) => p.id !== paneId));
    setPlottedSeries((prev) => prev.filter((s) => s.paneIndex !== paneId));
  }, [pushLayoutHistory]);

  // Move a single series to a different existing pane (Current Layout up/down
  // arrows). Only repoints the series' paneIndex — panes/order are untouched.
  const moveSeriesToPane = useCallback((seriesId: string, targetPaneId: number) => {
    setPlottedSeries((prev) =>
      prev.map((s) => (s.id === seriesId ? { ...s, paneIndex: targetPaneId } : s))
    );
  }, []);

  // Duplicate a single series into a brand-new pane (Current Layout duplicate
  // button): clone the series (metric + style + data) with a fresh id, allocate
  // a new pane, and copy the SOURCE pane's indicators so the new pane faithfully
  // mirrors what was showing. Unlike the up/down arrows this COPIES (source
  // stays put) and creates a new pane rather than needing one to exist.
  const duplicateSeriesToNewPane = useCallback((seriesId: string) => {
    const src = plottedSeriesRef.current.find((s) => s.id === seriesId);
    if (!src) return;
    const newPaneId = nextPaneId++;
    // Guarantee a UNIQUE id — nextSeriesSeq is reset on view loads, so a bare
    // `${ticker}:${metric}:${seq++}` can collide with the source's own id (which
    // would React-key-collide and make removeSeries filter BOTH series).
    const existingIds = new Set(plottedSeriesRef.current.map((s) => s.id));
    let cloneId = `${src.ticker}:${src.metric}:${nextSeriesSeq++}`;
    while (existingIds.has(cloneId)) cloneId = `${src.ticker}:${src.metric}:${nextSeriesSeq++}`;
    const clone: PlottedSeries = {
      ...src,
      id: cloneId,
      paneIndex: newPaneId,
      data: src.data.map((d) => ({ ...d })),
    };
    if (src.metric && !extraMetricsRef.current.includes(src.metric)) {
      extraMetricsRef.current = [...extraMetricsRef.current, src.metric];
    }
    setPanes((prev) => [
      ...prev,
      {
        id: newPaneId,
        label: `${tickerDisplayName(src.ticker)} — ${src.metric}`,
        ticker: src.ticker,
        freq: prev.find((p) => p.id === src.paneIndex)?.freq,
      },
    ]);
    setPlottedSeries((prev) => [...prev, clone]);
    // Carry the source pane's per-pane indicators onto the new pane (JSON-safe
    // deep copy so the two panes don't share indicator state).
    setIndicatorsMap((prev) => {
      const srcInd = prev[src.paneIndex];
      if (!srcInd) return prev;
      try { return { ...prev, [newPaneId]: JSON.parse(JSON.stringify(srcInd)) }; } catch { return prev; }
    });
  }, [tickerDisplayName]);

  // Inline metric swap (per-pane picker): change a series' metric in place and
  // refetch its data — no remove + re-add. Optimistically retitles the series
  // (and the pane, if that's the pane's only series), blanks the data, then
  // fills it from getMetricSeriesResolved.
  const changeSeriesMetric = useCallback((seriesId: string, newMetric: string) => {
    const src = plottedSeriesRef.current.find((s) => s.id === seriesId);
    if (!src || src.metric === newMetric) return;
    const tName = tickerDisplayName(src.ticker);
    const onlyOnPane = plottedSeriesRef.current.filter((s) => s.paneIndex === src.paneIndex).length === 1;
    pushLayoutHistory();
    if (newMetric && !extraMetricsRef.current.includes(newMetric)) {
      extraMetricsRef.current = [...extraMetricsRef.current, newMetric];
    }
    setPlottedSeries((prev) => prev.map((s) => (s.id === seriesId ? { ...s, metric: newMetric, label: `${tName} - ${newMetric}`, data: [] } : s)));
    if (onlyOnPane) {
      setPanes((prev) => prev.map((p) => (p.id === src.paneIndex ? { ...p, label: `${tName} — ${newMetric === "close" ? "Price" : newMetric}` } : p)));
    }
    getMetricSeriesResolved(src.ticker, newMetric, resolveBasket)
      .then((data) => setPlottedSeries((prev) => prev.map((s) => (s.id === seriesId ? { ...s, data } : s))))
      .catch(() => {});
  }, [resolveBasket, tickerDisplayName, pushLayoutHistory]);

  // Reorder panes (Current Layout drag-drop): drop pane `fromId` into `toId`'s
  // slot. Pane ids are preserved, so per-pane indicators/color-by stay attached;
  // only the render order (and thus grid placement) changes.
  const reorderPanes = useCallback((fromId: number, toId: number) => {
    if (fromId === toId) return;
    setPanes((prev) => {
      const fromIdx = prev.findIndex((p) => p.id === fromId);
      const toIdx = prev.findIndex((p) => p.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  // Load a preset view for a given ticker
  const loadViewForTicker = useCallback(
    async (ticker: string, viewName?: string) => {
      let view = viewName || activeView;
      let metrics = allViews[view];
      if (!metrics) {
        view = DEFAULT_VIEW;
        metrics = allViews[view];
        if (!metrics) return;
        setActiveView(view);
      }

      // Picking a preset explicitly (viewName passed) starts from a clean
      // template. Company switches (carousel arrows / ticker dropdown pass no
      // viewName) keep any series the user added on top of the preset.
      // Rebuilt panes reuse pane ids 1..N, so any per-pane indicator state left
      // in indicatorsMap would silently re-attach to the new panes — that's how
      // stray indicators (e.g. the registry ones) "come up by default" on a
      // freshly-picked preset. Wipe indicator state for a true reset. (color-by
      // is intentionally left intact so it persists across preset picks.)
      if (viewName) {
        pushLayoutHistory(); // preset pick resets indicators — make it undoable
        extraMetricsRef.current = [];
        setIndicatorsMap({});
      }
      const effectiveMetrics = [
        ...metrics,
        ...extraMetricsRef.current.filter((m) => !metrics.includes(m)),
      ];

      paneGeneration++;
      const myGeneration = paneGeneration;
      setIsLoadingView(true);
      setActiveTicker(ticker);

      try {
        // For BASKET: tickers, resolve OHLC once via the basket pipeline and
        // prime the OHLC cache so the candle/price pane renders. Metric series
        // are resolved through the basket-aware path (non-price metrics return
        // empty, mirroring the bundle's price-source-only basket series).
        const isBasket = isBasketTicker(ticker);
        const basketCache = new Map<string, BasketOhlcResult | null>();
        if (isBasket) {
          const res = await fetchBasketOhlc(ticker, resolveBasket);
          basketCache.set(ticker, res ?? null);
          if (res && paneGeneration === myGeneration) {
            setOhlcCache(prev => ({ ...prev, [ticker]: basketOhlcToCandles(res) }));
          }
        }

        const results = await Promise.all(
          effectiveMetrics.map(async (metric, idx) => {
            // Isolate per-metric failures: a single metric/ticker with no data
            // must not reject the whole view and blank the workspace.
            try {
              const data = await getMetricSeriesResolved(ticker, metric, resolveBasket, basketCache);
              return { metric, data, idx };
            } catch (err) {
              console.warn(`No data for ${ticker} / ${metric}`, err);
              return { metric, data: [], idx };
            }
          })
        );

        // If a restore happened while we were fetching, abandon this load
        if (paneGeneration !== myGeneration) {
          setIsLoadingView(false);
          return;
        }

        nextPaneId = 1;
        const newPanes: PaneInfo[] = [];
        const newSeries: PlottedSeries[] = [];

        // Read current series to preserve any custom styling (color, lineWidth, lineStyle)
        const prevSeriesMap = new Map<string, PlottedSeries>();
        for (const s of plottedSeriesRef.current) prevSeriesMap.set(s.id, s);

        const tName = tickerDisplayName(ticker);
        for (const r of results) {
          const paneId = nextPaneId++;
          newPanes.push({
            id: paneId,
            label: `${tName} \u2014 ${r.metric === "close" ? "Price" : r.metric}`,
            ticker,
          });
          const seriesId = `${ticker}:${r.metric}:${nextSeriesSeq++}`;
          // Look up previous styling by ticker:metric (ignoring sequence suffix)
          const baseKey = `${ticker}:${r.metric}`;
          const existing = prevSeriesMap.get(baseKey) || Array.from(prevSeriesMap.values()).find(s => s.ticker === ticker && s.metric === r.metric);
          const styleOverride = seriesStyleOverrides.get(seriesId) || seriesStyleOverrides.get(baseKey);
          newSeries.push({
            id: seriesId,
            ticker,
            metric: r.metric,
            color: styleOverride?.color ?? existing?.color ?? getSeriesColor(r.idx),
            lineWidth: styleOverride?.lineWidth ?? existing?.lineWidth,
            lineStyle: styleOverride?.lineStyle ?? existing?.lineStyle,
            paneIndex: paneId,
            data: r.data,
            visible: true,
            label: `${tName} - ${r.metric}`,
          });
        }

        setPanes(newPanes);
        setPlottedSeries(newSeries);
      } catch (e) {
        console.error("Failed to load view", e);
      }
      setIsLoadingView(false);
    },
    [activeView, allViews, resolveBasket, tickerDisplayName, pushLayoutHistory]
  );

  // Remap the CURRENT layout onto a different company (used by the carousel
  // arrows + ticker dropdown). Unlike loadViewForTicker — which rebuilds from
  // the active preset — this preserves the exact pane arrangement, overlays,
  // per-pane indicators / color-by / grid sizing (all keyed by pane id),
  // per-series styling, user-added series AND deletions. It simply swaps every
  // series that belongs to the OLD active ticker over to the new one and
  // refetches its data. Series pinned to a different ticker (cross-company
  // comparison overlays), synthetic/derived series (CORR/RATIO/…), macro
  // overlays, and uploaded-sheet series all have ticker !== oldTicker, so they
  // are left untouched.
  const remapLayoutToTicker = useCallback(
    async (newTicker: string) => {
      const oldTicker = activeTickerRef.current;
      const curPanes = panesRef.current;
      const curSeries = plottedSeriesRef.current;

      // No existing layout to carry (first load / empty canvas) — or nothing to
      // do (same ticker). Fall back to a normal preset load for the empty case.
      if (!oldTicker || curPanes.length === 0 || curSeries.length === 0) {
        loadViewForTicker(newTicker);
        return;
      }
      if (newTicker === oldTicker) return;

      const gen = ++paneGeneration;
      setIsLoadingView(true);
      setActiveTicker(newTicker);

      // Series that belong to the old company AND can be refetched by metric.
      const belongsToOld = (s: PlottedSeries) =>
        s.ticker === oldTicker &&
        !s.id.startsWith("uploaded:") &&
        !s.metric.startsWith("xl:");

      const oldName = tickerDisplayName(oldTicker);
      const newName = tickerDisplayName(newTicker);

      // Relabel panes owned by the old ticker; KEEP pane ids so per-pane
      // indicators / color-by / grid fractions survive the switch.
      const newPanes: PaneInfo[] = curPanes.map((p) =>
        p.ticker === oldTicker
          ? {
              ...p,
              ticker: newTicker,
              label: p.label.startsWith(oldName)
                ? newName + p.label.slice(oldName.length)
                : p.label,
            }
          : p
      );

      // Swap the old ticker's series to the new one (fresh id, empty data to be
      // filled by the refetch below). Everything else is preserved verbatim.
      const remapped: PlottedSeries[] = [];
      const newSeries: PlottedSeries[] = curSeries.map((s) => {
        if (!belongsToOld(s)) return s;
        const ns: PlottedSeries = {
          ...s,
          id: `${newTicker}:${s.metric}:${nextSeriesSeq++}`,
          ticker: newTicker,
          label: `${newName} - ${s.metric}`,
          data: [],
        };
        remapped.push(ns);
        return ns;
      });

      setPanes(newPanes);
      setPlottedSeries(newSeries);

      try {
        // Prime OHLC for a basket target (single tickers are handled by the
        // uniquePaneTickers effect that fetches candles for new pane tickers).
        const basketCache = new Map<string, BasketOhlcResult | null>();
        if (isBasketTicker(newTicker)) {
          const res = await fetchBasketOhlc(newTicker, resolveBasket);
          basketCache.set(newTicker, res ?? null);
          if (res && paneGeneration === gen) {
            setOhlcCache((prev) => ({ ...prev, [newTicker]: basketOhlcToCandles(res) }));
          }
        }

        // Refetch each remapped series and patch it in by id. Per-series so the
        // layout fills progressively; a per-metric failure just leaves that
        // series empty (mirrors loadViewForTicker's isolation).
        await Promise.all(
          remapped.map(async (s) => {
            try {
              const data = await getMetricSeriesResolved(newTicker, s.metric, resolveBasket, basketCache);
              if (paneGeneration !== gen) return;
              setPlottedSeries((prev) =>
                prev.map((ps) => (ps.id === s.id ? { ...ps, data } : ps))
              );
            } catch (err) {
              console.warn(`No data for ${newTicker} / ${s.metric}`, err);
            }
          })
        );
      } catch (e) {
        console.error("Failed to remap layout", e);
      }
      if (paneGeneration === gen) setIsLoadingView(false);
    },
    [loadViewForTicker, resolveBasket, tickerDisplayName]
  );

  // Load the Re-Rating "jump to charts" analysis: 5 stacked panes for one ticker —
  // Price, the multiple (with rolling median/p10/p90 overlay), and the rolling
  // percentile / z-score / reward:risk of that multiple. The last three are
  // computed client-side (no backend metric exists); see valuationRerateSeries.
  const loadRerateAnalysis = useCallback(
    async (ticker: string, metricKey: string, lookbackDays: number) => {
      paneGeneration++;
      const myGeneration = paneGeneration;
      setIsLoadingView(true);
      setActiveTicker(ticker);
      try {
        const metricObj = getRerateMetric(metricKey);
        const [closeData, multipleData] = await Promise.all([
          getMetricSeries(ticker, "close").catch(() => []),
          getMetricSeries(ticker, metricKey).catch(() => []),
        ]);
        if (paneGeneration !== myGeneration) { setIsLoadingView(false); return; }

        const lbLabel = LOOKBACKS.find((l) => l.days === lookbackDays)?.label ?? `${lookbackDays}d`;
        const d = buildRerateSeries(multipleData, lookbackDays, metricObj);

        nextPaneId = 1;
        const newPanes: PaneInfo[] = [];
        const newSeries: PlottedSeries[] = [];
        const mk = (
          paneIndex: number, metric: string, data: { time: string; value: number }[],
          color: string, opts?: { lineWidth?: number; lineStyle?: number },
        ) => {
          newSeries.push({
            id: `rerate:${metric}:${ticker}:${nextSeriesSeq++}`,
            ticker, metric, color,
            lineWidth: opts?.lineWidth, lineStyle: opts?.lineStyle,
            paneIndex, data, visible: true, label: `${ticker} - ${metric}`,
          });
        };

        // Pane 1 — Price (renders as candles via the "close" series)
        const pricePane = nextPaneId++;
        newPanes.push({ id: pricePane, label: `${ticker} — Price`, ticker });
        mk(pricePane, "close", closeData, getSeriesColor(0));

        // Pane 2 — the multiple itself, with rolling median / p10 / p90 bands overlaid
        const multPane = nextPaneId++;
        newPanes.push({ id: multPane, label: `${ticker} — ${metricKey} (${lbLabel})`, ticker });
        mk(multPane, metricKey, multipleData, getSeriesColor(1), { lineWidth: 2 });
        mk(multPane, `${metricKey} median`, d.median, "#9ca3af", { lineWidth: 1, lineStyle: 2 });
        mk(multPane, `${metricKey} p90`, d.p90, "#6b7280", { lineWidth: 1, lineStyle: 1 });
        mk(multPane, `${metricKey} p10`, d.p10, "#6b7280", { lineWidth: 1, lineStyle: 1 });

        // Pane 3 — rolling percentile (0–100) with 90/10 tail bands marked
        const pctPane = nextPaneId++;
        newPanes.push({ id: pctPane, label: `${ticker} — ${metricKey} %ile (${lbLabel})`, ticker });
        mk(pctPane, `${metricKey} %ile`, d.percentile, getSeriesColor(2), { lineWidth: 2 });
        const flat = (v: number) => d.percentile.map((p) => ({ time: p.time, value: v }));
        mk(pctPane, "90th (rich)", flat(90), "#ef4444", { lineWidth: 1, lineStyle: 2 });
        mk(pctPane, "10th (cheap)", flat(10), "#34d399", { lineWidth: 1, lineStyle: 2 });

        // Pane 4 — rolling z-score
        const zPane = nextPaneId++;
        newPanes.push({ id: zPane, label: `${ticker} — ${metricKey} z-score (${lbLabel})`, ticker });
        mk(zPane, `${metricKey} z`, d.zscore, getSeriesColor(3));

        // Pane 5 — rolling reward:risk
        const rrPane = nextPaneId++;
        newPanes.push({ id: rrPane, label: `${ticker} — Reward:Risk (${lbLabel})`, ticker });
        mk(rrPane, `${metricKey} R:R`, d.rr, getSeriesColor(4));

        if (paneGeneration !== myGeneration) { setIsLoadingView(false); return; }
        setActiveView("");
        setPanes(newPanes);
        setPlottedSeries(newSeries);
      } catch (e) {
        console.error("Failed to load re-rate analysis", e);
      }
      setIsLoadingView(false);
    },
    [],
  );

  // Load a pairs preset: fetches derived data for tickerA/tickerB, builds panes with auto-indicators
  const loadPairsPreset = useCallback(
    async (preset: PairsPresetDef, tickerB: string) => {
      if (!activeTicker) return;
      const tickerA = activeTicker;
      paneGeneration++;
      const myGeneration = paneGeneration;
      setIsLoadingView(true);
      setActiveView(preset.label);

      try {
        const pairsData = await getPairsData(tickerA, tickerB);
        // If a restore happened while we were fetching, abandon this load
        if (paneGeneration !== myGeneration) {
          setIsLoadingView(false);
          return;
        }
        nextPaneId = 1;
        const newPanes: PaneInfo[] = [];
        const newSeries: PlottedSeries[] = [];
        const newIndicatorsMap: Record<number, ActiveIndicators> = {};

        for (const paneDef of preset.panes) {
          const data = pairsData[paneDef.key as keyof PairsData];
          if (!data || !Array.isArray(data) || data.length === 0) continue;

          const paneId = nextPaneId++;
          const label = paneDef.label(tickerA, tickerB);
          newPanes.push({ id: paneId, label, ticker: tickerA });

          const seriesId = `pairs:${paneDef.key}:${tickerA}:${tickerB}:${nextSeriesSeq++}`;
          newSeries.push({
            id: seriesId,
            ticker: "PAIRS",
            metric: paneDef.key,
            color: getSeriesColor(newSeries.length),
            paneIndex: paneId,
            data: data as { time: string; value: number }[],
            visible: true,
            label,
          });

          if (paneDef.indicators) {
            newIndicatorsMap[paneId] = paneDef.indicators;
          }
        }

        setPanes(newPanes);
        setPlottedSeries(newSeries);
        setIsLoadingView(false);
        // Return indicators map so ChartArea can apply them
        return newIndicatorsMap;
      } catch (e) {
        console.error("Failed to load pairs preset", e);
      }
      setIsLoadingView(false);
      return undefined;
    },
    [activeTicker]
  );

  // Load a relative-value preset: builds per-metric A/B ratio series across panes
  const loadRelativeValuePreset = useCallback(
    async (preset: RelativeValuePresetDef, tickerB: string) => {
      if (!activeTicker) return;
      const tickerA = activeTicker;
      paneGeneration++;
      const myGeneration = paneGeneration;
      setIsLoadingView(true);
      setActiveView(preset.label);

      try {
        // Compute element-wise A/B ratios for each preset metric (mirrors getRelativeValueData)
        const metrics = preset.panes.map((p) => p.metric);
        const ratioByMetric: Record<string, { time: string; value: number }[]> = {};
        await Promise.all(
          metrics.map(async (metric) => {
            const [a, b] = await Promise.all([
              getMetricSeries(tickerA, metric),
              getMetricSeries(tickerB, metric),
            ]);
            const bMap = new Map<string, number>();
            for (const d of b) bMap.set(d.time, d.value);
            const out: { time: string; value: number }[] = [];
            for (const d of a) {
              const denom = bMap.get(d.time);
              if (denom !== undefined && denom !== 0 && isFinite(d.value) && isFinite(denom)) {
                out.push({ time: d.time, value: d.value / denom });
              }
            }
            ratioByMetric[metric] = out;
          })
        );

        // If a restore happened while we were fetching, abandon this load
        if (paneGeneration !== myGeneration) {
          setIsLoadingView(false);
          return;
        }
        nextPaneId = 1;
        const newPanes: PaneInfo[] = [];
        const newSeries: PlottedSeries[] = [];
        const newIndicatorsMap: Record<number, ActiveIndicators> = {};

        for (const paneDef of preset.panes) {
          const data = ratioByMetric[paneDef.metric];
          if (!data || data.length === 0) continue;

          const paneId = nextPaneId++;
          const label = paneDef.label(tickerA, tickerB);
          newPanes.push({ id: paneId, label, ticker: tickerA });

          const seriesId = `relval:${paneDef.metric}:${tickerA}:${tickerB}:${nextSeriesSeq++}`;
          newSeries.push({
            id: seriesId,
            ticker: "RELVAL",
            metric: paneDef.metric,
            color: getSeriesColor(newSeries.length),
            paneIndex: paneId,
            data,
            visible: true,
            label,
          });

          if (paneDef.indicators) {
            newIndicatorsMap[paneId] = paneDef.indicators;
          }
        }

        setPanes(newPanes);
        setPlottedSeries(newSeries);
        setIsLoadingView(false);
        return newIndicatorsMap;
      } catch (e) {
        console.error("Failed to load relative value preset", e);
      }
      setIsLoadingView(false);
      return undefined;
    },
    [activeTicker]
  );

  // Load a single A/B ratio pane — the Pair Ratios → Charts click-through.
  // Non-workbook legs (the MTF Setups pair hand-off passes arbitrary Yahoo
  // symbols like QQQ/SPY): server Yahoo daily adjusted closes as {time,value}.
  const yahooCloseSeries = useCallback(async (ticker: string): Promise<{ time: string; value: number }[]> => {
    try {
      const res = await fetch(`/api/yahoo-prices/${encodeURIComponent(ticker.toUpperCase())}`);
      if (!res.ok) return [];
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json")) return [];
      const d = await res.json();
      if (!Array.isArray(d?.dates) || !Array.isArray(d?.closes)) return [];
      const closes = Array.isArray(d.adjCloses) && d.adjCloses.length === d.dates.length ? d.adjCloses : d.closes;
      const out: { time: string; value: number }[] = [];
      for (let i = 0; i < d.dates.length; i++) {
        if (Number.isFinite(closes[i])) out.push({ time: d.dates[i], value: closes[i] });
      }
      return out;
    } catch {
      return [];
    }
  }, []);

  // Same element-wise ratio math as loadRelativeValuePreset, but for one metric
  // and independent of activeTicker (the hand-off happens before one is set).
  const loadPairRatio = useCallback(
    async (tickerA: string, tickerB: string, metric: string) => {
      paneGeneration++;
      const myGeneration = paneGeneration;
      setIsLoadingView(true);
      setActiveTicker(tickerA);
      setActiveView("");
      try {
        let [a, b] = await Promise.all([
          getMetricSeries(tickerA, metric).catch(() => [] as { time: string; value: number }[]),
          getMetricSeries(tickerB, metric).catch(() => [] as { time: string; value: number }[]),
        ]);
        if (metric === "close") {
          if (!a.length) a = await yahooCloseSeries(tickerA);
          if (!b.length) b = await yahooCloseSeries(tickerB);
        }
        const bMap = new Map<string, number>();
        for (const d of b) bMap.set(d.time, d.value);
        const data: { time: string; value: number }[] = [];
        for (const d of a) {
          const denom = bMap.get(d.time);
          if (denom !== undefined && denom !== 0 && isFinite(d.value) && isFinite(denom)) {
            data.push({ time: d.time, value: d.value / denom });
          }
        }
        if (paneGeneration !== myGeneration) { setIsLoadingView(false); return; }
        nextPaneId = 1;
        const paneId = nextPaneId++;
        const label = `${tickerA} / ${tickerB} — ${metric === "close" ? "Price" : metric}`;
        setPanes([{ id: paneId, label, ticker: tickerA }]);
        setPlottedSeries([
          {
            id: `relval:${metric}:${tickerA}:${tickerB}:${nextSeriesSeq++}`,
            ticker: "RELVAL",
            // "ratio", not the source metric: a "close" metric would make the
            // OHLC fetcher treat RELVAL as a real price ticker.
            metric: "ratio",
            color: getSeriesColor(0),
            paneIndex: paneId,
            data,
            visible: true,
            label,
          },
        ]);
      } catch (e) {
        console.error("Failed to load pair ratio", e);
      }
      setIsLoadingView(false);
    },
    [yahooCloseSeries]
  );

  // ── Server-backed Custom Charts (persistent blank canvases) ──
  const [activeCustomChartId, setActiveCustomChartId] = useState<number | null>(null);
  const activeCustomChartIdRef = useRef<number | null>(null);
  activeCustomChartIdRef.current = activeCustomChartId;
  const [lastManualSaveAt, setLastManualSaveAt] = useState<number | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Suppress autosave until this timestamp (ms) — used right after a fresh load
  const autosaveSuppressUntilRef = useRef<number>(0);

  const AUTOSAVE_ENABLED_KEY = "reit-viz-custom-chart-autosave-enabled-v1";
  const [autoSaveEnabled, setAutoSaveEnabledState] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(AUTOSAVE_ENABLED_KEY);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  const autoSaveEnabledRef = useRef(autoSaveEnabled);
  autoSaveEnabledRef.current = autoSaveEnabled;

  const { data: savedCustomCharts = [] } = useQuery<SavedCustomChart[]>({
    queryKey: ["/api/custom-charts"],
  });

  const createCustomChartMut = useMutation({
    mutationFn: async (vars: { name: string; state: any }) => {
      const res = await apiRequest("POST", "/api/custom-charts", {
        name: vars.name,
        state: JSON.stringify(vars.state),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/custom-charts"] });
    },
  });

  const updateCustomChartMut = useMutation({
    mutationFn: async (vars: { id: number; state?: any; name?: string }) => {
      const body: any = {};
      if (vars.state !== undefined) body.state = JSON.stringify(vars.state);
      if (vars.name !== undefined) body.name = vars.name;
      const res = await apiRequest("POST", `/api/custom-charts/${vars.id}/update`, body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/custom-charts"] });
    },
  });

  const renameCustomChartMut = useMutation({
    mutationFn: async (vars: { id: number; name: string }) => {
      const res = await apiRequest("POST", `/api/custom-charts/${vars.id}/rename`, { name: vars.name });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/custom-charts"] });
    },
  });

  const deleteCustomChartMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/custom-charts/${id}/delete`, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/custom-charts"] });
    },
  });

  const setAutoSaveEnabled = useCallback((enabled: boolean) => {
    setAutoSaveEnabledState(enabled);
    try {
      localStorage.setItem(AUTOSAVE_ENABLED_KEY, enabled ? "1" : "0");
    } catch {}
    if (!enabled && autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  // Build the autosave snapshot from current refs
  const buildCustomChartSnapshot = useCallback(() => ({
    plottedSeries: plottedSeriesRef.current,
    panes: panesRef.current,
    activeTicker: activeTickerRef.current,
    chartConfig: chartConfigRef.current,
    layoutMode: layoutModeRef.current,
    indicatorsMap: indicatorsMapRef.current,
  }), []);

  // Debounced autosave: writes 2s after edits while a custom chart is active
  const scheduleCustomChartAutosave = useCallback(() => {
    if (!activeCustomChartIdRef.current || !autoSaveEnabledRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      const id = activeCustomChartIdRef.current;
      if (!id || Date.now() < autosaveSuppressUntilRef.current) return;
      updateCustomChartMut.mutate({ id, state: buildCustomChartSnapshot() });
    }, 2000);
  }, [updateCustomChartMut, buildCustomChartSnapshot]);

  // Trigger autosave whenever the chart contents change (while a chart is active)
  useEffect(() => {
    if (!activeCustomChartId) return;
    scheduleCustomChartAutosave();
  }, [plottedSeries, panes, activeTicker, chartConfig, layoutMode, indicatorsMap, activeCustomChartId, scheduleCustomChartAutosave]);

  // Create a new blank server-backed chart and make it active
  const handleNewChart = useCallback(async () => {
    paneGeneration++;
    nextPaneId = 1;
    setPanes([]);
    setPlottedSeries([]);
    setActiveTicker(null);
    setIndicatorsMap({});
    const name = `Chart ${savedCustomCharts.length + 1}`;
    try {
      const created = await createCustomChartMut.mutateAsync({
        name,
        state: { panes: [], plottedSeries: [], activeTicker: null, chartConfig, layoutMode, indicatorsMap: {} },
      });
      setActiveCustomChartId(created.id);
      setActiveView(`📌 ${created.name}`);
    } catch (e) {
      console.error("Failed to create custom chart", e);
      setActiveView("(Blank)");
    }
  }, [savedCustomCharts.length, chartConfig, layoutMode, createCustomChartMut]);

  // Save the current view as a brand-new server-backed chart
  const handleSaveCurrentAsNewChart = useCallback(async (name?: string) => {
    const chartName = (name && name.trim()) || `Chart ${savedCustomCharts.length + 1}`;
    try {
      const created = await createCustomChartMut.mutateAsync({
        name: chartName,
        state: buildCustomChartSnapshot(),
      });
      autosaveSuppressUntilRef.current = Date.now() + 3000;
      setActiveCustomChartId(created.id);
      setActiveView(`📌 ${created.name}`);
    } catch (e) {
      console.error("Failed to save current view as new chart", e);
    }
  }, [savedCustomCharts.length, createCustomChartMut, buildCustomChartSnapshot]);

  // Force-save the active custom chart immediately (bypasses autosave debounce)
  const handleManualSaveCustomChart = useCallback(async () => {
    const id = activeCustomChartIdRef.current;
    if (!id) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    try {
      await updateCustomChartMut.mutateAsync({ id, state: buildCustomChartSnapshot() });
      setLastManualSaveAt(Date.now());
    } catch (e) {
      console.error("Manual save failed", e);
    }
  }, [updateCustomChartMut, buildCustomChartSnapshot]);

  // Load a saved custom chart by id and make it active
  const handleLoadCustomChart = useCallback(async (id: number) => {
    let chart: SavedCustomChart | undefined = savedCustomCharts.find((c) => c.id === id);
    try {
      const res = await apiRequest("GET", `/api/custom-charts/${id}`);
      chart = await res.json();
    } catch {}
    if (!chart) return;
    paneGeneration++;
    autosaveSuppressUntilRef.current = Date.now() + 3500;
    setActiveCustomChartId(id);
    try {
      const state = typeof chart.state === "string" ? JSON.parse(chart.state) : (chart.state as any);
      if (state.panes) setPanes(state.panes);
      if (state.activeTicker) setActiveTicker(state.activeTicker);
      if (state.chartConfig) setChartConfig(state.chartConfig);
      if (state.layoutMode) setLayoutMode(state.layoutMode);
      if (state.indicatorsMap) setIndicatorsMap(state.indicatorsMap);
      if (state.plottedSeries) {
        setPlottedSeries(state.plottedSeries);
        refetchSeriesData(state.plottedSeries);
      }
      setActiveView(`📌 ${chart.name}`);
      const maxPaneId = (state.panes || []).reduce((m: number, p: any) => Math.max(m, p.id || 0), 0);
      nextPaneId = Math.max(nextPaneId, maxPaneId + 1);
    } catch (e) {
      console.error("Failed to load custom chart", e);
    }
  }, [savedCustomCharts, refetchSeriesData]);

  // Exit custom-chart mode, returning to the carousel default view
  const handleExitCustomChart = useCallback(() => {
    setActiveCustomChartId(null);
    const ticker = activeTicker || (tickerList.length > 0 ? tickerList[0].ticker : null);
    if (ticker) loadViewForTicker(ticker);
  }, [activeTicker, tickerList, loadViewForTicker]);

  // Navigate to next/prev ticker
  const navigateTicker = useCallback(
    (direction: "next" | "prev") => {
      if (!filteredTickerList.length) return;
      if (currentTickerIndex < 0) {
        remapLayoutToTicker(filteredTickerList[0].ticker);
        return;
      }
      const newIndex =
        direction === "next"
          ? (currentTickerIndex + 1) % filteredTickerList.length
          : (currentTickerIndex - 1 + filteredTickerList.length) % filteredTickerList.length;
      remapLayoutToTicker(filteredTickerList[newIndex].ticker);
    },
    [filteredTickerList, currentTickerIndex, remapLayoutToTicker]
  );

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        undoLayout();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        navigateTicker("next");
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        navigateTicker("prev");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigateTicker, undoLayout]);

  // Pending ticker from URL (set before tickerList loads)
  const pendingTickerRef = useRef<string | null>(null);

  // Pending Re-Rating "jump to charts" payload (set on the Re-Rating tab before
  // this page mounted; drained once the ticker list is available).
  const pendingRerateRef = useRef<{ ticker: string; metricKey: string; lookbackDays: number } | null>(null);

  // Drain the Re-Rating → Charts hand-off from sessionStorage on mount. Runs
  // before the auto-load effect below so the default view doesn't load first.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("reit-viz:rerate-to-charts");
      if (raw) {
        sessionStorage.removeItem("reit-viz:rerate-to-charts");
        const p = JSON.parse(raw);
        if (p && p.ticker) {
          pendingRerateRef.current = {
            ticker: String(p.ticker).toUpperCase(),
            metricKey: String(p.metricKey),
            lookbackDays: Number(p.lookbackDays) || 1260,
          };
        }
      }
    } catch {}
  }, []);

  // Pending Pair Ratios "open on charts" payload (set on the Pair Ratios tab
  // before this page mounted; drained once the ticker list is available).
  const pendingPairRef = useRef<{ tickerA: string; tickerB: string; metric: string } | null>(null);

  // Drain the Pair Ratios → Charts hand-off from sessionStorage on mount. Like
  // the Re-Rating drain above, this must run before the auto-load effect below.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("reit-viz:pair-to-charts");
      if (raw) {
        sessionStorage.removeItem("reit-viz:pair-to-charts");
        const p = JSON.parse(raw);
        if (p && p.tickerA && p.tickerB) {
          pendingPairRef.current = {
            tickerA: String(p.tickerA).toUpperCase(),
            tickerB: String(p.tickerB).toUpperCase(),
            metric: String(p.metric || "close"),
          };
        }
      }
    } catch {}
  }, []);

  // Drain the "Open in Charts as ratio" hand-off (Pairs / Correlation pages
  // stash a plain "A/B" pair string). Once the restored layout is ready it is
  // remapped in place — identical to typing A/B in the carousel search.
  const pendingPairRemapRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("reit-viz:pair-remap-to-charts");
      if (raw) {
        sessionStorage.removeItem("reit-viz:pair-remap-to-charts");
        if (parsePairTicker(raw)) pendingPairRemapRef.current = raw.trim();
      }
    } catch {}
  }, []);
  useEffect(() => {
    const pending = pendingPairRemapRef.current;
    if (!pending || isLoadingView) return;
    if (panes.length === 0) return; // wait for the workspace restore
    pendingPairRemapRef.current = null;
    remapLayoutToTicker(pending);
  }, [panes, isLoadingView, remapLayoutToTicker]);
  // Fallback: no saved layout ever arrives (fresh browser) — remap anyway,
  // which routes through loadViewForTicker for the pair.
  useEffect(() => {
    if (!pendingPairRemapRef.current) return;
    const t = setTimeout(() => {
      const pending = pendingPairRemapRef.current;
      if (pending) {
        pendingPairRemapRef.current = null;
        remapLayoutToTicker(pending);
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [remapLayoutToTicker]);

  // Read ?ticker= from URL search params (from Ranking tab click-through)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("ticker");
    if (t) {
      pendingTickerRef.current = t;
      navIntentRef.current = t;
      // Clean up URL param immediately
      const url = new URL(window.location.href);
      url.searchParams.delete("ticker");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  // Cross-page "go to symbol" navigation:
  //  - listen for the "reit-viz:goto-symbol" CustomEvent (detail.symbol)
  //  - drain a localStorage pending-symbol on mount (set before this page loaded)
  // Routes through the existing pending-ticker + loadViewForTicker flow so the
  // active view is actually loaded (the pending-ref effects below handle the
  // case where the ticker list has not loaded yet).
  useEffect(() => {
    const gotoSymbol = (sym: string) => {
      const t = sym.trim().toUpperCase();
      if (!t) return;
      if (tickerList.length > 0 && tickerList.some((tk) => tk.ticker === t)) {
        pendingTickerRef.current = null;
        loadViewForTicker(t);
      } else {
        pendingTickerRef.current = t;
      }
    };
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      gotoSymbol(((detail.symbol || "") as string).toString());
    };
    window.addEventListener("reit-viz:goto-symbol", handler);
    try {
      const stored = localStorage.getItem("reit-viz.dashboard.pending-symbol");
      if (stored) {
        localStorage.removeItem("reit-viz.dashboard.pending-symbol");
        gotoSymbol(stored);
      }
    } catch {}
    return () => window.removeEventListener("reit-viz:goto-symbol", handler);
  }, [tickerList, loadViewForTicker]);

  // Drain a pending Re-Rating analysis once the ticker list is ready. We keep
  // pendingRerateRef set (so the auto-load-default effect below reliably skips
  // even within the same render batch) and use a started flag to load once.
  const rerateStartedRef = useRef(false);
  useEffect(() => {
    const p = pendingRerateRef.current;
    if (p && !rerateStartedRef.current && tickerList.length > 0 && tickerList.some((tk) => tk.ticker === p.ticker)) {
      rerateStartedRef.current = true;
      loadRerateAnalysis(p.ticker, p.metricKey, p.lookbackDays);
    }
  }, [tickerList, loadRerateAnalysis]);

  // Drain a pending Pair Ratios ratio once the ticker list is ready (same
  // started-flag pattern as the Re-Rating drain above).
  const pairStartedRef = useRef(false);
  useEffect(() => {
    const p = pendingPairRef.current;
    // Gate only on the data layer being ready — NOT on the legs being
    // workbook members: pair legs may be arbitrary Yahoo symbols (e.g. MTF
    // Setups pair rows hand off QQQ/SPY), and the ratio builder has a
    // /api/yahoo-prices fallback for those. Clearing the ref un-suppresses
    // the default auto-load if the ratio load comes back empty.
    if (p && !pairStartedRef.current && tickerList.length > 0) {
      pairStartedRef.current = true;
      // NOTE: pendingPairRef stays set — it suppresses the default auto-load
      // below, which would otherwise race the ratio load and clobber the pane.
      loadPairRatio(p.tickerA, p.tickerB, p.metric);
    }
  }, [tickerList, loadPairRatio]);

  // Auto-load first ticker (or URL-specified ticker) with default view
  useEffect(() => {
    if (tickerList.length > 0 && !activeTicker && !isLoadingView && !pendingRerateRef.current && !pendingPairRef.current) {
      const pending = pendingTickerRef.current;
      const startTicker = pending && tickerList.some((tk) => tk.ticker === pending)
        ? pending : tickerList[0].ticker;
      pendingTickerRef.current = null;
      loadViewForTicker(startTicker);
    }
  }, [tickerList, activeTicker, isLoadingView, loadViewForTicker]);

  // Handle ticker param arriving after initial load (e.g. navigating from Ranking while already on Charts)
  useEffect(() => {
    const pending = pendingTickerRef.current;
    if (pending && tickerList.length > 0 && tickerList.some((tk) => tk.ticker === pending)) {
      pendingTickerRef.current = null;
      loadViewForTicker(pending);
    }
  }, [tickerList, loadViewForTicker]);

  // Change preset view for current ticker
  const changeView = useCallback(
    (viewName: string) => {
      setActiveView(viewName);
      const ticker = activeTicker || (tickerList.length > 0 ? tickerList[0].ticker : null);
      if (ticker) {
        loadViewForTicker(ticker, viewName);
      }
    },
    [activeTicker, tickerList, loadViewForTicker]
  );

  // Add series with specific add mode
  const addSeriesWithMode = useCallback(
    (seriesList: PlottedSeries[], mode: "overlay" | "new-all" | "new-each", targetPaneId?: number) => {
      // Remember the metrics being added so they carry across company switches.
      // (Filtered against the preset in loadViewForTicker, so preset metrics are
      // no-ops here.)
      for (const s of seriesList) {
        if (s.metric && !extraMetricsRef.current.includes(s.metric)) {
          extraMetricsRef.current = [...extraMetricsRef.current, s.metric];
        }
      }
      if (mode === "overlay" && targetPaneId !== undefined) {
        setPlottedSeries((prev) => {
          const next = [...prev];
          for (const s of seriesList) {
            if (!next.find((x) => x.id === s.id)) {
              next.push({ ...s, paneIndex: targetPaneId });
            }
          }
          return next;
        });
      } else if (mode === "new-all") {
        const paneId = nextPaneId++;
        const paneTicker = seriesList[0]?.ticker;
        setPanes((prev) => [...prev, { id: paneId, label: `Pane ${paneId}`, ticker: paneTicker }]);
        setPlottedSeries((prev) => {
          const next = [...prev];
          for (const s of seriesList) {
            if (!next.find((x) => x.id === s.id)) {
              next.push({ ...s, paneIndex: paneId });
            }
          }
          return next;
        });
      } else {
        const newPanes: PaneInfo[] = [];
        const newSeriesList: PlottedSeries[] = [];
        for (const s of seriesList) {
          const paneId = nextPaneId++;
          newPanes.push({ id: paneId, label: `${tickerDisplayName(s.ticker)} \u2014 ${s.metric}`, ticker: s.ticker });
          newSeriesList.push({ ...s, paneIndex: paneId });
        }
        setPanes((prev) => [...prev, ...newPanes]);
        setPlottedSeries((prev) => {
          const next = [...prev];
          for (const s of newSeriesList) {
            if (!next.find((x) => x.id === s.id)) {
              next.push(s);
            }
          }
          return next;
        });
      }
    },
    [tickerDisplayName]
  );

  const removeSeries = useCallback((id: string) => {
    pushLayoutHistory();
    const gen = ++paneGeneration;
    // If this was a user-added metric and no other pane still uses it, stop
    // carrying it to the next company.
    const removed = plottedSeriesRef.current.find((s) => s.id === id);
    if (removed) {
      const stillUsed = plottedSeriesRef.current.some(
        (s) => s.id !== id && s.metric === removed.metric
      );
      if (!stillUsed) {
        extraMetricsRef.current = extraMetricsRef.current.filter((m) => m !== removed.metric);
      }
    }
    setPlottedSeries((prev) => prev.filter((s) => s.id !== id));
    // Clean up orphan panes — but only if no newer operation has occurred
    setTimeout(() => {
      if (paneGeneration !== gen) return; // stale — a loadView or clearAll superseded us
      setPlottedSeries((currentSeries) => {
        const usedPanes = new Set(currentSeries.map((s) => s.paneIndex));
        setPanes((prevPanes) => prevPanes.filter((p) => usedPanes.has(p.id)));
        return currentSeries;
      });
    }, 50);
  }, [pushLayoutHistory]);

  // Clear All: wipe state then reload the default preset view
  const clearAllSeries = useCallback(() => {
    if (!activeTicker) return;
    pushLayoutHistory();
    const ticker = activeTicker;
    const view = activeView;
    // First, fully clear state so React sees a real change
    paneGeneration++;
    nextPaneId = 1;
    setPanes([]);
    setPlottedSeries([]);
    // Then reload after React flushes the empty state
    setTimeout(() => {
      loadViewForTicker(ticker, view);
    }, 0);
  }, [activeTicker, activeView, loadViewForTicker, pushLayoutHistory]);

  // Add a formula-computed series to a new or existing pane. Returns the pane
  // id the series landed on so callers can overlay follow-up series onto a
  // pane they just created.
  const addFormulaSeries = useCallback(
    (series: PlottedSeries, targetPaneId?: number): number => {
      if (targetPaneId !== undefined) {
        // Overlay on existing pane
        setPlottedSeries((prev) => [
          ...prev,
          { ...series, paneIndex: targetPaneId },
        ]);
        return targetPaneId;
      }
      // New pane
      const paneId = nextPaneId++;
      setPanes((prev) => [...prev, { id: paneId, label: series.label, ticker: series.ticker }]);
      setPlottedSeries((prev) => [
        ...prev,
        { ...series, paneIndex: paneId },
      ]);
      return paneId;
    },
    []
  );

  const toggleSeriesVisibility = useCallback((id: string) => {
    setPlottedSeries((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
    );
  }, []);

  const updateSeries = useCallback((id: string, updates: Partial<Pick<PlottedSeries, "color" | "lineWidth" | "lineStyle" | "freq">>) => {
    // Persist to module-level map so style survives component re-mounts
    const existing = seriesStyleOverrides.get(id) || {};
    seriesStyleOverrides.set(id, { ...existing, ...updates });
    setPlottedSeries((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  // When user selects ticker from sidebar, load the active view
  const handleSetActiveTicker = useCallback(
    (ticker: string | null) => {
      if (ticker) {
        loadViewForTicker(ticker);
      } else {
        setActiveTicker(null);
      }
    },
    [loadViewForTicker]
  );

  return (
    <div className="flex h-full w-full overflow-hidden" data-testid="dashboard">
      {sidebarOpen && (
        <Sidebar
          tickers={tickers}
          plottedSeries={plottedSeries}
          panes={panes}
          indicatorsMap={indicatorsMap}
          onToggleSubChart={(paneId, type) =>
            setIndicatorsMap((prev) => {
              const cur = prev[paneId];
              if (!cur) return prev;
              const hidden: string[] = cur.hiddenSubCharts ?? [];
              const next = hidden.includes(type)
                ? hidden.filter((t: string) => t !== type)
                : [...hidden, type];
              return { ...prev, [paneId]: { ...cur, hiddenSubCharts: next.length ? next : undefined } };
            })
          }
          activeTicker={activeTicker}
          onSetActiveTicker={handleSetActiveTicker}
          onAddSeriesWithMode={addSeriesWithMode}
          onRemoveSeries={removeSeries}
          onRemovePane={removePane}
          onMoveSeriesToPane={moveSeriesToPane}
          onDuplicateSeries={duplicateSeriesToNewPane}
          onReorderPanes={reorderPanes}
          onClearAll={clearAllSeries}
          onToggleVisibility={toggleSeriesVisibility}
          onUpdateSeries={updateSeries}
          onClose={() => setSidebarOpen(false)}
          chartConfig={chartConfig}
          onChartConfigChange={setChartConfig}
          onAddFormulaSeries={addFormulaSeries}
          forceOpenSection={forceOpenSection}
          onForceOpenHandled={() => setForceOpenSection(null)}
        />
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChartArea
          plottedSeries={plottedSeries}
          panes={panes}
          onPaneFreqChange={(paneId: number, f: "chart" | "weekly" | "monthly") =>
            setPanes((prev) => prev.map((p) => (p.id === paneId ? { ...p, freq: f === "chart" ? undefined : f } : p)))
          }
          activeTicker={activeTicker}
          activeTickerLabel={activeTicker ? tickerDisplayName(activeTicker) : null}
          chartConfig={chartConfig}
          onChartConfigChange={setChartConfig}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          tickerList={tickerList}
          carouselTickerList={filteredTickerList}
          carouselClassFilters={carouselClassFilters}
          onCarouselClassFiltersChange={setCarouselClassFilters}
          carouselClassOptions={classFilterOptions}
          currentTickerIndex={currentTickerIndex}
          onNavigateTicker={navigateTicker}
          onSelectTicker={(ticker: string) => remapLayoutToTicker(ticker)}
          activeView={activeView}
          presetViews={Object.keys(PRESET_VIEWS)}
          viewGroups={[
            { label: "Preset Views", views: PRESET_VIEWS },
            { label: "Fundamentals", views: FUNDAMENTAL_VIEWS },
            { label: "Interview Prep", views: INTERVIEW_VIEWS },
          ].map((g) => ({ label: g.label, items: Object.keys(g.views) }))}
          fundamentalViews={Object.keys(FUNDAMENTAL_VIEWS)}
          interviewViews={Object.keys(INTERVIEW_VIEWS)}
          customChartViews={customChartViews}
          onChangeView={changeView}
          onSaveCustomView={(label, metrics) => saveChartViewMut.mutate({ label, metrics })}
          onDeleteCustomView={(id) => deleteChartViewMut.mutate(id)}
          isSavingView={saveChartViewMut.isPending}
          currentMetrics={plottedSeries.filter(s => s.visible).map(s => s.metric)}
          isLoadingView={isLoadingView}
          ohlcData={ohlcData}
          ohlcCache={ohlcCache}
          onOpenMacroOverlay={() => {
            setSidebarOpen(true);
            setForceOpenSection("macro");
          }}
          onAddFormulaSeries={addFormulaSeries}
          onDuplicateSeries={duplicateSeriesToNewPane}
          onRemovePane={removePane}
          onReorderPanes={reorderPanes}
          onChangeSeriesMetric={changeSeriesMetric}
          onCrosshairTimeChange={setCrosshairTime}
          pairsPresets={PAIRS_PRESETS}
          onLoadPairsPreset={loadPairsPreset}
          relativeValuePresets={RELATIVE_VALUE_PRESETS}
          onLoadRelativeValuePreset={loadRelativeValuePreset}
          onNewChart={handleNewChart}
          onSaveCurrentAsNewChart={handleSaveCurrentAsNewChart}
          onManualSaveCustomChart={handleManualSaveCustomChart}
          isSavingCustomChart={createCustomChartMut.isPending || updateCustomChartMut.isPending}
          lastManualSaveAt={lastManualSaveAt}
          autoSaveEnabled={autoSaveEnabled}
          onAutoSaveEnabledChange={setAutoSaveEnabled}
          savedCustomCharts={savedCustomCharts}
          activeCustomChartId={activeCustomChartId}
          onLoadCustomChart={handleLoadCustomChart}
          onRenameCustomChart={(id, name) => renameCustomChartMut.mutate({ id, name })}
          onDeleteCustomChart={(id) => {
            deleteCustomChartMut.mutate(id);
            if (activeCustomChartId === id) handleExitCustomChart();
          }}
          onExitCustomChart={handleExitCustomChart}
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          indicatorsMap={indicatorsMap}
          onIndicatorsMapChange={setIndicatorsMap}
          colorByMap={colorByMap}
          onColorByMapChange={setColorByMap}
          toolbarRight={
            <WorkspaceManager
              onSave={serializeState}
              onLoad={restoreState}
              activeWorkspaceId={activeWorkspaceId}
              onSetActiveWorkspaceId={setActiveWorkspaceId}
            />
          }
        />
        <DataTable plottedSeries={plottedSeries} crosshairTime={crosshairTime} frequency={chartConfig.frequency} panes={panes} />
      </div>
    </div>
  );
}
