// ROC optimizer worker — runs the config sweep (Optimize tab) and the grid
// search (Grid tab) off the main thread. Kernels live in lib/rocSweep.ts
// (shared with the page's inline fallbacks).
//
// Protocol:
//   in:  { type: "run",  payload: RocSweepPayload }
//        { type: "grid", payload: RocGridSweepPayload }
//   out: { type: "progress", done, total }   (grid only)
//        { type: "result", result }
//        { type: "error", error }
import { runRocSweep, runRocGridSweep } from "@/lib/rocSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg) return;
  try {
    if (msg.type === "run") {
      const result = await runRocSweep(msg.payload);
      (self as any).postMessage({ type: "result", result });
    } else if (msg.type === "grid") {
      const result = await runRocGridSweep(msg.payload, (done, total) => {
        (self as any).postMessage({ type: "progress", done, total });
      });
      (self as any).postMessage({ type: "result", result });
    }
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
