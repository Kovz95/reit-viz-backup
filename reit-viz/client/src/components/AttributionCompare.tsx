/**
 * AttributionCompare — multi-company attribution views for the /attribution
 * page's "Compare" tab. Four views over one selected symbol set (tickers,
 * A/B pairs, or baskets), all driven by the page's shared basis / period /
 * window / rolling controls:
 *
 *  - Overlay:  one chart, one line per symbol (share-of-move % or cumulative
 *              multiple / estimate / total contribution).
 *  - Grid:     small-multiples — a mini 3-line cumulative decomposition per
 *              symbol.
 *  - Heatmap:  rows = symbols, x = time, color = rolling multiple-share
 *              (sky = multiple-driven, amber = estimate-driven).
 *  - Scatter:  one dot per symbol over the window — x = multiple
 *              contribution, y = estimate contribution.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createChart, ColorType, CrosshairMode, LineSeries, LineStyle } from "lightweight-charts";
import type { IChartApi } from "lightweight-charts";
import { makeViewPreserver } from "@/lib/chartView";
import { X, RefreshCw, Users, Grid as GridIcon, Rows3, ScatterChart as ScatterIcon, LineChart as LineChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useGridColor } from "@/lib/gridPref";
import {
  getStartIndex, loadBasisAlignedAny, buildCumulativePath, buildRollingPath, computeAttributionRow,
  resampleAlignedWeekly,
  type BasisMode, type BasisPeriod, type BasisFamily, type AlignedData, type AttributionBasketLike,
  type CumPoint, type RollingPoint,
} from "@/lib/attribution";
import { TickerSearchSelect, type TickerOption } from "@/pages/Attribution";

const PALETTE = [
  "#38bdf8", "#fbbf24", "#34d399", "#f472b6", "#a78bfa", "#fb923c",
  "#e879f9", "#4ade80", "#f87171", "#22d3ee", "#facc15", "#c084fc",
];
const COLOR_MULT = "#38bdf8";
const COLOR_EST = "#fbbf24";
const UNIVERSE_CAP = 40;

type CompareView = "overlay" | "grid" | "heatmap" | "scatter";
type OverlayMetric = "share" | "cummult" | "cumest" | "cumtotal";

const OVERLAY_METRIC_LABELS: Record<OverlayMetric, string> = {
  share: "Multiple share % (rolling)",
  cummult: "Cumulative Multiple Δ (ln %)",
  cumest: "Cumulative Estimate Δ (ln %)",
  cumtotal: "Cumulative Total Δ (ln %)",
};

interface CompareEntry {
  sym: string;
  name: string;
  color: string;
  failed: boolean;
  loading: boolean;
  basis?: BasisFamily;
  cum: CumPoint[];
  roll: RollingPoint[];
  row: { totalPct: number; multiplePct: number; estimatePct: number } | null;
}

interface AttributionCompareProps {
  tickerOptions: TickerOption[];
  universeTickers: string[];
  basisMode: BasisMode;
  period: BasisPeriod;
  windowDays: number;
  rollingDays: number;
  /** "weekly"/"monthly" sample one point per ISO week / calendar month;
   *  Rolling then counts bars of that frequency. */
  freq?: "daily" | "weekly" | "monthly";
  displaySymbol: (sym: string) => string;
  resolveBasket: (id: string) => AttributionBasketLike | undefined;
  onOpenSingle: (sym: string) => void;
}

function shareOf(p: RollingPoint): number {
  const denom = Math.abs(p.mult) + Math.abs(p.est);
  return denom > 1e-12 ? (Math.abs(p.mult) / denom) * 100 : 50;
}

