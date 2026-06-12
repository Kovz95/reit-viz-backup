// Hand-written stub
export function computePeerDelta(
  targetSeries: number[],
  groupSeries: number[],
  mode: "pct" | "abs" = "pct"
): number[] {
  if (!targetSeries || !groupSeries) return [];
  const len = Math.min(targetSeries.length, groupSeries.length);
  const result: number[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const t = targetSeries[i];
    const g = groupSeries[i];
    if (t == null || g == null || !Number.isFinite(t) || !Number.isFinite(g)) {
      result[i] = 0;
    } else if (mode === "pct") {
      result[i] = g !== 0 ? (t - g) / Math.abs(g) : 0;
    } else {
      result[i] = t - g;
    }
  }
  return result;
}
