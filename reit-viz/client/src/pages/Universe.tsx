// Reconstructed from recovered-bundle/Universe-s8lkGiqo.js on 2026-06-11

import { useState, useMemo, useEffect, useRef } from "react";
import { useUniverse } from "@/lib/universeContext";
import { useReclassificationOverrides } from "@/lib/reclassificationOverrides";
import { useExcludedTickers } from "@/lib/excludedTickers";
import { CLASSIFICATION_KEYS } from "@/lib/dataService";
import { usePageState } from "@/lib/pageState";
import {
  Globe,
  Filter,
  RotateCcw,
  Pencil,
  Download,
  Upload,
  Trash2,
  EyeOff,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassificationFilters } from "@/lib/classificationFilters";
import { commitClassificationOverride } from "@/lib/reclassificationOverrides";
import {
  importClassificationOverrides,
  resetAllClassificationOverrides,
  revertClassificationOverride,
} from "@/lib/reclassificationOverrides";
import { excludeTicker, restoreExcludedTicker, restoreAllExcluded } from "@/lib/excludedTickers";
import { Undo2 } from "lucide-react";

export default function Universe() {
  const {
    filters,
    setFilters,
    search,
    setSearch,
    manualTickers,
    setManualTickers,
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
  const [editingCell, setEditingCell] = useState<{ ticker: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  const startEdit = (ticker: string, field: string, currentValue: string) => {
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

  const sortedRows = useMemo(() => {
    const rows = [...filteredTickersList];
    rows.sort((a: any, b: any) => {
      const aVal = (a[sortCol] || "").toLowerCase();
      const bVal = (b[sortCol] || "").toLowerCase();
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filteredTickersList, sortCol, sortDir]);

  const filteredSet = useMemo(
    () => new Set(filteredTickersList.map((t: any) => t.ticker)),
    [filteredTickersList]
  );

  const classColumns = [
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
        />
        <div className="flex items-center gap-3 text-[11px]">
          {isFiltered ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20 text-primary">
              <Filter className="w-3 h-3" />
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
              <RotateCcw className="w-3 h-3 mr-0.5" />
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
        {excludedTickers.size > 0 && (
          <div className="flex items-center gap-2 text-[11px]">
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400">
              <EyeOff className="w-3 h-3" />
              <span className="font-medium">{excludedTickers.size}</span>
              <span className="opacity-80">excluded (hidden from all tabs)</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={() => setShowExcluded((v) => !v)}
            >
              {showExcluded ? "Hide list" : "Show list"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground"
              onClick={() => {
                window.confirm(
                  `Restore all ${excludedTickers.size} excluded ticker(s)?`
                ) && restoreAllExcluded("workbook");
              }}
            >
              <Undo2 className="w-3 h-3 mr-0.5" />
              Restore all
            </Button>
          </div>
        )}
        {showExcluded && excludedTickers.size > 0 && (
          <div className="flex flex-wrap gap-1 px-2 py-1.5 rounded bg-red-500/5 border border-red-500/20">
            {[...excludedTickers].sort().map((ticker) => (
              <button
                key={ticker}
                type="button"
                onClick={() => restoreExcludedTicker("workbook", ticker)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-background border border-border text-[10px] font-mono hover:border-primary hover:text-primary"
                title={`Click to restore ${ticker}`}
              >
                {ticker}
                <Undo2 className="w-2.5 h-2.5" />
              </button>
            ))}
          </div>
        )}
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
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-card z-10 border-b border-border text-muted-foreground">
            <tr>
              <th className="w-8 py-1.5 px-2" />
              <SortableHeader col="ticker" label="Ticker" className="w-20" />
              <SortableHeader col="name" label="Name" />
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
                    {inFiltered && <Filter className="w-3 h-3 text-primary" />}
                  </td>
                  <td className="py-1 px-2 font-mono font-bold text-foreground">
                    {ticker.ticker}
                  </td>
                  <td className="py-1 px-2 truncate max-w-[200px]" title={ticker.name}>
                    {ticker.name}
                  </td>
                  {classColumns.map(({ key }) => {
                    const cellValue = ticker[key] || "";
                    const isEditing =
                      editingCell?.ticker === ticker.ticker &&
                      editingCell.field === key;
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
                  colSpan={4 + classColumns.length}
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
