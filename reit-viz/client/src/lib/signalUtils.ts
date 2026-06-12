// Stub — TODO: reverse-engineer from production bundle

export interface Horizon {
  label: string;
  days: number;
}

/** Standard forward-return horizons used across signal evaluation. */
export const HORIZONS: Horizon[] = [
  { label: "1W",  days: 5 },
  { label: "2W",  days: 10 },
  { label: "1M",  days: 21 },
  { label: "3M",  days: 63 },
  { label: "6M",  days: 126 },
  { label: "1Y",  days: 252 },
];

/**
 * Format a hit-rate fraction (0–1) as a percentage string.
 */
export function formatHitRate(hitRate: number | null | undefined): string {
  if (hitRate == null) return "—";
  return `${(hitRate * 100).toFixed(0)}%`;
}

/**
 * Return a Tailwind colour class reflecting whether the hit-rate is
 * above (green), near (neutral), or below (red) 50%.
 */
export function hitRateColorClass(hitRate: number | null | undefined): string {
  if (hitRate == null) return "text-muted-foreground";
  if (hitRate >= 0.6) return "text-green-500";
  if (hitRate <= 0.4) return "text-red-500";
  return "text-yellow-500";
}

export interface MetricSeriesResult {
  ticker: string;
  metricKey: string;
  dates: string[];
  values: (number | null)[];
}

/**
 * Fetch a single metric series for a ticker.
 * Stub — TODO: reverse-engineer from production bundle.
 */
export async function fetchMetricSeries(
  _ticker: string,
  _metricKey: string,
  _options?: Record<string, any>
): Promise<MetricSeriesResult> {
  return { ticker: "", metricKey: "", dates: [], values: [] };
}

export interface MacroSeriesBatchResult {
  seriesKey: string;
  dates: string[];
  values: (number | null)[];
}

/**
 * Fetch multiple macro series in a single batch request.
 * Stub — TODO: reverse-engineer from production bundle.
 */
export async function fetchMacroSeriesBatch(
  _seriesKeys: string[],
  _options?: Record<string, any>
): Promise<MacroSeriesBatchResult[]> {
  return [];
}

export interface AggregatedProfile {
  avgReturn: Record<string, number>;
  stdReturn: Record<string, number>;
  hitRate?: Record<string, number>;
  n: number;
  [key: string]: any;
}

export interface SignalProfile {
  signalIdx?: number;
  returns: Record<string, number | null>;
  hitTarget: Record<string, boolean>;
  hitBand?: Record<string, boolean>;
  hitRates?: Record<string, number | null>;
  hitRate?: number;
  baseHitRate?: number;
  n?: number;
  [key: string]: any;
}

/**
 * Build a forward-return profile for a single signal bar.
 * Accepts positional args: (prices, signalIdx, targetPct, side, stopPct?, cooldown?, benchmarkPrices?)
 * OR legacy (signalIndices, closes, horizons?).
 */
export function buildSignalProfile(
  prices: number[],
  signalIdx: number,
  targetPct?: number | null,
  side?: string | null,
  stopPct?: number | null,
  cooldown?: number | null,
  benchmarkPrices?: number[] | null
): SignalProfile;
export function buildSignalProfile(
  signalIndices: number[],
  closes: number[],
  horizons?: Horizon[]
): SignalProfile;
export function buildSignalProfile(
  _arg0: number[],
  _arg1?: any,
  _arg2?: any,
  _arg3?: any,
  _arg4?: any,
  _arg5?: any,
  _arg6?: any
): SignalProfile {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return { returns: {}, hitTarget: {}, hitRates: {}, n: 0 };
}

/**
 * Aggregate multiple signal profiles into a single combined profile.
 * Accepts optional second arg (side string).
 */
export function aggregateSignalProfiles(
  _profiles: SignalProfile[],
  _side?: string
): AggregatedProfile {
  return { avgReturn: {}, stdReturn: {}, n: 0 };
}
