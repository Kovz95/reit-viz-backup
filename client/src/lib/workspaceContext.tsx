/**
 * WorkspaceContext – allows each tab/page to persist state into a shared
 * workspace store that survives tab navigation (unmount/mount cycles).
 *
 * Each tab calls `useWorkspaceTab("tabKey", serialize, restore)`.
 *   - On every render (via useEffect), the tab pushes its serialised snapshot
 *     into the context cache so it's preserved even after unmount.
 *   - On mount, if cached state exists for its key, `restore(cached)` is called
 *     so the tab picks up where it left off.
 *
 * The Dashboard calls `serializeAll()` / `restoreAll(state)` which gathers
 * the cached snapshots (not live callbacks) so ALL tab state is captured
 * regardless of which tab is currently mounted.
 */
import { createContext, useContext, useCallback, useRef, useEffect, useState } from "react";

type SerializeFn = () => any;
type RestoreFn = (state: any) => void;

interface WorkspaceCtx {
  /** Push a tab's serialized state into the persistent cache */
  pushState: (key: string, state: any) => void;
  /** Get cached state for a tab (used on mount to restore) */
  getCachedState: (key: string) => any | undefined;
  /** Collect all cached tab states */
  serializeAll: () => Record<string, any>;
  /** Bulk-restore: overwrite the cache and notify any mounted tabs */
  restoreAll: (tabStates: Record<string, any>) => void;
  /** Restore-generation counter; tabs watch this to know when to re-restore */
  restoreGen: number;
  /** Cache version counter — bumps on every pushState, useful for autosave deps */
  cacheVersion: number;
}

const WorkspaceContext = createContext<WorkspaceCtx>({
  pushState: () => {},
  getCachedState: () => undefined,
  serializeAll: () => ({}),
  restoreAll: () => {},
  restoreGen: 0,
  cacheVersion: 0,
});

export function WorkspaceTabProvider({ children }: { children: React.ReactNode }) {
  // Persistent cache: key → last known serialized state
  const cache = useRef<Record<string, any>>({});
  // Bumped when restoreAll is called so mounted tabs re-read their state
  const [restoreGen, setRestoreGen] = useState(0);
  // Bumped on every pushState so Dashboard can watch for tab state changes
  const [cacheVersion, setCacheVersion] = useState(0);

  const pushState = useCallback((key: string, state: any) => {
    cache.current[key] = state;
    setCacheVersion((v) => v + 1);
  }, []);

  const getCachedState = useCallback((key: string) => {
    return cache.current[key];
  }, []);

  const serializeAll = useCallback(() => {
    return { ...cache.current };
  }, []);

  const restoreAll = useCallback((tabStates: Record<string, any>) => {
    if (!tabStates) return;
    // Merge incoming state into cache — incoming keys overwrite, but
    // keys already in cache that are NOT in incoming state are preserved.
    // This prevents the auto-load from wiping out tab states that were
    // cached during the current browser session but not yet saved.
    for (const [key, value] of Object.entries(tabStates)) {
      cache.current[key] = value;
    }
    // Bump generation so any mounted tab re-restores
    setRestoreGen((g) => g + 1);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ pushState, getCachedState, serializeAll, restoreAll, restoreGen, cacheVersion }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/**
 * Hook for a tab/page to participate in workspace saving.
 *
 * `serialize` – returns the tab's current state (should be useCallback-wrapped).
 * `restore`  – applies saved state to the tab (should be useCallback-wrapped).
 *
 * On mount: if cached state exists, restore is called.
 * On every serialize change: the latest snapshot is pushed into the cache.
 * On unmount: a final snapshot is pushed before cleanup.
 */
export function useWorkspaceTab(key: string, serialize: SerializeFn, restore: RestoreFn) {
  const ctx = useContext(WorkspaceContext);
  const initialRestoreDone = useRef(false);
  const lastRestoreGen = useRef(ctx.restoreGen);
  // After restore, suppress pushState for a time window. This avoids pushing
  // intermediate/empty state while React batches the setState calls from restore().
  // Once the window expires, a deferred push fires to capture the settled state.
  const suppressUntil = useRef(0);
  const deferredPushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep refs to avoid re-running effects when cacheVersion changes
  // (cacheVersion is in the context value and changes on every pushState,
  //  which would cause an infinite re-render loop if ctx is in deps).
  const serializeRef = useRef(serialize);
  serializeRef.current = serialize;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  const scheduleRestoredPush = useCallback((delayMs: number) => {
    if (deferredPushTimer.current) clearTimeout(deferredPushTimer.current);
    deferredPushTimer.current = setTimeout(() => {
      deferredPushTimer.current = null;
      suppressUntil.current = 0;
      ctxRef.current.pushState(key, serializeRef.current());
    }, delayMs);
  }, [key]);

  // On mount, restore from cache if available
  useEffect(() => {
    const cached = ctxRef.current.getCachedState(key);
    if (cached && !initialRestoreDone.current) {
      suppressUntil.current = Date.now() + 1500;
      restoreRef.current(cached);
      scheduleRestoredPush(1600);
    }
    initialRestoreDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When restoreGen bumps (workspace loaded), re-restore.
  // ONLY depend on restoreGen, not the whole ctx — avoids re-running
  // on cacheVersion changes.
  useEffect(() => {
    if (ctx.restoreGen > lastRestoreGen.current) {
      lastRestoreGen.current = ctx.restoreGen;
      const cached = ctxRef.current.getCachedState(key);
      if (cached) {
        suppressUntil.current = Date.now() + 1500;
        restoreRef.current(cached);
        scheduleRestoredPush(1600);
      }
    }
  }, [ctx.restoreGen, key, scheduleRestoredPush]);

  // Push latest state into cache on every serialize change.
  // Depend ONLY on serialize — use ref for ctx to avoid re-running on
  // cacheVersion changes.
  useEffect(() => {
    if (Date.now() < suppressUntil.current) return;
    ctxRef.current.pushState(key, serialize());
  }, [serialize, key]);

  // Push final snapshot on TRUE unmount only.
  useEffect(() => {
    return () => {
      if (deferredPushTimer.current) clearTimeout(deferredPushTimer.current);
      try {
        ctxRef.current.pushState(key, serializeRef.current());
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useWorkspaceContext() {
  return useContext(WorkspaceContext);
}
