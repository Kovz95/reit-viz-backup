// Universal Hit-Rate Screener — one page that amalgamates the app's signal
// engines (technical / event / valuation / pair) and screens the universe for
// setups with a historically high hit rate AND real firing frequency, then
// shows which of those qualified setups are firing today.
//
// Universe/filter wiring mirrors SetupsScreener (the reference implementation
// for universe mode + 6-level classification + Country/Exchange filters).
// Evaluation runs through the shared buildBacktestResult kernel via
// lib/universalSweep; signal definitions live in lib/universalSignalCatalog.

import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react";
import { useLocation } from "wouter";
import { useBaskets } from "@/lib/baskets";
import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import ClassificationFilters, {
  emptyClassFilters,
  applyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { loadServerPref, saveServerPref } from "@/lib/serverPrefs";
import { useSeasonalNow, SeasonalChip } from "@/lib/seasonalNow";
import { useValuationNow, useCrowdingNow, ValuationChip, CrowdingChip } from "@/lib/rowChips";
import { PENDING_SCREEN_KEY } from "@/components/CommandPalette";
import { useGlobalUniverse } from "@/lib/globalUniverse";
import { useTableSort, SortHeader } from "@/lib/useTableSort";
import { formatHitRate, hitRateColorClass, HORIZONS } from "@/lib/signalUtils";
import {
  UNIVERSAL_SIGNAL_CATALOG,
  defaultEnabledSignalIds,
  type SignalFamily,
} from "@/lib/universalSignalCatalog";
import {
  runUniversalSweep,
  refreshFiringStatus,
  DEFAULT_SWEEP_SETTINGS,
  type SweepSettings,
  type SweepProgress,
  type QualifiedSetup,
} from "@/lib/universalSweep";
import {
  computeScopeHash,
  saveLibrary,
  loadLatest,
  type SweepLibrary,
} from "@/lib/universalScreenerCache";
import { emitChartSignals } from "@/lib/chartBridge";
import { Play, Loader2, Flame, LineChart, ExternalLink, ChevronDown, ChevronRight, Bookmark } from "lucide-react";

type UniverseMode = "all" | "classification" | "basket" | "global";

interface TickerRow {
  ticker: string;
  [key: string]: unknown;
}

const CLASSIFICATION_DIMS = ["sector", "industry", "subindustry", "subsector", "supersector"];
const SETTINGS_KEY = "reit-viz:universal-screener:settings";
const CLASS_FILTERS_KEY = "reit-viz:universal-screener:class-filters";
const SAVED_SCREENS_KEY = "reit-viz:universal-screener:saved-screens";

// A named snapshot of the WHOLE screen configuration: universe scope, every
// filter, and all sweep settings — apply restores everything in one click.
interface SavedScreen {
  id: string;
  name: string;
  settings: SweepSettings;
  universeMode: UniverseMode;
  classifyDim: string;
  classifyVal: string;
  basketId: string;
  globalDim: string;
  globalDimVal: string;
  classFilters: Record<string, string[]>;
  classSearch: string;
  manualTickers: string[];
  geoNations: string[];
  geoExchanges: string[];
}

function loadSavedScreens(): SavedScreen[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_SCREENS_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function persistSavedScreens(list: SavedScreen[]): void {
  // Server-synced (shared across computers); localStorage is the boot cache.
  saveServerPref(SAVED_SCREENS_KEY, list);
}

// signalId → optimizer drill-through route (module-level: the catalog is
// static, and the actions cell renders per row per frame).
const OPTIMIZER_ROUTE_BY_SIGNAL = new Map(
  UNIVERSAL_SIGNAL_CATALOG.filter((s) => s.optimizerRoute).map((s) => [s.id, s.optimizerRoute!]),
);

const FAMILY_LABELS: Record<SignalFamily, string> = {
  technical: "Technical",
  event: "Events",
  valuation: "Valuation",
  pair: "Pairs",
};

function loadSettings(): SweepSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SWEEP_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SWEEP_SETTINGS };
}

function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

function retColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-muted-foreground";
  return v >= 0 ? "text-green-400" : "text-red-400";
}

