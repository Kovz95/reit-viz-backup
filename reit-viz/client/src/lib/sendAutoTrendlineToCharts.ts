// Hand-written from call-site inference (AutoTrendlineBacktest.tsx)

export interface AutoTrendlinePayload {
  ticker: string;
  n?: number;
  timeframe?: string;
  futureBars?: number;
  metric?: string;
  [key: string]: any;
}

export interface AutoTrendlineResult {
  success: boolean;
  message?: string;
}

const PENDING_KEY = "reit-viz:auto-trendline:pending";

/**
 * Stores a trendline payload in sessionStorage so the Charts page can pick it up
 * on next render.  Returns success/failure.
 */
export async function sendAutoTrendlineToCharts(
  payload: AutoTrendlinePayload
): Promise<AutoTrendlineResult> {
  if (typeof window === "undefined") {
    return { success: false, message: "SSR environment" };
  }
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    return { success: true };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Storage error",
    };
  }
}

/** Reads and clears the pending auto-trendline payload (used by Charts page). */
export function consumeAutoTrendlinePayload(): AutoTrendlinePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as AutoTrendlinePayload;
  } catch {
    return null;
  }
}
