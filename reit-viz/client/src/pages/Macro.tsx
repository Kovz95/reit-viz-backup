import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMacroCatalog, fetchMacroSeries, clearMacroCache } from "@/lib/macroStatic";
import { applyTransform } from "@/lib/transforms";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  PriceScaleMode,
} from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Download,
  Clock,
  TrendingUp,
  Circle,
  Eye,
  EyeOff,
  X as XIcon,
} from "lucide-react";
import IndicatorsPanel from "@/components/IndicatorsPanel";
import type { ActiveIndicators } from "@/components/ChartPane";
import { INDICATOR_COLORS } from "@/lib/chartColors";
import ExportMenu from "@/components/ExportMenu";
import GridLayoutPicker, { gridContainerStyle } from "@/components/GridLayoutPicker";
import type { GridLayout } from "@/components/GridLayoutPicker";
import {
  computeSMA,
  computeEMA,
  computeHMA,
  computeRSI,
  computeMACD,
  computeMeanAndStdBands,
  computeRollingMeanBands,
  computeBollingerBands,
  computeROC,
  computeStochastic,
} from "@/lib/indicators";
import * as IndicatorMath from "@/lib/indicators";

// ── Types ──
interface MacroSeriesMeta {
  id: string;
  label: string;
  category: string;
  unit: string;
  freq?: string;
  cached?: boolean;
  computed?: boolean;
  lastUpdate?: string | null;
}

interface DataPoint {
  time: string;
  value: number;
}

interface PaneSeries {
  id: string;
  label: string;
  color: string;
  unit: string;
  visible: boolean;
  lineWidth: number;
  lineStyle: number;
}

interface Pane {
  id: string;
  label: string;
  series: PaneSeries[];
  dataTransform: "raw" | "zscore" | "percentile";
  zScoreWindow: number;
}

// ── Chart options ──
const CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid as const, color: "transparent" },
    textColor: "#7a8a9e",
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
  },
  grid: {
    vertLines: { color: "rgba(255,255,255,0.04)" },
    horzLines: { color: "rgba(255,255,255,0.04)" },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
  timeScale: {
    borderColor: "rgba(255,255,255,0.1)",
    timeVisible: false,
  },
  handleScroll: true,
  handleScale: true,
};

// ── Color palette for series ──
const SERIES_COLORS = [
  "#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ec4899",
  "#14b8a6", "#f97316", "#06b6d4", "#8b5cf6", "#ef4444",
  "#84cc16", "#e879f9", "#fb923c", "#2dd4bf", "#fbbf24",
];

const LINE_STYLE_LABELS = ["Solid", "Dotted", "Dashed", "LgDash"];

// ── Presets: common multi-series views ──
const PRESETS: { label: string; ids: string[]; group: string }[] = [
  { label: "Yield Curve", ids: ["DGS2", "DGS5", "DGS10", "DGS30"], group: "National" },
  { label: "Spreads", ids: ["SPREAD_10Y_2Y", "SPREAD_5Y_2Y", "SPREAD_10Y_5Y"], group: "National" },
  { label: "Real vs Nominal", ids: ["DGS10", "DFII10", "T10YIE"], group: "National" },
  { label: "Policy Rates", ids: ["DFEDTARU", "SOFR", "DGS2"], group: "National" },
  { label: "Housing Supply", ids: ["HOUST", "HOUST5F", "HOUST1F"], group: "National" },
  { label: "Permits", ids: ["PERMIT", "PERMIT5", "PERMIT1"], group: "National" },
  { label: "MF Pipeline", ids: ["HOUST5F", "PERMIT5", "UNDCONTSA"], group: "National" },
  { label: "Starts vs Completions", ids: ["HOUST", "COMPU"], group: "National" },
  { label: "Labor Market", ids: ["UNRATE", "PAYEMS", "ICSA"], group: "National" },
  { label: "CPI vs PCE", ids: ["CPIAUCSL", "CPILFESL", "PCEPI", "PCEPILFE"], group: "National" },
  { label: "Mortgage + 10Y", ids: ["MORTGAGE30US", "DGS10"], group: "National" },
  { label: "Risk Indicators", ids: ["VIXCLS", "DCOILWTICO"], group: "National" },
  { label: "Sunbelt Permits", ids: ["PHOE004BPPRIVSA", "DALL148BPPRIVSA", "ATLA013BPPRIVSA", "HOUS448BPPRIVSA", "AUST448BPPRIVSA", "NASH947BPPRIVSA"], group: "Regional" },
  { label: "Coastal Permits", ids: ["NEWY636BPPRIVSA", "LOSA106BPPRIVSA", "SANF806BPPRIVSA", "BOST625BPPRIVSA", "SEAT653BPPRIVSA", "CHIC917BPPRIVSA"], group: "Regional" },
  { label: "FL Permits", ids: ["TAMP312BPPRIVSA", "MIAM112BPPRIVSA", "ORLA712BPPRIVSA"], group: "Regional" },
  { label: "TX Permits", ids: ["DALL148BPPRIVSA", "HOUS448BPPRIVSA", "AUST448BPPRIVSA"], group: "Regional" },
  { label: "Sunbelt Unemp", ids: ["PHOE004URN", "DALL148URN", "ATLA013URN", "HOUS448URN", "AUST448URN", "NASH947URN"], group: "Regional" },
  { label: "Coastal Unemp", ids: ["NEWY636URN", "LOSA106URN", "SANF806URN", "BOST625URN", "SEAT653URN", "CHIC917URN"], group: "Regional" },
  { label: "Sunbelt Jobs", ids: ["PHOE004NA", "DALL148NA", "ATLA013NA", "HOUS448NA", "DENV708NA", "NASH947NA"], group: "Regional" },
  { label: "Coastal Jobs", ids: ["NEWY636NA", "LOSA106NA", "SANF806NA", "BOST625NA", "SEAT653NA", "CHIC917NA"], group: "Regional" },
  { label: "CS Sunbelt", ids: ["PHXRSA", "DAXRSA", "ATXRSA", "MIXRSA", "LVXRSA", "TPXRSA", "DNXRSA"], group: "Home Prices" },
  { label: "CS Coastal", ids: ["NYXRSA", "LXXRSA", "SFXRSA", "BOXRSA", "SEXRSA", "CHXRSA"], group: "Home Prices" },
  { label: "CS National", ids: ["CSUSHPISA", "SPCS20RSA"], group: "Home Prices" },
  { label: "Sunbelt Listings", ids: ["MEDLISPRI38060", "MEDLISPRI19100", "MEDLISPRI12060", "MEDLISPRI26420", "MEDLISPRI12420", "MEDLISPRI19740"], group: "Home Prices" },
];

