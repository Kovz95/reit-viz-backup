// Recovered from recovered-bundle/PremiumDiscount-CTjk2iA0.js and index-CsG73Aq_.js
//
// Key recovered functions:
//   sq  (index-CsG73Aq_.js:122963) → computePremiumSeries: async peer-group aggregation
//   ff  (index-CsG73Aq_.js:123076) → computePremiumDiff: map target vs group series
//   R2  (index-CsG73Aq_.js:122917) → computePremiumDiffAbs: group-only aggregation
//
// The PremiumDiscount page calls:
//   computePremiumSeries(target, dimension, peerLabel, metric, aggregation, opts?, getMetricSeries?)
//   computePremiumDiff(targetSeries, groupSeries, mode)       → (number|null)[]
//   computePremiumDiffAbs(dim, value, metric, aggregation, getMetricSeries) → Promise<(number|null)[]>

export interface PremiumSeriesInput {
  metricValues: (number | null)[];
  priceValues: (number | null)[];
  [key: string]: any;
}

export interface PremiumSeriesResult {
  dates: string[];
  values: (number | null)[];
  targetSeries: (number | null)[];
  groupSeries: (number | null)[];
  peerTickers: string[];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

type TimeValue = { time: string; value: number };

/** Median of a numeric array. */
function median(arr: number[]): number {
  if (arr.length === 0) return NaN;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Mean of a numeric array. */
function mean(arr: number[]): number {
  if (arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Index a series of { time, value } points onto a sorted date array,
 * carrying forward the last known value where the series has gaps.
 * Recovered from function `t5` referenced in sq/R2 (index bundle).
 */
function indexSeriesToDates(
  rawSeries: TimeValue[],
  dates: string[]
): Float64Array {
  const map = new Map<string, number>();
  for (const pt of rawSeries) {
    if (Number.isFinite(pt.value)) map.set(pt.time, pt.value);
  }
  const out = new Float64Array(dates.length);
  let carry = NaN;
  for (let i = 0; i < dates.length; i++) {
    const v = map.get(dates[i]);
    if (v !== undefined) { carry = v; out[i] = v; }
    else out[i] = carry; // forward-fill
  }
  return out;
}

/**
 * Convert an indexed Float64Array back to a { time, value }[] series,
 * skipping NaN entries.
 */
function indexedToTimeSeries(indexed: Float64Array, dates: string[]): TimeValue[] {
  const result: TimeValue[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (Number.isFinite(indexed[i])) result.push({ time: dates[i], value: indexed[i] });
  }
  return result;
}

// ── Public exports ────────────────────────────────────────────────────────────

/**
 * Compute the premium/discount series for a target ticker vs a peer group.
 *
 * Recovered from function `sq` (index-CsG73Aq_.js line 122963):
 *   async function sq(target, dimension, peerLabel, metric, aggregation="median", opts?, getMetricSeries)
 *
 * Flow:
 *  1. Fetch all tickers with matching dimension/peerLabel from workbook.
 *  2. For each peer ticker, fetch its metric series.
 *  3. Build a shared trading-date axis (from the workbook's date universe).
 *  4. Aggregate peer indexed series (median or mean) → groupSeries.
 *  5. Fetch the target's metric series → targetSeries.
 *  6. Return { dates, values (groupSeries), targetSeries, groupSeries, peerTickers }.
 *
 * NOTE: `getMetricSeries` is required to be async: (ticker, metric) => Promise<TimeValue[]>
 */
export async function computePremiumSeries(
  _target: any,
  _dimension?: any,
  _peerLabel?: any,
  _metric?: any,
  _aggregation?: any,
  _opts?: any,
  _getMetricSeries?: any
): Promise<PremiumSeriesResult> {
  const target: string = _target;
  const dimension: string = _dimension ?? "subindustry";
  const peerLabel: string = _peerLabel ?? "";
  const metric: string = _metric ?? "";
  const aggregation: "median" | "mean" = _aggregation === "mean" ? "mean" : "median";
  const getMetricSeries: (ticker: string, metric: string) => Promise<TimeValue[]> =
    _getMetricSeries ?? (() => Promise.resolve([]));

  // Lazily import data-service functions to avoid circular dependencies at module load.
  // In the production bundle these are `ro` (getTickers) and `js` (getTradingDates).
  let tickers: Array<{ ticker: string; [key: string]: any }> = [];
  let tradingDates: string[] = [];

  try {
    const { getTickers, getTradingDates } = await import("@/lib/dataService") as any;
    tickers = await getTickers();
    tradingDates = await getTradingDates();
  } catch {
    // If dataService is not available, fall back to empty
    return { dates: [], values: [], targetSeries: [], groupSeries: [], peerTickers: [] };
  }

  // Filter peers by dimension/peerLabel
  const ALL_KEY = "__ALL__";
  const peers = peerLabel === ALL_KEY
    ? tickers
    : tickers.filter((t) => t[dimension] === peerLabel);

  if (peers.length === 0) {
    return {
      dates: tradingDates,
      values: new Array(tradingDates.length).fill(null),
      targetSeries: new Array(tradingDates.length).fill(null),
      groupSeries: new Array(tradingDates.length).fill(null),
      peerTickers: [],
    };
  }

  // Fetch metric series for all peers
  const fetched = (
    await Promise.all(
      peers.map(async (p) => {
        try {
          const raw = await getMetricSeries(p.ticker, metric);
          return { ticker: p.ticker, indexed: indexSeriesToDates(raw, tradingDates) };
        } catch {
          return null;
        }
      })
    )
  ).filter((x): x is { ticker: string; indexed: Float64Array } => x !== null);

  // Build aggregated group series
  const groupIndexed = new Float64Array(tradingDates.length);
  const peerCount = new Array<number>(tradingDates.length).fill(0);
  for (let d = 0; d < tradingDates.length; d++) {
    const vals: number[] = [];
    for (const f of fetched) {
      const v = f.indexed[d];
      if (Number.isFinite(v)) vals.push(v);
    }
    peerCount[d] = vals.length;
    if (vals.length === 0) { groupIndexed[d] = NaN; continue; }
    groupIndexed[d] = aggregation === "median" ? median(vals) : mean(vals);
  }

  // Fetch target series
  let targetIndexed: Float64Array;
  const targetPeer = fetched.find((f) => f.ticker === target);
  if (targetPeer) {
    targetIndexed = targetPeer.indexed;
  } else {
    try {
      const raw = await getMetricSeries(target, metric);
      targetIndexed = indexSeriesToDates(raw, tradingDates);
    } catch {
      targetIndexed = new Float64Array(tradingDates.length).fill(NaN);
    }
  }

  const groupSeries = indexedToTimeSeries(groupIndexed, tradingDates);
  const targetSeries = indexedToTimeSeries(targetIndexed, tradingDates);

  // Align values to dates
  const values: (number | null)[] = tradingDates.map((_, i) => {
    const v = groupIndexed[i];
    return Number.isFinite(v) ? v : null;
  });

  return {
    dates: tradingDates,
    values,
    targetSeries: targetSeries as any,
    groupSeries: groupSeries as any,
    peerTickers: fetched.map((f) => f.ticker),
  };
}

/**
 * Compute the diff between two time series (premium/discount).
 *
 * Recovered from function `ff` (index-CsG73Aq_.js line 123076):
 *   function ff(targetSeries, groupSeries, mode)
 *
 * mode="pct"  → 100*(target - group)/group  (% premium)
 * mode="abs"  → target - group              (absolute spread)
 *
 * Input arrays are { time, value }[] or (number|null)[] — both shapes accepted.
 * Returns an array of { time, value } points where both inputs are finite,
 * matching the shape expected by the charting layer (or as a flat number array
 * when the inputs are plain number arrays).
 */
export function computePremiumDiff(
  _seriesA: any,
  _seriesB?: any,
  _mode?: any
): (number | null)[] {
  const mode: "pct" | "abs" = _mode === "abs" ? "abs" : "pct";

  // Support both flat number[] and TimeValue[] inputs.
  // Return type is the same shape as input (TimeValue[] or number[]).
  const aIsObj = Array.isArray(_seriesA) && _seriesA.length > 0 && typeof _seriesA[0] === "object";
  const bIsObj = Array.isArray(_seriesB) && _seriesB.length > 0 && typeof _seriesB[0] === "object";

  if (aIsObj && bIsObj) {
    // TimeValue[] → TimeValue[] diff
    const bMap = new Map<string, number>();
    for (const pt of (_seriesB as TimeValue[])) {
      if (Number.isFinite(pt.value)) bMap.set(pt.time, pt.value);
    }
    const result: any[] = [];
    for (const pt of (_seriesA as TimeValue[])) {
      const b = bMap.get(pt.time);
      if (b === undefined || !Number.isFinite(b) || !Number.isFinite(pt.value)) continue;
      if (mode === "abs") {
        result.push({ time: pt.time, value: pt.value - b });
      } else {
        if (Math.abs(b) < 1e-9) continue;
        result.push({ time: pt.time, value: 100 * (pt.value - b) / b });
      }
    }
    return result as any;
  }

  // Flat number[] path
  const a: (number | null)[] = _seriesA ?? [];
  const b: (number | null)[] = _seriesB ?? [];
  const n = Math.min(a.length, b.length);
  const result: (number | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const av = a[i], bv = b[i];
    if (av == null || bv == null || !Number.isFinite(av) || !Number.isFinite(bv)) {
      result[i] = null;
      continue;
    }
    if (mode === "abs") {
      result[i] = av - bv;
    } else {
      if (Math.abs(bv) < 1e-9) { result[i] = null; continue; }
      result[i] = 100 * (av - bv) / bv;
    }
  }
  return result;
}

/**
 * Compute the aggregated group series for a classification dimension/value,
 * returning only the group's values (no target comparison).
 *
 * Recovered from function `R2` (index-CsG73Aq_.js line 122917):
 *   async function R2(dimension, peerLabel, metric, aggregation="median", getMetricSeries)
 *
 * Used in group-vs-group comparison mode where each side is a group, not a ticker.
 * Returns a PremiumSeriesResult so the caller can treat groupSeries directly.
 */
export interface PremiumGroupResult {
  groupSeries: any[];
  peerTickers: string[];
  peerCount?: number[];
  dates?: string[];
  values?: (number | null)[];
  targetSeries?: any[];
}

export async function computePremiumDiffAbs(
  _dim: any,
  _value?: any,
  _metric?: any,
  _aggregation?: any,
  _getMetricSeries?: any
): Promise<PremiumGroupResult> {
  const dim: string = _dim ?? "subindustry";
  const value: string = _value ?? "__ALL__";
  const metric: string = _metric ?? "";
  const aggregation: "median" | "mean" = _aggregation === "mean" ? "mean" : "median";
  const getMetricSeries: (ticker: string, metric: string) => Promise<TimeValue[]> =
    _getMetricSeries ?? (() => Promise.resolve([]));

  let tickers: Array<{ ticker: string; [key: string]: any }> = [];
  let tradingDates: string[] = [];

  try {
    const { getTickers, getTradingDates } = await import("@/lib/dataService") as any;
    tickers = await getTickers();
    tradingDates = await getTradingDates();
  } catch {
    return { groupSeries: [], peerTickers: [], peerCount: [] };
  }

  const ALL_KEY = "__ALL__";
  const peers = value === ALL_KEY
    ? tickers
    : tickers.filter((t) => t[dim] === value);

  if (peers.length === 0) {
    // Return as a PremiumSeriesResult-like so group-mode callers can use .groupSeries
    return { groupSeries: [], peerTickers: [], peerCount: [] } as any;
  }

  const fetched = (
    await Promise.all(
      peers.map(async (p) => {
        try {
          const raw = await getMetricSeries(p.ticker, metric);
          return { ticker: p.ticker, indexed: indexSeriesToDates(raw, tradingDates) };
        } catch {
          return null;
        }
      })
    )
  ).filter((x): x is { ticker: string; indexed: Float64Array } => x !== null);

  const groupIndexed = new Float64Array(tradingDates.length);
  for (let d = 0; d < tradingDates.length; d++) {
    const vals: number[] = [];
    for (const f of fetched) {
      const v = f.indexed[d];
      if (Number.isFinite(v)) vals.push(v);
    }
    groupIndexed[d] = vals.length === 0 ? NaN : (aggregation === "median" ? median(vals) : mean(vals));
  }

  const groupSeries = indexedToTimeSeries(groupIndexed, tradingDates);

  // Return PremiumSeriesResult-compatible object (cast via any to satisfy return type)
  return {
    dates: tradingDates,
    values: tradingDates.map((_, i) => Number.isFinite(groupIndexed[i]) ? groupIndexed[i] : null),
    targetSeries: [] as any,
    groupSeries: groupSeries as any,
    peerTickers: fetched.map((f) => f.ticker),
  } as any;
}
