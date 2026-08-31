// Momentum optimizer worker — runs the horizon × revision sweep off the main
// thread. Kernel lives in lib/momentumSweep.ts (shared with the page's inline
// fallback).
//
// Protocol:
//   in:  { type: "run", payload: MomentumSweepPayload }
//   out: { type: "result", result: MomentumSweepResult | null }
//        { type: "error", error }
import { runMomentumSweep } from "@/lib/momentumSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = await runMomentumSweep(msg.payload);
    (self as any).postMessage({ type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
