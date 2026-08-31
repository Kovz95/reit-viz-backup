// Dual-MA optimizer worker — runs the grid search off the main thread.
// Kernel lives in lib/dualMaSweep.ts (shared with the page's inline fallback).
//
// Protocol:
//   in:  { type: "run", prices, cfg, topK, barsPerYear }
//   out: { type: "result", result: ParamResult[] }
//        { type: "error", error }
import { runDualMaSweep } from "@/lib/dualMaSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = await runDualMaSweep(msg.prices, msg.cfg, msg.topK, msg.barsPerYear);
    (self as any).postMessage({ type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
