// Multi-Timeframe Setups — combination engine.
//
// Enumerates cross-timeframe/cross-indicator condition conjunctions, detects
// their turn-on edges, and backtests each with a local forward-return kernel
// that replicates buildBacktestResult's semantics exactly (fraction target,
// excursion hitRate, directional winRate, cooldown-skip, t-stat) but accepts
// custom bar-based horizons — the shared kernel is hardwired to daily
// HORIZONS in three places, and generalizing it would churn ~15 pages.

import type { MtfBundle } from "@/lib/mtfData";
import {
  conditionInstances,
  computeConditionMatrix,
  type ConditionInstance,
} from "@/lib/mtfConditions";

export interface MtfHorizon {
  label: string;
  bars: number;
}

/** Daily-base horizons (bars = trading days). */
export const DAILY_MTF_HORIZONS: MtfHorizon[] = [
  { label: "1W", bars: 5 },
  { label: "2W", bars: 10 },
  { label: "1M", bars: 21 },
  { label: "2M", bars: 42 },
  { label: "3M", bars: 63 },
];

/** Hourly-base horizons (US regular session ≈ 7 hourly bars/day). */
export const HOURLY_MTF_HORIZONS: MtfHorizon[] = [
  { label: "1D", bars: 7 },
  { label: "3D", bars: 21 },
  { label: "1W", bars: 35 },
  { label: "2W", bars: 70 },
  { label: "1M", bars: 147 },
];

export type MtfDirection = "long" | "short";

export interface MtfSettings {
  baseTf: "H" | "D";
  /** PERCENT in the UI (5 = +5%); divided by 100 at the kernel call. */
  targetPct: number;
  cooldownBars: number;
  minOccurrences: number;
  /** Strict > threshold on the qualification-horizon hit rate. */
  hitRateThreshold: number;
  /** Which horizon label qualifies a setup. */
  horizonLabel: string;
  deepScan: boolean;
}

// targetPct 3: REITs rarely make a 5% favorable excursion inside a month, so
// a 5% default returned zero setups on typical tickers (verified on AVB).
export const DEFAULT_MTF_SETTINGS: MtfSettings = {
  baseTf: "D",
  targetPct: 3,
  cooldownBars: 10,
  minOccurrences: 8,
  hitRateThreshold: 0.55,
  horizonLabel: "1M",
  // Deep scan on by default: pairs first, then triples seeded from the
  // qualified pairs — full C(n,3) over the expanded catalog would be ~300k
  // combos, but seeded extension stays proportional to what qualified.
  deepScan: true,
};

/** Base-TF-appropriate defaults for the fields that depend on bar density. */
export function defaultsForBase(baseTf: "H" | "D"): Pick<MtfSettings, "cooldownBars" | "horizonLabel"> {
  return baseTf === "H" ? { cooldownBars: 21, horizonLabel: "1W" } : { cooldownBars: 10, horizonLabel: "1M" };
}

export function horizonsForBase(baseTf: "H" | "D"): MtfHorizon[] {
  return baseTf === "H" ? HOURLY_MTF_HORIZONS : DAILY_MTF_HORIZONS;
}

export interface MtfHorizonRow {
  horizon: string;
  count: number;
  hitRate: number;
  winRate: number;
  avgReturn: number;
  medianReturn: number;
  tStat: number;
}

export interface MtfSetupRow {
  key: string;
  /** Scanned symbol: a ticker ("AVB") or a pair ratio ("AVB/EQR"). */
  symbol: string;
  legs: ConditionInstance[];
  direction: MtfDirection;
  rows: MtfHorizonRow[];
  /** Stats at the qualification horizon. */
  hitRate: number;
  winRate: number;
  avgReturn: number;
  tStat: number;
  occurrences: number;
  freqPerYear: number;
  lastFiredIdx: number;
  lastFiredLabel: string;
  activeNow: boolean;
  /** ≤ 20 recent entry labels (daily-date strings) for chart hand-off. */
  entryLabels: string[];
}

// ── Kernel ──────────────────────────────────────────────────────────────────

/**
 * Forward-return stats over custom horizons; semantics mirror
 * signalUtils.buildSignalProfile/buildBacktestResult:
 * - cooldown: an entry within `cooldownBars` of the last ACCEPTED entry is skipped
 * - return = close[e+h]/close[e] − 1 (percent, ×100)
 * - hitRate: favorable close-to-close excursion within the window ≥ target
 * - winRate: directional sign of the horizon return
 */
