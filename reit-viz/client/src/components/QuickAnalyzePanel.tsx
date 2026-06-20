// Reconstructed from recovered-bundle/index-CsG73Aq_.js on 2026-06-17
/**
 * Quick Analyze — large separable floating panel rendered on the Charts view.
 *
 * Renders three views (menu / rolling-correlation+lead-lag / conditional-stats)
 * over two visible plotted series. All math is client-side; presets persist to
 * localStorage. Reconstructs bundle component OWe + lead-lag sub-chart EWe and
 * the local pure helpers (alignSeries, shiftSeries, pearson, rollingCorr,
 * conditionalStats, histogram, percentileOf, quantile, formatNum, color rotation).
 */
import { useState, useMemo, useCallback, useRef } from "react";
import {
  X,
  LineChart,
  BarChart3,
  Bookmark,
  Save,
  Trash2,
  Search,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyTransform } from "@/lib/transforms";
import type { DataTransform } from "@/lib/transforms";
import type { PlottedSeries, PaneInfo } from "@/pages/Dashboard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataPoint {
  time: string;
  value: number;
}

interface AlignedPair {
  time: string;
  a: number;
  b: number;
}

interface LagRow {
  k: number;
  n: number;
  r: number;
}

interface ConditionalStatsResult {
  n: number;
  xCurrent: number;
  xCurrentPctile: number;
  xBand: [number, number];
  y: {
    min: number;
    p25: number;
    p50: number;
    mean: number;
    p75: number;
    max: number;
    std: number;
  } | null;
  yValues: number[];
  yCurrent: number;
}

interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
}

interface QaPreset {
  id: string;
  name: string;
  createdAt: number;
  tickerScope: string;
  aKey: string;
  bKey: string;
  tfA: DataTransform;
  tfB: DataTransform;
  tfWinA: number;
  tfWinB: number;
  lagBars: number;
  lagMax: number;
  corrWindow: number;
}

interface QuickAnalyzePanelProps {
  plottedSeries: PlottedSeries[];
  panes: PaneInfo[];
  onPlot: (series: PlottedSeries, targetPaneId?: number) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Local math helpers (faithful to bundle inlined helpers)
// ---------------------------------------------------------------------------

const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;

/** Dm: inner-join two series by time, keeping only positive a & b. */
function alignSeries(a: DataPoint[], b: DataPoint[]): AlignedPair[] {
  const byTime = new Map(b.map((point) => [point.time, point.value]));
  const result: AlignedPair[] = [];
  for (const point of a) {
    const bVal = byTime.get(point.time);
    if (bVal !== undefined && bVal !== 0 && point.value > 0 && bVal > 0) {
      result.push({ time: point.time, a: point.value, b: bVal });
    }
  }
  return result;
}

/** NT: positive-k shift = A shifted forward (r>0 at +k ⇒ A leads B). */
function shiftSeries(arr: DataPoint[], k: number): DataPoint[] {
  if (k === 0 || arr.length === 0) return arr;
  const len = arr.length;
  if (Math.abs(k) >= len) return [];
  if (k > 0) {
    const result: DataPoint[] = [];
    for (let i = 0; i + k < len; i++) {
      result.push({ time: arr[i + k].time, value: arr[i].value });
    }
    return result;
  }
  const neg = -k;
  const result: DataPoint[] = [];
  for (let i = neg; i < len; i++) {
    result.push({ time: arr[i - neg].time, value: arr[i].value });
  }
  return result;
}

/** WW: Pearson correlation over aligned a/b fields; NaN if length < 3. */
function pearson(pairs: AlignedPair[]): number {
  const n = pairs.length;
  if (n < 3) return NaN;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += pairs[i].a;
    sumB += pairs[i].b;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = pairs[i].a - meanA;
    const db = pairs[i].b - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom > 0 ? cov / denom : NaN;
}

/** JF: rolling Pearson correlation over aligned pairs. */
function rollingCorr(pairs: AlignedPair[], window: number): DataPoint[] {
  const result: DataPoint[] = [];
  for (let i = window - 1; i < pairs.length; i++) {
    let sumA = 0;
    let sumB = 0;
    let sumAB = 0;
    let sumAA = 0;
    let sumBB = 0;
    for (let j = i - window + 1; j <= i; j++) {
      sumA += pairs[j].a;
      sumB += pairs[j].b;
      sumAB += pairs[j].a * pairs[j].b;
      sumAA += pairs[j].a * pairs[j].a;
      sumBB += pairs[j].b * pairs[j].b;
    }
    const n = window;
    const meanA = sumA / n;
    const meanB = sumB / n;
    const varA = sumAA - n * meanA * meanA;
    const varB = sumBB - n * meanB * meanB;
    const cov = sumAB - n * meanA * meanB;
    const denom = Math.sqrt(varA * varB);
    result.push({
      time: pairs[i].time,
      value: round4(denom === 0 ? 0 : cov / denom),
    });
  }
  return result;
}

/** _We: percentile (0–100) of value within a sorted array. */
function percentileOf(sorted: number[], value: number): number {
  if (sorted.length === 0) return 50;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  let upper = lo;
  while (upper < sorted.length && sorted[upper] === value) upper++;
  return ((lo + upper) / 2 / sorted.length) * 100;
}

/** r1: linear-interpolated quantile at percentile p (0–100) of a sorted array. */
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** CWe: conditional distribution of Y when X is near its current value. */
function conditionalStats(
  pairs: AlignedPair[],
  bandHalf = 10,
): ConditionalStatsResult {
  if (pairs.length === 0) {
    return {
      n: 0,
      xCurrent: NaN,
      xCurrentPctile: 50,
      xBand: [40, 60],
      y: null,
      yValues: [],
      yCurrent: NaN,
    };
  }
  const last = pairs[pairs.length - 1];
  const xCurrent = last.a;
  const yCurrent = last.b;
  const sortedA = pairs
    .map((p) => p.a)
    .slice()
    .sort((x, y) => x - y);
  const pctile = percentileOf(sortedA, xCurrent);
  const half = Math.min(50, Math.max(1, bandHalf));
  let bandLo = pctile - half;
  let bandHi = pctile + half;
  if (bandLo < 0) {
    bandHi = Math.min(100, bandHi - bandLo);
    bandLo = 0;
  }
  if (bandHi > 100) {
    bandLo = Math.max(0, bandLo - (bandHi - 100));
    bandHi = 100;
  }
  const xLo = quantile(sortedA, bandLo);
  const xHi = quantile(sortedA, bandHi);
  const yValues: number[] = [];
  for (const pair of pairs) {
    if (pair.a >= xLo && pair.a <= xHi) yValues.push(pair.b);
  }
  if (yValues.length === 0) {
    return {
      n: 0,
      xCurrent,
      xCurrentPctile: pctile,
      xBand: [bandLo, bandHi],
      y: null,
      yValues: [],
      yCurrent,
    };
  }
  const sortedY = yValues.slice().sort((x, y) => x - y);
  const mean = yValues.reduce((acc, v) => acc + v, 0) / yValues.length;
  const variance =
    yValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
    Math.max(1, yValues.length - 1);
  const std = Math.sqrt(variance);
  return {
    n: yValues.length,
    xCurrent,
    xCurrentPctile: pctile,
    xBand: [bandLo, bandHi],
    y: {
      min: sortedY[0],
      p25: quantile(sortedY, 25),
      p50: quantile(sortedY, 50),
      mean,
      p75: quantile(sortedY, 75),
      max: sortedY[sortedY.length - 1],
      std,
    },
    yValues,
    yCurrent,
  };
}

/** NWe: fixed-bin histogram. */
function histogram(values: number[], bins = 24): HistogramBin[] {
  if (values.length === 0) return [];
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) return [{ binStart: min, binEnd: max, count: values.length }];
  const width = (max - min) / bins;
  const result: HistogramBin[] = Array.from({ length: bins }, (_unused, i) => ({
    binStart: min + i * width,
    binEnd: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    result[idx].count++;
  }
  return result;
}

/** Wa: compact number formatting. */
function formatNum(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e3) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(decimals);
}

// Color rotation (Iie + LW palette)
const DERIVED_COLORS = [
  "#f97316",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#06b6d4",
  "#84cc16",
  "#f43f5e",
];
let derivedColorIndex = 0;
function nextColor(): string {
  return DERIVED_COLORS[derivedColorIndex++ % DERIVED_COLORS.length];
}

// ---------------------------------------------------------------------------
// Preset persistence
// ---------------------------------------------------------------------------

const PRESETS_KEY = "reit-viz:qa-presets:v1";

function presetKey(series: PlottedSeries): string {
  return `${series.ticker}::${series.metric}`;
}

function findByKey(
  eligible: PlottedSeries[],
  key: string,
): PlottedSeries | undefined {
  return eligible.find((s) => presetKey(s) === key);
}

function loadPresets(): QaPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (p) =>
            p &&
            typeof p.id === "string" &&
            typeof p.name === "string" &&
            typeof p.aKey === "string" &&
            typeof p.bKey === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function savePresets(presets: QaPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* ignore quota / unavailable */
  }
}

