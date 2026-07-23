// Multi-Timeframe Setups — condition catalog.
//
// A condition is a boolean STATE series on one timeframe (H/D/W): "RSI(14)
// > 70", "close below SMA200", "MACD bearish", … The engine combines
// conditions across timeframes/indicators into setups (conjunctions) and
// backtests their turn-on edges. Indicators compute once per TfSeries via a
// WeakMap memo; warm-up-trimmed outputs re-align to the TF axis by time key
// (the universalSignalCatalog alignToBars pattern).

import {
  computeRSI,
  computeSMA,
  computeEMA,
  computeMACD,
  computeSlowStochastic,
  type DataPoint,
} from "@/lib/indicators";
import type { MtfBundle, TfSeries, Timeframe } from "@/lib/mtfData";

export type ConditionFamily = "rsi" | "ma" | "macd" | "stoch" | "range" | "trend";

export interface ConditionDef {
  id: string;
  label: string;
  family: ConditionFamily;
  tfs: Timeframe[];
  compute: (tf: TfSeries) => (boolean | null)[];
  /** Live numeric readout for the Current Setup grid ("74.2"). */
  liveValue?: (tf: TfSeries) => string | null;
}

export interface ConditionInstance {
  def: ConditionDef;
  tf: Timeframe;
  /** `${def.id}@${tf}` */
  key: string;
  label: string;
}

// ── Per-TfSeries indicator memo ─────────────────────────────────────────────

const seriesMemo = new WeakMap<TfSeries, Map<string, (number | null)[]>>();

function memo(tf: TfSeries, key: string, build: () => (number | null)[]): (number | null)[] {
  let m = seriesMemo.get(tf);
  if (!m) {
    m = new Map();
    seriesMemo.set(tf, m);
  }
  let v = m.get(key);
  if (!v) {
    v = build();
    m.set(key, v);
  }
  return v;
}

/** Spread a warm-up-trimmed DataPoint[] back onto the TF axis by time key. */
function alignToKeys(tf: TfSeries, series: DataPoint[]): (number | null)[] {
  const out: (number | null)[] = new Array(tf.keys.length).fill(null);
  const idx = new Map<string, number>();
  for (let i = 0; i < tf.keys.length; i++) idx.set(tf.keys[i], i);
  for (const p of series) {
    const i = idx.get(p.time);
    if (i !== undefined) out[i] = p.value;
  }
  return out;
}

function rsi(tf: TfSeries): (number | null)[] {
  return memo(tf, "rsi14", () => alignToKeys(tf, computeRSI(tf.points, 14)));
}
function sma(tf: TfSeries, n: number): (number | null)[] {
  return memo(tf, `sma${n}`, () => alignToKeys(tf, computeSMA(tf.points, n)));
}
function ema(tf: TfSeries, n: number): (number | null)[] {
  return memo(tf, `ema${n}`, () => alignToKeys(tf, computeEMA(tf.points, n)));
}
function macdDelta(tf: TfSeries): (number | null)[] {
  return memo(tf, "macdDelta", () => {
    const { macdLine, signalLine } = computeMACD(tf.points, 12, 26, 9);
    const m = alignToKeys(tf, macdLine);
    const s = alignToKeys(tf, signalLine);
    return m.map((v, i) => (v === null || s[i] === null ? null : v - (s[i] as number)));
  });
}
function stochK(tf: TfSeries): (number | null)[] {
  return memo(tf, "stochK", () => alignToKeys(tf, computeSlowStochastic(tf.bars, 14, 3, 3).k));
}
function rollingExtreme(tf: TfSeries, window: number, kind: "max" | "min"): (number | null)[] {
  return memo(tf, `${kind}${window}`, () => {
    const out: (number | null)[] = new Array(tf.closes.length).fill(null);
    for (let i = window - 1; i < tf.closes.length; i++) {
      let ext = kind === "max" ? -Infinity : Infinity;
      for (let j = i - window + 1; j <= i; j++) {
        const c = tf.closes[j];
        if (kind === "max" ? c > ext : c < ext) ext = c;
      }
      out[i] = ext;
    }
    return out;
  });
}

const cmp = (
  a: (number | null)[],
  b: (number | null)[] | number,
  op: (x: number, y: number) => boolean,
): (boolean | null)[] =>
  a.map((v, i) => {
    const y = typeof b === "number" ? b : b[i];
    return v === null || y === null || y === undefined ? null : op(v, y as number);
  });

