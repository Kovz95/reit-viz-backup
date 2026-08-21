# Indicators Panel Parity Plan

**Goal:** every side pop-out indicators panel in the app is the *same component* as the Charts-tab panel (`components/IndicatorsPanel.tsx`) — same pieces, same layout, same behavior — and everything the panel can configure actually renders on that page's charts.

**Date:** 2026-08-21 · **Status:** Phases 1–2 DONE (uncommitted); Phases 3–5 pending

> **Phase 1 done 2026-08-21:** panel is generic over pane-id type (`PanelPane<Id>`, string or number), `cloneIndicators` exported and used per-pane in ChartArea/Correlation/Macro apply-to-all + the panel's To…/copy-to-all paths, `chipsOpts` + `extraSections` props added. Verified via headless drive on 5210 (18/18 checks).
>
> **Phase 2 done 2026-08-21 (all 4 steps):** `PairsIndicatorsPanel` (548 lines) DELETED; Pairs page + `PairDetailCharts` now mount the canonical `IndicatorsPanel` (string chart ids, atomic apply-to-all/copy handlers, `chipsOpts={regPrefix,haAsOverlay}`, hidden-sub-panes chips via `extraSections` → new exported `PairsHiddenSubPanes`). `MiniChart` freq is controllable (`freq`/`onFreqChange` props; hosts own `chartFreqs` records; `pairPanelFrequency` maps to the panel's `frequency`) — G1–G3 fixed. Renderer catch-up in `MiniChart`: lookback hover lines (LookbackWindowPrimitive + crosshair setHover), mean `bandOpacity`/`shade` (IchimokuCloudPrimitive envelope), Auto Trendlines / S/R levels / Fib levels (detectors on closes, highs=lows=closes) — G6/G9/G10 fixed renderer-side. `chartBarsPerIndicatorBar` exported from ChartPane. Verified: Pairs drive 23/23, PairRatios detail 4/4, renderer pixel-probe 13/13, existing `verify-pairs-qol.mjs` full PASS. Note: `verify-charts-qol.mjs` has a **pre-existing** 3-check failure (weekly `RSI 14W` sub-pane axis-label lookup) — reproduced identically on clean HEAD with this work stashed; unrelated, investigate separately.

---

## Current landscape (from code audit)

There are **two** panel implementations serving **~17 surfaces**:

| Implementation | Surfaces |
|---|---|
| `components/IndicatorsPanel.tsx` (canonical, numeric pane ids) | Charts tab (`ChartArea.tsx:3039`), Correlation LWC grid (`Correlation.tsx:5249`), Macro (`Macro.tsx:1622`) |
| `PairsIndicatorsPanel` (`pages/Pairs.tsx:992–1535`, ~550-line clone, string chart ids) | Pairs page (mount `Pairs.tsx:4764`), plus **12 surfaces** via `PairDetailCharts` (`PairRatios.tsx:345–405`, panel mount `:391`) and its wrapper `PairSeriesDetailOverlay` (`:241`): PairRatios, Correlation-Dislocation (`Correlation.tsx:1710`), Distributions (`:1611`), DividendSpread (`:422`), Heatmap (`:1298`), PremiumDiscount (`:2973`), Ranking (`:2393`), SentimentPairs (`:522`), ValuationRerateResidence (`:1168`), FibScreener (`:474`), Oscillators (`:1994`), RelativeStrength (`:780`) |

The clone reuses `SectionHeader/IndicatorSetsSection/MaRow/BuiltinInstanceSection/RegistryIndicatorControls/IndicatorOverlays/IndicatorColorEditor` (import `Pairs.tsx:80`) but re-implements the shell, pane-selector row, section-collapse machinery, Heikin-Ashi, Fractal Lines, VWAP, and Mean-band blocks inline. Indicator Sets already share one store (`reit-viz:indicator-sets` + server prefs) across all panels.

**Correlation is already at prop-for-prop parity** with ChartArea (copy + frequency + atomic writes) and renders through the shared `ChartPane`, so it needs no work beyond the cross-cutting items in Phase 5.

### Gap inventory — PairsIndicatorsPanel vs canonical (Pairs.tsx line refs)

- **G1 Frequency hardcoded `"daily"`** at every callsite (`:1211,1227,1229,1231,1233,1248,1250,1284,1488`) while every chart has a live D/W/M selector — `chartFreq` is *local state inside `MiniChart`* (`:2733`, buttons `:3501–3517`) that the panel can't see. Freq dropdowns mislabel "Chart (D)" and registry param defaults resolve at daily.
- **G4 No "To…"** copy-whole-set-to-one-chart select (canonical `IndicatorsPanel.tsx:1352–1364`).
- **G5 No live "Apply to all panes" toggle** (canonical `:1385–1400`).
- **G6 No "Lookback window lines" toggle** (canonical `:1406–1417`).
- **G7 No `FindBestMAPanel`** at the end of Moving Averages (canonical `:1529–1533`).
- **G8 No `AutocorrBestLagPanel`** — `renderExtra` not passed to `RegistryIndicatorControls` (canonical `:1861–1886`).
- **G9 Trend section missing Auto Trendlines / S/R Levels / Fibonacci Levels** toggles — *and the Pairs `MiniChart` renderer has no support for them* (two-sided gap).
- **G10 Statistical missing band-opacity presets + "Shade band area"** (`mean.bandOpacity`, `mean.shade`; canonical `:1975–2002`).
- **G11 "Indicator Overlays" excluded from collapse-all** (separate `ovlCollapsed`, missing from `PAIRS_SECTIONS`).
- **G12 `applyHint` not passed** to `IndicatorSetsSection`.
- **G15 Section order differs**: Pairs renders Statistical *before* More Indicators; canonical is More Indicators → Statistical → Overlays.
- **G14 (shared debt)** `copyToAll`/apply-to-all do a shallow `{...activeIndicators}` — sibling panes alias the same `maLines`/`registry`/`instances` sub-objects. Canonical ChartArea has the identical bug (`ChartArea.tsx:3052`). Also Pairs `copyIndicatorToChart` (`:1023`) reads the target's base from the render-time prop instead of inside the updater (same-tick staleness; canonical reads `prev`).
- Pairs-only extra to preserve: **Hidden Sub-Panes restore chips** (`:1504–1524`) and `IndicatorChipsRow` opts `{ regPrefix: true, haAsOverlay: true }` (`:1159–1173`).

### Gap inventory — Macro (`Macro.tsx`)

- **M1** `onCopyIndicatorToPane` not passed → per-indicator Copy popover absent. Drop-in fix: translate through `numToChartId` (`:1611–1622`), `getInstances/setInstances` already imported (`:37`).
- **M2** `frequency` not passed — *correct as-is*: Macro has no chart-frequency concept (FRED series keep native cadence, panes can mix cadences). Leaving it undefined is the honest canonical behavior ("Chart" label). Do **not** invent a value; note Macro's `resolveParams` (`:714`) also omits freq, so panel and compute agree.
- **M3** `panelPanes` lacks `ticker` → `FindBestMAPanel` and Autocorr best-lag are dead ("No ticker on this pane"). FRED series aren't tickers, so this is *inherent*, not a wiring bug — accept canonical degradation.
- **M4** **Indicator Overlays section is a total no-op** — `indicatorOverlays` has zero references in Macro's renderer (rendered only in `ChartPane.tsx` and Pairs).
- **M5** **PatternsPanel is a no-op** — no pattern detection in Macro's renderer; worse, `usePatternSettings(paneId)` (`lib/patternSettings.ts:64`) is a global store keyed by raw paneId, so Macro's synthetic 0..N ids **collide with Charts-tab pane ids** (Correlation's 1/2/3 collide too).
- **M6** No sub-pane order/delete/hide wiring — panel chips' ✕/eye/reorder affordances partially inert (contrast `Correlation.tsx:1810–1824`).
- **M7** `panelPanes` built from `panes` while the grid renders `visiblePanes` — when a pane is maximized you can select an off-screen pane (cosmetic).

---

## Phase 1 — Generalize + harden the canonical panel

*File: `components/IndicatorsPanel.tsx` (+ `PaneInfo` in `pages/Dashboard.tsx:77`).*

1. **Accept string pane ids.** Widen `PaneInfo.id` and the panel props to `number | string` (or make the panel generic over the id type). Charts/Correlation keep numeric ids untouched; Pairs-family uses its string chart ids directly; Macro can later drop its numeric shim (optional cleanup, not required).
2. **Fix the shallow-copy debt (G14) once, centrally.** Deep-clone (`JSON.parse(JSON.stringify(...))`, matching existing idiom) inside `copyToAll` and the live apply-to-all path before dispatching to `onApplyToAllPanes`/`onChangeIndicators`, so no host ever receives aliased sub-objects. Hosts' own `onApplyToAllPanes` implementations get per-pane clones too.
3. **Add an optional `chipsOpts` prop** threaded to `IndicatorChipsRow` so the Pairs family can pass `{ regPrefix: true, haAsOverlay: true }` without forking the panel.
4. **Add an optional `extraSections` / `footer` render-prop slot** (rendered after the canonical sections, before Colors) so Pairs' "Hidden Sub-Panes" restore chips can live on without a fork. (Alternative: promote hidden-sub-pane restore into the canonical panel for all hosts — decide during implementation; the chips row's eye toggle already covers most of it on Charts.)
5. Keep all existing data-testids stable (verify scripts depend on them — see roster in the audit).

## Phase 2 — Replace `PairsIndicatorsPanel` with the canonical panel (12+ surfaces at once)

*Files: `pages/Pairs.tsx`, `pages/PairRatios.tsx`.*

1. **Lift `chartFreq` out of `MiniChart`.** Make it controllable: optional `freq`/`onFreqChange` props (default to internal state for uncontrolled callers). `PairDetailCharts` and the Pairs page own a `Record<chartId, "chart"|"weekly"|"monthly">` and pass the **active chart's** freq to the panel's `frequency` prop (fixes G1/G2/G3). The D/W/M chip row keeps its testids (`pairs-chart-${id}-freq-${f}`).
2. **Swap the mounts.** Pairs page (`:4764`) and `PairDetailCharts` (`PairRatios.tsx:391`) mount `IndicatorsPanel` with: panes = chart list (string ids, labels, `ticker` where a real ticker exists so Find-Best-MA/Autocorr light up), atomic `onApplyToAllPanes`, atomic `onCopyIndicatorToPane` reading `prev` inside the updater (kills the staleness bug), `onChangeIndicators`, `frequency`, `chipsOpts`, and the hidden-sub-panes extra section. This closes G4–G8, G10–G12, G15 *by construction* — the sections, order, collapse-all, sets `applyHint`, To… select, live apply-to-all toggle, lookback toggle, FindBestMA, Autocorr, mean-band opacity/shade all come from the canonical component.
3. **Delete `PairsIndicatorsPanel`** (~550 lines) and its now-unused inline HA/fractal/mean state. Keep the `ResizableSidebar` storage key situation in mind: canonical uses `charts-indicators-width`, Pairs used `pairs-indicators-width` — standardizing on the canonical key is acceptable (width preference converges; call it out in the commit).
4. **Renderer catch-up in `MiniChart`** so every new panel control actually does something (the "functionally identical" half):
   - `showLookbackWindow` hover lines (G6),
   - `mean.bandOpacity` + `mean.shade` (G10),
   - **Auto Trendlines, S/R Levels, Fibonacci Levels** (G9) — reuse `lib/srLevels.ts` (`detectSRLevels`; feed highs=lows=closes for close-only ratio series) and the Charts trendline/fib render helpers. Note MA-detection in `detectSRLevels` is expensive — compute on the chart's visible series, memoized per chart id + freq.
   - Verify `indicatorOverlays` and per-line `hiddenParts` still render (they exist today: `Pairs.tsx:1871, 2365`).
5. **PairRatios/PairDetailCharts inherit everything automatically** — no per-surface work for the other 11 embeds beyond smoke-testing them.

## Phase 3 — Macro parity

*File: `pages/Macro.tsx`.*

1. **M1:** add `onCopyIndicatorToPane` (translate ids through `numToChartId`, `getInstances`/`setInstances`, atomic functional write). Once Phase 1 lands string ids, optionally drop the numeric shim entirely and key the panel by Macro's real pane ids.
2. **M4:** implement `indicatorOverlays` rendering in Macro's compute path (`barsAt`/registry loop area `:697–720`) — overlay-on-indicator series drawn into the source band, mirroring `ChartPane.tsx:4909+` semantics.
3. **M5:** implement pattern rendering in Macro *or* (cheaper, acceptable) hide `PatternsPanel` when the host can't render patterns — add an optional `supportsPatterns` prop to the canonical panel, default true; Macro passes false. Decide at implementation; hiding is honest, silently-inert toggles are not.
4. **M6:** wire sub-pane chip actions Macro can honor (`hiddenSubCharts` already works; add delete-badge parity) and no-op the rest visibly.
5. **M7:** build `panelPanes` from `visiblePanes` when a pane is maximized.

## Phase 4 — Cross-cutting fixes

1. **Pattern-settings key collision (M5/Correlation):** namespace `usePatternSettings` keys per host (e.g. `charts:3`, `macro:0`, `corr:2`). Migrate existing un-namespaced keys to the `charts:` namespace on first load so Charts users keep their settings.
2. Correlation: no other work — confirm nothing regressed after Phase 1's id-type widening.

## Phase 5 — Verification (per `reit-viz:verify` skill)

1. `npx tsc --noEmit` + client build.
2. Headless-Chrome drive against the standalone Vite proxy (block POSTs to `/api/workspaces` + `/api/custom-charts`):
   - **Charts tab (regression):** panel unchanged — spot-check pane select, To…, apply-to-all toggle, an `inst-*` row, `indicator-search`, one indicator set apply.
   - **Pairs:** open panel; assert canonical testids present (`apply-indicators-to-all-toggle`, `copy-indicators-to-pane`, `toggle-lookback-window`, `autocorr-best-lag`, `mean-band-opacity-60`); set a chart to W and assert the panel freq dropdown labels "Chart (W)"; toggle S/R levels + fib and pixel-probe the canvas; copy one indicator to another chart and assert both charts render it.
   - **PairRatios + two embeds** (e.g. Heatmap pair detail, RelativeStrength overlay): open detail, open panel, assert canonical testids, toggle an indicator, confirm it renders.
   - **Macro:** copy-indicator popover works across panes; add an indicator overlay and confirm it draws (M4); patterns either render or the section is hidden (M5).
   - **Correlation:** unchanged smoke (panel opens, RSI instance adds, copy-to-pane works).
3. Existing verify scripts (`verify-pairs-qol.mjs`, `verify-multi-instance*.mjs`, `verify-corr-qol.mjs`, `verify-macro-qol.mjs`) must still pass — they lean on the testid roster.
4. Deploy (push to main → auto Vultr deploy; don't run manual client deploy concurrently) and re-drive the prod checks at https://45.63.20.126.

## Suggested commit slicing

1. Phase 1 (panel generalization + clone-fix + chipsOpts/extra slot) — no visible change on Charts.
2. Phase 2 steps 1–3 (Pairs family swap + delete clone) — panel parity everywhere, some toggles still renderer-inert.
3. Phase 2 step 4 (MiniChart renderer catch-up: lookback, mean band, trendlines/SR/fib).
4. Phase 3 (Macro) + Phase 4 (pattern namespacing).
5. Verify + deploy + prod verify.

## Explicitly out of scope (noted for later)

Chart surfaces with **no** indicator popout at all — separate initiative if wanted: LevelsAndTrendlines `CombinedChart` (strongest candidate), MacroRegime, RatesForward, Attribution/AttributionCompare, `ChartsPdSubplots` (sits beside the canonical panel but unwired), PCA/Scatter/RatingsChart/LeadLagChart/optimizer result charts (recharts/canvas — would need an adapter). `RangeOptimizer`'s "IndicatorPanel" is an optimizer feature editor, not a chart panel — leave alone. `FindBestMAPanel` is a child block of the canonical panel — leave alone.
