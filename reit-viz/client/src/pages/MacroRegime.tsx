// Reconstructed from recovered-bundle/MacroRegime-DwnEMx4A.js on 2026-06-11
import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { createChart, ColorType, CrosshairMode, AreaSeries, LineSeries } from "lightweight-charts";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { useAppContext } from "@/lib/appContext";
import { fetchMacroSeriesBatch } from "@/lib/macroStatic";
import { fetchMetricSeries } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RefreshCw, Info, SortAsc, SortDesc, Minus } from "lucide-react";
import { ArrowUpDown } from "@/components/ui/icons";

// ── Regime Constants ──────────────────────────────────────────────────────────

const GRANULAR_REGIMES = [
  "STRONG_GOLDILOCKS",
  "MILD_GOLDILOCKS",
  "STRONG_REFLATION",
  "MILD_REFLATION",
  "STRONG_STAGFLATION",
  "MILD_STAGFLATION",
  "STRONG_DEFLATION",
  "MILD_DEFLATION",
] as const;

type GranularRegime = (typeof GRANULAR_REGIMES)[number];
type CoarseRegime = "GOLDILOCKS" | "REFLATION" | "STAGFLATION" | "DEFLATION";

function toCoarseRegime(regime: GranularRegime): CoarseRegime {
  if (regime.endsWith("GOLDILOCKS")) return "GOLDILOCKS";
  if (regime.endsWith("REFLATION")) return "REFLATION";
  if (regime.endsWith("STAGFLATION")) return "STAGFLATION";
  return "DEFLATION";
}

function toIntensity(regime: GranularRegime): "STRONG" | "MILD" {
  return regime.startsWith("STRONG") ? "STRONG" : "MILD";
}

const COARSE_META: Record<
  CoarseRegime,
  { label: string; color: string; bg: string; description: string }
> = {
  GOLDILOCKS: {
    label: "Goldilocks",
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.15)",
    description:
      "Growth rising, inflation falling — classically risk-on; long-duration assets, growth equities tend to outperform.",
  },
  REFLATION: {
    label: "Reflation",
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.15)",
    description:
      "Growth rising, inflation rising — pro-cyclicals, commodities, value, and short-duration assets typically lead.",
  },
  STAGFLATION: {
    label: "Stagflation",
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.15)",
    description:
      "Growth falling, inflation rising — the toughest regime; commodities, gold, and defensives tend to hold up best.",
  },
  DEFLATION: {
    label: "Deflation",
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.15)",
    description:
      "Growth falling, inflation falling — defensive equities, long-duration Treasuries, and high-quality bonds typically lead.",
  },
};

const GRANULAR_META: Record<
  GranularRegime,
  { label: string; short: string; color: string; bg: string }
> = {
  STRONG_GOLDILOCKS: { label: "Strong Goldilocks", short: "Strong", color: "#059669", bg: "rgba(16, 185, 129, 0.28)" },
  MILD_GOLDILOCKS: { label: "Mild Goldilocks", short: "Mild", color: "#34d399", bg: "rgba(16, 185, 129, 0.10)" },
  STRONG_REFLATION: { label: "Strong Reflation", short: "Strong", color: "#d97706", bg: "rgba(245, 158, 11, 0.28)" },
  MILD_REFLATION: { label: "Mild Reflation", short: "Mild", color: "#fbbf24", bg: "rgba(245, 158, 11, 0.10)" },
  STRONG_STAGFLATION: { label: "Strong Stagflation", short: "Strong", color: "#dc2626", bg: "rgba(239, 68, 68, 0.28)" },
  MILD_STAGFLATION: { label: "Mild Stagflation", short: "Mild", color: "#f87171", bg: "rgba(239, 68, 68, 0.10)" },
  STRONG_DEFLATION: { label: "Strong Deflation", short: "Strong", color: "#2563eb", bg: "rgba(59, 130, 246, 0.28)" },
  MILD_DEFLATION: { label: "Mild Deflation", short: "Mild", color: "#60a5fa", bg: "rgba(59, 130, 246, 0.10)" },
};

const COARSE_ORDER: CoarseRegime[] = ["GOLDILOCKS", "REFLATION", "STAGFLATION", "DEFLATION"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface RegimeClassification {
  month: string;
  rawRegime: CoarseRegime;
  smoothedRegime: CoarseRegime;
  rawGranular: GranularRegime;
  smoothedGranular: GranularRegime;
  intensity: number;
  growthYoY: number;
  growthDelta: number;
  inflationYoY: number;
  inflationDelta: number;
  fedFunds?: number;
  ust10y?: number;
  hyOAS?: number;
  igOAS?: number;
}

interface RegimeEpisode {
  start: string;
  end: string;
  regime: CoarseRegime | GranularRegime;
}

interface NowcastInfo {
  date: string;
  valueSAAR: number;
  valueLevelB: number;
}

interface RegimeResult {
  classifications: RegimeClassification[];
  episodes: RegimeEpisode[];
  granularEpisodes: RegimeEpisode[];
  intensityCutoff: number;
  lastOfficialGDPDate?: string;
  nowcast?: NowcastInfo;
}

interface TickerRegimeStat {
  ticker: string;
  regime: CoarseRegime;
  monthsObserved: number;
  annualizedReturn: number;
  hitRate: number;
  sharpe: number;
  totalReturn: number;
}

interface AggregateRegimeStat {
  avgAnnReturn: number;
  avgHitRate: number;
  avgSharpe: number;
  nTickers: number;
}

interface RegimeTransition {
  to: CoarseRegime;
  growthMove: number;
  inflationMove: number;
  minMove: number;
  driver: "growth" | "inflation";
}

// ── Data Functions ────────────────────────────────────────────────────────────

function forwardFillMonthlyMap(series: Array<{ time: string; value: number }>): Map<string, number> {
  const result = new Map<string, number>();
  if (!series.length) return result;
  const sorted = [...series].sort((a, b) => a.time.localeCompare(b.time));
  const byMonth = new Map<string, number>();
  for (const pt of sorted) byMonth.set(pt.time.slice(0, 7), pt.value);
  const [startY, startM] = sorted[0].time.slice(0, 7).split("-").map(Number);
  const [endY, endM] = sorted[sorted.length - 1].time.slice(0, 7).split("-").map(Number);
  let y = startY, m = startM;
  let last: number | null = null;
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
    if (byMonth.has(key)) last = byMonth.get(key)!;
    if (last !== null) result.set(`${key}-01`, last);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

function interpolateMonthlyMap(series: Array<{ time: string; value: number }>): Map<string, number> {
  const result = new Map<string, number>();
  if (!series.length) return result;
  const sorted = [...series].sort((a, b) => a.time.localeCompare(b.time));
  const byMonth = new Map<string, number>();
  for (const pt of sorted) byMonth.set(pt.time.slice(0, 7), pt.value);
  const keys = [...byMonth.keys()].sort();
  const toIdx = (k: string) => { const [y, m2] = k.split("-").map(Number); return y * 12 + (m2 - 1); };
  const idxs = keys.map(toIdx);
  const first = keys[0], last2 = keys[keys.length - 1];
  let [py, pm] = first.split("-").map(Number);
  const [ey, em] = last2.split("-").map(Number);
  let gi = 0;
  while (py < ey || (py === ey && pm <= em)) {
    const key = `${py.toString().padStart(4, "0")}-${pm.toString().padStart(2, "0")}`;
    const si = toIdx(key);
    while (gi + 1 < idxs.length && idxs[gi + 1] <= si) gi++;
    let val: number;
    if (si === idxs[gi]) val = byMonth.get(keys[gi])!;
    else if (gi + 1 < idxs.length) {
      const i0 = idxs[gi], i1 = idxs[gi + 1];
      const v0 = byMonth.get(keys[gi])!, v1 = byMonth.get(keys[gi + 1])!;
      val = v0 + (v1 - v0) * (si - i0) / (i1 - i0);
    } else val = byMonth.get(keys[gi])!;
    result.set(`${key}-01`, val);
    pm++;
    if (pm > 12) { pm = 1; py++; }
  }
  return result;
}

function computeYoYMap(m: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [k, v] of m.entries()) {
    const [yr, mo] = k.split("-");
    const prevKey = `${parseInt(yr) - 1}-${mo}-01`;
    const prev = m.get(prevKey);
    if (prev !== undefined && prev !== 0) result.set(k, (v - prev) / prev * 100);
  }
  return result;
}

function computeNMonthDelta(m: Map<string, number>, n: number): Map<string, number> {
  const keys = [...m.keys()].sort();
  const result = new Map<string, number>();
  for (let i = n; i < keys.length; i++) {
    result.set(keys[i], m.get(keys[i])! - m.get(keys[i - n])!);
  }
  return result;
}

function classifyRegime(growthDelta: number, inflationDelta: number): CoarseRegime {
  const gRising = growthDelta > 0, iRising = inflationDelta > 0;
  if (gRising && iRising) return "REFLATION";
  if (gRising && !iRising) return "GOLDILOCKS";
  if (!gRising && iRising) return "STAGFLATION";
  return "DEFLATION";
}

function smoothRegimeArray<T>(arr: T[], minConfirmMonths: number): T[] {
  if (arr.length === 0) return [];
  if (minConfirmMonths <= 1) return [...arr];
  const out = new Array<T>(arr.length);
  let current = arr[0], pending: T | null = null, pendingCount = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v === current) { pending = null; pendingCount = 0; }
    else if (v === pending) {
      pendingCount++;
      if (pendingCount >= minConfirmMonths) { current = pending!; pending = null; pendingCount = 0; }
    } else { pending = v; pendingCount = 1; }
    out[i] = current;
  }
  return out;
}

