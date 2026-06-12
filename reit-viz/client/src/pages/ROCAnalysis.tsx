// Reconstructed from recovered-bundle/ROCAnalysis-kpcfSeFI.js on 2026-06-11
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAppContext } from "@/lib/useAppContext";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { fetchTickerData } from "@/lib/fetchTickerData";
import { isBasketTicker } from "@/lib/basketUtils";
import { Button } from "@/components/ui/button";
import { Download, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { B as BasketTickerPill } from "@/components/BasketTickerPill";

const ROC_LOOKBACK_OPTIONS = [
  { days: 5, label: "5d" },
  { days: 10, label: "10d" },
  { days: 21, label: "21d (1M)" },
  { days: 42, label: "42d (2M)" },
  { days: 63, label: "63d (3M)" },
  { days: 126, label: "126d (6M)" },
  { days: 252, label: "252d (1Y)" },
];

const FORWARD_HORIZON_OPTIONS = [
  { days: 1, label: "1d" },
  { days: 5, label: "5d" },
  { days: 10, label: "10d" },
  { days: 21, label: "21d (1M)" },
  { days: 63, label: "63d (3M)" },
  { days: 126, label: "126d (6M)" },
  { days: 252, label: "252d (1Y)" },
];

const BUCKET_OPTIONS = [
  { n: 5, label: "Quintiles (5)" },
  { n: 10, label: "Deciles (10)" },
  { n: 20, label: "Vigintiles (20)" },
];

function computeROC(prices: (number | null)[], lookback: number): (number | null)[] {
  const result = new Array(prices.length).fill(null);
  for (let i = lookback; i < prices.length; i++) {
    const prev = prices[i - lookback];
    const curr = prices[i];
    if (prev != null && curr != null && prev !== 0) {
      result[i] = (curr - prev) / prev * 100;
    }
  }
  return result;
}

function computeForwardReturn(prices: (number | null)[], horizon: number): (number | null)[] {
  const result = new Array(prices.length).fill(null);
  for (let i = 0; i + horizon < prices.length; i++) {
    const curr = prices[i];
    const future = prices[i + horizon];
    if (curr != null && future != null && curr !== 0) {
      result[i] = (future - curr) / curr * 100;
    }
  }
  return result;
}

function spearmanCorrelation(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 10) return null;
  const n = x.length;
  const rank = (arr: number[]) => {
    const indexed = arr.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    let j = 0;
    while (j < n) {
      let g = j;
      while (g + 1 < n && indexed[g + 1].v === indexed[j].v) g++;
      const r = (j + g) / 2 + 1;
      for (let k = j; k <= g; k++) ranks[indexed[k].i] = r;
      j = g + 1;
    }
    return ranks;
  };
  const rx = rank(x);
  const ry = rank(y);
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sx += rx[i]; sy += ry[i]; sxy += rx[i] * ry[i]; sxx += rx[i] * rx[i]; syy += ry[i] * ry[i];
  }
  const num = n * sxy - sx * sy;
  const denom = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return denom === 0 ? null : num / denom;
}

function pearsonCorrelation(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 10) return null;
  const n = x.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i]; sxy += x[i] * y[i]; sxx += x[i] * x[i]; syy += y[i] * y[i];
  }
  const num = n * sxy - sx * sy;
  const denom = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return denom === 0 ? null : num / denom;
}

interface BucketResult {
  bucket: number;
  rocMin: number;
  rocMax: number;
  rocMid: number;
  count: number;
  meanFwdReturn: number;
  medianFwdReturn: number;
  hitRate: number;
  stdFwdReturn: number;
}

interface ROCAnalysisResult {
  ticker: string;
  rocLookback: number;
  forwardHorizon: number;
  bucketCount: number;
  buckets: BucketResult[];
  totalSamples: number;
  rawBars: number;
  expectedPairs: number;
  spearmanIC: number | null;
  pearsonIC: number | null;
  meanFwdAll: number;
  topMinusBottom: number;
  interpretation: "momentum" | "mean-reversion" | "noise";
  interpretationStrength: "strong" | "moderate" | "weak";
}

