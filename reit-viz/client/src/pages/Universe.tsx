// Reconstructed from recovered-bundle/Universe-s8lkGiqo.js on 2026-06-11

import { useState, useMemo, useEffect, useRef } from "react";
import { useUniverse } from "@/lib/universeContext";
import { useReclassificationOverrides } from "@/lib/reclassificationOverrides";
import type { ClassificationField } from "@/lib/reclassificationOverrides";
import { useExcludedTickers } from "@/lib/excludedTickers";
import { CLASSIFICATION_KEYS } from "@/lib/dataService";
import { usePageState } from "@/lib/pageState";
import {
  Globe,
  Check,
  X,
  RotateCcw,
  Pencil,
  Download,
  Upload,
  Trash2,
  EyeOff,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassificationFilters } from "@/lib/classificationFilters";
import { commitClassificationOverride } from "@/lib/reclassificationOverrides";
import {
  importClassificationOverrides,
  resetAllClassificationOverrides,
  revertClassificationOverride,
} from "@/lib/reclassificationOverrides";
import { excludeTicker, excludeTickersBulk, restoreExcludedTicker, restoreAllExcluded } from "@/lib/excludedTickers";
import { fmtUsdMM, parseNumericFilter } from "@/lib/numericFilter";
import { Undo2 } from "lucide-react";

