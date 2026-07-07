// Chart-pattern detection engine for the Charts-tab Pattern Recognition panel.
// Pure (no React / no chart lib). Operates on OHLC bars, returns detected
// patterns with drawing geometry (index/price space) + metadata so the caller
// can render overlays and compute a "most relevant" ranking.
//
// Covered: double top/bottom, triple top/bottom, head & shoulders (+ inverse),
// ascending/descending/symmetrical triangles, rising/falling wedges, rectangle.
// Pattern keys match PatternsPanel's PATTERN_LIST.

export interface PatternBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PatternLine {
  points: { idx: number; price: number }[];
  dashed?: boolean;
}

export interface DetectedPattern {
  key: string;            // PatternsPanel key, e.g. "double_top"
  label: string;          // human label, e.g. "Double Top"
  direction: number;      // +1 bullish, -1 bearish, 0 neutral
  confidence: number;     // 0..1 geometric-fit confidence
  startIdx: number;
  endIdx: number;
  lines: PatternLine[];   // polylines to draw (index/price space)
  markers?: { idx: number; price: number; text?: string }[];
  neckline?: number;      // trigger level (breakout/confirmation)
  target?: number;        // measured-move price target
  // filled in by rankRelevance():
  relevance?: number;
  components?: { confidence: number; recency: number; proximity: number };
}

export interface DetectOptions {
  sensitivity?: number;   // 0 (strict) .. 100 (loose)
  lookbackBars?: number;  // 0 = all history
  maxPatterns?: number;   // 0 = unlimited
  perPattern?: Record<string, boolean>;
}

const LABELS: Record<string, string> = {
  double_top: "Double Top",
  double_bottom: "Double Bottom",
  triple_top: "Triple Top",
  triple_bottom: "Triple Bottom",
  head_shoulders: "Head & Shoulders",
  inv_head_shoulders: "Inverse Head & Shoulders",
  asc_triangle: "Ascending Triangle",
  desc_triangle: "Descending Triangle",
  sym_triangle: "Symmetrical Triangle",
  rising_wedge: "Rising Wedge",
  falling_wedge: "Falling Wedge",
  rectangle: "Rectangle / Channel",
};

/* ── Small math helpers ─────────────────────────────────────────────── */

function pctDiff(a: number, b: number): number {
  const m = (Math.abs(a) + Math.abs(b)) / 2;
  return m === 0 ? 0 : Math.abs(a - b) / m;
}

function linReg(pts: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0]?.y ?? 0, r2: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; }
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const ssTot = syy - (sy * sy) / n;
  let ssRes = 0;
  for (const p of pts) { const e = p.y - (slope * p.x + intercept); ssRes += e * e; }
  const r2 = ssTot <= 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

/* ── Pivot detection ────────────────────────────────────────────────── */

interface Pivot { idx: number; price: number; kind: "H" | "L"; }

function findPivots(bars: PatternBar[], strength: number): Pivot[] {
  const n = bars.length;
  const out: Pivot[] = [];
  for (let i = strength; i < n - strength; i++) {
    const hi = bars[i].high, lo = bars[i].low;
    let isHigh = true, isLow = true;
    for (let k = 1; k <= strength; k++) {
      if (bars[i - k].high >= hi || bars[i + k].high > hi) isHigh = false;
      if (bars[i - k].low <= lo || bars[i + k].low < lo) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) out.push({ idx: i, price: hi, kind: "H" });
    if (isLow) out.push({ idx: i, price: lo, kind: "L" });
  }
  out.sort((a, b) => a.idx - b.idx);
  return out;
}

/* ── Config derived from sensitivity ────────────────────────────────── */

function tuning(sensitivity: number) {
  const s = Math.max(0, Math.min(100, sensitivity)) / 100;
  return {
    // Strict (low s) → larger pivot window (fewer, stronger pivots).
    strength: Math.round(3 + (1 - s) * 7),        // 3..10
    // Loose → wider "equal price" tolerance.
    priceTol: 0.012 + s * 0.03,                    // 1.2%..4.2%
    // Loose → lower confidence bar.
    minConf: 0.72 - s * 0.34,                      // 0.72..0.38
    // Line-fit quality bar for triangles/wedges/rectangles.
    minR2: 0.55 - s * 0.25,                        // 0.55..0.30
  };
}

/* ── Reversal patterns (from a pivot sequence) ──────────────────────── */

