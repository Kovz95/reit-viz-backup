// Stub — TODO: reverse-engineer algorithm from production bundle

export interface SingleAnalysisResult {
  ticker: string;
  classification: string;
  currentPrice: number;
  bestSignal: string | null;
  bestSignalValue: number | null;
  bestBucketLabel: string;
  direction: "long" | "short" | "neutral" | null;
  quality: number;
  expectedMove20dPct: number | null;
  expectedPrice20d: number | null;
  hit20d: number | null;
  n: number;
  halfLifeDays: number | null;
}

export interface PairAnalysisResult {
  tickerA: string;
  tickerB: string;
  classA: string;
  classB: string;
  ratio: number;
  bestSignal: string | null;
  bestSignalValue: number | null;
  bestBucketLabel: string;
  direction: "long" | "short" | "neutral" | null;
  quality: number;
  expectedMove20dPct: number | null;
  expectedRatio20d: number | null;
  expectedAIfBFlat: number | null;
  expectedBIfAFlat: number | null;
  hit20d: number | null;
  n: number;
}

/**
 * Analyse signals for a single ticker.
 * Stub — TODO: reverse-engineer algorithm from production bundle.
 */
export async function analyzeSingleTicker(
  _ticker: string,
  _options?: Record<string, any>
): Promise<SingleAnalysisResult | null> {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return null;
}

/**
 * Analyse pair signals for two tickers (long/short ratio strategy).
 * Stub — TODO: reverse-engineer algorithm from production bundle.
 */
export async function analyzePairSignals(
  _tickerA: string,
  _tickerB: string,
  _options?: Record<string, any>
): Promise<PairAnalysisResult | null> {
  // Stub — TODO: reverse-engineer algorithm from production bundle
  return null;
}
