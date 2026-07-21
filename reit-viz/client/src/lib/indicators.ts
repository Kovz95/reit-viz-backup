// Technical indicator calculations

export interface DataPoint {
  time: string;
  value: number;
}

export function computeSMA(data: DataPoint[], period: number): DataPoint[] {
  const result: DataPoint[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].value;
    }
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

export function computeEMA(data: DataPoint[], period: number): DataPoint[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: DataPoint[] = [];
  
  // Start with SMA for first value
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].value;
  let ema = sum / period;
  result.push({ time: data[period - 1].time, value: ema });
  
  for (let i = period; i < data.length; i++) {
    ema = data[i].value * k + ema * (1 - k);
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

/**
 * Least Squares Moving Average (LSMA).
 *
 * For each window of `period` bars ending at index i, fit a linear regression
 * y = intercept + slope * x  (x = 0..period-1, oldest→newest) and emit the
 * regression value at the window endpoint, shifted back by `offset` bars:
 *
 *   value = intercept + slope * (period - 1 - offset)
 *
 * Closed-form slope/intercept use the known sums of x and x² over 0..period-1.
 * Mirrors the production bundle's `GP`/linreg-MA implementation.
 */
export function computeLSMA(data: DataPoint[], period: number, offset = 0): DataPoint[] {
  const n = data.length;
  if (n === 0 || period < 2 || n < period) return [];

  const p = period;
  const sumX = (p * (p - 1)) / 2;
  const sumXX = ((p - 1) * p * (2 * p - 1)) / 6;
  const denom = p * sumXX - sumX * sumX;
  if (denom === 0) return [];

  const result: DataPoint[] = [];
  for (let i = period - 1; i < n; i++) {
    let sumY = 0;
    let sumXY = 0;
    let ok = true;
    for (let j = 0; j < period; j++) {
      const v = data[i - period + 1 + j].value;
      if (v === null || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      sumY += v;
      sumXY += j * v;
    }
    if (!ok) continue;
    const slope = (p * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / p;
    result.push({ time: data[i].time, value: intercept + slope * (period - 1 - offset) });
  }
  return result;
}

/**
 * Smoothed Least Squares Moving Average (SLSMA): the LSMA of the LSMA.
 * Matches the production bundle's `X8e` (LSMA applied twice with the same
 * period & offset).
 */
export function computeSLSMA(data: DataPoint[], period: number, offset = 0): DataPoint[] {
  const first = computeLSMA(data, period, offset);
  return computeLSMA(first, period, offset);
}

export function computeMACD(data: DataPoint[], fast = 12, slow = 26, signal = 9) {
  const emaFast = computeEMA(data, fast);
  const emaSlow = computeEMA(data, slow);
  
  // Align by time
  const slowMap = new Map(emaSlow.map(d => [d.time, d.value]));
  const macdLine: DataPoint[] = [];
  
  for (const f of emaFast) {
    const s = slowMap.get(f.time);
    if (s !== undefined) {
      macdLine.push({ time: f.time, value: f.value - s });
    }
  }
  
  const signalLine = computeEMA(macdLine, signal);
  const signalMap = new Map(signalLine.map(d => [d.time, d.value]));
  
  const histogram: DataPoint[] = [];
  for (const m of macdLine) {
    const s = signalMap.get(m.time);
    if (s !== undefined) {
      histogram.push({ time: m.time, value: m.value - s });
    }
  }
  
  return { macdLine, signalLine, histogram };
}

export function computeRSI(data: DataPoint[], period = 14): DataPoint[] {
  if (data.length < period + 1) return [];
  
  const result: DataPoint[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  
  // Initial average
  for (let i = 1; i <= period; i++) {
    const change = data[i].value - data[i - 1].value;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;
  
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push({ time: data[period].time, value: 100 - 100 / (1 + rs) });
  
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].value - data[i - 1].value;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: data[i].time, value: rsi });
  }
  
  return result;
}

/** Hull Moving Average: WMA(2*WMA(n/2) - WMA(n), sqrt(n)) */
export function computeHMA(data: DataPoint[], period: number): DataPoint[] {
  if (data.length < period) return [];

  function wma(src: DataPoint[], len: number): DataPoint[] {
    const out: DataPoint[] = [];
    const denom = (len * (len + 1)) / 2;
    for (let i = len - 1; i < src.length; i++) {
      let sum = 0;
      for (let j = 0; j < len; j++) {
        sum += src[i - j].value * (len - j);
      }
      out.push({ time: src[i].time, value: sum / denom });
    }
    return out;
  }

  const halfPeriod = Math.max(1, Math.round(period / 2));
  const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)));

  const wmaHalf = wma(data, halfPeriod);
  const wmaFull = wma(data, period);

  // Align by time
  const fullMap = new Map(wmaFull.map(d => [d.time, d.value]));
  const diff: DataPoint[] = [];
  for (const h of wmaHalf) {
    const f = fullMap.get(h.time);
    if (f !== undefined) {
      diff.push({ time: h.time, value: 2 * h.value - f });
    }
  }

  return wma(diff, sqrtPeriod);
}

