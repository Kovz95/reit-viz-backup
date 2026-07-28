// clipArraysByDateRange — reconstructed from its Combo Optimizer call sites
// (the original module was lost with the recovered bundle and the page carried
// a stub returning EMPTY arrays, which silently reduced every optimizer run to
// zero bars → "no results" with no error).
//
// Clips a sorted YYYY-MM-DD date axis to [range.start, range.end] and slices
// every parallel array to the same window. Missing/invalid bounds are open.

export interface ClipResult {
  dates: string[];
  arrays: any[][];
}

export function clipArraysByDateRange(
  dates: string[],
  range: { start?: Date | string | null; end?: Date | string | null } | null | undefined,
  ...arrays: (any[] | undefined)[]
): ClipResult {
  const safeArrays = arrays.map((a) => (Array.isArray(a) ? a : []));
  if (!Array.isArray(dates) || dates.length === 0) {
    return { dates: [], arrays: safeArrays.map(() => []) };
  }
  const toIso = (v: Date | string | null | undefined): string | null => {
    if (!v) return null;
    if (typeof v === "string") return v.slice(0, 10);
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    return null;
  };
  const lo = toIso(range?.start);
  const hi = toIso(range?.end);
  let a = 0;
  let b = dates.length;
  if (lo) while (a < b && dates[a] < lo) a++;
  if (hi) while (b > a && dates[b - 1] > hi) b--;
  return {
    dates: dates.slice(a, b),
    arrays: safeArrays.map((arr) => arr.slice(a, b)),
  };
}
