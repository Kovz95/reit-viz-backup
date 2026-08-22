/**
 * Shared classification filter bar used across Performance, Ranking, Scatter,
 * Valuation, DividendSpread, and Heatmap pages.
 *
 * Features:
 * - 6 multi-select dropdowns (Economy, Sector, Subsector, Industry Group, Industry, Subindustry)
 *   — each with in-dropdown search
 *   — dropdowns with only 1 unique value are auto-hidden
 * - Ticker search input
 * - Manual ticker add (type a ticker symbol to force-include it)
 * - Clear all button
 * - Ticker count display
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { getTickers } from "@/lib/dataService";
import type { ClassifiedBase } from "@/lib/dataService";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Filter,
  X,
  ChevronDown,
  Check,
  Plus,
} from "lucide-react";

// ---- Constants ----
const CLASSIFICATION_FIELDS = [
  { key: "economy" as const, label: "Economy" },
  { key: "sector" as const, label: "Sector" },
  { key: "subsector" as const, label: "Subsector" },
  { key: "industryGroup" as const, label: "Ind. Group" },
  { key: "industry" as const, label: "Industry" },
  { key: "subindustry" as const, label: "Subindustry" },
];

type ClassKey = "economy" | "sector" | "subsector" | "industryGroup" | "industry" | "subindustry";

export type ClassFilters = Record<ClassKey, Set<string>>;

export function emptyClassFilters(): ClassFilters {
  return {
    economy: new Set(),
    sector: new Set(),
    subsector: new Set(),
    industryGroup: new Set(),
    industry: new Set(),
    subindustry: new Set(),
  };
}

/** Serialize ClassFilters to a JSON-safe object (Sets → arrays) */
export function serializeClassFilters(filters: ClassFilters): Record<ClassKey, string[]> {
  const result: Record<string, string[]> = {};
  for (const key of Object.keys(filters) as ClassKey[]) {
    result[key] = [...filters[key]];
  }
  return result as Record<ClassKey, string[]>;
}

/** Restore ClassFilters from serialized form (arrays → Sets) */
export function deserializeClassFilters(raw: any): ClassFilters {
  const base = emptyClassFilters();
  if (!raw || typeof raw !== "object") return base;
  for (const key of Object.keys(base) as ClassKey[]) {
    const v = raw[key];
    if (Array.isArray(v)) {
      base[key] = new Set(v);
    } else if (v && typeof v === "object" && typeof v.has === "function") {
      // Already a Set (in-memory restore)
      base[key] = v;
    }
    // else: corrupted or empty {} from old JSON serialization — leave as empty Set
  }
  return base;
}

/** Apply classification filters + search + manual tickers to any array with ClassifiedBase fields */
export function applyClassFilters<T extends ClassifiedBase>(
  rows: T[],
  filters: ClassFilters,
  search: string,
  manualTickers: Set<string>,
): T[] {
  let result = rows;

  // Apply classification filters
  for (const { key } of CLASSIFICATION_FIELDS) {
    const sel = filters[key];
    if (sel.size > 0) {
      result = result.filter((r) => sel.has((r as any)[key]));
    }
  }

  // Apply text search
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (r) =>
        r.ticker.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
    );
  }

  // Merge back manually added tickers (union with filtered results)
  if (manualTickers.size > 0) {
    const inResult = new Set(result.map((r) => r.ticker));
    const extras = rows.filter(
      (r) => manualTickers.has(r.ticker) && !inResult.has(r.ticker)
    );
    result = [...result, ...extras];
  }

  return result;
}

