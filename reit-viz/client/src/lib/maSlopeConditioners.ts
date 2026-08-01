// Event-conditioning study for MA slope inflections — the "what else was true
// when it worked?" engine. For a chosen config's slope events, compute causal
// context features (curvature state, trend regime, RSI, vol regime,
// trendiness, stretch) at each event bar, split the events by each condition,
// and measure whether the split's hit-rate/edge uplift survives the same
// train/holdout discipline the rest of the page uses.
//
// All features are strictly causal (trailing windows only). "Hit" is
// direction-favorable: an up event hits when the forward return is positive,
// a down event when it is negative; means are favorable-signed the same way.

import { computeMaByType } from "@/lib/maEngine";
import { computeMaSlopeSeries, type MaSlopeParams } from "@/lib/maSlope";
import type { SlopeSeriesData } from "@/lib/maSlopeData";

export interface ConditionerSplit {
  n: number;
  /** Favorable hit rate, 0..1. */
  hit: number;
  /** Favorable-signed mean forward return, %. */
  mean: number;
}

export interface ConditionerRow {
  id: string;
  label: string;
  side: "up" | "down";
  train: { on: ConditionerSplit; off: ConditionerSplit };
  holdout: { on: ConditionerSplit; off: ConditionerSplit } | null;
  /** Train uplift: favorable mean (condition on) − (condition off), pp. */
  upliftMean: number;
  /** Train hit-rate uplift, pp (0..100 scale). */
  upliftHit: number;
  /** Same-sign mean uplift on holdout events; null when either split is too thin. */
  oosUplift: number | null;
  confirmed: boolean | null;
}

export interface ConditionerStudy {
  side: "up" | "down";
  nTrain: number;
  nHoldout: number;
  rows: ConditionerRow[];
}

const MIN_SPLIT = 5;
const MIN_OOS_SPLIT = 3;
const PCT_WINDOW = 250;

function wilderRsi(closes: number[], period = 14): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  let avgGain = 0, avgLoss = 0, count = 0;
  for (let i = 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    if (!Number.isFinite(ch)) continue;
    const gain = Math.max(0, ch), loss = Math.max(0, -ch);
    count++;
    if (count <= period) {
      avgGain += (gain - avgGain) / count;
      avgLoss += (loss - avgLoss) / count;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (count >= period) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Trailing-window percentile (0..1) of v[i] within v[i-W..i]; causal. */
function trailingPercentile(v: (number | null)[], window = PCT_WINDOW): (number | null)[] {
  const n = v.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const cur = v[i];
    if (cur == null || !Number.isFinite(cur)) continue;
    let below = 0, total = 0;
    for (let j = Math.max(0, i - window); j <= i; j++) {
      const x = v[j];
      if (x == null || !Number.isFinite(x)) continue;
      total++;
      if (x <= cur) below++;
    }
    if (total >= 60) out[i] = below / total;
  }
  return out;
}

function realizedVol(closes: number[], window = 20): (number | null)[] {
  const n = closes.length;
  const rets: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) rets[i] = Math.log(closes[i] / closes[i - 1]);
  }
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = window; i < n; i++) {
    let s = 0, s2 = 0, c = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const r = rets[j];
      if (r == null) { c = -1; break; }
      s += r; s2 += r * r; c++;
    }
    if (c === window) {
      const mu = s / c;
      out[i] = Math.sqrt(Math.max(0, s2 / c - mu * mu));
    }
  }
  return out;
}

function efficiencyRatio(closes: number[], window = 20): (number | null)[] {
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = window; i < n; i++) {
    let noise = 0;
    let ok = true;
    for (let j = i - window + 1; j <= i; j++) {
      const d = Math.abs(closes[j] - closes[j - 1]);
      if (!Number.isFinite(d)) { ok = false; break; }
      noise += d;
    }
    if (ok && noise > 0) out[i] = Math.abs(closes[i] - closes[i - window]) / noise;
  }
  return out;
}

function split(events: Array<{ fav: number; on: boolean }>, want: boolean): ConditionerSplit {
  const xs = events.filter((e) => e.on === want);
  if (!xs.length) return { n: 0, hit: NaN, mean: NaN };
  const hits = xs.filter((e) => e.fav > 0).length;
  const mean = xs.reduce((s, e) => s + e.fav, 0) / xs.length;
  return { n: xs.length, hit: hits / xs.length, mean };
}

