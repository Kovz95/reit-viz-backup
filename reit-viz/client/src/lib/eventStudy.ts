// Event-study kernel — THE shared "what happens after X?" engine.
//
// Ported verbatim from pages/PriceAction.tsx's inline math (computeEventStudy /
// computeHorizonStats / buildHistogram / computeSigmaInspect and helpers) so
// the Event Lab reproduces its numbers exactly, then generalized in two ways:
//  - triggers come in as pre-computed {idx, value} hits (any source — technical
//    masks, calendar dates, signal-catalog detections), and
//  - horizons are caller-suppliable (default [1, 5, 20, 60] bars).
//
// Conventions: returns are simple % (×100), forward windows are close-to-close
// in BARS of the supplied series, and the unconditional baseline samples every
// bar the same way the study samples its events.

export const DEFAULT_HORIZONS = [1, 5, 20, 60];

export interface EventBundle {
  dates: string[];
  closes: (number | null)[];
  opens?: (number | null)[];
}

export interface HorizonStats {
  horizon: number;
  count: number;
  mean: number;
  median: number;
  std: number;
  pUp: number;
  winLoss: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
}

export interface EventEntry {
  dateIdx: number;
  date: string;
  triggerValue: number;
  fwd: Record<number, number | null>;
}

export interface StudyResult {
  events: EventEntry[];
  stats: HorizonStats[];
  distribution: Record<number, number[]>;
  avgPath: Array<{ day: number; cumret: number; n: number }>;
  baseline: HorizonStats[];
}

// ── Math helpers ─────────────────────────────────────────────────────────────

export function mean(arr: number[]): number {
  if (!arr.length) return NaN;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

export function stdDev(arr: number[], mu?: number): number {
  if (arr.length < 2) return NaN;
  const m = mu ?? mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / (arr.length - 1));
}

/** Linear-interpolated percentile of an ASCENDING-sorted array, p in [0,1]. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const c = (sorted.length - 1) * p;
  const lo = Math.floor(c), hi = Math.ceil(c);
  return lo === hi ? sorted[lo] : sorted[lo] + (c - lo) * (sorted[hi] - sorted[lo]);
}

export function computeHorizonStats(arr: number[], horizon: number): HorizonStats {
  if (!arr.length) return { horizon, count: 0, mean: NaN, median: NaN, std: NaN, pUp: NaN, winLoss: NaN, min: NaN, max: NaN, p25: NaN, p75: NaN };
  const sorted = arr.slice().sort((a, b) => a - b);
  const wins = arr.filter(v => v > 0), losses = arr.filter(v => v < 0);
  const avgWin = wins.length ? mean(wins) : 0;
  const avgLoss = losses.length ? mean(losses) : 0;
  return {
    horizon, count: arr.length, mean: mean(arr), median: percentile(sorted, 0.5),
    std: stdDev(arr), pUp: wins.length / arr.length,
    winLoss: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : NaN,
    min: sorted[0], max: sorted[sorted.length - 1],
    p25: percentile(sorted, 0.25), p75: percentile(sorted, 0.75),
  };
}

export function emptyStudyResult(horizons: number[] = DEFAULT_HORIZONS): StudyResult {
  const empty: HorizonStats = { horizon: 1, count: 0, mean: NaN, median: NaN, std: NaN, pUp: NaN, winLoss: NaN, min: NaN, max: NaN, p25: NaN, p75: NaN };
  const dist: Record<number, number[]> = {};
  for (const h of horizons) dist[h] = [];
  return {
    events: [], stats: horizons.map(h => ({ ...empty, horizon: h })),
    distribution: dist, avgPath: [], baseline: horizons.map(h => ({ ...empty, horizon: h })),
  };
}

// ── The study kernel ─────────────────────────────────────────────────────────

/** Forward-return study over pre-computed trigger hits. Exact port of the
 *  events/stats/baseline/avgPath section of PriceAction's computeEventStudy. */
export function runEventStudy(
  bundle: EventBundle,
  hits: Array<{ idx: number; val: number }>,
  opts?: { horizons?: number[] },
): StudyResult {
  const horizons = opts?.horizons ?? DEFAULT_HORIZONS;
  const close = bundle.closes;
  const dates = bundle.dates;
  const n = close.length;

  const events: EventEntry[] = [];
  const dist: Record<number, number[]> = {};
  for (const h of horizons) dist[h] = [];
  for (const { idx, val } of hits) {
    const price = close[idx];
    if (price == null || price <= 0) continue;
    const fwd: Record<number, number | null> = {};
    for (const h of horizons) {
      const fi = idx + h;
      if (fi < n) {
        const fv = close[fi];
        if (fv != null) { const r = (fv / price - 1) * 100; fwd[h] = r; dist[h].push(r); continue; }
      }
      fwd[h] = null;
    }
    events.push({ dateIdx: idx, date: dates[idx] ?? "", triggerValue: val, fwd });
  }

  const stats = horizons.map(h => computeHorizonStats(dist[h], h));

  const maxH = Math.max(...horizons);
  const baselineDist: Record<number, number[]> = {};
  for (const h of horizons) baselineDist[h] = [];
  for (let i = 0; i + maxH < n; i++) {
    const p = close[i]; if (!p || p <= 0) continue;
    for (const h of horizons) {
      const fi = i + h;
      if (fi < n) { const fv = close[fi]; if (fv != null) baselineDist[h].push((fv / p - 1) * 100); }
    }
  }
  const baseline = horizons.map(h => computeHorizonStats(baselineDist[h], h));

  const avgPath: Array<{ day: number; cumret: number; n: number }> = [];
  for (let d = 0; d <= maxH; d++) {
    let sum = 0, cnt = 0;
    for (const ev of events) {
      const p = close[ev.dateIdx]; if (!p || p <= 0) continue;
      const fi = ev.dateIdx + d; if (fi >= n) continue;
      const fv = close[fi]; if (fv != null) { sum += (fv / p - 1) * 100; cnt++; }
    }
    avgPath.push({ day: d, cumret: cnt > 0 ? sum / cnt : 0, n: cnt });
  }

  return { events, stats, distribution: dist, avgPath, baseline };
}