// ---- Multi-select dropdown with search ----
// Exported so other filter bars (e.g. the Universe tab's Nation / Exchange
// filters) can reuse the exact same multi-select idiom.
export function FilterDropdown({
  label,
  options,
  selected,
  onChange,
  testId,
  counts,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  testId: string;
  /** Optional per-option ticker count, shown right-aligned next to each option. */
  counts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [ddSearch, setDdSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setDdSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(next);
  };

  const filteredOptions = useMemo(() => {
    if (!ddSearch) return options;
    const q = ddSearch.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, ddSearch]);

  const displayText = selected.size === 0
    ? `All`
    : selected.size === 1
      ? [...selected][0]
      : `${selected.size} sel.`;

  // Always show all 6 classification levels, even if only 1 value
  // (new workbooks with different sectors may have many values)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(!open); setDdSearch(""); }}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors whitespace-nowrap ${
          selected.size > 0
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30"
        }`}
        data-testid={testId}
      >
        <Filter className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="font-medium">{label}:</span>
        <span className="whitespace-nowrap">{displayText}</span>
        <ChevronDown className={`w-2.5 h-2.5 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-60 max-h-72 rounded-md border border-border bg-popover shadow-lg flex flex-col">
          {/* Search inside dropdown */}
          <div className="p-1.5 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                className="w-full h-6 pl-7 pr-2 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={`Search ${label.toLowerCase()}...`}
                value={ddSearch}
                onChange={(e) => setDdSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-auto flex-1 p-1">
            <button
              className="flex items-center gap-2 w-full px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent rounded"
              onClick={() => onChange(new Set())}
            >
              <span className="w-3 h-3" />
              Clear all
            </button>
            {filteredOptions.map((opt) => (
              <button
                key={opt}
                className="flex items-center gap-2 w-full px-2 py-0.5 text-xs hover:bg-accent rounded"
                onClick={() => toggle(opt)}
              >
                <span className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                  {selected.has(opt) && <Check className="w-3 h-3 text-primary" />}
                </span>
                <span className="truncate text-left flex-1">{opt}</span>
                {counts && counts[opt] != null && (
                  <span className="flex-shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                    {counts[opt]}
                  </span>
                )}
              </button>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Reusable Charts-carousel-style classification filtering ----
// One hook + one chip-row component so every ticker picker popover in the app
// can offer the same six-level filter bar as the Charts ticker carousel.

/** Local classification filter state + options/filtering derived from any ticker list. */
export function useTickerClassFilter<T extends { ticker: string }>(tickers: T[]) {
  const [classFilters, setClassFilters] = useState<ClassFilters>(() => emptyClassFilters());

  const classOptions = useMemo(() => {
    const opts: Record<string, Set<string>> = {};
    for (const { key } of CLASSIFICATION_FIELDS) opts[key] = new Set();
    for (const t of tickers || []) {
      for (const { key } of CLASSIFICATION_FIELDS) {
        const v = (t as any)[key];
        if (v) opts[key].add(v);
      }
    }
    const out: Record<string, string[]> = {};
    for (const { key } of CLASSIFICATION_FIELDS) out[key] = [...opts[key]].sort();
    return out as Record<ClassKey, string[]>;
  }, [tickers]);

  const filtered = useMemo(() => {
    let out = tickers || [];
    for (const { key } of CLASSIFICATION_FIELDS) {
      const sel = classFilters[key];
      if (sel.size > 0) out = out.filter((t) => sel.has((t as any)[key]));
    }
    return out;
  }, [tickers, classFilters]);

  const anyActive = Object.values(classFilters).some((s) => s.size > 0);

  return { classFilters, setClassFilters, classOptions, filtered, anyActive };
}

/** The chip row rendered at the top of a picker popover. Fields with ≤1 unique
 *  value are auto-hidden (matches the Charts carousel behavior). Renders
 *  nothing when the ticker list carries no classification metadata. */
export function ClassFilterRow({
  filters,
  onChange,
  options,
  testIdPrefix,
}: {
  filters: ClassFilters;
  onChange: (f: ClassFilters) => void;
  options: Record<string, string[]>;
  testIdPrefix: string;
}) {
  const shown = CLASSIFICATION_FIELDS.filter((f) => (options[f.key]?.length ?? 0) > 1);
  if (shown.length === 0) return null;
  const anyActive = Object.values(filters).some((s) => s.size > 0);
  return (
    <div className="flex flex-wrap items-center gap-1 p-1.5 border-b border-border">
      {shown.map((f) => (
        <FilterDropdown
          key={f.key}
          label={f.label}
          options={options[f.key] || []}
          selected={filters[f.key] || new Set()}
          onChange={(next) => onChange({ ...filters, [f.key]: next })}
          testId={`${testIdPrefix}-filter-${f.key}`}
        />
      ))}
      {anyActive && (
        <button
          onClick={() => onChange(emptyClassFilters())}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-muted-foreground hover:text-destructive"
          data-testid={`${testIdPrefix}-filter-clear`}
        >
          <X className="w-2.5 h-2.5" />
          Clear
        </button>
      )}
    </div>
  );
}

// ---- Manual ticker add component ----
function ManualTickerAdd({
  tickerMeta,
  manualTickers,
  onAdd,
  onRemove,
  allowUnknown = false,
}: {
  tickerMeta: { ticker: string; name: string }[];
  manualTickers: Set<string>;
  onAdd: (t: string) => void;
  onRemove: (t: string) => void;
  /** Accept symbols absent from the workbook list (off-universe Yahoo names). */
  allowUnknown?: boolean;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = useMemo(() => {
    if (!input || input.length < 1) return [];
    const q = input.toLowerCase();
    // Match on ticker symbol OR company name. Prefix matches rank above
    // substring matches so typing a ticker still surfaces it first.
    const scored = tickerMeta
      .filter((t) => !manualTickers.has(t.ticker))
      .map((t) => {
        const tk = t.ticker.toLowerCase();
        const nm = (t.name || "").toLowerCase();
        let score = -1;
        if (tk.startsWith(q)) score = 0;
        else if (nm.startsWith(q)) score = 1;
        else if (tk.includes(q)) score = 2;
        else if (nm.includes(q)) score = 3;
        return { t, score };
      })
      .filter((s) => s.score >= 0)
      .sort((a, b) => a.score - b.score || a.t.ticker.localeCompare(b.t.ticker))
      .slice(0, 8);
    return scored.map((s) => s.t);
  }, [input, tickerMeta, manualTickers]);

  const addTicker = (t: string) => {
    onAdd(t);
    setInput("");
    setShowSuggestions(false);
  };

  // A plausible raw Yahoo symbol (AAPL, BRK-B, ^GSPC, EURUSD=X) for allowUnknown.
  const rawSymbol = allowUnknown && /^[A-Za-z0-9.^=-]{1,12}$/.test(input.trim())
    ? input.trim().toUpperCase()
    : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && input) {
      const q = input.toLowerCase();
      // Exact ticker/name match wins; otherwise fall back to the top suggestion.
      const exact = tickerMeta.find(
        (t) => t.ticker.toLowerCase() === q || (t.name || "").toLowerCase() === q,
      );
      const pick = exact ?? suggestions[0];
      if (pick) addTicker(pick.ticker);
      else if (rawSymbol) addTicker(rawSymbol);
    }
  };

  return (
    <div ref={ref} className="flex items-center gap-1">
      <div className="relative">
        <Plus className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <input
          className="h-6 pl-6 pr-2 w-40 text-[11px] bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Add ticker or name"
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          data-testid="manual-ticker-input"
        />
        {showSuggestions && (suggestions.length > 0 || rawSymbol) && (
          <div className="absolute z-50 mt-1 w-56 max-h-48 overflow-auto rounded-md border border-border bg-popover shadow-lg p-1">
            {suggestions.map((s) => (
              <button
                key={s.ticker}
                className="flex items-center gap-2 w-full px-2 py-0.5 text-xs text-left hover:bg-accent rounded"
                onClick={() => addTicker(s.ticker)}
              >
                <span className="font-mono flex-shrink-0">{s.ticker}</span>
                <span className="truncate text-muted-foreground">{s.name}</span>
              </button>
            ))}
            {rawSymbol && !suggestions.some((s) => s.ticker === rawSymbol) && !manualTickers.has(rawSymbol) && (
              <button
                className="flex items-center gap-2 w-full px-2 py-0.5 text-xs text-left hover:bg-accent rounded"
                onClick={() => addTicker(rawSymbol)}
                data-testid="manual-ticker-add-unknown"
              >
                <span className="font-mono flex-shrink-0">{rawSymbol}</span>
                <span className="truncate text-muted-foreground">add off-universe (Yahoo)</span>
              </button>
            )}
          </div>
        )}
      </div>
      {/* Show manual ticker chips */}
      {[...manualTickers].map((t) => (
        <span
          key={t}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-mono"
        >
          {t}
          <button
            className="hover:text-destructive"
            onClick={() => onRemove(t)}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}

// ---- Main exported component ----
export interface ClassificationFiltersProps {
  /** Current filter state */
  filters: ClassFilters;
  onFiltersChange: (f: ClassFilters) => void;
  /** Text search */
  search: string;
  onSearchChange: (s: string) => void;
  /** Manually added tickers */
  manualTickers: Set<string>;
  onManualTickersChange: (s: Set<string>) => void;
  /** Counts for display */
  filteredCount: number;
  totalCount: number;
  /** Optional: extra controls to render after filters (e.g. CSV export button) */
  children?: React.ReactNode;
  /** Data test ID prefix */
  testIdPrefix?: string;
  /** Optional ticker pool to filter against instead of the default workbook universe */
  tickerPoolOverride?: any[];
  /** Optional extra filter controls rendered right after the classification
   *  dropdowns (e.g. Country / Exchange geo filters). */
  extraFilters?: React.ReactNode;
  /** Let the manual add accept symbols absent from the workbook list
   *  (off-universe Yahoo names like AAPL). The page must handle them itself. */
  allowUnknownTickers?: boolean;
}

export default function ClassificationFilters({
  filters,
  onFiltersChange,
  search,
  onSearchChange,
  manualTickers,
  onManualTickersChange,
  filteredCount,
  totalCount,
  children,
  testIdPrefix = "clf",
  tickerPoolOverride,
  extraFilters,
  allowUnknownTickers = false,
}: ClassificationFiltersProps) {
  // Fetch ticker metadata for filter options
  const { data: tickersMeta } = useQuery({
    queryKey: ["/clf-tickers"],
    queryFn: getTickers,
  });

  // tickerPoolOverride swaps the pool the dropdown options + manual-add
  // suggestions derive from (e.g. the ~9.4k global universe instead of the
  // workbook when a page's Universe Source toggle is on "Global").
  const optionPool = tickerPoolOverride ?? tickersMeta;

  // Compute unique options per classification field
  const filterOptions = useMemo(() => {
    if (!optionPool) return {} as Record<ClassKey, string[]>;
    const opts: Record<string, Set<string>> = {};
    for (const { key } of CLASSIFICATION_FIELDS) opts[key] = new Set();
    for (const t of optionPool) {
      for (const { key } of CLASSIFICATION_FIELDS) {
        const val = (t as any)[key];
        if (val) opts[key].add(val);
      }
    }
    const result: Record<string, string[]> = {};
    for (const { key } of CLASSIFICATION_FIELDS) {
      result[key] = [...opts[key]].sort();
    }
    return result as Record<ClassKey, string[]>;
  }, [optionPool]);

  const tickerMetaList = useMemo(
    () => (optionPool || []).map((t: any) => ({ ticker: t.ticker, name: t.name })),
    [optionPool]
  );

  const updateFilter = useCallback(
    (key: ClassKey, next: Set<string>) => {
      onFiltersChange({ ...filters, [key]: next });
    },
    [filters, onFiltersChange]
  );

  const hasActiveFilters =
    Object.values(filters).some((s) => s.size > 0) ||
    search !== "" ||
    manualTickers.size > 0;

  const clearAll = useCallback(() => {
    onFiltersChange(emptyClassFilters());
    onSearchChange("");
    onManualTickersChange(new Set());
  }, [onFiltersChange, onSearchChange, onManualTickersChange]);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Classification dropdowns */}
      {CLASSIFICATION_FIELDS.map(({ key, label }) => (
        <FilterDropdown
          key={key}
          label={label}
          options={filterOptions[key] || []}
          selected={filters[key]}
          onChange={(next) => updateFilter(key, next)}
          testId={`${testIdPrefix}-filter-${key}`}
        />
      ))}

      {/* Extra filter controls (e.g. Country / Exchange) */}
      {extraFilters}

      <div className="h-4 w-px bg-border mx-0.5" />

      {/* Text search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <input
          className="h-6 pl-7 pr-2 w-44 text-[11px] bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Search ticker or name..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid={`${testIdPrefix}-search`}
        />
      </div>

      {/* Manual ticker add */}
      <ManualTickerAdd
        tickerMeta={tickerMetaList}
        allowUnknown={allowUnknownTickers}
        manualTickers={manualTickers}
        onAdd={(t) => {
          const next = new Set(manualTickers);
          next.add(t);
          onManualTickersChange(next);
        }}
        onRemove={(t) => {
          const next = new Set(manualTickers);
          next.delete(t);
          onManualTickersChange(next);
        }}
      />

      <div className="h-4 w-px bg-border mx-0.5" />

      {/* Count + clear */}
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
        {filteredCount} / {totalCount}
      </span>
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[11px]"
          onClick={clearAll}
          data-testid={`${testIdPrefix}-clear`}
        >
          <X className="w-3 h-3 mr-0.5" />
          Clear
        </Button>
      )}

      {/* Extra controls (e.g. export buttons) */}
      {children}
    </div>
  );
}
