// Default earnings-per-share metric, configurable per company category.
//
// The Universe tab hosts the configuration (see components/DefaultEpsPanel):
// an ordered rule list (classification field + value → concrete metric, first
// match wins) plus a global fallback — e.g. Region GB → "EPRA Earnings per
// share (consensus FY2)", fallback "FFO FY2". App-wide, metric pickers offer
// the pseudo-metric "EPS (Default)" which the shared data loaders resolve
// per ticker at load time (dataService, fetchMetricSeries, fetchScatterData).
//
// Config persists in localStorage (durable across sessions, like scatter
// layout presets).

export const DEFAULT_EPS_METRIC = "EPS (Default)";

export interface DefaultEpsRule {
  field: string; // "region" (ticker suffix) or a classification field
  value: string;
  metric: string;
}

export interface DefaultEpsConfig {
  rules: DefaultEpsRule[];
  fallback: string;
}

const STORAGE_KEY = "reit-viz-default-eps-config";
const DEFAULT_CONFIG: DefaultEpsConfig = { rules: [], fallback: "FFO FY2" };

export const DEFAULT_EPS_FIELDS: { key: string; label: string }[] = [
  { key: "region", label: "Region (ticker suffix)" },
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Industry Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
];

/** "PHP-GB" → "GB"; plain US symbols → "US". */
export function tickerRegion(ticker: string): string {
  const i = ticker.lastIndexOf("-");
  return i > 0 ? ticker.slice(i + 1) : "US";
}

export function getDefaultEpsConfig(): DefaultEpsConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const p = JSON.parse(raw);
    return {
      rules: Array.isArray(p?.rules)
        ? p.rules.filter((r: any) => r && r.field && r.value && r.metric)
        : [],
      fallback: typeof p?.fallback === "string" && p.fallback ? p.fallback : DEFAULT_CONFIG.fallback,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function setDefaultEpsConfig(cfg: DefaultEpsConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    window.dispatchEvent(new Event("default-eps-config-changed"));
  } catch { /* storage unavailable */ }
}

export function isDefaultEpsMetric(metric: string | undefined | null): boolean {
  return metric === DEFAULT_EPS_METRIC;
}

/** Every concrete metric the current config can resolve to (for prefetching). */
export function referencedEpsMetrics(cfg: DefaultEpsConfig = getDefaultEpsConfig()): string[] {
  return [...new Set([...cfg.rules.map((r) => r.metric), cfg.fallback].filter(Boolean))];
}

/** Resolve the concrete earnings metric for one ticker from its meta. */
export function resolveDefaultEps(
  meta: { ticker: string; [k: string]: any } | undefined,
  cfg: DefaultEpsConfig = getDefaultEpsConfig()
): string {
  if (meta) {
    for (const r of cfg.rules) {
      const v = r.field === "region" ? tickerRegion(meta.ticker) : meta[r.field];
      if (v && String(v) === r.value) return r.metric;
    }
  }
  return cfg.fallback;
}
