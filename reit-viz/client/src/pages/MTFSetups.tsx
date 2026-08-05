// Multi-Timeframe Setups — cross-timeframe confluence analysis.
//
// Auto-discovers which cross-timeframe / cross-indicator condition
// conjunctions (e.g. "hourly RSI > 70 AND daily close < SMA200 → short")
// were historically most predictive, lets the user test custom combos, and
// shows the CURRENT setup grid. Scan scope: a single ticker, a filtered
// universe (classifications + country/exchange), an explicit ticker list, a
// single A/B pair ratio, or all pair combos of a leg set. Engine in
// lib/mtfEngine, conditions in lib/mtfConditions, data + no-lookahead
// alignment in lib/mtfData.

import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { useTableSort, SortHeader } from "@/lib/useTableSort";
import { useWorkspaceState } from "@/lib/workspaceState";
import { formatHitRate, hitRateColorClass } from "@/lib/signalUtils";
import { emitChartSignals } from "@/lib/chartBridge";
import {
  FilterDropdown,
  applyClassFilters,
  emptyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { buildMtfBundle, buildPairMtfBundle, type MtfBundle, type Timeframe } from "@/lib/mtfData";
import {
  MTF_CONDITIONS,
  conditionInstances,
  computeConditionMatrix,
  type ConditionInstance,
} from "@/lib/mtfConditions";
import {
  runMtfScan,
  evaluateForwardStats,
  conjunctionEntries,
  horizonsForBase,
  defaultsForBase,
  DEFAULT_MTF_SETTINGS,
  type MtfSettings,
  type MtfSetupRow,
  type MtfDirection,
  type MtfScanResult,
} from "@/lib/mtfEngine";
import { Play, Loader2, Layers, LineChart, ChevronDown, ChevronRight, Flame } from "lucide-react";
import { PagePresets } from "@/components/PagePresets";

const TF_LABEL: Record<Timeframe, string> = { H: "Hourly", D: "Daily", W: "Weekly", M: "Monthly" };
const TF_CHIP_CLASS: Record<Timeframe, string> = {
  H: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  D: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  W: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  M: "border-rose-500/40 bg-rose-500/10 text-rose-400",
};

type ScanScope = "single" | "universe" | "list" | "pair" | "combos";
type ScanTarget = { kind: "ticker"; ticker: string } | { kind: "pair"; a: string; b: string };

const SCOPE_LABEL: Record<ScanScope, string> = {
  single: "Single",
  universe: "Universe",
  list: "Ticker list",
  pair: "Pair",
  combos: "Pair combos",
};

/** Hard cap on symbols per run — each one is a full engine pass. */
const MAX_TARGETS = 100;
/** In multi-symbol runs keep only each symbol's best rows (by hit rate). */
const PER_SYMBOL_KEEP = 300;

/** A saved custom combo: symbol (ticker or A/B pair), legs, and direction. */
interface MtfBookmark {
  name: string;
  symbol: string;
  legKeys: string[];
  direction: MtfDirection;
}

const BOOKMARKS_KEY = "reit-viz:mtf-bookmarks";

// Starter bookmarks: the strongest active setups from the 2026-07-24 full-
// universe scan (best qualified setup per REIT by t-stat, N ≥ 30).
const DEFAULT_BOOKMARKS: MtfBookmark[] = [
  { name: "MAA dip-buy (t 5.8)", symbol: "MAA", direction: "long",
    legKeys: ["dmi_bear@D", "ichi_tk_bull@W", "cross_frama_bear@D"] },
  { name: "AVB shallow-dip (t 5.6)", symbol: "AVB", direction: "long",
    legKeys: ["stoch_ob@W", "px_lt_hma21@W", "cross_kama_bull@D"] },
  { name: "GLPI capitulation (t 5.1)", symbol: "GLPI", direction: "long",
    legKeys: ["px_lt_sma50@D", "cross_frama_bear@W", "st_bear@D"] },
  { name: "SUI deep-value (t 5.0)", symbol: "SUI", direction: "long",
    legKeys: ["ichi_below@D", "cross_lsma_bear@W", "cross_sma_bear@D"] },
];

/** Per-browser durable bookmarks; defaults seed a browser that has none. */
function loadBookmarks(): MtfBookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) {
        return p.filter((b) => b && typeof b.symbol === "string" && Array.isArray(b.legKeys) && b.legKeys.length >= 2);
      }
    }
  } catch {}
  return [...DEFAULT_BOOKMARKS];
}

const CLASS_FIELDS = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Ind. Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
] as const;

function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}
function retColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-muted-foreground";
  return v >= 0 ? "text-green-400" : "text-red-400";
}

