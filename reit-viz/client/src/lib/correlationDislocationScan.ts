/**
 * Cross-timeframe correlation dislocation scanner.
 *
 * For every pair in a ticker scope, compute rolling correlations of log
 * returns on hourly / daily / weekly bars, score each timeframe's CURRENT
 * rolling correlation against that timeframe's own history (z-score +
 * percentile), and flag pairs where one timeframe has dislocated
 * (|z| ≥ zThreshold) while an anchor timeframe is in line
 * (|z| ≤ anchorThreshold). For historically-correlated pairs that have
 * DE-correlated, the recent return spread names leader vs laggard, framing
 * a long/short reconvergence idea.
 *
 * All client-side; hourly uses the cached Yahoo 60-min bars.
 */

import { resolveSeriesDataStatic, DataPoint } from "./macroStatic";
import { fetchIntradayBars } from "./fetchIntradayBars";
import { downsampleSeries } from "./chartFrequency";

export type ScanTF = "hourly" | "daily" | "weekly";

export interface TFScanStat {
  last: number;   // current rolling ρ
  mean: number;   // history mean of the rolling series
  sd: number;
  z: number;
  pct: number;    // percentile of last within history (0–100)
  n: number;      // rolling-series length
}

export interface DislocationRow {
  a: string;
  b: string;
  /** History mean of the DAILY rolling correlation — the pair's "normal". */
  histCorr: number;
  tf: Partial<Record<ScanTF, TFScanStat>>;
  /** Most dislocated timeframe. */
  worstTF: ScanTF;
  /** The in-line anchor timeframe used for the gap. */
  anchorTF: ScanTF;
  zGap: number;
  kind: "decorrelated" | "hypercorrelated";
  /** Return spread (retA − retB, cumulative log return) over the worst TF's window. */
  spreadRet: number;
  leader: string;
  laggard: string;
  suggestion: string;
  score: number;
  rank: number;
}

export interface DislocationScanResult {
  rows: DislocationRow[];
  totalPairs: number;
  scannedPairs: number;
  tickers: number;
  window: number;
  durationMs: number;
  skipped: { noHourly: number; shortHistory: number };
}

export interface DislocationScanOptions {
  tickers: string[];
  /** Rolling window in bars of each timeframe. */
  window?: number;
  /** |z| needed on the dislocated timeframe. */
  zThreshold?: number;
  /** |z| ceiling for the anchor timeframe to count as "in line". */
  anchorThreshold?: number;
  /** Minimum |daily history mean ρ| for a pair to be considered "typically correlated". */
  minBaselineCorr?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, phase: "load" | "scan") => void;
}

const MAX_PAIRS = 8000;

// ── Small numeric helpers ────────────────────────────────────────────────────

/** Consecutive log returns keyed by the LATER bar's time. */
function logReturnsKeyed(points: { time: string; value: number }[]): { t: string; v: number }[] {
  const out: { t: string; v: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1].value;
    const p1 = points[i].value;
    if (p0 > 0 && p1 > 0 && Number.isFinite(p0) && Number.isFinite(p1)) {
      out.push({ t: points[i].time, v: Math.log(p1 / p0) });
    }
  }
  return out;
}

/** O(n) rolling Pearson correlation via running sums. Returns arr aligned to
 *  index w-1..n-1 (length n-w+1). */
function rollingCorr(x: number[], y: number[], w: number): number[] {
  const n = Math.min(x.length, y.length);
  if (n < w) return [];
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; syy += y[i] * y[i]; sxy += x[i] * y[i];
    if (i >= w) {
      const j = i - w;
      sx -= x[j]; sy -= y[j]; sxx -= x[j] * x[j]; syy -= y[j] * y[j]; sxy -= x[j] * y[j];
    }
    if (i >= w - 1) {
      const cov = sxy - (sx * sy) / w;
      const vx = sxx - (sx * sx) / w;
      const vy = syy - (sy * sy) / w;
      const den = Math.sqrt(Math.max(vx, 0) * Math.max(vy, 0));
      out.push(den > 1e-12 ? Math.max(-1, Math.min(1, cov / den)) : 0);
    }
  }
  return out;
}

