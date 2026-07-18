// Price-return attribution: decompose a total price move into the change in a
// valuation multiple vs the change in the underlying estimate, using the identity
//   Δln(P) = Δln(M) + Δln(E)   where P = M × E (price = multiple × estimate).
//
// Shared by the /attribution page (single-ticker charts + universe table) and the
// /ranking page (optional per-ticker attribution columns). The pure math lives
// here so both consume one implementation.

export type BasisMode = "auto" | "FFO" | "EPS";

export interface BasisDef {
  multiple: string;
  estimate: string;
  label: string;
}

export interface AlignedData {
  dates: string[];
  close: number[];
  multiple: number[];
  estimate: number[];
}

export interface AttributionRow {
  ticker: string;
  basis: string;
  totalPct: number;
  multiplePct: number;
  estimatePct: number;
  multipleShare: number;
  estimateShare: number;
  sameDirection: boolean;
}

// Multiple/estimate pairs. FFO basis for REITs; EPS basis as the generic fallback.
export const BASIS_DEFS: Record<"FFO" | "EPS", BasisDef> = {
  FFO: { multiple: "P/FFO FY2", estimate: "FFO FY2", label: "P/FFO × FFO FY2" },
  EPS: { multiple: "P/E FY2", estimate: "EPS FY2", label: "P/E × EPS FY2" },
};

export const WINDOW_OPTIONS = [
  { label: "1M", days: 21 }, { label: "3M", days: 63 }, { label: "6M", days: 126 },
  { label: "YTD", days: 0 }, { label: "1Y", days: 252 }, { label: "2Y", days: 504 },
  { label: "3Y", days: 756 }, { label: "5Y", days: 1260 },
];

// Inner-join close/multiple/estimate on their common dates, dropping non-finite
// or non-positive points (logs require > 0).
export function alignData(
  close: Array<{ time: string; value: number }>,
  multiple: Array<{ time: string; value: number }>,
  estimate: Array<{ time: string; value: number }>
): AlignedData {
  const multMap = new Map<string, number>();
  for (const p of multiple) if (Number.isFinite(p.value) && p.value > 0) multMap.set(p.time, p.value);
  const estMap = new Map<string, number>();
  for (const p of estimate) if (Number.isFinite(p.value) && p.value > 0) estMap.set(p.time, p.value);
  const dates: string[] = [], closes: number[] = [], mults: number[] = [], ests: number[] = [];
  for (const p of close) {
    if (!Number.isFinite(p.value) || p.value <= 0) continue;
    const m = multMap.get(p.time), e = estMap.get(p.time);
    if (m === undefined || e === undefined) continue;
    dates.push(p.time); closes.push(p.value); mults.push(m); ests.push(e);
  }
  return { dates, close: closes, multiple: mults, estimate: ests };
}

// Resolve the window-start index. windowDays === 0 means YTD (first date of the
// final year); otherwise it's `windowDays` trading days before the last point.
export function getStartIndex(dates: string[], windowDays: number): number {
  if (!dates.length) return 0;
  if (windowDays === 0) {
    const year = dates[dates.length - 1].slice(0, 4);
    for (let i = dates.length - 1; i >= 0; i--) if (dates[i].slice(0, 4) !== year) return i;
    return 0;
  }
  return Math.max(0, dates.length - 1 - windowDays);
}

// Decompose the [start, end] move for one ticker. `end` is the last aligned point,
// so trim the aligned series to an as-of date beforehand if you need a fixed end.
export function computeAttributionRow(ticker: string, basis: string, data: AlignedData, windowDays: number): AttributionRow | null {
  if (data.dates.length < 2) return null;
  const startIdx = getStartIndex(data.dates, windowDays);
  const endIdx = data.dates.length - 1;
  if (startIdx >= endIdx) return null;
  const c0 = data.close[startIdx], c1 = data.close[endIdx];
  const m0 = data.multiple[startIdx], m1 = data.multiple[endIdx];
  const e0 = data.estimate[startIdx], e1 = data.estimate[endIdx];
  if ([c0, c1, m0, m1, e0, e1].some(v => !Number.isFinite(v))) return null;
  const multPct = Math.log(m1 / m0) * 100;
  const estPct = Math.log(e1 / e0) * 100;
  const sumAbs = Math.abs(multPct) + Math.abs(estPct);
  const multipleShare = sumAbs > 0 ? Math.abs(multPct) / sumAbs : 0;
  const estimateShare = sumAbs > 0 ? Math.abs(estPct) / sumAbs : 0;
  return {
    ticker, basis,
    totalPct: (c1 / c0 - 1) * 100,
    multiplePct: multPct,
    estimatePct: estPct,
    multipleShare,
    estimateShare,
    sameDirection: Math.sign(multPct) === Math.sign(estPct) && multPct !== 0,
  };
}
