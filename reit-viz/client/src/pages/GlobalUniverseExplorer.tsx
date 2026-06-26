// Reconstructed from recovered-bundle/GlobalUniverseExplorer-Bnuulnji.js on 2026-06-11

import { useState, useMemo, useEffect } from "react";
import { useExcludedTickers } from "@/lib/excludedTickers";
import { emptyClassFilters, ClassFilters } from "@/lib/dataService";
import { applyClassFilters } from "@/lib/classificationFilters";
import { useGlobalUniverse } from "@/lib/globalUniverse";
import { ClassificationFilters } from "@/lib/classificationFilters";
import {
  restoreAllExcluded,
  restoreExcludedTicker,
  excludeTicker,
} from "@/lib/excludedTickers";
import { Loader2, AlertCircle, EyeOff, Download, RotateCcw, Trash2, X, ChevronUp, ChevronDown } from "lucide-react";
import { Undo2 } from "lucide-react";

const PAGE_SIZE = 200;
const TEXT_COLUMNS = [
  "ticker",
  "name",
  "nation",
  "exchange",
  "economy",
  "sector",
  "subsector",
  "industryGroup",
  "industry",
  "subindustry",
];
const NUM_COLUMNS = ["price", "marketCapMM", "salesMM", "adv", "dollarVolMM", "peFy2"];

interface GlobalRecord {
  ticker: string;
  fdsTicker?: string;
  name?: string;
  nation?: string;
  exchange?: string;
  economy?: string;
  sector?: string;
  subsector?: string;
  industryGroup?: string;
  industry?: string;
  subindustry?: string;
  price?: number | null;
  marketCapMM?: number | null;
  salesMM?: number | null;
  adv?: number | null;
  dollarVolMM?: number | null;
  peFy2?: number | null;
  [key: string]: any;
}

function parseNumericFilter(raw: string): ((val: number | null | undefined) => boolean) | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const noCommas = trimmed.replace(/,/g, "").replace(/\s+/g, "");
  const rangeMatch = noCommas.match(/^(-?\d+(?:\.\d+)?)(?:-|\.\.)(-?\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1]);
    const hi = parseFloat(rangeMatch[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi))
      return (v) => v != null && Number.isFinite(v) && v >= lo && v <= hi;
  }
  const opMatch = noCommas.match(/^(>=|<=|>|<|=)(-?\d+(?:\.\d+)?)$/);
  if (opMatch) {
    const op = opMatch[1];
    const num = parseFloat(opMatch[2]);
    if (!Number.isFinite(num)) return null;
    switch (op) {
      case ">":
        return (v) => v != null && Number.isFinite(v) && v > num;
      case ">=":
        return (v) => v != null && Number.isFinite(v) && v >= num;
      case "<":
        return (v) => v != null && Number.isFinite(v) && v < num;
      case "<=":
        return (v) => v != null && Number.isFinite(v) && v <= num;
      case "=":
        return (v) => v != null && Number.isFinite(v) && v === num;
    }
  }
  const single = parseFloat(noCommas);
  return Number.isFinite(single)
    ? (v) => v != null && Number.isFinite(v) && v >= single
    : null;
}

function fmtNum(val: number | null | undefined, decimals = 2): string {
  if (val == null || !Number.isFinite(val)) return "—";
  if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(decimals) + "M";
  if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(decimals) + "K";
  return val.toFixed(decimals);
}

function fmtMM(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "—";
  if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(2) + "B";
  return val.toFixed(2) + "M";
}

