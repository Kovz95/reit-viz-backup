/**
 * Client-side correlation engine for static mode.
 * Mirrors the server-side correlation routes and returns identical response shapes.
 */
import { resolveSeriesDataStatic, isStaticMode, DataPoint } from "./macroStatic";
import { apiRequest } from "./queryClient";

// ── Math helpers (mirroring server/routes.ts) ──

function logReturns(values: number[]): number[] {
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

function simpleChanges(values: number[]): number[] {
  const ret: number[] = [];
  for (let i = 1; i < values.length; i++) {
    ret.push(values[i] - values[i - 1]);
  }
  return ret;
}

function pearsonCorrelation(x: number[], y: number[]): number {
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

function autocorrelation(values: number[], lag: number): number {
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

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p2 = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t2 = 1 / (1 + p2 * x);
  const y = 1 - ((((a5 * t2 + a4) * t2 + a3) * t2 + a2) * t2 + a1) * t2 * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function adjustedCorrelation(x: number[], y: number[], rawCorr: number) {
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

function bartlettSE(n: number): number {
  return 1 / Math.sqrt(n);
}

function alignSeries(a: DataPoint[], b: DataPoint[]) {
  const mapB = new Map(b.map(d => [d.time, d.value]));
  const dates: string[] = [];
  const valuesA: number[] = [];
  const valuesB: number[] = [];
  for (const pt of a) {
    const bVal = mapB.get(pt.time);
    if (bVal !== undefined) {
      dates.push(pt.time);
      valuesA.push(pt.value);
      valuesB.push(bVal);
    }
  }
  return { dates, valuesA, valuesB };
}

// ── Spearman rank correlation ──

function rankArray(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j - 1) / 2 + 1; // 1-based average rank for ties
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

function spearmanCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  return pearsonCorrelation(rankArray(x.slice(0, n)), rankArray(y.slice(0, n)));
}

// ── Fisher-transform confidence interval for correlation ──

function fisherCI(r: number, n: number, alpha = 0.05): { lower: number; upper: number } {
  if (n < 4) return { lower: -1, upper: 1 };
  const z = 0.5 * Math.log((1 + r) / (1 - r)); // Fisher z-transform
  const se = 1 / Math.sqrt(n - 3);
  // z-critical for two-tailed alpha
  // approximate inverse normal for common alphas
  const zCrit = alpha <= 0.01 ? 2.576 : alpha <= 0.05 ? 1.96 : 1.645;
  const lo = z - zCrit * se;
  const hi = z + zCrit * se;
  // inverse Fisher transform
  return {
    lower: Math.round((Math.exp(2 * lo) - 1) / (Math.exp(2 * lo) + 1) * 10000) / 10000,
    upper: Math.round((Math.exp(2 * hi) - 1) / (Math.exp(2 * hi) + 1) * 10000) / 10000,
  };
}

// ── ADF (Augmented Dickey-Fuller) unit root test ──
// Simplified ADF: tests if a series has a unit root (non-stationary)
// Uses OLS regression: Δy_t = α + γ*y_{t-1} + Σ(δ_i * Δy_{t-i}) + ε_t
// Returns: { stat, pValue, lags, isStationary }

function adfTest(values: number[], maxLag?: number): { stat: number; pValue: number; lags: number; isStationary: boolean } {
  const n = values.length;
  if (n < 20) return { stat: 0, pValue: 1, lags: 0, isStationary: false };
  
  const pLag = maxLag ?? Math.min(Math.floor(Math.pow(n - 1, 1 / 3)), 12);
  
  // Compute first differences
  const dy = new Array(n - 1);
  for (let i = 1; i < n; i++) dy[i - 1] = values[i] - values[i - 1];
  
  // Build regression: Δy_t = α + γ*y_{t-1} + δ_1*Δy_{t-1} + ... + δ_p*Δy_{t-p}
  const start = pLag + 1;
  const T = n - 1 - pLag; // effective obs
  if (T < 10) return { stat: 0, pValue: 1, lags: pLag, isStationary: false };
  
  // Design matrix columns: [1, y_{t-1}, Δy_{t-1}, ..., Δy_{t-p}]
  const k = 2 + pLag; // number of regressors
  const X: number[][] = [];
  const Y: number[] = [];
  
  for (let t = start; t < n - 1; t++) {
    const row = [1, values[t]]; // constant + lagged level
    for (let j = 1; j <= pLag; j++) {
      row.push(dy[t - j]); // lagged differences
    }
    X.push(row);
    Y.push(dy[t]);
  }
  
  // OLS: β = (X'X)^{-1} X'Y using normal equations with simple Gauss elimination
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const XtY: number[] = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < k; j++) {
      XtY[j] += X[i][j] * Y[i];
      for (let m = 0; m < k; m++) {
        XtX[j][m] += X[i][j] * X[i][m];
      }
    }
  }
  
  // Augmented matrix for Gauss elimination
  const aug: number[][] = XtX.map((row, i) => [...row, XtY[i]]);
  for (let col = 0; col < k; col++) {
    let maxRow = col;
    for (let row = col + 1; row < k; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (Math.abs(aug[col][col]) < 1e-12) return { stat: 0, pValue: 1, lags: pLag, isStationary: false };
    for (let row = col + 1; row < k; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= k; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  const beta = new Array(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    beta[i] = aug[i][k];
    for (let j = i + 1; j < k; j++) beta[i] -= aug[i][j] * beta[j];
    beta[i] /= aug[i][i];
  }
  
  const gamma = beta[1]; // coefficient on y_{t-1}
  
  // Compute residuals and SE of gamma
  let sse = 0;
  for (let i = 0; i < X.length; i++) {
    let yHat = 0;
    for (let j = 0; j < k; j++) yHat += X[i][j] * beta[j];
    sse += (Y[i] - yHat) ** 2;
  }
  const s2 = sse / (X.length - k);
  
  // (X'X)^{-1} for SE — invert via augmented identity
  const inv: number[][] = XtX.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => i === j ? 1 : 0)]);
  for (let col = 0; col < k; col++) {
    let maxRow2 = col;
    for (let row = col + 1; row < k; row++) {
      if (Math.abs(inv[row][col]) > Math.abs(inv[maxRow2][col])) maxRow2 = row;
    }
    [inv[col], inv[maxRow2]] = [inv[maxRow2], inv[col]];
    const pivot = inv[col][col];
    if (Math.abs(pivot) < 1e-12) return { stat: 0, pValue: 1, lags: pLag, isStationary: false };
    for (let j = 0; j < 2 * k; j++) inv[col][j] /= pivot;
    for (let row = 0; row < k; row++) {
      if (row === col) continue;
      const factor = inv[row][col];
      for (let j = 0; j < 2 * k; j++) inv[row][j] -= factor * inv[col][j];
    }
  }
  const seGamma = Math.sqrt(s2 * inv[1][k + 1]);
  const tStat = seGamma > 0 ? gamma / seGamma : 0;
  
  // MacKinnon approximate critical values for ADF with constant, no trend
  // Interpolate p-value from critical value table
  // Critical values (constant, no trend): 1%: -3.43, 5%: -2.86, 10%: -2.57
  let pValue: number;
  if (tStat <= -3.43) pValue = 0.005;
  else if (tStat <= -2.86) pValue = 0.01 + (tStat - (-3.43)) / ((-2.86) - (-3.43)) * (0.05 - 0.01);
  else if (tStat <= -2.57) pValue = 0.05 + (tStat - (-2.86)) / ((-2.57) - (-2.86)) * (0.10 - 0.05);
  else if (tStat <= -1.94) pValue = 0.10 + (tStat - (-2.57)) / ((-1.94) - (-2.57)) * (0.30 - 0.10);
  else if (tStat <= -1.62) pValue = 0.30 + (tStat - (-1.94)) / ((-1.62) - (-1.94)) * (0.50 - 0.30);
  else pValue = 0.50 + Math.min(0.49, (tStat - (-1.62)) * 0.15);
  pValue = Math.max(0.001, Math.min(0.99, pValue));
  
  return {
    stat: Math.round(tStat * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    lags: pLag,
    isStationary: pValue < 0.05,
  };
}

// ── Engle-Granger cointegration test ──
// Step 1: OLS regression y = α + β*x + ε
// Step 2: ADF test on residuals ε
// Uses different critical values than standard ADF (more negative)

function cointegrationTest(
  valuesA: number[], valuesB: number[]
): { stat: number; pValue: number; lags: number; isCointegrated: boolean; residuals: number[] } {
  const n = Math.min(valuesA.length, valuesB.length);
  if (n < 30) return { stat: 0, pValue: 1, lags: 0, isCointegrated: false, residuals: [] };
  
  // OLS: A = α + β*B + ε
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += valuesB[i]; sumY += valuesA[i];
    sumXY += valuesB[i] * valuesA[i]; sumXX += valuesB[i] * valuesB[i];
  }
  const mX = sumX / n, mY = sumY / n;
  const ssXX = sumXX - n * mX * mX;
  const ssXY2 = sumXY - n * mX * mY;
  const betaEG = ssXX === 0 ? 0 : ssXY2 / ssXX;
  const alphaEG = mY - betaEG * mX;
  
  // Residuals
  const residuals = new Array(n);
  for (let i = 0; i < n; i++) {
    residuals[i] = valuesA[i] - alphaEG - betaEG * valuesB[i];
  }
  
  // ADF on residuals (use stricter critical values for cointegration)
  const adfResult = adfTest(residuals);
  
  // Engle-Granger critical values (2 variables, constant):
  // 1%: -3.90, 5%: -3.34, 10%: -3.04
  let pValueEG: number;
  if (adfResult.stat <= -3.90) pValueEG = 0.005;
  else if (adfResult.stat <= -3.34) pValueEG = 0.01 + (adfResult.stat - (-3.90)) / ((-3.34) - (-3.90)) * (0.05 - 0.01);
  else if (adfResult.stat <= -3.04) pValueEG = 0.05 + (adfResult.stat - (-3.34)) / ((-3.04) - (-3.34)) * (0.10 - 0.05);
  else if (adfResult.stat <= -2.03) pValueEG = 0.10 + (adfResult.stat - (-3.04)) / ((-2.03) - (-3.04)) * (0.50 - 0.10);
  else pValueEG = 0.50 + Math.min(0.49, (adfResult.stat - (-2.03)) * 0.10);
  pValueEG = Math.max(0.001, Math.min(0.99, pValueEG));
  
  return {
    stat: adfResult.stat,
    pValue: Math.round(pValueEG * 10000) / 10000,
    lags: adfResult.lags,
    isCointegrated: pValueEG < 0.05,
    residuals,
  };
}

// ── Rolling beta (windowed OLS) ──

function rollingBeta(
  x: number[], y: number[], dates: string[], window: number
): { time: string; value: number }[] {
  const result: { time: string; value: number }[] = [];
  for (let i = window - 1; i < x.length; i++) {
    const sliceX = x.slice(i - window + 1, i + 1);
    const sliceY = y.slice(i - window + 1, i + 1);
    const n = sliceX.length;
    let sX = 0, sY = 0, sXY = 0, sXX = 0;
    for (let j = 0; j < n; j++) {
      sX += sliceX[j]; sY += sliceY[j];
      sXY += sliceX[j] * sliceY[j]; sXX += sliceX[j] * sliceX[j];
    }
    const mX = sX / n;
    const denom = sXX - n * mX * mX;
    const beta = denom === 0 ? 0 : (sXY - n * mX * (sY / n)) / denom;
    result.push({ time: dates[i], value: Math.round(beta * 10000) / 10000 });
  }
  return result;
}

// ── Interfaces matching server response shapes ──

export interface PairwiseResult {
  summary: {
    correlation: number;
    spearmanCorrelation: number;
    rSquared: number;
    beta: number;
    alpha: number;
    observations: number;
    mode: string;
    autoCorrelationA: number;
    autoCorrelationB: number;
    effectiveN: number;
    tStat: number;
    pValue: number;
  };
  rolling: { time: string; value: number }[];
  rollingCI: { time: string; upper: number; lower: number }[];
  rollingBeta: { time: string; value: number }[];
  multiWindowRolling: Record<number, { time: string; value: number }[]>;
  crossCorrelation: { lag: number; value: number }[];
  acfA: { lag: number; value: number }[];
  acfB: { lag: number; value: number }[];
  scatter: { x: number; y: number; date: string }[];
  levelsA: { time: string; value: number }[];
  levelsB: { time: string; value: number }[];
  diagnostics: {
    adfA: { stat: number; pValue: number; lags: number; isStationary: boolean };
    adfB: { stat: number; pValue: number; lags: number; isStationary: boolean };
    cointegration: { stat: number; pValue: number; lags: number; isCointegrated: boolean } | null;
    fisherCI: { lower: number; upper: number };
  };
  error?: string;
}

export interface MatrixResult {
  labels: string[];
  matrix: number[][];
  pValues: number[][];
  observations: number;
  dateRange: { from: string; to: string };
  mode: string;
}

// ── Core computation (mirrors server logic exactly) ──

async function computePairwiseStatic(
  specA: string, specB: string, window: number, mode: string
): Promise<PairwiseResult> {
  const [dataA, dataB] = await Promise.all([
    resolveSeriesDataStatic(specA),
    resolveSeriesDataStatic(specB),
  ]);
  const aligned = alignSeries(dataA, dataB);

  if (aligned.dates.length < 10) {
    return {
      summary: { correlation: 0, spearmanCorrelation: 0, rSquared: 0, beta: 0, alpha: 0, observations: aligned.dates.length, mode, autoCorrelationA: 0, autoCorrelationB: 0, effectiveN: 0, tStat: 0, pValue: 1 },
      rolling: [], rollingCI: [], rollingBeta: [], multiWindowRolling: {}, crossCorrelation: [], acfA: [], acfB: [], scatter: [], levelsA: [], levelsB: [],
      diagnostics: { adfA: { stat: 0, pValue: 1, lags: 0, isStationary: false }, adfB: { stat: 0, pValue: 1, lags: 0, isStationary: false }, cointegration: null, fisherCI: { lower: -1, upper: 1 } },
      error: "Insufficient overlapping data",
    };
  }

  let transformedA: number[];
  let transformedB: number[];
  let transformDates: string[];

  if (mode === "returns") {
    transformedA = logReturns(aligned.valuesA);
    transformedB = logReturns(aligned.valuesB);
    transformDates = aligned.dates.slice(1);
  } else if (mode === "changes") {
    transformedA = simpleChanges(aligned.valuesA);
    transformedB = simpleChanges(aligned.valuesB);
    transformDates = aligned.dates.slice(1);
  } else {
    transformedA = aligned.valuesA;
    transformedB = aligned.valuesB;
    transformDates = aligned.dates;
  }

  // Full-sample correlation (Pearson + Spearman)
  const fullCorr = pearsonCorrelation(transformedA, transformedB);
  const fullSpearman = spearmanCorrelation(transformedA, transformedB);
  const adj = adjustedCorrelation(transformedA, transformedB, fullCorr);
  const fullCI = fisherCI(fullCorr, Math.min(transformedA.length, transformedB.length));

  // ACF profiles (lags 1-20)
  const maxLag = 20;
  const acfA: { lag: number; value: number }[] = [];
  const acfB: { lag: number; value: number }[] = [];
  for (let k = 1; k <= maxLag; k++) {
    acfA.push({ lag: k, value: Math.round(autocorrelation(transformedA, k) * 10000) / 10000 });
    acfB.push({ lag: k, value: Math.round(autocorrelation(transformedB, k) * 10000) / 10000 });
  }

  // Rolling correlation
  const rolling: { time: string; value: number }[] = [];
  for (let i = window - 1; i < transformedA.length; i++) {
    const sliceA = transformedA.slice(i - window + 1, i + 1);
    const sliceB = transformedB.slice(i - window + 1, i + 1);
    const corr = pearsonCorrelation(sliceA, sliceB);
    rolling.push({ time: transformDates[i], value: Math.round(corr * 10000) / 10000 });
  }

  // Multi-window rolling
  const windows = [30, 60, 120, 252];
  const multiWindowRolling: Record<number, { time: string; value: number }[]> = {};
  for (const w of windows) {
    const arr: { time: string; value: number }[] = [];
    for (let i = w - 1; i < transformedA.length; i++) {
      const sliceA = transformedA.slice(i - w + 1, i + 1);
      const sliceB = transformedB.slice(i - w + 1, i + 1);
      const corr = pearsonCorrelation(sliceA, sliceB);
      arr.push({ time: transformDates[i], value: Math.round(corr * 10000) / 10000 });
    }
    multiWindowRolling[w] = arr;
  }

  // Rolling CI (Fisher transform 95% confidence band on rolling correlation)
  const rollingCIArr: { time: string; upper: number; lower: number }[] = [];
  for (const pt of rolling) {
    const ci = fisherCI(pt.value, window);
    rollingCIArr.push({ time: pt.time, upper: ci.upper, lower: ci.lower });
  }

  // Rolling beta (windowed OLS: A ~ B)
  const rollingBetaArr = rollingBeta(transformedB, transformedA, transformDates, window);

  // Cross-correlation (lags -20 to +20)
  const crossCorrelation: { lag: number; value: number }[] = [];
  for (let lag = -20; lag <= 20; lag++) {
    let sliceA: number[], sliceB: number[];
    if (lag >= 0) {
      sliceA = transformedA.slice(lag);
      sliceB = transformedB.slice(0, transformedB.length - lag);
    } else {
      sliceA = transformedA.slice(0, transformedA.length + lag);
      sliceB = transformedB.slice(-lag);
    }
    const n = Math.min(sliceA.length, sliceB.length);
    if (n < 10) { crossCorrelation.push({ lag, value: 0 }); continue; }
    crossCorrelation.push({
      lag,
      value: Math.round(pearsonCorrelation(sliceA.slice(0, n), sliceB.slice(0, n)) * 10000) / 10000,
    });
  }

  // OLS regression
  const n = Math.min(transformedA.length, transformedB.length);
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += transformedB[i]; sumY += transformedA[i];
    sumXY += transformedB[i] * transformedA[i]; sumXX += transformedB[i] * transformedB[i];
  }
  const mX = sumX / n; const mY = sumY / n;
  const ssXX = sumXX - n * mX * mX;
  const ssXY2 = sumXY - n * mX * mY;
  const beta = ssXX === 0 ? 0 : ssXY2 / ssXX;
  const alpha = mY - beta * mX;
  const rSquared = fullCorr * fullCorr;

  // Scatter (max 500 points)
  const step = Math.max(1, Math.floor(n / 500));
  const scatter: { x: number; y: number; date: string }[] = [];
  for (let i = 0; i < n; i += step) {
    scatter.push({ x: transformedB[i], y: transformedA[i], date: transformDates[i] });
  }

  // Level series
  const levelsA = aligned.dates.map((d, i) => ({ time: d, value: aligned.valuesA[i] }));
  const levelsB = aligned.dates.map((d, i) => ({ time: d, value: aligned.valuesB[i] }));

  // Stationarity tests (ADF on the transformed series)
  const adfResultA = adfTest(transformedA);
  const adfResultB = adfTest(transformedB);

  // Cointegration test (only meaningful for levels/non-stationary series)
  let cointResult: { stat: number; pValue: number; lags: number; isCointegrated: boolean } | null = null;
  if (mode === "levels" || (!adfResultA.isStationary && !adfResultB.isStationary)) {
    const coint = cointegrationTest(aligned.valuesA, aligned.valuesB);
    cointResult = { stat: coint.stat, pValue: coint.pValue, lags: coint.lags, isCointegrated: coint.isCointegrated };
  }

  return {
    summary: {
      correlation: Math.round(fullCorr * 10000) / 10000,
      spearmanCorrelation: Math.round(fullSpearman * 10000) / 10000,
      rSquared: Math.round(rSquared * 10000) / 10000,
      beta: Math.round(beta * 10000) / 10000,
      alpha: Math.round(alpha * 100000) / 100000,
      observations: n,
      mode,
      autoCorrelationA: acfA[0]?.value || 0,
      autoCorrelationB: acfB[0]?.value || 0,
      effectiveN: adj.effectiveN,
      tStat: adj.tStat,
      pValue: adj.pValue,
    },
    rolling,
    rollingCI: rollingCIArr,
    rollingBeta: rollingBetaArr,
    multiWindowRolling,
    crossCorrelation,
    acfA,
    acfB,
    scatter,
    levelsA,
    levelsB,
    diagnostics: {
      adfA: adfResultA,
      adfB: adfResultB,
      cointegration: cointResult,
      fisherCI: fullCI,
    },
  };
}