/** Static (full-series) mean + std bands */
export function computeMeanAndStdBands(data: DataPoint[], _lookback?: number) {
  const subset = _lookback ? data.slice(-_lookback) : data;
  if (subset.length === 0) return { mean: 0, std: 0 };
  
  const mean = subset.reduce((s, d) => s + d.value, 0) / subset.length;
  const variance = subset.reduce((s, d) => s + (d.value - mean) ** 2, 0) / subset.length;
  const std = Math.sqrt(variance);
  
  return { mean, std };
}

/** Rolling mean + ±1σ / ±2σ bands */
export function computeRollingMeanBands(
  data: DataPoint[],
  period: number
): { mean: DataPoint[]; bands: { mult: number; data: DataPoint[] }[] } {
  const meanArr: DataPoint[] = [];
  const bandArrays: DataPoint[][] = [[], [], [], []]; // +1, -1, +2, -2

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].value;
    const m = sum / period;

    let sumSq = 0;
    for (let j = 0; j < period; j++) {
      const diff = data[i - j].value - m;
      sumSq += diff * diff;
    }
    const s = Math.sqrt(sumSq / period);

    meanArr.push({ time: data[i].time, value: m });
    bandArrays[0].push({ time: data[i].time, value: m + s });
    bandArrays[1].push({ time: data[i].time, value: m - s });
    bandArrays[2].push({ time: data[i].time, value: m + 2 * s });
    bandArrays[3].push({ time: data[i].time, value: m - 2 * s });
  }

  return {
    mean: meanArr,
    bands: [
      { mult: 1, data: bandArrays[0] },
      { mult: -1, data: bandArrays[1] },
      { mult: 2, data: bandArrays[2] },
      { mult: -2, data: bandArrays[3] },
    ],
  };
}

/**
 * Compute Heikin-Ashi candles from a single-value time series.
 *
 * Since we only have {time, value} (i.e. a "close" per date), we synthesize
 * OHLC by treating consecutive values as open → close, then apply the
 * standard Heikin-Ashi formula:
 *
 *   HA_Close = (synOpen + synHigh + synLow + synClose) / 4
 *   HA_Open  = (prev_HA_Open + prev_HA_Close) / 2
 *   HA_High  = max(synHigh, HA_Open, HA_Close)
 *   HA_Low   = min(synLow,  HA_Open, HA_Close)
 *
 * For the first candle:
 *   HA_Open  = (synOpen + synClose) / 2
 *   HA_Close = (synOpen + synHigh + synLow + synClose) / 4
 *
 * The color flips (green → red or red → green) signal trend changes.
 */
export interface HeikinAshiCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type HASmoothType = "none" | "SMA" | "EMA" | "WMA";

export interface HASmoothConfig {
  type: HASmoothType;
  period: number;
}

/** Weighted Moving Average helper */
function wmaSmooth(data: DataPoint[], period: number): DataPoint[] {
  const out: DataPoint[] = [];
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].value * (period - j);
    }
    out.push({ time: data[i].time, value: sum / denom });
  }
  return out;
}

