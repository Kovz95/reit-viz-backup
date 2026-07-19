// Universe-tab configuration for the app-wide "EPS (Default)" pseudo-metric:
// ordered category rules (first match wins) + a global fallback metric.
// e.g. Region GB → "EPRA Earnings per share (consensus FY2)", fallback "FFO FY2".

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Plus, X, Calculator } from "lucide-react";
import { getTickers } from "@/lib/dataService";
import {
  DEFAULT_EPS_FIELDS,
  DEFAULT_EPS_METRIC,
  getDefaultEpsConfig,
  setDefaultEpsConfig,
  resolveDefaultEps,
  tickerRegion,
  type DefaultEpsConfig,
} from "@/lib/defaultEarningsMetric";

export default function DefaultEpsPanel() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<DefaultEpsConfig>(() => getDefaultEpsConfig());
  const [metas, setMetas] = useState<any[]>([]);

  useEffect(() => {
    getTickers().then((t) => setMetas(t as any[])).catch(() => {});
  }, []);

  const allMetrics = useMemo(
    () => [...new Set(metas.flatMap((t) => t.metrics || []))].sort() as string[],
    [metas]
  );

  const valuesFor = (field: string): string[] => {
    if (field === "region") return [...new Set(metas.map((t) => tickerRegion(t.ticker)))].sort();
    return [...new Set(metas.map((t) => t[field]).filter(Boolean))].sort() as string[];
  };

  const save = (next: DefaultEpsConfig) => {
    setCfg(next);
    setDefaultEpsConfig(next);
  };

  // Live summary: how many tickers resolve to each metric under the current config.
  const summary = useMemo(() => {
    if (metas.length === 0) return [];
    const counts = new Map<string, number>();
    for (const t of metas) {
      const m = resolveDefaultEps(t, cfg);
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [metas, cfg]);

  const MetricSelect = ({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId?: string }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-6 text-[11px] w-[280px]" data-testid={testId}>
        <SelectValue placeholder="metric…" />
      </SelectTrigger>
      <SelectContent>
        {allMetrics.map((m) => (
          <SelectItem key={m} value={m}>{m}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="rounded border border-border bg-card/50" data-testid="default-eps-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-muted/40"
        title={`Configure which earnings-per-share metric "${DEFAULT_EPS_METRIC}" resolves to per company category`}
        data-testid="default-eps-toggle"
      >
        <Calculator className="w-3 h-3 text-sky-500/80" />
        <span className="font-medium">Default EPS metric</span>
        {cfg.rules.length > 0 && (
          <span className="px-1.5 py-px rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 font-mono text-[10px]">
            {cfg.rules.length} rule{cfg.rules.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="text-muted-foreground">
          per-category earnings metric — pick “{DEFAULT_EPS_METRIC}” anywhere in the app
        </span>
        {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {open && (
        <div className="px-2 py-2 border-t border-border space-y-2">
          <p className="text-[10px] text-muted-foreground">
            Rules are checked top-down per company; the first match decides its earnings metric
            (e.g. Region GB → EPRA Earnings per share, everything else → FFO). Metric pickers across
            the app then offer “{DEFAULT_EPS_METRIC}”, which resolves per company.
          </p>
          {cfg.rules.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 flex-wrap" data-testid={`default-eps-rule-${i}`}>
              <span className="text-[10px] text-muted-foreground font-mono w-4">{i + 1}.</span>
              <Select
                value={r.field}
                onValueChange={(field) => {
                  const rules = [...cfg.rules];
                  rules[i] = { ...rules[i], field, value: "" };
                  save({ ...cfg, rules });
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
                  save({ ...cfg, rules });
                }}
              >
                <SelectTrigger className="h-6 text-[11px] w-[190px]" data-testid={`default-eps-rule-${i}-value`}>
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
                  save({ ...cfg, rules });
                }}
                testId={`default-eps-rule-${i}-metric`}
              />
              <button
                className="text-muted-foreground hover:text-red-400"
                onClick={() => save({ ...cfg, rules: cfg.rules.filter((_, j) => j !== i) })}
                title="Remove rule"
                data-testid={`default-eps-rule-${i}-remove`}
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
              onClick={() =>
                save({ ...cfg, rules: [...cfg.rules, { field: "region", value: "", metric: "" }] })
              }
              data-testid="default-eps-add-rule"
            >
              <Plus className="w-3 h-3" />
              Add rule
            </Button>
            <span className="text-[11px] text-muted-foreground ml-2">Fallback (no rule matches):</span>
            <MetricSelect
              value={cfg.fallback}
              onChange={(fallback) => save({ ...cfg, fallback })}
              testId="default-eps-fallback"
            />
          </div>
          {summary.length > 0 && (
            <p className="text-[10px] text-muted-foreground font-mono" data-testid="default-eps-summary">
              Resolves to: {summary.map(([m, n]) => `${m} ×${n}`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
