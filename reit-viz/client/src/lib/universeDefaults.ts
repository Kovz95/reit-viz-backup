// Hand-written stub — useUniverseDefaults provides default metric selections
// for pages that need to pick a starting metric from available ones.

import { useMemo } from "react";
import { useUniverse } from "@/lib/universeContext";

export interface UniverseDefaults {
  /** Set of available metric names. Callers use .size and .has() to check availability. */
  available: Set<string>;
  /** Suggested default valuation metric. */
  valuationMetric: string;
  /** Suggested default growth metric. */
  growthMetric: string;
}

export function useUniverseDefaults(): UniverseDefaults {
  const { allTickers } = useUniverse();

  return useMemo<UniverseDefaults>(
    () => {
      // Derive available metric names from the first ticker's metrics list
      const metricSet = new Set<string>();
      for (const t of allTickers) {
        if (Array.isArray(t.metrics)) {
          for (const m of t.metrics) metricSet.add(m);
        }
      }
      return {
        available: metricSet,
        valuationMetric: "P/FFO FY2",
        growthMetric:    "FFO FY1",
      };
    },
    [allTickers]
  );
}
