// Hand-written from call-site inference (PairRatios.tsx)
// useUniverseSignature: returns a memo'd string that changes when the universe filter changes.
// Used as a cache-bust key for workspace state.

import { useMemo } from "react";
import { useUniverse } from "@/lib/universeContext";

export function useUniverseSignature(): string {
  const { filteredTickersList, isFiltered } = useUniverse();

  return useMemo(() => {
    if (!isFiltered) return "all";
    // Hash the sorted ticker list into a compact string
    const sorted = [...filteredTickersList]
      .map((t: any) => t.ticker)
      .sort()
      .join(",");
    return `filtered:${sorted.length}:${sorted.slice(0, 64)}`;
  }, [filteredTickersList, isFiltered]);
}
