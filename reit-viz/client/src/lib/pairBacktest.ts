// Pair spread backtester — the validation layer for dislocation ideas: when
// this pair's spread z reached this level historically, what actually
// happened? Trades fade the spread: enter when |z| ≥ entryZ, exit when
// |z| ≤ exitZ or after maxHold bars. All stats are in spread-return % (long
// the cheap leg, short the rich one, hedge-weighted).
import { computeKalmanHedge } from "./adaptiveModels";

export interface PairBtParams {
  window: number;   // rolling z window (bars)
  entryZ: number;   // |z| entry threshold
  exitZ: number;    // |z| exit threshold
  maxHold: number;  // bars
  hedge: "ratio" | "beta" | "kalman";
}

export const DEFAULT_BT_PARAMS: PairBtParams = { window: 60, entryZ: 2, exitZ: 0.5, maxHold: 60, hedge: "ratio" };

export interface PairBtTrade {
  entryDate: string;
  exitDate: string;
  days: number;          // bars held
  entryZ: number;
  retPct: number;        // spread return %, sign-adjusted (fade profits > 0 when spread reconverges)
  maePct: number;        // max adverse excursion %
  exitReason: "converged" | "timeout" | "end";
}

export interface PairBtResult {
  trades: PairBtTrade[];
  n: number;
  winRate: number;       // %
  avgRetPct: number;
  medianRetPct: number;
  medianDays: number;
  worstMaePct: number;
  totalRetPct: number;
  params: PairBtParams;
  bars: number;
}

interface TV { time: string; value: number }

/** Align two close series on shared dates (both finite, > 0). */
export function alignCloses(a: TV[], b: TV[]): { times: string[]; a: number[]; b: number[] } {
  const mb = new Map(b.filter((p) => Number.isFinite(p.value) && p.value > 0).map((p) => [p.time, p.value]));
  const times: string[] = [];
  const av: number[] = [];
  const bv: number[] = [];
  for (const p of a) {
    if (!Number.isFinite(p.value) || p.value <= 0) continue;
    const q = mb.get(p.time);
    if (q === undefined) continue;
    times.push(p.time);
    av.push(p.value);
    bv.push(q);
  }
  return { times, a: av, b: bv };
}

/** Spread series per hedge mode, on log prices. */
function spreadSeries(la: number[], lb: number[], hedge: PairBtParams["hedge"], window: number): number[] {
  const n = la.length;
  const s = new Array<number>(n).fill(NaN);
  if (hedge === "ratio") {
    for (let i = 0; i < n; i++) s[i] = la[i] - lb[i];
    return s;
  }
  if (hedge === "kalman") {
    const kh = computeKalmanHedge(la, lb);
    for (let i = 0; i < n; i++) s[i] = kh.residual[i];
    return s;
  }
  // rolling OLS beta (trailing `window`, lagged one bar — no lookahead)
  for (let i = window; i < n; i++) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = i - window; k < i; k++) {
      sx += lb[k]; sy += la[k]; sxx += lb[k] * lb[k]; sxy += lb[k] * la[k];
    }
    const den = window * sxx - sx * sx;
    const beta = den !== 0 ? (window * sxy - sx * sy) / den : 1;
    const alpha = (sy - beta * sx) / window;
    s[i] = la[i] - (alpha + beta * lb[i]);
  }
  return s;
}

export function runPairBacktest(aCloses: TV[], bCloses: TV[], params: PairBtParams): PairBtResult | null {
  const { times, a, b } = alignCloses(aCloses, bCloses);
  const n = times.length;
  if (n < params.window * 2 + 10) return null;
  const la = a.map(Math.log);
  const lb = b.map(Math.log);
  const spread = spreadSeries(la, lb, params.hedge, params.window);

  // Rolling z of the spread over `window` LAGGED bars (stats exclude today).
  const z = new Array<number>(n).fill(NaN);
  for (let i = params.window + 1; i < n; i++) {
    let m = 0, cnt = 0;
    for (let k = i - params.window; k < i; k++) if (Number.isFinite(spread[k])) { m += spread[k]; cnt++; }
    if (cnt < params.window * 0.8) continue;
    m /= cnt;
    let v = 0;
    for (let k = i - params.window; k < i; k++) if (Number.isFinite(spread[k])) v += (spread[k] - m) ** 2;
    const sd = Math.sqrt(v / Math.max(1, cnt - 1));
    if (sd > 0 && Number.isFinite(spread[i])) z[i] = (spread[i] - m) / sd;
  }

  const trades: PairBtTrade[] = [];
  let i = 0;
  while (i < n) {
    if (!Number.isFinite(z[i]) || Math.abs(z[i]) < params.entryZ) { i++; continue; }
    const dir = z[i] > 0 ? -1 : 1; // fade: short the spread when rich, long when cheap
    const e0 = spread[i];
    const zEntry = z[i];
    let j = i + 1;
    let mae = 0;
    let exitReason: PairBtTrade["exitReason"] = "end";
    for (; j < n; j++) {
      const pnl = dir * (spread[j] - e0) * 100;
      if (pnl < mae) mae = pnl;
      if (Number.isFinite(z[j]) && Math.abs(z[j]) <= params.exitZ) { exitReason = "converged"; break; }
      if (j - i >= params.maxHold) { exitReason = "timeout"; break; }
    }
    const jj = Math.min(j, n - 1);
    trades.push({
      entryDate: times[i],
      exitDate: times[jj],
      days: jj - i,
      entryZ: zEntry,
      retPct: dir * (spread[jj] - e0) * 100,
      maePct: mae,
      exitReason,
    });
    i = jj + 1;
  }

  if (!trades.length) return { trades, n: 0, winRate: 0, avgRetPct: 0, medianRetPct: 0, medianDays: 0, worstMaePct: 0, totalRetPct: 0, params, bars: n };
  const rets = trades.map((t) => t.retPct).sort((x, y) => x - y);
  const days = trades.map((t) => t.days).sort((x, y) => x - y);
  const med = (arr: number[]) => (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2);
  return {
    trades,
    n: trades.length,
    winRate: (trades.filter((t) => t.retPct > 0).length / trades.length) * 100,
    avgRetPct: trades.reduce((s, t) => s + t.retPct, 0) / trades.length,
    medianRetPct: med(rets),
    medianDays: med(days),
    worstMaePct: Math.min(...trades.map((t) => t.maePct)),
    totalRetPct: trades.reduce((s, t) => s + t.retPct, 0),
    params,
    bars: n,
  };
}
