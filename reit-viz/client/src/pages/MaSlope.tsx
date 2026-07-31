// MA Slope Inflections — where does the slope of a moving average turn, and
// does that turn predict forward returns?
//
// Two workflows over hourly/daily/weekly bars and all 12 MA types:
//  - Universe Scan: which tickers just had a slope inflection (fixed config or
//    a small per-ticker auto-sweep), with the historical edge of that config.
//  - Deep Dive: sweep MA types × periods on one ticker, rank configs by
//    baseline-relative edge (sample-size shrunk), inspect horizon stats, the
//    event-aligned average path, the distribution, and the event log.
//
// Math in lib/maSlope, data in lib/maSlopeData, kernels in lib/maSlopeSweep.

import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { Play, Loader2, LineChart as LineChartIcon, ChevronDown, ChevronRight, Flame, Search } from "lucide-react";
import { fetchWorkbookTickers, type TickerMeta } from "@/lib/fetchWorkbookTickers";
import { useTableSort, SortHeader } from "@/lib/useTableSort";
import { BasketScopeSelect, useBasketScope } from "@/components/BasketScopeSelect";
import { FilterDropdown, applyClassFilters, emptyClassFilters, type ClassFilters } from "@/components/ClassificationFilters";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { emitChartSignals } from "@/lib/chartBridge";
import { PagePresets } from "@/components/PagePresets";
import { MA_TYPES, type MaType } from "@/lib/maEngine";
import { DEFAULT_PERIODS } from "@/lib/findBestMA";
import { defaultMaSlopeParams, configLabel, type MaSlopeParams, type SlopeFreq } from "@/lib/maSlope";
import { SLOPE_HORIZONS, defaultPrimaryHorizon, horizonLabel, loadSlopeSeries } from "@/lib/maSlopeData";
import { pctFmt, buildHistogram, type StudyResult } from "@/lib/eventStudy";
import {
  runDeepDiveSweep, runUniverseScan, tStatOf, statsAt,
  type ConfigEval, type ScanRow, type ScanMode,
} from "@/lib/maSlopeSweep";

const FREQS: Array<{ key: SlopeFreq; label: string }> = [
  { key: "hourly", label: "Hourly" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
];

type ScanScope = "universe" | "list" | "pairs" | "combos";
const SCOPE_LABEL: Record<ScanScope, string> = {
  universe: "Universe",
  list: "Ticker list",
  pairs: "Pairs",
  combos: "Pair combos",
};

/** Hard cap on symbols per scan run (each is a full fetch + eval; pair combos
 *  explode combinatorially). The UI says when a scope was truncated. */
const MAX_TARGETS = 150;

const CLASS_FIELDS = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Ind. Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
] as const;

/** Parse free-typed symbols: whitespace/comma separated, any Yahoo symbol.
 *  With pairMode, only "A/B" tokens survive. */
function parseSymbols(text: string, pairMode: boolean): string[] {
  const out: string[] = [];
  for (const tok of text.toUpperCase().split(/[\s,;]+/)) {
    if (!tok) continue;
    if (pairMode) {
      const [a, b] = tok.split("/");
      if (a && b && a !== b && !out.includes(tok)) out.push(`${a}/${b}`);
    } else if (!tok.includes("/") && !out.includes(tok)) {
      out.push(tok);
    }
  }
  return out;
}

const SETTINGS_KEY = "reit-viz:ma-slope:settings";

/** Everything the page persists across sessions (detection + scan config). */
interface PageSettings {
  freq: SlopeFreq;
  det: Omit<MaSlopeParams, "maType" | "period">;
  fixedType: MaType;
  fixedPeriod: number;
  scanKind: "fixed" | "auto";
  autoTypes: MaType[];
  autoPeriods: number[];
  freshBars: number;
  minEvents: number;
  /** Percent of the series (from the end) held out for the OOS check; 0 = off. */
  holdoutPct: number;
  ddTypes: MaType[];
  ddPeriods: number[];
  scanScope: ScanScope;
  /** Free-typed symbols for the "Ticker list" scope (any Yahoo symbol). */
  listText: string;
  /** Free-typed "A/B" ratios for the "Pairs" scope. */
  pairsText: string;
}

function defaultSettings(): PageSettings {
  const d = defaultMaSlopeParams();
  return {
    freq: "daily",
    det: {
      slopeLookback: d.slopeLookback, measure: d.measure, thresholdK: d.thresholdK,
      confirmBars: d.confirmBars, minBarsBetween: d.minBarsBetween, detectCurvature: d.detectCurvature,
    },
    fixedType: "EMA",
    fixedPeriod: 50,
    scanKind: "fixed",
    autoTypes: ["SMA", "EMA", "HMA", "KAMA"],
    autoPeriods: [10, 20, 50, 100, 150, 200],
    freshBars: 3,
    minEvents: 10,
    holdoutPct: 30,
    ddTypes: [...MA_TYPES],
    ddPeriods: [...DEFAULT_PERIODS],
    scanScope: "universe",
    listText: "",
    pairsText: "",
  };
}

function loadSettings(): PageSettings {
  const def = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const p = JSON.parse(raw);
    return {
      ...def, ...p,
      det: { ...def.det, ...(p?.det ?? {}) },
      autoTypes: Array.isArray(p?.autoTypes) ? p.autoTypes.filter((t: any) => MA_TYPES.includes(t)) : def.autoTypes,
      ddTypes: Array.isArray(p?.ddTypes) ? p.ddTypes.filter((t: any) => MA_TYPES.includes(t)) : def.ddTypes,
      autoPeriods: Array.isArray(p?.autoPeriods) ? p.autoPeriods.filter((n: any) => Number.isFinite(n) && n >= 2) : def.autoPeriods,
      ddPeriods: Array.isArray(p?.ddPeriods) ? p.ddPeriods.filter((n: any) => Number.isFinite(n) && n >= 2) : def.ddPeriods,
      scanScope: p?.scanScope in SCOPE_LABEL ? p.scanScope : def.scanScope,
    };
  } catch {
    return def;
  }
}

const fmtT = (t: number) => (Number.isFinite(t) ? t.toFixed(2) : "—");
const fmtPUp = (s: { pUp: number } | undefined) =>
  s && Number.isFinite(s.pUp) ? `${(s.pUp * 100).toFixed(0)}%` : "—";
