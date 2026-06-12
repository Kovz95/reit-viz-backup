// Reconstructed from recovered-bundle/RatesForward-CrzUd_CP.js on 2026-06-11
import { useState, useEffect, useRef, useMemo } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  AreaSeries,
  BaselineSeries,
} from "lightweight-charts";
import type { IChartApi } from "lightweight-charts";
import { fetchFredSeries } from "@/lib/macroStatic";
import { TrendingDown } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const TENORS = [
  { id: "DGS1MO", years: 1 / 12, label: "1M" },
  { id: "DGS3MO", years: 0.25, label: "3M" },
  { id: "DGS6MO", years: 0.5, label: "6M" },
  { id: "DGS1", years: 1, label: "1Y" },
  { id: "DGS2", years: 2, label: "2Y" },
  { id: "DGS3", years: 3, label: "3Y" },
  { id: "DGS5", years: 5, label: "5Y" },
  { id: "DGS7", years: 7, label: "7Y" },
  { id: "DGS10", years: 10, label: "10Y" },
];

const BASIS_POINTS_PER_CUT = 25;
const FORWARD_APPROX_MULTIPLIER = 1.45;

// ── Types ─────────────────────────────────────────────────────────────────────

interface RateSeries { time: string; value: number }

interface CurvePoint { years: number; forward: number; spot: number }

interface ForwardScenarios {
  today: { date: string; curve: CurvePoint[] };
  d30: { date: string; curve: CurvePoint[] };
  d90: { date: string; curve: CurvePoint[] };
}

interface TenorRate { tenor: { id: string; years: number; label: string }; rate: number }

interface ConvexityComponent { label: string; score: number; reason: string }
interface ConvexityScore {
  score: number;
  regime: string;
  components: ConvexityComponent[];
}

interface ScoreStats {
  min: number; max: number; p25: number; p50: number; p75: number;
  today: number; percentile: number; points: number; startDate: string;
}

interface CutImplied {
  cuts24: number;
  cuts12: number | null;
  drop24bp: number;
  drop12bp: number | null;
}

// ── Utility functions ─────────────────────────────────────────────────────────

const fmtRate = (v: number | null | undefined, dp = 2) =>
  v == null || !isFinite(v) ? "—" : `${v.toFixed(dp)}%`;

function lookupRate(series: RateSeries[], date: string): number | null {
  if (!series.length) return null;
  let lo = 0, hi = series.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].time <= date) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return idx >= 0 ? series[idx].value : null;
}

function latestPoint(series: RateSeries[]): { value: number; time: string } | null {
  if (!series.length) return null;
  const last = series[series.length - 1];
  return { value: last.value, time: last.time };
}

function subtractDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function change30d(series: RateSeries[], approx = true): number | null {
  if (!series.length) return null;
  const last = series[series.length - 1];
  const lookbackDate = subtractDays(last.time, Math.round((approx ? FORWARD_APPROX_MULTIPLIER : 1) * 30));
  const prev = lookupRate(series, lookbackDate);
  return prev == null ? null : last.value - prev;
}

function getSpotRates(allSeries: Record<string, RateSeries[]>, date: string): TenorRate[] {
  return TENORS.map(t => ({
    tenor: t,
    rate: lookupRate(allSeries[t.id] ?? [], date) ?? NaN,
  })).filter(t => isFinite(t.rate));
}

function bootstrapForwardCurve(spots: Array<{ years: number; rate: number }>, horizons: number[]): CurvePoint[] {
  if (spots.length < 2) return [];
  const sorted = [...spots].sort((a, b) => a.years - b.years);
  const maxYears = sorted[sorted.length - 1].years;
  const interp = (y: number) => {
    if (y <= sorted[0].years) return sorted[0].rate;
    if (y >= maxYears) return sorted[sorted.length - 1].rate;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (y >= a.years && y <= b.years) return a.rate + (b.rate - a.rate) * (y - a.years) / (b.years - a.years);
    }
    return sorted[sorted.length - 1].rate;
  };
  const halfYears = Math.max(2, Math.round(maxYears / 0.5));
  const nodes: number[] = [];
  for (let i = 1; i <= halfYears; i++) nodes.push(i * 0.5);
  const dfs: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const y = nodes[i];
    const g = interp(y) / 100;
    if (y <= 1 + 1e-9) { dfs.push(1 / (1 + g * y)); continue; }
    let sumDf = 0;
    for (let j = 0; j < i; j++) sumDf += dfs[j];
    const denom = 1 + g * 0.5;
    if (denom === 0) { dfs.push(dfs[i - 1] ?? 1); continue; }
    const df = (1 - g * 0.5 * sumDf) / denom;
    dfs.push(df > 1e-9 ? df : 1e-9);
  }
  const zeroCurve = dfs.map((df, i) => -Math.log(df) / nodes[i] * 100);
  const forwardFn = (y: number): number => {
    if (y < nodes[0]) {
      const g = interp(Math.max(y, 1 / 12)) / 100;
      const t = Math.max(y, 1 / 12);
      const df2 = 1 / (1 + g * t);
      return -Math.log(df2) / t * 100;
    }
    if (y >= nodes[nodes.length - 1]) return zeroCurve[zeroCurve.length - 1];
    for (let i = 0; i < nodes.length - 1; i++) {
      if (y >= nodes[i] && y <= nodes[i + 1]) {
        return zeroCurve[i] + (zeroCurve[i + 1] - zeroCurve[i]) * (y - nodes[i]) / (nodes[i + 1] - nodes[i]);
      }
    }
    return zeroCurve[zeroCurve.length - 1];
  };
  const dh = 1 / 12;
  return horizons.map(y => {
    const z = forwardFn(y);
    const zPlus = forwardFn(y + dh);
    const zMinus = forwardFn(Math.max(0.01, y - dh));
    const slope = (zPlus - zMinus) / (2 * dh);
    return { years: y, forward: z + y * slope, spot: z };
  });
}