/** Apply smoothing MA to a DataPoint[] array */
function applySmoothMA(data: DataPoint[], cfg: HASmoothConfig): DataPoint[] {
  if (cfg.type === "none" || cfg.period <= 1) return data;
  switch (cfg.type) {
    case "SMA": return computeSMA(data, cfg.period);
    case "EMA": return computeEMA(data, cfg.period);
    case "WMA": return wmaSmooth(data, cfg.period);
    default: return data;
  }
}

export function computeHeikinAshi(
  data: DataPoint[],
  smoothing?: HASmoothConfig,
): HeikinAshiCandle[] {
  // Pre-smooth the source data if requested (like TradingView HA smoothing)
  const src = smoothing ? applySmoothMA(data, smoothing) : data;
  if (src.length < 2) return [];

  const result: HeikinAshiCandle[] = [];

  for (let i = 1; i < src.length; i++) {
    // Synthetic OHLC from the line series
    const synOpen = src[i - 1].value;
    const synClose = src[i].value;
    const synHigh = Math.max(synOpen, synClose);
    const synLow = Math.min(synOpen, synClose);

    let haClose: number;
    let haOpen: number;
    let haHigh: number;
    let haLow: number;

    haClose = (synOpen + synHigh + synLow + synClose) / 4;

    if (result.length === 0) {
      // First HA candle
      haOpen = (synOpen + synClose) / 2;
    } else {
      const prev = result[result.length - 1];
      haOpen = (prev.open + prev.close) / 2;
    }

    haHigh = Math.max(synHigh, haOpen, haClose);
    haLow = Math.min(synLow, haOpen, haClose);

    result.push({
      time: src[i].time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });
  }

  return result;
}

/**
 * Detect Heikin-Ashi color-change signals.
 * Returns an array of signal points where the HA candles flip color:
 *   - "bullish" = red → green (HA close > HA open after a red candle)
 *   - "bearish" = green → red (HA close < HA open after a green candle)
 *
 * Each signal includes the time and value from the original series so
 * markers can be placed directly on the primary line chart.
 */
export interface HASignal {
  time: string;
  value: number;           // original series value at this point
  direction: "bullish" | "bearish";
}

export function computeHASignals(data: DataPoint[], smoothing?: HASmoothConfig): HASignal[] {
  const haCandles = computeHeikinAshi(data, smoothing);
  if (haCandles.length < 2) return [];

  const signals: HASignal[] = [];
  // Build a quick lookup from time → original value
  const valueMap = new Map(data.map(d => [d.time, d.value]));

  for (let i = 1; i < haCandles.length; i++) {
    const prev = haCandles[i - 1];
    const curr = haCandles[i];
    const prevGreen = prev.close >= prev.open;
    const currGreen = curr.close >= curr.open;

    if (prevGreen !== currGreen) {
      const origValue = valueMap.get(curr.time);
      if (origValue !== undefined) {
        signals.push({
          time: curr.time,
          value: origValue,
          direction: currGreen ? "bullish" : "bearish",
        });
      }
    }
  }

  return signals;
}

// ── Bollinger Bands ──
export function computeBollingerBands(
  data: DataPoint[],
  period = 20,
  mult = 2,
): { basis: DataPoint[]; upper: DataPoint[]; lower: DataPoint[] } {
  const basis: DataPoint[] = [];
  const upper: DataPoint[] = [];
  const lower: DataPoint[] = [];

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].value;
    const mean = sum / period;

    let sumSq = 0;
    for (let j = 0; j < period; j++) {
      const diff = data[i - j].value - mean;
      sumSq += diff * diff;
    }
    const std = Math.sqrt(sumSq / period);

    basis.push({ time: data[i].time, value: mean });
    upper.push({ time: data[i].time, value: mean + mult * std });
    lower.push({ time: data[i].time, value: mean - mult * std });
  }

  return { basis, upper, lower };
}

