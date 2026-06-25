// Valuation Residence — how much of its history a name's multiple has spent at
// each percentile, how rare its current / pro-forma level is, how persistently
// it visits the rich & cheap extremes, and the forward return that followed.
import { useState, useMemo, Fragment } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getMetricSeries } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, ArrowUpDown, Info, LineChart, X } from "lucide-react";
import { RERATE_METRICS, LOOKBACKS, getRerateMetric } from "@/lib/valuationRerate";
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

const CLASS_KEYS = ["economy", "sector", "subsector", "industryGroup", "industry", "subindustry"] as const;

type Row = ResidenceResult & {
  ticker: string; name: string;
  economy: string; sector: string; subsector: string;
  industryGroup: string; industry: string; subindustry: string;
};

const fmtPct = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "—");
const fmtRet = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "—");
const fmtNum = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "—");

// rich = expensive = red, cheap = green
const richColor = (r: number) =>
  !Number.isFinite(r) ? "text-muted-foreground" : r >= 75 ? "text-red-400" : r >= 40 ? "text-amber-400" : "text-emerald-400";
const retColor = (v: number) =>
  !Number.isFinite(v) ? "text-muted-foreground" : v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-muted-foreground";

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
  | "richPctTime" | "cheapPctTime" | "richCount" | "fwdRich" | "fwdCheap" | "edge";

