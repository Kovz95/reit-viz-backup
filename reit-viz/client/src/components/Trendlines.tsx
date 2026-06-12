// Stub component module — re-exports from pages/Trendlines.tsx and provides
// the named bindings that LevelsAndTrendlines.tsx needs via:
//   import { d as detectTrendlines, D as TrendlinesPanel, T as TrendlinesSubPanel }
//     from "@/components/Trendlines";

import React from "react";

// ── Re-use types / functions from the page module ────────────────────────────

// Inline the minimal types so this file is self-contained.

interface Touch {
  date: string;
  index: number;
  priceAtTouch: number;
  projectedValue: number;
  deviationPct: number;
}

export interface TrendlineResult {
  kind: "resistance" | "support";
  i1: number;
  i2: number;
  date1: string;
  date2: string;
  price1: number;
  price2: number;
  slope: number;
  slopePctPerYear: number;
  touches: Touch[];
  touchCount: number;
  firstTouchIndex: number;
  lastTouchIndex: number;
  spanBars: number;
  broken: boolean;
  brokenAtIndex: number | null;
  brokenAtDate: string | null;
  rSquared: number;
  daysSinceLastTouch: number | null;
  currentProjection: number;
  compositeScore: number;
}

export interface TrendlineConfig {
  method: string;
  pivotLeft: number;
  pivotRight: number;
  tolerancePct: number;
  useAtrTolerance: boolean;
  atrToleranceMultiplier: number;
  atrPeriod: number;
  breakTolerancePct: number;
  minTouchCount: number;
  minSpanBars: number;
  maxSlopePerYear: number;
  maxAnchorGapBars: number;
  ransacIterations: number;
  ransacMinInliers: number;
  topN: number;
  slopeClusterTolerance: number;
  interceptClusterTolerancePct: number;
  filterBrokenLines: boolean;
}

interface OhlcData {
  dates: string[];
  closes: number[];
  highs: number[];
  lows: number[];
}

// ── detectTrendlines ─────────────────────────────────────────────────────────

// The real implementation lives in pages/Trendlines.tsx. This stub provides a
// type-correct fallback so LevelsAndTrendlines can import it.
// Stub — TODO: reverse-engineer algorithm from production bundle.
export function detectTrendlines(
  _ohlc: OhlcData,
  _cfg?: TrendlineConfig
): TrendlineResult[] {
  return [];
}

// Alias: LevelsAndTrendlines imports `d as detectTrendlines`
export { detectTrendlines as d };

// ── TrendlinesPanel ──────────────────────────────────────────────────────────
// LevelsAndTrendlines uses `TrendlinesPanel` as a config object:
//   const trendlineConfig = TrendlinesPanel;
//   detectTrendlines(ohlcData, trendlineConfig)

export const TrendlinesPanel: TrendlineConfig = {
  method: "pivot-pairs",
  pivotLeft: 5,
  pivotRight: 5,
  tolerancePct: 0.005,
  useAtrTolerance: false,
  atrToleranceMultiplier: 0.5,
  atrPeriod: 14,
  breakTolerancePct: 0.015,
  minTouchCount: 3,
  minSpanBars: 20,
  maxSlopePerYear: 5,
  maxAnchorGapBars: 250,
  ransacIterations: 500,
  ransacMinInliers: 4,
  topN: 10,
  slopeClusterTolerance: 0.15,
  interceptClusterTolerancePct: 0.02,
  filterBrokenLines: false,
};

// Alias: LevelsAndTrendlines imports `D as TrendlinesPanel`
export { TrendlinesPanel as D };

// ── TrendlinesSubPanel ───────────────────────────────────────────────────────
// Rendered as <TrendlinesSubPanel /> inside LevelsAndTrendlines.

export function TrendlinesSubPanel(): React.ReactElement | null {
  // Stub — TODO: reverse-engineer from production bundle
  return null;
}

// Alias: LevelsAndTrendlines imports `T as TrendlinesSubPanel`
export { TrendlinesSubPanel as T };