// ── ATR (Average True Range) ──
// For single-value series we approximate TR as |value - prev_value|
export function computeATR(data: DataPoint[], period = 14): DataPoint[] {
  if (data.length < 2) return [];

  // True range approximation from close-only data
  const tr: number[] = [];
  for (let i = 1; i < data.length; i++) {
    tr.push(Math.abs(data[i].value - data[i - 1].value));
  }

  if (tr.length < period) return [];

  const result: DataPoint[] = [];
  // Initial ATR: simple average of first `period` TR values
  let atr = 0;
  for (let i = 0; i < period; i++) atr += tr[i];
  atr /= period;
  result.push({ time: data[period].time, value: atr });

  // Smoothed ATR (Wilder's method)
  for (let i = period; i < tr.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result.push({ time: data[i + 1].time, value: atr });
  }

  return result;
}

// ── VWAP (Anchored) ──
// For daily close-only data, we compute a cumulative average from the start.
// If volume data is available, pass it; otherwise it's just a running average.
export function computeVWAP(
  data: DataPoint[],
  volume?: DataPoint[],
): DataPoint[] {
  if (data.length === 0) return [];

  const result: DataPoint[] = [];

  if (volume && volume.length > 0) {
    const volMap = new Map(volume.map(d => [d.time, d.value]));
    let cumPV = 0;
    let cumVol = 0;

    for (const d of data) {
      const vol = volMap.get(d.time) ?? 0;
      cumPV += d.value * vol;
      cumVol += vol;
      result.push({
        time: d.time,
        value: cumVol > 0 ? cumPV / cumVol : d.value,
      });
    }
  } else {
    // No volume: running cumulative average of price
    let cumSum = 0;
    for (let i = 0; i < data.length; i++) {
      cumSum += data[i].value;
      result.push({ time: data[i].time, value: cumSum / (i + 1) });
    }
  }

  return result;
}

// ── ROC (Rate of Change) ──
export function computeROC(data: DataPoint[], period = 12): DataPoint[] {
  const result: DataPoint[] = [];
  for (let i = period; i < data.length; i++) {
    const prev = data[i - period].value;
    const roc = prev !== 0 ? ((data[i].value - prev) / prev) * 100 : 0;
    result.push({ time: data[i].time, value: roc });
  }
  return result;
}

// ── Stochastic Oscillator ──
export function computeStochastic(
  data: DataPoint[],
  kPeriod = 14,
  dPeriod = 3,
): { k: DataPoint[]; d: DataPoint[] } {
  if (data.length < kPeriod) return { k: [], d: [] };

  const kLine: DataPoint[] = [];

  for (let i = kPeriod - 1; i < data.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      const val = data[i - j].value;
      if (val > highest) highest = val;
      if (val < lowest) lowest = val;
    }
    const range = highest - lowest;
    const k = range === 0 ? 50 : ((data[i].value - lowest) / range) * 100;
    kLine.push({ time: data[i].time, value: k });
  }

  // %D is SMA of %K
  const dLine = computeSMA(kLine, dPeriod);

  return { k: kLine, d: dLine };
}

