// Shared value-series ("band") indicator renderer — extracted verbatim from
// the Macro pane so single-chart hosts without true sub-panes (Macro, the
// Levels page) render the SAME indicator set the canonical IndicatorsPanel
// configures: all 12 MA types (per-line freq), RSI/MACD/ROC/Stochastic/ATR/
// OBV bands (per-instance freq + hidden-group skip), Bollinger, Mean ± Std
// (bandOpacity/shade), the full registry loop (renderOverlay/renderPane via
// a band facade), and indicator-on-indicator overlays. Sub-pane indicators
// draw into bottom price-scale BANDS on the same chart. Every created series
// is passed to `register` so the host can dispose them on re-render.
import { LineSeries, LineStyle } from "lightweight-charts";
import type { IChartApi, ISeriesApi, Time, LineWidth } from "lightweight-charts";
import type { ActiveIndicators, MaLine, MaKey } from "@/components/ChartPane";
import { getMaLines, PANE_OVERLAY_TYPES, subChartSourceLabel } from "@/components/ChartPane";
import { computeMaByType, type MaType } from "@/lib/maEngine";
import { ALL_REGISTRY_INDICATORS, resolveParams, resampleIndicatorBars } from "@/lib/indicatorRegistry";
import { getInstances, effGroup, subChartKeyFor, type IndicatorInstance } from "@/lib/indicatorInstances";
import { INDICATOR_COLORS } from "@/lib/chartColors";
import { IchimokuCloudPrimitive, type CloudPoint } from "@/lib/ichimokuCloudPrimitive";
import type { OhlcBar } from "@/lib/indicators";
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
  computeATR,
  computeOBV,
  rollingAutocorrOfSeries,
} from "@/lib/indicators";

