// Reconstructed from recovered-bundle/DataExplorer-Y0Xg6AZ4.js on 2026-06-11

import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { createLucideIcon } from "@/lib/createLucideIcon";
import { usePageState } from "@/lib/pageState";
import { getTickers } from "@/lib/dataService";
import { getDates } from "@/lib/dataService";
import { getTickerRaw } from "@/lib/dataService";
import { metricMultiplier, isPercentMetric } from "@/lib/dataService";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronsUpDown,
  Search,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Download,
} from "lucide-react";
import { ArrowUpDown } from "lucide-react";
import { Pin } from "lucide-react";

const Columns2Icon = createLucideIcon("Columns2", [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M12 3v18", key: "108xh3" }],
]);

const PinOffIcon = createLucideIcon("PinOff", [
  ["path", { d: "M12 17v5", key: "bb1du9" }],
  ["path", {
    d: "M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89",
    key: "znwnzq",
  }],
  ["path", { d: "m2 2 20 20", key: "1ooewy" }],
  ["path", {
    d: "M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11",
    key: "c9qhm2",
  }],
]);

const SigmaIcon = createLucideIcon("Sigma", [
  ["path", {
    d: "M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2",
    key: "sigma1",
  }],
]);

interface TickerEntry {
  ticker: string;
  name?: string;
  subindustry?: string;
}

// Lookback presets for the per-column summary statistics.
const LOOKBACK_PRESETS: { key: string; years: number | null }[] = [
  { key: "1Y", years: 1 },
  { key: "2Y", years: 2 },
  { key: "5Y", years: 5 },
  { key: "10Y", years: 10 },
  { key: "All", years: null },
];

type StatKey = "mean" | "median" | "min" | "p25" | "p75" | "max" | "current" | "pct";
const STAT_ROWS: { key: StatKey; label: string }[] = [
  { key: "mean", label: "Mean" },
  { key: "median", label: "Median" },
  { key: "min", label: "Min" },
  { key: "p25", label: "25th %" },
  { key: "p75", label: "75th %" },
  { key: "max", label: "Max" },
];
// Where the latest value sits relative to the summary window above. Rendered as
// a separate group below STAT_ROWS with a divider; also offered in the preview picker.
const POSITION_ROWS: { key: StatKey; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "pct", label: "%ile" },
];
const PREVIEW_STATS = [...STAT_ROWS, ...POSITION_ROWS];

const MS_PER_DAY = 86400000;

