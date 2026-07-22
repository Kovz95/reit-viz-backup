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
  eps: { pseudo: "EPS (Default)", label: "EPS FY2 (per share)", fallback: "FFO FY2" },
  epsFy1: { pseudo: "EPS FY1 (Default)", label: "EPS FY1 (per share)", fallback: "FFO FY1" },
  growth: { pseudo: "EPS Growth (Default)", label: "EPS growth FY2", fallback: "FY2 FFO Growth" },
  growthFy1: { pseudo: "EPS Growth FY1 (Default)", label: "EPS growth FY1", fallback: "FY1 FFO Growth" },
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

function buildConfigs(parsed: any): Record<DefaultSlot, DefaultMetricConfig> {
  const out = {} as Record<DefaultSlot, DefaultMetricConfig>;
  for (const k of DEFAULT_SLOT_KEYS) {
    out[k] = sanitize(parsed?.[k], DEFAULT_METRIC_SLOTS[k].fallback);
  }
  return out;
}

// Memoized: resolveDefaultMetricFor runs in per-ticker fetch loops (thousands
// of calls per screen), so re-reading + re-parsing localStorage every call is
// measurable main-thread waste. Invalidated on our own change event and on
// cross-tab storage events.
let configsCache: Record<DefaultSlot, DefaultMetricConfig> | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("default-eps-config-changed", () => { configsCache = null; });
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY || e.key === LEGACY_KEY) configsCache = null;
  });
}

export function getDefaultMetricConfigs(): Record<DefaultSlot, DefaultMetricConfig> {
  if (configsCache) return configsCache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return (configsCache = buildConfigs(JSON.parse(raw)));
    // Migrate the legacy single-slot (EPS-only) config once.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = buildConfigs({ eps: JSON.parse(legacy) });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return (configsCache = migrated);
    }
    return (configsCache = buildConfigs(null));
  } catch {
    return buildConfigs(null);
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
