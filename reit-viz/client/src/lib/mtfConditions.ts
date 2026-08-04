// Multi-Timeframe Setups — condition catalog.
//
// A condition is a boolean STATE series on one timeframe (H/D/W/M): "RSI(14)
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
  computeBollingerBands,
  computeADX,
  computeCCI,
  computeWilliamsR,
  computeAroon,
  computeSupertrend,
  computePSAR,
  computeKeltner,
  computeDonchian,
  computeIchimoku,
  type DataPoint,
} from "@/lib/indicators";
import { computeMaByType, MA_TYPES, type MaType } from "@/lib/maEngine";
import type { MtfBundle, TfSeries, Timeframe } from "@/lib/mtfData";

export type ConditionFamily =
  | "rsi" | "ma" | "macd" | "stoch" | "range" | "trend"
  | "adx" | "dmi" | "cci" | "willr" | "aroon"
  | "supertrend" | "psar" | "keltner" | "donchian"
  | "ichimoku" | "ichimoku_tk" | "bb"
  | "macross" | "madist";

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

// Multi-output indicators memoize the whole aligned result object once per
// TfSeries (the scalar memo above only holds single arrays).
const rawMemo = new WeakMap<TfSeries, Map<string, unknown>>();

function memoRaw<T>(tf: TfSeries, key: string, build: () => T): T {
  let m = rawMemo.get(tf);
  if (!m) {
    m = new Map();
    rawMemo.set(tf, m);
  }
  if (!m.has(key)) m.set(key, build());
  return m.get(key) as T;
}

function adxParts(tf: TfSeries) {
  return memoRaw(tf, "adx14", () => {
    const { adx, plusDI, minusDI } = computeADX(tf.bars, 14);
    return {
      adx: alignToKeys(tf, adx),
      plus: alignToKeys(tf, plusDI),
      minus: alignToKeys(tf, minusDI),
    };
  });
}
function cci20(tf: TfSeries): (number | null)[] {
  return memo(tf, "cci20", () => alignToKeys(tf, computeCCI(tf.bars, 20)));
}
function willr14(tf: TfSeries): (number | null)[] {
  return memo(tf, "willr14", () => alignToKeys(tf, computeWilliamsR(tf.bars, 14)));
}
function aroonParts(tf: TfSeries) {
  return memoRaw(tf, "aroon14", () => {
    const { up, down } = computeAroon(tf.bars, 14);
    return { up: alignToKeys(tf, up), down: alignToKeys(tf, down) };
  });
}
/** ±1 trend side per bar, plus the stop/dot line for live readouts. */
function flipTrend(tf: TfSeries, kind: "supertrend" | "psar") {
  return memoRaw(tf, kind, () => {
    const pts = kind === "supertrend" ? computeSupertrend(tf.bars, 10, 3) : computePSAR(tf.bars, 0.02, 0.2);
    return {
      trend: alignToKeys(tf, pts.map((p) => ({ time: p.time, value: p.trend }))),
      line: alignToKeys(tf, pts.map((p) => ({ time: p.time, value: p.value }))),
    };
  });
}
function keltnerBands(tf: TfSeries) {
  return memoRaw(tf, "keltner", () => {
    const { upper, lower } = computeKeltner(tf.bars, 20, 2, 10);
    return { upper: alignToKeys(tf, upper), lower: alignToKeys(tf, lower) };
  });
}
function donchianBands(tf: TfSeries) {
  return memoRaw(tf, "donchian20", () => {
    const { upper, lower } = computeDonchian(tf.bars, 20);
    return { upper: alignToKeys(tf, upper), lower: alignToKeys(tf, lower) };
  });
}
function bbBands(tf: TfSeries) {
  return memoRaw(tf, "bb20", () => {
    const { upper, lower } = computeBollingerBands(tf.points, 20, 2);
    return { upper: alignToKeys(tf, upper), lower: alignToKeys(tf, lower) };
  });
}
/**
 * Ichimoku with the standard displacement applied on the TF's own axis: the
 * cloud governing bar i is the span pair computed 26 bars earlier — the same
 * shift the chart renders, so no lookahead.
 */
