// Hand-written stub — aggregateSignals used in ValuationRegime.tsx
// Aggregates forward return arrays into a summary object.
export function aggregateSignals(
  returnsByHorizon: Record<string, number[]>,
  side: "buy" | "sell" = "buy"
): Record<string, any> {
  const summary: Record<string, any> = {};
  for (const [label, rets] of Object.entries(returnsByHorizon)) {
    const finite = rets.filter(Number.isFinite);
    if (finite.length === 0) {
      summary[label] = { count: 0, hitRate: 0, avgReturn: 0, profitFactor: 0 };
      continue;
    }
    const hits = finite.filter((r) => side === "buy" ? r >= 0 : r <= 0).length;
    const pos = finite.filter((r) => r > 0).reduce((s, v) => s + v, 0);
    const neg = Math.abs(finite.filter((r) => r < 0).reduce((s, v) => s + v, 0));
    summary[label] = {
      count: finite.length,
      hitRate: hits / finite.length,
      avgReturn: finite.reduce((s, v) => s + v, 0) / finite.length,
      profitFactor: neg === 0 ? (pos > 0 ? 99 : 0) : pos / neg,
    };
  }
  return summary;
}