function detectReversals(bars: PatternBar[], pivots: Pivot[], startBound: number, t: ReturnType<typeof tuning>, enabled: (k: string) => boolean): DetectedPattern[] {
  const out: DetectedPattern[] = [];
  const highs = pivots.filter((p) => p.kind === "H");
  const lows = pivots.filter((p) => p.kind === "L");

  const between = (arr: Pivot[], a: number, b: number) => arr.filter((p) => p.idx > a && p.idx < b);

  // Double / Triple tops (two/three similar highs with troughs between)
  const scanTops = (count: 2 | 3) => {
    for (let i = 0; i + count - 1 < highs.length; i++) {
      const grp = highs.slice(i, i + count);
      if (grp[0].idx < startBound) continue;
      if (grp.some((g, k) => k > 0 && pctDiff(g.price, grp[0].price) > t.priceTol)) continue;
      const troughs: Pivot[] = [];
      for (let k = 0; k < count - 1; k++) {
        const tr = between(lows, grp[k].idx, grp[k + 1].idx).sort((a, b) => a.price - b.price)[0];
        if (!tr) { troughs.length = 0; break; }
        troughs.push(tr);
      }
      if (troughs.length !== count - 1) continue;
      const peak = grp.reduce((s, g) => s + g.price, 0) / count;
      const neck = Math.max(...troughs.map((tr) => tr.price));
      const depth = (peak - neck) / peak;
      if (depth < 0.02) continue; // trough must be meaningfully below peaks
      const sym = 1 - Math.max(...grp.map((g) => pctDiff(g.price, peak))) / t.priceTol;
      const conf = Math.max(0, Math.min(1, 0.5 * sym + 0.5 * Math.min(1, depth / 0.12)));
      if (conf < t.minConf) continue;
      const key = count === 2 ? "double_top" : "triple_top";
      if (!enabled(key)) continue;
      out.push({
        key, label: LABELS[key], direction: -1, confidence: conf,
        startIdx: grp[0].idx, endIdx: grp[count - 1].idx,
        lines: [
          { points: grp.map((g) => ({ idx: g.idx, price: g.price })) },
          { points: [{ idx: grp[0].idx, price: neck }, { idx: grp[count - 1].idx, price: neck }], dashed: true },
        ],
        markers: grp.map((g, k) => ({ idx: g.idx, price: g.price, text: count === 3 ? ["1", "2", "3"][k] : undefined })),
        neckline: neck, target: neck - (peak - neck),
      });
    }
  };
  const scanBottoms = (count: 2 | 3) => {
    for (let i = 0; i + count - 1 < lows.length; i++) {
      const grp = lows.slice(i, i + count);
      if (grp[0].idx < startBound) continue;
      if (grp.some((g, k) => k > 0 && pctDiff(g.price, grp[0].price) > t.priceTol)) continue;
      const peaks: Pivot[] = [];
      for (let k = 0; k < count - 1; k++) {
        const pk = between(highs, grp[k].idx, grp[k + 1].idx).sort((a, b) => b.price - a.price)[0];
        if (!pk) { peaks.length = 0; break; }
        peaks.push(pk);
      }
      if (peaks.length !== count - 1) continue;
      const bottom = grp.reduce((s, g) => s + g.price, 0) / count;
      const neck = Math.min(...peaks.map((pk) => pk.price));
      const depth = (neck - bottom) / bottom;
      if (depth < 0.02) continue;
      const sym = 1 - Math.max(...grp.map((g) => pctDiff(g.price, bottom))) / t.priceTol;
      const conf = Math.max(0, Math.min(1, 0.5 * sym + 0.5 * Math.min(1, depth / 0.12)));
      if (conf < t.minConf) continue;
      const key = count === 2 ? "double_bottom" : "triple_bottom";
      if (!enabled(key)) continue;
      out.push({
        key, label: LABELS[key], direction: 1, confidence: conf,
        startIdx: grp[0].idx, endIdx: grp[count - 1].idx,
        lines: [
          { points: grp.map((g) => ({ idx: g.idx, price: g.price })) },
          { points: [{ idx: grp[0].idx, price: neck }, { idx: grp[count - 1].idx, price: neck }], dashed: true },
        ],
        markers: grp.map((g, k) => ({ idx: g.idx, price: g.price, text: count === 3 ? ["1", "2", "3"][k] : undefined })),
        neckline: neck, target: neck + (neck - bottom),
      });
    }
  };
  scanTops(2); scanTops(3); scanBottoms(2); scanBottoms(3);

  // Head & Shoulders: highs L < H > R, shoulders ~equal, two troughs → neckline
  const scanHS = (inverse: boolean) => {
    const piv = inverse ? lows : highs;
    const opp = inverse ? highs : lows;
    for (let i = 0; i + 2 < piv.length; i++) {
      const [a, b, c] = [piv[i], piv[i + 1], piv[i + 2]];
      if (a.idx < startBound) continue;
      const headBigger = inverse ? (b.price < a.price && b.price < c.price) : (b.price > a.price && b.price > c.price);
      if (!headBigger) continue;
      if (pctDiff(a.price, c.price) > t.priceTol * 1.6) continue; // shoulders ~equal
      const t1 = between(opp, a.idx, b.idx).sort((x, y) => inverse ? y.price - x.price : x.price - y.price)[0];
      const t2 = between(opp, b.idx, c.idx).sort((x, y) => inverse ? y.price - x.price : x.price - y.price)[0];
      if (!t1 || !t2) continue;
      const headProm = inverse
        ? (Math.min(a.price, c.price) - b.price) / b.price
        : (b.price - Math.max(a.price, c.price)) / b.price;
      if (headProm < 0.015) continue;
      const sym = 1 - pctDiff(a.price, c.price) / (t.priceTol * 1.6);
      const conf = Math.max(0, Math.min(1, 0.45 * sym + 0.55 * Math.min(1, headProm / 0.1)));
      if (conf < t.minConf) continue;
      const key = inverse ? "inv_head_shoulders" : "head_shoulders";
      if (!enabled(key)) continue;
      // Neckline through the two troughs, projected across the pattern.
      const slope = (t2.price - t1.price) / (t2.idx - t1.idx || 1);
      const neckAt = (idx: number) => t1.price + slope * (idx - t1.idx);
      out.push({
        key, label: LABELS[key], direction: inverse ? 1 : -1, confidence: conf,
        startIdx: a.idx, endIdx: c.idx,
        lines: [
          { points: [a, b, c].map((p) => ({ idx: p.idx, price: p.price })) },
          { points: [{ idx: a.idx, price: neckAt(a.idx) }, { idx: c.idx, price: neckAt(c.idx) }], dashed: true },
        ],
        markers: [
          { idx: a.idx, price: a.price, text: "S" },
          { idx: b.idx, price: b.price, text: "H" },
          { idx: c.idx, price: c.price, text: "S" },
        ],
        neckline: neckAt(c.idx),
        target: inverse ? neckAt(c.idx) + (neckAt(b.idx) - b.price) : neckAt(c.idx) - (b.price - neckAt(b.idx)),
      });
    }
  };
  scanHS(false); scanHS(true);

  return out;
}

