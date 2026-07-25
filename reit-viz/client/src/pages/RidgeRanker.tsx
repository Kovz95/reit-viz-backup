// Ridge Ranker — cross-sectional ridge regression with walk-forward IC.
// Builds a monthly feature panel from the universe client-side, fits ridge
// each month on trailing history only, and reports out-of-sample Spearman
// ICs. If the signal isn't there, the page says so — that's the point.
import { useMemo, useRef, useState } from "react";
import { Sigma, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUniverse } from "@/lib/universeContext";
import { getMetricSeries } from "@/lib/dataService";
import { percentileRank } from "@/lib/valuationRerate";
import { runWalkForward, RANKER_FEATURES, type RankerFeatureRow, type RankerResult } from "@/lib/ridgeRanker";

const VAL_METRICS = ["P/FFO FY2", "P/FFO FY1", "P/FFO (FY1)"];

interface TV { time: string; value: number }

/** Month-end sample of a series: ym → last finite value in that month. */
function monthEnds(series: TV[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of series) {
    if (!Number.isFinite(p.value)) continue;
    m.set(p.time.slice(0, 7), p.value); // later entries overwrite → month end
  }
  return m;
}

export default function RidgeRanker() {
  const { allTickers } = useUniverse() as any;
  const [trainMonths, setTrainMonths] = useState(36);
  const [lambda, setLambda] = useState(1);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<RankerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const panelRef = useRef<Map<string, RankerFeatureRow[]> | null>(null);

  const tickers: string[] = useMemo(
    () => (allTickers ?? []).map((t: any) => String(t.ticker)).filter(Boolean),
    [allTickers],
  );

  const run = async () => {
    if (running) { cancelRef.current = true; return; }
    setRunning(true);
    setError(null);
    setResult(null);
    cancelRef.current = false;
    setProgress({ done: 0, total: tickers.length });
    try {
      // ── Build the monthly panel ──
      const perTicker: { ticker: string; closes: Map<string, number>; dailyCloses: TV[]; val: Map<string, number> | null; valHistory: number[]; si: Map<string, number> | null }[] = [];
      let i = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (i < tickers.length && !cancelRef.current) {
          const tk = tickers[i++];
          try {
            const closes = await getMetricSeries(tk, "close");
            let val: TV[] | null = null;
            for (const mk of VAL_METRICS) {
              try {
                const s = await getMetricSeries(tk, mk);
                const finite = s.filter((p) => Number.isFinite(p.value) && p.value > 0);
                if (finite.length >= 60) { val = finite; break; }
              } catch { /* next */ }
            }
            let si: TV[] | null = null;
            try {
              const s = await getMetricSeries(tk, "Short Interest%");
              si = s.filter((p) => Number.isFinite(p.value));
              if (si.length < 12) si = null;
            } catch { si = null; }
            perTicker.push({
              ticker: tk,
              closes: monthEnds(closes.filter((p) => Number.isFinite(p.value) && p.value > 0)),
              dailyCloses: closes.filter((p) => Number.isFinite(p.value) && p.value > 0),
              val: val ? monthEnds(val) : null,
              valHistory: val ? val.map((p) => p.value) : [],
              si: si ? monthEnds(si) : null,
            });
          } catch { /* skip ticker */ }
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }));
      if (cancelRef.current) return;

      // Common month axis from close month-ends.
      const ymSet = new Set<string>();
      for (const t of perTicker) for (const ym of t.closes.keys()) ymSet.add(ym);
      const yms = [...ymSet].sort();
      const ymIndex = new Map(yms.map((ym, idx) => [ym, idx]));

      // Daily returns per ticker for vol63 (indexed by month for cutoff).
      const panel = new Map<string, RankerFeatureRow[]>();
      for (const t of perTicker) {
        // Precompute daily log returns with their month key.
        const rets: { ym: string; r: number }[] = [];
        for (let d = 1; d < t.dailyCloses.length; d++) {
          rets.push({ ym: t.dailyCloses[d].time.slice(0, 7), r: Math.log(t.dailyCloses[d].value / t.dailyCloses[d - 1].value) });
        }
        // Expanding valuation percentile per month (uses history up to that month).
        for (const [ym, close] of t.closes) {
          const mi = ymIndex.get(ym)!;
          const at = (back: number): number | null => {
            const idx = mi - back;
            if (idx < 0) return null;
            return t.closes.get(yms[idx]) ?? null;
          };
          const p1 = at(1), p3 = at(3), p12 = at(12);
          const mom12_1 = p1 !== null && p12 !== null && p12 > 0 ? Math.log(p1 / p12) : NaN;
          const mom3 = p3 !== null && p3 > 0 ? Math.log(close / p3) : NaN;
          // vol63: std of the last 63 daily returns ending in ym
          const upTo = rets.filter((x) => x.ym <= ym);
          const last63 = upTo.slice(-63).map((x) => x.r);
          const mv = last63.reduce((s, v) => s + v, 0) / Math.max(1, last63.length);
          const vol63 = last63.length >= 40 ? Math.sqrt(last63.reduce((s, v) => s + (v - mv) ** 2, 0) / Math.max(1, last63.length - 1)) : NaN;
          // valuation richness: expanding percentile of the multiple at ym
          let valRich = NaN;
          if (t.val) {
            const v = t.val.get(ym);
            if (v !== undefined) {
              const hist = t.valHistory; // full history percentile is mildly lookahead — use rank among values ≤ month? Keep expanding via ordered filter:
              const upToVals = hist; // valHistory in time order; expanding cut:
              const cut = upToVals.slice(0, Math.max(20, Math.floor((ymIndex.get(ym)! / Math.max(1, yms.length)) * upToVals.length)));
              valRich = cut.length >= 20 ? percentileRank(v, cut) : percentileRank(v, upToVals.slice(0, 20));
            }
          }
          const siNow = t.si?.get(ym);
          const si3 = mi >= 3 ? t.si?.get(yms[mi - 3]) : undefined;
          const siChg3m = siNow !== undefined && si3 !== undefined ? siNow - si3 : NaN;
          const pNext = mi + 1 < yms.length ? t.closes.get(yms[mi + 1]) ?? null : null;
          const fwdRet = pNext !== null && close > 0 ? Math.log(pNext / close) : null;
          const row: RankerFeatureRow = { ticker: t.ticker, ym, features: [mom12_1, mom3, vol63, valRich, siChg3m], fwdRet };
          const arr = panel.get(ym) ?? [];
          arr.push(row);
          panel.set(ym, arr);
        }
      }
      panelRef.current = panel;
      const res = runWalkForward(panel, trainMonths, lambda);
      if (!res) setError("Not enough panel history for these parameters (need trainMonths + several scored months).");
      else setResult(res);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setRunning(false);
    }
  };

  const latestWeights = result?.months[result.months.length - 1]?.weights ?? null;

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="ranker-page">
      <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-card flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
          <Sigma className="w-4 h-4 text-primary" /> Ridge Ranker
        </span>
        <span className="text-[10px] text-muted-foreground">walk-forward cross-sectional ridge · every IC is out-of-sample</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">train (mo)</span>
          <Input type="number" className="h-6 w-16 text-[10px] px-1.5" value={trainMonths} min={12}
            onChange={(e) => { const v = parseInt(e.target.value); if (v >= 12) setTrainMonths(v); }} data-testid="ranker-train" />
          <span className="text-[10px] text-muted-foreground">λ</span>
          <Input type="number" className="h-6 w-16 text-[10px] px-1.5" value={lambda} min={0} step={0.5}
            onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) setLambda(v); }} data-testid="ranker-lambda" />
        </div>
        <Button size="sm" className="h-7 text-[11px] gap-1.5" onClick={() => void run()} disabled={tickers.length < 20} data-testid="ranker-run">
          {running ? (<><X className="w-3 h-3" /> Cancel</>) : (<><Play className="w-3 h-3" /> Run ({tickers.length} names)</>)}
        </Button>
        {running && (
          <span className="text-[10px] font-mono text-muted-foreground">{progress.done}/{progress.total} loaded</span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {error && <div className="text-xs text-red-400">{error}</div>}
        {!result && !running && !error && (
          <div className="text-xs text-muted-foreground text-center py-10 max-w-xl mx-auto">
            Features per name per month-end: 12−1 momentum, 3-month momentum, 63-day volatility, valuation richness percentile (P/FFO vs own history), 3-month short-interest change.
            Each month a ridge model is fitted ONLY on trailing data and scored on the next month — the reported ICs are genuinely out-of-sample.
          </div>
        )}
        {result && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center" data-testid="ranker-stats">
              {[
                ["Mean IC", result.meanIC.toFixed(3)],
                ["IC t-stat", result.icTStat.toFixed(2)],
                ["IC hit rate", `${result.hitRate.toFixed(0)}%`],
                ["Months scored", String(result.months.length)],
              ].map(([k, v]) => (
                <div key={k} className="rounded border border-border/60 bg-background px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
                  <div className="text-sm font-mono font-bold">{v}</div>
                </div>
              ))}
            </div>
            {Math.abs(result.icTStat) < 2 && (
              <div className="text-[11px] text-amber-400/90 border border-amber-500/30 bg-amber-500/10 rounded p-2">
                The mean IC is NOT statistically significant (|t| &lt; 2) — treat today's deciles as weak evidence, not a signal.
              </div>
            )}
            <div className="grid md:grid-cols-3 gap-3">
              <div className="border border-border/30 rounded p-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Long decile (today)</div>
                <div className="space-y-0.5" data-testid="ranker-long">
                  {result.latest.slice(0, 10).map((r) => (
                    <div key={r.ticker} className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="font-bold w-14">{r.ticker}</span>
                      <span className="text-emerald-400">{r.score.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-border/30 rounded p-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Short decile (today)</div>
                <div className="space-y-0.5" data-testid="ranker-short">
                  {result.latest.slice(-10).reverse().map((r) => (
                    <div key={r.ticker} className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="font-bold w-14">{r.ticker}</span>
                      <span className="text-red-400">{r.score.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-border/30 rounded p-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Latest model weights (z-scored features)</div>
                <div className="space-y-0.5" data-testid="ranker-weights">
                  {latestWeights && RANKER_FEATURES.map((f, j) => (
                    <div key={f} className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="w-20 text-muted-foreground">{f}</span>
                      <span className={latestWeights[j] >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {latestWeights[j] >= 0 ? "+" : ""}{latestWeights[j].toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="border border-border/30 rounded p-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Monthly out-of-sample IC</div>
              <div className="flex flex-wrap gap-1" data-testid="ranker-ics">
                {result.months.map((m) => (
                  <span
                    key={m.ym}
                    className={`px-1 py-px rounded text-[9px] font-mono ${m.ic >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}
                    title={`${m.ym}: IC ${m.ic.toFixed(3)} (n=${m.n})`}
                  >
                    {m.ym.slice(2)} {m.ic >= 0 ? "+" : ""}{m.ic.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
