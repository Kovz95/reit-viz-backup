// Reconstructed from recovered-bundle/PremiumDiscountScreener-D60ZbT1-.js on 2026-06-11
import { useState, useEffect, useMemo, useRef } from "react";
import { useBaskets } from "@/lib/useBaskets";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { useUniverseDefaults } from "@/lib/universeDefaults";
import { fetchPeerRelative } from "@/lib/fetchPeerRelative";
import { fetchGlobalDatesList } from "@/lib/fetchGlobalDatesList";
import { computePeerDelta } from "@/lib/computePeerDelta";
import { CLASSIFICATION_KEYS } from "@/lib/classificationKeys";
import { Filter, ChevronUp, ChevronDown, X, Loader2, Search, ExternalLink } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { P as PlayIcon } from "@/lib/play";

const VALUATION_METRICS = [
  { id: "P/FFO FY2", label: "P/FFO FY2" },
  { id: "P/FFO LTM", label: "P/FFO LTM" },
  { id: "P/AFFO FY2", label: "P/AFFO FY2" },
  { id: "EV/EBITDA FY2", label: "EV/EBITDA FY2" },
  { id: "EV/EBITDA LTM", label: "EV/EBITDA LTM" },
  { id: "P/E FY2", label: "P/E FY2" },
  { id: "P/E LTM", label: "P/E LTM" },
  { id: "P/S FY2", label: "P/S FY2" },
  { id: "P/S LTM", label: "P/S LTM" },
  { id: "Dividend Yield", label: "Dividend Yield" },
  { id: "FFO Yield FY2", label: "FFO Yield FY2" },
  { id: "AFFO Yield FY2", label: "AFFO Yield FY2" },
];

const GROWTH_METRICS = [
  { id: "FY1 EPS Growth", label: "FY1 EPS Growth" },
  { id: "FY2 EPS Growth", label: "FY2 EPS Growth" },
  { id: "FY1 FFO Growth", label: "FY1 FFO Growth" },
  { id: "FY2 FFO Growth", label: "FY2 FFO Growth" },
  { id: "FY2 AFFO Growth", label: "FY2 AFFO Growth" },
  { id: "EBITDA Fwd Growth%", label: "EBITDA Fwd Growth (FY1/LTM)" },
  { id: "EBITDA FY2 Growth%", label: "EBITDA FY2 Growth (FY2/FY1)" },
  { id: "Sales LTM YoY%", label: "Sales LTM YoY %" },
];

const CLASSIFICATION_LABELS: Record<string, string> = {
  economy: "Economy",
  sector: "Sector",
  subsector: "Subsector",
  industryGroup: "Industry Group",
  industry: "Industry",
  subindustry: "Subindustry",
};

const NULL_RESULT = {
  premGivenGrowth: null,
  growthGivenPrem: null,
  impliedPrem: NaN,
  premGap: NaN,
  impliedGrowth: NaN,
  growthGap: NaN,
  label: "—",
  score: 0,
  rationale: "insufficient history",
  lastP: NaN,
  lastG: NaN,
};

interface PairPoint { p: number; g: number; }

interface BandResult {
  n: number;
  median: number;
  p25: number;
  p75: number;
  bandLo: number;
  bandHi: number;
  todayPctile: number;
}

