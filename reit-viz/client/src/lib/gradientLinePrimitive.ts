/**
 * GradientLinePrimitive — strokes a moving-average polyline with a vertical
 * (value-axis) alpha gradient: the line is faint where its value is low (bottom
 * of the pane) and full colour where its value is high (top). Because the
 * gradient runs down the pane height, each point of the line is coloured by its
 * on-screen height — i.e. by its value. lightweight-charts' LineSeries only takes
 * a single solid colour, so this custom series primitive draws it instead (same
 * ISeriesPrimitive pattern as IchimokuCloudPrimitive).
 *
 * Attach it to a LineSeries created with `lineVisible: false` — the series still
 * feeds the crosshair marker, last-value tag, legend and price line, while the
 * visible stroke is this gradient. Line width and dash pattern are supplied by
 * the caller so the gradient matches the MA's chosen thickness / style.
 */
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";

export interface GLPoint {
  time: Time;
  value: number;
}

export interface GradientLineOptions {
  /** Base colour, hex (#rrggbb / #rgb) or rgb()/rgba(). */
  color: string;
  /** Line width in px. */
  width: number;
  /** Canvas dash pattern in px ([] = solid). */
  dash: number[];
  /** Alpha at low values (bottom of the pane), 0–1. */
  startAlpha: number;
  /** Alpha at high values (top of the pane), 0–1. */
  endAlpha: number;
}

interface AttachedParams {
  chart: IChartApi;
  series: ISeriesApi<any>;
  requestUpdate: () => void;
}

/** Parse a hex or rgb(a) colour into [r,g,b]. Returns null if unparseable. */
function toRgb(color: string): [number, number, number] | null {
  if (color.startsWith("#")) {
    let h = color.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(",").map((s) => parseFloat(s.trim()));
    return [p[0], p[1], p[2]];
  }
  return null;
}

class GradientLineRenderer {
  constructor(
    private _data: GLPoint[],
    private _opts: GradientLineOptions,
    private _chart: IChartApi,
    private _series: ISeriesApi<any>,
  ) {}

  draw(target: any): void {
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const ts = this._chart.timeScale();
      const s = this._series;

      const pts: { x: number; y: number }[] = [];
      for (const p of this._data) {
        const x = ts.timeToCoordinate(p.time);
        const y = s.priceToCoordinate(p.value);
        if (x === null || y === null) continue;
        pts.push({ x, y });
      }
      if (pts.length < 2) return;

      const rgb = toRgb(this._opts.color);
      if (!rgb) return;
      const [r, g, b] = rgb;

      ctx.save();
      ctx.lineWidth = this._opts.width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (this._opts.dash.length) ctx.setLineDash(this._opts.dash);

      // Anchor the gradient to the visible pane HEIGHT so each point is coloured by
      // its value: full colour at the top (high values), faint at the bottom (low
      // values). Canvas y grows downward, so stop 0 (y=0, top) is the full end.
      const paneH: number = scope.mediaSize.height;
      if (paneH > 0) {
        const grad = ctx.createLinearGradient(0, 0, 0, paneH);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${this._opts.endAlpha})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${this._opts.startAlpha})`);
        ctx.strokeStyle = grad;
      } else {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${this._opts.endAlpha})`;
      }

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    });
  }
}

class GradientLinePaneView {
  constructor(
    private _data: GLPoint[],
    private _opts: GradientLineOptions,
    private _chart: IChartApi,
    private _series: ISeriesApi<any>,
  ) {}

  zOrder(): string {
    return "normal";
  }

  renderer(): GradientLineRenderer | null {
    if (this._data.length < 2) return null;
    return new GradientLineRenderer(this._data, this._opts, this._chart, this._series);
  }
}

export class GradientLinePrimitive {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<any> | null = null;
  private _requestUpdate: (() => void) | null = null;

  constructor(private _data: GLPoint[], private _opts: GradientLineOptions) {}

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

  updateData(data: GLPoint[], opts: GradientLineOptions): void {
    this._data = data;
    this._opts = opts;
    this._requestUpdate?.();
  }

  paneViews(): any[] {
    if (!this._chart || !this._series) return [];
    return [new GradientLinePaneView(this._data, this._opts, this._chart, this._series)];
  }
}
