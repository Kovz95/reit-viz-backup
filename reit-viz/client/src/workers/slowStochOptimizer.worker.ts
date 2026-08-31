// Slow Stochastic optimizer worker — runs the grid sweep off the main thread.
// Kernel lives in lib/slowStochSweep.ts (shared with the page's inline
// fallback).
//
// Protocol:
//   in:  { type: "run", ticker, name, closes, highs, lows, opts }
//   out: { type: "progress", done, total }
//        { type: "result", result: TickerStochResult | null }
//        { type: "error", error }
import { runStochOptimizer } from "@/lib/slowStochSweep";

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = await runStochOptimizer(
      msg.ticker, msg.name, msg.closes, msg.highs, msg.lows, msg.opts,
      (done, total) => { (self as any).postMessage({ type: "progress", done, total }); },
    );
    (self as any).postMessage({ type: "result", result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", error: err?.message ?? String(err) });
  }
};
