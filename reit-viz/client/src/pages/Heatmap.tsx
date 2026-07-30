import React, { useState, useMemo, useCallback } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery } from "@tanstack/react-query";
import {
  getMultiMetricForAllTickers,
  getOhlcData,
  type ClassifiedBase,
} from "@/lib/dataService";
import { navigateToPairs } from "@/lib/navigateToPairs";
import { apiRequest } from "@/lib/queryClient";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { useUniverse } from "@/lib/universeContext";
import { useBasketScope, BasketScopeSelect } from "@/components/BasketScopeSelect";
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

// Columns that fold into the "Conviction" composite — the valuation lenses where
// cheap = attractive. Each name's conviction = mean attractiveness z across these
// (orientation-adjusted so + = cheap/long), so a high score = cheap on EVERYTHING.
const CONVICTION_KEYS = ["pffo_fy2", "paffo_fy2", "pe_fy2", "eveb_fy2", "ffo_yield", "div_yield", "imp_cap_rate"];

// Metrics that are computed from deltas on the client side (SI Δ) — no trailing history available
const COMPUTED_METRICS = new Set(["SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M"]);

// Metrics we can fetch trailing history for (exclude computed delta metrics)
const TRAILING_METRICS = [...new Set(
  COLUMNS.filter(c => !COMPUTED_METRICS.has(c.metric)).map(c => c.metric)
)];

// ── View mode: current metrics table vs pairwise ratio-dislocation matrix ──
type ViewMode = "metrics" | "matrix";

