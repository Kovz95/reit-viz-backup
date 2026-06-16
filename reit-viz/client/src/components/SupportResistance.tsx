// Reconstructed from recovered-bundle/SupportResistance-Cqj5ktkD.js on 2026-06-12
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createChart, CandlestickSeries, CrosshairMode, ColorType, LineSeries, LineStyle } from "lightweight-charts";
import type { CandlestickSeriesPartialOptions } from "lightweight-charts";
import { computeAllMAs } from "@/lib/maUtils";
import { getYahooPairsRatio as yahooPairsRatio } from "@/lib/yahooPairsRatio";
import { UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { BasketTickerPill } from "@/components/BasketTickerPill";
import { BasketPicker } from "@/components/BasketPicker";
import { ClassificationFiltersWithSource } from "@/components/ClassificationFiltersWithSource";
import { useGlobalUniverse } from "@/lib/globalUniverse";
import { getDates, getTickerRaw, filterByDateRange } from "@/lib/dataService";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { emptyClassFilters } from "@/lib/classificationFilters";
import { filterTickersByClassification } from "@/lib/classificationFilters";
import { isBasketTicker } from "@/lib/basketUtils";
import { DATE_PRESETS, createDateRangeFromPreset } from "@/lib/dateUtils";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { navigateToChartsWithPair } from "@/lib/chartNavigation";
import { useUniverse } from "@/lib/universeContext";

// ── Default config ─────────────────────────────────────────────────────────────

const DEFAULT_SR_CONFIG = {
  tolerancePct: 0.005,
  bounceLookahead: 5,
  bounceThresholdPct: 0.015,
  holdBars: 5,
  pivotLeft: 5,
  pivotRight: 5,
  pivotClusterPct: 0.01,
  enableHorizontal: true,
  enableMA: true,
  enableFib: true,
  maTypes: ["SMA", "EMA", "WMA", "HMA", "KAMA", "FRAMA", "T3", "ALMA", "LSMA", "SLSMA"],
  maPeriods: [20, 50, 100, 200],
  fibLookbackBars: 252,
  minTouches: 3,
};

// ── Math helpers ───────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = Date.parse(dateA), b = Date.parse(dateB);
  return isNaN(a) || isNaN(b) ? 0 : Math.round(Math.abs(b - a) / 86400000);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface TouchEvent { date: string; index: number; side: "support" | "resistance"; bouncedReverse: boolean; bounceMagnitudePct: number | null; heldWithoutBreak: boolean; }

interface TouchResult {
  touches: TouchEvent[];
  touchCount: number;
  bounceReverseCount: number;
  bounceReverseRate: number;
  avgBounceMagnitudePct: number;
  holdCount: number;
  holdRate: number;
  lastTouchDate: string | null;
  daysSinceLastTouch: number | null;
  compositeScore: number;
}

function evaluateTouches(levelPrice: number, ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] }, cfg: typeof DEFAULT_SR_CONFIG): TouchResult {
  const { closes, highs, lows, dates } = ohlc;
  const n = closes.length;
  const { tolerancePct, bounceLookahead, bounceThresholdPct, holdBars } = cfg;
  const events: TouchEvent[] = [];

  for (let i = 0; i < n; i++) {
    const c = closes[i], h = highs[i], lo = lows[i];
    const closeTol = Math.abs(c - levelPrice) / c <= tolerancePct;
    const highTol = Math.abs(h - levelPrice) / levelPrice <= tolerancePct;
    const lowTol = Math.abs(lo - levelPrice) / levelPrice <= tolerancePct;
    if (!closeTol && !highTol && !lowTol) continue;
    const side: "support" | "resistance" = c >= levelPrice ? "support" : "resistance";
    let bounced = false, bounceMag: number | null = null;
    const lookEnd = Math.min(n - 1, i + bounceLookahead);
    if (side === "support") {
      const threshold = levelPrice * (1 + bounceThresholdPct);
      let maxMove = -Infinity;
      for (let k = i + 1; k <= lookEnd; k++) {
        if (closes[k] >= threshold) bounced = true;
        const move = (closes[k] - levelPrice) / levelPrice;
        if (move > maxMove) maxMove = move;
      }
      if (maxMove > -Infinity) bounceMag = maxMove * 100;
    } else {
      const threshold = levelPrice * (1 - bounceThresholdPct);
      let maxMove = -Infinity;
      for (let k = i + 1; k <= lookEnd; k++) {
        if (closes[k] <= threshold) bounced = true;
        const move = (levelPrice - closes[k]) / levelPrice;
        if (move > maxMove) maxMove = move;
      }
      if (maxMove > -Infinity) bounceMag = maxMove * 100;
    }
    const holdEnd = Math.min(n - 1, i + holdBars);
    let held = true;
    if (side === "support") {
      const floor = levelPrice * (1 - tolerancePct);
      for (let k = i + 1; k <= holdEnd; k++) { if (closes[k] < floor) { held = false; break; } }
    } else {
      const ceil = levelPrice * (1 + tolerancePct);
      for (let k = i + 1; k <= holdEnd; k++) { if (closes[k] > ceil) { held = false; break; } }
    }
    events.push({ date: dates[i], index: i, side, bouncedReverse: bounced, bounceMagnitudePct: bounceMag, heldWithoutBreak: held });
  }

  const tc = events.length;
  if (tc === 0) return { touches: events, touchCount: 0, bounceReverseCount: 0, bounceReverseRate: 0, avgBounceMagnitudePct: 0, holdCount: 0, holdRate: 0, lastTouchDate: null, daysSinceLastTouch: null, compositeScore: 0 };
  const brc = events.filter(e => e.bouncedReverse).length;
  const brr = brc / tc;
  const mags = events.map(e => e.bounceMagnitudePct).filter((v): v is number => v !== null && v >= 0);
  const avgBounce = mags.length > 0 ? mags.reduce((s, v) => s + v, 0) / mags.length : 0;
  const holdCount = events.filter(e => e.heldWithoutBreak).length;
  const holdRate = holdCount / tc;
  const sortedDates = [...events.map(e => e.date)].sort();
  const lastDate = sortedDates[sortedDates.length - 1] ?? null;
  const today = todayStr();
  const daysSince = lastDate !== null ? daysBetween(lastDate, today) : null;
  const touchScore = Math.min(tc / 10, 1);
  const recency = daysSince !== null ? Math.max(0, 1 - daysSince / 365) : 0;
  const composite = 0.3 * touchScore + 0.3 * brr + 0.2 * holdRate + 0.2 * recency;
  return { touches: events, touchCount: tc, bounceReverseCount: brc, bounceReverseRate: brr, avgBounceMagnitudePct: avgBounce, holdCount, holdRate, lastTouchDate: lastDate, daysSinceLastTouch: daysSince, compositeScore: composite };
}

interface SRLevel {
  type: "horizontal" | "ma" | "fib";
  price: number;
  maType?: string;
  maPeriod?: number;
  fibLevel?: number;
  fibSwingHigh?: number;
  fibSwingLow?: number;
  touches: TouchEvent[];
  touchCount: number;
  bounceReverseCount: number;
  bounceReverseRate: number;
  avgBounceMagnitudePct: number;
  holdCount: number;
  holdRate: number;
  lastTouchDate: string | null;
  daysSinceLastTouch: number | null;
  compositeScore: number;
}

function mergeTouchResult(base: any, result: TouchResult): SRLevel {
  return { type: base.type, price: base.price, maType: base.maType, maPeriod: base.maPeriod, fibLevel: base.fibLevel, fibSwingHigh: base.fibSwingHigh, fibSwingLow: base.fibSwingLow, ...result };
}

