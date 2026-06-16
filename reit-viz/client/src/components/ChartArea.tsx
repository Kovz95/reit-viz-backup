import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { getTickerEvents, getMacroEventDates, MACRO_EVENT_TYPES, getMetricSeries } from "@/lib/dataService";
import type { EventType } from "@/lib/dataService";
import type { PlottedSeries, ChartConfig, PaneInfo } from "@/pages/Dashboard";
import type { TickerMeta } from "@shared/schema";
import type { ActiveIndicators, ChartPaneHandle } from "./ChartPane";
import type { IChartApi } from "lightweight-charts";
import ChartPane from "./ChartPane";
import IndicatorsPanel from "./IndicatorsPanel";
import CorrelationPickerPanel from "./CorrelationPickerPanel";
import PairsPickerPanel from "./PairsPickerPanel";
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
  Save,
  Trash2,
  X,
  LayoutTemplate,
  Palette,
  FolderOpen,
  FilePlus,
  Pencil,
  ArrowLeft,
} from "lucide-react";
import GridLayoutPicker, { gridContainerStyle, gridSlots } from "./GridLayoutPicker";
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

// Legacy LayoutMode replaced by GridLayout from GridLayoutPicker

interface ChartAreaProps {
  plottedSeries: PlottedSeries[];
  panes: PaneInfo[];
  activeTicker: string | null;
  chartConfig: ChartConfig;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  tickerList: TickerMeta[];
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
  onAddFormulaSeries?: (series: PlottedSeries, targetPaneId?: number) => void;
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

export default function ChartArea({
  plottedSeries,
  panes,
  activeTicker,
  chartConfig,
  sidebarOpen,
  onToggleSidebar,
  tickerList,
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
  const [showPairs, setShowPairs] = useState(false);
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
  const [activeTool, setActiveTool] = useState("none");
  const [drawColor, setDrawColor] = useState("#0ea5e9");
  const [tickerPopoverOpen, setTickerPopoverOpen] = useState(false);
  const [paneOffset, setPaneOffset] = useState(0);
  const [showQuarterShading, setShowQuarterShading] = useState(false);
  const [showEarnings, setShowEarnings] = useState(false);
  const [showExDiv, setShowExDiv] = useState(false);
  const [earningsDates, setEarningsDates] = useState<string[]>([]);
  const [exDivDates, setExDivDates] = useState<string[]>([]);
  // Macro event vertical line toggles
  const [activeMacroEvents, setActiveMacroEvents] = useState<Set<string>>(new Set());
  const [macroEventDates, setMacroEventDates] = useState<Record<string, string[]>>({});

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

  // Chart sync state
  const chartsRef = useRef<Map<number, IChartApi>>(new Map());
  const syncingRef = useRef(false); // guard against recursive sync
  // Store handler references so we can unsubscribe them (LWC v5 uses separate unsub methods)
  const syncHandlersRef = useRef<Map<number, { rangeHandler: (range: any) => void; crosshairHandler: (param: any) => void }>>(new Map());
  // Debounce timer for coordinated sync after data loads
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track series references per pane for crosshair sync
  const paneSeriesRefsMap = useRef<Map<number, Map<string, any>>>(new Map());

  // Track ChartPane imperative handles for clearDrawings etc.
  const paneRefs = useRef<Map<number, ChartPaneHandle>>(new Map());

  /**
   * After any pane loads/changes data, schedule a coordinated time-range sync.
   * This reads the visible TIME range (not logical range) from the first chart
   * that has data and applies it to all others. This prevents misalignment
   * when panes have different data lengths (logical range indices would differ).
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

  const currentTicker = tickerList[currentTickerIndex];

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
    return entries;
  }, [activeMacroEvents, macroEventDates]);

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

          // Compute min/max
          let min = Infinity, max = -Infinity;
          for (const d of seriesData) {
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

  // Build the metric list for color-by picker (same as sidebar METRIC_CATEGORIES)
  const colorByMetricOptions = useMemo(() => {
    // Get metrics from the first ticker's data as a representative list
    const uniqueMetrics = new Set<string>();
    for (const s of plottedSeries) {
      uniqueMetrics.add(s.metric);
    }
    // Also add common metrics
    const common = [
      "close", "P/FFO FY2", "P/FFO LTM", "P/E FY2", "P/E LTM",
      "P/AFFO FY2", "P/AFFO LTM", "EV/EBITDA FY2", "EV/EBITDA LTM",
      "Dividend Yield", "FFO Yield FY2", "FFO Yield LTM", "AFFO Yield FY2",
      "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2", "EPS FY1", "EPS FY2",
      "Implied Cap Rate", "Short Interest%", "Enterprise Value",
      "FY1 FFO Growth", "FY2 FFO Growth", "FY1 EPS Growth", "FY2 EPS Growth",
      "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
      "% off 52wk High", "% off 52wk Low",
      "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M",
      "FFO LTM", "AFFO LTM", "EPS LTM", "EBITDA LTM", "Sales LTM",
      "P/S LTM", "P/S FY2", "Dividend", "52wk High", "52wk Low",
      "Buy Ratings", "Hold Ratings", "Sell Ratings", "Bull%", "Bear%",
      "EBITDA FY1", "EBITDA FY2", "Sales FY1", "Sales FY2",
      "EPS FY0",
    ];
    for (const m of common) uniqueMetrics.add(m);
    return [...uniqueMetrics].sort();
  }, [plottedSeries]);

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

  // Layout grid style (inline) — handles all grid sizes via gridContainerStyle
  const computedGridStyle = useMemo((): React.CSSProperties => {
    if (maximizedPaneId !== null) {
      return { display: "grid", gridTemplateColumns: "1fr", gridTemplateRows: "1fr" };
    }
    return gridContainerStyle(layoutMode, visiblePanes.length);
  }, [layoutMode, visiblePanes.length, maximizedPaneId]);

  // Drawing tools
  const drawTools = [
    { id: "hline", label: "H-Line" },
    { id: "trendline", label: "Trendline" },
    { id: "freehand", label: "Freehand" },
    { id: "eraser", label: "Eraser" },
  ];

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
        <Button
          variant="ghost" size="sm" className="h-7 w-7 p-0"
          onClick={() => onNavigateTicker("prev")}
          disabled={tickerList.length === 0}
          data-testid="prev-ticker"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <Popover open={tickerPopoverOpen} onOpenChange={setTickerPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1.5 min-w-0 max-w-[260px]"
              data-testid="ticker-dropdown"
            >
              {isLoadingView && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0" />}
              <span className="font-mono font-bold text-sm text-primary" data-testid="current-ticker">
                {activeTicker || "—"}
              </span>
              {currentTicker && (
                <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                  {currentTicker.name}
                </span>
              )}
              {tickerList.length > 0 && (
                <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">
                  {currentTickerIndex + 1}/{tickerList.length}
                </span>
              )}
              <ChevronsUpDown className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search ticker or name..." className="h-8 text-xs" />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>No ticker found.</CommandEmpty>
                <CommandGroup>
                  {tickerList.map((t) => (
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
                      <span className="text-muted-foreground truncate">{t.name}</span>
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
          disabled={tickerList.length === 0}
          data-testid="next-ticker"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        <div className="mx-1 w-px h-4 bg-border" />

        {/* View selector dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 px-2 max-w-[240px]" data-testid="view-selector">
              <LayoutTemplate className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{activeView}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 max-h-[420px] overflow-y-auto">
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
                      <span className="truncate" title={v}>{v}</span>
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
                    <span className="truncate">{v}</span>
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
                        <span className="truncate">{v}</span>
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
                        <span className="truncate">{v}</span>
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
                    <span className="flex items-center gap-1 truncate">
                      {cv.label === activeView && <Check className="w-3 h-3 flex-shrink-0" />}
                      <span className="truncate">{cv.label}</span>
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
                    <span className="truncate">{p.label}</span>
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
                    <span className="truncate" title={p.label}>{p.label}</span>
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
              <DropdownMenuContent align="start" className="w-[320px]">
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
                    <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground">
                      Saved Charts
                    </DropdownMenuLabel>
                    {savedCustomCharts.map((c) => (
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
                          <span className="truncate" title={c.name}>{c.name}</span>
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

        {/* Crosshair data */}
        {crosshairData && (
          <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums overflow-hidden">
            <span className="text-muted-foreground">{crosshairData.time}</span>
            {Object.entries(crosshairData.values).map(([key, val]) => (
              <span key={key} className="whitespace-nowrap">
                <span className="text-muted-foreground">{key}: </span>
                <span className="text-foreground font-semibold">
                  {typeof val === "number" ? val.toFixed(2) : val}
                </span>
              </span>
            ))}
          </div>
        )}

        <div className="flex-1" />

        {/* Layout controls */}
        {panes.length > 1 && (
          <>
            <Select
              value={String(panesVisible)}
              onValueChange={(v) => setPanesVisible(v === "all" ? "all" : parseInt(v))}
            >
              <SelectTrigger className="h-6 text-[10px] w-[80px]" data-testid="panes-visible">
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

        {/* Indicators */}
        <Button
          variant={showIndicators ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => { setShowIndicators(!showIndicators); setShowCorrelation(false); setShowPairs(false); }}
          data-testid="toggle-indicators"
        >
          Indicators
        </Button>

        {/* Correlation */}
        <Button
          variant={showCorrelation ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => { setShowCorrelation(!showCorrelation); setShowIndicators(false); setShowPairs(false); }}
          data-testid="toggle-correlation"
        >
          Correlation
        </Button>

        {/* Pairs */}
        <Button
          variant={showPairs ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => { setShowPairs(!showPairs); setShowCorrelation(false); setShowIndicators(false); }}
          data-testid="toggle-pairs"
        >
          Pairs
        </Button>

        {/* Draw tools */}
        <Select
          value={activeTool}
          onValueChange={(v) => setActiveTool(v)}
        >
          <SelectTrigger
            className={`h-6 text-[11px] w-[100px] ${activeTool !== "none" ? "border-primary text-primary" : ""}`}
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

        {activeTool !== "none" && activeTool !== "eraser" && (
          <input
            type="color"
            value={drawColor}
            onChange={(e) => setDrawColor(e.target.value)}
            className="w-5 h-5 rounded cursor-pointer border-0 p-0"
            title="Drawing color"
          />
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

        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIsMaximized(!isMaximized)} data-testid="maximize">
          {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {/* Chart panes + side panels */}
      <div className="flex flex-1 overflow-hidden relative">
        <div
          className="flex-1 min-w-0 overflow-hidden"
          style={computedGridStyle}
          data-testid="chart-grid"
        >
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
            const paneOhlc = paneTicker ? ohlcCache[paneTicker] : ohlcData;
            const isPaneMaximized = maximizedPaneId === pane.id;
            return (
              <div
                key={pane.id}
                className="relative min-w-0 min-h-0 overflow-hidden"
                style={{ width: '100%', height: '100%' }}
                onDoubleClick={() => setMaximizedPaneId(isPaneMaximized ? null : pane.id)}
              >
                <ChartPane
                  ref={(handle) => {
                    if (handle) paneRefs.current.set(pane.id, handle);
                    else paneRefs.current.delete(pane.id);
                  }}
                  paneId={pane.id}
                  paneLabel={pane.label}
                  series={seriesByPane[pane.id] || []}
                  ohlcData={paneOhlc}
                  activeTicker={paneTicker}
                  chartConfig={chartConfig}
                  activeIndicators={indicatorsMap[pane.id] || {}}
                  timeRange={timeRange}
                  activeTool={activeTool}
                  drawColor={drawColor}
                  onCrosshairMove={(data) => handleCrosshairMove(pane.id, data)}
                  onDrawingAdded={bumpDrawingCount}
                  onDrawingDeleted={decrementDrawingCount}
                  isActive={false}
                  onChartReady={handleChartReady}
                  onChartDestroyed={handleChartDestroyed}
                  onSeriesMapUpdate={handleSeriesMapUpdate}
                  showQuarterShading={showQuarterShading}
                  earningsDates={showEarnings ? earningsDates : []}
                  exDivDates={showExDiv ? exDivDates : []}
                  macroEventLines={macroEventLines}
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
                  <PopoverContent className="w-52 p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Search metric..." className="h-8" />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>No metric found.</CommandEmpty>
                        <CommandGroup>
                          {colorByMap[pane.id] && (
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
                          )}
                          {colorByMetricOptions.map(m => (
                            <CommandItem
                              key={m}
                              onSelect={() => {
                                setColorByMap(prev => ({ ...prev, [pane.id]: m }));
                                setColorByPopoverOpen(null);
                              }}
                            >
                              {colorByMap[pane.id] === m && <Check className="w-3 h-3 mr-1.5" />}
                              <span className="text-xs">{m}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
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

        {showPairs && onAddFormulaSeries && (
          <PairsPickerPanel
            tickerList={tickerList}
            panes={panes}
            onPlot={onAddFormulaSeries}
            onClose={() => setShowPairs(false)}
          />
        )}
      </div>

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
