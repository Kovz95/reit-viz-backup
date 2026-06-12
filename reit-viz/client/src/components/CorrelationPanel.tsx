import { useState, useMemo, useCallback } from "react";
import { X, BarChart3, LineChart, Divide, TrendingUp, Minus, BarChart2, Percent, GitBranch, Sigma, FlaskConical, SquareFunction, BarChartHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { PlottedSeries } from "@/pages/Dashboard";
import { computeCorrelation } from "@/lib/indicators";

interface CorrelationPanelProps {
  plottedSeries: PlottedSeries[];
  onClose: () => void;
  /** Called to plot a derived series on the chart */
  onPlotCorrelation?: (series: PlottedSeries) => void;
}

const CORR_COLORS = ["#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#06b6d4", "#84cc16", "#f43f5e"];
let colorIdx = 0;
function nextColor() {
  return CORR_COLORS[colorIdx++ % CORR_COLORS.length];
}

type TV = { time: string; value: number };
type Aligned = { time: string; a: number; b: number };

/** Align two time-series by date */
function alignSeries(a: TV[], b: TV[]): Aligned[] {
  const mapB = new Map(b.map(d => [d.time, d.value]));
  const result: Aligned[] = [];
  for (const d of a) {
    const bVal = mapB.get(d.time);
    if (bVal !== undefined && bVal !== 0 && d.value > 0 && bVal > 0) {
      result.push({ time: d.time, a: d.value, b: bVal });
    }
  }
  return result;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;

// ──────────── Derived series computations (matching Pairs tab) ────────────

function computeRatio(al: Aligned[]): TV[] {
  return al.map(d => ({ time: d.time, value: d.a / d.b }));
}

function computeLogRatio(al: Aligned[]): TV[] {
  return al.map(d => ({ time: d.time, value: r4(Math.log(d.a / d.b)) }));
}

function computeSpread(al: Aligned[]): TV[] {
  return al.map(d => ({ time: d.time, value: d.a - d.b }));
}

/** Rolling z-score of log(A/B) */
function computeLogRatioZScore(al: Aligned[], win: number): TV[] {
  const lr = al.map(d => Math.log(d.a / d.b));
  const result: TV[] = [];
  for (let i = win - 1; i < lr.length; i++) {
    let sum = 0, sumSq = 0;
    for (let j = i - win + 1; j <= i; j++) { sum += lr[j]; sumSq += lr[j] ** 2; }
    const mean = sum / win;
    const std = Math.sqrt(Math.max(0, sumSq / win - mean ** 2));
    result.push({ time: al[i].time, value: r4(std === 0 ? 0 : (lr[i] - mean) / std) });
  }
  return result;
}

/** Spread Z: rolling beta on log prices → spread → z-score (dual-window, matches Pairs) */
function computeSpreadZ(al: Aligned[], betaLookback: number, spreadZWindow: number): TV[] {
  if (al.length < betaLookback) return [];
  const logA = al.map(d => Math.log(d.value !== undefined ? d.a : d.a));
  const logB = al.map(d => Math.log(d.b));
  // Rolling beta on log prices → spread
  const rollingSpread: { time: string; value: number }[] = [];
  for (let i = betaLookback - 1; i < logA.length; i++) {
    let sX = 0, sY = 0, sXY = 0, sXX = 0;
    for (let j = i - betaLookback + 1; j <= i; j++) {
      sX += logB[j]; sY += logA[j]; sXY += logB[j] * logA[j]; sXX += logB[j] * logB[j];
    }
    const mX = sX / betaLookback, mY = sY / betaLookback;
    const dXX = sXX - betaLookback * mX * mX;
    const dXY = sXY - betaLookback * mX * mY;
    const b = dXX === 0 ? 1 : dXY / dXX;
    rollingSpread.push({ time: al[i].time, value: logA[i] - b * logB[i] });
  }
  // Z-score the spread
  const result: TV[] = [];
  for (let i = spreadZWindow - 1; i < rollingSpread.length; i++) {
    let sum = 0, sumSq = 0;
    for (let j = i - spreadZWindow + 1; j <= i; j++) {
      sum += rollingSpread[j].value; sumSq += rollingSpread[j].value ** 2;
    }
    const mean = sum / spreadZWindow;
    const std = Math.sqrt(Math.max(0, sumSq / spreadZWindow - mean ** 2));
    result.push({ time: rollingSpread[i].time, value: r4(std === 0 ? 0 : (rollingSpread[i].value - mean) / std) });
  }
  return result;
}

/** OLS Residual Z: rolling OLS with intercept on log prices, z-score the residual */
function computeOlsResidZ(al: Aligned[], olsWindow: number): TV[] {
  if (al.length < olsWindow) return [];
  const logA = al.map(d => Math.log(d.a));
  const logB = al.map(d => Math.log(d.b));
  const result: TV[] = [];
  for (let i = olsWindow - 1; i < logA.length; i++) {
    let sX = 0, sY = 0, sXY = 0, sXX = 0;
    for (let j = i - olsWindow + 1; j <= i; j++) {
      sX += logB[j]; sY += logA[j]; sXY += logB[j] * logA[j]; sXX += logB[j] * logB[j];
    }
    const n = olsWindow, mX = sX / n, mY = sY / n;
    const dXX = sXX - n * mX * mX, dXY = sXY - n * mX * mY;
    const beta = dXX === 0 ? 1 : dXY / dXX;
    const alpha = mY - beta * mX;
    // Residual std within window
    let sumResidSq = 0;
    for (let j = i - olsWindow + 1; j <= i; j++) {
      const resid = logA[j] - (alpha + beta * logB[j]);
      sumResidSq += resid * resid;
    }
    const residStd = Math.sqrt(sumResidSq / n);
    const currentResid = logA[i] - (alpha + beta * logB[i]);
    result.push({ time: al[i].time, value: r4(residStd === 0 ? 0 : currentResid / residStd) });
  }
  return result;
}

/** Beta-Adjusted Spread: full-sample OLS residual on log prices */
function computeBetaAdjSpread(al: Aligned[]): TV[] {
  if (al.length < 10) return [];
  const logA = al.map(d => Math.log(d.a));
  const logB = al.map(d => Math.log(d.b));
  let sX = 0, sY = 0, sXY = 0, sXX = 0;
  for (let i = 0; i < al.length; i++) {
    sX += logB[i]; sY += logA[i]; sXY += logB[i] * logA[i]; sXX += logB[i] * logB[i];
  }
  const n = al.length, mX = sX / n, mY = sY / n;
  const dXX = sXX - n * mX * mX, dXY = sXY - n * mX * mY;
  const hedgeRatio = dXX === 0 ? 1 : dXY / dXX;
  const alpha = mY - hedgeRatio * mX;
  return al.map((d, i) => ({
    time: d.time,
    value: r4(logA[i] - hedgeRatio * logB[i] - alpha),
  }));
}

/** Rolling beta (OLS of log returns A on B) */
function computeRollingBeta(al: Aligned[], win: number): TV[] {
  const retA: TV[] = [], retB: TV[] = [];
  for (let i = 1; i < al.length; i++) {
    retA.push({ time: al[i].time, value: Math.log(al[i].a / al[i - 1].a) });
    retB.push({ time: al[i].time, value: Math.log(al[i].b / al[i - 1].b) });
  }
  const result: TV[] = [];
  for (let i = win - 1; i < retA.length; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let j = i - win + 1; j <= i; j++) {
      sumX += retB[j].value; sumY += retA[j].value;
      sumXY += retB[j].value * retA[j].value; sumXX += retB[j].value * retB[j].value;
    }
    const n = win, meanX = sumX / n;
    const ssXX = sumXX - n * meanX * meanX;
    const ssXY = sumXY - n * meanX * (sumY / n);
    result.push({ time: retA[i].time, value: r4(ssXX === 0 ? 0 : ssXY / ssXX) });
  }
  return result;
}

/** Rolling R² from OLS of log returns A on B */
function computeRollingR2(al: Aligned[], win: number): TV[] {
  const retA: TV[] = [], retB: TV[] = [];
  for (let i = 1; i < al.length; i++) {
    retA.push({ time: al[i].time, value: Math.log(al[i].a / al[i - 1].a) });
    retB.push({ time: al[i].time, value: Math.log(al[i].b / al[i - 1].b) });
  }
  const result: TV[] = [];
  for (let i = win - 1; i < retA.length; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    for (let j = i - win + 1; j <= i; j++) {
      const x = retB[j].value, y = retA[j].value;
      sumX += x; sumY += y; sumXY += x * y; sumXX += x * x; sumYY += y * y;
    }
    const n = win, meanX = sumX / n, meanY = sumY / n;
    const ssXX = sumXX - n * meanX * meanX;
    const ssYY = sumYY - n * meanY * meanY;
    const ssXY = sumXY - n * meanX * meanY;
    const r2 = (ssXX === 0 || ssYY === 0) ? 0 : (ssXY * ssXY) / (ssXX * ssYY);
    result.push({ time: retA[i].time, value: r4(r2) });
  }
  return result;
}

/** Historical percentile rank of ratio (0-100) */
function computePercentileRank(ratio: TV[]): TV[] {
  const result: TV[] = [];
  const sorted: number[] = [];
  const binaryInsert = (arr: number[], val: number) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid] < val) lo = mid + 1; else hi = mid; }
    arr.splice(lo, 0, val);
  };
  const binaryRank = (arr: number[], val: number): number => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (arr[mid] <= val) lo = mid + 1; else hi = mid; }
    return lo;
  };
  for (let i = 0; i < ratio.length; i++) {
    binaryInsert(sorted, ratio[i].value);
    const rank = binaryRank(sorted, ratio[i].value);
    result.push({ time: ratio[i].time, value: Math.round((rank / sorted.length) * 10000) / 100 });
  }
  return result;
}

