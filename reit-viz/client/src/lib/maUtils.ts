// Stub — TODO: reverse-engineer algorithm from production bundle
// Moving-average utilities used by SupportResistance.

export interface MAResult {
  period: number;
  type: string;
  values: (number | null)[];
}

export interface MAInput {
  closes: number[];
  periods?: number[];
  types?: string[];
}

/**
 * Compute all configured moving averages for the given price series.
 * Overload 1: positional args (closes, period, type, opts?) → returns flat (number|null)[] for the single series.
 * Overload 2: MAInput object → returns MAResult[] (one per combination).
 */
export function computeAllMAs(closes: number[], period: number, maType: string, opts?: { highs?: number[]; lows?: number[]; [key: string]: any }): (number | null)[];
export function computeAllMAs(input: MAInput): MAResult[];
export function computeAllMAs(
  closesOrInput: number[] | MAInput,
  period?: number,
  maType?: string,
  _opts?: any
): (number | null)[] | MAResult[] {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  if (Array.isArray(closesOrInput)) {
    // positional-args call: return stub flat array
    return new Array((closesOrInput as number[]).length).fill(null);
  }
  return [];
}

/**
 * Compute a single simple moving average.
 */
export function computeSMA(_values: number[], _period: number): (number | null)[] {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return [];
}

/**
 * Compute a single exponential moving average.
 */
export function computeEMA(_values: number[], _period: number): (number | null)[] {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return [];
}
