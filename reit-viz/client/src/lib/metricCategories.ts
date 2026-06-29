/**
 * Shared metric categorization for every metric dropdown/picker in the app.
 *
 * The set of available metrics is data-driven (the workbook parser captures
 * whatever rows exist — see scripts/parse-workbook.py), so categorization is
 * RULE-BASED rather than a hand-maintained list: any new metric auto-lands in a
 * sensible group, and anything unrecognized falls through to "Other" (never
 * hidden). Use groupMetricsByCategory() to turn a flat list of available metric
 * names into ordered, labeled groups for rendering.
 */

// Display order of categories. Anything a rule emits that isn't here (shouldn't
// happen) is appended after, before "Other".
export const CATEGORY_ORDER = [
  "Price",
  "Volume & Liquidity",
  "Valuation",
  "Yields",
  "Growth",
  "Estimates (FY1/FY2)",
  "Estimates (Next Qtr)",
  "Guidance",
  "Reported (LTM / FY0)",
  "REIT / EPRA",
  "Banks",
  "Insurance",
  "Dividends",
  "Price Performance",
  "Ratings & Sentiment",
  "Volatility",
  "Other",
] as const;

// Client-derived metrics that are computed in the app rather than parsed from the
// workbook — always offered alongside the data-backed metrics.
export const DERIVED_METRICS = [
  "Volume",
  "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M",
  "HV 30D", "HV 60D", "HV 90D", "HV 180D",
  "HVOL 30D", "HVOL 60D", "HVOL 90D", "HVOL 180D",
];

// Ordered match rules — FIRST match wins, so order encodes precedence
// (e.g. "growth" before valuation; price multiples before their metric family).
const RULES: Array<[string, (m: string) => boolean]> = [
  ["Price", (m) => ["close", "open", "high", "low"].includes(m)],
  ["Volume & Liquidity", (m) => /\bvolume\b|avg daily/i.test(m)],
  ["Ratings & Sentiment", (m) => /ratings|\bbull\b|\bbear\b|short interest|^si /i.test(m)],
  ["Volatility", (m) => /^hv\b|^hvol\b/i.test(m)],
  ["Price Performance", (m) => /price chg|off 52wk|52wk (high|low)/i.test(m)],
  ["Growth", (m) => /growth/i.test(m)],
  ["Guidance", (m) => /guidance/i.test(m)],
  // Price/EV/FCF multiples (incl. P / NAV, P / EPRA, P / Tangible book) — keep all
  // "multiples" together under Valuation regardless of the underlying family.
  ["Valuation", (m) =>
    /^p\s*\/|^ev\s*\/|^fcf\s*\/|\/ev\b|^p\/(b|fcf|ffo|affo|e|s)\b|peg|implied cap/i.test(m)],
  ["Yields", (m) => /yield/i.test(m)],
  ["Dividends", (m) => /dividend/i.test(m)],
  ["Insurance", (m) => /combined ratio|loss ratio|expense ratio|premium|embedded value|solvency/i.test(m)],
  ["Banks", (m) =>
    /tangible book|net interest|\bcet1\b|\bnpl\b|\bloan|\bdeposit|efficiency ratio|return on (equity|assets|tangible)|\brot(c)?e\b|loan loss/i.test(m)],
  ["REIT / EPRA", (m) => /epra|\bnav\b|\bnoi\b|net operating income|net debt|gross asset|implied cap/i.test(m)],
  ["Estimates (Next Qtr)", (m) => /consensus nq|\(nq\)|\bnq\b/i.test(m)],
  ["Estimates (FY1/FY2)", (m) => /consensus fy[12]|\bfy[12]\b|\(fy[12]\)/i.test(m)],
  ["Reported (LTM / FY0)", (m) => /\bltm\b|\bfy0\b|\(fy0\)/i.test(m)],
];

/** Map a metric name to its display category (rule order = precedence). */
export function categorizeMetric(name: string): string {
  for (const [cat, test] of RULES) {
    if (test(name)) return cat;
  }
  return "Other";
}

const _orderIndex = new Map<string, number>(CATEGORY_ORDER.map((c, i) => [c, i]));

/**
 * Group a flat list of available metric names into ordered, labeled categories.
 * Empty categories are omitted; metrics within a category are sorted A→Z.
 */
export function groupMetricsByCategory(
  metrics: string[],
): Array<{ category: string; metrics: string[] }> {
  const map = new Map<string, string[]>();
  for (const m of metrics) {
    const c = categorizeMetric(m);
    if (!map.has(c)) map.set(c, []);
    map.get(c)!.push(m);
  }
  const cats = [...map.keys()].sort((a, b) => {
    const ia = _orderIndex.has(a) ? _orderIndex.get(a)! : CATEGORY_ORDER.length - 1;
    const ib = _orderIndex.has(b) ? _orderIndex.get(b)! : CATEGORY_ORDER.length - 1;
    return ia - ib || a.localeCompare(b);
  });
  return cats.map((category) => ({
    category,
    metrics: map.get(category)!.sort((a, b) => a.localeCompare(b)),
  }));
}

/** Convenience: a category->metrics object (insertion order preserved) for callers that want a Record. */
export function groupMetricsRecord(metrics: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { category, metrics: ms } of groupMetricsByCategory(metrics)) {
    out[category] = ms;
  }
  return out;
}