function computePairDelta(premiumSeries: any[], growthSeries: any[], sigmaFactor = 0.2): any {
  if (premiumSeries.length < 60 || growthSeries.length < 60) return NULL_RESULT;
  const lastP = premiumSeries[premiumSeries.length - 1]?.value;
  const lastG = growthSeries[growthSeries.length - 1]?.value;
  if (!Number.isFinite(lastP) || !Number.isFinite(lastG)) return NULL_RESULT;
  const gMap = new Map<string, number>();
  for (const pt of growthSeries) gMap.set(pt.time, pt.value);
  const pairs: PairPoint[] = [];
  for (const pt of premiumSeries) {
    const g = gMap.get(pt.time);
    if (g !== undefined && Number.isFinite(pt.value) && Number.isFinite(g)) {
      pairs.push({ p: pt.value, g });
    }
  }
  if (pairs.length < 60) return NULL_RESULT;
  const meanP = pairs.reduce((s, pt) => s + pt.p, 0) / pairs.length;
  const meanG = pairs.reduce((s, pt) => s + pt.g, 0) / pairs.length;
  const stdP = Math.sqrt(pairs.reduce((s, pt) => s + (pt.p - meanP) ** 2, 0) / pairs.length);
  const stdG = Math.sqrt(pairs.reduce((s, pt) => s + (pt.g - meanG) ** 2, 0) / pairs.length);
  if (stdP === 0 || stdG === 0) return NULL_RESULT;

  function getBand(axis: "p" | "g", center: number, std: number, sigmaF: number, minPts: number, today: number): BandResult | null {
    let sigma = sigmaF;
    let pts: number[] = [];
    for (let iter = 0; iter < 5; iter++) {
      const bandwidth = sigma * std;
      const lo = center - bandwidth;
      const hi = center + bandwidth;
      pts = [];
      for (const pt of pairs) {
        const x = axis === "p" ? pt.g : pt.p;
        if (x >= lo && x <= hi) pts.push(axis === "p" ? pt.p : pt.g);
      }
      if (pts.length >= minPts) break;
      sigma *= 1.4;
    }
    if (pts.length < minPts) return null;
    pts.sort((a, b) => a - b);
    const quantile = (q: number) => {
      const idx = Math.min(pts.length - 1, Math.max(0, Math.floor(q * (pts.length - 1))));
      return pts[idx];
    };
    let countBelow = 0;
    for (const v of pts) { if (v < today) countBelow++; else break; }
    const todayPctile = pts.length > 1 ? (countBelow / (pts.length - 1)) * 100 : 50;
    const bandwidth = sigma * std;
    return {
      n: pts.length,
      median: quantile(0.5),
      p25: quantile(0.25),
      p75: quantile(0.75),
      bandLo: center - bandwidth,
      bandHi: center + bandwidth,
      todayPctile,
    };
  }

  const premGivenGrowth = getBand("p", lastG, stdG, sigmaFactor, 20, lastP);
  const growthGivenPrem = getBand("g", lastP, stdP, sigmaFactor, 20, lastG);
  const impliedPrem = premGivenGrowth ? premGivenGrowth.median : NaN;
  const premGap = Number.isFinite(impliedPrem) ? lastP - impliedPrem : NaN;
  const impliedGrowth = growthGivenPrem ? growthGivenPrem.median : NaN;
  const growthGap = Number.isFinite(impliedGrowth) ? lastG - impliedGrowth : NaN;

  let hP = 0, hG = 0;
  if (premGivenGrowth) { const r = premGivenGrowth.todayPctile; hP = r <= 25 ? 1 : r >= 75 ? -1 : 0; }
  if (growthGivenPrem) { const r = growthGivenPrem.todayPctile; hG = r >= 75 ? 1 : r <= 25 ? -1 : 0; }
  const score = hP + hG;
  let label = "Neutral", rationale = "";
  if (hP === 1 && hG === 1) { label = "Attractive"; rationale = "premium below fair-for-growth & growth above fair-for-premium"; }
  else if (hP === -1 && hG === -1) { label = "Expensive"; rationale = "premium above fair-for-growth & growth below fair-for-premium"; }
  else if (hP === 1 && hG >= 0) { label = "Attractive"; rationale = "premium below what history pays for this growth"; }
  else if (hP === -1 && hG <= 0) { label = "Expensive"; rationale = "premium above what history pays for this growth"; }
  else if (hG === 1 && hP >= 0) { label = "Attractive"; rationale = "growth above what history accompanies this premium"; }
  else if (hG === -1 && hP <= 0) { label = "Expensive"; rationale = "growth below what history accompanies this premium"; }
  else if (hP === 1 && hG === -1) { label = "Neutral"; rationale = "cheap-for-growth but growth lagging — mixed"; }
  else if (hP === -1 && hG === 1) { label = "Neutral"; rationale = "rich-for-growth but growth ripping — mixed"; }
  else { label = "Neutral"; rationale = "within historical range"; }

  return { premGivenGrowth, growthGivenPrem, impliedPrem, premGap, impliedGrowth, growthGap, label, score, rationale, lastP, lastG };
}

