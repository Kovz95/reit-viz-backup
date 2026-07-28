/**
 * rangeSearch.worker — reconstructed compute kernel for the Range Optimizer.
 *
 * The original worker chunk (rangeSearch.worker-DWovBQhj.js) was lost with the
 * recovered bundle, which left the page's Run hanging forever (the hard-coded
 * hashed URL 404s into the SPA's index.html and the worker fails to compile).
 * This reimplements the search from the page's fully-visible contract
 * (RangeOptimizer.tsx: payload construction in the run handlers, RangeResult /
 * Band consumed by BandTable, dispatchWorker's message protocol).
 *
 * Protocol:
 *   in:  { type: "run", id, payload }
 *   out: { id, type: "progress", done, total }
 *        { id, type: "result", result: RangeResult }
 *        { id, type: "error", error }
 *
 * Search: for every combination of `comboSize` features, bucket each feature
 * into `bins` quantile bins (edges from the eligible sample — the TRAIN
 * segment when walk-forward is on; per-dataset in pool mode so every ticker is
 * measured against its own history). Every bucket-combo cell is a candidate
 * band; a band qualifies when hits ≥ minHits and |mean − baseline| ≥ minLift.
 * Positive-lift bands are longs, negative shorts. All return figures are
 * FRACTIONS (the page multiplies by 100 for display).
 */

type FeatureSpec = { label: string; fmt?: string };

interface DatasetIn {
  ticker?: string;
  closes: number[];
  dates: string[];
  featureSeriesFlat: Float64Array;
  featureSeriesLen: number;
}

interface Payload {
  mode: "single" | "pool";
  features: FeatureSpec[];
  horizonDays: number;
  bins: number;
  comboSize: number;
  minHits: number;
  minLift: number;
  warmupBars: number;
  walkForward?: { enabled: boolean; trainPct: number };
  single?: DatasetIn;
  pool?: DatasetIn[];
}

interface BandPart { display: string }
interface Band {
  parts: BandPart[];
  hits: number;
  winRate: number;
  meanReturn: number;
  medianReturn: number;
  stdReturn: number;
  lift: number;
  tStat: number;
  lastDate?: string;
  currentlyIn?: boolean;
  oosHits?: number;
  oosMean?: number;
  oosLift?: number;
  oosWinRate?: number;
}

interface RangeResult {
  longs: Band[];
  shorts: Band[];
  baselineMean: number;
  baselineStd: number;
  baselineN: number;
  totalBuckets: number;
  walkForward?: boolean;
  oosBaselineMean?: number;
  oosBaselineN?: number;
  longsByTicker?: [number, string[]][];
  shortsByTicker?: [number, string[]][];
}

const MAX_BANDS_PER_SIDE = 500;

function fmtVal(v: number, fmt?: string): string {
  if (!Number.isFinite(v)) return "·";
  if (fmt === "pct") return (v * 100).toFixed(1) + "%";
  if (fmt === "num0") return v.toFixed(0);
  return v.toFixed(2);
}

