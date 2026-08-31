// MA Crossover optimizer worker — runs the MA-combo sweep off the main
// thread. Kernel lives in lib/maSweep.ts (shared with the page's inline
// fallback).
//
// Protocol:
//   in:  { type: "run", payload: MaSweepPayload }
//   out: { type: "result", result: MaSweepResult | null }
//        { type: "error", error }
import { runMaSweep } from "@/lib/maSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = await runMaSweep(msg.payload);
    (self as any).postMessage({ type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
