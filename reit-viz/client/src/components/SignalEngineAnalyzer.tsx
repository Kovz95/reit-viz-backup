// Reconstructed from recovered-bundle/index-CsG73Aq_.js on 2026-06-17
// Bundle fns: pqe (container) + mqe (result renderer) + gqe (row) + vqe (detail) + j2 (cell)
// Analyzer math: fqe + Ah/Wie + indicator helpers (WWe/e5/XW/qWe/HWe/YWe/JW/GWe/KWe/XWe)
// + bucket tables (lqe) + trigger detection (cqe) + firing (uqe) + bucket ranges (aqe).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Sparkles,
  X,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMetricSeries, getTickersCacheSync } from "@/lib/dataService";
import { groupMetricsByCategory, categorizeMetric } from "@/lib/metricCategories";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SignalChartTrigger {
  date: string;
  value: number;
  direction: "up" | "down";
  label: string;
}

export interface SignalChartPayload {
  ticker: string;
  label: string;
  signals: SignalChartTrigger[];
}

export interface SignalEngineAnalyzerProps {
  ticker: string;
  asFloating?: boolean;
  onClose?: () => void;
  /** Plot signal triggers on the chart (bundle `IBe`). Wired by ChartArea. */
  onPlotSignals?: (payload: SignalChartPayload) => void;
  /** Clear plotted signal triggers from the chart (bundle `rj`). */
  onClearSignals?: () => void;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PricePoint {
  time: string;
  value: number;
  high?: number;
  low?: number;
}

interface YahooPricesResponse {
  dates: string[];
  closes: number[];
  highs?: number[];
  lows?: number[];
}

interface MetricSeries {
  dates: string[];
  values: (number | null)[];
}

interface SignalDef {
  id: string;
  label: string;
  category: string;
  highIsOverbought: boolean;
  isTrendSignal: boolean;
  description: string;
}

interface Bucket {
  signal: string;
  label: string;
  low: number;
  high: number;
  n: number;
  avg_5d: number | null;
  hit_5d: number | null;
  avg_10d: number | null;
  hit_10d: number | null;
  avg_20d: number | null;
  hit_20d: number | null;
  avg_60d: number | null;
  hit_60d: number | null;
  quality: number;
}

interface Trigger {
  date: string;
  price: number;
  side: "long" | "short";
}

interface SignalResult {
  signal: string;
  currentValue: number | null;
  firing: "long" | "short" | null;
  currentBucket: Bucket | null;
  buckets: Bucket[];
  weightedEdge: number;
  triggers: Trigger[];
  meanForward20d: number | null;
  hitRate20d: number | null;
  triggerCount: number;
  series: { time: string; value: number | null }[];
}

interface Confluence {
  longCount: number;
  shortCount: number;
  longWeightedEdge: number;
  shortWeightedEdge: number;
  netBias: "long" | "short" | "neutral";
  netScore: number;
}

interface BestSingle {
  signal: string;
  direction: "long" | "short" | "neutral";
  expectedMove20dPct: number;
  expectedPrice20d: number;
  bucket: Bucket;
  currentSignalValue: number;
}

interface AnalysisResult {
  ticker: string;
  firstDate: string;
  lastDate: string;
  n: number;
  currentPrice: number;
  signals: SignalResult[];
  confluence: Confluence;
  bestSingle: BestSingle | null;
}

// ---------------------------------------------------------------------------
// Signal definitions (bundle `Ah`) + thresholds (bundle `Wie`)
// ---------------------------------------------------------------------------

const SIGNAL_DEFS: Record<string, SignalDef> = {
  price_z_60: {
    id: "price_z_60",
    label: "Price z (60d)",
    category: "Mean-reversion",
    highIsOverbought: true,
    isTrendSignal: false,
    description:
      "Z-score of log close over a 60-day window. Price reverts toward 60d mean.",
  },
  dist_200ma: {
    id: "dist_200ma",
    label: "% from 200MA",
    category: "Mean-reversion",
    highIsOverbought: true,
    isTrendSignal: false,
    description:
      "Percent distance from 200-day SMA. Price reverts toward long-term trend.",
  },
  dist_50ma: {
    id: "dist_50ma",
    label: "% from 50MA",
    category: "Mean-reversion",
    highIsOverbought: true,
    isTrendSignal: false,
    description: "Percent distance from 50-day SMA. Faster mean-reversion than 200MA.",
  },
  rsi14: {
    id: "rsi14",
    label: "RSI(14)",
    category: "Mean-reversion",
    highIsOverbought: true,
    isTrendSignal: false,
    description:
      "14-day RSI — canonical momentum / exhaustion oscillator. Reverts toward 50.",
  },
  bb_pctb_20: {
    id: "bb_pctb_20",
    label: "Bollinger %B(20)",
    category: "Mean-reversion",
    highIsOverbought: true,
    isTrendSignal: false,
    description:
      "Position within 20-day Bollinger Bands (0=lower, 0.5=mid, 1=upper).",
  },
  expanding_pct: {
    id: "expanding_pct",
    label: "Percentile (all-time)",
    category: "Mean-reversion",
    highIsOverbought: true,
    isTrendSignal: false,
    description: "Expanding rank of close (0..100). Captures multi-year extremes.",
  },
  ma_50_200_regime: {
    id: "ma_50_200_regime",
    label: "MA(50/200) regime",
    category: "Momentum / trend",
    highIsOverbought: false,
    isTrendSignal: true,
    description:
      "Above 50MA AND above 200MA → bullish regime (continuation, not fade).",
  },
  roc_20: {
    id: "roc_20",
    label: "ROC(20d)",
    category: "Momentum / trend",
    highIsOverbought: false,
    isTrendSignal: true,
    description: "20-day rate of change. Positive ROC tends to persist short-term.",
  },
  roc_60: {
    id: "roc_60",
    label: "ROC(60d)",
    category: "Momentum / trend",
    highIsOverbought: false,
    isTrendSignal: true,
    description: "60-day rate of change. Captures intermediate-term momentum.",
  },
  macd_hist_sign: {
    id: "macd_hist_sign",
    label: "MACD histogram sign",
    category: "Momentum / trend",
    highIsOverbought: false,
    isTrendSignal: true,
    description: "Sign of MACD histogram (12,26,9). Positive = bullish momentum.",
  },
  atr_pct_percentile: {
    id: "atr_pct_percentile",
    label: "ATR% percentile",
    category: "Volatility",
    highIsOverbought: false,
    isTrendSignal: false,
    description:
      "Percentile of ATR(14) / close. High = volatile / often near a turning point.",
  },
  wb_metric_z: {
    id: "wb_metric_z",
    label: "Workbook metric z (60d)",
    category: "Workbook valuation",
    highIsOverbought: true,
    isTrendSignal: false,
    description: "Z-score of workbook metric vs its own 60d history.",
  },
  wb_metric_pct: {
    id: "wb_metric_pct",
    label: "Workbook metric pct (all-time)",
    category: "Workbook valuation",
    highIsOverbought: true,
    isTrendSignal: false,
    description: "Expanding percentile of workbook metric.",
  },
};

const SIGNAL_THRESHOLDS: Record<string, { longBelow: number; shortAbove: number }> = {
  price_z_60: { longBelow: -1.5, shortAbove: 1.5 },
  dist_200ma: { longBelow: -10, shortAbove: 15 },
  dist_50ma: { longBelow: -5, shortAbove: 8 },
  rsi14: { longBelow: 30, shortAbove: 70 },
  bb_pctb_20: { longBelow: 0.05, shortAbove: 0.95 },
  expanding_pct: { longBelow: 10, shortAbove: 90 },
  ma_50_200_regime: { longBelow: 0.5, shortAbove: -0.5 },
  roc_20: { longBelow: -2, shortAbove: 2 },
  roc_60: { longBelow: -5, shortAbove: 5 },
  macd_hist_sign: { longBelow: 0, shortAbove: 0 },
  atr_pct_percentile: { longBelow: 5, shortAbove: 95 },
  wb_metric_z: { longBelow: -1.5, shortAbove: 1.5 },
  wb_metric_pct: { longBelow: 10, shortAbove: 90 },
};

// Workbook metrics probed for availability (bundle `eq`)
// Curated valuation/yield metrics used for workbook signals. Extended at runtime
// with any Valuation/Yields metrics the loaded universe exposes (see probe below)
// — kept to those categories since this analyzer is a valuation-signal feature
// (and each candidate costs a per-ticker data probe).
const WORKBOOK_METRICS_BASE = [
  "P/FFO FY2",
  "P/FFO LTM",
  "P/AFFO FY2",
  "P/AFFO LTM",
  "EV/EBITDA FY2",
  "EV/EBITDA LTM",
  "P/E FY2",
  "P/E LTM",
  "FFO Yield FY2",
  "AFFO Yield FY2",
  "Dividend Yield",
  "Implied Cap Rate",
];

// Base + any Valuation/Yields metrics present in the loaded universe.
function workbookMetricCandidates(): string[] {
  const s = new Set<string>(WORKBOOK_METRICS_BASE);
  for (const t of getTickersCacheSync() || []) {
    for (const m of t.metrics || []) {
      const c = categorizeMetric(m);
      if (c === "Valuation" || c === "Yields") s.add(m);
    }
  }
  return [...s];
}

// Category order (bundle `tq`) + colors (bundle `dqe`)
const CATEGORIES = [
  "Mean-reversion",
  "Momentum / trend",
  "Volatility",
  "Workbook valuation",
];

const CATEGORY_COLORS: Record<string, string> = {
  "Mean-reversion": "text-cyan-400",
  "Momentum / trend": "text-emerald-400",
  Volatility: "text-amber-400",
  "Workbook valuation": "text-fuchsia-400",
};

// ---------------------------------------------------------------------------
// Indicator math (bundle helpers)
// ---------------------------------------------------------------------------

// Rolling z-score (bundle `WWe`)
function rollingZScore(values: (number | null)[], window: number): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  for (let i = window - 1; i < values.length; i++) {
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const v = values[j];
      if (v == null || !isFinite(v)) {
        count = 0;
        break;
      }
      sum += v;
      sumSq += v * v;
      count++;
    }
    if (count !== window) continue;
    const mean = sum / window;
    const variance = Math.max(0, sumSq / window - mean * mean);
    const sd = Math.sqrt(variance);
    const cur = values[i];
    out[i] = sd === 0 ? 0 : ((cur as number) - mean) / sd;
  }
  return out;
}

