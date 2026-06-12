/**
 * Master Universe tab — controls which tickers are loaded/visible across
 * Ranking, XY Scatter, Valuation, Div Spread, Rel Value, and Performance tabs.
 */
import { useState, useMemo } from "react";
import { useUniverse } from "@/lib/universeContext";
import ClassificationFilters from "@/components/ClassificationFilters";
import { type ClassFilters } from "@/components/ClassificationFilters";
import {
  Globe,
  Check,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type SortKey = "ticker" | "name" | "economy" | "sector" | "subsector" | "industryGroup" | "industry" | "subindustry";

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

  const [sortCol, setSortCol] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (col: SortKey) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const sortedTickers = useMemo(() => {
    const list = [...filteredTickersList];
    list.sort((a, b) => {
      const av = ((a as any)[sortCol] || "").toLowerCase();
      const bv = ((b as any)[sortCol] || "").toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filteredTickersList, sortCol, sortDir]);

  const filteredSet = useMemo(
    () => new Set(filteredTickersList.map(t => t.ticker)),
    [filteredTickersList]
  );

  // Always show all 6 classification columns
  const classColumns: { key: SortKey; label: string }[] = [
    { key: "economy", label: "Economy" },
    { key: "sector", label: "Sector" },
    { key: "subsector", label: "Subsector" },
    { key: "industryGroup", label: "Ind. Group" },
    { key: "industry", label: "Industry" },
    { key: "subindustry", label: "Subindustry" },
  ];

  const SortHeader = ({ col, label, className = "" }: { col: SortKey; label: string; className?: string }) => (
    <th
      className={`text-left py-1.5 px-2 font-medium cursor-pointer hover:text-foreground select-none ${className}`}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortCol === col && (
          sortDir === "asc"
            ? <ChevronUp className="w-2.5 h-2.5" />
            : <ChevronDown className="w-2.5 h-2.5" />
        )}
      </span>
    </th>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-card/50 space-y-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold tracking-tight">MASTER UNIVERSE</span>
          <span className="text-[10px] text-muted-foreground">
            Controls ticker universe for Ranking, XY Scatter, Valuation, Div Spread, Rel Value, Performance
          </span>
        </div>

        {/* Classification filters bar */}
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

        {/* Status bar */}
        <div className="flex items-center gap-3 text-[11px]">
          {isFiltered ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20 text-primary">
              <Check className="w-3 h-3" />
              <span className="font-medium">{filteredCount}</span>
              <span className="text-primary/70">of {totalCount} tickers active across all tabs</span>
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
        </div>
      </div>

      {/* Ticker table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-card z-10 border-b border-border text-muted-foreground">
            <tr>
              <th className="w-8 py-1.5 px-2" />
              <SortHeader col="ticker" label="Ticker" className="w-20" />
              <SortHeader col="name" label="Name" />
              {classColumns.map(({ key, label }) => (
                <SortHeader key={key} col={key} label={label} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTickers.map((t, i) => {
              const inUniverse = filteredSet.has(t.ticker);
              return (
                <tr
                  key={t.ticker}
                  className={`border-b border-border/30 ${
                    i % 2 === 0 ? "bg-card/30" : ""
                  } ${!inUniverse ? "opacity-40" : "hover:bg-accent/30"}`}
                  data-testid={`universe-row-${t.ticker}`}
                >
                  <td className="py-1 px-2 text-center">
                    {inUniverse && <Check className="w-3 h-3 text-primary" />}
                  </td>
                  <td className="py-1 px-2 font-mono font-bold text-foreground">{t.ticker}</td>
                  <td className="py-1 px-2 truncate max-w-[200px]" title={t.name}>{t.name}</td>
                  {classColumns.map(({ key }) => (
                    <td key={key} className="py-1 px-2 text-muted-foreground">{(t as any)[key] || ""}</td>
                  ))}
                </tr>
              );
            })}
            {sortedTickers.length === 0 && (
              <tr>
                <td colSpan={3 + classColumns.length} className="py-8 text-center text-muted-foreground">
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
