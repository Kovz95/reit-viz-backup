/**
 * oscillatorOptimizer.worker — real background worker for the Oscillators
 * page's EWO parameter sweep.
 *
 * The original hashed worker chunk (oscillatorOptimizer.worker-C5wv6LuK.js)
 * was lost with the recovered bundle. The stub audit replaced it with a
 * main-thread shim (lib/workerPool.ts runs runEwoDailyScan inline, ignoring
 * the worker factory) — correct results, but a ~15k-config sweep froze the UI
 * for its duration, painfully so on universe runs. This restores the original
 * off-thread architecture around the SAME kernel.
 *
 * Protocol: in {type:"run"|"ewo", id?, ticker, name, closes, highs, lows,
 * params} → out {type:"result", id, result} | {type:"error", id, error}.
 */
import { runEwoDailyScan, type EwoTask } from "@/lib/workerPool";

self.onmessage = async (e: MessageEvent) => {
  const task = e.data as EwoTask & { type?: string; id?: number };
  if (!task || (task.type !== "run" && task.type !== "ewo") || !Array.isArray((task as any).closes)) return;
  try {
    const result = await runEwoDailyScan(task, () => false);
    (self as any).postMessage({ type: "result", id: task.id, result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", id: task.id, error: String(err?.message ?? err) });
  }
};

export {};
