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

// ── Chart chrome (axis labels + current-value price lines) ────────────────
// Same idea as grid prominence: one global preference for every non-Charts
// chart surface (Correlation, Pairs, …). The Charts tab keeps its own
// per-workspace setting (chartConfig.axisLabels / priceLines).

export interface ChartChrome {
  /** Right-axis last-value badges (series title + value). */
  axisLabels: boolean;
  /** Dashed full-width line at each series' current value. */
  priceLines: boolean;
}

const CHROME_KEY = "reit-viz:chart-chrome";
const CHROME_EVENT = "reit-viz:chart-chrome-changed";
const CHROME_DEFAULT: ChartChrome = { axisLabels: true, priceLines: true };

// useSyncExternalStore requires a referentially stable snapshot between
// changes — cache the parsed object and refresh it on writes/storage events.
let chromeCache: ChartChrome = CHROME_DEFAULT;
let chromeCacheRaw: string | null = "__uninit__";
function readChrome(): ChartChrome {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(CHROME_KEY); } catch { /* ignore */ }
  if (raw !== chromeCacheRaw) {
    chromeCacheRaw = raw;
    try {
      const j = raw ? JSON.parse(raw) : null;
      chromeCache = {
        axisLabels: j?.axisLabels !== false,
        priceLines: j?.priceLines !== false,
      };
    } catch {
      chromeCache = CHROME_DEFAULT;
    }
  }
  return chromeCache;
}

export function setChartChrome(patch: Partial<ChartChrome>): void {
  const next = { ...readChrome(), ...patch };
  try { window.localStorage.setItem(CHROME_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(CHROME_EVENT));
}

function subscribeChrome(cb: () => void): () => void {
  window.addEventListener(CHROME_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHROME_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useChartChrome(): [ChartChrome, (patch: Partial<ChartChrome>) => void] {
  const c = useSyncExternalStore(subscribeChrome, readChrome, () => CHROME_DEFAULT);
  return [c, setChartChrome];
}
