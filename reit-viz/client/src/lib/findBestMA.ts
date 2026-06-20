// Reconstructed from the production index chunk (functions vVe/xVe/yVe/bVe/wVe +
// the HF/Vp/oVe/lVe/cVe/uVe fetch chain + the SVe/bT/kVe/gVe/A2 constants) on
// 2026-06-17. Scores every moving-average type×period against a price series on
// three axes — hug, support/resistance, and trend-regime — for the "Find Best MA"
// optimizer panel.

import { MA_TYPES, computeMaByType, type MaType } from "@/lib/maEngine";
import { getMetricSeries } from "@/lib/dataService";

export type { MaType };
export { MA_TYPES };

// bT — rank-mode labels
export const MODE_LABELS: Record<RankMode, string> = {
  hug: "Hug",
  sr: "S/R",
  trend: "Trend",
  composite: "Best Overall",
};

// kVe — rank-mode descriptions
export const MODE_DESCRIPTIONS: Record<RankMode, string> = {
  hug: "Hugs price tightly. Score = exp(-mean|price−MA|/price). Higher = MA tracks price more closely. Short periods usually win.",
  sr: "Acts as dynamic support/resistance. Score = bounce rate (price touched MA, then moved away without crossing). Medium periods usually win.",
  trend: "Splits forward returns into above-MA vs below-MA regimes. Score = standardized difference, mapped to 0..1 via logistic. Captures regime separation.",
  composite: "Cube root of (hug × S/R × trend). Balances all three.",
};

// gVe — default candidate periods
export const DEFAULT_PERIODS = [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250];

export type RankMode = "hug" | "sr" | "trend" | "composite";

export interface MaCandidate {
  type: MaType;
  period: number;
  hug: number;
  sr: number;
  trend: number;
  composite: number;
  stats: {
    n: number;
    meanAbsPctErr: number;
    nearBars: number;
    bounceBars: number;
    bouncesAboveBelow: { above: number; below: number };
    aboveCount: number;
    belowCount: number;
    aboveMeanRet: number;
    belowMeanRet: number;
    pooledStd: number;
  };
}

export interface ScoreOptions {
  types?: MaType[];
  periods?: number[];
  capPeriodToLength?: boolean;
  tolPct?: number;
  srLookForward?: number;
  trendHorizon?: number;
  highs?: number[];
  lows?: number[];
}

// A2 — percentage formatter for the results table
export function formatScorePct(v: number): string {
  return Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—";
}

// OW — is this a recognised MA type?
export function isMaType(t: string): t is MaType {
  return (MA_TYPES as string[]).includes(t);
}

// vVe — hug error: mean |price − MA| / price over valid bars
function hugError(closes: number[], ma: (number | null)[]): { err: number; n: number } {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    const m = ma[i];
    if (!Number.isFinite(c) || c <= 0 || m == null || !Number.isFinite(m)) continue;
    sum += Math.abs(c - m) / c;
    n++;
  }
  return { err: n > 0 ? sum / n : Number.NaN, n };
}

// xVe — support/resistance bounce rate
function srBounce(
  closes: number[],
  ma: (number | null)[],
  tolPct: number,
  lookForward: number
): { rate: number; nearBars: number; bounceBars: number; above: number; below: number } {
  let near = 0;
  let bounces = 0;
  let above = 0;
  let below = 0;
  for (let l = 0; l < closes.length - lookForward; l++) {
    const c = closes[l];
    const m = ma[l];
    if (!Number.isFinite(c) || c <= 0 || m == null || !Number.isFinite(m)) continue;
    const dist = (c - m) / m;
    if (Math.abs(dist) > tolPct) continue;
    near++;
    const dir = dist >= 0 ? 1 : -1;
    let crossed = false;
    let maxMove = 0;
    for (let x = 1; x <= lookForward; x++) {
      const fc = closes[l + x];
      const fm = ma[l + x];
      if (!Number.isFinite(fc) || fc <= 0 || fm == null || !Number.isFinite(fm)) { crossed = true; break; }
      const fdist = (fc - fm) / fm;
      if ((dir === 1 && fdist < -tolPct) || (dir === -1 && fdist > tolPct)) { crossed = true; break; }
      const move = dir === 1 ? fdist : -fdist;
      if (move > maxMove) maxMove = move;
    }
    if (!crossed && maxMove >= tolPct * 1.5) {
      bounces++;
      if (dir === 1) above++;
      else below++;
    }
  }
  return { rate: near > 0 ? bounces / near : 0, nearBars: near, bounceBars: bounces, above, below };
}

