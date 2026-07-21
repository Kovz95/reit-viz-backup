// Multi-select metric picker shared by the Valuation Re-Rating and Valuation
// Residence pages. Offers EVERY available metric — the percentile/z/residence
// machinery is metric-agnostic — grouped by the app-wide metric categories,
// with Valuation / Yields kept on top (these pages are valuation-centric).
// Curated valuation entries keep their nice labels + orientation; everything
// else gets inferred orientation (see buildRerateMetrics). Includes the SI Δ
// and "(Default)" pseudo-metrics, which dataService resolves per ticker.
import { useState, useEffect, useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getTickers, getTickersCacheSync, SI_DELTA_METRIC_NAMES } from "@/lib/dataService";
import { buildRerateMetrics, type RerateMetric } from "@/lib/valuationRerate";
import { groupMetricsByCategory } from "@/lib/metricCategories";
import { DEFAULT_METRIC_SLOTS, DEFAULT_SLOT_KEYS } from "@/lib/defaultEarningsMetric";
import { ChevronDown } from "lucide-react";

export default function RerateMetricPicker({
  selected,
  onChange,
  className = "w-52",
}: {
  selected: string[];
  onChange: (keys: string[]) => void;
  className?: string;
}) {
  const [dataMetrics, setDataMetrics] = useState<string[]>(() => {
    const c = getTickersCacheSync();
    return c ? [...new Set(c.flatMap((t) => t.metrics || []))] : [];
  });
  const [query, setQuery] = useState("");
  useEffect(() => {
    let cancelled = false;
    getTickers()
      .then((ts) => { if (!cancelled) setDataMetrics([...new Set(ts.flatMap((t) => t.metrics || []))]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    // Workbook metrics + client-derived pseudo-metrics the data layer resolves.
    const pool = [...new Set([
      ...dataMetrics,
      ...SI_DELTA_METRIC_NAMES,
      ...DEFAULT_SLOT_KEYS.map((k) => DEFAULT_METRIC_SLOTS[k].pseudo),
    ])];
    const all = buildRerateMetrics(pool);
    const byKey = new Map(all.map((m) => [m.key, m]));
    const grouped = groupMetricsByCategory(all.map((m) => m.key));
    const front = ["Valuation", "Yields"];
    const ordered = [
      ...front.map((c) => grouped.find((g) => g.category === c)).filter(Boolean) as typeof grouped,
      ...grouped.filter((g) => !front.includes(g.category)),
    ];
    return ordered.map((g) => ({
      category: g.category,
      metrics: g.metrics.map((k) => byKey.get(k)!).filter(Boolean) as RerateMetric[],
    }));
  }, [dataMetrics]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        category: g.category,
        metrics: g.metrics.filter(
          (m) => m.label.toLowerCase().includes(q) || m.key.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.metrics.length > 0);
  }, [groups, query]);

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) for (const m of g.metrics) map.set(m.key, m.label);
    return map;
  }, [groups]);

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  const triggerLabel =
    selected.length === 0 ? "Select metrics"
    : selected.length === 1 ? (labelByKey.get(selected[0]) ?? selected[0])
    : `${selected.length} metrics`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="rerate-metric-picker"
          className={`h-7 ${className} text-xs inline-flex items-center justify-between gap-1 rounded-md border border-input bg-background px-3 py-1 hover:bg-muted/40`}
          title={selected.map((k) => labelByKey.get(k) ?? k).join(", ")}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="w-3 h-3 opacity-60 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-1.5 border-b border-border">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search metrics…"
            className="h-6 text-xs"
            data-testid="rerate-metric-search"
          />
        </div>
        <div className="max-h-80 overflow-auto">
          {visibleGroups.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">No metrics match.</div>
          )}
          {visibleGroups.map(({ category, metrics: ms }) => (
            <div key={category}>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 sticky top-0">{category}</div>
              {ms.map((m) => (
                <label key={m.key} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={selected.includes(m.key)}
                    onCheckedChange={() => toggle(m.key)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="truncate">{m.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
