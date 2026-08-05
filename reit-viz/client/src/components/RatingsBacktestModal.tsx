// Ratings verdict backtest modal — forward returns conditioned on where Buy%
// (share of Buy in Buy/Hold/Sell analyst counts) sits vs its own history and
// its recent trend. Reuses the signal-agnostic percentile×trend engine from
// lib/siBacktest (states: high/low × rising/falling + mid) with ratings labels.
import { useEffect, useMemo, useState } from "react";
import { X, FlaskConical, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMetricSeries } from "@/lib/dataService";
import {
  runSIVerdictBacktest, SI_STATES,
  type SIBtParams, type SIState,
} from "@/lib/siBacktest";

const fmtSigned = (v: number, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;

// Ratings framing of the generic high/low × rising/falling states.
const RATINGS_STATE_LABELS: Record<SIState, { label: string; thesis: string }> = {
  "high-rising":  { label: "Loved & rising",     thesis: "upgrades into consensus love — momentum vs crowding fight" },
  "high-falling": { label: "Loved & fading",     thesis: "downgrades from crowded love — de-rating risk (short)" },
  "low-rising":   { label: "Unloved & improving", thesis: "upgrade cycle from a hated base — classic long setup" },
  "low-falling":  { label: "Unloved & falling",  thesis: "capitulating coverage — no prior; data decides" },
  "mid":          { label: "Mid / flat",         thesis: "no percentile extreme, or flat trend at one — baseline" },
};

// Buy% moves in chunks (one analyst flip on ~15 analysts ≈ 7pp), so the trend
// window and deadband default wider than the short-interest equivalents.
const DEFAULT_RATINGS_BT: SIBtParams = {
  pctileWindow: 504, hiPctile: 70, loPctile: 30, trendLookback: 63, deadband: 2,
  horizons: [21, 63, 126], stepDays: 5, minN: 8, primaryHorizon: 63,
};

import { downsampleSeries } from "@/lib/chartFrequency";

/** Monthly-bar preset: windows/horizons in MONTHS (36mo pctile window, 1-bar
 *  step, 1/3/6-month horizons) — the kernel is bar-agnostic. */
const MONTHLY_RATINGS_BT: SIBtParams = {
  pctileWindow: 24, hiPctile: 70, loPctile: 30, trendLookback: 3, deadband: 2,
  horizons: [1, 3, 6], stepDays: 1, minN: 8, primaryHorizon: 3,
  // Monthly bars: the daily 120/60-bar floors would null every backtest.
  minBars: 24, warmupBars: 12,
};

interface TV { time: string; value: number }

export default function RatingsBacktestModal({ ticker, name, onClose }: { ticker: string; name: string; onClose: () => void }) {
  const [params, setParams] = useState<SIBtParams>(DEFAULT_RATINGS_BT);
  // Bar mode: monthly resamples SI/price to calendar-month bars and swaps in
  // the monthly parameter preset (bar-count params mean MONTHS then).
  const [barMode, setBarMode] = useState<"daily" | "monthly">("daily");
  const changeBarMode = (m: "daily" | "monthly") => {
    if (m === barMode) return;
    setBarMode(m);
    setParams(m === "monthly" ? MONTHLY_RATINGS_BT : DEFAULT_RATINGS_BT);
  };
  const [data, setData] = useState<{ buyPct: TV[]; close: TV[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getMetricSeries(ticker, "Buy Ratings"),
      getMetricSeries(ticker, "Hold Ratings"),
      getMetricSeries(ticker, "Sell Ratings"),
      getMetricSeries(ticker, "close"),
    ]).then(([buy, hold, sell, close]) => {
      if (cancelled) return;
      const hm = new Map(hold.map((p) => [p.time, p.value]));
      const sm = new Map(sell.map((p) => [p.time, p.value]));
      const buyPct: TV[] = [];
      for (const p of buy) {
        const hv = hm.get(p.time), sv = sm.get(p.time);
        if (!Number.isFinite(p.value) || hv == null || sv == null || !Number.isFinite(hv) || !Number.isFinite(sv)) continue;
        const tot = p.value + hv + sv;
        if (tot > 0) buyPct.push({ time: p.time, value: (p.value / tot) * 100 });
      }
      setData({ buyPct, close });
    }).catch((e) => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; };
  }, [ticker]);

  const result = useMemo(() => {
    if (!data) return null;
    try {
      const sig = barMode === "monthly" ? (downsampleSeries(data.buyPct as any, "monthly") as TV[]) : data.buyPct;
      const px = barMode === "monthly" ? (downsampleSeries(data.close as any, "monthly") as TV[]) : data.close;
      return runSIVerdictBacktest(sig, px, params);
    } catch { return null; }
  }, [data, params, barMode]);

  const setNum = (key: keyof SIBtParams, v: number) => setParams(p => ({ ...p, [key]: v }));

  const exportCsv = () => {
    if (!result) return;
    const hs = params.horizons;
    const lines = [`date,state,buyPct,pctile,trend,${hs.map(h => `fwd${h}${barMode === "monthly" ? "mo" : "d"}`).join(",")}`];
    for (const s of result.samples) {
      lines.push([
        s.date, s.state, s.si.toFixed(2), s.pctile.toFixed(1), s.trend.toFixed(2),
        ...hs.map(h => s.fwd[h] == null ? "" : (s.fwd[h] as number).toFixed(3)),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `ratings-bt-${ticker}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  const num = (label: string, key: keyof SIBtParams, opts?: { step?: number; min?: number }) => (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        className="h-6 w-16 text-[10px] px-1.5"
        value={params[key] as number}
        step={opts?.step ?? 1}
        min={opts?.min ?? 0}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= (opts?.min ?? 0)) setNum(key, v); }}
        data-testid={`ratings-bt-${key}`}
      />
    </div>
  );

  const verdictColor = result?.verdict.side === "LONG"
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
    : result?.verdict.side === "SHORT"
      ? "bg-rose-500/15 text-rose-400 border-rose-500/40"
      : "bg-muted/40 text-muted-foreground border-border";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose} data-testid="ratings-bt-modal">
      <div className="w-[min(900px,94vw)] max-h-[86vh] overflow-auto bg-card border border-border rounded-md shadow-2xl p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 flex-wrap">
          <FlaskConical className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Ratings Verdict Backtest — {ticker}</span>
          <span className="text-[10px] text-muted-foreground truncate max-w-[300px]">{name}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto" onClick={onClose} data-testid="ratings-bt-close"><X className="w-3.5 h-3.5" /></Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">bars</span>
            {(["daily", "monthly"] as const).map((m) => (
              <button
                key={m}
                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${barMode === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                onClick={() => changeBarMode(m)}
                title={m === "monthly" ? "Calendar-month bars — windows/horizons count months" : "Daily bars"}
                data-testid={`ratings-bt-bars-${m}`}
              >
                {m === "daily" ? "D" : "M"}
              </button>
            ))}
          </div>
          {num("hi %ile", "hiPctile", { min: 50 })}
          {num("lo %ile", "loPctile", { min: 1 })}
          {num("trend (d)", "trendLookback", { min: 1 })}
          {num("deadband pp", "deadband", { step: 0.5 })}
          {num("step (d)", "stepDays", { min: 1 })}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">verdict horizon</span>
            <select
              className="h-6 text-[10px] px-1 rounded-md border border-input bg-background"
              value={params.primaryHorizon}
              onChange={(e) => setNum("primaryHorizon", Number(e.target.value))}
              data-testid="ratings-bt-horizon"
            >
              {params.horizons.map(h => <option key={h} value={h}>{h}d</option>)}
            </select>
          </div>
          {result && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1 ml-auto" onClick={exportCsv} data-testid="ratings-bt-csv">
              <Download className="w-3 h-3" /> CSV
            </Button>
          )}
        </div>

        {error && <div className="text-xs text-red-400">{error}</div>}
        {!data && !error && <div className="text-xs text-muted-foreground py-6 text-center">Loading history…</div>}
        {data && !result && <div className="text-xs text-muted-foreground py-6 text-center">Not enough shared ratings/price history for these parameters.</div>}

        {result && (
          <>
            <div className={`rounded border px-3 py-2 flex items-center gap-3 flex-wrap ${verdictColor}`} data-testid="ratings-bt-verdict">
              <span className="text-sm font-bold">{result.verdict.side === "NONE" ? "NO EDGE" : result.verdict.side}</span>
              {result.today && (
                <span className="text-[11px]">
                  Today: <span className="font-semibold">{RATINGS_STATE_LABELS[result.today.state].label}</span>
                  <span className="opacity-70"> — Buy% {result.today.si.toFixed(1)} · {result.today.pctile.toFixed(0)}th %ile ({params.pctileWindow}d) · Δ{params.trendLookback}d {fmtSigned(result.today.trend, 1)}pp</span>
                </span>
              )}
              {result.verdict.stats ? (
                <span className="text-[10px] font-mono opacity-90">
                  fwd {params.primaryHorizon}d: med {fmtSigned(result.verdict.stats.median)}% · hit {result.verdict.stats.hitRate.toFixed(0)}% · n={result.verdict.stats.n}
                </span>
              ) : (
                <span className="text-[10px] opacity-70">too few historical samples of this state to judge</span>
              )}
              <span className="text-[9px] opacity-60 ml-auto">{RATINGS_STATE_LABELS[result.today?.state ?? "mid"].thesis}</span>
            </div>

            <table className="w-full text-[10px]" data-testid="ratings-bt-table">
              <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-2 py-1 text-left">State</th>
                  <th className="px-1 py-1 text-right">Samples</th>
                  {params.horizons.map(h => (
                    <th key={h} className="px-2 py-1 text-right">fwd {h}d — med · hit · t</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SI_STATES.map(st => (
                  <tr key={st} className={`border-b border-border/30 ${st === result.today?.state ? "bg-primary/10" : ""}`}>
                    <td className="px-2 py-1">
                      <span className="font-semibold">{RATINGS_STATE_LABELS[st].label}</span>
                      <span className="text-muted-foreground/70 ml-1 hidden sm:inline">{RATINGS_STATE_LABELS[st].thesis}</span>
                    </td>
                    <td className="px-1 py-1 text-right font-mono text-muted-foreground">{result.counts[st]}</td>
                    {params.horizons.map(h => {
                      const s = result.states[st][h];
                      const b = result.baseline[h];
                      return (
                        <td key={h} className="px-2 py-1 text-right font-mono">
                          {s ? (
                            <>
                              <span className={s.median >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmtSigned(s.median)}%</span>
                              {b && <span className="text-muted-foreground/60" title="edge vs unconditional median"> ({fmtSigned(s.median - b.median, 1)})</span>}
                              <span className="text-muted-foreground"> · {s.hitRate.toFixed(0)}%{s.tStat != null ? ` · t ${s.tStat.toFixed(1)}` : ""}</span>
                            </>
                          ) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="px-2 py-1 font-semibold text-muted-foreground">Baseline (all samples)</td>
                  <td className="px-1 py-1 text-right font-mono text-muted-foreground">{result.sampled}</td>
                  {params.horizons.map(h => {
                    const b = result.baseline[h];
                    return (
                      <td key={h} className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {b ? `${fmtSigned(b.median)}% · ${b.hitRate.toFixed(0)}%` : "—"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>

            <div className="rounded border border-border/60 bg-background/60 px-2.5 py-2 space-y-1" data-testid="ratings-bt-corr">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">Analyst-follow correlation</div>
              <div className="flex items-center gap-4 flex-wrap text-[10px] font-mono">
                {params.horizons.map(h => {
                  const c = result.deltaFollowCorr[h];
                  return (
                    <span key={h}>
                      <span className="text-muted-foreground uppercase">{h}d </span>
                      {c ? (
                        <span className={c.r >= 0 ? "text-emerald-400" : "text-rose-400"}>r = {fmtSigned(c.r)} <span className="text-muted-foreground">n={c.n}</span></span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </span>
                  );
                })}
              </div>
              <div className="text-[9px] text-muted-foreground">
                Pearson corr of the trailing {params.trendLookback}d Buy% change vs the forward return. Persistently
                positive ⇒ this name follows its analysts (upgrades precede strength); negative ⇒ fading the herd has paid.
              </div>
            </div>

            <p className="text-[9px] text-muted-foreground">
              Walk-forward: each sample's state uses only trailing data — Buy% percentile vs the prior {params.pctileWindow} obs
              (as-of, no lookahead) and the trailing {params.trendLookback}d change — with fixed rules, sampled every{" "}
              {params.stepDays}d; samples without a full forward window are dropped. Returns are log-% of close. Buy% is
              step-held between rating changes, and adjacent samples' forward windows overlap — treat t-stats as optimistic.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