export default function MTFSetups() {
  const [workbookTickers, setWorkbookTickers] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    fetchWorkbookTickers().then((t: any[]) => { if (active) setWorkbookTickers(t); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const [ticker, setTicker] = useState("AVB");

  // ── Scan scope ─────────────────────────────────────────────────────────────
  const [scope, setScope] = useState<ScanScope>("single");
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters());
  const geo = useGeoFilter(workbookTickers, "mtf");
  const [listTickers, setListTickers] = useState<string[]>([]);
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const combo = usePairComboPicker(workbookTickers, scope === "combos", "mtf-setups");

  const classOpts = useMemo(() => {
    const dims: Record<string, Record<string, number>> = {};
    for (const f of CLASS_FIELDS) dims[f.key] = {};
    for (const t of workbookTickers) {
      for (const f of CLASS_FIELDS) {
        const v = (t as any)[f.key];
        if (v) dims[f.key][v] = (dims[f.key][v] || 0) + 1;
      }
    }
    return dims;
  }, [workbookTickers]);

  const universeTickers = useMemo(() => {
    if (scope !== "universe") return [];
    const rows = applyClassFilters(workbookTickers as any[], classFilters, "", new Set<string>());
    return geo.filterByGeo(rows).map((r: any) => String(r.ticker).toUpperCase());
  }, [scope, workbookTickers, classFilters, geo.filterByGeo]);

  const scanTargets = useMemo<ScanTarget[]>(() => {
    switch (scope) {
      case "single":
        return ticker ? [{ kind: "ticker", ticker }] : [];
      case "universe":
        return universeTickers.slice(0, MAX_TARGETS).map((t) => ({ kind: "ticker" as const, ticker: t }));
      case "list":
        return listTickers.slice(0, MAX_TARGETS).map((t) => ({ kind: "ticker" as const, ticker: t }));
      case "pair":
        return pairA && pairB && pairA !== pairB ? [{ kind: "pair", a: pairA, b: pairB }] : [];
      case "combos":
        return combo.pairs.slice(0, MAX_TARGETS).map((p) => ({ kind: "pair" as const, a: p.a, b: p.b }));
    }
  }, [scope, ticker, universeTickers, listTickers, pairA, pairB, combo.pairs]);

  const fullTargetCount =
    scope === "universe" ? universeTickers.length
    : scope === "list" ? listTickers.length
    : scope === "combos" ? combo.pairs.length
    : scanTargets.length;

  const [settings, setSettings] = useState<MtfSettings>({ ...DEFAULT_MTF_SETTINGS });
  const set = useCallback(<K extends keyof MtfSettings>(k: K, v: MtfSettings[K]) => {
    setSettings((prev) => ({ ...prev, [k]: v }));
  }, []);
  const setBaseTf = useCallback((baseTf: "H" | "D" | "M") => {
    setSettings((prev) => ({ ...prev, baseTf, ...defaultsForBase(baseTf) }));
  }, []);

  // Ratios move roughly half as much as outright prices, so the 3% default
  // target finds ~nothing on pair scopes. Swap 3% ↔ 1.5% when crossing the
  // pair boundary — but only between the two defaults, never over a custom
  // value the user typed.
  const PAIR_DEFAULT_TARGET = 1.5;
  const changeScope = useCallback((s: ScanScope) => {
    setScope((prev) => {
      const wasPair = prev === "pair" || prev === "combos";
      const isPair = s === "pair" || s === "combos";
      if (isPair !== wasPair) {
        setSettings((st) => {
          if (isPair && st.targetPct === DEFAULT_MTF_SETTINGS.targetPct) return { ...st, targetPct: PAIR_DEFAULT_TARGET };
          if (!isPair && st.targetPct === PAIR_DEFAULT_TARGET) return { ...st, targetPct: DEFAULT_MTF_SETTINGS.targetPct };
          return st;
        });
      }
      return s;
    });
  }, []);

  // ── Ambient bundle (single & pair scopes — feeds the grid + custom combo) ──
  const [bundle, setBundle] = useState<MtfBundle | null>(null);
  const [bundleErr, setBundleErr] = useState<string | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const ambientLabel = scope === "pair" ? (pairA && pairB ? `${pairA}/${pairB}` : "") : ticker;
  useEffect(() => {
    let active = true;
    setBundle(null);
    setBundleErr(null);
    setScan(null);
    if (scope !== "single" && scope !== "pair") { setBundleLoading(false); return; }
    if (scope === "pair" && (!pairA || !pairB || pairA === pairB)) { setBundleLoading(false); return; }
    setBundleLoading(true);
    (scope === "pair" ? buildPairMtfBundle(pairA, pairB) : buildMtfBundle(ticker))
      .then((b) => { if (active) setBundle(b); })
      .catch((e) => { if (active) setBundleErr(String(e?.message ?? e)); })
      .finally(() => { if (active) setBundleLoading(false); });
    return () => { active = false; };
  }, [ticker, scope, pairA, pairB]);

  const effectiveBase: "H" | "D" | "M" = settings.baseTf === "H" && bundle && !bundle.hourly ? "D" : settings.baseTf;

  // ── Scan ───────────────────────────────────────────────────────────────────
  const [scan, setScan] = useState<MtfScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [progressLabel, setProgressLabel] = useState("");
  const [scanNote, setScanNote] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const handleRun = async () => {
    if (scanTargets.length === 0) return;
    setScanning(true);
    cancelRef.current = false;
    setScan(null);
    setScanNote(null);
    const multi = scanTargets.length > 1;
    const qualified: MtfSetupRow[] = [];
    let combosEvaluated = 0;
    let baseBars = 0;
    let spanYears = 0;
    let failures = 0;
    try {
      for (let i = 0; i < scanTargets.length && !cancelRef.current; i++) {
        const t = scanTargets[i];
        const label = t.kind === "ticker" ? t.ticker : `${t.a}/${t.b}`;
        setProgressLabel(multi ? `${label} (${i + 1}/${scanTargets.length})` : label);
        let b: MtfBundle;
        try {
          b = t.kind === "ticker"
            ? scope === "single" && bundle ? bundle : await buildMtfBundle(t.ticker)
            : scope === "pair" && bundle ? bundle : await buildPairMtfBundle(t.a, t.b);
        } catch {
          failures++;
          continue;
        }
        // runMtfScan itself falls back to the Daily base per bundle when a
        // symbol has no usable hourly data.
        const res = await runMtfScan({
          bundle: b,
          settings,
          onProgress: (done, total) => setProgress({ done, total }),
          cancelRef,
        });
        combosEvaluated += res.combosEvaluated;
        baseBars = Math.max(baseBars, res.baseBars);
        spanYears = Math.max(spanYears, res.spanYears);
        qualified.push(
          ...(multi
            ? [...res.qualified].sort((x, y) => y.hitRate - x.hitRate).slice(0, PER_SYMBOL_KEEP)
            : res.qualified),
        );
      }
      setScan({ qualified, combosEvaluated, baseBars, spanYears });
      const notes: string[] = [];
      if (failures) notes.push(`${failures} symbol${failures > 1 ? "s" : ""} skipped (no data)`);
      if (multi) notes.push(`kept each symbol's top ${PER_SYMBOL_KEEP} by hit rate`);
      setScanNote(notes.length ? notes.join(" · ") : null);
    } finally {
      setScanning(false);
    }
  };

  // ── Current Setup grid ─────────────────────────────────────────────────────
  // Collapsed by default — 120 conditions make the full grid a wall; the
  // memo is gated on gridOpen so a collapsed grid also skips the compute.
  const [gridOpen, setGridOpen] = useState(false);
  const liveGrid = useMemo(() => {
    if (!bundle || !gridOpen) return [];
    return MTF_CONDITIONS.map((def) => {
      const cells = (["H", "D", "W", "M"] as Timeframe[]).map((tf) => {
        if (!def.tfs.includes(tf)) return null;
        const tfs = tf === "H" ? bundle.hourly : tf === "D" ? bundle.daily : tf === "W" ? bundle.weekly : bundle.monthly;
        if (!tfs) return { on: null as boolean | null, value: null as string | null };
        const states = def.compute(tfs);
        return { on: states[states.length - 1], value: def.liveValue?.(tfs) ?? null };
      });
      return { def, cells };
    });
  }, [bundle, gridOpen]);

  // ── Custom combo builder ───────────────────────────────────────────────────
  const instances = useMemo(() => (bundle ? conditionInstances(bundle) : []), [bundle]);
  const [customLegs, setCustomLegs] = useState<string[]>(["", "", ""]);
  const [customDir, setCustomDir] = useState<MtfDirection>("long");
  const [customRow, setCustomRow] = useState<MtfSetupRow | null>(null);
  const [customErr, setCustomErr] = useState<string | null>(null);
  /** Cumulative signed return (%) after each accepted entry, at the qualification horizon. */
  const [customSpark, setCustomSpark] = useState<{ label: string; cum: number[] }>({ label: "", cum: [] });

  const evaluateCustom = () => {
    if (!bundle) return;
    setCustomErr(null);
    setCustomRow(null);
    setCustomSpark({ label: "", cum: [] });
    const legs = customLegs
      .filter(Boolean)
      .map((k) => instances.find((i) => i.key === k))
      .filter(Boolean) as ConditionInstance[];
    if (legs.length < 2) { setCustomErr("Pick at least two conditions."); return; }
    const matrix = computeConditionMatrix(bundle, effectiveBase, legs);
    const states = legs.map((l) => matrix.get(l.key)!).filter(Boolean);
    if (states.length !== legs.length) { setCustomErr("A leg is unavailable for this base timeframe."); return; }
    const { entries, state } = conjunctionEntries(states);
    if (entries.length === 0) { setCustomErr("This combination never turned on in the available history."); return; }
    const base = effectiveBase === "H" ? bundle.hourly! : effectiveBase === "M" ? bundle.monthly : bundle.daily;
    const horizons = horizonsForBase(effectiveBase);
    const { rows, acceptedIndices } = evaluateForwardStats(
      base.closes, entries, customDir, settings.targetPct / 100, settings.cooldownBars, horizons,
    );
    const q = rows.find((r) => r.horizon === settings.horizonLabel) ?? rows[0];
    const entryLabelOf = (idx: number) => (effectiveBase === "H" ? bundle.hourlyDates[idx] : effectiveBase === "M" ? bundle.monthly.keys[idx] : bundle.daily.keys[idx]);
    const firstDate = effectiveBase === "H" ? bundle.hourlyDates[0] : effectiveBase === "M" ? bundle.monthly.keys[0] : bundle.daily.keys[0];
    const lastDate = entryLabelOf(base.keys.length - 1);
    const spanYears = Math.max(
      (new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (365.25 * 24 * 3600 * 1000),
      0.25,
    );
    const lastFiredIdx = entries[entries.length - 1];
    const qBars = (horizons.find((h) => h.label === q.horizon) ?? horizons[0]).bars;
    const spark: number[] = [];
    let cum = 0;
    for (const e of acceptedIndices) {
      const entry = base.closes[e];
      const exit = base.closes[e + qBars];
      if (!(entry > 0) || !(exit > 0)) continue;
      const ret = (exit / entry - 1) * 100;
      cum += customDir === "long" ? ret : -ret;
      spark.push(cum);
    }
    setCustomSpark({ label: q.horizon, cum: spark });
    setCustomRow({
      key: `${bundle.ticker}|${legs.map((l) => l.key).sort().join("+")}|${customDir}`,
      symbol: bundle.ticker,
      legs,
      direction: customDir,
      rows,
      hitRate: q.hitRate,
      winRate: q.winRate,
      avgReturn: q.avgReturn,
      tStat: q.tStat,
      occurrences: q.count,
      freqPerYear: acceptedIndices.length / spanYears,
      lastFiredIdx,
      lastFiredLabel: entryLabelOf(lastFiredIdx),
      activeNow: state[state.length - 1] === true,
      entryLabels: [...new Set(entries.slice(-20).map(entryLabelOf))],
    });
  };

  // ── Combo bookmarks (durable, per-browser; defaults seed empty browsers) ──
  const [bookmarks, setBookmarks] = useState<MtfBookmark[]>(() => loadBookmarks());
  const persistBookmarks = (next: MtfBookmark[]) => {
    setBookmarks(next);
    try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next)); } catch {}
  };
  // Applying a bookmark switches symbol/scope, then auto-evaluates once the
  // (possibly new) bundle is in.
  const [pendingEval, setPendingEval] = useState(false);
  useEffect(() => {
    if (pendingEval && bundle && !bundleLoading) {
      setPendingEval(false);
      evaluateCustom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEval, bundle, bundleLoading]);

  const applyBookmark = (b: MtfBookmark) => {
    if (b.symbol.includes("/")) {
      const [a, x] = b.symbol.split("/");
      changeScope("pair");
      setPairA(a);
      setPairB(x);
    } else {
      changeScope("single");
      setTicker(b.symbol);
    }
    setCustomLegs([...b.legKeys, "", "", ""].slice(0, 3));
    setCustomDir(b.direction);
    setPendingEval(true);
  };

  const saveCurrentCombo = () => {
    const legs = customLegs.filter(Boolean);
    if (legs.length < 2 || !ambientLabel) return;
    const name = window.prompt("Bookmark name:", `${ambientLabel} ${customDir} (${legs.map((k) => k.split("@")[0]).join("+")})`);
    if (!name?.trim()) return;
    persistBookmarks([...bookmarks, { name: name.trim(), symbol: ambientLabel, legKeys: legs, direction: customDir }]);
  };

  // ── Table ──────────────────────────────────────────────────────────────────
  const sort = useTableSort<MtfSetupRow>("hitRate", "desc", "desc", "mtf-setups");
  const sortApply = sort.apply;
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [onlyActive, setOnlyActive] = useState(false);

  const visibleRows = useMemo(() => {
    const rows = scan?.qualified ?? [];
    const base = onlyActive ? rows.filter((r) => r.activeNow) : rows;
    return sortApply(base, (row, key) => {
      switch (key) {
        case "symbol": return row.symbol;
        case "legs": return row.legs.map((l) => l.label).join(" + ");
        case "direction": return row.direction;
        case "lastFiredLabel": return row.lastFiredLabel;
        default: return row[key as keyof MtfSetupRow] as number;
      }
    });
  }, [scan, onlyActive, sortApply]);

  // The expanded catalog can qualify tens of thousands of (mostly redundant)
  // combos — rendering them all stalls the DOM. Sort first, then cap.
  const MAX_RENDERED_ROWS = 300;
  const shownRows = useMemo(() => visibleRows.slice(0, MAX_RENDERED_ROWS), [visibleRows]);

  // Net bias: active qualified setups, sign × (win−0.5) × confidence(N).
  const bias = useMemo(() => {
    const active = (scan?.qualified ?? []).filter((r) => r.activeNow);
    let score = 0;
    let longs = 0;
    let shorts = 0;
    for (const r of active) {
      const s = (r.direction === "long" ? 1 : -1) * (r.winRate - 0.5) * Math.min(1, r.occurrences / 20);
      score += s;
      if (r.direction === "long") longs++;
      else shorts++;
    }
    return { score, longs, shorts, label: Math.abs(score) < 0.1 ? "Mixed" : score > 0 ? "Long" : "Short" };
  }, [scan]);

  const openOnChart = (r: MtfSetupRow) => {
    const signalsFor = (ticker: string) => ({
      ticker,
      label: `${r.legs.map((l) => l.label).join(" + ")} (${r.direction})`,
      signals: r.entryLabels.map((date) => ({
        ticker,
        date,
        direction: r.direction === "long" ? "up" : "down",
        label: "MTF setup",
      })),
    });
    if (r.symbol.includes("/")) {
      // Pair rows: reuse the Pair Ratios → Charts hand-off (Dashboard drains
      // reit-viz:pair-to-charts on mount and builds the A/B RELVAL ratio
      // pane). Entry markers piggyback on the chartBridge sessionStorage
      // slot keyed by leg A — the RELVAL pane's anchor ticker — so ChartArea
      // draws them as the usual vertical signal lines.
      const [a, b] = r.symbol.split("/");
      try {
        sessionStorage.setItem("reit-viz:pair-to-charts", JSON.stringify({ tickerA: a, tickerB: b, metric: "close" }));
        sessionStorage.setItem(`reit-viz:chart-signals:${a.toUpperCase()}`, JSON.stringify(signalsFor(a.toUpperCase())));
      } catch {}
      window.location.hash = "#/";
      return;
    }
    emitChartSignals(signalsFor(r.symbol));
  };

  // ── Workspace persistence (controls only) ─────────────────────────────────
  const serialize = useCallback(
    () => ({
      ticker, settings, customLegs, customDir, onlyActive, gridOpen,
      scope, listTickers, pairA, pairB,
      classFilters: serializeClassFilters(classFilters),
      combo: combo.serialize(),
    }),
    [ticker, settings, customLegs, customDir, onlyActive, gridOpen, scope, listTickers, pairA, pairB, classFilters, combo],
  );
  const hydrate = useCallback((s: any) => {
    if (typeof s?.ticker === "string" && s.ticker) setTicker(s.ticker);
    if (s?.settings && typeof s.settings === "object") {
      const merged: MtfSettings = { ...DEFAULT_MTF_SETTINGS, ...s.settings };
      // Presets saved before freqFloorPerYear existed inherit the daily
      // default (2/yr), which qualifies nothing on a monthly base — backfill
      // the base-appropriate floor.
      if (s.settings.freqFloorPerYear == null) merged.freqFloorPerYear = defaultsForBase(merged.baseTf).freqFloorPerYear;
      setSettings(merged);
    }
    if (Array.isArray(s?.customLegs)) setCustomLegs([...s.customLegs, "", "", ""].slice(0, 3));
    if (s?.customDir === "long" || s?.customDir === "short") setCustomDir(s.customDir);
    if (typeof s?.onlyActive === "boolean") setOnlyActive(s.onlyActive);
    if (typeof s?.gridOpen === "boolean") setGridOpen(s.gridOpen);
    if (typeof s?.scope === "string" && s.scope in SCOPE_LABEL) setScope(s.scope as ScanScope);
    if (Array.isArray(s?.listTickers)) setListTickers(s.listTickers.filter((t: any) => typeof t === "string"));
    if (typeof s?.pairA === "string") setPairA(s.pairA);
    if (typeof s?.pairB === "string") setPairB(s.pairB);
    if (s?.classFilters) setClassFilters(deserializeClassFilters(s.classFilters));
    if (s?.combo) combo.hydrate(s.combo);
  }, [combo.hydrate]);
  useWorkspaceState("mtf-setups", serialize, hydrate);

  const horizonOptions = horizonsForBase(effectiveBase);
  const inputCls = "w-14 bg-background border border-border rounded px-1 py-0.5 text-[11px]";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background text-foreground" data-testid="mtf-setups-page">
      {/* Controls */}
      <div className="flex flex-col gap-2 px-3 py-2 border-b border-border bg-card/30 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="inline-flex items-center gap-1 text-sm font-bold">
            <Layers className="w-4 h-4 text-primary" /> Multi-Timeframe Setups
          </span>
          <PagePresets
            storageKey="reit-viz:mtf-setups:presets"
            capture={serialize}
            apply={hydrate}
            testIdPrefix="mtf-presets"
          />
          <span className="text-[10px] text-muted-foreground">
            Cross-timeframe confluence: which hourly/daily/weekly/monthly condition combos predicted moves, and what's on right now.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <div className="flex items-center rounded border border-border overflow-hidden" data-testid="mtf-scope">
            {(Object.keys(SCOPE_LABEL) as ScanScope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeScope(s)}
                data-testid={`mtf-scope-${s}`}
                className={`px-2 py-0.5 text-[10px] font-mono ${scope === s ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                {SCOPE_LABEL[s]}
              </button>
            ))}
          </div>
          {scope === "single" && (
            <div className="min-w-[240px]">
              <UnifiedTickerPicker tickers={workbookTickers} value={ticker} onChange={setTicker} />
            </div>
          )}
          {scope === "pair" && (
            <>
              <div className="min-w-[180px]" data-testid="mtf-pair-a">
                <UnifiedTickerPicker tickers={workbookTickers} value={pairA} onChange={(t) => setPairA((t ?? "").toUpperCase())} />
              </div>
              <span className="text-muted-foreground">/</span>
              <div className="min-w-[180px]" data-testid="mtf-pair-b">
                <UnifiedTickerPicker tickers={workbookTickers} value={pairB} onChange={(t) => setPairB((t ?? "").toUpperCase())} />
              </div>
            </>
          )}
          <div className="flex items-center rounded border border-border overflow-hidden" title={bundle && !bundle.hourly ? "No usable 60m data for this symbol — Daily base only" : undefined}>
            {(["M", "D", "H"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                disabled={tf === "H" && !!bundle && !bundle.hourly}
                onClick={() => setBaseTf(tf)}
                data-testid={`mtf-base-${tf}`}
                className={`px-2 py-0.5 text-[10px] font-mono ${effectiveBase === tf ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground disabled:opacity-40"}`}
              >
                {tf === "D" ? "Daily base" : tf === "H" ? "Hourly base" : "Monthly base"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-muted-foreground">
            Target%
            <input type="number" min={0} step={1} value={settings.targetPct} className={inputCls}
              onChange={(e) => set("targetPct", parseFloat(e.target.value) || 0)} />
          </label>
          <label className="flex items-center gap-1 text-muted-foreground">
            Min N
            <input type="number" min={1} step={1} value={settings.minOccurrences} className={inputCls}
              onChange={(e) => set("minOccurrences", Math.max(1, Math.round(parseFloat(e.target.value) || 1)))} />
          </label>
          <label className="flex items-center gap-1 text-muted-foreground">
            Hit% &gt;
            <input type="number" min={0} max={100} step={5} value={Math.round(settings.hitRateThreshold * 100)} className={inputCls}
              onChange={(e) => set("hitRateThreshold", (parseFloat(e.target.value) || 0) / 100)} />
          </label>
          <label className="flex items-center gap-1 text-muted-foreground">
            Horizon
            <select value={settings.horizonLabel} onChange={(e) => set("horizonLabel", e.target.value)}
              className="bg-background border border-border rounded px-1 py-0.5 text-[11px]" data-testid="mtf-horizon">
              {horizonOptions.map((h) => <option key={h.label} value={h.label}>{h.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-muted-foreground">
            Cooldown
            <input type="number" min={0} step={1} value={settings.cooldownBars} className={inputCls}
              onChange={(e) => set("cooldownBars", Math.max(0, Math.round(parseFloat(e.target.value) || 0)))} />
          </label>
          <label className="flex items-center gap-1 text-muted-foreground" title="Second pass: extend qualified pairs with a third leg">
            <input type="checkbox" checked={settings.deepScan} onChange={(e) => set("deepScan", e.target.checked)} />
            Deep scan (3 legs)
          </label>
          <button
            type="button"
            onClick={scanning ? () => { cancelRef.current = true; } : handleRun}
            disabled={scanTargets.length === 0 || ((scope === "single" || scope === "pair") && !bundle)}
            data-testid="mtf-run"
            className={`inline-flex items-center gap-1 px-3 py-1 rounded text-[11px] font-bold border ${
              scanning ? "border-destructive/50 text-destructive" : "bg-primary text-primary-foreground border-primary hover:opacity-90 disabled:opacity-40"
            }`}
          >
            {scanning ? <><Loader2 className="w-3 h-3 animate-spin" /> Cancel</> : <><Play className="w-3 h-3" /> Run scan</>}
          </button>
          {bundleLoading && <span className="text-[10px] text-muted-foreground">Loading {ambientLabel} data…</span>}
          {bundleErr && <span className="text-[11px] text-destructive">{bundleErr}</span>}
          {bundle && !bundle.hourly && (
            <span className="text-[10px] text-yellow-500">No usable hourly data — Daily base only.</span>
          )}
          {scanTargets.length > 1 && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {scanTargets.length} symbols{fullTargetCount > MAX_TARGETS ? ` (of ${fullTargetCount} — first ${MAX_TARGETS} scanned)` : ""}
            </span>
          )}
        </div>
        {scope === "universe" && (
          <div className="flex items-center gap-2 flex-wrap text-[11px]" data-testid="mtf-universe-filters">
            {CLASS_FIELDS.map((f) => (
              <FilterDropdown
                key={f.key}
                label={f.label}
                options={Object.keys(classOpts[f.key] ?? {}).sort()}
                selected={classFilters[f.key]}
                onChange={(sel: Set<string>) => setClassFilters((prev) => ({ ...prev, [f.key]: sel }))}
                testId={`mtf-class-${f.key}`}
                counts={classOpts[f.key]}
              />
            ))}
            {geo.geoFilterUI}
            <span className="text-[10px] text-muted-foreground font-mono">{universeTickers.length} tickers match</span>
          </div>
        )}
        {scope === "list" && (
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]" data-testid="mtf-list-picker">
            {listTickers.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-card border border-border font-mono text-[10px]">
                {t}
                <button type="button" className="text-muted-foreground hover:text-destructive"
                  onClick={() => setListTickers((prev) => prev.filter((x) => x !== t))}>
                  ×
                </button>
              </span>
            ))}
            <div className="min-w-[220px]">
              <UnifiedTickerPicker
                key={listTickers.length}
                tickers={workbookTickers}
                value=""
                onChange={(t) => {
                  const up = (t ?? "").toUpperCase();
                  if (up) setListTickers((prev) => (prev.includes(up) ? prev : [...prev, up]));
                }}
              />
            </div>
            {listTickers.length > 0 && (
              <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setListTickers([])}>
                clear
              </button>
            )}
          </div>
        )}
        {scope === "combos" && (
          <div className="flex items-center gap-2 flex-wrap text-[11px]" data-testid="mtf-combo-picker">
            {combo.ui}
            <span className="text-[10px] text-muted-foreground font-mono">{combo.pairs.length} pairs</span>
          </div>
        )}
        {scanning && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground" data-testid="mtf-progress">
            <div className="flex-1 h-1.5 bg-border rounded overflow-hidden max-w-[400px]">
              <div className="h-full bg-primary transition-all" style={{ width: progress.total > 0 ? `${(100 * progress.done) / progress.total}%` : "0%" }} />
            </div>
            <span className="font-mono">{progressLabel && `${progressLabel} · `}{progress.done}/{progress.total} combos</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {/* Current Setup */}
        {bundle && (
          <div className="px-3 py-2 border-b border-border" data-testid="mtf-current-setup">
            <div className="flex items-center gap-3 flex-wrap mb-1.5">
              <button
                type="button"
                onClick={() => setGridOpen((v) => !v)}
                data-testid="mtf-grid-toggle"
                className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                {gridOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Current setup — {bundle.ticker}
              </button>
              {!gridOpen && (
                <span className="text-[10px] text-muted-foreground">{MTF_CONDITIONS.length} conditions · click to expand</span>
              )}
              {scan && (
                <span className="inline-flex items-center gap-1.5 text-[11px]" data-testid="mtf-bias">
                  <span className="text-muted-foreground">Bias:</span>
                  <span className={`font-bold ${bias.label === "Long" ? "text-green-400" : bias.label === "Short" ? "text-red-400" : "text-yellow-500"}`}>
                    {bias.label}
                  </span>
                  <span className="font-mono text-muted-foreground">({bias.score >= 0 ? "+" : ""}{bias.score.toFixed(2)} · {bias.longs}L / {bias.shorts}S active)</span>
                </span>
              )}
              <span className="text-[9px] text-muted-foreground ml-auto">
                H: last cached bar (≤20 min delay){bundle.lastWeeklyComplete ? "" : " · W: forming week (partial; backtests use completed weeks only)"}{bundle.lastMonthlyComplete ? "" : " · M: forming month (partial; backtests use completed months only)"}
              </span>
            </div>
            {gridOpen && (
            <div className="overflow-x-auto">
              <table className="text-[10px] font-mono border-collapse">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left pr-4 py-0.5">Condition</th>
                    {(["H", "D", "W", "M"] as Timeframe[]).map((tf) => (
                      <th key={tf} className="text-center px-3 py-0.5">{TF_LABEL[tf]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liveGrid.map(({ def, cells }) => (
                    <tr key={def.id} className="border-t border-border/30">
                      <td className="pr-4 py-0.5 whitespace-nowrap">{def.label}</td>
                      {cells.map((cell, i) => (
                        <td key={i} className="text-center px-3 py-0.5">
                          {cell === null ? (
                            <span className="text-muted-foreground/40">·</span>
                          ) : cell.on === null ? (
                            <span className="text-muted-foreground/60">—</span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-1 rounded ${cell.on ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
                              {cell.on ? "ON" : "off"}
                              {cell.value && <span className="text-muted-foreground">{cell.value}</span>}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}

        {/* Results */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap mb-1.5 text-[11px]">
            <span className="font-bold uppercase tracking-wider text-muted-foreground text-[11px]">Discovered setups</span>
            {scan && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {scan.qualified.length} qualified of {scan.combosEvaluated} combos · {scan.baseBars} bars · {scan.spanYears.toFixed(1)}y
              </span>
            )}
            {scan && visibleRows.length > MAX_RENDERED_ROWS && (
              <span className="text-[10px] text-yellow-500/80">
                showing top {MAX_RENDERED_ROWS} of {visibleRows.length} by current sort
              </span>
            )}
            {scanNote && <span className="text-[10px] text-muted-foreground">{scanNote}</span>}
            {scan && (
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
                Active now only
              </label>
            )}
          </div>
          {!scan ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Run a scan to discover the highest-hit-rate cross-timeframe setups.</div>
          ) : visibleRows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              {onlyActive ? "No qualified setups are active right now." : "Nothing qualified — loosen the thresholds."}
            </div>
          ) : (
            <table className="w-full text-[11px] font-mono border-collapse" data-testid="mtf-results-table">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-muted-foreground text-[10px] border-b border-border">
                  <th className="text-left py-1 px-2"><SortHeader label="Symbol" columnKey="symbol" sort={sort} /></th>
                  <th className="text-left py-1 px-2"><SortHeader label="Setup" columnKey="legs" sort={sort} /></th>
                  <th className="text-left py-1 pr-2"><SortHeader label="Dir" columnKey="direction" sort={sort} /></th>
                  <th className="text-right py-1 pr-2"><SortHeader label="Hit%" columnKey="hitRate" sort={sort} align="right" title="Reached the target favorable move within the horizon" /></th>
                  <th className="text-right py-1 pr-2"><SortHeader label="Win%" columnKey="winRate" sort={sort} align="right" title="Directionally-correct horizon return" /></th>
                  <th className="text-right py-1 pr-2"><SortHeader label="Avg" columnKey="avgReturn" sort={sort} align="right" /></th>
                  <th className="text-right py-1 pr-2"><SortHeader label="t" columnKey="tStat" sort={sort} align="right" /></th>
                  <th className="text-right py-1 pr-2"><SortHeader label="N" columnKey="occurrences" sort={sort} align="right" /></th>
                  <th className="text-right py-1 pr-2"><SortHeader label="Freq/yr" columnKey="freqPerYear" sort={sort} align="right" /></th>
                  <th className="text-right py-1 pr-2"><SortHeader label="Last fired" columnKey="lastFiredLabel" sort={sort} align="right" /></th>
                  <th className="text-center py-1 pr-2">Now</th>
                  <th className="text-right py-1 pr-2" />
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r) => {
                  const expanded = expandedKey === r.key;
                  return (
                    <Fragment key={r.key}>
                      <tr
                        className="border-b border-border/40 hover:bg-card/60 cursor-pointer"
                        onClick={() => setExpandedKey(expanded ? null : r.key)}
                        data-testid={`mtf-row-${r.key}`}
                      >
                        <td className="py-0.5 px-2 font-bold whitespace-nowrap">{r.symbol}</td>
                        <td className="py-0.5 px-2">
                          <span className="inline-flex items-center gap-1">
                            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            {r.legs.map((l) => l.label).join("  +  ")}
                          </span>
                        </td>
                        <td className={`py-0.5 pr-2 ${r.direction === "long" ? "text-green-400" : "text-red-400"}`}>{r.direction}</td>
                        <td className={`text-right py-0.5 pr-2 font-bold ${hitRateColorClass(r.hitRate)}`}>{formatHitRate(r.hitRate)}</td>
                        <td className={`text-right py-0.5 pr-2 ${hitRateColorClass(r.winRate)}`}>{formatHitRate(r.winRate)}</td>
                        <td className={`text-right py-0.5 pr-2 ${retColor(r.avgReturn)}`}>{fmtPct(r.avgReturn)}</td>
                        <td className="text-right py-0.5 pr-2">{Number.isFinite(r.tStat) ? r.tStat.toFixed(2) : "—"}</td>
                        <td className="text-right py-0.5 pr-2">{r.occurrences}</td>
                        <td className="text-right py-0.5 pr-2">{r.freqPerYear.toFixed(1)}</td>
                        <td className="text-right py-0.5 pr-2 whitespace-nowrap">{r.lastFiredLabel}</td>
                        <td className="text-center py-0.5 pr-2">
                          {r.activeNow ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 rounded bg-primary/15 text-primary border border-primary/40">
                              <Flame className="w-2.5 h-2.5" /> ON
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                        <td className="text-right py-0.5 pr-2" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => openOnChart(r)} className="text-muted-foreground hover:text-primary p-0.5"
                            title={r.symbol.includes("/")
                              ? "Open the A/B ratio on Charts with recent entries marked"
                              : "Show recent entries on Charts (hourly entries land as day markers)"}>
                            <LineChart className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-border/40 bg-card/40">
                          <td colSpan={12} className="py-1.5 px-8">
                            <table className="text-[10px] font-mono">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left pr-4">Horizon</th>
                                  {r.rows.map((h) => <th key={h.horizon} className="text-right pr-4">{h.horizon}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="text-muted-foreground pr-4">Hit%</td>
                                  {r.rows.map((h) => <td key={h.horizon} className={`text-right pr-4 ${hitRateColorClass(h.hitRate)}`}>{formatHitRate(h.hitRate)}</td>)}
                                </tr>
                                <tr>
                                  <td className="text-muted-foreground pr-4">Win%</td>
                                  {r.rows.map((h) => <td key={h.horizon} className={`text-right pr-4 ${hitRateColorClass(h.winRate)}`}>{formatHitRate(h.winRate)}</td>)}
                                </tr>
                                <tr>
                                  <td className="text-muted-foreground pr-4">Avg</td>
                                  {r.rows.map((h) => <td key={h.horizon} className={`text-right pr-4 ${retColor(h.avgReturn)}`}>{fmtPct(h.avgReturn)}</td>)}
                                </tr>
                                <tr>
                                  <td className="text-muted-foreground pr-4">N</td>
                                  {r.rows.map((h) => <td key={h.horizon} className="text-right pr-4">{h.count}</td>)}
                                </tr>
                              </tbody>
                            </table>
                            <div className="text-[9px] text-muted-foreground mt-1">
                              Recent entries: {r.entryLabels.join(", ")}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Custom combo builder */}
        {bundle && (
          <div className="px-3 py-2 border-t border-border" data-testid="mtf-custom">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Test your own combo</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground"
                title="Entries and forward returns are evaluated on these bars. Conditions from higher timeframes are projected onto this axis.">
                Base: {TF_LABEL[effectiveBase]} bars
              </span>
            </div>
            {bookmarks.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5" data-testid="mtf-bookmarks">
                <span className="text-[10px] text-muted-foreground">Bookmarks:</span>
                {bookmarks.map((b, i) => (
                  <span key={`${b.symbol}|${b.name}|${i}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background border border-border text-[10px] font-mono">
                    <button type="button" className="hover:text-primary" onClick={() => applyBookmark(b)}
                      title={`${b.symbol} ${b.direction}: ${b.legKeys.join(" + ")}`}
                      data-testid={`mtf-bookmark-${i}`}>
                      {b.name}
                    </button>
                    <button type="button" className="text-muted-foreground hover:text-destructive"
                      onClick={() => persistBookmarks(bookmarks.filter((_, j) => j !== i))} title="Delete bookmark">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              {[0, 1, 2].map((i) => {
                const selTf = instances.find((inst) => inst.key === customLegs[i])?.tf;
                return (
                  <div key={i} className="inline-flex items-center gap-1">
                    {selTf && (
                      <span className={`text-[9px] font-mono uppercase px-1 py-0.5 rounded border ${TF_CHIP_CLASS[selTf]}`}
                        data-testid={`mtf-custom-leg-tf-${i}`}>
                        {TF_LABEL[selTf]}
                      </span>
                    )}
                    <select
                      value={customLegs[i] ?? ""}
                      onChange={(e) => setCustomLegs((prev) => { const next = [...prev]; next[i] = e.target.value; return next; })}
                      className="bg-background border border-border rounded px-1 py-0.5 text-[11px] max-w-[240px]"
                      data-testid={`mtf-custom-leg-${i}`}
                    >
                      <option value="">{i < 2 ? `Condition ${i + 1}…` : "Condition 3 (optional)…"}</option>
                      {(["H", "D", "W", "M"] as Timeframe[])
                        .filter((tf) => tf !== "H" || effectiveBase === "H")
                        .map((tf) => (
                          <optgroup key={tf} label={TF_LABEL[tf]}>
                            {instances.filter((inst) => inst.tf === tf).map((inst) => (
                              <option key={inst.key} value={inst.key}>{TF_LABEL[inst.tf]} · {inst.def.label}</option>
                            ))}
                          </optgroup>
                        ))}
                    </select>
                  </div>
                );
              })}
              <div className="flex items-center rounded border border-border overflow-hidden">
                {(["long", "short"] as MtfDirection[]).map((d) => (
                  <button key={d} type="button" onClick={() => setCustomDir(d)}
                    className={`px-2 py-0.5 text-[10px] font-mono ${customDir === d ? (d === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400") : "text-muted-foreground hover:text-foreground"}`}>
                    {d}
                  </button>
                ))}
              </div>
              <button type="button" onClick={evaluateCustom} data-testid="mtf-custom-eval"
                className="px-2.5 py-0.5 rounded text-[11px] font-bold border bg-primary text-primary-foreground border-primary hover:opacity-90">
                Evaluate
              </button>
              <button type="button" onClick={saveCurrentCombo} data-testid="mtf-custom-save"
                disabled={customLegs.filter(Boolean).length < 2}
                className="px-2 py-0.5 rounded text-[11px] border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                title="Save this combo as a bookmark">
                ★ Save
              </button>
              {customErr && <span className="text-[11px] text-destructive">{customErr}</span>}
            </div>
            {customRow && (
              <div className="mt-2 text-[11px] font-mono" data-testid="mtf-custom-result">
                <div className="flex items-center gap-3 flex-wrap">
                  <span>{customRow.legs.map((l) => l.label).join(" + ")}</span>
                  <span className={customRow.direction === "long" ? "text-green-400" : "text-red-400"}>{customRow.direction}</span>
                  {customRow.activeNow && <span className="text-primary text-[10px] px-1.5 rounded bg-primary/15 border border-primary/40">ON now</span>}
                </div>
                <table className="text-[10px] mt-1">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left pr-4">Horizon</th>
                      {customRow.rows.map((h) => <th key={h.horizon} className="text-right pr-4">{h.horizon}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-muted-foreground pr-4">Hit% / Win%</td>
                      {customRow.rows.map((h) => (
                        <td key={h.horizon} className="text-right pr-4">
                          <span className={hitRateColorClass(h.hitRate)}>{formatHitRate(h.hitRate)}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className={hitRateColorClass(h.winRate)}>{formatHitRate(h.winRate)}</span>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="text-muted-foreground pr-4">Avg (N)</td>
                      {customRow.rows.map((h) => (
                        <td key={h.horizon} className={`text-right pr-4 ${retColor(h.avgReturn)}`}>{fmtPct(h.avgReturn)} ({h.count})</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                {customSpark.cum.length >= 2 && (() => {
                  const pts = customSpark.cum;
                  const w = 220, h = 44, pad = 2;
                  const lo = Math.min(0, ...pts);
                  const hi = Math.max(0, ...pts);
                  const span = hi - lo || 1;
                  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - 2 * pad);
                  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - 2 * pad);
                  const poly = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
                  const last = pts[pts.length - 1];
                  return (
                    <div className="flex items-center gap-2 mt-1.5" data-testid="mtf-custom-spark">
                      <svg width={w} height={h} className="border border-border/40 rounded bg-card/40">
                        <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} className="stroke-border" strokeDasharray="2 2" />
                        <polyline points={poly} fill="none" strokeWidth={1.5}
                          className={last >= 0 ? "stroke-green-400" : "stroke-red-400"} />
                      </svg>
                      <span className="text-[9px] text-muted-foreground">
                        Cumulative {customSpark.label} return, entry by entry:{" "}
                        <span className={retColor(last)}>{fmtPct(last)}</span> over {pts.length} trades (simple sum, no compounding/overlap handling)
                      </span>
                    </div>
                  );
                })()}
                <div className="text-[9px] text-muted-foreground mt-1">Recent entries: {customRow.entryLabels.join(", ")}</div>
              </div>
            )}
          </div>
        )}

        {/* Caveats */}
        <div className="px-3 py-2 text-[9px] text-muted-foreground border-t border-border">
          Hourly bars: Yahoo 60m caps at ≤729 days, but the server stores every bar it has ever fetched, so hourly history accumulates
          over time (and goes back years immediately when an FMP key is configured server-side). Raw unadjusted closes (small return bias
          across ex-dividend dates), regular session only, up to ~20 min stale. Higher-timeframe conditions use only completed daily/weekly/monthly
          bars — no lookahead. Some symbols (esp. non-US) have thin hourly data and fall back to Daily base. Pair scopes scan the A/B ratio;
          per-bar ratio highs/lows are approximations (only stochastic-family conditions read them).
        </div>
      </div>
    </div>
  );
}
