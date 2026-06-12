/**
 * Shared pair / derived-series computations.
 * Used by CorrelationPickerPanel, PairsPickerPanel, and the dedicated Pairs tab.
 */

export type TV = { time: string; value: number };
export type Aligned = { time: string; a: number; b: number };

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Align two time-series by date (inner join, skipping zeros / negatives) */
export function alignSeries(a: TV[], b: TV[]): Aligned[] {
  const mapB = new Map(b.map(d => [d.time, d.value]));
  const result: Aligned[] = [];
  for (const d of a) {
    const bVal = mapB.get(d.time);
    if (bVal !== undefined && bVal !== 0 && d.value > 0 && bVal > 0) {
      result.push({ time: d.time, a: d.value, b: bVal });
    }
  }
  return result;
}

// ── Core ──

export function computeRatio(al: Aligned[]): TV[] {
  return al.map(d => ({ time: d.time, value: d.a / d.b }));
}

export function computeLogRatio(al: Aligned[]): TV[] {
  return al.map(d => ({ time: d.time, value: r4(Math.log(d.a / d.b)) }));
}

export function computeSpread(al: Aligned[]): TV[] {
  return al.map(d => ({ time: d.time, value: d.a - d.b }));
}

// ── Z-Scores ──

/** Rolling z-score of log(A/B) */
export function computeLogRatioZScore(al: Aligned[], win: number): TV[] {
  const lr = al.map(d => Math.log(d.a / d.b));
  const result: TV[] = [];
  for (let i = win - 1; i < lr.length; i++) {
    let sum = 0, sumSq = 0;
    for (let j = i - win + 1; j <= i; j++) { sum += lr[j]; sumSq += lr[j] ** 2; }
    const mean = sum / win;
    const std = Math.sqrt(Math.max(0, sumSq / win - mean ** 2));
    result.push({ time: al[i].time, value: r4(std === 0 ? 0 : (lr[i] - mean) / std) });
  }
  return result;
}

/** Spread Z: rolling beta on log prices → spread → z-score */
export function computeSpreadZ(al: Aligned[], betaLookback: number, spreadZWindow: number): TV[] {
  if (al.length < betaLookback) return [];
  const logA = al.map(d => Math.log(d.a));
  const logB = al.map(d => Math.log(d.b));
  const rollingSpread: { time: string; value: number }[] = [];
  for (let i = betaLookback - 1; i < logA.length; i++) {
    let sX = 0, sY = 0, sXY = 0, sXX = 0;
    for (let j = i - betaLookback + 1; j <= i; j++) {
      sX += logB[j]; sY += logA[j]; sXY += logB[j] * logA[j]; sXX += logB[j] * logB[j];
    }
    const mX = sX / betaLookback, mY = sY / betaLookback;
    const dXX = sXX - betaLookback * mX * mX;
    const dXY = sXY - betaLookback * mX * mY;
    const b = dXX === 0 ? 1 : dXY / dXX;
    rollingSpread.push({ time: al[i].time, value: logA[i] - b * logB[i] });
  }
  const result: TV[] = [];
  for (let i = spreadZWindow - 1; i < rollingSpread.length; i++) {
    let sum = 0, sumSq = 0;
    for (let j = i - spreadZWindow + 1; j <= i; j++) {
      sum += rollingSpread[j].value; sumSq += rollingSpread[j].value ** 2;
    }
    const mean = sum / spreadZWindow;
    const std = Math.sqrt(Math.max(0, sumSq / spreadZWindow - mean ** 2));
    result.push({ time: rollingSpread[i].time, value: r4(std === 0 ? 0 : (rollingSpread[i].value - mean) / std) });
  }
  return result;
}

/** OLS Residual Z: rolling OLS with intercept on log prices */
export function computeOlsResidZ(al: Aligned[], olsWindow: number): TV[] {
  if (al.length < olsWindow) return [];
  const logA = al.map(d => Math.log(d.a));
  const logB = al.map(d => Math.log(d.b));
  const result: TV[] = [];
  for (let i = olsWindow - 1; i < logA.length; i++) {
    let sX = 0, sY = 0, sXY = 0, sXX = 0;
    for (let j = i - olsWindow + 1; j <= i; j++) {
      sX += logB[j]; sY += logA[j]; sXY += logB[j] * logA[j]; sXX += logB[j] * logB[j];
    }
    const n = olsWindow, mX = sX / n, mY = sY / n;
    const dXX = sXX - n * mX * mX, dXY = sXY - n * mX * mY;
    const beta = dXX === 0 ? 1 : dXY / dXX;
    const alpha = mY - beta * mX;
    let sumResidSq = 0;
    for (let j = i - olsWindow + 1; j <= i; j++) {
      const resid = logA[j] - (alpha + beta * logB[j]);
      sumResidSq += resid * resid;
    }
    const residStd = Math.sqrt(sumResidSq / n);
    const currentResid = logA[i] - (alpha + beta * logB[i]);
    result.push({ time: al[i].time, value: r4(residStd === 0 ? 0 : currentResid / residStd) });
  }
  return result;
}

