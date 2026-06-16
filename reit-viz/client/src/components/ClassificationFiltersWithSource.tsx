// Reconstructed from recovered-bundle/ClassificationFiltersWithSource-D7v4WOtR.js on 2026-06-11

import { useState, useCallback, useMemo } from "react";
import { emptyClassFilters, ClassFilters } from "@/lib/dataService";
import { ClassificationFilters } from "@/lib/classificationFilters";
import { useGlobalUniverse } from "@/lib/globalUniverse";

interface ClassificationFiltersWithSourceProps {
  workbookTickers: any[];
  filters: ClassFilters;
  onFiltersChange: (filters: ClassFilters) => void;
  search: string;
  onSearchChange: (search: string) => void;
  manualTickers: Set<string>;
  onManualTickersChange: (tickers: Set<string>) => void;
  filteredCount: number;
  totalCount: number;
  testIdPrefix: string;
  source?: string;
  onSourceChange?: (source: string) => void;
}

export function ClassificationFiltersWithSource({
  workbookTickers,
  filters,
  onFiltersChange,
  search,
  onSearchChange,
  manualTickers,
  onManualTickersChange,
  filteredCount,
  totalCount,
  testIdPrefix,
  source: sourceProp,
  onSourceChange,
}: ClassificationFiltersWithSourceProps) {
  const [localSource, setLocalSource] = useState("workbook");
  const effectiveSource = sourceProp ?? localSource;
  const { metas, loading, error } = useGlobalUniverse();

  const handleSourceChange = useCallback(
    (newSource: string) => {
      if (newSource !== effectiveSource) {
        onFiltersChange(emptyClassFilters());
        onSearchChange("");
        onManualTickersChange(new Set());
        if (onSourceChange) {
          onSourceChange(newSource);
        } else {
          setLocalSource(newSource);
        }
      }
    },
    [effectiveSource, onFiltersChange, onSearchChange, onManualTickersChange, onSourceChange]
  );

  const globalTickerPool = useMemo(() => {
    if (effectiveSource === "global") return loading || error ? [] : metas;
  }, [effectiveSource, loading, error, metas]);

  const workbookCount = workbookTickers?.length ?? 0;

  return (
    <div className="flex flex-col gap-2 w-full">
      <div
        className="flex items-center gap-2 text-xs"
        data-testid={`${testIdPrefix}-universe-source`}
      >
        <span className="text-slate-400 uppercase tracking-wide">
          Universe Source:
        </span>
        <button
          type="button"
          onClick={() => handleSourceChange("workbook")}
          className={`px-2 py-1 rounded border transition-colors ${
            effectiveSource === "workbook"
              ? "bg-sky-500/20 border-sky-500/60 text-sky-200"
              : "bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
          }`}
          data-testid={`${testIdPrefix}-source-workbook`}
        >
          REIT Workbook ({workbookCount})
        </button>
        <button
          type="button"
          onClick={() => handleSourceChange("global")}
          className={`px-2 py-1 rounded border transition-colors ${
            effectiveSource === "global"
              ? "bg-sky-500/20 border-sky-500/60 text-sky-200"
              : "bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
          }`}
          data-testid={`${testIdPrefix}-source-global`}
          title="FactSet/RBICS GLOBAL universe (~9,000 tickers, Yahoo-priced)"
        >
          Global{" "}
          {effectiveSource === "global"
            ? loading
              ? "(loading…)"
              : `(${metas.length.toLocaleString()})`
            : "(~9k)"}
        </button>
        {effectiveSource === "global" && error && (
          <span className="text-rose-400" title={error}>
            load error
          </span>
        )}
      </div>
      <ClassificationFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        search={search}
        onSearchChange={onSearchChange}
        manualTickers={manualTickers}
        onManualTickersChange={onManualTickersChange}
        filteredCount={filteredCount}
        totalCount={effectiveSource === "global" ? globalTickerPool?.length ?? 0 : totalCount}
        testIdPrefix={testIdPrefix}
        tickerPoolOverride={globalTickerPool}
      />
    </div>
  );
}

export { ClassificationFiltersWithSource as C };
