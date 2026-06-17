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
