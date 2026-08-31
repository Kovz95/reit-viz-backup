// RSI Regime optimizer worker — runs the period × OS/OB sweep off the main
// thread. Kernel lives in lib/rsiRegimeSweep.ts (shared with the page's
// inline fallback).
//
// Protocol:
//   in:  { type: "run", payload: RsiSweepPayload }
//   out: { type: "result", result: RsiSweepResult | null }
//        { type: "error", error }
import { runRsiRegimeSweep } from "@/lib/rsiRegimeSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = await runRsiRegimeSweep(msg.payload);
    (self as any).postMessage({ type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
