// Moving-average utilities used by SupportResistance.
// Thin wrapper over lib/maEngine (the full 12-type MA implementation).

import { computeMaByType, type MaType, MA_TYPES } from "@/lib/maEngine";

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

function asMaType(t: string | undefined): MaType {
  const up = (t ?? "SMA").toUpperCase();
  return (MA_TYPES as string[]).includes(up) ? (up as MaType) : "SMA";
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
  opts?: any
): (number | null)[] | MAResult[] {
  if (Array.isArray(closesOrInput)) {
    const closes = closesOrInput as number[];
    if (!closes.length || !period || period < 1) return new Array(closes.length).fill(null);
    return computeMaByType(closes, period, asMaType(maType), {
      highs: opts?.highs,
      lows: opts?.lows,
    });
  }
  const input = closesOrInput as MAInput;
  const closes = input?.closes ?? [];
  const periods = input?.periods ?? [];
  const types = input?.types ?? ["SMA"];
  const out: MAResult[] = [];
  for (const t of types) {
    for (const p of periods) {
      out.push({ period: p, type: t, values: computeMaByType(closes, p, asMaType(t)) });
    }
  }
  return out;
}

/** Compute a single simple moving average. */
export function computeSMA(values: number[], period: number): (number | null)[] {
  return computeMaByType(values, period, "SMA");
}

/** Compute a single exponential moving average. */
export function computeEMA(values: number[], period: number): (number | null)[] {
  return computeMaByType(values, period, "EMA");
}
