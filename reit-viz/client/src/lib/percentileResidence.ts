// Percentile residence & propensity analysis.
//
// For a valuation multiple we compute, at every date, the as-of percentile of
// the multiple within its own history (no look-ahead). From that series we
// derive: how much time the name has spent in each percentile band, how often /
// how persistently it visits the rich and cheap extremes, how rare its current
// (and pro-forma, after an X% price move) level is, and — conditioning on those
// extremes — the forward price return that historically followed.
//
// Everything is oriented to "richness": for price multiples (P/FFO, …) rich =
// high value; for yields rich = low value. So 90 = expensive, 10 = cheap,
// regardless of the metric, and an X% price rise always increases richness.

import type { MultipleDir } from "./valuationRerate";

export interface TimeValue { time: string; value: number }
export type PctBasis = "expanding" | "trailing";

/** Richness-percentile bands (top is inclusive of 100). */
export const RESIDENCE_BANDS: [number, number][] = [
  [0, 10], [10, 25], [25, 50], [50, 75], [75, 90], [90, 100],
];
export const RESIDENCE_BAND_LABELS = ["0–10", "10–25", "25–50", "50–75", "75–90", "90–100"];

export interface FwdStat { median: number; hitRate: number; n: number }
export interface ResidenceResult {
  m0: number;
  /** richness percentile now (0=cheapest, 100=richest) */
  currentRich: number;
  /** richness percentile after the +pctMove price move */
  proFormaRich: number;
  /** pro-forma level never reached before (richer than all history) */
  proFormaUnprecedented: boolean;
  /** % of history at least as rich as the pro-forma level */
  proFormaFreqRicher: number;
  /** % of observations in each richness band (RESIDENCE_BANDS) */
  residence: number[];
  /** rich tail (richness ≥ 90) excursion stats */
  richCount: number; richMedDur: number; richPctTime: number;
  /** cheap tail (richness ≤ 10) excursion stats */
  cheapCount: number; cheapMedDur: number; cheapPctTime: number;
  /** forward price return conditioned on tail, keyed by horizon (trading days) */
  fwd: Record<number, { rich: FwdStat; cheap: FwdStat; base: FwdStat }>;
  /** usable observation count */
  n: number;
}

// ── Fenwick (BIT) over compressed value ranks, for fast windowed percentiles ──
function makeFenwick(size: number) {
  const tree = new Float64Array(size + 1);
  return {
    add(i: number, delta: number) { for (let x = i; x <= size; x += x & -x) tree[x] += delta; },
    prefix(i: number) { let s = 0; for (let x = i; x > 0; x -= x & -x) s += tree[x]; return s; },
  };
}

/**
 * As-of percentile (0–100) of each value within its history.
 *  - expanding: vs all values up to and including i
 *  - trailing:  vs the last `window` values ending at i
 * Percentile = (# strictly below) / (n − 1) · 100, matching percentileRank.
 */
export function asOfPercentileSeries(values: number[], basis: PctBasis, window: number): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (n === 0) return out;

  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const U = sorted.length;
  const rankOf = (v: number) => {
    let lo = 0, hi = U;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    return lo + 1; // 1-based rank; equal values share a rank
  };

  const fen = makeFenwick(U);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const ri = rankOf(values[i]);
    fen.add(ri, 1); count++;
    if (basis === "trailing" && i >= window) {
      fen.add(rankOf(values[i - window]), -1); count--;
    }
    out[i] = count > 1 ? (fen.prefix(ri - 1) / (count - 1)) * 100 : 50;
  }
  return out;
}

/** Convert a raw-value percentile to richness (rich = expensive). */
function toRichness(p: number, lowIsCheap: boolean): number {
  return lowIsCheap ? p : 100 - p;
}

function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Count + median duration of consecutive runs where pred(richness) holds. */
function excursions(rich: number[], pred: (r: number) => boolean) {
  const durations: number[] = [];
  let run = 0, total = 0;
  for (const r of rich) {
    if (Number.isFinite(r) && pred(r)) { run++; total++; }
    else if (run > 0) { durations.push(run); run = 0; }
  }
  if (run > 0) durations.push(run);
  return { count: durations.length, medDur: median(durations), pctTime: rich.length ? (total / rich.length) * 100 : 0 };
}

export interface ResidenceOpts {
  basis: PctBasis;
  window: number;        // trailing window length (trading days)
  pctMove: number;       // pro-forma price move %
  dir: MultipleDir;
  lowIsCheap: boolean;
  horizons: number[];    // forward-return horizons (trading days)
}