async function computeMatrixStatic(
  specs: string[], mode: string, windowParam: string
): Promise<MatrixResult> {
  const window = parseInt(windowParam) || 252;

  // Resolve all series
  const allData = await Promise.all(specs.map(s => resolveSeriesDataStatic(s)));

  // Build common dates
  const dateSets = allData.map(d => new Set(d.map(pt => pt.time)));
  let commonDates = Array.from(dateSets[0]);
  for (let i = 1; i < dateSets.length; i++) {
    commonDates = commonDates.filter(d => dateSets[i].has(d));
  }
  commonDates.sort();

  if (commonDates.length > window) {
    commonDates = commonDates.slice(-window);
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

  // NxN correlation matrix
  const matrix: number[][] = [];
  const pValues: number[][] = [];
  for (let i = 0; i < specs.length; i++) {
    const row: number[] = [];
    const pRow: number[] = [];
    for (let j = 0; j < specs.length; j++) {
      if (i === j) {
        row.push(1);
        pRow.push(0);
      } else {
        const corr = pearsonCorrelation(transformed[i], transformed[j]);
        const adj = adjustedCorrelation(transformed[i], transformed[j], corr);
        row.push(Math.round(corr * 10000) / 10000);
        pRow.push(adj.pValue);
      }
    }
    matrix.push(row);
    pValues.push(pRow);
  }

  return {
    labels: specs,
    matrix,
    pValues,
    observations: transformed[0]?.length || 0,
    dateRange: { from: commonDates[0], to: commonDates[commonDates.length - 1] },
    mode,
  };
}

// ── Public API ──

export async function fetchPairwiseCorrelation(
  specA: string, specB: string, window: number, mode: string
): Promise<PairwiseResult> {
  if (isStaticMode()) {
    return computePairwiseStatic(specA, specB, window, mode);
  }
  const resp = await apiRequest("GET",
    `/api/correlation/pairwise?a=${encodeURIComponent(specA)}&b=${encodeURIComponent(specB)}&window=${window}&mode=${mode}`
  );
  return resp.json();
}

export async function fetchMatrixCorrelation(
  specs: string[], mode: string, window: string | number
): Promise<MatrixResult> {
  if (isStaticMode()) {
    return computeMatrixStatic(specs, mode, String(window));
  }
  const resp = await apiRequest("GET",
    `/api/correlation/matrix?series=${specs.map(s => encodeURIComponent(s)).join(",")}&mode=${mode}&window=${window}`
  );
  return resp.json();
}