function computeIntensityCutoff(values: number[]): number {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return 0;
  const sorted = [...finite].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.6);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function buildGranularRegime(base: CoarseRegime, intensity: number, cutoff: number): GranularRegime {
  return `${intensity >= cutoff ? "STRONG" : "MILD"}_${base}` as GranularRegime;
}

function computeRegimes(
  data: {
    gdp: Array<{ time: string; value: number }>;
    cpi: Array<{ time: string; value: number }>;
    fedFunds?: Array<{ time: string; value: number }>;
    ust10y?: Array<{ time: string; value: number }>;
    hyOAS?: Array<{ time: string; value: number }>;
    igOAS?: Array<{ time: string; value: number }>;
    gdpNow?: Array<{ time: string; value: number }>;
  },
  confirmMonths = 3
): RegimeResult {
  const gdpSorted = [...data.gdp].filter(d => Number.isFinite(d.value)).sort((a, b) => a.time.localeCompare(b.time));
  const lastGdp = gdpSorted[gdpSorted.length - 1];
  const lastOfficialGDPDate = lastGdp?.time;

  let nowcast: NowcastInfo | undefined;
  let augmentedGdp = data.gdp;
  if (data.gdpNow && data.gdpNow.length > 0 && lastGdp) {
    const nowSorted = [...data.gdpNow].filter(d => Number.isFinite(d.value)).sort((a, b) => a.time.localeCompare(b.time));
    const latestNow = nowSorted[nowSorted.length - 1];
    if (latestNow && latestNow.time > lastGdp.time) {
      const levelB = lastGdp.value * Math.pow(1 + latestNow.value / 100, 0.25);
      nowcast = { date: latestNow.time, valueSAAR: latestNow.value, valueLevelB: levelB };
      augmentedGdp = [...data.gdp, { time: latestNow.time, value: levelB }];
    }
  }

  const gdpMap = interpolateMonthlyMap(augmentedGdp);
  const cpiMap = forwardFillMonthlyMap(data.cpi);
  const gdpYoY = computeYoYMap(gdpMap);
  const cpiYoY = computeYoYMap(cpiMap);
  const gdpDelta = computeNMonthDelta(gdpYoY, 6);
  const cpiDelta = computeNMonthDelta(cpiYoY, 6);
  const fedFundsMap = data.fedFunds ? forwardFillMonthlyMap(data.fedFunds) : new Map<string, number>();
  const ust10yMap = data.ust10y ? forwardFillMonthlyMap(data.ust10y) : new Map<string, number>();
  const hyOASMap = data.hyOAS ? forwardFillMonthlyMap(data.hyOAS) : new Map<string, number>();
  const igOASMap = data.igOAS ? forwardFillMonthlyMap(data.igOAS) : new Map<string, number>();

  const commonDates = [...gdpDelta.keys()].filter(d => cpiDelta.has(d)).sort();
  const rawData = commonDates.map(date => {
    const gd = gdpDelta.get(date)!;
    const id = cpiDelta.get(date)!;
    return {
      date,
      gd,
      id,
      base: classifyRegime(gd, id),
      intensity: Math.max(Math.abs(gd), Math.abs(id)),
    };
  });

  const cutoff = computeIntensityCutoff(rawData.map(d => d.intensity));
  const rawCoarse = rawData.map(d => d.base);
  const rawGranular = rawData.map(d => buildGranularRegime(d.base, d.intensity, cutoff));
  const smoothedGranularArr = smoothRegimeArray(rawGranular, Math.max(1, confirmMonths));
  const smoothedCoarseArr = smoothedGranularArr.map(toCoarseRegime);

  const classifications: RegimeClassification[] = rawData.map((d, i) => ({
    month: d.date,
    rawRegime: rawCoarse[i],
    smoothedRegime: smoothedCoarseArr[i],
    rawGranular: rawGranular[i],
    smoothedGranular: smoothedGranularArr[i],
    intensity: d.intensity,
    growthYoY: gdpYoY.get(d.date) ?? NaN,
    growthDelta: d.gd,
    inflationYoY: cpiYoY.get(d.date) ?? NaN,
    inflationDelta: d.id,
    fedFunds: fedFundsMap.get(d.date),
    ust10y: ust10yMap.get(d.date),
    hyOAS: hyOASMap.get(d.date),
    igOAS: igOASMap.get(d.date),
  }));

  // Build coarse episodes
  const episodes: RegimeEpisode[] = [];
  if (classifications.length > 0) {
    let epStart = classifications[0].month, epRegime = classifications[0].smoothedRegime;
    for (let i = 1; i < classifications.length; i++) {
      if (classifications[i].smoothedRegime !== epRegime) {
        episodes.push({ start: epStart, end: classifications[i - 1].month, regime: epRegime });
        epStart = classifications[i].month; epRegime = classifications[i].smoothedRegime;
      }
    }
    episodes.push({ start: epStart, end: classifications[classifications.length - 1].month, regime: epRegime });
  }

  // Build granular episodes
  const granularEpisodes: RegimeEpisode[] = [];
  if (classifications.length > 0) {
    let epStart = classifications[0].month, epRegime = classifications[0].smoothedGranular;
    for (let i = 1; i < classifications.length; i++) {
      if (classifications[i].smoothedGranular !== epRegime) {
        granularEpisodes.push({ start: epStart, end: classifications[i - 1].month, regime: epRegime });
        epStart = classifications[i].month; epRegime = classifications[i].smoothedGranular;
      }
    }
    granularEpisodes.push({ start: epStart, end: classifications[classifications.length - 1].month, regime: epRegime });
  }

  return { classifications, episodes, granularEpisodes, intensityCutoff: cutoff, lastOfficialGDPDate, nowcast };
}

