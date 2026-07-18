// "Add by group" bulk-add panel — pick classification groups and/or a
// country/exchange and add every matching ticker at once. Extracted from the
// near-identical copies in BasketManager (per-basket cards) and
// basketEditorPanel (the Baskets editor); both render this component now.
//
// The panel owns its own open/filter/geo state. `onAdd` receives the matched
// tickers (uppercased, already excluding `selectedSet`) — the caller decides
// how to merge them (updateBasket vs editor selection).

import { useState, useMemo, useCallback } from "react";
import { ChevronDown, ChevronRight, Layers, Plus, X } from "lucide-react";
import {
  FilterDropdown,
  emptyClassFilters,
  type ClassFilters,
} from "./ClassificationFilters";
import { useGeoFilter } from "@/lib/useGeoFilter";

const CLASS_LEVELS = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Ind. Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
] as const;

type ClassKey = (typeof CLASS_LEVELS)[number]["key"];

interface TickerLike {
  ticker: string;
  [key: string]: any;
}

interface BulkAddByGroupProps {
  /** Universe pool the groups/geo options are derived from. */
  tickers: TickerLike[];
  /** Tickers already selected (uppercased) — excluded from matches. */
  selectedSet: Set<string>;
  /** Called with the matched tickers (uppercased, deduped, minus selectedSet). */
  onAdd: (tickers: string[]) => void;
  /** Testid prefix, e.g. `basket-${id}` or "basket-editor" — renders
   *  `${prefix}-group-toggle`, `${prefix}-class-${key}`, `${prefix}-add-group`,
   *  `${prefix}-group-clear`. */
  testIdPrefix: string;
  /** Persistence key for the country/exchange filter. */
  geoStorageKey: string;
  /** Optional class on the outer wrapper (e.g. "mt-1.5"). */
  className?: string;
}

export default function BulkAddByGroup({
  tickers,
  selectedSet,
  onAdd,
  testIdPrefix,
  geoStorageKey,
  className,
}: BulkAddByGroupProps) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);
  // Country/exchange filter for the bulk-add pool (e.g. "add every UK ticker").
  const geo = useGeoFilter(tickers as any[], geoStorageKey);

  // Distinct values per level from the pool (single-value levels hidden unless
  // already selected, to keep the panel compact).
  const classOptions = useMemo(() => {
    const sets: Record<ClassKey, Set<string>> = {
      economy: new Set(), sector: new Set(), subsector: new Set(),
      industryGroup: new Set(), industry: new Set(), subindustry: new Set(),
    };
    for (const t of tickers) {
      for (const { key } of CLASS_LEVELS) {
        const v = (t as any)[key];
        if (v) sets[key].add(v);
      }
    }
    const out = {} as Record<ClassKey, string[]>;
    for (const { key } of CLASS_LEVELS) out[key] = [...sets[key]].sort();
    return out;
  }, [tickers]);

  // Ticker count per group value, shown next to each option.
  const classCounts = useMemo(() => {
    const counts = {
      economy: {}, sector: {}, subsector: {},
      industryGroup: {}, industry: {}, subindustry: {},
    } as Record<ClassKey, Record<string, number>>;
    for (const t of tickers) {
      for (const { key } of CLASS_LEVELS) {
        const v = (t as any)[key];
        if (v) counts[key][v] = (counts[key][v] || 0) + 1;
      }
    }
    return counts;
  }, [tickers]);

  const anyClassSelected = useMemo(
    () => CLASS_LEVELS.some(({ key }) => classFilters[key].size > 0),
    [classFilters],
  );

  // UNION of every selected group across any level, minus already-selected
  // tickers. A country/exchange selection narrows the pool (and alone selects
  // all its tickers).
  const groupMatches = useMemo(() => {
    if (!anyClassSelected && !geo.hasActiveGeo) return [] as string[];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of geo.filterByGeo(tickers as any[])) {
      let hit = !anyClassSelected; // geo-only selection: every geo match qualifies
      if (!hit) {
        for (const { key } of CLASS_LEVELS) {
          const sel = classFilters[key];
          if (sel.size > 0 && sel.has((t as any)[key])) {
            hit = true;
            break;
          }
        }
      }
      if (!hit) continue;
      const up = String(t.ticker).toUpperCase();
      if (!selectedSet.has(up) && !seen.has(up)) {
        seen.add(up);
        out.push(up);
      }
    }
    return out;
  }, [anyClassSelected, tickers, classFilters, selectedSet, geo.filterByGeo, geo.hasActiveGeo]);

  const addGroup = useCallback(() => {
    if (groupMatches.length === 0) return;
    onAdd(groupMatches);
  }, [groupMatches, onAdd]);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setGroupOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        data-testid={`${testIdPrefix}-group-toggle`}
      >
        {groupOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Layers className="w-3 h-3" />
        Add by group
      </button>
      {groupOpen && (
        <div className="mt-1.5 flex flex-col gap-2 rounded border border-border/60 bg-background/40 p-2">
          <div className="flex flex-wrap items-center gap-1">
            {CLASS_LEVELS.filter(
              ({ key }) => classOptions[key].length > 1 || classFilters[key].size > 0,
            ).map(({ key, label }) => (
              <FilterDropdown
                key={key}
                label={label}
                options={classOptions[key]}
                counts={classCounts[key]}
                selected={classFilters[key]}
                onChange={(next) => setClassFilters((f) => ({ ...f, [key]: next }))}
                testId={`${testIdPrefix}-class-${key}`}
              />
            ))}
            {geo.geoFilterUI}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={groupMatches.length === 0}
              onClick={addGroup}
              className="flex items-center gap-1 rounded bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid={`${testIdPrefix}-add-group`}
            >
              <Plus className="w-3 h-3" />
              Add {groupMatches.length} ticker{groupMatches.length === 1 ? "" : "s"}
            </button>
            <span className="text-[10px] text-muted-foreground">
              {anyClassSelected || geo.hasActiveGeo
                ? `${groupMatches.length} new match${groupMatches.length === 1 ? "" : "es"}`
                : "Pick groups and/or a country/exchange to add them all"}
            </span>
            {anyClassSelected && (
              <button
                type="button"
                onClick={() => setClassFilters(emptyClassFilters())}
                className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                data-testid={`${testIdPrefix}-group-clear`}
              >
                <X className="w-2.5 h-2.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
