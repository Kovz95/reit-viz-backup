// Universal Hit-Rate Screener — sweep engine.
//
// Orchestrates a Run: fetches each subject's series, evaluates every enabled
// catalog signal × preset × direction through the shared backtest kernel
// (buildBacktestResult — the same kernel every optimizer page uses), and
// qualifies setups by hit rate + occurrence count + firing frequency.
//
// Main-thread batched async (no web worker): the workload is fetch-dominated
// and per-subject compute is tens of ms — the same regime SetupsScreener
// handles with batches and Promise.all. Backtests run WITHOUT a benchmark
// series so hit rates are absolute-return based, matching the optimizers'
// default semantics.

import { buildBacktestResult, type HorizonRow } from "@/components/EvaluatorPanel";
import { evaluateForwardStats, type MtfHorizon } from "@/lib/mtfEngine";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { fetchOhlcSeries } from "@/lib/fetchOhlcSeries";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { getMetricSeries } from "@/lib/dataService";
import {
  signalsForBundle,
  requiredValuationMetrics,
  type CatalogSignal,
  type SeriesBundle,
  type SignalDirection,
  type SignalFamily,
} from "@/lib/universalSignalCatalog";

export interface SweepSettings {
  mode: "single" | "pair" | "both";
  /** Bar frequency the whole sweep runs on. Weekly/monthly resample every
   *  bundle (price + valuation series) to period-end bars before detection,
   *  and horizons are measured in bars of that frequency via the bar-agnostic
   *  MTF kernel (the shared daily kernel's horizons are hardwired). */
  barMode?: "daily" | "weekly" | "monthly";
  /** HORIZONS label the qualification reads (1W/2W/1M/3M/6M/1Y). */
  horizon: string;
  /** Strict > threshold on the horizon hit rate. */
  hitRateThreshold: number;
  minOccurrences: number;
  /** Signals must have fired at least this often per year of series span. */
  freqFloorPerYear: number;
  /**
   * Family override: valuation extremes (±1.5–2σ multiple z-scores) rarely
   * fire quarterly per ticker, so they get their own, lower floor.
   */
  valuationFreqFloorPerYear: number;
  /**
   * Target favorable excursion in PERCENT units for the UI (5 = +5%); the
   * sweep converts to the kernel's fraction convention (0.05) at the call.
   * A "hit" = the trade saw a ≥ targetPct% favorable move within the horizon.
   */
  targetPct: number;
  cooldown: number;
  /** "Firing now" = last signal within this many bars of the series end. */
  firingLookbackBars: number;
  families: SignalFamily[];
  enabledSignalIds: string[];
  pairCohortDim: "subindustry" | "industry" | "sector";
  /**
   * Where the pair list comes from: all within-cohort combinations, or the
   * cointegration screen's survivors (/api/pairs-screen, isCointegrated ===
   * true, ranked by ADF p-value; resolved at Run time).
   */
  pairSource: "cohort" | "cointegration";
  maxPairs: number;
  minYearsData: number;
}

export const DEFAULT_SWEEP_SETTINGS: SweepSettings = {
  mode: "single",
  barMode: "daily",
  horizon: "3M",
  hitRateThreshold: 0.5,
  minOccurrences: 8,
  freqFloorPerYear: 4,
  valuationFreqFloorPerYear: 2,
  targetPct: 5,
  cooldown: 10,
  firingLookbackBars: 5,
  families: ["technical", "event", "valuation", "pair"],
  enabledSignalIds: [],
  pairCohortDim: "subindustry",
  pairSource: "cohort",
  maxPairs: 400,
  minYearsData: 2,
};

export interface SweepProgress {
  done: number;
  total: number;
  subject?: string;
}

export interface QualifiedSetup {
  /** `${subject}|${signalId}|${presetId}|${direction}` */
  key: string;
  subject: string;
  mode: "single" | "pair";
  family: SignalFamily;
  signalId: string;
  signalLabel: string;
  presetId: string;
  paramsLabel: string;
  direction: SignalDirection;
  horizon: string;
  hitRate: number;
  winRate: number;
  avgReturn: number;
  medianReturn: number;
  tStat: number;
  occurrences: number;
  freqPerYear: number;
  firstSignalDate: string | null;
  lastSignalDate: string | null;
  lastSignalBarsAgo: number | null;
  firingNow: boolean;
  allHorizons: HorizonRow[];
  /** Most recent signal dates (≤ 20) for chart hand-off. */
  recentSignalDates: string[];
}