export default function AttributionCompare({
  tickerOptions, universeTickers, basisMode, period, windowDays, rollingDays,
  freq = "daily", displaySymbol, resolveBasket, onOpenSingle,
}: AttributionCompareProps) {
  const [symbols, setSymbols] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem("attr-compare-symbols-v1");
      if (s) { const p = JSON.parse(s); if (Array.isArray(p)) return p.filter((x): x is string => typeof x === "string"); }
    } catch {}
    return [];
  });
  useEffect(() => { try { localStorage.setItem("attr-compare-symbols-v1", JSON.stringify(symbols)); } catch {} }, [symbols]);

  const [view, setView] = useState<CompareView>(() => {
    try {
      const s = localStorage.getItem("attr-compare-view-v1");
      if (s === "overlay" || s === "grid" || s === "heatmap" || s === "scatter") return s;
    } catch {}
    return "overlay";
  });
  useEffect(() => { try { localStorage.setItem("attr-compare-view-v1", view); } catch {} }, [view]);

  const [overlayMetric, setOverlayMetric] = useState<OverlayMetric>(() => {
    try {
      const s = localStorage.getItem("attr-compare-overlay-metric-v1");
      if (s === "share" || s === "cummult" || s === "cumest" || s === "cumtotal") return s;
    } catch {}
    return "share";
  });
  useEffect(() => { try { localStorage.setItem("attr-compare-overlay-metric-v1", overlayMetric); } catch {} }, [overlayMetric]);

  // ── Data loading (cached per symbol; cache flushes on basis/period change) ──
  const cacheRef = useRef(new Map<string, { basis: BasisFamily; aligned: AlignedData } | null>());
  const [cacheVer, setCacheVer] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const runRef = useRef({ cancelled: false });

  useEffect(() => {
    cacheRef.current.clear();
    setCacheVer(v => v + 1);
  }, [basisMode, period]);

  useEffect(() => {
    const missing = symbols.filter(s => !cacheRef.current.has(s));
    if (missing.length === 0) return;
    runRef.current.cancelled = true;
    const token = { cancelled: false };
    runRef.current = token;
    setProgress({ done: 0, total: missing.length });
    let idx = 0, done = 0;
    const worker = async () => {
      for (;;) {
        if (token.cancelled) return;
        const i = idx++;
        if (i >= missing.length) return;
        const sym = missing[i];
        try {
          const res = await loadBasisAlignedAny(sym, basisMode, period, undefined, resolveBasket);
          cacheRef.current.set(sym, res);
        } catch {
          cacheRef.current.set(sym, null);
        }
        done++;
        if (!token.cancelled) setProgress({ done, total: missing.length });
      }
    };
    Promise.all(Array.from({ length: 6 }, () => worker())).then(() => {
      if (!token.cancelled) { setProgress(null); setCacheVer(v => v + 1); }
    });
  }, [symbols, basisMode, period, cacheVer, resolveBasket]);

  const entries = useMemo<CompareEntry[]>(() => symbols.map((sym, i) => {
    const color = PALETTE[i % PALETTE.length];
    const name = displaySymbol(sym);
    const res = cacheRef.current.get(sym);
    if (res === undefined) return { sym, name, color, failed: false, loading: true, cum: [], roll: [], row: null };
    if (res === null) return { sym, name, color, failed: true, loading: false, cum: [], roll: [], row: null };
    const aligned = freq !== "daily" ? resampleAlignedWeekly(res.aligned, freq) : res.aligned;
    const effWindow = freq !== "daily" && windowDays > 0 ? Math.max(2, Math.round(windowDays / (freq === "monthly" ? 21 : 5))) : windowDays;
    const startIdx = getStartIndex(aligned.dates, effWindow);
    return {
      sym, name, color, failed: false, loading: false, basis: res.basis,
      cum: buildCumulativePath(aligned, startIdx),
      roll: buildRollingPath(aligned, startIdx, rollingDays),
      row: computeAttributionRow(sym, res.basis, aligned, effWindow),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [symbols, windowDays, rollingDays, freq, cacheVer, displaySymbol]);

  const ready = entries.filter(e => !e.loading && !e.failed && e.cum.length >= 2);

  // ── Symbol management ──────────────────────────────────────────────────────
  const addSymbol = useCallback((sym: string) => {
    if (!sym) return;
    setSymbols(prev => (prev.includes(sym) ? prev : [...prev, sym]));
  }, []);
  const removeSymbol = useCallback((sym: string) => setSymbols(prev => prev.filter(s => s !== sym)), []);
  const addBasketMembers = useCallback((basketId: string) => {
    const b = resolveBasket(basketId);
    if (!b?.tickers?.length) return;
    setSymbols(prev => {
      const next = [...prev];
      for (const t of b.tickers) if (!next.includes(t)) next.push(t);
      return next;
    });
  }, [resolveBasket]);
  const [universeNote, setUniverseNote] = useState<string | null>(null);
  const addUniverse = useCallback(() => {
    setSymbols(prev => {
      const next = [...prev];
      let added = 0;
      for (const t of universeTickers) {
        if (next.length >= UNIVERSE_CAP) break;
        if (!next.includes(t)) { next.push(t); added++; }
      }
      const capped = universeTickers.length > added + prev.length;
      setUniverseNote(capped ? `Added ${added} (capped at ${UNIVERSE_CAP} — narrow the filters for full coverage)` : `Added ${added}`);
      return next;
    });
  }, [universeTickers]);

  const basketOptions = useMemo(() => tickerOptions.filter(o => o.ticker.startsWith("BASKET:")), [tickerOptions]);

  const remountKey = `${view}:${overlayMetric}:${symbols.join("|")}:${windowDays}:${rollingDays}:${cacheVer}`;

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* Symbol picker row */}
      <div className="flex items-center gap-2 flex-wrap">
        <TickerSearchSelect options={tickerOptions} value="" valueLabel="" onChange={addSymbol} />
        <Select value="" onValueChange={addBasketMembers}>
          <SelectTrigger className="h-7 text-[11px] w-[190px]" data-testid="compare-add-basket-members">
            <SelectValue placeholder="Add basket members…" />
          </SelectTrigger>
          <SelectContent>
            {basketOptions.map(o => (
              <SelectItem key={o.ticker} value={o.ticker.slice("BASKET:".length)} className="text-[11px]">
                {o.label ?? o.ticker}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={addUniverse} data-testid="compare-add-universe">
          <Users className="w-3 h-3 mr-1" /> Use filtered universe ({Math.min(universeTickers.length, UNIVERSE_CAP)})
        </Button>
        {symbols.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground" onClick={() => setSymbols([])} data-testid="compare-clear">
            Clear all
          </Button>
        )}
        {progress && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <RefreshCw className="w-3 h-3 animate-spin" /> {progress.done}/{progress.total}
          </span>
        )}
        {universeNote && <span className="text-[10px] text-muted-foreground">{universeNote}</span>}
      </div>

      {/* Selected chips */}
      {symbols.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap" data-testid="compare-chips">
          {entries.map(e => (
            <span
              key={e.sym}
              className={`inline-flex items-center gap-1 h-6 pl-1.5 pr-0.5 rounded border text-[10px] font-mono ${e.failed ? "border-red-500/50 text-red-400" : "border-border"}`}
              title={e.failed ? `No ${basisMode} ${period} estimate data` : e.name}
              data-testid={`compare-chip-${e.sym}`}
            >
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: e.failed ? "#f87171" : e.color }} />
              <span className="max-w-[140px] truncate">{e.name}</span>
              <button onClick={() => removeSymbol(e.sym)} className="p-0.5 text-muted-foreground hover:text-foreground" aria-label={`Remove ${e.name}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* View tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {([
          ["overlay", "Overlay", LineChartIcon],
          ["grid", "Grid", GridIcon],
          ["heatmap", "Heatmap", Rows3],
          ["scatter", "Scatter", ScatterIcon],
        ] as const).map(([v, label, Icon]) => (
          <Button
            key={v}
            variant={view === v ? "default" : "secondary"}
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => setView(v)}
            data-testid={`compare-view-${v}`}
          >
            <Icon className="w-3 h-3 mr-1" /> {label}
          </Button>
        ))}
        {view === "overlay" && (
          <Select value={overlayMetric} onValueChange={(v) => setOverlayMetric(v as OverlayMetric)}>
            <SelectTrigger className="h-7 text-[11px] w-[230px] ml-2" data-testid="compare-overlay-metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(OVERLAY_METRIC_LABELS) as OverlayMetric[]).map(k => (
                <SelectItem key={k} value={k} className="text-[11px]">{OVERLAY_METRIC_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {symbols.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-[11px]">
          Add tickers, pairs (AKR/BXP), or baskets above — or pull in a basket's members / the filtered universe.
        </div>
      ) : view === "overlay" ? (
        <OverlayView key={remountKey} entries={ready} metric={overlayMetric} />
      ) : view === "grid" ? (
        <GridView entries={ready} windowDays={windowDays} onOpenSingle={onOpenSingle} remountKey={remountKey} />
      ) : view === "heatmap" ? (
        <HeatmapView entries={ready} rollingDays={rollingDays} onOpenSingle={onOpenSingle} />
      ) : (
        <ScatterView entries={ready} windowDays={windowDays} onOpenSingle={onOpenSingle} />
      )}
      {ready.length === 0 && symbols.length > 0 && !progress && (
        <div className="text-[10px] text-muted-foreground">No symbols with usable estimate data yet.</div>
      )}
    </div>
  );
}

// ── Overlay ──────────────────────────────────────────────────────────────────

function OverlayView({ entries, metric }: { entries: CompareEntry[]; metric: OverlayMetric }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridColor = useGridColor("rgba(255,255,255,0.04)");
  // Preserve pan/zoom across the recreate this effect does on metric/theme changes.
  // Fingerprint on the entry set + span (NOT the metric-dependent values) so flipping
  // the overlay metric keeps the current view; only a company/data change reframes.
  const viewRef = useRef(makeViewPreserver());
  const [hover, setHover] = useState<{ x: number; y: number; date: string; vals: { name: string; color: string; v: number }[] } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || entries.length === 0) return;
    let chart: IChartApi | null = null;
    let ro: ResizeObserver | null = null;
    const init = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(init); return; }
      chart = createChart(el, {
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#7a8a9e", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.08)", scaleMargins: { top: 0.08, bottom: 0.08 } },
        timeScale: { borderColor: "rgba(255,255,255,0.08)", rightOffset: 5, minBarSpacing: 0.05 },
        handleScroll: { mouseWheel: false, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true },
        width: rect.width, height: rect.height,
      });
      const seriesByEntry: { name: string; color: string; s: ReturnType<IChartApi["addSeries"]> }[] = [];
      for (const e of entries) {
        const data = metric === "share"
          ? e.roll.map(p => ({ time: p.date.slice(0, 10), value: shareOf(p) }))
          : e.cum.map(p => ({ time: p.date.slice(0, 10), value: metric === "cummult" ? p.mult : metric === "cumest" ? p.est : p.total }));
        const seen = new Set<string>();
        const deduped = data.filter(d => (seen.has(d.time) ? false : (seen.add(d.time), true)));
        if (deduped.length < 2) continue;
        const s = chart.addSeries(LineSeries, {
          color: e.color, lineWidth: 2, title: e.name,
          priceFormat: { type: "price", precision: metric === "share" ? 0 : 1, minMove: metric === "share" ? 1 : 0.1 },
          priceLineVisible: false, lastValueVisible: true,
        });
        s.setData(deduped);
        seriesByEntry.push({ name: e.name, color: e.color, s });
      }
      // Reference line: 50% for share, 0 for cumulative metrics.
      if (seriesByEntry.length) {
        const refVal = metric === "share" ? 50 : 0;
        const first = seriesByEntry[0].s;
        const d = first.data();
        if (d.length >= 2) {
          const ref = chart.addSeries(LineSeries, { color: "rgba(255,255,255,0.18)", lineWidth: 1, lineStyle: LineStyle.Dotted, title: "", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
          ref.setData([{ time: d[0].time, value: refVal }, { time: d[d.length - 1].time, value: refVal }]);
        }
      }
      chart.subscribeCrosshairMove(param => {
        if (!param.time || !param.point || !(param as any).sourceEvent) { setHover(null); return; }
        const vals: { name: string; color: string; v: number }[] = [];
        for (const { name, color, s } of seriesByEntry) {
          const dv = param.seriesData.get(s) as { value?: number } | undefined;
          if (dv?.value != null) vals.push({ name, color, v: dv.value });
        }
        if (!vals.length) { setHover(null); return; }
        vals.sort((a, b) => b.v - a.v);
        const t = param.time;
        const dateStr = typeof t === "object" && (t as any).year
          ? `${(t as any).year}-${String((t as any).month).padStart(2, "0")}-${String((t as any).day).padStart(2, "0")}` : String(t);
        setHover({ x: param.point.x, y: param.point.y, date: dateStr, vals });
      });
      const fp = entries.map(e => `${e.sym}:${e.cum.length}:${e.roll.length}`).join("|");
      viewRef.current.applyView(chart, fp);
      ro = new ResizeObserver(es => {
        const { width, height } = es[0].contentRect;
        if (chart && width > 0 && height > 0) chart.applyOptions({ width, height });
      });
      ro.observe(el);
    };
    init();
    return () => { ro?.disconnect(); if (chart) viewRef.current.capture(chart); chart?.remove(); };
  }, [entries, metric, gridColor]);

  return (
    <div className="relative w-full" style={{ height: 430 }} data-testid="compare-overlay-chart">
      <div ref={containerRef} className="absolute inset-0" />
      {hover && (
        <div className="pointer-events-none absolute z-10 rounded border border-border bg-popover/95 px-2 py-1 text-[10px] shadow-md backdrop-blur max-h-[300px] overflow-hidden"
          style={{ left: Math.min(hover.x + 12, (containerRef.current?.clientWidth ?? 0) - 190), top: Math.max(8, Math.min(hover.y - 30, 120)) }}>
          <div className="text-muted-foreground mb-0.5">{hover.date}</div>
          {hover.vals.slice(0, 16).map(v => (
            <div key={v.name} className="flex items-center justify-between gap-3">
              <span style={{ color: v.color }} className="truncate max-w-[120px]">{v.name}</span>
              <span className="font-mono">{metric === "share" ? `${v.v.toFixed(0)}%` : `${v.v >= 0 ? "+" : ""}${v.v.toFixed(1)}`}</span>
            </div>
          ))}
          {hover.vals.length > 16 && <div className="text-muted-foreground">… {hover.vals.length - 16} more</div>}
        </div>
      )}
    </div>
  );
}

// ── Grid (small multiples) ───────────────────────────────────────────────────

function GridMini({ entry }: { entry: CompareEntry }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridColor = useGridColor("rgba(255,255,255,0.04)");
  useEffect(() => {
    const el = containerRef.current;
    if (!el || entry.cum.length < 2) return;
    let chart: IChartApi | null = null;
    let ro: ResizeObserver | null = null;
    const init = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(init); return; }
      chart = createChart(el, {
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#7a8a9e", fontSize: 9, fontFamily: "'JetBrains Mono', monospace" },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        crosshair: { mode: CrosshairMode.Hidden },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.06)", scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: "rgba(255,255,255,0.06)", rightOffset: 1, minBarSpacing: 0.02, timeVisible: false },
        handleScroll: false, handleScale: false,
        width: rect.width, height: rect.height,
      });
      const seen = new Set<string>();
      const dd = entry.cum.filter(p => { const k = p.date.slice(0, 10); return seen.has(k) ? false : (seen.add(k), true); });
      const mk = (color: string, get: (p: CumPoint) => number, w: 1 | 2) => {
        const s = chart!.addSeries(LineSeries, { color, lineWidth: w, title: "", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        s.setData(dd.map(p => ({ time: p.date.slice(0, 10), value: get(p) })));
      };
      mk(COLOR_EST, p => p.est, 1);
      mk(COLOR_MULT, p => p.mult, 1);
      mk("#e5e7eb", p => p.total, 2);
      chart.timeScale().fitContent();
      ro = new ResizeObserver(es => {
        const { width, height } = es[0].contentRect;
        if (chart && width > 0 && height > 0) chart.applyOptions({ width, height });
      });
      ro.observe(el);
    };
    init();
    return () => { ro?.disconnect(); chart?.remove(); };
  }, [entry, gridColor]);
  return <div ref={containerRef} className="w-full h-[130px]" />;
}

function GridView({ entries, windowDays, onOpenSingle, remountKey }: {
  entries: CompareEntry[]; windowDays: number; onOpenSingle: (sym: string) => void; remountKey: string;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }} data-testid="compare-grid">
      {entries.map(e => {
        const last = e.cum[e.cum.length - 1];
        return (
          <div key={`${remountKey}:${e.sym}`} className="border border-border rounded p-2 hover:border-primary/50 cursor-pointer" onClick={() => onOpenSingle(e.sym)} title="Open in Single Ticker view" data-testid={`compare-grid-cell-${e.sym}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono font-bold text-[11px] truncate" style={{ color: e.color }}>{e.name}</span>
              {last && (
                <span className="text-[9px] font-mono text-muted-foreground">
                  T <span className="text-foreground">{last.total >= 0 ? "+" : ""}{last.total.toFixed(1)}</span>
                  {" "}M <span style={{ color: COLOR_MULT }}>{last.mult >= 0 ? "+" : ""}{last.mult.toFixed(1)}</span>
                  {" "}E <span style={{ color: COLOR_EST }}>{last.est >= 0 ? "+" : ""}{last.est.toFixed(1)}</span>
                </span>
              )}
            </div>
            <GridMini entry={e} />
          </div>
        );
      })}
      {entries.length > 0 && (
        <div className="col-span-full text-[9px] text-muted-foreground">
          White = Total Δln(P), sky = Multiple, amber = Estimates — cumulative ln-% over the {windowDays === 0 ? "YTD" : `${windowDays}d`} window. Click a card to open it in Single Ticker view.
        </div>
      )}
    </div>
  );
}

