// Auto pattern / channel / trendline detection used by PatternScreener and
// AutoTrendlineBacktest.
//
// Patterns delegate to lib/detectChartPatterns (the full geometric detector);
// channels fit regression bands over rolling lookbacks; computeAutoTrendlines
// runs a walk-forward pivot-trendline cross detector (pivots only become
// "known" n bars after they form, so crosses carry no lookahead).

import { detectChartPatterns, type DetectedPattern } from "@/lib/detectChartPatterns";

export interface TrendlineBar {
  time: string;
  value: number;
  high?: number;
  low?: number;
  close?: number;
}

export interface PatternResult {
  kind: string;
  startIdx: number;
  endIdx: number;
  points: { idx: number; value: number }[];
  r2?: number;
  touches?: number;
  [key: string]: any;
}

export interface ChannelResult {
  type: string;
  startIdx: number;
  endIdx: number;
  upper: number[];
  lower: number[];
  mid?: number[];
  r2?: number;
  containment?: number;
  [key: string]: any;
}

export interface PatternOptions {
  pivotLookback?: number;
  minR2?: number;
  minTouches?: number;
  minBars?: number;
  maxBars?: number;
  lookbackBars?: number;
  maxPatterns?: number;
  enabled?: Record<string, boolean>;
  [key: string]: any;
}

export interface ChannelOptions {
  types?: string[];
  stdevMult?: number;
  minR2?: number;
  minContainment?: number;
  minTouches?: number;
  maxChannels?: number;
  lookbackBars?: number | number[];
  minBars?: number;
  [key: string]: any;
}

export type TrendlineCrossKind =
  | "cross_above_upper"
  | "cross_below_upper"
  | "cross_above_lower"
  | "cross_below_lower";

export interface TrendlineCross {
  kind: TrendlineCrossKind;
  barIdx: number;
  price?: number;
  line?: string;
}

export interface AutoTrendlineResult {
  patterns?: PatternResult[];
  channels?: ChannelResult[];
  crosses: TrendlineCross[];
  [key: string]: any;
}

export function getDefaultPatternOptions(): PatternOptions {
  return {
    pivotLookback: 5,
    minR2: 0.85,
    minTouches: 3,
    minBars: 20,
    maxBars: 500,
    lookbackBars: 200,
    maxPatterns: 12,
    enabled: {
      "ascending-triangle": true,
      "descending-triangle": true,
      "symmetric-triangle": true,
      "head-and-shoulders": true,
      "inverse-head-and-shoulders": true,
      "double-top": true,
      "double-bottom": true,
      "rising-wedge": true,
      "falling-wedge": true,
      "rectangle": true,
    },
  };
}

export function getDefaultChannelOptions(): ChannelOptions {
  return {
    types: ["regression"],
    stdevMult: 2,
    minR2: 0.8,
    minContainment: 0.75,
    minTouches: 3,
    maxChannels: 6,
    lookbackBars: [50, 100, 200],
  };
}

// Option keys use dash names; detectChartPatterns keys use underscores.
const PATTERN_KEY_MAP: Record<string, string> = {
  "ascending-triangle": "asc_triangle",
  "descending-triangle": "desc_triangle",
  "symmetric-triangle": "sym_triangle",
  "head-and-shoulders": "head_shoulders",
  "inverse-head-and-shoulders": "inv_head_shoulders",
  "double-top": "double_top",
  "double-bottom": "double_bottom",
  "rising-wedge": "rising_wedge",
  "falling-wedge": "falling_wedge",
  "rectangle": "rectangle",
};

/**
 * Detects chart patterns in a bar series. Delegates to detectChartPatterns
 * and adapts the result to the screener row shape (type/label/direction/
 * confidence/startTime/endTime/endIndex/touches).
 */
