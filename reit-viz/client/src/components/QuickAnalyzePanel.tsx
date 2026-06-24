/**
 * Quick Analyze — floating panel on the Charts view.
 *
 * Conditional Stats: the distribution of Y when X is near its current value,
 * over two visible plotted series, with per-series Raw / Z / Percentile
 * transforms. All math is client-side.
 *
 * NOTE: the rolling-correlation + lead-lag view that used to live here has been
 * consolidated into the sidebar's "Pairs & Formula" section (Pair Math →
 * Correlation), which adds the same transforms, lead-lag scan, horizon grid,
 * and presets on top of arbitrary ticker/metric pairs.
 */
import { useState, useMemo } from "react";
import { X, BarChart3 } from "lucide-react";
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

interface QuickAnalyzePanelProps {
  plottedSeries: PlottedSeries[];
  panes: PaneInfo[];
  onPlot: (series: PlottedSeries, targetPaneId?: number) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Local math helpers
// ---------------------------------------------------------------------------

/** Inner-join two series by time, keeping only positive a & b. */
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

/** percentile (0–100) of value within a sorted array. */
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

/** linear-interpolated quantile at percentile p (0–100) of a sorted array. */
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

/** conditional distribution of Y when X is near its current value. */
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

/** fixed-bin histogram. */
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

/** compact number formatting. */
function formatNum(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e3) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// Quick Analyze panel — Conditional Stats
// ---------------------------------------------------------------------------

const TRANSFORM_WINDOWS = [63, 126, 252, 504, 0];

export default function QuickAnalyzePanel({
  plottedSeries,
  onClose,
}: QuickAnalyzePanelProps) {
  const eligible = useMemo(
    () => plottedSeries.filter((s) => s.visible && s.data && s.data.length > 5),
    [plottedSeries],
  );

  const [seriesAId, setSeriesAId] = useState(eligible[0]?.id || "");
  const [seriesBId, setSeriesBId] = useState(eligible[1]?.id || "");
  const [tfA, setTfA] = useState<DataTransform>("raw");
  const [tfB, setTfB] = useState<DataTransform>("raw");
  const [tfWinA, setTfWinA] = useState(252);
  const [tfWinB, setTfWinB] = useState(252);
  const [bandHalf, setBandHalf] = useState(10);

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

  const transformedA = useMemo(
    () => (seriesA ? applyTransform(seriesA.data, tfA, tfWinA) : []),
    [seriesA, tfA, tfWinA],
  );
  const transformedB = useMemo(
    () => (seriesB ? applyTransform(seriesB.data, tfB, tfWinB) : []),
    [seriesB, tfB, tfWinB],
  );

  const conditional = useMemo<ConditionalStatsResult | null>(() => {
    if (!seriesA || !seriesB || !transformedA.length || !transformedB.length)
      return null;
    const aligned = alignSeries(transformedA, transformedB);
    return aligned.length < 20 ? null : conditionalStats(aligned, bandHalf);
  }, [seriesA, seriesB, transformedA, transformedB, bandHalf]);

  const condHistogram = useMemo<HistogramBin[]>(
    () =>
      !conditional || conditional.yValues.length === 0
        ? []
        : histogram(conditional.yValues, 24),
    [conditional],
  );

  const fullSampleStats = useMemo(() => {
    if (!seriesB) return null;
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
  }, [seriesB, transformedB]);

  const maxBinCount = condHistogram.reduce(
    (acc, bin) => (bin.count > acc ? bin.count : acc),
    0,
  );

  return (
    <div
      className="fixed top-20 right-4 z-50 bg-card border border-border rounded-md shadow-xl p-3 w-[460px] max-h-[calc(100vh-6rem)] overflow-y-auto"
      data-testid="quick-analyze-panel"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
          Quick Analyze — Conditional Stats
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

      {eligible.length < 2 ? (
        <div className="text-[11px] text-muted-foreground py-4 text-center">
          Need at least 2 visible series on the chart.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] text-muted-foreground leading-tight">
            Distribution of Y when X is near its current value. For rolling
            correlation + lead-lag, use the sidebar&apos;s{" "}
            <span className="text-foreground font-medium">Pairs &amp; Formula</span>{" "}
            → Pair Math → Correlation.
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Series A (X — condition on)
            </Label>
            <Select value={seriesAId} onValueChange={setSeriesAId}>
              <SelectTrigger className="h-7 text-[11px] mt-1" data-testid="qa-series-a">
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
              {(["raw", "zscore", "percentile"] as DataTransform[]).map((tf) => (
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
              ))}
              {tfA !== "raw" && (
                <Select value={String(tfWinA)} onValueChange={(v) => setTfWinA(Number(v))}>
                  <SelectTrigger className="h-5 w-[58px] text-[9px] px-1.5" data-testid="qa-tfA-win">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSFORM_WINDOWS.map((win) => (
                      <SelectItem key={win} value={String(win)} className="text-[10px]">
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
              Series B (Y — distribution of)
            </Label>
            <Select value={seriesBId} onValueChange={setSeriesBId}>
              <SelectTrigger className="h-7 text-[11px] mt-1" data-testid="qa-series-b">
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
              {(["raw", "zscore", "percentile"] as DataTransform[]).map((tf) => (
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
              ))}
              {tfB !== "raw" && (
                <Select value={String(tfWinB)} onValueChange={(v) => setTfWinB(Number(v))}>
                  <SelectTrigger className="h-5 w-[58px] text-[9px] px-1.5" data-testid="qa-tfB-win">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSFORM_WINDOWS.map((win) => (
                      <SelectItem key={win} value={String(win)} className="text-[10px]">
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
                (pctile {conditional.xCurrentPctile.toFixed(0)}%); sampling X ∈
                [pctile {conditional.xBand[0].toFixed(0)}–
                {conditional.xBand[1].toFixed(0)}%]. Matched{" "}
                <span className="text-foreground font-medium">{conditional.n}</span>{" "}
                bars.
              </div>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-normal py-0.5">Stat</th>
                    <th className="text-right font-normal py-0.5">Conditional Y</th>
                    <th className="text-right font-normal py-0.5">Full-sample Y</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr>
                    <td>Min</td>
                    <td className="text-right">{formatNum(conditional.y.min)}</td>
                    <td className="text-right text-muted-foreground">
                      {formatNum(fullSampleStats?.min ?? NaN)}
                    </td>
                  </tr>
                  <tr>
                    <td>P25</td>
                    <td className="text-right">{formatNum(conditional.y.p25)}</td>
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
                    <td className="text-right">{formatNum(conditional.y.mean)}</td>
                    <td className="text-right text-muted-foreground">
                      {formatNum(fullSampleStats?.mean ?? NaN)}
                    </td>
                  </tr>
                  <tr>
                    <td>P75</td>
                    <td className="text-right">{formatNum(conditional.y.p75)}</td>
                    <td className="text-right text-muted-foreground">
                      {formatNum(fullSampleStats?.p75 ?? NaN)}
                    </td>
                  </tr>
                  <tr>
                    <td>Max</td>
                    <td className="text-right">{formatNum(conditional.y.max)}</td>
                    <td className="text-right text-muted-foreground">
                      {formatNum(fullSampleStats?.max ?? NaN)}
                    </td>
                  </tr>
                  <tr className="border-t border-border">
                    <td>Std</td>
                    <td className="text-right">{formatNum(conditional.y.std)}</td>
                    <td className="text-right text-muted-foreground">—</td>
                  </tr>
                </tbody>
              </table>
              <div className="text-[10px] text-muted-foreground border-t border-border pt-1">
                Y today:{" "}
                <span className="text-foreground font-medium">
                  {formatNum(conditional.yCurrent)}
                </span>
                {conditional.y && Number.isFinite(conditional.yCurrent) && (
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
                      {conditional.yCurrent > conditional.y.p50 ? "+" : ""}
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
                  <svg width="100%" height="70" viewBox="0 0 320 70" preserveAspectRatio="none">
                    {condHistogram.map((bin, i) => {
                      const x = (i / condHistogram.length) * 320;
                      const binW = 320 / condHistogram.length;
                      const barH = maxBinCount > 0 ? (bin.count / maxBinCount) * 60 : 0;
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
                          fill={isToday ? "#fbbf24" : isMedian ? "#60a5fa" : "#64748b"}
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
        </div>
      )}
    </div>
  );
}
