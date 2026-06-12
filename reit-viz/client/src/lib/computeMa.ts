// Hand-written from call-site inference
// Used in LevelsAndTrendlines.tsx: computeMa(closes, period, kind)

export type MaKind = "sma" | "ema" | "wma";

/**
 * Computes a moving average over `values`.
 * Returns an array of the same length; leading entries that lack enough history
 * are returned as `null`.
 */
export function computeMa(
  values: number[],
  period: number,
  kind: MaKind = "sma"
): (number | null)[] {
  if (!values || values.length === 0 || period < 1) return [];

  const n = values.length;
  const result: (number | null)[] = new Array(n).fill(null);

  if (kind === "sma") {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) result[i] = sum / period;
    }
  } else if (kind === "ema") {
    const k = 2 / (period + 1);
    let ema: number | null = null;
    for (let i = 0; i < n; i++) {
      if (ema === null) {
        if (i >= period - 1) {
          // Seed with SMA of first `period` values
          let seed = 0;
          for (let j = i - period + 1; j <= i; j++) seed += values[j];
          ema = seed / period;
          result[i] = ema;
        }
      } else {
        ema = values[i] * k + ema * (1 - k);
        result[i] = ema;
      }
    }
  } else if (kind === "wma") {
    const weightSum = (period * (period + 1)) / 2;
    for (let i = period - 1; i < n; i++) {
      let wSum = 0;
      for (let j = 0; j < period; j++) {
        wSum += values[i - j] * (period - j);
      }
      result[i] = wSum / weightSum;
    }
  }

  return result;
}
