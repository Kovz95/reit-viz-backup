import React, { useState, useMemo, useCallback } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery } from "@tanstack/react-query";
import {
  getMultiMetricForAllTickers,
  type ClassifiedBase,
} from "@/lib/dataService";
import { apiRequest } from "@/lib/queryClient";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useUniverse } from "@/lib/universeContext";
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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Grid3X3,
} from "lucide-react";

// ── Column definitions ──

interface ColDef {
  key: string;
  label: string;
  short: string;
  metric: string;
  format: "num" | "pct" | "x" | "pp";
  decimals?: number;
  /** If true, lower values = cheaper = green. Default true for valuation. */
  lowerIsGreen?: boolean;
}

const COLUMNS: ColDef[] = [
  { key: "pffo_fy2", label: "P/FFO FY2", short: "P/FFO", metric: "P/FFO FY2", format: "x", decimals: 1, lowerIsGreen: true },
  { key: "paffo_fy2", label: "P/AFFO FY2", short: "P/AFFO", metric: "P/AFFO FY2", format: "x", decimals: 1, lowerIsGreen: true },
  { key: "pe_fy2", label: "P/E FY2", short: "P/E", metric: "P/E FY2", format: "x", decimals: 1, lowerIsGreen: true },
  { key: "eveb_fy2", label: "EV/EBITDA FY2", short: "EV/EB", metric: "EV/EBITDA FY2", format: "x", decimals: 1, lowerIsGreen: true },
  { key: "ffo_yield", label: "FFO Yield FY2", short: "FFO Yld", metric: "FFO Yield FY2", format: "pct", decimals: 1, lowerIsGreen: false },
  { key: "div_yield", label: "Dividend Yield", short: "Div Yld", metric: "Dividend Yield", format: "pct", decimals: 2, lowerIsGreen: false },
  { key: "ffo_gr_fy1", label: "FY1 FFO Growth", short: "FFO Gr1", metric: "FY1 FFO Growth", format: "pct", decimals: 1, lowerIsGreen: false },
  { key: "ffo_gr_fy2", label: "FY2 FFO Growth", short: "FFO Gr2", metric: "FY2 FFO Growth", format: "pct", decimals: 1, lowerIsGreen: false },
  { key: "off_52h", label: "% off 52wk High", short: "vs 52H", metric: "% off 52wk High", format: "pct", decimals: 1, lowerIsGreen: false },
  { key: "chg_1m", label: "1M Price Chg%", short: "1M Chg", metric: "1M Price Chg%", format: "pct", decimals: 1, lowerIsGreen: false },
  { key: "short_int", label: "Short Interest%", short: "SI%", metric: "Short Interest%", format: "pct", decimals: 1, lowerIsGreen: true },
  { key: "si_d1w", label: "SI Δ 1W", short: "SIΔ1W", metric: "SI Δ 1W", format: "pp", decimals: 2, lowerIsGreen: true },
  { key: "si_d1m", label: "SI Δ 1M", short: "SIΔ1M", metric: "SI Δ 1M", format: "pp", decimals: 2, lowerIsGreen: true },
  { key: "si_d3m", label: "SI Δ 3M", short: "SIΔ3M", metric: "SI Δ 3M", format: "pp", decimals: 2, lowerIsGreen: true },
  { key: "buy_pct", label: "Buy%", short: "Buy%", metric: "Bull%", format: "pct", decimals: 0, lowerIsGreen: false },
  // LTM variants
  { key: "pffo_ltm", label: "P/FFO LTM", short: "P/FFO L", metric: "P/FFO LTM", format: "x", decimals: 1, lowerIsGreen: true },
  { key: "paffo_ltm", label: "P/AFFO LTM", short: "P/AFFO L", metric: "P/AFFO LTM", format: "x", decimals: 1, lowerIsGreen: true },
  { key: "pe_ltm", label: "P/E LTM", short: "P/E L", metric: "P/E LTM", format: "x", decimals: 1, lowerIsGreen: true },
  { key: "eveb_ltm", label: "EV/EBITDA LTM", short: "EV/EB L", metric: "EV/EBITDA LTM", format: "x", decimals: 1, lowerIsGreen: true },
  // Additional Yields
  { key: "affo_yield_fy2", label: "AFFO Yield FY2", short: "AFFO Yld", metric: "AFFO Yield FY2", format: "pct", decimals: 1, lowerIsGreen: false },
  { key: "ffo_yield_ltm", label: "FFO Yield LTM", short: "FFO Y L", metric: "FFO Yield LTM", format: "pct", decimals: 1, lowerIsGreen: false },
  { key: "affo_yield_ltm", label: "AFFO Yield LTM", short: "AFFO Y L", metric: "AFFO Yield LTM", format: "pct", decimals: 1, lowerIsGreen: false },
  // Growth
  { key: "affo_gr_fy1", label: "FY1 AFFO Growth", short: "AFFO Gr1", metric: "FY1 AFFO Growth", format: "pct", decimals: 1, lowerIsGreen: false },
  { key: "affo_gr_fy2", label: "FY2 AFFO Growth", short: "AFFO Gr2", metric: "FY2 AFFO Growth", format: "pct", decimals: 1, lowerIsGreen: false },
  { key: "eps_gr_fy1", label: "FY1 EPS Growth", short: "EPS Gr1", metric: "FY1 EPS Growth", format: "pct", decimals: 1, lowerIsGreen: false },
  { key: "eps_gr_fy2", label: "FY2 EPS Growth", short: "EPS Gr2", metric: "FY2 EPS Growth", format: "pct", decimals: 1, lowerIsGreen: false },
  // Implied Cap Rate
  { key: "imp_cap_rate", label: "Implied Cap Rate", short: "Cap Rate", metric: "Implied Cap Rate", format: "pct", decimals: 2, lowerIsGreen: false },
];

