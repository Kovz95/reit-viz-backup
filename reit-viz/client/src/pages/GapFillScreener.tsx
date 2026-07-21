// Gap Fill Screener — scans the filtered universe's daily OHLC for price gaps
// that are STILL OPEN (unfilled) and shows the % return needed to fill each.
//
// Detection (full gaps only, on adjusted OHLC):
//   gap UP at bar t:   low[t]  > high[t-1]  → fill level = prior high[t-1];
//                      filled when a later bar's low  <= fill level.
//   gap DOWN at bar t: high[t] < low[t-1]   → fill level = prior low[t-1];
//                      filled when a later bar's high >= fill level.
//   % to fill = (fillLevel / currentPrice − 1) × 100 — negative for open
//   gap-ups (price must fall to fill), positive for open gap-downs.

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { fetchWorkbookTickers, type TickerMeta } from "@/lib/fetchWorkbookTickers";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { DATE_PRESETS, getDateRangeFromPreset, sliceDateRange } from "@/lib/datePresets";
import { navigateToTicker } from "@/lib/navigateToTicker";
import { useWorkspaceState } from "@/lib/workspaceState";
import { useUniverse } from "@/lib/universeContext";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { useTableSort, SortHeader } from "@/lib/useTableSort";
import { useBasketScope, BasketScopeSelect } from "@/components/BasketScopeSelect";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GapRow {
  ticker: string;
  name: string;
  direction: "up" | "down";
  gapDate: string;
  gapSizePct: number;   // size of the gap itself, %
  fillLevel: number;    // adjusted price that closes the gap
  farLevel?: number;    // the gap's other edge (up: gap day's low; down: gap day's high)
  currentPrice: number; // last adjusted close
  pctToFill: number;    // (fillLevel / currentPrice − 1) × 100
  daysOpen: number;     // trading bars since the gap (to fill date when filled)
  filled: boolean;
  fillDate: string | null;
}

/** The gap's far edge; derived from gapSizePct for rows saved before farLevel existed. */
function gapFarLevel(row: GapRow): number {
  if (Number.isFinite(row.farLevel)) return row.farLevel as number;
  return row.direction === "up"
    ? row.fillLevel * (1 + row.gapSizePct / 100)
    : row.fillLevel * (1 - row.gapSizePct / 100);
}

/** Stable identity for row selection across sorts. */
const rowKey = (row: GapRow) => `${row.ticker}|${row.gapDate}|${row.direction}`;

interface SkippedEntry { ticker: string; reason: string; }

const MIN_BARS = 60;

// ─── Component ───────────────────────────────────────────────────────────────

