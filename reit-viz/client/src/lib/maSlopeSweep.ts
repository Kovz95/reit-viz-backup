// Sweep + scan kernels for the MA slope inflection analysis.
//
// evalConfig runs one (MA type, period, detection params) config on one
// ticker's series: detect inflections, then event-study each side (up events
// = long side, down = short/avoid side) via the shared runEventStudy kernel,
// which supplies per-horizon stats, an unconditional baseline, the
// distribution, and the event-aligned average path.
//
// Ranking: edge = event mean − baseline mean at the primary horizon on the
// stronger side, shrunk by √(min(n,40)/40) so a 5-event fluke can't outrank a
// 40-event edge. Configs with n < minEvents are reported but flagged
// insufficient — pages grey them out and never rank them.

import { runEventStudy, type StudyResult, type HorizonStats } from "@/lib/eventStudy";
import {
  computeMaSlopeSeries,
  configKey,
  type InflectionEvent,
  type MaSlopeParams,
  type SlopeFreq,
} from "@/lib/maSlope";
import { loadSlopeSeries, SLOPE_HORIZONS, BARS_PER_YEAR, type SlopeSeriesData } from "@/lib/maSlopeData";
import type { MaType } from "@/lib/maEngine";

export function tStatOf(s: HorizonStats | undefined): number {
  if (!s || s.count < 2 || !Number.isFinite(s.std) || s.std <= 0) return NaN;
  return s.mean / (s.std / Math.sqrt(s.count));
}

export function statsAt(study: StudyResult, horizonBars: number): HorizonStats | undefined {
  return study.stats.find((s) => s.horizon === horizonBars);
}

export function baselineAt(study: StudyResult, horizonBars: number): HorizonStats | undefined {
  return study.baseline.find((s) => s.horizon === horizonBars);
}

export interface ConfigEval {
  maType: MaType;
  period: number;
  freq: SlopeFreq;
  params: MaSlopeParams;
  key: string;
  /** All detected inflections + the daily calendar date of each (index-aligned).
   *  The full per-bar series is deliberately NOT retained — a universe scan or
   *  216-config sweep holding every MA/slope array would cost tens of MB. */
  events: InflectionEvent[];
  eventDates: string[];
  upStudy: StudyResult;
  downStudy: StudyResult;
  curvUpStudy: StudyResult | null;
  curvDownStudy: StudyResult | null;
  nUp: number;
  nDown: number;
  /** Events per year (slope events only), for signal-frequency context. */
  eventsPerYear: number;
  /** Stronger side at the primary horizon: up-side edge vs inverted down-side edge. */
  side: "up" | "down";
  /** Event mean − baseline mean (%) at the primary horizon, on `side`
   *  (down-side edge is baseline − event: a good down signal predicts underperformance). */
  edge: number;
  tStat: number;
  /** Shrunk rank key: edge · √(min(n,40)/40). NaN when insufficient.
   *  With a holdout split, side/edge/tStat/score come from the TRAIN window. */
  score: number;
  insufficient: boolean;
  /** Out-of-sample check (null when the split is off). Ranking uses train
   *  only; the holdout window reports whether the edge persisted unseen. */
  holdout: {
    splitDate: string;
    trainN: number;
    hoN: number;
    hoEdge: number;
    hoT: number;
    /** hoEdge > 0 on the train-chosen side; null when hoN is too small to say. */
    confirmed: boolean | null;
  } | null;
  lastEvent: (InflectionEvent & { dailyDate: string }) | null;
  barsSinceLast: number;
}

const SHRINK_N = 40;
/** Below this many holdout events, "confirmed" is not worth calling. */
const MIN_HOLDOUT_N = 3;

/** Edge on a side at a horizon: event mean − baseline mean for up events,
 *  baseline − event for down (a good down signal predicts underperformance). */
function sideEdge(study: StudyResult, side: "up" | "down", horizonBars: number): { edge: number; stats: HorizonStats | undefined } {
  const stats = statsAt(study, horizonBars);
  const base = baselineAt(study, horizonBars);
  if (!stats || !base || stats.count === 0 || !Number.isFinite(base.mean)) return { edge: NaN, stats };
  return { edge: side === "up" ? stats.mean - base.mean : base.mean - stats.mean, stats };
}