let paneCounter = 1;

type MacroChartType = "line" | "line-scatter";

// ── MacroPane component ──
function MacroPane({
  pane,
  allData,
  height,
  isMaximized,
  onMaximize,
  useFlexHeight,
  onRegisterChart,
  onUnregisterChart,
  onRegisterSeries,
  onCrosshairMove,
  activeIndicators,
  chartType,
  onUpdatePane,
  onRemoveSeriesFromPane,
  onToggleSeriesVisibility,
  onUpdateSeriesStyle,
}: {
  pane: Pane;
  allData: Record<string, { data: DataPoint[]; meta: MacroSeriesMeta }>;
  height: number;
  isMaximized: boolean;
  onMaximize: (id: string | null) => void;
  useFlexHeight?: boolean;
  onRegisterChart: (id: string, chart: IChartApi) => void;
  onUnregisterChart: (id: string) => void;
  onRegisterSeries: (id: string, series: ISeriesApi<any>) => void;
  onCrosshairMove: (id: string, data: { time: string; values: Record<string, number> } | null) => void;
  activeIndicators: ActiveIndicators;
  chartType: MacroChartType;
  onUpdatePane: (id: string, patch: Partial<Pane>) => void;
  onRemoveSeriesFromPane: (paneId: string, seriesId: string) => void;
  onToggleSeriesVisibility: (paneId: string, seriesId: string) => void;
  onUpdateSeriesStyle: (paneId: string, seriesId: string, patch: Partial<PaneSeries>) => void;
}) {
  const effectiveFlexHeight = useFlexHeight || isMaximized;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const indicatorSeriesRef = useRef<ISeriesApi<any>[]>([]);
  const [logScale, setLogScale] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  const resolvedSeries = useMemo(() => pane.series.filter(s => s.visible).map(s => {
    const entry = allData[s.id];
    if (!entry?.data?.length) return null;
    const data = applyTransform(entry.data, pane.dataTransform, pane.zScoreWindow || undefined);
    return {
      id: s.id,
      label: s.label,
      color: s.color,
      unit: entry.meta.unit || "",
      lineWidth: s.lineWidth,
      lineStyle: s.lineStyle,
      data,
    };
  }).filter(Boolean) as {
    id: string; label: string; color: string; unit: string; lineWidth: number; lineStyle: number; data: DataPoint[];
  }[], [pane.series, pane.dataTransform, pane.zScoreWindow, allData]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || resolvedSeries.length === 0) return;

    if (chartRef.current) {
      onUnregisterChart(pane.id);
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(el, {
      ...CHART_OPTIONS,
      width: el.clientWidth,
      height: effectiveFlexHeight ? el.clientHeight || 300 : height,
    });
    chartRef.current = chart;
    onRegisterChart(pane.id, chart);

    const multiScale = new Set(resolvedSeries.map(s => s.unit)).size > 1;
    const isScatter = chartType === "line-scatter";

    resolvedSeries.forEach((s, idx) => {
      const scaleId = multiScale ? (idx === 0 ? "right" : `scale_${idx}`) : "right";
      const series = chart.addSeries(LineSeries, {
        color: s.color,
        lineWidth: (isScatter ? 0 : s.lineWidth || 1.5) as any,
        lineStyle: s.lineStyle || 0,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: isScatter ? 2.5 : 3,
        pointMarkersVisible: isScatter,
        pointMarkersRadius: isScatter ? 1.5 : 0,
        title: s.label,
        priceScaleId: scaleId,
      });
      series.setData(s.data.map(d => ({ time: d.time as Time, value: d.value })));
      if (idx === 0) onRegisterSeries(pane.id, series);
      if (multiScale && idx > 0) {
        series.priceScale().applyOptions({
          scaleMargins: { top: 0.1, bottom: 0.1 },
        });
      }
    });

    indicatorSeriesRef.current = [];
    const primaryData = resolvedSeries[0]?.data;
    if (primaryData && primaryData.length > 0) {
      // SMA
      if (activeIndicators.sma) {
        const smaData = computeSMA(primaryData, activeIndicators.sma);
        if (smaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.sma,
            lineWidth: 1,
            title: `SMA ${activeIndicators.sma}`,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          s.setData(smaData.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(s);
        }
      }

      // EMA
      if (activeIndicators.ema) {
        const emaData = computeEMA(primaryData, activeIndicators.ema);
        if (emaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.ema,
            lineWidth: 1,
            title: `EMA ${activeIndicators.ema}`,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          s.setData(emaData.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(s);
        }
      }

      // HMA
      if (activeIndicators.hma) {
        const hmaData = computeHMA(primaryData, activeIndicators.hma);
        if (hmaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.hma,
            lineWidth: 2,
            title: `HMA ${activeIndicators.hma}`,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          s.setData(hmaData.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(s);
        }
      }

      // LSMA
      if ((activeIndicators as any).lsma && (IndicatorMath as any).computeLSMA) {
        const lsmaData = (IndicatorMath as any).computeLSMA(primaryData, (activeIndicators as any).lsma, 0);
        if (lsmaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: (INDICATOR_COLORS as any).lsma,
            lineWidth: 1,
            title: `LSMA ${(activeIndicators as any).lsma}`,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          s.setData(lsmaData.map((d: any) => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(s);
        }
      }

      // SLSMA
      if ((activeIndicators as any).slsma && (IndicatorMath as any).computeSLSMA) {
        const slsmaData = (IndicatorMath as any).computeSLSMA(primaryData, (activeIndicators as any).slsma, 0);
        if (slsmaData.length > 0) {
          const s = chart.addSeries(LineSeries, {
            color: (INDICATOR_COLORS as any).slsma,
            lineWidth: 2,
            title: `SLSMA ${(activeIndicators as any).slsma}`,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          s.setData(slsmaData.map((d: any) => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(s);
        }
      }

      // RSI
      if (typeof activeIndicators.rsi === "number") {
        const rsiData = computeRSI(primaryData, activeIndicators.rsi);
        if (rsiData.length > 0) {
          const rsiLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.rsi_line,
            lineWidth: 1,
            title: `RSI ${activeIndicators.rsi}`,
            priceScaleId: "rsi",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          rsiLine.setData(rsiData.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(rsiLine);

          const first = rsiData[0].time as Time;
          const last = rsiData[rsiData.length - 1].time as Time;
          for (const [level, color] of [
            [70, INDICATOR_COLORS.rsi_overbought],
            [30, INDICATOR_COLORS.rsi_oversold],
          ] as [number, string][]) {
            const ref = chart.addSeries(LineSeries, {
              color,
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              title: "",
              priceScaleId: "rsi",
              crosshairMarkerVisible: false,
              priceLineVisible: false,
              lastValueVisible: false,
            });
            ref.setData([
              { time: first, value: level },
              { time: last, value: level },
            ]);
            indicatorSeriesRef.current.push(ref);
          }
          rsiLine.priceScale().applyOptions({
            scaleMargins: { top: 0.75, bottom: 0 },
          });
        }
      }

      // MACD
      if (activeIndicators.macd) {
        const macd = computeMACD(primaryData, 12, 26, 9);
        if (macd.macdLine.length > 0) {
          const ml = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.macd_line,
            lineWidth: 1,
            title: "MACD",
            priceScaleId: "macd",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          ml.setData(macd.macdLine.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(ml);

          const sl = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.macd_signal,
            lineWidth: 1,
            title: "Signal",
            priceScaleId: "macd",
            crosshairMarkerVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          sl.setData(macd.signalLine.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(sl);

          if (macd.macdLine.length >= 2) {
            const zl = chart.addSeries(LineSeries, {
              color: "rgba(255,255,255,0.15)",
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              title: "",
              priceScaleId: "macd",
              crosshairMarkerVisible: false,
              priceLineVisible: false,
              lastValueVisible: false,
            });
            zl.setData([
              { time: macd.macdLine[0].time as Time, value: 0 },
              { time: macd.macdLine[macd.macdLine.length - 1].time as Time, value: 0 },
            ]);
            indicatorSeriesRef.current.push(zl);
          }

          ml.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        }
      }

      // Mean ± Std Bands
      if (activeIndicators.mean) {
        const { rolling, period } = activeIndicators.mean;
        if (rolling) {
          const rb = computeRollingMeanBands(primaryData, period);
          if (rb.mean.length > 0) {
            const ml = chart.addSeries(LineSeries, {
              color: INDICATOR_COLORS.mean,
              lineWidth: 1,
              title: `Rolling Mean ${period}`,
              lineStyle: LineStyle.LargeDashed,
              priceLineVisible: false,
              lastValueVisible: false,
            });
            ml.setData(rb.mean.map(d => ({ time: d.time as Time, value: d.value })));
            indicatorSeriesRef.current.push(ml);

            for (const b of rb.bands) {
              const bs = chart.addSeries(LineSeries, {
                color: Math.abs(b.mult) === 1
                  ? "rgba(99, 102, 241, 0.4)"
                  : "rgba(99, 102, 241, 0.25)",
                lineWidth: 1,
                title: `${b.mult > 0 ? "+" : ""}${b.mult}σ`,
                lineStyle: LineStyle.Dotted,
                priceLineVisible: false,
                lastValueVisible: false,
              });
              bs.setData(b.data.map(d => ({ time: d.time as Time, value: d.value })));
              indicatorSeriesRef.current.push(bs);
            }
          }
        } else {
          const subset = period < primaryData.length ? primaryData.slice(-period) : primaryData;
          const stats = computeMeanAndStdBands(subset);
          if (subset.length >= 2) {
            const first = subset[0].time as Time;
            const last = subset[subset.length - 1].time as Time;

            const meanLine = chart.addSeries(LineSeries, {
              color: INDICATOR_COLORS.mean,
              lineWidth: 1,
              title: `Mean (${stats.mean.toFixed(2)}) [${period}]`,
              lineStyle: LineStyle.LargeDashed,
              priceLineVisible: false,
              lastValueVisible: false,
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
                priceLineVisible: false,
                lastValueVisible: false,
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

      // Bollinger Bands
      if (activeIndicators.bollinger) {
        const { period, mult } = activeIndicators.bollinger;
        const bb = computeBollingerBands(primaryData, period, mult);
        if (bb.basis.length > 0) {
          const ml = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.bollinger_basis,
            lineWidth: 1,
            title: `BB Mid ${period}`,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          ml.setData(bb.basis.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(ml);

          const upper = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.bollinger_band,
            lineWidth: 1,
            title: `BB +${mult}σ`,
            lineStyle: LineStyle.Dotted,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          upper.setData(bb.upper.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(upper);

          const lower = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.bollinger_band,
            lineWidth: 1,
            title: `BB -${mult}σ`,
            lineStyle: LineStyle.Dotted,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          lower.setData(bb.lower.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(lower);
        }
      }

      // ROC
      if (typeof activeIndicators.roc === "number") {
        const rocData = computeROC(primaryData, activeIndicators.roc);
        if (rocData.length > 0) {
          const rocLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.roc,
            lineWidth: 1,
            title: `ROC ${activeIndicators.roc}`,
            priceScaleId: "roc",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          rocLine.setData(rocData.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(rocLine);

          if (rocData.length >= 2) {
            const zl = chart.addSeries(LineSeries, {
              color: "rgba(255,255,255,0.15)",
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              title: "",
              priceScaleId: "roc",
              crosshairMarkerVisible: false,
              priceLineVisible: false,
              lastValueVisible: false,
            });
            zl.setData([
              { time: rocData[0].time as Time, value: 0 },
              { time: rocData[rocData.length - 1].time as Time, value: 0 },
            ]);
            indicatorSeriesRef.current.push(zl);
          }
          rocLine.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        }
      }

      // Stochastic
      if (activeIndicators.stochastic) {
        const { kPeriod, dPeriod } = activeIndicators.stochastic;
        const stoch = computeStochastic(primaryData, kPeriod, dPeriod);
        if (stoch.k.length > 0) {
          const kLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.stoch_k,
            lineWidth: 1,
            title: `%K ${kPeriod}`,
            priceScaleId: "stoch",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          kLine.setData(stoch.k.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(kLine);

          const dLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.stoch_d,
            lineWidth: 1,
            title: `%D ${dPeriod}`,
            priceScaleId: "stoch",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          dLine.setData(stoch.d.map(d => ({ time: d.time as Time, value: d.value })));
          indicatorSeriesRef.current.push(dLine);

          if (stoch.k.length >= 2) {
            const first = stoch.k[0].time as Time;
            const last = stoch.k[stoch.k.length - 1].time as Time;
            for (const [level, color] of [
              [80, INDICATOR_COLORS.rsi_overbought],
              [20, INDICATOR_COLORS.rsi_oversold],
            ] as [number, string][]) {
              const ref = chart.addSeries(LineSeries, {
                color,
                lineWidth: 1,
                lineStyle: LineStyle.Dotted,
                title: "",
                priceScaleId: "stoch",
                crosshairMarkerVisible: false,
                priceLineVisible: false,
                lastValueVisible: false,
              });
              ref.setData([
                { time: first, value: level },
                { time: last, value: level },
              ]);
              indicatorSeriesRef.current.push(ref);
            }
          }
          kLine.priceScale().applyOptions({
            scaleMargins: { top: 0.75, bottom: 0 },
          });
        }
      }
    }

    // Crosshair value reporting
    const crosshairCb = (param: any) => {
      if (!param.time || !param.seriesData) {
        onCrosshairMove(pane.id, null);
        return;
      }
      const values: Record<string, number> = {};
      param.seriesData.forEach((dataPoint: any, series: any) => {
        const val = dataPoint?.value ?? dataPoint?.close;
        if (val !== undefined && val !== null) {
          const seriesTitle = series.options?.()?.title || pane.label;
          values[seriesTitle || pane.label] = val;
        }
      });
      if (Object.keys(values).length > 0) {
        onCrosshairMove(pane.id, { time: String(param.time), values });
      }
    };
    chart.subscribeCrosshairMove(crosshairCb);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (chartRef.current && el) {
        chartRef.current.applyOptions({
          width: el.clientWidth,
          height: effectiveFlexHeight ? el.clientHeight || 300 : height,
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      try { chart.unsubscribeCrosshairMove(crosshairCb); } catch {}
      onCrosshairMove(pane.id, null);
      onUnregisterChart(pane.id);
      chart.remove();
      chartRef.current = null;
      indicatorSeriesRef.current = [];
    };
  }, [resolvedSeries, height, pane.id, isMaximized, effectiveFlexHeight, activeIndicators, chartType]);

  // Log scale
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.priceScale("right").applyOptions({
        mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      });
    } catch {}
  }, [logScale]);

  return (
    <div
      className={`flex flex-col ${
        isMaximized
          ? "fixed inset-0 z-50 bg-background"
          : effectiveFlexHeight
            ? "w-full h-full border border-border/30 min-h-0 overflow-hidden"
            : "border-b border-border/30"
      }`}
      onDoubleClick={() => onMaximize(isMaximized ? null : pane.id)}
    >
      <div className="flex items-center gap-1 px-2 py-0.5 bg-card/50 flex-shrink-0 flex-wrap">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-[150px]">
          {pane.label}
        </span>
        <div className="flex items-center gap-0.5 ml-1">
          {pane.series.map(s => (
            <button
              key={s.id}
              className={`w-2.5 h-2.5 rounded-full border border-white/20 transition-opacity ${s.visible ? "opacity-100" : "opacity-30"}`}
              style={{ backgroundColor: s.color }}
              onClick={(e) => { e.stopPropagation(); onToggleSeriesVisibility(pane.id, s.id); }}
              title={`${s.label} — click to ${s.visible ? "hide" : "show"}`}
            />
          ))}
          <button
            className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground ml-0.5"
            onClick={(e) => { e.stopPropagation(); setShowLegend(!showLegend); }}
            title="Toggle legend"
          >
            {showLegend ? "▾" : `${pane.series.length}s`}
          </button>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-px">
          {(["raw", "zscore", "percentile"] as const).map(transform => {
            const label = transform === "raw" ? "Raw" : transform === "zscore" ? "Z" : "%";
            return (
              <button
                key={transform}
                className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded transition-colors ${
                  pane.dataTransform === transform
                    ? "bg-primary text-primary-foreground"
                    : "bg-background/80 text-muted-foreground/60 hover:text-muted-foreground"
                }`}
                onClick={(e) => { e.stopPropagation(); onUpdatePane(pane.id, { dataTransform: transform }); }}
                title={transform === "raw" ? "Raw data" : transform === "zscore" ? "Z-Score" : "Percentile"}
                data-testid={`macro-pane-${pane.id}-transform-${transform}`}
              >
                {label}
              </button>
            );
          })}
          {pane.dataTransform !== "raw" && (
            <select
              className="text-[9px] font-mono bg-background/80 text-muted-foreground border border-border/50 rounded px-0.5 py-0.5 h-[18px] focus:outline-none ml-0.5"
              value={pane.zScoreWindow}
              onChange={(e) => { e.stopPropagation(); onUpdatePane(pane.id, { zScoreWindow: Number(e.target.value) }); }}
              title="Lookback window (0 = expanding)"
              data-testid={`macro-pane-${pane.id}-zscore-window`}
              onClick={(e) => e.stopPropagation()}
            >
              <option value={0}>All</option>
              <option value={63}>63d</option>
              <option value={126}>126d</option>
              <option value={252}>1Y</option>
              <option value={504}>2Y</option>
              <option value={756}>3Y</option>
              <option value={1260}>5Y</option>
            </select>
          )}
        </div>
        <button
          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${
            logScale
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground/60 hover:text-muted-foreground bg-transparent"
          }`}
          onClick={(e) => { e.stopPropagation(); setLogScale(!logScale); }}
          title="Toggle logarithmic scale"
          data-testid={`macro-chart-${pane.id}-log`}
        >
          LOG
        </button>
        <div onClick={(e) => e.stopPropagation()}>
          <ExportMenu
            getChart={() => chartRef.current}
            label={`Macro_${pane.label}`}
          />
        </div>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
          onClick={(e) => { e.stopPropagation(); onMaximize(isMaximized ? null : pane.id); }}
          title={isMaximized ? "Restore" : "Maximize"}>
          {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </Button>
      </div>
      {showLegend && (
        <div
          className="px-2 py-1 bg-card/80 border-b border-border/20 flex flex-col gap-0.5 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {pane.series.map(s => (
            <div key={s.id} className="flex items-center gap-1.5 group">
              <button
                className="w-3 h-3 rounded-sm border border-white/20 flex-shrink-0"
                style={{ backgroundColor: s.color }}
                onClick={() => {
                  const idx = SERIES_COLORS.indexOf(s.color);
                  const next = SERIES_COLORS[(idx + 1) % SERIES_COLORS.length];
                  onUpdateSeriesStyle(pane.id, s.id, { color: next });
                }}
                title="Click to change color"
              />
              <span className={`text-[10px] font-mono truncate flex-1 ${s.visible ? "text-foreground" : "text-muted-foreground/40 line-through"}`}>
                {s.label}
              </span>
              <select
                className="text-[9px] font-mono bg-background/60 border border-border/40 rounded px-0.5 h-[16px] w-[34px]"
                value={s.lineWidth}
                onChange={(e) => onUpdateSeriesStyle(pane.id, s.id, { lineWidth: Number(e.target.value) })}
                title="Line width"
              >
                {[1, 2, 3, 4].map(w => (
                  <option key={w} value={w}>{w}px</option>
                ))}
              </select>
              <select
                className="text-[9px] font-mono bg-background/60 border border-border/40 rounded px-0.5 h-[16px] w-[48px]"
                value={s.lineStyle}
                onChange={(e) => onUpdateSeriesStyle(pane.id, s.id, { lineStyle: Number(e.target.value) })}
                title="Line style"
              >
                {LINE_STYLE_LABELS.map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
              <button
                className="text-muted-foreground/60 hover:text-foreground"
                onClick={() => onToggleSeriesVisibility(pane.id, s.id)}
                title={s.visible ? "Hide" : "Show"}
              >
                {s.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <button
                className="text-muted-foreground/40 hover:text-red-400"
                onClick={() => onRemoveSeriesFromPane(pane.id, s.id)}
                title="Remove from pane"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div ref={containerRef} style={effectiveFlexHeight ? { flex: 1 } : { height }} className={effectiveFlexHeight ? "flex-1 min-h-0" : ""} />
    </div>
  );
}

// ── Main Macro Page ──
export default function Macro() {
  const qc = useQueryClient();
  const [panes, setPanes] = useState<Pane[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(["DGS2", "DGS5", "DGS10", "DGS30"]);
  const [maximizedPane, setMaximizedPane] = useState<string | null>(null);
  const [showIndicators, setShowIndicators] = useState(false);
  const [indicatorsMap, setIndicatorsMap] = useState<Record<string, ActiveIndicators>>({});
  const [indicatorPaneId, setIndicatorPaneId] = useState<string | null>(null);
  const [macroGridLayout, setMacroGridLayout] = useState<GridLayout>("1x1");
  const [macroChartType, setMacroChartType] = useState<MacroChartType>("line");
  const [addMode, setAddMode] = useState<"overlay" | "new">("overlay");
  const [targetPaneId, setTargetPaneId] = useState<string>("auto");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set([
    "Regional Permits (Sunbelt)", "Regional Permits (Coastal)",
    "Regional Labor (Sunbelt)", "Regional Labor (Coastal)",
    "Regional Employment (Sunbelt)", "Regional Employment (Coastal)",
    "Regional Listing Prices",
  ]));

  const presetAppliedRef = useRef(false);

  const serializeMacro = useCallback(() => ({
    panes,
    selectedIds,
    macroGridLayout,
    macroChartType,
    collapsedCategories: [...collapsedCategories],
    indicatorsMap,
    showIndicators,
    addMode,
    targetPaneId,
  }), [panes, selectedIds, macroGridLayout, macroChartType, collapsedCategories, indicatorsMap, showIndicators, addMode, targetPaneId]);

  const restoreMacro = useCallback((state: any) => {
    if (state.panes !== undefined) { setPanes(state.panes); presetAppliedRef.current = true; }
    if (state.selectedIds !== undefined) setSelectedIds(state.selectedIds);
    if (state.macroGridLayout !== undefined) setMacroGridLayout(state.macroGridLayout);
    if (state.macroChartType !== undefined) setMacroChartType(state.macroChartType);
    if (state.collapsedCategories !== undefined) setCollapsedCategories(new Set(state.collapsedCategories));
    if (state.indicatorsMap !== undefined) setIndicatorsMap(state.indicatorsMap);
    if (typeof state.showIndicators === "boolean") setShowIndicators(state.showIndicators);
    if (state.addMode !== undefined) setAddMode(state.addMode);
    if (state.targetPaneId !== undefined) setTargetPaneId(state.targetPaneId);
  }, []);

  useWorkspaceTab("macro", serializeMacro, restoreMacro);

  // Crosshair aggregation
  const [crosshairData, setCrosshairData] = useState<{
    time: string;
    values: Record<string, number>;
  } | null>(null);
  const crosshairValuesRef = useRef<Map<string, { time: string; values: Record<string, number> }>>(new Map());
  const crosshairFlushRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  const handleCrosshairMove = useCallback((chartId: string, data: { time: string; values: Record<string, number> } | null) => {
    if (data) {
      crosshairValuesRef.current.set(chartId, data);
    } else {
      crosshairValuesRef.current.delete(chartId);
    }
    if (crosshairFlushRef.current) cancelAnimationFrame(crosshairFlushRef.current);
    crosshairFlushRef.current = requestAnimationFrame(() => {
      const entries = Array.from(crosshairValuesRef.current.values());
      if (entries.length === 0) { setCrosshairData(null); return; }
      const merged: Record<string, number> = {};
      let latestTime = entries[0].time;
      for (const entry of entries) {
        if (entry.time >= latestTime) latestTime = entry.time;
        for (const [k, v] of Object.entries(entry.values)) merged[k] = v;
      }
      setCrosshairData({ time: latestTime, values: merged });
    });
  }, []);

  // Sync infrastructure
  const chartsMapRef = useRef(new Map<string, IChartApi>());
  const seriesMapRef = useRef(new Map<string, ISeriesApi<any>>());
  const syncingRef = useRef(false);
  const syncHandlersRef = useRef(new Map<string, { rangeHandler: (r: any) => void; crosshairHandler: (p: any) => void }>());

  const registerChart = useCallback((id: string, chart: IChartApi) => {
    chartsMapRef.current.set(id, chart);
    const rangeHandler = (range: any) => {
      if (syncingRef.current || !range) return;
      syncingRef.current = true;
      chartsMapRef.current.forEach((other, otherId) => {
        if (otherId !== id) {
          try { other.timeScale().setVisibleLogicalRange(range); } catch {}
        }
      });
      syncingRef.current = false;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);

    const crosshairHandler = (param: any) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      chartsMapRef.current.forEach((other, otherId) => {
        if (otherId !== id) {
          try {
            if (param.time) {
              const otherSeries = seriesMapRef.current.get(otherId);
              if (otherSeries) other.setCrosshairPosition(NaN, param.time, otherSeries);
            } else {
              other.clearCrosshairPosition();
            }
          } catch {}
        }
      });
      syncingRef.current = false;
    };
    chart.subscribeCrosshairMove(crosshairHandler);
    syncHandlersRef.current.set(id, { rangeHandler, crosshairHandler });
  }, []);

  const unregisterChart = useCallback((id: string) => {
    const handlers = syncHandlersRef.current.get(id);
    const chart = chartsMapRef.current.get(id);
    if (handlers && chart) {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(handlers.rangeHandler); } catch {}
      try { chart.unsubscribeCrosshairMove(handlers.crosshairHandler); } catch {}
    }
    syncHandlersRef.current.delete(id);
    chartsMapRef.current.delete(id);
    seriesMapRef.current.delete(id);
  }, []);

  const registerSeries = useCallback((id: string, series: ISeriesApi<any>) => {
    seriesMapRef.current.set(id, series);
  }, []);

  // Fetch catalog
  const { data: catalog } = useQuery<MacroSeriesMeta[]>({
    queryKey: ["macro-catalog"],
    queryFn: fetchMacroCatalog,
  });

  // Fetch selected series data
  const { data: seriesResult, isLoading: seriesLoading, refetch: refetchSeries } = useQuery<
    Record<string, { data: DataPoint[]; meta: MacroSeriesMeta }>
  >({
    queryKey: ["macro-series", { ids: selectedIds.join(",") }],
    queryFn: () => fetchMacroSeries(selectedIds),
    enabled: selectedIds.length > 0,
  });

  // Refresh mutation (not available in static mode)
  const refreshMutation = useMutation<{ timestamp: string }>({
    mutationFn: async () => {
      throw new Error("Refresh not available in static mode");
    },
    onSuccess: () => {
      clearMacroCache();
      qc.invalidateQueries({ queryKey: ["macro-series"] });
      qc.invalidateQueries({ queryKey: ["macro-catalog"] });
      refetchSeries();
    },
  });

  // Add a series to panes (overlay or new pane)
  const addSeriesToPanes = useCallback((id: string, meta: MacroSeriesMeta, target?: string) => {
    setPanes(prev => {
      for (const p of prev) {
        if (p.series.some(s => s.id === id)) return prev;
      }
      const usedColors = new Set(prev.flatMap(p => p.series.map(s => s.color)));
      const color = SERIES_COLORS.find(c => !usedColors.has(c)) ||
        SERIES_COLORS[prev.reduce((acc, p) => acc + p.series.length, 0) % SERIES_COLORS.length];
      const newSeries: PaneSeries = {
        id,
        label: meta.label || id,
        color,
        unit: meta.unit || "",
        visible: true,
        lineWidth: 2,
        lineStyle: 0,
      };
      if (addMode === "new" || prev.length === 0) {
        const paneId = `pane_${paneCounter++}`;
        return [...prev, {
          id: paneId,
          label: meta.label || id,
          series: [newSeries],
          dataTransform: "raw",
          zScoreWindow: 0,
        }];
      }
      const destId = target && prev.find(p => p.id === target) ? target : prev[0].id;
      return prev.map(p => p.id === destId ? { ...p, series: [...p.series, newSeries] } : p);
    });
  }, [addMode]);

  const removeSeriesFromPane = useCallback((paneId: string, seriesId: string) => {
    setPanes(prev => prev.map(p => p.id !== paneId ? p : {
      ...p,
      series: p.series.filter(s => s.id !== seriesId),
    }).filter(p => p.series.length > 0));
    setSelectedIds(prev => prev.filter(s => s !== seriesId));
  }, []);

  const toggleSeriesVisibility = useCallback((paneId: string, seriesId: string) => {
    setPanes(prev => prev.map(p => p.id !== paneId ? p : {
      ...p,
      series: p.series.map(s => s.id === seriesId ? { ...s, visible: !s.visible } : s),
    }));
  }, []);

  const updateSeriesStyle = useCallback((paneId: string, seriesId: string, patch: Partial<PaneSeries>) => {
    setPanes(prev => prev.map(p => p.id !== paneId ? p : {
      ...p,
      series: p.series.map(s => s.id === seriesId ? { ...s, ...patch } : s),
    }));
  }, []);

  const updatePane = useCallback((paneId: string, patch: Partial<Pane>) => {
    setPanes(prev => prev.map(p => p.id === paneId ? { ...p, ...patch } : p));
  }, []);

  // Removing a whole pane (also deselects its series)
  useCallback((paneId: string) => {
    setPanes(prev => {
      const pane = prev.find(p => p.id === paneId);
      if (pane) setSelectedIds(ids => ids.filter(id => !pane.series.some(s => s.id === id)));
      return prev.filter(p => p.id !== paneId);
    });
  }, []);

  // Auto-create panes for selected series (grouped by category)
  useEffect(() => {
    if (!seriesResult || selectedIds.length === 0 || (presetAppliedRef.current && panes.length > 0)) return;
    const catMap: Record<string, PaneSeries[]> = {};
    let colorIdx = 0;
    for (const sid of selectedIds) {
      const entry = seriesResult[sid];
      if (!entry?.data?.length || panes.some(p => p.series.some(s => s.id === sid))) continue;
      const cat = entry.meta.category || "Other";
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push({
        id: sid,
        label: entry.meta.label || sid,
        color: SERIES_COLORS[colorIdx % SERIES_COLORS.length],
        unit: entry.meta.unit || "",
        visible: true,
        lineWidth: 2,
        lineStyle: 0,
      });
      colorIdx++;
    }
    if (Object.keys(catMap).length === 0) return;
    const newPanes = Object.entries(catMap).map(([cat, series]) => ({
      id: `pane_${paneCounter++}`,
      label: cat,
      series,
      dataTransform: "raw" as const,
      zScoreWindow: 0,
    }));
    setPanes(prev => [...prev, ...newPanes]);
  }, [seriesResult, selectedIds]);

  // Group catalog by category
  const categorized = useMemo(() => {
    if (!catalog) return {};
    const map: Record<string, MacroSeriesMeta[]> = {};
    for (const s of catalog) {
      if (!map[s.category]) map[s.category] = [];
      map[s.category].push(s);
    }
    return map;
  }, [catalog]);

  // Toggle series selection from sidebar
  const toggleSeries = (id: string, meta?: MacroSeriesMeta) => {
    if (selectedIds.includes(id)) {
      setPanes(prev => prev.map(p => ({
        ...p,
        series: p.series.filter(s => s.id !== id),
      })).filter(p => p.series.length > 0));
      setSelectedIds(prev => prev.filter(s => s !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
      if (meta && seriesResult?.[id]) addSeriesToPanes(id, meta, targetPaneId !== "auto" ? targetPaneId : undefined);
    }
  };

  useEffect(() => {
    if (seriesResult) {
      for (const id of selectedIds) {
        const entry = seriesResult[id];
        if (!entry?.data?.length) continue;
        if (!panes.some(p => p.series.some(s => s.id === id))) {
          addSeriesToPanes(id, entry.meta, targetPaneId !== "auto" ? targetPaneId : undefined);
        }
      }
    }
  }, [seriesResult]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Apply preset
  const applyPreset = (ids: string[]) => {
    setPanes([]);
    setSelectedIds(ids);
    presetAppliedRef.current = false;
  };

  // CSV export
  const exportCSV = useCallback(() => {
    if (!seriesResult) return;
    const dateMap = new Map<string, Record<string, number>>();
    for (const sid of selectedIds) {
      const entry = seriesResult[sid];
      if (entry) {
        for (const d of entry.data) {
          const row = dateMap.get(d.time) || {};
          row[sid] = d.value;
          dateMap.set(d.time, row);
        }
      }
    }
    const rows = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const header = `Date,${selectedIds.join(",")}`;
    const lines = rows.map(([date, vals]) =>
      `${date},${selectedIds.map(id => vals[id]?.toString() ?? "").join(",")}`
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `macro_${selectedIds.join("_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [seriesResult, selectedIds]);

  // Category ordering
  const CATEGORY_ORDER = [
    "Rates", "Housing", "Labor", "Inflation", "Economy", "Commodities", "Markets",
    "Home Prices",
    "Regional Permits (Sunbelt)", "Regional Permits (Coastal)",
    "Regional Labor (Sunbelt)", "Regional Labor (Coastal)",
    "Regional Employment (Sunbelt)", "Regional Employment (Coastal)",
    "Regional Listing Prices",
  ];

  const visiblePanes = useMemo(() => maximizedPane ? panes.filter(p => p.id === maximizedPane) : panes, [panes, maximizedPane]);

  return (
    <div className="flex h-full bg-background" data-testid="macro-page">
      {/* Sidebar */}
      <div className="w-[240px] border-r border-border bg-card flex flex-col flex-shrink-0 overflow-y-auto">
        {/* Add-to controls */}
        <div className="px-3 py-2 border-b border-border space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] text-muted-foreground">Add to:</Label>
            <div className="flex gap-0.5 flex-1">
              <button
                className={`flex-1 text-[9px] font-semibold px-1.5 py-0.5 rounded ${addMode === "overlay" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-accent/50"}`}
                onClick={() => setAddMode("overlay")}
              >
                Overlay
              </button>
              <button
                className={`flex-1 text-[9px] font-semibold px-1.5 py-0.5 rounded ${addMode === "new" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-accent/50"}`}
                onClick={() => setAddMode("new")}
              >
                New Pane
              </button>
            </div>
          </div>
          {addMode === "overlay" && panes.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] text-muted-foreground">Target:</Label>
              <select
                className="flex-1 text-[10px] font-mono bg-background border border-border/50 rounded px-1 py-0.5 h-[20px]"
                value={targetPaneId}
                onChange={(e) => setTargetPaneId(e.target.value)}
              >
                <option value="auto">First Pane</option>
                {panes.map(p => (
                  <option key={p.id} value={p.id}>{p.label} ({p.series.length}s)</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Presets */}
        <div className="px-3 py-2 border-b border-border">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Quick Views</p>
          {["National", "Regional", "Home Prices"].map(group => {
            const groupPresets = PRESETS.filter(p => p.group === group);
            if (groupPresets.length === 0) return null;
            return (
              <div key={group} className="mb-1.5">
                <p className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-0.5">{group}</p>
                <div className="flex flex-wrap gap-1">
                  {groupPresets.map(p => (
                    <Button key={p.label} variant="ghost" size="sm"
                      className={`h-5 px-2 text-[10px] ${
                        p.ids.every(id => selectedIds.includes(id)) && p.ids.length === selectedIds.length
                          ? "bg-primary/20 text-primary"
                          : ""
                      }`}
                      onClick={() => applyPreset(p.ids)}>
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Series picker */}
        <div className="flex-1 overflow-y-auto">
          {CATEGORY_ORDER.filter(cat => categorized[cat]).map(cat => (
            <div key={cat}>
              <button
                className="flex items-center gap-1.5 w-full px-3 py-1.5 text-left hover:bg-accent/50"
                onClick={() => toggleCategory(cat)}
              >
                {collapsedCategories.has(cat) ? (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                )}
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {cat}
                </span>
                <span className="text-[9px] text-muted-foreground/60 ml-auto">
                  {categorized[cat].filter(s => selectedIds.includes(s.id)).length}/{categorized[cat].length}
                </span>
              </button>
              {!collapsedCategories.has(cat) && categorized[cat].map(s => {
                const selected = selectedIds.includes(s.id);
                const ownerPane = panes.find(p => p.series.some(ps => ps.id === s.id));
                return (
                  <label key={s.id}
                    className="flex items-center gap-2 px-3 py-0.5 cursor-pointer hover:bg-accent/30"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSeries(s.id, s)}
                      className="w-3 h-3 rounded border-border accent-primary"
                    />
                    {ownerPane && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: ownerPane.series.find(ps => ps.id === s.id)?.color }}
                      />
                    )}
                    <span className="text-[11px] text-foreground truncate flex-1">
                      {s.label}
                    </span>
                    <span className="text-[9px] text-muted-foreground/60 font-mono">{s.freq}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="px-3 py-2 border-t border-border space-y-2">
          <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}>
            <RefreshCw className={`w-3 h-3 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            {refreshMutation.isPending ? "Refreshing..." : "Refresh All Data"}
          </Button>
          <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5"
            onClick={exportCSV} disabled={selectedIds.length === 0}>
            <Download className="w-3 h-3" />
            CSV
          </Button>
        </div>
      </div>

      {/* Charts area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Crosshair bar */}
        {crosshairData && (
          <div className="flex items-center gap-3 px-4 py-1 border-b border-border/50 bg-card/30 flex-wrap flex-shrink-0">
            <span className="text-[10px] font-mono text-muted-foreground">{crosshairData.time}</span>
            {Object.entries(crosshairData.values).map(([key, val]) => (
              <span key={key} className="text-[10px] font-mono whitespace-nowrap">
                <span className="text-muted-foreground">{key}: </span>
                <span className="text-foreground font-semibold">{typeof val === "number" ? val.toFixed(4) : val}</span>
              </span>
            ))}
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center gap-2 px-4 py-1 border-b border-border/50 bg-card/30 flex-shrink-0">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            {selectedIds.length} series · {panes.length} pane{panes.length !== 1 ? "s" : ""}
            {refreshMutation.data && (
              <> · Last refresh: {new Date(refreshMutation.data.timestamp).toLocaleString()}</>
            )}
          </span>
          <span className="text-[10px] text-muted-foreground/60">· Source: FRED (St. Louis Fed)</span>
          <div className="flex-1" />
          <GridLayoutPicker
            value={macroGridLayout}
            onChange={setMacroGridLayout}
            testId="macro-grid-picker"
          />

          {/* Chart type toggle: line vs line-scatter */}
          <div className="flex gap-0.5 border border-border/50 rounded p-0.5">
            <Button
              variant={macroChartType === "line" ? "default" : "ghost"}
              size="sm"
              className="h-5 px-1.5 text-[9px]"
              onClick={() => setMacroChartType("line")}
              title="Line chart"
              data-testid="macro-chart-line"
            >
              Line
            </Button>
            <Button
              variant={macroChartType === "line-scatter" ? "default" : "ghost"}
              size="sm"
              className="h-5 px-1.5 text-[9px] gap-0.5"
              onClick={() => setMacroChartType("line-scatter")}
              title="Scatter chart"
              data-testid="macro-chart-scatter"
            >
              <Circle className="w-2.5 h-2.5" />
              Scatter
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => {
              const id = `pane_${paneCounter++}`;
              setPanes(prev => [...prev, {
                id,
                label: `Pane ${panes.length + 1}`,
                series: [],
                dataTransform: "raw",
                zScoreWindow: 0,
              }]);
            }}
            data-testid="add-macro-pane"
            title="Add empty pane"
          >
            <TrendingUp className="w-3 h-3" />
            Pane
          </Button>

          <Button
            variant={showIndicators ? "default" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => setShowIndicators(!showIndicators)}
            data-testid="toggle-indicators"
          >
            <TrendingUp className="w-3 h-3" />
            Indicators
          </Button>
        </div>

        {/* Charts + optional Indicators panel */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Chart area */}
          {(() => {
            const containerStyle = maximizedPane !== null
              ? { display: "grid" as const, gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }
              : gridContainerStyle(macroGridLayout, visiblePanes.length);
            return (
              <div
                className="flex-1 min-h-0 overflow-hidden"
                style={containerStyle}
              >
                {seriesLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Loading macro data from FRED...
                  </div>
                ) : visiblePanes.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Select series from the sidebar or choose a preset
                  </div>
                ) : (
                  visiblePanes.map(p => (
                    <MacroPane
                      key={p.id}
                      pane={p}
                      allData={seriesResult || {}}
                      height={0}
                      isMaximized={maximizedPane === p.id}
                      onMaximize={setMaximizedPane}
                      useFlexHeight={true}
                      onRegisterChart={registerChart}
                      onUnregisterChart={unregisterChart}
                      onRegisterSeries={registerSeries}
                      onCrosshairMove={handleCrosshairMove}
                      activeIndicators={indicatorsMap[p.id] || {}}
                      chartType={macroChartType}
                      onUpdatePane={updatePane}
                      onRemoveSeriesFromPane={removeSeriesFromPane}
                      onToggleSeriesVisibility={toggleSeriesVisibility}
                      onUpdateSeriesStyle={updateSeriesStyle}
                    />
                  ))
                )}
              </div>
            );
          })()}

          {/* Indicators panel (right side) */}
          {showIndicators && (() => {
            const chartIdToNum = new Map(panes.map((p, i) => [p.id, i]));
            const numToChartId = new Map(panes.map((p, i) => [i, p.id]));
            const panelPanes = panes.map((p, i) => ({ id: i, label: p.label }));
            const activeNumId = indicatorPaneId ? (chartIdToNum.get(indicatorPaneId) ?? 0) : 0;
            const numIndicatorsMap: Record<number, ActiveIndicators> = {};
            for (const [cid, ind] of Object.entries(indicatorsMap)) {
              const num = chartIdToNum.get(cid);
              if (num !== undefined) numIndicatorsMap[num] = ind;
            }
            return (
              <IndicatorsPanel
                panes={panelPanes}
                indicatorsMap={numIndicatorsMap}
                activePaneId={activeNumId}
                onSelectPane={(numId) => {
                  const cid = numToChartId.get(numId);
                  if (cid) setIndicatorPaneId(cid);
                }}
                onChangeIndicators={(numId, indicators) => {
                  const cid = numToChartId.get(numId);
                  if (cid) setIndicatorsMap(prev => ({ ...prev, [cid]: indicators }));
                }}
                onClose={() => setShowIndicators(false)}
              />
            );
          })()}
        </div>
      </div>
    </div>
  );
}
