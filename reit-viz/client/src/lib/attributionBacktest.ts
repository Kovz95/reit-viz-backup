// Attribution verdict backtest: condition forward returns on the CURRENT
// attribution state — whether the trailing move was estimate-revision-driven or
// multiple-driven, and in which direction — and report per-state forward-return
// stats plus a LONG / SHORT / no-edge verdict for today's state.
//
// Walk-forward by construction: the state at each sampled date comes from
// buildRollingPath (trailing window only) and the state rules are fixed
// ex-ante (no fitting), so no bar ever sees its own forward window.
//
// All returns are log-% (×100), matching the rest of the attribution suite.

import { buildRollingPath, type AlignedData, type RollingPoint } from "./attribution";

export type AttrState =
  | "rev-rally" | "rerate-rally" | "compression"
  | "derate-selloff" | "rev-selloff" | "mixed";

export const ATTR_STATES: AttrState[] = [
  "rev-rally", "compression", "rerate-rally", "derate-selloff", "rev-selloff", "mixed",
];

export const ATTR_STATE_LABELS: Record<AttrState, { label: string; thesis: string }> = {
  "rev-rally":      { label: "Revision-led rally",   thesis: "revisions ↑ dominant — momentum thesis (long)" },
  "compression":    { label: "Compression",          thesis: "multiple ↓ against revisions ↑ — cheapening thesis (long)" },
  "rerate-rally":   { label: "Pure re-rate rally",   thesis: "multiple ↑ dominant, estimates flat — fade thesis (short)" },
  "derate-selloff": { label: "De-rate selloff",      thesis: "multiple ↓ dominant — no prior; data decides" },
  "rev-selloff":    { label: "Revision-led selloff", thesis: "revisions ↓ dominant — momentum thesis (short)" },
  "mixed":          { label: "Mixed",                thesis: "no dominant driver" },
};

/** Mutually exclusive + exhaustive. estShare = |est| / (|est| + |mult|);
 *  a driver "dominates" at share ≥ threshold. Compression is the
 *  multiple-dominant down-move against RISING estimates (price cheapening
 *  while fundamentals improve) — the classic long setup. */
export function classifyAttrState(p: Pick<RollingPoint, "est" | "mult">, shareThreshold: number): AttrState {
  const denom = Math.abs(p.est) + Math.abs(p.mult);
  if (denom < 1e-9) return "mixed";
  const estShare = Math.abs(p.est) / denom;
  if (estShare >= shareThreshold) return p.est > 0 ? "rev-rally" : "rev-selloff";
  if (1 - estShare >= shareThreshold) {
    if (p.mult > 0) return "rerate-rally";
    return p.est > 0 ? "compression" : "derate-selloff";
  }
  return "mixed";
}

export interface AttrStateStats {
  n: number;
  median: number;   // log-% forward return
  mean: number;
  hitRate: number;  // % of samples with forward return > 0
  tStat: number | null;
}

export interface AttrBtParams {
  /** Trailing decomposition window, in bars of the supplied series. */
  rollingDays: number;
  /** Forward horizons in bars. */
  horizons: number[];
  /** Dominance threshold on |est|/(|est|+|mult|). */
  shareThreshold: number;
  /** Sample every N bars (reduces overlap between samples). */
  stepDays: number;
  /** Minimum samples for a state×horizon cell to report stats. */
  minN: number;
  /** Horizon used for the headline verdict. */
  primaryHorizon: number;
}

export const DEFAULT_ATTR_BT: Omit<AttrBtParams, "rollingDays"> = {
  horizons: [21, 63, 126], shareThreshold: 0.6, stepDays: 5, minN: 8, primaryHorizon: 63,
};

export interface AttrBtSample {
  date: string;
  state: AttrState;
  est: number;
  mult: number;
  total: number;
  fwd: Record<number, number | null>;
}

