// Multi-select picker for valuation metrics, shared by the Valuation Re-Rating
// and Valuation Residence pages so both can run their analysis across several
// multiples at once. Self-contained: it fetches the available workbook metrics
// and offers the full curated + data-driven valuation/yield set (see
// buildRerateMetrics), grouped under Valuation / Yields.
import { useState, useEffect, useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { getTickers, getTickersCacheSync } from "@/lib/dataService";
import { buildRerateMetrics } from "@/lib/valuationRerate";
import { categorizeMetric } from "@/lib/metricCategories";
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
  useEffect(() => {
    let cancelled = false;
    getTickers()
      .then((ts) => { if (!cancelled) setDataMetrics([...new Set(ts.flatMap((t) => t.metrics || []))]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const all = buildRerateMetrics(dataMetrics);
    const m = new Map<string, typeof all>();
    for (const x of all) {
      const cat = categorizeMetric(x.key);
      (m.get(cat) ?? m.set(cat, []).get(cat)!).push(x);
    }
    const order = ["Valuation", "Yields"];
    return [...m.entries()].sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
  }, [dataMetrics]);

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const [, ms] of groups) for (const m of ms) map.set(m.key, m.label);
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
          className={`h-7 ${className} text-xs inline-flex items-center justify-between gap-1 rounded-md border border-input bg-background px-3 py-1 hover:bg-muted/40`}
          title={selected.map((k) => labelByKey.get(k) ?? k).join(", ")}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="w-3 h-3 opacity-60 flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 max-h-80 overflow-auto" align="start">
        {groups.map(([cat, ms]) => (
          <div key={cat}>
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 sticky top-0">{cat}</div>
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
      </PopoverContent>
    </Popover>
  );
}
