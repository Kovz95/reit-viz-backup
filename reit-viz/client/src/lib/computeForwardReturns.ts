// Hand-written stub — computeForwardReturns used in ValuationRegime.tsx
// Computes per-ticker per-horizon forward return statistics given a price series.
export function computeForwardReturns(
  priceSeries: number[],
  signalDates: number[],
  horizons: Array<{ label: string; days: number }>
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const { label, days } of horizons) {
    result[label] = signalDates.map((idx) => {
      const entryPrice = priceSeries[idx];
      const exitIdx = Math.min(idx + days, priceSeries.length - 1);
      const exitPrice = priceSeries[exitIdx];
      if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || entryPrice === 0) return NaN;
      return (exitPrice - entryPrice) / Math.abs(entryPrice);
    });
  }
  return result;
}