// yVe — trend regime separation: forward log-returns split by above/below MA
function trendRegime(
  closes: number[],
  ma: (number | null)[],
  horizon: number
): { score: number; aboveCount: number; belowCount: number; aboveMeanRet: number; belowMeanRet: number; pooledStd: number } {
  const aboveRets: number[] = [];
  const belowRets: number[] = [];
  for (let g = 0; g < closes.length - horizon; g++) {
    const c = closes[g];
    const m = ma[g];
    const fut = closes[g + horizon];
    if (!Number.isFinite(c) || c <= 0 || m == null || !Number.isFinite(m) || !Number.isFinite(fut) || fut <= 0) continue;
    const ret = Math.log(fut / c);
    if (c >= m) aboveRets.push(ret);
    else belowRets.push(ret);
  }
  if (aboveRets.length < 5 || belowRets.length < 5) {
    return { score: 0.5, aboveCount: aboveRets.length, belowCount: belowRets.length, aboveMeanRet: 0, belowMeanRet: 0, pooledStd: 0 };
  }
  const mean = (g: number[]) => g.reduce((x, b) => x + b, 0) / g.length;
  const variance = (g: number[], mu: number) => g.reduce((b, k) => b + (k - mu) * (k - mu), 0) / Math.max(1, g.length - 1);
  const aMean = mean(aboveRets);
  const bMean = mean(belowRets);
  const aVar = variance(aboveRets, aMean);
  const bVar = variance(belowRets, bMean);
  const pooledStd = Math.sqrt(aVar / aboveRets.length + bVar / belowRets.length);
  const t = pooledStd > 0 ? (aMean - bMean) / pooledStd : 0;
  const clamped = Math.max(-5, Math.min(5, t));
  return {
    score: 1 / (1 + Math.exp(-clamped)),
    aboveCount: aboveRets.length,
    belowCount: belowRets.length,
    aboveMeanRet: aMean,
    belowMeanRet: bMean,
    pooledStd,
  };
}

// bVe — score every type×period candidate
export function scoreMovingAverages(closes: number[], opts: ScoreOptions = {}): MaCandidate[] {
  const types = opts.types && opts.types.length > 0 ? opts.types : MA_TYPES;
  let periods = opts.periods && opts.periods.length > 0 ? opts.periods : DEFAULT_PERIODS;
  if (opts.capPeriodToLength !== false) {
    const cap = Math.max(5, Math.floor(closes.length / 4));
    periods = periods.filter((p) => p <= cap);
  }
  const tolPct = opts.tolPct ?? 0.01;
  const srLookForward = opts.srLookForward ?? 5;
  const trendHorizon = opts.trendHorizon ?? 10;
  const out: MaCandidate[] = [];
  for (const type of types) {
    for (const period of periods) {
      if (period < 2 || period >= closes.length) continue;
      let ma: (number | null)[];
      try {
        ma = computeMaByType(closes, period, type, { highs: opts.highs, lows: opts.lows });
      } catch {
        continue;
      }
      const { err, n } = hugError(closes, ma);
      if (!Number.isFinite(err) || n < 20) continue;
      const hug = Math.exp(-err);
      const sr = srBounce(closes, ma, tolPct, srLookForward);
      const trend = trendRegime(closes, ma, trendHorizon);
      const composite = Math.cbrt(
        Math.max(1e-6, hug) * Math.max(1e-6, sr.rate) * Math.max(1e-6, trend.score)
      );
      out.push({
        type,
        period,
        hug,
        sr: sr.rate,
        trend: trend.score,
        composite,
        stats: {
          n,
          meanAbsPctErr: err,
          nearBars: sr.nearBars,
          bounceBars: sr.bounceBars,
          bouncesAboveBelow: { above: sr.above, below: sr.below },
          aboveCount: trend.aboveCount,
          belowCount: trend.belowCount,
          aboveMeanRet: trend.aboveMeanRet,
          belowMeanRet: trend.belowMeanRet,
          pooledStd: trend.pooledStd,
        },
      });
    }
  }
  return out;
}