function ichi(tf: TfSeries) {
  return memoRaw(tf, "ichimoku", () => {
    const r = computeIchimoku(tf.bars, 9, 26, 52, 26);
    const conv = alignToKeys(tf, r.conversion);
    const kijun = alignToKeys(tf, r.base);
    const a = alignToKeys(tf, r.leadA);
    const b = alignToKeys(tf, r.leadB);
    const n = tf.keys.length;
    const top: (number | null)[] = new Array(n).fill(null);
    const bot: (number | null)[] = new Array(n).fill(null);
    for (let i = 26; i < n; i++) {
      const va = a[i - 26];
      const vb = b[i - 26];
      if (va === null || vb === null) continue;
      top[i] = Math.max(va, vb);
      bot[i] = Math.min(va, vb);
    }
    return { conv, kijun, top, bot };
  });
}
function highsOf(tf: TfSeries): (number | null)[] {
  return memo(tf, "highs", () => tf.bars.map((b) => b.high));
}
function lowsOf(tf: TfSeries): (number | null)[] {
  return memo(tf, "lows", () => tf.bars.map((b) => b.low));
}
/** Any maEngine MA type/period on this TF's closes (index-aligned already). */
function maOf(tf: TfSeries, type: MaType, period: number): (number | null)[] {
  return memo(tf, `ma:${type}:${period}`, () =>
    computeMaByType(tf.closes, period, type, {
      highs: tf.bars.map((b) => b.high),
      lows: tf.bars.map((b) => b.low),
    }),
  );
}
/**
 * CAUSAL "% from MA" stretch state: today's close-to-MA distance ranked
 * against the TRAILING 252-bar distribution of that distance (past bars
 * only) — unlike the Charts madist band, which calibrates percentiles on the
 * full history and would be lookahead in a backtest. Needs ≥100 trailing
 * observations before emitting a state.
 */
function stretchFrac(tf: TfSeries, period: number): (number | null)[] {
  return memo(tf, `stretch:${period}`, () => {
    const ma = maOf(tf, "SMA", period);
    const n = tf.closes.length;
    const dist: (number | null)[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const m = ma[i];
      dist[i] = m == null || !(m > 0) ? null : tf.closes[i] / m - 1;
    }
    const out: (number | null)[] = new Array(n).fill(null);
    const WIN = 252;
    for (let i = 0; i < n; i++) {
      const d = dist[i];
      if (d === null) continue;
      let below = 0;
      let count = 0;
      for (let j = Math.max(0, i - WIN); j < i; j++) {
        const v = dist[j];
        if (v === null) continue;
        count++;
        if (v < d) below++;
      }
      if (count >= 100) out[i] = below / count;
    }
    return out;
  });
}

/** Signed close-to-MA distance as a fraction (close/MA − 1), null in warm-up. */
function maDistFrac(tf: TfSeries, period: number): (number | null)[] {
  return memo(tf, `madistfrac:${period}`, () => {
    const ma = maOf(tf, "SMA", period);
    return tf.closes.map((c, i) => {
      const m = ma[i];
      return m == null || !(m > 0) ? null : c / m - 1;
    });
  });
}

const pctFromMa = (tf: TfSeries, ma: (number | null)[]): string | null => {
  const m = last(ma);
  const c = last(tf.closes);
  return m == null || !(m > 0) ? null : `${(((c - m) / m) * 100).toFixed(1)}%`;
};

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