// Linear-interpolated quantile (matches Distributions.tsx convention).
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Diverging "temperature" tint for how the current value ranks in its window:
// hot (near the top of its range) → warm, cold (near the bottom) → cool, neutral
// in the middle. Shared by the Current and %ile rows so both read the same way.
// Returns "" for the neutral band so callers keep their base color.
// Endpoints for the percentile heat ramp (Tailwind rose-400 / blue-400) and a
// neutral slate mid-point that stays readable on the dark table.
const HEAT_WARM = [251, 113, 133]; // top of the range
const HEAT_COOL = [96, 165, 250]; // bottom of the range
const HEAT_MID = [148, 163, 184]; // ~50th percentile
const rgbStr = (c: number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
// Continuous cool→neutral→warm bar for the legend, matching the text ramp exactly.
const HEAT_GRADIENT_CSS = `linear-gradient(to right, ${rgbStr(HEAT_COOL)}, ${rgbStr(HEAT_MID)} 50%, ${rgbStr(HEAT_WARM)})`;

// --- Sticky-header cell backgrounds -----------------------------------------
// The stat/header rows live in a `position: sticky` <thead>. With
// `border-collapse`, a row-group's (and row's) background does NOT reliably
// paint behind sticky rows, so translucent row tints let the scrolling body
// bleed through ("transparent window"), and recompositing translucent sticky
// layers every scroll frame is expensive. Fix: give every header cell an OPAQUE
// bg-card base and layer each tint on top as a solid-color background-image, so
// tints blend over the opaque base instead of revealing the body. Colors use
// theme HSL vars so this stays correct if the palette changes.
const solidLayer = (c: string) => `linear-gradient(${c}, ${c})`;
function cellTint(...layers: (string | null | undefined | false)[]): string | undefined {
  const f = layers.filter(Boolean) as string[];
  return f.length ? f.map(solidLayer).join(", ") : undefined;
}
const mutedTint = (a: number) => `hsl(var(--muted) / ${a})`;
const primaryTint = (a: number) => `hsl(var(--primary) / ${a})`;

// Continuous text color for the percentile: a smooth ramp from the neutral mid
// at the median out to blue at the bottom and rose at the top — no visible steps
// between buckets. Returns undefined when there's no percentile.
function pctHeatColor(pct: number | null): string | undefined {
  if (pct === null) return undefined;
  const d = (pct - 50) / 50; // -1 (low) .. 0 (median) .. 1 (high)
  const end = d >= 0 ? HEAT_WARM : HEAT_COOL;
  const t = Math.min(1, Math.abs(d));
  const c = HEAT_MID.map((m, i) => Math.round(m + (end[i] - m) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// Continuous background wash matching pctHeatColor: warm (rose) toward the top,
// cool (blue) toward the bottom, fading to nothing at the median. Alpha scales
// smoothly with distance from the 50th percentile. Returns undefined in the
// neutral band so the cell keeps its default (or pinned) background.
function pctHeatBg(pct: number | null): string | undefined {
  if (pct === null) return undefined;
  const dist = Math.abs(pct - 50) / 50; // 0 at median, 1 at either extreme
  if (dist < 0.02) return undefined;
  const alpha = (dist * 0.16).toFixed(3);
  const [r, g, b] = pct >= 50 ? HEAT_WARM : HEAT_COOL;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface ColumnStat {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
  // Latest value in the full series and where it ranks (0–100) within the
  // lookback window — recomputed whenever the ticker or window changes.
  current: number | null;
  percentile: number | null;
}

// Formats a raw metric value for display (scaling + %/decimal rules). Pure and
// module-level so the memoized row can call it without a component closure.
function formatValue(val: number | null, metric: string): string {
  if (val === null) return "";
  const multiplier = metricMultiplier(metric);
  const scaled = val * multiplier;
  if (isPercentMetric(metric)) return scaled.toFixed(2) + "%";
  if (Math.abs(scaled) >= 1e3)
    return scaled.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(scaled) >= 1) return scaled.toFixed(2);
  return scaled.toFixed(4);
}

interface DataRowProps {
  row: { dateIdx: number; date: string; values: (number | null)[] };
  displayMetrics: string[];
  pinnedMetrics: Set<string>;
  rowHeight: number;
}

// One body row, memoized. During a scroll only the few rows entering/leaving the
// viewport get new props (row/displayMetrics/pinnedMetrics references are stable
// otherwise), so the ~40 visible rows no longer all re-render every frame — the
// main cause of the scroll lag on this ~125-column table.
const DataRow = memo(function DataRow({ row, displayMetrics, pinnedMetrics, rowHeight }: DataRowProps) {
  return (
    <tr className="hover:bg-accent/20" style={{ height: rowHeight }}>
      <td className="sticky left-0 z-10 bg-card px-2 py-0.5 font-mono text-muted-foreground border-r border-b border-border/30 tabular-nums">
        {row.date}
      </td>
      {row.values.map((val, i) => (
        <td
          key={i}
          className={`text-right px-2 py-0.5 font-mono tabular-nums border-b border-border/20 ${pinnedMetrics.has(displayMetrics[i]) ? "bg-primary/5" : ""} ${val !== null && val < 0 ? "text-red-400" : ""}`}
        >
          {formatValue(val, displayMetrics[i])}
        </td>
      ))}
    </tr>
  );
});

export default function DataExplorer() {
  const [tickers, setTickers] = useState<TickerEntry[]>([]);
  const [activeTicker, setActiveTicker] = useState("ESS");
  const [tickerSearch, setTickerSearch] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [rawData, setRawData] = useState<Record<string, [number, number][]>>({});
  const [loading, setLoading] = useState(false);
  const [pinnedMetrics, setPinnedMetrics] = useState<Set<string>>(new Set(["close"]));
  const [metricFilter, setMetricFilter] = useState("");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState<Set<string> | null>(null);
  const [columnSearch, setColumnSearch] = useState("");
  const [showStats, setShowStats] = useState(true);
  const [statsExpanded, setStatsExpanded] = useState(true);
  const [lookbackKey, setLookbackKey] = useState("1Y");
  const [previewStat, setPreviewStat] = useState<StatKey>("median");
  const [previewPickerOpen, setPreviewPickerOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const ROW_HEIGHT = 20;
  const OVERSCAN = 12;
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => setContainerHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(el.scrollTop);
    });
  }, []);

  const getState = useCallback(
    () => ({
      activeTicker,
      sortAsc,
      pinnedMetrics: [...pinnedMetrics],
      visibleMetrics: visibleMetrics ? [...visibleMetrics] : null,
      showStats,
      statsExpanded,
      lookbackKey,
      previewStat,
    }),
    [activeTicker, sortAsc, pinnedMetrics, visibleMetrics, showStats, statsExpanded, lookbackKey, previewStat]
  );

  const restoreState = useCallback((saved: any) => {
    if (saved.activeTicker) setActiveTicker(saved.activeTicker);
    if (typeof saved.sortAsc === "boolean") setSortAsc(saved.sortAsc);
    if (Array.isArray(saved.pinnedMetrics)) setPinnedMetrics(new Set(saved.pinnedMetrics));
    if (saved.visibleMetrics === null) {
      setVisibleMetrics(null);
    } else if (Array.isArray(saved.visibleMetrics)) {
      setVisibleMetrics(new Set(saved.visibleMetrics));
    }
    if (typeof saved.showStats === "boolean") setShowStats(saved.showStats);
    if (typeof saved.statsExpanded === "boolean") setStatsExpanded(saved.statsExpanded);
    if (typeof saved.lookbackKey === "string") setLookbackKey(saved.lookbackKey);
    if (PREVIEW_STATS.some((s) => s.key === saved.previewStat)) setPreviewStat(saved.previewStat);
  }, []);

  usePageState("data-explorer", getState, restoreState);

  useEffect(() => {
    let cancelled = false;
    getTickers().then((t) => {
      if (!cancelled) setTickers(t as TickerEntry[]);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeTicker) return;
    setLoading(true);
    Promise.all([getDates(), getTickerRaw(activeTicker)])
      .then(([d, raw]) => {
        setDates(d as string[]);
        setRawData(raw as any);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeTicker]);

  const tickerIndex = tickers.findIndex((t) => t.ticker === activeTicker);

  const filteredTickers = useMemo(() => {
    if (!tickerSearch) return tickers;
    const q = tickerSearch.toLowerCase();
    return tickers.filter(
      (t) =>
        t.ticker.toLowerCase().includes(q) ||
        (t.name || "").toLowerCase().includes(q) ||
        (t.subindustry || "").toLowerCase().includes(q)
    );
  }, [tickers, tickerSearch]);

  const allMetrics = useMemo(
    () => Object.keys(rawData).sort((a, b) => a.localeCompare(b)),
    [rawData]
  );

  const METRIC_GROUPS: Record<string, string[]> = {
    Price: ["close", "open", "high", "low"],
    Valuation: [
      "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2",
      "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate",
    ],
    Yields: ["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield"],
    Estimates: [
      "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2",
      "EBITDA FY1", "EBITDA FY2", "Sales FY1", "Sales FY2",
    ],
    LTM: ["EPS LTM", "FFO LTM", "AFFO LTM", "EBITDA LTM", "Sales LTM", "EPS FY0", "FFO FY0", "AFFO FY0"],
    Growth: [
      "FY1 EPS Growth", "FY2 EPS Growth", "FY1 FFO Growth", "FY2 FFO Growth",
      "FY1 AFFO Growth", "FY2 AFFO Growth",
    ],
    Performance: [
      "52wk High", "52wk Low", "% off 52wk High", "% off 52wk Low",
      "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
    ],
    "Short Interest": ["Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M"],
    Volatility: [
      "HV 30D", "HV 60D", "HV 90D", "HV 180D", "HVOL 30D", "HVOL 60D", "HVOL 90D", "HVOL 180D",
    ],
    Other: [
      "Dividend", "Enterprise Value", "Buy Ratings", "Hold Ratings", "Sell Ratings", "Bull%", "Bear%",
    ],
  };

  const groupedMetrics = useMemo(() => {
    const knownSet = new Set<string>();
    const result: [string, string[]][] = [];
    const q = columnSearch.trim().toLowerCase();
    const matchQ = (m: string) => !q || m.toLowerCase().includes(q);

    for (const [group, cols] of Object.entries(METRIC_GROUPS)) {
      const matching = cols.filter((m) => allMetrics.includes(m) && matchQ(m));
      if (matching.length) result.push([group, matching]);
      for (const m of cols) knownSet.add(m);
    }
    const uncategorized = allMetrics.filter((m) => !knownSet.has(m) && matchQ(m));
    if (uncategorized.length) result.push(["Uncategorized", uncategorized]);
    return result;
  }, [allMetrics, columnSearch]);

  const displayMetrics = useMemo(() => {
    let cols = visibleMetrics ? allMetrics.filter((m) => visibleMetrics.has(m)) : allMetrics;
    if (metricFilter) {
      const q = metricFilter.toLowerCase();
      cols = cols.filter((m) => m.toLowerCase().includes(q));
    }
    const pinned = cols.filter((m) => pinnedMetrics.has(m));
    const rest = cols.filter((m) => !pinnedMetrics.has(m));
    return [...pinned, ...rest];
  }, [allMetrics, visibleMetrics, metricFilter, pinnedMetrics]);

  const tableRows = useMemo(() => {
    if (dates.length === 0 || displayMetrics.length === 0) return [];
    const metricMaps = displayMetrics.map((m) => {
      const map = new Map<number, number>();
      const pairs = rawData[m];
      if (pairs) for (const [idx, val] of pairs) map.set(idx, val);
      return map;
    });
    const allDateIdxs = new Set<number>();
    for (const m of displayMetrics) {
      const pairs = rawData[m];
      if (pairs) for (const [idx] of pairs) allDateIdxs.add(idx);
    }
    const dateIdxArr = Array.from(allDateIdxs).sort((a, b) => a - b);
    if (!sortAsc) dateIdxArr.reverse();
    return dateIdxArr.map((dateIdx) => ({
      dateIdx,
      date: dates[dateIdx] ?? `idx:${dateIdx}`,
      values: metricMaps.map((m) => m.get(dateIdx) ?? null),
    }));
  }, [dates, displayMetrics, rawData, sortAsc]);

  // Per-column summary statistics over the selected lookback window.
  // Values are the raw (unscaled) metric values; they're formatted for display
  // by formatValue() at render time, exactly like the cells below.
  const columnStats = useMemo<(ColumnStat | null)[]>(() => {
    if (displayMetrics.length === 0) return [];
    const years = LOOKBACK_PRESETS.find((p) => p.key === lookbackKey)?.years ?? null;
    let cutoff = -Infinity;
    if (years !== null && dates.length > 0) {
      const last = new Date(dates[dates.length - 1]).getTime();
      if (!Number.isNaN(last)) cutoff = last - years * 365 * MS_PER_DAY;
    }
    return displayMetrics.map((m) => {
      const pairs = rawData[m];
      if (!pairs || pairs.length === 0) return null;
      const vals: number[] = [];
      // Latest finite value in the full series (independent of the window).
      let curIdx = -1;
      let current: number | null = null;
      for (const [idx, val] of pairs) {
        if (val === null || !Number.isFinite(val)) continue;
        if (idx > curIdx) {
          curIdx = idx;
          current = val;
        }
        if (cutoff !== -Infinity) {
          const ds = dates[idx];
          if (!ds) continue;
          const t = new Date(ds).getTime();
          if (Number.isNaN(t) || t < cutoff) continue;
        }
        vals.push(val);
      }
      if (vals.length === 0) return null;
      vals.sort((a, b) => a - b);
      const n = vals.length;
      let sum = 0;
      for (const v of vals) sum += v;
      // Mid-rank percentile of the current value within the window.
      let percentile: number | null = null;
      if (current !== null) {
        let below = 0;
        let equal = 0;
        for (const v of vals) {
          if (v < current) below++;
          else if (v === current) equal++;
        }
        percentile = ((below + equal / 2) / n) * 100;
      }
      return {
        count: n,
        mean: sum / n,
        median: quantile(vals, 0.5),
        min: vals[0],
        max: vals[n - 1],
        p25: quantile(vals, 0.25),
        p75: quantile(vals, 0.75),
        current,
        percentile,
      };
    });
  }, [displayMetrics, rawData, dates, lookbackKey]);

  // Formats one stat cell. "current" reuses the value formatter; "pct" is the
  // percentile rank (0–100), shown as a plain integer independent of the metric.
  const formatStat = (s: ColumnStat, key: StatKey, metric: string): string => {
    if (key === "current") return s.current === null ? "" : formatValue(s.current, metric);
    if (key === "pct") return s.percentile === null ? "" : Math.round(s.percentile).toString();
    return formatValue(s[key], metric);
  };

  const handleExportCsv = () => {
    if (tableRows.length === 0) return;
    const header = ["Date", ...displayMetrics].join(",");
    const rows = tableRows.map((row) =>
      [
        row.date,
        ...row.values.map((v, i) => {
          if (v === null) return "";
          const multiplier = metricMultiplier(displayMetrics[i]);
          return (v * multiplier).toString();
        }),
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTicker}_data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const togglePin = (metric: string) => {
    setPinnedMetrics((prev) => {
      const next = new Set(prev);
      next.has(metric) ? next.delete(metric) : next.add(metric);
      return next;
    });
  };

  const toggleVisible = (metric: string) => {
    setVisibleMetrics((prev) => {
      if (!prev) {
        const next = new Set(allMetrics);
        next.delete(metric);
        return next;
      }
      const next = new Set(prev);
      next.has(metric) ? next.delete(metric) : next.add(metric);
      return next;
    });
  };

  const activeMeta = tickers.find((t) => t.ticker === activeTicker);

  // Virtual scroll
  const totalRows = tableRows.length;
  const totalHeight = totalRows * ROW_HEIGHT;
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleRows = tableRows.slice(startRow, endRow);
  const paddingTop = startRow * ROW_HEIGHT;
  const paddingBottom = Math.max(0, totalHeight - endRow * ROW_HEIGHT);

  // The header (column labels + stat rows) is independent of scroll position, so
  // memoize it — otherwise every scroll frame rebuilt ~7 rows × N columns of cells.
  const tableHeader = useMemo(
    () => (
      <thead className="sticky top-0 bg-card z-20">
        <tr>
          <th className="sticky left-0 z-30 bg-card text-left px-2 py-1.5 font-semibold text-muted-foreground border-b border-r border-border min-w-[90px]">
            Date
          </th>
          {displayMetrics.map((m) => (
            <th
              key={m}
              className="text-right px-2 py-1.5 font-medium border-b border-border whitespace-nowrap min-w-[80px] group cursor-default bg-card"
              style={{ backgroundImage: cellTint(pinnedMetrics.has(m) ? primaryTint(0.05) : null) }}
            >
              <div className="flex items-center justify-end gap-1">
                <button
                  className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
                  onClick={() => togglePin(m)}
                  title={pinnedMetrics.has(m) ? "Unpin" : "Pin to left"}
                >
                  {pinnedMetrics.has(m) ? (
                    <PinOffIcon className="w-2.5 h-2.5" />
                  ) : (
                    <Pin className="w-2.5 h-2.5" />
                  )}
                </button>
                <span className="text-[10px]">{m}</span>
              </div>
            </th>
          ))}
        </tr>
        {showStats && (
          <>
            {/* Collapsible header — click to expand/collapse the stat rows.
                When collapsed, previews one statistic per column so the single
                row still reads as data rather than a blank band. */}
            <tr
              className="group/sttoggle cursor-pointer select-none"
              onClick={() => setStatsExpanded((v) => !v)}
              data-testid="data-stats-toggle-row"
            >
              <th
                scope="row"
                className={`sticky left-0 z-30 bg-muted text-left px-2 py-0.5 font-semibold text-[10px] text-muted-foreground border-r border-border whitespace-nowrap ${statsExpanded ? "border-b border-border/30" : "border-b-2 border-b-border"}`}
                title={statsExpanded ? "Collapse statistics" : "Expand statistics"}
              >
                <div className="flex items-center gap-1">
                  {statsExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  <span>Stats</span>
                  <span className="font-normal text-muted-foreground/70">{lookbackKey}</span>
                  {!statsExpanded && (
                    <>
                      <span className="font-normal text-muted-foreground/50">·</span>
                      <Popover open={previewPickerOpen} onOpenChange={setPreviewPickerOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="font-normal text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-0.5"
                            title="Choose which statistic to preview"
                            data-testid="data-preview-stat-picker"
                          >
                            {PREVIEW_STATS.find((s) => s.key === previewStat)?.label ?? previewStat}
                            <ChevronsUpDown className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-32 p-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {PREVIEW_STATS.map((sr) => (
                            <button
                              key={sr.key}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewStat(sr.key);
                                setPreviewPickerOpen(false);
                              }}
                              className={`w-full text-left px-2 py-1 text-[11px] rounded hover:bg-accent/50 ${previewStat === sr.key ? "text-primary font-medium" : ""}`}
                              data-testid={`data-preview-stat-${sr.key}`}
                            >
                              {sr.label}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </>
                  )}
                </div>
              </th>
              {displayMetrics.map((m, i) => {
                const s = columnStats[i];
                return (
                  <td
                    key={m}
                    className={`text-right px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground/90 whitespace-nowrap bg-card transition-[filter] group-hover/sttoggle:brightness-125 ${statsExpanded ? "border-b border-border/20" : "border-b-2 border-b-border"}`}
                    style={{ backgroundImage: cellTint(pinnedMetrics.has(m) ? primaryTint(0.05) : null, mutedTint(0.6)) }}
                  >
                    {!statsExpanded && s ? formatStat(s, previewStat, m) : ""}
                  </td>
                );
              })}
            </tr>
            {statsExpanded &&
              STAT_ROWS.map((sr, rowI) => {
                const isMedian = sr.key === "median";
                const isLast = rowI === STAT_ROWS.length - 1;
                return (
                  <tr
                    key={sr.key}
                    className={isMedian ? "bg-muted/80" : "bg-muted/40"}
                    data-testid={`data-stat-row-${sr.key}`}
                  >
                    <th
                      scope="row"
                      className={`sticky left-0 z-30 bg-muted text-left px-2 py-0.5 text-[10px] border-r border-border whitespace-nowrap ${isMedian ? "font-semibold text-foreground" : "font-medium text-muted-foreground"} ${isLast ? "border-b border-b-border/60" : "border-b border-border/30"}`}
                      title={`${sr.label} over last ${lookbackKey}`}
                    >
                      {sr.label}
                    </th>
                    {displayMetrics.map((m, i) => {
                      const s = columnStats[i];
                      return (
                        <td
                          key={m}
                          className={`text-right px-2 py-0.5 font-mono text-[10px] tabular-nums whitespace-nowrap bg-card ${isMedian ? "text-foreground font-medium" : "text-muted-foreground/90"} ${isLast ? "border-b border-b-border/60" : "border-b border-border/20"}`}
                          style={{ backgroundImage: cellTint(pinnedMetrics.has(m) ? primaryTint(0.05) : null, mutedTint(isMedian ? 0.8 : 0.4)) }}
                        >
                          {s ? formatStat(s, sr.key, m) : ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            {/* Where the latest value sits vs. the window above. */}
            {statsExpanded &&
              POSITION_ROWS.map((sr, rowI) => {
                const isLast = rowI === POSITION_ROWS.length - 1;
                const isCurrent = sr.key === "current";
                return (
                  <tr
                    key={sr.key}
                    className={isCurrent ? "bg-primary/10" : "bg-primary/[0.04]"}
                    data-testid={`data-stat-row-${sr.key}`}
                  >
                    <th
                      scope="row"
                      className={`sticky left-0 z-30 bg-muted text-left px-2 py-0.5 text-[10px] border-r border-border whitespace-nowrap ${isCurrent ? "font-bold text-foreground border-t border-t-border/60" : "font-semibold text-foreground/80"} ${isLast ? "border-b-2 border-b-border" : "border-b border-border/30"}`}
                      title={
                        sr.key === "pct"
                          ? `Percentile rank of the current value within the last ${lookbackKey}`
                          : `Latest value`
                      }
                    >
                      {sr.label}
                    </th>
                    {displayMetrics.map((m, i) => {
                      const s = columnStats[i];
                      const pct = s?.percentile ?? null;
                      const heatColor = pctHeatColor(pct);
                      const heatBg = pctHeatBg(pct);
                      // Current values are the headline: bolder and full-strength;
                      // fall back to the theme text token only when there's no heat.
                      const weight = isCurrent ? "font-semibold" : "";
                      const base = heatColor
                        ? ""
                        : isCurrent
                          ? "text-foreground"
                          : "text-muted-foreground/90";
                      return (
                        <td
                          key={m}
                          className={`text-right px-2 py-0.5 font-mono text-[10px] tabular-nums whitespace-nowrap bg-card ${isCurrent ? "border-t border-t-border/60" : ""} ${isLast ? "border-b-2 border-b-border" : "border-b border-border/20"} ${weight} ${base}`}
                          style={{
                            color: heatColor,
                            backgroundImage: cellTint(
                              heatBg,
                              pinnedMetrics.has(m) ? primaryTint(0.05) : null,
                              primaryTint(isCurrent ? 0.1 : 0.04)
                            ),
                          }}
                          title={
                            pct !== null
                              ? `${m}: ${Math.round(pct)}th percentile over last ${lookbackKey}`
                              : undefined
                          }
                        >
                          {s ? formatStat(s, sr.key, m) : ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </>
        )}
      </thead>
    ),
    [displayMetrics, pinnedMetrics, showStats, statsExpanded, lookbackKey, previewStat, previewPickerOpen, columnStats]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0 flex-wrap">
        {/* Ticker Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 min-w-[100px]"
              data-testid="data-ticker-picker"
            >
              <span className="font-bold">{activeTicker}</span>
              <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[440px] p-0" align="start">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  className="h-7 text-xs pl-7"
                  placeholder="Search tickers..."
                  value={tickerSearch}
                  onChange={(e) => setTickerSearch(e.target.value)}
                  data-testid="data-ticker-search"
                />
              </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto py-1">
              {filteredTickers.map((t) => (
                <button
                  key={t.ticker}
                  className={`w-full flex items-center gap-2 px-3 py-1 text-xs hover:bg-accent/50 ${t.ticker === activeTicker ? "bg-accent text-accent-foreground" : ""}`}
                  onClick={() => {
                    setActiveTicker(t.ticker);
                    setTickerSearch("");
                  }}
                  data-testid={`data-ticker-${t.ticker}`}
                >
                  <span className="font-bold w-14 text-left whitespace-nowrap">{t.ticker}</span>
                  <span
                    className="text-muted-foreground flex-1 min-w-0 truncate text-left"
                    title={t.name}
                  >
                    {t.name}
                  </span>
                  {t.ticker === activeTicker && (
                    <Check className="w-3 h-3 ml-auto text-primary" />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Prev/Next */}
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={tickerIndex <= 0}
            onClick={() => tickerIndex > 0 && setActiveTicker(tickers[tickerIndex - 1].ticker)}
            data-testid="data-ticker-prev"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={tickerIndex >= tickers.length - 1}
            onClick={() =>
              tickerIndex < tickers.length - 1 &&
              setActiveTicker(tickers[tickerIndex + 1].ticker)
            }
            data-testid="data-ticker-next"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {activeMeta && (
          <span className="text-[10px] text-muted-foreground">
            {activeMeta.name} · {activeMeta.subindustry}
          </span>
        )}

        <div className="flex-1" />

        {/* Metric filter */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            className="h-7 text-xs pl-7 w-[160px]"
            placeholder="Filter metrics..."
            value={metricFilter}
            onChange={(e) => setMetricFilter(e.target.value)}
            data-testid="data-metric-filter"
          />
          {metricFilter && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => setMetricFilter("")}
            >
              <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Column picker */}
        <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] gap-1"
              data-testid="data-column-picker"
            >
              <Columns2Icon className="w-3 h-3" />
              Columns ({visibleMetrics ? visibleMetrics.size : allMetrics.length}/{allMetrics.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="end">
            <div className="p-2 border-b border-border/40 flex items-center gap-2">
              <Search className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <Input
                placeholder="Search columns..."
                value={columnSearch}
                onChange={(e) => setColumnSearch(e.target.value)}
                className="h-7 text-xs flex-1"
              />
              <button
                className="text-[10px] text-primary hover:underline whitespace-nowrap"
                onClick={() => setVisibleMetrics(null)}
              >
                Show all
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto py-1">
              {groupedMetrics.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No columns match.</div>
              )}
              {groupedMetrics.map(([group, cols]) => (
                <div key={group}>
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                    {group}
                  </div>
                  {cols.map((m) => {
                    const isVisible = !visibleMetrics || visibleMetrics.has(m);
                    return (
                      <button
                        key={m}
                        className="w-full flex items-center gap-2 px-3 py-0.5 text-xs hover:bg-accent/50"
                        onClick={() => toggleVisible(m)}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${isVisible ? "bg-primary border-primary" : "border-muted-foreground/30"}`}
                        >
                          {isVisible && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                        </div>
                        <span
                          className={`${pinnedMetrics.has(m) ? "font-semibold" : ""} truncate`}
                          title={m}
                        >
                          {m}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Stats toggle */}
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-2 text-[10px] gap-1 ${showStats ? "text-primary" : ""}`}
          onClick={() => setShowStats((v) => !v)}
          title="Show per-column summary statistics"
          data-testid="data-stats-toggle"
        >
          <SigmaIcon className="w-3 h-3" />
          Stats
        </Button>

        {/* Lookback presets (window for the summary statistics) */}
        {showStats && (
          <div
            className="flex items-center rounded-md border border-border overflow-hidden"
            title="Look-back window for the summary statistics"
            data-testid="data-lookback-presets"
          >
            {LOOKBACK_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setLookbackKey(p.key)}
                className={`px-1.5 h-7 text-[10px] tabular-nums transition-colors ${
                  lookbackKey === p.key
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent/50 text-muted-foreground"
                }`}
                data-testid={`data-lookback-${p.key}`}
              >
                {p.key}
              </button>
            ))}
          </div>
        )}

        {/* Heat legend — explains the percentile coloring on the Current/%ile rows */}
        {showStats && (
          <div
            className="flex items-center gap-1"
            title="Heat on the Current & %ile rows shows where the latest value sits within its look-back range: blue = low (near the bottom), rose = high (near the top), neutral in the middle."
            data-testid="data-heat-legend"
          >
            <span className="text-[9px] text-muted-foreground/70 leading-none">Low</span>
            <div
              className="h-2 w-14 rounded-sm border border-border/40"
              style={{ background: HEAT_GRADIENT_CSS }}
            />
            <span className="text-[9px] text-muted-foreground/70 leading-none">High</span>
          </div>
        )}

        {/* Sort toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[10px] gap-1"
          onClick={() => setSortAsc((v) => !v)}
          data-testid="data-sort-toggle"
        >
          <ArrowUpDown className="w-3 h-3" />
          {sortAsc ? "Oldest" : "Newest"}
        </Button>

        {/* Export */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[10px] gap-1"
          onClick={handleExportCsv}
          data-testid="data-export-csv"
        >
          <Download className="w-3 h-3" />
          CSV
        </Button>

        <span className="text-[10px] text-muted-foreground tabular-nums">
          {tableRows.length} rows · {displayMetrics.length} cols
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
          Loading {activeTicker} data...
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto min-h-0"
        >
          <table className="w-full text-[11px] border-separate border-spacing-0">
            {tableHeader}
            <tbody>
              {paddingTop > 0 && (
                <tr style={{ height: paddingTop }}>
                  <td colSpan={displayMetrics.length + 1} />
                </tr>
              )}
              {visibleRows.map((row) => (
                <DataRow
                  key={row.dateIdx}
                  row={row}
                  displayMetrics={displayMetrics}
                  pinnedMetrics={pinnedMetrics}
                  rowHeight={ROW_HEIGHT}
                />
              ))}
              {paddingBottom > 0 && (
                <tr style={{ height: paddingBottom }}>
                  <td colSpan={displayMetrics.length + 1} />
                </tr>
              )}
              {tableRows.length === 0 && (
                <tr>
                  <td
                    colSpan={displayMetrics.length + 1}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No data available for {activeTicker}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
