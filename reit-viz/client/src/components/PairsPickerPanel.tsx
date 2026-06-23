/**
 * Pairs picker panel — select any two ticker+metric combos from the full
 * universe and plot any derived pair series (ratio, spread, z-scores, beta, etc.)
 */
import { useState, useMemo, useCallback } from "react";
import { X, GitBranch, Loader2 } from "lucide-react";

import { ResizableSidebar } from "@/components/ResizableSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import type { PlottedSeries, PaneInfo } from "@/pages/Dashboard";
import type { TickerMeta } from "@shared/schema";
import { getMetricSeries } from "@/lib/dataService";
import {
  alignSeries, computeDerived, nextDerivedColor,
  DERIVED_DEFS, DERIVED_GROUPS,
  type DerivedType, type Aligned,
} from "@/lib/pairMath";

const METRIC_OPTIONS = [
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

interface PairsPickerPanelProps {
  tickerList: TickerMeta[];
  panes: PaneInfo[];
  onPlot: (series: PlottedSeries, targetPaneId?: number) => void;
  onClose: () => void;
}

export default function PairsPickerPanel({
  tickerList, panes, onPlot, onClose,
}: PairsPickerPanelProps) {
  const [tickerA, setTickerA] = useState("");
  const [metricA, setMetricA] = useState("close");
  const [tickerB, setTickerB] = useState("");
  const [metricB, setMetricB] = useState("close");
  const [win, setWin] = useState(63);
  const [plotMode, setPlotMode] = useState<"new" | string>("new");
  const [loading, setLoading] = useState<DerivedType | null>(null);
  const [popA, setPopA] = useState(false);
  const [popB, setPopB] = useState(false);

  // Cache fetched data so multiple derived clicks don't re-fetch
  const [cachedAligned, setCachedAligned] = useState<{
    keyA: string; keyB: string; aligned: Aligned[];
  } | null>(null);

  const canPlot = tickerA && tickerB;

  const fetchAligned = useCallback(async (): Promise<Aligned[] | null> => {
    const keyA = `${tickerA}:${metricA}`;
    const keyB = `${tickerB}:${metricB}`;
    if (cachedAligned && cachedAligned.keyA === keyA && cachedAligned.keyB === keyB) {
      return cachedAligned.aligned;
    }
    const [dataA, dataB] = await Promise.all([
      getMetricSeries(tickerA, metricA),
      getMetricSeries(tickerB, metricB),
    ]);
    if (!dataA?.length || !dataB?.length) return null;
    const aligned = alignSeries(dataA, dataB);
    setCachedAligned({ keyA, keyB, aligned });
    return aligned;
  }, [tickerA, metricA, tickerB, metricB, cachedAligned]);

  const handlePlot = useCallback(async (type: DerivedType) => {
    if (!canPlot) return;
    setLoading(type);
    try {
      const aligned = await fetchAligned();
      if (!aligned || aligned.length < 2) return;

      const data = computeDerived(type, aligned, win);
      if (!data.length) return;

      const labelA = metricA === "close" ? tickerA : `${tickerA} ${metricA}`;
      const labelB = metricB === "close" ? tickerB : `${tickerB} ${metricB}`;
      const def = DERIVED_DEFS.find(d => d.type === type)!;
      const needsWin = ["correlation", "zscore", "spreadZ", "olsResidZ", "beta", "r2"].includes(type);

      const series: PlottedSeries = {
        id: `${type}:${tickerA}:${metricA}:${tickerB}:${metricB}:${Date.now()}`,
        ticker: type.toUpperCase(),
        metric: type,
        color: nextDerivedColor(),
        paneIndex: 0,
        data,
        visible: true,
        label: `${def.label}: ${labelA} / ${labelB}${needsWin ? ` (${win}d)` : ""}`,
      };

      const targetPaneId = plotMode === "new" ? undefined : parseInt(plotMode);
      onPlot(series, targetPaneId);
    } catch (e) {
      console.error("Failed to compute derived series", e);
    } finally {
      setLoading(null);
    }
  }, [canPlot, fetchAligned, tickerA, metricA, tickerB, metricB, win, plotMode, onPlot]);

  return (
    <TooltipProvider delayDuration={200}>
    <ResizableSidebar storageKey="charts-pairs-picker-width" defaultWidth={280}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Pairs / Derived</span>
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
              onChange={(v) => { setTickerA(v); setCachedAligned(null); }}
              tickerList={tickerList}
              open={popA}
              onOpenChange={setPopA}
            />
            <MetricPicker value={metricA} onChange={(v) => { setMetricA(v); setCachedAligned(null); }} />
          </div>
        </div>

        {/* Series B */}
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold">Series B</Label>
          <div className="flex gap-1">
            <TickerPicker
              value={tickerB}
              onChange={(v) => { setTickerB(v); setCachedAligned(null); }}
              tickerList={tickerList}
              open={popB}
              onOpenChange={setPopB}
            />
            <MetricPicker value={metricB} onChange={(v) => { setMetricB(v); setCachedAligned(null); }} />
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

        {/* Derived series buttons by group */}
        {canPlot ? (
          <div className="space-y-2 pt-1">
            {DERIVED_GROUPS.map(group => {
              const defs = DERIVED_DEFS.filter(d => d.group === group);
              return (
                <div key={group}>
                  <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider mb-1">
                    {group}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {defs.map((def) => (
                      <Tooltip key={def.type}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={loading !== null}
                            onClick={() => handlePlot(def.type)}
                          >
                            {loading === def.type && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            {def.label}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-[200px]">
                          {def.tip}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Pick two tickers to see derived series options
          </div>
        )}

        <div className="border-t border-border pt-2">
          <p className="text-[10px] text-muted-foreground">
            <span className="font-semibold">Core:</span> Ratio, log ratio, spread.{" "}
            <span className="font-semibold">Z-Score:</span> Raw Z, Spread Z (rolling-β), OLS Resid Z, percentile rank.{" "}
            <span className="font-semibold">Stats:</span> Correlation, beta, R², β-adj spread.
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Rolling window applies to Z, Spread Z, OLS-Z, Corr, β, and R².
          </p>
        </div>
      </div>
    </ResizableSidebar>
    </TooltipProvider>
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

function MetricPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {METRIC_OPTIONS.map((m) => (
          <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
