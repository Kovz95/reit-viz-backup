// Reconstructed from recovered-bundle/Trendlines-BNfKnhdH.js on 2026-06-12
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createChart, CandlestickSeries, CrosshairMode, ColorType, LineSeries, LineStyle } from "lightweight-charts";
import type { CandlestickSeriesPartialOptions } from "lightweight-charts";
import { yahooPairsRatio } from "@/lib/yahooPairsRatio";
import { UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { BasketTickerPill } from "@/components/BasketTickerPill";
import { ClassificationFiltersWithSource } from "@/components/ClassificationFiltersWithSource";
import { useGlobalUniverse } from "@/lib/globalUniverse";
import { BasketPicker } from "@/components/BasketPicker";
import { getDates, getTickerRaw, filterByDateRange, weeklyDownsample, getTickerRawWorkbook } from "@/lib/dataService";
import { usePersistedState } from "@/lib/persistedState";
import { createDateRangeFromPreset } from "@/lib/dateUtils";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { emptyClassFilters, filterTickersByClassification } from "@/lib/classificationFilters";
import { isBasketTicker } from "@/lib/basketUtils";
import { InputSeriesSelector } from "@/lib/inputSeriesSelector";
import { defaultInputSelection } from "@/lib/inputSeriesSelector";
import { navigateToChartsWithPair, navigateToCharts } from "@/lib/chartNavigation";
import { useUniverse } from "@/lib/universeContext";

// ── Default trendline detection config ────────────────────────────────────────

const DEFAULT_CONFIG = {
  method: "pivot-pairs",
  pivotLeft: 5,
  pivotRight: 5,
  tolerancePct: 0.005,
  useAtrTolerance: false,
  atrToleranceMultiplier: 0.5,
  atrPeriod: 14,
  breakTolerancePct: 0.015,
  minTouchCount: 3,
  minSpanBars: 20,
  maxSlopePerYear: 5,
  maxAnchorGapBars: 250,
  ransacIterations: 500,
  ransacMinInliers: 4,
  topN: 10,
  slopeClusterTolerance: 0.15,
  interceptClusterTolerancePct: 0.02,
  filterBrokenLines: false,
};

// ── Pure math helpers ──────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00Z").getTime();
  const b = new Date(dateB + "T00:00:00Z").getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function findSwingHighs(prices: number[], left: number, right: number): number[] {
  const out: number[] = [];
  const n = prices.length;
  for (let i = left; i < n - right; i++) {
    const v = prices[i];
    if (!Number.isFinite(v)) continue;
    let ok = true;
    for (let k = 1; k <= left; k++) {
      if (!(prices[i - k] < v)) { ok = false; break; }
    }
    if (ok) {
      for (let k = 1; k <= right; k++) {
        if (!(prices[i + k] < v)) { ok = false; break; }
      }
      if (ok) out.push(i);
    }
  }
  return out;
}

function findSwingLows(prices: number[], left: number, right: number): number[] {
  const out: number[] = [];
  const n = prices.length;
  for (let i = left; i < n - right; i++) {
    const v = prices[i];
    if (!Number.isFinite(v)) continue;
    let ok = true;
    for (let k = 1; k <= left; k++) {
      if (!(prices[i - k] > v)) { ok = false; break; }
    }
    if (ok) {
      for (let k = 1; k <= right; k++) {
        if (!(prices[i + k] > v)) { ok = false; break; }
      }
      if (ok) out.push(i);
    }
  }
  return out;
}

function findFractalHighs(prices: number[]): number[] {
  return findSwingHighs(prices, 2, 2);
}

function findFractalLows(prices: number[]): number[] {
  return findSwingLows(prices, 2, 2);
}

function computeAtr(ohlc: { highs: number[]; lows: number[]; closes: number[] }, period: number): number[] {
  const { highs, lows, closes } = ohlc;
  const n = closes.length;
  const result = new Array(n).fill(NaN);
  if (n < 2 || period < 1) return result;
  const tr = new Array(n).fill(NaN);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(pc)) { tr[i] = NaN; continue; }
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  let sum = 0, cnt = 0;
  for (let i = 1; i <= period && i < n; i++) { if (Number.isFinite(tr[i])) { sum += tr[i]; cnt++; } }
  if (cnt === 0) return result;
  result[period] = sum / cnt;
  for (let i = period + 1; i < n; i++) {
    const prev = result[i - 1];
    if (!Number.isFinite(prev) || !Number.isFinite(tr[i])) { result[i] = prev; continue; }
    result[i] = ((period - 1) * prev + tr[i]) / period;
  }
  for (let i = 0; i < period; i++) result[i] = result[period];
  return result;
}

function projectLine(slope: number, anchorIdx: number, anchorPrice: number, targetIdx: number): number {
  return anchorPrice + slope * (targetIdx - anchorIdx);
}

function getTolerance(price: number, barIdx: number, cfg: typeof DEFAULT_CONFIG, atr: number[] | null): number {
  return cfg.useAtrTolerance && atr && Number.isFinite(atr[barIdx]) && price > 0
    ? cfg.atrToleranceMultiplier * atr[barIdx] / price
    : cfg.tolerancePct;
}

interface Touch { date: string; index: number; priceAtTouch: number; projectedValue: number; deviationPct: number; }
interface TrendlineResult {
  kind: "resistance" | "support";
  i1: number; i2: number;
  date1: string; date2: string;
  price1: number; price2: number;
  slope: number; slopePctPerYear: number;
  touches: Touch[];
  touchCount: number;
  firstTouchIndex: number; lastTouchIndex: number;
  spanBars: number;
  broken: boolean;
  brokenAtIndex: number | null;
  brokenAtDate: string | null;
  rSquared: number;
  daysSinceLastTouch: number | null;
  currentProjection: number;
  compositeScore: number;
}

function buildTouches(
  ohlc: { dates: string[]; closes: number[]; highs: number[]; lows: number[] },
  i1: number, i2: number,
  kind: "resistance" | "support",
  cfg: typeof DEFAULT_CONFIG,
  atr: number[] | null
): { touches: Touch[]; broken: boolean; brokenAtIndex: number | null; brokenAtDate: string | null; lastTouchIndex: number } {
  const { closes, highs, lows, dates } = ohlc;
  const price1 = kind === "resistance" ? highs[i1] : lows[i1];
  const price2 = kind === "resistance" ? highs[i2] : lows[i2];
  const slope = (price2 - price1) / (i2 - i1);
  const touches: Touch[] = [
    { date: dates[i1], index: i1, priceAtTouch: price1, projectedValue: price1, deviationPct: 0 },
    { date: dates[i2], index: i2, priceAtTouch: price2, projectedValue: price2, deviationPct: 0 },
  ];
  let broken = false, brokenAtIndex: number | null = null, brokenAtDate: string | null = null;
  let lastTouchIndex = i2;
  const n = closes.length;
  for (let i = i2 + 1; i < n; i++) {
    const proj = projectLine(slope, i1, price1, i);
    if (!Number.isFinite(proj) || proj <= 0) continue;
    const c = closes[i], h = highs[i], lo = lows[i];
    const tol = getTolerance(proj, i, cfg, atr);
    if (!broken) {
      if (kind === "resistance" ? c > proj * (1 + cfg.breakTolerancePct) : c < proj * (1 - cfg.breakTolerancePct)) {
        broken = true; brokenAtIndex = i; brokenAtDate = dates[i];
      }
    }
    if (broken) continue;
    const candidates = kind === "resistance" ? [h, c] : [lo, c];
    let minDev = Infinity, best = NaN;
    for (const p of candidates) {
      if (!Number.isFinite(p)) continue;
      const dev = Math.abs(p - proj) / proj;
      if (dev < minDev) { minDev = dev; best = p; }
    }
    if (minDev <= tol) {
      const prev = touches[touches.length - 1];
      if (i - prev.index >= 3) {
        touches.push({ date: dates[i], index: i, priceAtTouch: best, projectedValue: proj, deviationPct: (best - proj) / proj });
        lastTouchIndex = i;
      }
    }
  }
  return { touches, broken, brokenAtIndex, brokenAtDate, lastTouchIndex };
}

function computeRSquared(touches: Touch[]): number {
  if (touches.length < 2) return 0;
  let ss_res = 0, ss_tot = 0;
  const mean = touches.reduce((s, t) => s + t.priceAtTouch, 0) / touches.length;
  for (const t of touches) {
    ss_res += Math.pow(t.priceAtTouch - t.projectedValue, 2);
    ss_tot += Math.pow(t.priceAtTouch - mean, 2);
  }
  if (ss_tot === 0) return 1;
  return Math.max(0, Math.min(1, 1 - ss_res / ss_tot));
}

