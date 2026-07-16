/**
 * IndicatorColorsContext — global, user-customisable indicator line styling
 * (colour + thickness) overrides.
 *
 * Provides merged colours/widths objects (user overrides on top of the
 * INDICATOR_COLORS / INDICATOR_WIDTHS defaults) plus setters to change individual
 * keys.  Both maps persist through the workspace autosave under their own keys.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { INDICATOR_COLORS, INDICATOR_WIDTHS } from "./chartColors";
import { useWorkspaceContext } from "./workspaceContext";

export type IndicatorColorKey = keyof typeof INDICATOR_COLORS;
export type IndicatorColorOverrides = Partial<Record<IndicatorColorKey, string>>;
export type IndicatorWidthOverrides = Partial<Record<IndicatorColorKey, number>>;

interface IndicatorColorsCtx {
  /** Merged colours: user overrides on top of defaults */
  colors: typeof INDICATOR_COLORS;
  /** Merged line widths (px): user overrides on top of defaults */
  widths: Record<string, number>;
  /** Set a single colour override */
  setColor: (key: IndicatorColorKey, color: string) => void;
  /** Set a single line-width override (px, clamped 1–4) */
  setWidth: (key: IndicatorColorKey, width: number) => void;
  /** Reset one colour back to its default */
  resetColor: (key: IndicatorColorKey) => void;
  /** Reset one line width back to its default */
  resetWidth: (key: IndicatorColorKey) => void;
  /** Reset all colours AND widths to defaults */
  resetAll: () => void;
  /** The raw user colour overrides (for serialisation) */
  overrides: IndicatorColorOverrides;
  /** The raw user width overrides (for serialisation) */
  widthOverrides: IndicatorWidthOverrides;
}

const IndicatorColorsContext = createContext<IndicatorColorsCtx>({
  colors: { ...INDICATOR_COLORS },
  widths: { ...INDICATOR_WIDTHS },
  setColor: () => {},
  setWidth: () => {},
  resetColor: () => {},
  resetWidth: () => {},
  resetAll: () => {},
  overrides: {},
  widthOverrides: {},
});

const WORKSPACE_KEY = "indicatorColors";
const WIDTH_WORKSPACE_KEY = "indicatorWidths";

export function IndicatorColorsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<IndicatorColorOverrides>({});
  const [widthOverrides, setWidthOverrides] = useState<IndicatorWidthOverrides>({});
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
    if (!initialRestoreDone.current) {
      const cached = wsRef.current.getCachedState(WORKSPACE_KEY);
      if (cached) setOverrides(cached);
      const cachedW = wsRef.current.getCachedState(WIDTH_WORKSPACE_KEY);
      if (cachedW) setWidthOverrides(cachedW);
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
      const cachedW = wsRef.current.getCachedState(WIDTH_WORKSPACE_KEY);
      if (cachedW) setWidthOverrides(cachedW);
    }
  }, [ws.restoreGen]);

  // Push changes to workspace cache
  useEffect(() => {
    wsRef.current.pushState(WORKSPACE_KEY, overrides);
  }, [overrides]);

  useEffect(() => {
    wsRef.current.pushState(WIDTH_WORKSPACE_KEY, widthOverrides);
  }, [widthOverrides]);

  const colors = { ...INDICATOR_COLORS, ...overrides } as typeof INDICATOR_COLORS;
  const widths = { ...INDICATOR_WIDTHS, ...widthOverrides };

  const setColor = useCallback((key: IndicatorColorKey, color: string) => {
    setOverrides((prev) => ({ ...prev, [key]: color }));
  }, []);

  const setWidth = useCallback((key: IndicatorColorKey, width: number) => {
    const w = Math.max(1, Math.min(4, Math.round(width)));
    setWidthOverrides((prev) => ({ ...prev, [key]: w }));
  }, []);

  const resetColor = useCallback((key: IndicatorColorKey) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const resetWidth = useCallback((key: IndicatorColorKey) => {
    setWidthOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOverrides({});
    setWidthOverrides({});
  }, []);

  return (
    <IndicatorColorsContext.Provider
      value={{ colors, widths, setColor, setWidth, resetColor, resetWidth, resetAll, overrides, widthOverrides }}
    >
      {children}
    </IndicatorColorsContext.Provider>
  );
}

export function useIndicatorColors() {
  return useContext(IndicatorColorsContext);
}