function computeROCAnalysis(
  prices: number[],
  rocLookback: number,
  forwardHorizon: number,
  bucketCount: number,
  ticker: string
): ROCAnalysisResult | null {
  const n = prices.length;
  const expectedPairs = Math.max(0, n - rocLookback - forwardHorizon);
  const roc = computeROC(prices, rocLookback);
  const fwd = computeForwardReturn(prices, forwardHorizon);
  const pairs: { roc: number; fwd: number }[] = [];
  for (let i = 0; i < prices.length; i++) {
    const r = roc[i];
    const f = fwd[i];
    if (r != null && f != null && Number.isFinite(r) && Number.isFinite(f)) {
      pairs.push({ roc: r, fwd: f });
    }
  }
  if (pairs.length < bucketCount * 10) return null;
  const sorted = pairs.slice().sort((a, b) => a.roc - b.roc);
  const total = sorted.length;
  const buckets: BucketResult[] = [];
  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * total / bucketCount);
    const end = Math.floor((b + 1) * total / bucketCount);
    const slice = sorted.slice(start, end);
    if (slice.length === 0) continue;
    const fwdVals = slice.map(p => p.fwd).slice().sort((a, c) => a - c);
    const mean = fwdVals.reduce((s, v) => s + v, 0) / fwdVals.length;
    const mid = Math.floor(fwdVals.length / 2);
    const median = fwdVals.length % 2 === 1 ? fwdVals[mid] : (fwdVals[mid - 1] + fwdVals[mid]) / 2;
    const hitCount = fwdVals.filter(v => v > 0).length;
    const variance = fwdVals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / fwdVals.length;
    buckets.push({
      bucket: b + 1,
      rocMin: slice[0].roc,
      rocMax: slice[slice.length - 1].roc,
      rocMid: (slice[0].roc + slice[slice.length - 1].roc) / 2,
      count: slice.length,
      meanFwdReturn: mean,
      medianFwdReturn: median,
      hitRate: hitCount / fwdVals.length,
      stdFwdReturn: Math.sqrt(variance),
    });
  }
  const rocVals = pairs.map(p => p.roc);
  const fwdVals2 = pairs.map(p => p.fwd);
  const spearmanIC = spearmanCorrelation(rocVals, fwdVals2);
  const pearsonIC = pearsonCorrelation(rocVals, fwdVals2);
  const meanFwdAll = fwdVals2.reduce((s, v) => s + v, 0) / fwdVals2.length;
  const topMinusBottom = buckets[buckets.length - 1].meanFwdReturn - buckets[0].meanFwdReturn;
  let interpretation: "momentum" | "mean-reversion" | "noise" = "noise";
  let interpretationStrength: "strong" | "moderate" | "weak" = "weak";
  const absIC = Math.abs(spearmanIC ?? 0);
  if (absIC >= 0.1) interpretationStrength = "strong";
  else if (absIC >= 0.05) interpretationStrength = "moderate";
  else interpretationStrength = "weak";
  if ((spearmanIC ?? 0) > 0.03 && topMinusBottom > 0) interpretation = "momentum";
  else if ((spearmanIC ?? 0) < -0.03 && topMinusBottom < 0) interpretation = "mean-reversion";
  else interpretation = "noise";
  return {
    ticker,
    rocLookback,
    forwardHorizon,
    bucketCount,
    buckets,
    totalSamples: total,
    rawBars: n,
    expectedPairs,
    spearmanIC,
    pearsonIC,
    meanFwdAll,
    topMinusBottom,
    interpretation,
    interpretationStrength,
  };
}

function bucketBgColor(bucket: BucketResult, allBuckets: BucketResult[]): string {
  const maxAbs = Math.max(...allBuckets.map(b => Math.abs(b.meanFwdReturn)));
  const norm = maxAbs > 0 ? bucket.meanFwdReturn / maxAbs : 0;
  if (norm > 0.5) return "bg-emerald-500/80";
  if (norm > 0.15) return "bg-emerald-500/50";
  if (norm > 0.02) return "bg-emerald-500/25";
  if (norm < -0.5) return "bg-red-500/80";
  if (norm < -0.15) return "bg-red-500/50";
  if (norm < -0.02) return "bg-red-500/25";
  return "bg-muted";
}

function formatPct(v: number, decimals = 2): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

function formatIC(v: number | null): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;
}

function icClass(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  const abs = Math.abs(v);
  if (abs >= 0.1) return v > 0 ? "text-emerald-400" : "text-red-400";
  if (abs >= 0.05) return v > 0 ? "text-emerald-400/70" : "text-red-400/70";
  return "text-muted-foreground";
}

