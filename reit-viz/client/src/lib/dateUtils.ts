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

/** Canonical list of date presets shared across chart pages. */
export const DATE_PRESETS: DatePreset[] = [
  { label: "1M",  value: "1M",  days: 30 },
  { label: "3M",  value: "3M",  days: 90 },
  { label: "6M",  value: "6M",  days: 180 },
  { label: "1Y",  value: "1Y",  days: 365 },
  { label: "2Y",  value: "2Y",  days: 730 },
  { label: "5Y",  value: "5Y",  days: 1825 },
  { label: "Max", value: "Max", days: 99999 },
];

/**
 * Convert a date-preset value string into a concrete { start, end } DateRange.
 * Dates are ISO-8601 strings (YYYY-MM-DD).
 */
export function createDateRangeFromPreset(preset: string | DatePreset): DateRange {
  // Stub — TODO: reverse-engineer from production bundle
  const days = typeof preset === "string"
    ? (DATE_PRESETS.find((p) => p.value === preset)?.days ?? 365)
    : preset.days;

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}