export function renderBandIndicators(
  chart: IChartApi,
  primaryData: { time: string; value: number }[],
  activeIndicators: ActiveIndicators,
  register: (s: ISeriesApi<any>) => void,
): void {
  if (!primaryData || primaryData.length === 0) return;
  {
      // Moving averages — full Charts parity: all 12 MA types, one line per
      // instance, each honoring its own compute frequency (so the same period
      // can appear at multiple frequencies, e.g. SMA 200 daily AND 200 weekly).
      const maFreqSrcCache: Partial<Record<"weekly" | "monthly", typeof primaryData>> = {};
      const maSourceFor = (freq: MaLine["f"]): { src: typeof primaryData; suffix: string } => {
        if (freq !== "weekly" && freq !== "monthly") return { src: primaryData, suffix: "" };
        if (!maFreqSrcCache[freq]) {
          maFreqSrcCache[freq] = resampleIndicatorBars(
            primaryData.map((d) => ({ time: String(d.time), open: d.value, high: d.value, low: d.value, close: d.value })),
            freq,
          ).map((b) => ({ time: b.time as unknown as Time, value: b.close })) as typeof primaryData;
        }
        return { src: maFreqSrcCache[freq]!, suffix: freq === "weekly" ? "W" : "M" };
      };
      // Panel-chip hide/solo support: bands whose instance-group key is in
      // hiddenSubCharts simply don't render (Macro has no true sub-panes to
      // unmount — skipping the band is the equivalent).
      const hiddenSet = new Set(activeIndicators.hiddenSubCharts ?? []);
      const groupHidden = (baseId: string, inst: IndicatorInstance) =>
        hiddenSet.has(subChartKeyFor(baseId, effGroup(inst)));
      // Sub-band value registry for indicator-on-indicator overlays: each
      // sub-band records its primary line (first instance of a group wins,
      // Charts parity) plus the price-scale band it draws on, keyed by the
      // same sub-chart key the panel's Indicator Overlays section uses.
      const subValues = new Map<string, { data: { time: Time; value: number }[]; scaleId: string }>();
      const captureSub = (baseId: string, inst: IndicatorInstance, scaleId: string, data: { time: Time; value: number }[]) => {
        const sk = subChartKeyFor(baseId, effGroup(inst));
        if (!subValues.has(sk)) subValues.set(sk, { data, scaleId });
      };
      const instNum = (inst: IndicatorInstance, key: string, dflt: number): number => {
        const v = inst.params[key];
        const nv = Array.isArray(v) ? v[0] : v;
        return typeof nv === "number" && Number.isFinite(nv) ? nv : dflt;
      };
      const CORE_MA: Array<[MaKey, string, (d: typeof primaryData, p: number) => { time: unknown; value: number }[]]> = [
        ["sma", "SMA", computeSMA],
        ["ema", "EMA", computeEMA],
        ["hma", "HMA", computeHMA],
      ];
      for (const [key, name, compute] of CORE_MA) {
        for (const { p, f } of getMaLines(activeIndicators, key)) {
          const { src, suffix } = maSourceFor(f);
          const maData = compute(src, p);
          if (maData.length > 0) {
            const s = chart.addSeries(LineSeries, {
              color: (INDICATOR_COLORS as Record<string, string>)[key],
              lineWidth: key === "hma" ? 2 : 1,
              title: `${name} ${p}${suffix}`,
              ...(key === "sma" ? { lineStyle: LineStyle.Dashed } : {}),
              priceLineVisible: false,
              lastValueVisible: false,
            });
            s.setData(maData.map((d) => ({ time: d.time as Time, value: d.value })));
            register(s);
          }
        }
      }
      const EXTRA_MA: Array<[MaKey, MaType, number]> = [
        ["wma", "WMA", 1], ["dema", "DEMA", 2], ["tema", "TEMA", 2],
        ["kama", "KAMA", 2], ["frama", "FRAMA", 2], ["t3", "T3", 2],
        ["alma", "ALMA", 1], ["lsma", "LSMA", 1], ["slsma", "SLSMA", 2],
      ];
      for (const [field, maType, width] of EXTRA_MA) {
        for (const { p, f } of getMaLines(activeIndicators, field)) {
          const { src, suffix } = maSourceFor(f);
          const srcVals = src.map((d) => d.value);
          const series = computeMaByType(srcVals, p, maType);
          const maData: { time: Time; value: number }[] = [];
          for (let i = 0; i < src.length; i++) {
            const v = series[i];
            if (v != null && Number.isFinite(v)) maData.push({ time: src[i].time as Time, value: v });
          }
          if (maData.length > 0) {
            const s = chart.addSeries(LineSeries, {
              color: (INDICATOR_COLORS as Record<string, string>)[field] ?? "#94a3b8",
              lineWidth: width as LineWidth,
              title: `${maType} ${p}${suffix}`,
              priceLineVisible: false,
              lastValueVisible: false,
            });
            s.setData(maData);
            register(s);
          }
        }
      }

      // RSI band — one line per INSTANCE (own period + compute frequency, so
      // RSI 14 daily + RSI 14 weekly draw together; hidden groups skipped)
      let rsiRefsDrawn = false;
      for (const inst of getInstances(activeIndicators, "rsi")) {
        if (groupHidden("rsi", inst)) continue;
        const p = instNum(inst, "period", 14);
        const { src: rsiSrc, suffix: rsiSfx } = maSourceFor(inst.freq);
        const rsiData = computeRSI(rsiSrc, p);
        if (rsiData.length > 0) {
          const rsiLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.rsi_line,
            lineWidth: 1,
            title: `RSI ${p}${rsiSfx}`,
            priceScaleId: "rsi",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          rsiLine.setData(rsiData.map(d => ({ time: d.time as Time, value: d.value })));
          register(rsiLine);
          captureSub("rsi", inst, "rsi", rsiData.map(d => ({ time: d.time as Time, value: d.value })));

          const first = rsiData[0].time as Time;
          const last = rsiData[rsiData.length - 1].time as Time;
          for (const [level, color] of (rsiRefsDrawn ? [] : [
            [70, INDICATOR_COLORS.rsi_overbought],
            [30, INDICATOR_COLORS.rsi_oversold],
          ]) as [number, string][]) {
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
            register(ref);
          }
          rsiLine.priceScale().applyOptions({
            scaleMargins: { top: 0.75, bottom: 0 },
          });
          rsiRefsDrawn = true;
        }
      }

      // MACD band — one line pair per instance (own params + freq)
      for (const inst of getInstances(activeIndicators, "macd")) {
        if (groupHidden("macd", inst)) continue;
        const { src: macdSrc, suffix: macdSfx } = maSourceFor(inst.freq);
        const macd = computeMACD(macdSrc, instNum(inst, "fast", 12), instNum(inst, "slow", 26), instNum(inst, "signal", 9));
        if (macd.macdLine.length > 0) {
          const ml = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.macd_line,
            lineWidth: 1,
            title: macdSfx ? `MACD ${macdSfx}` : "MACD",
            priceScaleId: "macd",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          ml.setData(macd.macdLine.map(d => ({ time: d.time as Time, value: d.value })));
          register(ml);
          captureSub("macd", inst, "macd", macd.macdLine.map(d => ({ time: d.time as Time, value: d.value })));

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
          register(sl);

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
            register(zl);
          }

          ml.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        }
      }

      // Mean ± Std Bands — band-line colors derive from the mean color at the
      // panel's chosen opacity, with optional envelope shading (Charts parity;
      // the opacity/shade controls were previously inert on Macro).
      if (activeIndicators.mean) {
        const { rolling, period } = activeIndicators.mean;
        const bandOp = activeIndicators.mean.bandOpacity ?? 0.8;
        const meanShade = activeIndicators.mean.shade !== false;
        const meanRgb = (() => {
          const m = /^#([0-9a-f]{6})$/i.exec(INDICATOR_COLORS.mean ?? "");
          if (!m) return "99, 102, 241";
          const v = parseInt(m[1], 16);
          return `${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}`;
        })();
        const bandColor = (mult: number) =>
          `rgba(${meanRgb}, ${(Math.abs(mult) === 1 ? bandOp : bandOp * 0.65).toFixed(2)})`;
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
            register(ml);

            for (const b of rb.bands) {
              const bs = chart.addSeries(LineSeries, {
                color: bandColor(b.mult),
                lineWidth: (Math.abs(b.mult) === 1 ? 2 : 1) as LineWidth,
                title: `${b.mult > 0 ? "+" : ""}${b.mult}σ`,
                lineStyle: LineStyle.Dotted,
                priceLineVisible: false,
                lastValueVisible: false,
              });
              bs.setData(b.data.map(d => ({ time: d.time as Time, value: d.value })));
              register(bs);
            }
            if (meanShade) {
              const band = (mult: number) => rb.bands.find((b) => b.mult === mult)?.data as unknown as CloudPoint[] | undefined;
              const fills = (alpha: number) => {
                const c = `rgba(${meanRgb}, ${alpha.toFixed(3)})`;
                return { up: c, down: c };
              };
              const outerA = band(2), outerB = band(-2), innerA = band(1), innerB = band(-1);
              try {
                if (outerA?.length && outerB?.length) {
                  (ml as unknown as { attachPrimitive: (p: unknown) => void })
                    .attachPrimitive(new IchimokuCloudPrimitive(outerA, outerB, fills(0.07 * bandOp)));
                }
                if (innerA?.length && innerB?.length) {
                  (ml as unknown as { attachPrimitive: (p: unknown) => void })
                    .attachPrimitive(new IchimokuCloudPrimitive(innerA, innerB, fills(0.1 * bandOp)));
                }
              } catch {}
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
            register(meanLine);

            for (const mult of [1, -1, 2, -2]) {
              const band = chart.addSeries(LineSeries, {
                color: bandColor(mult),
                lineWidth: (Math.abs(mult) === 1 ? 2 : 1) as LineWidth,
                title: `${mult > 0 ? "+" : ""}${mult}σ`,
                lineStyle: LineStyle.Dotted,
                priceLineVisible: false,
                lastValueVisible: false,
              });
              band.setData([
                { time: first, value: stats.mean + mult * stats.std },
                { time: last, value: stats.mean + mult * stats.std },
              ]);
              register(band);
            }
          }
        }
      }

      // Bollinger Bands — one band set per instance (own period/sigma + freq)
      for (const inst of getInstances(activeIndicators, "bollinger")) {
        const period = instNum(inst, "period", 20);
        const mult = instNum(inst, "mult", 2);
        const { src: bbSrc } = maSourceFor(inst.freq);
        const bb = computeBollingerBands(bbSrc, period, mult);
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
          register(ml);

          const upper = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.bollinger_band,
            lineWidth: 1,
            title: `BB +${mult}σ`,
            lineStyle: LineStyle.Dotted,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          upper.setData(bb.upper.map(d => ({ time: d.time as Time, value: d.value })));
          register(upper);

          const lower = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.bollinger_band,
            lineWidth: 1,
            title: `BB -${mult}σ`,
            lineStyle: LineStyle.Dotted,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          lower.setData(bb.lower.map(d => ({ time: d.time as Time, value: d.value })));
          register(lower);
        }
      }

      // ROC band — one line per instance (own period + freq; hidden skipped)
      for (const inst of getInstances(activeIndicators, "roc")) {
        if (groupHidden("roc", inst)) continue;
        const p = instNum(inst, "period", 12);
        const { src: rocSrc, suffix: rocSfx } = maSourceFor(inst.freq);
        const rocData = computeROC(rocSrc, p);
        if (rocData.length > 0) {
          const rocLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.roc,
            lineWidth: 1,
            title: `ROC ${p}${rocSfx}`,
            priceScaleId: "roc",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          rocLine.setData(rocData.map(d => ({ time: d.time as Time, value: d.value })));
          register(rocLine);
          captureSub("roc", inst, "roc", rocData.map(d => ({ time: d.time as Time, value: d.value })));

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
            register(zl);
          }
          rocLine.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        }
      }

      // Stochastic band — one %K/%D pair per instance (hidden groups skipped)
      for (const inst of getInstances(activeIndicators, "stochastic")) {
        if (groupHidden("stochastic", inst)) continue;
        const kPeriod = instNum(inst, "kPeriod", 14);
        const dPeriod = instNum(inst, "dPeriod", 3);
        const { src: stochSrc, suffix: stochSfx } = maSourceFor(inst.freq);
        const stoch = computeStochastic(stochSrc, kPeriod, dPeriod);
        if (stoch.k.length > 0) {
          const kLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.stoch_k,
            lineWidth: 1,
            title: `%K ${kPeriod}${stochSfx}`,
            priceScaleId: "stoch",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          kLine.setData(stoch.k.map(d => ({ time: d.time as Time, value: d.value })));
          register(kLine);
          captureSub("stochastic", inst, "stoch", stoch.k.map(d => ({ time: d.time as Time, value: d.value })));

          const dLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.stoch_d,
            lineWidth: 1,
            title: `%D ${dPeriod}`,
            priceScaleId: "stoch",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          dLine.setData(stoch.d.map(d => ({ time: d.time as Time, value: d.value })));
          register(dLine);

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
              register(ref);
            }
          }
          kLine.priceScale().applyOptions({
            scaleMargins: { top: 0.75, bottom: 0 },
          });
        }
      }

      // ATR band — close-only true-range approximation (|Δvalue|), one line
      // per instance; previously the panel's ATR toggle was inert on Macro.
      for (const inst of getInstances(activeIndicators, "atr")) {
        if (groupHidden("atr", inst)) continue;
        const p = instNum(inst, "period", 14);
        const { src: atrSrc, suffix: atrSfx } = maSourceFor(inst.freq);
        const atrData = computeATR(atrSrc as { time: string; value: number }[], p);
        if (atrData.length > 0) {
          const atrLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.atr,
            lineWidth: 1,
            title: `ATR ${p}${atrSfx}`,
            priceScaleId: "atr",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          atrLine.setData(atrData.map(d => ({ time: d.time as Time, value: d.value })));
          register(atrLine);
          captureSub("atr", inst, "atr", atrData.map(d => ({ time: d.time as Time, value: d.value })));
          atrLine.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        }
      }

      // OBV band — unit-volume direction accumulation (no volume on FRED
      // series, same convention as the Pairs charts).
      for (const inst of getInstances(activeIndicators, "obv")) {
        if (groupHidden("obv", inst)) continue;
        const { src: obvSrc, suffix: obvSfx } = maSourceFor(inst.freq);
        const obvData = computeOBV(obvSrc as { time: string; value: number }[]);
        if (obvData.length > 0) {
          const obvLine = chart.addSeries(LineSeries, {
            color: INDICATOR_COLORS.obv,
            lineWidth: 1,
            title: obvSfx ? `OBV ${obvSfx}` : "OBV",
            priceScaleId: "obv",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          obvLine.setData(obvData.map(d => ({ time: d.time as Time, value: d.value })));
          register(obvLine);
          captureSub("obv", inst, "obv", obvData.map(d => ({ time: d.time as Time, value: d.value })));
          obvLine.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        }
      }

      // ── Registry-driven indicators (same list as the Charts tab panel) ──
      // Overlays draw on the primary scale; sub-pane types draw into their own
      // bottom scale band like RSI/MACD above (Macro has no true sub-panes).
      // Bars are synthesized flat (o=h=l=c) from the primary line series.
      // One render per INSTANCE (own params + freq + hiddenParts — see
      // lib/indicatorInstances); pane instances band per GROUP so merged
      // instances share one bottom band.
      if (ALL_REGISTRY_INDICATORS.some((d) => getInstances(activeIndicators, d.id).length > 0)) {
        const bars: OhlcBar[] = primaryData.map((d) => ({
          time: d.time, open: d.value, high: d.value, low: d.value, close: d.value,
        }));
        const freqBarsCache: Partial<Record<"weekly" | "monthly", OhlcBar[]>> = {};
        const barsAt = (freq?: string): OhlcBar[] =>
          freq === "weekly" || freq === "monthly"
            ? (freqBarsCache[freq] ??= resampleIndicatorBars(bars, freq))
            : bars;
        for (const def of ALL_REGISTRY_INDICATORS) {
          const insts = getInstances(activeIndicators, def.id);
          for (const inst of insts) {
            // Panel-chip hide/solo: skip hidden pane groups (band equivalent).
            if (def.renderTarget === "pane" && groupHidden(def.id, inst)) continue;
            const defBars = barsAt(inst.freq);
            const p = resolveParams(def, { enabled: true, params: inst.params });
            const register = (s: ISeriesApi<any>) => { register(s); };
            try {
              if (def.renderTarget === "overlay" && def.renderOverlay) {
                def.renderOverlay(
                  { chart, colors: INDICATOR_COLORS as unknown as Record<string, string>, baseLabel: "", register,
                    ...(def.components?.length ? { hiddenParts: new Set(inst.hiddenParts ?? []) } : {}) },
                  defBars, p,
                );
              } else if (def.renderPane) {
                const scaleId = `reg_${def.id}_${effGroup(inst)}`;
                let anchor: ISeriesApi<any> | null = null;
                // Facade that forces every series the indicator adds onto its own
                // bottom-band price scale.
                const paneChart = {
                  addSeries: (kind: any, opts: any) => {
                    const s = chart.addSeries(kind, {
                      ...opts, priceScaleId: scaleId, priceLineVisible: false, lastValueVisible: false,
                    });
                    if (!anchor) anchor = s;
                    return s;
                  },
                } as unknown as IChartApi;
                def.renderPane(
                  {
                    chart: paneChart,
                    colors: INDICATOR_COLORS as unknown as Record<string, string>,
                    baseLabel: "",
                    register,
                    refLine: (level, color, first, last) => {
                      const rl = chart.addSeries(LineSeries, {
                        color, lineWidth: 1, lineStyle: LineStyle.Dotted, title: "",
                        priceScaleId: scaleId, crosshairMarkerVisible: false,
                        priceLineVisible: false, lastValueVisible: false,
                      });
                      rl.setData([{ time: first as Time, value: level }, { time: last as Time, value: level }]);
                      register(rl);
                    },
                  },
                  defBars, p,
                );
                if (anchor) {
                  (anchor as ISeriesApi<any>).priceScale().applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
                  // Register the band's primary line for indicator-on-indicator overlays.
                  try {
                    const aData = ((anchor as ISeriesApi<any>).data() as { time: Time; value?: number; close?: number }[])
                      .map((d) => ({ time: d.time, value: (typeof d.value === "number" ? d.value : d.close) as number }))
                      .filter((d) => typeof d.value === "number" && Number.isFinite(d.value));
                    captureSub(def.id, inst, scaleId, aData);
                  } catch {}
                }
              }
            } catch { /* one bad indicator must not kill the pane */ }
          }
        }
      }

      // ── Indicator-on-indicator overlays (panel "Indicator Overlays") ──
      // Same-domain types (MA/Bollinger/Mean-band/Stochastic of a sub-band)
      // draw INTO the source band; MACD/RSI/ROC/Autocorr of a source get
      // their own bottom band — Charts parity adapted to Macro's scale-band
      // model. Previously this section was a total no-op on Macro.
      const paneOverlays = activeIndicators.indicatorOverlays ?? [];
      if (paneOverlays.length > 0 && subValues.size > 0) {
        const OVERLAY_PALETTE = ["#38bdf8", "#f472b6", "#facc15", "#4ade80", "#c084fc", "#fb923c"];
        paneOverlays.forEach((o, oi) => {
          const srcEntry = subValues.get(o.source);
          if (!srcEntry) return;
          const srcData = srcEntry.data.filter((d) => Number.isFinite(d.value));
          if (srcData.length <= 5) return;
          const color = OVERLAY_PALETTE[oi % OVERLAY_PALETTE.length];
          const srcLabel = subChartSourceLabel(o.source);
          const addL = (
            lineData: { time: Time; value: number }[] | undefined,
            lineTitle: string,
            opts: Record<string, unknown> = {},
          ): ISeriesApi<"Line"> | null => {
            if (!lineData?.length) return null;
            const s = chart.addSeries(LineSeries, {
              color, lineWidth: 1, title: lineTitle,
              priceLineVisible: false, lastValueVisible: false,
              ...opts,
            });
            s.setData(lineData.map((d) => ({ time: d.time as Time, value: d.value })));
            register(s);
            return s;
          };
          try {
            if (PANE_OVERLAY_TYPES.has(o.type)) {
              // Own bottom band, like the built-in sub-bands.
              const scaleId = `ovl_${o.id}`;
              let anchor: ISeriesApi<"Line"> | null = null;
              const addB = (lineData: { time: Time; value: number }[] | undefined, lineTitle: string, extra: Record<string, unknown> = {}) => {
                const s = addL(lineData, lineTitle, { priceScaleId: scaleId, ...extra });
                if (s && !anchor) anchor = s;
                return s;
              };
              const refSpan = (lineData: { time: Time; value: number }[], lvl: number, c = "rgba(255,255,255,0.15)") => {
                if (lineData.length >= 2) {
                  addB(
                    [{ time: lineData[0].time, value: lvl }, { time: lineData[lineData.length - 1].time, value: lvl }],
                    "",
                    { color: c, lineStyle: LineStyle.Dotted, crosshairMarkerVisible: false },
                  );
                }
              };
              if (o.type === "macd") {
                const mc = computeMACD(srcData as { time: string; value: number }[], o.period, o.slow ?? 26, o.signal ?? 9);
                addB(mc.macdLine as { time: Time; value: number }[], `MACD on ${srcLabel}`);
                addB(mc.signalLine as { time: Time; value: number }[], "", { color: INDICATOR_COLORS.macd_signal, crosshairMarkerVisible: false });
                refSpan(mc.macdLine as { time: Time; value: number }[], 0);
              } else if (o.type === "rsi") {
                const rs = computeRSI(srcData as { time: string; value: number }[], o.period) as { time: Time; value: number }[];
                addB(rs, `RSI${o.period} on ${srcLabel}`);
                refSpan(rs, 70, INDICATOR_COLORS.rsi_overbought);
                refSpan(rs, 30, INDICATOR_COLORS.rsi_oversold);
              } else if (o.type === "roc") {
                const rc = computeROC(srcData as { time: string; value: number }[], o.period) as { time: Time; value: number }[];
                addB(rc, `ROC${o.period} on ${srcLabel}`);
                refSpan(rc, 0);
              } else if (o.type === "autocorr") {
                const lag = Math.max(1, o.lag ?? 1);
                const ac = rollingAutocorrOfSeries(srcData as { time: string; value: number }[], lag, o.period) as { time: Time; value: number }[];
                addB(ac, `AC(lag ${lag}, w${o.period}) on ${srcLabel}`);
                const th = 1.96 / Math.sqrt(Math.max(1, o.period - lag));
                refSpan(ac, 0);
                refSpan(ac, th);
                refSpan(ac, -th);
              }
              if (anchor) {
                (anchor as ISeriesApi<"Line">).priceScale().applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
              }
            } else {
              // Same-domain overlay — draw into the source's band.
              const opts = { priceScaleId: srcEntry.scaleId };
              if (o.type === "bollinger") {
                const bb = computeBollingerBands(srcData as { time: string; value: number }[], o.period, o.mult ?? 2);
                addL(bb.basis as { time: Time; value: number }[], `BB${o.period} on ${srcLabel}`, opts);
                addL(bb.upper as { time: Time; value: number }[], "", { ...opts, lineStyle: LineStyle.Dotted, crosshairMarkerVisible: false });
                addL(bb.lower as { time: Time; value: number }[], "", { ...opts, lineStyle: LineStyle.Dotted, crosshairMarkerVisible: false });
              } else if (o.type === "meanband") {
                const rb = computeRollingMeanBands(srcData as { time: string; value: number }[], o.period);
                addL(rb.mean as { time: Time; value: number }[], `Mean${o.period} on ${srcLabel}`, { ...opts, lineStyle: LineStyle.LargeDashed });
                const maxMult = o.mult ?? 2;
                for (const b of rb.bands) {
                  if (Math.abs(b.mult) <= maxMult) addL(b.data as { time: Time; value: number }[], "", { ...opts, lineStyle: LineStyle.Dotted, crosshairMarkerVisible: false });
                }
              } else if (o.type === "stochastic") {
                const so = computeStochastic(srcData as { time: string; value: number }[], o.period, o.d ?? 3);
                addL(so.k as { time: Time; value: number }[], `Stoch${o.period} on ${srcLabel}`, opts);
                addL(so.d as { time: Time; value: number }[], "", { ...opts, lineStyle: LineStyle.Dotted, crosshairMarkerVisible: false });
              } else {
                const vals = srcData.map((d) => d.value);
                const ma = computeMaByType(vals, o.period, o.type.toUpperCase() as MaType);
                const maData = srcData
                  .map((d, i) => ({ time: d.time, value: ma[i] as number }))
                  .filter((d) => typeof d.value === "number" && Number.isFinite(d.value));
                addL(maData, `${o.type.toUpperCase()}${o.period} on ${srcLabel}`, opts);
              }
            }
          } catch { /* one bad overlay must not kill the pane */ }
        });
      }
  }
}
