// Hand-written from call-site inference
// TODO: reverse-engineer detection algorithm from production bundle
// The actual pattern/channel detection lives in the minified main bundle;
// these are stubs that return empty results with the correct interface.

export interface TrendlineBar {
  time: string;
  value: number;
  high?: number;
  low?: number;
  close?: number;
}

export interface PatternResult {
  kind: string;
  startIdx: number;
  endIdx: number;
  points: { idx: number; value: number }[];
  r2?: number;
  touches?: number;
  [key: string]: any;
}

export interface ChannelResult {
  type: string;
  startIdx: number;
  endIdx: number;
  upper: number[];
  lower: number[];
  mid?: number[];
  r2?: number;
  containment?: number;
  [key: string]: any;
}

export interface PatternOptions {
  pivotLookback?: number;
  minR2?: number;
  minTouches?: number;
  minBars?: number;
  maxBars?: number;
  lookbackBars?: number;
  maxPatterns?: number;
  enabled?: Record<string, boolean>;
  [key: string]: any;
}

export interface ChannelOptions {
  types?: string[];
  stdevMult?: number;
  minR2?: number;
  minContainment?: number;
  minTouches?: number;
  maxChannels?: number;
  lookbackBars?: number | number[];
  [key: string]: any;
}

export interface AutoTrendlineResult {
  patterns?: PatternResult[];
  channels?: ChannelResult[];
  [key: string]: any;
}

export function getDefaultPatternOptions(): PatternOptions {
  return {
    pivotLookback: 5,
    minR2: 0.85,
    minTouches: 3,
    minBars: 20,
    maxBars: 500,
    lookbackBars: 200,
    maxPatterns: 12,
    enabled: {
      "ascending-triangle": true,
      "descending-triangle": true,
      "symmetric-triangle": true,
      "head-and-shoulders": true,
      "inverse-head-and-shoulders": true,
      "double-top": true,
      "double-bottom": true,
      "rising-wedge": true,
      "falling-wedge": true,
      "rectangle": true,
    },
  };
}

export function getDefaultChannelOptions(): ChannelOptions {
  return {
    types: ["regression"],
    stdevMult: 2,
    minR2: 0.8,
    minContainment: 0.75,
    minTouches: 3,
    maxChannels: 6,
    lookbackBars: [50, 100, 200],
  };
}

/**
 * Detects chart patterns in a bar series.
 * Stub — returns empty array. Detection logic is in the production bundle.
 */
export function detectPatterns(
  bars: TrendlineBar[],
  opts?: PatternOptions
): PatternResult[] {
  // TODO: reverse-engineer detection algorithm from production bundle
  return [];
}

/**
 * Detects price channels in a bar series.
 * Stub — returns empty array. Detection logic is in the production bundle.
 */
export function detectChannels(
  bars: TrendlineBar[],
  opts?: ChannelOptions
): ChannelResult[] {
  // TODO: reverse-engineer detection algorithm from production bundle
  return [];
}

/**
 * Computes auto trendlines for a single ticker's OHLCV candle array.
 * Stub — returns empty result. Detection logic is in the production bundle.
 */
export function computeAutoTrendlines(
  candles: any[],
  n?: number,
  opts?: PatternOptions
): AutoTrendlineResult {
  // TODO: reverse-engineer detection algorithm from production bundle
  return { patterns: [], channels: [] };
}
