// Reconstructed from recovered-bundle/Scanner-d2v1M_Z9.js on 2026-06-11
import { useState, useRef, useMemo } from "react";
import { useBaskets } from "@/lib/basketsContext";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkbookTickers } from "@/lib/queryClient";
import { fetchOhlcSeries } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { X, Loader2, Database, SortDesc, SortAsc, BarChart2, Zap } from "lucide-react";
import { Play } from "@/lib/icons";
import {
  analyzeSingleTicker,
  analyzePairSignals,
} from "@/lib/pairSignalAnalyzer";

// ── Types ─────────────────────────────────────────────────────────────────────

type UniverseMode = "workbook" | "basket" | "classification";
type ScanMode = "singles" | "pairs";

interface SingleResult {
  ticker: string;
  classification: string;
  currentPrice: number;
  bestSignal: string | null;
  bestSignalValue: number | null;
  bestBucketLabel: string;
  direction: "long" | "short" | "neutral" | null;
  quality: number;
  expectedMove20dPct: number | null;
  expectedPrice20d: number | null;
  hit20d: number | null;
  n: number;
  halfLifeDays: number | null;
}

interface PairResult {
  tickerA: string;
  tickerB: string;
  classA: string;
  classB: string;
  ratio: number;
  bestSignal: string | null;
  bestSignalValue: number | null;
  bestBucketLabel: string;
  direction: "long" | "short" | "neutral" | null;
  quality: number;
  expectedMove20dPct: number | null;
  expectedRatio20d: number | null;
  expectedAIfBFlat: number | null;
  expectedBIfAFlat: number | null;
  hit20d: number | null;
  n: number;
}

// ── Rolling Z-score (60-bar) ──────────────────────────────────────────────────
const Z_WINDOW = 60;

function rollingZScore(values: number[], window: number): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  for (let i = window - 1; i < values.length; i++) {
    let sum = 0, sum2 = 0, cnt = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const v = values[j];
      if (v == null || !isFinite(v)) { cnt = 0; break; }
      sum += v; sum2 += v * v; cnt++;
    }
    if (cnt !== window) continue;
    const mean = sum / window;
    const variance = Math.max(0, sum2 / window - mean * mean);
    const std = Math.sqrt(variance);
    const cur = values[i];
    out[i] = std === 0 ? 0 : (cur - mean) / std;
  }
  return out;
}

function rollingMean(values: number[], window: number): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

function computeRSI(values: number[], period = 14): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  if (values.length < period + 1) return out;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function computePercentile(values: number[]): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  const sorted: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; sorted[mid] <= values[i] ? lo = mid + 1 : hi = mid; }
    sorted.splice(lo, 0, values[i]);
    out[i] = (lo + 1) / sorted.length * 100;
  }
  return out;
}

function computeHalfLife(values: (number | null)[]): number | null {
  const finite = values.filter((v): v is number => v != null && isFinite(v));
  if (finite.length < 60) return null;
  const x = finite.slice(0, -1), y = finite.slice(1);
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) ** 2; }
  const beta = den === 0 ? 0 : num / den;
  if (beta <= 0 || beta >= 1) return null;
  return -Math.log(2) / Math.log(beta);
}

// ── Signal bucket bins ────────────────────────────────────────────────────────

const ZSCORE_BINS: [number, number, string][] = [
  [-Infinity, -2.5, "z ≤ −2.5"],
  [-2.5, -2, "−2.5 < z ≤ −2.0"],
  [-2, -1.5, "−2.0 < z ≤ −1.5"],
  [-1.5, -1, "−1.5 < z ≤ −1.0"],
  [-1, -0.5, "−1.0 < z ≤ −0.5"],
  [-0.5, 0.5, "−0.5 < z ≤ +0.5"],
  [0.5, 1, "+0.5 < z ≤ +1.0"],
  [1, 1.5, "+1.0 < z ≤ +1.5"],
  [1.5, 2, "+1.5 < z ≤ +2.0"],
  [2, 2.5, "+2.0 < z ≤ +2.5"],
  [2.5, Infinity, "z > +2.5"],
];
const DIST200_BINS: [number, number, string][] = [
  [-Infinity, -30, "≤ −30%"],[-30,-20,"−30% to −20%"],[-20,-10,"−20% to −10%"],[-10,-5,"−10% to −5%"],
  [-5,0,"−5% to 0%"],[0,5,"0% to +5%"],[5,10,"+5% to +10%"],[10,20,"+10% to +20%"],[20,30,"+20% to +30%"],[30,Infinity,"≥ +30%"],
];
const RSI_BINS: [number, number, string][] = [
  [0,20,"0–20 (extreme oversold)"],[20,30,"20–30 (oversold)"],[30,40,"30–40 (weak)"],[40,50,"40–50 (mild weak)"],
  [50,60,"50–60 (mild strong)"],[60,70,"60–70 (strong)"],[70,80,"70–80 (overbought)"],[80,100.0001,"80–100 (extreme overbought)"],
];
const PCT_BINS: [number, number, string][] = [
  [0,5,"0–5 pct"],[5,10,"5–10 pct"],[10,25,"10–25 pct"],[25,40,"25–40 pct"],[40,60,"40–60 pct"],
  [60,75,"60–75 pct"],[75,90,"75–90 pct"],[90,95,"90–95 pct"],[95,100.0001,"95–100 pct"],
];
const HORIZON_DAYS = [5, 10, 20, 60];
const SIGNAL_TYPES = ["price_z", "dist_200ma", "rsi14", "pct"] as const;
type SignalType = (typeof SIGNAL_TYPES)[number];

interface BucketRow {
  signal: SignalType; label: string; low: number; high: number; n: number;
  avg_5d: number | null; hit_5d: number | null;
  avg_10d: number | null; hit_10d: number | null;
  avg_20d: number | null; hit_20d: number | null;
  avg_60d: number | null; hit_60d: number | null;
  quality: number;
  priceLevelLow: number | null; priceLevelHigh: number | null;
}

