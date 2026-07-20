// Workbook metric definitions, derived from the union of every ticker's
// `metrics` list in /api/tickers metadata (there is no separate metric
// catalog endpoint). Percent detection reuses dataService rules.

import { getTickers, isPercentMetric } from "@/lib/dataService";

export interface WorkbookMetric {
  key: string;
  label: string;
  family?: string;
  direction?: 1 | -1;
  isPercent?: boolean;
  [key: string]: any;
}

const PRICE_FIELDS = new Set(["open", "high", "low", "close"]);

let cache: WorkbookMetric[] | null = null;

function toDefs(metricKeys: string[]): WorkbookMetric[] {
  return metricKeys
    .filter((k) => !PRICE_FIELDS.has(k))
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({
      key,
      label: key,
      isPercent: (() => {
        try { return isPercentMetric(key); } catch { return false; }
      })(),
    }));
}

/**
 * Return the list of metric definitions available in the current workbook.
 */
export async function getWorkbookMetrics(
  _options?: Record<string, any>
): Promise<WorkbookMetric[]> {
  if (cache) return cache;
  try {
    const tickers = await getTickers();
    const keys = new Set<string>();
    for (const t of tickers as any[]) {
      for (const m of t?.metrics ?? []) {
        if (typeof m === "string") keys.add(m);
      }
    }
    cache = toDefs(Array.from(keys));
    return cache;
  } catch {
    return [];
  }
}

/**
 * Synchronous variant: serves the cached list (kick off the async load on
 * first call so a later render sees the data).
 */
export function getWorkbookMetricsSync(
  _options?: Record<string, any>
): WorkbookMetric[] {
  if (!cache) void getWorkbookMetrics();
  return cache ?? [];
}