// Simple moving average (bundle `e5`)
function sma(values: number[], window: number): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

// Exponential moving average (bundle `XW`)
function ema(values: number[], window: number): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  if (values.length < window) return out;
  const k = 2 / (window + 1);
  let seed = 0;
  for (let i = 0; i < window; i++) seed += values[i];
  out[window - 1] = seed / window;
  for (let i = window; i < values.length; i++) {
    const prev = out[i - 1] as number;
    out[i] = values[i] * k + prev * (1 - k);
  }
  return out;
}

// RSI(14) (bundle `qWe`)
function rsi14(values: number[]): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  if (values.length < 15) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= 14; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= 14;
  avgLoss /= 14;
  out[14] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = 15; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// Bollinger %B(20,2) (bundle `HWe`)
function bollingerPctB(values: number[], window = 20, mult = 2): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  for (let i = window - 1; i < values.length; i++) {
    let sum = 0;
    let sumSq = 0;
    for (let j = i - window + 1; j <= i; j++) {
      sum += values[j];
      sumSq += values[j] * values[j];
    }
    const mean = sum / window;
    const variance = Math.max(0, sumSq / window - mean * mean);
    const sd = Math.sqrt(variance);
    if (sd === 0) {
      out[i] = 0.5;
      continue;
    }
    const upper = mean + mult * sd;
    const lower = mean - mult * sd;
    out[i] = (values[i] - lower) / (upper - lower);
  }
  return out;
}

// Expanding percentile (bundle `YWe`)
function expandingPercentile(values: number[]): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  const sorted: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] <= values[i]) lo = mid + 1;
      else hi = mid;
    }
    sorted.splice(lo, 0, values[i]);
    out[i] = ((lo + 1) / sorted.length) * 100;
  }
  return out;
}

// Rate of change % (bundle `JW`)
function roc(values: number[], window: number): (number | null)[] {
  const out = new Array<number | null>(values.length).fill(null);
  for (let i = window; i < values.length; i++) {
    if (values[i - window] <= 0) continue;
    out[i] = ((values[i] - values[i - window]) / values[i - window]) * 100;
  }
  return out;
}

// MACD histogram sign (12,26,9) (bundle `GWe`)
function macdHistSign(values: number[]): (number | null)[] {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const macdLine = values.map((_, i) =>
    fast[i] != null && slow[i] != null ? (fast[i] as number) - (slow[i] as number) : null
  );
  const hist = new Array<number | null>(values.length).fill(null);
  const k = 2 / 10;
  let signal: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const m = macdLine[i];
    if (m == null) {
      signal = null;
      continue;
    }
    if (signal == null) {
      signal = m;
      continue;
    }
    signal = m * k + signal * (1 - k);
    hist[i] = m - signal;
  }
  return hist.map((v) => (v == null ? null : v > 0 ? 1 : v < 0 ? -1 : 0));
}