export default function Universe() {
  const {
    filters,
    setFilters,
    search,
    setSearch,
    manualTickers,
    setManualTickers,
    advFilter,
    setAdvFilter,
    advWindow,
    setAdvWindow,
    advValueOf,
    advMap,
    adv30Map,
    advLoading,
    refreshAdv,
    isFiltered,
    filteredCount,
    totalCount,
    allTickers,
    filteredTickersList,
    clearAll,
  } = useUniverse();

  const overrides = useReclassificationOverrides();
  const overrideCount = Object.keys(overrides).length;

  const { activeOverrideCount, inertOverrideCount } = useMemo(() => {
    if (overrideCount === 0)
      return { activeOverrideCount: 0, inertOverrideCount: 0 };
    const tickerSet = new Set(allTickers.map((t: any) => t.ticker));
    let active = 0;
    let inert = 0;
    for (const ticker of Object.keys(overrides)) {
      tickerSet.has(ticker) ? active++ : inert++;
    }
    return { activeOverrideCount: active, inertOverrideCount: inert };
  }, [overrides, overrideCount, allTickers]);

  const excludedTickers = useExcludedTickers("workbook");
  const [showExcluded, setShowExcluded] = useState(false);
  const [excludeInput, setExcludeInput] = useState("");
  const [excludeInvalid, setExcludeInvalid] = useState(false);

  const addExclusion = () => {
    const sym = excludeInput.trim().toUpperCase();
    if (!sym) return;
    if (!allTickers.some((t: any) => String(t.ticker).toUpperCase() === sym)) {
      setExcludeInvalid(true);
      return;
    }
    if (!excludedTickers.has(sym)) excludeTicker("workbook", sym);
    setExcludeInput("");
    setExcludeInvalid(false);
  };

  // Workbook tickers (not already hidden) whose 90-day $ ADV does NOT match the
  // active liquidity filter — the candidates for a one-click bulk exclude.
  const advFilterPredicate = useMemo(() => parseNumericFilter(advFilter), [advFilter]);
  const offFilterTickers = useMemo(() => {
    if (!advFilterPredicate) return [] as typeof allTickers;
    return allTickers.filter((t: any) => {
      const sym = String(t.ticker).toUpperCase();
      if (excludedTickers.has(sym)) return false;
      return !advFilterPredicate(advValueOf(sym));
    });
  }, [advFilterPredicate, allTickers, advValueOf, excludedTickers]);

  const excludeOffFilter = () => {
    if (offFilterTickers.length === 0) return;
    const ok = window.confirm(
      `Hide ${offFilterTickers.length} ticker(s) whose ${advWindow}-day $ ADV does not match "${advFilter.trim()}"?\n\n` +
        `They will be excluded from EVERY tab (Ranking, Scatter, Valuation, etc.).\n` +
        `Restorable any time from the Exclusions panel above.`,
    );
    if (!ok) return;
    excludeTickersBulk("workbook", offFilterTickers.map((t: any) => t.ticker));
  };

  const effectiveClassMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const ticker of allTickers) {
      const override = overrides[(ticker as any).ticker];
      const classData: any = {
        economy: (ticker as any).economy,
        sector: (ticker as any).sector,
        subsector: (ticker as any).subsector,
        industryGroup: (ticker as any).industryGroup,
        industry: (ticker as any).industry,
        subindustry: (ticker as any).subindustry,
      };
      if (override) {
        for (const key of CLASSIFICATION_KEYS) {
          if (override[key] !== undefined) classData[key] = override[key];
        }
      }
      map.set((ticker as any).ticker, classData);
    }
    return map;
  }, [allTickers, overrides]);

  const availableValues = useMemo(() => {
    const sets: Record<string, Set<string>> = {
      economy: new Set(),
      sector: new Set(),
      subsector: new Set(),
      industryGroup: new Set(),
      industry: new Set(),
      subindustry: new Set(),
    };
    for (const ticker of allTickers) {
      for (const key of CLASSIFICATION_KEYS) {
        const val = (ticker as any)[key];
        if (val) sets[key].add(val);
      }
    }
    const result: Record<string, string[]> = {};
    for (const key of CLASSIFICATION_KEYS) {
      result[key] = [...sets[key]].sort((a, b) => a.localeCompare(b));
    }
    return result;
  }, [allTickers]);

  const [sortCol, setSortCol] = useState("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editingCell, setEditingCell] = useState<{ ticker: string; field: ClassificationField } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  const startEdit = (ticker: string, field: ClassificationField, currentValue: string) => {
    setEditingCell({ ticker, field });
    setEditValue(currentValue || "");
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const original = effectiveClassMap.get(editingCell.ticker)?.[editingCell.field] || "";
    commitClassificationOverride(editingCell.ticker, editingCell.field, editValue, original);
    setEditingCell(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const advOf = (ticker: string): number | null =>
    advMap.get(String(ticker).toUpperCase())?.dollarVolMM ?? null;
  const adv30Of = (ticker: string): number | null =>
    adv30Map.get(String(ticker).toUpperCase())?.advUsdMM ?? null;

  const sortedRows = useMemo(() => {
    const rows = [...filteredTickersList];
    if (sortCol === "advUsd" || sortCol === "advUsd30") {
      // Numeric sort; unknown ($ ADV missing) always sinks to the bottom.
      const valOf = sortCol === "advUsd30" ? adv30Of : advOf;
      rows.sort((a: any, b: any) => {
        const av = valOf(a.ticker);
        const bv = valOf(b.ticker);
        const aMissing = av == null || !Number.isFinite(av);
        const bMissing = bv == null || !Number.isFinite(bv);
        if (aMissing && bMissing) return 0;
        if (aMissing) return 1;
        if (bMissing) return -1;
        const cmp = (av as number) - (bv as number);
        return sortDir === "asc" ? cmp : -cmp;
      });
      return rows;
    }
    rows.sort((a: any, b: any) => {
      const aVal = (a[sortCol] || "").toLowerCase();
      const bVal = (b[sortCol] || "").toLowerCase();
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filteredTickersList, sortCol, sortDir, advMap, adv30Map]);

  const filteredSet = useMemo(
    () => new Set(filteredTickersList.map((t: any) => t.ticker)),
    [filteredTickersList]
  );

  const classColumns: { key: ClassificationField; label: string }[] = [
    { key: "economy", label: "Economy" },
    { key: "sector", label: "Sector" },
    { key: "subsector", label: "Subsector" },
    { key: "industryGroup", label: "Ind. Group" },
    { key: "industry", label: "Industry" },
    { key: "subindustry", label: "Subindustry" },
  ];

  const SortableHeader = ({
    col,
    label,
    className = "",
  }: {
    col: string;
    label: string;
    className?: string;
  }) => (
    <th
      className={`text-left py-1.5 px-2 font-medium cursor-pointer hover:text-foreground select-none ${className}`}
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortCol === col &&
          (sortDir === "asc" ? (
            <ChevronUp className="w-2.5 h-2.5" />
          ) : (
            <ChevronDown className="w-2.5 h-2.5" />
          ))}
      </span>
    </th>
  );

  const handleExportOverrides = () => {
    const blob = new Blob([JSON.stringify(overrides, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `reit-viz-classification-overrides-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImportClick = () => fileInputRef.current?.click();
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file)
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const mode = window.confirm(
          `Click OK to MERGE imported overrides with existing ones.\nClick Cancel to REPLACE all existing overrides.`
        )
          ? "merge"
          : "replace";
        importClassificationOverrides(parsed, mode);
      } catch (err: any) {
        window.alert(`Failed to import: ${err?.message || String(err)}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
  };

  const handleResetOverrides = () => {
    if (overrideCount !== 0 &&
      window.confirm(
        `Reset all ${overrideCount} reclassification override(s) back to the workbook defaults?`
      )
    ) {
      resetAllClassificationOverrides();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card/50 space-y-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold tracking-tight">MASTER UNIVERSE</span>
          <span className="text-[10px] text-muted-foreground">
            Controls ticker universe for all tabs marked with a filter dot in the navbar
          </span>
        </div>
        <ClassificationFilters
          filters={filters}
          onFiltersChange={setFilters}
          search={search}
          onSearchChange={setSearch}
          manualTickers={manualTickers}
          onManualTickersChange={setManualTickers}
          filteredCount={filteredCount}
          totalCount={totalCount}
          testIdPrefix="universe"
        >
          <div className="h-4 w-px bg-border mx-0.5" />
          <div
            className="relative flex items-center"
            title={
              "Liquidity filter on $ ADV (average daily dollar volume, in $ millions).\n" +
              "Examples:  >5  (at least $5M/day) ·  5-50  (range) ·  <100  (below $100M/day).\n" +
              "Use the 90d/30d toggle to pick which window the filter (and bulk-exclude) targets.\n" +
              "Applies to every tab. Names with no $ ADV data are hidden while this filter is active."
            }
          >
            <span className="text-[10px] font-mono text-muted-foreground mr-1 whitespace-nowrap">
              $ ADV
            </span>
            <input
              value={advFilter}
              onChange={(e) => setAdvFilter(e.target.value)}
              placeholder=">5, 5-50, <100"
              className="h-6 px-2 w-32 text-[11px] font-mono bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
              data-testid="universe-adv-filter"
            />
            {advFilter && (
              <button
                type="button"
                onClick={() => setAdvFilter("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[11px] leading-none px-0.5"
                title="Clear $ ADV filter"
              >
                ×
              </button>
            )}
          </div>
          <div
            className="inline-flex items-center rounded border border-border overflow-hidden text-[10px] font-mono"
            title="Which ADV window the filter and bulk-exclude target"
          >
            {([90, 30] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setAdvWindow(w)}
                className={`px-1.5 h-6 ${
                  advWindow === w
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`universe-adv-window-${w}`}
                title={`Filter on the ${w}-day $ ADV`}
              >
                {w}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refreshAdv}
            disabled={advLoading}
            className="inline-flex items-center gap-1 h-6 px-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Recompute $ ADV (30 & 90 day) from the live Yahoo volume feed"
          >
            {advLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {advLoading ? "ADV…" : "ADV"}
          </button>
          {advFilterPredicate && offFilterTickers.length > 0 && (
            <button
              type="button"
              onClick={excludeOffFilter}
              className="inline-flex items-center gap-1 h-6 px-2 text-[10px] font-mono rounded border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
              title={`Hide the ${offFilterTickers.length} ticker(s) whose ${advWindow}-day $ ADV doesn't match "${advFilter.trim()}" from every tab (restorable from the Exclusions panel)`}
              data-testid="universe-exclude-offfilter"
            >
              <EyeOff className="w-3 h-3" />
              Hide {offFilterTickers.length} off-filter
            </button>
          )}
        </ClassificationFilters>
        <div className="flex items-center gap-3 text-[11px]">
          {isFiltered ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20 text-primary">
              <Check className="w-3 h-3" />
              <span className="font-medium">{filteredCount}</span>
              <span className="text-primary/70">
                of {totalCount} tickers active across all tabs
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 border border-border text-muted-foreground">
              <Globe className="w-3 h-3" />
              <span>All {totalCount} tickers active (no filter)</span>
            </div>
          )}
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={clearAll}
            >
              <X className="w-3 h-3 mr-0.5" />
              Reset to all
            </Button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {overrideCount > 0 && (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400"
                title={
                  inertOverrideCount > 0
                    ? `${activeOverrideCount} active override(s) on tickers in this workbook · ${inertOverrideCount} inert (ticker not in workbook — will re-activate if ticker returns)`
                    : "These tickers have user-edited classifications that override the workbook defaults"
                }
              >
                <Pencil className="w-3 h-3" />
                <span className="font-medium">{activeOverrideCount}</span>
                <span className="opacity-80">reclassified</span>
                {inertOverrideCount > 0 && (
                  <span className="opacity-70 text-[10px] ml-1">
                    (+{inertOverrideCount} inert)
                  </span>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={handleExportOverrides}
              disabled={overrideCount === 0}
              title="Download overrides as JSON"
            >
              <Download className="w-3 h-3 mr-0.5" />
              Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={handleImportClick}
              title="Load overrides from a JSON file"
            >
              <Upload className="w-3 h-3 mr-0.5" />
              Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={handleResetOverrides}
              disabled={overrideCount === 0}
              title="Remove all reclassification overrides"
            >
              <RotateCcw className="w-3 h-3 mr-0.5" />
              Reset overrides
            </Button>
          </div>
        </div>
        {/* Exclusions management panel */}
        <div className="rounded border border-border bg-card/50">
          <button
            type="button"
            onClick={() => setShowExcluded((v) => !v)}
            className="w-full flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-muted/40"
            title="Manage tickers hidden from every tab"
          >
            <EyeOff className="w-3 h-3 text-red-500/80" />
            <span className="font-medium">Exclusions</span>
            {excludedTickers.size > 0 && (
              <span className="px-1.5 py-px rounded-full bg-red-500/15 text-red-600 dark:text-red-400 font-mono text-[10px]">
                {excludedTickers.size}
              </span>
            )}
            <span className="text-muted-foreground">hidden from all tabs</span>
            {(showExcluded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />)}
          </button>
          {showExcluded && (
            <div className="px-2 py-2 border-t border-border space-y-2">
              {/* Add by symbol */}
              <div className="flex items-center gap-1">
                <input
                  list="exclude-ticker-list"
                  value={excludeInput}
                  onChange={(e) => { setExcludeInput(e.target.value); setExcludeInvalid(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") addExclusion(); }}
                  placeholder="Add ticker to hide…"
                  className={`h-6 w-44 px-2 text-[11px] font-mono rounded bg-background border focus:outline-none focus:ring-1 focus:ring-primary ${excludeInvalid ? "border-red-500" : "border-border"}`}
                />
                <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={addExclusion}>
                  <EyeOff className="w-3 h-3 mr-0.5" /> Hide
                </Button>
                {excludeInvalid && <span className="text-[10px] text-red-500">Unknown ticker</span>}
                {excludedTickers.size > 0 && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 px-2 text-[11px] text-muted-foreground ml-auto"
                    onClick={() => { window.confirm(`Restore all ${excludedTickers.size} excluded ticker(s)?`) && restoreAllExcluded("workbook"); }}
                  >
                    <Undo2 className="w-3 h-3 mr-0.5" /> Restore all
                  </Button>
                )}
              </div>
              {/* List */}
              {excludedTickers.size === 0 ? (
                <div className="text-[10px] text-muted-foreground italic">No exclusions — all {totalCount} tickers visible across every tab.</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {[...excludedTickers].sort().map((ticker) => (
                    <button
                      key={ticker}
                      type="button"
                      onClick={() => restoreExcludedTicker("workbook", ticker)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background border border-border text-[10px] font-mono hover:border-primary hover:text-primary"
                      title={`Click to restore ${ticker}`}
                    >
                      {ticker}
                      <X className="w-2.5 h-2.5" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground italic">
          Click any classification cell to reclassify. Enter to save, Esc to
          cancel. Click the trash icon on a row to hide that ticker from every
          tab (restorable).
        </div>
      </div>
      {CLASSIFICATION_KEYS.map((key) => (
        <datalist key={key} id={`class-values-${key}`}>
          {availableValues[key].map((val) => (
            <option key={val} value={val} />
          ))}
        </datalist>
      ))}
      <datalist id="exclude-ticker-list">
        {allTickers.map((t: any) => (
          <option key={t.ticker} value={t.ticker}>{t.name}</option>
        ))}
      </datalist>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-card z-10 border-b border-border text-muted-foreground">
            <tr>
              <th className="w-8 py-1.5 px-2" />
              <SortableHeader col="ticker" label="Ticker" className="w-20" />
              <SortableHeader col="name" label="Name" />
              <th
                className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-foreground select-none w-24"
                onClick={() => handleSort("advUsd")}
                title="$ ADV — trailing 90-day average daily dollar volume (close × volume) from the Yahoo feed. Italic '~' values are the static global-dataset estimate (live figure still loading or unavailable). The liquidity filter targets this column when the 90d toggle is selected."
              >
                <span className="inline-flex items-center gap-0.5">
                  $ ADV (90d)
                  {sortCol === "advUsd" &&
                    (sortDir === "asc" ? (
                      <ChevronUp className="w-2.5 h-2.5" />
                    ) : (
                      <ChevronDown className="w-2.5 h-2.5" />
                    ))}
                </span>
              </th>
              <th
                className="text-right py-1.5 px-2 font-medium cursor-pointer hover:text-foreground select-none w-24"
                onClick={() => handleSort("advUsd30")}
                title="$ ADV — trailing 30-day average daily dollar volume (close × volume) from the Yahoo feed. Real values only (no global-dataset fallback); '—' means no live data."
              >
                <span className="inline-flex items-center gap-0.5">
                  $ ADV (30d)
                  {sortCol === "advUsd30" &&
                    (sortDir === "asc" ? (
                      <ChevronUp className="w-2.5 h-2.5" />
                    ) : (
                      <ChevronDown className="w-2.5 h-2.5" />
                    ))}
                </span>
              </th>
              {classColumns.map(({ key, label }) => (
                <SortableHeader key={key} col={key} label={label} />
              ))}
              <th className="w-8 py-1.5 px-2" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((ticker: any, rowIdx: number) => {
              const inFiltered = filteredSet.has(ticker.ticker);
              const tickerOverrides = overrides[ticker.ticker];
              const hasOverrides = !!tickerOverrides && Object.keys(tickerOverrides).length > 0;
              return (
                <tr
                  key={ticker.ticker}
                  className={`border-b border-border/30 ${rowIdx % 2 === 0 ? "bg-card/30" : ""} ${inFiltered ? "hover:bg-accent/30" : "opacity-40"}`}
                  data-testid={`universe-row-${ticker.ticker}`}
                >
                  <td className="py-1 px-2 text-center">
                    {inFiltered && <Check className="w-3 h-3 text-primary" />}
                  </td>
                  <td className="py-1 px-2 font-mono font-bold text-foreground">
                    {ticker.ticker}
                  </td>
                  <td className="py-1 px-2 truncate max-w-[200px]" title={ticker.name}>
                    {ticker.name}
                  </td>
                  {(() => {
                    const info = advMap.get(String(ticker.ticker).toUpperCase());
                    const dv = info?.dollarVolMM ?? null;
                    const hasDv = dv != null && Number.isFinite(dv);
                    const isEstimate = info?.source === "global";
                    const shares =
                      info?.adv != null && Number.isFinite(info.adv)
                        ? `${info.adv.toFixed(2)}M sh/day`
                        : null;
                    const px =
                      info?.price != null && Number.isFinite(info.price)
                        ? `$${info.price.toFixed(2)}`
                        : null;
                    const title = !hasDv
                      ? "No $ ADV data for this ticker"
                      : info?.source === "yahoo90"
                        ? `90-day ADV (Yahoo): ${fmtUsdMM(dv)}` +
                          (shares ? ` · ${shares}` : "") +
                          (px ? ` × ${px}` : "") +
                          (info?.asOf ? ` · as of ${info.asOf}` : "") +
                          (info?.days ? ` · ${info.days} bars` : "")
                        : `Estimate (global dataset): ${fmtUsdMM(dv)}` +
                          (shares ? ` · ${shares}` : "") +
                          (px ? ` × ${px}` : "") +
                          " · live 90-day figure pending";
                    return (
                      <td
                        className={`py-1 px-2 text-right font-mono tabular-nums ${
                          !hasDv
                            ? "text-muted-foreground"
                            : isEstimate
                              ? "text-muted-foreground italic"
                              : "text-foreground"
                        }`}
                        title={title}
                      >
                        {hasDv ? (isEstimate ? "~" : "") + fmtUsdMM(dv) : "—"}
                      </td>
                    );
                  })()}
                  {(() => {
                    const e30 = adv30Map.get(String(ticker.ticker).toUpperCase());
                    const dv30 = e30?.advUsdMM ?? null;
                    const has30 = dv30 != null && Number.isFinite(dv30);
                    const sh30 =
                      e30?.advShares != null && Number.isFinite(e30.advShares)
                        ? `${e30.advShares.toFixed(2)}M sh/day`
                        : null;
                    const px30 =
                      e30?.lastClose != null && Number.isFinite(e30.lastClose)
                        ? `$${e30.lastClose.toFixed(2)}`
                        : null;
                    return (
                      <td
                        className={`py-1 px-2 text-right font-mono tabular-nums ${has30 ? "text-foreground" : "text-muted-foreground"}`}
                        title={
                          has30
                            ? `30-day ADV (Yahoo): ${fmtUsdMM(dv30)}` +
                              (sh30 ? ` · ${sh30}` : "") +
                              (px30 ? ` × ${px30}` : "") +
                              (e30?.asOf ? ` · as of ${e30.asOf}` : "") +
                              (e30?.days ? ` · ${e30.days} bars` : "")
                            : "No live 30-day ADV for this ticker"
                        }
                      >
                        {has30 ? fmtUsdMM(dv30) : "—"}
                      </td>
                    );
                  })()}
                  {classColumns.map(({ key }) => {
                    const cellValue = ticker[key] || "";
                    const isEditing =
                      editingCell?.ticker === ticker.ticker &&
                      editingCell?.field === key;
                    const isOverridden = !!tickerOverrides && tickerOverrides[key] !== undefined;
                    return (
                      <td
                        key={key}
                        className={`py-1 px-2 cursor-text ${isOverridden ? "text-amber-600 dark:text-amber-400 font-medium bg-amber-500/5" : "text-muted-foreground"}`}
                        onClick={() =>
                          !isEditing && startEdit(ticker.ticker, key, cellValue)
                        }
                        title={
                          isOverridden
                            ? "Reclassified (click to edit; clear text to revert)"
                            : "Click to reclassify"
                        }
                      >
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            list={`class-values-${key}`}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitEdit();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                            className="w-full bg-background border border-primary/50 rounded px-1 py-0.5 text-[11px] text-foreground outline-none focus:border-primary"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            {cellValue || (
                              <span className="opacity-50 italic">—</span>
                            )}
                            {isOverridden && (
                              <span className="text-[8px]">●</span>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1 px-2 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      {hasOverrides && (
                        <button
                          type="button"
                          onClick={() => {
                            window.confirm(
                              `Revert all reclassification overrides for ${ticker.ticker}?`
                            ) && revertClassificationOverride(ticker.ticker);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          title={`Revert ${ticker.ticker} to workbook defaults`}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          window.confirm(
                            `Hide ${ticker.ticker} from the universe?\n\nIt will be excluded from EVERY tab (Ranking, Scatter, Valuation, etc.).\nRestorable from the Universe page header.`
                          ) && excludeTicker("workbook", ticker.ticker);
                        }}
                        className="text-muted-foreground hover:text-red-500"
                        title={`Hide ${ticker.ticker} from all tabs`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan={6 + classColumns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  No tickers match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
