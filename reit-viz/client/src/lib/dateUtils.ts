// Stub — TODO: reverse-engineer from production bundle
// Shared date utility helpers used by Trendlines and SupportResistance.

export interface DateRange {
  start: string; // ISO date string
  end: string;   // ISO date string
}

export interface DatePreset {
  label: string;
  value: string;
  days: number;
}

/** Canonical list of date presets shared across chart pages (matches the bundle). */
export const DATE_PRESETS: DatePreset[] = [
  { label: "1Y",  value: "1y",  days: 365 },
  { label: "3Y",  value: "3y",  days: 1095 },
  { label: "5Y",  value: "5y",  days: 1825 },
  { label: "10Y", value: "10y", days: 3650 },
  { label: "20Y", value: "20y", days: 7300 },
  { label: "All", value: "all", days: 0 },
  { label: "YTD", value: "ytd", days: -1 },
];

/**
 * Convert a date-preset value string into a concrete { start, end } DateRange.
 * Dates are ISO-8601 strings (YYYY-MM-DD).
 */
export function createDateRangeFromPreset(preset: string | DatePreset): DateRange {
  const days = typeof preset === "string"
    ? (DATE_PRESETS.find((p) => p.value === preset)?.days ?? 0)
    : preset.days;
  const end = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (days === 0) return { start: "", end: fmt(end) };        // "all"
  let start: Date;
  if (days === -1) start = new Date(end.getFullYear(), 0, 1); // "ytd"
  else start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: fmt(start), end: fmt(end) };
}
