// Hand-written stub — computeMA and MA_TYPES used in DualMAOptimizer.tsx
export type MAType = "SMA" | "EMA" | "WMA" | "DEMA" | "TEMA" | "HMA";

export const MA_TYPES: MAType[] = ["SMA", "EMA", "WMA", "DEMA", "TEMA", "HMA"];

/**
 * Computes a moving average of the given type.
 * Returns an array of the same length; leading nulls where insufficient history.
 */
export function computeMA(
  values: number[],
  period: number,
  type: MAType = "SMA"
): (number | null)[] {
  if (!values || values.length === 0 || period < 1) return [];
  const n = values.length;
  const result: (number | null)[] = new Array(n).fill(null);

  if (type === "SMA" || type === "WMA") {
    // Simple delegation
    const k = type === "WMA" ? (period * (period + 1)) / 2 : 0;
    for (let i = period - 1; i < n; i++) {
      if (type === "SMA") {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += values[j];
        result[i] = sum / period;
      } else {
        let wSum = 0;
        for (let j = 0; j < period; j++) wSum += values[i - j] * (period - j);
        result[i] = wSum / k;
      }
    }
  } else if (type === "EMA" || type === "DEMA" || type === "TEMA") {
    const kk = 2 / (period + 1);
    let ema1: number | null = null;
    const ema1Series: (number | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (ema1 === null) {
        if (i >= period - 1) {
          let seed = 0;
          for (let j = i - period + 1; j <= i; j++) seed += values[j];
          ema1 = seed / period;
          ema1Series[i] = ema1;
        }
      } else {
        ema1 = values[i] * kk + ema1 * (1 - kk);
        ema1Series[i] = ema1;
      }
    }
    if (type === "EMA") {
      return ema1Series;
    }
    // DEMA = 2*EMA1 - EMA2
    let ema2: number | null = null;
    const ema2Series: (number | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const e1 = ema1Series[i];
      if (e1 == null) continue;
      if (ema2 === null) ema2 = e1;
      else ema2 = e1 * kk + ema2 * (1 - kk);
      ema2Series[i] = ema2;
    }
    if (type === "DEMA") {
      for (let i = 0; i < n; i++) {
        const e1 = ema1Series[i];
        const e2 = ema2Series[i];
        result[i] = e1 != null && e2 != null ? 2 * e1 - e2 : null;
      }
      return result;
    }
    // TEMA = 3*EMA1 - 3*EMA2 + EMA3
    let ema3: number | null = null;
    for (let i = 0; i < n; i++) {
      const e2 = ema2Series[i];
      if (e2 == null) continue;
      if (ema3 === null) ema3 = e2;
      else ema3 = e2 * kk + ema3 * (1 - kk);
      const e1 = ema1Series[i];
      result[i] = e1 != null ? 3 * e1 - 3 * e2 + ema3 : null;
    }
    return result;
  } else if (type === "HMA") {
    // HMA = WMA(2*WMA(period/2) - WMA(period), sqrt(period))
    // Simplified: fall back to SMA for the stub
    for (let i = period - 1; i < n; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      result[i] = sum / period;
    }
  }

  return result;
}
