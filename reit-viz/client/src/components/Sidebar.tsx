import { useState, useMemo, useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { TickerMeta } from "@shared/schema";
import type { PlottedSeries, ChartConfig, PaneInfo } from "@/pages/Dashboard";
import { getMetricSeries, computeFormula } from "@/lib/dataService";
import { useUpload } from "@/lib/uploadContext";
import { getSeriesColor } from "@/lib/chartColors";
import {
  ChevronDown,
  ChevronRight,
  X,
  Eye,
  EyeOff,
  PanelLeftClose,
  Search,
  Trash2,
  Plus,
  TrendingUp,
  BarChart3,
  Activity,
  LineChart,
  CandlestickChart,
  Layers,
  Calculator,
  ChevronsUpDown,
  Check,
  Globe,
  Upload,
  FileSpreadsheet,
  GripVertical,
  Palette,
  Minus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type AddMode = "overlay" | "new-all" | "new-each";

interface MacroSeriesMeta {
  id: string;
  label: string;
  category: string;
  unit: string;
  freq: string;
}

interface SidebarProps {
  tickers: TickerMeta[];
  plottedSeries: PlottedSeries[];
  panes: PaneInfo[];
  activeTicker: string | null;
  onSetActiveTicker: (t: string | null) => void;
  onAddSeriesWithMode: (
    series: PlottedSeries[],
    mode: AddMode,
    targetPaneId?: number
  ) => void;
  onRemoveSeries: (id: string) => void;
  onRemovePane: (paneId: number) => void;
  onClearAll: () => void;
  onToggleVisibility: (id: string) => void;
  onUpdateSeries: (id: string, updates: Partial<Pick<PlottedSeries, "color" | "lineWidth" | "lineStyle">>) => void;
  onClose: () => void;
  chartConfig: ChartConfig;
  onChartConfigChange: (c: ChartConfig) => void;
  onAddFormulaSeries: (series: PlottedSeries, targetPaneId?: number) => void;
  /** When set, force-open this section name (e.g. "macro"). Reset after handling. */
  forceOpenSection?: string | null;
  onForceOpenHandled?: () => void;
}

// Re-export from uploadContext for backward compatibility
export type { UploadedSheet } from "@/lib/uploadContext";

type ClassificationKey = "economy" | "sector" | "subsector" | "industryGroup" | "industry" | "subindustry";

const GROUPING_OPTIONS: { key: ClassificationKey; label: string }[] = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Ind. Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
];

function groupByClassification(tickers: TickerMeta[], field: ClassificationKey) {
  const groups: Record<string, TickerMeta[]> = {};
  for (const t of tickers) {
    const key = (t as any)[field] || "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
}

const METRIC_CATEGORIES: Record<string, string[]> = {
  Price: ["close", "open", "high", "low"],
  Valuation: [
    "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2",
    "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2",
    "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate",
  ],
  Yields: [
    "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
    "Dividend Yield",
  ],
  Estimates: [
    "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2",
    "AFFO FY1", "AFFO FY2", "EBITDA FY1", "EBITDA FY2",
    "Sales FY1", "Sales FY2",
  ],
  LTM: ["EPS LTM", "FFO LTM", "AFFO LTM", "EBITDA LTM", "Sales LTM"],
  Growth: [
    "FY1 EPS Growth", "FY2 EPS Growth",
    "FY1 FFO Growth", "FY2 FFO Growth",
    "FY1 AFFO Growth", "FY2 AFFO Growth",
  ],
  Performance: [
    "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
    "% off 52wk High", "% off 52wk Low",
  ],
  "Short Interest": [
    "Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M",
  ],
  Other: [
    "Enterprise Value", "52wk High", "52wk Low", "Dividend",
    "Buy Ratings", "Hold Ratings", "Sell Ratings",
    "Bull%", "Bear%", "EPS FY0", "FFO FY0", "AFFO FY0",
  ],
};

export default function Sidebar({
  tickers,
  plottedSeries,
  panes,
  activeTicker,
  onSetActiveTicker,
  onAddSeriesWithMode,
  onRemoveSeries,
  onRemovePane,
  onClearAll,
  onToggleVisibility,
  onUpdateSeries,
  onClose,
  chartConfig,
  onChartConfigChange,
  onAddFormulaSeries,
  forceOpenSection,
  onForceOpenHandled,
}: SidebarProps) {
  const { fundamentalSheets, removeFundamentalWorkbook } = useUpload();
  const uploadedSheets = fundamentalSheets;
  const onRemoveWorkbook = removeFundamentalWorkbook;

  // Resizable sidebar width
  const MIN_W = 280;
  const MAX_W = 700;
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    Math.round(Math.min(Math.max(window.innerWidth * 0.22, 300), 500))
  );
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(340);

  const onResizeStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: globalThis.PointerEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX.current;
      setSidebarWidth(Math.max(MIN_W, Math.min(MAX_W, startW.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [sidebarWidth]);

  const [tickerSearch, setTickerSearch] = useState("");
  const [tickerGroupBy, setTickerGroupBy] = useState<ClassificationKey>("subindustry");
  const [metricSearch, setMetricSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["tickers", "series", "layout"])
  );

  // Handle forceOpenSection from parent
  useEffect(() => {
    if (forceOpenSection) {
      setOpenSections(prev => {
        const next = new Set(prev);
        next.add(forceOpenSection);
        return next;
      });
      onForceOpenHandled?.();
      // Scroll into view after a tick
      setTimeout(() => {
        const el = document.querySelector(`[data-section="${forceOpenSection}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [forceOpenSection, onForceOpenHandled]);
  const [addMode, setAddMode] = useState<AddMode>("new-each");
  const [targetPane, setTargetPane] = useState<string>("auto");

  // Series ticker picker (independent of carousel activeTicker)
  const [seriesTicker, setSeriesTicker] = useState<string>("");
  const [seriesTickerOpen, setSeriesTickerOpen] = useState(false);

  // Sync seriesTicker when activeTicker changes (so preset views keep working)
  useEffect(() => {
    if (activeTicker) setSeriesTicker(activeTicker);
  }, [activeTicker]);

  // Formula builder state
  const [formulaTickerA, setFormulaTickerA] = useState("");
  const [formulaMetricA, setFormulaMetricA] = useState("");
  const [formulaOperator, setFormulaOperator] = useState("+");
  const [formulaRightSide, setFormulaRightSide] = useState<"series" | "number">("series");
  const [formulaTickerB, setFormulaTickerB] = useState("");
  const [formulaMetricB, setFormulaMetricB] = useState("");
  const [formulaConstant, setFormulaConstant] = useState("");
  const [formulaLabel, setFormulaLabel] = useState("");
  const [formulaPaneTarget, setFormulaPaneTarget] = useState("new");
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [formulaError, setFormulaError] = useState("");
  const [tickerAPopoverOpen, setTickerAPopoverOpen] = useState(false);
  const [tickerBPopoverOpen, setTickerBPopoverOpen] = useState(false);

  // Fundamental series state (data comes from upload context)
  const [fundTicker, setFundTicker] = useState<string>("");
  const [fundTickerOpen, setFundTickerOpen] = useState(false);
  const [fundMetricSearch, setFundMetricSearch] = useState("");

  // Available fundamental tickers (from uploaded sheets)
  const fundTickers = useMemo(() => uploadedSheets.map(s => s.sheetName).sort(), [uploadedSheets]);

  // Group sheets by workbook for the loaded-workbooks display
  const loadedWorkbooks = useMemo(() => {
    const map: Record<string, { name: string; sheetCount: number; metricCount: number }> = {};
    for (const s of uploadedSheets) {
      const wb = s.workbook || "unknown";
      if (!map[wb]) map[wb] = { name: wb, sheetCount: 0, metricCount: 0 };
      map[wb].sheetCount++;
      map[wb].metricCount += s.metrics.length;
    }
    return Object.values(map);
  }, [uploadedSheets]);

  // Auto-select first fundamental ticker when sheets are uploaded
  useEffect(() => {
    if (fundTickers.length > 0 && !fundTickers.includes(fundTicker)) {
      setFundTicker(fundTickers[0]);
    }
  }, [fundTickers]);

  // Metrics for the selected fundamental ticker
  const fundMetrics = useMemo(() => {
    if (!fundTicker) return [];
    const sheet = uploadedSheets.find(s => s.sheetName === fundTicker);
    return sheet?.metrics || [];
  }, [fundTicker, uploadedSheets]);

  // Filter fundamental metrics by search
  const filteredFundMetrics = useMemo(() => {
    if (!fundMetricSearch) return fundMetrics;
    const q = fundMetricSearch.toLowerCase();
    return fundMetrics.filter(m => m.name.toLowerCase().includes(q));
  }, [fundMetrics, fundMetricSearch]);

  // Macro overlay state
  const [macroOverlaySearch, setMacroOverlaySearch] = useState("");
  const [macroOverlayLoading, setMacroOverlayLoading] = useState(false);
  const [macroOverlayPane, setMacroOverlayPane] = useState("new");
  const [macroCollapsed, setMacroCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupByClassification(tickers, tickerGroupBy), [tickers, tickerGroupBy]);

  const filteredGroups = useMemo(() => {
    if (!tickerSearch) return groups;
    const q = tickerSearch.toLowerCase();
    return groups
      .map(
        ([name, items]) =>
          [
            name,
            items.filter(
              (t) =>
                t.ticker.toLowerCase().includes(q) ||
                t.name.toLowerCase().includes(q)
            ),
          ] as [string, TickerMeta[]]
      )
      .filter(([, items]) => items.length > 0);
  }, [groups, tickerSearch]);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSection = (name: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectTicker = (ticker: string) => {
    onSetActiveTicker(ticker);
  };

  const addMetricForTicker = async (ticker: string, metric: string) => {
    setLoading(true);
    try {
      const data = await getMetricSeries(ticker, metric);

      const colorIdx = plottedSeries.length;
      const series: PlottedSeries = {
        id: `${ticker}:${metric}:${Date.now()}`,
        ticker,
        metric,
        color: getSeriesColor(colorIdx),
        paneIndex: 0, // Will be set by addSeriesWithMode
        data,
        visible: true,
        label: `${ticker} - ${metric}`,
      };

      const tgtPaneId =
        targetPane !== "auto" ? parseInt(targetPane) : undefined;
      onAddSeriesWithMode([series], addMode, tgtPaneId);
    } catch (e) {
      console.error("Failed to load metric", e);
    }
    setLoading(false);
  };

  const removeMetricForTicker = (ticker: string, metric: string, seriesId?: string) => {
    if (seriesId) {
      // Remove specific series by its unique ID
      onRemoveSeries(seriesId);
    } else {
      // Fallback: remove the first matching series for this ticker+metric
      const match = plottedSeries.find(s => s.ticker === ticker && s.metric === metric);
      if (match) onRemoveSeries(match.id);
    }
  };

  const filteredMetrics = useMemo(() => {
    if (!metricSearch) return METRIC_CATEGORIES;
    const q = metricSearch.toLowerCase();
    const result: Record<string, string[]> = {};
    for (const [cat, metrics] of Object.entries(METRIC_CATEGORIES)) {
      const filtered = metrics.filter((m) => m.toLowerCase().includes(q));
      if (filtered.length > 0) result[cat] = filtered;
    }
    return result;
  }, [metricSearch]);

  // Flat list of all metrics for formula pickers
  const allMetrics = useMemo(() => {
    const flat: string[] = [];
    for (const metrics of Object.values(METRIC_CATEGORIES)) {
      flat.push(...metrics);
    }
    return flat;
  }, []);

  // Ticker list for formula pickers
  const tickerNames = useMemo(() => tickers.map(t => t.ticker).sort(), [tickers]);

  // Auto-generate formula label
  const autoFormulaLabel = useMemo(() => {
    const opSymbol = formulaOperator === "*" ? "×" : formulaOperator === "/" ? "÷" : formulaOperator;
    const left = formulaTickerA && formulaMetricA ? `${formulaTickerA}:${formulaMetricA}` : "?";
    const right = formulaRightSide === "number"
      ? (formulaConstant || "?")
      : (formulaTickerB && formulaMetricB ? `${formulaTickerB}:${formulaMetricB}` : "?");
    return `${left} ${opSymbol} ${right}`;
  }, [formulaTickerA, formulaMetricA, formulaOperator, formulaRightSide, formulaTickerB, formulaMetricB, formulaConstant]);

  const handleAddFormula = useCallback(async () => {
    setFormulaError("");
    if (!formulaTickerA || !formulaMetricA) {
      setFormulaError("Select Series A");
      return;
    }
    if (formulaRightSide === "series" && (!formulaTickerB || !formulaMetricB)) {
      setFormulaError("Select Series B");
      return;
    }
    if (formulaRightSide === "number" && formulaConstant === "") {
      setFormulaError("Enter a number");
      return;
    }

    setFormulaLoading(true);
    try {
      const body: Record<string, any> = {
        tickerA: formulaTickerA,
        metricA: formulaMetricA,
        operator: formulaOperator,
      };
      if (formulaRightSide === "number") {
        body.constant = parseFloat(formulaConstant);
      } else {
        body.tickerB = formulaTickerB;
        body.metricB = formulaMetricB;
      }

      const data = await computeFormula(
        body.tickerA,
        body.metricA,
        body.operator,
        body.tickerB,
        body.metricB,
        body.constant
      );

      const label = formulaLabel || autoFormulaLabel;
      const id = `formula:${label}:${Date.now()}`;
      const series: PlottedSeries = {
        id,
        ticker: formulaTickerA,
        metric: `formula:${label}`,
        color: getSeriesColor(plottedSeries.length),
        paneIndex: 0,
        data,
        visible: true,
        label,
      };

      const tgtPaneId = formulaPaneTarget !== "new" ? parseInt(formulaPaneTarget) : undefined;
      onAddFormulaSeries(series, tgtPaneId);
    } catch (e: any) {
      setFormulaError(e.message || "Failed to compute formula");
    }
    setFormulaLoading(false);
  }, [formulaTickerA, formulaMetricA, formulaOperator, formulaRightSide, formulaTickerB, formulaMetricB, formulaConstant, formulaLabel, autoFormulaLabel, formulaPaneTarget, plottedSeries.length, onAddFormulaSeries]);

  // Group plotted series by pane for layout display
  const seriesByPane = useMemo(() => {
    const map: Record<number, PlottedSeries[]> = {};
    for (const p of panes) {
      map[p.id] = [];
    }
    for (const s of plottedSeries) {
      if (map[s.paneIndex]) {
        map[s.paneIndex].push(s);
      }
    }
    return map;
  }, [plottedSeries, panes]);

  return (
    <div
      className="h-full flex flex-col bg-sidebar overflow-hidden relative"
      style={{ width: sidebarWidth, minWidth: sidebarWidth }}
      data-testid="sidebar"
    >
      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-20 group hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onPointerDown={onResizeStart}
        data-testid="sidebar-resize-handle"
      >
        <div className="absolute right-0 top-0 h-full w-px bg-border group-hover:bg-primary/50 group-active:bg-primary" />
      </div>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">REIT Viz</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 w-7 p-0"
          data-testid="close-sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {/* Chart Type */}
          <SectionHeader
            title="Chart Type"
            icon={<CandlestickChart className="w-3.5 h-3.5" />}
            section="charttype"
            isOpen={openSections.has("charttype")}
            onToggle={() => toggleSection("charttype")}
          />
          {openSections.has("charttype") && (
            <div className="px-2 pb-2 space-y-2">
              <div className="flex gap-1">
                <Button
                  variant={
                    chartConfig.chartType === "candlestick"
                      ? "default"
                      : "secondary"
                  }
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() =>
                    onChartConfigChange({
                      ...chartConfig,
                      chartType: "candlestick",
                    })
                  }
                  data-testid="btn-candlestick"
                >
                  <CandlestickChart className="w-3 h-3 mr-1" />
                  Candle
                </Button>
                <Button
                  variant={
                    chartConfig.chartType === "line" ? "default" : "secondary"
                  }
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() =>
                    onChartConfigChange({ ...chartConfig, chartType: "line" })
                  }
                  data-testid="btn-line"
                >
                  <LineChart className="w-3 h-3 mr-1" />
                  Line
                </Button>
                <Button
                  variant={
                    chartConfig.chartType === "line-scatter" ? "default" : "secondary"
                  }
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() =>
                    onChartConfigChange({ ...chartConfig, chartType: "line-scatter" })
                  }
                  data-testid="btn-line-scatter"
                >
                  <Activity className="w-3 h-3 mr-1" />
                  L+Dot
                </Button>
              </div>
            </div>
          )}

          {/* Tickers */}
          <SectionHeader
            title="Tickers"
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            section="tickers"
            isOpen={openSections.has("tickers")}
            onToggle={() => toggleSection("tickers")}
          />
          {openSections.has("tickers") && (
            <div className="px-2 pb-2 space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search ticker or name..."
                  value={tickerSearch}
                  onChange={(e) => setTickerSearch(e.target.value)}
                  className="h-7 text-xs pl-7 bg-background"
                  data-testid="ticker-search"
                />
              </div>
              {/* Group-by classification selector */}
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="whitespace-nowrap">Group by:</span>
                <div className="flex flex-wrap gap-0.5">
                  {GROUPING_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => { setTickerGroupBy(key); setExpandedGroups(new Set()); }}
                      className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                        tickerGroupBy === key
                          ? "bg-primary/20 text-primary font-medium"
                          : "hover:bg-accent text-muted-foreground"
                      }`}
                      data-testid={`group-by-${key}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
                {filteredGroups.map(([groupName, items]) => (
                  <div key={groupName}>
                    <button
                      className="flex items-center gap-1 w-full text-left px-1 py-0.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground"
                      onClick={() => toggleGroup(groupName)}
                      data-testid={`group-${groupName}`}
                    >
                      {expandedGroups.has(groupName) ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      {tickerGroupBy === "subindustry" ? groupName.replace(" Equity REITs", "") : groupName}
                      <span className="ml-auto text-[10px] opacity-50">
                        {items.length}
                      </span>
                    </button>
                    {expandedGroups.has(groupName) &&
                      items.map((t) => (
                        <button
                          key={t.ticker}
                          className={`flex items-center gap-2 w-full text-left px-3 py-1 text-xs rounded ${
                            activeTicker === t.ticker
                              ? "bg-primary/15 text-primary"
                              : "hover:bg-accent"
                          }`}
                          onClick={() => selectTicker(t.ticker)}
                          data-testid={`ticker-${t.ticker}`}
                        >
                          <span className="font-mono font-semibold w-12">
                            {t.ticker}
                          </span>
                          <span className="text-muted-foreground truncate text-[11px]">
                            {t.name
                              .replace(", Inc.", "")
                              .replace(" Inc.", "")
                              .replace(" Inc", "")}
                          </span>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Series Selection with Add Mode */}
          <SectionHeader
            title="Pick Series"
            icon={<Activity className="w-3.5 h-3.5" />}
            section="series"
            isOpen={openSections.has("series")}
            onToggle={() => toggleSection("series")}
          />
          {openSections.has("series") && (
            <div className="px-2 pb-2 space-y-2">
              {/* Series ticker picker — independent of carousel */}
              <Popover open={seriesTickerOpen} onOpenChange={setSeriesTickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 justify-between px-2 text-[11px] font-mono"
                    data-testid="series-ticker-picker"
                  >
                    {seriesTicker || "Select ticker"}
                    <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search ticker..." className="h-8 text-xs" />
                    <CommandList className="max-h-[250px]">
                      <CommandEmpty>No ticker found.</CommandEmpty>
                      <CommandGroup>
                        {tickers.map(t => (
                          <CommandItem
                            key={t.ticker}
                            value={`${t.ticker} ${t.name} ${t.subindustry}`}
                            onSelect={() => {
                              setSeriesTicker(t.ticker);
                              setSeriesTickerOpen(false);
                            }}
                            className="text-xs"
                          >
                            <Check className={`w-3 h-3 mr-1.5 flex-shrink-0 ${seriesTicker === t.ticker ? "opacity-100" : "opacity-0"}`} />
                            <span className="font-mono font-semibold mr-2">{t.ticker}</span>
                            <span className="text-muted-foreground truncate">{t.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {seriesTicker ? (
                <>

                  {/* Add mode controls */}
                  <div className="space-y-1.5 p-2 rounded bg-accent/30 border border-border/50">
                    <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                      Add mode
                    </div>
                    <Select
                      value={addMode}
                      onValueChange={(v) => setAddMode(v as AddMode)}
                    >
                      <SelectTrigger
                        className="h-6 text-[11px]"
                        data-testid="add-mode"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new-each">
                          New pane per series
                        </SelectItem>
                        <SelectItem value="new-all">
                          New pane (all together)
                        </SelectItem>
                        <SelectItem value="overlay">
                          Overlay on pane
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {addMode === "overlay" && panes.length > 0 && (
                      <Select
                        value={targetPane}
                        onValueChange={setTargetPane}
                      >
                        <SelectTrigger
                          className="h-6 text-[11px]"
                          data-testid="target-pane"
                        >
                          <SelectValue placeholder="Target pane" />
                        </SelectTrigger>
                        <SelectContent>
                          {panes.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search metrics..."
                      value={metricSearch}
                      onChange={(e) => setMetricSearch(e.target.value)}
                      className="h-7 text-xs pl-7 bg-background"
                      data-testid="metric-search"
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Click to add/remove series for <span className="font-mono font-semibold text-primary">{seriesTicker}</span>
                  </div>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {Object.entries(filteredMetrics).map(([cat, metrics]) => (
                      <div key={cat}>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 py-0.5">
                          {cat}
                        </div>
                        {metrics.map((m) => {
                          const plottedCount = plottedSeries.filter(
                            (s) =>
                              s.ticker === seriesTicker && s.metric === m
                          ).length;
                          const plottedItem = plottedSeries.find(
                            (s) =>
                              s.ticker === seriesTicker && s.metric === m
                          );
                          return (
                            <button
                              key={m}
                              className={`flex items-center w-full text-left px-2 py-0.5 text-xs rounded ${
                                plottedCount > 0
                                  ? "bg-primary/10 text-primary"
                                  : "hover:bg-accent"
                              }`}
                              disabled={loading}
                              onClick={() => {
                                addMetricForTicker(seriesTicker, m);
                              }}
                              data-testid={`metric-${m}`}
                            >
                              {plottedCount > 0 ? (
                                <span
                                  className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                                  style={{
                                    backgroundColor: plottedItem?.color,
                                  }}
                                />
                              ) : (
                                <Plus className="w-3 h-3 mr-2 flex-shrink-0 opacity-30" />
                              )}
                              <span className="truncate">{m}</span>
                              {plottedCount > 1 && (
                                <span className="ml-auto text-[10px] font-mono bg-primary/20 text-primary px-1 rounded">
                                  ×{plottedCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  Select a ticker above to browse metrics
                </div>
              )}
            </div>
          )}

          {/* Fundamental Series — from uploaded Excel */}
          <SectionHeader
            title="Fundamental Series"
            icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
            section="fundamental"
            isOpen={openSections.has("fundamental")}
            onToggle={() => toggleSection("fundamental")}
          />
          {openSections.has("fundamental") && (
            <div className="px-2 pb-2 space-y-2">
              {uploadedSheets.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  {uploadedSheets.length} sheets, {uploadedSheets.reduce((s, sh) => s + sh.metrics.length, 0)} metrics loaded.
                </div>
              )}

              {/* Loaded workbooks list */}
              {loadedWorkbooks.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Loaded Workbooks</div>
                  {loadedWorkbooks.map(wb => (
                    <div key={wb.name} className="flex items-center gap-1.5 px-2 py-1 rounded bg-accent/30 border border-border/50 text-[11px]">
                      <FileSpreadsheet className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span className="truncate flex-1 text-muted-foreground" title={wb.name}>{wb.name}</span>
                      <span className="text-[9px] text-muted-foreground/60 flex-shrink-0">{wb.sheetCount}sh / {wb.metricCount}m</span>
                      {onRemoveWorkbook && (
                        <button
                          className="text-muted-foreground/50 hover:text-red-400 transition-colors flex-shrink-0"
                          onClick={() => onRemoveWorkbook(wb.name)}
                          title={`Remove ${wb.name}`}
                          data-testid={`remove-wb-${wb.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {fundTickers.length > 0 ? (
                <>
                  {/* Fundamental ticker picker */}
                  <Popover open={fundTickerOpen} onOpenChange={setFundTickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 justify-between px-2 text-[11px] font-mono"
                        data-testid="fund-ticker-picker"
                      >
                        {fundTicker || "Select ticker"}
                        <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[260px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search uploaded ticker..." className="h-8 text-xs" />
                        <CommandList className="max-h-[250px]">
                          <CommandEmpty>No ticker found.</CommandEmpty>
                          <CommandGroup>
                            {fundTickers.map(t => (
                              <CommandItem
                                key={t}
                                value={t}
                                onSelect={() => {
                                  setFundTicker(t);
                                  setFundTickerOpen(false);
                                }}
                                className="text-xs"
                              >
                                <Check className={`w-3 h-3 mr-1.5 flex-shrink-0 ${fundTicker === t ? "opacity-100" : "opacity-0"}`} />
                                <span className="font-mono font-semibold">{t}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {/* Add mode controls (shared with Pick Series) */}
                  <div className="space-y-1.5 p-2 rounded bg-accent/30 border border-border/50">
                    <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                      Add mode
                    </div>
                    <Select
                      value={addMode}
                      onValueChange={(v) => setAddMode(v as AddMode)}
                    >
                      <SelectTrigger className="h-6 text-[11px]" data-testid="fund-add-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new-each">New pane per series</SelectItem>
                        <SelectItem value="new-all">New pane (all together)</SelectItem>
                        <SelectItem value="overlay">Overlay on pane</SelectItem>
                      </SelectContent>
                    </Select>
                    {addMode === "overlay" && panes.length > 0 && (
                      <Select value={targetPane} onValueChange={setTargetPane}>
                        <SelectTrigger className="h-6 text-[11px]" data-testid="fund-target-pane">
                          <SelectValue placeholder="Target pane" />
                        </SelectTrigger>
                        <SelectContent>
                          {panes.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Metric search */}
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search metrics..."
                      value={fundMetricSearch}
                      onChange={(e) => setFundMetricSearch(e.target.value)}
                      className="h-7 text-xs pl-7 bg-background"
                      data-testid="fund-metric-search"
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Click to add/remove series for <span className="font-mono font-semibold text-emerald-400">{fundTicker}</span>
                  </div>

                  {/* Metric list */}
                  <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
                    {filteredFundMetrics.map((m) => {
                      const seriesId = `uploaded:${fundTicker}:${m.name}`;
                      const isPlotted = plottedSeries.some(s => s.id === seriesId);
                      const plottedItem = plottedSeries.find(s => s.id === seriesId);
                      return (
                        <button
                          key={m.name}
                          className={`flex items-center w-full text-left px-2 py-0.5 text-xs rounded ${
                            isPlotted ? "bg-emerald-500/10 text-emerald-400" : "hover:bg-accent"
                          }`}
                          onClick={() => {
                            if (isPlotted) {
                              onRemoveSeries(seriesId);
                            } else {
                              const colorIdx = plottedSeries.length;
                              const series: PlottedSeries = {
                                id: seriesId,
                                ticker: fundTicker,
                                metric: `xl:${m.name}`,
                                color: getSeriesColor(colorIdx),
                                paneIndex: 0,
                                data: m.data,
                                visible: true,
                                label: `${fundTicker} - ${m.name}`,
                              };
                              const tgtPaneId = targetPane !== "auto" ? parseInt(targetPane) : undefined;
                              onAddSeriesWithMode([series], addMode, tgtPaneId);
                            }
                          }}
                          data-testid={`fund-metric-${m.name}`}
                        >
                          {isPlotted ? (
                            <span
                              className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                              style={{ backgroundColor: plottedItem?.color }}
                            />
                          ) : (
                            <Plus className="w-3 h-3 mr-2 flex-shrink-0 opacity-30" />
                          )}
                          <span className="truncate">{m.name}</span>
                          <span className="ml-auto text-[9px] text-muted-foreground/50 pl-1">{m.data.length}pts</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-muted-foreground text-center py-2">
                  No fundamental data loaded.<br />
                  Upload via <span className="font-semibold">Data Management</span> panel.
                </div>
              )}
            </div>
          )}

          {/* Current Layout — grouped by pane */}
          <SectionHeader
            title="Current Layout"
            icon={<Layers className="w-3.5 h-3.5" />}
            section="layout"
            isOpen={openSections.has("layout")}
            onToggle={() => toggleSection("layout")}
          />
          {openSections.has("layout") && (
            <div className="px-2 pb-2 space-y-2">
              {panes.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2 text-center">
                  No panes
                </div>
              ) : (
                <>
                  <div className="flex justify-end mb-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] text-destructive hover:text-destructive"
                      onClick={onClearAll}
                      data-testid="clear-all"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Clear All
                    </Button>
                  </div>
                  {panes.map((pane) => (
                    <div
                      key={pane.id}
                      className="border border-border/50 rounded p-1.5 space-y-0.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {pane.label}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                          onClick={() => onRemovePane(pane.id)}
                          data-testid={`remove-pane-${pane.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      {(seriesByPane[pane.id] || []).map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-1 px-1 py-0.5 rounded text-xs hover:bg-accent group"
                        >
                          {/* Color swatch — click to open style popover */}
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                className="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-white/10 hover:ring-white/30 transition-all cursor-pointer"
                                style={{ backgroundColor: s.color }}
                                title="Change color & style"
                                data-testid={`series-style-${s.id}`}
                              />
                            </PopoverTrigger>
                            <PopoverContent side="right" align="start" className="w-52 p-2 space-y-2" sideOffset={8}>
                              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                Series Style
                              </div>
                              {/* Color */}
                              <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">Color</label>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="color"
                                    value={s.color}
                                    onChange={(e) => onUpdateSeries(s.id, { color: e.target.value })}
                                    className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                                    data-testid={`color-picker-${s.id}`}
                                  />
                                  {/* Quick color swatches */}
                                  {["#0ea5e9","#22c55e","#f59e0b","#a855f7","#ef4444","#06b6d4","#f97316","#ec4899","#ffffff","#6366f1"].map(c => (
                                    <button
                                      key={c}
                                      className={`w-4 h-4 rounded-sm ring-1 transition-all ${
                                        s.color === c ? "ring-white scale-110" : "ring-white/20 hover:ring-white/50"
                                      }`}
                                      style={{ backgroundColor: c }}
                                      onClick={() => onUpdateSeries(s.id, { color: c })}
                                    />
                                  ))}
                                </div>
                              </div>
                              {/* Line Width */}
                              <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">Line Width</label>
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4].map(w => (
                                    <button
                                      key={w}
                                      className={`flex-1 h-7 rounded text-[10px] font-mono transition-all ${
                                        (s.lineWidth ?? 2) === w
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-accent hover:bg-accent/80 text-muted-foreground"
                                      }`}
                                      onClick={() => onUpdateSeries(s.id, { lineWidth: w })}
                                      data-testid={`linewidth-${w}-${s.id}`}
                                    >
                                      {w}px
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* Line Style */}
                              <div className="space-y-1">
                                <label className="text-[10px] text-muted-foreground">Line Style</label>
                                <div className="flex items-center gap-1">
                                  {[
                                    { value: 0, label: "Solid", preview: "─── " },
                                    { value: 1, label: "Dotted", preview: "····" },
                                    { value: 2, label: "Dashed", preview: "- - -" },
                                    { value: 3, label: "LgDash", preview: "— —" },
                                  ].map(st => (
                                    <button
                                      key={st.value}
                                      className={`flex-1 h-7 rounded text-[10px] font-mono transition-all ${
                                        (s.lineStyle ?? 0) === st.value
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-accent hover:bg-accent/80 text-muted-foreground"
                                      }`}
                                      onClick={() => onUpdateSeries(s.id, { lineStyle: st.value })}
                                      title={st.label}
                                      data-testid={`linestyle-${st.value}-${s.id}`}
                                    >
                                      {st.preview}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <span className="truncate flex-1 font-mono text-[11px]">
                            {s.label}
                          </span>
                          <button
                            className="opacity-0 group-hover:opacity-100 p-0.5"
                            onClick={() => onToggleVisibility(s.id)}
                          >
                            {s.visible ? (
                              <Eye className="w-3 h-3" />
                            ) : (
                              <EyeOff className="w-3 h-3 text-muted-foreground" />
                            )}
                          </button>
                          <button
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-destructive"
                            onClick={() => onRemoveSeries(s.id)}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {(seriesByPane[pane.id] || []).length === 0 && (
                        <div className="text-[10px] text-muted-foreground/40 px-1">
                          Empty
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Macro Overlay */}
          <SectionHeader
            title="Macro Overlay"
            icon={<Globe className="w-3.5 h-3.5" />}
            section="macro"
            isOpen={openSections.has("macro")}
            onToggle={() => toggleSection("macro")}
          />
          {openSections.has("macro") && (
            <MacroOverlaySection
              panes={panes}
              plottedSeries={plottedSeries}
              macroOverlaySearch={macroOverlaySearch}
              onMacroOverlaySearchChange={setMacroOverlaySearch}
              macroOverlayLoading={macroOverlayLoading}
              setMacroOverlayLoading={setMacroOverlayLoading}
              macroOverlayPane={macroOverlayPane}
              onMacroOverlayPaneChange={setMacroOverlayPane}
              macroCollapsed={macroCollapsed}
              onToggleMacroCollapsed={(cat: string) => {
                setMacroCollapsed(prev => {
                  const next = new Set(prev);
                  if (next.has(cat)) next.delete(cat); else next.add(cat);
                  return next;
                });
              }}
              onAddFormulaSeries={onAddFormulaSeries}
            />
          )}

          {/* Formula / Series Builder */}
          <SectionHeader
            title="Formula"
            icon={<Calculator className="w-3.5 h-3.5" />}
            section="formula"
            isOpen={openSections.has("formula")}
            onToggle={() => toggleSection("formula")}
          />
          {openSections.has("formula") && (
            <div className="px-2 pb-2 space-y-2">
              {/* Series A */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Series A
                </div>
                <Popover open={tickerAPopoverOpen} onOpenChange={setTickerAPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-6 justify-between px-2 text-[11px] font-mono"
                      data-testid="formula-ticker-a"
                    >
                      {formulaTickerA || "Ticker"}
                      <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search ticker..." className="h-7 text-[11px]" />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>No ticker found.</CommandEmpty>
                        <CommandGroup>
                          {tickers.map(t => (
                            <CommandItem
                              key={t.ticker}
                              value={`${t.ticker} ${t.name}`}
                              onSelect={() => {
                                setFormulaTickerA(t.ticker);
                                setTickerAPopoverOpen(false);
                              }}
                              className="text-[11px]"
                            >
                              <Check className={`w-3 h-3 mr-1 flex-shrink-0 ${formulaTickerA === t.ticker ? "opacity-100" : "opacity-0"}`} />
                              <span className="font-mono font-bold mr-1">{t.ticker}</span>
                              <span className="text-muted-foreground truncate text-[10px]">{t.name.slice(0, 20)}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Select value={formulaMetricA} onValueChange={setFormulaMetricA}>
                  <SelectTrigger className="h-6 text-[11px]" data-testid="formula-metric-a">
                    <SelectValue placeholder="Metric" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {allMetrics.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Operator */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Operator
                </div>
                <Select value={formulaOperator} onValueChange={setFormulaOperator}>
                  <SelectTrigger className="h-6 text-[11px]" data-testid="formula-operator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="+">+ Add</SelectItem>
                    <SelectItem value="-">− Subtract</SelectItem>
                    <SelectItem value="*">× Multiply</SelectItem>
                    <SelectItem value="/">÷ Divide</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Right side toggle */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Right side
                </div>
                <Select value={formulaRightSide} onValueChange={(v) => setFormulaRightSide(v as "series" | "number")}>
                  <SelectTrigger className="h-6 text-[11px]" data-testid="formula-right-side">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="series">Another series</SelectItem>
                    <SelectItem value="number">A number</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Series B or Number input */}
              {formulaRightSide === "series" ? (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                    Series B
                  </div>
                  <Popover open={tickerBPopoverOpen} onOpenChange={setTickerBPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-6 justify-between px-2 text-[11px] font-mono"
                        data-testid="formula-ticker-b"
                      >
                        {formulaTickerB || "Ticker"}
                        <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[220px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search ticker..." className="h-7 text-[11px]" />
                        <CommandList className="max-h-[200px]">
                          <CommandEmpty>No ticker found.</CommandEmpty>
                          <CommandGroup>
                            {tickers.map(t => (
                              <CommandItem
                                key={t.ticker}
                                value={`${t.ticker} ${t.name}`}
                                onSelect={() => {
                                  setFormulaTickerB(t.ticker);
                                  setTickerBPopoverOpen(false);
                                }}
                                className="text-[11px]"
                              >
                                <Check className={`w-3 h-3 mr-1 flex-shrink-0 ${formulaTickerB === t.ticker ? "opacity-100" : "opacity-0"}`} />
                                <span className="font-mono font-bold mr-1">{t.ticker}</span>
                                <span className="text-muted-foreground truncate text-[10px]">{t.name.slice(0, 20)}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Select value={formulaMetricB} onValueChange={setFormulaMetricB}>
                    <SelectTrigger className="h-6 text-[11px]" data-testid="formula-metric-b">
                      <SelectValue placeholder="Metric" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {allMetrics.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                    Number
                  </div>
                  <Input
                    type="number"
                    step="any"
                    placeholder="e.g. 100"
                    value={formulaConstant}
                    onChange={(e) => setFormulaConstant(e.target.value)}
                    className="h-6 text-[11px] bg-background"
                    data-testid="formula-constant"
                  />
                </div>
              )}

              {/* Label */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Label (optional)
                </div>
                <Input
                  placeholder={autoFormulaLabel}
                  value={formulaLabel}
                  onChange={(e) => setFormulaLabel(e.target.value)}
                  className="h-6 text-[11px] bg-background"
                  data-testid="formula-label"
                />
              </div>

              {/* Add to pane */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Add to pane
                </div>
                <Select value={formulaPaneTarget} onValueChange={setFormulaPaneTarget}>
                  <SelectTrigger className="h-6 text-[11px]" data-testid="formula-pane-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New pane</SelectItem>
                    {panes.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Error */}
              {formulaError && (
                <div className="text-[11px] text-destructive">{formulaError}</div>
              )}

              {/* Submit */}
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                onClick={handleAddFormula}
                disabled={formulaLoading}
                data-testid="formula-add"
              >
                {formulaLoading ? "Computing..." : "Add formula series"}
              </Button>
            </div>
          )}


        </div>
      </ScrollArea>
    </div>
  );
}

// ── Macro Overlay Section ──
const MACRO_OVERLAY_COLORS = [
  "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899",
  "#14b8a6", "#f97316", "#84cc16", "#e879f9", "#22c55e",
];

function MacroOverlaySection({
  panes,
  plottedSeries,
  macroOverlaySearch,
  onMacroOverlaySearchChange,
  macroOverlayLoading,
  setMacroOverlayLoading,
  macroOverlayPane,
  onMacroOverlayPaneChange,
  macroCollapsed,
  onToggleMacroCollapsed,
  onAddFormulaSeries,
}: {
  panes: PaneInfo[];
  plottedSeries: PlottedSeries[];
  macroOverlaySearch: string;
  onMacroOverlaySearchChange: (s: string) => void;
  macroOverlayLoading: boolean;
  setMacroOverlayLoading: (b: boolean) => void;
  macroOverlayPane: string;
  onMacroOverlayPaneChange: (s: string) => void;
  macroCollapsed: Set<string>;
  onToggleMacroCollapsed: (cat: string) => void;
  onAddFormulaSeries: (series: PlottedSeries, targetPaneId?: number) => void;
}) {
  // Fetch macro catalog from backend
  const { data: catalog } = useQuery<MacroSeriesMeta[]>({
    queryKey: ["/api/macro/catalog"],
  });

  const CATEGORY_ORDER = ["Rates", "Housing", "Labor", "Inflation", "Economy", "Commodities", "Markets"];

  const categorized = useMemo(() => {
    if (!catalog) return {};
    const map: Record<string, MacroSeriesMeta[]> = {};
    for (const s of catalog) {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    }
    return map;
  }, [catalog]);

  const filteredCategorized = useMemo(() => {
    if (!macroOverlaySearch) return categorized;
    const q = macroOverlaySearch.toLowerCase();
    const result: Record<string, MacroSeriesMeta[]> = {};
    for (const [cat, items] of Object.entries(categorized)) {
      const filtered = items.filter(s =>
        s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
      );
      if (filtered.length > 0) result[cat] = filtered;
    }
    return result;
  }, [categorized, macroOverlaySearch]);

  // Already-overlaid macro series
  const overlaidMacroIds = useMemo(() => {
    return new Set(plottedSeries.filter(s => s.id.startsWith("macro:")).map(s => s.id.replace("macro:", "")));
  }, [plottedSeries]);

  const addMacroOverlay = useCallback(async (meta: MacroSeriesMeta) => {
    setMacroOverlayLoading(true);
    try {
      const resp = await apiRequest("GET", `/api/macro/series?ids=${meta.id}`);
      const result = await resp.json();
      const entry = result[meta.id];
      if (!entry || entry.data.length === 0) {
        setMacroOverlayLoading(false);
        return;
      }

      const colorIdx = plottedSeries.filter(s => s.id.startsWith("macro:")).length;
      const series: PlottedSeries = {
        id: `macro:${meta.id}`,
        ticker: "MACRO",
        metric: meta.id,
        color: MACRO_OVERLAY_COLORS[colorIdx % MACRO_OVERLAY_COLORS.length],
        paneIndex: 0,
        data: entry.data,
        visible: true,
        label: `\u{1F310} ${meta.label}`,
      };

      const tgtPaneId = macroOverlayPane !== "new" ? parseInt(macroOverlayPane) : undefined;
      onAddFormulaSeries(series, tgtPaneId);
    } catch (e) {
      console.error("Failed to load macro overlay", e);
    }
    setMacroOverlayLoading(false);
  }, [macroOverlayPane, plottedSeries, onAddFormulaSeries, setMacroOverlayLoading]);

  return (
    <div className="px-2 pb-2 space-y-2">
      {/* Target pane selector */}
      <div className="space-y-1 p-2 rounded bg-accent/30 border border-border/50">
        <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
          Overlay target
        </div>
        <Select value={macroOverlayPane} onValueChange={onMacroOverlayPaneChange}>
          <SelectTrigger className="h-6 text-[11px]" data-testid="macro-overlay-pane">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">New pane</SelectItem>
            {panes.map(p => (
              <SelectItem key={p.id} value={String(p.id)}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search macro series..."
          value={macroOverlaySearch}
          onChange={(e) => onMacroOverlaySearchChange(e.target.value)}
          className="h-7 text-xs pl-7 bg-background"
          data-testid="macro-overlay-search"
        />
      </div>

      <div className="text-[10px] text-muted-foreground">
        Click to overlay FRED series on charts
      </div>

      {/* Series list grouped by category */}
      <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
        {!catalog ? (
          <div className="text-xs text-muted-foreground text-center py-2">Loading catalog...</div>
        ) : (
          CATEGORY_ORDER.filter(cat => filteredCategorized[cat]).map(cat => (
            <div key={cat}>
              <button
                className="flex items-center gap-1.5 w-full text-left px-1 py-0.5 hover:bg-accent/50"
                onClick={() => onToggleMacroCollapsed(cat)}
              >
                {macroCollapsed.has(cat) ? (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {cat}
                </span>
                <span className="text-[9px] text-muted-foreground/60 ml-auto">
                  {filteredCategorized[cat]?.filter(s => overlaidMacroIds.has(s.id)).length || 0}/
                  {filteredCategorized[cat]?.length || 0}
                </span>
              </button>
              {!macroCollapsed.has(cat) && filteredCategorized[cat]?.map(s => {
                const isOverlaid = overlaidMacroIds.has(s.id);
                return (
                  <button
                    key={s.id}
                    className={`flex items-center w-full text-left px-3 py-0.5 text-xs rounded ${
                      isOverlaid ? "bg-amber-500/10 text-amber-400" : "hover:bg-accent"
                    }`}
                    disabled={macroOverlayLoading}
                    onClick={() => addMacroOverlay(s)}
                    data-testid={`macro-overlay-${s.id}`}
                  >
                    {isOverlaid ? (
                      <span className="w-2 h-2 rounded-full mr-2 flex-shrink-0 bg-amber-400" />
                    ) : (
                      <Plus className="w-3 h-3 mr-2 flex-shrink-0 opacity-30" />
                    )}
                    <span className="truncate flex-1">{s.label}</span>
                    <span className="text-[9px] text-muted-foreground/50 font-mono ml-1">{s.freq}</span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  icon,
  section,
  isOpen,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  section: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs font-semibold hover:bg-accent rounded"
      onClick={onToggle}
      data-testid={`section-${section}`}
      data-section={section}
    >
      {icon}
      <span>{title}</span>
      <ChevronDown
        className={`w-3 h-3 ml-auto transition-transform ${
          isOpen ? "" : "-rotate-90"
        }`}
      />
    </button>
  );
}