export function detectPatterns(
  bars: TrendlineBar[],
  opts?: PatternOptions
): PatternResult[] {
  if (!Array.isArray(bars) || bars.length < 40) return [];
  const o = { ...getDefaultPatternOptions(), ...(opts ?? {}) };

  const patternBars = bars.map((b) => {
    const close = Number.isFinite(b.close) ? (b.close as number) : b.value;
    return { time: b.time, open: close, close, high: b.high ?? close, low: b.low ?? close };
  });

  const perPattern: Record<string, boolean> = {};
  if (o.enabled) {
    for (const [dashKey, key] of Object.entries(PATTERN_KEY_MAP)) {
      perPattern[key] = o.enabled[dashKey] !== false;
    }
  }
  // Stricter minR2 → lower sensitivity for the geometric detector.
  const sensitivity =
    o.minR2 != null ? Math.round(Math.min(100, Math.max(0, (1 - o.minR2) * 333))) : 60;

  const detected: DetectedPattern[] = detectChartPatterns(patternBars, {
    sensitivity,
    lookbackBars: o.lookbackBars ?? 0,
    maxPatterns: o.maxPatterns ?? 0,
    perPattern,
  });

  return detected
    .filter((p) => {
      const span = p.endIdx - p.startIdx;
      if (o.minBars && span < o.minBars) return false;
      if (o.maxBars && span > o.maxBars) return false;
      return true;
    })
    .map((p) => ({
      kind: p.key,
      type: p.key,
      label: p.label,
      direction: p.direction,
      confidence: p.confidence,
      r2: p.confidence,
      touches: p.markers?.length ?? p.lines.length,
      startIdx: p.startIdx,
      endIdx: p.endIdx,
      endIndex: p.endIdx,
      startTime: bars[p.startIdx]?.time ?? "",
      endTime: bars[p.endIdx]?.time ?? "",
      points: (p.markers ?? []).map((m) => ({ idx: m.idx, value: m.price })),
      neckline: p.neckline,
      target: p.target,
      lines: p.lines,
    }));
}

/**
 * Detects regression price channels over each configured lookback window
 * (anchored at the last bar): OLS fit ± stdevMult·σ of residuals, kept when
 * fit quality and band containment clear the thresholds.
 */
export function detectChannels(
  bars: TrendlineBar[],
  opts?: ChannelOptions
): ChannelResult[] {
  if (!Array.isArray(bars) || bars.length < 20) return [];
  const o = { ...getDefaultChannelOptions(), ...(opts ?? {}) };
  const closes = bars.map((b) =>
    Number.isFinite(b.close) ? (b.close as number) : b.value
  );
  const n = closes.length;
  const lookbacks = (Array.isArray(o.lookbackBars) ? o.lookbackBars : [o.lookbackBars ?? 100])
    .filter((lb): lb is number => Number.isFinite(lb) && (lb as number) >= (o.minBars ?? 20));

  const out: ChannelResult[] = [];
  for (const lb of lookbacks) {
    if (lb > n) continue;
    const startIdx = n - lb;
    const endIdx = n - 1;
    const ys = closes.slice(startIdx);
    const m = ys.length;

    // OLS y = a + b·x
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let x = 0; x < m; x++) { sx += x; sy += ys[x]; sxy += x * ys[x]; sxx += x * x; }
    const denom = m * sxx - sx * sx;
    if (denom === 0) continue;
    const b = (m * sxy - sx * sy) / denom;
    const a = (sy - b * sx) / m;

    let ssRes = 0, ssTot = 0;
    const meanY = sy / m;
    const fit: number[] = new Array(m);
    for (let x = 0; x < m; x++) {
      fit[x] = a + b * x;
      ssRes += (ys[x] - fit[x]) ** 2;
      ssTot += (ys[x] - meanY) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const sd = Math.sqrt(ssRes / Math.max(1, m - 2));
    const mult = o.stdevMult ?? 2;

    const upper: number[] = new Array(m);
    const lower: number[] = new Array(m);
    let inside = 0;
    let touches = 0;
    for (let x = 0; x < m; x++) {
      upper[x] = fit[x] + mult * sd;
      lower[x] = fit[x] - mult * sd;
      const hi = bars[startIdx + x]?.high ?? ys[x];
      const lo = bars[startIdx + x]?.low ?? ys[x];
      if (ys[x] <= upper[x] && ys[x] >= lower[x]) inside++;
      // touch = high/low within 25% of a band's width from the band
      const touchBand = 0.25 * mult * sd;
      if (Math.abs(hi - upper[x]) <= touchBand || Math.abs(lo - lower[x]) <= touchBand) touches++;
    }
    const containment = m > 0 ? inside / m : 0;

    if (r2 < (o.minR2 ?? 0)) continue;
    if (containment < (o.minContainment ?? 0)) continue;
    if (touches < (o.minTouches ?? 0)) continue;

    out.push({
      type: "regression",
      label: `Regression channel (${lb}b)`,
      startIdx,
      endIdx,
      upper,
      lower,
      mid: fit,
      r2,
      containment,
      touches,
      slope: b,
      score: r2 * containment,
      stdev: sd,
    });
  }

  out.sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
  return out.slice(0, o.maxChannels ?? out.length);
}

