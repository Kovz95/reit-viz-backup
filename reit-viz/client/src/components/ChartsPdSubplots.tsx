// Reconstructed from recovered-bundle/index-CsG73Aq_.js (fn Iqe) on 2026-06-17
//
// In-Charts Premium/Discount subplots panel. Renders mode-specific selectors
// (single/peer/ticker/group/basket/basketAB), a Cap-wtd/Median basket-aggregation
// toggle, Window/Lag inputs, and two lightweight-charts subplots:
//   - PD Ratio       = premium% ÷ growth-differential
//   - Prem↔Growth Corr (rolling correlation, two overlaid series)
// Each subplot has an expand button that maximizes it within the panel.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  AreaSeries,
  LineSeries,
} from "lightweight-charts";
import { Maximize2, Minimize2 } from "lucide-react";
import { useBaskets } from "@/lib/useBaskets";
import {
  getMetricSeries,
  getCloseSeries,
  getGroupMedianSeries,
  filterTickersByDimension,
  CLASSIFICATION_DIMENSIONS,
} from "@/lib/dataService";
import {
  computePremiumSeries,
  computePremiumDiff,
  computePremiumDiffAbs,
} from "@/lib/premiumDiscount";
import { getCapWeightedBasketSeries } from "@/lib/basketAggregation";
import { categorizeMetric } from "@/lib/metricCategories";

// ── Constants (jqe / Mqe / MT / K2 / nR / colors / thresholds) ───────────────
// Curated base entries — kept verbatim (incl. computed-series ids like
// "EBITDA Fwd Growth%" that aren't raw data metrics). The component unions these
// with any Valuation/Growth metrics present in the loaded data (see below).
const VAL_METRICS_BASE = [
  { id: "P/FFO FY2", label: "P/FFO FY2" },
  { id: "P/FFO LTM", label: "P/FFO LTM" },
  { id: "P/AFFO FY2", label: "P/AFFO FY2" },
  { id: "EV/EBITDA FY2", label: "EV/EBITDA FY2" },
  { id: "EV/EBITDA LTM", label: "EV/EBITDA LTM" },
  { id: "P/E FY2", label: "P/E FY2" },
  { id: "P/E LTM", label: "P/E LTM" },
  { id: "P/S FY2", label: "P/S FY2" },
  { id: "P/S LTM", label: "P/S LTM" },
  { id: "Dividend Yield", label: "Dividend Yield" },
  { id: "FFO Yield FY2", label: "FFO Yield FY2" },
  { id: "AFFO Yield FY2", label: "AFFO Yield FY2" },
];

const GROWTH_METRICS_BASE = [
  { id: "FY1 EPS Growth", label: "FY1 EPS Growth" },
  { id: "FY2 EPS Growth", label: "FY2 EPS Growth" },
  { id: "FY1 FFO Growth", label: "FY1 FFO Growth" },
  { id: "FY2 FFO Growth", label: "FY2 FFO Growth" },
  { id: "FY2 AFFO Growth", label: "FY2 AFFO Growth" },
  { id: "EBITDA Fwd Growth%", label: "EBITDA Fwd Growth (FY1/LTM)" },
  { id: "EBITDA FY2 Growth%", label: "EBITDA FY2 Growth (FY2/FY1)" },
  { id: "Sales LTM YoY%", label: "Sales LTM YoY %" },
];

// Union the curated base with data metrics whose category matches (Valuation /
// Yields for "Val", Growth for "Growth"), so new workbook metrics show up.
function unionMetricOptions(
  base: { id: string; label: string }[],
  dataMetrics: string[],
  categories: string[],
): { id: string; label: string }[] {
  const seen = new Set(base.map((b) => b.id));
  const extra = dataMetrics
    .filter((m) => !seen.has(m) && categories.includes(categorizeMetric(m)))
    .sort((a, b) => a.localeCompare(b))
    .map((m) => ({ id: m, label: m }));
  return [...base, ...extra];
}

const DIMENSION_KEYS = CLASSIFICATION_DIMENSIONS;
const DIMENSION_LABELS: Record<string, string> = {
  economy: "Economy",
  sector: "Sector",
  subsector: "Subsector",
  industryGroup: "Industry Group",
  industry: "Industry",
  subindustry: "Subindustry",
};

const ALL_REITS_KEY = "__ALL__";

const CHART_BG_COLOR = "transparent";
const CHART_TEXT_COLOR = "rgba(255,255,255,0.55)";
const GRID_LINE_COLOR = "rgba(255,255,255,0.05)";
const ZERO_LINE_COLOR = "rgba(255,255,255,0.35)";

const RATIO_MIN_DENOM = 0.5;
const RATIO_MAX_ABS = 50;

// ── Types ────────────────────────────────────────────────────────────────────
interface TimePoint {
  time: string;
  value: number;
}

export interface PdSubplotsState {
  showPDRatio: boolean;
  showCorrChart: boolean;
  valMetric: string;
  growthMetric: string;
  compareMode: "peer" | "ticker" | "group" | "basket" | "basketAB";
  dimension: string;
  classValue: string;
  peerValueOverride: string;
  peerTicker: string;
  groupADim: string;
  groupAValue: string;
  groupBDim: string;
  groupBValue: string;
  basketId: string;
  basketAId: string;
  basketBId: string;
  rollWindow: number;
  rollLag: number;
  basketAggregation?: "capWeighted" | "median";
}

