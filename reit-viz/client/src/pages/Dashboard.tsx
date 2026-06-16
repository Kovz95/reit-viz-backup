import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTickers, getOhlcData, getMetricSeries, getPairsData } from "@/lib/dataService";
import type { PairsData } from "@/lib/dataService";
import type { TickerMeta } from "@shared/schema";
import Sidebar from "@/components/Sidebar";
import { useUpload } from "@/lib/uploadContext";
import ChartArea from "@/components/ChartArea";
import type { GridLayout } from "@/components/GridLayoutPicker";
import DataTable from "@/components/DataTable";
import WorkspaceManager from "@/components/WorkspaceManager";
import { getSeriesColor } from "@/lib/chartColors";
import { useUniverse } from "@/lib/universeContext";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { useWorkspaceContext, useWorkspaceTab } from "@/lib/workspaceContext";

export interface CustomChartView {
  id: number;
  label: string;
  metrics: string[];
}

const isDeployed = API_BASE !== "";

export interface PlottedSeries {
  id: string;
  ticker: string;
  metric: string;
  color: string;
  lineWidth?: number;    // 1-5, default 2
  lineStyle?: number;    // 0=Solid, 1=Dotted, 2=Dashed, 3=LargeDashed, 4=SparseDotted
  paneIndex: number;
  data: { time: string; value: number }[];
  visible: boolean;
  label: string;
}

export interface ChartConfig {
  chartType: "candlestick" | "line" | "line-scatter";
  showVolume: boolean;
}

export interface PaneInfo {
  id: number;
  label: string;
  ticker?: string; // primary ticker for this pane (for OHLC)
}

// Preset view definitions
const PRESET_VIEWS: Record<string, string[]> = {
  "Price vs P/FFO FY2": ["close", "P/FFO FY2"],
  "Price | P/FFO FY2 | FFO FY2": ["close", "P/FFO FY2", "FFO FY2"],
  "Price | P/E FY2 | EPS FY2": ["close", "P/E FY2", "EPS FY2"],
  "Price | EV/EBITDA FY2 | EBITDA FY2": ["close", "EV/EBITDA FY2", "EBITDA FY2"],
  "Price vs P/E LTM": ["close", "P/E LTM"],
  "Price vs Dividend Yield": ["close", "Dividend Yield"],
  "Price vs EV/EBITDA LTM": ["close", "EV/EBITDA LTM"],
  "Price vs P/FFO LTM": ["close", "P/FFO LTM"],
  "Price vs P/AFFO FY2": ["close", "P/AFFO FY2"],
  "Estimate Revisions (FFO)": ["FFO FY1", "FFO FY2"],
  "Estimate Revisions (EPS)": ["EPS FY1", "EPS FY2"],
  "Estimate Revisions (AFFO)": ["AFFO FY1", "AFFO FY2"],
  "Estimates vs Price": ["close", "FFO FY2", "FFO FY1"],
  "P/FFO FY2 Only": ["P/FFO FY2"],
  "Price Only": ["close"],
};

const FUNDAMENTAL_VIEWS: Record<string, string[]> = {
  "FFO & AFFO Estimates": ["FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2"],
  "EPS Estimates (FY0/FY1/FY2)": ["EPS FY0", "EPS FY1", "EPS FY2"],
  "Revenue Estimates": ["Sales LTM", "Sales FY1", "Sales FY2"],
  "EBITDA Estimates": ["EBITDA LTM", "EBITDA FY1", "EBITDA FY2"],
  "Growth Rates (FFO)": ["FY1 FFO Growth", "FY2 FFO Growth"],
  "Growth Rates (EPS)": ["FY1 EPS Growth", "FY2 EPS Growth"],
  "Yield Stack": ["Dividend Yield", "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield FY2"],
  "Valuation Multiples (FY2)": ["P/FFO FY2", "P/AFFO FY2", "P/E FY2", "EV/EBITDA FY2"],
  "Valuation Multiples (LTM)": ["P/FFO LTM", "P/E LTM", "EV/EBITDA LTM", "P/S LTM"],
  "Implied Cap Rate vs Div Yield": ["Implied Cap Rate", "Dividend Yield"],
  "Enterprise Value vs EBITDA": ["Enterprise Value", "EBITDA LTM"],
  "Analyst Sentiment": ["Buy Ratings", "Hold Ratings", "Sell Ratings"],
  "Sentiment + Short Interest": ["Bull%", "Bear%", "Short Interest%"],
  "Price vs Implied Cap Rate": ["close", "Implied Cap Rate"],
};

const INTERVIEW_VIEWS: Record<string, string[]> = {
  "NAV Proxy (Cap Rate + Yield)": ["close", "Implied Cap Rate", "Dividend Yield"],
  "Earnings Power": ["close", "FFO FY2", "AFFO FY2"],
  "Multiple Expansion/Compression": ["P/FFO FY2", "FFO Yield FY2"],
  "Estimate Momentum": ["FFO FY1", "FFO FY2", "EPS FY1", "EPS FY2"],
  "Relative Value Quick Look": ["close", "P/FFO FY2", "Dividend Yield"],
  "Growth vs Valuation": ["FY1 FFO Growth", "FY2 FFO Growth", "P/FFO FY2"],
  "Positioning & Crowding": ["close", "Short Interest%", "Bull%", "Bear%"],
  "Private vs Public (Cap Rate vs Multiple)": ["Implied Cap Rate", "P/FFO FY2"],
  "Dividend Safety": ["Dividend", "FFO FY2", "AFFO FY2"],
  "52-Week Range Context": ["close", "52wk High", "52wk Low"],
  "EV & EBITDA Trajectory": ["Enterprise Value", "EBITDA LTM", "EBITDA FY2"],
  "Full Valuation Stack": ["P/FFO FY2", "P/AFFO FY2", "EV/EBITDA FY2", "Dividend Yield"],
};

// ── Pairs Presets: multi-ticker derived views with baked-in indicators ──
export interface PairsPresetDef {
  label: string;
  /** Which derived series to create, in pane order */
  panes: {
    key: keyof PairsData | "priceA" | "priceB";
    label: (a: string, b: string) => string;
    /** Auto-applied indicators */
    indicators?: ActiveIndicators;
  }[];
}

import type { ActiveIndicators } from "@/components/ChartPane";

