/**
 * Quarter Shading Plugin for TradingView Lightweight Charts v5
 *
 * Draws color-coded vertical bands per calendar quarter using the
 * ISeriesPrimitive canvas API — so the shading is drawn directly
 * on the chart canvas, behind series data.
 *
 * Colors: Q1=Green, Q2=Yellow, Q3=Red, Q4=Blue
 */
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

/* ── Quarter color config ───────────────────────────────────────── */

const QUARTER_COLORS: Record<number, { bg: string; border: string; label: string }> = {
  1: { // Q1 — Green
    bg: "rgba(34, 197, 94, 0.10)",
    border: "rgba(34, 197, 94, 0.28)",
    label: "rgba(34, 197, 94, 0.50)",
  },
  2: { // Q2 — Yellow
    bg: "rgba(234, 179, 8, 0.10)",
    border: "rgba(234, 179, 8, 0.28)",
    label: "rgba(234, 179, 8, 0.50)",
  },
  3: { // Q3 — Red
    bg: "rgba(239, 68, 68, 0.10)",
    border: "rgba(239, 68, 68, 0.28)",
    label: "rgba(239, 68, 68, 0.50)",
  },
  4: { // Q4 — Blue
    bg: "rgba(59, 130, 246, 0.10)",
    border: "rgba(59, 130, 246, 0.28)",
    label: "rgba(59, 130, 246, 0.50)",
  },
};

/* ── Quarter boundary helper ─────────────────────────────────────── */

function getQuarterBoundaries(startYear: number, endYear: number) {
  const quarters: { start: string; end: string; q: number; year: number }[] = [];
  for (let y = startYear; y <= endYear; y++) {
    quarters.push(
      { start: `${y}-01-01`, end: `${y}-03-31`, q: 1, year: y },
      { start: `${y}-04-01`, end: `${y}-06-30`, q: 2, year: y },
      { start: `${y}-07-01`, end: `${y}-09-30`, q: 3, year: y },
      { start: `${y}-10-01`, end: `${y}-12-31`, q: 4, year: y },
    );
  }
  return quarters;
}

/* ── Renderer ─────────────────────────────────────────────────────── */

class QuarterShadingRenderer {
  private _chart: IChartApi;

  constructor(chart: IChartApi) {
    this._chart = chart;
  }

  draw(target: any): void {
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const w = scope.mediaSize.width;
      const h = scope.mediaSize.height;
      const ts = this._chart.timeScale();

      const visibleRange = ts.getVisibleRange();
      if (!visibleRange) return;

      const startStr = String(visibleRange.from);
      const endStr = String(visibleRange.to);
      const startYear = parseInt(startStr.substring(0, 4)) || 2009;
      const endYear = (parseInt(endStr.substring(0, 4)) || 2027) + 1;

      const quarters = getQuarterBoundaries(startYear - 1, endYear);

      // Track label positions to avoid overlaps
      const placedLabels: { x: number; width: number }[] = [];

      for (const q of quarters) {
        const leftCoord = ts.timeToCoordinate(q.start as unknown as Time);
        const rightCoord = ts.timeToCoordinate(q.end as unknown as Time);

        if (leftCoord === null && rightCoord === null) continue;

        const left = leftCoord !== null ? Math.max(0, leftCoord) : 0;
        const right = rightCoord !== null ? Math.min(w, rightCoord) : w;

        if (right <= left + 1) continue;

        const bandWidth = right - left;
        const colors = QUARTER_COLORS[q.q];

        // Draw background band
        ctx.fillStyle = colors.bg;
        ctx.fillRect(left, 0, bandWidth, h);

        // Draw left border line
        if (leftCoord !== null && leftCoord >= 0 && leftCoord <= w) {
          ctx.strokeStyle = colors.border;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(leftCoord) + 0.5, 0);
          ctx.lineTo(Math.round(leftCoord) + 0.5, h);
          ctx.stroke();
        }

        // Draw label only if band is wide enough (>50px)
        if (bandWidth > 50) {
          const labelText = `Q${q.q} ${q.year}`;
          const fontSize = bandWidth > 90 ? 10 : 9;
          ctx.font = `600 ${fontSize}px 'JetBrains Mono', 'SF Mono', monospace`;
          const textMetrics = ctx.measureText(labelText);
          const textWidth = textMetrics.width;
          const labelX = left + bandWidth / 2;

          // Check for overlap with previously placed labels (12px min gap)
          const wouldOverlap = placedLabels.some(prev => {
            const gap = Math.abs(labelX - prev.x) - (textWidth / 2 + prev.width / 2);
            return gap < 12;
          });

          if (!wouldOverlap && textWidth < bandWidth - 8) {
            ctx.fillStyle = colors.label;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillText(labelText, labelX, h - 6);
            placedLabels.push({ x: labelX, width: textWidth });
          }
        }
      }
    });
  }
}

/* ── PaneView wrapper ─────────────────────────────────────────────── */

class QuarterShadingPaneView {
  private _chart: IChartApi;

  constructor(chart: IChartApi) {
    this._chart = chart;
  }

  zOrder(): string {
    return "bottom"; // draw behind series data
  }

  renderer(): QuarterShadingRenderer {
    return new QuarterShadingRenderer(this._chart);
  }
}

/* ── Primitive (implements ISeriesPrimitive) ──────────────────────── */

interface AttachedParams {
  chart: IChartApi;
  series: ISeriesApi<any>;
  requestUpdate: () => void;
}

export class QuarterShadingPrimitive {
  private _chart: IChartApi | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _unsubscribers: (() => void)[] = [];

  attached(param: AttachedParams): void {
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;

    // Subscribe to time scale changes to trigger redraws
    const ts = param.chart.timeScale();
    const handler = () => this._requestUpdate?.();
    ts.subscribeVisibleLogicalRangeChange(handler);
    ts.subscribeVisibleTimeRangeChange(handler);
    this._unsubscribers.push(
      () => { try { ts.unsubscribeVisibleLogicalRangeChange(handler); } catch {} },
      () => { try { ts.unsubscribeVisibleTimeRangeChange(handler); } catch {} },
    );
  }

  detached(): void {
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
    this._chart = null;
    this._requestUpdate = null;
  }

  paneViews(): any[] {
    if (!this._chart) return [];
    return [new QuarterShadingPaneView(this._chart)];
  }
}

/* ── Legacy wrapper (used by ChartPane) ──────────────────────────── */

/**
 * Attach quarter shading to a chart via a series primitive.
 * Returns a cleanup function.
 *
 * @param chart - The LWC chart instance
 * @param container - The chart container (unused in canvas approach, kept for API compat)
 * @param firstSeries - A series to attach the primitive to
 */
export function attachQuarterShading(
  chart: IChartApi,
  container: HTMLDivElement,
  firstSeries?: ISeriesApi<any>,
): () => void {
  if (!firstSeries) return () => {};

  const primitive = new QuarterShadingPrimitive();
  try {
    firstSeries.attachPrimitive(primitive);
  } catch (e) {
    console.warn("Failed to attach quarter shading primitive:", e);
    return () => {};
  }

  return () => {
    try {
      firstSeries.detachPrimitive(primitive);
    } catch {}
  };
}
