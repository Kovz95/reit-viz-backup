// Reconstructed from the production index chunk (component `_Ve`) on 2026-06-17.
// "Find Best MA" — scans all 10 moving-average types across a period grid and
// ranks them by hug / support-resistance / trend-regime / composite score, with
// one-click "add to chart". Lives in the IndicatorsPanel "Moving Averages" block.

import { useState, useMemo, useCallback, useEffect } from "react";
import { Sparkles, ChevronUp, ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTickers } from "@/lib/dataService";
import type { ActiveIndicators } from "@/components/ChartPane";
import {
  loadMaInput,
  scoreMovingAverages,
  rankCandidates,
  formatScorePct,
  isMaType,
  MODE_LABELS,
  MODE_DESCRIPTIONS,
  type RankMode,
  type MaCandidate,
  type FindBestMaInput,
} from "@/lib/findBestMA";

const TYPE_TO_FIELD: Record<string, keyof ActiveIndicators> = {
  SMA: "sma",
  EMA: "ema",
  WMA: "wma",
  HMA: "hma",
  KAMA: "kama",
  FRAMA: "frama",
  T3: "t3",
  ALMA: "alma",
  LSMA: "lsma",
  SLSMA: "slsma",
};

const RANK_MODES: RankMode[] = ["hug", "sr", "trend", "composite"];