interface StatCardProps {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  icon?: React.ReactNode;
}

function StatCard({ label, value, valueClass = "text-foreground", hint, icon }: StatCardProps) {
  return (
    <div className="border border-border rounded p-2 bg-card" title={hint}>
      <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-base font-bold font-mono flex items-center gap-1 ${valueClass}`}>
        {icon}{value}
      </div>
    </div>
  );
}

interface BucketChartProps {
  buckets: BucketResult[];
  maxAbsMean: number;
  meanFwdAll: number;
}

function BucketChart({ buckets, maxAbsMean, meanFwdAll }: BucketChartProps) {
  const scale = 102 / maxAbsMean;
  const baselineTop = 108 - meanFwdAll * scale;
  return (
    <div className="relative w-full" style={{ height: 240 }}>
      <div className="relative w-full" style={{ height: 216 }}>
        <div className="absolute left-0 right-0 border-t border-border z-0" style={{ top: 108 }} />
        <div
          className="absolute left-0 right-0 border-t border-dashed border-amber-500/60 z-0"
          style={{ top: baselineTop }}
        />
        <div className="absolute inset-0 flex gap-1 px-1">
          {buckets.map(bucket => {
            const isPositive = bucket.meanFwdReturn >= 0;
            const barHeight = Math.max(2, Math.abs(bucket.meanFwdReturn) * scale);
            const barTop = isPositive ? 108 - barHeight : 108;
            return (
              <div key={bucket.bucket} className="flex-1 relative group">
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full hidden group-hover:block z-20 bg-popover border border-border rounded px-2 py-1 text-[10px] font-mono text-foreground whitespace-nowrap shadow-lg pointer-events-none">
                  <div className="font-bold">Bucket {bucket.bucket}</div>
                  <div>ROC: {formatPct(bucket.rocMin, 1)} → {formatPct(bucket.rocMax, 1)}</div>
                  <div>
                    Mean Fwd:{" "}
                    <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
                      {formatPct(bucket.meanFwdReturn)}
                    </span>
                  </div>
                  <div>Hit Rate: {(bucket.hitRate * 100).toFixed(1)}%</div>
                  <div>N = {bucket.count}</div>
                </div>
                <div className="absolute inset-0 cursor-pointer" />
                <div
                  className={`absolute left-0 right-0 ${bucketBgColor(bucket, buckets)} border ${
                    isPositive ? "border-emerald-500/80 rounded-t" : "border-red-500/80 rounded-b"
                  } transition-all`}
                  style={{ top: barTop, height: barHeight }}
                />
                <div
                  className={`absolute left-0 right-0 text-center text-[9px] font-mono font-bold ${
                    isPositive ? "text-emerald-300" : "text-red-300"
                  }`}
                  style={{ top: isPositive ? barTop - 14 : barTop + barHeight + 2 }}
                >
                  {formatPct(bucket.meanFwdReturn, 1)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-1 px-1 mt-1">
        {buckets.map(bucket => (
          <div key={bucket.bucket} className="flex-1 text-center text-[9px] font-mono text-muted-foreground">
            {bucket.bucket}
          </div>
        ))}
      </div>
    </div>
  );
}

interface InterpretationPanelProps {
  analysis: ROCAnalysisResult;
}

function InterpretationPanel({ analysis }: InterpretationPanelProps) {
  const top = analysis.buckets[analysis.buckets.length - 1];
  const bottom = analysis.buckets[0];
  const baseline = analysis.meanFwdAll;
  const topExcess = top.meanFwdReturn - baseline;
  const bottomExcess = bottom.meanFwdReturn - baseline;
  const ic = analysis.spearmanIC ?? 0;
  const items: { color: string; text: string }[] = [];

  if (analysis.interpretation === "momentum") {
    items.push({
      color: "text-emerald-400",
      text: `Strongest signal: highest ROC bucket (top ${(100 / analysis.bucketCount).toFixed(0)}%, ROC ≥ ${formatPct(top.rocMin, 1)}) outperforms by ${formatPct(topExcess)} vs baseline.`,
    });
    if (bottomExcess < -0.1) {
      items.push({
        color: "text-red-400",
        text: `Lowest ROC bucket (ROC ≤ ${formatPct(bottom.rocMax, 1)}) underperforms by ${formatPct(bottomExcess)} — momentum works in both directions.`,
      });
    }
  } else if (analysis.interpretation === "mean-reversion") {
    items.push({
      color: "text-emerald-400",
      text: `Strongest signal: lowest ROC bucket (ROC ≤ ${formatPct(bottom.rocMax, 1)}) outperforms by ${formatPct(bottomExcess)} vs baseline. Buy weakness.`,
    });
    if (topExcess < -0.1) {
      items.push({
        color: "text-red-400",
        text: `Highest ROC bucket (ROC ≥ ${formatPct(top.rocMin, 1)}) underperforms by ${formatPct(topExcess)} — fade strength.`,
      });
    }
  } else {
    items.push({
      color: "text-muted-foreground",
      text: `No clear monotonic relationship between ROC${analysis.rocLookback} and forward ${analysis.forwardHorizon}d return for ${analysis.ticker}. Spearman IC = ${formatIC(analysis.spearmanIC)}.`,
    });
  }

  if (Math.abs(ic) >= 0.1) {
    items.push({
      color: "text-emerald-400/80",
      text: `IC of ${formatIC(ic)} is strong (rule of thumb: |IC| ≥ 0.05 = signal, ≥ 0.10 = strong). This ROC lookback is predictive for ${analysis.ticker}.`,
    });
  } else if (Math.abs(ic) >= 0.05) {
    items.push({
      color: "text-amber-400/80",
      text: `IC of ${formatIC(ic)} is moderate. Some predictive value, but not robust on its own.`,
    });
  } else {
    items.push({
      color: "text-muted-foreground",
      text: `IC of ${formatIC(ic)} is weak. Try a different ROC lookback or forward horizon.`,
    });
  }

  items.push({
    color: "text-muted-foreground italic",
    text: "Try varying ROC lookback (5d–252d) and forward horizon (1d–252d) — momentum often shows up at 21d/63d ROC vs 21d/63d forward, while reversal often appears at very short (5d) or very long (252d) horizons.",
  });

  return (
    <div className="flex flex-col gap-1.5 text-[11px]">
      {items.map((item, i) => (
        <div key={i} className={item.color}>
          • {item.text}
        </div>
      ))}
    </div>
  );
}

export default function ROCAnalysis() {
  const { filteredTickersList } = useAppContext();
  const [tickers, setTickers] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [rocLookback, setRocLookback] = useState(21);
  const [forwardHorizon, setForwardHorizon] = useState(21);
  const [bucketCount, setBucketCount] = useState(10);
  const [result, setResult] = useState<ROCAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const list = await fetchWorkbookTickers();
      setTickers(list);
      if (!selectedTicker && list.length > 0) {
        const defaultTicker = filteredTickersList[0]?.ticker || list[0].ticker;
        setSelectedTicker(defaultTicker);
      }
    })();
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!selectedTicker) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTickerData(selectedTicker);
      const closePrices = data.close;
      if (!closePrices?.length) {
        setError(`No price data for ${selectedTicker}`);
        setResult(null);
        return;
      }
      const prices = closePrices.map(([, v]: [number, number]) => v).filter(
        (v: number) => v != null && Number.isFinite(v)
      );
      if (prices.length < rocLookback + forwardHorizon + 50) {
        setError(`Insufficient data: only ${prices.length} bars (need ${rocLookback + forwardHorizon + 50}+)`);
        setResult(null);
        return;
      }
      const analysis = computeROCAnalysis(prices, rocLookback, forwardHorizon, bucketCount, selectedTicker);
      if (!analysis) {
        setError("Could not compute analysis (insufficient samples)");
        setResult(null);
        return;
      }
      setResult(analysis);
    } catch (err: any) {
      setError(err?.message || "Analysis failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [selectedTicker, rocLookback, forwardHorizon, bucketCount]);

  useEffect(() => {
    if (selectedTicker) runAnalysis();
  }, [selectedTicker, rocLookback, forwardHorizon, bucketCount, runAnalysis]);

  const maxAbsMean = useMemo(
    () => (result ? Math.max(...result.buckets.map(b => Math.abs(b.meanFwdReturn)), 0.001) : 1),
    [result]
  );

  const handleExportCSV = useCallback(() => {
    if (!result) return;
    const headers = ["bucket", "roc_min_pct", "roc_max_pct", "roc_mid_pct", "n",
      "mean_fwd_return_pct", "median_fwd_return_pct", "hit_rate", "std_fwd_return_pct"];
    const rows = result.buckets.map(b => [
      b.bucket, b.rocMin.toFixed(4), b.rocMax.toFixed(4), b.rocMid.toFixed(4),
      b.count, b.meanFwdReturn.toFixed(4), b.medianFwdReturn.toFixed(4),
      b.hitRate.toFixed(4), b.stdFwdReturn.toFixed(4),
    ]);
    const comments = [
      `# ROC Analysis: ${result.ticker}`,
      `# ROC lookback: ${result.rocLookback}d`,
      `# Forward horizon: ${result.forwardHorizon}d`,
      `# Buckets: ${result.bucketCount}`,
      `# Samples: ${result.totalSamples}`,
      `# Spearman IC: ${formatIC(result.spearmanIC)}`,
      `# Pearson r: ${formatIC(result.pearsonIC)}`,
      `# Mean fwd return (all): ${formatPct(result.meanFwdAll)}`,
      `# Top - bottom spread: ${formatPct(result.topMinusBottom)}`,
    ];
    const csv = [...comments, headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roc-analysis-${result.ticker}-roc${result.rocLookback}-fwd${result.forwardHorizon}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const sortedTickers = useMemo(
    () => tickers.slice().sort((a, b) => a.ticker.localeCompare(b.ticker)),
    [tickers]
  );

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-card px-4 py-2">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Ticker</label>
            <select
              className={`text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[280px] ${
                isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""
              }`}
              value={isBasketTicker(selectedTicker) ? "" : selectedTicker}
              onChange={e => setSelectedTicker(e.target.value)}
              data-testid="select-ticker"
            >
              {sortedTickers.map(t => (
                <option key={t.ticker} value={t.ticker}>
                  {t.ticker} — {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Basket</label>
            <BasketTickerPill
              activeTicker={selectedTicker}
              onSelectTicker={setSelectedTicker}
              fallbackTicker={sortedTickers[0]?.ticker ?? null}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">ROC Lookback</label>
            <select
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[120px]"
              value={rocLookback}
              onChange={e => setRocLookback(Number(e.target.value))}
              data-testid="select-roc-lookback"
            >
              {ROC_LOOKBACK_OPTIONS.map(o => (
                <option key={o.days} value={o.days}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Forward Horizon</label>
            <select
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[120px]"
              value={forwardHorizon}
              onChange={e => setForwardHorizon(Number(e.target.value))}
              data-testid="select-fwd-horizon"
            >
              {FORWARD_HORIZON_OPTIONS.map(o => (
                <option key={o.days} value={o.days}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Buckets</label>
            <select
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[140px]"
              value={bucketCount}
              onChange={e => setBucketCount(Number(e.target.value))}
              data-testid="select-buckets"
            >
              {BUCKET_OPTIONS.map(o => (
                <option key={o.n} value={o.n}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          {result && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={handleExportCSV}
              data-testid="export-csv"
            >
              <Download className="w-3 h-3" />
              CSV
            </Button>
          )}
        </div>
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          Sorts every historical day's ROC into {bucketCount} equal-frequency buckets, then reports the average
          forward {forwardHorizon}d return inside each bucket. A monotonic up-slope means momentum (high ROC →
          high forward returns); a down-slope means mean-reversion (high ROC → low forward returns); flat means
          no signal.
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Computing…</span>
          </div>
        )}
        {error && !loading && (
          <div className="text-sm text-red-400 p-4 border border-red-500/30 rounded bg-red-500/5">{error}</div>
        )}
        {result && !loading && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              <StatCard
                label="Samples"
                value={result.totalSamples.toLocaleString()}
                hint={`${result.rawBars.toLocaleString()} price bars → drop ${result.rocLookback} for ROC warmup + ${result.forwardHorizon} for forward window = ${result.expectedPairs.toLocaleString()} expected, ${result.totalSamples.toLocaleString()} actual valid (ROC, fwd) pairs. Each bucket holds ~${Math.floor(result.totalSamples / result.bucketCount)} samples.`}
              />
              <StatCard
                label="Spearman IC"
                value={formatIC(result.spearmanIC)}
                valueClass={icClass(result.spearmanIC)}
                hint="Rank correlation between ROC and forward return. Above ±0.05 = signal, ±0.10 = strong"
              />
              <StatCard label="Pearson r" value={formatIC(result.pearsonIC)} valueClass={icClass(result.pearsonIC)} />
              <StatCard
                label="Top − Bottom Spread"
                value={formatPct(result.topMinusBottom)}
                valueClass={result.topMinusBottom > 0 ? "text-emerald-400" : "text-red-400"}
                hint="Mean fwd return of highest-ROC bucket minus lowest-ROC bucket"
              />
              <StatCard
                label="Verdict"
                value={
                  result.interpretation === "momentum"
                    ? `${result.interpretationStrength} momentum`
                    : result.interpretation === "mean-reversion"
                    ? `${result.interpretationStrength} reversion`
                    : "noise"
                }
                valueClass={
                  result.interpretation === "momentum"
                    ? "text-emerald-400"
                    : result.interpretation === "mean-reversion"
                    ? "text-amber-400"
                    : "text-muted-foreground"
                }
                icon={
                  result.interpretation === "momentum" ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : result.interpretation === "mean-reversion" ? (
                    <TrendingDown className="w-3 h-3" />
                  ) : (
                    <Minus className="w-3 h-3" />
                  )
                }
              />
            </div>
            <div className="border border-border rounded p-4 bg-card">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Mean Forward {result.forwardHorizon}d Return by ROC{result.rocLookback} Bucket
              </div>
              <BucketChart buckets={result.buckets} maxAbsMean={maxAbsMean} meanFwdAll={result.meanFwdAll} />
              <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                <span>Bucket 1 = lowest ROC{result.rocLookback}</span>
                <span>Dashed line = unconditional mean fwd return ({formatPct(result.meanFwdAll)})</span>
                <span>Bucket {result.bucketCount} = highest ROC{result.rocLookback}</span>
              </div>
            </div>
            <div className="border border-border rounded overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="bg-card text-muted-foreground border-b border-border">
                    <th className="text-left px-3 py-2 font-bold">Bucket</th>
                    <th className="text-right px-3 py-2 font-bold">ROC Range</th>
                    <th className="text-right px-3 py-2 font-bold">N</th>
                    <th className="text-right px-3 py-2 font-bold">Mean Fwd</th>
                    <th className="text-right px-3 py-2 font-bold">Median Fwd</th>
                    <th className="text-right px-3 py-2 font-bold">Hit Rate</th>
                    <th className="text-right px-3 py-2 font-bold">Std Dev</th>
                    <th className="text-right px-3 py-2 font-bold">Sharpe-ish</th>
                  </tr>
                </thead>
                <tbody>
                  {result.buckets.map(bucket => {
                    const sharpeish = bucket.stdFwdReturn > 0 ? bucket.meanFwdReturn / bucket.stdFwdReturn : 0;
                    return (
                      <tr key={bucket.bucket} className="border-b border-border/50 hover:bg-white/5">
                        <td className="px-3 py-2 font-bold text-foreground">{bucket.bucket}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {formatPct(bucket.rocMin, 1)} → {formatPct(bucket.rocMax, 1)}
                        </td>
                        <td className="px-3 py-2 text-right">{bucket.count}</td>
                        <td className={`px-3 py-2 text-right font-bold ${bucket.meanFwdReturn > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatPct(bucket.meanFwdReturn)}
                        </td>
                        <td className={`px-3 py-2 text-right ${bucket.medianFwdReturn > 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
                          {formatPct(bucket.medianFwdReturn)}
                        </td>
                        <td className={`px-3 py-2 text-right ${bucket.hitRate > 0.55 ? "text-emerald-400" : bucket.hitRate < 0.45 ? "text-red-400" : "text-muted-foreground"}`}>
                          {(bucket.hitRate * 100).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {bucket.stdFwdReturn.toFixed(2)}%
                        </td>
                        <td className={`px-3 py-2 text-right ${Math.abs(sharpeish) > 0.05 ? sharpeish > 0 ? "text-emerald-400" : "text-red-400" : "text-muted-foreground"}`}>
                          {sharpeish.toFixed(3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border border-border rounded p-4 bg-card">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Interpretation
              </div>
              <InterpretationPanel analysis={result} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