/** Historical percentile rank of ratio (0-100) */
export function computePercentileRank(ratio: TV[]): TV[] {
  const result: TV[] = [];
  const sorted: number[] = [];
  const binaryInsert = (arr: number[], val: number) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid] < val) lo = mid + 1; else hi = mid; }
    arr.splice(lo, 0, val);
  };
  const binaryRank = (arr: number[], val: number): number => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid] <= val) lo = mid + 1; else hi = mid; }
    return lo;
  };
  for (let i = 0; i < ratio.length; i++) {
    binaryInsert(sorted, ratio[i].value);
    const rank = binaryRank(sorted, ratio[i].value);
    result.push({ time: ratio[i].time, value: Math.round((rank / sorted.length) * 10000) / 100 });
  }
  return result;
}

// ── Stats ──

/** Rolling Pearson correlation of two aligned series */
export function computeRollingCorrelation(al: Aligned[], win: number): TV[] {
  const result: TV[] = [];
  for (let i = win - 1; i < al.length; i++) {
    let sA = 0, sB = 0, sAB = 0, sAA = 0, sBB = 0;
    for (let j = i - win + 1; j <= i; j++) {
      sA += al[j].a; sB += al[j].b;
      sAB += al[j].a * al[j].b;
      sAA += al[j].a * al[j].a;
      sBB += al[j].b * al[j].b;
    }
    const n = win;
    const mA = sA / n, mB = sB / n;
    const ssAA = sAA - n * mA * mA;
    const ssBB = sBB - n * mB * mB;
    const ssAB = sAB - n * mA * mB;
    const denom = Math.sqrt(ssAA * ssBB);
    result.push({ time: al[i].time, value: r4(denom === 0 ? 0 : ssAB / denom) });
  }
  return result;
}

/** Beta-Adjusted Spread: full-sample OLS residual on log prices */
export function computeBetaAdjSpread(al: Aligned[]): TV[] {
  if (al.length < 10) return [];
  const logA = al.map(d => Math.log(d.a));
  const logB = al.map(d => Math.log(d.b));
  let sX = 0, sY = 0, sXY = 0, sXX = 0;
  for (let i = 0; i < al.length; i++) {
    sX += logB[i]; sY += logA[i]; sXY += logB[i] * logA[i]; sXX += logB[i] * logB[i];
  }
  const n = al.length, mX = sX / n, mY = sY / n;
  const dXX = sXX - n * mX * mX, dXY = sXY - n * mX * mY;
  const hedgeRatio = dXX === 0 ? 1 : dXY / dXX;
  const alpha = mY - hedgeRatio * mX;
  return al.map((d, i) => ({
    time: d.time,
    value: r4(logA[i] - hedgeRatio * logB[i] - alpha),
  }));
}

/** Rolling beta (OLS of log returns A on B) */
export function computeRollingBeta(al: Aligned[], win: number): TV[] {
  const retA: TV[] = [], retB: TV[] = [];
  for (let i = 1; i < al.length; i++) {
    retA.push({ time: al[i].time, value: Math.log(al[i].a / al[i - 1].a) });
    retB.push({ time: al[i].time, value: Math.log(al[i].b / al[i - 1].b) });
  }
  const result: TV[] = [];
  for (let i = win - 1; i < retA.length; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let j = i - win + 1; j <= i; j++) {
      sumX += retB[j].value; sumY += retA[j].value;
      sumXY += retB[j].value * retA[j].value; sumXX += retB[j].value * retB[j].value;
    }
    const n = win, meanX = sumX / n;
    const ssXX = sumXX - n * meanX * meanX;
    const ssXY = sumXY - n * meanX * (sumY / n);
    result.push({ time: retA[i].time, value: r4(ssXX === 0 ? 0 : ssXY / ssXX) });
  }
  return result;
}

