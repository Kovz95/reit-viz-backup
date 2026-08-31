// Pair optimizer worker — runs the z-window sweep off the main thread.
// Kernel lives in lib/pairSweep.ts (shared with the page's inline fallback).
// The payload's metric/close Maps arrive intact via structured clone.
//
// Protocol:
//   in:  { type: "run", payload: PairSweepPayload }
//   out: { type: "result", result: PairResult | null }
//        { type: "error", error }
import { runPairSweep } from "@/lib/pairSweep";

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = runPairSweep(msg.payload);
    (self as any).postMessage({ type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
