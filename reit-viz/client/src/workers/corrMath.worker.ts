// Correlation math worker — runs the static-mode N×N matrix compute and HRP
// clustering off the main thread. Kernels live in lib/corrMatrixMath.ts and
// lib/hrp.ts (shared with the callers' inline fallbacks).
//
// Protocol:
//   in:  { type: "matrix", specs, allData, mode, window, transform, lagBars }
//        { type: "hrp", corr, vols, k }
//   out: { type: "result", result }
//        { type: "error", error }
import { computeMatrixFromSeries } from "@/lib/corrMatrixMath";
import { hrpCluster } from "@/lib/hrp";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg) return;
  try {
    if (msg.type === "matrix") {
      const result = await computeMatrixFromSeries(
        msg.specs, msg.allData, msg.mode, msg.window, msg.transform, msg.lagBars);
      (self as any).postMessage({ type: "result", result });
    } else if (msg.type === "hrp") {
      const result = hrpCluster(msg.corr, msg.vols, msg.k);
      (self as any).postMessage({ type: "result", result });
    }
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
