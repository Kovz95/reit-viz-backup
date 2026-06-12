// Stub — TODO: reverse-engineer from production bundle
// chartBridge provides a cross-page event bus so that PriceAction (and other
// pages) can push signals/annotations into embedded chart panels.

export interface ChartSignal {
  ticker: string;
  date: string;
  label?: string;
  type?: string;
  [key: string]: any;
}

/** Emit signals to any registered chart listeners. */
export function emitChartSignals(_signals: ChartSignal[]): void {
  // Stub — TODO: reverse-engineer from production bundle
}

/** Subscribe to chart signals. Returns an unsubscribe callback. */
export function onChartSignals(_listener: (signals: ChartSignal[]) => void): () => void {
  // Stub — TODO: reverse-engineer from production bundle
  return () => undefined;
}
