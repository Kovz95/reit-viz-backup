import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getCustomFundamentalMetrics } from "@/lib/dataService";
import { groupMetricsByCategory, DERIVED_METRICS } from "@/lib/metricCategories";
import { fetchMacroCatalog } from "@/lib/macroStatic";
import { fetchPairwiseCorrelation, fetchMatrixCorrelation } from "@/lib/correlationEngine";
import type { CorrFrequency, LegTransform } from "@/lib/correlationEngine";
import ChartPane from "@/components/ChartPane";
import type { ActiveIndicators } from "@/components/ChartPane";
import IndicatorsPanel from "@/components/IndicatorsPanel";
import type { PaneInfo, PlottedSeries } from "@/pages/Dashboard";
import { FilterDropdown, emptyClassFilters, serializeClassFilters, deserializeClassFilters, type ClassFilters } from "@/components/ClassificationFilters";
import { useGridProminence } from "@/lib/gridPref";
import { useUniverse } from "@/lib/universeContext";
import { useUniverseSignature } from "@/lib/universeSignature";
import { runDriverScan, driverScanToCsv, SCAN_WINDOWS } from "@/lib/driverScan";
import { runDislocationScan, dislocationScanToCsv } from "@/lib/correlationDislocationScan";
import type { DislocationScanResult, DislocationRow, ScanTF } from "@/lib/correlationDislocationScan";
import GridProminenceToggle from "@/components/GridProminenceToggle";
import GridLayoutPicker, { parseGrid } from "@/components/GridLayoutPicker";
import type { GridLayout } from "@/components/GridLayoutPicker";
import { useBaskets } from "@/lib/useBaskets";
import type { Basket } from "@/lib/useBaskets";
import { isAutoBasketId, groupAutoBaskets, AUTO_BASKET_GROUP_LABELS } from "@/lib/autoBaskets";
import type { IChartApi } from "lightweight-charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Check,
  Search,
  Download,
  Filter,
  Grid3X3,
  TrendingUp,
  BarChart3,
  Activity,
  Layers,
  Maximize2,
  Minimize2,
  Loader2,
  Play,
  Pin,
  Radar,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";
import ExportMenu from "@/components/ExportMenu";
import { useTableSort, SortHeader } from "@/lib/useTableSort";

// ── Types ──
interface TickerMeta {
  ticker: string;
  name: string;
  subindustry: string;
}

interface MacroSeriesMeta {
  id: string;
  label: string;
  category: string;
  unit: string;
  freq?: string;
}

interface PairwiseResult {
  summary: {
    correlation: number;
    spearmanCorrelation: number;
    rSquared: number;
    beta: number;
    alpha: number;
    observations: number;
    mode: string;
    autoCorrelationA: number;
    autoCorrelationB: number;
    effectiveN: number;
    tStat: number;
    pValue: number;
  };
  rolling: { time: string; value: number }[];
  rollingCI?: { time: string; upper: number; lower: number }[];
  rollingBeta?: { time: string; value: number }[];
  multiWindowRolling: Record<number, { time: string; value: number }[]>;
  crossCorrelation: { lag: number; value: number }[];
  acfA: { lag: number; value: number }[];
  acfB: { lag: number; value: number }[];
  pacfA?: { lag: number; value: number }[];
  pacfB?: { lag: number; value: number }[];
  scatter: { x: number; y: number; date: string }[];
  levelsA: { time: string; value: number }[];
  levelsB: { time: string; value: number }[];
  diagnostics?: {
    adfA?: { stat: number; pValue: number; lags: number; isStationary: boolean };
    adfB?: { stat: number; pValue: number; lags: number; isStationary: boolean };
    cointegration?: { stat: number; pValue: number; lags: number; isCointegrated: boolean } | null;
    fisherCI?: { lower: number; upper: number };
  };
  error?: string;
}

interface MatrixResult {
  labels: string[];
  matrix: number[][];
  pValues: number[][];
  observations: number;
  dateRange: { from: string; to: string };
  mode: string;
}

const STOCK_METRICS_BASE = [
  "close", "open", "high", "low",
  "EPS FY1", "EPS FY2", "EPS LTM",
  "FFO FY1", "FFO FY2", "FFO LTM",
  "AFFO FY1", "AFFO FY2", "AFFO LTM",
  "Dividend", "Dividend Yield",
  "P/E LTM", "P/E FY2",
  "EV/EBITDA LTM", "EV/EBITDA FY2",
  "P/FFO LTM", "P/FFO FY2",
  "P/AFFO LTM", "P/AFFO FY2",
  "FFO Yield LTM", "FFO Yield FY2",
  "AFFO Yield LTM", "AFFO Yield FY2",
  "FY1 FFO Growth", "FY2 FFO Growth",
  "FY1 AFFO Growth", "FY2 AFFO Growth",
  "FY1 EPS Growth", "FY2 EPS Growth",
  "EPS (Default)", "EPS FY1 (Default)", "EPS Growth (Default)", "EPS Growth FY1 (Default)",
  "Implied Cap Rate",
  "P/S LTM", "P/S FY2",
  "Enterprise Value",
  "EBITDA LTM", "EBITDA FY1", "EBITDA FY2",
  "Sales LTM", "Sales FY1", "Sales FY2",
  "Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M",
  "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
  "% off 52wk High", "% off 52wk Low",
  "Bull%", "Bear%",
];
const STOCK_METRICS_SET = new Set(STOCK_METRICS_BASE);

function formatSpec(spec: string): string {
  if (spec.startsWith("MACRO:")) return spec.replace("MACRO:", "");
  return spec;
}

const COLORS = {
  primary: "#0ea5e9",
  secondary: "#f59e0b",
  positive: "#22c55e",
  negative: "#ef4444",
  purple: "#a855f7",
  cyan: "#06b6d4",
  pink: "#ec4899",
  teal: "#14b8a6",
};

const MULTI_WINDOW_COLORS: Record<number, string> = {
  30: "#ec4899",
  60: "#0ea5e9",
  120: "#22c55e",
  252: "#f59e0b",
};

const CHART_KEYS = ["levels", "rolling", "rollingBeta", "tfDivergence", "scatter", "crossCorr", "acfA", "acfB"] as const;
const CHART_LABELS: Record<string, string> = {
  levels: "Levels",
  rolling: "Rolling Corr",
  rollingBeta: "Rolling Beta",
  tfDivergence: "TF Divergence",
  scatter: "Scatter",
  crossCorr: "Cross-Corr",
  acfA: "ACF / PACF (A)",
  acfB: "ACF / PACF (B)",
};
const GRID_LAYOUTS: readonly GridLayout[] = ["1x1", "2x1", "1x2", "2x2", "3x2", "2x3", "3x3", "4x4"];

// Stable pane ids for the lightweight-charts panes (drive the indicators panel).
const LWC_PANE_IDS: Record<string, number> = { levels: 1, rolling: 2, rollingBeta: 3 };

const CUSTOM_WINDOW_COLOR = "#a855f7";
const windowColor = (w: number) => MULTI_WINDOW_COLORS[w] ?? CUSTOM_WINDOW_COLOR;

// Classification chip fields for the Charts-style ticker picker.
const CLASS_FIELDS = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Ind. Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
] as const;

const CORR_FREQS: { value: CorrFrequency; label: string }[] = [
  { value: "hourly", label: "1H" },
  { value: "daily", label: "D" },
  { value: "weekly", label: "W" },
];

// Short tags for per-leg indicator transforms (RSI14(SPG:close) etc.)
const TRANSFORM_TAGS: Record<LegTransform["kind"], string> = {
  rsi: "RSI", sma: "SMA", ema: "EMA", roc: "ROC", zscore: "Z", vol: "VOL",
};
const TRANSFORM_KINDS: { value: LegTransform["kind"] | "none"; label: string; defaultPeriod: number }[] = [
  { value: "none", label: "None (raw series)", defaultPeriod: 14 },
  { value: "rsi", label: "RSI", defaultPeriod: 14 },
  { value: "sma", label: "SMA", defaultPeriod: 20 },
  { value: "ema", label: "EMA", defaultPeriod: 20 },
  { value: "roc", label: "ROC %", defaultPeriod: 20 },
  { value: "zscore", label: "Z-Score (rolling)", defaultPeriod: 60 },
  { value: "vol", label: "Realized Vol", defaultPeriod: 20 },
];

function legLabel(spec: string, t?: LegTransform | null): string {
  const base = formatSpec(spec);
  return t ? `${TRANSFORM_TAGS[t.kind]}${t.period}(${base})` : base;
}

function sanitizeTransform(raw: any): LegTransform | null {
  if (!raw || typeof raw !== "object") return null;
  const kinds = ["rsi", "sma", "ema", "roc", "zscore", "vol"];
  if (!kinds.includes(raw.kind)) return null;
  const period = parseInt(raw.period);
  if (!Number.isFinite(period) || period < 2 || period > 500) return null;
  return { kind: raw.kind, period };
}

// ── Helpers ──

function corrColor(val: number): string {
  if (val >= 0.7) return "#22c55e";
  if (val >= 0.3) return "#86efac";
  if (val >= -0.3) return "#94a3b8";
  if (val >= -0.7) return "#fca5a5";
  return "#ef4444";
}

function corrBgColor(val: number): string {
  const absVal = Math.abs(val);
  if (val > 0) return `rgba(34, 197, 94, ${absVal * 0.4})`;
  if (val < 0) return `rgba(239, 68, 68, ${absVal * 0.4})`;
  return "transparent";
}

/** Heatmap cell style: a real diverging gradient — saturation ramps hard with
 *  |ρ| (power curve so mid correlations already read), text flips to white on
 *  strong cells so nothing washes out. */
function heatCellStyle(val: number): { backgroundColor: string; color: string; fontWeight?: number } {
  const a = Math.min(1, 0.06 + Math.pow(Math.abs(val), 1.35) * 0.92);
  const backgroundColor = val >= 0
    ? `rgba(22, 163, 74, ${a})`
    : `rgba(220, 38, 38, ${a})`;
  if (a > 0.45) return { backgroundColor, color: "#ffffff", fontWeight: 700 };
  return { backgroundColor, color: corrColor(val) };
}

// ── Driver scan helpers ──
function driverCorrColor(v: number): string {
  if (v >= 0.7) return "#22c55e";
  if (v >= 0.5) return "#86efac";
  if (v >= 0.3) return "#f59e0b";
  if (v >= 0.15) return "#94a3b8";
  return "#475569";
}

function pValColor(p: number): string {
  if (p < 0.01) return "#22c55e";
  if (p < 0.05) return "#86efac";
  if (p < 0.1) return "#f59e0b";
  return "#ef4444";
}

function fmtSigned(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(3);
}

function fmtPval(p: number): string {
  return p < 0.001 ? "<0.001" : p.toFixed(3);
}

// ── Driver scan sparkline ──
function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length === 0) {
    return <span className="text-muted-foreground/30">—</span>;
  }
  const max = Math.max(...values, 0.01);
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * 56 + 2;
    const y = 18 - (v / max) * 16;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={60} height={20} className="inline-block align-middle">
      <polyline points={points.join(" ")} fill="none" stroke="#0ea5e9" strokeWidth="1.2" />
      {values.map((v, i) => {
        const x = (i / (values.length - 1 || 1)) * 56 + 2;
        const y = 18 - (v / max) * 16;
        return <circle key={i} cx={x} cy={y} r="1.5" fill={driverCorrColor(v)} />;
      })}
    </svg>
  );
}