interface SingleSignalResult {
  ticker: string;
  firstDate: string; lastDate: string; n: number;
  currentPrice: number;
  currentSignals: Array<{ signal: SignalType; value: number | null }>;
  buckets: Record<SignalType, BucketRow[]>;
  bestNow: {
    signal: SignalType; bucket: BucketRow; currentSignalValue: number;
    direction: "long" | "short" | "neutral";
    expectedMove20dPct: number; expectedPrice20d: number;
    rationale: string;
  } | null;
  halfLifeDays: number | null;
}

function computeBuckets(signal: SignalType, signalValues: (number | null)[], closePrices: number[], bins: [number, number, string][]): BucketRow[] {
  const n = closePrices.length;
  const rows: BucketRow[] = [];
  for (const [low, high, label] of bins) {
    const idxs: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = signalValues[i];
      if (v != null && v >= low && v < high) idxs.push(i);
    }
    const midVal = low === -Infinity ? high - 5 : high === Infinity ? low + 5 : (low + high) / 2;
    const isLong: boolean = signal === "rsi14" || signal === "pct" ? midVal > 50 : midVal > 0;
    const row: BucketRow = { signal, label, low, high, n: idxs.length, avg_5d: null, hit_5d: null, avg_10d: null, hit_10d: null, avg_20d: null, hit_20d: null, avg_60d: null, hit_60d: null, quality: 0, priceLevelLow: null, priceLevelHigh: null };
    for (const days of HORIZON_DAYS) {
      const rets: number[] = [];
      for (const idx of idxs) {
        if (idx + days >= n || closePrices[idx] <= 0) continue;
        rets.push((closePrices[idx + days] - closePrices[idx]) / closePrices[idx] * 100);
      }
      if (!rets.length) continue;
      const avg = rets.reduce((s, v) => s + v, 0) / rets.length;
      const hitRate = rets.filter(v => (v < 0) === isLong ? false : true).length / rets.length * 100;
      (row as any)[`avg_${days}d`] = avg;
      (row as any)[`hit_${days}d`] = hitRate;
    }
    if (row.avg_20d != null && row.hit_20d != null && row.n >= 20) {
      row.quality = Math.abs(row.avg_20d) * (row.hit_20d - 50) * Math.log10(row.n + 1) / 100;
    }
    rows.push(row);
  }
  return rows;
}

function analyzeTicker(prices: Array<{ time: string; value: number }>, ticker: string): SingleSignalResult | null {
  const clean = prices.filter(p => p.value > 0 && isFinite(p.value));
  if (clean.length < 250) return null;
  const vals = clean.map(p => p.value);
  const logVals = vals.map(v => Math.log(v));
  const dates = clean.map(p => p.time);
  const n = vals.length;
  const lastIdx = n - 1;
  const zScores = rollingZScore(logVals, Z_WINDOW);
  const ma200 = rollingMean(vals, 200);
  const dist200 = vals.map((v, i) => ma200[i] != null && ma200[i]! > 0 ? (v - ma200[i]!) / ma200[i]! * 100 : null);
  const rsi = computeRSI(vals, 14);
  const pct = computePercentile(vals);

  const priceZBuckets = computeBuckets("price_z", zScores, vals, ZSCORE_BINS);
  const dist200Buckets = computeBuckets("dist_200ma", dist200, vals, DIST200_BINS);
  const rsiBuckets = computeBuckets("rsi14", rsi, vals, RSI_BINS);
  const pctBuckets = computeBuckets("pct", pct, vals, PCT_BINS);

  // Compute price level ranges for z-score buckets
  const curZ = zScores[lastIdx];
  if (curZ != null) {
    const logSlice = logVals.slice(lastIdx - Z_WINDOW + 1, lastIdx + 1);
    const mu = logSlice.reduce((s, v) => s + v, 0) / Z_WINDOW;
    const sigma = Math.sqrt(logSlice.reduce((s, v) => s + (v - mu) ** 2, 0) / Z_WINDOW);
    for (const b of priceZBuckets) {
      const lo = b.low === -Infinity ? -3.5 : b.low;
      const hi = b.high === Infinity ? 3.5 : b.high;
      b.priceLevelLow = Math.exp(mu + lo * sigma);
      b.priceLevelHigh = Math.exp(mu + hi * sigma);
    }
  }
  // Dist 200MA price levels
  const curDist = dist200[lastIdx], curMa200 = ma200[lastIdx];
  if (curDist != null && curMa200 != null) {
    for (const b of dist200Buckets) {
      const lo = b.low === -Infinity ? -50 : b.low;
      const hi = b.high === Infinity ? 60 : b.high;
      b.priceLevelLow = curMa200 * (1 + lo / 100);
      b.priceLevelHigh = curMa200 * (1 + hi / 100);
    }
  }
  // Percentile price levels
  const sortedVals = [...vals].sort((a, b) => a - b);
  const interpPct = (p: number) => {
    if (p <= 0) return sortedVals[0];
    if (p >= 100) return sortedVals[sortedVals.length - 1];
    const fi = p / 100 * (sortedVals.length - 1);
    const lo = Math.floor(fi), hi = Math.ceil(fi);
    if (lo === hi) return sortedVals[lo];
    return sortedVals[lo] * (1 - (fi - lo)) + sortedVals[hi] * (fi - lo);
  };
  for (const b of pctBuckets) { b.priceLevelLow = interpPct(b.low); b.priceLevelHigh = interpPct(Math.min(b.high, 100)); }

  const currentSignals: Array<{ signal: SignalType; value: number | null }> = [
    { signal: "price_z", value: zScores[lastIdx] },
    { signal: "dist_200ma", value: dist200[lastIdx] },
    { signal: "rsi14", value: rsi[lastIdx] },
    { signal: "pct", value: pct[lastIdx] },
  ];

  const buckets = { price_z: priceZBuckets, dist_200ma: dist200Buckets, rsi14: rsiBuckets, pct: pctBuckets };

  // Find best signal
  let bestNow: SingleSignalResult["bestNow"] = null;
  let bestQ = -Infinity;
  const signalLabels: Record<SignalType, string> = { price_z: "Price z", dist_200ma: "% from 200MA", rsi14: "RSI(14)", pct: "Percentile" };
  const formatVal = (s: SignalType, v: number) => s === "rsi14" ? v.toFixed(1) : s === "pct" ? v.toFixed(0) : s === "dist_200ma" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
  const revertDir = (s: SignalType) => s === "rsi14" ? " toward 50" : s === "pct" ? " toward median" : " toward zero";
  for (const sig of currentSignals) {
    if (sig.value == null) continue;
    const allBuckets = buckets[sig.signal];
    const b = allBuckets.find(r => sig.value! >= r.low && sig.value! < r.high);
    if (!b || b.n < 20 || b.avg_20d == null) continue;
    if (Math.abs(b.quality) > bestQ) {
      bestQ = Math.abs(b.quality);
      const expectedMove = b.avg_20d;
      const expectedPrice = vals[lastIdx] * (1 + expectedMove / 100);
      const dir: "long" | "short" | "neutral" = expectedMove > 0.3 ? "long" : expectedMove < -0.3 ? "short" : "neutral";
      const hr = b.hit_20d ?? 50;
      const edgeLabel = hr >= 55 ? "actionable edge" : hr >= 50 ? "marginal edge" : "NO edge (coin-flip or worse — do not trade)";
      bestNow = {
        signal: sig.signal, bucket: b, currentSignalValue: sig.value,
        direction: dir,
        expectedMove20dPct: expectedMove,
        expectedPrice20d: expectedPrice,
        rationale: `${signalLabels[sig.signal]} = ${formatVal(sig.signal, sig.value)} sits in the "${b.label}" bucket. Historically, ${ticker} moved ${expectedMove >= 0 ? "+" : ""}${expectedMove.toFixed(2)}% on average over the next 20 trading days (n=${b.n}, hit ${hr.toFixed(0)}% reverting${revertDir(sig.signal)}). ${edgeLabel}.`,
      };
    }
  }

  return {
    ticker, firstDate: dates[0], lastDate: dates[lastIdx], n, currentPrice: vals[lastIdx],
    currentSignals, buckets, bestNow, halfLifeDays: computeHalfLife(zScores),
  };
}