const PAIRS_PRESETS: PairsPresetDef[] = [
  {
    label: "Pair Ratio + Correlation",
    panes: [
      {
        key: "ratio",
        label: (a, b) => `Ratio: ${a}/${b}`,
        indicators: { mean: { rolling: true, period: 252 } },
      },
      {
        key: "correlation",
        label: (a, b) => `Corr: ${a}/${b} (60d)`,
      },
    ],
  },
  {
    label: "Pair Z-Score + Ratio",
    panes: [
      {
        key: "ratio",
        label: (a, b) => `Ratio: ${a}/${b}`,
        indicators: { mean: { rolling: true, period: 252 } },
      },
      {
        key: "zScore",
        label: (a, b) => `Z-Score: ${a}/${b}`,
        indicators: { mean: { rolling: false, period: 252 } },
      },
    ],
  },
  {
    label: "Full Pairs Suite",
    panes: [
      {
        key: "ratio",
        label: (a, b) => `Ratio: ${a}/${b}`,
        indicators: { mean: { rolling: true, period: 252 } },
      },
      {
        key: "zScore",
        label: (a, b) => `Z-Score: ${a}/${b}`,
      },
      {
        key: "correlation",
        label: (a, b) => `Corr: ${a}/${b} (60d)`,
      },
      {
        key: "rollingBeta",
        label: (a, b) => `Beta: ${a}/${b}`,
      },
    ],
  },
  {
    label: "Spread + Spread Z",
    panes: [
      {
        key: "spread",
        label: (a, b) => `Spread: ${a}−${b}`,
        indicators: { mean: { rolling: true, period: 252 } },
      },
      {
        key: "spreadZ",
        label: (a, b) => `Spread Z: ${a}/${b}`,
        indicators: { mean: { rolling: false, period: 252 } },
      },
    ],
  },
  {
    label: "Percentile Rank + Ratio",
    panes: [
      {
        key: "ratio",
        label: (a, b) => `Ratio: ${a}/${b}`,
        indicators: { sma: 252 },
      },
      {
        key: "percentileRank",
        label: (a, b) => `Pct Rank: ${a}/${b}`,
      },
    ],
  },
];

export { PAIRS_PRESETS };

// ── Relative-Value Presets: per-metric A/B ratio series across panes ──
export interface RelativeValuePresetDef {
  label: string;
  panes: {
    metric: string;
    label: (a: string, b: string) => string;
    indicators?: ActiveIndicators;
  }[];
}

