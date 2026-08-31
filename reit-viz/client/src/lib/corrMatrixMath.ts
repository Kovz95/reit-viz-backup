// Pure correlation-matrix math, extracted from correlationEngine.ts so the
// static-mode N×N compute can run in a Web Worker
// (workers/corrMath.worker.ts) with the same function doubling as the
// main-thread fallback. No fetching, no DOM — series arrive pre-resolved.
import { yieldMain } from "@/lib/yieldMain";

export interface DataPoint {
  time: string;
  value: number;
}

/** Optional per-leg technical-indicator transform, applied to the resolved
 *  series (any metric, any frequency) BEFORE alignment — lets the pairwise
 *  engine correlate e.g. RSI(14) of one stock against another's price. */
export interface LegTransform {
  kind: "rsi" | "sma" | "ema" | "roc" | "zscore" | "vol";
  period: number;
}

/** Apply a technical transform to a {time,value} series (warmup bars dropped). */
export function applyLegTransform(data: DataPoint[], t: LegTransform | null | undefined): DataPoint[] {
  if (!t || !Number.isFinite(t.period) || t.period < 2) return data;
  const p = Math.floor(t.period);
  const vals = data.map((d) => d.value);
  const out: DataPoint[] = [];
  switch (t.kind) {
    case "sma": {
      let s = 0;
      for (let i = 0; i < vals.length; i++) {
        s += vals[i];
        if (i >= p) s -= vals[i - p];
        if (i >= p - 1) out.push({ time: data[i].time, value: s / p });
      }
      break;
    }
    case "ema": {
      const k = 2 / (p + 1);
      let e = vals[0];
      for (let i = 1; i < vals.length; i++) {
        e = vals[i] * k + e * (1 - k);
        if (i >= p - 1) out.push({ time: data[i].time, value: e });
      }
      break;
    }
    case "roc": {
      for (let i = p; i < vals.length; i++) {
        const base = vals[i - p];
        if (base !== 0 && Number.isFinite(base)) {
          out.push({ time: data[i].time, value: ((vals[i] - base) / Math.abs(base)) * 100 });
        }
      }
      break;
    }
    case "zscore": {
      let s = 0, ss = 0;
      for (let i = 0; i < vals.length; i++) {
        s += vals[i];
        ss += vals[i] * vals[i];
        if (i >= p) { s -= vals[i - p]; ss -= vals[i - p] * vals[i - p]; }
        if (i >= p - 1) {
          const m = s / p;
          const sd = Math.sqrt(Math.max(ss / p - m * m, 0));
          out.push({ time: data[i].time, value: sd > 1e-12 ? (vals[i] - m) / sd : 0 });
        }
      }
      break;
    }
    case "vol": {
      // Rolling stdev of 1-bar log returns (per-bar units).
      const rets: number[] = [];
      for (let i = 1; i < vals.length; i++) {
        rets.push(vals[i] > 0 && vals[i - 1] > 0 ? Math.log(vals[i] / vals[i - 1]) : 0);
      }
      let s = 0, ss = 0;
      for (let i = 0; i < rets.length; i++) {
        s += rets[i];
        ss += rets[i] * rets[i];
        if (i >= p) { s -= rets[i - p]; ss -= rets[i - p] * rets[i - p]; }
        if (i >= p - 1) {
          const m = s / p;
          out.push({ time: data[i + 1].time, value: Math.sqrt(Math.max(ss / p - m * m, 0)) });
        }
      }
      break;
    }
    case "rsi": {
      // Wilder's RSI on the series values.
      let avgGain = 0, avgLoss = 0;
      for (let i = 1; i < vals.length; i++) {
        const ch = vals[i] - vals[i - 1];
        const gain = ch > 0 ? ch : 0;
        const loss = ch < 0 ? -ch : 0;
        if (i <= p) {
          avgGain += gain / p;
          avgLoss += loss / p;
          if (i === p) out.push({ time: data[i].time, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) });
        } else {
          avgGain = (avgGain * (p - 1) + gain) / p;
          avgLoss = (avgLoss * (p - 1) + loss) / p;
          out.push({ time: data[i].time, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) });
        }
      }
      break;
    }
  }
  return out;
}

// ── Math helpers (mirroring server/routes.ts) ──

export function logReturns(values: number[]): number[] {
  const ret: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i] > 0 && values[i - 1] > 0) {
      ret.push(Math.log(values[i] / values[i - 1]));
    } else {
      ret.push(0);
    }
  }
  return ret;
}

export function simpleChanges(values: number[]): number[] {
  const ret: number[] = [];
  for (let i = 1; i < values.length; i++) {
    ret.push(values[i] - values[i - 1]);
  }
  return ret;
}

export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i]; sumY += y[i];
    sumXY += x[i] * y[i]; sumXX += x[i] * x[i]; sumYY += y[i] * y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const ssXX = sumXX - n * meanX * meanX;
  const ssYY = sumYY - n * meanY * meanY;
  const ssXY = sumXY - n * meanX * meanY;
  const denom = Math.sqrt(ssXX * ssYY);
  return denom === 0 ? 0 : ssXY / denom;
}