// ──────────── Button definitions (Pairs tab parity) ────────────

type DerivedType = "correlation" | "ratio" | "logRatio" | "zscore" | "spreadZ" | "olsResidZ" | "spread" | "beta" | "betaAdjSpread" | "r2" | "percentile";

const DERIVED_DEFS: { type: DerivedType; icon: typeof LineChart; label: string; tip: string; group: string }[] = [
  // Core
  { type: "ratio", icon: Divide, label: "A/B", tip: "Ratio (A ÷ B)", group: "Core" },
  { type: "logRatio", icon: GitBranch, label: "ln", tip: "Log ratio ln(A/B)", group: "Core" },
  { type: "spread", icon: Minus, label: "A−B", tip: "Spread (A − B)", group: "Core" },
  // Z-Scores
  { type: "zscore", icon: TrendingUp, label: "Z", tip: "Z-score of log(A/B)", group: "Z-Score" },
  { type: "spreadZ", icon: Sigma, label: "SprdZ", tip: "Spread Z (rolling-β adjusted)", group: "Z-Score" },
  { type: "olsResidZ", icon: FlaskConical, label: "OLS-Z", tip: "OLS Residual Z-score", group: "Z-Score" },
  { type: "percentile", icon: Percent, label: "Pctl", tip: "Historical percentile rank of ratio", group: "Z-Score" },
  // Stats
  { type: "correlation", icon: LineChart, label: "Corr", tip: "Rolling Pearson correlation", group: "Stats" },
  { type: "beta", icon: BarChart2, label: "β", tip: "Rolling beta (OLS log returns)", group: "Stats" },
  { type: "r2", icon: SquareFunction, label: "R²", tip: "Rolling R² (OLS log returns)", group: "Stats" },
  { type: "betaAdjSpread", icon: BarChartHorizontal, label: "β-Sprd", tip: "Beta-adjusted spread (full-sample OLS residual)", group: "Stats" },
];

