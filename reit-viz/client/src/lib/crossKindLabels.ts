// Hand-written from call-site inference (AutoTrendlineBacktest.tsx)
// Cross kinds are the trendline cross events emitted by computeAutoTrendlines.

export const CROSS_KIND_LABELS: Record<string, string> = {
  cross_above_upper: "Cross ↑ Upper (Breakout)",
  cross_below_upper: "Cross ↓ Upper (Rejection)",
  cross_above_lower: "Cross ↑ Lower (Bounce)",
  cross_below_lower: "Cross ↓ Lower (Breakdown)",
  golden:            "Golden Cross",
  death:             "Death Cross",
  bull:              "Bull Cross",
  bear:              "Bear Cross",
};