export interface AttrBacktestResult {
  params: AttrBtParams;
  sampled: number;
  counts: Record<AttrState, number>;
  states: Record<AttrState, Record<number, AttrStateStats | null>>;
  baseline: Record<number, AttrStateStats | null>;
  /** Pearson corr of the trailing signed estimate component vs the forward
   *  return, per horizon — "does this name follow its revisions?" */
  revFollowCorr: Record<number, { r: number; n: number } | null>;
  todayPoint: RollingPoint | null;
  todayState: AttrState | null;
  verdict: { side: "LONG" | "SHORT" | "NONE"; stats: AttrStateStats | null };
  samples: AttrBtSample[];
}

export function summarizeForwardStats(vals: number[], minN: number): AttrStateStats | null {
  const n = vals.length;
  if (n < minN) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  return {
    n, median, mean,
    hitRate: (vals.filter(v => v > 0).length / n) * 100,
    tStat: std > 0 ? mean / (std / Math.sqrt(n)) : null,
  };
}

export function pearsonCorr(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 8) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx <= 0 || syy <= 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export function runAttributionVerdictBacktest(aligned: AlignedData, params: AttrBtParams): AttrBacktestResult | null {
  const { rollingDays, horizons, shareThreshold, stepDays, minN, primaryHorizon } = params;
  if (rollingDays < 2 || !horizons.length) return null;
  const path = buildRollingPath(aligned, 0, rollingDays);
  if (path.length < minN) return null;

  // Map dates back to aligned indices for forward returns (robust to any
  // points buildRollingPath skipped).
  const idxOf = new Map<string, number>();
  aligned.dates.forEach((d, i) => idxOf.set(d, i));

  const samples: AttrBtSample[] = [];
  for (let k = 0; k < path.length; k += Math.max(1, stepDays)) {
    const p = path[k];
    const i = idxOf.get(p.date);
    if (i === undefined) continue;
    const fwd: Record<number, number | null> = {};
    for (const h of horizons) {
      fwd[h] = i + h < aligned.dates.length
        ? Math.log(aligned.close[i + h] / aligned.close[i]) * 100
        : null;
    }
    samples.push({ date: p.date, state: classifyAttrState(p, shareThreshold), est: p.est, mult: p.mult, total: p.total, fwd });
  }
  if (!samples.length) return null;

  const counts = Object.fromEntries(ATTR_STATES.map(s => [s, 0])) as Record<AttrState, number>;
  for (const s of samples) counts[s.state]++;

  const states = {} as Record<AttrState, Record<number, AttrStateStats | null>>;
  for (const st of ATTR_STATES) {
    states[st] = {};
    for (const h of horizons) {
      states[st][h] = summarizeForwardStats(
        samples.filter(s => s.state === st).map(s => s.fwd[h]).filter((v): v is number => v != null),
        minN,
      );
    }
  }
  const baseline: Record<number, AttrStateStats | null> = {};
  const revFollowCorr: Record<number, { r: number; n: number } | null> = {};
  for (const h of horizons) {
    const pairs = samples.filter(s => s.fwd[h] != null);
    baseline[h] = summarizeForwardStats(pairs.map(s => s.fwd[h] as number), minN);
    const r = pearsonCorr(pairs.map(s => s.est), pairs.map(s => s.fwd[h] as number));
    revFollowCorr[h] = r == null ? null : { r, n: pairs.length };
  }

  const todayPoint = path[path.length - 1] ?? null;
  const todayState = todayPoint ? classifyAttrState(todayPoint, shareThreshold) : null;
  const vh = horizons.includes(primaryHorizon) ? primaryHorizon : horizons[0];
  const vs = todayState ? states[todayState][vh] : null;
  let side: "LONG" | "SHORT" | "NONE" = "NONE";
  if (vs && vs.n >= minN) {
    if (vs.median > 0 && vs.hitRate >= 55) side = "LONG";
    else if (vs.median < 0 && vs.hitRate <= 45) side = "SHORT";
  }

  return {
    params, sampled: samples.length, counts, states, baseline, revFollowCorr,
    todayPoint, todayState, verdict: { side, stats: vs }, samples,
  };
}
