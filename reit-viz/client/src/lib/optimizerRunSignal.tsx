// Shared "run all" signal for the unified /optimizers page.
//
// The AllOptimizers page mounts several optimizer components at once and wants a
// single button to trigger every mounted optimizer's own run handler. Each
// optimizer subscribes with `useOptimizerRunAll(itsRunHandler)`; the page (via
// OptimizerRunProvider) bumps a nonce when the user clicks "Run selected", and
// every subscribed optimizer fires its handler once.
//
// When an optimizer is rendered on its own standalone route (no provider), the
// context falls back to the default value (nonce 0, no-op trigger), so the hook
// is a harmless no-op there.

import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from "react";

interface OptimizerRunContextValue {
  runNonce: number;
  triggerRunAll: () => void;
}

const OptimizerRunContext = createContext<OptimizerRunContextValue>({
  runNonce: 0,
  triggerRunAll: () => {},
});

export function OptimizerRunProvider({ children }: { children: ReactNode }) {
  const [runNonce, setRunNonce] = useState(0);
  const triggerRunAll = useCallback(() => setRunNonce((n) => n + 1), []);
  return (
    <OptimizerRunContext.Provider value={{ runNonce, triggerRunAll }}>
      {children}
    </OptimizerRunContext.Provider>
  );
}

/** Returns the fan-out trigger. Use inside a component under OptimizerRunProvider. */
export function useOptimizerRunTrigger(): () => void {
  return useContext(OptimizerRunContext).triggerRunAll;
}

/**
 * Subscribe a component's run handler to the shared "Run selected" signal.
 * Fires the LATEST handler once per nonce increment that happens after mount —
 * a freshly-mounted optimizer never auto-runs from a stale nonce. No-op when
 * there is no provider (standalone route).
 */
export function useOptimizerRunAll(handler: () => void): void {
  const { runNonce } = useContext(OptimizerRunContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  // Seed with the nonce present at mount so we only react to future increments.
  const seenRef = useRef(runNonce);
  useEffect(() => {
    if (runNonce > seenRef.current) {
      seenRef.current = runNonce;
      handlerRef.current();
    }
  }, [runNonce]);
}
