// Valuation Re-Rating — what a multiple becomes after an X% price move, and where
// that sits vs the stock's own history, across the universe, for long/short ranking.
import { useState, useMemo, Fragment } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getMetricTrailing } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, ArrowUpDown, Info, LineChart } from "lucide-react";
import {
  RERATE_METRICS, LOOKBACKS, getRerateMetric, buildRerateRow,
  type RerateRow, type RerateClassification,
} from "@/lib/valuationRerate";

// The six classification levels the table can be grouped by (plus "none").
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

// ── formatting / color helpers ─────────────────────────────────────────────
const fmtMult = (v: number, inverse: boolean) =>
  Number.isFinite(v) ? v.toFixed(inverse ? 2 : 1) : "—";
const fmtPctile = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "—");
const fmtMove = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` : "—";
const fmtZ = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}` : "—");
const median = (nums: number[]): number => {
  const v = nums.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

// cheap → green, rich → red, depending on the metric's orientation
function cheapnessColor(pctile: number, lowIsCheap: boolean): string {
  if (!Number.isFinite(pctile)) return "text-muted-foreground";
  const cheap = lowIsCheap ? 100 - pctile : pctile; // 100 = cheapest
  if (cheap >= 70) return "text-emerald-400";
  if (cheap >= 45) return "text-amber-400";
  return "text-red-400";
}
const moveColor = (v: number) =>
  !Number.isFinite(v) ? "text-muted-foreground" : v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-muted-foreground";

type SortCol =
  | "ticker" | "m0" | "nowPctile" | "nowZ" | "proForma" | "proFormaPctile"
  | "proFormaZ" | "toMedian" | "toRich" | "toCheap" | "rr";

const sortValue = (r: RerateRow, col: SortCol): number | string => {
  switch (col) {
    case "ticker": return r.ticker;
    case "rr": {
      const up = r.toRich, dn = Math.abs(r.toCheap);
      return dn > 0 && Number.isFinite(up) ? up / dn : -Infinity;
    }
    default: return (r as any)[col] ?? -Infinity;
  }
};

export default function ValuationReRating() {
  const [, setLocation] = useLocation();
  const { filteredTickersList } = useUniverse();
  const [metricKey, setMetricKey] = useState("P/FFO FY2");
  const [pctMove, setPctMove] = useState(20);
  const [lookbackDays, setLookbackDays] = useState(1260);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("toRich");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupBy, setGroupBy] = useState<GroupLevel>("none");

  const metric = getRerateMetric(metricKey);
  const tickers = useMemo(
    () => filteredTickersList.map((t) => ({
      ticker: t.ticker, name: t.name,
      economy: t.economy, sector: t.sector, subsector: t.subsector,
      industryGroup: t.industryGroup, industry: t.industry, subindustry: t.subindustry,
    })),
    [filteredTickersList],
  );
  const tickerKey = useMemo(() => tickers.map((t) => t.ticker).sort().join(","), [tickers]);

  // Fetch each ticker's trailing multiple history (batched), keyed on metric+lookback+set.
  const { data: trailingMap = {}, isLoading } = useQuery({
    queryKey: ["rerate-trailing", metricKey, lookbackDays, tickerKey],
    queryFn: async () => {
      const map: Record<string, number[]> = {};
      const batchSize = 15;
      for (let b = 0; b < tickers.length; b += batchSize) {
        const batch = tickers.slice(b, b + batchSize);
        const results = await Promise.all(
          batch.map(async (t) => ({ ticker: t.ticker, vals: await getMetricTrailing(t.ticker, metricKey, lookbackDays) })),
        );
        for (const r of results) map[r.ticker] = r.vals;
      }
      return map;
    },
    enabled: tickers.length > 0,
  });

  const rows = useMemo(() => {
    const out: RerateRow[] = [];
    for (const t of tickers) {
      const trailing = trailingMap[t.ticker];
      if (!trailing) continue;
      const row = buildRerateRow(t, trailing, pctMove, metric);
      if (row) out.push(row);
    }
    return out;
  }, [tickers, trailingMap, pctMove, metric]);

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    let r = q ? rows.filter((x) => x.ticker.includes(q) || x.name.toUpperCase().includes(q)) : rows;
    r = [...r].sort((a, b) => {
      const av = sortValue(a, sortCol), bv = sortValue(b, sortCol);
      let cmp = typeof av === "string" || typeof bv === "string"
        ? String(av).localeCompare(String(bv))
        : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [rows, search, sortCol, sortDir]);

  // When grouping, partition the already-sorted rows by the chosen classification
  // (rows keep their sort order within each group; groups are ordered A→Z).
  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, RerateRow[]>();
    for (const r of visible) {
      const key = (r[groupBy as keyof RerateClassification] as string) || "—";
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, groupBy]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir(col === "ticker" ? "asc" : "desc"); }
  };

  const SortIcon = ({ col }: { col: SortCol }) =>
    sortCol !== col ? <ArrowUpDown className="w-3 h-3 inline opacity-40" />
      : sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline" /> : <ArrowDown className="w-3 h-3 inline" />;

  const Th = ({ col, label, title }: { col: SortCol; label: string; title?: string }) => (
    <th
      className="px-2 py-1 text-right whitespace-nowrap cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(col)}
      title={title}
    >
      {label} <SortIcon col={col} />
    </th>
  );

  // Stash the row's ticker + current multiple/lookback and jump to the Charts
  // tab, which builds the 5-pane re-rating analysis on mount.
  const openInCharts = (ticker: string) => {
    try {
      sessionStorage.setItem(
        "reit-viz:rerate-to-charts",
        JSON.stringify({ ticker, metricKey, lookbackDays }),
      );
    } catch {}
    setLocation("/");
  };

  const renderRow = (r: RerateRow) => {
    const rr = Math.abs(r.toCheap) > 0 && Number.isFinite(r.toRich) ? r.toRich / Math.abs(r.toCheap) : NaN;
    return (
      <tr key={r.ticker} className="border-b border-border/40 hover:bg-muted/30">
        <td className="px-1 py-1 text-center">
          <button
            type="button"
            onClick={() => openInCharts(r.ticker)}
            title={`Chart ${r.ticker} — ${metricKey} with percentile, z-score & reward:risk over time`}
            className="text-muted-foreground hover:text-foreground"
          >
            <LineChart className="w-3.5 h-3.5" />
          </button>
        </td>
        <td className="px-2 py-1 text-left font-semibold" title={`${r.name} · ${r.sector}`}>{r.ticker}</td>
        <td className="px-2 py-1 text-right">{fmtMult(r.m0, metric.dir === "inverse")}</td>
        <td className={`px-2 py-1 text-right ${cheapnessColor(r.nowPctile, metric.lowIsCheap)}`}>{fmtPctile(r.nowPctile)}</td>
        <td className="px-2 py-1 text-right text-muted-foreground">{fmtZ(r.nowZ)}</td>
        <td className="px-2 py-1 text-right">{fmtMult(r.proForma, metric.dir === "inverse")}</td>
        <td className={`px-2 py-1 text-right ${cheapnessColor(r.proFormaPctile, metric.lowIsCheap)}`}>{fmtPctile(r.proFormaPctile)}</td>
        <td className="px-2 py-1 text-right text-muted-foreground">{fmtZ(r.proFormaZ)}</td>
        <td className={`px-2 py-1 text-right ${moveColor(r.toMedian)}`}>{fmtMove(r.toMedian)}</td>
        <td className={`px-2 py-1 text-right ${moveColor(r.toRich)}`}>{fmtMove(r.toRich)}</td>
        <td className={`px-2 py-1 text-right ${moveColor(r.toCheap)}`}>{fmtMove(r.toCheap)}</td>
        <td className="px-2 py-1 text-right text-muted-foreground">{Number.isFinite(rr) ? rr.toFixed(2) : "—"}</td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls */}
      <div className="flex items-end gap-3 flex-wrap px-3 py-2 border-b border-border bg-card flex-shrink-0">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Multiple</div>
          <Select value={metricKey} onValueChange={setMetricKey}>
            <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RERATE_METRICS.map((m) => (
                <SelectItem key={m.key} value={m.key} className="text-xs">{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Price move %</div>
          <Input
            type="number" value={pctMove}
            onChange={(e) => setPctMove(Number(e.target.value))}
            className="h-7 w-24 text-xs" step={5}
          />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">History</div>
          <Select value={String(lookbackDays)} onValueChange={(v) => setLookbackDays(Number(v))}>
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOOKBACKS.map((l) => (
                <SelectItem key={l.days} value={String(l.days)} className="text-xs">{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Group by</div>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupLevel)}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GROUP_LEVELS.map((g) => (
                <SelectItem key={g.value} value={g.value} className="text-xs">{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[120px]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Search</div>
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ticker / name" className="h-7 text-xs max-w-[220px]"
          />
        </div>
        <div className="text-[11px] text-muted-foreground ml-auto self-center">
          {visible.length} names
        </div>
      </div>

      {/* Explainer */}
      <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border flex items-start gap-1.5">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          <b>Pro-forma</b> = the multiple if price moves {fmtMove(pctMove)}, with its percentile/z vs the stock's own {LOOKBACKS.find((l) => l.days === lookbackDays)?.label ?? ""} history.
          {" "}<b>→Median / ↑Rich / ↓Cheap</b> = implied % price move to re-rate to that historical level — your upside/downside room.
          {metric.approx && <em className="text-amber-400"> EV/EBITDA assumes EV moves with equity (ignores leverage) — approximate.</em>}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-card z-10 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-1 py-1 w-7" title="Open in Charts" />
              <th className="px-2 py-1 text-left cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("ticker")}>
                Ticker <SortIcon col="ticker" />
              </th>
              <Th col="m0" label="Now" title="Current multiple" />
              <Th col="nowPctile" label="%ile" title="Where the current multiple sits in its history (0=low, 100=high)" />
              <Th col="nowZ" label="z" title="Current multiple z-score vs history" />
              <Th col="proForma" label={`@${fmtMove(pctMove)}`} title={`Pro-forma multiple after a ${fmtMove(pctMove)} price move`} />
              <Th col="proFormaPctile" label="%ile" title="Pro-forma multiple's historical percentile" />
              <Th col="proFormaZ" label="z" title="Pro-forma multiple z-score" />
              <Th col="toMedian" label="→Med" title="Implied % price move to re-rate to the historical median multiple" />
              <Th col="toRich" label="↑Rich" title="Implied % move to re-rate to the rich end of history (upside room)" />
              <Th col="toCheap" label="↓Cheap" title="Implied % move to re-rate to the cheap end of history (downside risk)" />
              <Th col="rr" label="R:R" title="Reward/risk = upside ÷ |downside|" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && visible.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-6 text-center text-muted-foreground">No data for the selected multiple / universe.</td></tr>
            )}
            {!isLoading && !grouped && visible.map(renderRow)}
            {!isLoading && grouped && grouped.map(([groupName, groupRows]) => (
              <Fragment key={groupName}>
                <tr className="bg-muted/40 border-y border-border sticky">
                  <td colSpan={12} className="px-2 py-1 text-left text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">
                    {groupName}
                    <span className="text-muted-foreground font-normal normal-case"> · {groupRows.length}</span>
                    <span className="text-muted-foreground font-normal normal-case">
                      {" "}· median {fmtMult(median(groupRows.map((r) => r.m0)), metric.dir === "inverse")}
                    </span>
                  </td>
                </tr>
                {groupRows.map(renderRow)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
