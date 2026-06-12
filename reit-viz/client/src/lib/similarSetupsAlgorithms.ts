// Stub — TODO: reverse-engineer algorithm from production bundle

// ── Feature definitions ───────────────────────────────────────────────────────

export interface FeatureDef {
  id: string;
  label: string;
  description?: string;
  category?: string;
  [key: string]: any;
}

export interface AlgoDef {
  id: string;
  label: string;
  description?: string;
  [key: string]: any;
}

/** Default set of feature IDs to use for similarity matching. */
export const defaultFeatures: string[] = [];

/** Named feature presets (e.g. "momentum", "valuation"). */
export const featurePresets: Record<string, string[]> = {};

/** Metadata for each algorithm key. */
export const algoMeta: Record<string, AlgoDef> = {};

/** All algorithm key strings. */
export const algoKeys: string[] = [];

/** Metadata for each feature key. */
export const featureMeta: Record<string, FeatureDef> = {};

/** All feature key strings. */
export const featureKeys: string[] = [];

// ── Compute functions ─────────────────────────────────────────────────────────

export interface FeatureComputeInput {
  closes: number[];
  highs?: number[];
  lows?: number[];
  volumes?: number[];
  dates?: string[];
  fundamentals?: Record<string, (number | null)[]>;
  [key: string]: any;
}

export interface FeatureVector {
  date: string;
  features: Record<string, number | null>;
}

/**
 * Compute feature vectors for each bar in the price/fundamental series.
 * Stub — TODO: reverse-engineer algorithm from production bundle.
 */
export function computeFeatures(
  _input: FeatureComputeInput,
  _featureIds: string[]
): FeatureVector[] {
  return [];
}

/**
 * Compute a dimensionality-reduced time representation (e.g. PCA, t-SNE embedding).
 * Stub — TODO: reverse-engineer algorithm from production bundle.
 */
export function computeTimeDim(
  _vectors: FeatureVector[],
  _options?: Record<string, any>
): number[][] {
  return [];
}

export interface AlgoInput {
  queryVector: Record<string, number | null>;
  candidates: FeatureVector[];
  algoKey: string;
  topK?: number;
  [key: string]: any;
}

export interface AlgoMatch {
  date: string;
  distance: number;
  weight: number;
  [key: string]: any;
}

/**
 * Dispatch the selected similarity algorithm to find the top-K matching setups.
 * Stub — TODO: reverse-engineer algorithm from production bundle.
 */
export function dispatchAlgo(_input: AlgoInput): AlgoMatch[] {
  return [];
}
