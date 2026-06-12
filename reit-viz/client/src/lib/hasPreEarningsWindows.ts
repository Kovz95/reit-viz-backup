// Hand-written from call-site inference (Performance.tsx)
// Performance page uses hasPreEarningsWindows(eventType) to decide whether
// pre-event columns should be shown. Earnings events have pre-event windows;
// others (ex_div, CPI, NFP, FOMC) do not.

const PRE_EARNINGS_EVENT_TYPES = new Set(["earnings"]);

/**
 * Returns true if the given event type should show pre-event window columns.
 */
export function hasPreEarningsWindows(eventType: string): boolean {
  return PRE_EARNINGS_EVENT_TYPES.has(eventType);
}
