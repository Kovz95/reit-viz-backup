/**
 * Correlation dislocation / pairs scanner — five modes for long/short idea
 * generation, all client-side:
 *
 *  crossTF    One timeframe's rolling correlation broke from its own history
 *             while another timeframe stays in line (1H / D / W).
 *  breakdown  Daily-only: typically-correlated pairs whose CURRENT rolling ρ
 *             collapsed below its own history and is still falling.
 *  spreadZ    The true reconvergence screen: correlation INTACT, but the
 *             log-price spread is at a multi-sigma extreme vs its own history,
 *             gated on the spread actually being mean-reverting (DF test).
 *  recoupling Previously broken pairs whose correlation is healing (ρ z still
 *             depressed but Δρ turning up) — entry timing for reconvergence.
 *  idio       Single names decoupling from their subindustry peer group:
 *             average peer correlation collapsed vs history; the relative
 *             return direction frames a LONG or SHORT candidate.
 *
 * Direction evidence computed for every pair row:
 *  - spread mean-reversion (Dickey-Fuller t-stat on the log ratio) + half-life
 *  - per-leg "who moved" z-scores (window return vs that leg's own history)
 * Suggestions are evidence-aware: reversion framing only when the spread has
 * a statistical basis to revert; otherwise the row points at the abnormal leg.
 *
 * Hourly legs (crossTF only) use the cached FMP-depth intraday store.
 */

import { resolveSeriesDataStatic, DataPoint } from "./macroStatic";
import { fetchIntradayBars } from "./fetchIntradayBars";
import { downsampleSeries } from "./chartFrequency";

export type ScanTF = "hourly" | "daily" | "weekly";
export type ScanMode = "crossTF" | "breakdown" | "spreadZ" | "recoupling" | "idio";

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
  /** Change in the DAILY rolling ρ over the last `slopeBars` bars — negative =
   *  the correlation is curving downwards right now. */
  corrDelta: number | null;
  /** Current log-price spread z vs its own full history. */
  spreadZ: number | null;
  /** Spread mean-reversion half-life in trading days (null if not MR). */
  spreadHalfLife: number | null;
  /** Dickey-Fuller says the spread is mean-reverting (t ≤ −2.86, HL < 1y). */
  spreadMR: boolean;
  /** "Who moved": each leg's window return z-scored vs its own history. */
  legZA: number | null;
  legZB: number | null;
  kind: "decorrelated" | "hypercorrelated" | "stretched" | "recoupling";
  /** Return spread (retA − retB, cumulative log return) over the worst TF's window. */
  spreadRet: number;
  leader: string;
  laggard: string;
  suggestion: string;
  score: number;
  rank: number;
}

export interface IdioRow {
  ticker: string;
  group: string;      // subindustry
  peers: number;
  histAvgCorr: number;
  curAvgCorr: number;
  z: number;
  pct: number;
  /** Window return of the name minus the peer-group average (log, cumulative). */
  relRet: number;
  side: "LONG candidate" | "SHORT candidate";
  score: number;
  rank: number;
}

export interface DislocationScanResult {
  mode: ScanMode;
  rows: DislocationRow[];
  idioRows: IdioRow[];
  totalPairs: number;
  scannedPairs: number;
  tickers: number;
  window: number;
  durationMs: number;
  skipped: { noHourly: number; shortHistory: number };
}

