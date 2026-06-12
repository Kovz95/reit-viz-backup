// Hand-written from call-site inference
// FORWARD_HORIZONS used in PairOptimizer.tsx, ValuationRegime.tsx

export interface HorizonDef {
  label: string;
  days: number;
}

export const FORWARD_HORIZONS: HorizonDef[] = [
  { label: "1d",  days: 1   },
  { label: "1w",  days: 5   },
  { label: "1m",  days: 21  },
  { label: "3m",  days: 63  },
  { label: "6m",  days: 126 },
  { label: "12m", days: 252 },
];
