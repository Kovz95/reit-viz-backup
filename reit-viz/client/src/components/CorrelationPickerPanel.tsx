/**
 * Correlation picker panel — select any two ticker+metric combos from the full
 * universe and plot rolling Pearson correlation to a chart pane.
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

// Curated metrics that should always be offered even if absent from the data.
const METRIC_OPTIONS_BASE = [
  "close",
  "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2",
  "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2",
  "EV/EBITDA LTM", "EV/EBITDA FY2", "Implied Cap Rate",
  "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
  "Dividend Yield",
  "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2",
  "Short Interest%",
  "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
];

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

  // Union curated metrics + everything the loaded universe exposes + derived,
  // grouped by category for the picker.
  const metricGroups = useMemo(() => {
    const s = new Set<string>([...METRIC_OPTIONS_BASE, ...DERIVED_METRICS]);
    for (const t of tickerList) for (const m of t.metrics || []) s.add(m);
    return groupMetricsByCategory([...s]);
  }, [tickerList]);

  const canPlot = tickerA && tickerB && tickerA !== tickerB;

  const handlePlot = useCallback(async () => {
    if (!canPlot) return;
    setLoading(true);
    try {
      const [dataA, dataB] = await Promise.all([
        getMetricSeries(tickerA, metricA),
        getMetricSeries(tickerB, metricB),
      ]);
      if (!dataA?.length || !dataB?.length) return;
      const aligned = alignSeries(dataA, dataB);
      if (aligned.length < win) return;
      const corrData = computeRollingCorrelation(aligned, win);
      if (!corrData.length) return;

      const labelA = metricA === "close" ? tickerA : `${tickerA} ${metricA}`;
      const labelB = metricB === "close" ? tickerB : `${tickerB} ${metricB}`;
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
  }, [canPlot, tickerA, metricA, tickerB, metricB, win, plotMode, onPlot]);

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
            />
            <MetricPicker value={metricB} onChange={setMetricB} groups={metricGroups} />
          </div>
        </div>

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
  value, onChange, tickerList, open, onOpenChange,
}: {
  value: string;
  onChange: (v: string) => void;
  tickerList: TickerMeta[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs min-w-[70px] justify-between font-mono">
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