// All timeframes. The "range" family stays D/W — its 252-bar window would
// need 21 years of monthly bars before emitting a state.
const HDW: Timeframe[] = ["H", "D", "W", "M"];

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

  // ── Charts-registry indicators (same defaults as the Charts panel) ──
  { id: "adx_strong", label: "ADX(14) > 25 (trending)", family: "adx", tfs: HDW,
    compute: (tf) => cmp(adxParts(tf).adx, 25, (x, y) => x > y),
    liveValue: (tf) => fmt(last(adxParts(tf).adx)) },
  { id: "adx_weak", label: "ADX(14) < 20 (choppy)", family: "adx", tfs: HDW,
    compute: (tf) => cmp(adxParts(tf).adx, 20, (x, y) => x < y),
    liveValue: (tf) => fmt(last(adxParts(tf).adx)) },
  { id: "dmi_bull", label: "+DI > -DI", family: "dmi", tfs: HDW,
    compute: (tf) => cmp(adxParts(tf).plus, adxParts(tf).minus, (x, y) => x > y),
    liveValue: (tf) => { const p = last(adxParts(tf).plus); const m = last(adxParts(tf).minus); return p == null || m == null ? null : fmt(p - m); } },
  { id: "dmi_bear", label: "+DI < -DI", family: "dmi", tfs: HDW,
    compute: (tf) => cmp(adxParts(tf).plus, adxParts(tf).minus, (x, y) => x < y),
    liveValue: (tf) => { const p = last(adxParts(tf).plus); const m = last(adxParts(tf).minus); return p == null || m == null ? null : fmt(p - m); } },

  { id: "cci_ob", label: "CCI(20) > 100", family: "cci", tfs: HDW,
    compute: (tf) => cmp(cci20(tf), 100, (x, y) => x > y),
    liveValue: (tf) => fmt(last(cci20(tf)), 0) },
  { id: "cci_os", label: "CCI(20) < -100", family: "cci", tfs: HDW,
    compute: (tf) => cmp(cci20(tf), -100, (x, y) => x < y),
    liveValue: (tf) => fmt(last(cci20(tf)), 0) },

  { id: "willr_ob", label: "Williams %R > -20", family: "willr", tfs: HDW,
    compute: (tf) => cmp(willr14(tf), -20, (x, y) => x > y),
    liveValue: (tf) => fmt(last(willr14(tf))) },
  { id: "willr_os", label: "Williams %R < -80", family: "willr", tfs: HDW,
    compute: (tf) => cmp(willr14(tf), -80, (x, y) => x < y),
    liveValue: (tf) => fmt(last(willr14(tf))) },

  { id: "aroon_bull", label: "Aroon Up > Down", family: "aroon", tfs: HDW,
    compute: (tf) => cmp(aroonParts(tf).up, aroonParts(tf).down, (x, y) => x > y),
    liveValue: (tf) => { const u = last(aroonParts(tf).up); const d = last(aroonParts(tf).down); return u == null || d == null ? null : fmt(u - d, 0); } },
  { id: "aroon_bear", label: "Aroon Down > Up", family: "aroon", tfs: HDW,
    compute: (tf) => cmp(aroonParts(tf).down, aroonParts(tf).up, (x, y) => x > y),
    liveValue: (tf) => { const u = last(aroonParts(tf).up); const d = last(aroonParts(tf).down); return u == null || d == null ? null : fmt(u - d, 0); } },

  { id: "st_bull", label: "Supertrend bullish", family: "supertrend", tfs: HDW,
    compute: (tf) => cmp(flipTrend(tf, "supertrend").trend, 0, (x, y) => x > y),
    liveValue: (tf) => { const l = last(flipTrend(tf, "supertrend").line); const c = last(tf.closes); return l == null ? null : `${(((c - l) / l) * 100).toFixed(1)}%`; } },
  { id: "st_bear", label: "Supertrend bearish", family: "supertrend", tfs: HDW,
    compute: (tf) => cmp(flipTrend(tf, "supertrend").trend, 0, (x, y) => x < y),
    liveValue: (tf) => { const l = last(flipTrend(tf, "supertrend").line); const c = last(tf.closes); return l == null ? null : `${(((c - l) / l) * 100).toFixed(1)}%`; } },
  { id: "psar_bull", label: "PSAR bullish (dots below)", family: "psar", tfs: HDW,
    compute: (tf) => cmp(flipTrend(tf, "psar").trend, 0, (x, y) => x > y),
    liveValue: (tf) => { const l = last(flipTrend(tf, "psar").line); const c = last(tf.closes); return l == null ? null : `${(((c - l) / l) * 100).toFixed(1)}%`; } },
  { id: "psar_bear", label: "PSAR bearish (dots above)", family: "psar", tfs: HDW,
    compute: (tf) => cmp(flipTrend(tf, "psar").trend, 0, (x, y) => x < y),
    liveValue: (tf) => { const l = last(flipTrend(tf, "psar").line); const c = last(tf.closes); return l == null ? null : `${(((c - l) / l) * 100).toFixed(1)}%`; } },

  { id: "kc_above", label: "Close > Keltner upper", family: "keltner", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], keltnerBands(tf).upper, (x, y) => x > y),
    liveValue: (tf) => { const u = last(keltnerBands(tf).upper); const c = last(tf.closes); return u == null ? null : `${(((c - u) / u) * 100).toFixed(1)}%`; } },
  { id: "kc_below", label: "Close < Keltner lower", family: "keltner", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], keltnerBands(tf).lower, (x, y) => x < y),
    liveValue: (tf) => { const l = last(keltnerBands(tf).lower); const c = last(tf.closes); return l == null ? null : `${(((c - l) / l) * 100).toFixed(1)}%`; } },

  { id: "bb_above", label: "Close > Bollinger upper", family: "bb", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], bbBands(tf).upper, (x, y) => x > y),
    liveValue: (tf) => { const u = last(bbBands(tf).upper); const l = last(bbBands(tf).lower); const c = last(tf.closes); return u == null || l == null || u === l ? null : `%B ${(((c - l) / (u - l)) * 100).toFixed(0)}`; } },
  { id: "bb_below", label: "Close < Bollinger lower", family: "bb", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], bbBands(tf).lower, (x, y) => x < y),
    liveValue: (tf) => { const u = last(bbBands(tf).upper); const l = last(bbBands(tf).lower); const c = last(tf.closes); return u == null || l == null || u === l ? null : `%B ${(((c - l) / (u - l)) * 100).toFixed(0)}`; } },

  { id: "donch_hi", label: "New 20-bar high (Donchian)", family: "donchian", tfs: HDW,
    compute: (tf) => cmp(highsOf(tf), donchianBands(tf).upper, (x, y) => x >= y),
    liveValue: (tf) => { const u = last(donchianBands(tf).upper); const c = last(tf.closes); return u == null ? null : `${(((c - u) / u) * 100).toFixed(1)}%`; } },
  { id: "donch_lo", label: "New 20-bar low (Donchian)", family: "donchian", tfs: HDW,
    compute: (tf) => cmp(lowsOf(tf), donchianBands(tf).lower, (x, y) => x <= y),
    liveValue: (tf) => { const l = last(donchianBands(tf).lower); const c = last(tf.closes); return l == null ? null : `${(((c - l) / l) * 100).toFixed(1)}%`; } },

  { id: "ichi_above", label: "Close above Ichimoku cloud", family: "ichimoku", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], ichi(tf).top, (x, y) => x > y),
    liveValue: (tf) => { const t = last(ichi(tf).top); const c = last(tf.closes); return t == null ? null : `${(((c - t) / t) * 100).toFixed(1)}%`; } },
  { id: "ichi_below", label: "Close below Ichimoku cloud", family: "ichimoku", tfs: HDW,
    compute: (tf) => cmp(tf.closes as (number | null)[], ichi(tf).bot, (x, y) => x < y),
    liveValue: (tf) => { const b = last(ichi(tf).bot); const c = last(tf.closes); return b == null ? null : `${(((c - b) / b) * 100).toFixed(1)}%`; } },
  { id: "ichi_tk_bull", label: "Tenkan > Kijun", family: "ichimoku_tk", tfs: HDW,
    compute: (tf) => cmp(ichi(tf).conv, ichi(tf).kijun, (x, y) => x > y),
    liveValue: (tf) => { const t = last(ichi(tf).conv); const k = last(ichi(tf).kijun); return t == null || k == null ? null : fmt(t - k, 2); } },
  { id: "ichi_tk_bear", label: "Tenkan < Kijun", family: "ichimoku_tk", tfs: HDW,
    compute: (tf) => cmp(ichi(tf).conv, ichi(tf).kijun, (x, y) => x < y),
    liveValue: (tf) => { const t = last(ichi(tf).conv); const k = last(ichi(tf).kijun); return t == null || k == null ? null : fmt(t - k, 2); } },
];

