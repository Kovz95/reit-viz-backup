/**
 * Correlation picker panel — select any two ticker+metric combos from the full
 * universe and plot rolling Pearson correlation to a chart pane. Each leg can
 * also be a COMPUTED attribution component ("Attr: …" pseudo-metrics): the
 * trailing-window est-vs-multiple decomposition from lib/attribution, e.g.
 * correlate a ticker's rolling multiple-share % against its own price rate
 * (Attr: Total Δ) or any stored metric.
 */
import { useState, useMemo, useCallback } from "react";

import { ResizableSidebar } from "@/components/ResizableSidebar";
import { X, LineChart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import type { PlottedSeries, PaneInfo } from "@/pages/Dashboard";
import type { TickerMeta } from "@shared/schema";
import { getMetricSeries } from "@/lib/dataService";
import {
  alignSeries, computeRollingCorrelation, nextDerivedColor,
} from "@/lib/pairMath";
import { groupMetricsByCategory, DERIVED_METRICS } from "@/lib/metricCategories";
import {
  BASIS_FAMILIES, BASIS_PERIODS, loadBasisAlignedAny, buildRollingPath,
  type BasisMode, type BasisPeriod,
} from "@/lib/attribution";

// Curated metrics that should always be offered even if absent from the data.
const METRIC_OPTIONS_BASE = [
  "close",
  "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2",
  "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2",
  "EV/EBITDA LTM", "EV/EBITDA FY2", "Implied Cap Rate",
  "EPS (Default)", "EPS FY1 (Default)", "EPS Growth (Default)", "EPS Growth FY1 (Default)",
  "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
  "Dividend Yield",
  "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2",
  "Short Interest%",
  "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
];

// Computed attribution pseudo-metrics: the trailing attr-window decomposition
// (Δln P = Δln M + Δln E, log-%) rolled over time. "Total Δ" IS the rolling
// price rate; shares are |mult| / (|mult| + |est|) in percent.
const ATTR_METRICS = [
  "Attr: Multiple Δ",
  "Attr: Estimate Δ",
  "Attr: Total Δ (price rate)",
  "Attr: Multiple share %",
  "Attr: Estimate share %",
];
const isAttrMetric = (m: string) => m.startsWith("Attr: ");

interface CorrelationPickerPanelProps {
  tickerList: TickerMeta[];
  panes: PaneInfo[];
  onPlot: (series: PlottedSeries, targetPaneId?: number) => void;
  onClose: () => void;
}

export default function CorrelationPickerPanel({
  tickerList, panes, onPlot, onClose,
}: CorrelationPickerPanelProps) {
  const [tickerA, setTickerA] = useState("");
  const [metricA, setMetricA] = useState("close");
  const [tickerB, setTickerB] = useState("");
  const [metricB, setMetricB] = useState("close");
  const [win, setWin] = useState(63);
  const [plotMode, setPlotMode] = useState<"new" | string>("new");
  const [loading, setLoading] = useState(false);
  const [popA, setPopA] = useState(false);
  const [popB, setPopB] = useState(false);
  // Attribution-leg settings (shared by both legs when either uses an Attr metric)
  const [attrWin, setAttrWin] = useState(63);
  const [attrBasis, setAttrBasis] = useState<BasisMode>("auto");
  const [attrPeriod, setAttrPeriod] = useState<BasisPeriod>("FY2");

  // Union curated metrics + everything the loaded universe exposes + derived,
  // grouped by category for the picker. Attribution pseudo-metrics lead.
  const metricGroups = useMemo(() => {
    const s = new Set<string>([...METRIC_OPTIONS_BASE, ...DERIVED_METRICS]);
    for (const t of tickerList) for (const m of t.metrics || []) s.add(m);
    return [{ category: "Attribution (computed)", metrics: ATTR_METRICS }, ...groupMetricsByCategory([...s])];
  }, [tickerList]);

  const anyAttr = isAttrMetric(metricA) || isAttrMetric(metricB);
  // Same ticker is fine as long as the two series differ (e.g. WELL multiple
  // share % vs WELL price rate).
  const canPlot = tickerA && tickerB && (tickerA !== tickerB || metricA !== metricB);

  const loadLeg = useCallback(async (ticker: string, metric: string): Promise<Array<{ time: string; value: number }> | null> => {
    if (!isAttrMetric(metric)) return getMetricSeries(ticker, metric);
    const res = await loadBasisAlignedAny(ticker, attrBasis, attrPeriod);
    if (!res) return null;
    const path = buildRollingPath(res.aligned, 0, attrWin);
    return path.map((p) => {
      let v: number;
      if (metric === "Attr: Multiple Δ") v = p.mult;
      else if (metric === "Attr: Estimate Δ") v = p.est;
      else if (metric === "Attr: Total Δ (price rate)") v = p.total;
      else {
        const denom = Math.abs(p.mult) + Math.abs(p.est);
        const multShare = denom > 1e-12 ? (Math.abs(p.mult) / denom) * 100 : 50;
        v = metric === "Attr: Multiple share %" ? multShare : 100 - multShare;
      }
      return { time: p.date, value: v };
    });
  }, [attrBasis, attrPeriod, attrWin]);

  const handlePlot = useCallback(async () => {
    if (!canPlot) return;
    setLoading(true);
    try {
      const [dataA, dataB] = await Promise.all([
        loadLeg(tickerA, metricA),
        loadLeg(tickerB, metricB),
      ]);
      if (!dataA?.length || !dataB?.length) return;
      // Attribution deltas are signed — alignSeries drops values ≤ 0, which
      // would silently discard every negative reading, so attr legs use a
      // finite-only inner join instead.
      let aligned;
      if (anyAttr) {
        const mapB = new Map(dataB.map((d) => [d.time, d.value]));
        aligned = dataA.flatMap((d) => {
          const b = mapB.get(d.time);
          return b !== undefined && Number.isFinite(b) && Number.isFinite(d.value)
            ? [{ time: d.time, a: d.value, b }] : [];
        });
      } else {
        aligned = alignSeries(dataA, dataB);
      }
      if (aligned.length < win) return;
      const corrData = computeRollingCorrelation(aligned, win);
      if (!corrData.length) return;

      const legLabel = (t: string, m: string) =>
        m === "close" ? t : `${t} ${m}${isAttrMetric(m) ? ` ${attrWin}d` : ""}`;
      const labelA = legLabel(tickerA, metricA);
      const labelB = legLabel(tickerB, metricB);
      const series: PlottedSeries = {
        id: `corr:${tickerA}:${metricA}:${tickerB}:${metricB}:${Date.now()}`,
        ticker: "CORR",
        metric: "correlation",
        color: nextDerivedColor(),
        paneIndex: 0,
        data: corrData,
        visible: true,
        label: `Corr: ${labelA} / ${labelB} (${win}d)`,
      };

      const targetPaneId = plotMode === "new" ? undefined : parseInt(plotMode);
      onPlot(series, targetPaneId);
    } catch (e) {
      console.error("Failed to compute correlation", e);
    } finally {
      setLoading(false);
    }
  }, [canPlot, tickerA, metricA, tickerB, metricB, win, plotMode, onPlot, loadLeg, anyAttr, attrWin]);

  return (
    <ResizableSidebar storageKey="charts-correlation-picker-width" defaultWidth={280}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <LineChart className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Correlation</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="p-3 space-y-3">
        {/* Series A */}
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold">Series A</Label>
          <div className="flex gap-1">
            <TickerPicker
              value={tickerA}
              onChange={setTickerA}
              tickerList={tickerList}
              open={popA}
              onOpenChange={setPopA}
              testId="corrpick-ticker-a"
            />
            <MetricPicker value={metricA} onChange={setMetricA} groups={metricGroups} />
          </div>
        </div>

        {/* Series B */}
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold">Series B</Label>
          <div className="flex gap-1">
            <TickerPicker
              value={tickerB}
              onChange={setTickerB}
              tickerList={tickerList}
              open={popB}
              onOpenChange={setPopB}
              testId="corrpick-ticker-b"
            />
            <MetricPicker value={metricB} onChange={setMetricB} groups={metricGroups} />
          </div>
        </div>

        {/* Attribution-leg settings */}
        {anyAttr && (
          <div className="space-y-1 rounded border border-border/60 bg-background/40 p-2">
            <Label className="text-[11px] font-semibold">Attribution legs</Label>
            <div className="flex gap-1 items-center flex-wrap">
              <span className="text-[10px] text-muted-foreground">Window</span>
              <Input
                type="number"
                value={attrWin}
                onChange={(e) => setAttrWin(parseInt(e.target.value) || 63)}
                className="h-7 text-xs bg-background w-14"
                data-testid="corrpick-attr-win"
              />
              <Select value={attrBasis} onValueChange={(v) => setAttrBasis(v as BasisMode)}>
                <SelectTrigger className="h-7 text-xs flex-1 min-w-[70px]" data-testid="corrpick-attr-basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" className="text-xs">Auto</SelectItem>
                  {BASIS_FAMILIES.map((f) => (
                    <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={attrPeriod} onValueChange={(v) => setAttrPeriod(v as BasisPeriod)}>
                <SelectTrigger className="h-7 text-xs w-[62px]" data-testid="corrpick-attr-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASIS_PERIODS.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground">
              "Attr" legs are computed: trailing-window Δln decomposition (signed log-%) or share-of-move %.
              "Total Δ" is the rolling price rate over the same window.
            </p>
          </div>
        )}

        {/* Rolling window */}
        <div className="space-y-1">
          <Label className="text-[11px]">Rolling Window (bars)</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              value={win}
              onChange={(e) => setWin(parseInt(e.target.value) || 63)}
              className="h-7 text-xs bg-background w-16"
            />
            <div className="flex gap-0.5">
              {[21, 63, 126, 252].map((w) => (
                <Button
                  key={w}
                  variant={win === w ? "default" : "secondary"}
                  size="sm"
                  className="h-7 px-1.5 text-[10px]"
                  onClick={() => setWin(w)}
                >
                  {w === 21 ? "1M" : w === 63 ? "3M" : w === 126 ? "6M" : "1Y"}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Plot destination */}
        <div className="space-y-1">
          <Label className="text-[11px]">Plot to</Label>
          <Select value={plotMode} onValueChange={setPlotMode}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New pane</SelectItem>
              {panes.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  Overlay on {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Plot button */}
        <Button
          className="w-full h-8 text-xs"
          disabled={!canPlot || loading}
          onClick={handlePlot}
          data-testid="corrpick-plot"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <LineChart className="w-3.5 h-3.5 mr-1" />}
          Plot Correlation
        </Button>

        <p className="text-[10px] text-muted-foreground">
          Computes rolling Pearson correlation between any two series across your full ticker universe.
          The rolling window controls the lookback period in trading days.
        </p>
      </div>
    </ResizableSidebar>
  );
}

// ── Shared sub-components ──

function TickerPicker({
  value, onChange, tickerList, open, onOpenChange, testId,
}: {
  value: string;
  onChange: (v: string) => void;
  tickerList: TickerMeta[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs min-w-[70px] justify-between font-mono" data-testid={testId}>
          {value || "Ticker"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." className="h-8 text-xs" />
          <CommandList className="max-h-[220px]">
            <CommandEmpty>No ticker found.</CommandEmpty>
            <CommandGroup>
              {tickerList.map((t) => (
                <CommandItem
                  key={t.ticker}
                  value={`${t.ticker} ${t.name}`}
                  onSelect={() => { onChange(t.ticker); onOpenChange(false); }}
                  className="text-xs"
                >
                  <span className="font-mono font-bold mr-1">{t.ticker}</span>
                  <span className="truncate text-muted-foreground" title={t.name}>{t.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MetricPicker({
  value, onChange, groups,
}: {
  value: string; onChange: (v: string) => void;
  groups: Array<{ category: string; metrics: string[] }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {groups.map(({ category, metrics }) => (
          <SelectGroup key={category}>
            <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">{category}</SelectLabel>
            {metrics.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