const RELATIVE_VALUE_PRESETS: RelativeValuePresetDef[] = [
  {
    label: "Rel Val: P/FFO + FFO Growth",
    panes: [
      { metric: "P/FFO FY2", label: (a, b) => `P/FFO FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FY2 FFO Growth", label: (a, b) => `FY2 FFO Growth: ${a}/${b}` },
    ],
  },
  {
    label: "Rel Val: P/E + EPS Growth",
    panes: [
      { metric: "P/E FY2", label: (a, b) => `P/E FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FY2 EPS Growth", label: (a, b) => `FY2 EPS Growth: ${a}/${b}` },
    ],
  },
  {
    label: "Rel Val: EV/EBITDA + EBITDA Growth",
    panes: [
      { metric: "EV/EBITDA FY2", label: (a, b) => `EV/EBITDA FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FY2 EBITDA Growth", label: (a, b) => `FY2 EBITDA Growth: ${a}/${b}` },
    ],
  },
  {
    label: "Rel Val: Price + P/FFO + FFO Growth",
    panes: [
      { metric: "close", label: (a, b) => `Price: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "P/FFO FY2", label: (a, b) => `P/FFO FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FY2 FFO Growth", label: (a, b) => `FY2 FFO Growth: ${a}/${b}` },
    ],
  },
  {
    label: "Rel Val: Price + P/E + EPS Growth",
    panes: [
      { metric: "close", label: (a, b) => `Price: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "P/E FY2", label: (a, b) => `P/E FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FY2 EPS Growth", label: (a, b) => `FY2 EPS Growth: ${a}/${b}` },
    ],
  },
  {
    label: "Rel Val: Dividend Yield + FFO Yield",
    panes: [
      { metric: "Dividend Yield", label: (a, b) => `Div Yield: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
      { metric: "FFO Yield FY2", label: (a, b) => `FFO Yield FY2: ${a}/${b}`, indicators: { mean: { rolling: true, period: 252 } } },
    ],
  },
];

export { RELATIVE_VALUE_PRESETS };

// ── Server-backed custom chart (persistent blank canvas) ──
export interface SavedCustomChart {
  id: number;
  name: string;
  state: string;
  createdAt?: string;
  updatedAt?: string;
}

const DEFAULT_VIEW = "Price vs P/FFO FY2";

let nextPaneId = 1;
let nextSeriesSeq = 1; // unique series ID counter
// Generation counter to invalidate stale pane-cleanup timeouts
let paneGeneration = 0;
// Module-level map to persist custom series styling across component re-mounts
// Keys are series IDs, values are { color, lineWidth, lineStyle }
const seriesStyleOverrides = new Map<string, { color?: string; lineWidth?: number; lineStyle?: number }>();

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [plottedSeries, setPlottedSeries] = useState<PlottedSeries[]>([]);
  const plottedSeriesRef = useRef<PlottedSeries[]>([]);
  plottedSeriesRef.current = plottedSeries;
  const [panes, setPanes] = useState<PaneInfo[]>([]);
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    chartType: "candlestick",
    showVolume: false,
  });
  const [crosshairTime, setCrosshairTime] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string>(DEFAULT_VIEW);
  const [isLoadingView, setIsLoadingView] = useState(false);
  // Per-ticker OHLC cache
  const [ohlcCache, setOhlcCache] = useState<Record<string, any>>({});
  // Fundamental sheets from upload context
  const { fundamentalSheets, setFundamentalSheets } = useUpload();
  // Force-open sidebar section (for macro overlay quick access)
  const [forceOpenSection, setForceOpenSection] = useState<string | null>(null);
  // Universe context (for workspace save/load)
  const universe = useUniverse();

  // Workspace tracking (manual save/load only — autosave handled by AutoSaveManager)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [layoutMode, setLayoutMode] = useState<GridLayout>("1x1");
  // Per-pane indicator state (lifted here for workspace persistence)
  const [indicatorsMap, setIndicatorsMap] = useState<Record<number, any>>({});
  // Per-pane color-by-metric state (lifted here for workspace persistence)
  const [colorByMap, setColorByMap] = useState<Record<number, string>>({});

  // Refs mirroring current state, for the custom-chart autosave snapshot
  const panesRef = useRef<PaneInfo[]>([]);
  panesRef.current = panes;
  const activeTickerRef = useRef<string | null>(null);
  activeTickerRef.current = activeTicker;
  const chartConfigRef = useRef<ChartConfig>(chartConfig);
  chartConfigRef.current = chartConfig;
  const layoutModeRef = useRef<GridLayout>(layoutMode);
  layoutModeRef.current = layoutMode;
  const indicatorsMapRef = useRef<Record<number, any>>(indicatorsMap);
  indicatorsMapRef.current = indicatorsMap;

  // ── Custom Chart View Templates ──
  const qc = useQueryClient();
  const [memChartViews, setMemChartViews] = useState<CustomChartView[]>([]);

  const { data: backendChartViewsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/chart-view-templates"],
    enabled: !isDeployed,
  });

  const customChartViews: CustomChartView[] = useMemo(() => {
    if (isDeployed) return memChartViews;
    return backendChartViewsRaw.map((t: any) => ({
      id: t.id,
      label: t.label,
      metrics: typeof t.metrics === "string" ? JSON.parse(t.metrics) : t.metrics,
    }));
  }, [isDeployed, memChartViews, backendChartViewsRaw]);

  const saveChartViewMut = useMutation({
    mutationFn: async (tmpl: { label: string; metrics: string[] }) => {
      if (isDeployed) {
        const newView: CustomChartView = { id: Date.now(), label: tmpl.label, metrics: tmpl.metrics };
        setMemChartViews((prev) => [...prev, newView]);
        return newView;
      }
      const res = await apiRequest("POST", "/api/chart-view-templates", tmpl);
      return res.json();
    },
    onSuccess: () => {
      if (!isDeployed) qc.invalidateQueries({ queryKey: ["/api/chart-view-templates"] });
    },
  });

  const deleteChartViewMut = useMutation({
    mutationFn: async (id: number) => {
      if (isDeployed) {
        setMemChartViews((prev) => prev.filter((v) => v.id !== id));
        return;
      }
      await apiRequest("POST", `/api/chart-view-templates/${id}/delete`, {});
    },
    onSuccess: () => {
      if (!isDeployed) qc.invalidateQueries({ queryKey: ["/api/chart-view-templates"] });
    },
  });

  // Build a merged view lookup: presets + custom
  const allViews = useMemo(() => {
    const merged: Record<string, string[]> = { ...PRESET_VIEWS, ...FUNDAMENTAL_VIEWS, ...INTERVIEW_VIEWS };
    for (const cv of customChartViews) {
      merged[cv.label] = cv.metrics;
    }
    return merged;
  }, [customChartViews]);



  const { serializeAll: serializeAllTabs, restoreAll: restoreAllTabs } = useWorkspaceContext();

  // ── Workspace serialization (for useWorkspaceTab + manual workspace save/load) ──
  const serializeCharts = useCallback(() => {
    // Synthetic tickers generated by Pairs / Correlation panels — their data
    // cannot be re-fetched from the server, so we must persist it inline.
    const SYNTHETIC_TICKERS = new Set([
      "CORR", "RATIO", "LOGRATIO", "ZSCORE", "SPREADZ",
      "OLSRESIDZ", "PERCENTILE", "BETA", "R2", "BETAADJSPREAD",
      "SPREAD", "BETASPRD", "PCTRANK", "RELVAL", "PAIRS",
    ]);
    // Strip data from series that can be re-fetched to keep the blob small.
    // Keep data inline for uploaded series AND derived (synthetic) series.
    const lightSeries = plottedSeries.map(s => {
      const isUploaded = s.id.startsWith("uploaded:") || s.metric.startsWith("xl:");
      const isDerived = SYNTHETIC_TICKERS.has(s.ticker);
      return (isUploaded || isDerived) ? s : { ...s, data: [] };
    });
    return {
      plottedSeries: lightSeries,
      panes,
      activeTicker,
      chartConfig,
      activeView,
      uploadedSheets: fundamentalSheets,
      nextPaneId,
      customChartViews: memChartViews,
      layoutMode,
      indicatorsMap,
      colorByMap,
    };
  }, [plottedSeries, panes, activeTicker, chartConfig, activeView, fundamentalSheets, memChartViews, layoutMode, indicatorsMap, colorByMap]);

  const refetchSeriesData = useCallback((stateSeries: PlottedSeries[]) => {
    // Synthetic tickers whose data is persisted inline — never try to re-fetch
    const SYNTHETIC_TICKERS = new Set([
      "CORR", "RATIO", "LOGRATIO", "ZSCORE", "SPREADZ",
      "OLSRESIDZ", "PERCENTILE", "BETA", "R2", "BETAADJSPREAD",
      "SPREAD", "BETASPRD", "PCTRANK", "RELVAL", "PAIRS",
    ]);
    // Re-fetch OHLC for tickers (skip synthetic)
    const tks = new Set<string>();
    for (const s of stateSeries) {
      if (s.ticker && s.ticker !== "MACRO" && !SYNTHETIC_TICKERS.has(s.ticker) && s.metric === "close") tks.add(s.ticker);
    }
    for (const tk of tks) {
      getOhlcData(tk).then(data => {
        setOhlcCache(prev => ({ ...prev, [tk]: data }));
      }).catch(() => {});
    }
    // Re-fetch data for all non-uploaded, non-derived series with empty data
    const seriesToFetch = stateSeries.filter(
      (s: any) => !s.id.startsWith("uploaded:") && !s.metric.startsWith("xl:") && !SYNTHETIC_TICKERS.has(s.ticker) && (!s.data || s.data.length === 0)
    );
    for (const s of seriesToFetch) {
      if (s.metric === "close" || s.metric === "open" || s.metric === "high" || s.metric === "low") continue;
      if (s.id.startsWith("macro:")) {
        const macroId = s.id.replace("macro:", "");
        fetch(`data/macro/${macroId}.json`)
          .then(r => r.json())
          .then(json => {
            const points = (json.observations || []).map((o: any) => ({
              time: o.date,
              value: parseFloat(o.value),
            })).filter((p: any) => !isNaN(p.value));
            setPlottedSeries(prev => prev.map(ps =>
              ps.id === s.id ? { ...ps, data: points } : ps
            ));
          })
          .catch(() => {});
        continue;
      }
      getMetricSeries(s.ticker, s.metric)
        .then(data => {
          setPlottedSeries(prev => prev.map(ps =>
            ps.id === s.id ? { ...ps, data } : ps
          ));
        })
        .catch(() => {});
    }
  }, []);

  const restoreCharts = useCallback((state: any) => {
    if (!state) return;
    paneGeneration++;
    if (state.nextPaneId) nextPaneId = state.nextPaneId;
    if (state.panes) setPanes(state.panes);
    if (state.activeTicker) setActiveTicker(state.activeTicker);
    if (state.chartConfig) setChartConfig(state.chartConfig);
    if (state.activeView) setActiveView(state.activeView);
    if (state.uploadedSheets) {
      setFundamentalSheets(state.uploadedSheets);
    }
    if (state.customChartViews) setMemChartViews(state.customChartViews);
    if (state.layoutMode) setLayoutMode(state.layoutMode);
    if (state.indicatorsMap) setIndicatorsMap(state.indicatorsMap);
    setColorByMap(state.colorByMap && typeof state.colorByMap === "object" ? state.colorByMap : {});
    if (state.plottedSeries) {
      setPlottedSeries(state.plottedSeries);
      refetchSeriesData(state.plottedSeries);
    }
  }, [refetchSeriesData]);

  // Register with workspace tab system so charts state is auto-saved/loaded
  useWorkspaceTab("charts", serializeCharts, restoreCharts);

  // Manual workspace save/load uses the full state (all tabs + universe)
  const serializeState = useCallback(() => {
    const s: Record<string, any> = {
      ...serializeCharts(),
      universe: universe.serialize(),
      tabs: serializeAllTabs(),
    };
    if (fundamentalSheets.length > 0) {
      s.fundamentalSheets = fundamentalSheets;
    }
    return s;
  }, [serializeCharts, universe, serializeAllTabs, fundamentalSheets]);

  const restoreState = useCallback((state: any) => {
    if (!state) return;
    if (state.universe) universe.restore(state.universe);
    if (state.fundamentalSheets && Array.isArray(state.fundamentalSheets) && state.fundamentalSheets.length > 0) {
      setFundamentalSheets(state.fundamentalSheets);
    }
    if (state.tabs) restoreAllTabs(state.tabs);
    restoreCharts(state);
  }, [universe, restoreAllTabs, restoreCharts, setFundamentalSheets]);

  const { data: tickers = [] } = useQuery<TickerMeta[]>({
    queryKey: ["tickers"],
    queryFn: getTickers,
  });

  // Gather all unique tickers used in panes
  const uniquePaneTickers = useMemo(() => {
    const tks = new Set<string>();
    for (const s of plottedSeries) {
      if (s.ticker && s.ticker !== "MACRO" && s.metric === "close") {
        tks.add(s.ticker);
      }
    }
    return Array.from(tks);
  }, [plottedSeries]);

  // Fetch OHLC data for all unique tickers
  useEffect(() => {
    for (const tk of uniquePaneTickers) {
      if (!ohlcCache[tk]) {
        getOhlcData(tk).then(data => {
          setOhlcCache(prev => ({ ...prev, [tk]: data }));
        }).catch(() => {});
      }
    }
  }, [uniquePaneTickers]); // eslint-disable-line react-hooks/exhaustive-deps

  // For backward compat: ohlcData for the active ticker
  const ohlcData = activeTicker ? ohlcCache[activeTicker] : undefined;

  // Flat sorted ticker list for carousel
  const tickerList = useMemo(() => {
    if (!tickers.length) return [];
    const groups: Record<string, TickerMeta[]> = {};
    for (const t of tickers) {
      const key = t.subindustry || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    const sorted: TickerMeta[] = [];
    for (const key of Object.keys(groups).sort()) {
      sorted.push(...groups[key]);
    }
    return sorted;
  }, [tickers]);

  const currentTickerIndex = useMemo(() => {
    if (!activeTicker || !tickerList.length) return -1;
    return tickerList.findIndex((t) => t.ticker === activeTicker);
  }, [activeTicker, tickerList]);

  // Remove a pane and its series
  const removePane = useCallback((paneId: number) => {
    paneGeneration++;
    setPanes((prev) => prev.filter((p) => p.id !== paneId));
    setPlottedSeries((prev) => prev.filter((s) => s.paneIndex !== paneId));
  }, []);

  // Load a preset view for a given ticker
  const loadViewForTicker = useCallback(
    async (ticker: string, viewName?: string) => {
      let view = viewName || activeView;
      let metrics = allViews[view];
      if (!metrics) {
        view = DEFAULT_VIEW;
        metrics = allViews[view];
        if (!metrics) return;
        setActiveView(view);
      }

      paneGeneration++;
      const myGeneration = paneGeneration;
      setIsLoadingView(true);
      setActiveTicker(ticker);

      try {
        const results = await Promise.all(
          metrics.map(async (metric, idx) => {
            const data = await getMetricSeries(ticker, metric);
            return { metric, data, idx };
          })
        );

        // If a restore happened while we were fetching, abandon this load
        if (paneGeneration !== myGeneration) {
          setIsLoadingView(false);
          return;
        }

        nextPaneId = 1;
        const newPanes: PaneInfo[] = [];
        const newSeries: PlottedSeries[] = [];

        // Read current series to preserve any custom styling (color, lineWidth, lineStyle)
        const prevSeriesMap = new Map<string, PlottedSeries>();
        for (const s of plottedSeriesRef.current) prevSeriesMap.set(s.id, s);

        for (const r of results) {
          const paneId = nextPaneId++;
          newPanes.push({
            id: paneId,
            label: `${ticker} \u2014 ${r.metric === "close" ? "Price" : r.metric}`,
            ticker,
          });
          const seriesId = `${ticker}:${r.metric}:${nextSeriesSeq++}`;
          // Look up previous styling by ticker:metric (ignoring sequence suffix)
          const baseKey = `${ticker}:${r.metric}`;
          const existing = prevSeriesMap.get(baseKey) || Array.from(prevSeriesMap.values()).find(s => s.ticker === ticker && s.metric === r.metric);
          const styleOverride = seriesStyleOverrides.get(seriesId) || seriesStyleOverrides.get(baseKey);
          newSeries.push({
            id: seriesId,
            ticker,
            metric: r.metric,
            color: styleOverride?.color ?? existing?.color ?? getSeriesColor(r.idx),
            lineWidth: styleOverride?.lineWidth ?? existing?.lineWidth,
            lineStyle: styleOverride?.lineStyle ?? existing?.lineStyle,
            paneIndex: paneId,
            data: r.data,
            visible: true,
            label: `${ticker} - ${r.metric}`,
          });
        }

        setPanes(newPanes);
        setPlottedSeries(newSeries);
      } catch (e) {
        console.error("Failed to load view", e);
      }
      setIsLoadingView(false);
    },
    [activeView, allViews]
  );

  // Load a pairs preset: fetches derived data for tickerA/tickerB, builds panes with auto-indicators
  const loadPairsPreset = useCallback(
    async (preset: PairsPresetDef, tickerB: string) => {
      if (!activeTicker) return;
      const tickerA = activeTicker;
      paneGeneration++;
      const myGeneration = paneGeneration;
      setIsLoadingView(true);
      setActiveView(preset.label);

      try {
        const pairsData = await getPairsData(tickerA, tickerB);
        // If a restore happened while we were fetching, abandon this load
        if (paneGeneration !== myGeneration) {
          setIsLoadingView(false);
          return;
        }
        nextPaneId = 1;
        const newPanes: PaneInfo[] = [];
        const newSeries: PlottedSeries[] = [];
        const newIndicatorsMap: Record<number, ActiveIndicators> = {};

        for (const paneDef of preset.panes) {
          const data = pairsData[paneDef.key as keyof PairsData];
          if (!data || !Array.isArray(data) || data.length === 0) continue;

          const paneId = nextPaneId++;
          const label = paneDef.label(tickerA, tickerB);
          newPanes.push({ id: paneId, label, ticker: tickerA });

          const seriesId = `pairs:${paneDef.key}:${tickerA}:${tickerB}:${nextSeriesSeq++}`;
          newSeries.push({
            id: seriesId,
            ticker: "PAIRS",
            metric: paneDef.key,
            color: getSeriesColor(newSeries.length),
            paneIndex: paneId,
            data: data as { time: string; value: number }[],
            visible: true,
            label,
          });

          if (paneDef.indicators) {
            newIndicatorsMap[paneId] = paneDef.indicators;
          }
        }

        setPanes(newPanes);
        setPlottedSeries(newSeries);
        setIsLoadingView(false);
        // Return indicators map so ChartArea can apply them
        return newIndicatorsMap;
      } catch (e) {
        console.error("Failed to load pairs preset", e);
      }
      setIsLoadingView(false);
      return undefined;
    },
    [activeTicker]
  );

  // Load a relative-value preset: builds per-metric A/B ratio series across panes
  const loadRelativeValuePreset = useCallback(
    async (preset: RelativeValuePresetDef, tickerB: string) => {
      if (!activeTicker) return;
      const tickerA = activeTicker;
      paneGeneration++;
      const myGeneration = paneGeneration;
      setIsLoadingView(true);
      setActiveView(preset.label);

      try {
        // Compute element-wise A/B ratios for each preset metric (mirrors getRelativeValueData)
        const metrics = preset.panes.map((p) => p.metric);
        const ratioByMetric: Record<string, { time: string; value: number }[]> = {};
        await Promise.all(
          metrics.map(async (metric) => {
            const [a, b] = await Promise.all([
              getMetricSeries(tickerA, metric),
              getMetricSeries(tickerB, metric),
            ]);
            const bMap = new Map<string, number>();
            for (const d of b) bMap.set(d.time, d.value);
            const out: { time: string; value: number }[] = [];
            for (const d of a) {
              const denom = bMap.get(d.time);
              if (denom !== undefined && denom !== 0 && isFinite(d.value) && isFinite(denom)) {
                out.push({ time: d.time, value: d.value / denom });
              }
            }
            ratioByMetric[metric] = out;
          })
        );

        // If a restore happened while we were fetching, abandon this load
        if (paneGeneration !== myGeneration) {
          setIsLoadingView(false);
          return;
        }
        nextPaneId = 1;
        const newPanes: PaneInfo[] = [];
        const newSeries: PlottedSeries[] = [];
        const newIndicatorsMap: Record<number, ActiveIndicators> = {};

        for (const paneDef of preset.panes) {
          const data = ratioByMetric[paneDef.metric];
          if (!data || data.length === 0) continue;

          const paneId = nextPaneId++;
          const label = paneDef.label(tickerA, tickerB);
          newPanes.push({ id: paneId, label, ticker: tickerA });

          const seriesId = `relval:${paneDef.metric}:${tickerA}:${tickerB}:${nextSeriesSeq++}`;
          newSeries.push({
            id: seriesId,
            ticker: "RELVAL",
            metric: paneDef.metric,
            color: getSeriesColor(newSeries.length),
            paneIndex: paneId,
            data,
            visible: true,
            label,
          });

          if (paneDef.indicators) {
            newIndicatorsMap[paneId] = paneDef.indicators;
          }
        }

        setPanes(newPanes);
        setPlottedSeries(newSeries);
        setIsLoadingView(false);
        return newIndicatorsMap;
      } catch (e) {
        console.error("Failed to load relative value preset", e);
      }
      setIsLoadingView(false);
      return undefined;
    },
    [activeTicker]
  );

  // ── Server-backed Custom Charts (persistent blank canvases) ──
  const [activeCustomChartId, setActiveCustomChartId] = useState<number | null>(null);
  const activeCustomChartIdRef = useRef<number | null>(null);
  activeCustomChartIdRef.current = activeCustomChartId;
  const [lastManualSaveAt, setLastManualSaveAt] = useState<number | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Suppress autosave until this timestamp (ms) — used right after a fresh load
  const autosaveSuppressUntilRef = useRef<number>(0);

  const AUTOSAVE_ENABLED_KEY = "reit-viz-custom-chart-autosave-enabled-v1";
  const [autoSaveEnabled, setAutoSaveEnabledState] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(AUTOSAVE_ENABLED_KEY);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  const autoSaveEnabledRef = useRef(autoSaveEnabled);
  autoSaveEnabledRef.current = autoSaveEnabled;

  const { data: savedCustomCharts = [] } = useQuery<SavedCustomChart[]>({
    queryKey: ["/api/custom-charts"],
  });

  const createCustomChartMut = useMutation({
    mutationFn: async (vars: { name: string; state: any }) => {
      const res = await apiRequest("POST", "/api/custom-charts", {
        name: vars.name,
        state: JSON.stringify(vars.state),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/custom-charts"] });
    },
  });

  const updateCustomChartMut = useMutation({
    mutationFn: async (vars: { id: number; state?: any; name?: string }) => {
      const body: any = {};
      if (vars.state !== undefined) body.state = JSON.stringify(vars.state);
      if (vars.name !== undefined) body.name = vars.name;
      const res = await apiRequest("POST", `/api/custom-charts/${vars.id}/update`, body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/custom-charts"] });
    },
  });

  const renameCustomChartMut = useMutation({
    mutationFn: async (vars: { id: number; name: string }) => {
      const res = await apiRequest("POST", `/api/custom-charts/${vars.id}/rename`, { name: vars.name });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/custom-charts"] });
    },
  });

  const deleteCustomChartMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/custom-charts/${id}/delete`, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/custom-charts"] });
    },
  });

  const setAutoSaveEnabled = useCallback((enabled: boolean) => {
    setAutoSaveEnabledState(enabled);
    try {
      localStorage.setItem(AUTOSAVE_ENABLED_KEY, enabled ? "1" : "0");
    } catch {}
    if (!enabled && autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  // Build the autosave snapshot from current refs
  const buildCustomChartSnapshot = useCallback(() => ({
    plottedSeries: plottedSeriesRef.current,
    panes: panesRef.current,
    activeTicker: activeTickerRef.current,
    chartConfig: chartConfigRef.current,
    layoutMode: layoutModeRef.current,
    indicatorsMap: indicatorsMapRef.current,
  }), []);

  // Debounced autosave: writes 2s after edits while a custom chart is active
  const scheduleCustomChartAutosave = useCallback(() => {
    if (!activeCustomChartIdRef.current || !autoSaveEnabledRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      const id = activeCustomChartIdRef.current;
      if (!id || Date.now() < autosaveSuppressUntilRef.current) return;
      updateCustomChartMut.mutate({ id, state: buildCustomChartSnapshot() });
    }, 2000);
  }, [updateCustomChartMut, buildCustomChartSnapshot]);

  // Trigger autosave whenever the chart contents change (while a chart is active)
  useEffect(() => {
    if (!activeCustomChartId) return;
    scheduleCustomChartAutosave();
  }, [plottedSeries, panes, activeTicker, chartConfig, layoutMode, indicatorsMap, activeCustomChartId, scheduleCustomChartAutosave]);

  // Create a new blank server-backed chart and make it active
  const handleNewChart = useCallback(async () => {
    paneGeneration++;
    nextPaneId = 1;
    setPanes([]);
    setPlottedSeries([]);
    setActiveTicker(null);
    setIndicatorsMap({});
    const name = `Chart ${savedCustomCharts.length + 1}`;
    try {
      const created = await createCustomChartMut.mutateAsync({
        name,
        state: { panes: [], plottedSeries: [], activeTicker: null, chartConfig, layoutMode, indicatorsMap: {} },
      });
      setActiveCustomChartId(created.id);
      setActiveView(`📌 ${created.name}`);
    } catch (e) {
      console.error("Failed to create custom chart", e);
      setActiveView("(Blank)");
    }
  }, [savedCustomCharts.length, chartConfig, layoutMode, createCustomChartMut]);

  // Save the current view as a brand-new server-backed chart
  const handleSaveCurrentAsNewChart = useCallback(async (name?: string) => {
    const chartName = (name && name.trim()) || `Chart ${savedCustomCharts.length + 1}`;
    try {
      const created = await createCustomChartMut.mutateAsync({
        name: chartName,
        state: buildCustomChartSnapshot(),
      });
      autosaveSuppressUntilRef.current = Date.now() + 3000;
      setActiveCustomChartId(created.id);
      setActiveView(`📌 ${created.name}`);
    } catch (e) {
      console.error("Failed to save current view as new chart", e);
    }
  }, [savedCustomCharts.length, createCustomChartMut, buildCustomChartSnapshot]);

  // Force-save the active custom chart immediately (bypasses autosave debounce)
  const handleManualSaveCustomChart = useCallback(async () => {
    const id = activeCustomChartIdRef.current;
    if (!id) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    try {
      await updateCustomChartMut.mutateAsync({ id, state: buildCustomChartSnapshot() });
      setLastManualSaveAt(Date.now());
    } catch (e) {
      console.error("Manual save failed", e);
    }
  }, [updateCustomChartMut, buildCustomChartSnapshot]);

  // Load a saved custom chart by id and make it active
  const handleLoadCustomChart = useCallback(async (id: number) => {
    let chart: SavedCustomChart | undefined = savedCustomCharts.find((c) => c.id === id);
    try {
      const res = await apiRequest("GET", `/api/custom-charts/${id}`);
      chart = await res.json();
    } catch {}
    if (!chart) return;
    paneGeneration++;
    autosaveSuppressUntilRef.current = Date.now() + 3500;
    setActiveCustomChartId(id);
    try {
      const state = typeof chart.state === "string" ? JSON.parse(chart.state) : (chart.state as any);
      if (state.panes) setPanes(state.panes);
      if (state.activeTicker) setActiveTicker(state.activeTicker);
      if (state.chartConfig) setChartConfig(state.chartConfig);
      if (state.layoutMode) setLayoutMode(state.layoutMode);
      if (state.indicatorsMap) setIndicatorsMap(state.indicatorsMap);
      if (state.plottedSeries) {
        setPlottedSeries(state.plottedSeries);
        refetchSeriesData(state.plottedSeries);
      }
      setActiveView(`📌 ${chart.name}`);
      const maxPaneId = (state.panes || []).reduce((m: number, p: any) => Math.max(m, p.id || 0), 0);
      nextPaneId = Math.max(nextPaneId, maxPaneId + 1);
    } catch (e) {
      console.error("Failed to load custom chart", e);
    }
  }, [savedCustomCharts, refetchSeriesData]);

  // Exit custom-chart mode, returning to the carousel default view
  const handleExitCustomChart = useCallback(() => {
    setActiveCustomChartId(null);
    const ticker = activeTicker || (tickerList.length > 0 ? tickerList[0].ticker : null);
    if (ticker) loadViewForTicker(ticker);
  }, [activeTicker, tickerList, loadViewForTicker]);

  // Navigate to next/prev ticker
  const navigateTicker = useCallback(
    (direction: "next" | "prev") => {
      if (!tickerList.length) return;
      if (currentTickerIndex < 0) {
        loadViewForTicker(tickerList[0].ticker);
        return;
      }
      const newIndex =
        direction === "next"
          ? (currentTickerIndex + 1) % tickerList.length
          : (currentTickerIndex - 1 + tickerList.length) % tickerList.length;
      loadViewForTicker(tickerList[newIndex].ticker);
    },
    [tickerList, currentTickerIndex, loadViewForTicker]
  );

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        navigateTicker("next");
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        navigateTicker("prev");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigateTicker]);

  // Pending ticker from URL (set before tickerList loads)
  const pendingTickerRef = useRef<string | null>(null);

  // Read ?ticker= from URL search params (from Ranking tab click-through)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("ticker");
    if (t) {
      pendingTickerRef.current = t;
      // Clean up URL param immediately
      const url = new URL(window.location.href);
      url.searchParams.delete("ticker");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  // Cross-page "go to symbol" navigation:
  //  - listen for the "reit-viz:goto-symbol" CustomEvent (detail.symbol)
  //  - drain a localStorage pending-symbol on mount (set before this page loaded)
  // Routes through the existing pending-ticker + loadViewForTicker flow so the
  // active view is actually loaded (the pending-ref effects below handle the
  // case where the ticker list has not loaded yet).
  useEffect(() => {
    const gotoSymbol = (sym: string) => {
      const t = sym.trim().toUpperCase();
      if (!t) return;
      if (tickerList.length > 0 && tickerList.some((tk) => tk.ticker === t)) {
        pendingTickerRef.current = null;
        loadViewForTicker(t);
      } else {
        pendingTickerRef.current = t;
      }
    };
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      gotoSymbol(((detail.symbol || "") as string).toString());
    };
    window.addEventListener("reit-viz:goto-symbol", handler);
    try {
      const stored = localStorage.getItem("reit-viz.dashboard.pending-symbol");
      if (stored) {
        localStorage.removeItem("reit-viz.dashboard.pending-symbol");
        gotoSymbol(stored);
      }
    } catch {}
    return () => window.removeEventListener("reit-viz:goto-symbol", handler);
  }, [tickerList, loadViewForTicker]);

  // Auto-load first ticker (or URL-specified ticker) with default view
  useEffect(() => {
    if (tickerList.length > 0 && !activeTicker && !isLoadingView) {
      const pending = pendingTickerRef.current;
      const startTicker = pending && tickerList.some((tk) => tk.ticker === pending)
        ? pending : tickerList[0].ticker;
      pendingTickerRef.current = null;
      loadViewForTicker(startTicker);
    }
  }, [tickerList, activeTicker, isLoadingView, loadViewForTicker]);

  // Handle ticker param arriving after initial load (e.g. navigating from Ranking while already on Charts)
  useEffect(() => {
    const pending = pendingTickerRef.current;
    if (pending && tickerList.length > 0 && tickerList.some((tk) => tk.ticker === pending)) {
      pendingTickerRef.current = null;
      loadViewForTicker(pending);
    }
  }, [tickerList, loadViewForTicker]);

  // Change preset view for current ticker
  const changeView = useCallback(
    (viewName: string) => {
      setActiveView(viewName);
      const ticker = activeTicker || (tickerList.length > 0 ? tickerList[0].ticker : null);
      if (ticker) {
        loadViewForTicker(ticker, viewName);
      }
    },
    [activeTicker, tickerList, loadViewForTicker]
  );

  // Add series with specific add mode
  const addSeriesWithMode = useCallback(
    (seriesList: PlottedSeries[], mode: "overlay" | "new-all" | "new-each", targetPaneId?: number) => {
      if (mode === "overlay" && targetPaneId !== undefined) {
        setPlottedSeries((prev) => {
          const next = [...prev];
          for (const s of seriesList) {
            if (!next.find((x) => x.id === s.id)) {
              next.push({ ...s, paneIndex: targetPaneId });
            }
          }
          return next;
        });
      } else if (mode === "new-all") {
        const paneId = nextPaneId++;
        const paneTicker = seriesList[0]?.ticker;
        setPanes((prev) => [...prev, { id: paneId, label: `Pane ${paneId}`, ticker: paneTicker }]);
        setPlottedSeries((prev) => {
          const next = [...prev];
          for (const s of seriesList) {
            if (!next.find((x) => x.id === s.id)) {
              next.push({ ...s, paneIndex: paneId });
            }
          }
          return next;
        });
      } else {
        const newPanes: PaneInfo[] = [];
        const newSeriesList: PlottedSeries[] = [];
        for (const s of seriesList) {
          const paneId = nextPaneId++;
          newPanes.push({ id: paneId, label: `${s.ticker} \u2014 ${s.metric}`, ticker: s.ticker });
          newSeriesList.push({ ...s, paneIndex: paneId });
        }
        setPanes((prev) => [...prev, ...newPanes]);
        setPlottedSeries((prev) => {
          const next = [...prev];
          for (const s of newSeriesList) {
            if (!next.find((x) => x.id === s.id)) {
              next.push(s);
            }
          }
          return next;
        });
      }
    },
    []
  );

  const removeSeries = useCallback((id: string) => {
    const gen = ++paneGeneration;
    setPlottedSeries((prev) => prev.filter((s) => s.id !== id));
    // Clean up orphan panes — but only if no newer operation has occurred
    setTimeout(() => {
      if (paneGeneration !== gen) return; // stale — a loadView or clearAll superseded us
      setPlottedSeries((currentSeries) => {
        const usedPanes = new Set(currentSeries.map((s) => s.paneIndex));
        setPanes((prevPanes) => prevPanes.filter((p) => usedPanes.has(p.id)));
        return currentSeries;
      });
    }, 50);
  }, []);

  // Clear All: wipe state then reload the default preset view
  const clearAllSeries = useCallback(() => {
    if (!activeTicker) return;
    const ticker = activeTicker;
    const view = activeView;
    // First, fully clear state so React sees a real change
    paneGeneration++;
    nextPaneId = 1;
    setPanes([]);
    setPlottedSeries([]);
    // Then reload after React flushes the empty state
    setTimeout(() => {
      loadViewForTicker(ticker, view);
    }, 0);
  }, [activeTicker, activeView, loadViewForTicker]);

  // Add a formula-computed series to a new or existing pane
  const addFormulaSeries = useCallback(
    (series: PlottedSeries, targetPaneId?: number) => {
      if (targetPaneId !== undefined) {
        // Overlay on existing pane
        setPlottedSeries((prev) => [
          ...prev,
          { ...series, paneIndex: targetPaneId },
        ]);
      } else {
        // New pane
        const paneId = nextPaneId++;
        setPanes((prev) => [...prev, { id: paneId, label: series.label, ticker: series.ticker }]);
        setPlottedSeries((prev) => [
          ...prev,
          { ...series, paneIndex: paneId },
        ]);
      }
    },
    []
  );

  const toggleSeriesVisibility = useCallback((id: string) => {
    setPlottedSeries((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
    );
  }, []);

  const updateSeries = useCallback((id: string, updates: Partial<Pick<PlottedSeries, "color" | "lineWidth" | "lineStyle">>) => {
    // Persist to module-level map so style survives component re-mounts
    const existing = seriesStyleOverrides.get(id) || {};
    seriesStyleOverrides.set(id, { ...existing, ...updates });
    setPlottedSeries((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  // When user selects ticker from sidebar, load the active view
  const handleSetActiveTicker = useCallback(
    (ticker: string | null) => {
      if (ticker) {
        loadViewForTicker(ticker);
      } else {
        setActiveTicker(null);
      }
    },
    [loadViewForTicker]
  );

  return (
    <div className="flex h-full w-full overflow-hidden" data-testid="dashboard">
      {sidebarOpen && (
        <Sidebar
          tickers={tickers}
          plottedSeries={plottedSeries}
          panes={panes}
          activeTicker={activeTicker}
          onSetActiveTicker={handleSetActiveTicker}
          onAddSeriesWithMode={addSeriesWithMode}
          onRemoveSeries={removeSeries}
          onRemovePane={removePane}
          onClearAll={clearAllSeries}
          onToggleVisibility={toggleSeriesVisibility}
          onUpdateSeries={updateSeries}
          onClose={() => setSidebarOpen(false)}
          chartConfig={chartConfig}
          onChartConfigChange={setChartConfig}
          onAddFormulaSeries={addFormulaSeries}
          forceOpenSection={forceOpenSection}
          onForceOpenHandled={() => setForceOpenSection(null)}
        />
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChartArea
          plottedSeries={plottedSeries}
          panes={panes}
          activeTicker={activeTicker}
          chartConfig={chartConfig}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          tickerList={tickerList}
          currentTickerIndex={currentTickerIndex}
          onNavigateTicker={navigateTicker}
          onSelectTicker={(ticker: string) => loadViewForTicker(ticker)}
          activeView={activeView}
          presetViews={Object.keys(PRESET_VIEWS)}
          viewGroups={[
            { label: "Preset Views", views: PRESET_VIEWS },
            { label: "Fundamentals", views: FUNDAMENTAL_VIEWS },
            { label: "Interview Prep", views: INTERVIEW_VIEWS },
          ].map((g) => ({ label: g.label, items: Object.keys(g.views) }))}
          fundamentalViews={Object.keys(FUNDAMENTAL_VIEWS)}
          interviewViews={Object.keys(INTERVIEW_VIEWS)}
          customChartViews={customChartViews}
          onChangeView={changeView}
          onSaveCustomView={(label, metrics) => saveChartViewMut.mutate({ label, metrics })}
          onDeleteCustomView={(id) => deleteChartViewMut.mutate(id)}
          isSavingView={saveChartViewMut.isPending}
          currentMetrics={plottedSeries.filter(s => s.visible).map(s => s.metric)}
          isLoadingView={isLoadingView}
          ohlcData={ohlcData}
          ohlcCache={ohlcCache}
          onOpenMacroOverlay={() => {
            setSidebarOpen(true);
            setForceOpenSection("macro");
          }}
          onAddFormulaSeries={addFormulaSeries}
          onCrosshairTimeChange={setCrosshairTime}
          pairsPresets={PAIRS_PRESETS}
          onLoadPairsPreset={loadPairsPreset}
          relativeValuePresets={RELATIVE_VALUE_PRESETS}
          onLoadRelativeValuePreset={loadRelativeValuePreset}
          onNewChart={handleNewChart}
          onSaveCurrentAsNewChart={handleSaveCurrentAsNewChart}
          onManualSaveCustomChart={handleManualSaveCustomChart}
          isSavingCustomChart={createCustomChartMut.isPending || updateCustomChartMut.isPending}
          lastManualSaveAt={lastManualSaveAt}
          autoSaveEnabled={autoSaveEnabled}
          onAutoSaveEnabledChange={setAutoSaveEnabled}
          savedCustomCharts={savedCustomCharts}
          activeCustomChartId={activeCustomChartId}
          onLoadCustomChart={handleLoadCustomChart}
          onRenameCustomChart={(id, name) => renameCustomChartMut.mutate({ id, name })}
          onDeleteCustomChart={(id) => {
            deleteCustomChartMut.mutate(id);
            if (activeCustomChartId === id) handleExitCustomChart();
          }}
          onExitCustomChart={handleExitCustomChart}
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          indicatorsMap={indicatorsMap}
          onIndicatorsMapChange={setIndicatorsMap}
          colorByMap={colorByMap}
          onColorByMapChange={setColorByMap}
          toolbarRight={
            <WorkspaceManager
              onSave={serializeState}
              onLoad={restoreState}
              activeWorkspaceId={activeWorkspaceId}
              onSetActiveWorkspaceId={setActiveWorkspaceId}
            />
          }
        />
        <DataTable plottedSeries={plottedSeries} crosshairTime={crosshairTime} />
      </div>
    </div>
  );
}
