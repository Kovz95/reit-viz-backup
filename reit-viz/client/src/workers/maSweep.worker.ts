// MA Crossover optimizer worker — runs the MA-combo sweep (Optimize tab) and
// the Find-Best-Combo grid search (Grid tab) off the main thread. Kernels
// live in lib/maSweep.ts (shared with the page's inline fallbacks).
//
// Protocol:
//   in:  { type: "run",  payload: MaSweepPayload }
//        { type: "grid", payload: MaGridSweepPayload }
//   out: { type: "progress", done, total }   (grid only)
//        { type: "result", result }
//        { type: "error", error }
import { runMaSweep, runMaGridSweep } from "@/lib/maSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg) return;
  try {
    if (msg.type === "run") {
      const result = await runMaSweep(msg.payload);
      (self as any).postMessage({ type: "result", result });
    } else if (msg.type === "grid") {
      const result = await runMaGridSweep(msg.payload, (done, total) => {
        (self as any).postMessage({ type: "progress", done, total });
      });
      (self as any).postMessage({ type: "result", result });
    }
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
