// Liquidity Capacity — backs into the $ ADV each position-size tier requires
// given book AUM (GMV), build window, and participation rate, then buckets the
// filtered universe by which tier each name's real 3-month median $ ADV clears.
//
// ADV comes from the server pipeline (POST /api/liquidity/adv → server/adv.ts):
// Yahoo daily close × volume, FX-converted to USD, 63 trading days ≈ 3 months.
// The server cache refreshes daily, so the buckets re-rank every day on load.

import { useEffect, useMemo, useState, useCallback } from "react";
import { fetchWorkbookTickers, type TickerMeta } from "@/lib/fetchWorkbookTickers";
import { useWorkbookAdv, useBulkAdv, type AdvEntry } from "@/lib/workbookAdv";
import { useUniverse } from "@/lib/universeContext";
import { useGeoFilter } from "@/lib/useGeoFilter";
import { useTableSort, SortHeader } from "@/lib/useTableSort";
import { useBasketScope, BasketScopeSelect } from "@/components/BasketScopeSelect";
import { PagePresets } from "@/components/PagePresets";
import { usePersistedState } from "@/lib/persistedState";
import { useWorkspaceState } from "@/lib/workspaceState";
import { navigateToTicker } from "@/lib/navigateToTicker";
import { fmtUsdMM } from "@/lib/numericFilter";
import {
  emptyClassFilters,
  applyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";
import { ClassificationFiltersWithSource } from "@/components/ClassificationFiltersWithSource";
import { useGlobalUniverse, type GlobalRecord } from "@/lib/globalUniverse";
import {
  DEFAULT_CAPACITY_CONFIG,
  tierThresholds,
  effectiveAdvMM,
  maxPositionPct,
  bucketIndex,
  exitDaysFor,
  type CapacityConfig,
  type AdvBasis,
} from "@/lib/liquidityCapacity";

const ADV_WINDOW = 63; // trading days ≈ 3 months
const AUM_CHIPS_MM = [500, 1000, 2000, 3000, 5000];

interface Row {
  ticker: string;
  /** What to render — FactSet regional form for non-US global names whose
   *  primary ticker is an opaque SEDOL-like code. */
  display: string;
  name: string;
  nation: string;
  sector: string;
  subsector: string;
  medianMM: number | null;
  meanMM: number | null;
  p25MM: number | null;
  /** Basis ADV after the stress haircut — what bucketing compares against. */
  effAdvMM: number | null;
  maxPosPct: number | null;
  maxPosMM: number | null;
  /** Best tier index cleared (-1 no data, thresholds.length = below floor). */
  bucket: number;
  /** Days to exit a position at the bucketed tier's size, at exit participation. */
  exitDays: number | null;
  delisted: boolean;
}

function basisValue(entry: AdvEntry | undefined, basis: AdvBasis): number | null {
  if (!entry) return null;
  const v = basis === "mean" ? entry.advUsdMM
    : basis === "p25" ? entry.p25UsdMM
    : entry.medianUsdMM;
  return v == null || !Number.isFinite(v) ? null : v;
}

/** Merge a stored (possibly partial / stale-shaped) config over the defaults. */
function sanitizeConfig(raw: any): CapacityConfig {
  const d = DEFAULT_CAPACITY_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const num = (v: any, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);
  const tiers = Array.isArray(raw.tiers)
    ? raw.tiers
        .filter((t: any) => t && typeof t.label === "string" && Number.isFinite(t.pct) && t.pct > 0)
        .slice(0, 6)
        .map((t: any) => ({ label: t.label.slice(0, 20), pct: t.pct }))
    : d.tiers;
  return {
    aumMM: num(raw.aumMM, d.aumMM),
    tiers: tiers.length > 0 ? tiers : d.tiers,
    buildDays: num(raw.buildDays, d.buildDays) || d.buildDays,
    participationPct: num(raw.participationPct, d.participationPct) || d.participationPct,
    sizeForExit: typeof raw.sizeForExit === "boolean" ? raw.sizeForExit : d.sizeForExit,
    exitDays: num(raw.exitDays, d.exitDays) || d.exitDays,
    exitParticipationPct: num(raw.exitParticipationPct, d.exitParticipationPct) || d.exitParticipationPct,
    stressHaircutPct: Math.min(num(raw.stressHaircutPct, d.stressHaircutPct), 90),
    advBasis: raw.advBasis === "mean" || raw.advBasis === "p25" || raw.advBasis === "median" ? raw.advBasis : d.advBasis,
  };
}

const fmtDays = (d: number | null): string => (d == null ? "—" : d >= 10 ? d.toFixed(0) : d.toFixed(1));

export default function LiquidityCapacity() {
  const { universeTickers } = useUniverse();
  const [allTickers, setAllTickers] = useState<TickerMeta[]>([]);
  useEffect(() => { fetchWorkbookTickers().then(setAllTickers).catch(() => {}); }, []);

  // ── Universe source: REIT workbook (live Yahoo median ADV) vs the ~9.4k-name
  // global FactSet snapshot (baked mean $ ADV, US + international).
  const [source, setSource] = usePersistedState<"workbook" | "global">("reit-viz:liquidity-capacity:source-v1", "workbook");
  const global = useGlobalUniverse();
  const isGlobal = source === "global";

  // ── Scoping: universe → classification/search/manual → geo → basket
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);
  const [search, setSearch] = useState("");
  const [manualTickers, setManualTickers] = useState<Set<string>>(new Set());
  const universeNarrowed = useMemo(
    () => (universeTickers ? allTickers.filter((t) => universeTickers.has(t.ticker)) : allTickers),
    [allTickers, universeTickers],
  );
  const basePool = useMemo<any[]>(
    () => (isGlobal ? global.metas : universeNarrowed),
    [isGlobal, global.metas, universeNarrowed],
  );
  const geo = useGeoFilter(basePool, "liqcap-geo");
  const basketScope = useBasketScope("reit-viz:basket-scope:liquidity-capacity");
  const filteredPool = useMemo(
    () => geo.filterByGeo(applyClassFilters(basePool, classFilters, search, manualTickers))
      // Baskets hold workbook tickers, so basket scoping only applies there.
      .filter((t: any) => isGlobal || basketScope.inScope(t.ticker)),
    [basePool, classFilters, search, manualTickers, geo.filterByGeo, basketScope.members, isGlobal],
  );

  // Manual adds may be off-universe Yahoo symbols — include them even when the
  // pool has no row for them (the server ADV pipeline covers any symbol).
  const poolMeta = useMemo(() => {
    const byTicker = new Map(filteredPool.map((t: any) => [String(t.ticker).toUpperCase(), t]));
    for (const m of manualTickers) {
      const up = m.toUpperCase();
      if (!byTicker.has(up)) {
        byTicker.set(up, { ticker: up, name: up, economy: "", sector: "(off-universe)", subsector: "", industryGroup: "", industry: "", subindustry: "", metrics: [] } as any);
      }
    }
    return Array.from(byTicker.values());
  }, [filteredPool, manualTickers]);

  // ── Config (sticky across visits)
  const [storedCfg, setStoredCfg] = usePersistedState<CapacityConfig>(
    "reit-viz:liquidity-capacity:config-v1",
    DEFAULT_CAPACITY_CONFIG,
  );
  const cfg = useMemo(() => sanitizeConfig(storedCfg), [storedCfg]);
  const patchCfg = useCallback(
    (patch: Partial<CapacityConfig>) => setStoredCfg((prev) => ({ ...sanitizeConfig(prev), ...patch })),
    [setStoredCfg],
  );
  const [groupBy, setGroupBy] = usePersistedState<"bucket" | "sector" | "flat">("reit-viz:liquidity-capacity:group-v1", "bucket");

  // ── Workspace + presets participation (config only; rows recompute live)
  const serializeState = useCallback(
    () => ({ cfg, groupBy, source, classFiltersSer: serializeClassFilters(classFilters), search, manualTickers: [...manualTickers] }),
    [cfg, groupBy, source, classFilters, search, manualTickers],
  );
  const hydrateState = useCallback((state: any) => {
    if (!state || typeof state !== "object") return;
    if (state.cfg) setStoredCfg(sanitizeConfig(state.cfg));
    if (state.groupBy === "bucket" || state.groupBy === "sector" || state.groupBy === "flat") setGroupBy(state.groupBy);
    if (state.source === "workbook" || state.source === "global") setSource(state.source);
    if (state.classFiltersSer) setClassFilters(deserializeClassFilters(state.classFiltersSer));
    if (typeof state.search === "string") setSearch(state.search);
    if (Array.isArray(state.manualTickers)) setManualTickers(new Set(state.manualTickers.filter((t: any) => typeof t === "string")));
  }, [setStoredCfg, setGroupBy, setSource]);
  useWorkspaceState("liquidity-capacity", serializeState, hydrateState);

  // ── ADV load (server-cached; auto-fires as the pool changes). In global mode
  // the baked snapshot supplies $ ADV, so live Yahoo is only fetched for
  // manually added symbols.
  const symbols = useMemo(
    () => (isGlobal ? [...manualTickers] : poolMeta.map((t) => t.ticker).slice(0, 600)),
    [isGlobal, poolMeta, manualTickers],
  );
  const [refreshToken, setRefreshToken] = useState(0);
  const { advMap, loading, error } = useWorkbookAdv(symbols, ADV_WINDOW, refreshToken);
  // The nightly server job (server/advNightly.ts) precomputes live Yahoo ADV
  // for the whole global universe; names it hasn't reached fall back to the
  // snapshot mean.
  const { bulkMap, bulkStatus, loading: bulkLoading } = useBulkAdv(isGlobal, ADV_WINDOW);

  const effBasis: AdvBasis = cfg.advBasis;

  // ── Derived: thresholds + rows + buckets
  const thresholds = useMemo(() => tierThresholds(cfg), [cfg]);
  const rows = useMemo<Row[]>(() => {
    return poolMeta.map((t: any) => {
      const key = String(t.ticker).toUpperCase();
      const entry = advMap.get(key) ?? (isGlobal ? bulkMap.get(key) : undefined);
      const g = t as GlobalRecord;
      const snapshotMM = isGlobal && Number.isFinite(g.dollarVolMM as number) ? (g.dollarVolMM as number) : null;
      const basisMM = entry ? basisValue(entry, effBasis) ?? snapshotMM : snapshotMM;
      const eff = effectiveAdvMM(cfg, basisMM);
      const bucket = bucketIndex(thresholds, eff);
      const tierPct = bucket >= 0 && bucket < thresholds.length ? thresholds[bucket].tier.pct : null;
      const maxPct = maxPositionPct(cfg, eff);
      const usName = !t.nation || t.nation === "UNITED STATES";
      return {
        ticker: t.ticker,
        display: isGlobal && !usName && g.fdsTicker ? g.fdsTicker : t.ticker,
        name: t.name || t.ticker,
        nation: t.nation || "",
        sector: t.sector || "—",
        subsector: t.subsector || "—",
        medianMM: entry?.medianUsdMM ?? null,
        meanMM: entry?.advUsdMM ?? snapshotMM,
        p25MM: entry?.p25UsdMM ?? null,
        effAdvMM: eff,
        maxPosPct: maxPct,
        maxPosMM: maxPct == null ? null : (maxPct / 100) * cfg.aumMM,
        bucket,
        exitDays: tierPct == null ? null : exitDaysFor(cfg, tierPct, eff),
        delisted: entry?.delisted === true,
      };
    });
  }, [poolMeta, advMap, bulkMap, cfg, thresholds, isGlobal, effBasis]);

  // How many in-scope names ride on live nightly ADV vs the snapshot fallback.
  const liveCount = useMemo(
    () => (isGlobal ? rows.filter((r) => r.medianMM != null).length : rows.length),
    [rows, isGlobal],
  );

  const asOf = useMemo(() => {
    let latest: string | null = null;
    for (const e of advMap.values()) if (e.asOf && (!latest || e.asOf > latest)) latest = e.asOf;
    return latest;
  }, [advMap]);

  // Cumulative count clearing each tier (name clears tier i when bucket ≤ i).
  const tierCounts = useMemo(
    () => thresholds.map((_, i) => rows.filter((r) => r.bucket >= 0 && r.bucket <= i).length),
    [rows, thresholds],
  );
  const belowFloor = rows.filter((r) => r.bucket === thresholds.length).length;
  const noData = rows.filter((r) => r.bucket === -1).length;

  // ── Sort (applies within each group)
  const sort = useTableSort<Row>("effAdvMM", "desc", "desc", "liqcap");
  const accessor = useCallback((row: Row, key: string) => {
    switch (key) {
      case "ticker": return row.display;
      case "name": return row.name;
      case "nation": return row.nation || null;
      case "sector": return row.sector;
      case "subsector": return row.subsector;
      case "medianMM": return row.medianMM;
      case "meanMM": return row.meanMM;
      case "p25MM": return row.p25MM;
      case "effAdvMM": return row.effAdvMM;
      case "maxPosPct": return row.maxPosPct;
      case "exitDays": return row.exitDays;
      case "bucket": return row.bucket === -1 ? null : row.bucket;
      default: return null;
    }
  }, []);

  interface Group { key: string; label: string; sublabel?: string; rows: Row[] }
  const groups = useMemo<Group[]>(() => {
    if (groupBy === "sector") {
      const bySector = new Map<string, Row[]>();
      for (const r of rows) {
        if (!bySector.has(r.sector)) bySector.set(r.sector, []);
        bySector.get(r.sector)!.push(r);
      }
      return Array.from(bySector.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([sector, list]) => ({ key: `sec:${sector}`, label: sector, rows: sort.apply(list, accessor) }));
    }
    if (groupBy === "flat") {
      return [{ key: "all", label: "", rows: sort.apply(rows, accessor) }];
    }
    const out: Group[] = [];
    thresholds.forEach((th, i) => {
      const list = rows.filter((r) => r.bucket === i);
      out.push({
        key: `tier:${i}`,
        label: `${th.tier.label} ≥ ${th.tier.pct}% (${fmtUsdMM((th.tier.pct / 100) * cfg.aumMM)})`,
        sublabel: `needs ≥ ${fmtUsdMM(th.requiredAdvMM)} ADV`,
        rows: sort.apply(list, accessor),
      });
    });
    out.push({ key: "floor", label: "Below floor", sublabel: "cannot support the smallest tier", rows: sort.apply(rows.filter((r) => r.bucket === thresholds.length), accessor) });
    if (noData > 0) out.push({ key: "nodata", label: "No ADV data", rows: sort.apply(rows.filter((r) => r.bucket === -1), accessor) });
    return out;
  }, [rows, groupBy, thresholds, cfg.aumMM, sort.sortKey, sort.sortDir, accessor, noData]);

  const bucketName = useCallback((b: number): string => {
    if (b === -1) return "—";
    if (b === thresholds.length) return "Below floor";
    return thresholds[b]?.tier.label ?? "—";
  }, [thresholds]);

  // ── Tier editing
  const setTierPct = useCallback((idx: number, pct: number) => {
    const tiers = cfg.tiers.map((t, i) => (i === idx ? { ...t, pct } : t));
    patchCfg({ tiers });
  }, [cfg.tiers, patchCfg]);
  const setTierLabel = useCallback((idx: number, label: string) => {
    const tiers = cfg.tiers.map((t, i) => (i === idx ? { ...t, label } : t));
    patchCfg({ tiers });
  }, [cfg.tiers, patchCfg]);
  const addTier = useCallback(() => {
    if (cfg.tiers.length >= 6) return;
    const minPct = Math.min(...cfg.tiers.map((t) => t.pct));
    patchCfg({ tiers: [...cfg.tiers, { label: `Tier ${cfg.tiers.length + 1}`, pct: Math.max(0.25, minPct / 2) }] });
  }, [cfg.tiers, patchCfg]);
  const removeTier = useCallback((idx: number) => {
    if (cfg.tiers.length <= 1) return;
    patchCfg({ tiers: cfg.tiers.filter((_, i) => i !== idx) });
  }, [cfg.tiers, patchCfg]);

  // ── CSV export
  const exportCsv = useCallback(() => {
    const flat = groups.flatMap((g) => g.rows);
    if (flat.length === 0) return;
    const headers = ["ticker", "name", "country", "sector", "subsector", "bucket", "median_adv_mm", "mean_adv_mm", "p25_adv_mm", "eff_adv_mm", "max_pos_pct", "max_pos_mm", "exit_days"];
    const dataRows = flat.map((r) => [
      r.display, `"${r.name.replace(/"/g, '""')}"`, `"${r.nation}"`, `"${r.sector}"`, `"${r.subsector}"`, bucketName(r.bucket),
      r.medianMM?.toFixed(2) ?? "", r.meanMM?.toFixed(2) ?? "", r.p25MM?.toFixed(2) ?? "", r.effAdvMM?.toFixed(2) ?? "",
      r.maxPosPct?.toFixed(3) ?? "", r.maxPosMM?.toFixed(1) ?? "", r.exitDays?.toFixed(2) ?? "",
    ]);
    const csv = [headers.join(","), ...dataRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liquidity-capacity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [groups, bucketName]);

  const inputCls = "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground";
  const labelCls = "text-[9px] uppercase text-muted-foreground tracking-wider";
  const colCount = 12; // ≥ max visible columns in either mode (only used for colSpan)

  return (
    <div className="h-full overflow-y-auto" data-testid="liquidity-capacity-page">
      <div className="p-3 text-xs font-mono space-y-3">
        {/* Title */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-bold">Liquidity Capacity</h1>
            <p className="text-[10px] text-muted-foreground">
              Required ADV per sizing tier = AUM × position% ÷ (days × participation); each name is bucketed by the largest
              tier its real {ADV_WINDOW}-day {effBasis} $ ADV clears{isGlobal ? " (snapshot-mean fallback for names Yahoo can't resolve)" : ""}.
              "Size for the exit" also requires the position to clear in the exit window — the binding (larger) requirement wins.
            </p>
          </div>
          <PagePresets
            storageKey="reit-viz:liquidity-capacity:presets"
            capture={() => ({ cfg, groupBy, source })}
            apply={(s: any) => {
              if (s?.cfg) setStoredCfg(sanitizeConfig(s.cfg));
              if (s?.groupBy) setGroupBy(s.groupBy);
              if (s?.source === "workbook" || s?.source === "global") setSource(s.source);
            }}
            testIdPrefix="liqcap-presets"
          />
        </div>

        {/* Universe source + scoping filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <ClassificationFiltersWithSource
            workbookTickers={universeNarrowed}
            filters={classFilters}
            onFiltersChange={setClassFilters}
            search={search}
            onSearchChange={setSearch}
            manualTickers={manualTickers}
            onManualTickersChange={setManualTickers}
            filteredCount={poolMeta.length}
            totalCount={universeNarrowed.length}
            testIdPrefix="liqcap"
            source={source}
            onSourceChange={(s) => setSource(s === "global" ? "global" : "workbook")}
            extraFilters={geo.geoFilterUI}
            allowUnknownTickers
          >
            {!isGlobal && <BasketScopeSelect scope={basketScope} />}
          </ClassificationFiltersWithSource>
        </div>

        {/* Book config */}
        <div className="flex flex-wrap items-end gap-3 border border-border rounded p-2 bg-card/40">
          <div className="flex flex-col">
            <label className={labelCls}>AUM / GMV ($MM)</label>
            <div className="flex items-center gap-1 mt-0.5">
              <input type="number" min={1} step={100} value={cfg.aumMM}
                onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) patchCfg({ aumMM: v }); }}
                className={`${inputCls} w-24`} data-testid="liqcap-aum" />
              {AUM_CHIPS_MM.map((mm) => (
                <button key={mm} onClick={() => patchCfg({ aumMM: mm })}
                  className={`text-[10px] px-1.5 py-1 rounded border ${cfg.aumMM === mm ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:text-foreground"}`}
                  data-testid={`liqcap-aum-chip-${mm}`}>
                  {mm >= 1000 ? `$${mm / 1000}B` : `$${mm}M`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            <label className={labelCls} title="Trading days to build a full position">Build days</label>
            <input type="number" min={1} step={1} value={cfg.buildDays}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) patchCfg({ buildDays: v }); }}
              className={`${inputCls} mt-0.5 w-16`} data-testid="liqcap-build-days" />
          </div>
          <div className="flex flex-col">
            <label className={labelCls} title="% of a day's volume you can trade without moving the name">Participation %</label>
            <input type="number" min={1} max={100} step={1} value={cfg.participationPct}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) patchCfg({ participationPct: v }); }}
              className={`${inputCls} mt-0.5 w-16`} data-testid="liqcap-participation" />
          </div>
          <label className="flex items-center gap-1.5 text-[11px] pb-1 cursor-pointer"
            title="Also require every tier to be fully exitable in the exit window — the binding (larger) ADV requirement wins">
            <input type="checkbox" checked={cfg.sizeForExit} onChange={(e) => patchCfg({ sizeForExit: e.target.checked })} data-testid="liqcap-size-for-exit" />
            Size for the exit
          </label>
          {cfg.sizeForExit && (
            <>
              <div className="flex flex-col">
                <label className={labelCls}>Exit days</label>
                <input type="number" min={0.5} step={0.5} value={cfg.exitDays}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) patchCfg({ exitDays: v }); }}
                  className={`${inputCls} mt-0.5 w-16`} data-testid="liqcap-exit-days" />
              </div>
              <div className="flex flex-col">
                <label className={labelCls}>Exit part. %</label>
                <input type="number" min={1} max={100} step={1} value={cfg.exitParticipationPct}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) patchCfg({ exitParticipationPct: v }); }}
                  className={`${inputCls} mt-0.5 w-16`} data-testid="liqcap-exit-participation" />
              </div>
            </>
          )}
          <div className="flex flex-col">
            <label className={labelCls} title="Shrink every name's ADV for a stressed / deleveraging tape (ADV compresses 30–50% in a real unwind)">Stress haircut %</label>
            <input type="number" min={0} max={90} step={5} value={cfg.stressHaircutPct}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0 && v <= 90) patchCfg({ stressHaircutPct: v }); }}
              className={`${inputCls} mt-0.5 w-16`} data-testid="liqcap-haircut" />
          </div>
          <div className="flex flex-col">
            <label className={labelCls} title={isGlobal
              ? "Live nightly Yahoo ADV where available; names the nightly job can't reach fall back to the snapshot mean regardless of basis."
              : "Median ignores earnings/rebalance volume spikes — the honest sizing number. P25 is a quiet-tape read."}>ADV basis</label>
            <select value={effBasis}
              onChange={(e) => patchCfg({ advBasis: e.target.value as AdvBasis })}
              className={`${inputCls} mt-0.5`} data-testid="liqcap-basis">
              <option value="median">Median (3mo)</option>
              <option value="mean">Mean (3mo)</option>
              <option value="p25">25th pct (3mo)</option>
            </select>
          </div>
          <div className="flex-1" />
          <div className="flex flex-col items-end gap-0.5">
            {isGlobal ? (
              <span className="text-[9px] text-muted-foreground text-right" data-testid="liqcap-snapshot-note">
                {bulkLoading
                  ? "loading nightly ADV…"
                  : `live nightly ADV: ${liveCount.toLocaleString()} of ${rows.length.toLocaleString()} in scope`}
                <br />
                {bulkStatus?.finishedAt
                  ? `last refresh ${bulkStatus.finishedAt.slice(0, 16).replace("T", " ")}Z`
                  : bulkStatus?.running
                    ? `refresh running (${bulkStatus.attempted}/${bulkStatus.total})…`
                    : "rest from FactSet snapshot"}
              </span>
            ) : (
              <>
                <button onClick={() => setRefreshToken(Date.now())} disabled={loading}
                  className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-card/80 disabled:opacity-50"
                  data-testid="liqcap-refresh" title="Force a fresh Yahoo re-pull server-side">
                  {loading ? "Loading ADV…" : "Refresh ADV"}
                </button>
                {asOf && <span className="text-[9px] text-muted-foreground">as of {asOf}</span>}
              </>
            )}
          </div>
        </div>

        {/* Sizing tiers */}
        <div className="flex flex-wrap items-end gap-2 border border-border rounded p-2 bg-card/40">
          <span className={`${labelCls} pb-1.5`}>Sizing tiers (% of AUM)</span>
          {cfg.tiers.map((tier, i) => (
            <div key={i} className="flex items-center gap-1 border border-border rounded px-1.5 py-1 bg-background">
              <input value={tier.label} onChange={(e) => setTierLabel(i, e.target.value)}
                className="text-[11px] font-mono bg-transparent w-16 outline-none" data-testid={`liqcap-tier-label-${i}`} />
              <input type="number" min={0.1} step={0.25} value={tier.pct}
                onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) setTierPct(i, v); }}
                className={`${inputCls} w-16`} data-testid={`liqcap-tier-pct-${i}`} />
              <span className="text-[10px] text-muted-foreground">%</span>
              {cfg.tiers.length > 1 && (
                <button onClick={() => removeTier(i)} className="text-[10px] text-muted-foreground hover:text-rose-400 px-0.5" title="Remove tier" data-testid={`liqcap-tier-remove-${i}`}>×</button>
              )}
            </div>
          ))}
          {cfg.tiers.length < 6 && (
            <button onClick={addTier} className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground" data-testid="liqcap-tier-add">+ tier</button>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-0.5 pb-0.5">
            {(["bucket", "sector", "flat"] as const).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)}
                className={`text-[10px] px-2 py-1 rounded border ${groupBy === g ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:text-foreground"}`}
                data-testid={`liqcap-group-${g}`}>
                {g === "bucket" ? "By bucket" : g === "sector" ? "By sector" : "Flat"}
              </button>
            ))}
          </div>
        </div>

        {/* Summary strip: required ADV + cumulative counts per tier */}
        <div className="flex flex-wrap gap-2" data-testid="liqcap-summary">
          {thresholds.map((th, i) => (
            <div key={i} className="border border-border rounded px-2.5 py-1.5 bg-card/40">
              <div className="text-[10px] text-muted-foreground">
                {th.tier.label} {th.tier.pct}% = {fmtUsdMM((th.tier.pct / 100) * cfg.aumMM)} pos → needs ≥ <span className="text-foreground font-bold">{fmtUsdMM(th.requiredAdvMM)}</span> ADV
              </div>
              <div className="text-sm font-bold" data-testid={`liqcap-count-${i}`}>
                {tierCounts[i]} <span className="text-[10px] font-normal text-muted-foreground">names clear it</span>
              </div>
            </div>
          ))}
          <div className="border border-border rounded px-2.5 py-1.5 bg-card/40">
            <div className="text-[10px] text-muted-foreground">Below floor</div>
            <div className="text-sm font-bold text-rose-400" data-testid="liqcap-count-floor">
              {belowFloor} <span className="text-[10px] font-normal text-muted-foreground">of {rows.length}</span>
            </div>
          </div>
          {cfg.stressHaircutPct > 0 && (
            <div className="border border-amber-500/40 rounded px-2.5 py-1.5 bg-amber-500/10 text-[10px] text-amber-300 flex items-center">
              stressed: ADV × {(1 - cfg.stressHaircutPct / 100).toFixed(2)}
            </div>
          )}
        </div>

        {error && !isGlobal && <div className="text-[10px] text-rose-400">ADV load failed: {error}</div>}
        {isGlobal && global.loading && (
          <div className="text-[10px] text-muted-foreground">Loading the global universe…</div>
        )}
        {!isGlobal && loading && rows.every((r) => r.bucket === -1) && (
          <div className="text-[10px] text-muted-foreground">Computing {ADV_WINDOW}-day ADV for {symbols.length} names… (first run is cold; daily reloads are instant)</div>
        )}
        {!isGlobal && poolMeta.length > 600 && (
          <div className="text-[10px] text-amber-400">Pool capped at 600 names per ADV request — narrow the filters.</div>
        )}

        {/* Bucketed table */}
        <div className="border border-border rounded">
          <div className="flex items-center bg-card/50 border-b border-border">
            <span className="flex-1 px-2 py-1 text-[11px] font-bold">
              {rows.length} names · {tierCounts[0] ?? 0} clear the top tier
              {noData > 0 && <span className="ml-2 text-[10px] text-muted-foreground">({noData} no data)</span>}
            </span>
            <button onClick={exportCsv} disabled={rows.length === 0}
              className="mx-2 px-2 py-0.5 rounded text-[10px] border border-border text-muted-foreground hover:text-foreground hover:bg-card/80 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="liqcap-export-csv">
              CSV
            </button>
          </div>
          {rows.length === 0 ? (
            <div className="p-3 text-[11px] text-muted-foreground">No tickers in scope — loosen the filters above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-card/40 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Ticker" columnKey="ticker" sort={sort} /></th>
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Name" columnKey="name" sort={sort} /></th>
                    {isGlobal && (
                      <th className="text-left px-2 py-1 font-mono"><SortHeader label="Country" columnKey="nation" sort={sort} /></th>
                    )}
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Sector" columnKey="sector" sort={sort} /></th>
                    <th className="text-left px-2 py-1 font-mono"><SortHeader label="Subsector" columnKey="subsector" sort={sort} /></th>
                    {groupBy !== "bucket" && (
                      <th className="text-left px-2 py-1 font-mono"><SortHeader label="Bucket" columnKey="bucket" sort={sort} /></th>
                    )}
                    <th className="text-right px-2 py-1 font-mono" title="3-month median daily $ volume (spike-resistant). Blank = name still on snapshot fallback."><SortHeader label="Median ADV" columnKey="medianMM" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono" title={isGlobal ? "Mean daily $ volume — live nightly where available, else the snapshot figure" : "Mean daily $ volume"}><SortHeader label="Mean ADV" columnKey="meanMM" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono" title="25th-percentile daily $ volume — quiet-tape liquidity"><SortHeader label="P25 ADV" columnKey="p25MM" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono" title="Largest position (% of AUM) this name's ADV supports at your build/exit settings"><SortHeader label="Max pos %" columnKey="maxPosPct" sort={sort} align="right" /></th>
                    <th className="text-right px-2 py-1 font-mono" title="Max position in dollars">Max pos $</th>
                    <th className="text-right px-2 py-1 font-mono" title="Trading days to fully exit a position at this name's bucketed tier size, at the exit participation rate"><SortHeader label="Exit days" columnKey="exitDays" sort={sort} align="right" /></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <GroupRows key={g.key} group={g} groupBy={groupBy} colCount={colCount} bucketName={bucketName} isGlobal={isGlobal} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[9px] text-muted-foreground">
          {isGlobal
            ? `Global mode: a nightly server job pulls fresh Yahoo daily volume for the whole ~9.4k-name universe (close × volume, FX→USD, ${ADV_WINDOW} trading days), so median/mean/p25 re-rank every day. Names Yahoo can't resolve keep the FactSet snapshot mean (blank median column). Manually added symbols fetch live immediately.`
            : `Workbook mode: $ ADV from Yahoo daily bars (close × volume, FX-converted to USD), ${ADV_WINDOW} trading days ≈ 3 months. Server cache refreshes daily, so the buckets re-rank every day. Add off-universe symbols (AAPL, …) via the +Ticker filter.`}
        </p>
      </div>
    </div>
  );
}

