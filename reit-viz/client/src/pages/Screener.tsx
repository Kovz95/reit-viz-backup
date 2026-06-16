import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTickers, getMetricSeries, isPercentMetric, getCustomFundamentalMetrics } from "@/lib/dataService";
import type { TickerMeta } from "@/lib/dataService";
import {
  computeSMA,
  computeEMA,
  computeHMA,
  computeRSI,
  computeROC,
  computeMACD,
  computeBollingerBands,
  computeATR,
  computeStochastic,
  computeOBV,
} from "@/lib/indicators";
import type { DataPoint } from "@/lib/indicators";
import {
  alignSeries,
  computeDerived,
  DERIVED_DEFS,
  type DerivedType,
  type TV,
} from "@/lib/pairMath";
import { useUniverse } from "@/lib/universeContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Filter,
  Plus,
  X,
  Play,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  AlertCircle,
  ListFilter,
  Check,
  ArrowRightLeft,
  Download,
  Clock,
  Calendar,
  Save,
  Trash2,
  FolderOpen,
  Globe,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";
import { Link } from "wouter";
import ClassificationFilters from "@/components/ClassificationFilters";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import type { ScreenerPreset } from "@shared/schema";

// ─────────────────────────────────────────────
// Metric options (mirror Ranking.tsx exactly)
// ─────────────────────────────────────────────
const METRIC_OPTIONS: Record<string, string[]> = {
  Valuation: [
    "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2",
    "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2",
    "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate",
  ],
  Yields: [
    "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
    "Dividend Yield",
  ],
  Estimates: [
    "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2",
    "AFFO FY1", "AFFO FY2", "EBITDA FY1", "EBITDA FY2",
  ],
  Growth: [
    "FY1 EPS Growth", "FY2 EPS Growth",
    "FY1 FFO Growth", "FY2 FFO Growth",
    "FY1 AFFO Growth", "FY2 AFFO Growth",
  ],
  Performance: [
    "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
    "% off 52wk High", "% off 52wk Low",
  ],
  "Short Interest": [
    "Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M",
  ],
  Other: [
    "close", "Enterprise Value", "Dividend",
    "Buy Ratings", "Hold Ratings", "Sell Ratings",
  ],
};

const ALL_METRICS = Object.values(METRIC_OPTIONS).flat();
const DEFAULT_METRIC = "P/FFO FY2";

const INDICATOR_TYPES = [
  "None", "SMA", "EMA", "HMA", "RSI", "ROC",
  "MACD Line", "MACD Signal", "MACD Hist",
  "BB Upper", "BB Basis", "BB Lower",
  "ATR", "Stoch %K", "Stoch %D", "OBV",
] as const;
type IndicatorType =
  | "SMA" | "EMA" | "HMA" | "RSI" | "ROC"
  | "MACD Line" | "MACD Signal" | "MACD Hist"
  | "BB Upper" | "BB Basis" | "BB Lower"
  | "ATR" | "Stoch %K" | "Stoch %D" | "OBV";

// Default periods per indicator type
const INDICATOR_DEFAULTS: Partial<Record<IndicatorType, number>> = {
  SMA: 20, EMA: 20, HMA: 20, RSI: 14, ROC: 12,
  "MACD Line": 26, "MACD Signal": 26, "MACD Hist": 26,
  "BB Upper": 20, "BB Basis": 20, "BB Lower": 20,
  ATR: 14, "Stoch %K": 14, "Stoch %D": 14, OBV: 1,
};

// Source type for the left side of a condition
type SourceType = "metric" | "correlation" | "derived";

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "metric", label: "Single Metric" },
  { value: "correlation", label: "Correlation" },
  { value: "derived", label: "Pairs / Derived" },
];

const OPERATORS = [">", "<", ">=", "<=", "crosses_above", "crosses_below"] as const;
type Operator = typeof OPERATORS[number];

const OPERATOR_LABELS: Record<Operator, string> = {
  ">": ">",
  "<": "<",
  ">=": "≥",
  "<=": "≤",
  crosses_above: "crosses ↑",
  crosses_below: "crosses ↓",
};

const LOOKBACK_OPTIONS = [
  { label: "1M", value: 21 },
  { label: "3M", value: 63 },
  { label: "6M", value: 126 },
  { label: "1Y", value: 252 },
  { label: "2Y", value: 504 },
  { label: "5Y", value: 1260 },
];

// Lookback presets for the historical screener
const LOOKBACK_PRESETS = [
  { label: "1M", days: 21 },
  { label: "3M", days: 63 },
  { label: "6M", days: 126 },
  { label: "1Y", days: 252 },
  { label: "2Y", days: 504 },
  { label: "5Y", days: 1260 },
  { label: "Max", days: 99999 },
];

type RightType = "value" | "metric" | "percentile";

interface IndicatorConfig {
  type: IndicatorType;
  period: number;
}

type LookbackMode = "now" | "preset" | "custom";

interface ScreenerCondition {
  id: string;
  // ── Source (left side) ──
  sourceType?: SourceType;             // "metric" (default) | "correlation" | "derived"
  leftMetric: string;
  leftIndicator?: IndicatorConfig;
  // For correlation / derived sources:
  sourceTicker2?: string;              // second ticker
  sourceMetric2?: string;              // metric for second ticker
  derivedType?: DerivedType;           // which derived computation (ratio, zscore, etc.)
  derivedWindow?: number;              // rolling window for corr / z-score etc.
  // ── Operator ──
  operator: Operator;
  // ── Right side ──
  rightType: RightType;
  rightValue?: number;
  rightMetric?: string;
  rightIndicator?: IndicatorConfig;
  rightPercentile?: number;
  lookbackDays?: number;
  // Lookback fields
  lookbackMode?: LookbackMode;       // "now" = latest only (default), "preset" = use presetDays, "custom" = date range
  lookbackPresetDays?: number;        // for preset mode (e.g. 252 = 1Y)
  lookbackStartDate?: string;         // ISO date string for custom mode
  lookbackEndDate?: string;           // ISO date string for custom mode
}

interface ScreenerResult {
  ticker: string;
  name: string;
  sector: string;
  subsector: string;
  values: Record<string, number | null>; // keyed by condition id → left value (latest or value at match date)
  matchDates: Record<string, string | null>; // keyed by condition id → date when condition was true (lookback mode)
}

function newCondition(): ScreenerCondition {
  return {
    id: Math.random().toString(36).slice(2),
    leftMetric: DEFAULT_METRIC,
    operator: "<",
    rightType: "value",
    rightValue: 15,
    lookbackDays: 252,
  };
}

// ─────────────────────────────────────────────
// Screener Templates
// ─────────────────────────────────────────────
interface ScreenerTemplate {
  name: string;
  description: string;
  conditions: Omit<ScreenerCondition, "id">[];
}

const SCREENER_TEMPLATES: ScreenerTemplate[] = [
  {
    name: "Cheap P/FFO",
    description: "P/FFO FY2 < 15x",
    conditions: [
      { leftMetric: "P/FFO FY2", operator: "<", rightType: "value", rightValue: 15, lookbackDays: 252 },
    ],
  },
  {
    name: "Value + Yield",
    description: "P/FFO FY2 < 14x AND Div Yield > 4%",
    conditions: [
      { leftMetric: "P/FFO FY2", operator: "<", rightType: "value", rightValue: 14, lookbackDays: 252 },
      { leftMetric: "Dividend Yield", operator: ">", rightType: "value", rightValue: 4, lookbackDays: 252 },
    ],
  },
  {
    name: "High Yield",
    description: "Dividend Yield > 5%",
    conditions: [
      { leftMetric: "Dividend Yield", operator: ">", rightType: "value", rightValue: 5, lookbackDays: 252 },
    ],
  },
  {
    name: "Growth at Reasonable Price",
    description: "FY2 FFO Growth > 5% AND P/FFO FY2 < 18x",
    conditions: [
      { leftMetric: "FY2 FFO Growth", operator: ">", rightType: "value", rightValue: 5, lookbackDays: 252 },
      { leftMetric: "P/FFO FY2", operator: "<", rightType: "value", rightValue: 18, lookbackDays: 252 },
    ],
  },
  {
    name: "Momentum",
    description: "3M Price Chg > 10% AND 1M Price Chg > 0%",
    conditions: [
      { leftMetric: "3M Price Chg%", operator: ">", rightType: "value", rightValue: 10, lookbackDays: 252 },
      { leftMetric: "1M Price Chg%", operator: ">", rightType: "value", rightValue: 0, lookbackDays: 252 },
    ],
  },
  {
    name: "Beaten Down",
    description: "% off 52wk High < -25%",
    conditions: [
      { leftMetric: "% off 52wk High", operator: "<", rightType: "value", rightValue: -25, lookbackDays: 252 },
    ],
  },
  {
    name: "Historical Cheap",
    description: "P/FFO FY2 below 20th percentile (1Y)",
    conditions: [
      { leftMetric: "P/FFO FY2", operator: "<", rightType: "percentile", rightPercentile: 20, lookbackDays: 252 },
    ],
  },
  {
    name: "Short Squeeze Candidates",
    description: "Short Interest > 10% AND 1M Price Chg > 5%",
    conditions: [
      { leftMetric: "Short Interest%", operator: ">", rightType: "value", rightValue: 10, lookbackDays: 252 },
      { leftMetric: "1M Price Chg%", operator: ">", rightType: "value", rightValue: 5, lookbackDays: 252 },
    ],
  },
  {
    name: "AFFO Yield > FFO Yield",
    description: "AFFO Yield FY2 > FFO Yield FY2 (capital-light)",
    conditions: [
      { leftMetric: "AFFO Yield FY2", operator: ">", rightType: "metric", rightMetric: "FFO Yield FY2", lookbackDays: 252 },
    ],
  },
  {
    name: "RSI Oversold",
    description: "RSI(14) of close < 30",
    conditions: [
      { leftMetric: "close", leftIndicator: { type: "RSI" as IndicatorType, period: 14 }, operator: "<", rightType: "value", rightValue: 30, lookbackDays: 252 },
    ],
  },
];

