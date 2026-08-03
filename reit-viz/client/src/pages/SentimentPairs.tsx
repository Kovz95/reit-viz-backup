// Sentiment › Pair Gaps — per user-defined pair (A/B), show the sentiment
// DIFFERENTIALS for pair-trade positioning: who's more shorted (SI% gap) and
// who's more loved (Buy% gap). Gap series are built by inner-joining each
// leg's series on date, so deltas/sparklines are computed on the aligned gap
// itself (never on independently-sampled legs).
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMetricSeries, TimeValue } from "@/lib/dataService";
import { X, Plus, ChevronLeft, ExternalLink } from "lucide-react";
import { navigateToPairs } from "@/lib/navigateToPairs";
import { PairDetailCharts } from "@/pages/PairRatios";
import type { ActiveIndicators } from "@/components/ChartPane";

const STORAGE_KEY = "reit-viz:sentiment-pairs";

interface Pair {
  a: string;
  b: string;
}

function loadPairs(): Pair[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (p: any): p is Pair => p && typeof p.a === "string" && typeof p.b === "string",
    );
  } catch {
    return [];
  }
}

const TICKER_RE = /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/;

// ---------------------------------------------------------------------------
// Series helpers
// ---------------------------------------------------------------------------

function finiteOnly(s: TimeValue[]): TimeValue[] {
  return s.filter((p) => p && Number.isFinite(p.value));
}

/** Inner join by date: gap = A − B on dates where BOTH legs have a value. */
function joinGap(a: TimeValue[], b: TimeValue[]): TimeValue[] {
  const bm = new Map(finiteOnly(b).map((p) => [p.time, p.value]));
  const out: TimeValue[] = [];
  for (const p of finiteOnly(a)) {
    const bv = bm.get(p.time);
    if (bv == null) continue;
    out.push({ time: p.time, value: p.value - bv });
  }
  return out;
}

/** Buy% = buy/(buy+hold+sell)*100, inner-joined across the three count series. */
function buyPctSeries(buy: TimeValue[], hold: TimeValue[], sell: TimeValue[]): TimeValue[] {
  const hm = new Map(finiteOnly(hold).map((p) => [p.time, p.value]));
  const sm = new Map(finiteOnly(sell).map((p) => [p.time, p.value]));
  const out: TimeValue[] = [];
  for (const p of finiteOnly(buy)) {
    const hv = hm.get(p.time);
    const sv = sm.get(p.time);
    if (hv == null || sv == null) continue;
    const tot = p.value + hv + sv;
    if (tot > 0) out.push({ time: p.time, value: (p.value / tot) * 100 });
  }
  return out;
}

interface GapStats {
  cur: number;
  d1m: number | null;
  d3m: number | null;
  spark: number[];
  curA: number | null;
  curB: number | null;
  /** Full dated gap series — feeds the in-page detail charts. */
  series: TimeValue[];
}

/** Current / Δ1M(21 obs) / Δ3M(63 obs) / ~1Y sparkline from the gap series. */
function gapStats(gap: TimeValue[], legA: TimeValue[], legB: TimeValue[]): GapStats | null {
  if (gap.length === 0) return null;
  const cur = gap[gap.length - 1].value;
  const at = (n: number): number | null =>
    gap.length > n ? gap[gap.length - 1 - n].value : null;
  const v1m = at(21);
  const v3m = at(63);
  const spark: number[] = [];
  const start = Math.max(0, gap.length - 252);
  for (let i = start; i < gap.length; i += 5) spark.push(gap[i].value);
  const last = (s: TimeValue[]): number | null => {
    const f = finiteOnly(s);
    return f.length ? f[f.length - 1].value : null;
  };
  return {
    cur,
    d1m: v1m != null ? cur - v1m : null,
    d3m: v3m != null ? cur - v3m : null,
    spark,
    curA: last(legA),
    curB: last(legB),
    series: gap,
  };
}

// ---------------------------------------------------------------------------
// Presentational bits
// ---------------------------------------------------------------------------

