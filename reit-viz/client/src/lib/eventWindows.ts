// Hand-written from call-site inference (Performance.tsx)
// Event windows define how many calendar days before/after an earnings/event date
// forward returns are measured.

/** Days before event (negative = before) */
export const PRE_EARNINGS_WINDOWS: number[] = [-5, -3, -1];

/** Days after event (positive = after) */
export const POST_EARNINGS_WINDOWS: number[] = [1, 3, 5, 10];

/** Human-readable labels for each window value */
export const WINDOW_LABELS: Record<number, string> = {
  [-5]: "-5d",
  [-3]: "-3d",
  [-1]: "-1d",
  [1]:  "+1d",
  [3]:  "+3d",
  [5]:  "+5d",
  [10]: "+10d",
};