// Render cap per group so the ~9.4k-name global universe stays responsive; the
// summary counts and CSV always cover the full filtered set.
const MAX_RENDER_PER_GROUP = 400;

function GroupRows({ group, groupBy, colCount, bucketName, isGlobal }: {
  group: { key: string; label: string; sublabel?: string; rows: Row[] };
  groupBy: "bucket" | "sector" | "flat";
  colCount: number;
  bucketName: (b: number) => string;
  isGlobal: boolean;
}) {
  const shown = group.rows.length > MAX_RENDER_PER_GROUP ? group.rows.slice(0, MAX_RENDER_PER_GROUP) : group.rows;
  return (
    <>
      {groupBy !== "flat" && (
        <tr className="border-t border-border bg-card/60" data-testid={`liqcap-group-${group.key}`}>
          <td colSpan={colCount} className="px-2 py-1 font-bold text-[11px]">
            {group.label}
            {group.sublabel && <span className="ml-2 font-normal text-[10px] text-muted-foreground">{group.sublabel}</span>}
            <span className="ml-2 font-normal text-[10px] text-muted-foreground">· {group.rows.length} name{group.rows.length === 1 ? "" : "s"}</span>
          </td>
        </tr>
      )}
      {shown.map((row) => (
        <tr key={row.ticker} className="border-t border-border hover:bg-card/40" data-testid={`liqcap-row-${row.ticker}`}>
          <td className="px-2 py-1 font-bold">
            <button onClick={() => navigateToTicker(row.ticker)} className="hover:text-primary hover:underline" title="Open in Charts">
              {row.display}
            </button>
            {row.delisted && <span className="ml-1 px-1 rounded text-[9px] bg-muted text-muted-foreground" title="Yahoo reports this symbol as not found / delisted">del</span>}
          </td>
          <td className="px-2 py-1 text-muted-foreground max-w-[180px] truncate">{row.name}</td>
          {isGlobal && <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">{row.nation || "—"}</td>}
          <td className="px-2 py-1 text-muted-foreground">{row.sector}</td>
          <td className="px-2 py-1 text-muted-foreground">{row.subsector}</td>
          {groupBy !== "bucket" && <td className="px-2 py-1">{bucketName(row.bucket)}</td>}
          <td className="px-2 py-1 text-right font-bold">{fmtUsdMM(row.medianMM)}</td>
          <td className="px-2 py-1 text-right text-muted-foreground">{fmtUsdMM(row.meanMM)}</td>
          <td className="px-2 py-1 text-right text-muted-foreground">{fmtUsdMM(row.p25MM)}</td>
          <td className="px-2 py-1 text-right font-bold">{row.maxPosPct == null ? "—" : `${row.maxPosPct.toFixed(2)}%`}</td>
          <td className="px-2 py-1 text-right text-muted-foreground">{fmtUsdMM(row.maxPosMM)}</td>
          <td className="px-2 py-1 text-right">{fmtDays(row.exitDays)}</td>
        </tr>
      ))}
      {shown.length < group.rows.length && (
        <tr className="border-t border-border">
          <td colSpan={colCount} className="px-2 py-1 text-[10px] text-muted-foreground italic" data-testid={`liqcap-truncated-${group.key}`}>
            … {(group.rows.length - shown.length).toLocaleString()} more — narrow the filters or export the CSV for the full list.
          </td>
        </tr>
      )}
    </>
  );
}
