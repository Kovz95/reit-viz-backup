// Reconstructed from recovered-bundle/FactorBacktest-DTdYrgz4.js on 2026-06-11
import { useState, useMemo, useCallback } from "react";
import { useAppContext } from "@/lib/appContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery } from "@tanstack/react-query";
import { fetchMetricSeries } from "@/lib/fetchMetricSeries";
import { fetchTradingDates } from "@/lib/fetchTradingDates";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { isPercentMetric } from "@/lib/metricUtils";
import { getWorkbookMetrics } from "@/lib/workbookMetrics";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Loader2, Info, Download } from "lucide-react";
import { Play as PlayIcon } from "@/lib/icons";
import {
  ResponsiveContainer, LineChart, XAxis, YAxis, Tooltip, ReferenceLine, Legend, Line,
} from "recharts";
import CartesianGrid from "@/components/CartesianGrid";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TickerMeta {
  ticker: string;
  sector?: string;
}

interface Observation {
  date: string;
  ticker: string;
  mult: number;
  grw: number;
  sector: string;
  closeAtT: number;
  closeAtH: Record<string, number | null>;
}

interface BucketStat {
  bucket: string;
  horizon: string;
  n: number;
  meanReturn: number;
  medianReturn: number;
  stdReturn: number;
  hitRate: number;
  meanReturnSR?: number;
  hitRateSR?: number;
}

interface BacktestResult {
  nDates: number;
  nObservations: number;
  threshold: number;
  sectorRelative: boolean;
  rankingMode: "peg" | "zscore";
  quintile: {
    bucketStats: BucketStat[];
    longShort: { bucket: string; horizon: string; n: number; meanReturn: number; medianReturn: number; stdReturn: number; hitRate: number }[];
    icPerDate: { date: string; horizon: string; ic: number | null }[];
    icMeans: Record<string, number | null>;
    icStds: Record<string, number | null>;
    equityCurve: { date: string; q1: number; q5: number; ls: number }[];
  };
  quadrant: {
    bucketStats: BucketStat[];
    brMinusRest: { bucket: string; horizon: string; n: number; meanReturn: number; medianReturn: number; stdReturn: number; hitRate: number }[];
  };
}

interface RunProgress {
  stage: "idle" | "fetching-dates" | "fetching-closes" | "computing" | "done" | "error";
  done: number;
  total: number;
  message: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HORIZONS = [
  { days: 21,  label: "1M" },
  { days: 63,  label: "3M" },
  { days: 126, label: "6M" },
  { days: 252, label: "12M" },
];

const HORIZON_LABELS = HORIZONS.map(h => h.label);

const METRIC_GROUPS: Record<string, string[]> = {
  Valuation:   ["P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2"],
  Yields:      ["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield"],
  Growth:      ["FY1 FFO Growth", "FY2 FFO Growth", "FY1 AFFO Growth", "FY2 AFFO Growth", "FY1 EPS Growth", "FY2 EPS Growth"],
  Performance: ["1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%", "% off 52wk High", "% off 52wk Low"],
  Estimates:   ["EPS FY2", "FFO FY2", "AFFO FY2", "EBITDA FY2"],
  Other:       ["close", "Enterprise Value", "Dividend Yield"],
};

const REBALANCE_PERIODS = [
  { label: "Monthly (21d)",     days: 21  },
  { label: "Quarterly (63d)",   days: 63  },
  { label: "Semi-annual (126d)",days: 126 },
  { label: "Annual (252d)",     days: 252 },
];

// ─── Math helpers ─────────────────────────────────────────────────────────────

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
  if (arr.length < 2) return 0;
  const m = arrayMean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function spearmanIC(xArr: number[], yArr: number[]): number | null {
  const n = xArr.length;
  if (n !== yArr.length || n < 3) return null;
  const rank = (arr: number[]) => {
    const indexed = arr.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    let p = 0;
    while (p < n) {
      let q = p;
      while (q + 1 < n && indexed[q + 1].v === indexed[p].v) q++;
      const avgRank = (p + q) / 2 + 1;
      for (let k = p; k <= q; k++) ranks[indexed[k].i] = avgRank;
      p = q + 1;
    }
    return ranks;
  };
  const rx = rank(xArr), ry = rank(yArr);
  const mx = arrayMean(rx), my = arrayMean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const ex = rx[i] - mx, ey = ry[i] - my; num += ex * ey; dx += ex * ex; dy += ey * ey; }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? null : num / denom;
}

function computeForwardReturns(obs: Observation): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const h of HORIZONS) {
    const closeNow = obs.closeAtT;
    const closeFut = obs.closeAtH[h.label] ?? null;
    if (closeNow == null || closeFut == null || !Number.isFinite(closeNow) || !Number.isFinite(closeFut) || closeNow <= 0) result[h.label] = null;
    else result[h.label] = closeFut / closeNow - 1;
  }
  return result;
}

function computeSectorRelative(obs: Observation[], fwdMap: Map<Observation, Record<string, number | null>>): Map<Observation, Record<string, number | null>> {
  // build sector means
  const sectorMeans: Record<string, Record<string, number[]>> = {};
  for (const ob of obs) {
    const sector = ob.sector || "Unknown";
    if (!sectorMeans[sector]) sectorMeans[sector] = { "1M": [], "3M": [], "6M": [], "12M": [] };
    const fwd = fwdMap.get(ob);
    for (const h of HORIZONS) { const v = fwd?.[h.label]; if (v != null && Number.isFinite(v)) sectorMeans[sector][h.label].push(v); }
  }
  const sectorAvg: Record<string, Record<string, number | null>> = {};
  for (const sector of Object.keys(sectorMeans)) {
    sectorAvg[sector] = {} as Record<string, number | null>;
    for (const h of HORIZONS) { const arr = sectorMeans[sector][h.label]; sectorAvg[sector][h.label] = arr.length ? arrayMean(arr) : null; }
  }
  // subtract
  const result = new Map<Observation, Record<string, number | null>>();
  for (const ob of obs) {
    const sector = ob.sector || "Unknown";
    const fwd = fwdMap.get(ob);
    const sr: Record<string, number | null> = {};
    for (const h of HORIZONS) { const abs = fwd?.[h.label]; const avg = sectorAvg[sector]?.[h.label]; sr[h.label] = abs != null && avg != null ? abs - avg : null; }
    result.set(ob, sr);
  }
  return result;
}

