// Hand-written from call-site inference (AutoTrendlineBacktest.tsx)
// Cross kinds are the trendline cross events emitted by computeAutoTrendlines.

export const CROSS_KIND_LABELS: Record<string, string> = {
  cross_above_upper: "Cross Above Upper",
  cross_above_lower: "Cross Above Lower",
  cross_below_upper: "Cross Below Upper",
  cross_below_lower: "Cross Below Lower",
  golden:            "Golden Cross",
  death:             "Death Cross",
  bull:              "Bull Cross",
  bear:              "Bear Cross",
};
