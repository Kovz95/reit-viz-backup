// Reconstructed from recovered-bundle/PairsScreener-BeEnKZ3a.js on 2026-06-11
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import * as React from "react";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useLocation } from "wouter";
import { useGlobalUniverse } from "@/lib/globalUniverse";
import { ClassificationFiltersWithSource } from "@/components/ClassificationFiltersWithSource";
import { filterTickersByClassification } from "@/lib/classificationFilters";
import { emptyClassFilters } from "@/lib/dataService";
import { getPairsData } from "@/lib/dataService";
import { universeSignature } from "@/lib/universeSignature";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShieldAlert, ShieldCheck, Shield, Download, Play, Square, ExternalLink, ArrowUpDown, ChevronUp, ChevronDown, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PairResult {
  tickerA: string;
  tickerB: string;
  pValue: number;
  adfStat: number;
  halfLife: number;
  hedgeRatio: number;
  currentZ: number;
  pValueRecent: number;
  adfStatRecent: number;
  halfLifeRecent: number;
  backtestN: number;
  backtestWinRate: number;
  backtestAvgPnL: number;
}

interface ClassFilters {
  economy: Set<string>;
  sector: Set<string>;
  subsector: Set<string>;
  industryGroup: Set<string>;
  industry: Set<string>;
  subindustry: Set<string>;
}

function emptyClassFiltersLocal(): ClassFilters {
  return { economy: new Set(), sector: new Set(), subsector: new Set(), industryGroup: new Set(), industry: new Set(), subindustry: new Set() };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_HISTORY = 60;
const MIN_WEEKLY = 52;
const BATCH_SIZE = 8;
const MAX_PAIR_COMBO = 2000;

// ── Math helpers ──────────────────────────────────────────────────────────────

function adfTest(residuals: number[]): { adfStat: number; pValue: number; halfLife: number } | null {
  if (residuals.length < MIN_HISTORY) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  const n = residuals.length - 1;
  for (let i = 1; i < residuals.length; i++) {
    const x = residuals[i - 1], y = residuals[i] - residuals[i - 1];
    sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
  }
  if (n < 30) return null;
  const xMean = sumX / n, yMean = sumY / n;
  const sxx = sumXX - n * xMean * xMean;
  const sxy = sumXY - n * xMean * yMean;
  if (sxx === 0) return null;
  const beta = sxy / sxx;
  let sse = 0;
  for (let i = 1; i < residuals.length; i++) {
    const y = residuals[i] - residuals[i - 1] - beta * residuals[i - 1];
    sse += y * y;
  }
  const se = Math.sqrt(sse / Math.max(1, n - 1)) / Math.sqrt(sxx);
  const tStat = se === 0 ? 0 : beta / se;
  let pValue: number;
  if (tStat < -3.96) pValue = 0.01;
  else if (tStat < -3.37) pValue = 0.05;
  else if (tStat < -3.07) pValue = 0.1;
  else if (tStat < -2.57) pValue = 0.25;
  else pValue = 0.5;
  const phi = 1 + beta;
  const halfLife = phi >= 1 || phi <= 0 ? Infinity : -Math.log(2) / Math.log(phi);
  return { adfStat: Math.round(tStat * 100) / 100, pValue, halfLife: Math.round(halfLife * 10) / 10 };
}

function computeOlsResiduals(
  priceA: Array<{ value: number }>,
  priceB: Array<{ value: number }>,
  lookback: number
): number[] | null {
  const n = Math.min(priceA.length, priceB.length);
  if (n < lookback + 30 || lookback < 30) return null;
  const result: number[] = new Array(n).fill(NaN);
  const logA: number[] = new Array(n), logB: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (!(priceA[i].value > 0) || !(priceB[i].value > 0)) return null;
    logA[i] = Math.log(priceA[i].value); logB[i] = Math.log(priceB[i].value);
  }
  const sumLogB: number[] = new Array(n + 1).fill(0);
  const sumLogA: number[] = new Array(n + 1).fill(0);
  const sumLogB2: number[] = new Array(n + 1).fill(0);
  const sumLogAB: number[] = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    sumLogB[i + 1] = sumLogB[i] + logB[i];
    sumLogA[i + 1] = sumLogA[i] + logA[i];
    sumLogB2[i + 1] = sumLogB2[i] + logB[i] * logB[i];
    sumLogAB[i + 1] = sumLogAB[i] + logB[i] * logA[i];
  }
  for (let i = lookback; i < n; i++) {
    const s = i - lookback, e = i, N = e - s;
    const bSum = sumLogB[e] - sumLogB[s];
    const aSum = sumLogA[e] - sumLogA[s];
    const b2Sum = sumLogB2[e] - sumLogB2[s];
    const abSum = sumLogAB[e] - sumLogAB[s];
    const bMean = bSum / N, aMean = aSum / N;
    const sbb = b2Sum - N * bMean * bMean;
    const sab = abSum - N * bMean * aMean;
    if (sbb <= 0) continue;
    const beta = sab / sbb, alpha = aMean - beta * bMean;
    result[i] = logA[i] - (alpha + beta * logB[i]);
  }
  return result;
}

