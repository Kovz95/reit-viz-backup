// Reconstructed from recovered-bundle/Trendlines-BNfKnhdH.js.
//
// Diagonal-trendline DETECTION only — the algorithm + its default config.
// Consumers: LevelsAndTrendlines (`d as detectTrendlines`, `D as
// TrendlinesPanel`), ChartPane, Pairs. The UI that used to live here
// (TrendlinesSubPanel page shell, TrendlineChart) was dead code from the
// bundle reconstruction — unrouted, zero call sites — and was removed
// (shell 2026-08-04, chart 2026-08-21); the live surface is /levels.

// ── Types ─────────────────────────────────────────────────────────────────────

interface Touch {
  date: string;
  index: number;
  priceAtTouch: number;
  projectedValue: number;
  deviationPct: number;
}

export interface TrendlineResult {
  kind: "resistance" | "support";
  i1: number;
  i2: number;
  date1: string;
  date2: string;
  price1: number;
  price2: number;
  slope: number;
  slopePctPerYear: number;
  touches: Touch[];
  touchCount: number;
  firstTouchIndex: number;
  lastTouchIndex: number;
  spanBars: number;
  broken: boolean;
  brokenAtIndex: number | null;
  brokenAtDate: string | null;
  rSquared: number;
  daysSinceLastTouch: number | null;
  currentProjection: number;
  compositeScore: number;
}

export interface TrendlineConfig {
  method: string;
  pivotLeft: number;
  pivotRight: number;
  tolerancePct: number;
  useAtrTolerance: boolean;
  atrToleranceMultiplier: number;
  atrPeriod: number;
  breakTolerancePct: number;
  minTouchCount: number;
  minSpanBars: number;
  maxSlopePerYear: number;
  maxAnchorGapBars: number;
  ransacIterations: number;
  ransacMinInliers: number;
  topN: number;
  slopeClusterTolerance: number;
  interceptClusterTolerancePct: number;
  filterBrokenLines: boolean;
}

interface OhlcData {
  dates: string[];
  closes: number[];
  highs: number[];
  lows: number[];
}

// ── Default trendline detection config ──────────────────────────────────────────

export const TrendlinesPanel: TrendlineConfig = {
  method: "pivot-pairs",
  pivotLeft: 5,
  pivotRight: 5,
  tolerancePct: 0.005,
  useAtrTolerance: false,
  atrToleranceMultiplier: 0.5,
  atrPeriod: 14,
  breakTolerancePct: 0.015,
  minTouchCount: 3,
  minSpanBars: 20,
  maxSlopePerYear: 5,
  maxAnchorGapBars: 250,
  ransacIterations: 500,
  ransacMinInliers: 4,
  topN: 10,
  slopeClusterTolerance: 0.15,
  interceptClusterTolerancePct: 0.02,
  filterBrokenLines: false,
};

const DEFAULT_CONFIG = TrendlinesPanel;

// Alias: LevelsAndTrendlines imports `D as TrendlinesPanel`
export { TrendlinesPanel as D };

// ── Pure math helpers ────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00Z").getTime();
  const b = new Date(dateB + "T00:00:00Z").getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function findSwingHighs(prices: number[], left: number, right: number): number[] {
  const out: number[] = [];
  const n = prices.length;
  for (let i = left; i < n - right; i++) {
    const v = prices[i];
    if (!Number.isFinite(v)) continue;
    let ok = true;
    for (let k = 1; k <= left; k++) {
      if (!(prices[i - k] < v)) { ok = false; break; }
    }
    if (ok) {
      for (let k = 1; k <= right; k++) {
        if (!(prices[i + k] < v)) { ok = false; break; }
      }
      if (ok) out.push(i);
    }
  }
  return out;
}

function findSwingLows(prices: number[], left: number, right: number): number[] {
  const out: number[] = [];
  const n = prices.length;
  for (let i = left; i < n - right; i++) {
    const v = prices[i];
    if (!Number.isFinite(v)) continue;
    let ok = true;
    for (let k = 1; k <= left; k++) {
      if (!(prices[i - k] > v)) { ok = false; break; }
    }
    if (ok) {
      for (let k = 1; k <= right; k++) {
        if (!(prices[i + k] > v)) { ok = false; break; }
      }
      if (ok) out.push(i);
    }
  }
  return out;
}