/** k-combinations of [0..n) */
function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k <= 0 || k > n) return out;
  for (;;) {
    out.push([...idx]);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

/** Quantile bin edges (bins−1 inner edges) from a sample. */
function quantileEdges(sample: number[], bins: number): number[] {
  const s = [...sample].sort((a, b) => a - b);
  const edges: number[] = [];
  for (let k = 1; k < bins; k++) {
    const pos = (k / bins) * (s.length - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    edges.push(s[lo] + (s[hi] - s[lo]) * (pos - lo));
  }
  return edges;
}

function bucketOf(v: number, edges: number[]): number {
  let b = 0;
  while (b < edges.length && v >= edges[b]) b++;
  return b;
}

interface Prepared {
  ticker?: string;
  dates: string[];
  fwd: Float64Array;            // forward return at t (NaN when unavailable)
  feat: Float64Array;           // flat features
  len: number;
  eligible: number[];           // ts with fwd + all-feature finiteness handled per-combo
  trainEnd: number;             // eligible index cutoff for walk-forward (exclusive); = eligible.length when off
  lastT: number;                // last bar index (for currentlyIn)
}

function prepare(ds: DatasetIn, nFeatures: number, horizon: number, warmup: number, trainPct: number | null): Prepared {
  const len = ds.featureSeriesLen;
  const closes = ds.closes;
  const fwd = new Float64Array(len).fill(NaN);
  for (let t = 0; t < len - horizon; t++) {
    const a = closes[t], b = closes[t + horizon];
    if (Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0) fwd[t] = b / a - 1;
  }
  const eligible: number[] = [];
  for (let t = warmup; t < len; t++) {
    if (Number.isFinite(fwd[t])) eligible.push(t);
  }
  const trainEnd = trainPct == null ? eligible.length : Math.max(1, Math.floor(eligible.length * trainPct));
  return { ticker: ds.ticker, dates: ds.dates, fwd, feat: ds.featureSeriesFlat, len, eligible, trainEnd, lastT: len - 1 };
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (!data || data.type !== "run") return;
  const { id, payload } = data as { id: number; payload: Payload };
  try {
    const result = run(payload, (done, total) => {
      (self as any).postMessage({ id, type: "progress", done, total });
    });
    (self as any).postMessage({ id, type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ id, type: "error", error: String(err?.message ?? err) });
  }
};

function run(p: Payload, onProgress: (done: number, total: number) => void): RangeResult {
  const nF = p.features.length;
  const bins = Math.max(2, p.bins | 0);
  const comboSize = Math.max(1, Math.min(p.comboSize | 0, nF));
  const wf = !!p.walkForward?.enabled;
  const trainPct = wf ? Math.min(0.95, Math.max(0.05, p.walkForward!.trainPct)) : null;

  const datasets: Prepared[] = (p.mode === "pool" ? (p.pool ?? []) : [p.single!])
    .filter(Boolean)
    .map((ds) => prepare(ds, nF, p.horizonDays, p.warmupBars, trainPct));
  if (!datasets.length) throw new Error("No datasets to search.");
  const isPool = p.mode === "pool" && datasets.length > 0;

  // Baselines over all eligible train/test returns.
  let bSum = 0, bSumSq = 0, bN = 0, oSum = 0, oN = 0;
  for (const d of datasets) {
    d.eligible.forEach((t, ei) => {
      const r = d.fwd[t];
      if (ei < d.trainEnd) { bSum += r; bSumSq += r * r; bN++; }
      else { oSum += r; oN++; }
    });
  }
  if (bN < 5) throw new Error("Not enough eligible bars after warmup for this horizon.");
  const baselineMean = bSum / bN;
  const baselineStd = Math.sqrt(Math.max(0, bSumSq / bN - baselineMean * baselineMean));
  const oosBaselineMean = oN > 0 ? oSum / oN : 0;

  const combos = combinations(nF, comboSize);
  const cellsPerCombo = Math.pow(bins, comboSize);
  const totalBuckets = combos.length * cellsPerCombo;

  interface CellAgg {
    rets: number[];
    oosRets: number[];
    lastDate?: string;
    nowTickers: string[];
    currentlyIn: boolean;
    comboIdx: number;
    cellCode: number;
    // display ranges from the FIRST dataset (single mode) — pool shows quantile labels
    ranges: { lo: number; hi: number }[] | null;
  }

  const longs: Band[] = [];
  const shorts: Band[] = [];

  combos.forEach((combo, comboIdx) => {
    // Per-dataset quantile edges for each feature in the combo (train sample).
    const cells = new Map<number, CellAgg>();

    for (const d of datasets) {
      const edgesPerFeat: number[][] = [];
      let ok = true;
      for (const fi of combo) {
        const off = fi * d.len;
        const sample: number[] = [];
        for (let ei = 0; ei < d.trainEnd; ei++) {
          const v = d.feat[off + d.eligible[ei]];
          if (Number.isFinite(v)) sample.push(v);
        }
        if (sample.length < bins * 4) { ok = false; break; }
        edgesPerFeat.push(quantileEdges(sample, bins));
      }
      if (!ok) continue;

      const codeAt = (t: number): number => {
        let code = 0;
        for (let ci = 0; ci < combo.length; ci++) {
          const v = d.feat[combo[ci] * d.len + t];
          if (!Number.isFinite(v)) return -1;
          code = code * bins + bucketOf(v, edgesPerFeat[ci]);
        }
        return code;
      };

      d.eligible.forEach((t, ei) => {
        const code = codeAt(t);
        if (code < 0) return;
        let cell = cells.get(code);
        if (!cell) {
          cell = { rets: [], oosRets: [], nowTickers: [], currentlyIn: false, comboIdx, cellCode: code, ranges: null, lastDate: undefined };
          cells.set(code, cell);
        }
        if (ei < d.trainEnd) cell.rets.push(d.fwd[t]);
        else cell.oosRets.push(d.fwd[t]);
        const date = d.dates[t];
        if (date && (!cell.lastDate || date > cell.lastDate)) cell.lastDate = date;
      });

      // current-bar membership (uses the very last bar, even without a forward return)
      const nowCode = codeAt(d.lastT);
      if (nowCode >= 0) {
        let cell = cells.get(nowCode);
        if (!cell) {
          cell = { rets: [], oosRets: [], nowTickers: [], currentlyIn: false, comboIdx, cellCode: nowCode, ranges: null, lastDate: undefined };
          cells.set(nowCode, cell);
        }
        cell.currentlyIn = true;
        if (d.ticker) cell.nowTickers.push(d.ticker);
      }

      // numeric display ranges from the first (or only) dataset
      if (!isPool || datasets.length === 1) {
        for (const [code, cell] of cells) {
          if (cell.ranges) continue;
          const ranges: { lo: number; hi: number }[] = [];
          let rem = code;
          const idxs: number[] = [];
          for (let ci = combo.length - 1; ci >= 0; ci--) { idxs[ci] = rem % bins; rem = Math.floor(rem / bins); }
          for (let ci = 0; ci < combo.length; ci++) {
            const edges = edgesPerFeat[ci];
            const b = idxs[ci];
            ranges.push({ lo: b === 0 ? -Infinity : edges[b - 1], hi: b === bins - 1 ? Infinity : edges[b] });
          }
          cell.ranges = ranges;
        }
      }
    }

    // Score cells → bands
    for (const cell of cells.values()) {
      const n = cell.rets.length;
      if (n < p.minHits) continue;
      let sum = 0;
      for (const r of cell.rets) sum += r;
      const mean = sum / n;
      const lift = mean - baselineMean;
      if (Math.abs(lift) < p.minLift) continue;
      let ss = 0, wins = 0;
      for (const r of cell.rets) { ss += (r - mean) * (r - mean); if (r > 0) wins++; }
      const std = Math.sqrt(ss / Math.max(1, n - 1));
      const sorted = [...cell.rets].sort((a, b) => a - b);
      const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      const tStat = std > 0 ? lift / (std / Math.sqrt(n)) : 0;

      // decode cell → parts
      const idxs: number[] = [];
      let rem = cell.cellCode;
      for (let ci = combo.length - 1; ci >= 0; ci--) { idxs[ci] = rem % bins; rem = Math.floor(rem / bins); }
      const parts: BandPart[] = combo.map((fi, ci) => {
        const f = p.features[fi];
        const b = idxs[ci];
        if (cell.ranges) {
          const { lo, hi } = cell.ranges[ci];
          const loS = lo === -Infinity ? "" : fmtVal(lo, f.fmt);
          const hiS = hi === Infinity ? "" : fmtVal(hi, f.fmt);
          const range = lo === -Infinity ? `≤ ${hiS}` : hi === Infinity ? `≥ ${loS}` : `${loS} – ${hiS}`;
          return { display: `${f.label} ${range}  (Q${b + 1}/${bins})` };
        }
        return { display: `${f.label} Q${b + 1}/${bins} (per-ticker)` };
      });

      const band: Band = {
        parts,
        hits: n,
        winRate: wins / n,
        meanReturn: mean,
        medianReturn: median,
        stdReturn: std,
        lift,
        tStat,
        lastDate: cell.lastDate,
        currentlyIn: cell.currentlyIn,
      };
      if (wf) {
        const on = cell.oosRets.length;
        band.oosHits = on;
        if (on > 0) {
          let os = 0, ow = 0;
          for (const r of cell.oosRets) { os += r; if (r > 0) ow++; }
          const om = os / on;
          band.oosMean = om;
          band.oosLift = om - oosBaselineMean;
          band.oosWinRate = ow / on;
        }
      }

      (band as any).__nowTickers = isPool ? [...new Set(cell.nowTickers)] : undefined;
      if (lift > 0) longs.push(band);
      else shorts.push(band);
    }

    onProgress(comboIdx + 1, combos.length);
  });

  // Rank + cap; rebuild the by-ticker maps keyed by post-sort index (the page
  // keys currentTickersByIdx by the band's index in the returned array).
  longs.sort((a, b) => b.lift - a.lift);
  shorts.sort((a, b) => a.lift - b.lift);
  const longsOut = longs.slice(0, MAX_BANDS_PER_SIDE);
  const shortsOut = shorts.slice(0, MAX_BANDS_PER_SIDE);
  const lbt: [number, string[]][] = [];
  const sbt: [number, string[]][] = [];
  if (isPool) {
    longsOut.forEach((b, i) => {
      const t = (b as any).__nowTickers as string[] | undefined;
      if (t?.length) lbt.push([i, t]);
    });
    shortsOut.forEach((b, i) => {
      const t = (b as any).__nowTickers as string[] | undefined;
      if (t?.length) sbt.push([i, t]);
    });
  }
  for (const b of [...longsOut, ...shortsOut]) delete (b as any).__nowTickers;

  const result: RangeResult = {
    longs: longsOut,
    shorts: shortsOut,
    baselineMean,
    baselineStd,
    baselineN: bN,
    totalBuckets,
  };
  if (wf) {
    result.walkForward = true;
    result.oosBaselineMean = oosBaselineMean;
    result.oosBaselineN = oN;
  }
  if (isPool) {
    result.longsByTicker = lbt;
    result.shortsByTicker = sbt;
  }
  return result;
}

export {};