const fmt = (v: number | null | undefined, d = 1) => (v == null ? null : v.toFixed(d));
const last = <T>(arr: T[]): T => arr[arr.length - 1];

// ── The catalog ─────────────────────────────────────────────────────────────

const HDW: Timeframe[] = ["H", "D", "W"];

export const MTF_CONDITIONS: ConditionDef[] = [
  { id: "rsi_ob", label: "RSI(14) > 70", family: "rsi", tfs: HDW,
    compute: (tf) => cmp(rsi(tf), 70, (x, y) => x > y),
    liveValue: (tf) => fmt(last(rsi(tf))) },
  { id: "rsi_os", label: "RSI(14) < 30", family: "rsi", tfs: HDW,
    compute: (tf) => cmp(rsi(tf), 30, (x, y) => x < y),
    liveValue: (tf) => fmt(last(rsi(tf))) },
  { id: "rsi_bull", label: "RSI(14) ≥ 50", family: "rsi", tfs: HDW,
    compute: (tf) => cmp(rsi(tf), 50, (x, y) => x >= y),
    liveValue: (tf) => fmt(last(rsi(tf))) },
  { id: "rsi_bear", label: "RSI(14) < 50", family: "rsi", tfs: HDW,
    compute: (tf) => cmp(rsi(tf), 50, (x, y) => x < y),
    liveValue: (tf) => fmt(last(rsi(tf))) },
  { id: "rsi_rising", label: "RSI(14) rising (vs 3 bars ago)", family: "rsi", tfs: HDW,
    compute: (tf) => {
      const r = rsi(tf);
      return r.map((v, i) => (v === null || i < 3 || r[i - 3] === null ? null : v > (r[i - 3] as number)));
    },
    liveValue: (tf) => fmt(last(rsi(tf))) },
  { id: "rsi_falling", label: "RSI(14) falling (vs 3 bars ago)", family: "rsi", tfs: HDW,
    compute: (tf) => {
      const r = rsi(tf);
      return r.map((v, i) => (v === null || i < 3 || r[i - 3] === null ? null : v < (r[i - 3] as number)));
    },
    liveValue: (tf) => fmt(last(rsi(tf))) },

  { id: "px_gt_sma200", label: "Close > SMA(200)", family: "ma", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], sma(tf, 200), (x, y) => x > y),
    liveValue: (tf) => { const s = last(sma(tf, 200)); const c = last(tf.closes); return s == null ? null : `${(((c - s) / s) * 100).toFixed(1)}%`; } },
  { id: "px_lt_sma200", label: "Close < SMA(200)", family: "ma", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], sma(tf, 200), (x, y) => x < y),
    liveValue: (tf) => { const s = last(sma(tf, 200)); const c = last(tf.closes); return s == null ? null : `${(((c - s) / s) * 100).toFixed(1)}%`; } },
  { id: "px_gt_sma50", label: "Close > SMA(50)", family: "ma", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], sma(tf, 50), (x, y) => x > y),
    liveValue: (tf) => { const s = last(sma(tf, 50)); const c = last(tf.closes); return s == null ? null : `${(((c - s) / s) * 100).toFixed(1)}%`; } },
  { id: "px_lt_sma50", label: "Close < SMA(50)", family: "ma", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], sma(tf, 50), (x, y) => x < y),
    liveValue: (tf) => { const s = last(sma(tf, 50)); const c = last(tf.closes); return s == null ? null : `${(((c - s) / s) * 100).toFixed(1)}%`; } },
  { id: "px_gt_ema21", label: "Close > EMA(21)", family: "ma", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], ema(tf, 21), (x, y) => x > y),
    liveValue: (tf) => { const s = last(ema(tf, 21)); const c = last(tf.closes); return s == null ? null : `${(((c - s) / s) * 100).toFixed(1)}%`; } },
  { id: "px_lt_ema21", label: "Close < EMA(21)", family: "ma", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], ema(tf, 21), (x, y) => x < y),
    liveValue: (tf) => { const s = last(ema(tf, 21)); const c = last(tf.closes); return s == null ? null : `${(((c - s) / s) * 100).toFixed(1)}%`; } },

  { id: "macd_bull", label: "MACD > signal", family: "macd", tfs: HDW,
    compute: (tf) => cmp(macdDelta(tf), 0, (x, y) => x > y),
    liveValue: (tf) => fmt(last(macdDelta(tf)), 3) },
  { id: "macd_bear", label: "MACD < signal", family: "macd", tfs: HDW,
    compute: (tf) => cmp(macdDelta(tf), 0, (x, y) => x < y),
    liveValue: (tf) => fmt(last(macdDelta(tf)), 3) },

  { id: "stoch_ob", label: "Slow Stoch %K > 80", family: "stoch", tfs: HDW,
    compute: (tf) => cmp(stochK(tf), 80, (x, y) => x > y),
    liveValue: (tf) => fmt(last(stochK(tf))) },
  { id: "stoch_os", label: "Slow Stoch %K < 20", family: "stoch", tfs: HDW,
    compute: (tf) => cmp(stochK(tf), 20, (x, y) => x < y),
    liveValue: (tf) => fmt(last(stochK(tf))) },

  { id: "trend_up", label: "Close > SMA(10) (TF trend up)", family: "trend", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], sma(tf, 10), (x, y) => x > y),
    liveValue: (tf) => { const s = last(sma(tf, 10)); const c = last(tf.closes); return s == null ? null : `${(((c - s) / s) * 100).toFixed(1)}%`; } },
  { id: "trend_down", label: "Close < SMA(10) (TF trend down)", family: "trend", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], sma(tf, 10), (x, y) => x < y),
    liveValue: (tf) => { const s = last(sma(tf, 10)); const c = last(tf.closes); return s == null ? null : `${(((c - s) / s) * 100).toFixed(1)}%`; } },

  { id: "near_range_hi", label: "Within 2% of 252-bar high", family: "range", tfs: ["D", "W"],
    compute: (tf) => cmp(tf.closes as (number | null)[], rollingExtreme(tf, 252, "max").map((v) => (v == null ? null : v * 0.98)), (x, y) => x >= y),
    liveValue: (tf) => { const m = last(rollingExtreme(tf, 252, "max")); const c = last(tf.closes); return m == null ? null : `${(((c - m) / m) * 100).toFixed(1)}%`; } },
  { id: "near_range_lo", label: "Within 2% of 252-bar low", family: "range", tfs: ["D", "W"],
    compute: (tf) => cmp(tf.closes as (number | null)[], rollingExtreme(tf, 252, "min").map((v) => (v == null ? null : v * 1.02)), (x, y) => x <= y),
    liveValue: (tf) => { const m = last(rollingExtreme(tf, 252, "min")); const c = last(tf.closes); return m == null ? null : `${(((c - m) / m) * 100).toFixed(1)}%`; } },
];