function findFractalHighs(prices: number[]): number[] {
  return findSwingHighs(prices, 2, 2);
}

function findFractalLows(prices: number[]): number[] {
  return findSwingLows(prices, 2, 2);
}

function computeAtr(
  ohlc: { highs: number[]; lows: number[]; closes: number[] },
  period: number
): number[] {
  const { highs, lows, closes } = ohlc;
  const n = closes.length;
  const result = new Array(n).fill(NaN);
  if (n < 2 || period < 1) return result;
  const tr = new Array(n).fill(NaN);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    const h = highs[i], l = lows[i], pc = closes[i - 1];
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(pc)) { tr[i] = NaN; continue; }
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  let sum = 0, cnt = 0;
  for (let i = 1; i <= period && i < n; i++) { if (Number.isFinite(tr[i])) { sum += tr[i]; cnt++; } }
  if (cnt === 0) return result;
  result[period] = sum / cnt;
  for (let i = period + 1; i < n; i++) {
    const prev = result[i - 1];
    if (!Number.isFinite(prev) || !Number.isFinite(tr[i])) { result[i] = prev; continue; }
    result[i] = ((period - 1) * prev + tr[i]) / period;
  }
  for (let i = 0; i < period; i++) result[i] = result[period];
  return result;
}

function projectLine(slope: number, anchorIdx: number, anchorPrice: number, targetIdx: number): number {
  return anchorPrice + slope * (targetIdx - anchorIdx);
}

function getTolerance(price: number, barIdx: number, cfg: TrendlineConfig, atr: number[] | null): number {
  return cfg.useAtrTolerance && atr && Number.isFinite(atr[barIdx]) && price > 0
    ? cfg.atrToleranceMultiplier * atr[barIdx] / price
    : cfg.tolerancePct;
}

function buildTouches(
  ohlc: OhlcData,
  i1: number,
  i2: number,
  kind: "resistance" | "support",
  cfg: TrendlineConfig,
  atr: number[] | null
): { touches: Touch[]; broken: boolean; brokenAtIndex: number | null; brokenAtDate: string | null; lastTouchIndex: number } {
  const { closes, highs, lows, dates } = ohlc;
  const price1 = kind === "resistance" ? highs[i1] : lows[i1];
  const price2 = kind === "resistance" ? highs[i2] : lows[i2];
  const slope = (price2 - price1) / (i2 - i1);
  const touches: Touch[] = [
    { date: dates[i1], index: i1, priceAtTouch: price1, projectedValue: price1, deviationPct: 0 },
    { date: dates[i2], index: i2, priceAtTouch: price2, projectedValue: price2, deviationPct: 0 },
  ];
  let broken = false, brokenAtIndex: number | null = null, brokenAtDate: string | null = null;
  let lastTouchIndex = i2;
  const n = closes.length;
  for (let i = i2 + 1; i < n; i++) {
    const proj = projectLine(slope, i1, price1, i);
    if (!Number.isFinite(proj) || proj <= 0) continue;
    const c = closes[i], h = highs[i], lo = lows[i];
    const tol = getTolerance(proj, i, cfg, atr);
    if (!broken) {
      if (kind === "resistance" ? c > proj * (1 + cfg.breakTolerancePct) : c < proj * (1 - cfg.breakTolerancePct)) {
        broken = true; brokenAtIndex = i; brokenAtDate = dates[i];
      }
    }
    if (broken) continue;
    const candidates = kind === "resistance" ? [h, c] : [lo, c];
    let minDev = Infinity, best = NaN;
    for (const p of candidates) {
      if (!Number.isFinite(p)) continue;
      const dev = Math.abs(p - proj) / proj;
      if (dev < minDev) { minDev = dev; best = p; }
    }
    if (minDev <= tol) {
      const prev = touches[touches.length - 1];
      if (i - prev.index >= 3) {
        touches.push({ date: dates[i], index: i, priceAtTouch: best, projectedValue: proj, deviationPct: (best - proj) / proj });
        lastTouchIndex = i;
      }
    }
  }
  return { touches, broken, brokenAtIndex, brokenAtDate, lastTouchIndex };
}