function computeConvexityScore(opts: {
  fwdCurve: CurvePoint[];
  spot3m: number | null;
  twoYearChange30d: number | null;
  termPremium: number | null;
  termPremiumChange30d: number | null;
  twoTenSpread: number | null;
  twoTenChange30d: number | null;
}): ConvexityScore {
  const { fwdCurve, spot3m, twoYearChange30d, termPremium, termPremiumChange30d, twoTenSpread, twoTenChange30d } = opts;
  let forwardScore = 0, forwardReason = "—";
  if (spot3m != null && fwdCurve.length) {
    const fwd24 = fwdCurve.find(p => Math.abs(p.years - 2) < 0.05)?.forward;
    const fwd12 = fwdCurve.find(p => Math.abs(p.years - 1) < 0.05)?.forward ?? fwd24 ?? null;
    if (fwd24 != null) {
      const cutsImplied = (spot3m - fwd24) * 100;
      forwardScore = Math.max(-100, Math.min(100, cutsImplied * 0.75));
      const cutsCount = cutsImplied / BASIS_POINTS_PER_CUT;
      forwardReason = `${cutsCount >= 0 ? "+" : ""}${cutsCount.toFixed(1)} cuts priced by 24m`;
    }
  }
  let dirScore = 0, dirReason = "—";
  if (twoYearChange30d != null) {
    dirScore = Math.max(-100, Math.min(100, -twoYearChange30d * 200));
    dirReason = `${twoYearChange30d >= 0 ? "+" : ""}${(twoYearChange30d * 100).toFixed(0)}bp over 30d`;
  }
  let tpScore = 0, tpReason = "—";
  if (termPremium != null && termPremiumChange30d != null) {
    const changeComponent = Math.max(-50, Math.min(60, termPremiumChange30d * 300));
    const levelComponent = Math.max(-30, Math.min(40, (termPremium - 0.5) * 80));
    tpScore = Math.max(-100, Math.min(100, changeComponent + levelComponent));
    tpReason = `TP ${fmtRate(termPremium)} (${termPremiumChange30d >= 0 ? "+" : ""}${(termPremiumChange30d * 100).toFixed(0)}bp 30d)`;
  }
  let slopeScore = 0, slopeReason = "—";
  if (twoTenSpread != null && twoTenChange30d != null) {
    const changeC = Math.max(-60, Math.min(60, twoTenChange30d * 300));
    const levelC = Math.max(-40, Math.min(40, twoTenSpread * 60));
    slopeScore = Math.max(-100, Math.min(100, changeC + levelC));
    slopeReason = `2s10s ${fmtRate(twoTenSpread)} (${twoTenChange30d >= 0 ? "+" : ""}${(twoTenChange30d * 100).toFixed(0)}bp 30d)`;
  }
  const composite = (forwardScore + dirScore + tpScore + slopeScore) / 4;
  const regime = composite >= 50 ? "Convexity Activated"
    : composite >= 20 ? "Convexity Building"
    : composite >= -20 ? "Mixed / Neutral"
    : composite >= -50 ? "Rates Risk-On"
    : "Convexity Suppressed";
  return {
    score: composite,
    regime,
    components: [
      { label: "Forward Path", score: forwardScore, reason: forwardReason },
      { label: "2Y Direction", score: dirScore, reason: dirReason },
      { label: "Term Premium", score: tpScore, reason: tpReason },
      { label: "2s10s Slope", score: slopeScore, reason: slopeReason },
    ],
  };
}

function makeChartOptions() {
  return {
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#a1a1aa", fontSize: 11 },
    grid: { vertLines: { color: "rgba(82, 82, 91, 0.15)" }, horzLines: { color: "rgba(82, 82, 91, 0.15)" } },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: false, secondsVisible: false },
    autoSize: false,
  };
}

// ── Mini stat card ────────────────────────────────────────────────────────────

