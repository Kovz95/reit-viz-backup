// Stub — TODO: reverse-engineer from production bundle
// EarningsDatePrimitive renders vertical lines (or markers) on a
// lightweight-charts chart at each earnings date for a given ticker.

export interface EarningsDatePrimitiveOptions {
  ticker: string;
  dates: string[];
  color?: string;
  lineWidth?: number;
  [key: string]: any;
}

/**
 * A lightweight-charts series primitive that draws vertical earnings markers.
 * Stub — the real implementation attaches to a chart series via .attachPrimitive().
 */
export class EarningsDatePrimitive {
  constructor(_options: EarningsDatePrimitiveOptions) {
    // Stub — TODO: reverse-engineer from production bundle
  }

  /** Update the list of earnings dates. */
  update(_dates: string[]): void {
    // Stub
  }

  /** Detach from the series. */
  detach(): void {
    // Stub
  }
}