function computeRatioResiduals(
  priceA: Array<{ value: number }>,
  priceB: Array<{ value: number }>,
  lookback: number
): number[] | null {
  const n = Math.min(priceA.length, priceB.length);
  if (n < MIN_HISTORY) return null;
  const start = Math.max(0, n - lookback);
  if (n - start < MIN_HISTORY) return null;
  const result: number[] = [];
  for (let i = start; i < n; i++) {
    if (!(priceA[i].value > 0) || !(priceB[i].value > 0)) return null;
    result.push(Math.log(priceA[i].value) - Math.log(priceB[i].value));
  }
  return result;
}

// Single-window OLS residuals over the most-recent `lookback` window (bundle `lt`).
function computeOlsResidualsSingle(
  priceA: Array<{ value: number }>,
  priceB: Array<{ value: number }>,
  lookback: number
): number[] | null {
  const a = Math.min(priceA.length, priceB.length);
  if (a < MIN_HISTORY) return null;
  const start = Math.max(0, a - lookback);
  const len = a - start;
  if (len < MIN_HISTORY) return null;
  let sumB = 0, sumA = 0, sumAB = 0, sumBB = 0;
  for (let i = start; i < a; i++) {
    const lb = Math.log(priceB[i].value), la = Math.log(priceA[i].value);
    sumB += lb; sumA += la; sumAB += lb * la; sumBB += lb * lb;
  }
  const bMean = sumB / len, aMean = sumA / len;
  const sbb = sumBB - len * bMean * bMean;
  const sab = sumAB - len * bMean * aMean;
  if (sbb === 0) return null;
  const beta = sab / sbb, alpha = aMean - beta * bMean;
  const out: number[] = [];
  for (let i = start; i < a; i++) out.push(Math.log(priceA[i].value) - (alpha + beta * Math.log(priceB[i].value)));
  return out;
}

function computeZScore(series: number[], window: number): number {
  if (series.length < 5) return NaN;
  const lookback = Math.min(window, series.length);
  const start = series.length - lookback;
  let sum = 0, sum2 = 0;
  for (let i = start; i < series.length; i++) { sum += series[i]; sum2 += series[i] * series[i]; }
  const mean = sum / lookback;
  const variance = sum2 / lookback - mean * mean;
  if (variance <= 0) return NaN;
  return (series[series.length - 1] - mean) / Math.sqrt(variance);
}