// ── OBV (On Balance Volume) ──
// Works with close-only data by using sign of price change as volume proxy (+1/-1)
export function computeOBV(
  data: DataPoint[],
  volume?: DataPoint[],
): DataPoint[] {
  if (data.length < 2) return [];

  const result: DataPoint[] = [];
  let obv = 0;

  if (volume && volume.length > 0) {
    const volMap = new Map(volume.map(d => [d.time, d.value]));
    result.push({ time: data[0].time, value: 0 });

    for (let i = 1; i < data.length; i++) {
      const vol = volMap.get(data[i].time) ?? 0;
      if (data[i].value > data[i - 1].value) obv += vol;
      else if (data[i].value < data[i - 1].value) obv -= vol;
      result.push({ time: data[i].time, value: obv });
    }
  } else {
    // No volume data — use unit volume (direction only)
    result.push({ time: data[0].time, value: 0 });
    for (let i = 1; i < data.length; i++) {
      if (data[i].value > data[i - 1].value) obv += 1;
      else if (data[i].value < data[i - 1].value) obv -= 1;
      result.push({ time: data[i].time, value: obv });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// OHLC-based indicators
//
// The Charts pane carries real open/high/low/close per bar (the `ohlcData`
// prop), so these compute over an `OhlcBar[]` rather than the close-only
// `DataPoint[]` the older indicators use. They are the accurate versions of
// range/channel/trend indicators that can't be derived from close alone.
// ─────────────────────────────────────────────────────────────────────────

export interface OhlcBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Wilder True Range per bar: max(H-L, |H-prevClose|, |L-prevClose|).
 *  tr[0] = H-L of the first bar (no prior close). Returned array is aligned
 *  1:1 with `bars` (same length, same index). */
function trueRange(bars: OhlcBar[]): number[] {
  const tr: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    if (i === 0) {
      tr.push(h - l);
    } else {
      const pc = bars[i - 1].close;
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
  }
  return tr;
}

/** Accurate ATR from real high/low/close (Wilder smoothing). Unlike the
 *  close-only `computeATR`, this uses the full true range. */
export function computeATRFromOHLC(bars: OhlcBar[], period = 14): DataPoint[] {
  const n = bars.length;
  if (n < period + 1) return [];
  const tr = trueRange(bars);

  const result: DataPoint[] = [];
  // Seed with the simple average of the first `period` true ranges (indices
  // 1..period — skip tr[0] which has no prior close), emitted at bars[period].
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += tr[i];
  atr /= period;
  result.push({ time: bars[period].time, value: atr });

  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    result.push({ time: bars[i].time, value: atr });
  }
  return result;
}

/** ADX / DMI (Wilder). Returns +DI, -DI (directional indicators) and ADX
 *  (trend strength), all 0..100. */
export function computeADX(
  bars: OhlcBar[],
  period = 14,
): { adx: DataPoint[]; plusDI: DataPoint[]; minusDI: DataPoint[] } {
  const n = bars.length;
  if (n < period + 1) return { adx: [], plusDI: [], minusDI: [] };

  // Per-bar TR / +DM / -DM for i >= 1 (need a prior bar).
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 1; i < n; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const up = h - bars[i - 1].high;
    const down = bars[i - 1].low - l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  // tr[k] corresponds to bars[k + 1].
  const len = tr.length;
  if (len < period) return { adx: [], plusDI: [], minusDI: [] };

  let trS = 0;
  let pS = 0;
  let mS = 0;
  for (let i = 0; i < period; i++) {
    trS += tr[i];
    pS += plusDM[i];
    mS += minusDM[i];
  }

  const plusDI: DataPoint[] = [];
  const minusDI: DataPoint[] = [];
  const dxArr: DataPoint[] = [];
  const emit = (trIdx: number) => {
    const pdi = trS === 0 ? 0 : (100 * pS) / trS;
    const mdi = trS === 0 ? 0 : (100 * mS) / trS;
    const time = bars[trIdx + 1].time;
    plusDI.push({ time, value: pdi });
    minusDI.push({ time, value: mdi });
    const sum = pdi + mdi;
    dxArr.push({ time, value: sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum });
  };
  emit(period - 1);
  for (let i = period; i < len; i++) {
    // Wilder smoothing: subtract the running average, add the new value.
    trS = trS - trS / period + tr[i];
    pS = pS - pS / period + plusDM[i];
    mS = mS - mS / period + minusDM[i];
    emit(i);
  }

  const adx: DataPoint[] = [];
  if (dxArr.length >= period) {
    let a = 0;
    for (let i = 0; i < period; i++) a += dxArr[i].value;
    a /= period;
    adx.push({ time: dxArr[period - 1].time, value: a });
    for (let i = period; i < dxArr.length; i++) {
      a = (a * (period - 1) + dxArr[i].value) / period;
      adx.push({ time: dxArr[i].time, value: a });
    }
  }
  return { adx, plusDI, minusDI };
}

/** Commodity Channel Index. Oscillator centered on 0, typically read against
 *  ±100. */
export function computeCCI(bars: OhlcBar[], period = 20): DataPoint[] {
  const n = bars.length;
  if (n < period) return [];
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  const result: DataPoint[] = [];
  for (let i = period - 1; i < n; i++) {
    let sma = 0;
    for (let j = 0; j < period; j++) sma += tp[i - j];
    sma /= period;
    let md = 0;
    for (let j = 0; j < period; j++) md += Math.abs(tp[i - j] - sma);
    md /= period;
    const cci = md === 0 ? 0 : (tp[i] - sma) / (0.015 * md);
    result.push({ time: bars[i].time, value: cci });
  }
  return result;
}

/** Percent distance of close from its own SMA: (close / SMA(period) - 1) * 100.
 *  Oscillator centered on 0; positive = price extended above trend. Emits from
 *  bar period-1 onward (rolling-sum SMA, O(n)). */
export function computeMADistance(bars: OhlcBar[], period = 200): DataPoint[] {
  const n = bars.length;
  if (n < period) return [];
  const result: DataPoint[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) {
      const ma = sum / period;
      if (ma !== 0) result.push({ time: bars[i].time, value: (bars[i].close / ma - 1) * 100 });
    }
  }
  return result;
}

/** Williams %R. Ranges -100 (oversold) .. 0 (overbought). */
export function computeWilliamsR(bars: OhlcBar[], period = 14): DataPoint[] {
  const n = bars.length;
  if (n < period) return [];
  const result: DataPoint[] = [];
  for (let i = period - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < period; j++) {
      if (bars[i - j].high > hh) hh = bars[i - j].high;
      if (bars[i - j].low < ll) ll = bars[i - j].low;
    }
    const range = hh - ll;
    result.push({
      time: bars[i].time,
      value: range === 0 ? -50 : (-100 * (hh - bars[i].close)) / range,
    });
  }
  return result;
}