// ── Format helpers ────────────────────────────────────────────────────────────

const fmtAvg = (v: number | null | undefined) => v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const fmtHit = (v: number | null | undefined) => v == null || !isFinite(v) ? "—" : `${v.toFixed(0)}%`;
const fmtPrice = (v: number | null | undefined) => v == null || !isFinite(v) ? "—" : `$${v.toFixed(2)}`;
const colorAvg = (v: number | null | undefined) => v == null ? "text-muted-foreground" : v > 0.5 ? "text-emerald-400" : v < -0.5 ? "text-rose-400" : "text-muted-foreground";
const colorHit = (v: number | null | undefined) => v == null ? "text-muted-foreground" : v >= 65 ? "text-emerald-400 font-semibold" : v >= 55 ? "text-emerald-400/70" : v <= 35 ? "text-rose-400 font-semibold" : v <= 45 ? "text-rose-400/70" : "text-muted-foreground";

// ── StatCard ──────────────────────────────────────────────────────────────────

function MiniStat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-card/30 border border-border/30 rounded px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-[12px] font-mono font-semibold ${valueClass ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

// ── Avg/Hit cell pair ─────────────────────────────────────────────────────────

function AvgHitCells({ avg, hit }: { avg: number | null; hit: number | null }) {
  return (
    <>
      <td className={`px-2 py-1 text-right ${colorAvg(avg)}`}>{fmtAvg(avg)}</td>
      <td className={`px-2 py-1 text-right ${colorHit(hit)}`}>{fmtHit(hit)}</td>
    </>
  );
}

// ── SingleSignalAnalyzer ──────────────────────────────────────────────────────

const HORIZON_LABELS = [{ key: "5d", label: "5d" }, { key: "10d", label: "10d" }, { key: "20d", label: "20d" }, { key: "60d", label: "60d" }];

interface SingleSignalAnalyzerProps {
  ticker: string;
  initialPrices?: Array<{ time: string; value: number }>;
  asFloating?: boolean;
  onClose?: () => void;
}

function SingleSignalAnalyzer({ ticker, initialPrices, asFloating = false, onClose }: SingleSignalAnalyzerProps) {
  const [activeSignal, setActiveSignal] = useState<SignalType>("price_z");
  const [prices, setPrices] = useState<Array<{ time: string; value: number }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useState(() => {
    let cancelled = false;
    if (initialPrices && initialPrices.length >= 250) { setPrices(initialPrices); return; }
    setLoading(true); setErr(null);
    fetchOhlcSeries(ticker).then(data => {
      if (cancelled) return;
      const pts = data.dates.map((d: string, i: number) => ({ time: d, value: data.closes[i] })).filter((p: { time: string; value: number }) => p.value > 0 && isFinite(p.value));
      setPrices(pts); setLoading(false);
    }).catch((e: Error) => { if (!cancelled) { setErr(String(e?.message ?? e)); setLoading(false); } });
    return () => { cancelled = true; };
  });

  const result = useMemo(() => {
    if (!prices || prices.length < 250) return null;
    try { return analyzeTicker(prices, ticker); } catch (e) { console.warn("[SingleSignalAnalyzer]", e); return null; }
  }, [prices, ticker]);

  const panelClass = asFloating
    ? "fixed top-16 right-4 z-40 w-[640px] max-w-[95vw] max-h-[80vh] flex flex-col bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
    : "w-full h-full flex flex-col border border-border/30 min-h-0 overflow-hidden";

  return (
    <div className={panelClass}>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-card/80 border-b border-border/40 flex-shrink-0">
        <Zap className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Predictive Signals — {ticker}</span>
        <div className="flex-1" />
        {asFloating && onClose && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose} title="Close">
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3 text-xs">
        {loading && <div className="flex items-center justify-center py-8 text-muted-foreground text-xs"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading {ticker} price history…</div>}
        {err && <div className="text-rose-400 text-xs px-2 py-3 border border-rose-500/30 bg-rose-500/5 rounded">{err}</div>}
        {!loading && !err && !result && <div className="text-muted-foreground text-xs px-2 py-3">Need at least 250 trading days of price history for {ticker}.</div>}
        {result && (
          <SignalAnalysisPanel result={result} activeSignal={activeSignal} setActiveSignal={setActiveSignal} />
        )}
      </div>
    </div>
  );
}

function SignalAnalysisPanel({ result, activeSignal, setActiveSignal }: { result: SingleSignalResult; activeSignal: SignalType; setActiveSignal: (s: SignalType) => void }) {
  const best = result.bestNow;
  const buckets = result.buckets[activeSignal];
  const curVal = result.currentSignals.find(s => s.signal === activeSignal)?.value;
  const activeBucketIdx = buckets.findIndex(b => curVal != null && curVal >= b.low && curVal < b.high);
  const signalLabels: Record<SignalType, string> = { price_z: "Price z", dist_200ma: "% from 200MA", rsi14: "RSI(14)", pct: "Percentile" };
  const formatVal = (s: SignalType, v: number) => s === "rsi14" ? v.toFixed(1) : s === "pct" ? v.toFixed(0) : s === "dist_200ma" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <MiniStat label="Ticker" value={result.ticker} />
        <MiniStat label="Price" value={`$${result.currentPrice.toFixed(2)}`} />
        <MiniStat label="Half-life" value={result.halfLifeDays ? `${result.halfLifeDays.toFixed(1)}d` : "—"} />
        <MiniStat label="Sample" value={`${result.n.toLocaleString()}d`} />
      </div>
      {best ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-amber-300">
            <Zap className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Best signal right now</span>
            <span className="text-[10px] text-muted-foreground ml-auto">quality {best.bucket.quality.toFixed(2)} · n={best.bucket.n}</span>
          </div>
          <div className="text-[12px] text-foreground/90 leading-snug">{best.bucket.label} on <span className="font-semibold">{signalLabels[best.signal]}</span> ({formatVal(best.signal, best.currentSignalValue)})</div>
          <div className="text-[11px] text-muted-foreground leading-snug">{best.rationale}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1 pt-2 border-t border-amber-500/20">
            <MiniStat label="20d expected" value={`${best.expectedMove20dPct >= 0 ? "+" : ""}${best.expectedMove20dPct.toFixed(2)}%`} valueClass={best.expectedMove20dPct < 0 ? "text-rose-400" : "text-emerald-400"} />
            <MiniStat label={`${result.ticker} target`} value={`$${best.expectedPrice20d.toFixed(2)}`} valueClass={best.expectedMove20dPct < 0 ? "text-rose-400" : "text-emerald-400"} />
            <MiniStat label="Current price" value={`$${result.currentPrice.toFixed(2)}`} />
          </div>
          <div className="text-[10px] text-muted-foreground/80 pt-1 border-t border-amber-500/10">
            {best.direction === "short" ? `Setup: SHORT ${result.ticker} — price expected to fall toward $${best.expectedPrice20d.toFixed(2)}`
              : best.direction === "long" ? `Setup: LONG ${result.ticker} — price expected to rise toward $${best.expectedPrice20d.toFixed(2)}`
              : "No actionable bias — bucket is statistically flat."}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-border/40 bg-card/30 p-3 text-[11px] text-muted-foreground">
          All four current signals sit in low-edge / neutral buckets. Wait for a stronger setup.
        </div>
      )}
      {/* Signal tabs */}
      <div className="flex items-center gap-1 flex-wrap pt-1">
        {SIGNAL_TYPES.map(s => {
          const v = result.currentSignals.find(sg => sg.signal === s)?.value;
          return (
            <button key={s} onClick={() => setActiveSignal(s)} data-testid={`btn-single-signal-${s}`}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${activeSignal === s ? "bg-primary text-primary-foreground border-primary" : "bg-card/30 text-muted-foreground border-border/40 hover:border-border"}`}>
              {signalLabels[s]}{v != null && <span className="ml-1.5 opacity-80">({formatVal(s, v)})</span>}
            </button>
          );
        })}
      </div>
      {/* Bucket table */}
      <div className="overflow-x-auto border border-border/30 rounded">
        <table className="w-full text-[10px] font-mono">
          <thead className="bg-card/40 text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-1.5">Bucket</th>
              <th className="text-right px-2 py-1.5">n</th>
              {HORIZON_LABELS.map(h => <th key={h.key} className="text-right px-2 py-1.5" colSpan={2}>{h.label} avg / hit</th>)}
              <th className="text-right px-2 py-1.5">Price range</th>
              <th className="text-right px-2 py-1.5" title="Quality = |20d avg| × (20d hit% − 50) × log10(n+1)/100">Q</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b, i) => {
              const isActive = i === activeBucketIdx;
              return (
                <tr key={b.label} className={`border-t border-border/20 ${isActive ? "bg-amber-500/10" : ""}`} data-testid={`single-signal-bucket-${activeSignal}-${i}`}>
                  <td className="px-2 py-1 text-foreground/90">{isActive && <span className="text-amber-400 mr-1">▶</span>}{b.label}</td>
                  <td className={`px-2 py-1 text-right ${b.n < 20 ? "text-muted-foreground/50" : "text-foreground/80"}`}>{b.n}</td>
                  {HORIZON_LABELS.map(h => <AvgHitCells key={h.key} avg={(b as any)[`avg_${h.key}`]} hit={(b as any)[`hit_${h.key}`]} />)}
                  <td className="px-2 py-1 text-right text-foreground/70">{fmtPrice(b.priceLevelLow)} – {fmtPrice(b.priceLevelHigh)}</td>
                  <td className={`px-2 py-1 text-right ${b.quality >= 1.5 ? "text-emerald-400 font-semibold" : b.quality >= 0.5 ? "text-emerald-400/70" : b.quality <= -0.5 ? "text-rose-400/70" : "text-muted-foreground"}`}>{b.quality.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Classification labels ─────────────────────────────────────────────────────

const CLASS_LABELS: Record<string, string> = {
  economy: "Economy", sector: "Sector", subsector: "Subsector",
  industryGroup: "Industry Group", industry: "Industry", subindustry: "Subindustry",
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Scanner() {
  const { baskets } = useBaskets();
  const { data: allTickers } = useQuery({ queryKey: ["tickers"], queryFn: fetchWorkbookTickers, staleTime: Infinity });

  const [universeMode, setUniverseMode] = useState<UniverseMode>("workbook");
  const [selectedBasket, setSelectedBasket] = useState("");
  const [classField, setClassField] = useState("industry");
  const [classValue, setClassValue] = useState("");
  const [scanMode, setScanMode] = useState<ScanMode>("singles");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, currentTask: "" });
  const [singleResults, setSingleResults] = useState<SingleResult[]>([]);
  const [pairResults, setPairResults] = useState<PairResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<{ tickerA: string; tickerB: string } | null>(null);
  const [singleSort, setSingleSort] = useState<{ key: string; dir: -1 | 1 }>({ key: "quality", dir: -1 });
  const [pairSort, setPairSort] = useState<{ key: string; dir: -1 | 1 }>({ key: "quality", dir: -1 });
  const [minN, setMinN] = useState(20);
  const [filterQuery, setFilterQuery] = useState("");
  const [hideSmall, setHideSmall] = useState(false);

  // Classification options
  const classOptions = useMemo(() => {
    if (!allTickers) return [];
    const vals = new Set<string>();
    allTickers.forEach((t: any) => { const v = t[classField]; if (v) vals.add(v); });
    return Array.from(vals).sort();
  }, [allTickers, classField]);

  // Active universe
  const activeTickers = useMemo<string[]>(() => {
    if (!allTickers) return [];
    if (universeMode === "basket") {
      const b = baskets.find(b => b.id === selectedBasket);
      return b ? b.tickers : [];
    }
    if (universeMode === "classification") {
      return classValue ? allTickers.filter((t: any) => t[classField] === classValue).map((t: any) => t.ticker) : [];
    }
    return allTickers.map((t: any) => t.ticker);
  }, [allTickers, universeMode, selectedBasket, baskets, classField, classValue]);

  const pairCount = scanMode === "singles" ? activeTickers.length : Math.max(0, activeTickers.length * (activeTickers.length - 1) / 2);

  const classMap = useMemo(() => {
    const m = new Map<string, string>();
    if (allTickers) for (const t of allTickers as any[]) m.set(t.ticker, t[classField] ?? "—");
    return m;
  }, [allTickers, classField]);

  async function runScan() {
    if (activeTickers.length === 0) { setError("Universe is empty — pick a basket / classification with tickers."); return; }
    if (activeTickers.length < 2 && scanMode === "pairs") { setError("Need at least 2 tickers in the universe to scan pairs."); return; }
    cancelRef.current = false;
    setScanning(true); setError(null); setSingleResults([]); setPairResults([]);
    setProgress({ done: 0, total: 0, currentTask: "Loading prices…" });
    const CONCURRENCY = 8;
    const priceMap = new Map<string, Array<{ time: string; value: number }>>();
    let idx = 0;
    setProgress({ done: 0, total: activeTickers.length, currentTask: "Loading prices…" });
    async function loadWorker() {
      while (idx < activeTickers.length) {
        if (cancelRef.current) return;
        const i = idx++, ticker = activeTickers[i];
        try {
          const data = await fetchOhlcSeries(ticker);
          const pts = data.dates.map((d: string, j: number) => ({ time: d, value: data.closes[j] })).filter((p: any) => p.value > 0 && isFinite(p.value));
          if (pts.length >= 250) priceMap.set(ticker, pts);
        } catch (e) { console.warn(`[Scanner] fetch failed for ${ticker}:`, e); }
        setProgress(prev => ({ ...prev, done: prev.done + 1, currentTask: `Loading prices (${i + 1}/${activeTickers.length}): ${ticker}` }));
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => loadWorker()));
    if (cancelRef.current) { setScanning(false); return; }
    if (scanMode === "singles") {
      const results: SingleResult[] = [];
      const loaded = Array.from(priceMap.keys());
      setProgress({ done: 0, total: loaded.length, currentTask: "Analyzing tickers…" });
      for (let i = 0; i < loaded.length && !cancelRef.current; i++) {
        const ticker = loaded[i], prices = priceMap.get(ticker)!;
        const analysis = analyzeTicker(prices, ticker);
        if (analysis) {
          const best = analysis.bestNow;
          results.push({ ticker, classification: classMap.get(ticker) ?? "—", currentPrice: analysis.currentPrice, bestSignal: best?.signal ?? null, bestSignalValue: best?.currentSignalValue ?? null, bestBucketLabel: best?.bucket.label ?? "—", direction: best?.direction ?? null, quality: best?.bucket.quality ?? 0, expectedMove20dPct: best?.expectedMove20dPct ?? null, expectedPrice20d: best?.expectedPrice20d ?? null, hit20d: best?.bucket.hit_20d ?? null, n: best?.bucket.n ?? 0, halfLifeDays: analysis.halfLifeDays });
          if (!best) results[results.length - 1].bestBucketLabel = "current buckets too small (n<20)";
        } else {
          const prices2 = priceMap.get(ticker);
          results.push({ ticker, classification: classMap.get(ticker) ?? "—", currentPrice: prices2 ? prices2[prices2.length - 1].value : 0, bestSignal: null, bestSignalValue: null, bestBucketLabel: "insufficient history (<250 bars)", direction: null, quality: 0, expectedMove20dPct: null, expectedPrice20d: null, hit20d: null, n: 0, halfLifeDays: null });
        }
        if (i % 5 === 0) { setProgress({ done: i + 1, total: loaded.length, currentTask: `Analyzing ${ticker}` }); await new Promise(r => setTimeout(r, 0)); }
      }
      setSingleResults(results);
    } else {
      const tickers = Array.from(priceMap.keys());
      const totalPairs = tickers.length * (tickers.length - 1) / 2;
      const results: PairResult[] = [];
      setProgress({ done: 0, total: totalPairs, currentTask: "Analyzing pairs…" });
      let pairDone = 0;
      for (let a = 0; a < tickers.length && !cancelRef.current; a++) {
        for (let b = a + 1; b < tickers.length && !cancelRef.current; b++) {
          const tA = tickers[a], tB = tickers[b];
          const pA = priceMap.get(tA)!, pB = priceMap.get(tB)!;
          const pairAnalysis = analyzePairSignals(pA, pB, tA, tB);
          if (pairAnalysis) {
            const best = pairAnalysis.bestNow;
            results.push({ tickerA: tA, tickerB: tB, classA: classMap.get(tA) ?? "—", classB: classMap.get(tB) ?? "—", ratio: pairAnalysis.currentRatio, bestSignal: best?.signal ?? null, bestSignalValue: best?.currentSignalValue ?? null, bestBucketLabel: best?.bucket.label ?? "current buckets too small (n<20)", direction: best?.direction ?? null, quality: best?.bucket.quality ?? 0, expectedMove20dPct: best?.expectedMove20dPct ?? null, expectedRatio20d: best?.expectedRatio20d ?? null, expectedAIfBFlat: best?.expectedAPrice20dIfBHolds ?? null, expectedBIfAFlat: best?.expectedBPrice20dIfAHolds ?? null, hit20d: best?.bucket.hit_20d ?? null, n: best?.bucket.n ?? 0 });
          } else {
            results.push({ tickerA: tA, tickerB: tB, classA: classMap.get(tA) ?? "—", classB: classMap.get(tB) ?? "—", ratio: NaN, bestSignal: null, bestSignalValue: null, bestBucketLabel: "insufficient overlap (<250 bars)", direction: null, quality: 0, expectedMove20dPct: null, expectedRatio20d: null, expectedAIfBFlat: null, expectedBIfAFlat: null, hit20d: null, n: 0 });
          }
          pairDone++;
          if (pairDone % 50 === 0) { setProgress({ done: pairDone, total: totalPairs, currentTask: `${tA}/${tB} (${pairDone}/${totalPairs})` }); await new Promise(r => setTimeout(r, 0)); }
        }
      }
      setPairResults(results);
    }
    setScanning(false); setProgress(prev => ({ ...prev, currentTask: "Done." }));
  }

  function cancelScan() { cancelRef.current = true; }

  // Sorted results
  const sortedSingles = useMemo(() => {
    let rows = singleResults.filter(r => hideSmall ? r.bestSignal != null && r.n >= minN : (r.bestSignal == null || r.n >= minN));
    if (filterQuery) { const q = filterQuery.toUpperCase(); rows = rows.filter(r => r.ticker.includes(q) || r.classification.toUpperCase().includes(q)); }
    const d = singleSort.dir;
    return rows.sort((a, b) => {
      const va = (a as any)[singleSort.key], vb = (b as any)[singleSort.key];
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return typeof va === "string" ? d * va.localeCompare(vb) : d * (va - vb);
    });
  }, [singleResults, singleSort, minN, filterQuery, hideSmall]);

  const sortedPairs = useMemo(() => {
    let rows = pairResults.filter(r => hideSmall ? r.bestSignal != null && r.n >= minN : (r.bestSignal == null || r.n >= minN));
    if (filterQuery) { const q = filterQuery.toUpperCase(); rows = rows.filter(r => r.tickerA.includes(q) || r.tickerB.includes(q) || r.classA.toUpperCase().includes(q) || r.classB.toUpperCase().includes(q)); }
    const d = pairSort.dir;
    return rows.sort((a, b) => {
      const va = (a as any)[pairSort.key], vb = (b as any)[pairSort.key];
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return typeof va === "string" ? d * va.localeCompare(vb) : d * (va - vb);
    });
  }, [pairResults, pairSort, minN, filterQuery, hideSmall]);

  function sortSingles(key: string) { setSingleSort(prev => ({ key, dir: prev.key === key ? (-prev.dir as -1 | 1) : -1 })); }
  function sortPairs(key: string) { setPairSort(prev => ({ key, dir: prev.key === key ? (-prev.dir as -1 | 1) : -1 })); }

  function SortHeader({ k, label, sort, onSort }: { k: string; label: string; sort: { key: string; dir: -1 | 1 }; onSort: (k: string) => void }) {
    return (
      <th onClick={() => onSort(k)} className="px-2 py-1.5 cursor-pointer hover:bg-muted/40 select-none text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          {label}
          {sort.key === k ? (sort.dir === 1 ? <SortAsc className="w-2.5 h-2.5" /> : <SortDesc className="w-2.5 h-2.5" />) : <BarChart2 className="w-2.5 h-2.5 opacity-20" />}
        </div>
      </th>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header controls */}
      <div className="flex flex-col gap-2 p-3 border-b border-border bg-card/30 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold">Signal Scanner</span>
          <span className="text-[10px] text-muted-foreground">Ranks the workbook by predictive-signal quality. Pairs and singles, mean-reversion edge.</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Singles / Pairs tabs */}
          <Tabs value={scanMode} onValueChange={v => { if (!scanning) setScanMode(v as ScanMode); }} className="inline-flex">
            <TabsList className="h-7">
              <TabsTrigger value="singles" disabled={scanning} className="text-[11px] px-3">Singles</TabsTrigger>
              <TabsTrigger value="pairs" disabled={scanning} className="text-[11px] px-3">Pairs</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="h-5 w-px bg-border mx-1" />
          <Database className="w-3.5 h-3.5 text-muted-foreground" />
          {/* Universe source */}
          <Select value={universeMode} onValueChange={v => setUniverseMode(v as UniverseMode)}>
            <SelectTrigger className="h-7 w-36 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="workbook" className="text-[11px]">Entire workbook</SelectItem>
              <SelectItem value="basket" className="text-[11px]">Basket…</SelectItem>
              <SelectItem value="classification" className="text-[11px]">Classification…</SelectItem>
            </SelectContent>
          </Select>
          {universeMode === "basket" && (
            <Select value={selectedBasket} onValueChange={setSelectedBasket}>
              <SelectTrigger className="h-7 w-40 text-[11px]"><SelectValue placeholder="Pick basket" /></SelectTrigger>
              <SelectContent>
                {baskets.map(b => <SelectItem key={b.id} value={b.id} className="text-[11px]">{b.name} ({b.tickers.length})</SelectItem>)}
                {baskets.length === 0 && <div className="text-[11px] text-muted-foreground px-2 py-2">No baskets saved yet</div>}
              </SelectContent>
            </Select>
          )}
          {universeMode === "classification" && (
            <>
              <Select value={classField} onValueChange={v => { setClassField(v); setClassValue(""); }}>
                <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(CLASS_LABELS).map(k => <SelectItem key={k} value={k} className="text-[11px]">{CLASS_LABELS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={classValue} onValueChange={setClassValue}>
                <SelectTrigger className="h-7 w-44 text-[11px]"><SelectValue placeholder={`Pick ${CLASS_LABELS[classField]}`} /></SelectTrigger>
                <SelectContent>
                  {classOptions.map(v => <SelectItem key={v} value={v} className="text-[11px]">{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
          <span className="text-[10px] text-muted-foreground">
            Universe: <span className={`font-mono ${activeTickers.length === 0 ? "text-rose-400" : "text-foreground"}`}>{activeTickers.length}</span> tickers
            {scanMode === "pairs" && <> · <span className="font-mono text-foreground">{pairCount.toLocaleString()}</span> pairs</>}
            {activeTickers.length === 0 && <span className="ml-2 text-rose-400">{universeMode === "basket" ? "— pick a basket above" : universeMode === "classification" ? `— pick a ${CLASS_LABELS[classField]}` : "— workbook is empty"}</span>}
            {scanMode === "pairs" && activeTickers.length === 1 && <span className="ml-2 text-amber-400">— need 2+ tickers for pairs</span>}
          </span>
          <div className="flex-1" />
          {scanning ? (
            <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={cancelScan} data-testid="btn-cancel">
              <X className="w-3 h-3 mr-1" />Cancel
            </Button>
          ) : (
            <Button size="sm" className="h-7 text-[11px]" onClick={runScan} disabled={activeTickers.length === 0 || (scanMode === "pairs" && activeTickers.length < 2)} data-testid="btn-scan">
              <Play className="w-3 h-3 mr-1" />Run scan
            </Button>
          )}
        </div>
        {/* Progress bar */}
        {(scanning || progress.done > 0) && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {scanning && <Loader2 className="w-3 h-3 animate-spin" />}
            <span className="font-mono">{progress.done}/{progress.total}</span>
            <div className="flex-1 max-w-md h-1.5 bg-border/30 rounded overflow-hidden">
              <div className="h-full bg-primary" style={{ width: progress.total > 0 ? `${progress.done / progress.total * 100}%` : "0%" }} />
            </div>
            <span className="truncate max-w-[200px]">{progress.currentTask}</span>
          </div>
        )}
        {error && <div className="text-rose-400 text-[11px]">{error}</div>}
        {/* Post-scan filters */}
        {(singleResults.length > 0 || pairResults.length > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            <Input value={filterQuery} onChange={e => setFilterQuery(e.target.value)} placeholder="Filter ticker / class…" className="h-7 w-40 text-[11px]" />
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={hideSmall} onChange={e => setHideSmall(e.target.checked)} className="w-3 h-3" />
              Actionable only (n≥{minN}, signal non-null)
            </label>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main table */}
        <div className={`flex-1 overflow-auto ${selectedTicker || selectedPair ? "hidden lg:block" : ""}`}>
          {scanMode === "singles" && sortedSingles.length > 0 && (
            <table className="w-full text-[10px] font-mono border-collapse">
              <thead className="bg-card/40 border-b border-border sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5">Ticker</th>
                  <th className="text-left px-2 py-1.5">Class</th>
                  <SortHeader k="quality" label="Quality" sort={singleSort} onSort={sortSingles} />
                  <SortHeader k="expectedMove20dPct" label="20d Exp" sort={singleSort} onSort={sortSingles} />
                  <th className="text-right px-2 py-1.5">Direction</th>
                  <SortHeader k="hit20d" label="Hit%" sort={singleSort} onSort={sortSingles} />
                  <SortHeader k="n" label="n" sort={singleSort} onSort={sortSingles} />
                  <th className="text-left px-2 py-1.5">Bucket</th>
                  <SortHeader k="currentPrice" label="Price" sort={singleSort} onSort={sortSingles} />
                  <SortHeader k="halfLifeDays" label="HL" sort={singleSort} onSort={sortSingles} />
                </tr>
              </thead>
              <tbody>
                {sortedSingles.map(r => (
                  <tr key={r.ticker} onClick={() => setSelectedTicker(r.ticker === selectedTicker ? null : r.ticker)}
                    className={`border-b border-border/30 cursor-pointer hover:bg-muted/20 ${r.ticker === selectedTicker ? "bg-primary/10" : ""}`}>
                    <td className="px-2 py-1 font-semibold text-foreground">{r.ticker}</td>
                    <td className="px-2 py-1 text-muted-foreground truncate max-w-[80px]">{r.classification}</td>
                    <td className={`px-2 py-1 text-right ${r.quality >= 1.5 ? "text-emerald-400 font-semibold" : r.quality >= 0.5 ? "text-emerald-400/70" : r.quality <= -0.5 ? "text-rose-400/70" : "text-muted-foreground"}`}>{r.quality.toFixed(2)}</td>
                    <td className={`px-2 py-1 text-right ${colorAvg(r.expectedMove20dPct)}`}>{fmtAvg(r.expectedMove20dPct)}</td>
                    <td className="px-2 py-1 text-right">
                      {r.direction && <span className={`px-1 py-0.5 rounded text-[9px] ${r.direction === "long" ? "bg-emerald-500/15 text-emerald-400" : r.direction === "short" ? "bg-rose-500/15 text-rose-400" : "text-muted-foreground"}`}>{r.direction}</span>}
                    </td>
                    <td className={`px-2 py-1 text-right ${colorHit(r.hit20d)}`}>{fmtHit(r.hit20d)}</td>
                    <td className="px-2 py-1 text-right text-muted-foreground">{r.n || "—"}</td>
                    <td className="px-2 py-1 text-muted-foreground max-w-[120px] truncate">{r.bestBucketLabel}</td>
                    <td className="px-2 py-1 text-right">{fmtPrice(r.currentPrice)}</td>
                    <td className="px-2 py-1 text-right text-muted-foreground">{r.halfLifeDays ? `${r.halfLifeDays.toFixed(1)}d` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {scanMode === "pairs" && sortedPairs.length > 0 && (
            <table className="w-full text-[10px] font-mono border-collapse">
              <thead className="bg-card/40 border-b border-border sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5">Pair</th>
                  <SortHeader k="quality" label="Quality" sort={pairSort} onSort={sortPairs} />
                  <SortHeader k="expectedMove20dPct" label="20d Exp" sort={pairSort} onSort={sortPairs} />
                  <th className="text-right px-2 py-1.5">Direction</th>
                  <SortHeader k="hit20d" label="Hit%" sort={pairSort} onSort={sortPairs} />
                  <SortHeader k="n" label="n" sort={pairSort} onSort={sortPairs} />
                  <th className="text-left px-2 py-1.5">Bucket</th>
                  <SortHeader k="ratio" label="Ratio" sort={pairSort} onSort={sortPairs} />
                </tr>
              </thead>
              <tbody>
                {sortedPairs.map(r => {
                  const key = `${r.tickerA}/${r.tickerB}`;
                  const isSelected = selectedPair?.tickerA === r.tickerA && selectedPair?.tickerB === r.tickerB;
                  return (
                    <tr key={key} onClick={() => setSelectedPair(isSelected ? null : { tickerA: r.tickerA, tickerB: r.tickerB })}
                      className={`border-b border-border/30 cursor-pointer hover:bg-muted/20 ${isSelected ? "bg-primary/10" : ""}`}>
                      <td className="px-2 py-1 font-semibold text-foreground">{r.tickerA} / {r.tickerB}</td>
                      <td className={`px-2 py-1 text-right ${r.quality >= 1.5 ? "text-emerald-400 font-semibold" : r.quality >= 0.5 ? "text-emerald-400/70" : "text-muted-foreground"}`}>{r.quality.toFixed(2)}</td>
                      <td className={`px-2 py-1 text-right ${colorAvg(r.expectedMove20dPct)}`}>{fmtAvg(r.expectedMove20dPct)}</td>
                      <td className="px-2 py-1 text-right">
                        {r.direction && <span className={`px-1 py-0.5 rounded text-[9px] ${r.direction === "long" ? "bg-emerald-500/15 text-emerald-400" : r.direction === "short" ? "bg-rose-500/15 text-rose-400" : "text-muted-foreground"}`}>{r.direction}</span>}
                      </td>
                      <td className={`px-2 py-1 text-right ${colorHit(r.hit20d)}`}>{fmtHit(r.hit20d)}</td>
                      <td className="px-2 py-1 text-right text-muted-foreground">{r.n || "—"}</td>
                      <td className="px-2 py-1 text-muted-foreground max-w-[120px] truncate">{r.bestBucketLabel}</td>
                      <td className="px-2 py-1 text-right">{isFinite(r.ratio) ? r.ratio.toFixed(4) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!scanning && singleResults.length === 0 && pairResults.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs p-8 text-center">
              Click "Run scan" to analyze tickers. Each row will show the best predictive signal and expected 20-day move.
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedTicker && (
          <div className="w-full lg:w-[680px] border-l border-border flex flex-col">
            <SingleSignalAnalyzer ticker={selectedTicker} onClose={() => setSelectedTicker(null)} asFloating={false} />
          </div>
        )}
      </div>
    </div>
  );
}