export interface DislocationScanOptions {
  tickers: string[];
  /** ticker → subindustry (etc.) metadata; required for idio mode grouping. */
  tickerMeta?: { ticker: string; subindustry?: string }[];
  /** Rolling window in bars of each timeframe. */
  window?: number;
  /** Main threshold: dislocation |z| (crossTF/breakdown/recoupling/idio) or
   *  spread |z| (spreadZ). */
  zThreshold?: number;
  /** crossTF: anchor TF |z| ceiling. spreadZ: correlation-intact |z| ceiling. */
  anchorThreshold?: number;
  /** Minimum daily history mean ρ for a pair to be "typically correlated". */
  minBaselineCorr?: number;
  mode?: ScanMode;
  /** Bars used for the recent-corr-change (Δρ) measure. Default 20. */
  slopeBars?: number;
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

function statsOf(series: number[]): TFScanStat | null {
  const n = series.length;
  if (n < 30) return null;
  const last = series[n - 1];
  let s = 0;
  for (const v of series) s += v;
  const mean = s / n;
  let ss = 0;
  for (const v of series) ss += (v - mean) * (v - mean);
  const sd = Math.sqrt(ss / n);
  if (sd < 1e-9) return null;
  let below = 0;
  for (const v of series) if (v <= last) below++;
  return { last, mean, sd, z: (last - mean) / sd, pct: (below / n) * 100, n };
}

/** Align two keyed series on shared time keys. */
function alignKeyed(
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

/** Dickey-Fuller AR(1) test on a (log-spread) series: Δr_t = φ·(r_{t−1}−μ)+ε.
 *  Returns φ's t-stat and the implied mean-reversion half-life. */
function spreadMRTest(r: number[]): { tstat: number; halfLife: number | null } {
  const n = r.length;
  if (n < 60) return { tstat: 0, halfLife: null };
  let mean = 0;
  for (const v of r) mean += v;
  mean /= n;
  let sxx = 0, sxy = 0;
  for (let i = 1; i < n; i++) {
    const x = r[i - 1] - mean;
    sxx += x * x;
    sxy += (r[i] - r[i - 1]) * x;
  }
  if (sxx < 1e-12) return { tstat: 0, halfLife: null };
  const phi = sxy / sxx;
  let rss = 0;
  for (let i = 1; i < n; i++) {
    const resid = (r[i] - r[i - 1]) - phi * (r[i - 1] - mean);
    rss += resid * resid;
  }
  const se = Math.sqrt(rss / (n - 2) / sxx);
  const tstat = se > 1e-12 ? phi / se : 0;
  const halfLife = phi < 0 && phi > -1 ? -Math.log(2) / Math.log(1 + phi) : null;
  return { tstat, halfLife };
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
  /** Daily LOG prices, keyed (for spread analytics). */
  logPx: { t: string; v: number }[];
  logPxMap: Map<string, number>;
  hasHourly: boolean;
  /** Current window return z vs this ticker's own history of window returns. */
  legZ: number | null;
  /** Current window cumulative log return (daily). */
  legWindowRet: number;
}

/** Rolling window-sum series of daily returns → z of the LAST window vs history. */
function legMoveStats(rets: { t: string; v: number }[], window: number): { z: number | null; lastRet: number } {
  const n = rets.length;
  if (n < window + 30) {
    let s = 0;
    for (let i = Math.max(0, n - window); i < n; i++) s += rets[i].v;
    return { z: null, lastRet: s };
  }
  const sums: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += rets[i].v;
    if (i >= window) s -= rets[i - window].v;
    if (i >= window - 1) sums.push(s);
  }
  const st = statsOf(sums);
  return { z: st ? st.z : null, lastRet: sums[sums.length - 1] };
}

export async function runDislocationScan(opts: DislocationScanOptions): Promise<DislocationScanResult> {
  const {
    tickers,
    tickerMeta = [],
    window = 60,
    zThreshold = 1.5,
    anchorThreshold = 0.75,
    minBaselineCorr = 0.3,
    mode = "crossTF",
    slopeBars = 20,
    signal,
    onProgress,
  } = opts;
  const t0 = performance.now();
  const uniq = [...new Set(tickers)].filter(Boolean);
  const totalPairs = (uniq.length * (uniq.length - 1)) / 2;
  if (uniq.length < 2) throw new Error("Need at least 2 tickers to scan.");
  if (mode !== "idio" && totalPairs > MAX_PAIRS) {
    throw new Error(`${totalPairs.toLocaleString()} pairs is too many — narrow the scope (max ${MAX_PAIRS.toLocaleString()}).`);
  }

  // ── Phase 1: load per-ticker series ──
  let loaded = 0;
  const data: (TickerData | null)[] = await mapLimit(uniq, 6, async (ticker) => {
    throwIfAborted(signal);
    try {
      const daily = await resolveSeriesDataStatic(`${ticker}:close`);
      if (!daily || daily.length < window + 40) return null;
      const weekly = downsampleSeries(daily as DataPoint[], "weekly");
      let hourlyPts: { time: string; value: number }[] = [];
      if (mode === "crossTF") {
        try {
          const bars = await fetchIntradayBars(ticker);
          hourlyPts = (bars || [])
            .filter((b) => Number.isFinite(b.close))
            .map((b) => ({ time: String(b.time), value: b.close }));
        } catch { /* no intraday — hourly leg unavailable for this ticker */ }
      }
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
      const logPx = (daily as DataPoint[])
        .filter((p) => Number.isFinite(p.value) && p.value > 0)
        .map((p) => ({ t: p.time, v: Math.log(p.value) }));
      const lm = legMoveStats(rets.daily, window);
      return {
        ticker,
        rets,
        retMaps,
        logPx,
        logPxMap: new Map(logPx.map((p) => [p.t, p.v])),
        hasHourly: rets.hourly.length >= window + 30,
        legZ: lm.z,
        legWindowRet: lm.lastRet,
      };
    } catch {
      return null;
    } finally {
      loaded++;
      onProgress?.(loaded, uniq.length, "load");
    }
  });
  throwIfAborted(signal);

  const good = data.filter((d): d is TickerData => d !== null);
  const skipped = { noHourly: 0, shortHistory: 0 };
  const fmt1 = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(1);

  // ── Idio mode: names decoupling from their subindustry peer group ──
  if (mode === "idio") {
    const subOf = new Map(tickerMeta.map((m) => [m.ticker, m.subindustry || ""]));
    const groups = new Map<string, TickerData[]>();
    for (const d of good) {
      const g = subOf.get(d.ticker) || "";
      if (!g) continue;
      const arr = groups.get(g);
      if (arr) arr.push(d);
      else groups.set(g, [d]);
    }
    const idioRows: IdioRow[] = [];
    let doneGroups = 0;
    const groupList = [...groups.entries()].filter(([, mem]) => mem.length >= 4);
    for (const [group, members] of groupList) {
      throwIfAborted(signal);
      doneGroups++;
      onProgress?.(doneGroups, groupList.length, "scan");
      await new Promise((r) => setTimeout(r, 0));
      // Pairwise rolling corr arrays within the group
      const pairArr = new Map<string, number[]>();
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const { x, y } = alignKeyed(members[i].rets.daily, members[j].retMaps.daily);
          if (x.length < window + 30) continue;
          pairArr.set(`${i}|${j}`, rollingCorr(x, y, window));
        }
      }
      const groupRetAvg = members.reduce((s, m) => s + m.legWindowRet, 0) / members.length;
      for (let i = 0; i < members.length; i++) {
        // Average this member's pair-corr series across peers (tail-aligned)
        const arrs: number[][] = [];
        for (let j = 0; j < members.length; j++) {
          if (j === i) continue;
          const a = pairArr.get(`${Math.min(i, j)}|${Math.max(i, j)}`);
          if (a && a.length >= 30) arrs.push(a);
        }
        if (arrs.length < 2) continue;
        const L = Math.min(...arrs.map((a) => a.length));
        const avg: number[] = new Array(L).fill(0);
        for (const a of arrs) {
          const off = a.length - L;
          for (let k = 0; k < L; k++) avg[k] += a[off + k];
        }
        for (let k = 0; k < L; k++) avg[k] /= arrs.length;
        const st = statsOf(avg);
        if (!st) continue;
        if (st.mean < minBaselineCorr) continue;
        if (st.z > -zThreshold) continue;
        const relRet = members[i].legWindowRet - groupRetAvg;
        idioRows.push({
          ticker: members[i].ticker,
          group,
          peers: arrs.length,
          histAvgCorr: st.mean,
          curAvgCorr: st.last,
          z: st.z,
          pct: st.pct,
          relRet,
          side: relRet < 0 ? "SHORT candidate" : "LONG candidate",
          score: Math.abs(st.z) * (0.5 + st.mean) * (1 + Math.min(1, Math.abs(relRet) * 4)),
          rank: 0,
        });
      }
    }
    idioRows.sort((a, b) => b.score - a.score);
    idioRows.forEach((r, idx) => { r.rank = idx + 1; });
    return {
      mode,
      rows: [],
      idioRows,
      totalPairs,
      scannedPairs: 0,
      tickers: good.length,
      window,
      durationMs: Math.round(performance.now() - t0),
      skipped,
    };
  }

  // ── Pair modes ──
  const rows: DislocationRow[] = [];
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
        await new Promise((r) => setTimeout(r, 0));
        throwIfAborted(signal);
      }

      const tfStats: Partial<Record<ScanTF, TFScanStat>> = {};
      let dailyRolling: number[] | null = null;
      for (const tf of TFS) {
        if (tf === "hourly" && (mode !== "crossTF" || !A.hasHourly || !B.hasHourly)) continue;
        const { x, y } = alignKeyed(A.rets[tf], B.retMaps[tf]);
        if (x.length < window + 30) continue;
        const arr = rollingCorr(x, y, window);
        if (tf === "daily") dailyRolling = arr;
        const st = statsOf(arr);
        if (st) tfStats[tf] = st;
      }

      const daily = tfStats.daily;
      if (!daily) { skipped.shortHistory++; continue; }
      const corrDelta =
        dailyRolling && dailyRolling.length > slopeBars
          ? Math.round((dailyRolling[dailyRolling.length - 1] - dailyRolling[dailyRolling.length - 1 - slopeBars]) * 10000) / 10000
          : null;

      // Spread analytics (direction evidence for every pair mode)
      const px = alignKeyed(A.logPx, B.logPxMap);
      let spreadStats: TFScanStat | null = null;
      let mr: { tstat: number; halfLife: number | null } = { tstat: 0, halfLife: null };
      if (px.x.length >= 60) {
        const ratio: number[] = new Array(px.x.length);
        for (let k = 0; k < px.x.length; k++) ratio[k] = px.x[k] - px.y[k];
        spreadStats = statsOf(ratio);
        mr = spreadMRTest(ratio);
      }
      const spreadMR = mr.tstat <= -2.86 && mr.halfLife != null && mr.halfLife < 252;
      const halfLife = mr.halfLife != null ? Math.round(mr.halfLife) : null;

      let worst: ScanTF | null = null;
      let anchor: ScanTF | null = null;
      let bestGap = 0;
      let kind: DislocationRow["kind"];

      if (mode === "breakdown") {
        if (daily.mean < minBaselineCorr) continue;
        if (daily.z > -zThreshold) continue;
        if (corrDelta != null && corrDelta > 0) continue;
        worst = "daily"; anchor = "daily"; bestGap = Math.abs(daily.z);
        kind = "decorrelated";
      } else if (mode === "spreadZ") {
        // Relationship INTACT + spread stretched + statistically mean-reverting.
        if (daily.mean < minBaselineCorr) continue;
        if (Math.abs(daily.z) > anchorThreshold) continue;
        if (!spreadStats || Math.abs(spreadStats.z) < zThreshold) continue;
        if (!spreadMR) continue;
        worst = "daily"; anchor = "daily"; bestGap = Math.abs(spreadStats.z);
        kind = "stretched";
      } else if (mode === "recoupling") {
        if (daily.mean < minBaselineCorr) continue;
        if (daily.z > -zThreshold) continue;           // still depressed…
        if (corrDelta == null || corrDelta < 0.02) continue; // …but healing
        worst = "daily"; anchor = "daily"; bestGap = Math.abs(daily.z);
        kind = "recoupling";
      } else {
        if (!tfStats.hourly && !tfStats.weekly) { skipped.noHourly++; continue; }
        if (Math.abs(daily.mean) < minBaselineCorr) continue;
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
        kind = tfStats[worst]!.z < 0 ? "decorrelated" : "hypercorrelated";
      }

      const worstStat = tfStats[worst]!;

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

      // Which leg carries the story?
      const zA = A.legZ, zB = B.legZ;
      const abnormal =
        zA != null && zB != null
          ? (Math.abs(zA) >= Math.abs(zB) ? { t: A.ticker, z: zA } : { t: B.ticker, z: zB })
          : null;

      // Evidence-aware suggestion
      let suggestion: string;
      if (kind === "stretched" && spreadStats) {
        // Ratio above its mean → A rich vs B; fade toward the mean.
        const rich = spreadStats.z > 0 ? A.ticker : B.ticker;
        const cheap = spreadStats.z > 0 ? B.ticker : A.ticker;
        suggestion = `Spread ${fmt1(spreadStats.z)}σ, MR half-life ${halfLife}d: LONG ${cheap} / SHORT ${rich}`;
      } else if (kind === "recoupling") {
        suggestion = spreadMR
          ? `Recoupling (Δρ +${(corrDelta ?? 0).toFixed(2)}, HL ${halfLife}d): LONG ${laggard} / SHORT ${leader}`
          : `Recoupling (Δρ +${(corrDelta ?? 0).toFixed(2)}) — no spread-MR basis; size small`;
      } else if (kind === "decorrelated" && daily.mean > 0) {
        suggestion = spreadMR
          ? `Reconvergence (spread MR, HL ${halfLife}d): LONG ${laggard} / SHORT ${leader}`
          : abnormal
            ? `No MR basis — story likely in ${abnormal.t} (move z ${fmt1(abnormal.z)}); investigate before fading`
            : `No MR basis — regime-break risk; investigate before fading`;
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
        corrDelta,
        spreadZ: spreadStats ? Math.round(spreadStats.z * 100) / 100 : null,
        spreadHalfLife: halfLife,
        spreadMR,
        legZA: zA,
        legZB: zB,
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
    mode,
    rows,
    idioRows: [],
    totalPairs,
    scannedPairs: pairTotal,
    tickers: good.length,
    window,
    durationMs: Math.round(performance.now() - t0),
    skipped,
  };
}

