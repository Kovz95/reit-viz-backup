// Reconstructed from recovered-bundle/PatternScreener-BVupFpw-.js on 2026-06-11
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { ClassificationFiltersWithSource } from "@/components/ClassificationFiltersWithSource";
import { emptyClassFilters, applyClassFilters, type ClassFilters } from "@/lib/dataService";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, ArrowUpDown, ChevronUp, ChevronDown, Loader2, ExternalLink } from "lucide-react";
import { S as SquareIcon } from "@/lib/square";
import { P as PlayIcon } from "@/lib/play";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { isBasketSymbol } from "@/lib/basketSymbol";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { useBaskets } from "@/lib/baskets";
import { computeBasketSeries } from "@/lib/fetchWorkbookData";
import { fetchWorkbookSeriesForTicker } from "@/lib/fetchWorkbookSeriesForTicker";
import { detectPatterns, getDefaultPatternOptions } from "@/lib/computeAutoTrendlines";
import { detectChannels, getDefaultChannelOptions } from "@/lib/computeAutoTrendlines";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PatternDef {
  id: string;
  label: string;
  dir: 1 | -1 | 0;
}

interface ChannelTypeDef {
  id: string;
  label: string;
}

interface ScreenerConfig {
  patternsEnabled: boolean;
  patternPivotLookback: number;
  patternMinR2: number;
  patternMinTouches: number;
  patternMinBars: number;
  patternMaxBars: number;
  patternLookbackBars: number;
  patternEnabled: Record<string, boolean>;
  channelsEnabled: boolean;
  channelMinR2: number;
  channelMinContainment: number;
  channelMinTouches: number;
  channelStdevMult: number;
  channelMaxChannels: number;
  channelLookbacks: number[];
  channelTypes: Record<string, boolean>;
  minConfidence: number;
  maxAgeBars: number;
  directionFilter: string;
}

interface ScreenerHit {
  kind: "pattern" | "channel";
  ticker: string;
  scope: string;
  type: string;
  label: string;
  direction: 1 | -1 | 0;
  confidence: number;
  r2: number;
  touches: number;
  startTime: string;
  endTime: string;
  ageBars: number;
}

interface ScreenerRow {
  ticker: string;
  scope: string;
  status: "pending" | "running" | "ok" | "skipped" | "error";
  hits: ScreenerHit[];
  best?: ScreenerHit;
  errorMsg?: string;
}

interface OHLCBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PATTERN_DEFS: PatternDef[] = [
  { id: "asc_triangle", label: "Asc Triangle", dir: 1 },
  { id: "desc_triangle", label: "Desc Triangle", dir: -1 },
  { id: "sym_triangle", label: "Sym Triangle", dir: 0 },
  { id: "rising_wedge", label: "Rising Wedge", dir: -1 },
  { id: "falling_wedge", label: "Falling Wedge", dir: 1 },
  { id: "bull_flag", label: "Bull Flag", dir: 1 },
  { id: "bear_flag", label: "Bear Flag", dir: -1 },
  { id: "rectangle", label: "Rectangle", dir: 0 },
  { id: "head_shoulders", label: "H&S", dir: -1 },
  { id: "inv_head_shoulders", label: "Inverse H&S", dir: 1 },
  { id: "double_top", label: "Double Top", dir: -1 },
  { id: "double_bottom", label: "Double Bottom", dir: 1 },
  { id: "triple_top", label: "Triple Top", dir: -1 },
  { id: "triple_bottom", label: "Triple Bottom", dir: 1 },
  { id: "cup_handle", label: "Cup & Handle", dir: 1 },
  { id: "inv_cup_handle", label: "Inv Cup & Handle", dir: -1 },
  { id: "rounding_top", label: "Rounding Top", dir: -1 },
  { id: "rounding_bottom", label: "Rounding Bottom", dir: 1 },
];

const CHANNEL_TYPES: ChannelTypeDef[] = [
  { id: "regression", label: "Regression" },
  { id: "parallel", label: "Parallel" },
  { id: "log-regression", label: "Log Regression" },
];

