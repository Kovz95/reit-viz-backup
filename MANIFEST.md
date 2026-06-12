# REIT Viz Source Reconstruction Manifest

This file tracks reconstruction status for every file recovered from the live Vultr production bundle.

## Status legend
- `RAW` — beautified JS only, in `recovered-bundle/`
- `RECONSTRUCTED` — clean TypeScript in `reit-viz/client/src/`, not yet verified
- `VERIFIED` — reconstructed and produces an equivalent bundle (parity smoke-tested)
- `STALE` — pre-existing TypeScript in `stale-source/` from before the wipe, may be outdated

## Tiers
- **Tier 0** — Infrastructure (App.tsx, main.tsx, contexts, queryClient, index-CsG73Aq_.js) — must be done last because everything else depends on it
- **Tier 1** — Small leaf components (<300 lines)
- **Tier 2** — Medium pages (300-1500 lines)
- **Tier 3** — Large pages (1500-3000 lines)
- **Tier 4** — Largest pages + main entry (>3000 lines)

## Files

### Tier 1 — Small leaves
| File | Lines | Status | Notes |
|---|---|---|---|
| UnifiedTickerPicker-D927mSvl.js | 124 | RECONSTRUCTED | New since stale-source |
| BasketTickerPill-DA9Wjwwc.js | 128 | RECONSTRUCTED | New since stale-source; imports @/lib/useBaskets, @/lib/basketUtils (isBasketTicker, extractBasketId) |
| PresetBar-B4InBSQb.js | 187 | RECONSTRUCTED | New; has defensive `presets ?? []` fix; imports @/lib/optimizerPresets |
| BasketPicker-DkcKAXfe.js | 303 | RECONSTRUCTED | New since stale-source; imports @/lib/useBaskets, @/lib/basketUtils (dedupeUpperTickers) |
| ClassificationFiltersWithSource-D7v4WOtR.js | 77 | RECONSTRUCTED | Newer than stale ClassificationFilters.tsx; wraps ClassificationFilters with source toggle |
| Baskets-CFu3VD0m.js | 88 | RECONSTRUCTED | Basket page; uses @/lib/useBaskets, @/lib/basketEditorPanel |
| CartesianGrid-BQtjaw_K.js | 405 | RECONSTRUCTED | Recharts internal override with sub-components; uses @/lib/rechartsInternals |
| YieldCorrelation-Dp9JZcNi.js | 27 | RECONSTRUCTED | Trivial iframe wrapper for yield correlation chart |

