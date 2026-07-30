// Valuation re-rating math for the Re-Rating tab.
//
// Idea: a valuation multiple = Price / Fundamental (or Fundamental / Price for a
// yield). Holding the fundamental constant, a price move of X% re-rates the
// multiple. We compute the pro-forma multiple at +X%, and — inverting — the
// implied price move needed to re-rate to a historical anchor (median, or the
// cheap/rich extremes of the stock's own history). Comparing those across names
// surfaces relative return potential for long/short.

import { detectSRLevels } from "@/lib/srLevels";
import type { SRLevel } from "@/lib/srLevels";

export type MultipleDir = "direct" | "inverse";
// "direct"  = price in the numerator (P/FFO, P/E, EV/EBITDA…): price up → multiple up.
// "inverse" = price in the denominator (yields, cap rate): price up → metric down.

export interface RerateMetric {
  key: string;        // exact dataService metric key
  label: string;      // UI label
  dir: MultipleDir;
  /** lower value = cheaper? true for P/x multiples, false for yields/cap-rate. */
  lowIsCheap: boolean;
  approx?: boolean;   // calc is approximate (see note)
}

// Labels match the workbook's own naming (Price to FFO FY1/FY2/LTM, …). FY1
// multiples aren't stored in the workbook — they're derived on the fly as
// price ÷ FY1 fundamental (see COMPUTED_RATIO_METRICS in dataService).
// EV/EBITDA is flagged approximate: an X% *equity* move doesn't move EV
// proportionally when the company carries debt, so treating EV/EBITDA like a
// price multiple overstates the re-rate for levered names.
export const RERATE_METRICS: RerateMetric[] = [
  { key: "P/FFO FY1",    label: "Price to FFO FY1",      dir: "direct",  lowIsCheap: true },
  { key: "P/FFO FY2",    label: "Price to FFO FY2",      dir: "direct",  lowIsCheap: true },
  { key: "P/FFO LTM",    label: "Price to FFO LTM",      dir: "direct",  lowIsCheap: true },
  { key: "P/AFFO FY1",   label: "Price to AFFO FY1",     dir: "direct",  lowIsCheap: true },
  { key: "P/AFFO FY2",   label: "Price to AFFO FY2",     dir: "direct",  lowIsCheap: true },
  { key: "P/AFFO LTM",   label: "Price to AFFO LTM",     dir: "direct",  lowIsCheap: true },
  { key: "P/E FY1",      label: "Price to Earnings FY1", dir: "direct",  lowIsCheap: true },
  { key: "P/E FY2",      label: "Price to Earnings FY2", dir: "direct",  lowIsCheap: true },
  { key: "P/E LTM",      label: "Price to Earnings LTM", dir: "direct",  lowIsCheap: true },
  { key: "EV/EBITDA FY1",label: "EV/EBITDA FY1",         dir: "direct",  lowIsCheap: true, approx: true },
  { key: "EV/EBITDA FY2",label: "EV/EBITDA FY2",         dir: "direct",  lowIsCheap: true, approx: true },
  { key: "EV/EBITDA LTM",label: "EV/EBITDA LTM",         dir: "direct",  lowIsCheap: true, approx: true },
  { key: "FFO Yield FY1",  label: "FFO Yield FY1",  dir: "inverse", lowIsCheap: false },
  { key: "FFO Yield FY2",  label: "FFO Yield FY2",  dir: "inverse", lowIsCheap: false },
  { key: "Dividend Yield", label: "Dividend Yield", dir: "inverse", lowIsCheap: false },
];

// Map of curated metrics by key for O(1) override lookups.
const CURATED_BY_KEY = new Map(RERATE_METRICS.map((m) => [m.key, m]));

