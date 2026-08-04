# Monthly Frequency Rollout Plan

**Date:** 2026-08-04
**Goal:** Offer a Monthly (M) bar-frequency option everywhere the app already offers Daily/Weekly (and Hourly where applicable), with consistent calendar-month semantics: bucket by calendar month, last close of the month, max high / min low, first open, summed volume — matching `weeklyDownsample(…, "monthly")`.

---

## 0. Current state (audited 2026-08-04)

Monthly is **already implemented and live** in more places than expected:

- **Charts tab** — the Sidebar Frequency picker renders **1H / D / W / M** (`components/Sidebar.tsx:824-828`, `btn-freq-monthly`). `ChartArea.tsx:1067` downsamples every pane's series + OHLC to calendar-month bars via `chartFrequency.ts`. Sub-indicator charts, per-indicator Freq selects (Chart/Weekly/Monthly in `IndicatorsPanel.tsx:669`), RSI freq, fractal timeframe (`ChartArea.tsx:2542`), patterns, and seeded overlays all support monthly already. **The Charts-tab ask is done — it only needs verification (Phase 1).**
- **Shared infra** — `lib/useFrequency.ts` (D/W/M/W-D hook), `lib/weeklyDownsample.ts` (`mode: "monthly"` on both the OHLCV and price-series downsamplers), `lib/chartFrequency.ts` all handle monthly.
- **12 of 13 optimizer pages**, Oscillators, AutoTrendlineBacktest, SigmaFamily (Event Lab), Levels & Trendlines page, and Pairs already expose M and thread it through compute.

What's actually missing or broken is below.

---

## 1. Phase 1 — Fix the one real bug (highest priority)

### 1a. ZScoreOptimizer: M button exists but silently computes on DAILY bars
- `pages/ZScoreOptimizer.tsx:28` imports `resampleWeekly` from `lib/optimizerInputSeries.ts`, whose implementation (`optimizerInputSeries.ts:114-124`) only downsamples when `mode === "weekly"` — `"monthly"` falls through as an **identity** (returns daily data unchanged). The page then labels the results "monthly" and applies monthly minBars thresholds to daily bars.
- **Fix:** make `optimizerInputSeries.resampleWeekly` monthly-aware (delegate to `weeklyDownsample(…, mode)`), which auto-fixes ZScore. Also audit the other importers of this helper (DualMA, Harsi, SlowStoch — they currently only pass literal `"weekly"`, so unaffected, but the trap goes away).

### 1b. DualMAOptimizer: inconsistent monthly semantics
- `pages/DualMAOptimizer.tsx:22-27` approximates monthly with a fixed **21-bar stride** on closes (no calendar-month bucketing, no high/low aggregation). Works, but disagrees with every other page.
- **Fix:** replace `monthlyStride` with `weeklyDownsample(…, "monthly")` for calendar-month parity.

---

## 2. Phase 2 — Cheap wins: pages where monthly "just works" once the UI passes it

These three surfaces have a Daily/Weekly toggle and a compute path that already calls `weeklyDownsample` — but with the string literal `"weekly"` instead of the state variable. Each fix = add an M button + change one literal.

| Surface | Toggle UI | Hardcoded literal |
|---|---|---|
| `components/Trendlines.tsx` | `:1156-1157` | `:942` |
| `pages/Trendlines.tsx` (near-duplicate) | `:1090-1091` | `:876` |
| `components/SupportResistance.tsx` | `:577-578` | `:448` |

Extend the state union to include `"monthly"`, add the button, pass `timeframe` through. Watch for weekly-tuned defaults (pivot spans, min-touch counts) — sanity-check them on ~1/4 the bar count.

---

## 3. Phase 3 — Real plumbing: pages needing a monthly compute branch

### 3a. Attribution (`pages/Attribution.tsx`) — currently D/W
- State `useState<"daily"|"weekly">` `:971`, D/W buttons `:1324-1332`, hardcoded `resampleAlignedWeekly` `:1159`, window rescale `windowDays/5` `:1162`, "weeks" labels at `:1329-1351`, and prop type `freq?: "daily"|"weekly"` in `components/AttributionCompare.tsx:70`.
- **Work:** extend both unions; write `resampleAlignedMonthly` (sample last row per calendar month, mirroring the weekly sampler); rescale rolling windows by ~21 (not 5); relabel "weeks" → "mo"; add the M button.