### Tier 2 — Medium pages
| File | Lines | Status | Notes |
|---|---|---|---|
| Universe-s8lkGiqo.js | 485 | RECONSTRUCTED | Newer than stale Universe.tsx; classification override UI + excluded tickers |
| GlobalUniverseExplorer-Bnuulnji.js | 489 | RECONSTRUCTED | New; full-featured explorer with sorting, filtering, pagination; uses @/lib/globalUniverse |
| DataExplorer-Y0Xg6AZ4.js | 503 | RECONSTRUCTED | Newer than stale DataExplorer.tsx; virtual-scrolled metrics table with column picker |
| ShortInterest-CduJ1tqP.js | 567 | RECONSTRUCTED | Newer than stale ShortInterest.tsx; SI overview + movers view with sparklines |
| Alerts-DlZaNYym.js | 568 | RECONSTRUCTED | New; alert CRUD + evaluate endpoint; uses @/lib/createLucideIcon, @/lib/apiRequest |
| Valuation-58qiOq4f.js | 607 | RECONSTRUCTED | Newer than stale Valuation.tsx; z-score table with canvas sparklines, groupBy, pageState |
| ROCAnalysis-kpcfSeFI.js | 726 | RECONSTRUCTED | New |
| DividendSpread-Ck9w3CYe.js | 756 | RECONSTRUCTED | Newer than stale DividendSpread.tsx |
| ValuationRegime-BV1jZW8T.js | 766 | RECONSTRUCTED | Newer than stale ValuationRegime.tsx |
| PremiumDiscountScreener-D60ZbT1-.js | 819 | RECONSTRUCTED | New |
| Distributions-U9XjHz3w.js | 907 | RECONSTRUCTED | New |
| AutoTrendlineBacktest-BuiEwErn.js | 918 | RECONSTRUCTED | New — Charts-related |
| LevelsAndTrendlines-D9no3NXd.js | 990 | RECONSTRUCTED | New — Charts-related |
| Performance-CUtKWd0D.js | 1018 | RECONSTRUCTED | Newer than stale Performance.tsx |
| PairOptimizer-Df5S8y_J.js | 1106 | RECONSTRUCTED | Newer than stale PairOptimizer.tsx |
| PairRatios-B1PiWPRS.js | 1125 | RECONSTRUCTED | Newer than stale PairRatios.tsx; uses lightweight-charts dual-panel + inline sparkline canvas |
| Scatter-BxBV76dr.js | 1152 | RECONSTRUCTED | Newer than stale Scatter.tsx; canvas-based scatter with zoom/pan, regression, bubble-size, color-by-metric |
| PatternScreener-BVupFpw-.js | 1288 | RECONSTRUCTED | New — Charts-related; pattern+channel screener across single/universe/pair/combo/basket scopes |
| FactorBacktest-DTdYrgz4.js | ~ | RECONSTRUCTED | New; uses @/lib/workspaceContext (useWorkspaceTab), default CartesianGrid import |
| MacroRegime-DwnEMx4A.js | 1861 | RECONSTRUCTED | New |
| Macro-B6QgIETi.js | ~ | RECONSTRUCTED | Newer than stale Macro.tsx; pre-existing file, no header |
| Attribution-DFOfL3Ra.js | ~ | RECONSTRUCTED | New |
| RatesForward-CrzUd_CP.js | ~ | RECONSTRUCTED | New |
| RelativeStrength-DwYUHZhC.js | ~ | RECONSTRUCTED | New; useWorkspaceTab, filteredTickersList, fillMatrixRow typed |
| Scanner-d2v1M_Z9.js | ~ | RECONSTRUCTED | New |
| SetupsScreener-BjAZdHTT.js | ~ | RECONSTRUCTED | New; useWorkspaceTab, wouter useLocation |
| EvaluatorPanel-BcObXxAZ.js | 2104 | RECONSTRUCTED | New component (not page); unresolved: @/lib/signalUtils, @/lib/harsi, @/lib/tva |

### Tier 3 — Large pages
| File | Lines | Status | Notes |
|---|---|---|---|
| DualMAOptimizer | 1755 | RAW | New optimizer |
| Ranking | 1820 | RAW | Newer than stale Ranking.tsx |
| SlowStochOptimizer | 1831 | RAW | New optimizer; has presets fix |
| ZScoreOptimizer | 1837 | RAW | Newer than stale; has Combined branch + debug logs |
| MomentumOptimizer | 1853 | RAW | Newer than stale MomentumOptimizer.tsx |
| RSIRegimeOptimizer | 1870 | RAW | Newer than stale RSIRegimeOptimizer.tsx |
| HarsiOptimizer | 1885 | RAW | New optimizer |
| ComboOptimizer | 1915 | RAW | New optimizer |
| SigmaMove-BeLjHH1_.js | 1923 | RECONSTRUCTED | New; useAppStatus for setLastQuoteFetchedAt; unresolved: @/lib/appStatus, @/lib/fetchMetricSeriesBatch, @/lib/fetchEarningsDates |
| SimilarSetups-B0jnj8dI.js | 2006 | RECONSTRUCTED | New; unresolved: @/lib/similarSetupsAlgorithms, @/lib/fetchOhlcSeries, @/lib/fetchCloseSeries, @/lib/basketSymbol, @/lib/filterTickersByClassification, @/lib/fetchTradingDates, @/hooks/usePairComboPicker |
| Trendlines | 2127 | RAW | Charts-related |
| Ratings | 2199 | RAW | Newer than stale Ratings.tsx |
| SupportResistance | 2208 | RAW | Charts-related |
| RangeOptimizer | 2302 | RAW | New optimizer |
| Oscillators | 2303 | RAW | New |
| Screener | 2639 | RAW | Newer than stale Screener.tsx |
| PriceAction | 2841 | RAW | Charts-related, main page |
| Correlation | 3072 | RAW | Newer than stale Correlation.tsx |