function compositeScore(line: Omit<TrendlineResult, "compositeScore">, totalBars: number): number {
  const touchScore = Math.min(line.touchCount / 6, 1);
  const r2 = line.rSquared;
  const longevity = Math.min(line.spanBars / Math.max(totalBars, 1), 1);
  const recency = line.daysSinceLastTouch !== null ? Math.max(0, 1 - line.daysSinceLastTouch / 365) : 0;
  const breakPenalty = line.broken ? 0.7 : 1;
  const raw = 0.3 * touchScore + 0.25 * r2 + 0.2 * longevity + 0.25 * recency;
  return Math.max(0, Math.min(1, raw * breakPenalty));
}

function deduplicateLines(lines: TrendlineResult[], cfg: typeof DEFAULT_CONFIG): TrendlineResult[] {
  const sorted = [...lines].sort((a, b) => b.compositeScore - a.compositeScore);
  const out: TrendlineResult[] = [];
  for (const line of sorted) {
    let dup = false;
    for (const accepted of out) {
      if (line.kind !== accepted.kind) continue;
      const slopeDiff = Math.abs(line.slope - accepted.slope) / (Math.max(Math.abs(line.slope), Math.abs(accepted.slope)) || 1e-9);
      const intercDiff = Math.abs(line.currentProjection - accepted.currentProjection) / (Math.abs(accepted.currentProjection) || 1);
      if (slopeDiff < cfg.slopeClusterTolerance && intercDiff < cfg.interceptClusterTolerancePct) { dup = true; break; }
    }
    if (!dup) out.push(line);
  }
  return out;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function() {
    s |= 0; s = s + 1831565813 | 0;
    let c = Math.imul(s ^ (s >>> 15), 1 | s);
    c = c + Math.imul(c ^ (c >>> 7), 61 | c) ^ c;
    return ((c ^ (c >>> 14)) >>> 0) / 4294967296;
  };
}

interface OhlcData { dates: string[]; closes: number[]; highs: number[]; lows: number[]; }

