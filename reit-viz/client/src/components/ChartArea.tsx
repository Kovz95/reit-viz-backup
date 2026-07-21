import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { getTickerEvents, getMacroEventDates, MACRO_EVENT_TYPES, getMetricSeries } from "@/lib/dataService";
import { getChartSignals, onChartSignals } from "@/lib/chartBridge";
import { fetchIntradayBars, type IntradayBar } from "@/lib/fetchIntradayBars";
import {
  downsampleSeries,
  downsampleOhlc,
  intradayToOhlc,
  intradayToLine,
  fillDailyOntoHourlyAxis,
  alignIntradayToAxis,
  snapDatesToAxisDates,
  datesToAxisTimestamps,
  type ChartFrequency,
} from "@/lib/chartFrequency";
import type { EventType } from "@/lib/dataService";
import type { PlottedSeries, ChartConfig, PaneInfo } from "@/pages/Dashboard";
import type { TickerMeta } from "@shared/schema";
import type { ActiveIndicators, ChartPaneHandle } from "./ChartPane";
import type { IChartApi } from "lightweight-charts";
import ChartPane, { gridColorFor } from "./ChartPane";
import IndicatorsPanel from "./IndicatorsPanel";
import CorrelationPickerPanel from "./CorrelationPickerPanel";
import AttributionPickerPanel from "./AttributionPickerPanel";
import QuickAnalyzePanel from "./QuickAnalyzePanel";
import SignalEngineAnalyzer from "./SignalEngineAnalyzer";
import { SeededOverlaysManager } from "./SeededOverlaysManager";
import { ChartsSimilarSetupsPanel } from "./ChartsSimilarSetupsPanel";
import ChartsPdSubplots, { type PdSubplotsState } from "./ChartsPdSubplots";
import {
  PanelLeftOpen,
  Maximize2,
  Minimize2,
  ZoomIn,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Check,
  Loader2,
  Layers,
  CalendarDays,
  Globe,
  Megaphone,
  CircleDollarSign,
  Magnet,
  Rows3,
  Save,
  Trash2,
  X,
  LayoutTemplate,
  Palette,
  FolderOpen,
  FilePlus,
  Pencil,
  ArrowLeft,
  Eye,
  Sparkles,
  StickyNote,
  Search,
  Filter,
} from "lucide-react";
import { FilterDropdown, emptyClassFilters, type ClassFilters } from "./ClassificationFilters";
import GridLayoutPicker, { gridContainerStyle, gridSlots, parseGrid } from "./GridLayoutPicker";
import type { GridLayout } from "./GridLayoutPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DateInput from "@/components/DateInput";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { CustomChartView, PairsPresetDef, RelativeValuePresetDef, SavedCustomChart } from "@/pages/Dashboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getTickers } from "@/lib/dataService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { groupMetricsByCategory, DERIVED_METRICS } from "@/lib/metricCategories";

// Legacy LayoutMode replaced by GridLayout from GridLayoutPicker

/** Chart annotation record returned by /api/annotations */
interface Annotation {
  id: string | number;
  ticker: string;
  date: string;
  text: string;
  color: string;
}

interface ChartAreaProps {
  plottedSeries: PlottedSeries[];
  panes: PaneInfo[];
  activeTicker: string | null;
  /** Display label for activeTicker (resolves BASKET:<id> to the basket name). */
  activeTickerLabel?: string | null;
  chartConfig: ChartConfig;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  tickerList: TickerMeta[];
  /** Classification-filtered subset of tickerList that feeds the carousel
   *  dropdown + prev/next navigation (full tickerList still drives the
   *  pairs/correlation pickers). */
  carouselTickerList: TickerMeta[];
  /** Active carousel classification filters (Economy → Subindustry). */
  carouselClassFilters: ClassFilters;
  onCarouselClassFiltersChange: (f: ClassFilters) => void;
  /** Unique values per classification level (full universe) for the chips. */
  carouselClassOptions: Record<string, string[]>;
  currentTickerIndex: number;
  onNavigateTicker: (dir: "next" | "prev") => void;
  onSelectTicker: (ticker: string) => void;
  activeView: string;
  presetViews: string[];
  /** Optional labeled view groups; when present, renders the preset-view
   *  menu as labeled groups, falling back to the presetViews/fundamentalViews/
   *  interviewViews trio when absent. */
  viewGroups?: { label: string; items: string[] }[];
  fundamentalViews?: string[];
  interviewViews?: string[];
  customChartViews: CustomChartView[];
  onChangeView: (view: string) => void;
  onSaveCustomView: (label: string, metrics: string[]) => void;
  onDeleteCustomView: (id: number) => void;
  isSavingView: boolean;
  currentMetrics: string[];
  isLoadingView: boolean;
  ohlcData: any;
  ohlcCache: Record<string, any>;
  /** Open the macro overlay section in the sidebar */
  onOpenMacroOverlay?: () => void;
  /** Called to add a computed series (e.g. rolling correlation) to the chart */
  onAddFormulaSeries?: (series: PlottedSeries, targetPaneId?: number) => number;
  /** Optional slot rendered at the right side of the top toolbar */
  toolbarRight?: React.ReactNode;
  /** Fires when crosshair time changes (for syncing data table) */
  onCrosshairTimeChange?: (time: string | null) => void;
  /** Pairs preset definitions */
  pairsPresets?: PairsPresetDef[];
  /** Called to load a pairs preset — returns indicators map for auto-apply */
  onLoadPairsPreset?: (preset: PairsPresetDef, tickerB: string) => Promise<Record<number, ActiveIndicators> | undefined>;
  /** Relative-value preset definitions */
  relativeValuePresets?: RelativeValuePresetDef[];
  /** Called to load a relative-value preset — returns indicators map for auto-apply */
  onLoadRelativeValuePreset?: (preset: RelativeValuePresetDef, tickerB: string) => Promise<Record<number, ActiveIndicators> | undefined>;
  // ── Server-backed custom charts (persistent blank canvases) ──
  /** Create a new blank server-backed chart and make it active */
  onNewChart?: () => void;
  /** Save the current view as a brand-new server-backed chart (name optional) */
  onSaveCurrentAsNewChart?: (name?: string) => void;
  /** Force-save the active custom chart immediately (bypasses autosave debounce) */
  onManualSaveCustomChart?: () => void;
  /** True while a custom-chart save mutation is in flight */
  isSavingCustomChart?: boolean;
  /** Timestamp (ms) of the last successful manual save, or null */
  lastManualSaveAt?: number | null;
  /** Whether autosave is enabled */
  autoSaveEnabled?: boolean;
  /** Called when autosave enabled toggle changes */
  onAutoSaveEnabledChange?: (enabled: boolean) => void;
  /** List of saved server-backed custom charts */
  savedCustomCharts?: SavedCustomChart[];
  /** The active custom chart id, or null when in carousel mode */
  activeCustomChartId?: number | null;
  /** Load a saved custom chart by id */
  onLoadCustomChart?: (id: number) => void;
  /** Rename a saved custom chart */
  onRenameCustomChart?: (id: number, name: string) => void;
  /** Delete a saved custom chart */
  onDeleteCustomChart?: (id: number) => void;
  /** Exit custom-chart mode, returning to the carousel */
  onExitCustomChart?: () => void;
  /** Current grid layout mode (persisted by parent) */
  layoutMode?: GridLayout;
  /** Called when user changes grid layout */
  onLayoutModeChange?: (mode: GridLayout) => void;
  /** Per-pane indicator state (lifted to parent for persistence) */
  indicatorsMap?: Record<number, ActiveIndicators>;
  /** Called when indicators change on any pane */
  onIndicatorsMapChange?: (map: Record<number, ActiveIndicators>) => void;
  /** Per-pane color-by-metric state (lifted to parent for persistence) */
  colorByMap?: Record<number, string>;
  /** Called when color-by settings change on any pane */
  onColorByMapChange?: (map: Record<number, string>) => void;
}

// Carousel classification filter chips (broad → narrow). Chips with only one
// unique value across the universe are auto-hidden to keep the popover tidy.
const CAROUSEL_CLASS_FIELDS = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Ind. Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
] as const;