export default function GapFillScreener() {
  const { universeTickers } = useUniverse();
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  useEffect(() => { fetchWorkbookTickers().then(setAllTickers).catch(() => {}); }, []);

  // ── Filters: 6 classification levels + search + manual add + Country/Exchange
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());

  // Global universe narrowing first (so basket-as-universe works), then page filters.
  const universeNarrowed = useMemo(
    () => (universeTickers ? allTickers.filter((t) => universeTickers.has(t.ticker)) : allTickers),
    [allTickers, universeTickers],
  );
  const geo = useGeoFilter(universeNarrowed, "gapfill-geo");
  // Optional basket scope on top of the universe/class/geo filters (no-op when unset).
  const basketScope = useBasketScope("reit-viz:basket-scope:gap-fill");
  const filteredPool = useMemo(
    () => geo.filterByGeo(applyClassFilters(universeNarrowed as any[], classFilters, search, manualTickers))
      .filter((t: TickerMeta) => basketScope.inScope(t.ticker)),
    [universeNarrowed, classFilters, search, manualTickers, geo.filterByGeo, basketScope.members],
  );

  // ── Scan config
  const [datePreset, setDatePreset] = useState("1y");
  const [minGapPct, setMinGapPct] = useState(0.5);
  const [dirFilter, setDirFilter] = useState<"both" | "up" | "down">("both");
  const [includeFilled, setIncludeFilled] = useState(false);

  // ── Run state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<GapRow[]>([]);
  const [skipped, setSkipped] = useState<SkippedEntry[]>([]);
  const cancelRef = useRef(false);

  // ── Persistence (config + results)
  const serializeState = useCallback(
    () => ({
      classFiltersSer: serializeClassFilters(classFilters),
      search,
      manualTickers: [...manualTickers],
      datePreset,
      minGapPct,
      dirFilter,
      includeFilled,
      rows: results,
      skipped,
    }),
    [classFilters, search, manualTickers, datePreset, minGapPct, dirFilter, includeFilled, results, skipped],
  );
  const hydrateState = useCallback((state: any) => {
    if (!state || typeof state !== "object") return;
    if (state.classFiltersSer) setClassFilters(deserializeClassFilters(state.classFiltersSer));
    if (typeof state.search === "string") setSearch(state.search);
    if (Array.isArray(state.manualTickers)) setManualTickers(new Set(state.manualTickers.filter((t: any) => typeof t === "string")));
    if (typeof state.datePreset === "string" && DATE_PRESETS.some((p) => p.key === state.datePreset)) setDatePreset(state.datePreset);
    if (typeof state.minGapPct === "number" && Number.isFinite(state.minGapPct)) setMinGapPct(state.minGapPct);
    if (state.dirFilter === "both" || state.dirFilter === "up" || state.dirFilter === "down") setDirFilter(state.dirFilter);
    if (typeof state.includeFilled === "boolean") setIncludeFilled(state.includeFilled);
    if (Array.isArray(state.rows)) setResults(state.rows);
    if (Array.isArray(state.skipped)) setSkipped(state.skipped);
  }, []);
  useWorkspaceState("gap-fill", serializeState, hydrateState);

  // ── Run
  const handleStop = useCallback(() => { cancelRef.current = true; }, []);
  const handleRun = useCallback(async () => {
    if (filteredPool.length === 0) return;
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setSkipped([]);
    setProgress({ current: 0, total: filteredPool.length });
    const dateRange = getDateRangeFromPreset(datePreset);
    const rows: GapRow[] = [];
    const resultSkipped: SkippedEntry[] = [];

    for (let i = 0; i < filteredPool.length; i++) {
      if (cancelRef.current) break;
      const item = filteredPool[i];
      try {
        const ohlcv = await fetchTickerOHLCV(item.ticker);
        if (!ohlcv.dates.length) { resultSkipped.push({ ticker: item.ticker, reason: "no data" }); continue; }
        const sliced = sliceDateRange(ohlcv, dateRange);
        const n = sliced.adjCloses.length;
        if (n < MIN_BARS) { resultSkipped.push({ ticker: item.ticker, reason: `only ${n} bars in range (need ${MIN_BARS})` }); continue; }
        // Adjusted OHLC: scale highs/lows into adj space (same as Levels & Trendlines).
        const closes = sliced.adjCloses;
        const highs = sliced.highs.map((h: number, idx: number) => {
          const c = sliced.closes[idx], ac = sliced.adjCloses[idx];
          return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? h * (ac / c) : h;
        });
        const lows = sliced.lows.map((l: number, idx: number) => {
          const c = sliced.closes[idx], ac = sliced.adjCloses[idx];
          return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? l * (ac / c) : l;
        });
        const dates = sliced.dates;
        const currentPrice = closes[n - 1];
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) { resultSkipped.push({ ticker: item.ticker, reason: "bad last close" }); continue; }

        for (let t = 1; t < n; t++) {
          const prevHigh = highs[t - 1], prevLow = lows[t - 1];
          const curLow = lows[t], curHigh = highs[t];
          if (![prevHigh, prevLow, curLow, curHigh].every((v) => Number.isFinite(v) && v > 0)) continue;

          let direction: "up" | "down" | null = null;
          let fillLevel = 0;
          let gapSizePct = 0;
          if (curLow > prevHigh) {
            direction = "up";
            fillLevel = prevHigh;
            gapSizePct = ((curLow - prevHigh) / prevHigh) * 100;
          } else if (curHigh < prevLow) {
            direction = "down";
            fillLevel = prevLow;
            gapSizePct = ((prevLow - curHigh) / prevLow) * 100;
          }
          if (!direction || gapSizePct < minGapPct) continue;
          if (dirFilter !== "both" && direction !== dirFilter) continue;

          // Scan forward for a fill.
          let filled = false;
          let fillIdx = -1;
          for (let u = t + 1; u < n; u++) {
            if (direction === "up" ? lows[u] <= fillLevel : highs[u] >= fillLevel) { filled = true; fillIdx = u; break; }
          }
          if (filled && !includeFilled) continue;

          rows.push({
            ticker: item.ticker,
            name: item.name || item.ticker,
            direction,
            gapDate: dates[t],
            gapSizePct,
            fillLevel,
            farLevel: direction === "up" ? curLow : curHigh,
            currentPrice,
            pctToFill: (fillLevel / currentPrice - 1) * 100,
            daysOpen: (filled ? fillIdx : n - 1) - t,
            filled,
            fillDate: filled ? dates[fillIdx] : null,
          });
        }
      } catch (err: any) {
        resultSkipped.push({ ticker: item.ticker, reason: err?.message || "error" });
      }
      setProgress({ current: i + 1, total: filteredPool.length });
      if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
    }

    // Nearest-to-fill first (open gaps closest to price at top).
    rows.sort((a, b) => Math.abs(a.pctToFill) - Math.abs(b.pctToFill));
    setResults(rows);
    setSkipped(resultSkipped);
    setRunning(false);
  }, [filteredPool, datePreset, minGapPct, dirFilter, includeFilled]);

  // ── Sortable results
  const sort = useTableSort<GapRow>("", "desc", "desc", "gapfill");
  const sortedResults = sort.apply(results, (row, key) => {
    switch (key) {
      case "ticker": return row.ticker;
      case "direction": return row.direction;
      case "gapDate": return row.gapDate;
      case "gapSizePct": return row.gapSizePct;
      case "fillLevel": return row.fillLevel;
      case "currentPrice": return row.currentPrice;
      case "pctToFill": return row.pctToFill;
      case "daysOpen": return row.daysOpen;
      default: return null;
    }
  });

  const openCount = results.filter((r) => !r.filled).length;
  const tickerCount = useMemo(() => new Set(results.map((r) => r.ticker)).size, [results]);

  // ── Multi-select for sending several gaps at once.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const toggleSelected = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // ── Send gaps to Charts as shaded gap zones (fill level + far edge + band).
  // Accepts any number of rows, possibly across tickers: seeds are written per
  // ticker and the chart opens on the first row's ticker — the other tickers'
  // zones appear when you switch to them.
  const sendToCharts = useCallback((rowsToSend: GapRow[]) => {
    if (rowsToSend.length === 0) return;
    try {
      const byTicker = new Map<string, GapRow[]>();
      for (const row of rowsToSend) {
        const t = row.ticker.toUpperCase();
        if (!byTicker.has(t)) byTicker.set(t, []);
        byTicker.get(t)!.push(row);
      }
      for (const key of ["reit-viz-srlevel-seeds-v1", "reit-viz-srlevel-persistent-v1"]) {
        const raw = localStorage.getItem(key);
        let store: Record<string, any[]> = {};
        try { store = raw ? JSON.parse(raw) : {}; } catch { store = {}; }
        for (const [ticker, tickerRows] of byTicker) {
          const existing = Array.isArray(store[ticker]) ? store[ticker] : [];
          existing.push(...tickerRows.map((row) => ({
            type: "gapzone", price: row.fillLevel, price2: gapFarLevel(row),
            direction: row.direction, gapDate: row.gapDate,
            maType: null, maPeriod: null, fibLevel: null,
            touchCount: 0, bounceReverseRate: 0, holdRate: 0,
            compositeScore: Math.min(1, row.gapSizePct / 10),
            futureBars: 60, createdAt: Date.now(),
          })));
          store[ticker] = existing;
        }
        localStorage.setItem(key, JSON.stringify(store));
      }
      const primary = rowsToSend[0].ticker.toUpperCase();
      const toast = document.createElement("div");
      toast.textContent =
        rowsToSend.length === 1
          ? `Sent gap zone $${rowsToSend[0].fillLevel.toFixed(2)} for ${primary} → Charts`
          : `Sent ${rowsToSend.length} gap zones (${byTicker.size} ticker${byTicker.size > 1 ? "s" : ""}) → Charts`;
      toast.className = "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-cyan-500/20 text-cyan-300 text-xs font-mono border border-cyan-500/40 shadow-lg";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
      navigateToTicker(primary);
    } catch (err) { console.error("[GapFillScreener] send failed", err); }
  }, []);

  // ── CSV export
  const exportCsv = useCallback(() => {
    if (sortedResults.length === 0) return;
    const headers = ["ticker", "name", "direction", "gap_date", "gap_size_pct", "fill_level", "current_price", "pct_to_fill", "days_open", "filled", "fill_date"];
    const dataRows = sortedResults.map((r) => [
      r.ticker, `"${r.name.replace(/"/g, '""')}"`, r.direction, r.gapDate, r.gapSizePct.toFixed(4),
      r.fillLevel.toFixed(4), r.currentPrice.toFixed(4), r.pctToFill.toFixed(4), r.daysOpen,
      r.filled ? "1" : "0", r.fillDate ?? "",
    ]);
    const csv = [headers.join(","), ...dataRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gap-fill-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedResults]);

  const inputCls = "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground";

  return (
    <div className="h-full overflow-y-auto" data-testid="gap-fill-page">
      <div className="p-3 text-xs font-mono space-y-3">
        {/* Title */}
        <div>
          <h1 className="text-base font-bold">Gap Fill Screener</h1>
          <p className="text-[10px] text-muted-foreground">
            Scans daily OHLC for full price gaps (bar's low above the prior high, or high below the prior low) that
            are still open, and shows the % move from the current price needed to fill each one. Gap-ups above price
            need a decline to fill (negative %); gap-downs below price need a rally (positive %).
          </p>
        </div>

        {/* Classification + Country/Exchange filters */}
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
            testIdPrefix="gapfill"
            extraFilters={geo.geoFilterUI}
          />
          <BasketScopeSelect scope={basketScope} />
        </div>

        {/* Scan config */}
        <div className="flex flex-wrap items-end gap-3 border border-border rounded p-2 bg-card/40">
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider">Date range</label>
            <select value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className={`${inputCls} mt-0.5`} data-testid="gapfill-date-preset">
              {DATE_PRESETS.map((p) => (<option key={p.key} value={p.key}>{p.label}</option>))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider" title="Minimum gap size (low-to-prior-high distance) as % of the prior extreme">Min gap %</label>
            <input type="number" min={0} step={0.1} value={minGapPct}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) setMinGapPct(v); }}
              className={`${inputCls} mt-0.5 w-20`} data-testid="gapfill-min-gap" />
          </div>
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider">Direction</label>
            <div className="flex items-center gap-0.5 mt-0.5">
              {(["both", "up", "down"] as const).map((d) => (
                <button key={d} onClick={() => setDirFilter(d)}
                  className={`text-[11px] px-2 py-1 rounded border ${dirFilter === d ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:text-foreground"}`}
                  data-testid={`gapfill-dir-${d}`}>
                  {d === "both" ? "Both" : d === "up" ? "▲ Up" : "▼ Down"}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] pb-1 cursor-pointer" title="Also list gaps that have already been filled (with their fill date)">
            <input type="checkbox" checked={includeFilled} onChange={(e) => setIncludeFilled(e.target.checked)} data-testid="gapfill-include-filled" />
            Include filled
          </label>
          <div className="flex-1" />
          {running ? (
            <button onClick={handleStop} className="text-[11px] font-bold px-4 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40" data-testid="gapfill-stop">Stop</button>
          ) : (
            <button onClick={handleRun} disabled={filteredPool.length === 0}
              className="text-[11px] font-bold px-4 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
              data-testid="gapfill-run">
              Run · {filteredPool.length} tickers
            </button>
          )}
        </div>

        {/* Progress */}
        {running && (<div className="text-[10px] text-muted-foreground">Scanning {progress.current} / {progress.total}…</div>)}

        {/* Results */}
        <div className="border border-border rounded">
          <div className="flex items-center bg-card/50 border-b border-border">
            <span className="flex-1 px-2 py-1 text-[11px] font-bold">
              {openCount} open gap{openCount === 1 ? "" : "s"} across {tickerCount} ticker{tickerCount === 1 ? "" : "s"}
              {includeFilled && results.length > openCount && (<span className="ml-2 text-[10px] text-muted-foreground">(+{results.length - openCount} filled)</span>)}
              {skipped.length > 0 && (<span className="ml-2 text-[10px] text-muted-foreground">({skipped.length} skipped)</span>)}
            </span>
            <button
              onClick={() => sendToCharts(sortedResults.filter((r) => selectedKeys.has(rowKey(r))))}
              disabled={selectedKeys.size === 0}
              className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="gapfill-send-selected"
              title="Draw every checked gap on the Charts tab as a shaded zone">
              → Charts ({selectedKeys.size})
            </button>
            <button onClick={exportCsv} disabled={sortedResults.length === 0}
              className="mx-2 px-2 py-0.5 rounded text-[10px] border border-border text-muted-foreground hover:text-foreground hover:bg-card/80 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="gapfill-export-csv">
              CSV
            </button>
          </div>
          {results.length === 0 && !running ? (
            <div className="p-3 text-[11px] text-muted-foreground">No gaps yet. Set the filters and date range above, then click Run.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-card/40 sticky top-0">
                  <tr>
                    <th className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={sortedResults.length > 0 && sortedResults.every((r) => selectedKeys.has(rowKey(r)))}
                        onChange={(e) =>
                          setSelectedKeys(e.target.checked ? new Set(sortedResults.map(rowKey)) : new Set())
                        }
                        title="Select all"
                        data-testid="gapfill-select-all"
                      />
                    </th>
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Ticker" columnKey="ticker" sort={sort} /></th>
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Dir" columnKey="direction" sort={sort} /></th>
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Gap date" columnKey="gapDate" sort={sort} /></th>
                    <th className="text-right px-2 py-1 font-mono"><SortHeader label="Gap size %" columnKey="gapSizePct" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono"><SortHeader label="Fill level" columnKey="fillLevel" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono"><SortHeader label="Current" columnKey="currentPrice" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono" title="(fill level ÷ current price − 1) × 100 — the % move needed to fill the gap"><SortHeader label="% to fill" columnKey="pctToFill" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono"><SortHeader label="Days open" columnKey="daysOpen" sort={sort} align="right" /></th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((row, idx) => (
                    <tr key={`${row.ticker}-${row.gapDate}-${idx}`} className="border-t border-border hover:bg-card/40" data-testid={`gapfill-row-${row.ticker}-${idx}`}>
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(rowKey(row))}
                          onChange={() => toggleSelected(rowKey(row))}
                          data-testid={`gapfill-check-${row.ticker}-${idx}`}
                        />
                      </td>
                      <td className="px-2 py-1 font-bold">{row.ticker}</td>
                      <td className="px-2 py-1">
                        <span className={row.direction === "up" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}
                          title={row.direction === "up" ? "Gapped up — the unfilled zone sits below price" : "Gapped down — the unfilled zone sits above price"}>
                          {row.direction === "up" ? "▲ up" : "▼ down"}
                        </span>
                        {row.filled && (<span className="ml-1.5 px-1 py-0.5 rounded text-[9px] bg-muted text-muted-foreground" title={`Filled ${row.fillDate}`}>Filled</span>)}
                      </td>
                      <td className="px-2 py-1">{row.gapDate}{row.filled && row.fillDate ? <span className="text-muted-foreground"> → {row.fillDate}</span> : null}</td>
                      <td className="px-2 py-1 text-right">{row.gapSizePct.toFixed(2)}%</td>
                      <td className="px-2 py-1 text-right">{row.fillLevel.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{row.currentPrice.toFixed(2)}</td>
                      <td className={`px-2 py-1 text-right font-bold ${row.pctToFill >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {row.pctToFill >= 0 ? "+" : ""}{row.pctToFill.toFixed(2)}%
                      </td>
                      <td className="px-2 py-1 text-right">{row.daysOpen}</td>
                      <td className="px-2 py-1">
                        <button onClick={() => sendToCharts([row])}
                          className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30"
                          data-testid={`gapfill-send-${row.ticker}-${idx}`}
                          title="Draw this gap on the Charts tab as a shaded zone">
                          → Charts
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Skipped */}
        {skipped.length > 0 && (
          <details className="text-[10px] text-muted-foreground">
            <summary className="cursor-pointer">Skipped tickers ({skipped.length})</summary>
            <ul className="mt-1 pl-4 list-disc">
              {skipped.map((s, idx) => (<li key={idx}>{s.ticker}: {s.reason}</li>))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
