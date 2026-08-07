// Conviction ranking engine — reconciles a manual 1..N order against a set of
// pinned pairwise preferences ("A over B"), and flags transitivity
// implications and contradictions.
//
// Pure and dependency-free (no imports) so it runs standalone under tsx and is
// golden-vector testable. All algorithms are trivial at book size (N ≲ few
// hundred); recompute on every edit.
//
// Model — two layers (see docs/conviction-ranking-plan.md §2):
//  - order: a total order, index 0 = rank 1 (highest conviction). Soft; the
//    user drags it. It can never contradict itself.
//  - pins:  [winner, loser] = "winner ▸ loser" (winner ranks above loser). A
//    hard, partial set of committed convictions.
//
// The load-bearing fact: a total order is a valid linear extension of the pins
// IFF it respects every DIRECT pin (respecting all direct pins ⇒ respecting all
// derived ones, by transitivity of `<`). So the complete problem set is
// exactly (cycles among pins) ∪ (direct pins the order violates). Derived edges
// are computed only to EXPLAIN, never to detect.

export interface ConvictionState {
  /** Tickers in rank order; index 0 = rank 1. */
  order: string[];
  /** [winner, loser] pairs — winner ▸ loser (winner should rank above loser). */
  pins: Array<[string, string]>;
}

/** A direct pin whose order placement is wrong (pinned a▸b but b is above a). */
export interface ConvictionConflict { a: string; b: string; }

export interface ConvictionAnalysis {
  /** The book (== state.order). */
  nodes: string[];
  /** "a\u0001b" for every implied a▸b (includes direct pins). */
  closureKeys: Set<string>;
  /** Derived-only implications (closure minus direct pins), for the "→ implies…" UI. */
  impliedPairs: Array<[string, string]>;
  /** Contradiction clusters — strongly-connected components of size > 1. */
  cycles: string[][];
  /** Direct pins that participate in some cycle (both endpoints in one SCC). */
  cyclePins: Array<[string, string]>;
  /** Direct pins the current order violates. */
  conflicts: ConvictionConflict[];
  hasContradiction: boolean;
  /** True when the order respects every pin (no conflicts). */
  orderIsConsistent: boolean;
  totalPairs: number;
  /** Unordered pairs neither pinned nor implied in either direction. */
  undeterminedPairs: number;
  /** |committed unordered pairs| / C(N,2), 0..1. */
  committedPct: number;
  /** |determined unordered pairs| / C(N,2), 0..1. */
  determinedPct: number;
  /** Topo-sort snap closest to the current order that honors every pin; null on contradiction. */
  suggestedOrder: string[] | null;
  /** Most-informative undetermined pair to duel next; null if fully determined. */
  nextDuel: [string, string] | null;
}

const SEP = "\u0001";
const key = (a: string, b: string) => a + SEP + b;

/** Keep only pins whose endpoints are both in the book and aren't self-loops;
 *  dedupe. Stale pins (referencing removed names) are dropped. */
function validPins(state: ConvictionState): Array<[string, string]> {
  const inBook = new Set(state.order);
  const seen = new Set<string>();
  const out: Array<[string, string]> = [];
  for (const [a, b] of state.pins) {
    if (a === b || !inBook.has(a) || !inBook.has(b)) continue;
    const k = key(a, b);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([a, b]);
  }
  return out;
}

/** Reachability closure via BFS from each node. Returns the set of "a\u0001b"
 *  keys for every a that reaches b (a ≠ b). Under a cycle, both a▸b and b▸a can
 *  appear — that's the contradiction signature. */
function transitiveClosure(nodes: string[], adj: Map<string, string[]>): Set<string> {
  const closure = new Set<string>();
  for (const start of nodes) {
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const u = queue.shift()!;
      for (const v of adj.get(u) ?? []) {
        if (!seen.has(v)) {
          seen.add(v);
          queue.push(v);
        }
      }
    }
    for (const v of seen) if (v !== start) closure.add(key(start, v));
  }
  return closure;
}

/** Tarjan strongly-connected components. Any component of size > 1 is a
 *  contradiction cluster. Recursive (depth ≤ N, safe at book size). */
function stronglyConnectedComponents(nodes: string[], adj: Map<string, string[]>): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const comps: string[][] = [];

  const strongConnect = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      comps.push(comp);
    }
  };

  for (const v of nodes) if (!idx.has(v)) strongConnect(v);
  return comps;
}