export function FindBestMAPanel({
  ticker,
  activeIndicators,
  onChangeIndicators,
}: {
  ticker: string | null;
  activeIndicators: ActiveIndicators;
  onChangeIndicators: (i: ActiveIndicators) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState<FindBestMaInput>({ kind: "close" });
  const [mode, setMode] = useState<RankMode>("composite");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MaCandidate[] | null>(null);
  const [lastRun, setLastRun] = useState<{ ticker: string; input: FindBestMaInput; nBars: number } | null>(null);
  const [metrics, setMetrics] = useState<string[]>([]);

  // Populate the metric dropdown from the active ticker's workbook metrics.
  useEffect(() => {
    let alive = true;
    if (!ticker) {
      setMetrics([]);
      return;
    }
    getTickers()
      .then((list) => {
        if (!alive) return;
        const m = (list.find((t) => t.ticker === ticker)?.metrics ?? []) as string[];
        setMetrics(m.filter((x) => x !== "close" && x !== "open" && x !== "high" && x !== "low"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ticker]);

  const ranked = useMemo(
    () => (candidates ? rankCandidates(candidates, mode).slice(0, 10) : []),
    [candidates, mode]
  );

  const run = useCallback(async () => {
    if (!ticker) {
      setError("No ticker selected.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const data = await loadMaInput(ticker, input);
      if (!data || !data.closes || data.closes.length < 60) {
        setError(`Not enough data for ${ticker} on this metric (have ${data?.closes?.length ?? 0} bars; need ≥ 60).`);
        setCandidates(null);
        return;
      }
      // Yield a frame so the spinner paints before the (synchronous) scan.
      await new Promise((r) => setTimeout(r, 0));
      const scored = scoreMovingAverages(data.closes, { highs: data.highs, lows: data.lows });
      if (scored.length === 0) {
        setError("No MA candidates passed minimum-data filter.");
        setCandidates(null);
        return;
      }
      setCandidates(scored);
      setLastRun({ ticker, input, nBars: data.closes.length });
    } catch (e: any) {
      setError(`Run failed: ${e?.message ?? e}`);
      setCandidates(null);
    } finally {
      setRunning(false);
    }
  }, [ticker, input]);

  const apply = useCallback(
    (c: MaCandidate) => {
      if (!isMaType(c.type)) return;
      const field = TYPE_TO_FIELD[c.type];
      onChangeIndicators({ ...activeIndicators, [field]: c.period });
    },
    [activeIndicators, onChangeIndicators]
  );

  const cols = "grid grid-cols-[1fr_2.4rem_2.4rem_2.4rem_2.4rem_1.8rem] gap-1";

  return (
    <div className="rounded-md border border-border bg-card/40 p-2 space-y-2" data-testid="find-best-ma">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-foreground/80"
          onClick={() => setExpanded((v) => !v)}
          data-testid="find-best-ma-toggle"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span>Find Best MA</span>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {!expanded && lastRun && (
          <span className="text-[9px] text-muted-foreground">
            {lastRun.ticker} · {lastRun.input.kind === "close" ? "close" : lastRun.input.metric}
          </span>
        )}
      </div>

      {expanded && (
        <>
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Metric</span>
            <select
              value={input.kind === "close" ? "close" : `wb:${input.metric}`}
              onChange={(e) => {
                const v = e.target.value;
                setInput(v === "close" ? { kind: "close" } : { kind: "workbook", metric: v.slice(3) });
              }}
              disabled={running}
              className="w-full text-xs font-mono bg-background border border-border rounded px-2 py-1"
              data-testid="find-best-ma-metric"
            >
              <option value="close">Close (Yahoo adjusted)</option>
              {metrics.map((m) => (
                <option key={m} value={`wb:${m}`}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Rank by</span>
            <div className="grid grid-cols-4 gap-1">
              {RANK_MODES.map((m) => (
                <Button
                  key={m}
                  variant={mode === m ? "default" : "secondary"}
                  size="sm"
                  className="h-6 px-1 text-[10px]"
                  onClick={() => setMode(m)}
                  disabled={running}
                  title={MODE_DESCRIPTIONS[m]}
                  data-testid={`find-best-ma-mode-${m}`}
                >
                  {MODE_LABELS[m]}
                </Button>
              ))}
            </div>
          </div>

          <Button
            size="sm"
            className="w-full h-7 text-[11px]"
            onClick={run}
            disabled={running || !ticker}
            data-testid="find-best-ma-run"
          >
            {running ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Searching all 10 MA types…
              </>
            ) : (
              <>Find best for {ticker ?? "—"}</>
            )}
          </Button>

          {error && (
            <div className="text-[10px] text-rose-400 bg-rose-950/30 rounded p-1.5" data-testid="find-best-ma-error">
              {error}
            </div>
          )}

          {ranked.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                <span>
                  Top 10 of {candidates?.length ?? 0} · ranked by {MODE_LABELS[mode]}
                </span>
                {lastRun && <span>{lastRun.nBars} bars</span>}
              </div>
              <div className="rounded border border-border overflow-hidden">
                <div className={`${cols} px-1.5 py-1 bg-muted/40 text-[9px] uppercase tracking-wider text-muted-foreground`}>
                  <span>Type · Period</span>
                  <span className="text-right">Hug</span>
                  <span className="text-right">S/R</span>
                  <span className="text-right">Trend</span>
                  <span className="text-right">Comp</span>
                  <span className="text-right">Add</span>
                </div>
                {ranked.map((c, i) => (
                  <div
                    key={`${c.type}-${c.period}-${i}`}
                    className={`${cols} px-1.5 py-1 items-center text-[10px] border-t border-border/50 hover:bg-muted/20`}
                    data-testid={`find-best-ma-row-${i}`}
                  >
                    <span className="font-medium">
                      {c.type} {c.period}
                    </span>
                    <span className={`text-right tabular-nums ${mode === "hug" ? "text-amber-300 font-semibold" : "text-foreground/80"}`}>
                      {formatScorePct(c.hug)}
                    </span>
                    <span className={`text-right tabular-nums ${mode === "sr" ? "text-amber-300 font-semibold" : "text-foreground/80"}`}>
                      {formatScorePct(c.sr)}
                    </span>
                    <span className={`text-right tabular-nums ${mode === "trend" ? "text-amber-300 font-semibold" : "text-foreground/80"}`}>
                      {formatScorePct(c.trend)}
                    </span>
                    <span className={`text-right tabular-nums ${mode === "composite" ? "text-amber-300 font-semibold" : "text-foreground/80"}`}>
                      {formatScorePct(c.composite)}
                    </span>
                    <div className="flex justify-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => apply(c)}
                        title={`Add ${c.type} ${c.period} to chart`}
                        data-testid={`find-best-ma-add-${i}`}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default FindBestMAPanel;
