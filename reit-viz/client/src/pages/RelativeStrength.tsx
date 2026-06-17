// Reconstructed from recovered-bundle/RelativeStrength-DwYUHZhC.js on 2026-06-11
import { useState, useMemo, useCallback } from "react";
import { useAppContext } from "@/lib/appContext";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { fetchTradingDates } from "@/lib/fetchTradingDates";
import { fetchMetricSeries } from "@/lib/fetchMetricSeries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Settings, Loader2, Download } from "lucide-react";
import { driverScan } from "@/lib/driverScan";
import { Play as PlayIcon } from "@/lib/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricDef {
  key: string;
  label: string;
  family: "valuation" | "growth" | "technical" | "macro";
  direction: 1 | -1;
}

interface MatrixPanel {
  tickers: string[];
  dates: string[];
  matrix: Float64Array[];
}

interface MetricPanelResult {
  xsPeer: MatrixPanel;
  xsUniverse: MatrixPanel;
  tsZ: MatrixPanel;
  direction: 1 | -1;
}

interface SnapshotRow {
  ticker: string;
  score: number;
  scorePercentile: number;
  breakdown: BreakdownRow[];
}

interface BreakdownRow {
  metric: string;
  label: string;
  family: string;
  raw: number;
  xsPeer: number;
  xsUniverse: number;
  tsZ: number;
  contribution: number;
}

interface BacktestBucketStat {
  bucket: string;
  horizon: string;
  n: number;
  meanReturn: number;
  medianReturn: number;
  hitRate: number;
}

interface BacktestLongShort {
  horizon: string;
  n: number;
  meanReturn: number;
  hitRate: number;
  sharpe: number;
}

interface BacktestResult {
  nObservations: number;
  nDates: number;
  bucketStats: BacktestBucketStat[];
  longShort: BacktestLongShort[];
  icPerDate: { date: string; horizon: string; ic: number | null }[];
  icMeans: Record<string, number | null>;
  icStds: Record<string, number | null>;
  equityCurve: { date: string; long: number; short: number; ls: number }[];
}

interface RunResult {
  asOfDate: string;
  snapshot: SnapshotRow[];
  config: RseConfig;
  backtest: BacktestResult | null;
}

interface RseConfig {
  metrics: string[];
  weights: Record<string, number>;
  alpha: number;
  xs: {
    scope: "peer" | "universe" | "blend";
    peerWeight: number;
    peerDimension: string;
  };
  ts: {
    window: "rolling" | "expanding";
    rollingBars: number;
    minBars: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METRIC_DEFS: MetricDef[] = [
  { key: "P/AFFO FY2",       label: "P/AFFO FY2",        family: "valuation", direction: -1 },
  { key: "P/FFO FY2",        label: "P/FFO FY2",         family: "valuation", direction: -1 },
  { key: "EV/EBITDA FY2",    label: "EV/EBITDA FY2",     family: "valuation", direction: -1 },
  { key: "Implied Cap Rate", label: "Implied Cap Rate",   family: "valuation", direction:  1 },
  { key: "AFFO Yield FY2",   label: "AFFO Yield FY2",    family: "valuation", direction:  1 },
  { key: "Dividend Yield",   label: "Dividend Yield",    family: "valuation", direction:  1 },
  { key: "FY2 AFFO Growth",  label: "FY2 AFFO Growth",   family: "growth",    direction:  1 },
  { key: "FY1 AFFO Growth",  label: "FY1 AFFO Growth",   family: "growth",    direction:  1 },
  { key: "FY2 FFO Growth",   label: "FY2 FFO Growth",    family: "growth",    direction:  1 },
  { key: "FY2 EPS Growth",   label: "FY2 EPS Growth",    family: "growth",    direction:  1 },
  { key: "1M Price Chg%",    label: "1M Momentum",       family: "technical", direction:  1 },
  { key: "3M Price Chg%",    label: "3M Momentum",       family: "technical", direction:  1 },
  { key: "6M Price Chg%",    label: "6M Momentum",       family: "technical", direction:  1 },
  { key: "% off 52wk High",  label: "% off 52wk High",   family: "technical", direction:  1 },
  { key: "Beta 10Y",         label: "Beta to 10Y",       family: "macro",     direction: -1 },
  { key: "Beta BBB",         label: "Beta to BBB Spread",family: "macro",     direction: -1 },
];

const METRIC_MAP: Record<string, MetricDef> = Object.fromEntries(METRIC_DEFS.map(m => [m.key, m]));

const FAMILY_LABELS: Record<string, string> = {
  valuation: "Valuation",
  growth: "Growth & Quality",
  technical: "Technicals",
  macro: "Macro Sensitivity",
};

const FAMILIES = ["valuation", "growth", "technical", "macro"] as const;

const HORIZON_WINDOWS = [
  { days:   5, label: "1W" },
  { days:  21, label: "1M" },
  { days:  63, label: "3M" },
  { days: 126, label: "6M" },
  { days: 252, label: "12M" },
];

const DEFAULT_METRICS = ["P/AFFO FY2", "AFFO Yield FY2", "FY2 AFFO Growth", "Dividend Yield", "3M Price Chg%", "% off 52wk High"];

const DEFAULT_CONFIG: RseConfig = {
  metrics: DEFAULT_METRICS,
  weights: Object.fromEntries(DEFAULT_METRICS.map(k => [k, 1])),
  alpha: 0.6,
  xs: { scope: "blend", peerWeight: 0.7, peerDimension: "subindustry" },
  ts: { window: "rolling", rollingBars: 504, minBars: 60 },
};

// ─── Math helpers ─────────────────────────────────────────────────────────────

function createMatrix(tickers: string[], dates: string[]): MatrixPanel {
  const matrix = tickers.map(() => {
    const row = new Float64Array(dates.length);
    row.fill(NaN);
    return row;
  });
  return { tickers, dates, matrix };
}

function fillMatrixRow(panel: MatrixPanel, tickerIdx: number, series: { dates: string[]; values: number[] }) {
  const dateIndex = new Map<string, number>();
  for (let i = 0; i < panel.dates.length; i++) dateIndex.set(panel.dates[i], i);
  const row = panel.matrix[tickerIdx];
  for (let i = 0; i < series.dates.length; i++) {
    const time = series.dates[i];
    const value = series.values[i];
    const idx = dateIndex.get(time);
    if (idx !== undefined && Number.isFinite(value)) row[idx] = value;
  }
}

function percentileRank(value: number, array: Float64Array | number[]): number {
  if (!Number.isFinite(value)) return NaN;
  let below = 0, equal = 0, total = 0;
  for (let i = 0; i < array.length; i++) {
    const v = array[i];
    if (Number.isFinite(v)) { total++; if (v < value) below++; else if (v === value) equal++; }
  }
  return total === 0 ? NaN : (below + 0.5 * equal) / total * 100;
}

function meanStd(arr: Float64Array | number[]): { mean: number; std: number; n: number } {
  let sum = 0, n = 0;
  for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (Number.isFinite(v)) { sum += v; n++; } }
  if (n === 0) return { mean: NaN, std: NaN, n: 0 };
  const mean = sum / n;
  if (n < 2) return { mean, std: NaN, n };
  let ss = 0;
  for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (Number.isFinite(v)) ss += (v - mean) ** 2; }
  return { mean, std: Math.sqrt(ss / (n - 1)), n };
}

