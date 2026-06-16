# Reconstruction Completion Plan — make 5001 a faithful editable copy of the 5000 bundle

**Goal:** The editable reconstruction (`reit-viz/`, served on port 5001) should become a
faithful, complete editable source copy of the latest compiled production bundle
(`recovered-bundle-min/`, served on port 5000). This is an **audit-and-complete** effort,
NOT a from-scratch rebuild — ~244 source files (54 pages, 75 components, 115 libs) are
already reconstructed, build cleanly, and pass route-level parity.

> Paste the "Kickoff prompt" at the bottom into a fresh Claude Code session to start.

---

## Ground truth & layout (Windows: `C:\Users\NickK\Projects\Stock-market-viz-app`)

- `recovered-bundle-min/` — 89 chunks, **byte-for-byte what Vultr serves** = port 5000 = the target.
- `recovered-bundle/` — 60 **beautified/readable** chunks (re-derive source from these).
- `reit-viz/` — the editable reconstruction (its own client + server). Built into `reit-viz:editable`, runs on **5001**.
- `reit-viz:bundle` image — the minified bundle, runs on **5001's neighbor 5000** for parity diffing.
- `RECONSTRUCTION_GUIDE.md` — **style rules every reconstruction must follow** (naming, imports, verbatim className/data-testid, no new features). Read it first.
- `MANIFEST.md` — per-file RAW→RECONSTRUCTED→VERIFIED tracker. **Pessimistic** — verify against actual files.
- `diag/compare.mjs` — headless parity harness (loads all 53 routes on 5000 vs 5001, captures crashes/console errors). Run with host Chrome via `playwright-core`.

## Already done (this session — PR #1 on branch `fix/reconstruction-crashes-and-deploy`)
Fixed 4 ErrorBoundary crashes + 1 server 500, all verified against the bundle:
- scatter (null `workbookTickers` + `/api/scatter` param names `x/y/z/date`)
- momentum (`createDateRangeFromPreset()` undefined guard)
- auto-trendline-backtest (`TRENDLINE_DIRECTION_MAP` keys/labels recovered from bundle)
- levels (restored real `D`/`d`/`S` exports in SupportResistance.tsx; `isBasketTicker` guard)
- ranking (`ranking_templates` missing columns + migration)

## The gap (as of this plan)
- **MANIFEST: 19 entries still `RAW`** — but several are already reconstructed. Reconcile first.
- **29 chunks exist only in `recovered-bundle-min/` (no beautified version).** ~12 are trivial
  lucide/shadcn primitives already present (`badge card tabs calendar arrow-up-down external-link
  minus pin play square trending-down undo-2`). The ~17 real logic libs to confirm/reconstruct:
  `basketOhlc driverScan globalUniverse harsi oscillatorMath pairSignalAnalyzer rocSignalDetect
  similarSetupsAlgorithms tva universeDefaults universeSignature useFrequency useOptimizerClassFilter
  usePairComboPicker weeklyDownsample workerPool yahooPairsRatio` — most are likely already in
  `reit-viz/client/src/lib/`; only reconstruct the genuinely missing ones.

## Method (per work item)
1. **Reconcile** MANIFEST vs actual `reit-viz/client/src/**` — mark already-present files, list true gaps.
2. **Beautify** any min-only chunk you actually need (the readable version may be absent): pretty-print
   the `recovered-bundle-min/<name>.js` and trace it, OR find it inside `recovered-bundle/index-*.js`.
3. **Reconstruct** missing files per `RECONSTRUCTION_GUIDE.md` (verbatim className/data-testid, no new features).
4. **Behavioral audit** of each page: open its beautified chunk, compare the reconstruction's logic
   (calculations, state machines, API calls, edge cases) — not just that it renders. Fix divergences.
5. **Verify**: `cd reit-viz && npx vite build` (must stay green), then rebuild the image and run the
   diff harness against the bundle:
   ```
   docker build -t reit-viz:editable ./reit-viz
   docker rm -f reit-viz; docker run -d --name reit-viz -p 5001:5000 --restart unless-stopped reit-viz:editable
   cd diag && node compare.mjs   # 0 ErrorBoundary crashes; investigate any new DIVERGES
   ```
   Note: 404 noise on `/api/ticker/:sym` is benign (the bundle does it too). Only `eb=true`
   (ErrorBoundary) or non-`/api/ticker` errors are real.
6. **Commit** in batches to the PR branch; do not push to live. Update MANIFEST status.

## Suggested order (dependency-aware)
Tier 0 infra (App/contexts/queryClient) is done. Work leaf libs → components → pages.
Prioritize pages with the most user logic: optimizers (ROC, Range, SlowStoch, Harsi, Combo, TVA),
PatternScreener, SimilarSetups, PremiumDiscount, Correlation, FactorBacktest, Macro/MacroRegime.

## Parallelization
This fans out cleanly: one agent per page/chunk, each (a) reconstructs/audits its file against the
matching beautified chunk and (b) reports divergences. A verifier re-checks each against the bundle.
If you want maximum throughput, run it as a multi-agent workflow (opt-in / "ultracode").

---

## Kickoff prompt (paste into a new session)

> I'm continuing a disaster-recovery reconstruction. The latest production app survives only as a
> minified bundle in `recovered-bundle-min/` (served on port 5000); I'm rebuilding it as editable
> source in `reit-viz/` (served on port 5001). Read `RECONSTRUCTION_PLAN.md` and
> `RECONSTRUCTION_GUIDE.md` first, then:
> 1. Reconcile `MANIFEST.md` against the actual files in `reit-viz/client/src/**` and report the
>    true list of unreconstructed / divergent files.
> 2. Propose an ordered work plan to close the gaps and reach faithful parity with the 5000 bundle.
> 3. Use `diag/compare.mjs` (headless harness) + `docker build`/`run` to verify after each batch.
> Don't push to live. Commit to the existing PR branch `fix/reconstruction-crashes-and-deploy`.
> Start with step 1 (the reconciliation) and show me the gap list before doing large reconstruction.
