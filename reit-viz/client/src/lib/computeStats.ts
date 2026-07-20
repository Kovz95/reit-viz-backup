// Descriptive statistics / correlation helper used by PremiumDiscount.
//
// Call-site note: PremiumDiscount calls `computeStats(a, b) as any as number`
// with TWO {time,value}[] series and uses the result as their Pearson
// correlation — so the two-argument form returns a number, while the
// single-argument form returns the full SeriesStats object.

export interface SeriesStats {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  count: number;
  /** Skewness */
  skew: number;
  /** Excess kurtosis */
  kurt: number;
}

type Point = { time?: string; value: number };

function toValues(input: any): number[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v: any) => (typeof v === "number" ? v : v?.value))
    .filter((v: any) => Number.isFinite(v));
}

function alignedPairs(a: any[], b: any[]): [number[], number[]] {
  const aPts = a.filter((p: any) => p && typeof p === "object" && Number.isFinite(p.value));
  const bPts = b.filter((p: any) => p && typeof p === "object" && Number.isFinite(p.value));
  if (aPts.length && bPts.length && aPts[0].time != null && bPts[0].time != null) {
    const bMap = new Map<string, number>((bPts as Point[]).map((p) => [p.time!, p.value]));
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of aPts as Point[]) {
      const bv = bMap.get(p.time!);
      if (bv !== undefined) { xs.push(p.value); ys.push(bv); }
    }
    return [xs, ys];
  }
  // plain number arrays: align by index
  const xs = toValues(a);
  const ys = toValues(b);
  const n = Math.min(xs.length, ys.length);
  return [xs.slice(0, n), ys.slice(0, n)];
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; syy += ys[i] * ys[i];
  }
  const cov = sxy - (sx * sy) / n;
  const denom = Math.sqrt((sxx - (sx * sx) / n) * (syy - (sy * sy) / n));
  return denom === 0 ? NaN : cov / denom;
}

/**
 * Single series → descriptive stats. Two series → Pearson correlation
 * (aligned by time when the elements are {time, value} points).
 */
export function computeStats(values: any, valuesB?: any): SeriesStats {
  if (Array.isArray(valuesB)) {
    const [xs, ys] = alignedPairs(values, valuesB);
    return pearson(xs, ys) as unknown as SeriesStats;
  }

  const vals = toValues(values).slice().sort((a, b) => a - b);
  const count = vals.length;
  if (count === 0) {
    return { mean: 0, median: 0, stddev: 0, min: 0, max: 0, count: 0, skew: 0, kurt: 0 };
  }
  const mean = vals.reduce((s, v) => s + v, 0) / count;
  const mid = count >> 1;
  const median = count % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of vals) {
    const d = v - mean;
    m2 += d * d; m3 += d * d * d; m4 += d * d * d * d;
  }
  m2 /= count; m3 /= count; m4 /= count;
  const stddev = Math.sqrt(m2);
  const skew = stddev > 0 ? m3 / stddev ** 3 : 0;
  const kurt = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;
  return { mean, median, stddev, min: vals[0], max: vals[count - 1], count, skew, kurt };
}