export default function ChartArea({
  plottedSeries,
  panes,
  activeTicker,
  activeTickerLabel,
  chartConfig,
  sidebarOpen,
  onToggleSidebar,
  tickerList,
  carouselTickerList,
  carouselClassFilters,
  onCarouselClassFiltersChange,
  carouselClassOptions,
  currentTickerIndex,
  onNavigateTicker,
  onSelectTicker,
  activeView,
  presetViews,
  viewGroups,
  fundamentalViews,
  interviewViews,
  customChartViews,
  onChangeView,
  onSaveCustomView,
  onDeleteCustomView,
  isSavingView,
  currentMetrics,
  isLoadingView,
  ohlcData,
  ohlcCache,
  onOpenMacroOverlay,
  onAddFormulaSeries,
  toolbarRight,
  onCrosshairTimeChange,
  pairsPresets,
  onLoadPairsPreset,
  relativeValuePresets,
  onLoadRelativeValuePreset,
  onNewChart,
  onSaveCurrentAsNewChart,
  onManualSaveCustomChart,
  isSavingCustomChart,
  lastManualSaveAt,
  autoSaveEnabled = true,
  onAutoSaveEnabledChange,
  savedCustomCharts,
  activeCustomChartId,
  onLoadCustomChart,
  onRenameCustomChart,
  onDeleteCustomChart,
  onExitCustomChart,
  layoutMode: layoutModeProp,
  onLayoutModeChange,
  indicatorsMap: indicatorsMapProp,
  onIndicatorsMapChange,
  colorByMap: colorByMapProp,
  onColorByMapChange,
}: ChartAreaProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [maximizedPaneId, setMaximizedPaneId] = useState<number | null>(null);
  const [showViewSaveInput, setShowViewSaveInput] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  // ── Pairs preset picker state ──
  const [pairsPickerOpen, setPairsPickerOpen] = useState(false);
  const [pendingPairsPreset, setPendingPairsPreset] = useState<PairsPresetDef | null>(null);
  const [pendingRelValPreset, setPendingRelValPreset] = useState<RelativeValuePresetDef | null>(null);
  const [pairsTickerSearch, setPairsTickerSearch] = useState("");
  const [pairsTickerList, setPairsTickerList] = useState<TickerMeta[]>([]);

  // ── Custom-chart toolbar state ──
  const [saveAsNewChartOpen, setSaveAsNewChartOpen] = useState(false);
  const [saveAsNewChartName, setSaveAsNewChartName] = useState("");
  const [renameChartId, setRenameChartId] = useState<number | null>(null);
  const [renameChartName, setRenameChartName] = useState("");
  // My Charts: search + "current ticker only" filter, with charts grouped by ticker
  const [chartSearch, setChartSearch] = useState("");
  const [chartCurrentTickerOnly, setChartCurrentTickerOnly] = useState(false);

  // Each saved chart embeds its ticker inside the state JSON blob (activeTicker).
  // Derive it once so we can group/search saved charts by ticker on the client.
  const chartTickerById = useMemo(() => {
    const map = new Map<number, string | null>();
    (savedCustomCharts || []).forEach((c) => {
      let t: string | null = null;
      try {
        const s = typeof c.state === "string" ? JSON.parse(c.state) : (c.state as any);
        t = s?.activeTicker || null;
      } catch {}
      map.set(c.id, t);
    });
    return map;
  }, [savedCustomCharts]);

  // Filter by search text (name or ticker) + optional "current ticker only",
  // then group the results by ticker with the active ticker's group pinned first.
  const groupedSavedCharts = useMemo(() => {
    const q = chartSearch.trim().toLowerCase();
    const at = (activeTicker || "").toUpperCase();
    const filtered = (savedCustomCharts || []).filter((c) => {
      const t = chartTickerById.get(c.id) || "";
      if (chartCurrentTickerOnly && at && t.toUpperCase() !== at) return false;
      if (q) {
        const hay = `${c.name} ${t}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const groups = new Map<string, SavedCustomChart[]>();
    filtered.forEach((c) => {
      const key = chartTickerById.get(c.id) || "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    });
    const keys = Array.from(groups.keys()).sort((a, b) => {
      // Active ticker's group first, then alphabetical, "no ticker" last.
      const aActive = !!a && a.toUpperCase() === at;
      const bActive = !!b && b.toUpperCase() === at;
      if (aActive !== bActive) return aActive ? -1 : 1;
      if ((a === "") !== (b === "")) return a === "" ? 1 : -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ ticker: k, charts: groups.get(k)! }));
  }, [savedCustomCharts, chartTickerById, chartSearch, chartCurrentTickerOnly, activeTicker]);

  const totalFilteredCharts = useMemo(
    () => groupedSavedCharts.reduce((n, g) => n + g.charts.length, 0),
    [groupedSavedCharts],
  );

  // Fetch ticker list for pairs picker
  useEffect(() => {
    if (pairsPickerOpen && pairsTickerList.length === 0) {
      getTickers().then(setPairsTickerList).catch(() => {});
    }
  }, [pairsPickerOpen]);

  const handleSelectPairsPreset = useCallback((preset: PairsPresetDef) => {
    setPendingPairsPreset(preset);
    setPendingRelValPreset(null);
    setPairsPickerOpen(true);
    setPairsTickerSearch("");
  }, []);

  const handleSelectRelValPreset = useCallback((preset: RelativeValuePresetDef) => {
    setPendingRelValPreset(preset);
    setPendingPairsPreset(null);
    setPairsPickerOpen(true);
    setPairsTickerSearch("");
  }, []);

  const handlePairsTickerSelect = useCallback(async (tickerB: string) => {
    setPairsPickerOpen(false);
    if (pendingRelValPreset && onLoadRelativeValuePreset) {
      const newIndicators = await onLoadRelativeValuePreset(pendingRelValPreset, tickerB);
      if (newIndicators) {
        setIndicatorsMap(prev => ({ ...prev, ...newIndicators }));
      }
      setPendingRelValPreset(null);
      return;
    }
    if (!pendingPairsPreset || !onLoadPairsPreset) return;
    const newIndicators = await onLoadPairsPreset(pendingPairsPreset, tickerB);
    if (newIndicators) {
      setIndicatorsMap(prev => ({ ...prev, ...newIndicators }));
    }
    setPendingPairsPreset(null);
  }, [pendingPairsPreset, pendingRelValPreset, onLoadPairsPreset, onLoadRelativeValuePreset]);

  const handleSaveView = useCallback(() => {
    const name = newViewName.trim();
    if (!name || currentMetrics.length === 0) return;
    // Deduplicate metrics while preserving order
    const unique = [...new Set(currentMetrics)];
    onSaveCustomView(name, unique);
    setNewViewName("");
    setShowViewSaveInput(false);
  }, [newViewName, currentMetrics, onSaveCustomView]);

  const [crosshairData, setCrosshairData] = useState<{
    time: string;
    values: Record<string, number>;
  } | null>(null);

  // Aggregate crosshair values from ALL panes instead of letting each pane overwrite
  const crosshairValuesRef = useRef<Map<number, { time: string; values: Record<string, number> }>>(new Map());
  const crosshairFlushRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  const handleCrosshairMove = useCallback((paneId: number, data: { time: string; values: Record<string, number> } | null) => {
    if (data) {
      crosshairValuesRef.current.set(paneId, data);
    } else {
      crosshairValuesRef.current.delete(paneId);
    }

    // Debounce aggregation to next animation frame
    if (crosshairFlushRef.current) cancelAnimationFrame(crosshairFlushRef.current);
    crosshairFlushRef.current = requestAnimationFrame(() => {
      const entries = Array.from(crosshairValuesRef.current.values());
      if (entries.length === 0) {
        setCrosshairData(null);
        return;
      }
      // Merge all values, preferring the most recent time
      const merged: Record<string, number> = {};
      let latestTime = entries[0].time;
      for (const entry of entries) {
        if (entry.time >= latestTime) latestTime = entry.time;
        for (const [k, v] of Object.entries(entry.values)) {
          merged[k] = v;
        }
      }
      setCrosshairData({ time: latestTime, values: merged });
    });
  }, []);

  // Notify parent of crosshair time changes (for data table sync)
  useEffect(() => {
    onCrosshairTimeChange?.(crosshairData?.time ?? null);
  }, [crosshairData?.time, onCrosshairTimeChange]);

  const [timeRange, setTimeRange] = useState("5Y");
  const [showIndicators, setShowIndicators] = useState(false);
  const [showCorrelation, setShowCorrelation] = useState(false);
  const [showAttribution, setShowAttribution] = useState(false);
  // Per-pane indicator state: paneId → ActiveIndicators
  // Prefer prop from parent (persisted in workspace state), fall back to local.
  const [localIndicatorsMap, setLocalIndicatorsMap] = useState<Record<number, ActiveIndicators>>({});
  const indicatorsMap = indicatorsMapProp ?? localIndicatorsMap;
  const setIndicatorsMap = useCallback((valOrFn: Record<number, ActiveIndicators> | ((prev: Record<number, ActiveIndicators>) => Record<number, ActiveIndicators>)) => {
    if (onIndicatorsMapChange) {
      if (typeof valOrFn === "function") {
        // Need the latest value — use a ref-based approach
        setLocalIndicatorsMap(prev => {
          const next = valOrFn(indicatorsMapProp ?? prev);
          onIndicatorsMapChange(next);
          return next;
        });
      } else {
        onIndicatorsMapChange(valOrFn);
        setLocalIndicatorsMap(valOrFn);
      }
    } else {
      setLocalIndicatorsMap(valOrFn as any);
    }
  }, [onIndicatorsMapChange, indicatorsMapProp]);
  const [indicatorPaneId, setIndicatorPaneId] = useState<number | null>(null);
  // Layout mode: prefer prop from parent (persisted in workspace state),
  // fall back to local state if parent doesn't provide it.
  const [localLayoutMode, setLocalLayoutMode] = useState<GridLayout>("1x1");
  const layoutMode = layoutModeProp ?? localLayoutMode;
  const setLayoutMode = useCallback((mode: GridLayout) => {
    if (onLayoutModeChange) onLayoutModeChange(mode);
    else setLocalLayoutMode(mode);
  }, [onLayoutModeChange]);
  const [panesVisible, setPanesVisible] = useState<number | "all">("all");
  // Per-track size fractions for the pane grid (drag dividers to resize).
  // Reset to equal on layout/pane-count change or via Auto-size.
  const [rowFracs, setRowFracs] = useState<number[]>([]);
  const [colFracs, setColFracs] = useState<number[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState("none");
  const [drawColor, setDrawColor] = useState("#0ea5e9");
  // Measure tool: whether to fill the shaded rectangle (vs. line + box only)
  const [measureShade, setMeasureShade] = useState(true);
  // Measure tool: snap endpoints to nearest data point (magnet mode)
  const [measureMagnet, setMeasureMagnet] = useState(false);
  // "All panes" mode (applies to every drawing/measure tool): the active tool acts
  // on every pane at the same time/price spot at once, not just the pane you click.
  const [drawAll, setDrawAll] = useState(false);
  const drawAllRef = useRef(drawAll);
  drawAllRef.current = drawAll;
  // Fractal Anchor tool: period + timeframe applied when anchoring / editing fractal lines.
  const [fractalN, setFractalN] = useState(10);
  const [fractalTimeframe, setFractalTimeframe] = useState<"daily" | "weekly" | "monthly">("daily");

  // Changing the all-panes mode clears any current measurement (predictable reset).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("reit-viz-measure-clear"));
  }, [drawAll]);
  const [tickerPopoverOpen, setTickerPopoverOpen] = useState(false);
  const [paneOffset, setPaneOffset] = useState(0);
  const [showQuarterShading, setShowQuarterShading] = useState(false);
  const [showEarnings, setShowEarnings] = useState(false);
  // Fiscal-year boundary lines: first earnings report of each calendar year
  const [showFyBoundaries, setShowFyBoundaries] = useState(false);
  const [showExDiv, setShowExDiv] = useState(false);
  // ── Chart-feature toggles (local UI state; deeper wiring tracked in needsMore) ──
  const [showHoverReadout, setShowHoverReadout] = useState(false);
  const [showSignalAnalyzer, setShowSignalAnalyzer] = useState(false);
  const [showQuickAnalyze, setShowQuickAnalyze] = useState(false);
  const [showSimilarSetups, setShowSimilarSetups] = useState(false);
  const [showPDRatio, setShowPDRatio] = useState(false);
  const [showPremCorr, setShowPremCorr] = useState(false);
  // ── Annotations popover state (bundle yi/$i/ys/ru/nu/ni) ──
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [annDate, setAnnDate] = useState("");
  const [annText, setAnnText] = useState("");
  const [annColor, setAnnColor] = useState("#f59e0b");
  const [editingAnnId, setEditingAnnId] = useState<string | number | null>(null);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  // ── Maximized side-panel enum for the in-Charts quant panels (bundle Ie) ──
  const [maximizedSidePanel, setMaximizedSidePanel] = useState<"similar" | "pd" | null>(null);
  const [earningsDates, setEarningsDates] = useState<string[]>([]);
  const [exDivDates, setExDivDates] = useState<string[]>([]);
  // Macro event vertical line toggles
  const [activeMacroEvents, setActiveMacroEvents] = useState<Set<string>>(new Set());
  const [macroEventDates, setMacroEventDates] = useState<Record<string, string[]>>({});
  // Signals handed off via chartBridge (PriceAction "Show on chart")
  const [bridgeSignals, setBridgeSignals] = useState<{ date: string; direction?: string; label?: string }[]>([]);
  useEffect(() => {
    const load = () => {
      const payload = activeTicker ? getChartSignals(activeTicker) : null;
      setBridgeSignals(payload?.signals ?? []);
    };
    load();
    return onChartSignals((payload) => {
      if (activeTicker && payload.ticker === activeTicker.toUpperCase()) {
        setBridgeSignals(payload.signals ?? []);
      }
    });
  }, [activeTicker]);

  // ── Color-by-variable per pane ──
  // paneId → metric name
  // Prefer prop from parent (persisted in workspace state), fall back to local.
  const [localColorByMap, setLocalColorByMap] = useState<Record<number, string>>({});
  const colorByMap = colorByMapProp ?? localColorByMap;
  const setColorByMap = useCallback((valOrFn: Record<number, string> | ((prev: Record<number, string>) => Record<number, string>)) => {
    if (onColorByMapChange) {
      if (typeof valOrFn === "function") {
        setLocalColorByMap(prev => {
          const next = (valOrFn as (p: Record<number, string>) => Record<number, string>)(colorByMapProp ?? prev);
          onColorByMapChange(next);
          return next;
        });
      } else {
        onColorByMapChange(valOrFn);
        setLocalColorByMap(valOrFn);
      }
    } else {
      setLocalColorByMap(valOrFn as any);
    }
  }, [onColorByMapChange, colorByMapProp]);
  // paneId → { data: Map<time, normalisedValue>, range: {min, max} }
  const [colorByDataMap, setColorByDataMap] = useState<Record<number, { data: Map<string, number>; range: { min: number; max: number } }>>({});
  // Popover open state per pane
  const [colorByPopoverOpen, setColorByPopoverOpen] = useState<number | null>(null);

  // ── Annotations data (bundle gc/bs/hl + Ws/dl/Xu mutations) ──
  const queryClient = useQueryClient();
  const { data: allAnnotations = [] } = useQuery<Annotation[]>({
    queryKey: ["/api/annotations"],
  });
  const annotations = useMemo(
    () =>
      activeTicker
        ? allAnnotations.filter(
            (a) => a.ticker === activeTicker || a.ticker === "_global"
          )
        : [],
    [allAnnotations, activeTicker]
  );
  // hl: chart markers derived from visible annotations
  const annotationMarkers = useMemo(
    () =>
      annotationsVisible
        ? annotations.map((a) => ({
            time: a.date,
            color: a.color || "#f59e0b",
            label: a.text.length > 20 ? a.text.slice(0, 18) + "…" : a.text,
          }))
        : [],
    [annotations, annotationsVisible]
  );
  void annotationMarkers;
  const invalidateAnnotations = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["/api/annotations"] }),
    [queryClient]
  );
  const createAnnotation = useMutation({
    mutationFn: (body: { ticker: string; date: string; text: string; color: string }) =>
      apiRequest("POST", "/api/annotations", body),
    onSuccess: invalidateAnnotations,
  });
  const updateAnnotation = useMutation({
    mutationFn: ({ id, ...rest }: { id: string | number; text: string; date: string; color: string }) =>
      apiRequest("POST", `/api/annotations/${id}/update`, rest),
    onSuccess: invalidateAnnotations,
  });
  const deleteAnnotation = useMutation({
    mutationFn: (id: string | number) =>
      apiRequest("POST", `/api/annotations/${id}/delete`),
    onSuccess: invalidateAnnotations,
  });
  const saveAnnotation = useCallback(() => {
    if (!activeTicker || !annDate || !annText.trim()) return;
    if (editingAnnId !== null) {
      updateAnnotation.mutate({ id: editingAnnId, text: annText.trim(), date: annDate, color: annColor });
      setEditingAnnId(null);
    } else {
      createAnnotation.mutate({ ticker: activeTicker, date: annDate, text: annText.trim(), color: annColor });
    }
    setAnnDate("");
    setAnnText("");
    setAnnColor("#f59e0b");
  }, [activeTicker, annDate, annText, annColor, editingAnnId, createAnnotation, updateAnnotation]);
  const startEditAnnotation = useCallback((a: Annotation) => {
    setEditingAnnId(a.id);
    setAnnDate(a.date);
    setAnnText(a.text);
    setAnnColor(a.color);
    setAnnotationsOpen(true);
  }, []);

  // ── PD-subplots state (mirrors PremiumDiscount page state; consumed by ChartsPdSubplots) ──
  const [pdSubplotsState, setPdSubplotsState] = useState<PdSubplotsState>({
    showPDRatio: false,
    showCorrChart: false,
    valMetric: "P/FFO FY2",
    growthMetric: "FY1 FFO Growth",
    compareMode: "ticker",
    dimension: "",
    classValue: "",
    peerValueOverride: "",
    peerTicker: "",
    groupADim: "",
    groupAValue: "",
    groupBDim: "",
    groupBValue: "",
    basketId: "",
    basketAId: "",
    basketBId: "",
    rollWindow: 63,
    rollLag: 0,
    basketAggregation: "capWeighted",
  });
  const handlePdSubplotsStateChange = useCallback(
    (patch: Partial<PdSubplotsState>) =>
      setPdSubplotsState((prev) => ({ ...prev, ...patch })),
    []
  );

  // Chart sync state
  const chartsRef = useRef<Map<number, IChartApi>>(new Map());
  const syncingRef = useRef(false); // guard against recursive sync
  // Which pane the pointer is currently over. Only this "master" pane propagates
  // its crosshair to the others; without this, the synced (NaN-price) crosshair
  // we set on the other panes echoes its own crosshairMove back and overwrites
  // the master's NATIVE crosshair, dropping its horizontal line. (Sub-indicator
  // panes live inside their parent pane's wrapper, so hovering one still marks
  // the parent as master and cross-pane sync keeps working.)
  const hoveredPaneRef = useRef<number | null>(null);
  // Store handler references so we can unsubscribe them (LWC v5 uses separate unsub methods)
  const syncHandlersRef = useRef<Map<number, { rangeHandler: (range: any) => void; crosshairHandler: (param: any) => void }>>(new Map());
  // Debounce timer for coordinated sync after data loads
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track series references per pane for crosshair sync
  const paneSeriesRefsMap = useRef<Map<number, Map<string, any>>>(new Map());

  // Track ChartPane imperative handles for clearDrawings etc.
  const paneRefs = useRef<Map<number, ChartPaneHandle>>(new Map());

  /**
   * After any pane loads/changes data, schedule a coordinated range sync.
   * Reads the visible logical range from the first chart that has data and
   * applies it to all others. This aligns the panes by date because every
   * ChartPane carries an invisible spacer series spanning the full global date
   * axis, so all panes share one identical time scale and logical indices map
   * to the same dates across panes (otherwise differing data lengths would
   * misalign them).
   */
  const scheduleCoordinatedSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      if (syncingRef.current) return;
      const charts = chartsRef.current;
      if (charts.size < 2) return;

      // Use the first chart (lowest pane ID) as the reference
      const sortedEntries = [...charts.entries()].sort((a, b) => a[0] - b[0]);
      const [_refId, refChart] = sortedEntries[0];

      try {
        const range = refChart.timeScale().getVisibleLogicalRange();
        if (!range) return;
        syncingRef.current = true;
        for (let i = 1; i < sortedEntries.length; i++) {
          const [, otherChart] = sortedEntries[i];
          try { otherChart.timeScale().setVisibleLogicalRange(range); } catch {}
        }
      } catch {} finally {
        syncingRef.current = false;
      }
    }, 100); // 100ms debounce — enough for all panes to finish fitContent
  }, []);

  const setupSyncForChart = useCallback((paneId: number, chart: IChartApi) => {
    // Clean up old subscriptions for this pane
    const oldHandlers = syncHandlersRef.current.get(paneId);
    const oldChart = chartsRef.current.get(paneId);
    if (oldHandlers && oldChart) {
      try { oldChart.timeScale().unsubscribeVisibleLogicalRangeChange(oldHandlers.rangeHandler); } catch {}
      try { oldChart.unsubscribeCrosshairMove(oldHandlers.crosshairHandler); } catch {}
      syncHandlersRef.current.delete(paneId);
    }

    // Subscribe to visible logical range changes (scroll/zoom sync)
    const rangeHandler = (range: any) => {
      if (syncingRef.current || !range) return;
      syncingRef.current = true;
      chartsRef.current.forEach((otherChart, otherId) => {
        if (otherId !== paneId) {
          try { otherChart.timeScale().setVisibleLogicalRange(range); } catch {}
        }
      });
      syncingRef.current = false;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);

    // Subscribe to crosshair move sync
    const crosshairHandler = (param: any) => {
      if (syncingRef.current) return;
      // Only the pane under the pointer propagates. This stops the synced crosshair
      // we set on other panes from echoing back and clobbering the hovered pane's
      // native crosshair (which is what makes its horizontal line vanish).
      if (hoveredPaneRef.current !== null && hoveredPaneRef.current !== paneId) return;
      syncingRef.current = true;
      chartsRef.current.forEach((otherChart, otherId) => {
        if (otherId !== paneId) {
          try {
            if (param.time) {
              const otherSeriesMap = paneSeriesRefsMap.current.get(otherId);
              if (otherSeriesMap && otherSeriesMap.size > 0) {
                const firstSeries = otherSeriesMap.values().next().value;
                if (firstSeries) {
                  otherChart.setCrosshairPosition(NaN, param.time, firstSeries);
                }
              }
            } else {
              otherChart.clearCrosshairPosition();
            }
          } catch {}
        }
      });
      syncingRef.current = false;
    };
    chart.subscribeCrosshairMove(crosshairHandler);

    syncHandlersRef.current.set(paneId, { rangeHandler, crosshairHandler });
  }, []);

  const handleSeriesMapUpdate = useCallback((paneId: number, seriesMap: Map<string, any>) => {
    paneSeriesRefsMap.current.set(paneId, new Map(seriesMap));
    // When series data is updated on any pane, schedule a coordinated sync
    scheduleCoordinatedSync();
  }, [scheduleCoordinatedSync]);

  const handleChartReady = useCallback((paneId: number, chart: IChartApi) => {
    chartsRef.current.set(paneId, chart);
    setupSyncForChart(paneId, chart);
    // Schedule sync in case other panes are already loaded
    scheduleCoordinatedSync();
  }, [setupSyncForChart, scheduleCoordinatedSync]);

  const handleChartDestroyed = useCallback((paneId: number) => {
    // Unsubscribe handlers before chart is removed
    const handlers = syncHandlersRef.current.get(paneId);
    const chart = chartsRef.current.get(paneId);
    if (handlers && chart) {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handlers.rangeHandler); } catch {}
      try { chart.unsubscribeCrosshairMove(handlers.crosshairHandler); } catch {}
    }
    syncHandlersRef.current.delete(paneId);
    chartsRef.current.delete(paneId);
    paneSeriesRefsMap.current.delete(paneId);
  }, []);

  // Resolve from the full list so the header name/tooltip stays correct even
  // when the active ticker is excluded by the carousel classification filter.
  const currentTicker = tickerList.find((t) => t.ticker === activeTicker) ?? tickerList[currentTickerIndex];
  const anyCarouselFilterActive = useMemo(
    () => Object.values(carouselClassFilters).some((s) => s.size > 0),
    [carouselClassFilters]
  );

  // Fetch events when the active ticker changes
  useEffect(() => {
    if (!activeTicker) {
      setEarningsDates([]);
      setExDivDates([]);
      return;
    }
    let cancelled = false;
    getTickerEvents(activeTicker).then(events => {
      if (cancelled) return;
      // Dates may be YYYY-MM-DD or MM/DD/YYYY — normalize to YYYY-MM-DD
      const normalize = (arr: string[] | undefined) =>
        (arr || []).map(d => {
          if (d.includes("-")) return d; // already YYYY-MM-DD
          const [m, day, y] = d.split("/");
          return `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }).filter(d => d && d.length === 10).sort();
      setEarningsDates(normalize(events.earnings));
      setExDivDates(normalize(events.ex_dividend));
    }).catch(() => {
      if (!cancelled) {
        setEarningsDates([]);
        setExDivDates([]);
      }
    });
    return () => { cancelled = true; };
  }, [activeTicker]);

  // Fetch macro event dates once on mount
  useEffect(() => {
    getMacroEventDates().then(setMacroEventDates).catch(() => {});
  }, []);

  // Build macro event line entries from active toggles
  const macroEventLines = useMemo(() => {
    const MACRO_COLORS: Record<string, string> = {
      CPI: "#f97316",  // orange
      NFP: "#3b82f6",  // blue
      FOMC: "#a855f7", // purple
      GDP: "#10b981",  // green
    };
    const entries: { time: string; color: string; label: string }[] = [];
    for (const et of activeMacroEvents) {
      const dates = macroEventDates[et] || [];
      const color = MACRO_COLORS[et] || "#94a3b8";
      for (const d of dates) {
        entries.push({ time: d, color, label: et.charAt(0) });
      }
    }
    // Signals handed off from other pages (PriceAction "Show on chart")
    for (const s of bridgeSignals) {
      if (!s?.date) continue;
      entries.push({
        time: s.date.slice(0, 10),
        color: s.direction === "down" ? "#ef4444" : "#22c55e",
        label: s.direction === "down" ? "▼" : "▲",
      });
    }
    return entries;
  }, [activeMacroEvents, macroEventDates, bridgeSignals]);

  // Fiscal-year boundary lines: the first (earliest) earnings report of each
  // calendar year — marks when the fiscal year switches (FY1 → FY0). Labeled
  // "FY{year}" with the report's own calendar year. earningsDates is sorted
  // ascending, so the first date seen per year is the earliest.
  const fyBoundaryLines = useMemo(() => {
    const seen = new Set<string>();
    const out: { time: string; color: string; label: string }[] = [];
    for (const d of earningsDates) {
      const year = d.slice(0, 4);
      if (!seen.has(year)) {
        seen.add(year);
        out.push({ time: d, color: "#22d3ee", label: `FY${year}` });
      }
    }
    return out;
  }, [earningsDates]);

  // ── Color-by: fetch metric data when colorByMap changes ──
  useEffect(() => {
    const entries = Object.entries(colorByMap);
    if (entries.length === 0) return;
    let cancelled = false;

    (async () => {
      const newDataMap: Record<number, { data: Map<string, number>; range: { min: number; max: number } }> = {};
      for (const [paneIdStr, metric] of entries) {
        const paneId = Number(paneIdStr);
        // Determine ticker for this pane
        const pane = panes.find(p => p.id === paneId);
        const paneSeries = plottedSeries.filter(s => s.paneIndex === paneId && s.visible);
        const ticker = pane?.ticker || paneSeries.find(s => s.metric === "close")?.ticker || activeTicker;
        if (!ticker || !metric) continue;

        try {
          const seriesData = await getMetricSeries(ticker, metric);
          if (cancelled) return;
          if (seriesData.length === 0) continue;

          // Derive the color scale (min/max) from data AFTER the first ~1 year.
          // Early history is often noisy/wonky (thin coverage, outliers) and, when
          // included, blows out the min/max and washes the gradient flat. We still
          // COLOR the first year — those points just clamp to the scale extremes
          // (gradientColorHex clamps to [0,1]) — but they don't define the scale.
          const firstDate = seriesData[0].time; // YYYY-MM-DD, chronological
          const [fy, fm, fd] = firstDate.split("-").map(Number);
          const cutoff = Number.isFinite(fy)
            ? `${String(fy + 1).padStart(4, "0")}-${String(fm).padStart(2, "0")}-${String(fd).padStart(2, "0")}`
            : firstDate;
          const scaleData = seriesData.filter(d => d.time >= cutoff);
          // Fall back to the full series if excluding the first year leaves too
          // little to build a stable scale from.
          const basis = scaleData.length >= 2 ? scaleData : seriesData;

          // Compute min/max over the scale basis (post-first-year).
          let min = Infinity, max = -Infinity;
          for (const d of basis) {
            if (d.value < min) min = d.value;
            if (d.value > max) max = d.value;
          }
          const range = max - min;
          const dataMap = new Map<string, number>();
          for (const d of seriesData) {
            dataMap.set(d.time, range === 0 ? 0.5 : (d.value - min) / range);
          }
          newDataMap[paneId] = { data: dataMap, range: { min, max } };
        } catch {
          // ignore fetch errors
        }
      }
      if (!cancelled) {
        setColorByDataMap(prev => ({ ...prev, ...newDataMap }));
      }
    })();

    return () => { cancelled = true; };
  }, [colorByMap, activeTicker, panes, plottedSeries]);

  // Clean up colorByDataMap when colorByMap entries are removed
  useEffect(() => {
    setColorByDataMap(prev => {
      const next: typeof prev = {};
      for (const key of Object.keys(prev)) {
        if (colorByMap[Number(key)]) next[Number(key)] = prev[Number(key)];
      }
      return next;
    });
  }, [colorByMap]);

  // Build the metric list for the color-by picker: union of currently-plotted
  // metrics, every metric the loaded universe exposes, and the client-derived
  // ones — grouped by the shared categorizer so new metrics appear automatically.
  const colorByMetricGroups = useMemo(() => {
    const uniqueMetrics = new Set<string>(DERIVED_METRICS);
    for (const s of plottedSeries) uniqueMetrics.add(s.metric);
    for (const t of tickerList) for (const m of t.metrics || []) uniqueMetrics.add(m);
    return groupMetricsByCategory([...uniqueMetrics]);
  }, [plottedSeries, tickerList]);

  // Reset pane offset when panes change or visibility changes
  useEffect(() => {
    setPaneOffset(0);
  }, [panes.length, panesVisible]);

  // Determine which panes to show (with pagination or single-pane maximize)
  const visiblePanes = useMemo(() => {
    if (maximizedPaneId !== null) {
      const found = panes.find(p => p.id === maximizedPaneId);
      return found ? [found] : panes;
    }
    if (panesVisible === "all") return panes;
    const count = typeof panesVisible === "number" ? panesVisible : panes.length;
    const start = Math.min(paneOffset, Math.max(0, panes.length - count));
    return panes.slice(start, start + count);
  }, [panes, panesVisible, paneOffset, maximizedPaneId]);

  // Clear maximized pane if it was removed
  useEffect(() => {
    if (maximizedPaneId !== null && !panes.find(p => p.id === maximizedPaneId)) {
      setMaximizedPaneId(null);
    }
  }, [panes, maximizedPaneId]);

  const canPagePrev = panesVisible !== "all" && paneOffset > 0;
  const canPageNext = panesVisible !== "all" && typeof panesVisible === "number" && paneOffset + panesVisible < panes.length;

  // Group series by pane
  const seriesByPane = useMemo(() => {
    const map: Record<number, PlottedSeries[]> = {};
    for (const p of panes) {
      map[p.id] = [];
    }
    for (const s of plottedSeries) {
      if (map[s.paneIndex] !== undefined) {
        map[s.paneIndex].push(s);
      } else if (panes.length > 0) {
        // Fallback to first pane
        map[panes[0].id]?.push(s);
      }
    }
    return map;
  }, [plottedSeries, panes]);

  // ── Price-bar frequency (chartConfig.frequency): hourly / daily / weekly / monthly ──
  const frequency: ChartFrequency = (chartConfig.frequency as ChartFrequency) ?? "daily";
  const [intradayCache, setIntradayCache] = useState<Record<string, IntradayBar[]>>({});
  useEffect(() => {
    if (frequency !== "hourly") return;
    let alive = true;
    const wanted = new Set<string>();
    if (activeTicker) wanted.add(activeTicker);
    for (const p of panes) {
      const pt = p.ticker || (seriesByPane[p.id] || []).find((s) => s.metric === "close")?.ticker;
      if (pt && !pt.startsWith("BASKET:") && !pt.startsWith("__")) wanted.add(pt);
    }
    for (const t of wanted) {
      if (intradayCache[t]) continue;
      fetchIntradayBars(t).then((bars) => {
        if (!alive || !bars.length) return;
        setIntradayCache((prev) => (prev[t] ? prev : { ...prev, [t]: bars }));
      });
    }
    return () => { alive = false; };
  }, [frequency, activeTicker, panes, seriesByPane, intradayCache]);

  // Per-frequency view of series/OHLC/vertical-line props. null = plain daily.
  // Pane sync is logical-range based, so all panes must share bar density:
  // weekly/monthly downsample everything; hourly puts every pane on the active
  // ticker's hourly timestamp axis (daily series forward-filled per day).
  const freqView = useMemo(() => {
    if (frequency === "daily") return null;

    if (frequency === "weekly" || frequency === "monthly") {
      const sbp: Record<number, PlottedSeries[]> = {};
      for (const [pid, list] of Object.entries(seriesByPane)) {
        sbp[Number(pid)] = (list as PlottedSeries[]).map((s) => ({
          ...s,
          data: downsampleSeries(s.data as any, frequency) as any,
        }));
      }
      const baseOhlc: any[] = (activeTicker ? ohlcCache[activeTicker] : ohlcData) || [];
      const axisDates = downsampleOhlc(baseOhlc, frequency).map((b: any) => b.time);
      return {
        intraday: false as const,
        spacerTimes: axisDates as (string | number)[],
        seriesByPane: sbp,
        ohlcFor: (ohlc: any[], _paneTicker?: string) => downsampleOhlc(ohlc || [], frequency),
        earnings: (dates: string[]) => snapDatesToAxisDates(dates, axisDates),
        lineEntries: (entries: { time: string; color: string; label: string }[]) => {
          const out: { time: any; color: string; label: string }[] = [];
          for (const e of entries) {
            const snapped = snapDatesToAxisDates([e.time], axisDates);
            if (snapped.length) out.push({ ...e, time: snapped[0] });
          }
          return out;
        },
      };
    }

    // hourly
    const axis = activeTicker ? intradayCache[activeTicker] : undefined;
    if (!axis?.length) return null; // bars still loading (or unavailable) → stay daily
    const sbp: Record<number, PlottedSeries[]> = {};
    for (const [pid, list] of Object.entries(seriesByPane)) {
      sbp[Number(pid)] = (list as PlottedSeries[]).map((s) => {
        if (s.metric === "close") {
          const own = intradayCache[s.ticker];
          const data =
            s.ticker === activeTicker
              ? intradayToLine(axis)
              : own?.length
              ? alignIntradayToAxis(own, axis)
              : fillDailyOntoHourlyAxis(s.data as any, axis);
          return { ...s, data: data as any };
        }
        return { ...s, data: fillDailyOntoHourlyAxis(s.data as any, axis) as any };
      });
    }
    return {
      intraday: true as const,
      spacerTimes: axis.map((b) => b.time) as (string | number)[],
      seriesByPane: sbp,
      ohlcFor: (_ohlc: any[], paneTicker?: string) =>
        paneTicker === activeTicker ? intradayToOhlc(axis) : [],
      earnings: (dates: string[]) => datesToAxisTimestamps(dates, axis) as any,
      lineEntries: (entries: { time: string; color: string; label: string }[]) => {
        const out: { time: any; color: string; label: string }[] = [];
        for (const e of entries) {
          const ts = datesToAxisTimestamps([e.time], axis);
          if (ts.length) out.push({ ...e, time: ts[0] });
        }
        return out;
      },
    };
  }, [frequency, seriesByPane, ohlcCache, ohlcData, activeTicker, intradayCache]);

  // After a frequency/axis switch, force a coordinated fit across all panes —
  // the logical-range sync can otherwise echo a stale range (saved from the
  // previous axis) over the per-pane refits, leaving the viewport in dead space.
  const freqAxisKey = `${frequency}|${freqView?.spacerTimes?.length ?? 0}`;
  useEffect(() => {
    const t = setTimeout(() => {
      syncingRef.current = true;
      for (const chart of chartsRef.current.values()) {
        try { chart.timeScale().fitContent(); } catch {}
      }
      syncingRef.current = false;
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freqAxisKey]);



  // Grid dimensions (mirrors gridContainerStyle): cols from layout, rows to fit.
  const gridDims = useMemo(() => {
    const { cols } = parseGrid(layoutMode);
    const actualRows = Math.max(1, Math.ceil(visiblePanes.length / cols));
    return { cols, rows: actualRows };
  }, [layoutMode, visiblePanes.length]);

  // Reset the drag-resize fractions to equal whenever the grid dimensions change.
  useEffect(() => {
    setColFracs(Array(gridDims.cols).fill(1));
    setRowFracs(Array(gridDims.rows).fill(1));
  }, [gridDims.cols, gridDims.rows]);

  const resetPaneSizes = useCallback(() => {
    setColFracs(Array(gridDims.cols).fill(1));
    setRowFracs(Array(gridDims.rows).fill(1));
  }, [gridDims.cols, gridDims.rows]);

  // Layout grid style (inline) — drives track sizes from the resize fractions.
  const computedGridStyle = useMemo((): React.CSSProperties => {
    if (maximizedPaneId !== null) {
      return { display: "grid", gridTemplateColumns: "1fr", gridTemplateRows: "1fr", height: "100%" };
    }
    const cols = colFracs.length === gridDims.cols ? colFracs : Array(gridDims.cols).fill(1);
    const rows = rowFracs.length === gridDims.rows ? rowFracs : Array(gridDims.rows).fill(1);
    return {
      display: "grid",
      gridTemplateColumns: cols.map((f) => `${f}fr`).join(" "),
      gridTemplateRows: rows.map((f) => `${f}fr`).join(" "),
      height: "100%",
    };
  }, [colFracs, rowFracs, gridDims.cols, gridDims.rows, maximizedPaneId]);

  // Drag a grid divider to resize adjacent rows/columns (fraction-based).
  const startDividerDrag = useCallback((
    e: React.MouseEvent,
    axis: "row" | "col",
    index: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const el = gridRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const isRow = axis === "row";
    const startPos = isRow ? e.clientY : e.clientX;
    const total = isRow ? rect.height : rect.width;
    const fracs = isRow ? rowFracs : colFracs;
    const setFracs = isRow ? setRowFracs : setColFracs;
    const a0 = fracs[index] ?? 1;
    const b0 = fracs[index + 1] ?? 1;
    const sumFr = fracs.reduce((s, f) => s + f, 0);
    const MIN = 0.12 * sumFr; // don't let a track collapse below ~12%

    const onMove = (ev: MouseEvent) => {
      const cur = isRow ? ev.clientY : ev.clientX;
      const deltaFr = ((cur - startPos) / total) * sumFr;
      let a = a0 + deltaFr;
      let b = b0 - deltaFr;
      if (a < MIN) { b -= MIN - a; a = MIN; }
      if (b < MIN) { a -= MIN - b; b = MIN; }
      setFracs((prev) => {
        const next = [...prev];
        next[index] = a;
        next[index + 1] = b;
        return next;
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      // Nudge charts to re-fit their new box.
      paneRefs.current.forEach((r) => r?.fitContent?.());
    };
    document.body.style.cursor = isRow ? "row-resize" : "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [rowFracs, colFracs]);

  // Drawing tools
  const drawTools = [
    { id: "hline", label: "H-Line" },
    { id: "trendline", label: "Trendline" },
    { id: "measure", label: "Measure" },
    { id: "freehand", label: "Freehand" },
    { id: "eraser", label: "Eraser" },
    { id: "fractal-anchor", label: "Fractal Anchor" },
  ];

  // Click a candle (with the Fractal Anchor tool active) to set the as-of date for
  // that pane's fractal lines. Auto-enables the indicator if it isn't on yet, using
  // the period + timeframe currently selected in the toolbar.
  const handleFractalAnchorPick = useCallback((paneId: number, date: string) => {
    // "All panes" mode: anchor every pane's fractals at the same as-of date.
    const ids = drawAllRef.current ? Array.from(paneRefs.current.keys()) : [paneId];
    setIndicatorsMap((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const cur = next[id] || {};
        const fl = cur.fractalLines ?? { n: fractalN, timeframe: fractalTimeframe };
        next[id] = { ...cur, fractalLines: { ...fl, anchorDate: date } };
      }
      return next;
    });
    setActiveTool("none");
  }, [setIndicatorsMap, fractalN, fractalTimeframe]);

  // Right-click-delete a fractal line: fractals are a paired indicator overlay, so
  // "deleting" turns the indicator off for that pane (drops both R and S lines).
  // This pane only — the right-click menu's "Delete on all panes" handles the rest.
  const handleDeleteFractal = useCallback((paneId: number) => {
    setIndicatorsMap((prev) => {
      const cur = prev[paneId];
      if (!cur?.fractalLines) return prev;
      const { fractalLines, ...rest } = cur;
      return { ...prev, [paneId]: rest };
    });
  }, [setIndicatorsMap]);

  // Right-click "delete on all panes" for fractals: always drop them everywhere,
  // regardless of the current single/all-panes toggle.
  const handleDeleteFractalAll = useCallback(() => {
    setIndicatorsMap((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of Array.from(paneRefs.current.keys())) {
        const cur = next[id];
        if (cur?.fractalLines) {
          const { fractalLines, ...rest } = cur;
          next[id] = rest;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [setIndicatorsMap]);

  // Toolbar period/timeframe: remember as the anchoring defaults AND live-apply to
  // every pane that already has fractal lines on, so the change is visible at once.
  // Build the next map from the current one (a plain object, not a function updater,
  // so setIndicatorsMap doesn't propagate to the parent inside a render-phase updater).
  const applyFractalParams = useCallback((patch: { n?: number; timeframe?: "daily" | "weekly" | "monthly" }) => {
    if (patch.n !== undefined) setFractalN(patch.n);
    if (patch.timeframe !== undefined) setFractalTimeframe(patch.timeframe);
    const next = { ...indicatorsMap };
    for (const [pid, ind] of Object.entries(indicatorsMap)) {
      if (ind?.fractalLines) {
        next[Number(pid)] = { ...ind, fractalLines: { ...ind.fractalLines, ...patch } };
      }
    }
    setIndicatorsMap(next);
  }, [indicatorsMap, setIndicatorsMap]);

  // Track drawing count across all panes so we can show "Clear All"
  const [drawingCount, setDrawingCount] = useState(0);
  const bumpDrawingCount = useCallback(() => setDrawingCount(c => c + 1), []);
  const decrementDrawingCount = useCallback(() => setDrawingCount(c => Math.max(0, c - 1)), []);

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${isMaximized ? "fixed inset-0 z-50 bg-background" : ""}`}>
      {/* Top Nav Bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border bg-card flex-shrink-0 flex-wrap">
        {!sidebarOpen && (
          <Button variant="ghost" size="sm" onClick={onToggleSidebar} className="h-7 w-7 p-0" data-testid="open-sidebar">
            <PanelLeftOpen className="w-4 h-4" />
          </Button>
        )}
        {/* Carousel nav: arrows + searchable dropdown */}
        <div className="flex items-center gap-0" data-testid="single-ticker-cluster">
        <Button
          variant="ghost" size="sm" className="h-7 w-7 p-0"
          onClick={() => onNavigateTicker("prev")}
          disabled={carouselTickerList.length === 0}
          data-testid="prev-ticker"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <Popover open={tickerPopoverOpen} onOpenChange={setTickerPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1.5 min-w-0 max-w-[340px]"
              data-testid="ticker-dropdown"
              title={currentTicker?.name}
            >
              {isLoadingView && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0" />}
              <span className="font-mono font-bold text-sm text-primary" data-testid="current-ticker">
                {activeTickerLabel || activeTicker || "—"}
              </span>
              {currentTicker && (
                <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                  {currentTicker.name}
                </span>
              )}
              {carouselTickerList.length > 0 && (
                <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">
                  {currentTickerIndex >= 0 ? `${currentTickerIndex + 1}/${carouselTickerList.length}` : `${carouselTickerList.length}`}
                </span>
              )}
              {anyCarouselFilterActive && (
                <Filter className="w-3 h-3 text-primary flex-shrink-0" data-testid="carousel-filter-active" />
              )}
              <ChevronsUpDown className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto min-w-[280px] max-w-[520px] p-0" align="start">
            {/* Classification filters — narrow the carousel to selected sectors/industries */}
            {(() => {
              const shownFields = CAROUSEL_CLASS_FIELDS.filter(
                (f) => (carouselClassOptions[f.key]?.length ?? 0) > 1
              );
              if (shownFields.length === 0) return null;
              return (
                <div className="flex flex-wrap items-center gap-1 p-1.5 border-b border-border">
                  {shownFields.map((f) => (
                    <FilterDropdown
                      key={f.key}
                      label={f.label}
                      options={carouselClassOptions[f.key] || []}
                      selected={carouselClassFilters[f.key] || new Set()}
                      onChange={(next) =>
                        onCarouselClassFiltersChange({ ...carouselClassFilters, [f.key]: next })
                      }
                      testId={`carousel-filter-${f.key}`}
                    />
                  ))}
                  {anyCarouselFilterActive && (
                    <button
                      onClick={() => onCarouselClassFiltersChange(emptyClassFilters())}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-muted-foreground hover:text-destructive"
                      data-testid="carousel-filter-clear"
                    >
                      <X className="w-2.5 h-2.5" />
                      Clear
                    </button>
                  )}
                </div>
              );
            })()}
            <Command>
              <CommandInput placeholder="Search ticker or name..." className="h-8 text-xs" />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>No ticker found.</CommandEmpty>
                <CommandGroup>
                  {carouselTickerList.map((t) => (
                    <CommandItem
                      key={t.ticker}
                      value={`${t.ticker} ${t.name} ${t.subindustry}`}
                      onSelect={() => {
                        onSelectTicker(t.ticker);
                        setTickerPopoverOpen(false);
                      }}
                      className="text-xs"
                    >
                      <Check
                        className={`w-3 h-3 mr-1.5 flex-shrink-0 ${
                          activeTicker === t.ticker ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <span className="font-mono font-semibold mr-2">{t.ticker}</span>
                      <span className="text-muted-foreground whitespace-nowrap">{t.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost" size="sm" className="h-7 w-7 p-0"
          onClick={() => onNavigateTicker("next")}
          disabled={carouselTickerList.length === 0}
          data-testid="next-ticker"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        </div>

        <div className="mx-1 w-px h-4 bg-border" />

        {/* View selector dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 px-2 max-w-[240px]" data-testid="view-selector">
              <LayoutTemplate className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{activeView}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto min-w-[18rem] max-w-[34rem] max-h-[420px] overflow-y-auto">
            {viewGroups && viewGroups.length > 0 ? (
              viewGroups.map((group, gi) => (
                <div key={`group-${group.label}`}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-[10px]">{group.label}</DropdownMenuLabel>
                  {gi === 0 && <DropdownMenuSeparator />}
                  {group.items.map((v) => (
                    <DropdownMenuItem
                      key={`g-${group.label}-${v}`}
                      className={`text-[11px] cursor-pointer ${v === activeView ? "bg-accent" : ""}`}
                      onClick={() => onChangeView(v)}
                      data-testid={`view-${v.replace(/[\s|/]+/g, "-").toLowerCase()}`}
                    >
                      {v === activeView && <Check className="w-3 h-3 mr-1 flex-shrink-0" />}
                      <span className="whitespace-nowrap" title={v}>{v}</span>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))
            ) : (
              <>
                <DropdownMenuLabel className="text-[10px]">Preset Views</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {presetViews.map((v) => (
                  <DropdownMenuItem
                    key={v}
                    className={`text-[11px] cursor-pointer ${v === activeView ? "bg-accent" : ""}`}
                    onClick={() => onChangeView(v)}
                    data-testid={`view-${v.replace(/[\s|/]+/g, "-").toLowerCase()}`}
                  >
                    {v === activeView && <Check className="w-3 h-3 mr-1 flex-shrink-0" />}
                    <span className="whitespace-nowrap">{v}</span>
                  </DropdownMenuItem>
                ))}
                {fundamentalViews && fundamentalViews.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px]">Fundamentals</DropdownMenuLabel>
                    {fundamentalViews.map((v) => (
                      <DropdownMenuItem
                        key={`fund-${v}`}
                        className={`text-[11px] cursor-pointer ${v === activeView ? "bg-accent" : ""}`}
                        onClick={() => onChangeView(v)}
                        data-testid={`view-fund-${v.replace(/[\s|/]+/g, "-").toLowerCase()}`}
                      >
                        {v === activeView && <Check className="w-3 h-3 mr-1 flex-shrink-0" />}
                        <span className="whitespace-nowrap">{v}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {interviewViews && interviewViews.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px]">Interview Prep</DropdownMenuLabel>
                    {interviewViews.map((v) => (
                      <DropdownMenuItem
                        key={`intv-${v}`}
                        className={`text-[11px] cursor-pointer ${v === activeView ? "bg-accent" : ""}`}
                        onClick={() => onChangeView(v)}
                        data-testid={`view-intv-${v.replace(/[\s|/]+/g, "-").toLowerCase()}`}
                      >
                        {v === activeView && <Check className="w-3 h-3 mr-1 flex-shrink-0" />}
                        <span className="whitespace-nowrap">{v}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </>
            )}
            {customChartViews.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px]">Custom Views</DropdownMenuLabel>
                {customChartViews.map((cv) => (
                  <DropdownMenuItem
                    key={`custom-${cv.id}`}
                    className={`text-[11px] cursor-pointer flex items-center justify-between group/item ${cv.label === activeView ? "bg-accent" : ""}`}
                    onClick={() => onChangeView(cv.label)}
                    data-testid={`custom-view-${cv.id}`}
                  >
                    <span className="flex items-center gap-1">
                      {cv.label === activeView && <Check className="w-3 h-3 flex-shrink-0" />}
                      <span className="whitespace-nowrap">{cv.label}</span>
                    </span>
                    <button
                      className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-opacity flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCustomView(cv.id);
                      }}
                      data-testid={`delete-view-${cv.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            {pairsPresets && pairsPresets.length > 0 && onLoadPairsPreset && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px]">Pairs Presets</DropdownMenuLabel>
                {pairsPresets.map((p) => (
                  <DropdownMenuItem
                    key={`pairs-${p.label}`}
                    className={`text-[11px] cursor-pointer ${p.label === activeView ? "bg-accent" : ""}`}
                    onClick={() => handleSelectPairsPreset(p)}
                    data-testid={`pairs-preset-${p.label.replace(/[\s|/]+/g, "-").toLowerCase()}`}
                  >
                    {p.label === activeView && <Check className="w-3 h-3 mr-1 flex-shrink-0" />}
                    <span className="whitespace-nowrap">{p.label}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            {relativeValuePresets && relativeValuePresets.length > 0 && onLoadRelativeValuePreset && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px]">Relative Value</DropdownMenuLabel>
                {relativeValuePresets.map((p) => (
                  <DropdownMenuItem
                    key={`relval-${p.label}`}
                    className={`text-[11px] cursor-pointer ${p.label === activeView ? "bg-accent" : ""}`}
                    onClick={() => handleSelectRelValPreset(p)}
                    data-testid={`relval-preset-${p.label.replace(/[\s|/]+/g, "-").toLowerCase()}`}
                  >
                    {p.label === activeView && <Check className="w-3 h-3 mr-1 flex-shrink-0" />}
                    <span className="whitespace-nowrap" title={p.label}>{p.label}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            {showViewSaveInput ? (
              <div className="px-2 py-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Input
                  autoFocus
                  placeholder="View name..."
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveView();
                    if (e.key === "Escape") { setShowViewSaveInput(false); setNewViewName(""); }
                  }}
                  className="h-6 text-[11px] flex-1 bg-background"
                  data-testid="view-name-input"
                />
                <Button
                  variant="default"
                  size="sm"
                  className="h-6 w-6 p-0"
                  disabled={!newViewName.trim() || isSavingView}
                  onClick={(e) => { e.stopPropagation(); handleSaveView(); }}
                  data-testid="save-view-confirm"
                >
                  <Save className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => { e.stopPropagation(); setShowViewSaveInput(false); setNewViewName(""); }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <DropdownMenuItem
                className="text-[11px] cursor-pointer gap-1.5 text-primary"
                onClick={(e) => {
                  e.preventDefault();
                  setShowViewSaveInput(true);
                }}
                data-testid="save-current-view"
              >
                <Save className="w-3 h-3" />
                Save Current as View
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Custom charts (server-backed persistent canvases) */}
        {onNewChart && (
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={activeCustomChartId ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-[11px] gap-1 px-2"
                  data-testid="saved-charts-btn"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {activeCustomChartId
                      ? savedCustomCharts?.find((c) => c.id === activeCustomChartId)?.name || "Custom Chart"
                      : "My Charts"}
                  </span>
                  <ChevronsUpDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-auto min-w-[320px] max-w-[34rem]">
                {activeCustomChartId && (
                  <div className="px-2 py-1.5 text-[10px] text-muted-foreground border-b border-border/40 mb-1 space-y-1">
                    <div>
                      {isSavingCustomChart ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                        </span>
                      ) : lastManualSaveAt ? (
                        <span>
                          Last manual save:{" "}
                          {new Date(lastManualSaveAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      ) : (
                        <span>Not yet manually saved</span>
                      )}
                    </div>
                    {onAutoSaveEnabledChange && (
                      <label
                        className="flex items-center gap-2 cursor-pointer select-none py-0.5"
                        onClick={(e) => e.stopPropagation()}
                        data-testid="autosave-toggle"
                      >
                        <input
                          type="checkbox"
                          className="h-3 w-3 accent-primary cursor-pointer"
                          checked={autoSaveEnabled}
                          onChange={(e) => onAutoSaveEnabledChange(e.target.checked)}
                        />
                        <span>
                          Autosave {autoSaveEnabled ? "on" : "off"}
                          <span className="text-muted-foreground/70">
                            {" · "}
                            {autoSaveEnabled ? "writes 2s after edits" : "manual save only"}
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                )}
                {activeCustomChartId && onExitCustomChart && (
                  <>
                    <DropdownMenuItem onClick={onExitCustomChart} data-testid="back-to-carousel">
                      <ArrowLeft className="w-3.5 h-3.5 mr-2" />
                      Back to Carousel
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={onNewChart} data-testid="new-chart-dropdown">
                  <FilePlus className="w-3.5 h-3.5 mr-2" />
                  New Blank Chart
                </DropdownMenuItem>
                {onSaveCurrentAsNewChart && (
                  <DropdownMenuItem
                    onClick={() => {
                      setSaveAsNewChartName(`Chart ${(savedCustomCharts?.length ?? 0) + 1}`);
                      setSaveAsNewChartOpen(true);
                    }}
                    data-testid="save-current-as-new-chart"
                  >
                    <Save className="w-3.5 h-3.5 mr-2" />
                    Save Current View as New Chart
                  </DropdownMenuItem>
                )}
                {savedCustomCharts && savedCustomCharts.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground flex items-center justify-between">
                      <span>Saved Charts</span>
                      <span className="font-normal text-muted-foreground/70">
                        {totalFilteredCharts}
                        {totalFilteredCharts !== savedCustomCharts.length && ` / ${savedCustomCharts.length}`}
                      </span>
                    </DropdownMenuLabel>

                    {/* Search + current-ticker filter (not menu items, so keys don't
                        trigger the dropdown's built-in typeahead) */}
                    <div className="px-2 pb-1.5 space-y-1.5" onKeyDown={(e) => e.stopPropagation()}>
                      <div className="relative">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                          value={chartSearch}
                          onChange={(e) => setChartSearch(e.target.value)}
                          placeholder="Search by name or ticker…"
                          className="h-7 text-[11px] pl-7 pr-6"
                          data-testid="saved-charts-search"
                        />
                        {chartSearch && (
                          <button
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
                            title="Clear search"
                            onClick={() => setChartSearch("")}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {activeTicker && (
                        <label
                          className="flex items-center gap-2 cursor-pointer select-none text-[10px] text-muted-foreground py-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3 accent-primary cursor-pointer"
                            checked={chartCurrentTickerOnly}
                            onChange={(e) => setChartCurrentTickerOnly(e.target.checked)}
                            data-testid="saved-charts-current-ticker-only"
                          />
                          <span>
                            {activeTicker} only
                            <span className="text-muted-foreground/70"> · charts saved on this ticker</span>
                          </span>
                        </label>
                      )}
                    </div>

                    {totalFilteredCharts === 0 ? (
                      <div className="px-2 py-2 text-[10px] text-muted-foreground italic">
                        No charts match.
                      </div>
                    ) : (
                      groupedSavedCharts.map((grp) => (
                        <div key={grp.ticker || "__none__"}>
                          <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/80 flex items-center gap-1.5">
                            <span className="truncate">{grp.ticker || "No ticker"}</span>
                            {!!grp.ticker && activeTicker && grp.ticker.toUpperCase() === activeTicker.toUpperCase() && (
                              <span className="text-[8px] font-normal normal-case text-primary/80">current</span>
                            )}
                          </div>
                          {grp.charts.map((c) => (
                            <DropdownMenuItem
                              key={c.id}
                              className={`flex items-center justify-between group ${activeCustomChartId === c.id ? "bg-accent" : ""}`}
                              onClick={(e) => {
                                if (!(e.target as HTMLElement).closest("[data-action]")) {
                                  onLoadCustomChart?.(c.id);
                                }
                              }}
                              data-testid={`saved-chart-${c.id}`}
                            >
                              <span className="flex items-center gap-2 flex-1 min-w-0">
                                {activeCustomChartId === c.id && <Check className="w-3 h-3 shrink-0" />}
                                <span className="whitespace-nowrap" title={c.name}>{c.name}</span>
                              </span>
                              <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                                <button
                                  data-action="rename"
                                  className="p-0.5 rounded hover:bg-muted"
                                  title="Rename"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenameChartId(c.id);
                                    setRenameChartName(c.name);
                                  }}
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  data-action="delete"
                                  className="p-0.5 rounded hover:bg-destructive/20 text-destructive"
                                  title="Delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteCustomChart?.(c.id);
                                  }}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      ))
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {activeCustomChartId && onManualSaveCustomChart && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1 px-2"
                onClick={() => onManualSaveCustomChart()}
                disabled={isSavingCustomChart}
                data-testid="manual-save-chart-btn"
                title="Force-save now (bypasses 2s autosave debounce)"
              >
                {isSavingCustomChart ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">Save</span>
              </Button>
            )}

            {/* Save current view as new chart dialog */}
            <Dialog open={saveAsNewChartOpen} onOpenChange={(o) => { if (!o) setSaveAsNewChartOpen(false); }}>
              <DialogContent className="sm:max-w-[380px]">
                <DialogHeader>
                  <DialogTitle className="text-sm">Save Current View as New Chart</DialogTitle>
                </DialogHeader>
                <div className="text-[11px] text-muted-foreground">
                  Captures the current panes, series, indicators, and active ticker. The new chart becomes active and autosaves your subsequent edits.
                </div>
                <div className="flex gap-2">
                  <Input
                    value={saveAsNewChartName}
                    onChange={(e) => setSaveAsNewChartName(e.target.value)}
                    placeholder="Chart name"
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && saveAsNewChartName.trim()) {
                        onSaveCurrentAsNewChart?.(saveAsNewChartName.trim());
                        setSaveAsNewChartOpen(false);
                      }
                    }}
                    data-testid="save-as-new-chart-input"
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!saveAsNewChartName.trim()}
                    onClick={() => {
                      onSaveCurrentAsNewChart?.(saveAsNewChartName.trim());
                      setSaveAsNewChartOpen(false);
                    }}
                    data-testid="save-as-new-chart-confirm"
                  >
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Rename chart dialog */}
            <Dialog open={renameChartId !== null} onOpenChange={(o) => { if (!o) setRenameChartId(null); }}>
              <DialogContent className="sm:max-w-[340px]">
                <DialogHeader>
                  <DialogTitle className="text-sm">Rename Chart</DialogTitle>
                </DialogHeader>
                <div className="flex gap-2">
                  <Input
                    value={renameChartName}
                    onChange={(e) => setRenameChartName(e.target.value)}
                    placeholder="Chart name"
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && renameChartName.trim() && renameChartId !== null) {
                        onRenameCustomChart?.(renameChartId, renameChartName.trim());
                        setRenameChartId(null);
                      }
                    }}
                    data-testid="rename-chart-input"
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!renameChartName.trim()}
                    onClick={() => {
                      if (renameChartName.trim() && renameChartId !== null) {
                        onRenameCustomChart?.(renameChartId, renameChartName.trim());
                        setRenameChartId(null);
                      }
                    }}
                    data-testid="rename-chart-confirm"
                  >
                    Rename
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        <div className="mx-1 w-px h-4 bg-border" />

        {/* Time ranges */}
        <div className="flex gap-0.5">
          {["1Y", "3Y", "5Y", "YTD", "Max"].map((range) => (
            <Button
              key={range}
              variant={timeRange === range ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => setTimeRange(range)}
              data-testid={`range-${range}`}
            >
              {range}
            </Button>
          ))}
        </div>



        {toolbarRight && (
          <>
            <div className="mx-1 w-px h-4 bg-border" />
            {toolbarRight}
          </>
        )}

        <div className="flex-1" />

        {/* Crosshair values now render per-pane (top-left of each plot) instead of
            here in the toolbar. The aggregation still drives data-table time sync. */}

        <div className="flex-1" />

        {/* Layout controls */}
        {panes.length > 1 && (
          <>
            <Select
              value={String(panesVisible)}
              onValueChange={(v) => setPanesVisible(v === "all" ? "all" : parseInt(v))}
            >
              <SelectTrigger className="h-6 text-[10px] w-auto min-w-[110px]" data-testid="panes-visible">
                <Layers className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: Math.min(panes.length, 6) }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{i + 1} pane{i > 0 ? "s" : ""}</SelectItem>
                ))}
                <SelectItem value="all">All ({panes.length})</SelectItem>
              </SelectContent>
            </Select>

            {/* Pane pagination arrows */}
            {(canPagePrev || canPageNext) && (
              <div className="flex gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  disabled={!canPagePrev}
                  onClick={() => setPaneOffset(o => Math.max(0, o - 1))}
                  data-testid="pane-page-prev"
                  title="Previous panes"
                >
                  <ChevronLeft className="w-3 h-3" />
                </Button>
                <span className="text-[9px] text-muted-foreground flex items-center tabular-nums">
                  {paneOffset + 1}–{Math.min(paneOffset + (typeof panesVisible === "number" ? panesVisible : panes.length), panes.length)}/{panes.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  disabled={!canPageNext}
                  onClick={() => setPaneOffset(o => o + 1)}
                  data-testid="pane-page-next"
                  title="Next panes"
                >
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </div>
            )}

            <GridLayoutPicker
              value={layoutMode}
              onChange={setLayoutMode}
              testId="chart-grid-picker"
            />
          </>
        )}

        {/* Hover readout toggle */}
        <Button
          variant={showHoverReadout ? "default" : "ghost"}
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setShowHoverReadout(!showHoverReadout)}
          data-testid="toggle-hover-readout"
          title="Toggle hover values above plots"
        >
          <Eye className="w-3.5 h-3.5" />
        </Button>

        {/* Quarter shading toggle */}
        <Button
          variant={showQuarterShading ? "default" : "ghost"}
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setShowQuarterShading(!showQuarterShading)}
          data-testid="toggle-quarter-shading"
          title="Toggle quarter shading"
        >
          <CalendarDays className="w-3.5 h-3.5" />
        </Button>

        {/* Earnings markers toggle */}
        <Button
          variant={showEarnings ? "default" : "ghost"}
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setShowEarnings(!showEarnings)}
          data-testid="toggle-earnings"
          title="Toggle earnings date markers"
        >
          <Megaphone className="w-3.5 h-3.5" />
        </Button>

        {/* Fiscal-year boundary toggle (first earnings of each year) */}
        <Button
          variant={showFyBoundaries ? "default" : "ghost"}
          size="sm"
          className="h-6 px-1.5 text-[11px] font-semibold"
          onClick={() => setShowFyBoundaries(!showFyBoundaries)}
          data-testid="toggle-fy-boundaries"
          title="Toggle fiscal-year boundary lines — first earnings report of each year (FY1 → FY0)"
        >
          FY
        </Button>

        {/* Ex-div markers toggle */}
        <Button
          variant={showExDiv ? "default" : "ghost"}
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setShowExDiv(!showExDiv)}
          data-testid="toggle-exdiv"
          title="Toggle ex-dividend date markers"
        >
          <CircleDollarSign className="w-3.5 h-3.5" />
        </Button>

        {/* Macro event vertical lines dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={activeMacroEvents.size > 0 ? "default" : "ghost"}
              size="sm"
              className="h-6 px-1.5 text-[10px] gap-0.5"
              data-testid="macro-events-toggle"
              title="Toggle macro event date lines (CPI, NFP, FOMC, GDP)"
            >
              <Globe className="w-3 h-3" />
              {activeMacroEvents.size > 0 && (
                <span className="tabular-nums">{activeMacroEvents.size}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1.5" align="start" sideOffset={6}>
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider px-1.5 pb-1">
              Macro event lines
            </div>
            {(["CPI", "NFP", "FOMC", "GDP"] as const).map(et => {
              const isOn = activeMacroEvents.has(et);
              const colors: Record<string, string> = {
                CPI: "#f97316", NFP: "#3b82f6", FOMC: "#a855f7", GDP: "#10b981",
              };
              const labels: Record<string, string> = {
                CPI: "CPI", NFP: "Non-Farm Payrolls", FOMC: "FOMC", GDP: "GDP",
              };
              return (
                <button
                  key={et}
                  className={`flex items-center w-full text-left px-2 py-1 rounded text-xs hover:bg-accent ${
                    isOn ? "bg-accent" : ""
                  }`}
                  data-testid={`macro-event-${et}`}
                  onClick={() => {
                    setActiveMacroEvents(prev => {
                      const next = new Set(prev);
                      if (next.has(et)) next.delete(et); else next.add(et);
                      return next;
                    });
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                    style={{ backgroundColor: isOn ? colors[et] : "transparent", border: `1.5px solid ${colors[et]}` }}
                  />
                  <span className="flex-1">{labels[et]}</span>
                  {isOn && <Check className="w-3 h-3 text-primary ml-1" />}
                </button>
              );
            })}
            <div className="border-t border-border/50 mt-1 pt-1">
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 w-full text-left"
                onClick={onOpenMacroOverlay}
                data-testid="open-macro-overlay"
              >
                Macro series overlay...
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Annotations / notes popover */}
        <Popover
          open={annotationsOpen}
          onOpenChange={(o) => {
            setAnnotationsOpen(o);
            if (!o) {
              setEditingAnnId(null);
              setAnnDate("");
              setAnnText("");
              setAnnColor("#f59e0b");
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant={annotationsVisible && annotations.length > 0 ? "default" : "ghost"}
              size="sm"
              className="h-6 px-1.5 text-[10px] gap-0.5"
              data-testid="annotations-toggle"
              title="Chart annotations / notes"
            >
              <StickyNote className="w-3 h-3" />
              {annotations.length > 0 && (
                <span className="tabular-nums">{annotations.length}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start" sideOffset={6}>
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2">
              {editingAnnId ? "Edit Annotation" : "Add Annotation"}
            </div>
            <div className="flex flex-col gap-1.5 mb-2">
              <DateInput
                value={annDate}
                onChange={setAnnDate}
                className="h-7 text-xs"
                buttonClassName="h-7 w-7"
                data-testid="annotation-date"
              />
              <Input
                value={annText}
                onChange={(e) => setAnnText(e.target.value)}
                placeholder="e.g. CEO change, dividend cut..."
                className="h-7 text-xs"
                data-testid="annotation-text"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveAnnotation();
                }}
              />
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-muted-foreground">Color:</label>
                {["#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"].map((c) => (
                  <button
                    key={c}
                    className={`w-4 h-4 rounded-full border-2 ${annColor === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setAnnColor(c)}
                  />
                ))}
                <Button
                  size="sm"
                  className="h-6 text-[10px] ml-auto gap-0.5"
                  onClick={saveAnnotation}
                  disabled={!annDate || !annText.trim() || !activeTicker}
                  data-testid="annotation-save"
                >
                  {editingAnnId ? "Update" : "Add"}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border/50 pt-1.5 mb-1.5">
              <span className="text-[10px] text-muted-foreground">Show on chart</span>
              <button
                className={`text-[10px] px-1.5 py-0.5 rounded ${annotationsVisible ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
                onClick={() => setAnnotationsVisible(!annotationsVisible)}
                data-testid="annotation-visibility-toggle"
              >
                {annotationsVisible ? "On" : "Off"}
              </button>
            </div>
            {annotations.length > 0 && (
              <div className="border-t border-border/50 pt-1.5 max-h-[200px] overflow-auto">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-1">
                  {activeTicker} Notes ({annotations.length})
                </div>
                {annotations.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-1.5 py-1 border-b border-border/20 last:border-0 group"
                  >
                    <span
                      className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                      style={{ backgroundColor: a.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono text-muted-foreground">{a.date}</div>
                      <div className="text-xs text-foreground leading-tight">{a.text}</div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-0.5 rounded hover:bg-accent"
                        onClick={() => startEditAnnotation(a)}
                        title="Edit"
                        data-testid={`annotation-edit-${a.id}`}
                      >
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </button>
                      <button
                        className="p-0.5 rounded hover:bg-red-500/20"
                        onClick={() => deleteAnnotation.mutate(a.id)}
                        title="Delete"
                        data-testid={`annotation-delete-${a.id}`}
                      >
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Indicators */}
        <Button
          variant={showIndicators ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => { setShowIndicators(!showIndicators); setShowCorrelation(false); }}
          data-testid="toggle-indicators"
        >
          Indicators
        </Button>

        {/* Quick Analyze */}
        <Button
          variant={showQuickAnalyze ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => { setShowQuickAnalyze(!showQuickAnalyze); setShowIndicators(false); setShowCorrelation(false); setShowAttribution(false); }}
          data-testid="toggle-quick-analyze"
        >
          Quick Analyze
        </Button>

        {/* Attribution (rolling est-vs-multiple decomposition) */}
        <Button
          variant={showAttribution ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => { setShowAttribution(!showAttribution); setShowIndicators(false); setShowQuickAnalyze(false); setShowCorrelation(false); }}
          data-testid="toggle-attribution"
        >
          Attribution
        </Button>

        {/* Draw tools */}
        <Select
          value={activeTool}
          onValueChange={(v) => setActiveTool(v)}
        >
          <SelectTrigger
            className={`h-6 text-[11px] w-auto min-w-[120px] ${activeTool !== "none" ? "border-primary text-primary" : ""}`}
            data-testid="draw-menu"
          >
            <SelectValue placeholder="Draw" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No tool</SelectItem>
            {drawTools.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeTool !== "none" && activeTool !== "eraser" && activeTool !== "measure" && (
          <input
            type="color"
            value={drawColor}
            onChange={(e) => setDrawColor(e.target.value)}
            className="w-5 h-5 rounded cursor-pointer border-0 p-0"
            title="Drawing color"
          />
        )}

        {/* Single pane vs. all panes — applies to every drawing/measure tool */}
        {activeTool !== "none" && (
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 px-2 text-[11px] gap-1 ${drawAll ? "border border-primary text-primary" : "text-muted-foreground"}`}
            onClick={() => setDrawAll((v) => !v)}
            title={drawAll ? "All panes — this tool applies to every pane at the same spot" : "Single pane — this tool applies only to the pane you click. Turn on to apply to all panes at once."}
            data-testid="draw-all-toggle"
          >
            <Rows3 className="w-3 h-3" />
            {drawAll ? "All panes" : "Single pane"}
          </Button>
        )}

        {activeTool === "measure" && (
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 px-2 text-[11px] gap-1 ${measureShade ? "border border-primary text-primary" : "text-muted-foreground"}`}
            onClick={() => setMeasureShade((v) => !v)}
            title={measureShade ? "Hide shaded rectangle" : "Show shaded rectangle"}
            data-testid="measure-shade-toggle"
          >
            <span
              className="inline-block w-3 h-3 rounded-sm border"
              style={{
                borderColor: "currentColor",
                background: measureShade ? "rgba(8,153,129,0.35)" : "transparent",
              }}
            />
            Shade
          </Button>
        )}

        {activeTool === "measure" && (
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 px-2 text-[11px] gap-1 ${measureMagnet ? "border border-primary text-primary" : "text-muted-foreground"}`}
            onClick={() => setMeasureMagnet((v) => !v)}
            title={measureMagnet ? "Magnet on — snapping to data points" : "Magnet off — free placement"}
            data-testid="measure-magnet-toggle"
          >
            <Magnet className="w-3 h-3" />
            Magnet
          </Button>
        )}

        {activeTool === "measure" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
            onClick={() => window.dispatchEvent(new CustomEvent("reit-viz-measure-clear"))}
            title="Clear all measurements"
            data-testid="measure-clear"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </Button>
        )}

        {activeTool === "fractal-anchor" && (
          <div className="flex items-center gap-0.5" data-testid="fractal-toolbar">
            <span className="text-[10px] text-muted-foreground mr-1">click a candle · n</span>
            {[5, 10, 20].map((p) => (
              <Button
                key={p}
                variant="ghost"
                size="sm"
                className={`h-6 px-1.5 text-[11px] ${fractalN === p ? "border border-primary text-primary" : "text-muted-foreground"}`}
                onClick={() => applyFractalParams({ n: p })}
                title={`Fractal period ${p}`}
                data-testid={`fractal-period-${p}`}
              >
                {p}
              </Button>
            ))}
            <input
              type="number"
              min={2}
              max={100}
              value={fractalN}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n >= 2 && n <= 100) applyFractalParams({ n });
              }}
              className="h-6 w-11 text-[11px] px-1 bg-background border border-border rounded text-foreground focus:outline-none focus:border-primary"
              title="Custom fractal period"
              data-testid="fractal-period-custom"
            />
            {(["daily", "weekly", "monthly"] as const).map((tf) => (
              <Button
                key={tf}
                variant="ghost"
                size="sm"
                className={`h-6 px-2 text-[11px] ${tf === "daily" ? "ml-1 " : ""}${fractalTimeframe === tf ? "border border-primary text-primary" : "text-muted-foreground"}`}
                onClick={() => applyFractalParams({ timeframe: tf })}
                title={tf === "weekly" ? "Detect pivots on weekly bars" : tf === "monthly" ? "Detect pivots on monthly bars" : "Detect pivots on daily bars"}
                data-testid={`fractal-tf-${tf}`}
              >
                {tf === "daily" ? "Daily" : tf === "weekly" ? "Weekly" : "Monthly"}
              </Button>
            ))}
          </div>
        )}

        {drawingCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] text-destructive hover:text-destructive px-2"
            onClick={() => {
              paneRefs.current.forEach(r => r?.clearDrawings?.());
              setDrawingCount(0);
            }}
            title="Clear all drawings"
            data-testid="clear-all-drawings"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}

        {/* Clear seeded S/R levels & trendlines for the active ticker */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-2"
          onClick={() => {
            const tkr = (activeTicker || "").toUpperCase();
            if (tkr) {
              try {
                for (const key of [
                  "reit-viz-srlevel-seeds-v1",
                  "reit-viz-srlevel-persistent-v1",
                  "reit-viz-trendline-seeds-v1",
                  "reit-viz-trendline-persistent-v1",
                ]) {
                  const raw = localStorage.getItem(key);
                  if (!raw) continue;
                  const parsed = JSON.parse(raw);
                  if (parsed && parsed[tkr]) {
                    delete parsed[tkr];
                    localStorage.setItem(key, JSON.stringify(parsed));
                  }
                }
                paneRefs.current.forEach(r => r?.clearDrawings?.());
                setDrawingCount(0);
                const toast = document.createElement("div");
                toast.textContent = `Cleared seeded levels & trendlines for ${tkr}`;
                toast.className =
                  "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-cyan-500/20 text-cyan-300 text-xs font-mono border border-cyan-500/40 shadow-lg";
                document.body.appendChild(toast);
                setTimeout(() => { toast.remove(); }, 2500);
              } catch {}
            }
          }}
          title={`Clear seeded S/R levels and trendlines for ${activeTicker ?? "current ticker"}`}
          data-testid="clear-seeded-overlays"
        >
          <Trash2 className="w-3 h-3 mr-1" />
          Clear Seeds
        </Button>

        {/* Seeded overlays manager (S/R levels & auto-trendlines) */}
        <SeededOverlaysManager activeTicker={activeTicker ?? ""} />

        {/* Predictive-signal analyzer toggle */}
        <Button
          variant={showSignalAnalyzer ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 text-[10px] font-semibold"
          onClick={() => setShowSignalAnalyzer(v => !v)}
          disabled={!activeTicker}
          title={activeTicker ? `Show predictive-signal analyzer for ${activeTicker}` : "Select a ticker first"}
          data-testid="toggle-signal-analyzer"
        >
          <Sparkles className="w-3 h-3 mr-1" />
          Signals
        </Button>

        {/* Quant subplot toggles: PD Ratio, Prem↔Growth Corr, Similar Setups */}
        <button
          onClick={() => setShowPDRatio(v => { const next = !v; handlePdSubplotsStateChange({ showPDRatio: next }); return next; })}
          className={`flex items-center gap-1 text-[10px] font-mono px-2 py-1 border rounded transition-colors ${showPDRatio ? "border-violet-500 bg-violet-500/15 text-violet-300" : "border-border hover:bg-accent text-muted-foreground hover:text-foreground"}`}
          data-testid="toggle-pd-ratio"
          title="Show/hide PD Ratio subplot"
        >
          PD Ratio
        </button>
        <button
          onClick={() => setShowPremCorr(v => { const next = !v; handlePdSubplotsStateChange({ showCorrChart: next }); return next; })}
          className={`flex items-center gap-1 text-[10px] font-mono px-2 py-1 border rounded transition-colors ${showPremCorr ? "border-teal-500 bg-teal-500/15 text-teal-300" : "border-border hover:bg-accent text-muted-foreground hover:text-foreground"}`}
          data-testid="toggle-prem-corr"
          title="Show/hide Prem↔Growth Corr subplot"
        >
          Prem↔Growth Corr
        </button>
        <button
          onClick={() => setShowSimilarSetups(v => !v)}
          className={`flex items-center gap-1 text-[10px] font-mono px-2 py-1 border rounded transition-colors ${showSimilarSetups ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-border hover:bg-accent text-muted-foreground hover:text-foreground"}`}
          data-testid="toggle-similar-setups"
          title="Show/hide Similar Setups panel"
        >
          Similar Setups
        </button>

        {/* Auto-size: reset all pane sizes (fit content) to defaults */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[10px] font-mono font-semibold"
          onClick={() => {
            resetPaneSizes();
            window.dispatchEvent(new CustomEvent("reit-viz-reset-subcharts"));
            paneRefs.current.forEach(r => r?.fitContent?.());
          }}
          title="Reset all pane sizes (grid panes + sub-indicators) to defaults"
          data-testid="autosize-all"
        >
          <Maximize2 className="w-3 h-3 mr-1" />
          Auto-size
        </Button>

        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsMaximized(!isMaximized)} data-testid="maximize">
          {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Chart panes + side panels */}
      <div className={`flex flex-1 overflow-hidden relative ${maximizedSidePanel ? "hidden" : ""}`}>
        <div
          ref={gridRef}
          className="flex-1 min-w-0 overflow-hidden relative"
          style={computedGridStyle}
          data-testid="chart-grid"
        >
          {/* Draggable dividers to resize grid rows / columns */}
          {maximizedPaneId === null && (() => {
            const rows = rowFracs.length === gridDims.rows ? rowFracs : Array(gridDims.rows).fill(1);
            const cols = colFracs.length === gridDims.cols ? colFracs : Array(gridDims.cols).fill(1);
            const rowSum = rows.reduce((s, f) => s + f, 0);
            const colSum = cols.reduce((s, f) => s + f, 0);
            const handles: React.ReactNode[] = [];
            let acc = 0;
            for (let i = 0; i < rows.length - 1; i++) {
              acc += rows[i];
              handles.push(
                <div
                  key={`rowdiv-${i}`}
                  className="absolute left-0 right-0 z-30 group"
                  style={{ top: `${(acc / rowSum) * 100}%`, height: 9, transform: "translateY(-50%)", cursor: "row-resize" }}
                  onMouseDown={(e) => startDividerDrag(e, "row", i)}
                  data-testid={`pane-divider-row-${i}`}
                >
                  <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-transparent group-hover:bg-primary/60 transition-colors" />
                </div>
              );
            }
            acc = 0;
            for (let i = 0; i < cols.length - 1; i++) {
              acc += cols[i];
              handles.push(
                <div
                  key={`coldiv-${i}`}
                  className="absolute top-0 bottom-0 z-30 group"
                  style={{ left: `${(acc / colSum) * 100}%`, width: 9, transform: "translateX(-50%)", cursor: "col-resize" }}
                  onMouseDown={(e) => startDividerDrag(e, "col", i)}
                  data-testid={`pane-divider-col-${i}`}
                >
                  <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent group-hover:bg-primary/60 transition-colors" />
                </div>
              );
            }
            return handles;
          })()}
          {visiblePanes.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Loading...</p>
                <p className="text-xs mt-1 opacity-60">Use ← → arrows to cycle through tickers</p>
              </div>
            </div>
          )}
          {visiblePanes.map((pane) => {
            // Determine this pane's primary ticker for OHLC
            const paneTicker = pane.ticker || (seriesByPane[pane.id] || []).find(s => s.metric === "close")?.ticker || activeTicker;
            const paneOhlcDaily = paneTicker ? ohlcCache[paneTicker] : ohlcData;
            // Frequency view: transformed series/OHLC when not in daily mode
            const paneSeriesView = freqView ? (freqView.seriesByPane[pane.id] || []) : (seriesByPane[pane.id] || []);
            const paneOhlc = freqView ? freqView.ohlcFor(paneOhlcDaily, paneTicker ?? undefined) : paneOhlcDaily;
            const isIntraday = !!freqView?.intraday;
            const isPaneMaximized = maximizedPaneId === pane.id;
            return (
              <div
                key={pane.id}
                className="relative min-w-0 min-h-0 overflow-hidden"
                style={{ width: '100%', height: '100%' }}
                onMouseEnter={() => { hoveredPaneRef.current = pane.id; }}
                onMouseLeave={() => { if (hoveredPaneRef.current === pane.id) hoveredPaneRef.current = null; }}
                onDoubleClick={() => setMaximizedPaneId(isPaneMaximized ? null : pane.id)}
              >
                <ChartPane
                  ref={(handle) => {
                    if (handle) paneRefs.current.set(pane.id, handle);
                    else paneRefs.current.delete(pane.id);
                  }}
                  paneId={pane.id}
                  paneLabel={pane.label}
                  series={paneSeriesView}
                  ohlcData={paneOhlc}
                  activeTicker={paneTicker}
                  chartConfig={chartConfig}
                  intraday={isIntraday}
                  spacerTimes={freqView ? freqView.spacerTimes : null}
                  activeIndicators={indicatorsMap[pane.id] || {}}
                  timeRange={timeRange}
                  activeTool={isIntraday ? "" : activeTool}
                  drawColor={drawColor}
                  measureShade={measureShade}
                  measureMagnet={measureMagnet}
                  measureAll={drawAll}
                  drawAll={drawAll}
                  onCrosshairMove={(data) => handleCrosshairMove(pane.id, data)}
                  onDrawingAdded={bumpDrawingCount}
                  onDrawingDeleted={decrementDrawingCount}
                  onFractalAnchorPick={(date) => handleFractalAnchorPick(pane.id, date)}
                  onDeleteFractal={() => handleDeleteFractal(pane.id)}
                  onDeleteFractalAll={handleDeleteFractalAll}
                  isActive={false}
                  onChartReady={handleChartReady}
                  onChartDestroyed={handleChartDestroyed}
                  onSeriesMapUpdate={handleSeriesMapUpdate}
                  showQuarterShading={showQuarterShading && !isIntraday}
                  earningsDates={showEarnings ? (freqView ? (freqView.earnings(earningsDates) as any) : earningsDates) : []}
                  fyBoundaryLines={showFyBoundaries ? (freqView ? (freqView.lineEntries(fyBoundaryLines) as any) : fyBoundaryLines) : []}
                  exDivDates={showExDiv ? (freqView ? (freqView.earnings(exDivDates) as any) : exDivDates) : []}
                  macroEventLines={freqView ? (freqView.lineEntries(macroEventLines) as any) : macroEventLines}
                  colorByData={colorByDataMap[pane.id]?.data ?? null}
                  colorByMetric={colorByMap[pane.id]}
                  colorByRange={colorByDataMap[pane.id]?.range ?? null}
                  onClearColorBy={() => {
                    setColorByMap(prev => {
                      const next = { ...prev };
                      delete next[pane.id];
                      return next;
                    });
                  }}
                />
                {/* Per-pane color-by picker button */}
                <Popover open={colorByPopoverOpen === pane.id} onOpenChange={(open) => setColorByPopoverOpen(open ? pane.id : null)}>
                  <PopoverTrigger asChild>
                    <button
                      className={`absolute top-1 z-10 p-0.5 rounded transition-colors ${
                        panes.length > 1 ? "right-8" : "right-2"
                      } ${
                        colorByMap[pane.id]
                          ? "bg-primary/20 text-primary hover:bg-primary/30"
                          : "bg-background/80 hover:bg-accent text-muted-foreground hover:text-foreground"
                      }`}
                      title="Color line by metric"
                      data-testid={`colorby-pane-${pane.id}`}
                    >
                      <Palette className="w-3 h-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto min-w-[16rem] max-w-[30rem] p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Search metric..." className="h-8" />
                      <CommandList className="max-h-[min(70vh,560px)]">
                        <CommandEmpty>No metric found.</CommandEmpty>
                        {colorByMap[pane.id] && (
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                setColorByMap(prev => {
                                  const next = { ...prev };
                                  delete next[pane.id];
                                  return next;
                                });
                                setColorByPopoverOpen(null);
                              }}
                              className="text-muted-foreground"
                            >
                              <X className="w-3 h-3 mr-1.5" />
                              Clear color-by
                            </CommandItem>
                          </CommandGroup>
                        )}
                        {colorByMetricGroups.map(({ category, metrics }) => (
                          <CommandGroup key={category} heading={category}>
                            {metrics.map(m => (
                              <CommandItem
                                key={m}
                                onSelect={() => {
                                  setColorByMap(prev => ({ ...prev, [pane.id]: m }));
                                  setColorByPopoverOpen(null);
                                }}
                              >
                                {colorByMap[pane.id] === m && <Check className="w-3 h-3 mr-1.5" />}
                                <span className="text-xs whitespace-nowrap">{m}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {/* Per-pane expand/collapse button (only show when >1 pane) */}
                {panes.length > 1 && (
                  <button
                    className="absolute top-1 right-2 z-10 p-0.5 rounded bg-background/80 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    onClick={() => setMaximizedPaneId(isPaneMaximized ? null : pane.id)}
                    title={isPaneMaximized ? "Restore all panes" : "Expand this pane"}
                    data-testid={`expand-pane-${pane.id}`}
                  >
                    {isPaneMaximized
                      ? <Minimize2 className="w-3 h-3" />
                      : <Maximize2 className="w-3 h-3" />
                    }
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {showIndicators && (
          <IndicatorsPanel
            panes={panes}
            indicatorsMap={indicatorsMap}
            activePaneId={indicatorPaneId ?? (panes.length > 0 ? panes[0].id : null)}
            onSelectPane={(id) => setIndicatorPaneId(id)}
            onChangeIndicators={(paneId, indicators) =>
              setIndicatorsMap(prev => ({ ...prev, [paneId]: indicators }))
            }
            onApplyToAllPanes={(indicators) =>
              // Single atomic write across every pane. Looping the per-pane
              // setter would clobber (each call composes off the same stale map).
              setIndicatorsMap(prev => {
                const next = { ...prev };
                for (const p of panes) next[p.id] = { ...indicators };
                return next;
              })
            }
            onClose={() => setShowIndicators(false)}
          />
        )}

        {showCorrelation && onAddFormulaSeries && (
          <CorrelationPickerPanel
            tickerList={tickerList}
            panes={panes}
            onPlot={onAddFormulaSeries}
            onClose={() => setShowCorrelation(false)}
          />
        )}

        {showAttribution && onAddFormulaSeries && (
          <AttributionPickerPanel
            tickerList={tickerList}
            panes={panes}
            activeTicker={activeTicker}
            onPlot={onAddFormulaSeries}
            onClose={() => setShowAttribution(false)}
          />
        )}

        {showQuickAnalyze && onAddFormulaSeries && (
          <QuickAnalyzePanel
            plottedSeries={plottedSeries}
            panes={panes}
            onPlot={onAddFormulaSeries}
            onClose={() => setShowQuickAnalyze(false)}
          />
        )}

        {showSignalAnalyzer && activeTicker && (
          <SignalEngineAnalyzer
            ticker={activeTicker}
            asFloating
            onClose={() => setShowSignalAnalyzer(false)}
          />
        )}

      </div>

      {/* Full-width bottom strip: PD/Correlation subplots + Similar Setups.
          These panels are authored as full-width strips (border-t, no width),
          so they live below the charts, not inside the horizontal panes row.
          When one is maximized, the charts row above is hidden and this fills. */}
      {((showPDRatio || showPremCorr || showSimilarSetups) && activeTicker) && (
        <div
          className={
            maximizedSidePanel
              ? "flex-1 min-h-0 flex flex-col overflow-hidden"
              : "flex-shrink-0 flex flex-col overflow-auto max-h-[52%]"
          }
          data-testid="charts-bottom-strip"
        >
          {(showPDRatio || showPremCorr) && maximizedSidePanel !== "similar" && (
            <ChartsPdSubplots
              mode="single"
              symbol={activeTicker ?? ""}
              allTickers={tickerList}
              state={pdSubplotsState}
              onStateChange={handlePdSubplotsStateChange}
              maximizedId={maximizedSidePanel === "pd" ? "pd" : null}
              onMaximizeChange={(id) => setMaximizedSidePanel(id ? "pd" : null)}
              fillContainer={maximizedSidePanel === "pd"}
              gridColor={gridColorFor(chartConfig.gridProminence)}
            />
          )}
          {showSimilarSetups && maximizedSidePanel !== "pd" && (
            <ChartsSimilarSetupsPanel
              ticker={activeTicker}
              ohlcData={activeTicker ? ohlcCache[activeTicker] : undefined}
              maximized={maximizedSidePanel === "similar"}
              onMaximizeChange={(m) => setMaximizedSidePanel(m ? "similar" : null)}
            />
          )}
        </div>
      )}

      {/* Pairs preset ticker picker dialog */}
      <Dialog open={pairsPickerOpen} onOpenChange={setPairsPickerOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {(pendingRelValPreset ?? pendingPairsPreset)?.label} — Pick Ticker B
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Active ticker ({activeTicker}) is Ticker A. Select the second ticker below.
          </p>
          <Command className="border border-border rounded-md">
            <CommandInput
              placeholder="Search ticker..."
              value={pairsTickerSearch}
              onValueChange={setPairsTickerSearch}
              className="h-8"
              data-testid="pairs-ticker-search"
            />
            <CommandList className="max-h-[240px]">
              <CommandEmpty>No tickers found.</CommandEmpty>
              <CommandGroup>
                {(pairsTickerList.length > 0 ? pairsTickerList : tickerList)
                  .filter(t => t.ticker !== activeTicker)
                  .map(t => (
                    <CommandItem
                      key={t.ticker}
                      value={t.ticker}
                      onSelect={() => handlePairsTickerSelect(t.ticker)}
                      className="text-xs cursor-pointer"
                      data-testid={`pairs-ticker-${t.ticker}`}
                    >
                      <span className="font-semibold mr-2">{t.ticker}</span>
                      <span className="text-muted-foreground truncate">{t.name}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  );
}