type Subject =
  | { kind: "single"; ticker: string }
  | { kind: "pair"; a: string; b: string };

function subjectLabel(s: Subject): string {
  return s.kind === "single" ? s.ticker : `${s.a}/${s.b}`;
}

// ---------------------------------------------------------------------------
// Bundle building
// ---------------------------------------------------------------------------

/** Forward-fill a sparse {time,value}[] metric series onto the price dates. */
function alignMetricToDates(
  pts: { time: string; value: number }[],
  dates: string[],
): (number | null)[] {
  const out: (number | null)[] = new Array(dates.length).fill(null);
  if (pts.length === 0) return out;
  const sorted = [...pts].sort((a, b) => (a.time < b.time ? -1 : 1));
  let p = 0;
  let last: number | null = null;
  for (let i = 0; i < dates.length; i++) {
    while (p < sorted.length && sorted[p].time <= dates[i]) {
      if (Number.isFinite(sorted[p].value)) last = sorted[p].value;
      p++;
    }
    out[i] = last;
  }
  return out;
}

async function buildSingleBundle(
  ticker: string,
  minBars: number,
  valuationMetrics: string[] = [],
): Promise<SeriesBundle | null> {
  let dates: string[] = [];
  let opens: number[] | undefined;
  let highs: number[] | undefined;
  let lows: number[] | undefined;
  let closes: number[] = [];
  let volumes: number[] | undefined;

  try {
    const r = await fetchTickerOHLCV(ticker);
    if (r.dates.length > 0) {
      dates = r.dates;
      opens = r.opens;
      highs = r.highs;
      lows = r.lows;
      closes = r.adjCloses.length === r.dates.length ? r.adjCloses : r.closes;
      volumes = r.volumes;
    }
  } catch {
    /* fall through to fallback */
  }

  if (dates.length === 0) {
    try {
      const r = await fetchOhlcSeries(ticker);
      dates = r.dates;
      opens = r.opens;
      highs = r.highs;
      lows = r.lows;
      closes = r.closes;
      volumes = undefined; // fetchOhlcSeries volumes are always 0 — don't pretend
    } catch {
      return null;
    }
  }

  if (dates.length < minBars) return null;
  if (volumes && !volumes.some((v) => v > 0)) volumes = undefined;

  let valuation: SeriesBundle["valuation"];
  if (valuationMetrics.length > 0) {
    const fetched = await Promise.all(
      valuationMetrics.map(async (m) => {
        try {
          const pts = await getMetricSeries(ticker, m);
          return [m, alignMetricToDates(pts ?? [], dates)] as const;
        } catch {
          return [m, null] as const;
        }
      }),
    );
    for (const [m, series] of fetched) {
      if (series && series.some((v) => v !== null)) {
        valuation = valuation ?? {};
        valuation[m] = series;
      }
    }
  }

  return { subject: ticker, dates, closes, opens, highs, lows, volumes, valuation };
}

