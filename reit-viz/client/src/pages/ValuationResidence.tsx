// Valuation Residence — how much of its history a name's multiple has spent at
// each percentile, how rare its current / pro-forma level is, how persistently
// it visits the rich & cheap extremes, and the forward return that followed.
import { useState, useMemo, Fragment } from "react";
import { useLocation } from "wouter";
import { useSessionState } from "@/lib/sessionState";
import { useQuery } from "@tanstack/react-query";
import { getMetricSeries } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, ArrowUpDown, Info, LineChart, X } from "lucide-react";
import { LOOKBACKS, getRerateMetric, type RerateMetric } from "@/lib/valuationRerate";
import RerateMetricPicker from "@/components/RerateMetricPicker";
import {
  buildResidence, RESIDENCE_BAND_LABELS, type ResidenceResult, type PctBasis,
} from "@/lib/percentileResidence";

const HORIZONS = [
  { days: 21, label: "1M" },
  { days: 63, label: "3M" },
  { days: 126, label: "6M" },
];

const GROUP_LEVELS = [
  { value: "none", label: "No grouping" },
  { value: "economy", label: "Economy" },
  { value: "sector", label: "Sector" },
  { value: "subsector", label: "Subsector" },
  { value: "industryGroup", label: "Industry Group" },
  { value: "industry", label: "Industry" },
  { value: "subindustry", label: "Subindustry" },
] as const;
type GroupLevel = typeof GROUP_LEVELS[number]["value"];

// The six classification levels offered as filter dropdowns, coarse → fine.
const CLASS_FILTER_DEFS = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Ind. Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
] as const;
const DEFAULT_CLASS_FILTERS: Record<string, string> = Object.fromEntries(CLASS_FILTER_DEFS.map((d) => [d.key, "all"]));

const CLASS_KEYS = ["economy", "sector", "subsector", "industryGroup", "industry", "subindustry"] as const;

type TickerMetaLite = {
  ticker: string; name: string;
  economy: string; sector: string; subsector: string;
  industryGroup: string; industry: string; subindustry: string;
};
type Row = ResidenceResult & TickerMetaLite;
// One table row per ticker, holding a computed residence Row per selected metric.
type MultiRow = { meta: TickerMetaLite; byMetric: Record<string, Row> };

const fmtPct = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "—");
const fmtRet = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—");
const fmtNum = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "—");

// rich = expensive = red, cheap = green
const richColor = (r: number) =>
  !Number.isFinite(r) ? "text-muted-foreground" : r >= 75 ? "text-red-400" : r >= 40 ? "text-amber-400" : "text-emerald-400";
const retColor = (v: number) =>
  !Number.isFinite(v) ? "text-muted-foreground" : v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-muted-foreground";

// Forward-return tails with fewer than this many (overlapping) day-observations
// are statistically thin — we dim + mark them and sink them in fwd-column sorts.
const MIN_TAIL_N = 60;

// 6-band occupancy bar, cheap (green) → rich (red)
const BAND_COLORS = ["#34d399", "#6ee7b7", "#fcd34d", "#fbbf24", "#f87171", "#ef4444"];
function OccupancyBar({ residence }: { residence: number[] }) {
  return (
    <div className="flex h-3 w-28 rounded-sm overflow-hidden border border-border/40" title={residence.map((p, i) => `${RESIDENCE_BAND_LABELS[i]}: ${p.toFixed(0)}%`).join("  ·  ")}>
      {residence.map((p, i) => (
        <div key={i} style={{ width: `${p}%`, backgroundColor: BAND_COLORS[i] }} />
      ))}
    </div>
  );
}

type SortCol =
  | "ticker" | "currentRich" | "proFormaRich" | "proFormaFreqRicher"
  | "richPctTime" | "cheapPctTime" | "richCount" | "cheapCount" | "fwdRich" | "fwdCheap" | "edge";

