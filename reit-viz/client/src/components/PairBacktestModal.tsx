// Pair spread backtest modal — historical fade-the-spread stats for one pair.
import { useEffect, useMemo, useState } from "react";
import { X, FlaskConical, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMetricSeries } from "@/lib/dataService";
import { runPairBacktest, DEFAULT_BT_PARAMS, type PairBtParams, type PairBtResult } from "@/lib/pairBacktest";

export default function PairBacktestModal({ a, b, onClose }: { a: string; b: string; onClose: () => void }) {
  const [params, setParams] = useState<PairBtParams>(DEFAULT_BT_PARAMS);
  const [closes, setCloses] = useState<{ a: any[]; b: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getMetricSeries(a, "close"), getMetricSeries(b, "close")])
      .then(([ca, cb]) => { if (!cancelled) setCloses({ a: ca, b: cb }); })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; };
  }, [a, b]);

  const result: PairBtResult | null = useMemo(() => {
    if (!closes) return null;
    try { return runPairBacktest(closes.a, closes.b, params); } catch { return null; }
  }, [closes, params]);

  const setP = (key: keyof PairBtParams, v: number | string) =>
    setParams((p) => ({ ...p, [key]: v }));

  const exportCsv = () => {
    if (!result) return;
    const lines = ["entry,exit,days,entryZ,retPct,maePct,exitReason"];
    for (const t of result.trades) lines.push([t.entryDate, t.exitDate, t.days, t.entryZ.toFixed(2), t.retPct.toFixed(3), t.maePct.toFixed(3), t.exitReason].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `pair-bt-${a}-${b}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  const num = (label: string, key: keyof PairBtParams, step = 1, min = 0) => (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        className="h-6 w-16 text-[10px] px-1.5"
        value={params[key] as number}
        step={step}
        min={min}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) setP(key, v); }}
        data-testid={`bt-${key}`}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose} data-testid="pair-bt-modal">
      <div className="w-[min(860px,94vw)] max-h-[86vh] overflow-auto bg-card border border-border rounded-md shadow-2xl p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Spread Backtest — {a} / {b}</span>
          <span className="text-[10px] text-muted-foreground">fade the spread: enter |z| ≥ entry, exit |z| ≤ exit or max hold</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto" onClick={onClose}><X className="w-3.5 h-3.5" /></Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {num("z window", "window")}
          {num("entry |z|", "entryZ", 0.25)}
          {num("exit |z|", "exitZ", 0.25)}
          {num("max hold", "maxHold")}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">hedge</span>
            <select
              className="h-6 text-[10px] px-1 rounded-md border border-input bg-background"
              value={params.hedge}
              onChange={(e) => setP("hedge", e.target.value)}
              data-testid="bt-hedge"
              title="ratio = log price ratio (1:1); beta = rolling OLS hedge; kalman = time-varying Kalman hedge (adapts as the relationship drifts)"
            >
              <option value="ratio">Ratio (1:1)</option>
              <option value="beta">Rolling β</option>
              <option value="kalman">Kalman β</option>
            </select>
          </div>
          {result && result.n > 0 && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1 ml-auto" onClick={exportCsv}>
              <Download className="w-3 h-3" /> CSV
            </Button>
          )}
        </div>

        {error && <div className="text-xs text-red-400">{error}</div>}
        {!closes && !error && <div className="text-xs text-muted-foreground py-6 text-center">Loading price history…</div>}
        {closes && result === null && <div className="text-xs text-muted-foreground py-6 text-center">Not enough shared history for these parameters.</div>}

        {result && (
          <>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center" data-testid="bt-stats">
              {[
                ["Trades", String(result.n)],
                ["Win rate", `${result.winRate.toFixed(0)}%`],
                ["Avg ret", `${result.avgRetPct >= 0 ? "+" : ""}${result.avgRetPct.toFixed(2)}%`],
                ["Median ret", `${result.medianRetPct >= 0 ? "+" : ""}${result.medianRetPct.toFixed(2)}%`],
                ["Median days", String(result.medianDays)],
                ["Worst MAE", `${result.worstMaePct.toFixed(2)}%`],
                ["Total", `${result.totalRetPct >= 0 ? "+" : ""}${result.totalRetPct.toFixed(1)}%`],
                ["History", `${result.bars} bars`],
              ].map(([k, v]) => (
                <div key={k} className="rounded border border-border/60 bg-background px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
                  <div className={`text-xs font-mono font-bold ${v.startsWith("+") ? "text-emerald-400" : v.startsWith("-") ? "text-red-400" : ""}`}>{v}</div>
                </div>
              ))}
            </div>
            {result.n === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">No trades at these thresholds — loosen entry z or extend max hold.</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-2 py-1 text-left">Entry</th>
                    <th className="px-2 py-1 text-left">Exit</th>
                    <th className="px-2 py-1 text-right">Days</th>
                    <th className="px-2 py-1 text-right">Entry z</th>
                    <th className="px-2 py-1 text-right">Return</th>
                    <th className="px-2 py-1 text-right">MAE</th>
                    <th className="px-2 py-1 text-left">Exit via</th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.trades].reverse().map((t, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-2 py-0.5 font-mono">{t.entryDate}</td>
                      <td className="px-2 py-0.5 font-mono">{t.exitDate}</td>
                      <td className="px-2 py-0.5 text-right font-mono">{t.days}</td>
                      <td className="px-2 py-0.5 text-right font-mono">{t.entryZ.toFixed(1)}</td>
                      <td className={`px-2 py-0.5 text-right font-mono font-bold ${t.retPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {t.retPct >= 0 ? "+" : ""}{t.retPct.toFixed(2)}%
                      </td>
                      <td className="px-2 py-0.5 text-right font-mono text-red-400/70">{t.maePct.toFixed(2)}%</td>
                      <td className="px-2 py-0.5 text-muted-foreground">{t.exitReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