async function buildPairBundle(a: string, b: string, minBars: number): Promise<SeriesBundle | null> {
  try {
    const r = await getYahooPairsRatio(a, b);
    if (!r || !r.dates || r.dates.length < minBars) return null;

    // Best-effort real legs (needed by the OLS-spread signal). Leg fetches hit
    // dataService's per-ticker cache, so pairs sharing a leg don't refetch.
    let pair = { aCloses: [] as number[], bCloses: [] as number[] };
    try {
      const [legA, legB] = await Promise.all([
        buildSingleBundle(a, 0),
        buildSingleBundle(b, 0),
      ]);
      if (legA && legB) {
        const mapA = new Map(legA.dates.map((d, i) => [d, legA.closes[i]]));
        const mapB = new Map(legB.dates.map((d, i) => [d, legB.closes[i]]));
        const aCloses: number[] = [];
        const bCloses: number[] = [];
        let ok = true;
        for (const d of r.dates) {
          const va = mapA.get(d);
          const vb = mapB.get(d);
          if (va === undefined || vb === undefined) { ok = false; break; }
          aCloses.push(va);
          bCloses.push(vb);
        }
        if (ok) pair = { aCloses, bCloses };
      }
    } catch {
      /* legs stay empty — OLS signal self-gates */
    }

    return {
      subject: `${a}/${b}`,
      dates: r.dates,
      closes: r.ratio,
      pair,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bar-mode resampling
// ---------------------------------------------------------------------------

/** Calendar-labelled horizons in BARS of the selected frequency. */
const WEEKLY_SWEEP_HORIZONS: MtfHorizon[] = [
  { label: "1W", bars: 1 }, { label: "2W", bars: 2 }, { label: "1M", bars: 4 },
  { label: "3M", bars: 13 }, { label: "6M", bars: 26 }, { label: "1Y", bars: 52 },
];
const MONTHLY_SWEEP_HORIZONS: MtfHorizon[] = [
  { label: "1M", bars: 1 }, { label: "3M", bars: 3 }, { label: "6M", bars: 6 }, { label: "1Y", bars: 12 },
];

/** Downsample a whole bundle to weekly/monthly period-end bars (last value
 *  per bucket for every aligned series). */
function resampleBundle(b: SeriesBundle, mode: "weekly" | "monthly"): SeriesBundle {
  const ds = weeklyDownsample(
    {
      dates: b.dates, closes: b.closes, adjCloses: b.closes,
      highs: b.highs ?? b.closes, lows: b.lows ?? b.closes,
      opens: b.opens ?? b.closes, volumes: b.volumes ?? [],
    },
    mode,
  );
  const map = ds.dailyIndexMap;
  return {
    ...b,
    dates: ds.dates,
    closes: ds.closes,
    opens: b.opens ? ds.opens : undefined,
    highs: b.highs ? ds.highs : undefined,
    lows: b.lows ? ds.lows : undefined,
    volumes: b.volumes ? ds.volumes : undefined,
    benchCloses: b.benchCloses ? map.map((di: number) => b.benchCloses![di]) : undefined,
    valuation: b.valuation
      ? Object.fromEntries(Object.entries(b.valuation).map(([k, v]) => [k, map.map((di: number) => v[di])]))
      : undefined,
    pair: b.pair
      ? { aCloses: map.map((di: number) => b.pair!.aCloses[di]), bCloses: map.map((di: number) => b.pair!.bCloses[di]) }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function evaluateBundle(bundle: SeriesBundle, settings: SweepSettings): QualifiedSetup[] {
  const families = new Set<SignalFamily>(settings.families);
  const ids = new Set(settings.enabledSignalIds);
  const signals = signalsForBundle(bundle, families, ids);
  const out: QualifiedSetup[] = [];

  const yearsBetween = (fromIdx: number) => {
    const ms =
      new Date(bundle.dates[bundle.dates.length - 1]).getTime() -
      new Date(bundle.dates[fromIdx]).getTime();
    return Math.max(ms / (365.25 * 24 * 3600 * 1000), 0.25);
  };
  const priceSpanYears = yearsBetween(0);
  // Valuation series usually start later than prices (forward-filled nulls
  // before the first observation); their firing frequency must be measured
  // over the metric's own span or late-starting signals get diluted out.
  const valuationStartIdx = (metrics: string[]): number => {
    let start = bundle.dates.length;
    for (const m of metrics) {
      const series = bundle.valuation?.[m];
      if (!series) continue;
      const first = series.findIndex((v) => v !== null);
      if (first >= 0) start = Math.min(start, first);
    }
    return start >= bundle.dates.length ? 0 : start;
  };
  const lastBar = bundle.dates.length - 1;

  for (const sig of signals) {
    for (const preset of sig.paramPresets) {
      for (const dir of sig.directions) {
        let indices: number[];
        try {
          indices = sig.detect(bundle, preset.params, dir);
        } catch {
          continue;
        }
        if (indices.length < settings.minOccurrences) continue;

        const barMode = settings.barMode ?? "daily";
        let result: { rows: any[]; signalCount: number; firstSignalDate: string | null; lastSignalDate: string | null; signals: { date: string }[] };
        if (barMode === "weekly" || barMode === "monthly") {
          // Bar-agnostic MTF kernel: horizons count bars of the sweep's
          // frequency; semantics mirror buildBacktestResult exactly.
          const horizons = barMode === "weekly" ? WEEKLY_SWEEP_HORIZONS : MONTHLY_SWEEP_HORIZONS;
          const { rows: hrows, acceptedIndices } = evaluateForwardStats(
            bundle.closes, indices, dir as "long" | "short",
            settings.targetPct / 100, settings.cooldown, horizons,
          );
          result = {
            rows: hrows,
            signalCount: acceptedIndices.length,
            firstSignalDate: acceptedIndices.length ? bundle.dates[acceptedIndices[0]] ?? null : null,
            lastSignalDate: acceptedIndices.length ? bundle.dates[acceptedIndices[acceptedIndices.length - 1]] ?? null : null,
            signals: acceptedIndices.map((i) => ({ date: bundle.dates[i] ?? "" })),
          };
        } else {
          result = buildBacktestResult(
            bundle.closes,
            bundle.dates,
            indices,
            dir,
            settings.targetPct / 100,
            settings.cooldown,
            undefined,
            settings.horizon,
          ) as any;
        }

        // Monthly mode has no 1W/2W horizons — fall back to the shortest.
        const row = result.rows.find((r) => r.horizon === settings.horizon) ?? (barMode === "monthly" ? result.rows[0] : undefined);
        if (!row) continue;
        if (row.count < settings.minOccurrences) continue;
        // Pairs qualify on winRate (directionally-correct horizon return):
        // ratios are low-vol, so any reachable excursion target either
        // saturates hitRate or filters everything. Singles keep hitRate
        // (did the trade see a ≥ target% favorable move within the horizon).
        const qualStat = sig.family === "pair" ? row.winRate : row.hitRate;
        if (qualStat <= settings.hitRateThreshold) continue;

        const spanYears = sig.requires.valuation?.length
          ? yearsBetween(valuationStartIdx(sig.requires.valuation))
          : priceSpanYears;
        const freqPerYear = result.signalCount / spanYears;
        const freqFloor =
          sig.family === "valuation"
            ? settings.valuationFreqFloorPerYear
            : settings.freqFloorPerYear;
        if (freqPerYear < freqFloor) continue;

        // Firing fields all come from the raw detector indices (pre-cooldown):
        // "is the condition on today" doesn't care that a backtest entry was
        // suppressed by cooldown, and refreshFiringStatus re-detects the same
        // way — keeping lastSignalDate consistent with firingNow.
        const lastIdx = indices[indices.length - 1];
        const lastSignalBarsAgo = lastBar - lastIdx;
        const recentSignalDates = result.signals.slice(-20).map((s) => s.date);

        out.push({
          key: `${bundle.subject}|${sig.id}|${preset.id}|${dir}`,
          subject: bundle.subject,
          mode: bundle.pair ? "pair" : "single",
          family: sig.family,
          signalId: sig.id,
          signalLabel: sig.label,
          presetId: preset.id,
          paramsLabel: preset.label,
          direction: dir,
          horizon: settings.horizon,
          hitRate: row.hitRate,
          winRate: row.winRate,
          avgReturn: row.avgReturn,
          medianReturn: row.medianReturn,
          tStat: row.tStat,
          occurrences: result.signalCount,
          freqPerYear,
          firstSignalDate: result.firstSignalDate,
          lastSignalDate: bundle.dates[lastIdx] ?? result.lastSignalDate,
          lastSignalBarsAgo,
          firingNow: lastSignalBarsAgo < settings.firingLookbackBars,
          allHorizons: result.rows,
          recentSignalDates,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

const BATCH = 5;

export async function runUniversalSweep(opts: {
  tickers: string[];
  pairList: [string, string][];
  settings: SweepSettings;
  onProgress: (p: SweepProgress) => void;
  onRows: (rows: QualifiedSetup[]) => void;
  cancelRef: { current: boolean };
}): Promise<QualifiedSetup[]> {
  const { settings, onProgress, onRows, cancelRef } = opts;
  const minBars = Math.round(settings.minYearsData * 252);
  const valMetrics = settings.families.includes("valuation")
    ? requiredValuationMetrics(new Set(settings.enabledSignalIds))
    : [];

  const subjects: Subject[] = [];
  if (settings.mode !== "pair") {
    for (const t of opts.tickers) subjects.push({ kind: "single", ticker: t });
  }
  if (settings.mode !== "single") {
    for (const [a, b] of opts.pairList) subjects.push({ kind: "pair", a, b });
  }

  const all: QualifiedSetup[] = [];
  let done = 0;
  onProgress({ done, total: subjects.length });

  const queue = [...subjects];
  while (queue.length > 0 && !cancelRef.current) {
    const batch = queue.splice(0, BATCH);
    const bundles = await Promise.all(
      batch.map((s) =>
        s.kind === "single"
          ? buildSingleBundle(s.ticker, minBars, valMetrics)
          : buildPairBundle(s.a, s.b, minBars),
      ),
    );

    for (let i = 0; i < batch.length; i++) {
      if (cancelRef.current) break;
      const bundle0 = bundles[i];
      const bundle = bundle0 && settings.barMode && settings.barMode !== "daily" ? resampleBundle(bundle0, settings.barMode) : bundle0;
      if (bundle) {
        const rows = evaluateBundle(bundle, settings);
        if (rows.length > 0) {
          all.push(...rows);
          onRows(rows);
        }
      }
      done++;
      onProgress({ done, total: subjects.length, subject: subjectLabel(batch[i]) });
      // Yield to the event loop so the UI stays responsive between subjects.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return all;
}

/**
 * Cheap daily refresh: re-detect only the (signal, preset, direction) combos
 * present in an existing library's rows and rewrite their firing fields.
 * Historical hit-rate stats are intentionally left as-built — one new bar
 * cannot meaningfully move them; a full Run rebuilds everything.
 */
export async function refreshFiringStatus(
  rows: QualifiedSetup[],
  settings: SweepSettings,
  onProgress?: (p: SweepProgress) => void,
  cancelRef?: { current: boolean },
): Promise<QualifiedSetup[]> {
  const minBars = Math.round(settings.minYearsData * 252);
  const bySubject = new Map<string, QualifiedSetup[]>();
  for (const r of rows) {
    const list = bySubject.get(r.subject) ?? [];
    list.push(r);
    bySubject.set(r.subject, list);
  }

  const updated: QualifiedSetup[] = [];
  const subjects = [...bySubject.keys()];
  let done = 0;

  for (const subject of subjects) {
    if (cancelRef?.current) {
      // Cancelled: pass through the untouched remainder.
      for (const s of subjects.slice(done)) updated.push(...bySubject.get(s)!);
      break;
    }
    const subjectRows = bySubject.get(subject)!;
    const isPair = subject.includes("/");
    const valMetrics = requiredValuationMetrics(new Set(subjectRows.map((r) => r.signalId)));
    const bundle0 = isPair
      ? await buildPairBundle(subject.split("/")[0], subject.split("/")[1], minBars)
      : await buildSingleBundle(subject, minBars, valMetrics);
    const bundle = bundle0 && settings.barMode && settings.barMode !== "daily" ? resampleBundle(bundle0, settings.barMode) : bundle0;

    for (const r of subjectRows) {
      if (!bundle) {
        updated.push(r);
        continue;
      }
      const sig = signalsForBundle(bundle, new Set([r.family]), new Set([r.signalId]))[0] as
        | CatalogSignal
        | undefined;
      const preset = sig?.paramPresets.find((p) => p.id === r.presetId);
      if (!sig || !preset) {
        updated.push(r);
        continue;
      }
      let indices: number[] = [];
      try {
        indices = sig.detect(bundle, preset.params, r.direction);
      } catch {
        updated.push(r);
        continue;
      }
      const lastBar = bundle.dates.length - 1;
      const lastIdx = indices.length > 0 ? indices[indices.length - 1] : null;
      const lastSignalBarsAgo = lastIdx === null ? null : lastBar - lastIdx;
      updated.push({
        ...r,
        lastSignalDate: lastIdx === null ? r.lastSignalDate : bundle.dates[lastIdx],
        lastSignalBarsAgo,
        firingNow: lastSignalBarsAgo !== null && lastSignalBarsAgo < settings.firingLookbackBars,
      });
    }
    done++;
    onProgress?.({ done, total: subjects.length, subject });
    await new Promise((res) => setTimeout(res, 0));
  }

  return updated;
}
