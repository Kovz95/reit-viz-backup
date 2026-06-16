// Driver / factor scan engine.
//
// NOTE: The full scan algorithm lives in the production chunk driverScan-BlD7pNfH.js
// (minified only — no beautified version exists yet). Until it is reverse-engineered,
// the exports below are SHAPE-ACCURATE stubs: they satisfy Correlation.tsx's Drivers
// tab (which imports SCAN_WINDOWS, runDriverScan, driverScanToCsv) so the page builds
// and renders, and a scan returns zero rows gracefully rather than crashing.
// TODO: reconstruct the real factor-correlation engine from driverScan-BlD7pNfH.js.

/** Rolling-window sizes (trading days) the scan correlates each factor over. */
export const SCAN_WINDOWS = [30, 60, 120, 252, 504, 756];

export interface DriverScanRow {
  rank: number;
  label: string;
  spec: string;
  category: string;
  bestAbsCorr: number;
  bestCorr: number;
  spearman: number;
  bestWindow: number;
  bestLag: number;
  stability: number;
  pVal: number;
  windowCorrs: number[];
}

export interface DriverScanRunResult {
  ticker: string;
  targetMode: string;
  rows: DriverScanRow[];
  totalFactors: number;
  durationMs: number;
}

export interface RunDriverScanOptions {
  ticker: string;
  targetMode: string;
  includeMacro?: boolean;
  includeFund?: boolean;
  minObs?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number, phase: string) => void;
}

/**
 * Run the driver / factor scan for one ticker against ~200 macro/fundamental factors
 * across SCAN_WINDOWS and a set of lags. STUB: returns an empty result set.
 */
export async function runDriverScan(opts: RunDriverScanOptions): Promise<DriverScanRunResult> {
  opts.onProgress?.(0, 0, "Scan engine not yet reconstructed");
  return {
    ticker: opts.ticker,
    targetMode: opts.targetMode,
    rows: [],
    totalFactors: 0,
    durationMs: 0,
  };
}

/** Serialize a scan result to CSV. */
export function driverScanToCsv(result: DriverScanRunResult): string {
  const header =
    "rank,label,spec,category,bestAbsCorr,bestCorr,spearman,bestWindow,bestLag,stability,pVal";
  const rows = (result.rows ?? []).map((r) =>
    [r.rank, JSON.stringify(r.label), r.spec, r.category, r.bestAbsCorr, r.bestCorr, r.spearman, r.bestWindow, r.bestLag, r.stability, r.pVal].join(",")
  );
  return [header, ...rows].join("\n");
}

// ── Legacy stub kept for any older callers ──
export interface DriverScanInput {
  tickers: string[];
  dates: string[];
  metrics: Record<string, number[][]>;
  [key: string]: any;
}

export interface DriverScanResult {
  ticker: string;
  score: number;
  rank: number;
  breakdown: Record<string, number>;
  [key: string]: any;
}

export async function driverScan(_input: DriverScanInput): Promise<DriverScanResult[]> {
  return [];
}