export function analyzeConditioners(
  data: SlopeSeriesData,
  params: MaSlopeParams,
  side: "up" | "down",
  primaryHorizonBars: number,
  holdoutFrac: number,
): ConditionerStudy {
  const closes = data.closes;
  const n = closes.length;
  const series = computeMaSlopeSeries(closes, params, { highs: data.highs, lows: data.lows });

  // ── Causal context features ──
  const sma200 = computeMaByType(closes, Math.min(200, Math.max(20, Math.floor(n / 4))), "SMA");
  const longSlope: (number | null)[] = new Array(n).fill(null);
  for (let i = 10; i < n; i++) {
    const a = sma200[i], b = sma200[i - 10];
    if (a != null && b != null) longSlope[i] = a - b;
  }
  const rsi = wilderRsi(closes);
  const volPct = trailingPercentile(realizedVol(closes));
  const erPct = trailingPercentile(efficiencyRatio(closes));
  const dist: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const m = series.ma[i];
    if (m != null && m > 0) dist[i] = Math.abs(closes[i] / m - 1);
  }
  const distPct = trailingPercentile(dist);
  // Same-direction curvature flip within the 5 bars before the event.
  const curvFlipRecently = (idx: number, dir: "up" | "down") =>
    series.events.some((e) => e.kind === "curvature" && e.direction === dir && e.idx >= idx - 5 && e.idx <= idx);

  const CONDITIONERS: Array<{ id: string; label: string; on: (idx: number, dir: "up" | "down") => boolean | null }> = [
    {
      id: "curv-agree",
      label: "Curvature agrees (accelerating turn)",
      on: (i, d) => { const c = series.curvature[i]; return c == null ? null : d === "up" ? c > 0 : c < 0; },
    },
    {
      id: "curv-preflip",
      label: "Curvature flipped same way ≤5 bars before",
      on: (i, d) => curvFlipRecently(i, d),
    },
    {
      id: "trend-agree",
      label: "Long-MA slope agrees (with-trend entry)",
      on: (i, d) => { const s = longSlope[i]; return s == null ? null : d === "up" ? s > 0 : s < 0; },
    },
    {
      id: "px-above-long",
      label: "Price above long MA",
      on: (i) => { const m = sma200[i]; return m == null ? null : closes[i] > m; },
    },
    {
      id: "rsi-mid",
      label: "RSI(14) on the move's side (up: >50, down: <50)",
      on: (i, d) => { const r = rsi[i]; return r == null ? null : d === "up" ? r > 50 : r < 50; },
    },
    {
      id: "rsi-extreme",
      label: "RSI(14) stretched against move (up: <35, down: >65)",
      on: (i, d) => { const r = rsi[i]; return r == null ? null : d === "up" ? r < 35 : r > 65; },
    },
    {
      id: "low-vol",
      label: "Quiet regime (20d vol below trailing median)",
      on: (i) => { const p = volPct[i]; return p == null ? null : p < 0.5; },
    },
    {
      id: "trending",
      label: "Trending tape (efficiency ratio above median)",
      on: (i) => { const p = erPct[i]; return p == null ? null : p > 0.5; },
    },
    {
      id: "stretched",
      label: "Price stretched from this MA (top-quintile |dist|)",
      on: (i) => { const p = distPct[i]; return p == null ? null : p > 0.8; },
    },
  ];

  // ── Event set with favorable forward returns, split train/holdout ──
  const H = primaryHorizonBars;
  const splitIdx = holdoutFrac > 0 ? Math.floor(n * (1 - holdoutFrac)) : n;
  type Ev = { idx: number; fav: number; feats: Array<boolean | null> };
  const train: Ev[] = [];
  const holdout: Ev[] = [];
  for (const e of series.events) {
    if (e.kind !== "slope" || e.direction !== side) continue;
    const p0 = closes[e.idx];
    const fi = e.idx + H;
    if (!(p0 > 0) || fi >= n) continue;
    const fwd = (closes[fi] / p0 - 1) * 100;
    const fav = side === "up" ? fwd : -fwd;
    const feats = CONDITIONERS.map((c) => c.on(e.idx, side));
    // Train windows must not read holdout bars (mirror evalConfig's truncation).
    if (holdoutFrac > 0 && e.idx < splitIdx && fi < splitIdx) train.push({ idx: e.idx, fav, feats });
    else if (holdoutFrac > 0 && e.idx >= splitIdx) holdout.push({ idx: e.idx, fav, feats });
    else if (holdoutFrac === 0) train.push({ idx: e.idx, fav, feats });
  }

  const rows: ConditionerRow[] = CONDITIONERS.map((c, ci) => {
    const tEvents = train.filter((e) => e.feats[ci] !== null).map((e) => ({ fav: e.fav, on: e.feats[ci] as boolean }));
    const hEvents = holdout.filter((e) => e.feats[ci] !== null).map((e) => ({ fav: e.fav, on: e.feats[ci] as boolean }));
    const tOn = split(tEvents, true), tOff = split(tEvents, false);
    const hOn = split(hEvents, true), hOff = split(hEvents, false);
    const upliftMean = tOn.n >= MIN_SPLIT && tOff.n >= MIN_SPLIT ? tOn.mean - tOff.mean : NaN;
    const upliftHit = tOn.n >= MIN_SPLIT && tOff.n >= MIN_SPLIT ? (tOn.hit - tOff.hit) * 100 : NaN;
    const oosUplift = hOn.n >= MIN_OOS_SPLIT && hOff.n >= MIN_OOS_SPLIT ? hOn.mean - hOff.mean : null;
    const confirmed = Number.isFinite(upliftMean) && oosUplift !== null
      ? Math.sign(oosUplift) === Math.sign(upliftMean) && upliftMean !== 0
      : null;
    return {
      id: c.id, label: c.label, side,
      train: { on: tOn, off: tOff },
      holdout: holdoutFrac > 0 ? { on: hOn, off: hOff } : null,
      upliftMean, upliftHit, oosUplift, confirmed,
    };
  });

  // Strongest (finite-uplift) conditioners first; unmeasurable ones trail.
  rows.sort((a, b) => {
    const af = Number.isFinite(a.upliftMean) ? Math.abs(a.upliftMean) : -1;
    const bf = Number.isFinite(b.upliftMean) ? Math.abs(b.upliftMean) : -1;
    return bf - af;
  });

  return { side, nTrain: train.length, nHoldout: holdout.length, rows };
}