/** Tiny inline SVG sparkline of the gap, with a dashed zero reference line. */
function GapSparkline({ data, upIsBad, width = 110, height = 26 }: {
  data: number[];
  upIsBad: boolean;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 0);
  const range = max - min || 1;
  const toY = (v: number) => height - ((v - min) / range) * (height - 4) - 2;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${toY(v)}`)
    .join(" ");
  const last = data[data.length - 1];
  const first = data[0];
  const rising = last > first + 0.05;
  const falling = last < first - 0.05;
  const badColor = "#ef4444";
  const goodColor = "#22c55e";
  const stroke = rising
    ? upIsBad ? badColor : goodColor
    : falling
      ? upIsBad ? goodColor : badColor
      : "#94a3b8";
  const zeroY = toY(0);
  return (
    <svg width={width} height={height} className="inline-block">
      <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 3" />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

/** Signed pp value; `posIsBad` flips the red/green mapping (SI vs Buy%). */
function GapValue({ value, posIsBad, digits = 2, className = "" }: {
  value: number | null;
  posIsBad: boolean;
  digits?: number;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value))
    return <span className="text-muted-foreground/50">—</span>;
  const hot = value > 0.05 ? (posIsBad ? "text-red-400" : "text-emerald-400")
    : value < -0.05 ? (posIsBad ? "text-emerald-400" : "text-red-400")
    : "text-foreground";
  return (
    <span className={`font-mono tabular-nums ${hot} ${className}`}>
      {value > 0 ? "+" : ""}{value.toFixed(digits)}pp
    </span>
  );
}

// ---------------------------------------------------------------------------
// Per-pair card
// ---------------------------------------------------------------------------

interface PairData {
  si: GapStats | null;
  buy: GapStats | null;
  siMissing: string[]; // legs with no SI data
  buyMissing: string[]; // legs with no ratings data
}

function GapSection({ title, hint, stats, missing, posIsBad, digits, legA, legB, unit, onOpen }: {
  title: string;
  hint: string;
  stats: GapStats | null;
  missing: string[];
  posIsBad: boolean;
  digits: number;
  legA: string;
  legB: string;
  unit: string;
  /** Opens the in-page detail (gap series + rolling z + indicators). */
  onOpen?: () => void;
}) {
  return (
    <div className="flex-1 min-w-[220px]">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1" title={hint}>
        {title}
      </div>
      {stats == null ? (
        <div className="text-xs text-muted-foreground/60">
          — {missing.length > 0
            ? `no data for ${missing.join(", ")} (workbook tickers only)`
            : "no overlapping history"}
        </div>
      ) : (
        <>
          <div
            className={`flex items-end gap-3 ${onOpen ? "cursor-zoom-in" : ""}`}
            onClick={onOpen}
            title={onOpen ? "Open the gap history (chart + rolling z + indicators)" : undefined}
            data-testid={`sentpair-open-${legA}-${legB}-${posIsBad ? "si" : "buy"}`}
          >
            <GapValue value={stats.cur} posIsBad={posIsBad} digits={digits} className="text-lg leading-none" />
            <GapSparkline data={stats.spark} upIsBad={posIsBad} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px]">
            {stats.d1m !== null && (
              <span className="text-muted-foreground">
                Δ1M <GapValue value={stats.d1m} posIsBad={posIsBad} digits={digits} />
              </span>
            )}
            <span className="text-muted-foreground">
              Δ3M <GapValue value={stats.d3m} posIsBad={posIsBad} digits={digits} />
            </span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground/70 font-mono tabular-nums">
            {legA} {stats.curA != null ? `${stats.curA.toFixed(digits)}${unit}` : "—"}
            <span className="mx-1 text-muted-foreground/40">·</span>
            {legB} {stats.curB != null ? `${stats.curB.toFixed(digits)}${unit}` : "—"}
          </div>
        </>
      )}
    </div>
  );
}

/** What the in-page detail overlay renders (which pair + which gap). */
export interface GapDetailSel {
  a: string;
  b: string;
  kind: "si" | "buy";
  title: string;
  posIsBad: boolean;
  digits: number;
  stats: GapStats;
}

function PairCard({ pair, onRemove, onOpenDetail }: { pair: Pair; onRemove: () => void; onOpenDetail: (sel: GapDetailSel) => void }) {
  const { a, b } = pair;
  const { data, isLoading } = useQuery<PairData>({
    queryKey: ["/sentiment-pair-gaps", a, b],
    queryFn: async () => {
      const safe = (t: string, m: string) =>
        getMetricSeries(t, m).catch(() => [] as TimeValue[]);
      const [siA, siB, buyA, holdA, sellA, buyB, holdB, sellB] = await Promise.all([
        safe(a, "Short Interest%"),
        safe(b, "Short Interest%"),
        safe(a, "Buy Ratings"),
        safe(a, "Hold Ratings"),
        safe(a, "Sell Ratings"),
        safe(b, "Buy Ratings"),
        safe(b, "Hold Ratings"),
        safe(b, "Sell Ratings"),
      ]);
      const siAf = finiteOnly(siA);
      const siBf = finiteOnly(siB);
      const siMissing: string[] = [];
      if (siAf.length === 0) siMissing.push(a);
      if (siBf.length === 0) siMissing.push(b);
      const si = siMissing.length === 0 ? gapStats(joinGap(siAf, siBf), siAf, siBf) : null;

      const buyPctA = buyPctSeries(buyA, holdA, sellA);
      const buyPctB = buyPctSeries(buyB, holdB, sellB);
      const buyMissing: string[] = [];
      if (buyPctA.length === 0) buyMissing.push(a);
      if (buyPctB.length === 0) buyMissing.push(b);
      const buy = buyMissing.length === 0
        ? gapStats(joinGap(buyPctA, buyPctB), buyPctA, buyPctB)
        : null;

      return { si, buy, siMissing, buyMissing };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Positioning read-through: positive SI gap = A more shorted (bear A);
  // positive Buy% gap = A more loved (bull A).
  const readThrough = useMemo(() => {
    if (!data || (!data.si && !data.buy)) return null;
    const bits: string[] = [];
    if (data.si && Math.abs(data.si.cur) > 0.25)
      bits.push(`${data.si.cur > 0 ? a : b} more shorted`);
    if (data.buy && Math.abs(data.buy.cur) > 2)
      bits.push(`${data.buy.cur > 0 ? a : b} more loved`);
    return bits.length ? bits.join(" · ") : null;
  }, [data, a, b]);

  return (
    <div
      className="border border-border rounded bg-card/60 p-3 flex flex-col gap-2"
      data-testid={`sentpair-card-${a}-${b}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-primary text-sm">{a}</span>
        <span className="text-muted-foreground text-xs">vs</span>
        <span className="font-mono font-bold text-primary text-sm">{b}</span>
        {readThrough && (
          <span className="text-[10px] text-muted-foreground ml-1 truncate">{readThrough}</span>
        )}
        <button
          className="ml-auto p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent"
          onClick={onRemove}
          title="Remove pair"
          data-testid={`sentpair-card-remove-${a}-${b}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {isLoading || !data ? (
        <div className="text-xs text-muted-foreground py-3">Loading…</div>
      ) : (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <GapSection
            title={`SI gap (${a} − ${b})`}
            hint="Short Interest% differential — positive = A carries more short interest (crowd is more bearish A)"
            stats={data.si}
            missing={data.siMissing}
            posIsBad
            digits={2}
            legA={a}
            legB={b}
            unit="%"
            onOpen={data.si ? () => onOpenDetail({ a, b, kind: "si", title: `SI gap (${a} − ${b})`, posIsBad: true, digits: 2, stats: data.si! }) : undefined}
          />
          <GapSection
            title={`Buy% gap (${a} − ${b})`}
            hint="Analyst Buy% differential (buy/(buy+hold+sell)) — positive = A is more loved by the sell side"
            stats={data.buy}
            missing={data.buyMissing}
            posIsBad={false}
            digits={1}
            legA={a}
            legB={b}
            unit="%"
            onOpen={data.buy ? () => onOpenDetail({ a, b, kind: "buy", title: `Buy% gap (${a} − ${b})`, posIsBad: false, digits: 1, stats: data.buy! }) : undefined}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SentimentPairs() {
  const [pairs, setPairs] = useState<Pair[]>(loadPairs);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  // In-page gap detail (sparkline click) + its indicator selections
  // (persisted next to the pins; chart keys pr-ratio / pr-z).
  const [detail, setDetail] = useState<GapDetailSel | null>(null);
  const [detailIndicators, setDetailIndicators] = useState<Record<string, ActiveIndicators>>(() => {
    try {
      const raw = localStorage.getItem("reit-viz:sentpair-indicators");
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  });
  useEffect(() => {
    try { localStorage.setItem("reit-viz:sentpair-indicators", JSON.stringify(detailIndicators)); } catch {}
  }, [detailIndicators]);

  // Rolling ~1Y (252-obs) z of the gap — the cards show pp deltas, not z, so
  // this is the standard companion chart rather than a table-matching stat.
  const detailZ = useMemo(() => {
    if (!detail) return [];
    const s = detail.stats.series;
    const n = s.length;
    const WIN = 252;
    const pre = new Float64Array(n + 1);
    const pre2 = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      pre[i + 1] = pre[i] + s[i].value;
      pre2[i + 1] = pre2[i] + s[i].value * s[i].value;
    }
    return s.map((pt, i) => {
      const lo = Math.max(0, i - WIN + 1);
      const cnt = i - lo + 1;
      if (cnt < 30) return { time: pt.time, value: null as number | null };
      const mean = (pre[i + 1] - pre[lo]) / cnt;
      const std = Math.sqrt(Math.max(0, (pre2[i + 1] - pre2[lo]) / cnt - mean * mean));
      if (!(std > 0)) return { time: pt.time, value: null as number | null };
      return { time: pt.time, value: (pt.value - mean) / std };
    });
  }, [detail]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pairs));
    } catch {}
  }, [pairs]);

  const addPair = () => {
    const m = input.split("/").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (m.length !== 2 || !TICKER_RE.test(m[0]) || !TICKER_RE.test(m[1])) {
      setInputError("Use TICKER/TICKER, e.g. PLD/REXR");
      return;
    }
    const [a, b] = m;
    if (a === b) {
      setInputError("Legs must differ");
      return;
    }
    if (pairs.some((p) => p.a === a && p.b === b)) {
      setInputError("Pair already added");
      return;
    }
    setPairs((prev) => [...prev, { a, b }]);
    setInput("");
    setInputError(null);
  };

  const removePair = (i: number) => setPairs((prev) => prev.filter((_, j) => j !== i));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b border-border flex-wrap flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value); setInputError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") addPair(); }}
            placeholder="Pair A/B (e.g. PLD/REXR)"
            className="h-6 w-44 px-2 text-[11px] font-mono bg-muted border border-border rounded outline-none focus:border-primary/50 placeholder:text-muted-foreground/60 placeholder:font-sans"
            data-testid="sentpair-input"
          />
          <button
            className="h-6 px-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={addPair}
            title="Add pair (Enter)"
            data-testid="sentpair-add"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {inputError && <span className="text-[10px] text-red-400">{inputError}</span>}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {pairs.map((p, i) => (
            <span
              key={`${p.a}/${p.b}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-primary/10 text-primary rounded"
              data-testid={`sentpair-chip-${p.a}-${p.b}`}
            >
              {p.a}/{p.b}
              <button
                className="hover:text-foreground"
                onClick={() => removePair(i)}
                title="Remove pair"
                data-testid={`sentpair-remove-${p.a}-${p.b}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Gaps are A − B in pp · positive SI gap = A more shorted · positive Buy% gap = A more loved
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {pairs.length === 0 ? (
          <div className="text-xs text-muted-foreground py-8 text-center">
            Add a pair (e.g. <span className="font-mono">PLD/REXR</span>) to compare short-interest and analyst-love differentials.
            <br />
            Workbook tickers only — legs without data will say so.
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))" }}>
            {pairs.map((p, i) => (
              <PairCard key={`${p.a}/${p.b}`} pair={p} onRemove={() => removePair(i)} onOpenDetail={setDetail} />
            ))}
          </div>
        )}
      </div>

      {/* In-page gap detail — same chart stack (full indicator suite) as the
          other pair surfaces; "Open in Pairs" keeps the price deep-dive. */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid="sentpair-detail">
          <div className="flex items-center gap-3 px-3 py-2 border-b border-border flex-shrink-0">
            <button
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent"
              onClick={() => setDetail(null)}
              data-testid="sentpair-detail-back"
            >
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
            <div className="text-sm font-bold font-mono">{detail.a} / {detail.b}</div>
            <span className="text-xs text-muted-foreground">{detail.title}</span>
            <button
              className="flex items-center gap-1 px-2 py-1 rounded border border-border/50 text-[11px] text-foreground/80 hover:text-foreground hover:bg-accent"
              onClick={() => navigateToPairs(detail.a, detail.b)}
              title={`Open ${detail.a} / ${detail.b} in the Pairs deep-dive (price ratio)`}
              data-testid="sentpair-detail-open-pairs"
            >
              <ExternalLink className="w-3 h-3" /> Open in Pairs
            </button>
            <div className="flex items-center gap-2 ml-auto text-[11px] font-mono">
              <span className="border border-border/30 rounded px-2 py-1">
                <span className="text-muted-foreground">Now </span>
                <GapValue value={detail.stats.cur} posIsBad={detail.posIsBad} digits={detail.digits} />
              </span>
              <span className="border border-border/30 rounded px-2 py-1">
                <span className="text-muted-foreground">Δ1M </span>
                <GapValue value={detail.stats.d1m} posIsBad={detail.posIsBad} digits={detail.digits} />
              </span>
              <span className="border border-border/30 rounded px-2 py-1">
                <span className="text-muted-foreground">Δ3M </span>
                <GapValue value={detail.stats.d3m} posIsBad={detail.posIsBad} digits={detail.digits} />
              </span>
            </div>
          </div>
          <PairDetailCharts
            ratioSeries={detail.stats.series}
            zScoreSeries={detailZ}
            ratioTitle={`${detail.title} — pp (${detail.stats.series.length} pts)`}
            zScoreTitle="Gap z-score (rolling 1Y window)"
            ratioRefLines={[{ value: 0, color: "rgba(148,163,184,0.4)", style: 2 }]}
            indicatorsMap={detailIndicators}
            onChangeIndicatorsMap={setDetailIndicators}
          />
        </div>
      )}
    </div>
  );
}
