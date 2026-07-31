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
  /** Shrunk rank key: edge · √(min(n,40)/40). NaN when insufficient. */
  score: number;
  insufficient: boolean;
  lastEvent: (InflectionEvent & { dailyDate: string }) | null;
  barsSinceLast: number;
}

const SHRINK_N = 40;

export function evalConfig(
  data: SlopeSeriesData,
  params: MaSlopeParams,
  primaryHorizonBars: number,
  minEvents = 10,
): ConfigEval {
  const series = computeMaSlopeSeries(data.closes, params, { highs: data.highs, lows: data.lows });
  const horizons = SLOPE_HORIZONS[data.freq].map((h) => h.bars);
  const bundle = { dates: data.dailyDates, closes: data.closes as (number | null)[] };

  const hitsOf = (kind: "slope" | "curvature", direction: "up" | "down") =>
    series.events
      .filter((e) => e.kind === kind && e.direction === direction)
      .map((e) => ({ idx: e.idx, val: e.slope }));

  const upStudy = runEventStudy(bundle, hitsOf("slope", "up"), { horizons });
  const downStudy = runEventStudy(bundle, hitsOf("slope", "down"), { horizons });
  const curvUpStudy = params.detectCurvature ? runEventStudy(bundle, hitsOf("curvature", "up"), { horizons }) : null;
  const curvDownStudy = params.detectCurvature ? runEventStudy(bundle, hitsOf("curvature", "down"), { horizons }) : null;

  const nUp = upStudy.events.length;
  const nDown = downStudy.events.length;

  const upStats = statsAt(upStudy, primaryHorizonBars);
  const downStats = statsAt(downStudy, primaryHorizonBars);
  const upBase = baselineAt(upStudy, primaryHorizonBars);
  const upEdge = upStats && upBase && upStats.count > 0 ? upStats.mean - upBase.mean : NaN;
  const downEdge = downStats && upBase && downStats.count > 0 ? upBase.mean - downStats.mean : NaN;

  const side: "up" | "down" =
    Number.isFinite(upEdge) && (!Number.isFinite(downEdge) || upEdge >= downEdge) ? "up" : "down";
  const edge = side === "up" ? upEdge : downEdge;
  const sideStats = side === "up" ? upStats : downStats;
  const n = sideStats?.count ?? 0;
  const insufficient = n < minEvents;
  const score = !insufficient && Number.isFinite(edge) ? edge * Math.sqrt(Math.min(n, SHRINK_N) / SHRINK_N) : NaN;

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
  onProgress?: (done: number, total: number) => void;
  cancelRef?: { current: boolean };
}

/** Grid-sweep types × periods on one ticker; sorted by score desc (ranked
 *  configs first, insufficient-sample configs trail in input order). */
export async function runDeepDiveSweep(opts: SweepOpts): Promise<ConfigEval[]> {
  const { data, types, periods, baseParams, primaryHorizonBars, minEvents = 10, onProgress, cancelRef } = opts;
  const out: ConfigEval[] = [];
  const total = types.length * periods.length;
  let done = 0;
  for (const maType of types) {
    for (const period of periods) {
      if (cancelRef?.current) return out;
      // Skip configs whose warmup would consume most of the series.
      if (period * 3 + 20 < data.closes.length) {
        out.push(evalConfig(data, { ...baseParams, maType, period }, primaryHorizonBars, minEvents));
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
  hourlyConcurrency?: number;
  onRow?: (row: ScanRow) => void;
  onProgress?: (done: number, total: number) => void;
  cancelRef?: { current: boolean };
}

async function scanOne(
  ticker: string,
  opts: ScanOpts,
): Promise<ScanRow> {
  const { freq, mode, primaryHorizonBars, minEvents = 10, freshBars = 3 } = opts;
  const data = await loadSlopeSeries(ticker, freq).catch(() => null);
  if (!data) return { ticker, status: freq === "hourly" ? "no-hourly" : "no-data", best: null, fresh: false };

  let best: ConfigEval | null = null;
  if (mode.kind === "fixed") {
    best = evalConfig(data, mode.params, primaryHorizonBars, minEvents);
  } else {
    for (const maType of mode.types) {
      for (const period of mode.periods) {
        if (opts.cancelRef?.current) break;
        if (period * 3 + 20 >= data.closes.length) continue;
        const ev = evalConfig(data, { ...mode.baseParams, maType, period }, primaryHorizonBars, minEvents);
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
