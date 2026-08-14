// Support/Resistance level detection engine. Extracted verbatim from
// components/SupportResistance.tsx so other surfaces (e.g. the Re-Rate page)
// can detect critical levels on any numeric series (pass highs=lows=closes).
import { computeAllMAs } from "@/lib/maUtils";

const DEFAULT_SR_CONFIG = {
  tolerancePct: 0.005,
  bounceLookahead: 5,
  bounceThresholdPct: 0.015,
  holdBars: 5,
  pivotLeft: 5,
  pivotRight: 5,
  pivotClusterPct: 0.01,
  enableHorizontal: true,
  enableMA: true,
  enableFib: true,
  maTypes: ["SMA", "EMA", "WMA", "HMA", "KAMA", "FRAMA", "T3", "ALMA", "LSMA", "SLSMA"],
  maPeriods: [20, 50, 100, 200],
  fibLookbackBars: 252,
  minTouches: 3,
};

// ── Math helpers ───────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = Date.parse(dateA), b = Date.parse(dateB);
  return isNaN(a) || isNaN(b) ? 0 : Math.round(Math.abs(b - a) / 86400000);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface TouchEvent { date: string; index: number; side: "support" | "resistance"; bouncedReverse: boolean; bounceMagnitudePct: number | null; heldWithoutBreak: boolean; }

interface TouchResult {
  touches: TouchEvent[];
  touchCount: number;
  bounceReverseCount: number;
  bounceReverseRate: number;
  avgBounceMagnitudePct: number;
  holdCount: number;
  holdRate: number;
  lastTouchDate: string | null;
  daysSinceLastTouch: number | null;
  compositeScore: number;
}

function evaluateTouches(levelPrice: number, ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] }, cfg: typeof DEFAULT_SR_CONFIG): TouchResult {
  const { closes, highs, lows, dates } = ohlc;
  const n = closes.length;
  const { tolerancePct, bounceLookahead, bounceThresholdPct, holdBars } = cfg;
  const events: TouchEvent[] = [];

  for (let i = 0; i < n; i++) {
    const c = closes[i], h = highs[i], lo = lows[i];
    const closeTol = Math.abs(c - levelPrice) / c <= tolerancePct;
    const highTol = Math.abs(h - levelPrice) / levelPrice <= tolerancePct;
    const lowTol = Math.abs(lo - levelPrice) / levelPrice <= tolerancePct;
    if (!closeTol && !highTol && !lowTol) continue;
    const side: "support" | "resistance" = c >= levelPrice ? "support" : "resistance";
    let bounced = false, bounceMag: number | null = null;
    const lookEnd = Math.min(n - 1, i + bounceLookahead);
    if (side === "support") {
      const threshold = levelPrice * (1 + bounceThresholdPct);
      let maxMove = -Infinity;
      for (let k = i + 1; k <= lookEnd; k++) {
        if (closes[k] >= threshold) bounced = true;
        const move = (closes[k] - levelPrice) / levelPrice;
        if (move > maxMove) maxMove = move;
      }
      if (maxMove > -Infinity) bounceMag = maxMove * 100;
    } else {
      const threshold = levelPrice * (1 - bounceThresholdPct);
      let maxMove = -Infinity;
      for (let k = i + 1; k <= lookEnd; k++) {
        if (closes[k] <= threshold) bounced = true;
        const move = (levelPrice - closes[k]) / levelPrice;
        if (move > maxMove) maxMove = move;
      }
      if (maxMove > -Infinity) bounceMag = maxMove * 100;
    }
    const holdEnd = Math.min(n - 1, i + holdBars);
    let held = true;
    if (side === "support") {
      const floor = levelPrice * (1 - tolerancePct);
      for (let k = i + 1; k <= holdEnd; k++) { if (closes[k] < floor) { held = false; break; } }
    } else {
      const ceil = levelPrice * (1 + tolerancePct);
      for (let k = i + 1; k <= holdEnd; k++) { if (closes[k] > ceil) { held = false; break; } }
    }
    events.push({ date: dates[i], index: i, side, bouncedReverse: bounced, bounceMagnitudePct: bounceMag, heldWithoutBreak: held });
  }

  const tc = events.length;
  if (tc === 0) return { touches: events, touchCount: 0, bounceReverseCount: 0, bounceReverseRate: 0, avgBounceMagnitudePct: 0, holdCount: 0, holdRate: 0, lastTouchDate: null, daysSinceLastTouch: null, compositeScore: 0 };
  const brc = events.filter(e => e.bouncedReverse).length;
  const brr = brc / tc;
  const mags = events.map(e => e.bounceMagnitudePct).filter((v): v is number => v !== null && v >= 0);
  const avgBounce = mags.length > 0 ? mags.reduce((s, v) => s + v, 0) / mags.length : 0;
  const holdCount = events.filter(e => e.heldWithoutBreak).length;
  const holdRate = holdCount / tc;
  const sortedDates = [...events.map(e => e.date)].sort();
  const lastDate = sortedDates[sortedDates.length - 1] ?? null;
  const today = todayStr();
  const daysSince = lastDate !== null ? daysBetween(lastDate, today) : null;
  const touchScore = Math.min(tc / 10, 1);
  const recency = daysSince !== null ? Math.max(0, 1 - daysSince / 365) : 0;
  const composite = 0.3 * touchScore + 0.3 * brr + 0.2 * holdRate + 0.2 * recency;
  return { touches: events, touchCount: tc, bounceReverseCount: brc, bounceReverseRate: brr, avgBounceMagnitudePct: avgBounce, holdCount, holdRate, lastTouchDate: lastDate, daysSinceLastTouch: daysSince, compositeScore: composite };
}

