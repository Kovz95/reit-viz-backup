// Principal Component Analysis over the filtered REIT cross-section.
//
// Four modes in one page (see lib/pca.ts for the math):
//   factors      — PCA of daily-return cross-section (PC1 ≈ market factor)
//   clustering   — tickers grouped by their position in loading space
//   residual     — factor model → idiosyncratic residuals + AR(1) half-life
//   fundamentals — PCA of a valuation/growth/yield metric snapshot
//
// Universe = useUniverse().filteredTickersList (respects the global class /
// nation / exchange / ADV filters + exclusions). Charts reuse the app's existing
// idioms: canvas 2D scatter (à la Pairs.OlsScatterChart), recharts scree,
// lightweight-charts factor pane, CSS-table loadings heatmap (à la
// Correlation.HeatmapMatrix).

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createChart, ColorType, CrosshairMode, LineSeries } from "lightweight-charts";
import type { Time, LineWidth } from "lightweight-charts";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Maximize2, Minimize2, Play, X } from "lucide-react";
import { getTickers } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import { usePersistedState } from "@/lib/persistedState";
import {
  buildPriceMatrix,
  alignAndClean,
  toLogReturns,
  computePCA,
  clusterLoadings,
  factorModelResiduals,
  buildFundamentalsMatrix,
  type PcaResult,
  type PcaStandardizeMode,
  type ResidualRow,
} from "@/lib/pca";

// ── Constants ──

type PcaMode = "factors" | "clustering" | "residual" | "fundamentals";

const MODES: { value: PcaMode; label: string; hint: string }[] = [
  { value: "factors", label: "Factors", hint: "Latent factors in daily returns (PC1 ≈ market)" },
  { value: "clustering", label: "Clustering", hint: "Group tickers by co-movement in loading space" },
  { value: "residual", label: "Residual", hint: "Factor model → idiosyncratic mean-reversion candidates" },
  { value: "fundamentals", label: "Fundamentals", hint: "PCA of a valuation / growth / yield snapshot" },
];

// Candidate fundamentals for mode 4 — filtered on mount to those the workbook
// actually carries.
const DEFAULT_FUNDAMENTAL_METRICS = [
  "P/E FY2",
  "P/FFO FY2",
  "P/AFFO FY2",
  "EV/EBITDA FY2",
  "Dividend Yield",
  "FFO Yield FY2",
  "AFFO Yield FY2",
  "Implied Cap Rate",
  "1Y Price Chg%",
  "% off 52wk High",
];

const PALETTE = [
  "#0ea5e9", "#f59e0b", "#22c55e", "#ef4444", "#a855f7", "#14b8a6",
  "#eab308", "#ec4899", "#6366f1", "#84cc16", "#f97316", "#06b6d4",
  "#d946ef", "#10b981", "#f43f5e", "#8b5cf6",
];

const CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid as const, color: "transparent" },
    textColor: "#7a8a9e",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
  },
  grid: {
    vertLines: { color: "rgba(255,255,255,0.04)" },
    horzLines: { color: "rgba(255,255,255,0.04)" },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: "rgba(255,255,255,0.1)", minimumWidth: 70 },
  timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: false },
  handleScale: false as const,
  handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
};

// ── Result shape held after a run ──

interface PcaRun {
  mode: PcaMode;
  pca: PcaResult;
  obsDates: string[]; // observation dates for factor series (empty in fundamentals)
  pointLabels: string[]; // scatter point labels (tickers)
  pointX: number[]; // PC1 coordinate per point
  pointY: number[]; // PC2 coordinate per point
  colorKey: string[]; // sector (or cluster label) per point → color
  clusters?: number[];
  residuals?: ResidualRow[];
  numComponents: number;
  dropped: string[];
}

// ── Color helpers ──

function buildColorMap(keys: string[]): Record<string, string> {
  const uniq = Array.from(new Set(keys)).sort();
  const map: Record<string, string> = {};
  uniq.forEach((k, i) => (map[k] = PALETTE[i % PALETTE.length]));
  return map;
}

// ════════════════════════════════════════════════════════════════════════════
// Panel shell
// ════════════════════════════════════════════════════════════════════════════