export function evalConfig(
  data: SlopeSeriesData,
  params: MaSlopeParams,
  primaryHorizonBars: number,
  minEvents = 10,
  holdoutFrac = 0,
): ConfigEval {
  const series = computeMaSlopeSeries(data.closes, params, { highs: data.highs, lows: data.lows });
  const horizons = SLOPE_HORIZONS[data.freq].map((h) => h.bars);
  const bundle = { dates: data.dailyDates, closes: data.closes as (number | null)[] };

  const hitsOf = (kind: "slope" | "curvature", direction: "up" | "down") =>
    series.events
      .filter((e) => e.kind === kind && e.direction === direction)
      .map((e) => ({ idx: e.idx, val: e.slope }));

  const upHits = hitsOf("slope", "up");
  const downHits = hitsOf("slope", "down");
  const upStudy = runEventStudy(bundle, upHits, { horizons });
  const downStudy = runEventStudy(bundle, downHits, { horizons });
  const curvUpStudy = params.detectCurvature ? runEventStudy(bundle, hitsOf("curvature", "up"), { horizons }) : null;
  const curvDownStudy = params.detectCurvature ? runEventStudy(bundle, hitsOf("curvature", "down"), { horizons }) : null;

  const nUp = upStudy.events.length;
  const nDown = downStudy.events.length;

  // ── Rank basis: full sample, or the train window when a split is on ──
  // Detection ran causally on the full series, so events are identical either
  // way; the split only partitions which events (and which baseline bars) the
  // ranking may see. Train forward windows are truncated at the split — an
  // event whose horizon crosses into the holdout is scored only on what the
  // train window contains, never on holdout bars.
  const n = data.closes.length;
  const splitIdx = holdoutFrac > 0 ? Math.floor(n * (1 - holdoutFrac)) : n;
  const maxH = Math.max(...horizons);
  const splitUsable = holdoutFrac > 0 && splitIdx > maxH * 2 && n - splitIdx > maxH;

  let rankUpStudy = upStudy;
  let rankDownStudy = downStudy;
  let holdout: ConfigEval["holdout"] = null;
  let hoUpStudy: StudyResult | null = null;
  let hoDownStudy: StudyResult | null = null;
  if (splitUsable) {
    const trainBundle = { dates: data.dailyDates.slice(0, splitIdx), closes: data.closes.slice(0, splitIdx) as (number | null)[] };
    const hoBundle = { dates: data.dailyDates.slice(splitIdx), closes: data.closes.slice(splitIdx) as (number | null)[] };
    const before = (hits: typeof upHits) => hits.filter((h) => h.idx < splitIdx);
    const after = (hits: typeof upHits) => hits.filter((h) => h.idx >= splitIdx).map((h) => ({ idx: h.idx - splitIdx, val: h.val }));
    rankUpStudy = runEventStudy(trainBundle, before(upHits), { horizons });
    rankDownStudy = runEventStudy(trainBundle, before(downHits), { horizons });
    hoUpStudy = runEventStudy(hoBundle, after(upHits), { horizons });
    hoDownStudy = runEventStudy(hoBundle, after(downHits), { horizons });
  }

  const up = sideEdge(rankUpStudy, "up", primaryHorizonBars);
  const down = sideEdge(rankDownStudy, "down", primaryHorizonBars);
  const side: "up" | "down" =
    Number.isFinite(up.edge) && (!Number.isFinite(down.edge) || up.edge >= down.edge) ? "up" : "down";
  const edge = side === "up" ? up.edge : down.edge;
  const sideStats = side === "up" ? up.stats : down.stats;
  const nRank = sideStats?.count ?? 0;
  const insufficient = nRank < minEvents;
  const score = !insufficient && Number.isFinite(edge) ? edge * Math.sqrt(Math.min(nRank, SHRINK_N) / SHRINK_N) : NaN;

  if (splitUsable && hoUpStudy && hoDownStudy) {
    const hoStudy = side === "up" ? hoUpStudy : hoDownStudy;
    const ho = sideEdge(hoStudy, side, primaryHorizonBars);
    const hoN = ho.stats?.count ?? 0;
    holdout = {
      splitDate: data.dailyDates[splitIdx] ?? "",
      trainN: nRank,
      hoN,
      hoEdge: ho.edge,
      hoT: tStatOf(ho.stats),
      confirmed: hoN >= MIN_HOLDOUT_N && Number.isFinite(ho.edge) ? ho.edge > 0 : null,
    };
  }

  const slopeEvents = series.events.filter((e) => e.kind === "slope");
  const last = slopeEvents.length ? slopeEvents[slopeEvents.length - 1] : null;
  const validBars = data.closes.length - Math.max(0, series.warmupIdx);
  const eventsPerYear = validBars > 0 ? (slopeEvents.length / validBars) * BARS_PER_YEAR[data.freq] : 0;

  return {
    maType: params.maType,
    period: params.period,
    freq: data.freq,
    params,
    key: configKey(params, data.freq),
    events: series.events,
    eventDates: series.events.map((e) => data.dailyDates[e.idx] ?? ""),
    upStudy,
    downStudy,
    curvUpStudy,
    curvDownStudy,
    nUp,
    nDown,
    eventsPerYear,
    side,
    edge,
    tStat: tStatOf(sideStats),
    score,
    insufficient,
    holdout,
    lastEvent: last ? { ...last, dailyDate: data.dailyDates[last.idx] ?? "" } : null,
    barsSinceLast: last ? data.closes.length - 1 - last.idx : Infinity,
  };
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export interface SweepOpts {
  data: SlopeSeriesData;
  types: MaType[];
  periods: number[];
  baseParams: Omit<MaSlopeParams, "maType" | "period">;
  primaryHorizonBars: number;
  minEvents?: number;
  /** Fraction of the series (from the end) reserved as an out-of-sample
   *  holdout; 0 disables the split. */
  holdoutFrac?: number;
  onProgress?: (done: number, total: number) => void;
  cancelRef?: { current: boolean };
}

/** Grid-sweep types × periods on one ticker; sorted by score desc (ranked
 *  configs first, insufficient-sample configs trail in input order). */
export async function runDeepDiveSweep(opts: SweepOpts): Promise<ConfigEval[]> {
  const { data, types, periods, baseParams, primaryHorizonBars, minEvents = 10, holdoutFrac = 0, onProgress, cancelRef } = opts;
  const out: ConfigEval[] = [];
  const total = types.length * periods.length;
  let done = 0;
  for (const maType of types) {
    for (const period of periods) {
      if (cancelRef?.current) return out;
      // Skip configs whose warmup would consume most of the series.
      if (period * 3 + 20 < data.closes.length) {
        out.push(evalConfig(data, { ...baseParams, maType, period }, primaryHorizonBars, minEvents, holdoutFrac));
      }
      done++;
      if (done % 12 === 0) {
        onProgress?.(done, total);
        await yieldToUi();
      }
    }
  }
  onProgress?.(total, total);
  out.sort((a, b) => {
    if (a.insufficient !== b.insufficient) return a.insufficient ? 1 : -1;
    const as = Number.isFinite(a.score) ? a.score : -Infinity;
    const bs = Number.isFinite(b.score) ? b.score : -Infinity;
    return bs - as;
  });
  return out;
}

// ── Methodology shootout ─────────────────────────────────────────────────────
// Run the full type×period sweep once per methodology combo so estimators can
// be compared head-to-head under the identical backtest/holdout discipline.
// 7 distinct combos, not 3×2×2 = 12: under the t-stat gate, detection runs on
// the regression t-statistic alone — measure and normalization don't affect
// the event stream — so all t-stat variants collapse into one.
export const SHOOTOUT_COMBOS: Array<{
  key: string;
  label: string;
  overrides: Partial<Pick<MaSlopeParams, "measure" | "normalization" | "thresholdMode">>;
}> = [
  { key: "diff-ma", label: "diff · MA-level", overrides: { measure: "diff", normalization: "ma", thresholdMode: "mad" } },
  { key: "regress-ma", label: "regress · MA-level", overrides: { measure: "regress", normalization: "ma", thresholdMode: "mad" } },
  { key: "kalman-ma", label: "kalman · MA-level", overrides: { measure: "kalman", normalization: "ma", thresholdMode: "mad" } },
  { key: "diff-atr", label: "diff · ATR", overrides: { measure: "diff", normalization: "atr", thresholdMode: "mad" } },
  { key: "regress-atr", label: "regress · ATR", overrides: { measure: "regress", normalization: "atr", thresholdMode: "mad" } },
  { key: "kalman-atr", label: "kalman · ATR", overrides: { measure: "kalman", normalization: "atr", thresholdMode: "mad" } },
  { key: "tstat", label: "t-stat gate", overrides: { measure: "regress", normalization: "ma", thresholdMode: "tstat" } },
];

export interface ShootoutSummary {
  /** Configs that met the min-event bar and were ranked. */
  ranked: number;
  /** Of the ranked, holdout verdicts (null when the split is off or hoN too small). */
  oosConfirmed: number;
  oosRejected: number;
  oosUncalled: number;
  /** Median holdout edge across ranked configs with a finite hoEdge. */
  medianHoEdge: number;
  best: ConfigEval | null;
}

export interface ShootoutResult {
  key: string;
  label: string;
  overrides: (typeof SHOOTOUT_COMBOS)[number]["overrides"];
  results: ConfigEval[];
  summary: ShootoutSummary;
}

function summarizeShootout(results: ConfigEval[]): ShootoutSummary {
  const ranked = results.filter((r) => !r.insufficient);
  let oosConfirmed = 0, oosRejected = 0, oosUncalled = 0;
  const hoEdges: number[] = [];
  for (const r of ranked) {
    if (r.holdout?.confirmed === true) oosConfirmed++;
    else if (r.holdout?.confirmed === false) oosRejected++;
    else oosUncalled++;
    if (r.holdout && Number.isFinite(r.holdout.hoEdge)) hoEdges.push(r.holdout.hoEdge);
  }
  hoEdges.sort((a, b) => a - b);
  const medianHoEdge = hoEdges.length
    ? hoEdges.length % 2 ? hoEdges[hoEdges.length >> 1] : (hoEdges[hoEdges.length / 2 - 1] + hoEdges[hoEdges.length / 2]) / 2
    : NaN;
  return { ranked: ranked.length, oosConfirmed, oosRejected, oosUncalled, medianHoEdge, best: results[0] ?? null };
}

export interface ShootoutOpts extends Omit<SweepOpts, "onProgress"> {
  onProgress?: (comboIdx: number, comboTotal: number, done: number, total: number) => void;
}

/** Full sweep per methodology combo; combo order matches SHOOTOUT_COMBOS. */
export async function runMethodologyShootout(opts: ShootoutOpts): Promise<ShootoutResult[]> {
  const out: ShootoutResult[] = [];
  for (let c = 0; c < SHOOTOUT_COMBOS.length; c++) {
    if (opts.cancelRef?.current) break;
    const combo = SHOOTOUT_COMBOS[c];
    const results = await runDeepDiveSweep({
      ...opts,
      baseParams: { ...opts.baseParams, ...combo.overrides },
      onProgress: (done, total) => opts.onProgress?.(c, SHOOTOUT_COMBOS.length, done, total),
    });
    out.push({ key: combo.key, label: combo.label, overrides: combo.overrides, results, summary: summarizeShootout(results) });
  }
  return out;
}

export interface ScanRow {
  ticker: string;
  status: "ok" | "no-data" | "no-hourly";
  best: ConfigEval | null;
  /** Fresh = last slope inflection within freshBars bars. */
  fresh: boolean;
}

export type ScanMode =
  | { kind: "fixed"; params: MaSlopeParams }
  | { kind: "auto"; types: MaType[]; periods: number[]; baseParams: Omit<MaSlopeParams, "maType" | "period"> };

export interface ScanOpts {
  tickers: string[];
  freq: SlopeFreq;
  mode: ScanMode;
  freshBars?: number;
  primaryHorizonBars: number;
  minEvents?: number;
  /** See SweepOpts.holdoutFrac. */
  holdoutFrac?: number;
  hourlyConcurrency?: number;
  onRow?: (row: ScanRow) => void;
  onProgress?: (done: number, total: number) => void;
  cancelRef?: { current: boolean };
}

async function scanOne(
  ticker: string,
  opts: ScanOpts,
): Promise<ScanRow> {
  const { freq, mode, primaryHorizonBars, minEvents = 10, freshBars = 3, holdoutFrac = 0 } = opts;
  const data = await loadSlopeSeries(ticker, freq).catch(() => null);
  if (!data) return { ticker, status: freq === "hourly" ? "no-hourly" : "no-data", best: null, fresh: false };

  let best: ConfigEval | null = null;
  if (mode.kind === "fixed") {
    best = evalConfig(data, mode.params, primaryHorizonBars, minEvents, holdoutFrac);
  } else {
    for (const maType of mode.types) {
      for (const period of mode.periods) {
        if (opts.cancelRef?.current) break;
        if (period * 3 + 20 >= data.closes.length) continue;
        const ev = evalConfig(data, { ...mode.baseParams, maType, period }, primaryHorizonBars, minEvents, holdoutFrac);
        const evScore = Number.isFinite(ev.score) ? ev.score : -Infinity;
        const bestScore = best && Number.isFinite(best.score) ? best.score : -Infinity;
        if (!best || (best.insufficient && !ev.insufficient) || (ev.insufficient === best.insufficient && evScore > bestScore)) {
          best = ev;
        }
      }
    }
  }
  const fresh = !!best && best.barsSinceLast <= freshBars;
  return { ticker, status: "ok", best, fresh };
}

/** Scan a universe. daily/weekly run sequentially (IDB-cached fetches);
 *  hourly uses a small promise pool (network-heavy). Rows stream via onRow. */
export async function runUniverseScan(opts: ScanOpts): Promise<ScanRow[]> {
  const { tickers, freq, hourlyConcurrency = 3, onRow, onProgress, cancelRef } = opts;
  const rows: ScanRow[] = [];
  let done = 0;
  const finish = (row: ScanRow) => {
    rows.push(row);
    done++;
    onRow?.(row);
    onProgress?.(done, tickers.length);
  };

  if (freq !== "hourly") {
    for (const ticker of tickers) {
      if (cancelRef?.current) break;
      finish(await scanOne(ticker, opts));
      await yieldToUi();
    }
    return rows;
  }

  let next = 0;
  const workers = Array.from({ length: Math.max(1, hourlyConcurrency) }, async () => {
    while (next < tickers.length && !cancelRef?.current) {
      const ticker = tickers[next++];
      finish(await scanOne(ticker, opts));
      await yieldToUi();
    }
  });
  await Promise.all(workers);
  return rows;
}
