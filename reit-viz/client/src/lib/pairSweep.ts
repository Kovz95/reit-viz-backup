// Pair optimizer compute kernel — extracted from PairOptimizer.tsx so the
// z-window sweep can run in a Web Worker (workers/pairSweep.worker.ts) with
// the same function doubling as the main-thread fallback. Fetching stays on
// the page; this receives pre-resolved metric/close Maps (structured-clone
// carries Maps into workers).
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { getDailyIndexFromWeekly } from "@/lib/getDailyIndexFromWeekly";
import { computeSignalStats } from "@/lib/computeSignalStats";
import { scoreSignalStats } from "@/lib/scoreSignalStats";

export const Z_SCORE_WINDOWS = [21, 42, 63, 126, 189, 252, 504];

export function rollingZScore(series: number[], window: number): (number | null)[] {
  const result = new Array<number | null>(series.length).fill(null);
  for (let i = 1; i < series.length; i++) {
    const start = Math.max(0, i - window);
    const len = i - start;
    if (len < 2) continue;
    let sum = 0, sumSq = 0;
    for (let j = start; j < i; j++) { sum += series[j]; sumSq += series[j] * series[j]; }
    const mean = sum / len;
    const variance = sumSq / len - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    if (std > 0) result[i] = (series[i] - mean) / std;
  }
  return result;
}

export function computeHalfLife(series: number[]): number {
  if (series.length < 20) return Infinity;
  const n = series.length - 1;
  let sumY = 0, sumDY = 0, sumYDY = 0, sumY2 = 0;
  for (let i = 1; i <= n; i++) {
    const y = series[i - 1];
    const dy = series[i] - series[i - 1];
    sumY += y; sumDY += dy; sumYDY += y * dy; sumY2 += y * y;
  }
  const beta = (n * sumYDY - sumY * sumDY) / (n * sumY2 - sumY * sumY);
  return beta >= 0 ? Infinity : -Math.log(2) / Math.log(1 + beta);
}

export function computeHurst(series: number[]): number {
  if (series.length < 20) return 0.5;
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) returns.push(series[i] - series[i - 1]);
  const scales = [8, 16, 32, 64, 128].filter((s) => s <= returns.length / 2);
  if (scales.length < 2) return 0.5;
  const logScales: number[] = [], logRS: number[] = [];
  for (const scale of scales) {
    const numChunks = Math.floor(returns.length / scale);
    if (numChunks === 0) continue;
    let rsSum = 0;
    for (let chunk = 0; chunk < numChunks; chunk++) {
      const seg = returns.slice(chunk * scale, (chunk + 1) * scale);
      const mean = seg.reduce((a, v) => a + v, 0) / seg.length;
      const cumDev: number[] = [];
      let cum = 0;
      for (const v of seg) { cum += v - mean; cumDev.push(cum); }
      const range = Math.max(...cumDev) - Math.min(...cumDev);
      const std = Math.sqrt(seg.reduce((a, v) => a + (v - mean) ** 2, 0) / seg.length);
      rsSum += std > 0 ? range / std : 0;
    }
    const avgRS = rsSum / numChunks;
    if (avgRS > 0) { logScales.push(Math.log(scale)); logRS.push(Math.log(avgRS)); }
  }
  if (logScales.length < 2) return 0.5;
  const k = logScales.length;
  const sx = logScales.reduce((a, v) => a + v, 0);
  const sy = logRS.reduce((a, v) => a + v, 0);
  const sxy = logScales.reduce((a, v, i) => a + v * logRS[i], 0);
  const sxx = logScales.reduce((a, v) => a + v * v, 0);
  const slope = (k * sxy - sx * sy) / (k * sxx - sx * sx);
  return Math.max(0, Math.min(1, slope));
}

export function adfPValue(series: number[]): number {
  if (series.length < 30) return 1;
  const n = series.length;
  const returns: number[] = [];
  for (let i = 1; i < n; i++) returns.push(series[i] - series[i - 1]);
  const c = returns.length;
  let sx = 0, sdx = 0, sxdx = 0, sx2 = 0;
  for (let i = 0; i < c; i++) {
    const x = series[i], dx = returns[i];
    sx += x; sdx += dx; sxdx += x * dx; sx2 += x * x;
  }
  const beta = (c * sxdx - sx * sdx) / (c * sx2 - sx * sx);
  const meanDX = sdx / c;
  const meanX = sx / c;
  let sse = 0;
  for (let i = 0; i < c; i++) {
    const predicted = meanDX + beta * (series[i] - meanX);
    sse += (returns[i] - predicted) ** 2;
  }
  const se = Math.sqrt(sse / (c - 2)) / Math.sqrt(sx2 / c - meanX ** 2);
  const tStat = se > 0 ? beta / (se / Math.sqrt(c)) : 0;
  return tStat < -3.43 ? 0.01 : tStat < -2.86 ? 0.05 : tStat < -2.57 ? 0.1 : tStat < -1.94 ? 0.2 : 0.5;
}
// ─── Types ───────────────────────────────────────────────────────────────────

