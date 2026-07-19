// Global background-grid boldness preference for all NON-Charts-tab chart
// surfaces (Pairs, Attribution, Correlation, Macro, …). The Charts tab keeps its
// own per-workspace setting (chartConfig.gridProminence in ChartPane/Sidebar).
//
// One shared value, persisted in localStorage and broadcast via a window event,
// so flipping the toggle on any page restyles every mounted chart immediately.
// "normal" preserves each surface's original grid color; "bold" scales that
// color's alpha up; "off" hides the grid. Pages pass their own base color so
// hue differences between surfaces are preserved.

import { useSyncExternalStore } from "react";

export type GridProminence = "off" | "normal" | "bold";

const STORAGE_KEY = "reit-viz:grid-prominence";
const CHANGE_EVENT = "reit-viz:grid-prominence-changed";

export const DEFAULT_GRID_BASE = "rgba(255,255,255,0.04)";

export function gridColorFor(p: GridProminence, base: string = DEFAULT_GRID_BASE): string {
  const m = base.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  const r = m ? +m[1] : 255, g = m ? +m[2] : 255, b = m ? +m[3] : 255;
  const a = m && m[4] !== undefined ? +m[4] : 0.04;
  if (p === "off") return `rgba(${r},${g},${b},0)`;
  if (p === "bold") return `rgba(${r},${g},${b},${Math.min(0.4, +(a * 3).toFixed(3))})`;
  return base;
}

function read(): GridProminence {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "off" || v === "normal" || v === "bold") return v;
  } catch { /* ignore */ }
  return "normal";
}

export function setGridProminence(p: GridProminence): void {
  try { window.localStorage.setItem(STORAGE_KEY, p); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb); // cross-tab
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useGridProminence(): [GridProminence, (p: GridProminence) => void] {
  const p = useSyncExternalStore(subscribe, read, () => "normal" as GridProminence);
  return [p, setGridProminence];
}

/** Grid color for the current global prominence, scaled from the page's base color. */
export function useGridColor(base?: string): string {
  const [p] = useGridProminence();
  return gridColorFor(p, base);
}
