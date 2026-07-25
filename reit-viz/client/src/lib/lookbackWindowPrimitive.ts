/**
 * LookbackWindowPrimitive — visualizes the data window a lookback indicator is
 * computing over. On crosshair hover it draws, for each active period
 * indicator, a dashed vertical line N bars BEHIND the crosshair (in the
 * indicator's color) plus a faint band from there to the crosshair, so an
 * RSI-14 shows exactly the 14 bars feeding the value under the cursor.
 *
 * LWC v5 ISeriesPrimitive (same pattern as IchimokuCloudPrimitive). The host
 * updates `hoverLogical` from its crosshairMove subscription and calls
 * requestUpdate(); entries carry {bars, color, label}.
 */
import type { IChartApi, ISeriesApi } from "lightweight-charts";

export interface LookbackEntry {
  bars: number;
  color: string;
  label: string;
}

interface AttachedParams {
  chart: IChartApi;
  series: ISeriesApi<any>;
  requestUpdate: () => void;
}

class LookbackRenderer {
  constructor(
    private _chart: IChartApi,
    private _entries: LookbackEntry[],
    private _hoverLogical: number | null,
  ) {}

  draw(target: any): void {
    if (this._hoverLogical === null || this._entries.length === 0) return;
    target.useMediaCoordinateSpace((scope: any) => {
      const ctx: CanvasRenderingContext2D = scope.context;
      const ts = this._chart.timeScale();
      const hoverX = ts.logicalToCoordinate(this._hoverLogical as any);
      if (hoverX === null) return;
      const h = scope.mediaSize.height;
      ctx.save();

      // Faint band for the longest window so the covered span reads at a glance.
      const maxBars = Math.max(...this._entries.map((e) => e.bars));
      const bandStartX = ts.logicalToCoordinate((this._hoverLogical! - maxBars) as any);
      if (bandStartX !== null && hoverX > bandStartX) {
        ctx.fillStyle = "rgba(125, 211, 252, 0.05)";
        ctx.fillRect(bandStartX, 0, hoverX - bandStartX, h);
      }

      // One dashed line per distinct lookback, labeled at the top.
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.textBaseline = "top";
      let labelRow = 0;
      for (const e of this._entries) {
        const x = ts.logicalToCoordinate((this._hoverLogical! - e.bars) as any);
        if (x === null) continue;
        ctx.strokeStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.fillStyle = e.color;
        ctx.fillText(`${e.label} −${e.bars}`, x + 3, 2 + labelRow * 11);
        labelRow = (labelRow + 1) % 6;
      }
      ctx.restore();
    });
  }
}

export class LookbackWindowPrimitive {
  private _params: AttachedParams | null = null;
  private _entries: LookbackEntry[] = [];
  private _hoverLogical: number | null = null;

  attached(params: AttachedParams): void {
    this._params = params;
  }
  detached(): void {
    this._params = null;
  }

  setEntries(entries: LookbackEntry[]): void {
    this._entries = entries;
    this._params?.requestUpdate();
  }

  setHover(logical: number | null): void {
    if (logical === this._hoverLogical) return;
    this._hoverLogical = logical;
    this._params?.requestUpdate();
  }

  paneViews() {
    const chart = this._params?.chart;
    if (!chart) return [];
    const renderer = new LookbackRenderer(chart, this._entries, this._hoverLogical);
    return [{ renderer: () => renderer, zOrder: () => "bottom" as const }];
  }
}