const ALL_METRICS = COLUMNS.map(c => c.metric);

// Metrics that are computed from deltas on the client side (SI Δ) — no trailing history available
const COMPUTED_METRICS = new Set(["SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M"]);

// Metrics we can fetch trailing history for (exclude computed delta metrics)
const TRAILING_METRICS = [...new Set(
  COLUMNS.filter(c => !COMPUTED_METRICS.has(c.metric)).map(c => c.metric)
)];

// ── Two orthogonal controls ──
// Reference: what are we comparing against?
type Reference = "peers" | "history";
// Display: what numbers to show + what drives color?
type DisplayMode = "raw" | "zscore" | "percentile" | "none";

// ── Helper: compute z-scores within a group ──
function zScoresForColumn(
  values: (number | null)[],
): (number | null)[] {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 3) return values.map(() => null);
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const std = Math.sqrt(valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length);
  if (std < 1e-9) return values.map(() => null);
  return values.map(v => (v !== null ? (v - mean) / std : null));
}

// ── Peer percentiles within a group ──
function peerPercentilesForColumn(
  values: (number | null)[],
): (number | null)[] {
  const validVals = values.filter((v): v is number => v !== null);
  if (validVals.length < 2) return values.map(() => null);
  return values.map(v => {
    if (v === null) return null;
    const below = validVals.filter(x => x < v).length;
    return (below / validVals.length) * 100;
  });
}

