// DojiEmoji-style "Auto Trendline" fractal indicator.
//
// Detects n-bar Williams fractal pivots (a pivot high is strictly higher than
// the n bars on each side; a pivot low strictly lower), then connects the two
// most-recent confirmed pivot highs into a resistance line and the two
// most-recent confirmed pivot lows into a support line, projected forward.
//
// Supports "as-of" replay: when an anchor date is given, only bars up to (and
// including) that date are considered, and a pivot at bar i is only "known" once
// its confirmation bar (i + n) has occurred — matching which pivots the indicator
// would have known on that historical day. The line is then projected forward to
// the chart's right edge (the last bar), so you can see whether later price
// respected the level the historical fractals projected.

export interface FractalBar {
  time: string; // YYYY-MM-DD (lexically sortable)
  high: number;
  low: number;
}

export interface FractalLine {
  kind: "resistance" | "support";
  /** Draw points: the two pivots then the right-edge projection (colinear). */
  points: { time: string; value: number }[];
  /** The two pivots the line was fit through. */
  pivots: { time: string; value: number }[];
  /** Slope in price units per bar (positive = rising). */
  slopePerBar: number;
}

export interface FractalTrendlines {
  resistance: FractalLine | null;
  support: FractalLine | null;
  /** Every confirmed pivot high up to the as-of bar (for optional markers). */
  pivotHighs: { time: string; value: number }[];
  /** Every confirmed pivot low up to the as-of bar. */
  pivotLows: { time: string; value: number }[];
  /** The bar date the indicator was evaluated as-of (latest bar if no anchor). */
  asOfTime: string | null;
  n: number;
}

const EMPTY: FractalTrendlines = {
  resistance: null,
  support: null,
  pivotHighs: [],
  pivotLows: [],
  asOfTime: null,
  n: 0,
};

/**
 * Compute fractal resistance/support trendlines for an OHLC bar series.
 *
 * @param bars      OHLC bars sorted ascending by time.
 * @param n         Fractal period — a pivot needs n strictly-lower/higher bars on each side.
 * @param asOfDate  Optional "as-of" date (YYYY-MM-DD). Only bars up to this date are used.
 */
export function computeFractalTrendlines(
  bars: FractalBar[],
  n: number,
  asOfDate?: string | null,
): FractalTrendlines {
  if (!Array.isArray(bars) || bars.length === 0 || !Number.isFinite(n) || n < 1) {
    return { ...EMPTY, n: Number.isFinite(n) ? n : 0 };
  }

  // Resolve the as-of bar: the last bar whose time is <= asOfDate.
  let cutoff = bars.length - 1;
  if (asOfDate) {
    let idx = -1;
    for (let i = 0; i < bars.length; i++) {
      if (bars[i].time <= asOfDate) idx = i;
      else break;
    }
    if (idx < 0) return { ...EMPTY, n }; // anchor predates all data
    cutoff = idx;
  }
  const asOfTime = bars[cutoff].time;

  // Collect pivots confirmed by the as-of bar. A pivot at i needs n bars on each
  // side (i - n >= 0) and is only confirmed once bar i + n exists (i + n <= cutoff).
  const pivotHighIdx: number[] = [];
  const pivotLowIdx: number[] = [];
  for (let i = n; i + n <= cutoff; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    let isHigh = Number.isFinite(h);
    let isLow = Number.isFinite(l);
    for (let k = 1; k <= n; k++) {
      if (isHigh && !(h > bars[i - k].high && h > bars[i + k].high)) isHigh = false;
      if (isLow && !(l < bars[i - k].low && l < bars[i + k].low)) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivotHighIdx.push(i);
    if (isLow) pivotLowIdx.push(i);
  }

  const makeLine = (
    idxs: number[],
    kind: "resistance" | "support",
    pick: "high" | "low",
  ): FractalLine | null => {
    if (idxs.length < 2) return null;
    const i1 = idxs[idxs.length - 2];
    const i2 = idxs[idxs.length - 1];
    const v1 = pick === "high" ? bars[i1].high : bars[i1].low;
    const v2 = pick === "high" ? bars[i2].high : bars[i2].low;
    const slope = i2 === i1 ? 0 : (v2 - v1) / (i2 - i1);
    // Project the line all the way to the chart's right edge (last bar of the
    // full series), not just the as-of bar. The as-of cutoff only decides which
    // pivots are "known"; the line itself extends forward past the anchor so you
    // can see whether later price respected the projected level.
    const lastIdx = bars.length - 1;
    const endVal = v2 + slope * (lastIdx - i2);
    return {
      kind,
      // 3 points: the two real pivots (dot markers land here) then the
      // right-edge projection. All colinear, so it renders as one straight line.
      points: [
        { time: bars[i1].time, value: v1 },
        { time: bars[i2].time, value: v2 },
        { time: bars[lastIdx].time, value: endVal },
      ],
      pivots: [
        { time: bars[i1].time, value: v1 },
        { time: bars[i2].time, value: v2 },
      ],
      slopePerBar: slope,
    };
  };

  return {
    resistance: makeLine(pivotHighIdx, "resistance", "high"),
    support: makeLine(pivotLowIdx, "support", "low"),
    pivotHighs: pivotHighIdx.map((i) => ({ time: bars[i].time, value: bars[i].high })),
    pivotLows: pivotLowIdx.map((i) => ({ time: bars[i].time, value: bars[i].low })),
    asOfTime,
    n,
  };
}
