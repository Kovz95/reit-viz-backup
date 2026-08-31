// Combo optimizer worker — runs the trigger × filters² sweep off the main
// thread. Kernel lives in lib/comboSweep.ts (shared with the page's inline
// fallback).
//
// Protocol:
//   in:  { type: "run", payload: ComboSweepPayload }
//   out: { type: "result", result: ComboSweepResult | null }
//        { type: "error", error }
import { runComboSweep } from "@/lib/comboSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = await runComboSweep(msg.payload);
    (self as any).postMessage({ type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
