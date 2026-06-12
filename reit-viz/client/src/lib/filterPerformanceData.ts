// Hand-written from call-site inference (Performance.tsx)
// filterPerformanceData: filters performance rows by ClassFilters + search text + manual tickers

import { applyClassFilters } from "@/components/ClassificationFilters";
import type { ClassFilters } from "@/components/ClassificationFilters";

/**
 * Filters an array of performance rows using the same logic as ClassificationFilters.
 * Rows must have classification fields (economy, sector, etc.) and a `ticker` field.
 */
export function filterPerformanceData(
  rows: any[],
  filters: ClassFilters,
  search?: string,
  manualTickers?: Set<string>
): any[] {
  if (!rows || rows.length === 0) return [];
  return applyClassFilters(rows, filters, search ?? "", manualTickers ?? new Set());
}
