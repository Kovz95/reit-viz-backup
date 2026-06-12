/**
 * IndicatorColorsContext — global, user-customisable indicator colour overrides.
 *
 * Provides a merged colours object (user overrides on top of INDICATOR_COLORS
 * defaults) plus a setter to change individual keys.  Also exposes serialise /
 * restore helpers so the workspace autosave can persist the overrides.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { INDICATOR_COLORS } from "./chartColors";
import { useWorkspaceContext } from "./workspaceContext";

export type IndicatorColorKey = keyof typeof INDICATOR_COLORS;
export type IndicatorColorOverrides = Partial<Record<IndicatorColorKey, string>>;

interface IndicatorColorsCtx {
  /** Merged colours: user overrides on top of defaults */
  colors: typeof INDICATOR_COLORS;
  /** Set a single colour override */
  setColor: (key: IndicatorColorKey, color: string) => void;
  /** Reset one colour back to its default */
  resetColor: (key: IndicatorColorKey) => void;
  /** Reset all colours to defaults */
  resetAll: () => void;
  /** The raw user overrides (for serialisation) */
  overrides: IndicatorColorOverrides;
}

const IndicatorColorsContext = createContext<IndicatorColorsCtx>({
  colors: { ...INDICATOR_COLORS },
  setColor: () => {},
  resetColor: () => {},
  resetAll: () => {},
  overrides: {},
});

const WORKSPACE_KEY = "indicatorColors";

export function IndicatorColorsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<IndicatorColorOverrides>({});
  const ws = useWorkspaceContext();
  // Keep a ref to ws to avoid depending on the context object in effects.
  // ws changes identity every time cacheVersion bumps (i.e. on every pushState),
  // so putting ws in a dependency array causes infinite re-render loops.
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const initialRestoreDone = useRef(false);
  const lastRestoreGen = useRef(ws.restoreGen);

  // Restore from workspace cache on mount
  useEffect(() => {
    const cached = wsRef.current.getCachedState(WORKSPACE_KEY);
    if (cached && !initialRestoreDone.current) {
      setOverrides(cached);
    }
    initialRestoreDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-restore when workspace is loaded
  useEffect(() => {
    if (ws.restoreGen > lastRestoreGen.current) {
      lastRestoreGen.current = ws.restoreGen;
      const cached = wsRef.current.getCachedState(WORKSPACE_KEY);
      if (cached) setOverrides(cached);
    }
  }, [ws.restoreGen]);

  // Push changes to workspace cache
  useEffect(() => {
    wsRef.current.pushState(WORKSPACE_KEY, overrides);
  }, [overrides]);

  const colors = { ...INDICATOR_COLORS, ...overrides } as typeof INDICATOR_COLORS;

  const setColor = useCallback((key: IndicatorColorKey, color: string) => {
    setOverrides((prev) => ({ ...prev, [key]: color }));
  }, []);

  const resetColor = useCallback((key: IndicatorColorKey) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => setOverrides({}), []);

  return (
    <IndicatorColorsContext.Provider value={{ colors, setColor, resetColor, resetAll, overrides }}>
      {children}
    </IndicatorColorsContext.Provider>
  );
}

export function useIndicatorColors() {
  return useContext(IndicatorColorsContext);
}
