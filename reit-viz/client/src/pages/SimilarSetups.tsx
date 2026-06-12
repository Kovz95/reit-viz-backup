// Reconstructed from recovered-bundle/SimilarSetups-B0jnj8dI.js on 2026-06-11
import React from "react";
import { Loader2, AlertCircle, Sparkles } from "lucide-react";
import { useBaskets } from "@/lib/baskets";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { useAppContext } from "@/lib/appContext";
import { filterTickersByClassification } from "@/lib/filterTickersByClassification";
import { parseBasketSymbol, isBasketSymbol } from "@/lib/basketSymbol";
import { fetchTradingDates } from "@/lib/fetchTradingDates";
import { useGlobalUniverse } from "@/lib/globalUniverse";
import { getYahooPairsRatio as yahooPairsRatio } from "@/lib/yahooPairsRatio";
import { usePairComboPicker } from "@/hooks/usePairComboPicker";
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { B as BasketTickerPill } from "@/components/BasketTickerPill";
import { ClassificationFiltersWithSource } from "@/components/ClassificationFiltersWithSource";
import {
  defaultFeatures,
  featurePresets,
  algoMeta,
  algoKeys,
  featureMeta,
  featureKeys,
  computeFeatures,
  computeTimeDim,
  dispatchAlgo,
} from "@/lib/similarSetupsAlgorithms";
import { fetchOhlcSeries } from "@/lib/fetchOhlcSeries";
import { fetchCloseSeries } from "@/lib/fetchCloseSeries";
import { save as saveDrawing, defaultStyle } from "@/lib/savedDrawings";
import { BookMarked } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriceSeries {
  times: string[];
  closes: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  volumes: number[];
  label: string;
  hasVolume: boolean;
  hasOHLC: boolean;
  benchCloses?: number[];
}

interface MatchedBar {
  date: string;
  distance: number;
  weight: number;
  zVec: number[];
  fwd1M: number;
  fwd3M: number;
  fwd6M: number;
  fwd1Y: number;
}

interface WeightedStats {
  median: number;
  mean: number;
  p25: number;
  p75: number;
  hitRateLong: number;
  hitRateShort: number;
  baseLong: number;
  baseShort: number;
  n: number;
  baseN: number;
}

interface SetupResult {
  enabledList: string[];
  todayZ: number[];
  matches: MatchedBar[];
  total: number;
  algoInfo: string;
  h1M: WeightedStats | null;
  h3M: WeightedStats | null;
  h6M: WeightedStats | null;
  h1Y: WeightedStats | null;
}

interface PerTickerRow {
  ticker: string;
  nMatches: number;
  total: number;
  med1M: number;
  med3M: number;
  med6M: number;
  med1Y: number;
  hLong3M: number;
  baseLong3M: number;
  hShort3M: number;
  baseShort3M: number;
  note?: string;
}

interface ConsensusPresetRow {
  preset: string;
  n: number;
  med1M: number;
  med3M: number;
  med6M: number;
  med1Y: number;
  hLong3M: number;
  baseLong3M: number;
  hShort3M: number;
  baseShort3M: number;
  valid: boolean;
}

interface ConsensusResult {
  rows: ConsensusPresetRow[];
  valid: ConsensusPresetRow[];
  cons?: {
    med1M: number;
    med3M: number;
    med6M: number;
    med1Y: number;
    sd1M: number;
    sd3M: number;
    sd6M: number;
    sd1Y: number;
  };
  agreement: number;
  direction: "long" | "short" | "mixed";
  long3M?: number;
  short3M?: number;
  snr: number;
  verdict: string;
}

// ---------------------------------------------------------------------------
// Feature categories
// ---------------------------------------------------------------------------

const FEATURE_CATEGORIES = [
  "Trend",
  "MA Distance",
  "MA Spread",
  "Momentum",
  "Oscillator",
  "Volatility",
  "Range / Channel",
  "Distribution",
  "Volume",
  "Cross-Sectional",
  "App-Specific",
  "Time",
];

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function normalizeWithStats(values: number[]): {
  z: number[];
  mean: number;
  sd: number;
} {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 30) {
    return { z: values.map(() => NaN), mean: NaN, sd: NaN };
  }
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  const sd = Math.sqrt(
    finite.reduce((a, b) => a + (b - mean) ** 2, 0) / finite.length
  );
  return sd > 0
    ? { z: values.map((v) => (Number.isFinite(v) ? (v - mean) / sd : NaN)), mean, sd }
    : { z: values.map(() => NaN), mean, sd };
}

function computeWeightedStats(
  values: number[],
  baseValues: number[],
  weights?: number[]
): WeightedStats | null {
  const weighted: { v: number; w: number }[] = [];
  for (let k = 0; k < values.length; k++) {
    if (!Number.isFinite(values[k])) continue;
    const w = weights ? (weights[k] ?? 0) : 1;
    if (w > 0) weighted.push({ v: values[k], w });
  }
  if (weighted.length === 0) return null;
  weighted.sort((a, b) => a.v - b.v);
  const totalW = weighted.reduce((s, x) => s + x.w, 0);
  const quantile = (q: number): number => {
    const target = q * totalW;
    let cum = 0;
    for (const x of weighted) {
      cum += x.w;
      if (cum >= target) return x.v;
    }
    return weighted[weighted.length - 1].v;
  };
  const mean = weighted.reduce((s, x) => s + x.v * x.w, 0) / totalW;
  const longW = weighted.filter((x) => x.v > 0).reduce((s, x) => s + x.w, 0);
  const shortW = weighted.filter((x) => x.v < 0).reduce((s, x) => s + x.w, 0);
  const baseFinite = baseValues.filter(Number.isFinite);
  const baseLong =
    baseFinite.length > 0
      ? (baseFinite.filter((v) => v > 0).length / baseFinite.length) * 100
      : NaN;
  const baseShort =
    baseFinite.length > 0
      ? (baseFinite.filter((v) => v < 0).length / baseFinite.length) * 100
      : NaN;
  return {
    median: quantile(0.5),
    mean,
    p25: quantile(0.25),
    p75: quantile(0.75),
    hitRateLong: (longW / totalW) * 100,
    hitRateShort: (shortW / totalW) * 100,
    baseLong,
    baseShort,
    n: weighted.length,
    baseN: baseFinite.length,
  };
}

