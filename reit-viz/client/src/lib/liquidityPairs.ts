// Liquidity-matched pair generation for the /liquidity-capacity Pairs view.
//
// Pairs are formed WITHIN a classification group (subsector by default) between
// names whose liquidity profiles are similar enough to run market-neutral at
// equal leg size:
//   - optional same-bucket constraint (both legs cleared the same sizing tier)
//   - ADV ratio floor: min(effAdv) / max(effAdv) ≥ threshold
// Pair capacity = the SMALLER leg's max position (equal-sized legs), and pair
// exit = the SLOWER leg's exit days — the illiquid leg always binds.
//
// Pure module (no React) so it can be probed directly via in-page import.

export interface PairLeg {
  ticker: string;
  /** Display + Yahoo-cache symbol form (FactSet regional for non-US global names). */
  display: string;
  name: string;
  /** Classification value at the chosen pairing level. */
  group: string;
  /** Tier index cleared (0 = best); pairs only form between bucketed names. */
  bucket: number;
  effAdvMM: number | null;
  maxPosPct: number | null;
  maxPosMM: number | null;
  exitDays: number | null;
}

export interface LiquidityPair {
  key: string; // "A|B" with A the larger-ADV leg
  a: PairLeg;
  b: PairLeg;
  group: string;
  /** min(effAdv) / max(effAdv), in (0, 1]. */
  advRatio: number;
  /** Equal-sized legs → the smaller leg's capacity binds. */
  pairMaxPosPct: number | null;
  pairMaxPosMM: number | null;
  /** Days to unwind the pair = the slower leg. */
  pairExitDays: number | null;
}

export interface PairGenOptions {
  sameBucketOnly: boolean;
  /** ADV ratio floor as a fraction (0.5 = smaller leg ≥ 50% of larger). */
  minAdvRatio: number;
  /** Only legs with bucket ≤ maxTier pair up (Infinity-ish = any bucketed tier). */
  maxTier: number;
  /** Per-group cap on names considered (largest effAdv first) to bound combinatorics. */
  topPerGroup: number;
  /**
   * Cap on the number of groups generated (0/undefined = no cap). Global mode
   * grouped at subindustry yields 150+ groups — unbounded, that's tens of
   * thousands of pair objects and rows. Groups are ranked by aggregate pool
   * ADV so the most tradeable ones survive; output stays label-sorted.
   */
  maxGroups?: number;
}

export interface PairGenResult {
  /** group label → pairs, groups sorted by label, pairs by pairMaxPosPct desc. */
  groups: Array<{ label: string; pairs: LiquidityPair[] }>;
  totalPairs: number;
  /** Names skipped by the per-group cap (still counted so the UI can say so). */
  cappedNames: number;
  /** Groups dropped by maxGroups (so the UI can say "narrow your filters"). */
  cappedGroups: number;
}

export function buildLiquidityPairs(legs: PairLeg[], opts: PairGenOptions): PairGenResult {
  const byGroup = new Map<string, PairLeg[]>();
  for (const leg of legs) {
    if (leg.bucket < 0 || leg.bucket > opts.maxTier) continue;
    if (leg.effAdvMM == null || leg.effAdvMM <= 0) continue;
    const label = leg.group || "—";
    (byGroup.get(label) ?? byGroup.set(label, []).get(label)!).push(leg);
  }

  const groups: Array<{ label: string; pairs: LiquidityPair[] }> = [];
  let totalPairs = 0;
  let cappedNames = 0;
  let cappedGroups = 0;

  let entries = [...byGroup.entries()].filter(([, m]) => m.length >= 2);
  const maxGroups = opts.maxGroups ?? 0;
  if (maxGroups > 0 && entries.length > maxGroups) {
    const poolAdv = (members: PairLeg[]) =>
      members
        .map((l) => l.effAdvMM ?? 0)
        .sort((x, y) => y - x)
        .slice(0, Math.max(2, opts.topPerGroup))
        .reduce((s, v) => s + v, 0);
    entries.sort((x, y) => poolAdv(y[1]) - poolAdv(x[1]));
    cappedGroups = entries.length - maxGroups;
    entries = entries.slice(0, maxGroups);
  }

  for (const [label, members] of entries.sort((x, y) => x[0].localeCompare(y[0]))) {
    const ranked = members.slice().sort((x, y) => (y.effAdvMM ?? 0) - (x.effAdvMM ?? 0));
    const pool = ranked.slice(0, Math.max(2, opts.topPerGroup));
    cappedNames += ranked.length - pool.length;

    const pairs: LiquidityPair[] = [];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const a = pool[i]; // larger ADV (pool is ADV-sorted)
        const b = pool[j];
        if (opts.sameBucketOnly && a.bucket !== b.bucket) continue;
        const ratio = (b.effAdvMM ?? 0) / (a.effAdvMM ?? 1);
        if (!(ratio >= opts.minAdvRatio)) continue;
        const pcts = [a.maxPosPct, b.maxPosPct].filter((v): v is number => v != null);
        const mms = [a.maxPosMM, b.maxPosMM].filter((v): v is number => v != null);
        const exits = [a.exitDays, b.exitDays].filter((v): v is number => v != null);
        pairs.push({
          key: `${a.ticker}|${b.ticker}`,
          a, b, group: label,
          advRatio: ratio,
          pairMaxPosPct: pcts.length === 2 ? Math.min(...pcts) : null,
          pairMaxPosMM: mms.length === 2 ? Math.min(...mms) : null,
          pairExitDays: exits.length === 2 ? Math.max(...exits) : null,
        });
      }
    }
    if (pairs.length === 0) continue;
    pairs.sort((x, y) => (y.pairMaxPosPct ?? -1) - (x.pairMaxPosPct ?? -1));
    totalPairs += pairs.length;
    groups.push({ label, pairs });
  }

  return { groups, totalPairs, cappedNames, cappedGroups };
}