interface TickerRow {
  ticker: string;
  [key: string]: any;
}

interface ChartsPdSubplotsProps {
  mode: string;
  symbol: string;
  symbolB?: string;
  allTickers: TickerRow[];
  state: PdSubplotsState;
  onStateChange: (patch: Partial<PdSubplotsState>) => void;
  registerExternalChart?: (id: string, chart: any) => void;
  unregisterExternalChart?: (id: string) => void;
  maximizedId?: string | null;
  onMaximizeChange?: (id: string | null) => void;
  fillContainer?: boolean;
}

// ── Helpers (jT / aq + Tj) ───────────────────────────────────────────────────
function toLineData(series: TimePoint[]): TimePoint[] {
  return series.map((p) => ({ time: p.time, value: p.value }));
}

function pearson(
  n: number,
  sumX: number,
  sumY: number,
  sumXX: number,
  sumYY: number,
  sumXY: number,
): number {
  const num = n * sumXY - sumX * sumY;
  const dx = n * sumXX - sumX * sumX;
  const dy = n * sumYY - sumY * sumY;
  const denom = Math.sqrt(Math.max(0, dx) * Math.max(0, dy));
  return denom === 0 ? NaN : num / denom;
}

// Rolling Pearson correlation between two aligned series, with optional lag.
function rollingCorrSeries(
  seriesA: TimePoint[],
  seriesB: TimePoint[],
  window: number,
  lag = 0,
): TimePoint[] {
  if (window < 2 || seriesA.length === 0 || seriesB.length === 0) return [];
  const byTime = new Map<string, number>();
  for (const p of seriesB) byTime.set(p.time, p.value);
  const xs: number[] = [];
  const ys: number[] = [];
  const times: string[] = [];
  for (const p of seriesA) {
    const v = byTime.get(p.time);
    if (v !== undefined && Number.isFinite(v) && Number.isFinite(p.value)) {
      xs.push(p.value);
      ys.push(v);
      times.push(p.time);
    }
  }
  const len = xs.length;
  if (len === 0) return [];
  const out: TimePoint[] = [];
  const absLag = Math.abs(lag);
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  const pair = (i: number): [number, number] =>
    lag >= 0 ? [xs[i], ys[i - lag]] : [xs[i - -lag], ys[i]];
  if (absLag + window - 1 >= len) return [];
  for (let i = absLag; i < absLag + window; i++) {
    const [x, y] = pair(i);
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
    sumXY += x * y;
  }
  {
    const i = absLag + window - 1;
    out.push({ time: times[i], value: pearson(window, sumX, sumY, sumXX, sumYY, sumXY) });
  }
  for (let i = absLag + window; i < len; i++) {
    const [x, y] = pair(i);
    const [xOld, yOld] = pair(i - window);
    sumX += x - xOld;
    sumY += y - yOld;
    sumXX += x * x - xOld * xOld;
    sumYY += y * y - yOld * yOld;
    sumXY += x * y - xOld * yOld;
    out.push({ time: times[i], value: pearson(window, sumX, sumY, sumXX, sumYY, sumXY) });
  }
  return out;
}