const CONFIG_STORAGE_KEY = "reit-viz.patternScreener.config.v1";

const DEFAULT_CONFIG: ScreenerConfig = {
  patternsEnabled: true,
  patternPivotLookback: 5,
  patternMinR2: 0.6,
  patternMinTouches: 4,
  patternMinBars: 15,
  patternMaxBars: 120,
  patternLookbackBars: 500,
  patternEnabled: Object.fromEntries(PATTERN_DEFS.map((p) => [p.id, true])),
  channelsEnabled: true,
  channelMinR2: 0.4,
  channelMinContainment: 0.9,
  channelMinTouches: 4,
  channelStdevMult: 2,
  channelMaxChannels: 4,
  channelLookbacks: [60, 120, 250, 500],
  channelTypes: { regression: true, parallel: true, "log-regression": false },
  minConfidence: 0.5,
  maxAgeBars: 20,
  directionFilter: "any",
};

// ---------------------------------------------------------------------------
// Config persistence helpers
// ---------------------------------------------------------------------------
function loadConfig(): ScreenerConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      patternEnabled: { ...DEFAULT_CONFIG.patternEnabled, ...(parsed?.patternEnabled || {}) },
      channelTypes: { ...DEFAULT_CONFIG.channelTypes, ...(parsed?.channelTypes || {}) },
      channelLookbacks:
        Array.isArray(parsed?.channelLookbacks) && parsed.channelLookbacks.length > 0
          ? parsed.channelLookbacks
          : DEFAULT_CONFIG.channelLookbacks,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config: ScreenerConfig) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

// ---------------------------------------------------------------------------
// Build pattern options from config
// ---------------------------------------------------------------------------
function buildPatternOptions(config: ScreenerConfig) {
  return {
    ...getDefaultPatternOptions(),
    pivotLookback: config.patternPivotLookback,
    minR2: config.patternMinR2,
    minTouches: config.patternMinTouches,
    minBars: config.patternMinBars,
    maxBars: config.patternMaxBars,
    lookbackBars: config.patternLookbackBars,
    enabled: { ...config.patternEnabled },
    maxPatterns: 12,
  };
}

function buildChannelOptions(config: ScreenerConfig) {
  const activeTypes = Object.keys(config.channelTypes).filter((k) => config.channelTypes[k]);
  return {
    ...getDefaultChannelOptions(),
    types: activeTypes.length > 0 ? activeTypes : ["regression"],
    stdevMult: config.channelStdevMult,
    minR2: config.channelMinR2,
    minContainment: config.channelMinContainment,
    minTouches: config.channelMinTouches,
    maxChannels: config.channelMaxChannels,
    lookbackBars: config.channelLookbacks,
  };
}

// ---------------------------------------------------------------------------
// Data converters
// ---------------------------------------------------------------------------
function ohlcToCloseSeries(bars: OHLCBar[]) {
  return bars.map((b) => ({ time: b.time, value: b.close }));
}

function ohlcToBars(bars: OHLCBar[]) {
  return bars.map((b) => ({ time: b.time, value: b.close, high: b.high, low: b.low }));
}

