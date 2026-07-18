// Generate the next n future weekday dates (YYYY-MM-DD) after lastDate,
// skipping Saturdays/Sundays. Used to project levels/trendlines forward on
// charts (SupportResistance, Trendlines, LevelsAndTrendlines).
//
// Consolidated from three per-file copies. UTC arithmetic so output is
// deterministic across timezones; verified identical to the previous
// local-time variants on valid input (incl. DST + leap-year boundaries).
// Invalid input returns [] (the guard the local-time variants had).
export function futureWeekdays(lastDate: string, n: number): string[] {
  const out: string[] = [];
  const [y, m, dd] = lastDate.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !dd) return [];
  const d = new Date(lastDate + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return [];
  let count = 0;
  while (count < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const yr = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    out.push(`${yr}-${mo}-${day}`);
    count++;
  }
  return out;
}
