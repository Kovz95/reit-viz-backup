import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineSeries,
  CandlestickSeries,
  createSeriesMarkers,
  PriceScaleMode,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { PlottedSeries, ChartConfig } from "@/pages/Dashboard";
import {
  computeSMA,
  computeEMA,
  computeHMA,
  computeRSI,
  computeMACD,
  computeMeanAndStdBands,
  computeRollingMeanBands,
  computeHeikinAshi,
  computeHASignals,
  computeBollingerBands,
  computeATR,
  computeVWAP,
  computeROC,
  computeStochastic,
  computeOBV,
} from "@/lib/indicators";
import type { HASmoothConfig } from "@/lib/indicators";
import { INDICATOR_COLORS } from "@/lib/chartColors";
import { useIndicatorColors } from "@/lib/indicatorColorsContext";
import { attachQuarterShading } from "@/lib/quarterShading";
import { applyTransform } from "@/lib/transforms";
import type { DataTransform } from "@/lib/transforms";
import { VerticalLinePrimitive } from "@/lib/verticalLinePrimitive";
import ExportMenu from "@/components/ExportMenu";
import type { SavedDrawing } from "@/lib/savedDrawings";

// ── Gradient color helper for color-by-variable ──
// Maps normalised [0,1] → red→yellow→green hex
function gradientColorHex(t: number): string {
  const v = Math.max(0, Math.min(1, t));
  const hue = v * 120; // 0=red, 60=yellow, 120=green
  const s = 0.90, l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else { r = 0; g = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function gradientColorHsl(t: number): string {
  const v = Math.max(0, Math.min(1, t));
  return `hsl(${v * 120}, 90%, 55%)`;
}

export interface ActiveIndicators {
  sma?: number;
  ema?: number;
  hma?: number;
  rsi?: number;       // period
  macd?: boolean;
  mean?: { rolling: boolean; period: number };
  heikinAshi?: boolean | HASmoothConfig; // true = no smoothing, object = smoothing config
  haSignals?: boolean;
  bollinger?: { period: number; mult: number };
  atr?: number;       // period
  vwap?: boolean;
  roc?: number;       // period
  stochastic?: { kPeriod: number; dPeriod: number };
  obv?: boolean;
}

interface Drawing {
  id: string;
  type: "hline" | "trendline" | "freehand";
  color: string;
  // For hline: price level
  price?: number;
  // For trendline / freehand: points
  points?: { time: string; price: number }[];
  seriesRef?: ISeriesApi<any>;
}

export interface ChartPaneHandle {
  getChart: () => IChartApi | null;
  fitContent: () => void;
  clearDrawings: () => void;
}

interface ChartPaneProps {
  paneId: number;
  paneLabel: string;
  series: PlottedSeries[];
  ohlcData: any;
  activeTicker: string | null;
  chartConfig: ChartConfig;
  activeIndicators: ActiveIndicators;
  timeRange: string;
  activeTool: string;
  drawColor: string;
  onCrosshairMove?: (data: { time: string; values: Record<string, number> } | null) => void;
  onDrawingAdded?: () => void;
  onDrawingDeleted?: () => void;
  isActive?: boolean;
  onChartReady?: (paneId: number, chart: IChartApi) => void;
  onChartDestroyed?: (paneId: number) => void;
  onSeriesMapUpdate?: (paneId: number, seriesMap: Map<string, ISeriesApi<any>>) => void;
  showQuarterShading?: boolean;
  /** Earnings dates as YYYY-MM-DD strings to mark on charts */
  earningsDates?: string[];
  /** Ex-dividend dates as YYYY-MM-DD strings */
  exDivDates?: string[];
  /** Macro event vertical lines (CPI, NFP, FOMC, GDP) */
  macroEventLines?: { time: string; color: string; label?: string }[];
  /** Color-by-variable: map of time → normalised [0,1] value for gradient coloring */
  colorByData?: Map<string, number> | null;
  /** Name of the color-by metric (for legend display) */
  colorByMetric?: string;
  /** Min/max range of the color-by variable (for legend display) */
  colorByRange?: { min: number; max: number } | null;
  /** Callback to clear color-by for this pane */
  onClearColorBy?: () => void;
  /** Saved drawings to render as overlays (ISO-date anchored) */
  savedDrawings?: SavedDrawing[];
  /** Called when a new drawing is finalized by a tool so it can be persisted */
  onSaveDrawing?: (drawing: { type: "hline" | "trendline"; color: string; price?: number; points?: { time: string; price: number }[] }) => void;
}

// ── Sub-chart for oscillators/indicators (RSI, MACD, HA) rendered below the main chart ──
type SubChartType = "rsi" | "macd" | "ha" | "atr" | "roc" | "stochastic" | "obv";

function SubIndicatorChart({
  type,
  closeData,
  activeIndicators,
  parentChart,
  baseLabel,
}: {
  type: SubChartType;
  closeData: { time: string; value: number }[];
  activeIndicators: ActiveIndicators;
  parentChart: IChartApi | null;
  baseLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const syncingRef = useRef(false);
  const { colors: IC } = useIndicatorColors();

  // Create chart + populate data (recreated when deps change)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || closeData.length === 0) return;

    // Destroy old chart
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch {}
      chartRef.current = null;
    }

    const rect = el.getBoundingClientRect();
    const chart = createChart(el, {
      width: rect.width || 300,
      height: rect.height || 80,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7a8a9e",
        fontSize: 10,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(14, 165, 233, 0.3)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#0ea5e9" },
        horzLine: { color: "rgba(14, 165, 233, 0.3)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#0ea5e9" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)", minimumWidth: 70 },
      timeScale: { borderColor: "rgba(255,255,255,0.06)", visible: false, rightOffset: 5, barSpacing: 3, minBarSpacing: 1 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;
    let firstSubSeries: any = null;
    // Collect all named series in this sub-chart for value extraction
    const subSeriesList: any[] = [];

    if (type === "rsi" && typeof activeIndicators.rsi === "number") {
      const rsiData = computeRSI(closeData, activeIndicators.rsi);
      if (rsiData.length > 0) {
        const rsiLine = chart.addSeries(LineSeries, {
          color: IC.rsi_line,
          lineWidth: 1,
          title: `RSI ${activeIndicators.rsi}${baseLabel}`,
        });
        rsiLine.setData(rsiData);
        subSeriesList.push(rsiLine);
        if (!firstSubSeries) firstSubSeries = rsiLine;

        // Overbought/oversold reference lines
        const first = rsiData[0].time;
        const last = rsiData[rsiData.length - 1].time;
        for (const [level, color] of [
          [70, IC.rsi_overbought],
          [30, IC.rsi_oversold],
        ] as [number, string][]) {
          const ref = chart.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: "",
            crosshairMarkerVisible: false,
          });
          ref.setData([{ time: first, value: level }, { time: last, value: level }]);
        }
        chart.timeScale().fitContent();
      }
    }

    if (type === "macd" && activeIndicators.macd) {
      const macd = computeMACD(closeData, 12, 26, 9);
      if (macd.macdLine.length > 0) {
        const ml = chart.addSeries(LineSeries, {
          color: IC.macd_line,
          lineWidth: 1,
          title: `MACD${baseLabel}`,
        });
        ml.setData(macd.macdLine);
        subSeriesList.push(ml);
        if (!firstSubSeries) firstSubSeries = ml;

        const sl = chart.addSeries(LineSeries, {
          color: IC.macd_signal,
          lineWidth: 1,
          title: "Signal",
          crosshairMarkerVisible: false,
        });
        sl.setData(macd.signalLine);
        subSeriesList.push(sl);

        if (macd.macdLine.length >= 2) {
          const zl = chart.addSeries(LineSeries, {
            color: "rgba(255,255,255,0.15)",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: "",
            crosshairMarkerVisible: false,
          });
          zl.setData([
            { time: macd.macdLine[0].time, value: 0 },
            { time: macd.macdLine[macd.macdLine.length - 1].time, value: 0 },
          ]);
        }
        chart.timeScale().fitContent();
      }
    }

    if (type === "ha" && activeIndicators.heikinAshi) {
      const haSmoothing: HASmoothConfig | undefined =
        typeof activeIndicators.heikinAshi === "object" ? activeIndicators.heikinAshi : undefined;
      const haCandles = computeHeikinAshi(closeData, haSmoothing);
      if (haCandles.length > 0) {
        const haSeries = chart.addSeries(CandlestickSeries, {
          upColor: IC.ha_up,
          downColor: IC.ha_down,
          borderUpColor: IC.ha_up,
          borderDownColor: IC.ha_down,
          wickUpColor: IC.ha_up,
          wickDownColor: IC.ha_down,
          title: `HA${baseLabel}`,
        });
        haSeries.setData(
          haCandles.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }))
        );
        subSeriesList.push(haSeries);
        if (!firstSubSeries) firstSubSeries = haSeries;
        chart.timeScale().fitContent();
      }
    }

    // ── ATR ──
    if (type === "atr" && typeof activeIndicators.atr === "number") {
      const atrData = computeATR(closeData, activeIndicators.atr);
      if (atrData.length > 0) {
        const atrLine = chart.addSeries(LineSeries, {
          color: IC.atr,
          lineWidth: 1,
          title: `ATR ${activeIndicators.atr}${baseLabel}`,
        });
        atrLine.setData(atrData);
        subSeriesList.push(atrLine);
        if (!firstSubSeries) firstSubSeries = atrLine;
        chart.timeScale().fitContent();
      }
    }

    // ── ROC ──
    if (type === "roc" && typeof activeIndicators.roc === "number") {
      const rocData = computeROC(closeData, activeIndicators.roc);
      if (rocData.length > 0) {
        const rocLine = chart.addSeries(LineSeries, {
          color: IC.roc,
          lineWidth: 1,
          title: `ROC ${activeIndicators.roc}${baseLabel}`,
        });
        rocLine.setData(rocData);
        subSeriesList.push(rocLine);
        if (!firstSubSeries) firstSubSeries = rocLine;

        // Zero line
        if (rocData.length >= 2) {
          const zl = chart.addSeries(LineSeries, {
            color: "rgba(255,255,255,0.15)",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: "",
            crosshairMarkerVisible: false,
          });
          zl.setData([
            { time: rocData[0].time, value: 0 },
            { time: rocData[rocData.length - 1].time, value: 0 },
          ]);
        }
        chart.timeScale().fitContent();
      }
    }

    // ── Stochastic ──
    if (type === "stochastic" && activeIndicators.stochastic) {
      const { kPeriod, dPeriod } = activeIndicators.stochastic;
      const stoch = computeStochastic(closeData, kPeriod, dPeriod);
      if (stoch.k.length > 0) {
        const kLine = chart.addSeries(LineSeries, {
          color: IC.stoch_k,
          lineWidth: 1,
          title: `%K(${kPeriod})${baseLabel}`,
        });
        kLine.setData(stoch.k);
        subSeriesList.push(kLine);
        if (!firstSubSeries) firstSubSeries = kLine;

        if (stoch.d.length > 0) {
          const dLine = chart.addSeries(LineSeries, {
            color: IC.stoch_d,
            lineWidth: 1,
            title: `%D(${dPeriod})`,
            crosshairMarkerVisible: false,
          });
          dLine.setData(stoch.d);
          subSeriesList.push(dLine);
        }

        // Overbought/Oversold reference lines
        const first = stoch.k[0].time;
        const last = stoch.k[stoch.k.length - 1].time;
        for (const [level, color] of [
          [80, IC.stoch_overbought],
          [20, IC.stoch_oversold],
        ] as [number, string][]) {
          const ref = chart.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            title: "",
            crosshairMarkerVisible: false,
          });
          ref.setData([{ time: first, value: level }, { time: last, value: level }]);
        }
        chart.timeScale().fitContent();
      }
    }

    // ── OBV ──
    if (type === "obv" && activeIndicators.obv) {
      const obvData = computeOBV(closeData);
      if (obvData.length > 0) {
        const obvLine = chart.addSeries(LineSeries, {
          color: IC.obv,
          lineWidth: 1,
          title: `OBV${baseLabel}`,
        });
        obvLine.setData(obvData);
        subSeriesList.push(obvLine);
        if (!firstSubSeries) firstSubSeries = obvLine;
        chart.timeScale().fitContent();
      }
    }

    // Sync time scale with parent
    if (parentChart) {
      const syncToSub = (range: any) => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        try { chart.timeScale().setVisibleLogicalRange(range); } catch {}
        syncingRef.current = false;
      };
      const syncToParent = (range: any) => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        try { parentChart.timeScale().setVisibleLogicalRange(range); } catch {}
        syncingRef.current = false;
      };

      parentChart.timeScale().subscribeVisibleLogicalRangeChange(syncToSub);
      chart.timeScale().subscribeVisibleLogicalRangeChange(syncToParent);

      // Sync price scale width so plot areas align vertically
      const syncPriceScaleWidth = () => {
        try {
          const parentWidth = parentChart.priceScale("right").width();
          if (parentWidth > 0) {
            chart.applyOptions({ rightPriceScale: { minimumWidth: parentWidth } });
          }
        } catch {}
      };
      syncPriceScaleWidth();
      // Re-sync whenever the parent chart resizes (which may change price scale width)
      const parentSizeHandler = () => { requestAnimationFrame(syncPriceScaleWidth); };
      (parentChart as any).subscribeSizeChange?.(parentSizeHandler);

      // Initial sync
      try {
        const range = parentChart.timeScale().getVisibleLogicalRange();
        if (range) chart.timeScale().setVisibleLogicalRange(range);
      } catch {}

      // Crosshair sync: bidirectional between parent and sub-chart
      if (firstSubSeries) {
        // Helper: extract values from sub-chart series at a given time
        const extractSubValues = (time: any): Record<string, number> => {
          const values: Record<string, number> = {};
          const ts = chart.timeScale();
          try {
            const x = ts.timeToCoordinate(time);
            if (x == null) return values;
            const logical = ts.coordinateToLogical(x);
            if (logical == null) return values;
            const idx = Math.round(logical);
            for (const series of subSeriesList) {
              try {
                const d = (series as any).dataByIndex(idx);
                if (!d) continue;
                const opts = series.options() as any;
                const title = opts.title || "";
                if (!title) continue;
                if ("value" in d && d.value != null) {
                  values[title] = d.value;
                } else if ("close" in d && d.close != null) {
                  values[title] = d.close;
                }
              } catch {}
            }
          } catch {}
          return values;
        };

        // Parent → sub: when the parent crosshair moves, mirror it on the sub-chart
        // and also dispatch sub-chart values upward for the crosshair readout
        const handleParentCrosshair = (param: any) => {
          if (syncingRef.current) return;
          syncingRef.current = true;
          try {
            if (param.time && firstSubSeries) {
              chart.setCrosshairPosition(NaN, param.time, firstSubSeries);
              // Extract and dispatch sub-chart values to the parent
              const container = el.parentElement;
              if (container) {
                const values = extractSubValues(param.time);
                container.dispatchEvent(new CustomEvent("sub-crosshair-move", {
                  detail: { time: param.time, values, fromParent: true },
                  bubbles: true,
                }));
              }
            } else {
              chart.clearCrosshairPosition();
              const container = el.parentElement;
              if (container) {
                container.dispatchEvent(new CustomEvent("sub-crosshair-move", {
                  detail: { time: null, values: {}, fromParent: true },
                  bubbles: true,
                }));
              }
            }
          } catch {}
          syncingRef.current = false;
        };
        parentChart.subscribeCrosshairMove(handleParentCrosshair);

        // Sub → parent: when the sub-chart crosshair moves, mirror it on the parent.
        // This lets hovering over the ROC/RSI/etc. sub-chart sync the main chart's
        // crosshair (and in turn cascade to all other panes via ChartArea sync).
        // We fire a custom event on the ChartPane wrapper which the parent listens for.
        // Include series values so the parent can show them in the crosshair readout.
        chart.subscribeCrosshairMove((param: any) => {
          if (syncingRef.current) return;
          syncingRef.current = true;
          try {
            const container = el.parentElement; // the ChartPane wrapper
            if (param.time && param.seriesData) {
              // Extract values from all sub-chart series
              const values: Record<string, number> = {};
              param.seriesData.forEach((data: any, series: any) => {
                const opts = series.options();
                const title = opts.title || "";
                if (!title) return; // skip reference lines (empty title)
                if ("value" in data && data.value != null) {
                  values[title] = data.value;
                } else if ("close" in data && data.close != null) {
                  values[title] = data.close;
                }
              });
              if (container) {
                container.dispatchEvent(new CustomEvent("sub-crosshair-move", {
                  detail: { time: param.time, values },
                  bubbles: true,
                }));
              }
            } else {
              if (container) {
                container.dispatchEvent(new CustomEvent("sub-crosshair-move", {
                  detail: { time: null, values: {} },
                  bubbles: true,
                }));
              }
            }
          } catch {}
          syncingRef.current = false;
        });
      }
    }

    return () => {
      chartRef.current = null;
      try { chart.remove(); } catch {}
    };
  }, [closeData, activeIndicators, type, baseLabel, parentChart, IC]);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    const chart = chartRef.current;
    if (!el || !chart) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) chart.applyOptions({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  const label = type === "rsi" ? "RSI" : type === "macd" ? "MACD" : type === "ha" ? "Heikin-Ashi"
    : type === "atr" ? "ATR" : type === "roc" ? "ROC" : type === "stochastic" ? "Stochastic"
    : type === "obv" ? "OBV" : type;

  return (
    <div className="relative w-full border-t border-border/30 flex-shrink-0" style={{ height: type === "ha" ? 100 : 80 }}>
      <div className="absolute left-2 z-10 mt-0.5">
        <span className="text-[9px] font-mono text-muted-foreground/50 bg-background/80 px-1 py-0.5 rounded">
          {label}
        </span>
      </div>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

const ChartPane = forwardRef<ChartPaneHandle, ChartPaneProps>(({
  paneId,
  paneLabel,
  series: paneSeries,
  ohlcData,
  activeTicker,
  chartConfig,
  activeIndicators,
  timeRange,
  activeTool,
  drawColor,
  onCrosshairMove,
  onDrawingAdded,
  onDrawingDeleted,
  isActive,
  onChartReady,
  onChartDestroyed,
  onSeriesMapUpdate,
  showQuarterShading = false,
  earningsDates = [],
  exDivDates = [],
  macroEventLines = [],
  colorByData = null,
  colorByMetric,
  colorByRange = null,
  onClearColorBy,
  savedDrawings = [],
  onSaveDrawing,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef<Map<string, ISeriesApi<any>>>(new Map());
  const { colors: IC } = useIndicatorColors();
  const indicatorSeriesRef = useRef<ISeriesApi<any>[]>([]);
  // Stores latest values from sub-indicator charts (RSI, MACD, etc.) for crosshair readout
  const subIndicatorValuesRef = useRef<Record<string, number>>({});
  const drawingsRef = useRef<Drawing[]>([]);
  const quarterShadingCleanupRef = useRef<(() => void) | null>(null);
  // Saved drawings overlay series (keyed by drawing id)
  const savedDrawingSeriesRef = useRef<Map<string, ISeriesApi<any>[]>>(new Map());
  const markersPluginRef = useRef<any>(null);
  const haSignalsPluginRef = useRef<any>(null);
  const vertLinePrimitivesRef = useRef<VerticalLinePrimitive[]>([]);
  // Keep a stable ref to onCrosshairMove so the subscription closure never goes stale
  const onCrosshairMoveRef = useRef(onCrosshairMove);
  onCrosshairMoveRef.current = onCrosshairMove;
  const [chartReady, setChartReady] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [dataTransform, setDataTransform] = useState<DataTransform>("raw");
  const [zScoreWindow, setZScoreWindow] = useState<number>(0); // 0 = expanding, >0 = rolling
  // Track data fingerprint so we only fitContent when actual series data changes,
  // not on indicator/marker/transform toggles that cause scroll bounce-back
  const prevDataFingerprintRef = useRef<string>("");
  const drawStateRef = useRef<{
    pending: boolean;
    startPoint?: { time: string; price: number };
  }>({ pending: false });

  // Helper: find any usable series for coordinate conversion (not limited to :close/:ohlc)
  const getAnySeries = useCallback((): ISeriesApi<any> | null => {
    // Prefer :ohlc or :close, but fall back to any available series
    for (const [k, s] of seriesMapRef.current) {
      if (k.includes(":ohlc") || k.includes(":close")) return s;
    }
    // Fall back to the first series in the map
    const first = seriesMapRef.current.values().next();
    return first.done ? null : first.value;
  }, []);

  useImperativeHandle(ref, () => ({
    getChart: () => chartRef.current,
    fitContent: () => { try { chartRef.current?.timeScale().fitContent(); } catch {} },
    clearDrawings: () => {
      const chart = chartRef.current;
      if (!chart) return;
      for (const d of drawingsRef.current) {
        if (d.seriesRef) {
          try { chart.removeSeries(d.seriesRef); } catch {}
        }
      }
      drawingsRef.current = [];
    },
  }));

  // Create chart
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean up previous
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesMapRef.current.clear();
      indicatorSeriesRef.current = [];
      setChartReady(false);
    }

    const tryInit = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        requestAnimationFrame(tryInit);
        return;
      }

      const chart = createChart(container, {
        width: rect.width,
        height: rect.height,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#7a8a9e",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.04)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: "rgba(14, 165, 233, 0.3)",
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: "#0ea5e9",
          },
          horzLine: {
            color: "rgba(14, 165, 233, 0.3)",
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: "#0ea5e9",
          },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.08)",
          scaleMargins: { top: 0.1, bottom: 0.1 },
          minimumWidth: 70,
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.08)",
          timeVisible: false,
          rightOffset: 5,
          barSpacing: 3,
          minBarSpacing: 1,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true },
      });

      chartRef.current = chart;
      setChartReady(true);
      onChartReady?.(paneId, chart);

      chart.subscribeCrosshairMove((param: any) => {
        if (!param.time || !param.seriesData) {
          onCrosshairMoveRef.current?.(null);
          return;
        }
        const values: Record<string, number> = {};
        param.seriesData.forEach((data: any, series: any) => {
          const opts = series.options();
          if ("value" in data) {
            const title = opts.title || "value";
            if (title) values[title] = data.value;
          } else if ("close" in data) {
            values["Price"] = data.close;
          }
        });
        // Merge sub-chart indicator values (RSI, MACD, etc.)
        const subVals = subIndicatorValuesRef.current;
        for (const [k, v] of Object.entries(subVals)) {
          if (v != null) values[k] = v;
        }
        onCrosshairMoveRef.current?.({ time: String(param.time), values });
      });

      const ro = new ResizeObserver((entries) => {
        if (!chartRef.current) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      });
      ro.observe(container);
    };

    tryInit();

    return () => {
      if (chartRef.current) {
        onChartDestroyed?.(paneId);
        chartRef.current.remove();
        chartRef.current = null;
        setChartReady(false);
        seriesMapRef.current.clear();
        indicatorSeriesRef.current = [];
      }
    };
  }, []);

  // Store last known pointer position so we can re-extract values after scroll/zoom
  const lastPointerXRef = useRef<number | null>(null);

  // Helper: extract crosshair data at a given x coordinate
  const extractCrosshairAt = useCallback((x: number) => {
    const ch = chartRef.current;
    if (!ch) return;
    const ts = ch.timeScale();
    const time = ts.coordinateToTime(x);
    if (time == null) return;
    const values: Record<string, number> = {};
    const logical = ts.coordinateToLogical(x);
    if (logical == null) return;
    const idx = Math.round(logical);
    // Iterate both main series and overlay indicator series
    const allSeries: Iterable<ISeriesApi<any>> = (function* () {
      for (const [, s] of seriesMapRef.current) yield s;
      for (const s of indicatorSeriesRef.current) yield s;
    })();
    for (const series of allSeries) {
      try {
        const d = (series as any).dataByIndex(idx);
        if (!d) continue;
        const opts = series.options() as any;
        if ("value" in d && d.value != null) {
          const title = opts.title || "value";
          if (title) values[title] = d.value;
        } else if ("close" in d && d.close != null) {
          values["Price"] = d.close;
        }
      } catch {}
    }
    // Merge sub-chart indicator values stored via custom events
    const subVals = subIndicatorValuesRef.current;
    for (const [k, v] of Object.entries(subVals)) {
      if (v != null) values[k] = v;
    }
    if (Object.keys(values).length > 0) {
      onCrosshairMoveRef.current?.({ time: String(time), values });
    }
  }, []);

  // Fallback: native pointermove handler extracts crosshair data when
  // LWC's subscribeCrosshairMove doesn't fire (e.g. during hover without click).
  // Also handles wheel/scroll events so values update when the chart pans under the cursor.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !chartRef.current || !chartReady) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      lastPointerXRef.current = x;
      extractCrosshairAt(x);
    };

    // When the user scrolls (wheel) the chart pans/zooms, so re-extract at the
    // last known pointer position after a short delay for the chart to settle.
    const handleWheel = () => {
      if (lastPointerXRef.current != null) {
        requestAnimationFrame(() => extractCrosshairAt(lastPointerXRef.current!));
      }
    };

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [chartReady, extractCrosshairAt]);

  // Listen for sub-chart crosshair events (sub → parent sync).
  // When the user hovers over a sub-indicator chart (ROC, RSI, etc.),
  // it dispatches a custom event with the time. We mirror that time
  // onto the parent chart's crosshair so ChartArea can cascade it.
  useEffect(() => {
    const wrapper = containerRef.current?.parentElement;
    if (!wrapper || !chartRef.current || !chartReady) return;

    const handleSubCrosshair = (e: Event) => {
      const chart = chartRef.current;
      if (!chart) return;
      const { time, values, fromParent } = (e as CustomEvent).detail;
      // Store sub-indicator values so they appear in crosshair readout
      if (values && typeof values === "object") {
        subIndicatorValuesRef.current = { ...subIndicatorValuesRef.current, ...values };
      }
      // If this event originated from the parent's crosshair move,
      // don't re-set the parent crosshair (would cause infinite loop).
      // Just store the values — the parent's crosshair is already positioned.
      if (fromParent) return;
      if (time) {
        // Need any series reference to set crosshair
        const firstSeries = seriesMapRef.current.values().next();
        if (!firstSeries.done && firstSeries.value) {
          try { chart.setCrosshairPosition(NaN, time, firstSeries.value); } catch {}
        }
      } else {
        // Clear sub-indicator values when crosshair leaves
        subIndicatorValuesRef.current = {};
        try { chart.clearCrosshairPosition(); } catch {}
      }
    };
    wrapper.addEventListener("sub-crosshair-move", handleSubCrosshair);
    return () => wrapper.removeEventListener("sub-crosshair-move", handleSubCrosshair);
  }, [chartReady]);

  // Log scale mode
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    try {
      chart.priceScale("right").applyOptions({
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      });
    } catch {}
  }, [logScale, chartReady]);

  // Quarter shading — attach/detach inside the series rendering effect
  // (handled below in the main Sync series useEffect since it needs a series ref)

  // When a drawing tool is active, disable chart scroll-drag so clicks/drags are for drawing
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    if (activeTool !== "none") {
      chart.applyOptions({ handleScroll: { mouseWheel: true, pressedMouseMove: false } });
    } else {
      chart.applyOptions({ handleScroll: { mouseWheel: true, pressedMouseMove: true } });
    }
  }, [activeTool, chartReady]);

  // Handle drawing clicks via LWC subscribeClick (more reliable than raw DOM click)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    if (activeTool === "none" || activeTool === "freehand" || activeTool === "eraser") {
      drawStateRef.current = { pending: false };
      return;
    }

    const handleClick = (param: any) => {
      if (!param.time || !param.point) return;

      const anySeries = getAnySeries();
      if (!anySeries) return;

      const priceCoord = anySeries.coordinateToPrice(param.point.y);
      if (priceCoord === null || priceCoord === undefined) return;

      const timeStr = String(param.time);

      if (activeTool === "hline") {
        // Create horizontal line at click price
        const drawId = `draw-${Date.now()}`;
        const hSeries = chart.addSeries(LineSeries, {
          color: drawColor,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          title: "",
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          autoscaleInfoProvider: () => null,
        });

        // Get the full time range of the chart data
        const allTimes = paneSeries.flatMap(s => s.data.map(d => d.time));
        const sortedTimes = [...new Set(allTimes)].sort();
        if (sortedTimes.length >= 2) {
          hSeries.setData([
            { time: sortedTimes[0] as Time, value: priceCoord },
            { time: sortedTimes[sortedTimes.length - 1] as Time, value: priceCoord },
          ]);
        }

        drawingsRef.current.push({
          id: drawId,
          type: "hline",
          color: drawColor,
          price: priceCoord,
          seriesRef: hSeries,
        });
        onDrawingAdded?.();
        onSaveDrawing?.({ type: "hline", color: drawColor, price: priceCoord });
      } else if (activeTool === "trendline") {
        if (!drawStateRef.current.pending) {
          // First click — store start point
          drawStateRef.current = {
            pending: true,
            startPoint: { time: timeStr, price: priceCoord },
          };
        } else {
          // Second click — draw the line
          const start = drawStateRef.current.startPoint!;
          const drawId = `draw-${Date.now()}`;
          const tSeries = chart.addSeries(LineSeries, {
            color: drawColor,
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            title: "",
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: () => null,
          });
          tSeries.setData([
            { time: start.time as Time, value: start.price },
            { time: timeStr as Time, value: priceCoord },
          ]);

          drawingsRef.current.push({
            id: drawId,
            type: "trendline",
            color: drawColor,
            points: [start, { time: timeStr, price: priceCoord }],
            seriesRef: tSeries,
          });
          drawStateRef.current = { pending: false };
          onDrawingAdded?.();
          onSaveDrawing?.({ type: "trendline", color: drawColor, points: [start, { time: timeStr, price: priceCoord }] });
        }
      }
    };

    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [activeTool, drawColor, chartReady, paneSeries, getAnySeries, onSaveDrawing]);

  // Freehand drawing: mousedown → mousemove → mouseup
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart || !chartReady) return;
    if (activeTool !== "freehand") return;

    let isDrawing = false;
    const freehandPoints: { time: string; price: number }[] = [];
    let liveSeries: ISeriesApi<any> | null = null;

    const coordToPoint = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const timeCoord = chart.timeScale().coordinateToTime(x);
      const anySeries = getAnySeries();
      if (!anySeries || timeCoord === null) return null;
      const priceCoord = anySeries.coordinateToPrice(y);
      if (priceCoord === null) return null;
      return { time: String(timeCoord), price: priceCoord };
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left click only
      const pt = coordToPoint(e);
      if (!pt) return;
      isDrawing = true;
      freehandPoints.length = 0;
      freehandPoints.push(pt);

      // Create a live series to show drawing in progress
      liveSeries = chart.addSeries(LineSeries, {
        color: drawColor,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: "",
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
        autoscaleInfoProvider: () => null,
      });
      liveSeries.setData([{ time: pt.time as Time, value: pt.price }]);

      // Disable ALL chart interaction while freehand drawing
      chart.applyOptions({ handleScroll: false, handleScale: false });
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing || !liveSeries) return;
      const pt = coordToPoint(e);
      if (!pt) return;
      // Only add point if time differs from last (series requires ascending times)
      const lastPt = freehandPoints[freehandPoints.length - 1];
      if (pt.time > lastPt.time) {
        freehandPoints.push(pt);
        liveSeries.setData(
          freehandPoints.map(p => ({ time: p.time as Time, value: p.price }))
        );
      }
    };

    const handleMouseUp = () => {
      if (!isDrawing) return;
      isDrawing = false;
      // Re-enable chart interaction (keep pressedMouseMove off since freehand tool is active)
      chart.applyOptions({ handleScroll: { mouseWheel: true, pressedMouseMove: false }, handleScale: { mouseWheel: true, pinch: true } });

      if (freehandPoints.length >= 2 && liveSeries) {
        const drawId = `draw-${Date.now()}`;
        drawingsRef.current.push({
          id: drawId,
          type: "freehand",
          color: drawColor,
          points: [...freehandPoints],
          seriesRef: liveSeries,
        });
        onDrawingAdded?.();
      } else if (liveSeries) {
        // Too few points — remove the series
        try { chart.removeSeries(liveSeries); } catch {}
      }
      liveSeries = null;
    };

    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      // Ensure chart interaction is re-enabled on cleanup (the tool-level effect handles pressedMouseMove)
      try { chart.applyOptions({ handleScroll: { mouseWheel: true, pressedMouseMove: true }, handleScale: { mouseWheel: true, pinch: true } }); } catch {}
    };
  }, [activeTool, drawColor, chartReady, paneSeries, onDrawingAdded, getAnySeries]);

  // Eraser tool: click to delete nearest drawing
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    if (activeTool !== "eraser") return;

    const handleClick = (param: any) => {
      if (!param.point) return;

      const anySeries = getAnySeries();
      if (!anySeries) return;

      const clickPrice = anySeries.coordinateToPrice(param.point.y);
      const clickTime = chart.timeScale().coordinateToTime(param.point.x);
      if (clickPrice === null || clickPrice === undefined) return;

      const clickTimeStr = clickTime ? String(clickTime) : null;

      // Find the nearest drawing within a reasonable threshold
      let bestIdx = -1;
      let bestDist = Infinity;

      // Use chart height to compute a pixel-based tolerance
      const container = containerRef.current;
      const chartHeight = container?.clientHeight ?? 400;
      let priceRange = 1;
      try {
        // Use autoscale info to estimate visible price range
        const topPrice = anySeries.coordinateToPrice(0);
        const bottomPrice = anySeries.coordinateToPrice(chartHeight);
        if (topPrice !== null && bottomPrice !== null) {
          priceRange = Math.abs(topPrice - bottomPrice) || 1;
        }
      } catch {}
      const priceTol = priceRange * 0.03; // ~3% of visible price range (generous hit target)

      for (let i = 0; i < drawingsRef.current.length; i++) {
        const d = drawingsRef.current[i];
        if (d.type === "hline" && d.price !== undefined) {
          const dist = Math.abs(clickPrice - d.price);
          if (dist < priceTol && dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        } else if ((d.type === "trendline" || d.type === "freehand") && d.points && d.points.length >= 2) {
          // Check distance to each segment
          for (let j = 0; j < d.points.length - 1; j++) {
            const p1 = d.points[j];
            const p2 = d.points[j + 1];
            // Simple: check if click price is close to interpolated price at clickTime
            if (clickTimeStr && clickTimeStr >= p1.time && clickTimeStr <= p2.time) {
              const timeFrac = p2.time === p1.time ? 0 :
                (clickTimeStr.localeCompare(p1.time)) / (p2.time.localeCompare(p1.time) || 1);
              // Linear interpolation in price
              const t1 = new Date(p1.time).getTime();
              const t2 = new Date(p2.time).getTime();
              const tc = clickTimeStr ? new Date(clickTimeStr).getTime() : t1;
              const frac = t2 === t1 ? 0 : (tc - t1) / (t2 - t1);
              const interpPrice = p1.price + frac * (p2.price - p1.price);
              const dist = Math.abs(clickPrice - interpPrice);
              if (dist < priceTol && dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
              }
            }
          }
          // Also check if click is near any point directly (for freehand with sparse points)
          for (const pt of d.points) {
            const dist = Math.abs(clickPrice - pt.price);
            if (dist < priceTol && dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
        }
      }

      if (bestIdx >= 0) {
        const drawing = drawingsRef.current[bestIdx];
        if (drawing.seriesRef) {
          try { chart.removeSeries(drawing.seriesRef); } catch {}
        }
        drawingsRef.current.splice(bestIdx, 1);
        onDrawingDeleted?.();
      }
    };

    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [activeTool, chartReady, onDrawingDeleted, getAnySeries]);

  // Clear drawings function
  const clearDrawings = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const d of drawingsRef.current) {
      if (d.seriesRef) {
        try { chart.removeSeries(d.seriesRef); } catch {}
      }
    }
    drawingsRef.current = [];
  }, []);

  // Sync series to chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    // Apply data transform to all series
    const transformedPaneSeries = dataTransform === "raw"
      ? paneSeries
      : paneSeries.map(s => ({
          ...s,
          data: applyTransform(s.data, dataTransform, zScoreWindow || undefined),
        }));

    // Determine if this pane has the active ticker's close/ohlc
    const hasClose = transformedPaneSeries.some(s => s.metric === "close" && s.ticker === activeTicker);

    // Remove stale series
    const currentIds = new Set(paneSeries.map((s) => s.id));
    // Only keep ohlc if candlestick mode AND raw transform
    if (ohlcData && activeTicker && chartConfig.chartType === "candlestick" && hasClose && dataTransform === "raw") {
      currentIds.add(`${activeTicker}:ohlc`);
    }
    // Remove ohlc key if not candlestick or if transformed
    if (chartConfig.chartType !== "candlestick" || dataTransform !== "raw") {
      currentIds.delete(`${activeTicker}:ohlc`);
    }

    for (const [id, series] of seriesMapRef.current) {
      if (!currentIds.has(id)) {
        try { chart.removeSeries(series); } catch {}
        seriesMapRef.current.delete(id);
      }
    }

    // Remove old indicators
    for (const s of indicatorSeriesRef.current) {
      try { chart.removeSeries(s); } catch {}
    }
    indicatorSeriesRef.current = [];

    // Add OHLC candlestick if this pane has the close series AND chart type is candlestick
    // (only in raw mode — candlestick doesn't make sense for z-score/percentile)
    if (ohlcData && activeTicker && chartConfig.chartType === "candlestick" && hasClose && dataTransform === "raw") {
      const key = `${activeTicker}:ohlc`;
      if (!seriesMapRef.current.has(key)) {
        const closeKey = `${activeTicker}:close`;
        if (seriesMapRef.current.has(closeKey)) {
          try { chart.removeSeries(seriesMapRef.current.get(closeKey)!); } catch {}
          seriesMapRef.current.delete(closeKey);
        }
        const cs = chart.addSeries(CandlestickSeries, {
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderUpColor: "#22c55e",
          borderDownColor: "#ef4444",
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
        });
        cs.setData(ohlcData);
        seriesMapRef.current.set(key, cs);
      } else {
        try { seriesMapRef.current.get(key)!.setData(ohlcData); } catch {}
      }
    }

    // Determine if we have multiple series that need dual axis.
    // When 2+ visible series exist, put the 2nd+ on the left price scale
    // so they each get their own Y-axis and don't distort each other.
    const visibleSeries = transformedPaneSeries.filter(s => s.visible && s.data.length > 0);
    const firstSeriesId = visibleSeries[0]?.id;
    const useLeftScale = visibleSeries.length >= 2;

    // Chart type rendering options
    const isLineScatter = chartConfig.chartType === "line-scatter";
    const isLineLike = chartConfig.chartType === "line" || isLineScatter;

    // Helper: apply per-point gradient colors when colorByData is active
    const applyColorByToData = (data: { time: string; value: number }[]) => {
      if (!colorByData || colorByData.size === 0) return data;
      return data.map(d => {
        const norm = colorByData.get(d.time);
        if (norm !== undefined) {
          return { ...d, color: gradientColorHex(norm) };
        }
        return d;
      });
    };

    // Add/update line series (using transformed data)
    for (const ps of transformedPaneSeries) {
      if (!ps.visible) {
        if (seriesMapRef.current.has(ps.id)) {
          try { chart.removeSeries(seriesMapRef.current.get(ps.id)!); } catch {}
          seriesMapRef.current.delete(ps.id);
        }
        continue;
      }
      if (
        ps.metric === "close" &&
        chartConfig.chartType === "candlestick" &&
        ohlcData &&
        ps.ticker === activeTicker &&
        dataTransform === "raw"
      ) {
        continue; // Rendered as candlestick instead
      }

      if (!seriesMapRef.current.has(ps.id)) {
        const isOverlay = useLeftScale && ps.id !== firstSeriesId;
        const ls = chart.addSeries(LineSeries, {
          color: ps.color,
          lineWidth: (ps.lineWidth ?? 2) as any,
          lineStyle: ps.lineStyle ?? 0,
          title: ps.label,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: isLineScatter ? 3.5 : 4,
          // For line+scatter, show persistent point markers
          pointMarkersVisible: isLineScatter,
          pointMarkersRadius: isLineScatter ? 2.5 : undefined,
          ...(isOverlay ? { priceScaleId: "left" } : {}),
        });
        ls.setData(applyColorByToData(ps.data));
        seriesMapRef.current.set(ps.id, ls);

        if (isOverlay) {
          chart.applyOptions({
            leftPriceScale: {
              visible: true,
              borderColor: "rgba(255,255,255,0.08)",
              scaleMargins: { top: 0.1, bottom: 0.1 },
            },
          });
        }
      } else {
        // Update existing series data and style
        const existing = seriesMapRef.current.get(ps.id)!;
        try {
          existing.applyOptions({
            color: ps.color,
            lineWidth: (ps.lineWidth ?? 2) as any,
            lineStyle: ps.lineStyle ?? 0,
          });
          existing.setData(applyColorByToData(ps.data));
        } catch {}
      }
    }

    // Hide left scale if no overlays
    if (!useLeftScale) {
      chart.applyOptions({ leftPriceScale: { visible: false } });
    }

    // Indicators on every pane's primary visible series (not just the close pane)
    // For each pane: pick the first visible series as the base data for indicators
    // Use transformed data so indicators (SMA, RSI, MACD etc.) operate on the transformed values
    const primarySeries = transformedPaneSeries.find((s) => s.visible && s.data.length > 0);
    if (primarySeries && primarySeries.data.length > 0) {
      const closeData = primarySeries.data;
      // Short label for indicator titles so you know what series the indicator is computed on
      const baseLabel = primarySeries.metric === "close" ? "" : ` (${primarySeries.metric})`;

      // ── SMA ──
      if (activeIndicators.sma) {
        const smaData = computeSMA(closeData, activeIndicators.sma);
        if (smaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.sma,
            lineWidth: 1,
            title: `SMA ${activeIndicators.sma}${baseLabel}`,
            lineStyle: LineStyle.Dashed,
          });
          s.setData(smaData);
          indicatorSeriesRef.current.push(s);
        }
      }

      // ── EMA ──
      if (activeIndicators.ema) {
        const emaData = computeEMA(closeData, activeIndicators.ema);
        if (emaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.ema,
            lineWidth: 1,
            title: `EMA ${activeIndicators.ema}${baseLabel}`,
          });
          s.setData(emaData);
          indicatorSeriesRef.current.push(s);
        }
      }

      // ── HMA ──
      if (activeIndicators.hma) {
        const hmaData = computeHMA(closeData, activeIndicators.hma);
        if (hmaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.hma,
            lineWidth: 2,
            title: `HMA ${activeIndicators.hma}${baseLabel}`,
          });
          s.setData(hmaData);
          indicatorSeriesRef.current.push(s);
        }
      }

      // ── Bollinger Bands ── (overlay on main chart)
      if (activeIndicators.bollinger) {
        const { period, mult } = activeIndicators.bollinger;
        const bb = computeBollingerBands(closeData, period, mult);
        if (bb.basis.length > 0) {
          const basisLine = chart.addSeries(LineSeries, {
            color: IC.bollinger_basis,
            lineWidth: 1,
            title: `BB ${period},${mult}${baseLabel}`,
            lineStyle: LineStyle.LargeDashed,
          });
          basisLine.setData(bb.basis);
          indicatorSeriesRef.current.push(basisLine);

          const upperLine = chart.addSeries(LineSeries, {
            color: IC.bollinger_band,
            lineWidth: 1,
            title: `Upper`,
            lineStyle: LineStyle.Dotted,
          });
          upperLine.setData(bb.upper);
          indicatorSeriesRef.current.push(upperLine);

          const lowerLine = chart.addSeries(LineSeries, {
            color: IC.bollinger_band,
            lineWidth: 1,
            title: `Lower`,
            lineStyle: LineStyle.Dotted,
          });
          lowerLine.setData(bb.lower);
          indicatorSeriesRef.current.push(lowerLine);
        }
      }

      // ── VWAP ── (overlay on main chart)
      if (activeIndicators.vwap) {
        const vwapData = computeVWAP(closeData);
        if (vwapData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: IC.vwap,
            lineWidth: 1,
            title: `VWAP${baseLabel}`,
            lineStyle: LineStyle.LargeDashed,
          });
          s.setData(vwapData);
          indicatorSeriesRef.current.push(s);
        }
      }

      // ATR, ROC, Stochastic, OBV are rendered in separate sub-charts below (see SubIndicatorChart)
      // RSI, MACD, and Heikin-Ashi are rendered in separate sub-charts below (see SubIndicatorChart)

      // ── Mean ± Std Bands ──
      if (activeIndicators.mean) {
        const { rolling, period } = activeIndicators.mean;

        if (rolling) {
          // Rolling mean + rolling σ bands
          const rb = computeRollingMeanBands(closeData, period);
          if (rb.mean.length > 0) {
            const ml = chart.addSeries(LineSeries, {
              color: IC.mean,
              lineWidth: 1,
              title: `Rolling Mean ${period}`,
              lineStyle: LineStyle.LargeDashed,
            });
            ml.setData(rb.mean);
            indicatorSeriesRef.current.push(ml);

            for (const b of rb.bands) {
              const bs = chart.addSeries(LineSeries, {
                color: Math.abs(b.mult) === 1
                  ? "rgba(99, 102, 241, 0.4)"
                  : "rgba(99, 102, 241, 0.25)",
                lineWidth: 1,
                title: `${b.mult > 0 ? "+" : ""}${b.mult}σ`,
                lineStyle: LineStyle.Dotted,
              });
              bs.setData(b.data);
              indicatorSeriesRef.current.push(bs);
            }
          }
        } else {
          // Static mean + σ bands over the lookback window
          const subset = period < closeData.length ? closeData.slice(-period) : closeData;
          const stats = computeMeanAndStdBands(subset);
          if (subset.length >= 2) {
            const first = subset[0].time;
            const last = subset[subset.length - 1].time;

            const meanLine = chart.addSeries(LineSeries, {
              color: IC.mean,
              lineWidth: 1,
              title: `Mean (${stats.mean.toFixed(2)}) [${period}d]`,
              lineStyle: LineStyle.LargeDashed,
            });
            meanLine.setData([
              { time: first, value: stats.mean },
              { time: last, value: stats.mean },
            ]);
            indicatorSeriesRef.current.push(meanLine);

            for (const mult of [1, -1, 2, -2]) {
              const band = chart.addSeries(LineSeries, {
                color: Math.abs(mult) === 1
                  ? "rgba(99, 102, 241, 0.4)"
                  : "rgba(99, 102, 241, 0.25)",
                lineWidth: 1,
                title: `${mult > 0 ? "+" : ""}${mult}σ`,
                lineStyle: LineStyle.Dotted,
              });
              band.setData([
                { time: first, value: stats.mean + mult * stats.std },
                { time: last, value: stats.mean + mult * stats.std },
              ]);
              indicatorSeriesRef.current.push(band);
            }
          }
        }
      }

      // HA candles are rendered in sub-chart below (see SubIndicatorChart)
    }

    // ── HA Color-Change Signal markers on the primary line series ──
    if (haSignalsPluginRef.current) {
      try { haSignalsPluginRef.current.detach(); } catch {}
      haSignalsPluginRef.current = null;
    }
    if (activeIndicators.haSignals && primarySeries && primarySeries.data.length > 0) {
      const haSmooth2: HASmoothConfig | undefined =
        typeof activeIndicators.heikinAshi === "object" ? activeIndicators.heikinAshi : undefined;
      const signals = computeHASignals(primarySeries.data, haSmooth2);
      // Prefer the line series for markers, but fall back to OHLC candlestick series
      // when in candlestick mode (the line series for "close" is removed)
      let signalTarget = seriesMapRef.current.get(primarySeries.id);
      if (!signalTarget && activeTicker) {
        signalTarget = seriesMapRef.current.get(`${activeTicker}:ohlc`);
      }
      if (!signalTarget) {
        // Last resort: pick the first available series
        signalTarget = seriesMapRef.current.values().next().value;
      }
      if (signalTarget && signals.length > 0) {
        const signalMarkers = signals.map(s => ({
          time: s.time,
          position: s.direction === "bullish" ? "belowBar" : "aboveBar",
          color: s.direction === "bullish" ? IC.ha_signal_bull : IC.ha_signal_bear,
          shape: s.direction === "bullish" ? "arrowUp" : "arrowDown",
          text: s.direction === "bullish" ? "▲" : "▼",
        }));
        signalMarkers.sort((a: any, b: any) => a.time.localeCompare(b.time));
        try {
          haSignalsPluginRef.current = createSeriesMarkers(signalTarget, signalMarkers);
        } catch (e) {
          console.warn("Failed to create HA signal markers:", e);
        }
      }
    }

    // ── Clean up previous primitives (quarter shading + vertical lines) ──
    // Detach quarter shading primitive
    if (quarterShadingCleanupRef.current) {
      quarterShadingCleanupRef.current();
      quarterShadingCleanupRef.current = null;
    }
    // Detach vertical line primitives
    for (const prim of vertLinePrimitivesRef.current) {
      try {
        for (const s of seriesMapRef.current.values()) {
          try { s.detachPrimitive(prim); } catch {}
        }
        for (const s of indicatorSeriesRef.current) {
          try { s.detachPrimitive(prim); } catch {}
        }
      } catch {}
    }
    vertLinePrimitivesRef.current = [];
    if (markersPluginRef.current) {
      try { markersPluginRef.current.detach(); } catch {}
      markersPluginRef.current = null;
    }

    // Get first series for attaching primitives
    const firstSeries = seriesMapRef.current.values().next().value;

    // ── Quarter shading via canvas primitive ──
    if (showQuarterShading && firstSeries && containerRef.current) {
      quarterShadingCleanupRef.current = attachQuarterShading(
        chart,
        containerRef.current,
        firstSeries,
      );
    }

    // ── Earnings & Ex-Div & Macro vertical lines ──
    {
      const lineEntries: { time: string; color: string; label?: string }[] = [];
      for (const d of earningsDates) {
        lineEntries.push({ time: d, color: "#f59e0b", label: "E" });
      }
      for (const d of exDivDates) {
        lineEntries.push({ time: d, color: "#8b5cf6", label: "D" });
      }
      for (const e of macroEventLines) {
        lineEntries.push(e);
      }

      if (lineEntries.length > 0 && firstSeries) {
        const primitive = new VerticalLinePrimitive(lineEntries);
        try {
          firstSeries.attachPrimitive(primitive);
          vertLinePrimitivesRef.current.push(primitive);
        } catch (e) {
          console.warn("Failed to attach vertical line primitive:", e);
        }
      }
    }

    // Only fitContent when underlying series data actually changes (new ticker,
    // new metric, data refresh), NOT when indicators/markers/transforms toggle.
    // This prevents the scroll "bounce-back" where the user pans the chart and
    // it snaps back to full range on the next render.
    const dataFingerprint = paneSeries.map(s => `${s.id}:${s.data.length}:${s.visible}`).join("|") + `|ohlc:${ohlcData?.length ?? 0}|transform:${dataTransform}|win:${zScoreWindow}`;
    if (dataFingerprint !== prevDataFingerprintRef.current) {
      prevDataFingerprintRef.current = dataFingerprint;
      try { chart.timeScale().fitContent(); } catch {}
    }

    // Notify parent about current series map for crosshair sync
    onSeriesMapUpdate?.(paneId, seriesMapRef.current);
  }, [paneSeries, ohlcData, activeTicker, chartConfig, activeIndicators, chartReady, earningsDates, exDivDates, macroEventLines, dataTransform, zScoreWindow, showQuarterShading, colorByData, IC]);

  // ── Saved drawings overlay ──────────────────────────────────────────────────
  // Re-renders whenever the savedDrawings prop changes (ticker switch or mutation).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    // Remove previously rendered saved drawing series
    savedDrawingSeriesRef.current.forEach((seriesList) => {
      for (const s of seriesList) {
        try { chart.removeSeries(s); } catch {}
      }
    });
    savedDrawingSeriesRef.current.clear();

    if (!savedDrawings || savedDrawings.length === 0) return;

    // Collect all dates in the chart to know x-range for horizontal lines
    const allTimes = paneSeries.flatMap((s) => s.data.map((d) => d.time));
    const sortedTimes = [...new Set(allTimes)].sort() as string[];
    const firstTime = sortedTimes[0];
    const lastTime = sortedTimes[sortedTimes.length - 1];

    for (const drawing of savedDrawings) {
      if (!drawing.visible) continue;
      const { style, id } = drawing;
      const lineStyle = style.dashed ? LineStyle.Dashed : LineStyle.Solid;
      const seriesList: ISeriesApi<any>[] = [];

      try {
        if (drawing.kind === "sr") {
          if (!firstTime || !lastTime) continue;
          const s = chart.addSeries(LineSeries, {
            color: style.color,
            lineWidth: style.lineWidth as any,
            lineStyle,
            title: drawing.label,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: () => null,
          });
          s.setData([
            { time: firstTime as any, value: drawing.price },
            { time: lastTime as any, value: drawing.price },
          ]);
          seriesList.push(s);

        } else if (drawing.kind === "trendline") {
          const s = chart.addSeries(LineSeries, {
            color: style.color,
            lineWidth: style.lineWidth as any,
            lineStyle,
            title: drawing.label,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: () => null,
          });
          s.setData([
            { time: drawing.start.date as any, value: drawing.start.price },
            { time: drawing.end.date as any, value: drawing.end.price },
          ]);
          seriesList.push(s);

        } else if (drawing.kind === "channel") {
          const upper = chart.addSeries(LineSeries, {
            color: style.color,
            lineWidth: style.lineWidth as any,
            lineStyle,
            title: drawing.label,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: () => null,
          });
          upper.setData([
            { time: drawing.upper.start.date as any, value: drawing.upper.start.price },
            { time: drawing.upper.end.date as any, value: drawing.upper.end.price },
          ]);
          const lower = chart.addSeries(LineSeries, {
            color: style.color,
            lineWidth: style.lineWidth as any,
            lineStyle: LineStyle.Dashed,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: () => null,
          });
          lower.setData([
            { time: drawing.lower.start.date as any, value: drawing.lower.start.price },
            { time: drawing.lower.end.date as any, value: drawing.lower.end.price },
          ]);
          seriesList.push(upper, lower);

        } else if (drawing.kind === "fib") {
          const high = drawing.swingHigh.price;
          const low = drawing.swingLow.price;
          const range = high - low;
          const startDate = drawing.swingLow.date < drawing.swingHigh.date ? drawing.swingLow.date : drawing.swingHigh.date;
          if (range <= 0) continue;

          for (const level of drawing.levels) {
            const price = high - range * level;
            const fibSeries = chart.addSeries(LineSeries, {
              color: style.color,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              title: `Fib ${(level * 100).toFixed(1)}%`,
              crosshairMarkerVisible: false,
              lastValueVisible: false,
              priceLineVisible: false,
              autoscaleInfoProvider: () => null,
            });
            fibSeries.setData([
              { time: startDate as any, value: price },
              { time: (lastTime || startDate) as any, value: price },
            ]);
            seriesList.push(fibSeries);
          }

        } else if (drawing.kind === "pattern") {
          const s = chart.addSeries(LineSeries, {
            color: style.color,
            lineWidth: style.lineWidth as any,
            lineStyle: LineStyle.Dotted,
            title: drawing.label,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: () => null,
          });
          s.setData([
            { time: drawing.start.date as any, value: drawing.start.price },
            { time: drawing.end.date as any, value: drawing.end.price },
          ]);
          seriesList.push(s);
        }
      } catch (err) {
        console.warn(`[SavedDrawings] Failed to render drawing ${id}:`, err);
      }

      if (seriesList.length > 0) {
        savedDrawingSeriesRef.current.set(id, seriesList);
      }
    }
  }, [savedDrawings, chartReady, paneSeries]);

  // Time range
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    if (timeRange === "Max") {
      chart.timeScale().fitContent();
      return;
    }

    const now = new Date();
    let from: Date;
    switch (timeRange) {
      case "1Y": from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
      case "3Y": from = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()); break;
      case "5Y": from = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate()); break;
      case "YTD": from = new Date(now.getFullYear(), 0, 1); break;
      default: chart.timeScale().fitContent(); return;
    }

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    try {
      chart.timeScale().setVisibleRange({
        from: fmt(from) as Time,
        to: fmt(now) as Time,
      });
    } catch {
      chart.timeScale().fitContent();
    }
  }, [timeRange, chartReady]);

  // Resize when container changes
  useEffect(() => {
    if (!chartRef.current || !containerRef.current) return;
    const resize = () => {
      const { width, height } = containerRef.current!.getBoundingClientRect();
      if (width > 0 && height > 0) {
        chartRef.current!.applyOptions({ width, height });
      }
    };
    const t1 = setTimeout(resize, 0);
    const t2 = setTimeout(resize, 50);
    const t3 = setTimeout(resize, 200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  });

  // Determine which sub-indicator charts to show
  const subCharts: SubChartType[] = [];
  if (typeof activeIndicators.rsi === "number") subCharts.push("rsi");
  if (activeIndicators.macd) subCharts.push("macd");
  if (activeIndicators.heikinAshi) subCharts.push("ha");
  if (typeof activeIndicators.atr === "number") subCharts.push("atr");
  if (typeof activeIndicators.roc === "number") subCharts.push("roc");
  if (activeIndicators.stochastic) subCharts.push("stochastic");
  if (activeIndicators.obv) subCharts.push("obv");

  // Close data for sub-charts: use the first visible series data
  const primaryForSub = paneSeries.find((s) => s.visible && s.data.length > 0);
  const subCloseData = primaryForSub ? primaryForSub.data : [];
  const subBaseLabel = primaryForSub && primaryForSub.metric !== "close" ? ` (${primaryForSub.metric})` : "";

  return (
    <div
      className={`relative w-full h-full min-w-0 min-h-0 overflow-hidden border border-border/50 rounded flex flex-col ${
        isActive ? "ring-1 ring-primary/30" : ""
      }`}
      style={{ cursor: activeTool === "eraser" ? "pointer" : activeTool !== "none" ? "crosshair" : "default" }}
    >
      {/* Pane label */}
      <div className="absolute top-1 left-2 z-10 flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-muted-foreground/60 bg-background/80 px-1.5 py-0.5 rounded">
          {paneLabel}
        </span>
        {paneSeries.length > 0 && (
          <span className="text-[10px] text-muted-foreground/40">
            {paneSeries.length} series
          </span>
        )}
        <button
          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${
            logScale
              ? "bg-primary text-primary-foreground"
              : "bg-background/80 text-muted-foreground/60 hover:text-muted-foreground"
          }`}
          onClick={() => setLogScale(!logScale)}
          title="Toggle logarithmic scale"
          data-testid={`chart-pane-${paneId}-log`}
        >
          LOG
        </button>
        {/* Per-pane data transform toggle */}
        <div className="flex items-center gap-px ml-0.5">
          {(["raw", "zscore", "percentile"] as DataTransform[]).map((t) => {
            const label = t === "raw" ? "Raw" : t === "zscore" ? "Z" : "%";
            return (
              <button
                key={t}
                className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded transition-colors ${
                  dataTransform === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-background/80 text-muted-foreground/60 hover:text-muted-foreground"
                }`}
                onClick={() => setDataTransform(t)}
                title={t === "raw" ? "Raw data" : t === "zscore" ? "Z-Score" : "Percentile"}
                data-testid={`chart-pane-${paneId}-transform-${t}`}
              >
                {label}
              </button>
            );
          })}
          {/* Z-Score / Percentile window selector */}
          {dataTransform !== "raw" && (
            <div className="flex items-center gap-0.5 ml-1">
              <select
                className="text-[9px] font-mono bg-background/80 text-muted-foreground border border-border/50 rounded px-0.5 py-0.5 h-[18px] focus:outline-none focus:ring-1 focus:ring-primary"
                value={zScoreWindow}
                onChange={(e) => setZScoreWindow(Number(e.target.value))}
                title="Lookback window (0 = expanding / all history)"
                data-testid={`chart-pane-${paneId}-zscore-window`}
              >
                <option value={0}>All</option>
                <option value={63}>63d</option>
                <option value={126}>126d</option>
                <option value={252}>1Y</option>
                <option value={504}>2Y</option>
                <option value={756}>3Y</option>
                <option value={1260}>5Y</option>
              </select>
            </div>
          )}
        </div>
        <ExportMenu
          getChart={() => chartRef.current}
          label={`${paneLabel}_${paneSeries.map(s => s.label).join("_")}`}
          className="ml-0.5"
        />
      </div>
      {/* Color-by gradient legend — separate row to avoid overlapping right-side buttons */}
      {colorByMetric && colorByRange && (
        <div className="absolute top-6 left-2 z-10 flex items-center gap-1.5 bg-background/90 px-1.5 py-0.5 rounded">
          <span className="text-[10px] font-mono text-muted-foreground font-bold">
            {colorByRange.min.toFixed(1)}
          </span>
          <div
            className="h-4 rounded-sm flex-shrink-0 border border-white/20"
            style={{
              width: 120,
              background: `linear-gradient(to right, ${gradientColorHsl(0)}, ${gradientColorHsl(0.25)}, ${gradientColorHsl(0.5)}, ${gradientColorHsl(0.75)}, ${gradientColorHsl(1)})`,
            }}
          />
          <span className="text-[10px] font-mono text-muted-foreground font-bold">
            {colorByRange.max.toFixed(1)}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground ml-0.5">
            {colorByMetric}
          </span>
          {onClearColorBy && (
            <button
              onClick={onClearColorBy}
              className="text-[10px] text-muted-foreground/60 hover:text-foreground ml-0.5 font-bold"
              title="Clear color-by"
              data-testid={`chart-pane-${paneId}-clear-colorby`}
            >
              ×
            </button>
          )}
        </div>
      )}
      {/* Main chart area — flex-1 takes remaining space after sub-charts */}
      <div ref={containerRef} className="w-full flex-1 min-h-0" data-testid={`chart-pane-${paneId}`} />
      {/* Sub-indicator charts (RSI, MACD, HA) stacked below */}
      {subCloseData.length > 0 && subCharts.map((st) => (
        <SubIndicatorChart
          key={st}
          type={st}
          closeData={subCloseData}
          activeIndicators={activeIndicators}
          parentChart={chartRef.current}
          baseLabel={subBaseLabel}
        />
      ))}
      {paneSeries.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-muted-foreground/40">Empty pane — add series</span>
        </div>
      )}
    </div>
  );
});

ChartPane.displayName = "ChartPane";
export default ChartPane;
