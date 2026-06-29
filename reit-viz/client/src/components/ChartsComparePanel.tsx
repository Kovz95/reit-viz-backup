// Reconstructed from recovered-bundle/index-CsG73Aq_.js (fn cIe) on 2026-06-17
/**
 * Compare sidebar panel — pick 2+ tickers + a metric, choose an anchor mode,
 * then overlay each series on the chart normalized to index-100 at the anchor date.
 */
import { useState, useMemo, useCallback } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { groupMetricsRecord, DERIVED_METRICS } from "@/lib/metricCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import type { PlottedSeries } from "@/pages/Dashboard";
import type { TickerMeta } from "@shared/schema";
import { getMetricSeries } from "@/lib/dataService";

// Color palette (bundle: ad)
const COMPARE_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#84cc16",
];

type AnchorMode = "earliest-common" | "first-visible" | "custom" | "latest";

interface ChartsComparePanelProps {
  tickers: TickerMeta[];
  plottedSeries: PlottedSeries[];
  onAddSeriesWithMode: (
    seriesList: PlottedSeries[],
    mode: "overlay" | "new-all" | "new-each",
    targetPaneId?: number,
  ) => void;
  onRemoveSeries: (id: string) => void;
}

export default function ChartsComparePanel({
  tickers,
  plottedSeries,
  onAddSeriesWithMode,
  onRemoveSeries,
}: ChartsComparePanelProps) {
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [metric, setMetric] = useState("close");
  const [tickerPickerOpen, setTickerPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [anchorMode, setAnchorMode] = useState<AnchorMode>("earliest-common");
  const [customDate, setCustomDate] = useState("");
  const [metricSearch, setMetricSearch] = useState("");
  const [metricPickerOpen, setMetricPickerOpen] = useState(false);

  // Available metrics = whatever the loaded universe exposes + client-derived ones,
  // grouped by the shared categorizer (so new workbook metrics appear automatically).
  const metricGroups = useMemo(() => {
    const s = new Set<string>(DERIVED_METRICS);
    for (const t of tickers) for (const m of t.metrics || []) s.add(m);
    return groupMetricsRecord([...s]);
  }, [tickers]);

  const filteredMetrics = useMemo(() => {
    const query = metricSearch.trim().toLowerCase();
    if (!query) return metricGroups;
    const result: Record<string, string[]> = {};
    for (const [group, metrics] of Object.entries(metricGroups)) {
      const matched = metrics.filter((m) => m.toLowerCase().includes(query));
      if (matched.length) result[group] = matched;
    }
    return result;
  }, [metricSearch, metricGroups]);

  const handleAddTicker = useCallback(
    (ticker: string) => {
      setSelectedTickers((prev) =>
        prev.includes(ticker) ? prev : [...prev, ticker],
      );
      setTickerPickerOpen(false);
    },
    [],
  );

  const handleRemoveTicker = useCallback((ticker: string) => {
    setSelectedTickers((prev) => prev.filter((t) => t !== ticker));
  }, []);

  const handleCompare = useCallback(async () => {
    if (selectedTickers.length < 2) return;
    setLoading(true);

    // Remove any prior compare- series.
    plottedSeries
      .filter((s) => s.id.startsWith("compare-"))
      .map((s) => s.id)
      .forEach((id) => onRemoveSeries(id));

    const getVisibleTimeRange = (window as any).__reitVizGetVisibleTimeRange;
    const visibleRange =
      typeof getVisibleTimeRange === "function" ? getVisibleTimeRange() : null;

    try {
      const fetched = await Promise.all(
        selectedTickers.map(async (ticker) => {
          const data = await getMetricSeries(ticker, metric);
          return { ticker, data };
        }),
      );

      // Latest first-available date across all selected tickers (earliest common).
      const earliestCommon = (() => {
        const firstTimes = fetched
          .map((s) => s.data[0]?.time)
          .filter(Boolean)
          .sort();
        return firstTimes[firstTimes.length - 1];
      })();

      let anchorDate: string | undefined;
      if (anchorMode === "earliest-common") {
        anchorDate = earliestCommon;
      } else if (anchorMode === "first-visible") {
        if (visibleRange?.from) {
          anchorDate =
            !earliestCommon || visibleRange.from >= earliestCommon
              ? visibleRange.from
              : earliestCommon;
        } else {
          anchorDate = earliestCommon;
        }
      } else if (anchorMode === "custom") {
        if (customDate) {
          anchorDate =
            !earliestCommon || customDate >= earliestCommon
              ? customDate
              : earliestCommon;
        } else {
          anchorDate = earliestCommon;
        }
      } else if (anchorMode === "latest") {
        anchorDate = fetched
          .map((s) => s.data[s.data.length - 1]?.time)
          .filter(Boolean)
          .sort()[0];
      }

      if (!anchorDate) {
        setLoading(false);
        return;
      }

      const series = fetched
        .map((entry, index) => {
          const anchorIdx = entry.data.findIndex((d) => d.time >= anchorDate!);
          if (anchorIdx < 0) return null;
          const anchorValue = entry.data[anchorIdx].value;
          if (!anchorValue || anchorValue === 0) return null;

          let sliceStart: number;
          let sliceEnd: number | undefined;
          if (anchorMode === "latest") {
            sliceStart = 0;
            sliceEnd = anchorIdx + 1;
          } else {
            sliceStart = anchorIdx;
            sliceEnd = undefined;
          }

          const normalized = entry.data.slice(sliceStart, sliceEnd).map((d) => ({
            time: d.time,
            value: (d.value / anchorValue) * 100,
          }));
          const color = COMPARE_COLORS[index % COMPARE_COLORS.length];

          return {
            id: `compare-${entry.ticker}-${metric}-${Date.now()}`,
            ticker: entry.ticker,
            metric,
            color,
            lineWidth: 2,
            lineStyle: 0,
            paneIndex: 0,
            data: normalized,
            visible: true,
            label: `${entry.ticker} ${metric} (idx 100 @ ${anchorDate})`,
          } as PlottedSeries;
        })
        .filter(Boolean) as PlottedSeries[];

      if (series.length > 0) onAddSeriesWithMode(series, "new-all");
    } catch (error) {
      console.error("Compare failed:", error);
    }
    setLoading(false);
  }, [
    selectedTickers,
    metric,
    anchorMode,
    customDate,
    onAddSeriesWithMode,
    onRemoveSeries,
    plottedSeries,
  ]);

  return (
    <div className="px-2 pb-2 space-y-2">
      <div className="text-[10px] text-muted-foreground">
        Pick 2+ tickers to overlay normalized to 100
      </div>

      <Popover open={tickerPickerOpen} onOpenChange={setTickerPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 justify-between px-2 text-[11px]"
            data-testid="compare-ticker-picker"
          >
            Add ticker...
            <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[440px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search ticker..." className="h-8 text-xs" />
            <CommandList className="max-h-[250px]">
              <CommandEmpty>No ticker found.</CommandEmpty>
              <CommandGroup>
                {tickers.map((t) => (
                  <CommandItem
                    key={t.ticker}
                    value={`${t.ticker} ${t.name} ${t.subindustry}`}
                    onSelect={() => handleAddTicker(t.ticker)}
                    className="text-xs"
                  >
                    <Check
                      className={`w-3 h-3 mr-1.5 flex-shrink-0 ${
                        selectedTickers.includes(t.ticker)
                          ? "opacity-100"
                          : "opacity-0"
                      }`}
                    />
                    <span className="font-mono font-semibold mr-2 whitespace-nowrap">
                      {t.ticker}
                    </span>
                    <span
                      className="text-muted-foreground flex-1 min-w-0 truncate"
                      title={t.name}
                    >
                      {t.name}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedTickers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTickers.map((ticker, index) => (
            <span
              key={ticker}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border"
              style={{
                borderColor: COMPARE_COLORS[index % COMPARE_COLORS.length] + "60",
                color: COMPARE_COLORS[index % COMPARE_COLORS.length],
                backgroundColor:
                  COMPARE_COLORS[index % COMPARE_COLORS.length] + "15",
              }}
            >
              {ticker}
              <button
                onClick={() => handleRemoveTicker(ticker)}
                className="hover:text-foreground"
                data-testid={`compare-remove-${ticker}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Popover open={metricPickerOpen} onOpenChange={setMetricPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="h-6 text-[11px] w-full justify-between font-normal"
            data-testid="compare-metric"
          >
            <span className="truncate" title={metric}>
              {metric}
            </span>
            <ChevronsUpDown className="w-3 h-3 opacity-50 ml-1 flex-shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search metric..."
              value={metricSearch}
              onValueChange={setMetricSearch}
              className="h-8"
            />
            <CommandList className="max-h-[420px]">
              <CommandEmpty>No metric found.</CommandEmpty>
              {Object.entries(filteredMetrics).map(([group, metrics]) => (
                <CommandGroup key={group} heading={group}>
                  {metrics.map((m) => (
                    <CommandItem
                      key={m}
                      value={m}
                      onSelect={() => {
                        setMetric(m);
                        setMetricPickerOpen(false);
                      }}
                      className="text-xs"
                    >
                      {metric === m && <Check className="w-3 h-3 mr-1.5" />}
                      <span className={metric === m ? "" : "ml-[18px]"}>{m}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="space-y-1">
        <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
          Anchor (=100)
        </div>
        <Select
          value={anchorMode}
          onValueChange={(value) => setAnchorMode(value as AnchorMode)}
        >
          <SelectTrigger className="h-6 text-[11px]" data-testid="compare-anchor-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="earliest-common" className="text-xs">
              Earliest common date
            </SelectItem>
            <SelectItem value="first-visible" className="text-xs">
              First visible day
            </SelectItem>
            <SelectItem value="custom" className="text-xs">
              Custom date
            </SelectItem>
            <SelectItem value="latest" className="text-xs">
              Latest day
            </SelectItem>
          </SelectContent>
        </Select>
        {anchorMode === "custom" && (
          <Input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="h-6 text-[11px]"
            data-testid="compare-anchor-custom-date"
          />
        )}
        <p className="text-[10px] text-muted-foreground leading-tight">
          {anchorMode === "earliest-common" &&
            "Each line starts at 100 on the earliest date where every selected ticker has data."}
          {anchorMode === "first-visible" &&
            "Rebases to the left edge of your current chart view. Each line starts at 100 on that date."}
          {anchorMode === "custom" &&
            "Pick any date. Each line starts at 100 on that date."}
          {anchorMode === "latest" &&
            "Each line ENDS at 100 on the most recent date all tickers share. Shows history leading up to the anchor."}
        </p>
      </div>

      <Button
        size="sm"
        className="w-full h-7 text-xs"
        onClick={handleCompare}
        disabled={selectedTickers.length < 2 || loading}
        data-testid="compare-go"
      >
        {loading
          ? "Loading..."
          : `Compare ${selectedTickers.length} tickers (indexed to 100)`}
      </Button>
    </div>
  );
}