/* ── Consolidation patterns (line fits over a recent window) ────────── */

function detectConsolidations(bars: PatternBar[], pivots: Pivot[], startBound: number, t: ReturnType<typeof tuning>, enabled: (k: string) => boolean): DetectedPattern[] {
  const out: DetectedPattern[] = [];
  const n = bars.length;
  const windows = [60, 90, 130];
  for (const W of windows) {
    const lo = Math.max(startBound, n - W);
    const hi = n - 1;
    if (hi - lo < 30) continue;
    const H = pivots.filter((p) => p.kind === "H" && p.idx >= lo && p.idx <= hi);
    const L = pivots.filter((p) => p.kind === "L" && p.idx >= lo && p.idx <= hi);
    if (H.length < 3 || L.length < 3) continue;

    const resFit = linReg(H.map((p) => ({ x: p.idx, y: p.price })));
    const supFit = linReg(L.map((p) => ({ x: p.idx, y: p.price })));
    if (resFit.r2 < t.minR2 || supFit.r2 < t.minR2) continue;

    const avgPrice = bars.slice(lo, hi + 1).reduce((s, b) => s + b.close, 0) / (hi - lo + 1);
    const span = hi - lo;
    // slope as fractional price change across the window
    const resPct = (resFit.slope * span) / avgPrice;
    const supPct = (supFit.slope * span) / avgPrice;
    const flat = 0.03; // <3% drift over window ≈ flat

    const resAt = (x: number) => resFit.slope * x + resFit.intercept;
    const supAt = (x: number) => supFit.slope * x + supFit.intercept;
    const gapStart = resAt(lo) - supAt(lo);
    const gapEnd = resAt(hi) - supAt(hi);
    if (gapEnd <= 0) continue; // lines crossed — not a clean channel
    const converging = gapEnd < gapStart * 0.85;

    const mkLines = (): PatternLine[] => [
      { points: [{ idx: lo, price: resAt(lo) }, { idx: hi, price: resAt(hi) }] },
      { points: [{ idx: lo, price: supAt(lo) }, { idx: hi, price: supAt(hi) }] },
    ];
    const fitConf = Math.max(0, Math.min(1, (resFit.r2 + supFit.r2) / 2));
    let key = "", direction = 0;

    if (Math.abs(resPct) < flat && supPct > flat && converging) { key = "asc_triangle"; direction = 1; }
    else if (Math.abs(supPct) < flat && resPct < -flat && converging) { key = "desc_triangle"; direction = -1; }
    else if (resPct < -flat && supPct > flat && converging) { key = "sym_triangle"; direction = 0; }
    else if (resPct > flat && supPct > flat && converging) { key = "rising_wedge"; direction = -1; }
    else if (resPct < -flat && supPct < -flat && converging) { key = "falling_wedge"; direction = 1; }
    else if (Math.abs(resPct) < flat && Math.abs(supPct) < flat) { key = "rectangle"; direction = 0; }
    else continue;

    if (!enabled(key)) continue;
    const conf = Math.max(0, Math.min(1, fitConf * (converging || key === "rectangle" ? 1 : 0.8)));
    if (conf < t.minConf) continue;

    out.push({
      key, label: LABELS[key], direction, confidence: conf,
      startIdx: lo, endIdx: hi,
      lines: mkLines(),
      neckline: direction >= 0 ? resAt(hi) : supAt(hi),
      target: undefined,
    });
    break; // one consolidation classification is enough per scan
  }
  return out;
}

