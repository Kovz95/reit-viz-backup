// Minimal pool over REAL Web Workers for the reconstructed optimizer kernels.
// (lib/workerPool.ts is a main-thread shim kept for the Oscillators EWO path —
// its factory argument is ignored, which silently no-ops any caller that
// actually needs a worker. This one really spawns them.)
//
// Protocol per task: postMessage(task) → resolve on {type:"result"} (with
// .result) or reject on {type:"error"}; {type:"progress"} messages are
// forwarded to onProgress when provided.

export class RealWorkerPool {
  private factory: () => Worker;
  private idle: Worker[] = [];
  private all: Worker[] = [];
  private size: number;
  private waiters: ((w: Worker) => void)[] = [];
  private terminated = false;

  constructor(factory: () => Worker, size: number) {
    this.factory = factory;
    this.size = Math.max(1, size);
  }

  private acquire(): Promise<Worker> {
    if (this.idle.length > 0) return Promise.resolve(this.idle.pop()!);
    if (this.all.length < this.size) {
      const w = this.factory();
      this.all.push(w);
      return Promise.resolve(w);
    }
    return new Promise((res) => this.waiters.push(res));
  }

  private release(w: Worker) {
    if (this.terminated) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter(w);
    else this.idle.push(w);
  }

  run<T = any>(task: any, onProgress?: (msg: any) => void): Promise<T | null> {
    if (this.terminated) return Promise.resolve(null);
    return this.acquire().then(
      (worker) =>
        new Promise<T | null>((resolve, reject) => {
          const onMsg = (e: MessageEvent) => {
            const msg = e.data;
            if (!msg) return;
            if (msg.type === "progress") {
              onProgress?.(msg);
            } else if (msg.type === "result") {
              cleanup();
              resolve(msg.result ?? null);
            } else if (msg.type === "error") {
              cleanup();
              reject(new Error(msg.error));
            }
          };
          const onErr = (e: ErrorEvent) => {
            cleanup();
            reject(new Error(e.message || "worker error"));
          };
          const cleanup = () => {
            worker.removeEventListener("message", onMsg);
            worker.removeEventListener("error", onErr);
            this.release(worker);
          };
          worker.addEventListener("message", onMsg);
          worker.addEventListener("error", onErr);
          worker.postMessage(task);
        })
    );
  }

  terminate() {
    this.terminated = true;
    for (const w of this.all) {
      try { w.terminate(); } catch { /* already gone */ }
    }
    this.all = [];
    this.idle = [];
    this.waiters = [];
  }
}
