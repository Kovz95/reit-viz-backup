// Legacy re-export shim. The unrouted Support/Resistance page shell that used
// to live here was removed (2026-08-04) — the live surface is /levels
// (LevelsAndTrendlines). Consumers only ever imported the detector + config,
// which live in lib/srLevels.
export { DEFAULT_SR_CONFIG as D, detectSRLevels as d } from "@/lib/srLevels";
