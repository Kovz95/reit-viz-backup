// Stub — TODO: reverse-engineer from production bundle

export interface WorkbookMetric {
  key: string;
  label: string;
  family?: string;
  direction?: 1 | -1;
  isPercent?: boolean;
  [key: string]: any;
}

/**
 * Return the list of metric definitions available in the current workbook.
 * Stub — TODO: reverse-engineer from production bundle.
 */
export async function getWorkbookMetrics(
  _options?: Record<string, any>
): Promise<WorkbookMetric[]> {
  return [];
}

/**
 * Synchronous variant used in some consumers.
 */
export function getWorkbookMetricsSync(
  _options?: Record<string, any>
): WorkbookMetric[] {
  return [];
}
