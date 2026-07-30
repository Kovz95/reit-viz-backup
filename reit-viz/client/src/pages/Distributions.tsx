// Reconstructed from recovered-bundle/Distributions-U9XjHz3w.js on 2026-06-11
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useBaskets } from "@/lib/useBaskets";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { fetchMetricSeries } from "@/lib/fetchMetricSeries";
import { metricMultiplier } from "@/lib/dataService";
import { CLASSIFICATION_KEYS } from "@/lib/classificationKeys";
import { Loader2 } from "lucide-react";
import { useUniverseDefaults } from "@/lib/universeDefaults";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { P as PlayIcon } from "@/lib/play";
import { groupMetricsByCategory, DERIVED_METRICS } from "@/lib/metricCategories";
import { inferRerateMetric } from "@/lib/valuationRerate";

// Curated metrics always offered; unioned at runtime with the loaded universe.
const ALL_METRICS_BASE = [
  "close", "open", "high", "low",
  "EPS (Default)", "EPS FY1 (Default)", "EPS Growth (Default)", "EPS Growth FY1 (Default)",
  "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2",
  "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2",
  "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate",
  "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
  "Dividend Yield", "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2",
  "AFFO FY1", "AFFO FY2", "EBITDA FY1", "EBITDA FY2", "Sales FY1", "Sales FY2",
  "EPS LTM", "FFO LTM", "AFFO LTM", "EBITDA LTM", "Sales LTM",
  "EPS FY0", "FFO FY0", "AFFO FY0", "Dividend", "Enterprise Value",
  "FY1 EPS Growth", "FY2 EPS Growth", "FY1 FFO Growth", "FY2 FFO Growth",
  "FY1 AFFO Growth", "FY2 AFFO Growth",
  "52wk High", "52wk Low", "% off 52wk High", "% off 52wk Low",
  "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
  "Short Interest%", "Buy Ratings", "Hold Ratings", "Sell Ratings", "Bull%", "Bear%",
];

const WINDOW_YEARS: Record<string, number | null> = {
  "1Y": 1, "3Y": 3, "5Y": 5, "All": null,
};

const MS_PER_DAY = 86400000;

function sliceByYears(series: { time: string; value: number }[], years: number | null) {
  if (!series.length || years === null) return series;
  const cutoff = new Date(series[series.length - 1].time).getTime() - years * 365 * MS_PER_DAY;
  let i = 0;
  while (i < series.length && new Date(series[i].time).getTime() < cutoff) i++;
  return series.slice(i);
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

interface DistResult {
  ticker: string;
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  stdev: number;
  current: number;
  percentile: number;
  z: number;
  values: number[];
  hist: number[];
  binEdges: number[];
  /** present only in Returns basis: skew / excess-kurt / VaR / CVaR / ann σ */
  tail?: PairTailStats;
  /** true when `current`/values are log-returns shown as % (Returns basis) */
  isReturn?: boolean;
}

// `binRange` clips only the HISTOGRAM domain (all stats still use every value).
// Fat-tailed series otherwise pile ~everything into 2 of `bins` bars; Overlay and
// Box views already clip to the 1–99% quantiles for the same reason.
function computeDistStats(
  ticker: string,
  values: number[],
  current: number,
  bins: number,
  binRange?: [number, number]
): DistResult {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  const med = quantile(sorted, 0.5);
  const p25 = quantile(sorted, 0.25);
  const p75 = quantile(sorted, 0.75);
  let countBelow = 0;
  for (const v of values) if (v <= current) countBelow++;
  const percentile = countBelow / n;
  const z = stdev > 0 ? (current - mean) / stdev : 0;
  const hist = new Array(bins).fill(0);
  const binEdges = new Array(bins + 1);
  const loEdge = binRange ? binRange[0] : min;
  const hiEdge = binRange ? binRange[1] : max;
  if (hiEdge === loEdge) {
    for (let i = 0; i <= bins; i++) binEdges[i] = loEdge + (i - bins / 2) * 1e-9;
    hist[Math.floor(bins / 2)] = n;
  } else {
    const step = (hiEdge - loEdge) / bins;
    for (let i = 0; i <= bins; i++) binEdges[i] = loEdge + i * step;
    for (const v of values) {
      let b = Math.floor((v - loEdge) / step);
      if (binRange && (b < 0 || b >= bins)) continue; // clipped tail: excluded from the plot only
      if (b >= bins) b = bins - 1;
      if (b < 0) b = 0;
      hist[b]++;
    }
  }
  return { ticker, n, min, max, mean, median: med, p25, p75, stdev, current, percentile, z, values, hist, binEdges };
}

// ---- Pair Ratio mode -------------------------------------------------------
// Distribution of a pair ratio's DAILY LOG RETURNS: returns of closeA/closeB.
// Helps size pair trades and judge tail risk.

interface PairTailStats {
  skew: number;      // population (method-of-moments) skewness, m3/sd^3
  exKurt: number;    // excess kurtosis (0 = normal)
  var5: number;      // 5% historical VaR (5th-percentile daily log return, typically < 0)
  cvar5: number;     // 5% CVaR / expected shortfall (mean of returns at or below var5)
  annVol: number;    // annualized sigma = daily stdev * sqrt(252)
}

interface PairResult {
  key: string;       // "A/B"
  a: string;
  b: string;
  dist?: DistResult; // computeDistStats over the log-return series
  tail?: PairTailStats;
  asOf?: string;     // date of the last ratio observation (legs can end on different days)
  source?: string;   // "workbook" | "yahoo" — both legs always share one calendar
  error?: string;    // "no data for <leg>" | "insufficient overlap" | "mixed price calendars…"
}

function computeTailStats(returns: number[]): PairTailStats {
  const n = returns.length;
  const mean = returns.reduce((s, v) => s + v, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of returns) {
    const d = v - mean;
    const d2 = d * d;
    m2 += d2; m3 += d2 * d; m4 += d2 * d2;
  }
  m2 /= n; m3 /= n; m4 /= n;
  const sd = Math.sqrt(m2);
  const skew = sd > 0 ? m3 / (sd * sd * sd) : 0;
  const exKurt = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const var5 = quantile(sorted, 0.05);
  let sum = 0, cnt = 0;
  for (const v of sorted) {
    if (v <= var5) { sum += v; cnt++; } else break;
  }
  const cvar5 = cnt > 0 ? sum / cnt : var5;
  const annVol = sd * Math.sqrt(252);
  return { skew, exKurt, var5, cvar5, annVol };
}

// Period-over-period LOG returns of a series. Only defined on a strictly positive
// scale (prices, multiples, yields) — for anything that can cross zero we return []
// so the caller marks it n/a in Returns basis.
function computeReturns(vals: number[]): number[] {
  if (!vals.every((v) => v > 0)) return [];
  const out: number[] = [];
  for (let i = 1; i < vals.length; i++) {
    const a = vals[i - 1], b = vals[i];
    if (a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b)) out.push(Math.log(b / a));
  }
  return out;
}

interface LegCloses {
  times: string[];
  closes: number[];
  source: "workbook" | "yahoo";
}