// wVe — rank candidates by the active mode
export function rankCandidates(candidates: MaCandidate[], mode: RankMode): MaCandidate[] {
  const key =
    mode === "hug" ? (c: MaCandidate) => c.hug
    : mode === "sr" ? (c: MaCandidate) => c.sr
    : mode === "trend" ? (c: MaCandidate) => c.trend
    : (c: MaCandidate) => c.composite;
  return [...candidates].sort((a, b) => key(b) - key(a));
}

// ── Input fetch chain ────────────────────────────────────────────────────────

export type FindBestMaInput =
  | { kind: "close" }
  | { kind: "workbook"; metric: string };

export interface MaInputData {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  priceDates: string[];
  label: string;
  syntheticOHLC: boolean;
  selection: FindBestMaInput;
}

interface YahooPrices {
  dates: string[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  adjCloses: number[];
  volumes: number[];
}

// Vp — fetch Yahoo OHLC for a ticker (adjusted closes included)
async function getYahooPrices(ticker: string): Promise<YahooPrices> {
  const { API_BASE } = await import("@/lib/queryClient");
  const resp = await fetch(`${API_BASE}/api/yahoo-prices/${encodeURIComponent(ticker.toUpperCase())}`);
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({} as any));
    throw new Error(body?.error ?? `Could not load price history for ${ticker} from Yahoo Finance`);
  }
  return resp.json();
}

// lVe — close-price input (Yahoo adjusted; highs/lows scaled by adjClose/close)
async function loadCloseInput(ticker: string): Promise<MaInputData | null> {
  try {
    const p = await getYahooPrices(ticker);
    if (!p || !p.adjCloses || p.adjCloses.length === 0) return null;
    const len = p.adjCloses.length;
    const highs = new Array<number>(len);
    const lows = new Array<number>(len);
    for (let i = 0; i < len; i++) {
      const close = p.closes[i];
      const adj = p.adjCloses[i];
      const ratio = Number.isFinite(close) && close > 0 && Number.isFinite(adj) ? adj / close : 1;
      highs[i] = p.highs[i] * ratio;
      lows[i] = p.lows[i] * ratio;
    }
    return {
      closes: p.adjCloses,
      highs,
      lows,
      volumes: p.volumes ?? [],
      priceDates: p.dates,
      label: "close",
      syntheticOHLC: false,
      selection: { kind: "close" },
    };
  } catch {
    return null;
  }
}

// uVe — synthetic OHLC from a flat metric series (high = low = close = value)
function syntheticInput(values: number[], times: string[], label: string, selection: FindBestMaInput): MaInputData {
  return {
    closes: values,
    highs: values,
    lows: values,
    volumes: [],
    priceDates: times,
    label,
    syntheticOHLC: true,
    selection,
  };
}

// cVe — workbook-metric input (synthetic OHLC over the metric's own values)
async function loadWorkbookInput(ticker: string, metric: string): Promise<MaInputData | null> {
  try {
    const series = await getMetricSeries(ticker, metric);
    if (!series || series.length === 0) return null;
    const values: number[] = [];
    const times: string[] = [];
    for (const point of series) {
      if (Number.isFinite(point.value)) {
        values.push(point.value);
        times.push(point.time);
      }
    }
    if (values.length < 60) return null;
    return syntheticInput(values, times, metric, { kind: "workbook", metric });
  } catch {
    return null;
  }
}

// HF — load the chosen input series for a ticker
export async function loadMaInput(ticker: string, input: FindBestMaInput): Promise<MaInputData | null> {
  const sel = input?.kind ? input : ({ kind: "close" } as FindBestMaInput);
  if (sel.kind === "close") return loadCloseInput(ticker);
  if (sel.kind === "workbook" && sel.metric) return loadWorkbookInput(ticker, sel.metric);
  return null;
}
