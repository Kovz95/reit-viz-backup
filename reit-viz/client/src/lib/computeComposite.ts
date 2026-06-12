// Hand-written stub — computeComposite used in ValuationRegime.tsx
// Combines per-horizon signal summaries into a single composite score (0–100).
export function computeComposite(
  summary: Record<string, { hitRate: number; count: number; profitFactor: number }>,
  opts?: { weights?: Record<string, number> } | string,
  useBandRate?: boolean
): number {
  const keys = Object.keys(summary);
  if (keys.length === 0) return 0;

  let totalScore = 0;
  let totalWeight = 0;
  for (const key of keys) {
    const s = summary[key];
    if (!s || s.count === 0) continue;
    const w = opts?.weights?.[key] ?? 1;
    const hScore = s.hitRate * 80;
    const pfScore = Math.min((s.profitFactor - 1) * 10, 20);
    totalScore += (hScore + pfScore) * w;
    totalWeight += w;
  }

  if (totalWeight === 0) return 0;
  return Math.min(100, Math.round(totalScore / totalWeight));
}