/** Kahn topological sort; among zero-indegree nodes pick the one with the
 *  smallest current position, so the result is the order closest to the user's
 *  that honors every pin. Returns null if a cycle blocks a full sort. */
function topoSnap(nodes: string[], pins: Array<[string, string]>, pos: Map<string, number>): string[] | null {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) { indeg.set(n, 0); adj.set(n, []); }
  for (const [a, b] of pins) {
    adj.get(a)!.push(b);
    indeg.set(b, indeg.get(b)! + 1);
  }
  // Available = zero-indegree nodes, always emit the smallest current position.
  const available = nodes.filter((n) => indeg.get(n) === 0);
  const out: string[] = [];
  while (available.length) {
    let best = 0;
    for (let i = 1; i < available.length; i++) {
      if (pos.get(available[i])! < pos.get(available[best])!) best = i;
    }
    const u = available.splice(best, 1)[0];
    out.push(u);
    for (const v of adj.get(u)!) {
      indeg.set(v, indeg.get(v)! - 1);
      if (indeg.get(v) === 0) available.push(v);
    }
  }
  return out.length === nodes.length ? out : null;
}

const unordered = (a: string, b: string) => (a < b ? key(a, b) : key(b, a));

/** Stable unordered pair key — matches the format nextDuel's `skip` set consults. */
export function pairKey(a: string, b: string): string { return unordered(a, b); }

export function analyzeConviction(state: ConvictionState, opts?: { skip?: Set<string> }): ConvictionAnalysis {
  const nodes = state.order.slice();
  const pos = new Map<string, number>();
  nodes.forEach((n, i) => pos.set(n, i));

  const pins = validPins(state);
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const [a, b] of pins) adj.get(a)!.push(b);

  const closureKeys = transitiveClosure(nodes, adj);
  const directSet = new Set(pins.map(([a, b]) => key(a, b)));
  const impliedPairs: Array<[string, string]> = [];
  for (const k of closureKeys) {
    if (!directSet.has(k)) {
      const [a, b] = k.split(SEP);
      impliedPairs.push([a, b]);
    }
  }

  // Contradictions: SCCs of size > 1.
  const comps = stronglyConnectedComponents(nodes, adj);
  const cycles = comps.filter((c) => c.length > 1);
  const compOf = new Map<string, number>();
  cycles.forEach((c, ci) => c.forEach((n) => compOf.set(n, ci)));
  const cyclePins = pins.filter(([a, b]) => compOf.has(a) && compOf.get(a) === compOf.get(b));
  const hasContradiction = cycles.length > 0;

  // Conflicts: direct pins the order violates. Complete problem set alongside
  // cycles (see header theorem).
  const conflicts: ConvictionConflict[] = [];
  for (const [a, b] of pins) {
    if (pos.get(a)! > pos.get(b)!) conflicts.push({ a, b });
  }
  const orderIsConsistent = conflicts.length === 0;

  // Coverage over unordered pairs.
  const totalPairs = (nodes.length * (nodes.length - 1)) / 2;
  let committed = 0;
  let determined = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const x = nodes[i], y = nodes[j];
      if (directSet.has(key(x, y)) || directSet.has(key(y, x))) committed++;
      if (closureKeys.has(key(x, y)) || closureKeys.has(key(y, x))) determined++;
    }
  }
  const undeterminedPairs = totalPairs - determined;
  const committedPct = totalPairs ? committed / totalPairs : 0;
  const determinedPct = totalPairs ? determined / totalPairs : 0;

  const suggestedOrder = hasContradiction ? null : topoSnap(nodes, pins, pos);

  // Next duel: the MOST-INFORMATIVE undetermined pair — the one whose answer
  // would newly determine the most other pairs. Resolving x▸y links every node
  // that reaches x (Up(x)) to every node y reaches (Down(y)), so the value of a
  // pair ≈ max(|Up(x)|·|Down(y)|, |Up(y)|·|Down(x)|). Up/Down counts come
  // straight from the closure — O(pairs) total. Tiebreak: nearest in the
  // current order (least-supported gap), then earliest. `skip` (unordered pair
  // keys) lets the duel flow pass on pairs the user couldn't decide.
  const up = new Map<string, number>();   // {x} ∪ nodes that reach x
  const down = new Map<string, number>(); // {x} ∪ nodes x reaches
  for (const n of nodes) { up.set(n, 1); down.set(n, 1); }
  for (const k of closureKeys) {
    const [a, b] = k.split(SEP); // a reaches b
    down.set(a, down.get(a)! + 1);
    up.set(b, up.get(b)! + 1);
  }
  let nextDuel: [string, string] | null = null;
  let bestScore = -1, bestDist = Infinity, bestI = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const x = nodes[i], y = nodes[j];
      if (closureKeys.has(key(x, y)) || closureKeys.has(key(y, x))) continue; // determined
      if (opts?.skip?.has(unordered(x, y))) continue;
      const score = Math.max(up.get(x)! * down.get(y)!, up.get(y)! * down.get(x)!);
      const dist = j - i;
      if (score > bestScore || (score === bestScore && (dist < bestDist || (dist === bestDist && i < bestI)))) {
        bestScore = score; bestDist = dist; bestI = i; nextDuel = [x, y];
      }
    }
  }

  return {
    nodes,
    closureKeys,
    impliedPairs,
    cycles,
    cyclePins,
    conflicts,
    hasContradiction,
    orderIsConsistent,
    totalPairs,
    undeterminedPairs,
    committedPct,
    determinedPct,
    suggestedOrder,
    nextDuel,
  };
}