// ── Color mapping: z-score → cell background ──
function zColor(z: number | null, lowerIsGreen: boolean): string {
  if (z === null) return "transparent";
  const adjusted = lowerIsGreen ? -z : z;
  const clamped = Math.max(-3, Math.min(3, adjusted));
  if (clamped >= 0) {
    const t = clamped / 3;
    const alpha = 0.12 + t * 0.38;
    return `rgba(34, 197, 94, ${alpha.toFixed(3)})`;
  } else {
    const t = -clamped / 3;
    const alpha = 0.12 + t * 0.38;
    return `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
  }
}

// ── Color mapping: percentile → cell background ──
function pctColor(pct: number | null, lowerIsGreen: boolean): string {
  if (pct === null) return "transparent";
  // Map 0..100 percentile to a -3..+3 z-like scale for the same color range
  const normalized = ((pct - 50) / 50) * 3; // 0%→-3, 50%→0, 100%→+3
  return zColor(normalized, lowerIsGreen);
}

// ── Historical percentile for a value against trailing values ──
function historicalPercentile(current: number, trailing: number[]): number | null {
  if (trailing.length < 5) return null;
  const below = trailing.filter(v => v < current).length;
  return (below / trailing.length) * 100;
}

// ── Historical z-score ──
function historicalZScore(current: number, trailing: number[]): number | null {
  if (trailing.length < 20) return null;
  const mean = trailing.reduce((a, b) => a + b, 0) / trailing.length;
  const std = Math.sqrt(trailing.reduce((a, b) => a + (b - mean) ** 2, 0) / trailing.length);
  if (std < 1e-9) return null;
  return (current - mean) / std;
}

// ── Format value ──
function fmtVal(v: number | null, col: ColDef): string {
  if (v === null || isNaN(v)) return "—";
  const d = col.decimals ?? 1;
  if (col.format === "pct") return v.toFixed(d) + "%";
  if (col.format === "x") return v.toFixed(d) + "x";
  if (col.format === "pp") return (v >= 0 ? "+" : "") + v.toFixed(d) + "pp";
  return v.toFixed(d);
}

// ── Subindustry short names ──
function shortSubindustry(s: string): string {
  return s
    .replace(" Equity REITs", "")
    .replace("Healthcare and Life Sciences", "Healthcare")
    .replace("Industrial and Warehouse", "Industrial")
    .replace("Hotel and Motel", "Hotels");
}

// ── Row type ──
interface HeatmapRow extends ClassifiedBase {
  values: Record<string, number | null>;
  zScores: Record<string, number | null>;
  percentiles: Record<string, number | null>;
}

// ── Classification grouping levels ──
const GROUP_LEVELS = [
  { value: "none", label: "No grouping" },
  { value: "economy", label: "Economy" },
  { value: "sector", label: "Sector" },
  { value: "subsector", label: "Subsector" },
  { value: "industryGroup", label: "Industry Group" },
  { value: "industry", label: "Industry" },
  { value: "subindustry", label: "Subindustry" },
] as const;

type GroupLevel = typeof GROUP_LEVELS[number]["value"];

function groupByLevel(rows: HeatmapRow[], level: GroupLevel): Map<string, HeatmapRow[]> | null {
  if (level === "none") return null;
  const map = new Map<string, HeatmapRow[]>();
  for (const row of rows) {
    const key = (row as any)[level] || "Other";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

// ── Lookback presets ──
const LOOKBACK_PRESETS = [
  { label: "6M", days: 125 },
  { label: "1Y", days: 250 },
  { label: "3Y", days: 750 },
  { label: "5Y", days: 1260 },
];

export default function Heatmap() {
  const { universeTickers } = useUniverse();
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("pffo_fy2");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [reference, setReference] = useState<Reference>("peers");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("raw");
  const [groupBy, setGroupBy] = useState<GroupLevel>("subindustry");
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [trailingDays, setTrailingDays] = useState(250);
  const [customDaysInput, setCustomDaysInput] = useState("");

  const serializeHeatmap = useCallback(() => ({
    sortCol,
    sortDir,
    reference,
    displayMode,
    groupBy,
    classFilters: serializeClassFilters(classFilters),
    manualTickers: [...manualTickers],
    trailingDays,
  }), [sortCol, sortDir, reference, displayMode, groupBy, classFilters, manualTickers, trailingDays]);

  const restoreHeatmap = useCallback((state: any) => {
    if (state.sortCol !== undefined) setSortCol(state.sortCol);
    if (state.sortDir !== undefined) setSortDir(state.sortDir);
    // Migrate old colorMode → reference
    if (state.reference !== undefined) {
      setReference(state.reference as Reference);
    } else if (state.colorMode !== undefined) {
      setReference(state.colorMode === "zscore_hist" ? "history" : "peers");
    }
    if (state.displayMode !== undefined) setDisplayMode(state.displayMode as DisplayMode);
    if (state.groupBy !== undefined) setGroupBy(state.groupBy as GroupLevel);
    if (state.classFilters !== undefined) setClassFilters(deserializeClassFilters(state.classFilters));
    if (state.manualTickers !== undefined) setManualTickers(new Set(state.manualTickers));
    if (state.trailingDays !== undefined) setTrailingDays(state.trailingDays);
  }, []);

  useWorkspaceTab("heatmap", serializeHeatmap, restoreHeatmap);

  // Fetch current snapshot (raw latest values for all metrics)
  const { data: snapshot, isLoading: loadingSnapshot } = useQuery({
    queryKey: ["heatmap-snapshot", ALL_METRICS],
    queryFn: () => getMultiMetricForAllTickers(ALL_METRICS, undefined, 5),
    staleTime: 5 * 60_000,
  });

  // Fetch trailing data for ALL metrics via the multi-metric batch endpoint
  // (only needed for "history" reference, but fetch proactively so switching is instant)
  const { data: trailingMulti, isLoading: loadingTrailing } = useQuery({
    queryKey: ["heatmap-trailing-multi", TRAILING_METRICS, trailingDays],
    queryFn: async () => {
      const resp = await apiRequest("POST", "/api/batch-trailing-multi", {
        metrics: TRAILING_METRICS,
        trailingDays,
      });
      if (!resp.ok) throw new Error("Failed to fetch trailing data");
      const json = await resp.json();
      return json.data as Record<string, Record<string, { current: number | null; values: number[] }>>;
    },
    staleTime: 5 * 60_000,
  });

  // Build the trailing lookup: metric → ticker → values[]
  const trailingMap = useMemo(() => {
    if (!trailingMulti) return new Map<string, Map<string, number[]>>();
    const outer = new Map<string, Map<string, number[]>>();
    for (const [metric, tickerData] of Object.entries(trailingMulti)) {
      const inner = new Map<string, number[]>();
      for (const [ticker, d] of Object.entries(tickerData)) {
        inner.set(ticker, d.values);
      }
      outer.set(metric, inner);
    }
    return outer;
  }, [trailingMulti]);

  // Build rows
  const rows = useMemo((): HeatmapRow[] => {
    if (!snapshot) return [];
    return snapshot.map(t => ({
      ticker: t.ticker,
      name: t.name,
      economy: t.economy || "",
      sector: t.sector || "",
      subsector: t.subsector || "",
      industryGroup: t.industryGroup || "",
      industry: t.industry || "",
      subindustry: t.subindustry || "Other",
      values: t.values,
      zScores: {},
      percentiles: {},
    }));
  }, [snapshot]);

  // Compute z-scores and percentiles based on chosen reference
  const enrichedRows = useMemo(() => {
    if (rows.length === 0) return rows;

    const peerLevel = groupBy !== "none" ? groupBy : "subindustry";
    const groups = groupByLevel(rows, peerLevel as GroupLevel);

    for (const col of COLUMNS) {
      if (reference === "history") {
        // vs History: each ticker compared to its own trailing data
        const metricTrailing = trailingMap.get(col.metric);
        for (const r of rows) {
          const trailing = metricTrailing?.get(r.ticker);
          const current = r.values[col.metric];
          if (trailing && current !== null) {
            r.zScores[col.key] = historicalZScore(current, trailing);
            r.percentiles[col.key] = historicalPercentile(current, trailing);
          } else {
            r.zScores[col.key] = null;
            r.percentiles[col.key] = null;
          }
        }
      } else {
        // vs Peers: within the classification group
        const computeForGroup = (groupRows: HeatmapRow[]) => {
          const vals = groupRows.map(r => r.values[col.metric] ?? null);
          const zs = zScoresForColumn(vals);
          const pcts = peerPercentilesForColumn(vals);
          groupRows.forEach((r, i) => {
            r.zScores[col.key] = zs[i];
            r.percentiles[col.key] = pcts[i];
          });
        };

        if (groups) {
          for (const [, groupRows] of groups) {
            computeForGroup(groupRows);
          }
        } else {
          // No grouping — compute over full universe
          computeForGroup(rows);
        }
      }
    }

    return [...rows];
  }, [rows, reference, trailingMap, groupBy]);

  // Filter
  const filtered = useMemo(() => {
    let base = enrichedRows;
    if (universeTickers) base = base.filter(r => universeTickers.has(r.ticker));
    return applyClassFilters(base, classFilters, search, manualTickers);
  }, [enrichedRows, classFilters, search, manualTickers, universeTickers]);

  // Sort
  const sorted = useMemo(() => {
    const colDef = COLUMNS.find(c => c.key === sortCol);
    if (!colDef) return filtered;
    return [...filtered].sort((a, b) => {
      let va: number, vb: number;
      if (displayMode === "zscore") {
        va = a.zScores[colDef.key] ?? (sortDir === "asc" ? Infinity : -Infinity);
        vb = b.zScores[colDef.key] ?? (sortDir === "asc" ? Infinity : -Infinity);
      } else if (displayMode === "percentile") {
        va = a.percentiles[colDef.key] ?? (sortDir === "asc" ? Infinity : -Infinity);
        vb = b.percentiles[colDef.key] ?? (sortDir === "asc" ? Infinity : -Infinity);
      } else {
        va = a.values[colDef.metric] ?? (sortDir === "asc" ? Infinity : -Infinity);
        vb = b.values[colDef.metric] ?? (sortDir === "asc" ? Infinity : -Infinity);
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [filtered, sortCol, sortDir, displayMode]);

  // Grouped
  const grouped = useMemo(() => {
    return groupByLevel(sorted, groupBy);
  }, [sorted, groupBy]);

  const toggleSort = useCallback((key: string) => {
    if (sortCol === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(key);
      setSortDir("asc");
    }
  }, [sortCol]);

  // Apply custom days from text input
  const applyCustomDays = useCallback(() => {
    const parsed = parseInt(customDaysInput);
    if (!isNaN(parsed) && parsed >= 5 && parsed <= 5000) {
      setTrailingDays(parsed);
      setCustomDaysInput("");
    }
  }, [customDaysInput]);

  // CSV export
  const exportCSV = useCallback(() => {
    const groupLabel = groupBy !== "none" ? GROUP_LEVELS.find(g => g.value === groupBy)?.label || "Group" : "Subindustry";
    const refLabel = reference === "peers" ? "Peers" : `${trailingDays}d Hist`;
    const modeLabel = displayMode === "zscore" ? ` (Z vs ${refLabel})` : displayMode === "percentile" ? ` (Pctile vs ${refLabel})` : "";
    const header = ["Ticker", "Name", groupLabel, ...COLUMNS.map(c => c.label + modeLabel)].join(",");
    const lines = sorted.map(r => {
      const groupVal = groupBy !== "none" ? ((r as any)[groupBy] || "Other") : r.subindustry;
      const vals = COLUMNS.map(c => {
        if (displayMode === "zscore") {
          const z = r.zScores[c.key];
          return z !== null && z !== undefined ? z.toFixed(2) : "";
        } else if (displayMode === "percentile") {
          const p = r.percentiles[c.key];
          return p !== null && p !== undefined ? p.toFixed(1) : "";
        }
        const v = r.values[c.metric];
        return v !== null && v !== undefined ? v.toFixed(c.decimals ?? 1) : "";
      });
      return [r.ticker, `"${r.name}"`, `"${groupVal}"`, ...vals].join(",");
    });
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relval_${displayMode}_${reference}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted, displayMode, reference, groupBy, trailingDays]);

  // ── Render helpers ──
  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortCol !== colKey) return <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-2.5 h-2.5 text-primary" />
      : <ArrowDown className="w-2.5 h-2.5 text-primary" />;
  };

  // Determine cell background color based on display mode
  const getCellBg = (r: HeatmapRow, col: ColDef): string => {
    if (displayMode === "none") return "transparent";
    const lowerGreen = col.lowerIsGreen !== false;
    if (displayMode === "percentile") {
      return pctColor(r.percentiles[col.key], lowerGreen);
    }
    // For "raw" and "zscore": color by z-score
    return zColor(r.zScores[col.key], lowerGreen);
  };

  const renderRow = (r: HeatmapRow) => (
    <tr key={r.ticker} className="hover:bg-accent/30 transition-colors" data-testid={`heatmap-row-${r.ticker}`}>
      <td className="px-2 py-1 font-mono font-bold text-primary text-[11px] whitespace-nowrap sticky left-0 bg-background z-10">
        {r.ticker}
      </td>
      <td className="px-2 py-1 text-[10px] text-muted-foreground truncate max-w-[140px] sticky left-[60px] bg-background z-10">
        {r.name}
      </td>
      <td className="px-2 py-1 text-[10px] text-muted-foreground whitespace-nowrap sticky left-[200px] bg-background z-10">
        {groupBy === "subindustry" || groupBy === "none" ? shortSubindustry(r.subindustry) : (r as any)[groupBy] || "Other"}
      </td>
      {COLUMNS.map(col => {
        const v = r.values[col.metric];
        const bg = getCellBg(r, col);
        let cellText: string;
        if (displayMode === "zscore") {
          const zVal = r.zScores[col.key];
          cellText = zVal !== null && zVal !== undefined ? zVal.toFixed(2) : "—";
        } else if (displayMode === "percentile") {
          const pct = r.percentiles[col.key];
          cellText = pct !== null && pct !== undefined ? pct.toFixed(0) + "%" : "—";
        } else {
          cellText = fmtVal(v, col);
        }
        // Tooltip: show all three representations
        const rawStr = fmtVal(v, col);
        const zVal = r.zScores[col.key];
        const pVal = r.percentiles[col.key];
        const parts: string[] = [];
        if (displayMode !== "raw") parts.push(`Raw: ${rawStr}`);
        if (displayMode !== "zscore" && zVal !== null && zVal !== undefined) parts.push(`Z: ${zVal.toFixed(2)}`);
        if (displayMode !== "percentile" && pVal !== null && pVal !== undefined) parts.push(`Pctile: ${pVal.toFixed(0)}%`);
        const tooltip = parts.join(" | ");
        return (
          <td
            key={col.key}
            className="px-2 py-1 text-right font-mono text-[11px] tabular-nums whitespace-nowrap"
            style={{ backgroundColor: bg }}
            title={tooltip}
          >
            {cellText}
          </td>
        );
      })}
    </tr>
  );

  const renderGroupHeader = (label: string, count: number) => (
    <tr key={`header-${label}`} className="bg-card/50">
      <td colSpan={3 + COLUMNS.length} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label} <span className="font-normal ml-1 opacity-60">({count})</span>
      </td>
    </tr>
  );

  // Is the current trailing days one of the presets?
  const isPreset = LOOKBACK_PRESETS.some(p => p.days === trailingDays);

  // Build legend text
  const refLabel = reference === "peers"
    ? (groupBy !== "none" ? GROUP_LEVELS.find(g => g.value === groupBy)?.label : "Subindustry") + " Peers"
    : `Own ${trailingDays}d History`;
  const displayLabel = displayMode === "zscore" ? "Z-Score" : displayMode === "percentile" ? "Percentile" : displayMode === "raw" ? "Raw (colored by Z-Score)" : "";

  return (
    <div className="flex flex-col h-full" data-testid="heatmap-page">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card flex-shrink-0 flex-wrap">
        <Grid3X3 className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-bold text-foreground mr-2">Relative Value</span>

        <ClassificationFilters
          filters={classFilters}
          onFiltersChange={setClassFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={sorted.length}
          totalCount={enrichedRows.length}
          testIdPrefix="heatmap"
        />

        <div className="mx-1 w-px h-4 bg-border" />

        {/* Reference: what to compare against */}
        <Select value={reference} onValueChange={v => setReference(v as Reference)}>
          <SelectTrigger className="h-6 text-[11px] w-[120px]" data-testid="heatmap-reference">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="peers">vs Peers</SelectItem>
            <SelectItem value="history">vs History</SelectItem>
          </SelectContent>
        </Select>

        {/* Display: what to show and how to color */}
        <Select value={displayMode} onValueChange={v => setDisplayMode(v as DisplayMode)}>
          <SelectTrigger className="h-6 text-[11px] w-[120px]" data-testid="heatmap-display-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="raw">Raw Values</SelectItem>
            <SelectItem value="zscore">Z-Scores</SelectItem>
            <SelectItem value="percentile">Percentiles</SelectItem>
            <SelectItem value="none">No Color</SelectItem>
          </SelectContent>
        </Select>

        <div className="mx-1 w-px h-4 bg-border" />

        {/* Lookback presets + custom input */}
        <div className="flex items-center gap-0.5">
          {LOOKBACK_PRESETS.map(p => (
            <Button
              key={p.days}
              variant={trailingDays === p.days ? "default" : "outline"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setTrailingDays(p.days)}
            >
              {p.label}
            </Button>
          ))}
          <div className="flex items-center gap-0.5 ml-1">
            <Input
              type="number"
              placeholder="Days"
              value={customDaysInput}
              onChange={e => setCustomDaysInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyCustomDays()}
              className="h-6 w-[60px] text-[10px] px-1.5"
              min={5}
              max={5000}
            />
            {customDaysInput && (
              <Button variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" onClick={applyCustomDays}>
                Go
              </Button>
            )}
          </div>
          {!isPreset && (
            <span className="text-[10px] text-muted-foreground ml-1">{trailingDays}d</span>
          )}
        </div>

        <div className="mx-1 w-px h-4 bg-border" />

        {/* Group by */}
        <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupLevel)}>
          <SelectTrigger className="h-6 text-[11px] w-[130px]" data-testid="heatmap-group-select">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            {GROUP_LEVELS.map(g => (
              <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={exportCSV} data-testid="heatmap-export">
          <Download className="w-3 h-3" />
          CSV
        </Button>
      </div>

      {/* Color legend */}
      {displayMode !== "none" && (
        <div className="flex items-center gap-3 px-3 py-1 border-b border-border/30 bg-card/30 flex-shrink-0">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
            {displayLabel} vs {refLabel}
          </span>
          <div className="flex items-center gap-0.5">
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.4)" }} />
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.2)" }} />
            <div className="w-5 h-3 rounded-sm border border-border/30" style={{ backgroundColor: "transparent" }} />
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: "rgba(34, 197, 94, 0.2)" }} />
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: "rgba(34, 197, 94, 0.4)" }} />
          </div>
          <span className="text-[9px] text-red-400">Expensive</span>
          <span className="text-[9px] text-muted-foreground">→</span>
          <span className="text-[9px] text-green-400">Cheap</span>
          {loadingTrailing && reference === "history" && (
            <span className="text-[9px] text-yellow-400 ml-2">Loading trailing data...</span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loadingSnapshot ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading heatmap data...
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-card">
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-0 bg-card z-30 w-[60px]">
                  Ticker
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-[60px] bg-card z-30 w-[140px]">
                  Name
                </th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky left-[200px] bg-card z-30 w-[100px]">
                  {groupBy !== "none" ? GROUP_LEVELS.find(g => g.value === groupBy)?.label || "Group" : "Subindustry"}
                </th>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                    onClick={() => toggleSort(col.key)}
                    title={col.label}
                    data-testid={`heatmap-sort-${col.key}`}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {col.short}
                      <SortIcon colKey={col.key} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped ? (
                Array.from(grouped.entries()).map(([label, groupRows]) => (
                  <React.Fragment key={label}>{renderGroupHeader(label, groupRows.length)}{groupRows.map(renderRow)}</React.Fragment>
                ))
              ) : (
                sorted.map(renderRow)
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