function detectHorizontalLevels(ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] }, cfg: typeof DEFAULT_SR_CONFIG): SRLevel[] {
  const { closes, highs, lows } = ohlc;
  const { pivotLeft, pivotRight, pivotClusterPct, minTouches } = cfg;
  const n = closes.length;
  const pivotPrices: number[] = [];
  for (let i = pivotLeft; i < n - pivotRight; i++) {
    let isHigh = true;
    for (let k = i - pivotLeft; k < i; k++) if (highs[i] <= highs[k]) { isHigh = false; break; }
    if (isHigh) {
      for (let k = i + 1; k <= i + pivotRight; k++) if (highs[i] <= highs[k]) { isHigh = false; break; }
    }
    if (isHigh) pivotPrices.push(highs[i]);
    let isLow = true;
    for (let k = i - pivotLeft; k < i; k++) if (lows[i] >= lows[k]) { isLow = false; break; }
    if (isLow) {
      for (let k = i + 1; k <= i + pivotRight; k++) if (lows[i] >= lows[k]) { isLow = false; break; }
    }
    if (isLow) pivotPrices.push(lows[i]);
  }
  if (pivotPrices.length === 0) return [];
  pivotPrices.sort((a, b) => a - b);
  const clusters: number[][] = [];
  let current = [pivotPrices[0]];
  for (let i = 1; i < pivotPrices.length; i++) {
    const last = current[current.length - 1];
    if (Math.abs(pivotPrices[i] - last) / last <= pivotClusterPct) {
      current.push(pivotPrices[i]);
    } else {
      clusters.push(current);
      current = [pivotPrices[i]];
    }
  }
  clusters.push(current);
  const levels: SRLevel[] = [];
  for (const cluster of clusters) {
    const avg = cluster.reduce((s, v) => s + v, 0) / cluster.length;
    const result = evaluateTouches(avg, ohlc, cfg);
    if (result.touchCount < minTouches) continue;
    levels.push(mergeTouchResult({ type: "horizontal", price: avg }, result));
  }
  return levels;
}

function detectMALevels(ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] }, cfg: typeof DEFAULT_SR_CONFIG): SRLevel[] {
  const { closes, highs, lows } = ohlc;
  const n = closes.length;
  const { maTypes, maPeriods, tolerancePct, minTouches } = cfg;
  const levels: SRLevel[] = [];
  for (const maType of maTypes) {
    for (const period of maPeriods) {
      const ma = computeAllMAs(closes, period, maType, { highs, lows });
      let lastMaVal: number | null = null;
      for (let i = n - 1; i >= 0; i--) { if (ma[i] !== null) { lastMaVal = ma[i]; break; } }
      if (lastMaVal === null) continue;
      const currentPrice = lastMaVal;
      const touches: TouchEvent[] = [];
      for (let i = 0; i < n; i++) {
        const mv = ma[i];
        if (mv === null) continue;
        const c = closes[i], h = highs[i], lo = lows[i];
        const closeTol = Math.abs(c - mv) / c <= tolerancePct;
        const highTol = Math.abs(h - mv) / mv <= tolerancePct;
        const lowTol = Math.abs(lo - mv) / mv <= tolerancePct;
        if (!closeTol && !highTol && !lowTol) continue;
        const side: "support" | "resistance" = c >= mv ? "support" : "resistance";
        const { bounceLookahead, bounceThresholdPct, holdBars } = cfg;
        let bounced = false, bounceMag: number | null = null;
        const lookEnd = Math.min(n - 1, i + bounceLookahead);
        if (side === "support") {
          const threshold = mv * (1 + bounceThresholdPct);
          let maxMove = -Infinity;
          for (let k = i + 1; k <= lookEnd; k++) { if (closes[k] >= threshold) bounced = true; const move = (closes[k] - mv) / mv; if (move > maxMove) maxMove = move; }
          if (maxMove > -Infinity) bounceMag = maxMove * 100;
        } else {
          const threshold = mv * (1 - bounceThresholdPct);
          let maxMove = -Infinity;
          for (let k = i + 1; k <= lookEnd; k++) { if (closes[k] <= threshold) bounced = true; const move = (mv - closes[k]) / mv; if (move > maxMove) maxMove = move; }
          if (maxMove > -Infinity) bounceMag = maxMove * 100;
        }
        const holdEnd = Math.min(n - 1, i + holdBars);
        let held = true;
        if (side === "support") {
          const floor = mv * (1 - tolerancePct);
          for (let k = i + 1; k <= holdEnd; k++) { if (closes[k] < floor) { held = false; break; } }
        } else {
          const ceil = mv * (1 + tolerancePct);
          for (let k = i + 1; k <= holdEnd; k++) { if (closes[k] > ceil) { held = false; break; } }
        }
        touches.push({ date: ohlc.dates[i], index: i, side, bouncedReverse: bounced, bounceMagnitudePct: bounceMag, heldWithoutBreak: held });
      }
      const tc = touches.length;
      if (tc < minTouches) continue;
      const brc = touches.filter(t => t.bouncedReverse).length;
      const brr = brc / tc;
      const mags = touches.map(t => t.bounceMagnitudePct).filter((v): v is number => v !== null && v >= 0);
      const avgBounce = mags.length > 0 ? mags.reduce((s, v) => s + v, 0) / mags.length : 0;
      const holdCount = touches.filter(t => t.heldWithoutBreak).length;
      const holdRate = holdCount / tc;
      const sortedDates = [...touches.map(t => t.date)].sort();
      const lastDate = sortedDates[sortedDates.length - 1] ?? null;
      const daysSince = lastDate !== null ? daysBetween(lastDate, todayStr()) : null;
      const touchScore = Math.min(tc / 10, 1);
      const recency = daysSince !== null ? Math.max(0, 1 - daysSince / 365) : 0;
      const composite = 0.3 * touchScore + 0.3 * brr + 0.2 * holdRate + 0.2 * recency;
      levels.push({ type: "ma", price: currentPrice, maType, maPeriod: period, touches, touchCount: tc, bounceReverseCount: brc, bounceReverseRate: brr, avgBounceMagnitudePct: avgBounce, holdCount, holdRate, lastTouchDate: lastDate, daysSinceLastTouch: daysSince, compositeScore: composite });
    }
  }
  return levels;
}

const FIB_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786];

function detectFibLevels(ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] }, cfg: typeof DEFAULT_SR_CONFIG): SRLevel[] {
  const { highs, lows } = ohlc;
  const { fibLookbackBars, minTouches } = cfg;
  const n = ohlc.closes.length;
  const lookbackStart = Math.max(0, n - fibLookbackBars);
  let swingHighIdx = lookbackStart, swingLowIdx = lookbackStart;
  for (let i = lookbackStart; i < n; i++) {
    if (highs[i] > highs[swingHighIdx]) swingHighIdx = i;
    if (lows[i] < lows[swingLowIdx]) swingLowIdx = i;
  }
  const swingHigh = highs[swingHighIdx], swingLow = lows[swingLowIdx];
  const range = swingHigh - swingLow;
  if (range <= 0) return [];
  const levels: SRLevel[] = [];
  for (const fib of FIB_LEVELS) {
    const price = swingHighIdx >= swingLowIdx ? swingHigh - range * fib : swingLow + range * fib;
    const result = evaluateTouches(price, ohlc, cfg);
    if (result.touchCount < minTouches) continue;
    levels.push(mergeTouchResult({ type: "fib", price, fibLevel: fib, fibSwingHigh: swingHigh, fibSwingLow: swingLow }, result));
  }
  return levels;
}

function detectSRLevels(ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] }, userCfg?: Partial<typeof DEFAULT_SR_CONFIG>): SRLevel[] {
  const cfg = { ...DEFAULT_SR_CONFIG, ...userCfg };
  if (ohlc.closes.length === 0) return [];
  const all: SRLevel[] = [];
  if (cfg.enableHorizontal) all.push(...detectHorizontalLevels(ohlc, cfg));
  if (cfg.enableMA) all.push(...detectMALevels(ohlc, cfg));
  if (cfg.enableFib) all.push(...detectFibLevels(ohlc, cfg));
  all.sort((a, b) => b.compositeScore - a.compositeScore);
  return all;
}