// ATR% percentile (bundle `KWe`)
function atrPctPercentile(
  highs: number[],
  lows: number[],
  closes: number[],
  window = 14
): (number | null)[] {
  const tr = new Array<number>(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const h = highs[i] ?? closes[i];
    const l = lows[i] ?? closes[i];
    const prevClose = closes[i - 1];
    tr[i] = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
  }
  const atr = new Array<number | null>(closes.length).fill(null);
  let seed = 0;
  for (let i = 1; i <= window; i++) seed += tr[i] || 0;
  atr[window] = seed / window;
  for (let i = window + 1; i < closes.length; i++) {
    const prev = atr[i - 1] as number;
    atr[i] = (prev * (window - 1) + (tr[i] || 0)) / window;
  }
  const atrPct = atr.map((v, i) =>
    v != null && closes[i] > 0 ? (v / closes[i]) * 100 : null
  );
  const sorted: number[] = [];
  const out = new Array<number | null>(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    const v = atrPct[i];
    if (v == null) {
      out[i] = null;
      continue;
    }
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] <= v) lo = mid + 1;
      else hi = mid;
    }
    sorted.splice(lo, 0, v);
    out[i] = ((lo + 1) / sorted.length) * 100;
  }
  return out;
}

// MA 50/200 regime (bundle `XWe`)
function ma50200Regime(values: number[]): (number | null)[] {
  const ma50 = sma(values, 50);
  const ma200 = sma(values, 200);
  return values.map((v, i) => {
    const s = ma50[i];
    const l = ma200[i];
    if (s == null || l == null) return null;
    if (v > s && v > l && s > l) return 1;
    if (v < s && v < l && s < l) return -1;
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Bucket ranges (bundle JWe/ZWe/QWe/eqe/tqe/rqe/nqe/iqe/sqe + selector `aqe`)
// ---------------------------------------------------------------------------

type BucketRange = [number, number, string];

const ZSCORE_BUCKETS: BucketRange[] = [
  [-Infinity, -2.5, "z ≤ −2.5"],
  [-2.5, -2, "−2.5 < z ≤ −2.0"],
  [-2, -1.5, "−2.0 < z ≤ −1.5"],
  [-1.5, -1, "−1.5 < z ≤ −1.0"],
  [-1, -0.5, "−1.0 < z ≤ −0.5"],
  [-0.5, 0.5, "−0.5 < z ≤ +0.5"],
  [0.5, 1, "+0.5 < z ≤ +1.0"],
  [1, 1.5, "+1.0 < z ≤ +1.5"],
  [1.5, 2, "+1.5 < z ≤ +2.0"],
  [2, 2.5, "+2.0 < z ≤ +2.5"],
  [2.5, Infinity, "z > +2.5"],
];

const DIST_200_BUCKETS: BucketRange[] = [
  [-Infinity, -30, "≤ −30%"],
  [-30, -20, "−30 to −20%"],
  [-20, -10, "−20 to −10%"],
  [-10, -5, "−10 to −5%"],
  [-5, 0, "−5 to 0%"],
  [0, 5, "0 to +5%"],
  [5, 10, "+5 to +10%"],
  [10, 20, "+10 to +20%"],
  [20, 30, "+20 to +30%"],
  [30, Infinity, "≥ +30%"],
];

const DIST_50_BUCKETS: BucketRange[] = [
  [-Infinity, -15, "≤ −15%"],
  [-15, -10, "−15 to −10%"],
  [-10, -5, "−10 to −5%"],
  [-5, -2, "−5 to −2%"],
  [-2, 0, "−2 to 0%"],
  [0, 2, "0 to +2%"],
  [2, 5, "+2 to +5%"],
  [5, 10, "+5 to +10%"],
  [10, 15, "+10 to +15%"],
  [15, Infinity, "≥ +15%"],
];

const RSI_BUCKETS: BucketRange[] = [
  [0, 20, "0–20 (extreme oversold)"],
  [20, 30, "20–30 (oversold)"],
  [30, 40, "30–40 (weak)"],
  [40, 50, "40–50 (mild weak)"],
  [50, 60, "50–60 (mild strong)"],
  [60, 70, "60–70 (strong)"],
  [70, 80, "70–80 (overbought)"],
  [80, 100.0001, "80–100 (extreme)"],
];

const BB_BUCKETS: BucketRange[] = [
  [-Infinity, 0, "below band"],
  [0, 0.2, "0–0.2 (lower band area)"],
  [0.2, 0.4, "0.2–0.4"],
  [0.4, 0.6, "0.4–0.6 (mid)"],
  [0.6, 0.8, "0.6–0.8"],
  [0.8, 1, "0.8–1.0 (upper band area)"],
  [1, Infinity, "above band"],
];

const PCT_BUCKETS: BucketRange[] = [
  [0, 5, "0–5"],
  [5, 10, "5–10"],
  [10, 25, "10–25"],
  [25, 40, "25–40"],
  [40, 60, "40–60"],
  [60, 75, "60–75"],
  [75, 90, "75–90"],
  [90, 95, "90–95"],
  [95, 100.0001, "95–100"],
];

const ROC20_BUCKETS: BucketRange[] = [
  [-Infinity, -10, "≤ −10%"],
  [-10, -5, "−10 to −5%"],
  [-5, -2, "−5 to −2%"],
  [-2, 0, "−2 to 0%"],
  [0, 2, "0 to +2%"],
  [2, 5, "+2 to +5%"],
  [5, 10, "+5 to +10%"],
  [10, Infinity, "≥ +10%"],
];

const ROC60_BUCKETS: BucketRange[] = [
  [-Infinity, -20, "≤ −20%"],
  [-20, -10, "−20 to −10%"],
  [-10, -5, "−10 to −5%"],
  [-5, 0, "−5 to 0%"],
  [0, 5, "0 to +5%"],
  [5, 10, "+5 to +10%"],
  [10, 20, "+10 to +20%"],
  [20, Infinity, "≥ +20%"],
];

const REGIME_BUCKETS: BucketRange[] = [
  [-1.5, -0.5, "negative"],
  [-0.5, 0.5, "neutral / zero"],
  [0.5, 1.5, "positive"],
];

function bucketRangesFor(signal: string): BucketRange[] | undefined {
  switch (signal) {
    case "price_z_60":
    case "wb_metric_z":
      return ZSCORE_BUCKETS;
    case "dist_200ma":
      return DIST_200_BUCKETS;
    case "dist_50ma":
      return DIST_50_BUCKETS;
    case "rsi14":
      return RSI_BUCKETS;
    case "bb_pctb_20":
      return BB_BUCKETS;
    case "expanding_pct":
    case "wb_metric_pct":
    case "atr_pct_percentile":
      return PCT_BUCKETS;
    case "ma_50_200_regime":
    case "macd_hist_sign":
      return REGIME_BUCKETS;
    case "roc_20":
      return ROC20_BUCKETS;
    case "roc_60":
      return ROC60_BUCKETS;
    default:
      return undefined;
  }
}

const FORWARD_WINDOWS = [5, 10, 20, 60] as const;

// Build per-bucket forward-return stats (bundle `lqe`)
function buildBuckets(
  signal: string,
  series: (number | null)[],
  closes: number[],
  ranges: BucketRange[]
): Bucket[] {
  const def = SIGNAL_DEFS[signal];
  const buckets: Bucket[] = [];
  const len = closes.length;
  for (const [low, high, label] of ranges) {
    const indices: number[] = [];
    for (let i = 0; i < len; i++) {
      const v = series[i];
      if (v != null && v >= low && v < high) indices.push(i);
    }
    let center: number;
    if (low === -Infinity) center = high - 1;
    else if (high === Infinity) center = low + 1;
    else center = (low + high) / 2;
    let neutralCenter = 0;
    if (
      signal === "rsi14" ||
      signal === "expanding_pct" ||
      signal === "wb_metric_pct" ||
      signal === "atr_pct_percentile"
    )
      neutralCenter = 50;
    else if (signal === "bb_pctb_20") neutralCenter = 0.5;
    const expectUp = def.isTrendSignal ? center > neutralCenter : center < neutralCenter;
    const bucket: Bucket = {
      signal,
      label,
      low,
      high,
      n: indices.length,
      avg_5d: null,
      hit_5d: null,
      avg_10d: null,
      hit_10d: null,
      avg_20d: null,
      hit_20d: null,
      avg_60d: null,
      hit_60d: null,
      quality: 0,
    };
    for (const window of FORWARD_WINDOWS) {
      const fwd: number[] = [];
      for (const idx of indices) {
        if (idx + window >= len || closes[idx] <= 0) continue;
        fwd.push(((closes[idx + window] - closes[idx]) / closes[idx]) * 100);
      }
      if (fwd.length === 0) continue;
      const avg = fwd.reduce((acc, v) => acc + v, 0) / fwd.length;
      const hit = (fwd.filter((v) => v > 0 === expectUp).length / fwd.length) * 100;
      (bucket as any)[`avg_${window}d`] = avg;
      (bucket as any)[`hit_${window}d`] = hit;
    }
    if (bucket.avg_20d != null && bucket.hit_20d != null && bucket.n >= 20) {
      bucket.quality =
        (Math.abs(bucket.avg_20d) * (bucket.hit_20d - 50) * Math.log10(bucket.n + 1)) / 100;
      const sign = bucket.avg_20d > 0 ? 1 : -1;
      bucket.quality = bucket.quality * sign;
    }
    buckets.push(bucket);
  }
  return buckets;
}

// Trigger detection on threshold crossings (bundle `cqe`)
function detectTriggers(
  signal: string,
  series: (number | null)[],
  dates: string[],
  closes: number[]
): Trigger[] {
  const def = SIGNAL_DEFS[signal];
  const th = SIGNAL_THRESHOLDS[signal];
  const triggers: Trigger[] = [];
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v == null) continue;
    let side: "long" | "short" | null = null;
    if (def.isTrendSignal) {
      if (v >= th.shortAbove) side = "long";
      else if (v <= th.longBelow) side = "short";
    } else {
      if (v <= th.longBelow) side = "long";
      else if (v >= th.shortAbove) side = "short";
    }
    if (side) {
      const last = triggers[triggers.length - 1];
      if (!last || last.side !== side) {
        triggers.push({ date: dates[i], price: closes[i], side });
      }
    }
  }
  return triggers;
}

// Current firing state (bundle `uqe`)
function currentFiring(signal: string, value: number | null): "long" | "short" | null {
  if (value == null) return null;
  const def = SIGNAL_DEFS[signal];
  const th = SIGNAL_THRESHOLDS[signal];
  if (def.isTrendSignal) {
    if (value >= th.shortAbove) return "long";
    if (value <= th.longBelow) return "short";
  } else {
    if (value <= th.longBelow) return "long";
    if (value >= th.shortAbove) return "short";
  }
  return null;
}

// Current-value display formatter (bundle `hqe`)
function formatCurrentValue(signal: string, value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return "—";
  switch (signal) {
    case "price_z_60":
    case "wb_metric_z":
      return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
    case "dist_200ma":
    case "dist_50ma":
    case "roc_20":
    case "roc_60":
      return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
    case "rsi14":
      return value.toFixed(1);
    case "bb_pctb_20":
      return value.toFixed(2);
    case "expanding_pct":
    case "wb_metric_pct":
    case "atr_pct_percentile":
      return value.toFixed(0);
    case "ma_50_200_regime":
      return value > 0 ? "bullish stack" : value < 0 ? "bearish stack" : "mixed";
    case "macd_hist_sign":
      return value > 0 ? "positive" : value < 0 ? "negative" : "zero";
    default:
      return "—";
  }
}

// ---------------------------------------------------------------------------
// Full analyzer (bundle `fqe`)
// ---------------------------------------------------------------------------

interface AnalyzerInput {
  ticker: string;
  prices: { time: string; value: number }[];
  highs: number[];
  lows: number[];
  workbook: { metric: string; dates: string[]; values: (number | null)[] } | null;
  enabledIds?: string[];
}

function analyzeSignals(input: AnalyzerInput): AnalysisResult | null {
  const { ticker, prices, highs, lows, workbook, enabledIds } = input;
  const valid = prices.filter((p) => p && p.value > 0 && isFinite(p.value));
  if (valid.length < 250) return null;

  const closes = valid.map((p) => p.value);
  const logCloses = closes.map((v) => Math.log(v));
  const dates = valid.map((p) => p.time);
  const len = closes.length;
  const lastIdx = len - 1;
  const lastPrice = closes[lastIdx];
  const ids = enabledIds || Object.keys(SIGNAL_DEFS);
  const seriesMap: Record<string, (number | null)[]> = {};

  if (ids.includes("price_z_60")) seriesMap.price_z_60 = rollingZScore(logCloses, 60);
  if (ids.includes("dist_200ma")) {
    const ma = sma(closes, 200);
    seriesMap.dist_200ma = closes.map((v, i) =>
      ma[i] != null && (ma[i] as number) > 0
        ? ((v - (ma[i] as number)) / (ma[i] as number)) * 100
        : null
    );
  }
  if (ids.includes("dist_50ma")) {
    const ma = sma(closes, 50);
    seriesMap.dist_50ma = closes.map((v, i) =>
      ma[i] != null && (ma[i] as number) > 0
        ? ((v - (ma[i] as number)) / (ma[i] as number)) * 100
        : null
    );
  }
  if (ids.includes("rsi14")) seriesMap.rsi14 = rsi14(closes);
  if (ids.includes("bb_pctb_20")) seriesMap.bb_pctb_20 = bollingerPctB(closes, 20, 2);
  if (ids.includes("expanding_pct")) seriesMap.expanding_pct = expandingPercentile(closes);
  if (ids.includes("ma_50_200_regime")) seriesMap.ma_50_200_regime = ma50200Regime(closes);
  if (ids.includes("roc_20")) seriesMap.roc_20 = roc(closes, 20);
  if (ids.includes("roc_60")) seriesMap.roc_60 = roc(closes, 60);
  if (ids.includes("macd_hist_sign")) seriesMap.macd_hist_sign = macdHistSign(closes);
  if (
    ids.includes("atr_pct_percentile") &&
    highs &&
    lows &&
    highs.length === closes.length
  )
    seriesMap.atr_pct_percentile = atrPctPercentile(highs, lows, closes, 14);

  if (workbook && workbook.dates.length > 0) {
    const lookup = new Map<string, number | null>();
    for (let i = 0; i < workbook.dates.length; i++)
      lookup.set(workbook.dates[i], workbook.values[i]);
    const aligned = new Array<number | null>(len).fill(null);
    let carry: number | null = null;
    for (let i = 0; i < len; i++) {
      if (lookup.has(dates[i])) {
        const v = lookup.get(dates[i]);
        if (v != null && isFinite(v)) carry = v;
      }
      aligned[i] = carry;
    }
    const validCount = aligned.filter((v) => v != null && isFinite(v)).length;
    if (validCount >= 60 && ids.includes("wb_metric_z")) {
      const arr = aligned.map((v) => (v == null || !isFinite(v) ? NaN : v));
      const z = new Array<number | null>(len).fill(null);
      for (let i = 59; i < len; i++) {
        let sum = 0;
        let sumSq = 0;
        let count = 0;
        for (let j = i - 59; j <= i; j++) {
          const v = arr[j];
          if (!isFinite(v)) {
            count = 0;
            break;
          }
          sum += v;
          sumSq += v * v;
          count++;
        }
        if (count !== 60) continue;
        const mean = sum / 60;
        const variance = Math.max(0, sumSq / 60 - mean * mean);
        const sd = Math.sqrt(variance);
        z[i] = sd === 0 ? 0 : (arr[i] - mean) / sd;
      }
      seriesMap.wb_metric_z = z;
    }
    if (validCount >= 60 && ids.includes("wb_metric_pct")) {
      const pct = new Array<number | null>(len).fill(null);
      const sorted: number[] = [];
      for (let i = 0; i < len; i++) {
        const v = aligned[i];
        if (v == null || !isFinite(v)) {
          pct[i] = null;
          continue;
        }
        let lo = 0;
        let hi = sorted.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (sorted[mid] <= v) lo = mid + 1;
          else hi = mid;
        }
        sorted.splice(lo, 0, v);
        pct[i] = ((lo + 1) / sorted.length) * 100;
      }
      seriesMap.wb_metric_pct = pct;
    }
  }

  const results: SignalResult[] = [];
  for (const id of ids) {
    const series = seriesMap[id];
    if (!series) continue;
    const ranges = bucketRangesFor(id);
    if (!ranges) continue;
    const buckets = buildBuckets(id, series, closes, ranges);
    const currentValue = series[lastIdx];
    const firing = currentFiring(id, currentValue ?? null);
    const currentBucket =
      (currentValue != null &&
        buckets.find((b) => currentValue >= b.low && currentValue < b.high)) ||
      null;
    const triggers = detectTriggers(id, series, dates, closes);

    let meanForward20d: number | null = null;
    let hitRate20d: number | null = null;
    if (triggers.length >= 5) {
      const fwd: number[] = [];
      let hits = 0;
      for (const trig of triggers) {
        const idx = dates.indexOf(trig.date);
        if (idx < 0 || idx + 20 >= len) continue;
        const change = ((closes[idx + 20] - closes[idx]) / closes[idx]) * 100;
        fwd.push(change);
        if (
          (trig.side === "long" && change > 0) ||
          (trig.side === "short" && change < 0)
        )
          hits++;
      }
      if (fwd.length >= 5) {
        meanForward20d = fwd.reduce((acc, v) => acc + v, 0) / fwd.length;
        hitRate20d = (hits / fwd.length) * 100;
      }
    }

    let weightedEdge = 0;
    if (
      currentBucket &&
      currentBucket.avg_20d != null &&
      currentBucket.n >= 20 &&
      firing
    ) {
      weightedEdge =
        (firing === "long" ? 1 : -1) *
        Math.abs(currentBucket.avg_20d) *
        Math.log10(currentBucket.n + 1);
    }

    results.push({
      signal: id,
      currentValue: currentValue ?? null,
      firing,
      currentBucket,
      buckets,
      weightedEdge,
      triggers,
      meanForward20d,
      hitRate20d,
      triggerCount: triggers.length,
      series: dates.map((time, i) => ({ time, value: series[i] ?? null })),
    });
  }

  const longFiring = results.filter((r) => r.firing === "long");
  const shortFiring = results.filter((r) => r.firing === "short");
  const longWeightedEdge = longFiring.reduce((acc, r) => acc + r.weightedEdge, 0);
  const shortWeightedEdge = shortFiring.reduce((acc, r) => acc + r.weightedEdge, 0);
  const netScore = longWeightedEdge + shortWeightedEdge;
  const netBias: "long" | "short" | "neutral" =
    Math.abs(netScore) < 0.1 ? "neutral" : netScore > 0 ? "long" : "short";
  const confluence: Confluence = {
    longCount: longFiring.length,
    shortCount: shortFiring.length,
    longWeightedEdge,
    shortWeightedEdge,
    netBias,
    netScore,
  };

  let bestSingle: BestSingle | null = null;
  let bestQuality = -Infinity;
  for (const r of results) {
    if (
      !r.currentBucket ||
      r.currentBucket.n < 20 ||
      r.currentBucket.avg_20d == null ||
      r.currentValue == null
    )
      continue;
    const quality = Math.abs(r.currentBucket.quality);
    if (quality > bestQuality) {
      bestQuality = quality;
      const avg = r.currentBucket.avg_20d;
      const direction: "long" | "short" | "neutral" =
        avg > 0.3 ? "long" : avg < -0.3 ? "short" : "neutral";
      bestSingle = {
        signal: r.signal,
        direction,
        expectedMove20dPct: avg,
        expectedPrice20d: lastPrice * (1 + avg / 100),
        bucket: r.currentBucket,
        currentSignalValue: r.currentValue,
      };
    }
  }

  return {
    ticker,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    n: len,
    currentPrice: lastPrice,
    signals: results,
    confluence,
    bestSingle,
  };
}