// ── Driver scan progress bar ──
function ScanProgress({ done, total, phase }: { done: number; total: number; phase: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
        <span>{phase === "load" ? "Loading factor data" : "Scanning factors"}: {done} / {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-border/40 rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all duration-200 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Driver scan results table ──
function DriverScanResults({
  rows,
  ticker,
  showAll,
  onShowAll,
  onPin,
}: {
  rows: any[];
  ticker: string;
  showAll: boolean;
  onShowAll: () => void;
  onPin?: (row: any) => void;
}) {
  // Click-to-sort; "" keeps the incoming rank order until a header is clicked.
  const sort = useTableSort<any>("", "desc", "desc", "correlation-drivers");
  const sortedRows = sort.apply(rows, (r, key) => {
    switch (key) {
      case "label": return r.label;
      case "category": return r.category;
      case "bestAbsCorr": return r.bestAbsCorr;
      case "spearman": return r.spearman;
      case "bestWindow": return r.bestWindow;
      case "bestLag": return r.bestLag;
      case "stability": return r.stability;
      case "pVal": return r.pVal;
      default: return null;
    }
  });
  const display = showAll ? sortedRows : sortedRows.slice(0, 30);
  const thCls = "px-2 py-1.5 text-left text-[9px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap bg-card/50";
  return (
    <div data-testid="driver-scan-results" className="overflow-auto">
      <table className="text-[11px] font-mono w-full border-collapse">
        <thead>
          <tr className="border-b border-border/40">
            <th className={thCls}>#</th>
            <th className={thCls}><SortHeader label="Factor" columnKey="label" sort={sort} /></th>
            <th className={thCls}><SortHeader label="Category" columnKey="category" sort={sort} /></th>
            <th className={thCls}><SortHeader label="Best |ρ|" columnKey="bestAbsCorr" sort={sort} /></th>
            <th className={thCls}><SortHeader label="Spearman" columnKey="spearman" sort={sort} /></th>
            <th className={thCls}><SortHeader label="Window" columnKey="bestWindow" sort={sort} /></th>
            <th className={thCls}><SortHeader label="Lag" columnKey="bestLag" sort={sort} /></th>
            <th className={thCls}><SortHeader label="Stability" columnKey="stability" sort={sort} /></th>
            <th className={thCls}><SortHeader label="p-val" columnKey="pVal" sort={sort} /></th>
            <th className={thCls}>Sparkline</th>
            <th className={thCls}>Action</th>
          </tr>
        </thead>
        <tbody>
          {display.map((r, i) => (
            <tr key={r.spec} className="border-b border-border/20 hover:bg-accent/20 transition-colors" data-testid={`driver-row-${i}`}>
              <td className="px-2 py-1 text-muted-foreground/60">{r.rank}</td>
              <td className="px-2 py-1 max-w-[200px]">
                <span className="truncate block" title={r.label}>{r.label}</span>
                <span className="text-[9px] text-muted-foreground/50 block truncate" title={r.spec}>{r.spec}</span>
              </td>
              <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                <span className="text-[9px]">{r.category}</span>
              </td>
              <td className="px-2 py-1 font-bold whitespace-nowrap" style={{ color: driverCorrColor(r.bestAbsCorr) }}>
                {r.bestAbsCorr.toFixed(3)}
                <span className="text-[9px] text-muted-foreground/60 ml-0.5">({fmtSigned(r.bestCorr)})</span>
              </td>
              <td className="px-2 py-1 whitespace-nowrap" style={{ color: driverCorrColor(Math.abs(r.spearman)) }}>
                {fmtSigned(r.spearman)}
              </td>
              <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{r.bestWindow}d</td>
              <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                {r.bestLag === 0 ? "0" : r.bestLag > 0 ? `+${r.bestLag}d` : `${r.bestLag}d`}
              </td>
              <td className="px-2 py-1 whitespace-nowrap" style={{ color: driverCorrColor(r.stability) }}>{r.stability.toFixed(3)}</td>
              <td className="px-2 py-1 whitespace-nowrap" style={{ color: pValColor(r.pVal) }}>{fmtPval(r.pVal)}</td>
              <td className="px-2 py-1"><Sparkline values={r.windowCorrs} /></td>
              <td className="px-2 py-1">
                <button
                  data-testid={`driver-pin-${i}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] border border-border/40 rounded hover:bg-primary/20 hover:border-primary/50 transition-colors text-muted-foreground hover:text-primary"
                  title="Pin to Pairwise tab"
                  onClick={() => onPin?.(r)}
                >
                  <Pin className="w-2.5 h-2.5" />Pin
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!showAll && rows.length > 30 && (
        <div className="py-2 text-center">
          <button className="text-[10px] text-muted-foreground hover:text-foreground underline" onClick={onShowAll}>
            Show all {rows.length} factors
          </button>
        </div>
      )}
      {showAll && rows.length > 30 && (
        <div className="py-2 text-center">
          <button className="text-[10px] text-muted-foreground hover:text-foreground underline" onClick={onShowAll}>
            Show top 30 only
          </button>
        </div>
      )}
    </div>
  );
}

// ── Driver scan panel (main area) ──
function DriverScanPanel({ tickers, onPin }: { tickers: TickerMeta[]; onPin?: (specA: string, specB: string, window: number) => void }) {
  const [ticker, setTicker] = useState("SPG");
  const [tickerOpen, setTickerOpen] = useState(false);
  const [targetMode, setTargetMode] = useState("1d");
  const [includeMacro, setIncludeMacro] = useState(true);
  const [includeFund, setIncludeFund] = useState(true);
  const [minObs, setMinObs] = useState(60);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hasFund = getCustomFundamentalMetrics().length > 0;

  const runScan = useCallback(async () => {
    if (scanning) {
      abortRef.current?.abort();
      setScanning(false);
      return;
    }
    if (!ticker) return;
    setScanning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setShowAll(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await runDriverScan({
        ticker,
        targetMode,
        includeMacro,
        includeFund: includeFund && hasFund,
        minObs,
        signal: controller.signal,
        onProgress: (done: number, total: number, phase: string) => {
          setProgress({ done, total, phase });
        },
      });
      setResult(res);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message || "Scan failed");
    } finally {
      setScanning(false);
      setProgress(null);
      abortRef.current = null;
    }
  }, [ticker, targetMode, includeMacro, includeFund, hasFund, minObs, scanning]);

  const exportCSV = useCallback(() => {
    if (!result) return;
    const csv = driverScanToCsv(result);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `driver_scan_${result.ticker}_${result.targetMode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const handlePin = useCallback((row: any) => {
    let spec: string;
    if (row.spec.startsWith("MACRO:")) {
      spec = row.spec;
    } else if (row.spec.startsWith("FUND:")) {
      const m = row.spec.replace("FUND:", "");
      spec = `${ticker}:${m}`;
    } else {
      spec = row.spec;
    }
    onPin?.(`${ticker}:close`, spec, row.bestWindow);
  }, [ticker, onPin]);

  const targetModes = [
    { value: "price", label: "Price", testId: "driver-target-mode-price" },
    { value: "1d", label: "1d Ret", testId: "driver-target-mode-1d" },
    { value: "5d", label: "5d Ret", testId: "driver-target-mode-5d" },
    { value: "21d", label: "21d Ret", testId: "driver-target-mode-21d" },
    { value: "63d", label: "63d Ret", testId: "driver-target-mode-63d" },
  ];

  useMemo(() => tickers.find(t => t.ticker === ticker), [tickers, ticker]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b border-border/40 px-3 py-2 bg-card/30 flex flex-wrap items-end gap-3">
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Ticker</div>
          <Popover open={tickerOpen} onOpenChange={setTickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 w-[100px] justify-between px-2 text-[11px] font-mono" data-testid="driver-ticker-selector">
                <span>{ticker || "Pick…"}</span>
                <ChevronsUpDown className="w-3 h-3 opacity-50 flex-shrink-0 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[420px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search ticker…" className="h-7 text-[11px]" />
                <CommandList className="max-h-[200px]">
                  <CommandEmpty>No ticker found.</CommandEmpty>
                  <CommandGroup>
                    {tickers.map(t => (
                      <CommandItem key={t.ticker} value={`${t.ticker} ${t.name}`} onSelect={() => { setTicker(t.ticker); setTickerOpen(false); }} className="text-[11px]">
                        <Check className={`w-3 h-3 mr-1 flex-shrink-0 ${ticker === t.ticker ? "opacity-100" : "opacity-0"}`} />
                        <span className="font-mono font-bold mr-1 whitespace-nowrap">{t.ticker}</span>
                        <span className="text-muted-foreground flex-1 min-w-0 truncate text-[10px]" title={t.name}>{t.name}</span>
                      </CommandItem>
                    ))}
                    {ticker && !tickers.find(t => t.ticker === ticker) && (
                      <CommandItem value={ticker} onSelect={() => setTickerOpen(false)} className="text-[11px]">
                        <span className="font-mono font-bold text-amber-400">{ticker}</span>
                        <span className="text-muted-foreground ml-1 text-[10px]">(custom)</span>
                      </CommandItem>
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
              <div className="border-t border-border/30 p-1.5">
                <Input
                  className="h-6 text-[11px] font-mono"
                  placeholder="Type ticker (e.g. LMT)…"
                  value={ticker}
                  onChange={e => setTicker(e.target.value.toUpperCase().trim())}
                  onKeyDown={e => { if (e.key === "Enter") setTickerOpen(false); }}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-0.5">
          <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Target</div>
          <div className="flex gap-0.5">
            {targetModes.map(t => (
              <button
                key={t.value}
                data-testid={t.testId}
                onClick={() => setTargetMode(t.value)}
                className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${targetMode === t.value ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Include</div>
          <div className="flex gap-1">
            <button
              onClick={() => setIncludeMacro(v => !v)}
              className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${includeMacro ? "bg-sky-500/20 border-sky-500/50 text-sky-300" : "border-border/40 text-muted-foreground/50 hover:bg-accent"}`}
            >
              Macro
            </button>
            <button
              onClick={() => setIncludeFund(v => !v)}
              className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${includeFund ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" : "border-border/40 text-muted-foreground/50 hover:bg-accent"}`}
            >
              Fundamentals
            </button>
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Min Obs</div>
          <Input
            type="number"
            min={10}
            max={500}
            value={minObs}
            onChange={e => setMinObs(Math.max(10, parseInt(e.target.value) || 60))}
            className="h-7 w-[70px] text-[11px] font-mono px-2"
          />
        </div>

        <div className="flex gap-2 items-end">
          <Button size="sm" className="h-7 text-[11px] gap-1.5" onClick={runScan} data-testid="run-driver-scan" disabled={!ticker}>
            {scanning ? (
              <><X className="w-3 h-3" /> Cancel</>
            ) : (
              <><Play className="w-3 h-3" /> Run Driver Scan</>
            )}
          </Button>
          {result && (
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5" onClick={exportCSV}>
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          )}
        </div>

        {result && !scanning && (
          <div className="text-[10px] text-muted-foreground font-mono ml-auto">
            {result.rows.length} factors found · {result.totalFactors} scanned · {result.durationMs}ms
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3 min-h-0">
        {!hasFund && (
          <div className="border border-sky-500/30 bg-sky-500/5 rounded px-3 py-2 text-[11px] text-sky-400">
            Upload a fundamental workbook in the Sidebar to include fundamental/consensus factors in the scan.
          </div>
        )}
        {scanning && progress && <ScanProgress done={progress.done} total={progress.total} phase={progress.phase} />}
        {scanning && !progress && (
          <div className="text-[11px] text-muted-foreground font-mono animate-pulse">Initializing scan for {ticker}…</div>
        )}
        {error && (
          <div className="border border-red-500/40 bg-red-500/10 rounded px-3 py-2 text-[11px] text-red-400">{error}</div>
        )}
        {!scanning && !result && !error && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-center text-muted-foreground">
            <div className="text-[13px] font-semibold">Auto Driver Scan</div>
            <div className="text-[11px] max-w-xs">
              Pick a ticker, select a target (price level or N-day return), and click "Run Driver Scan" to discover which macro series and fundamental factors are most correlated with the stock — optimized over lookback window and lead/lag.
            </div>
          </div>
        )}
        {result && !scanning && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-[9px] text-muted-foreground font-mono">
              <span className="font-semibold">Sparkline windows:</span>
              {SCAN_WINDOWS.map((wd: number, i: number) => (
                <span key={wd}>
                  <span className="inline-block w-2 h-2 rounded-full mr-0.5 bg-sky-400/60" />
                  {wd}d {i < SCAN_WINDOWS.length - 1 ? "·" : ""}
                </span>
              ))}
              <span className="ml-auto">Lag: positive = factor leads stock; negative = stock leads factor</span>
            </div>
            <DriverScanResults
              rows={result.rows}
              ticker={result.ticker}
              showAll={showAll}
              onShowAll={() => setShowAll(v => !v)}
              onPin={handlePin}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cross-timeframe dislocation scanner panel ──
const TF_SHORT: Record<ScanTF, string> = { hourly: "1H", daily: "D", weekly: "W" };

function zColor(z: number): string {
  if (Math.abs(z) >= 2) return "#ef4444";
  if (Math.abs(z) >= 1.5) return "#f59e0b";
  if (Math.abs(z) >= 0.75) return "#eab308";
  return "#94a3b8";
}

function DislocationScanPanel({
  universeTickers,
  baskets,
  onPin,
}: {
  universeTickers: string[];
  baskets: Basket[];
  onPin: (a: string, b: string) => void;
}) {
  const [scope, setScope] = useState<"universe" | "basket">("universe");
  const [basketId, setBasketId] = useState("");
  const [mode, setMode] = useState<"crossTF" | "breakdown">("crossTF");
  const [window_, setWindow_] = useState("60");
  const [zTh, setZTh] = useState("1.5");
  const [anchorTh, setAnchorTh] = useState("0.75");
  const [minBase, setMinBase] = useState("0.3");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [result, setResult] = useState<DislocationScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const scopeTickers = useMemo(() => {
    if (scope === "basket") {
      const b = baskets.find((x) => x.id === basketId);
      return b ? b.tickers : [];
    }
    return universeTickers;
  }, [scope, basketId, baskets, universeTickers]);
  const pairCount = (scopeTickers.length * (scopeTickers.length - 1)) / 2;

  const runScan = useCallback(async () => {
    if (scanning) {
      abortRef.current?.abort();
      setScanning(false);
      return;
    }
    if (scopeTickers.length < 2) return;
    setScanning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setShowAll(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await runDislocationScan({
        tickers: scopeTickers,
        window: Math.max(20, Math.min(500, parseInt(window_) || 60)),
        zThreshold: Math.max(0.5, parseFloat(zTh) || 1.5),
        anchorThreshold: Math.max(0.1, parseFloat(anchorTh) || 0.75),
        minBaselineCorr: Math.max(0, Math.min(0.9, parseFloat(minBase) || 0.3)),
        mode,
        signal: controller.signal,
        onProgress: (done, total, phase) => setProgress({ done, total, phase }),
      });
      setResult(res);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e?.message || "Scan failed");
    } finally {
      setScanning(false);
      setProgress(null);
      abortRef.current = null;
    }
  }, [scanning, scopeTickers, window_, zTh, anchorTh, minBase]);

  const exportCSV = useCallback(() => {
    if (!result) return;
    const csv = dislocationScanToCsv(result);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `correlation_dislocations.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const sort = useTableSort<DislocationRow>("", "desc", "desc", "correlation-dislocations");
  const sortedRows = result
    ? sort.apply(result.rows, (r, key) => {
        switch (key) {
          case "pair": return `${r.a}/${r.b}`;
          case "histCorr": return r.histCorr;
          case "hZ": return r.tf.hourly?.z ?? -99;
          case "dZ": return r.tf.daily?.z ?? -99;
          case "wZ": return r.tf.weekly?.z ?? -99;
          case "zGap": return r.zGap;
          case "corrDelta": return r.corrDelta ?? 0;
          case "kind": return r.kind;
          case "spreadRet": return Math.abs(r.spreadRet);
          case "score": return r.score;
          default: return null;
        }
      })
    : [];
  const display = showAll ? sortedRows : sortedRows.slice(0, 50);
  const thCls = "px-2 py-1.5 text-left text-[9px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap bg-card/50";
  const tfCell = (st?: { last: number; z: number; pct: number }) => st ? (
    <div className="whitespace-nowrap">
      <span style={{ color: corrColor(st.last) }} className="font-bold">{st.last.toFixed(2)}</span>
      <span className="ml-1" style={{ color: zColor(st.z) }}>
        z{st.z >= 0 ? "+" : ""}{st.z.toFixed(1)}
      </span>
    </div>
  ) : <span className="text-muted-foreground/30">—</span>;

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="flex-shrink-0 border-b border-border/40 px-3 py-2 bg-card/30 flex flex-wrap items-end gap-3">
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Mode</div>
          <div className="flex gap-1">
            <button
              onClick={() => setMode("crossTF")}
              className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${mode === "crossTF" ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-accent"}`}
              data-testid="disloc-mode-crosstf"
              title="One timeframe broken while another stays in line (1H/D/W)"
            >
              Cross-TF
            </button>
            <button
              onClick={() => setMode("breakdown")}
              className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${mode === "breakdown" ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-accent"}`}
              data-testid="disloc-mode-breakdown"
              title="Typically-correlated pairs whose daily correlation collapsed and is still falling"
            >
              Breakdown
            </button>
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Scope</div>
          <div className="flex gap-1 items-center">
            <button
              onClick={() => setScope("universe")}
              className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${scope === "universe" ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-accent"}`}
              data-testid="disloc-scope-universe"
            >
              Universe ({universeTickers.length})
            </button>
            <button
              onClick={() => setScope("basket")}
              className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${scope === "basket" ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-accent"}`}
              data-testid="disloc-scope-basket"
            >
              Basket
            </button>
            {scope === "basket" && (
              <div className="w-[220px]">
                <BasketSelect baskets={baskets} value={basketId} onChange={setBasketId} />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Window (bars)</div>
          <Input type="number" min={20} max={500} value={window_} onChange={(e) => setWindow_(e.target.value)}
            className="h-7 w-[70px] text-[11px] font-mono px-2" data-testid="disloc-window" />
        </div>
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Disloc |z| ≥</div>
          <Input type="number" step="0.1" min={0.5} value={zTh} onChange={(e) => setZTh(e.target.value)}
            className="h-7 w-[60px] text-[11px] font-mono px-2" data-testid="disloc-zth" />
        </div>
        {mode === "crossTF" && (
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Anchor |z| ≤</div>
          <Input type="number" step="0.05" min={0.1} value={anchorTh} onChange={(e) => setAnchorTh(e.target.value)}
            className="h-7 w-[60px] text-[11px] font-mono px-2" data-testid="disloc-anchorth" />
        </div>
        )}
        <div className="space-y-0.5">
          <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">Min hist |ρ|</div>
          <Input type="number" step="0.05" min={0} max={0.9} value={minBase} onChange={(e) => setMinBase(e.target.value)}
            className="h-7 w-[60px] text-[11px] font-mono px-2" data-testid="disloc-minbase" />
        </div>

        <div className="flex gap-2 items-end">
          <Button size="sm" className="h-7 text-[11px] gap-1.5" onClick={runScan}
            disabled={!scanning && scopeTickers.length < 2} data-testid="run-disloc-scan">
            {scanning ? (<><X className="w-3 h-3" /> Cancel</>) : (<><Play className="w-3 h-3" /> Scan Dislocations</>)}
          </Button>
          {result && (
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5" onClick={exportCSV}>
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          )}
        </div>

        <div className="text-[10px] text-muted-foreground font-mono ml-auto">
          {result && !scanning
            ? `${result.rows.length} dislocations · ${result.scannedPairs.toLocaleString()} pairs · ${result.tickers} tickers · ${(result.durationMs / 1000).toFixed(1)}s`
            : `${pairCount.toLocaleString()} pairs in scope`}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-3 space-y-3 min-h-0">
        {scanning && progress && (
          <ScanProgress
            done={progress.done}
            total={progress.total}
            phase={progress.phase === "load" ? "load" : "scan"}
          />
        )}
        {scanning && !progress && (
          <div className="text-[11px] text-muted-foreground font-mono animate-pulse">Starting scan…</div>
        )}
        {error && (
          <div className="border border-red-500/40 bg-red-500/10 rounded px-3 py-2 text-[11px] text-red-400">{error}</div>
        )}
        {!scanning && !result && !error && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-center text-muted-foreground">
            <Radar className="w-8 h-8 opacity-30" />
            <div className="text-[13px] font-semibold">Cross-Timeframe Dislocation Scan</div>
            <div className="text-[11px] max-w-md leading-relaxed">
              Scans every pair in scope: rolling correlation on hourly / daily / weekly bars, each timeframe's
              current ρ z-scored against its own history. Flags pairs where one timeframe broke (|z| above the
              threshold) while another stayed in line — historically-correlated pairs that de-correlated on the
              hourly get a long-laggard / short-leader reconvergence framing.
            </div>
          </div>
        )}
        {result && !scanning && result.rows.length === 0 && (
          <div className="text-[11px] text-muted-foreground font-mono">
            No dislocations at these thresholds — loosen |z| or the min baseline correlation.
            {result.skipped.noHourly > 0 && ` (${result.skipped.noHourly} pairs lacked an intraday leg.)`}
          </div>
        )}
        {result && !scanning && result.rows.length > 0 && (
          <div className="space-y-2">
            <div className="text-[9px] text-muted-foreground font-mono">
              z = current rolling ρ vs that timeframe's own history · Gap = |z(dislocated) − z(anchor)| ·
              Spread = A−B cumulative return over the window on the dislocated timeframe
            </div>
            <div className="overflow-auto" data-testid="disloc-results">
              <table className="text-[11px] font-mono w-full border-collapse">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className={thCls}>#</th>
                    <th className={thCls}><SortHeader label="Pair" columnKey="pair" sort={sort} /></th>
                    <th className={thCls}><SortHeader label="Hist ρ (D)" columnKey="histCorr" sort={sort} /></th>
                    <th className={thCls}><SortHeader label="1H ρ · z" columnKey="hZ" sort={sort} /></th>
                    <th className={thCls}><SortHeader label="D ρ · z" columnKey="dZ" sort={sort} /></th>
                    <th className={thCls}><SortHeader label="W ρ · z" columnKey="wZ" sort={sort} /></th>
                    <th className={thCls}><SortHeader label="Gap" columnKey="zGap" sort={sort} /></th>
                    <th className={thCls}><SortHeader label="Δρ 20d" columnKey="corrDelta" sort={sort} /></th>
                    <th className={thCls}><SortHeader label="Type" columnKey="kind" sort={sort} /></th>
                    <th className={thCls}><SortHeader label="Spread" columnKey="spreadRet" sort={sort} /></th>
                    <th className={thCls}>Trade idea</th>
                    <th className={thCls}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {display.map((r, i) => (
                    <tr key={`${r.a}-${r.b}`} className="border-b border-border/20 hover:bg-accent/20 transition-colors" data-testid={`disloc-row-${i}`}>
                      <td className="px-2 py-1 text-muted-foreground/60">{r.rank}</td>
                      <td className="px-2 py-1 font-bold whitespace-nowrap">
                        {r.a} <span className="text-muted-foreground/50">×</span> {r.b}
                        <span className="ml-1.5 text-[9px] text-muted-foreground/60">{TF_SHORT[r.worstTF]} vs {TF_SHORT[r.anchorTF]}</span>
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap" style={{ color: corrColor(r.histCorr) }}>{r.histCorr.toFixed(2)}</td>
                      <td className="px-2 py-1">{tfCell(r.tf.hourly)}</td>
                      <td className="px-2 py-1">{tfCell(r.tf.daily)}</td>
                      <td className="px-2 py-1">{tfCell(r.tf.weekly)}</td>
                      <td className="px-2 py-1 font-bold" style={{ color: zColor(r.zGap) }}>{r.zGap.toFixed(1)}</td>
                      <td className="px-2 py-1 whitespace-nowrap" style={{ color: (r.corrDelta ?? 0) < -0.05 ? "#ef4444" : (r.corrDelta ?? 0) > 0.05 ? "#22c55e" : "#94a3b8" }}>
                        {r.corrDelta != null ? `${r.corrDelta >= 0 ? "+" : ""}${r.corrDelta.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                          style={r.kind === "decorrelated"
                            ? { color: "#f59e0b", backgroundColor: "#f59e0b22" }
                            : { color: "#38bdf8", backgroundColor: "#38bdf822" }}
                        >
                          {r.kind === "decorrelated" ? "DECOR" : "HYPER"}
                        </span>
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap" style={{ color: r.spreadRet >= 0 ? "#22c55e" : "#ef4444" }}>
                        {(r.spreadRet * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-1 max-w-[260px]">
                        <span className="truncate block" title={r.suggestion}>{r.suggestion}</span>
                      </td>
                      <td className="px-2 py-1">
                        <button
                          data-testid={`disloc-pin-${i}`}
                          className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] border border-border/40 rounded hover:bg-primary/20 hover:border-primary/50 transition-colors text-muted-foreground hover:text-primary"
                          title="Open this pair on the Pairwise tab (with TF Divergence)"
                          onClick={() => onPin(r.a, r.b)}
                        >
                          <Pin className="w-2.5 h-2.5" />Pair
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sortedRows.length > 50 && (
                <div className="py-2 text-center">
                  <button className="text-[10px] text-muted-foreground hover:text-foreground underline" onClick={() => setShowAll(v => !v)}>
                    {showAll ? "Show top 50 only" : `Show all ${sortedRows.length} dislocations`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── LWC pane rendered through the Charts-tab ChartPane (indicators, legend, crosshair) ──
function CorrLwcPane({
  paneId,
  label,
  series,
  indicators,
  intraday,
  spacerTimes,
  timeRange = "all",
  onMaximizeToggle,
  onChartReady,
  onChartDestroyed,
}: {
  paneId: number;
  label: string;
  series: PlottedSeries[];
  indicators: ActiveIndicators;
  intraday: boolean;
  spacerTimes?: (string | number)[] | null;
  timeRange?: string;
  onMaximizeToggle: () => void;
  onChartReady?: (paneId: number, chart: IChartApi) => void;
  onChartDestroyed?: (paneId: number) => void;
}) {
  const chartRef = useRef<IChartApi | null>(null);
  const [gridProminence] = useGridProminence();
  const chartConfig = useMemo(
    () => ({ chartType: "line" as const, showVolume: false, gridProminence }),
    [gridProminence]
  );
  const handleChartReady = useCallback((id: number, chart: IChartApi) => {
    chartRef.current = chart;
    onChartReady?.(id, chart);
  }, [onChartReady]);
  const handleChartDestroyed = useCallback((id: number) => {
    chartRef.current = null;
    onChartDestroyed?.(id);
  }, [onChartDestroyed]);
  return (
    <div
      className="relative w-full h-full min-w-0 min-h-0 overflow-hidden border border-border/30"
      onDoubleClick={onMaximizeToggle}
      data-testid={`corr-lwc-pane-${paneId}`}
    >
      <ChartPane
        paneId={paneId}
        paneLabel={label}
        series={series}
        ohlcData={null}
        activeTicker={null}
        chartConfig={chartConfig}
        intraday={intraday}
        spacerTimes={spacerTimes ?? null}
        activeIndicators={indicators}
        timeRange={timeRange}
        activeTool="none"
        drawColor="#f59e0b"
        onChartReady={handleChartReady}
        onChartDestroyed={handleChartDestroyed}
      />
      <div className="absolute top-1 right-2 z-10">
        <ExportMenu getChart={() => chartRef.current} label={`Correlation_${label}`} />
      </div>
    </div>
  );
}

// ── Charts-style basket picker: My Baskets + auto-basket groups, searchable ──
function BasketSelect({
  baskets,
  value,
  onChange,
  testId = "corr-basket-select",
}: {
  baskets: Basket[];
  value: string;
  onChange: (id: string) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const userBaskets = useMemo(() => baskets.filter((b) => !isAutoBasketId(b.id)), [baskets]);
  const autoGroups = useMemo(() => groupAutoBaskets(baskets.filter((b) => isAutoBasketId(b.id))), [baskets]);
  const selected = baskets.find((b) => b.id === value);

  const basketItem = (b: Basket) => (
    <CommandItem
      key={b.id}
      value={`${b.name} ${b.id}`}
      onSelect={() => { onChange(b.id); setOpen(false); }}
      className="text-xs"
    >
      <Check className={`w-3 h-3 mr-1.5 flex-shrink-0 ${value === b.id ? "opacity-100" : "opacity-0"}`} />
      <span className="whitespace-nowrap">{b.name}</span>
      <span className="ml-auto pl-3 text-[10px] text-muted-foreground/60 whitespace-nowrap">
        {b.tickers.length} ticker{b.tickers.length === 1 ? "" : "s"}
      </span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full h-7 justify-between px-2 text-[11px] font-mono" data-testid={testId}>
          <span className="truncate">{selected ? `${selected.name} (${selected.tickers.length})` : "Pick a basket…"}</span>
          <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[340px] max-w-[520px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search baskets..." className="h-8 text-xs" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No basket found.</CommandEmpty>
            <CommandGroup heading={`My Baskets (${userBaskets.length})`}>
              {userBaskets.map(basketItem)}
            </CommandGroup>
            {autoGroups.map(([groupKey, groupList]) => (
              <CommandGroup key={groupKey} heading={`${AUTO_BASKET_GROUP_LABELS[groupKey] ?? groupKey} (${groupList.length})`}>
                {groupList.map(basketItem)}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Cross-timeframe divergence panel ──
// Scores the CURRENT rolling correlation on each timeframe against that
// timeframe's own history (z-score + percentile), then flags mismatches —
// e.g. hourly stretched while daily/weekly sit inside their normal range.
interface TFEntry {
  key: CorrFrequency;
  label: string;
  loading: boolean;
  res?: PairwiseResult;
}

function tfStats(rolling: { time: string; value: number }[]) {
  const vals = rolling.map((d) => d.value).filter((v) => Number.isFinite(v));
  if (vals.length < 20) return null;
  const last = vals[vals.length - 1];
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length) || 1e-9;
  const z = (last - mean) / sd;
  const pct = (vals.filter((v) => v <= last).length / vals.length) * 100;
  return { last, mean, sd, z, pct, n: vals.length };
}

function tfStatus(z: number): { label: string; color: string } {
  if (Math.abs(z) >= 2) return { label: "EXTREME", color: "#ef4444" };
  if (Math.abs(z) >= 1) return { label: "STRETCHED", color: "#f59e0b" };
  return { label: "IN LINE", color: "#22c55e" };
}

function TFDivergenceContent({ entries, window }: { entries: TFEntry[]; window: number }) {
  const rows = entries.map((e) => {
    if (e.loading) return { ...e, state: "loading" as const };
    if (!e.res || e.res.error || !e.res.rolling?.length) {
      return { ...e, state: "unavailable" as const, reason: e.res?.error || "no data" };
    }
    const stats = tfStats(e.res.rolling);
    if (!stats) return { ...e, state: "unavailable" as const, reason: "history too short" };
    return { ...e, state: "ok" as const, stats };
  });

  // Mismatch verdicts: one TF stretched/extreme while another is in line.
  const ok = rows.filter((r): r is typeof r & { state: "ok"; stats: NonNullable<ReturnType<typeof tfStats>> } => r.state === "ok");
  const verdicts: string[] = [];
  for (const r of ok) {
    for (const other of ok) {
      if (r.key === other.key) continue;
      if (Math.abs(r.stats.z) >= 1.5 && Math.abs(other.stats.z) < 0.75) {
        verdicts.push(
          `${r.label} correlation is ${r.stats.z > 0 ? "unusually HIGH" : "unusually LOW"} vs its own history (z=${r.stats.z.toFixed(2)}, ${r.stats.pct.toFixed(0)}th pct) while ${other.label} is in line (z=${other.stats.z.toFixed(2)}) — ${r.label.toLowerCase()} looks out of whack.`
        );
      }
    }
  }
  const uniqueVerdicts = Array.from(new Set(verdicts));

  return (
    <div className="h-full overflow-auto p-2 space-y-2 text-[11px] font-mono">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
        Rolling ρ ({window} bars per timeframe) vs its own history
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border/40 text-[9px] uppercase text-muted-foreground">
            <th className="text-left py-1 pr-2">TF</th>
            <th className="text-right py-1 px-2">Current ρ</th>
            <th className="text-right py-1 px-2">Hist μ ± σ</th>
            <th className="text-right py-1 px-2">Z</th>
            <th className="text-right py-1 px-2">Pctile</th>
            <th className="text-right py-1 pl-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/20" data-testid={`tf-div-row-${r.key}`}>
              <td className="py-1.5 pr-2 font-bold">{r.label}</td>
              {r.state === "loading" ? (
                <td colSpan={5} className="py-1.5 px-2 text-muted-foreground animate-pulse">computing…</td>
              ) : r.state === "unavailable" ? (
                <td colSpan={5} className="py-1.5 px-2 text-muted-foreground/60 truncate" title={r.reason}>
                  unavailable — {r.reason}
                </td>
              ) : (
                <>
                  <td className="text-right py-1.5 px-2 font-bold" style={{ color: corrColor(r.stats!.last) }}>
                    {r.stats!.last.toFixed(3)}
                  </td>
                  <td className="text-right py-1.5 px-2 text-muted-foreground">
                    {r.stats!.mean.toFixed(2)} ± {r.stats!.sd.toFixed(2)}
                  </td>
                  <td className="text-right py-1.5 px-2 font-bold" style={{ color: tfStatus(r.stats!.z).color }}>
                    {r.stats!.z >= 0 ? "+" : ""}{r.stats!.z.toFixed(2)}
                  </td>
                  <td className="text-right py-1.5 px-2">{r.stats!.pct.toFixed(0)}%</td>
                  <td className="text-right py-1.5 pl-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ color: tfStatus(r.stats!.z).color, backgroundColor: `${tfStatus(r.stats!.z).color}22` }}
                    >
                      {tfStatus(r.stats!.z).label}
                    </span>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {uniqueVerdicts.length > 0 ? (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded p-2 space-y-1" data-testid="tf-div-verdicts">
          {uniqueVerdicts.map((v, i) => (
            <div key={i} className="text-amber-400 leading-snug">⚠ {v}</div>
          ))}
        </div>
      ) : ok.length >= 2 ? (
        <div className="text-muted-foreground" data-testid="tf-div-verdicts">
          ✓ All timeframes are in line with their own historical correlation patterns.
        </div>
      ) : null}
      <div className="text-[9px] text-muted-foreground/60 leading-snug">
        Each timeframe's current rolling correlation is scored against that timeframe's full history
        (z-score and percentile). A timeframe |z| ≥ 1.5 while another sits |z| &lt; 0.75 flags a
        cross-timeframe mismatch. Windows are in bars of each timeframe (hourly ≈ 60-min bars).
      </div>
    </div>
  );
}

// ── Correlation heatmap matrix ──
function HeatmapMatrix({
  matrix,
  labels,
  pValues,
  lagApplied,
}: {
  matrix: number[][];
  labels: string[];
  pValues: number[][];
  /** Lead/lag matrix: the diagonal is real data (autocorrelation), not 1. */
  lagApplied?: boolean;
}) {
  return (
    <div className="overflow-auto">
      <table className="text-[10px] font-mono border-collapse">
        <thead>
          <tr>
            <th className="p-1 border border-border/30 bg-card/50 sticky left-0 z-10" />
            {labels.map((l, i) => (
              <th key={i} className="p-1 border border-border/30 bg-card/50 text-muted-foreground whitespace-nowrap max-w-[80px] truncate" title={l}>
                {formatSpec(l)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="p-1 border border-border/30 bg-card/50 font-semibold text-muted-foreground whitespace-nowrap sticky left-0 z-10" title={labels[i]}>
                {formatSpec(labels[i])}
              </td>
              {row.map((val, j) => {
                const trivialDiag = i === j && !lagApplied;
                const cell = trivialDiag
                  ? { backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }
                  : heatCellStyle(val);
                return (
                  <td
                    key={j}
                    className="p-1 border border-border/30 text-center"
                    style={{ backgroundColor: cell.backgroundColor }}
                    title={`${formatSpec(labels[i])} × ${formatSpec(labels[j])}: ${val.toFixed(4)} (p=${pValues[i][j].toFixed(4)})${i === j && lagApplied ? " — autocorrelation at the applied lag" : ""}`}
                  >
                    <span style={{ color: cell.color, fontWeight: cell.fontWeight }}>
                      {trivialDiag ? "1.00" : val.toFixed(2)}
                    </span>
                    {!trivialDiag && pValues[i][j] > 0.05 && (
                      <span className="text-[8px] block" style={{ color: cell.fontWeight ? "rgba(255,255,255,0.65)" : "rgba(148,163,184,0.4)" }}>ns</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Strongest lag: max |value| among significant lags (|v| > 1.96/√n), else
// the overall max, flagged as not significant.
function strongestAcfLag(data: { lag: number; value: number }[], nObs: number) {
  if (data.length === 0 || nObs <= 0) return null;
  const sig = 1.96 / Math.sqrt(nObs);
  const pool = data.filter((d) => Math.abs(d.value) > sig);
  const from = pool.length ? pool : data;
  const best = from.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a));
  return { ...best, isSignificant: pool.length > 0 };
}

// ── ACF Bar Chart (canvas) ──
function ACFChart({
  data,
  nObs,
  title,
  height = 120,
  hideTitle,
}: {
  data: { lag: number; value: number }[];
  nObs: number;
  title: string;
  height?: number;
  hideTitle?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const strongest = useMemo(() => strongestAcfLag(data, nObs), [data, nObs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;
    const pad = { top: 10, bottom: 20, left: 35, right: 10 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // Auto-scale: returns-mode ACFs live in ±0.1 — a fixed ±1 axis hides them.
    const se = 1 / Math.sqrt(nObs);
    const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1.96 * se);
    const yMax = Math.min(1, Math.max(0.05, maxAbs * 1.25));
    const scaleY = (v: number) => (v / yMax) * (plotH / 2);

    // Draw zero line
    const yCenter = pad.top + plotH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, yCenter);
    ctx.lineTo(w - pad.right, yCenter);
    ctx.stroke();

    // Draw significance bands (95%)
    const sigUpper = yCenter - scaleY(1.96 * se);
    const sigLower = yCenter + scaleY(1.96 * se);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.3)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, sigUpper);
    ctx.lineTo(w - pad.right, sigUpper);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.left, sigLower);
    ctx.lineTo(w - pad.right, sigLower);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw bars (strongest lag highlighted)
    const barWidth = Math.max(2, plotW / data.length - 2);
    data.forEach((d, i) => {
      const x = pad.left + (i / data.length) * plotW + (plotW / data.length - barWidth) / 2;
      const barH = scaleY(d.value);
      const y = d.value >= 0 ? yCenter - barH : yCenter;
      ctx.fillStyle =
        strongest && d.lag === strongest.lag
          ? "#e879f9"
          : Math.abs(d.value) > 1.96 * se
            ? "#0ea5e9"
            : "rgba(14, 165, 233, 0.4)";
      ctx.fillRect(x, y, barWidth, Math.abs(barH));
    });

    // Y-axis labels
    ctx.fillStyle = "#7a8a9e";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    const yLabel = yMax >= 1 ? "1.0" : yMax.toFixed(2);
    ctx.fillText(yLabel, pad.left - 4, pad.top + 6);
    ctx.fillText("0", pad.left - 4, yCenter + 3);
    ctx.fillText(`-${yLabel}`, pad.left - 4, h - pad.bottom);

    // X-axis labels
    ctx.textAlign = "center";
    const xStep = data.length > 30 ? 10 : 5;
    for (let i = 0; i < data.length; i += xStep) {
      const x = pad.left + ((i + 0.5) / data.length) * plotW;
      ctx.fillText(String(data[i].lag), x, h - 4);
    }
  }, [data, nObs, height, strongest]);

  if (hideTitle) {
    return <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />;
  }
  return (
    <div className="border border-border/30">
      <div className="px-3 py-1 bg-card/50 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        {strongest && (
          <span className="text-[10px] font-mono" data-testid="acf-strongest">
            <span className="text-muted-foreground">strongest </span>
            <span style={{ color: "#e879f9" }}>
              lag {strongest.lag} ({strongest.value >= 0 ? "+" : ""}{strongest.value.toFixed(3)})
            </span>
            {!strongest.isSignificant && <span className="text-muted-foreground"> n.s.</span>}
          </span>
        )}
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />
    </div>
  );
}

// ── Cross-correlation Bar Chart (canvas) ──
function CrossCorrChart({
  data,
  labelA,
  labelB,
  height = 140,
  hideTitle,
  selectedLag,
  onSelectLag,
}: {
  data: { lag: number; value: number }[];
  labelA: string;
  labelB: string;
  height?: number;
  hideTitle?: boolean;
  /** Currently applied pairwise lag — highlighted on the profile. */
  selectedLag?: number | null;
  /** Click a bar to apply that lag to the whole pairwise analysis. */
  onSelectLag?: (lag: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelectLag || data.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pad = { left: 35, right: 10 };
    const plotW = rect.width - pad.left - pad.right;
    if (plotW <= 0) return;
    const idx = Math.max(0, Math.min(data.length - 1, Math.floor(((x - pad.left) / plotW) * data.length)));
    onSelectLag(data[idx].lag);
  }, [onSelectLag, data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;
    const pad = { top: 10, bottom: 22, left: 35, right: 10 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    const yCenter = pad.top + plotH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, yCenter);
    ctx.lineTo(w - pad.right, yCenter);
    ctx.stroke();

    // Vertical line at lag=0
    const lag0Idx = data.findIndex(d => d.lag === 0);
    if (lag0Idx >= 0) {
      const x0 = pad.left + ((lag0Idx + 0.5) / data.length) * plotW;
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.moveTo(x0, pad.top);
      ctx.lineTo(x0, h - pad.bottom);
      ctx.stroke();
    }

    const barWidth = Math.max(3, plotW / data.length - 1);
    data.forEach((d, i) => {
      const x = pad.left + (i / data.length) * plotW + (plotW / data.length - barWidth) / 2;
      const barH = d.value * (plotH / 2);
      const y = d.value >= 0 ? yCenter - barH : yCenter;
      ctx.fillStyle =
        selectedLag != null && selectedLag !== 0 && d.lag === selectedLag
          ? "#e879f9"
          : d.lag === 0
            ? "#f59e0b"
            : d.value >= 0 ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)";
      ctx.fillRect(x, y, barWidth, Math.abs(barH));
      // Outline the applied-lag bar so it reads even at small sizes
      if (selectedLag != null && selectedLag !== 0 && d.lag === selectedLag) {
        ctx.strokeStyle = "#e879f9";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 1, pad.top, barWidth + 2, plotH);
      }
    });

    // Labels
    ctx.fillStyle = "#7a8a9e";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("1.0", pad.left - 4, pad.top + 6);
    ctx.fillText("0", pad.left - 4, yCenter + 3);
    ctx.fillText("-1.0", pad.left - 4, h - pad.bottom);

    ctx.textAlign = "center";
    for (let i = 0; i < data.length; i += 5) {
      const x = pad.left + ((i + 0.5) / data.length) * plotW;
      ctx.fillText(String(data[i].lag), x, h - 4);
    }

    // Lag direction labels
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.fillText(`← ${labelA} leads`, pad.left + 2, h - pad.bottom + 14);
    ctx.textAlign = "right";
    ctx.fillText(`${labelB} leads →`, w - pad.right - 2, h - pad.bottom + 14);
  }, [data, labelA, labelB, height, selectedLag]);

  if (hideTitle) {
    return (
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height, cursor: onSelectLag ? "pointer" : undefined }}
        className="block"
        onClick={handleClick}
        title={onSelectLag ? "Click a bar to apply that lag to the analysis" : undefined}
        data-testid="crosscorr-canvas"
      />
    );
  }
  return (
    <div className="border border-border/30">
      <div className="px-3 py-1 bg-card/50">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Cross-Correlation (Lag {data[0]?.lag} to {data[data.length - 1]?.lag})
        </span>
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />
    </div>
  );
}

// ── Scatter canvas ──
function ScatterCanvas({
  data,
  labelX,
  labelY,
  beta,
  alpha,
  height = 250,
  hideTitle,
}: {
  data: { x: number; y: number; date: string }[];
  labelX: string;
  labelY: string;
  beta: number;
  alpha: number;
  height?: number;
  hideTitle?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;
    const pad = { top: 10, bottom: 30, left: 50, right: 10 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // Compute bounds
    const xs = data.map(d => d.x);
    const ys = data.map(d => d.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const xPad = xRange * 0.05;
    const yPad = yRange * 0.05;

    const toX = (v: number) => pad.left + ((v - xMin + xPad) / (xRange + 2 * xPad)) * plotW;
    const toY = (v: number) => pad.top + plotH - ((v - yMin + yPad) / (yRange + 2 * yPad)) * plotH;

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      const x = pad.left + (i / 4) * plotW;
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, h - pad.bottom); ctx.stroke();
    }

    // Zero lines
    if (xMin < 0 && xMax > 0) {
      const zx = toX(0);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(zx, pad.top); ctx.lineTo(zx, h - pad.bottom); ctx.stroke();
    }
    if (yMin < 0 && yMax > 0) {
      const zy = toY(0);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, zy); ctx.lineTo(w - pad.right, zy); ctx.stroke();
    }

    // Regression line
    const regX1 = xMin - xPad;
    const regX2 = xMax + xPad;
    const regY1 = alpha + beta * regX1;
    const regY2 = alpha + beta * regX2;
    ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(toX(regX1), toY(regY1));
    ctx.lineTo(toX(regX2), toY(regY2));
    ctx.stroke();
    ctx.setLineDash([]);

    // Points
    data.forEach(d => {
      ctx.beginPath();
      ctx.arc(toX(d.x), toY(d.y), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(14, 165, 233, 0.5)";
      ctx.fill();
    });

    // Axis labels
    ctx.fillStyle = "#7a8a9e";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(labelX, pad.left + plotW / 2, h - 4);
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const val = yMin - yPad + (yRange + 2 * yPad) * (1 - i / 4);
      ctx.fillText(val.toFixed(4), pad.left - 4, pad.top + (i / 4) * plotH + 3);
    }
  }, [data, beta, alpha, height, labelX, labelY]);

  if (hideTitle) {
    return <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />;
  }
  return (
    <div className="border border-border/30">
      <div className="px-3 py-1 bg-card/50">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Scatter: {labelY} vs {labelX}
        </span>
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", height }} className="block" />
    </div>
  );
}

// ── Chart maximize wrapper for canvas-based charts ──
function CanvasChartWrapper({
  title,
  children,
  chartId,
  isMaximized,
  onMaximize,
  height,
  headerRight,
}: {
  title: string;
  children: (h: number) => React.ReactNode;
  chartId: string;
  isMaximized: boolean;
  onMaximize: (id: string | null) => void;
  height: number;
  headerRight?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: height });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height: h } = entry.contentRect;
        if (h > 0) setSize({ w: Math.round(width), h: Math.round(h) });
      }
    });
    ro.observe(el);
    const h = el.clientHeight;
    if (h > 0) setSize({ w: Math.round(el.clientWidth), h });
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="border border-border/30 flex flex-col h-full min-h-0"
      onDoubleClick={(e) => {
        e.stopPropagation();
        onMaximize(isMaximized ? null : chartId);
      }}
    >
      <div className="flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {title}
        </span>
        <div className="flex-1" />
        {headerRight}
        <button
          className="text-muted-foreground/60 hover:text-muted-foreground p-0.5"
          onClick={(e) => { e.stopPropagation(); onMaximize(isMaximized ? null : chartId); }}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </button>
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden">
        {/* Key on measured size so canvas children redraw on any resize */}
        <div key={`${size.w}x${size.h}`}>{children(size.h)}</div>
      </div>
    </div>
  );
}

// ── Charts-style ticker picker: classification chip carousel + searchable list ──
function TickerClassSelect({
  value,
  onChange,
  tickers,
  testId,
}: {
  value: string;
  onChange: (ticker: string) => void;
  tickers: TickerMeta[];
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [classFilters, setClassFilters] = useState<ClassFilters>(() => emptyClassFilters());
  const [customTicker, setCustomTicker] = useState("");

  const classOptions = useMemo(() => {
    const opts: Record<string, Set<string>> = {};
    for (const f of CLASS_FIELDS) opts[f.key] = new Set();
    for (const t of tickers) {
      for (const f of CLASS_FIELDS) {
        const v = (t as any)[f.key];
        if (v) opts[f.key].add(v);
      }
    }
    const out: Record<string, string[]> = {};
    for (const f of CLASS_FIELDS) out[f.key] = [...opts[f.key]].sort();
    return out;
  }, [tickers]);

  const filteredTickers = useMemo(() => {
    let out = tickers;
    for (const f of CLASS_FIELDS) {
      const sel = classFilters[f.key];
      if (sel && sel.size > 0) out = out.filter((t) => sel.has((t as any)[f.key]));
    }
    return out;
  }, [tickers, classFilters]);

  const anyActive = Object.values(classFilters).some((s) => s.size > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full h-7 justify-between px-2 text-[11px] font-mono" data-testid={testId}>
          <span className="truncate">{value || "Select ticker"}</span>
          <span className="flex items-center gap-1 flex-shrink-0 ml-1">
            {anyActive && <Filter className="w-2.5 h-2.5 text-primary" />}
            <ChevronsUpDown className="w-3 h-3 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[340px] max-w-[560px] p-0" align="start">
        {/* Classification chips — same carousel filters as the Charts-tab ticker selector */}
        {(() => {
          const shownFields = CLASS_FIELDS.filter((f) => (classOptions[f.key]?.length ?? 0) > 1);
          if (shownFields.length === 0) return null;
          return (
            <div className="flex flex-wrap items-center gap-1 p-1.5 border-b border-border">
              {shownFields.map((f) => (
                <FilterDropdown
                  key={f.key}
                  label={f.label}
                  options={classOptions[f.key] || []}
                  selected={classFilters[f.key] || new Set()}
                  onChange={(next) => setClassFilters({ ...classFilters, [f.key]: next })}
                  testId={`${testId}-filter-${f.key}`}
                />
              ))}
              {anyActive && (
                <button
                  onClick={() => setClassFilters(emptyClassFilters())}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-muted-foreground hover:text-destructive"
                  data-testid={`${testId}-filter-clear`}
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
              {filteredTickers.map((t) => (
                <CommandItem
                  key={t.ticker}
                  value={`${t.ticker} ${t.name} ${t.subindustry ?? ""}`}
                  onSelect={() => { onChange(t.ticker); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={`w-3 h-3 mr-1.5 flex-shrink-0 ${value === t.ticker ? "opacity-100" : "opacity-0"}`} />
                  <span className="font-mono font-semibold mr-2">{t.ticker}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{t.name}</span>
                  {t.subindustry && (
                    <span className="ml-auto pl-3 text-[10px] text-muted-foreground/60 whitespace-nowrap">{t.subindustry}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t border-border/30 p-1.5">
          <Input
            className="h-6 text-[11px] font-mono"
            placeholder="Custom ticker (e.g. LMT) — press Enter"
            value={customTicker}
            onChange={(e) => setCustomTicker(e.target.value.toUpperCase().trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customTicker) {
                onChange(customTicker);
                setCustomTicker("");
                setOpen(false);
              }
            }}
            data-testid={`${testId}-custom`}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Searchable grouped metric picker (Command-based, wide, nothing truncated) ──
function MetricSelect({
  value,
  onChange,
  metricGroups,
  testId,
  triggerClass = "h-7",
}: {
  value: string;
  onChange: (m: string) => void;
  metricGroups: { category: string; metrics: string[] }[];
  testId: string;
  triggerClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const customMetrics = getCustomFundamentalMetrics();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`w-full ${triggerClass} justify-between px-2 text-[11px] font-mono`} data-testid={testId}>
          <span className="truncate">{value || "Select metric"}</span>
          <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-[340px] max-w-[520px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search metric..." className="h-8 text-xs" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No metric found.</CommandEmpty>
            {metricGroups.map(({ category, metrics }) => (
              <CommandGroup key={category} heading={category}>
                {metrics.map((m) => (
                  <CommandItem
                    key={m}
                    value={`${m} ${category}`}
                    onSelect={() => { onChange(m); setOpen(false); }}
                    className="text-xs"
                  >
                    <Check className={`w-3 h-3 mr-1.5 flex-shrink-0 ${value === m ? "opacity-100" : "opacity-0"}`} />
                    <span className="whitespace-nowrap">{m}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {customMetrics.length > 0 && (
              <CommandGroup heading="Uploaded Fundamental">
                {customMetrics.map((m) => (
                  <CommandItem
                    key={m}
                    value={`${m} uploaded`}
                    onSelect={() => { onChange(m); setOpen(false); }}
                    className="text-xs text-emerald-400"
                  >
                    <Check className={`w-3 h-3 mr-1.5 flex-shrink-0 ${value === m ? "opacity-100" : "opacity-0"}`} />
                    <span className="whitespace-nowrap">{m}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Inline transform picker (matrix/universe tabs — applies to every series) ──
function TransformControl({
  value,
  onChange,
  testId,
}: {
  value: LegTransform | null;
  onChange: (t: LegTransform | null) => void;
  testId: string;
}) {
  const kind = value?.kind ?? "none";
  return (
    <div className="flex items-center gap-1.5">
      <Select
        value={kind}
        onValueChange={(v) => {
          if (v === "none") { onChange(null); return; }
          const def = TRANSFORM_KINDS.find((k) => k.value === v)!;
          onChange({ kind: v as LegTransform["kind"], period: value && value.kind === v ? value.period : def.defaultPeriod });
        }}
      >
        <SelectTrigger className="h-6 text-[11px] flex-1" data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRANSFORM_KINDS.map((k) => (
            <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <>
          <Input
            type="number"
            min={2}
            max={500}
            value={String(value.period)}
            onChange={(e) => {
              const p = parseInt(e.target.value);
              if (Number.isFinite(p)) onChange({ ...value, period: Math.max(2, Math.min(500, p)) });
            }}
            className="h-6 w-[60px] text-[11px] font-mono px-1.5"
            data-testid={`${testId}-period`}
          />
          <span className="text-[9px] text-muted-foreground">bars</span>
        </>
      )}
    </div>
  );
}

// ── Inline lag picker (matrix/universe tabs) ──
function LagControl({
  value,
  onChange,
  testId,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
  hint: string;
}) {
  const num = Math.round(parseInt(value) || 0);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-[12px]"
          onClick={() => onChange(String(num - 1))} data-testid={`${testId}-dec`}>−</Button>
        <Input
          type="number"
          min={-250}
          max={250}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-[70px] text-[11px] font-mono px-1.5 text-center"
          data-testid={testId}
        />
        <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-[12px]"
          onClick={() => onChange(String(num + 1))} data-testid={`${testId}-inc`}>+</Button>
        {num !== 0 && (
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]"
            onClick={() => onChange("0")} data-testid={`${testId}-reset`}>reset</Button>
        )}
      </div>
      <div className="text-[9px] text-muted-foreground leading-snug">{hint}</div>
    </div>
  );
}

// ── Series Picker Component ──
function SeriesPicker({
  label,
  value,
  onChange,
  tickers,
  macroCatalog,
  testId,
  transform,
  onTransformChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tickers: TickerMeta[];
  macroCatalog: MacroSeriesMeta[];
  testId: string;
  /** Optional per-leg technical transform (RSI/SMA/… applied to the series). */
  transform?: LegTransform | null;
  onTransformChange?: (t: LegTransform | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"stock" | "macro">(
    value.startsWith("MACRO:") ? "macro" : "stock"
  );
  const [ticker, setTicker] = useState(() => {
    if (!value.startsWith("MACRO:")) {
      const parts = value.split(":");
      return parts[0] || "";
    }
    return "";
  });
  const [metric, setMetric] = useState(() => {
    if (value.startsWith("MACRO:")) return value.replace("MACRO:", "");
    const parts = value.split(":");
    return parts.slice(1).join(":") || "close";
  });
  const [tKind, setTKind] = useState<LegTransform["kind"] | "none">(transform?.kind ?? "none");
  const [tPeriod, setTPeriod] = useState(String(transform?.period ?? 14));

  const macroByCat = useMemo(() => {
    const map: Record<string, MacroSeriesMeta[]> = {};
    for (const s of macroCatalog) {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    }
    return map;
  }, [macroCatalog]);

  // Union curated metrics + the loaded universe's metrics + derived, grouped.
  const metricGroups = useMemo(() => {
    const s = new Set<string>([...STOCK_METRICS_BASE, ...DERIVED_METRICS]);
    for (const t of tickers) for (const m of ((t as any).metrics || [])) s.add(m);
    return groupMetricsByCategory([...s]);
  }, [tickers]);

  const handleApply = useCallback(() => {
    if (sourceType === "macro") {
      if (metric) onChange(`MACRO:${metric}`);
    } else {
      const resolvedMetric = (STOCK_METRICS_SET.has(metric) || tickers.some(t => ((t as any).metrics || []).includes(metric)) || getCustomFundamentalMetrics().includes(metric)) ? metric : "close";
      if (ticker) onChange(`${ticker}:${resolvedMetric}`);
    }
    if (onTransformChange) {
      const p = Math.max(2, Math.min(500, parseInt(tPeriod) || 14));
      onTransformChange(tKind === "none" ? null : { kind: tKind, period: p });
    }
    setOpen(false);
  }, [sourceType, ticker, metric, onChange, tickers, onTransformChange, tKind, tPeriod]);

  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">{label}</div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 justify-between px-2 text-[11px] font-mono"
            data-testid={testId}
          >
            <span className="truncate">{value ? legLabel(value, transform) : "Select series..."}</span>
            <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50 flex-shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[380px] p-2 space-y-2" align="start">
          {/* Source type toggle */}
          <div className="flex gap-1">
            <Button
              variant={sourceType === "stock" ? "default" : "secondary"}
              size="sm"
              className="flex-1 h-6 text-[10px]"
              onClick={() => { setSourceType("stock"); setMetric("close"); }}
            >
              <TrendingUp className="w-3 h-3 mr-1" /> Stock
            </Button>
            <Button
              variant={sourceType === "macro" ? "default" : "secondary"}
              size="sm"
              className="flex-1 h-6 text-[10px]"
              onClick={() => { setSourceType("macro"); setMetric(""); }}
            >
              <Activity className="w-3 h-3 mr-1" /> Macro
            </Button>
          </div>

          {sourceType === "stock" ? (
            <>
              {/* Ticker picker — Charts-style classification carousel + search */}
              <TickerClassSelect
                value={ticker}
                onChange={setTicker}
                tickers={tickers}
                testId={`${testId}-ticker`}
              />
              {/* Metric picker — searchable, grouped, wide */}
              <MetricSelect
                value={metric}
                onChange={setMetric}
                metricGroups={metricGroups}
                testId={`${testId}-metric`}
              />
            </>
          ) : (
            /* Macro series — searchable, grouped by category */
            <Command className="border border-border/40 rounded">
              <CommandInput placeholder="Search macro series..." className="h-8 text-xs" />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>No series found.</CommandEmpty>
                {Object.entries(macroByCat).map(([cat, items]) => (
                  <CommandGroup key={cat} heading={cat}>
                    {items.map((s) => (
                      <CommandItem
                        key={s.id}
                        value={`${s.label} ${s.id} ${cat}`}
                        onSelect={() => setMetric(s.id)}
                        className="text-xs"
                      >
                        <Check className={`w-3 h-3 mr-1.5 flex-shrink-0 ${metric === s.id ? "opacity-100" : "opacity-0"}`} />
                        <span className="whitespace-nowrap">{s.label}</span>
                        <span className="ml-auto pl-3 text-[9px] text-muted-foreground/50">{s.freq}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          )}

          {/* Per-leg technical transform — correlate RSI/SMA/… of the series */}
          {onTransformChange && (
            <div className="space-y-1 border-t border-border/30 pt-2">
              <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">
                Transform (indicator on this series)
              </div>
              <div className="flex items-center gap-1.5">
                <Select value={tKind} onValueChange={(v) => {
                  setTKind(v as any);
                  const def = TRANSFORM_KINDS.find((k) => k.value === v);
                  if (def && v !== "none") setTPeriod(String(def.defaultPeriod));
                }}>
                  <SelectTrigger className="h-6 text-[11px] flex-1" data-testid={`${testId}-transform`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSFORM_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tKind !== "none" && (
                  <>
                    <Input
                      type="number"
                      min={2}
                      max={500}
                      value={tPeriod}
                      onChange={(e) => setTPeriod(e.target.value)}
                      className="h-6 w-[60px] text-[11px] font-mono px-1.5"
                      data-testid={`${testId}-transform-period`}
                    />
                    <span className="text-[9px] text-muted-foreground">bars</span>
                  </>
                )}
              </div>
              {tKind !== "none" && (
                <div className="text-[9px] text-muted-foreground leading-snug">
                  Oscillator transforms (RSI, Z-Score) are usually studied in Levels or Simple Changes mode.
                </div>
              )}
            </div>
          )}

          <Button size="sm" className="w-full h-6 text-[10px]" onClick={handleApply} data-testid={`${testId}-apply`}>Apply</Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ── MAIN CORRELATION PAGE ──
// ═══════════════════════════════════════════════════════════════
const ROLLING_WINDOWS = [30, 60, 120, 252] as const;
const ROLLING_WINDOW_LABELS: Record<number, string> = {
  30: "30d",
  60: "60d",
  120: "120d",
  252: "252d (1Y)",
};

export default function Correlation() {
  const [activeTab, setActiveTab] = useState<"pairwise" | "matrix" | "drivers" | "dislocations">("pairwise");

  // Pairwise state
  const [specA, setSpecA] = useState("SPG:close");
  const [specB, setSpecB] = useState("MACRO:DGS10");
  const [corrMode, setCorrMode] = useState("returns");
  const [corrWindow, setCorrWindow] = useState("60");
  // Which rolling windows are visible (user can toggle)
  const [visibleWindows, setVisibleWindows] = useState<Set<number>>(new Set([60, 252]));
  // Which pairwise charts are visible (user can toggle)
  const [visibleCorrCharts, setVisibleCorrCharts] = useState<Set<string>>(() => new Set(CHART_KEYS));
  // Chart-area layout (mirrors the Charts tab): grid organization + panes shown at once
  const [corrLayout, setCorrLayout] = useState<GridLayout>("2x2");
  const [corrPanesVisible, setCorrPanesVisible] = useState<number | "all">(4);
  // Visible time window for the LWC panes (Charts parity): data stays loaded,
  // so anything tighter than Max leaves room to pan/scroll back through history.
  const [corrTimeRange, setCorrTimeRange] = useState("1Y");

  // ── Collapsible / drag-resizable sidebar ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("reit-viz:corr-sidebar-collapsed") === "1"; } catch { return false; }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const n = parseInt(localStorage.getItem("reit-viz:corr-sidebar-width") || "250", 10);
      return Math.max(200, Math.min(520, Number.isFinite(n) ? n : 250));
    } catch { return 250; }
  });
  useEffect(() => {
    try { localStorage.setItem("reit-viz:corr-sidebar-collapsed", sidebarCollapsed ? "1" : "0"); } catch {}
  }, [sidebarCollapsed]);
  useEffect(() => {
    try { localStorage.setItem("reit-viz:corr-sidebar-width", String(sidebarWidth)); } catch {}
  }, [sidebarWidth]);
  const startSidebarDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      setSidebarWidth(Math.max(200, Math.min(520, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [sidebarWidth]);
  // Bar frequency for the pairwise analysis (hourly / daily / weekly)
  const [corrFreq, setCorrFreq] = useState<CorrFrequency>("daily");
  // Custom rolling window (bars) alongside the 30/60/120/252 presets
  const [customWindow, setCustomWindow] = useState("90");
  const [customWindowOn, setCustomWindowOn] = useState(false);
  // Lag in bars: correlate A(t) with B(t − lag); same series + lag = autocorrelation
  const [corrLag, setCorrLag] = useState("0");
  // Optional per-leg technical transforms (RSI/SMA/… of the chosen series)
  const [corrTransformA, setCorrTransformA] = useState<LegTransform | null>(null);
  const [corrTransformB, setCorrTransformB] = useState<LegTransform | null>(null);
  const corrLagNum = Math.max(-500, Math.min(500, Math.round(parseInt(corrLag) || 0)));
  const legKey = JSON.stringify({ l: corrLagNum, a: corrTransformA, b: corrTransformB });
  // Per-pane indicator state for the LWC panes (Charts-tab indicators panel)
  const [indicatorsMap, setIndicatorsMap] = useState<Record<number, ActiveIndicators>>({});

  const customWindowNum = parseInt(customWindow) || 0;
  const customValid = customWindowOn && customWindowNum >= 5 && customWindowNum <= 2520;

  const toggleCorrChart = useCallback((key: string) => {
    setVisibleCorrCharts(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Matrix state
  const [matrixSpecs, setMatrixSpecs] = useState<string[]>([
    "SPG:close", "O:close", "PLD:close", "PSA:close", "MACRO:DGS10", "MACRO:VIXCLS",
  ]);
  const [newMatrixSpec, setNewMatrixSpec] = useState("");

  const toggleWindow = useCallback((w: number) => {
    setVisibleWindows(prev => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  }, []);

  // Universe matrix state
  const { universeTickers, isFiltered, filteredCount, totalCount, filteredTickersList, nationOf, exchangeOf } = useUniverse();
  const [uniMode, setUniMode] = useState("returns");
  const [uniWindow, setUniWindow] = useState("252");
  const [uniCustomWindow, setUniCustomWindow] = useState("180");
  const [uniMetric, setUniMetric] = useState("close");
  // Scope for the merged Matrix tab: the (filtered) universe, a basket's
  // members, or a hand-picked custom spec list (the old Matrix tab).
  const [uniScope, setUniScope] = useState<"universe" | "basket" | "custom">("universe");
  // Global transform + lead/lag for the Universe matrix
  const [uniTransform, setUniTransform] = useState<LegTransform | null>(null);
  const [uniLag, setUniLag] = useState("0");
  const uniLagNum = Math.max(-250, Math.min(250, Math.round(parseInt(uniLag) || 0)));
  // Local scope filters for the Universe correlation tab (classification + geo)
  const [uniClassFilters, setUniClassFilters] = useState<ClassFilters>(() => emptyClassFilters());
  const [uniNations, setUniNations] = useState<Set<string>>(new Set());
  const [uniExchanges, setUniExchanges] = useState<Set<string>>(new Set());

  // Effective lookback (supports the "custom" option)
  const uniWindowEff = uniWindow === "custom"
    ? String(Math.max(20, Math.min(5000, parseInt(uniCustomWindow) || 252)))
    : uniWindow;
  // Basket matrix tab (shares metric/mode/lookback with the universe tab)
  const { baskets } = useBaskets();
  const [corrBasketId, setCorrBasketId] = useState("");

  const serializeCorrelation = useCallback(() => ({
    activeTab,
    specA,
    specB,
    corrMode,
    corrWindow,
    matrixSpecs,
    visibleWindows: Array.from(visibleWindows),
    visibleCorrCharts: Array.from(visibleCorrCharts),
    corrLayout,
    corrPanesVisible,
    corrTimeRange,
    corrFreq,
    customWindow,
    customWindowOn,
    corrLag,
    corrTransformA,
    corrTransformB,
    corrIndicators: indicatorsMap,
    uniMode,
    uniWindow,
    uniCustomWindow,
    uniMetric,
    uniScope,
    uniTransform,
    uniLag,
    uniClassFilters: serializeClassFilters(uniClassFilters),
    uniNations: Array.from(uniNations),
    uniExchanges: Array.from(uniExchanges),
    corrBasketId,
  }), [activeTab, specA, specB, corrMode, corrWindow, matrixSpecs, visibleWindows, visibleCorrCharts, corrLayout, corrPanesVisible, corrTimeRange, corrFreq, customWindow, customWindowOn, corrLag, corrTransformA, corrTransformB, indicatorsMap, uniMode, uniWindow, uniCustomWindow, uniMetric, uniScope, uniTransform, uniLag, uniClassFilters, uniNations, uniExchanges, corrBasketId]);

  const pinFromDriver = useCallback((a: string, b: string, window: number) => {
    setSpecA(a);
    setSpecB(b);
    setCorrWindow(String(window));
    setActiveTab("pairwise");
  }, []);

  // Open a scanned dislocation pair on the Pairwise tab with the TF Divergence panel up.
  const pinFromDisloc = useCallback((a: string, b: string) => {
    setSpecA(`${a}:close`);
    setSpecB(`${b}:close`);
    setVisibleCorrCharts(prev => {
      const next = new Set(prev);
      next.add("levels");
      next.add("rolling");
      next.add("tfDivergence");
      return next;
    });
    setActiveTab("pairwise");
  }, []);

  const restoreCorrelation = useCallback((state: any) => {
    if (state.activeTab !== undefined) {
      // Old Universe/Basket/Matrix tabs all merged into ONE Matrix tab with a
      // scope selector; map legacy saves onto it.
      if (state.activeTab === "basket") {
        setActiveTab("matrix");
        setUniScope("basket");
      } else if (state.activeTab === "universe") {
        setActiveTab("matrix");
        if (state.uniScope === undefined) setUniScope("universe");
      } else if (state.activeTab === "matrix") {
        setActiveTab("matrix");
        if (state.uniScope === undefined) setUniScope("custom");
      } else {
        setActiveTab(state.activeTab);
      }
    }
    if (state.specA !== undefined) setSpecA(state.specA);
    if (state.specB !== undefined) setSpecB(state.specB);
    if (state.corrMode !== undefined) setCorrMode(state.corrMode);
    if (state.corrWindow !== undefined) setCorrWindow(state.corrWindow);
    if (state.matrixSpecs !== undefined) setMatrixSpecs(state.matrixSpecs);
    if (state.visibleWindows !== undefined) setVisibleWindows(new Set(state.visibleWindows));
    if (Array.isArray(state.visibleCorrCharts)) {
      // Legacy saves used a single "acf" key for both ACF panels
      const raw = state.visibleCorrCharts.flatMap((c: any) => (c === "acf" ? ["acfA", "acfB"] : [c]));
      const valid = raw.filter((c: any) => typeof c === "string" && (CHART_KEYS as readonly string[]).includes(c));
      setVisibleCorrCharts(new Set(valid));
    }
    if (typeof state.corrLayout === "string" && GRID_LAYOUTS.includes(state.corrLayout as GridLayout)) {
      setCorrLayout(state.corrLayout as GridLayout);
    }
    if (state.corrPanesVisible === "all" || (typeof state.corrPanesVisible === "number" && state.corrPanesVisible >= 1)) {
      setCorrPanesVisible(state.corrPanesVisible);
    }
    if (state.corrFreq === "hourly" || state.corrFreq === "daily" || state.corrFreq === "weekly") {
      setCorrFreq(state.corrFreq);
    }
    if (["1Y", "3Y", "5Y", "YTD", "all"].includes(state.corrTimeRange)) setCorrTimeRange(state.corrTimeRange);
    if (typeof state.customWindow === "string") setCustomWindow(state.customWindow);
    if (typeof state.customWindowOn === "boolean") setCustomWindowOn(state.customWindowOn);
    if (typeof state.corrLag === "string") setCorrLag(state.corrLag);
    if (state.corrTransformA !== undefined) setCorrTransformA(sanitizeTransform(state.corrTransformA));
    if (state.corrTransformB !== undefined) setCorrTransformB(sanitizeTransform(state.corrTransformB));
    if (state.corrIndicators && typeof state.corrIndicators === "object" && !Array.isArray(state.corrIndicators)) {
      setIndicatorsMap(state.corrIndicators);
    }
    if (state.uniMode !== undefined) setUniMode(state.uniMode);
    if (state.uniWindow !== undefined) setUniWindow(state.uniWindow);
    if (typeof state.uniCustomWindow === "string") setUniCustomWindow(state.uniCustomWindow);
    if (state.uniMetric !== undefined) setUniMetric(state.uniMetric);
    if (state.uniScope === "universe" || state.uniScope === "basket" || state.uniScope === "custom") setUniScope(state.uniScope);
    if (state.uniTransform !== undefined) setUniTransform(sanitizeTransform(state.uniTransform));
    if (typeof state.uniLag === "string") setUniLag(state.uniLag);
    if (state.uniClassFilters !== undefined) setUniClassFilters(deserializeClassFilters(state.uniClassFilters));
    if (Array.isArray(state.uniNations)) setUniNations(new Set(state.uniNations));
    if (Array.isArray(state.uniExchanges)) setUniExchanges(new Set(state.uniExchanges));
    if (state.corrBasketId !== undefined) setCorrBasketId(state.corrBasketId);
  }, []);

  const universeSig = useUniverseSignature();
  useWorkspaceTab("correlation", serializeCorrelation, restoreCorrelation, {
    universeSig,
    resultFields: ["specA", "specB", "matrixSpecs"],
  });

  // Fetch tickers + macro catalog
  const { data: tickers = [] } = useQuery<TickerMeta[]>({ queryKey: ["tickers-list"], queryFn: async () => {
    const { getTickers } = await import("@/lib/dataService");
    return getTickers();
  } });
  const { data: macroCatalog = [] } = useQuery<MacroSeriesMeta[]>({ queryKey: ["macro-catalog"], queryFn: fetchMacroCatalog });

  // Grouped metric list for the univariate-correlation picker.
  const uniMetricGroups = useMemo(() => {
    const s = new Set<string>([...STOCK_METRICS_BASE, ...DERIVED_METRICS]);
    for (const t of tickers) for (const m of ((t as any).metrics || [])) s.add(m);
    return groupMetricsByCategory([...s]);
  }, [tickers]);

  // Base list from the global universe (respects the Universe page's filter),
  // then narrowed further by this tab's local classification/geo chips.
  const uniBaseList = useMemo(
    () => ((isFiltered && universeTickers ? filteredTickersList : tickers) as any[]),
    [universeTickers, isFiltered, filteredTickersList, tickers]
  );

  const uniClassOptions = useMemo(() => {
    const opts: Record<string, Set<string>> = {};
    for (const f of CLASS_FIELDS) opts[f.key] = new Set();
    for (const t of uniBaseList) {
      for (const f of CLASS_FIELDS) {
        const v = t[f.key];
        if (v) opts[f.key].add(v);
      }
    }
    const out: Record<string, string[]> = {};
    for (const f of CLASS_FIELDS) out[f.key] = [...opts[f.key]].sort();
    return out;
  }, [uniBaseList]);

  const uniGeoOptions = useMemo(() => {
    const nations = new Set<string>();
    const exchanges = new Set<string>();
    for (const t of uniBaseList) {
      const n = nationOf(t.ticker);
      if (n) nations.add(n);
      const x = exchangeOf(t.ticker);
      if (x) exchanges.add(x);
    }
    return {
      nations: [...nations].sort((a, b) => a.localeCompare(b)),
      exchanges: [...exchanges].sort((a, b) => a.localeCompare(b)),
    };
  }, [uniBaseList, nationOf, exchangeOf]);

  const uniFilteredList = useMemo(() => {
    let out = uniBaseList;
    for (const f of CLASS_FIELDS) {
      const sel = uniClassFilters[f.key];
      if (sel && sel.size > 0) out = out.filter((t) => sel.has(t[f.key]));
    }
    if (uniNations.size > 0) {
      out = out.filter((t) => {
        const n = nationOf(t.ticker);
        return n != null && uniNations.has(n);
      });
    }
    if (uniExchanges.size > 0) {
      out = out.filter((t) => {
        const x = exchangeOf(t.ticker);
        return x != null && uniExchanges.has(x);
      });
    }
    return out;
  }, [uniBaseList, uniClassFilters, uniNations, uniExchanges, nationOf, exchangeOf]);

  const uniLocalFiltersActive =
    Object.values(uniClassFilters).some((s) => s.size > 0) || uniNations.size > 0 || uniExchanges.size > 0;

  const clearUniLocalFilters = useCallback(() => {
    setUniClassFilters(emptyClassFilters());
    setUniNations(new Set());
    setUniExchanges(new Set());
  }, []);

  // Specs for the Universe matrix — universe scope (with local filters) or a
  // basket's members (the former Basket tab).
  const uniScopeBasket = useMemo(
    () => (uniScope === "basket" ? baskets.find((b) => b.id === corrBasketId) ?? null : null),
    [uniScope, baskets, corrBasketId]
  );
  const universeSpecs = useMemo(() => {
    if (uniScope === "custom") return matrixSpecs;
    if (uniScope === "basket") {
      return (uniScopeBasket?.tickers ?? []).map((t) => `${t}:${uniMetric}`);
    }
    return uniFilteredList.map((t) => `${t.ticker}:${uniMetric}`);
  }, [uniScope, uniScopeBasket, uniFilteredList, uniMetric, matrixSpecs]);

  // Pairwise query (frequency-aware, custom window, lag + per-leg transforms)
  const { data: pairwise, isLoading: pairLoading } = useQuery<PairwiseResult>({
    queryKey: ["correlation-pairwise", specA, specB, corrWindow, corrMode, customValid ? customWindowNum : 0, corrFreq, legKey],
    queryFn: () => fetchPairwiseCorrelation(specA, specB, parseInt(corrWindow) || 60, corrMode, {
      extraWindows: customValid ? [customWindowNum] : [],
      freq: corrFreq,
      lagBars: corrLagNum,
      transformA: corrTransformA,
      transformB: corrTransformB,
    }),
    enabled: activeTab === "pairwise" && !!specA && !!specB,
  });

  // Cross-timeframe queries for the TF Divergence pane (hourly / daily / weekly).
  // Key shape matches the main pairwise query so results are shared when possible.
  const tfEnabled = activeTab === "pairwise" && visibleCorrCharts.has("tfDivergence") && !!specA && !!specB;
  const tfWindow = parseInt(corrWindow) || 60;
  const tfOpts = { lagBars: corrLagNum, transformA: corrTransformA, transformB: corrTransformB };
  const tfHourly = useQuery<PairwiseResult>({
    queryKey: ["correlation-pairwise", specA, specB, corrWindow, corrMode, 0, "hourly", legKey],
    queryFn: () => fetchPairwiseCorrelation(specA, specB, tfWindow, corrMode, { ...tfOpts, freq: "hourly" }),
    enabled: tfEnabled,
  });
  const tfDaily = useQuery<PairwiseResult>({
    queryKey: ["correlation-pairwise", specA, specB, corrWindow, corrMode, 0, "daily", legKey],
    queryFn: () => fetchPairwiseCorrelation(specA, specB, tfWindow, corrMode, { ...tfOpts, freq: "daily" }),
    enabled: tfEnabled,
  });
  const tfWeekly = useQuery<PairwiseResult>({
    queryKey: ["correlation-pairwise", specA, specB, corrWindow, corrMode, 0, "weekly", legKey],
    queryFn: () => fetchPairwiseCorrelation(specA, specB, tfWindow, corrMode, { ...tfOpts, freq: "weekly" }),
    enabled: tfEnabled,
  });
  const tfEntries: TFEntry[] = [
    { key: "hourly", label: "Hourly", loading: tfHourly.isLoading, res: tfHourly.data },
    { key: "daily", label: "Daily", loading: tfDaily.isLoading, res: tfDaily.data },
    { key: "weekly", label: "Weekly", loading: tfWeekly.isLoading, res: tfWeekly.data },
  ];


  // Universe matrix query
  const uniLegKey = JSON.stringify({ t: uniTransform, l: uniLagNum });
  const { data: uniMatrixData, isLoading: uniMatrixLoading } = useQuery<MatrixResult>({
    queryKey: ["correlation-universe-matrix", universeSpecs.join(","), uniMode, uniWindowEff, uniLegKey],
    queryFn: () => fetchMatrixCorrelation(universeSpecs, uniMode, uniWindowEff, { transform: uniTransform, lagBars: uniLagNum }),
    enabled: activeTab === "matrix" && universeSpecs.length >= 2,
  });

  // CSV export for pairwise rolling
  const exportPairwiseCSV = useCallback(() => {
    if (!pairwise) return;
    const header = "Date,Rolling_Correlation";
    const lines = pairwise.rolling.map(d => `${d.time},${d.value}`);
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `correlation_${formatSpec(specA)}_${formatSpec(specB)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [pairwise, specA, specB]);


  // CSV export for universe matrix
  const exportUniMatrixCSV = useCallback(() => {
    if (!uniMatrixData) return;
    const labels = uniMatrixData.labels.map(formatSpec);
    const header = `,${labels.join(",")}`;
    const lines = uniMatrixData.matrix.map((row, i) =>
      `${labels[i]},${row.map(v => v.toFixed(4)).join(",")}`
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `universe_correlation_matrix.csv`;
    a.click(); URL.revokeObjectURL(url);
  }, [uniMatrixData]);

  const addMatrixSpec = useCallback((spec: string) => {
    if (spec && !matrixSpecs.includes(spec)) {
      setMatrixSpecs(prev => [...prev, spec]);
    }
  }, [matrixSpecs]);

  const removeMatrixSpec = useCallback((spec: string) => {
    setMatrixSpecs(prev => prev.filter(s => s !== spec));
  }, []);

  return (
    <div className="flex h-full bg-background" data-testid="correlation-page">
      {/* Sidebar — collapsible + drag-resizable */}
      {sidebarCollapsed ? (
        <div className="w-7 border-r border-border bg-card flex flex-col items-center pt-2 flex-shrink-0">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="p-1 text-muted-foreground hover:text-foreground"
            data-testid="corr-sidebar-expand"
            title="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
      <div className="relative border-r border-border bg-card flex flex-col flex-shrink-0 min-h-0" style={{ width: sidebarWidth }}>
        {/* Drag handle on the right edge (double-click resets) */}
        <div
          onPointerDown={startSidebarDrag}
          onDoubleClick={() => setSidebarWidth(250)}
          title="Drag to resize · double-click to reset"
          className="group absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none select-none"
          data-testid="corr-sidebar-handle"
        >
          <span className="absolute inset-y-0 right-0 w-px bg-transparent transition-colors group-hover:bg-primary/60" />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {/* Collapse control */}
        <div className="flex items-center justify-end px-1 pt-1 -mb-1.5">
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="p-0.5 text-muted-foreground/60 hover:text-foreground"
            data-testid="corr-sidebar-collapse"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Tab toggle */}
        <div className="px-2 py-2 border-b border-border">
          <div className="grid grid-cols-2 gap-0.5">
            <Button
              variant={activeTab === "pairwise" ? "default" : "secondary"}
              size="sm"
              className="h-7 text-[10px] px-1.5 w-full"
              onClick={() => setActiveTab("pairwise")}
              data-testid="tab-pairwise"
            >
              <BarChart3 className="w-3 h-3 mr-0.5" /> Pair
            </Button>
            <Button
              variant={activeTab === "matrix" ? "default" : "secondary"}
              size="sm"
              className="h-7 text-[10px] px-1.5 w-full"
              onClick={() => setActiveTab("matrix")}
              data-testid="tab-matrix"
            >
              <Grid3X3 className="w-3 h-3 mr-0.5" /> Matrix
            </Button>
            <Button
              variant={activeTab === "drivers" ? "default" : "secondary"}
              size="sm"
              className="h-7 text-[10px] px-1.5 w-full"
              onClick={() => setActiveTab("drivers")}
              data-testid="tab-drivers"
            >
              <Zap className="w-3 h-3 mr-0.5" /> Drivers
            </Button>
            <Button
              variant={activeTab === "dislocations" ? "default" : "secondary"}
              size="sm"
              className="h-7 text-[10px] px-1.5 w-full"
              onClick={() => setActiveTab("dislocations")}
              data-testid="tab-dislocations"
            >
              <Radar className="w-3 h-3 mr-0.5" /> Disloc
            </Button>
          </div>
          <GridProminenceToggle className="mt-1.5" />
        </div>

        {activeTab === "dislocations" ? (
          <div className="p-3 flex-1 overflow-y-auto space-y-3">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Dislocation Scan</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              Hunts long/short pair ideas: pairs that are normally correlated but whose rolling correlation
              has broken from its own history on ONE timeframe while another timeframe stays in line.
            </div>
            <div className="border border-border/20 rounded p-2 bg-card/20 text-[10px] text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground/70">How to read it</div>
              <div><span className="text-amber-400 font-bold">DECOR</span> — pair de-correlated vs its norm. If historically +ρ, the classic setup is reconvergence: long the laggard leg, short the leader.</div>
              <div><span className="text-sky-400 font-bold">HYPER</span> — correlation unusually tight vs its norm: crowding or a regime shift to watch.</div>
              <div><span className="text-foreground/80 font-bold">Breakdown mode</span> — daily-only screen for typically-correlated pairs whose current rolling ρ has collapsed toward zero/negative AND is still falling (Δρ 20d ≤ 0). Fastest way to catch correlations curving downwards.</div>
              <div>Gap ranks how stretched the dislocated timeframe is vs the calm one. Pin any row to open the pair on the Pairwise tab with the TF Divergence panel.</div>
            </div>
            <div className="border border-border/20 rounded p-2 bg-card/20 text-[10px] text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground/70">Notes</div>
              <div>Windows are in bars of each timeframe (60 hourly bars ≈ 9 sessions; 60 weekly bars ≈ 14 months).</div>
              <div>Hourly legs use the server's cached intraday store (~5y deep with the FMP feed, ~2y on Yahoo fallback); pairs without intraday data fall back to daily-vs-weekly mismatches.</div>
              <div>Scope follows the Universe tab's filters, or pick a basket.</div>
            </div>
          </div>
        ) : activeTab === "drivers" ? (
          <div className="p-3 flex-1 overflow-y-auto space-y-3">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Auto Driver Scan</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              Pick a ticker, select a target, and click Run Driver Scan in the main panel.
            </div>
            <div className="border border-border/20 rounded p-2 bg-card/20 text-[10px] text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground/70">Scan details</div>
              <div>Windows: 30 / 60 / 120 / 252 / 504 / 756d</div>
              <div>Lags: ±1, ±5, ±10, ±30, ±60d</div>
              <div>~200 factors × 6 windows × 11 lags</div>
            </div>
          </div>
        ) : activeTab === "pairwise" ? (
          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            {/* Bar frequency — hourly / daily / weekly */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Frequency</div>
              <div className="flex gap-0.5">
                {CORR_FREQS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setCorrFreq(f.value)}
                    className={`flex-1 px-2 py-1 text-[10px] font-mono rounded border transition-colors ${corrFreq === f.value ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                    data-testid={`corr-freq-${f.value}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {corrFreq === "hourly" && (
                <div className="text-[9px] text-muted-foreground leading-snug">
                  60-min bars from the server's intraday store — up to ~5y with the FMP feed, ~2y on the
                  Yahoo fallback; history is cached permanently and grows over time. Windows are in bars.
                  Daily series (macro, fundamentals) forward-fill with a strict 1-day lag.
                </div>
              )}
              {corrFreq === "weekly" && (
                <div className="text-[9px] text-muted-foreground leading-snug">
                  Last value per ISO week. Windows are in weeks.
                </div>
              )}
            </div>

            <SeriesPicker
              label="Series A"
              value={specA}
              onChange={setSpecA}
              tickers={tickers}
              macroCatalog={macroCatalog}
              testId="corr-series-a"
              transform={corrTransformA}
              onTransformChange={setCorrTransformA}
            />
            <SeriesPicker
              label="Series B"
              value={specB}
              onChange={setSpecB}
              tickers={tickers}
              macroCatalog={macroCatalog}
              testId="corr-series-b"
              transform={corrTransformB}
              onTransformChange={setCorrTransformB}
            />

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Correlation Mode
              </div>
              <Select value={corrMode} onValueChange={setCorrMode}>
                <SelectTrigger className="h-6 text-[11px]" data-testid="corr-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="returns">Log Returns</SelectItem>
                  <SelectItem value="changes">Simple Changes</SelectItem>
                  <SelectItem value="levels">Levels</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Lead/lag: correlate A(t) with B(t − lag) */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Lag (bars)
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-[12px]"
                  onClick={() => setCorrLag(String(corrLagNum - 1))} data-testid="corr-lag-dec">−</Button>
                <Input
                  type="number"
                  min={-500}
                  max={500}
                  value={corrLag}
                  onChange={(e) => setCorrLag(e.target.value)}
                  className="h-6 w-[70px] text-[11px] font-mono px-1.5 text-center"
                  data-testid="corr-lag-input"
                />
                <Button variant="outline" size="sm" className="h-6 w-6 p-0 text-[12px]"
                  onClick={() => setCorrLag(String(corrLagNum + 1))} data-testid="corr-lag-inc">+</Button>
                {corrLagNum !== 0 && (
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]"
                    onClick={() => setCorrLag("0")} data-testid="corr-lag-reset">reset</Button>
                )}
              </div>
              <div className="text-[9px] text-muted-foreground leading-snug">
                A(t) vs B(t−lag): +lag ⇒ B leads A. Pick the SAME series for both legs and set a lag
                for its autocorrelation. Click a bar on the Corr-vs-Lag plot to set this.
              </div>
            </div>

            {/* Plot selection — mirrors the Charts tab sidebar: pick what gets a pane */}
            <div className="space-y-1.5" data-testid="corr-chart-toggles">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Plots
              </div>
              {CHART_KEYS.map(key => (
                <label key={key} className="flex items-center gap-2 cursor-pointer group">
                  <Checkbox
                    checked={visibleCorrCharts.has(key)}
                    onCheckedChange={() => toggleCorrChart(key)}
                    className="h-3.5 w-3.5"
                    data-testid={`toggle-corr-chart-${key}`}
                  />
                  <span className="text-[11px]">{CHART_LABELS[key]}</span>
                </label>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Rolling Windows
              </div>
              {ROLLING_WINDOWS.map(w => (
                <label key={w} className="flex items-center gap-2 cursor-pointer group">
                  <Checkbox
                    checked={visibleWindows.has(w)}
                    onCheckedChange={() => toggleWindow(w)}
                    className="h-3.5 w-3.5"
                    data-testid={`corr-window-${w}`}
                  />
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: MULTI_WINDOW_COLORS[w] }} />
                    {ROLLING_WINDOW_LABELS[w]}
                  </span>
                </label>
              ))}
              {/* Custom rolling window */}
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={customWindowOn}
                  onCheckedChange={() => setCustomWindowOn(v => !v)}
                  className="h-3.5 w-3.5"
                  data-testid="corr-window-custom"
                />
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CUSTOM_WINDOW_COLOR }} />
                <Input
                  type="number"
                  min={5}
                  max={2520}
                  value={customWindow}
                  onChange={(e) => setCustomWindow(e.target.value)}
                  className="h-6 w-[70px] text-[11px] font-mono px-1.5"
                  data-testid="corr-window-custom-input"
                />
                <span className="text-[10px] text-muted-foreground">bars (custom)</span>
              </div>
              {customWindowOn && !customValid && (
                <div className="text-[9px] text-red-400">Custom window must be 5–2520 bars</div>
              )}
            </div>

            {/* Quick presets */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Quick Pairs</div>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "SPG vs 10Y", a: "SPG:close", b: "MACRO:DGS10" },
                  { label: "O vs Mtg30", a: "O:close", b: "MACRO:MORTGAGE30US" },
                  { label: "PLD vs VIX", a: "PLD:close", b: "MACRO:VIXCLS" },
                  { label: "SPG vs O", a: "SPG:close", b: "O:close" },
                  { label: "EQR vs Starts", a: "EQR:close", b: "MACRO:HOUST5F" },
                  { label: "PSA vs CPI", a: "PSA:close", b: "MACRO:CPIAUCSL" },
                ].map(p => (
                  <Button key={p.label} variant="ghost" size="sm"
                    className="h-5 px-2 text-[10px]"
                    onClick={() => { setSpecA(p.a); setSpecB(p.b); }}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5"
              onClick={exportPairwiseCSV} disabled={!pairwise}>
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          </div>
        ) : activeTab === "matrix" ? (
          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            {/* Scope: filtered universe, a basket's members, or a custom spec list */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Scope</div>
              <div className="flex gap-0.5">
                <button
                  onClick={() => setUniScope("universe")}
                  className={`flex-1 px-2 py-1 text-[10px] font-mono rounded border transition-colors ${uniScope === "universe" ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  data-testid="uni-scope-universe"
                >
                  Universe
                </button>
                <button
                  onClick={() => setUniScope("basket")}
                  className={`flex-1 px-2 py-1 text-[10px] font-mono rounded border transition-colors ${uniScope === "basket" ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  data-testid="uni-scope-basket"
                >
                  Basket
                </button>
                <button
                  onClick={() => setUniScope("custom")}
                  className={`flex-1 px-2 py-1 text-[10px] font-mono rounded border transition-colors ${uniScope === "custom" ? "bg-primary text-primary-foreground border-primary" : "border-border/40 text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  data-testid="uni-scope-custom"
                >
                  Custom
                </button>
              </div>
              {uniScope === "basket" && (
                <>
                  <BasketSelect baskets={baskets} value={corrBasketId} onChange={setCorrBasketId} />
                  {baskets.length === 0 && (
                    <div className="text-[10px] text-muted-foreground">No baskets yet — create one on the Baskets tab.</div>
                  )}
                </>
              )}
            </div>

            {uniScope === "custom" && (<>
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Matrix Series ({matrixSpecs.length})
              </div>
              <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                {matrixSpecs.map(spec => (
                  <div key={spec} className="flex items-center gap-1 px-1 py-0.5 rounded text-[11px] hover:bg-accent group">
                    <span className="truncate flex-1 font-mono">{formatSpec(spec)}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-destructive"
                      onClick={() => removeMatrixSpec(spec)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <SeriesPicker
              label="Add Series"
              value={newMatrixSpec}
              onChange={(v) => { addMatrixSpec(v); setNewMatrixSpec(""); }}
              tickers={tickers}
              macroCatalog={macroCatalog}
              testId="matrix-add-series"
            />

            {/* Pull a whole basket's members into the matrix */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Add Basket Members</div>
              <BasketSelect
                baskets={baskets}
                value=""
                testId="matrix-add-basket"
                onChange={(id) => {
                  const b = baskets.find((x) => x.id === id);
                  if (!b) return;
                  setMatrixSpecs((prev) => [...new Set([...prev, ...b.tickers.map((t) => `${t}:close`)])]);
                }}
              />
            </div>

            {/* Quick matrix presets */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Presets</div>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "REITs + Rates", specs: ["SPG:close", "O:close", "PLD:close", "PSA:close", "MACRO:DGS10", "MACRO:DGS2", "MACRO:MORTGAGE30US"] },
                  { label: "REITs + Housing", specs: ["EQR:close", "AVB:close", "MAA:close", "CPT:close", "MACRO:HOUST5F", "MACRO:PERMIT5", "MACRO:COMPU"] },
                  { label: "REITs + Macro", specs: ["SPG:close", "O:close", "PLD:close", "MACRO:DGS10", "MACRO:VIXCLS", "MACRO:CPIAUCSL", "MACRO:UNRATE"] },
                  { label: "Net Lease", specs: ["O:close", "NNN:close", "EPRT:close", "ADC:close", "MACRO:DGS10"] },
                ].map(p => (
                  <Button key={p.label} variant="ghost" size="sm"
                    className="h-5 px-2 text-[10px]"
                    onClick={() => setMatrixSpecs(p.specs)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            </>)}

            <div className="border border-border/30 rounded p-2 bg-card/30">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-1">
                {uniScope === "basket" ? "Basket" : uniScope === "custom" ? "Custom List" : "Universe"}
              </div>
              <div className="text-sm font-mono font-bold text-primary" data-testid="uni-corr-count">
                {universeSpecs.length} {uniScope === "custom" ? "series" : "tickers"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {uniScope === "custom"
                  ? "Hand-picked series — any metric, macro welcome"
                  : uniScope === "basket"
                    ? (uniScopeBasket ? uniScopeBasket.name : "Pick a basket above")
                    : uniLocalFiltersActive
                      ? `Filtered here from ${uniBaseList.length}`
                      : isFiltered
                        ? `Universe filter: ${filteredCount} of ${totalCount}`
                        : "All tickers (no filter)"}
              </div>
            </div>

            {/* Scope filters — 6 classification levels + Country + Exchange */}
            {uniScope === "universe" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Filters</div>
                {uniLocalFiltersActive && (
                  <button
                    onClick={clearUniLocalFilters}
                    className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-destructive"
                    data-testid="uni-corr-filter-clear"
                  >
                    <X className="w-2.5 h-2.5" /> Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {CLASS_FIELDS.map(f => (
                  <FilterDropdown
                    key={f.key}
                    label={f.label}
                    options={uniClassOptions[f.key] || []}
                    selected={uniClassFilters[f.key] || new Set()}
                    onChange={(next) => setUniClassFilters({ ...uniClassFilters, [f.key]: next })}
                    testId={`uni-corr-filter-${f.key}`}
                  />
                ))}
                <FilterDropdown
                  label="Country"
                  options={uniGeoOptions.nations}
                  selected={uniNations}
                  onChange={setUniNations}
                  testId="uni-corr-filter-nation"
                />
                <FilterDropdown
                  label="Exchange"
                  options={uniGeoOptions.exchanges}
                  selected={uniExchanges}
                  onChange={setUniExchanges}
                  testId="uni-corr-filter-exchange"
                />
              </div>
            </div>
            )}

            {uniScope !== "custom" && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Metric</div>
              <MetricSelect
                value={uniMetric}
                onChange={setUniMetric}
                metricGroups={uniMetricGroups}
                testId="uni-corr-metric"
                triggerClass="h-6"
              />
            </div>
            )}

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Mode</div>
              <Select value={uniMode} onValueChange={setUniMode}>
                <SelectTrigger className="h-6 text-[11px]" data-testid="uni-corr-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="returns">Log Returns</SelectItem>
                  <SelectItem value="changes">Simple Changes</SelectItem>
                  <SelectItem value="levels">Levels</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Lookback</div>
              <Select value={uniWindow} onValueChange={setUniWindow}>
                <SelectTrigger className="h-6 text-[11px]" data-testid="uni-corr-window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="120">120 days</SelectItem>
                  <SelectItem value="252">252 days (1Y)</SelectItem>
                  <SelectItem value="504">504 days (2Y)</SelectItem>
                  <SelectItem value="1260">1260 days (5Y)</SelectItem>
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
              {uniWindow === "custom" && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={20}
                    max={5000}
                    value={uniCustomWindow}
                    onChange={(e) => setUniCustomWindow(e.target.value)}
                    className="h-6 w-[80px] text-[11px] font-mono px-1.5"
                    data-testid="uni-corr-window-custom"
                  />
                  <span className="text-[10px] text-muted-foreground">trading days</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Transform (all series)</div>
              <TransformControl value={uniTransform} onChange={setUniTransform} testId="uni-corr-transform" />
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Lag (bars)</div>
              <LagControl
                value={uniLag}
                onChange={setUniLag}
                testId="uni-corr-lag"
                hint="Lead/lag matrix: cell = corr(row(t), col(t−lag)). Asymmetric; diagonal = each ticker's autocorrelation at the lag."
              />
            </div>

            {/* Ticker list preview (custom scope shows its own series list above) */}
            {uniScope !== "custom" && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Tickers ({universeSpecs.length})
              </div>
              <div className="space-y-0 max-h-[300px] overflow-y-auto border border-border/20 rounded">
                {(uniScope === "basket"
                  ? (uniScopeBasket?.tickers ?? []).map((sym) => ({ ticker: sym, name: tickers.find((x) => x.ticker === sym)?.name ?? "" }))
                  : uniFilteredList
                ).map((t: any) => (
                  <div key={t.ticker} className="flex items-baseline gap-1.5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-accent/30 border-b border-border/10 last:border-b-0">
                    <span className="font-bold text-foreground/80">{t.ticker}</span>
                    <span className="truncate text-[9px] text-muted-foreground/60">{t.name}</span>
                  </div>
                ))}
              </div>
            </div>
            )}

            <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5"
              onClick={exportUniMatrixCSV} disabled={!uniMatrixData}>
              <Download className="w-3 h-3" /> Export CSV
            </Button>
          </div>
        ) : null}
        </div>
      </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {activeTab === "dislocations" ? (
          <DislocationScanPanel
            universeTickers={uniFilteredList.map((t: any) => t.ticker)}
            baskets={baskets}
            onPin={pinFromDisloc}
          />
        ) : activeTab === "drivers" ? (
          <DriverScanPanel tickers={tickers} onPin={pinFromDriver} />
        ) : activeTab === "pairwise" ? (
          <PairwiseView
            data={pairwise}
            loading={pairLoading}
            specA={specA}
            specB={specB}
            mode={corrMode}
            freq={corrFreq}
            visibleWindows={visibleWindows}
            customWindow={customValid ? customWindowNum : null}
            visibleCharts={visibleCorrCharts}
            layout={corrLayout}
            onLayoutChange={setCorrLayout}
            panesVisible={corrPanesVisible}
            onPanesVisibleChange={setCorrPanesVisible}
            indicatorsMap={indicatorsMap}
            onIndicatorsMapChange={setIndicatorsMap}
            tfEntries={tfEntries}
            tfWindow={tfWindow}
            lagBars={corrLagNum}
            onLagChange={(l) => setCorrLag(String(l))}
            transformA={corrTransformA}
            transformB={corrTransformB}
            timeRange={corrTimeRange}
            onTimeRangeChange={setCorrTimeRange}
          />
        ) : activeTab === "matrix" ? (
          <UniverseMatrixView
            data={uniMatrixData}
            loading={uniMatrixLoading}
            tickerCount={universeSpecs.length}
            transform={uniTransform}
            lagBars={uniLagNum}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Methodology Panel ──
function MethodologyPanel({ mode }: { mode: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/30 rounded bg-card/20">
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="methodology-toggle"
      >
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Methodology &amp; Interpretation Guide</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 text-[11px] text-muted-foreground leading-relaxed">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Pearson vs Spearman */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">Pearson vs Spearman</div>
              <div>Pearson measures linear association between two series. Spearman uses rank ordering, making it robust to outliers and nonlinearity. If they diverge by more than ~0.15, the relationship may be driven by a few extreme observations or be nonlinear.</div>
            </div>
            {/* Fisher CI */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">Fisher-Transform Confidence Intervals</div>
              <div>The dashed lines on the rolling correlation chart show the 95% confidence interval using the Fisher z-transformation. Narrow bands indicate a precise estimate; wide bands suggest the window may be too short or the relationship too noisy to trust.</div>
            </div>
            {/* ADF & Stationarity */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">ADF Stationarity Test</div>
              <div>The Augmented Dickey-Fuller test checks whether each series has a unit root (non-stationary). Correlating two non-stationary series in levels often produces spurious results. If both series are non-stationary, use Log Returns mode or check for cointegration.</div>
            </div>
            {/* Cointegration */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">Engle-Granger Cointegration</div>
              <div>Even if two series are individually non-stationary, they may share a long-run equilibrium (cointegrated). The EG test runs an ADF test on OLS residuals. If cointegrated (p&lt;0.05), the level relationship is meaningful and the spread is mean-reverting — useful for pairs trading.</div>
            </div>
            {/* Rolling Beta */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">Rolling Beta</div>
              <div>Rolling OLS slope of series A on series B, using the same window as the rolling correlation. A stable beta suggests a consistent linear relationship; a drifting beta indicates the sensitivity of A to B is changing over time, which matters for hedge ratios.</div>
            </div>
            {/* Mode guidance */}
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-foreground/80">When to Use Which Mode</div>
              <div>
                {mode === "levels" ? (
                  <><strong>Levels mode (current):</strong> Best for identifying cointegrated pairs or long-run equilibrium relationships. Watch out for spurious correlation if series are non-stationary and not cointegrated.&nbsp;</>
                ) : (
                  <><strong>Log Returns mode (current):</strong> Removes trend and makes series stationary. The standard choice for measuring co-movement and beta estimation. Pearson and Spearman should be compared here.&nbsp;</>
                )}
                Cross-correlation lags show lead/lag relationships. ACF plots reveal serial dependence — high AC(1) inflates correlation significance, which is why Effective N adjusts downward.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pairwise View ──
function PairwiseView({
  data,
  loading,
  specA,
  specB,
  mode,
  freq,
  visibleWindows,
  customWindow,
  visibleCharts,
  layout,
  onLayoutChange,
  panesVisible,
  onPanesVisibleChange,
  indicatorsMap,
  onIndicatorsMapChange,
  tfEntries,
  tfWindow,
  lagBars,
  onLagChange,
  transformA,
  transformB,
  timeRange,
  onTimeRangeChange,
}: {
  data: PairwiseResult | undefined;
  loading: boolean;
  specA: string;
  specB: string;
  mode: string;
  freq: CorrFrequency;
  visibleWindows: Set<number>;
  customWindow: number | null;
  visibleCharts: Set<string>;
  layout: GridLayout;
  onLayoutChange: (l: GridLayout) => void;
  panesVisible: number | "all";
  onPanesVisibleChange: (v: number | "all") => void;
  indicatorsMap: Record<number, ActiveIndicators>;
  onIndicatorsMapChange: React.Dispatch<React.SetStateAction<Record<number, ActiveIndicators>>>;
  tfEntries: TFEntry[];
  tfWindow: number;
  lagBars: number;
  onLagChange: (lag: number) => void;
  transformA: LegTransform | null;
  transformB: LegTransform | null;
  timeRange: string;
  onTimeRangeChange: (r: string) => void;
}) {
  const [maximizedChart, setMaximizedChart] = useState<string | null>(null);
  const [acfMode, setAcfMode] = useState<"acf" | "pacf">("acf");
  const [paneOffset, setPaneOffset] = useState(0);
  const [showIndicators, setShowIndicators] = useState(false);
  const [indicatorPaneId, setIndicatorPaneId] = useState<number | null>(null);
  // Drag-resize track fractions (ChartArea parity)
  const [colFracs, setColFracs] = useState<number[]>([1]);
  const [rowFracs, setRowFracs] = useState<number[]>([1]);
  const gridRef = useRef<HTMLDivElement>(null);

  const isIntraday = freq === "hourly";
  const hasError = !data || !!(data as any).error;

  // {time,value} → LWC point (hourly times are epoch-second strings from the engine)
  const toPt = useCallback(
    (d: { time: string; value: number }) => ({ time: (isIntraday ? Number(d.time) : d.time) as any, value: d.value }),
    [isIntraday]
  );
  // LWC throws on non-finite values — one bad point must not crash the pane.
  const toPts = useCallback(
    (arr: { time: string; value: number }[]) => arr.filter((d) => Number.isFinite(d.value)).map(toPt),
    [toPt]
  );

  // ── Cross-pane time-axis sync (ChartArea parity) ──
  // Daily panes share ChartPane's global daily spacer axis; hourly panes get an
  // explicit shared spacer built from the aligned intraday axis, so logical-range
  // sync stays index-aligned across Levels / Rolling / Beta.
  const lwcChartsRef = useRef(new Map<number, IChartApi>());
  const syncingRef = useRef(false);
  const syncPendingSrcRef = useRef<number | null>(null);
  const syncRafRef = useRef(0);
  // Coalesce range broadcasts into one rAF apply and skip no-op sets. Crucially,
  // read the source chart's LIVE range at flush time — applying a snapshot taken
  // at event time means async echo events re-apply a stale range onto the pane
  // the user is actively dragging, which rubber-bands the pan ("frozen" charts).
  const flushSync = useCallback(() => {
    syncRafRef.current = 0;
    const src = syncPendingSrcRef.current;
    syncPendingSrcRef.current = null;
    if (src == null) return;
    const srcChart = lwcChartsRef.current.get(src);
    if (!srcChart) return;
    let range: { from: number; to: number } | null = null;
    try { range = srcChart.timeScale().getVisibleLogicalRange() as { from: number; to: number } | null; } catch {}
    if (!range) return;
    syncingRef.current = true;
    for (const [id, other] of lwcChartsRef.current) {
      if (id === src) continue;
      try {
        const cur = other.timeScale().getVisibleLogicalRange();
        if (cur && Math.abs(cur.from - range.from) < 0.5 && Math.abs(cur.to - range.to) < 0.5) continue;
        other.timeScale().setVisibleLogicalRange(range);
      } catch {}
    }
    syncingRef.current = false;
  }, []);
  const handleLwcChartReady = useCallback((paneId: number, chart: IChartApi) => {
    lwcChartsRef.current.set(paneId, chart);
    (window as any).__corrCharts = lwcChartsRef.current; // debug hook
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || syncingRef.current) return;
      // First writer per frame wins — an async echo from a follower pane must
      // not steal the source role from the pane the user is interacting with.
      if (syncPendingSrcRef.current == null) syncPendingSrcRef.current = paneId;
      if (!syncRafRef.current) syncRafRef.current = requestAnimationFrame(flushSync);
    });
  }, [flushSync]);
  const handleLwcChartDestroyed = useCallback((paneId: number) => {
    lwcChartsRef.current.delete(paneId);
  }, []);
  const hourlySpacerTimes = useMemo(
    () => (isIntraday && data?.levelsA?.length ? data.levelsA.map((d) => Number(d.time)) : null),
    [isIntraday, data]
  );

  // ── PlottedSeries for the ChartPane-rendered panes ──
  const levelsSeries: PlottedSeries[] = useMemo(() => {
    if (hasError || !data!.levelsA?.length) return [];
    const labelA = legLabel(specA, transformA);
    const labelB = legLabel(specB, transformB);
    const out: PlottedSeries[] = [{
      id: "corr:levelsA",
      ticker: "CORR",
      metric: labelA,
      color: COLORS.primary,
      paneIndex: LWC_PANE_IDS.levels,
      data: toPts(data!.levelsA) as any,
      visible: true,
      label: labelA,
    }];
    if (data!.levelsB?.length) {
      out.push({
        id: "corr:levelsB",
        ticker: "CORR",
        metric: labelB,
        color: COLORS.secondary,
        paneIndex: LWC_PANE_IDS.levels,
        data: toPts(data!.levelsB) as any,
        visible: true,
        label: labelB,
      });
    }
    return out;
  }, [data, hasError, specA, specB, transformA, transformB, toPt]);

  const activeWindowsSorted = useMemo(() => {
    const ws = [...Array.from(visibleWindows), ...(customWindow ? [customWindow] : [])];
    return ws.filter((w, i, a) => a.indexOf(w) === i).sort((x, y) => x - y);
  }, [visibleWindows, customWindow]);

  const rollingSeries: PlottedSeries[] = useMemo(() => {
    if (hasError || !data!.multiWindowRolling) return [];
    const out: PlottedSeries[] = [];
    for (const w of activeWindowsSorted) {
      const arr = data!.multiWindowRolling[w];
      if (!arr || arr.length === 0) continue;
      out.push({
        id: `corr:roll:${w}`,
        ticker: "CORR",
        metric: `${w}-bar ρ`,
        color: windowColor(w),
        paneIndex: LWC_PANE_IDS.rolling,
        data: toPts(arr) as any,
        visible: true,
        label: `${w}-bar ρ`,
        sharedScale: true,
      });
    }
    if (out.length > 0 && data!.rollingCI?.length) {
      out.push({
        id: "corr:ci-upper",
        ticker: "CORR",
        metric: "95% CI",
        color: "rgba(100,180,255,0.35)",
        lineWidth: 1,
        lineStyle: 2,
        paneIndex: LWC_PANE_IDS.rolling,
        data: toPts(data!.rollingCI.map((d) => ({ time: d.time, value: d.upper }))) as any,
        visible: true,
        label: "95% CI+",
        sharedScale: true,
      });
      out.push({
        id: "corr:ci-lower",
        ticker: "CORR",
        metric: "95% CI",
        color: "rgba(100,180,255,0.35)",
        lineWidth: 1,
        lineStyle: 2,
        paneIndex: LWC_PANE_IDS.rolling,
        data: toPts(data!.rollingCI.map((d) => ({ time: d.time, value: d.lower }))) as any,
        visible: true,
        label: "95% CI−",
        sharedScale: true,
      });
    }
    return out;
  }, [data, hasError, activeWindowsSorted, toPt]);

  const betaSeries: PlottedSeries[] = useMemo(() => {
    if (hasError || !data!.rollingBeta?.length) return [];
    return [{
      id: "corr:beta",
      ticker: "CORR",
      metric: "Rolling β",
      color: "#ec4899",
      paneIndex: LWC_PANE_IDS.rollingBeta,
      data: toPts(data!.rollingBeta) as any,
      visible: true,
      label: `β: ${legLabel(specA, transformA)} ~ ${legLabel(specB, transformB)}`,
    }];
  }, [data, hasError, specA, specB, transformA, transformB, toPt]);

  // ── Active pane keys, in canonical order ──
  const paneKeysActive = useMemo(() => {
    if (hasError) return [] as string[];
    const keys: string[] = [];
    if (visibleCharts.has("levels") && levelsSeries.length > 0) keys.push("levels");
    if (visibleCharts.has("rolling") && rollingSeries.length > 0) keys.push("rolling");
    if (visibleCharts.has("rollingBeta") && betaSeries.length > 0) keys.push("rollingBeta");
    if (visibleCharts.has("tfDivergence")) keys.push("tfDivergence");
    if (visibleCharts.has("scatter")) keys.push("scatter");
    if (visibleCharts.has("crossCorr")) keys.push("crossCorr");
    if (visibleCharts.has("acfA")) keys.push("acfA");
    if (visibleCharts.has("acfB")) keys.push("acfB");
    return keys;
  }, [hasError, visibleCharts, levelsSeries.length, rollingSeries.length, betaSeries.length]);

  // ── Charts-tab layout mechanics: visible window + paging + resizable grid ──
  const maximizedKey = maximizedChart && paneKeysActive.includes(maximizedChart) ? maximizedChart : null;
  const count = panesVisible === "all" ? paneKeysActive.length : Math.min(panesVisible, paneKeysActive.length);
  const start = Math.min(paneOffset, Math.max(0, paneKeysActive.length - count));
  const shownKeys = maximizedKey ? [maximizedKey] : paneKeysActive.slice(start, start + count);
  const canPagePrev = !maximizedKey && panesVisible !== "all" && start > 0;
  const canPageNext = !maximizedKey && panesVisible !== "all" && start + count < paneKeysActive.length;

  const gridDims = useMemo(() => {
    const { cols } = parseGrid(layout);
    return { cols, rows: Math.max(1, Math.ceil(Math.max(1, shownKeys.length) / cols)) };
  }, [layout, shownKeys.length]);

  // Reset the drag-resize fractions to equal whenever the grid dimensions change.
  useEffect(() => {
    setColFracs(Array(gridDims.cols).fill(1));
    setRowFracs(Array(gridDims.rows).fill(1));
  }, [gridDims.cols, gridDims.rows]);

  const computedGridStyle = useMemo((): React.CSSProperties => {
    if (maximizedKey) {
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
  }, [colFracs, rowFracs, gridDims.cols, gridDims.rows, maximizedKey]);

  // Drag a grid divider to resize adjacent rows/columns (fraction-based, ChartArea parity).
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
    };
    document.body.style.cursor = isRow ? "row-resize" : "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [rowFracs, colFracs]);

  // LWC panes currently active — drive the indicators panel pane selector.
  const lwcPaneInfos: PaneInfo[] = useMemo(
    () =>
      paneKeysActive
        .filter((k) => LWC_PANE_IDS[k] !== undefined)
        .map((k) => ({ id: LWC_PANE_IDS[k], label: CHART_LABELS[k] })),
    [paneKeysActive]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Computing correlation...
      </div>
    );
  }

  if (!data || (data as any).error) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {(data as any)?.error || "Select two series to analyze"}
      </div>
    );
  }

  const s = data.summary;
  const labelA = legLabel(specA, transformA);
  const labelB = legLabel(specB, transformB);
  const sameSeriesNoLag =
    specA === specB &&
    lagBars === 0 &&
    JSON.stringify(transformA) === JSON.stringify(transformB);

  // ── Pane renderers (keyed by CHART_KEYS, order fixed by paneKeysActive) ──
  const hasPacf = (data.pacfA?.length ?? 0) > 0;
  const usePacf = acfMode === "pacf" && hasPacf;
  const acfKind = usePacf ? "PACF" : "ACF";
  const acfDataA = usePacf ? data.pacfA! : data.acfA;
  const acfDataB = usePacf ? data.pacfB! : data.acfB;

  const acfHeaderRight = (acfData: { lag: number; value: number }[]) => {
    const strongest = strongestAcfLag(acfData, s.observations);
    return (
      <div className="flex items-center gap-1.5" onDoubleClick={(e) => e.stopPropagation()}>
        {strongest && (
          <span className="text-[9px] font-mono whitespace-nowrap" data-testid="acf-strongest">
            <span className="text-muted-foreground">strongest </span>
            <span style={{ color: "#e879f9" }}>
              lag {strongest.lag} ({strongest.value >= 0 ? "+" : ""}{strongest.value.toFixed(3)})
            </span>
            {!strongest.isSignificant && <span className="text-muted-foreground"> n.s.</span>}
          </span>
        )}
        {hasPacf && (["acf", "pacf"] as const).map((m) => (
          <button
            key={m}
            onClick={(e) => { e.stopPropagation(); setAcfMode(m); }}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border ${
              acfMode === m
                ? "bg-primary/20 text-primary border-primary/40"
                : "text-muted-foreground border-border hover:text-foreground"
            }`}
            data-testid={`acf-mode-${m}`}
          >
            {m}
          </button>
        ))}
      </div>
    );
  };

  const toggleMax = (key: string) => setMaximizedChart(maximizedKey === key ? null : key);

  const renderPane = (key: string): React.ReactNode => {
    switch (key) {
      case "levels":
        return (
          <CorrLwcPane
            paneId={LWC_PANE_IDS.levels}
            label={`${labelA} vs ${labelB} (Levels)`}
            series={levelsSeries}
            indicators={indicatorsMap[LWC_PANE_IDS.levels] || {}}
            intraday={isIntraday}
            spacerTimes={hourlySpacerTimes}
            timeRange={timeRange}
            onMaximizeToggle={() => toggleMax("levels")}
            onChartReady={handleLwcChartReady}
            onChartDestroyed={handleLwcChartDestroyed}
          />
        );
      case "rolling":
        return (
          <CorrLwcPane
            paneId={LWC_PANE_IDS.rolling}
            label={`Rolling Correlation (${activeWindowsSorted.join(" / ")} bars)`}
            series={rollingSeries}
            indicators={indicatorsMap[LWC_PANE_IDS.rolling] || {}}
            intraday={isIntraday}
            spacerTimes={hourlySpacerTimes}
            timeRange={timeRange}
            onMaximizeToggle={() => toggleMax("rolling")}
            onChartReady={handleLwcChartReady}
            onChartDestroyed={handleLwcChartDestroyed}
          />
        );
      case "rollingBeta":
        return (
          <CorrLwcPane
            paneId={LWC_PANE_IDS.rollingBeta}
            label={`Rolling Beta: ${labelA} ~ ${labelB}`}
            series={betaSeries}
            indicators={indicatorsMap[LWC_PANE_IDS.rollingBeta] || {}}
            intraday={isIntraday}
            spacerTimes={hourlySpacerTimes}
            timeRange={timeRange}
            onMaximizeToggle={() => toggleMax("rollingBeta")}
            onChartReady={handleLwcChartReady}
            onChartDestroyed={handleLwcChartDestroyed}
          />
        );
      case "tfDivergence":
        return (
          <CanvasChartWrapper
            title="Cross-Timeframe Divergence"
            chartId="tfDivergence"
            isMaximized={maximizedKey === "tfDivergence"}
            onMaximize={setMaximizedChart}
            height={260}
          >
            {(h) => (
              <div style={{ height: h }}>
                <TFDivergenceContent entries={tfEntries} window={tfWindow} />
              </div>
            )}
          </CanvasChartWrapper>
        );
      case "scatter":
        return (
          <CanvasChartWrapper
            title={`Scatter: ${labelA} vs ${labelB}`}
            chartId="scatter"
            isMaximized={maximizedKey === "scatter"}
            onMaximize={setMaximizedChart}
            height={350}
          >
            {(h) => (
              <ScatterCanvas
                data={data.scatter}
                labelX={labelB}
                labelY={labelA}
                beta={s.beta}
                alpha={s.alpha}
                height={h}
                hideTitle
              />
            )}
          </CanvasChartWrapper>
        );
      case "crossCorr":
        return (
          <CanvasChartWrapper
            title={`Corr vs Lag (${data.crossCorrelation[0]?.lag} to +${data.crossCorrelation[data.crossCorrelation.length - 1]?.lag}) — click to set lag`}
            chartId="crossCorr"
            isMaximized={maximizedKey === "crossCorr"}
            onMaximize={setMaximizedChart}
            height={280}
            headerRight={lagBars !== 0 ? (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap" style={{ color: "#e879f9", backgroundColor: "#e879f922" }}>
                lag {lagBars > 0 ? "+" : ""}{lagBars} applied
              </span>
            ) : undefined}
          >
            {(h) => (
              <CrossCorrChart
                data={data.crossCorrelation}
                labelA={labelA}
                labelB={labelB}
                height={h}
                hideTitle
                selectedLag={lagBars}
                onSelectLag={onLagChange}
              />
            )}
          </CanvasChartWrapper>
        );
      case "acfA":
        return (
          <CanvasChartWrapper
            title={`${acfKind}: ${labelA}`}
            chartId="acfA"
            isMaximized={maximizedKey === "acfA"}
            onMaximize={setMaximizedChart}
            height={200}
            headerRight={acfHeaderRight(acfDataA)}
          >
            {(h) => <ACFChart data={acfDataA} nObs={s.observations} title="" height={h} hideTitle />}
          </CanvasChartWrapper>
        );
      case "acfB":
        return (
          <CanvasChartWrapper
            title={`${acfKind}: ${labelB}`}
            chartId="acfB"
            isMaximized={maximizedKey === "acfB"}
            onMaximize={setMaximizedChart}
            height={200}
            headerRight={acfHeaderRight(acfDataB)}
          >
            {(h) => <ACFChart data={acfDataB} nObs={s.observations} title="" height={h} hideTitle />}
          </CanvasChartWrapper>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden min-h-0" data-testid="pairwise-view">
    <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3 min-w-0">
      {/* Summary stats + diagnostics + methodology (scrolls if tall so charts keep room) */}
      <div className="flex-shrink-0 max-h-[45%] overflow-y-auto space-y-3">
      {/* Summary stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-2">
        {[
          { label: "Pearson ρ", value: s.correlation.toFixed(4), color: corrColor(s.correlation), sub: data.diagnostics?.fisherCI ? `95% CI [${data.diagnostics.fisherCI.lower.toFixed(3)}, ${data.diagnostics.fisherCI.upper.toFixed(3)}]` : undefined },
          ...(lagBars !== 0 ? [{ label: "Lag", value: `${lagBars > 0 ? "+" : ""}${lagBars} bars`, color: "#e879f9", sub: lagBars > 0 ? "B leads A" : "A leads B" }] : []),
          { label: "Spearman ρₛ", value: (s.spearmanCorrelation ?? 0).toFixed(4), color: corrColor(s.spearmanCorrelation ?? 0) },
          { label: "R²", value: s.rSquared.toFixed(4), color: "#94a3b8" },
          { label: "Beta (β)", value: s.beta.toFixed(4), color: "#94a3b8" },
          { label: "Observations", value: String(s.observations), color: "#94a3b8" },
          { label: "Eff. N*", value: String(s.effectiveN), color: s.effectiveN < s.observations * 0.5 ? "#ef4444" : "#94a3b8" },
          { label: "t-Stat", value: s.tStat.toFixed(3), color: "#94a3b8" },
          { label: "p-Value", value: s.pValue < 0.001 ? "<0.001" : s.pValue.toFixed(4), color: s.pValue < 0.05 ? "#22c55e" : "#ef4444" },
          ...(data.diagnostics?.cointegration ? [{
            label: "Coint. (EG)",
            value: data.diagnostics.cointegration.isCointegrated ? "Yes" : "No",
            color: data.diagnostics.cointegration.isCointegrated ? "#22c55e" : "#94a3b8",
            sub: `ADF=${data.diagnostics.cointegration.stat.toFixed(2)}, p=${data.diagnostics.cointegration.pValue < 0.001 ? "<.001" : data.diagnostics.cointegration.pValue.toFixed(3)}`,
          }] : []),
        ].map(stat => (
          <div key={stat.label} className="border border-border/30 rounded p-2 bg-card/30">
            <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider">{stat.label}</div>
            <div className="text-sm font-mono font-bold" style={{ color: stat.color }}>{stat.value}</div>
            {(stat as any).sub && <div className="text-[8px] font-mono text-muted-foreground/60 mt-0.5">{(stat as any).sub}</div>}
          </div>
        ))}
      </div>

      {/* Diagnostics panel */}
      {data.diagnostics && (() => {
        const d = data.diagnostics;
        const warnings: string[] = [];
        if (Math.abs(s.autoCorrelationA) > 0.3 || Math.abs(s.autoCorrelationB) > 0.3) {
          warnings.push(`High autocorrelation: ${labelA} AC(1)=${s.autoCorrelationA.toFixed(3)}, ${labelB} AC(1)=${s.autoCorrelationB.toFixed(3)}. Effective N reduced to ${s.effectiveN}.`);
        }
        if (mode === "levels" && d.adfA && !d.adfA.isStationary) {
          warnings.push(`${labelA} is non-stationary (ADF=${d.adfA.stat.toFixed(2)}, p=${d.adfA.pValue.toFixed(3)}). Level correlation may be spurious.`);
        }
        if (mode === "levels" && d.adfB && !d.adfB.isStationary) {
          warnings.push(`${labelB} is non-stationary (ADF=${d.adfB.stat.toFixed(2)}, p=${d.adfB.pValue.toFixed(3)}). Level correlation may be spurious.`);
        }
        if (mode === "levels" && d.cointegration && !d.cointegration.isCointegrated && d.adfA && !d.adfA.isStationary) {
          warnings.push(`No cointegration detected (EG stat=${d.cointegration.stat.toFixed(2)}, p=${d.cointegration.pValue.toFixed(3)}). The level relationship may not represent a stable equilibrium. Consider using Log Returns mode.`);
        }
        if (mode === "levels" && d.cointegration?.isCointegrated) {
          warnings.push(`Cointegrated pair (EG p=${d.cointegration.pValue.toFixed(3)}). The spread is mean-reverting — pair/equilibrium analysis is valid.`);
        }
        if (mode === "returns" && Math.abs(s.correlation - (s.spearmanCorrelation ?? 0)) > 0.15) {
          warnings.push(`Pearson (${s.correlation.toFixed(3)}) and Spearman (${(s.spearmanCorrelation ?? 0).toFixed(3)}) diverge, suggesting nonlinear or outlier-driven relationship.`);
        }
        if (warnings.length === 0) return null;
        return (
          <div className="border border-amber-500/30 bg-amber-500/5 rounded p-2 space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="text-[11px] text-amber-400">{w}</div>
            ))}
          </div>
        );
      })()}

      {sameSeriesNoLag && (
        <div className="border border-sky-500/30 bg-sky-500/5 rounded p-2 text-[11px] text-sky-400" data-testid="same-series-hint">
          Both legs are the same series with lag 0, so ρ ≡ 1 by definition. Set a lag in the sidebar (or
          click a bar on the Corr vs Lag plot) to study this series' autocorrelation — or read the
          ACF / PACF panes below, which show it across all lags at once.
        </div>
      )}

      {/* Methodology & Guidance Panel */}
      <MethodologyPanel mode={mode} />
      </div>

      {/* Chart-area toolbar — same layout controls as the Charts tab */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
          {paneKeysActive.length} plot{paneKeysActive.length === 1 ? "" : "s"}
        </span>

        {/* Visible time window (Charts parity) — Max fits everything, tighter
            windows leave history off-screen so the panes can pan/scroll. */}
        <div className="flex gap-0.5 ml-2" data-testid="corr-time-range">
          {["1Y", "3Y", "5Y", "YTD", "all"].map((r) => (
            <button
              key={r}
              onClick={() => onTimeRangeChange(r)}
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                timeRange === r
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/40 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              data-testid={`corr-range-${r}`}
            >
              {r === "all" ? "Max" : r}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        {paneKeysActive.length > 1 && (
          <>
            <Select
              value={String(panesVisible)}
              onValueChange={(v) => { onPanesVisibleChange(v === "all" ? "all" : parseInt(v)); setPaneOffset(0); }}
            >
              <SelectTrigger className="h-6 text-[10px] w-auto min-w-[110px]" data-testid="corr-panes-visible">
                <Layers className="w-3 h-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: Math.min(paneKeysActive.length, 6) }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{i + 1} pane{i > 0 ? "s" : ""}</SelectItem>
                ))}
                <SelectItem value="all">All ({paneKeysActive.length})</SelectItem>
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
                  onClick={() => setPaneOffset(Math.max(0, start - 1))}
                  data-testid="corr-pane-page-prev"
                  title="Previous panes"
                >
                  <ChevronLeft className="w-3 h-3" />
                </Button>
                <span className="text-[9px] text-muted-foreground flex items-center tabular-nums">
                  {start + 1}–{Math.min(start + count, paneKeysActive.length)}/{paneKeysActive.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  disabled={!canPageNext}
                  onClick={() => setPaneOffset(start + 1)}
                  data-testid="corr-pane-page-next"
                  title="Next panes"
                >
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </div>
            )}

            <GridLayoutPicker
              value={layout}
              onChange={onLayoutChange}
              testId="corr-grid-picker"
            />
          </>
        )}

        {/* Indicators panel toggle (Charts-tab parity) */}
        {lwcPaneInfos.length > 0 && (
          <Button
            variant={showIndicators ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => setShowIndicators(v => !v)}
            data-testid="corr-toggle-indicators"
            title="Indicators panel"
          >
            <SlidersHorizontal className="w-3 h-3" />
            Indicators
          </Button>
        )}
      </div>

      {/* Chart grid — fills the remaining viewport; dividers drag-resize tracks */}
      {paneKeysActive.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center text-muted-foreground text-sm border border-dashed border-border/40 rounded">
          Enable plots in the sidebar to add charts
        </div>
      ) : (
        <div
          ref={gridRef}
          className="flex-1 min-h-0 overflow-hidden relative"
          style={computedGridStyle}
          data-testid="corr-chart-grid"
        >
          {/* Draggable dividers to resize grid rows / columns */}
          {!maximizedKey && (() => {
            const rows = rowFracs.length === gridDims.rows ? rowFracs : Array(gridDims.rows).fill(1);
            const cols = colFracs.length === gridDims.cols ? colFracs : Array(gridDims.cols).fill(1);
            const rowSum = rows.reduce((s2: number, f: number) => s2 + f, 0);
            const colSum = cols.reduce((s2: number, f: number) => s2 + f, 0);
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
                  data-testid={`corr-pane-divider-row-${i}`}
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
                  data-testid={`corr-pane-divider-col-${i}`}
                >
                  <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent group-hover:bg-primary/60 transition-colors" />
                </div>
              );
            }
            return handles;
          })()}
          {shownKeys.map((key) => (
            <div key={key} className="relative min-w-0 min-h-0 overflow-hidden" style={{ width: "100%", height: "100%" }}>
              {renderPane(key)}
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Indicators side panel — the exact Charts-tab panel, scoped to the LWC panes */}
    {showIndicators && lwcPaneInfos.length > 0 && (
      <IndicatorsPanel
        panes={lwcPaneInfos}
        indicatorsMap={indicatorsMap}
        activePaneId={indicatorPaneId ?? lwcPaneInfos[0].id}
        onSelectPane={(id) => setIndicatorPaneId(id)}
        onChangeIndicators={(paneId, indicators) =>
          onIndicatorsMapChange(prev => ({ ...prev, [paneId]: indicators }))
        }
        onApplyToAllPanes={(indicators) =>
          onIndicatorsMapChange(prev => {
            const next = { ...prev };
            for (const p of lwcPaneInfos) next[p.id] = { ...indicators };
            return next;
          })
        }
        onClose={() => setShowIndicators(false)}
        frequency={freq}
      />
    )}
    </div>
  );
}

// ── Universe Matrix View ──
function UniverseMatrixView({
  data,
  loading,
  tickerCount,
  transform,
  lagBars,
}: {
  data: MatrixResult | undefined;
  loading: boolean;
  tickerCount: number;
  transform?: LegTransform | null;
  lagBars?: number;
}) {
  // Shorten to ticker-only labels when every stock spec shares one metric;
  // mixed-metric custom lists keep the full TICKER:metric form.
  const displayLabels = useMemo(() => {
    if (!data) return [];
    const suffixes = new Set(
      data.labels.filter((l) => !l.startsWith("MACRO:")).map((l) => l.split(":").slice(1).join(":"))
    );
    const uniform = suffixes.size <= 1;
    return data.labels.map((l) =>
      l.startsWith("MACRO:") ? l.replace("MACRO:", "") : uniform ? l.split(":")[0] : l
    );
  }, [data]);

  // Average pairwise correlation + per-ticker averages (most correlated vs diversifiers).
  const avgStats = useMemo(() => {
    if (!data || data.labels.length < 2) return null;
    const perTicker = data.matrix.map((row, i) => {
      let s = 0, c = 0;
      row.forEach((v, j) => { if (i !== j && Number.isFinite(v)) { s += v; c++; } });
      return { label: displayLabels[i], avg: c ? s / c : 0 };
    });
    const avgAll = perTicker.reduce((s, t) => s + t.avg, 0) / perTicker.length;
    const sorted = [...perTicker].sort((a, b) => b.avg - a.avg);
    return { avgAll, most: sorted.slice(0, 10), least: sorted.slice(-10).reverse() };
  }, [data, displayLabels]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-5 h-5 animate-spin" />
        Computing {tickerCount}×{tickerCount} correlation matrix...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {tickerCount < 2 ? "Need at least 2 series in scope — pick a scope, basket, or add series" : "Loading..."}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-3 space-y-3">
      {/* Matrix info bar */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        <span className="font-semibold text-foreground">{data.labels.length}×{data.labels.length} matrix</span>
        <span>·</span>
        <span>{data.observations} obs</span>
        <span>·</span>
        <span>{data.dateRange.from} to {data.dateRange.to}</span>
        <span>·</span>
        <span>{data.mode === "returns" ? "Log Returns" : data.mode === "changes" ? "Simple Changes" : "Levels"}</span>
        {transform && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: "#34d399", backgroundColor: "#34d39922" }}>
            {TRANSFORM_TAGS[transform.kind]}{transform.period} applied to all series
          </span>
        )}
        {!!lagBars && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: "#e879f9", backgroundColor: "#e879f922" }}>
            lead/lag {lagBars > 0 ? "+" : ""}{lagBars}: cell = corr(row(t), col(t−lag)) · diag = autocorr
          </span>
        )}
        {avgStats && (
          <>
            <span>·</span>
            <span data-testid="uni-avg-corr">
              avg pairwise ρ{" "}
              <span className="font-bold" style={{ color: corrColor(avgStats.avgAll) }}>
                {avgStats.avgAll.toFixed(3)}
              </span>
            </span>
          </>
        )}
        <span>·</span>
        <span className="text-[9px]">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />+corr
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 mx-1 ml-2" />−corr
          <span className="text-muted-foreground/40 ml-2">ns = not significant (p&gt;0.05)</span>
        </span>
      </div>

      {/* Heatmap */}
      <HeatmapMatrix
        matrix={data.matrix}
        labels={displayLabels}
        pValues={data.pValues}
        lagApplied={!!lagBars}
      />

      {/* Top pairs + per-ticker averages */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <TopCorrelations matrix={data.matrix} labels={displayLabels} type="positive" />
        <TopCorrelations matrix={data.matrix} labels={displayLabels} type="negative" />
        {avgStats && (
          <>
            <div className="border border-border/30 rounded p-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Most Correlated w/ Universe (avg ρ)
              </div>
              <div className="space-y-0.5">
                {avgStats.most.map((t) => (
                  <div key={t.label} className="flex items-center gap-2 text-[11px] font-mono">
                    <span style={{ color: corrColor(t.avg) }} className="font-bold w-12 text-right">{t.avg.toFixed(3)}</span>
                    <span className="text-muted-foreground truncate">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-border/30 rounded p-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Best Diversifiers (lowest avg ρ)
              </div>
              <div className="space-y-0.5">
                {avgStats.least.map((t) => (
                  <div key={t.label} className="flex items-center gap-2 text-[11px] font-mono">
                    <span style={{ color: corrColor(t.avg) }} className="font-bold w-12 text-right">{t.avg.toFixed(3)}</span>
                    <span className="text-muted-foreground truncate">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Top correlations list ──
function TopCorrelations({
  matrix,
  labels,
  type,
}: {
  matrix: number[][];
  labels: string[];
  type: "positive" | "negative";
}) {
  const pairs = useMemo(() => {
    const arr: { a: string; b: string; corr: number }[] = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        arr.push({ a: labels[i], b: labels[j], corr: matrix[i][j] });
      }
    }
    if (type === "positive") {
      return arr.sort((a, b) => b.corr - a.corr).slice(0, 10);
    } else {
      return arr.sort((a, b) => a.corr - b.corr).slice(0, 10);
    }
  }, [matrix, labels, type]);

  return (
    <div className="border border-border/30 rounded p-2">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {type === "positive" ? "Highest Positive" : "Most Negative"} Correlations
      </div>
      <div className="space-y-0.5">
        {pairs.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
            <span style={{ color: corrColor(p.corr) }} className="font-bold w-12 text-right">
              {p.corr.toFixed(3)}
            </span>
            <span className="text-muted-foreground truncate">
              {formatSpec(p.a)} × {formatSpec(p.b)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
