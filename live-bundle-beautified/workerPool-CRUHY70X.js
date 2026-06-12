class n {
    constructor(e, r) {
        this.workerFactory = e, this.size = r, this.workers = [], this.busy = [], this.queue = [], this.nextId = 1, this.pending = new Map, this.aborted = !1;
        for (let t = 0; t < r; t++) {
            const s = e();
            s.onmessage = i => this.onWorkerMessage(t, i), s.onerror = i => this.onWorkerError(t, i), this.workers.push(s), this.busy.push(!1)
        }
    }
    run(e, r) {
        return this.aborted ? Promise.reject(new Error("Pool aborted")) : new Promise((t, s) => {
            this.queue.push({
                input: e,
                resolve: t,
                reject: s,
                onProgress: r
            }), this.dispatch()
        })
    }
    dispatch() {
        if (!this.aborted)
            for (let e = 0; e < this.size; e++) {
                if (this.busy[e]) continue;
                const r = this.queue.shift();
                if (!r) return;
                const t = this.nextId++;
                this.busy[e] = !0, this.pending.set(t, {
                    workerIdx: e,
                    task: r
                }), this.workers[e].postMessage({
                    ...r.input,
                    id: t
                })
            }
    }
    onWorkerMessage(e, r) {
        const t = r.data;
        if (!t || typeof t.id != "number") return;
        const s = this.pending.get(t.id);
        if (s) {
            if (t.type === "progress") {
                s.task.onProgress?.(t);
                return
            }
            if (t.type === "result") {
                this.pending.delete(t.id), this.busy[e] = !1, s.task.resolve(t.result), this.dispatch();
                return
            }
            if (t.type === "error") {
                this.pending.delete(t.id), this.busy[e] = !1, s.task.reject(new Error(t.error || "Worker error")), this.dispatch();
                return
            }
        }
    }
    onWorkerError(e, r) {
        for (const [t, s] of this.pending) s.workerIdx === e && (this.pending.delete(t), s.task.reject(new Error(r.message || "Worker crashed")));
        this.busy[e] = !1, this.dispatch()
    }
    abort() {
        this.aborted = !0;
        for (const [e, r] of this.pending) r.task.reject(new Error("aborted")), this.pending.delete(e);
        for (const e of this.queue) e.reject(new Error("aborted"));
        this.queue.length = 0;
        for (const e of this.workers) e.terminate()
    }
    terminate() {
        this.abort()
    }
}
export {
    n as W
};