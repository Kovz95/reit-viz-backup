// Hand-written stub — useUniverseDefaults provides default metric selections
// for pages that need to pick a starting metric from available ones.

import { useMemo } from "react";
import { useUniverse } from "@/lib/universeContext";

export interface UniverseDefaults {
  /** Whether universe data is available. */
  available: boolean;
  /** Suggested default valuation metric. */
  valuationMetric: string;
  /** Suggested default growth metric. */
  growthMetric: string;
}

export function useUniverseDefaults(): UniverseDefaults {
  const { allTickers } = useUniverse();

  return useMemo<UniverseDefaults>(
    () => ({
      available: allTickers.length > 0,
      valuationMetric: "P/FFO FY2",
      growthMetric:    "FFO FY1",
    }),
    [allTickers.length]
  );
}