// ── Histograms ───────────────────────────────────────────────────────────────

export function buildHistogram(arr: number[], nbins = 24): Array<{ bucket: string; lo: number; hi: number; count: number }> {
  if (!arr.length) return [];
  const sorted = arr.slice().sort((a, b) => a - b);
  const lo = percentile(sorted, 0.01), hi = percentile(sorted, 0.99);
  const range = hi - lo;
  if (range <= 0) return [];
  const w = range / nbins;
  const bins = [];
  for (let i = 0; i < nbins; i++) {
    const binLo = lo + i * w;
    bins.push({ bucket: binLo.toFixed(1), lo: binLo, hi: binLo + w, count: 0 });
  }
  for (const v of arr) {
    if (v < lo || v > hi) continue;
    let idx = Math.floor((v - lo) / w);
    if (idx >= nbins) idx = nbins - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return bins;
}

// ── Sigma inspection ("what sigma is this move?") ────────────────────────────

export type SigmaBasis = "rolling" | "full";

export interface SigmaInspect {
  pct: number;
  window: number;
  mu: number;
  sigma: number;
  z: number;
  absZ: number;
  percentileAbs: number;
  percentileSigned: number;
  countAtLeastAbs: number;
  totalDays: number;
  oneInNDays: number;
}

export function windowStats(rets: (number | null)[], n: number, window: number): { mu: number; sigma: number; n: number } {
  const arr: number[] = [];
  for (let i = n - window; i < n; i++) {
    if (i < 0) continue;
    const v = rets[i];
    if (v != null && Number.isFinite(v)) arr.push(v);
  }
  if (arr.length < Math.max(10, Math.floor(window * 0.6))) return { mu: NaN, sigma: NaN, n: arr.length };
  const mu = mean(arr), sigma = stdDev(arr, mu);
  return { mu, sigma, n: arr.length };
}

export function computeSigmaInspect(
  closes: (number | null)[],
  idx: number,
  pct: number,
  window: number,
  basis: SigmaBasis = "rolling",
): SigmaInspect | null {
  const n = closes.length;
  if (idx < 1 || idx >= n) return null;
  const dailyRets: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const p = closes[i - 1], c = closes[i];
    if (p != null && c != null && p > 0) dailyRets[i] = (c / p - 1) * 100;
  }
  let mu: number, sigma: number;
  if (basis === "full") {
    const finiteAll = dailyRets.filter((v): v is number => v != null && Number.isFinite(v));
    if (finiteAll.length < 30) return null;
    mu = mean(finiteAll); sigma = stdDev(finiteAll, mu);
  } else {
    const ws = windowStats(dailyRets, idx, window);
    mu = ws.mu; sigma = ws.sigma;
  }
  if (!Number.isFinite(sigma) || sigma <= 0) return null;
  const z = (pct - mu) / sigma;
  const absPct = Math.abs(pct);
  const finite = dailyRets.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length < 30) return null;
  const total = finite.length;
  let atLeast = 0, atMost = 0;
  for (const v of finite) {
    if (Math.abs(v) >= absPct) atLeast++;
    if (v <= pct) atMost++;
  }
  return {
    pct, window, mu, sigma, z, absZ: Math.abs(z),
    percentileAbs: 1 - atLeast / total,
    percentileSigned: atMost / total,
    countAtLeastAbs: atLeast,
    totalDays: total,
    oneInNDays: atLeast > 0 ? total / atLeast : total,
  };
}

// ── Raw-data plumbing ────────────────────────────────────────────────────────

/** Pull a dense (number|null)[] column out of a getTickerRaw payload —
 *  handles both plain arrays and sparse [[idx, val], …] pair encoding. */
export function extractColumn(raw: any, col: string, n: number): (number | null)[] {
  const colData = raw?.[col];
  if (!colData) return [];
  if (Array.isArray(colData) && colData.length && Array.isArray(colData[0])) {
    const result: (number | null)[] = new Array(n).fill(null);
    for (const [idx, val] of colData) {
      if (typeof idx === "number" && idx >= 0 && idx < n)
        result[idx] = typeof val === "number" ? val : null;
    }
    return result;
  }
  return Array.isArray(colData) ? colData.slice(0, n) : [];
}

export function pctFmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}
