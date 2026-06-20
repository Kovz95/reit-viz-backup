// Reconstructed from recovered-bundle/index-CsG73Aq_.js (fn _qe) on 2026-06-17
//
// In-Charts "Similar Setups" panel: given a ticker's daily closes, it builds
// z-scored feature vectors (Δ vs SMA50/200, 1M/3M returns, 30d realized vol,
// RSI-14), finds the historical bars whose feature vector is closest (euclidean
// distance over the enabled signal set) to today's vector, and reports the
// forward 1M/3M/6M/1Y return distribution of those matched dates, plus a
// collapsible table of the matched dates.

import { useState, useEffect, useMemo } from "react";
import { Sparkles, ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import { getOhlcData, type OhlcPoint } from "@/lib/dataService";

// ── Signal keys + labels (bundle M2 / PT) ───────────────────────────────────
type SignalKey = "smaDist50" | "smaDist200" | "ret20" | "ret63" | "vol30" | "rsi14";

const SIGNAL_LABELS: Record<SignalKey, string> = {
  smaDist50: "Δ vs SMA50",
  smaDist200: "Δ vs SMA200",
  ret20: "1M return",
  ret63: "3M return",
  vol30: "30d real vol",
  rsi14: "RSI-14",
};

const SIGNAL_KEYS: SignalKey[] = [
  "smaDist50",
  "smaDist200",
  "ret20",
  "ret63",
  "vol30",
  "rsi14",
];

// ── Indicator math helpers (bundle rq / nq / wqe / Sqe / kqe / O2) ───────────

/** Simple moving average over window `period` (bundle rq). */
function simpleMovingAverage(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Trailing `period`-bar percentage return (bundle nq). */
function trailingReturn(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  for (let i = period; i < values.length; i++) {
    const prev = values[i - period];
    if (prev > 0 && values[i] > 0) out[i] = values[i] / prev - 1;
  }
  return out;
}

/** Annualized realized volatility from log returns over `window` (bundle wqe). */
function realizedVolatility(values: number[], window: number): number[] {
  const out = new Array(values.length).fill(NaN);
  const logReturns = new Array(values.length).fill(NaN);
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0 && values[i] > 0) {
      logReturns[i] = Math.log(values[i] / values[i - 1]);
    }
  }
  for (let i = window; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - window + 1; j <= i; j++) {
      if (Number.isFinite(logReturns[j])) {
        sum += logReturns[j];
        count++;
      }
    }
    if (count < window) continue;
    sum /= count;
    let variance = 0;
    for (let j = i - window + 1; j <= i; j++) {
      variance += (logReturns[j] - sum) ** 2;
    }
    out[i] = Math.sqrt((variance / count) * 252);
  }
  return out;
}

/** Wilder RSI over `period` (bundle Sqe). */
function computeRsi(values: number[], period = 14): number[] {
  const out = new Array(values.length).fill(NaN);
  if (values.length < period + 1) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum -= delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

interface ZResult {
  z: number[];
  mean: number;
  sd: number;
}

/** Z-score a series against its own finite mean/sd (bundle kqe). */
function zScore(values: number[]): ZResult {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 30) {
    return { z: values.map(() => NaN), mean: NaN, sd: NaN };
  }
  const mean = finite.reduce((acc, v) => acc + v, 0) / finite.length;
  const sd = Math.sqrt(
    finite.reduce((acc, v) => acc + (v - mean) ** 2, 0) / finite.length
  );
  if (sd > 0) {
    return {
      z: values.map((v) => (Number.isFinite(v) ? (v - mean) / sd : NaN)),
      mean,
      sd,
    };
  }
  return { z: values.map(() => NaN), mean, sd };
}

interface ForwardStats {
  median: number;
  mean: number;
  p25: number;
  p75: number;
  hitRateLong: number;
  hitRateShort: number;
  baseLong: number;
  baseShort: number;
  n: number;
  baseN: number;
}

