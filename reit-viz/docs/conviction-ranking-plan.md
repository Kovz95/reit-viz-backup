# Conviction Ranking — build plan

A new tab for **manual, subjective** stock ranking: order your book 1..N by
conviction, assert pairwise "I like A over B" calls, and have the app
continuously flag transitivity implications and contradictions as you go.
Weekly cadence with snapshot diffs.

Status: PLAN (2026-08-07). Not yet built.

---

## 1 · Why this is new (vs the two existing ranking pages)

- `/ranking` (`pages/Ranking.tsx`, ~2.3k lines) — **quantitative** composite
  scorer: cross-sectional z-scores of fundamentals × weights → `compositeZ`,
  sorts the table for you. No hand-ordering, no preferences.
- `/ranker` (`pages/RidgeRanker.tsx`) — ridge-regression walk-forward IC
  backtester. A model-fit tool, not a manual ranker.

Neither lets a PM **order rows by hand** or **assert their own preferences**.
This tab is that missing capability: the ranking is *the user's judgment*, and
the app's job is to keep that judgment internally consistent.

Working name: **"Conviction"**, route `/conviction` (sits in the existing
**Cross-Section** nav group next to Ranking / Ridge Ranker). Name is the
user's call — alternatives: "Rank Book", "Book Ranker", "Weekly Ranks".

---

## 2 · The mental model — two layers

Everything rests on separating two things that are usually conflated:

- **The order** — a bijection `rank: book → {1..N}`. Total by construction
  (drag-and-drop). "Soft": it changes freely as you drag. Position 1 = highest
  conviction.
- **The pins** — the set of pairwise calls you *commit to*: `A ▸ B` = "A over
  B" (A must rank above B). "Hard": a partial set of constraints you stand
  behind. Source: a pairwise duel, or locking an adjacency from the order.

The order is what you present; the pins are the convictions the order must
honor. The engine reconciles the two.

### The load-bearing fact

**Contradictions can only come from your pins, never from the order.** A 1..N
drag order is always a valid total order — it cannot contradict itself. So all
the interesting logic is: *is my current order a valid linear extension of the
preferences I've committed to, and are those preferences themselves
consistent?*

And a small theorem that keeps the checks cheap and complete:

> A total order is a linear extension of the pinned partial order **iff** it
> respects every *direct* pin. (If it respects all direct pins A▸B, then for any
> derived chain A▸…▸C it respects A▸C too, by transitivity of `<`.)

So the full consistency check is exactly **(cycles among pins) ∪ (direct pins
the current order violates)**. Nothing else can be wrong. Derived-edge checks
are for *explanation* (showing the implication chain), not detection.

---

## 3 · The preference engine (`lib/convictionGraph.ts`)

Pure, dependency-free, unit-testable. Nodes = book tickers; directed edge
`A→B` = pin "A over B". `N` is small (a book is ~20–150 names), so every
algorithm below is trivially fast; recompute on every change (debounced ~50ms).

1. **Transitive closure** `TC(pins)` — all `(A,C)` with a directed path A→…→C.
   These are the *implied* calls ("you pinned A▸B and B▸C, so A▸C"). Repeated
   BFS from each node, or a boolean reachability matrix (Floyd–Warshall
   `O(N³)`; fine to N≈300).

2. **Contradiction detection** — Tarjan **SCC**. Any strongly-connected
   component of size >1 is a contradiction cluster (A▸B▸C▸A). Surface the whole
   cluster and enumerate the pins on the cycle so the user can retract one.
   Cycles live entirely in the pin set → the "you contradicted yourself"
   message always points at explicit calls.

3. **Order-vs-pins conflicts** — for each direct pin `A▸B`: if `rank(A) >
   rank(B)`, that's a **conflict** ("pinned A over B, but you placed B above
   A"). Flag both rows + the pin. This set + cycles = the complete problem set.

