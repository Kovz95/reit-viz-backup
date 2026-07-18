// Shared helpers for the "all-pairs" mode on the Valuation Residence & Re-Rating
// pages. A pair's series is the ratio A/B (of either price or a valuation
// multiple); residence / re-rating math then treats that ratio as a single
// "direct, low-is-cheap" multiple — a HIGH ratio means A is rich vs B.

import type { RerateMetric } from "@/lib/valuationRerate";
import type { TimeValue } from "@/lib/percentileResidence";

export type PairBasis = "price" | "multiple";

// The ratio behaves like a price multiple: price of A up → ratio up → A richer.
export const PAIR_RATIO_METRIC: RerateMetric = {
  key: "__pair_ratio__",
  label: "A/B Ratio",
  dir: "direct",
  lowIsCheap: true,
};

/** Classification levels carried on each leg (for group-by / filtering). */
export interface LegClass {
  economy: string; sector: string; subsector: string;
  industryGroup: string; industry: string; subindustry: string;
}

export interface Leg extends LegClass {
  ticker: string;
  name: string;
  /** Basis series (price closes or the selected multiple), ascending by date. */
  series: TimeValue[];
}

/**
 * Date-aligned ratio A/B (inner join on time). Skips dates where B is missing,
 * zero, or non-finite. Returns ascending-by-date TimeValue[].
 */
export function ratioSeries(a: TimeValue[], b: TimeValue[]): TimeValue[] {
  const bByTime = new Map<string, number>();
  for (const p of b) if (Number.isFinite(p.value)) bByTime.set(p.time, p.value);
  const out: TimeValue[] = [];
  for (const p of a) {
    if (!Number.isFinite(p.value)) continue;
    const bv = bByTime.get(p.time);
    if (bv === undefined || bv === 0) continue;
    out.push({ time: p.time, value: p.value / bv });
  }
  return out;
}

/** All unordered pairs (i < j) of an array. */
export function unorderedPairs<T>(arr: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < arr.length; i++)
    for (let j = i + 1; j < arr.length; j++) out.push([arr[i], arr[j]]);
  return out;
}

/**
 * Safety cap on how many legs form pairs (pairs grow as n²). With the cap at N,
 * at most N·(N−1)/2 pairs are computed. Legs beyond the cap are dropped with a
 * surfaced note so the user can narrow via the class/geo filters.
 */
export const MAX_PAIR_LEGS = 90; // 90 legs → 4,005 pairs