function statsOf(rolling: number[]): TFScanStat | null {
  const n = rolling.length;
  if (n < 30) return null;
  const last = rolling[n - 1];
  let s = 0;
  for (const v of rolling) s += v;
  const mean = s / n;
  let ss = 0;
  for (const v of rolling) ss += (v - mean) * (v - mean);
  const sd = Math.sqrt(ss / n);
  if (sd < 1e-9) return null;
  let below = 0;
  for (const v of rolling) if (v <= last) below++;
  return { last, mean, sd, z: (last - mean) / sd, pct: (below / n) * 100, n };
}

/** Align two keyed return series on shared time keys. */
function alignReturns(
  a: { t: string; v: number }[],
  bMap: Map<string, number>
): { x: number[]; y: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  for (const p of a) {
    const bv = bMap.get(p.t);
    if (bv !== undefined) { x.push(p.v); y.push(bv); }
  }
  return { x, y };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── Scanner ──────────────────────────────────────────────────────────────────

interface TickerData {
  ticker: string;
  rets: Record<ScanTF, { t: string; v: number }[]>;
  retMaps: Record<ScanTF, Map<string, number>>;
  hasHourly: boolean;
}

export async function runDislocationScan(opts: DislocationScanOptions): Promise<DislocationScanResult> {
  const {
    tickers,
    window = 60,
    zThreshold = 1.5,
    anchorThreshold = 0.75,
    minBaselineCorr = 0.3,
    signal,
    onProgress,
  } = opts;
  const t0 = performance.now();
  const uniq = [...new Set(tickers)].filter(Boolean);
  const totalPairs = (uniq.length * (uniq.length - 1)) / 2;
  if (uniq.length < 2) throw new Error("Need at least 2 tickers to scan pairs.");
  if (totalPairs > MAX_PAIRS) {
    throw new Error(`${totalPairs.toLocaleString()} pairs is too many — narrow the scope (max ${MAX_PAIRS.toLocaleString()}).`);
  }

  // ── Phase 1: load per-ticker series on all three timeframes ──
  let loaded = 0;
  const data: (TickerData | null)[] = await mapLimit(uniq, 6, async (ticker) => {
    throwIfAborted(signal);
    try {
      const daily = await resolveSeriesDataStatic(`${ticker}:close`);
      if (!daily || daily.length < window + 40) return null;
      const weekly = downsampleSeries(daily as DataPoint[], "weekly");
      let hourlyPts: { time: string; value: number }[] = [];
      try {
        const bars = await fetchIntradayBars(ticker);
        hourlyPts = (bars || [])
          .filter((b) => Number.isFinite(b.close))
          .map((b) => ({ time: String(b.time), value: b.close }));
      } catch { /* no intraday — hourly leg unavailable for this ticker */ }
      const rets: TickerData["rets"] = {
        hourly: logReturnsKeyed(hourlyPts),
        daily: logReturnsKeyed(daily as DataPoint[]),
        weekly: logReturnsKeyed(weekly as DataPoint[]),
      };
      const retMaps: TickerData["retMaps"] = {
        hourly: new Map(rets.hourly.map((p) => [p.t, p.v])),
        daily: new Map(rets.daily.map((p) => [p.t, p.v])),
        weekly: new Map(rets.weekly.map((p) => [p.t, p.v])),
      };
      return { ticker, rets, retMaps, hasHourly: rets.hourly.length >= window + 30 };
    } catch {
      return null;
    } finally {
      loaded++;
      onProgress?.(loaded, uniq.length, "load");
    }
  });
  throwIfAborted(signal);

  const good = data.filter((d): d is TickerData => d !== null);
  const rows: DislocationRow[] = [];
  const skipped = { noHourly: 0, shortHistory: 0 };

  // ── Phase 2: scan pairs ──
  const TFS: ScanTF[] = ["hourly", "daily", "weekly"];
  let done = 0;
  const pairTotal = (good.length * (good.length - 1)) / 2;
  for (let i = 0; i < good.length; i++) {
    for (let j = i + 1; j < good.length; j++) {
      const A = good[i];
      const B = good[j];
      done++;
      if (done % 250 === 0) {
        onProgress?.(done, pairTotal, "scan");
        // Yield so the UI (progress bar, cancel) stays responsive.
        await new Promise((r) => setTimeout(r, 0));
        throwIfAborted(signal);
      }

      const tfStats: Partial<Record<ScanTF, TFScanStat>> = {};
      for (const tf of TFS) {
        if (tf === "hourly" && (!A.hasHourly || !B.hasHourly)) continue;
        const { x, y } = alignReturns(A.rets[tf], B.retMaps[tf]);
        if (x.length < window + 30) continue;
        const st = statsOf(rollingCorr(x, y, window));
        if (st) tfStats[tf] = st;
      }

      const daily = tfStats.daily;
      if (!daily) { skipped.shortHistory++; continue; }
      if (!tfStats.hourly && !tfStats.weekly) { skipped.noHourly++; continue; }
      // "Typically correlated" gate — the trade framing needs a real baseline.
      if (Math.abs(daily.mean) < minBaselineCorr) continue;

      // Find the most dislocated TF with an in-line anchor on another TF.
      let worst: ScanTF | null = null;
      let anchor: ScanTF | null = null;
      let bestGap = 0;
      const avail = TFS.filter((tf) => tfStats[tf]);
      for (const tf of avail) {
        const zi = tfStats[tf]!.z;
        if (Math.abs(zi) < zThreshold) continue;
        for (const other of avail) {
          if (other === tf) continue;
          const zo = tfStats[other]!.z;
          if (Math.abs(zo) > anchorThreshold) continue;
          const gap = Math.abs(zi - zo);
          if (gap > bestGap) { bestGap = gap; worst = tf; anchor = other; }
        }
      }
      if (!worst || !anchor) continue;

      const worstStat = tfStats[worst]!;
      const kind: DislocationRow["kind"] = worstStat.z < 0 ? "decorrelated" : "hypercorrelated";

      // Return spread over the dislocated TF's window (cumulative log return).
      const sumTail = (rets: { t: string; v: number }[], k: number) => {
        let s = 0;
        for (let m = Math.max(0, rets.length - k); m < rets.length; m++) s += rets[m].v;
        return s;
      };
      const retA = sumTail(A.rets[worst], window);
      const retB = sumTail(B.rets[worst], window);
      const spreadRet = retA - retB;
      const leader = spreadRet >= 0 ? A.ticker : B.ticker;
      const laggard = spreadRet >= 0 ? B.ticker : A.ticker;

      let suggestion: string;
      if (kind === "decorrelated" && daily.mean > 0) {
        suggestion = `Reconvergence: LONG ${laggard} / SHORT ${leader}`;
      } else if (kind === "decorrelated") {
        suggestion = "Inverse pair broke down — review by hand";
      } else {
        suggestion = daily.mean > 0
          ? "Co-movement unusually tight — crowding / regime shift watch"
          : "Inverse pair moving together — hedge breakdown watch";
      }

      const score = bestGap * (0.5 + Math.abs(daily.mean));
      rows.push({
        a: A.ticker,
        b: B.ticker,
        histCorr: daily.mean,
        tf: tfStats,
        worstTF: worst,
        anchorTF: anchor,
        zGap: bestGap,
        kind,
        spreadRet,
        leader,
        laggard,
        suggestion,
        score,
        rank: 0,
      });
    }
  }
  onProgress?.(pairTotal, pairTotal, "scan");

  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, idx) => { r.rank = idx + 1; });

  return {
    rows,
    totalPairs,
    scannedPairs: pairTotal,
    tickers: good.length,
    window,
    durationMs: Math.round(performance.now() - t0),
    skipped,
  };
}

export function dislocationScanToCsv(result: DislocationScanResult): string {
  const header = [
    "rank", "a", "b", "hist_daily_corr", "kind", "worst_tf", "anchor_tf", "z_gap",
    "hourly_rho", "hourly_z", "daily_rho", "daily_z", "weekly_rho", "weekly_z",
    "spread_ret", "leader", "laggard", "suggestion", "score",
  ].join(",");
  const lines = result.rows.map((r) => [
    r.rank, r.a, r.b, r.histCorr.toFixed(4), r.kind, r.worstTF, r.anchorTF, r.zGap.toFixed(3),
    r.tf.hourly ? r.tf.hourly.last.toFixed(4) : "", r.tf.hourly ? r.tf.hourly.z.toFixed(3) : "",
    r.tf.daily ? r.tf.daily.last.toFixed(4) : "", r.tf.daily ? r.tf.daily.z.toFixed(3) : "",
    r.tf.weekly ? r.tf.weekly.last.toFixed(4) : "", r.tf.weekly ? r.tf.weekly.z.toFixed(3) : "",
    r.spreadRet.toFixed(4), r.leader, r.laggard, `"${r.suggestion}"`, r.score.toFixed(3),
  ].join(","));
  return [header, ...lines].join("\n");
}
