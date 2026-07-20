// Rolling Pearson correlation between two {time,value}[] series, used by
// PremiumDiscount. Returns a {time,value}[] series (consumers plot it and
// build Map(p.time → p.value) from it), only for positions with a full window.
//
// `lag` shifts series B: at lag k, a[t] is correlated with b[t-k] over the
// aligned time axis (positive lag = B leads).

type Point = { time: string; value: number };

export function computeRollingCorr(
  seriesA: any[],
  seriesB: any[],
  window: number,
  lag = 0
): Point[] {
  if (!Array.isArray(seriesA) || !Array.isArray(seriesB) || !(window > 1)) return [];
  const bMap = new Map<string, number>();
  for (const p of seriesB) {
    if (p && Number.isFinite(p.value)) bMap.set(p.time, p.value);
  }
  // Align on A's time axis where both have values
  const times: string[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of seriesA) {
    if (!p || !Number.isFinite(p.value)) continue;
    const bv = bMap.get(p.time);
    if (bv === undefined) continue;
    times.push(p.time);
    xs.push(p.value);
    ys.push(bv);
  }
  const n = times.length;
  const k = Math.round(lag) || 0;
  if (n < window + Math.abs(k)) return [];

  const out: Point[] = [];
  for (let i = window - 1 + Math.max(0, k); i < n; i++) {
    // window of a[i-window+1..i] vs b shifted by lag
    let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    let ok = true;
    for (let j = 0; j < window; j++) {
      const ai = i - window + 1 + j;
      const bi = ai - k;
      if (bi < 0 || bi >= n) { ok = false; break; }
      const x = xs[ai];
      const y = ys[bi];
      sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y;
    }
    if (!ok) continue;
    const cov = sxy - (sx * sy) / window;
    const denom = Math.sqrt((sxx - (sx * sx) / window) * (syy - (sy * sy) / window));
    if (denom > 0) out.push({ time: times[i], value: cov / denom });
  }
  return out;
}