4. **Determinacy / free choices** — a pair with neither `A▸C` nor `C▸A` in
   `TC(pins)` is *undetermined*: the pins don't constrain it, so its order is a
   free drag decision. Drives coverage stats and the "suggest next duel" logic.

5. **Auto-order suggestion ("snap to my calls")** — topological sort (Kahn),
   breaking ties among zero-indegree nodes by *current position*. Yields the
   order closest to what you have that fully respects every pin. Disabled (with
   a pointer to the cycle) when a contradiction exists — can't topo-sort a
   graph with a cycle.

6. **Coverage / conviction metrics** —
   - *committed*: `|pins| / C(N,2)` — share of pairs you've explicitly called.
   - *determined*: `|TC(pins)| / C(N,2)` — share of the full ordering your calls
     actually pin down (the rest is free drag). Tells the PM how
     conviction-supported the ranking is vs arbitrary placement.

7. **Most-informative next duel** — among undetermined pairs, pick the one whose
   resolution would determine the most currently-undetermined pairs (greedy).
   v1 can ship the cheap proxy: the undetermined pair closest together in the
   current order (that's where the ranking is least supported).

### Engine surface (sketch)

```ts
interface ConvictionState {
  order: string[];               // tickers, index 0 = rank 1
  pins: Array<[string, string]>; // [winner, loser] = winner ▸ loser
}
interface ConvictionAnalysis {
  closure: Set<string>;                 // "A|C" keys of all implied A▸C
  cycles: string[][];                   // contradiction clusters (SCC > 1)
  conflicts: Array<{ a: string; b: string }>; // pin A▸B but order has B above A
  undetermined: number;                 // count of free pairs
  committedPct: number; determinedPct: number;
  suggestedOrder: string[] | null;      // topo-sort snap, null if cycle
  nextDuel: [string, string] | null;    // most-informative undetermined pair
}
function analyzeConviction(s: ConvictionState): ConvictionAnalysis
```

---

## 4 · UX

### 4a · The ranked list (primary)

- A vertical drag-reorder list, rank number on the left, ticker + name, and a
  few **read-only reference columns** for context while ranking (last week's
  rank + Δ, price, one valuation metric, sector chip). Reference only — they
  never drive the order.
- **Live badges** recomputed on every drag / pin change:
  - 🔴 **contradiction** — row is in a cycle; tooltip lists the offending pins.
  - 🟠 **conflict** — a pin is violated by the current position; tooltip names
    the counterpart and the pin.
  - Hover a row → a subtle **"pin this call"** on the boundary with its
    neighbor, promoting the positional adjacency to a hard pin.
- Header strip: coverage meters (committed % / determined %), a
  **"Snap to my calls"** button (applies the topo suggestion), contradiction
  count, and the scope/basket picker.
- Adding a pin flashes a transient **"→ implies A▸C, D▸C"** so the user sees the
  consequences of a call immediately.

### 4b · Duel mode (pairwise, secondary)

- A focused "**A vs B — which do you prefer?**" card. Each answer adds a pin.
- **Transitivity skip**: never presents a pair already determined by the
  closure — so you order N names in ~N·log N comparisons instead of N²/2, and
  never re-answer an implied call.
- After each answer: recompute, advance to the *most-informative* remaining
  duel. Progress = determined %.
- "Apply to order" runs the topo snap so the duels materialize as a 1..N list.

The two modes edit the same `ConvictionState` — drag-first with pins layered
on, or duel-first then snap. Both stay live-consistent.

---

## 5 · Weekly workflow — snapshots & deltas

The whole point is a *weekly* deliverable, so first-class snapshots:

- **Save snapshot** — name + auto date-stamp; stores `{order, pins}` in the
  prefs KV. A dropdown of prior weeks.
- **Δ view** — pick a prior snapshot → per-name `Δrank`, biggest up/down
  movers, new entries, dropped names, and *new #1 / new bottom*. This is the
  "what changed in my book this week" slide.
- **Churn metric** — sum |Δrank| or Spearman vs last week: how much did my view
  move.
- **CSV export** — `rank, ticker, name, Δ vs last week` for pasting into the
  fund's system.

---

## 6 · Scope, data, persistence

- **Scope** — `useBasketScope("reit-viz:basket-scope:conviction")` (their book
  is likely a basket) + a manual add box; `useUniverse()` for the fallback
  universe and `allTickers` metadata. Filter the candidate set at the one choke
  point (`if (scope.members) …filter(inScope)`).
- **Reference columns** — reuse existing metric loaders (Ranking pulls
  multi-metric via `getMultiMetricForAllTickers`; last-week rank comes from the
  prior snapshot).
- **Tab-restore** — `useWorkspaceTab("conviction", serialize, restore)` snapshots
  `{order, pins, scope, mode}` so a reload restores the working state.
- **Named snapshots + presets** — `PagePresets` with
  `storageKey="reit-viz:conviction:snapshots"` (server-synced via
  `serverPrefs`), `capture`/`apply` = the same serialize/restore. Snapshots are
  effectively date-named presets; the Δ view reads two of them.

## 7 · Page registration (5 touch-points in `App.tsx`)

1. `const Conviction = lazy(() => import("@/pages/Conviction"));`
2. Nav: a child in the **Cross-Section** `group` array —
   `{ path: "/conviction", label: "Conviction", icon: <lucide> }`.
3. `<Route path="/conviction" component={Conviction} />` inside the `<Switch>`.
4. `PAGES` (command palette): `{ path: "/conviction", label: "Conviction" }`.
5. Optionally a `NUM_NAV` digit slot.

---

## 8 · Phased build

- **Phase 0 — model + engine.** `lib/convictionGraph.ts` (closure, SCC/cycles,
  conflicts, topo snap, coverage, next-duel) + a unit-test/golden vector file.
  No UI. *This is the core; build and verify it first.*
- **Phase 1 — ranked list.** Scaffold the page + registration; drag-reorder
  1..N; scope picker; reference columns; `useWorkspaceTab` restore. No pins yet.
- **Phase 2 — pins + live flagging.** Pin from adjacency; contradiction /
  conflict badges; implication flashes; coverage meters; "Snap to my calls".
  *The headline feature.*
- **Phase 3 — duel mode.** Pairwise card, transitivity-skip, next-duel
  suggestion, apply-to-order.
- **Phase 4 — snapshots + Δ.** Save/load dated snapshots, week-over-week diff,
  movers, churn, CSV export.
- **Phase 5 — polish + verify.** `PagePresets`, testids on every control,
  headless probe (drag reorders, pin → derived-edge assertion, cycle detection,
  snap-to-order, snapshot Δ), deploy, prod-verify.

## 9 · Open decisions (for you)

1. **Name / route** — "Conviction" `/conviction` (recommended), or "Rank Book"
   / other? Cross-Section group, or its own top-level tab?
2. **Strict order vs tiers** — you said "1 through N", so v1 = strict total
   order, strict pins (no ties). Tiers / "A ≈ B" indifference = future add.
3. **Primary interaction** — drag-first (recommended, matches how you described
   it) with duels secondary, or lead with duel mode?
4. **Book source** — a saved basket as the book (recommended), a manual list,
   or both?
5. **Reference columns** — which 2–3 metrics do you want beside each name while
   ranking (price, P/FFO, last-week rank+Δ, …)?
6. **Mid-week universe changes** — new names arrive in a "to place" tray at the
   bottom; removing a name drops its pins. OK?

## 10 · Verification approach

Engine (Phase 0) gets golden vectors: hand-built pin sets with known closures,
a known 3-cycle, a known conflict, a known topo snap — assert exact outputs
(same pattern as the MA-slope golden vectors). UI gets a headless puppeteer
probe driving drag + duels and asserting the badges/coverage, per the standard
verify workflow (CDP `setBlockedURLs` for autosave safety; block non-GET to
`/api/workspaces`, `/api/custom-charts`, `/api/prefs`).
