// Stub — TODO: reverse-engineer algorithm from production bundle

export interface RocSignalHandler extends Iterable<string> {
  key: string;
  label: string;
  [key: string]: any;
}

export interface SignalMetaEntry {
  label: string;
  direction: "buy" | "sell" | "neutral";
  category?: string;
  [key: string]: any;
}

export interface DetectedSignal {
  index: number;
  category: string;
  value: number;
  date?: string;
  [key: string]: any;
}

/**
 * Compute the Rate-of-Change (ROC) indicator for a price series.
 * Stub — TODO: reverse-engineer algorithm from production bundle.
 */
export function computeROC(
  _values: number[],
  _period: number
): (number | null)[] {
  return [];
}

/**
 * Registered ROC signal handler definitions, keyed by signal-type string.
 * Stub — TODO: reverse-engineer from production bundle.
 */
export const ROC_SIGNAL_HANDLERS: Record<string, RocSignalHandler> = {};

/**
 * Detect ROC-based signals in a price series using the given handler config.
 * Stub — TODO: reverse-engineer algorithm from production bundle.
 */
export function detectSignals(
  _closes: number[],
  _handlerOrHandlers: RocSignalHandler | Record<string, RocSignalHandler> | any[],
  _opts?: Record<string, any>,
  _startIdx?: number
): any {
  return {};
}

/**
 * Metadata (label, direction, etc.) for each signal category.
 * Stub — TODO: reverse-engineer from production bundle.
 */
export const SIGNAL_META: Record<string, SignalMetaEntry> = {};