function filterFiniteValues(series: { time: string; value: number }[]) {
  return series.filter((p) => Number.isFinite(p.value)).map((p) => ({ time: p.time, value: p.value }));
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------
function getPatternLabel(id: string): string {
  return PATTERN_DEFS.find((p) => p.id === id)?.label ?? id;
}

function getDirectionLabel(dir: number): string {
  return dir === 1 ? "Bull" : dir === -1 ? "Bear" : "Neutral";
}

function directionTextClass(dir: number): string {
  return dir === 1 ? "text-emerald-400" : dir === -1 ? "text-rose-400" : "text-amber-300";
}

function matchesDirectionFilter(dir: number, filter: string): boolean {
  if (filter === "any") return true;
  if (filter === "bull") return dir === 1;
  if (filter === "bear") return dir === -1;
  return dir === 0;
}

// ---------------------------------------------------------------------------
// Main PatternScreener page
// ---------------------------------------------------------------------------
export default function PatternScreener() {
  const [, navigate] = useLocation();
  const [allTickers, setAllTickers] = useState<{ ticker: string }[]>([]);
  const [scope, setScope] = useState("universe");
  const [displayMode, setDisplayMode] = useState("latest");
  const [config, setConfig] = useState<ScreenerConfig>(() => loadConfig());
  const [singleTicker, setSingleTicker] = useState("");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const { baskets } = useBaskets();
  const [selectedBasketId, setSelectedBasketId] = useState("");

  const classFilterHook = useOptimizerClassFilter(allTickers as any[], scope === "universe", "ps-clf");
  const pairComboHook = usePairComboPicker(allTickers.map((t: { ticker: string }) => t.ticker), scope === "pairCombo", "ps-pc");

  // Classification-filter + manual-ticker state for the universe scope
  const [clfFilters, setClfFilters] = useState<ClassFilters>(() => emptyClassFilters());
  const [clfSearch, setClfSearch] = useState("");
  const [clfManualTickers, setClfManualTickers] = useState<Set<string>>(new Set());
  const universeFilteredTickers = useMemo(
    () => applyClassFilters(allTickers as any[], clfFilters, clfSearch, clfManualTickers),
    [allTickers, clfFilters, clfSearch, clfManualTickers]
  );

  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // Persist config
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  // Load tickers on mount
  useEffect(() => {
    fetchWorkbookTickers().then((tickers: Array<{ ticker: string }>) => {
      setAllTickers(tickers);
      if (tickers.length > 0) {
        setSingleTicker((prev) => prev || tickers[0].ticker);
        setPairTickerA((prev) => prev || tickers[0].ticker);
        setPairTickerB((prev) => prev || (tickers[1]?.ticker ?? tickers[0].ticker));
      }
    });
  }, []);

  // Auto-select basket
  useEffect(() => {
    if (!selectedBasketId && baskets.length > 0) {
      setSelectedBasketId(baskets[0].id);
    }
  }, [baskets, selectedBasketId]);

  // Build work items
  const workItems = useMemo(() => {
    if (scope === "single") {
      if (!singleTicker) return [];
      return [
        {
          key: singleTicker,
          label: singleTicker,
          loader: async () => {
            const bars = await fetchTickerOHLCV(singleTicker);
            return { ohlcLike: bars, series: ohlcToCloseSeries(bars), bars: ohlcToBars(bars) };
          },
        },
      ];
    }
    if (scope === "universe") {
      const tickers =
        universeFilteredTickers.length > 0
          ? universeFilteredTickers
          : allTickers;
      return tickers.map((t: { ticker: string }) => ({
        key: t.ticker,
        label: t.ticker,
        loader: async () => {
          const bars = await fetchTickerOHLCV(t.ticker);
          return { ohlcLike: bars, series: ohlcToCloseSeries(bars), bars: ohlcToBars(bars) };
        },
      }));
    }
    if (scope === "pair") {
      if (!pairTickerA || !pairTickerB) return [];
      const pairKey = `${pairTickerA}/${pairTickerB}`;
      return [
        {
          key: pairKey,
          label: pairKey,
          loader: async () => {
            const data = await getYahooPairsRatio(pairTickerA, pairTickerB, "close", "close");
            return {
              ohlcLike: null,
              series: filterFiniteValues(data.ratio),
              bars: filterFiniteValues(data.ratio),
            };
          },
        },
      ];
    }
    if (scope === "pairCombo") {
      return pairComboHook.pairs.map((pair: any) => ({
        key: pair.label,
        label: pair.label,
        loader: async () => {
          const data = await getYahooPairsRatio(pair.a, pair.b, "close", "close");
          return {
            ohlcLike: null,
            series: filterFiniteValues(data.ratio),
            bars: filterFiniteValues(data.ratio),
          };
        },
      }));
    }
    if (scope === "basket") {
      const basket = baskets.find((b: any) => b.id === selectedBasketId);
      if (!basket) return [];
      return [
        {
          key: `BASKET:${basket.name}`,
          label: `Basket: ${basket.name}`,
          loader: async () => {
            const series = await computeBasketSeries(basket, fetchWorkbookSeriesForTicker);
            return {
              ohlcLike: null,
              series: filterFiniteValues(series),
              bars: filterFiniteValues(series),
            };
          },
        },
      ];
    }
    return [];
  }, [scope, singleTicker, universeFilteredTickers, allTickers, pairTickerA, pairTickerB, pairComboHook.pairs, baskets, selectedBasketId]);

  const handleRun = useCallback(async () => {
    if (workItems.length === 0) {
      setErrorMessage("No items in the selected scope.");
      return;
    }
    setIsRunning(true);
    setErrorMessage(null);
    cancelRef.current = false;
    setRows(
      workItems.map((item: any) => ({
        ticker: item.key,
        scope: item.label,
        status: "pending",
        hits: [],
      }))
    );
    setProgress({ done: 0, total: workItems.length });

    const patternOpts = buildPatternOptions(config);
    const channelOpts = buildChannelOptions(config);
    const CONCURRENCY = 6;
    let idx = 0;

    async function processNext() {
      while (!cancelRef.current) {
        const i = idx++;
        if (i >= workItems.length) return;
        const item = workItems[i];

        setRows((prev) => {
          const next = prev.slice();
          if (next[i]) next[i] = { ...next[i], status: "running" };
          return next;
        });

        try {
          const { series, bars } = await item.loader();
          const minBars = Math.max(patternOpts.minBars, channelOpts.minBars);
          if (series.length < minBars) {
            setRows((prev) => {
              const next = prev.slice();
              if (next[i]) next[i] = { ...next[i], status: "skipped", errorMsg: "Too few bars" };
              return next;
            });
            return;
          }

          const hits: ScreenerHit[] = [];
          const lastIdx = series.length - 1;

          if (config.patternsEnabled) {
            try {
              const patterns = detectPatterns(series, patternOpts);
              for (const p of patterns) {
                hits.push({
                  kind: "pattern",
                  ticker: item.key,
                  scope: item.label,
                  type: p.type,
                  label: p.label || getPatternLabel(p.type),
                  direction: p.direction,
                  confidence: p.confidence,
                  r2: p.r2,
                  touches: p.touches,
                  startTime: p.startTime,
                  endTime: p.endTime,
                  ageBars: Math.max(0, lastIdx - p.endIndex),
                });
              }
            } catch {}
          }

          if (config.channelsEnabled) {
            try {
              const channels = detectChannels(bars, channelOpts);
              for (const ch of channels) {
                const dir: 1 | -1 | 0 =
                  ch.slope > 1e-4 ? 1 : ch.slope < -1e-4 ? -1 : 0;
                hits.push({
                  kind: "channel",
                  ticker: item.key,
                  scope: item.label,
                  type: ch.type,
                  label: ch.label,
                  direction: dir,
                  confidence: ch.score,
                  r2: ch.r2,
                  touches: 0,
                  startTime: String(bars[ch.startIdx]?.time ?? ""),
                  endTime: String(bars[ch.endIdx]?.time ?? ""),
                  ageBars: Math.max(0, lastIdx - ch.endIdx),
                });
              }
            } catch {}
          }

          hits.sort((a, b) => b.confidence - a.confidence);
          const best = hits.length > 0 ? hits[0] : undefined;

          setRows((prev) => {
            const next = prev.slice();
            if (next[i]) next[i] = { ...next[i], status: "ok", hits, best };
            return next;
          });
        } catch (err: any) {
          setRows((prev) => {
            const next = prev.slice();
            if (next[i]) next[i] = { ...next[i], status: "error", errorMsg: String(err?.message ?? err) };
            return next;
          });
        } finally {
          setProgress((prev) => ({ done: prev.done + 1, total: prev.total }));
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, workItems.length) }, () =>
      processNext()
    );
    await Promise.all(workers);
    setIsRunning(false);
  }, [workItems, config]);

  const handleStop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const filteredHits = useMemo(() => {
    const hits: ScreenerHit[] = [];
    for (const row of rows) {
      if (row.status !== "ok") continue;
      const rowHits = displayMode === "latest" ? (row.best ? [row.best] : []) : row.hits;
      for (const hit of rowHits) {
        if (hit.confidence < config.minConfidence) continue;
        if (config.maxAgeBars > 0 && hit.ageBars > config.maxAgeBars) continue;
        if (!matchesDirectionFilter(hit.direction, config.directionFilter)) continue;
        hits.push(hit);
      }
    }
    return hits;
  }, [rows, displayMode, config.minConfidence, config.maxAgeBars, config.directionFilter]);

  const [sortColumn, setSortColumn] = useState("confidence");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedHits = useMemo(() => {
    const list = filteredHits.slice();
    const multiplier = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let va: any, vb: any;
      switch (sortColumn) {
        case "ticker": va = a.ticker; vb = b.ticker; break;
        case "kind": va = a.kind; vb = b.kind; break;
        case "type": va = a.type; vb = b.type; break;
        case "direction": va = a.direction; vb = b.direction; break;
        case "confidence": va = a.confidence; vb = b.confidence; break;
        case "r2": va = a.r2; vb = b.r2; break;
        case "touches": va = a.touches; vb = b.touches; break;
        case "ageBars": va = a.ageBars; vb = b.ageBars; break;
        case "endTime": va = a.endTime; vb = b.endTime; break;
        default: va = 0; vb = 0;
      }
      return typeof va === "string" && typeof vb === "string"
        ? multiplier * va.localeCompare(vb)
        : multiplier * (va - vb);
    });
    return list;
  }, [filteredHits, sortColumn, sortDir]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDir("desc");
    }
  };

  const sortIcon = (col: string) => {
    if (sortColumn !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="inline w-3 h-3 ml-0.5" />
    ) : (
      <ChevronDown className="inline w-3 h-3 ml-0.5" />
    );
  };

  const stats = useMemo(() => {
    const ok = rows.filter((r) => r.status === "ok").length;
    const err = rows.filter((r) => r.status === "error").length;
    const sk = rows.filter((r) => r.status === "skipped").length;
    const totalHits = rows.reduce((s, r) => s + r.hits.length, 0);
    const filteredHitsCount = filteredHits.length;
    return { ok, err, sk, totalHits, filteredHits: filteredHitsCount };
  }, [rows, filteredHits]);

  const handleChartNavigate = (ticker: string) => {
    let sym = ticker;
    if (sym.includes("/")) sym = sym.split("/")[0];
    if (sym.startsWith("BASKET:")) { navigate("/"); return; }
    try {
      window.dispatchEvent(new CustomEvent("reit-viz:goto-symbol", { detail: { symbol: sym } }));
    } catch {}
    try {
      localStorage.setItem("reit-viz.dashboard.pending-symbol", sym);
    } catch {}
    navigate("/");
  };

  return (
    <div className="p-4 space-y-4" data-testid="page-pattern-screener">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h1 className="text-lg font-semibold">Pattern Screener</h1>
          <Badge variant="outline" className="text-[10px]">Patterns + Channels</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={displayMode} onValueChange={setDisplayMode}>
            <TabsList className="h-7">
              <TabsTrigger value="latest" className="text-xs px-3">Latest per ticker</TabsTrigger>
              <TabsTrigger value="all" className="text-xs px-3">All hits</TabsTrigger>
            </TabsList>
          </Tabs>
          {isRunning ? (
            <Button size="sm" variant="destructive" onClick={handleStop} data-testid="btn-stop">
              <SquareIcon className="w-3 h-3 mr-1" /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={handleRun} disabled={workItems.length === 0} data-testid="btn-run">
              <PlayIcon className="w-3 h-3 mr-1" /> Run ({workItems.length})
            </Button>
          )}
        </div>
      </div>

      {/* Scope tabs */}
      <Tabs value={scope} onValueChange={setScope}>
        <TabsList className="h-8">
          <TabsTrigger value="single" className="text-xs">Single</TabsTrigger>
          <TabsTrigger value="universe" className="text-xs">Universe</TabsTrigger>
          <TabsTrigger value="pair" className="text-xs">Pair</TabsTrigger>
          <TabsTrigger value="pairCombo" className="text-xs">Pair-Combo</TabsTrigger>
          <TabsTrigger value="basket" className="text-xs">Basket</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* Config panel */}
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-xs">Scope & Config</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            {/* Scope-specific inputs */}
            {scope === "single" && (
              <div className={isBasketSymbol(singleTicker) ? "opacity-40 pointer-events-none" : ""}>
                <UnifiedTickerPicker
                  tickers={allTickers}
                  value={isBasketSymbol(singleTicker) ? "" : singleTicker}
                  onChange={setSingleTicker}
                  disabled={isRunning}
                  label="Ticker"
                />
              </div>
            )}
            {scope === "universe" && (
              <div className="space-y-2">
                <Label className="text-xs">Universe filter</Label>
                <ClassificationFiltersWithSource
                  workbookTickers={allTickers}
                  filters={clfFilters}
                  onFiltersChange={setClfFilters}
                  search={clfSearch}
                  onSearchChange={setClfSearch}
                  manualTickers={clfManualTickers}
                  onManualTickersChange={setClfManualTickers}
                  filteredCount={universeFilteredTickers.length}
                  totalCount={allTickers.length}
                  testIdPrefix="ps-clf"
                />
                <div className="text-[11px] text-muted-foreground">
                  {universeFilteredTickers.length} tickers selected
                </div>
              </div>
            )}
            {scope === "pair" && (
              <div className="grid grid-cols-2 gap-2">
                <UnifiedTickerPicker tickers={allTickers} value={pairTickerA} onChange={setPairTickerA} disabled={isRunning} label="A" />
                <UnifiedTickerPicker tickers={allTickers} value={pairTickerB} onChange={setPairTickerB} disabled={isRunning} label="B" />
              </div>
            )}
            {scope === "pairCombo" && (
              <div className="space-y-2">
                {pairComboHook.ui}
                <div className="text-[11px] text-muted-foreground">
                  {pairComboHook.cappedPairCount} pairs{" "}
                  {pairComboHook.capped && <span className="text-amber-400">(capped)</span>}
                </div>
              </div>
            )}
            {scope === "basket" && (
              <div className="space-y-2">
                <Label className="text-xs">Basket</Label>
                <Select value={selectedBasketId} onValueChange={setSelectedBasketId} disabled={isRunning}>
                  <SelectTrigger className="h-7 text-xs" data-testid="select-basket">
                    <SelectValue placeholder="Pick a basket" />
                  </SelectTrigger>
                  <SelectContent>
                    {baskets.length === 0 && <SelectItem value="__none" disabled>(no baskets)</SelectItem>}
                    {baskets.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} · {b.tickers.length} tickers
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Pattern detection settings */}
            <div className="border-t border-border pt-3 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-2">
                    <Checkbox
                      checked={config.patternsEnabled}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, patternsEnabled: !!v }))}
                      data-testid="cb-patterns-enabled"
                    />
                    Detect Patterns
                  </Label>
                </div>
                {config.patternsEnabled && (
                  <>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Min R²</span>
                        <span>{config.patternMinR2.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[config.patternMinR2]}
                        min={0.2} max={0.95} step={0.05}
                        onValueChange={([v]) => setConfig((c) => ({ ...c, patternMinR2: v }))}
                        data-testid="sl-pat-r2"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Min touches</span>
                        <span>{config.patternMinTouches}</span>
                      </div>
                      <Slider
                        value={[config.patternMinTouches]}
                        min={2} max={10} step={1}
                        onValueChange={([v]) => setConfig((c) => ({ ...c, patternMinTouches: v }))}
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Pivot lookback</span>
                        <span>{config.patternPivotLookback}</span>
                      </div>
                      <Slider
                        value={[config.patternPivotLookback]}
                        min={2} max={12} step={1}
                        onValueChange={([v]) => setConfig((c) => ({ ...c, patternPivotLookback: v }))}
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Scan last N bars</span>
                        <span>{config.patternLookbackBars}</span>
                      </div>
                      <Slider
                        value={[config.patternLookbackBars]}
                        min={100} max={1500} step={50}
                        onValueChange={([v]) => setConfig((c) => ({ ...c, patternLookbackBars: v }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {PATTERN_DEFS.map((p) => (
                        <label key={p.id} className="flex items-center gap-1.5 text-[11px]">
                          <Checkbox
                            checked={config.patternEnabled[p.id]}
                            onCheckedChange={(v) =>
                              setConfig((c) => ({
                                ...c,
                                patternEnabled: { ...c.patternEnabled, [p.id]: !!v },
                              }))
                            }
                            data-testid={`cb-pat-${p.id}`}
                          />
                          <span className={directionTextClass(p.dir)}>{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Channel detection settings */}
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-2">
                    <Checkbox
                      checked={config.channelsEnabled}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, channelsEnabled: !!v }))}
                      data-testid="cb-channels-enabled"
                    />
                    Detect Channels
                  </Label>
                </div>
                {config.channelsEnabled && (
                  <>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Min R²</span>
                        <span>{config.channelMinR2.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[config.channelMinR2]}
                        min={0.2} max={0.95} step={0.05}
                        onValueChange={([v]) => setConfig((c) => ({ ...c, channelMinR2: v }))}
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Min containment</span>
                        <span>{(config.channelMinContainment * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={[config.channelMinContainment]}
                        min={0.5} max={1} step={0.05}
                        onValueChange={([v]) => setConfig((c) => ({ ...c, channelMinContainment: v }))}
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Bandwidth (σ)</span>
                        <span>{config.channelStdevMult.toFixed(1)}</span>
                      </div>
                      <Slider
                        value={[config.channelStdevMult]}
                        min={1} max={3.5} step={0.25}
                        onValueChange={([v]) => setConfig((c) => ({ ...c, channelStdevMult: v }))}
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Max per ticker</span>
                        <span>{config.channelMaxChannels}</span>
                      </div>
                      <Slider
                        value={[config.channelMaxChannels]}
                        min={1} max={8} step={1}
                        onValueChange={([v]) => setConfig((c) => ({ ...c, channelMaxChannels: v }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Channel types</Label>
                      {CHANNEL_TYPES.map((ct) => (
                        <label key={ct.id} className="flex items-center gap-1.5 text-[11px]">
                          <Checkbox
                            checked={config.channelTypes[ct.id]}
                            onCheckedChange={(v) =>
                              setConfig((c) => ({
                                ...c,
                                channelTypes: { ...c.channelTypes, [ct.id]: !!v },
                              }))
                            }
                          />
                          <span>{ct.label}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Result filters */}
              <div className="space-y-2 border-t border-border pt-3">
                <Label className="text-xs">Result Filters</Label>
                <div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Min confidence</span>
                    <span>{config.minConfidence.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[config.minConfidence]}
                    min={0} max={1} step={0.05}
                    onValueChange={([v]) => setConfig((c) => ({ ...c, minConfidence: v }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 items-center">
                  <Label className="text-[10px]">Max age (bars)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={config.maxAgeBars}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        maxAgeBars: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="h-7 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 items-center">
                  <Label className="text-[10px]">Direction</Label>
                  <Select
                    value={config.directionFilter}
                    onValueChange={(v) => setConfig((c) => ({ ...c, directionFilter: v }))}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="bull">Bullish only</SelectItem>
                      <SelectItem value="bear">Bearish only</SelectItem>
                      <SelectItem value="neutral">Neutral only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setConfig({ ...DEFAULT_CONFIG })}
              >
                Reset to defaults
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results panel */}
        <Card>
          <CardHeader className="py-2 px-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs">
              Results · {sortedHits.length} hit{sortedHits.length === 1 ? "" : "s"}
              {isRunning && (
                <span className="ml-2 text-muted-foreground">
                  <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />
                  {progress.done}/{progress.total}
                </span>
              )}
            </CardTitle>
            <div className="text-[11px] text-muted-foreground">
              {stats.ok} ok · {stats.sk} skipped · {stats.err} errors · {stats.totalHits} raw hits
              {stats.totalHits > 0 && stats.filteredHits < stats.totalHits && (
                <span className="ml-1 text-amber-400">
                  ({stats.totalHits - stats.filteredHits} filtered)
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {errorMessage && (
              <div className="px-3 py-2 text-xs text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {errorMessage}
              </div>
            )}
            <ScrollArea className="h-[68vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 cursor-pointer" onClick={() => handleSort("ticker")}>Scope{sortIcon("ticker")}</th>
                    <th className="px-2 py-1.5 cursor-pointer" onClick={() => handleSort("kind")}>Kind{sortIcon("kind")}</th>
                    <th className="px-2 py-1.5 cursor-pointer" onClick={() => handleSort("type")}>Type{sortIcon("type")}</th>
                    <th className="px-2 py-1.5 cursor-pointer" onClick={() => handleSort("direction")}>Dir{sortIcon("direction")}</th>
                    <th className="px-2 py-1.5 text-right cursor-pointer" onClick={() => handleSort("confidence")}>Conf{sortIcon("confidence")}</th>
                    <th className="px-2 py-1.5 text-right cursor-pointer" onClick={() => handleSort("r2")}>R²{sortIcon("r2")}</th>
                    <th className="px-2 py-1.5 text-right cursor-pointer" onClick={() => handleSort("touches")}>Touch{sortIcon("touches")}</th>
                    <th className="px-2 py-1.5 text-right cursor-pointer" onClick={() => handleSort("ageBars")}>Age{sortIcon("ageBars")}</th>
                    <th className="px-2 py-1.5 cursor-pointer" onClick={() => handleSort("endTime")}>End{sortIcon("endTime")}</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {sortedHits.length === 0 && !isRunning && (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                        {rows.length === 0
                          ? "Configure scope & press Run to scan."
                          : stats.totalHits > 0
                          ? `No hits match the current filters. ${stats.totalHits} raw hits were found — try lowering Min confidence, raising Max age, or switching Direction to Any.`
                          : "No patterns or channels detected. Try lowering Min R² / Min touches or widening the scan window."}
                      </td>
                    </tr>
                  )}
                  {sortedHits.map((hit, idx) => (
                    <tr
                      key={`${hit.ticker}-${hit.kind}-${hit.type}-${hit.startTime}-${idx}`}
                      className="border-t border-border/50 hover:bg-muted/30"
                    >
                      <td className="px-2 py-1.5 font-mono text-amber-300">{hit.scope}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          {hit.kind === "pattern" ? "Pattern" : "Channel"}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5">{hit.label}</td>
                      <td className={`px-2 py-1.5 font-semibold ${directionTextClass(hit.direction)}`}>
                        {getDirectionLabel(hit.direction)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {(hit.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{hit.r2.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{hit.touches || "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{hit.ageBars}</td>
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                        {hit.endTime?.slice(0, 10)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[10px]"
                          onClick={() => handleChartNavigate(hit.ticker)}
                        >
                          Chart <ExternalLink className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(stats.err > 0 || stats.sk > 0) && !isRunning && (
                <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground space-y-0.5">
                  {rows
                    .filter((r) => r.status === "error")
                    .slice(0, 10)
                    .map((r) => (
                      <div key={r.ticker} className="text-rose-400/80">
                        err · {r.ticker}: {r.errorMsg}
                      </div>
                    ))}
                  {rows
                    .filter((r) => r.status === "skipped")
                    .slice(0, 5)
                    .map((r) => (
                      <div key={r.ticker}>
                        skip · {r.ticker}: {r.errorMsg}
                      </div>
                    ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