/**
 * Build the residence/propensity result for one ticker from its multiple and
 * close series (both ascending by date). Returns null if history is too short.
 */
export function buildResidence(
  multiple: TimeValue[],
  close: TimeValue[],
  opts: ResidenceOpts,
): ResidenceResult | null {
  const pts = multiple.filter((p) => Number.isFinite(p.value));
  const n = pts.length;
  if (n < 30) return null;
  const values = pts.map((p) => p.value);

  const rawPct = asOfPercentileSeries(values, opts.basis, opts.window);
  const rich = rawPct.map((p) => toRichness(p, opts.lowIsCheap));

  // Residence histogram over richness.
  const residence = new Array(RESIDENCE_BANDS.length).fill(0);
  let counted = 0;
  for (const r of rich) {
    if (!Number.isFinite(r)) continue;
    counted++;
    for (let b = 0; b < RESIDENCE_BANDS.length; b++) {
      const [lo, hi] = RESIDENCE_BANDS[b];
      if (r >= lo && (b === RESIDENCE_BANDS.length - 1 ? r <= hi : r < hi)) { residence[b]++; break; }
    }
  }
  for (let b = 0; b < residence.length; b++) residence[b] = counted ? (residence[b] / counted) * 100 : 0;

  const richEx = excursions(rich, (r) => r >= 90);
  const cheapEx = excursions(rich, (r) => r <= 10);

  // Current + pro-forma. Reference distribution = the window the "now" percentile
  // sees: last `window` values for trailing, all values for expanding.
  const m0 = values[n - 1];
  const ref = opts.basis === "trailing" ? values.slice(Math.max(0, n - opts.window)) : values;
  const f = 1 + opts.pctMove / 100;
  const proForma = opts.dir === "inverse" ? m0 / f : m0 * f;

  const currentRich = rich[n - 1];
  // richer-or-equal: direct → larger value richer; inverse → smaller value richer
  const richerEq = (a: number, b: number) => (opts.dir === "inverse" ? a <= b : a >= b);
  const freqRicher = ref.length ? (ref.filter((v) => richerEq(v, proForma)).length / ref.length) * 100 : 0;
  const proFormaUnprecedented = opts.dir === "inverse"
    ? proForma < Math.min(...ref) : proForma > Math.max(...ref);
  // pro-forma richness percentile vs ref
  const belowPF = ref.filter((v) => v < proForma).length;
  const rawPF = ref.length > 1 ? (belowPF / (ref.length - 1)) * 100 : 50;
  const proFormaRich = toRichness(Math.min(100, rawPF), opts.lowIsCheap);

  // Forward returns: align close by date, look H trading days ahead.
  const closeAsc = close.filter((c) => Number.isFinite(c.value));
  const timeToIdx = new Map<string, number>();
  closeAsc.forEach((c, i) => timeToIdx.set(c.time, i));
  const fwdReturn = (time: string, H: number): number | null => {
    const ci = timeToIdx.get(time);
    if (ci === undefined || ci + H >= closeAsc.length) return null;
    const a = closeAsc[ci].value, b = closeAsc[ci + H].value;
    return a > 0 ? b / a - 1 : null;
  };
  const stat = (rets: number[]): FwdStat => ({
    median: median(rets) * 100,
    hitRate: rets.length ? (rets.filter((r) => r > 0).length / rets.length) * 100 : NaN,
    n: rets.length,
  });

  const fwd: ResidenceResult["fwd"] = {};
  for (const H of opts.horizons) {
    const richRets: number[] = [], cheapRets: number[] = [], baseRets: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = fwdReturn(pts[i].time, H);
      if (r === null) continue;
      baseRets.push(r);
      if (rich[i] >= 90) richRets.push(r);
      else if (rich[i] <= 10) cheapRets.push(r);
    }
    fwd[H] = { rich: stat(richRets), cheap: stat(cheapRets), base: stat(baseRets) };
  }

  return {
    m0,
    currentRich,
    proFormaRich,
    proFormaUnprecedented,
    proFormaFreqRicher: freqRicher,
    residence,
    richCount: richEx.count, richMedDur: richEx.medDur, richPctTime: richEx.pctTime,
    cheapCount: cheapEx.count, cheapMedDur: cheapEx.medDur, cheapPctTime: cheapEx.pctTime,
    fwd,
    n,
  };
}