/**
 * Orientation for a valuation metric key. Curated entries win; anything else is
 * inferred from the name so the dropdown can be data-driven (every valuation
 * metric in the workbook is offered, not just the hardcoded 15) while the
 * re-rate math still gets a correct `dir` / `lowIsCheap`.
 *
 * A metric is "inverse" (price in the denominator → price up lowers it, and a
 * HIGHER reading is cheaper) when it is a yield, a cap rate, or a fundamental
 * over price/EV (FCF/P, FCF/EV, …). Everything else is a price multiple
 * (P/…, EV/…, …/FCF, PEG): price up raises it and a LOWER reading is cheaper.
 * EV-based multiples are flagged `approx` — an equity move doesn't move EV
 * proportionally for levered names (same caveat as EV/EBITDA).
 */
export function inferRerateMetric(key: string, label?: string): RerateMetric {
  const curated = CURATED_BY_KEY.get(key);
  if (curated) return curated;
  const k = key.toLowerCase();
  const inverse =
    /yield/.test(k) ||
    /cap\s*rate/.test(k) ||
    /^\s*fcf\s*\//.test(k) || // FCF/P, FCF/EV → FCF yield
    /\/\s*ev\b/.test(k);      // …/EV yield (e.g. FCF/EV)
  const approx = /\bev\b/.test(k); // any EV-based multiple ignores leverage
  return {
    key,
    label: label ?? key,
    dir: inverse ? "inverse" : "direct",
    lowIsCheap: !inverse,
    ...(approx ? { approx: true } : {}),
  };
}

export function getRerateMetric(key: string): RerateMetric {
  return inferRerateMetric(key);
}

/**
 * Full re-rating metric list: the curated set (nice labels + FY1 derived
 * variants + yields) unioned with EVERY metric present in the ticker data —
 * the percentile / z-score / residence machinery is metric-agnostic, so the
 * Re-Rating and Residence pages run over any metric, not just valuation
 * multiples. Non-curated metrics get inferred orientation (yields/cap-rates
 * invert; everything else is direct with low = "cheap"). Curated entries win
 * on key collisions.
 */
export function buildRerateMetrics(availableKeys: string[]): RerateMetric[] {
  const out: RerateMetric[] = [...RERATE_METRICS];
  const seen = new Set(out.map((m) => m.key));
  for (const key of availableKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(inferRerateMetric(key));
  }
  return out;
}

/** Lookback presets in trailing trading days (~250/yr). */
export const LOOKBACKS: { label: string; days: number }[] = [
  { label: "1Y", days: 250 },
  { label: "3Y", days: 750 },
  { label: "5Y", days: 1260 },
  { label: "Max", days: 100000 },
];

/** Pro-forma multiple after an X% PRICE move (fundamental held constant). */
export function proFormaMultiple(m0: number, pctMove: number, dir: MultipleDir): number {
  const f = 1 + pctMove / 100;
  if (!Number.isFinite(m0) || f <= 0) return NaN;
  return dir === "inverse" ? m0 / f : m0 * f;
}

/**
 * Implied % PRICE move to re-rate from current multiple m0 to a target multiple.
 * direct:  target = m0*(1+x)  → x = target/m0 - 1
 * inverse: target = m0/(1+x)  → x = m0/target - 1
 */
export function impliedMoveToMultiple(m0: number, target: number, dir: MultipleDir): number {
  if (!Number.isFinite(m0) || !Number.isFinite(target) || m0 === 0 || target === 0) return NaN;
  const f = dir === "inverse" ? m0 / target : target / m0;
  return (f - 1) * 100;
}

export interface DistStats {
  n: number;
  mean: number;
  std: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  min: number;
  max: number;
}

/** Linear-interpolated quantile of a sorted-ascending array, q in [0,1]. */
export function quantile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedAsc[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

export function distStats(values: number[]): DistStats | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const std = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length - 1));
  return {
    n: v.length,
    mean,
    std,
    median: quantile(sorted, 0.5),
    p10: quantile(sorted, 0.1),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.9),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/** Percentile rank (0–100) of `value` within `values` — count strictly below / (n-1). */
export function percentileRank(value: number, values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length <= 1) return 50;
  const below = v.reduce((acc, x) => acc + (x < value ? 1 : 0), 0);
  return (below / (v.length - 1)) * 100;
}

