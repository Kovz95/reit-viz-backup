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
import { runEwoDailyScan, runEwoCoarseScan, type EwoTask, type EwoCoarseTask } from "@/lib/workerPool";

self.onmessage = async (e: MessageEvent) => {
  const task = e.data as (EwoTask | EwoCoarseTask) & { type?: string; id?: number };
  if (!task || !Array.isArray((task as any).closes)) return;
  try {
    let result: any = null;
    if (task.type === "coarse") result = await runEwoCoarseScan(task as EwoCoarseTask, () => false);
    else if (task.type === "run" || task.type === "ewo") result = await runEwoDailyScan(task as EwoTask, () => false);
    else return;
    (self as any).postMessage({ type: "result", id: (task as any).id, result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", id: (task as any).id, error: String(err?.message ?? err) });
  }
};

export {};