### 3b. MA Slope (`pages/MaSlope.tsx` + `lib/maSlopeData.ts` + `lib/maSlope.ts`) — currently 1H/D/W
- `SlopeFreq = "hourly"|"daily"|"weekly"` (`maSlope.ts:22`), `FREQS` `:41-44`, weekly Friday bucketing + partial-week drop in `maSlopeData.ts:151-164`.
- **Work:** extend `SlopeFreq`; add a monthly branch in `maSlopeData.ts` using `weeklyDownsample(…, "monthly")`; drop the trailing **partial month** (analog of the Friday check: drop the last bucket unless the last bar is month-end). Event-study horizons are in bars — document that horizons now mean months.

### 3c. Correlation (`pages/Correlation.tsx` + `lib/correlationEngine.ts` + `lib/correlationDislocationScan.ts`) — currently 1H/D/W
- `CorrFrequency`/`ScanTF` unions cap at weekly (`correlationEngine.ts:13`, `correlationDislocationScan.ts:31`); `CORR_FREQS` `:229-232`; the TF-divergence panel keys on H/D/W (`:1777`, `:3395`).
- **Work:** extend unions, add resample branch, add M chip. **Product call:** monthly rolling correlation with the default windows (e.g., 60 bars = 5 years of monthly data) may be thin — either shrink default windows in monthly mode (e.g., 12/24/36) or ship monthly only on the pairwise page and skip the dislocation scanner. Recommend: pairwise yes with monthly-scaled window presets; scanner stays H/D/W.

### 3d. MTF Setups (`pages/MTFSetups.tsx` + `lib/mtfEngine.ts` / `lib/mtfData.ts`) — currently H/D/W
- This is a cross-timeframe **confluence** engine; adding monthly means a 4th confluence layer, monthly-onto-daily forward-fill maps (strict-`<`, no lookahead — same rule as the existing weekly maps in `mtfData.ts:211-224`), and UI weights.
- **Recommend: defer / optional.** Monthly signals update ~12×/year; confluence value is low relative to the plumbing cost. Include only if you actually want monthly-trend gating; if so, it's a forward-fill map addition, not a redesign.

---

## 4. Cross-cutting rules (apply to every phase)

1. **One downsampler.** All monthly bucketing goes through `weeklyDownsample(…, "monthly")` / `weeklyDownsamplePrices(…, "monthly")` (or `chartFrequency.ts` on the Charts tab). No new stride-based approximations.
2. **Partial-month handling.** Weekly paths drop/flag partial weeks via the Friday check; the monthly analog is "last bar's month still open." Decide per-surface: charts show the in-progress month bar (they do today); signal/backtest engines should drop the open month to avoid lookahead-ish partial bars.
3. **Bar-count scaling.** Wherever weekly code divides by 5 or multiplies by 52, monthly needs 21 / 12. Grep targets: `windowDays/5`, `* 52`, `minBars`, warmup thresholds (existing monthly-aware pages use minBars 24 = 2 years — keep that convention).
4. **Labels.** "weeks" → "mo" in any rolling-window label tied to the toggle.
5. **Persistence.** Pages that persist frequency (localStorage/server prefs) must tolerate the new `"monthly"` value on hydrate — most validators (`isValidFrequency`) already do.

---

## 5. Verification (per the repo verify skill)

- Drive each changed page headless (standalone Vite → 5001 API, CDP) with probes that **block POSTs to /api/workspaces + /api/custom-charts**.
- Golden checks per surface: monthly bar count ≈ daily count / 21; last monthly close === last daily close; a known month's high/low match the max/min of that month's dailies.
- ZScore fix gets a before/after check: monthly run must produce different (fewer-bar) results than daily.
- Charts tab: no code change expected — just confirm M renders on price + sub-indicator panes and the spacer axis follows (per the 08e417d gotcha: sub-charts must use spacerTimes).
- Prod verify after deploy (standing rule).

---

## 6. Suggested sequencing

| Order | Item | Size |
|---|---|---|
| 1 | ZScore/optimizerInputSeries monthly fix (bug) | XS |
| 2 | DualMA calendar-month parity | XS |
| 3 | Trendlines ×2 + SupportResistance | S |
| 4 | MA Slope monthly | M |
| 5 | Attribution monthly | M |
| 6 | Correlation pairwise monthly (scaled windows) | M |
| 7 | MTF Setups monthly layer | L — deferred by default |

Items 1–3 are one small PR. Items 4–6 are one PR each. Item 7 only on demand.