/** Convenience: is "a ▸ b" implied (directly or transitively) by the pins? */
export function impliesPreference(analysis: ConvictionAnalysis, a: string, b: string): boolean {
  return analysis.closureKeys.has(key(a, b));
}

export interface RankMover {
  ticker: string;
  /** Rank in the prior snapshot (1-based), or null if it wasn't ranked then. */
  from: number | null;
  /** Rank now (1-based). */
  to: number;
  /** from − to: positive = moved UP; null for new entries. */
  delta: number | null;
}
export interface RankComparison {
  /** Every current name, sorted by |delta| desc then rank asc (new entries last). */
  movers: RankMover[];
  entered: string[]; // in current, not in prior
  dropped: string[]; // in prior, not in current
  /** Σ|delta| over names present in both. */
  churn: number;
  /** Spearman rank correlation over the common names (re-ranked 1..k in each); null if < 2 common. */
  spearman: number | null;
  commonCount: number;
}

/** Week-over-week diff between the current order and a prior snapshot's order. */
export function compareRankings(current: string[], prior: string[]): RankComparison {
  const priorRank = new Map<string, number>();
  prior.forEach((t, i) => priorRank.set(t, i + 1));
  const curRank = new Map<string, number>();
  current.forEach((t, i) => curRank.set(t, i + 1));
  const curSet = new Set(current);

  const movers: RankMover[] = current.map((t, i) => {
    const from = priorRank.has(t) ? priorRank.get(t)! : null;
    const to = i + 1;
    return { ticker: t, from, to, delta: from == null ? null : from - to };
  });
  movers.sort((a, b) => {
    const ad = a.delta == null ? -1 : Math.abs(a.delta);
    const bd = b.delta == null ? -1 : Math.abs(b.delta);
    return bd - ad || a.to - b.to;
  });

  const common = current.filter((t) => priorRank.has(t));
  const churn = common.reduce((s, t) => s + Math.abs(priorRank.get(t)! - curRank.get(t)!), 0);

  // Spearman over the common subset, re-ranked 1..k within each ordering.
  let spearman: number | null = null;
  const k = common.length;
  if (k >= 2) {
    const curCommonRank = new Map<string, number>();
    current.filter((t) => priorRank.has(t)).forEach((t, i) => curCommonRank.set(t, i + 1));
    const priCommonRank = new Map<string, number>();
    prior.filter((t) => curSet.has(t)).forEach((t, i) => priCommonRank.set(t, i + 1));
    let d2 = 0;
    for (const t of common) { const d = curCommonRank.get(t)! - priCommonRank.get(t)!; d2 += d * d; }
    spearman = 1 - (6 * d2) / (k * (k * k - 1));
  }

  return {
    movers,
    entered: current.filter((t) => !priorRank.has(t)),
    dropped: prior.filter((t) => !curSet.has(t)),
    churn,
    spearman,
    commonCount: k,
  };
}