interface StatCardProps { label: string; value: React.ReactNode; sub?: React.ReactNode }
function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="px-3 py-1.5 rounded bg-muted/40 border border-border">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function RatesForward() {
  const [allSeries, setAllSeries] = useState<Record<string, RateSeries[]>>({});
  const [twoTenSpread, setTwoTenSpread] = useState<RateSeries[]>([]);
  const [tpSeries, setTpSeries] = useState<RateSeries[]>([]);       // THREEFYTP10
  const [expSeries, setExpSeries] = useState<RateSeries[]>([]);     // THREEFY10
  const [fittedSeries, setFittedSeries] = useState<RateSeries[]>([]); // THREEFF10
  const [vnqSeries, setVnqSeries] = useState<RateSeries[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chart refs
  const scoreHistoryRef = useRef<HTMLDivElement>(null);
  const twoYearRef = useRef<HTMLDivElement>(null);
  const tenDecompRef = useRef<HTMLDivElement>(null);
  const twoTenRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreChartRef = useRef<IChartApi | null>(null);
  const twoYearChartRef = useRef<IChartApi | null>(null);
  const tenDecompChartRef = useRef<IChartApi | null>(null);
  const twoTenChartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const [spotSeries, dgs2, dgs10, tp, exp, fitted, vnq] = await Promise.all([
          Promise.all(TENORS.map(t => fetchFredSeries(t.id))),
          fetchFredSeries("DGS2"),
          fetchFredSeries("DGS10"),
          fetchFredSeries("THREEFYTP10"),
          fetchFredSeries("THREEFY10"),
          fetchFredSeries("THREEFF10"),
          fetchFredSeries("VNQ").catch(() => [] as RateSeries[]),
        ]);
        if (cancelled) return;
        const byId: Record<string, RateSeries[]> = {};
        TENORS.forEach((t, i) => { byId[t.id] = spotSeries[i]; });
        byId["DGS2"] = dgs2; byId["DGS10"] = dgs10;
        setAllSeries(byId);
        setTpSeries(tp); setExpSeries(exp); setFittedSeries(fitted); setVnqSeries(vnq);
        const dgs2Map = new Map(dgs2.map(p => [p.time, p.value]));
        const spread = dgs10.filter(p => dgs2Map.has(p.time)).map(p => ({
          time: p.time,
          value: +(p.value - dgs2Map.get(p.time)!).toFixed(4),
        }));
        setTwoTenSpread(spread);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Computed values
  const latestDate = useMemo(() => {
    const dates: string[] = [];
    for (const series of Object.values(allSeries)) if (series?.length) dates.push(series[series.length - 1].time);
    return dates.length ? dates.sort()[dates.length - 1] : null;
  }, [allSeries]);

  const forwardScenarios = useMemo<ForwardScenarios | null>(() => {
    if (!latestDate) return null;
    const horizons = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7, 10];
    const buildCurve = (date: string) => {
      const spots = getSpotRates(allSeries, date).map(t => ({ years: t.tenor.years, rate: t.rate }));
      return bootstrapForwardCurve(spots, horizons);
    };
    return {
      today: { date: latestDate, curve: buildCurve(latestDate) },
      d30: { date: subtractDays(latestDate, 30), curve: buildCurve(subtractDays(latestDate, 30)) },
      d90: { date: subtractDays(latestDate, 90), curve: buildCurve(subtractDays(latestDate, 90)) },
    };
  }, [allSeries, latestDate]);

  const spot3m = useMemo(() => {
    const s = allSeries["DGS3MO"];
    return s?.length ? s[s.length - 1].value : null;
  }, [allSeries]);

  const twoYearInfo = useMemo(() => {
    const s = allSeries["DGS2"];
    if (!s?.length) return null;
    const last = s[s.length - 1];
    return { latest: last.value, time: last.time, d30: change30d(s), d90: (() => {
      const p = lookupRate(s, subtractDays(last.time, Math.round(FORWARD_APPROX_MULTIPLIER * 90)));
      return p == null ? null : last.value - p;
    })() };
  }, [allSeries]);

  const tenDecompInfo = useMemo(() => {
    const tp = latestPoint(tpSeries);
    const exp = latestPoint(expSeries);
    const fitted = latestPoint(fittedSeries);
    const dgs10 = allSeries["DGS10"];
    const ten = dgs10?.length ? { value: dgs10[dgs10.length - 1].value, time: dgs10[dgs10.length - 1].time } : null;
    return { tp, exp, fitted, ten, tp30: change30d(tpSeries), exp30: change30d(expSeries) };
  }, [tpSeries, expSeries, fittedSeries, allSeries]);

  const twoTenInfo = useMemo(() => {
    const last = latestPoint(twoTenSpread);
    if (!last) return null;
    return { latest: last.value, time: last.time, d30: change30d(twoTenSpread), d90: (() => {
      const p = lookupRate(twoTenSpread, subtractDays(last.time, Math.round(FORWARD_APPROX_MULTIPLIER * 90)));
      return p == null ? null : last.value - p;
    })() };
  }, [twoTenSpread]);

  const convexityScore = useMemo(() => computeConvexityScore({
    fwdCurve: forwardScenarios?.today.curve ?? [],
    spot3m,
    twoYearChange30d: twoYearInfo?.d30 ?? null,
    termPremium: tenDecompInfo.tp?.value ?? null,
    termPremiumChange30d: tenDecompInfo.tp30,
    twoTenSpread: twoTenInfo?.latest ?? null,
    twoTenChange30d: twoTenInfo?.d30 ?? null,
  }), [forwardScenarios, spot3m, twoYearInfo, tenDecompInfo, twoTenInfo]);

  // Weekly score history
  const weeklyScoreHistory = useMemo(() => {
    const dgs2 = allSeries["DGS2"] ?? [];
    const dgs3mo = allSeries["DGS3MO"] ?? [];
    if (!dgs2.length || !dgs3mo.length || !expSeries.length || !tpSeries.length || !twoTenSpread.length) return [];
    const dgs3moMap = new Map(dgs3mo.map(p => [p.time, p.value]));
    const tpMap = new Map(tpSeries.map(p => [p.time, p.value]));
    const ttMap = new Map(twoTenSpread.map(p => [p.time, p.value]));
    const horizons = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7, 10];
    const cutoff = subtractDays(dgs2[dgs2.length - 1].time, 365 * 10);
    const sampled = dgs2.filter(p => p.time >= cutoff).filter((_, i) => i % 5 === 0);
    const results: RateSeries[] = [];
    for (const pt of sampled) {
      const d = pt.time;
      const sp3m = dgs3moMap.get(d);
      const tp = tpMap.get(d);
      const tt = ttMap.get(d);
      if (sp3m == null || tp == null || tt == null) continue;
      const spotRates = getSpotRates(allSeries, d);
      if (spotRates.length < 4) continue;
      const curve = bootstrapForwardCurve(spotRates.map(s => ({ years: s.tenor.years, rate: s.rate })), horizons);
      const prev30 = subtractDays(d, 30);
      const dgs2Prev = lookupRate(dgs2, prev30);
      const tpPrev = lookupRate(tpSeries, prev30);
      const ttPrev = lookupRate(twoTenSpread, prev30);
      const score = computeConvexityScore({
        fwdCurve: curve, spot3m: sp3m,
        twoYearChange30d: dgs2Prev == null ? null : pt.value - dgs2Prev,
        termPremium: tp,
        termPremiumChange30d: tpPrev == null ? null : tp - tpPrev,
        twoTenSpread: tt,
        twoTenChange30d: ttPrev == null ? null : tt - ttPrev,
      });
      results.push({ time: d, value: +score.score.toFixed(1) });
    }
    return results;
  }, [allSeries, expSeries, tpSeries, twoTenSpread]);

  const scoreStats = useMemo<ScoreStats | null>(() => {
    if (!weeklyScoreHistory.length) return null;
    const vals = weeklyScoreHistory.map(p => p.value);
    const sorted = [...vals].sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const today = vals[vals.length - 1];
    const pctRank = vals.filter(v => v < today).length / vals.length * 100;
    return { min: sorted[0], max: sorted[sorted.length - 1], p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), today, percentile: pctRank, points: vals.length, startDate: weeklyScoreHistory[0].time };
  }, [weeklyScoreHistory]);

  const cutImplied = useMemo<CutImplied | null>(() => {
    if (!forwardScenarios || spot3m == null) return null;
    const fwd24 = forwardScenarios.today.curve.find(p => Math.abs(p.years - 2) < 0.05)?.forward;
    if (fwd24 == null) return null;
    const fwd12 = forwardScenarios.today.curve.find(p => Math.abs(p.years - 1) < 0.05)?.forward ?? null;
    const drop24 = (spot3m - fwd24) * 100;
    const drop12 = fwd12 != null ? (spot3m - fwd12) * 100 : null;
    return { cuts24: drop24 / BASIS_POINTS_PER_CUT, cuts12: drop12 != null ? drop12 / BASIS_POINTS_PER_CUT : null, drop24bp: drop24, drop12bp: drop12 };
  }, [forwardScenarios, spot3m]);

  // Chart: Score history
  useEffect(() => {
    if (!scoreHistoryRef.current || !weeklyScoreHistory.length) return;
    const el = scoreHistoryRef.current;
    const chart = createChart(el, {
      ...makeChartOptions(), width: el.clientWidth, height: 280,
      timeScale: { borderVisible: false, timeVisible: false, secondsVisible: false, fixLeftEdge: false, fixRightEdge: false },
      leftPriceScale: { visible: true, borderVisible: false },
      rightPriceScale: { visible: true, borderVisible: false },
    });
    if (vnqSeries.length) {
      const startDate = weeklyScoreHistory[0].time;
      const vnqFiltered = vnqSeries.filter(p => p.time >= startDate);
      if (vnqFiltered.length) {
        const base = vnqFiltered[0].value;
        const rebased = vnqFiltered.map(p => ({ time: p.time, value: +(p.value / base * 100).toFixed(2) }));
        chart.addSeries(LineSeries, { color: "rgba(139, 92, 246, 0.9)", lineWidth: 2, priceFormat: { type: "price" as const, precision: 0, minMove: 1 }, priceScaleId: "left", lastValueVisible: true, title: "VNQ (rebased)" }).setData(rebased);
      }
    }
    const scoreSeries = chart.addSeries(BaselineSeries, {
      baseValue: { type: "price", price: 0 },
      topLineColor: "#10b981", topFillColor1: "rgba(16, 185, 129, 0.35)", topFillColor2: "rgba(16, 185, 129, 0.05)",
      bottomLineColor: "#f43f5e", bottomFillColor1: "rgba(244, 63, 94, 0.05)", bottomFillColor2: "rgba(244, 63, 94, 0.35)",
      lineWidth: 2, priceFormat: { type: "price" as const, precision: 0, minMove: 1 }, priceScaleId: "right", title: "Score",
    });
    scoreSeries.setData(weeklyScoreHistory.map(p => ({ time: p.time, value: p.value })));
    scoreSeries.createPriceLine({ price: 50, color: "rgba(16, 185, 129, 0.6)", lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: "+50 Activated" });
    scoreSeries.createPriceLine({ price: 20, color: "rgba(16, 185, 129, 0.35)", lineStyle: 3, lineWidth: 1, axisLabelVisible: false, title: "" });
    scoreSeries.createPriceLine({ price: 0, color: "rgba(161, 161, 170, 0.4)", lineStyle: 0, lineWidth: 1, axisLabelVisible: false, title: "" });
    scoreSeries.createPriceLine({ price: -20, color: "rgba(244, 63, 94, 0.35)", lineStyle: 3, lineWidth: 1, axisLabelVisible: false, title: "" });
    scoreSeries.createPriceLine({ price: -50, color: "rgba(244, 63, 94, 0.6)", lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: "−50 Suppressed" });
    chart.timeScale().fitContent();
    scoreChartRef.current = chart;
    const ro = new ResizeObserver(() => { if (scoreHistoryRef.current) chart.applyOptions({ width: scoreHistoryRef.current.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); scoreChartRef.current = null; };
  }, [weeklyScoreHistory, vnqSeries]);

  // Chart: 2Y Treasury
  useEffect(() => {
    if (!twoYearRef.current || !allSeries["DGS2"]?.length) return;
    const el = twoYearRef.current;
    const chart = createChart(el, { ...makeChartOptions(), width: el.clientWidth, height: 280 });
    chart.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 2, priceFormat: { type: "price" as const, precision: 2, minMove: 0.01 } })
      .setData(allSeries["DGS2"].map(p => ({ time: p.time, value: p.value })));
    chart.timeScale().fitContent();
    twoYearChartRef.current = chart;
    const ro = new ResizeObserver(() => { if (twoYearRef.current) chart.applyOptions({ width: twoYearRef.current.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); twoYearChartRef.current = null; };
  }, [allSeries]);

  // Chart: 10Y Decomp
  useEffect(() => {
    if (!tenDecompRef.current || !expSeries.length || !tpSeries.length) return;
    const el = tenDecompRef.current;
    const chart = createChart(el, { ...makeChartOptions(), width: el.clientWidth, height: 320 });
    const tpMap = new Map(tpSeries.map(p => [p.time, p.value]));
    const combined = expSeries.filter(p => tpMap.has(p.time)).map(p => ({ time: p.time, exp: p.value, total: p.value + tpMap.get(p.time)! }));
    chart.addSeries(AreaSeries, { lineColor: "#3b82f6", topColor: "rgba(59, 130, 246, 0.45)", bottomColor: "rgba(59, 130, 246, 0.05)", lineWidth: 2, priceFormat: { type: "price" as const, precision: 2, minMove: 0.01 } })
      .setData(combined.map(p => ({ time: p.time, value: p.exp })));
    chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2, priceFormat: { type: "price" as const, precision: 2, minMove: 0.01 } })
      .setData(combined.map(p => ({ time: p.time, value: p.total })));
    chart.timeScale().fitContent();
    tenDecompChartRef.current = chart;
    const ro = new ResizeObserver(() => { if (tenDecompRef.current) chart.applyOptions({ width: tenDecompRef.current.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); tenDecompChartRef.current = null; };
  }, [expSeries, tpSeries]);

  // Chart: 2s10s
  useEffect(() => {
    if (!twoTenRef.current || !twoTenSpread.length) return;
    const el = twoTenRef.current;
    const chart = createChart(el, { ...makeChartOptions(), width: el.clientWidth, height: 280 });
    chart.addSeries(AreaSeries, { lineColor: "#10b981", topColor: "rgba(16, 185, 129, 0.35)", bottomColor: "rgba(239, 68, 68, 0.20)", lineWidth: 2, priceFormat: { type: "price" as const, precision: 2, minMove: 0.01 } })
      .setData(twoTenSpread.map(p => ({ time: p.time, value: p.value })));
    chart.timeScale().fitContent();
    twoTenChartRef.current = chart;
    const ro = new ResizeObserver(() => { if (twoTenRef.current) chart.applyOptions({ width: twoTenRef.current.clientWidth }); });
    ro.observe(el);
    return () => { ro.disconnect(); chart.remove(); twoTenChartRef.current = null; };
  }, [twoTenSpread]);

  // Canvas: Forward curve
  useEffect(() => {
    if (!canvasRef.current || !forwardScenarios) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = 320;
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const padL = 50, padR = 20, padT = 24, padB = 36;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const allPoints = [...forwardScenarios.today.curve, ...forwardScenarios.d30.curve, ...forwardScenarios.d90.curve];
    if (!allPoints.length) return;
    const allX = allPoints.map(p => p.years), allY = allPoints.map(p => p.forward);
    const xMin = Math.min(...allX), xMax = Math.max(...allX);
    const yMin = Math.min(...allY) - 0.2, yMax = Math.max(...allY) + 0.2;
    const toCanvasX = (y: number) => padL + (y - xMin) / ((xMax - xMin) || 1) * plotW;
    const toCanvasY = (v: number) => padT + (1 - (v - yMin) / ((yMax - yMin) || 1)) * plotH;
    // Grid
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.fillStyle = "#a1a1aa";
    ctx.strokeStyle = "rgba(82, 82, 91, 0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const v = yMin + i * (yMax - yMin) / 5;
      const y = toCanvasY(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(`${v.toFixed(2)}%`, padL - 6, y);
    }
    const xLabels = [0.25, 0.5, 1, 2, 3, 5, 7, 10];
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const x of xLabels) {
      if (x < xMin || x > xMax) continue;
      const cx = toCanvasX(x);
      ctx.fillText(x < 1 ? `${(x * 12).toFixed(0)}M` : `${x}Y`, cx, padT + plotH + 6);
      ctx.beginPath(); ctx.moveTo(cx, padT + plotH); ctx.lineTo(cx, padT + plotH + 4);
      ctx.strokeStyle = "rgba(82, 82, 91, 0.4)"; ctx.stroke();
      ctx.strokeStyle = "rgba(82, 82, 91, 0.15)";
    }
    // 12-24m band
    const x12 = toCanvasX(1), x24 = toCanvasX(2);
    ctx.fillStyle = "rgba(245, 158, 11, 0.08)";
    ctx.fillRect(x12, padT, x24 - x12, plotH);
    ctx.strokeStyle = "rgba(245, 158, 11, 0.5)"; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x24, padT); ctx.lineTo(x24, padT + plotH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f59e0b"; ctx.textAlign = "center"; ctx.font = "10px ui-sans-serif, system-ui";
    ctx.fillText("12-24m horizon", (x12 + x24) / 2, padT + 2);
    // Spot 3M line
    if (spot3m != null) {
      const cy = toCanvasY(spot3m);
      ctx.strokeStyle = "rgba(161, 161, 170, 0.6)"; ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(padL, cy); ctx.lineTo(padL + plotW, cy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#a1a1aa"; ctx.font = "10px ui-sans-serif, system-ui"; ctx.textAlign = "left";
      ctx.fillText(`Spot 3M ${spot3m.toFixed(2)}%`, padL + 6, cy - 4);
    }
    // Curves
    const curves = [
      { name: "90d ago", color: "rgba(99, 102, 241, 0.4)", lineWidth: 1.5, data: forwardScenarios.d90.curve, dash: [3, 3] as number[] },
      { name: "30d ago", color: "rgba(99, 102, 241, 0.7)", lineWidth: 1.8, data: forwardScenarios.d30.curve, dash: [4, 2] as number[] },
      { name: "Today", color: "#3b82f6", lineWidth: 2.5, data: forwardScenarios.today.curve, dash: null },
    ];
    for (const c of curves) {
      if (!c.data.length) continue;
      ctx.strokeStyle = c.color; ctx.lineWidth = c.lineWidth;
      c.dash ? ctx.setLineDash(c.dash) : ctx.setLineDash([]);
      ctx.beginPath();
      c.data.forEach((p, i) => { const cx = toCanvasX(p.years), cy = toCanvasY(p.forward); i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Legend
    let lx = padL + 8, ly = padT + 6;
    ctx.font = "11px ui-sans-serif, system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    for (const c of curves) {
      ctx.strokeStyle = c.color; ctx.lineWidth = c.lineWidth;
      c.dash ? ctx.setLineDash(c.dash) : ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(lx, ly + 6); ctx.lineTo(lx + 18, ly + 6); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#d4d4d8"; ctx.fillText(c.name, lx + 22, ly);
      lx += 80;
    }
  }, [forwardScenarios, spot3m]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground" data-testid="rates-forward-loading">Loading rates data...</div>;
  }
  if (error) {
    return <div className="flex items-center justify-center h-full text-destructive" data-testid="rates-forward-error">Error: {error}</div>;
  }

  const scoreColorClass = convexityScore.score >= 50 ? "text-emerald-400"
    : convexityScore.score >= 20 ? "text-emerald-300"
    : convexityScore.score >= -20 ? "text-zinc-300"
    : convexityScore.score >= -50 ? "text-amber-400"
    : "text-rose-400";

  return (
    <div className="h-full overflow-auto bg-background" data-testid="rates-forward-page">
      <div className="max-w-[1600px] mx-auto px-6 py-5 space-y-5">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Rates Forward</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Forward-expectations dashboard for REIT convexity activation. Latest data: {latestDate ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingDown className="w-3.5 h-3.5" />FRED daily series + NY Fed ACM term-premium decomposition
          </div>
        </div>

        {/* Composite score */}
        <div className="rounded-lg border border-border bg-card p-4" data-testid="composite-signal">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Convexity Activation Score</div>
              <div className="flex items-baseline gap-3">
                <div className={`text-4xl font-bold ${scoreColorClass}`} data-testid="composite-score">
                  {convexityScore.score >= 0 ? "+" : ""}{convexityScore.score.toFixed(0)}
                </div>
                <div className={`text-base font-medium ${scoreColorClass}`} data-testid="composite-regime">{convexityScore.regime}</div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground max-w-md leading-relaxed">
                Composite of forward path, 2Y direction, term-premium reopen, and 2s10s slope. Range −100 (rates risk-on) to +100 (full convexity activation).
              </div>
            </div>
            <div className="flex-1 min-w-[440px] grid grid-cols-2 gap-2">
              {convexityScore.components.map(c => {
                const cls = c.score >= 30 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                  : c.score >= -30 ? "text-zinc-300 bg-zinc-500/10 border-zinc-500/30"
                  : "text-rose-400 bg-rose-500/10 border-rose-500/30";
                return (
                  <div key={c.label} className={`rounded border px-3 py-2 ${cls}`} data-testid={`component-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wider opacity-80">{c.label}</span>
                      <span className="text-sm font-semibold">{c.score >= 0 ? "+" : ""}{c.score.toFixed(0)}</span>
                    </div>
                    <div className="text-[11px] mt-0.5 opacity-90">{c.reason}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Score history chart */}
        {weeklyScoreHistory.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4" data-testid="panel-score-history">
            <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Convexity Activation Score — History</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Same composite formula applied weekly across the last {scoreStats ? Math.round((Date.now() - new Date(scoreStats.startDate).getTime()) / (365 * 86400e3)) : 10} years. Score on right axis (green above 0 = convexity bias, red below = rates-selling-off). VNQ rebased to 100 on left axis (violet).
                </p>
              </div>
              {scoreStats && (
                <div className="flex gap-3 text-xs flex-wrap">
                  <StatCard label="Today" value={<span data-testid="score-today">{scoreStats.today >= 0 ? "+" : ""}{scoreStats.today.toFixed(0)}</span>} sub={`${scoreStats.percentile.toFixed(0)}th pct`} />
                  <StatCard label="10y range" value={`${scoreStats.min >= 0 ? "+" : ""}${scoreStats.min.toFixed(0)} to ${scoreStats.max >= 0 ? "+" : ""}${scoreStats.max.toFixed(0)}`} sub={`median ${scoreStats.p50 >= 0 ? "+" : ""}${scoreStats.p50.toFixed(0)}`} />
                  <StatCard label="25/75 band" value={`${scoreStats.p25 >= 0 ? "+" : ""}${scoreStats.p25.toFixed(0)} to ${scoreStats.p75 >= 0 ? "+" : ""}${scoreStats.p75.toFixed(0)}`} sub={`${scoreStats.points} weekly obs`} />
                </div>
              )}
            </div>
            <div ref={scoreHistoryRef} className="w-full" style={{ height: 280 }} data-testid="chart-score-history" />
          </div>
        )}

        {/* Forward curve canvas */}
        <div className="rounded-lg border border-border bg-card p-4" data-testid="panel-forward-curve">
          <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Forward Treasury Curve</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Instantaneous forwards bootstrapped from the par curve. The single best forward-expectations measure for "where rates go next 24 months."</p>
            </div>
            {cutImplied && (
              <div className="flex gap-3 text-xs">
                <StatCard label="12m horizon" value={<span data-testid="cuts-12m">{cutImplied.cuts12 != null ? `${cutImplied.cuts12 >= 0 ? "+" : ""}${cutImplied.cuts12.toFixed(1)} cuts` : "—"}</span>} sub={cutImplied.drop12bp != null ? `${cutImplied.drop12bp >= 0 ? "−" : "+"}${Math.abs(cutImplied.drop12bp).toFixed(0)}bp` : undefined} />
                <StatCard label="24m horizon" value={<span data-testid="cuts-24m">{cutImplied.cuts24 >= 0 ? "+" : ""}{cutImplied.cuts24.toFixed(1)} cuts</span>} sub={`${cutImplied.drop24bp >= 0 ? "−" : "+"}${Math.abs(cutImplied.drop24bp).toFixed(0)}bp`} />
              </div>
            )}
          </div>
          <div className="w-full"><canvas ref={canvasRef} className="w-full" style={{ height: 320 }} data-testid="canvas-forward-curve" /></div>
          <div className="mt-2 text-[11px] text-muted-foreground">X-axis = forward horizon (years). Curves shown for today, 30d ago, and 90d ago. Implied cuts assume 25bp per cut.</div>
        </div>

        {/* 2Y + 10Y grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 2Y Treasury */}
          <div className="rounded-lg border border-border bg-card p-4" data-testid="panel-two-year">
            <div className="flex items-start justify-between mb-3 gap-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">2-Year Treasury</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Fastest proxy for "where rates go next 24 months." Tracks expected policy path.</p>
              </div>
              {twoYearInfo && (
                <div className="text-right">
                  <div className="text-2xl font-semibold text-foreground" data-testid="two-year-latest">{fmtRate(twoYearInfo.latest)}</div>
                  <div className="text-[11px] text-muted-foreground">{twoYearInfo.time}</div>
                </div>
              )}
            </div>
            <div ref={twoYearRef} className="w-full" style={{ height: 280 }} data-testid="chart-two-year" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <StatCard label="30d change" value={<span className={twoYearInfo?.d30 != null && twoYearInfo.d30 < 0 ? "text-emerald-400" : twoYearInfo?.d30 != null && twoYearInfo.d30 > 0 ? "text-rose-400" : "text-foreground"}>{twoYearInfo?.d30 != null ? `${twoYearInfo.d30 >= 0 ? "+" : ""}${(twoYearInfo.d30 * 100).toFixed(0)}bp` : "—"}</span>} />
              <StatCard label="90d change" value={<span className={twoYearInfo?.d90 != null && twoYearInfo.d90 < 0 ? "text-emerald-400" : twoYearInfo?.d90 != null && twoYearInfo.d90 > 0 ? "text-rose-400" : "text-foreground"}>{twoYearInfo?.d90 != null ? `${twoYearInfo.d90 >= 0 ? "+" : ""}${(twoYearInfo.d90 * 100).toFixed(0)}bp` : "—"}</span>} />
            </div>
          </div>

          {/* 10Y ACM Decomp */}
          <div className="rounded-lg border border-border bg-card p-4" data-testid="panel-ten-decomp">
            <div className="flex items-start justify-between mb-3 gap-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">10Y Decomposition (ACM)</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Cluster 1's activation depends on the 10Y falling for the right reason — expectations vs term premium.</p>
              </div>
              {tenDecompInfo.fitted && (
                <div className="text-right">
                  <div className="text-2xl font-semibold text-foreground" data-testid="ten-year-latest">{fmtRate(tenDecompInfo.fitted.value)}</div>
                  <div className="text-[11px] text-muted-foreground">ACM fitted · {tenDecompInfo.fitted.time}</div>
                  {tenDecompInfo.ten && <div className="text-[10px] text-muted-foreground">DGS10 par · {fmtRate(tenDecompInfo.ten.value)}</div>}
                </div>
              )}
            </div>
            <div ref={tenDecompRef} className="w-full" style={{ height: 320 }} data-testid="chart-ten-decomp" />
            <div className="mt-2 flex items-center gap-3 text-[11px] flex-wrap">
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500/60" /><span className="text-muted-foreground">Risk-neutral expectations</span></span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500" /><span className="text-muted-foreground">Fitted total (= exp + TP)</span></span>
              <span className="text-muted-foreground/70">Vertical band = term premium</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <StatCard label="Term premium" value={<span className="font-semibold text-amber-400" data-testid="term-premium-latest">{fmtRate(tenDecompInfo.tp?.value)}</span>} sub={tenDecompInfo.tp30 != null ? `${tenDecompInfo.tp30 >= 0 ? "+" : ""}${(tenDecompInfo.tp30 * 100).toFixed(0)}bp 30d` : undefined} />
              <StatCard label="Expectations" value={<span className="font-semibold text-blue-400" data-testid="expectations-latest">{fmtRate(tenDecompInfo.exp?.value)}</span>} sub={tenDecompInfo.exp30 != null ? `${tenDecompInfo.exp30 >= 0 ? "+" : ""}${(tenDecompInfo.exp30 * 100).toFixed(0)}bp 30d` : undefined} />
            </div>
          </div>
        </div>

        {/* 2s10s */}
        <div className="rounded-lg border border-border bg-card p-4" data-testid="panel-two-ten-slope">
          <div className="flex items-start justify-between mb-3 gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">2s10s Curve Slope</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Bull-steepening (2Y falling faster than 10Y) is the T0 trigger for Cluster 1/5 convexity activation.</p>
            </div>
            {twoTenInfo && (
              <div className="text-right">
                <div className={`text-2xl font-semibold ${twoTenInfo.latest >= 0 ? "text-emerald-400" : "text-rose-400"}`} data-testid="two-ten-latest">
                  {twoTenInfo.latest >= 0 ? "+" : ""}{(twoTenInfo.latest * 100).toFixed(0)}bp
                </div>
                <div className="text-[11px] text-muted-foreground">{twoTenInfo.time}</div>
              </div>
            )}
          </div>
          <div ref={twoTenRef} className="w-full" style={{ height: 280 }} data-testid="chart-two-ten" />
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <StatCard label="Regime" value={
              <div className="font-semibold text-foreground flex items-center gap-1.5" data-testid="two-ten-regime">
                {twoTenInfo && twoTenInfo.latest < 0 ? <><TrendingDown className="w-3.5 h-3.5 text-rose-400" /> Inverted</>
                  : twoTenInfo && twoTenInfo.latest < 0.25 ? <><TrendingDown className="w-3.5 h-3.5 text-amber-400" /> Flat</>
                  : <><span className="text-emerald-400">↗</span> Steepening</>}
              </div>
            } />
            <StatCard label="30d slope change" value={<span className={twoTenInfo?.d30 != null && twoTenInfo.d30 > 0 ? "text-emerald-400" : twoTenInfo?.d30 != null && twoTenInfo.d30 < 0 ? "text-rose-400" : "text-foreground"}>{twoTenInfo?.d30 != null ? `${twoTenInfo.d30 >= 0 ? "+" : ""}${(twoTenInfo.d30 * 100).toFixed(0)}bp` : "—"}</span>} />
            <StatCard label="90d slope change" value={<span className={twoTenInfo?.d90 != null && twoTenInfo.d90 > 0 ? "text-emerald-400" : twoTenInfo?.d90 != null && twoTenInfo.d90 < 0 ? "text-rose-400" : "text-foreground"}>{twoTenInfo?.d90 != null ? `${twoTenInfo.d90 >= 0 ? "+" : ""}${(twoTenInfo.d90 * 100).toFixed(0)}bp` : "—"}</span>} />
          </div>
        </div>

        {/* Framework note */}
        <div className="rounded-lg border border-border bg-card/50 p-4 text-xs text-muted-foreground" data-testid="framework-note">
          <div className="font-semibold text-foreground mb-1">Framework</div>
          <div className="leading-relaxed">
            The forward Treasury curve is the single best forward-expectations measure, but for REIT convexity work specifically you need the 10Y decomposed into expectations and term premium — because Cluster 1's activation depends on the 10Y falling <em>for the right reason</em>. Bull-steepening (2s10s widening with 2Y falling) is the T0 trigger.
          </div>
        </div>
      </div>
    </div>
  );
}
