// TVA optimizer worker — runs the grid search off the main thread.
// Kernel lives in lib/tvaSweep.ts (shared with the page's inline fallback).
//
// Protocol:
//   in:  { type: "run", payload: TvaSweepPayload }
//   out: { type: "result", result: TvaSweepResult | null }
//        { type: "error", error }
import { runTvaSweep } from "@/lib/tvaSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = await runTvaSweep(msg.payload);
    (self as any).postMessage({ type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