/** Rolling R² from OLS of log returns A on B */
export function computeRollingR2(al: Aligned[], win: number): TV[] {
  const retA: TV[] = [], retB: TV[] = [];
  for (let i = 1; i < al.length; i++) {
    retA.push({ time: al[i].time, value: Math.log(al[i].a / al[i - 1].a) });
    retB.push({ time: al[i].time, value: Math.log(al[i].b / al[i - 1].b) });
  }
  const result: TV[] = [];
  for (let i = win - 1; i < retA.length; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    for (let j = i - win + 1; j <= i; j++) {
      const x = retB[j].value, y = retA[j].value;
      sumX += x; sumY += y; sumXY += x * y; sumXX += x * x; sumYY += y * y;
    }
    const n = win, meanX = sumX / n, meanY = sumY / n;
    const ssXX = sumXX - n * meanX * meanX;
    const ssYY = sumYY - n * meanY * meanY;
    const ssXY = sumXY - n * meanX * meanY;
    const r2 = (ssXX === 0 || ssYY === 0) ? 0 : (ssXY * ssXY) / (ssXX * ssYY);
    result.push({ time: retA[i].time, value: r4(r2) });
  }
  return result;
}

// ── Master derived-type definitions ──

export type DerivedType =
  | "correlation"
  | "ratio" | "logRatio" | "spread"
  | "zscore" | "spreadZ" | "olsResidZ" | "percentile"
  | "beta" | "betaAdjSpread" | "r2";

export interface DerivedDef {
  type: DerivedType;
  label: string;
  tip: string;
  group: "Core" | "Z-Score" | "Stats";
}

export const DERIVED_DEFS: DerivedDef[] = [
  // Core
  { type: "ratio", label: "A/B", tip: "Ratio (A ÷ B)", group: "Core" },
  { type: "logRatio", label: "ln(A/B)", tip: "Log ratio", group: "Core" },
  { type: "spread", label: "A−B", tip: "Spread (A − B)", group: "Core" },
  // Z-Scores
  { type: "zscore", label: "Z-Score", tip: "Z-score of log(A/B)", group: "Z-Score" },
  { type: "spreadZ", label: "Spread Z", tip: "Spread Z (rolling-β adjusted)", group: "Z-Score" },
  { type: "olsResidZ", label: "OLS Resid Z", tip: "OLS Residual Z-score", group: "Z-Score" },
  { type: "percentile", label: "Percentile", tip: "Historical percentile rank of ratio", group: "Z-Score" },
  // Stats
  { type: "correlation", label: "Correlation", tip: "Rolling Pearson correlation", group: "Stats" },
  { type: "beta", label: "Beta", tip: "Rolling beta (OLS log returns)", group: "Stats" },
  { type: "r2", label: "R²", tip: "Rolling R² (OLS log returns)", group: "Stats" },
  { type: "betaAdjSpread", label: "β-Adj Spread", tip: "Beta-adjusted spread (full-sample OLS residual)", group: "Stats" },
];

export const DERIVED_GROUPS = ["Core", "Z-Score", "Stats"] as const;

/** Compute a derived series given type, aligned data, and rolling window */
export function computeDerived(type: DerivedType, al: Aligned[], win: number): TV[] {
  switch (type) {
    case "correlation": return computeRollingCorrelation(al, win);
    case "ratio": return computeRatio(al);
    case "logRatio": return computeLogRatio(al);
    case "spread": return computeSpread(al);
    case "zscore": return computeLogRatioZScore(al, win);
    case "spreadZ": return computeSpreadZ(al, win, Math.max(8, Math.round(win / 8)));
    case "olsResidZ": return computeOlsResidZ(al, win);
    case "percentile": {
      const ratio = computeRatio(al);
      return computePercentileRank(ratio);
    }
    case "beta": return computeRollingBeta(al, win);
    case "r2": return computeRollingR2(al, win);
    case "betaAdjSpread": return computeBetaAdjSpread(al);
    default: return [];
  }
}

/** Color palette for derived series */
const DERIVED_COLORS = ["#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#06b6d4", "#84cc16", "#f43f5e"];
let colorIdx = 0;
export function nextDerivedColor(): string {
  return DERIVED_COLORS[colorIdx++ % DERIVED_COLORS.length];
}