function assignQuintiles(scores: number[]): number[] {
  const n = scores.length;
  if (n === 0) return [];
  const indexed = scores.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const result = new Array(n);
  for (let i = 0; i < n; i++) result[indexed[i].i] = Math.min(5, Math.floor(i / n * 5) + 1);
  return result;
}

function makeBucketStat(bucket: string, horizon: string, rets: number[], srRets: number[] | null, hitThreshold: number): BucketStat {
  const stat: BucketStat = {
    bucket, horizon, n: rets.length,
    meanReturn: rets.length ? arrayMean(rets) : NaN,
    medianReturn: rets.length ? arrayMedian(rets) : NaN,
    stdReturn: rets.length ? arrayStd(rets) : NaN,
    hitRate: rets.length ? rets.filter(r => r >= hitThreshold).length / rets.length : NaN,
  };
  if (srRets) { stat.meanReturnSR = srRets.length ? arrayMean(srRets) : NaN; stat.hitRateSR = srRets.length ? srRets.filter(r => r >= hitThreshold).length / srRets.length : NaN; }
  return stat;
}

function runBacktest(observations: Observation[], opts: { threshold: number; sectorRelative: boolean; rankingMode: "peg" | "zscore" }): BacktestResult {
  // Group by date
  const byDate = new Map<string, Observation[]>();
  for (const ob of observations) { if (!byDate.has(ob.date)) byDate.set(ob.date, []); byDate.get(ob.date)!.push(ob); }
  const dates = [...byDate.keys()].sort();

  const qBuckets: Record<string, Record<string, number[]>> = {};
  const qSR: Record<string, Record<string, number[]>> = {};
  const quadBuckets: Record<string, Record<string, number[]>> = {};
  const quadSR: Record<string, Record<string, number[]>> = {};
  for (const q of ["Q1", "Q2", "Q3", "Q4", "Q5"]) { qBuckets[q] = {}; qSR[q] = {}; for (const h of HORIZONS) { qBuckets[q][h.label] = []; qSR[q][h.label] = []; } }
  for (const q of ["BR", "BL", "TR", "TL"]) { quadBuckets[q] = {}; quadSR[q] = {}; for (const h of HORIZONS) { quadBuckets[q][h.label] = []; quadSR[q][h.label] = []; } }

  // For IC and equity curve
  const icPerDate: { date: string; horizon: string; ic: number | null }[] = [];
  // Per-date, per-horizon Q1/Q5 returns (drives both long-short spread and equity curve)
  const perDateQ1Q5: Record<string, Record<string, { q1: number[]; q5: number[] }>> = {};
  for (const date of dates) { perDateQ1Q5[date] = {}; for (const h of HORIZONS) perDateQ1Q5[date][h.label] = { q1: [], q5: [] }; }

  let totalObs = 0;

  for (const date of dates) {
    const group = byDate.get(date)!;
    const valid = group.filter(ob => {
      if (ob.mult == null || ob.grw == null || !Number.isFinite(ob.mult) || !Number.isFinite(ob.grw) || !(ob.mult > 0) || ob.closeAtT == null || !(ob.closeAtT > 0)) return false;
      if (opts.rankingMode === "peg" && !(ob.grw > 0)) return false;
      return true;
    });
    if (valid.length < 5) continue;
    totalObs += valid.length;

    // Compute forward returns
    const fwdMap = new Map<Observation, Record<string, number | null>>();
    for (const ob of valid) fwdMap.set(ob, computeForwardReturns(ob));
    const srMap = opts.sectorRelative ? computeSectorRelative(valid, fwdMap) : null;

    // Compute PEG / zscore
    let scores: number[];
    if (opts.rankingMode === "zscore") {
      const mults = valid.map(ob => ob.mult);
      const grws = valid.map(ob => ob.grw);
      const meanMult = arrayMean(mults), stdMult = arrayStd(mults);
      const meanGrw = arrayMean(grws), stdGrw = arrayStd(grws);
      const stdMultSafe = stdMult > 1e-12 ? stdMult : 1;
      const stdGrwSafe = stdGrw > 1e-12 ? stdGrw : 1;
      scores = valid.map(ob => (ob.mult - meanMult) / stdMultSafe - (ob.grw - meanGrw) / stdGrwSafe);
    } else {
      scores = valid.map(ob => ob.mult / ob.grw);
    }

    const quintiles = assignQuintiles(scores);

    // Quintile buckets
    for (let i = 0; i < valid.length; i++) {
      const q = `Q${quintiles[i]}`;
      const fwd = fwdMap.get(valid[i]);
      const sr = srMap?.get(valid[i]);
      for (const h of HORIZONS) {
        const v = fwd?.[h.label];
        if (v != null && Number.isFinite(v)) {
          qBuckets[q][h.label].push(v);
          if (q === "Q1") perDateQ1Q5[date][h.label].q1.push(v);
          if (q === "Q5") perDateQ1Q5[date][h.label].q5.push(v);
        }
        const sv = sr?.[h.label]; if (sv != null && Number.isFinite(sv)) qSR[q][h.label].push(sv);
      }
    }

    // Quadrant (median split on each axis)
    const medMult = arrayMedian(valid.map(ob => ob.mult));
    const medGrw = arrayMedian(valid.map(ob => ob.grw));
    for (const ob of valid) {
      const isLowMult = ob.mult <= medMult;
      const isHighGrw = ob.grw >= medGrw;
      const quad = isLowMult && isHighGrw ? "BR" : isLowMult && !isHighGrw ? "BL" : !isLowMult && isHighGrw ? "TR" : "TL";
      const fwd = fwdMap.get(ob); const sr = srMap?.get(ob);
      for (const h of HORIZONS) {
        const v = fwd?.[h.label]; if (v != null && Number.isFinite(v)) quadBuckets[quad][h.label].push(v);
        const sv = sr?.[h.label]; if (sv != null && Number.isFinite(sv)) quadSR[quad][h.label].push(sv);
      }
    }

    // IC: correlation of (-peg) with fwd returns
    const negScores = scores.map(s => -s);
    for (const h of HORIZONS) {
      const retArr: number[] = [], scoreArr: number[] = [];
      for (let i = 0; i < valid.length; i++) { const v = fwdMap.get(valid[i])?.[h.label]; if (v != null && Number.isFinite(v)) { retArr.push(v); scoreArr.push(negScores[i]); } }
      icPerDate.push({ date, horizon: h.label, ic: spearmanIC(scoreArr, retArr) });
    }
  }

  // Build quintile bucket stats
  const quintileBucketStats: BucketStat[] = [];
  for (const q of ["Q1", "Q2", "Q3", "Q4", "Q5"])
    for (const h of HORIZONS)
      quintileBucketStats.push(makeBucketStat(q, h.label, qBuckets[q][h.label], opts.sectorRelative ? qSR[q][h.label] : null, opts.threshold));

  // Long-short Q1-Q5 per date then averaged
  const longShortPerDate: Record<string, number[]> = {};
  for (const h of HORIZONS) longShortPerDate[h.label] = [];
  for (const date of dates) {
    for (const h of HORIZONS) {
      const { q1, q5 } = perDateQ1Q5[date][h.label];
      if (q1.length === 0 || q5.length === 0) continue;
      longShortPerDate[h.label].push(arrayMean(q1) - arrayMean(q5));
    }
  }

  const longShort = HORIZONS.map(h => {
    const arr = longShortPerDate[h.label];
    return makeBucketStat("Q1-Q5", h.label, arr, null, opts.threshold);
  });

  // IC means/stds
  const icMeans: Record<string, number | null> = {}, icStds: Record<string, number | null> = {};
  for (const h of HORIZONS) {
    const ics = icPerDate.filter(x => x.horizon === h.label && x.ic !== null).map(x => x.ic as number);
    icMeans[h.label] = ics.length ? arrayMean(ics) : null;
    icStds[h.label] = ics.length ? arrayStd(ics) : null;
  }

  // Equity curve (compounded)
  let q1Cum = 1, q5Cum = 1, lsCum = 1;
  const equityCurve: { date: string; q1: number; q5: number; ls: number }[] = [];
  for (const date of dates) {
    const eq = perDateQ1Q5[date]["1M"];
    if (!eq || eq.q1.length === 0 || eq.q5.length === 0) continue;
    const q1Ret = arrayMean(eq.q1), q5Ret = arrayMean(eq.q5);
    q1Cum *= 1 + q1Ret; q5Cum *= 1 + q5Ret; lsCum *= 1 + (q1Ret - q5Ret);
    equityCurve.push({ date, q1: q1Cum, q5: q5Cum, ls: lsCum });
  }

  // Quadrant bucket stats
  const quadBucketStats: BucketStat[] = [];
  for (const q of ["BR", "BL", "TR", "TL"])
    for (const h of HORIZONS)
      quadBucketStats.push(makeBucketStat(q, h.label, quadBuckets[q][h.label], opts.sectorRelative ? quadSR[q][h.label] : null, opts.threshold));

  const brMinusRest = HORIZONS.map(h => {
    const brRets = quadBuckets["BR"][h.label];
    const restRets = [...quadBuckets["BL"][h.label], ...quadBuckets["TR"][h.label], ...quadBuckets["TL"][h.label]];
    if (brRets.length === 0 || restRets.length === 0) return { bucket: "BR - Rest", horizon: h.label, n: 0, meanReturn: NaN, medianReturn: NaN, stdReturn: NaN, hitRate: NaN };
    return { bucket: "BR - Rest", horizon: h.label, n: brRets.length, meanReturn: arrayMean(brRets) - arrayMean(restRets), medianReturn: arrayMedian(brRets) - arrayMedian(restRets), stdReturn: NaN, hitRate: brRets.filter(r => r >= opts.threshold).length / brRets.length };
  });

  return { nDates: dates.length, nObservations: totalObs, threshold: opts.threshold, sectorRelative: opts.sectorRelative, rankingMode: opts.rankingMode, quintile: { bucketStats: quintileBucketStats, longShort, icPerDate, icMeans, icStds, equityCurve }, quadrant: { bucketStats: quadBucketStats, brMinusRest } };
}