export default function ValuationResidence() {
  const [, setLocation] = useLocation();
  const { filteredTickersList } = useUniverse();
  // View controls persist across tab switches / reloads within a session
  // (sessionStorage) — they reset when the browser session ends.
  // Multi-select: the table shows a full residence stat group per selected metric.
  const [metricKeys, setMetricKeys] = useSessionState<string[]>("residence:metrics", ["P/FFO FY2"]);
  const [basis, setBasis] = useSessionState<PctBasis>("residence:basis", "trailing");
  const [lookbackDays, setLookbackDays] = useSessionState("residence:lookback", 1260);
  const [pctMove, setPctMove] = useSessionState("residence:pctMove", 20);
  const [horizon, setHorizon] = useSessionState("residence:horizon", 63);
  const [search, setSearch] = useState("");
  const [classFilters, setClassFilters] = useSessionState<Record<string, string>>("residence:classFilters", DEFAULT_CLASS_FILTERS);
  // Changing a coarser level resets the finer ones (they may no longer apply).
  const setClassFilter = (key: string, value: string) => {
    const idx = CLASS_FILTER_DEFS.findIndex((d) => d.key === key);
    setClassFilters((prev) => {
      const next = { ...prev, [key]: value };
      for (let i = idx + 1; i < CLASS_FILTER_DEFS.length; i++) next[CLASS_FILTER_DEFS[i].key] = "all";
      return next;
    });
  };
  const [groupBy, setGroupBy] = useSessionState<GroupLevel>("residence:groupBy", "none");
  const [sortCol, setSortCol] = useSessionState<SortCol>("residence:sortCol", "currentRich");
  const [sortMetric, setSortMetric] = useSessionState<string | null>("residence:sortMetric", null);
  const [sortDir, setSortDir] = useSessionState<"asc" | "desc">("residence:sortDir", "desc");
  const [detail, setDetail] = useState<{ row: Row; metric: RerateMetric } | null>(null);

  const setMetrics = (keys: string[]) => setMetricKeys(keys.length ? keys : metricKeys);
  const removeMetric = (key: string) =>
    setMetricKeys(metricKeys.length > 1 ? metricKeys.filter((k) => k !== key) : metricKeys);
  const metrics = useMemo(() => metricKeys.map((k) => getRerateMetric(k)), [metricKeys]);
  const effSortMetric = sortMetric && metricKeys.includes(sortMetric) ? sortMetric : metricKeys[0];
  const tickers = useMemo(
    () => filteredTickersList.map((t) => ({
      ticker: t.ticker, name: t.name,
      economy: t.economy, sector: t.sector, subsector: t.subsector,
      industryGroup: t.industryGroup, industry: t.industry, subindustry: t.subindustry,
    })),
    [filteredTickersList],
  );
  const tickerKey = useMemo(() => tickers.map((t) => t.ticker).sort().join(","), [tickers]);

  // Cascading options for each classification dropdown: each level's choices are
  // the distinct values present under the coarser selections above it.
  const classOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    CLASS_FILTER_DEFS.forEach((d, i) => {
      const coarser = CLASS_FILTER_DEFS.slice(0, i);
      const pool = tickers.filter((t) =>
        coarser.every((c) => classFilters[c.key] === "all" || (t as any)[c.key] === classFilters[c.key]));
      out[d.key] = ["all", ...Array.from(new Set(pool.map((t) => (t as any)[d.key]).filter(Boolean))).sort()];
    });
    return out;
  }, [tickers, classFilters]);

  const metricsSig = metricKeys.join("|");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["residence-multi", metricsSig, basis, lookbackDays, pctMove, tickerKey],
    queryFn: async () => {
      const out: MultiRow[] = [];
      const batchSize = 12;
      for (let b = 0; b < tickers.length; b += batchSize) {
        const batch = tickers.slice(b, b + batchSize);
        const results = await Promise.all(batch.map(async (t) => {
          // Close is metric-independent — fetch once and reuse across metrics.
          const close = await getMetricSeries(t.ticker, "close").catch(() => []);
          const byMetric: Record<string, Row> = {};
          for (const mk of metricKeys) {
            const m = getRerateMetric(mk);
            const mult = await getMetricSeries(t.ticker, mk).catch(() => []);
            const res = buildResidence(mult, close, {
              basis, window: lookbackDays, pctMove,
              dir: m.dir, lowIsCheap: m.lowIsCheap,
              horizons: HORIZONS.map((h) => h.days),
              skipFirstYear: true,
            });
            if (res) byMetric[mk] = { ...res, ...t } as Row;
          }
          return Object.keys(byMetric).length ? { meta: t, byMetric } : null;
        }));
        for (const r of results) if (r) out.push(r);
      }
      return out;
    },
    enabled: tickers.length > 0 && metricKeys.length > 0,
  });

  const FWD_COLS = new Set<SortCol>(["fwdRich", "fwdCheap", "edge"]);
  // Which tail's sample backs this column (fwdCheap → cheap tail; else rich tail).
  const tailReliable = (r: Row | undefined, col: SortCol): boolean => {
    const f = r?.fwd[horizon];
    if (!f) return false;
    return (col === "fwdCheap" ? f.cheap.n : f.rich.n) >= MIN_TAIL_N;
  };

  // Sort reads the stat from the row's currently-sorted metric.
  const sortValue = (row: MultiRow, col: SortCol): number | string => {
    if (col === "ticker") return row.meta.ticker;
    const r = row.byMetric[effSortMetric];
    if (!r) return -Infinity;
    switch (col) {
      case "fwdRich": return r.fwd[horizon]?.rich.median ?? -Infinity;
      case "fwdCheap": return r.fwd[horizon]?.cheap.median ?? -Infinity;
      case "edge": {
        const f = r.fwd[horizon];
        return f ? f.rich.median - f.base.median : -Infinity;
      }
      default: return (r as any)[col] ?? -Infinity;
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    let r = rows.filter((x) =>
      CLASS_FILTER_DEFS.every((d) => classFilters[d.key] === "all" || (x.meta as any)[d.key] === classFilters[d.key]));
    if (q) r = r.filter((x) => x.meta.ticker.includes(q) || x.meta.name.toUpperCase().includes(q));
    r = [...r].sort((a, b) => {
      // Keep low-sample tails out of the top of a forward-return sort (both directions).
      if (FWD_COLS.has(sortCol)) {
        const ra = tailReliable(a.byMetric[effSortMetric], sortCol), rb = tailReliable(b.byMetric[effSortMetric], sortCol);
        if (ra !== rb) return ra ? -1 : 1;
      }
      const av = sortValue(a, sortCol), bv = sortValue(b, sortCol);
      const cmp = typeof av === "string" || typeof bv === "string"
        ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [rows, search, sortCol, effSortMetric, sortDir, horizon, classFilters]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, MultiRow[]>();
    for (const r of visible) {
      const key = (r.meta[groupBy as typeof CLASS_KEYS[number]] as string) || "—";
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, groupBy]);

  // Sort targets a (metric, stat) pair; metricKey null → the shared Ticker column.
  const isActiveSort = (col: SortCol, metricKey: string | null) =>
    sortCol === col && (col === "ticker" || (metricKey ?? metricKeys[0]) === effSortMetric);
  const toggleSort = (col: SortCol, metricKey: string | null) => {
    if (isActiveSort(col, metricKey)) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortMetric(metricKey); setSortDir(col === "ticker" ? "asc" : "desc"); }
  };
  const SortIcon = ({ col, metricKey }: { col: SortCol; metricKey: string | null }) =>
    !isActiveSort(col, metricKey) ? <ArrowUpDown className="w-3 h-3 inline opacity-40" />
      : sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />;
  const Th = ({ col, label, title, metricKey, sep }: { col: SortCol; label: string; title?: string; metricKey: string; sep?: boolean }) => (
    <th className={`px-2 py-1 text-right whitespace-nowrap cursor-pointer hover:text-foreground select-none ${sep ? "border-l border-border/60" : ""}`}
      onClick={() => toggleSort(col, metricKey)} title={title}>
      {label} <SortIcon col={col} metricKey={metricKey} />
    </th>
  );

  const hLabel = HORIZONS.find((h) => h.days === horizon)?.label ?? "";

  // The 11 stat headers (incl. occupancy) for one metric's column group.
  const metricHeaderCells = (m: RerateMetric) => (
    <>
      <Th col="currentRich" label="Now" title="Current richness percentile (100 = most expensive)" metricKey={m.key} sep />
      <Th col="proFormaRich" label={`+${pctMove}%`} title="Pro-forma richness percentile after the price move" metricKey={m.key} />
      <Th col="proFormaFreqRicher" label="Seen%" title="% of history at least as rich as the pro-forma level (low = rare/unprecedented)" metricKey={m.key} />
      <Th col="richPctTime" label="≥90%" title="% of history spent in the rich tail (≥90th richness)" metricKey={m.key} />
      <Th col="cheapPctTime" label="≤10%" title="% of history spent in the cheap tail (≤10th richness)" metricKey={m.key} />
      <Th col="richCount" label="Runs≥90" title="Distinct visits to the rich tail (median run length)" metricKey={m.key} />
      <Th col="cheapCount" label="Runs≤10" title="Distinct visits to the cheap tail (median run length)" metricKey={m.key} />
      <Th col="fwdRich" label="Fwd@90" title={`Median ${hLabel} forward return when rich (≥90)`} metricKey={m.key} />
      <Th col="fwdCheap" label="Fwd@10" title={`Median ${hLabel} forward return when cheap (≤10)`} metricKey={m.key} />
      <Th col="edge" label="Edge" title="Rich-tail forward return minus unconditional baseline" metricKey={m.key} />
      <th className="px-2 py-1 text-left">Occ.</th>
    </>
  );

  const openInCharts = (ticker: string) => {
    try {
      sessionStorage.setItem("reit-viz:rerate-to-charts",
        JSON.stringify({ ticker, metricKey: effSortMetric, lookbackDays }));
    } catch {}
    setLocation("/");
  };

  // Frozen left columns so the ticker stays visible while scrolling metrics.
  const STICKY0 = "sticky left-0 bg-card z-10";
  const STICKY1 = "sticky left-7 bg-card z-10";
  const totalCols = 2 + metrics.length * 11;

  const lowMark = <span className="text-[8px] align-super text-amber-400/70">*</span>;
  // The 11 cells (10 stats + occupancy) for one ticker × one metric. Clicking any
  // cell opens that metric's detail modal. Blank when the ticker lacks history.
  const renderMetricCells = (r: Row | undefined, m: RerateMetric) => {
    if (!r) return (
      <>
        {Array.from({ length: 11 }).map((_, i) => (
          <td key={i} className={`px-2 py-1 text-right text-muted-foreground/40 ${i === 0 ? "border-l border-border/60" : ""}`}>—</td>
        ))}
      </>
    );
    const f = r.fwd[horizon];
    const edge = f ? f.rich.median - f.base.median : NaN;
    const richLow = !f || f.rich.n < MIN_TAIL_N;
    const cheapLow = !f || f.cheap.n < MIN_TAIL_N;
    const onCell = () => setDetail({ row: r, metric: m });
    const cls = "px-2 py-1 text-right cursor-pointer";
    return (
      <>
        <td onClick={onCell} className={`${cls} border-l border-border/60 ${richColor(r.currentRich)}`}>{fmtPct(r.currentRich)}</td>
        <td onClick={onCell} className={`${cls} ${richColor(r.proFormaRich)}`}>
          {fmtPct(r.proFormaRich)}{r.proFormaUnprecedented && <span className="ml-1 text-[9px] text-red-400 font-bold">ATH</span>}
        </td>
        <td onClick={onCell} className={`${cls} text-muted-foreground`}>{fmtPct(r.proFormaFreqRicher)}</td>
        <td onClick={onCell} className={`${cls} text-red-400/80`}>{fmtPct(r.richPctTime)}</td>
        <td onClick={onCell} className={`${cls} text-emerald-400/80`}>{fmtPct(r.cheapPctTime)}</td>
        <td onClick={onCell} className={`${cls} text-muted-foreground`}>
          {fmtNum(r.richCount)}{Number.isFinite(r.richMedDur) ? <span className="text-muted-foreground/50"> ({fmtNum(r.richMedDur)}d)</span> : null}
        </td>
        <td onClick={onCell} className={`${cls} text-muted-foreground`}>
          {fmtNum(r.cheapCount)}{Number.isFinite(r.cheapMedDur) ? <span className="text-muted-foreground/50"> ({fmtNum(r.cheapMedDur)}d)</span> : null}
        </td>
        <td onClick={onCell} className={`${cls} ${retColor(f?.rich.median ?? NaN)} ${richLow ? "opacity-40" : ""}`} title={f ? `n=${f.rich.n} days${richLow ? " — low sample" : ""}` : ""}>{fmtRet(f?.rich.median ?? NaN)}{richLow && f ? lowMark : null}</td>
        <td onClick={onCell} className={`${cls} ${retColor(f?.cheap.median ?? NaN)} ${cheapLow ? "opacity-40" : ""}`} title={f ? `n=${f.cheap.n} days${cheapLow ? " — low sample" : ""}` : ""}>{fmtRet(f?.cheap.median ?? NaN)}{cheapLow && f ? lowMark : null}</td>
        <td onClick={onCell} className={`${cls} ${retColor(edge)} ${richLow ? "opacity-40" : ""}`} title="rich-tail median forward return minus the unconditional baseline">{fmtRet(edge)}{richLow && f ? lowMark : null}</td>
        <td onClick={onCell} className="px-2 py-1 cursor-pointer"><OccupancyBar residence={r.residence} /></td>
      </>
    );
  };

  const renderRow = (row: MultiRow) => (
    <tr key={row.meta.ticker} className="border-b border-border/40 hover:bg-muted/30">
      <td className={`px-1 py-1 text-center ${STICKY0}`}>
        <button type="button" onClick={() => openInCharts(row.meta.ticker)}
          title={`Chart ${row.meta.ticker} — ${effSortMetric} percentile over time`}
          className="text-muted-foreground hover:text-foreground">
          <LineChart className="w-3.5 h-3.5" />
        </button>
      </td>
      <td className={`px-2 py-1 text-left font-semibold ${STICKY1}`} title={`${row.meta.name} · ${row.meta.sector}`}>{row.meta.ticker}</td>
      {metricKeys.map((mk, i) => (
        <Fragment key={mk}>{renderMetricCells(row.byMetric[mk], metrics[i])}</Fragment>
      ))}
    </tr>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Multiples</div>
          <RerateMetricPicker selected={metricKeys} onChange={setMetrics} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Basis</div>
          <Select value={basis} onValueChange={(v) => setBasis(v as PctBasis)}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="trailing" className="text-xs">Trailing</SelectItem>
              <SelectItem value="expanding" className="text-xs">Expanding</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className={basis === "trailing" ? "" : "opacity-40 pointer-events-none"}>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">History</div>
          <Select value={String(lookbackDays)} onValueChange={(v) => setLookbackDays(Number(v))}>
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOOKBACKS.map((l) => <SelectItem key={l.days} value={String(l.days)} className="text-xs">{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Price move %</div>
          <Input type="number" value={pctMove} onChange={(e) => setPctMove(Number(e.target.value))} className="h-7 w-20 text-xs" step={5} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Fwd horizon</div>
          <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HORIZONS.map((h) => <SelectItem key={h.days} value={String(h.days)} className="text-xs">{h.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {CLASS_FILTER_DEFS.map((d) => (
          <div key={d.key}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{d.label}</div>
            <Select value={classFilters[d.key]} onValueChange={(v) => setClassFilter(d.key, v)}>
              <SelectTrigger className={`h-7 w-32 text-xs ${classFilters[d.key] !== "all" ? "border-primary/60 text-primary" : ""}`}><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {classOptions[d.key].map((s) => <SelectItem key={s} value={s} className="text-xs">{s === "all" ? "All" : s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Group by</div>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupLevel)}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GROUP_LEVELS.map((g) => <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[120px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Search</div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ticker / name" className="h-7 text-xs max-w-[220px]" />
        </div>
        <div className="text-[11px] text-muted-foreground ml-auto self-center">{visible.length} names</div>
      </div>

      {/* Explainer */}
      <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border flex items-start gap-1.5">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          Percentiles are <b>richness</b> (100 = most expensive ever, 0 = cheapest), as-of each date ({basis === "trailing" ? `trailing ${LOOKBACKS.find((l) => l.days === lookbackDays)?.label}` : "expanding / all history"}).
          {" "}<b>+{pctMove}%</b> = pro-forma richness after the move (<b>ATH</b> = never been this rich). <b>Fwd@90 / Fwd@10</b> = median {hLabel} forward price return on days the multiple was in the rich (≥90) / cheap (≤10) tail; <b>Edge</b> = rich-tail minus the unconditional baseline. Forward returns are price-only and use overlapping windows; <b className="text-amber-400/80">dimmed values (*)</b> have fewer than {MIN_TAIL_N} tail days — low confidence, and they sink to the bottom when you sort by a forward-return column.
        </span>
      </div>

      {/* Table — one full residence stat group per selected metric, horizontally scrollable */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full text-xs font-mono">
          <thead className="sticky top-0 bg-card z-10 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className={`px-1 py-1 w-7 ${STICKY0} z-20`} rowSpan={2} />
              <th className={`px-2 py-1 text-left cursor-pointer hover:text-foreground select-none ${STICKY1} z-20`} onClick={() => toggleSort("ticker", null)} rowSpan={2}>Ticker <SortIcon col="ticker" metricKey={null} /></th>
              {metrics.map((m, i) => (
                <th key={m.key} colSpan={11} className={`px-2 py-1 text-center normal-case ${i > 0 ? "border-l border-border/60" : ""}`}>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground/80">
                    {m.label}
                    {metricKeys.length > 1 && (
                      <button type="button" onClick={() => removeMetric(m.key)} title={`Remove ${m.label}`} className="opacity-40 hover:opacity-100 hover:text-red-400 leading-none">×</button>
                    )}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {metrics.map((m) => <Fragment key={m.key}>{metricHeaderCells(m)}</Fragment>)}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={totalCols} className="px-3 py-6 text-center text-muted-foreground">Computing residence across the universe…</td></tr>}
            {!isLoading && visible.length === 0 && <tr><td colSpan={totalCols} className="px-3 py-6 text-center text-muted-foreground">No data for the selected multiples / universe.</td></tr>}
            {!isLoading && !grouped && visible.map(renderRow)}
            {!isLoading && grouped && grouped.map(([name, gr]) => (
              <Fragment key={name}>
                <tr className="bg-muted/40 border-y border-border">
                  <td colSpan={totalCols} className={`px-2 py-1 text-left text-[11px] font-semibold text-foreground/80 uppercase tracking-wider ${STICKY0}`}>
                    {name}<span className="text-muted-foreground font-normal normal-case"> · {gr.length}</span>
                  </td>
                </tr>
                {gr.map(renderRow)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (() => { const d = detail.row; return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between px-4 py-3 border-b border-border">
              <div>
                <div className="text-sm font-semibold">{d.ticker} <span className="text-muted-foreground font-normal">· {d.name}</span></div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{detail.metric.label} · {basis === "trailing" ? `trailing ${LOOKBACKS.find((l) => l.days === lookbackDays)?.label}` : "expanding history"} · {d.n.toLocaleString()} obs</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { openInCharts(d.ticker); }} className="text-[11px] px-2 py-1 rounded bg-muted hover:bg-muted/70 flex items-center gap-1" title="Open in Charts">
                  <LineChart className="w-3 h-3" /> Chart
                </button>
                <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Now / pro-forma / rarity */}
            <div className="grid grid-cols-3 gap-2 px-4 py-3 text-xs">
              <div><div className="text-[10px] uppercase text-muted-foreground">Now (richness)</div><div className={`text-lg font-mono ${richColor(d.currentRich)}`}>{fmtPct(d.currentRich)}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">After +{pctMove}%</div><div className={`text-lg font-mono ${richColor(d.proFormaRich)}`}>{fmtPct(d.proFormaRich)}{d.proFormaUnprecedented && <span className="ml-1 text-[10px] text-red-400 font-bold align-middle">ATH</span>}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Seen this rich</div><div className="text-lg font-mono text-muted-foreground">{fmtPct(d.proFormaFreqRicher)}%<span className="text-[10px]"> of history</span></div></div>
            </div>

            {/* Occupancy */}
            <div className="px-4 pb-3">
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Time spent by richness band</div>
              <div className="flex h-5 w-full rounded overflow-hidden border border-border/40">
                {d.residence.map((p, i) => (
                  <div key={i} style={{ width: `${p}%`, backgroundColor: BAND_COLORS[i] }} className="flex items-center justify-center" title={`${RESIDENCE_BAND_LABELS[i]}: ${p.toFixed(1)}%`}>
                    {p >= 8 && <span className="text-[8px] text-black/70 font-bold">{p.toFixed(0)}%</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5"><span>cheap (0)</span><span>rich (100)</span></div>
              <div className="text-[11px] text-muted-foreground mt-2">
                Rich tail (≥90): <b className="text-red-400/90">{fmtPct(d.richPctTime)}%</b> of time over <b>{fmtNum(d.richCount)}</b> visits (median {fmtNum(d.richMedDur)}d).
                {" "}Cheap tail (≤10): <b className="text-emerald-400/90">{fmtPct(d.cheapPctTime)}%</b> over <b>{fmtNum(d.cheapCount)}</b> visits (median {fmtNum(d.cheapMedDur)}d).
              </div>
            </div>

            {/* Forward returns across horizons */}
            <div className="px-4 pb-4">
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Forward price return by horizon (median · hit-rate · n days)</div>
              <table className="w-full text-[11px] font-mono">
                <thead className="text-[9px] uppercase text-muted-foreground border-b border-border">
                  <tr><th className="text-left py-1">Horizon</th><th className="text-right">Rich (≥90)</th><th className="text-right">Cheap (≤10)</th><th className="text-right">Baseline</th><th className="text-right">Edge (rich−base)</th></tr>
                </thead>
                <tbody>
                  {HORIZONS.map((h) => {
                    const f = d.fwd[h.days];
                    if (!f) return null;
                    const edge = f.rich.median - f.base.median;
                    const rLow = f.rich.n < MIN_TAIL_N, cLow = f.cheap.n < MIN_TAIL_N;
                    return (
                      <tr key={h.days} className="border-b border-border/30">
                        <td className="text-left py-1 text-muted-foreground">{h.label}</td>
                        <td className={`text-right ${retColor(f.rich.median)} ${rLow ? "opacity-40" : ""}`} title={rLow ? "low sample" : ""}>{fmtRet(f.rich.median)} · {fmtPct(f.rich.hitRate)}% · {f.rich.n}{rLow ? "*" : ""}</td>
                        <td className={`text-right ${retColor(f.cheap.median)} ${cLow ? "opacity-40" : ""}`} title={cLow ? "low sample" : ""}>{fmtRet(f.cheap.median)} · {fmtPct(f.cheap.hitRate)}% · {f.cheap.n}{cLow ? "*" : ""}</td>
                        <td className={`text-right ${retColor(f.base.median)}`}>{fmtRet(f.base.median)} · {f.base.n}</td>
                        <td className={`text-right ${retColor(edge)} ${rLow ? "opacity-40" : ""}`}>{fmtRet(edge)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-[10px] text-muted-foreground mt-1.5">Forward returns are price-only and use overlapping windows — read n as days, not independent samples. Dimmed rows (*) have fewer than {MIN_TAIL_N} tail days. A negative Edge means being rich preceded under-performance (mean reversion).</div>
            </div>
          </div>
        </div>
      ); })()}
    </div>
  );
}
