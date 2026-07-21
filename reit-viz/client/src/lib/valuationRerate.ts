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
  };
}