// ─── CSV export helpers ───────────────────────────────────────────────────────

function buildCsv(rows: Record<string, unknown>[], cols: string[]): string {
  const lines = rows.map(row => cols.map(col => { const v = row[col]; if (v == null) return ""; const s = String(v); return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; }).join(","));
  return [cols.join(","), ...lines].join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function heatColor(v: number | null | undefined, scale = 0.1): string {
  if (v == null || !Number.isFinite(v)) return "transparent";
  const t = Math.max(-1, Math.min(1, v / scale));
  return t >= 0 ? `rgba(34, 197, 94, ${Math.min(0.55, t * 0.55)})` : `rgba(239, 68, 68, ${Math.min(0.55, -t * 0.55)})`;
}

function fmtPct(v: number | null | undefined, decimals = 2): string { return v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(decimals)}%`; }
function fmtFixed(v: number | null | undefined, decimals = 3): string { return v == null || !Number.isFinite(v) ? "—" : v.toFixed(decimals); }
function fmtInt(v: number | null | undefined): string { return v == null || !Number.isFinite(v) ? "—" : String(Math.round(v)); }

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FactorBacktest() {
  const appCtx = useAppContext();
  const [metricY, setMetricY] = useState("P/FFO FY2");
  const [metricX, setMetricX] = useState("FY2 FFO Growth");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rebalanceDays, setRebalanceDays] = useState(21);
  const [thresholdPct, setThresholdPct] = useState("5");
  const [sectorRelative, setSectorRelative] = useState(false);
  const [rankingMode, setRankingMode] = useState<"peg" | "zscore">("peg");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress>({ stage: "idle", done: 0, total: 0, message: "" });
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getWorkspaceState = useCallback(() => ({ metricY, metricX, startDate, endDate, rebalanceDays, thresholdPct, sectorRelative, rankingMode }), [metricY, metricX, startDate, endDate, rebalanceDays, thresholdPct, sectorRelative, rankingMode]);
  const restoreWorkspaceState = useCallback((saved: Record<string, unknown>) => {
    if (!saved || typeof saved !== "object") return;
    if (typeof saved.metricY === "string") setMetricY(saved.metricY);
    if (typeof saved.metricX === "string") setMetricX(saved.metricX);
    if (typeof saved.startDate === "string") setStartDate(saved.startDate);
    if (typeof saved.endDate === "string") setEndDate(saved.endDate);
    if (typeof saved.rebalanceDays === "number" && Number.isFinite(saved.rebalanceDays)) setRebalanceDays(saved.rebalanceDays);
    if (typeof saved.thresholdPct === "string") setThresholdPct(saved.thresholdPct);
    if (typeof saved.sectorRelative === "boolean") setSectorRelative(saved.sectorRelative);
    if (saved.rankingMode === "peg" || saved.rankingMode === "zscore") setRankingMode(saved.rankingMode);
  }, []);
  useWorkspaceTab("factor-backtest", getWorkspaceState, restoreWorkspaceState);

  const datesQuery = useQuery({ queryKey: ["fb-dates"], queryFn: fetchTradingDates });
  const tickersQuery = useQuery({ queryKey: ["fb-tickers"], queryFn: fetchWorkbookTickers });

  const tradingDates: string[] = (datesQuery.data as string[] | undefined) ?? [];
  const allTickersMeta: TickerMeta[] = (tickersQuery.data as TickerMeta[] | undefined) ?? [];

  // Initialize start/end dates
  useMemo(() => {
    if (tradingDates.length) {
      if (!startDate) { const lastIdx = tradingDates.length - 1; setStartDate(tradingDates[Math.max(0, lastIdx - 2520)]); }
      if (!endDate) setEndDate(tradingDates[tradingDates.length - 1]);
    }
  }, [tradingDates.length, startDate, endDate]);

  // Build workbook metrics
  const workbookMetrics = useMemo<string[]>(() => { try { const m = getWorkbookMetrics(); return Array.isArray(m) ? (m as Array<{ key?: string } | string>).map(x => typeof x === "string" ? x : (x.key ?? "")).filter(Boolean) : []; } catch { return []; } }, [tickersQuery.dataUpdatedAt]);

  const metricGroups = useMemo(() => {
    const groups = Object.entries(METRIC_GROUPS).map(([group, metrics]) => ({ group, metrics }));
    if (workbookMetrics.length) {
      const existingSet = new Set(Object.values(METRIC_GROUPS).flat());
      const extra = workbookMetrics.filter((m) => !existingSet.has(m));
      if (extra.length) groups.push({ group: "Workbook", metrics: extra });
    }
    return groups;
  }, [workbookMetrics]);

  const universeTickers = useMemo(() => {
    let tickers = allTickersMeta;
    if (appCtx.universeTickers) tickers = tickers.filter(t => appCtx.universeTickers!.has(t.ticker));
    return tickers.map(t => t.ticker);
  }, [allTickersMeta, appCtx.universeTickers]);

  const sectorMap = useMemo(() => { const m = new Map<string, string>(); for (const t of allTickersMeta) m.set(t.ticker, t.sector || "Unknown"); return m; }, [allTickersMeta]);

  const handleRun = useCallback(async () => {
    setErrorMsg(null); setResult(null); setIsRunning(true);
    setProgress({ stage: "fetching-dates", done: 0, total: 0, message: "Building rebalance schedule…" });
    try {
      if (tradingDates.length === 0) throw new Error("Dates not loaded");
      if (universeTickers.length === 0) throw new Error("No tickers in universe");

      const startIdx = Math.max(0, tradingDates.findIndex(d => d >= startDate));
      let endIdx = tradingDates.length - 1;
      for (let i = tradingDates.length - 1; i >= 0; i--) { if (tradingDates[i] <= endDate) { endIdx = i; break; } }
      if (startIdx > endIdx) throw new Error("Start date after end date");

      const rebalIdxs: number[] = [];
      for (let i = startIdx; i <= endIdx; i += rebalanceDays) rebalIdxs.push(i);
      if (rebalIdxs.length === 0) throw new Error("No rebalance dates in range");

      const threshold = (parseFloat(thresholdPct) || 5) / 100;
      setProgress({ stage: "fetching-closes", done: 0, total: universeTickers.length, message: `Loading price + factor series for ${universeTickers.length} tickers…` });

      const horizonOffsets: Record<string, number> = { "1M": 21, "3M": 63, "6M": 126, "12M": 252 };
      const closeMaps = new Map<string, Map<string, number>>();
      const multMaps = new Map<string, Map<string, number>>();
      const grwMaps = new Map<string, Map<string, number>>();

      const queue = [...universeTickers];
      let loadedCount = 0;
      const CONCURRENCY = 8;

      async function loadOneTicker(ticker: string) {
        try {
          const [closeSeries, grwSeries, multSeries] = await Promise.all([
            fetchMetricSeries(ticker, "close"),
            fetchMetricSeries(ticker, metricX),
            fetchMetricSeries(ticker, metricY),
          ]);
          const closeMap = new Map<string, number>();
          if (closeSeries) { for (let ci = 0; ci < closeSeries.dates.length; ci++) { const v = closeSeries.values[ci]; if (v != null && Number.isFinite(v)) closeMap.set(closeSeries.dates[ci], v); } }
          closeMaps.set(ticker, closeMap);
          const grwMap = new Map<string, number>();
          if (grwSeries) { for (let ci = 0; ci < grwSeries.dates.length; ci++) { const v = grwSeries.values[ci]; if (v != null && Number.isFinite(v)) grwMap.set(grwSeries.dates[ci], v); } }
          grwMaps.set(ticker, grwMap);
          const multMap = new Map<string, number>();
          if (multSeries) { for (let ci = 0; ci < multSeries.dates.length; ci++) { const v = multSeries.values[ci]; if (v != null && Number.isFinite(v)) multMap.set(multSeries.dates[ci], v); } }
          multMaps.set(ticker, multMap);
        } catch { /**/ }
        setProgress(prev => ({ ...prev, done: prev.done + 1 }));
      }

      let qi = 0;
      async function worker() { for (;;) { const idx = qi++; if (idx >= queue.length) return; await loadOneTicker(queue[idx]); } }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      loadedCount = queue.length;

      setProgress({ stage: "computing", done: 0, total: 1, message: "Computing buckets, IC and equity curve…" });

      // Build observations
      const getVal = (map: Map<string, number> | undefined, date: string): number | null => {
        if (!map) return null;
        if (map.has(date)) return map.get(date)!;
        const dateIdx = tradingDates.indexOf(date);
        if (dateIdx < 0) return null;
        for (let i = dateIdx; i >= Math.max(0, dateIdx - 60); i--) { const v = map.get(tradingDates[i]); if (v != null) return v; }
        return null;
      };

      const observations: Observation[] = [];
      let missingX = 0, missingY = 0, failedNorm = 0, noClose = 0, noCloseOnDate = 0;
      const hasXSet = new Set<string>(), hasYSet = new Set<string>(), hasCloseSet = new Set<string>();

      for (const rebalIdx of rebalIdxs) {
        const date = tradingDates[rebalIdx];
        for (const ticker of universeTickers) {
          const rawGrw = getVal(grwMaps.get(ticker), date);
          const rawMult = getVal(multMaps.get(ticker), date);
          if (rawGrw != null) hasXSet.add(ticker);
          if (rawMult != null) hasYSet.add(ticker);
          if (rawGrw == null) { missingX++; continue; }
          if (rawMult == null) { missingY++; continue; }
          const grw = isPercentMetric(metricX) ? rawGrw / 100 : rawGrw;
          const mult = rawMult;
          if (grw == null || mult == null) { failedNorm++; continue; }
          const closeMap = closeMaps.get(ticker);
          if (!closeMap) { noClose++; continue; }
          if (closeMap.size > 0) hasCloseSet.add(ticker);
          const closeNow = closeMap.get(date) ?? null;
          if (closeNow == null) { noCloseOnDate++; continue; }
          const closeAtH: Record<string, number | null> = {};
          for (const h of HORIZONS) { const fi = rebalIdx + horizonOffsets[h.label]; if (fi < tradingDates.length) { closeAtH[h.label] = closeMap.get(tradingDates[fi]) ?? null; } else closeAtH[h.label] = null; }
          observations.push({ date, ticker, mult, grw, sector: sectorMap.get(ticker) || "Unknown", closeAtT: closeNow, closeAtH });
        }
      }

      if (observations.length === 0) {
        const totalPairs = rebalIdxs.length * universeTickers.length;
        const msgs: string[] = [];
        if (hasYSet.size === 0) msgs.push(`Y metric "${metricY}" returned no data for any of ${universeTickers.length} tickers — check that this metric exists for your universe.`);
        if (hasXSet.size === 0) msgs.push(`X metric "${metricX}" returned no data for any of ${universeTickers.length} tickers — check that this metric exists for your universe.`);
        if (msgs.length === 0) msgs.push(`Joined 0 of ${totalPairs.toLocaleString()} candidate (date×ticker) pairs. Missing X: ${missingX.toLocaleString()}, missing Y: ${missingY.toLocaleString()}, failed normalize: ${failedNorm.toLocaleString()}, no close series: ${noClose.toLocaleString()}, no close on rebal date: ${noCloseOnDate.toLocaleString()}. Tickers with any X: ${hasXSet.size}, with any Y: ${hasYSet.size}, with any close: ${hasCloseSet.size}.`);
        throw new Error(msgs.join(" "));
      }
      void loadedCount;

      const btResult = runBacktest(observations, { threshold, sectorRelative, rankingMode });
      setResult(btResult);
      setProgress({ stage: "done", done: 1, total: 1, message: `Done — ${btResult.nObservations.toLocaleString()} observations across ${btResult.nDates} rebalance dates` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setProgress({ stage: "error", done: 0, total: 0, message: msg });
    } finally {
      setIsRunning(false);
    }
  }, [tradingDates, universeTickers, startDate, endDate, rebalanceDays, metricX, metricY, thresholdPct, sectorRelative, rankingMode, sectorMap]);

  // Download callbacks
  const downloadQuintile = useCallback(() => {
    if (!result) return;
    const rows = result.quintile.bucketStats.map(s => ({ bucket: s.bucket, horizon: s.horizon, n: s.n, meanReturn: s.meanReturn, medianReturn: s.medianReturn, stdReturn: s.stdReturn, hitRate: s.hitRate, meanReturnSR: s.meanReturnSR ?? "", hitRateSR: s.hitRateSR ?? "" }));
    downloadCsv(`factor_bt_quintile_${metricY}_${metricX}.csv`, buildCsv(rows, ["bucket", "horizon", "n", "meanReturn", "medianReturn", "stdReturn", "hitRate", "meanReturnSR", "hitRateSR"]));
  }, [result, metricY, metricX]);

  const downloadQuadrant = useCallback(() => {
    if (!result) return;
    const rows = result.quadrant.bucketStats.map(s => ({ bucket: s.bucket, horizon: s.horizon, n: s.n, meanReturn: s.meanReturn, medianReturn: s.medianReturn, stdReturn: s.stdReturn, hitRate: s.hitRate, meanReturnSR: s.meanReturnSR ?? "", hitRateSR: s.hitRateSR ?? "" }));
    downloadCsv(`factor_bt_quadrant_${metricY}_${metricX}.csv`, buildCsv(rows, ["bucket", "horizon", "n", "meanReturn", "medianReturn", "stdReturn", "hitRate", "meanReturnSR", "hitRateSR"]));
  }, [result, metricY, metricX]);

  const downloadIC = useCallback(() => {
    if (!result) return;
    downloadCsv(`factor_bt_ic_${metricY}_${metricX}.csv`, buildCsv(result.quintile.icPerDate.map(r => ({ date: r.date, horizon: r.horizon, ic: r.ic ?? "" })), ["date", "horizon", "ic"]));
  }, [result, metricY, metricX]);

  const downloadEquity = useCallback(() => {
    if (!result) return;
    downloadCsv(`factor_bt_equity_${metricY}_${metricX}.csv`, buildCsv(result.quintile.equityCurve.map(r => ({ date: r.date, q1: r.q1, q5: r.q5, ls: r.ls })), ["date", "q1", "q5", "ls"]));
  }, [result, metricY, metricX]);

  // Build lookup maps for table rendering
  const quintileMap = useMemo(() => { const m = new Map<string, BucketStat>(); if (result) for (const s of result.quintile.bucketStats) m.set(`${s.bucket}|${s.horizon}`, s); return m; }, [result]);
  const quadMap = useMemo(() => { const m = new Map<string, BucketStat>(); if (result) for (const s of result.quadrant.bucketStats) m.set(`${s.bucket}|${s.horizon}`, s); return m; }, [result]);

  const quintileRows = useMemo(() => { const rows: { bucket: string; horizon: string }[] = []; for (const q of ["Q1", "Q2", "Q3", "Q4", "Q5"]) for (const h of HORIZON_LABELS) rows.push({ bucket: q, horizon: h }); return rows; }, []);
  const quadRows = useMemo(() => { const rows: { bucket: string; horizon: string }[] = []; for (const q of ["BR", "BL", "TR", "TL"]) for (const h of HORIZON_LABELS) rows.push({ bucket: q, horizon: h }); return rows; }, []);

  const icChartData = useMemo(() => {
    if (!result) return [];
    const byDate = new Map<string, Record<string, number | null>>();
    for (const pt of result.quintile.icPerDate) { if (!byDate.has(pt.date)) byDate.set(pt.date, { date: pt.date as unknown as number } as Record<string, number | null>); byDate.get(pt.date)![pt.horizon] = pt.ic; }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [result]);

  const equityData = useMemo(() => result?.quintile.equityCurve ?? [], [result]);

  const HORIZON_COLORS = ["#22c55e", "#0ea5e9", "#a855f7", "#f59e0b"];

  const renderBucketTable = (title: string, rows: { bucket: string; horizon: string }[], statsMap: Map<string, BucketStat>, onDownload: () => void) => (
    <div className="border border-border rounded bg-card/40">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="font-semibold text-sm">{title}</div>
        <Button size="sm" variant="ghost" onClick={onDownload} className="h-7 text-xs"><Download className="w-3 h-3 mr-1" /> CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead><tr className="border-b border-border bg-muted/30">
            <th className="text-left px-2 py-1.5 font-medium">Bucket</th>
            <th className="text-right px-2 py-1.5 font-medium">Horizon</th>
            <th className="text-right px-2 py-1.5 font-medium">N</th>
            <th className="text-right px-2 py-1.5 font-medium">Mean</th>
            <th className="text-right px-2 py-1.5 font-medium">Median</th>
            <th className="text-right px-2 py-1.5 font-medium">Stdev</th>
            <th className="text-right px-2 py-1.5 font-medium">Hit ≥{thresholdPct}%</th>
            {sectorRelative && <><th className="text-right px-2 py-1.5 font-medium text-amber-400">Mean (SR)</th><th className="text-right px-2 py-1.5 font-medium text-amber-400">Hit (SR)</th></>}
          </tr></thead>
          <tbody>
            {rows.map(({ bucket, horizon }) => {
              const stat = statsMap.get(`${bucket}|${horizon}`);
              if (!stat) return null;
              return (
                <tr key={`${bucket}-${horizon}`} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-2 py-1.5 font-mono">{bucket}</td>
                  <td className="text-right px-2 py-1.5">{horizon}</td>
                  <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">{fmtInt(stat.n)}</td>
                  <td className="text-right px-2 py-1.5 font-mono" style={{ background: heatColor(stat.meanReturn, 0.05) }}>{fmtPct(stat.meanReturn)}</td>
                  <td className="text-right px-2 py-1.5 font-mono" style={{ background: heatColor(stat.medianReturn, 0.05) }}>{fmtPct(stat.medianReturn)}</td>
                  <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">{fmtPct(stat.stdReturn)}</td>
                  <td className="text-right px-2 py-1.5 font-mono">{fmtPct(stat.hitRate, 1)}</td>
                  {sectorRelative && <>
                    <td className="text-right px-2 py-1.5 font-mono text-amber-300" style={{ background: heatColor(stat.meanReturnSR, 0.03) }}>{fmtPct(stat.meanReturnSR)}</td>
                    <td className="text-right px-2 py-1.5 font-mono text-amber-300">{fmtPct(stat.hitRateSR, 1)}</td>
                  </>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls */}
      <div className="border-b border-border bg-card/40 px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Y (Multiple):</span>
          <Select value={metricY} onValueChange={setMetricY}>
            <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {metricGroups.map(g => (
                <div key={g.group}>
                  <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">{g.group}</div>
                  {g.metrics.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">X (Growth):</span>
          <Select value={metricX} onValueChange={setMetricX}>
            <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {metricGroups.map(g => (
                <div key={g.group}>
                  <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">{g.group}</div>
                  {g.metrics.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Range:</span>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-7 w-32 text-xs" />
          <span>→</span>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-7 w-32 text-xs" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Rebalance:</span>
          <Select value={String(rebalanceDays)} onValueChange={v => setRebalanceDays(parseInt(v))}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REBALANCE_PERIODS.map(p => <SelectItem key={p.days} value={String(p.days)} className="text-xs">{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Threshold:</span>
          <Input type="number" step="0.5" value={thresholdPct} onChange={e => setThresholdPct(e.target.value)} className="h-7 w-16 text-xs" />
          <span>%</span>
        </div>
        <div className="flex items-center gap-1">
          <Checkbox checked={sectorRelative} onCheckedChange={v => setSectorRelative(!!v)} />
          <span className="text-muted-foreground">Sector-relative</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Rank:</span>
          <Select value={rankingMode} onValueChange={v => setRankingMode(v as "peg" | "zscore")}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="peg" className="text-xs">PEG (mult/grw)</SelectItem>
              <SelectItem value="zscore" className="text-xs">Z-score composite</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-muted-foreground">
          Universe: <span className="text-foreground font-mono">{universeTickers.length}</span> tickers
          {appCtx.isFiltered && <span className="text-amber-400 ml-1">(filtered)</span>}
        </div>
        <div className="flex-1" />
        <Button onClick={handleRun} disabled={isRunning || datesQuery.isLoading || tickersQuery.isLoading} size="sm" className="h-7 text-xs">
          {isRunning ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running…</> : <><PlayIcon className="w-3 h-3 mr-1" /> Run Backtest</>}
        </Button>
      </div>

      {/* Progress */}
      {(isRunning || progress.stage !== "idle") && (
        <div className="px-3 py-1.5 text-xs border-b border-border bg-card/20 flex items-center gap-2">
          {isRunning && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          <span className={progress.stage === "error" ? "text-red-400" : "text-muted-foreground"}>
            {progress.message}
            {progress.total > 0 && progress.stage !== "done" && progress.stage !== "error" && ` · ${progress.done}/${progress.total}`}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-4">
        {!result && !isRunning && (
          <div className="text-xs text-muted-foreground border border-dashed border-border rounded p-4 flex items-start gap-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-1">Cheap-Growth / PEG Factor Backtest</div>
              <div>Tests whether stocks in the <span className="font-mono">bottom-right quadrant</span> (low Y multiple + high X growth) generate higher forward returns. <span className="font-mono">Q1</span> = cheapest PEG (mult ÷ growth) ⇒ expected outperformer. <span className="font-mono">BR</span> quadrant uses cross-sectional medians on each date. IC = Spearman rank correlation between -PEG and forward return per date. Sector-relative mode subtracts each ticker's sector mean return at the same date+horizon.</div>
              <div className="mt-2 text-muted-foreground/70">Defaults: P/FFO FY2 vs FY2 FFO Growth, monthly rebalance, +5% hit-rate. Set the active universe via the Universe tab to scope the run.</div>
            </div>
          </div>
        )}

        {result && (
          <>
            {/* Summary stats */}
            <div className="text-xs flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
              <div><span className="text-foreground font-semibold">{result.nDates}</span> rebalance dates</div>
              <div><span className="text-foreground font-semibold">{result.nObservations.toLocaleString()}</span> observations</div>
              <div>Threshold: <span className="text-foreground">{thresholdPct}%</span></div>
              <div>Mode: <span className="text-foreground">{sectorRelative ? "Sector-relative" : "Absolute"}</span></div>
              <div>Rank: <span className="text-foreground">{(result.rankingMode ?? "peg") === "zscore" ? "Z-score" : "PEG"}</span></div>
              <div>Y: <span className="text-foreground font-mono">{metricY}</span></div>
              <div>X: <span className="text-foreground font-mono">{metricX}</span></div>
            </div>

            {/* IC table */}
            <div className="border border-border rounded bg-card/40">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <div className="font-semibold text-sm">Information Coefficient (Spearman rank corr of -PEG vs forward return)</div>
                <Button size="sm" variant="ghost" onClick={downloadIC} className="h-7 text-xs"><Download className="w-3 h-3 mr-1" /> CSV (per date)</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead><tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-2 py-1.5 font-medium">Horizon</th>
                    <th className="text-right px-2 py-1.5 font-medium">Mean IC</th>
                    <th className="text-right px-2 py-1.5 font-medium">Stdev IC</th>
                    <th className="text-right px-2 py-1.5 font-medium">IR (mean/std)</th>
                    <th className="text-right px-2 py-1.5 font-medium">Interpretation</th>
                  </tr></thead>
                  <tbody>
                    {HORIZON_LABELS.map(label => {
                      const mean = result.quintile.icMeans[label];
                      const std = result.quintile.icStds[label];
                      const ir = mean != null && std != null && std > 0 ? mean / std : null;
                      const interp = mean == null ? "—" : mean >= 0.05 ? "Strong predictive (cheap PEG → higher ret)" : mean >= 0.02 ? "Mild predictive" : mean >= -0.02 ? "Noise" : mean >= -0.05 ? "Mild contrarian" : "Strong contrarian (cheap PEG → lower ret)";
                      return (
                        <tr key={label} className="border-b border-border/50">
                          <td className="px-2 py-1.5 font-mono">{label}</td>
                          <td className="text-right px-2 py-1.5 font-mono" style={{ background: heatColor(mean, 0.05) }}>{fmtFixed(mean)}</td>
                          <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">{fmtFixed(std)}</td>
                          <td className="text-right px-2 py-1.5 font-mono">{fmtFixed(ir)}</td>
                          <td className="text-right px-2 py-1.5 text-muted-foreground">{interp}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* IC over time chart */}
            {icChartData.length > 1 && (
              <div className="border border-border rounded bg-card/40">
                <div className="px-3 py-2 border-b border-border font-semibold text-sm">IC over time (per rebalance date)</div>
                <div className="h-56 px-2 py-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={icChartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                      <YAxis tick={{ fontSize: 10 }} domain={[-1, 1]} />
                      <Tooltip contentStyle={{ background: "rgba(15,15,15,0.95)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }} formatter={(v: unknown) => v == null ? "—" : Number(v).toFixed(3)} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {HORIZON_LABELS.map((label, idx) => (
                        <Line key={label} type="monotone" dataKey={label} stroke={HORIZON_COLORS[idx]} dot={false} strokeWidth={1.4} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {renderBucketTable("Quintile Buckets (Q1 = cheapest PEG = lowest mult/grw)", quintileRows, quintileMap, downloadQuintile)}

            {/* Long-short spread */}
            <div className="border border-border rounded bg-card/40">
              <div className="px-3 py-2 border-b border-border font-semibold text-sm">Long-Short Spread (Q1 − Q5 per date, then averaged)</div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead><tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-2 py-1.5 font-medium">Horizon</th>
                    <th className="text-right px-2 py-1.5 font-medium">N dates</th>
                    <th className="text-right px-2 py-1.5 font-medium">Mean</th>
                    <th className="text-right px-2 py-1.5 font-medium">Median</th>
                    <th className="text-right px-2 py-1.5 font-medium">Stdev</th>
                    <th className="text-right px-2 py-1.5 font-medium">Dates ≥{thresholdPct}%</th>
                  </tr></thead>
                  <tbody>
                    {result.quintile.longShort.map(row => (
                      <tr key={row.horizon} className="border-b border-border/50">
                        <td className="px-2 py-1.5 font-mono">{row.horizon}</td>
                        <td className="text-right px-2 py-1.5 text-muted-foreground">{fmtInt(row.n)}</td>
                        <td className="text-right px-2 py-1.5 font-mono" style={{ background: heatColor(row.meanReturn, 0.02) }}>{fmtPct(row.meanReturn)}</td>
                        <td className="text-right px-2 py-1.5 font-mono">{fmtPct(row.medianReturn)}</td>
                        <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">{fmtPct(row.stdReturn)}</td>
                        <td className="text-right px-2 py-1.5 font-mono">{fmtPct(row.hitRate, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Equity curve */}
            {equityData.length > 1 && (
              <div className="border border-border rounded bg-card/40">
                <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                  <div className="font-semibold text-sm">Compounded 1M Returns — Q1 (cheap PEG long), Q5 (expensive short), L−S</div>
                  <Button size="sm" variant="ghost" onClick={downloadEquity} className="h-7 text-xs"><Download className="w-3 h-3 mr-1" /> CSV</Button>
                </div>
                <div className="h-64 px-2 py-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "rgba(15,15,15,0.95)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }} formatter={(v: unknown) => v == null ? "—" : Number(v).toFixed(3)} />
                      <ReferenceLine y={1} stroke="rgba(255,255,255,0.2)" />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="q1" stroke="#22c55e" dot={false} strokeWidth={1.5} name="Q1 (cheap PEG)" />
                      <Line type="monotone" dataKey="q5" stroke="#ef4444" dot={false} strokeWidth={1.5} name="Q5 (expensive)" />
                      <Line type="monotone" dataKey="ls" stroke="#0ea5e9" dot={false} strokeWidth={1.8} name="L−S spread" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {renderBucketTable("Quadrant Buckets (BR = LowMult + HighGrowth — your target)", quadRows, quadMap, downloadQuadrant)}

            {/* BR vs Rest */}
            <div className="border border-border rounded bg-card/40">
              <div className="px-3 py-2 border-b border-border font-semibold text-sm">BR Quadrant vs Rest (BR mean − mean of BL/TR/TL)</div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead><tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-2 py-1.5 font-medium">Horizon</th>
                    <th className="text-right px-2 py-1.5 font-medium">N (BR)</th>
                    <th className="text-right px-2 py-1.5 font-medium">Mean diff</th>
                    <th className="text-right px-2 py-1.5 font-medium">Median diff</th>
                    <th className="text-right px-2 py-1.5 font-medium">BR hit ≥{thresholdPct}%</th>
                  </tr></thead>
                  <tbody>
                    {result.quadrant.brMinusRest.map(row => (
                      <tr key={row.horizon} className="border-b border-border/50">
                        <td className="px-2 py-1.5 font-mono">{row.horizon}</td>
                        <td className="text-right px-2 py-1.5 text-muted-foreground">{fmtInt(row.n)}</td>
                        <td className="text-right px-2 py-1.5 font-mono" style={{ background: heatColor(row.meanReturn, 0.02) }}>{fmtPct(row.meanReturn)}</td>
                        <td className="text-right px-2 py-1.5 font-mono">{fmtPct(row.medianReturn)}</td>
                        <td className="text-right px-2 py-1.5 font-mono">{fmtPct(row.hitRate, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