function compareValues(a: any, b: any): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export default function GlobalUniverseExplorer() {
  const { records, loading, error } = useGlobalUniverse();
  const excludedGlobal = useExcludedTickers("global");
  const [showExcluded, setShowExcluded] = useState(false);
  const [excludeInput, setExcludeInput] = useState("");
  const [excludeInvalid, setExcludeInvalid] = useState(false);

  const addGlobalExclusion = () => {
    const sym = excludeInput.trim().toUpperCase();
    if (!sym) return;
    if (!records.some((r: any) => String(r.ticker).toUpperCase() === sym)) {
      setExcludeInvalid(true);
      return;
    }
    if (!excludedGlobal.has(sym)) excludeTicker("global", sym);
    setExcludeInput("");
    setExcludeInvalid(false);
  };
  const [classFilters, setClassFilters] = useState<ClassFilters>(() => emptyClassFilters());
  const [search, setSearch] = useState("");
  const [pastedTickers, setPastedTickers] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "marketCapMM",
    dir: "desc",
  });
  const [page, setPage] = useState(0);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const setColFilter = (col: string, val: string) => {
    setColFilters((prev) => {
      const next = { ...prev };
      if (val === "") delete next[col];
      else next[col] = val;
      return next;
    });
  };
  const clearColFilters = () => setColFilters({});
  const hasColFilters = Object.keys(colFilters).length > 0;

  const pastedTickerSet = useMemo(() => {
    const set = new Set<string>();
    for (const tok of pastedTickers.split(/[\s,;]+/)) {
      const t = tok.trim().toUpperCase();
      if (t) set.add(t);
    }
    return set;
  }, [pastedTickers]);

  const activeColFilterFns = useMemo(() => {
    const fns: Array<(row: GlobalRecord) => boolean> = [];
    for (const col of TEXT_COLUMNS) {
      const raw = colFilters[col]?.trim();
      if (!raw) continue;
      const parts = raw
        .split(/[|,]/)
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      if (parts.length === 0) continue;
      fns.push((row) => {
        const v = row[col];
        if (v == null) return false;
        const lower = String(v).toLowerCase();
        return parts.some((p) => lower.includes(p));
      });
    }
    for (const col of NUM_COLUMNS) {
      const raw = colFilters[col];
      if (!raw) continue;
      const fn = parseNumericFilter(raw);
      if (fn) fns.push((row) => fn(row[col]));
    }
    return fns;
  }, [colFilters]);

  const filteredRows = useMemo(() => {
    if (loading || error) return [];
    let rows = applyClassFilters(records as any[], classFilters, search, pastedTickerSet);
    if (activeColFilterFns.length > 0) {
      rows = rows.filter((row) => activeColFilterFns.every((fn) => fn(row as GlobalRecord)));
    }
    return rows;
  }, [records, loading, error, classFilters, search, pastedTickerSet, activeColFilterFns]);

  const sortedRows = useMemo(() => {
    const arr = filteredRows.slice();
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a: any, b: any) => compareValues(a[sort.key], b[sort.key]) * dir);
    return arr;
  }, [filteredRows, sort]);

  useEffect(() => {
    setPage(0);
  }, [classFilters, search, pastedTickers, sort.key, sort.dir, colFilters]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sortedRows, page]
  );

  const handleSort = (key: string) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  };

  const sortSuffix = (key: string) =>
    sort.key !== key ? "" : sort.dir === "asc" ? " ▲" : " ▼";

  const handleExportCsv = () => {
    const cols = [
      "ticker",
      "fdsTicker",
      "name",
      "nation",
      "exchange",
      "economy",
      "sector",
      "subsector",
      "industryGroup",
      "industry",
      "subindustry",
      "price",
      "marketCapMM",
      "salesMM",
      "adv",
      "dollarVolMM",
      "peFy2",
    ];
    const escape = (v: any) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(",")];
    for (const row of sortedRows as GlobalRecord[]) {
      lines.push(cols.map((c) => escape(row[c])).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `global-universe-filtered-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setClassFilters(emptyClassFilters());
    setSearch("");
    setPastedTickers("");
    setColFilters({});
  };

  const ColHeader = (key: string, label: string, align: "left" | "right" = "left") => (
    <th
      onClick={() => handleSort(key)}
      className={`px-2 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground border-b border-border bg-card sticky top-0 cursor-pointer select-none hover:text-foreground ${align === "right" ? "text-right" : "text-left"}`}
      data-testid={`global-universe-col-${key}`}
    >
      {label}
      {sortSuffix(key)}
    </th>
  );

  const ColFilterCell = (key: string, type: "text" | "num") => {
    const val = colFilters[key] ?? "";
    const placeholder = type === "num" ? ">100, 100-500" : "filter…";
    return (
      <th
        className="px-1 py-0.5 border-b border-border bg-card/80 sticky top-[26px] z-[1]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <input
            type="text"
            value={val}
            onChange={(e) => setColFilter(key, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder={placeholder}
            className={`w-full text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 ${type === "num" ? "text-right" : ""}`}
            data-testid={`global-universe-colfilter-${key}`}
          />
          {val && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setColFilter(key, "");
              }}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[10px] leading-none px-0.5"
              title="Clear"
            >
              ×
            </button>
          )}
        </div>
      </th>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-foreground tracking-tight">
            Global Universe Explorer
          </h2>
          <span className="text-[10px] text-muted-foreground">
            FactSet / RBICS classifications for every ticker available in optimizer "Global" mode
          </span>
          {!loading && !error && (
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">
              <span className="text-cyan-400 font-bold">
                {sortedRows.length.toLocaleString()}
              </span>{" "}
              of {records.length.toLocaleString()} visible
              {excludedGlobal.size > 0 && (
                <span className="ml-1 text-red-400">
                  ({excludedGlobal.size.toLocaleString()} hidden)
                </span>
              )}
            </span>
          )}
        </div>
        {/* Exclusions management panel (global namespace) */}
        <div className="mt-1 rounded border border-border bg-card/50 text-[10px] font-mono">
          <button
            type="button"
            onClick={() => setShowExcluded((v) => !v)}
            className="w-full flex items-center gap-2 px-2 py-1 hover:bg-muted/40"
            title="Manage tickers hidden from the global universe"
          >
            <EyeOff className="w-3 h-3 text-red-500/80" />
            <span className="font-bold">Exclusions</span>
            {excludedGlobal.size > 0 && (
              <span className="px-1.5 py-px rounded-full bg-red-500/15 text-red-600 dark:text-red-400">
                {excludedGlobal.size.toLocaleString()}
              </span>
            )}
            <span className="text-muted-foreground">hidden from global universe</span>
            {showExcluded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {showExcluded && (
            <div className="px-2 py-2 border-t border-border space-y-2">
              <div className="flex items-center gap-1">
                <input
                  list="exclude-global-list"
                  value={excludeInput}
                  onChange={(e) => { setExcludeInput(e.target.value); setExcludeInvalid(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") addGlobalExclusion(); }}
                  placeholder="Add ticker to hide…"
                  className={`h-6 w-44 px-2 rounded bg-background border focus:outline-none focus:ring-1 focus:ring-primary ${excludeInvalid ? "border-red-500" : "border-border"}`}
                />
                <button
                  type="button"
                  onClick={addGlobalExclusion}
                  className="h-6 px-2 rounded border border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <EyeOff className="w-3 h-3" /> Hide
                </button>
                {excludeInvalid && <span className="text-red-500">Unknown ticker</span>}
                {excludedGlobal.size > 0 && (
                  <button
                    type="button"
                    onClick={() => { window.confirm(`Restore all ${excludedGlobal.size} excluded global ticker(s)?`) && restoreAllExcluded("global"); }}
                    className="h-6 px-2 rounded text-muted-foreground hover:text-foreground inline-flex items-center gap-1 ml-auto"
                  >
                    <Undo2 className="w-3 h-3" /> Restore all
                  </button>
                )}
              </div>
              {excludedGlobal.size === 0 ? (
                <div className="text-muted-foreground italic">No exclusions — the full global universe is visible.</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {[...excludedGlobal].sort().map((ticker) => (
                    <button
                      key={ticker}
                      type="button"
                      onClick={() => restoreExcludedTicker("global", ticker)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background border border-border hover:border-primary hover:text-primary"
                      title={`Click to restore ${ticker}`}
                    >
                      {ticker}
                      <X className="w-2.5 h-2.5" />
                    </button>
                  ))}
                </div>
              )}
              <datalist id="exclude-global-list">
                {records.map((r: any) => <option key={r.ticker} value={r.ticker} />)}
              </datalist>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-border bg-card/40">
        {loading ? (
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading global universe…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-xs font-mono text-red-400">
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <ClassificationFilters
              tickerPoolOverride={records as any[]}
              filters={classFilters}
              onFiltersChange={setClassFilters}
              search={search}
              onSearchChange={setSearch}
              manualTickers={pastedTickerSet}
              onManualTickersChange={(set) => {
                setPastedTickers(Array.from(set).join("\n"));
              }}
              filteredCount={filteredRows.length}
              totalCount={records.length}
              testIdPrefix="global-universe-filter"
            />
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                  Paste tickers (whitespace / comma separated)
                </label>
                <textarea
                  value={pastedTickers}
                  onChange={(e) => setPastedTickers(e.target.value)}
                  rows={2}
                  className="text-[11px] font-mono bg-background border border-border rounded px-2 py-1 w-[480px] max-w-full focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="NVDA AAPL MSFT  or  NVDA, AAPL, MSFT"
                  data-testid="global-universe-manual"
                />
              </div>
              <div className="flex flex-col gap-1 ml-auto">
                <button
                  onClick={handleExportCsv}
                  disabled={sortedRows.length === 0}
                  className="text-[10px] font-mono font-bold px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 flex items-center gap-1.5"
                  data-testid="global-universe-export"
                >
                  <Download className="w-3 h-3" /> Export CSV
                </button>
                <button
                  onClick={handleReset}
                  className="text-[10px] font-mono px-2.5 py-1 rounded bg-background text-muted-foreground border border-border hover:text-foreground flex items-center gap-1.5"
                  data-testid="global-universe-reset"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {!loading && !error && (
          <table className="w-full border-collapse text-[11px] font-mono">
            <thead>
              <tr>
                {ColHeader("ticker", "Ticker")}
                {ColHeader("name", "Name")}
                {ColHeader("nation", "Nation")}
                {ColHeader("exchange", "Exch")}
                {ColHeader("economy", "Economy")}
                {ColHeader("sector", "Sector")}
                {ColHeader("subsector", "Sub-Sector")}
                {ColHeader("industryGroup", "Industry Group")}
                {ColHeader("industry", "Industry")}
                {ColHeader("subindustry", "Sub-Industry")}
                {ColHeader("price", "Px", "right")}
                {ColHeader("marketCapMM", "Mkt Cap", "right")}
                {ColHeader("salesMM", "Sales", "right")}
                {ColHeader("adv", "ADV", "right")}
                {ColHeader("dollarVolMM", "$-Vol", "right")}
                {ColHeader("peFy2", "P/E Fy2", "right")}
                <th className="px-2 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground border-b border-border bg-card sticky top-0 w-10">
                  {" "}
                </th>
              </tr>
              <tr>
                {ColFilterCell("ticker", "text")}
                {ColFilterCell("name", "text")}
                {ColFilterCell("nation", "text")}
                {ColFilterCell("exchange", "text")}
                {ColFilterCell("economy", "text")}
                {ColFilterCell("sector", "text")}
                {ColFilterCell("subsector", "text")}
                {ColFilterCell("industryGroup", "text")}
                {ColFilterCell("industry", "text")}
                {ColFilterCell("subindustry", "text")}
                {ColFilterCell("price", "num")}
                {ColFilterCell("marketCapMM", "num")}
                {ColFilterCell("salesMM", "num")}
                {ColFilterCell("adv", "num")}
                {ColFilterCell("dollarVolMM", "num")}
                {ColFilterCell("peFy2", "num")}
                <th className="px-1 py-0.5 border-b border-border bg-card/80 sticky top-[26px] z-[1]">
                  {hasColFilters && (
                    <button
                      type="button"
                      onClick={clearColFilters}
                      title="Clear all column filters"
                      className="text-muted-foreground hover:text-foreground text-[10px]"
                      data-testid="global-universe-clear-colfilters"
                    >
                      ×
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row: any) => (
                <tr
                  key={`${row.ticker}-${row.fdsTicker}`}
                  className="hover:bg-accent/30 border-b border-border/40"
                >
                  <td className="px-2 py-1 font-bold text-foreground">{row.ticker}</td>
                  <td
                    className="px-2 py-1 text-muted-foreground truncate max-w-[220px]"
                    title={row.name}
                  >
                    {row.name}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{row.nation ?? "—"}</td>
                  <td className="px-2 py-1 text-muted-foreground">{row.exchange ?? "—"}</td>
                  <td
                    className="px-2 py-1 text-cyan-400 truncate max-w-[140px]"
                    title={row.economy ?? ""}
                  >
                    {row.economy ?? "—"}
                  </td>
                  <td
                    className="px-2 py-1 text-cyan-300 truncate max-w-[160px]"
                    title={row.sector ?? ""}
                  >
                    {row.sector ?? "—"}
                  </td>
                  <td
                    className="px-2 py-1 text-cyan-200 truncate max-w-[180px]"
                    title={row.subsector ?? ""}
                  >
                    {row.subsector ?? "—"}
                  </td>
                  <td
                    className="px-2 py-1 text-muted-foreground truncate max-w-[180px]"
                    title={row.industryGroup ?? ""}
                  >
                    {row.industryGroup ?? "—"}
                  </td>
                  <td
                    className="px-2 py-1 text-muted-foreground truncate max-w-[180px]"
                    title={row.industry ?? ""}
                  >
                    {row.industry ?? "—"}
                  </td>
                  <td
                    className="px-2 py-1 text-muted-foreground truncate max-w-[200px]"
                    title={row.subindustry ?? ""}
                  >
                    {row.subindustry ?? "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {row.price != null && Number.isFinite(row.price)
                      ? row.price.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">{fmtMM(row.marketCapMM)}</td>
                  <td className="px-2 py-1 text-right">{fmtMM(row.salesMM)}</td>
                  <td className="px-2 py-1 text-right">{fmtNum(row.adv, 0)}</td>
                  <td className="px-2 py-1 text-right">{fmtMM(row.dollarVolMM)}</td>
                  <td className="px-2 py-1 text-right">
                    {row.peFy2 != null && Number.isFinite(row.peFy2)
                      ? row.peFy2.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        window.confirm(
                          `Hide ${row.ticker} (${row.name}) from the global universe?\n\nIt will be excluded from every place that uses the global universe — pair-combo, optimizer "Global" mode, this explorer.\n\nRestorable from the header above.`
                        ) && excludeTicker("global", row.ticker);
                      }}
                      className="text-muted-foreground hover:text-red-500"
                      title={`Hide ${row.ticker} from global universe`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={17}
                    className="px-4 py-8 text-center text-muted-foreground text-xs"
                  >
                    No tickers match the current filters. Pick at least one facet, type in the
                    search box, or paste tickers above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && !error && sortedRows.length > PAGE_SIZE && (
        <div className="flex-shrink-0 px-4 py-1.5 border-t border-border bg-card flex items-center gap-2 text-[10px] font-mono">
          <span className="text-muted-foreground">
            Page{" "}
            <span className="text-foreground font-bold">{page + 1}</span> / {totalPages} (
            {sortedRows.length.toLocaleString()} rows)
          </span>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            ← Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
