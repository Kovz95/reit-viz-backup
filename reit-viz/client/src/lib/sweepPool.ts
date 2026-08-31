// Shared harness for running optimizer sweeps in Web Workers, following the
// HARSI/Oscillators/Range pattern (RealWorkerPool, hardwareConcurrency-bounded).
// Each task carries a main-thread `inline` fallback — the same lib kernel the
// worker imports — so a failed worker spawn (CSP, dev quirk) degrades to the
// yielding in-page path instead of a dead Run button.
//
// Cancellation note: terminate() kills workers, which leaves any in-flight
// pool.run promise unsettled forever — call it only AFTER the dispatch loop
// has fully drained, never mid-run.
import { RealWorkerPool } from "@/lib/realWorkerPool";

export interface SweepPool {
  /** Worker-pool width — use as the page's dispatch concurrency. */
  size: number;
  run<T>(task: any, inline: () => Promise<T | null>, onProgress?: (msg: any) => void): Promise<T | null>;
  terminate(): void;
}

export function createSweepPool(makeWorker: () => Worker, sizeOverride?: number): SweepPool {
  const size = sizeOverride
    ?? Math.min(Math.max(2, (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4), 8);
  let pool: RealWorkerPool | null = null;
  try { pool = new RealWorkerPool(makeWorker, size); } catch { pool = null; }
  let broken = pool == null;
  return {
    size,
    async run(task, inline, onProgress) {
      if (!broken && pool) {
        try {
          return await pool.run(task, onProgress);
        } catch {
          broken = true; // worker failed to spawn/compile — inline from here on
        }
      }
      return inline();
    },
    terminate() {
      try { pool?.terminate(); } catch { /* already gone */ }
      pool = null;
      broken = true;
    },
  };
}
