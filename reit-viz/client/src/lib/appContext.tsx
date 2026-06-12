// Hand-written from call-site inference
// appContext provides a shared app-level state consumed by pages.
// Primary fields inferred from call-site destructuring across all reconstructed pages.
// It mirrors/proxies the UniverseContext so pages don't need two context imports.

import { useUniverse } from "@/lib/universeContext";

export interface AppContextValue {
  /** Set of ticker symbols currently passing the universe filter; null = all tickers. */
  universeTickers: Set<string> | null;
  /** True when any universe filter is active. */
  isFiltered: boolean;
  /** Count of tickers in the current filtered universe. */
  filteredCount: number;
  /** Total ticker count (no filter). */
  totalCount: number;
  /** All ticker metadata from the workbook. */
  allTickers: any[];
  /** Filtered ticker metadata list. */
  filteredTickersList: any[];
  /** Classification filter object. */
  filters: any;
  /** Setter for filters. */
  setFilters: (f: any) => void;
  /** Text search string. */
  search: string;
  /** Setter for search. */
  setSearch: (s: string) => void;
  /** Set of manually-added ticker symbols. */
  manualTickers: Set<string>;
  /** Setter for manualTickers. */
  setManualTickers: (m: Set<string>) => void;
}

/**
 * Returns shared application context.
 * Delegates to UniverseContext so all pages see the same filtered ticker set.
 */
export function useAppContext(): AppContextValue {
  return useUniverse() as unknown as AppContextValue;
}

// Also export under alternate name some pages use
export { useAppContext as default };