function clampZ(z: number, cap = 4): number {
  return Number.isFinite(z) ? Math.max(-cap, Math.min(cap, z)) : NaN;
}

function buildPeerIndex(tickers: { [key: string]: unknown }[], dimension: string): Map<number, string> {
  const peerMap = new Map<number, string>();
  for (let i = 0; i < tickers.length; i++) {
    const val = (tickers[i] as Record<string, unknown>)[dimension];
    peerMap.set(i, typeof val === "string" && val.length > 0 ? val : "__UNCLASSIFIED__");
  }
  return peerMap;
}

function computeXsPercentile(panel: MatrixPanel, scope: "universe" | "peer", peerIndex?: Map<number, string>): MatrixPanel {
  const nTickers = panel.tickers.length;
  const nDates = panel.dates.length;
  const result = createMatrix(panel.tickers, panel.dates);

  if (scope === "universe") {
    for (let d = 0; d < nDates; d++) {
      const col = new Float64Array(nTickers);
      for (let t = 0; t < nTickers; t++) col[t] = panel.matrix[t][d];
      for (let t = 0; t < nTickers; t++) result.matrix[t][d] = percentileRank(col[t], col);
    }
    return result;
  }

  if (!peerIndex) throw new Error("peerIndex required for peer scope");
  const groups = new Map<string, number[]>();
  for (let i = 0; i < nTickers; i++) {
    const g = peerIndex.get(i) || "__UNCLASSIFIED__";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(i);
  }
  for (let d = 0; d < nDates; d++) {
    for (const [, members] of groups) {
      const groupVals = new Float64Array(members.length);
      for (let i = 0; i < members.length; i++) groupVals[i] = panel.matrix[members[i]][d];
      for (let i = 0; i < members.length; i++) result.matrix[members[i]][d] = percentileRank(groupVals[i], groupVals);
    }
  }
  return result;
}

function computeTsZ(panel: MatrixPanel, opts: { window: "rolling" | "expanding"; rollingBars: number; minBars: number }): MatrixPanel {
  const nTickers = panel.tickers.length;
  const nDates = panel.dates.length;
  const result = createMatrix(panel.tickers, panel.dates);
  const minBars = Math.max(2, opts.minBars);

  for (let t = 0; t < nTickers; t++) {
    const row = panel.matrix[t];
    const out = result.matrix[t];
    if (opts.window === "expanding") {
      let sum = 0, sumSq = 0, cnt = 0;
      for (let d = 0; d < nDates; d++) {
        const v = row[d];
        if (Number.isFinite(v)) {
          if (cnt >= minBars) {
            const mean = sum / cnt;
            const variance = sumSq / cnt - mean * mean;
            const std = variance > 0 ? Math.sqrt(variance * cnt / (cnt - 1)) : NaN;
            out[d] = Number.isFinite(std) && std > 0 ? clampZ((v - mean) / std) : NaN;
          }
          sum += v; sumSq += v * v; cnt++;
        }
      }
    } else {
      const windowSize = Math.max(minBars, opts.rollingBars);
      const buf: number[] = [];
      for (let d = 0; d < nDates; d++) {
        const v = row[d];
        if (buf.length >= minBars) {
          const { mean, std } = meanStd(buf);
          if (Number.isFinite(v) && Number.isFinite(std) && std > 0) out[d] = clampZ((v - mean) / std);
        }
        if (Number.isFinite(v)) { buf.push(v); if (buf.length > windowSize) buf.shift(); }
      }
    }
  }
  return result;
}

function computeCompositeScoreMatrix(
  metricPanels: Record<string, MetricPanelResult>,
  config: RseConfig
): MatrixPanel {
  const validMetrics = config.metrics.filter(m => metricPanels[m]);
  if (validMetrics.length === 0) {
    const first = Object.values(metricPanels)[0];
    if (!first) throw new Error("No panels provided");
    return createMatrix(first.xsUniverse.tickers, first.xsUniverse.dates);
  }

  const base = metricPanels[validMetrics[0]].xsUniverse;
  const nTickers = base.tickers.length;
  const nDates = base.dates.length;
  const result = createMatrix(base.tickers, base.dates);

  let totalWeight = 0;
  const weights: Record<string, number> = {};
  for (const m of validMetrics) { const w = config.weights[m] ?? 1; weights[m] = w; totalWeight += w; }
  if (totalWeight === 0) totalWeight = 1;

  const peerFraction = config.xs.scope === "peer" ? 1 : config.xs.scope === "universe" ? 0 : config.xs.peerWeight;
  const univFraction = 1 - peerFraction;

  for (let t = 0; t < nTickers; t++) {
    for (let d = 0; d < nDates; d++) {
      let weightedSum = 0, weightSumUsed = 0;
      for (const m of validMetrics) {
        const panel = metricPanels[m];
        const wNorm = weights[m] / totalWeight;
        const direction = panel.direction;
        const xsPeer = panel.xsPeer.matrix[t][d];
        const xsUniv = panel.xsUniverse.matrix[t][d];
        let xs = NaN;
        if (config.xs.scope === "peer") xs = xsPeer;
        else if (config.xs.scope === "universe") xs = xsUniv;
        else if (Number.isFinite(xsPeer) && Number.isFinite(xsUniv)) xs = peerFraction * xsPeer + univFraction * xsUniv;
        else if (Number.isFinite(xsPeer)) xs = xsPeer;
        else if (Number.isFinite(xsUniv)) xs = xsUniv;

        const xsScore = Number.isFinite(xs) ? (direction === 1 ? xs : 100 - xs) : NaN;
        const tsZ = panel.tsZ.matrix[t][d];
        const tsZDir = Number.isFinite(tsZ) ? tsZ * direction : NaN;
        const tsScore = Number.isFinite(tsZDir) ? Math.max(0, Math.min(100, 50 + 12.5 * tsZDir)) : NaN;

        let combined: number;
        if (Number.isFinite(xsScore) && Number.isFinite(tsScore)) combined = config.alpha * xsScore + (1 - config.alpha) * tsScore;
        else if (Number.isFinite(xsScore)) combined = xsScore;
        else if (Number.isFinite(tsScore)) combined = tsScore;
        else continue;

        weightedSum += wNorm * combined;
        weightSumUsed += wNorm;
      }
      if (weightSumUsed > 0) result.matrix[t][d] = weightedSum / weightSumUsed;
    }
  }
  return result;
}