function computeRSquared(touches: Touch[]): number {
  if (touches.length < 2) return 0;
  let ss_res = 0, ss_tot = 0;
  const mean = touches.reduce((s, t) => s + t.priceAtTouch, 0) / touches.length;
  for (const t of touches) {
    ss_res += Math.pow(t.priceAtTouch - t.projectedValue, 2);
    ss_tot += Math.pow(t.priceAtTouch - mean, 2);
  }
  if (ss_tot === 0) return 1;
  return Math.max(0, Math.min(1, 1 - ss_res / ss_tot));
}

function compositeScore(line: Omit<TrendlineResult, "compositeScore">, totalBars: number): number {
  const touchScore = Math.min(line.touchCount / 6, 1);
  const r2 = line.rSquared;
  const longevity = Math.min(line.spanBars / Math.max(totalBars, 1), 1);
  const recency = line.daysSinceLastTouch !== null ? Math.max(0, 1 - line.daysSinceLastTouch / 365) : 0;
  const breakPenalty = line.broken ? 0.7 : 1;
  const raw = 0.3 * touchScore + 0.25 * r2 + 0.2 * longevity + 0.25 * recency;
  return Math.max(0, Math.min(1, raw * breakPenalty));
}

function deduplicateLines(lines: TrendlineResult[], cfg: TrendlineConfig): TrendlineResult[] {
  const sorted = [...lines].sort((a, b) => b.compositeScore - a.compositeScore);
  const out: TrendlineResult[] = [];
  for (const line of sorted) {
    let dup = false;
    for (const accepted of out) {
      if (line.kind !== accepted.kind) continue;
      const slopeDiff = Math.abs(line.slope - accepted.slope) / (Math.max(Math.abs(line.slope), Math.abs(accepted.slope)) || 1e-9);
      const intercDiff = Math.abs(line.currentProjection - accepted.currentProjection) / (Math.abs(accepted.currentProjection) || 1);
      if (slopeDiff < cfg.slopeClusterTolerance && intercDiff < cfg.interceptClusterTolerancePct) { dup = true; break; }
    }
    if (!dup) out.push(line);
  }
  return out;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = s + 1831565813 | 0;
    let c = Math.imul(s ^ (s >>> 15), 1 | s);
    c = c + Math.imul(c ^ (c >>> 7), 61 | c) ^ c;
    return ((c ^ (c >>> 14)) >>> 0) / 4294967296;
  };
}

// ── detectTrendlines ─────────────────────────────────────────────────────────────