// Max tickers rendered in the N×N pair matrix (keeps compute + DOM bounded)
const MATRIX_CAP = 40;

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
  /** composite cheap-on-everything score (mean attractiveness z over CONVICTION_KEYS) */
  conviction: number | null;
  /** strongest single-metric dislocation (max |z| across columns) — for the filter */
  maxAbsZ: number;
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
  const basketScope = useBasketScope("reit-viz:basket-scope:heatmap");
  const [viewMode, setViewMode] = useState<ViewMode>("metrics");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("pffo_fy2");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [reference, setReference] = useState<Reference>("peers");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("raw");
  const [groupBy, setGroupBy] = useState<GroupLevel>("subindustry");
  // Peer z scope: vs the classification group (default) or the whole universe.
  const [peerScope, setPeerScope] = useState<"group" | "universe">("group");
  // Dislocation filter: hide rows whose strongest |z| is below this (0 = off).
  const [minZ, setMinZ] = useState(0);
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const [trailingDays, setTrailingDays] = useState(250);
  const [customDaysInput, setCustomDaysInput] = useState("");

  const serializeHeatmap = useCallback(() => ({
    viewMode,
    sortCol,
    sortDir,
    reference,
    displayMode,
    groupBy,
    classFilters: serializeClassFilters(classFilters),
    manualTickers: [...manualTickers],
    trailingDays, peerScope, minZ,
  }), [viewMode, sortCol, sortDir, reference, displayMode, groupBy, classFilters, manualTickers, trailingDays, peerScope, minZ]);

  const restoreHeatmap = useCallback((state: any) => {
    // Whitelist: the render branches are "matrix" and "metrics", so an unknown value
    // would show neither panel — a blank page with only the toolbar.
    if (state.viewMode === "matrix" || state.viewMode === "metrics") setViewMode(state.viewMode);
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
    if (state.peerScope === "group" || state.peerScope === "universe") setPeerScope(state.peerScope);
    if (typeof state.minZ === "number") setMinZ(state.minZ);
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
      conviction: null,
      maxAbsZ: 0,
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

        if (groups && peerScope === "group") {
          for (const [, groupRows] of groups) {
            computeForGroup(groupRows);
          }
        } else {
          // No grouping, or "vs Universe" scope — compare across the full universe.
          computeForGroup(rows);
        }
      }
    }

    // Composite conviction + strongest dislocation per row (from the z's just set).
    for (const r of rows) {
      let sum = 0, cnt = 0, maxAbs = 0;
      for (const col of COLUMNS) {
        const z = r.zScores[col.key];
        if (z === null || z === undefined) continue;
        if (Math.abs(z) > maxAbs) maxAbs = Math.abs(z);
        if (CONVICTION_KEYS.includes(col.key)) {
          sum += (col.lowerIsGreen !== false ? -z : z); // + = cheap/attractive
          cnt++;
        }
      }
      r.conviction = cnt >= 2 ? sum / cnt : null;
      r.maxAbsZ = maxAbs;
    }

    return [...rows];
  }, [rows, reference, trailingMap, groupBy, peerScope]);

  const geo = useGeoFilter(enrichedRows, "heatmap-geo");

  // Filter
  const filtered = useMemo(() => {
    let base = enrichedRows;
    if (universeTickers) base = base.filter(r => universeTickers.has(r.ticker));
    if (basketScope.members) base = base.filter(r => basketScope.inScope(r.ticker));
    let out = geo.filterByGeo(applyClassFilters(base, classFilters, search, manualTickers));
    // Dislocation filter: keep only names with a strong enough single-metric signal.
    if (minZ > 0) out = out.filter(r => r.maxAbsZ >= minZ);
    return out;
  }, [enrichedRows, classFilters, search, manualTickers, universeTickers, basketScope.members, geo.filterByGeo, minZ]);

  // Sort
  const sorted = useMemo(() => {
    if (sortCol === "conviction") {
      const miss = sortDir === "asc" ? Infinity : -Infinity;
      return [...filtered].sort((a, b) => {
        const va = a.conviction ?? miss, vb = b.conviction ?? miss;
        return sortDir === "asc" ? va - vb : vb - va;
      });
    }
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

  // ── Pair Matrix: scoped tickers (capped) reuse the same scope pipeline as the table ──
  // Takes them in the order the table RENDERS (group by group when grouping is on), so
  // "first 40" means the first 40 rows the user is looking at. Sorts on raw values so the
  // leg set is independent of displayMode: that only changes how values are shown, and
  // routing it through `sorted` silently swapped which 40 legs the matrix used — and
  // refetched all 40 series — when the user merely switched Z-Scores ↔ Percentiles.
  const matrixTickers = useMemo(() => {
    const colDef = COLUMNS.find(c => c.key === sortCol);
    const base = colDef
      ? [...filtered].sort((a, b) => {
          const miss = sortDir === "asc" ? Infinity : -Infinity;
          const va = a.values[colDef.metric] ?? miss;
          const vb = b.values[colDef.metric] ?? miss;
          return sortDir === "asc" ? va - vb : vb - va;
        })
      : filtered;
    const g = groupByLevel(base, groupBy);
    const rows = g ? [...g.values()].flat() : base;
    return rows.slice(0, MATRIX_CAP).map(r => r.ticker);
  }, [filtered, sortCol, sortDir, groupBy]);
  const matrixTickerKey = matrixTickers.join(",");

  // Fetch per-ticker close series (bounded concurrency); only in matrix mode
  const { data: closeSeriesMap, isLoading: loadingMatrix } = useQuery({
    queryKey: ["heatmap-matrix-series", matrixTickerKey, trailingDays],
    enabled: viewMode === "matrix" && matrixTickers.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const map = new Map<string, { times: string[]; closes: number[] }>();
      const batchSize = 8;
      for (let i = 0; i < matrixTickers.length; i += batchSize) {
        const batch = matrixTickers.slice(i, i + batchSize);
        await Promise.all(batch.map(async (t) => {
          try {
            const ohlc = await getOhlcData(t);
            const times: string[] = [];
            const closes: number[] = [];
            for (const p of ohlc) {
              if (Number.isFinite(p.close)) {
                times.push(p.time);
                closes.push(p.close);
              }
            }
            map.set(t, { times, closes });
          } catch {
            map.set(t, { times: [], closes: [] });
          }
        }));
      }
      return map;
    },
  });

  // Build the N×N ratio-dislocation matrix.
  // Cell (A,B) = z-score (or percentile) of the CURRENT price ratio closeA/closeB
  // vs that ratio's own trailing history within the trailingDays window.
  const matrixData = useMemo(() => {
    if (!closeSeriesMap) return null;
    const tickers = matrixTickers;
    const usePct = displayMode === "percentile";
    // "Raw Values" shows the ratio itself (still tinted by z, as in metrics mode);
    // "No Color" drops the tint. Previously both silently fell through to the z branch.
    const useRaw = displayMode === "raw";
    const noColor = displayMode === "none";
    // date → close lookup per ticker (for inner-join by date)
    const dmap = new Map<string, Map<string, number>>();
    for (const t of tickers) {
      const s = closeSeriesMap.get(t);
      const m = new Map<string, number>();
      if (s) for (let i = 0; i < s.times.length; i++) m.set(s.times[i], s.closes[i]);
      dmap.set(t, m);
    }
    const rows = tickers.map(a => {
      const sa = closeSeriesMap.get(a);
      const cells = tickers.map(b => {
        const key = `${a}-${b}`;
        if (a === b) {
          return { key, a, b, diag: true, text: "", bg: "transparent", title: "" };
        }
        const mb = dmap.get(b)!;
        const ratios: number[] = [];
        // Leg vintages differ across the universe, so a cell's "current" is the last
        // date BOTH legs trade on — surfaced in the tooltip so stale cells are visible.
        let lastJoined: string | undefined;
        if (sa) {
          for (let i = 0; i < sa.times.length; i++) {
            const ca = sa.closes[i];
            const cb = mb.get(sa.times[i]);
            if (cb !== undefined && cb !== 0 && Number.isFinite(ca) && Number.isFinite(cb)) {
              const r = ca / cb;
              if (Number.isFinite(r)) { ratios.push(r); lastJoined = sa.times[i]; }
            }
          }
        }
        const windowed = trailingDays > 0 ? ratios.slice(-trailingDays) : ratios;
        if (windowed.length < 20) {
          return {
            key, a, b, diag: false, text: "—", bg: "transparent",
            title: `${a}/${b}  insufficient overlap (n ${windowed.length})`,
          };
        }
        const current = windowed[windowed.length - 1];
        const z = historicalZScore(current, windowed);
        const pct = historicalPercentile(current, windowed);
        let text = "—";
        let bg = "transparent";
        if (usePct) {
          if (pct !== null) { text = pct.toFixed(0) + "%"; bg = pctColor(pct, false); }
        } else if (useRaw) {
          text = current.toFixed(3);
          if (z !== null) bg = zColor(z, false);
        } else if (z !== null) {
          // -0.0 / +0.0 reads as a rendering artifact; show a plain 0.0 near zero.
          const zr = z.toFixed(1);
          text = Number(zr) === 0 ? "0.0" : (z >= 0 ? "+" : "") + zr;
          bg = zColor(z, false);
        }
        if (noColor) bg = "transparent";
        const asOf = lastJoined;
        const title =
          `${a}/${b}  ratio ${current.toFixed(3)}  z ${z !== null ? z.toFixed(2) : "n/a"}` +
          `  pctile ${pct !== null ? pct.toFixed(0) + "%" : "n/a"}  n ${windowed.length}` +
          (asOf ? `  as of ${asOf}` : "");
        return { key, a, b, diag: false, text, bg, title };
      });
      return { ticker: a, cells };
    });
    return { tickers, rows };
  }, [closeSeriesMap, matrixTickers, trailingDays, displayMode]);

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

  // Drill-through to the Charts tab for a name+metric (same hand-off Re-Rate/SI use).
  const openInCharts = useCallback((ticker: string, metric: string) => {
    try {
      sessionStorage.setItem("reit-viz:rerate-to-charts", JSON.stringify({ ticker, metricKey: metric, lookbackDays: trailingDays }));
    } catch {}
    window.location.hash = "#/";
  }, [trailingDays]);

  // CSV export — the metrics table, or the pair-matrix grid when in matrix mode.
  const exportCSV = useCallback(() => {
    const dl = (csv: string, name: string) => {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    };
    const today = new Date().toISOString().slice(0, 10);
    if (viewMode === "matrix" && matrixData) {
      const header = ["A\\B", ...matrixData.tickers].join(",");
      const lines = matrixData.rows.map(row =>
        [row.ticker, ...row.cells.map(c => (c.diag ? "" : (c.text ?? "").replace(/,/g, "")))].join(","));
      dl([header, ...lines].join("\n"), `relval_matrix_${displayMode}_${today}.csv`);
      return;
    }
    const groupLabel = groupBy !== "none" ? GROUP_LEVELS.find(g => g.value === groupBy)?.label || "Group" : "Subindustry";
    const refLabel = reference === "peers" ? "Peers" : `${trailingDays}d Hist`;
    const modeLabel = displayMode === "zscore" ? ` (Z vs ${refLabel})` : displayMode === "percentile" ? ` (Pctile vs ${refLabel})` : "";
    const header = ["Ticker", "Name", groupLabel, "Conviction", ...COLUMNS.map(c => c.label + modeLabel)].join(",");
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
      return [r.ticker, `"${r.name}"`, `"${groupVal}"`, r.conviction != null ? r.conviction.toFixed(2) : "", ...vals].join(",");
    });
    dl([header, ...lines].join("\n"), `relval_${displayMode}_${reference}_${today}.csv`);
  }, [sorted, displayMode, reference, groupBy, trailingDays, viewMode, matrixData]);

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
      <td
        className="px-2 py-1 text-right font-mono text-[11px] tabular-nums whitespace-nowrap sticky left-[300px] z-10 border-r border-border/40"
        style={{ backgroundColor: r.conviction != null ? zColor(r.conviction, false) : "transparent" }}
        title={`Conviction: mean cheap-z across valuation metrics (+ = cheap on everything, ${reference === "peers" ? (peerScope === "universe" ? "vs universe" : "vs group") : "vs history"})`}
      >
        {r.conviction != null ? (r.conviction >= 0 ? "+" : "") + r.conviction.toFixed(2) : "—"}
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
            className="px-2 py-1 text-right font-mono text-[11px] tabular-nums whitespace-nowrap cursor-pointer"
            style={{ backgroundColor: bg }}
            title={`${tooltip}${tooltip ? " · " : ""}click → Charts`}
            onClick={() => openInCharts(r.ticker, col.metric)}
          >
            {cellText}
          </td>
        );
      })}
    </tr>
  );

  const renderGroupHeader = (label: string, count: number) => (
    <tr key={`header-${label}`} className="bg-card/50">
      <td colSpan={4 + COLUMNS.length} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
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

        {/* View mode: metrics table vs pairwise ratio-dislocation matrix */}
        <Select value={viewMode} onValueChange={v => setViewMode(v as ViewMode)}>
          <SelectTrigger className="h-6 text-[11px] w-[120px]" data-testid="heatmap-view-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="metrics">Metrics</SelectItem>
            <SelectItem value="matrix">Pair Matrix</SelectItem>
          </SelectContent>
        </Select>

        <div className="mx-1 w-px h-4 bg-border" />

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
          extraFilters={geo.geoFilterUI}
        />

        <BasketScopeSelect scope={basketScope} className="h-6 text-[11px] w-auto min-w-[130px]" />

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

        {/* Peer scope: within the classification group, or vs the whole universe */}
        {reference === "peers" && (
          <div className="flex rounded border border-border overflow-hidden">
            {([["group", "Group"], ["universe", "Universe"]] as const).map(([s, label]) => (
              <button
                key={s}
                onClick={() => setPeerScope(s)}
                className={`h-6 px-2 text-[11px] ${peerScope === s ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                data-testid={`heatmap-peerscope-${s}`}
                title={s === "universe" ? "z vs the whole universe" : "z vs each name's classification group"}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Dislocation filter: only show names with a strong single-metric signal */}
        <div className="flex items-center gap-1" title="Hide names whose strongest |z| is below this">
          <span className="text-[10px] text-muted-foreground">|z|≥</span>
          <div className="flex rounded border border-border overflow-hidden">
            {[0, 1, 1.5, 2].map(v => (
              <button
                key={v}
                onClick={() => setMinZ(v)}
                className={`h-6 px-1.5 text-[11px] ${minZ === v ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                data-testid={`heatmap-minz-${v}`}
              >
                {v === 0 ? "off" : v}
              </button>
            ))}
          </div>
        </div>

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
          <SelectTrigger className="h-6 text-[11px] w-auto min-w-[155px]" data-testid="heatmap-group-select">
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

      {/* Matrix legend + convention */}
      {viewMode === "matrix" && (
        <div className="flex items-center gap-3 px-3 py-1 border-b border-border/30 bg-card/30 flex-shrink-0 flex-wrap">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
            Pair ratio A/B{" "}
            {displayMode === "percentile" ? "percentile" : displayMode === "raw" ? "value" : "z-score"} vs own{" "}
            {trailingDays}d history
          </span>
          <div className="flex items-center gap-0.5">
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.4)" }} />
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.2)" }} />
            <div className="w-5 h-3 rounded-sm border border-border/30" style={{ backgroundColor: "transparent" }} />
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: "rgba(34, 197, 94, 0.2)" }} />
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: "rgba(34, 197, 94, 0.4)" }} />
          </div>
          <span className="text-[9px] text-red-400">Ratio low (A cheap / B rich)</span>
          <span className="text-[9px] text-muted-foreground">→</span>
          <span className="text-[9px] text-green-400">Ratio high (A rich / B cheap)</span>
          {sorted.length > MATRIX_CAP && (
            <span className="text-[9px] text-yellow-400 ml-2">
              Showing first {MATRIX_CAP} of {sorted.length} — narrow scope via basket/filters.
            </span>
          )}
          {loadingMatrix && <span className="text-[9px] text-yellow-400 ml-2">Loading price series…</span>}
        </div>
      )}

      {/* Color legend */}
      {viewMode === "metrics" && displayMode !== "none" && (
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

      {/* Pair Matrix */}
      {viewMode === "matrix" && (
        <div className="flex-1 overflow-auto" data-testid="heatmap-matrix">
          {matrixTickers.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
              {loadingSnapshot ? (
                <>
                  {/* Restoring straight into matrix mode: the scope isn't empty yet, it's unloaded. */}
                  <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  Loading…
                </>
              ) : (
                "No tickers in scope."
              )}
            </div>
          ) : loadingMatrix || !matrixData ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
              <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
              Loading price series…
            </div>
          ) : (
            <table className="border-collapse text-[10px]">
              <thead className="sticky top-0 z-20 bg-card">
                <tr>
                  <th className="px-1.5 py-1 text-[10px] font-semibold text-muted-foreground sticky left-0 top-0 z-30 bg-card">
                    A \ B
                  </th>
                  {matrixData.tickers.map(b => (
                    <th key={b} className="px-1 py-1 font-mono font-bold text-primary text-[10px] bg-card text-center">
                      {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixData.rows.map(row => (
                  <tr key={row.ticker} className="hover:bg-accent/20" data-testid={`heatmap-matrix-row-${row.ticker}`}>
                    <td className="px-1.5 py-1 font-mono font-bold text-primary text-[10px] whitespace-nowrap sticky left-0 z-10 bg-background">
                      {row.ticker}
                    </td>
                    {row.cells.map(cell => (
                      <td
                        key={cell.key}
                        data-testid={`heatmap-matrix-cell-${cell.a}-${cell.b}`}
                        className={`px-1 py-1 text-right font-mono tabular-nums whitespace-nowrap ${cell.diag ? "bg-muted/20" : "cursor-pointer hover:ring-1 hover:ring-inset hover:ring-primary/60"}`}
                        style={{ backgroundColor: cell.bg }}
                        title={cell.title}
                        onClick={cell.diag ? undefined : () => navigateToPairs(cell.a, cell.b)}
                      >
                        {cell.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Table */}
      {viewMode === "metrics" && (
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
                <th
                  className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap sticky left-[300px] bg-card z-30 border-r border-border/40"
                  onClick={() => toggleSort("conviction")}
                  title="Conviction — mean cheap-z across valuation metrics (cheap on everything)"
                  data-testid="heatmap-sort-conviction"
                >
                  <div className="flex items-center justify-end gap-1">Conv<SortIcon colKey="conviction" /></div>
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
      )}
    </div>
  );
}