### Tier 4 — Largest
| File | Lines | Status | Notes |
|---|---|---|---|
| Pairs | 3808 | RAW | Newer than stale Pairs.tsx |
| PremiumDiscount | 4008 | RECONSTRUCTED | New; 2802 lines TSX; unresolved: @/lib/premiumDiscount, @/lib/crossCorrelation, @/lib/rollingCorr, @/lib/computeStats, @/lib/percentile, @/lib/basketAggregation, @/lib/trendingDownIcon, @/lib/calendarIcon, @/lib/earningsPrimitive |
| ROCOptimizer | 4548 | RECONSTRUCTED | New optimizer; 3674 lines TSX; fixed fragment close (</>) before ternary end; unresolved: @/lib/signalUtils, @/lib/rocOptimizer libs |
| MACrossoverOptimizer | 5454 | RAW | Newer than stale; has Evaluate basket UI + dep-array fix |
| index-CsG73Aq_.js | 131700 | RAW | Main entry: router, App, contexts, vendored deps |

### Tier 0 — Will be derived from index-CsG73Aq_.js once Tier 1-3 are done
| File | Status | Notes |
|---|---|---|
| App.tsx | STALE | needs router updates for all new pages |
| main.tsx | STALE | likely OK |
| client/src/lib/* | STALE+ | need to add basketOhlc, useBaskets, optimizerPresets, useFrequency, weeklyDownsample, optimizerInputSeries, etc. |
| server/* | STALE | check vs Vultr `/opt/reit-viz/server/` later |

## Lib files (hand-written from call-site inference)

| File | Status | Notes |
|---|---|---|
| client/src/lib/basketUtils.ts | RECONSTRUCTED | Hand-written; `isBasketTicker`, `extractBasketId` use `BASKET:` prefix confirmed from bundle; `dedupeUpperTickers` caps at 50 |
| client/src/lib/useBaskets.ts | RECONSTRUCTED | Hand-written; localStorage key `reit-viz:baskets:v1`; Basket interface extended with `weighting/rebalance/customWeights/volLookback` fields inferred from call sites and bundle; `addBasket` accepts optional third `BasketOptions` arg (seen in BasketPicker.tsx line 153) |
| client/src/lib/optimizerPresets.tsx | RECONSTRUCTED | Hand-written; Context provider pattern matches bundle's `vHe/nXe`; per-kind storage keys `reit-viz:optimizer-presets:v1:<kind>`; OptimizerKind union includes all recently-deployed additions (slowstoch, zscore, momentum, rsi-regime, dualma, tva); `getPreset` added beyond spec — seen in bundle's `nXe` return value |

## Recent deployed fixes (preserve during reconstruction)
- `optimizerPresets.tsx`: OptimizerKind union extends `"slowstoch" | "zscore" | "momentum" | "rsi-regime" | "dualma" | "tva"`; EMPTY_STORE and three iterator loops updated.
- `PresetBar.tsx`: defensive `const presets = presetsHook.presets ?? [];`
- `ZScoreOptimizer.tsx`: debug logs in Combined branch around lines 463-477
- `MACrossoverOptimizer.tsx`: Evaluate tab Single|Pair|Basket buttons + BasketPicker; dep arrays include `runTickers, basketTickers, basketMode, savedBaskets, pairCombo.pairs, inputSelection`
- 11 dep-array patches: ROC (3), ZScore (2), Momentum (1), RSIRegime (2), TVA (2), Oscillators (1)
