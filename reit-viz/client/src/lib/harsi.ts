// Stub — TODO: reverse-engineer algorithm from production bundle
// HARSI = Heikin-Ashi RSI (or similar hybrid oscillator).

export interface HarsiInput {
  closes: number[];
  highs?: number[];
  lows?: number[];
  period?: number;
  [key: string]: any;
}

export interface HarsiOutput {
  values: (number | null)[];
  signal?: (number | null)[];
  [key: string]: any;
}

/**
 * Compute the HARSI indicator series.
 * Accepts either a HarsiInput object OR positional args (closes, highs, lows, opts?).
 */
export function harsiCompute(input: HarsiInput): HarsiOutput;
export function harsiCompute(closes: number[], highs: number[], lows: number[], opts?: Record<string, any>): HarsiOutput;
export function harsiCompute(
  closesOrInput: number[] | HarsiInput,
  _highs?: number[],
  _lows?: number[],
  _opts?: any
): HarsiOutput {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return { values: [] };
}
