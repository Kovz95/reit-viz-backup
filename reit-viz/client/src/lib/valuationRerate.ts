// Valuation re-rating math for the Re-Rating tab.
//
// Idea: a valuation multiple = Price / Fundamental (or Fundamental / Price for a
// yield). Holding the fundamental constant, a price move of X% re-rates the
// multiple. We compute the pro-forma multiple at +X%, and — inverting — the
// implied price move needed to re-rate to a historical anchor (median, or the
// cheap/rich extremes of the stock's own history). Comparing those across names
// surfaces relative return potential for long/short.

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

// Default first. EV/EBITDA is flagged approximate: an X% *equity* move doesn't
// move EV proportionally when the company carries debt, so treating EV/EBITDA
// like a price multiple overstates the re-rate for levered names.
export const RERATE_METRICS: RerateMetric[] = [
  { key: "P/FFO FY2",    label: "P/FFO (fwd)",     dir: "direct",  lowIsCheap: true },
  { key: "P/FFO LTM",    label: "P/FFO (LTM)",     dir: "direct",  lowIsCheap: true },
  { key: "P/AFFO FY2",   label: "P/AFFO (fwd)",    dir: "direct",  lowIsCheap: true },
  { key: "P/AFFO LTM",   label: "P/AFFO (LTM)",    dir: "direct",  lowIsCheap: true },
  { key: "P/E FY2",      label: "P/E (fwd)",       dir: "direct",  lowIsCheap: true },
  { key: "P/E LTM",      label: "P/E (LTM)",       dir: "direct",  lowIsCheap: true },
  { key: "EV/EBITDA FY2",label: "EV/EBITDA (fwd)", dir: "direct",  lowIsCheap: true, approx: true },
  { key: "EV/EBITDA LTM",label: "EV/EBITDA (LTM)", dir: "direct",  lowIsCheap: true, approx: true },
  { key: "Dividend Yield", label: "Dividend Yield", dir: "inverse", lowIsCheap: false },
  { key: "FFO Yield FY2",  label: "FFO Yield (fwd)", dir: "inverse", lowIsCheap: false },
  { key: "Implied Cap Rate", label: "Implied Cap Rate", dir: "inverse", lowIsCheap: false },
];

export function getRerateMetric(key: string): RerateMetric {
  return RERATE_METRICS.find((m) => m.key === key) ?? RERATE_METRICS[0];
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

export interface RerateRow {
  ticker: string;
  name: string;
  sector: string;
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
}

/**
 * Build a re-rating row from a ticker's trailing multiple history.
 * Returns null if there isn't enough history.
 */
export function buildRerateRow(
  meta: { ticker: string; name: string; sector: string },
  trailing: number[],
  pctMove: number,
  metric: RerateMetric,
): RerateRow | null {
  const finite = trailing.filter((x) => Number.isFinite(x));
  if (finite.length < 6) return null;
  const m0 = finite[finite.length - 1];
  if (!Number.isFinite(m0) || m0 === 0) return null;
  const stats = distStats(finite);
  if (!stats) return null;

  const proForma = proFormaMultiple(m0, pctMove, metric.dir);
  // Cheap / rich extremes depend on orientation: for P/x multiples the cheap
  // end is the LOW multiple (p10) and rich end is the HIGH multiple (p90);
  // for yields/cap-rate it's flipped.
  const cheapTarget = metric.lowIsCheap ? stats.p10 : stats.p90;
  const richTarget = metric.lowIsCheap ? stats.p90 : stats.p10;

  return {
    ticker: meta.ticker,
    name: meta.name,
    sector: meta.sector,
    m0,
    stats,
    nowPctile: percentileRank(m0, finite),
    nowZ: zScore(m0, stats.mean, stats.std),
    proForma,
    proFormaPctile: percentileRank(proForma, finite),
    proFormaZ: zScore(proForma, stats.mean, stats.std),
    toMedian: impliedMoveToMultiple(m0, stats.median, metric.dir),
    toCheap: impliedMoveToMultiple(m0, cheapTarget, metric.dir),
    toRich: impliedMoveToMultiple(m0, richTarget, metric.dir),
  };
}