// ── Generated MA conditions (all 12 maEngine types) ─────────────────────────
//
// Price-vs-MA states at 21 and 50 bars per type (the TF axis supplies longer
// effective periods for free: 50 @W ≈ 250 daily bars). Same "ma" family as
// the hand-written SMA/EMA states, so same-TF MA-vs-MA pairs stay excluded
// as redundant. Crosses get their own family so "fast>slow AND price>MA" is
// a scannable pair; stretch states likewise.

for (const t of MA_TYPES) {
  for (const p of [21, 50]) {
    // Hand-written equivalents above already cover these two.
    if ((t === "SMA" && p === 50) || (t === "EMA" && p === 21)) continue;
    const lc = t.toLowerCase();
    MTF_CONDITIONS.push(
      { id: `px_gt_${lc}${p}`, label: `Close > ${t}(${p})`, family: "ma", tfs: HDW,
        compute: (tf) => cmp(tf.closes as (number | null)[], maOf(tf, t, p), (x, y) => x > y),
        liveValue: (tf) => pctFromMa(tf, maOf(tf, t, p)) },
      { id: `px_lt_${lc}${p}`, label: `Close < ${t}(${p})`, family: "ma", tfs: HDW,
        compute: (tf) => cmp(tf.closes as (number | null)[], maOf(tf, t, p), (x, y) => x < y),
        liveValue: (tf) => pctFromMa(tf, maOf(tf, t, p)) },
    );
  }
  const lc = t.toLowerCase();
  MTF_CONDITIONS.push(
    { id: `cross_${lc}_bull`, label: `${t}(21) > ${t}(50)`, family: "macross", tfs: HDW,
      compute: (tf) => cmp(maOf(tf, t, 21), maOf(tf, t, 50), (x, y) => x > y),
      liveValue: (tf) => { const a = last(maOf(tf, t, 21)); const b = last(maOf(tf, t, 50)); return a == null || b == null || !(b > 0) ? null : `${(((a - b) / b) * 100).toFixed(1)}%`; } },
    { id: `cross_${lc}_bear`, label: `${t}(21) < ${t}(50)`, family: "macross", tfs: HDW,
      compute: (tf) => cmp(maOf(tf, t, 21), maOf(tf, t, 50), (x, y) => x < y),
      liveValue: (tf) => { const a = last(maOf(tf, t, 21)); const b = last(maOf(tf, t, 50)); return a == null || b == null || !(b > 0) ? null : `${(((a - b) / b) * 100).toFixed(1)}%`; } },
  );
}
// Classic golden/death cross (50/200) for the two canonical types.
for (const t of ["SMA", "EMA"] as MaType[]) {
  const lc = t.toLowerCase();
  MTF_CONDITIONS.push(
    { id: `golden_${lc}`, label: `${t}(50) > ${t}(200) (golden cross)`, family: "macross", tfs: HDW,
      compute: (tf) => cmp(maOf(tf, t, 50), maOf(tf, t, 200), (x, y) => x > y),
      liveValue: (tf) => { const a = last(maOf(tf, t, 50)); const b = last(maOf(tf, t, 200)); return a == null || b == null || !(b > 0) ? null : `${(((a - b) / b) * 100).toFixed(1)}%`; } },
    { id: `death_${lc}`, label: `${t}(50) < ${t}(200) (death cross)`, family: "macross", tfs: HDW,
      compute: (tf) => cmp(maOf(tf, t, 50), maOf(tf, t, 200), (x, y) => x < y),
      liveValue: (tf) => { const a = last(maOf(tf, t, 50)); const b = last(maOf(tf, t, 200)); return a == null || b == null || !(b > 0) ? null : `${(((a - b) / b) * 100).toFixed(1)}%`; } },
  );
}
// Fixed-threshold "% from MA" states: absolute signed distance vs a threshold
// scaled to the MA's horizon. Complements the percentile stretch states below
// (those adapt per ticker; these are the same bar for every symbol).
for (const { p, th } of [{ p: 21, th: 3 }, { p: 50, th: 5 }, { p: 200, th: 10 }]) {
  MTF_CONDITIONS.push(
    { id: `pctma_hi_${p}`, label: `Close ≥ ${th}% above SMA(${p})`, family: "madist", tfs: HDW,
      compute: (tf) => cmp(maDistFrac(tf, p), th / 100, (x, y) => x >= y),
      liveValue: (tf) => pctFromMa(tf, maOf(tf, "SMA", p)) },
    { id: `pctma_lo_${p}`, label: `Close ≤ ${th}% below SMA(${p})`, family: "madist", tfs: HDW,
      compute: (tf) => cmp(maDistFrac(tf, p), -th / 100, (x, y) => x <= y),
      liveValue: (tf) => pctFromMa(tf, maOf(tf, "SMA", p)) },
  );
}
// Causal "% from MA" stretch states (trailing-1y percentile of the distance).
for (const p of [50, 200]) {
  MTF_CONDITIONS.push(
    { id: `stretch_hi_${p}`, label: `Stretched above MA(${p}) (>90th %ile, trailing 1y)`, family: "madist", tfs: HDW,
      compute: (tf) => cmp(stretchFrac(tf, p), 0.9, (x, y) => x >= y),
      liveValue: (tf) => pctFromMa(tf, maOf(tf, "SMA", p)) },
    { id: `stretch_lo_${p}`, label: `Stretched below MA(${p}) (<10th %ile, trailing 1y)`, family: "madist", tfs: HDW,
      compute: (tf) => cmp(stretchFrac(tf, p), 0.1, (x, y) => x <= y),
      liveValue: (tf) => pctFromMa(tf, maOf(tf, "SMA", p)) },
  );
}

// ── Instances + projection ──────────────────────────────────────────────────

function tfSeriesOf(bundle: MtfBundle, tf: Timeframe): TfSeries | null {
  return tf === "H" ? bundle.hourly : tf === "D" ? bundle.daily : tf === "W" ? bundle.weekly : bundle.monthly;
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
    // An hourly condition has no well-defined projection onto the daily axis
    // (and the naive fallthrough below would index hourly states with weekly
    // indices) — skip it; callers treat a missing key as "leg unavailable".
    if (baseTf === "D" && inst.tf === "H") continue;
    const map =
      baseTf === "H"
        ? inst.tf === "D"
          ? bundle.hourlyToDaily
          : inst.tf === "W"
            ? bundle.hourlyToWeekly
            : bundle.hourlyToMonthly
        : inst.tf === "W"
          ? bundle.dailyToWeekly
          : bundle.dailyToMonthly;
    const projected: (boolean | null)[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const j = map[i];
      projected[i] = j >= 0 ? own[j] : null;
    }
    out.set(inst.key, projected);
  }
  return out;
}