/**
 * Forward-return distribution stats over the matched set, with base rates
 * computed over the full candidate set (bundle O2). `matched` = forward returns
 * of the top-N nearest setups; `universe` = forward returns of all candidates.
 */
function forwardStats(matched: number[], universe: number[]): ForwardStats | null {
  const finite = matched.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const percentile = (q: number) => {
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.floor(q * (sorted.length - 1)))
    );
    return sorted[idx];
  };
  const mean = finite.reduce((acc, v) => acc + v, 0) / finite.length;
  const longCount = finite.filter((v) => v > 0).length;
  const shortCount = finite.filter((v) => v < 0).length;
  const universeFinite = universe.filter(Number.isFinite);
  const baseLong =
    universeFinite.length > 0
      ? (universeFinite.filter((v) => v > 0).length / universeFinite.length) * 100
      : NaN;
  const baseShort =
    universeFinite.length > 0
      ? (universeFinite.filter((v) => v < 0).length / universeFinite.length) * 100
      : NaN;
  return {
    median: percentile(0.5),
    mean,
    p25: percentile(0.25),
    p75: percentile(0.75),
    hitRateLong: (longCount / finite.length) * 100,
    hitRateShort: (shortCount / finite.length) * 100,
    baseLong,
    baseShort,
    n: finite.length,
    baseN: universeFinite.length,
  };
}

// ── StatCard (bundle F2) ─────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  stats: ForwardStats | null;
}