function buildSnapshot(
  metricPanels: Record<string, MetricPanelResult>,
  rawPanels: Record<string, MatrixPanel>,
  compositePanel: MatrixPanel,
  config: RseConfig,
  dateIdx: number
): SnapshotRow[] {
  const nTickers = compositePanel.tickers.length;
  const validMetrics = config.metrics.filter(m => metricPanels[m]);

  let totalWeight = 0;
  const weights: Record<string, number> = {};
  for (const m of validMetrics) { const w = config.weights[m] ?? 1; weights[m] = w; totalWeight += w; }
  if (totalWeight === 0) totalWeight = 1;

  const peerFraction = config.xs.scope === "peer" ? 1 : config.xs.scope === "universe" ? 0 : config.xs.peerWeight;
  const univFraction = 1 - peerFraction;

  const compositeCol = new Float64Array(nTickers);
  for (let t = 0; t < nTickers; t++) compositeCol[t] = compositePanel.matrix[t][dateIdx];

  const rows: SnapshotRow[] = [];
  for (let t = 0; t < nTickers; t++) {
    const score = compositeCol[t];
    if (!Number.isFinite(score)) continue;
    const breakdown: BreakdownRow[] = [];
    for (const m of validMetrics) {
      const metaDef = METRIC_MAP[m];
      if (!metaDef) continue;
      const panel = metricPanels[m];
      const rawPanel = rawPanels[m];
      const raw = rawPanel ? rawPanel.matrix[t][dateIdx] : NaN;
      const xsPeer = panel.xsPeer.matrix[t][dateIdx];
      const xsUniv = panel.xsUniverse.matrix[t][dateIdx];
      const tsZ = panel.tsZ.matrix[t][dateIdx];
      const direction = panel.direction;

      let xs = NaN;
      if (config.xs.scope === "peer") xs = xsPeer;
      else if (config.xs.scope === "universe") xs = xsUniv;
      else if (Number.isFinite(xsPeer) && Number.isFinite(xsUniv)) xs = peerFraction * xsPeer + univFraction * xsUniv;
      else if (Number.isFinite(xsPeer)) xs = xsPeer;
      else if (Number.isFinite(xsUniv)) xs = xsUniv;

      const xsScore = Number.isFinite(xs) ? (direction === 1 ? xs : 100 - xs) : NaN;
      const tsZDir = Number.isFinite(tsZ) ? tsZ * direction : NaN;
      const tsScore = Number.isFinite(tsZDir) ? Math.max(0, Math.min(100, 50 + 12.5 * tsZDir)) : NaN;
      let combined: number;
      if (Number.isFinite(xsScore) && Number.isFinite(tsScore)) combined = config.alpha * xsScore + (1 - config.alpha) * tsScore;
      else if (Number.isFinite(xsScore)) combined = xsScore;
      else if (Number.isFinite(tsScore)) combined = tsScore;
      else combined = NaN;

      const wNorm = weights[m] / totalWeight;
      breakdown.push({
        metric: m,
        label: metaDef.label,
        family: metaDef.family,
        raw,
        xsPeer,
        xsUniverse: xsUniv,
        tsZ,
        contribution: Number.isFinite(combined) ? wNorm * combined : NaN,
      });
    }
    rows.push({ ticker: compositePanel.tickers[t], score, scorePercentile: percentileRank(score, compositeCol), breakdown });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

// ─── Backtest helpers ─────────────────────────────────────────────────────────

function arrayMean(arr: number[]): number {
  if (arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function arrayMedian(arr: number[]): number {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function arrayStd(arr: number[]): number {
  if (arr.length < 2) return NaN;
  const m = arrayMean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function assignBuckets(scores: Float64Array, nBuckets: number): Int16Array {
  const n = scores.length;
  const result = new Int16Array(n).fill(-1);
  const valid: { i: number; s: number }[] = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(scores[i])) valid.push({ i, s: scores[i] });
  if (valid.length < nBuckets) return result;
  valid.sort((a, b) => b.s - a.s);
  const step = valid.length / nBuckets;
  for (let i = 0; i < valid.length; i++) {
    result[valid[i].i] = Math.min(nBuckets - 1, Math.floor(i / step));
  }
  return result;
}

function runBacktest(compositePanel: MatrixPanel, pricePanel: MatrixPanel, opts: { nBuckets: number; rebalanceBars: number; hitThreshold: number }): BacktestResult {
  const nTickers = compositePanel.tickers.length;
  const nDates = compositePanel.dates.length;
  const { nBuckets, rebalanceBars, hitThreshold } = opts;

  const bucketReturns: Record<string, Record<string, number[]>> = {};
  const bucketHits: Record<string, Record<string, number[]>> = {};
  for (const h of HORIZON_WINDOWS) { bucketReturns[h.label] = {}; bucketHits[h.label] = {}; for (let b = 0; b < nBuckets; b++) { bucketReturns[h.label][`D${b+1}`] = []; bucketHits[h.label][`D${b+1}`] = []; } }

  const icPerDate: { date: string; horizon: string; ic: number | null }[] = [];
  const longShortByHorizon: Record<string, { date: string; ret: number }[]> = {};
  const equityCurveLong: { date: string; ret: number }[] = [];
  const equityCurveShort: { date: string; ret: number }[] = [];
  for (const h of HORIZON_WINDOWS) longShortByHorizon[h.label] = [];

  const rebalDates = new Set<string>();
  let nObs = 0;

  for (let d = 0; d < nDates; d += rebalanceBars) {
    const scores = new Float64Array(nTickers);
    for (let t = 0; t < nTickers; t++) scores[t] = NaN;
    for (let t = 0; t < nTickers; t++) scores[t] = compositePanel.matrix[t][d];
    const buckets = assignBuckets(scores, nBuckets);

    for (const h of HORIZON_WINDOWS) {
      const futureIdx = d + h.days;
      if (futureIdx >= nDates) continue;
      const observations: { ret: number; bucket: number; score: number }[] = [];
      for (let t = 0; t < nTickers; t++) {
        const pNow = pricePanel.matrix[t][d];
        const pFut = pricePanel.matrix[t][futureIdx];
        const score = scores[t];
        const bucket = buckets[t];
        if (Number.isFinite(pNow) && Number.isFinite(pFut) && pNow > 0 && Number.isFinite(score) && bucket >= 0) {
          observations.push({ ret: pFut / pNow - 1, bucket, score });
        }
      }
      if (observations.length < nBuckets * 2) continue;
      rebalDates.add(compositePanel.dates[d]);
      for (const { ret, bucket } of observations) {
        const key = `D${bucket + 1}`;
        bucketReturns[h.label][key].push(ret);
        bucketHits[h.label][key].push(ret >= hitThreshold ? 1 : 0);
      }
      const rets = observations.map(o => o.ret);
      const icScores = observations.map(o => o.score);
      const ic = (driverScan as (x: number[], y: number[]) => number | null)(icScores, rets);
      icPerDate.push({ date: compositePanel.dates[d], horizon: h.label, ic });

      const q1Rets = observations.filter(o => o.bucket === 0).map(o => o.ret);
      const qLast = observations.filter(o => o.bucket === nBuckets - 1).map(o => o.ret);
      if (q1Rets.length > 0 && qLast.length > 0) {
        longShortByHorizon[h.label].push({ date: compositePanel.dates[d], ret: arrayMean(q1Rets) - arrayMean(qLast) });
      }
      if (h.label === "1M") nObs += observations.length;
    }

    // 1M equity curve
    const fut1M = d + 21;
    if (fut1M < nDates) {
      const q1 = [], qLast: number[] = [];
      for (let t = 0; t < nTickers; t++) {
        const pNow = pricePanel.matrix[t][d], pFut = pricePanel.matrix[t][fut1M];
        if (Number.isFinite(pNow) && Number.isFinite(pFut) && pNow > 0 && buckets[t] >= 0) {
          if (buckets[t] === 0) q1.push(pFut / pNow - 1);
          if (buckets[t] === nBuckets - 1) qLast.push(pFut / pNow - 1);
        }
      }
      if (q1.length && qLast.length) {
        equityCurveLong.push({ date: compositePanel.dates[d], ret: arrayMean(q1) });
        equityCurveShort.push({ date: compositePanel.dates[d], ret: arrayMean(qLast) });
      }
    }
  }

  const bucketStats: BacktestBucketStat[] = [];
  for (const h of HORIZON_WINDOWS) {
    for (let b = 0; b < nBuckets; b++) {
      const key = `D${b + 1}`;
      const rets = bucketReturns[h.label][key];
      const hits = bucketHits[h.label][key];
      bucketStats.push({ bucket: key, horizon: h.label, n: rets.length, meanReturn: rets.length ? arrayMean(rets) : NaN, medianReturn: rets.length ? arrayMedian(rets) : NaN, hitRate: hits.length ? arrayMean(hits) : NaN });
    }
  }

  const longShort: BacktestLongShort[] = HORIZON_WINDOWS.map(h => {
    const spreads = longShortByHorizon[h.label].map(e => e.ret);
    if (spreads.length === 0) return { horizon: h.label, n: 0, meanReturn: NaN, hitRate: NaN, sharpe: NaN };
    const mean = arrayMean(spreads);
    const std = arrayStd(spreads);
    const hitRate = arrayMean(spreads.map(r => r > 0 ? 1 : 0));
    const annFactor = 252 / Math.max(1, h.days);
    const sharpe = Number.isFinite(std) && std > 0 ? mean * annFactor / (std * Math.sqrt(annFactor)) : NaN;
    return { horizon: h.label, n: spreads.length, meanReturn: mean, hitRate, sharpe };
  });

  const icMeans: Record<string, number | null> = {};
  const icStds: Record<string, number | null> = {};
  for (const h of HORIZON_WINDOWS) {
    const ics = icPerDate.filter(x => x.horizon === h.label && x.ic !== null).map(x => x.ic as number);
    icMeans[h.label] = ics.length ? arrayMean(ics) : null;
    icStds[h.label] = ics.length > 1 ? arrayStd(ics) : null;
  }

  let longCum = 1, shortCum = 1, lsCum = 1;
  const equityCurve: { date: string; long: number; short: number; ls: number }[] = [];
  for (let i = 0; i < equityCurveLong.length; i++) {
    longCum *= 1 + equityCurveLong[i].ret;
    shortCum *= 1 + equityCurveShort[i].ret;
    lsCum *= 1 + (equityCurveLong[i].ret - equityCurveShort[i].ret);
    equityCurve.push({ date: equityCurveLong[i].date, long: longCum, short: shortCum, ls: lsCum });
  }

  return { nObservations: nObs, nDates: rebalDates.size, bucketStats, longShort, icPerDate, icMeans, icStds, equityCurve };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function cx(...classes: (string | false | undefined | null)[]): string { return classes.filter(Boolean).join(" "); }
function fmtPct(v: number, decimals = 1): string { return Number.isFinite(v) ? v.toFixed(decimals) + "%" : "—"; }
function fmtNum(v: number, decimals = 2): string { return Number.isFinite(v) ? v.toFixed(decimals) : "—"; }

// ─── Sub-components ───────────────────────────────────────────────────────────

function DecileTable({ title, rows, positive }: { title: string; rows: SnapshotRow[]; positive: boolean }) {
  return (
    <div>
      <div className={cx("text-sm font-semibold mb-1", positive ? "text-green-600" : "text-red-600")}>{title}</div>
      <table className="w-full text-xs">
        <thead><tr className="text-left border-b">
          <th className="p-1">Ticker</th>
          <th className="p-1 text-right">Score</th>
          <th className="p-1 text-right">Pctile</th>
        </tr></thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.ticker} className="border-b hover:bg-muted/50">
              <td className="p-1 font-mono">{row.ticker}</td>
              <td className="p-1 text-right">{fmtNum(row.score)}</td>
              <td className="p-1 text-right">{fmtPct(row.scorePercentile)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UniverseRankingPanel({ snapshot, asOfDate }: { snapshot: SnapshotRow[]; backtest: BacktestResult | null; asOfDate: string }) {
  const handleExport = () => {
    const header = "rank,ticker,score,percentile\n";
    const rows = snapshot.map((r, i) => `${i + 1},${r.ticker},${r.score.toFixed(2)},${r.scorePercentile.toFixed(1)}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rse-ranking-${asOfDate}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const decileSize = Math.ceil(snapshot.length / 10);
  return (
    <div className="bg-card border rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Universe Ranking (top = strongest)</h3>
        <Button size="sm" variant="outline" onClick={handleExport}><Download className="w-3 h-3 mr-1" /> CSV</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DecileTable title="Top Decile (LONG)" rows={snapshot.slice(0, decileSize)} positive={true} />
        <DecileTable title="Bottom Decile (SHORT)" rows={snapshot.slice(-decileSize).reverse()} positive={false} />
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show full ranking ({snapshot.length} tickers)</summary>
        <div className="mt-2 max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card"><tr className="text-left border-b">
              <th className="p-1">#</th><th className="p-1">Ticker</th>
              <th className="p-1 text-right">Score</th><th className="p-1 text-right">Percentile</th>
            </tr></thead>
            <tbody>
              {snapshot.map((row, idx) => (
                <tr key={row.ticker} className="border-b hover:bg-muted/50">
                  <td className="p-1">{idx + 1}</td>
                  <td className="p-1 font-mono">{row.ticker}</td>
                  <td className="p-1 text-right">{fmtNum(row.score)}</td>
                  <td className="p-1 text-right">{fmtPct(row.scorePercentile)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function PerMetricEdge({ a, b, aSym, bSym }: { a: SnapshotRow; b: SnapshotRow; aSym: string; bSym: string }) {
  const pairs = new Map<string, { aRow: BreakdownRow; bRow: BreakdownRow }>();
  for (const aRow of a.breakdown) {
    const bRow = b.breakdown.find(r => r.metric === aRow.metric);
    if (bRow) pairs.set(aRow.metric, { aRow, bRow });
  }
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Per-Metric Edge</h4>
      <table className="w-full text-xs">
        <thead><tr className="text-left border-b">
          <th className="p-1">Metric</th>
          <th className="p-1 text-right">{aSym} contrib</th>
          <th className="p-1 text-right">{bSym} contrib</th>
          <th className="p-1 text-right">Δ (A−B)</th>
        </tr></thead>
        <tbody>
          {[...pairs.entries()].map(([metric, { aRow, bRow }]) => {
            const diff = (aRow.contribution || 0) - (bRow.contribution || 0);
            return (
              <tr key={metric} className="border-b">
                <td className="p-1">{aRow.label}</td>
                <td className="p-1 text-right">{fmtNum(aRow.contribution)}</td>
                <td className="p-1 text-right">{fmtNum(bRow.contribution)}</td>
                <td className={cx("p-1 text-right font-semibold", diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "")}>
                  {diff > 0 ? "+" : ""}{fmtNum(diff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PairConvictionPanel({ a, b, aSym, bSym, snapshot }: { a: SnapshotRow | undefined; b: SnapshotRow | undefined; aSym: string; bSym: string; snapshot: SnapshotRow[] }) {
  void snapshot;
  if (!a || !b) {
    return (
      <div className="bg-card border rounded-md p-4 text-sm text-muted-foreground">
        One or both tickers not found in scored universe: {!a ? aSym : ""} {!b ? bSym : ""}
      </div>
    );
  }
  const diff = a.score - b.score;
  const direction = diff > 0 ? `LONG ${aSym} / SHORT ${bSym}` : `LONG ${bSym} / SHORT ${aSym}`;
  const absDiff = Math.abs(diff);
  const conviction = absDiff > 25 ? "Strong" : absDiff > 10 ? "Moderate" : "Weak";
  return (
    <div className="bg-card border rounded-md p-4 space-y-3">
      <h3 className="font-semibold">Pair Conviction</h3>
      <div className="text-center py-3 bg-muted/30 rounded">
        <div className="text-2xl font-bold">{direction}</div>
        <div className="text-sm text-muted-foreground mt-1">
          Spread: <strong>{diff.toFixed(1)}</strong> · Conviction: <strong>{conviction}</strong>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[{ sym: aSym, row: a }, { sym: bSym, row: b }].map(({ sym, row }) => (
          <div key={sym} className="border rounded p-3">
            <div className="font-bold text-lg">{sym}</div>
            <div className="text-3xl font-mono">{fmtNum(row.score)}</div>
            <div className="text-xs text-muted-foreground">Universe percentile: {fmtPct(row.scorePercentile)}</div>
          </div>
        ))}
      </div>
      <PerMetricEdge a={a} b={b} aSym={aSym} bSym={bSym} />
    </div>
  );
}

function SingleNamePanel({ row, sym }: { row: SnapshotRow | undefined; sym: string; snapshot: SnapshotRow[] }) {
  if (!row) return <div className="bg-card border rounded-md p-4 text-sm text-muted-foreground">Ticker {sym} not found in scored universe.</div>;
  const pctile = row.scorePercentile;
  const stance = pctile >= 70 ? "OVERWEIGHT" : pctile <= 30 ? "UNDERWEIGHT" : "NEUTRAL";
  const stanceClass = pctile >= 70 ? "text-green-600" : pctile <= 30 ? "text-red-600" : "text-amber-600";
  return (
    <div className="bg-card border rounded-md p-4 space-y-4">
      <h3 className="font-semibold">{sym} — Relative Strength Profile</h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div><div className="text-xs text-muted-foreground">Composite Score</div><div className="text-3xl font-mono">{fmtNum(row.score)}</div></div>
        <div><div className="text-xs text-muted-foreground">Universe Percentile</div><div className="text-3xl font-mono">{fmtPct(pctile, 0)}</div></div>
        <div><div className="text-xs text-muted-foreground">Stance</div><div className={cx("text-2xl font-bold", stanceClass)}>{stance}</div></div>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-2">Per-Metric Breakdown</h4>
        <table className="w-full text-xs">
          <thead><tr className="text-left border-b">
            <th className="p-1">Metric</th><th className="p-1 text-right">Raw</th>
            <th className="p-1 text-right">Peer %ile</th><th className="p-1 text-right">Univ %ile</th>
            <th className="p-1 text-right">TS z</th><th className="p-1 text-right">Contrib</th>
          </tr></thead>
          <tbody>
            {row.breakdown.map(br => (
              <tr key={br.metric} className="border-b">
                <td className="p-1">{br.label}</td>
                <td className="p-1 text-right">{fmtNum(br.raw)}</td>
                <td className="p-1 text-right">{fmtPct(br.xsPeer, 0)}</td>
                <td className="p-1 text-right">{fmtPct(br.xsUniverse, 0)}</td>
                <td className="p-1 text-right">{fmtNum(br.tsZ)}</td>
                <td className={cx("p-1 text-right font-semibold", br.contribution > 5 ? "text-green-600" : br.contribution < -5 ? "text-red-600" : "")}>
                  {fmtNum(br.contribution)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BacktestPanel({ bt }: { bt: BacktestResult }) {
  return (
    <div className="bg-card border rounded-md p-4 space-y-4">
      <h3 className="font-semibold">Backtest Results</h3>
      <div className="text-xs text-muted-foreground">{bt.nObservations} ticker-date observations across {bt.nDates} rebalance dates</div>
      <div>
        <h4 className="text-sm font-semibold mb-2">Long-Short (Top vs Bottom Decile)</h4>
        <table className="w-full text-xs">
          <thead><tr className="text-left border-b">
            <th className="p-1">Horizon</th><th className="p-1 text-right">N</th>
            <th className="p-1 text-right">Mean Spread</th><th className="p-1 text-right">Hit %</th>
            <th className="p-1 text-right">Sharpe</th>
          </tr></thead>
          <tbody>
            {bt.longShort.map(row => (
              <tr key={row.horizon} className="border-b">
                <td className="p-1">{row.horizon}</td>
                <td className="p-1 text-right">{row.n}</td>
                <td className={cx("p-1 text-right font-semibold", row.meanReturn > 0 ? "text-green-600" : "text-red-600")}>{fmtPct(row.meanReturn * 100, 2)}</td>
                <td className="p-1 text-right">{fmtPct(row.hitRate * 100, 0)}</td>
                <td className="p-1 text-right">{fmtNum(row.sharpe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-2">Information Coefficient (Spearman rank corr, score vs fwd return)</h4>
        <table className="w-full text-xs">
          <thead><tr className="text-left border-b">
            <th className="p-1">Horizon</th><th className="p-1 text-right">IC mean</th>
            <th className="p-1 text-right">IC stdev</th><th className="p-1 text-right">IC IR (mean/std)</th>
          </tr></thead>
          <tbody>
            {HORIZON_WINDOWS.map(h => {
              const icMean = bt.icMeans[h.label];
              const icStd = bt.icStds[h.label];
              const ir = icMean !== null && icStd !== null && icStd > 0 ? icMean / icStd : null;
              return (
                <tr key={h.label} className="border-b">
                  <td className="p-1">{h.label}</td>
                  <td className={cx("p-1 text-right font-semibold", icMean !== null && icMean > 0 ? "text-green-600" : icMean !== null && icMean < 0 ? "text-red-600" : "")}>{icMean !== null ? icMean.toFixed(3) : "—"}</td>
                  <td className="p-1 text-right">{icStd !== null ? icStd.toFixed(3) : "—"}</td>
                  <td className="p-1 text-right">{ir !== null ? ir.toFixed(2) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-2">Bucket Returns by Horizon</h4>
        <table className="w-full text-xs">
          <thead><tr className="text-left border-b">
            <th className="p-1">Bucket</th>
            {HORIZON_WINDOWS.map(h => <th key={h.label} className="p-1 text-right">{h.label} Mean</th>)}
          </tr></thead>
          <tbody>
            {Array.from(new Set(bt.bucketStats.map(r => r.bucket))).map(bucket => (
              <tr key={bucket} className="border-b">
                <td className="p-1 font-semibold">{bucket}</td>
                {HORIZON_WINDOWS.map(h => {
                  const stat = bt.bucketStats.find(s => s.bucket === bucket && s.horizon === h.label);
                  return (
                    <td key={h.label} className={cx("p-1 text-right", stat && stat.meanReturn > 0 ? "text-green-600" : stat && stat.meanReturn < 0 ? "text-red-600" : "")}>
                      {stat && Number.isFinite(stat.meanReturn) ? fmtPct(stat.meanReturn * 100, 2) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultsPanel({ mode, result, pairA, pairB, single }: { mode: string; result: RunResult; pairA: string; pairB: string; single: string }) {
  const { snapshot, asOfDate, backtest } = result;
  const snapshotMap = useMemo(() => { const m = new Map<string, SnapshotRow>(); for (const r of snapshot) m.set(r.ticker, r); return m; }, [snapshot]);
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">As of <strong>{asOfDate}</strong> · {snapshot.length} tickers scored</div>
      {mode === "universe" && <UniverseRankingPanel snapshot={snapshot} backtest={backtest} asOfDate={asOfDate} />}
      {mode === "pair" && <PairConvictionPanel a={snapshotMap.get(pairA)} b={snapshotMap.get(pairB)} aSym={pairA} bSym={pairB} snapshot={snapshot} />}
      {mode === "single" && <SingleNamePanel row={snapshotMap.get(single)} sym={single} snapshot={snapshot} />}
      {backtest && mode === "universe" && <BacktestPanel bt={backtest} />}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RelativeStrength() {
  const appCtx = useAppContext();
  const [mode, setMode] = useLocalStorage<string>("rse:mode", "universe");
  const [config, setConfig] = useLocalStorage<RseConfig>("rse:cfg", DEFAULT_CONFIG);
  const [pairA, setPairA] = useLocalStorage<string>("rse:pairA", "O");
  const [pairB, setPairB] = useLocalStorage<string>("rse:pairB", "NNN");
  const [singleTicker, setSingleTicker] = useLocalStorage<string>("rse:single", "O");
  const [doBacktest, setDoBacktest] = useLocalStorage<boolean>("rse:doBT", true);
  const [hitThreshold, setHitThreshold] = useLocalStorage<string>("rse:hitTh", "5");
  const [rebalanceBars, setRebalanceBars] = useLocalStorage<number>("rse:reb", 21);
  const [nBuckets, setNBuckets] = useLocalStorage<number>("rse:buckets", 10);
  const [result, setResult] = useLocalStorage<RunResult | null>("rse:result", null);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState("");

  useWorkspaceTab("relative-strength",
    () => ({ mode, cfg: config, pairA, pairB, singleTicker, doBacktest, hitThreshold, rebalanceBars, nBuckets }),
    (saved: Record<string, unknown>) => {
      if (saved.mode) setMode(saved.mode as string);
      if (saved.cfg) setConfig(saved.cfg as RseConfig);
      if (typeof saved.pairA === "string") setPairA(saved.pairA);
      if (typeof saved.pairB === "string") setPairB(saved.pairB);
      if (typeof saved.singleTicker === "string") setSingleTicker(saved.singleTicker);
      if (typeof saved.doBacktest === "boolean") setDoBacktest(saved.doBacktest);
      if (typeof saved.hitThreshold === "string") setHitThreshold(saved.hitThreshold);
      if (typeof saved.rebalanceBars === "number") setRebalanceBars(saved.rebalanceBars);
      if (typeof saved.nBuckets === "number") setNBuckets(saved.nBuckets);
    }
  );

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setErrorMsg(null);
    setProgressMsg("");
    try {
      const [allTickers, tradingDates] = await Promise.all([fetchWorkbookTickers(), fetchTradingDates()]);
      const tickerList = (appCtx.filteredTickersList ?? allTickers.map((t: { ticker: string }) => t.ticker));
      const visibleSet = new Set(tickerList.map((t: { ticker: string } | string) => typeof t === "string" ? t : t.ticker));
      const filtered = allTickers.filter((t: { ticker: string }) => visibleSet.has(t.ticker));
      if (filtered.length < 5) throw new Error("Need at least 5 tickers in universe");
      const tickers = filtered.map((t: { ticker: string }) => t.ticker);

      setProgressMsg(`Loading metrics for ${tickers.length} tickers…`);
      const metrics = config.metrics;
      const rawPanels: Record<string, MatrixPanel> = {};
      const pricePanel = createMatrix(tickers, tradingDates);
      for (const m of metrics) rawPanels[m] = createMatrix(tickers, tradingDates);

      const BATCH = 20;
      for (let i = 0; i < tickers.length; i += BATCH) {
        const batch = tickers.slice(i, i + BATCH);
        await Promise.all(batch.map(async (ticker: string, bIdx: number) => {
          const tickerIdx = i + bIdx;
          try {
            const closeSeries = await fetchMetricSeries(ticker, "close");
            if (closeSeries) fillMatrixRow(pricePanel, tickerIdx, closeSeries);
          } catch { /**/ }
          for (const m of metrics) {
            try {
              const series = await fetchMetricSeries(ticker, m);
              if (series) fillMatrixRow(rawPanels[m], tickerIdx, series);
            } catch { /**/ }
          }
        }));
        setProgressMsg(`Loading metrics… ${Math.min(i + BATCH, tickers.length)}/${tickers.length}`);
      }

      setProgressMsg("Computing percentiles + z-scores…");
      const peerIndex = buildPeerIndex(filtered, config.xs.peerDimension);
      const metricPanels: Record<string, MetricPanelResult> = {};
      for (const m of metrics) {
        const metaDef = METRIC_MAP[m];
        if (!metaDef) continue;
        metricPanels[m] = {
          xsPeer: computeXsPercentile(rawPanels[m], "peer", peerIndex),
          xsUniverse: computeXsPercentile(rawPanels[m], "universe"),
          tsZ: computeTsZ(rawPanels[m], config.ts),
          direction: metaDef.direction,
        };
      }

      setProgressMsg("Computing composite scores…");
      const compositePanel = computeCompositeScoreMatrix(metricPanels, config);

      let latestDateIdx = tradingDates.length - 1;
      while (latestDateIdx >= 0) {
        let coverage = 0;
        for (let t = 0; t < tickers.length; t++) if (Number.isFinite(compositePanel.matrix[t][latestDateIdx])) coverage++;
        if (coverage >= Math.floor(tickers.length * 0.5)) break;
        latestDateIdx--;
      }
      if (latestDateIdx < 0) throw new Error("No date has sufficient coverage to score");

      const snapshot = buildSnapshot(metricPanels, rawPanels, compositePanel, config, latestDateIdx);
      let backtest: BacktestResult | null = null;
      if (doBacktest) {
        setProgressMsg("Running backtest…");
        backtest = runBacktest(compositePanel, pricePanel, {
          nBuckets,
          rebalanceBars,
          hitThreshold: parseFloat(hitThreshold || "5") / 100,
        });
      }

      setResult({ asOfDate: tradingDates[latestDateIdx], snapshot, config, backtest });
      setProgressMsg("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  }, [appCtx, config, doBacktest, hitThreshold, rebalanceBars, nBuckets, setResult]);

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      <header>
        <h1 className="text-2xl font-bold">Relative Strength Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Multi-variable composite score: cross-sectional percentile rank (peer + universe) blended with time-series z-score. Three output modes — universe ranking, pair conviction, single-name vs peer.
        </p>
      </header>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-2 items-center bg-muted/40 p-3 rounded-md">
        <span className="text-sm font-medium mr-2">Mode:</span>
        {(["universe", "pair", "single"] as const).map(m => (
          <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
            {m === "universe" ? "Universe Ranking" : m === "pair" ? "Pair Trade" : "Single-Name"}
          </Button>
        ))}
        {mode === "pair" && (
          <>
            <span className="text-sm ml-4">Long:</span>
            <Input className="w-24 h-8" value={pairA} onChange={e => setPairA(e.target.value.toUpperCase())} placeholder="A" />
            <span className="text-sm">Short:</span>
            <Input className="w-24 h-8" value={pairB} onChange={e => setPairB(e.target.value.toUpperCase())} placeholder="B" />
          </>
        )}
        {mode === "single" && (
          <>
            <span className="text-sm ml-4">Ticker:</span>
            <Input className="w-24 h-8" value={singleTicker} onChange={e => setSingleTicker(e.target.value.toUpperCase())} />
          </>
        )}
      </div>

      {/* Config panel */}
      <div className="bg-card border rounded-md p-4 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Settings className="w-4 h-4 text-muted-foreground" /> Framework Configuration
        </h2>

        {/* Metric checkboxes */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {FAMILIES.map(family => {
            const familyMetrics = METRIC_DEFS.filter(m => m.family === family);
            return (
              <div key={family} className="space-y-1">
                <h3 className="text-xs font-bold uppercase text-muted-foreground">{FAMILY_LABELS[family]}</h3>
                {familyMetrics.map(metaDef => {
                  const checked = config.metrics.includes(metaDef.key);
                  return (
                    <div key={metaDef.key} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const isChecked = e.target.checked;
                          setConfig((prev: RseConfig) => {
                            const updated = { ...prev };
                            if (isChecked) { updated.metrics = [...prev.metrics, metaDef.key]; updated.weights = { ...prev.weights, [metaDef.key]: 1 }; }
                            else { updated.metrics = prev.metrics.filter(k => k !== metaDef.key); const w = { ...prev.weights }; delete w[metaDef.key]; updated.weights = w; }
                            return updated;
                          });
                        }}
                      />
                      <span className="flex-1">{metaDef.label}</span>
                      <span className="text-muted-foreground" title="Direction: +1 higher=bull, -1 higher=bear">{metaDef.direction > 0 ? "↑" : "↓"}</span>
                      {checked && (
                        <Input
                          type="number" step="0.1" min="0" max="5"
                          value={config.weights[metaDef.key] ?? 1}
                          onChange={e => {
                            const w = parseFloat(e.target.value);
                            setConfig((prev: RseConfig) => ({ ...prev, weights: { ...prev.weights, [metaDef.key]: Number.isFinite(w) ? w : 1 } }));
                          }}
                          className="w-14 h-6 text-xs"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* XS/TS controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
          <div>
            <label className="text-xs text-muted-foreground">XS ⇄ TS Blend (α)</label>
            <div className="flex items-center gap-2">
              <input
                type="range" min="0" max="100" value={Math.round(config.alpha * 100)}
                onChange={e => setConfig((prev: RseConfig) => ({ ...prev, alpha: parseInt(e.target.value, 10) / 100 }))}
                className="flex-1"
              />
              <span className="text-xs w-16 text-right">{Math.round(config.alpha * 100)}% XS / {100 - Math.round(config.alpha * 100)}% TS</span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">XS Scope</label>
            <div className="flex gap-1">
              {(["peer", "universe", "blend"] as const).map(scope => (
                <Button key={scope} size="sm" variant={config.xs.scope === scope ? "default" : "outline"} onClick={() => setConfig((prev: RseConfig) => ({ ...prev, xs: { ...prev.xs, scope } }))} className="text-xs">{scope}</Button>
              ))}
            </div>
            {config.xs.scope === "blend" && (
              <div className="flex items-center gap-2 text-xs">
                <span>Peer wt:</span>
                <Input type="number" step="0.1" min="0" max="1" value={config.xs.peerWeight}
                  onChange={e => setConfig((prev: RseConfig) => ({ ...prev, xs: { ...prev.xs, peerWeight: parseFloat(e.target.value) || 0 } }))}
                  className="w-16 h-6 text-xs"
                />
              </div>
            )}
            <Select value={config.xs.peerDimension} onValueChange={val => setConfig((prev: RseConfig) => ({ ...prev, xs: { ...prev.xs, peerDimension: val } }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="subindustry">Sub-Industry</SelectItem>
                <SelectItem value="industry">Industry</SelectItem>
                <SelectItem value="sector">Sector</SelectItem>
                <SelectItem value="supersector">Super-Sector</SelectItem>
                <SelectItem value="subsector">Sub-Sector</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">TS Window</label>
            <Select value={config.ts.window} onValueChange={val => setConfig((prev: RseConfig) => ({ ...prev, ts: { ...prev.ts, window: val as "rolling" | "expanding" } }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rolling">Rolling</SelectItem>
                <SelectItem value="expanding">Expanding</SelectItem>
              </SelectContent>
            </Select>
            {config.ts.window === "rolling" && (
              <div className="flex items-center gap-2 text-xs">
                <span>Bars:</span>
                <Input type="number" step="20" min="20" value={config.ts.rollingBars}
                  onChange={e => setConfig((prev: RseConfig) => ({ ...prev, ts: { ...prev.ts, rollingBars: parseInt(e.target.value, 10) || 252 } }))}
                  className="w-20 h-6 text-xs"
                />
              </div>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span>Min bars:</span>
              <Input type="number" step="10" min="2" value={config.ts.minBars}
                onChange={e => setConfig((prev: RseConfig) => ({ ...prev, ts: { ...prev.ts, minBars: parseInt(e.target.value, 10) || 2 } }))}
                className="w-16 h-6 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Backtest options */}
        <div className="flex flex-wrap gap-4 items-center pt-2 border-t text-xs">
          <div className="flex items-center gap-2">
            <Checkbox checked={doBacktest} onCheckedChange={v => setDoBacktest(!!v)} id="bt" />
            <label htmlFor="bt">Run backtest</label>
          </div>
          {doBacktest && (
            <>
              <div className="flex items-center gap-1">
                <span>Buckets:</span>
                <Input type="number" min="3" max="10" value={nBuckets} onChange={e => setNBuckets(parseInt(e.target.value, 10) || 10)} className="w-14 h-6 text-xs" />
              </div>
              <div className="flex items-center gap-1">
                <span>Rebalance (bars):</span>
                <Input type="number" min="5" value={rebalanceBars} onChange={e => setRebalanceBars(parseInt(e.target.value, 10) || 21)} className="w-16 h-6 text-xs" />
              </div>
              <div className="flex items-center gap-1">
                <span>Hit threshold %:</span>
                <Input type="number" step="0.5" value={hitThreshold} onChange={e => setHitThreshold(e.target.value)} className="w-16 h-6 text-xs" />
              </div>
            </>
          )}
          <div className="flex-1" />
          <Button onClick={handleRun} disabled={isRunning || config.metrics.length === 0} size="sm" className="ml-auto">
            {isRunning ? (
              <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Running…</>
            ) : (
              <><PlayIcon className="w-4 h-4 mr-1" /> Run</>
            )}
          </Button>
        </div>
        {progressMsg && <div className="text-xs text-muted-foreground">{progressMsg}</div>}
        {errorMsg && <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded">{errorMsg}</div>}
      </div>

      {result && <ResultsPanel mode={mode} result={result} pairA={pairA} pairB={pairB} single={singleTicker} />}
    </div>
  );
}
