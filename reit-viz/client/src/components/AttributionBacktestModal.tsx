// Attribution verdict backtest modal — per-state forward-return stats for one
// symbol's trailing est-vs-multiple decomposition, plus a LONG/SHORT/no-edge
// verdict for today's state. Pure client math over the page's already-loaded
// AlignedData (see lib/attributionBacktest.ts for the walk-forward notes).
import { useMemo, useState } from "react";
import { X, FlaskConical, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AlignedData } from "@/lib/attribution";
import {
  runAttributionVerdictBacktest, DEFAULT_ATTR_BT, ATTR_STATES, ATTR_STATE_LABELS,
  type AttrBtParams,
} from "@/lib/attributionBacktest";

const fmtSigned = (v: number, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;

interface Props {
  aligned: AlignedData;
  symbolLabel: string;
  basisLabel: string;
  rollingDays: number;
  freqUnit: "day" | "week" | "month";
  onClose: () => void;
}

export default function AttributionBacktestModal({ aligned, symbolLabel, basisLabel, rollingDays, freqUnit, onClose }: Props) {
  const unit = freqUnit === "week" ? "w" : freqUnit === "month" ? "mo" : "d";
  const [params, setParams] = useState<AttrBtParams>(() => ({
    ...DEFAULT_ATTR_BT,
    rollingDays,
    // Bars of the supplied series — weekly/monthly bars get horizons at the
    // same calendar marks (1M / 3M / 6M).
    horizons: freqUnit === "week" ? [4, 13, 26] : freqUnit === "month" ? [1, 3, 6] : DEFAULT_ATTR_BT.horizons,
    primaryHorizon: freqUnit === "week" ? 13 : freqUnit === "month" ? 3 : DEFAULT_ATTR_BT.primaryHorizon,
    stepDays: freqUnit === "week" || freqUnit === "month" ? 1 : DEFAULT_ATTR_BT.stepDays,
  }));

  const result = useMemo(() => {
    try { return runAttributionVerdictBacktest(aligned, params); } catch { return null; }
  }, [aligned, params]);

  const setNum = (key: keyof AttrBtParams, v: number) =>
    setParams(p => ({ ...p, [key]: v }));

  const exportCsv = () => {
    if (!result) return;
    const hs = params.horizons;
    const lines = [`date,state,est,mult,total,${hs.map(h => `fwd${h}${unit}`).join(",")}`];
    for (const s of result.samples) {
      lines.push([
        s.date, s.state, s.est.toFixed(3), s.mult.toFixed(3), s.total.toFixed(3),
        ...hs.map(h => s.fwd[h] == null ? "" : (s.fwd[h] as number).toFixed(3)),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `attr-bt-${symbolLabel.replace(/[^A-Za-z0-9.-]+/g, "_")}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  const num = (label: string, key: keyof AttrBtParams, opts?: { step?: number; min?: number; max?: number; scale?: number }) => {
    const scale = opts?.scale ?? 1;
    return (
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <Input
          type="number"
          className="h-6 w-16 text-[10px] px-1.5"
          value={Math.round((params[key] as number) * scale * 100) / 100}
          step={opts?.step ?? 1}
          min={opts?.min ?? 1}
          max={opts?.max}
          onChange={(e) => {
            const v = Number(e.target.value) / scale;
            if (Number.isFinite(v) && v > 0) setNum(key, v);
          }}
          data-testid={`attr-bt-${key}`}
        />
      </div>
    );
  };

  const verdictColor = result?.verdict.side === "LONG"
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
    : result?.verdict.side === "SHORT"
      ? "bg-rose-500/15 text-rose-400 border-rose-500/40"
      : "bg-muted/40 text-muted-foreground border-border";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose} data-testid="attr-bt-modal">
      <div className="w-[min(900px,94vw)] max-h-[86vh] overflow-auto bg-card border border-border rounded-md shadow-2xl p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 flex-wrap">
          <FlaskConical className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Attribution Verdict Backtest — {symbolLabel}</span>
          <span className="text-[10px] text-muted-foreground">{basisLabel}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto" onClick={onClose} data-testid="attr-bt-close"><X className="w-3.5 h-3.5" /></Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {num(`window (${unit})`, "rollingDays", { min: 2 })}
          {num("dominance %", "shareThreshold", { scale: 100, step: 5, min: 50, max: 95 })}
          {num(`step (${unit})`, "stepDays")}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">verdict horizon</span>
            <select
              className="h-6 text-[10px] px-1 rounded-md border border-input bg-background"
              value={params.primaryHorizon}
              onChange={(e) => setNum("primaryHorizon", Number(e.target.value))}
              data-testid="attr-bt-horizon"
            >
              {params.horizons.map(h => <option key={h} value={h}>{h}{unit}</option>)}
            </select>
          </div>
          {result && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1 ml-auto" onClick={exportCsv} data-testid="attr-bt-csv">
              <Download className="w-3 h-3" /> CSV
            </Button>
          )}
        </div>

        {!result ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            Not enough aligned history for these parameters (need the rolling window plus forward horizons).
          </div>
        ) : (
          <>
            {/* Verdict banner */}
            <div className={`rounded border px-3 py-2 flex items-center gap-3 flex-wrap ${verdictColor}`} data-testid="attr-bt-verdict">
              <span className="text-sm font-bold">{result.verdict.side === "NONE" ? "NO EDGE" : result.verdict.side}</span>
              {result.todayState && result.todayPoint && (
                <span className="text-[11px]">
                  Today: <span className="font-semibold">{ATTR_STATE_LABELS[result.todayState].label}</span>
                  <span className="opacity-70"> — est {fmtSigned(result.todayPoint.est, 1)} / mult {fmtSigned(result.todayPoint.mult, 1)} log-% over {params.rollingDays}{unit}</span>
                </span>
              )}
              {result.verdict.stats ? (
                <span className="text-[10px] font-mono opacity-90">
                  fwd {params.primaryHorizon}{unit}: med {fmtSigned(result.verdict.stats.median)}% · hit {result.verdict.stats.hitRate.toFixed(0)}% · n={result.verdict.stats.n}
                </span>
              ) : (
                <span className="text-[10px] opacity-70">too few historical samples of this state to judge</span>
              )}
              <span className="text-[9px] opacity-60 ml-auto">{ATTR_STATE_LABELS[result.todayState ?? "mixed"].thesis}</span>
            </div>

            {/* State × horizon table */}
            <table className="w-full text-[10px]" data-testid="attr-bt-table">
              <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-2 py-1 text-left">State</th>
                  <th className="px-1 py-1 text-right">Samples</th>
                  {params.horizons.map(h => (
                    <th key={h} className="px-2 py-1 text-right">fwd {h}{unit} — med · hit · t</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ATTR_STATES.map(st => (
                  <tr key={st} className={`border-b border-border/30 ${st === result.todayState ? "bg-primary/10" : ""}`}>
                    <td className="px-2 py-1">
                      <span className="font-semibold">{ATTR_STATE_LABELS[st].label}</span>
                      <span className="text-muted-foreground/70 ml-1 hidden sm:inline">{ATTR_STATE_LABELS[st].thesis}</span>
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

            {/* Revision-follow correlation */}
            <div className="rounded border border-border/60 bg-background/60 px-2.5 py-2 space-y-1" data-testid="attr-bt-corr">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">Revision-follow correlation</div>
              <div className="flex items-center gap-4 flex-wrap text-[10px] font-mono">
                {params.horizons.map(h => {
                  const c = result.revFollowCorr[h];
                  return (
                    <span key={h}>
                      <span className="text-muted-foreground uppercase">{h}{unit} </span>
                      {c ? (
                        <span className={c.r >= 0 ? "text-emerald-400" : "text-rose-400"}>r = {fmtSigned(c.r)} <span className="text-muted-foreground">n={c.n}</span></span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </span>
                  );
                })}
              </div>
              <div className="text-[9px] text-muted-foreground">
                Pearson corr of the trailing signed estimate component vs the forward return. Persistently positive ⇒ this
                name follows its revisions (revision momentum is tradeable); near zero ⇒ revisions carry no forward signal here.
              </div>
            </div>

            <p className="text-[9px] text-muted-foreground">
              Walk-forward: each sample's state uses only its trailing {params.rollingDays}{unit} decomposition (fixed rules, no
              fitting), sampled every {params.stepDays}{unit}; samples without a full forward window are dropped. Returns are
              log-% of close. Adjacent samples' forward windows overlap, so treat t-stats as optimistic.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