/** Aroon Up / Aroon Down, 0..100. Measures how recently the highest high /
 *  lowest low occurred within the lookback (period + 1 bars). */
export function computeAroon(
  bars: OhlcBar[],
  period = 14,
): { up: DataPoint[]; down: DataPoint[] } {
  const n = bars.length;
  const up: DataPoint[] = [];
  const down: DataPoint[] = [];
  if (n < period + 1) return { up, down };
  for (let i = period; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    let hIdx = 0;
    let lIdx = 0;
    // j = bars since the current bar (0 = current). Strict compares keep the
    // most-recent extreme on ties (smaller j wins).
    for (let j = 0; j <= period; j++) {
      const h = bars[i - j].high;
      const l = bars[i - j].low;
      if (h > hh) {
        hh = h;
        hIdx = j;
      }
      if (l < ll) {
        ll = l;
        lIdx = j;
      }
    }
    up.push({ time: bars[i].time, value: (100 * (period - hIdx)) / period });
    down.push({ time: bars[i].time, value: (100 * (period - lIdx)) / period });
  }
  return { up, down };
}

/** Supertrend. Trend-following overlay line that flips side when price closes
 *  through it. `trend` is +1 (bullish, line below price) or -1 (bearish). */
export interface SupertrendPoint {
  time: string;
  value: number;
  trend: 1 | -1;
}
export function computeSupertrend(
  bars: OhlcBar[],
  period = 10,
  mult = 3,
): SupertrendPoint[] {
  const atr = computeATRFromOHLC(bars, period);
  if (atr.length === 0) return [];
  const atrMap = new Map(atr.map((d) => [d.time, d.value]));

  const result: SupertrendPoint[] = [];
  let longStopPrev = NaN;
  let shortStopPrev = NaN;
  let dir: 1 | -1 = 1;
  let prevClose = NaN;
  for (let i = 0; i < bars.length; i++) {
    const a = atrMap.get(bars[i].time);
    if (a === undefined) {
      prevClose = bars[i].close;
      continue;
    }
    const hl2 = (bars[i].high + bars[i].low) / 2;
    let longStop = hl2 - mult * a;
    let shortStop = hl2 + mult * a;
    if (!Number.isNaN(longStopPrev)) {
      longStop = prevClose > longStopPrev ? Math.max(longStop, longStopPrev) : longStop;
      shortStop = prevClose < shortStopPrev ? Math.min(shortStop, shortStopPrev) : shortStop;
      dir =
        dir === -1 && bars[i].close > shortStopPrev
          ? 1
          : dir === 1 && bars[i].close < longStopPrev
            ? -1
            : dir;
    } else {
      dir = 1;
    }
    result.push({ time: bars[i].time, value: dir === 1 ? longStop : shortStop, trend: dir });
    longStopPrev = longStop;
    shortStopPrev = shortStop;
    prevClose = bars[i].close;
  }
  return result;
}

