// Reconstructed from recovered-bundle/Distributions-U9XjHz3w.js on 2026-06-11
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useBaskets } from "@/lib/useBaskets";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { fetchMetricSeries } from "@/lib/fetchMetricSeries";
import { CLASSIFICATION_KEYS } from "@/lib/classificationKeys";
import { Loader2 } from "lucide-react";
import { useUniverseDefaults } from "@/lib/universeDefaults";
import { P as PlayIcon } from "@/lib/play";
import { groupMetricsByCategory, DERIVED_METRICS } from "@/lib/metricCategories";

// Curated metrics always offered; unioned at runtime with the loaded universe.
const ALL_METRICS_BASE = [
  "close", "open", "high", "low",
  "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2",
  "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2",
  "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate",
  "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
  "Dividend Yield", "EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2",
  "AFFO FY1", "AFFO FY2", "EBITDA FY1", "EBITDA FY2", "Sales FY1", "Sales FY2",
  "EPS LTM", "FFO LTM", "AFFO LTM", "EBITDA LTM", "Sales LTM",
  "EPS FY0", "FFO FY0", "AFFO FY0", "Dividend", "Enterprise Value",
  "FY1 EPS Growth", "FY2 EPS Growth", "FY1 FFO Growth", "FY2 FFO Growth",
  "FY1 AFFO Growth", "FY2 AFFO Growth",
  "52wk High", "52wk Low", "% off 52wk High", "% off 52wk Low",
  "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
  "Short Interest%", "Buy Ratings", "Hold Ratings", "Sell Ratings", "Bull%", "Bear%",
];

const WINDOW_YEARS: Record<string, number | null> = {
  "1Y": 1, "3Y": 3, "5Y": 5, "All": null,
};

const MS_PER_DAY = 86400000;