function alignBenchToTarget(
  targetTimes: string[],
  sourceTimes: string[],
  sourceValues: number[]
): number[] {
  const map = new Map<string, number>();
  for (let k = 0; k < sourceTimes.length; k++) {
    if (Number.isFinite(sourceValues[k]) && sourceValues[k] > 0) {
      map.set(sourceTimes[k], sourceValues[k]);
    }
  }
  const out = new Array<number>(targetTimes.length).fill(NaN);
  let carry = NaN;
  for (let k = 0; k < targetTimes.length; k++) {
    const v = map.get(targetTimes[k]);
    if (typeof v === "number") { carry = v; out[k] = v; }
    else if (Number.isFinite(carry)) out[k] = carry;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Price loading helpers
// ---------------------------------------------------------------------------

async function loadTargetSeries(params: {
  mode: string;
  singleTicker: string;
  basketSymbol: string;
  industryTickers: string[];
  industryLabel: string;
  pairA: string;
  pairB: string;
}): Promise<PriceSeries | null> {
  const { mode, singleTicker, basketSymbol, industryTickers, industryLabel, pairA, pairB } = params;

  if (mode === "single") {
    if (!singleTicker) return null;
    try {
      const ohlcv = await fetchOhlcSeries(singleTicker);
      if (!ohlcv.dates.length) return null;
      const hasVolume = ohlcv.volumes.some(
        (v: number) => Number.isFinite(v) && v > 0
      );
      return {
        times: ohlcv.dates,
        closes: ohlcv.closes,
        highs: ohlcv.highs,
        lows: ohlcv.lows,
        opens: ohlcv.opens,
        volumes: ohlcv.volumes,
        label: singleTicker,
        hasVolume,
        hasOHLC: true,
      };
    } catch {
      const pts = await fetchCloseSeries(singleTicker);
      if (!pts.length) return null;
      const closes = pts.map((p: { close: number }) => p.close);
      return {
        times: pts.map((p: { time: string }) => p.time),
        closes,
        highs: closes.slice(),
        lows: closes.slice(),
        opens: closes.slice(),
        volumes: new Array(closes.length).fill(0),
        label: singleTicker,
        hasVolume: false,
        hasOHLC: false,
      };
    }
  }

  if (mode === "basket") {
    if (!basketSymbol) return null;
    const pts = await fetchCloseSeries(basketSymbol);
    if (!pts.length) return null;
    const closes = pts.map((p: { close: number }) => p.close);
    const highs = pts.map((p: { high?: number; close: number }) =>
      typeof p.high === "number" ? p.high : p.close
    );
    const lows = pts.map((p: { low?: number; close: number }) =>
      typeof p.low === "number" ? p.low : p.close
    );
    const opens = pts.map((p: { open?: number; close: number }) =>
      typeof p.open === "number" ? p.open : p.close
    );
    return {
      times: pts.map((p: { time: string }) => p.time),
      closes,
      highs,
      lows,
      opens,
      volumes: new Array(closes.length).fill(0),
      label: basketSymbol,
      hasVolume: false,
      hasOHLC: true,
    };
  }

  if (mode === "industry") {
    if (industryTickers.length === 0) return null;
    const allSeries = (
      await Promise.all(
        industryTickers.map(async (tkr) => {
          try {
            const pts = await fetchCloseSeries(tkr);
            return pts.length ? pts : null;
          } catch {
            return null;
          }
        })
      )
    ).filter((s: any): s is { time: string; close: number }[] => !!s && s.length > 0);
    if (allSeries.length === 0) return null;

    // Normalize each series to first valid close
    const normed = allSeries.map((pts: { time: string; close: number }[]) => {
      const first = pts.find((p) => p.close > 0);
      if (!first) return [];
      const base = first.close;
      return pts.filter((p) => p.close > 0).map((p) => ({
        time: p.time,
        v: p.close / base,
      }));
    });

    // Build maps
    const maps = normed.map((pts: { time: string; v: number }[]) => {
      const m = new Map<string, number>();
      for (const p of pts) m.set(p.time, p.v);
      return m;
    });
    if (maps.length === 0 || maps[0].size === 0) return null;

    // Intersect times
    const timesSet = new Set<string>(Array.from(maps[0].keys()));
    for (let k = 1; k < maps.length; k++) {
      const keep = new Set<string>();
      for (const t of timesSet) {
        if (maps[k].has(t)) keep.add(t);
      }
      timesSet.clear();
      keep.forEach((t) => timesSet.add(t));
    }
    const times = Array.from(timesSet).sort();
    const compositeCloses: number[] = [];
    for (const t of times) {
      let sum = 0;
      for (const m of maps) sum += m.get(t)!;
      compositeCloses.push(sum / maps.length);
    }
    return {
      times,
      closes: compositeCloses,
      highs: compositeCloses.slice(),
      lows: compositeCloses.slice(),
      opens: compositeCloses.slice(),
      volumes: new Array(compositeCloses.length).fill(0),
      label: industryLabel,
      hasVolume: false,
      hasOHLC: false,
    };
  }

  if (mode === "pair" || mode === "pairCombo") {
    if (!pairA || !pairB || pairA === pairB) return null;
    const tradingDates = await fetchTradingDates();
    const pairData = await yahooPairsRatio(pairA, pairB, tradingDates);
    if (!pairData || pairData.prices.length === 0) return null;
    const times = pairData.indices.map((idx: number) => tradingDates[idx]);
    const closes = pairData.prices;
    return {
      times,
      closes,
      highs: closes.slice(),
      lows: closes.slice(),
      opens: closes.slice(),
      volumes: new Array(closes.length).fill(0),
      label: `${pairA} / ${pairB}`,
      hasVolume: false,
      hasOHLC: false,
    };
  }

  return null;
}

async function loadBenchmarkSeries(targetTimes: string[]): Promise<number[] | null> {
  try {
    const spy = await fetchOhlcSeries("SPY");
    if (!spy.dates.length) return null;
    return alignBenchToTarget(targetTimes, spy.dates, spy.closes);
  } catch {
    return null;
  }
}

async function loadTickerData(ticker: string): Promise<PriceSeries | null> {
  let series: PriceSeries | null = null;
  try {
    const ohlcv = await fetchOhlcSeries(ticker);
    if (ohlcv.dates.length) {
      const hasVolume = ohlcv.volumes.some(
        (v: number) => Number.isFinite(v) && v > 0
      );
      series = {
        times: ohlcv.dates,
        closes: ohlcv.closes,
        highs: ohlcv.highs,
        lows: ohlcv.lows,
        opens: ohlcv.opens,
        volumes: ohlcv.volumes,
        label: ticker,
        hasVolume,
        hasOHLC: true,
      };
    }
  } catch {}

  if (!series) {
    try {
      const pts = await fetchCloseSeries(ticker);
      if (!pts.length) return null;
      const closes = pts.map((p: { close: number }) => p.close);
      series = {
        times: pts.map((p: { time: string }) => p.time),
        closes,
        highs: closes.slice(),
        lows: closes.slice(),
        opens: closes.slice(),
        volumes: new Array(closes.length).fill(0),
        label: ticker,
        hasVolume: false,
        hasOHLC: false,
      };
    } catch {
      return null;
    }
  }

  if (!series) return null;

  try {
    const spy = await fetchOhlcSeries("SPY");
    if (spy.dates.length) {
      series.benchCloses = alignBenchToTarget(series.times, spy.dates, spy.closes);
    }
  } catch {}

  return series;
}

// ---------------------------------------------------------------------------
// Core algorithm dispatcher
// ---------------------------------------------------------------------------

function computeSetupResult(
  series: PriceSeries,
  enabledFeatures: Set<string>,
  params: {
    n: number;
    exclusion: number;
    lookbackBars: number;
    algo: string;
    dtwWindow: number;
    kernelH: number;
    regimeK: number;
  }
): SetupResult | null {
  if (!series || series.closes.length < 252) return null;
  const hasVolume = !!series.hasVolume;
  const hasBench = !!series.benchCloses;

  const isDisabled = (key: string): boolean => {
    const meta = (featureMeta as Record<string, { requiresVolume?: boolean; requiresBench?: boolean }>)[key]
      ?? (featureKeys as Record<string, { requiresVolume?: boolean; requiresBench?: boolean }>)[key];
    return !!(!meta || (meta.requiresVolume && !hasVolume) || (meta.requiresBench && !hasBench));
  };

  const enabledTechnical = (featureKeys as string[]).filter(
    (k) => enabledFeatures.has(k) && !isDisabled(k)
  );
  const enabledTime = Object.keys(
    featureKeys as Record<string, unknown>
  ).filter((k) => enabledFeatures.has(k));

  if (enabledTechnical.length + enabledTime.length === 0) return null;

  const priceCtx = {
    closes: series.closes,
    highs: series.highs,
    lows: series.lows,
    opens: series.opens,
    volumes: series.volumes,
    benchCloses: series.benchCloses,
  };

  const rawFeatures = computeFeatures(enabledTechnical, priceCtx);
  const timeDimFeatures = computeTimeDim(series.times);

  const zMap: Record<string, number[]> = {};
  for (const key of enabledTechnical) {
    const raw = (rawFeatures as Record<string, number[]>)[key] ?? new Array(series.closes.length).fill(NaN);
    zMap[key] = normalizeWithStats(raw).z;
  }
  for (const key of enabledTime) {
    const raw = (timeDimFeatures as Record<string, number[]>)[key] ?? new Array(series.closes.length).fill(NaN);
    zMap[key] = normalizeWithStats(raw).z;
  }

  const allEnabled = [...enabledTechnical, ...enabledTime];
  const closes = series.closes;
  const lastIdx = closes.length - 1;
  const todayZ = allEnabled.map((k) => zMap[k][lastIdx]);
  if (todayZ.some((v) => !Number.isFinite(v))) return null;

  const searchEnd = Math.max(0, lastIdx - params.exclusion);
  const searchStart = params.lookbackBars > 0 ? Math.max(0, lastIdx - params.lookbackBars) : 0;

  const candidateBars: {
    date: string;
    closeIdx: number;
    zVec: number[];
    fwd1M: number;
    fwd3M: number;
    fwd6M: number;
    fwd1Y: number;
  }[] = [];

  for (let i = searchStart; i <= searchEnd; i++) {
    const zVec = allEnabled.map((k) => zMap[k][i]);
    if (zVec.some((v) => !Number.isFinite(v))) continue;
    const price = closes[i];
    if (!(price > 0)) continue;
    const fwd = (n: number) => {
      const nextIdx = i + n;
      return nextIdx >= closes.length || !(closes[nextIdx] > 0)
        ? NaN
        : ((closes[nextIdx] / price - 1) * 100);
    };
    candidateBars.push({
      date: series.times[i],
      closeIdx: i,
      zVec,
      fwd1M: fwd(21),
      fwd3M: fwd(63),
      fwd6M: fwd(126),
      fwd1Y: fwd(252),
    });
  }

  if (candidateBars.length === 0) {
    return {
      enabledList: allEnabled,
      todayZ,
      matches: [],
      total: 0,
      algoInfo: "no candidate bars",
      h1M: null,
      h3M: null,
      h6M: null,
      h1Y: null,
    };
  }

  const algoInput = {
    bars: candidateBars,
    todayZ,
    n: params.n,
    closes,
    lastIdx,
    dtwWindow: params.dtwWindow,
    kernelH: params.kernelH > 0 ? params.kernelH : NaN,
    regimeK: params.regimeK,
  };

  const algoOutput = dispatchAlgo(params.algo, algoInput);
  const matches: MatchedBar[] = algoOutput.matches.map((m: {
    date: string; distance: number; weight: number; zVec: number[];
    fwd1M: number; fwd3M: number; fwd6M: number; fwd1Y: number;
  }) => ({
    date: m.date,
    distance: m.distance,
    weight: m.weight,
    zVec: m.zVec,
    fwd1M: m.fwd1M,
    fwd3M: m.fwd3M,
    fwd6M: m.fwd6M,
    fwd1Y: m.fwd1Y,
  }));

  if (matches.length === 0) {
    return {
      enabledList: allEnabled,
      todayZ,
      matches: [],
      total: candidateBars.length,
      algoInfo: algoOutput.info,
      h1M: null,
      h3M: null,
      h6M: null,
      h1Y: null,
    };
  }

  const weights = matches.map((m) => m.weight);
  return {
    enabledList: allEnabled,
    todayZ,
    matches,
    total: candidateBars.length,
    algoInfo: algoOutput.info,
    h1M: computeWeightedStats(
      matches.map((m) => m.fwd1M),
      candidateBars.map((b) => b.fwd1M),
      weights
    ),
    h3M: computeWeightedStats(
      matches.map((m) => m.fwd3M),
      candidateBars.map((b) => b.fwd3M),
      weights
    ),
    h6M: computeWeightedStats(
      matches.map((m) => m.fwd6M),
      candidateBars.map((b) => b.fwd6M),
      weights
    ),
    h1Y: computeWeightedStats(
      matches.map((m) => m.fwd1Y),
      candidateBars.map((b) => b.fwd1Y),
      weights
    ),
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, stats }: { label: string; stats: WeightedStats | null }) {
  if (!stats) {
    return (
      <div className="bg-card px-3 py-2 flex flex-col gap-0.5">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span className="text-base font-mono text-muted-foreground/50">—</span>
      </div>
    );
  }

  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const medColor =
    stats.median > 0
      ? "text-green-400"
      : stats.median < 0
      ? "text-red-400"
      : "text-foreground";

  return (
    <div className="bg-card px-3 py-2 flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-base font-mono font-semibold ${medColor}`}>
          {fmt(stats.median)}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">median</span>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/80 flex flex-wrap gap-x-3">
        <span>mean {fmt(stats.mean)}</span>
        <span>n={stats.n}</span>
      </div>
      <div className="text-[9px] font-mono flex flex-wrap gap-x-3">
        <span>
          <span className="text-green-400">
            L {stats.hitRateLong.toFixed(0)}%
          </span>
          {Number.isFinite(stats.baseLong) && (
            <span
              className={
                stats.hitRateLong - stats.baseLong >= 0
                  ? "text-green-400/70"
                  : "text-red-400/70"
              }
              title={`base rate ${stats.baseLong.toFixed(0)}% over ${stats.baseN} windows`}
            >
              {" "}
              ({stats.hitRateLong - stats.baseLong >= 0 ? "+" : ""}
              {(stats.hitRateLong - stats.baseLong).toFixed(0)}pp)
            </span>
          )}
        </span>
        <span>
          <span className="text-red-400">
            S {stats.hitRateShort.toFixed(0)}%
          </span>
          {Number.isFinite(stats.baseShort) && (
            <span
              className={
                stats.hitRateShort - stats.baseShort >= 0
                  ? "text-red-400/70"
                  : "text-green-400/70"
              }
              title={`base rate ${stats.baseShort.toFixed(0)}% over ${stats.baseN} windows`}
            >
              {" "}
              ({stats.hitRateShort - stats.baseShort >= 0 ? "+" : ""}
              {(stats.hitRateShort - stats.baseShort).toFixed(0)}pp)
            </span>
          )}
        </span>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/60 flex flex-wrap gap-x-3">
        <span>p25 {fmt(stats.p25)}</span>
        <span>p75 {fmt(stats.p75)}</span>
      </div>
    </div>
  );
}

interface SortConfig {
  key: string;
  dir: "asc" | "desc";
}

interface PerTickerTableProps {
  rows: PerTickerRow[] | null;
  running: boolean;
  progress: { done: number; total: number };
  error: string | null;
  sort: SortConfig;
  onSort: (key: string) => void;
  onTickerClick: (ticker: string) => void;
  sourceCount: number;
  unitLabel?: string;
}

function PerTickerTable({
  rows,
  running,
  progress,
  error,
  sort,
  onSort,
  onTickerClick,
  sourceCount,
  unitLabel = "ticker",
}: PerTickerTableProps) {
  const plural = unitLabel === "pair" ? "pairs" : "tickers";
  const fmtRet = (v: number) =>
    Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
  const fmtPp = (v: number) =>
    Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}pp` : "—";
  const retColor = (v: number) =>
    Number.isFinite(v)
      ? v > 0
        ? "text-green-400"
        : v < 0
        ? "text-red-400"
        : "text-foreground"
      : "text-muted-foreground/50";
  const sortSuffix = (key: string) =>
    sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "";

  if (error) {
    return (
      <div className="px-3 py-6 flex items-center gap-2 text-red-400 text-[11px] font-mono">
        <AlertCircle className="w-3.5 h-3.5" />
        {error}
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="px-3 py-6 text-[11px] font-mono text-muted-foreground">
        Per-{unitLabel} mode — click{" "}
        <span className="text-amber-300">
          Run on {sourceCount} {plural}
        </span>{" "}
        to score each {unitLabel} individually.
      </div>
    );
  }

  if (rows.length === 0 && running) {
    return (
      <div className="px-3 py-6 flex items-center gap-2 text-muted-foreground text-[11px] font-mono">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading {unitLabel} series…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-3 py-6 text-[11px] font-mono text-muted-foreground">
        No {plural} produced a result.
      </div>
    );
  }

  const valid = rows.filter(
    (r) => r.nMatches > 0 && Number.isFinite(r.med3M)
  );
  const longCount = valid.filter((r) => r.med3M > 0).length;
  const shortCount = valid.filter((r) => r.med3M < 0).length;

  const calcMedian = (key: keyof PerTickerRow): number => {
    const vals = valid
      .map((r) => r[key] as number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (vals.length === 0) return NaN;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  };

  const summary = {
    n: valid.length,
    medOfMed1M: calcMedian("med1M"),
    medOfMed3M: calcMedian("med3M"),
    medOfMed6M: calcMedian("med6M"),
    medOfMed1Y: calcMedian("med1Y"),
  };

  type SortableHeader = { k: string; label: string; align?: "left" | "right" };
  const SortHeader = ({ k, label, align = "right" }: SortableHeader) => (
    <th
      className={`${align === "left" ? "text-left" : "text-right"} font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground`}
      onClick={() => onSort(k)}
      title="Sort by this column"
    >
      {label}{sortSuffix(k)}
    </th>
  );

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 border-b border-border bg-card/40 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[10px] font-mono text-amber-300/90 uppercase tracking-wider">
          per-ticker · {valid.length}/{rows.length} valid
          {running && (
            <>
              {" "}·{" "}
              <Loader2 className="inline w-3 h-3 animate-spin align-[-2px]" />
              {" "}{progress.done}/{progress.total}
            </>
          )}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          long {longCount} · short {shortCount} (3M med direction)
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          med-of-med:
          <span className={`ml-1 ${retColor(summary.medOfMed1M)}`}>
            1M {fmtRet(summary.medOfMed1M)}
          </span>
          <span className={`ml-2 ${retColor(summary.medOfMed3M)}`}>
            3M {fmtRet(summary.medOfMed3M)}
          </span>
          <span className={`ml-2 ${retColor(summary.medOfMed6M)}`}>
            6M {fmtRet(summary.medOfMed6M)}
          </span>
          <span className={`ml-2 ${retColor(summary.medOfMed1Y)}`}>
            1Y {fmtRet(summary.medOfMed1Y)}
          </span>
        </span>
      </div>
      <div className="px-3 pb-2 overflow-x-auto max-h-[72vh]">
        <table className="w-full text-[11px] font-mono">
          <thead className="sticky top-0 bg-card text-muted-foreground/70 uppercase tracking-wider">
            <tr>
              <SortHeader k="ticker" label="Ticker" align="left" />
              <SortHeader k="nMatches" label="# matches" />
              <SortHeader k="med1M" label="Med 1M" />
              <SortHeader k="med3M" label="Med 3M" />
              <SortHeader k="med6M" label="Med 6M" />
              <SortHeader k="med1Y" label="Med 1Y" />
              <SortHeader k="hLong3M" label="Hit L 3M" />
              <SortHeader k="hShort3M" label="Hit S 3M" />
              <th className="text-left font-normal pr-3 py-1">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.ticker}
                className="border-t border-border/40 hover:bg-accent/30"
              >
                <td className="pr-3 py-0.5">
                  <button
                    className="text-amber-300 hover:text-amber-200 hover:underline"
                    onClick={() => onTickerClick(row.ticker)}
                    title={`Drill in: load ${row.ticker} in single mode`}
                    data-testid={`ss-pt-row-${row.ticker}`}
                  >
                    {row.ticker}
                  </button>
                </td>
                <td className="text-right text-muted-foreground pr-3 py-0.5">
                  {row.nMatches || "—"}
                </td>
                <td className={`text-right pr-3 py-0.5 ${retColor(row.med1M)}`}>
                  {fmtRet(row.med1M)}
                </td>
                <td className={`text-right pr-3 py-0.5 ${retColor(row.med3M)}`}>
                  {fmtRet(row.med3M)}
                </td>
                <td className={`text-right pr-3 py-0.5 ${retColor(row.med6M)}`}>
                  {fmtRet(row.med6M)}
                </td>
                <td className={`text-right pr-3 py-0.5 ${retColor(row.med1Y)}`}>
                  {fmtRet(row.med1Y)}
                </td>
                <td className="text-right pr-3 py-0.5">
                  <span className="text-green-400">
                    {Number.isFinite(row.hLong3M)
                      ? `${row.hLong3M.toFixed(0)}%`
                      : "—"}
                  </span>
                  {Number.isFinite(row.baseLong3M) && Number.isFinite(row.hLong3M) && (
                    <span
                      className={
                        row.hLong3M - row.baseLong3M >= 0
                          ? "text-green-400/70"
                          : "text-red-400/70"
                      }
                      title={`base rate ${row.baseLong3M.toFixed(0)}%`}
                    >
                      {" "}
                      ({fmtPp(row.hLong3M - row.baseLong3M)})
                    </span>
                  )}
                </td>
                <td className="text-right pr-3 py-0.5">
                  <span className="text-red-400">
                    {Number.isFinite(row.hShort3M)
                      ? `${row.hShort3M.toFixed(0)}%`
                      : "—"}
                  </span>
                  {Number.isFinite(row.baseShort3M) && Number.isFinite(row.hShort3M) && (
                    <span
                      className={
                        row.hShort3M - row.baseShort3M >= 0
                          ? "text-red-400/70"
                          : "text-green-400/70"
                      }
                      title={`base rate ${row.baseShort3M.toFixed(0)}%`}
                    >
                      {" "}
                      ({fmtPp(row.hShort3M - row.baseShort3M)})
                    </span>
                  )}
                </td>
                <td className="text-left text-muted-foreground/70 pr-3 py-0.5">
                  {row.note ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConsensusView({ consensus }: { consensus: ConsensusResult }) {
  const fmtRet = (v: number) =>
    Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
  const fmtPp = (v: number) =>
    Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}pp` : "—";
  const dirArrow = (v: number) =>
    Number.isFinite(v) ? (v > 0.25 ? "↑" : v < -0.25 ? "↓" : "·") : "—";
  const retColor = (v: number) =>
    Number.isFinite(v)
      ? v > 0
        ? "text-green-400"
        : v < 0
        ? "text-red-400"
        : "text-foreground"
      : "text-muted-foreground/50";

  const verdict = consensus.verdict;
  const direction = consensus.direction ?? "mixed";
  let verdictCls = "text-muted-foreground border-border";
  if (verdict.startsWith("Strong") && direction === "long")
    verdictCls = "text-green-300 bg-green-500/10 border-green-500/40";
  else if (verdict.startsWith("Strong") && direction === "short")
    verdictCls = "text-red-300 bg-red-500/10 border-red-500/40";
  else if (verdict.startsWith("Moderate") && direction === "long")
    verdictCls = "text-green-300/90 bg-green-500/5 border-green-500/30";
  else if (verdict.startsWith("Moderate") && direction === "short")
    verdictCls = "text-red-300/90 bg-red-500/5 border-red-500/30";
  else if (verdict.startsWith("Weak") && direction === "long")
    verdictCls = "text-green-300/70 border-green-500/20";
  else if (verdict.startsWith("Weak") && direction === "short")
    verdictCls = "text-red-300/70 border-red-500/20";

  const cons = consensus.cons;
  const validCount = consensus.valid.length;
  const totalRows = consensus.rows.length;
  const agreementPct = Number.isFinite(consensus.agreement)
    ? Math.round(consensus.agreement * 100)
    : NaN;
  const directionCount =
    direction === "long"
      ? consensus.long3M ?? 0
      : direction === "short"
      ? consensus.short3M ?? 0
      : Math.max(consensus.long3M ?? 0, consensus.short3M ?? 0);

  return (
    <div className="px-3 py-3 flex flex-col gap-3">
      <div className={`px-3 py-2 border rounded ${verdictCls}`}>
        <div className="text-[10px] font-mono uppercase tracking-wider opacity-70">
          Consensus verdict
        </div>
        <div className="text-lg font-mono font-semibold">{verdict}</div>
      </div>

      {cons && Number.isFinite(agreementPct) && (
        <div className="text-[11px] font-mono text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <span className="text-foreground">{directionCount}</span> of{" "}
            <span className="text-foreground">{validCount}</span> presets agree{" "}
            {direction} at 3M
            {validCount < totalRows && (
              <span className="text-muted-foreground/60">
                {" "}({totalRows - validCount} dropped)
              </span>
            )}
          </span>
          <span>
            consensus 3M median{" "}
            <span className={retColor(cons.med3M)}>{fmtRet(cons.med3M)}</span>
          </span>
          <span>
            dispersion ±{Number.isFinite(cons.sd3M) ? cons.sd3M.toFixed(1) : "—"}pp
          </span>
          <span>
            SNR{" "}
            <span className="text-foreground">
              {Number.isFinite(consensus.snr) ? consensus.snr.toFixed(2) : "—"}
            </span>
          </span>
          <span>
            agreement {Number.isFinite(agreementPct) ? `${agreementPct}%` : "—"}
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead className="bg-card">
            <tr className="text-muted-foreground/70 uppercase tracking-wider">
              <th className="text-left font-normal pr-3 py-1">Preset</th>
              <th className="text-right font-normal pr-3 py-1">N</th>
              <th className="text-right font-normal pr-3 py-1">med 1M</th>
              <th className="text-right font-normal pr-3 py-1">med 3M</th>
              <th className="text-right font-normal pr-3 py-1">med 6M</th>
              <th className="text-right font-normal pr-3 py-1">med 1Y</th>
              <th className="text-right font-normal pr-3 py-1">L hit% (Δ)</th>
              <th className="text-right font-normal pr-3 py-1">S hit% (Δ)</th>
              <th className="text-center font-normal py-1">dir 3M</th>
            </tr>
          </thead>
          <tbody>
            {consensus.rows.map((row) => (
              <tr key={row.preset} className="border-t border-border/40">
                <td className="text-foreground pr-3 py-0.5">{row.preset}</td>
                <td className="text-right text-muted-foreground pr-3 py-0.5">
                  {row.valid ? row.n : "—"}
                </td>
                <td className={`text-right pr-3 py-0.5 ${retColor(row.med1M)}`}>
                  {fmtRet(row.med1M)}
                </td>
                <td className={`text-right pr-3 py-0.5 ${retColor(row.med3M)}`}>
                  {fmtRet(row.med3M)}
                </td>
                <td className={`text-right pr-3 py-0.5 ${retColor(row.med6M)}`}>
                  {fmtRet(row.med6M)}
                </td>
                <td className={`text-right pr-3 py-0.5 ${retColor(row.med1Y)}`}>
                  {fmtRet(row.med1Y)}
                </td>
                <td className="text-right pr-3 py-0.5">
                  {row.valid && Number.isFinite(row.hLong3M) ? (
                    <>
                      <span className="text-green-400">
                        {row.hLong3M.toFixed(0)}%
                      </span>
                      {Number.isFinite(row.baseLong3M) && (
                        <span
                          className={
                            row.hLong3M - row.baseLong3M >= 0
                              ? "text-green-400/70"
                              : "text-red-400/70"
                          }
                        >
                          {" "}({fmtPp(row.hLong3M - row.baseLong3M)})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="text-right pr-3 py-0.5">
                  {row.valid && Number.isFinite(row.hShort3M) ? (
                    <>
                      <span className="text-red-400">
                        {row.hShort3M.toFixed(0)}%
                      </span>
                      {Number.isFinite(row.baseShort3M) && (
                        <span
                          className={
                            row.hShort3M - row.baseShort3M >= 0
                              ? "text-red-400/70"
                              : "text-green-400/70"
                          }
                        >
                          {" "}({fmtPp(row.hShort3M - row.baseShort3M)})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className={`text-center py-0.5 ${retColor(row.med3M)}`}>
                  {dirArrow(row.med3M)}
                </td>
              </tr>
            ))}
            {cons && (
              <tr className="border-t-2 border-amber-500/40 bg-amber-500/5">
                <td className="text-amber-300 pr-3 py-1 font-semibold">
                  Consensus (√N-weighted)
                </td>
                <td className="text-right text-muted-foreground pr-3 py-1">
                  {consensus.valid.reduce((s, r) => s + (r.n || 0), 0)}
                </td>
                <td className={`text-right pr-3 py-1 font-semibold ${retColor(cons.med1M)}`}>
                  {fmtRet(cons.med1M)}
                </td>
                <td className={`text-right pr-3 py-1 font-semibold ${retColor(cons.med3M)}`}>
                  {fmtRet(cons.med3M)}
                </td>
                <td className={`text-right pr-3 py-1 font-semibold ${retColor(cons.med6M)}`}>
                  {fmtRet(cons.med6M)}
                </td>
                <td className={`text-right pr-3 py-1 font-semibold ${retColor(cons.med1Y)}`}>
                  {fmtRet(cons.med1Y)}
                </td>
                <td
                  className="text-right pr-3 py-1 text-muted-foreground/70"
                  colSpan={2}
                >
                  ±sd 3M: {Number.isFinite(cons.sd3M) ? cons.sd3M.toFixed(1) : "—"}pp
                </td>
                <td className={`text-center py-1 ${retColor(cons.med3M)}`}>
                  {dirArrow(cons.med3M)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed">
        Each row shows a different feature subspace (preset). Robust setups agree across
        presets; fragile setups only &quot;work&quot; under one specific lens. Consensus
        median is weighted by √N so thinly-matched presets contribute less. SNR =
        |consensus 3M| ÷ dispersion. Strong calls require ≥80% directional agreement AND
        SNR ≥ 1.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SimilarSetups page
// ---------------------------------------------------------------------------

export default function SimilarSetups() {
  const { baskets } = useBaskets();
  const [workbookTickers, setWorkbookTickers] = React.useState<{ ticker: string }[]>([]);
  React.useEffect(() => {
    let alive = true;
    fetchWorkbookTickers()
      .then((tickers) => { if (alive) setWorkbookTickers(tickers); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Mode
  const [mode, setMode] = React.useState("single");

  // Single ticker
  const initialTicker = (() => {
    try {
      const p = new URLSearchParams(window.location.search).get("ticker");
      return p ? p.toUpperCase() : "";
    } catch {
      return "";
    }
  })();
  const [singleTicker, setSingleTicker] = React.useState(initialTicker);

  // Basket
  const [basketSymbol, setBasketSymbol] = React.useState("");

  // Industry filters
  const [classFilters, setClassFilters] = React.useState(() => ({
    economy: new Set<string>(),
    sector: new Set<string>(),
    subsector: new Set<string>(),
    industryGroup: new Set<string>(),
    industry: new Set<string>(),
    subindustry: new Set<string>(),
  }));
  const [industrySearch, setIndustrySearch] = React.useState("");
  const [manualTickers, setManualTickers] = React.useState(() => new Set<string>());
  const [classSource, setClassSource] = React.useState("workbook");
  const { metas: globalMetas } = useGlobalUniverse();

  // Pair
  const [pairA, setPairA] = React.useState("");
  const [pairB, setPairB] = React.useState("");
  const tickerList = React.useMemo(
    () => workbookTickers.map((t) => t.ticker),
    [workbookTickers]
  );
  const pairComboCtx = usePairComboPicker(tickerList, mode === "pairCombo", "ss-pc");

  // Keep pairCombo anchor in sync
  React.useEffect(() => {
    if (mode !== "pairCombo" || pairComboCtx.pairs.length === 0) return;
    if (
      !pairComboCtx.pairs.some(
        (p: { a: string; b: string }) =>
          (p.a === pairA && p.b === pairB) || (p.a === pairB && p.b === pairA)
      )
    ) {
      const first = pairComboCtx.pairs[0];
      setPairA(first.a);
      setPairB(first.b);
    }
  }, [mode, pairComboCtx.pairs, pairA, pairB]);

  // Algo params
  const [nNeighbors, setNNeighbors] = React.useState(20);
  const [exclusion, setExclusion] = React.useState(252);
  const [lookbackBars, setLookbackBars] = React.useState(0);
  const [enabledFeatures, setEnabledFeatures] = React.useState(
    () => new Set<string>(defaultFeatures as string[])
  );
  const [algo, setAlgo] = React.useState("knn");
  const [dtwWindow, setDtwWindow] = React.useState(60);
  const [kernelH, setKernelH] = React.useState(0);
  const [regimeK, setRegimeK] = React.useState(5);
  const [consensusMode, setConsensusMode] = React.useState(false);
  const [consensusPresets, setConsensusPresets] = React.useState(
    () => new Set<string>(Object.keys(featurePresets as Record<string, unknown>).filter((k) => k !== "Classic (6)"))
  );
  const [perTickerMode, setPerTickerMode] = React.useState(false);

  // Industry ticker list
  const industryTickers = React.useMemo(() => {
    if (mode !== "industry") return [];
    const hasFilters =
      classFilters.economy.size +
        classFilters.sector.size +
        classFilters.subsector.size +
        classFilters.industryGroup.size +
        classFilters.industry.size +
        classFilters.subindustry.size +
        manualTickers.size +
        (industrySearch.trim().length > 0 ? 1 : 0) ===
      0;
    if (hasFilters) return [];
    return filterTickersByClassification(
      classSource === "global" ? globalMetas : workbookTickers,
      classFilters,
      industrySearch,
      manualTickers
    ).map((r: { ticker: string }) => r.ticker);
  }, [mode, workbookTickers, globalMetas, classSource, classFilters, industrySearch, manualTickers]);

  const industryLabel = React.useMemo(() => {
    if (mode !== "industry") return "";
    const parts: string[] = [];
    const dims: [keyof typeof classFilters, string][] = [
      ["economy", "Econ"],
      ["sector", "Sec"],
      ["subsector", "SubSec"],
      ["industryGroup", "IndGrp"],
      ["industry", "Ind"],
      ["subindustry", "SubInd"],
    ];
    for (const [dim, label] of dims) {
      const s = classFilters[dim];
      if (s.size !== 0) {
        s.size === 1 ? parts.push(`${label}=${[...s][0]}`) : parts.push(`${label}(${s.size})`);
      }
    }
    if (industrySearch.trim()) parts.push(`q="${industrySearch.trim()}"`);
    if (manualTickers.size > 0) parts.push(`+${manualTickers.size} manual`);
    return parts.length > 0 ? parts.join(" · ") : "All filtered";
  }, [mode, classFilters, industrySearch, manualTickers]);

  // Per-ticker constituent list
  const isMultiMode = mode === "industry" || mode === "basket" || mode === "pairCombo";
  React.useEffect(() => {
    if (!isMultiMode && perTickerMode) {
      setPerTickerMode(false);
      setPerTickerResults(null);
    }
  }, [isMultiMode]);

  const constituentList = React.useMemo(() => {
    if (mode === "industry") {
      return industryTickers
        .filter((t: any) => t && !(t as string).startsWith("BASKET:"))
        .map((t: any) => ({ kind: "single" as const, ticker: t as string }));
    }
    if (mode === "basket") {
      const id = basketSymbol ? parseBasketSymbol(basketSymbol) : null;
      return id
        ? ((baskets.find((b) => b.id === id)?.tickers ?? []) as string[])
            .filter((t) => t && !t.startsWith("BASKET:"))
            .map((t) => ({ kind: "single" as const, ticker: t }))
        : [];
    }
    if (mode === "pairCombo") {
      return pairComboCtx.pairs.map((p: { a: string; b: string }) => ({
        kind: "pair" as const,
        a: p.a,
        b: p.b,
      }));
    }
    return [];
  }, [mode, industryTickers, basketSymbol, baskets, pairComboCtx.pairs]);

  // Target price series (for single/basket/industry/pair)
  const targetKey = React.useMemo(() => {
    if (mode === "single") return `single|${singleTicker}`;
    if (mode === "basket") return `basket|${basketSymbol}`;
    if (mode === "industry") {
      const sorted = [...industryTickers].sort().join(",");
      return `industry|${industryTickers.length}|${sorted}`;
    }
    if (mode === "pair") return `pair|${pairA}|${pairB}`;
    if (mode === "pairCombo") return `pairCombo|${pairA}|${pairB}`;
    return "";
  }, [mode, singleTicker, basketSymbol, industryTickers, pairA, pairB]);

  const [priceSeries, setPriceSeries] = React.useState<PriceSeries | null>(null);
  const [seriesLoading, setSeriesLoading] = React.useState(false);
  const [seriesError, setSeriesError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setSeriesError(null);
    if (!targetKey || targetKey.endsWith("|") || targetKey.endsWith("||")) {
      setPriceSeries(null);
      return;
    }
    if (mode === "industry" && industryTickers.length === 0) {
      setPriceSeries(null);
      return;
    }
    if ((mode === "pair" || mode === "pairCombo") && (!pairA || !pairB || pairA === pairB)) {
      setPriceSeries(null);
      return;
    }
    setSeriesLoading(true);
    (async () => {
      try {
        const series = await loadTargetSeries({
          mode,
          singleTicker,
          basketSymbol,
          industryTickers,
          industryLabel,
          pairA,
          pairB,
        });
        if (cancelled) return;
        if (!series) {
          setPriceSeries(null);
          setSeriesError("No data returned for this selection.");
          return;
        }
        const benchCloses = await loadBenchmarkSeries(series.times);
        if (cancelled) return;
        setPriceSeries({ ...series, benchCloses: benchCloses ?? undefined });
      } catch (err: unknown) {
        if (cancelled) return;
        setPriceSeries(null);
        const msg = (err as { message?: string })?.message;
        setSeriesError(msg ? String(msg) : "Failed to load price series.");
      } finally {
        if (!cancelled) setSeriesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [targetKey]);

  const hasVolume = !!priceSeries?.hasVolume;
  const hasBench = !!priceSeries?.benchCloses;

  const isFeatureDisabled = (key: string): boolean => {
    const meta = (featureMeta as Record<string, { requiresVolume?: boolean; requiresBench?: boolean }>)[key]
      ?? (featureKeys as Record<string, { requiresVolume?: boolean; requiresBench?: boolean }>)[key];
    return !!(!meta || (meta.requiresVolume && !hasVolume) || (meta.requiresBench && !hasBench));
  };

  const algoParams = React.useMemo(
    () => ({
      n: nNeighbors,
      exclusion,
      lookbackBars,
      algo,
      dtwWindow,
      kernelH,
      regimeK,
    }),
    [nNeighbors, exclusion, lookbackBars, algo, dtwWindow, kernelH, regimeK]
  );

  const mainResult = React.useMemo(
    () => (priceSeries ? computeSetupResult(priceSeries, enabledFeatures, algoParams) : null),
    [priceSeries, nNeighbors, exclusion, lookbackBars, enabledFeatures, hasVolume, hasBench, algo, dtwWindow, kernelH, regimeK]
  );

  // Per-ticker runner
  const [perTickerResults, setPerTickerResults] = React.useState<PerTickerRow[] | null>(null);
  const [perTickerRunning, setPerTickerRunning] = React.useState(false);
  const [perTickerError, setPerTickerError] = React.useState<string | null>(null);
  const [perTickerProgress, setPerTickerProgress] = React.useState({ done: 0, total: 0 });
  const runToken = React.useState(() => ({ cancelled: false, token: 0 }))[0];

  React.useEffect(() => {
    runToken.token++;
    runToken.cancelled = true;
  }, [mode, basketSymbol, industryTickers, pairComboCtx.pairs]);

  async function runPerTicker() {
    if (!isMultiMode) return;
    const list = constituentList;
    if (list.length === 0) {
      setPerTickerError(
        mode === "pairCombo"
          ? "No pairs in the leg set. Add tickers to the leg set first."
          : "No constituent tickers to run."
      );
      setPerTickerResults(null);
      return;
    }
    runToken.cancelled = false;
    const thisToken = ++runToken.token;
    const isStale = () => runToken.token !== thisToken;

    setPerTickerError(null);
    setPerTickerRunning(true);
    setPerTickerProgress({ done: 0, total: list.length });
    setPerTickerResults([]);

    const params = { ...algoParams };
    const featSet = new Set(enabledFeatures);
    const BATCH = 8;
    const results: PerTickerRow[] = [];

    const loadOne = async (item: { kind: string; ticker?: string; a?: string; b?: string }): Promise<PriceSeries | null> => {
      if (item.kind === "single") return loadTickerData(item.ticker!);
      const dates = await fetchTradingDates();
      const pairData = await yahooPairsRatio(item.a!, item.b!, dates);
      if (!pairData || pairData.prices.length === 0) return null;
      const times = pairData.indices.map((idx: number) => dates[idx]);
      const closes = pairData.prices;
      return {
        times,
        closes,
        highs: closes.slice(),
        lows: closes.slice(),
        opens: closes.slice(),
        volumes: new Array(closes.length).fill(0),
        label: `${item.a} / ${item.b}`,
        hasVolume: false,
        hasOHLC: false,
      };
    };
    const keyOf = (item: { kind: string; ticker?: string; a?: string; b?: string }) =>
      item.kind === "single" ? item.ticker! : `${item.a}/${item.b}`;

    for (let i = 0; i < list.length && !isStale(); i += BATCH) {
      const batch = list.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (item: { kind: string; ticker?: string; a?: string; b?: string }) => {
          const key = keyOf(item);
          try {
            const series = await loadOne(item);
            if (!series) {
              return { ticker: key, nMatches: 0, total: 0, med1M: NaN, med3M: NaN, med6M: NaN, med1Y: NaN, hLong3M: NaN, baseLong3M: NaN, hShort3M: NaN, baseShort3M: NaN, note: "load failed" };
            }
            if (series.closes.length < 252) {
              return { ticker: key, nMatches: 0, total: series.closes.length, med1M: NaN, med3M: NaN, med6M: NaN, med1Y: NaN, hLong3M: NaN, baseLong3M: NaN, hShort3M: NaN, baseShort3M: NaN, note: `<252 bars (${series.closes.length})` };
            }
            const result = computeSetupResult(series, featSet, params);
            if (!result) {
              return { ticker: key, nMatches: 0, total: series.closes.length, med1M: NaN, med3M: NaN, med6M: NaN, med1Y: NaN, hLong3M: NaN, baseLong3M: NaN, hShort3M: NaN, baseShort3M: NaN, note: "no valid today vector" };
            }
            if (result.matches.length === 0) {
              return { ticker: key, nMatches: 0, total: result.total, med1M: NaN, med3M: NaN, med6M: NaN, med1Y: NaN, hLong3M: NaN, baseLong3M: NaN, hShort3M: NaN, baseShort3M: NaN, note: "no matches" };
            }
            return {
              ticker: key,
              nMatches: result.matches.length,
              total: result.total,
              med1M: result.h1M?.median ?? NaN,
              med3M: result.h3M?.median ?? NaN,
              med6M: result.h6M?.median ?? NaN,
              med1Y: result.h1Y?.median ?? NaN,
              hLong3M: result.h3M?.hitRateLong ?? NaN,
              baseLong3M: result.h3M?.baseLong ?? NaN,
              hShort3M: result.h3M?.hitRateShort ?? NaN,
              baseShort3M: result.h3M?.baseShort ?? NaN,
            };
          } catch (err: unknown) {
            const msg = (err as { message?: string })?.message;
            return { ticker: key, nMatches: 0, total: 0, med1M: NaN, med3M: NaN, med6M: NaN, med1Y: NaN, hLong3M: NaN, baseLong3M: NaN, hShort3M: NaN, baseShort3M: NaN, note: msg ? String(msg).slice(0, 60) : "error" };
          }
        })
      );
      if (isStale()) break;
      results.push(...batchResults);
      setPerTickerResults([...results]);
      setPerTickerProgress({ done: results.length, total: list.length });
    }
    if (!isStale()) setPerTickerRunning(false);
  }

  // Per-ticker sort
  const [perTickerSort, setPerTickerSort] = React.useState<SortConfig>({ key: "med3M", dir: "desc" });
  const sortedPerTicker = React.useMemo(() => {
    if (!perTickerResults) return null;
    const copy = [...perTickerResults];
    const { key, dir } = perTickerSort;
    const mult = dir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      if (key === "ticker") return a.ticker.localeCompare(b.ticker) * mult;
      const va = (a as unknown as Record<string, number>)[key];
      const vb = (b as unknown as Record<string, number>)[key];
      const fa = Number.isFinite(va);
      const fb = Number.isFinite(vb);
      if (!fa && !fb) return 0;
      if (fa) return fb ? (va - vb) * mult : -1;
      return 1;
    });
    return copy;
  }, [perTickerResults, perTickerSort]);

  const handlePerTickerSort = (key: string) => {
    setPerTickerSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "ticker" ? "asc" : "desc" }
    );
  };

  // Consensus computation
  const consensusResult = React.useMemo((): ConsensusResult | null => {
    if (!consensusMode || !priceSeries || priceSeries.closes.length < 252) return null;
    const rows: ConsensusPresetRow[] = [];
    for (const presetName of Object.keys(featurePresets as Record<string, string[]>)) {
      if (!consensusPresets.has(presetName)) continue;
      const features = new Set((featurePresets as Record<string, string[]>)[presetName]);
      const result = computeSetupResult(priceSeries, features, algoParams);
      if (!result || !result.matches.length) {
        rows.push({
          preset: presetName,
          n: 0,
          med1M: NaN,
          med3M: NaN,
          med6M: NaN,
          med1Y: NaN,
          hLong3M: NaN,
          baseLong3M: NaN,
          hShort3M: NaN,
          baseShort3M: NaN,
          valid: false,
        });
        continue;
      }
      rows.push({
        preset: presetName,
        n: result.matches.length,
        med1M: result.h1M?.median ?? NaN,
        med3M: result.h3M?.median ?? NaN,
        med6M: result.h6M?.median ?? NaN,
        med1Y: result.h1Y?.median ?? NaN,
        hLong3M: result.h3M?.hitRateLong ?? NaN,
        baseLong3M: result.h3M?.baseLong ?? NaN,
        hShort3M: result.h3M?.hitRateShort ?? NaN,
        baseShort3M: result.h3M?.baseShort ?? NaN,
        valid: true,
      });
    }

    const valid = rows.filter((r) => r.valid && Number.isFinite(r.med3M));
    if (valid.length === 0) {
      return { rows, valid, agreement: NaN, direction: "mixed", snr: NaN, verdict: "No valid presets produced matches." };
    }

    // Weighted consensus
    const wtAvg = (key: keyof ConsensusPresetRow): number => {
      let wSum = 0;
      let vSum = 0;
      for (const r of valid) {
        const v = r[key] as number;
        if (!Number.isFinite(v)) continue;
        const w = Math.sqrt(r.n);
        wSum += w;
        vSum += v * w;
      }
      return wSum > 0 ? vSum / wSum : NaN;
    };
    const stdDev = (key: keyof ConsensusPresetRow): number => {
      const vals = valid.map((r) => r[key] as number).filter(Number.isFinite);
      if (vals.length < 2) return NaN;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      return Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
    };

    const cons = {
      med1M: wtAvg("med1M"),
      med3M: wtAvg("med3M"),
      med6M: wtAvg("med6M"),
      med1Y: wtAvg("med1Y"),
      sd1M: stdDev("med1M"),
      sd3M: stdDev("med3M"),
      sd6M: stdDev("med6M"),
      sd1Y: stdDev("med1Y"),
    };

    const long3M = valid.filter((r) => r.med3M > 0).length;
    const short3M = valid.filter((r) => r.med3M < 0).length;
    const agreement = Math.max(long3M, short3M) / valid.length;
    const direction: "long" | "short" | "mixed" =
      long3M > short3M ? "long" : short3M > long3M ? "short" : "mixed";
    const snr =
      Number.isFinite(cons.sd3M) && cons.sd3M > 0
        ? Math.abs(cons.med3M) / cons.sd3M
        : NaN;

    let verdict = "Mixed — no clear direction";
    if (direction !== "mixed") {
      const side = direction === "long" ? "long" : "short";
      if (agreement >= 0.8 && (snr >= 1 || !Number.isFinite(snr)))
        verdict = `Strong ${side}`;
      else if (agreement >= 0.66) verdict = `Moderate ${side}`;
      else if (agreement >= 0.55) verdict = `Weak ${side}`;
      else verdict = `Mixed — ${side} leaning`;
    }

    return { rows, valid, cons, agreement, direction, long3M, short3M, snr, verdict };
  }, [consensusMode, consensusPresets, priceSeries, nNeighbors, exclusion, lookbackBars, hasVolume, hasBench, algo, dtwWindow, kernelH, regimeK]);

  // Match sort
  const [matchSort, setMatchSort] = React.useState<SortConfig>({ key: "distance", dir: "asc" });
  const sortedMatches = React.useMemo(() => {
    if (!mainResult?.matches?.length) return mainResult?.matches ?? [];
    const copy = [...mainResult.matches];
    const { key, dir } = matchSort;
    const mult = dir === "asc" ? 1 : -1;
    const getVal = (m: MatchedBar): string | number => {
      if (key === "date") return m.date;
      if (key === "distance") return m.distance;
      if (key === "weight") return m.weight;
      if (key === "fwd1M") return m.fwd1M;
      if (key === "fwd3M") return m.fwd3M;
      if (key === "fwd6M") return m.fwd6M;
      if (key === "fwd1Y") return m.fwd1Y;
      if (key.startsWith("z:")) {
        const idx = parseInt(key.slice(2), 10);
        return Number.isFinite(idx) ? m.zVec[idx] ?? NaN : NaN;
      }
      return NaN;
    };
    copy.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === "string" && typeof vb === "string")
        return va.localeCompare(vb) * mult;
      const na = typeof va === "number" ? va : NaN;
      const nb = typeof vb === "number" ? vb : NaN;
      const fa = Number.isFinite(na);
      const fb = Number.isFinite(nb);
      if (!fa && !fb) return 0;
      if (fa) return fb ? (na - nb) * mult : -1;
      return 1;
    });
    return copy;
  }, [mainResult, matchSort]);

  const matchSortSuffix = (key: string) =>
    matchSort.key === key ? (matchSort.dir === "desc" ? " ↓" : " ↑") : "";

  const handleMatchSort = (key: string, defaultDir: "asc" | "desc" = "desc") => {
    setMatchSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: defaultDir }
    );
  };

  const fmtReturn = (v: number) =>
    Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
  const targetLabel = priceSeries?.label ?? "—";
  const featureLabelOf = (key: string): string =>
    (
      (featureMeta as Record<string, { label: string }>)[key] ??
      (featureKeys as Record<string, { label: string }>)[key]
    )?.label ?? key;

  return (
    <div
      className="flex flex-col h-full bg-background overflow-auto"
      data-testid="similar-setups-page"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-3 flex-wrap bg-card">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <h1 className="text-sm font-mono font-semibold text-foreground">
          Similar Setups ·{" "}
          <span className="text-amber-300">{targetLabel}</span>
        </h1>
        {!consensusMode && mainResult && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {mainResult.matches.length}/{mainResult.total} bars matched · feature dim{" "}
            {mainResult.enabledList.length} · {mainResult.algoInfo}
          </span>
        )}
        {consensusMode && consensusResult && (
          <span className="text-[10px] font-mono text-amber-300/80">
            consensus · {consensusResult.valid.length}/{consensusResult.rows.length} valid
            presets · {(algoMeta as Record<string, { label: string }>)[algo]?.label}
          </span>
        )}
        {priceSeries && (
          <span className="text-[10px] font-mono text-muted-foreground/60">
            {hasVolume ? "OHLCV" : priceSeries.hasOHLC ? "OHLC" : "close-only"}
            {hasBench ? " · SPY benchmark loaded" : " · no benchmark"}
          </span>
        )}
      </div>

      {/* Mode + Instrument selector bar */}
      <div className="px-3 py-2 border-b border-border bg-card/60 flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Mode
        </span>
        <div
          className="flex rounded border border-border overflow-hidden"
          data-testid="ss-mode-tabs"
        >
          {["single", "basket", "industry", "pair", "pairCombo"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-[11px] font-mono px-2.5 py-1 transition-colors ${
                mode === m
                  ? "bg-amber-500/15 text-amber-300 border-r border-border last:border-r-0"
                  : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent border-r border-border last:border-r-0"
              }`}
              data-testid={`ss-mode-${m}`}
            >
              {m}
            </button>
          ))}
        </div>

        <span className="w-px h-5 bg-border" />

        {mode === "single" && (
          <div className="flex items-center gap-2 min-w-[280px]">
            <UnifiedTickerPicker
              tickers={workbookTickers}
              value={singleTicker}
              onChange={setSingleTicker}
            />
          </div>
        )}

        {mode === "basket" && (
          <div className="flex items-center gap-2">
            <BasketTickerPill
              activeTicker={basketSymbol}
              onSelectTicker={(t: string) => setBasketSymbol(isBasketSymbol(t) ? t : "")}
            />
            {basketSymbol && (() => {
              const id = parseBasketSymbol(basketSymbol);
              const basket = id ? baskets.find((b) => b.id === id) : null;
              return basket ? (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {basket.tickers.length} constituents
                </span>
              ) : null;
            })()}
          </div>
        )}

        {mode === "industry" && (
          <div className="flex flex-col gap-1.5 w-full">
            <ClassificationFiltersWithSource
              workbookTickers={workbookTickers}
              filters={classFilters}
              onFiltersChange={setClassFilters}
              search={industrySearch}
              onSearchChange={setIndustrySearch}
              manualTickers={manualTickers}
              onManualTickersChange={setManualTickers}
              filteredCount={industryTickers.length}
              totalCount={workbookTickers.length}
              testIdPrefix="ss-class"
              source={classSource}
              onSourceChange={setClassSource}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-muted-foreground">
                {industryTickers.length === 0
                  ? "Pick at least one filter value"
                  : `${industryTickers.length} tickers · equal-weight composite · ${industryLabel}`}
              </span>
              {industryTickers.length > 0 && industryTickers.length <= 24 && (
                <span className="text-[9px] font-mono text-muted-foreground/70 truncate max-w-[600px]">
                  [{industryTickers.slice(0, 24).join(", ")}
                  {industryTickers.length > 24 ? "…" : ""}]
                </span>
              )}
            </div>
          </div>
        )}

        {mode === "pair" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              A
            </span>
            <div className="min-w-[200px]">
              <UnifiedTickerPicker
                tickers={workbookTickers}
                value={pairA}
                onChange={setPairA}
                label=""
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">/</span>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              B
            </span>
            <div className="min-w-[200px]">
              <UnifiedTickerPicker
                tickers={workbookTickers}
                value={pairB}
                onChange={setPairB}
                label=""
              />
            </div>
          </div>
        )}

        {mode === "pairCombo" && (
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              Pair Combo — Leg Set
            </label>
            {pairComboCtx.ui}
            {pairComboCtx.pairs.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1">
                  Anchor
                </span>
                {pairComboCtx.pairs.map(
                  (pair: { a: string; b: string; label: string }) => {
                    const isActive =
                      (pair.a === pairA && pair.b === pairB) ||
                      (pair.a === pairB && pair.b === pairA);
                    return (
                      <button
                        key={pair.label}
                        onClick={() => { setPairA(pair.a); setPairB(pair.b); }}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          isActive
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                            : "bg-card text-muted-foreground border-border hover:text-foreground"
                        }`}
                        data-testid={`ss-pc-anchor-${pair.label}`}
                      >
                        {pair.label}
                      </button>
                    );
                  }
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Algo controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Algo
          </label>
          <select
            value={algo}
            onChange={(e) => setAlgo(e.target.value)}
            className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
            data-testid="ss-algo-select"
            title={(algoMeta as Record<string, { tooltip: string }>)[algo]?.tooltip}
          >
            {(algoKeys as string[]).map((k) => (
              <option
                key={k}
                value={k}
                title={(algoMeta as Record<string, { tooltip: string }>)[k]?.tooltip}
              >
                {(algoMeta as Record<string, { label: string }>)[k]?.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setConsensusMode((prev) => !prev)}
            className={`text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${
              consensusMode
                ? "border-amber-500 bg-amber-500/15 text-amber-300"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            data-testid="ss-consensus-toggle"
            title="Run all selected presets in parallel and show consensus across feature subspaces"
          >
            Consensus {consensusMode ? "ON" : "OFF"}
          </button>

          {isMultiMode && (
            <button
              onClick={() => {
                setPerTickerMode((prev) => {
                  const next = !prev;
                  if (!next) {
                    runToken.cancelled = true;
                    setPerTickerRunning(false);
                    setPerTickerResults(null);
                    setPerTickerError(null);
                  }
                  return next;
                });
              }}
              className={`text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${
                perTickerMode
                  ? "border-amber-500 bg-amber-500/15 text-amber-300"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              data-testid="ss-per-ticker-toggle"
              title="Instead of building one composite, run the algorithm on each constituent ticker individually"
            >
              Per-ticker {perTickerMode ? "ON" : "OFF"}
            </button>
          )}

          {isMultiMode && perTickerMode && (
            <button
              onClick={runPerTicker}
              disabled={constituentList.length === 0 || perTickerRunning}
              className="text-[10px] font-mono px-2 py-0.5 border border-amber-500/60 bg-amber-500/10 text-amber-300 rounded hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="ss-per-ticker-run"
              title={
                mode === "pairCombo"
                  ? "Run algorithm on each pair in the leg set"
                  : "Run algorithm on each constituent ticker"
              }
            >
              {perTickerRunning
                ? `Running… ${perTickerProgress.done}/${perTickerProgress.total}`
                : mode === "pairCombo"
                ? `Run on ${constituentList.length} pair${constituentList.length === 1 ? "" : "s"}`
                : `Run on ${constituentList.length} ticker${constituentList.length === 1 ? "" : "s"}`}
            </button>
          )}

          {algo === "dtw" && (
            <>
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Window
              </label>
              <select
                value={dtwWindow}
                onChange={(e) => setDtwWindow(Number(e.target.value))}
                className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
                data-testid="ss-dtw-window"
                title="Length of the recent log-return trajectory to match"
              >
                {[20, 30, 40, 60, 90, 120, 180, 252].map((v) => (
                  <option key={v} value={v}>
                    {v}b
                  </option>
                ))}
              </select>
            </>
          )}

          {algo === "kernel" && (
            <>
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                h
              </label>
              <select
                value={kernelH}
                onChange={(e) => setKernelH(Number(e.target.value))}
                className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
                data-testid="ss-kernel-h"
                title="Gaussian-kernel bandwidth (in z-distance units). Auto picks the median nearest-3N distance."
              >
                <option value={0}>auto</option>
                <option value={0.5}>0.5</option>
                <option value={1}>1.0</option>
                <option value={1.5}>1.5</option>
                <option value={2}>2.0</option>
                <option value={3}>3.0</option>
              </select>
            </>
          )}

          {algo === "regime" && (
            <>
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                K
              </label>
              <select
                value={regimeK}
                onChange={(e) => setRegimeK(Number(e.target.value))}
                className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
                data-testid="ss-regime-k"
                title="Number of K-Means clusters"
              >
                {[2, 3, 4, 5, 6, 8, 10, 12].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            N
          </label>
          <select
            value={nNeighbors}
            onChange={(e) => setNNeighbors(Number(e.target.value))}
            className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
            data-testid="ss-n-select"
            title={
              algo === "kernel"
                ? "N controls how many neighbors appear in the matched-dates table; weighted summary uses up to 3N"
                : "Number of nearest neighbors"
            }
          >
            {[10, 20, 30, 50, 100].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>

          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Exclude last
          </label>
          <select
            value={exclusion}
            onChange={(e) => setExclusion(Number(e.target.value))}
            className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
            data-testid="ss-exclusion-select"
          >
            <option value={63}>3M</option>
            <option value={126}>6M</option>
            <option value={252}>1Y</option>
            <option value={504}>2Y</option>
          </select>

          <label
            className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider"
            title="How far back to search for similar setups. Default (All) uses every bar Yahoo returns — for older REITs that can reach back to the 1990s."
          >
            Search history
          </label>
          <select
            value={lookbackBars}
            onChange={(e) => setLookbackBars(Number(e.target.value))}
            className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
            data-testid="ss-lookback-select"
            title="Limit the candidate pool to bars within this lookback (counted from today, then trimmed by Exclude last). 'All' = full available history."
          >
            <option value={0}>All</option>
            <option value={756}>3Y</option>
            <option value={1260}>5Y</option>
            <option value={2520}>10Y</option>
            <option value={3780}>15Y</option>
            <option value={5040}>20Y</option>
          </select>
        </div>
      </div>

      {/* Consensus presets row */}
      {consensusMode && (
        <div className="px-3 py-2 border-b border-border bg-amber-500/5 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono text-amber-300 uppercase tracking-wider mr-1">
            Consensus presets
          </span>
          {Object.keys(featurePresets as Record<string, unknown>).map((presetName) => {
            const active = consensusPresets.has(presetName);
            return (
              <button
                key={presetName}
                onClick={() =>
                  setConsensusPresets((prev) => {
                    const next = new Set(prev);
                    next.has(presetName) ? next.delete(presetName) : next.add(presetName);
                    return next;
                  })
                }
                className={`text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${
                  active
                    ? "border-amber-500 bg-amber-500/15 text-amber-300"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                data-testid={`ss-consensus-preset-${presetName}`}
              >
                {presetName}
              </button>
            );
          })}
          <button
            onClick={() =>
              setConsensusPresets(
                new Set(Object.keys(featurePresets as Record<string, unknown>))
              )
            }
            className="text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent ml-2"
          >
            All
          </button>
          <button
            onClick={() => setConsensusPresets(new Set())}
            className="text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            None
          </button>
          <span className="text-[10px] font-mono text-muted-foreground/70 ml-2">
            {consensusPresets.size} preset{consensusPresets.size === 1 ? "" : "s"} selected
          </span>
        </div>
      )}

      {/* Feature selector */}
      <div className="px-3 py-2 border-b border-border bg-card/40 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mr-1">
            Features
          </span>
          <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Preset
          </label>
          <select
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__none__") return;
              const features = (featurePresets as Record<string, string[]>)[val];
              if (features) setEnabledFeatures(new Set(features));
              e.target.value = "__none__";
            }}
            defaultValue="__none__"
            className="text-[10px] font-mono px-2 py-0.5 bg-background border border-border rounded text-foreground"
            data-testid="ss-preset-select"
          >
            <option value="__none__">(apply preset…)</option>
            {Object.keys(featurePresets as Record<string, unknown>).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const next = new Set<string>();
              for (const k of featureKeys as string[]) {
                if (!isFeatureDisabled(k)) next.add(k);
              }
              setEnabledFeatures(next);
            }}
            className="text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            All
          </button>
          <button
            onClick={() => setEnabledFeatures(new Set(defaultFeatures as string[]))}
            className="text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            Default
          </button>
          <button
            onClick={() => setEnabledFeatures(new Set())}
            className="text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            None
          </button>
          <span className="text-[10px] font-mono text-muted-foreground/70 ml-2">
            {enabledFeatures.size}/
            {(featureKeys as string[]).length +
              Object.keys(featureKeys as Record<string, unknown>).length}{" "}
            enabled
          </span>
        </div>

        {FEATURE_CATEGORIES.map((category) => {
          const keys =
            category === "Time"
              ? Object.keys(featureKeys as Record<string, unknown>)
              : (featureKeys as string[]).filter(
                  (k) =>
                    (featureMeta as Record<string, { category: string }>)[k]?.category ===
                    category
                );
          if (keys.length === 0) return null;
          return (
            <div key={category} className="flex items-start gap-1.5 flex-wrap">
              <span className="text-[9px] font-mono text-muted-foreground/70 uppercase tracking-wider w-24 pt-0.5 shrink-0">
                {category}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {keys.map((key) => {
                  const enabled = enabledFeatures.has(key);
                  const disabled = isFeatureDisabled(key);
                  const meta = (featureMeta as Record<string, { label: string; requiresVolume?: boolean; requiresBench?: boolean }>)[key]
                    ?? (featureKeys as Record<string, { label: string; requiresVolume?: boolean; requiresBench?: boolean }>)[key];
                  let tooltip = meta?.label ?? key;
                  if (disabled && meta?.requiresVolume)
                    tooltip += " — needs volume (single-ticker mode only)";
                  if (disabled && meta?.requiresBench)
                    tooltip += " — SPY benchmark not loaded";
                  return (
                    <button
                      key={key}
                      disabled={disabled}
                      title={tooltip}
                      onClick={() =>
                        setEnabledFeatures((prev) => {
                          const next = new Set(prev);
                          next.has(key) ? next.delete(key) : next.add(key);
                          return next;
                        })
                      }
                      className={`text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${
                        disabled
                          ? "border-border/40 text-muted-foreground/40 cursor-not-allowed"
                          : enabled
                          ? "border-amber-500 bg-amber-500/15 text-amber-300"
                          : "border-border hover:bg-accent text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`ss-feature-${key}`}
                    >
                      {meta?.label ?? key}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Today z-scores bar */}
      {mainResult && (
        <div className="px-3 py-1.5 border-b border-border bg-card/30 text-[10px] font-mono text-muted-foreground/80 overflow-x-auto whitespace-nowrap">
          today z:{" "}
          {mainResult.enabledList.map((key, idx) => (
            <span key={key} className="mr-2">
              {featureLabelOf(key)}=
              <span className="text-foreground">
                {mainResult.todayZ[idx].toFixed(2)}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 min-h-0 overflow-auto">
        {seriesLoading && (
          <div className="px-3 py-6 flex items-center gap-2 text-muted-foreground text-[11px] font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading price series…
          </div>
        )}

        {!seriesLoading && seriesError && (
          <div className="px-3 py-6 flex items-center gap-2 text-red-400 text-[11px] font-mono">
            <AlertCircle className="w-3.5 h-3.5" />
            {seriesError}
          </div>
        )}

        {!seriesLoading && !seriesError && !priceSeries && !perTickerMode && (
          <div className="px-3 py-6 text-[11px] font-mono text-muted-foreground">
            {mode === "single" && "Select a ticker to begin."}
            {mode === "basket" && "Pick a basket to begin."}
            {mode === "industry" &&
              "Pick a classification dim + value to build a composite."}
            {mode === "pair" &&
              "Pick both legs (A and B) to compute a pair-ratio series."}
            {mode === "pairCombo" &&
              "Pick a leg set and choose an anchor pair to compute a pair-ratio series."}
          </div>
        )}

        {!seriesLoading && priceSeries && priceSeries.closes.length < 252 && !perTickerMode && (
          <div className="px-3 py-6 text-[11px] font-mono text-muted-foreground">
            Need ≥252 bars to run; got {priceSeries.closes.length}.
          </div>
        )}

        {!seriesLoading && priceSeries && priceSeries.closes.length >= 252 && !mainResult && !perTickerMode && (
          <div className="px-3 py-6 text-[11px] font-mono text-muted-foreground">
            Need at least one feature enabled with finite z-scores at the latest bar.
          </div>
        )}

        {perTickerMode && (
          <PerTickerTable
            rows={sortedPerTicker}
            running={perTickerRunning}
            progress={perTickerProgress}
            error={perTickerError}
            sort={perTickerSort}
            onSort={handlePerTickerSort}
            onTickerClick={(ticker) => {
              setPerTickerMode(false);
              runToken.cancelled = true;
              runToken.token++;
              if (ticker.includes("/")) {
                const [a, b] = ticker
                  .split("/")
                  .map((s) => s.trim().toUpperCase());
                if (a && b) { setPairA(a); setPairB(b); return; }
              }
              setMode("single");
              setSingleTicker(ticker);
            }}
            sourceCount={constituentList.length}
            unitLabel={mode === "pairCombo" ? "pair" : "ticker"}
          />
        )}

        {!perTickerMode && consensusMode && consensusResult && (
          <ConsensusView consensus={consensusResult} />
        )}

        {!perTickerMode && !consensusMode && mainResult && (
          <>
            {/* Forward return stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
              <StatCard label="Forward 1M" stats={mainResult.h1M} />
              <StatCard label="Forward 3M" stats={mainResult.h3M} />
              <StatCard label="Forward 6M" stats={mainResult.h6M} />
              <StatCard label="Forward 1Y" stats={mainResult.h1Y} />
            </div>

            {/* Matched dates table */}
            {mainResult.matches.length > 0 && (
              <details className="border-t border-border" open>
                <summary className="px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer select-none bg-card/40">
                  Show top-{mainResult.matches.length} matched dates
                </summary>
                <div className="px-3 pb-2 overflow-x-auto max-h-[60vh]">
                  <table className="w-full text-[10px] font-mono">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-muted-foreground/70 uppercase tracking-wider">
                        <th
                          className="text-left font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleMatchSort("date", "asc")}
                          title="Sort by date"
                        >
                          Date{matchSortSuffix("date")}
                        </th>
                        {mainResult.enabledList.map((key, idx) => (
                          <th
                            key={key}
                            className="text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground"
                            onClick={() => handleMatchSort(`z:${idx}`, "desc")}
                            title={`Sort by ${featureLabelOf(key)} z-score`}
                          >
                            {featureLabelOf(key)} z{matchSortSuffix(`z:${idx}`)}
                          </th>
                        ))}
                        <th
                          className="text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleMatchSort("distance", "asc")}
                          title="Sort by distance (closer = more similar)"
                        >
                          dist{matchSortSuffix("distance")}
                        </th>
                        {algo === "kernel" && (
                          <th
                            className="text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground"
                            onClick={() => handleMatchSort("weight", "desc")}
                            title="Sort by kernel weight"
                          >
                            wt{matchSortSuffix("weight")}
                          </th>
                        )}
                        <th
                          className="text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleMatchSort("fwd1M", "desc")}
                          title="Sort by forward 1M return"
                        >
                          fwd 1M{matchSortSuffix("fwd1M")}
                        </th>
                        <th
                          className="text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleMatchSort("fwd3M", "desc")}
                          title="Sort by forward 3M return"
                        >
                          fwd 3M{matchSortSuffix("fwd3M")}
                        </th>
                        <th
                          className="text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleMatchSort("fwd6M", "desc")}
                          title="Sort by forward 6M return"
                        >
                          fwd 6M{matchSortSuffix("fwd6M")}
                        </th>
                        <th
                          className="text-right font-normal py-1 cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleMatchSort("fwd1Y", "desc")}
                          title="Sort by forward 1Y return"
                        >
                          fwd 1Y{matchSortSuffix("fwd1Y")}
                        </th>
                        <th className="py-1 pl-2" title="Save match as a drawing" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMatches.map((match) => (
                        <tr
                          key={match.date}
                          className="border-t border-border/40"
                        >
                          <td className="text-foreground pr-3 py-0.5">
                            {match.date}
                          </td>
                          {match.zVec.map((z, idx) => (
                            <td
                              key={idx}
                              className="text-right text-muted-foreground pr-3 py-0.5"
                            >
                              {z.toFixed(2)}
                            </td>
                          ))}
                          <td className="text-right text-muted-foreground pr-3 py-0.5">
                            {match.distance.toFixed(2)}
                          </td>
                          {algo === "kernel" && (
                            <td className="text-right text-muted-foreground pr-3 py-0.5">
                              {(match.weight * 100).toFixed(1)}%
                            </td>
                          )}
                          <td
                            className={`text-right pr-3 py-0.5 ${
                              Number.isFinite(match.fwd1M)
                                ? match.fwd1M >= 0
                                  ? "text-green-400"
                                  : "text-red-400"
                                : "text-muted-foreground/50"
                            }`}
                          >
                            {fmtReturn(match.fwd1M)}
                          </td>
                          <td
                            className={`text-right pr-3 py-0.5 ${
                              Number.isFinite(match.fwd3M)
                                ? match.fwd3M >= 0
                                  ? "text-green-400"
                                  : "text-red-400"
                                : "text-muted-foreground/50"
                            }`}
                          >
                            {fmtReturn(match.fwd3M)}
                          </td>
                          <td
                            className={`text-right pr-3 py-0.5 ${
                              Number.isFinite(match.fwd6M)
                                ? match.fwd6M >= 0
                                  ? "text-green-400"
                                  : "text-red-400"
                                : "text-muted-foreground/50"
                            }`}
                          >
                            {fmtReturn(match.fwd6M)}
                          </td>
                          <td
                            className={`text-right py-0.5 ${
                              Number.isFinite(match.fwd1Y)
                                ? match.fwd1Y >= 0
                                  ? "text-green-400"
                                  : "text-red-400"
                                : "text-muted-foreground/50"
                            }`}
                          >
                            {fmtReturn(match.fwd1Y)}
                          </td>
                          <td className="pl-2 py-0.5">
                            <button
                              title="Save as pattern drawing for this ticker"
                              data-testid={`ss-save-pattern-${match.date}`}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 whitespace-nowrap"
                              onClick={() => {
                                const ticker = singleTicker || pairA;
                                if (!ticker) return;
                                // Use match.date as start; approximate 30-day window as end
                                const startDt = new Date(match.date);
                                const endDt = new Date(startDt);
                                endDt.setDate(endDt.getDate() + 30);
                                const endDate = endDt.toISOString().slice(0, 10);
                                const closePrices = priceSeries?.closes;
                                const times = priceSeries?.times;
                                const idx = times ? times.indexOf(match.date) : -1;
                                const price = (closePrices && idx >= 0) ? closePrices[idx] : 0;
                                saveDrawing(ticker, {
                                  kind: "pattern",
                                  label: `SimilarSetup ${match.date}`,
                                  visible: true,
                                  style: defaultStyle({ color: "#f97316" }),
                                  start: { date: match.date, price },
                                  end: { date: endDate, price: price * 1.05 },
                                  patternName: "SimilarSetup",
                                  sourceModule: "SimilarSetups",
                                });
                                // Toast
                                const toast = document.createElement("div");
                                toast.textContent = `Saved pattern ${match.date} for ${ticker}`;
                                toast.className = "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-amber-500/20 text-amber-300 text-xs font-mono border border-amber-500/40 shadow-lg";
                                document.body.appendChild(toast);
                                setTimeout(() => toast.remove(), 2500);
                              }}
                            >
                              <BookMarked className="w-3 h-3 inline mr-0.5" />
                              Pin
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