// ─────────────────────────────────────────────
// Indicator computation helper (all ChartPane indicators)
// ─────────────────────────────────────────────
function applyIndicator(series: DataPoint[], ind?: IndicatorConfig): DataPoint[] {
  if (!ind) return series;
  switch (ind.type) {
    case "SMA": return computeSMA(series, ind.period);
    case "EMA": return computeEMA(series, ind.period);
    case "HMA": return computeHMA(series, ind.period);
    case "RSI": return computeRSI(series, ind.period);
    case "ROC": return computeROC(series, ind.period);
    case "MACD Line": { const m = computeMACD(series, 12, 26, 9); return m.macdLine; }
    case "MACD Signal": { const m = computeMACD(series, 12, 26, 9); return m.signalLine; }
    case "MACD Hist": { const m = computeMACD(series, 12, 26, 9); return m.histogram; }
    case "BB Upper": { const b = computeBollingerBands(series, ind.period, 2); return b.upper; }
    case "BB Basis": { const b = computeBollingerBands(series, ind.period, 2); return b.basis; }
    case "BB Lower": { const b = computeBollingerBands(series, ind.period, 2); return b.lower; }
    case "ATR": return computeATR(series, ind.period);
    case "Stoch %K": { const s = computeStochastic(series, ind.period, 3); return s.k; }
    case "Stoch %D": { const s = computeStochastic(series, ind.period, 3); return s.d; }
    case "OBV": return computeOBV(series);
    default: return series;
  }
}

// ─────────────────────────────────────────────
// Resolve the "source" series for a condition+ticker
// Returns a DataPoint[] for the left side before indicator application
// ─────────────────────────────────────────────
async function resolveSourceSeries(
  symbol: string,
  cond: ScreenerCondition,
): Promise<DataPoint[]> {
  const srcType = cond.sourceType ?? "metric";

  if (srcType === "metric") {
    return (await getMetricSeries(symbol, cond.leftMetric)) as DataPoint[];
  }

  // For correlation / derived, we need both tickers' data
  const ticker2 = cond.sourceTicker2;
  const metric2 = cond.sourceMetric2 ?? "close";
  if (!ticker2) return [];

  const [seriesA, seriesB] = await Promise.all([
    getMetricSeries(symbol, cond.leftMetric),
    getMetricSeries(ticker2, metric2),
  ]);
  if (seriesA.length === 0 || seriesB.length === 0) return [];

  const aligned = alignSeries(
    seriesA as TV[],
    seriesB as TV[],
  );
  if (aligned.length === 0) return [];

  const win = cond.derivedWindow ?? 60;

  if (srcType === "correlation") {
    return computeDerived("correlation", aligned, win) as DataPoint[];
  }

  // "derived" — use the specified derived type
  const dtype = cond.derivedType ?? "ratio";
  return computeDerived(dtype, aligned, win) as DataPoint[];
}

// ─────────────────────────────────────────────
// Percentile helper — rank of `value` in `arr` (0–100)
// ─────────────────────────────────────────────
function percentileRank(value: number, arr: number[]): number {
  if (arr.length === 0) return 50;
  const below = arr.filter((v) => v < value).length;
  return (below / arr.length) * 100;
}

// ─────────────────────────────────────────────
// Point-in-time comparison helper
// ─────────────────────────────────────────────
function compareOp(left: number, op: Operator, right: number, prevLeft?: number | null, prevRight?: number | null): boolean {
  switch (op) {
    case ">":  return left > right;
    case "<":  return left < right;
    case ">=": return left >= right;
    case "<=": return left <= right;
    case "crosses_above":
      return prevLeft !== null && prevLeft !== undefined &&
             prevRight !== null && prevRight !== undefined &&
             prevLeft <= prevRight && left > right;
    case "crosses_below":
      return prevLeft !== null && prevLeft !== undefined &&
             prevRight !== null && prevRight !== undefined &&
             prevLeft >= prevRight && left < right;
  }
  return false;
}

// ─────────────────────────────────────────────
// Compute the lookback window (start index) for a series
// Returns { startIdx, endIdx } for the portion of the series to scan
// ─────────────────────────────────────────────
function getLookbackRange(
  series: DataPoint[],
  cond: ScreenerCondition
): { startIdx: number; endIdx: number } | null {
  if (series.length === 0) return null;
  const endIdx = series.length - 1;

  const mode = cond.lookbackMode ?? "now";
  if (mode === "now") {
    return { startIdx: endIdx, endIdx };
  }

  if (mode === "preset") {
    const days = cond.lookbackPresetDays ?? 21;
    const startIdx = Math.max(0, series.length - days);
    return { startIdx, endIdx };
  }

  if (mode === "custom") {
    const startDate = cond.lookbackStartDate;
    const endDate = cond.lookbackEndDate;
    let si = 0;
    let ei = series.length - 1;
    if (startDate) {
      const sd = startDate.replace(/-/g, "");
      si = series.findIndex((p) => {
        const d = typeof p.time === "string" ? p.time.replace(/-/g, "") : String(p.time);
        return d >= sd;
      });
      if (si === -1) return null; // all data before start date
    }
    if (endDate) {
      const ed = endDate.replace(/-/g, "");
      // Find last index <= endDate
      for (let i = series.length - 1; i >= si; i--) {
        const d = typeof series[i].time === "string" ? (series[i].time as string).replace(/-/g, "") : String(series[i].time);
        if (d <= ed) { ei = i; break; }
      }
    }
    return { startIdx: si, endIdx: ei };
  }

  return { startIdx: endIdx, endIdx };
}

