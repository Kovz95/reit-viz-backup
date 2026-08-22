// Liquidity-capacity math: back into the required $ ADV for a position size
// given book AUM (GMV), build window, and participation rate — and invert it
// to the max position each name's ADV can support.
//
//   required ADV = (AUM × pct) ÷ (days × participation)
//   max pos %    = ADV × days × participation ÷ AUM
//
// When "size for the exit" is on, a tier must ALSO be exitable in `exitDays` at
// `exitParticipationPct`, so the binding requirement is the max of the two.
// The stress haircut shrinks each name's ADV (deleveraging tape) before any
// comparison — equivalent to raising every threshold.

export type AdvBasis = "median" | "mean" | "p25";

export interface SizingTier {
  label: string;
  /** Position size as % of AUM/GMV (5 = 5%). */
  pct: number;
}

export interface CapacityConfig {
  /** Gross book size in $ millions. */
  aumMM: number;
  tiers: SizingTier[];
  buildDays: number;
  /** Entry participation as % of a day's volume (15 = 15%). */
  participationPct: number;
  /** Also require the position to be exitable in exitDays at exitParticipationPct. */
  sizeForExit: boolean;
  exitDays: number;
  exitParticipationPct: number;
  /** ADV haircut for a stressed tape, % (35 = ADV × 0.65). 0 = off. */
  stressHaircutPct: number;
  advBasis: AdvBasis;
}

export const DEFAULT_CAPACITY_CONFIG: CapacityConfig = {
  aumMM: 3000,
  tiers: [
    { label: "Core", pct: 5 },
    { label: "Standard", pct: 2.5 },
    { label: "Starter", pct: 1.5 },
  ],
  buildDays: 5,
  participationPct: 15,
  sizeForExit: true,
  exitDays: 2,
  exitParticipationPct: 20,
  stressHaircutPct: 0,
  advBasis: "median",
};

/** $MM ADV needed to run a `pct`% position at the config's build/exit settings. */
export function requiredAdvMM(cfg: CapacityConfig, pct: number): number | null {
  if (!(cfg.aumMM > 0) || !(pct > 0)) return null;
  const posMM = (cfg.aumMM * pct) / 100;
  const entryDenom = cfg.buildDays * (cfg.participationPct / 100);
  const entry = entryDenom > 0 ? posMM / entryDenom : null;
  if (!cfg.sizeForExit) return entry;
  const exitDenom = cfg.exitDays * (cfg.exitParticipationPct / 100);
  const exit = exitDenom > 0 ? posMM / exitDenom : null;
  if (entry == null) return exit;
  if (exit == null) return entry;
  return Math.max(entry, exit);
}

/** Ticker ADV after the stress haircut. */
export function effectiveAdvMM(cfg: CapacityConfig, advMM: number | null | undefined): number | null {
  if (advMM == null || !Number.isFinite(advMM)) return null;
  const h = Math.min(Math.max(cfg.stressHaircutPct, 0), 99) / 100;
  return advMM * (1 - h);
}

/** Largest position (% of AUM) an ADV supports at the config's settings. */
export function maxPositionPct(cfg: CapacityConfig, effAdvMM: number | null): number | null {
  if (effAdvMM == null || !(cfg.aumMM > 0)) return null;
  const entry = effAdvMM * cfg.buildDays * (cfg.participationPct / 100);
  let capMM = entry;
  if (cfg.sizeForExit) {
    const exit = effAdvMM * cfg.exitDays * (cfg.exitParticipationPct / 100);
    capMM = Math.min(entry, exit);
  }
  return (capMM / cfg.aumMM) * 100;
}

export interface TierThreshold {
  tier: SizingTier;
  requiredAdvMM: number;
}

/** Tiers sorted largest-position first, each with its binding required ADV. */
export function tierThresholds(cfg: CapacityConfig): TierThreshold[] {
  return cfg.tiers
    .filter((t) => t.pct > 0)
    .slice()
    .sort((a, b) => b.pct - a.pct)
    .map((tier) => ({ tier, requiredAdvMM: requiredAdvMM(cfg, tier.pct) ?? Infinity }))
    .filter((t) => Number.isFinite(t.requiredAdvMM));
}

/**
 * Index of the best (largest-pct) tier this ADV clears, or thresholds.length
 * when it's below the smallest tier's floor. null ADV → -1 (no data).
 */
export function bucketIndex(thresholds: TierThreshold[], effAdvMM: number | null): number {
  if (effAdvMM == null) return -1;
  for (let i = 0; i < thresholds.length; i++) {
    if (effAdvMM >= thresholds[i].requiredAdvMM) return i;
  }
  return thresholds.length;
}

/** Trading days to fully exit a `pct`% position at the exit participation rate. */
export function exitDaysFor(cfg: CapacityConfig, pct: number, effAdvMM: number | null): number | null {
  if (effAdvMM == null || effAdvMM <= 0 || !(cfg.aumMM > 0) || !(pct > 0)) return null;
  const posMM = (cfg.aumMM * pct) / 100;
  const perDay = effAdvMM * (cfg.exitParticipationPct / 100);
  return perDay > 0 ? posMM / perDay : null;
}