/** Parabolic SAR (Wilder). Dots below price in an uptrend, above in a
 *  downtrend; `trend` is +1 / -1. */
export interface PSARPoint {
  time: string;
  value: number;
  trend: 1 | -1;
}
export function computePSAR(
  bars: OhlcBar[],
  step = 0.02,
  maxStep = 0.2,
): PSARPoint[] {
  const n = bars.length;
  if (n < 2) return [];
  const result: PSARPoint[] = [];
  let uptrend = bars[1].close >= bars[0].close;
  let sar = uptrend ? bars[0].low : bars[0].high;
  let ep = uptrend ? bars[0].high : bars[0].low; // extreme point
  let af = step; // acceleration factor

  for (let i = 1; i < n; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    let next = sar + af * (ep - sar);

    if (uptrend) {
      // SAR can't exceed the prior two lows.
      next = Math.min(next, bars[i - 1].low, i >= 2 ? bars[i - 2].low : bars[i - 1].low);
      if (l < next) {
        // Reverse to downtrend.
        uptrend = false;
        next = ep;
        ep = l;
        af = step;
      } else if (h > ep) {
        ep = h;
        af = Math.min(af + step, maxStep);
      }
    } else {
      next = Math.max(next, bars[i - 1].high, i >= 2 ? bars[i - 2].high : bars[i - 1].high);
      if (h > next) {
        uptrend = true;
        next = ep;
        ep = h;
        af = step;
      } else if (l < ep) {
        ep = l;
        af = Math.min(af + step, maxStep);
      }
    }
    sar = next;
    result.push({ time: bars[i].time, value: sar, trend: uptrend ? 1 : -1 });
  }
  return result;
}

/** Keltner Channels: EMA basis with ATR-scaled bands. */
export function computeKeltner(
  bars: OhlcBar[],
  period = 20,
  mult = 2,
  atrPeriod = 10,
): { basis: DataPoint[]; upper: DataPoint[]; lower: DataPoint[] } {
  const close: DataPoint[] = bars.map((b) => ({ time: b.time, value: b.close }));
  const basisArr = computeEMA(close, period);
  const atr = computeATRFromOHLC(bars, atrPeriod);
  const atrMap = new Map(atr.map((d) => [d.time, d.value]));

  const basis: DataPoint[] = [];
  const upper: DataPoint[] = [];
  const lower: DataPoint[] = [];
  for (const b of basisArr) {
    const a = atrMap.get(b.time);
    if (a === undefined) continue;
    basis.push(b);
    upper.push({ time: b.time, value: b.value + mult * a });
    lower.push({ time: b.time, value: b.value - mult * a });
  }
  return { basis, upper, lower };
}

/** Donchian Channels: highest high / lowest low over the period, plus midline. */
export function computeDonchian(
  bars: OhlcBar[],
  period = 20,
): { upper: DataPoint[]; lower: DataPoint[]; mid: DataPoint[] } {
  const n = bars.length;
  const upper: DataPoint[] = [];
  const lower: DataPoint[] = [];
  const mid: DataPoint[] = [];
  if (n < period) return { upper, lower, mid };
  for (let i = period - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < period; j++) {
      if (bars[i - j].high > hh) hh = bars[i - j].high;
      if (bars[i - j].low < ll) ll = bars[i - j].low;
    }
    upper.push({ time: bars[i].time, value: hh });
    lower.push({ time: bars[i].time, value: ll });
    mid.push({ time: bars[i].time, value: (hh + ll) / 2 });
  }
  return { upper, lower, mid };
}

/**
 * Ichimoku Kinko Hyo. Returns the five component lines computed at their
 * source bar (no displacement applied here). The render layer shifts
 * leadA/leadB forward and lagging backward by `displacement` bars along the
 * date axis, and fills the kumo cloud between leadA and leadB.
 *
 *   conversion (Tenkan) = midpoint of high/low over `conv`
 *   base       (Kijun)  = midpoint of high/low over `base`
 *   leadA (Senkou A)    = (conversion + base) / 2         → +displacement
 *   leadB (Senkou B)    = midpoint of high/low over `spanB` → +displacement
 *   lagging (Chikou)    = close                           → -displacement
 */
