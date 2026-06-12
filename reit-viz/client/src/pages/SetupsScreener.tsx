// Reconstructed from recovered-bundle/SetupsScreener-BjAZdHTT.js on 2026-06-11
import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useBaskets } from "@/lib/baskets";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { fetchOhlcSeries } from "@/lib/fetchOhlcSeries";
import { fetchCloseSeries } from "@/lib/fetchCloseSeries";
import { useGlobalUniverse } from "@/lib/globalUniverse";
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
import { Play as PlayIcon } from "@/lib/icons";
import { Sparkles, Zap, Loader2, X, AlertCircle, SortAsc, SortDesc } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AlgoKey = string;
type Horizon = "1M" | "3M" | "6M" | "1Y";
type SortDir = "asc" | "desc";
type UniverseMode = "all" | "classification" | "basket" | "global";

interface TickerRow {
  ticker: string;
  [key: string]: unknown;
}

interface HorizonStats {
  med?: number;
  mean?: number;
  p25?: number;
  p75?: number;
  hL?: number;
  hS?: number;
  bL?: number;
  bS?: number;
}

interface TickerResult {
  ticker: string;
  status: "pending" | "running" | "ok" | "skipped" | "error";
  errorMsg?: string;
  matchN?: number;
  baseN?: number;
  composite?: number;
  // horizons
  median1M?: number; mean1M?: number; p25_1M?: number; p75_1M?: number;
  hitLong1M?: number; hitShort1M?: number; baseLong1M?: number; baseShort1M?: number;
  median3M?: number; mean3M?: number; p25_3M?: number; p75_3M?: number;
  hitLong3M?: number; hitShort3M?: number; baseLong3M?: number; baseShort3M?: number;
  median6M?: number; mean6M?: number;
  hitLong6M?: number; hitShort6M?: number; baseLong6M?: number; baseShort6M?: number;
  median1Y?: number; mean1Y?: number;
  hitLong1Y?: number; hitShort1Y?: number; baseLong1Y?: number; baseShort1Y?: number;
  // consensus fields
  consensus_totalPresets?: number;
  consensus_validPresets?: number;
  consensus_perPreset?: { preset: string; n: number; med1M: number; med3M: number; med6M: number; med1Y: number }[];
  consensus_sd1M?: number; consensus_sd3M?: number; consensus_sd6M?: number; consensus_sd1Y?: number;
  consensus_long3M?: number; consensus_short3M?: number;
  consensus_agreement?: number;
  consensus_direction?: "long" | "short" | "mixed";
  consensus_snr?: number;
  consensus_verdict?: string;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function normalizeZ(arr: number[]): number[] {
  const finite = arr.filter(Number.isFinite);
  if (finite.length < 30) return arr.map(() => NaN);
  const mean = finite.reduce((s, v) => s + v, 0) / finite.length;
  const std = Math.sqrt(finite.reduce((s, v) => s + (v - mean) ** 2, 0) / finite.length);
  return std > 0 ? arr.map(v => Number.isFinite(v) ? (v - mean) / std : NaN) : arr.map(() => NaN);
}

function computeWeightedStats(zArr: number[], fwdArr: number[], weights?: number[]): {
  median: number; mean: number; p25: number; p75: number;
  hitLong: number; hitShort: number; baseLong: number; baseShort: number;
  n: number; baseN: number;
} | null {
  const items: { v: number; w: number }[] = [];
  for (let i = 0; i < zArr.length; i++) {
    if (Number.isFinite(zArr[i])) {
      const w = weights ? (weights[i] ?? 0) : 1;
      if (w > 0) items.push({ v: zArr[i], w });
    }
  }
  if (items.length === 0) return null;
  items.sort((a, b) => a.v - b.v);
  const totalW = items.reduce((s, x) => s + x.w, 0);
  const wPercentile = (p: number) => {
    const target = p * totalW;
    let cum = 0;
    for (const item of items) { cum += item.w; if (cum >= target) return item.v; }
    return items[items.length - 1].v;
  };
  const mean = items.reduce((s, x) => s + x.v * x.w, 0) / totalW;
  const hitLong = items.filter(x => x.v > 0).reduce((s, x) => s + x.w, 0);
  const hitShort = items.filter(x => x.v < 0).reduce((s, x) => s + x.w, 0);
  const finFwd = fwdArr.filter(Number.isFinite);
  const baseLong = finFwd.length > 0 ? finFwd.filter(v => v > 0).length / finFwd.length * 100 : NaN;
  const baseShort = finFwd.length > 0 ? finFwd.filter(v => v < 0).length / finFwd.length * 100 : NaN;
  return {
    median: wPercentile(0.5), mean, p25: wPercentile(0.25), p75: wPercentile(0.75),
    hitLong: hitLong / totalW * 100, hitShort: hitShort / totalW * 100,
    baseLong, baseShort, n: items.length, baseN: finFwd.length,
  };
}

function alignBenchCloses(tickerDates: string[], benchDates: string[], benchCloses: number[]): number[] {
  const benchMap = new Map<string, number>();
  for (let i = 0; i < benchDates.length; i++) {
    const c = benchCloses[i];
    if (Number.isFinite(c) && c > 0) benchMap.set(benchDates[i], c);
  }
  const result = new Array(tickerDates.length).fill(NaN);
  let lastVal = NaN;
  for (let i = 0; i < tickerDates.length; i++) {
    const v = benchMap.get(tickerDates[i]);
    if (typeof v === "number") { lastVal = v; result[i] = v; }
    else if (Number.isFinite(lastVal)) result[i] = lastVal;
  }
  return result;
}

async function loadOhlcData(ticker: string): Promise<{ times: string[]; closes: number[]; highs: number[]; lows: number[]; opens: number[]; volumes: number[]; hasVolume: boolean }> {
  let times: string[] = [], closes: number[] = [], highs: number[] = [], lows: number[] = [], opens: number[] = [], volumes: number[] = [], hasVolume = false;
  try {
    const data = await fetchOhlcSeries(ticker);
    if (data.dates.length) {
      times = data.dates; closes = data.closes; highs = data.highs; lows = data.lows;
      opens = data.opens; volumes = data.volumes;
      hasVolume = volumes.some(v => Number.isFinite(v) && v > 0);
    }
  } catch {
    const raw = await fetchCloseSeries(ticker);
    times = raw.map((r: { time: string }) => r.time);
    closes = raw.map((r: { close: number }) => r.close);
    highs = closes.slice(); lows = closes.slice(); opens = closes.slice();
    volumes = new Array(closes.length).fill(0);
  }
  return { times, closes, highs, lows, opens, volumes, hasVolume };
}

async function analyzeOneTicker(params: {
  ticker: string;
  benchDates: string[];
  benchClosesArr: number[];
  enabled: Set<string>;
  algo: AlgoKey;
  algoParams: { n: number; dtwWindow: number; kernelH: number; regimeK: number };
  exclusion: number;
  preFetched?: ReturnType<typeof loadOhlcData> extends Promise<infer T> ? T : never;
}): Promise<TickerResult> {
  const result: TickerResult = { ticker: params.ticker, status: "pending" };
  try {
    const ohlc = params.preFetched ?? await loadOhlcData(params.ticker);
    const { times, closes, highs, lows, opens, volumes, hasVolume } = ohlc;

    if (closes.length < 252) { result.status = "skipped"; result.errorMsg = `only ${closes.length} bars`; return result; }

    const benchAligned = alignBenchCloses(times, params.benchDates, params.benchClosesArr);
    const hasBench = benchAligned.some(v => Number.isFinite(v));

    const isDisabled = (key: string): boolean => {
      const def = (computeFeatures as Record<string, { requiresVolume?: boolean; requiresBench?: boolean }>)[key]
        ?? (featureMeta as Record<string, { requiresVolume?: boolean; requiresBench?: boolean }>)[key];
      return !!(def && ((def.requiresVolume && !hasVolume) || (def.requiresBench && !hasBench)));
    };

    const validFeatureKeys: string[] = (featureKeys as string[]).filter(k => params.enabled.has(k) && !isDisabled(k));
    const validTimeDimKeys: string[] = Object.keys(featureMeta as object).filter(k => params.enabled.has(k));

    if (validFeatureKeys.length + validTimeDimKeys.length === 0) {
      result.status = "skipped"; result.errorMsg = "no valid features"; return result;
    }

    const rawFeatures = (computeFeatures as Function)(validFeatureKeys, { closes, highs, lows, opens, volumes, benchCloses: hasBench ? benchAligned : undefined });
    const timeDims = (computeTimeDim as Function)(times);
    const normalizedMap: Record<string, number[]> = {};
    for (const k of validFeatureKeys) normalizedMap[k] = normalizeZ(rawFeatures[k] ?? new Array(closes.length).fill(NaN));
    for (const k of validTimeDimKeys) normalizedMap[k] = normalizeZ(timeDims[k] ?? new Array(closes.length).fill(NaN));

    const allKeys = [...validFeatureKeys, ...validTimeDimKeys];
    const lastIdx = closes.length - 1;
    const todayZ = allKeys.map(k => normalizedMap[k][lastIdx]);
    if (todayZ.some(v => !Number.isFinite(v))) { result.status = "skipped"; result.errorMsg = "today z has NaN"; return result; }

    const exclusionEnd = Math.max(0, lastIdx - params.exclusion);
    const candidates: { date: string; closeIdx: number; zVec: number[]; fwd1M: number; fwd3M: number; fwd6M: number; fwd1Y: number }[] = [];
    for (let d = 0; d <= exclusionEnd; d++) {
      const zVec = allKeys.map(k => normalizedMap[k][d]);
      if (zVec.some(v => !Number.isFinite(v))) continue;
      const price = closes[d];
      if (!(price > 0)) continue;
      const fwdReturn = (offset: number) => { const fi = d + offset; return fi >= closes.length || !(closes[fi] > 0) ? NaN : (closes[fi] / price - 1) * 100; };
      candidates.push({ date: times[d], closeIdx: d, zVec, fwd1M: fwdReturn(21), fwd3M: fwdReturn(63), fwd6M: fwdReturn(126), fwd1Y: fwdReturn(252) });
    }
    if (candidates.length === 0) { result.status = "skipped"; result.errorMsg = "no candidates"; return result; }

    const algoInput = {
      bars: candidates, todayZ, n: params.algoParams.n, closes, lastIdx,
      dtwWindow: params.algoParams.dtwWindow,
      kernelH: params.algoParams.kernelH > 0 ? params.algoParams.kernelH : NaN,
      regimeK: params.algoParams.regimeK,
    };
    const algoResult = (dispatchAlgo as Function)(params.algo, algoInput);
    if (algoResult.matches.length === 0) { result.status = "skipped"; result.errorMsg = "no matches"; return result; }

    const matchWeights = algoResult.matches.map((m: { weight: number }) => m.weight);
    const stats1M = computeWeightedStats(algoResult.matches.map((m: { fwd1M: number }) => m.fwd1M), candidates.map(c => c.fwd1M), matchWeights);
    const stats3M = computeWeightedStats(algoResult.matches.map((m: { fwd3M: number }) => m.fwd3M), candidates.map(c => c.fwd3M), matchWeights);
    const stats6M = computeWeightedStats(algoResult.matches.map((m: { fwd6M: number }) => m.fwd6M), candidates.map(c => c.fwd6M), matchWeights);
    const stats1Y = computeWeightedStats(algoResult.matches.map((m: { fwd1Y: number }) => m.fwd1Y), candidates.map(c => c.fwd1Y), matchWeights);

    result.status = "ok";
    result.matchN = algoResult.matches.length;
    result.baseN = candidates.length;
    if (stats1M) { result.median1M = stats1M.median; result.mean1M = stats1M.mean; result.p25_1M = stats1M.p25; result.p75_1M = stats1M.p75; result.hitLong1M = stats1M.hitLong; result.hitShort1M = stats1M.hitShort; result.baseLong1M = stats1M.baseLong; result.baseShort1M = stats1M.baseShort; }
    if (stats3M) { result.median3M = stats3M.median; result.mean3M = stats3M.mean; result.p25_3M = stats3M.p25; result.p75_3M = stats3M.p75; result.hitLong3M = stats3M.hitLong; result.hitShort3M = stats3M.hitShort; result.baseLong3M = stats3M.baseLong; result.baseShort3M = stats3M.baseShort; }
    if (stats6M) { result.median6M = stats6M.median; result.mean6M = stats6M.mean; result.hitLong6M = stats6M.hitLong; result.hitShort6M = stats6M.hitShort; result.baseLong6M = stats6M.baseLong; result.baseShort6M = stats6M.baseShort; }
    if (stats1Y) { result.median1Y = stats1Y.median; result.mean1Y = stats1Y.mean; result.hitLong1Y = stats1Y.hitLong; result.hitShort1Y = stats1Y.hitShort; result.baseLong1Y = stats1Y.baseLong; result.baseShort1Y = stats1Y.baseShort; }
    return result;
  } catch (err) {
    result.status = "error";
    result.errorMsg = err instanceof Error ? err.message : "error";
    return result;
  }
}

async function analyzeConsensus(params: {
  ticker: string;
  benchDates: string[];
  benchClosesArr: number[];
  algo: AlgoKey;
  algoParams: { n: number; dtwWindow: number; kernelH: number; regimeK: number };
  exclusion: number;
  presets: Record<string, string[]>;
}): Promise<TickerResult> {
  const result: TickerResult = { ticker: params.ticker, status: "pending" };
  try {
    const ohlc = await loadOhlcData(params.ticker);
    if (ohlc.closes.length < 252) { result.status = "skipped"; result.errorMsg = `only ${ohlc.closes.length} bars`; return result; }

    const presetKeys = Object.keys(params.presets);
    if (presetKeys.length === 0) { result.status = "skipped"; result.errorMsg = "no presets selected"; return result; }

    const perPreset: { preset: string; r: TickerResult }[] = [];
    for (const presetName of presetKeys) {
      const features = params.presets[presetName];
      const r = await analyzeOneTicker({ ...params, enabled: new Set(features), preFetched: ohlc as never });
      perPreset.push({ preset: presetName, r });
    }

    const valid = perPreset.filter(p => p.r.status === "ok" && Number.isFinite(p.r.median3M ?? NaN));
    result.consensus_totalPresets = perPreset.length;
    result.consensus_validPresets = valid.length;
    result.consensus_perPreset = perPreset.map(p => ({ preset: p.preset, n: p.r.matchN ?? 0, med1M: p.r.median1M ?? NaN, med3M: p.r.median3M ?? NaN, med6M: p.r.median6M ?? NaN, med1Y: p.r.median1Y ?? NaN }));

    if (valid.length === 0) { result.status = "skipped"; result.errorMsg = "no valid presets"; return result; }

    const weightedAvg = (vals: number[], ns: number[]): number => {
      let totalW = 0, sum = 0;
      for (let i = 0; i < vals.length; i++) { if (!Number.isFinite(vals[i])) continue; const w = Math.sqrt(ns[i] || 0); totalW += w; sum += vals[i] * w; }
      return totalW > 0 ? sum / totalW : NaN;
    };
    const stdArr = (arr: number[]): number => {
      const fin = arr.filter(Number.isFinite);
      if (fin.length < 2) return NaN;
      const m = fin.reduce((a, b) => a + b, 0) / fin.length;
      return Math.sqrt(fin.reduce((s, v) => s + (v - m) ** 2, 0) / (fin.length - 1));
    };

    const counts = valid.map(p => p.r.matchN ?? 0);
    const med1Ms = valid.map(p => p.r.median1M ?? NaN);
    const med3Ms = valid.map(p => p.r.median3M ?? NaN);
    const med6Ms = valid.map(p => p.r.median6M ?? NaN);
    const med1Ys = valid.map(p => p.r.median1Y ?? NaN);

    result.median1M = weightedAvg(med1Ms, counts);
    result.median3M = weightedAvg(med3Ms, counts);
    result.median6M = weightedAvg(med6Ms, counts);
    result.median1Y = weightedAvg(med1Ys, counts);
    result.consensus_sd1M = stdArr(med1Ms); result.consensus_sd3M = stdArr(med3Ms);
    result.consensus_sd6M = stdArr(med6Ms); result.consensus_sd1Y = stdArr(med1Ys);
    result.mean1M = weightedAvg(valid.map(p => p.r.mean1M ?? NaN), counts);
    result.mean3M = weightedAvg(valid.map(p => p.r.mean3M ?? NaN), counts);
    result.hitLong3M = weightedAvg(valid.map(p => p.r.hitLong3M ?? NaN), counts);
    result.hitShort3M = weightedAvg(valid.map(p => p.r.hitShort3M ?? NaN), counts);
    result.baseLong3M = weightedAvg(valid.map(p => p.r.baseLong3M ?? NaN), counts);
    result.baseShort3M = weightedAvg(valid.map(p => p.r.baseShort3M ?? NaN), counts);
    result.hitLong1M = weightedAvg(valid.map(p => p.r.hitLong1M ?? NaN), counts);
    result.hitShort1M = weightedAvg(valid.map(p => p.r.hitShort1M ?? NaN), counts);
    result.hitLong6M = weightedAvg(valid.map(p => p.r.hitLong6M ?? NaN), counts);
    result.hitShort6M = weightedAvg(valid.map(p => p.r.hitShort6M ?? NaN), counts);
    result.hitLong1Y = weightedAvg(valid.map(p => p.r.hitLong1Y ?? NaN), counts);
    result.hitShort1Y = weightedAvg(valid.map(p => p.r.hitShort1Y ?? NaN), counts);
    result.matchN = valid.reduce((s, p) => s + (p.r.matchN ?? 0), 0);
    result.baseN = valid.reduce((s, p) => s + (p.r.baseN ?? 0), 0);

    const longCount = med3Ms.filter(v => Number.isFinite(v) && v > 0).length;
    const shortCount = med3Ms.filter(v => Number.isFinite(v) && v < 0).length;
    const agreement = Math.max(longCount, shortCount) / med3Ms.length;
    const direction: "long" | "short" | "mixed" = longCount > shortCount ? "long" : shortCount > longCount ? "short" : "mixed";
    result.consensus_long3M = longCount; result.consensus_short3M = shortCount;
    result.consensus_agreement = agreement; result.consensus_direction = direction;

    const snr = Number.isFinite(result.consensus_sd3M) && result.consensus_sd3M! > 0 ? Math.abs(result.median3M ?? 0) / result.consensus_sd3M! : NaN;
    result.consensus_snr = snr;

    let verdict = "Mixed — no clear direction";
    if (direction !== "mixed") {
      if (agreement >= 0.8 && (snr >= 1 || !Number.isFinite(snr))) verdict = `Strong ${direction}`;
      else if (agreement >= 0.66) verdict = `Moderate ${direction}`;
      else if (agreement >= 0.55) verdict = `Weak ${direction}`;
      else verdict = `Mixed — ${direction} leaning`;
    }
    result.consensus_verdict = verdict;
    result.status = "ok";
    return result;
  } catch (err) {
    result.status = "error";
    result.errorMsg = err instanceof Error ? err.message : "error";
    return result;
  }
}

// ─── Horizon accessor ─────────────────────────────────────────────────────────

function getHorizonStats(row: TickerResult, horizon: Horizon): HorizonStats {
  const map: Record<Horizon, HorizonStats> = {
    "1M": { med: row.median1M, mean: row.mean1M, p25: row.p25_1M, p75: row.p75_1M, hL: row.hitLong1M, hS: row.hitShort1M, bL: row.baseLong1M, bS: row.baseShort1M },
    "3M": { med: row.median3M, mean: row.mean3M, p25: row.p25_3M, p75: row.p75_3M, hL: row.hitLong3M, hS: row.hitShort3M, bL: row.baseLong3M, bS: row.baseShort3M },
    "6M": { med: row.median6M, mean: row.mean6M, p25: undefined, p75: undefined, hL: row.hitLong6M, hS: row.hitShort6M, bL: row.baseLong6M, bS: row.baseShort6M },
    "1Y": { med: row.median1Y, mean: row.mean1Y, p25: undefined, p75: undefined, hL: row.hitLong1Y, hS: row.hitShort1Y, bL: row.baseLong1Y, bS: row.baseShort1Y },
  };
  return map[horizon];
}

function compositeScore(row: TickerResult, horizon: Horizon, consensus: boolean): number {
  const h = getHorizonStats(row, horizon);
  if (consensus) {
    if (!Number.isFinite(h.med ?? NaN)) return NaN;
    const n = row.matchN ?? 0;
    if (n <= 0) return NaN;
    const agreement = row.consensus_agreement ?? 0;
    const snr = row.consensus_snr;
    const snrFactor = Number.isFinite(snr) ? Math.min(2, Math.max(0, snr!)) : 1;
    return (h.med ?? 0) * Math.sqrt(n) * agreement * snrFactor;
  }
  if (!Number.isFinite(h.med ?? NaN) || !Number.isFinite(h.hL ?? NaN) || !row.matchN) return NaN;
  const edge = (h.hL ?? 0) - (h.bL ?? 50);
  return (h.med ?? 0) * Math.sqrt(row.matchN) * (edge / 50);
}

// ─── TopSetupsList mini-component ─────────────────────────────────────────────

function TopSetupsList({ title, tone, rows, horizon, onOpen }: { title: string; tone: "long" | "short"; rows: TickerResult[]; horizon: Horizon; onOpen: (ticker: string) => void }) {
  const colorClass = tone === "long" ? "text-green-400" : "text-red-400";
  const retColor = (v: number | undefined) => Number.isFinite(v ?? NaN) ? ((v ?? 0) >= 0 ? "text-green-400" : "text-red-400") : "text-muted-foreground/50";
  return (
    <div className="bg-card px-3 py-2">
      <div className={`text-[10px] font-mono uppercase tracking-wider mb-1 ${colorClass}`}>{title} · {horizon}</div>
      {rows.length === 0 ? (
        <div className="text-[10px] font-mono text-muted-foreground py-1">(none)</div>
      ) : (
        <table className="w-full text-[10px] font-mono">
          <thead><tr className="text-muted-foreground/70 uppercase tracking-wider">
            <th className="text-left font-normal py-0.5 pr-2">#</th>
            <th className="text-left font-normal py-0.5 pr-2">Ticker</th>
            <th className="text-right font-normal py-0.5 pr-2">Composite</th>
            <th className="text-right font-normal py-0.5 pr-2">Median</th>
            <th className="text-right font-normal py-0.5 pr-2">L%</th>
            <th className="text-right font-normal py-0.5">S%</th>
          </tr></thead>
          <tbody>
            {rows.map((row, idx) => {
              const h = getHorizonStats(row, horizon);
              return (
                <tr key={row.ticker} onClick={() => onOpen(row.ticker)} className="hover:bg-accent/30 cursor-pointer border-t border-border/30">
                  <td className="py-0.5 pr-2 text-muted-foreground/60">{idx + 1}</td>
                  <td className="py-0.5 pr-2 text-foreground font-semibold">{row.ticker}</td>
                  <td className={`text-right py-0.5 pr-2 ${retColor(row.composite)}`}>{Number.isFinite(row.composite ?? NaN) ? (row.composite! >= 0 ? "+" : "") + row.composite!.toFixed(2) : "—"}</td>
                  <td className={`text-right py-0.5 pr-2 ${retColor(h.med)}`}>{Number.isFinite(h.med ?? NaN) ? `${(h.med! >= 0 ? "+" : "")}${h.med!.toFixed(1)}%` : "—"}</td>
                  <td className="text-right py-0.5 pr-2 text-green-400">{Number.isFinite(h.hL ?? NaN) ? `${h.hL!.toFixed(0)}` : "—"}</td>
                  <td className="text-right py-0.5 text-red-400">{Number.isFinite(h.hS ?? NaN) ? `${h.hS!.toFixed(0)}` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const CLASSIFICATION_DIMS = ["sector", "industry", "subindustry", "subsector", "supersector"];

export default function SetupsScreener() {
  const { baskets } = useBaskets();
  const [, navigate] = useLocation();
  const [workbookTickers, setWorkbookTickers] = useState<TickerRow[]>([]);

  useEffect(() => {
    let active = true;
    fetchWorkbookTickers().then((tickers: TickerRow[]) => { if (active) setWorkbookTickers(tickers); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Universe controls
  const [universeMode, setUniverseMode] = useState<UniverseMode>("all");
  const [classifyDim, setClassifyDim] = useState("sector");
  const [classifyVal, setClassifyVal] = useState("");
  const [basketId, setBasketId] = useState("");
  const { metas: globalMetas, loading: globalLoading, error: globalError } = useGlobalUniverse();
  const [globalDim, setGlobalDim] = useState("sector");
  const [globalDimVal, setGlobalDimVal] = useState("");

  // Algo controls
  const [algo, setAlgo] = useState<AlgoKey>("knn");
  const [dtwWindow, setDtwWindow] = useState(60);
  const [kernelH, setKernelH] = useState(0);
  const [regimeK, setRegimeK] = useState(5);
  const [nNeighbors, setNNeighbors] = useState(20);
  const [exclusion, setExclusion] = useState(252);
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(() => new Set(defaultFeatures as string[]));
  const [selectedHorizon, setSelectedHorizon] = useState<Horizon>("3M");
  const [consensusMode, setConsensusMode] = useState(false);
  const [consensusPresets, setConsensusPresets] = useState<Set<string>>(() => new Set(Object.keys(featurePresets as object).filter(k => k !== "Classic (6)")));

  // Sort
  const [sortCol, setSortCol] = useState("composite");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Run state
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<TickerResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // Classify dimension values
  const classifyValues = useMemo(() => {
    const vals = new Set<string>();
    for (const t of workbookTickers) { const v = t[classifyDim]; if (v) vals.add(String(v)); }
    return Array.from(vals).sort();
  }, [workbookTickers, classifyDim]);

  const globalDimValues = useMemo(() => {
    const vals = new Set<string>();
    for (const m of globalMetas) { const v = (m as Record<string, unknown>)[globalDim]; if (v) vals.add(String(v)); }
    return Array.from(vals).sort();
  }, [globalMetas, globalDim]);

  useEffect(() => {
    if (universeMode === "classification" && classifyValues.length && !classifyValues.includes(classifyVal)) setClassifyVal(classifyValues[0]);
  }, [universeMode, classifyValues, classifyVal]);

  const universeTickers = useMemo(() => {
    if (universeMode === "global") {
      if (globalMetas.length === 0) return [];
      if (globalDimVal) return globalMetas.filter(m => String((m as Record<string, unknown>)[globalDim] ?? "") === globalDimVal).map(m => (m as { ticker: string }).ticker);
      return globalMetas.map(m => (m as { ticker: string }).ticker);
    }
    if (workbookTickers.length === 0) return [];
    if (universeMode === "all") return workbookTickers.map(t => t.ticker);
    if (universeMode === "classification" && classifyVal) return workbookTickers.filter(t => String(t[classifyDim] ?? "") === classifyVal).map(t => t.ticker);
    if (universeMode === "basket" && basketId) { const b = baskets.find(b => b.id === basketId); return b ? b.tickers : []; }
    return [];
  }, [workbookTickers, universeMode, classifyDim, classifyVal, basketId, baskets, globalMetas, globalDim, globalDimVal]);

  const handleRun = async () => {
    if (universeTickers.length === 0) { setErrorMsg("Universe is empty"); return; }
    setErrorMsg(null);
    setIsRunning(true);
    cancelRef.current = false;
    setProgress({ done: 0, total: universeTickers.length });
    setResults(universeTickers.map(ticker => ({ ticker, status: "pending" })));

    let benchDates: string[] = [], benchCloses: number[] = [];
    try {
      const spyData = await fetchOhlcSeries("SPY");
      benchDates = spyData.dates; benchCloses = spyData.closes;
    } catch { /**/ }

    const algoParams = { n: nNeighbors, dtwWindow, kernelH, regimeK };
    const presetsMap: Record<string, string[]> = {};
    if (consensusMode) {
      for (const key of Object.keys(featurePresets as object)) {
        if (consensusPresets.has(key)) presetsMap[key] = (featurePresets as Record<string, string[]>)[key];
      }
      if (Object.keys(presetsMap).length === 0) { setErrorMsg("Consensus mode requires at least one selected preset"); setIsRunning(false); return; }
    }

    const BATCH = consensusMode ? 4 : 6;
    const queue = [...universeTickers];
    let done = 0;

    while (queue.length > 0 && !cancelRef.current) {
      const batch = queue.splice(0, BATCH);
      setResults(prev => prev.map(r => batch.includes(r.ticker) ? { ...r, status: "running" } : r));
      const batchResults = await Promise.all(batch.map(ticker =>
        consensusMode
          ? analyzeConsensus({ ticker, benchDates, benchClosesArr: benchCloses, algo, algoParams, exclusion, presets: presetsMap })
          : analyzeOneTicker({ ticker, benchDates, benchClosesArr: benchCloses, enabled: enabledFeatures, algo, algoParams, exclusion })
      ));
      done += batchResults.length;
      setProgress({ done, total: universeTickers.length });
      setResults(prev => {
        const updated = prev.slice();
        for (const r of batchResults) { const idx = updated.findIndex(x => x.ticker === r.ticker); if (idx >= 0) updated[idx] = r; }
        return updated;
      });
    }
    setIsRunning(false);
    cancelRef.current = false;
  };

  const handleCancel = () => { cancelRef.current = true; };

  const resultsWithComposite = useMemo(() => results.map(r => r.status === "ok" ? { ...r, composite: compositeScore(r, selectedHorizon, consensusMode) } : r), [results, selectedHorizon, consensusMode]);

  const sortedResults = useMemo(() => {
    const ok = resultsWithComposite.filter(r => r.status === "ok");
    const other = resultsWithComposite.filter(r => r.status !== "ok");
    const getVal = (r: TickerResult): number | string => {
      const h = getHorizonStats(r, selectedHorizon);
      switch (sortCol) {
        case "ticker": return r.ticker;
        case "median": return h.med ?? NaN;
        case "mean": return h.mean ?? NaN;
        case "p25": return h.p25 ?? NaN;
        case "p75": return h.p75 ?? NaN;
        case "hitLong": return h.hL ?? NaN;
        case "hitLongEdge": return (h.hL ?? NaN) - (h.bL ?? NaN);
        case "hitShort": return h.hS ?? NaN;
        case "hitShortEdge": return (h.hS ?? NaN) - (h.bS ?? NaN);
        case "n": return r.matchN ?? NaN;
        case "composite": return r.composite ?? NaN;
        case "agreement": return r.consensus_agreement ?? NaN;
        case "dispersion": return (selectedHorizon === "1M" ? r.consensus_sd1M : selectedHorizon === "3M" ? r.consensus_sd3M : selectedHorizon === "6M" ? r.consensus_sd6M : r.consensus_sd1Y) ?? NaN;
        case "snr": return r.consensus_snr ?? NaN;
        case "validPresets": return r.consensus_validPresets ?? NaN;
        default: return NaN;
      }
    };
    ok.sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === "string" && typeof vb === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      const na = typeof va === "number" ? va : NaN;
      const nb = typeof vb === "number" ? vb : NaN;
      if (!Number.isFinite(na) && !Number.isFinite(nb)) return 0;
      if (!Number.isFinite(na)) return 1;
      if (!Number.isFinite(nb)) return -1;
      return sortDir === "asc" ? na - nb : nb - na;
    });
    return [...ok, ...other];
  }, [resultsWithComposite, sortCol, sortDir, selectedHorizon]);

  const topLong = useMemo(() => [...resultsWithComposite].filter(r => r.status === "ok" && Number.isFinite(r.composite ?? NaN)).sort((a, b) => (b.composite ?? -Infinity) - (a.composite ?? -Infinity)).slice(0, 10), [resultsWithComposite]);
  const topShort = useMemo(() => [...resultsWithComposite].filter(r => r.status === "ok" && Number.isFinite(r.composite ?? NaN)).sort((a, b) => (a.composite ?? Infinity) - (b.composite ?? Infinity)).slice(0, 10), [resultsWithComposite]);

  const handleOpenTicker = (ticker: string) => navigate(`/similar-setups?ticker=${encodeURIComponent(ticker)}`);
  const applyPreset = (name: string) => {
    if (name === "__none__") return;
    const features = (featurePresets as Record<string, string[]>)[name];
    if (features) setEnabledFeatures(new Set(features));
  };

  const universeLabelText = universeMode === "global"
    ? globalLoading ? "Global (loading…)" : `Global · ${globalDimVal || "all"} (${universeTickers.length})`
    : universeMode === "classification" ? `${classifyDim}=${classifyVal} (${universeTickers.length})`
    : universeMode === "basket" ? (() => { const b = baskets.find(b => b.id === basketId); return b ? `${b.name} (${b.tickers.length})` : "(pick basket)"; })()
    : `All (${workbookTickers.length})`;

  const sortHeader = (col: string, label: string, align: "left" | "right" = "right") => (
    <th onClick={() => { if (sortCol === col) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir(col === "ticker" ? "asc" : "desc"); } }}
      className={`font-normal py-1 px-2 cursor-pointer hover:text-foreground select-none text-${align}`}>
      {label}
      {sortCol === col ? (sortDir === "asc" ? <SortAsc className="inline w-3 h-3 ml-0.5" /> : <SortDesc className="inline w-3 h-3 ml-0.5" />) : null}
    </th>
  );

  const fmtRet = (v: number | undefined) => Number.isFinite(v ?? NaN) ? `${v! >= 0 ? "+" : ""}${v!.toFixed(1)}%` : "—";
  const fmtEdge = (v: number | undefined) => Number.isFinite(v ?? NaN) ? `${v! >= 0 ? "+" : ""}${v!.toFixed(0)}pp` : "—";
  const fmtNum = (v: number | undefined) => Number.isFinite(v ?? NaN) ? v!.toFixed(2) : "—";
  const retColor = (v: number | undefined) => Number.isFinite(v ?? NaN) ? ((v! >= 0) ? "text-green-400" : "text-red-400") : "text-muted-foreground/50";
  const edgeColor = (v: number | undefined, positive: boolean) => Number.isFinite(v ?? NaN) ? (positive ? ((v! >= 0) ? "text-green-400/80" : "text-red-400/80") : ((v! >= 0) ? "text-red-400/80" : "text-green-400/80")) : "text-muted-foreground/50";

  return (
    <div className="flex flex-col h-full bg-background overflow-auto" data-testid="setups-screener-page">
      {/* Header bar */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-3 flex-wrap bg-card">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <h1 className="text-sm font-mono font-semibold text-foreground">
          Setups Screener · <span className="text-amber-300">{universeLabelText}</span>
        </h1>
        {isRunning && (
          <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />{progress.done}/{progress.total}
          </span>
        )}
        {!isRunning && results.length > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {results.filter(r => r.status === "ok").length} ok · {results.filter(r => r.status === "skipped").length} skipped · {results.filter(r => r.status === "error").length} error
          </span>
        )}
        <span className="text-[10px] font-mono text-muted-foreground/60">
          horizon: <span className="text-foreground">{selectedHorizon}</span> · {(algoMeta as Record<string, { label: string }>)[algo]?.label} · {consensusMode ? <span className="text-amber-300">consensus ({consensusPresets.size} presets)</span> : <>features {enabledFeatures.size}</>}
        </span>
      </div>

      {/* Controls bar */}
      <div className="px-3 py-2 border-b border-border bg-card/60 flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Universe</span>
        <div className="flex rounded border border-border overflow-hidden">
          {(["all", "classification", "basket", "global"] as UniverseMode[]).map(mode => (
            <button key={mode} onClick={() => setUniverseMode(mode)}
              className={`text-[11px] font-mono px-2.5 py-1 transition-colors ${universeMode === mode ? "bg-amber-500/15 text-amber-300 border-r border-border last:border-r-0" : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent border-r border-border last:border-r-0"}`}
              data-testid={`ss-univ-${mode}`}
              title={mode === "global" ? "FactSet/RBICS GLOBAL universe (~9,000 tickers, Yahoo-priced)" : undefined}>
              {mode}
            </button>
          ))}
        </div>

        {universeMode === "classification" && (
          <>
            <select value={classifyDim} onChange={e => setClassifyDim(e.target.value)} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground">
              {CLASSIFICATION_DIMS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={classifyVal} onChange={e => setClassifyVal(e.target.value)} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground max-w-[200px]">
              {classifyValues.length === 0 && <option value="">(load…)</option>}
              {classifyValues.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </>
        )}
        {universeMode === "basket" && (
          <select value={basketId} onChange={e => setBasketId(e.target.value)} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground max-w-[260px]">
            <option value="">(pick basket)</option>
            {baskets.map(b => <option key={b.id} value={b.id}>{b.name} · {b.tickers.length}</option>)}
          </select>
        )}
        {universeMode === "global" && (
          <>
            <select value={globalDim} onChange={e => { setGlobalDim(e.target.value); setGlobalDimVal(""); }} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground" disabled={globalLoading}>
              {CLASSIFICATION_DIMS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={globalDimVal} onChange={e => setGlobalDimVal(e.target.value)} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground max-w-[220px]" disabled={globalLoading}>
              <option value="">(all {globalLoading ? "" : globalMetas.length.toLocaleString()})</option>
              {globalDimValues.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            {globalError && <span className="text-[10px] text-rose-400" title={globalError}>load error</span>}
          </>
        )}

        <span className="w-px h-5 bg-border" />
        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Algo</label>
        <select value={algo} onChange={e => setAlgo(e.target.value)} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground" title={(algoMeta as Record<string, { tooltip: string }>)[algo]?.tooltip}>
          {(algoKeys as string[]).map(k => <option key={k} value={k}>{(algoMeta as Record<string, { label: string }>)[k]?.label}</option>)}
        </select>
        <button onClick={() => setConsensusMode(v => !v)}
          className={`text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${consensusMode ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"}`}
          title="Run all selected presets per ticker and aggregate.">
          Consensus {consensusMode ? "ON" : "OFF"}
        </button>

        {algo === "dtw" && (
          <>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">W</label>
            <select value={dtwWindow} onChange={e => setDtwWindow(Number(e.target.value))} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground">
              {[20, 30, 40, 60, 90, 120, 180, 252].map(v => <option key={v} value={v}>{v}b</option>)}
            </select>
          </>
        )}
        {algo === "kernel" && (
          <>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">h</label>
            <select value={kernelH} onChange={e => setKernelH(Number(e.target.value))} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground">
              <option value={0}>auto</option>
              {[0.5, 1, 1.5, 2, 3].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </>
        )}
        {algo === "regime" && (
          <>
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">K</label>
            <select value={regimeK} onChange={e => setRegimeK(Number(e.target.value))} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground">
              {[2, 3, 4, 5, 6, 8, 10, 12].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </>
        )}

        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">N</label>
        <select value={nNeighbors} onChange={e => setNNeighbors(Number(e.target.value))} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground">
          {[10, 20, 30, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Excl</label>
        <select value={exclusion} onChange={e => setExclusion(Number(e.target.value))} className="text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground">
          <option value={63}>3M</option><option value={126}>6M</option>
          <option value={252}>1Y</option><option value={504}>2Y</option>
        </select>

        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Horizon</label>
        <div className="flex rounded border border-border overflow-hidden">
          {(["1M", "3M", "6M", "1Y"] as Horizon[]).map(h => (
            <button key={h} onClick={() => setSelectedHorizon(h)}
              className={`text-[11px] font-mono px-2 py-0.5 transition-colors ${selectedHorizon === h ? "bg-amber-500/15 text-amber-300 border-r border-border last:border-r-0" : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent border-r border-border last:border-r-0"}`}>
              {h}
            </button>
          ))}
        </div>

        <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Preset</label>
        <select onChange={e => { applyPreset(e.target.value); e.target.value = "__none__"; }} defaultValue="__none__" className="text-[10px] font-mono px-2 py-0.5 bg-background border border-border rounded text-foreground">
          <option value="__none__">(apply preset…)</option>
          {Object.keys(featurePresets as object).map(k => <option key={k} value={k}>{k}</option>)}
        </select>

        <div className="flex-1" />
        {isRunning ? (
          <button onClick={handleCancel} className="text-[11px] font-mono px-3 py-1 rounded bg-red-500/15 text-red-300 border border-red-500/60 hover:bg-red-500/25 flex items-center gap-1">
            <X className="w-3 h-3" />Cancel
          </button>
        ) : (
          <button onClick={handleRun} disabled={universeTickers.length === 0}
            className="text-[11px] font-mono px-3 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/60 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
            <PlayIcon className="w-3 h-3" />Run · {universeTickers.length} tickers
          </button>
        )}
      </div>

      {/* Consensus preset row */}
      {consensusMode && (
        <div className="px-3 py-2 border-b border-border bg-amber-500/5 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono text-amber-300 uppercase tracking-wider mr-1">Consensus presets</span>
          {Object.keys(featurePresets as object).map(key => {
            const active = consensusPresets.has(key);
            return (
              <button key={key} onClick={() => setConsensusPresets(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; })}
                className={`text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${active ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
                {key}
              </button>
            );
          })}
          <button onClick={() => setConsensusPresets(new Set(Object.keys(featurePresets as object)))} className="text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent ml-2">All</button>
          <button onClick={() => setConsensusPresets(new Set())} className="text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent">None</button>
          <span className="text-[10px] font-mono text-muted-foreground/70 ml-2">{consensusPresets.size} preset{consensusPresets.size === 1 ? "" : "s"} selected · per-ticker runs {consensusPresets.size}× algorithm</span>
        </div>
      )}

      {/* Progress bar */}
      {isRunning && progress.total > 0 && (
        <div className="px-3 py-1 border-b border-border bg-card/40">
          <div className="h-1.5 bg-border rounded overflow-hidden">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress.done / progress.total * 100}%` }} />
          </div>
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="px-3 py-2 border-b border-border bg-red-500/5 text-red-400 text-[11px] font-mono flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />{errorMsg}
        </div>
      )}

      {/* Top setups panels */}
      {results.length > 0 && (topLong.length + topShort.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border-b border-border">
          <TopSetupsList title="Top long setups" tone="long" rows={topLong} horizon={selectedHorizon} onOpen={handleOpenTicker} />
          <TopSetupsList title="Top short setups" tone="short" rows={topShort} horizon={selectedHorizon} onOpen={handleOpenTicker} />
        </div>
      )}

      {/* Main table */}
      <div className="flex-1 min-h-0 overflow-auto">
        {results.length === 0 && !isRunning && (
          <div className="px-3 py-8 text-center text-[11px] font-mono text-muted-foreground">
            Set up the universe and parameters above, then click <span className="text-amber-300">Run</span> to screen.<br />
            First run fetches OHLCV per ticker (cached on later runs).
          </div>
        )}
        {results.length > 0 && (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr className="text-muted-foreground/80 uppercase tracking-wider">
                {sortHeader("ticker", "Ticker", "left")}
                {sortHeader("composite", `Composite ${selectedHorizon}`)}
                {sortHeader("median", `Median ${selectedHorizon}`)}
                {!consensusMode && sortHeader("mean", `Mean ${selectedHorizon}`)}
                {!consensusMode && (selectedHorizon === "1M" || selectedHorizon === "3M") && sortHeader("p25", `p25 ${selectedHorizon}`)}
                {!consensusMode && (selectedHorizon === "1M" || selectedHorizon === "3M") && sortHeader("p75", `p75 ${selectedHorizon}`)}
                {sortHeader("hitLong", `L hit ${selectedHorizon}`)}
                {sortHeader("hitLongEdge", "L edge")}
                {sortHeader("hitShort", `S hit ${selectedHorizon}`)}
                {sortHeader("hitShortEdge", "S edge")}
                {consensusMode && sortHeader("agreement", "Agreement")}
                {consensusMode && sortHeader("dispersion", `±sd ${selectedHorizon}`)}
                {consensusMode && sortHeader("snr", "SNR")}
                {consensusMode && sortHeader("validPresets", "Presets")}
                {!consensusMode && sortHeader("n", "matches")}
                {consensusMode && <th className="text-left font-normal py-1 px-2">Verdict</th>}
                <th className="text-left font-normal py-1 px-2">status</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map(row => {
                const h = getHorizonStats(row, selectedHorizon);
                const longEdge = (h.hL ?? NaN) - (h.bL ?? NaN);
                const shortEdge = (h.hS ?? NaN) - (h.bS ?? NaN);
                const sdCol = selectedHorizon === "1M" ? row.consensus_sd1M : selectedHorizon === "3M" ? row.consensus_sd3M : selectedHorizon === "6M" ? row.consensus_sd6M : row.consensus_sd1Y;
                return (
                  <tr key={row.ticker} onClick={() => row.status === "ok" && handleOpenTicker(row.ticker)}
                    className={`border-t border-border/40 ${row.status === "ok" ? "hover:bg-accent/30 cursor-pointer" : "opacity-60"}`}>
                    <td className="text-foreground py-0.5 px-2 font-semibold">{row.ticker}</td>
                    <td className={`text-right py-0.5 px-2 ${retColor(row.composite)}`}>{fmtNum(row.composite)}</td>
                    <td className={`text-right py-0.5 px-2 ${retColor(h.med)}`}>{fmtRet(h.med)}</td>
                    {!consensusMode && <td className={`text-right py-0.5 px-2 ${retColor(h.mean)}`}>{fmtRet(h.mean)}</td>}
                    {!consensusMode && (selectedHorizon === "1M" || selectedHorizon === "3M") && <td className={`text-right py-0.5 px-2 ${retColor(h.p25)}`}>{fmtRet(h.p25)}</td>}
                    {!consensusMode && (selectedHorizon === "1M" || selectedHorizon === "3M") && <td className={`text-right py-0.5 px-2 ${retColor(h.p75)}`}>{fmtRet(h.p75)}</td>}
                    <td className="text-right py-0.5 px-2 text-green-400">{Number.isFinite(h.hL ?? NaN) ? `${h.hL!.toFixed(0)}%` : "—"}</td>
                    <td className={`text-right py-0.5 px-2 ${edgeColor(longEdge, true)}`}>{fmtEdge(longEdge)}</td>
                    <td className="text-right py-0.5 px-2 text-red-400">{Number.isFinite(h.hS ?? NaN) ? `${h.hS!.toFixed(0)}%` : "—"}</td>
                    <td className={`text-right py-0.5 px-2 ${edgeColor(shortEdge, false)}`}>{fmtEdge(shortEdge)}</td>
                    {consensusMode && (
                      <>
                        <td className="text-right py-0.5 px-2 text-muted-foreground">{Number.isFinite(row.consensus_agreement ?? NaN) ? `${Math.round(row.consensus_agreement! * 100)}%` : "—"}</td>
                        <td className="text-right py-0.5 px-2 text-muted-foreground">{Number.isFinite(sdCol ?? NaN) ? `±${sdCol!.toFixed(1)}pp` : "—"}</td>
                        <td className="text-right py-0.5 px-2 text-muted-foreground">{fmtNum(row.consensus_snr)}</td>
                        <td className="text-right py-0.5 px-2 text-muted-foreground">{row.consensus_validPresets ?? "—"}{row.consensus_totalPresets ? `/${row.consensus_totalPresets}` : ""}</td>
                      </>
                    )}
                    {!consensusMode && <td className="text-right py-0.5 px-2 text-muted-foreground">{row.matchN ?? "—"}</td>}
                    {consensusMode && (
                      <td className="py-0.5 px-2" title={row.consensus_verdict}>
                        {(() => {
                          const verdict = row.consensus_verdict ?? "";
                          const dir = row.consensus_direction;
                          if (!verdict) return <span className="text-muted-foreground/50">—</span>;
                          const cls = verdict.startsWith("Strong") && dir === "long" ? "text-green-300 font-semibold"
                            : verdict.startsWith("Strong") && dir === "short" ? "text-red-300 font-semibold"
                            : verdict.startsWith("Moderate") && dir === "long" ? "text-green-400/90"
                            : verdict.startsWith("Moderate") && dir === "short" ? "text-red-400/90"
                            : verdict.startsWith("Weak") && dir === "long" ? "text-green-400/70"
                            : verdict.startsWith("Weak") && dir === "short" ? "text-red-400/70"
                            : "text-muted-foreground";
                          return <span className={cls}>{verdict}</span>;
                        })()}
                      </td>
                    )}
                    <td className="py-0.5 px-2 text-muted-foreground">
                      {row.status === "running" && <span className="text-amber-300">running…</span>}
                      {row.status === "pending" && <span className="text-muted-foreground/60">queued</span>}
                      {row.status === "ok" && <span className="text-green-400/80">ok</span>}
                      {row.status === "skipped" && <span className="text-muted-foreground" title={row.errorMsg}>skipped</span>}
                      {row.status === "error" && <span className="text-red-400" title={row.errorMsg}>error</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
