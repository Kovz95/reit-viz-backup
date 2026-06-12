// Hand-written from call-site inference
// Several pages import ClassificationFilters component and applyClassFilters from @/lib/classificationFilters.
// This module re-exports from the canonical locations.

export {
  default as ClassificationFilters,
  applyClassFilters,
  emptyClassFilters,
  serializeClassFilters,
  deserializeClassFilters,
} from "@/components/ClassificationFilters";

export type { ClassFilters } from "@/components/ClassificationFilters";