export function zScore(value: number, mean: number, std: number): number {
  return std > 0 ? (value - mean) / std : 0;
}

/** The six classification levels each row carries, for group-by. */
export interface RerateClassification {
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  industry: string;
  subindustry: string;
}

export interface RerateRow extends RerateClassification {
  ticker: string;
  name: string;
  /** current multiple (latest observation) */
  m0: number;
  stats: DistStats;
  /** where the current multiple sits in its own history */
  nowPctile: number;
  nowZ: number;
  /** pro-forma multiple at the scenario move + where it would sit */
  proForma: number;
  proFormaPctile: number;
  proFormaZ: number;
  /** implied % price move to re-rate to the historical median multiple */
  toMedian: number;
  /** implied % move to the CHEAP extreme of its history (typically downside) */
  toCheap: number;
  /** implied % move to the RICH extreme of its history (typically upside) */
  toRich: number;
  /** critical-level analysis: nearest support (downside) & resistance (upside)
   *  detected on the metric's OWN history — populated only when requested. */
  critical?: CriticalLevels;
}

/** A support/resistance level of the metric's own series, expressed for re-rate. */
export interface CriticalLevel {
  /** the level value, on the metric's own scale */
  price: number;
  /** implied % price move to re-rate to this level (same convention as toMedian) */
  move: number;
  /** oriented richness percentile at this level (0 = cheapest, 100 = richest) */
  rich: number;
  /** short human label: "S/R", "SMA 200", "Fib 0.618", "52wk H"/"52wk L" */
  label: string;
  type: string;
}

export interface CriticalLevels {
  /** nearest level a DOWNWARD price move would reach (null if none below) */
  support: CriticalLevel | null;
  /** nearest level an UPWARD price move would reach (null if none above) */
  resistance: CriticalLevel | null;
}

const srLabel = (l: SRLevel): string =>
  l.type === "ma" ? `${l.maType ?? "MA"} ${l.maPeriod ?? ""}`.trim()
  : l.type === "fib" ? `Fib ${l.fibLevel ?? ""}`.trim()
  : "S/R";

/**
 * Detect critical levels on a metric's OWN history and split them into the nearest
 * support (reached by a downward price move) and resistance (upward), each with the
 * implied re-rate move and richness. Direction is decided by the implied PRICE move
 * (via impliedMoveToMultiple), so it is correct for inverse metrics (yields) too —
 * a lower yield is a HIGHER price, i.e. resistance, not support.
 *
 * The metric series is fed as close=high=low (it has no intraday range). MA detection
 * is deliberately trimmed (SMA/EMA @ 50/200) so a full table of tickers stays snappy.
 */
export function computeCriticalLevels(finite: number[], m0: number, metric: RerateMetric): CriticalLevels {
  const none: CriticalLevels = { support: null, resistance: null };
  if (finite.length < 30 || !(m0 > 0)) return none;

  // Ascending synthetic daily axis (level PRICES don't depend on it; it only feeds
  // the engine's recency score, which nearest-selection ignores).
  const base = Date.parse("2000-01-01");
  const dates = finite.map((_, i) => new Date(base + i * 86400000).toISOString().slice(0, 10));
  let levels: SRLevel[] = [];
  try {
    levels = detectSRLevels(
      { closes: finite, highs: finite, lows: finite, dates },
      { maTypes: ["SMA", "EMA"], maPeriods: [50, 200] },
    );
  } catch { levels = []; }

  const cands: { price: number; label: string; type: string }[] = levels.map((l) => ({
    price: l.price, label: srLabel(l), type: l.type,
  }));
  // Always offer the 52-week (≈252-bar) high/low too.
  const last252 = finite.slice(-252).filter((x) => Number.isFinite(x));
  if (last252.length) {
    cands.push({ price: Math.max(...last252), label: "52wk H", type: "52wk" });
    cands.push({ price: Math.min(...last252), label: "52wk L", type: "52wk" });
  }

  const toLevel = (c: { price: number; label: string; type: string }): CriticalLevel | null => {
    const move = saneMove(impliedMoveToMultiple(m0, c.price, metric.dir));
    if (!Number.isFinite(move)) return null;
    const raw = percentileRank(c.price, finite);
    return { price: c.price, move, rich: metric.lowIsCheap ? raw : 100 - raw, label: c.label, type: c.type };
  };
  const scored = cands.map(toLevel).filter((x): x is CriticalLevel => x !== null && Math.abs(x.move) > 1e-6);

  // support = smallest downward move (closest below); resistance = smallest upward move.
  const support = scored.filter((x) => x.move < 0).sort((a, b) => b.move - a.move)[0] ?? null;
  const resistance = scored.filter((x) => x.move > 0).sort((a, b) => a.move - b.move)[0] ?? null;
  return { support, resistance };
}