// ─────────────────────────────────────────────
// Evaluate a single condition for one ticker
// Returns { leftVal, pass, matchDate } or null if data unavailable
// matchDate = the date when condition was true (for lookback modes)
// ─────────────────────────────────────────────
async function evaluateCondition(
  symbol: string,
  cond: ScreenerCondition
): Promise<{ leftVal: number | null; pass: boolean; matchDate: string | null }> {
  // Resolve source series (single metric, correlation, or derived pair)
  const leftRaw = await resolveSourceSeries(symbol, cond);
  if (leftRaw.length === 0) return { leftVal: null, pass: false, matchDate: null };

  // Apply indicator on top of the source series
  const leftSeries = applyIndicator(leftRaw as DataPoint[], cond.leftIndicator);
  if (leftSeries.length === 0) return { leftVal: null, pass: false, matchDate: null };

  const isCross = cond.operator === "crosses_above" || cond.operator === "crosses_below";
  const mode = cond.lookbackMode ?? "now";

  // ── Resolve right side series (if needed) ──
  let rightSeries: DataPoint[] | null = null;
  if (cond.rightType === "metric") {
    const rightMetric = cond.rightMetric ?? DEFAULT_METRIC;
    const rightRaw = await getMetricSeries(symbol, rightMetric);
    if (rightRaw.length === 0) return { leftVal: leftSeries[leftSeries.length - 1].value, pass: false, matchDate: null };
    rightSeries = applyIndicator(rightRaw as DataPoint[], cond.rightIndicator);
    if (rightSeries.length === 0) return { leftVal: leftSeries[leftSeries.length - 1].value, pass: false, matchDate: null };
  }

  // ── "Now" mode — evaluate latest point only (original behavior) ──
  if (mode === "now") {
    const leftLast = leftSeries[leftSeries.length - 1].value;
    const leftPrev = isCross && leftSeries.length >= 2 ? leftSeries[leftSeries.length - 2].value : null;
    let rightLast: number | null = null;
    let rightPrev: number | null = null;

    if (cond.rightType === "value") {
      rightLast = cond.rightValue ?? 0;
      rightPrev = rightLast;
    } else if (cond.rightType === "metric" && rightSeries) {
      rightLast = rightSeries[rightSeries.length - 1].value;
      rightPrev = isCross && rightSeries.length >= 2 ? rightSeries[rightSeries.length - 2].value : rightLast;
    } else if (cond.rightType === "percentile") {
      const pct = cond.rightPercentile ?? 50;
      const lookback = cond.lookbackDays ?? 252;
      const window = leftSeries.slice(-lookback).map((d) => d.value).filter((v) => Number.isFinite(v));
      if (window.length === 0) return { leftVal: leftLast, pass: false, matchDate: null };
      window.sort((a, b) => a - b);
      const idx = Math.max(0, Math.min(window.length - 1, Math.round((pct / 100) * (window.length - 1))));
      rightLast = window[idx];
      rightPrev = rightLast;
    }

    if (rightLast === null) return { leftVal: leftLast, pass: false, matchDate: null };
    const pass = compareOp(leftLast, cond.operator, rightLast, leftPrev, rightPrev);
    return { leftVal: leftLast, pass, matchDate: null };
  }

  // ── Lookback mode — scan historical window, pass if true at ANY point ──
  const range = getLookbackRange(leftSeries, cond);
  if (!range) return { leftVal: null, pass: false, matchDate: null };

  const { startIdx, endIdx } = range;
  const latestLeft = leftSeries[leftSeries.length - 1].value;

  // Build a date→index map for right series alignment
  let rightMap: Map<string, number> | null = null;
  if (rightSeries) {
    rightMap = new Map();
    rightSeries.forEach((p, i) => {
      const d = typeof p.time === "string" ? p.time : String(p.time);
      rightMap!.set(d, i);
    });
  }

  // For percentile mode in lookback, we compute the percentile threshold once
  // based on the full lookback window of the raw left series
  let percentileThreshold: number | null = null;
  if (cond.rightType === "percentile") {
    const pct = cond.rightPercentile ?? 50;
    const lookback = cond.lookbackDays ?? 252;
    const window = leftSeries.slice(-lookback).map((d) => d.value).filter((v) => Number.isFinite(v));
    if (window.length === 0) return { leftVal: latestLeft, pass: false, matchDate: null };
    window.sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(window.length - 1, Math.round((pct / 100) * (window.length - 1))));
    percentileThreshold = window[idx];
  }

  // Scan from most recent backward (so first match = most recent date)
  for (let i = endIdx; i >= startIdx; i--) {
    const leftVal = leftSeries[i].value;
    const leftDate = typeof leftSeries[i].time === "string" ? leftSeries[i].time as string : String(leftSeries[i].time);
    const prevLeftVal = i > 0 ? leftSeries[i - 1].value : null;

    let rightVal: number | null = null;
    let prevRightVal: number | null = null;

    if (cond.rightType === "value") {
      rightVal = cond.rightValue ?? 0;
      prevRightVal = rightVal;
    } else if (cond.rightType === "metric" && rightSeries && rightMap) {
      const rIdx = rightMap.get(leftDate);
      if (rIdx === undefined) continue; // no matching date
      rightVal = rightSeries[rIdx].value;
      prevRightVal = rIdx > 0 ? rightSeries[rIdx - 1].value : rightVal;
    } else if (cond.rightType === "percentile" && percentileThreshold !== null) {
      rightVal = percentileThreshold;
      prevRightVal = percentileThreshold;
    }

    if (rightVal === null) continue;

    const pass = compareOp(leftVal, cond.operator, rightVal, prevLeftVal, prevRightVal);
    if (pass) {
      return { leftVal: leftVal, pass: true, matchDate: leftDate };
    }
  }

  return { leftVal: latestLeft, pass: false, matchDate: null };
}

// ─────────────────────────────────────────────
// Human-readable condition label
// ─────────────────────────────────────────────
function conditionLabel(cond: ScreenerCondition): string {
  const srcType = cond.sourceType ?? "metric";
  let baseSource = cond.leftMetric;
  if (srcType === "correlation") {
    baseSource = `Corr(${cond.leftMetric} × ${cond.sourceTicker2 ?? "?"}:${cond.sourceMetric2 ?? "close"}, ${cond.derivedWindow ?? 60}d)`;
  } else if (srcType === "derived") {
    const dt = DERIVED_DEFS.find(d => d.type === cond.derivedType);
    baseSource = `${dt?.label ?? cond.derivedType ?? "ratio"}(${cond.leftMetric} × ${cond.sourceTicker2 ?? "?"}:${cond.sourceMetric2 ?? "close"})`;
  }
  const leftStr = cond.leftIndicator
    ? `${cond.leftIndicator.type}(${cond.leftIndicator.period}) of ${baseSource}`
    : baseSource;

  const opStr = OPERATOR_LABELS[cond.operator];

  let rightStr = "";
  if (cond.rightType === "value") {
    rightStr = String(cond.rightValue ?? "");
  } else if (cond.rightType === "metric") {
    const rm = cond.rightMetric ?? DEFAULT_METRIC;
    rightStr = cond.rightIndicator
      ? `${cond.rightIndicator.type}(${cond.rightIndicator.period}) of ${rm}`
      : rm;
  } else {
    const lb = LOOKBACK_OPTIONS.find((o) => o.value === (cond.lookbackDays ?? 252))?.label ?? "1Y";
    rightStr = `${cond.rightPercentile ?? 50}th pctile (${lb})`;
  }

  // Add lookback suffix
  const lbMode = cond.lookbackMode ?? "now";
  let lbStr = "";
  if (lbMode === "preset") {
    const preset = LOOKBACK_PRESETS.find((p) => p.days === (cond.lookbackPresetDays ?? 21));
    lbStr = ` (any in ${preset?.label ?? "1M"})`;
  } else if (lbMode === "custom") {
    const s = cond.lookbackStartDate ?? "...";
    const e = cond.lookbackEndDate ?? "...";
    lbStr = ` (any ${s} – ${e})`;
  }

  return `${leftStr} ${opStr} ${rightStr}${lbStr}`;
}

// ─────────────────────────────────────────────
// Format value for display
// ─────────────────────────────────────────────
function fmtValue(val: number | null, metric: string): string {
  if (val === null || isNaN(val)) return "—";
  const isPct = isPercentMetric(metric);
  const decimals = isPct ? 1 : Math.abs(val) < 10 ? 2 : 1;
  return val.toFixed(decimals) + (isPct ? "%" : "");
}

// ─────────────────────────────────────────────
// Sub-component: IndicatorPicker
// ─────────────────────────────────────────────
const INDICATOR_GROUPS: { label: string; types: (typeof INDICATOR_TYPES[number])[] }[] = [
  { label: "Moving Averages", types: ["SMA", "EMA", "HMA"] },
  { label: "Oscillators", types: ["RSI", "ROC", "Stoch %K", "Stoch %D"] },
  { label: "MACD", types: ["MACD Line", "MACD Signal", "MACD Hist"] },
  { label: "Bollinger", types: ["BB Upper", "BB Basis", "BB Lower"] },
  { label: "Other", types: ["ATR", "OBV"] },
];

