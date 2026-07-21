/**
 * IchimokuCloudPrimitive — fills the "kumo" cloud between Senkou Span A and
 * Senkou Span B. Green where A >= B (bullish cloud), red where A < B (bearish),
 * with the fill split exactly at each A/B crossover. Uses the LWC v5
 * ISeriesPrimitive API (same pattern as MeasurePrimitive) so it draws on the
 * series' pane, behind the lines (zOrder "bottom").
 *
 * Both span arrays are already displacement-shifted onto the chart's time axis
 * by the caller, so their `time`s convert directly via timeToCoordinate. Prices
 * convert via the attached series' priceToCoordinate (both spans share the same
 * right price scale as the leadA series this is attached to).
 */
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

export interface CloudPoint {
  time: Time;
  value: number;
}

interface AttachedParams {
  chart: IChartApi;
  series: ISeriesApi<any>;
  requestUpdate: () => void;
}

const UP_FILL = "rgba(67, 160, 71, 0.15)";
const DOWN_FILL = "rgba(244, 67, 54, 0.15)";

/** Fill colors for the band: `up` where A >= B, `down` where A < B. */
export interface CloudFills {
  up: string;
  down: string;
}

class CloudRenderer {
  constructor(
    private _leadA: CloudPoint[],
    private _leadB: CloudPoint[],
    private _chart: IChartApi,
    private _series: ISeriesApi<any>,
    private _fills: CloudFills,
  ) {}

  draw(target: any): void {
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const ts = this._chart.timeScale();
      const s = this._series;

      // Align the two spans by time (fill only where both are defined).
      const bMap = new Map<unknown, number>();
      for (const p of this._leadB) bMap.set(p.time, p.value);

      type Pt = { x: number; ya: number; yb: number; d: number };
      const pts: Pt[] = [];
      for (const p of this._leadA) {
        const bVal = bMap.get(p.time);
        if (bVal === undefined) continue;
        const x = ts.timeToCoordinate(p.time);
        const ya = s.priceToCoordinate(p.value);
        const yb = s.priceToCoordinate(bVal);
        if (x === null || ya === null || yb === null) continue;
        pts.push({ x, ya, yb, d: p.value - bVal });
      }
      if (pts.length < 2) return;

      ctx.save();

      const fillQuad = (
        x0: number, ya0: number, yb0: number,
        x1: number, ya1: number, yb1: number,
        color: string,
      ) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x0, ya0);
        ctx.lineTo(x1, ya1);
        ctx.lineTo(x1, yb1);
        ctx.lineTo(x0, yb0);
        ctx.closePath();
        ctx.fill();
      };

      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const up0 = p0.d >= 0;
        const up1 = p1.d >= 0;

        if (up0 === up1) {
          fillQuad(p0.x, p0.ya, p0.yb, p1.x, p1.ya, p1.yb, up0 ? this._fills.up : this._fills.down);
        } else {
          // A/B cross between p0 and p1 — split at the intersection (where the
          // two spans meet, so ya == yb there) and fill each side by its sign.
          const t = p0.d / (p0.d - p1.d); // in (0,1)
          const xc = p0.x + t * (p1.x - p0.x);
          const yc = p0.ya + t * (p1.ya - p0.ya); // == interpolated yb at crossover
          fillQuad(p0.x, p0.ya, p0.yb, xc, yc, yc, up0 ? this._fills.up : this._fills.down);
          fillQuad(xc, yc, yc, p1.x, p1.ya, p1.yb, up1 ? this._fills.up : this._fills.down);
        }
      }

      ctx.restore();
    });
  }
}

class CloudPaneView {
  constructor(
    private _leadA: CloudPoint[],
    private _leadB: CloudPoint[],
    private _chart: IChartApi,
    private _series: ISeriesApi<any>,
    private _fills: CloudFills,
  ) {}

  zOrder(): string {
    return "bottom"; // behind the price line and the Ichimoku span lines
  }

  renderer(): CloudRenderer | null {
    if (this._leadA.length < 2 || this._leadB.length < 2) return null;
    return new CloudRenderer(this._leadA, this._leadB, this._chart, this._series, this._fills);
  }
}

export class IchimokuCloudPrimitive {
  private _leadA: CloudPoint[];
  private _leadB: CloudPoint[];
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<any> | null = null;
  private _requestUpdate: (() => void) | null = null;

  private _fills: CloudFills;

  constructor(leadA: CloudPoint[], leadB: CloudPoint[], fills?: CloudFills) {
    this._leadA = leadA;
    this._leadB = leadB;
    this._fills = fills ?? { up: UP_FILL, down: DOWN_FILL };
  }

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

  updateData(leadA: CloudPoint[], leadB: CloudPoint[]): void {
    this._leadA = leadA;
    this._leadB = leadB;
    this._requestUpdate?.();
  }

  paneViews(): any[] {
    if (!this._chart || !this._series) return [];
    return [new CloudPaneView(this._leadA, this._leadB, this._chart, this._series, this._fills)];
  }
}