/* ── De-dup + limit ─────────────────────────────────────────────────── */

function dedupe(patterns: DetectedPattern[]): DetectedPattern[] {
  const kept: DetectedPattern[] = [];
  for (const p of patterns.sort((a, b) => b.confidence - a.confidence)) {
    const overlap = kept.some((k) => k.key === p.key && !(p.endIdx < k.startIdx || p.startIdx > k.endIdx));
    if (!overlap) kept.push(p);
  }
  return kept;
}

/* ── Public API ─────────────────────────────────────────────────────── */

export function detectChartPatterns(bars: PatternBar[], opts: DetectOptions = {}): DetectedPattern[] {
  const n = bars.length;
  if (n < 40) return [];
  const t = tuning(opts.sensitivity ?? 60);
  const startBound = opts.lookbackBars && opts.lookbackBars > 0 ? Math.max(0, n - opts.lookbackBars) : 0;
  const enabled = (k: string) => !opts.perPattern || opts.perPattern[k] !== false;

  const pivots = findPivots(bars, t.strength);
  let found = [
    ...detectReversals(bars, pivots, startBound, t, enabled),
    ...detectConsolidations(bars, pivots, startBound, t, enabled),
  ];
  found = dedupe(found);
  found.sort((a, b) => b.endIdx - a.endIdx || b.confidence - a.confidence);
  const max = opts.maxPatterns && opts.maxPatterns > 0 ? opts.maxPatterns : found.length;
  return found.slice(0, max);
}

/** Score patterns by confidence + recency + proximity to their trigger price. */
export function rankRelevance(patterns: DetectedPattern[], bars: PatternBar[], lookback: number): DetectedPattern[] {
  const n = bars.length;
  const price = bars[n - 1]?.close ?? 0;
  const win = lookback > 0 ? lookback : n;
  for (const p of patterns) {
    const recency = Math.max(0, Math.min(1, 1 - (n - 1 - p.endIdx) / Math.max(1, win)));
    const trigger = p.neckline ?? p.target ?? price;
    const proximity = price > 0 ? Math.max(0, 1 - Math.min(1, Math.abs(price - trigger) / (price * 0.06))) : 0;
    const relevance = 0.45 * p.confidence + 0.3 * recency + 0.25 * proximity;
    p.components = { confidence: p.confidence, recency, proximity };
    p.relevance = relevance;
  }
  return [...patterns].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}