export function dislocationScanToCsv(result: DislocationScanResult): string {
  if (result.mode === "idio") {
    const header = [
      "rank", "ticker", "subindustry", "peers", "hist_avg_corr", "cur_avg_corr", "z", "pctile", "rel_ret", "side", "score",
    ].join(",");
    const lines = result.idioRows.map((r) => [
      r.rank, r.ticker, `"${r.group}"`, r.peers, r.histAvgCorr.toFixed(4), r.curAvgCorr.toFixed(4),
      r.z.toFixed(3), r.pct.toFixed(1), r.relRet.toFixed(4), `"${r.side}"`, r.score.toFixed(3),
    ].join(","));
    return [header, ...lines].join("\n");
  }
  const header = [
    "rank", "a", "b", "hist_daily_corr", "kind", "worst_tf", "anchor_tf", "z_gap", "corr_delta",
    "spread_z", "spread_mr", "spread_half_life", "leg_z_a", "leg_z_b",
    "hourly_rho", "hourly_z", "daily_rho", "daily_z", "weekly_rho", "weekly_z",
    "spread_ret", "leader", "laggard", "suggestion", "score",
  ].join(",");
  const lines = result.rows.map((r) => [
    r.rank, r.a, r.b, r.histCorr.toFixed(4), r.kind, r.worstTF, r.anchorTF, r.zGap.toFixed(3),
    r.corrDelta != null ? r.corrDelta.toFixed(4) : "",
    r.spreadZ != null ? r.spreadZ.toFixed(2) : "", r.spreadMR ? "yes" : "no",
    r.spreadHalfLife != null ? r.spreadHalfLife : "",
    r.legZA != null ? r.legZA.toFixed(2) : "", r.legZB != null ? r.legZB.toFixed(2) : "",
    r.tf.hourly ? r.tf.hourly.last.toFixed(4) : "", r.tf.hourly ? r.tf.hourly.z.toFixed(3) : "",
    r.tf.daily ? r.tf.daily.last.toFixed(4) : "", r.tf.daily ? r.tf.daily.z.toFixed(3) : "",
    r.tf.weekly ? r.tf.weekly.last.toFixed(4) : "", r.tf.weekly ? r.tf.weekly.z.toFixed(3) : "",
    r.spreadRet.toFixed(4), r.leader, r.laggard, `"${r.suggestion}"`, r.score.toFixed(3),
  ].join(","));
  return [header, ...lines].join("\n");
}