function computeTickerRegimeStats(
  ticker: string,
  closeSeries: Array<{ time: string; value: number }>,
  classifications: RegimeClassification[],
  minObs = 6
): TickerRegimeStat[] {
  const monthToClose = new Map<string, number>();
  for (const pt of closeSeries) {
    if (Number.isFinite(pt.value) && pt.value > 0) monthToClose.set(pt.time.slice(0, 7), pt.value);
  }
  const prev = (m: Map<string, number>, k: string) => {
    const arr = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const idx = arr.findIndex(([key]) => key === k);
    return idx > 0 ? arr[idx - 1][1] : undefined;
  };
  const byRegime: Record<CoarseRegime, number[]> = { GOLDILOCKS: [], REFLATION: [], STAGFLATION: [], DEFLATION: [] };
  for (const cls of classifications) {
    const mo = cls.month.slice(0, 7);
    const cur = monthToClose.get(mo);
    if (cur !== undefined && Number.isFinite(cur)) {
      const pv = prev(monthToClose, mo);
      if (pv && pv > 0) byRegime[cls.smoothedRegime].push((cur / pv - 1) * 100);
    }
  }
  const stats: TickerRegimeStat[] = [];
  for (const [regime, returns] of Object.entries(byRegime) as [CoarseRegime, number[]][]) {
    if (returns.length < minObs) continue;
    const avg = returns.reduce((s, v) => s + v, 0) / returns.length;
    const variance = returns.reduce((s, v) => s + (v - avg) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const totalReturn = (returns.reduce((s, v) => s * (1 + v / 100), 1) - 1) * 100;
    const geoMonthly = Math.pow(1 + totalReturn / 100, 1 / returns.length) - 1;
    const annualizedReturn = (Math.pow(1 + geoMonthly, 12) - 1) * 100;
    const annVol = stdDev * Math.sqrt(12);
    const sharpe = annVol > 0 ? (annualizedReturn - 2) / annVol : 0;
    const hitRate = returns.filter(v => v >= 0).length / returns.length * 100;
    stats.push({ ticker, regime, monthsObserved: returns.length, annualizedReturn, hitRate, sharpe, totalReturn });
  }
  return stats;
}

function aggregateByRegime(stats: TickerRegimeStat[]): Record<CoarseRegime, AggregateRegimeStat> {
  const byRegime: Record<string, TickerRegimeStat[]> = { GOLDILOCKS: [], REFLATION: [], STAGFLATION: [], DEFLATION: [] };
  for (const s of stats) byRegime[s.regime].push(s);
  const result: Record<string, AggregateRegimeStat> = {};
  for (const [regime, arr] of Object.entries(byRegime)) {
    if (!arr.length) { result[regime] = { avgAnnReturn: NaN, avgHitRate: NaN, avgSharpe: NaN, nTickers: 0 }; continue; }
    result[regime] = {
      avgAnnReturn: arr.reduce((s, v) => s + v.annualizedReturn, 0) / arr.length,
      avgHitRate: arr.reduce((s, v) => s + v.hitRate, 0) / arr.length,
      avgSharpe: arr.reduce((s, v) => s + v.sharpe, 0) / arr.length,
      nTickers: arr.length,
    };
  }
  return result as Record<CoarseRegime, AggregateRegimeStat>;
}

function computeTransitions(
  growthDelta: number,
  inflationDelta: number,
  currentFamily?: CoarseRegime
): RegimeTransition[] {
  const current = currentFamily ?? classifyRegime(growthDelta, inflationDelta);
  const quadrantMeta: Record<CoarseRegime, { g: 1 | -1; i: 1 | -1 }> = {
    GOLDILOCKS: { g: 1, i: -1 },
    REFLATION: { g: 1, i: 1 },
    STAGFLATION: { g: -1, i: 1 },
    DEFLATION: { g: -1, i: -1 },
  };
  const transitions: RegimeTransition[] = [];
  for (const to of COARSE_ORDER) {
    if (to === current) continue;
    const meta = quadrantMeta[to];
    let gMove = 0;
    if (meta.g === 1 && growthDelta <= 0) gMove = -growthDelta;
    else if (meta.g === -1 && growthDelta >= 0) gMove = -growthDelta;
    let iMove = 0;
    if (meta.i === 1 && inflationDelta <= 0) iMove = -inflationDelta;
    else if (meta.i === -1 && inflationDelta >= 0) iMove = -inflationDelta;
    const gAbs = Math.abs(gMove), iAbs = Math.abs(iMove);
    const driver: "growth" | "inflation" = (gMove === 0 && iMove !== 0) ? "inflation"
      : (iMove === 0 && gMove !== 0) ? "growth"
      : (gAbs <= iAbs) ? "growth" : "inflation";
    const minMove = driver === "growth" ? gAbs : iAbs;
    transitions.push({ to, growthMove: gMove, inflationMove: iMove, minMove, driver });
  }
  return transitions.sort((a, b) => a.minMove - b.minMove);
}

const fmtNum = (v: number, dp = 2) => Number.isFinite(v) ? v.toFixed(dp) : "—";
const fmtPct = (v: number, dp = 1) => Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%` : "—";

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
}

function StatCard({ label, value, delta, deltaSuffix }: StatCardProps) {
  const trend = delta == null || !Number.isFinite(delta) ? "flat" : delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat";
  const Icon = trend === "up" ? SortAsc : trend === "down" ? SortDesc : Minus;
  const colorClass = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground";
  return (
    <div className="rounded-md p-3 border border-border bg-card">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-bold font-mono mt-0.5" data-testid={`readout-${label.toLowerCase().replace(/\s+/g, "-")}`}>
        {value}
      </div>
      {delta !== undefined && Number.isFinite(delta) && (
        <div className={`text-[11px] font-mono flex items-center gap-1 mt-0.5 ${colorClass}`}>
          <Icon className="w-3 h-3" />
          {(delta >= 0 ? "+" : "") + delta.toFixed(2)}
          {deltaSuffix && <span className="text-muted-foreground ml-0.5">{deltaSuffix}</span>}
        </div>
      )}
    </div>
  );
}

interface StatCellProps { label: string; value: string }
function StatCell({ label, value }: StatCellProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

interface GaugeMoveInfo {
  kind: "growth" | "inflation";
  moveSigned: number;
  moveAbs: number;
  currentValue: number;
  targetValue: number;
  direction: "rise" | "fall" | "hold";
  label: string;
}

function buildMoveInfo(kind: "growth" | "inflation", moveSigned: number, currentValue: number): GaugeMoveInfo {
  return {
    kind, moveSigned, moveAbs: Math.abs(moveSigned), currentValue,
    targetValue: currentValue + moveSigned,
    direction: moveSigned > 0 ? "rise" : moveSigned < 0 ? "fall" : "hold",
    label: kind === "growth" ? "Growth Δ" : "Inflation Δ",
  };
}

interface GaugeBarProps {
  kind: string;
  currentValue: number;
  moveSigned: number;
  domain: number;
  color: string;
}

function GaugeBar({ kind, currentValue, moveSigned, domain, color }: GaugeBarProps) {
  const toX = (v: number) => (Math.max(-domain, Math.min(domain, v)) + domain) / (2 * domain) * 100;
  const moveAbs = Math.abs(moveSigned);
  const dir = moveSigned > 0 ? "rise" : moveSigned < 0 ? "fall" : "hold";
  const cx = toX(currentValue), zeroX = toX(0);
  const barLeft = Math.min(cx, zeroX), barWidth = Math.max(cx, zeroX) - Math.min(cx, zeroX);
  const label = kind === "growth" ? "Growth Δ" : "Inflation Δ";
  const stateText = currentValue > 0 ? "rising" : currentValue < 0 ? "falling" : "flat";
  const desc = moveAbs === 0
    ? `${label} already on the right side (${currentValue.toFixed(2)}pp, ${stateText})`
    : `${label}: ${currentValue.toFixed(2)}pp → needs to ${dir} ${moveAbs.toFixed(2)}pp → 0.00pp`;
  return (
    <div>
      <div className="relative h-4 rounded-sm bg-secondary/60 overflow-hidden">
        {moveAbs > 0 && (
          <div className="absolute top-0 bottom-0 opacity-45" style={{ left: `${barLeft}%`, width: `${barWidth}%`, background: color }} />
        )}
        <div className="absolute top-0 bottom-0 w-px bg-foreground/60" style={{ left: `${zeroX}%` }} title="Regime boundary (0pp)" />
        <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-background" style={{ left: `calc(${cx}% - 5px)`, background: color }} title={`Current ${label} = ${currentValue.toFixed(2)}pp`} />
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] font-mono text-muted-foreground pointer-events-none">{(-domain).toFixed(1)}</span>
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] font-mono text-muted-foreground pointer-events-none">+{domain.toFixed(1)}</span>
      </div>
      <div className="text-[10.5px] font-mono text-foreground/85 mt-1 leading-snug">{desc}</div>
    </div>
  );
}

interface TransitionPanelProps {
  transitions: RegimeTransition[];
  growthDelta: number;
  inflationDelta: number;
}

function TransitionPanel({ transitions, growthDelta, inflationDelta }: TransitionPanelProps) {
  const domain = Math.max(1, Math.abs(growthDelta) * 1.4, Math.abs(inflationDelta) * 1.4, ...transitions.map(t => Math.abs(t.growthMove)), ...transitions.map(t => Math.abs(t.inflationMove)));
  return (
    <div className="space-y-3">
      {transitions.map(t => {
        const meta = COARSE_META[t.to];
        const primaryInfo = buildMoveInfo(t.driver, t.driver === "growth" ? t.growthMove : t.inflationMove, t.driver === "growth" ? growthDelta : inflationDelta);
        const secondaryDriver = t.driver === "growth" ? "inflation" : "growth";
        const secondaryMove = t.driver === "growth" ? t.inflationMove : t.growthMove;
        const secondaryInfo = Math.abs(secondaryMove) > 0 ? buildMoveInfo(secondaryDriver, secondaryMove, t.driver === "growth" ? inflationDelta : growthDelta) : null;
        const distText = primaryInfo.moveAbs === 0 && (!secondaryInfo || secondaryInfo.moveAbs === 0)
          ? "at the boundary right now"
          : `${primaryInfo.moveAbs.toFixed(2)}pp away${secondaryInfo ? " (plus inflation flip)" : ""}`;
        return (
          <div key={t.to} data-testid={`gauge-${t.to.toLowerCase()}`} className="rounded-md border bg-card p-2.5" style={{ borderColor: meta.color + "55" }}>
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: meta.color }} />
                <span className="text-[12px] font-semibold" style={{ color: meta.color }}>Flip to {meta.label}</span>
              </span>
              <span className="text-[11px] font-mono font-semibold" style={{ color: primaryInfo.moveAbs === 0 ? undefined : meta.color }}>{distText}</span>
            </div>
            <GaugeBar kind={primaryInfo.kind} currentValue={primaryInfo.currentValue} moveSigned={primaryInfo.moveSigned} domain={domain} color={meta.color} />
            {secondaryInfo && (
              <div className="mt-2">
                <div className="text-[10px] text-muted-foreground mb-0.5 italic">and also…</div>
                <GaugeBar kind={secondaryInfo.kind} currentValue={secondaryInfo.currentValue} moveSigned={secondaryInfo.moveSigned} domain={domain} color={meta.color} />
              </div>
            )}
          </div>
        );
      })}
      <div className="text-[10px] text-muted-foreground leading-snug pt-1">
        Each bar tracks the 6-month change in YoY (Δ). The vertical line at 0pp is the regime boundary — cross it and the family flips. "Distance" is how many percentage points the signal still needs to travel.
      </div>
    </div>
  );
}

interface TrajectoryScatterProps {
  trajectory: RegimeClassification[];
  intensityCutoff: number;
}

function arrowheadPoints(x1: number, y1: number, x2: number, y2: number, size: number): string {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const tip = { x: x2, y: y2 };
  const left = { x: x2 - ux * size + px * (size / 2), y: y2 - uy * size + py * (size / 2) };
  const right = { x: x2 - ux * size - px * (size / 2), y: y2 - uy * size - py * (size / 2) };
  return `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

function TrajectoryScatter({ trajectory, intensityCutoff }: TrajectoryScatterProps) {
  const gDeltas = trajectory.map(c => c.growthDelta);
  const iDeltas = trajectory.map(c => c.inflationDelta);
  const maxVal = Math.max(1.5, intensityCutoff * 1.5, ...gDeltas.map(Math.abs), ...iDeltas.map(Math.abs));
  const toSvgX = (v: number) => 28 + (v + maxVal) / (2 * maxVal) * 264;
  const toSvgY = (v: number) => 292 - (v + maxVal) / (2 * maxVal) * 264;
  const cx = toSvgX(0), cy = toSvgY(0);
  const strongX = toSvgX(intensityCutoff), weakX = toSvgX(-intensityCutoff);
  const strongY = toSvgY(intensityCutoff), weakY = toSvgY(-intensityCutoff);
  const points = trajectory.map(c => ({
    x: toSvgX(c.growthDelta),
    y: toSvgY(c.inflationDelta),
    month: c.month,
    smoothed: c.smoothedGranular,
    rawFamily: c.rawRegime,
  }));
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const lastMeta = last ? GRANULAR_META[last.smoothed] : null;
  const lastFamily = last ? toCoarseRegime(last.smoothed) : null;
  const lastRawFamily = last?.rawFamily ?? null;
  const familyMismatch = lastFamily !== null && lastRawFamily !== null && lastFamily !== lastRawFamily;

  interface QuadRectProps { x1: number; y1: number; x2: number; y2: number; fill: string }
  function QuadRect({ x1, y1, x2, y2, fill }: QuadRectProps) {
    const x = Math.min(x1, x2), y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    if (w <= 0 || h <= 0) return null;
    return <rect x={x} y={y} width={w} height={h} fill={fill} />;
  }

  return (
    <div className="rounded-md border border-border bg-card p-2 h-full">
      <div className="flex items-center gap-2 px-1 mb-1">
        <span className="text-xs font-semibold">Trajectory (last 24m)</span>
        <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1">
          <Info className="w-3 h-3" />Δ GDP YoY × Δ CPI YoY (6m)
        </span>
      </div>
      <svg viewBox="0 0 320 320" className="w-full max-h-[360px]" data-testid="quadrant-scatter">
        <QuadRect x1={cx} y1={cy} x2={strongX} y2={weakY} fill={GRANULAR_META.MILD_GOLDILOCKS.bg} />
        <QuadRect x1={strongX} y1={cy} x2={292} y2={292} fill={GRANULAR_META.STRONG_GOLDILOCKS.bg} />
        <QuadRect x1={cx} y1={weakY} x2={strongX} y2={292} fill={GRANULAR_META.STRONG_GOLDILOCKS.bg} />
        <QuadRect x1={cx} y1={strongY} x2={strongX} y2={cy} fill={GRANULAR_META.MILD_REFLATION.bg} />
        <QuadRect x1={strongX} y1={28} x2={292} y2={cy} fill={GRANULAR_META.STRONG_REFLATION.bg} />
        <QuadRect x1={cx} y1={28} x2={strongX} y2={strongY} fill={GRANULAR_META.STRONG_REFLATION.bg} />
        <QuadRect x1={weakX} y1={strongY} x2={cx} y2={cy} fill={GRANULAR_META.MILD_STAGFLATION.bg} />
        <QuadRect x1={28} y1={28} x2={weakX} y2={cy} fill={GRANULAR_META.STRONG_STAGFLATION.bg} />
        <QuadRect x1={weakX} y1={28} x2={cx} y2={strongY} fill={GRANULAR_META.STRONG_STAGFLATION.bg} />
        <QuadRect x1={weakX} y1={cy} x2={cx} y2={weakY} fill={GRANULAR_META.MILD_DEFLATION.bg} />
        <QuadRect x1={28} y1={cy} x2={weakX} y2={292} fill={GRANULAR_META.STRONG_DEFLATION.bg} />
        <QuadRect x1={weakX} y1={weakY} x2={cx} y2={292} fill={GRANULAR_META.STRONG_DEFLATION.bg} />
        <line x1={28} y1={cy} x2={292} y2={cy} stroke="rgba(148,163,184,0.6)" strokeWidth={1} />
        <line x1={cx} y1={28} x2={cx} y2={292} stroke="rgba(148,163,184,0.6)" strokeWidth={1} />
        <line x1={strongX} y1={28} x2={strongX} y2={292} stroke="rgba(148,163,184,0.25)" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={weakX} y1={28} x2={weakX} y2={292} stroke="rgba(148,163,184,0.25)" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={28} y1={strongY} x2={292} y2={strongY} stroke="rgba(148,163,184,0.25)" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={28} y1={weakY} x2={292} y2={weakY} stroke="rgba(148,163,184,0.25)" strokeWidth={1} strokeDasharray="3 3" />
        <text x={288} y={40} textAnchor="end" fontSize="9" fill={COARSE_META.REFLATION.color} fontWeight="600">REFLATION</text>
        <text x={32} y={40} textAnchor="start" fontSize="9" fill={COARSE_META.STAGFLATION.color} fontWeight="600">STAGFLATION</text>
        <text x={288} y={286} textAnchor="end" fontSize="9" fill={COARSE_META.GOLDILOCKS.color} fontWeight="600">GOLDILOCKS</text>
        <text x={32} y={286} textAnchor="start" fontSize="9" fill={COARSE_META.DEFLATION.color} fontWeight="600">DEFLATION</text>
        <text x={292} y={cy - 3} textAnchor="end" fontSize="8" fill="#94a3b8">+Δ GDP YoY</text>
        <text x={cx + 4} y={36} textAnchor="start" fontSize="8" fill="#94a3b8">+Δ CPI YoY</text>
        <text x={cx - 4} y={cy + 12} textAnchor="end" fontSize="8" fill="#94a3b8">0</text>
        {points.slice(1).map((p, i) => {
          const prevPt = points[i];
          const op = 0.15 + 0.85 * (i + 1) / points.length;
          return <line key={`seg-${i}`} x1={prevPt.x} y1={prevPt.y} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth={1.5} strokeOpacity={op} />;
        })}
        {points.map((p, i) => {
          const op = 0.35 + 0.65 * (i + 1) / points.length;
          const isLast = i === points.length - 1;
          const color = GRANULAR_META[p.smoothed].color;
          return <circle key={`pt-${i}`} cx={p.x} cy={p.y} r={isLast ? 6 : 3} fill={color} fillOpacity={op} stroke={isLast ? "#0f172a" : "none"} strokeWidth={isLast ? 2 : 0} />;
        })}
        {prev && last && (
          <polygon points={arrowheadPoints(prev.x, prev.y, last.x, last.y, 8)} fill="#fff" />
        )}
        {points.length > 0 && (
          <text x={points[0].x + 6} y={points[0].y + 3} fontSize="8" fill="#64748b">{points[0].month.slice(0, 7)}</text>
        )}
        {last && (
          <text x={last.x + 8} y={last.y + 3} fontSize="9" fill={lastMeta?.color ?? "#fff"} fontWeight="700" data-testid="quadrant-current-label">{trajectory[trajectory.length - 1].month.slice(0, 7)}</text>
        )}
      </svg>
      <div className="text-[10px] text-muted-foreground px-1 mt-1 leading-tight">
        Dashed lines = Mild/Strong threshold (±{intensityCutoff.toFixed(2)}pp). Solid axes = regime boundaries.
        {familyMismatch && lastFamily && lastRawFamily && (
          <span className="block mt-0.5 text-amber-400/80">
            Latest raw point sits in {lastRawFamily.toLowerCase()} territory; smoothed regime is still {lastFamily.toLowerCase()} (awaiting confirmation).
          </span>
        )}
      </div>
    </div>
  );
}

interface RegimeTimelineProps {
  classifications: RegimeClassification[];
  episodes: RegimeEpisode[];
  granularEpisodes: RegimeEpisode[];
  shading: "coarse" | "granular";
}

function RegimeTimeline({ classifications, episodes, granularEpisodes, shading }: RegimeTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{ bands: ISeriesApi<"Area">[]; growth?: ISeriesApi<"Line">; inflation?: ISeriesApi<"Line"> }>({ bands: [] });

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)" },
        horzLines: { color: "rgba(148,163,184,0.08)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.2)" },
      timeScale: { borderColor: "rgba(148,163,184,0.2)", rightOffset: 5 },
      autoSize: true,
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = { bands: [] };
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || classifications.length === 0) return;
    if (seriesRef.current.growth) chart.removeSeries(seriesRef.current.growth);
    if (seriesRef.current.inflation) chart.removeSeries(seriesRef.current.inflation);
    for (const b of seriesRef.current.bands) chart.removeSeries(b);
    seriesRef.current = { bands: [] };

    const allVals = classifications.flatMap(c => [c.growthYoY, c.inflationYoY]);
    const lo = Math.min(-2, ...allVals.filter(Number.isFinite));
    const hi = Math.max(10, ...allVals.filter(Number.isFinite));
    const bandDefs = shading === "coarse"
      ? episodes.map(ep => ({ start: ep.start, end: ep.end, bg: COARSE_META[ep.regime as CoarseRegime].bg }))
      : granularEpisodes.map(ep => ({ start: ep.start, end: ep.end, bg: GRANULAR_META[ep.regime as GranularRegime].bg }));

    for (const def of bandDefs) {
      const start = def.start;
      const end = def.end;
      const months = classifications.filter(c => c.month >= start && c.month <= end).map(c => c.month);
      if (months.length === 0) continue;
      const bandData = months.map(m => ({ time: m, value: hi }));
      const bandSeries = chart.addSeries(AreaSeries, {
        topColor: def.bg,
        bottomColor: def.bg,
        lineColor: "transparent",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      (bandSeries as ISeriesApi<"Area">).setData(bandData as never);
      bandSeries.priceScale().applyOptions({ autoScale: false });
      seriesRef.current.bands.push(bandSeries as ISeriesApi<"Area">);
    }

    const growthSeries = chart.addSeries(LineSeries, {
      color: "#10b981",
      lineWidth: 2,
      title: "",
      priceLineVisible: false,
      lastValueVisible: true,
    });
    growthSeries.setData(classifications.filter(c => Number.isFinite(c.growthYoY)).map(c => ({ time: c.month, value: c.growthYoY })) as never);
    seriesRef.current.growth = growthSeries as ISeriesApi<"Line">;

    const inflationSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 2,
      title: "",
      priceLineVisible: false,
      lastValueVisible: true,
    });
    inflationSeries.setData(classifications.filter(c => Number.isFinite(c.inflationYoY)).map(c => ({ time: c.month, value: c.inflationYoY })) as never);
    seriesRef.current.inflation = inflationSeries as ISeriesApi<"Line">;
    chart.priceScale("right").applyOptions({ autoScale: false, mode: 0 });

    const scaleSeries = chart.addSeries(LineSeries, {
      color: "transparent",
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const span = hi - lo;
    const bounds = { lo: lo - 0.05 * span, hi: hi + 0.05 * span };
    scaleSeries.setData([
      { time: classifications[0].month, value: bounds.lo },
      { time: classifications[classifications.length - 1].month, value: bounds.hi },
    ] as never);
    seriesRef.current.bands.push(scaleSeries as unknown as ISeriesApi<"Area">);
    chart.timeScale().fitContent();
  }, [classifications, episodes, granularEpisodes, shading]);

  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="flex items-center gap-3 px-1 mb-1">
        <span className="text-xs font-semibold">Regime timeline</span>
        <span className="flex items-center gap-1.5 text-[11px]">
          <span className="inline-block w-3 h-0.5 bg-emerald-500" />GDP YoY
        </span>
        <span className="flex items-center gap-1.5 text-[11px]">
          <span className="inline-block w-3 h-0.5 bg-amber-500" />CPI YoY
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1">
          <Info className="w-3 h-3" />Background shading = smoothed regime
        </span>
      </div>
      <div ref={containerRef} className="w-full h-[360px]" />
    </div>
  );
}