export default function ValuationResidence() {
  const [, setLocation] = useLocation();
  const { filteredTickersList } = useUniverse();
  const [metricKey, setMetricKey] = useState("P/FFO FY2");
  const [basis, setBasis] = useState<PctBasis>("trailing");
  const [lookbackDays, setLookbackDays] = useState(1260);
  const [pctMove, setPctMove] = useState(20);
  const [horizon, setHorizon] = useState(63);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupLevel>("none");
  const [sortCol, setSortCol] = useState<SortCol>("currentRich");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detail, setDetail] = useState<Row | null>(null);

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

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["residence", metricKey, basis, lookbackDays, pctMove, tickerKey],
    queryFn: async () => {
      const out: Row[] = [];
      const batchSize = 12;
      for (let b = 0; b < tickers.length; b += batchSize) {
        const batch = tickers.slice(b, b + batchSize);
        const results = await Promise.all(batch.map(async (t) => {
          const [mult, close] = await Promise.all([
            getMetricSeries(t.ticker, metricKey).catch(() => []),
            getMetricSeries(t.ticker, "close").catch(() => []),
          ]);
          const res = buildResidence(mult, close, {
            basis, window: lookbackDays, pctMove,
            dir: metric.dir, lowIsCheap: metric.lowIsCheap,
            horizons: HORIZONS.map((h) => h.days),
          });
          return res ? { ...res, ...t } as Row : null;
        }));
        for (const r of results) if (r) out.push(r);
      }
      return out;
    },
    enabled: tickers.length > 0,
  });

  const sortValue = (r: Row, col: SortCol): number | string => {
    switch (col) {
      case "ticker": return r.ticker;
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
    let r = q ? rows.filter((x) => x.ticker.includes(q) || x.name.toUpperCase().includes(q)) : rows;
    r = [...r].sort((a, b) => {
      const av = sortValue(a, sortCol), bv = sortValue(b, sortCol);
      const cmp = typeof av === "string" || typeof bv === "string"
        ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [rows, search, sortCol, sortDir, horizon]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, Row[]>();
    for (const r of visible) {
      const key = (r[groupBy as typeof CLASS_KEYS[number]] as string) || "—";
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
    <th className="px-2 py-1 text-right whitespace-nowrap cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(col)} title={title}>
      {label} <SortIcon col={col} />
    </th>
  );

  const openInCharts = (ticker: string) => {
    try {
      sessionStorage.setItem("reit-viz:rerate-to-charts",
        JSON.stringify({ ticker, metricKey, lookbackDays }));
    } catch {}
    setLocation("/");
  };

  const COLSPAN = 13;
  const hLabel = HORIZONS.find((h) => h.days === horizon)?.label ?? "";

  const renderRow = (r: Row) => {
    const f = r.fwd[horizon];
    const edge = f ? f.rich.median - f.base.median : NaN;
    return (
      <tr key={r.ticker} className="border-b border-border/40 hover:bg-muted/30 cursor-pointer" onClick={() => setDetail(r)}>
        <td className="px-1 py-1 text-center">
          <button type="button" onClick={(e) => { e.stopPropagation(); openInCharts(r.ticker); }}
            title={`Chart ${r.ticker} — ${metricKey} percentile over time`}
            className="text-muted-foreground hover:text-foreground">
            <LineChart className="w-3.5 h-3.5" />
          </button>
        </td>
        <td className="px-2 py-1 text-left font-semibold" title={`${r.name} · ${r.sector}`}>{r.ticker}</td>
        <td className={`px-2 py-1 text-right ${richColor(r.currentRich)}`}>{fmtPct(r.currentRich)}</td>
        <td className={`px-2 py-1 text-right ${richColor(r.proFormaRich)}`}>
          {fmtPct(r.proFormaRich)}{r.proFormaUnprecedented && <span className="ml-1 text-[9px] text-red-400 font-bold">ATH</span>}
        </td>
        <td className="px-2 py-1 text-right text-muted-foreground" title="% of history at least as rich as the pro-forma level (low = rare)">{fmtPct(r.proFormaFreqRicher)}</td>
        <td className="px-2 py-1 text-right text-red-400/80">{fmtPct(r.richPctTime)}</td>
        <td className="px-2 py-1 text-right text-emerald-400/80">{fmtPct(r.cheapPctTime)}</td>
        <td className="px-2 py-1 text-right text-muted-foreground" title="distinct visits to ≥90th richness (median run length, days)">
          {fmtNum(r.richCount)}{Number.isFinite(r.richMedDur) ? <span className="text-muted-foreground/50"> ({fmtNum(r.richMedDur)}d)</span> : null}
        </td>
        <td className={`px-2 py-1 text-right ${retColor(f?.rich.median ?? NaN)}`} title={f ? `n=${f.rich.n} days` : ""}>{fmtRet(f?.rich.median ?? NaN)}</td>
        <td className={`px-2 py-1 text-right ${retColor(f?.cheap.median ?? NaN)}`} title={f ? `n=${f.cheap.n} days` : ""}>{fmtRet(f?.cheap.median ?? NaN)}</td>
        <td className={`px-2 py-1 text-right ${retColor(edge)}`} title="rich-tail median forward return minus the unconditional baseline">{fmtRet(edge)}</td>
        <td className="px-2 py-1"><OccupancyBar residence={r.residence} /></td>
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
              {RERATE_METRICS.map((m) => <SelectItem key={m.key} value={m.key} className="text-xs">{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
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
          {" "}<b>+{pctMove}%</b> = pro-forma richness after the move (<b>ATH</b> = never been this rich). <b>Fwd@90 / Fwd@10</b> = median {hLabel} forward price return on days the multiple was in the rich (≥90) / cheap (≤10) tail; <b>Edge</b> = rich-tail minus the unconditional baseline. Forward returns are price-only and use overlapping windows.
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-card z-10 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              <th className="px-1 py-1 w-7" />
              <th className="px-2 py-1 text-left cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("ticker")}>Ticker <SortIcon col="ticker" /></th>
              <Th col="currentRich" label="Now" title="Current richness percentile (100 = most expensive)" />
              <Th col="proFormaRich" label={`+${pctMove}%`} title="Pro-forma richness percentile after the price move" />
              <Th col="proFormaFreqRicher" label="Seen%" title="% of history at least as rich as the pro-forma level (low = rare/unprecedented)" />
              <Th col="richPctTime" label="≥90%" title="% of history spent in the rich tail (≥90th richness)" />
              <Th col="cheapPctTime" label="≤10%" title="% of history spent in the cheap tail (≤10th richness)" />
              <Th col="richCount" label="Runs≥90" title="Distinct visits to the rich tail (median run length)" />
              <Th col="fwdRich" label={`Fwd@90`} title={`Median ${hLabel} forward return when rich (≥90)`} />
              <Th col="fwdCheap" label={`Fwd@10`} title={`Median ${hLabel} forward return when cheap (≤10)`} />
              <Th col="edge" label="Edge" title="Rich-tail forward return minus unconditional baseline" />
              <th className="px-2 py-1 text-left">Occupancy</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={COLSPAN} className="px-3 py-6 text-center text-muted-foreground">Computing residence across the universe…</td></tr>}
            {!isLoading && visible.length === 0 && <tr><td colSpan={COLSPAN} className="px-3 py-6 text-center text-muted-foreground">No data for the selected multiple / universe.</td></tr>}
            {!isLoading && !grouped && visible.map(renderRow)}
            {!isLoading && grouped && grouped.map(([name, gr]) => (
              <Fragment key={name}>
                <tr className="bg-muted/40 border-y border-border">
                  <td colSpan={COLSPAN} className="px-2 py-1 text-left text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">
                    {name}<span className="text-muted-foreground font-normal normal-case"> · {gr.length}</span>
                  </td>
                </tr>
                {gr.map(renderRow)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between px-4 py-3 border-b border-border">
              <div>
                <div className="text-sm font-semibold">{detail.ticker} <span className="text-muted-foreground font-normal">· {detail.name}</span></div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{metric.label} · {basis === "trailing" ? `trailing ${LOOKBACKS.find((l) => l.days === lookbackDays)?.label}` : "expanding history"} · {detail.n.toLocaleString()} obs</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { openInCharts(detail.ticker); }} className="text-[11px] px-2 py-1 rounded bg-muted hover:bg-muted/70 flex items-center gap-1" title="Open in Charts">
                  <LineChart className="w-3 h-3" /> Chart
                </button>
                <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Now / pro-forma / rarity */}
            <div className="grid grid-cols-3 gap-2 px-4 py-3 text-xs">
              <div><div className="text-[10px] uppercase text-muted-foreground">Now (richness)</div><div className={`text-lg font-mono ${richColor(detail.currentRich)}`}>{fmtPct(detail.currentRich)}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">After +{pctMove}%</div><div className={`text-lg font-mono ${richColor(detail.proFormaRich)}`}>{fmtPct(detail.proFormaRich)}{detail.proFormaUnprecedented && <span className="ml-1 text-[10px] text-red-400 font-bold align-middle">ATH</span>}</div></div>
              <div><div className="text-[10px] uppercase text-muted-foreground">Seen this rich</div><div className="text-lg font-mono text-muted-foreground">{fmtPct(detail.proFormaFreqRicher)}%<span className="text-[10px]"> of history</span></div></div>
            </div>

            {/* Occupancy */}
            <div className="px-4 pb-3">
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Time spent by richness band</div>
              <div className="flex h-5 w-full rounded overflow-hidden border border-border/40">
                {detail.residence.map((p, i) => (
                  <div key={i} style={{ width: `${p}%`, backgroundColor: BAND_COLORS[i] }} className="flex items-center justify-center" title={`${RESIDENCE_BAND_LABELS[i]}: ${p.toFixed(1)}%`}>
                    {p >= 8 && <span className="text-[8px] text-black/70 font-bold">{p.toFixed(0)}%</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5"><span>cheap (0)</span><span>rich (100)</span></div>
              <div className="text-[11px] text-muted-foreground mt-2">
                Rich tail (≥90): <b className="text-red-400/90">{fmtPct(detail.richPctTime)}%</b> of time over <b>{fmtNum(detail.richCount)}</b> visits (median {fmtNum(detail.richMedDur)}d).
                {" "}Cheap tail (≤10): <b className="text-emerald-400/90">{fmtPct(detail.cheapPctTime)}%</b> over <b>{fmtNum(detail.cheapCount)}</b> visits (median {fmtNum(detail.cheapMedDur)}d).
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
                    const f = detail.fwd[h.days];
                    if (!f) return null;
                    const edge = f.rich.median - f.base.median;
                    return (
                      <tr key={h.days} className="border-b border-border/30">
                        <td className="text-left py-1 text-muted-foreground">{h.label}</td>
                        <td className={`text-right ${retColor(f.rich.median)}`}>{fmtRet(f.rich.median)} · {fmtPct(f.rich.hitRate)}% · {f.rich.n}</td>
                        <td className={`text-right ${retColor(f.cheap.median)}`}>{fmtRet(f.cheap.median)} · {fmtPct(f.cheap.hitRate)}% · {f.cheap.n}</td>
                        <td className={`text-right ${retColor(f.base.median)}`}>{fmtRet(f.base.median)} · {f.base.n}</td>
                        <td className={`text-right ${retColor(edge)}`}>{fmtRet(edge)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-[10px] text-muted-foreground mt-1.5">Forward returns are price-only and use overlapping windows — read n as days, not independent samples. A negative Edge means being rich preceded under-performance (mean reversion).</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
