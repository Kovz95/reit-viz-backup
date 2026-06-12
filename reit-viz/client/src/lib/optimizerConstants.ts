// Hand-written from call-site inference (PairOptimizer.tsx, ValuationRegime.tsx)

export interface TargetReturnOption {
  label: string;
  value: number;
}

export interface BandOption {
  label: string;
  band: { minReturn: number; maxReturn: number };
}

/** Target forward return thresholds (as decimal fractions) for optimizer "hit rate" mode. */
export const TARGET_RETURN_OPTIONS: TargetReturnOption[] = [
  { label: "0.5%",  value: 0.005 },
  { label: "1%",    value: 0.01  },
  { label: "2%",    value: 0.02  },
  { label: "3%",    value: 0.03  },
  { label: "5%",    value: 0.05  },
  { label: "7%",    value: 0.07  },
  { label: "10%",   value: 0.10  },
];

/** Band options for "band hit rate" mode — returns must fall inside [minReturn, maxReturn]. */
export const BAND_OPTIONS: BandOption[] = [
  { label: "±1%",  band: { minReturn: -0.01, maxReturn: 0.01 } },
  { label: "±2%",  band: { minReturn: -0.02, maxReturn: 0.02 } },
  { label: "±3%",  band: { minReturn: -0.03, maxReturn: 0.03 } },
  { label: "±5%",  band: { minReturn: -0.05, maxReturn: 0.05 } },
  { label: "1–3%", band: { minReturn: 0.01,  maxReturn: 0.03 } },
  { label: "2–5%", band: { minReturn: 0.02,  maxReturn: 0.05 } },
  { label: "3–7%", band: { minReturn: 0.03,  maxReturn: 0.07 } },
];
