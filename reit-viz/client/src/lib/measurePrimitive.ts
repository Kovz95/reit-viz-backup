/**
 * MeasurePrimitive — TradingView-style "measure" overlay. Draws a translucent
 * shaded rectangle between a start and end (time, price) point, plus the
 * diagonal connecting line and endpoint dots. Green when the move is up, red
 * when down. Uses the LWC v5 ISeriesPrimitive API (same pattern as
 * VerticalLinePrimitive) so it renders on the series' pane.
 */
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

/* ── Types ────────────────────────────────────────────────────────── */

export interface MeasureSpec {
  startTime: string; // "YYYY-MM-DD"
  startPrice: number;
  endTime: string;
  endPrice: number;
  up: boolean;
  /** Fill the shaded rectangle behind the line (default true). */
  showRect?: boolean;
}

interface AttachedParams {
  chart: IChartApi;
  series: ISeriesApi<any>;
  requestUpdate: () => void;
}

const UP_FILL = "rgba(8, 153, 129, 0.18)";
const UP_LINE = "rgba(8, 153, 129, 0.95)";
const DOWN_FILL = "rgba(242, 54, 69, 0.18)";
const DOWN_LINE = "rgba(242, 54, 69, 0.95)";

/* ── Renderer ─────────────────────────────────────────────────────── */

class MeasureRenderer {
  constructor(
    private _spec: MeasureSpec,
    private _chart: IChartApi,
    private _series: ISeriesApi<any>,
  ) {}

  draw(target: any): void {
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const ts = this._chart.timeScale();
      const s = this._spec;

      const x1 = ts.timeToCoordinate(s.startTime as unknown as Time);
      const x2 = ts.timeToCoordinate(s.endTime as unknown as Time);
      const y1 = this._series.priceToCoordinate(s.startPrice);
      const y2 = this._series.priceToCoordinate(s.endPrice);
      if (x1 === null || x2 === null || y1 === null || y2 === null) return;

      const fill = s.up ? UP_FILL : DOWN_FILL;
      const line = s.up ? UP_LINE : DOWN_LINE;

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);

      ctx.save();

      if (s.showRect !== false) {
        // Shaded rectangle spanning the measured region
        ctx.fillStyle = fill;
        ctx.fillRect(left, top, Math.max(w, 1), Math.max(h, 1));

        // Subtle border on the rectangle
        ctx.strokeStyle = line;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.strokeRect(left, top, Math.max(w, 1), Math.max(h, 1));
      }

      // Diagonal connecting line
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Endpoint dots
      ctx.fillStyle = line;
      for (const [px, py] of [[x1, y1], [x2, y2]] as [number, number][]) {
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }
}

/* ── PaneView wrapper ─────────────────────────────────────────────── */

class MeasurePaneView {
  constructor(
    private _spec: MeasureSpec | null,
    private _chart: IChartApi,
    private _series: ISeriesApi<any>,
  ) {}

  zOrder(): string {
    return "top"; // draw over the series (fill is translucent so candles show through)
  }

  renderer(): MeasureRenderer | null {
    if (!this._spec) return null;
    return new MeasureRenderer(this._spec, this._chart, this._series);
  }
}

/* ── Primitive (implements ISeriesPrimitive) ──────────────────────── */

export class MeasurePrimitive {
  // Committed measurements stay drawn (multiple allowed); `_current` is the one
  // being dragged right now (rendered live, then committed on release).
  private _committed: MeasureSpec[] = [];
  private _current: MeasureSpec | null = null;
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<any> | null = null;
  private _requestUpdate: (() => void) | null = null;

  attached(param: AttachedParams): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews(): any[] {
    if (!this._chart || !this._series) return [];
    const specs = this._current ? [...this._committed, this._current] : this._committed;
    return specs.map((sp) => new MeasurePaneView(sp, this._chart!, this._series!));
  }

  /** Set (or clear with null) the in-progress measurement and redraw. */
  updateCurrent(spec: MeasureSpec | null): void {
    this._current = spec;
    this._requestUpdate?.();
  }

  /** Finalize the in-progress measurement so it persists alongside the rest. */
  commitCurrent(): void {
    if (this._current) {
      this._committed.push(this._current);
      this._current = null;
      this._requestUpdate?.();
    }
  }

  /** Remove every measurement (committed + in-progress) and redraw. */
  clearAll(): void {
    if (this._committed.length === 0 && !this._current) return;
    this._committed = [];
    this._current = null;
    this._requestUpdate?.();
  }

  /** How many measurements are drawn (committed + any in-progress). */
  count(): number {
    return this._committed.length + (this._current ? 1 : 0);
  }

  /** Toggle the shaded rectangle on every measurement and redraw. */
  setShowRect(showRect: boolean): void {
    let changed = false;
    this._committed = this._committed.map((sp) => {
      changed = true;
      return { ...sp, showRect };
    });
    if (this._current) {
      this._current = { ...this._current, showRect };
      changed = true;
    }
    if (changed) this._requestUpdate?.();
  }
}
