// Shared chart-interaction helpers so every lightweight-charts pane behaves like
// the Charts tab (ChartPane): drag to pan, wheel/pinch to zoom (no sideways
// wheel-scroll), and — crucially — the user's pan/zoom SURVIVES a rebuild.
//
// Many panes recreate the whole chart (chart.remove() + createChart) inside an
// effect whose deps include theme (gridColor) or UI toggles (indicator set, chart
// type, overlay metric, shading mode). Each rebuild then calls fitContent(), which
// snaps the view back to full range — the "scroll bounce-back" that makes pan/zoom
// feel broken. ChartPane guards against this with a data fingerprint; these helpers
// package the same guard for reuse.
import type { IChartApi } from "lightweight-charts";

// Charts-tab interaction model. Spread into createChart() options.
export const PANE_HANDLERS = {
  handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  handleScale: { mouseWheel: true, pinch: true },
} as const;

// Time-scale feel to match ChartPane (a little right padding, sane default/min bar
// spacing so wheel-zoom has a floor). Merge into a pane's own timeScale block.
export const PANE_TIME_SCALE = { rightOffset: 5, barSpacing: 3, minBarSpacing: 1 } as const;

type LogicalRange = ReturnType<ReturnType<IChartApi["timeScale"]>["getVisibleLogicalRange"]>;

// Debug registry of currently-live view-preserved charts (same idea as the Charts
// tab's window.__chartsPanes) — used by e2e range assertions. A chart is added when
// its view is applied and removed just before it is disposed, so the set only ever
// holds live charts.
function regChart(chart: IChartApi) {
  try {
    const w = window as any;
    (w.__viewCharts || (w.__viewCharts = new Set())).add(chart);
  } catch {}
}
function unregChart(chart: IChartApi) {
  try { (window as any).__viewCharts?.delete(chart); } catch {}
}

export interface ChartViewPreserver {
  /** Call in the effect CLEANUP, before chart.remove(), to remember the view. */
  capture(chart: IChartApi): void;
  /**
   * Call after building the chart + setData. Reframes (fitContent) only when the
   * data fingerprint changed since last time; otherwise restores the captured view
   * so theme/indicator/UI toggles don't reset pan/zoom.
   */
  applyView(chart: IChartApi, dataFingerprint: string): void;
}

/**
 * One preserver per chart. Store it across renders with a ref:
 *   const vp = useRef(makeViewPreserver()).current;
 */
export function makeViewPreserver(): ChartViewPreserver {
  let savedRange: LogicalRange = null;
  let fp: string | null = null;
  return {
    capture(chart) {
      unregChart(chart);
      try {
        const r = chart.timeScale().getVisibleLogicalRange();
        if (r) savedRange = r;
      } catch {}
    },
    applyView(chart, dataFingerprint) {
      regChart(chart);
      const reframe = dataFingerprint !== fp || !savedRange;
      fp = dataFingerprint;
      if (reframe) {
        chart.timeScale().fitContent();
        return;
      }
      try {
        chart.timeScale().setVisibleLogicalRange(savedRange!);
      } catch {
        chart.timeScale().fitContent();
      }
    },
  };
}

export interface SplitViewPreserver {
  /** Call right after createChart() in the create-effect. */
  markRecreated(): void;
  /** Call in the create-effect CLEANUP, before chart.remove(). */
  capture(chart: IChartApi): void;
  /** Call at the end of the SEPARATE data-effect (after setData). */
  applyView(chart: IChartApi, dataFingerprint: string): void;
}

/**
 * View preserver for panes split across two effects: a create-effect (keyed on
 * theme) that recreates the chart, and a data-effect that setData()s + fits. On a
 * theme recreate the saved view is restored; on a genuine data change it reframes;
 * a data-effect re-run that changes neither (chart intact, same data) leaves the
 * view untouched. One per chart, stored in a ref.
 */
export function makeSplitViewPreserver(): SplitViewPreserver {
  let saved: LogicalRange = null;
  let fp: string | null = null;
  let recreated = false;
  return {
    markRecreated() { recreated = true; },
    capture(chart) {
      unregChart(chart);
      try { const r = chart.timeScale().getVisibleLogicalRange(); if (r) saved = r; } catch {}
    },
    applyView(chart, dataFingerprint) {
      regChart(chart);
      const changed = dataFingerprint !== fp;
      fp = dataFingerprint;
      const ts = chart.timeScale();
      if (recreated) {
        recreated = false;
        if (!changed && saved) {
          try { ts.setVisibleLogicalRange(saved); } catch { ts.fitContent(); }
        } else {
          ts.fitContent();
        }
      } else if (changed) {
        ts.fitContent();
      }
    },
  };
}

/** Fingerprint one or more series (length + last time + last value). A change here
 *  is a genuine data change that should reframe; anything else preserves the view. */
export function seriesFingerprint(
  ...series: Array<ReadonlyArray<{ time: unknown; value?: number }> | null | undefined>
): string {
  return series
    .map((s) => {
      if (!s || s.length === 0) return "0";
      const last = s[s.length - 1] as { time: unknown; value?: number };
      return `${s.length}:${String(last.time)}:${last.value ?? ""}`;
    })
    .join("|");
}
