// Stub — TODO: reverse-engineer algorithm from production bundle

export interface SeriesStats {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  count: number;
  /** Skewness */
  skew: number;
  /** Excess kurtosis */
  kurt: number;
}

/**
 * Compute descriptive statistics for a numeric array.
 */
export function computeStats(_values: any, _valuesB?: any): SeriesStats {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return {
    mean: 0,
    median: 0,
    stddev: 0,
    min: 0,
    max: 0,
    count: 0,
    skew: 0,
    kurt: 0,
  };
}
