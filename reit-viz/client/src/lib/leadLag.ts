/**
 * Shared lead-lag / cross-correlation helpers.
 *
 * Powers the Correlation lead-lag tools in the Pairs & Formula sidebar
 * (transforms → shift → align → rolling/horizon correlation) plus preset
 * persistence. Lifted from the old Quick Analyze rolling-correlation view so
 * the logic lives in one place.
 */
import type { TV, Aligned } from "./pairMath";
import type { DataTransform } from "./transforms";

export interface LagRow {
  k: number;
  n: number;
  r: number;
}

/** Lags (bars) sampled for the full-sample horizon grid. */
export const HORIZON_LAGS = [-252, -126, -63, -21, -5, -1, 0, 1, 5, 21, 63, 126, 252];

/** Window presets for transforms (days); 0 = expanding. */
export const TRANSFORM_WINDOWS = [63, 126, 252, 504, 0];

/** positive-k shift = A shifted forward (r>0 at +k ⇒ A leads B). */
export function shiftSeries(arr: TV[], k: number): TV[] {
  if (k === 0 || arr.length === 0) return arr;
  const len = arr.length;
  if (Math.abs(k) >= len) return [];
  if (k > 0) {
    const out: TV[] = [];
    for (let i = 0; i + k < len; i++) {
      out.push({ time: arr[i + k].time, value: arr[i].value });
    }
    return out;
  }
  const neg = -k;
  const out: TV[] = [];
  for (let i = neg; i < len; i++) {
    out.push({ time: arr[i - neg].time, value: arr[i].value });
  }
  return out;
}

/**
 * Inner-join two series by time. Unlike pairMath.alignSeries this does NOT
 * drop non-positive values, so it works on transformed inputs (z-scores and
 * percentiles, which can be ≤ 0).
 */
export function alignByTime(a: TV[], b: TV[]): Aligned[] {
  const mapB = new Map(b.map((d) => [d.time, d.value]));
  const out: Aligned[] = [];
  for (const d of a) {
    const bv = mapB.get(d.time);
    if (bv !== undefined && Number.isFinite(d.value) && Number.isFinite(bv)) {
      out.push({ time: d.time, a: d.value, b: bv });
    }
  }
  return out;
}

/** Pearson correlation over aligned a/b fields; NaN if n < 3. */
export function pearsonAligned(al: Aligned[]): number {
  const n = al.length;
  if (n < 3) return NaN;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += al[i].a;
    sumB += al[i].b;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = al[i].a - meanA;
    const db = al[i].b - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom > 0 ? cov / denom : NaN;
}

/** Full-sample r at each HORIZON_LAGS lag (A shifted). a/b already transformed. */
export function computeHorizonGrid(a: TV[], b: TV[]): LagRow[] {
  if (!a.length || !b.length) return [];
  return HORIZON_LAGS.map((lag) => {
    const al = alignByTime(shiftSeries(a, lag), b);
    return al.length < 10
      ? { k: lag, n: al.length, r: NaN }
      : { k: lag, n: al.length, r: pearsonAligned(al) };
  });
}

/** Sweep lags in [-max, max]; return every row plus the lag with max |r|. */
export function computeLagScan(
  a: TV[],
  b: TV[],
  lagMax: number,
): { rows: LagRow[]; bestK: number } {
  const max = Math.max(1, Math.min(252, Math.round(lagMax)));
  const rows: LagRow[] = [];
  for (let k = -max; k <= max; k++) {
    const al = alignByTime(shiftSeries(a, k), b);
    const r = al.length >= 10 ? pearsonAligned(al) : NaN;
    rows.push({ k, n: al.length, r });
  }
  let bestK = 0;
  let bestAbs = -1;
  for (const row of rows) {
    if (Number.isFinite(row.r) && Math.abs(row.r) > bestAbs) {
      bestAbs = Math.abs(row.r);
      bestK = row.k;
    }
  }
  return { rows, bestK };
}

// ---------------------------------------------------------------------------
// Preset persistence (Pairs & Formula correlation lead-lag)
// ---------------------------------------------------------------------------

export interface PairsCorrPreset {
  id: string;
  name: string;
  createdAt: number;
  legA: string;
  metricA: string;
  legB: string;
  metricB: string;
  tfA: DataTransform;
  tfB: DataTransform;
  tfWinA: number;
  tfWinB: number;
  lagBars: number;
  lagMax: number;
  corrWindow: number;
}

const PRESETS_KEY = "reit-viz:pairs-corr-presets:v1";

export function loadPairsCorrPresets(): PairsCorrPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (p) =>
            p &&
            typeof p.id === "string" &&
            typeof p.name === "string" &&
            typeof p.legA === "string" &&
            typeof p.legB === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function savePairsCorrPresets(presets: PairsCorrPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* ignore quota / unavailable */
  }
}

export function listPairsCorrPresets(): PairsCorrPreset[] {
  return loadPairsCorrPresets().sort((a, b) => b.createdAt - a.createdAt);
}

function newPresetId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `pc_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function upsertPairsCorrPreset(
  partial: Omit<PairsCorrPreset, "id" | "createdAt"> & { id?: string },
): PairsCorrPreset {
  const presets = loadPairsCorrPresets();
  const id = partial.id ?? newPresetId();
  const idx = presets.findIndex((p) => p.id === id);
  const next: PairsCorrPreset = { id, createdAt: Date.now(), ...partial };
  if (idx >= 0) presets[idx] = next;
  else presets.push(next);
  savePairsCorrPresets(presets);
  return next;
}

export function deletePairsCorrPreset(id: string): void {
  savePairsCorrPresets(loadPairsCorrPresets().filter((p) => p.id !== id));
}