function verdictScore(verdict: string): number {
  if (verdict === "Attractive") return 2;
  if (verdict === "Neutral") return 1;
  if (verdict === "Expensive") return 0;
  return -1;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const cls = verdict === "Attractive"
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
    : verdict === "Expensive"
    ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
    : verdict === "Neutral"
    ? "bg-amber-500/10 text-amber-300/90 border-amber-500/30"
    : "bg-white/5 text-muted-foreground border-white/10";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cls}`}>
      {verdict}
    </span>
  );
}

export default function PremiumDiscountScreener() {
  const { available, valuationMetric, growthMetric } = useUniverseDefaults();
  const [allTickers, setAllTickers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { baskets } = useBaskets();
  const [universeMode, setUniverseMode] = useState<"workbook" | "basket" | "classification">("workbook");
  const [selectedBasket, setSelectedBasket] = useState("");
  const [classKey, setClassKey] = useState("subindustry");
  const [classValue, setClassValue] = useState("");
  const [peerDimension, setPeerDimension] = useState("subindustry");
  const [valuationMetricSel, setValuationMetricSel] = useState(valuationMetric);
  const [growthMetricSel, setGrowthMetricSel] = useState(growthMetric);
  const valLockedRef = useRef(false);
  const growthLockedRef = useRef(false);
  const [sigmaFactor, setSigmaFactor] = useState(0.2);
  const [verdictFilter, setVerdictFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [sortState, setSortState] = useState({ key: "score", dir: -1 });
  const [results, setResults] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, currentTask: "" });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (available.size !== 0) {
      if (!valLockedRef.current && !available.has(valuationMetricSel)) setValuationMetricSel(valuationMetric);
      if (!growthLockedRef.current && !available.has(growthMetricSel)) setGrowthMetricSel(growthMetric);
    }
  }, [available, valuationMetric, growthMetric, valuationMetricSel, growthMetricSel]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchWorkbookTickers().then((tickers: any[]) => {
      if (active) { setAllTickers(tickers); setLoading(false); }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const universeTickers = useMemo(() => {
    if (universeMode === "workbook") return allTickers.map(t => t.ticker);
    if (universeMode === "basket") {
      const basket = baskets.find(b => b.id === selectedBasket);
      return basket ? basket.tickers : [];
    }
    return classValue ? allTickers.filter(t => t[classKey] === classValue).map(t => t.ticker) : [];
  }, [universeMode, selectedBasket, baskets, classKey, classValue, allTickers]);

  const classValues = useMemo(() => {
    const s = new Set<string>();
    for (const t of allTickers) { const v = t[classKey]; if (v) s.add(v); }
    return Array.from(s).sort();
  }, [allTickers, classKey]);

  async function runScreen() {
    if (universeTickers.length === 0) {
      setErrorMsg("Universe is empty — pick a basket or classification value.");
      return;
    }
    cancelRef.current = false;
    setErrorMsg(null);
    setRunning(true);
    setResults([]);
    setProgress({ done: 0, total: universeTickers.length, currentTask: "starting…" });
    const output: any[] = [];
    const tickerMap = new Map(allTickers.map(t => [t.ticker, t]));
    for (let i = 0; i < universeTickers.length && !cancelRef.current; i++) {
      const ticker = universeTickers[i];
      const meta = tickerMap.get(ticker);
      const peerClass = meta && meta[peerDimension] || "";
      setProgress({ done: i, total: universeTickers.length, currentTask: ticker });
      if (!peerClass) {
        output.push({
          ticker, name: meta?.name || ticker, peerClass: "—", verdict: "—", score: 0,
          lastP: NaN, lastG: NaN, premGap: NaN, growthGap: NaN,
          premPctile: null, growthPctile: null, n: 0,
          rationale: `no ${CLASSIFICATION_LABELS[peerDimension]} classification`,
        });
        setResults([...output]);
        continue;
      }
      try {
        const [valData, growthData] = await Promise.all([
          fetchPeerRelative(ticker, peerDimension, peerClass, valuationMetricSel, "median", undefined, fetchGlobalDatesList),
          fetchPeerRelative(ticker, peerDimension, peerClass, growthMetricSel, "median", undefined, fetchGlobalDatesList),
        ]);
        const valDelta = computePeerDelta(valData.targetSeries, valData.groupSeries, "pct");
        const growthDelta = computePeerDelta(growthData.targetSeries, growthData.groupSeries, "abs");
        const result = computePairDelta(valDelta, growthDelta, sigmaFactor);
        const nP = result.premGivenGrowth?.n ?? 0;
        const nG = result.growthGivenPrem?.n ?? 0;
        output.push({
          ticker, name: meta?.name || ticker, peerClass, verdict: result.label, score: result.score,
          lastP: result.lastP, lastG: result.lastG, premGap: result.premGap, growthGap: result.growthGap,
          premPctile: result.premGivenGrowth?.todayPctile ?? null,
          growthPctile: result.growthGivenPrem?.todayPctile ?? null,
          n: Math.min(nP || 0, nG || 0), rationale: result.rationale,
        });
      } catch (err: any) {
        output.push({
          ticker, name: meta?.name || ticker, peerClass, verdict: "—", score: 0,
          lastP: NaN, lastG: NaN, premGap: NaN, growthGap: NaN,
          premPctile: null, growthPctile: null, n: 0,
          rationale: err?.message ? `error: ${err.message}` : "computation failed",
        });
      }
      setResults([...output]);
    }
    setProgress({ done: universeTickers.length, total: universeTickers.length, currentTask: "" });
    setRunning(false);
  }

  const filteredResults = useMemo(() => {
    let rows = results;
    if (verdictFilter !== "all") rows = rows.filter(r => r.verdict === verdictFilter);
    if (searchText) {
      const q = searchText.toUpperCase();
      rows = rows.filter(r => r.ticker.includes(q) || r.name.toUpperCase().includes(q) || r.peerClass.toUpperCase().includes(q));
    }
    const dir = sortState.dir;
    return [...rows].sort((a, b) => {
      const ak = a[sortState.key];
      const bk = b[sortState.key];
      if (sortState.key === "verdict") return dir * (verdictScore(a.verdict) - verdictScore(b.verdict));
      if (ak == null && bk == null) return 0;
      if (ak == null || (typeof ak === "number" && !Number.isFinite(ak))) return 1;
      if (bk == null || (typeof bk === "number" && !Number.isFinite(bk))) return -1;
      if (typeof ak === "string") return dir * ak.localeCompare(bk);
      return dir * (ak - bk);
    });
  }, [results, verdictFilter, searchText, sortState]);

  const counts = useMemo(() => {
    let a = 0, e = 0, n = 0, d = 0;
    for (const r of results) {
      if (r.verdict === "Attractive") a++;
      else if (r.verdict === "Expensive") e++;
      else if (r.verdict === "Neutral") n++;
      else d++;
    }
    return { a, e, n, d };
  }, [results]);

  function handleSort(key: string) {
    setSortState(s => ({ key, dir: s.key === key && s.dir === -1 ? 1 : -1 }));
  }

  function SortTh({ k, label, align = "left" }: { k: string; label: string; align?: "left" | "right" }) {
    const active = sortState.key === k;
    return (
      <th
        className={`px-2 py-1.5 cursor-pointer select-none hover:bg-white/5 ${align === "right" ? "text-right" : "text-left"}`}
        onClick={() => handleSort(k)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sortState.dir === -1 ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </span>
      </th>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-card/40 backdrop-blur">
        <div className="px-3 py-2 flex items-center gap-3 flex-wrap text-[11px]">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Filter className="w-3.5 h-3.5 text-amber-400" />
            P/D Screener
          </div>
          <div className="h-5 w-px bg-border" />
          <span className="text-muted-foreground">Universe</span>
          <Select value={universeMode} onValueChange={v => setUniverseMode(v as any)}>
            <SelectTrigger className="h-7 w-auto min-w-[170px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="workbook">Entire workbook</SelectItem>
              <SelectItem value="basket">Basket…</SelectItem>
              <SelectItem value="classification">Classification…</SelectItem>
            </SelectContent>
          </Select>
          {universeMode === "basket" && (
            <Select value={selectedBasket} onValueChange={setSelectedBasket}>
              <SelectTrigger className="h-7 w-auto min-w-[210px] text-[11px]"><SelectValue placeholder="Pick basket…" /></SelectTrigger>
              <SelectContent>
                {baskets.length === 0
                  ? <SelectItem value="__empty" disabled>No baskets saved yet</SelectItem>
                  : baskets.map(b => <SelectItem key={b.id} value={b.id}>{b.name} ({b.tickers.length})</SelectItem>)
                }
              </SelectContent>
            </Select>
          )}
          {universeMode === "classification" && (
            <>
              <Select value={classKey} onValueChange={k => { setClassKey(k); setClassValue(""); }}>
                <SelectTrigger className="h-7 w-auto min-w-[165px] text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLASSIFICATION_KEYS.map((k: string) => <SelectItem key={k} value={k}>{CLASSIFICATION_LABELS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={classValue} onValueChange={setClassValue}>
                <SelectTrigger className="h-7 w-auto min-w-[265px] text-[11px]"><SelectValue placeholder={`Pick ${CLASSIFICATION_LABELS[classKey]}…`} /></SelectTrigger>
                <SelectContent>
                  {classValues.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
          <div className="h-5 w-px bg-border" />
          <span className="text-muted-foreground">Valuation</span>
          <Select value={valuationMetricSel} onValueChange={v => { valLockedRef.current = true; setValuationMetricSel(v); }}>
            <SelectTrigger className="h-7 w-auto min-w-[165px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VALUATION_METRICS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">Growth</span>
          <Select value={growthMetricSel} onValueChange={v => { growthLockedRef.current = true; setGrowthMetricSel(v); }}>
            <SelectTrigger className="h-7 w-auto min-w-[265px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GROWTH_METRICS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">Peers by</span>
          <Select value={peerDimension} onValueChange={setPeerDimension}>
            <SelectTrigger className="h-7 w-auto min-w-[165px] text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CLASSIFICATION_KEYS.map((k: string) => <SelectItem key={k} value={k}>{CLASSIFICATION_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">σ band</span>
          <Input
            type="number" step="0.05" value={sigmaFactor}
            onChange={e => setSigmaFactor(Math.max(0.05, parseFloat(e.target.value) || 0.2))}
            className="h-7 w-16 text-[11px]"
          />
          <div className="flex-1" />
          {running ? (
            <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => { cancelRef.current = true; }}>
              <X className="w-3 h-3 mr-1" />Cancel
            </Button>
          ) : (
            <Button size="sm" className="h-7 text-[11px]" onClick={runScreen} disabled={loading || universeTickers.length === 0}>
              <PlayIcon className="w-3 h-3 mr-1" />Run screen
            </Button>
          )}
        </div>
        <div className="px-3 pb-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>
            Universe:{" "}
            <span className={`font-mono ${universeTickers.length === 0 ? "text-rose-400" : "text-foreground"}`}>
              {universeTickers.length}
            </span>{" "}
            tickers
            {universeTickers.length === 0 && (
              <span className="ml-2 text-rose-400">
                {universeMode === "basket" ? "— pick a basket above" : universeMode === "classification" ? `— pick a ${CLASSIFICATION_LABELS[classKey]}` : "— workbook is empty"}
              </span>
            )}
          </span>
          {running && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
              Computing {progress.done}/{progress.total} · {progress.currentTask}
            </span>
          )}
          {running && progress.total > 0 && (
            <div className="flex-1 h-1 bg-white/5 rounded overflow-hidden max-w-xs">
              <div className="h-full bg-amber-400/70" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          )}
          {errorMsg && <span className="text-rose-400">{errorMsg}</span>}
        </div>
        {results.length > 0 && (
          <div className="px-3 pb-2 flex items-center gap-2 flex-wrap text-[11px] border-t border-border/50 pt-2">
            <span className="text-muted-foreground">Verdict</span>
            {["all", "Attractive", "Neutral", "Expensive"].map(v => (
              <button
                key={v}
                onClick={() => setVerdictFilter(v)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                  verdictFilter === v
                    ? v === "Attractive" ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/50"
                    : v === "Expensive" ? "bg-rose-500/20 text-rose-200 border-rose-500/50"
                    : v === "Neutral" ? "bg-amber-500/20 text-amber-200 border-amber-500/50"
                    : "bg-white/10 text-foreground border-white/30"
                    : "bg-transparent text-muted-foreground border-white/10 hover:bg-white/5"
                }`}
              >
                {v === "all" ? "All" : v}
                {v !== "all" && (
                  <span className="ml-1 opacity-60">
                    ({v === "Attractive" ? counts.a : v === "Expensive" ? counts.e : counts.n})
                  </span>
                )}
              </button>
            ))}
            <div className="h-4 w-px bg-border mx-1" />
            <Search className="w-3 h-3 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="ticker / name / peer class"
              className="h-7 w-44 text-[11px]"
            />
            <span className="text-muted-foreground ml-auto">
              Showing <span className="text-foreground">{filteredResults.length}</span> / {results.length} ·{" "}
              <span className="text-emerald-400">{counts.a}</span> attractive ·{" "}
              <span className="text-amber-400">{counts.n}</span> neutral ·{" "}
              <span className="text-rose-400">{counts.e}</span> expensive
              {counts.d > 0 && <> · <span className="text-muted-foreground">{counts.d}</span> n/a</>}
            </span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {results.length === 0 && !running ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Filter className="w-10 h-10 opacity-30" />
            <div>
              Pick a universe and metrics above, then click{" "}
              <span className="text-foreground font-medium">Run screen</span>.
            </div>
            <div className="text-[10px] opacity-70 max-w-md text-center">
              Each ticker is screened the same way the P/D page screens a single ticker: today's premium vs peer median is
              compared to the historical distribution of premiums seen at this ticker's current growth differential. Same
              metrics, same band, same verdict math.
            </div>
          </div>
        ) : (
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-card/95 backdrop-blur text-muted-foreground border-b border-border">
              <tr>
                <SortTh k="ticker" label="Ticker" />
                <SortTh k="name" label="Name" />
                <SortTh k="peerClass" label={`Peer ${CLASSIFICATION_LABELS[peerDimension]}`} />
                <SortTh k="verdict" label="Verdict" />
                <SortTh k="score" label="Score" align="right" />
                <SortTh k="lastP" label="Prem %" align="right" />
                <SortTh k="premGap" label="Prem gap" align="right" />
                <SortTh k="premPctile" label="Prem pct" align="right" />
                <SortTh k="lastG" label="Growth Δ" align="right" />
                <SortTh k="growthGap" label="Growth gap" align="right" />
                <SortTh k="growthPctile" label="Growth pct" align="right" />
                <SortTh k="n" label="n" align="right" />
                <th className="px-2 py-1.5 text-left">Rationale</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filteredResults.map(row => (
                <tr key={row.ticker} className="border-b border-border/30 hover:bg-white/5">
                  <td className="px-2 py-1 font-semibold text-foreground">{row.ticker}</td>
                  <td className="px-2 py-1 text-foreground/70 truncate max-w-[180px]">{row.name}</td>
                  <td className="px-2 py-1 text-foreground/60 truncate max-w-[160px]">{row.peerClass}</td>
                  <td className="px-2 py-1"><VerdictBadge verdict={row.verdict} /></td>
                  <td className={`px-2 py-1 text-right font-semibold ${row.score > 0 ? "text-emerald-300" : row.score < 0 ? "text-rose-300" : "text-foreground/70"}`}>
                    {row.score > 0 ? `+${row.score}` : row.score}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {Number.isFinite(row.lastP) ? `${row.lastP > 0 ? "+" : ""}${row.lastP.toFixed(1)}%` : "—"}
                  </td>
                  <td className={`px-2 py-1 text-right ${row.premGap < 0 ? "text-emerald-300/80" : row.premGap > 0 ? "text-rose-300/80" : ""}`}>
                    {Number.isFinite(row.premGap) ? `${row.premGap > 0 ? "+" : ""}${row.premGap.toFixed(1)}` : "—"}
                  </td>
                  <td className={`px-2 py-1 text-right ${row.premPctile != null && row.premPctile <= 25 ? "text-emerald-300" : row.premPctile != null && row.premPctile >= 75 ? "text-rose-300" : ""}`}>
                    {row.premPctile != null ? `${row.premPctile.toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {Number.isFinite(row.lastG) ? `${row.lastG > 0 ? "+" : ""}${row.lastG.toFixed(1)}pp` : "—"}
                  </td>
                  <td className={`px-2 py-1 text-right ${row.growthGap > 0 ? "text-emerald-300/80" : row.growthGap < 0 ? "text-rose-300/80" : ""}`}>
                    {Number.isFinite(row.growthGap) ? `${row.growthGap > 0 ? "+" : ""}${row.growthGap.toFixed(1)}` : "—"}
                  </td>
                  <td className={`px-2 py-1 text-right ${row.growthPctile != null && row.growthPctile >= 75 ? "text-emerald-300" : row.growthPctile != null && row.growthPctile <= 25 ? "text-rose-300" : ""}`}>
                    {row.growthPctile != null ? `${row.growthPctile.toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right text-foreground/60">{row.n || "—"}</td>
                  <td className="px-2 py-1 text-foreground/55 text-[10px] italic truncate max-w-[260px]" title={row.rationale}>
                    {row.rationale}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <a
                      href="#/premium-discount"
                      onClick={() => {
                        try {
                          sessionStorage.setItem("pd-screener-handoff", JSON.stringify({
                            ticker: row.ticker, valMetric: valuationMetricSel,
                            growthMetric: growthMetricSel, dimension: peerDimension,
                          }));
                        } catch {}
                      }}
                      className="inline-flex items-center gap-0.5 text-[10px] text-amber-400 hover:text-amber-300"
                      title="Open in Premium/Discount page"
                    >
                      open <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
