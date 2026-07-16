/**
 * IndicatorColorsContext — global, user-customisable indicator line styling
 * (colour + thickness) overrides.
 *
 * Provides merged colours/widths objects (user overrides on top of the
 * INDICATOR_COLORS / INDICATOR_WIDTHS defaults) plus setters to change individual
 * keys.  Both maps persist through the workspace autosave under their own keys.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { INDICATOR_COLORS, INDICATOR_WIDTHS, INDICATOR_LINE_STYLES, type MaLineStyle } from "./chartColors";
import { useWorkspaceContext } from "./workspaceContext";

export type IndicatorColorKey = keyof typeof INDICATOR_COLORS;
export type IndicatorColorOverrides = Partial<Record<IndicatorColorKey, string>>;
export type IndicatorWidthOverrides = Partial<Record<IndicatorColorKey, number>>;
export type IndicatorStyleOverrides = Partial<Record<IndicatorColorKey, MaLineStyle>>;

interface IndicatorColorsCtx {
  /** Merged colours: user overrides on top of defaults */
  colors: typeof INDICATOR_COLORS;
  /** Merged line widths (px): user overrides on top of defaults */
  widths: Record<string, number>;
  /** Merged line styles: user overrides on top of defaults */
  styles: Record<string, MaLineStyle>;
  /** Set a single colour override */
  setColor: (key: IndicatorColorKey, color: string) => void;
  /** Set a single line-width override (px, clamped 1–4) */
  setWidth: (key: IndicatorColorKey, width: number) => void;
  /** Set a single line-style override */
  setStyle: (key: IndicatorColorKey, style: MaLineStyle) => void;
  /** Reset one colour back to its default */
  resetColor: (key: IndicatorColorKey) => void;
  /** Reset one line width back to its default */
  resetWidth: (key: IndicatorColorKey) => void;
  /** Reset one line style back to its default */
  resetStyle: (key: IndicatorColorKey) => void;
  /** Reset all colours, widths AND styles to defaults */
  resetAll: () => void;
  /** The raw user colour overrides (for serialisation) */
  overrides: IndicatorColorOverrides;
  /** The raw user width overrides (for serialisation) */
  widthOverrides: IndicatorWidthOverrides;
  /** The raw user style overrides (for serialisation) */
  styleOverrides: IndicatorStyleOverrides;
}

const IndicatorColorsContext = createContext<IndicatorColorsCtx>({
  colors: { ...INDICATOR_COLORS },
  widths: { ...INDICATOR_WIDTHS },
  styles: { ...INDICATOR_LINE_STYLES },
  setColor: () => {},
  setWidth: () => {},
  setStyle: () => {},
  resetColor: () => {},
  resetWidth: () => {},
  resetStyle: () => {},
  resetAll: () => {},
  overrides: {},
  widthOverrides: {},
  styleOverrides: {},
});

const WORKSPACE_KEY = "indicatorColors";
const WIDTH_WORKSPACE_KEY = "indicatorWidths";
const STYLE_WORKSPACE_KEY = "indicatorStyles";

export function IndicatorColorsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<IndicatorColorOverrides>({});
  const [widthOverrides, setWidthOverrides] = useState<IndicatorWidthOverrides>({});
  const [styleOverrides, setStyleOverrides] = useState<IndicatorStyleOverrides>({});
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
      const cachedS = wsRef.current.getCachedState(STYLE_WORKSPACE_KEY);
      if (cachedS) setStyleOverrides(cachedS);
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
      const cachedS = wsRef.current.getCachedState(STYLE_WORKSPACE_KEY);
      if (cachedS) setStyleOverrides(cachedS);
    }
  }, [ws.restoreGen]);

  // Push changes to workspace cache
  useEffect(() => {
    wsRef.current.pushState(WORKSPACE_KEY, overrides);
  }, [overrides]);

  useEffect(() => {
    wsRef.current.pushState(WIDTH_WORKSPACE_KEY, widthOverrides);
  }, [widthOverrides]);

  useEffect(() => {
    wsRef.current.pushState(STYLE_WORKSPACE_KEY, styleOverrides);
  }, [styleOverrides]);

  const colors = { ...INDICATOR_COLORS, ...overrides } as typeof INDICATOR_COLORS;
  const widths = { ...INDICATOR_WIDTHS, ...widthOverrides };
  const styles = { ...INDICATOR_LINE_STYLES, ...styleOverrides };

  const setColor = useCallback((key: IndicatorColorKey, color: string) => {
    setOverrides((prev) => ({ ...prev, [key]: color }));
  }, []);

  const setWidth = useCallback((key: IndicatorColorKey, width: number) => {
    const w = Math.max(1, Math.min(4, Math.round(width)));
    setWidthOverrides((prev) => ({ ...prev, [key]: w }));
  }, []);

  const setStyle = useCallback((key: IndicatorColorKey, style: MaLineStyle) => {
    setStyleOverrides((prev) => ({ ...prev, [key]: style }));
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

  const resetStyle = useCallback((key: IndicatorColorKey) => {
    setStyleOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOverrides({});
    setWidthOverrides({});
    setStyleOverrides({});
  }, []);

  return (
    <IndicatorColorsContext.Provider
      value={{ colors, widths, styles, setColor, setWidth, setStyle, resetColor, resetWidth, resetStyle, resetAll, overrides, widthOverrides, styleOverrides }}
    >
      {children}
    </IndicatorColorsContext.Provider>
  );
}

export function useIndicatorColors() {
  return useContext(IndicatorColorsContext);
}