function runBacktest(
  residuals: number[] | null,
  window: number,
  entryZ: number,
  maxHold: number,
  stopZ: number,
  costBps: number
): { n: number; winRate: number; avgPnL: number } | null {
  if (!residuals || residuals.length < window + 30 || !(entryZ > 0)) return null;
  const zScores: number[] = new Array(residuals.length).fill(NaN);
  let runSum = 0, runSum2 = 0, lastNan = -1;
  for (let i = 0; i < residuals.length; i++) {
    const v = residuals[i];
    if (Number.isFinite(v)) { runSum += v; runSum2 += v * v; }
    else { lastNan = i; }
    if (i >= window) {
      const old = residuals[i - window];
      if (Number.isFinite(old)) { runSum -= old; runSum2 -= old * old; }
    }
    if (i >= window - 1 && Number.isFinite(v) && lastNan < i - window + 1) {
      const n = window, mean = runSum / n, variance = runSum2 / n - mean * mean;
      if (variance > 1e-12) zScores[i] = (v - mean) / Math.sqrt(variance);
    }
  }
  const trades: number[] = [];
  let inTrade = false, entryIdx = -1, direction = 0;
  for (let i = window; i < residuals.length; i++) {
    const z = zScores[i - 1];
    if (inTrade) {
      const curZ = zScores[i];
      const bars = i - entryIdx;
      let exit = false;
      if (Number.isFinite(curZ) && ((direction === -1 && curZ <= 0) || (direction === 1 && curZ >= 0) || Math.abs(curZ) >= stopZ)) exit = true;
      if (!exit && bars >= maxHold) exit = true;
      if (!exit && i === residuals.length - 1) exit = true;
      if (exit) {
        const pnl = direction * (residuals[i] - residuals[entryIdx]) - costBps / 1e4;
        trades.push(pnl); inTrade = false; entryIdx = -1; direction = 0;
      }
    } else {
      if (!Number.isFinite(z)) continue;
      if (z >= entryZ) { inTrade = true; direction = -1; entryIdx = i; }
      else if (z <= -entryZ) { inTrade = true; direction = 1; entryIdx = i; }
    }
  }
  const n = trades.length;
  if (n === 0) return { n: 0, winRate: NaN, avgPnL: NaN };
  let wins = 0, totalPnl = 0;
  for (const t of trades) { if (t > 0) wins++; totalPnl += t; }
  return { n, winRate: wins / n, avgPnL: totalPnl / n };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PairsScreener() {
  const { filteredTickersList, isFiltered, totalCount, allTickers } = useUniverse();
  const [, navigateTo] = useLocation();
  const workspaceState = useWorkspaceTab as any;
  const { metas } = useGlobalUniverse();

  const [model, setModel] = useState<"ols" | "ratio">("ols");
  const [scope, setScope] = useState<"universe" | "pairCombo">("universe");
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFiltersLocal);
  const [classSearch, setClassSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<"workbook" | "global">("workbook");
  const { metas: globalMetas } = useGlobalUniverse();

  const [olsResidWindow, setOlsResidWindow] = useState(52);
  const [betaLookback, setBetaLookback] = useState(52);
  const [verifyDays, setVerifyDays] = useState(1500);
  const [pMax, setPMax] = useState(0.1);
  const [hlMin, setHlMin] = useState(5);
  const [hlMax, setHlMax] = useState(60);
  const [absZMin, setAbsZMin] = useState(1.5);
  const [stableOnly, setStableOnly] = useState(false);
  const [minWinRate, setMinWinRate] = useState(0.55);
  const [btResidMode, setBtResidMode] = useState<"rolling" | "insample">("rolling");
  const [btRollingWindow, setBtRollingWindow] = useState(252);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [allResults, setAllResults] = useState<PairResult[]>([]);
  const cancelRef = useRef(false);

  const [sortKey, setSortKey] = useState("pValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const getWorkspaceState = useCallback(() => ({
    model, scope,
    pcFiltersSer: {
      economy: Array.from(classFilters.economy),
      sector: Array.from(classFilters.sector),
      subsector: Array.from(classFilters.subsector),
      industryGroup: Array.from(classFilters.industryGroup),
      industry: Array.from(classFilters.industry),
      subindustry: Array.from(classFilters.subindustry),
    },
    pcClassSearch: classSearch,
    pcManualTickersSer: Array.from(manualTickers),
    olsResidWindow, betaLookback, verifyDays, pMax, hlMin, hlMax, absZMin,
    stableOnly, minWinRate, btResidMode, btRollingWindow, sortKey, sortDir,
    allResults,
  }), [model, scope, classFilters, classSearch, manualTickers, olsResidWindow, betaLookback, verifyDays, pMax, hlMin, hlMax, absZMin, stableOnly, minWinRate, btResidMode, btRollingWindow, sortKey, sortDir, allResults]);

  const restoreWorkspaceState = useCallback((state: any) => {
    if (!state) return;
    if (state.model === "ols" || state.model === "ratio") setModel(state.model);
    if (state.scope === "universe" || state.scope === "pairCombo") setScope(state.scope);
    if (state.pcFiltersSer && typeof state.pcFiltersSer === "object") {
      const s = state.pcFiltersSer;
      setClassFilters({
        economy: new Set(Array.isArray(s.economy) ? s.economy : []),
        sector: new Set(Array.isArray(s.sector) ? s.sector : []),
        subsector: new Set(Array.isArray(s.subsector) ? s.subsector : []),
        industryGroup: new Set(Array.isArray(s.industryGroup) ? s.industryGroup : []),
        industry: new Set(Array.isArray(s.industry) ? s.industry : []),
        subindustry: new Set(Array.isArray(s.subindustry) ? s.subindustry : []),
      });
    }
    if (typeof state.pcClassSearch === "string") setClassSearch(state.pcClassSearch);
    if (Array.isArray(state.pcManualTickersSer)) setManualTickers(new Set(state.pcManualTickersSer));
    if (typeof state.olsResidWindow === "number") setOlsResidWindow(state.olsResidWindow);
    if (typeof state.betaLookback === "number") setBetaLookback(state.betaLookback);
    if (typeof state.verifyDays === "number") setVerifyDays(state.verifyDays);
    if (typeof state.pMax === "number") setPMax(state.pMax);
    if (typeof state.hlMin === "number") setHlMin(state.hlMin);
    if (typeof state.hlMax === "number") setHlMax(state.hlMax);
    if (typeof state.absZMin === "number") setAbsZMin(state.absZMin);
    if (typeof state.stableOnly === "boolean") setStableOnly(state.stableOnly);
    if (typeof state.minWinRate === "number") setMinWinRate(state.minWinRate);
    if (state.btResidMode === "rolling" || state.btResidMode === "insample") setBtResidMode(state.btResidMode);
    if (typeof state.btRollingWindow === "number") setBtRollingWindow(state.btRollingWindow);
    if (state.sortKey) setSortKey(state.sortKey);
    if (state.sortDir) setSortDir(state.sortDir);
    if (Array.isArray(state.allResults)) setAllResults(state.allResults);
  }, []);

  const universeSignatureVal = universeSignature as any;
  (useWorkspaceTab as any)("pair-screener", getWorkspaceState, restoreWorkspaceState, { universeSig: universeSignatureVal, resultFields: ["allResults"] });

  useEffect(() => () => { cancelRef.current = true; }, []);

  const pairComboTickers = useMemo(() => {
    const totalFilters = classFilters.economy.size + classFilters.sector.size + classFilters.subsector.size + classFilters.industryGroup.size + classFilters.industry.size + classFilters.subindustry.size + manualTickers.size + (classSearch.trim().length > 0 ? 1 : 0);
    if (totalFilters === 0) return [];
    return (filterTickersByClassification as any)(source === "global" ? metas : allTickers, classFilters, classSearch, manualTickers)
      .map((t: any) => t.ticker.toUpperCase())
      .filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i);
  }, [allTickers, metas, source, classFilters, classSearch, manualTickers]);

  const tickerList = useMemo(() =>
    scope === "pairCombo" ? pairComboTickers : filteredTickersList.map((t: any) => t.ticker),
    [scope, pairComboTickers, filteredTickersList]
  );

  const totalPairs = useMemo(() => {
    const n = tickerList.length;
    return n * (n - 1) / 2;
  }, [tickerList]);

  const handleRun = useCallback(async () => {
    if (tickerList.length < 2) return;
    setRunning(true);
    setAllResults([]);
    cancelRef.current = false;

    const pairs: [string, string][] = [];
    outer: for (let i = 0; i < tickerList.length; i++)
      for (let j = i + 1; j < tickerList.length; j++) {
        pairs.push([tickerList[i], tickerList[j]]);
        if (scope === "pairCombo" && pairs.length >= MAX_PAIR_COMBO) break outer;
      }

    setProgress({ current: 0, total: pairs.length });
    const results: PairResult[] = [];

    for (let i = 0; i < pairs.length && !cancelRef.current; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async ([A, B]) => {
        try {
          const data = await (getPairsData as any)(A, B, "close", "close", MIN_HISTORY, betaLookback, BATCH_SIZE, olsResidWindow);
          const entryZ = absZMin > 0 ? absZMin : 1.5;
          const stopZ = 3, exitZ = 0;

          if (model === "ols") {
            if (!data.cointStats) return null;
            const currentZ = data.olsResidZ.length ? data.olsResidZ[data.olsResidZ.length - 1].value : NaN;
            const recentResid = computeOlsResidualsSingle(data.priceA, data.priceB, verifyDays);
            const recentAdf = recentResid ? adfTest(recentResid) : null;
            const residSeries = btResidMode === "rolling"
              ? computeOlsResiduals(data.priceA, data.priceB, btRollingWindow)
              : (() => {
                const len = Math.min(data.priceA.length, data.priceB.length);
                return len < MIN_HISTORY ? null : computeOlsResidualsSingle(data.priceA, data.priceB, len);
              })();
            const hl = data.cointStats.halfLife;
            const maxHold = Math.max(10, Math.min(60, Number.isFinite(hl) && hl > 0 ? Math.round(hl * 4) : 60));
            const bt = residSeries ? runBacktest(residSeries, olsResidWindow, entryZ, maxHold, stopZ, 0) : null;
            return {
              tickerA: A, tickerB: B,
              pValue: data.cointStats.pValue, adfStat: data.cointStats.adfStat,
              halfLife: data.cointStats.halfLife, hedgeRatio: data.cointStats.hedgeRatio,
              currentZ: Number.isFinite(currentZ) ? currentZ : NaN,
              pValueRecent: recentAdf ? recentAdf.pValue : 0.5,
              adfStatRecent: recentAdf ? recentAdf.adfStat : NaN,
              halfLifeRecent: recentAdf ? recentAdf.halfLife : Infinity,
              backtestN: bt ? bt.n : 0,
              backtestWinRate: bt ? bt.winRate : NaN,
              backtestAvgPnL: bt ? bt.avgPnL : NaN,
            } as PairResult;
          } else {
            const ratioResid = computeRatioResiduals(data.priceA, data.priceB, Math.min(data.priceA.length, data.priceB.length));
            if (!ratioResid) return null;
            const fullAdf = adfTest(ratioResid);
            if (!fullAdf) return null;
            const recentRatioResid = computeRatioResiduals(data.priceA, data.priceB, verifyDays);
            const recentAdf = recentRatioResid ? adfTest(recentRatioResid) : null;
            const fullRatioForZ = computeRatioResiduals(data.priceA, data.priceB, Math.min(data.priceA.length, data.priceB.length));
            const currentZRatio = fullRatioForZ ? computeZScore(fullRatioForZ, olsResidWindow) : NaN;
            const hl = fullAdf.halfLife;
            const maxHold = Math.max(10, Math.min(60, Number.isFinite(hl) && hl > 0 ? Math.round(hl * 4) : 60));
            const fullResidForBt = fullRatioForZ;
            const bt = fullResidForBt ? runBacktest(fullResidForBt, olsResidWindow, entryZ, maxHold, stopZ, 0) : null;
            return {
              tickerA: A, tickerB: B,
              pValue: fullAdf.pValue, adfStat: fullAdf.adfStat,
              halfLife: fullAdf.halfLife, hedgeRatio: 1,
              currentZ: Number.isFinite(currentZRatio) ? currentZRatio : NaN,
              pValueRecent: recentAdf ? recentAdf.pValue : 0.5,
              adfStatRecent: recentAdf ? recentAdf.adfStat : NaN,
              halfLifeRecent: recentAdf ? recentAdf.halfLife : Infinity,
              backtestN: bt ? bt.n : 0,
              backtestWinRate: bt ? bt.winRate : NaN,
              backtestAvgPnL: bt ? bt.avgPnL : NaN,
            } as PairResult;
          }
        } catch {
          return null;
        }
      }));
      for (const r of batchResults) if (r) results.push(r);
      setProgress({ current: Math.min(i + batch.length, pairs.length), total: pairs.length });
      setAllResults([...results]);
      await new Promise(r => setTimeout(r, 0));
    }
    setRunning(false);
  }, [tickerList, betaLookback, olsResidWindow, verifyDays, model, absZMin, btResidMode, btRollingWindow, scope]);

  const handleCancel = useCallback(() => { cancelRef.current = true; }, []);

  const filteredResults = useMemo(() => {
    const filtered = allResults.filter(t => {
      if (!Number.isFinite(t.pValue) || t.pValue > pMax) return false;
      if (!Number.isFinite(t.halfLife) || t.halfLife < hlMin || t.halfLife > hlMax) return false;
      if (!Number.isFinite(t.currentZ) || Math.abs(t.currentZ) < absZMin) return false;
      if (stableOnly && (!Number.isFinite(t.pValueRecent) || t.pValueRecent > pMax)) return false;
      if (Number.isFinite(minWinRate) && minWinRate > 0 && (!Number.isFinite(t.backtestWinRate) || t.backtestN < 5 || t.backtestWinRate < minWinRate)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "pValue": return (a.pValue - b.pValue) * dir;
        case "pValueRecent": return (a.pValueRecent - b.pValueRecent) * dir;
        case "halfLife": return (a.halfLife - b.halfLife) * dir;
        case "absZ": return (Math.abs(a.currentZ) - Math.abs(b.currentZ)) * dir;
        case "hedgeRatio": return (a.hedgeRatio - b.hedgeRatio) * dir;
        case "backtestWinRate": {
          const fa = Number.isFinite(a.backtestWinRate) ? a.backtestWinRate : -Infinity;
          const fb = Number.isFinite(b.backtestWinRate) ? b.backtestWinRate : -Infinity;
          return (fa - fb) * dir;
        }
        case "ticker": return (a.tickerA + "/" + a.tickerB).localeCompare(b.tickerA + "/" + b.tickerB) * dir;
        default: return 0;
      }
    });
  }, [allResults, pMax, hlMin, hlMax, absZMin, stableOnly, minWinRate, sortKey, sortDir]);

  const handleSort = useCallback((key: string) => {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "absZ" || key === "hedgeRatio" || key === "backtestWinRate" ? "desc" : "asc"); }
  }, [sortKey]);

  const SortIcon = ({ col }: { col: string }) => {
    if (col !== sortKey) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const handleViewPair = useCallback((tickerA: string, tickerB: string) => {
    const cached = (useWorkspaceTab as any).getCachedState?.("pairs") || {};
    (useWorkspaceTab as any).pushState?.("pairs", { ...cached, tickerA, tickerB, metricA: "close", metricB: "close", olsResidWindow, betaLookback });
    navigateTo("/pairs");
  }, [navigateTo, olsResidWindow, betaLookback]);

  const handleExportCsv = useCallback(() => {
    const header = `Ticker A,Ticker B,Model,Coint p (full),ADF (full),Coint p (recent),ADF (recent),Half-Life (d),Half-Life Recent (d),Hedge Ratio,${model === "ols" ? "Current OLS Z" : "Current Ratio Z"},Stable,BT Trades,BT Win%,BT Avg P&L (bps)`;
    const rows = filteredResults.map(r => {
      const stable = r.pValue <= pMax && r.pValueRecent <= pMax ? "YES" : "NO";
      return [r.tickerA, r.tickerB, model === "ols" ? "OLS" : "Ratio", r.pValue, r.adfStat,
        r.pValueRecent, Number.isFinite(r.adfStatRecent) ? r.adfStatRecent : "",
        r.halfLife, Number.isFinite(r.halfLifeRecent) ? r.halfLifeRecent : "Inf",
        r.hedgeRatio, Number.isFinite(r.currentZ) ? r.currentZ.toFixed(2) : "", stable,
        r.backtestN, Number.isFinite(r.backtestWinRate) ? (r.backtestWinRate * 100).toFixed(1) : "",
        Number.isFinite(r.backtestAvgPnL) ? (r.backtestAvgPnL * 1e4).toFixed(1) : ""
      ].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pair_screener_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [filteredResults, pMax, model]);

  const pValueColor = (p: number) => p <= 0.01 ? "text-emerald-400" : p <= 0.05 ? "text-green-400" : p <= 0.1 ? "text-yellow-400" : "text-muted-foreground";
  const zColor = (z: number) => { const u = Math.abs(z); return Number.isFinite(z) ? u >= 2.5 ? "text-red-400" : u >= 2 ? "text-orange-400" : u >= 1.5 ? "text-yellow-400" : "text-muted-foreground" : "text-muted-foreground"; };
  const winRateColor = (wr: number, n: number) => !Number.isFinite(wr) || n < 5 ? "text-muted-foreground" : wr >= 0.65 ? "text-emerald-400" : wr >= 0.55 ? "text-green-400" : wr >= 0.45 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border bg-card/50 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Shield className="w-4 h-4 text-primary" />
          Pairs Cointegration Screener
        </div>

        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <ToggleGroup type="single" value={model} onValueChange={v => { if (v === "ols" || v === "ratio") { setModel(v); setAllResults([]); } }} className="h-7" data-testid="screener-model">
                  <ToggleGroupItem value="ols" aria-label="OLS Residual Z" className="h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground" data-testid="screener-model-ols">OLS Z</ToggleGroupItem>
                  <ToggleGroupItem value="ratio" aria-label="Raw Log-Ratio" className="h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground" data-testid="screener-model-ratio">Raw Ratio</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
              <div className="font-semibold mb-1">Cointegration model</div>
              <div className="mb-1"><span className="font-mono">OLS Z</span>: log(A) = α + β·log(B) + ε; tests ε stationarity. β estimated. β-weighted hedge.</div>
              <div><span className="font-mono">Raw Ratio</span>: tests stationarity of log(A) − log(B) directly. β = 1 (equal-dollar long/short). Stricter test — only finds 1:1 cointegration.</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex items-center gap-1" data-testid="screener-scope-toggle">
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Scope</span>
          <button data-testid="screener-scope-universe" onClick={() => setScope("universe")} disabled={running}
            className={`text-[10px] font-mono font-bold px-2 py-1 rounded ${scope === "universe" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            title="Use the global Universe filter">Universe</button>
          <button data-testid="screener-scope-paircombo" onClick={() => setScope("pairCombo")} disabled={running}
            className={`text-[10px] font-mono font-bold px-2 py-1 rounded ${scope === "pairCombo" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground border border-border"}`}
            title="Build a custom leg-set without changing the global Universe">Pair combo</button>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {scope === "universe"
            ? <Badge variant={isFiltered ? "default" : "secondary"} className="font-mono">{isFiltered ? "Universe filter ON" : "All tickers"}</Badge>
            : <Badge variant="default" className="font-mono" data-testid="screener-paircombo-badge">Pair combo</Badge>
          }
          <span className="text-muted-foreground font-mono">
            {tickerList.length} tickers · {totalPairs.toLocaleString()} pairs
            {scope === "pairCombo" && totalPairs > MAX_PAIR_COMBO && <span className="text-amber-400 ml-1">(capped at {MAX_PAIR_COMBO.toLocaleString()})</span>}
          </span>
          {scope === "universe" && !isFiltered && totalCount > 50 && <span className="text-amber-400 text-[11px]">(tip: filter the Universe to keep this fast)</span>}
          {scope === "pairCombo" && totalPairs >= 50 && <span className="text-amber-400 text-[11px]" title="Each pair is a full cointegration + ADF test. Large scans take a while.">⚠ large scan</span>}
        </div>

        <div className="flex-1" />

        {running
          ? <Button size="sm" variant="destructive" onClick={handleCancel} data-testid="screener-cancel"><Square className="w-3 h-3 mr-1" /> Cancel ({progress.current}/{progress.total})</Button>
          : <Button size="sm" onClick={handleRun} disabled={tickerList.length < 2} data-testid="screener-run"><Play className="w-3 h-3 mr-1" /> Run Screen</Button>
        }
        <Button size="sm" variant="outline" onClick={handleExportCsv} disabled={filteredResults.length === 0} data-testid="screener-csv"><Download className="w-3 h-3 mr-1" /> CSV</Button>
      </div>

      {/* Pair combo filter */}
      {scope === "pairCombo" && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-card/10 flex-shrink-0">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1">Pair legs</label>
          <ClassificationFiltersWithSource
            workbookTickers={allTickers as any}
            filters={classFilters as any}
            onFiltersChange={setClassFilters as any}
            search={classSearch}
            onSearchChange={setClassSearch}
            manualTickers={manualTickers}
            onManualTickersChange={setManualTickers}
            filteredCount={pairComboTickers.length}
            totalCount={(allTickers as any).length}
            testIdPrefix="screener-paircombo-filter"
            source={source}
            onSourceChange={setSource}
          />
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">
            {pairComboTickers.length < 2
              ? "Pick at least two legs to generate pairs."
              : <>{pairComboTickers.length} legs → <span className="text-cyan-400 font-bold">{Math.min(totalPairs, MAX_PAIR_COMBO).toLocaleString()}</span> unordered pairs (A/B == B/A)</>
            }
          </span>
        </div>
      )}

      {/* Settings bar */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-3 py-2 border-b border-border bg-card/30 flex-shrink-0 text-xs">
        <NumericField label="OLS Resid Window" value={olsResidWindow} onChange={setOlsResidWindow} min={20} max={520} testId="screener-ols-window" />
        <NumericField label="Beta Lookback" value={betaLookback} onChange={setBetaLookback} min={20} max={520} testId="screener-beta-lookback" />
        <NumericField label="Verify Window (d)" value={verifyDays} onChange={setVerifyDays} min={252} max={4000} testId="screener-verifydays" />

        <div className="h-7 w-px bg-border mx-1" />
        <div className="flex items-center gap-1 text-muted-foreground"><ChevronDown className="w-3 h-3" />Tradeable composite filters:</div>

        <NumericField label="Coint p ≤" value={pMax} onChange={setPMax} step={0.01} min={0.01} max={0.5} testId="screener-pmax" />
        <NumericField label="Half-Life min (d)" value={hlMin} onChange={setHlMin} min={1} max={500} testId="screener-hlmin" />
        <NumericField label="Half-Life max (d)" value={hlMax} onChange={setHlMax} min={1} max={500} testId="screener-hlmax" />
        <NumericField label="|Z| ≥" value={absZMin} onChange={setAbsZMin} step={0.1} min={0} max={5} testId="screener-absz" />

        <div className="h-7 w-px bg-border mx-1" />

        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <NumericField label="Min Win %" value={Math.round(minWinRate * 100)} onChange={v => setMinWinRate(Math.max(0, Math.min(100, v)) / 100)} step={1} min={0} max={100} testId="screener-min-winrate" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
              <div className="font-semibold mb-1">Real-P&L backtest filter</div>
              <div>Simulates entries on every historical |Z| crossing of the threshold above, exits at Z=0 (TP), |Z|≥3 (stop), or 4×half-life bars (max 60). Only pairs whose historical trades produced a (gross) win rate ≥ this threshold will pass. Set to 0 to disable (stats still computed for display). Requires ≥5 completed trades. No transaction costs applied.</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="h-7 w-px bg-border mx-1" />

        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <Switch checked={stableOnly} onCheckedChange={setStableOnly} data-testid="screener-stable-only" />
                <span className="text-muted-foreground select-none">Stable only</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
              Show only pairs cointegrated at p ≤ pMax on BOTH the full sample AND the recent {verifyDays}-day window. Filters out pairs whose long-run cointegration is dragged down by stale historical regimes.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="h-7 w-px bg-border mx-1" />

        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground select-none">BT β:</span>
                <select value={btResidMode} onChange={e => setBtResidMode(e.target.value as any)}
                  className="h-7 px-2 text-xs bg-background border border-border rounded" data-testid="screener-bt-resid-mode">
                  <option value="rolling">Rolling (OOS)</option>
                  <option value="insample">Full-sample (in-sample)</option>
                </select>
                {btResidMode === "rolling" && (
                  <input type="number" min={60} max={1500} step={20} value={btRollingWindow}
                    onChange={e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 60 && v <= 1500) setBtRollingWindow(v); }}
                    className="h-7 w-16 px-2 text-xs bg-background border border-border rounded"
                    data-testid="screener-bt-rolling-window" title="Rolling β window (bars)" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-sm text-xs leading-relaxed">
              <strong>Backtest hedge ratio (β) estimation:</strong><br />
              <strong>Rolling (default)</strong>: β estimated at each bar using only the prior {btRollingWindow}-bar window — strict backward-looking, no look-ahead bias. Win rates and avg P&L are out-of-sample-honest.<br />
              <strong>Full-sample</strong>: β estimated once on the entire price history. Matches the ADF cointegration test exactly, but the backtest "knows" the optimal hedge ratio at each historical entry. Useful for comparison against the legacy behavior.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Progress */}
      {running && (
        <div className="px-3 py-1.5 border-b border-border bg-card/40 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="font-mono">Scanning {progress.current.toLocaleString()} / {progress.total.toLocaleString()} pairs</span>
            <span className="font-mono text-foreground">{progress.total > 0 ? (progress.current / progress.total * 100).toFixed(1) : "0.0"}%</span>
          </div>
          <div className="h-1 bg-muted rounded mt-1 overflow-hidden">
            <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress.total > 0 ? progress.current / progress.total * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {allResults.length === 0 && !running ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <div className="text-center max-w-md p-6">
              <Shield className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <div className="font-semibold text-foreground mb-1">No screen run yet</div>
              <div className="text-xs leading-relaxed">
                The screener iterates every unordered pair from the active Universe (currently <span className="font-mono text-foreground">{tickerList.length}</span> tickers · <span className="font-mono text-foreground">{totalPairs.toLocaleString()}</span> pairs), runs an Engle-Granger ADF test on the{model === "ols" ? " OLS residuals (log A vs log B), with an estimated hedge ratio," : " raw log-ratio (log A − log B), forcing a 1:1 hedge,"} and ranks pairs that are cointegrated, mean-revert quickly, and are currently dislocated.<br /><br />
                Tip: shape the universe on the Universe tab first.
              </div>
            </div>
          </div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 cursor-pointer hover:text-foreground" onClick={() => handleSort("ticker")}><div className="flex items-center gap-1">Pair <SortIcon col="ticker" /></div></th>
                <th className="px-3 py-2 cursor-pointer hover:text-foreground" onClick={() => handleSort("pValue")}><div className="flex items-center gap-1">Coint p <SortIcon col="pValue" /></div></th>
                <th className="px-3 py-2">ADF</th>
                <th className="px-3 py-2 cursor-pointer hover:text-foreground" onClick={() => handleSort("halfLife")}><div className="flex items-center gap-1">Half-Life (d) <SortIcon col="halfLife" /></div></th>
                <th className="px-3 py-2 cursor-pointer hover:text-foreground" onClick={() => handleSort("hedgeRatio")}><div className="flex items-center gap-1">Hedge β{model === "ratio" && <span className="text-muted-foreground/60">(=1)</span>} <SortIcon col="hedgeRatio" /></div></th>
                <th className="px-3 py-2 cursor-pointer hover:text-foreground" onClick={() => handleSort("absZ")}><div className="flex items-center gap-1">{model === "ols" ? "Current OLS Z" : "Current Ratio Z"} <SortIcon col="absZ" /></div></th>
                <th className="px-3 py-2 cursor-pointer hover:text-foreground" onClick={() => handleSort("backtestWinRate")}>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1">BT Win% <SortIcon col="backtestWinRate" /></div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                        Real-P&L backtest: historical |Z| entries on the cointegrating series, with the same entry threshold, exits, and costs you set above. Format: <span className="font-mono">N · win%</span>.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </th>
                <th className="px-3 py-2 cursor-pointer hover:text-foreground" onClick={() => handleSort("pValueRecent")}><div className="flex items-center gap-1">Stability <SortIcon col="pValueRecent" /></div></th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredResults.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  {running ? <span>Scanning… filters will populate once results arrive.</span> : <span>No pairs pass the current composite filters. Try loosening p, half-life, or |Z| thresholds.</span>}
                </td></tr>
              ) : filteredResults.map(row => {
                const key = `${row.tickerA}-${row.tickerB}`;
                const stableFullOk = row.pValue <= pMax;
                const stableRecentOk = Number.isFinite(row.pValueRecent) && row.pValueRecent <= pMax;
                const recentP = Number.isFinite(row.pValueRecent) ? row.pValueRecent.toFixed(2) : "—";
                return (
                  <tr key={key} className="border-b border-border/40 hover:bg-accent/40" data-testid={`screener-row-${key}`}>
                    <td className="px-3 py-1.5">
                      <span className="text-foreground font-semibold">{row.tickerA}</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span className="text-foreground font-semibold">{row.tickerB}</span>
                    </td>
                    <td className={`px-3 py-1.5 ${pValueColor(row.pValue)}`}>{row.pValue.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{row.adfStat.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-foreground">{Number.isFinite(row.halfLife) ? row.halfLife.toFixed(1) : "∞"}</td>
                    <td className={`px-3 py-1.5 ${model === "ratio" ? "text-muted-foreground/50" : "text-muted-foreground"}`}>{row.hedgeRatio.toFixed(3)}</td>
                    <td className={`px-3 py-1.5 font-semibold ${zColor(row.currentZ)}`}>{Number.isFinite(row.currentZ) ? row.currentZ.toFixed(2) : "—"}</td>
                    <td className="px-3 py-1.5">
                      {row.backtestN > 0 && Number.isFinite(row.backtestWinRate)
                        ? <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground/80">{row.backtestN}</span>
                            <span className="text-muted-foreground/60">·</span>
                            <span className={`font-semibold ${winRateColor(row.backtestWinRate, row.backtestN)}`}>{(row.backtestWinRate * 100).toFixed(0)}%</span>
                            {Number.isFinite(row.backtestAvgPnL) && <span className="text-muted-foreground/60 text-[10px]">({(row.backtestAvgPnL * 1e4).toFixed(0)}bps)</span>}
                          </div>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="px-3 py-1.5">
                      {stableFullOk && stableRecentOk
                        ? <div className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-500">{recentP}</span></div>
                        : stableFullOk && !stableRecentOk
                          ? <div className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-amber-500" /><span className="text-amber-500">{recentP}</span></div>
                          : <div className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-muted-foreground">{recentP}</span></div>
                      }
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => handleViewPair(row.tickerA, row.tickerB)} data-testid={`screener-view-${key}`}>
                        View <ExternalLink className="w-3 h-3 ml-1" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-1.5 text-[11px] font-mono text-muted-foreground bg-card/40 flex items-center gap-4 flex-shrink-0">
        <span>Total scanned: <span className="text-foreground">{allResults.length.toLocaleString()}</span></span>
        <span>Passing filters: <span className="text-foreground">{filteredResults.length.toLocaleString()}</span></span>
        <span className="text-muted-foreground/60">Model: {model === "ols" ? "OLS Residual Z" : "Raw Log-Ratio (β=1)"} · OLS resid {olsResidWindow}d · β-lookback {betaLookback}d · MacKinnon CV (1%/5%/10% = -3.96/-3.37/-3.07)</span>
      </div>
    </div>
  );
}

// ── Numeric field helper ───────────────────────────────────────────────────────

function NumericField({ label, value, onChange, min, max, step = 1, testId }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; testId?: string;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input type="number" value={value} min={min} max={max} step={step}
        onChange={e => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }}
        className="h-7 w-24 text-xs font-mono" data-testid={testId} />
    </label>
  );
}