export function detectTrendlines(ohlc: OhlcData, cfg: TrendlineConfig = DEFAULT_CONFIG): TrendlineResult[] {
  const { dates, closes, highs, lows } = ohlc;
  const n = closes.length;
  if (n < 40) return [];
  const method = cfg.method ?? "pivot-pairs";
  const swingHighs = method === "fractals" ? findFractalHighs(highs) : findSwingHighs(highs, cfg.pivotLeft, cfg.pivotRight);
  const swingLows = method === "fractals" ? findFractalLows(lows) : findSwingLows(lows, cfg.pivotLeft, cfg.pivotRight);
  const atr = cfg.useAtrTolerance ? computeAtr(ohlc, cfg.atrPeriod) : null;
  const results: TrendlineResult[] = [];
  const today = todayStr();
  const lastBar = n - 1;

  const tryLine = (kind: "resistance" | "support", i1: number, i2: number) => {
    if (i2 - i1 < cfg.minSpanBars || i2 - i1 > cfg.maxAnchorGapBars) return;
    const p1 = kind === "resistance" ? highs[i1] : lows[i1];
    const p2 = kind === "resistance" ? highs[i2] : lows[i2];
    if (!Number.isFinite(p1) || !Number.isFinite(p2) || p1 <= 0 || p2 <= 0) return;
    const slope = (p2 - p1) / (i2 - i1);
    const annualSlope = (slope * 252) / p1;
    if (Math.abs(annualSlope) > cfg.maxSlopePerYear) return;
    const { touches, broken, brokenAtIndex, brokenAtDate, lastTouchIndex } = buildTouches(ohlc, i1, i2, kind, cfg, atr);
    if (touches.length < cfg.minTouchCount) return;
    if (broken && brokenAtIndex !== null && brokenAtIndex - i2 < 5) return;
    const lastDate = dates[lastTouchIndex];
    const daysSince = daysBetween(lastDate, today);
    const projection = projectLine(slope, i1, p1, lastBar);
    const r2 = computeRSquared(touches);
    const lineObj = {
      kind, i1, i2,
      date1: dates[i1], date2: dates[i2],
      price1: p1, price2: p2,
      slope, slopePctPerYear: annualSlope,
      touches, touchCount: touches.length,
      firstTouchIndex: i1, lastTouchIndex,
      spanBars: lastTouchIndex - i1,
      broken, brokenAtIndex, brokenAtDate,
      rSquared: r2,
      daysSinceLastTouch: daysSince,
      currentProjection: projection,
    };
    const score = compositeScore(lineObj, n);
    results.push({ ...lineObj, compositeScore: score });
  };

  if (method === "ransac") {
    const rng = mulberry32(1592607298);
    const ransacKind = (kind: "resistance" | "support", pivots: number[]) => {
      if (pivots.length < 2) return;
      const getPrice = (i: number) => kind === "resistance" ? highs[i] : lows[i];
      const iters = Math.max(50, cfg.ransacIterations | 0);
      const seen = new Set<string>();
      for (let iter = 0; iter < iters; iter++) {
        let a = Math.floor(rng() * pivots.length);
        let b = Math.floor(rng() * pivots.length);
        if (a === b) continue;
        if (a > b) { const tmp = a; a = b; b = tmp; }
        const pi1 = pivots[a], pi2 = pivots[b];
        const key = `${pi1}_${pi2}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (pi2 - pi1 < cfg.minSpanBars || pi2 - pi1 > cfg.maxAnchorGapBars) continue;
        const pp1 = getPrice(pi1), pp2 = getPrice(pi2);
        if (!Number.isFinite(pp1) || !Number.isFinite(pp2) || pp1 <= 0 || pp2 <= 0) continue;
        const slope = (pp2 - pp1) / (pi2 - pi1);
        let inliers = 2;
        for (const piv of pivots) {
          if (piv === pi1 || piv === pi2) continue;
          const proj = projectLine(slope, pi1, pp1, piv);
          if (!Number.isFinite(proj) || proj <= 0) continue;
          const pp = getPrice(piv);
          const dev = Math.abs(pp - proj) / proj;
          const tol = getTolerance(proj, piv, cfg, atr);
          if (dev <= tol) inliers++;
        }
        if (inliers >= Math.max(2, cfg.ransacMinInliers)) tryLine(kind, pi1, pi2);
      }
    };
    ransacKind("resistance", swingHighs);
    ransacKind("support", swingLows);
  } else {
    for (let i = 0; i < swingHighs.length; i++)
      for (let j = i + 1; j < swingHighs.length; j++)
        tryLine("resistance", swingHighs[i], swingHighs[j]);
    for (let i = 0; i < swingLows.length; i++)
      for (let j = i + 1; j < swingLows.length; j++)
        tryLine("support", swingLows[i], swingLows[j]);
  }

  const filtered = cfg.filterBrokenLines ? results.filter(l => !l.broken) : results;
  const deduped = deduplicateLines(filtered, cfg);
  deduped.sort((a, b) => b.compositeScore - a.compositeScore);
  return deduped;
}

// Alias: LevelsAndTrendlines imports `d as detectTrendlines`
export { detectTrendlines as d };