export interface CloseSeries {
  dates: string[];
  closes: number[];
}

/**
 * Pearson correlation of daily returns over the last `window` overlapping
 * sessions (date-aligned inner join). Null when overlap is too thin to trust
 * (< 60% of the window) or a series is degenerate.
 */
/** Date-aligned A/B close ratios (inner join), oldest→newest. */
function alignedRatios(a: CloseSeries, b: CloseSeries): number[] {
  if (!a?.dates?.length || !b?.dates?.length) return [];
  const mb = new Map<string, number>();
  for (let i = 0; i < b.dates.length; i++) {
    const c = b.closes[i];
    if (Number.isFinite(c) && c > 0) mb.set(b.dates[i], c);
  }
  const out: number[] = [];
  for (let i = 0; i < a.dates.length; i++) {
    const ca = a.closes[i];
    const cb = mb.get(a.dates[i]);
    if (cb !== undefined && Number.isFinite(ca) && ca > 0) out.push(ca / cb);
  }
  return out;
}

/**
 * Z-score of the CURRENT A/B price ratio vs its own trailing `window` sessions
 * (current included). Positive = A rich vs B (short A / long B to fade), and
 * vice versa. Null when overlap is too thin (< 60% of window) or flat.
 */
export function pairSpreadZ(a: CloseSeries, b: CloseSeries, window: number): number | null {
  const ratios = alignedRatios(a, b);
  const tail = ratios.slice(-window);
  if (tail.length < Math.ceil(window * 0.6)) return null;
  const n = tail.length;
  let sum = 0;
  for (const r of tail) sum += r;
  const mean = sum / n;
  let varSum = 0;
  for (const r of tail) varSum += (r - mean) * (r - mean);
  const std = Math.sqrt(varSum / n);
  if (std < 1e-9 * Math.max(1, Math.abs(mean))) return null;
  return (tail[n - 1] - mean) / std;
}

export function pairReturnCorrelation(a: CloseSeries, b: CloseSeries, window: number): number | null {
  if (!a?.dates?.length || !b?.dates?.length) return null;
  const mb = new Map<string, number>();
  for (let i = 0; i < b.dates.length; i++) {
    const c = b.closes[i];
    if (Number.isFinite(c) && c > 0) mb.set(b.dates[i], c);
  }
  const closesA: number[] = [];
  const closesB: number[] = [];
  for (let i = 0; i < a.dates.length; i++) {
    const ca = a.closes[i];
    const cb = mb.get(a.dates[i]);
    if (cb !== undefined && Number.isFinite(ca) && ca > 0) {
      closesA.push(ca);
      closesB.push(cb);
    }
  }
  // Last `window` returns need window+1 closes.
  const start = Math.max(0, closesA.length - (window + 1));
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = start + 1; i < closesA.length; i++) {
    ra.push(closesA[i] / closesA[i - 1] - 1);
    rb.push(closesB[i] / closesB[i - 1] - 1);
  }
  const n = ra.length;
  if (n < Math.ceil(window * 0.6)) return null;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += ra[i]; sb += rb[i]; }
  const ma = sa / n, mbn = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = ra[i] - ma, db = rb[i] - mbn;
    cov += da * db; va += da * da; vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  if (denom < 1e-12) return null;
  return Math.max(-1, Math.min(1, cov / denom));
}