async function loadYahooCloses(ticker: string): Promise<LegCloses | null> {
  try {
    const res = await fetch(`/api/yahoo-prices/${encodeURIComponent(ticker)}`);
    if (res.ok) {
      const data = await res.json();
      const closes: number[] =
        Array.isArray(data?.adjCloses) && data.adjCloses.length ? data.adjCloses : data?.closes;
      if (Array.isArray(data?.dates) && Array.isArray(closes) && closes.length) {
        return { times: data.dates, closes, source: "yahoo" };
      }
    }
  } catch {}
  return null;
}

// Load one leg's close series. Tries the workbook metric ("close") first, then
// falls back to the server Yahoo price cache so ETFs/indices (VNQ, IYR, …) work
// — the exact fallback SimilarSetups uses for typed pairs.
async function loadLegCloses(ticker: string): Promise<LegCloses | null> {
  try {
    const pts = await fetchMetricSeries(ticker, "close");
    if (pts.length) {
      return { times: pts.map(p => p.time), closes: pts.map(p => p.value), source: "workbook" };
    }
  } catch {}
  return loadYahooCloses(ticker);
}

async function computePairResult(pairKey: string, windowKey: string, bins: number): Promise<PairResult> {
  const [a, b] = pairKey.split("/");
  let legA = await loadLegCloses(a);
  if (!legA || !legA.closes.length) return { key: pairKey, a, b, error: `no data for ${a}` };
  let legB = await loadLegCloses(b);
  if (!legB || !legB.closes.length) return { key: pairKey, a, b, error: `no data for ${b}` };

  // Prefer both legs from ONE price source. The workbook axis and the Yahoo cache
  // don't carry the same calendar, and a workbook whose value arrays have drifted out
  // of sync with its `dates` axis (what a data volume missing a realign pass looks
  // like) will silently join prices from different sessions and roughly double the
  // ratio's apparent vol. Legs the Yahoo cache doesn't know (UK tickers, …) still fall
  // back to the cross-source join — flagged, since it can't be validated here.
  let mixedCalendar = false;
  if (legA.source !== legB.source) {
    const rebase = legA.source === "workbook" ? a : b;
    const realigned = await loadYahooCloses(rebase);
    if (realigned && realigned.closes.length) {
      if (rebase === a) legA = realigned; else legB = realigned;
    } else {
      mixedCalendar = true;
    }
  }

  // Inner-join on date → ratio r_t = closeA / closeB.
  const mapB = new Map<string, number>();
  for (let i = 0; i < legB.times.length; i++) {
    const c = legB.closes[i];
    if (Number.isFinite(c) && c !== 0) mapB.set(legB.times[i], c);
  }
  const ratioSeries: { time: string; value: number }[] = [];
  for (let i = 0; i < legA.times.length; i++) {
    const ca = legA.closes[i];
    const cb = mapB.get(legA.times[i]);
    if (cb != null && Number.isFinite(ca) && ca !== 0 && Number.isFinite(cb) && cb !== 0) {
      ratioSeries.push({ time: legA.times[i], value: ca / cb });
    }
  }

  const sliced = sliceByYears(ratioSeries, WINDOW_YEARS[windowKey]);
  // Daily LOG returns of the ratio.
  const returns: number[] = [];
  for (let i = 1; i < sliced.length; i++) {
    const r0 = sliced[i - 1].value, r1 = sliced[i].value;
    if (r0 > 0 && r1 > 0 && Number.isFinite(r0) && Number.isFinite(r1)) {
      returns.push(Math.log(r1 / r0));
    }
  }
  if (returns.length < 30) return { key: pairKey, a, b, error: "insufficient overlap" };

  const current = returns[returns.length - 1];
  const sortedRet = [...returns].sort((x, y) => x - y);
  const dist = computeDistStats(`${a}/${b}`, returns, current, bins, [
    quantile(sortedRet, 0.01),
    quantile(sortedRet, 0.99),
  ]);
  const tail = computeTailStats(returns);
  return {
    key: pairKey,
    a,
    b,
    dist,
    tail,
    asOf: sliced[sliced.length - 1]?.time,
    source: mixedCalendar ? `${legA.source}×${legB.source} calendars` : legA.source,
  };
}

const MAX_PAIRS = 24;

// "well / vtr" → "WELL/VTR"; null if it isn't a clean A/B pair. Shared by the input
// handler and the localStorage hydration so a stale/hand-edited entry can't produce
// duplicate React keys, "GARBAGE / undefined" cards, or colliding test ids.
function parsePairKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.replace(/\s+/g, "").toUpperCase().match(/^([A-Z0-9.\-]{1,12})\/([A-Z0-9.\-]{1,12})$/);
  if (!m) return null;
  const [, a, b] = m;
  return a === b ? null : `${a}/${b}`;
}

// Log returns display as signed percent.
function fmtRetPct(v: number): string {
  return Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : "—";
}

