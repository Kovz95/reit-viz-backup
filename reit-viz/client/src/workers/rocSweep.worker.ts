// ROC optimizer worker — runs the config sweep off the main thread.
// Kernel lives in lib/rocSweep.ts (shared with the page's inline fallback).
//
// Protocol:
//   in:  { type: "run", payload: RocSweepPayload }
//   out: { type: "result", result: RocSweepResult | null }
//        { type: "error", error }
import { runRocSweep } from "@/lib/rocSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = await runRocSweep(msg.payload);
    (self as any).postMessage({ type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