function levelLabel(level: SRLevel): string {
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

// ── Generate future trading-day dates ─────────────────────────────────────────

function futureWeekdays(lastDate: string, n: number): string[] {
  const out: string[] = [];
  const [y, m, d] = lastDate.split("-").map(s => parseInt(s, 10));
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

const MIN_BARS = 200;

// ── SRLevelChart sub-component ────────────────────────────────────────────────

interface SRLevelChartProps {
  bars: { dates: string[]; closes: number[]; highs: number[]; lows: number[] };
  levels: SRLevel[];
  ticker: string;
  height?: number;
  futureBars?: number;
}

function SRLevelChart({ bars, levels, ticker, height = 480, futureBars = 60 }: SRLevelChartProps) {
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
    const cs = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444", priceFormat: { type: "price", precision: 2, minMove: 0.01 } } as CandlestickSeriesPartialOptions);
    candleSeriesRef.current = cs;
    const ro = new ResizeObserver(() => { if (containerRef.current && chartRef.current) chartRef.current.applyOptions({ width: containerRef.current.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; candleSeriesRef.current = null; priceLineRefs.current = []; lineSeriesRefs.current = []; };
  }, [height]);

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

  useEffect(() => {
    const cs = candleSeriesRef.current;
    const chart = chartRef.current;
    if (!cs || !chart) return;
    for (const pl of priceLineRefs.current) { try { cs.removePriceLine(pl); } catch {} }
    priceLineRefs.current = [];
    for (const s of lineSeriesRefs.current) { try { chart.removeSeries(s); } catch {} }
    lineSeriesRefs.current = [];
    if (!levels || levels.length === 0) return;
    const lastClose = bars.closes[bars.closes.length - 1];
    const lastDate = bars.dates[bars.dates.length - 1];
    const hasHorizOrFib = levels.some(l => l && (l.type === "horizontal" || l.type === "fib"));
    const futureDates = futureBars > 0 && hasHorizOrFib ? futureWeekdays(lastDate, futureBars) : [];

    levels.forEach((level, idx) => {
      if (!level) return;
      const isAbove = level.price > lastClose;
      const color = isAbove ? "#ef4444" : "#22c55e";
      const futureColor = isAbove ? "#fca5a5" : "#86efac";
      const label = `${levelLabel(level)} @ $${level.price.toFixed(2)} · ${(level.compositeScore * 100).toFixed(1)}`;

      if (level.type === "horizontal" || level.type === "fib") {
        const pl = cs.createPriceLine({ price: level.price, color, lineWidth: 2, lineStyle: level.type === "fib" ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: idx === 0, title: label });
        priceLineRefs.current.push(pl);
        if (futureDates.length > 0) {
          const futData = [{ time: lastDate, value: level.price }, ...futureDates.map((d: string) => ({ time: d, value: level.price }))];
          try {
            const fs = chart.addSeries(LineSeries, { color: futureColor, lineWidth: 2, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null });
            fs.setData(futData);
            lineSeriesRefs.current.push(fs);
          } catch {}
        }
      } else if (level.type === "ma" && level.maType && level.maPeriod) {
        try {
          const maVals = computeAllMAs(bars.closes, level.maPeriod, level.maType, {});
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

    const firstHorizOrFib = levels.find(l => l && l.touches && l.touches.length > 0 && (l.type === "horizontal" || l.type === "fib"));
    if (firstHorizOrFib) {
      try {
        const touchData = firstHorizOrFib.touches.filter(t => t.date).map(t => ({ time: t.date, value: firstHorizOrFib.price }))
          .sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0)
          .filter((t, i, arr) => i === 0 || arr[i - 1].time !== t.time);
        if (touchData.length > 0) {
          const ts = chart.addSeries(LineSeries, { color: "rgba(250,204,21,0.9)", lineWidth: 1, lineStyle: LineStyle.Dotted, pointMarkersVisible: true, pointMarkersRadius: 3, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          ts.setData(touchData);
          lineSeriesRefs.current.push(ts);
        }
      } catch {}
    }
  }, [levels, bars, futureBars]);

  const futureLabel = futureBars > 0 ? ` · projected ${futureBars}b forward` : "";
  return (
    <div className="border border-border rounded bg-card p-2">
      <div className="text-[10px] font-mono text-muted-foreground mb-1 flex items-center justify-between">
        <span>{ticker} ·{" "}{levels && levels.length > 0 ? `${levels.length} level${levels.length === 1 ? "" : "s"} plotted${futureLabel}` : "select one or more levels from the table above"}</span>
        {levels && levels.length === 1 && (
          <span className="flex items-center gap-2">
            <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${levels[0].price > bars.closes[bars.closes.length - 1] ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
              {levels[0].price > bars.closes[bars.closes.length - 1] ? "R" : "S"}
            </span>
            <span>Touches: {levels[0].touchCount}</span>
            <span>Bounce: {(levels[0].bounceReverseRate * 100).toFixed(1)}%</span>
            <span>Hold: {(levels[0].holdRate * 100).toFixed(1)}%</span>
            <span>Score: {(levels[0].compositeScore * 100).toFixed(1)}</span>
          </span>
        )}
      </div>
      <div ref={containerRef} style={{ width: "100%", height: `${height}px` }} data-testid="sr-level-chart" />
    </div>
  );
}

// ── Main SupportResistance component ──────────────────────────────────────────

export default function SupportResistance() {
  const [allTickers, setAllTickers] = useState<any[]>([]);
  const {
    universeTickers,
    filters: universeFilters,
    setFilters: setUniverseFilters,
    search: universeSearch,
    setSearch: setUniverseSearch,
    manualTickers: universeManualTickers,
    setManualTickers: setUniverseManualTickers,
    filteredCount: universeFilteredCount,
    totalCount: universeTotalCount,
  } = useUniverse();
  const tickersFiltered = useMemo(() => universeTickers ? allTickers.filter((t: any) => universeTickers.has(t.ticker)) : allTickers, [allTickers, universeTickers]);

  useEffect(() => {
    getDates().then((d: any) => setAllTickers(d));
  }, []);

  // Mode
  const [mode, setMode] = useState("single");
  const [singleTicker, setSingleTicker] = useState("");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [classFilters, setClassFilters] = useState(() => emptyClassFilters());
  const [classSearch, setClassSearch] = useState("workbook");
  const { metas: globalMetas } = useGlobalUniverse();
  const [pcSearch, setPcSearch] = useState("");
  const [pcManualTickers, setPcManualTickers] = useState(() => new Set<string>());

  const MAX_PAIRS = 500;
  const MIN_PAIRS_WARNING = 50;
  const filteredPairLegs = useMemo(() => {
    const hasFilter = classFilters.economy.size + classFilters.sector.size + classFilters.subsector.size + classFilters.industryGroup.size + classFilters.industry.size + classFilters.subindustry.size + pcManualTickers.size + (pcSearch.trim().length > 0 ? 1 : 0) > 0;
    if (!hasFilter) return [];
    return filterTickersByClassification(classSearch === "global" ? globalMetas : allTickers, classFilters, pcSearch, pcManualTickers).map((t: any) => t.ticker.toUpperCase()).filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i);
  }, [allTickers, globalMetas, classSearch, classFilters, pcSearch, pcManualTickers]);

  const pairComboCount = useMemo(() => { const n = filteredPairLegs.length; return n >= 2 ? (n * (n - 1)) / 2 : 0; }, [filteredPairLegs]);

  useEffect(() => {
    if (allTickers.length > 0) {
      setSingleTicker(v => v || allTickers[0].ticker);
      setPairTickerA(v => v || allTickers[0].ticker);
      setPairTickerB(v => v || (allTickers[1]?.ticker ?? allTickers[0].ticker));
    }
  }, [allTickers]);

  // Date / freq
  const [datePreset, setDatePreset] = useState("10y");
  const [dateRange, setDateRange] = useState(() => getDates as any); // placeholder
  const [timeframe, setTimeframe] = useState("daily");

  // Use correct initial date range
  useEffect(() => { setDateRange(createDateRangeFromPreset("10y") as any); }, []);

  // Detection params
  const [enableHorizontal, setEnableHorizontal] = useState(true);
  const [enableMA, setEnableMA] = useState(true);
  const [enableFib, setEnableFib] = useState(true);
  const [tolerancePct, setTolerancePct] = useState(0.5);
  const [bounceThresholdPct, setBounceThresholdPct] = useState(1.5);
  const [bounceLookahead, setBounceLookahead] = useState(5);
  const [holdBars, setHoldBars] = useState(5);
  const [minTouches, setMinTouches] = useState(3);
  const [pivotLeft, setPivotLeft] = useState(5);
  const [pivotRight, setPivotRight] = useState(5);
  const [topN, setTopN] = useState(10);
  const [maTypesList, setMaTypesList] = useState<string[]>(DEFAULT_SR_CONFIG.maTypes);
  const [maPeriodsList, setMaPeriodsList] = useState<number[]>(DEFAULT_SR_CONFIG.maPeriods);
  const ALL_MA_TYPES = ["SMA", "EMA", "WMA", "HMA", "KAMA", "FRAMA", "T3", "ALMA", "LSMA", "SLSMA"];
  const ALL_MA_PERIODS = [10, 20, 50, 100, 150, 200];
  const toggleMaType = (t: string) => setMaTypesList(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const toggleMaPeriod = (p: number) => setMaPeriodsList(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p].sort((a, b) => a - b));

  const detectionConfig = useMemo(() => ({
    tolerancePct: tolerancePct / 100,
    bounceThresholdPct: bounceThresholdPct / 100,
    bounceLookahead,
    holdBars,
    minTouches,
    pivotLeft,
    pivotRight,
    enableHorizontal,
    enableMA,
    enableFib,
    maTypes: maTypesList,
    maPeriods: maPeriodsList,
    fibLookbackBars: DEFAULT_SR_CONFIG.fibLookbackBars,
    pivotClusterPct: DEFAULT_SR_CONFIG.pivotClusterPct,
  }), [tolerancePct, bounceThresholdPct, bounceLookahead, holdBars, minTouches, pivotLeft, pivotRight, enableHorizontal, enableMA, enableFib, maTypesList, maPeriodsList]);

  // Results
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<any[]>([]);
  const [skipped, setSkipped] = useState<any[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<Record<string, Set<number>>>({});
  const [futureBars, setFutureBars] = useState(60);
  const [levelSort, setLevelSort] = useState({ key: "score", dir: "desc" });

  const toggleLevelSort = useCallback((key: string) => {
    setLevelSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "rank" || key === "type" || key === "sr" ? "asc" : "desc" });
  }, []);

  const toggleSelection = useCallback((ticker: string, idx: number) => {
    setSelectedIdxs(prev => {
      const cur = prev[ticker] ? new Set(prev[ticker]) : new Set([0]);
      if (cur.has(idx)) cur.delete(idx); else cur.add(idx);
      return { ...prev, [ticker]: cur };
    });
  }, []);

  // Workspace tab
  const getState = useCallback(() => {
    const selSer: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(selectedIdxs)) selSer[k] = Array.from(v);
    const d = { economy: Array.from(classFilters.economy), sector: Array.from(classFilters.sector), subsector: Array.from(classFilters.subsector), industryGroup: Array.from(classFilters.industryGroup), industry: Array.from(classFilters.industry), subindustry: Array.from(classFilters.subindustry) };
    return { mode, selectedTicker: singleTicker, pairTickerA, pairTickerB, basketTickers, pcFiltersSer: d, pcClassSearch: pcSearch, pcManualTickersSer: Array.from(pcManualTickers), datePreset, dateRange, timeframe, enableHorizontal, enableMA, enableFib, tolerancePct, bounceThresholdPct, bounceLookahead, holdBars, minTouches, pivotLeft, pivotRight, topN, maTypes: maTypesList, maPeriods: maPeriodsList, futureBars, results, skipped, expandedTicker, selIdxs: selSer, levelSort };
  }, [mode, singleTicker, pairTickerA, pairTickerB, basketTickers, classFilters, pcSearch, pcManualTickers, datePreset, dateRange, timeframe, enableHorizontal, enableMA, enableFib, tolerancePct, bounceThresholdPct, bounceLookahead, holdBars, minTouches, pivotLeft, pivotRight, topN, maTypesList, maPeriodsList, futureBars, results, skipped, expandedTicker, selectedIdxs, levelSort]);

  const restoreState = useCallback((s: any) => {
    if (!s || typeof s !== "object") return;
    if (s.mode) setMode(s.mode);
    if (typeof s.selectedTicker === "string") setSingleTicker(s.selectedTicker);
    if (typeof s.pairTickerA === "string") setPairTickerA(s.pairTickerA);
    if (typeof s.pairTickerB === "string") setPairTickerB(s.pairTickerB);
    if (Array.isArray(s.basketTickers)) setBasketTickers(s.basketTickers);
    if (s.pcFiltersSer && typeof s.pcFiltersSer === "object") {
      const d = s.pcFiltersSer;
      setClassFilters({ economy: new Set(Array.isArray(d.economy) ? d.economy : []), sector: new Set(Array.isArray(d.sector) ? d.sector : []), subsector: new Set(Array.isArray(d.subsector) ? d.subsector : []), industryGroup: new Set(Array.isArray(d.industryGroup) ? d.industryGroup : []), industry: new Set(Array.isArray(d.industry) ? d.industry : []), subindustry: new Set(Array.isArray(d.subindustry) ? d.subindustry : []) });
    }
    if (typeof s.pcClassSearch === "string") setPcSearch(s.pcClassSearch);
    if (Array.isArray(s.pcManualTickersSer)) setPcManualTickers(new Set(s.pcManualTickersSer));
    if (typeof s.datePreset === "string") setDatePreset(s.datePreset);
    if (s.dateRange) setDateRange(s.dateRange);
    if (s.timeframe) setTimeframe(s.timeframe);
    if (typeof s.enableHorizontal === "boolean") setEnableHorizontal(s.enableHorizontal);
    if (typeof s.enableMA === "boolean") setEnableMA(s.enableMA);
    if (typeof s.enableFib === "boolean") setEnableFib(s.enableFib);
    if (typeof s.tolerancePct === "number") setTolerancePct(s.tolerancePct);
    if (typeof s.bounceThresholdPct === "number") setBounceThresholdPct(s.bounceThresholdPct);
    if (typeof s.bounceLookahead === "number") setBounceLookahead(s.bounceLookahead);
    if (typeof s.holdBars === "number") setHoldBars(s.holdBars);
    if (typeof s.minTouches === "number") setMinTouches(s.minTouches);
    if (typeof s.pivotLeft === "number") setPivotLeft(s.pivotLeft);
    if (typeof s.pivotRight === "number") setPivotRight(s.pivotRight);
    if (typeof s.topN === "number") setTopN(s.topN);
    if (Array.isArray(s.maTypes)) setMaTypesList(s.maTypes);
    if (Array.isArray(s.maPeriods)) setMaPeriodsList(s.maPeriods);
    if (typeof s.futureBars === "number") setFutureBars(s.futureBars);
    if (Array.isArray(s.results)) setResults(s.results);
    if (Array.isArray(s.skipped)) setSkipped(s.skipped);
    if (s.expandedTicker === null || typeof s.expandedTicker === "string") setExpandedTicker(s.expandedTicker);
    if (s.selIdxs && typeof s.selIdxs === "object") {
      const r: Record<string, Set<number>> = {};
      for (const [k, v] of Object.entries(s.selIdxs)) r[k] = new Set(Array.isArray(v) ? v : []);
      setSelectedIdxs(r);
    }
    if (s.levelSort) setLevelSort(s.levelSort);
  }, []);

  useWorkspaceTab("support-resistance", getState, restoreState);

  const cancelRef = useRef(false);
  const cancelRun = useCallback(() => { cancelRef.current = true; }, []);

  const canRun = useMemo(() => {
    if (mode === "single") return !!singleTicker;
    if (mode === "pair") return !!pairTickerA && !!pairTickerB && pairTickerA !== pairTickerB;
    if (mode === "pairCombo") return filteredPairLegs.length >= 2;
    if (mode === "basket") return basketTickers.length > 0;
    return tickersFiltered.length > 0;
  }, [mode, singleTicker, pairTickerA, pairTickerB, filteredPairLegs, basketTickers, tickersFiltered]);

  const runDetection = useCallback(async () => {
    if (running) return;
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setSkipped([]);
    setExpandedTicker(null);

    let tickerItems: any[] = [];
    if (mode === "pair") {
      const a = pairTickerA.toUpperCase().trim(), b = pairTickerB.toUpperCase().trim();
      const sym = `${a}/${b}`;
      tickerItems = [{ ticker: sym, name: sym, pairA: a, pairB: b }];
    } else if (mode === "pairCombo") {
      const legs = filteredPairLegs;
      const pairs: any[] = [];
      for (let i = 0; i < legs.length; i++) {
        for (let j = i + 1; j < legs.length; j++) {
          const sym = `${legs[i]}/${legs[j]}`;
          pairs.push({ ticker: sym, name: sym, pairA: legs[i], pairB: legs[j] });
          if (pairs.length >= MAX_PAIRS) break;
        }
        if (pairs.length >= MAX_PAIRS) break;
      }
      tickerItems = pairs;
    } else if (mode === "single") {
      const found = tickersFiltered.find((t: any) => t.ticker === singleTicker);
      tickerItems = found ? [found] : singleTicker ? [{ ticker: singleTicker, name: singleTicker }] : [];
    } else if (mode === "basket") {
      tickerItems = basketTickers.map((t: string) => tickersFiltered.find((x: any) => x.ticker.toUpperCase() === t.toUpperCase()) ?? { ticker: t, name: t });
    } else {
      tickerItems = tickersFiltered;
    }

    if (tickerItems.length === 0) { setRunning(false); return; }

    setProgress({ current: 0, total: tickerItems.length });
    const successes: any[] = [];
    const failures: any[] = [];
    let allDates: string[] = [];
    if (mode === "pair" || mode === "pairCombo") { try { allDates = await getDates(); } catch { allDates = []; } }

    for (let i = 0; i < tickerItems.length && !cancelRef.current; i++) {
      const item = tickerItems[i];
      try {
        let closes: number[], highs: number[], lows: number[], dates: string[], currentPrice: number;
        if (mode === "pair" || mode === "pairCombo") {
          const a = (item.pairA || pairTickerA).toUpperCase().trim();
          const b = (item.pairB || pairTickerB).toUpperCase().trim();
          const ratio = await yahooPairsRatio(a, b, allDates);
          if (!ratio || ratio.prices.length < MIN_BARS) { failures.push({ ticker: item.ticker, reason: "insufficient pair history" }); setProgress({ current: i + 1, total: tickerItems.length }); continue; }
          closes = ratio.prices; highs = ratio.prices; lows = ratio.prices;
          dates = ratio.indices.map((idx: number) => allDates[idx] || "");
          currentPrice = closes[closes.length - 1];
        } else {
          const raw = await getTickerRaw(item.ticker);
          if (!raw) { failures.push({ ticker: item.ticker, reason: "no data" }); setProgress({ current: i + 1, total: tickerItems.length }); continue; }
          const filtered = filterByDateRange(raw, dateRange);
          const n = filtered.adjCloses.length;
          if (n < MIN_BARS) { failures.push({ ticker: item.ticker, reason: `only ${n} bars (need ${MIN_BARS})` }); setProgress({ current: i + 1, total: tickerItems.length }); continue; }
          closes = filtered.adjCloses;
          highs = filtered.highs.map((h: number, idx: number) => { const c = filtered.closes[idx], ac = filtered.adjCloses[idx]; return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? h * (ac / c) : h; });
          lows = filtered.lows.map((l: number, idx: number) => { const c = filtered.closes[idx], ac = filtered.adjCloses[idx]; return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? l * (ac / c) : l; });
          dates = filtered.dates.slice(0, n);
          currentPrice = closes[closes.length - 1];
        }

        if (timeframe === "weekly") {
          const wk = weeklyDownsample({ dates, closes, adjCloses: closes, highs, lows } as any, "weekly");
          if (wk.closes.length < 40) { failures.push({ ticker: item.ticker, reason: `only ${wk.closes.length} weekly bars (need 40)` }); setProgress({ current: i + 1, total: tickerItems.length }); continue; }
          dates = wk.dates; closes = wk.closes; highs = wk.highs; lows = wk.lows; currentPrice = closes[closes.length - 1];
        }

        const ohlc = { dates, closes, highs, lows };
        const levels = detectSRLevels(ohlc, detectionConfig);
        const topLevels = levels.slice(0, topN);
        const tickerComposite = topLevels.length > 0 ? topLevels.reduce((s: number, l: SRLevel) => s + l.compositeScore, 0) / topLevels.length : 0;
        successes.push({ ticker: item.ticker, name: item.name || item.ticker, currentPrice, levels, topLevels, tickerComposite, totalLevels: levels.length, bars: { dates, closes, highs, lows }, pairA: item.pairA, pairB: item.pairB });
      } catch (err: any) {
        failures.push({ ticker: item.ticker, reason: err?.message || "error" });
      }
      setProgress({ current: i + 1, total: tickerItems.length });
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
    }

    successes.sort((a, b) => (b.topLevels[0]?.compositeScore ?? 0) - (a.topLevels[0]?.compositeScore ?? 0));
    setSkipped(failures);
    setResults(successes);
    setSelectedIdxs(() => { const r: Record<string, Set<number>> = {}; for (const s of successes) r[s.ticker] = new Set([0]); return r; });
    if (successes.length === 1) setExpandedTicker(successes[0].ticker);
    setRunning(false);
  }, [running, mode, singleTicker, pairTickerA, pairTickerB, filteredPairLegs, basketTickers, tickersFiltered, dateRange, timeframe, detectionConfig, topN]);

  const sendToCharts = useCallback((ticker: string, levels: SRLevel[]) => {
    if (!levels || levels.length === 0) return;
    try {
      const SEEDS_KEY = "reit-viz-srlevel-seeds-v1";
      const PERSIST_KEY = "reit-viz-srlevel-persistent-v1";
      const resultItem = results.find((r: any) => r.ticker.toUpperCase() === ticker.toUpperCase());
      const isPair = !!(resultItem && resultItem.pairA && resultItem.pairB);
      const primaryTicker = isPair && resultItem?.pairA ? resultItem.pairA.toUpperCase() : ticker.toUpperCase();
      const payload = levels.map(l => ({ type: l.type, price: l.price, maType: l.maType ?? null, maPeriod: l.maPeriod ?? null, fibLevel: l.fibLevel ?? null, touchCount: l.touchCount, bounceReverseRate: l.bounceReverseRate, holdRate: l.holdRate, compositeScore: l.compositeScore, futureBars, createdAt: Date.now() }));
      for (const storageKey of [SEEDS_KEY, PERSIST_KEY]) {
        const raw = localStorage.getItem(storageKey);
        let store: Record<string, any[]> = {};
        try { store = raw ? JSON.parse(raw) : {}; } catch { store = {}; }
        const existing = Array.isArray(store[primaryTicker]) ? store[primaryTicker] : [];
        existing.push(...payload);
        store[primaryTicker] = existing;
        localStorage.setItem(storageKey, JSON.stringify(store));
      }
      const displayTicker = isPair && resultItem?.pairA && resultItem?.pairB ? `${resultItem.pairA.toUpperCase()}/${resultItem.pairB.toUpperCase()}` : primaryTicker;
      console.log(`[SupportResistance] Sent ${levels.length} level(s) for ${displayTicker} → Charts tab.`);
      const toast = document.createElement("div");
      toast.textContent = `Sent ${levels.length} level${levels.length === 1 ? "" : "s"} for ${displayTicker} → Charts`;
      toast.className = "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-cyan-500/20 text-cyan-300 text-xs font-mono border border-cyan-500/40 shadow-lg";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
      if (isPair && resultItem?.pairA && resultItem?.pairB) navigateToChartsWithPair(resultItem.pairA.toUpperCase(), resultItem.pairB.toUpperCase());
    } catch (err) {
      console.error("[SupportResistance] Failed to send to Charts:", err);
    }
  }, [futureBars, results]);

  const siIndicator = (key: string) => levelSort.key === key ? (levelSort.dir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="flex flex-col h-full text-foreground bg-background">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border bg-card/30 flex-shrink-0">
        <h2 className="text-sm font-bold font-mono">Support / Resistance Detector</h2>
        <p className="text-[10px] font-mono text-muted-foreground">Detects horizontal pivots, moving-average bounces, and Fibonacci retracements — scored and ranked</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3 px-4 py-2 border-b border-border bg-card/30 flex-shrink-0">
        {/* Mode */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</label>
          <div className="flex gap-px">
            {["single", "universe", "basket", "pair", "pairCombo"].map(m => (
              <button key={m} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setMode(m)} disabled={running} data-testid={`sr-mode-${m}`} title={m === "pairCombo" ? "Generate all unordered A/B pair ratios from a classification-filter selection" : undefined}>
                {m === "single" ? "Single" : m === "universe" ? "Universe" : m === "pair" ? "Pair (A/B)" : m === "pairCombo" ? "Pair combo" : "Basket"}
              </button>
            ))}
          </div>
        </div>

        {/* Single mode picker */}
        {mode === "single" && (
          <div className="flex items-end gap-2">
            <div className={isBasketTicker(singleTicker) ? "opacity-40 pointer-events-none" : ""}>
              <UnifiedTickerPicker tickers={tickersFiltered} value={isBasketTicker(singleTicker) ? "" : singleTicker} onChange={setSingleTicker} disabled={running} label="Ticker" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
              <BasketTickerPill activeTicker={singleTicker} onSelectTicker={setSingleTicker} fallbackTicker={tickersFiltered[0]?.ticker ?? null} />
            </div>
          </div>
        )}

        {/* Pair mode */}
        {mode === "pair" && (
          <>
            <UnifiedTickerPicker tickers={tickersFiltered} value={pairTickerA} onChange={setPairTickerA} disabled={running} label="A" />
            <UnifiedTickerPicker tickers={tickersFiltered} value={pairTickerB} onChange={setPairTickerB} disabled={running} label="B" />
            <span className="text-[10px] font-mono text-muted-foreground pb-1">Ratio: <span className="text-foreground font-bold">{pairTickerA || "A"}/{pairTickerB || "B"}</span></span>
          </>
        )}

        {/* Basket mode */}
        {mode === "basket" && <BasketPicker tickers={tickersFiltered} value={basketTickers} onChange={setBasketTickers} disabled={running} testIdPrefix="sr-basket" />}

        {/* PairCombo info */}
        {mode === "pairCombo" && (
          <div className="text-[10px] font-mono text-muted-foreground pb-1">
            Use the classification filter below to pick a leg-set. Unordered pairs (A/B == B/A) are generated automatically.
          </div>
        )}

        {/* Date range */}
        <div className="flex items-center gap-1 flex-wrap">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">DATE RANGE</label>
          <div className="flex items-center gap-0.5">
            {(DATE_PRESETS as unknown as any[]).map((preset: any) => (
              <button key={preset.value} data-testid={`sr-date-preset-${preset.value}`} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${datePreset === preset.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`} onClick={() => { setDatePreset(preset.value); setDateRange(createDateRangeFromPreset(preset.value)); }} disabled={running}>{preset.label}</button>
            ))}
          </div>
          <input type="date" data-testid="sr-date-start" value={(dateRange as any).start} onChange={e => { setDatePreset("custom"); setDateRange((prev: any) => ({ ...prev, start: e.target.value })); }} disabled={running} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
          <span className="text-[10px] font-mono text-muted-foreground">→</span>
          <input type="date" data-testid="sr-date-end" value={(dateRange as any).end} onChange={e => { setDatePreset("custom"); setDateRange((prev: any) => ({ ...prev, end: e.target.value })); }} disabled={running} className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5" />
        </div>

        {/* Frequency */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Frequency</label>
          <div className="flex gap-px">
            {["daily", "weekly"].map(f => (
              <button key={f} data-testid={`sr-freq-${f}`} className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${timeframe === f ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`} onClick={() => setTimeframe(f)} disabled={running}>{f === "daily" ? "Daily" : "Weekly"}</button>
            ))}
          </div>
        </div>
      </div>

      {/* PairCombo filter */}
      {mode === "pairCombo" && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-card/10 flex-shrink-0">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1">Pair legs</label>
          <ClassificationFiltersWithSource workbookTickers={allTickers} filters={classFilters} onFiltersChange={setClassFilters} search={pcSearch} onSearchChange={setPcSearch} manualTickers={pcManualTickers} onManualTickersChange={setPcManualTickers} filteredCount={filteredPairLegs.length} totalCount={allTickers.length} testIdPrefix="sr-paircombo-filter" source={classSearch} onSourceChange={setClassSearch} />
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">
            {filteredPairLegs.length < 2 ? <>Pick at least two legs to generate pairs.</> : <>{filteredPairLegs.length} legs → <span className="text-cyan-400 font-bold">{Math.min(pairComboCount, MAX_PAIRS)}</span> unordered pairs (A/B == B/A){" "}{pairComboCount > MAX_PAIRS && <span className="text-amber-400 font-bold">— capped at {MAX_PAIRS} (from {pairComboCount})</span>}{pairComboCount >= MIN_PAIRS_WARNING && pairComboCount <= MAX_PAIRS && <span className="ml-2 text-amber-400 font-bold" title="Each pair fetches two Yahoo series and runs full S/R detection. Large scans take a while.">⚠ large scan</span>}</>}
          </span>
        </div>
      )}

      {/* Universe filter */}
      {mode === "universe" && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-card/10 flex-shrink-0">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1">Universe</label>
          {/* @ts-ignore */}
          <ClassificationFiltersWithSource filters={universeFilters} onFiltersChange={setUniverseFilters} search={universeSearch} onSearchChange={setUniverseSearch} manualTickers={universeManualTickers} onManualTickersChange={setUniverseManualTickers} filteredCount={universeFilteredCount} totalCount={universeTotalCount} testIdPrefix="sr-universe" />
          <span className="text-[10px] font-mono text-muted-foreground ml-auto"><span className="text-foreground font-bold" data-testid="sr-universe-count">{tickersFiltered.length}</span> {`ticker${tickersFiltered.length === 1 ? "" : "s"} selected`}</span>
        </div>
      )}

      {/* Detection params */}
      <div className="flex flex-wrap items-end gap-3 px-4 py-2 border-b border-border bg-card/20 flex-shrink-0">
        {/* Methods */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Methods</label>
          <div className="flex gap-3 text-[10px] font-mono">
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" data-testid="sr-enable-horizontal" checked={enableHorizontal} onChange={e => setEnableHorizontal(e.target.checked)} disabled={running} />Horizontal levels (pivots)</label>
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" data-testid="sr-enable-ma" checked={enableMA} onChange={e => setEnableMA(e.target.checked)} disabled={running} />Moving average bounces</label>
          </div>
          {enableMA && (
            <div className="flex flex-col gap-1 mt-1">
              <div className="flex flex-wrap items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">MA Types</label>
                {ALL_MA_TYPES.map(t => (
                  <button key={t} type="button" data-testid={`sr-ma-type-${t.toLowerCase()}`} onClick={() => toggleMaType(t)} disabled={running} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${maTypesList.includes(t) ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}>{t}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">MA Periods</label>
                {ALL_MA_PERIODS.map(p => (
                  <button key={p} type="button" data-testid={`sr-ma-period-${p}`} onClick={() => toggleMaPeriod(p)} disabled={running} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${maPeriodsList.includes(p) ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border hover:text-foreground"}`}>{p}</button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono mt-1">
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" data-testid="sr-enable-fib" checked={enableFib} onChange={e => setEnableFib(e.target.checked)} disabled={running} />Fibonacci retracements</label>
          </div>
        </div>

        {/* Numeric params */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="% band around each level. A 'touch' fires when the bar's close, high, or low is within this % of the level price. Smaller = stricter touches, fewer hits.">Tolerance %</label>
          <input type="number" data-testid="sr-tolerance" value={tolerancePct} min={0.1} max={5} step={0.1} onChange={e => setTolerancePct(parseFloat(e.target.value) || 0.5)} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]" />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Minimum % reversal away from the level to count as a clean bounce. Larger = stricter (only big reversals count).">Bounce Threshold %</label>
          <input type="number" data-testid="sr-bounce-threshold" value={bounceThresholdPct} min={0.5} max={10} step={0.1} onChange={e => setBounceThresholdPct(parseFloat(e.target.value) || 1.5)} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]" />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Number of bars after each touch to look for a bounce reversal. In daily mode these are trading days; in weekly mode these are weeks.">Bounce Lookahead (bars)</label>
          <input type="number" data-testid="sr-bounce-lookahead" value={bounceLookahead} min={1} max={20} step={1} onChange={e => setBounceLookahead(parseInt(e.target.value) || 5)} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Number of bars after each touch over which the level must NOT be violated (price doesn't close through it by more than Tolerance %) for the touch to count as a 'hold'. Bars = trading days (daily) or weeks (weekly).">Hold Bars</label>
          <input type="number" data-testid="sr-hold-bars" value={holdBars} min={1} max={20} step={1} onChange={e => setHoldBars(parseInt(e.target.value) || 5)} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Discard any level with fewer than this many touches. Raise to filter out weak/untested levels.">Min Touches</label>
          <input type="number" data-testid="sr-min-touches" value={minTouches} min={1} max={10} step={1} onChange={e => setMinTouches(parseInt(e.target.value) || 3)} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Pivot detection window: a swing high/low must have this many bars to its left and right that are lower/higher. Larger = fewer, more significant pivots. Bars = trading days (daily) or weeks (weekly).">Pivot L / R (bars)</label>
          <div className="flex gap-1">
            <input type="number" data-testid="sr-pivot-left" value={pivotLeft} min={1} max={50} step={1} onChange={e => setPivotLeft(parseInt(e.target.value) || 5)} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[52px]" />
            <input type="number" data-testid="sr-pivot-right" value={pivotRight} min={1} max={50} step={1} onChange={e => setPivotRight(parseInt(e.target.value) || 5)} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[52px]" />
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Show the top N highest-scoring levels per ticker in the results table.">Top N</label>
          <input type="number" data-testid="sr-top-n" value={topN} min={1} max={50} step={1} onChange={e => setTopN(parseInt(e.target.value) || 10)} disabled={running} className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]" />
        </div>

        {/* Run / Cancel */}
        <div className="flex items-end gap-2 ml-auto">
          {running ? (
            <button className="text-xs font-mono font-bold px-4 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={cancelRun}>Cancel</button>
          ) : (
            <button data-testid="sr-run" className="text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50" onClick={runDetection} disabled={!canRun}>Run Detection</button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {running && (
        <div className="px-4 py-1 text-[10px] font-mono text-muted-foreground border-b border-border bg-card/20 flex-shrink-0">
          Running… {progress.current} / {progress.total} tickers
          <div className="h-1 bg-background rounded overflow-hidden mt-1">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.current / Math.max(1, progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {results.length === 0 && !running && (
          <div className="p-6 text-xs font-mono text-muted-foreground text-center">
            Configure settings above and click Run Detection. Tickers with fewer than {MIN_BARS} bars will be skipped.
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="px-4 py-1.5 flex items-center gap-3 border-b border-border bg-card/10 sticky top-0 z-10 text-[10px] font-mono">
              <span className="text-muted-foreground">{results.length} ticker{results.length !== 1 ? "s" : ""}</span>
              {skipped.length > 0 && <span className="text-muted-foreground">{skipped.length} skipped</span>}
              <span className="text-muted-foreground ml-auto">sorted by composite score ↓</span>
            </div>
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-0 px-4 py-1 text-[9px] font-mono text-muted-foreground uppercase tracking-wider border-b border-border bg-card/10 sticky top-[28px] z-10">
              <span>Ticker</span><span>Current Price</span><span>Best Type</span><span>Best Level</span><span>Best Score</span><span>Levels Found</span><span className="w-6" />
            </div>

            {results.map((item: any) => {
              const isExpanded = expandedTicker === item.ticker;
              const best: SRLevel = item.topLevels[0];
              return (
                <div key={item.ticker} className="border-b border-border">
                  <button className="w-full grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-0 px-4 py-2 hover:bg-accent/30 text-left items-center" onClick={() => setExpandedTicker(isExpanded ? null : item.ticker)}>
                    <span className="font-mono text-xs font-bold">{item.ticker}</span>
                    <span className="font-mono text-[11px]">${item.currentPrice.toFixed(2)}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{best ? levelLabel(best) : "—"}</span>
                    <span className="font-mono text-[11px]">{best ? `$${best.price.toFixed(2)}` : "—"}</span>
                    <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded w-fit" style={{ backgroundColor: scoreBg(best?.compositeScore ?? 0) }} data-testid="sr-best-score">{best ? (best.compositeScore * 100).toFixed(1) : "—"}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{item.totalLevels}</span>
                    <span className="text-[10px] font-mono text-muted-foreground w-6 text-center">{isExpanded ? "▾" : "▸"}</span>
                  </button>

                  {isExpanded && item.topLevels.length > 0 && (
                    <div className="px-4 pb-3 bg-card/20">
                      <div className="text-[9px] font-mono text-muted-foreground mb-1 pt-1">Top {item.topLevels.length} levels (of {item.totalLevels} total detected):</div>
                      <table className="w-full text-[10px] font-mono border-collapse">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground text-[9px] uppercase tracking-wider">
                            {(() => {
                              const si = (k: string) => siIndicator(k);
                              const lc = "text-left py-1 px-1 cursor-pointer hover:text-foreground select-none";
                              const rc = "text-right py-1 px-1 cursor-pointer hover:text-foreground select-none";
                              return (
                                <>
                                  <th className="py-1 px-1 w-6" title="Toggle this level on the chart. Multiple may be selected." />
                                  <th className={lc} onClick={() => toggleLevelSort("rank")} title="Click to sort by original rank (composite score order)." data-testid="sr-sort-rank">#{si("rank")}</th>
                                  <th className={lc} onClick={() => toggleLevelSort("type")} title="Click to sort by level type (Horizontal, MA, Fibonacci)." data-testid="sr-sort-type">Type{si("type")}</th>
                                  <th className={lc} onClick={() => toggleLevelSort("sr")} title="S/R role based on where the level sits relative to current price. Level ABOVE current price = Resistance (price must rally through it). Level BELOW current price = Support (price must break down through it). Click to sort." data-testid="sr-sort-sr">S/R{si("sr")}</th>
                                  <th className={rc} onClick={() => toggleLevelSort("price")} title="Click to sort by level price." data-testid="sr-sort-price">Level ${si("price")}</th>
                                  <th className={rc} onClick={() => toggleLevelSort("dist")} title="Distance from current price to the level, as a signed %. Positive = level is above current price (resistance). Negative = level is below (support). Click to sort." data-testid="sr-sort-dist">Dist %{si("dist")}</th>
                                  <th className={rc} onClick={() => toggleLevelSort("touches")} title="Total number of times price touched this level (close, high, or low within the Tolerance % band). Higher = more historically tested. Click to sort." data-testid="sr-sort-touches">Touches{si("touches")}</th>
                                  <th className={rc} onClick={() => toggleLevelSort("bounce")} title="Fraction of touches that produced a clean reversal: price moved at least Bounce Threshold % in the opposite direction within Bounce Lookahead bars after the touch. 100% means every touch produced a clean bounce. Click to sort." data-testid="sr-sort-bounce">Bounce %{si("bounce")}</th>
                                  <th className={rc} onClick={() => toggleLevelSort("avgBounce")} title="Average size of the favorable move after a touch, in %. Measured as the max % move away from the level (in the bounce direction) within Bounce Lookahead bars. Larger = bigger reversals on average. Click to sort." data-testid="sr-sort-avgBounce">Avg Bounce{si("avgBounce")}</th>
                                  <th className={rc} onClick={() => toggleLevelSort("hold")} title="Fraction of touches where price did NOT violate the level (close beyond it by more than Tolerance %) within Hold Bars bars after the touch. Different from Bounce %: a level can hold (price stays on the right side) without bouncing (no big reversal). Click to sort." data-testid="sr-sort-hold">Hold %{si("hold")}</th>
                                  <th className={rc} onClick={() => toggleLevelSort("days")} title="Calendar days since the most recent touch. Recency is weighted in the composite score: a level last touched today scores higher than one last touched a year ago (linear decay to zero over 365 days). Click to sort." data-testid="sr-sort-days">Days Since{si("days")}</th>
                                  <th className={rc} onClick={() => toggleLevelSort("score")} title="Composite score 0–100. Weights: 30% touch count (capped at 10 touches), 30% bounce rate, 20% hold rate, 20% recency. Click to sort." data-testid="sr-sort-score">Score{si("score")}</th>
                                  <th className="py-1 px-1 text-right" title="Send this level to the Charts tab.">Action</th>
                                </>
                              );
                            })()}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const rows = item.topLevels.map((level: SRLevel, originalIdx: number) => {
                              const dist = item.currentPrice > 0 ? (level.price - item.currentPrice) / item.currentPrice : 0;
                              return { level, originalIdx, dist, isResistance: level.price > item.currentPrice };
                            });
                            const dirMult = levelSort.dir === "asc" ? 1 : -1;
                            rows.sort((a: any, b: any) => {
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
                            const selSet = selectedIdxs[item.ticker] ?? new Set([0]);
                            return rows.map(({ level, originalIdx, dist, isResistance }: any) => {
                              const isSelected = selSet.has(originalIdx);
                              return (
                                <tr key={originalIdx} className={`border-b border-border/30 cursor-pointer transition-colors ${isSelected ? "bg-cyan-500/15 ring-1 ring-cyan-400/40" : "hover:bg-accent/10"}`} onClick={() => toggleSelection(item.ticker, originalIdx)} data-testid={`sr-level-row-${originalIdx}`}>
                                  <td className="py-1 px-1 text-center" onClick={e => { e.stopPropagation(); toggleSelection(item.ticker, originalIdx); }}><input type="checkbox" checked={isSelected} readOnly className="cursor-pointer" data-testid={`sr-level-check-${originalIdx}`} /></td>
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
                                  <td className="py-1 px-1 text-right"><button onClick={e => { e.stopPropagation(); sendToCharts(item.ticker, [level]); }} className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 hover:text-cyan-300" title="Send this level to the Charts tab as a drawing." data-testid={`sr-send-charts-${originalIdx}`}>→ Charts</button></td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>

                      {/* Chart section */}
                      <div className="mt-3">
                        {(() => {
                          const selSet = selectedIdxs[item.ticker] ?? new Set([0]);
                          const selectedLevels = Array.from(selSet).sort((a, b) => a - b).map((i: number) => item.topLevels[i]).filter(Boolean);
                          return (
                            <>
                              <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="text-muted-foreground">Plotting {selectedLevels.length} of {item.topLevels.length}</span>
                                  <button onClick={() => setSelectedIdxs(prev => ({ ...prev, [item.ticker]: new Set(item.topLevels.map((_: any, i: number) => i)) }))} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground" data-testid={`sr-select-all-${item.ticker}`}>Select all</button>
                                  <button onClick={() => setSelectedIdxs(prev => ({ ...prev, [item.ticker]: new Set() }))} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground" data-testid={`sr-clear-${item.ticker}`}>Clear</button>
                                  <button onClick={() => sendToCharts(item.ticker, selectedLevels)} disabled={selectedLevels.length === 0} className={`px-2 py-0.5 rounded ${selectedLevels.length === 0 ? "bg-muted text-muted-foreground/40 cursor-not-allowed" : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"}`} data-testid={`sr-send-all-charts-${item.ticker}`} title="Send all selected levels to the Charts tab.">Send {selectedLevels.length} → Charts</button>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <label className="text-muted-foreground" title="Number of weekday bars to extend horizontal/fib levels into the future. MA levels are historical only.">Project (bars)</label>
                                  <input type="number" min={0} max={500} value={futureBars} onChange={e => setFutureBars(Math.max(0, Math.min(500, parseInt(e.target.value) || 0)))} className="w-14 bg-background border border-border rounded px-1 py-0.5 text-foreground" data-testid="sr-future-bars" />
                                </div>
                              </div>
                              <SRLevelChart ticker={item.ticker} bars={item.bars} levels={selectedLevels} height={480} futureBars={futureBars} />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {isExpanded && item.topLevels.length === 0 && (
                    <div className="px-4 py-2 text-[10px] font-mono text-muted-foreground bg-card/20">No levels detected with current settings.</div>
                  )}
                </div>
              );
            })}

            {skipped.length > 0 && !running && (
              <div className="p-4 text-[10px] font-mono text-muted-foreground border-t border-border">
                <details>
                  <summary className="cursor-pointer">Skipped ({skipped.length})</summary>
                  <ul className="mt-2 space-y-0.5">
                    {skipped.map((s: any, i: number) => <li key={i}>{s.ticker}: {s.reason}</li>)}
                  </ul>
                </details>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Minified re-exports expected by LevelsAndTrendlines page.
// Bundle mapping (SupportResistance-Cqj5ktkD.js): D=_e (config), d=Qt (detectSRLevels),
// S=sr (the default panel component). These were previously stubbed to null/no-op,
// which crashed Levels with React #130 and emptied its SR table.
export { DEFAULT_SR_CONFIG as D, detectSRLevels as d, SupportResistance as S };