// Implied moves beyond ±10,000% (100×) carry no decision value and are almost
// always a data artifact (e.g. a near-zero denominator spiking one history
// point) — show "—" instead.
const saneMove = (v: number): number => (Math.abs(v) > 10000 ? NaN : v);

/**
 * Build a re-rating row from a ticker's trailing multiple history.
 * Returns null if there isn't enough history.
 */
export function buildRerateRow(
  meta: { ticker: string; name: string } & Partial<RerateClassification>,
  trailing: number[],
  pctMove: number,
  metric: RerateMetric,
  opts?: { critical?: boolean },
): RerateRow | null {
  const finite = trailing.filter((x) => Number.isFinite(x));
  if (finite.length < 6) return null;
  const m0 = finite[finite.length - 1];
  if (!Number.isFinite(m0) || m0 === 0) return null;
  const stats = distStats(finite);
  if (!stats) return null;

  // Multiplicative re-rating (pro-forma & implied moves) is only defined on a
  // strictly positive scale. Metrics that cross or touch zero (growth rates,
  // spreads, deltas…) keep their rank stats (percentile / z) but the
  // ratio-based stats would explode near zero — suppress them instead.
  const positiveScale = stats.min > 0;
  // A near-constant history leaves std as float noise — z-scores against it are
  // meaningless (they explode into the trillions for any real move).
  const degenerate = !(stats.std > Math.max(Math.abs(stats.mean), 1e-6) * 1e-9);

  const proForma = positiveScale ? proFormaMultiple(m0, pctMove, metric.dir) : NaN;
  // Cheap / rich extremes depend on orientation: for P/x multiples the cheap
  // end is the LOW multiple (p10) and rich end is the HIGH multiple (p90);
  // for yields/cap-rate it's flipped.
  const cheapTarget = metric.lowIsCheap ? stats.p10 : stats.p90;
  const richTarget = metric.lowIsCheap ? stats.p90 : stats.p10;

  return {
    ticker: meta.ticker,
    name: meta.name,
    economy: meta.economy ?? "",
    sector: meta.sector ?? "",
    subsector: meta.subsector ?? "",
    industryGroup: meta.industryGroup ?? "",
    industry: meta.industry ?? "",
    subindustry: meta.subindustry ?? "",
    m0,
    stats,
    nowPctile: percentileRank(m0, finite),
    nowZ: degenerate ? NaN : zScore(m0, stats.mean, stats.std),
    proForma,
    proFormaPctile: positiveScale ? Math.min(100, percentileRank(proForma, finite)) : NaN,
    proFormaZ: positiveScale && !degenerate ? zScore(proForma, stats.mean, stats.std) : NaN,
    toMedian: positiveScale ? saneMove(impliedMoveToMultiple(m0, stats.median, metric.dir)) : NaN,
    toCheap: positiveScale ? saneMove(impliedMoveToMultiple(m0, cheapTarget, metric.dir)) : NaN,
    toRich: positiveScale ? saneMove(impliedMoveToMultiple(m0, richTarget, metric.dir)) : NaN,
    critical: opts?.critical && positiveScale ? computeCriticalLevels(finite, m0, metric) : undefined,
  };
}