interface SRLevel {
  type: "horizontal" | "ma" | "fib";
  price: number;
  maType?: string;
  maPeriod?: number;
  fibLevel?: number;
  fibSwingHigh?: number;
  fibSwingLow?: number;
  touches: TouchEvent[];
  touchCount: number;
  bounceReverseCount: number;
  bounceReverseRate: number;
  avgBounceMagnitudePct: number;
  holdCount: number;
  holdRate: number;
  lastTouchDate: string | null;
  daysSinceLastTouch: number | null;
  compositeScore: number;
}

function mergeTouchResult(base: any, result: TouchResult): SRLevel {
  return { type: base.type, price: base.price, maType: base.maType, maPeriod: base.maPeriod, fibLevel: base.fibLevel, fibSwingHigh: base.fibSwingHigh, fibSwingLow: base.fibSwingLow, ...result };
}

function detectHorizontalLevels(ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] }, cfg: typeof DEFAULT_SR_CONFIG): SRLevel[] {
  const { closes, highs, lows } = ohlc;
  const { pivotLeft, pivotRight, pivotClusterPct, minTouches } = cfg;
  const n = closes.length;
  const pivotPrices: number[] = [];
  for (let i = pivotLeft; i < n - pivotRight; i++) {
    let isHigh = true;
    for (let k = i - pivotLeft; k < i; k++) if (highs[i] <= highs[k]) { isHigh = false; break; }
    if (isHigh) {
      for (let k = i + 1; k <= i + pivotRight; k++) if (highs[i] <= highs[k]) { isHigh = false; break; }
    }
    if (isHigh) pivotPrices.push(highs[i]);
    let isLow = true;
    for (let k = i - pivotLeft; k < i; k++) if (lows[i] >= lows[k]) { isLow = false; break; }
    if (isLow) {
      for (let k = i + 1; k <= i + pivotRight; k++) if (lows[i] >= lows[k]) { isLow = false; break; }
    }
    if (isLow) pivotPrices.push(lows[i]);
  }
  if (pivotPrices.length === 0) return [];
  pivotPrices.sort((a, b) => a - b);
  const clusters: number[][] = [];
  let current = [pivotPrices[0]];
  for (let i = 1; i < pivotPrices.length; i++) {
    const last = current[current.length - 1];
    if (Math.abs(pivotPrices[i] - last) / last <= pivotClusterPct) {
      current.push(pivotPrices[i]);
    } else {
      clusters.push(current);
      current = [pivotPrices[i]];
    }
  }
  clusters.push(current);
  const levels: SRLevel[] = [];
  for (const cluster of clusters) {
    const avg = cluster.reduce((s, v) => s + v, 0) / cluster.length;
    const result = evaluateTouches(avg, ohlc, cfg);
    if (result.touchCount < minTouches) continue;
    levels.push(mergeTouchResult({ type: "horizontal", price: avg }, result));
  }
  return levels;
}

