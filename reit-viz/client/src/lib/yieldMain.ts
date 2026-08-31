// Cooperative yield for long main-thread sweeps (optimizer grids, per-ticker
// window scans). Awaiting this between chunks lets the browser paint and
// handle input, so a heavy run degrades instead of hard-locking the tab.
// Must be a macrotask — awaiting a resolved Promise never leaves the task.
export const yieldMain = () => new Promise<void>((r) => setTimeout(r, 0));
