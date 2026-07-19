// Default per-company metrics, configurable on the Universe tab.
//
// Two slots, each with ordered rules (field + value → concrete metric, first
// match wins) and a fallback:
//   eps    → pseudo-metric "EPS (Default)"        (e.g. GB → EPRA EPS, else FFO FY2)
//   growth → pseudo-metric "EPS Growth (Default)" (e.g. GB → EPRA growth, else FY2 FFO Growth)
// Rules can target Ticker (per-company override), Region (ticker suffix), or
// any classification dimension. Shared data loaders resolve the pseudo-metrics
// per ticker at load time. Config persists in localStorage.

export interface DefaultMetricRule {
  field: string; // "ticker" | "region" | classification field
  value: string;
  metric: string;
}

export interface DefaultMetricConfig {
  rules: DefaultMetricRule[];
  fallback: string;
}

export const DEFAULT_METRIC_SLOTS = {
  eps: { pseudo: "EPS (Default)", label: "EPS (per share)", fallback: "FFO FY2" },
  growth: { pseudo: "EPS Growth (Default)", label: "EPS growth", fallback: "FY2 FFO Growth" },
} as const;
export type DefaultSlot = keyof typeof DEFAULT_METRIC_SLOTS;
export const DEFAULT_SLOT_KEYS = Object.keys(DEFAULT_METRIC_SLOTS) as DefaultSlot[];

export const DEFAULT_EPS_METRIC = DEFAULT_METRIC_SLOTS.eps.pseudo;
export const DEFAULT_EPS_GROWTH_METRIC = DEFAULT_METRIC_SLOTS.growth.pseudo;

const STORAGE_KEY = "reit-viz-default-metrics-config";
const LEGACY_KEY = "reit-viz-default-eps-config"; // pre-growth single-slot shape

export const DEFAULT_EPS_FIELDS: { key: string; label: string }[] = [
  { key: "ticker", label: "Ticker" },
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

function sanitize(cfg: any, fallback: string): DefaultMetricConfig {
  return {
    rules: Array.isArray(cfg?.rules)
      ? cfg.rules.filter((r: any) => r && r.field && r.value && r.metric)
      : [],
    fallback: typeof cfg?.fallback === "string" && cfg.fallback ? cfg.fallback : fallback,
  };
}

export function getDefaultMetricConfigs(): Record<DefaultSlot, DefaultMetricConfig> {
  const empty = {
    eps: { rules: [], fallback: DEFAULT_METRIC_SLOTS.eps.fallback },
    growth: { rules: [], fallback: DEFAULT_METRIC_SLOTS.growth.fallback },
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        eps: sanitize(p?.eps, DEFAULT_METRIC_SLOTS.eps.fallback),
        growth: sanitize(p?.growth, DEFAULT_METRIC_SLOTS.growth.fallback),
      };
    }
    // Migrate the legacy single-slot (EPS-only) config once.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = {
        eps: sanitize(JSON.parse(legacy), DEFAULT_METRIC_SLOTS.eps.fallback),
        growth: empty.growth,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return empty;
  } catch {
    return empty;
  }
}

export function setDefaultMetricConfigs(cfgs: Record<DefaultSlot, DefaultMetricConfig>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfgs));
    window.dispatchEvent(new Event("default-eps-config-changed"));
  } catch { /* storage unavailable */ }
}

/** Which slot a metric name belongs to, or null for concrete metrics. */
export function defaultMetricSlot(metric: string | undefined | null): DefaultSlot | null {
  for (const k of DEFAULT_SLOT_KEYS) {
    if (metric === DEFAULT_METRIC_SLOTS[k].pseudo) return k;
  }
  return null;
}

export function isDefaultMetricName(metric: string | undefined | null): boolean {
  return defaultMetricSlot(metric) !== null;
}

/** Every concrete metric the pseudo-metric can resolve to (for prefetching). */
export function referencedMetricsFor(pseudoMetric: string): string[] {
  const slot = defaultMetricSlot(pseudoMetric);
  if (!slot) return [pseudoMetric];
  const cfg = getDefaultMetricConfigs()[slot];
  return [...new Set([...cfg.rules.map((r) => r.metric), cfg.fallback].filter(Boolean))];
}

/** Resolve the concrete metric for one ticker for a pseudo-metric name. */
export function resolveDefaultMetricFor(
  pseudoMetric: string,
  meta: { ticker: string; [k: string]: any } | undefined
): string {
  const slot = defaultMetricSlot(pseudoMetric);
  if (!slot) return pseudoMetric;
  const cfg = getDefaultMetricConfigs()[slot];
  if (meta) {
    for (const r of cfg.rules) {
      const v =
        r.field === "ticker" ? meta.ticker :
        r.field === "region" ? tickerRegion(meta.ticker) :
        meta[r.field];
      if (v && String(v) === r.value) return r.metric;
    }
  }
  return cfg.fallback;
}
