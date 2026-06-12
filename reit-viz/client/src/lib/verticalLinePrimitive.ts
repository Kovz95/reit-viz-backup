/**
 * VerticalLinePrimitive — draws vertical lines across the full pane height
 * at specified time coordinates. Uses the LWC v5 ISeriesPrimitive API
 * so lines appear on EVERY pane the primitive is attached to.
 */
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

/* ── Types ────────────────────────────────────────────────────────── */

interface VerticalLineEntry {
  time: string;   // "YYYY-MM-DD"
  color: string;
  label?: string;  // optional short label drawn at top
}

interface AttachedParams {
  chart: IChartApi;
  series: ISeriesApi<any>;
  requestUpdate: () => void;
}

/* ── Renderer ─────────────────────────────────────────────────────── */

class VerticalLineRenderer {
  private _lines: VerticalLineEntry[];
  private _chart: IChartApi;

  constructor(lines: VerticalLineEntry[], chart: IChartApi) {
    this._lines = lines;
    this._chart = chart;
  }

  draw(target: any): void {
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const h = scope.mediaSize.height;
      const ts = this._chart.timeScale();

      for (const entry of this._lines) {
        const x = ts.timeToCoordinate(entry.time as unknown as Time);
        if (x === null) continue;

        ctx.save();
        ctx.strokeStyle = entry.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();

        // Draw label at top if provided
        if (entry.label) {
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.85;
          ctx.font = "bold 9px sans-serif";
          ctx.fillStyle = entry.color;
          ctx.textAlign = "center";
          ctx.fillText(entry.label, x, 10);
        }

        ctx.restore();
      }
    });
  }
}

/* ── PaneView wrapper ─────────────────────────────────────────────── */

class VerticalLinePaneView {
  private _lines: VerticalLineEntry[];
  private _chart: IChartApi;

  constructor(lines: VerticalLineEntry[], chart: IChartApi) {
    this._lines = lines;
    this._chart = chart;
  }

  zOrder(): string {
    return "bottom";  // draw behind series data
  }

  renderer(): VerticalLineRenderer | null {
    if (this._lines.length === 0) return null;
    return new VerticalLineRenderer(this._lines, this._chart);
  }
}

/* ── Primitive (implements ISeriesPrimitive) ──────────────────────── */

export class VerticalLinePrimitive {
  private _lines: VerticalLineEntry[] = [];
  private _chart: IChartApi | null = null;
  private _requestUpdate: (() => void) | null = null;

  constructor(lines: VerticalLineEntry[]) {
    this._lines = lines;
  }

  attached(param: AttachedParams): void {
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._requestUpdate = null;
  }

  paneViews(): any[] {
    if (!this._chart || this._lines.length === 0) return [];
    return [new VerticalLinePaneView(this._lines, this._chart)];
  }

  /** Update lines and trigger redraw */
  setLines(lines: VerticalLineEntry[]): void {
    this._lines = lines;
    this._requestUpdate?.();
  }
}
