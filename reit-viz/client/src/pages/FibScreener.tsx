// Fibonacci Analysis Screener — for every ticker (or pair ratio) in scope,
// finds the dominant swing over a lookback window, computes the full fib
// ladder (retracements 0…1 + extensions 1.272/1.618/2.618 projected in the
// trend direction), and shows how close price is to its nearest level plus
// how that level has historically behaved (touches, bounce rate, holds).
// Screen for names sitting on a fib level or bouncing off one.

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { fetchWorkbookTickers, type TickerMeta } from "@/lib/fetchWorkbookTickers";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { DATE_PRESETS, getDateRangeFromPreset, sliceDateRange } from "@/lib/datePresets";
import { fetchGlobalDates } from "@/lib/fetchGlobalDates";
import { g as getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { unorderedPairs, MAX_PAIR_LEGS } from "@/lib/pairValuation";
import { navigateToTicker } from "@/lib/navigateToTicker";
import { navigateToPairs } from "@/lib/navigateToPairs";
import { useWorkspaceState } from "@/lib/workspaceState";
import { useUniverse } from "@/lib/universeContext";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { useTableSort, SortHeader } from "@/lib/useTableSort";
import { useBasketScope, BasketScopeSelect } from "@/components/BasketScopeSelect";
import { PagePresets } from "@/components/PagePresets";
import { PairSeriesDetailOverlay } from "@/pages/PairRatios";
import { computeFibAnalysis, type FibConfig } from "@/lib/fibAnalysis";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";

// ─── Types ───────────────────────────────────────────────────────────────────

type ScanMode = "tickers" | "pairs";
type FibFreq = "daily" | "weekly" | "monthly";
type LevelKind = "all" | "retracement" | "extension";

/** FibLevelInfo minus the touch array (rows are workspace-persisted). */
interface FibRowLevel {
  ratio: number;
  kind: "retracement" | "extension";
  price: number;
  distancePct: number;
  touchCount: number;
  bounceReverseRate: number;
  avgBounceMagnitudePct: number;
  holdRate: number;
  lastTouchDate: string | null;
  compositeScore: number;
  recentBounce: boolean;
  recentBounceDate: string | null;
}

interface FibRow {
  key: string;          // ticker, or "A/B" for pairs
  ticker: string;
  name: string;
  pairA?: string;
  pairB?: string;
  freq: FibFreq;
  currentPrice: number;
  swingHigh: number;
  swingLow: number;
  swingHighDate: string;
  swingLowDate: string;
  swingDirection: "up" | "down";
  levels: FibRowLevel[];
}

interface FibDisplayRow extends FibRow {
  nearest: FibRowLevel;
  absDist: number;
}

interface SkippedEntry { ticker: string; reason: string; }
interface ScanTarget { key: string; ticker: string; name: string; pairA?: string; pairB?: string; }

const MIN_BARS = 60;
const FREQS: Array<{ key: FibFreq; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

const fmtRatio = (r: number) => (r === 0 || r === 1 ? r.toFixed(0) : String(r));
const shortDate = (d: string) => (d && d.length >= 10 ? d.slice(2) : d);

// ─── Component ───────────────────────────────────────────────────────────────

export default function FibScreener() {
  const { universeTickers } = useUniverse();
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  useEffect(() => { fetchWorkbookTickers().then(setAllTickers).catch(() => {}); }, []);

  // ── Scope: universe → classification/search/manual → geo → basket
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const universeNarrowed = useMemo(
    () => (universeTickers ? allTickers.filter((t) => universeTickers.has(t.ticker)) : allTickers),
    [allTickers, universeTickers],
  );
  const geo = useGeoFilter(universeNarrowed, "fib-geo");
  const basketScope = useBasketScope("reit-viz:basket-scope:fib");
  const filteredPool = useMemo(
    () => geo.filterByGeo(applyClassFilters(universeNarrowed as any[], classFilters, search, manualTickers))
      .filter((t: TickerMeta) => basketScope.inScope(t.ticker)),
    [universeNarrowed, classFilters, search, manualTickers, geo.filterByGeo, basketScope.members],
  );

  // ── Scan config
  const [mode, setMode] = useState<ScanMode>("tickers");
  const [freq, setFreq] = useState<FibFreq>("daily");
  const [datePreset, setDatePreset] = useState("5y");
  const [lookbackBars, setLookbackBars] = useState(252);
  const [tolPct, setTolPct] = useState(0.5);          // UI %, /100 for engine
  const [bounceThreshPct, setBounceThreshPct] = useState(1.5); // UI %, /100
  const [bounceLookahead, setBounceLookahead] = useState(5);
  const [holdBars, setHoldBars] = useState(5);
  const [recentBounceBars, setRecentBounceBars] = useState(10);

  // ── Post-scan display filters (no re-run needed)
  const [maxAbsDistPct, setMaxAbsDistPct] = useState(3);
  const [minTouchesFilter, setMinTouchesFilter] = useState(0);
  const [onlyRecentBounces, setOnlyRecentBounces] = useState(false);
  const [levelKind, setLevelKind] = useState<LevelKind>("all");

  // ── Run state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<FibRow[]>([]);
  const [skipped, setSkipped] = useState<SkippedEntry[]>([]);
  const cancelRef = useRef(false);

  // ── Scan targets
  const pairLegInfo = useMemo(() => {
    if (mode !== "pairs") return { legs: [] as string[], total: 0 };
    const legs = [...new Set(filteredPool.map((t: TickerMeta) => t.ticker))].sort();
    return { legs: legs.slice(0, MAX_PAIR_LEGS), total: legs.length };
  }, [mode, filteredPool]);
  const targets = useMemo<ScanTarget[]>(() => {
    if (mode === "tickers") {
      return filteredPool.map((t: TickerMeta) => ({ key: t.ticker, ticker: t.ticker, name: t.name || t.ticker }));
    }
    return unorderedPairs(pairLegInfo.legs).map(([a, b]) => ({
      key: `${a}/${b}`, ticker: `${a}/${b}`, name: `${a}/${b}`, pairA: a, pairB: b,
    }));
  }, [mode, filteredPool, pairLegInfo.legs]);

  // ── Persistence (config + results)
  const serializeState = useCallback(
    () => ({
      classFiltersSer: serializeClassFilters(classFilters),
      search,
      manualTickers: [...manualTickers],
      mode, freq, datePreset, lookbackBars,
      tolPct, bounceThreshPct, bounceLookahead, holdBars, recentBounceBars,
      maxAbsDistPct, minTouchesFilter, onlyRecentBounces, levelKind,
      rows: results,
      skipped,
    }),
    [classFilters, search, manualTickers, mode, freq, datePreset, lookbackBars, tolPct,
     bounceThreshPct, bounceLookahead, holdBars, recentBounceBars, maxAbsDistPct,
     minTouchesFilter, onlyRecentBounces, levelKind, results, skipped],
  );
  const hydrateState = useCallback((state: any) => {
    if (!state || typeof state !== "object") return;
    if (state.classFiltersSer) setClassFilters(deserializeClassFilters(state.classFiltersSer));
    if (typeof state.search === "string") setSearch(state.search);
    if (Array.isArray(state.manualTickers)) setManualTickers(new Set(state.manualTickers.filter((t: any) => typeof t === "string")));
    if (state.mode === "tickers" || state.mode === "pairs") setMode(state.mode);
    if (state.freq === "daily" || state.freq === "weekly" || state.freq === "monthly") setFreq(state.freq);
    if (typeof state.datePreset === "string" && DATE_PRESETS.some((p) => p.key === state.datePreset)) setDatePreset(state.datePreset);
    const num = (v: any) => typeof v === "number" && Number.isFinite(v);
    if (num(state.lookbackBars) && state.lookbackBars >= 10) setLookbackBars(state.lookbackBars);
    if (num(state.tolPct) && state.tolPct > 0) setTolPct(state.tolPct);
    if (num(state.bounceThreshPct) && state.bounceThreshPct > 0) setBounceThreshPct(state.bounceThreshPct);
    if (num(state.bounceLookahead) && state.bounceLookahead >= 1) setBounceLookahead(state.bounceLookahead);
    if (num(state.holdBars) && state.holdBars >= 1) setHoldBars(state.holdBars);
    if (num(state.recentBounceBars) && state.recentBounceBars >= 1) setRecentBounceBars(state.recentBounceBars);
    if (num(state.maxAbsDistPct) && state.maxAbsDistPct > 0) setMaxAbsDistPct(state.maxAbsDistPct);
    if (num(state.minTouchesFilter) && state.minTouchesFilter >= 0) setMinTouchesFilter(state.minTouchesFilter);
    if (typeof state.onlyRecentBounces === "boolean") setOnlyRecentBounces(state.onlyRecentBounces);
    if (state.levelKind === "all" || state.levelKind === "retracement" || state.levelKind === "extension") setLevelKind(state.levelKind);
    if (Array.isArray(state.rows)) setResults(state.rows);
    if (Array.isArray(state.skipped)) setSkipped(state.skipped);
  }, []);
  useWorkspaceState("fib-analysis", serializeState, hydrateState);

  // ── Run
  const handleStop = useCallback(() => { cancelRef.current = true; }, []);
  const handleRun = useCallback(async () => {
    if (targets.length === 0) return;
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setSkipped([]);
    setProgress({ current: 0, total: targets.length });
    const dateRange = getDateRangeFromPreset(datePreset);
    const fibCfg: Partial<FibConfig> = {
      lookbackBars,
      tolerancePct: tolPct / 100,
      bounceThresholdPct: bounceThreshPct / 100,
      bounceLookahead,
      holdBars,
      recentBounceBars,
    };
    const rows: FibRow[] = [];
    const resultSkipped: SkippedEntry[] = [];

    let globalDates: string[] = [];
    if (mode === "pairs") {
      try { globalDates = await fetchGlobalDates(); } catch {}
    }

    for (let i = 0; i < targets.length; i++) {
      if (cancelRef.current) break;
      const item = targets[i];
      try {
        let dates: string[];
        let closes: number[];
        let highs: number[];
        let lows: number[];

        if (item.pairA && item.pairB) {
          // Pair ratio: close-only series (highs = lows = closes), same as Levels & Trendlines.
          const pairData = await getYahooPairsRatio(item.pairA, item.pairB, globalDates);
          if (!pairData || pairData.prices.length < MIN_BARS) {
            resultSkipped.push({ ticker: item.key, reason: pairData ? `only ${pairData.prices.length} bars (need ${MIN_BARS})` : "no pair data" });
            setProgress({ current: i + 1, total: targets.length });
            await new Promise((r) => setTimeout(r, 0));
            continue;
          }
          const pairDates = pairData.indices.map((idx: number) => globalDates[idx] || "");
          const { start: rangeStart, end: rangeEnd } = dateRange as any;
          const rangeStartStr = rangeStart instanceof Date ? rangeStart.toISOString().slice(0, 10) : rangeStart;
          const rangeEndStr = rangeEnd instanceof Date ? rangeEnd.toISOString().slice(0, 10) : rangeEnd;
          const idxs: number[] = [];
          for (let v = 0; v < pairDates.length; v++) {
            const d = pairDates[v];
            if (d && !(rangeStartStr && d < rangeStartStr) && !(rangeEndStr && d > rangeEndStr)) idxs.push(v);
          }
          if (idxs.length < MIN_BARS) {
            resultSkipped.push({ ticker: item.key, reason: `only ${idxs.length} bars in range (need ${MIN_BARS})` });
            setProgress({ current: i + 1, total: targets.length });
            await new Promise((r) => setTimeout(r, 0));
            continue;
          }
          dates = idxs.map((v) => pairDates[v]);
          closes = idxs.map((v) => pairData.prices[v]);
          highs = closes.slice();
          lows = closes.slice();
        } else {
          const ohlcv = await fetchTickerOHLCV(item.ticker);
          if (!ohlcv || !ohlcv.dates.length) { resultSkipped.push({ ticker: item.key, reason: "no data" }); setProgress({ current: i + 1, total: targets.length }); continue; }
          const sliced = sliceDateRange(ohlcv, dateRange);
          const n = sliced.adjCloses.length;
          if (n < MIN_BARS) { resultSkipped.push({ ticker: item.key, reason: `only ${n} bars in range (need ${MIN_BARS})` }); setProgress({ current: i + 1, total: targets.length }); continue; }
          // Adjusted OHLC: scale highs/lows into adj space (same as Gap Fill / Levels & Trendlines).
          closes = sliced.adjCloses;
          highs = sliced.highs.map((h: number, idx: number) => {
            const c = sliced.closes[idx], ac = sliced.adjCloses[idx];
            return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? h * (ac / c) : h;
          });
          lows = sliced.lows.map((l: number, idx: number) => {
            const c = sliced.closes[idx], ac = sliced.adjCloses[idx];
            return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? l * (ac / c) : l;
          });
          dates = sliced.dates.slice(0, n);
        }

        if (freq !== "daily") {
          const minBucketBars = freq === "weekly" ? 30 : 24;
          const ds = weeklyDownsample({ dates, closes, adjCloses: closes, highs, lows }, freq);
          if (ds.closes.length < minBucketBars) {
            resultSkipped.push({ ticker: item.key, reason: `only ${ds.closes.length} ${freq} bars (need ${minBucketBars})` });
            setProgress({ current: i + 1, total: targets.length });
            continue;
          }
          dates = ds.dates; closes = ds.closes; highs = ds.highs; lows = ds.lows;
        }

        const analysis = computeFibAnalysis({ closes, highs, lows, dates }, fibCfg);
        if (!analysis) { resultSkipped.push({ ticker: item.key, reason: "flat range / bad data" }); setProgress({ current: i + 1, total: targets.length }); continue; }

        rows.push({
          key: item.key,
          ticker: item.ticker,
          name: item.name,
          pairA: item.pairA,
          pairB: item.pairB,
          freq,
          currentPrice: analysis.currentPrice,
          swingHigh: analysis.swing.swingHigh,
          swingLow: analysis.swing.swingLow,
          swingHighDate: analysis.swing.highDate,
          swingLowDate: analysis.swing.lowDate,
          swingDirection: analysis.swing.direction,
          levels: analysis.levels.map((l) => ({
            ratio: l.ratio, kind: l.kind, price: l.price, distancePct: l.distancePct,
            touchCount: l.touchCount, bounceReverseRate: l.bounceReverseRate,
            avgBounceMagnitudePct: l.avgBounceMagnitudePct, holdRate: l.holdRate,
            lastTouchDate: l.lastTouchDate, compositeScore: l.compositeScore,
            recentBounce: !!l.recentBounce, recentBounceDate: l.recentBounce?.date ?? null,
          })),
        });
      } catch (err: any) {
        resultSkipped.push({ ticker: item.key, reason: err?.message || "error" });
      }
      setProgress({ current: i + 1, total: targets.length });
      if (item.pairA || i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
    }

    setResults(rows);
    setSkipped(resultSkipped);
    setRunning(false);
  }, [targets, mode, freq, datePreset, lookbackBars, tolPct, bounceThreshPct, bounceLookahead, holdBars, recentBounceBars]);

  // ── Display rows: nearest level per kind filter, then row filters
  const displayRows = useMemo<FibDisplayRow[]>(() => {
    const out: FibDisplayRow[] = [];
    for (const row of results) {
      const pool = levelKind === "all" ? row.levels : row.levels.filter((l) => l.kind === levelKind);
      if (pool.length === 0) continue;
      let nearest = pool[0];
      for (const l of pool) if (Math.abs(l.distancePct) < Math.abs(nearest.distancePct)) nearest = l;
      const absDist = Math.abs(nearest.distancePct);
      if (absDist > maxAbsDistPct) continue;
      if (nearest.touchCount < minTouchesFilter) continue;
      if (onlyRecentBounces && !nearest.recentBounce) continue;
      out.push({ ...row, nearest, absDist });
    }
    return out;
  }, [results, levelKind, maxAbsDistPct, minTouchesFilter, onlyRecentBounces]);

  const sort = useTableSort<FibDisplayRow>("absDist", "asc", "asc", "fib");
  const sortedRows = sort.apply(displayRows, (row, key) => {
    switch (key) {
      case "ticker": return row.key;
      case "swingHighDate": return row.swingDirection === "up" ? row.swingHighDate : row.swingLowDate;
      case "nearestRatio": return row.nearest.ratio;
      case "distancePct": return row.nearest.distancePct;
      case "absDist": return row.absDist;
      case "touchCount": return row.nearest.touchCount;
      case "bounceReverseRate": return row.nearest.bounceReverseRate;
      case "avgBounce": return row.nearest.avgBounceMagnitudePct;
      case "holdRate": return row.nearest.holdRate;
      case "lastTouchDate": return row.nearest.lastTouchDate;
      case "recentBounce": return row.nearest.recentBounce ? (row.nearest.recentBounceDate ?? "1") : null;
      case "compositeScore": return row.nearest.compositeScore;
      default: return null;
    }
  });

  // ── Row expand (all-levels mini table)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // ── Multi-select
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const toggleSelected = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // ── Send fib levels to Charts as seeded overlays (same store Levels & Trendlines uses).
  const seedRows = useCallback((rowsToSend: Array<{ row: FibRow; levels: FibRowLevel[] }>) => {
    for (const key of ["reit-viz-srlevel-seeds-v1", "reit-viz-srlevel-persistent-v1"]) {
      const raw = localStorage.getItem(key);
      let store: Record<string, any[]> = {};
      try { store = raw ? JSON.parse(raw) : {}; } catch { store = {}; }
      for (const { row, levels } of rowsToSend) {
        const anchor = (row.pairA ?? row.ticker).toUpperCase();
        const existing = Array.isArray(store[anchor]) ? store[anchor] : [];
        existing.push(...levels.map((l) => ({
          type: "fib", price: l.price,
          maType: null, maPeriod: null, fibLevel: l.ratio,
          touchCount: l.touchCount, bounceReverseRate: l.bounceReverseRate,
          holdRate: l.holdRate, compositeScore: l.compositeScore,
          futureBars: 60, createdAt: Date.now(),
        })));
        store[anchor] = existing;
      }
      localStorage.setItem(key, JSON.stringify(store));
    }
  }, []);
  const sendToCharts = useCallback((rowsToSend: Array<{ row: FibRow; levels: FibRowLevel[] }>) => {
    if (rowsToSend.length === 0) return;
    try {
      seedRows(rowsToSend);
      const first = rowsToSend[0].row;
      const total = rowsToSend.reduce((s, r) => s + r.levels.length, 0);
      const toast = document.createElement("div");
      toast.textContent = `Sent ${total} fib level${total === 1 ? "" : "s"} (${rowsToSend.length} row${rowsToSend.length === 1 ? "" : "s"}) → Charts`;
      toast.className = "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-amber-500/20 text-amber-300 text-xs font-mono border border-amber-500/40 shadow-lg";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
      if (first.pairA && first.pairB) navigateToPairs(first.pairA.toUpperCase(), first.pairB.toUpperCase());
      else navigateToTicker(first.ticker.toUpperCase());
    } catch (err) { console.error("[FibScreener] send failed", err); }
  }, [seedRows]);

  // ── Pair detail overlay
  const [detailRow, setDetailRow] = useState<FibDisplayRow | null>(null);
  const [detailSeries, setDetailSeries] = useState<{ time: string; value: number }[] | undefined>(undefined);
  useEffect(() => {
    if (!detailRow || !detailRow.pairA || !detailRow.pairB) { setDetailSeries(undefined); return; }
    let alive = true;
    setDetailSeries(undefined);
    (async () => {
      try {
        const globalDates = await fetchGlobalDates();
        const pairData = await getYahooPairsRatio(detailRow.pairA!, detailRow.pairB!, globalDates);
        if (!alive) return;
        if (!pairData) { setDetailSeries([]); return; }
        let dates = pairData.indices.map((idx: number) => globalDates[idx] || "");
        let closes = pairData.prices;
        if (detailRow.freq !== "daily") {
          const ds = weeklyDownsample({ dates, closes, adjCloses: closes, highs: closes, lows: closes }, detailRow.freq);
          dates = ds.dates; closes = ds.closes;
        }
        const series: { time: string; value: number }[] = [];
        for (let i = 0; i < dates.length; i++) {
          if (dates[i] && Number.isFinite(closes[i])) series.push({ time: dates[i], value: closes[i] });
        }
        setDetailSeries(series);
      } catch { if (alive) setDetailSeries([]); }
    })();
    return () => { alive = false; };
  }, [detailRow]);

  // ── CSV export
  const exportCsv = useCallback(() => {
    if (sortedRows.length === 0) return;
    const headers = ["symbol", "name", "freq", "swing_dir", "swing_high", "swing_high_date", "swing_low", "swing_low_date", "current", "nearest_ratio", "nearest_kind", "nearest_price", "dist_pct", "touches", "bounce_rate", "avg_bounce_pct", "hold_rate", "last_touch", "recent_bounce", "score"];
    const dataRows = sortedRows.map((r) => [
      r.key, `"${r.name.replace(/"/g, '""')}"`, r.freq, r.swingDirection,
      r.swingHigh.toFixed(4), r.swingHighDate, r.swingLow.toFixed(4), r.swingLowDate,
      r.currentPrice.toFixed(4), r.nearest.ratio, r.nearest.kind, r.nearest.price.toFixed(4),
      r.nearest.distancePct.toFixed(4), r.nearest.touchCount,
      (r.nearest.bounceReverseRate * 100).toFixed(1), r.nearest.avgBounceMagnitudePct.toFixed(2),
      (r.nearest.holdRate * 100).toFixed(1), r.nearest.lastTouchDate ?? "",
      r.nearest.recentBounce ? "1" : "0", r.nearest.compositeScore.toFixed(3),
    ]);
    const csv = [headers.join(","), ...dataRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fib-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedRows]);

  const inputCls = "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground";
  const lblCls = "text-[9px] uppercase text-muted-foreground tracking-wider";
  const runLabel = mode === "pairs"
    ? `Run · ${targets.length} pairs (${pairLegInfo.legs.length}${pairLegInfo.total > pairLegInfo.legs.length ? ` of ${pairLegInfo.total}` : ""} legs)`
    : `Run · ${targets.length} tickers`;

  if (detailRow && detailRow.pairA && detailRow.pairB) {
    return (
      <PairSeriesDetailOverlay
        onBack={() => setDetailRow(null)}
        heading={`${detailRow.pairA} / ${detailRow.pairB}`}
        subtitle={`Fib levels · ${detailRow.freq} · swing ${detailRow.swingDirection === "up" ? "↑" : "↓"} ${detailRow.swingLow.toFixed(3)} → ${detailRow.swingHigh.toFixed(3)}`}
        series={detailSeries}
        seriesTitle={`${detailRow.pairA} / ${detailRow.pairB} ratio (${detailRow.freq})`}
        refLines={detailRow.levels.map((l) => ({
          value: l.price,
          color: l.kind === "extension" ? "rgba(168,85,247,0.5)" : "rgba(245,158,11,0.5)",
          style: 2,
          label: `Fib ${fmtRatio(l.ratio)}`,
        }))}
        storageKey="reit-viz:fib:pair-detail-indicators"
        testid="fib-pair-detail"
        fmt={(v) => v.toFixed(4)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto" data-testid="fib-page">
      <div className="p-3 text-xs font-mono space-y-3">
        {/* Title */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-bold">Fibonacci Analysis</h1>
            <p className="text-[10px] text-muted-foreground">
              Finds each symbol's dominant swing over the lookback window, lays the full fib ladder over it
              (retracements 0–1 plus 1.272/1.618/2.618 extensions in the trend direction), and ranks by distance
              to the nearest level with that level's historical touch/bounce behavior. Pairs mode scans every
              A/B ratio of the tickers in scope.
            </p>
          </div>
          <PagePresets
            storageKey="reit-viz:fib:presets"
            capture={() => { const { rows, skipped: sk, ...cfg } = serializeState() as any; return cfg; }}
            apply={hydrateState}
            testIdPrefix="fib-presets"
          />
        </div>

        {/* Classification + geo + basket scope */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <ClassificationFilters
            filters={classFilters}
            onFiltersChange={setClassFilters}
            search={search}
            onSearchChange={setSearch}
            manualTickers={manualTickers}
            onManualTickersChange={setManualTickers}
            filteredCount={filteredPool.length}
            totalCount={universeNarrowed.length}
            testIdPrefix="fib"
            extraFilters={geo.geoFilterUI}
          />
          <BasketScopeSelect scope={basketScope} />
        </div>

        {/* Scan config */}
        <div className="flex flex-wrap items-end gap-3 border border-border rounded p-2 bg-card/40">
          <div className="flex flex-col">
            <label className={lblCls}>Mode</label>
            <div className="flex rounded border border-border overflow-hidden mt-0.5">
              {(["tickers", "pairs"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-2.5 py-1 text-[11px] ${mode === m ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                  data-testid={`fib-mode-${m}`}>
                  {m === "tickers" ? "Tickers" : "Universe pairs"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <label className={lblCls}>Frequency</label>
            <div className="flex rounded border border-border overflow-hidden mt-0.5">
              {FREQS.map((f) => (
                <button key={f.key} onClick={() => setFreq(f.key)}
                  className={`px-2.5 py-1 text-[11px] ${freq === f.key ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                  data-testid={`freq-${f.key}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <label className={lblCls}>Date range</label>
            <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className={`${inputCls} mt-0.5`} data-testid="fib-date-preset">
              {DATE_PRESETS.map((p) => (<option key={p.key} value={p.key}>{p.label}</option>))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className={lblCls} title="Swing search window, in bars of the selected frequency">Lookback bars</label>
            <input type="number" min={10} step={1} value={lookbackBars}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 10) setLookbackBars(v); }}
              className={`${inputCls} mt-0.5 w-20`} data-testid="fib-lookback" />
          </div>
          <div className="flex flex-col">
            <label className={lblCls} title="How close price must come to a level to count as a touch">Touch tol %</label>
            <input type="number" min={0.05} step={0.05} value={tolPct}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) setTolPct(v); }}
              className={`${inputCls} mt-0.5 w-20`} data-testid="fib-tolerance" />
          </div>
          <details className="text-[10px]">
            <summary className="cursor-pointer text-muted-foreground pb-1">Advanced</summary>
            <div className="flex items-end gap-3 pt-1">
              <div className="flex flex-col">
                <label className={lblCls} title="Move away from the level (as % of it) that counts as a bounce">Bounce %</label>
                <input type="number" min={0.1} step={0.1} value={bounceThreshPct}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) setBounceThreshPct(v); }}
                  className={`${inputCls} mt-0.5 w-16`} data-testid="fib-bounce-thresh" />
              </div>
              <div className="flex flex-col">
                <label className={lblCls} title="Bars after a touch scanned for the bounce">Lookahead</label>
                <input type="number" min={1} step={1} value={bounceLookahead}
                  onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 1) setBounceLookahead(v); }}
                  className={`${inputCls} mt-0.5 w-14`} data-testid="fib-lookahead" />
              </div>
              <div className="flex flex-col">
                <label className={lblCls} title="Bars a level must hold without a close through it">Hold bars</label>
                <input type="number" min={1} step={1} value={holdBars}
                  onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 1) setHoldBars(v); }}
                  className={`${inputCls} mt-0.5 w-14`} data-testid="fib-holdbars" />
              </div>
              <div className="flex flex-col">
                <label className={lblCls} title="A bounce counts as 'recent' if its touch happened within this many bars of the end">Recent bars</label>
                <input type="number" min={1} step={1} value={recentBounceBars}
                  onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 1) setRecentBounceBars(v); }}
                  className={`${inputCls} mt-0.5 w-14`} data-testid="fib-recent-bars" />
              </div>
            </div>
          </details>
          <div className="flex-1" />
          {running ? (
            <button onClick={handleStop} className="text-[11px] font-bold px-4 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40" data-testid="fib-stop">Stop</button>
          ) : (
            <button onClick={handleRun} disabled={targets.length === 0}
              className="text-[11px] font-bold px-4 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
              data-testid="fib-run">
              {runLabel}
            </button>
          )}
        </div>

        {/* Progress */}
        {running && (<div className="text-[10px] text-muted-foreground">Scanning {progress.current} / {progress.total}…</div>)}

        {/* Post-scan display filters */}
        <div className="flex flex-wrap items-end gap-3 border border-border rounded p-2 bg-card/40">
          <div className="flex flex-col">
            <label className={lblCls} title="Only show rows whose nearest level is within this % of price">Max |dist| %</label>
            <input type="number" min={0.1} step={0.5} value={maxAbsDistPct}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) setMaxAbsDistPct(v); }}
              className={`${inputCls} mt-0.5 w-20`} data-testid="fib-max-dist" />
          </div>
          <div className="flex flex-col">
            <label className={lblCls} title="Minimum historical touches on the nearest level">Min touches</label>
            <input type="number" min={0} step={1} value={minTouchesFilter}
              onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 0) setMinTouchesFilter(v); }}
              className={`${inputCls} mt-0.5 w-16`} data-testid="fib-min-touches" />
          </div>
          <div className="flex flex-col">
            <label className={lblCls}>Levels</label>
            <div className="flex rounded border border-border overflow-hidden mt-0.5">
              {(["all", "retracement", "extension"] as const).map((k) => (
                <button key={k} onClick={() => setLevelKind(k)}
                  className={`px-2 py-1 text-[11px] ${levelKind === k ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                  data-testid={`fib-kind-${k}`}>
                  {k === "all" ? "All" : k === "retracement" ? "Retr" : "Ext"}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] pb-1 cursor-pointer" title="Only rows whose nearest level had a confirmed reversing bounce within the recent-bars window">
            <input type="checkbox" checked={onlyRecentBounces} onChange={(e) => setOnlyRecentBounces(e.target.checked)} data-testid="fib-only-bounces" />
            Recent bounces only
          </label>
          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground pb-1">
            {displayRows.length} of {results.length} scanned rows shown
          </span>
        </div>

        {/* Results */}
        <div className="border border-border rounded">
          <div className="flex items-center bg-card/50 border-b border-border">
            <span className="flex-1 px-2 py-1 text-[11px] font-bold">
              {displayRows.length} symbol{displayRows.length === 1 ? "" : "s"} near a fib level
              {skipped.length > 0 && (<span className="ml-2 text-[10px] text-muted-foreground">({skipped.length} skipped)</span>)}
            </span>
            <button
              onClick={() => sendToCharts(sortedRows.filter((r) => selectedKeys.has(r.key)).map((row) => ({ row, levels: row.levels })))}
              disabled={selectedKeys.size === 0}
              className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="fib-send-selected"
              title="Draw every checked row's full fib ladder on the Charts tab">
              → Charts ({selectedKeys.size})
            </button>
            <button onClick={exportCsv} disabled={sortedRows.length === 0}
              className="mx-2 px-2 py-0.5 rounded text-[10px] border border-border text-muted-foreground hover:text-foreground hover:bg-card/80 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="fib-export-csv">
              CSV
            </button>
          </div>
          {results.length === 0 && !running ? (
            <div className="p-3 text-[11px] text-muted-foreground">No results yet. Set the scope and config above, then click Run.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-card/40 sticky top-0">
                  <tr>
                    <th className="px-2 py-1">
                      <input type="checkbox"
                        checked={sortedRows.length > 0 && sortedRows.every((r) => selectedKeys.has(r.key))}
                        onChange={(e) => setSelectedKeys(e.target.checked ? new Set(sortedRows.map((r) => r.key)) : new Set())}
                        title="Select all" data-testid="fib-select-all" />
                    </th>
                    <th className="px-2 py-1" />
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Sym" columnKey="ticker" sort={sort} /></th>
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Swing" columnKey="swingHighDate" sort={sort} /></th>
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Nearest" columnKey="nearestRatio" sort={sort} /></th>
                    <th className="text-right px-2 py-1 font-mono" title="(current − level) ÷ level × 100; positive = price above the level"><SortHeader label="Dist %" columnKey="distancePct" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono"><SortHeader label="|Dist|" columnKey="absDist" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono"><SortHeader label="Touches" columnKey="touchCount" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono" title="Share of touches followed by a confirmed reversal"><SortHeader label="Bounce %" columnKey="bounceReverseRate" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono" title="Average post-touch move away from the level"><SortHeader label="Avg bnc %" columnKey="avgBounce" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono" title="Share of touches where the level held without a close through it"><SortHeader label="Hold %" columnKey="holdRate" sort={sort} align="right" /></th>
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Last touch" columnKey="lastTouchDate" sort={sort} /></th>
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Recent" columnKey="recentBounce" sort={sort} /></th>
                    <th className="text-right px-2 py-1 font-mono" title="Composite of touch count, bounce rate, hold rate, recency"><SortHeader label="Score" columnKey="compositeScore" sort={sort} align="right" /></th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, idx) => {
                    const isPair = !!(row.pairA && row.pairB);
                    const isOpen = expanded.has(row.key);
                    return [
                      <tr key={`${row.key}-${idx}`} className="border-t border-border hover:bg-card/40" data-testid={`fib-row-${row.key}-${idx}`}>
                        <td className="px-2 py-1">
                          <input type="checkbox" checked={selectedKeys.has(row.key)} onChange={() => toggleSelected(row.key)} data-testid={`fib-check-${row.key}-${idx}`} />
                        </td>
                        <td className="px-1 py-1">
                          <button onClick={() => toggleExpanded(row.key)} className="text-muted-foreground hover:text-foreground" title="Show all levels" data-testid={`fib-expand-${row.key}-${idx}`}>
                            {isOpen ? "▾" : "▸"}
                          </button>
                        </td>
                        <td className="px-2 py-1 font-bold">
                          {isPair ? (
                            <button className="hover:underline text-left" onClick={() => setDetailRow(row)} title="Open pair detail with fib reference lines" data-testid={`fib-pair-open-${row.key}-${idx}`}>
                              {row.key}
                            </button>
                          ) : row.key}
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap" title={`High ${row.swingHigh.toFixed(2)} on ${row.swingHighDate} · Low ${row.swingLow.toFixed(2)} on ${row.swingLowDate}`}>
                          {row.swingDirection === "up"
                            ? <span><span className="text-emerald-400">↑</span> {shortDate(row.swingLowDate)} → {shortDate(row.swingHighDate)}</span>
                            : <span><span className="text-rose-400">↓</span> {shortDate(row.swingHighDate)} → {shortDate(row.swingLowDate)}</span>}
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${row.nearest.kind === "extension" ? "bg-purple-500/20 text-purple-300" : "bg-amber-500/20 text-amber-300"}`}>
                            {fmtRatio(row.nearest.ratio)} {row.nearest.kind === "extension" ? "X" : "R"}
                          </span>
                          <span className="ml-1.5 text-muted-foreground">{row.nearest.price.toFixed(2)}</span>
                        </td>
                        <td className={`px-2 py-1 text-right font-bold ${row.nearest.distancePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {row.nearest.distancePct >= 0 ? "+" : ""}{row.nearest.distancePct.toFixed(2)}%
                        </td>
                        <td className="px-2 py-1 text-right">{row.absDist.toFixed(2)}%</td>
                        <td className="px-2 py-1 text-right">{row.nearest.touchCount}</td>
                        <td className="px-2 py-1 text-right">{(row.nearest.bounceReverseRate * 100).toFixed(0)}%</td>
                        <td className="px-2 py-1 text-right">{row.nearest.avgBounceMagnitudePct.toFixed(1)}%</td>
                        <td className="px-2 py-1 text-right">{(row.nearest.holdRate * 100).toFixed(0)}%</td>
                        <td className="px-2 py-1 whitespace-nowrap">{row.nearest.lastTouchDate ? shortDate(row.nearest.lastTouchDate) : "—"}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {row.nearest.recentBounce && (
                            <span className="px-1 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" title={`Bounced ${row.nearest.recentBounceDate ?? ""}`}>
                              ⤾ bounce
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">{row.nearest.compositeScore.toFixed(2)}</td>
                        <td className="px-2 py-1">
                          <button onClick={() => sendToCharts([{ row, levels: row.levels }])}
                            className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                            data-testid={`fib-send-${row.key}-${idx}`}
                            title="Draw this symbol's full fib ladder on the Charts tab">
                            → Charts
                          </button>
                        </td>
                      </tr>,
                      isOpen && (
                        <tr key={`${row.key}-${idx}-detail`} className="border-t border-border/50 bg-card/20">
                          <td colSpan={15} className="px-6 py-2">
                            <table className="text-[10px]">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left pr-4 font-normal">Level</th>
                                  <th className="text-right pr-4 font-normal">Price</th>
                                  <th className="text-right pr-4 font-normal">Dist %</th>
                                  <th className="text-right pr-4 font-normal">Touches</th>
                                  <th className="text-right pr-4 font-normal">Bounce %</th>
                                  <th className="text-right pr-4 font-normal">Hold %</th>
                                  <th className="text-left pr-4 font-normal">Last touch</th>
                                  <th className="pr-4" />
                                </tr>
                              </thead>
                              <tbody>
                                {[...row.levels].sort((a, b) => b.price - a.price).map((l) => (
                                  <tr key={`${row.key}-${l.kind}-${l.ratio}`} className={Math.abs(l.distancePct) === row.absDist ? "font-bold" : ""}>
                                    <td className="pr-4">
                                      <span className={l.kind === "extension" ? "text-purple-300" : "text-amber-300"}>
                                        {fmtRatio(l.ratio)} {l.kind === "extension" ? "X" : "R"}
                                      </span>
                                      {l.recentBounce && <span className="ml-1 text-emerald-300" title={`Bounced ${l.recentBounceDate ?? ""}`}>⤾</span>}
                                    </td>
                                    <td className="text-right pr-4">{l.price.toFixed(2)}</td>
                                    <td className={`text-right pr-4 ${l.distancePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{l.distancePct >= 0 ? "+" : ""}{l.distancePct.toFixed(2)}%</td>
                                    <td className="text-right pr-4">{l.touchCount}</td>
                                    <td className="text-right pr-4">{(l.bounceReverseRate * 100).toFixed(0)}%</td>
                                    <td className="text-right pr-4">{(l.holdRate * 100).toFixed(0)}%</td>
                                    <td className="pr-4">{l.lastTouchDate ? shortDate(l.lastTouchDate) : "—"}</td>
                                    <td className="pr-4">
                                      <button onClick={() => sendToCharts([{ row, levels: [l] }])}
                                        className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300/80 border border-amber-500/30 hover:bg-amber-500/25"
                                        title="Draw just this level on the Charts tab">
                                        → Charts
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Skipped */}
        {skipped.length > 0 && (
          <details className="text-[10px] text-muted-foreground">
            <summary className="cursor-pointer">Skipped ({skipped.length})</summary>
            <ul className="mt-1 pl-4 list-disc">
              {skipped.map((s, idx) => (<li key={idx}>{s.ticker}: {s.reason}</li>))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
