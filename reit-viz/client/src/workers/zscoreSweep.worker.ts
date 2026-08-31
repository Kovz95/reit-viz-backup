// Z-Score optimizer worker — runs the per-ticker window sweep off the main
// thread. Kernel lives in lib/zscoreSweep.ts (shared with the page's inline
// fallback).
//
// Protocol:
//   in:  { type: "run", payload: ZscoreSweepPayload }
//   out: { type: "result", result: WindowResult[] }
//        { type: "error", error }
import { runZscoreSweep } from "@/lib/zscoreSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = await runZscoreSweep(msg.payload);
    (self as any).postMessage({ type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