// Plain cross-sectional median across constituents' normalized close series.
function medianFromSeries(allSeries: TimePoint[][]): TimePoint[] {
  const times = new Set<string>();
  const maps: Map<string, number>[] = [];
  for (const s of allSeries) {
    const m = new Map<string, number>();
    let base: number | null = null;
    for (const pt of s) {
      if (!Number.isFinite(pt.value) || pt.value <= 0) continue;
      if (base === null) base = pt.value;
      m.set(pt.time, pt.value / base);
      times.add(pt.time);
    }
    maps.push(m);
  }
  const sorted = Array.from(times).sort();
  const result: TimePoint[] = [];
  for (const t of sorted) {
    const vals: number[] = [];
    for (const m of maps) {
      const v = m.get(t);
      if (v != null && Number.isFinite(v)) vals.push(v);
    }
    if (vals.length < 3) continue;
    vals.sort((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    const median = vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
    result.push({ time: t, value: median });
  }
  return result;
}

// ── Component (fn Iqe) ───────────────────────────────────────────────────────
export default function ChartsPdSubplots({
  mode,
  symbol,
  symbolB,
  allTickers,
  state,
  onStateChange,
  registerExternalChart,
  unregisterExternalChart,
  maximizedId,
  onMaximizeChange,
  fillContainer,
}: ChartsPdSubplotsProps) {
  const {
    showPDRatio,
    showCorrChart,
    valMetric,
    growthMetric,
    compareMode,
    dimension,
    classValue,
    peerValueOverride,
    peerTicker,
    groupADim,
    groupAValue,
    groupBDim,
    groupBValue,
    basketId,
    basketAId,
    basketBId,
    rollWindow,
    rollLag,
  } = state;
  const basketAggregation = state.basketAggregation ?? "capWeighted";

  const patchState = useCallback((patch: Partial<PdSubplotsState>) => onStateChange(patch), [onStateChange]);

  // Metrics present across the loaded universe, used to extend the curated lists.
  const dataMetrics = useMemo(() => {
    const s = new Set<string>();
    for (const t of allTickers) {
      const ms = (t as any).metrics;
      if (Array.isArray(ms)) for (const m of ms) s.add(m);
    }
    return [...s];
  }, [allTickers]);
  const valMetricOptions = useMemo(
    () => unionMetricOptions(VAL_METRICS_BASE, dataMetrics, ["Valuation", "Yields"]),
    [dataMetrics],
  );
  const growthMetricOptions = useMemo(
    () => unionMetricOptions(GROWTH_METRICS_BASE, dataMetrics, ["Growth"]),
    [dataMetrics],
  );

  // Basket-metric fetcher honoring the aggregation toggle (cap-weighted vs median).
  const fetchBasketMetric = useCallback(
    async (basket: any, tickers: string[], metric: string) => {
      if (basketAggregation === "capWeighted" && basket) {
        const getVal = async (ticker: string, m: string) => {
          try {
            return await getMetricSeries(ticker, m);
          } catch {
            return await getCloseSeries(ticker, m);
          }
        };
        const effectiveBasket =
          tickers.length === basket.tickers.length ? basket : { ...basket, tickers };
        const { series } = await getCapWeightedBasketSeries(effectiveBasket, metric, getVal);
        return {
          groupSeries: series,
          peerTickers: tickers,
          peerCount: new Array(series.length).fill(tickers.length),
        };
      }
      return getGroupMedianSeries(tickers, metric, getMetricSeries);
    },
    [basketAggregation],
  );

  const { baskets, getBasket } = useBaskets();

  // Auto-select baskets when missing.
  useEffect(() => {
    if (compareMode === "basket" && !basketId && baskets.length > 0) {
      patchState({ basketId: baskets[0].id });
    }
  }, [compareMode, basketId, baskets, patchState]);

  useEffect(() => {
    if (compareMode === "basketAB" && baskets.length > 0) {
      const patch: Partial<PdSubplotsState> = {};
      if (!basketAId) patch.basketAId = baskets[0].id;
      if (!basketBId) patch.basketBId = baskets[baskets.length > 1 ? 1 : 0].id;
      if (Object.keys(patch).length > 0) patchState(patch);
    }
  }, [compareMode, basketAId, basketBId, baskets, patchState]);

  const active = showPDRatio || showCorrChart;

  // Keep classValue in sync with the active ticker's classification (or override).
  useEffect(() => {
    if (peerValueOverride) {
      if (classValue !== peerValueOverride) patchState({ classValue: peerValueOverride });
      return;
    }
    if (!symbol || allTickers.length === 0) return;
    const row = allTickers.find((t) => t.ticker === symbol);
    if (row) {
      const val = row[dimension] || "";
      if (classValue !== val) patchState({ classValue: val });
    }
  }, [symbol, allTickers, dimension, peerValueOverride, classValue, patchState]);

  // Default group-A value from the active ticker's classification.
  useEffect(() => {
    if (compareMode !== "group" || allTickers.length === 0 || !symbol || groupAValue) return;
    const row = allTickers.find((t) => t.ticker === symbol);
    if (row) {
      const val = row[groupADim] || "";
      if (val) patchState({ groupAValue: val });
    }
  }, [compareMode, symbol, allTickers, groupADim, groupAValue, patchState]);

  // In pairs mode, default the peer ticker to symbolB.
  useEffect(() => {
    if (mode !== "pairs" || !symbolB) return;
    if (!peerTicker || (peerTicker !== symbolB && compareMode === "ticker")) {
      patchState({ peerTicker: symbolB });
    }
  }, [mode, symbolB, peerTicker, compareMode, patchState]);

  // Default peer ticker in vs-ticker mode.
  useEffect(() => {
    if (compareMode !== "ticker" || allTickers.length === 0 || !symbol) return;
    if (peerTicker && peerTicker !== symbol) return;
    if (mode === "pairs" && symbolB && symbolB !== symbol) {
      patchState({ peerTicker: symbolB });
      return;
    }
    const sameClass = allTickers.find((t) => t.ticker !== symbol && t[dimension] === classValue);
    const anyOther = allTickers.find((t) => t.ticker !== symbol);
    const chosen = sameClass?.ticker || anyOther?.ticker || "";
    if (chosen) patchState({ peerTicker: chosen });
  }, [compareMode, symbol, peerTicker, allTickers, dimension, classValue, mode, symbolB, patchState]);

  // ── Series state ───────────────────────────────────────────────────────────
  const [premiumSeries, setPremiumSeries] = useState<any[]>([]);
  const [growthSeries, setGrowthSeries] = useState<any[]>([]);
  const [closesA, setClosesA] = useState<any[]>([]);
  const [closesB, setClosesB] = useState<any[]>([]);
  const [computing, setComputing] = useState(false);
  const [localMaximized, setLocalMaximized] = useState<string | null>(null);
  const expandedId = maximizedId ?? localMaximized;
  const setExpanded = useCallback(
    (id: string | null) => {
      if (onMaximizeChange) onMaximizeChange(id);
      else setLocalMaximized(id);
    },
    [onMaximizeChange],
  );

  // ── Compute premium / growth differential series ─────────────────────────────
  useEffect(() => {
    if (
      !active ||
      ((compareMode === "peer" || compareMode === "ticker" || compareMode === "basket") && !symbol) ||
      (compareMode === "peer" && !classValue) ||
      (compareMode === "ticker" && (!peerTicker || peerTicker === symbol)) ||
      (compareMode === "group" && (!groupAValue || !groupBValue)) ||
      (compareMode === "group" && groupADim === groupBDim && groupAValue === groupBValue) ||
      (compareMode === "basket" && !basketId) ||
      (compareMode === "basketAB" && (!basketAId || !basketBId))
    )
      return;
    let alive = true;
    setComputing(true);
    (async () => {
      try {
        if (compareMode === "peer") {
          const valRes = await computePremiumSeries(
            symbol, dimension, classValue, valMetric, "median", undefined, getMetricSeries,
          );
          const premDiff = computePremiumDiff(valRes.targetSeries, valRes.groupSeries, "pct");
          const growthRes = await computePremiumSeries(
            symbol, dimension, classValue, growthMetric, "median", undefined, getMetricSeries,
          );
          const growthDiff = computePremiumDiff(growthRes.targetSeries, growthRes.groupSeries, "abs");
          if (!alive) return;
          setPremiumSeries(premDiff);
          setGrowthSeries(growthDiff);
        } else if (compareMode === "ticker") {
          const [aVal, bVal, aGrowth, bGrowth] = await Promise.all([
            getMetricSeries(symbol, valMetric).catch(() => []),
            getMetricSeries(peerTicker, valMetric).catch(() => []),
            getMetricSeries(symbol, growthMetric).catch(() => []),
            getMetricSeries(peerTicker, growthMetric).catch(() => []),
          ]);
          const premDiff = computePremiumDiff(aVal, bVal, "pct");
          const growthDiff = computePremiumDiff(aGrowth, bGrowth, "abs");
          if (!alive) return;
          setPremiumSeries(premDiff);
          setGrowthSeries(growthDiff);
        } else if (compareMode === "group") {
          const [aVal, bVal, aGrowth, bGrowth] = (await Promise.all([
            computePremiumDiffAbs(groupADim, groupAValue, valMetric, "median", getMetricSeries),
            computePremiumDiffAbs(groupBDim, groupBValue, valMetric, "median", getMetricSeries),
            computePremiumDiffAbs(groupADim, groupAValue, growthMetric, "median", getMetricSeries),
            computePremiumDiffAbs(groupBDim, groupBValue, growthMetric, "median", getMetricSeries),
          ])) as any[];
          const premDiff = computePremiumDiff(aVal.groupSeries, bVal.groupSeries, "pct");
          const growthDiff = computePremiumDiff(aGrowth.groupSeries, bGrowth.groupSeries, "abs");
          if (!alive) return;
          setPremiumSeries(premDiff);
          setGrowthSeries(growthDiff);
        } else if (compareMode === "basket") {
          const basket = getBasket(basketId);
          const peers = (basket?.tickers || []).filter((t: string) => t && t !== symbol);
          const [aVal, aGrowth, bValRes, bGrowthRes] = await Promise.all([
            getMetricSeries(symbol, valMetric).catch(() => []),
            getMetricSeries(symbol, growthMetric).catch(() => []),
            fetchBasketMetric(basket, peers, valMetric),
            fetchBasketMetric(basket, peers, growthMetric),
          ]);
          const premDiff = computePremiumDiff(aVal, bValRes.groupSeries, "pct");
          const growthDiff = computePremiumDiff(aGrowth, bGrowthRes.groupSeries, "abs");
          if (!alive) return;
          setPremiumSeries(premDiff);
          setGrowthSeries(growthDiff);
        } else {
          const basketA = getBasket(basketAId);
          const basketB = getBasket(basketBId);
          const tickersA = basketA?.tickers || [];
          const tickersB = basketB?.tickers || [];
          const [aVal, bVal, aGrowth, bGrowth] = await Promise.all([
            fetchBasketMetric(basketA, tickersA, valMetric),
            fetchBasketMetric(basketB, tickersB, valMetric),
            fetchBasketMetric(basketA, tickersA, growthMetric),
            fetchBasketMetric(basketB, tickersB, growthMetric),
          ]);
          const premDiff = computePremiumDiff(aVal.groupSeries, bVal.groupSeries, "pct");
          const growthDiff = computePremiumDiff(aGrowth.groupSeries, bGrowth.groupSeries, "abs");
          if (!alive) return;
          setPremiumSeries(premDiff);
          setGrowthSeries(growthDiff);
        }
      } catch {
        /* ignore */
      } finally {
        if (alive) setComputing(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [
    active, symbol, dimension, classValue, valMetric, growthMetric, compareMode, peerTicker,
    groupADim, groupAValue, groupBDim, groupBValue, basketId, basketAId, basketBId,
    getBasket, basketAggregation, fetchBasketMetric,
  ]);

  // ── Compute close-price series (for the corr subplot's ratio↔A/B line) ──────
  useEffect(() => {
    if (
      !active ||
      ((compareMode === "peer" || compareMode === "ticker" || compareMode === "basket") && !symbol) ||
      (compareMode === "peer" && !classValue) ||
      (compareMode === "ticker" && (!peerTicker || peerTicker === symbol)) ||
      (compareMode === "group" && (!groupAValue || !groupBValue)) ||
      (compareMode === "basket" && !basketId) ||
      (compareMode === "basketAB" && (!basketAId || !basketBId))
    )
      return;
    let alive = true;
    const peerRows = filterTickersByDimension(allTickers, dimension, classValue);
    (async () => {
      try {
        if (compareMode === "group") {
          const rowsA = filterTickersByDimension(allTickers, groupADim, groupAValue);
          const rowsB = filterTickersByDimension(allTickers, groupBDim, groupBValue);
          const [seriesA, seriesB] = await Promise.all([
            Promise.all(rowsA.map((r: any) => getMetricSeries(r.ticker, "close").catch(() => []))),
            Promise.all(rowsB.map((r: any) => getMetricSeries(r.ticker, "close").catch(() => []))),
          ]);
          if (!alive) return;
          setClosesA(medianFromSeries(seriesA));
          setClosesB(medianFromSeries(seriesB));
          return;
        }
        if (compareMode === "basket") {
          const peers = (getBasket(basketId)?.tickers || []).filter((t: string) => t && t !== symbol);
          const [targetClose, peerCloses] = await Promise.all([
            getMetricSeries(symbol, "close").catch(() => []),
            Promise.all(peers.map((t: string) => getMetricSeries(t, "close").catch(() => []))),
          ]);
          if (!alive) return;
          setClosesA(targetClose);
          setClosesB(medianFromSeries(peerCloses));
          return;
        }
        if (compareMode === "basketAB") {
          const basketA = getBasket(basketAId);
          const basketB = getBasket(basketBId);
          const tickersA = basketA?.tickers || [];
          const tickersB = basketB?.tickers || [];
          const [seriesA, seriesB] = await Promise.all([
            Promise.all(tickersA.map((t: string) => getMetricSeries(t, "close").catch(() => []))),
            Promise.all(tickersB.map((t: string) => getMetricSeries(t, "close").catch(() => []))),
          ]);
          if (!alive) return;
          setClosesA(medianFromSeries(seriesA));
          setClosesB(medianFromSeries(seriesB));
          return;
        }
        const targetClose = await getMetricSeries(symbol, "close").catch(() => []);
        if (compareMode === "ticker") {
          const peerClose = await getMetricSeries(peerTicker, "close").catch(() => []);
          if (!alive) return;
          setClosesA(targetClose);
          setClosesB(peerClose);
        } else {
          const peerList = peerRows.filter((r: any) => r.ticker !== symbol).map((r: any) => r.ticker);
          const peerCloses = await Promise.all(
            peerList.map((t: string) => getMetricSeries(t, "close").catch(() => [])),
          );
          if (!alive) return;
          setClosesA(targetClose);
          setClosesB(medianFromSeries(peerCloses));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, [
    active, symbol, compareMode, peerTicker, classValue, dimension, allTickers,
    groupADim, groupAValue, groupBDim, groupBValue, basketId, basketAId, basketBId, getBasket,
  ]);

  // ── Derived series ───────────────────────────────────────────────────────────
  const ratioSeries = useMemo(() => {
    if (premiumSeries.length === 0 || growthSeries.length === 0) return [];
    const byTime = new Map<string, number>();
    for (const p of growthSeries) byTime.set(p.time, p.value);
    const out: TimePoint[] = [];
    for (const p of premiumSeries) {
      const denom = byTime.get(p.time);
      if (
        denom === undefined ||
        !Number.isFinite(denom) ||
        !Number.isFinite(p.value) ||
        Math.abs(denom) < RATIO_MIN_DENOM
      )
        continue;
      const ratio = p.value / denom;
      if (Number.isFinite(ratio) && Math.abs(ratio) <= RATIO_MAX_ABS) {
        out.push({ time: p.time, value: ratio });
      }
    }
    return out;
  }, [premiumSeries, growthSeries]);

  const rawRatioSeries = useMemo(() => {
    if (closesA.length === 0 || closesB.length === 0) return [];
    const byTime = new Map<string, number>();
    for (const p of closesB) if (Number.isFinite(p.value) && p.value > 0) byTime.set(p.time, p.value);
    const out: TimePoint[] = [];
    for (const p of closesA) {
      if (!Number.isFinite(p.value) || p.value <= 0) continue;
      const denom = byTime.get(p.time);
      if (denom == null || !Number.isFinite(denom) || denom <= 0) continue;
      const ratio = p.value / denom;
      if (Number.isFinite(ratio) && ratio > 0) out.push({ time: p.time, value: ratio });
    }
    return out;
  }, [closesA, closesB]);

  const rollCorrSeries = useMemo(
    () => rollingCorrSeries(premiumSeries, growthSeries, rollWindow, rollLag),
    [premiumSeries, growthSeries, rollWindow, rollLag],
  );
  const rollCorrRatioVsABSeries = useMemo(
    () => rollingCorrSeries(ratioSeries, rawRatioSeries, rollWindow, rollLag),
    [ratioSeries, rawRatioSeries, rollWindow, rollLag],
  );

  // ── Chart refs ───────────────────────────────────────────────────────────────
  const pdRatioContainerRef = useRef<HTMLDivElement>(null);
  const corrContainerRef = useRef<HTMLDivElement>(null);
  const pdRatioChartRef = useRef<any>(null);
  const pdRatioSeriesRef = useRef<any>(null);
  const corrChartRef = useRef<any>(null);
  const corrSeriesARef = useRef<any>(null);
  const corrSeriesBRef = useRef<any>(null);

  const baseChartOptions = () => ({
    layout: {
      background: { type: ColorType.Solid, color: CHART_BG_COLOR },
      textColor: CHART_TEXT_COLOR,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: GRID_LINE_COLOR },
      horzLines: { color: GRID_LINE_COLOR },
    },
    rightPriceScale: { borderColor: GRID_LINE_COLOR },
    timeScale: { borderColor: GRID_LINE_COLOR, timeVisible: false },
    crosshair: { mode: CrosshairMode.Normal },
    handleScroll: {
      mouseWheel: false,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: false,
    kineticScroll: { mouse: false, touch: false },
    height: 0,
  });

  // ── PD Ratio subplot ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showPDRatio || !pdRatioContainerRef.current) return;
    if (!pdRatioChartRef.current) {
      pdRatioChartRef.current = createChart(pdRatioContainerRef.current, baseChartOptions() as any);
      pdRatioChartRef.current.applyOptions({
        handleScale: { mouseWheel: true, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: false },
      });
      const series = pdRatioChartRef.current.addSeries(LineSeries, {
        color: "rgba(168,85,247,0.95)",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      pdRatioSeriesRef.current = series;
      series.createPriceLine({
        price: 0,
        color: ZERO_LINE_COLOR,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: "",
      });
      registerExternalChart?.("pd-ratio", pdRatioChartRef.current);
    }
    if (pdRatioSeriesRef.current) {
      pdRatioSeriesRef.current.setData(toLineData(ratioSeries));
      try {
        pdRatioChartRef.current?.timeScale().fitContent();
      } catch {
        /* ignore */
      }
    }
  }, [showPDRatio, ratioSeries, registerExternalChart]);

  useEffect(() => {
    if (showPDRatio) return;
    unregisterExternalChart?.("pd-ratio");
    if (pdRatioChartRef.current) {
      try {
        pdRatioChartRef.current.remove();
      } catch {
        /* ignore */
      }
      pdRatioChartRef.current = null;
      pdRatioSeriesRef.current = null;
    }
  }, [showPDRatio, unregisterExternalChart]);

  // ── Prem↔Growth Corr subplot ─────────────────────────────────────────────────
  useEffect(() => {
    if (!showCorrChart || !corrContainerRef.current) return;
    if (!corrChartRef.current) {
      corrChartRef.current = createChart(corrContainerRef.current, baseChartOptions() as any);
      corrChartRef.current.applyOptions({
        handleScale: { mouseWheel: true, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: false },
      });
      const seriesA = corrChartRef.current.addSeries(AreaSeries, {
        lineColor: "rgba(20,184,166,0.95)",
        topColor: "rgba(20,184,166,0.30)",
        bottomColor: "rgba(20,184,166,0.02)",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: -1, maxValue: 1 } }),
      });
      corrSeriesARef.current = seriesA;
      seriesA.createPriceLine({ price: 0, color: ZERO_LINE_COLOR, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      seriesA.createPriceLine({ price: 1, color: "rgba(255,255,255,0.10)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      seriesA.createPriceLine({ price: -1, color: "rgba(255,255,255,0.10)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
      const seriesB = corrChartRef.current.addSeries(LineSeries, {
        color: "rgba(217,70,239,0.95)",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        autoscaleInfoProvider: () => ({ priceRange: { minValue: -1, maxValue: 1 } }),
      });
      corrSeriesBRef.current = seriesB;
      registerExternalChart?.("pd-corr", corrChartRef.current);
    }
    if (corrSeriesARef.current) corrSeriesARef.current.setData(toLineData(rollCorrSeries));
    if (corrSeriesBRef.current) corrSeriesBRef.current.setData(toLineData(rollCorrRatioVsABSeries));
    try {
      corrChartRef.current?.timeScale().fitContent();
    } catch {
      /* ignore */
    }
  }, [showCorrChart, rollCorrSeries, rollCorrRatioVsABSeries, registerExternalChart]);

  useEffect(() => {
    if (showCorrChart) return;
    unregisterExternalChart?.("pd-corr");
    if (corrChartRef.current) {
      try {
        corrChartRef.current.remove();
      } catch {
        /* ignore */
      }
      corrChartRef.current = null;
      corrSeriesARef.current = null;
      corrSeriesBRef.current = null;
    }
  }, [showCorrChart, unregisterExternalChart]);

  useEffect(
    () => () => {
      unregisterExternalChart?.("pd-ratio");
      unregisterExternalChart?.("pd-corr");
      try {
        pdRatioChartRef.current?.remove();
      } catch {
        /* ignore */
      }
      try {
        corrChartRef.current?.remove();
      } catch {
        /* ignore */
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Resize handling ────────────────────────────────────────────────────────
  const handleResize = useCallback(() => {
    if (pdRatioContainerRef.current && pdRatioChartRef.current) {
      pdRatioChartRef.current.applyOptions({
        width: pdRatioContainerRef.current.clientWidth,
        height: pdRatioContainerRef.current.clientHeight,
      });
    }
    if (corrContainerRef.current && corrChartRef.current) {
      corrChartRef.current.applyOptions({
        width: corrContainerRef.current.clientWidth,
        height: corrContainerRef.current.clientHeight,
      });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  useEffect(() => {
    let raf2: number | null = null;
    const raf1 = requestAnimationFrame(() => {
      handleResize();
      raf2 = requestAnimationFrame(() => handleResize());
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 !== null) cancelAnimationFrame(raf2);
    };
  }, [expandedId, handleResize]);

  // Sync visible logical range between the two subplots.
  useEffect(() => {
    const charts: any[] = [];
    if (pdRatioChartRef.current && ratioSeries.length > 0) charts.push(pdRatioChartRef.current);
    if (corrChartRef.current && rollCorrSeries.length > 0) charts.push(corrChartRef.current);
    if (charts.length < 2) return;
    let syncing = false;
    const sync = (range: any, source: any) => {
      if (syncing || !range) return;
      try {
        syncing = true;
        for (const chart of charts) if (chart !== source) chart.timeScale().setVisibleLogicalRange(range);
      } catch {
        /* ignore */
      } finally {
        syncing = false;
      }
    };
    const subs: { chart: any; fn: (range: any) => void }[] = [];
    for (const chart of charts) {
      const fn = (range: any) => sync(range, chart);
      chart.timeScale().subscribeVisibleLogicalRangeChange(fn);
      subs.push({ chart, fn });
    }
    return () => {
      for (const { chart, fn } of subs) {
        try {
          chart.timeScale().unsubscribeVisibleLogicalRangeChange(fn);
        } catch {
          /* ignore */
        }
      }
    };
  }, [ratioSeries.length === 0, rollCorrSeries.length === 0]);

  // ── Classification option lists ──────────────────────────────────────────────
  const classificationOptions = useMemo(() => {
    const lists: Record<string, string[]> = {
      economy: [],
      sector: [],
      subsector: [],
      industryGroup: [],
      industry: [],
      subindustry: [],
    };
    for (const row of allTickers) {
      Object.keys(lists).forEach((key) => {
        const val = (row as any)[key];
        if (val && !lists[key].includes(val)) lists[key].push(val);
      });
    }
    Object.keys(lists).forEach((key) => lists[key].sort());
    return lists;
  }, [allTickers]);

  if (!active) return null;

  return (
    <div
      className={
        fillContainer
          ? "flex-1 min-h-0 flex flex-col border-t border-border bg-background"
          : "flex flex-col border-t border-border bg-background"
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 border-b border-border/50 bg-muted/20">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide mr-1">PD</span>
        <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          Val
          <select
            value={valMetric}
            onChange={(e) => patchState({ valMetric: e.target.value })}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground"
          >
            {valMetricOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          Growth
          <select
            value={growthMetric}
            onChange={(e) => patchState({ growthMetric: e.target.value })}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground"
          >
            {growthMetricOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          Compare
          <select
            value={compareMode}
            onChange={(e) => patchState({ compareMode: e.target.value as PdSubplotsState["compareMode"] })}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground"
          >
            <option value="peer">Peer median</option>
            <option value="ticker">vs ticker</option>
            <option value="group">Group vs Group</option>
            <option value="basket">vs Basket</option>
            <option value="basketAB">Basket vs Basket</option>
          </select>
        </label>
        {compareMode === "peer" && (
          <>
            <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              Dim
              <select
                value={dimension}
                onChange={(e) => patchState({ dimension: e.target.value, peerValueOverride: "" })}
                className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground"
              >
                {DIMENSION_KEYS.map((d) => (
                  <option key={d} value={d}>
                    {DIMENSION_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              Group
              <select
                value={classValue}
                onChange={(e) => patchState({ peerValueOverride: e.target.value, classValue: e.target.value })}
                className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground max-w-[140px]"
              >
                {classificationOptions[dimension].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {compareMode === "ticker" && (
          <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            Peer
            <input
              type="text"
              value={peerTicker}
              onChange={(e) => patchState({ peerTicker: e.target.value.toUpperCase() })}
              placeholder="ticker"
              className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground w-16 uppercase"
            />
          </label>
        )}
        {compareMode === "basket" && (
          <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            Basket
            <select
              value={basketId}
              onChange={(e) => patchState({ basketId: e.target.value })}
              className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground max-w-[160px]"
            >
              {baskets.length === 0 && <option value="">(no baskets)</option>}
              {baskets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.tickers.length})
                </option>
              ))}
            </select>
          </label>
        )}
        {compareMode === "basketAB" && (
          <>
            <span className="text-[10px] font-mono text-muted-foreground">A:</span>
            <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              Basket
              <select
                value={basketAId}
                onChange={(e) => patchState({ basketAId: e.target.value })}
                className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground max-w-[140px]"
              >
                {baskets.length === 0 && <option value="">(no baskets)</option>}
                {baskets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.tickers.length})
                  </option>
                ))}
              </select>
            </label>
            <span className="text-[10px] font-mono text-muted-foreground">B:</span>
            <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              Basket
              <select
                value={basketBId}
                onChange={(e) => patchState({ basketBId: e.target.value })}
                className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground max-w-[140px]"
              >
                {baskets.length === 0 && <option value="">(no baskets)</option>}
                {baskets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.tickers.length})
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {(compareMode === "basket" || compareMode === "basketAB") && (
          <div className="flex items-center gap-1" data-testid="pd-subplots-basket-aggregation-toggle">
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Agg</span>
            <div className="flex border border-border rounded overflow-hidden">
              <button
                type="button"
                onClick={() => patchState({ basketAggregation: "capWeighted" })}
                className={`text-[10px] font-mono px-1.5 py-0.5 transition-colors ${
                  basketAggregation === "capWeighted"
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Cap-weighted (Charts-tab logic): harmonic for multiples, arithmetic for yields/growth/levels, sum for counts. Honors basket's weighting scheme."
              >
                Cap-wtd
              </button>
              <button
                type="button"
                onClick={() => patchState({ basketAggregation: "median" })}
                className={`text-[10px] font-mono px-1.5 py-0.5 transition-colors ${
                  basketAggregation === "median"
                    ? "bg-amber-500/20 text-amber-300"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Plain cross-sectional median across constituents per date."
              >
                Median
              </button>
            </div>
          </div>
        )}
        {compareMode === "group" && (
          <>
            <span className="text-[10px] font-mono text-muted-foreground">A:</span>
            <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              Dim
              <select
                value={groupADim}
                onChange={(e) => patchState({ groupADim: e.target.value })}
                className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground"
              >
                {DIMENSION_KEYS.map((d) => (
                  <option key={d} value={d}>
                    {DIMENSION_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              Val
              <select
                value={groupAValue}
                onChange={(e) => patchState({ groupAValue: e.target.value })}
                className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground max-w-[140px]"
              >
                {classificationOptions[groupADim].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-[10px] font-mono text-muted-foreground">B:</span>
            <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              Dim
              <select
                value={groupBDim}
                onChange={(e) => patchState({ groupBDim: e.target.value })}
                className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground"
              >
                {DIMENSION_KEYS.map((d) => (
                  <option key={d} value={d}>
                    {DIMENSION_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
              Val
              <select
                value={groupBValue}
                onChange={(e) => patchState({ groupBValue: e.target.value })}
                className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground max-w-[140px]"
              >
                <option value={ALL_REITS_KEY}>All REITs</option>
                {classificationOptions[groupBDim].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          Window
          <input
            type="number"
            min={5}
            max={504}
            step={5}
            value={rollWindow}
            onChange={(e) => patchState({ rollWindow: Math.max(5, parseInt(e.target.value) || 60) })}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground w-12"
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          Lag
          <input
            type="number"
            min={-60}
            max={60}
            step={1}
            value={rollLag}
            onChange={(e) => patchState({ rollLag: parseInt(e.target.value) || 0 })}
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground w-12"
          />
        </label>
        {computing && (
          <span className="text-[10px] font-mono text-muted-foreground italic">computing…</span>
        )}
      </div>

      {showPDRatio && expandedId !== "corr" && (
        <div
          className={expandedId === "pdRatio" ? "relative flex-1 min-h-0" : "relative"}
          style={expandedId === "pdRatio" ? undefined : { height: 160 }}
        >
          <div className="absolute top-1 left-2 z-10 flex items-center gap-2 pointer-events-none">
            <span className="text-[10px] font-mono text-muted-foreground">
              PD Ratio
              <span className="text-[9px] ml-1 opacity-60">(prem% ÷ Δg·pp)</span>
            </span>
            {ratioSeries.length === 0 && !computing && (
              <span className="text-[9px] font-mono text-muted-foreground/50">no data</span>
            )}
          </div>
          <button
            className="absolute top-1 right-2 z-20 p-0.5 rounded bg-background/80 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(expandedId === "pdRatio" ? null : "pdRatio")}
            title={expandedId === "pdRatio" ? "Restore" : "Expand PD Ratio"}
            data-testid="expand-pd-ratio"
          >
            {expandedId === "pdRatio" ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          <div ref={pdRatioContainerRef} className="w-full h-full" />
        </div>
      )}

      {showCorrChart && expandedId !== "pdRatio" && (
        <div
          className={expandedId === "corr" ? "relative flex-1 min-h-0" : "relative border-t border-border/30"}
          style={expandedId === "corr" ? undefined : { height: 160 }}
        >
          <div className="absolute top-1 left-2 z-10 flex items-center gap-3 pointer-events-none">
            <span className="text-[10px] font-mono text-muted-foreground">Prem↔Growth Corr</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "rgba(20,184,166,0.95)" }} />
              <span className="text-[9px] font-mono text-muted-foreground/70">prem↔Δg</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "rgba(217,70,239,0.95)" }} />
              <span className="text-[9px] font-mono text-muted-foreground/70">ratio↔A/B</span>
            </span>
            {rollCorrSeries.length === 0 && !computing && (
              <span className="text-[9px] font-mono text-muted-foreground/50">no data</span>
            )}
          </div>
          <button
            className="absolute top-1 right-2 z-20 p-0.5 rounded bg-background/80 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(expandedId === "corr" ? null : "corr")}
            title={expandedId === "corr" ? "Restore" : "Expand Prem↔Growth Corr"}
            data-testid="expand-pd-corr"
          >
            {expandedId === "corr" ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          <div ref={corrContainerRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}
