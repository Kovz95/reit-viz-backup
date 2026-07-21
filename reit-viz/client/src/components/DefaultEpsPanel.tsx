// Universe-tab configuration for the app-wide default-metric pseudo-metrics:
// "EPS (Default)" and "EPS Growth (Default)". Each slot has ordered rules
// (Ticker / Region / classification → concrete metric, first match wins) plus
// a global fallback — e.g. Region GB → EPRA Earnings per share, fallback FFO FY2.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { groupMetricsByCategory } from "@/lib/metricCategories";
import { ChevronDown, ChevronUp, Plus, X, Calculator } from "lucide-react";
import { getTickers } from "@/lib/dataService";
import {
  DEFAULT_EPS_FIELDS,
  DEFAULT_METRIC_SLOTS,
  DEFAULT_SLOT_KEYS,
  getDefaultMetricConfigs,
  setDefaultMetricConfigs,
  resolveDefaultMetricFor,
  tickerRegion,
  type DefaultMetricConfig,
  type DefaultSlot,
} from "@/lib/defaultEarningsMetric";

export default function DefaultEpsPanel() {
  const [open, setOpen] = useState(false);
  const [cfgs, setCfgs] = useState<Record<DefaultSlot, DefaultMetricConfig>>(() => getDefaultMetricConfigs());
  const [metas, setMetas] = useState<any[]>([]);

  useEffect(() => {
    getTickers().then((t) => setMetas(t as any[])).catch(() => {});
  }, []);

  const allMetrics = useMemo(
    () => [...new Set(metas.flatMap((t) => t.metrics || []))].sort() as string[],
    [metas]
  );
  // Grouped by the shared metric categorizer (same grouping as the other
  // metric pickers across the app) so the dropdown isn't one long flat list.
  const groupedMetrics = useMemo(() => groupMetricsByCategory(allMetrics), [allMetrics]);

  const valuesFor = (field: string): string[] => {
    if (field === "ticker") return metas.map((t) => t.ticker).sort();
    if (field === "region") return [...new Set(metas.map((t) => tickerRegion(t.ticker)))].sort();
    return [...new Set(metas.map((t) => t[field]).filter(Boolean))].sort() as string[];
  };

  const totalRules = DEFAULT_SLOT_KEYS.reduce((s, k) => s + cfgs[k].rules.length, 0);

  const save = (slot: DefaultSlot, cfg: DefaultMetricConfig) => {
    const next = { ...cfgs, [slot]: cfg };
    setCfgs(next);
    setDefaultMetricConfigs(next);
  };

  const MetricSelect = ({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId?: string }) => (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-6 text-[11px] w-[280px]" data-testid={testId}>
        <SelectValue placeholder="metric…" />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        {groupedMetrics.map(({ category, metrics }) => (
          <SelectGroup key={category}>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
              {category}
            </SelectLabel>
            {metrics.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );

  const SlotEditor = ({ slot }: { slot: DefaultSlot }) => {
    const cfg = cfgs[slot];
    const def = DEFAULT_METRIC_SLOTS[slot];
    const summary = useMemo(() => {
      if (metas.length === 0) return [];
      const counts = new Map<string, number>();
      for (const t of metas) {
        const m = resolveDefaultMetricFor(def.pseudo, t);
        counts.set(m, (counts.get(m) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1]);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [metas, cfgs]);

    return (
      <div className="space-y-2 border-t border-border/50 pt-2 first:border-t-0 first:pt-0" data-testid={`default-metric-slot-${slot}`}>
        <p className="text-[11px] font-medium">
          {def.label} <span className="text-muted-foreground font-normal">— picker name “{def.pseudo}”</span>
        </p>
        {cfg.rules.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5 flex-wrap" data-testid={`default-${slot}-rule-${i}`}>
            <span className="text-[10px] text-muted-foreground font-mono w-4">{i + 1}.</span>
            <Select
              value={r.field}
              onValueChange={(field) => {
                const rules = [...cfg.rules];
                rules[i] = { ...rules[i], field, value: "" };
                save(slot, { ...cfg, rules });
              }}
            >
              <SelectTrigger className="h-6 text-[11px] w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEFAULT_EPS_FIELDS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={r.value || undefined}
              onValueChange={(value) => {
                const rules = [...cfg.rules];
                rules[i] = { ...rules[i], value };
                save(slot, { ...cfg, rules });
              }}
            >
              <SelectTrigger className="h-6 text-[11px] w-[190px]" data-testid={`default-${slot}-rule-${i}-value`}>
                <SelectValue placeholder="value…" />
              </SelectTrigger>
              <SelectContent>
                {valuesFor(r.field).map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[10px] text-muted-foreground">→</span>
            <MetricSelect
              value={r.metric}
              onChange={(metric) => {
                const rules = [...cfg.rules];
                rules[i] = { ...rules[i], metric };
                save(slot, { ...cfg, rules });
              }}
              testId={`default-${slot}-rule-${i}-metric`}
            />
            <button
              className="text-muted-foreground hover:text-red-400"
              onClick={() => save(slot, { ...cfg, rules: cfg.rules.filter((_, j) => j !== i) })}
              title="Remove rule"
              data-testid={`default-${slot}-rule-${i}-remove`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 text-[11px] px-2"
            onClick={() => save(slot, { ...cfg, rules: [...cfg.rules, { field: "region", value: "", metric: "" }] })}
            data-testid={`default-${slot}-add-rule`}
          >
            <Plus className="w-3 h-3" />
            Add rule
          </Button>
          <span className="text-[11px] text-muted-foreground ml-2">Fallback (no rule matches):</span>
          <MetricSelect
            value={cfg.fallback}
            onChange={(fallback) => save(slot, { ...cfg, fallback })}
            testId={`default-${slot}-fallback`}
          />
        </div>
        {summary.length > 0 && (
          <p className="text-[10px] text-muted-foreground font-mono" data-testid={`default-${slot}-summary`}>
            Resolves to: {summary.map(([m, n]) => `${m} ×${n}`).join(" · ")}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="rounded border border-border bg-card/50" data-testid="default-eps-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-muted/40"
        title="Configure which earnings and growth metrics the EPS (Default) / EPS Growth (Default) pseudo-metrics resolve to per company"
        data-testid="default-eps-toggle"
      >
        <Calculator className="w-3 h-3 text-sky-500/80" />
        <span className="font-medium">Default metrics</span>
        {totalRules > 0 && (
          <span className="px-1.5 py-px rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 font-mono text-[10px]">
            {totalRules} rule{totalRules === 1 ? "" : "s"}
          </span>
        )}
        <span className="text-muted-foreground">
          per-company EPS + growth metric — pick “EPS (Default)” / “EPS Growth (Default)” anywhere
        </span>
        {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {open && (
        <div className="px-2 py-2 border-t border-border space-y-3">
          <p className="text-[10px] text-muted-foreground">
            Rules are checked top-down per company; the first match decides its metric. Rules can
            target a single Ticker (per-company override), Region (ticker suffix, e.g. GB vs US),
            or any classification level. Metric pickers across the app then offer the pseudo-metrics,
            each resolving per company.
          </p>
          {DEFAULT_SLOT_KEYS.map((slot) => (
            <SlotEditor key={slot} slot={slot} />
          ))}
        </div>
      )}
    </div>
  );
}