export function evaluateForwardStats(
  closes: number[],
  entryIndices: number[],
  direction: MtfDirection,
  targetFraction: number,
  cooldownBars: number,
  horizons: MtfHorizon[],
): { rows: MtfHorizonRow[]; acceptedIndices: number[] } {
  const accepted: number[] = [];
  let lastIdx = -Infinity;
  for (const e of entryIndices) {
    if (e - lastIdx < cooldownBars) continue;
    accepted.push(e);
    lastIdx = e;
  }

  const rows: MtfHorizonRow[] = horizons.map(({ label, bars }) => {
    const rets: number[] = [];
    let hits = 0;
    let wins = 0;
    for (const e of accepted) {
      const entry = closes[e];
      const exitIdx = e + bars;
      const exit = closes[exitIdx];
      if (!(entry > 0) || !(exit > 0)) continue;
      const ret = ((exit / entry - 1) * 100);
      rets.push(ret);
      if (direction === "long" ? ret > 0 : ret < 0) wins++;
      // Favorable excursion within the window (close-to-close path).
      let best = -Infinity;
      for (let i = e + 1; i <= exitIdx && i < closes.length; i++) {
        const p = closes[i];
        if (!(p > 0)) continue;
        const r = p / entry - 1;
        const fav = direction === "long" ? r : -r;
        if (fav > best) best = fav;
      }
      if (Number.isFinite(best) && best >= targetFraction) hits++;
    }
    const n = rets.length;
    const mean = n ? rets.reduce((a, b) => a + b, 0) / n : 0;
    const std = n > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
    const sorted = [...rets].sort((a, b) => a - b);
    const median = n ? (n % 2 ? sorted[n >> 1] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : 0;
    return {
      horizon: label,
      count: n,
      hitRate: n ? hits / n : 0,
      winRate: n ? wins / n : 0,
      avgReturn: mean,
      medianReturn: median,
      tStat: n > 1 && std > 0 ? mean / (std / Math.sqrt(n)) : 0,
    };
  });

  return { rows, acceptedIndices: accepted };
}

/** AND the leg states; entry = false→true edge; any null resets edge state. */
export function conjunctionEntries(states: (boolean | null)[][]): {
  entries: number[];
  state: (boolean | null)[];
} {
  const n = states[0].length;
  const state: (boolean | null)[] = new Array(n);
  const entries: number[] = [];
  let prev: boolean | null = null;
  for (let i = 0; i < n; i++) {
    let cur: boolean | null = true;
    for (const s of states) {
      const v = s[i];
      if (v === null) {
        cur = null;
        break;
      }
      if (!v) cur = false;
    }
    state[i] = cur;
    if (cur === null) {
      prev = null;
      continue;
    }
    if (prev === false && cur) entries.push(i);
    prev = cur;
  }
  return { entries, state };
}

const TF_RANK = { H: 0, D: 1, W: 2, M: 3 } as const;

/**
 * Unordered pairs of instances with TF ≥ base, excluding same-family-same-TF
 * pairs (contradictions/redundancies; also enforces "cross-TF or
 * cross-indicator" by construction).
 */
export function enumeratePairs(instances: ConditionInstance[], baseTf: "H" | "D"): ConditionInstance[][] {
  const legs = instances.filter((i) => TF_RANK[i.tf] >= TF_RANK[baseTf]);
  const out: ConditionInstance[][] = [];
  for (let a = 0; a < legs.length; a++) {
    for (let b = a + 1; b < legs.length; b++) {
      if (legs[a].def.family === legs[b].def.family && legs[a].tf === legs[b].tf) continue;
      out.push([legs[a], legs[b]]);
    }
  }
  return out;
}

export interface MtfScanResult {
  qualified: MtfSetupRow[];
  combosEvaluated: number;
  baseBars: number;
  spanYears: number;
}

export async function runMtfScan(opts: {
  bundle: MtfBundle;
  settings: MtfSettings;
  onProgress: (done: number, total: number) => void;
  cancelRef: { current: boolean };
}): Promise<MtfScanResult> {
  const { bundle, settings, onProgress, cancelRef } = opts;
  const baseTf = settings.baseTf === "H" && !bundle.hourly ? "D" : settings.baseTf;
  const base = baseTf === "H" ? bundle.hourly! : bundle.daily;
  const horizons = horizonsForBase(baseTf);
  const targetFraction = settings.targetPct / 100;

  const instances = conditionInstances(bundle);
  const matrix = computeConditionMatrix(bundle, baseTf, instances);

  // Span for freq/yr: base-series calendar span.
  const firstDate = baseTf === "H" ? bundle.hourlyDates[0] : bundle.daily.keys[0];
  const lastDate = baseTf === "H" ? bundle.hourlyDates[bundle.hourlyDates.length - 1] : bundle.daily.keys[bundle.daily.keys.length - 1];
  const spanYears = Math.max(
    (new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (365.25 * 24 * 3600 * 1000),
    0.25,
  );

  const entryLabelOf = (idx: number) => (baseTf === "H" ? bundle.hourlyDates[idx] : bundle.daily.keys[idx]);

  const evaluateCombo = (legs: ConditionInstance[]): MtfSetupRow[] => {
    const states = legs.map((l) => matrix.get(l.key)!).filter(Boolean);
    if (states.length !== legs.length) return [];
    const { entries, state } = conjunctionEntries(states);
    if (entries.length < settings.minOccurrences) return [];
    const activeNow = state[state.length - 1] === true;
    const out: MtfSetupRow[] = [];
    for (const direction of ["long", "short"] as MtfDirection[]) {
      const { rows, acceptedIndices } = evaluateForwardStats(
        base.closes,
        entries,
        direction,
        targetFraction,
        settings.cooldownBars,
        horizons,
      );
      const q = rows.find((r) => r.horizon === settings.horizonLabel);
      if (!q || q.count < settings.minOccurrences) continue;
      if (q.hitRate <= settings.hitRateThreshold) continue;
      const freqPerYear = acceptedIndices.length / spanYears;
      if (freqPerYear < 2) continue;
      const lastFiredIdx = entries[entries.length - 1];
      out.push({
        key: `${bundle.ticker}|${legs.map((l) => l.key).sort().join("+")}|${direction}`,
        symbol: bundle.ticker,
        legs,
        direction,
        rows,
        hitRate: q.hitRate,
        winRate: q.winRate,
        avgReturn: q.avgReturn,
        tStat: q.tStat,
        occurrences: q.count,
        freqPerYear,
        lastFiredIdx,
        lastFiredLabel: entryLabelOf(lastFiredIdx),
        activeNow,
        entryLabels: [...new Set(entries.slice(-20).map(entryLabelOf))],
      });
    }
    return out;
  };

  const pairs = enumeratePairs(instances, baseTf);
  const qualified: MtfSetupRow[] = [];
  let combosEvaluated = 0;
  const CHUNK = 150;

  for (let i = 0; i < pairs.length && !cancelRef.current; i += CHUNK) {
    for (const legs of pairs.slice(i, i + CHUNK)) {
      qualified.push(...evaluateCombo(legs));
      combosEvaluated++;
    }
    onProgress(Math.min(i + CHUNK, pairs.length), pairs.length + (settings.deepScan ? pairs.length / 4 : 0));
    await new Promise((r) => setTimeout(r, 0));
  }

  // Deep scan: seeded triples — extend qualified pairs with every compatible
  // third leg (not full C(n,3)). With the expanded catalog (~360 legs) an
  // unbounded seed set makes runtimes explode on mean-reverting series where
  // thousands of pairs qualify, so seed only the strongest pairs.
  const MAX_DEEP_SEEDS = 300;
  if (settings.deepScan && !cancelRef.current) {
    const legPool = instances.filter((i) => TF_RANK[i.tf] >= TF_RANK[baseTf]);
    const bestHit = new Map<ConditionInstance[], number>();
    for (const r of qualified) {
      bestHit.set(r.legs, Math.max(bestHit.get(r.legs) ?? 0, r.hitRate));
    }
    const seedPairs = [...bestHit.keys()]
      .sort((a, b) => bestHit.get(b)! - bestHit.get(a)!)
      .slice(0, MAX_DEEP_SEEDS);
    const seen = new Set(qualified.map((r) => r.key));
    let done = 0;
    for (const pair of seedPairs) {
      if (cancelRef.current) break;
      for (const third of legPool) {
        if (pair.some((l) => l.key === third.key)) continue;
        if (pair.some((l) => l.def.family === third.def.family && l.tf === third.tf)) continue;
        const triple = [...pair, third];
        const tripleKeyBase = `${bundle.ticker}|${triple.map((l) => l.key).sort().join("+")}`;
        if (seen.has(`${tripleKeyBase}|long`) && seen.has(`${tripleKeyBase}|short`)) continue;
        for (const row of evaluateCombo(triple)) {
          if (!seen.has(row.key)) {
            seen.add(row.key);
            qualified.push(row);
          }
        }
        combosEvaluated++;
      }
      if (++done % 25 === 0) {
        onProgress(pairs.length + done, pairs.length + seedPairs.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  return { qualified, combosEvaluated, baseBars: base.keys.length, spanYears };
}