function StatCard({ label, stats }: StatCardProps) {
  if (!stats) {
    return (
      <div className="bg-card px-3 py-2 flex flex-col gap-0.5">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span className="text-base font-mono text-muted-foreground/50">—</span>
      </div>
    );
  }
  const fmt = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  const medianClass =
    stats.median > 0
      ? "text-green-400"
      : stats.median < 0
      ? "text-red-400"
      : "text-foreground";
  return (
    <div className="bg-card px-3 py-2 flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-base font-mono font-semibold ${medianClass}`}>
          {fmt(stats.median)}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">median</span>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/80 flex flex-wrap gap-x-3">
        <span>mean {fmt(stats.mean)}</span>
        <span>n={stats.n}</span>
      </div>
      <div className="text-[9px] font-mono flex flex-wrap gap-x-3">
        <span>
          <span className="text-green-400">L {stats.hitRateLong.toFixed(0)}%</span>
          {Number.isFinite(stats.baseLong) && (
            <span
              className={
                stats.hitRateLong - stats.baseLong >= 0
                  ? "text-green-400/70"
                  : "text-red-400/70"
              }
              title={`base rate ${stats.baseLong.toFixed(0)}% over ${stats.baseN} windows`}
            >
              {" "}
              ({stats.hitRateLong - stats.baseLong >= 0 ? "+" : ""}
              {(stats.hitRateLong - stats.baseLong).toFixed(0)}pp)
            </span>
          )}
        </span>
        <span>
          <span className="text-red-400">S {stats.hitRateShort.toFixed(0)}%</span>
          {Number.isFinite(stats.baseShort) && (
            <span
              className={
                stats.hitRateShort - stats.baseShort >= 0
                  ? "text-red-400/70"
                  : "text-green-400/70"
              }
              title={`base rate ${stats.baseShort.toFixed(0)}% over ${stats.baseN} windows`}
            >
              {" "}
              ({stats.hitRateShort - stats.baseShort >= 0 ? "+" : ""}
              {(stats.hitRateShort - stats.baseShort).toFixed(0)}pp)
            </span>
          )}
        </span>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/60 flex flex-wrap gap-x-3">
        <span>p25 {fmt(stats.p25)}</span>
        <span>p75 {fmt(stats.p75)}</span>
      </div>
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

/** Minimal OHLC bar shape the panel needs (only time + close are used). */
interface OhlcBar {
  time: string;
  close: number;
}

interface MatchedSetup {
  date: string;
  distance: number;
  zVec: number[];
  fwd1M: number;
  fwd3M: number;
  fwd6M: number;
  fwd1Y: number;
}

interface SimilarSetupsResult {
  enabledList: SignalKey[];
  todayZ: number[];
  matches: MatchedSetup[];
  total: number;
  h1M: ForwardStats | null;
  h3M: ForwardStats | null;
  h6M: ForwardStats | null;
  h1Y: ForwardStats | null;
}

export interface ChartsSimilarSetupsPanelProps {
  ticker: string;
  ohlcData?: OhlcBar[] | OhlcPoint[];
  maximized?: boolean;
  onMaximizeChange?: (maximized: boolean) => void;
}

export function ChartsSimilarSetupsPanel({
  ticker,
  ohlcData,
  maximized,
  onMaximizeChange,
}: ChartsSimilarSetupsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [localMaximized, setLocalMaximized] = useState(false);
  const isMaximized = maximized ?? localMaximized;
  const handleMaximizeChange = (next: boolean) => {
    if (onMaximizeChange) onMaximizeChange(next);
    else setLocalMaximized(next);
  };

  const [topN, setTopN] = useState(20);
  const [excludeLast, setExcludeLast] = useState(252);
  const [enabledSignals, setEnabledSignals] = useState<Set<SignalKey>>(
    () => new Set(SIGNAL_KEYS)
  );
  const [ohlc, setOhlc] = useState<OhlcBar[]>([]);

  useEffect(() => {
    if (!ticker) {
      setOhlc([]);
      return;
    }
    if (ohlcData && ohlcData.length) {
      setOhlc(ohlcData as OhlcBar[]);
      return;
    }
    let cancelled = false;
    getOhlcData(ticker)
      .then((bars) => {
        if (!cancelled) {
          setOhlc(bars.map((bar) => ({ time: bar.time, close: bar.close })));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ticker, ohlcData]);

  const result = useMemo<SimilarSetupsResult | null>(() => {
    if (!ticker || ohlc.length < 252) return null;
    const closes = ohlc.map((bar) => bar.close);
    const sma50 = simpleMovingAverage(closes, 50);
    const sma200 = simpleMovingAverage(closes, 200);
    const smaDist50 = closes.map((c, i) =>
      Number.isFinite(sma50[i]) && sma50[i] > 0 ? c / sma50[i] - 1 : NaN
    );
    const smaDist200 = closes.map((c, i) =>
      Number.isFinite(sma200[i]) && sma200[i] > 0 ? c / sma200[i] - 1 : NaN
    );
    const ret20 = trailingReturn(closes, 20);
    const ret63 = trailingReturn(closes, 63);
    const vol30 = realizedVolatility(closes, 30);
    const rsi14 = computeRsi(closes, 14);

    const rawFeatures: Record<SignalKey, number[]> = {
      smaDist50,
      smaDist200,
      ret20,
      ret63,
      vol30,
      rsi14,
    };

    const zFeatures: Record<string, number[]> = {};
    for (const key of SIGNAL_KEYS) {
      const { z } = zScore(rawFeatures[key]);
      zFeatures[key] = z;
    }

    const lastIdx = closes.length - 1;
    const enabledList = SIGNAL_KEYS.filter((key) => enabledSignals.has(key));
    if (enabledList.length === 0) return null;

    const todayZ = enabledList.map((key) => zFeatures[key][lastIdx]);
    if (todayZ.some((v) => !Number.isFinite(v))) return null;

    const lastCandidate = Math.max(0, lastIdx - excludeLast);
    const candidates: MatchedSetup[] = [];
    for (let i = 0; i <= lastCandidate; i++) {
      const vec = enabledList.map((key) => zFeatures[key][i]);
      if (vec.some((v) => !Number.isFinite(v))) continue;
      let sumSq = 0;
      for (let k = 0; k < vec.length; k++) {
        const diff = vec[k] - todayZ[k];
        sumSq += diff * diff;
      }
      const distance = Math.sqrt(sumSq);
      const base = closes[i];
      if (!(base > 0)) continue;
      const forwardReturn = (offset: number) => {
        const idx = i + offset;
        return idx >= closes.length || !(closes[idx] > 0)
          ? NaN
          : (closes[idx] / base - 1) * 100;
      };
      candidates.push({
        date: ohlc[i].time,
        distance,
        zVec: vec,
        fwd1M: forwardReturn(21),
        fwd3M: forwardReturn(63),
        fwd6M: forwardReturn(126),
        fwd1Y: forwardReturn(252),
      });
    }
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.distance - b.distance);
    const matches = candidates.slice(0, topN);
    const universe1M = candidates.map((c) => c.fwd1M);
    const universe3M = candidates.map((c) => c.fwd3M);
    const universe6M = candidates.map((c) => c.fwd6M);
    const universe1Y = candidates.map((c) => c.fwd1Y);

    return {
      enabledList,
      todayZ,
      matches,
      total: candidates.length,
      h1M: forwardStats(matches.map((c) => c.fwd1M), universe1M),
      h3M: forwardStats(matches.map((c) => c.fwd3M), universe3M),
      h6M: forwardStats(matches.map((c) => c.fwd6M), universe6M),
      h1Y: forwardStats(matches.map((c) => c.fwd1Y), universe1Y),
    };
  }, [ticker, ohlc, topN, excludeLast, enabledSignals]);

  if (!ticker) return null;

  const fmtPct = (value: number) =>
    Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "—";

  return (
    <div
      className={
        isMaximized
          ? "flex-1 min-h-0 border-t border-border bg-card overflow-auto"
          : "border-t border-border bg-card flex-shrink-0"
      }
      data-testid="charts-similar-setups-panel"
    >
      <div className="px-3 py-1.5 border-b border-border flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 text-[10px] font-mono text-amber-300 uppercase tracking-wider hover:text-amber-200"
          data-testid="similar-setups-toggle-collapse"
        >
          <Sparkles className="w-3 h-3" />
          Similar Setups · {ticker}
          {collapsed ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronUp className="w-3 h-3" />
          )}
        </button>
        {!collapsed && result && (
          <span className="text-[9px] font-mono text-muted-foreground">
            {result.matches.length}/{result.total} bars matched · feature dim{" "}
            {result.enabledList.length}
          </span>
        )}
        <div className="flex-1" />
        {!collapsed && (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              N
            </label>
            <select
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="text-[10px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
              data-testid="similar-setups-n-select"
            >
              {[10, 20, 30, 50, 100].map((n) => (
                <option value={n} key={n}>
                  {n}
                </option>
              ))}
            </select>
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              exclude last
            </label>
            <select
              value={excludeLast}
              onChange={(e) => setExcludeLast(Number(e.target.value))}
              className="text-[10px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground"
              data-testid="similar-setups-exclusion-select"
            >
              <option value={63}>3M</option>
              <option value={126}>6M</option>
              <option value={252}>1Y</option>
              <option value={504}>2Y</option>
            </select>
          </div>
        )}
        <button
          onClick={() => handleMaximizeChange(!isMaximized)}
          className="p-0.5 rounded bg-background/80 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title={isMaximized ? "Restore" : "Expand Similar Setups"}
          data-testid="expand-similar-setups"
        >
          {isMaximized ? (
            <Minimize2 className="w-3 h-3" />
          ) : (
            <Maximize2 className="w-3 h-3" />
          )}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="px-3 py-1.5 border-b border-border flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1">
              Signals
            </span>
            {SIGNAL_KEYS.map((key) => {
              const active = enabledSignals.has(key);
              return (
                <button
                  onClick={() => {
                    setEnabledSignals((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    });
                  }}
                  className={`text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${
                    active
                      ? "border-amber-500 bg-amber-500/15 text-amber-300"
                      : "border-border hover:bg-accent text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`similar-setups-signal-${key}`}
                  key={key}
                >
                  {SIGNAL_LABELS[key]}
                </button>
              );
            })}
            {result && (
              <span className="text-[9px] font-mono text-muted-foreground/70 ml-2">
                today z:{" "}
                {result.enabledList
                  .map(
                    (key, i) => `${SIGNAL_LABELS[key]}=${result.todayZ[i].toFixed(2)}`
                  )
                  .join(" · ")}
              </span>
            )}
          </div>
          {result ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
              <StatCard label="Forward 1M" stats={result.h1M} />
              <StatCard label="Forward 3M" stats={result.h3M} />
              <StatCard label="Forward 6M" stats={result.h6M} />
              <StatCard label="Forward 1Y" stats={result.h1Y} />
            </div>
          ) : (
            <div className="px-3 py-3 text-[10px] font-mono text-muted-foreground">
              Need at least 252 bars and one enabled signal to run.
            </div>
          )}
          {result && result.matches.length > 0 && (
            <details className="border-t border-border">
              <summary className="px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer select-none">
                Show top-{result.matches.length} matched dates
              </summary>
              <div className="px-3 pb-2 overflow-x-auto max-h-64">
                <table className="w-full text-[10px] font-mono">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-muted-foreground/70 uppercase tracking-wider">
                      <th className="text-left font-normal pr-3 py-1">Date</th>
                      {result.enabledList.map((key) => (
                        <th className="text-right font-normal pr-3 py-1" key={key}>
                          {SIGNAL_LABELS[key]} z
                        </th>
                      ))}
                      <th className="text-right font-normal pr-3 py-1">dist</th>
                      <th className="text-right font-normal pr-3 py-1">fwd 1M</th>
                      <th className="text-right font-normal pr-3 py-1">fwd 3M</th>
                      <th className="text-right font-normal pr-3 py-1">fwd 6M</th>
                      <th className="text-right font-normal py-1">fwd 1Y</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matches.map((match) => (
                      <tr className="border-t border-border/40" key={match.date}>
                        <td className="text-foreground pr-3 py-0.5">{match.date}</td>
                        {match.zVec.map((z, i) => (
                          <td
                            className="text-right text-muted-foreground pr-3 py-0.5"
                            key={i}
                          >
                            {z.toFixed(2)}
                          </td>
                        ))}
                        <td className="text-right text-muted-foreground pr-3 py-0.5">
                          {match.distance.toFixed(2)}
                        </td>
                        <td
                          className={`text-right pr-3 py-0.5 ${
                            Number.isFinite(match.fwd1M)
                              ? match.fwd1M >= 0
                                ? "text-green-400"
                                : "text-red-400"
                              : "text-muted-foreground/50"
                          }`}
                        >
                          {fmtPct(match.fwd1M)}
                        </td>
                        <td
                          className={`text-right pr-3 py-0.5 ${
                            Number.isFinite(match.fwd3M)
                              ? match.fwd3M >= 0
                                ? "text-green-400"
                                : "text-red-400"
                              : "text-muted-foreground/50"
                          }`}
                        >
                          {fmtPct(match.fwd3M)}
                        </td>
                        <td
                          className={`text-right pr-3 py-0.5 ${
                            Number.isFinite(match.fwd6M)
                              ? match.fwd6M >= 0
                                ? "text-green-400"
                                : "text-red-400"
                              : "text-muted-foreground/50"
                          }`}
                        >
                          {fmtPct(match.fwd6M)}
                        </td>
                        <td
                          className={`text-right py-0.5 ${
                            Number.isFinite(match.fwd1Y)
                              ? match.fwd1Y >= 0
                                ? "text-green-400"
                                : "text-red-400"
                              : "text-muted-foreground/50"
                          }`}
                        >
                          {fmtPct(match.fwd1Y)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export default ChartsSimilarSetupsPanel;