export default function UniversalScreener() {
  const { baskets } = useBaskets();
  const [, navigate] = useLocation();
  const [workbookTickers, setWorkbookTickers] = useState<TickerRow[]>([]);

  useEffect(() => {
    let active = true;
    fetchWorkbookTickers()
      .then((t: TickerRow[]) => { if (active) setWorkbookTickers(t); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // ── Universe controls (SetupsScreener wiring) ──────────────────────────────
  const [universeMode, setUniverseMode] = useState<UniverseMode>("all");
  const [classifyDim, setClassifyDim] = useState("sector");
  const [classifyVal, setClassifyVal] = useState("");
  const [basketId, setBasketId] = useState("");
  const { metas: globalMetas } = useGlobalUniverse();
  const [globalDim, setGlobalDim] = useState("sector");
  const [globalDimVal, setGlobalDimVal] = useState("");

  const classifyValues = useMemo(() => {
    const vals = new Set<string>();
    for (const t of workbookTickers) { const v = t[classifyDim]; if (v) vals.add(String(v)); }
    return Array.from(vals).sort();
  }, [workbookTickers, classifyDim]);

  const globalDimValues = useMemo(() => {
    const vals = new Set<string>();
    for (const m of globalMetas) { const v = (m as Record<string, unknown>)[globalDim]; if (v) vals.add(String(v)); }
    return Array.from(vals).sort();
  }, [globalMetas, globalDim]);

  useEffect(() => {
    if (universeMode === "classification" && classifyValues.length && !classifyValues.includes(classifyVal)) {
      setClassifyVal(classifyValues[0]);
    }
  }, [universeMode, classifyValues, classifyVal]);

  const baseUniverseTickers = useMemo(() => {
    if (universeMode === "global") {
      if (globalMetas.length === 0) return [];
      if (globalDimVal) {
        return globalMetas
          .filter((m) => String((m as Record<string, unknown>)[globalDim] ?? "") === globalDimVal)
          .map((m) => (m as { ticker: string }).ticker);
      }
      return globalMetas.map((m) => (m as { ticker: string }).ticker);
    }
    if (workbookTickers.length === 0) return [];
    if (universeMode === "all") return workbookTickers.map((t) => t.ticker);
    if (universeMode === "classification" && classifyVal) {
      return workbookTickers.filter((t) => String(t[classifyDim] ?? "") === classifyVal).map((t) => t.ticker);
    }
    if (universeMode === "basket" && basketId) {
      const b = baskets.find((b) => b.id === basketId);
      return b ? b.tickers : [];
    }
    return [];
  }, [workbookTickers, universeMode, classifyDim, classifyVal, basketId, baskets, globalMetas, globalDim, globalDimVal]);

  const [classFilters, setClassFilters] = useState<ClassFilters>(() => {
    try {
      const s = localStorage.getItem(CLASS_FILTERS_KEY);
      if (s) return deserializeClassFilters(JSON.parse(s));
    } catch {}
    return emptyClassFilters();
  });
  useEffect(() => {
    try { localStorage.setItem(CLASS_FILTERS_KEY, JSON.stringify(serializeClassFilters(classFilters))); } catch {}
  }, [classFilters]);
  const [classSearch, setClassSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const geoPool = universeMode === "global" ? (globalMetas as any[]) : (workbookTickers as any[]);
  const geo = useGeoFilter(geoPool, "universal-geo");

  const clfActive = useMemo(
    () =>
      Object.values(classFilters).some((s) => s.size > 0) ||
      classSearch !== "" ||
      manualTickers.size > 0 ||
      geo.hasActiveGeo,
    [classFilters, classSearch, manualTickers, geo.hasActiveGeo],
  );

  const universeTickers = useMemo(() => {
    if (!clfActive) return baseUniverseTickers;
    const metaBy = new Map<string, any>();
    for (const m of workbookTickers) metaBy.set(String(m.ticker).toUpperCase(), m);
    for (const m of globalMetas as any[]) {
      const k = String(m.ticker).toUpperCase();
      if (!metaBy.has(k)) metaBy.set(k, m);
    }
    const metas = baseUniverseTickers.map((t) => metaBy.get(String(t).toUpperCase()) ?? { ticker: t });
    const filtered = geo.filterByGeo(applyClassFilters(metas as any[], classFilters, classSearch, manualTickers));
    return filtered.map((m: any) => m.ticker);
  }, [baseUniverseTickers, clfActive, workbookTickers, globalMetas, classFilters, classSearch, manualTickers, geo.filterByGeo]);

  // ── Settings ───────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<SweepSettings>(loadSettings);
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);
  const set = useCallback(<K extends keyof SweepSettings>(k: K, v: SweepSettings[K]) => {
    setSettings((prev) => ({ ...prev, [k]: v }));
  }, []);

  const toggleFamily = (f: SignalFamily) => {
    setSettings((prev) => ({
      ...prev,
      families: prev.families.includes(f) ? prev.families.filter((x) => x !== f) : [...prev.families, f],
    }));
  };

  // ── Pair enumeration (within-cohort, capped) ───────────────────────────────
  // Cointegration source resolves at Run time instead (server pairs-screen).
  const pairList = useMemo((): [string, string][] => {
    if (settings.mode === "single" || !settings.families.includes("pair")) return [];
    if (settings.pairSource === "cointegration") return [];
    const metaBy = new Map<string, any>();
    for (const m of workbookTickers) metaBy.set(String(m.ticker).toUpperCase(), m);
    for (const m of globalMetas as any[]) {
      const k = String(m.ticker).toUpperCase();
      if (!metaBy.has(k)) metaBy.set(k, m);
    }
    const byCohort = new Map<string, string[]>();
    for (const t of universeTickers) {
      const m = metaBy.get(String(t).toUpperCase());
      const cohort = String(m?.[settings.pairCohortDim] ?? "");
      if (!cohort) continue;
      const list = byCohort.get(cohort) ?? [];
      list.push(t);
      byCohort.set(cohort, list);
    }
    const pairs: [string, string][] = [];
    for (const members of byCohort.values()) {
      const capped = members.slice(0, 12); // cap per cohort — C(12,2)=66 pairs max
      for (let i = 0; i < capped.length; i++) {
        for (let j = i + 1; j < capped.length; j++) pairs.push([capped[i], capped[j]]);
      }
    }
    return pairs.slice(0, settings.maxPairs);
  }, [settings.mode, settings.families, settings.pairCohortDim, settings.pairSource, settings.maxPairs, universeTickers, workbookTickers, globalMetas]);

  /** Resolve the pair list from the server cointegration screen (Run time). */
  const resolveCointegratedPairs = useCallback(async (): Promise<[string, string][]> => {
    const resp = await fetch("/api/pairs-screen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers: universeTickers }),
    });
    if (!resp.ok) throw new Error(`pairs-screen failed: ${resp.status}`);
    const data = await resp.json();
    return ((data.results ?? []) as any[])
      .filter((r) => r.isCointegrated)
      .sort((a, b) => (a.adfPValue ?? 1) - (b.adfPValue ?? 1))
      .slice(0, settings.maxPairs)
      .map((r) => [r.tickerA, r.tickerB] as [string, string]);
  }, [universeTickers, settings.maxPairs]);

  // ── Saved screens (named full-config snapshots) ────────────────────────────
  const [savedScreens, setSavedScreens] = useState<SavedScreen[]>(() => loadSavedScreens());
  const [screenName, setScreenName] = useState("");

  // Hydrate from the server so screens saved on another computer show up.
  useEffect(() => {
    let cancelled = false;
    void loadServerPref<SavedScreen[]>(SAVED_SCREENS_KEY).then((srv) => {
      if (!cancelled && Array.isArray(srv)) setSavedScreens(srv);
    });
    return () => { cancelled = true; };
  }, []);
  const [screensOpen, setScreensOpen] = useState(false);
  const screensRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (screensRef.current && !screensRef.current.contains(e.target as Node)) setScreensOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const saveScreen = useCallback(() => {
    const name = screenName.trim() || `Screen ${savedScreens.length + 1}`;
    const snap: SavedScreen = {
      id: `scr-${Date.now()}`,
      name,
      settings,
      universeMode, classifyDim, classifyVal, basketId, globalDim, globalDimVal,
      classFilters: serializeClassFilters(classFilters),
      classSearch,
      manualTickers: Array.from(manualTickers),
      geoNations: Array.from(geo.state.nations),
      geoExchanges: Array.from(geo.state.exchanges),
    };
    const next = [...savedScreens.filter((s) => s.name !== name), snap];
    setSavedScreens(next);
    persistSavedScreens(next);
    setScreenName("");
  }, [screenName, savedScreens, settings, universeMode, classifyDim, classifyVal, basketId, globalDim, globalDimVal, classFilters, classSearch, manualTickers, geo.state.nations, geo.state.exchanges]);

  const applyScreen = useCallback((s: SavedScreen) => {
    setSettings({ ...DEFAULT_SWEEP_SETTINGS, ...s.settings });
    setUniverseMode(s.universeMode);
    setClassifyDim(s.classifyDim);
    setClassifyVal(s.classifyVal);
    setBasketId(s.basketId);
    setGlobalDim(s.globalDim);
    setGlobalDimVal(s.globalDimVal);
    setClassFilters(deserializeClassFilters(s.classFilters));
    setClassSearch(s.classSearch ?? "");
    setManualTickers(new Set(Array.isArray(s.manualTickers) ? s.manualTickers : []));
    geo.setNations(new Set(Array.isArray(s.geoNations) ? s.geoNations : []));
    geo.setExchanges(new Set(Array.isArray(s.geoExchanges) ? s.geoExchanges : []));
    setScreensOpen(false);
  }, [geo]);

  const deleteScreen = useCallback((id: string) => {
    setSavedScreens((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persistSavedScreens(next);
      return next;
    });
  }, []);

  // Consume a command-palette hand-off: apply the named screen once the saved
  // list (server hydration included) contains it. Key survives until matched.
  useEffect(() => {
    const tryApply = () => {
      let name: string | null = null;
      try { name = sessionStorage.getItem(PENDING_SCREEN_KEY); } catch {}
      if (!name) return;
      const s = savedScreens.find((x) => x.name === name);
      if (s) {
        try { sessionStorage.removeItem(PENDING_SCREEN_KEY); } catch {}
        applyScreen(s);
      }
    };
    tryApply();
    window.addEventListener("reit-viz:pending-saved-action", tryApply);
    return () => window.removeEventListener("reit-viz:pending-saved-action", tryApply);
  }, [savedScreens, applyScreen]);

  // ── Run state ──────────────────────────────────────────────────────────────
  const [isRunning, setIsRunning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<SweepProgress>({ done: 0, total: 0 });
  const [rows, setRows] = useState<QualifiedSetup[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loadedScopeHash, setLoadedScopeHash] = useState<string | null>(null);
  const [loadedScopeDesc, setLoadedScopeDesc] = useState<string | null>(null);
  const [resolvedPairCount, setResolvedPairCount] = useState<number | null>(null);
  const cancelRef = useRef(false);

  const resolvedSettings = useMemo<SweepSettings>(
    () => ({
      ...settings,
      enabledSignalIds:
        settings.enabledSignalIds.length > 0 ? settings.enabledSignalIds : defaultEnabledSignalIds(),
    }),
    [settings],
  );
  // In cointegration mode the pair list is resolved server-side at Run time,
  // so it stays out of the hash — pairSource + tickers + settings determine it.
  const scopeHash = useMemo(
    () =>
      computeScopeHash({
        tickers: universeTickers,
        pairList: settings.pairSource === "cointegration" ? [] : pairList,
        settings: resolvedSettings,
      }),
    [universeTickers, pairList, resolvedSettings, settings.pairSource],
  );
  const scopeDescription = useMemo(() => {
    const modeDesc =
      universeMode === "classification" ? `${classifyDim}=${classifyVal}`
      : universeMode === "basket" ? (baskets.find((b) => b.id === basketId)?.name ?? "basket")
      : universeMode === "global" ? `global${globalDimVal ? ` ${globalDim}=${globalDimVal}` : ""}`
      : "all workbook";
    const pairsDesc = settings.mode !== "single" ? ` · ${pairList.length} pairs` : "";
    return `${modeDesc} · ${universeTickers.length} tickers${pairsDesc}`;
  }, [universeMode, classifyDim, classifyVal, basketId, baskets, globalDim, globalDimVal, universeTickers.length, pairList.length, settings.mode]);

  // The loaded library's own build inputs — used when re-persisting on a
  // firing refresh so the saved record keeps the settings/counts that
  // actually produced its rows (not whatever the controls show right now).
  const loadedLibRef = useRef<{ settings: SweepSettings; universeCount: number; pairCount: number } | null>(null);
  const hasRunRef = useRef(false);

  // Restore the most recent cached library on mount (staleness surfaced in
  // the header; a differing current scope shows a "Run to rebuild" note).
  useEffect(() => {
    let active = true;
    loadLatest().then((lib) => {
      // A run that started before this async load resolved wins outright —
      // stamping the old library's metadata over it would mislabel the rows.
      if (!active || !lib || hasRunRef.current) return;
      setRows((prev) => (prev.length === 0 ? lib.rows : prev));
      setLastRunAt(lib.builtAt);
      setRefreshedAt(lib.refreshedAt ?? null);
      setLoadedScopeHash(lib.scopeHash);
      setLoadedScopeDesc(lib.scopeDescription);
      loadedLibRef.current = {
        settings: lib.settings,
        universeCount: lib.universeCount,
        pairCount: lib.pairCount,
      };
    });
    return () => { active = false; };
  }, []);

  const persistLibrary = useCallback(
    (
      nextRows: QualifiedSetup[],
      builtAt: string,
      opts: {
        hash: string;
        desc: string;
        refreshed?: string;
        meta: { settings: SweepSettings; universeCount: number; pairCount: number };
      },
    ) => {
      const lib: SweepLibrary = {
        version: 1,
        builtAt,
        refreshedAt: opts.refreshed,
        scopeHash: opts.hash,
        scopeDescription: opts.desc,
        universeCount: opts.meta.universeCount,
        pairCount: opts.meta.pairCount,
        settings: opts.meta.settings,
        rows: nextRows,
      };
      void saveLibrary(lib);
      setLoadedScopeHash(opts.hash);
      setLoadedScopeDesc(opts.desc);
      loadedLibRef.current = opts.meta;
    },
    [],
  );

  const handleRun = async () => {
    const singleCount = settings.mode === "pair" ? 0 : universeTickers.length;
    const usesCoint = settings.mode !== "single" && settings.pairSource === "cointegration";
    if (singleCount === 0 && pairList.length === 0 && !usesCoint) {
      setErrorMsg("Universe is empty — nothing to screen.");
      return;
    }
    setErrorMsg(null);
    setIsRunning(true);
    cancelRef.current = false;
    hasRunRef.current = true;
    setRows([]);
    try {
      let runPairList = pairList;
      if (usesCoint) {
        setProgress({ done: 0, total: 0, subject: "cointegration screen…" });
        runPairList = await resolveCointegratedPairs();
        setResolvedPairCount(runPairList.length);
        if (runPairList.length === 0 && singleCount === 0) {
          setErrorMsg("Cointegration screen returned no qualifying pairs for this universe.");
          setIsRunning(false);
          return;
        }
      }
      const finalRows = await runUniversalSweep({
        tickers: universeTickers,
        pairList: runPairList,
        settings: resolvedSettings,
        onProgress: setProgress,
        onRows: (r) => setRows((prev) => [...prev, ...r]),
        cancelRef,
      });
      setRows(finalRows);
      setRefreshedAt(null);
      if (!cancelRef.current) {
        const builtAt = new Date().toISOString();
        setLastRunAt(builtAt);
        persistLibrary(finalRows, builtAt, {
          hash: scopeHash,
          desc: scopeDescription,
          meta: {
            settings: resolvedSettings,
            universeCount: universeTickers.length,
            pairCount: runPairList.length,
          },
        });
      } else {
        // Cancelled: the partial rows belong to NO library. Drop the loaded-
        // library linkage so a firing refresh can't overwrite a saved library
        // with this incomplete set.
        setLastRunAt(null);
        setLoadedScopeHash(null);
        setLoadedScopeDesc(null);
        loadedLibRef.current = null;
      }
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
    } finally {
      setIsRunning(false);
    }
  };

  const handleRefreshFiring = async () => {
    if (rows.length === 0) return;
    setIsRefreshing(true);
    cancelRef.current = false;
    try {
      const updated = await refreshFiringStatus(rows, settings, setProgress, cancelRef);
      setRows(updated);
      const now = new Date().toISOString();
      setRefreshedAt(now);
      // Re-persist ONLY when a saved library is loaded, under its own
      // metadata — never the current controls' settings/counts.
      if (loadedScopeHash && lastRunAt && loadedScopeDesc && loadedLibRef.current) {
        persistLibrary(updated, lastRunAt, {
          hash: loadedScopeHash,
          desc: loadedScopeDesc,
          refreshed: now,
          meta: loadedLibRef.current,
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // ── View + sort ────────────────────────────────────────────────────────────
  const [view, setView] = useState<"firing" | "library">("firing");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [signalPickerOpen, setSignalPickerOpen] = useState(false);
  const sort = useTableSort<QualifiedSetup>("hitRate", "desc", "desc", "universal-screener");

  // Seasonal-window chips on result rows (lazy: only fetched once results exist).
  const seasonal = useSeasonalNow(rows.length > 0);

  // Depend on sort.apply (stable per sortKey/sortDir), not the sort object —
  // useTableSort returns a fresh object literal every render, which would
  // defeat this memo and re-sort the full library on every progress tick.
  const sortApply = sort.apply;
  const visibleRows = useMemo(() => {
    const base = view === "firing" ? rows.filter((r) => r.firingNow) : rows;
    return sortApply(base, (row, key) => {
      switch (key) {
        case "subject": return row.subject;
        case "family": return row.family;
        case "signal": return `${row.signalLabel} ${row.paramsLabel}`;
        case "direction": return row.direction;
        case "lastSignalDate": return row.lastSignalDate;
        default: return row[key as keyof QualifiedSetup] as number;
      }
    });
  }, [rows, view, sortApply]);

  const firingCount = useMemo(() => rows.filter((r) => r.firingNow).length, [rows]);

  // Valuation + crowding chips for displayed subjects (pair subjects split into legs).
  const chipTickers = useMemo(() => {
    const s = new Set<string>();
    for (const r of visibleRows) for (const leg of r.subject.split("/")) if (leg) s.add(leg);
    return [...s];
  }, [visibleRows]);
  const valuation = useValuationNow(rows.length > 0, chipTickers);
  const crowding = useCrowdingNow(rows.length > 0, chipTickers);

  const openOnChart = (r: QualifiedSetup) => {
    if (r.mode === "single") {
      emitChartSignals({
        ticker: r.subject,
        label: `${r.signalLabel} ${r.paramsLabel} (${r.direction})`,
        signals: r.recentSignalDates.map((date) => ({
          ticker: r.subject,
          date,
          direction: r.direction === "long" ? "up" : "down",
          label: r.signalLabel,
        })),
      });
    }
  };

  const busy = isRunning || isRefreshing;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background text-foreground" data-testid="universal-screener-page">
      {/* Universe bar */}
      <div className="flex flex-col gap-2 px-3 py-2 border-b border-border bg-card/30 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="inline-flex items-center gap-1 text-sm font-bold">
            <Flame className="w-4 h-4 text-primary" /> Universal Hit-Rate Screener
          </span>
          <span className="text-[10px] text-muted-foreground">
            Screens every signal family for setups with historical hit rate above your threshold that fire regularly — then shows what's on today.
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <select
            value={universeMode}
            onChange={(e) => setUniverseMode(e.target.value as UniverseMode)}
            className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px]"
            data-testid="uhs-universe-mode"
          >
            <option value="all">All workbook</option>
            <option value="classification">Classification</option>
            <option value="basket">Basket</option>
            <option value="global">Global universe</option>
          </select>
          {universeMode === "classification" && (
            <>
              <select value={classifyDim} onChange={(e) => setClassifyDim(e.target.value)}
                className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px]">
                {CLASSIFICATION_DIMS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={classifyVal} onChange={(e) => setClassifyVal(e.target.value)}
                className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px] max-w-[180px]">
                {classifyValues.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </>
          )}
          {universeMode === "basket" && (
            <select value={basketId} onChange={(e) => setBasketId(e.target.value)}
              className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px] max-w-[200px]"
              data-testid="uhs-basket-select">
              <option value="">Pick basket…</option>
              {baskets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {universeMode === "global" && (
            <>
              <select value={globalDim} onChange={(e) => setGlobalDim(e.target.value)}
                className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px]">
                {["sector", "industry", "subindustry", "nation", "exchange"].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select value={globalDimVal} onChange={(e) => setGlobalDimVal(e.target.value)}
                className="bg-background border border-border rounded px-1.5 py-0.5 text-[11px] max-w-[180px]">
                <option value="">All</option>
                {globalDimValues.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </>
          )}
          <span className="text-[10px] text-muted-foreground font-mono" data-testid="uhs-universe-count">
            {universeTickers.length} tickers
            {settings.mode !== "single" && settings.families.includes("pair") &&
              (settings.pairSource === "cointegration"
                ? ` → cointegrated pairs${resolvedPairCount !== null ? ` (${resolvedPairCount})` : " (resolved at Run)"}`
                : ` → ${pairList.length} pairs`)}
          </span>
          {geo.geoFilterUI}
        </div>

        <ClassificationFilters
          filters={classFilters}
          onFiltersChange={setClassFilters}
          search={classSearch}
          onSearchChange={setClassSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={universeTickers.length}
          totalCount={baseUniverseTickers.length}
          testIdPrefix="uhs-clf"
        />

        {/* Settings row */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <div className="flex items-center rounded border border-border overflow-hidden">
            {(["single", "both", "pair"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("mode", m)}
                data-testid={`uhs-mode-${m}`}
                className={`px-2 py-0.5 text-[10px] font-mono ${settings.mode === m ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "single" ? "Singles" : m === "pair" ? "Pairs" : "Both"}
              </button>
            ))}
          </div>
          {UNIVERSAL_SIGNAL_CATALOG.length > 0 &&
            (Object.keys(FAMILY_LABELS) as SignalFamily[]).map((f) => {
              const on = settings.families.includes(f);
              const available = UNIVERSAL_SIGNAL_CATALOG.some((s) => s.family === f);
              return (
                <button
                  key={f}
                  type="button"
                  disabled={!available}
                  onClick={() => toggleFamily(f)}
                  data-testid={`uhs-family-${f}`}
                  title={available ? undefined : "No signals in this family yet"}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                    !available
                      ? "opacity-40 border-border text-muted-foreground"
                      : on
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "bg-background text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {on ? "✓ " : "+ "}{FAMILY_LABELS[f]}
                </button>
              );
            })}
          <label className="flex items-center gap-1 text-muted-foreground">
            Horizon
            <select value={settings.horizon} onChange={(e) => set("horizon", e.target.value)}
              className="bg-background border border-border rounded px-1 py-0.5 text-[11px]" data-testid="uhs-horizon">
              {HORIZONS.map((h) => <option key={h.label} value={h.label}>{h.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-muted-foreground" title="Qualification threshold. Singles qualify on Hit% (reached the target move within the horizon); pairs qualify on Win% (directionally-correct horizon return).">
            Hit% &gt;
            <input type="number" min={0} max={100} step={5}
              value={Math.round(settings.hitRateThreshold * 100)}
              onChange={(e) => set("hitRateThreshold", (parseFloat(e.target.value) || 0) / 100)}
              className="w-12 bg-background border border-border rounded px-1 py-0.5 text-[11px]" data-testid="uhs-hit-threshold" />
          </label>
          <label className="flex items-center gap-1 text-muted-foreground">
            Target%
            <input type="number" min={0} step={1} value={settings.targetPct}
              onChange={(e) => set("targetPct", parseFloat(e.target.value) || 0)}
              className="w-12 bg-background border border-border rounded px-1 py-0.5 text-[11px]" />
          </label>
          <label className="flex items-center gap-1 text-muted-foreground">
            Min occ
            <input type="number" min={1} step={1} value={settings.minOccurrences}
              onChange={(e) => set("minOccurrences", Math.max(1, Math.round(parseFloat(e.target.value) || 1)))}
              className="w-12 bg-background border border-border rounded px-1 py-0.5 text-[11px]" />
          </label>
          <label className="flex items-center gap-1 text-muted-foreground" title="Signals must fire at least this many times per year on average">
            Freq/yr ≥
            <input type="number" min={0} step={1} value={settings.freqFloorPerYear}
              onChange={(e) => set("freqFloorPerYear", parseFloat(e.target.value) || 0)}
              className="w-12 bg-background border border-border rounded px-1 py-0.5 text-[11px]" />
          </label>
          {settings.families.includes("valuation") && (
            <label className="flex items-center gap-1 text-muted-foreground" title="Lower frequency floor for valuation signals — multiple-extreme events fire less often than technical ones">
              Val freq ≥
              <input type="number" min={0} step={1} value={settings.valuationFreqFloorPerYear}
                onChange={(e) => set("valuationFreqFloorPerYear", parseFloat(e.target.value) || 0)}
                className="w-12 bg-background border border-border rounded px-1 py-0.5 text-[11px]" data-testid="uhs-val-freq" />
            </label>
          )}
          <label className="flex items-center gap-1 text-muted-foreground" title="A setup is 'firing now' when its last signal is within this many bars of today">
            Lookback
            <input type="number" min={1} step={1} value={settings.firingLookbackBars}
              onChange={(e) => set("firingLookbackBars", Math.max(1, Math.round(parseFloat(e.target.value) || 1)))}
              className="w-12 bg-background border border-border rounded px-1 py-0.5 text-[11px]" data-testid="uhs-lookback" />
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setSignalPickerOpen((o) => !o)}
              data-testid="uhs-signals-toggle"
              className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground"
            >
              Signals ({resolvedSettings.enabledSignalIds.length}/{UNIVERSAL_SIGNAL_CATALOG.length})
            </button>
            {signalPickerOpen && (
              <div className="absolute left-0 top-full mt-1 z-30 bg-card border border-border rounded shadow-lg p-2 w-[340px] max-h-[380px] overflow-auto text-[11px]" data-testid="uhs-signals-popover">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground">Signals in sweep</span>
                  <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={() => set("enabledSignalIds", [])}>
                    Reset to defaults
                  </button>
                </div>
                {(Object.keys(FAMILY_LABELS) as SignalFamily[]).map((f) => {
                  const sigs = UNIVERSAL_SIGNAL_CATALOG.filter((s) => s.family === f);
                  if (sigs.length === 0) return null;
                  return (
                    <div key={f} className="mb-1.5">
                      <div className="text-[10px] font-bold text-muted-foreground">{FAMILY_LABELS[f]}</div>
                      {sigs.map((s) => {
                        const on = resolvedSettings.enabledSignalIds.includes(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:text-foreground">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => {
                                const cur = new Set(resolvedSettings.enabledSignalIds);
                                if (cur.has(s.id)) cur.delete(s.id); else cur.add(s.id);
                                set("enabledSignalIds", [...cur]);
                              }}
                            />
                            <span>{s.label}</span>
                            {s.costly && <span className="text-[9px] text-yellow-500">(slow)</span>}
                            <span className="ml-auto text-[9px] text-muted-foreground">
                              {s.paramPresets.length}×{s.directions.length}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {settings.mode !== "single" && (
            <>
              <label className="flex items-center gap-1 text-muted-foreground" title="Cohort = all within-classification combinations. Cointegrated = /api/pairs-screen survivors (Engle-Granger ADF p<0.05), ranked by p-value, resolved at Run.">
                Pairs from
                <select value={settings.pairSource} onChange={(e) => set("pairSource", e.target.value as SweepSettings["pairSource"])}
                  className="bg-background border border-border rounded px-1 py-0.5 text-[11px]" data-testid="uhs-pair-source">
                  <option value="cohort">Cohort</option>
                  <option value="cointegration">Cointegrated</option>
                </select>
              </label>
              {settings.pairSource === "cohort" && (
                <label className="flex items-center gap-1 text-muted-foreground">
                  Pair cohort
                  <select value={settings.pairCohortDim} onChange={(e) => set("pairCohortDim", e.target.value as SweepSettings["pairCohortDim"])}
                    className="bg-background border border-border rounded px-1 py-0.5 text-[11px]">
                    {["subindustry", "industry", "sector"].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              )}
            </>
          )}

          {/* Saved screens — one-click full-config recall */}
          <div className="relative" ref={screensRef}>
            <button
              type="button"
              onClick={() => setScreensOpen((v) => !v)}
              data-testid="uhs-screens"
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border border-border text-muted-foreground hover:text-foreground"
              title="Save / apply named screen configurations"
            >
              <Bookmark className="w-3 h-3" />
              Screens{savedScreens.length ? ` (${savedScreens.length})` : ""}
            </button>
            {screensOpen && (
              <div className="absolute right-0 z-50 mt-1 w-72 rounded-md border border-border bg-popover shadow-lg p-2 space-y-1.5" data-testid="uhs-screens-panel">
                <div className="flex items-center gap-1">
                  <input
                    value={screenName}
                    onChange={(e) => setScreenName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveScreen(); }}
                    placeholder="Screen name…"
                    className="flex-1 h-6 px-1.5 text-[11px] bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid="uhs-screen-name"
                  />
                  <button
                    type="button"
                    onClick={saveScreen}
                    className="h-6 px-2 text-[10px] rounded border border-border hover:bg-accent"
                    data-testid="uhs-screen-save"
                  >
                    Save
                  </button>
                </div>
                {savedScreens.length === 0 ? (
                  <div className="text-[9px] text-muted-foreground leading-snug">
                    Saves the whole configuration — universe scope, every filter, signal families,
                    thresholds, horizon. Apply restores it all in one click.
                  </div>
                ) : (
                  <div className="space-y-0.5 max-h-56 overflow-y-auto">
                    {savedScreens.map((s) => (
                      <div key={s.id} className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-accent group text-[11px]">
                        <button
                          type="button"
                          className="flex-1 text-left truncate hover:text-primary font-mono"
                          onClick={() => applyScreen(s)}
                          data-testid={`uhs-screen-apply-${s.name.replace(/\s+/g, "-")}`}
                          title={`${s.universeMode} · ${s.settings?.mode ?? ""} · ${(s.settings?.families ?? []).join("/")}`}
                        >
                          {s.name}
                        </button>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-destructive"
                          onClick={() => deleteScreen(s.id)}
                          data-testid={`uhs-screen-delete-${s.name.replace(/\s+/g, "-")}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={busy ? () => { cancelRef.current = true; } : handleRun}
            data-testid="uhs-run"
            className={`inline-flex items-center gap-1 px-3 py-1 rounded text-[11px] font-bold border ${
              busy
                ? "border-destructive/50 text-destructive"
                : "bg-primary text-primary-foreground border-primary hover:opacity-90"
            }`}
          >
            {busy ? <><Loader2 className="w-3 h-3 animate-spin" /> Cancel</> : <><Play className="w-3 h-3" /> Run</>}
          </button>
          {rows.length > 0 && !busy && (
            <button
              type="button"
              onClick={handleRefreshFiring}
              data-testid="uhs-refresh-firing"
              className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground"
              title="Re-detect only the latest firing state for qualified setups (does not rebuild hit rates)"
            >
              Refresh firing status
            </button>
          )}
        </div>

        {busy && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground" data-testid="uhs-progress">
            <div className="flex-1 h-1.5 bg-border rounded overflow-hidden max-w-[400px]">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: progress.total > 0 ? `${(100 * progress.done) / progress.total}%` : "0%" }}
              />
            </div>
            <span className="font-mono">
              {progress.done}/{progress.total}{progress.subject ? ` · ${progress.subject}` : ""}
            </span>
          </div>
        )}
        {errorMsg && <div className="text-[11px] text-destructive">{errorMsg}</div>}
      </div>

      {/* View toggle + results */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-[11px] flex-shrink-0">
        <div className="flex items-center rounded border border-border overflow-hidden">
          <button type="button" onClick={() => setView("firing")} data-testid="uhs-view-firing"
            className={`px-2 py-0.5 text-[10px] font-mono ${view === "firing" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            Firing now ({firingCount})
          </button>
          <button type="button" onClick={() => setView("library")} data-testid="uhs-view-library"
            className={`px-2 py-0.5 text-[10px] font-mono ${view === "library" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            Full library ({rows.length})
          </button>
        </div>
        {lastRunAt && (
          <span className="text-[10px] text-muted-foreground" data-testid="uhs-staleness">
            Library built {new Date(lastRunAt).toLocaleString()}
            {refreshedAt && ` · firing refreshed ${new Date(refreshedAt).toLocaleString()}`}
            {loadedScopeDesc && ` · ${loadedScopeDesc}`}
          </span>
        )}
        {rows.length > 0 && loadedScopeHash && loadedScopeHash !== scopeHash && !busy && (
          <span className="text-[10px] text-yellow-500" data-testid="uhs-scope-mismatch">
            Current scope/settings differ from the cached library — Run to rebuild.
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {visibleRows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-6 text-center">
            {rows.length === 0
              ? "Run a sweep to build the qualified-setup library."
              : view === "firing"
                ? "No qualified setups are firing within the lookback window. Switch to Full library to see everything."
                : "No rows."}
          </div>
        ) : (
          <table className="w-full text-[11px] font-mono border-collapse" data-testid="uhs-results-table">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-muted-foreground text-[10px] border-b border-border">
                <th className="text-left py-1 px-2"><SortHeader label="Subject" columnKey="subject" sort={sort} /></th>
                <th className="text-left py-1 pr-2"><SortHeader label="Family" columnKey="family" sort={sort} /></th>
                <th className="text-left py-1 pr-2"><SortHeader label="Signal" columnKey="signal" sort={sort} /></th>
                <th className="text-left py-1 pr-2"><SortHeader label="Dir" columnKey="direction" sort={sort} /></th>
                <th className="text-right py-1 pr-2"><SortHeader label="Hit%" columnKey="hitRate" sort={sort} align="right" title="Share of signals whose favorable move reached the target within the horizon" /></th>
                <th className="text-right py-1 pr-2"><SortHeader label="Win%" columnKey="winRate" sort={sort} align="right" title="Share of signals with a directionally-correct horizon return" /></th>
                <th className="text-right py-1 pr-2"><SortHeader label="Avg" columnKey="avgReturn" sort={sort} align="right" /></th>
                <th className="text-right py-1 pr-2"><SortHeader label="Med" columnKey="medianReturn" sort={sort} align="right" /></th>
                <th className="text-right py-1 pr-2"><SortHeader label="Occ" columnKey="occurrences" sort={sort} align="right" /></th>
                <th className="text-right py-1 pr-2"><SortHeader label="Freq/yr" columnKey="freqPerYear" sort={sort} align="right" /></th>
                <th className="text-right py-1 pr-2"><SortHeader label="Last fired" columnKey="lastSignalDate" sort={sort} align="right" /></th>
                <th className="text-center py-1 pr-2">Firing</th>
                <th className="text-right py-1 pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const expanded = expandedKey === r.key;
                return (
                  <Fragment key={r.key}>
                    <tr
                      className="border-b border-border/40 hover:bg-card/60 cursor-pointer"
                      onClick={() => setExpandedKey(expanded ? null : r.key)}
                      data-testid={`uhs-row-${r.key}`}
                    >
                      <td className="py-0.5 px-2 font-bold whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          {r.subject}
                          {r.subject.split("/").map((leg) => (
                            <Fragment key={leg}>
                              <SeasonalChip ticker={leg} status={seasonal.statusFor(leg)} />
                              <ValuationChip ticker={leg} status={valuation.statusFor(leg)} />
                              <CrowdingChip ticker={leg} status={crowding.statusFor(leg)} />
                            </Fragment>
                          ))}
                        </span>
                      </td>
                      <td className="py-0.5 pr-2 text-muted-foreground">{FAMILY_LABELS[r.family]}</td>
                      <td className="py-0.5 pr-2 whitespace-nowrap">{r.signalLabel} <span className="text-muted-foreground">{r.paramsLabel}</span></td>
                      <td className={`py-0.5 pr-2 ${r.direction === "long" ? "text-green-400" : "text-red-400"}`}>{r.direction}</td>
                      <td className={`text-right py-0.5 pr-2 font-bold ${hitRateColorClass(r.hitRate)}`}>{formatHitRate(r.hitRate)}</td>
                      <td className={`text-right py-0.5 pr-2 ${hitRateColorClass(r.winRate)}`}>{formatHitRate(r.winRate)}</td>
                      <td className={`text-right py-0.5 pr-2 ${retColor(r.avgReturn)}`}>{fmtPct(r.avgReturn)}</td>
                      <td className={`text-right py-0.5 pr-2 ${retColor(r.medianReturn)}`}>{fmtPct(r.medianReturn)}</td>
                      <td className="text-right py-0.5 pr-2">{r.occurrences}</td>
                      <td className="text-right py-0.5 pr-2">{r.freqPerYear.toFixed(1)}</td>
                      <td className="text-right py-0.5 pr-2 whitespace-nowrap">{r.lastSignalDate ?? "—"}</td>
                      <td className="text-center py-0.5 pr-2">
                        {r.firingNow ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 rounded bg-primary/15 text-primary border border-primary/40" data-testid="uhs-firing-badge">
                            <Flame className="w-2.5 h-2.5" /> ON
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">
                            {r.lastSignalBarsAgo != null ? `${r.lastSignalBarsAgo}b ago` : "—"}
                          </span>
                        )}
                      </td>
                      <td className="text-right py-0.5 pr-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {r.mode === "single" && (
                          <button type="button" onClick={() => openOnChart(r)} title="Show signals on Charts"
                            className="text-muted-foreground hover:text-primary p-0.5" data-testid={`uhs-chart-${r.key}`}>
                            <LineChart className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {OPTIMIZER_ROUTE_BY_SIGNAL.has(r.signalId) && (
                          <button
                            type="button"
                            title="Refine in optimizer"
                            onClick={() => navigate(OPTIMIZER_ROUTE_BY_SIGNAL.get(r.signalId)!)}
                            className="text-muted-foreground hover:text-primary p-0.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-border/40 bg-card/40">
                        <td colSpan={13} className="py-1.5 px-8">
                          <table className="text-[10px] font-mono">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left pr-4">Horizon</th>
                                {r.allHorizons.map((h) => <th key={h.horizon} className="text-right pr-4">{h.horizon}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="text-muted-foreground pr-4">Hit%</td>
                                {r.allHorizons.map((h) => (
                                  <td key={h.horizon} className={`text-right pr-4 ${hitRateColorClass(h.hitRate)}`}>{formatHitRate(h.hitRate)}</td>
                                ))}
                              </tr>
                              <tr>
                                <td className="text-muted-foreground pr-4">Avg ret</td>
                                {r.allHorizons.map((h) => (
                                  <td key={h.horizon} className={`text-right pr-4 ${retColor(h.avgReturn)}`}>{fmtPct(h.avgReturn)}</td>
                                ))}
                              </tr>
                              <tr>
                                <td className="text-muted-foreground pr-4">t-stat</td>
                                {r.allHorizons.map((h) => (
                                  <td key={h.horizon} className="text-right pr-4">{Number.isFinite(h.tStat) ? h.tStat.toFixed(2) : "—"}</td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
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
    </div>
  );
}