// ── Heatmap ──────────────────────────────────────────────────────────────────

function shareColor(s: number): string {
  // 0 (all estimate) = amber → 50 = dark neutral → 100 (all multiple) = sky.
  const mid = [31, 41, 55];
  const amber = [251, 191, 36];
  const sky = [56, 189, 248];
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const c = s <= 50 ? mix(amber, mid, s / 50) : mix(mid, sky, (s - 50) / 50);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function HeatmapView({ entries, rollingDays, onOpenSingle }: {
  entries: CompareEntry[]; rollingDays: number; onOpenSingle: (sym: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; sym: string; name: string; date: string; share: number } | null>(null);
  const ROW_H = 20, GUTTER = 92, AXIS_H = 18;

  const model = useMemo(() => {
    const dateSet = new Set<string>();
    for (const e of entries) for (const p of e.roll) dateSet.add(p.date.slice(0, 10));
    const dates = Array.from(dateSet).sort();
    const rows = entries.filter(e => e.roll.length >= 2).map(e => {
      const byDate = new Map<string, number>();
      for (const p of e.roll) byDate.set(p.date.slice(0, 10), shareOf(p));
      return { sym: e.sym, name: e.name, byDate };
    });
    return { dates, rows };
  }, [entries]);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const draw = () => {
      const { dates, rows } = model;
      const width = wrap.clientWidth;
      const height = rows.length * ROW_H + AXIS_H;
      if (width <= GUTTER + 40 || rows.length === 0 || dates.length === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr; canvas.height = height * dpr;
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      const plotW = width - GUTTER;
      const cellW = plotW / dates.length;
      rows.forEach((row, r) => {
        const y = r * ROW_H;
        let lastShare: number | null = null;
        dates.forEach((d, i) => {
          const s = row.byDate.get(d);
          if (s != null) lastShare = s;
          if (lastShare == null) return;
          ctx.fillStyle = row.byDate.has(d) ? shareColor(lastShare) : "rgba(255,255,255,0.03)";
          ctx.fillRect(GUTTER + i * cellW, y + 1, Math.ceil(cellW) + 0.5, ROW_H - 2);
        });
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.textBaseline = "middle";
        const label = row.name.length > 12 ? `${row.name.slice(0, 11)}…` : row.name;
        ctx.fillText(label, 4, y + ROW_H / 2);
      });
      // date ticks
      ctx.fillStyle = "#64748b";
      ctx.font = "9px 'JetBrains Mono', monospace";
      const ticks = Math.min(6, dates.length);
      for (let t = 0; t < ticks; t++) {
        const i = Math.round((t / Math.max(1, ticks - 1)) * (dates.length - 1));
        const x = GUTTER + i * cellW;
        ctx.fillText(dates[i], Math.min(x, width - 62), rows.length * ROW_H + AXIS_H / 2 + 2);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [model]);

  const onMove = useCallback((ev: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    const { dates, rows } = model;
    const r = Math.floor(y / ROW_H);
    if (x < GUTTER || r < 0 || r >= rows.length || dates.length === 0) { setHover(null); return; }
    const i = Math.min(dates.length - 1, Math.max(0, Math.floor((x - GUTTER) / ((rect.width - GUTTER) / dates.length))));
    // walk back to last known share (forward-filled like the paint)
    let share: number | null = null, date = dates[i];
    for (let k = i; k >= 0; k--) {
      const s = rows[r].byDate.get(dates[k]);
      if (s != null) { share = s; date = dates[k]; break; }
    }
    if (share == null) { setHover(null); return; }
    setHover({ x, y, sym: rows[r].sym, name: rows[r].name, date, share });
  }, [model]);

  return (
    <div className="space-y-1" data-testid="compare-heatmap">
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
        <span>Rolling {rollingDays}d multiple-share:</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2" style={{ background: shareColor(100) }} /> 100% multiple-driven</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2" style={{ background: shareColor(50) }} /> 50/50</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2" style={{ background: shareColor(0) }} /> 100% estimate-driven</span>
        <span className="ml-2">A column turning sky across every row = the whole set re-rating at once. Click a row to open it.</span>
      </div>
      <div ref={wrapRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onClick={() => { if (hover) onOpenSingle(hover.sym); }}
          className={hover ? "cursor-pointer" : ""}
        />
        {hover && (
          <div className="pointer-events-none absolute z-10 rounded border border-border bg-popover/95 px-2 py-1 text-[10px] shadow-md backdrop-blur"
            style={{ left: Math.min(hover.x + 12, (wrapRef.current?.clientWidth ?? 0) - 190), top: Math.max(0, hover.y - 34) }}>
            <span className="font-mono font-bold">{hover.name}</span> · {hover.date} ·{" "}
            <span style={{ color: hover.share >= 50 ? COLOR_MULT : COLOR_EST }}>
              {hover.share.toFixed(0)}% multiple / {(100 - hover.share).toFixed(0)}% estimates
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scatter ──────────────────────────────────────────────────────────────────

function ScatterView({ entries, windowDays, onOpenSingle }: {
  entries: CompareEntry[]; windowDays: number; onOpenSingle: (sym: string) => void;
}) {
  const pts = entries.filter(e => e.row).map(e => ({ sym: e.sym, name: e.name, color: e.color, x: e.row!.multiplePct, y: e.row!.estimatePct, total: e.row!.totalPct }));
  const [hover, setHover] = useState<string | null>(null);
  const W = 720, H = 480, M = 46;
  const maxAbs = Math.max(5, ...pts.map(p => Math.max(Math.abs(p.x), Math.abs(p.y)))) * 1.15;
  const sx = (v: number) => M + ((v + maxAbs) / (2 * maxAbs)) * (W - 2 * M);
  const sy = (v: number) => H - M - ((v + maxAbs) / (2 * maxAbs)) * (H - 2 * M);
  const winLabel = windowDays === 0 ? "YTD" : `${windowDays}d`;
  const ticks = [-maxAbs / 1.15, -maxAbs / 2.3, 0, maxAbs / 2.3, maxAbs / 1.15].map(v => Math.round(v));
  return (
    <div data-testid="compare-scatter" className="overflow-x-auto">
      <svg width={W} height={H} className="max-w-full">
        {/* grid + axes */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={sx(t)} y1={M} x2={sx(t)} y2={H - M} stroke="rgba(255,255,255,0.05)" />
            <line x1={M} y1={sy(t)} x2={W - M} y2={sy(t)} stroke="rgba(255,255,255,0.05)" />
            <text x={sx(t)} y={H - M + 14} fill="#64748b" fontSize={9} textAnchor="middle" fontFamily="monospace">{t}%</text>
            <text x={M - 6} y={sy(t) + 3} fill="#64748b" fontSize={9} textAnchor="end" fontFamily="monospace">{t}%</text>
          </g>
        ))}
        <line x1={sx(0)} y1={M} x2={sx(0)} y2={H - M} stroke="rgba(255,255,255,0.25)" />
        <line x1={M} y1={sy(0)} x2={W - M} y2={sy(0)} stroke="rgba(255,255,255,0.25)" />
        {/* quadrant captions */}
        <text x={W - M - 4} y={M + 12} fill="#475569" fontSize={9} textAnchor="end">re-rated ↑ · revised ↑</text>
        <text x={M + 4} y={M + 12} fill="#475569" fontSize={9}>de-rated · revised ↑</text>
        <text x={W - M - 4} y={H - M - 6} fill="#475569" fontSize={9} textAnchor="end">re-rated ↑ · revised ↓</text>
        <text x={M + 4} y={H - M - 6} fill="#475569" fontSize={9}>de-rated · revised ↓</text>
        {/* axis titles */}
        <text x={W / 2} y={H - 8} fill="#94a3b8" fontSize={10} textAnchor="middle">Multiple contribution ({winLabel}, ln %)</text>
        <text x={12} y={H / 2} fill="#94a3b8" fontSize={10} textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>Estimate contribution ({winLabel}, ln %)</text>
        {pts.map(p => (
          <g key={p.sym} className="cursor-pointer" onClick={() => onOpenSingle(p.sym)} onMouseEnter={() => setHover(p.sym)} onMouseLeave={() => setHover(null)} data-testid={`compare-scatter-dot-${p.sym}`}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={hover === p.sym ? 7 : 5} fill={p.color} fillOpacity={0.85} stroke="#0b1220" strokeWidth={1} />
            <text x={sx(p.x) + 8} y={sy(p.y) + 3} fill={hover === p.sym ? "#e2e8f0" : "#94a3b8"} fontSize={hover === p.sym ? 11 : 9} fontFamily="monospace">{p.name}</text>
            {hover === p.sym && (
              <text x={sx(p.x) + 8} y={sy(p.y) + 15} fill="#64748b" fontSize={9} fontFamily="monospace">
                M {p.x >= 0 ? "+" : ""}{p.x.toFixed(1)} · E {p.y >= 0 ? "+" : ""}{p.y.toFixed(1)} · T {p.total >= 0 ? "+" : ""}{p.total.toFixed(1)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="text-[9px] text-muted-foreground">
        Each dot = one symbol's {winLabel} move split into multiple (x) vs estimate (y) contribution. On the diagonal x=y the move is evenly driven; click a dot to open it in Single Ticker view.
      </div>
    </div>
  );
}
