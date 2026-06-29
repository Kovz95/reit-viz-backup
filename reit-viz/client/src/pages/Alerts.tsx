// Reconstructed from recovered-bundle/Alerts-DlZaNYym.js on 2026-06-11

import { useState, useCallback, useMemo } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { createLucideIcon } from "@/lib/createLucideIcon";
import { apiRequest } from "@/lib/apiRequest";
import { getTickers, type TickerMeta } from "@/lib/dataService";
import { groupMetricsRecord, DERIVED_METRICS } from "@/lib/metricCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Bell,
  RefreshCw,
  Download,
  Check,
  ChevronsUpDown,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";

const BellOff = createLucideIcon("BellOff", [
  ["path", { d: "M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5", key: "o7mx20" }],
  ["path", { d: "M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7", key: "16f1lm" }],
  ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0", key: "qgo35s" }],
  ["path", { d: "m2 2 20 20", key: "1ooewy" }],
]);

const BellRing = createLucideIcon("BellRing", [
  ["path", { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", key: "1qo2s2" }],
  ["path", { d: "M10.3 21a1.94 1.94 0 0 0 3.4 0", key: "qgo35s" }],
  ["path", { d: "M4 2C2.8 3.7 2 5.7 2 8", key: "tap9e0" }],
  ["path", { d: "M22 8c0-2.3-.8-4.3-2-6", key: "5bb3ad" }],
]);

const OPERATOR_OPTIONS = [
  { value: "<", label: "<" },
  { value: ">", label: ">" },
  { value: "<=", label: "≤" },
  { value: ">=", label: "≥" },
];

const OPERATOR_LABELS: Record<string, string> = {
  "<": "<",
  ">": ">",
  "<=": "≤",
  ">=": "≥",
};

const METRIC_GROUPS_BASE: Record<string, string[]> = {
  Volume: ["Volume"],
  Valuation: [
    "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2",
    "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2",
  ],
  Yields: [
    "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield",
    "Implied Cap Rate",
  ],
  Estimates: [
    "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2", "EBITDA FY1",
    "EBITDA FY2", "Sales FY1", "Sales FY2",
  ],
  LTM: ["EPS LTM", "FFO LTM", "AFFO LTM", "Sales LTM", "EBITDA LTM"],
  Growth: [
    "FY1 EPS Growth", "FY2 EPS Growth", "FY1 FFO Growth", "FY2 FFO Growth",
    "FY1 AFFO Growth", "FY2 AFFO Growth",
  ],
  Performance: [
    "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
    "% off 52wk High", "% off 52wk Low",
  ],
  Other: [
    "close", "Enterprise Value", "Dividend", "Short Interest%", "Buy Ratings",
    "Hold Ratings", "Sell Ratings",
  ],
};

interface Alert {
  id: number;
  ticker: string;
  metric: string;
  operator: string;
  threshold: number;
  label: string | null;
  enabled: boolean;
  triggered: boolean;
  triggeredAt: string | null;
  triggeredValue: string | null;
  createdAt?: string;
}

interface EvalTriggered {
  id: number;
  ticker: string;
  metric: string;
  operator: string;
  threshold: number;
  currentValue: number;
  label?: string;
}

interface EvalResult {
  triggered: EvalTriggered[];
  checked: number;
}

interface AlertGroupProps {
  title: string;
  alerts: Alert[];
  badgeClass: string;
  onToggle: (alert: Alert) => void;
  onDelete: (alert: Alert) => void;
  onReset: (alert: Alert) => void;
}

function AlertGroup({ title, alerts, badgeClass, onToggle, onDelete, onReset }: AlertGroupProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeClass}`}>
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground">{alerts.length}</span>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/20 border-b border-border">
              <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Ticker
              </th>
              <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Condition
              </th>
              <th className="text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Label
              </th>
              <th className="text-right px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Last Value
              </th>
              <th className="text-right px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Triggered
              </th>
              <th className="text-center px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-[100px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <tr
                key={alert.id}
                className="border-b border-border/30 hover:bg-muted/10 transition-colors"
              >
                <td
                  className="px-3 py-1.5 font-mono font-bold text-primary"
                  data-testid={`alert-ticker-${alert.id}`}
                >
                  {alert.ticker}
                </td>
                <td className="px-3 py-1.5 font-mono">
                  {alert.metric} {OPERATOR_LABELS[alert.operator] || alert.operator} {alert.threshold}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{alert.label || "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono">
                  {alert.triggeredValue ? parseFloat(alert.triggeredValue).toFixed(2) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {alert.triggeredAt ? new Date(alert.triggeredAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onToggle(alert)}
                      className="p-1 rounded hover:bg-muted/50 transition-colors"
                      title={alert.enabled ? "Disable alert" : "Enable alert"}
                      data-testid={`btn-toggle-${alert.id}`}
                    >
                      {alert.enabled ? (
                        <BellOff size={12} className="text-muted-foreground" />
                      ) : (
                        <Bell size={12} className="text-green-400" />
                      )}
                    </button>
                    {alert.triggered && (
                      <button
                        onClick={() => onReset(alert)}
                        className="p-1 rounded hover:bg-muted/50 transition-colors"
                        title="Reset triggered state"
                        data-testid={`btn-reset-${alert.id}`}
                      >
                        <RotateCcw size={12} className="text-muted-foreground" />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(alert)}
                      className="p-1 rounded hover:bg-red-500/20 transition-colors"
                      title="Delete alert"
                      data-testid={`btn-delete-${alert.id}`}
                    >
                      <Trash2 size={12} className="text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Alerts() {
  const queryClient = useQueryClient();
  const [tickerMetas, setTickerMetas] = useState<TickerMeta[]>([]);

  useQuery({
    queryKey: ["/api/tickers"],
    queryFn: async () => {
      const result = await getTickers();
      setTickerMetas(result);
      return result;
    },
  });

  // Union curated metric groups + the loaded universe's metrics + derived,
  // grouped by the shared categorizer so new metrics are alertable.
  const metricGroups = useMemo(() => {
    const s = new Set<string>([...Object.values(METRIC_GROUPS_BASE).flat(), ...DERIVED_METRICS]);
    for (const t of tickerMetas) for (const m of t.metrics || []) s.add(m);
    return groupMetricsRecord([...s]);
  }, [tickerMetas]);

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/alerts", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("POST", `/api/alerts/${id}/update`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/alerts/${id}/delete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });

  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const handleEvaluate = useCallback(async () => {
    setIsEvaluating(true);
    try {
      const result: EvalResult = await (await apiRequest("POST", "/api/alerts/evaluate")).json();
      setEvalResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    } catch (err) {
      console.error("Alert evaluation failed:", err);
    }
    setIsEvaluating(false);
  }, [queryClient]);

  const [selectedTicker, setSelectedTicker] = useState("");
  const [selectedMetric, setSelectedMetric] = useState("P/FFO FY2");
  const [selectedOperator, setSelectedOperator] = useState("<");
  const [threshold, setThreshold] = useState("");
  const [label, setLabel] = useState("");
  const [tickerPopoverOpen, setTickerPopoverOpen] = useState(false);

  const sortedTickers = useMemo(() => tickerMetas.map((t) => t.ticker).sort(), [tickerMetas]);

  const handleCreateAlert = useCallback(() => {
    if (!selectedTicker || !threshold) return;
    createMutation.mutate({
      ticker: selectedTicker,
      metric: selectedMetric,
      operator: selectedOperator,
      threshold: parseFloat(threshold),
      label: label || null,
    });
    setThreshold("");
    setLabel("");
  }, [selectedTicker, selectedMetric, selectedOperator, threshold, label, createMutation]);

  const handleToggle = useCallback(
    (alert: Alert) => {
      updateMutation.mutate({ id: alert.id, enabled: !alert.enabled });
    },
    [updateMutation]
  );

  const handleReset = useCallback(
    (alert: Alert) => {
      updateMutation.mutate({
        id: alert.id,
        triggered: false,
        triggeredAt: null,
        triggeredValue: null,
      });
    },
    [updateMutation]
  );

  const handleExportCsv = useCallback(() => {
    if (alerts.length === 0) return;
    const headers = [
      "Ticker", "Metric", "Operator", "Threshold", "Label", "Enabled", "Triggered",
      "Triggered At", "Triggered Value", "Created",
    ];
    const rows = alerts.map((a) => [
      a.ticker,
      a.metric,
      OPERATOR_LABELS[a.operator] || a.operator,
      a.threshold,
      a.label || "",
      a.enabled ? "Yes" : "No",
      a.triggered ? "Yes" : "No",
      a.triggeredAt || "",
      a.triggeredValue || "",
      a.createdAt?.slice(0, 10) || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    anchor.download = `alerts_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
  }, [alerts]);

  const triggeredAlerts = useMemo(() => alerts.filter((a) => a.triggered), [alerts]);
  const activeAlerts = useMemo(() => alerts.filter((a) => a.enabled && !a.triggered), [alerts]);
  const disabledAlerts = useMemo(() => alerts.filter((a) => !a.enabled), [alerts]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-primary" />
            <h2 className="text-sm font-bold text-foreground tracking-tight">Alerts / Watchlist</h2>
            <span className="text-[10px] font-mono text-muted-foreground">
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={handleEvaluate}
              disabled={isEvaluating || alerts.length === 0}
              data-testid="btn-evaluate"
            >
              <RefreshCw size={12} className={isEvaluating ? "animate-spin" : ""} />
              Check Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1 text-[11px]"
              onClick={handleExportCsv}
              disabled={alerts.length === 0}
              data-testid="alerts-export-csv"
            >
              <Download className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {/* New Alert form */}
        <div className="border border-border rounded-lg p-3 mb-4 bg-card">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            New Alert
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            {/* Ticker picker */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Ticker</label>
              <Popover open={tickerPopoverOpen} onOpenChange={setTickerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-[120px] h-8 justify-between text-xs"
                    data-testid="select-alert-ticker"
                  >
                    {selectedTicker || "Select..."}
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[180px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search ticker..." className="h-8 text-xs" />
                    <CommandList>
                      <CommandEmpty>No ticker found.</CommandEmpty>
                      <CommandGroup>
                        {sortedTickers.map((ticker) => (
                          <CommandItem
                            key={ticker}
                            value={ticker}
                            onSelect={() => {
                              setSelectedTicker(ticker);
                              setTickerPopoverOpen(false);
                            }}
                            className="text-xs"
                          >
                            <Check
                              className={`mr-1 h-3 w-3 ${selectedTicker === ticker ? "opacity-100" : "opacity-0"}`}
                            />
                            {ticker}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Metric selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Metric</label>
              <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                <SelectTrigger
                  className="w-[160px] h-8 text-xs"
                  data-testid="select-alert-metric"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(metricGroups).map(([group, metrics]) => (
                    <div key={group}>
                      <div className="px-2 py-1 text-[10px] text-muted-foreground font-semibold uppercase">
                        {group}
                      </div>
                      {metrics.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs">
                          {m}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Operator selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Condition</label>
              <Select value={selectedOperator} onValueChange={setSelectedOperator}>
                <SelectTrigger
                  className="w-[70px] h-8 text-xs"
                  data-testid="select-alert-operator"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATOR_OPTIONS.map((op) => (
                    <SelectItem key={op.value} value={op.value} className="text-xs">
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Threshold */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Threshold</label>
              <Input
                type="number"
                step="any"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-[100px] h-8 text-xs"
                placeholder="e.g. 18"
                data-testid="input-alert-threshold"
              />
            </div>

            {/* Label */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Label (optional)</label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-[180px] h-8 text-xs"
                placeholder="e.g. Valuation cheap"
                data-testid="input-alert-label"
              />
            </div>

            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={handleCreateAlert}
              disabled={!selectedTicker || !threshold || createMutation.isPending}
              data-testid="btn-create-alert"
            >
              <Plus size={12} />
              Add Alert
            </Button>
          </div>
        </div>

        {/* Evaluation result banner */}
        {evalResult && (
          <div
            className={`border rounded-lg p-3 mb-4 ${
              evalResult.triggered.length > 0
                ? "border-amber-500/50 bg-amber-500/5"
                : "border-green-500/50 bg-green-500/5"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {evalResult.triggered.length > 0 ? (
                <BellRing size={14} className="text-amber-400" />
              ) : (
                <Check size={14} className="text-green-400" />
              )}
              <span className="text-xs font-semibold">
                {evalResult.triggered.length > 0
                  ? `${evalResult.triggered.length} alert${evalResult.triggered.length !== 1 ? "s" : ""} triggered`
                  : `All ${evalResult.checked} alerts checked — none triggered`}
              </span>
            </div>
            {evalResult.triggered.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                {evalResult.triggered.map((item) => (
                  <div key={item.id} className="text-[11px] text-amber-300 font-mono">
                    {item.ticker} {item.metric} = {item.currentValue.toFixed(2)} (
                    {OPERATOR_LABELS[item.operator] || item.operator} {item.threshold})
                    {item.label && (
                      <span className="text-muted-foreground ml-2">— {item.label}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Alert list */}
        {isLoading ? (
          <div className="text-center text-muted-foreground text-xs py-8">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-12">
            <Bell size={24} className="mx-auto mb-2 opacity-30" />
            <p>No alerts yet. Create one above to start monitoring.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {triggeredAlerts.length > 0 && (
              <AlertGroup
                title="Triggered"
                alerts={triggeredAlerts}
                badgeClass="bg-amber-500/15 text-amber-400 border-amber-500/30"
                onToggle={handleToggle}
                onDelete={(a) => deleteMutation.mutate(a.id)}
                onReset={handleReset}
              />
            )}
            {activeAlerts.length > 0 && (
              <AlertGroup
                title="Active"
                alerts={activeAlerts}
                badgeClass="bg-green-500/15 text-green-400 border-green-500/30"
                onToggle={handleToggle}
                onDelete={(a) => deleteMutation.mutate(a.id)}
                onReset={handleReset}
              />
            )}
            {disabledAlerts.length > 0 && (
              <AlertGroup
                title="Disabled"
                alerts={disabledAlerts}
                badgeClass="bg-muted/30 text-muted-foreground border-border/50"
                onToggle={handleToggle}
                onDelete={(a) => deleteMutation.mutate(a.id)}
                onReset={handleReset}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