interface PerTickerTableProps {
  rows: Array<{ ticker: string; byR: Record<string, TickerRegimeStat | undefined> }>;
  sortColumn: string;
  sortDir: "asc" | "desc";
  onSort: (col: string) => void;
}

interface SortableHeaderProps {
  label: string;
  column: string;
  sortColumn: string;
  sortDir: "asc" | "desc";
  onSort: (col: string) => void;
  className?: string;
  align?: "left" | "center" | "right";
  testId?: string;
}

function SortableHeader({ label, column, sortColumn, sortDir, onSort, className = "", align = "right", testId }: SortableHeaderProps) {
  const active = sortColumn === column;
  const Icon = active ? (sortDir === "asc" ? SortAsc : SortDesc) : ArrowUpDown;
  const justify = align === "left" ? "justify-start" : align === "center" ? "justify-center" : "justify-end";
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`w-full inline-flex items-center gap-1 ${justify} cursor-pointer select-none transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"} ${className}`}
      data-testid={testId}
      title={`Sort by ${label}`}
    >
      <span>{label}</span>
      <Icon className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`} />
    </button>
  );
}

function PerTickerTable({ rows, sortColumn, sortDir, onSort }: PerTickerTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
        No ticker data yet — adjust your Universe filter or wait for prices to load.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs font-mono">
          <thead className="bg-card sticky top-0 z-10">
            <tr className="border-b border-border">
              <th className="text-left px-2 py-1.5 sticky left-0 bg-card" rowSpan={2}>
                <SortableHeader label="Ticker" column="ticker" sortColumn={sortColumn} sortDir={sortDir} onSort={onSort} align="left" testId="sort-header-ticker" />
              </th>
              {COARSE_ORDER.map(r => (
                <th key={r} colSpan={3} className="text-center px-2 py-1.5 border-l border-border" style={{ color: COARSE_META[r].color }}>{COARSE_META[r].label}</th>
              ))}
            </tr>
            <tr className="border-b border-border bg-card text-[10px]">
              {COARSE_ORDER.map(r => (
                <Fragment key={r + "-headers"}>
                  <th className="px-1.5 py-1 border-l border-border">
                    <SortableHeader label="Ann Ret" column={`${r}:annReturn`} sortColumn={sortColumn} sortDir={sortDir} onSort={onSort} testId={`sort-header-${r.toLowerCase()}-annreturn`} />
                  </th>
                  <th className="px-1.5 py-1">
                    <SortableHeader label="Hit %" column={`${r}:hitRate`} sortColumn={sortColumn} sortDir={sortDir} onSort={onSort} testId={`sort-header-${r.toLowerCase()}-hitrate`} />
                  </th>
                  <th className="px-1.5 py-1">
                    <SortableHeader label="Sharpe" column={`${r}:sharpe`} sortColumn={sortColumn} sortDir={sortDir} onSort={onSort} testId={`sort-header-${r.toLowerCase()}-sharpe`} />
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ticker, byR }) => (
              <tr key={ticker} className="border-b border-border/50 hover:bg-accent/50">
                <td className="px-2 py-1 sticky left-0 bg-background font-semibold">{ticker}</td>
                {COARSE_ORDER.map(r => {
                  const s = byR[r];
                  return (
                    <Fragment key={r}>
                      <td className="px-1.5 py-1 text-right border-l border-border" style={{ color: s ? (s.annualizedReturn >= 0 ? "#34d399" : "#f87171") : "#475569" }}>{s ? fmtPct(s.annualizedReturn) : "—"}</td>
                      <td className="px-1.5 py-1 text-right text-muted-foreground">{s ? `${s.hitRate.toFixed(0)}%` : "—"}</td>
                      <td className="px-1.5 py-1 text-right text-muted-foreground">{s ? fmtNum(s.sharpe) : "—"}</td>
                    </Fragment>
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MacroRegime() {
  const { universeTickers, filteredTickersList, isFiltered, totalCount } = useAppContext();
  const [confirmMonths, setConfirmMonths] = useState(3);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingTickers, setLoadingTickers] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [classifications, setClassifications] = useState<RegimeClassification[]>([]);
  const [tickerStats, setTickerStats] = useState<TickerRegimeStat[]>([]);
  const [episodes, setEpisodes] = useState<RegimeEpisode[]>([]);
  const [granularEpisodes, setGranularEpisodes] = useState<RegimeEpisode[]>([]);
  const [intensityCutoff, setIntensityCutoff] = useState(0);
  const [macroMeta, setMacroMeta] = useState<{ lastOfficialGDPDate?: string; nowcast?: NowcastInfo }>({});
  const [shading, setShading] = useState<"coarse" | "granular">("granular");
  const [sortColumn, setSortColumn] = useState("GOLDILOCKS:annReturn");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(col: string) {
    if (sortColumn === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortColumn(col); setSortDir(col === "ticker" ? "asc" : "desc"); }
  }

  // Load macro series
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const data = await fetchMacroSeriesBatch(["GDPC1", "CPIAUCSL", "FEDFUNDS", "DGS10", "BAMLH0A0HYM2", "BAMLC0A0CM", "GDPNOW"]);
        if (cancelled) return;
        const result = computeRegimes({
          gdp: data.GDPC1?.data ?? [],
          cpi: data.CPIAUCSL?.data ?? [],
          fedFunds: data.FEDFUNDS?.data ?? [],
          ust10y: data.DGS10?.data ?? [],
          hyOAS: data.BAMLH0A0HYM2?.data ?? [],
          igOAS: data.BAMLC0A0CM?.data ?? [],
          gdpNow: data.GDPNOW?.data ?? [],
        }, confirmMonths);
        setClassifications(result.classifications);
        setEpisodes(result.episodes);
        setGranularEpisodes(result.granularEpisodes);
        setIntensityCutoff(result.intensityCutoff);
        setMacroMeta({ lastOfficialGDPDate: result.lastOfficialGDPDate, nowcast: result.nowcast });
      } catch (err) {
        console.error("[MacroRegime] failed to load macro:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [confirmMonths, refreshKey]);

  // Determine ticker universe
  const tickers = useMemo(() => {
    if (universeTickers && universeTickers.size > 0) return [...universeTickers];
    return filteredTickersList.map(t => t.ticker);
  }, [universeTickers, filteredTickersList]);

  // Load per-ticker stats
  useEffect(() => {
    if (!classifications.length || !tickers.length) { setTickerStats([]); return; }
    let cancelled = false;
    setLoadingTickers(true);
    (async () => {
      const results: TickerRegimeStat[] = [];
      for (let i = 0; i < tickers.length; i += 20) {
        if (cancelled) return;
        const batch = tickers.slice(i, i + 20);
        const batchResults = await Promise.all(batch.map(async (ticker) => {
          try {
            const series = await fetchMetricSeries(ticker, "close");
            return computeTickerRegimeStats(ticker, series, classifications);
          } catch { return []; }
        }));
        for (const r of batchResults) results.push(...r);
        if (!cancelled) setTickerStats([...results]);
      }
      if (!cancelled) setLoadingTickers(false);
    })();
    return () => { cancelled = true; };
  }, [tickers, classifications]);

  const aggregated = useMemo(() => aggregateByRegime(tickerStats), [tickerStats]);

  const lastClassification = classifications[classifications.length - 1];
  const currentCoarse = lastClassification?.smoothedRegime;
  const currentGranular = lastClassification?.smoothedGranular;
  const coarseMeta = currentCoarse ? COARSE_META[currentCoarse] : null;
  const granularMeta = currentGranular ? GRANULAR_META[currentGranular] : null;
  const transitions = useMemo(() => {
    if (!lastClassification) return [];
    return computeTransitions(lastClassification.growthDelta, lastClassification.inflationDelta, toCoarseRegime(lastClassification.smoothedGranular));
  }, [lastClassification]);

  const recentTrajectory = useMemo(() => classifications.slice(-24), [classifications]);

  const sortedRows = useMemo(() => {
    const byTicker = new Map<string, Record<string, TickerRegimeStat>>();
    for (const s of tickerStats) {
      if (!byTicker.has(s.ticker)) byTicker.set(s.ticker, {});
      byTicker.get(s.ticker)![s.regime] = s;
    }
    const rows = [...byTicker.entries()].map(([ticker, byR]) => ({ ticker, byR }));
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortColumn === "ticker") rows.sort((a, b) => a.ticker.localeCompare(b.ticker) * dir);
    else {
      const [regime, metric] = sortColumn.split(":");
      const getValue = (r: Record<string, TickerRegimeStat | undefined>) => {
        const s = r[regime]; if (!s) return NaN;
        return metric === "annReturn" ? s.annualizedReturn : metric === "hitRate" ? s.hitRate : s.sharpe;
      };
      rows.sort((a, b) => {
        const va = getValue(a.byR), vb = getValue(b.byR);
        const naA = !Number.isFinite(va), naB = !Number.isFinite(vb);
        if (naA && naB) return a.ticker.localeCompare(b.ticker);
        if (naA) return 1; if (naB) return -1;
        return (va - vb) * dir;
      });
    }
    return rows;
  }, [tickerStats, sortColumn, sortDir]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <h1 className="text-sm font-semibold">Macro Regime</h1>
        <span className="text-xs text-muted-foreground">Growth × Inflation — 8 sub-regimes (Mild / Strong)</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Shading:</span>
          {(["coarse", "granular"] as const).map(s => (
            <button key={s} onClick={() => setShading(s)} className={`px-2 py-0.5 rounded text-xs font-medium ${shading === s ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`} data-testid={`shading-${s}`}>
              {s === "coarse" ? "4 regimes" : "8 regimes"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Confirmation:</span>
          {[1, 3, 6].map(n => (
            <button key={n} onClick={() => setConfirmMonths(n)} className={`px-2 py-0.5 rounded text-xs font-medium ${confirmMonths === n ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"}`} data-testid={`confirm-${n}m`}>
              {n}m
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRefreshKey(k => k + 1)} data-testid="btn-refresh-regimes">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading macro series…
          </div>
        ) : (
          <>
            {/* Current regime + readouts */}
            <div className="grid grid-cols-12 gap-3 p-3">
              <div className="col-span-12 lg:col-span-4 rounded-lg p-4 border" style={{ borderColor: granularMeta?.color ?? coarseMeta?.color, background: granularMeta?.bg ?? coarseMeta?.bg }} data-testid="card-current-regime">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Regime</div>
                    <div className="text-3xl font-bold mt-1" style={{ color: granularMeta?.color ?? coarseMeta?.color }} data-testid="text-current-regime">
                      {granularMeta?.label ?? coarseMeta?.label ?? "—"}
                    </div>
                    {currentGranular && (
                      <div className="text-[11px] font-medium uppercase tracking-wider mt-0.5 text-muted-foreground" data-testid="text-current-granular">
                        {toIntensity(currentGranular) === "STRONG" ? "Strong" : "Mild"} · family: {coarseMeta?.label}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                      <span>As of {lastClassification?.month ?? "—"}</span>
                      <TooltipProvider>
                        <Tooltip delayDuration={150}>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex items-center text-muted-foreground/70 hover:text-foreground" aria-label="Regime cadence info">
                              <Info className="w-3 h-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                            <div className="font-semibold mb-1">Regime as-of cadence</div>
                            <p className="mb-1.5">The regime classifier uses GDP YoY × CPI YoY acceleration. Its as-of date is bound by the slowest input — <span className="font-medium">real GDP (GDPC1)</span>, which the BEA releases quarterly with a ~30-day lag.</p>
                            {macroMeta.lastOfficialGDPDate && <p className="mb-1.5">Last official GDP print: <span className="font-medium">{macroMeta.lastOfficialGDPDate}</span>. The next BEA advance estimate will arrive ~1 month after the current quarter ends.</p>}
                            {macroMeta.nowcast ? (
                              <p className="mb-0">Intra-quarter, the classifier splices in the Atlanta Fed <span className="font-medium">GDPNow</span> nowcast (currently {macroMeta.nowcast.valueSAAR.toFixed(2)}% SAAR for Q{Math.floor((parseInt(macroMeta.nowcast.date.slice(5, 7)) - 1) / 3) + 1} {macroMeta.nowcast.date.slice(0, 4)}) so the regime can advance daily as new growth data prints.</p>
                            ) : (
                              <p className="mb-0">GDPNow nowcast unavailable — only official BEA releases are used.</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {macroMeta.nowcast && (
                        <span className="inline-flex items-center rounded-sm bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider" title={`GDPNow nowcast: ${macroMeta.nowcast.valueSAAR.toFixed(2)}% SAAR for ${macroMeta.nowcast.date}`}>Nowcast</span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs leading-relaxed mt-3 text-foreground/80">{coarseMeta?.description}</p>
                {lastClassification && transitions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/40">
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">How close are we to a regime flip?</div>
                      <div className="text-[10px] text-muted-foreground">Sorted easiest → hardest</div>
                    </div>
                    <TransitionPanel transitions={transitions} growthDelta={lastClassification.growthDelta} inflationDelta={lastClassification.inflationDelta} />
                  </div>
                )}
              </div>
              <div className="col-span-12 lg:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-2">
                <StatCard label="GDP YoY" value={lastClassification ? `${lastClassification.growthYoY.toFixed(2)}%` : "—"} delta={lastClassification?.growthDelta} deltaSuffix="pp 6m" />
                <StatCard label="CPI YoY" value={lastClassification ? `${lastClassification.inflationYoY.toFixed(2)}%` : "—"} delta={lastClassification?.inflationDelta} deltaSuffix="pp 6m" />
                <StatCard label="10Y Treasury" value={lastClassification?.ust10y ? `${lastClassification.ust10y.toFixed(2)}%` : "—"} />
                <StatCard label="Fed Funds" value={lastClassification?.fedFunds ? `${lastClassification.fedFunds.toFixed(2)}%` : "—"} />
                <StatCard label="HY OAS" value={lastClassification?.hyOAS ? `${lastClassification.hyOAS.toFixed(2)}%` : "—"} />
                <StatCard label="IG OAS" value={lastClassification?.igOAS ? `${lastClassification.igOAS.toFixed(2)}%` : "—"} />
              </div>
            </div>

            {/* Timeline + Trajectory */}
            <div className="grid grid-cols-12 gap-3 px-3 pb-3">
              <div className="col-span-12 xl:col-span-8">
                <RegimeTimeline classifications={classifications} episodes={episodes} granularEpisodes={granularEpisodes} shading={shading} />
                <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                  {shading === "coarse"
                    ? COARSE_ORDER.map(r => (
                      <span key={r} className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COARSE_META[r].bg, border: `1px solid ${COARSE_META[r].color}` }} />
                        {COARSE_META[r].label}
                      </span>
                    ))
                    : GRANULAR_REGIMES.map(r => (
                      <span key={r} className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: GRANULAR_META[r].bg, border: `1px solid ${GRANULAR_META[r].color}` }} />
                        {GRANULAR_META[r].label}
                      </span>
                    ))
                  }
                  <span className="ml-auto">
                    Signal: 6-month change in YoY for both GDP &amp; CPI, smoothed with {confirmMonths}-month confirmation window. Strong tier when intensity ≥ {intensityCutoff.toFixed(2)}pp.
                  </span>
                </div>
              </div>
              <div className="col-span-12 xl:col-span-4">
                <TrajectoryScatter trajectory={recentTrajectory} intensityCutoff={intensityCutoff} />
              </div>
            </div>

            {/* Regime definitions */}
            <div className="px-3 pb-3" data-testid="regime-definitions-panel">
              <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1.5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Regime Definitions</div>
                <div className="text-[11px] text-muted-foreground">
                  Strong tier when intensity ≥ <span className="font-mono text-foreground">{intensityCutoff.toFixed(2)}pp</span> · Confirmation: <span className="font-mono text-foreground">{confirmMonths}m</span> · Signal: 6-month change in YoY for GDP &amp; CPI
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {GRANULAR_REGIMES.map(r => {
                  const meta = GRANULAR_META[r];
                  const family = toCoarseRegime(r);
                  const familyMeta = COARSE_META[family];
                  const isCurrent = currentGranular === r;
                  const intensity = toIntensity(r);
                  const gDir = family === "GOLDILOCKS" || family === "REFLATION" ? "rising" : "falling";
                  const iDir = family === "REFLATION" || family === "STAGFLATION" ? "rising" : "falling";
                  return (
                    <div key={r} className="rounded-md p-2.5 border bg-card relative" style={{ borderColor: isCurrent ? meta.color : meta.color + "55", boxShadow: isCurrent ? `0 0 0 2px ${meta.color}66` : "none", background: isCurrent ? meta.bg : undefined }} data-testid={`def-${r.toLowerCase()}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: meta.color }} />
                        <div className="text-xs font-semibold leading-tight" style={{ color: meta.color }}>{meta.label}</div>
                        {isCurrent && <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: meta.color, color: "white" }} data-testid={`def-current-marker-${r.toLowerCase()}`}>Now</span>}
                      </div>
                      <div className="text-[11px] text-foreground mt-1.5 leading-snug">Growth {gDir} <span className="text-muted-foreground">×</span> Inflation {iDir}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 leading-snug">
                        {intensity === "STRONG"
                          ? <>Intensity ≥ <span className="font-mono">{intensityCutoff.toFixed(2)}pp</span> · {familyMeta.label} family</>
                          : <>Intensity &lt; <span className="font-mono">{intensityCutoff.toFixed(2)}pp</span> · {familyMeta.label} family</>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-muted-foreground mt-2 leading-snug">
                Intensity = max(|growth Δ|, |inflation Δ|). Cutoff is the 60th percentile of historical intensity. A regime is confirmed only after {confirmMonths} consecutive month{confirmMonths === 1 ? "" : "s"} of the same classification.
              </div>
            </div>

            {/* Aggregate performance */}
            <div className="px-3 pb-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Average performance — {isFiltered ? `${tickers.length} tickers from Universe` : `${tickers.length} of ${totalCount} tickers (no filter active)`}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                {COARSE_ORDER.map(r => {
                  const agg = aggregated[r];
                  return (
                    <div key={r} className="rounded-md p-3 border bg-card" style={{ borderColor: COARSE_META[r].color + "55" }} data-testid={`agg-${r.toLowerCase()}`}>
                      <div className="text-xs font-semibold" style={{ color: COARSE_META[r].color }}>{COARSE_META[r].label}</div>
                      <div className="grid grid-cols-3 gap-1.5 mt-2 text-xs font-mono">
                        <StatCell label="Ann Ret" value={fmtPct(agg?.avgAnnReturn ?? NaN)} />
                        <StatCell label="Hit Rate" value={fmtPct(agg?.avgHitRate ?? NaN)} />
                        <StatCell label="Sharpe" value={fmtNum(agg?.avgSharpe ?? NaN)} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5">n={agg?.nTickers ?? 0} tickers</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per-ticker table */}
            <div className="px-3 pb-6">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Per-ticker performance</div>
                {loadingTickers && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />Loading {tickerStats.length > 0 ? `(${sortedRows.length}/${tickers.length})` : ""}
                  </span>
                )}
                <div className="flex-1" />
                <div className="text-[11px] text-muted-foreground">Click any column header to sort</div>
              </div>
              <PerTickerTable rows={sortedRows} sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