function sliceByYears(series: { time: string; value: number }[], years: number | null) {
  if (!series.length || years === null) return series;
  const cutoff = new Date(series[series.length - 1].time).getTime() - years * 365 * MS_PER_DAY;
  let i = 0;
  while (i < series.length && new Date(series[i].time).getTime() < cutoff) i++;
  return series.slice(i);
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

interface DistResult {
  ticker: string;
  n: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  stdev: number;
  current: number;
  percentile: number;
  z: number;
  values: number[];
  hist: number[];
  binEdges: number[];
}

function computeDistStats(ticker: string, values: number[], current: number, bins: number): DistResult {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  const med = quantile(sorted, 0.5);
  const p25 = quantile(sorted, 0.25);
  const p75 = quantile(sorted, 0.75);
  let countBelow = 0;
  for (const v of values) if (v <= current) countBelow++;
  const percentile = countBelow / n;
  const z = stdev > 0 ? (current - mean) / stdev : 0;
  const hist = new Array(bins).fill(0);
  const binEdges = new Array(bins + 1);
  if (max === min) {
    for (let i = 0; i <= bins; i++) binEdges[i] = min + (i - bins / 2) * 1e-9;
    hist[Math.floor(bins / 2)] = n;
  } else {
    const step = (max - min) / bins;
    for (let i = 0; i <= bins; i++) binEdges[i] = min + i * step;
    for (const v of values) {
      let b = Math.floor((v - min) / step);
      if (b >= bins) b = bins - 1;
      if (b < 0) b = 0;
      hist[b]++;
    }
  }
  return { ticker, n, min, max, mean, median: med, p25, p75, stdev, current, percentile, z, values, hist, binEdges };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function tickerColor(ticker: string, alpha = 1): string {
  return `hsla(${hashStr(ticker) % 360}, 70%, 60%, ${alpha})`;
}

function zClass(z: number): string {
  return z < -1 ? "text-emerald-400" : z > 1 ? "text-red-400" : "text-foreground/80";
}

function fmtVal(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

function fmtPct(v: number): string {
  return Number.isFinite(v) ? `${(v * 100).toFixed(0)}%` : "—";
}

interface SmallCardProps { r: DistResult; }

function SmallCard({ r }: SmallCardProps) {
  const maxCount = Math.max(1, ...r.hist);
  const svgW = 212;
  const svgH = 92;
  const barW = svgW / r.hist.length;
  const range = r.max - r.min || 1;
  const currentX = 4 + ((r.current - r.min) / range) * svgW;
  return (
    <div className="border border-border/40 bg-card/30 rounded p-1.5 hover:border-border/70 transition-colors">
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono font-bold text-xs text-foreground">{r.ticker}</span>
          <span className="font-mono text-[10px] text-foreground/40">n={r.n}</span>
        </div>
        <span className={`font-mono text-xs ${zClass(r.z)}`}>{fmtVal(r.current)}</span>
      </div>
      <svg width="100%" height={100} viewBox={`0 0 220 100`} preserveAspectRatio="none" className="block">
        {r.hist.map((count, i) => {
          const barH = (count / maxCount) * svgH;
          return (
            <rect
              key={i}
              x={4 + i * barW}
              y={4 + (svgH - barH)}
              width={Math.max(0.5, barW - 0.5)}
              height={barH}
              fill="rgba(14,165,233,0.45)"
            />
          );
        })}
        <line x1={currentX} x2={currentX} y1={4} y2={4 + svgH} stroke="rgb(251 191 36)" strokeWidth={1.5} />
      </svg>
      <div className="flex items-center justify-between mt-0.5 font-mono text-[10px] text-foreground/50">
        <span>μ={fmtVal(r.mean)}</span>
        <span>σ={fmtVal(r.stdev)}</span>
        <span className={zClass(r.z)}>z={r.z.toFixed(2)}</span>
        <span>pct={fmtPct(r.percentile)}</span>
      </div>
    </div>
  );
}

interface SmallMultiplesViewProps { results: DistResult[]; }

function SmallMultiplesView({ results }: SmallMultiplesViewProps) {
  return (
    <div
      className="grid gap-2 p-2"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
    >
      {results.map(r => <SmallCard key={r.ticker} r={r} />)}
    </div>
  );
}

interface OverlayViewProps {
  results: DistResult[];
  hoverTicker: string | null;
  setHoverTicker: (t: string | null) => void;
  metric: string;
}

function OverlayView({ results, hoverTicker, setHoverTicker, metric }: OverlayViewProps) {
  const byAbsZ = useMemo(() => [...results].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)), [results]);
  const top30 = useMemo(() => new Set(byAbsZ.slice(0, 30).map(r => r.ticker)), [byAbsZ]);

  const allValues = useMemo(() => {
    const vals: number[] = [];
    for (const r of results) vals.push(r.min, r.p25, r.median, r.p75, r.max, r.current);
    vals.sort((a, b) => a - b);
    return vals;
  }, [results]);

  const xMin = quantile(allValues, 0.01);
  const xMax = quantile(allValues, 0.99);
  const xRange = xMax - xMin || 1;
  const padding = xRange * 0.02;
  const xMinP = xMin - padding;
  const xMaxP = xMax + padding;

  const SVG_W = 1200, SVG_H = 520;
  const leftPad = 50, rightPad = 200, topPad = 16, botPad = 36;
  const plotW = SVG_W - leftPad - rightPad;
  const plotH = SVG_H - topPad - botPad;
  const xRangeP = xMaxP - xMinP || 1;

  const toX = (v: number) => {
    const clamped = Math.max(xMinP, Math.min(xMaxP, v));
    return leftPad + ((clamped - xMinP) / xRangeP) * plotW;
  };

  const curves = useMemo(() => {
    let yMax = 0;
    const computed = results.map(r => {
      const step = (r.max - r.min) / r.hist.length;
      const pts = r.hist.map((count, i) => {
        const cx = r.binEdges[i] + step / 2;
        const density = r.n > 0 && step > 0 ? count / (r.n * step) : 0;
        if (density > yMax) yMax = density;
        return { x: toX(cx), y: density };
      });
      return { ticker: r.ticker, current: r.current, pts };
    });
    return { curves: computed, yMax: yMax || 1 };
  }, [results, xMinP, xMaxP]);

  const toY = (density: number) => topPad + plotH - (density / curves.yMax) * plotH;

  const xTicks: number[] = [];
  for (let i = 0; i <= 5; i++) xTicks.push(xMinP + (i / 5) * xRangeP);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="block">
          <line x1={leftPad} x2={leftPad + plotW} y1={topPad + plotH} y2={topPad + plotH} stroke="rgba(255,255,255,0.15)" />
          <line x1={leftPad} x2={leftPad} y1={topPad} y2={topPad + plotH} stroke="rgba(255,255,255,0.15)" />
          {xTicks.map((v, i) => (
            <g key={i}>
              <line x1={toX(v)} x2={toX(v)} y1={topPad + plotH} y2={topPad + plotH + 4} stroke="rgba(255,255,255,0.3)" />
              <text x={toX(v)} y={topPad + plotH + 16} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontFamily="ui-monospace, monospace">
                {fmtVal(v)}
              </text>
            </g>
          ))}
          <text x={leftPad + plotW / 2} y={SVG_H - 6} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontFamily="ui-monospace, monospace">{metric}</text>
          <text x={12} y={topPad + plotH / 2} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontFamily="ui-monospace, monospace" transform={`rotate(-90 12 ${topPad + plotH / 2})`}>density</text>
          {curves.curves.map(curve => {
            const isTop = top30.has(curve.ticker);
            const isHover = hoverTicker === curve.ticker;
            const isDimmed = hoverTicker !== null && !isHover;
            const color = isTop ? tickerColor(curve.ticker, 1) : "rgba(150,150,150,0.4)";
            const opacity = isDimmed ? 0.08 : isTop ? 0.65 : 0.18;
            const strokeColor = isTop ? tickerColor(curve.ticker, opacity) : `rgba(150,150,150,${opacity})`;
            const sw = isHover ? 2.5 : 1;
            const d = curve.pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${toY(pt.y).toFixed(1)}`).join(" ");
            return (
              <g key={curve.ticker}>
                <path d={d} fill="none" stroke={strokeColor} strokeWidth={sw} />
                <line
                  x1={toX(curve.current)} x2={toX(curve.current)}
                  y1={topPad + plotH} y2={topPad + plotH + 6}
                  stroke={isTop ? color : "rgba(150,150,150,0.4)"}
                  strokeWidth={isHover ? 2 : 1}
                  opacity={isDimmed ? 0.2 : 1}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="w-[200px] border-l border-border/40 bg-card/20 overflow-y-auto p-1 text-[11px] font-mono">
        <div className="px-1 py-0.5 text-foreground/40 uppercase tracking-wide text-[10px]">
          Top by |z| ({Math.min(30, byAbsZ.length)})
        </div>
        {byAbsZ.map(r => {
          const isTop = top30.has(r.ticker);
          return (
            <div
              key={r.ticker}
              onMouseEnter={() => setHoverTicker(r.ticker)}
              onMouseLeave={() => setHoverTicker(null)}
              className={`flex items-center gap-1.5 px-1 py-0.5 rounded cursor-pointer ${hoverTicker === r.ticker ? "bg-accent/40" : "hover:bg-accent/20"}`}
            >
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: isTop ? tickerColor(r.ticker, 1) : "rgba(150,150,150,0.5)" }} />
              <span className={isTop ? "text-foreground/90" : "text-foreground/40"}>{r.ticker}</span>
              <span className="ml-auto text-foreground/50">{r.z.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface BoxViewProps { results: DistResult[]; metric: string; }

function BoxView({ results, metric }: BoxViewProps) {
  const [tooltip, setTooltip] = useState<{ r: DistResult; x: number; y: number } | null>(null);
  const allValues = useMemo(() => {
    const vals: number[] = [];
    for (const r of results) vals.push(r.min, r.p25, r.median, r.p75, r.max, r.current);
    vals.sort((a, b) => a - b);
    return vals;
  }, [results]);
  const xMin = quantile(allValues, 0.01);
  const xMax = quantile(allValues, 0.99);
  const xRange = xMax - xMin || 1;
  const padding = xRange * 0.02;
  const xMinP = xMin - padding;
  const xMaxP = xMax + padding;
  const xRangeP = xMaxP - xMinP || 1;

  const LBL = 60, LBL_PAD = 12, RIGHT_PAD = 60, SVG_W = 1000, ROW_H = 18, TOP = 36;
  const plotW = SVG_W - LBL - LBL_PAD - RIGHT_PAD;
  const toX = (v: number) => {
    const clamped = Math.max(xMinP, Math.min(xMaxP, v));
    return LBL + LBL_PAD + ((clamped - xMinP) / xRangeP) * plotW;
  };

  const ticks: number[] = [];
  for (let i = 0; i <= 5; i++) ticks.push(xMinP + (i / 5) * xRangeP);
  const svgH = TOP + 12 + results.length * ROW_H;

  return (
    <div className="relative">
      <svg width="100%" viewBox={`0 0 ${SVG_W} ${svgH}`} className="block">
        <line x1={LBL + LBL_PAD} x2={LBL + LBL_PAD + plotW} y1={20} y2={20} stroke="rgba(255,255,255,0.15)" />
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={toX(v)} x2={toX(v)} y1={16} y2={20} stroke="rgba(255,255,255,0.3)" />
            <text x={toX(v)} y={12} fontSize={10} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontFamily="ui-monospace, monospace">{fmtVal(v)}</text>
          </g>
        ))}
        <text x={SVG_W - RIGHT_PAD + 4} y={12} fontSize={9} fill="rgba(255,255,255,0.4)" fontFamily="ui-monospace, monospace">{metric}</text>
        {results.map((r, i) => {
          const rowY = TOP + i * ROW_H;
          const midY = rowY + ROW_H / 2;
          const x1 = toX(r.p25), x2 = toX(r.p75), medX = toX(r.median);
          const minX = toX(r.min), maxX = toX(r.max), curX = toX(r.current);
          const color = tickerColor(r.ticker, 1);
          const dotColor = Math.abs(r.z) > 1 ? (r.z > 0 ? "rgb(248 113 113)" : "rgb(52 211 153)") : "rgb(251 191 36)";
          return (
            <g
              key={r.ticker}
              onMouseEnter={e => {
                const svgEl = (e.currentTarget as SVGElement).ownerSVGElement!;
                const rect = svgEl.getBoundingClientRect();
                setTooltip({ r, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseMove={e => {
                const svgEl = (e.currentTarget as SVGElement).ownerSVGElement!;
                const rect = svgEl.getBoundingClientRect();
                setTooltip({ r, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: "pointer" }}
            >
              <rect x={0} y={rowY} width={SVG_W} height={ROW_H} fill="transparent" />
              <text x={LBL + 4} y={midY + 3} fontSize={11} textAnchor="end" fill="rgba(255,255,255,0.85)" fontFamily="ui-monospace, monospace">{r.ticker}</text>
              <line x1={minX} x2={maxX} y1={midY} y2={midY} stroke="rgba(255,255,255,0.35)" />
              <line x1={minX} x2={minX} y1={midY - 4} y2={midY + 4} stroke="rgba(255,255,255,0.35)" />
              <line x1={maxX} x2={maxX} y1={midY - 4} y2={midY + 4} stroke="rgba(255,255,255,0.35)" />
              <rect x={x1} y={rowY + 3} width={Math.max(1, x2 - x1)} height={ROW_H - 6} fill={tickerColor(r.ticker, 0.25)} stroke={color} strokeWidth={1} />
              <line x1={medX} x2={medX} y1={rowY + 3} y2={rowY + ROW_H - 3} stroke="white" strokeWidth={1.5} />
              <circle cx={curX} cy={midY} r={3.5} fill={dotColor} stroke="rgba(0,0,0,0.6)" strokeWidth={0.5} />
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-popover border border-border/60 rounded shadow-lg px-2 py-1.5 text-[11px] font-mono z-10"
          style={{ left: Math.min(tooltip.x + 12, 800), top: tooltip.y + 12 }}
        >
          <div className="font-bold text-foreground mb-0.5">{tooltip.r.ticker}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0 text-foreground/70">
            <span>n</span><span className="text-right text-foreground">{tooltip.r.n}</span>
            <span>current</span><span className={`text-right ${zClass(tooltip.r.z)}`}>{fmtVal(tooltip.r.current)}</span>
            <span>median</span><span className="text-right text-foreground">{fmtVal(tooltip.r.median)}</span>
            <span>p25–p75</span><span className="text-right text-foreground">{fmtVal(tooltip.r.p25)} – {fmtVal(tooltip.r.p75)}</span>
            <span>min/max</span><span className="text-right text-foreground">{fmtVal(tooltip.r.min)} – {fmtVal(tooltip.r.max)}</span>
            <span>μ / σ</span><span className="text-right text-foreground">{fmtVal(tooltip.r.mean)} / {fmtVal(tooltip.r.stdev)}</span>
            <span>z</span><span className={`text-right ${zClass(tooltip.r.z)}`}>{tooltip.r.z.toFixed(2)}</span>
            <span>pct</span><span className="text-right text-foreground">{fmtPct(tooltip.r.percentile)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Distributions() {
  const { available, valuationMetric } = useUniverseDefaults();
  const metricLockedRef = useRef(false);
  const [selectedMetric, setSelectedMetric] = useState(valuationMetric);

  useEffect(() => {
    if (!metricLockedRef.current && available.size !== 0 && !available.has(selectedMetric)) {
      setSelectedMetric(valuationMetric);
    }
  }, [available, valuationMetric, selectedMetric]);

  const [universeMode, setUniverseMode] = useState("workbook");
  const [selectedBasket, setSelectedBasket] = useState("");
  const [classKey, setClassKey] = useState("sector");
  const [classValue, setClassValue] = useState("");
  const [windowKey, setWindowKey] = useState("All");
  const [view, setView] = useState("small");
  const [bins, setBins] = useState(30);
  const [sortKey, setSortKey] = useState("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [allTickers, setAllTickers] = useState<any[]>([]);
  const metricGroups = useMemo(() => {
    const s = new Set<string>([...ALL_METRICS_BASE, ...DERIVED_METRICS]);
    for (const t of allTickers) for (const m of (t.metrics || [])) s.add(m);
    return groupMetricsByCategory([...s]);
  }, [allTickers]);
  const { baskets } = useBaskets();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [results, setResults] = useState<DistResult[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [hoverTicker, setHoverTicker] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const autoRunRef = useRef(false);

  useEffect(() => {
    fetchWorkbookTickers().then((t: any[]) => setAllTickers(t)).catch(() => setAllTickers([]));
  }, []);

  const classValues = useMemo(() => {
    const s = new Set<string>();
    for (const t of allTickers) { const v = t[classKey]; if (v) s.add(String(v)); }
    return [...s].sort();
  }, [allTickers, classKey]);

  useEffect(() => {
    if (universeMode === "classification" && classValues.length && !classValues.includes(classValue)) {
      setClassValue(classValues[0]);
    }
  }, [universeMode, classValues, classValue]);

  useEffect(() => {
    if (universeMode === "basket" && baskets.length && !baskets.find(b => b.id === selectedBasket)) {
      setSelectedBasket(baskets[0].id);
    }
  }, [universeMode, baskets, selectedBasket]);

  const universeTickers = useMemo(() => {
    if (universeMode === "workbook") return allTickers.map(t => t.ticker);
    if (universeMode === "basket") {
      const b = baskets.find(b => b.id === selectedBasket);
      return b ? b.tickers : [];
    }
    return allTickers.filter(t => String(t[classKey] ?? "") === classValue).map(t => t.ticker);
  }, [universeMode, allTickers, baskets, selectedBasket, classKey, classValue]);

  const runAnalysis = useCallback(async () => {
    const runId = ++runIdRef.current;
    setRunning(true);
    setResults([]);
    setSkipped([]);
    const tickers = [...universeTickers];
    setProgress({ done: 0, total: tickers.length, current: "" });
    const years = WINDOW_YEARS[windowKey];
    const computed: DistResult[] = [];
    const missed: string[] = [];
    for (let i = 0; i < tickers.length; i++) {
      if (runIdRef.current !== runId) return;
      const ticker = tickers[i];
      setProgress({ done: i, total: tickers.length, current: ticker });
      try {
        const series = await fetchMetricSeries(ticker, selectedMetric);
        const sliced = sliceByYears(series, years);
        const vals: number[] = [];
        for (const pt of sliced) {
          if (pt.value != null && Number.isFinite(pt.value)) vals.push(pt.value);
        }
        if (vals.length < 5) { missed.push(ticker); continue; }
        let current = NaN;
        for (let j = sliced.length - 1; j >= 0; j--) {
          if (sliced[j].value != null && Number.isFinite(sliced[j].value)) {
            current = sliced[j].value; break;
          }
        }
        if (!Number.isFinite(current)) { missed.push(ticker); continue; }
        computed.push(computeDistStats(ticker, vals, current, bins));
      } catch {
        missed.push(ticker);
      }
    }
    if (runIdRef.current === runId) {
      setResults(computed);
      setSkipped(missed);
      setProgress({ done: tickers.length, total: tickers.length, current: "" });
      setRunning(false);
    }
  }, [universeTickers, selectedMetric, windowKey, bins]);

  useEffect(() => {
    if (!autoRunRef.current && allTickers.length > 0 && universeTickers.length > 0) {
      autoRunRef.current = true;
      runAnalysis();
    }
  }, [allTickers.length, universeTickers, runAnalysis]);

  const sortedResults = useMemo(() => {
    const copy = [...results];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "ticker": diff = a.ticker.localeCompare(b.ticker); break;
        case "current": diff = a.current - b.current; break;
        case "percentile": diff = a.percentile - b.percentile; break;
        case "z": diff = a.z - b.z; break;
        case "median": diff = a.median - b.median; break;
      }
      return diff * dir;
    });
    return copy;
  }, [results, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "ticker" ? "asc" : "desc"); }
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <div className="flex-shrink-0 border-b border-border/40 bg-card/40">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
          <label className="flex items-center gap-1.5 text-foreground/60">
            <span className="font-mono uppercase tracking-wide">Metric</span>
            <select
              value={selectedMetric}
              onChange={e => { metricLockedRef.current = true; setSelectedMetric(e.target.value); }}
              className="bg-background border border-border/40 rounded px-2 py-0.5 font-mono text-foreground"
              data-testid="dist-metric"
            >
              {metricGroups.map(({ category, metrics }) => (
                <optgroup key={category} label={category}>
                  {metrics.map(m => <option key={m} value={m}>{m}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1 border-l border-border/30 pl-2 ml-1">
            <span className="text-foreground/60 font-mono uppercase tracking-wide">Universe</span>
            <div className="flex rounded border border-border/40 overflow-hidden">
              {["workbook", "basket", "classification"].map(m => (
                <button
                  key={m}
                  onClick={() => setUniverseMode(m)}
                  className={`px-2 py-0.5 font-mono text-[11px] ${universeMode === m ? "bg-amber-500/15 text-amber-200" : "text-foreground/60 hover:bg-accent"}`}
                  data-testid={`dist-universe-${m}`}
                >
                  {m === "workbook" ? "All" : m === "basket" ? "Basket" : "Class"}
                </button>
              ))}
            </div>
            {universeMode === "basket" && (
              <select
                value={selectedBasket}
                onChange={e => setSelectedBasket(e.target.value)}
                className="bg-background border border-border/40 rounded px-2 py-0.5 font-mono"
              >
                {baskets.length === 0 && <option value="">(no baskets)</option>}
                {baskets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {universeMode === "classification" && (
              <>
                <select
                  value={classKey}
                  onChange={e => setClassKey(e.target.value)}
                  className="bg-background border border-border/40 rounded px-2 py-0.5 font-mono"
                >
                  {CLASSIFICATION_KEYS.map((k: string) => <option key={k} value={k}>{k}</option>)}
                </select>
                <select
                  value={classValue}
                  onChange={e => setClassValue(e.target.value)}
                  className="bg-background border border-border/40 rounded px-2 py-0.5 font-mono max-w-[160px]"
                >
                  {classValues.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </>
            )}
            <span className="text-foreground/40 font-mono ml-1">{universeTickers.length} tickers</span>
          </div>
          <div className="flex items-center gap-1 border-l border-border/30 pl-2 ml-1">
            <span className="text-foreground/60 font-mono uppercase tracking-wide">Window</span>
            <div className="flex rounded border border-border/40 overflow-hidden">
              {["1Y", "3Y", "5Y", "All"].map(w => (
                <button
                  key={w}
                  onClick={() => setWindowKey(w)}
                  className={`px-2 py-0.5 font-mono text-[11px] ${windowKey === w ? "bg-amber-500/15 text-amber-200" : "text-foreground/60 hover:bg-accent"}`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1 border-l border-border/30 pl-2 ml-1">
            <span className="text-foreground/60 font-mono uppercase tracking-wide">View</span>
            <div className="flex rounded border border-border/40 overflow-hidden">
              {[["small", "Small Multiples"], ["overlay", "Overlay"], ["box", "Box / Violin"]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2 py-0.5 font-mono text-[11px] ${view === v ? "bg-amber-500/15 text-amber-200" : "text-foreground/60 hover:bg-accent"}`}
                  data-testid={`dist-view-${v}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {(view === "small" || view === "overlay") && (
            <div className="flex items-center gap-1.5 border-l border-border/30 pl-2 ml-1">
              <span className="text-foreground/60 font-mono uppercase tracking-wide">Bins</span>
              <input
                type="range" min={10} max={80} step={1} value={bins}
                onChange={e => setBins(Number(e.target.value))}
                className="w-24"
              />
              <span className="font-mono w-6 text-right text-foreground/80">{bins}</span>
            </div>
          )}
          <div className="flex-1" />
          <button
            onClick={runAnalysis}
            disabled={running || universeTickers.length === 0}
            className="flex items-center gap-1 px-3 py-1 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-50 font-mono text-xs"
            data-testid="dist-run"
          >
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayIcon className="w-3 h-3" />}
            Run
          </button>
        </div>
        <div className="px-3 pb-1.5 text-[11px] font-mono text-foreground/50 flex items-center gap-3">
          {running ? (
            <span>Computing {progress.done}/{progress.total} · {progress.current}…</span>
          ) : (
            <span>
              {results.length} computed
              {skipped.length > 0 && ` · ${skipped.length} n/a (${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? "…" : ""})`}
            </span>
          )}
          <span className="text-foreground/40">
            Metric: <span className="text-foreground/70">{selectedMetric}</span>
          </span>
          {(view === "small" || view === "box") && (
            <div className="ml-auto flex items-center gap-1">
              <span className="text-foreground/40">Sort:</span>
              {["ticker", "current", "percentile", "z", "median"].map(key => (
                <button
                  key={key}
                  onClick={() => handleSort(key)}
                  className={`px-1.5 py-0.5 rounded font-mono ${sortKey === key ? "bg-amber-500/15 text-amber-200" : "text-foreground/50 hover:text-foreground/80"}`}
                >
                  {key}{sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {running && results.length === 0 && (
          <div className="h-full flex items-center justify-center text-foreground/60 font-mono text-xs gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            Computing distribution for {selectedMetric}…
          </div>
        )}
        {results.length === 0 && !running && skipped.length > 0 && (
          <div className="h-full flex flex-col items-center justify-center text-foreground/50 font-mono text-xs gap-1 px-6 text-center">
            <div>No tickers in this universe report {selectedMetric}.</div>
            <div className="text-foreground/35">
              All {skipped.length} tickers returned n/a. Try a different metric in the sidebar.
            </div>
          </div>
        )}
        {results.length === 0 && !running && skipped.length === 0 && (
          <div className="h-full flex items-center justify-center text-foreground/40 font-mono text-xs">
            No data yet — click Run.
          </div>
        )}
        {view === "small" && results.length > 0 && <SmallMultiplesView results={sortedResults} />}
        {view === "overlay" && results.length > 0 && (
          <OverlayView results={results} hoverTicker={hoverTicker} setHoverTicker={setHoverTicker} metric={selectedMetric} />
        )}
        {view === "box" && results.length > 0 && <BoxView results={sortedResults} metric={selectedMetric} />}
      </div>
    </div>
  );
}