// ── Instances + projection ──────────────────────────────────────────────────

function tfSeriesOf(bundle: MtfBundle, tf: Timeframe): TfSeries | null {
  return tf === "H" ? bundle.hourly : tf === "D" ? bundle.daily : bundle.weekly;
}

/** All condition instances available for this bundle (hourly ones only when hourly data exists). */
export function conditionInstances(bundle: MtfBundle): ConditionInstance[] {
  const out: ConditionInstance[] = [];
  for (const def of MTF_CONDITIONS) {
    for (const tf of def.tfs) {
      if (tf === "H" && !bundle.hourly) continue;
      out.push({ def, tf, key: `${def.id}@${tf}`, label: `${def.label} @${tf}` });
    }
  }
  return out;
}

/**
 * Project every instance's state series onto the base axis using the strict
 * completed-bar maps (-1 / warm-up → null). Base "H" requires bundle.hourly.
 */
export function computeConditionMatrix(
  bundle: MtfBundle,
  baseTf: "H" | "D",
  instances: ConditionInstance[],
): Map<string, (boolean | null)[]> {
  const base = baseTf === "H" ? bundle.hourly! : bundle.daily;
  const n = base.keys.length;
  const out = new Map<string, (boolean | null)[]>();
  for (const inst of instances) {
    const tfs = tfSeriesOf(bundle, inst.tf);
    if (!tfs) continue;
    const own = inst.def.compute(tfs);
    if (inst.tf === baseTf) {
      out.set(inst.key, own);
      continue;
    }
    const map =
      baseTf === "H"
        ? inst.tf === "D"
          ? bundle.hourlyToDaily
          : bundle.hourlyToWeekly
        : bundle.dailyToWeekly;
    const projected: (boolean | null)[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const j = map[i];
      projected[i] = j >= 0 ? own[j] : null;
    }
    out.set(inst.key, projected);
  }
  return out;
}