export function computeIchimoku(
  bars: OhlcBar[],
  conv = 9,
  base = 26,
  spanB = 52,
  displacement = 26,
): {
  conversion: DataPoint[];
  base: DataPoint[];
  leadA: DataPoint[];
  leadB: DataPoint[];
  lagging: DataPoint[];
  displacement: number;
} {
  const n = bars.length;
  const midpoint = (i: number, len: number): number => {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < len; j++) {
      if (bars[i - j].high > hh) hh = bars[i - j].high;
      if (bars[i - j].low < ll) ll = bars[i - j].low;
    }
    return (hh + ll) / 2;
  };

  const conversion: DataPoint[] = [];
  const baseLine: DataPoint[] = [];
  const leadA: DataPoint[] = [];
  const leadB: DataPoint[] = [];
  const lagging: DataPoint[] = [];

  for (let i = 0; i < n; i++) {
    lagging.push({ time: bars[i].time, value: bars[i].close });
    const c = i >= conv - 1 ? midpoint(i, conv) : undefined;
    const b = i >= base - 1 ? midpoint(i, base) : undefined;
    if (c !== undefined) conversion.push({ time: bars[i].time, value: c });
    if (b !== undefined) baseLine.push({ time: bars[i].time, value: b });
    if (c !== undefined && b !== undefined) {
      leadA.push({ time: bars[i].time, value: (c + b) / 2 });
    }
    if (i >= spanB - 1) leadB.push({ time: bars[i].time, value: midpoint(i, spanB) });
  }

  return { conversion, base: baseLine, leadA, leadB, lagging, displacement };
}

/**
 * Slow Stochastic (OHLC). Raw %K = stochastic of close within the high/low
 * range over `kPeriod`, smoothed by SMA-`slowing` (the "slow" step, default 3),
 * then %D = SMA(slow %K, `dPeriod`). Read against the 80/20 bands.
 */
export function computeSlowStochastic(
  bars: OhlcBar[],
  kPeriod = 14,
  dPeriod = 3,
  slowing = 3,
): { k: DataPoint[]; d: DataPoint[] } {
  const n = bars.length;
  if (n < kPeriod) return { k: [], d: [] };

  const rawK: DataPoint[] = [];
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      if (bars[i - j].high > hh) hh = bars[i - j].high;
      if (bars[i - j].low < ll) ll = bars[i - j].low;
    }
    const range = hh - ll;
    rawK.push({
      time: bars[i].time,
      value: range === 0 ? 50 : ((bars[i].close - ll) / range) * 100,
    });
  }

  const slowK = computeSMA(rawK, slowing);
  const dLine = computeSMA(slowK, dPeriod);
  return { k: slowK, d: dLine };
}

export function computeCorrelation(seriesA: DataPoint[], seriesB: DataPoint[], window: number): DataPoint[] {
  // Align series by date
  const mapB = new Map(seriesB.map(d => [d.time, d.value]));
  const aligned: { time: string; a: number; b: number }[] = [];
  
  for (const d of seriesA) {
    const bVal = mapB.get(d.time);
    if (bVal !== undefined) {
      aligned.push({ time: d.time, a: d.value, b: bVal });
    }
  }
  
  const result: DataPoint[] = [];
  for (let i = window - 1; i < aligned.length; i++) {
    const slice = aligned.slice(i - window + 1, i + 1);
    const meanA = slice.reduce((s, d) => s + d.a, 0) / window;
    const meanB = slice.reduce((s, d) => s + d.b, 0) / window;
    
    let covAB = 0, varA = 0, varB = 0;
    for (const d of slice) {
      covAB += (d.a - meanA) * (d.b - meanB);
      varA += (d.a - meanA) ** 2;
      varB += (d.b - meanB) ** 2;
    }
    
    const denom = Math.sqrt(varA * varB);
    const corr = denom === 0 ? 0 : covAB / denom;
    result.push({ time: aligned[i].time, value: Math.round(corr * 10000) / 10000 });
  }
  
  return result;
}
