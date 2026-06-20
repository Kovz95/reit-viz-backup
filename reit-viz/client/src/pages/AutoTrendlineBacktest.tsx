// Reconstructed from recovered-bundle/AutoTrendlineBacktest-BuiEwErn.js on 2026-06-11
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppContext } from "@/lib/appContext";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { usePersistedState } from "@/lib/persistedState";
import { useWorkspaceState } from "@/lib/workspaceState";
import { fetchGlobalDates } from "@/lib/fetchGlobalDates";
import { fetchWorkbookSeriesForTicker } from "@/lib/fetchWorkbookSeriesForTicker";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { computeAutoTrendlines } from "@/lib/computeAutoTrendlines";
import { TRENDLINE_DIRECTION_MAP } from "@/lib/trendlineDirectionMap";
import { navigateToPairs } from "@/lib/navigateToPairs";
import { sendAutoTrendlineToCharts } from "@/lib/sendAutoTrendlineToCharts";
import { navigateToTicker } from "@/lib/navigateToTicker";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { CROSS_KIND_LABELS } from "@/lib/crossKindLabels";
import { InputSeriesSelector } from "@/lib/inputSeriesSelector";
import { ChevronRight } from "lucide-react";
import { DEFAULT_INPUT_SELECTION } from "@/lib/defaultInputSelection";
import { g as getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { u as usePairComboPicker } from "@/lib/usePairComboPicker";
import { B as BasketPicker } from "@/components/BasketPicker";
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { S as SquareIcon } from "@/lib/square";
import { P as PlayIcon } from "@/lib/play";

// ─── Constants ──────────────────────────────────────────────────────────────

const HORIZONS = [
  { days: 5, label: "1W" },
  { days: 10, label: "2W" },
  { days: 21, label: "1M" },
  { days: 42, label: "2M" },
  { days: 63, label: "3M" },
  { days: 126, label: "6M" },
];

const ALL_CROSS_KINDS = [
  "cross_above_upper",
  "cross_above_lower",
  "cross_below_upper",
  "cross_below_lower",
] as const;

type CrossKind = typeof ALL_CROSS_KINDS[number];

// ─── Types ───────────────────────────────────────────────────────────────────

interface TickerMeta {
  ticker: string;
  name?: string;
  pairA?: string;
  pairB?: string;
}

interface BacktestRow {
  ticker: string;
  name: string;
  n: number;
  kind: CrossKind;
  direction: "long" | "short";
  count: number;
  hitRate: Record<string, number>;
  avgReturn: Record<string, number>;
  medReturn: Record<string, number>;
  lastSignalBarIdx: number;
  lastSignalDate: string;
  barsSinceLast: number;
  pairA?: string;
  pairB?: string;
}

interface SkippedEntry {
  ticker: string;
  reason: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNList(raw: string): number[] {
  const result: number[] = [];
  const seen = new Set<number>();
  for (const part of raw.split(/[,\s]+/)) {
    const num = Number(part);
    if (!Number.isFinite(num)) continue;
    const clamped = Math.max(2, Math.min(50, Math.round(num)));
    if (!seen.has(clamped)) {
      seen.add(clamped);
      result.push(clamped);
    }
  }
  return result.length > 0 ? result : [10];
}

function formatHitRate(val: number | null | undefined): string {
  return val == null || !Number.isFinite(val)
    ? "—"
    : `${(val * 100).toFixed(2)}%`;
}

function formatReturn(val: number | null | undefined): string {
  return val == null || !Number.isFinite(val)
    ? "—"
    : `${val >= 0 ? "+" : ""}${(val * 100).toFixed(2)}%`;
}

function hitRateClass(val: number): string {
  return Number.isFinite(val)
    ? val >= 0.7
      ? "text-emerald-400 font-semibold"
      : val >= 0.6
      ? "text-emerald-500"
      : val >= 0.5
      ? "text-amber-400"
      : "text-red-400"
    : "text-muted-foreground";
}

function returnClass(val: number): string {
  return Number.isFinite(val)
    ? val > 0
      ? "text-emerald-400"
      : val < 0
      ? "text-red-400"
      : "text-muted-foreground"
    : "text-muted-foreground";
}

function median(arr: number[]): number {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AutoTrendlineBacktest() {
  const {
    universeTickers,
    filteredCount,
    totalCount,
  } = useAppContext();

  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  useEffect(() => {
    fetchWorkbookTickers()
      .then((tickers: any[]) => setAllTickers(tickers as TickerMeta[]))
      .catch(() => {});
  }, []);

  // ── Controls ──
  const [n, setN] = useState(10);
  const [sweepMode, setSweepMode] = useState(false);
  const [nList, setNList] = useState("5,8,10,15,20");
  const [scopeMode, setScopeMode] = useState<"single" | "pair" | "pairCombo" | "basket" | "universe">("universe");
  const [singleTicker, setSingleTicker] = useState("ABR");
  const [inputSelection, setInputSelection] = usePersistedState(
    "auto-trendline-bt:input-selection",
    DEFAULT_INPUT_SELECTION
  );
  const [pairTickerA, setPairTickerA] = useState("NEE");
  const [pairTickerB, setPairTickerB] = useState("SO");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState<"daily" | "weekly">("daily");
  const pairCombo = usePairComboPicker(allTickers, scopeMode === "pairCombo", "atl-paircombo");
  const [minSignals, setMinSignals] = useState(5);
  const [minBars, setMinBars] = useState(252);
  const [enabledKinds, setEnabledKinds] = useState<Set<CrossKind>>(
    () => new Set(ALL_CROSS_KINDS as unknown as CrossKind[])
  );
  const [primaryHorizon, setPrimaryHorizon] = useState("1M");
  const [sortKey, setSortKey] = useState("hitRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [liveOnly, setLiveOnly] = useState(false);
  const [liveMaxBars, setLiveMaxBars] = useState(20);

  // ── Run state ──
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [rows, setRows] = usePersistedState<BacktestRow[]>("auto-trendline-bt:rows", []);
  const [skipped, setSkipped] = usePersistedState<SkippedEntry[]>("auto-trendline-bt:skipped", []);
  const [lastRunAt, setLastRunAt] = usePersistedState<number | null>("auto-trendline-bt:lastRunAt", null);
  const [lastRunTimeframe, setLastRunTimeframe] = usePersistedState(
    "auto-trendline-bt:lastRunTimeframe",
    "daily"
  );

  const cancelRef = useRef(false);

  // ── Workspace state serialization ──
  const serializeState = useCallback(() => ({
    n,
    sweepMode,
    nList,
    scopeMode,
    singleTicker,
    pairTickerA,
    pairTickerB,
    basketTickers,
    pc: pairCombo.serialize(),
    timeframe,
    minSignals,
    minBars,
    enabledKinds: Array.from(enabledKinds),
    primaryHorizon,
    sortKey,
    sortDir,
    liveOnly,
    liveMaxBars,
    inputSelection,
  }), [n, sweepMode, nList, scopeMode, singleTicker, pairTickerA, pairTickerB, basketTickers, pairCombo, timeframe, minSignals, minBars, enabledKinds, primaryHorizon, sortKey, sortDir, liveOnly, liveMaxBars, inputSelection]);

  const hydrateState = useCallback((state: any) => {
    try {
      if (typeof state?.n === "number") setN(state.n);
      if (typeof state?.sweepMode === "boolean") setSweepMode(state.sweepMode);
      if (typeof state?.nList === "string") setNList(state.nList);
      if (
        state?.scopeMode === "single" ||
        state?.scopeMode === "pair" ||
        state?.scopeMode === "pairCombo" ||
        state?.scopeMode === "universe" ||
        state?.scopeMode === "basket"
      ) setScopeMode(state.scopeMode);
      if (typeof state?.singleTicker === "string") setSingleTicker(state.singleTicker);
      if (typeof state?.pairTickerA === "string") setPairTickerA(state.pairTickerA);
      if (typeof state?.pairTickerB === "string") setPairTickerB(state.pairTickerB);
      if (Array.isArray(state?.basketTickers)) setBasketTickers(state.basketTickers);
      if (state?.pc) pairCombo.hydrate(state.pc);
      if (state?.timeframe === "daily" || state?.timeframe === "weekly") setTimeframe(state.timeframe);
      if (typeof state?.minSignals === "number") setMinSignals(state.minSignals);
      if (typeof state?.minBars === "number") setMinBars(state.minBars);
      if (Array.isArray(state?.enabledKinds)) {
        setEnabledKinds(new Set(state.enabledKinds.filter((k: string) => (ALL_CROSS_KINDS as readonly string[]).includes(k)) as CrossKind[]));
      }
      if (typeof state?.primaryHorizon === "string") setPrimaryHorizon(state.primaryHorizon);
      if (typeof state?.sortKey === "string") setSortKey(state.sortKey);
      if (typeof state?.sortDir === "string") setSortDir(state.sortDir);
      if (typeof state?.liveOnly === "boolean") setLiveOnly(state.liveOnly);
      if (typeof state?.liveMaxBars === "number") setLiveMaxBars(state.liveMaxBars);
      if (state?.inputSelection && typeof state.inputSelection === "object") {
        const sel = state.inputSelection;
        if (sel.kind === "close" || (sel.kind === "workbook" && typeof sel.metric === "string")) {
          setInputSelection(sel);
        }
      }
    } catch {}
  }, [pairCombo, setInputSelection]);

  useWorkspaceState("auto-trendline-backtest", serializeState, hydrateState);

  // ── Derived ticker list ──
  const tickerList = useMemo<TickerMeta[]>(() => {
    if (scopeMode === "single") {
      const ticker = (singleTicker || "").toUpperCase().trim();
      return ticker
        ? [allTickers.find((t) => t.ticker === ticker) || { ticker, name: ticker }]
        : [];
    }
    if (scopeMode === "pair") {
      const a = (pairTickerA || "").toUpperCase().trim();
      const b = (pairTickerB || "").toUpperCase().trim();
      if (!a || !b || a === b) return [];
      const label = `${a}/${b}`;
      return [{ ticker: label, name: label, pairA: a, pairB: b }];
    }
    if (scopeMode === "pairCombo") {
      return (pairCombo.pairs as any[]).map((p: any) => ({
        ticker: p.label,
        name: p.label,
        pairA: p.a,
        pairB: p.b,
      }));
    }
    if (scopeMode === "basket") {
      return basketTickers
        .map((t) => t.toUpperCase().trim())
        .filter(Boolean)
        .map((t) => allTickers.find((u) => u.ticker === t) || { ticker: t, name: t });
    }
    if (universeTickers && universeTickers.size > 0) {
      return allTickers.filter((t) => universeTickers.has(t.ticker));
    }
    return allTickers;
  }, [scopeMode, singleTicker, pairTickerA, pairTickerB, pairCombo.pairs, basketTickers, universeTickers, allTickers]);

  const nValues = useMemo(
    () => (sweepMode ? parseNList(nList) : [n]),
    [sweepMode, nList, n]
  );

  // ── Cross-kind toggle ──
  const toggleKind = (kind: CrossKind) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  // ── Run scan ──
  const handleRunScan = useCallback(async () => {
    if (running) return;
    cancelRef.current = false;
    setRunning(true);
    setRows([]);
    setSkipped([]);
    setProgress({ current: 0, total: tickerList.length });
    setLastRunTimeframe(timeframe);

    const resultRows: BacktestRow[] = [];
    const resultSkipped: SkippedEntry[] = [];
    const isPair = scopeMode === "pair" || scopeMode === "pairCombo";

    let globalDates: string[] = [];
    if (isPair) {
      try {
        globalDates = await fetchGlobalDates();
      } catch {
        globalDates = [];
      }
    }

    const BATCH = 6;
    for (let i = 0; i < tickerList.length && !cancelRef.current; i += BATCH) {
      const batch = tickerList.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (row) => {
          if (cancelRef.current) return;
          try {
            let dates: string[];
            let closes: number[];
            let highs: number[];
            let lows: number[];

            if (row.pairA && row.pairB) {
              const pairData = await getYahooPairsRatio(row.pairA, row.pairB, globalDates);
              if (!pairData || !pairData.prices || pairData.prices.length < minBars) {
                resultSkipped.push({
                  ticker: row.ticker,
                  reason: pairData
                    ? `only ${pairData.prices.length} pair bars`
                    : "no pair data",
                });
                return;
              }
              dates = pairData.indices.map((idx: number) => globalDates[idx] || "");
              closes = pairData.prices.slice();
              highs = closes.slice();
              lows = closes.slice();
            } else if (scopeMode === "single" && inputSelection.kind === "workbook") {
              const wbData = await fetchWorkbookSeriesForTicker(row.ticker, inputSelection);
              if (!wbData || wbData.closes.length < minBars) {
                resultSkipped.push({
                  ticker: row.ticker,
                  reason: wbData
                    ? `only ${wbData.closes.length} bars (need ${minBars}) for ${inputSelection.metric}`
                    : `no workbook data for ${inputSelection.metric}`,
                });
                return;
              }
              dates = wbData.priceDates;
              closes = wbData.closes;
              highs = wbData.highs;
              lows = wbData.lows;
            } else {
              const ohlcv = await fetchTickerOHLCV(row.ticker);
              if (!ohlcv || !ohlcv.closes || ohlcv.closes.length < minBars) {
                resultSkipped.push({
                  ticker: row.ticker,
                  reason: `only ${ohlcv?.closes?.length ?? 0} bars`,
                });
                return;
              }
              dates = ohlcv.dates;
              closes = ohlcv.closes;
              highs = ohlcv.highs;
              lows = ohlcv.lows;
            }

            const downsampled = weeklyDownsample(
              { dates, closes, adjCloses: closes, highs, lows },
              timeframe
            );
            const dsCloses = downsampled.closes;
            const dsDates = downsampled.dates;
            const dsHighs = downsampled.highs;
            const dsLows = downsampled.lows;
            const dailyIndexMap = downsampled.dailyIndexMap;
            const minBarsEffective =
              timeframe === "weekly" ? Math.max(30, Math.floor(minBars / 5)) : minBars;

            if (dsCloses.length < minBarsEffective) {
              resultSkipped.push({
                ticker: row.ticker,
                reason: `only ${dsCloses.length} ${timeframe} bars`,
              });
              return;
            }

            const candles = (dsCloses as any[]).map((c: any, idx: number) => ({
              high: dsHighs[idx] ?? c,
              low: dsLows[idx] ?? c,
              close: c,
            }));

            for (const nVal of nValues) {
              if (cancelRef.current) return;
              const result = computeAutoTrendlines(candles, nVal);
              const kindBuckets = new Map<CrossKind, any[]>();
              for (const kind of ALL_CROSS_KINDS) kindBuckets.set(kind, []);
              for (const cross of result.crosses) {
                if (enabledKinds.has(cross.kind)) {
                  kindBuckets.get(cross.kind)!.push(cross);
                }
              }

              for (const kind of ALL_CROSS_KINDS) {
                const crossList = kindBuckets.get(kind)!;
                if (crossList.length < minSignals) continue;
                const direction = TRENDLINE_DIRECTION_MAP[kind];
                const hitRates: Record<string, number> = {};
                const avgReturns: Record<string, number> = {};
                const medReturns: Record<string, number> = {};

                for (const horizon of HORIZONS) {
                  const returns: number[] = [];
                  let hits = 0;
                  for (const cross of crossList) {
                    const dailyIdx = dailyIndexMap[cross.barIdx];
                    if (dailyIdx == null || dailyIdx < 0) continue;
                    const futureIdx = dailyIdx + horizon.days;
                    if (futureIdx >= closes.length) continue;
                    const entryPrice = closes[dailyIdx];
                    if (!Number.isFinite(entryPrice) || entryPrice <= 0) continue;
                    const exitPrice = closes[futureIdx];
                    if (!Number.isFinite(exitPrice)) continue;
                    const ret = (exitPrice - entryPrice) / entryPrice;
                    returns.push(ret);
                    if (
                      (direction === "long" && ret > 0) ||
                      (direction === "short" && ret < 0)
                    ) hits++;
                  }
                  hitRates[horizon.label] =
                    returns.length > 0 ? hits / returns.length : NaN;
                  avgReturns[horizon.label] =
                    returns.length > 0
                      ? returns.reduce((acc, r) => acc + r, 0) / returns.length
                      : NaN;
                  medReturns[horizon.label] =
                    returns.length > 0 ? median(returns) : NaN;
                }

                const lastBarIdx = crossList[crossList.length - 1].barIdx;
                const lastSignalDate = dsDates[lastBarIdx] ?? "";
                const barsSinceLast = dsCloses.length - 1 - lastBarIdx;

                resultRows.push({
                  ticker: row.ticker,
                  name: row.name ?? row.ticker,
                  n: nVal,
                  kind,
                  direction: direction as "long" | "short",
                  count: crossList.length,
                  hitRate: hitRates,
                  avgReturn: avgReturns,
                  medReturn: medReturns,
                  lastSignalBarIdx: lastBarIdx,
                  lastSignalDate,
                  barsSinceLast,
                  pairA: row.pairA,
                  pairB: row.pairB,
                });
              }
            }
          } catch (err: any) {
            resultSkipped.push({
              ticker: row.ticker,
              reason: err?.message ?? "error",
            });
          }
        })
      );
      setProgress({ current: Math.min(i + BATCH, tickerList.length), total: tickerList.length });
      await new Promise((res) => setTimeout(res, 0));
    }

    setRows(resultRows);
    setSkipped(resultSkipped);
    setRunning(false);
    setLastRunAt(Date.now());
  }, [running, tickerList, nValues, minSignals, minBars, enabledKinds, timeframe, scopeMode, inputSelection]);

  const handleStop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  // ── Navigate to charts ──
  const handleRowToCharts = useCallback(
    async (row: BacktestRow) => {
      if (row.pairA && row.pairB) {
        navigateToPairs(row.pairA.toUpperCase(), row.pairB.toUpperCase());
        return;
      }
      try {
        const metric =
          scopeMode === "single" && inputSelection.kind === "workbook" && inputSelection.metric
            ? inputSelection.metric
            : "close";
        const result = await sendAutoTrendlineToCharts({
          ticker: row.ticker,
          n: row.n,
          timeframe: lastRunTimeframe,
          futureBars: 60,
          metric,
        });
        if (!result.success) {
          console.warn(`[AutoTrendlineBacktest] ${row.ticker}: ${result.message}`);
        }
      } catch (err) {
        console.error("[AutoTrendlineBacktest] sendRowToCharts failed", err);
      }
      navigateToTicker(row.ticker);
    },
    [lastRunTimeframe, scopeMode, inputSelection]
  );

  // ── Filtered & sorted rows ──
  const displayRows = useMemo(() => {
    let filtered = (rows as BacktestRow[]).filter((r: BacktestRow) => enabledKinds.has(r.kind));
    if (liveOnly) {
      filtered = filtered.filter((r: BacktestRow) => r.barsSinceLast <= liveMaxBars);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.slice().sort((a: BacktestRow, b: BacktestRow) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "hitRate":
          av = a.hitRate[primaryHorizon] ?? -Infinity;
          bv = b.hitRate[primaryHorizon] ?? -Infinity;
          break;
        case "avgReturn":
          av = a.avgReturn[primaryHorizon] ?? -Infinity;
          bv = b.avgReturn[primaryHorizon] ?? -Infinity;
          break;
        case "count":
          av = a.count; bv = b.count; break;
        case "n":
          av = a.n; bv = b.n; break;
        case "barsSinceLast":
          av = a.barsSinceLast; bv = b.barsSinceLast; break;
        default:
          av = a.ticker; bv = b.ticker; break;
      }
      return typeof av === "string" && typeof bv === "string"
        ? dir * av.localeCompare(bv)
        : dir * (av - bv);
    });
  }, [rows, enabledKinds, liveOnly, liveMaxBars, sortKey, sortDir, primaryHorizon]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // ── CSV export ──
  const handleExportCsv = useCallback(() => {
    if (displayRows.length === 0) return;
    const horizonLabels = HORIZONS.map((h) => h.label);
    const lines = [
      [
        "ticker",
        "name",
        "n",
        "timeframe",
        "kind",
        "direction",
        "signals",
        "last_signal_date",
        "bars_since_last",
        ...horizonLabels.flatMap((h) => [`hit_${h}`, `avg_${h}`, `med_${h}`]),
      ].join(","),
    ];
    for (const row of displayRows) {
      const cells = [
        row.ticker,
        JSON.stringify(row.name),
        String(row.n),
        lastRunTimeframe,
        row.kind,
        row.direction,
        String(row.count),
        row.lastSignalDate,
        String(row.barsSinceLast),
        ...horizonLabels.flatMap((h) => [
          Number.isFinite(row.hitRate[h]) ? row.hitRate[h].toFixed(4) : "",
          Number.isFinite(row.avgReturn[h]) ? row.avgReturn[h].toFixed(6) : "",
          Number.isFinite(row.medReturn[h]) ? row.medReturn[h].toFixed(6) : "",
        ]),
      ];
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = sweepMode ? "sweep" : `n${n}`;
    a.download = `auto-trendline-backtest-${suffix}-${lastRunTimeframe}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayRows, n, sweepMode, lastRunTimeframe]);

  const sortIndicator = (key: string) =>
    sortKey !== key ? "" : sortDir === "asc" ? " ↑" : " ↓";

  const scopeLabel =
    scopeMode === "single"
      ? `Single (${tickerList.length})`
      : scopeMode === "pair"
      ? `Pair ${pairTickerA || "?"}/${pairTickerB || "?"}`
      : scopeMode === "pairCombo"
      ? `Pair combo (${tickerList.length})`
      : scopeMode === "basket"
      ? `Basket (${tickerList.length})`
      : `Universe ${filteredCount} / ${totalCount}`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-foreground">Auto Trendline Backtest</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Port of DojiEmoji's{" "}
              <span className="font-mono">Auto Trendline</span> indicator. Detects pivot fractals
              (period <span className="font-mono">n</span>), draws trendlines through the most
              recent two up/down pivots, and backtests close-vs-line crosses. Hit = direction
              matches forward-return sign. Horizons are always in{" "}
              <span className="font-mono">daily trading bars</span> for cross-timeframe
              comparability.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {running ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleStop}
                data-testid="atl-stop"
              >
                <SquareIcon className="w-3 h-3 mr-1" /> Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleRunScan}
                disabled={tickerList.length === 0}
                data-testid="atl-run"
              >
                <PlayIcon className="w-3 h-3 mr-1" /> Run Scan ({tickerList.length} tickers
                {sweepMode ? ` × ${nValues.length} n` : ""})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
              disabled={displayRows.length === 0}
            >
              <Download className="w-3 h-3 mr-1" /> CSV
            </Button>
          </div>
        </div>

        {/* ── Control row ── */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 mt-3">
          {/* Scope */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              Scope
            </label>
            <div className="flex gap-1">
              {(["single", "pair", "pairCombo", "basket", "universe"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setScopeMode(mode)}
                  className={`text-[10px] px-2 py-0.5 rounded border ${
                    scopeMode === mode
                      ? "bg-cyan-600/30 border-cyan-500 text-cyan-200"
                      : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                  data-testid={`atl-scope-${mode}`}
                  title={
                    mode === "pairCombo"
                      ? "Generate all unordered A/B pair ratios from a classification-filter leg-set"
                      : undefined
                  }
                >
                  {mode === "single"
                    ? "Single"
                    : mode === "pair"
                    ? "Pair (A/B)"
                    : mode === "pairCombo"
                    ? "Pair combo"
                    : mode === "basket"
                    ? "Basket"
                    : "Universe"}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe */}
          <div className="flex flex-col gap-0.5">
            <label
              className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"
              title="Resample bars before running the detector. Forward returns still computed on daily."
            >
              Timeframe
            </label>
            <div className="flex gap-1">
              {(["daily", "weekly"] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`text-[10px] px-2 py-0.5 rounded border ${
                    timeframe === tf
                      ? "bg-cyan-600/30 border-cyan-500 text-cyan-200"
                      : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                  data-testid={`atl-tf-${tf}`}
                >
                  {tf === "daily" ? "Daily" : "Weekly"}
                </button>
              ))}
            </div>
          </div>

          {/* Sweep / n */}
          <div className="flex flex-col gap-0.5">
            <label
              className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
              title="Toggle to test multiple fractal periods in one run."
            >
              <input
                type="checkbox"
                id="atl-sweep"
                checked={sweepMode}
                onChange={(e) => setSweepMode(e.target.checked)}
                className="h-3 w-3"
              />
              <label htmlFor="atl-sweep" className="cursor-pointer">
                Sweep mode
              </label>
            </label>
            {sweepMode ? (
              <input
                type="text"
                value={nList}
                onChange={(e) => setNList(e.target.value)}
                placeholder="5,8,10,15,20"
                className="w-36 px-1 py-0.5 text-[10px] bg-background border border-border rounded font-mono"
                data-testid="atl-n-list"
                title="Comma-separated list of n values (each clamped to [2,50])."
              />
            ) : (
              <input
                type="number"
                min={2}
                max={50}
                value={n}
                onChange={(e) =>
                  setN(Math.max(2, Math.min(50, Number(e.target.value) || 10)))
                }
                className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded"
                data-testid="atl-n"
                title="Fractal period (DojiEmoji default 10)."
              />
            )}
          </div>

          {/* Min Signals */}
          <div className="flex flex-col gap-0.5">
            <label
              className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"
              title="Drop (ticker × n × cross-kind) buckets with fewer than this many signals."
            >
              Min Signals
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={minSignals}
              onChange={(e) => setMinSignals(Math.max(1, Number(e.target.value) || 5))}
              className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded"
            />
          </div>

          {/* Min Bars */}
          <div className="flex flex-col gap-0.5">
            <label
              className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"
              title="Skip tickers with fewer than this many DAILY bars. Weekly mode requires ~30 weekly bars at minimum regardless."
            >
              Min Bars
            </label>
            <input
              type="number"
              min={50}
              max={5000}
              value={minBars}
              onChange={(e) => setMinBars(Math.max(50, Number(e.target.value) || 252))}
              className="w-20 px-1 py-0.5 text-[10px] bg-background border border-border rounded"
            />
          </div>

          {/* Primary Horizon */}
          <div className="flex flex-col gap-0.5">
            <label
              className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider"
              title="Primary horizon used to sort and color-code hit rate / avg return."
            >
              Primary Horizon
            </label>
            <select
              value={primaryHorizon}
              onChange={(e) => setPrimaryHorizon(e.target.value)}
              className="w-20 px-1 py-0.5 text-[10px] bg-background border border-border rounded"
            >
              {HORIZONS.map((h) => (
                <option key={h.label} value={h.label}>
                  {h.label}
                </option>
              ))}
            </select>
          </div>

          {/* Live only */}
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              id="atl-live"
              checked={liveOnly}
              onChange={(e) => setLiveOnly(e.target.checked)}
              className="h-3 w-3"
            />
            <label
              htmlFor="atl-live"
              className="text-[10px] text-muted-foreground"
              title="Show only tickers whose most recent signal fired within Live Max bars of the latest bar."
            >
              Live only ≤
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={liveMaxBars}
              onChange={(e) => setLiveMaxBars(Math.max(1, Number(e.target.value) || 20))}
              className="w-14 px-1 py-0.5 text-[10px] bg-background border border-border rounded"
              disabled={!liveOnly}
            />
            <span className="text-[10px] text-muted-foreground">bars</span>
          </div>

          {/* Cross kinds */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              Cross Kinds
            </label>
            <div className="flex gap-1 flex-wrap">
              {ALL_CROSS_KINDS.map((kind) => {
                const direction = TRENDLINE_DIRECTION_MAP[kind];
                const active = enabledKinds.has(kind);
                return (
                  <button
                    key={kind}
                    onClick={() => toggleKind(kind)}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                      active
                        ? direction === "long"
                          ? "bg-emerald-600/30 border-emerald-500 text-emerald-200"
                          : "bg-red-600/30 border-red-500 text-red-200"
                        : "bg-background border-border text-muted-foreground"
                    }`}
                    title={`${CROSS_KIND_LABELS[kind]} — direction: ${direction.toUpperCase()}`}
                  >
                    {CROSS_KIND_LABELS[kind]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Scope-specific pickers ── */}
        {scopeMode === "single" && (
          <div className="mt-2 flex items-end gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                Ticker
              </label>
              <div className="w-56">
                <UnifiedTickerPicker
                  tickers={allTickers}
                  value={singleTicker}
                  onChange={setSingleTicker}
                />
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                Input Series
              </label>
              <InputSeriesSelector
                value={inputSelection}
                onChange={setInputSelection}
                family="auto_trendline"
                label=""
              />
            </div>
          </div>
        )}

        {scopeMode === "pair" && (
          <div className="mt-2 flex items-end gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                Leg A (numerator)
              </label>
              <div className="w-48">
                <UnifiedTickerPicker
                  tickers={allTickers}
                  value={pairTickerA}
                  onChange={setPairTickerA}
                />
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground pb-1">/</span>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                Leg B (denominator)
              </label>
              <div className="w-48">
                <UnifiedTickerPicker
                  tickers={allTickers}
                  value={pairTickerB}
                  onChange={setPairTickerB}
                />
              </div>
            </div>
            <span
              className="text-[10px] text-cyan-400 font-mono pb-1"
              data-testid="atl-pair-label"
            >
              Ratio: {pairTickerA || "?"}/{pairTickerB || "?"}
            </span>
          </div>
        )}

        {scopeMode === "pairCombo" && pairCombo.ui && (
          <div className="mt-2">{pairCombo.ui}</div>
        )}

        {scopeMode === "basket" && (
          <div className="mt-2">
            <BasketPicker
              tickers={allTickers}
              value={basketTickers}
              onChange={setBasketTickers}
              label="Basket constituents"
              testIdPrefix="atl-basket"
              maxTickers={200}
            />
          </div>
        )}

        {/* ── Status bar ── */}
        <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
          <div>
            Scope:{" "}
            <span className="text-foreground font-mono">{scopeLabel}</span>
            <span className="ml-3">
              Timeframe:{" "}
              <span className="text-foreground font-mono">{timeframe}</span>
            </span>
            {sweepMode && (
              <span className="ml-3">
                n list:{" "}
                <span className="text-foreground font-mono">[{nValues.join(", ")}]</span>
              </span>
            )}
            {lastRunAt && (
              <span className="ml-3">
                Last run: {new Date(lastRunAt).toLocaleTimeString()} ({lastRunTimeframe})
              </span>
            )}
            {skipped.length > 0 && (
              <span
                className="ml-3 text-amber-400"
                title={skipped
                  .slice(0, 20)
                  .map((s: SkippedEntry) => `${s.ticker}: ${s.reason}`)
                  .join("\n")}
              >
                Skipped {skipped.length}
              </span>
            )}
          </div>
          {running && (
            <div className="font-mono">
              {progress.current} / {progress.total}
            </div>
          )}
        </div>
      </div>

      {/* ── Results table ── */}
      <div className="flex-1 overflow-auto">
        {displayRows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {running
              ? `Scanning ${progress.current} / ${progress.total}…`
              : rows.length === 0
              ? scopeMode === "basket" && basketTickers.length === 0
                ? "Add tickers to the basket, then click Run Scan."
                : scopeMode === "pairCombo" && tickerList.length === 0
                ? "Pick at least two legs in the pair-combo filter, then click Run Scan."
                : scopeMode === "pair" && tickerList.length === 0
                ? "Enter both A and B tickers, then click Run Scan."
                : "Configure and click Run Scan."
              : "No rows match the current filters."}
          </div>
        ) : (
          <table className="w-full text-[11px] font-mono border-collapse">
            <thead className="bg-muted/30 sticky top-0 z-10">
              <tr className="border-b border-border">
                <th
                  className="text-left px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("ticker")}
                >
                  Ticker{sortIndicator("ticker")}
                </th>
                <th className="text-left px-2 py-1.5">Name</th>
                <th
                  className="text-right px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("n")}
                >
                  n{sortIndicator("n")}
                </th>
                <th className="text-left px-2 py-1.5">Cross Kind</th>
                <th className="text-center px-2 py-1.5">Dir</th>
                <th
                  className="text-right px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("count")}
                >
                  N{sortIndicator("count")}
                </th>
                <th
                  className="text-right px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("barsSinceLast")}
                  title="Bars since most recent signal (in the detection timeframe)."
                >
                  Bars Ago{sortIndicator("barsSinceLast")}
                </th>
                <th className="text-right px-2 py-1.5">Last Date</th>
                <th
                  className="text-right px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("hitRate")}
                  title={`Hit rate at ${primaryHorizon} — long hits when fwd ret > 0; short hits when fwd ret < 0.`}
                >
                  Hit {primaryHorizon}{sortIndicator("hitRate")}
                </th>
                <th
                  className="text-right px-2 py-1.5 cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort("avgReturn")}
                  title={`Mean forward return at ${primaryHorizon}.`}
                >
                  Avg Ret {primaryHorizon}{sortIndicator("avgReturn")}
                </th>
                {HORIZONS.map((h) => (
                  <th
                    key={h.label}
                    className="text-right px-2 py-1.5"
                    title={`Hit rate · avg return at ${h.label}`}
                  >
                    {h.label}
                  </th>
                ))}
                <th
                  className="text-center px-2 py-1.5"
                  title="Send auto-trendline overlay to Charts and open it."
                >
                  →
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row: BacktestRow, idx: number) => (
                <tr
                  key={`${row.ticker}-${row.n}-${row.kind}-${idx}`}
                  className="border-b border-border/30 hover:bg-muted/20"
                >
                  <td className="px-2 py-1">
                    <button
                      className="text-blue-400 hover:underline"
                      onClick={() => {
                        row.pairA && row.pairB
                          ? navigateToPairs(row.pairA.toUpperCase(), row.pairB.toUpperCase())
                          : navigateToTicker(row.ticker);
                      }}
                      title={
                        row.pairA && row.pairB
                          ? `Open ${row.pairA}/${row.pairB} ratio in Charts (Pairs preset)`
                          : "Open in Charts tab"
                      }
                    >
                      {row.ticker}
                    </button>
                  </td>
                  <td
                    className="px-2 py-1 text-muted-foreground truncate max-w-[180px]"
                    title={row.name}
                  >
                    {row.name}
                  </td>
                  <td className="px-2 py-1 text-right text-muted-foreground">{row.n}</td>
                  <td className="px-2 py-1">{CROSS_KIND_LABELS[row.kind]}</td>
                  <td
                    className={`px-2 py-1 text-center font-bold ${
                      row.direction === "long" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {row.direction === "long" ? "L" : "S"}
                  </td>
                  <td className="px-2 py-1 text-right">{row.count}</td>
                  <td className="px-2 py-1 text-right">{row.barsSinceLast}</td>
                  <td className="px-2 py-1 text-right text-muted-foreground">
                    {row.lastSignalDate}
                  </td>
                  <td className={`px-2 py-1 text-right ${hitRateClass(row.hitRate[primaryHorizon])}`}>
                    {formatHitRate(row.hitRate[primaryHorizon])}
                  </td>
                  <td className={`px-2 py-1 text-right ${returnClass(row.avgReturn[primaryHorizon])}`}>
                    {formatReturn(row.avgReturn[primaryHorizon])}
                  </td>
                  {HORIZONS.map((h) => (
                    <td
                      key={h.label}
                      className="px-2 py-1 text-right"
                      title={`hit ${formatHitRate(row.hitRate[h.label])} · avg ${formatReturn(row.avgReturn[h.label])} · med ${formatReturn(row.medReturn[h.label])}`}
                    >
                      <span className={hitRateClass(row.hitRate[h.label])}>
                        {formatHitRate(row.hitRate[h.label])}
                      </span>
                      <span className="text-muted-foreground/60"> · </span>
                      <span className={returnClass(row.avgReturn[h.label])}>
                        {formatReturn(row.avgReturn[h.label])}
                      </span>
                    </td>
                  ))}
                  <td className="px-2 py-1 text-center">
                    <button
                      className="p-0.5 rounded hover:bg-cyan-500/20 text-cyan-400"
                      title={
                        row.pairA && row.pairB
                          ? `Open ${row.pairA}/${row.pairB} ratio in Charts (overlay skipped — ratio is unitless)`
                          : `Send auto-trendline overlay (n=${row.n}, ${lastRunTimeframe}) to Charts and open ${row.ticker}`
                      }
                      onClick={() => handleRowToCharts(row)}
                      data-testid={`atl-row-overlay-${idx}`}
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