function detectMALevels(ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] }, cfg: typeof DEFAULT_SR_CONFIG): SRLevel[] {
  const { closes, highs, lows } = ohlc;
  const n = closes.length;
  const { maTypes, maPeriods, tolerancePct, minTouches } = cfg;
  const levels: SRLevel[] = [];
  for (const maType of maTypes) {
    for (const period of maPeriods) {
      const ma = computeAllMAs(closes, period, maType, { highs, lows });
      let lastMaVal: number | null = null;
      for (let i = n - 1; i >= 0; i--) { if (ma[i] !== null) { lastMaVal = ma[i]; break; } }
      if (lastMaVal === null) continue;
      const currentPrice = lastMaVal;
      const touches: TouchEvent[] = [];
      for (let i = 0; i < n; i++) {
        const mv = ma[i];
        if (mv === null) continue;
        const c = closes[i], h = highs[i], lo = lows[i];
        const closeTol = Math.abs(c - mv) / c <= tolerancePct;
        const highTol = Math.abs(h - mv) / mv <= tolerancePct;
        const lowTol = Math.abs(lo - mv) / mv <= tolerancePct;
        if (!closeTol && !highTol && !lowTol) continue;
        const side: "support" | "resistance" = c >= mv ? "support" : "resistance";
        const { bounceLookahead, bounceThresholdPct, holdBars } = cfg;
        let bounced = false, bounceMag: number | null = null;
        const lookEnd = Math.min(n - 1, i + bounceLookahead);
        if (side === "support") {
          const threshold = mv * (1 + bounceThresholdPct);
          let maxMove = -Infinity;
          for (let k = i + 1; k <= lookEnd; k++) { if (closes[k] >= threshold) bounced = true; const move = (closes[k] - mv) / mv; if (move > maxMove) maxMove = move; }
          if (maxMove > -Infinity) bounceMag = maxMove * 100;
        } else {
          const threshold = mv * (1 - bounceThresholdPct);
          let maxMove = -Infinity;
          for (let k = i + 1; k <= lookEnd; k++) { if (closes[k] <= threshold) bounced = true; const move = (mv - closes[k]) / mv; if (move > maxMove) maxMove = move; }
          if (maxMove > -Infinity) bounceMag = maxMove * 100;
        }
        const holdEnd = Math.min(n - 1, i + holdBars);
        let held = true;
        if (side === "support") {
          const floor = mv * (1 - tolerancePct);
          for (let k = i + 1; k <= holdEnd; k++) { if (closes[k] < floor) { held = false; break; } }
        } else {
          const ceil = mv * (1 + tolerancePct);
          for (let k = i + 1; k <= holdEnd; k++) { if (closes[k] > ceil) { held = false; break; } }
        }
        touches.push({ date: ohlc.dates[i], index: i, side, bouncedReverse: bounced, bounceMagnitudePct: bounceMag, heldWithoutBreak: held });
      }
      const tc = touches.length;
      if (tc < minTouches) continue;
      const brc = touches.filter(t => t.bouncedReverse).length;
      const brr = brc / tc;
      const mags = touches.map(t => t.bounceMagnitudePct).filter((v): v is number => v !== null && v >= 0);
      const avgBounce = mags.length > 0 ? mags.reduce((s, v) => s + v, 0) / mags.length : 0;
      const holdCount = touches.filter(t => t.heldWithoutBreak).length;
      const holdRate = holdCount / tc;
      const sortedDates = [...touches.map(t => t.date)].sort();
      const lastDate = sortedDates[sortedDates.length - 1] ?? null;
      const daysSince = lastDate !== null ? daysBetween(lastDate, todayStr()) : null;
      const touchScore = Math.min(tc / 10, 1);
      const recency = daysSince !== null ? Math.max(0, 1 - daysSince / 365) : 0;
      const composite = 0.3 * touchScore + 0.3 * brr + 0.2 * holdRate + 0.2 * recency;
      levels.push({ type: "ma", price: currentPrice, maType, maPeriod: period, touches, touchCount: tc, bounceReverseCount: brc, bounceReverseRate: brr, avgBounceMagnitudePct: avgBounce, holdCount, holdRate, lastTouchDate: lastDate, daysSinceLastTouch: daysSince, compositeScore: composite });
    }
  }
  return levels;
}

const FIB_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786];

function detectFibLevels(ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] }, cfg: typeof DEFAULT_SR_CONFIG): SRLevel[] {
  const { highs, lows } = ohlc;
  const { fibLookbackBars, minTouches } = cfg;
  const n = ohlc.closes.length;
  const lookbackStart = Math.max(0, n - fibLookbackBars);
  let swingHighIdx = lookbackStart, swingLowIdx = lookbackStart;
  for (let i = lookbackStart; i < n; i++) {
    if (highs[i] > highs[swingHighIdx]) swingHighIdx = i;
    if (lows[i] < lows[swingLowIdx]) swingLowIdx = i;
  }
  const swingHigh = highs[swingHighIdx], swingLow = lows[swingLowIdx];
  const range = swingHigh - swingLow;
  if (range <= 0) return [];
  const levels: SRLevel[] = [];
  for (const fib of FIB_LEVELS) {
    const price = swingHighIdx >= swingLowIdx ? swingHigh - range * fib : swingLow + range * fib;
    const result = evaluateTouches(price, ohlc, cfg);
    if (result.touchCount < minTouches) continue;
    levels.push(mergeTouchResult({ type: "fib", price, fibLevel: fib, fibSwingHigh: swingHigh, fibSwingLow: swingLow }, result));
  }
  return levels;
}

function detectSRLevels(ohlc: { closes: number[]; highs: number[]; lows: number[]; dates: string[] }, userCfg?: Partial<typeof DEFAULT_SR_CONFIG>): SRLevel[] {
  const cfg = { ...DEFAULT_SR_CONFIG, ...userCfg };
  if (ohlc.closes.length === 0) return [];
  const all: SRLevel[] = [];
  if (cfg.enableHorizontal) all.push(...detectHorizontalLevels(ohlc, cfg));
  if (cfg.enableMA) all.push(...detectMALevels(ohlc, cfg));
  if (cfg.enableFib) all.push(...detectFibLevels(ohlc, cfg));
  all.sort((a, b) => b.compositeScore - a.compositeScore);
  return all;
}

export { detectSRLevels, DEFAULT_SR_CONFIG, evaluateTouches };
export type { SRLevel, TouchEvent, TouchResult };