function allPresetsSorted(): QaPreset[] {
  return loadPresets().sort((a, b) => b.createdAt - a.createdAt);
}

function listPresets(ticker: string | null): QaPreset[] {
  const all = allPresetsSorted();
  return ticker
    ? all.filter((p) => p.tickerScope === ticker || p.tickerScope === "*")
    : all.filter((p) => p.tickerScope === "*");
}

function newPresetId(): string {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `qa_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function upsertPreset(
  partial: Omit<QaPreset, "id" | "createdAt"> & { id?: string },
): QaPreset {
  const presets = loadPresets();
  const id = partial.id ?? newPresetId();
  const idx = presets.findIndex((p) => p.id === id);
  const next: QaPreset = { id, createdAt: Date.now(), ...partial };
  if (idx >= 0) presets[idx] = next;
  else presets.push(next);
  savePresets(presets);
  return next;
}

function deletePreset(id: string): void {
  savePresets(loadPresets().filter((p) => p.id !== id));
}

// ---------------------------------------------------------------------------
// EWe — lead-lag cross-correlation scatter chart
// ---------------------------------------------------------------------------

interface LeadLagChartProps {
  data: LagRow[];
  lagBars: number;
  lagMax: number;
  onLagChange?: (lag: number) => void;
  height?: number;
  width?: number;
  title?: string;
}

function LeadLagChart({
  data,
  lagBars,
  lagMax,
  onLagChange,
  height = 200,
  width = 640,
  title = "Cross-correlation r vs lag",
}: LeadLagChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredLag, setHoveredLag] = useState<number | null>(null);

  const marginLeft = 36;
  const marginRight = 12;
  const marginTop = 14;
  const marginBottom = 22;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const { rMin, rMax, bestRow, ciHigh, ciLow } = useMemo(() => {
    const finiteR = data.map((row) => row.r).filter(Number.isFinite);
    const rLow = finiteR.length ? Math.min(-1, Math.min(...finiteR)) : -1;
    const rHigh = finiteR.length ? Math.max(1, Math.max(...finiteR)) : 1;
    let best: LagRow = { k: 0, r: 0, n: 0 };
    for (const row of data) {
      if (Number.isFinite(row.r) && Math.abs(row.r) > Math.abs(best.r)) {
        best = row;
      }
    }
    const ns = data
      .map((row) => row.n)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const medianN = ns.length ? ns[Math.floor(ns.length / 2)] : 0;
    const ci = medianN > 0 ? 1.96 / Math.sqrt(medianN) : 0;
    return { rMin: rLow, rMax: rHigh, bestRow: best, ciHigh: ci, ciLow: -ci };
  }, [data]);

  const xScale = useCallback(
    (k: number) => marginLeft + ((k + lagMax) / (2 * lagMax || 1)) * plotW,
    [marginLeft, lagMax, plotW],
  );
  const yScale = useCallback(
    (r: number) =>
      marginTop + (1 - (r - rMin) / (rMax - rMin || 1)) * plotH,
    [marginTop, rMin, rMax, plotH],
  );

  const linePath = useMemo(
    () =>
      data
        .map(
          (row, i) =>
            `${i === 0 ? "M" : "L"}${xScale(row.k).toFixed(1)},${yScale(
              Number.isFinite(row.r) ? row.r : 0,
            ).toFixed(1)}`,
        )
        .join(" "),
    [data, xScale, yScale],
  );

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let r = Math.ceil(rMin * 10) / 10; r <= rMax + 1e-9; r += 0.2) {
      ticks.push(Math.round(r * 100) / 100);
    }
    return ticks;
  }, [rMin, rMax]);

  const xTicks = useMemo(() => {
    const step = Math.max(1, Math.round((lagMax * 2) / 6));
    const ticks: number[] = [];
    for (let k = -lagMax; k <= lagMax; k += step) ticks.push(k);
    if (ticks[ticks.length - 1] !== lagMax) ticks.push(lagMax);
    return ticks;
  }, [lagMax]);

  const lagFromClientX = useCallback(
    (clientX: number): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const rel = ((clientX - rect.left) * scaleX - marginLeft) / plotW;
      if (!Number.isFinite(rel)) return null;
      const clamped = Math.max(0, Math.min(1, rel));
      const k = Math.round(clamped * 2 * lagMax - lagMax);
      return Math.max(-lagMax, Math.min(lagMax, k));
    },
    [width, marginLeft, plotW, lagMax],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      setHoveredLag(lagFromClientX(event.clientX));
    },
    [lagFromClientX],
  );
  const handleMouseLeave = useCallback(() => setHoveredLag(null), []);
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!onLagChange) return;
      const k = lagFromClientX(event.clientX);
      if (k != null) onLagChange(k);
    },
    [lagFromClientX, onLagChange],
  );

  const hoveredRow =
    hoveredLag != null ? data.find((row) => row.k === hoveredLag) : null;

  if (data.length === 0) return null;

  return (
    <div className="mt-2 border border-border rounded p-2 bg-background">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-muted-foreground">{title}</span>
        <span className="font-mono text-foreground">
          best: lag {bestRow.k >= 0 ? "+" : ""}
          {bestRow.k}, r={bestRow.r.toFixed(3)}
          {onLagChange && (
            <span className="text-muted-foreground ml-1.5">
              (click to pin lag)
            </span>
          )}
        </span>
      </div>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ cursor: onLagChange ? "crosshair" : "default" }}
      >
        {ciHigh > 0 && (
          <rect
            x={marginLeft}
            y={yScale(ciHigh)}
            width={plotW}
            height={Math.max(0, yScale(ciLow) - yScale(ciHigh))}
            fill="#64748b"
            fillOpacity={0.12}
          />
        )}
        {yTicks.map((r) => (
          <g key={`y${r}`}>
            <line
              x1={marginLeft}
              y1={yScale(r)}
              x2={marginLeft + plotW}
              y2={yScale(r)}
              stroke="#334155"
              strokeWidth="0.4"
              strokeDasharray={r === 0 ? "" : "2 3"}
              opacity={r === 0 ? 0.8 : 0.4}
            />
            <text
              x={marginLeft - 4}
              y={yScale(r) + 3}
              fontSize="9"
              fill="#94a3b8"
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
            >
              {r.toFixed(1)}
            </text>
          </g>
        ))}
        {xTicks.map((k) => (
          <g key={`x${k}`}>
            <line
              x1={xScale(k)}
              y1={marginTop + plotH}
              x2={xScale(k)}
              y2={marginTop + plotH + 3}
              stroke="#64748b"
              strokeWidth="0.5"
            />
            <text
              x={xScale(k)}
              y={marginTop + plotH + 14}
              fontSize="9"
              fill="#94a3b8"
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
            >
              {k >= 0 ? `+${k}` : k}
            </text>
          </g>
        ))}
        <line
          x1={xScale(0)}
          y1={marginTop}
          x2={xScale(0)}
          y2={marginTop + plotH}
          stroke="#94a3b8"
          strokeWidth="0.5"
          strokeDasharray="3 3"
        />
        <line
          x1={xScale(lagBars)}
          y1={marginTop}
          x2={xScale(lagBars)}
          y2={marginTop + plotH}
          stroke="#fbbf24"
          strokeWidth="1.25"
        />
        <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
        {Number.isFinite(bestRow.r) && (
          <circle
            cx={xScale(bestRow.k)}
            cy={yScale(bestRow.r)}
            r="3"
            fill="#f59e0b"
            stroke="#fff"
            strokeWidth="0.5"
          />
        )}
        {hoveredRow && Number.isFinite(hoveredRow.r) && (
          <>
            <line
              x1={marginLeft}
              y1={yScale(hoveredRow.r)}
              x2={marginLeft + plotW}
              y2={yScale(hoveredRow.r)}
              stroke="#22d3ee"
              strokeWidth="1"
              opacity={0.85}
            />
            <g>
              <rect
                x={2}
                y={yScale(hoveredRow.r) - 7}
                width={marginLeft - 6}
                height={13}
                rx={2}
                fill="#0f172a"
                stroke="#22d3ee"
                strokeWidth="0.6"
              />
              <text
                x={marginLeft - 4}
                y={yScale(hoveredRow.r) + 3}
                fontSize="9.5"
                fill="#22d3ee"
                textAnchor="end"
                fontFamily="ui-monospace, monospace"
              >
                {hoveredRow.r.toFixed(3)}
              </text>
            </g>
            <line
              x1={xScale(hoveredRow.k)}
              y1={marginTop}
              x2={xScale(hoveredRow.k)}
              y2={marginTop + plotH}
              stroke="#22d3ee"
              strokeWidth="1"
              opacity={0.85}
            />
            <g>
              <rect
                x={xScale(hoveredRow.k) - 16}
                y={marginTop + plotH + 2}
                width={32}
                height={13}
                rx={2}
                fill="#0f172a"
                stroke="#22d3ee"
                strokeWidth="0.6"
              />
              <text
                x={xScale(hoveredRow.k)}
                y={marginTop + plotH + 12}
                fontSize="9.5"
                fill="#22d3ee"
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
              >
                {hoveredRow.k >= 0 ? `+${hoveredRow.k}` : hoveredRow.k}
              </text>
            </g>
            <circle
              cx={xScale(hoveredRow.k)}
              cy={yScale(hoveredRow.r)}
              r="3.5"
              fill="#22d3ee"
              stroke="#0f172a"
              strokeWidth="1"
            />
            {(() => {
              const px = xScale(hoveredRow.k);
              const py = yScale(hoveredRow.r);
              const boxW = 92;
              const boxH = 32;
              const boxX =
                px + boxW + 6 > marginLeft + plotW ? px - boxW - 6 : px + 6;
              const boxY = Math.max(
                marginTop,
                Math.min(marginTop + plotH - boxH, py - boxH / 2),
              );
              return (
                <g>
                  <rect
                    x={boxX}
                    y={boxY}
                    width={boxW}
                    height={boxH}
                    rx={3}
                    fill="#0f172a"
                    stroke="#334155"
                    strokeWidth="0.5"
                  />
                  <text
                    x={boxX + 5}
                    y={boxY + 12}
                    fontSize="9.5"
                    fill="#e2e8f0"
                    fontFamily="ui-monospace, monospace"
                  >
                    lag: {hoveredRow.k >= 0 ? "+" : ""}
                    {hoveredRow.k}
                  </text>
                  <text
                    x={boxX + 5}
                    y={boxY + 24}
                    fontSize="9.5"
                    fontFamily="ui-monospace, monospace"
                    fill={hoveredRow.r >= 0 ? "#34d399" : "#fb7185"}
                  >
                    r={hoveredRow.r.toFixed(3)} · n={hoveredRow.n}
                  </text>
                </g>
              );
            })()}
          </>
        )}
        <text
          x={marginLeft + plotW / 2}
          y={height - 3}
          fontSize="9"
          fill="#64748b"
          textAnchor="middle"
        >
          Lag (bars) — A shifted; r&gt;0 at +k ⇒ A leads B
        </text>
      </svg>
      <div className="text-[9px] text-muted-foreground mt-1 leading-tight">
        Shaded band: 95% CI under H₀ (±1.96/√n). Yellow line = current lag;
        orange dot = best |r|.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OWe — Quick Analyze panel
// ---------------------------------------------------------------------------

type View = "menu" | "corr" | "cond";
const TRANSFORM_WINDOWS = [63, 126, 252, 504, 0];
const HORIZON_LAGS = [-252, -126, -63, -21, -5, -1, 0, 1, 5, 21, 63, 126, 252];

export default function QuickAnalyzePanel({
  plottedSeries,
  panes,
  onPlot,
  onClose,
}: QuickAnalyzePanelProps) {
  const eligible = useMemo(
    () =>
      plottedSeries.filter((s) => s.visible && s.data && s.data.length > 5),
    [plottedSeries],
  );

  const [view, setView] = useState<View>("menu");
  const [seriesAId, setSeriesAId] = useState(eligible[0]?.id || "");
  const [seriesBId, setSeriesBId] = useState(eligible[1]?.id || "");
  const [corrWindow, setCorrWindow] = useState(63);
  const [running, setRunning] = useState(false);
  const [tfA, setTfA] = useState<DataTransform>("raw");
  const [tfB, setTfB] = useState<DataTransform>("raw");
  const [tfWinA, setTfWinA] = useState(252);
  const [tfWinB, setTfWinB] = useState(252);
  const [lagBars, setLagBars] = useState(0);
  const [lagMax, setLagMax] = useState(60);
  const [scanning, setScanning] = useState(false);
  const [bandHalf, setBandHalf] = useState(10);
  const [presetsTick, setPresetsTick] = useState(0);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetScope, setPresetScope] = useState<"ticker" | "global">("ticker");
  const [scanData, setScanData] = useState<LagRow[]>([]);

  const seriesA = useMemo(
    () => eligible.find((s) => s.id === seriesAId),
    [eligible, seriesAId],
  );
  const seriesB = useMemo(
    () => eligible.find((s) => s.id === seriesBId),
    [eligible, seriesBId],
  );

  const sameSelection =
    seriesAId === seriesBId &&
    tfA === tfB &&
    (tfA === "raw" || tfWinA === tfWinB);

  const tickerScope = useMemo(
    () =>
      !seriesA || (seriesB && seriesB.ticker !== seriesA.ticker)
        ? null
        : seriesA.ticker,
    [seriesA, seriesB],
  );

  const presets = useMemo(
    () => listPresets(tickerScope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickerScope, presetsTick],
  );

  const applyPreset = useCallback(
    (preset: QaPreset) => {
      const a = findByKey(eligible, preset.aKey);
      const b = findByKey(eligible, preset.bKey);
      if (!a || !b) {
        console.warn(
          "[QA preset] series not plotted:",
          preset.name,
          preset.aKey,
          preset.bKey,
        );
        return;
      }
      setSeriesAId(a.id);
      setSeriesBId(b.id);
      setTfA(preset.tfA);
      setTfB(preset.tfB);
      setTfWinA(preset.tfWinA);
      setTfWinB(preset.tfWinB);
      setLagBars(preset.lagBars);
      setLagMax(preset.lagMax);
      setCorrWindow(preset.corrWindow);
    },
    [eligible],
  );

  const handleSavePreset = useCallback(() => {
    if (!seriesA || !seriesB) return;
    const name = presetName.trim();
    if (!name) return;
    upsertPreset({
      name,
      tickerScope: presetScope === "global" ? "*" : (tickerScope ?? "*"),
      aKey: presetKey(seriesA),
      bKey: presetKey(seriesB),
      tfA,
      tfB,
      tfWinA,
      tfWinB,
      lagBars,
      lagMax,
      corrWindow,
    });
    setShowSaveForm(false);
    setPresetName("");
    setPresetsTick((t) => t + 1);
  }, [
    seriesA,
    seriesB,
    presetName,
    presetScope,
    tickerScope,
    tfA,
    tfB,
    tfWinA,
    tfWinB,
    lagBars,
    lagMax,
    corrWindow,
  ]);

  const handleDeletePreset = useCallback((id: string) => {
    deletePreset(id);
    setPresetsTick((t) => t + 1);
  }, []);

  const transformedA = useMemo(
    () => (seriesA ? applyTransform(seriesA.data, tfA, tfWinA) : []),
    [seriesA, tfA, tfWinA],
  );
  const transformedB = useMemo(
    () => (seriesB ? applyTransform(seriesB.data, tfB, tfWinB) : []),
    [seriesB, tfB, tfWinB],
  );

  const horizonGrid = useMemo<LagRow[]>(
    () =>
      !transformedA.length || !transformedB.length
        ? []
        : HORIZON_LAGS.map((lag) => {
            const aligned = alignSeries(
              shiftSeries(transformedA, lag),
              transformedB,
            );
            return aligned.length < 10
              ? { k: lag, n: aligned.length, r: NaN }
              : { k: lag, n: aligned.length, r: pearson(aligned) };
          }),
    [transformedA, transformedB],
  );

  const handleScan = useCallback(() => {
    if (!transformedA.length || !transformedB.length) return;
    setScanning(true);
    try {
      const max = Math.max(1, Math.min(252, Math.round(lagMax)));
      const rows: LagRow[] = [];
      for (let k = -max; k <= max; k++) {
        const aligned = alignSeries(shiftSeries(transformedA, k), transformedB);
        const r = aligned.length >= 10 ? pearson(aligned) : NaN;
        rows.push({ k, n: aligned.length, r });
      }
      setScanData(rows);
      let bestK = 0;
      let bestAbs = -1;
      for (const row of rows) {
        if (Number.isFinite(row.r) && Math.abs(row.r) > bestAbs) {
          bestAbs = Math.abs(row.r);
          bestK = row.k;
        }
      }
      if (bestAbs > 0) setLagBars(bestK);
    } finally {
      setScanning(false);
    }
  }, [transformedA, transformedB, lagMax]);

  const conditional = useMemo<ConditionalStatsResult | null>(() => {
    if (
      !seriesA ||
      !seriesB ||
      view !== "cond" ||
      !transformedA.length ||
      !transformedB.length
    )
      return null;
    const aligned = alignSeries(transformedA, transformedB);
    return aligned.length < 20 ? null : conditionalStats(aligned, bandHalf);
  }, [seriesA, seriesB, transformedA, transformedB, bandHalf, view]);

  const condHistogram = useMemo<HistogramBin[]>(
    () =>
      !conditional || conditional.yValues.length === 0
        ? []
        : histogram(conditional.yValues, 24),
    [conditional],
  );

  const fullSampleStats = useMemo(() => {
    if (!seriesB || view !== "cond") return null;
    const values = transformedB
      .map((p) => p.value)
      .filter((v) => Number.isFinite(v));
    if (values.length === 0) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    const q = (p: number) => {
      const pos = (p / 100) * (sorted.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return lo === hi
        ? sorted[lo]
        : sorted[lo] * (1 - (pos - lo)) + sorted[hi] * (pos - lo);
    };
    return {
      min: sorted[0],
      p25: q(25),
      p50: q(50),
      mean,
      p75: q(75),
      max: sorted[sorted.length - 1],
      n: values.length,
    };
  }, [seriesB, transformedB, view]);

  const handleRun = useCallback(() => {
    if (!seriesA || !seriesB) return;
    setRunning(true);
    try {
      const shifted = shiftSeries(transformedA, lagBars);
      const aligned = alignSeries(shifted, transformedB);
      if (aligned.length < corrWindow + 5) {
        alert(
          `Need at least ${corrWindow + 5} overlapping bars; only have ${aligned.length}.`,
        );
        setRunning(false);
        return;
      }
      const corrData = rollingCorr(aligned, corrWindow);
      const newPaneId = Math.max(0, ...panes.map((p) => p.id)) + 1;
      const suffix = (tf: DataTransform, win: number) =>
        tf === "raw" ? "" : ` [${tf === "zscore" ? "Z" : "%"}${win}]`;
      const aLabel = `${seriesA.label}${suffix(tfA, tfWinA)}`;
      const bLabel = `${seriesB.label}${suffix(tfB, tfWinB)}`;
      const lagSuffix =
        lagBars !== 0 ? ` lag${lagBars > 0 ? "+" : ""}${lagBars}` : "";
      const label = `Corr(${aLabel}, ${bLabel}) ${corrWindow}d${lagSuffix}`;
      const id = `qa-corr-${Date.now()}`;
      onPlot(
        {
          id,
          ticker: "__derived",
          metric: label,
          color: nextColor(),
          paneIndex: newPaneId,
          data: corrData,
          visible: true,
          label,
          lineWidth: 2,
        },
        newPaneId,
      );
      onClose();
    } finally {
      setRunning(false);
    }
  }, [
    seriesA,
    seriesB,
    transformedA,
    transformedB,
    tfA,
    tfB,
    tfWinA,
    tfWinB,
    lagBars,
    corrWindow,
    panes,
    onPlot,
    onClose,
  ]);

  const maxBinCount = condHistogram.reduce(
    (acc, bin) => (bin.count > acc ? bin.count : acc),
    0,
  );

  return (
    <>
      <div
        className="fixed top-20 right-4 z-50 bg-card border border-border rounded-md shadow-xl p-3 w-[460px] max-h-[calc(100vh-6rem)] overflow-y-auto"
        data-testid="quick-analyze-panel"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
            {view === "menu"
              ? "Quick Analyze"
              : view === "corr"
                ? "Rolling Correlation"
                : "Conditional Stats"}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {eligible.length < 2 && (
          <div className="text-[11px] text-muted-foreground py-4 text-center">
            Need at least 2 visible series on the chart.
          </div>
        )}

        {eligible.length >= 2 && view === "menu" && (
          <div className="space-y-2">
            <button
              className="w-full text-left px-3 py-2 rounded border border-border hover:bg-accent transition-colors text-[12px] flex items-start gap-2"
              onClick={() => setView("corr")}
              data-testid="qa-open-corr"
            >
              <LineChart className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div>
                <div className="font-medium">
                  Rolling correlation + lead-lag
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Pearson r of A vs B with per-series Raw / Z / Pctl transform
                  and lead-lag scan.
                </div>
              </div>
            </button>
            <button
              className="w-full text-left px-3 py-2 rounded border border-border hover:bg-accent transition-colors text-[12px] flex items-start gap-2"
              onClick={() => setView("cond")}
              data-testid="qa-open-cond"
            >
              <BarChart3 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <div>
                <div className="font-medium">Conditional stats</div>
                <div className="text-[10px] text-muted-foreground">
                  Distribution of Y when X is near its current value.
                </div>
              </div>
            </button>
          </div>
        )}

        {eligible.length >= 2 && (view === "corr" || view === "cond") && (
          <div className="space-y-2">
            {view === "corr" && (
              <div
                className="border border-border rounded p-1.5 bg-background"
                data-testid="qa-presets"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Bookmark className="h-3 w-3" /> Presets
                    {tickerScope && (
                      <span className="text-[9px] font-mono normal-case tracking-normal text-muted-foreground/70 ml-1">
                        ({tickerScope})
                      </span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-5 px-1.5 text-[9px]"
                    onClick={() => setShowSaveForm((v) => !v)}
                    disabled={!seriesA || !seriesB}
                    title={
                      !seriesA || !seriesB
                        ? "Pick both series first"
                        : "Save current config as preset"
                    }
                    data-testid="qa-preset-save-toggle"
                  >
                    <Save className="h-3 w-3 mr-0.5" /> Save
                  </Button>
                </div>
                {showSaveForm && (
                  <div
                    className="flex items-center gap-1 mb-1"
                    data-testid="qa-preset-form"
                  >
                    <input
                      type="text"
                      placeholder="Preset name…"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSavePreset();
                      }}
                      className="flex-1 h-6 px-1.5 text-[10px] bg-input border border-border rounded"
                      autoFocus
                      data-testid="qa-preset-name"
                    />
                    <Select
                      value={presetScope}
                      onValueChange={(v) =>
                        setPresetScope(v as "ticker" | "global")
                      }
                    >
                      <SelectTrigger
                        className="h-6 w-[72px] text-[9px] px-1.5"
                        data-testid="qa-preset-scope"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value="ticker"
                          className="text-[10px]"
                          disabled={!tickerScope}
                        >
                          {tickerScope ?? "(no ticker)"}
                        </SelectItem>
                        <SelectItem value="global" className="text-[10px]">
                          Global
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={handleSavePreset}
                      disabled={!presetName.trim()}
                      data-testid="qa-preset-save-confirm"
                    >
                      OK
                    </Button>
                  </div>
                )}
                {presets.length === 0 ? (
                  <div className="text-[9px] text-muted-foreground italic">
                    No saved presets for {tickerScope ?? "this view"}.
                  </div>
                ) : (
                  <div
                    className="flex flex-wrap gap-1"
                    data-testid="qa-preset-list"
                  >
                    {presets.map((preset) => (
                      <div
                        key={preset.id}
                        className="inline-flex items-center gap-0.5 border border-border rounded bg-card pl-1.5 pr-0.5 py-0.5"
                      >
                        <button
                          className="text-[10px] hover:text-primary truncate max-w-[140px]"
                          onClick={() => applyPreset(preset)}
                          title={`${preset.name} · ${preset.tickerScope} · lag ${preset.lagBars >= 0 ? "+" : ""}${preset.lagBars}`}
                          data-testid={`qa-preset-apply-${preset.id}`}
                        >
                          {preset.name}
                          {preset.tickerScope === "*" && (
                            <span className="text-muted-foreground ml-1">
                              *
                            </span>
                          )}
                        </button>
                        <button
                          className="text-muted-foreground hover:text-rose-400 p-0.5"
                          onClick={() => handleDeletePreset(preset.id)}
                          title="Delete preset"
                          data-testid={`qa-preset-delete-${preset.id}`}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Series A {view === "cond" ? "(X — condition on)" : ""}
              </Label>
              <Select value={seriesAId} onValueChange={setSeriesAId}>
                <SelectTrigger
                  className="h-7 text-[11px] mt-1"
                  data-testid="qa-series-a"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-[11px]">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 mt-1">
                {(["raw", "zscore", "percentile"] as DataTransform[]).map(
                  (tf) => (
                    <Button
                      key={tf}
                      size="sm"
                      variant={tfA === tf ? "default" : "outline"}
                      className="h-5 px-1.5 text-[9px] flex-1"
                      onClick={() => setTfA(tf)}
                      title={
                        tf === "raw"
                          ? "Raw values"
                          : tf === "zscore"
                            ? "Rolling Z-score"
                            : "Rolling percentile"
                      }
                      data-testid={`qa-tfA-${tf}`}
                    >
                      {tf === "raw" ? "Raw" : tf === "zscore" ? "Z" : "%"}
                    </Button>
                  ),
                )}
                {tfA !== "raw" && (
                  <Select
                    value={String(tfWinA)}
                    onValueChange={(v) => setTfWinA(Number(v))}
                  >
                    <SelectTrigger
                      className="h-5 w-[58px] text-[9px] px-1.5"
                      data-testid="qa-tfA-win"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSFORM_WINDOWS.map((win) => (
                        <SelectItem
                          key={win}
                          value={String(win)}
                          className="text-[10px]"
                        >
                          {win === 0 ? "Exp." : `${win}d`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Series B {view === "cond" ? "(Y — distribution of)" : ""}
              </Label>
              <Select value={seriesBId} onValueChange={setSeriesBId}>
                <SelectTrigger
                  className="h-7 text-[11px] mt-1"
                  data-testid="qa-series-b"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-[11px]">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 mt-1">
                {(["raw", "zscore", "percentile"] as DataTransform[]).map(
                  (tf) => (
                    <Button
                      key={tf}
                      size="sm"
                      variant={tfB === tf ? "default" : "outline"}
                      className="h-5 px-1.5 text-[9px] flex-1"
                      onClick={() => setTfB(tf)}
                      title={
                        tf === "raw"
                          ? "Raw values"
                          : tf === "zscore"
                            ? "Rolling Z-score"
                            : "Rolling percentile"
                      }
                      data-testid={`qa-tfB-${tf}`}
                    >
                      {tf === "raw" ? "Raw" : tf === "zscore" ? "Z" : "%"}
                    </Button>
                  ),
                )}
                {tfB !== "raw" && (
                  <Select
                    value={String(tfWinB)}
                    onValueChange={(v) => setTfWinB(Number(v))}
                  >
                    <SelectTrigger
                      className="h-5 w-[58px] text-[9px] px-1.5"
                      data-testid="qa-tfB-win"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSFORM_WINDOWS.map((win) => (
                        <SelectItem
                          key={win}
                          value={String(win)}
                          className="text-[10px]"
                        >
                          {win === 0 ? "Exp." : `${win}d`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {view === "corr" && (
              <>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Window: {corrWindow}d
                  </Label>
                  <Slider
                    min={10}
                    max={504}
                    step={1}
                    value={[corrWindow]}
                    onValueChange={(v) => setCorrWindow(v[0])}
                    className="mt-2"
                  />
                  <div className="flex gap-1 mt-1.5">
                    {[21, 63, 126, 252].map((win) => (
                      <Button
                        key={win}
                        variant={corrWindow === win ? "default" : "outline"}
                        size="sm"
                        className="h-5 px-1.5 text-[10px] flex-1"
                        onClick={() => setCorrWindow(win)}
                      >
                        {win}d
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border pt-2 mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Lead-lag: A shifted {lagBars >= 0 ? "+" : ""}
                      {lagBars} bars
                    </Label>
                    <span className="text-[9px] text-muted-foreground">
                      {lagBars > 0
                        ? "A leads B"
                        : lagBars < 0
                          ? "B leads A"
                          : "contemporaneous"}
                    </span>
                  </div>
                  <Slider
                    min={-lagMax}
                    max={lagMax}
                    step={1}
                    value={[lagBars]}
                    onValueChange={(v) => setLagBars(v[0])}
                    className="mt-1"
                    data-testid="qa-lag-slider"
                  />
                  <div className="flex items-center gap-1 mt-1.5">
                    <Label className="text-[9px] text-muted-foreground">
                      Scan range ±
                    </Label>
                    {[20, 60, 120, 252].map((max) => (
                      <Button
                        key={max}
                        variant={lagMax === max ? "default" : "outline"}
                        size="sm"
                        className="h-5 px-1.5 text-[9px] flex-1"
                        onClick={() => setLagMax(max)}
                      >
                        {max}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      className="h-5 px-2 text-[9px]"
                      disabled={
                        scanning || !seriesA || !seriesB || sameSelection
                      }
                      onClick={handleScan}
                      data-testid="qa-lag-scan"
                      title="Sweep lags and auto-pin the bar with max |r|"
                    >
                      {scanning ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Search className="h-3 w-3 mr-0.5" />
                          Find
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 px-1.5 text-[9px]"
                      onClick={() => setLagBars(0)}
                      title="Reset to contemporaneous"
                    >
                      0
                    </Button>
                  </div>
                  {scanData.length > 0 && (
                    <LeadLagChart
                      data={scanData}
                      lagBars={lagBars}
                      lagMax={lagMax}
                      onLagChange={setLagBars}
                      height={200}
                      width={480}
                    />
                  )}
                </div>

                {horizonGrid.length > 0 && (
                  <div className="border border-border rounded p-1.5 bg-background">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                      Horizon r (full-sample, A shifted)
                    </div>
                    <div
                      className="grid grid-cols-13 gap-0.5 text-[9px] font-mono"
                      style={{
                        gridTemplateColumns: "repeat(13, minmax(0, 1fr))",
                      }}
                    >
                      {horizonGrid.map((row) => {
                        const r = row.r;
                        const colorClass = Number.isFinite(r)
                          ? Math.abs(r) > 0.5
                            ? r > 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                            : Math.abs(r) > 0.2
                              ? r > 0
                                ? "text-emerald-300/70"
                                : "text-rose-300/70"
                              : "text-muted-foreground"
                          : "text-muted-foreground";
                        return (
                          <div
                            key={row.k}
                            className="flex flex-col items-center"
                          >
                            <span className="text-muted-foreground text-[8px]">
                              {row.k >= 0 ? "+" : ""}
                              {row.k}
                            </span>
                            <span className={colorClass}>
                              {Number.isFinite(r) ? r.toFixed(2) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-1 leading-tight">
                      r &gt; 0 at +k ⇒ A leads B by k bars; r &gt; 0 at -k ⇒ B
                      leads A.
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] flex-1"
                    onClick={() => setView("menu")}
                  >
                    Back
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-[11px] flex-1"
                    disabled={
                      running || sameSelection || !seriesA || !seriesB
                    }
                    onClick={handleRun}
                    data-testid="qa-run-corr"
                  >
                    {running ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Add to chart"
                    )}
                  </Button>
                </div>
              </>
            )}

            {view === "cond" && (
              <>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Band half-width: ±{bandHalf} percentile points
                  </Label>
                  <Slider
                    min={2}
                    max={25}
                    step={1}
                    value={[bandHalf]}
                    onValueChange={(v) => setBandHalf(v[0])}
                    className="mt-2"
                  />
                </div>
                {conditional && conditional.y && (
                  <div className="border border-border rounded p-2 bg-background space-y-2">
                    <div className="text-[10px] text-muted-foreground leading-tight">
                      X is at{" "}
                      <span className="text-foreground font-medium">
                        {formatNum(conditional.xCurrent)}
                      </span>{" "}
                      (pctile {conditional.xCurrentPctile.toFixed(0)}%); sampling
                      X ∈ [pctile {conditional.xBand[0].toFixed(0)}–
                      {conditional.xBand[1].toFixed(0)}%]. Matched{" "}
                      <span className="text-foreground font-medium">
                        {conditional.n}
                      </span>{" "}
                      bars.
                    </div>
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-normal py-0.5">Stat</th>
                          <th className="text-right font-normal py-0.5">
                            Conditional Y
                          </th>
                          <th className="text-right font-normal py-0.5">
                            Full-sample Y
                          </th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        <tr>
                          <td>Min</td>
                          <td className="text-right">
                            {formatNum(conditional.y.min)}
                          </td>
                          <td className="text-right text-muted-foreground">
                            {formatNum(fullSampleStats?.min ?? NaN)}
                          </td>
                        </tr>
                        <tr>
                          <td>P25</td>
                          <td className="text-right">
                            {formatNum(conditional.y.p25)}
                          </td>
                          <td className="text-right text-muted-foreground">
                            {formatNum(fullSampleStats?.p25 ?? NaN)}
                          </td>
                        </tr>
                        <tr>
                          <td>Median</td>
                          <td className="text-right font-semibold">
                            {formatNum(conditional.y.p50)}
                          </td>
                          <td className="text-right text-muted-foreground">
                            {formatNum(fullSampleStats?.p50 ?? NaN)}
                          </td>
                        </tr>
                        <tr>
                          <td>Mean</td>
                          <td className="text-right">
                            {formatNum(conditional.y.mean)}
                          </td>
                          <td className="text-right text-muted-foreground">
                            {formatNum(fullSampleStats?.mean ?? NaN)}
                          </td>
                        </tr>
                        <tr>
                          <td>P75</td>
                          <td className="text-right">
                            {formatNum(conditional.y.p75)}
                          </td>
                          <td className="text-right text-muted-foreground">
                            {formatNum(fullSampleStats?.p75 ?? NaN)}
                          </td>
                        </tr>
                        <tr>
                          <td>Max</td>
                          <td className="text-right">
                            {formatNum(conditional.y.max)}
                          </td>
                          <td className="text-right text-muted-foreground">
                            {formatNum(fullSampleStats?.max ?? NaN)}
                          </td>
                        </tr>
                        <tr className="border-t border-border">
                          <td>Std</td>
                          <td className="text-right">
                            {formatNum(conditional.y.std)}
                          </td>
                          <td className="text-right text-muted-foreground">
                            —
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="text-[10px] text-muted-foreground border-t border-border pt-1">
                      Y today:{" "}
                      <span className="text-foreground font-medium">
                        {formatNum(conditional.yCurrent)}
                      </span>
                      {conditional.y &&
                        Number.isFinite(conditional.yCurrent) && (
                          <>
                            {" "}
                            (vs conditional median{" "}
                            <span
                              className={
                                conditional.yCurrent > conditional.y.p50
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }
                            >
                              {conditional.yCurrent > conditional.y.p50
                                ? "+"
                                : ""}
                              {formatNum(
                                ((conditional.yCurrent - conditional.y.p50) /
                                  Math.abs(conditional.y.p50 || 1)) *
                                  100,
                                1,
                              )}
                              %
                            </span>
                            )
                          </>
                        )}
                    </div>
                    {condHistogram.length > 0 && (
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                          Conditional Y distribution
                        </div>
                        <svg
                          width="100%"
                          height="70"
                          viewBox="0 0 320 70"
                          preserveAspectRatio="none"
                        >
                          {condHistogram.map((bin, i) => {
                            const x = (i / condHistogram.length) * 320;
                            const binW = 320 / condHistogram.length;
                            const barH =
                              maxBinCount > 0
                                ? (bin.count / maxBinCount) * 60
                                : 0;
                            const isToday =
                              conditional.yCurrent >= bin.binStart &&
                              conditional.yCurrent <= bin.binEnd;
                            const isMedian =
                              conditional.y!.p50 >= bin.binStart &&
                              conditional.y!.p50 <= bin.binEnd;
                            return (
                              <rect
                                key={i}
                                x={x + 0.5}
                                y={65 - barH}
                                width={Math.max(1, binW - 1)}
                                height={barH}
                                fill={
                                  isToday
                                    ? "#fbbf24"
                                    : isMedian
                                      ? "#60a5fa"
                                      : "#64748b"
                                }
                                opacity={isToday || isMedian ? 1 : 0.7}
                              />
                            );
                          })}
                        </svg>
                        <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5 font-mono">
                          <span>{formatNum(conditional.y.min)}</span>
                          <span className="text-[#60a5fa]">● median</span>
                          <span className="text-[#fbbf24]">● today</span>
                          <span>{formatNum(conditional.y.max)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {(!conditional || !conditional.y) && (
                  <div className="text-[10px] text-muted-foreground py-2 text-center border border-border rounded">
                    {!seriesA || !seriesB || sameSelection
                      ? "Pick two different series."
                      : "Not enough overlapping data to compute."}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] flex-1"
                    onClick={() => setView("menu")}
                  >
                    Back
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