// ---------------------------------------------------------------------------
// localStorage-backed state hook (bundle `QW`)
// ---------------------------------------------------------------------------

const PERSIST_PREFIX = "rv:persist:";

function readPersisted<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PERSIST_PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function usePersistentState<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => readPersisted(key, fallback));
  const keyRef = useRef(key);
  const skipWriteRef = useRef(true);
  if (keyRef.current !== key) {
    keyRef.current = key;
    skipWriteRef.current = true;
    setValue(readPersisted(key, fallback));
  }
  useEffect(() => {
    if (skipWriteRef.current) {
      skipWriteRef.current = false;
      return;
    }
    try {
      if (value == null) {
        window.localStorage.removeItem(PERSIST_PREFIX + key);
        return;
      }
      window.localStorage.setItem(PERSIST_PREFIX + key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

// ---------------------------------------------------------------------------
// Yahoo price history fetch (bundle `Vp`)
// ---------------------------------------------------------------------------

async function fetchYahooPrices(ticker: string): Promise<YahooPricesResponse> {
  const symbol = ticker.toUpperCase();
  const resp = await fetch(`/api/yahoo-prices/${encodeURIComponent(symbol)}`);
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(
      body?.error ?? `Could not load price history for ${symbol} from Yahoo Finance`
    );
  }
  return resp.json();
}

// Percent formatter (bundle `A2`)
function formatPct(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return "—";
  return (value * 100).toFixed(1) + "%";
}
void formatPct;

// ===========================================================================
// Container component (bundle `pqe`)
// ===========================================================================

export default function SignalEngineAnalyzer({
  ticker,
  asFloating = false,
  onClose,
  onPlotSignals,
  onClearSignals,
}: SignalEngineAnalyzerProps) {
  const [prices, setPrices] = useState<PricePoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workbookMetric, setWorkbookMetric] = usePersistentState<string | null>(
    `signal-engine:${ticker}:workbook-metric`,
    null
  );
  const [availableWbMetrics, setAvailableWbMetrics] = useState<string[]>([]);
  const [workbookSeries, setWorkbookSeries] = useState<MetricSeries | null>(null);
  const [enabledOnChart, setEnabledOnChart] = usePersistentState<string[]>(
    `signal-engine:${ticker}:enabled-on-chart`,
    []
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  // Fetch price history (bundle `Vp`, requires >=250 valid bars)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchYahooPrices(ticker)
      .then((resp) => {
        if (cancelled) return;
        const points: PricePoint[] = resp.dates
          .map((date, i) => ({
            time: date,
            value: resp.closes[i],
            high: resp.highs?.[i],
            low: resp.lows?.[i],
          }))
          .filter((p) => p.value > 0 && isFinite(p.value));
        setPrices(points);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err?.message || err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // Probe which workbook metrics have >=60 bars (bundle `eq` via `nn`)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found: string[] = [];
      const candidates = workbookMetricCandidates();
      await Promise.all(
        candidates.map(async (metric) => {
          try {
            const series = await getMetricSeries(ticker, metric);
            if (series && series.length >= 60) found.push(metric);
          } catch {
            /* ignore */
          }
        })
      );
      if (!cancelled) setAvailableWbMetrics(candidates.filter((m) => found.includes(m)));
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // Fetch the selected workbook metric series
  useEffect(() => {
    let cancelled = false;
    if (!workbookMetric) {
      setWorkbookSeries(null);
      return;
    }
    getMetricSeries(ticker, workbookMetric)
      .then((series) => {
        if (cancelled || !series) {
          setWorkbookSeries(null);
          return;
        }
        const dates: string[] = [];
        const values: (number | null)[] = [];
        for (const point of series) {
          dates.push(point.time);
          values.push(
            typeof point.value === "number" && isFinite(point.value) ? point.value : null
          );
        }
        setWorkbookSeries({ dates, values });
      })
      .catch(() => {
        if (!cancelled) setWorkbookSeries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, workbookMetric]);

  // Run analysis (bundle `fqe`)
  const result = useMemo(() => {
    if (!prices || prices.length < 250) return null;
    try {
      return analyzeSignals({
        ticker,
        prices: prices.map((p) => ({ time: p.time, value: p.value })),
        highs: prices.map((p) => p.high ?? p.value),
        lows: prices.map((p) => p.low ?? p.value),
        workbook:
          workbookSeries && workbookMetric
            ? {
                metric: workbookMetric,
                dates: workbookSeries.dates,
                values: workbookSeries.values,
              }
            : null,
      });
    } catch (err) {
      console.warn("[SignalEngineAnalyzer] analyze failed", err);
      return null;
    }
  }, [prices, ticker, workbookSeries, workbookMetric]);

  // Plot/clear enabled signals on the chart (bundle `IBe` / `rj`)
  useEffect(() => {
    if (!result) return;
    if (enabledOnChart.length === 0) {
      onClearSignals?.();
      return;
    }
    const triggers: SignalChartTrigger[] = [];
    const MAX_PER_SIGNAL = 50;
    for (const signal of enabledOnChart) {
      const sig = result.signals.find((s) => s.signal === signal);
      if (!sig) continue;
      const label = SIGNAL_DEFS[signal].label;
      const recent =
        sig.triggers.length > MAX_PER_SIGNAL
          ? sig.triggers.slice(sig.triggers.length - MAX_PER_SIGNAL)
          : sig.triggers;
      for (const trig of recent)
        triggers.push({
          date: trig.date,
          value: trig.price,
          direction: trig.side === "long" ? "up" : "down",
          label: `${label} (${trig.side.toUpperCase()})`,
        });
    }
    if (triggers.length === 0) {
      onClearSignals?.();
      return;
    }
    onPlotSignals?.({
      ticker,
      label: `Signals · ${enabledOnChart.length} on chart · ${triggers.length} triggers`,
      signals: triggers,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledOnChart, result, ticker]);

  const toggleOnChart = useCallback(
    (signal: string) => {
      setEnabledOnChart(
        enabledOnChart.includes(signal)
          ? enabledOnChart.filter((s) => s !== signal)
          : [...enabledOnChart, signal]
      );
    },
    [enabledOnChart, setEnabledOnChart]
  );

  const containerClass = asFloating
    ? "fixed top-16 right-4 z-40 w-[760px] max-w-[95vw] max-h-[80vh] flex flex-col bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
    : "w-full h-full flex flex-col border border-border/30 min-h-0 overflow-hidden";

  return (
    <div className={containerClass} data-testid="signal-engine-popover">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-card/80 border-b border-border/40 flex-shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Signal Engine — {ticker}
        </span>
        {result && (
          <span className="text-[10px] text-muted-foreground ml-2">
            {result.signals.length} signals · {result.n.toLocaleString()}d
          </span>
        )}
        <div className="flex-1" />
        {asFloating && onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onClose}
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3 text-xs">
        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading {ticker}…
          </div>
        )}
        {error && (
          <div className="text-rose-400 text-xs px-2 py-3 border border-rose-500/30 bg-rose-500/5 rounded">
            {error}
          </div>
        )}
        {!loading && !error && !result && (
          <div className="text-muted-foreground text-xs px-2 py-3">
            Need at least 250 trading days of price history for {ticker}.
          </div>
        )}
        {result && (
          <ResultView
            result={result}
            enabledOnChart={enabledOnChart}
            toggleOnChart={toggleOnChart}
            expanded={expanded}
            setExpanded={setExpanded}
            workbookMetric={workbookMetric}
            setWorkbookMetric={setWorkbookMetric}
            availableWbMetrics={availableWbMetrics}
          />
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Result renderer (bundle `mqe`)
// ===========================================================================

interface ResultViewProps {
  result: AnalysisResult;
  enabledOnChart: string[];
  toggleOnChart: (signal: string) => void;
  expanded: string | null;
  setExpanded: (signal: string | null) => void;
  workbookMetric: string | null;
  setWorkbookMetric: (metric: string | null) => void;
  availableWbMetrics: string[];
}

function ResultView({
  result,
  enabledOnChart,
  toggleOnChart,
  expanded,
  setExpanded,
  workbookMetric,
  setWorkbookMetric,
  availableWbMetrics,
}: ResultViewProps) {
  const confluence = result.confluence;
  const confluenceClass =
    confluence.netBias === "long"
      ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/5"
      : confluence.netBias === "short"
      ? "text-rose-400 border-rose-500/40 bg-rose-500/5"
      : "text-muted-foreground border-border/40 bg-card/30";

  const byCategory = new Map<string, SignalResult[]>();
  for (const category of CATEGORIES) byCategory.set(category, []);
  for (const sig of result.signals) {
    const category = SIGNAL_DEFS[sig.signal].category;
    byCategory.get(category)?.push(sig);
  }

  return (
    <>
      <div className={`rounded-md border p-3 space-y-2 ${confluenceClass}`}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            Confluence ·{" "}
            {confluence.netBias === "neutral"
              ? "no clear bias"
              : `net ${confluence.netBias.toUpperCase()}`}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            score {confluence.netScore >= 0 ? "+" : ""}
            {confluence.netScore.toFixed(2)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="bg-card/30 border border-border/30 rounded px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-emerald-400/80">
              Long firing
            </div>
            <div className="text-[12px] font-mono font-semibold text-emerald-400">
              {confluence.longCount} · edge +{confluence.longWeightedEdge.toFixed(2)}
            </div>
          </div>
          <div className="bg-card/30 border border-border/30 rounded px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-rose-400/80">
              Short firing
            </div>
            <div className="text-[12px] font-mono font-semibold text-rose-400">
              {confluence.shortCount} · edge {confluence.shortWeightedEdge.toFixed(2)}
            </div>
          </div>
          <div className="bg-card/30 border border-border/30 rounded px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Net bias
            </div>
            <div
              className={`text-[12px] font-mono font-semibold ${
                confluence.netBias === "long"
                  ? "text-emerald-400"
                  : confluence.netBias === "short"
                  ? "text-rose-400"
                  : "text-muted-foreground"
              }`}
            >
              {confluence.netBias.toUpperCase()}
            </div>
          </div>
        </div>
        {result.bestSingle && (
          <div className="text-[10px] text-muted-foreground/80 pt-1 border-t border-border/30">
            Best single:{" "}
            <span className="font-semibold text-foreground/80">
              {SIGNAL_DEFS[result.bestSingle.signal].label}
            </span>{" "}
            ·{" "}
            {result.bestSingle.direction === "long"
              ? "expect LONG"
              : result.bestSingle.direction === "short"
              ? "expect SHORT"
              : "neutral"}{" "}
            · 20d {result.bestSingle.expectedMove20dPct >= 0 ? "+" : ""}
            {result.bestSingle.expectedMove20dPct.toFixed(2)}% → $
            {result.bestSingle.expectedPrice20d.toFixed(2)} (n=
            {result.bestSingle.bucket.n})
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">Workbook metric:</span>
        <select
          className="bg-card/50 border border-border/40 rounded px-2 py-1 text-[11px] text-foreground hover:border-border max-w-[280px]"
          value={workbookMetric ?? ""}
          onChange={(e) => setWorkbookMetric(e.target.value || null)}
          data-testid="signal-engine-wb-metric"
        >
          <option value="">— none —</option>
          {groupMetricsByCategory(availableWbMetrics).map(({ category, metrics }) => (
            <optgroup label={category} key={category}>
              {metrics.map((metric) => (
                <option value={metric} key={metric}>
                  {metric}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {workbookMetric && (
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
            onClick={() => setWorkbookMetric(null)}
          >
            clear
          </button>
        )}
      </div>

      <div className="space-y-2">
        {CATEGORIES.map((category) => {
          const sigs = byCategory.get(category) || [];
          if (sigs.length === 0) return null;
          return (
            <div className="space-y-1" key={category}>
              <div
                className={`text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_COLORS[category]}`}
              >
                {category}
              </div>
              <div className="border border-border/30 rounded overflow-hidden">
                <table className="w-full text-[10px] font-mono">
                  <thead className="bg-card/40 text-muted-foreground">
                    <tr>
                      <th className="text-left px-2 py-1 w-[44px]">Chart</th>
                      <th className="text-left px-2 py-1">Signal</th>
                      <th className="text-right px-2 py-1">Now</th>
                      <th className="text-right px-2 py-1">Firing</th>
                      <th className="text-right px-2 py-1">20d edge</th>
                      <th className="text-right px-2 py-1">Hit</th>
                      <th className="text-right px-2 py-1">n</th>
                      <th className="text-right px-2 py-1">Trig</th>
                      <th className="text-right px-2 py-1 w-[20px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {sigs.map((sig) => (
                      <SignalRow
                        key={sig.signal}
                        sig={sig}
                        onChartEnabled={enabledOnChart.includes(sig.signal)}
                        onToggleChart={() => toggleOnChart(sig.signal)}
                        expanded={expanded === sig.signal}
                        onToggleExpand={() =>
                          setExpanded(expanded === sig.signal ? null : sig.signal)
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {sigs.find((s) => s.signal === expanded) && (
                <SignalDetail sig={sigs.find((s) => s.signal === expanded)!} />
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[9.5px] text-muted-foreground/70 leading-snug px-1 pt-1 border-t border-border/20">
        <span className="font-semibold">20d edge</span> = mean forward % change at trigger,{" "}
        <span className="font-semibold">Hit</span> = % triggers that moved in expected
        direction over 20 trading days,{" "}
        <span className="font-semibold">Trig</span> = lifetime trigger count.{" "}
        <span className="font-semibold">Confluence score</span> = sum of |20d edge|·log₁₀(n+1)
        signed by firing direction. Toggle{" "}
        <Eye className="inline w-3 h-3" /> to plot triggers on chart.{" "}
        Sample: {result.firstDate} → {result.lastDate}.
      </div>
    </>
  );
}

// ===========================================================================
// Signal row (bundle `gqe`)
// ===========================================================================

interface SignalRowProps {
  sig: SignalResult;
  onChartEnabled: boolean;
  onToggleChart: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

function SignalRow({
  sig,
  onChartEnabled,
  onToggleChart,
  expanded,
  onToggleExpand,
}: SignalRowProps) {
  const def = SIGNAL_DEFS[sig.signal];
  const firingClass =
    sig.firing === "long"
      ? "text-emerald-400 font-semibold"
      : sig.firing === "short"
      ? "text-rose-400 font-semibold"
      : "text-muted-foreground";
  const edgeClass = (value: number | null) =>
    value == null
      ? "text-muted-foreground"
      : value > 0.3
      ? "text-emerald-400"
      : value < -0.3
      ? "text-rose-400"
      : "text-muted-foreground";
  const hitClass = (value: number | null) =>
    value == null
      ? "text-muted-foreground"
      : value >= 60
      ? "text-emerald-400 font-semibold"
      : value >= 55
      ? "text-emerald-400/70"
      : value <= 40
      ? "text-rose-400 font-semibold"
      : value <= 45
      ? "text-rose-400/70"
      : "text-muted-foreground";

  return (
    <tr
      className={`border-t border-border/20 hover:bg-card/30 ${
        sig.firing ? "bg-amber-500/5" : ""
      }`}
      data-testid={`signal-row-${sig.signal}`}
    >
      <td className="px-2 py-1">
        <button
          onClick={onToggleChart}
          className={`w-6 h-6 flex items-center justify-center rounded border transition-colors ${
            onChartEnabled
              ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
              : "bg-transparent border-border/30 text-muted-foreground hover:border-border"
          }`}
          title={onChartEnabled ? "Hide triggers on chart" : "Show triggers on chart"}
          data-testid={`signal-toggle-chart-${sig.signal}`}
        >
          {onChartEnabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>
      </td>
      <td className="px-2 py-1 text-foreground/90" title={def.description}>
        {def.label}
      </td>
      <td className="px-2 py-1 text-right text-foreground/80">
        {formatCurrentValue(sig.signal, sig.currentValue)}
      </td>
      <td className={`px-2 py-1 text-right ${firingClass}`}>
        {sig.firing ? sig.firing.toUpperCase() : "—"}
      </td>
      <td className={`px-2 py-1 text-right ${edgeClass(sig.meanForward20d)}`}>
        {sig.meanForward20d != null
          ? `${sig.meanForward20d >= 0 ? "+" : ""}${sig.meanForward20d.toFixed(2)}%`
          : "—"}
      </td>
      <td className={`px-2 py-1 text-right ${hitClass(sig.hitRate20d)}`}>
        {sig.hitRate20d != null ? `${sig.hitRate20d.toFixed(0)}%` : "—"}
      </td>
      <td className="px-2 py-1 text-right text-muted-foreground">
        {sig.currentBucket?.n ?? 0}
      </td>
      <td className="px-2 py-1 text-right text-muted-foreground">{sig.triggerCount}</td>
      <td className="px-1 py-1 text-right">
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={onToggleExpand}
          title={expanded ? "Hide bucket table" : "Show bucket table"}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
      </td>
    </tr>
  );
}

// ===========================================================================
// Expanded per-signal detail (bundle `vqe`)
// ===========================================================================

function SignalDetail({ sig }: { sig: SignalResult }) {
  const def = SIGNAL_DEFS[sig.signal];
  return (
    <div className="border border-border/30 rounded p-2 bg-card/20">
      <div className="text-[10px] text-muted-foreground mb-2">
        <span className="font-semibold text-foreground/80">{def.label}</span>: {def.description}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead className="bg-card/30 text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-1">Bucket</th>
              <th className="text-right px-2 py-1">n</th>
              <th className="text-right px-2 py-1">5d avg/hit</th>
              <th className="text-right px-2 py-1">10d avg/hit</th>
              <th className="text-right px-2 py-1">20d avg/hit</th>
              <th className="text-right px-2 py-1">60d avg/hit</th>
              <th className="text-right px-2 py-1">Q</th>
            </tr>
          </thead>
          <tbody>
            {sig.buckets.map((bucket, i) => {
              const isCurrent = sig.currentBucket?.label === bucket.label;
              return (
                <tr
                  className={`border-t border-border/20 ${isCurrent ? "bg-amber-500/10" : ""}`}
                  key={bucket.label + i}
                >
                  <td className="px-2 py-1 text-foreground/90">
                    {isCurrent && <span className="text-amber-400 mr-1">▶</span>}
                    {bucket.label}
                  </td>
                  <td
                    className={`px-2 py-1 text-right ${
                      bucket.n < 20 ? "text-muted-foreground/50" : "text-foreground/80"
                    }`}
                  >
                    {bucket.n}
                  </td>
                  <AvgHitCell avg={bucket.avg_5d} hit={bucket.hit_5d} />
                  <AvgHitCell avg={bucket.avg_10d} hit={bucket.hit_10d} />
                  <AvgHitCell avg={bucket.avg_20d} hit={bucket.hit_20d} />
                  <AvgHitCell avg={bucket.avg_60d} hit={bucket.hit_60d} />
                  <td
                    className={`px-2 py-1 text-right ${
                      Math.abs(bucket.quality) >= 1.5
                        ? bucket.quality > 0
                          ? "text-emerald-400 font-semibold"
                          : "text-rose-400 font-semibold"
                        : Math.abs(bucket.quality) >= 0.5
                        ? bucket.quality > 0
                          ? "text-emerald-400/70"
                          : "text-rose-400/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {bucket.quality.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Avg/hit table cell (bundle `j2`)
function AvgHitCell({ avg, hit }: { avg: number | null; hit: number | null }) {
  const avgText = avg == null ? "—" : `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`;
  const hitText = hit == null ? "—" : `${hit.toFixed(0)}%`;
  const avgClass =
    avg == null
      ? "text-muted-foreground"
      : avg > 0.3
      ? "text-emerald-400"
      : avg < -0.3
      ? "text-rose-400"
      : "text-muted-foreground";
  return (
    <td className="px-2 py-1 text-right">
      <span className={avgClass}>{avgText}</span>
      <span className="text-muted-foreground/60 mx-1">/</span>
      <span className="text-foreground/70">{hitText}</span>
    </td>
  );
}
