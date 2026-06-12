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
| UnifiedTickerPicker-D927mSvl.js | 124 | RAW | New since stale-source |
| BasketTickerPill-DA9Wjwwc.js | 128 | RAW | New since stale-source |
| PresetBar-B4InBSQb.js | 187 | RAW | New; has defensive `presets ?? []` fix |
| BasketPicker-DkcKAXfe.js | 303 | RAW | New since stale-source |
| ClassificationFiltersWithSource-D7v4WOtR.js | 77 | RAW | Newer than stale ClassificationFilters.tsx |
| Baskets-CFu3VD0m.js | 88 | RAW | Basket page |
| CartesianGrid-BQtjaw_K.js | 405 | RAW | Likely a recharts custom; could possibly skip |
| YieldCorrelation-Dp9JZcNi.js | 27 | RAW | Tiny — probably a route wrapper |

### Tier 2 — Medium pages
| File | Lines | Status | Notes |
|---|---|---|---|
| Universe-s8lkGiqo.js | 485 | RAW | Newer than stale Universe.tsx |
| GlobalUniverseExplorer-Bnuulnji.js | 489 | RAW | New |
| DataExplorer-Y0Xg6AZ4.js | 503 | RAW | Newer than stale DataExplorer.tsx |
| ShortInterest-CduJ1tqP.js | 567 | RAW | Newer than stale ShortInterest.tsx |
| Alerts-DlZaNYym.js | 568 | RAW | New |
| Valuation-58qiOq4f.js | 607 | RAW | Newer than stale Valuation.tsx |
| ROCAnalysis-kpcfSeFI.js | 726 | RAW | New |
| DividendSpread-Ck9w3CYe.js | 756 | RAW | Newer than stale DividendSpread.tsx |
| ValuationRegime-BV1jZW8T.js | 766 | RAW | Newer than stale ValuationRegime.tsx |
| PremiumDiscountScreener-D60ZbT1-.js | 819 | RAW | New |
| Distributions-U9XjHz3w.js | 907 | RAW | New |
| AutoTrendlineBacktest-BuiEwErn.js | 918 | RAW | New — Charts-related |
| LevelsAndTrendlines-D9no3NXd.js | 990 | RAW | New — Charts-related |
| Performance-CUtKWd0D.js | 1018 | RAW | Newer than stale Performance.tsx |
| PairOptimizer-Df5S8y_J.js | 1106 | RAW | Newer than stale PairOptimizer.tsx |
| PairRatios-B1PiWPRS.js | 1125 | RAW | Newer than stale PairRatios.tsx |
| Scatter-BxBV76dr.js | 1152 | RAW | Newer than stale Scatter.tsx |
| PatternScreener-BVupFpw-.js | 1288 | RAW | New — Charts-related |
| FactorBacktest-DTdYrgz4.js | ~ | RAW | New |
| MacroRegime-DwnEMx4A.js | 1861 | RAW | New |
| Macro-B6QgIETi.js | ~ | RAW | Newer than stale Macro.tsx |
| Attribution-DFOfL3Ra.js | ~ | RAW | New |
| RatesForward-CrzUd_CP.js | ~ | RAW | New |
| RelativeStrength-DwYUHZhC.js | ~ | RAW | New |
| Scanner-d2v1M_Z9.js | ~ | RAW | New |
| SetupsScreener-BjAZdHTT.js | ~ | RAW | New |
| EvaluatorPanel-BcObXxAZ.js | 2104 | RAW | New |

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
| SigmaMove | 1923 | RAW | New |
| SimilarSetups | 2006 | RAW | New |
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
| PremiumDiscount | 4008 | RAW | New |
| ROCOptimizer | 4548 | RAW | New optimizer |
| MACrossoverOptimizer | 5454 | RAW | Newer than stale; has Evaluate basket UI + dep-array fix |
| index-CsG73Aq_.js | 131700 | RAW | Main entry: router, App, contexts, vendored deps |

### Tier 0 — Will be derived from index-CsG73Aq_.js once Tier 1-3 are done
| File | Status | Notes |
|---|---|---|
| App.tsx | STALE | needs router updates for all new pages |
| main.tsx | STALE | likely OK |
| client/src/lib/* | STALE+ | need to add basketOhlc, useBaskets, optimizerPresets, useFrequency, weeklyDownsample, optimizerInputSeries, etc. |
| server/* | STALE | check vs Vultr `/opt/reit-viz/server/` later |

## Recent deployed fixes (preserve during reconstruction)
- `optimizerPresets.tsx`: OptimizerKind union extends `"slowstoch" | "zscore" | "momentum" | "rsi-regime" | "dualma" | "tva"`; EMPTY_STORE and three iterator loops updated.
- `PresetBar.tsx`: defensive `const presets = presetsHook.presets ?? [];`
- `ZScoreOptimizer.tsx`: debug logs in Combined branch around lines 463-477
- `MACrossoverOptimizer.tsx`: Evaluate tab Single|Pair|Basket buttons + BasketPicker; dep arrays include `runTickers, basketTickers, basketMode, savedBaskets, pairCombo.pairs, inputSelection`
- 11 dep-array patches: ROC (3), ZScore (2), Momentum (1), RSIRegime (2), TVA (2), Oscillators (1)