const GROUPS = ["Core", "Z-Score", "Stats"];

export default function CorrelationPanel({
  plottedSeries,
  onClose,
  onPlotCorrelation,
}: CorrelationPanelProps) {
  const [win, setWin] = useState(63);

  // Build all pairwise data
  const pairData = useMemo(() => {
    const visible = plottedSeries.filter((s) => s.visible && s.data.length > 0);
    if (visible.length < 2) return null;

    const pairs: {
      a: typeof visible[0]; b: typeof visible[0];
      aligned: Aligned[];
      corr: number;
      corrData: TV[];
    }[] = [];

    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const aligned = alignSeries(visible[i].data, visible[j].data);
        if (aligned.length < 2) continue;
        const corrData = computeCorrelation(
          visible[i].data,
          visible[j].data,
          Math.min(win, Math.min(visible[i].data.length, visible[j].data.length))
        );
        const lastCorr = corrData.length > 0 ? corrData[corrData.length - 1].value : 0;
        pairs.push({ a: visible[i], b: visible[j], aligned, corr: lastCorr, corrData });
      }
    }
    return pairs;
  }, [plottedSeries, win]);

  const plotDerived = useCallback((type: DerivedType, pair: NonNullable<typeof pairData>[number]) => {
    if (!onPlotCorrelation) return;
    const nameA = pair.a.label.split(" - ")[0];
    const nameB = pair.b.label.split(" - ")[0];
    let data: TV[] = [];
    let label = "";
    let ticker = "DERIVED";

    switch (type) {
      case "correlation":
        data = pair.corrData;
        label = `Corr: ${nameA}/${nameB} (${win}d)`;
        ticker = "CORR";
        break;
      case "ratio":
        data = computeRatio(pair.aligned);
        label = `Ratio: ${nameA}/${nameB}`;
        ticker = "RATIO";
        break;
      case "logRatio":
        data = computeLogRatio(pair.aligned);
        label = `Log Ratio: ${nameA}/${nameB}`;
        ticker = "LOGRATIO";
        break;
      case "zscore":
        data = computeLogRatioZScore(pair.aligned, win);
        label = `Z-Score: ${nameA}/${nameB} (${win}d)`;
        ticker = "ZSCORE";
        break;
      case "spreadZ":
        data = computeSpreadZ(pair.aligned, win, Math.max(8, Math.round(win / 8)));
        label = `Spread Z: ${nameA}/${nameB} (${win}d)`;
        ticker = "SPREADZ";
        break;
      case "olsResidZ":
        data = computeOlsResidZ(pair.aligned, win);
        label = `OLS Resid Z: ${nameA}/${nameB} (${win}d)`;
        ticker = "OLSRESIDZ";
        break;
      case "spread":
        data = computeSpread(pair.aligned);
        label = `Spread: ${nameA}−${nameB}`;
        ticker = "SPREAD";
        break;
      case "beta":
        data = computeRollingBeta(pair.aligned, win);
        label = `Beta: ${nameA}/${nameB} (${win}d)`;
        ticker = "BETA";
        break;
      case "r2":
        data = computeRollingR2(pair.aligned, win);
        label = `R²: ${nameA}/${nameB} (${win}d)`;
        ticker = "R2";
        break;
      case "betaAdjSpread":
        data = computeBetaAdjSpread(pair.aligned);
        label = `β-Adj Spread: ${nameA}/${nameB}`;
        ticker = "BETASPRD";
        break;
      case "percentile": {
        const ratio = computeRatio(pair.aligned);
        data = computePercentileRank(ratio);
        label = `Pct Rank: ${nameA}/${nameB}`;
        ticker = "PCTRANK";
        break;
      }
    }
    if (data.length === 0) return;

    const series: PlottedSeries = {
      id: `${type}:${pair.a.id}:${pair.b.id}:${Date.now()}`,
      ticker,
      metric: type,
      color: nextColor(),
      paneIndex: 0,
      data,
      visible: true,
      label,
    };
    onPlotCorrelation(series);
  }, [onPlotCorrelation, win]);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="w-[300px] border-l border-border bg-card/50 overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Pairs &amp; Derived Series</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="p-3 space-y-3">
        <div className="space-y-1">
          <Label className="text-[11px]">Rolling Window (bars)</Label>
          <div className="flex gap-1">
            <Input
              type="number"
              value={win}
              onChange={(e) => setWin(parseInt(e.target.value) || 63)}
              className="h-7 text-xs bg-background"
              data-testid="corr-window"
            />
            <div className="flex gap-0.5">
              {[21, 63, 126, 252].map((w) => (
                <Button
                  key={w}
                  variant={win === w ? "default" : "secondary"}
                  size="sm"
                  className="h-7 px-1.5 text-[10px]"
                  onClick={() => setWin(w)}
                >
                  {w === 21 ? "1M" : w === 63 ? "3M" : w === 126 ? "6M" : "1Y"}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {pairData && pairData.length > 0 ? (
          <div className="space-y-2">
            {pairData.map((pair, pi) => {
              const nameA = pair.a.label.split(" - ")[0];
              const nameB = pair.b.label.split(" - ")[0];
              return (
                <div key={pi} className="rounded border border-border bg-accent/20 p-2 space-y-1.5">
                  {/* Pair header with current correlation */}
                  <div className="flex items-center gap-1">
                    <div className="flex-1 truncate text-[11px] font-medium">
                      {nameA} / {nameB}
                    </div>
                    <div
                      className={`font-mono font-semibold tabular-nums text-[11px] ${
                        pair.corr > 0.5
                          ? "text-green-400"
                          : pair.corr < -0.5
                          ? "text-red-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      ρ={pair.corr.toFixed(3)}
                    </div>
                  </div>

                  {/* Derived series buttons grouped */}
                  {onPlotCorrelation && (
                    <div className="space-y-1">
                      {GROUPS.map(group => {
                        const defs = DERIVED_DEFS.filter(d => d.group === group);
                        return (
                          <div key={group}>
                            <div className="text-[9px] uppercase font-semibold text-muted-foreground tracking-wider mb-0.5">{group}</div>
                            <div className="flex flex-wrap gap-1">
                              {defs.map((def) => {
                                const Icon = def.icon;
                                return (
                                  <Tooltip key={def.type}>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-6 px-1.5 text-[10px] gap-1"
                                        onClick={() => plotDerived(def.type, pair)}
                                        data-testid={`plot-${def.type}-${pi}`}
                                      >
                                        <Icon className="w-3 h-3" />
                                        {def.label}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      {def.tip} — click to plot on chart
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Add 2+ series to see pairs &amp; derived series
          </div>
        )}

        <div className="border-t border-border pt-2 space-y-1">
          <p className="text-[10px] text-muted-foreground">
            <span className="font-semibold">Core:</span> A/B ratio, log ratio, spread.
            <span className="font-semibold"> Z-Score:</span> Raw Z (log ratio), Spread Z (rolling-β adjusted), OLS Resid Z, Pctl rank.
            <span className="font-semibold"> Stats:</span> Corr, β, R², β-adj spread.
          </p>
          <p className="text-[10px] text-muted-foreground">
            Rolling window applies to Z, SprdZ, OLS-Z, Corr, β, and R². Each click adds a new series to the first chart pane.
          </p>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}