function IndicatorPicker({
  value,
  onChange,
  compact = false,
}: {
  value?: IndicatorConfig;
  onChange: (v: IndicatorConfig | undefined) => void;
  compact?: boolean;
}) {
  const selected = value?.type ?? "None";
  const period = value?.period ?? 20;
  // OBV has no meaningful period param
  const showPeriod = value && value.type !== "OBV";

  return (
    <div className="flex items-center gap-1">
      <Select
        value={selected}
        onValueChange={(v) => {
          if (v === "None") {
            onChange(undefined);
          } else {
            const t = v as IndicatorType;
            onChange({ type: t, period: value?.period ?? INDICATOR_DEFAULTS[t] ?? 20 });
          }
        }}
      >
        <SelectTrigger
          className="h-7 text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0"
          style={{ width: compact ? 80 : 100 }}
          data-testid="select-indicator-type"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="text-xs max-h-72">
          <SelectItem value="None" className="text-xs py-1">None</SelectItem>
          {INDICATOR_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {g.label}
              </div>
              {g.types.map((t) => (
                <SelectItem key={t} value={t} className="text-xs py-1 pl-4">
                  {t}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
      {showPeriod && (
        <Input
          type="number"
          min={1}
          max={500}
          value={period}
          onChange={(e) => {
            const p = parseInt(e.target.value) || 1;
            onChange({ type: value.type, period: Math.max(1, p) });
          }}
          className="h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1"
          data-testid="input-indicator-period"
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-component: MetricSelect
// ─────────────────────────────────────────────
function MetricSelect({
  value,
  onChange,
  width = 150,
}: {
  value: string;
  onChange: (v: string) => void;
  width?: number;
}) {
  const customMetrics = getCustomFundamentalMetrics();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="h-7 text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0 truncate"
        style={{ width }}
        data-testid="select-metric"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="text-xs max-h-72">
        {Object.entries(METRIC_OPTIONS).map(([group, metrics]) => (
          <div key={group}>
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {group}
            </div>
            {metrics.map((m) => (
              <SelectItem key={m} value={m} className="text-xs py-1 pl-4">
                {m}
              </SelectItem>
            ))}
          </div>
        ))}
        {customMetrics.length > 0 && (
          <div>
            <div className="px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
              Uploaded Fundamental
            </div>
            {customMetrics.map((m) => (
              <SelectItem key={m} value={m} className="text-xs py-1 pl-4">
                {m}
              </SelectItem>
            ))}
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

// ─────────────────────────────────────────────
// Sub-component: TickerSelect (for second ticker in corr/derived)
// ─────────────────────────────────────────────
function TickerSelect({
  value,
  onChange,
  tickers,
  width = 100,
}: {
  value: string;
  onChange: (v: string) => void;
  tickers: TickerMeta[];
  width?: number;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="h-7 text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0 truncate font-mono"
        style={{ width }}
        data-testid="select-ticker2"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="text-xs max-h-72">
        {tickers.map((t) => (
          <SelectItem key={t.ticker} value={t.ticker} className="text-xs py-0.5">
            <span className="font-mono">{t.ticker}</span>
            <span className="ml-1 text-muted-foreground text-[10px]">{t.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─────────────────────────────────────────────
// Sub-component: DerivedTypeSelect
// ─────────────────────────────────────────────
const DERIVED_GROUPS_UI = ["Core", "Z-Score", "Stats"] as const;

function DerivedTypeSelect({
  value,
  onChange,
}: {
  value: DerivedType;
  onChange: (v: DerivedType) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DerivedType)}>
      <SelectTrigger
        className="h-7 text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0"
        style={{ width: 110 }}
        data-testid="select-derived-type"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="text-xs max-h-72">
        {DERIVED_GROUPS_UI.map((g) => (
          <div key={g}>
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {g}
            </div>
            {DERIVED_DEFS.filter((d) => d.group === g).map((d) => (
              <SelectItem key={d.type} value={d.type} className="text-xs py-1 pl-4" title={d.tip}>
                {d.label}
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─────────────────────────────────────────────
// Sub-component: ConditionRow
// ─────────────────────────────────────────────
function ConditionRow({
  condition,
  index,
  onChange,
  onRemove,
  tickers,
}: {
  condition: ScreenerCondition;
  index: number;
  onChange: (updated: ScreenerCondition) => void;
  onRemove: () => void;
  tickers: TickerMeta[];
}) {
  const c = condition;
  const srcType = c.sourceType ?? "metric";

  function patch(partial: Partial<ScreenerCondition>) {
    onChange({ ...c, ...partial });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 py-2 px-2 rounded border border-border/60 bg-muted/10">
      {/* AND badge (shown from 2nd condition onwards) */}
      {index > 0 && (
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-1 w-7">
          AND
        </span>
      )}
      {index === 0 && (
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-1 w-7">
          IF
        </span>
      )}

      {/* SOURCE TYPE TOGGLE */}
      <div className="flex rounded overflow-hidden border border-border/60 h-7">
        {SOURCE_TYPES.map((st) => (
          <button
            key={st.value}
            onClick={() => {
              const p: Partial<ScreenerCondition> = { sourceType: st.value };
              // Set sensible defaults when switching source type
              if (st.value !== "metric" && !c.sourceTicker2 && tickers.length > 0) {
                p.sourceTicker2 = tickers[0]?.ticker ?? "";
                p.sourceMetric2 = "close";
                p.derivedWindow = 60;
              }
              if (st.value === "derived" && !c.derivedType) {
                p.derivedType = "ratio";
              }
              patch(p);
            }}
            className={`px-1.5 text-[10px] font-medium transition-colors ${
              srcType === st.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
            }`}
            data-testid={`btn-source-type-${st.value}`}
          >
            {st.label}
          </button>
        ))}
      </div>

      {/* LEFT SIDE — Metric 1 (always shown) */}
      <MetricSelect
        value={c.leftMetric}
        onChange={(v) => patch({ leftMetric: v })}
        width={148}
      />

      {/* Correlation / Derived: show Ticker 2 + Metric 2 + Window */}
      {srcType !== "metric" && (
        <>
          <span className="text-[10px] text-muted-foreground font-medium">×</span>
          <TickerSelect
            value={c.sourceTicker2 ?? (tickers[0]?.ticker ?? "")}
            onChange={(v) => patch({ sourceTicker2: v })}
            tickers={tickers}
            width={90}
          />
          <MetricSelect
            value={c.sourceMetric2 ?? "close"}
            onChange={(v) => patch({ sourceMetric2: v })}
            width={120}
          />
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground">win</span>
            <Input
              type="number"
              min={5}
              max={2000}
              value={c.derivedWindow ?? 60}
              onChange={(e) => patch({ derivedWindow: Math.max(5, parseInt(e.target.value) || 60) })}
              className="h-7 w-12 text-[11px] bg-muted/20 border-border text-center px-0.5"
              data-testid="input-derived-window"
            />
          </div>
        </>
      )}

      {/* Derived: show derived type selector */}
      {srcType === "derived" && (
        <DerivedTypeSelect
          value={c.derivedType ?? "ratio"}
          onChange={(v) => patch({ derivedType: v })}
        />
      )}

      {/* Indicator on top of source series */}
      <IndicatorPicker
        value={c.leftIndicator}
        onChange={(v) => patch({ leftIndicator: v })}
      />

      {/* OPERATOR */}
      <Select
        value={c.operator}
        onValueChange={(v) => patch({ operator: v as Operator })}
      >
        <SelectTrigger
          className="h-7 w-[100px] text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0"
          data-testid="select-operator"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="text-xs">
          {OPERATORS.map((op) => (
            <SelectItem key={op} value={op} className="text-xs py-1">
              {OPERATOR_LABELS[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* RIGHT SIDE TYPE TOGGLE */}
      <div className="flex rounded overflow-hidden border border-border/60 h-7">
        {(["value", "metric", "percentile"] as RightType[]).map((rt) => (
          <button
            key={rt}
            onClick={() => patch({ rightType: rt })}
            className={`px-2 text-[10px] font-medium transition-colors ${
              c.rightType === rt
                ? "bg-primary text-primary-foreground"
                : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
            }`}
            data-testid={`btn-right-type-${rt}`}
          >
            {rt === "value" ? "Value" : rt === "metric" ? "Metric" : "Pctile"}
          </button>
        ))}
      </div>

      {/* RIGHT SIDE INPUTS */}
      {c.rightType === "value" && (
        <Input
          type="number"
          value={c.rightValue ?? ""}
          onChange={(e) => patch({ rightValue: parseFloat(e.target.value) || 0 })}
          className="h-7 w-20 text-[11px] bg-muted/20 border-border text-center px-1"
          placeholder="value"
          data-testid="input-right-value"
        />
      )}

      {c.rightType === "metric" && (
        <>
          <MetricSelect
            value={c.rightMetric ?? DEFAULT_METRIC}
            onChange={(v) => patch({ rightMetric: v })}
            width={148}
          />
          <IndicatorPicker
            value={c.rightIndicator}
            onChange={(v) => patch({ rightIndicator: v })}
          />
        </>
      )}

      {c.rightType === "percentile" && (
        <>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={99}
              value={c.rightPercentile ?? 50}
              onChange={(e) => patch({ rightPercentile: Math.max(1, Math.min(99, parseInt(e.target.value) || 50)) })}
              className="h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1"
              data-testid="input-percentile"
            />
            <span className="text-[10px] text-muted-foreground">pctile</span>
          </div>
          <Select
            value={String(c.lookbackDays ?? 252)}
            onValueChange={(v) => patch({ lookbackDays: parseInt(v) })}
          >
            <SelectTrigger
              className="h-7 w-16 text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0"
              data-testid="select-lookback"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="text-xs">
              {LOOKBACK_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)} className="text-xs py-1">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {/* LOOKBACK CONTROLS */}
      <div className="flex items-center gap-1 ml-1 border-l border-border/40 pl-1.5">
        {/* Now / Lookback toggle */}
        <div className="flex rounded overflow-hidden border border-border/60 h-7">
          <button
            onClick={() => patch({ lookbackMode: "now" })}
            className={`px-1.5 text-[10px] font-medium transition-colors flex items-center gap-0.5 ${
              (c.lookbackMode ?? "now") === "now"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
            }`}
            data-testid="btn-lookback-now"
            title="Evaluate at latest data point only"
          >
            Now
          </button>
          <button
            onClick={() => patch({ lookbackMode: "preset", lookbackPresetDays: c.lookbackPresetDays ?? 21 })}
            className={`px-1.5 text-[10px] font-medium transition-colors flex items-center gap-0.5 ${
              (c.lookbackMode ?? "now") === "preset"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
            }`}
            data-testid="btn-lookback-preset"
            title="True at any point in preset window"
          >
            <Clock size={9} />
            Lookback
          </button>
          <button
            onClick={() => patch({ lookbackMode: "custom" })}
            className={`px-1.5 text-[10px] font-medium transition-colors flex items-center gap-0.5 ${
              (c.lookbackMode ?? "now") === "custom"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
            }`}
            data-testid="btn-lookback-custom"
            title="True at any point in custom date range"
          >
            <Calendar size={9} />
            Range
          </button>
        </div>

        {/* Preset pills */}
        {(c.lookbackMode ?? "now") === "preset" && (
          <div className="flex rounded overflow-hidden border border-border/60 h-7">
            {LOOKBACK_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => patch({ lookbackPresetDays: p.days })}
                className={`px-1.5 text-[10px] font-medium transition-colors ${
                  (c.lookbackPresetDays ?? 21) === p.days
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
                }`}
                data-testid={`btn-lb-preset-${p.label}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Custom date range */}
        {(c.lookbackMode ?? "now") === "custom" && (
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={c.lookbackStartDate ?? ""}
              onChange={(e) => patch({ lookbackStartDate: e.target.value })}
              className="h-7 w-[120px] text-[10px] bg-muted/20 border-border px-1"
              data-testid="input-lb-start-date"
            />
            <span className="text-[10px] text-muted-foreground">–</span>
            <Input
              type="date"
              value={c.lookbackEndDate ?? ""}
              onChange={(e) => patch({ lookbackEndDate: e.target.value })}
              className="h-7 w-[120px] text-[10px] bg-muted/20 border-border px-1"
              data-testid="input-lb-end-date"
            />
          </div>
        )}
      </div>

      {/* REMOVE */}
      <button
        onClick={onRemove}
        className="ml-auto h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
        data-testid="btn-remove-condition"
        aria-label="Remove condition"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sort state
// ─────────────────────────────────────────────
type SortKey = "ticker" | "name" | "sector" | string;
interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

// ─────────────────────────────────────────────
// Main Screener component
// ─────────────────────────────────────────────
export default function Screener() {
  const {
    universeTickers,
    isFiltered,
    filteredCount,
    totalCount,
    filters: universeFilters,
    setFilters: setUniverseFilters,
    search: universeSearch,
    setSearch: setUniverseSearch,
    manualTickers: universeManualTickers,
    setManualTickers: setUniverseManualTickers,
  } = useUniverse();
  const [showUniverseFilter, setShowUniverseFilter] = useState(true);

  const [conditions, setConditions] = useState<ScreenerCondition[]>([newCondition()]);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "ticker", dir: "asc" });

  // Pairs screening state
  const [screenMode, setScreenMode] = useState<"single" | "pairs">("single");
  const [pairsMetricA, setPairsMetricA] = useState("close");
  const [pairsMetricB, setPairsMetricB] = useState("close");
  const [pairsZWindow, setPairsZWindow] = useState(60);
  const [pairsBetaLookback, setPairsBetaLookback] = useState(52);
  const [pairsSpreadZWindow, setPairsSpreadZWindow] = useState(8);
  const [pairsOlsResidWindow, setPairsOlsResidWindow] = useState(52);
  const [pairsMinCorr, setPairsMinCorr] = useState(0.5);
  const [pairsMaxHalfLife, setPairsMaxHalfLife] = useState(500);
  const [pairsZFilter, setPairsZFilter] = useState<"all" | "extreme" | "mean_revert">("all");
  const [pairsResults, setPairsResults] = useState<any[]>([]);
  const [pairsHasRun, setPairsHasRun] = useState(false);
  const [pairsScanProgress, setPairsScanProgress] = useState<string | null>(null);
  const [pairsSort, setPairsSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "absRawZ", dir: "desc" });

  const abortRef = useRef(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const qc = useQueryClient();

  // ── Saved presets ──
  const { data: savedPresets = [] } = useQuery<ScreenerPreset[]>({
    queryKey: ["/api/screener-presets"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/screener-presets");
      return res.json();
    },
  });

  const savePresetMut = useMutation({
    mutationFn: async (payload: { label: string; conditions: ScreenerCondition[] }) => {
      const res = await apiRequest("POST", "/api/screener-presets", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/screener-presets"] });
      setSaveDialogOpen(false);
      setSaveName("");
    },
  });

  const deletePresetMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/screener-presets/${id}/delete`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/screener-presets"] });
    },
  });

  function handleSavePreset() {
    const name = saveName.trim();
    if (!name || conditions.length === 0) return;
    // Strip runtime id from conditions before saving — we'll regenerate on load
    const cleaned = conditions.map(({ id, ...rest }) => rest);
    savePresetMut.mutate({ label: name, conditions: cleaned as any });
  }

  function loadPreset(preset: ScreenerPreset) {
    try {
      const parsed = JSON.parse(preset.conditions);
      if (!Array.isArray(parsed)) return;
      const withIds = parsed.map((c: any) => ({ ...c, id: Math.random().toString(36).slice(2) }));
      setConditions(withIds);
      setResults([]);
      setHasRun(false);
    } catch { /* ignore bad JSON */ }
  }

  // ── Ticker list ──
  const { data: allTickers = [] } = useQuery<TickerMeta[]>({
    queryKey: ["/universe-tickers"],
    queryFn: getTickers,
  });

  const scopedTickers = useMemo(() => {
    if (!universeTickers) return allTickers;
    return allTickers.filter((t) => universeTickers.has(t.ticker));
  }, [allTickers, universeTickers]);

  // ── Workspace persistence ──
  const serialize = useCallback(() => ({
    conditions,
    results,
    hasRun,
    sort,
    screenMode,
    pairsMetricA,
    pairsMetricB,
    pairsZWindow,
    pairsBetaLookback,
    pairsSpreadZWindow,
    pairsOlsResidWindow,
    pairsMinCorr,
    pairsMaxHalfLife,
    pairsZFilter,
    pairsResults,
    pairsHasRun,
    pairsSort,
  }), [conditions, results, hasRun, sort, screenMode, pairsMetricA, pairsMetricB, pairsZWindow, pairsBetaLookback, pairsSpreadZWindow, pairsOlsResidWindow, pairsMinCorr, pairsMaxHalfLife, pairsZFilter, pairsResults, pairsHasRun, pairsSort]);

  const restore = useCallback((saved: any) => {
    if (!saved) return;
    const restoredConditions = Array.isArray(saved.conditions) ? saved.conditions : [];
    if (restoredConditions.length > 0) setConditions(restoredConditions);

    // Remap result values/matchDates if condition IDs in results don't match
    // restored condition IDs (can happen after code updates or preset loads)
    if (Array.isArray(saved.results) && restoredConditions.length > 0) {
      const condIds = restoredConditions.map((c: any) => c.id);
      const remapped = saved.results.map((r: any) => {
        if (!r.values) return r;
        // Check if any current condition ID already exists in values
        const hasMatch = condIds.some((id: string) => r.values[id] !== undefined);
        if (hasMatch) return r; // IDs already align

        // Positional remap: old IDs → new IDs by position
        const oldKeys = Object.keys(r.values);
        const newValues: Record<string, number | null> = {};
        const newMatchDates: Record<string, string | null> = {};
        for (let i = 0; i < Math.min(oldKeys.length, condIds.length); i++) {
          newValues[condIds[i]] = r.values[oldKeys[i]];
          if (r.matchDates) newMatchDates[condIds[i]] = r.matchDates[oldKeys[i]];
        }
        return { ...r, values: newValues, matchDates: newMatchDates };
      });
      setResults(remapped);
    } else if (Array.isArray(saved.results)) {
      setResults(saved.results);
    }

    if (typeof saved.hasRun === "boolean") setHasRun(saved.hasRun);
    if (saved.sort) setSort(saved.sort);
    if (saved.screenMode) setScreenMode(saved.screenMode);
    if (saved.pairsMetricA) setPairsMetricA(saved.pairsMetricA);
    if (saved.pairsMetricB) setPairsMetricB(saved.pairsMetricB);
    if (saved.pairsZWindow !== undefined) setPairsZWindow(saved.pairsZWindow);
    if (saved.pairsBetaLookback !== undefined) setPairsBetaLookback(saved.pairsBetaLookback);
    if (saved.pairsSpreadZWindow !== undefined) setPairsSpreadZWindow(saved.pairsSpreadZWindow);
    if (saved.pairsOlsResidWindow !== undefined) setPairsOlsResidWindow(saved.pairsOlsResidWindow);
    if (saved.pairsMinCorr !== undefined) setPairsMinCorr(saved.pairsMinCorr);
    if (saved.pairsMaxHalfLife !== undefined) setPairsMaxHalfLife(saved.pairsMaxHalfLife);
    if (saved.pairsZFilter) setPairsZFilter(saved.pairsZFilter);
    if (Array.isArray(saved.pairsResults)) setPairsResults(saved.pairsResults);
    if (typeof saved.pairsHasRun === "boolean") setPairsHasRun(saved.pairsHasRun);
    if (saved.pairsSort) setPairsSort(saved.pairsSort);
  }, []);

  useWorkspaceTab("screener", serialize, restore);

  // ── Add / update / remove conditions ──
  function addCondition() {
    setConditions((prev) => [...prev, newCondition()]);
  }

  function updateCondition(id: string, updated: ScreenerCondition) {
    setConditions((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }

  function removeCondition(id: string) {
    setConditions((prev) => {
      const next = prev.filter((c) => c.id !== id);
      return next.length === 0 ? [newCondition()] : next;
    });
  }

  // ── Run screen ──
  async function runScreen() {
    if (isScanning || conditions.length === 0) return;

    setIsScanning(true);
    setScanError(null);
    setResults([]);
    setHasRun(false);
    abortRef.current = false;

    const tickers = scopedTickers;
    const total = tickers.length;
    setScanProgress({ done: 0, total });

    const matchedResults: ScreenerResult[] = [];
    const BATCH = 20;

    try {
      for (let b = 0; b < tickers.length; b += BATCH) {
        if (abortRef.current) break;
        const batch = tickers.slice(b, b + BATCH);

        const batchResults = await Promise.all(
          batch.map(async (ticker) => {
            const evalResults = await Promise.all(
              conditions.map((cond) => evaluateCondition(ticker.ticker, cond))
            );

            // All conditions must pass (AND logic)
            const allPass = evalResults.every((r) => r.pass);

            // Build value map keyed by condition id
            const values: Record<string, number | null> = {};
            const matchDates: Record<string, string | null> = {};
            conditions.forEach((cond, i) => {
              values[cond.id] = evalResults[i].leftVal;
              matchDates[cond.id] = evalResults[i].matchDate;
            });

            return { ticker, allPass, values, matchDates };
          })
        );

        for (const r of batchResults) {
          if (r.allPass) {
            matchedResults.push({
              ticker: r.ticker.ticker,
              name: r.ticker.name,
              sector: r.ticker.sector,
              subsector: r.ticker.subsector,
              values: r.values,
              matchDates: r.matchDates,
            });
          }
        }

        setScanProgress({ done: Math.min(b + BATCH, total), total });
      }

      setResults(matchedResults);
      setHasRun(true);
    } catch (err: any) {
      setScanError(err?.message ?? "Scan failed");
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  }

  function cancelScan() {
    abortRef.current = true;
  }

  // ── Load template ──
  function loadTemplate(tpl: ScreenerTemplate) {
    const newConds = tpl.conditions.map((c) => ({
      ...c,
      id: Math.random().toString(36).slice(2),
    })) as ScreenerCondition[];
    setConditions(newConds);
    setResults([]);
    setHasRun(false);
  }

  // ── Run pairs screen ──
  async function runPairsScreen() {
    if (isScanning) return;
    setIsScanning(true);
    setPairsResults([]);
    setPairsHasRun(false);
    setScanError(null);
    setPairsScanProgress("Computing pairs...");

    try {
      const tickerList = scopedTickers.map(t => t.ticker);
      const totalPairs = (tickerList.length * (tickerList.length - 1)) / 2;
      setPairsScanProgress(`Analyzing ${totalPairs} pairs across ${tickerList.length} tickers...`);

      const resp = await apiRequest("POST", "/api/pairs-screen", {
        tickers: tickerList,
        metricA: pairsMetricA,
        metricB: pairsMetricB,
        zWindow: pairsZWindow,
        betaLookback: pairsBetaLookback,
        spreadZWindow: pairsSpreadZWindow,
        olsResidWindow: pairsOlsResidWindow,
      });
      const data = await resp.json();

      // Apply filters
      let filtered = data.results || [];
      if (pairsMinCorr > 0) {
        filtered = filtered.filter((r: any) => Math.abs(r.correlation) >= pairsMinCorr);
      }
      if (pairsMaxHalfLife < 9999) {
        filtered = filtered.filter((r: any) => r.halfLife !== null && r.halfLife <= pairsMaxHalfLife);
      }
      if (pairsZFilter === "extreme") {
        filtered = filtered.filter((r: any) => Math.abs(r.rawZ) >= 1.5);
      } else if (pairsZFilter === "mean_revert") {
        filtered = filtered.filter((r: any) => Math.abs(r.rawZ) >= 1.5 && r.halfLife !== null && r.halfLife <= 300);
      }

      setPairsResults(filtered);
      setPairsHasRun(true);
    } catch (err: any) {
      setScanError(err?.message ?? "Pairs scan failed");
    } finally {
      setIsScanning(false);
      setPairsScanProgress(null);
    }
  }

  // ── Pairs sorting ──
  const sortedPairsResults = useMemo(() => {
    const arr = [...pairsResults];
    arr.sort((a, b) => {
      let av: number, bv: number;
      const key = pairsSort.key;
      if (key === "absRawZ") {
        av = Math.abs(a.rawZ ?? 0); bv = Math.abs(b.rawZ ?? 0);
      } else if (key === "pair") {
        const cmp = a.tickerA.localeCompare(b.tickerA) || a.tickerB.localeCompare(b.tickerB);
        return pairsSort.dir === "asc" ? cmp : -cmp;
      } else {
        // Generic numeric sort for all other keys
        av = a[key] ?? (pairsSort.dir === "asc" ? 9999 : -9999);
        bv = b[key] ?? (pairsSort.dir === "asc" ? 9999 : -9999);
      }
      const cmp = av - bv;
      return pairsSort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [pairsResults, pairsSort]);

  function togglePairsSort(key: string) {
    setPairsSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "halfLife" ? "asc" : "desc" }
    );
  }

  // ── Export pairs CSV ──
  function exportPairsCSV() {
    if (sortedPairsResults.length === 0) return;
    const header = "Ticker A,Ticker B,Ratio,Log Ratio,Raw Z,Spread Z,OLS Resid Z,Correlation,Rolling Beta,Rolling R2,Beta-Adj Spread,Half-Life,Data Points";
    const f = (v: any) => v !== null && v !== undefined ? v : "N/A";
    const lines = sortedPairsResults.map(r =>
      `${r.tickerA},${r.tickerB},${f(r.ratio)},${f(r.logRatio)},${f(r.rawZ)},${f(r.spreadZ)},${f(r.olsResidZ)},${f(r.correlation)},${f(r.rollingBeta)},${f(r.rollingR2)},${f(r.betaAdjSpread)},${f(r.halfLife)},${f(r.dataPoints)}`
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pairs_screen_${pairsMetricA}_${pairsMetricB}_z${pairsZWindow}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Sorting ──
  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  const sortedResults = useMemo(() => {
    const arr = [...results];
    arr.sort((a, b) => {
      let av: any;
      let bv: any;

      if (sort.key === "ticker") { av = a.ticker; bv = b.ticker; }
      else if (sort.key === "name") { av = a.name; bv = b.name; }
      else if (sort.key === "sector") { av = a.sector; bv = b.sector; }
      else {
        // condition id → numeric value
        av = a.values[sort.key] ?? -Infinity;
        bv = b.values[sort.key] ?? -Infinity;
      }

      if (av === bv) return 0;
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [results, sort]);

  // ── Sort icon ──
  function SortIcon({ colKey }: { colKey: SortKey }) {
    if (sort.key !== colKey)
      return <ArrowUpDown size={10} className="ml-0.5 text-muted-foreground/50 inline" />;
    return sort.dir === "asc"
      ? <ArrowUp size={10} className="ml-0.5 text-primary inline" />
      : <ArrowDown size={10} className="ml-0.5 text-primary inline" />;
  }

  // ── Universe badge ──
  const universeLabel = isFiltered
    ? `${filteredCount} / ${totalCount} tickers`
    : `${totalCount} tickers`;

  // ── Column header helper ──
  function ColHeader({ label, sortKey }: { label: string; sortKey: SortKey }) {
    return (
      <th
        className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
        onClick={() => toggleSort(sortKey)}
        data-testid={`th-${sortKey}`}
      >
        {label}
        <SortIcon colKey={sortKey} />
      </th>
    );
  }

  // ── Pairs sort icon ──
  function PairsSortIcon({ colKey }: { colKey: string }) {
    if (pairsSort.key !== colKey)
      return <ArrowUpDown size={10} className="ml-0.5 text-muted-foreground/50 inline" />;
    return pairsSort.dir === "asc"
      ? <ArrowUp size={10} className="ml-0.5 text-primary inline" />
      : <ArrowDown size={10} className="ml-0.5 text-primary inline" />;
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background text-foreground">
      {/* ── Header bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Filter size={14} className="text-muted-foreground" />
        <span className="text-sm font-semibold">Screener</span>

        {/* Mode toggle: Single / Pairs */}
        <div className="flex rounded overflow-hidden border border-border/60 h-7 ml-2">
          <button
            onClick={() => setScreenMode("single")}
            className={`px-2.5 text-[10px] font-medium transition-colors flex items-center gap-1 ${
              screenMode === "single"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
            }`}
            data-testid="btn-mode-single"
          >
            <Filter size={10} />
            Single
          </button>
          <button
            onClick={() => setScreenMode("pairs")}
            className={`px-2.5 text-[10px] font-medium transition-colors flex items-center gap-1 ${
              screenMode === "pairs"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
            }`}
            data-testid="btn-mode-pairs"
          >
            <ArrowRightLeft size={10} />
            Pairs
          </button>
        </div>

        {/* Load screens dropdown (single mode only) */}
        {screenMode === "single" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 gap-1"
                data-testid="btn-templates"
              >
                <FolderOpen size={12} />
                Load
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              {/* Saved presets */}
              {savedPresets.length > 0 && (
                <>
                  <div className="p-2 border-b border-border">
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">Saved Screens</span>
                  </div>
                  <div className="max-h-48 overflow-auto">
                    {savedPresets.map((preset) => {
                      let condCount = 0;
                      try { condCount = JSON.parse(preset.conditions).length; } catch {}
                      return (
                        <div
                          key={preset.id}
                          className="flex items-center gap-1 px-3 py-2 hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0 group"
                        >
                          <button
                            onClick={() => loadPreset(preset)}
                            className="flex-1 text-left min-w-0"
                            data-testid={`btn-preset-${preset.id}`}
                          >
                            <div className="text-xs font-medium text-foreground truncate">{preset.label}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {condCount} condition{condCount !== 1 ? "s" : ""}
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePresetMut.mutate(preset.id);
                            }}
                            className="shrink-0 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
                            data-testid={`btn-delete-preset-${preset.id}`}
                            title="Delete saved screen"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {/* Built-in templates */}
              <div className="p-2 border-b border-border">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Built-in Templates</span>
              </div>
              <div className="max-h-48 overflow-auto">
                {SCREENER_TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => loadTemplate(tpl)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0"
                    data-testid={`btn-template-${i}`}
                  >
                    <div className="text-xs font-medium text-foreground">{tpl.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{tpl.description}</div>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Save current screen (single mode only) */}
        {screenMode === "single" && (
          <Popover open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 gap-1"
                disabled={conditions.length === 0}
                data-testid="btn-save-screen"
              >
                <Save size={12} />
                Save
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Save Current Screen</div>
              <div className="flex gap-1.5">
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Screen name…"
                  className="h-7 text-xs flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); }}
                  autoFocus
                  data-testid="input-save-name"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs px-3"
                  disabled={!saveName.trim() || savePresetMut.isPending}
                  onClick={handleSavePreset}
                  data-testid="btn-confirm-save"
                >
                  {savePresetMut.isPending ? "…" : "Save"}
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1.5">
                Saves {conditions.length} condition{conditions.length !== 1 ? "s" : ""}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <div className="flex-1" />

        {/* Universe filter toggle */}
        <button
          onClick={() => setShowUniverseFilter(!showUniverseFilter)}
          className={`flex items-center gap-1 text-[10px] h-5 px-1.5 rounded border transition-colors ${
            isFiltered
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          data-testid="btn-toggle-universe"
        >
          <Globe size={9} />
          {universeLabel}
          <ChevronDownIcon size={9} className={`transition-transform ${showUniverseFilter ? "rotate-180" : ""}`} />
        </button>

        {/* Run / Cancel */}
        {isScanning ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-3"
            onClick={cancelScan}
            data-testid="btn-cancel"
          >
            <X size={12} className="mr-1" />
            Cancel
          </Button>
        ) : screenMode === "single" ? (
          <Button
            size="sm"
            className="h-7 text-xs px-3 gap-1"
            onClick={runScreen}
            disabled={conditions.length === 0}
            data-testid="btn-run-screen"
          >
            <Play size={12} />
            Run Screen
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 text-xs px-3 gap-1"
            onClick={runPairsScreen}
            data-testid="btn-run-pairs-screen"
          >
            <Play size={12} />
            Run Pairs Screen
          </Button>
        )}
      </div>

      {/* ═══════════════ UNIVERSE FILTER BAR ═══════════════ */}
      {showUniverseFilter && (
        <div className="px-3 py-1.5 border-b border-border shrink-0 bg-muted/10">
          <ClassificationFilters
            filters={universeFilters}
            onFiltersChange={setUniverseFilters}
            search={universeSearch}
            onSearchChange={setUniverseSearch}
            manualTickers={universeManualTickers}
            onManualTickersChange={setUniverseManualTickers}
            filteredCount={filteredCount}
            totalCount={totalCount}
            testIdPrefix="screener-universe"
          />
        </div>
      )}

      {/* ═══════════════ SINGLE MODE ═══════════════ */}
      {screenMode === "single" && (
        <>
          {/* ── Condition Builder ── */}
          <div className="px-3 pt-2 pb-2 border-b border-border shrink-0 bg-muted/5">
            <div className="flex flex-col gap-1.5">
              {conditions.map((cond, i) => (
                <ConditionRow
                  key={cond.id}
                  condition={cond}
                  index={i}
                  onChange={(updated) => updateCondition(cond.id, updated)}
                  onRemove={() => removeCondition(cond.id)}
                  tickers={allTickers}
                />
              ))}
            </div>

            {/* Add condition */}
            <button
              onClick={addCondition}
              className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              data-testid="btn-add-condition"
            >
              <Plus size={12} />
              Add condition
            </button>
          </div>

          {/* ── Active condition summary ── */}
          {conditions.length > 0 && (
            <div className="px-3 py-1.5 border-b border-border/40 flex flex-wrap gap-1.5 items-center shrink-0">
              <span className="text-[10px] text-muted-foreground mr-0.5">Screening for:</span>
              {conditions.map((c) => (
                <Badge
                  key={c.id}
                  variant="secondary"
                  className="text-[10px] h-5 px-1.5 font-normal max-w-xs truncate"
                  title={conditionLabel(c)}
                >
                  {conditionLabel(c)}
                </Badge>
              ))}
            </div>
          )}

          {/* ── Scan progress ── */}
          {isScanning && scanProgress && (
            <div className="px-3 py-2 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${(scanProgress.done / scanProgress.total) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  Scanning {scanProgress.done} of {scanProgress.total} tickers…
                </span>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {scanError && screenMode === "single" && (
            <div className="px-3 py-2 border-b border-destructive/30 flex items-center gap-2 text-xs text-destructive shrink-0">
              <AlertCircle size={13} />
              {scanError}
            </div>
          )}

          {/* ── Single Results ── */}
          <div className="flex-1 overflow-auto min-h-0">
            {!hasRun && !isScanning && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center">
                  <Search size={18} className="text-muted-foreground/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground/70">Define conditions and run the screen</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    All conditions are AND-ed. Use Lookback to find tickers where a condition was true at any point in a time window.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1 text-xs mt-1"
                  onClick={runScreen}
                  data-testid="btn-run-empty-state"
                >
                  <Play size={12} />
                  Run Screen
                </Button>
              </div>
            )}

            {hasRun && !isScanning && (
              <div className="flex flex-col h-full min-h-0">
                {/* Results header */}
                <div className="px-3 py-1.5 border-b border-border/40 flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-semibold text-foreground" data-testid="text-match-count">
                    {results.length} of {scopedTickers.length} tickers match
                  </span>
                  {results.length > 0 && (
                    <ChevronRight size={12} className="text-muted-foreground" />
                  )}
                  {results.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">— no tickers pass all conditions</span>
                  )}
                </div>

                {results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground">
                    <AlertCircle size={18} className="text-muted-foreground/50" />
                    <p className="text-xs">No tickers matched all conditions. Try relaxing your criteria.</p>
                  </div>
                ) : (
                  <div className="overflow-auto flex-1 min-h-0">
                    <table className="w-full text-xs border-separate border-spacing-0">
                      <thead className="sticky top-0 z-10 bg-background">
                        <tr className="border-b border-border">
                          <ColHeader label="Ticker" sortKey="ticker" />
                          <ColHeader label="Name" sortKey="name" />
                          <ColHeader label="Sector" sortKey="sector" />
                          {conditions.map((cond) => {
                            const hasLookback = (cond.lookbackMode ?? "now") !== "now";
                            return [
                              <th
                                key={cond.id}
                                className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                                onClick={() => toggleSort(cond.id)}
                                data-testid={`th-cond-${cond.id}`}
                                title={conditionLabel(cond)}
                              >
                                <span className="truncate block max-w-[120px] text-right ml-auto">
                                  {cond.leftIndicator
                                    ? `${cond.leftIndicator.type}(${cond.leftIndicator.period})`
                                    : cond.leftMetric}
                                </span>
                                <SortIcon colKey={cond.id} />
                              </th>,
                              hasLookback && (
                                <th
                                  key={`${cond.id}-date`}
                                  className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                                  title="Most recent date when condition was true"
                                >
                                  Match Date
                                </th>
                              ),
                            ];
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedResults.map((row, i) => (
                          <tr
                            key={row.ticker}
                            className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${
                              i % 2 === 0 ? "" : "bg-muted/5"
                            }`}
                            data-testid={`row-ticker-${row.ticker}`}
                          >
                            {/* Ticker */}
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <Link href="/">
                                <span
                                  className="font-mono font-semibold text-primary hover:underline cursor-pointer"
                                  data-testid={`link-ticker-${row.ticker}`}
                                >
                                  {row.ticker}
                                </span>
                              </Link>
                            </td>

                            {/* Name */}
                            <td
                              className="px-2 py-1.5 text-muted-foreground max-w-[180px] truncate"
                              title={row.name}
                              data-testid={`text-name-${row.ticker}`}
                            >
                              {row.name}
                            </td>

                            {/* Sector */}
                            <td
                              className="px-2 py-1.5 text-muted-foreground whitespace-nowrap"
                              data-testid={`text-sector-${row.ticker}`}
                            >
                              {row.sector || row.subsector || "—"}
                            </td>

                            {/* Per-condition left values + optional match date */}
                            {conditions.map((cond, ci) => {
                              let val = row.values[cond.id];
                              // Fallback: if val is undefined (not null), try positional lookup
                              if (val === undefined) {
                                const valKeys = Object.keys(row.values);
                                if (ci < valKeys.length) val = row.values[valKeys[ci]];
                              }
                              const display = fmtValue(val, cond.leftMetric);
                              const hasLookback = (cond.lookbackMode ?? "now") !== "now";
                              const matchDate = row.matchDates?.[cond.id];
                              return [
                                <td
                                  key={cond.id}
                                  className="px-2 py-1.5 text-right font-mono tabular-nums text-foreground"
                                  data-testid={`val-${row.ticker}-${cond.id}`}
                                >
                                  {display}
                                </td>,
                                hasLookback && (
                                  <td
                                    key={`${cond.id}-date`}
                                    className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground text-[10px]"
                                  >
                                    {matchDate ?? "—"}
                                  </td>
                                ),
                              ];
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════ PAIRS MODE ═══════════════ */}
      {screenMode === "pairs" && (
        <>
          {/* ── Pairs Controls ── */}
          <div className="px-3 pt-2 pb-2 border-b border-border shrink-0 bg-muted/5">
            {/* Row 1: Metrics + Z-Window */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Metric A</span>
                <MetricSelect value={pairsMetricA} onChange={setPairsMetricA} width={138} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Metric B</span>
                <MetricSelect value={pairsMetricB} onChange={setPairsMetricB} width={138} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Z-Window</span>
                <div className="flex rounded overflow-hidden border border-border/60 h-7">
                  {[20, 60, 120, 250].map((w) => (
                    <button
                      key={w}
                      onClick={() => setPairsZWindow(w)}
                      className={`px-2 text-[10px] font-medium transition-colors ${
                        pairsZWindow === w
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
                      }`}
                      data-testid={`btn-pairs-z-${w}`}
                    >
                      {w}d
                    </button>
                  ))}
                </div>
                <Input
                  type="number" min={5} max={2000}
                  value={pairsZWindow}
                  onChange={(e) => setPairsZWindow(Math.max(5, parseInt(e.target.value) || 60))}
                  className="h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1"
                  data-testid="input-pairs-z-window"
                />
              </div>
            </div>
            {/* Row 2: Spread Z / OLS params + filters */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">β Lookback</span>
                <Input
                  type="number" min={5} max={2000}
                  value={pairsBetaLookback}
                  onChange={(e) => setPairsBetaLookback(Math.max(5, parseInt(e.target.value) || 52))}
                  className="h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1"
                  data-testid="input-pairs-beta-lookback"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Spread Z Win</span>
                <Input
                  type="number" min={2} max={500}
                  value={pairsSpreadZWindow}
                  onChange={(e) => setPairsSpreadZWindow(Math.max(2, parseInt(e.target.value) || 8))}
                  className="h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1"
                  data-testid="input-pairs-spread-z-window"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">OLS Win</span>
                <Input
                  type="number" min={5} max={2000}
                  value={pairsOlsResidWindow}
                  onChange={(e) => setPairsOlsResidWindow(Math.max(5, parseInt(e.target.value) || 52))}
                  className="h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1"
                  data-testid="input-pairs-ols-window"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Min Corr</span>
                <Input
                  type="number" step={0.05} min={0} max={1}
                  value={pairsMinCorr}
                  onChange={(e) => setPairsMinCorr(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                  className="h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1"
                  data-testid="input-pairs-min-corr"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Max HL</span>
                <Input
                  type="number" min={1} max={9999}
                  value={pairsMaxHalfLife}
                  onChange={(e) => setPairsMaxHalfLife(Math.max(1, parseInt(e.target.value) || 500))}
                  className="h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1"
                  data-testid="input-pairs-max-half-life"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Filter</span>
                <div className="flex rounded overflow-hidden border border-border/60 h-7">
                  {(["all", "extreme", "mean_revert"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setPairsZFilter(f)}
                      className={`px-2 text-[10px] font-medium transition-colors ${
                        pairsZFilter === f
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/20 text-muted-foreground hover:bg-muted/40"
                      }`}
                      data-testid={`btn-pairs-filter-${f}`}
                    >
                      {f === "all" ? "All" : f === "extreme" ? "|Z| ≥ 1.5" : "Mean Revert"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Pairs progress ── */}
          {isScanning && pairsScanProgress && (
            <div className="px-3 py-2 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
                <span className="text-[10px] text-muted-foreground">{pairsScanProgress}</span>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {scanError && screenMode === "pairs" && (
            <div className="px-3 py-2 border-b border-destructive/30 flex items-center gap-2 text-xs text-destructive shrink-0">
              <AlertCircle size={13} />
              {scanError}
            </div>
          )}

          {/* ── Pairs Results ── */}
          <div className="flex-1 overflow-auto min-h-0">
            {!pairsHasRun && !isScanning && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center">
                  <ArrowRightLeft size={18} className="text-muted-foreground/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground/70">Pairs screening</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ratio, Log Ratio, Raw Z, Spread Z, OLS Resid Z, Correlation, Beta, R², Beta-Adj Spread, Half-Life
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1 text-xs mt-1"
                  onClick={runPairsScreen}
                  data-testid="btn-run-pairs-empty-state"
                >
                  <Play size={12} />
                  Run Pairs Screen
                </Button>
              </div>
            )}

            {pairsHasRun && !isScanning && (
              <div className="flex flex-col h-full min-h-0">
                {/* Pairs results header */}
                <div className="px-3 py-1.5 border-b border-border/40 flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-semibold text-foreground" data-testid="text-pairs-count">
                    {sortedPairsResults.length} pairs
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({pairsMetricA}{pairsMetricA !== pairsMetricB ? ` / ${pairsMetricB}` : ""}, z{pairsZWindow}d, β{pairsBetaLookback}d)
                  </span>
                  <div className="flex-1" />
                  {sortedPairsResults.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2 gap-1"
                      onClick={exportPairsCSV}
                      data-testid="btn-export-pairs-csv"
                    >
                      <Download size={10} />
                      CSV
                    </Button>
                  )}
                </div>

                {sortedPairsResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground">
                    <AlertCircle size={18} className="text-muted-foreground/50" />
                    <p className="text-xs">No pairs matched the current filters. Try relaxing correlation or half-life thresholds.</p>
                  </div>
                ) : (
                  <div className="overflow-auto flex-1 min-h-0">
                    <table className="w-full text-xs border-separate border-spacing-0">
                      <thead className="sticky top-0 z-10 bg-background">
                        <tr className="border-b border-border">
                          {([
                            { key: "pair", label: "Pair", align: "left" },
                            { key: "ratio", label: "Ratio" },
                            { key: "logRatio", label: "Log Ratio" },
                            { key: "rawZ", label: "Raw Z" },
                            { key: "absRawZ", label: "|Raw Z|" },
                            { key: "spreadZ", label: "Spread Z" },
                            { key: "olsResidZ", label: "OLS Z" },
                            { key: "correlation", label: "Corr" },
                            { key: "rollingBeta", label: "Beta" },
                            { key: "rollingR2", label: "R²" },
                            { key: "betaAdjSpread", label: "β-Adj Sprd" },
                            { key: "halfLife", label: "Half-Life" },
                            { key: "dataPoints", label: "Pts" },
                          ] as { key: string; label: string; align?: string }[]).map((col) => (
                            <th
                              key={col.key}
                              className={`px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap ${
                                col.align === "left" ? "text-left" : "text-right"
                              }`}
                              onClick={() => togglePairsSort(col.key)}
                              data-testid={`th-${col.key}`}
                            >
                              {col.label} <PairsSortIcon colKey={col.key} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPairsResults.map((row: any, i: number) => {
                          const zColor = (v: number | null) => {
                            if (v === null) return "text-muted-foreground";
                            const abs = Math.abs(v);
                            return abs >= 2 ? "text-red-400" : abs >= 1.5 ? "text-amber-400" : "text-foreground";
                          };
                          const fmt = (v: any, d: number = 2) => v !== null && v !== undefined ? Number(v).toFixed(d) : "—";
                          return (
                            <tr
                              key={`${row.tickerA}-${row.tickerB}`}
                              className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${
                                i % 2 === 0 ? "" : "bg-muted/5"
                              }`}
                              data-testid={`row-pair-${row.tickerA}-${row.tickerB}`}
                            >
                              <td className="px-1.5 py-1.5 whitespace-nowrap">
                                <span className="font-mono font-semibold text-primary">{row.tickerA}</span>
                                <span className="text-muted-foreground mx-0.5">/</span>
                                <span className="font-mono font-semibold text-primary">{row.tickerB}</span>
                              </td>
                              <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{fmt(row.ratio, 3)}</td>
                              <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{fmt(row.logRatio, 4)}</td>
                              <td className={`px-1.5 py-1.5 text-right font-mono tabular-nums ${zColor(row.rawZ)}`}>{fmt(row.rawZ)}</td>
                              <td className={`px-1.5 py-1.5 text-right font-mono tabular-nums ${zColor(row.rawZ)}`}>{row.rawZ !== null ? Math.abs(row.rawZ).toFixed(2) : "—"}</td>
                              <td className={`px-1.5 py-1.5 text-right font-mono tabular-nums ${zColor(row.spreadZ)}`}>{fmt(row.spreadZ)}</td>
                              <td className={`px-1.5 py-1.5 text-right font-mono tabular-nums ${zColor(row.olsResidZ)}`}>{fmt(row.olsResidZ)}</td>
                              <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{fmt(row.correlation, 3)}</td>
                              <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{fmt(row.rollingBeta, 3)}</td>
                              <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{fmt(row.rollingR2, 3)}</td>
                              <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{fmt(row.betaAdjSpread, 4)}</td>
                              <td className="px-1.5 py-1.5 text-right font-mono tabular-nums">{row.halfLife !== null ? row.halfLife.toFixed(1) : "N/A"}</td>
                              <td className="px-1.5 py-1.5 text-right text-muted-foreground font-mono tabular-nums">{row.dataPoints ?? "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