function detectTrendlines(ohlc: OhlcData, cfg: typeof DEFAULT_CONFIG = DEFAULT_CONFIG): TrendlineResult[] {
  const { dates, closes, highs, lows } = ohlc;
  const n = closes.length;
  if (n < 40) return [];
  const method = cfg.method ?? "pivot-pairs";
  const swingHighs = method === "fractals" ? findFractalHighs(highs) : findSwingHighs(highs, cfg.pivotLeft, cfg.pivotRight);
  const swingLows = method === "fractals" ? findFractalLows(lows) : findSwingLows(lows, cfg.pivotLeft, cfg.pivotRight);
  const atr = cfg.useAtrTolerance ? computeAtr(ohlc, cfg.atrPeriod) : null;
  const results: TrendlineResult[] = [];
  const today = todayStr();
  const lastBar = n - 1;

  const tryLine = (kind: "resistance" | "support", i1: number, i2: number) => {
    if (i2 - i1 < cfg.minSpanBars || i2 - i1 > cfg.maxAnchorGapBars) return;
    const p1 = kind === "resistance" ? highs[i1] : lows[i1];
    const p2 = kind === "resistance" ? highs[i2] : lows[i2];
    if (!Number.isFinite(p1) || !Number.isFinite(p2) || p1 <= 0 || p2 <= 0) return;
    const slope = (p2 - p1) / (i2 - i1);
    const annualSlope = (slope * 252) / p1;
    if (Math.abs(annualSlope) > cfg.maxSlopePerYear) return;
    const { touches, broken, brokenAtIndex, brokenAtDate, lastTouchIndex } = buildTouches(ohlc, i1, i2, kind, cfg, atr);
    if (touches.length < cfg.minTouchCount) return;
    if (broken && brokenAtIndex !== null && brokenAtIndex - i2 < 5) return;
    const lastDate = dates[lastTouchIndex];
    const daysSince = daysBetween(lastDate, today);
    const projection = projectLine(slope, i1, p1, lastBar);
    const r2 = computeRSquared(touches);
    const lineObj = {
      kind, i1, i2,
      date1: dates[i1], date2: dates[i2],
      price1: p1, price2: p2,
      slope, slopePctPerYear: annualSlope,
      touches, touchCount: touches.length,
      firstTouchIndex: i1, lastTouchIndex,
      spanBars: lastTouchIndex - i1,
      broken, brokenAtIndex, brokenAtDate,
      rSquared: r2,
      daysSinceLastTouch: daysSince,
      currentProjection: projection,
    };
    const score = compositeScore(lineObj, n);
    results.push({ ...lineObj, compositeScore: score });
  };

  if (method === "ransac") {
    const rng = mulberry32(1592607298);
    const ransacKind = (kind: "resistance" | "support", pivots: number[]) => {
      if (pivots.length < 2) return;
      const getPrice = (i: number) => kind === "resistance" ? highs[i] : lows[i];
      const iters = Math.max(50, cfg.ransacIterations | 0);
      const seen = new Set<string>();
      for (let iter = 0; iter < iters; iter++) {
        let a = Math.floor(rng() * pivots.length);
        let b = Math.floor(rng() * pivots.length);
        if (a === b) continue;
        if (a > b) { const tmp = a; a = b; b = tmp; }
        const pi1 = pivots[a], pi2 = pivots[b];
        const key = `${pi1}_${pi2}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (pi2 - pi1 < cfg.minSpanBars || pi2 - pi1 > cfg.maxAnchorGapBars) continue;
        const pp1 = getPrice(pi1), pp2 = getPrice(pi2);
        if (!Number.isFinite(pp1) || !Number.isFinite(pp2) || pp1 <= 0 || pp2 <= 0) continue;
        const slope = (pp2 - pp1) / (pi2 - pi1);
        let inliers = 2;
        for (const piv of pivots) {
          if (piv === pi1 || piv === pi2) continue;
          const proj = projectLine(slope, pi1, pp1, piv);
          if (!Number.isFinite(proj) || proj <= 0) continue;
          const pp = getPrice(piv);
          const dev = Math.abs(pp - proj) / proj;
          const tol = getTolerance(proj, piv, cfg, atr);
          if (dev <= tol) inliers++;
        }
        if (inliers >= Math.max(2, cfg.ransacMinInliers)) tryLine(kind, pi1, pi2);
      }
    };
    ransacKind("resistance", swingHighs);
    ransacKind("support", swingLows);
  } else {
    for (let i = 0; i < swingHighs.length; i++)
      for (let j = i + 1; j < swingHighs.length; j++)
        tryLine("resistance", swingHighs[i], swingHighs[j]);
    for (let i = 0; i < swingLows.length; i++)
      for (let j = i + 1; j < swingLows.length; j++)
        tryLine("support", swingLows[i], swingLows[j]);
  }

  const filtered = cfg.filterBrokenLines ? results.filter(l => !l.broken) : results;
  const deduped = deduplicateLines(filtered, cfg);
  deduped.sort((a, b) => b.compositeScore - a.compositeScore);
  return deduped;
}

// ── Generate future trading-day dates ─────────────────────────────────────────

function futureWeekdays(lastDate: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(lastDate + "T00:00:00Z");
  let count = 0;
  while (count < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
    count++;
  }
  return out;
}

// ── Score color helper ─────────────────────────────────────────────────────────

function scoreBg(score: number): string {
  if (score >= 0.7) return "rgba(34,197,94,0.20)";
  if (score >= 0.5) return "rgba(234,179,8,0.20)";
  if (score >= 0.3) return "rgba(249,115,22,0.20)";
  return "rgba(239,68,68,0.15)";
}

// ── Minimum bars for detection ─────────────────────────────────────────────────
const MIN_BARS = 100;

// ── TrendlineChart sub-component ──────────────────────────────────────────────

interface TrendlineChartProps {
  bars: OhlcData;
  lines: TrendlineResult[];
  ticker: string;
  height?: number;
  futureBars?: number;
}

function TrendlineChart({ bars, lines, ticker, height = 480, futureBars = 60 }: TrendlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const lineSeriesRefs = useRef<any[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      grid: {
        vertLines: { color: "rgba(75,85,99,0.15)" },
        horzLines: { color: "rgba(75,85,99,0.15)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(75,85,99,0.3)" },
      timeScale: { borderColor: "rgba(75,85,99,0.3)", timeVisible: false, secondsVisible: false },
    });
    chartRef.current = chart;
    const cs = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    } as CandlestickSeriesPartialOptions);
    candleSeriesRef.current = cs;
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      lineSeriesRefs.current = [];
    };
  }, [height]);

  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;
    const n = bars.dates.length;
    const data: any[] = [];
    let prev = bars.closes[0] ?? 0;
    for (let i = 0; i < n; i++) {
      const c = bars.closes[i], h = bars.highs[i], l = bars.lows[i];
      if (!Number.isFinite(c) || !Number.isFinite(h) || !Number.isFinite(l)) continue;
      const o = i === 0 ? c : prev;
      data.push({ time: bars.dates[i], open: o, high: h, low: l, close: c });
      prev = c;
    }
    cs.setData(data);
    chartRef.current?.timeScale().fitContent();
  }, [bars]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const s of lineSeriesRefs.current) { try { chart.removeSeries(s); } catch {} }
    lineSeriesRefs.current = [];
    if (!lines || lines.length === 0) return;
    const n = bars.dates.length;
    if (n === 0) return;
    const lastDate = bars.dates[n - 1];
    const futureDates = futureBars > 0 ? futureWeekdays(lastDate, futureBars) : [];

    lines.forEach((line, idx) => {
      const color = line.kind === "resistance" ? "#ef4444" : "#22c55e";
      const style = line.broken ? LineStyle.Dashed : LineStyle.Solid;
      const histPoints: any[] = [];
      for (let i = line.i1; i < n; i++) {
        const val = line.price1 + line.slope * (i - line.i1);
        if (Number.isFinite(val) && val > 0) histPoints.push({ time: bars.dates[i], value: val });
      }
      const futurePoints: any[] = [];
      for (let fi = 0; fi < futureDates.length; fi++) {
        const barOffset = n - 1 + fi + 1 - line.i1;
        const val = line.price1 + line.slope * barOffset;
        if (Number.isFinite(val) && val > 0) futurePoints.push({ time: futureDates[fi], value: val });
      }
      const label = `${line.kind === "resistance" ? "R" : "S"} ${(line.slopePctPerYear * 100).toFixed(1)}%/yr · ${(line.compositeScore * 100).toFixed(0)}${line.broken ? " · BROKEN" : ""}`;
      if (histPoints.length > 0) {
        const s = chart.addSeries(LineSeries, {
          color, lineWidth: 2, lineStyle: style,
          priceLineVisible: false,
          lastValueVisible: idx === 0,
          title: idx === 0 ? label : "",
        });
        s.setData(histPoints);
        lineSeriesRefs.current.push(s);
      }
      if (futurePoints.length > 0) {
        const combined = histPoints.length > 0 ? [histPoints[histPoints.length - 1], ...futurePoints] : futurePoints;
        const futureColor = line.kind === "resistance" ? "#fca5a5" : "#86efac";
        const fs = chart.addSeries(LineSeries, {
          color: futureColor, lineWidth: 2, lineStyle: LineStyle.Dotted,
          priceLineVisible: false, lastValueVisible: false, title: "",
        });
        fs.setData(combined);
        lineSeriesRefs.current.push(fs);
      }
      if (idx === 0 && line.touches && line.touches.length > 0) {
        try {
          const touchData = line.touches
            .filter(t => t.date && Number.isFinite(t.projectedValue))
            .map(t => ({ time: t.date, value: t.projectedValue }))
            .sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0)
            .filter((t, i, arr) => i === 0 || arr[i - 1].time !== t.time);
          if (touchData.length > 0) {
            const ts = chart.addSeries(LineSeries, {
              color: "rgba(250,204,21,0.95)", lineWidth: 1, lineStyle: LineStyle.Dotted,
              pointMarkersVisible: true, pointMarkersRadius: 4,
              priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
            });
            ts.setData(touchData);
            lineSeriesRefs.current.push(ts);
          }
        } catch {}
      }
    });
  }, [lines, bars, futureBars]);

  const topLine = lines.length > 0 ? lines[0] : null;
  return (
    <div className="border border-border rounded bg-card p-2">
      <div className="text-[10px] font-mono text-muted-foreground mb-1 flex items-center justify-between">
        <span>
          {ticker} ·{" "}
          {lines.length === 0
            ? "select one or more trendlines from the table above"
            : lines.length === 1 && topLine
            ? `${topLine.kind === "resistance" ? "Resistance" : "Support"} ${(topLine.slopePctPerYear * 100).toFixed(1)}%/yr · anchors ${topLine.date1} → ${topLine.date2}· projected ${futureBars}b forward`
            : `${lines.length} trendlines plotted · projected ${futureBars}b forward`}
        </span>
        {topLine && lines.length === 1 && (
          <span className="flex items-center gap-2">
            <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${topLine.kind === "resistance" ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>
              {topLine.kind === "resistance" ? "R" : "S"}
            </span>
            {topLine.broken && <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400">BROKEN</span>}
            <span>Touches: {topLine.touchCount}</span>
            <span>R²: {(topLine.rSquared * 100).toFixed(1)}%</span>
            <span>Span: {topLine.spanBars}b</span>
            <span>Score: {(topLine.compositeScore * 100).toFixed(1)}</span>
          </span>
        )}
      </div>
      <div ref={containerRef} style={{ width: "100%", height: `${height}px` }} data-testid="trendline-chart" />
    </div>
  );
}

// ── Main Trendlines component ──────────────────────────────────────────────────

export default function Trendlines() {
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

  useEffect(() => {
    getDates().then((d: any) => setAllTickers(d)).catch(() => {});
  }, []);

  // Mode state
  const [mode, setMode] = useState("single");
  const [singleTicker, setSingleTicker] = useState("ABR");
  const [inputSelection, setInputSelection] = usePersistedState("trendlines-input-selection", defaultInputSelection);
  const [pairTickerA, setPairTickerA] = useState("NEE");
  const [pairTickerB, setPairTickerB] = useState("SO");
  const [classFilters, setClassFilters] = useState(() => emptyClassFilters());
  const [classSearch, setClassSearch] = useState("");
  const [manualTickers, setManualTickers] = useState(() => new Set<string>());
  const [sourceMode, setSourceMode] = useState("workbook");
  const { metas: globalMetas } = useGlobalUniverse();
  const [basketTickers, setBasketTickers] = useState<string[]>([]);

  const MAX_PAIRS = 500;
  const MIN_PAIRS_WARNING = 50;
  const filteredPairLegs = useMemo(() => {
    const hasFilter =
      classFilters.economy.size + classFilters.sector.size + classFilters.subsector.size +
      classFilters.industryGroup.size + classFilters.industry.size + classFilters.subindustry.size +
      manualTickers.size + (classSearch.trim().length > 0 ? 1 : 0) > 0;
    if (!hasFilter) return [];
    return filterTickersByClassification(
      sourceMode === "global" ? globalMetas : allTickers,
      classFilters, classSearch, manualTickers
    ).map((t: any) => t.ticker.toUpperCase()).filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i);
  }, [allTickers, globalMetas, sourceMode, classFilters, classSearch, manualTickers]);

  const pairComboCount = useMemo(() => {
    const n = filteredPairLegs.length;
    return n >= 2 ? (n * (n - 1)) / 2 : 0;
  }, [filteredPairLegs]);

  // Date / freq
  const [datePreset, setDatePreset] = useState("3y");
  const [dateRange, setDateRange] = useState(() => createDateRangeFromPreset("3y"));
  const [timeframe, setTimeframe] = useState("daily");

  // Algo params
  const [tolerancePct, setTolerancePct] = useState(0.5);
  const [breakTolerancePct, setBreakTolerancePct] = useState(1.5);
  const [minTouchCount, setMinTouchCount] = useState(3);
  const [minSpanBars, setMinSpanBars] = useState(20);
  const [maxAnchorGapBars, setMaxAnchorGapBars] = useState(250);
  const [pivotLR, setPivotLR] = useState(5);
  const [topN, setTopN] = useState(10);
  const [filterBroken, setFilterBroken] = useState(false);
  const [method, setMethod] = useState("pivot-pairs");
  const [useAtrTolerance, setUseAtrTolerance] = useState(false);
  const [atrMultiplier, setAtrMultiplier] = useState(0.5);
  const [ransacIters, setRansacIters] = useState(500);
  const [ransacMinInliers, setRansacMinInliers] = useState(4);

  const detectionConfig = useMemo(() => ({
    ...DEFAULT_CONFIG,
    method,
    tolerancePct: tolerancePct / 100,
    useAtrTolerance,
    atrToleranceMultiplier: atrMultiplier,
    breakTolerancePct: breakTolerancePct / 100,
    minTouchCount,
    minSpanBars,
    maxAnchorGapBars,
    pivotLeft: pivotLR,
    pivotRight: pivotLR,
    ransacIterations: ransacIters,
    ransacMinInliers,
    topN,
    filterBrokenLines: filterBroken,
  }), [method, tolerancePct, useAtrTolerance, atrMultiplier, breakTolerancePct, minTouchCount, minSpanBars, maxAnchorGapBars, pivotLR, ransacIters, ransacMinInliers, topN, filterBroken]);

  // Results
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<any[]>([]);
  const [futureBars, setFutureBars] = useState(60);
  const [skipped, setSkipped] = useState<any[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<Record<string, Set<number>>>({});

  // Sorting
  const [lineSort, setLineSort] = useState({ key: "score", dir: "desc" });
  const [outerSort, setOuterSort] = useState({ key: "bestScore", dir: "desc" });

  const toggleLineSort = useCallback((key: string) => {
    setLineSort(prev => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "rank" || key === "kind" || key === "broken" ? "asc" : "desc" }
    );
  }, []);

  const toggleOuterSort = useCallback((key: string) => {
    setOuterSort(prev => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "ticker" || key === "bestType" ? "asc" : "desc" }
    );
  }, []);

  const toggleSelection = useCallback((ticker: string, idx: number) => {
    setSelectedIdxs(prev => {
      const cur = prev[ticker] ? new Set(prev[ticker]) : new Set([0]);
      if (cur.has(idx)) cur.delete(idx); else cur.add(idx);
      return { ...prev, [ticker]: cur };
    });
  }, []);

  // Workspace tab persistence
  const getState = useCallback(() => {
    const selSer: Record<string, number[]> = {};
    for (const [k, v] of Object.entries(selectedIdxs)) selSer[k] = Array.from(v);
    return {
      mode, singleTicker, pairTickerA, pairTickerB, basketTickers,
      pcFiltersSer: {
        economy: Array.from(classFilters.economy),
        sector: Array.from(classFilters.sector),
        subsector: Array.from(classFilters.subsector),
        industryGroup: Array.from(classFilters.industryGroup),
        industry: Array.from(classFilters.industry),
        subindustry: Array.from(classFilters.subindustry),
      },
      pcClassSearch: classSearch,
      pcManualTickers: Array.from(manualTickers),
      datePreset, dateRange, timeframe,
      tolerancePct, breakTolerancePct, minTouchCount, minSpanBars, maxAnchorGapBars,
      pivotLR, topN, filterBroken, method, useAtrTolerance, atrMultiplier,
      ransacIters, ransacMinInliers,
      results, futureBars, skipped, expandedTicker,
      selIdxs: selSer, lineSort, outerSort, inputSelection,
    };
  }, [mode, singleTicker, pairTickerA, pairTickerB, basketTickers, classFilters, classSearch, manualTickers, datePreset, dateRange, timeframe, tolerancePct, breakTolerancePct, minTouchCount, minSpanBars, maxAnchorGapBars, pivotLR, topN, filterBroken, method, useAtrTolerance, atrMultiplier, ransacIters, ransacMinInliers, results, futureBars, skipped, expandedTicker, selectedIdxs, lineSort, outerSort, inputSelection]);

  const restoreState = useCallback((s: any) => {
    if (!s || typeof s !== "object") return;
    if (s.mode) setMode(s.mode);
    if (typeof s.singleTicker === "string") setSingleTicker(s.singleTicker);
    if (typeof s.pairTickerA === "string") setPairTickerA(s.pairTickerA);
    if (typeof s.pairTickerB === "string") setPairTickerB(s.pairTickerB);
    if (Array.isArray(s.basketTickers)) setBasketTickers(s.basketTickers);
    if (s.pcFiltersSer && typeof s.pcFiltersSer === "object") {
      const f = emptyClassFilters();
      for (const k of Object.keys(f) as Array<keyof typeof f>) {
        const v = s.pcFiltersSer[k];
        if (Array.isArray(v)) (f as any)[k] = new Set(v);
      }
      setClassFilters(f);
    }
    if (typeof s.pcClassSearch === "string") setClassSearch(s.pcClassSearch);
    if (Array.isArray(s.pcManualTickers)) setManualTickers(new Set(s.pcManualTickers));
    if (typeof s.datePreset === "string") setDatePreset(s.datePreset);
    if (s.dateRange) setDateRange(s.dateRange);
    if (s.timeframe) setTimeframe(s.timeframe);
    if (typeof s.tolerancePct === "number") setTolerancePct(s.tolerancePct);
    if (typeof s.breakTolerancePct === "number") setBreakTolerancePct(s.breakTolerancePct);
    if (typeof s.minTouchCount === "number") setMinTouchCount(s.minTouchCount);
    if (typeof s.minSpanBars === "number") setMinSpanBars(s.minSpanBars);
    if (typeof s.maxAnchorGapBars === "number") setMaxAnchorGapBars(s.maxAnchorGapBars);
    if (typeof s.pivotLR === "number") setPivotLR(s.pivotLR);
    if (typeof s.topN === "number") setTopN(s.topN);
    if (typeof s.filterBroken === "boolean") setFilterBroken(s.filterBroken);
    if (s.method) setMethod(s.method);
    if (typeof s.useAtrTolerance === "boolean") setUseAtrTolerance(s.useAtrTolerance);
    if (typeof s.atrMultiplier === "number") setAtrMultiplier(s.atrMultiplier);
    if (typeof s.ransacIters === "number") setRansacIters(s.ransacIters);
    if (typeof s.ransacMinInliers === "number") setRansacMinInliers(s.ransacMinInliers);
    if (Array.isArray(s.results)) setResults(s.results);
    if (typeof s.futureBars === "number") setFutureBars(s.futureBars);
    if (Array.isArray(s.skipped)) setSkipped(s.skipped);
    if (s.expandedTicker === null || typeof s.expandedTicker === "string") setExpandedTicker(s.expandedTicker);
    if (s.selIdxs && typeof s.selIdxs === "object") {
      const r: Record<string, Set<number>> = {};
      for (const [k, v] of Object.entries(s.selIdxs)) r[k] = new Set(Array.isArray(v) ? v : []);
      setSelectedIdxs(r);
    }
    if (s.lineSort) setLineSort(s.lineSort);
    if (s.outerSort) setOuterSort(s.outerSort);
    if (s.inputSelection && typeof s.inputSelection === "object") {
      const h = s.inputSelection;
      if (h.kind === "close" || (h.kind === "workbook" && typeof h.metric === "string")) setInputSelection(h);
    }
  }, [setInputSelection]);

  useWorkspaceTab("trendlines", getState, restoreState);

  const cancelRef = useRef(false);

  const runDetection = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setSkipped([]);
    setExpandedTicker(null);
    cancelRef.current = false;

    let tickerItems: any[] = [];
    if (mode === "single") {
      const t = (singleTicker || "").toUpperCase().trim();
      tickerItems = t ? [allTickers.find((x: any) => x.ticker === t) || { ticker: t, name: t }] : [];
    } else if (mode === "pair") {
      const a = (pairTickerA || "").toUpperCase().trim();
      const b = (pairTickerB || "").toUpperCase().trim();
      if (!a || !b || a === b) { setRunning(false); return; }
      const sym = `${a}/${b}`;
      tickerItems = [{ ticker: sym, name: sym, pairA: a, pairB: b }];
    } else if (mode === "pairCombo") {
      if (filteredPairLegs.length < 2) { setRunning(false); return; }
      const pairs: any[] = [];
      for (let i = 0; i < filteredPairLegs.length; i++) {
        for (let j = i + 1; j < filteredPairLegs.length; j++) {
          const sym = `${filteredPairLegs[i]}/${filteredPairLegs[j]}`;
          pairs.push({ ticker: sym, name: sym, pairA: filteredPairLegs[i], pairB: filteredPairLegs[j] });
          if (pairs.length >= MAX_PAIRS) break;
        }
        if (pairs.length >= MAX_PAIRS) break;
      }
      tickerItems = pairs;
    } else if (mode === "basket") {
      tickerItems = basketTickers.map((t: string) => t.toUpperCase().trim()).filter(Boolean).map((t: string) =>
        allTickers.find((x: any) => x.ticker === t) || { ticker: t, name: t }
      );
    } else {
      tickerItems = universeTickers ? allTickers.filter((t: any) => universeTickers.has(t.ticker)) : allTickers;
    }

    if (tickerItems.length === 0) { setRunning(false); return; }

    let allDates: string[] = [];
    if (mode === "pair" || mode === "pairCombo") {
      try { allDates = await getDates(); } catch {}
    }

    setProgress({ current: 0, total: tickerItems.length });
    const successes: any[] = [];
    const failures: any[] = [];

    for (let i = 0; i < tickerItems.length && !cancelRef.current; i++) {
      const item = tickerItems[i];
      try {
        let closes: number[], highs: number[], lows: number[], dates: string[], rawCloses: number[] = [];
        if (mode === "pair" || mode === "pairCombo") {
          const a = (item.pairA || "").toUpperCase().trim();
          const b = (item.pairB || "").toUpperCase().trim();
          if (!a || !b) { failures.push({ ticker: item.ticker, reason: "missing pair legs" }); setProgress({ current: i + 1, total: tickerItems.length }); continue; }
          const ratio = await yahooPairsRatio(a, b, allDates);
          if (!ratio || ratio.prices.length < MIN_BARS) {
            failures.push({ ticker: item.ticker, reason: ratio ? `only ${ratio.prices.length} bars (need ${MIN_BARS})` : "no pair data" });
            setProgress({ current: i + 1, total: tickerItems.length }); continue;
          }
          const mappedDates = ratio.indices.map((idx: number) => allDates[idx] || "");
          const filteredIdxs: number[] = [];
          for (let k = 0; k < mappedDates.length; k++) {
            const d = mappedDates[k];
            if (!d || (dateRange.start && d < dateRange.start) || (dateRange.end && d > dateRange.end)) continue;
            filteredIdxs.push(k);
          }
          if (filteredIdxs.length < MIN_BARS) {
            failures.push({ ticker: item.ticker, reason: `only ${filteredIdxs.length} bars in range (need ${MIN_BARS})` });
            setProgress({ current: i + 1, total: tickerItems.length }); continue;
          }
          dates = filteredIdxs.map(k => mappedDates[k]);
          closes = filteredIdxs.map(k => ratio.prices[k]);
          highs = closes.slice(); lows = closes.slice(); rawCloses = closes.slice();
        } else if (mode === "single" && inputSelection.kind === "workbook") {
          const wb = await getTickerRawWorkbook(item.ticker, inputSelection, { dateRange });
          if (!wb || wb.closes.length < MIN_BARS) {
            failures.push({ ticker: item.ticker, reason: wb ? `only ${wb.closes.length} bars (need ${MIN_BARS})` : `no workbook data for ${inputSelection.metric}` });
            setProgress({ current: i + 1, total: tickerItems.length }); continue;
          }
          closes = wb.closes; highs = wb.highs; lows = wb.lows; dates = wb.priceDates; rawCloses = wb.closes.slice();
        } else {
          const raw = await getTickerRaw(item.ticker);
          if (!raw) { failures.push({ ticker: item.ticker, reason: "no data" }); setProgress({ current: i + 1, total: tickerItems.length }); continue; }
          const filtered = filterByDateRange(raw, dateRange);
          const n = filtered.adjCloses.length;
          if (n < MIN_BARS) { failures.push({ ticker: item.ticker, reason: `only ${n} bars (need ${MIN_BARS})` }); setProgress({ current: i + 1, total: tickerItems.length }); continue; }
          closes = filtered.adjCloses;
          highs = filtered.highs.map((h: number, idx: number) => {
            const c = filtered.closes[idx], ac = filtered.adjCloses[idx];
            return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? h * (ac / c) : h;
          });
          lows = filtered.lows.map((l: number, idx: number) => {
            const c = filtered.closes[idx], ac = filtered.adjCloses[idx];
            return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? l * (ac / c) : l;
          });
          dates = filtered.dates.slice(0, n);
          rawCloses = filtered.closes.slice(0, n);
        }

        let lastPrice = closes[closes.length - 1];
        if (timeframe === "weekly") {
          const origDates = dates, origRaw = rawCloses.slice();
          const wk = weeklyDownsample({ dates, closes, adjCloses: closes, highs, lows } as any, "weekly");
          if (wk.closes.length < 30) {
            failures.push({ ticker: item.ticker, reason: `only ${wk.closes.length} weekly bars (need 30)` });
            setProgress({ current: i + 1, total: tickerItems.length }); continue;
          }
          dates = wk.dates; closes = wk.closes; highs = wk.highs; lows = wk.lows; lastPrice = closes[closes.length - 1];
          if (origRaw.length === origDates.length && origRaw.length > 0) {
            const dateMap = new Map<string, number>();
            for (let k = 0; k < origDates.length; k++) dateMap.set(origDates[k], k);
            const mapped = wk.dates.map((d: string) => { const idx = dateMap.get(d); return idx !== undefined ? origRaw[idx] : NaN; });
            rawCloses = mapped.every((v: number) => Number.isFinite(v) && v > 0) ? mapped : [];
          } else {
            rawCloses = [];
          }
        }

        const lines = detectTrendlines({ dates, closes, highs, lows }, detectionConfig);
        const topLines = lines.slice(0, topN);
        successes.push({
          ticker: item.ticker,
          name: item.name || item.ticker,
          currentPrice: lastPrice,
          trendlines: lines,
          topLines,
          totalLines: lines.length,
          pairA: item.pairA,
          pairB: item.pairB,
          bars: { dates, closes, highs, lows, rawCloses: rawCloses.length === dates.length ? rawCloses : undefined },
        });
      } catch (err: any) {
        failures.push({ ticker: item.ticker, reason: err?.message || "error" });
      }
      setProgress({ current: i + 1, total: tickerItems.length });
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
    }

    successes.sort((a, b) => (b.topLines[0]?.compositeScore ?? 0) - (a.topLines[0]?.compositeScore ?? 0));
    setResults(successes);
    setSkipped(failures);
    setRunning(false);
    if (successes.length === 1) setExpandedTicker(successes[0].ticker);
    setSelectedIdxs(() => {
      const r: Record<string, Set<number>> = {};
      for (const s of successes) r[s.ticker] = new Set([0]);
      return r;
    });
  }, [mode, singleTicker, pairTickerA, pairTickerB, filteredPairLegs, basketTickers, allTickers, universeTickers, dateRange, timeframe, detectionConfig, topN, inputSelection]);

  const sendToCharts = useCallback((ticker: string, lines: TrendlineResult[]) => {
    if (!lines || lines.length === 0) return;
    try {
      const SEEDS_KEY = "reit-viz-trendline-seeds-v1";
      const PERSIST_KEY = "reit-viz-trendline-persistent-v1";
      const resultItem = results.find(r => r.ticker.toUpperCase() === ticker.toUpperCase());
      const isPair = !!(resultItem && resultItem.pairA && resultItem.pairB);
      const metric = isPair ? "ratio"
        : mode === "single" && inputSelection.kind === "workbook" && inputSelection.metric ? inputSelection.metric
        : "close";
      const primaryTicker = isPair && resultItem?.pairA ? resultItem.pairA.toUpperCase() : ticker.toUpperCase();
      const rawClosesData = resultItem?.bars?.rawCloses;
      const datesData = resultItem?.bars?.dates;
      const hasRaw = Array.isArray(rawClosesData) && Array.isArray(datesData) && rawClosesData.length === datesData.length && rawClosesData.length > 0;
      const dateMap = hasRaw ? (() => { const m = new Map<string, number>(); for (let i = 0; i < datesData.length; i++) m.set(datesData[i], i); return m; })() : null;

      const payload = lines.map(line => {
        let price1 = line.price1, price2 = line.price2, slope = line.slope, converted = false;
        if (hasRaw && dateMap) {
          const i1 = dateMap.get(line.date1), i2 = dateMap.get(line.date2);
          if (i1 !== undefined && i2 !== undefined && i2 > i1) {
            const rp1 = rawClosesData[i1], rp2 = rawClosesData[i2];
            if (Number.isFinite(rp1) && Number.isFinite(rp2) && rp1 > 0 && rp2 > 0) {
              price1 = rp1; price2 = rp2; slope = (rp2 - rp1) / (i2 - i1); converted = true;
            }
          }
        }
        if (!converted) console.warn(`[Trendlines] adj→raw conversion failed for ${primaryTicker} line (${line.date1} → ${line.date2}); sending adj-space coords — line may appear offset on Charts.`);
        return { kind: line.kind, date1: line.date1, price1, date2: line.date2, price2, slope, slopePctPerYear: line.slopePctPerYear, broken: !!line.broken, compositeScore: line.compositeScore, futureBars, createdAt: Date.now(), metric };
      });

      for (const storageKey of [SEEDS_KEY, PERSIST_KEY]) {
        const raw = localStorage.getItem(storageKey);
        let store: Record<string, any[]> = {};
        try { store = raw ? JSON.parse(raw) : {}; } catch { store = {}; }
        const existing = Array.isArray(store[primaryTicker]) ? store[primaryTicker] : [];
        existing.push(...payload);
        store[primaryTicker] = existing;
        localStorage.setItem(storageKey, JSON.stringify(store));
      }

      const displayTicker = isPair && resultItem?.pairA && resultItem?.pairB
        ? `${resultItem.pairA.toUpperCase()}/${resultItem.pairB.toUpperCase()}`
        : primaryTicker;

      console.log(`[Trendlines] Sent ${lines.length} line(s) for ${displayTicker} → Charts tab.`);
      if (isPair && resultItem?.pairA && resultItem?.pairB) {
        navigateToChartsWithPair(resultItem.pairA.toUpperCase(), resultItem.pairB.toUpperCase());
      } else {
        navigateToCharts(primaryTicker);
      }

      const toast = document.createElement("div");
      toast.textContent = `Sent ${lines.length} trendline${lines.length === 1 ? "" : "s"} for ${displayTicker} → Charts`;
      toast.className = "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-cyan-500/20 text-cyan-300 text-xs font-mono border border-cyan-500/40 shadow-lg";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    } catch (err) {
      console.error("[Trendlines] Failed to send to Charts:", err);
    }
  }, [futureBars, results, mode, inputSelection]);

  const sortedResults = useMemo(() => {
    const dir = outerSort.dir === "asc" ? 1 : -1;
    return [...results].sort((a, b) => {
      const aTop = a.topLines[0], bTop = b.topLines[0];
      switch (outerSort.key) {
        case "ticker": return a.ticker.localeCompare(b.ticker) * dir;
        case "currentPrice": return (a.currentPrice - b.currentPrice) * dir;
        case "bestType": return ((aTop?.kind ?? "~").localeCompare(bTop?.kind ?? "~")) * dir;
        case "bestSlope": return ((aTop?.slopePctPerYear ?? -Infinity) - (bTop?.slopePctPerYear ?? -Infinity)) * dir;
        case "bestScore": return ((aTop?.compositeScore ?? -Infinity) - (bTop?.compositeScore ?? -Infinity)) * dir;
        case "totalLines": return (a.totalLines - b.totalLines) * dir;
        default: return 0;
      }
    });
  }, [results, outerSort]);

  const sortIndicator = (key: string) => outerSort.key === key ? (outerSort.dir === "asc" ? " ▲" : " ▼") : "";
  const lineSortIndicator = (key: string) => lineSort.key === key ? (lineSort.dir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 text-xs font-mono">
        {/* Header */}
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <h1 className="text-base font-bold">Trendline Detector</h1>
            <p className="text-[10px] text-muted-foreground">
              Auto-draws diagonal support/resistance trendlines — Pivot Pairs, Williams Fractals, or RANSAC. Optional ATR-adaptive tolerance. Scored by touches, fit, longevity, recency, and break status.
            </p>
          </div>
        </div>

        {/* Mode + Ticker picker */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center mb-2">
          <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Mode</div>
          <div className="flex gap-1">
            {["single", "pair", "pairCombo", "basket", "universe"].map(m => (
              <button
                key={m}
                data-testid={`tl-mode-${m}`}
                onClick={() => setMode(m)}
                className={`px-2 py-0.5 rounded text-[10px] uppercase ${mode === m ? "bg-cyan-500/20 text-cyan-400" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                title={m === "pairCombo" ? "Generate all unordered A/B pair ratios from a classification-filter selection" : undefined}
              >
                {m === "pair" ? "Pair (A/B)" : m === "pairCombo" ? "Pair combo" : m}
              </button>
            ))}
          </div>
          <div />
          <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            {mode === "pair" ? "A / B" : mode === "pairCombo" ? "Pair legs" : mode === "basket" ? "Basket" : "Ticker"}
          </div>
          <div className="flex-1">
            {mode === "single" && (
              <div className="flex items-end gap-2">
                <div className={`flex-1 ${isBasketTicker(singleTicker) ? "opacity-40 pointer-events-none" : ""}`}>
                  <UnifiedTickerPicker tickers={allTickers} value={isBasketTicker(singleTicker) ? "" : singleTicker} onChange={setSingleTicker} />
                </div>
                <BasketTickerPill activeTicker={singleTicker} onSelectTicker={setSingleTicker} fallbackTicker={allTickers[0]?.ticker ?? null} />
                <div className="flex flex-col gap-0.5">
                  <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Input Series</label>
                  <InputSeriesSelector value={inputSelection} onChange={setInputSelection} family="trendlines" label="" />
                </div>
              </div>
            )}
            {mode === "pair" && (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <UnifiedTickerPicker tickers={allTickers} value={pairTickerA} onChange={setPairTickerA} />
                </div>
                <span className="text-[10px] text-muted-foreground">/</span>
                <div className="flex-1">
                  <UnifiedTickerPicker tickers={allTickers} value={pairTickerB} onChange={setPairTickerB} />
                </div>
                <span data-testid="tl-pair-label" className="text-[10px] text-cyan-400 font-mono">
                  Ratio: {pairTickerA || "?"}/{pairTickerB || "?"}
                </span>
              </div>
            )}
            {mode === "pairCombo" && (
              <div className="text-[10px] text-muted-foreground">
                Use the classification filter below to pick a leg-set. Unordered pairs (A/B == B/A) are generated automatically.
              </div>
            )}
            {mode === "basket" && (
              <BasketPicker tickers={allTickers} value={basketTickers} onChange={setBasketTickers} label="" testIdPrefix="tl-basket" />
            )}
            {mode === "universe" && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span data-testid="tl-universe-count">{universeTickers ? universeTickers.size : allTickers.length} tickers</span>
              </div>
            )}
          </div>
          <div className="flex gap-1 items-center">
            <span className="text-[9px] text-muted-foreground uppercase">Date Range</span>
            {[["all","ALL"],["20y","20Y"],["10y","10Y"],["5y","5Y"],["3y","3Y"],["1y","1Y"],["ytd","YTD"]].map(([val, label]) => (
              <button
                key={val}
                data-testid={`tl-date-preset-${val}`}
                onClick={() => { setDatePreset(val); setDateRange(createDateRangeFromPreset(val)); }}
                className={`px-1.5 py-0.5 rounded text-[10px] ${datePreset === val ? "bg-cyan-500/20 text-cyan-400" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >{label}</button>
            ))}
            <span className="text-[9px] text-muted-foreground uppercase ml-3">Freq</span>
            <button data-testid="tl-freq-daily" onClick={() => setTimeframe("daily")} className={`px-1.5 py-0.5 rounded text-[10px] ${timeframe === "daily" ? "bg-cyan-500/20 text-cyan-400" : "bg-muted text-muted-foreground hover:text-foreground"}`}>Daily</button>
            <button data-testid="tl-freq-weekly" onClick={() => setTimeframe("weekly")} className={`px-1.5 py-0.5 rounded text-[10px] ${timeframe === "weekly" ? "bg-cyan-500/20 text-cyan-400" : "bg-muted text-muted-foreground hover:text-foreground"}`}>Weekly</button>
          </div>
        </div>

        {/* Universe filters */}
        {mode === "universe" && (
          <div className="mb-2">
            {/* @ts-ignore */}
            <ClassificationFiltersWithSource
              filters={universeFilters}
              onFiltersChange={setUniverseFilters}
              search={universeSearch}
              onSearchChange={setUniverseSearch}
              manualTickers={universeManualTickers}
              onManualTickersChange={setUniverseManualTickers}
              filteredCount={universeFilteredCount}
              totalCount={universeTotalCount}
              testIdPrefix="tl-universe-filter"
            />
          </div>
        )}

        {/* PairCombo filters */}
        {mode === "pairCombo" && (
          <div className="mb-2 space-y-1">
            <ClassificationFiltersWithSource
              workbookTickers={allTickers}
              filters={classFilters}
              onFiltersChange={setClassFilters}
              search={classSearch}
              onSearchChange={setClassSearch}
              manualTickers={manualTickers}
              onManualTickersChange={setManualTickers}
              filteredCount={filteredPairLegs.length}
              totalCount={allTickers.length}
              testIdPrefix="tl-paircombo-filter"
              source={sourceMode}
              onSourceChange={setSourceMode}
            />
            <div className="text-[10px] text-muted-foreground">
              {filteredPairLegs.length < 2 ? (
                <>Pick at least two legs to generate pairs. Each selection level intersects with the others.</>
              ) : (
                <>
                  {filteredPairLegs.length} legs → <span className="font-bold text-cyan-400">{Math.min(pairComboCount, MAX_PAIRS)}</span> unordered pairs (A/B == B/A){" "}
                  {pairComboCount > MAX_PAIRS && <span className="text-amber-400 font-bold">— capped at {MAX_PAIRS} (from {pairComboCount})</span>}
                  {pairComboCount >= MIN_PAIRS_WARNING && pairComboCount <= MAX_PAIRS && (
                    <span className="ml-2 text-amber-400 font-bold" title="Each pair fetches two Yahoo series and runs full trendline detection. Large scans take a while.">⚠ large scan</span>
                  )}
                </>
              )}
              {filteredPairLegs.length > 0 && filteredPairLegs.length <= 24 && (
                <span className="ml-2 text-muted-foreground/70">[{filteredPairLegs.join(", ")}]</span>
              )}
            </div>
          </div>
        )}

        {/* Detection params — row 1 */}
        <div className="flex flex-wrap gap-3 items-end mb-2 border border-border rounded p-2 bg-card/30">
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Detection methodology. Pivot Pairs: enumerate every pair of swing pivots (classic). Fractals: Williams 5-bar fractals (TradingView style). RANSAC: random-sample consensus — finds lines that pass through the most pivots.">Method</label>
            <select data-testid="tl-method" value={method} onChange={e => setMethod(e.target.value)} className="w-32 px-1 py-0.5 text-[10px] bg-background border border-border rounded">
              <option value="pivot-pairs">Pivot Pairs</option>
              <option value="fractals">Fractals (5-bar)</option>
              <option value="ransac">RANSAC</option>
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="If on, the touch tolerance band is k×ATR(14) instead of a fixed %. High-vol tickers get wider bands automatically.">ATR Tolerance</label>
            <label className="flex items-center gap-1 text-[10px]">
              <input type="checkbox" data-testid="tl-use-atr" checked={useAtrTolerance} onChange={e => setUseAtrTolerance(e.target.checked)} />
              Use ATR
            </label>
          </div>
          {useAtrTolerance && (
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="ATR multiplier k. Tolerance band = k × ATR(14) at each bar. 0.5 means ± half an ATR.">ATR Mult (k)</label>
              <input type="number" data-testid="tl-atr-mult" value={atrMultiplier} step={0.1} min={0.1} onChange={e => setAtrMultiplier(Number(e.target.value))} className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
            </div>
          )}
          {method === "ransac" && (
            <>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Number of random pivot pairs RANSAC samples. More = better coverage but slower.">RANSAC Iters</label>
                <input type="number" data-testid="tl-ransac-iters" value={ransacIters} step={50} min={50} onChange={e => setRansacIters(Number(e.target.value))} className="w-20 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Minimum number of pivots (incl. seed pair) that must lie within tolerance of the line for it to be accepted.">Min Inliers</label>
                <input type="number" data-testid="tl-ransac-min-inliers" value={ransacMinInliers} min={2} onChange={e => setRansacMinInliers(Number(e.target.value))} className="w-14 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
              </div>
            </>
          )}
        </div>

        {/* Detection params — row 2 */}
        <div className="flex flex-wrap gap-3 items-end mb-2 border border-border rounded p-2 bg-card/30">
          <div className={`flex flex-col gap-0.5 ${useAtrTolerance ? "opacity-40" : ""}`}>
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title={useAtrTolerance ? "Overridden by ATR Tolerance." : "% band around the projected trendline. A touch fires when bar's high/low/close is within this %."}>{`Tolerance %${useAtrTolerance ? " (off)" : ""}`}</label>
            <input type="number" data-testid="tl-tolerance" value={tolerancePct} step={0.1} disabled={useAtrTolerance} onChange={e => setTolerancePct(Number(e.target.value))} className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="% close-through beyond the line that counts as a break. Larger = more lenient (only big breaks).">Break Tol %</label>
            <input type="number" data-testid="tl-break-tolerance" value={breakTolerancePct} step={0.25} onChange={e => setBreakTolerancePct(Number(e.target.value))} className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Discard any trendline with fewer than this many total touches (anchors + later touches). Raise to filter weak lines.">Min Touches</label>
            <input type="number" data-testid="tl-min-touches" value={minTouchCount} onChange={e => setMinTouchCount(Number(e.target.value))} className="w-14 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Line must persist at least this many bars between its first and last touch.">Min Span (bars)</label>
            <input type="number" data-testid="tl-min-span" value={minSpanBars} onChange={e => setMinSpanBars(Number(e.target.value))} className="w-14 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Max bars between the two anchor pivots. Larger allows longer-tenured lines but more candidates to evaluate.">Max Anchor Gap (bars)</label>
            <input type="number" data-testid="tl-max-gap" value={maxAnchorGapBars} onChange={e => setMaxAnchorGapBars(Number(e.target.value))} className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
          </div>
          <div className={`flex flex-col gap-0.5 ${method === "fractals" ? "opacity-40" : ""}`}>
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title={method === "fractals" ? "Fixed at 2/2 for Williams fractals." : "Pivot detection window: a swing high/low must have this many bars to its left and right that are lower/higher. Larger = fewer, more significant pivots."}>{`Pivot L/R${method === "fractals" ? " (=2)" : " (bars)"}`}</label>
            <input type="number" data-testid="tl-pivot-lr" value={method === "fractals" ? 2 : pivotLR} disabled={method === "fractals"} onChange={e => setPivotLR(Number(e.target.value))} className="w-14 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="Show top N highest-scoring trendlines per ticker.">Top N</label>
            <input type="number" data-testid="tl-top-n" value={topN} onChange={e => setTopN(Number(e.target.value))} className="w-14 px-1 py-0.5 text-[10px] bg-background border border-border rounded" />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider" title="If checked, broken trendlines are filtered out entirely. If unchecked (default), they're kept with a BROKEN badge and a 30% score penalty.">Broken Lines</label>
            <label className="flex items-center gap-1 text-[10px]">
              <input type="checkbox" data-testid="tl-filter-broken" checked={filterBroken} onChange={e => setFilterBroken(e.target.checked)} />
              Hide broken
            </label>
          </div>
          <div className="ml-auto">
            <button
              data-testid="tl-run"
              onClick={runDetection}
              disabled={running}
              className="px-3 py-1 rounded bg-cyan-500 text-cyan-950 font-medium text-[11px] hover:bg-cyan-400 disabled:opacity-50"
            >
              {running ? `Running… ${progress.current}/${progress.total}` : "Run Detection"}
            </button>
          </div>
        </div>

        {/* Results summary */}
        {results.length > 0 && (
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[10px] text-muted-foreground">
              {results.length} ticker{results.length === 1 ? "" : "s"}{skipped.length > 0 && ` · ${skipped.length} skipped`}
            </div>
            <div className="text-[10px] text-muted-foreground">
              sorted by {(() => {
                const k = outerSort.key;
                return `${k === "ticker" ? "ticker" : k === "currentPrice" ? "current price" : k === "bestType" ? "best type" : k === "bestSlope" ? "best slope" : k === "bestScore" ? "composite score" : "lines found"} ${outerSort.dir === "asc" ? "↑" : "↓"}`;
              })()}
            </div>
          </div>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <div className="border border-border rounded overflow-hidden">
            {/* Outer header */}
            {(() => {
              const s = (key: string) => sortIndicator(key);
              const hc = "cursor-pointer hover:text-foreground select-none";
              return (
                <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-3 py-1.5 bg-muted/30 text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  <div className={hc} onClick={() => toggleOuterSort("ticker")} data-testid="tl-outer-sort-ticker" title="Click to sort by ticker symbol.">Ticker{s("ticker")}</div>
                  <div className={hc} onClick={() => toggleOuterSort("currentPrice")} data-testid="tl-outer-sort-price" title="Click to sort by current price.">Current Price{s("currentPrice")}</div>
                  <div className={hc} onClick={() => toggleOuterSort("bestType")} data-testid="tl-outer-sort-type" title="Click to sort by best line type (Resistance vs Support).">Best Type{s("bestType")}</div>
                  <div className={hc} onClick={() => toggleOuterSort("bestSlope")} data-testid="tl-outer-sort-slope" title="Click to sort by best-line annualized slope (%/yr).">Best Slope{s("bestSlope")}</div>
                  <div className={hc} onClick={() => toggleOuterSort("bestScore")} data-testid="tl-outer-sort-score" title="Click to sort by best-line composite score (0–100).">Best Score{s("bestScore")}</div>
                  <div className={hc} onClick={() => toggleOuterSort("totalLines")} data-testid="tl-outer-sort-lines" title="Click to sort by total trendlines detected for the ticker.">Lines Found{s("totalLines")}</div>
                  <div />
                </div>
              );
            })()}

            {sortedResults.map(item => {
              const isExpanded = expandedTicker === item.ticker;
              const best = item.topLines[0];
              return (
                <div key={item.ticker} className="border-t border-border/60">
                  <button
                    className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-3 py-1.5 w-full text-left hover:bg-accent/10 items-center"
                    onClick={() => setExpandedTicker(isExpanded ? null : item.ticker)}
                  >
                    <div className="text-foreground font-medium">{item.ticker}</div>
                    <div>${item.currentPrice.toFixed(2)}</div>
                    <div>{best ? <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${best.kind === "resistance" ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>{best.kind === "resistance" ? "Resistance" : "Support"}</span> : "—"}</div>
                    <div>{best ? `${best.slopePctPerYear >= 0 ? "+" : ""}${(best.slopePctPerYear * 100).toFixed(1)}%/yr` : "—"}</div>
                    <div>{best ? <span className="px-1 py-0.5 rounded font-bold" style={{ backgroundColor: scoreBg(best.compositeScore) }}>{(best.compositeScore * 100).toFixed(1)}</span> : "—"}</div>
                    <div>{item.totalLines}</div>
                    <span className="text-[10px] text-muted-foreground w-6 text-center">{isExpanded ? "▾" : "▸"}</span>
                  </button>

                  {isExpanded && item.topLines.length > 0 && (
                    <div className="px-4 pb-3 bg-card/20">
                      <div className="text-[9px] font-mono text-muted-foreground mb-1 pt-1">
                        Top {item.topLines.length} trendlines (of {item.totalLines} total detected):
                      </div>
                      <table className="w-full text-[10px] font-mono border-collapse">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground text-[9px] uppercase tracking-wider">
                            {(() => {
                              const si = (k: string) => lineSortIndicator(k);
                              const lc = "text-left py-1 px-1 cursor-pointer hover:text-foreground select-none";
                              const rc = "text-right py-1 px-1 cursor-pointer hover:text-foreground select-none";
                              return (
                                <>
                                  <th className="py-1 px-1 w-6" title="Toggle line for chart plot. Multiple may be selected." />
                                  <th className={lc} onClick={() => toggleLineSort("rank")} data-testid="tl-sort-rank" title="Click to sort by composite-score rank.">#{si("rank")}</th>
                                  <th className={lc} onClick={() => toggleLineSort("kind")} data-testid="tl-sort-kind" title="Support (green) = pivot-low line; Resistance (red) = pivot-high line. Click to sort.">Kind{si("kind")}</th>
                                  <th className={rc} onClick={() => toggleLineSort("slope")} data-testid="tl-sort-slope" title="Annualized slope as % of starting price per year. Positive = ascending. Click to sort.">Slope %/yr{si("slope")}</th>
                                  <th className={rc} onClick={() => toggleLineSort("touches")} data-testid="tl-sort-touches" title="Total touches including the two anchor pivots. Click to sort.">Touches{si("touches")}</th>
                                  <th className={rc} onClick={() => toggleLineSort("rSquared")} data-testid="tl-sort-r2" title="R² fit of all touches against the line (0–100%). Higher = touches fall closer to the line. Click to sort.">R²{si("rSquared")}</th>
                                  <th className={rc} onClick={() => toggleLineSort("span")} data-testid="tl-sort-span" title="Bars between first and last touch. Larger = longer-tenured line. Click to sort.">Span (b){si("span")}</th>
                                  <th className={rc} onClick={() => toggleLineSort("days")} data-testid="tl-sort-days" title="Calendar days since the most recent touch. Used in recency scoring (linear decay over 365 days). Click to sort.">Days{si("days")}</th>
                                  <th className={lc} onClick={() => toggleLineSort("broken")} data-testid="tl-sort-broken" title="B = a close has violated the line by more than Break Tolerance % at some point after the second anchor. Broken lines lose 30% of their score. Click to sort.">B?{si("broken")}</th>
                                  <th className={rc} onClick={() => toggleLineSort("score")} data-testid="tl-sort-score" title="Composite 0–100. Weights: 30% touches (cap 6), 25% R² fit, 20% longevity, 25% recency. Broken lines × 0.7. Click to sort.">Score{si("score")}</th>
                                  <th className="py-1 px-1 text-right" title="Send this line to the Charts tab.">Action</th>
                                </>
                              );
                            })()}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const dirMult = lineSort.dir === "asc" ? 1 : -1;
                            const rows = item.topLines.map((line: TrendlineResult, originalIdx: number) => ({ line, originalIdx }));
                            rows.sort((a: any, b: any) => {
                              switch (lineSort.key) {
                                case "rank": return (a.originalIdx - b.originalIdx) * dirMult;
                                case "kind": return a.line.kind.localeCompare(b.line.kind) * dirMult;
                                case "slope": return (a.line.slopePctPerYear - b.line.slopePctPerYear) * dirMult;
                                case "touches": return (a.line.touchCount - b.line.touchCount) * dirMult;
                                case "rSquared": return (a.line.rSquared - b.line.rSquared) * dirMult;
                                case "span": return (a.line.spanBars - b.line.spanBars) * dirMult;
                                case "days": {
                                  const ad = a.line.daysSinceLastTouch ?? Number.POSITIVE_INFINITY;
                                  const bd = b.line.daysSinceLastTouch ?? Number.POSITIVE_INFINITY;
                                  return (ad - bd) * dirMult;
                                }
                                case "broken": return ((a.line.broken ? 1 : 0) - (b.line.broken ? 1 : 0)) * dirMult;
                                case "score": return (a.line.compositeScore - b.line.compositeScore) * dirMult;
                                default: return 0;
                              }
                            });
                            const selSet = selectedIdxs[item.ticker] ?? new Set([0]);
                            return rows.map(({ line, originalIdx }: any) => {
                              const isSelected = selSet.has(originalIdx);
                              return (
                                <tr
                                  key={originalIdx}
                                  className={`border-b border-border/30 cursor-pointer transition-colors ${isSelected ? "bg-cyan-500/15 ring-1 ring-cyan-400/40" : "hover:bg-accent/10"}`}
                                  onClick={() => toggleSelection(item.ticker, originalIdx)}
                                  data-testid={`tl-line-row-${originalIdx}`}
                                >
                                  <td className="py-1 px-1 text-center" onClick={e => { e.stopPropagation(); toggleSelection(item.ticker, originalIdx); }}>
                                    <input type="checkbox" checked={isSelected} readOnly className="cursor-pointer" data-testid={`tl-line-check-${originalIdx}`} />
                                  </td>
                                  <td className="py-1 px-1 text-muted-foreground">{originalIdx + 1}</td>
                                  <td className="py-1 px-1"><span className={`px-1 py-0.5 rounded text-[9px] font-bold ${line.kind === "resistance" ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>{line.kind === "resistance" ? "R" : "S"}</span></td>
                                  <td className={`py-1 px-1 text-right ${line.slopePctPerYear >= 0 ? "text-green-400" : "text-red-400"}`}>{line.slopePctPerYear >= 0 ? "+" : ""}{(line.slopePctPerYear * 100).toFixed(1)}%</td>
                                  <td className="py-1 px-1 text-right">{line.touchCount}</td>
                                  <td className="py-1 px-1 text-right">{(line.rSquared * 100).toFixed(1)}%</td>
                                  <td className="py-1 px-1 text-right">{line.spanBars}</td>
                                  <td className="py-1 px-1 text-right text-muted-foreground">{line.daysSinceLastTouch !== null ? `${line.daysSinceLastTouch}d` : "—"}</td>
                                  <td className="py-1 px-1">{line.broken ? <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400">B</span> : <span className="text-muted-foreground/40">—</span>}</td>
                                  <td className="py-1 px-1 text-right"><span className="px-1 py-0.5 rounded font-bold" style={{ backgroundColor: scoreBg(line.compositeScore) }}>{(line.compositeScore * 100).toFixed(1)}</span></td>
                                  <td className="py-1 px-1 text-right">
                                    <button
                                      onClick={e => { e.stopPropagation(); sendToCharts(item.ticker, [line]); }}
                                      className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 hover:text-cyan-300"
                                      title="Send this trendline to the Charts tab as a drawing."
                                      data-testid={`tl-send-charts-${originalIdx}`}
                                    >→ Charts</button>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>

                      {/* Chart + controls */}
                      <div className="mt-3">
                        {(() => {
                          const selSet = selectedIdxs[item.ticker] ?? new Set([0]);
                          const selectedLines = Array.from(selSet).sort((a, b) => a - b).map((i: number) => item.topLines[i]).filter(Boolean);
                          return (
                            <>
                              <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="text-muted-foreground">Plotting {selectedLines.length} of {item.topLines.length}</span>
                                  <button
                                    onClick={() => setSelectedIdxs(prev => ({ ...prev, [item.ticker]: new Set(item.topLines.map((_: any, i: number) => i)) }))}
                                    className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground"
                                    data-testid={`tl-select-all-${item.ticker}`}
                                  >Select all</button>
                                  <button
                                    onClick={() => setSelectedIdxs(prev => ({ ...prev, [item.ticker]: new Set() }))}
                                    className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground"
                                    data-testid={`tl-clear-${item.ticker}`}
                                  >Clear</button>
                                  <button
                                    onClick={() => sendToCharts(item.ticker, selectedLines)}
                                    disabled={selectedLines.length === 0}
                                    className={`px-2 py-0.5 rounded ${selectedLines.length === 0 ? "bg-muted text-muted-foreground/40 cursor-not-allowed" : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"}`}
                                    data-testid={`tl-send-all-charts-${item.ticker}`}
                                    title="Send all selected trendlines to the Charts tab."
                                  >Send {selectedLines.length} → Charts</button>
                                </div>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <label className="text-muted-foreground" title="Number of bars to project the trendlines past the last data point.">Project (bars)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={500}
                                    value={futureBars}
                                    onChange={e => setFutureBars(Math.max(0, Math.min(500, parseInt(e.target.value) || 0)))}
                                    className="w-14 bg-background border border-border rounded px-1 py-0.5 text-foreground"
                                    data-testid="tl-future-bars"
                                  />
                                </div>
                              </div>
                              <TrendlineChart ticker={item.ticker} bars={item.bars} lines={selectedLines} height={480} futureBars={futureBars} />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {isExpanded && item.topLines.length === 0 && (
                    <div className="px-4 pb-3 bg-card/20 text-[10px] text-muted-foreground">
                      No trendlines met the criteria — try lowering Min Touches or widening Max Anchor Gap.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && !running && (
          <div className="text-[10px] text-muted-foreground py-8 text-center">
            Pick a ticker, set your parameters, and click <span className="text-foreground">Run Detection</span> to scan for diagonal support and resistance trendlines.
          </div>
        )}

        {/* Skipped */}
        {skipped.length > 0 && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            <span className="font-bold">Skipped:</span>{" "}
            {skipped.slice(0, 10).map((s: any) => `${s.ticker} (${s.reason})`).join(", ")}
            {skipped.length > 10 && ` … +${skipped.length - 10} more`}
          </div>
        )}
      </div>
    </div>
  );
}
