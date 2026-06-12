// Hand-written from call-site inference (PairOptimizer.tsx)
// computeSignalStats: computes per-signal forward return data at a trigger point.
// scoreSignalStats: aggregates many signal records into a summary table keyed by horizon label.

export interface BandParam {
  minReturn: number;
  maxReturn: number;
}

export interface SignalRecord {
  entryIdx: number;
  side: "buy" | "sell";
  tgtReturn: number;
  bandParam: BandParam | null;
  returns: Record<string, number>;   // horizon label -> forward return
  peaks: Record<string, number>;
  troughs: Record<string, number>;
}

export interface SignalSummary {
  count: number;
  hitRate: Record<string, number>;
  bandHitRate: Record<string, number>;
  winRate: Record<string, number>;
  avgReturn: Record<string, number>;
  medianReturn: Record<string, number>;
  avgPeak: Record<string, number>;
  avgTrough: Record<string, number>;
  profitFactor: Record<string, number>;
  score: number;
  bestHorizon: string;
}

export interface ScoreResult {
  score: number;
  bestHorizon: string;
}

// Forward horizons used in the pair optimizer (days → label)
const HORIZONS: Array<{ label: string; days: number }> = [
  { label: "1W", days: 5 },
  { label: "2W", days: 10 },
  { label: "1M", days: 21 },
  { label: "2M", days: 42 },
  { label: "3M", days: 63 },
  { label: "6M", days: 126 },
];

/**
 * Computes forward return data for a single signal trigger at `entryIdx`
 * in the given price series.
 */
export function computeSignalStats(
  series: number[],
  entryIdx: number,
  tgtReturn: number,
  side: "buy" | "sell",
  bandParam: BandParam | null
): SignalRecord {
  const returns: Record<string, number> = {};
  const peaks: Record<string, number> = {};
  const troughs: Record<string, number> = {};

  const entryPrice = series[entryIdx];

  for (const { label, days } of HORIZONS) {
    const exitIdx = Math.min(entryIdx + days, series.length - 1);
    const exitPrice = series[exitIdx];

    let fwdRet = 0;
    let peak = 0;
    let trough = 0;

    if (
      entryPrice != null &&
      Number.isFinite(entryPrice) &&
      entryPrice !== 0 &&
      exitPrice != null &&
      Number.isFinite(exitPrice)
    ) {
      if (side === "buy") {
        fwdRet = (exitPrice - entryPrice) / Math.abs(entryPrice);
      } else {
        fwdRet = (entryPrice - exitPrice) / Math.abs(entryPrice);
      }

      // Compute peak (best unrealised gain) and trough (worst unrealised drawdown)
      let bestGain = 0;
      let worstLoss = 0;
      for (let i = entryIdx + 1; i <= exitIdx; i++) {
        const p = series[i];
        if (!Number.isFinite(p)) continue;
        const r =
          side === "buy"
            ? (p - entryPrice) / Math.abs(entryPrice)
            : (entryPrice - p) / Math.abs(entryPrice);
        if (r > bestGain) bestGain = r;
        if (r < worstLoss) worstLoss = r;
      }
      peak = bestGain;
      trough = worstLoss;
    }

    returns[label] = fwdRet;
    peaks[label] = peak;
    troughs[label] = trough;
  }

  return { entryIdx, side, tgtReturn, bandParam, returns, peaks, troughs };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Aggregates an array of signal records into a summary per horizon.
 * Also returns a composite score and best-horizon label.
 *
 * Overloaded: can be called as `scoreSignalStats(summary, side, hasBand)` to
 * just compute a score from an existing summary object.
 */
export function scoreSignalStats(
  signalsOrSummary: SignalRecord[] | SignalSummary | undefined,
  side: "buy" | "sell",
  hasBand?: boolean
): SignalSummary & ScoreResult {
  // If passed a pre-built summary (e.g. to recompute score), return it with score
  if (
    signalsOrSummary != null &&
    !Array.isArray(signalsOrSummary) &&
    typeof (signalsOrSummary as SignalSummary).count === "number"
  ) {
    const s = signalsOrSummary as SignalSummary;
    return { ...s, score: s.score, bestHorizon: s.bestHorizon };
  }

  const signals: SignalRecord[] = Array.isArray(signalsOrSummary)
    ? signalsOrSummary
    : [];

  const count = signals.length;

  const hitRate: Record<string, number> = {};
  const bandHitRate: Record<string, number> = {};
  const winRate: Record<string, number> = {};
  const avgReturn: Record<string, number> = {};
  const medianReturn: Record<string, number> = {};
  const avgPeak: Record<string, number> = {};
  const avgTrough: Record<string, number> = {};
  const profitFactor: Record<string, number> = {};

  let bestScore = 0;
  let bestHorizon = HORIZONS[0].label;

  for (const { label, days } of HORIZONS) {
    if (count === 0) {
      hitRate[label] = 0;
      bandHitRate[label] = 0;
      winRate[label] = 0;
      avgReturn[label] = 0;
      medianReturn[label] = 0;
      avgPeak[label] = 0;
      avgTrough[label] = 0;
      profitFactor[label] = 0;
      continue;
    }

    const rets = signals.map((s) => s.returns[label] ?? 0);
    const pks = signals.map((s) => s.peaks[label] ?? 0);
    const trs = signals.map((s) => s.troughs[label] ?? 0);

    const tgt = signals[0]?.tgtReturn ?? 0;
    const band = signals[0]?.bandParam;

    const hits = rets.filter((r) => r >= tgt).length;
    const wins = rets.filter((r) => r > 0).length;

    hitRate[label] = hits / count;
    winRate[label] = wins / count;

    if (band) {
      const bandHits = rets.filter(
        (r) => r >= band.minReturn && r <= band.maxReturn
      ).length;
      bandHitRate[label] = bandHits / count;
    } else {
      bandHitRate[label] = hitRate[label];
    }

    avgReturn[label] = rets.reduce((s, v) => s + v, 0) / count;
    medianReturn[label] = median(rets);
    avgPeak[label] = pks.reduce((s, v) => s + v, 0) / count;
    avgTrough[label] = trs.reduce((s, v) => s + v, 0) / count;

    const positiveSum = rets.filter((r) => r > 0).reduce((s, v) => s + v, 0);
    const negativeSum = Math.abs(rets.filter((r) => r < 0).reduce((s, v) => s + v, 0));
    profitFactor[label] = negativeSum === 0 ? (positiveSum > 0 ? 99 : 0) : positiveSum / negativeSum;

    // Score this horizon for "best horizon" selection
    const hr = hasBand ? bandHitRate[label] : hitRate[label];
    const hScore = hr * 0.6 + (avgReturn[label] > 0 ? Math.min(avgReturn[label] * 100, 40) : 0);
    if (hScore > bestScore) {
      bestScore = hScore;
      bestHorizon = label;
    }
  }

  // Composite score 0–100
  let score = 0;
  if (count > 0) {
    const mainHR = hasBand ? bandHitRate[bestHorizon] : hitRate[bestHorizon];
    const countBonus = Math.min(count / 20, 1) * 10;
    score = Math.min(100, mainHR * 80 + countBonus + Math.min((profitFactor[bestHorizon] - 1) * 5, 10));
  }

  return {
    count,
    hitRate,
    bandHitRate,
    winRate,
    avgReturn,
    medianReturn,
    avgPeak,
    avgTrough,
    profitFactor,
    score,
    bestHorizon,
  };
}