/**
 * Walk-forward pivot-trendline crosses for AutoTrendlineBacktest.
 *
 * Pivot highs/lows use a symmetric window of n bars and only become active
 * n bars after they print. The "upper" line joins the last two known pivot
 * highs, the "lower" line the last two known pivot lows; each bar's close is
 * tested against both extrapolated lines for crossings.
 */
export function computeAutoTrendlines(
  candles: any[],
  n?: number,
  _opts?: PatternOptions
): AutoTrendlineResult {
  const bars = Array.isArray(candles) ? candles : [];
  const len = bars.length;
  const win = Math.max(2, Math.round(n ?? 5));
  const crosses: TrendlineCross[] = [];
  if (len < win * 2 + 2) return { patterns: [], channels: [], crosses };

  const highOf = (b: any): number => (Number.isFinite(b?.high) ? b.high : b?.close ?? b?.value);
  const lowOf = (b: any): number => (Number.isFinite(b?.low) ? b.low : b?.close ?? b?.value);
  const closeOf = (b: any): number => (Number.isFinite(b?.close) ? b.close : b?.value);

  const isPivotHigh = (i: number): boolean => {
    const h = highOf(bars[i]);
    if (!Number.isFinite(h)) return false;
    for (let j = i - win; j <= i + win; j++) {
      if (j === i || j < 0 || j >= len) continue;
      if (highOf(bars[j]) > h) return false;
    }
    return true;
  };
  const isPivotLow = (i: number): boolean => {
    const l = lowOf(bars[i]);
    if (!Number.isFinite(l)) return false;
    for (let j = i - win; j <= i + win; j++) {
      if (j === i || j < 0 || j >= len) continue;
      if (lowOf(bars[j]) < l) return false;
    }
    return true;
  };

  type Line = { x1: number; y1: number; x2: number; y2: number };
  const valueAt = (line: Line, x: number): number =>
    line.y1 + ((line.y2 - line.y1) / (line.x2 - line.x1)) * (x - line.x1);

  let highPivots: number[] = [];
  let lowPivots: number[] = [];
  let upper: Line | null = null;
  let lower: Line | null = null;

  for (let t = 1; t < len; t++) {
    // A pivot at index t-win is confirmed at bar t.
    const confirmIdx = t - win;
    if (confirmIdx >= win) {
      if (isPivotHigh(confirmIdx)) {
        highPivots.push(confirmIdx);
        if (highPivots.length > 2) highPivots = highPivots.slice(-2);
        if (highPivots.length === 2) {
          const [p1, p2] = highPivots;
          upper = { x1: p1, y1: highOf(bars[p1]), x2: p2, y2: highOf(bars[p2]) };
        }
      }
      if (isPivotLow(confirmIdx)) {
        lowPivots.push(confirmIdx);
        if (lowPivots.length > 2) lowPivots = lowPivots.slice(-2);
        if (lowPivots.length === 2) {
          const [p1, p2] = lowPivots;
          lower = { x1: p1, y1: lowOf(bars[p1]), x2: p2, y2: lowOf(bars[p2]) };
        }
      }
    }

    const cPrev = closeOf(bars[t - 1]);
    const cCur = closeOf(bars[t]);
    if (!Number.isFinite(cPrev) || !Number.isFinite(cCur)) continue;

    if (upper && t > upper.x2) {
      const vPrev = valueAt(upper, t - 1);
      const vCur = valueAt(upper, t);
      if (cPrev <= vPrev && cCur > vCur) crosses.push({ kind: "cross_above_upper", barIdx: t, price: cCur, line: "upper" });
      else if (cPrev >= vPrev && cCur < vCur) crosses.push({ kind: "cross_below_upper", barIdx: t, price: cCur, line: "upper" });
    }
    if (lower && t > lower.x2) {
      const vPrev = valueAt(lower, t - 1);
      const vCur = valueAt(lower, t);
      if (cPrev <= vPrev && cCur > vCur) crosses.push({ kind: "cross_above_lower", barIdx: t, price: cCur, line: "lower" });
      else if (cPrev >= vPrev && cCur < vCur) crosses.push({ kind: "cross_below_lower", barIdx: t, price: cCur, line: "lower" });
    }
  }

  return { patterns: [], channels: [], crosses };
}