function PairCard({ p }: { p: PairResult }) {
  if (p.error || !p.dist || !p.tail) {
    return (
      <div
        data-testid={`dist-pair-card-${p.a}-${p.b}`}
        className="border border-border/40 bg-card/30 rounded p-1.5"
      >
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-mono font-bold text-xs text-foreground">{p.a} / {p.b}</span>
        </div>
        <div className="h-[92px] flex items-center justify-center text-[10px] font-mono text-foreground/40">
          {p.error || "no data"}
        </div>
      </div>
    );
  }
  const r = p.dist;
  const tail = p.tail;
  const maxCount = Math.max(1, ...r.hist);
  const svgW = 212;
  const svgH = 92;
  const barW = svgW / r.hist.length;
  // Bin edges are the clipped 1–99% domain, so the marker has to be clamped into view.
  const loEdge = r.binEdges[0];
  const hiEdge = r.binEdges[r.binEdges.length - 1];
  const range = hiEdge - loEdge || 1;
  const currentX = 4 + Math.min(1, Math.max(0, (r.current - loEdge) / range)) * svgW;
  return (
    <div
      data-testid={`dist-pair-card-${p.a}-${p.b}`}
      title={`${p.a}/${p.b} · ${r.n} daily log returns${p.asOf ? ` · as of ${p.asOf}` : ""}${p.source ? ` · ${p.source} prices` : ""}`}
      className="border border-border/40 bg-card/30 rounded p-1.5 hover:border-border/70 transition-colors"
    >
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono font-bold text-xs text-foreground">{p.a} / {p.b}</span>
          <span className="font-mono text-[10px] text-foreground/40">n={r.n}</span>
        </div>
        <span className={`font-mono text-xs ${zClass(r.z)}`}>{fmtRetPct(r.current)}</span>
      </div>
      <svg width="100%" height={100} viewBox={`0 0 220 100`} preserveAspectRatio="none" className="block">
        {r.hist.map((count, i) => {
          const barH = (count / maxCount) * svgH;
          return (
            <rect
              key={i}
              x={4 + i * barW}
              y={4 + (svgH - barH)}
              width={Math.max(0.5, barW - 0.5)}
              height={barH}
              fill="rgba(14,165,233,0.45)"
            />
          );
        })}
        <line x1={currentX} x2={currentX} y1={4} y2={4 + svgH} stroke="rgb(251 191 36)" strokeWidth={1.5} />
      </svg>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 font-mono text-[10px] text-foreground/50">
        <span>μ={fmtRetPct(r.mean)}</span>
        <span>Ann.σ={fmtRetPct(tail.annVol)}</span>
        <span className={zClass(r.z)}>z={r.z.toFixed(2)}</span>
        <span>pct={fmtPct(r.percentile)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 font-mono text-[10px] text-foreground/40">
        <span>skew={Number.isFinite(tail.skew) ? tail.skew.toFixed(2) : "—"}</span>
        <span>exKurt={Number.isFinite(tail.exKurt) ? tail.exKurt.toFixed(2) : "—"}</span>
        <span className="text-red-400/70">VaR5={fmtRetPct(tail.var5)}</span>
        <span className="text-red-400/70">CVaR5={fmtRetPct(tail.cvar5)}</span>
      </div>
    </div>
  );
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function tickerColor(ticker: string, alpha = 1): string {
  return `hsla(${hashStr(ticker) % 360}, 70%, 60%, ${alpha})`;
}

function zClass(z: number): string {
  return z < -1 ? "text-emerald-400" : z > 1 ? "text-red-400" : "text-foreground/80";
}

function fmtVal(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function fmtPct(v: number): string {
  return Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : "—";
}

interface SmallCardProps { r: DistResult; }

function SmallCard({ r }: SmallCardProps) {
  const maxCount = Math.max(1, ...r.hist);
  const svgW = 212;
  const svgH = 92;
  const barW = svgW / r.hist.length;
  // Marker against the (clipped) bin domain so it stays in view when tails are cut.
  const loEdge = r.binEdges[0];
  const hiEdge = r.binEdges[r.binEdges.length - 1];
  const range = hiEdge - loEdge || 1;
  const currentX = 4 + Math.min(1, Math.max(0, (r.current - loEdge) / range)) * svgW;
  const isRet = r.isReturn;
  const fmtC = isRet ? fmtRetPct : fmtVal;
  const tail = r.tail;
  return (
    <div className="border border-border/40 bg-card/30 rounded p-1.5 hover:border-border/70 transition-colors">
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono font-bold text-xs text-foreground">{r.ticker}</span>
          <span className="font-mono text-[10px] text-foreground/40">n={r.n}</span>
        </div>
        <span className={`font-mono text-xs ${zClass(r.z)}`}>{fmtC(r.current)}</span>
      </div>
      <svg width="100%" height={100} viewBox={`0 0 220 100`} preserveAspectRatio="none" className="block">
        {r.hist.map((count, i) => {
          const barH = (count / maxCount) * svgH;
          return (
            <rect
              key={i}
              x={4 + i * barW}
              y={4 + (svgH - barH)}
              width={Math.max(0.5, barW - 0.5)}
              height={barH}
              fill="rgba(14,165,233,0.45)"
            />
          );
        })}
        <line x1={currentX} x2={currentX} y1={4} y2={4 + svgH} stroke="rgb(251 191 36)" strokeWidth={1.5} />
      </svg>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 font-mono text-[10px] text-foreground/50">
        <span>μ={fmtC(r.mean)}</span>
        <span>{isRet ? "Ann.σ" : "σ"}={isRet && tail ? fmtRetPct(tail.annVol) : fmtVal(r.stdev)}</span>
        <span className={zClass(r.z)}>z={r.z.toFixed(2)}</span>
        <span>pct={fmtPct(r.percentile)}</span>
      </div>
      {isRet && tail && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 font-mono text-[10px] text-foreground/40">
          <span>skew={Number.isFinite(tail.skew) ? tail.skew.toFixed(2) : "—"}</span>
          <span>exKurt={Number.isFinite(tail.exKurt) ? tail.exKurt.toFixed(2) : "—"}</span>
          <span className="text-red-400/70">VaR5={fmtRetPct(tail.var5)}</span>
          <span className="text-red-400/70">CVaR5={fmtRetPct(tail.cvar5)}</span>
        </div>
      )}
    </div>
  );
}

interface SmallMultiplesViewProps { results: DistResult[]; }

function SmallMultiplesView({ results }: SmallMultiplesViewProps) {
  return (
    <div
      className="grid gap-2 p-2"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
    >
      {results.map(r => <SmallCard key={r.ticker} r={r} />)}
    </div>
  );
}

interface OverlayViewProps {
  results: DistResult[];
  hoverTicker: string | null;
  setHoverTicker: (t: string | null) => void;
  metric: string;
  lowIsCheap: boolean;
  isReturn: boolean;
}

function OverlayView({ results, hoverTicker, setHoverTicker, metric, lowIsCheap, isReturn }: OverlayViewProps) {
  const scored = useMemo<ScoredName[]>(() =>
    results.map(r => ({ ticker: r.ticker, value: r.current, z: r.z, pct: r.percentile, richZ: lowIsCheap ? r.z : -r.z })),
    [results, lowIsCheap]);
  const byAbsZ = useMemo(() => [...results].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)), [results]);
  const top30 = useMemo(() => new Set(byAbsZ.slice(0, 30).map(r => r.ticker)), [byAbsZ]);

  const allValues = useMemo(() => {
    const vals: number[] = [];
    for (const r of results) vals.push(r.min, r.p25, r.median, r.p75, r.max, r.current);
    vals.sort((a, b) => a - b);
    return vals;
  }, [results]);

  const xMin = quantile(allValues, 0.01);
  const xMax = quantile(allValues, 0.99);
  const xRange = xMax - xMin || 1;
  const padding = xRange * 0.02;
  const xMinP = xMin - padding;
  const xMaxP = xMax + padding;

  const SVG_W = 1200, SVG_H = 520;
  const leftPad = 50, rightPad = 200, topPad = 16, botPad = 36;
  const plotW = SVG_W - leftPad - rightPad;
  const plotH = SVG_H - topPad - botPad;
  const xRangeP = xMaxP - xMinP || 1;

  const toX = (v: number) => {
    const clamped = Math.max(xMinP, Math.min(xMaxP, v));
    return leftPad + ((clamped - xMinP) / xRangeP) * plotW;
  };

  const curves = useMemo(() => {
    let yMax = 0;
    const computed = results.map(r => {
      const step = (r.max - r.min) / r.hist.length;
      const pts = r.hist.map((count, i) => {
        const cx = r.binEdges[i] + step / 2;
        const density = r.n > 0 && step > 0 ? count / (r.n * step) : 0;
        if (density > yMax) yMax = density;
        return { x: toX(cx), y: density };
      });
      return { ticker: r.ticker, current: r.current, pts };
    });
    return { curves: computed, yMax: yMax || 1 };
  }, [results, xMinP, xMaxP]);

  const toY = (density: number) => topPad + plotH - (density / curves.yMax) * plotH;

  const xTicks: number[] = [];
  for (let i = 0; i <= 5; i++) xTicks.push(xMinP + (i / 5) * xRangeP);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="block">
          <line x1={leftPad} x2={leftPad + plotW} y1={topPad + plotH} y2={topPad + plotH} stroke="rgba(255,255,255,0.15)" />
          <line x1={leftPad} x2={leftPad} y1={topPad} y2={topPad + plotH} stroke="rgba(255,255,255,0.15)" />
          {xTicks.map((v, i) => (
            <g key={i}>
              <line x1={toX(v)} x2={toX(v)} y1={topPad + plotH} y2={topPad + plotH + 4} stroke="rgba(255,255,255,0.3)" />
              <text x={toX(v)} y={topPad + plotH + 16} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontFamily="ui-monospace, monospace">
                {fmtVal(v)}
              </text>
            </g>
          ))}
          <text x={leftPad + plotW / 2} y={SVG_H - 6} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontFamily="ui-monospace, monospace">{metric}</text>
          <text x={12} y={topPad + plotH / 2} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontFamily="ui-monospace, monospace" transform={`rotate(-90 12 ${topPad + plotH / 2})`}>density</text>
          {curves.curves.map(curve => {
            const isTop = top30.has(curve.ticker);
            const isHover = hoverTicker === curve.ticker;
            const isDimmed = hoverTicker !== null && !isHover;
            const color = isTop ? tickerColor(curve.ticker, 1) : "rgba(150,150,150,0.4)";
            const opacity = isDimmed ? 0.08 : isTop ? 0.65 : 0.18;
            const strokeColor = isTop ? tickerColor(curve.ticker, opacity) : `rgba(150,150,150,${opacity})`;
            const sw = isHover ? 2.5 : 1;
            const d = curve.pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${toY(pt.y).toFixed(1)}`).join(" ");
            return (
              <g key={curve.ticker}>
                <path d={d} fill="none" stroke={strokeColor} strokeWidth={sw} />
                <line
                  x1={toX(curve.current)} x2={toX(curve.current)}
                  y1={topPad + plotH} y2={topPad + plotH + 6}
                  stroke={isTop ? color : "rgba(150,150,150,0.4)"}
                  strokeWidth={isHover ? 2 : 1}
                  opacity={isDimmed ? 0.2 : 1}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="w-[280px] border-l border-border/40 bg-card/20 overflow-y-auto p-1">
        <div className="px-1 py-0.5 text-foreground/40 uppercase tracking-wide text-[10px]">
          Shortlist (vs own history)
        </div>
        <LongsShorts scored={scored} lowIsCheap={lowIsCheap} isReturn={isReturn} hoverTicker={hoverTicker} setHoverTicker={setHoverTicker} n={18} />
      </div>
    </div>
  );
}

interface BoxViewProps { results: DistResult[]; metric: string; }

function BoxView({ results, metric }: BoxViewProps) {
  const [tooltip, setTooltip] = useState<{ r: DistResult; x: number; y: number } | null>(null);
  const allValues = useMemo(() => {
    const vals: number[] = [];
    for (const r of results) vals.push(r.min, r.p25, r.median, r.p75, r.max, r.current);
    vals.sort((a, b) => a - b);
    return vals;
  }, [results]);
  const xMin = quantile(allValues, 0.01);
  const xMax = quantile(allValues, 0.99);
  const xRange = xMax - xMin || 1;
  const padding = xRange * 0.02;
  const xMinP = xMin - padding;
  const xMaxP = xMax + padding;
  const xRangeP = xMaxP - xMinP || 1;

  const LBL = 60, LBL_PAD = 12, RIGHT_PAD = 60, SVG_W = 1000, ROW_H = 18, TOP = 36;
  const plotW = SVG_W - LBL - LBL_PAD - RIGHT_PAD;
  const toX = (v: number) => {
    const clamped = Math.max(xMinP, Math.min(xMaxP, v));
    return LBL + LBL_PAD + ((clamped - xMinP) / xRangeP) * plotW;
  };

  const ticks: number[] = [];
  for (let i = 0; i <= 5; i++) ticks.push(xMinP + (i / 5) * xRangeP);
  const svgH = TOP + 12 + results.length * ROW_H;

  return (
    <div className="relative">
      <svg width="100%" viewBox={`0 0 ${SVG_W} ${svgH}`} className="block">
        <line x1={LBL + LBL_PAD} x2={LBL + LBL_PAD + plotW} y1={20} y2={20} stroke="rgba(255,255,255,0.15)" />
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={toX(v)} x2={toX(v)} y1={16} y2={20} stroke="rgba(255,255,255,0.3)" />
            <text x={toX(v)} y={12} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontFamily="ui-monospace, monospace">{fmtVal(v)}</text>
          </g>
        ))}
        <text x={SVG_W - RIGHT_PAD + 4} y={12} fontSize={9} fill="rgba(255,255,255,0.4)" fontFamily="ui-monospace, monospace">{metric}</text>
        {results.map((r, i) => {
          const rowY = TOP + i * ROW_H;
          const midY = rowY + ROW_H / 2;
          const x1 = toX(r.p25), x2 = toX(r.p75), medX = toX(r.median);
          const minX = toX(r.min), maxX = toX(r.max), curX = toX(r.current);
          const color = tickerColor(r.ticker, 1);
          const dotColor = Math.abs(r.z) > 1 ? (r.z > 0 ? "rgb(248 113 113)" : "rgb(52 211 153)") : "rgb(251 191 36)";
          return (
            <g
              key={r.ticker}
              onMouseEnter={e => {
                const svgEl = (e.currentTarget as SVGElement).ownerSVGElement!;
                const rect = svgEl.getBoundingClientRect();
                setTooltip({ r, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseMove={e => {
                const svgEl = (e.currentTarget as SVGElement).ownerSVGElement!;
                const rect = svgEl.getBoundingClientRect();
                setTooltip({ r, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: "pointer" }}
            >
              <rect x={0} y={rowY} width={SVG_W} height={ROW_H} fill="transparent" />
              <text x={LBL + 4} y={midY + 3} fontSize={11} textAnchor="end" fill="rgba(255,255,255,0.85)" fontFamily="ui-monospace, monospace">{r.ticker}</text>
              <line x1={minX} x2={maxX} y1={midY} y2={midY} stroke="rgba(255,255,255,0.35)" />
              <line x1={minX} x2={minX} y1={midY - 4} y2={midY + 4} stroke="rgba(255,255,255,0.35)" />
              <line x1={maxX} x2={maxX} y1={midY - 4} y2={midY + 4} stroke="rgba(255,255,255,0.35)" />
              <rect x={x1} y={rowY + 3} width={Math.max(1, x2 - x1)} height={ROW_H - 6} fill={tickerColor(r.ticker, 0.25)} stroke={color} strokeWidth={1} />
              <line x1={medX} x2={medX} y1={rowY + 3} y2={rowY + ROW_H - 3} stroke="white" strokeWidth={1.5} />
              <circle cx={curX} cy={midY} r={3.5} fill={dotColor} stroke="rgba(0,0,0,0.6)" strokeWidth={0.5} />
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-popover border border-border/60 rounded shadow-lg px-2 py-1.5 text-[11px] font-mono z-10"
          style={{ left: Math.min(tooltip.x + 12, 800), top: tooltip.y + 12 }}
        >
          <div className="font-bold text-foreground mb-0.5">{tooltip.r.ticker}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0 text-foreground/70">
            <span>n</span><span className="text-right text-foreground">{tooltip.r.n}</span>
            <span>current</span><span className={`text-right ${zClass(tooltip.r.z)}`}>{fmtVal(tooltip.r.current)}</span>
            <span>median</span><span className="text-right text-foreground">{fmtVal(tooltip.r.median)}</span>
            <span>p25–p75</span><span className="text-right text-foreground">{fmtVal(tooltip.r.p25)} – {fmtVal(tooltip.r.p75)}</span>
            <span>min/max</span><span className="text-right text-foreground">{fmtVal(tooltip.r.min)} – {fmtVal(tooltip.r.max)}</span>
            <span>μ / σ</span><span className="text-right text-foreground">{fmtVal(tooltip.r.mean)} / {fmtVal(tooltip.r.stdev)}</span>
            <span>z</span><span className={`text-right ${zClass(tooltip.r.z)}`}>{tooltip.r.z.toFixed(2)}</span>
            <span>pct</span><span className="text-right text-foreground">{fmtPct(tooltip.r.percentile)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Ranked long/short shortlist, orientation-aware. `richZ` high = rich = short
// candidate; low = cheap = long candidate. Hovering a name highlights it in the plot.
interface ScoredName { ticker: string; value: number; z: number; pct: number; richZ: number; }
function LongsShorts({
  scored, lowIsCheap, isReturn, hoverTicker, setHoverTicker, n = 15,
}: {
  scored: ScoredName[]; lowIsCheap: boolean; isReturn: boolean;
  hoverTicker: string | null; setHoverTicker: (t: string | null) => void; n?: number;
}) {
  const asc = useMemo(() => [...scored].sort((a, b) => a.richZ - b.richZ), [scored]);
  const longs = asc.slice(0, n);                    // lowest richZ = cheapest
  const shorts = asc.slice(-n).reverse();           // highest richZ = richest
  const col = (title: string, rows: ScoredName[], tone: string) => (
    <div className="flex-1 min-w-0">
      <div className={`px-1 py-0.5 uppercase tracking-wide text-[10px] ${tone}`}>{title}</div>
      {rows.map(r => (
        <div
          key={r.ticker}
          onMouseEnter={() => setHoverTicker(r.ticker)}
          onMouseLeave={() => setHoverTicker(null)}
          className={`flex items-center gap-1.5 px-1 py-0.5 rounded cursor-default ${hoverTicker === r.ticker ? "bg-accent/40" : "hover:bg-accent/20"}`}
        >
          <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: tickerColor(r.ticker, 1) }} />
          <span className="text-foreground/85 truncate">{r.ticker}</span>
          <span className={`ml-auto tabular-nums ${zClass(r.z)}`}>{(r.z >= 0 ? "+" : "") + r.z.toFixed(2)}</span>
          <span className="text-foreground/35 tabular-nums w-8 text-right">{fmtPct(r.pct)}</span>
        </div>
      ))}
    </div>
  );
  const longLabel = isReturn ? "Weakest (z↓)" : lowIsCheap ? "Cheap · long" : "Cheap · long";
  const shortLabel = isReturn ? "Strongest (z↑)" : "Rich · short";
  return (
    <div className="flex gap-1 text-[11px] font-mono">
      {col(longLabel, longs, "text-emerald-400/80")}
      {col(shortLabel, shorts, "text-red-400/80")}
    </div>
  );
}

// Cross-sectional peer view: one histogram of every name's current value today,
// each name marked as a tick coloured by cheap(green)/rich(red), + longs/shorts.
function PeerView({
  peer, metric, hoverTicker, setHoverTicker,
}: {
  peer: { cross: DistResult; scored: ScoredName[]; lowIsCheap: boolean; isReturn: boolean };
  metric: string; hoverTicker: string | null; setHoverTicker: (t: string | null) => void;
}) {
  const r = peer.cross;
  const lo = r.binEdges[0], hi = r.binEdges[r.binEdges.length - 1];
  const range = hi - lo || 1;
  const SVG_W = 1000, SVG_H = 340, L = 44, R = 16, T = 16, B = 34;
  const plotW = SVG_W - L - R, plotH = SVG_H - T - B;
  const toX = (v: number) => L + Math.min(1, Math.max(0, (v - lo) / range)) * plotW;
  const maxCount = Math.max(1, ...r.hist);
  const barW = plotW / r.hist.length;
  const ticks: number[] = [];
  for (let i = 0; i <= 5; i++) ticks.push(lo + (i / 5) * range);
  const fmtC = (v: number) => (peer.isReturn ? fmtRetPct(v) : fmtVal(v));
  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto p-2">
        <div className="text-[11px] font-mono text-foreground/50 mb-1">
          Cross-section of <span className="text-foreground/80">{metric}</span> across {r.n} names
          {peer.isReturn ? " · latest daily log-return" : " · current value"} · μ={fmtC(r.mean)} · median={fmtC(r.median)}
        </div>
        <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="block">
          <line x1={L} x2={L + plotW} y1={T + plotH} y2={T + plotH} stroke="rgba(255,255,255,0.15)" />
          {r.hist.map((count, i) => {
            const barH = (count / maxCount) * plotH;
            return <rect key={i} x={L + i * barW} y={T + plotH - barH} width={Math.max(0.5, barW - 0.5)} height={barH} fill="rgba(120,130,150,0.25)" />;
          })}
          {peer.scored.map(s => {
            const isHover = hoverTicker === s.ticker;
            const dim = hoverTicker !== null && !isHover;
            const col = s.richZ > 0.5 ? "rgb(248,113,113)" : s.richZ < -0.5 ? "rgb(52,211,153)" : "rgba(160,170,190,0.7)";
            return (
              <g key={s.ticker} onMouseEnter={() => setHoverTicker(s.ticker)} onMouseLeave={() => setHoverTicker(null)} style={{ cursor: "default" }}>
                <line x1={toX(s.value)} x2={toX(s.value)} y1={T + plotH} y2={T + plotH - (isHover ? plotH : 14)} stroke={col} strokeWidth={isHover ? 2 : 1} opacity={dim ? 0.15 : isHover ? 1 : 0.8} />
                {isHover && <text x={toX(s.value)} y={T + 10} fontSize={11} textAnchor="middle" fill={col} fontFamily="ui-monospace, monospace">{s.ticker} · z {s.z.toFixed(2)} · {fmtPct(s.pct)}</text>}
              </g>
            );
          })}
          {ticks.map((v, i) => (
            <text key={i} x={toX(v)} y={T + plotH + 16} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontFamily="ui-monospace, monospace">{fmtC(v)}</text>
          ))}
          <text x={L + plotW / 2} y={SVG_H - 4} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontFamily="ui-monospace, monospace">{metric}{peer.isReturn ? " (log-return)" : ""}</text>
        </svg>
      </div>
      <div className="w-[280px] border-l border-border/40 bg-card/20 overflow-y-auto p-1">
        <div className="px-1 py-0.5 text-foreground/40 uppercase tracking-wide text-[10px]">Cross-section shortlist</div>
        <LongsShorts scored={peer.scored} lowIsCheap={peer.lowIsCheap} isReturn={peer.isReturn} hoverTicker={hoverTicker} setHoverTicker={setHoverTicker} n={18} />
      </div>
    </div>
  );
}

export default function Distributions() {
  const { available, valuationMetric } = useUniverseDefaults();
  const metricLockedRef = useRef(false);
  const [selectedMetric, setSelectedMetric] = useState(valuationMetric);

  useEffect(() => {
    if (!metricLockedRef.current && available.size !== 0 && !available.has(selectedMetric)) {
      setSelectedMetric(valuationMetric);
    }
  }, [available, valuationMetric, selectedMetric]);

  const [universeMode, setUniverseMode] = useState("workbook");
  const [selectedBasket, setSelectedBasket] = useState("");
  const [classKey, setClassKey] = useState("sector");
  const [classValue, setClassValue] = useState("");
  const [windowKey, setWindowKey] = useState("All");
  const [view, setView] = useState("small");
  const [bins, setBins] = useState(30);
  // Level = distribute the metric itself; Returns = distribute its daily log-returns
  // (+ tail-risk stats). Reference = each name vs its OWN history, or vs PEERS today.
  const [basis, setBasis] = useState<"level" | "returns">("level");
  const [reference, setReference] = useState<"history" | "peers">("history");
  const [sortKey, setSortKey] = useState("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [allTickers, setAllTickers] = useState<any[]>([]);
  const metricGroups = useMemo(() => {
    const s = new Set<string>([...ALL_METRICS_BASE, ...DERIVED_METRICS]);
    for (const t of allTickers) for (const m of (t.metrics || [])) s.add(m);
    return groupMetricsByCategory([...s]);
  }, [allTickers]);
  const { baskets } = useBaskets();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [results, setResults] = useState<DistResult[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [hoverTicker, setHoverTicker] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const autoRunRef = useRef(false);

  // ---- Pair Ratio mode ----
  const [mode, setMode] = useState<"metric" | "pair">("metric");
  const [pairs, setPairs] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("reit-viz:dist-pairs");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const seen = new Set<string>();
          for (const x of arr) {
            const key = parsePairKey(x);
            if (key) seen.add(key);
          }
          return [...seen].slice(0, MAX_PAIRS);
        }
      }
    } catch {}
    return [];
  });
  const [pairInput, setPairInput] = useState("");
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairResults, setPairResults] = useState<PairResult[]>([]);
  const [pairRunning, setPairRunning] = useState(false);
  const pairRunIdRef = useRef(0);

  useEffect(() => {
    try { localStorage.setItem("reit-viz:dist-pairs", JSON.stringify(pairs)); } catch {}
  }, [pairs]);

  const addPair = useCallback(() => {
    const key = parsePairKey(pairInput);
    if (!key) {
      const txt = pairInput.trim();
      setPairError(txt ? `“${txt}” is not a valid A/B pair` : null);
      return;
    }
    if (pairs.includes(key)) { setPairError(`${key} is already pinned`); setPairInput(""); return; }
    if (pairs.length >= MAX_PAIRS) { setPairError(`limit is ${MAX_PAIRS} pairs`); return; }
    setPairs(prev => [...prev, key]);
    setPairInput("");
    setPairError(null);
  }, [pairInput, pairs]);

  const removePair = useCallback((key: string) => {
    setPairs(prev => prev.filter(k => k !== key));
    setPairError(null);
  }, []);

  useEffect(() => {
    // Bump BEFORE the early returns so leaving pair mode / clearing every pin also
    // cancels an in-flight run instead of letting it write stale results.
    const runId = ++pairRunIdRef.current;
    if (mode !== "pair") return;
    if (pairs.length === 0) { setPairResults([]); setPairRunning(false); return; }
    setPairRunning(true);
    (async () => {
      const out: PairResult[] = [];
      for (const key of pairs) {
        const res = await computePairResult(key, windowKey, bins);
        if (pairRunIdRef.current !== runId) return;
        out.push(res);
        setPairResults([...out]);
      }
      if (pairRunIdRef.current === runId) {
        setPairResults(out);
        setPairRunning(false);
      }
    })();
  }, [mode, pairs, windowKey, bins]);

  useEffect(() => {
    fetchWorkbookTickers().then((t: any[]) => setAllTickers(t)).catch(() => setAllTickers([]));
  }, []);

  const classValues = useMemo(() => {
    const s = new Set<string>();
    for (const t of allTickers) { const v = t[classKey]; if (v) s.add(String(v)); }
    return [...s].sort();
  }, [allTickers, classKey]);

  useEffect(() => {
    if (universeMode === "classification" && classValues.length && !classValues.includes(classValue)) {
      setClassValue(classValues[0]);
    }
  }, [universeMode, classValues, classValue]);

  useEffect(() => {
    if (universeMode === "basket" && baskets.length && !baskets.find(b => b.id === selectedBasket)) {
      setSelectedBasket(baskets[0].id);
    }
  }, [universeMode, baskets, selectedBasket]);

  const geo = useGeoFilter(allTickers, "dist-geo");

  const universeTickers = useMemo(() => {
    let base: string[];
    if (universeMode === "workbook") base = allTickers.map(t => t.ticker);
    else if (universeMode === "basket") {
      const b = baskets.find(b => b.id === selectedBasket);
      base = b ? b.tickers : [];
    } else {
      base = allTickers.filter(t => String(t[classKey] ?? "") === classValue).map(t => t.ticker);
    }
    return base.filter(t => geo.matchesGeo(t));
  }, [universeMode, allTickers, baskets, selectedBasket, classKey, classValue, geo.matchesGeo]);

  const runAnalysis = useCallback(async () => {
    const runId = ++runIdRef.current;
    setRunning(true);
    setResults([]);
    setSkipped([]);
    const tickers = [...universeTickers];
    setProgress({ done: 0, total: tickers.length, current: "" });
    const years = WINDOW_YEARS[windowKey];
    const computed: DistResult[] = [];
    const missed: string[] = [];
    for (let i = 0; i < tickers.length; i++) {
      if (runIdRef.current !== runId) return;
      const ticker = tickers[i];
      setProgress({ done: i, total: tickers.length, current: ticker });
      try {
        const series = await fetchMetricSeries(ticker, selectedMetric);
        const sliced = sliceByYears(series, years);
        // fetchMetricSeries returns RAW values — scale decimal-stored percent
        // metrics once so yields/growth read 5.0 (percent) not 0.050.
        const mult = metricMultiplier(selectedMetric);
        const vals: number[] = [];
        for (const pt of sliced) {
          if (pt.value != null && Number.isFinite(pt.value)) vals.push(pt.value * mult);
        }
        if (vals.length < 5) { missed.push(ticker); continue; }
        if (basis === "returns") {
          // Distribution of the metric's OWN daily log-returns + tail-risk stats.
          const rets = computeReturns(vals);
          if (rets.length < 5) { missed.push(ticker); continue; } // non-positive scale → n/a
          const curRet = rets[rets.length - 1];
          const sr = [...rets].sort((a, b) => a - b);
          const d = computeDistStats(ticker, rets, curRet, bins, [quantile(sr, 0.01), quantile(sr, 0.99)]);
          d.tail = computeTailStats(rets);
          d.isReturn = true;
          computed.push(d);
          continue;
        }
        let current = NaN;
        for (let j = sliced.length - 1; j >= 0; j--) {
          if (sliced[j].value != null && Number.isFinite(sliced[j].value)) {
            current = sliced[j].value * mult; break;
          }
        }
        if (!Number.isFinite(current)) { missed.push(ticker); continue; }
        // Clip the histogram domain to 1–99% (like Overlay/Box) so one outlier
        // doesn't squash the whole shape into a single bar.
        const sv = [...vals].sort((a, b) => a - b);
        computed.push(computeDistStats(ticker, vals, current, bins, [quantile(sv, 0.01), quantile(sv, 0.99)]));
      } catch {
        missed.push(ticker);
      }
    }
    if (runIdRef.current === runId) {
      setResults(computed);
      setSkipped(missed);
      setProgress({ done: tickers.length, total: tickers.length, current: "" });
      setRunning(false);
    }
  }, [universeTickers, selectedMetric, windowKey, bins, basis]);

  useEffect(() => {
    if (!autoRunRef.current && allTickers.length > 0 && universeTickers.length > 0) {
      autoRunRef.current = true;
      runAnalysis();
    }
  }, [allTickers.length, universeTickers, runAnalysis]);

  // Changing the Level/Returns basis re-fetches nothing but recomputes the series,
  // so re-run automatically (via a ref to avoid re-running on every metric change).
  const runRef = useRef(runAnalysis);
  runRef.current = runAnalysis;
  const basisInit = useRef(true);
  useEffect(() => {
    if (basisInit.current) { basisInit.current = false; return; }
    runRef.current();
  }, [basis]);

  // "Cheap-is-good" orientation for the selected metric (P/x low = cheap; yields flip).
  const lowIsCheap = useMemo(() => inferRerateMetric(selectedMetric).lowIsCheap, [selectedMetric]);

  // Peer (cross-sectional) view: the distribution of every name's CURRENT value
  // across the universe today, with each name's z / percentile vs that cross-section.
  const peerData = useMemo(() => {
    if (reference !== "peers") return null;
    const items = results.map(r => ({ ticker: r.ticker, value: r.current })).filter(i => Number.isFinite(i.value));
    if (items.length < 3) return null;
    const vals = items.map(i => i.value);
    const sorted = [...vals].sort((a, b) => a - b);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    const cross = computeDistStats(selectedMetric, vals, mean, bins, [quantile(sorted, 0.01), quantile(sorted, 0.99)]);
    const scored = items.map(i => {
      const below = vals.reduce((a, v) => a + (v < i.value ? 1 : 0), 0);
      const z = std > 0 ? (i.value - mean) / std : 0;
      return { ticker: i.ticker, value: i.value, z, pct: below / (vals.length - 1 || 1), richZ: lowIsCheap ? z : -z };
    });
    return { cross, scored, lowIsCheap, isReturn: results[0]?.isReturn ?? false };
  }, [reference, results, bins, selectedMetric, lowIsCheap]);

  // Own-history longs/shorts (for the Overlay side panel): orientation-aware z ranking.
  const historyScored = useMemo(() =>
    results.map(r => ({ ticker: r.ticker, value: r.current, z: r.z, pct: r.percentile, richZ: lowIsCheap ? r.z : -r.z })),
    [results, lowIsCheap]);

  const sortedResults = useMemo(() => {
    const copy = [...results];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "ticker": diff = a.ticker.localeCompare(b.ticker); break;
        case "current": diff = a.current - b.current; break;
        case "percentile": diff = a.percentile - b.percentile; break;
        case "z": diff = a.z - b.z; break;
        case "median": diff = a.median - b.median; break;
      }
      return diff * dir;
    });
    return copy;
  }, [results, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "ticker" ? "asc" : "desc"); }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="flex-shrink-0 border-b border-border/40 bg-card/40">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
          <div className="flex rounded border border-border/40 overflow-hidden">
            {([["metric", "Metric"], ["pair", "Pair Ratio"]] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-0.5 font-mono text-[11px] ${mode === m ? "bg-amber-500/15 text-amber-200" : "text-foreground/60 hover:bg-accent"}`}
                data-testid={`dist-mode-${m}`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "pair" && (
            <div className="flex items-center gap-1.5">
              <input
                value={pairInput}
                onChange={e => { setPairInput(e.target.value); setPairError(null); }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPair(); } }}
                placeholder="A/B (e.g. WELL/VTR)"
                className="bg-background border border-border/40 rounded px-2 py-0.5 font-mono text-foreground w-[160px]"
                data-testid="dist-pair-input"
              />
              {pairs.map(key => {
                const [a, b] = key.split("/");
                return (
                  <span
                    key={key}
                    data-testid={`dist-pair-chip-${a}-${b}`}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 font-mono text-[11px]"
                  >
                    {a}/{b}
                    <button
                      onClick={() => removePair(key)}
                      className="text-amber-200/60 hover:text-amber-100"
                      aria-label={`remove ${key}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {pairError && (
                <span data-testid="dist-pair-error" className="font-mono text-[10px] text-red-400/80">
                  {pairError}
                </span>
              )}
            </div>
          )}
          <label className={`flex items-center gap-1.5 text-foreground/60 ${mode === "pair" ? "hidden" : ""}`}>
            <span className="font-mono uppercase tracking-wide">Metric</span>
            <select
              value={selectedMetric}
              onChange={e => { metricLockedRef.current = true; setSelectedMetric(e.target.value); }}
              className="bg-background border border-border/40 rounded px-2 py-0.5 font-mono text-foreground"
              data-testid="dist-metric"
            >
              {metricGroups.map(({ category, metrics }) => (
                <optgroup key={category} label={category}>
                  {metrics.map(m => <option key={m} value={m}>{m}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className={`flex items-center gap-1 border-l border-border/30 pl-2 ml-1 ${mode === "pair" ? "hidden" : ""}`}>
            <span className="text-foreground/60 font-mono uppercase tracking-wide">Universe</span>
            <div className="flex rounded border border-border/40 overflow-hidden">
              {["workbook", "basket", "classification"].map(m => (
                <button
                  key={m}
                  onClick={() => setUniverseMode(m)}
                  className={`px-2 py-0.5 font-mono text-[11px] ${universeMode === m ? "bg-amber-500/15 text-amber-200" : "text-foreground/60 hover:bg-accent"}`}
                  data-testid={`dist-universe-${m}`}
                >
                  {m === "workbook" ? "All" : m === "basket" ? "Basket" : "Class"}
                </button>
              ))}
            </div>
            {universeMode === "basket" && (
              <select
                value={selectedBasket}
                onChange={e => setSelectedBasket(e.target.value)}
                className="bg-background border border-border/40 rounded px-2 py-0.5 font-mono"
              >
                {baskets.length === 0 && <option value="">(no baskets)</option>}
                {baskets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {universeMode === "classification" && (
              <>
                <select
                  value={classKey}
                  onChange={e => setClassKey(e.target.value)}
                  className="bg-background border border-border/40 rounded px-2 py-0.5 font-mono"
                >
                  {CLASSIFICATION_KEYS.map((k: string) => <option key={k} value={k}>{k}</option>)}
                </select>
                <select
                  value={classValue}
                  onChange={e => setClassValue(e.target.value)}
                  className="bg-background border border-border/40 rounded px-2 py-0.5 font-mono max-w-[160px]"
                >
                  {classValues.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </>
            )}
            <span className="text-foreground/40 font-mono ml-1">{universeTickers.length} tickers</span>
          </div>
          <div className={`flex items-center gap-1.5 border-l border-border/30 pl-2 ml-1 ${mode === "pair" ? "hidden" : ""}`}>
            <span className="text-foreground/60 font-mono uppercase tracking-wide">Geo</span>
            {geo.geoFilterUI}
          </div>
          <div className="flex items-center gap-1 border-l border-border/30 pl-2 ml-1">
            <span className="text-foreground/60 font-mono uppercase tracking-wide">Window</span>
            <div className="flex rounded border border-border/40 overflow-hidden">
              {["1Y", "3Y", "5Y", "All"].map(w => (
                <button
                  key={w}
                  onClick={() => setWindowKey(w)}
                  className={`px-2 py-0.5 font-mono text-[11px] ${windowKey === w ? "bg-amber-500/15 text-amber-200" : "text-foreground/60 hover:bg-accent"}`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className={`flex items-center gap-1 border-l border-border/30 pl-2 ml-1 ${mode === "pair" ? "hidden" : ""}`}>
            <span className="text-foreground/60 font-mono uppercase tracking-wide">Basis</span>
            <div className="flex rounded border border-border/40 overflow-hidden">
              {([["level", "Level"], ["returns", "Returns"]] as const).map(([b, label]) => (
                <button
                  key={b}
                  onClick={() => setBasis(b)}
                  className={`px-2 py-0.5 font-mono text-[11px] ${basis === b ? "bg-amber-500/15 text-amber-200" : "text-foreground/60 hover:bg-accent"}`}
                  data-testid={`dist-basis-${b}`}
                  title={b === "returns" ? "Distribution of each name's daily log-returns + tail risk (positive-scale metrics only)" : "Distribution of the metric's level"}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={`flex items-center gap-1 border-l border-border/30 pl-2 ml-1 ${mode === "pair" ? "hidden" : ""}`}>
            <span className="text-foreground/60 font-mono uppercase tracking-wide">Ref</span>
            <div className="flex rounded border border-border/40 overflow-hidden">
              {([["history", "Own hist"], ["peers", "Peers now"]] as const).map(([rf, label]) => (
                <button
                  key={rf}
                  onClick={() => setReference(rf)}
                  className={`px-2 py-0.5 font-mono text-[11px] ${reference === rf ? "bg-amber-500/15 text-amber-200" : "text-foreground/60 hover:bg-accent"}`}
                  data-testid={`dist-ref-${rf}`}
                  title={rf === "peers" ? "Cross-section: where each name sits vs its peers right now" : "Where each name sits vs its own history"}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={`flex items-center gap-1 border-l border-border/30 pl-2 ml-1 ${mode === "pair" || reference === "peers" ? "hidden" : ""}`}>
            <span className="text-foreground/60 font-mono uppercase tracking-wide">View</span>
            <div className="flex rounded border border-border/40 overflow-hidden">
              {[["small", "Small Multiples"], ["overlay", "Overlay"], ["box", "Box / Violin"]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2 py-0.5 font-mono text-[11px] ${view === v ? "bg-amber-500/15 text-amber-200" : "text-foreground/60 hover:bg-accent"}`}
                  data-testid={`dist-view-${v}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {(mode === "pair" || view === "small" || view === "overlay") && (
            <div className="flex items-center gap-1.5 border-l border-border/30 pl-2 ml-1">
              <span className="text-foreground/60 font-mono uppercase tracking-wide">Bins</span>
              <input
                type="range" min={10} max={80} step={1} value={bins}
                onChange={e => setBins(Number(e.target.value))}
                className="w-24"
              />
              <span className="font-mono w-6 text-right text-foreground/80">{bins}</span>
            </div>
          )}
          <div className="flex-1" />
          {mode === "metric" && (
            <button
              onClick={runAnalysis}
              disabled={running || universeTickers.length === 0}
              className="flex items-center gap-1 px-3 py-1 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-50 font-mono text-xs"
              data-testid="dist-run"
            >
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayIcon className="w-3 h-3" />}
              Run
            </button>
          )}
        </div>
        <div className="px-3 pb-1.5 text-[11px] font-mono text-foreground/50 flex items-center gap-3">
          {mode === "pair" ? (
            <>
              <span>
                {pairRunning ? "Computing pairs…" : `${pairResults.length} pair${pairResults.length === 1 ? "" : "s"}`}
              </span>
              <span className="text-foreground/40">Ratio daily log-returns · window {windowKey}</span>
            </>
          ) : (
            <>
              {running ? (
                <span>Computing {progress.done}/{progress.total} · {progress.current}…</span>
              ) : (
                <span>
                  {results.length} computed
                  {skipped.length > 0 && ` · ${skipped.length} n/a (${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? "…" : ""})`}
                </span>
              )}
              <span className="text-foreground/40">
                Metric: <span className="text-foreground/70">{selectedMetric}</span>
                {" · "}<span className="text-foreground/70">{basis === "returns" ? "daily log-returns" : "level"}</span>
                {" · "}<span className="text-foreground/70">{reference === "peers" ? "vs peers now" : "vs own history"}</span>
              </span>
            </>
          )}
          {mode === "metric" && reference === "history" && (view === "small" || view === "box") && (
            <div className="ml-auto flex items-center gap-1">
              <span className="text-foreground/40">Sort:</span>
              {["ticker", "current", "percentile", "z", "median"].map(key => (
                <button
                  key={key}
                  onClick={() => handleSort(key)}
                  className={`px-1.5 py-0.5 rounded font-mono ${sortKey === key ? "bg-amber-500/15 text-amber-200" : "text-foreground/50 hover:text-foreground/80"}`}
                >
                  {key}{sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {mode === "pair" && (
          <>
            {pairs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-foreground/40 font-mono text-xs">
                Add a pair above (e.g. WELL/VTR) to see its ratio return distribution.
              </div>
            ) : (
              <div
                className="grid gap-2 p-2"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
              >
                {pairResults.map(p => <PairCard key={p.key} p={p} />)}
              </div>
            )}
          </>
        )}
        {mode === "metric" && running && results.length === 0 && (
          <div className="h-full flex items-center justify-center text-foreground/60 font-mono text-xs gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Computing distribution for {selectedMetric}…
          </div>
        )}
        {mode === "metric" && results.length === 0 && !running && skipped.length > 0 && (
          <div className="h-full flex flex-col items-center justify-center text-foreground/50 font-mono text-xs gap-1 px-6 text-center">
            <div>No tickers in this universe report {selectedMetric}.</div>
            <div className="text-foreground/35">
              All {skipped.length} tickers returned n/a. Try a different metric in the sidebar.
            </div>
          </div>
        )}
        {mode === "metric" && results.length === 0 && !running && skipped.length === 0 && (
          <div className="h-full flex items-center justify-center text-foreground/40 font-mono text-xs">
            No data yet — click Run.
          </div>
        )}
        {mode === "metric" && reference === "peers" && results.length > 0 && peerData && (
          <PeerView peer={peerData} metric={selectedMetric} hoverTicker={hoverTicker} setHoverTicker={setHoverTicker} />
        )}
        {mode === "metric" && reference === "history" && view === "small" && results.length > 0 && <SmallMultiplesView results={sortedResults} />}
        {mode === "metric" && reference === "history" && view === "overlay" && results.length > 0 && (
          <OverlayView results={results} hoverTicker={hoverTicker} setHoverTicker={setHoverTicker} metric={selectedMetric} lowIsCheap={lowIsCheap} isReturn={results[0]?.isReturn ?? false} />
        )}
        {mode === "metric" && reference === "history" && view === "box" && results.length > 0 && <BoxView results={sortedResults} metric={selectedMetric} />}
      </div>
    </div>
  );
}
