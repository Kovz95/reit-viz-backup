// Hand-written — CLASSIFICATION_KEYS used in Distributions.tsx, PremiumDiscountScreener.tsx
export const CLASSIFICATION_KEYS = [
  "economy",
  "sector",
  "subsector",
  "industryGroup",
  "industry",
  "subindustry",
] as const;

export type ClassificationKey = typeof CLASSIFICATION_KEYS[number];