function Panel({
  title,
  id,
  maximized,
  onMaximize,
  children,
}: {
  title: string;
  id: string;
  maximized: string | null;
  onMaximize: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const isMax = maximized === id;
  return (
    <div
      className={`flex flex-col ${
        isMax
          ? "fixed inset-0 z-50 bg-background"
          : "w-full h-full border border-border/30 min-h-0 overflow-hidden rounded"
      }`}
      onDoubleClick={() => onMaximize(isMax ? null : id)}
    >
      <div className="flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onMaximize(isMax ? null : id);
          }}
          title={isMax ? "Restore" : "Maximize"}
        >
          {isMax ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </Button>
      </div>
      <div className="flex-1 min-h-0 relative">{children}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PC1 / PC2 scatter (canvas)
// ════════════════════════════════════════════════════════════════════════════

function ScatterPanel({
  labels,
  xs,
  ys,
  colorKeys,
  colorMap,
  xLabel,
  yLabel,
}: {
  labels: string[];
  xs: number[];
  ys: number[];
  colorKeys: string[];
  colorMap: Record<string, string>;
  xLabel: string;
  yLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizeKey, setResizeKey] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setResizeKey((k) => k + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || labels.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, w, h);

    const margin = { top: 16, right: 16, bottom: 34, left: 48 };
    const pw = w - margin.left - margin.right;
    const ph = h - margin.top - margin.bottom;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < labels.length; i++) {
      if (xs[i] < minX) minX = xs[i];
      if (xs[i] > maxX) maxX = xs[i];
      if (ys[i] < minY) minY = ys[i];
      if (ys[i] > maxY) maxY = ys[i];
    }
    const padX = (maxX - minX) * 0.08 || 0.01;
    const padY = (maxY - minY) * 0.08 || 0.01;
    minX -= padX; maxX += padX; minY -= padY; maxY += padY;
    const toX = (v: number) => margin.left + ((v - minX) / (maxX - minX)) * pw;
    const toY = (v: number) => margin.top + ph - ((v - minY) / (maxY - minY)) * ph;

    // Grid + zero lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (ph / 4) * i;
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
      const x = margin.left + (pw / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + ph); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    if (minX < 0 && maxX > 0) {
      const x0 = toX(0);
      ctx.beginPath(); ctx.moveTo(x0, margin.top); ctx.lineTo(x0, margin.top + ph); ctx.stroke();
    }
    if (minY < 0 && maxY > 0) {
      const y0 = toY(0);
      ctx.beginPath(); ctx.moveTo(margin.left, y0); ctx.lineTo(w - margin.right, y0); ctx.stroke();
    }

    // Points + labels
    ctx.font = "9px 'JetBrains Mono', monospace";
    for (let i = 0; i < labels.length; i++) {
      const px = toX(xs[i]);
      const py = toY(ys[i]);
      ctx.fillStyle = colorMap[colorKeys[i]] || "#94a3b8";
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(224,224,224,0.7)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(labels[i], px + 5, py);
    }

    // Axis labels
    ctx.fillStyle = "#7a8a9e";
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(xLabel, margin.left + pw / 2, h - 4);
    ctx.save();
    ctx.translate(11, margin.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "top";
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }, [labels, xs, ys, colorKeys, colorMap, xLabel, yLabel, resizeKey]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Factor time series (lightweight-charts)
// ════════════════════════════════════════════════════════════════════════════

function FactorTimeSeries({
  series,
}: {
  series: { name: string; color: string; data: { time: string; value: number }[] }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || series.length === 0) return;
    const chart = createChart(el, {
      ...CHART_OPTIONS,
      width: el.clientWidth,
      height: el.clientHeight || 240,
    });
    for (const s of series) {
      const line = chart.addSeries(LineSeries, {
        color: s.color,
        lineWidth: 1.5 as LineWidth,
        priceLineVisible: false,
        lastValueVisible: true,
        title: s.name,
        crosshairMarkerRadius: 3,
      });
      line.setData(s.data.map((d) => ({ time: d.time as Time, value: d.value })));
    }
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight || 240 });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [series]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

// ════════════════════════════════════════════════════════════════════════════
// Loadings heatmap (CSS table)
// ════════════════════════════════════════════════════════════════════════════

function loadingBg(val: number): string {
  const a = Math.min(1, Math.abs(val)) * 0.5;
  if (val > 0) return `rgba(34, 197, 94, ${a})`;
  if (val < 0) return `rgba(239, 68, 68, ${a})`;
  return "transparent";
}

function LoadingsHeatmap({
  rowLabels,
  numComponents,
  loadings,
  varianceExplained,
}: {
  rowLabels: string[];
  numComponents: number;
  loadings: number[][]; // variables × components
  varianceExplained: number[];
}) {
  const comps = Math.min(numComponents, varianceExplained.length);
  return (
    <div className="absolute inset-0 overflow-auto p-1">
      <table className="text-[10px] font-mono border-collapse">
        <thead>
          <tr>
            <th className="p-1 border border-border/30 bg-card/50 sticky left-0 z-10" />
            {Array.from({ length: comps }, (_, c) => (
              <th key={c} className="p-1 border border-border/30 bg-card/50 text-muted-foreground whitespace-nowrap">
                PC{c + 1}
                <span className="block text-[8px] text-muted-foreground/60">
                  {(varianceExplained[c] * 100).toFixed(1)}%
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((label, i) => (
            <tr key={i}>
              <td
                className="p-1 border border-border/30 bg-card/50 font-semibold text-muted-foreground whitespace-nowrap sticky left-0 z-10"
                title={label}
              >
                {label}
              </td>
              {Array.from({ length: comps }, (_, c) => {
                const val = loadings[i]?.[c] ?? 0;
                return (
                  <td
                    key={c}
                    className="p-1 border border-border/30 text-center"
                    style={{ backgroundColor: loadingBg(val) }}
                    title={`${label} · PC${c + 1}: ${val.toFixed(4)}`}
                  >
                    {val.toFixed(2)}
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

// ════════════════════════════════════════════════════════════════════════════
// Residual table (mode 3)
// ════════════════════════════════════════════════════════════════════════════

function ResidualTable({
  residuals,
  numFactors,
  selected,
  onSelect,
}: {
  residuals: ResidualRow[];
  numFactors: number;
  selected: string;
  onSelect: (t: string) => void;
}) {
  const [sortKey, setSortKey] = useState<"z" | "halfLife">("z");
  const sorted = useMemo(() => {
    const rows = [...residuals];
    if (sortKey === "z") rows.sort((a, b) => Math.abs(b.residualZ) - Math.abs(a.residualZ));
    else rows.sort((a, b) => a.halfLife - b.halfLife);
    return rows;
  }, [residuals, sortKey]);

  return (
    <div className="absolute inset-0 overflow-auto">
      <table className="w-full text-[10px] font-mono">
        <thead className="sticky top-0 bg-card">
          <tr className="text-muted-foreground">
            <th className="p-1 text-left">Ticker</th>
            <th
              className="p-1 text-right cursor-pointer hover:text-foreground"
              onClick={() => setSortKey("z")}
            >
              Resid Z {sortKey === "z" ? "▾" : ""}
            </th>
            <th
              className="p-1 text-right cursor-pointer hover:text-foreground"
              onClick={() => setSortKey("halfLife")}
            >
              Half-life {sortKey === "halfLife" ? "▾" : ""}
            </th>
            {Array.from({ length: numFactors }, (_, c) => (
              <th key={c} className="p-1 text-right">β{c + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.ticker}
              className={`cursor-pointer hover:bg-primary/10 ${r.ticker === selected ? "bg-primary/20" : ""}`}
              onClick={() => onSelect(r.ticker)}
            >
              <td className="p-1 font-semibold">{r.ticker}</td>
              <td
                className="p-1 text-right"
                style={{ color: Math.abs(r.residualZ) >= 2 ? "#f59e0b" : "#94a3b8" }}
              >
                {r.residualZ.toFixed(2)}
              </td>
              <td className="p-1 text-right text-muted-foreground">
                {Number.isFinite(r.halfLife) ? r.halfLife.toFixed(0) : "∞"}
              </td>
              {Array.from({ length: numFactors }, (_, c) => (
                <td key={c} className="p-1 text-right text-muted-foreground/70">
                  {(r.betas[c] ?? 0).toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Page
// ════════════════════════════════════════════════════════════════════════════

export default function PCA() {
  const { filteredTickersList } = useUniverse();

  const [mode, setMode] = usePersistedState<PcaMode>("pca.mode", "factors");
  const [minObs, setMinObs] = usePersistedState<number>("pca.minObs", 120);
  const [numComponents, setNumComponents] = usePersistedState<number>("pca.numComponents", 3);
  const [standardizeMode, setStandardizeMode] = usePersistedState<PcaStandardizeMode>(
    "pca.standardize",
    "correlation",
  );
  const [kClusters, setKClusters] = usePersistedState<number>("pca.kClusters", 4);
  const [selectedMetrics, setSelectedMetrics] = usePersistedState<string[]>(
    "pca.metrics",
    DEFAULT_FUNDAMENTAL_METRICS.slice(0, 6),
  );

  const [availableMetrics, setAvailableMetrics] = useState<string[]>(DEFAULT_FUNDAMENTAL_METRICS);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PcaRun | null>(null);
  const [maximized, setMaximized] = useState<string | null>(null);
  const [residualTicker, setResidualTicker] = useState<string>("");
  const cancelRef = useRef(false);

  // Discover which candidate fundamentals the workbook actually carries.
  useEffect(() => {
    getTickers().then((ts) => {
      const metricSet = new Set<string>();
      for (const t of ts) {
        const ms = (t as any).metrics as (string | { name: string })[] | undefined;
        if (ms) for (const m of ms) metricSet.add(typeof m === "string" ? m : m.name);
      }
      const present = DEFAULT_FUNDAMENTAL_METRICS.filter((m) => metricSet.has(m));
      if (present.length > 0) {
        setAvailableMetrics(present);
        setSelectedMetrics((prev) => {
          const filtered = prev.filter((m) => present.includes(m));
          return filtered.length >= 2 ? filtered : present.slice(0, 6);
        });
      }
    });
  }, [setSelectedMetrics]);

  const universeTickers = useMemo(
    () => filteredTickersList.map((t) => t.ticker),
    [filteredTickersList],
  );
  const sectorByTicker = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of filteredTickersList) m[t.ticker] = (t as any).sector || "—";
    return m;
  }, [filteredTickersList]);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    cancelRef.current = false;
    try {
      const tickers = universeTickers;
      if (tickers.length < 3) throw new Error("Need at least 3 tickers in the universe.");

      if (mode === "fundamentals") {
        if (selectedMetrics.length < 2) throw new Error("Select at least 2 fundamental metrics.");
        setProgress({ current: 0, total: 1 });
        const fm = await buildFundamentalsMatrix(tickers, selectedMetrics);
        if (fm.rowLabels.length < 3) throw new Error("Too few tickers with complete fundamentals.");
        const pca = computePCA(
          { rowLabels: fm.rowLabels, colLabels: fm.colLabels, matrix: fm.matrix },
          { mode: "correlation", maxComponents: Math.min(fm.colLabels.length, 10) },
        );
        // Scatter = tickers projected onto scores; loadings heatmap rows = metrics.
        setResult({
          mode,
          pca,
          obsDates: [],
          pointLabels: fm.rowLabels,
          pointX: pca.scores.map((s) => s[0] ?? 0),
          pointY: pca.scores.map((s) => s[1] ?? 0),
          colorKey: fm.rowLabels.map((t) => fm.sectorByTicker[t] || "—"),
          numComponents,
          dropped: fm.dropped,
        });
        setProgress({ current: 1, total: 1 });
        return;
      }

      // Return-based modes (factors / clustering / residual).
      setProgress({ current: 0, total: tickers.length });
      const pm = await buildPriceMatrix(tickers, "close", (d, t) => {
        if (!cancelRef.current) setProgress({ current: d, total: t });
      });
      if (cancelRef.current) return;
      const cleaned = alignAndClean(pm, minObs);
      if (cleaned.tickers.length < 2) throw new Error("Too few tickers with sufficient price history.");
      if (cleaned.prices.length < numComponents + 2) {
        throw new Error("Not enough observations for the requested components.");
      }
      const returns = toLogReturns(cleaned.prices);
      const obsDates = cleaned.dates.slice(1);
      const pca = computePCA(
        { rowLabels: obsDates, colLabels: cleaned.tickers, matrix: returns },
        { mode: standardizeMode, maxComponents: Math.min(cleaned.tickers.length, 10) },
      );

      let clusters: number[] | undefined;
      let colorKey: string[];
      if (mode === "clustering") {
        clusters = clusterLoadings(pca.loadings, Math.max(2, numComponents), kClusters);
        colorKey = clusters.map((c) => `Cluster ${c + 1}`);
      } else {
        colorKey = cleaned.tickers.map((t) => sectorByTicker[t] || "—");
      }

      let residuals: ResidualRow[] | undefined;
      if (mode === "residual") {
        residuals = factorModelResiduals(returns, pca.scores, numComponents, cleaned.tickers);
        const top = [...residuals].sort((a, b) => Math.abs(b.residualZ) - Math.abs(a.residualZ))[0];
        if (top) setResidualTicker(top.ticker);
      }

      setResult({
        mode,
        pca,
        obsDates,
        pointLabels: cleaned.tickers,
        pointX: pca.loadings.map((l) => l[0] ?? 0),
        pointY: pca.loadings.map((l) => l[1] ?? 0),
        colorKey,
        clusters,
        residuals,
        numComponents,
        dropped: cleaned.dropped,
      });
    } catch (e: any) {
      setError(e?.message || "PCA run failed.");
    } finally {
      setRunning(false);
    }
  }, [
    mode,
    universeTickers,
    minObs,
    numComponents,
    standardizeMode,
    kClusters,
    selectedMetrics,
    sectorByTicker,
  ]);

  const colorMap = useMemo(
    () => (result ? buildColorMap(result.colorKey) : {}),
    [result],
  );

  // Factor time-series lines.
  const factorSeries = useMemo(() => {
    if (!result || result.mode === "fundamentals") return [];
    if (result.mode === "residual") {
      const r = result.residuals?.find((x) => x.ticker === residualTicker) || result.residuals?.[0];
      if (!r) return [];
      return [
        {
          name: `${r.ticker} residual`,
          color: "#f59e0b",
          data: result.obsDates.map((time, i) => ({ time, value: r.residualCum[i] })),
        },
      ];
    }
    const k = Math.min(result.numComponents, result.pca.scores[0]?.length ?? 0);
    const lines: { name: string; color: string; data: { time: string; value: number }[] }[] = [];
    for (let c = 0; c < k; c++) {
      let acc = 0;
      const data = result.obsDates.map((time, i) => {
        acc += result.pca.scores[i][c];
        return { time, value: acc };
      });
      lines.push({ name: `PC${c + 1}`, color: PALETTE[c % PALETTE.length], data });
    }
    return lines;
  }, [result, residualTicker]);

  // Scree chart data.
  const screeData = useMemo(() => {
    if (!result) return [];
    return result.pca.varianceExplained.map((ve, i) => ({
      name: `PC${i + 1}`,
      variance: +(ve * 100).toFixed(2),
      cumulative: +(result.pca.cumulativeVariance[i] * 100).toFixed(2),
    }));
  }, [result]);

  // Heatmap rows: metrics for fundamentals, tickers otherwise.
  const heatmapRows = result
    ? result.mode === "fundamentals"
      ? result.pca.variables
      : result.pca.variables
    : [];

  const activeMode = MODES.find((m) => m.value === mode)!;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header / controls */}
      <div className="flex-shrink-0 px-4 pt-2 pb-2 border-b border-border bg-card flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-bold text-foreground tracking-tight">PCA</h2>
        <div className="flex gap-px">
          {MODES.map((m) => (
            <button
              key={m.value}
              data-testid={`pca-mode-${m.value}`}
              className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${
                mode === m.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground border border-border"
              }`}
              onClick={() => setMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground hidden md:inline">{activeMode.hint}</span>

        <div className="flex items-center gap-3 ml-auto">
          {mode !== "fundamentals" && (
            <label className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              Min obs
              <Input
                type="number"
                value={minObs}
                onChange={(e) => setMinObs(Math.max(20, parseInt(e.target.value) || 20))}
                className="h-6 w-16 text-[10px] font-mono"
              />
            </label>
          )}
          <label className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            {mode === "residual" ? "Factors" : "Components"}
            <Input
              type="number"
              value={numComponents}
              onChange={(e) => setNumComponents(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              className="h-6 w-14 text-[10px] font-mono"
            />
          </label>
          {mode === "clustering" && (
            <label className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              Clusters
              <Input
                type="number"
                value={kClusters}
                onChange={(e) => setKClusters(Math.max(2, Math.min(12, parseInt(e.target.value) || 2)))}
                className="h-6 w-14 text-[10px] font-mono"
              />
            </label>
          )}
          {mode !== "fundamentals" && (
            <div className="flex gap-0.5">
              {(["correlation", "covariance"] as PcaStandardizeMode[]).map((sm) => (
                <button
                  key={sm}
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    standardizeMode === sm
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground border border-border hover:text-foreground"
                  }`}
                  onClick={() => setStandardizeMode(sm)}
                >
                  {sm === "correlation" ? "corr" : "cov"}
                </button>
              ))}
            </div>
          )}
          <Button
            size="sm"
            className="h-6 text-[10px] gap-1"
            disabled={running}
            onClick={() => {
              if (running) cancelRef.current = true;
              else run();
            }}
            data-testid="pca-run"
          >
            {running ? (
              <>
                <X className="w-3 h-3" /> {progress.current}/{progress.total}
              </>
            ) : (
              <>
                <Play className="w-3 h-3" /> Run
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Fundamentals metric picker */}
      {mode === "fundamentals" && (
        <div className="flex-shrink-0 px-4 py-1.5 border-b border-border/50 bg-background flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1">Metrics</span>
          {availableMetrics.map((m) => {
            const on = selectedMetrics.includes(m);
            return (
              <button
                key={m}
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                  on
                    ? "bg-primary/20 text-foreground border-primary/50"
                    : "bg-background text-muted-foreground border-border hover:text-foreground"
                }`}
                onClick={() =>
                  setSelectedMetrics((prev) =>
                    prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
                  )
                }
              >
                {m}
              </button>
            );
          })}
        </div>
      )}

      {running && progress.total > 0 && (
        <div className="flex-shrink-0 h-0.5 bg-border">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto p-2">
        {error && (
          <div className="m-2 p-3 rounded border border-red-500/40 bg-red-500/10 text-red-300 text-xs font-mono">
            {error}
          </div>
        )}

        {!result && !error && (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xs font-mono">
            {running ? "Loading price history…" : `Run PCA over ${universeTickers.length} tickers in the universe.`}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-2 h-full min-h-0">
            {result.dropped.length > 0 && (
              <div className="text-[10px] font-mono text-muted-foreground">
                Excluded {result.dropped.length} ticker{result.dropped.length > 1 ? "s" : ""} (insufficient
                data): {result.dropped.slice(0, 20).join(", ")}
                {result.dropped.length > 20 ? "…" : ""}
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-2 text-[9px] font-mono">
              {Object.entries(colorMap).map(([key, color]) => (
                <span key={key} className="flex items-center gap-1 text-muted-foreground">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
                  {key}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 flex-1 min-h-0" style={{ minHeight: 520 }}>
              <div className="min-h-[240px]">
                <Panel
                  title={`PC1 / PC2 ${result.mode === "fundamentals" ? "scores" : "loadings"}`}
                  id="scatter"
                  maximized={maximized}
                  onMaximize={setMaximized}
                >
                  <ScatterPanel
                    labels={result.pointLabels}
                    xs={result.pointX}
                    ys={result.pointY}
                    colorKeys={result.colorKey}
                    colorMap={colorMap}
                    xLabel={`PC1 (${(result.pca.varianceExplained[0] * 100).toFixed(1)}%)`}
                    yLabel={`PC2 (${((result.pca.varianceExplained[1] ?? 0) * 100).toFixed(1)}%)`}
                  />
                </Panel>
              </div>

              <div className="min-h-[240px]">
                <Panel title="Scree — variance explained" id="scree" maximized={maximized} onMaximize={setMaximized}>
                  <div className="absolute inset-0 p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={screeData} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#7a8a9e" }} />
                        <YAxis tick={{ fontSize: 9, fill: "#7a8a9e" }} />
                        <Tooltip
                          contentStyle={{
                            background: "#0d1117",
                            border: "1px solid rgba(255,255,255,0.1)",
                            fontSize: 10,
                            fontFamily: "monospace",
                          }}
                        />
                        <Bar dataKey="variance" name="Variance %">
                          {screeData.map((_, i) => (
                            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                          ))}
                        </Bar>
                        <Line
                          type="monotone"
                          dataKey="cumulative"
                          name="Cumulative %"
                          stroke="#e0e0e0"
                          strokeWidth={1.5}
                          dot={{ r: 2 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </div>

              {result.mode !== "fundamentals" && (
                <div className="min-h-[240px]">
                  <Panel
                    title={result.mode === "residual" ? "Residual (cumulative)" : "Factor time series (cumulative scores)"}
                    id="factors"
                    maximized={maximized}
                    onMaximize={setMaximized}
                  >
                    <FactorTimeSeries series={factorSeries} />
                  </Panel>
                </div>
              )}

              <div className="min-h-[240px]">
                <Panel title="Loadings heatmap" id="heatmap" maximized={maximized} onMaximize={setMaximized}>
                  <LoadingsHeatmap
                    rowLabels={heatmapRows}
                    numComponents={result.numComponents}
                    loadings={result.pca.loadings}
                    varianceExplained={result.pca.varianceExplained}
                  />
                </Panel>
              </div>

              {result.mode === "residual" && result.residuals && (
                <div className="min-h-[240px] lg:col-span-2">
                  <Panel title="Idiosyncratic residuals (mean-reversion candidates)" id="residuals" maximized={maximized} onMaximize={setMaximized}>
                    <ResidualTable
                      residuals={result.residuals}
                      numFactors={result.numComponents}
                      selected={residualTicker}
                      onSelect={setResidualTicker}
                    />
                  </Panel>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