const edgeClass = (v: number) => (!Number.isFinite(v) ? "" : v > 0 ? "text-chart-2" : "text-destructive");
const inputCls = "bg-background border border-border rounded px-2 py-1 text-xs w-full";
const selectCls = "bg-background border border-border rounded px-1.5 py-1 text-xs";
const btnCls = "inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs hover:bg-muted/50 disabled:opacity-50";

function DirBadge({ direction, kind }: { direction: "up" | "down"; kind: "slope" | "curvature" }) {
  const up = direction === "up";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
      up ? "border-chart-2/40 bg-chart-2/10 text-chart-2" : "border-destructive/40 bg-destructive/10 text-destructive"
    }`}>
      {up ? "▲" : "▼"} {kind === "curvature" ? "curv" : "slope"}
    </span>
  );
}

/** Out-of-sample verdict cell: holdout edge + confirm mark. */
function OosCell({ holdout }: { holdout: ConfigEval["holdout"] }) {
  if (!holdout) return <span className="text-muted-foreground">—</span>;
  const { hoEdge, hoN, confirmed } = holdout;
  if (!Number.isFinite(hoEdge)) return <span className="text-muted-foreground" title={`holdout events: ${hoN}`}>—</span>;
  return (
    <span className={edgeClass(hoEdge)} title={`Holdout edge on ${hoN} unseen events (t ${fmtT(holdout.hoT)}), split at ${holdout.splitDate}`}>
      {confirmed === true ? "✓ " : confirmed === false ? "✗ " : ""}
      {`${hoEdge > 0 ? "+" : ""}${hoEdge.toFixed(2)}pp`}
      <span className="text-muted-foreground text-[9px]"> ({hoN})</span>
    </span>
  );
}

/** Shared detection-parameter editor (scan + deep-dive). */
function DetectionControls({ det, onChange }: {
  det: PageSettings["det"];
  onChange: (d: PageSettings["det"]) => void;
}) {
  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return (
    <div className="flex flex-wrap items-end gap-3 text-xs">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px]">Slope lookback (bars)</span>
        <input type="number" min={1} max={30} className={`${inputCls} w-20`} value={det.slopeLookback}
          onChange={(e) => onChange({ ...det, slopeLookback: Math.max(1, num(e.target.value, det.slopeLookback)) })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px]" title="Hysteresis width in slope-MAD units. 0 = raw sign flip.">Threshold k (MAD)</span>
        <input type="number" min={0} max={3} step={0.1} className={`${inputCls} w-20`} value={det.thresholdK}
          onChange={(e) => onChange({ ...det, thresholdK: Math.max(0, num(e.target.value, det.thresholdK)) })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px]">Confirm bars</span>
        <input type="number" min={1} max={10} className={`${inputCls} w-16`} value={det.confirmBars}
          onChange={(e) => onChange({ ...det, confirmBars: Math.max(1, num(e.target.value, det.confirmBars)) })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px]">Min bars between</span>
        <input type="number" min={0} max={60} className={`${inputCls} w-16`} value={det.minBarsBetween}
          onChange={(e) => onChange({ ...det, minBarsBetween: Math.max(0, num(e.target.value, det.minBarsBetween)) })} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[10px]" title="diff = MA change over the lookback; regress = OLS slope of the MA (steadier for short periods on hourly)">Slope measure</span>
        <select className={selectCls} value={det.measure}
          onChange={(e) => onChange({ ...det, measure: e.target.value as "diff" | "regress" })}>
          <option value="diff">diff</option>
          <option value="regress">regress</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 pb-1">
        <input type="checkbox" checked={det.detectCurvature}
          onChange={(e) => onChange({ ...det, detectCurvature: e.target.checked })} />
        <span className="text-[10px] text-muted-foreground" title="Also detect flips in the slope's slope — earlier accel/decel warnings">Curvature events</span>
      </label>
    </div>
  );
}

function TypeChecklist({ selected, onChange }: { selected: MaType[]; onChange: (t: MaType[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {MA_TYPES.map((t) => {
        const on = selected.includes(t);
        return (
          <button key={t} type="button"
            className={`rounded border px-1.5 py-0.5 text-[10px] ${on ? "border-primary/60 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40"}`}
            onClick={() => onChange(on ? selected.filter((x) => x !== t) : [...selected, t])}>
            {t}
          </button>
        );
      })}
    </div>
  );
}

/** Study-side per-horizon stats table (event vs unconditional baseline). */
function HorizonTable({ study, freq }: { study: StudyResult; freq: SlopeFreq }) {
  return (
    <table className="text-[10px] font-mono border-collapse">
      <thead>
        <tr className="text-muted-foreground">
          <th className="text-left pr-3 py-0.5">Horizon</th>
          <th className="text-right pr-3">N</th>
          <th className="text-right pr-3">Mean</th>
          <th className="text-right pr-3">Median</th>
          <th className="text-right pr-3">pUp</th>
          <th className="text-right pr-3">p25/p75</th>
          <th className="text-right pr-3">Base</th>
          <th className="text-right pr-3">Edge</th>
          <th className="text-right pr-3">t</th>
        </tr>
      </thead>
      <tbody>
        {study.stats.map((s) => {
          const base = study.baseline.find((b) => b.horizon === s.horizon);
          const edge = s.count > 0 && base && Number.isFinite(base.mean) ? s.mean - base.mean : NaN;
          return (
            <tr key={s.horizon} className="border-b border-border/40">
              <td className="pr-3 py-0.5">{horizonLabel(freq, s.horizon)}</td>
              <td className="text-right pr-3">{s.count}</td>
              <td className={`text-right pr-3 ${edgeClass(s.mean)}`}>{pctFmt(s.mean)}</td>
              <td className="text-right pr-3">{pctFmt(s.median)}</td>
              <td className="text-right pr-3">{fmtPUp(s)}</td>
              <td className="text-right pr-3 text-muted-foreground">{pctFmt(s.p25, 1)}/{pctFmt(s.p75, 1)}</td>
              <td className="text-right pr-3 text-muted-foreground">{base ? pctFmt(base.mean) : "—"}</td>
              <td className={`text-right pr-3 font-semibold ${edgeClass(edge)}`}>
                {Number.isFinite(edge) ? `${edge > 0 ? "+" : ""}${edge.toFixed(2)}pp` : "—"}
              </td>
              <td className="text-right pr-3">{fmtT(tStatOf(s))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function MaSlope() {
  const [settings, setSettings] = useState<PageSettings>(loadSettings);
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);
  const set = <K extends keyof PageSettings>(k: K, v: PageSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  const freq = settings.freq;
  const [tab, setTab] = useState<"scan" | "deep">("scan");
  const [primaryH, setPrimaryH] = useState<number>(() => defaultPrimaryHorizon(loadSettings().freq));
  useEffect(() => setPrimaryH(defaultPrimaryHorizon(freq)), [freq]);

  const scope = useBasketScope("reit-viz:basket-scope:/ma-slope");
  const [workbook, setWorkbook] = useState<TickerMeta[]>([]);
  useEffect(() => {
    let active = true;
    fetchWorkbookTickers().then((t) => { if (active) setWorkbook(t); }).catch(() => {});
    return () => { active = false; };
  }, []);
  // ── Scan targets: universe (basket + class + geo filters), free ticker
  //    list (any Yahoo symbol), explicit A/B pairs, or all pair combos ──
  const scanScope = settings.scanScope;
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters());
  const geo = useGeoFilter(workbook, "ma-slope");
  const combo = usePairComboPicker(workbook, scanScope === "combos", "ma-slope");

  const classOpts = useMemo(() => {
    const dims: Record<string, Record<string, number>> = {};
    for (const f of CLASS_FIELDS) dims[f.key] = {};
    for (const t of workbook) {
      for (const f of CLASS_FIELDS) {
        const v = (t as any)[f.key];
        if (v) dims[f.key][v] = (dims[f.key][v] || 0) + 1;
      }
    }
    return dims;
  }, [workbook]);

  const universe = useMemo(() => {
    const rows = applyClassFilters(workbook as any[], classFilters, "", new Set<string>());
    return geo.filterByGeo(rows)
      .map((r: any) => String(r.ticker).toUpperCase())
      .filter((t: string) => scope.inScope(t));
  }, [workbook, classFilters, geo.filterByGeo, scope]);

  const allTargets = useMemo<string[]>(() => {
    switch (scanScope) {
      case "universe": return universe;
      case "list": return parseSymbols(settings.listText, false);
      case "pairs": return parseSymbols(settings.pairsText, true);
      case "combos": return combo.pairs.map((p) => `${p.a}/${p.b}`);
    }
  }, [scanScope, universe, settings.listText, settings.pairsText, combo.pairs]);
  const targets = useMemo(() => allTargets.slice(0, MAX_TARGETS), [allTargets]);

  // ── Universe scan state ────────────────────────────────────────────────────
  const [scanRows, setScanRows] = useState<ScanRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<[number, number] | null>(null);
  const [freshOnly, setFreshOnly] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const scanCancel = useRef({ current: false });
  const sort = useTableSort<ScanRow>("score", "desc", "desc", "ma-slope-scan");

  const runScan = async () => {
    if (scanning || !targets.length) return;
    scanCancel.current = { current: false };
    setScanning(true);
    setScanRows([]);
    setExpandedRow(null);
    setScanProgress([0, targets.length]);
    const det = settings.det;
    const mode: ScanMode = settings.scanKind === "fixed"
      ? { kind: "fixed", params: { ...det, maType: settings.fixedType, period: settings.fixedPeriod } }
      : { kind: "auto", types: settings.autoTypes, periods: settings.autoPeriods, baseParams: det };
    try {
      await runUniverseScan({
        tickers: targets,
        freq,
        mode,
        freshBars: settings.freshBars,
        primaryHorizonBars: primaryH,
        minEvents: settings.minEvents,
        holdoutFrac: settings.holdoutPct / 100,
        onRow: (row) => setScanRows((rs) => [...rs, row]),
        onProgress: (d, t) => setScanProgress([d, t]),
        cancelRef: scanCancel.current,
      });
    } finally {
      setScanning(false);
    }
  };

  const visibleScanRows = useMemo(() => {
    const rows = freshOnly ? scanRows.filter((r) => r.fresh) : scanRows;
    return sort.apply(rows, (r, key) => {
      const b = r.best;
      switch (key) {
        case "ticker": return r.ticker;
        case "config": return b ? `${b.maType}${String(b.period).padStart(3, "0")}` : null;
        case "last": return b?.lastEvent ? -b.barsSinceLast : null;
        case "n": return b ? (b.side === "up" ? b.nUp : b.nDown) : null;
        case "perYear": return b?.eventsPerYear ?? null;
        case "hit": {
          const s = b ? statsAt(b.side === "up" ? b.upStudy : b.downStudy, primaryH) : undefined;
          return s && Number.isFinite(s.pUp) ? s.pUp : null;
        }
        case "mean": {
          const s = b ? statsAt(b.side === "up" ? b.upStudy : b.downStudy, primaryH) : undefined;
          return s && Number.isFinite(s.mean) ? s.mean : null;
        }
        case "edge": return b && Number.isFinite(b.edge) ? b.edge : null;
        case "t": return b && Number.isFinite(b.tStat) ? b.tStat : null;
        case "score": return b && Number.isFinite(b.score) ? b.score : null;
        case "oos": return b?.holdout && Number.isFinite(b.holdout.hoEdge) ? b.holdout.hoEdge : null;
        default: return null;
      }
    });
  }, [scanRows, freshOnly, sort, primaryH]);

  const sendToCharts = (symbol: string, cfg: ConfigEval, kinds: Array<"slope" | "curvature">) => {
    // Pair symbols route through the Pair Ratios → Charts hand-off: Dashboard
    // drains reit-viz:pair-to-charts on mount and builds the A/B RELVAL ratio
    // pane; markers piggyback on the chartBridge sessionStorage slot keyed by
    // leg A (the pane's anchor ticker) — same recipe as MTF Setups.
    const isPair = symbol.includes("/");
    const anchor = isPair ? symbol.split("/")[0] : symbol;
    const signals = cfg.events
      .map((e, i) => ({ e, date: cfg.eventDates[i] }))
      .filter(({ e, date }) => kinds.includes(e.kind) && !!date)
      .map(({ e, date }) => ({ ticker: anchor, date, direction: e.direction, type: e.kind, label: `${e.direction === "up" ? "▲" : "▼"} ${e.kind}` }));
    if (!signals.length) return;
    const payload = {
      ticker: anchor,
      label: `MA Slope ${symbol} ${configLabel(cfg.params)} ${freq} · ${signals.length} inflections`,
      signals,
    };
    if (isPair) {
      const [a, b] = symbol.split("/");
      try {
        sessionStorage.setItem("reit-viz:pair-to-charts", JSON.stringify({ tickerA: a, tickerB: b, metric: "close" }));
        sessionStorage.setItem(`reit-viz:chart-signals:${anchor}`, JSON.stringify(payload));
      } catch {}
      window.location.hash = "#/";
      return;
    }
    emitChartSignals(payload);
  };

  // ── Deep dive state ────────────────────────────────────────────────────────
  const [ddTicker, setDdTicker] = useState("");
  const [ddRunning, setDdRunning] = useState(false);
  const [ddProgress, setDdProgress] = useState<[number, number] | null>(null);
  const [ddResults, setDdResults] = useState<ConfigEval[]>([]);
  const [ddError, setDdError] = useState<string | null>(null);
  const [ddSelectedKey, setDdSelectedKey] = useState<string | null>(null);
  const [ddSide, setDdSide] = useState<"up" | "down" | "curvUp" | "curvDown">("up");
  const ddCancel = useRef({ current: false });
  /** Template apply queues a sweep here; the effect below fires it only after
   *  the applied settings/primaryH have committed (a direct call would sweep
   *  with the pre-apply grid). */
  const [autoRunSymbol, setAutoRunSymbol] = useState<string | null>(null);

  const deepSelected = useMemo(
    () => ddResults.find((r) => r.key === ddSelectedKey) ?? ddResults[0] ?? null,
    [ddResults, ddSelectedKey],
  );

  const runDeepDive = async (tickerArg?: string, prefill?: { maType: MaType; period: number }) => {
    const ticker = (tickerArg ?? ddTicker).trim().toUpperCase();
    if (!ticker || ddRunning) return;
    setDdTicker(ticker);
    ddCancel.current = { current: false };
    setDdRunning(true);
    setDdError(null);
    setDdResults([]);
    setDdSelectedKey(null);
    setDdProgress(null);
    try {
      const data = await loadSlopeSeries(ticker, freq);
      if (!data) {
        setDdError(
          freq === "hourly"
            ? `No usable hourly data for ${ticker} (need ≥250 aligned bars).`
            : ticker.includes("/")
              ? `No price data for ${ticker} (need both legs + ≥60 overlapping days).`
              : `No price data for ${ticker}.`,
        );
        return;
      }
      const results = await runDeepDiveSweep({
        data,
        types: settings.ddTypes.length ? settings.ddTypes : [...MA_TYPES],
        periods: settings.ddPeriods.length ? settings.ddPeriods : [...DEFAULT_PERIODS],
        baseParams: settings.det,
        primaryHorizonBars: primaryH,
        minEvents: settings.minEvents,
        holdoutFrac: settings.holdoutPct / 100,
        onProgress: (d, t) => setDdProgress([d, t]),
        cancelRef: ddCancel.current,
      });
      setDdResults(results);
      if (prefill) {
        const match = results.find((r) => r.maType === prefill.maType && r.period === prefill.period);
        if (match) setDdSelectedKey(match.key);
      }
    } catch (e: any) {
      setDdError(String(e?.message ?? e));
    } finally {
      setDdRunning(false);
    }
  };

  useEffect(() => {
    if (!autoRunSymbol || ddRunning) return;
    setAutoRunSymbol(null);
    void runDeepDive(autoRunSymbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunSymbol]);

  const openDeepDive = (row: ScanRow) => {
    if (!row.best) return;
    setTab("deep");
    void runDeepDive(row.ticker, { maType: row.best.maType, period: row.best.period });
  };

  const selectedStudy: StudyResult | null = useMemo(() => {
    if (!deepSelected) return null;
    switch (ddSide) {
      case "up": return deepSelected.upStudy;
      case "down": return deepSelected.downStudy;
      case "curvUp": return deepSelected.curvUpStudy;
      case "curvDown": return deepSelected.curvDownStudy;
    }
  }, [deepSelected, ddSide]);

  const histBins = useMemo(
    () => (selectedStudy ? buildHistogram(selectedStudy.distribution[primaryH] ?? [], 24) : []),
    [selectedStudy, primaryH],
  );

  const horizonOptions = SLOPE_HORIZONS[freq];

  return (
    <div className="p-4 space-y-3" data-testid="ma-slope-page">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <LineChartIcon className="w-4 h-4 text-primary" /> MA Slope Inflections
        </h1>
        <span className="text-[11px] text-muted-foreground">
          Turns in a moving average's slope, backtested for forward predictive edge.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <PagePresets
            storageKey="reit-viz:ma-slope:presets"
            label="Templates"
            testIdPrefix="ma-slope-presets"
            capture={() => ({ settings, primaryH, tab, ddTicker })}
            apply={(c) => {
              if (c?.settings && typeof c.settings === "object") {
                const def = defaultSettings();
                setSettings({ ...def, ...c.settings, det: { ...def.det, ...(c.settings.det ?? {}) } });
              }
              if (c?.tab === "scan" || c?.tab === "deep") setTab(c.tab);
              if (typeof c?.ddTicker === "string") setDdTicker(c.ddTicker);
              // Deferred a tick so it lands after the freq-change effect resets
              // primaryH to the frequency default — the template's horizon must
              // win, and the auto-run sweep must see it.
              setTimeout(() => {
                if (Number.isFinite(c?.primaryH)) setPrimaryH(c.primaryH);
                const sym = typeof c?.ddTicker === "string" ? c.ddTicker.trim().toUpperCase() : "";
                if (c?.tab === "deep" && sym) setAutoRunSymbol(sym);
              }, 0);
            }}
          />
          <BasketScopeSelect scope={scope} />
          <div className="flex rounded border border-border overflow-hidden">
            {FREQS.map((f) => (
              <button key={f.key} type="button"
                className={`px-2.5 py-1 text-xs ${freq === f.key ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                onClick={() => set("freq", f.key)} data-testid={`freq-${f.key}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex rounded border border-border overflow-hidden">
            {([["scan", "Universe Scan"], ["deep", "Deep Dive"]] as const).map(([k, label]) => (
              <button key={k} type="button"
                className={`px-2.5 py-1 text-xs ${tab === k ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                onClick={() => setTab(k)} data-testid={`tab-${k}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Shared config strip ── */}
      <div className="rounded border border-border bg-card p-3 space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          {tab === "scan" && (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground text-[10px]">Scope</span>
                <select className={selectCls} value={scanScope}
                  onChange={(e) => set("scanScope", e.target.value as ScanScope)} data-testid="scan-scope">
                  {(Object.keys(SCOPE_LABEL) as ScanScope[]).map((s) => (
                    <option key={s} value={s}>{SCOPE_LABEL[s]}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground text-[10px]">Config mode</span>
                <select className={selectCls} value={settings.scanKind}
                  onChange={(e) => set("scanKind", e.target.value as "fixed" | "auto")}>
                  <option value="fixed">Fixed config</option>
                  <option value="auto">Auto (best per ticker)</option>
                </select>
              </label>
              {settings.scanKind === "fixed" ? (
                <>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground text-[10px]">MA type</span>
                    <select className={selectCls} value={settings.fixedType}
                      onChange={(e) => set("fixedType", e.target.value as MaType)} data-testid="fixed-ma-type">
                      {MA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground text-[10px]">Period</span>
                    <input type="number" min={2} max={400} className={`${inputCls} w-20`} value={settings.fixedPeriod}
                      onChange={(e) => set("fixedPeriod", Math.max(2, Number(e.target.value) || settings.fixedPeriod))} />
                  </label>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-[10px]">
                    Auto grid — {settings.autoTypes.length} types × {settings.autoPeriods.length} periods per ticker
                  </span>
                  <div className="flex items-center gap-2">
                    <TypeChecklist selected={settings.autoTypes} onChange={(t) => set("autoTypes", t)} />
                    <input className={`${inputCls} w-44`} value={settings.autoPeriods.join(",")}
                      title="Comma-separated periods"
                      onChange={(e) => set("autoPeriods",
                        e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 2))} />
                  </div>
                </div>
              )}
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground text-[10px]">Fresh within (bars)</span>
                <input type="number" min={1} max={30} className={`${inputCls} w-16`} value={settings.freshBars}
                  onChange={(e) => set("freshBars", Math.max(1, Number(e.target.value) || settings.freshBars))} />
              </label>
            </>
          )}
          {tab === "deep" && (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground text-[10px]" title="Any Yahoo symbol (SPY, AAPL, ^TNX) or an A/B ratio pair (PLD/O) — not limited to the workbook">Symbol or A/B pair</span>
                <div className="flex items-center gap-1">
                  <input className={`${inputCls} w-32 uppercase`} value={ddTicker} list="ma-slope-tickers"
                    placeholder="PLD · SPY · PLD/O" data-testid="dd-ticker-input"
                    onChange={(e) => setDdTicker(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") void runDeepDive(); }} />
                  <datalist id="ma-slope-tickers">
                    {workbook.map((t) => <option key={t.ticker} value={t.ticker.toUpperCase()} />)}
                  </datalist>
                </div>
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-[10px]">
                  Sweep grid — {settings.ddTypes.length} types × {settings.ddPeriods.length} periods
                </span>
                <div className="flex items-center gap-2">
                  <TypeChecklist selected={settings.ddTypes} onChange={(t) => set("ddTypes", t)} />
                  <input className={`${inputCls} w-56`} value={settings.ddPeriods.join(",")}
                    title="Comma-separated periods"
                    onChange={(e) => set("ddPeriods",
                      e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 2))} />
                </div>
              </div>
            </>
          )}
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground text-[10px]">Primary horizon</span>
            <select className={selectCls} value={primaryH}
              onChange={(e) => setPrimaryH(Number(e.target.value))} data-testid="primary-horizon">
              {horizonOptions.map((h) => <option key={h.bars} value={h.bars}>{h.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground text-[10px]">Min events</span>
            <input type="number" min={3} max={100} className={`${inputCls} w-16`} value={settings.minEvents}
              onChange={(e) => set("minEvents", Math.max(3, Number(e.target.value) || settings.minEvents))} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground text-[10px]"
              title="Reserve the last X% of history as an out-of-sample holdout: ranking (side/edge/score) uses only the train window; the OOS column shows whether the edge persisted on unseen data.">
              Holdout
            </span>
            <select className={selectCls} value={settings.holdoutPct}
              onChange={(e) => set("holdoutPct", Number(e.target.value))} data-testid="holdout-select">
              <option value={0}>Off</option>
              <option value={20}>Last 20%</option>
              <option value={30}>Last 30%</option>
              <option value={40}>Last 40%</option>
            </select>
          </label>
          <div className="ml-auto flex items-center gap-2">
            {tab === "scan" ? (
              scanning ? (
                <button type="button" className={btnCls} onClick={() => { scanCancel.current.current = true; }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cancel
                  {scanProgress && <span className="text-muted-foreground">{scanProgress[0]}/{scanProgress[1]}</span>}
                </button>
              ) : (
                <button type="button" className={btnCls} onClick={() => void runScan()}
                  disabled={!targets.length} data-testid="run-scan">
                  <Play className="w-3.5 h-3.5" /> Scan {targets.length} {scanScope === "pairs" || scanScope === "combos" ? "pairs" : "tickers"}
                  {allTargets.length > MAX_TARGETS && (
                    <span className="text-muted-foreground">(of {allTargets.length})</span>
                  )}
                </button>
              )
            ) : ddRunning ? (
              <button type="button" className={btnCls} onClick={() => { ddCancel.current.current = true; }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cancel
                {ddProgress && <span className="text-muted-foreground">{ddProgress[0]}/{ddProgress[1]}</span>}
              </button>
            ) : (
              <button type="button" className={btnCls} onClick={() => void runDeepDive()}
                disabled={!ddTicker.trim()} data-testid="run-deep-dive">
                <Search className="w-3.5 h-3.5" /> Run sweep
              </button>
            )}
          </div>
        </div>
        {tab === "scan" && scanScope === "universe" && (
          <div className="flex items-center gap-2 flex-wrap text-[11px]" data-testid="ma-slope-universe-filters">
            {CLASS_FIELDS.map((f) => (
              <FilterDropdown
                key={f.key}
                label={f.label}
                options={Object.keys(classOpts[f.key] ?? {}).sort()}
                selected={classFilters[f.key]}
                onChange={(sel: Set<string>) => setClassFilters((prev) => ({ ...prev, [f.key]: sel }))}
                testId={`ma-slope-class-${f.key}`}
                counts={classOpts[f.key]}
              />
            ))}
            {geo.geoFilterUI}
            <span className="text-[10px] text-muted-foreground font-mono">{universe.length} tickers match</span>
          </div>
        )}
        {tab === "scan" && scanScope === "list" && (
          <div className="flex flex-col gap-1" data-testid="ma-slope-list-input">
            <span className="text-muted-foreground text-[10px]">
              Any Yahoo symbols — space/comma separated (e.g. SPY XLRE ^TNX AAPL); not limited to the workbook
            </span>
            <textarea rows={2} className={`${inputCls} font-mono uppercase`} value={settings.listText}
              placeholder="SPY XLRE IYR AAPL MSFT ..."
              onChange={(e) => set("listText", e.target.value)} />
          </div>
        )}
        {tab === "scan" && scanScope === "pairs" && (
          <div className="flex flex-col gap-1" data-testid="ma-slope-pairs-input">
            <span className="text-muted-foreground text-[10px]">
              A/B ratio pairs, one per token (e.g. PLD/O AVB/EQR SPG/SPY) — slope runs on the ratio; LONG↑ = long A / short B
            </span>
            <textarea rows={2} className={`${inputCls} font-mono uppercase`} value={settings.pairsText}
              placeholder="PLD/O AVB/EQR SPG/SPY ..."
              onChange={(e) => set("pairsText", e.target.value)} />
          </div>
        )}
        {tab === "scan" && scanScope === "combos" && (
          <div className="flex items-center gap-2 flex-wrap text-[11px]" data-testid="ma-slope-combo-picker">
            {combo.ui}
            <span className="text-[10px] text-muted-foreground font-mono">{combo.pairs.length} pairs from the leg set</span>
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-[10px] text-muted-foreground select-none">Detection parameters</summary>
          <div className="pt-2">
            <DetectionControls det={settings.det} onChange={(d) => set("det", d)} />
          </div>
        </details>
      </div>

      {/* ── Universe Scan tab ── */}
      {tab === "scan" && (
        <div className="rounded border border-border bg-card">
          <div className="flex items-center gap-3 px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold">Scan results</span>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={freshOnly} onChange={(e) => setFreshOnly(e.target.checked)} />
              <Flame className="w-3 h-3 text-amber-400" /> fresh only
            </label>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {scanRows.length ? `${scanRows.length} rows · ${scanRows.filter((r) => r.fresh).length} fresh` : scanning ? "scanning…" : "run a scan"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono border-collapse" data-testid="ma-slope-scan-table">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-muted-foreground text-[10px] border-b border-border">
                  <th className="text-left py-1 px-2"><SortHeader label="Ticker" columnKey="ticker" sort={sort} /></th>
                  <th className="text-left py-1 px-2"><SortHeader label="Config" columnKey="config" sort={sort} /></th>
                  <th className="text-left py-1 px-2"><SortHeader label="Last inflection" columnKey="last" sort={sort} /></th>
                  <th className="text-right py-1 px-2"><SortHeader label="Ev/yr" columnKey="perYear" sort={sort} align="right" /></th>
                  <th className="text-right py-1 px-2"><SortHeader label="N" columnKey="n" sort={sort} align="right" title="Events on the ranked side" /></th>
                  <th className="text-right py-1 px-2"><SortHeader label={`Hit%`} columnKey="hit" sort={sort} align="right" title="pUp at the primary horizon (ranked side)" /></th>
                  <th className="text-right py-1 px-2"><SortHeader label="Mean" columnKey="mean" sort={sort} align="right" /></th>
                  <th className="text-right py-1 px-2"><SortHeader label="Edge" columnKey="edge" sort={sort} align="right" title="Event mean − baseline mean at primary horizon (train window when holdout is on)" /></th>
                  <th className="text-right py-1 px-2"><SortHeader label="t" columnKey="t" sort={sort} align="right" title="t-stat of the ranked side (train window when holdout is on)" /></th>
                  <th className="text-right py-1 px-2"><SortHeader label="Score" columnKey="score" sort={sort} align="right" title="Edge shrunk by sample size (train window when holdout is on)" /></th>
                  {settings.holdoutPct > 0 && (
                    <th className="text-right py-1 px-2"><SortHeader label="OOS" columnKey="oos" sort={sort} align="right" title="Holdout edge on unseen data — ✓ persists, ✗ flips" /></th>
                  )}
                  <th className="text-right py-1 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleScanRows.map((r) => {
                  const b = r.best;
                  const sideStudy = b ? (b.side === "up" ? b.upStudy : b.downStudy) : null;
                  const s = sideStudy ? statsAt(sideStudy, primaryH) : undefined;
                  const expanded = expandedRow === r.ticker;
                  return (
                    <Fragment key={r.ticker}>
                      <tr className={`border-b border-border/40 hover:bg-muted/30 cursor-pointer ${r.fresh ? "bg-amber-500/5" : ""}`}
                        onClick={() => setExpandedRow(expanded ? null : r.ticker)}>
                        <td className="py-1 px-2 font-semibold">
                          <span className="inline-flex items-center gap-1">
                            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            {r.ticker}
                            {r.fresh && <Flame className="w-3 h-3 text-amber-400" />}
                          </span>
                        </td>
                        {r.status !== "ok" || !b ? (
                          <td colSpan={settings.holdoutPct > 0 ? 10 : 9} className="py-1 px-2 text-muted-foreground">
                            {r.status === "no-hourly" ? "no usable hourly data (need ≥250 bars)" : "no price data"}
                          </td>
                        ) : (
                          <>
                            <td className="py-1 px-2">
                              {configLabel(b.params)}
                              <span className={`ml-1 text-[9px] ${b.side === "up" ? "text-chart-2" : "text-destructive"}`}>
                                {b.side === "up" ? "LONG↑" : "SHORT↓"}
                              </span>
                              {b.insufficient && <span className="ml-1 text-[9px] text-muted-foreground">(n&lt;{settings.minEvents})</span>}
                            </td>
                            <td className="py-1 px-2">
                              {b.lastEvent ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <DirBadge direction={b.lastEvent.direction} kind={b.lastEvent.kind} />
                                  <span className="text-muted-foreground">{b.lastEvent.dailyDate}</span>
                                  <span className="text-[9px] text-muted-foreground">({b.barsSinceLast}b ago)</span>
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-1 px-2 text-right text-muted-foreground">{b.eventsPerYear.toFixed(1)}</td>
                            <td className="py-1 px-2 text-right">{b.side === "up" ? b.nUp : b.nDown}</td>
                            <td className="py-1 px-2 text-right">{fmtPUp(s)}</td>
                            <td className={`py-1 px-2 text-right ${edgeClass(s?.mean ?? NaN)}`}>{s ? pctFmt(s.mean) : "—"}</td>
                            <td className={`py-1 px-2 text-right font-semibold ${edgeClass(b.edge)}`}>
                              {Number.isFinite(b.edge) ? `${b.edge > 0 ? "+" : ""}${b.edge.toFixed(2)}pp` : "—"}
                            </td>
                            <td className="py-1 px-2 text-right">{fmtT(b.tStat)}</td>
                            <td className="py-1 px-2 text-right font-semibold">{Number.isFinite(b.score) ? b.score.toFixed(2) : "—"}</td>
                            {settings.holdoutPct > 0 && (
                              <td className="py-1 px-2 text-right"><OosCell holdout={b.holdout} /></td>
                            )}
                          </>
                        )}
                        <td className="py-1 px-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {b && (
                            <>
                              <button type="button" className="text-primary hover:underline mr-2"
                                onClick={() => sendToCharts(r.ticker, b, ["slope"])}>Chart</button>
                              <button type="button" className="text-primary hover:underline" onClick={() => openDeepDive(r)}>Deep-dive</button>
                            </>
                          )}
                        </td>
                      </tr>
                      {expanded && b && (
                        <tr className="border-b border-border/40 bg-muted/10">
                          <td colSpan={settings.holdoutPct > 0 ? 12 : 11} className="py-2 px-6">
                            <div className="flex flex-wrap gap-8">
                              <div>
                                <div className="text-[10px] text-muted-foreground mb-1">▲ Up inflections ({b.nUp})</div>
                                <HorizonTable study={b.upStudy} freq={freq} />
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground mb-1">▼ Down inflections ({b.nDown})</div>
                                <HorizonTable study={b.downStudy} freq={freq} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Deep Dive tab ── */}
      {tab === "deep" && (
        <div className="space-y-3">
          {ddError && <div className="text-xs text-destructive px-1">{ddError}</div>}
          {ddResults.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {/* Ranked config grid */}
              <div className="rounded border border-border bg-card overflow-hidden">
                <div className="px-3 py-2 border-b border-border text-xs font-semibold">
                  {ddTicker} · {ddResults.length} configs ranked · {freq}
                </div>
                <div className="overflow-y-auto max-h-[540px]">
                  <table className="w-full text-[11px] font-mono border-collapse" data-testid="dd-config-table">
                    <thead className="sticky top-0 bg-card z-10">
                      <tr className="text-muted-foreground text-[10px] border-b border-border">
                        <th className="text-left py-1 px-2">Config</th>
                        <th className="text-right py-1 px-2">N↑</th>
                        <th className="text-right py-1 px-2">N↓</th>
                        <th className="text-right py-1 px-2">Ev/yr</th>
                        <th className="text-left py-1 px-2">Side</th>
                        <th className="text-right py-1 px-2" title="Train window when holdout is on">Edge</th>
                        <th className="text-right py-1 px-2">t</th>
                        <th className="text-right py-1 px-2">Score</th>
                        {settings.holdoutPct > 0 && (
                          <th className="text-right py-1 px-2" title="Holdout edge on unseen data — ✓ persists, ✗ flips">OOS</th>
                        )}
                        <th className="text-left py-1 px-2">Last</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ddResults.map((r) => {
                        const sel = deepSelected?.key === r.key;
                        return (
                          <tr key={r.key}
                            className={`border-b border-border/40 cursor-pointer ${sel ? "bg-primary/10" : "hover:bg-muted/30"} ${r.insufficient ? "opacity-40" : ""}`}
                            onClick={() => setDdSelectedKey(r.key)}>
                            <td className="py-1 px-2 font-semibold">{configLabel(r.params)}</td>
                            <td className="py-1 px-2 text-right">{r.nUp}</td>
                            <td className="py-1 px-2 text-right">{r.nDown}</td>
                            <td className="py-1 px-2 text-right text-muted-foreground">{r.eventsPerYear.toFixed(1)}</td>
                            <td className={`py-1 px-2 ${r.side === "up" ? "text-chart-2" : "text-destructive"}`}>{r.side === "up" ? "LONG↑" : "SHORT↓"}</td>
                            <td className={`py-1 px-2 text-right font-semibold ${edgeClass(r.edge)}`}>
                              {Number.isFinite(r.edge) ? `${r.edge > 0 ? "+" : ""}${r.edge.toFixed(2)}pp` : "—"}
                            </td>
                            <td className="py-1 px-2 text-right">{fmtT(r.tStat)}</td>
                            <td className="py-1 px-2 text-right font-semibold">{Number.isFinite(r.score) ? r.score.toFixed(2) : "—"}</td>
                            {settings.holdoutPct > 0 && (
                              <td className="py-1 px-2 text-right"><OosCell holdout={r.holdout} /></td>
                            )}
                            <td className="py-1 px-2 text-muted-foreground whitespace-nowrap">
                              {r.lastEvent ? `${r.lastEvent.direction === "up" ? "▲" : "▼"} ${r.lastEvent.dailyDate} (${r.barsSinceLast}b)` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selected config detail */}
              {deepSelected && selectedStudy && (
                <div className="space-y-3">
                  <div className="rounded border border-border bg-card p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold">{ddTicker} · {configLabel(deepSelected.params)} · {freq}</span>
                      <div className="flex rounded border border-border overflow-hidden text-[10px]">
                        {([["up", `▲ Slope up (${deepSelected.nUp})`], ["down", `▼ Slope down (${deepSelected.nDown})`],
                          ...(deepSelected.curvUpStudy ? [["curvUp", `▲ Curv (${deepSelected.curvUpStudy.events.length})`] as const] : []),
                          ...(deepSelected.curvDownStudy ? [["curvDown", `▼ Curv (${deepSelected.curvDownStudy.events.length})`] as const] : []),
                        ] as Array<[typeof ddSide, string]>).map(([k, label]) => (
                          <button key={k} type="button"
                            className={`px-2 py-1 ${ddSide === k ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                            onClick={() => setDdSide(k)}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <button type="button" className={`${btnCls} ml-auto`} data-testid="dd-send-to-charts"
                        onClick={() => sendToCharts(ddTicker, deepSelected, ddSide.startsWith("curv") ? ["curvature"] : ["slope"])}>
                        <LineChartIcon className="w-3.5 h-3.5" /> Send to Charts
                      </button>
                    </div>
                    {deepSelected.holdout && (
                      <div className="text-[10px] text-muted-foreground">
                        Ranked on the train window ({deepSelected.holdout.trainN} events before {deepSelected.holdout.splitDate}) ·
                        holdout since then: <OosCell holdout={deepSelected.holdout} />
                        <span className="ml-1">— tables below use the full sample.</span>
                      </div>
                    )}
                    <HorizonTable study={selectedStudy} freq={freq} />
                  </div>

                  <div className="rounded border border-border bg-card p-3">
                    <div className="text-[10px] text-muted-foreground mb-1">
                      Average cumulative return path after event (bar 0 = event) · n = {selectedStudy.events.length}
                    </div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={selectedStudy.avgPath} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            label={{ value: `${freq} bars after event`, position: "insideBottom", offset: -4, style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } }} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                            formatter={(v: any) => [`${Number(v).toFixed(3)}%`, "Avg cum ret"]}
                            labelFormatter={(v: any) => `Bar ${v}`} />
                          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                          <Line type="monotone" dataKey="cumret" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {histBins.length > 0 && (
                    <div className="rounded border border-border bg-card p-3">
                      <div className="text-[10px] text-muted-foreground mb-1">
                        Forward return distribution @ {horizonLabel(freq, primaryH)}
                      </div>
                      <div className="h-36">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={histBins} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                            <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                              interval={Math.max(1, Math.floor(histBins.length / 6))} />
                            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={24} />
                            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                              formatter={(v: any) => [v, "Count"]}
                              labelFormatter={(label: any, payload: any) => {
                                const item = payload?.[0]?.payload;
                                return item ? `${item.lo.toFixed(2)}% to ${item.hi.toFixed(2)}%` : label;
                              }} />
                            <ReferenceLine x={histBins.find((bn) => bn.lo <= 0 && bn.hi >= 0)?.bucket ?? "0"} stroke="hsl(var(--muted-foreground))" />
                            <Bar dataKey="count" fill="hsl(var(--chart-2))" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  <div className="rounded border border-border bg-card overflow-hidden">
                    <div className="px-3 py-2 border-b border-border text-[10px] text-muted-foreground">
                      Event log ({selectedStudy.events.length})
                    </div>
                    <div className="overflow-y-auto max-h-56">
                      <table className="w-full text-[10px] font-mono border-collapse">
                        <thead className="sticky top-0 bg-card">
                          <tr className="text-muted-foreground border-b border-border">
                            <th className="text-left py-1 px-3">Date</th>
                            <th className="text-right py-1 px-3">Slope (bps/bar)</th>
                            {SLOPE_HORIZONS[freq].map((h) => (
                              <th key={h.bars} className="text-right py-1 px-3">{h.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...selectedStudy.events].reverse().map((ev) => (
                            <tr key={ev.dateIdx} className="border-b border-border/40">
                              <td className="py-0.5 px-3">{ev.date}</td>
                              <td className={`py-0.5 px-3 text-right ${ev.triggerValue >= 0 ? "text-chart-2" : "text-destructive"}`}>
                                {ev.triggerValue.toFixed(2)}
                              </td>
                              {SLOPE_HORIZONS[freq].map((h) => (
                                <td key={h.bars} className={`py-0.5 px-3 text-right ${edgeClass(ev.fwd[h.bars] ?? NaN)}`}>
                                  {pctFmt(ev.fwd[h.bars])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {!ddResults.length && !ddRunning && !ddError && (
            <div className="text-xs text-muted-foreground px-1">
              Enter a ticker and run the sweep to rank all MA type × period configs by the forward
              predictive edge of their slope inflections.
            </div>
          )}
        </div>
      )}

      {/* ── Footnotes ── */}
      <div className="text-[10px] text-muted-foreground leading-relaxed space-y-0.5">
        <div>
          Slope is normalized (bps/bar of the MA). An inflection fires when the slope escapes a dead zone of
          ±k·MAD of its trailing distribution (hysteresis) — k = 0 reduces to a raw sign flip. Curvature events flip on the
          slope's second difference (earlier, noisier). Edge = event mean − unconditional baseline at the primary horizon;
          Score shrinks the edge by √(min(n,40)/40).
        </div>
        <div>
          Weekly bars only count once the week has closed (no lookahead); hourly uses raw (unadjusted) closes — small
          ex-div bias on multi-week horizons. A/B pair symbols run the slope on the adjusted-close ratio (LONG↑ = long
          A / short B; ratios move roughly half as much as outright prices, so expect smaller edges). A grid of {MA_TYPES.length}×{DEFAULT_PERIODS.length} configs will produce
          a handful of spuriously significant rows by chance — with the holdout split on, ranking sees only the train
          window and the OOS column shows whether the edge persisted on unseen data (✓/✗); an edge that flips sign
          out-of-sample was probably noise.
        </div>
      </div>
    </div>
  );
}
