// Hand-written re-export — DividendSpread.tsx imports from @/lib/classFilters
// Re-exports the ClassFilters helpers with extra aliases expected by that page.
export {
  emptyClassFilters as makeDefaultFilters,
  serializeClassFilters as serializeFilters,
  deserializeClassFilters as deserializeFilters,
  applyClassFilters as filterTickers,
} from "@/components/ClassificationFilters";

export type { ClassFilters } from "@/components/ClassificationFilters";
