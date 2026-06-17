// Reconstructed from recovered-bundle/LevelsAndTrendlines-D9no3NXd.js on 2026-06-11
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppContext } from "@/lib/appContext";
import { useBaskets } from "@/lib/baskets";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { getDateRangeFromPreset } from "@/lib/datePresets";
import { useWorkspaceState } from "@/lib/workspaceState";
import { fetchGlobalDates } from "@/lib/fetchGlobalDates";
import { fetchTickerOHLCV } from "@/lib/fetchTickerOHLCV";
import { sliceDateRange } from "@/lib/sliceDateRange";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { navigateToPairs } from "@/lib/navigateToPairs";
import { navigateToTicker } from "@/lib/navigateToTicker";
import { DATE_PRESETS } from "@/lib/datePresets";
import { computeMa } from "@/lib/computeMa";
import { D as computeSRLevels, d as detectSRLevels, S as SupportResistancePanel } from "@/components/SupportResistance";
import { d as detectTrendlines, D as TrendlinesPanel, T as TrendlinesSubPanel } from "@/components/Trendlines";
import { g as getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { C as ClassificationFiltersWithSource } from "@/components/ClassificationFiltersWithSource";
import { u as useGlobalUniverse } from "@/lib/globalUniverse";
import { filterTickersByClassification } from "@/lib/filterTickersByClassification";
import ClassificationFilters from "@/components/ClassificationFilters";

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_BARS = 100;

// ─── Types ───────────────────────────────────────────────────────────────────

interface TickerMeta {
  ticker: string;
  name?: string;
  pairA?: string;
  pairB?: string;
}

interface CrossResult {
  ticker: string;
  name: string;
  currentPrice: number;
  kind: "level" | "trendline";
  subtype: string;
  direction: "up" | "down";
  candlesAgo: number;
  crossDate: string;
  closeAtCross: number;
  levelValueAtCross: number;
  distancePct: number;
  score: number;
  level?: any;
  trendline?: any;
  pairA?: string;
  pairB?: string;
}

interface SkippedEntry {
  ticker: string;
  reason: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectCrossDirection(
  prevClose: number,
  currClose: number,
  prevLevel: number,
  currLevel: number
): "up" | "down" | null {
  if (![prevClose, currClose, prevLevel, currLevel].every(Number.isFinite)) return null;
  const deltaClose = prevClose - currClose;
  const deltaLevel = prevLevel - currLevel;
  if (deltaClose === 0 || deltaLevel === 0) return null;
  if (deltaClose < 0 && deltaLevel > 0) return "up";
  if (deltaClose > 0 && deltaLevel < 0) return "down";
  return null;
}

function getLevelSeries(
  level: any,
  data: { closes: number[]; highs: number[]; lows: number[] }
): (number | null)[] {
  const len = data.closes.length;
  if (level.type === "horizontal" || level.type === "fib") {
    return new Array(len).fill(level.price);
  }
  if (level.type === "ma" && level.maType && level.maPeriod) {
    return computeMa(data.closes, level.maPeriod, level.maType);
  }
  return new Array(len).fill(null);
}

function getTrendlineValue(trendline: any, barIdx: number): number {
  return trendline.slope * (barIdx - trendline.i1) + trendline.price1;
}

function getLevelLabel(level: any): string {
  if (level.type === "ma") return `MA: ${level.maType ?? "MA"}(${level.maPeriod ?? "?"})`;
  if (level.type === "fib") return `Fib ${((level.fibLevel ?? 0) * 100).toFixed(1)}%`;
  return "Horizontal";
}

// ─── Crossing Screener Component ─────────────────────────────────────────────

function CrossingScreener() {
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  const {
    universeTickers,
    filters,
    setFilters,
    search,
    setSearch,
    manualTickers,
    setManualTickers,
    filteredCount,
    totalCount,
  } = useAppContext();
  const { baskets, getBasket } = useBaskets();

  useEffect(() => {
    fetchWorkbookTickers()
      .then((tickers: any[]) => setAllTickers(tickers as TickerMeta[]))
      .catch(() => {});
  }, []);

  const [source, setSource] = useState("universe");
  const [basketId, setBasketId] = useState("");
  const [singleTicker, setSingleTicker] = useState("");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [pcFilters, setPcFilters] = useState(() => ({
    economy: new Set<string>(),
    sector: new Set<string>(),
    subsector: new Set<string>(),
    industryGroup: new Set<string>(),
    industry: new Set<string>(),
    subindustry: new Set<string>(),
  }));
  const [pcClassSearch, setPcClassSearch] = useState("");
  const [pcManualTickers, setPcManualTickers] = useState(() => new Set<string>());
  const [pcSource, setPcSource] = useState("workbook");
  const { metas: universeMetas } = useGlobalUniverse();

  const PC_MAX_PAIRS = 500;
  const PC_WARN_PAIRS = 50;

  const [datePreset, setDatePreset] = useState("3y");
  const [dateRange, setDateRange] = useState(() => getDateRangeFromPreset("3y"));
  const [timeframe, setTimeframe] = useState("daily");
  const [scanHorizontal, setScanHorizontal] = useState(true);
  const [scanMA, setScanMA] = useState(true);
  const [scanFib, setScanFib] = useState(true);
  const [scanTrendlines, setScanTrendlines] = useState(true);
  const anyLevelScan = scanHorizontal || scanMA || scanFib;
  const [lookback, setLookback] = useState(1);
  const [minScore, setMinScore] = useState(0);
  const [topN, setTopN] = useState(10);

  const srConfig = useMemo(
    () => ({
      ...computeSRLevels,
      enableHorizontal: scanHorizontal,
      enableMA: scanMA,
      enableFib: scanFib,
    }),
    [scanHorizontal, scanMA, scanFib]
  );
  const trendlineConfig = TrendlinesPanel;

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<CrossResult[]>([]);
  const [skipped, setSkipped] = useState<SkippedEntry[]>([]);
  const cancelRef = useRef(false);

  // ── pairCombo leg computation ──
  const pcLegs = useMemo(() => {
    if (source !== "pairCombo") return [];
    const hasFilters =
      pcFilters.economy.size +
        pcFilters.sector.size +
        pcFilters.subsector.size +
        pcFilters.industryGroup.size +
        pcFilters.industry.size +
        pcFilters.subindustry.size +
        pcManualTickers.size +
        (pcClassSearch.trim().length > 0 ? 1 : 0) ===
      0;
    if (hasFilters) return [];
    const source_ = pcSource === "global" ? universeMetas : allTickers;
    return filterTickersByClassification(source_, pcFilters, pcClassSearch, pcManualTickers)
      .map((t: any) => t.ticker.toUpperCase())
      .filter((t: string, idx: number, arr: string[]) => arr.indexOf(t) === idx);
  }, [source, allTickers, universeMetas, pcSource, pcFilters, pcClassSearch, pcManualTickers]);

  const pcPairCount = useMemo(() => {
    const n = pcLegs.length;
    return n >= 2 ? (n * (n - 1)) / 2 : 0;
  }, [pcLegs]);

  // ── Ticker list ──
  const tickerList = useMemo<TickerMeta[]>(() => {
    if (source === "single") {
      const t = (singleTicker || "").toUpperCase().trim();
      return t
        ? [allTickers.find((x) => x.ticker.toUpperCase() === t) || { ticker: t, name: t }]
        : [];
    }
    if (source === "pair") {
      const a = (pairTickerA || "").toUpperCase().trim();
      const b = (pairTickerB || "").toUpperCase().trim();
      if (!a || !b || a === b) return [];
      const label = `${a}/${b}`;
      return [{ ticker: label, name: label, pairA: a, pairB: b }];
    }
    if (source === "pairCombo") {
      const pairs: TickerMeta[] = [];
      const legs = pcLegs;
      for (let i = 0; i < legs.length; i++) {
        for (let j = i + 1; j < legs.length; j++) {
          const a = legs[i];
          const b = legs[j];
          const label = `${a}/${b}`;
          pairs.push({ ticker: label, name: label, pairA: a, pairB: b });
          if (pairs.length >= PC_MAX_PAIRS) break;
        }
        if (pairs.length >= PC_MAX_PAIRS) break;
      }
      return pairs;
    }
    if (source === "basket") {
      if (!basketId) return [];
      const basket = getBasket(basketId);
      if (!basket) return [];
      const basketSet = new Set(basket.tickers.map((t: string) => t.toUpperCase()));
      const matched = allTickers.filter((t) => basketSet.has(t.ticker.toUpperCase()));
      const matchedSet = new Set(matched.map((t) => t.ticker.toUpperCase()));
      const extras: TickerMeta[] = [];
      for (const t of basket.tickers) {
        if (!matchedSet.has(t.toUpperCase())) {
          extras.push({ ticker: t.toUpperCase(), name: t.toUpperCase() });
        }
      }
      return [...matched, ...extras];
    }
    return universeTickers ? allTickers.filter((t) => universeTickers.has(t.ticker)) : allTickers;
  }, [source, basketId, singleTicker, pairTickerA, pairTickerB, pcLegs, getBasket, universeTickers, allTickers]);

  // ── Workspace state ──
  const serializeState = useCallback(
    () => ({
      source,
      basketId,
      singleTicker,
      pairTickerA,
      pairTickerB,
      pcFiltersSer: {
        economy: Array.from(pcFilters.economy),
        sector: Array.from(pcFilters.sector),
        subsector: Array.from(pcFilters.subsector),
        industryGroup: Array.from(pcFilters.industryGroup),
        industry: Array.from(pcFilters.industry),
        subindustry: Array.from(pcFilters.subindustry),
      },
      pcClassSearch,
      pcManualTickersSer: Array.from(pcManualTickers),
      datePreset,
      dateRange,
      timeframe,
      scanHorizontal,
      scanMA,
      scanFib,
      scanTrendlines,
      lookback,
      minScore,
      topN,
      rows: results,
      skipped,
    }),
    [source, basketId, singleTicker, pairTickerA, pairTickerB, pcFilters, pcClassSearch, pcManualTickers, datePreset, dateRange, timeframe, scanHorizontal, scanMA, scanFib, scanTrendlines, lookback, minScore, topN, results, skipped]
  );

  const hydrateState = useCallback((state: any) => {
    if (!state || typeof state !== "object") return;
    if (typeof state.source === "string") setSource(state.source);
    if (typeof state.basketId === "string") setBasketId(state.basketId);
    if (typeof state.singleTicker === "string") setSingleTicker(state.singleTicker);
    if (typeof state.pairTickerA === "string") setPairTickerA(state.pairTickerA);
    if (typeof state.pairTickerB === "string") setPairTickerB(state.pairTickerB);
    if (state.pcFiltersSer && typeof state.pcFiltersSer === "object") {
      const f = state.pcFiltersSer;
      setPcFilters({
        economy: new Set(Array.isArray(f.economy) ? f.economy : []),
        sector: new Set(Array.isArray(f.sector) ? f.sector : []),
        subsector: new Set(Array.isArray(f.subsector) ? f.subsector : []),
        industryGroup: new Set(Array.isArray(f.industryGroup) ? f.industryGroup : []),
        industry: new Set(Array.isArray(f.industry) ? f.industry : []),
        subindustry: new Set(Array.isArray(f.subindustry) ? f.subindustry : []),
      });
    }
    if (typeof state.pcClassSearch === "string") setPcClassSearch(state.pcClassSearch);
    if (Array.isArray(state.pcManualTickersSer)) setPcManualTickers(new Set(state.pcManualTickersSer));
    if (typeof state.datePreset === "string") setDatePreset(state.datePreset);
    if (state.dateRange) setDateRange(state.dateRange);
    if (state.timeframe) setTimeframe(state.timeframe);
    if (typeof state.scanHorizontal === "boolean") setScanHorizontal(state.scanHorizontal);
    if (typeof state.scanMA === "boolean") setScanMA(state.scanMA);
    if (typeof state.scanFib === "boolean") setScanFib(state.scanFib);
    if (typeof state.scanTrendlines === "boolean") setScanTrendlines(state.scanTrendlines);
    if (typeof state.lookback === "number") setLookback(state.lookback);
    if (typeof state.minScore === "number") setMinScore(state.minScore);
    if (typeof state.topN === "number") setTopN(state.topN);
    if (Array.isArray(state.rows)) setResults(state.rows);
    if (Array.isArray(state.skipped)) setSkipped(state.skipped);
  }, []);

  useWorkspaceState("crossing-screener", serializeState, hydrateState);

  // ── Run scan ──
  const handleRunScan = useCallback(async () => {
    if ((!anyLevelScan && !scanTrendlines) || tickerList.length === 0 || lookback < 1 || !Number.isFinite(lookback)) return;
    cancelRef.current = false;
    setRunning(true);
    setResults([]);
    setSkipped([]);
    setProgress({ current: 0, total: tickerList.length });

    const resultRows: CrossResult[] = [];
    const resultSkipped: SkippedEntry[] = [];

    let globalDates: string[] = [];
    if (source === "pair" || source === "pairCombo") {
      try {
        globalDates = await fetchGlobalDates();
      } catch {}
    }

    for (let i = 0; i < tickerList.length && !cancelRef.current; i++) {
      const item = tickerList[i];
      try {
        let dates: string[];
        let closes: number[];
        let adjCloses: number[];
        let highs: number[];
        let lows: number[];
        let barCount: number;

        if (source === "pair" || source === "pairCombo") {
          const pA = (item.pairA || "").toUpperCase().trim();
          const pB = (item.pairB || "").toUpperCase().trim();
          if (!pA || !pB) {
            resultSkipped.push({ ticker: item.ticker, reason: "missing pair legs" });
            setProgress({ current: i + 1, total: tickerList.length });
            continue;
          }
          const pairData = await getYahooPairsRatio(pA, pB, globalDates);
          if (!pairData || pairData.prices.length < MIN_BARS) {
            resultSkipped.push({
              ticker: item.ticker,
              reason: pairData
                ? `only ${pairData.prices.length} bars (need ${MIN_BARS})`
                : "no pair data",
            });
            setProgress({ current: i + 1, total: tickerList.length });
            continue;
          }
          const pairDates = pairData.indices.map((idx: number) => globalDates[idx] || "");
          const pairPrices = pairData.prices;
          const { start: rangeStart, end: rangeEnd } = dateRange;
          const rangeIndices: number[] = [];
          for (let v = 0; v < pairDates.length; v++) {
            const d = pairDates[v];
            if (d && !(rangeStart && d < rangeStart) && !(rangeEnd && d > rangeEnd)) {
              rangeIndices.push(v);
            }
          }
          if (rangeIndices.length < MIN_BARS) {
            resultSkipped.push({
              ticker: item.ticker,
              reason: `only ${rangeIndices.length} bars in range (need ${MIN_BARS})`,
            });
            setProgress({ current: i + 1, total: tickerList.length });
            continue;
          }
          dates = rangeIndices.map((v) => pairDates[v]);
          closes = rangeIndices.map((v) => pairPrices[v]);
          adjCloses = closes.slice();
          highs = closes.slice();
          lows = closes.slice();
          barCount = closes.length;
        } else {
          const ohlcv = await fetchTickerOHLCV(item.ticker);
          if (!ohlcv) {
            resultSkipped.push({ ticker: item.ticker, reason: "no data" });
            setProgress({ current: i + 1, total: tickerList.length });
            continue;
          }
          const sliced = sliceDateRange(ohlcv, dateRange);
          barCount = sliced.adjCloses.length;
          if (barCount < MIN_BARS) {
            resultSkipped.push({
              ticker: item.ticker,
              reason: `only ${barCount} bars (need ${MIN_BARS})`,
            });
            setProgress({ current: i + 1, total: tickerList.length });
            continue;
          }
          closes = sliced.adjCloses;
          highs = sliced.highs.map((h: number, idx: number) => {
            const c = sliced.closes[idx];
            const ac = sliced.adjCloses[idx];
            return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? h * (ac / c) : h;
          });
          lows = sliced.lows.map((l: number, idx: number) => {
            const c = sliced.closes[idx];
            const ac = sliced.adjCloses[idx];
            return c && c > 0 && Number.isFinite(c) && Number.isFinite(ac) ? l * (ac / c) : l;
          });
          adjCloses = closes;
          dates = sliced.dates.slice(0, barCount);
        }

        if (timeframe === "weekly") {
          const weekly = weeklyDownsample(
            { dates, closes, adjCloses, highs, lows },
            "weekly"
          );
          if (weekly.closes.length < 30) {
            resultSkipped.push({
              ticker: item.ticker,
              reason: `only ${weekly.closes.length} weekly bars (need 30)`,
            });
            setProgress({ current: i + 1, total: tickerList.length });
            continue;
          }
          dates = weekly.dates;
          closes = weekly.closes;
          highs = weekly.highs;
          lows = weekly.lows;
          barCount = closes.length;
        }

        const currentPrice = closes[barCount - 1];
        const effectiveLookback = Math.min(Math.max(1, Math.floor(lookback)), barCount - 1);

        // Level crosses
        if (anyLevelScan) {
          const levels = detectSRLevels({ dates, closes, highs, lows }, srConfig).slice(0, topN);
          for (const level of levels) {
            if (level.compositeScore < minScore) continue;
            const series = getLevelSeries(level, { closes, highs, lows });
            const currentVal = series[barCount - 1];
            if (currentVal == null || !Number.isFinite(currentVal)) continue;
            for (let lb = 0; lb < effectiveLookback; lb++) {
              const idxCurr = barCount - 1 - lb;
              const idxPrev = idxCurr - 1;
              if (idxPrev < 0) break;
              const vc = series[idxCurr];
              const vp = series[idxPrev];
              if (vc == null || vp == null) continue;
              const dir = detectCrossDirection(closes[idxPrev], closes[idxCurr], vp, vc);
              if (dir) {
                resultRows.push({
                  ticker: item.ticker,
                  name: item.name || item.ticker,
                  currentPrice,
                  kind: "level",
                  subtype: getLevelLabel(level),
                  direction: dir,
                  candlesAgo: lb + 1,
                  crossDate: dates[idxCurr],
                  closeAtCross: closes[idxCurr],
                  levelValueAtCross: vc,
                  distancePct: (currentPrice - currentVal) / currentVal,
                  score: level.compositeScore,
                  level,
                  pairA: item.pairA,
                  pairB: item.pairB,
                });
                break;
              }
            }
          }
        }

        // Trendline crosses
        if (scanTrendlines) {
          const trendlines = detectTrendlines({ dates, closes, highs, lows }, trendlineConfig).slice(0, topN);
          for (const tl of trendlines) {
            if (tl.compositeScore < minScore) continue;
            const currentTlVal = getTrendlineValue(tl, barCount - 1);
            if (!Number.isFinite(currentTlVal)) continue;
            for (let lb = 0; lb < effectiveLookback; lb++) {
              const idxCurr = barCount - 1 - lb;
              const idxPrev = idxCurr - 1;
              if (idxPrev < 0) break;
              const vc = getTrendlineValue(tl, idxCurr);
              const vp = getTrendlineValue(tl, idxPrev);
              const dir = detectCrossDirection(closes[idxPrev], closes[idxCurr], vp, vc);
              if (dir) {
                resultRows.push({
                  ticker: item.ticker,
                  name: item.name || item.ticker,
                  currentPrice,
                  kind: "trendline",
                  subtype: `Trendline (${tl.kind})`,
                  direction: dir,
                  candlesAgo: lb + 1,
                  crossDate: dates[idxCurr],
                  closeAtCross: closes[idxCurr],
                  levelValueAtCross: vc,
                  distancePct: (currentPrice - currentTlVal) / currentTlVal,
                  score: tl.compositeScore,
                  trendline: tl,
                  pairA: item.pairA,
                  pairB: item.pairB,
                });
                break;
              }
            }
          }
        }
      } catch (err: any) {
        resultSkipped.push({ ticker: item.ticker, reason: err?.message || "error" });
      }
      setProgress({ current: i + 1, total: tickerList.length });
      if (i % 5 === 4) await new Promise((res) => setTimeout(res, 0));
    }

    resultRows.sort((a, b) =>
      a.candlesAgo !== b.candlesAgo ? a.candlesAgo - b.candlesAgo : b.score - a.score
    );
    setResults(resultRows);
    setSkipped(resultSkipped);
    setRunning(false);
  }, [anyLevelScan, scanTrendlines, tickerList, lookback, dateRange, timeframe, srConfig, trendlineConfig, topN, minScore, source]);

  const handleStop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  // ── Send to Charts ──
  const handleSendToCharts = useCallback((row: CrossResult) => {
    try {
      const isPair = !!(row.pairA && row.pairB);
      const ticker = isPair && row.pairA ? row.pairA.toUpperCase() : row.ticker.toUpperCase();

      if (row.kind === "level" && row.level) {
        const seedsKey = "reit-viz-srlevel-seeds-v1";
        const persistKey = "reit-viz-srlevel-persistent-v1";
        const lvl = row.level;
        const entry = [{
          type: lvl.type,
          price: lvl.price,
          maType: lvl.maType ?? null,
          maPeriod: lvl.maPeriod ?? null,
          fibLevel: lvl.fibLevel ?? null,
          touchCount: lvl.touchCount,
          bounceReverseRate: lvl.bounceReverseRate,
          holdRate: lvl.holdRate,
          compositeScore: lvl.compositeScore,
          futureBars: 30,
          createdAt: Date.now(),
        }];
        for (const key of [seedsKey, persistKey]) {
          const raw = localStorage.getItem(key);
          let store: Record<string, any[]> = {};
          try { store = raw ? JSON.parse(raw) : {}; } catch { store = {}; }
          const existing = Array.isArray(store[ticker]) ? store[ticker] : [];
          existing.push(...entry);
          store[ticker] = existing;
          localStorage.setItem(key, JSON.stringify(store));
        }
      } else if (row.kind === "trendline" && row.trendline) {
        const seedsKey = "reit-viz-trendline-seeds-v1";
        const persistKey = "reit-viz-trendline-persistent-v1";
        const tl = row.trendline;
        const entry = [{
          kind: tl.kind,
          date1: tl.date1,
          price1: tl.price1,
          date2: tl.date2,
          price2: tl.price2,
          slope: tl.slope,
          slopePctPerYear: tl.slopePctPerYear,
          broken: !!tl.broken,
          compositeScore: tl.compositeScore,
          futureBars: 30,
          createdAt: Date.now(),
        }];
        for (const key of [seedsKey, persistKey]) {
          const raw = localStorage.getItem(key);
          let store: Record<string, any[]> = {};
          try { store = raw ? JSON.parse(raw) : {}; } catch { store = {}; }
          const existing = Array.isArray(store[ticker]) ? store[ticker] : [];
          existing.push(...entry);
          store[ticker] = existing;
          localStorage.setItem(key, JSON.stringify(store));
        }
      }

      const toast = document.createElement("div");
      toast.textContent = `Sent ${row.subtype} for ${ticker} → Charts tab`;
      toast.className =
        "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-cyan-500/20 text-cyan-300 text-xs font-mono border border-cyan-500/40 shadow-lg";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);

      if (isPair && row.pairA && row.pairB) {
        navigateToPairs(row.pairA.toUpperCase(), row.pairB.toUpperCase());
      } else {
        navigateToTicker(ticker);
      }
    } catch (err) {
      console.error("[CrossingScreener] Send failed", err);
    }
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 text-xs font-mono space-y-3">
        {/* Title */}
        <div>
          <h1 className="text-base font-bold">Crossing Screener</h1>
          <p className="text-[10px] text-muted-foreground">
            Scans a ticker set for recent sign-flip crosses of detected S/R levels and/or diagonal
            trendlines. A cross counts when the close moves from one side of the level/line to the
            other between consecutive candles.
          </p>
        </div>

        {/* Source picker */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Source</span>
          {["single", "pair", "pairCombo", "basket", "universe"].map((mode) => (
            <button
              key={mode}
              data-testid={`cs-source-${mode}`}
              onClick={() => setSource(mode)}
              className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                source === mode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:text-foreground"
              }`}
              title={
                mode === "pairCombo"
                  ? "Generate all unordered A/B pair ratios from a classification-filter selection (A/B and B/A treated as same)"
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

          {source === "single" && (
            <input
              type="text"
              value={singleTicker}
              onChange={(e) => setSingleTicker(e.target.value.toUpperCase())}
              placeholder="Ticker (e.g. O)"
              className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 font-mono w-32"
              data-testid="cs-single-ticker"
            />
          )}

          {source === "pair" && (
            <>
              <input
                type="text"
                value={pairTickerA}
                onChange={(e) => setPairTickerA(e.target.value.toUpperCase())}
                placeholder="A"
                className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 font-mono w-24"
                data-testid="cs-pair-a"
              />
              <span className="text-[11px] text-muted-foreground">/</span>
              <input
                type="text"
                value={pairTickerB}
                onChange={(e) => setPairTickerB(e.target.value.toUpperCase())}
                placeholder="B"
                className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 font-mono w-24"
                data-testid="cs-pair-b"
              />
            </>
          )}

          {source === "basket" && (
            <select
              value={basketId}
              onChange={(e) => setBasketId(e.target.value)}
              className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5"
              data-testid="cs-basket-select"
            >
              <option value="">Pick basket…</option>
              {baskets.map((basket: any) => (
                <option key={basket.id} value={basket.id}>
                  {basket.name} ({basket.tickers.length})
                </option>
              ))}
            </select>
          )}

          <span className="ml-2 text-[10px] text-muted-foreground">
            {source === "pairCombo"
              ? `${pcLegs.length} leg${pcLegs.length === 1 ? "" : "s"} → ${tickerList.length} pair${tickerList.length === 1 ? "" : "s"} queued${pcPairCount > tickerList.length ? ` (capped from ${pcPairCount})` : ""}`
              : `${tickerList.length} ticker${tickerList.length === 1 ? "" : "s"} queued`}
          </span>
          {source === "pairCombo" && tickerList.length >= PC_WARN_PAIRS && (
            <span
              className="text-[10px] font-bold text-amber-400"
              title="Heads up: many pairs queued. Each pair fetches two Yahoo series and runs full S/R + trendline detection. Larger scans take longer."
            >
              ⚠ {tickerList.length} pairs — this may take a while
            </span>
          )}
        </div>

        {/* Universe filter */}
        {source === "universe" && (
          <ClassificationFilters
            filters={filters}
            onFiltersChange={setFilters}
            search={search}
            onSearchChange={setSearch}
            manualTickers={manualTickers}
            onManualTickersChange={setManualTickers}
            filteredCount={filteredCount}
            totalCount={totalCount}
            testIdPrefix="cs-universe-filter"
          />
        )}

        {/* PairCombo filter */}
        {source === "pairCombo" && (
          <div className="space-y-1">
            <ClassificationFiltersWithSource
              workbookTickers={allTickers}
              filters={pcFilters}
              onFiltersChange={setPcFilters}
              search={pcClassSearch}
              onSearchChange={setPcClassSearch}
              manualTickers={pcManualTickers}
              onManualTickersChange={setPcManualTickers}
              filteredCount={pcLegs.length}
              totalCount={allTickers.length}
              testIdPrefix="cs-paircombo-filter"
              source={pcSource}
              onSourceChange={setPcSource}
            />
            <div className="text-[10px] text-muted-foreground">
              {pcLegs.length < 2 ? (
                "Pick at least two legs to generate pairs. Each selection level intersects with the others."
              ) : (
                <>
                  {pcLegs.length} legs → <span className="font-bold">{pcPairCount}</span> unordered
                  pairs (A/B == B/A){" "}
                  {pcPairCount > PC_MAX_PAIRS && (
                    <span className="text-amber-400 font-bold">— capped at {PC_MAX_PAIRS}</span>
                  )}
                </>
              )}
              {pcLegs.length > 0 && pcLegs.length <= 24 && (
                <span className="ml-2 text-muted-foreground/70">[{pcLegs.join(", ")}]</span>
              )}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3 border border-border rounded p-2 bg-card/40">
          {/* Date range */}
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider">
              Date range
            </label>
            <select
              value={datePreset}
              onChange={(e) => {
                setDatePreset(e.target.value);
                setDateRange(getDateRangeFromPreset(e.target.value));
              }}
              className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5"
              data-testid="cs-date-preset"
            >
              {DATE_PRESETS.map((p: any) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Timeframe */}
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider">
              Timeframe
            </label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5"
              data-testid="cs-timeframe"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          {/* Lookback */}
          <div className="flex flex-col">
            <label
              className="text-[9px] uppercase text-muted-foreground tracking-wider"
              title="How many recent candles back to look for a cross. 1 = only the most recent candle vs the one before it. Larger = wider window, more results."
            >
              Lookback (candles)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={lookback}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v >= 1) setLookback(v);
              }}
              className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20"
              data-testid="cs-lookback"
            />
          </div>

          {/* Top-N */}
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider">
              Top-N per ticker
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={topN}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v >= 1) setTopN(v);
              }}
              className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20"
              data-testid="cs-topn"
            />
          </div>

          {/* Min score */}
          <div className="flex flex-col">
            <label className="text-[9px] uppercase text-muted-foreground tracking-wider">
              Min score
            </label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={minScore}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v >= 0 && v <= 1) setMinScore(v);
              }}
              className="text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20"
              data-testid="cs-minscore"
            />
          </div>

          {/* Detect checkboxes */}
          <div className="flex flex-col gap-0.5">
            <label
              className="text-[9px] uppercase text-muted-foreground tracking-wider"
              title="Which detector families to run. All four are on by default."
            >
              Detect
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <label
                className="flex items-center gap-1 text-[11px]"
                title="Horizontal support / resistance pivots"
              >
                <input
                  type="checkbox"
                  checked={scanHorizontal}
                  onChange={(e) => setScanHorizontal(e.target.checked)}
                  data-testid="cs-scan-horizontal"
                />
                Horizontal
              </label>
              <label
                className="flex items-center gap-1 text-[11px]"
                title="Moving-average bounce levels (SMA / EMA / WMA / HMA / KAMA / FRAMA / T3 / ALMA / LSMA / SLSMA × 20/50/100/200)"
              >
                <input
                  type="checkbox"
                  checked={scanMA}
                  onChange={(e) => setScanMA(e.target.checked)}
                  data-testid="cs-scan-ma"
                />
                Moving averages
              </label>
              <label
                className="flex items-center gap-1 text-[11px]"
                title="Fibonacci retracement levels"
              >
                <input
                  type="checkbox"
                  checked={scanFib}
                  onChange={(e) => setScanFib(e.target.checked)}
                  data-testid="cs-scan-fib"
                />
                Fibonacci
              </label>
              <label
                className="flex items-center gap-1 text-[11px]"
                title="Diagonal trendlines (pivot-pair, fractals, or RANSAC — configured on the Trendlines sub-tab)"
              >
                <input
                  type="checkbox"
                  checked={scanTrendlines}
                  onChange={(e) => setScanTrendlines(e.target.checked)}
                  data-testid="cs-scan-trendlines"
                />
                Diagonal trendlines
              </label>
              <span
                className="text-[10px] text-muted-foreground ml-1"
                data-testid="cs-detect-summary"
              >
                {[
                  scanHorizontal && "Horizontal",
                  scanMA && "MA",
                  scanFib && "Fib",
                  scanTrendlines && "Trendlines",
                ]
                  .filter(Boolean)
                  .join(" · ") || <span className="text-amber-400">none selected</span>}
              </span>
            </div>
          </div>

          {/* Run / Stop */}
          <div className="ml-auto flex items-center gap-2">
            {running ? (
              <button
                onClick={handleStop}
                className="text-[11px] font-bold px-3 py-1 rounded bg-destructive text-destructive-foreground"
                data-testid="cs-stop"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleRunScan}
                disabled={tickerList.length === 0 || (!anyLevelScan && !scanTrendlines)}
                title={!anyLevelScan && !scanTrendlines ? "Select at least one detector category" : undefined}
                className="text-[11px] font-bold px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
                data-testid="cs-run"
              >
                Run scan
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        {running && (
          <div className="text-[10px] text-muted-foreground">
            Scanning {progress.current} / {progress.total}…
          </div>
        )}

        {/* Results */}
        <div className="border border-border rounded">
          <div className="flex items-center justify-between px-2 py-1 bg-card/50 border-b border-border">
            <span className="text-[11px] font-bold">
              Results: {results.length} cross{results.length === 1 ? "" : "es"}
              {skipped.length > 0 && (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  ({skipped.length} skipped)
                </span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Sorted by candles ago, then score
            </span>
          </div>
          {results.length === 0 && !running ? (
            <div className="p-3 text-[11px] text-muted-foreground">
              No results yet. Configure source, lookback, and what to scan, then click Run scan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-card/40 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1 font-mono">Ticker</th>
                    <th className="text-left px-2 py-1 font-mono">Kind</th>
                    <th className="text-left px-2 py-1 font-mono">Direction</th>
                    <th className="text-right px-2 py-1 font-mono">Candles ago</th>
                    <th className="text-left px-2 py-1 font-mono">Cross date</th>
                    <th className="text-right px-2 py-1 font-mono">Close @ cross</th>
                    <th className="text-right px-2 py-1 font-mono">Level @ cross</th>
                    <th className="text-right px-2 py-1 font-mono">Current</th>
                    <th className="text-right px-2 py-1 font-mono">Dist from level</th>
                    <th className="text-right px-2 py-1 font-mono">Score</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, idx) => (
                    <tr
                      key={`${row.ticker}-${row.kind}-${idx}`}
                      className="border-t border-border hover:bg-card/40"
                      data-testid={`cs-row-${row.ticker}-${idx}`}
                    >
                      <td className="px-2 py-1 font-bold">{row.ticker}</td>
                      <td className="px-2 py-1">{row.subtype}</td>
                      <td className="px-2 py-1">
                        <span
                          className={
                            row.direction === "up"
                              ? "text-emerald-400 font-bold"
                              : "text-rose-400 font-bold"
                          }
                          title={
                            row.direction === "up"
                              ? "Close moved from below to above the level (broke up through resistance / reclaimed support)"
                              : "Close moved from above to below the level (broke down through support / lost resistance)"
                          }
                        >
                          {row.direction === "up" ? "▲ up" : "▼ down"}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right">{row.candlesAgo}</td>
                      <td className="px-2 py-1">{row.crossDate}</td>
                      <td className="px-2 py-1 text-right">{row.closeAtCross.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{row.levelValueAtCross.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">{row.currentPrice.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">
                        {(row.distancePct * 100).toFixed(2)}%
                      </td>
                      <td className="px-2 py-1 text-right">{row.score.toFixed(2)}</td>
                      <td className="px-2 py-1">
                        <button
                          onClick={() => handleSendToCharts(row)}
                          className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30"
                          data-testid={`cs-send-${row.ticker}-${idx}`}
                          title="Send this level/line to the Charts tab as an overlay"
                        >
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
              {skipped.map((s, idx) => (
                <li key={idx}>
                  {s.ticker}: {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function LevelsAndTrendlines() {
  const [activeTab, setActiveTab] = useState<"levels" | "trendlines" | "screener">("levels");

  return (
    <div className="flex flex-col h-full text-foreground bg-background">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card/30 flex-shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mr-2">
          Method
        </span>
        <button
          data-testid="lt-subtab-levels"
          onClick={() => setActiveTab("levels")}
          className={`text-[11px] font-mono font-bold px-3 py-1 rounded transition-colors ${
            activeTab === "levels"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-foreground border border-border"
          }`}
          title="Horizontal pivot levels, moving-average bounces, and Fibonacci retracements."
        >
          Horizontal / MA / Fib
        </button>
        <button
          data-testid="lt-subtab-trendlines"
          onClick={() => setActiveTab("trendlines")}
          className={`text-[11px] font-mono font-bold px-3 py-1 rounded transition-colors ${
            activeTab === "trendlines"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-foreground border border-border"
          }`}
          title="Diagonal trendlines via pivot pairs, Williams fractals, or RANSAC."
        >
          Diagonal Trendlines
        </button>
        <button
          data-testid="lt-subtab-screener"
          onClick={() => setActiveTab("screener")}
          className={`text-[11px] font-mono font-bold px-3 py-1 rounded transition-colors ${
            activeTab === "screener"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-foreground border border-border"
          }`}
          title="Screen a universe or basket for tickers that just crossed S/R levels or trendlines."
        >
          Crossing Screener
        </button>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          Multi-select • Future projection • Send to Charts
        </span>
      </div>

      {/* Pane content */}
      <div className="flex-1 overflow-hidden">
        <div
          className={activeTab === "levels" ? "h-full" : "h-full hidden"}
          data-testid="lt-pane-levels"
        >
          <SupportResistancePanel />
        </div>
        <div
          className={activeTab === "trendlines" ? "h-full" : "h-full hidden"}
          data-testid="lt-pane-trendlines"
        >
          <TrendlinesSubPanel />
        </div>
        <div
          className={activeTab === "screener" ? "h-full" : "h-full hidden"}
          data-testid="lt-pane-screener"
        >
          <CrossingScreener />
        </div>
      </div>
    </div>
  );
}