export interface PairResult {
  tickerA: string;
  tickerB: string;
  metric: string;
  halfLife: number;
  adfPValue: number;
  hurstExponent: number;
  bestWindow: number;
  buySummary: any;
  sellSummary: any;
  compositeScore: number;
  bestHorizon: string;
  buyRevSummary?: any;
  sellRevSummary?: any;
}

// ── Per-pair sweep (post-fetch portion of the page's old runAnalysis) ──

export interface PairSweepPayload {
  tA: string;
  tB: string;
  metric: string;
  dates: string[];
  inverse: number;
  mapA: Map<number, number>;
  mapB: Map<number, number>;
  mapCA: Map<number, number>;
  mapCB: Map<number, number>;
  tgtReturn: number;
  buyZ: number;
  sellZ: number;
  bandParam: { minReturn: number; maxReturn: number } | null;
  spread: string;
  sig: string;
  freq: string;
}

export function runPairSweep(p: PairSweepPayload): PairResult | null {
  const { tA, tB, metric, dates, inverse, mapA, mapB, mapCA, mapCB,
    tgtReturn, buyZ, sellZ, bandParam, spread, sig, freq } = p;
  const overlapIndices: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (mapA.has(i) && mapB.has(i) && mapCA.has(i) && mapCB.has(i)) {
      if (spread === "ratio") {
        // Inverse-direction metrics are stored sign-flipped (val*inverse),
        // so require the RAW value to be positive — bVal <= 0 rejected
        // every point for P/FFO-style metrics and silently killed the run.
        const bVal = mapB.get(i)!;
        if (!Number.isFinite(bVal) || bVal * inverse <= 0) continue;
      }
      overlapIndices.push(i);
    }
  }
  if (overlapIndices.length < 100) return null;

  const spreadSeries = spread === "ratio"
    ? overlapIndices.map((i) => mapA.get(i)! / mapB.get(i)!)
    : overlapIndices.map((i) => mapA.get(i)! - mapB.get(i)!);

  const priceRatioSeries = overlapIndices.map(
    (i) => (mapCA.get(i)! / mapCA.get(overlapIndices[0])! + mapCB.get(i)! / mapCB.get(overlapIndices[0])!) / 2
  );
  const hedgeSeries = overlapIndices.map(
    (i) => mapCA.get(i)! / mapCA.get(overlapIndices[0])! - mapCB.get(i)! / mapCB.get(overlapIndices[0])! + 1
  );

  // weekly_on_daily buckets weekly too — the expand-back-to-daily branch
  // below handles it (previously W/D collapsed to "daily" and that branch
  // was unreachable dead code).
  const freqMode = freq === "weekly" || freq === "weekly_on_daily" ? "weekly" : freq === "monthly" || freq === "monthly_on_daily" ? "monthly" : "daily";
  const overlapDates = overlapIndices.map((i) => dates[i]);
  let workingSeries: number[];
  let mapToDaily: (idx: number) => number;

  if (freqMode === "weekly" || freqMode === "monthly") {
    const downsampled = weeklyDownsample(
      { dates: overlapDates, closes: spreadSeries, adjCloses: spreadSeries },
      freqMode
    );
    if (downsampled.closes.length < (freqMode === "monthly" ? 24 : 30)) return null;
    if (freq.endsWith("_on_daily")) {
      const mapped = new Array<number>(spreadSeries.length);
      let wi = 0;
      for (let di = 0; di < spreadSeries.length; di++) {
        while (wi + 1 < downsampled.dailyIndexMap.length && downsampled.dailyIndexMap[wi + 1] <= di) wi++;
        mapped[di] = downsampled.closes[wi];
      }
      workingSeries = mapped;
      mapToDaily = (i) => i;
    } else {
      workingSeries = downsampled.closes;
      mapToDaily = (i) => getDailyIndexFromWeekly(i, downsampled);
    }
  } else {
    workingSeries = spreadSeries;
    mapToDaily = (i) => i;
  }

  const halfLife = computeHalfLife(workingSeries);
  const hurst = computeHurst(workingSeries);
  const adfP = adfPValue(workingSeries);

  let bestResult: any = null;
  let bestScore = -1;

  for (const win of Z_SCORE_WINDOWS) {
    if (win > workingSeries.length * 0.8) continue;
    const zScores = rollingZScore(workingSeries, win);
    const isBreakout = sig === "breakout" || sig === "both";
    const isReversion = sig === "reversion" || sig === "both";

    const buyBreakoutSignals: any[] = [], sellBreakoutSignals: any[] = [];
    const buyRevSignals: any[] = [], sellRevSignals: any[] = [];

    let prevZ: number | null = null;
    for (let i = 0; i < zScores.length; i++) {
      const z = zScores[i];
      if (z === null) { prevZ = null; continue; }
      if (prevZ !== null) {
        const dailyIdx = mapToDaily(i);
        if (dailyIdx >= 0) {
          if (isBreakout && prevZ >= buyZ && z < buyZ) buyBreakoutSignals.push(computeSignalStats(hedgeSeries, dailyIdx, tgtReturn, "buy", bandParam));
          if (isBreakout && prevZ <= sellZ && z > sellZ) sellBreakoutSignals.push(computeSignalStats(hedgeSeries, dailyIdx, tgtReturn, "sell", bandParam));
          if (isReversion && prevZ < buyZ && z >= buyZ) buyRevSignals.push(computeSignalStats(hedgeSeries, dailyIdx, tgtReturn, "buy", bandParam));
          if (isReversion && prevZ > sellZ && z <= sellZ) sellRevSignals.push(computeSignalStats(hedgeSeries, dailyIdx, tgtReturn, "sell", bandParam));
        }
      }
      prevZ = z;
    }

    const buySummary = scoreSignalStats(isBreakout ? buyBreakoutSignals : buyRevSignals, "buy");
    const sellSummary = scoreSignalStats(isBreakout ? sellBreakoutSignals : sellRevSignals, "sell");
    const buyRevSummary = sig === "both" ? scoreSignalStats(buyRevSignals, "buy") : undefined;
    const sellRevSummary = sig === "both" ? scoreSignalStats(sellRevSignals, "sell") : undefined;
    const hasBand = bandParam !== null;
    const buyScore = scoreSignalStats(buySummary, "buy", hasBand);
    const sellScore = scoreSignalStats(sellSummary, "sell", hasBand);

    let sigCount = ((buySummary?.count ?? 0) > 0 ? 1 : 0) + ((sellSummary?.count ?? 0) > 0 ? 1 : 0);
    let totalScore = buyScore.score + sellScore.score;
    if (sig === "both") {
      const brs = scoreSignalStats(buyRevSummary, "buy", hasBand);
      const srs = scoreSignalStats(sellRevSummary, "sell", hasBand);
      if ((buyRevSummary?.count ?? 0) > 0) { sigCount++; totalScore += brs.score; }
      if ((sellRevSummary?.count ?? 0) > 0) { sigCount++; totalScore += srs.score; }
    }
    const avgScore = sigCount > 0 ? totalScore / sigCount : 0;
    const hurstBonus = hurst < 0.45 ? 1.15 : 1;
    const adfBonus = adfP <= 0.05 ? 1.1 : 1;
    const composite = Math.min(100, avgScore * hurstBonus * adfBonus);

    if (composite > bestScore) {
      bestScore = composite;
      bestResult = {
        window: win,
        buySummary,
        sellSummary,
        compositeScore: Math.round(composite),
        bestHorizon: buyScore.score >= sellScore.score ? buyScore.bestHorizon : sellScore.bestHorizon,
        buyRevSummary,
        sellRevSummary,
      };
    }
  }

  return bestResult
    ? {
        tickerA: tA,
        tickerB: tB,
        metric,
        halfLife: Math.round(halfLife * 10) / 10,
        adfPValue: adfP,
        hurstExponent: Math.round(hurst * 1000) / 1000,
        bestWindow: bestResult.window,
        buySummary: bestResult.buySummary,
        sellSummary: bestResult.sellSummary,
        compositeScore: bestResult.compositeScore,
        bestHorizon: bestResult.bestHorizon,
        buyRevSummary: bestResult.buyRevSummary,
        sellRevSummary: bestResult.sellRevSummary,
      }
    : null;
}