export function autocorrelation(values: number[], lag: number): number {
  const n = values.length;
  if (n <= lag) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i];
  const mean = sum / n;
  let num = 0, denom = 0;
  for (let i = 0; i < n; i++) {
    denom += (values[i] - mean) ** 2;
    if (i >= lag) {
      num += (values[i] - mean) * (values[i - lag] - mean);
    }
  }
  return denom === 0 ? 0 : num / denom;
}

export function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p2 = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t2 = 1 / (1 + p2 * x);
  const y = 1 - ((((a5 * t2 + a4) * t2 + a3) * t2 + a2) * t2 + a1) * t2 * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export function adjustedCorrelation(x: number[], y: number[], rawCorr: number) {
  const n = Math.min(x.length, y.length);
  const rhoA = autocorrelation(x, 1);
  const rhoB = autocorrelation(y, 1);
  const numer = 1 - rhoA * rhoB;
  const denom2 = 1 + rhoA * rhoB;
  const nEff = denom2 === 0 ? n : Math.max(3, Math.round(n * numer / denom2));
  const r2 = rawCorr * rawCorr;
  const tStat = r2 >= 1 ? 0 : rawCorr * Math.sqrt((nEff - 2) / (1 - r2));
  const absT = Math.abs(tStat);
  const pValue = 2 * (1 - normalCDF(absT));
  return { effectiveN: nEff, tStat: Math.round(tStat * 1000) / 1000, pValue: Math.round(pValue * 10000) / 10000 };
}

// ── N×N matrix from pre-resolved series (the pure half of the static path) ──

export interface MatrixMathResult {
  labels: string[];
  matrix: number[][];
  pValues: number[][];
  observations: number;
  dateRange: { from: string; to: string };
  mode: string;
}

export async function computeMatrixFromSeries(
  specs: string[],
  allDataIn: DataPoint[][],
  mode: string,
  window: number,
  transform: LegTransform | null,
  lagBars: number,
): Promise<MatrixMathResult> {
  const lag = Math.round(lagBars) || 0;
  const lagAbs = Math.abs(lag);
  let allData = allDataIn;
  if (transform) allData = allData.map((d) => applyLegTransform(d, transform));

  // Build common dates
  const dateSets = allData.map(d => new Set(d.map(pt => pt.time)));
  let commonDates = Array.from(dateSets[0] ?? []);
  for (let i = 1; i < dateSets.length; i++) {
    commonDates = commonDates.filter(d => dateSets[i].has(d));
  }
  commonDates.sort();

  // Keep enough history that the lag offset still leaves `window` overlapping bars.
  if (commonDates.length > window + lagAbs) {
    commonDates = commonDates.slice(-(window + lagAbs));
  }

  // Aligned value arrays
  const aligned: number[][] = [];
  for (const sd of allData) {
    const dateMap = new Map(sd.map(pt => [pt.time, pt.value]));
    aligned.push(commonDates.map(d => dateMap.get(d) || 0));
  }

  // Transform
  const transformed: number[][] = [];
  for (const vals of aligned) {
    if (mode === "returns") {
      transformed.push(logReturns(vals));
    } else if (mode === "changes") {
      transformed.push(simpleChanges(vals));
    } else {
      transformed.push(vals);
    }
  }

  // Pair the arrays under the lag: row series at t, column series at t − lag.
  const pairAtLag = (xi: number[], xj: number[]): [number[], number[]] => {
    if (lag === 0) return [xi, xj];
    const n = Math.min(xi.length, xj.length);
    if (lag > 0) return [xi.slice(lag, n), xj.slice(0, n - lag)];
    return [xi.slice(0, n - lagAbs), xj.slice(lagAbs, n)];
  };

  // NxN correlation matrix (asymmetric lead/lag matrix when lag ≠ 0)
  const matrix: number[][] = [];
  const pValues: number[][] = [];
  for (let i = 0; i < specs.length; i++) {
    if (i % 8 === 0) await yieldMain(); // fallback responsiveness; cheap in a worker
    const row: number[] = [];
    const pRow: number[] = [];
    for (let j = 0; j < specs.length; j++) {
      if (i === j && lag === 0) {
        row.push(1);
        pRow.push(0);
      } else {
        const [x, y] = pairAtLag(transformed[i], transformed[j]);
        if (x.length < 10) {
          row.push(0);
          pRow.push(1);
        } else {
          const corr = pearsonCorrelation(x, y);
          const adj = adjustedCorrelation(x, y, corr);
          row.push(Math.round(corr * 10000) / 10000);
          pRow.push(adj.pValue);
        }
      }
    }
    matrix.push(row);
    pValues.push(pRow);
  }

  return {
    labels: specs,
    matrix,
    pValues,
    observations: Math.max(0, (transformed[0]?.length || 0) - lagAbs),
    dateRange: { from: commonDates[0], to: commonDates[commonDates.length - 1] },
    mode,
  };
}
