// Recovered from recovered-bundle/index-CsG73Aq_.js (UKe) — maps each trendline
// cross kind to its trade direction. Keys MUST match ALL_CROSS_KINDS in
// AutoTrendlineBacktest.tsx, or `TRENDLINE_DIRECTION_MAP[kind]` is undefined and
// `.toUpperCase()` throws on render.

export const TRENDLINE_DIRECTION_MAP: Record<string, "long" | "short"> = {
  cross_above_upper: "long",
  cross_above_lower: "long",
  cross_below_upper: "short",
  cross_below_lower: "short",
};
