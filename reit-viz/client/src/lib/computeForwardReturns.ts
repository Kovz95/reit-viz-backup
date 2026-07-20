// Hand-written stub — computeForwardReturns used in ValuationRegime.tsx
// Computes per-ticker per-horizon forward return statistics given a price series.
export function computeForwardReturns(
  priceSeries: number[],
  signalDates: number[],
  horizons: Array<{ label: string; days: number }> | number,
  direction?: "buy" | "sell" | string,
  bandParam?: { minReturn: number; maxReturn: number } | null
): Record<string, number[]> {
  if (typeof horizons === "number") {
    // Called with (prices, signalDates, targetReturn, direction, bandParam):
    // fall back to the standard horizon set and return the same
    // per-horizon per-signal fraction returns as the array form.
    const STD = [
      { label: "1W", days: 5 },
      { label: "1M", days: 21 },
      { label: "3M", days: 63 },
      { label: "6M", days: 126 },
      { label: "1Y", days: 252 },
    ];
    return computeForwardReturns(priceSeries, signalDates, STD, direction, bandParam);
  }
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
