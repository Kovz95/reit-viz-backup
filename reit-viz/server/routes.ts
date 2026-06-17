import type { Express } from "express";
import type { Server } from "http";
import express from "express";
import fs from "fs";
import path from "path";
import { execSync, exec, spawn } from "child_process";
import { storage } from "./storage";
import multer from "multer";
import * as XLSX from "xlsx";
import { registerChatRoute } from "./chatRoute";
import { computeRvVerdictBatch } from "./rvVerdict";
import { fetchYahooPrices, clearCache } from "./yahooPrices";
import { engleGranger } from "./cointegration";

const DATA_DIR = path.join(process.cwd(), "data");

function readJSON(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// Cache dates in memory
let datesCache: string[] | null = null;
function getDates(): string[] {
  if (!datesCache) {
    datesCache = readJSON(path.join(DATA_DIR, "dates.json"));
  }
  return datesCache!;
}

export async function registerRoutes(server: Server, app: Express) {
  // Chat assistant route
  registerChatRoute(app);

  // Serve data/macro/ directory as static files (needed for macro JSON in dev mode)
  // NOTE: Only serve macro subdir — ticker data in data/ uses flat arrays,
  // but dist/public/data/tickers/ uses encoded tuples that the client expects.
  // We prefer dist/public/data/macro (where prefetch-macro.cjs and the daily
  // cron write fresh data); fall back to DATA_DIR/macro for older deployments.
  const DIST_MACRO_DIR = path.join(process.cwd(), "dist", "public", "data", "macro");
  if (fs.existsSync(DIST_MACRO_DIR)) {
    app.use("/data/macro", express.static(DIST_MACRO_DIR));
  }
  app.use("/data/macro", express.static(path.join(DATA_DIR, "macro")));

  // Get all tickers metadata
  app.get("/api/tickers", (_req, res) => {
    try {
      const tickers = readJSON(path.join(DATA_DIR, "tickers.json"));
      res.json(tickers);
    } catch (e) {
      res.status(500).json({ error: "Failed to load tickers" });
    }
  });

  // Get dates array
  app.get("/api/dates", (_req, res) => {
    try {
      res.json(getDates());
    } catch (e) {
      res.status(500).json({ error: "Failed to load dates" });
    }
  });

  // Get data for a specific ticker
  app.get("/api/ticker/:symbol", (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const filePath = path.join(DATA_DIR, "tickers", `${symbol}.json`);
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Ticker ${symbol} not found` });
      }
      const rawData = readJSON(filePath);
      const dates = getDates();
      
      // Decode run-length nulls and return full arrays
      const decoded: Record<string, (number | null)[]> = {};
      for (const [metric, encoded] of Object.entries(rawData)) {
        const arr: (number | null)[] = [];
        for (const item of encoded as (number | string)[]) {
          if (typeof item === "string" && item.startsWith("~")) {
            const count = parseInt(item.slice(1));
            for (let i = 0; i < count; i++) arr.push(null);
          } else {
            arr.push(item as number);
          }
        }
        decoded[metric] = arr;
      }
      
      res.json({ dates, metrics: decoded });
    } catch (e) {
      res.status(500).json({ error: `Failed to load ${symbol}` });
    }
  });

  // Get OHLC candle data for a ticker (optimized endpoint)
  app.get("/api/ticker/:symbol/ohlc", (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const filePath = path.join(DATA_DIR, "tickers", `${symbol}.json`);
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Ticker ${symbol} not found` });
      }
      const rawData = readJSON(filePath);
      const dates = getDates();
      
      const decodeMetric = (encoded: (number | string)[]): (number | null)[] => {
        const arr: (number | null)[] = [];
        for (const item of encoded) {
          if (typeof item === "string" && item.startsWith("~")) {
            const count = parseInt(item.slice(1));
            for (let i = 0; i < count; i++) arr.push(null);
          } else {
            arr.push(item as number);
          }
        }
        return arr;
      };
      
      const open = rawData.open ? decodeMetric(rawData.open) : [];
      const high = rawData.high ? decodeMetric(rawData.high) : [];
      const low = rawData.low ? decodeMetric(rawData.low) : [];
      const close = rawData.close ? decodeMetric(rawData.close) : [];
      
      // Build OHLC array
      const ohlc = [];
      for (let i = 0; i < dates.length; i++) {
        if (close[i] != null) {
          ohlc.push({
            time: dates[i],
            open: open[i] ?? close[i],
            high: high[i] ?? close[i],
            low: low[i] ?? close[i],
            close: close[i],
          });
        }
      }
      
      res.json(ohlc);
    } catch (e) {
      res.status(500).json({ error: `Failed to load OHLC for ${symbol}` });
    }
  });

  // Get a specific metric for a ticker (metric name is URL-encoded)
  app.get("/api/ticker/:symbol/metric/:metric", (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const metric = req.params.metric;
    const filePath = path.join(DATA_DIR, "tickers", `${symbol}.json`);
    try {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Ticker ${symbol} not found` });
      }
      const rawData = readJSON(filePath);
      const dates = getDates();
      
      if (!rawData[metric]) {
        return res.status(404).json({ error: `Metric ${metric} not found for ${symbol}` });
      }
      
      const encoded = rawData[metric] as (number | string)[];
      const data: { time: string; value: number }[] = [];
      let idx = 0;
      
      for (const item of encoded) {
        if (typeof item === "string" && item.startsWith("~")) {
          idx += parseInt(item.slice(1));
        } else {
          if (idx < dates.length) {
            data.push({ time: dates[idx], value: item as number });
          }
          idx++;
        }
      }
      
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: `Failed to load metric` });
    }
  });

  // ── Batch metric values for all tickers (scatter, ranking, heatmap, etc.) ──
  // Instead of loading full ticker files client-side, extract just the needed values server-side.
  // POST body: { metrics: ["P/FFO FY2", "Dividend Yield"], dateIdx: 4096, avgDays?: 5 }
  // Returns: { data: { ADC: { "P/FFO FY2": 15.2, "Dividend Yield": 4.5 }, ... } }
  app.post("/api/batch-metrics", (req, res) => {
    try {
      const { metrics, dateIdx, avgDays } = req.body as {
        metrics: string[];
        dateIdx: number;
        avgDays?: number;
      };
      if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
        return res.status(400).json({ error: "metrics array required" });
      }
      if (typeof dateIdx !== "number" || dateIdx < 0) {
        return res.status(400).json({ error: "valid dateIdx required" });
      }

      const tickerDir = path.join(DATA_DIR, "tickers");
      if (!fs.existsSync(tickerDir)) {
        return res.json({ data: {} });
      }

      // SI delta definitions (computed from Short Interest%)
      const SI_DELTA_DEFS: Record<string, number> = {
        "SI Δ 1W": 5, "SI Δ 1M": 21, "SI Δ 3M": 63, "SI Δ 6M": 126,
      };

      const files = fs.readdirSync(tickerDir).filter(f => f.endsWith(".json"));
      const result: Record<string, Record<string, number | null>> = {};

      const avg = avgDays && avgDays > 1 ? avgDays : 0;

      for (const file of files) {
        const ticker = file.replace(".json", "");
        try {
          const rawData = readJSON(path.join(tickerDir, file));
          const tickerValues: Record<string, number | null> = {};

          for (const metric of metrics) {
            // Handle computed SI delta metrics
            if (SI_DELTA_DEFS[metric] !== undefined) {
              const siEncoded = rawData["Short Interest%"] as (number | string)[] | undefined;
              if (!siEncoded) { tickerValues[metric] = null; continue; }
              const siMap = decodeMetricToMap(siEncoded);
              // Find value at dateIdx and at dateIdx - lookback
              const lookback = SI_DELTA_DEFS[metric];
              const currentVal = getValueAtDateIdx(siMap, dateIdx);
              // For the past value, walk backward through the sorted indices
              const sortedIdxs = [...siMap.keys()].sort((a, b) => a - b);
              // Find the value lookback trading days ago (counting actual data points)
              let pastVal: number | null = null;
              const currentDataIdx = sortedIdxs.findIndex(i => i >= dateIdx);
              const targetDataIdx = (currentDataIdx >= 0 ? currentDataIdx : sortedIdxs.length) - lookback;
              if (targetDataIdx >= 0 && targetDataIdx < sortedIdxs.length) {
                pastVal = siMap.get(sortedIdxs[targetDataIdx]) ?? null;
              }
              if (currentVal !== null && pastVal !== null) {
                tickerValues[metric] = currentVal - pastVal; // Already in percentage points
              } else {
                tickerValues[metric] = null;
              }
              continue;
            }

            const encoded = rawData[metric] as (number | string)[] | undefined;
            if (!encoded) {
              tickerValues[metric] = null;
              continue;
            }

            if (avg > 0) {
              // Average over [dateIdx - avgDays + 1, dateIdx]
              const decoded = decodeMetricToMap(encoded);
              let sum = 0, count = 0;
              for (let i = dateIdx - avg + 1; i <= dateIdx; i++) {
                const v = decoded.get(i);
                if (v !== undefined && v !== null) {
                  sum += v;
                  count++;
                }
              }
              tickerValues[metric] = count > 0 ? sum / count : null;
            } else {
              // Single value at or before dateIdx — RLE scan keeping last seen value
              let idx = 0;
              let lastValue: number | null = null;
              for (const item of encoded) {
                if (typeof item === "string" && item.startsWith("~")) {
                  const skip = parseInt(item.slice(1));
                  if (idx + skip > dateIdx) break; // past our target, lastValue holds answer
                  idx += skip;
                } else {
                  if (idx <= dateIdx) lastValue = item as number;
                  if (idx >= dateIdx) break; // found exact or past target
                  idx++;
                }
              }
              tickerValues[metric] = lastValue;
            }
          }

          // Only include tickers that have at least one non-null value
          const hasValue = Object.values(tickerValues).some(v => v !== null);
          if (hasValue) {
            result[ticker] = tickerValues;
          }
        } catch {
          // Skip tickers with bad data
        }
      }

      res.json({ data: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── RV Verdict batch computation ──
  // For each ticker, compute today's two-sided conditional value verdict
  // against its sub-industry peer group:
  //   1. Premium-given-growth percentile (today's premium vs distribution
  //      of premiums seen historically at similar growth differentials)
  //   2. Growth-given-premium percentile (vice versa)
  // The two are combined into Attractive / Neutral / Expensive label.
  // POST body: { tickers, dimension, valMetric, growthMetric, band }
  // Returns: { data: RvVerdictResult[] }
  app.post("/api/rv-verdict-batch", (req, res) => {
    try {
      const {
        tickers,
        dimension = "subsector",
        valMetric = "P/FFO FY2",
        growthMetric = "FY2 FFO Growth",
        band = 0.5,
      } = req.body as {
        tickers: string[];
        dimension?: string;
        valMetric?: string;
        growthMetric?: string;
        band?: number;
      };
      if (!Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: "tickers array required" });
      }
      if (typeof band !== "number" || band < 0.1 || band > 2.0) {
        return res.status(400).json({ error: "band must be number in [0.1, 2.0]" });
      }
      const data = computeRvVerdictBatch(
        tickers.map((t) => String(t).toUpperCase()),
        dimension,
        valMetric,
        growthMetric,
        band,
      );
      res.json({ data });
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? "rv-verdict-batch failed" });
    }
  });

  // ── Batch trailing values for all tickers (valuation overview, heatmap sparklines) ──
  // POST body: { metric: "P/FFO FY2", trailingDays?: 1260 }
  // Returns: { data: { ADC: { current: 15.2, values: [...], dates: [...] }, ... } }
  app.post("/api/batch-trailing", (req, res) => {
    try {
      const { metric, trailingDays = 1260 } = req.body as {
        metric: string;
        trailingDays?: number;
      };
      if (!metric) {
        return res.status(400).json({ error: "metric required" });
      }

      const tickerDir = path.join(DATA_DIR, "tickers");
      if (!fs.existsSync(tickerDir)) return res.json({ data: {} });

      const datesPath = path.join(DATA_DIR, "dates.json");
      const allDates: string[] = fs.existsSync(datesPath) ? readJSON(datesPath) : [];

      const METRIC_MULT: Record<string, number> = {
        "Short Interest%": 100, "Dividend Yield": 100,
      };
      const mult = METRIC_MULT[metric] || 1;

      const files = fs.readdirSync(tickerDir).filter(f => f.endsWith(".json"));
      const result: Record<string, { current: number | null; values: number[]; dates: string[] }> = {};

      for (const file of files) {
        const ticker = file.replace(".json", "");
        try {
          const rawData = readJSON(path.join(tickerDir, file));
          const encoded = rawData[metric];
          if (!encoded) continue;

          const decoded = decodeMetricToMap(encoded);
          // Build sorted pairs array filtered to valid date range
          const pairs: [number, number][] = [];
          for (const [idx, val] of decoded.entries()) {
            if (idx < allDates.length) pairs.push([idx, val]);
          }
          pairs.sort((a, b) => a[0] - b[0]);
          const lastN = pairs.slice(-trailingDays);
          if (lastN.length === 0) continue;

          result[ticker] = {
            current: lastN[lastN.length - 1][1] * mult,
            values: lastN.map(p => p[1] * mult),
            dates: lastN.map(p => allDates[p[0]]),
          };
        } catch { /* skip */ }
      }

      res.json({ data: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Batch trailing for MULTIPLE metrics at once ──
  // POST body: { metrics: ["P/FFO FY2", "Dividend Yield", ...], trailingDays: 250 }
  // Returns: { data: { "P/FFO FY2": { ADC: { current, values }, ... }, ... } }
  app.post("/api/batch-trailing-multi", (req, res) => {
    try {
      const { metrics, trailingDays = 1260 } = req.body as {
        metrics: string[];
        trailingDays?: number;
      };
      if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
        return res.status(400).json({ error: "metrics array required" });
      }

      const tickerDir = path.join(DATA_DIR, "tickers");
      if (!fs.existsSync(tickerDir)) return res.json({ data: {} });

      // Mirror DECIMAL_TO_PERCENT_METRICS in client/src/lib/dataService.ts plus
      // server-only metrics that are stored as decimals (e.g. Short Interest%).
      // Without this, Heatmap "vs History" z-scores compare a 100x-multiplied
      // current value against unmultiplied trailing values, producing garbage.
      const METRIC_MULT: Record<string, number> = {
        "Short Interest%": 100,
        // Yields
        "Dividend Yield": 100,
        "FFO Yield LTM": 100, "FFO Yield FY2": 100,
        "AFFO Yield LTM": 100, "AFFO Yield FY2": 100,
        // Growth rates
        "FY1 EPS Growth": 100, "FY2 EPS Growth": 100,
        "FY1 FFO Growth": 100, "FY2 FFO Growth": 100,
        "FY1 AFFO Growth": 100, "FY2 AFFO Growth": 100,
        // Relative to 52-week range
        "% off 52wk High": 100, "% off 52wk Low": 100,
      };

      const files = fs.readdirSync(tickerDir).filter(f => f.endsWith(".json"));
      // Result shape: { metricName: { ticker: { current, values } } }
      const result: Record<string, Record<string, { current: number | null; values: number[] }>> = {};
      for (const m of metrics) result[m] = {};

      for (const file of files) {
        const ticker = file.replace(".json", "");
        try {
          const rawData = readJSON(path.join(tickerDir, file));
          for (const metric of metrics) {
            const encoded = rawData[metric];
            if (!encoded) continue;
            const mult = METRIC_MULT[metric] || 1;
            const decoded = decodeMetricToMap(encoded);
            const pairs: [number, number][] = [];
            for (const [idx, val] of decoded.entries()) {
              pairs.push([idx, val]);
            }
            pairs.sort((a, b) => a[0] - b[0]);
            const lastN = pairs.slice(-trailingDays);
            if (lastN.length === 0) continue;
            result[metric][ticker] = {
              current: lastN[lastN.length - 1][1] * mult,
              values: lastN.map(p => p[1] * mult),
            };
          }
        } catch { /* skip */ }
      }

      res.json({ data: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Batch revision momentum for all tickers ──
  // POST body: { metric: "FFO FY2" }
  // Returns: { data: { ADC: { currentEstimate, rev30d, rev60d, rev90d, trailValues, trailDates }, ... } }
  app.post("/api/batch-revision-momentum", (req, res) => {
    try {
      const { metric = "FFO FY2" } = req.body as { metric?: string };

      const tickerDir = path.join(DATA_DIR, "tickers");
      if (!fs.existsSync(tickerDir)) return res.json({ data: {} });

      const datesPath = path.join(DATA_DIR, "dates.json");
      const allDates: string[] = fs.existsSync(datesPath) ? readJSON(datesPath) : [];

      const files = fs.readdirSync(tickerDir).filter(f => f.endsWith(".json"));
      const result: Record<string, {
        currentEstimate: number | null;
        rev30d: number | null; rev60d: number | null; rev90d: number | null;
        trailValues: number[]; trailDates: string[];
      }> = {};

      for (const file of files) {
        const ticker = file.replace(".json", "");
        try {
          const rawData = readJSON(path.join(tickerDir, file));
          const encoded = rawData[metric];
          if (!encoded) continue;

          const decoded = decodeMetricToMap(encoded);
          const pairs: [number, number][] = [];
          for (const [idx, val] of decoded.entries()) {
            if (idx < allDates.length) pairs.push([idx, val]);
          }
          pairs.sort((a, b) => a[0] - b[0]);
          if (pairs.length === 0) continue;

          const latestVal = pairs[pairs.length - 1][1];
          let rev30d: number | null = null;
          let rev60d: number | null = null;
          let rev90d: number | null = null;

          for (const lb of [30, 60, 90]) {
            const targetIdx = pairs.length - 1 - lb;
            if (targetIdx >= 0) {
              const pastVal = pairs[targetIdx][1];
              if (pastVal !== 0) {
                const rev = ((latestVal - pastVal) / Math.abs(pastVal)) * 100;
                if (lb === 30) rev30d = rev;
                else if (lb === 60) rev60d = rev;
                else if (lb === 90) rev90d = rev;
              }
            }
          }

          const trail = pairs.slice(-120);
          result[ticker] = {
            currentEstimate: latestVal,
            rev30d, rev60d, rev90d,
            trailValues: trail.map(p => p[1]),
            trailDates: trail.map(p => allDates[p[0]]),
          };
        } catch { /* skip */ }
      }

      res.json({ data: result });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Batch performance returns for all tickers ──
  // POST body: { customStart?: "2025-01-01", customEnd?: "2025-12-31" }
  // Returns preset period returns (1W,1M,3M,6M,12M), custom range, quarterly seasonality
  app.post("/api/batch-performance", (req, res) => {
    try {
      const { customStart, customEnd } = req.body as { customStart?: string; customEnd?: string };

      const tickerDir = path.join(DATA_DIR, "tickers");
      if (!fs.existsSync(tickerDir)) return res.json({ data: [] });

      const datesPath = path.join(DATA_DIR, "dates.json");
      const dates: string[] = fs.existsSync(datesPath) ? readJSON(datesPath) : [];
      if (dates.length === 0) return res.json({ data: [] });

      const tickersPath = path.join(DATA_DIR, "tickers.json");
      const tickersMeta: any[] = fs.existsSync(tickersPath) ? readJSON(tickersPath) : [];

      const lastIdx = dates.length - 1;
      const lastDate = dates[lastIdx];

      // Binary search helper
      function findDateIdx(target: string): number {
        let lo = 0, hi = dates.length - 1, best = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (dates[mid] <= target) { best = mid; lo = mid + 1; }
          else hi = mid - 1;
        }
        return best;
      }

      function subtractDays(dateStr: string, days: number): string {
        const d = new Date(dateStr + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - days);
        return d.toISOString().slice(0, 10);
      }

      // Find closest value at or before toIdx, searching wider for sparse data
      function findCloseAt(closeMap: Map<number, number>, targetIdx: number, maxSearchBack: number = 20): number | null {
        for (let i = targetIdx; i >= Math.max(0, targetIdx - maxSearchBack); i--) {
          if (closeMap.has(i)) return closeMap.get(i)!;
        }
        return null;
      }

      function findCloseAtForward(closeMap: Map<number, number>, targetIdx: number, maxSearchFwd: number = 20): number | null {
        for (let i = targetIdx; i <= targetIdx + maxSearchFwd; i++) {
          if (closeMap.has(i)) return closeMap.get(i)!;
        }
        return null;
      }

      function priceReturn(closeMap: Map<number, number>, fromIdx: number, toIdx: number): number | null {
        const fromVal = findCloseAtForward(closeMap, fromIdx);
        const toVal = findCloseAt(closeMap, toIdx);
        if (fromVal === null || toVal === null || fromVal === 0) return null;
        return ((toVal - fromVal) / fromVal) * 100;
      }

      // Find the actual last date with close data across all tickers (use dates array end as reference)
      // We use the dates array last date for period offset calculations
      const periodOffsets: Record<string, number> = { "1W": 7, "1M": 30, "3M": 91, "6M": 182, "12M": 365 };
      const periodStartIdx: Record<string, number> = {};
      for (const [key, days] of Object.entries(periodOffsets)) {
        periodStartIdx[key] = Math.max(0, findDateIdx(subtractDays(lastDate, days)));
      }

      let customFromIdx = -1, customToIdx = -1;
      if (customStart && customEnd) {
        customFromIdx = findDateIdx(customStart);
        customToIdx = findDateIdx(customEnd);
      }

      // Quarterly seasonality
      const firstYear = parseInt(dates[0].slice(0, 4));
      const lastYear = parseInt(lastDate.slice(0, 4));
      const qRangeIndices: { quarter: number; fromIdx: number; toIdx: number }[] = [];
      for (let y = firstYear; y <= lastYear; y++) {
        for (const [q, from, to] of [[1,`${y}-01-01`,`${y}-03-31`],[2,`${y}-04-01`,`${y}-06-30`],[3,`${y}-07-01`,`${y}-09-30`],[4,`${y}-10-01`,`${y}-12-31`]] as [number,string,string][]) {
          const fi = findDateIdx(from), ti = findDateIdx(to);
          if (fi >= 0 && ti > fi) qRangeIndices.push({ quarter: q, fromIdx: fi, toIdx: ti });
        }
      }

      const files = fs.readdirSync(tickerDir).filter(f => f.endsWith(".json"));
      const tickerMetaMap = new Map(tickersMeta.map((t: any) => [t.ticker, t]));
      const results: any[] = [];

      for (const file of files) {
        const ticker = file.replace(".json", "");
        const meta = tickerMetaMap.get(ticker);
        if (!meta) continue;

        const row: any = {
          ticker, name: meta.name || "",
          economy: meta.economy || "", sector: meta.sector || "",
          subsector: meta.subsector || "", industryGroup: meta.industryGroup || "",
          industry: meta.industry || "", subindustry: meta.subindustry || "",
          "1W": null, "1M": null, "3M": null, "6M": null, "12M": null,
          custom: null, Q1: null, Q2: null, Q3: null, Q4: null, lastClose: null,
        };

        try {
          const rawData = readJSON(path.join(tickerDir, file));
          const closeEncoded = rawData.close;
          if (!closeEncoded) { results.push(row); continue; }
          const closeMap = decodeMetricToMap(closeEncoded);

          // Find actual last available close index for this ticker
          let tickerLastIdx = -1;
          for (const idx of closeMap.keys()) {
            if (idx > tickerLastIdx) tickerLastIdx = idx;
          }
          if (tickerLastIdx < 0) { results.push(row); continue; }

          row.lastClose = closeMap.get(tickerLastIdx) ?? null;
          const tickerLastDate = tickerLastIdx < dates.length ? dates[tickerLastIdx] : lastDate;

          // Compute period starts relative to this ticker's last close date
          for (const [key, days] of Object.entries(periodOffsets)) {
            const startDate = subtractDays(tickerLastDate, days);
            const startIdx = Math.max(0, findDateIdx(startDate));
            row[key] = priceReturn(closeMap, startIdx, tickerLastIdx);
          }

          // Custom range
          if (customFromIdx >= 0 && customToIdx >= 0) {
            row.custom = priceReturn(closeMap, customFromIdx, customToIdx);
          }

          // Quarterly seasonality
          const qReturns: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
          for (const qr of qRangeIndices) {
            const ret = priceReturn(closeMap, qr.fromIdx, qr.toIdx);
            if (ret !== null) qReturns[qr.quarter].push(ret);
          }
          for (const q of [1, 2, 3, 4]) {
            const arr = qReturns[q];
            if (arr.length > 0) {
              row[`Q${q}`] = arr.reduce((s: number, v: number) => s + v, 0) / arr.length;
            }
          }
        } catch { /* skip */ }
        results.push(row);
      }

      res.json({ data: results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Helper: decode an encoded metric into index->value map
  function decodeMetricToMap(encoded: (number | string | null)[]): Map<number, number> {
    const map = new Map<number, number>();
    let idx = 0;
    for (const item of encoded) {
      if (typeof item === "string" && item.startsWith("~")) {
        idx += parseInt(item.slice(1));
      } else {
        // Only store finite numeric values. null/undefined/NaN mark missing
        // data for this date and must NOT be coerced to 0 (a 0 would be
        // arithmetically multiplied by the metric scaler and shown as a
        // legitimate-looking zero on the Valuation page).
        if (typeof item === "number" && Number.isFinite(item)) {
          map.set(idx, item);
        }
        idx++;
      }
    }
    return map;
  }

  // Helper: get value at a specific date index, or last non-null before it
  function getValueAtDateIdx(metricMap: Map<number, number>, targetIdx: number): number | null {
    // Find the value at exactly targetIdx or the closest before
    if (metricMap.has(targetIdx)) return metricMap.get(targetIdx)!;
    let best: number | null = null;
    for (const [idx, val] of metricMap.entries()) {
      if (idx <= targetIdx) best = val;
    }
    return best;
  }

  // Helper: get average of last N trading days ending at targetIdx
  function getAverageOverDays(metricMap: Map<number, number>, targetIdx: number, avgDays: number): number | null {
    // Collect up to avgDays values ending at or before targetIdx
    const entries = Array.from(metricMap.entries())
      .filter(([idx]) => idx <= targetIdx)
      .sort((a, b) => b[0] - a[0])
      .slice(0, avgDays);
    if (entries.length === 0) return null;
    const sum = entries.reduce((s, [, v]) => s + v, 0);
    return sum / entries.length;
  }

  // Get value of a metric for ALL tickers — supports date selection and N-day averaging
  // Query params: ?date=YYYY-MM-DD  &avgDays=N
  app.get("/api/metric/:metric/latest", (req, res) => {
    const metric = req.params.metric;
    const dateParam = req.query.date as string | undefined;
    const avgDays = parseInt(req.query.avgDays as string) || 0;
    try {
      const tickersMeta = readJSON(path.join(DATA_DIR, "tickers.json"));
      const dates = getDates();

      // Find target date index
      let targetIdx = dates.length - 1; // default: latest
      if (dateParam) {
        const found = dates.indexOf(dateParam);
        if (found >= 0) targetIdx = found;
        else {
          // Find closest date on or before
          for (let i = dates.length - 1; i >= 0; i--) {
            if (dates[i] <= dateParam) { targetIdx = i; break; }
          }
        }
      }

      const results: any[] = [];
      for (const t of tickersMeta) {
        const base: any = {
          ticker: t.ticker, name: t.name,
          subindustry: t.subindustry || "",
          industry: t.industry || "",
          economy: t.economy || "",
          sector: t.sector || "",
          subsector: t.subsector || "",
          industryGroup: t.industryGroup || "",
          value: null,
        };
        const filePath = path.join(DATA_DIR, "tickers", `${t.ticker}.json`);
        if (!fs.existsSync(filePath)) { results.push(base); continue; }
        const rawData = readJSON(filePath);
        if (!rawData[metric]) { results.push(base); continue; }

        const metricMap = decodeMetricToMap(rawData[metric]);
        base.value = avgDays > 1
          ? getAverageOverDays(metricMap, targetIdx, avgDays)
          : getValueAtDateIdx(metricMap, targetIdx);
        results.push(base);
      }

      res.json(results);
    } catch (e) {
      res.status(500).json({ error: "Failed to load metric data" });
    }
  });

  // Enhanced scatter: supports date selection, 3rd variable (z), N-day averaging, and all classifications
  // Query params: x, y, z (optional), date (optional), avgDays (optional)
  app.get("/api/scatter", (req, res) => {
    const metricX = req.query.x as string;
    const metricY = req.query.y as string;
    const metricZ = req.query.z as string | undefined;
    const dateParam = req.query.date as string | undefined;
    const avgDays = parseInt(req.query.avgDays as string) || 0;
    if (!metricX || !metricY) {
      return res.status(400).json({ error: "Query params x and y required" });
    }
    try {
      const tickersMeta = readJSON(path.join(DATA_DIR, "tickers.json"));
      const dates = getDates();

      let targetIdx = dates.length - 1;
      if (dateParam) {
        const found = dates.indexOf(dateParam);
        if (found >= 0) targetIdx = found;
        else {
          for (let i = dates.length - 1; i >= 0; i--) {
            if (dates[i] <= dateParam) { targetIdx = i; break; }
          }
        }
      }

      const results: any[] = [];
      for (const t of tickersMeta) {
        const base: any = {
          ticker: t.ticker, name: t.name,
          subindustry: t.subindustry || "",
          industry: t.industry || "",
          economy: t.economy || "",
          sector: t.sector || "",
          subsector: t.subsector || "",
          industryGroup: t.industryGroup || "",
          x: null, y: null, z: null,
        };
        const filePath = path.join(DATA_DIR, "tickers", `${t.ticker}.json`);
        if (!fs.existsSync(filePath)) { results.push(base); continue; }
        const rawData = readJSON(filePath);

        const getValue = (metricName: string): number | null => {
          if (!rawData[metricName]) return null;
          const metricMap = decodeMetricToMap(rawData[metricName]);
          return avgDays > 1
            ? getAverageOverDays(metricMap, targetIdx, avgDays)
            : getValueAtDateIdx(metricMap, targetIdx);
        };

        base.x = getValue(metricX);
        base.y = getValue(metricY);
        if (metricZ) base.z = getValue(metricZ);
        results.push(base);
      }

      // Include resolved date in response so frontend knows
      res.json({ points: results, resolvedDate: dates[targetIdx] });
    } catch (e) {
      res.status(500).json({ error: "Failed to load scatter data" });
    }
  });

  // Compute a formula series: seriesA op seriesB (or seriesA op constant)
  app.post("/api/formula", (req, res) => {
    try {
      const { tickerA, metricA, tickerB, metricB, constant, operator } = req.body;
      if (!tickerA || !metricA || !operator) {
        return res.status(400).json({ error: "tickerA, metricA, and operator are required" });
      }
      const validOps = ["+", "-", "*", "/"];
      if (!validOps.includes(operator)) {
        return res.status(400).json({ error: "operator must be one of +, -, *, /" });
      }

      const dates = getDates();

      // Decode a metric for a ticker into a Map<date, value>
      const decodeMetric = (ticker: string, metric: string): Map<string, number> => {
        const filePath = path.join(DATA_DIR, "tickers", `${ticker.toUpperCase()}.json`);
        if (!fs.existsSync(filePath)) throw new Error(`Ticker ${ticker} not found`);
        const rawData = readJSON(filePath);
        if (!rawData[metric]) throw new Error(`Metric ${metric} not found for ${ticker}`);
        const encoded = rawData[metric] as (number | string)[];
        const map = new Map<string, number>();
        let idx = 0;
        for (const item of encoded) {
          if (typeof item === "string" && item.startsWith("~")) {
            idx += parseInt(item.slice(1));
          } else {
            if (idx < dates.length) {
              map.set(dates[idx], item as number);
            }
            idx++;
          }
        }
        return map;
      };

      const mapA = decodeMetric(tickerA, metricA);

      const useConstant = constant !== undefined && constant !== null;
      const mapB = (!useConstant && tickerB && metricB) ? decodeMetric(tickerB, metricB) : null;

      const result: { time: string; value: number }[] = [];

      for (const [date, valA] of mapA.entries()) {
        let valB: number | undefined;
        if (useConstant) {
          valB = Number(constant);
        } else if (mapB) {
          valB = mapB.get(date);
        }
        if (valB === undefined || valB === null) continue;

        let computed: number;
        switch (operator) {
          case "+": computed = valA + valB; break;
          case "-": computed = valA - valB; break;
          case "*": computed = valA * valB; break;
          case "/":
            if (valB === 0) continue;
            computed = valA / valB;
            break;
          default: continue;
        }

        if (!isFinite(computed)) continue;
        result.push({ time: date, value: computed });
      }

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute formula" });
    }
  });

  // Pairs trading data: compute ratio, log-ratio, spread, and z-score for two tickers
  // Query: /api/pairs?a=TICKER1&b=TICKER2&metricA=close&metricB=close&zscore=60
  app.get("/api/pairs", (req, res) => {
    const tickerA = (req.query.a as string || "").toUpperCase();
    const tickerB = (req.query.b as string || "").toUpperCase();
    const metricA = req.query.metricA as string || "close";
    const metricB = req.query.metricB as string || "close";
    const zWindow = parseInt(req.query.zscore as string) || 60;

    if (!tickerA || !tickerB) {
      return res.status(400).json({ error: "Query params a and b are required" });
    }

    try {
      const dates = getDates();
      const fileA = path.join(DATA_DIR, "tickers", `${tickerA}.json`);
      const fileB = path.join(DATA_DIR, "tickers", `${tickerB}.json`);
      if (!fs.existsSync(fileA)) return res.status(404).json({ error: `${tickerA} not found` });
      if (!fs.existsSync(fileB)) return res.status(404).json({ error: `${tickerB} not found` });

      const rawA = readJSON(fileA);
      const rawB = readJSON(fileB);
      if (!rawA[metricA]) return res.status(404).json({ error: `${metricA} not found for ${tickerA}` });
      if (!rawB[metricB]) return res.status(404).json({ error: `${metricB} not found for ${tickerB}` });

      const mapA = decodeMetricToMap(rawA[metricA]);
      const mapB = decodeMetricToMap(rawB[metricB]);

      // Align on dates where both have values
      const priceA: { time: string; value: number }[] = [];
      const priceB: { time: string; value: number }[] = [];
      const ratio: { time: string; value: number }[] = [];
      const logRatio: { time: string; value: number }[] = [];
      const spread: { time: string; value: number }[] = [];

      for (let i = 0; i < dates.length; i++) {
        const a = mapA.get(i);
        const b = mapB.get(i);
        if (a !== undefined && b !== undefined && b !== 0 && a > 0 && b > 0) {
          const t = dates[i];
          priceA.push({ time: t, value: a });
          priceB.push({ time: t, value: b });
          ratio.push({ time: t, value: a / b });
          logRatio.push({ time: t, value: Math.log(a / b) });
          spread.push({ time: t, value: a - b });
        }
      }

      // Compute rolling z-score of the log ratio
      const zScore: { time: string; value: number }[] = [];
      for (let i = 0; i < logRatio.length; i++) {
        if (i < zWindow - 1) continue;
        let sum = 0;
        let sumSq = 0;
        for (let j = i - zWindow + 1; j <= i; j++) {
          sum += logRatio[j].value;
          sumSq += logRatio[j].value ** 2;
        }
        const mean = sum / zWindow;
        const variance = sumSq / zWindow - mean ** 2;
        const std = Math.sqrt(Math.max(0, variance));
        const z = std === 0 ? 0 : (logRatio[i].value - mean) / std;
        zScore.push({ time: logRatio[i].time, value: Math.round(z * 10000) / 10000 });
      }

      // Compute rolling correlation of log returns
      const corrWindow = zWindow;
      const correlation: { time: string; value: number }[] = [];
      // First compute log returns
      const retA: { time: string; value: number }[] = [];
      const retB: { time: string; value: number }[] = [];
      for (let i = 1; i < priceA.length; i++) {
        retA.push({ time: priceA[i].time, value: Math.log(priceA[i].value / priceA[i - 1].value) });
        retB.push({ time: priceB[i].time, value: Math.log(priceB[i].value / priceB[i - 1].value) });
      }
      for (let i = corrWindow - 1; i < retA.length; i++) {
        let sumA = 0, sumB = 0;
        for (let j = i - corrWindow + 1; j <= i; j++) { sumA += retA[j].value; sumB += retB[j].value; }
        const meanA = sumA / corrWindow;
        const meanB = sumB / corrWindow;
        let covAB = 0, varAA = 0, varBB = 0;
        for (let j = i - corrWindow + 1; j <= i; j++) {
          const da = retA[j].value - meanA;
          const db = retB[j].value - meanB;
          covAB += da * db;
          varAA += da * da;
          varBB += db * db;
        }
        const denom = Math.sqrt(varAA * varBB);
        const corr = denom === 0 ? 0 : covAB / denom;
        correlation.push({ time: retA[i].time, value: Math.round(corr * 10000) / 10000 });
      }

      res.json({ priceA, priceB, ratio, logRatio, spread, zScore, correlation });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute pairs data" });
    }
  });

  // ── Pairs screening: compute quick pair stats for many pairs at once ──
  // POST /api/pairs-screen { tickers, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow }
  app.post("/api/pairs-screen", (req, res) => {
    try {
      const {
        tickers,
        metricA = "close",
        metricB = "close",
        zWindow = 60,
        betaLookback = 52,
        spreadZWindow = 8,
        olsResidWindow = 52,
      } = req.body;
      if (!Array.isArray(tickers) || tickers.length < 2) {
        return res.status(400).json({ error: "Need at least 2 tickers" });
      }

      const dates = getDates();
      // Load all ticker data for both metrics
      const tickerDataA: Map<string, Map<number, number>> = new Map();
      const tickerDataB: Map<string, Map<number, number>> = new Map();
      const sameMetric = metricA === metricB;
      for (const ticker of tickers) {
        const filePath = path.join(DATA_DIR, "tickers", `${ticker.toUpperCase()}.json`);
        if (!fs.existsSync(filePath)) continue;
        const raw = readJSON(filePath);
        if (!raw[metricA] || !raw[metricB]) continue;
        tickerDataA.set(ticker.toUpperCase(), decodeMetricToMap(raw[metricA]));
        tickerDataB.set(ticker.toUpperCase(), sameMetric ? tickerDataA.get(ticker.toUpperCase())! : decodeMetricToMap(raw[metricB]));
      }

      const validTickers = Array.from(tickerDataA.keys()).filter(t => tickerDataB.has(t));
      const results: any[] = [];

      for (let i = 0; i < validTickers.length; i++) {
        for (let j = i + 1; j < validTickers.length; j++) {
          const tA = validTickers[i];
          const tB = validTickers[j];
          const mapA = tickerDataA.get(tA)!;
          const mapB = tickerDataB.get(tB)!;

          // Align on dates where both have values
          const valsA: number[] = [];
          const valsB: number[] = [];
          for (let k = 0; k < dates.length; k++) {
            const a = mapA.get(k);
            const b = mapB.get(k);
            if (a !== undefined && b !== undefined && a > 0 && b > 0) {
              valsA.push(a);
              valsB.push(b);
            }
          }
          const nPts = valsA.length;
          if (nPts < Math.max(zWindow, 10)) continue;

          // ── Ratio & Log Ratio ──
          const lastRatio = valsA[nPts - 1] / valsB[nPts - 1];
          const logA: number[] = valsA.map(v => Math.log(v));
          const logB: number[] = valsB.map(v => Math.log(v));
          const logRatioArr: number[] = [];
          for (let k = 0; k < nPts; k++) logRatioArr.push(logA[k] - logB[k]);
          const lastLogRatio = logRatioArr[nPts - 1];

          // ── Raw Z-Score (rolling z of log ratio) ──
          let rawZ = 0;
          if (nPts >= zWindow) {
            let sum = 0, sumSq = 0;
            for (let k = nPts - zWindow; k < nPts; k++) {
              sum += logRatioArr[k];
              sumSq += logRatioArr[k] ** 2;
            }
            const mean = sum / zWindow;
            const variance = sumSq / zWindow - mean ** 2;
            const std = Math.sqrt(Math.max(0, variance));
            rawZ = std === 0 ? 0 : (lastLogRatio - mean) / std;
          }

          // ── Spread Z (dual-window: rolling beta on log prices + z-score) ──
          let lastSpreadZ: number | null = null;
          if (nPts >= betaLookback + spreadZWindow) {
            const rollingSpread: number[] = [];
            for (let k = betaLookback - 1; k < nPts; k++) {
              let sX = 0, sY = 0, sXY = 0, sXX = 0;
              for (let m = k - betaLookback + 1; m <= k; m++) {
                sX += logB[m]; sY += logA[m];
                sXY += logB[m] * logA[m]; sXX += logB[m] * logB[m];
              }
              const mX = sX / betaLookback;
              const mY = sY / betaLookback;
              const dXX = sXX - betaLookback * mX * mX;
              const dXY = sXY - betaLookback * mX * mY;
              const b = dXX === 0 ? 1 : dXY / dXX;
              rollingSpread.push(logA[k] - b * logB[k]);
            }
            if (rollingSpread.length >= spreadZWindow) {
              const end = rollingSpread.length;
              let sum = 0, sumSq = 0;
              for (let k = end - spreadZWindow; k < end; k++) {
                sum += rollingSpread[k];
                sumSq += rollingSpread[k] ** 2;
              }
              const mean = sum / spreadZWindow;
              const variance = sumSq / spreadZWindow - mean ** 2;
              const std = Math.sqrt(Math.max(0, variance));
              lastSpreadZ = std === 0 ? 0 : (rollingSpread[end - 1] - mean) / std;
            }
          }

          // ── OLS Residual Z (rolling OLS with intercept) ──
          let lastOlsResidZ: number | null = null;
          if (nPts >= olsResidWindow) {
            const k = nPts - 1; // compute for last point
            let sX = 0, sY = 0, sXY = 0, sXX = 0;
            for (let m = k - olsResidWindow + 1; m <= k; m++) {
              sX += logB[m]; sY += logA[m];
              sXY += logB[m] * logA[m]; sXX += logB[m] * logB[m];
            }
            const n = olsResidWindow;
            const mX = sX / n;
            const mY = sY / n;
            const dXX = sXX - n * mX * mX;
            const dXY = sXY - n * mX * mY;
            const beta = dXX === 0 ? 1 : dXY / dXX;
            const alpha = mY - beta * mX;
            // Compute residual std within window
            let sumResidSq = 0;
            for (let m = k - olsResidWindow + 1; m <= k; m++) {
              const resid = logA[m] - (alpha + beta * logB[m]);
              sumResidSq += resid * resid;
            }
            const residStd = Math.sqrt(sumResidSq / n);
            const currentResid = logA[k] - (alpha + beta * logB[k]);
            lastOlsResidZ = residStd === 0 ? 0 : currentResid / residStd;
          }

          // ── Correlation, Rolling Beta, Rolling R² (of log returns) ──
          const retA: number[] = [];
          const retB: number[] = [];
          for (let k = 1; k < nPts; k++) {
            retA.push(Math.log(valsA[k] / valsA[k - 1]));
            retB.push(Math.log(valsB[k] / valsB[k - 1]));
          }
          let corr = 0, lastBeta: number | null = null, lastR2: number | null = null;
          if (retA.length >= zWindow) {
            const rA = retA.slice(-zWindow);
            const rB = retB.slice(-zWindow);
            const mA = rA.reduce((s, v) => s + v, 0) / rA.length;
            const mB = rB.reduce((s, v) => s + v, 0) / rB.length;
            let covAB = 0, varAA = 0, varBB = 0;
            for (let k = 0; k < rA.length; k++) {
              const da = rA[k] - mA;
              const db = rB[k] - mB;
              covAB += da * db;
              varAA += da * da;
              varBB += db * db;
            }
            const denom = Math.sqrt(varAA * varBB);
            corr = denom === 0 ? 0 : covAB / denom;
            // Beta & R² from same window
            const ssXX = varBB; // sum of (rB - mean)^2
            const ssXY = covAB;
            const ssYY = varAA;
            lastBeta = ssXX === 0 ? 0 : ssXY / ssXX;
            lastR2 = (ssXX === 0 || ssYY === 0) ? 0 : (ssXY * ssXY) / (ssXX * ssYY);
          }

          // ── Beta-Adjusted Spread (full-sample OLS: log(A) = alpha + hedgeRatio * log(B)) ──
          let lastBetaAdjSpread: number | null = null;
          if (nPts >= 10) {
            let sX = 0, sY = 0, sXY = 0, sXX = 0;
            for (let k = 0; k < nPts; k++) {
              sX += logB[k]; sY += logA[k];
              sXY += logB[k] * logA[k]; sXX += logB[k] * logB[k];
            }
            const mX = sX / nPts;
            const mY = sY / nPts;
            const dXX = sXX - nPts * mX * mX;
            const dXY = sXY - nPts * mX * mY;
            const hedgeRatio = dXX === 0 ? 1 : dXY / dXX;
            const alpha = mY - hedgeRatio * mX;
            lastBetaAdjSpread = logA[nPts - 1] - hedgeRatio * logB[nPts - 1] - alpha;
          }

          // ── Half-life (from log ratio mean-reversion) ──
          let halfLife = NaN;
          if (nPts >= zWindow) {
            const windowLR = logRatioArr.slice(-zWindow);
            const meanLR = windowLR.reduce((s, v) => s + v, 0) / windowLR.length;
            const spreadArr = logRatioArr.map(v => v - meanLR);
            let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0, n2 = 0;
            for (let k = 1; k < spreadArr.length; k++) {
              const x = spreadArr[k - 1];
              const y = spreadArr[k] - spreadArr[k - 1];
              sumX += x; sumY += y; sumXX += x * x; sumXY += x * y; n2++;
            }
            const b = (n2 * sumXY - sumX * sumY) / (n2 * sumXX - sumX * sumX);
            if (b < 0) halfLife = -Math.log(2) / b;
          }

          const r4 = (v: number) => Math.round(v * 10000) / 10000;

          // ── Engle-Granger cointegration test on full sample ──
          // Adds: adfPValue (lower = more cointegrated), ouHalfLife (days, on residuals),
          // hurstH (<0.5 mean-reverting), isCointegrated (adfPValue < 0.05).
          let adfPValue: number | null = null;
          let ouHalfLifeDays: number | null = null;
          let hurstH: number | null = null;
          let isCointegrated = false;
          if (nPts >= 60) {
            const eg = engleGranger(logA, logB);
            adfPValue = Math.round(eg.adfPValue * 10000) / 10000;
            ouHalfLifeDays = isNaN(eg.ouHalfLife) || eg.ouHalfLife <= 0 || eg.ouHalfLife > 9999
              ? null
              : Math.round(eg.ouHalfLife * 10) / 10;
            hurstH = Math.round(eg.hurstH * 1000) / 1000;
            isCointegrated = eg.isCointegrated;
          }

          results.push({
            tickerA: tA,
            tickerB: tB,
            ratio: r4(lastRatio),
            logRatio: r4(lastLogRatio),
            rawZ: r4(rawZ),
            spreadZ: lastSpreadZ !== null ? r4(lastSpreadZ) : null,
            olsResidZ: lastOlsResidZ !== null ? r4(lastOlsResidZ) : null,
            correlation: r4(corr),
            rollingBeta: lastBeta !== null ? r4(lastBeta) : null,
            rollingR2: lastR2 !== null ? r4(lastR2) : null,
            betaAdjSpread: lastBetaAdjSpread !== null ? r4(lastBetaAdjSpread) : null,
            halfLife: isNaN(halfLife) || halfLife < 0 || halfLife > 9999 ? null : Math.round(halfLife * 10) / 10,
            adfPValue,
            ouHalfLife: ouHalfLifeDays,
            hurstH,
            isCointegrated,
            dataPoints: nPts,
          });
        }
      }

      res.json({ results, metricA, metricB, zWindow, betaLookback, spreadZWindow, olsResidWindow });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute pairs screen" });
    }
  });

  /**
   * POST /api/cohort-backtest
   * Body: { tickers: string[], horizons?: number[], startDate?: string }
   *
   * Given a cohort of tickers (e.g. output of a composite-z screen), compute
   * the forward return distribution at each horizon (default 60/126/252 trading
   * days ≈ 3M/6M/12M) starting from `startDate` (default: most recent date with
   * data for all tickers).
   *
   * Compares the cohort distribution to a universe baseline (all tickers in
   * the loaded universe at the same date).
   *
   * Returns per-horizon: cohort mean/median/winRate/best/worst + histogram
   * bins, plus baseline mean/median/winRate for the same universe + horizon.
   * The hit-rate edge (cohort winRate − baseline winRate) is the headline
   * stat for screen-quality evaluation.
   */
  app.post("/api/cohort-backtest", (req, res) => {
    try {
      const { tickers, horizons = [60, 126, 252], startDate } = req.body;
      if (!Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: "tickers array required" });
      }
      if (!Array.isArray(horizons) || horizons.length === 0 || horizons.some(h => typeof h !== "number" || h < 1)) {
        return res.status(400).json({ error: "horizons must be array of positive numbers" });
      }

      const dates = getDates();
      const tickersRaw = readJSON(path.join(DATA_DIR, "tickers.json"));
      const tickersAll: string[] = Array.isArray(tickersRaw)
        ? tickersRaw.map((t: any) => (typeof t === "string" ? t : t?.ticker)).filter(Boolean)
        : [];
      const tickersSet = new Set(tickersAll.map(t => t.toUpperCase()));
      const cohort = tickers.map((t: string) => t.toUpperCase()).filter((t: string) => tickersSet.has(t));
      if (cohort.length === 0) {
        return res.status(400).json({ error: "no valid tickers in cohort" });
      }

      // Load close prices for cohort + universe
      const loadCloses = (tk: string): Map<number, number> | null => {
        const fp = path.join(DATA_DIR, "tickers", `${tk}.json`);
        if (!fs.existsSync(fp)) return null;
        const raw = readJSON(fp);
        if (!raw.close) return null;
        return decodeMetricToMap(raw.close);
      };

      const cohortPrices = new Map<string, Map<number, number>>();
      for (const t of cohort) {
        const p = loadCloses(t);
        if (p && p.size > 0) cohortPrices.set(t, p);
      }
      if (cohortPrices.size === 0) {
        return res.status(400).json({ error: "no price data found for any cohort ticker" });
      }

      // Resolve startDate to an index. Default: lookback enough so that the
      // longest horizon still fits before the end of the dataset; this lets us
      // measure forward returns that have already realized.
      const maxHorizon = Math.max(...horizons);
      let startIdx: number;
      if (startDate) {
        const idx = dates.indexOf(startDate);
        if (idx < 0) return res.status(400).json({ error: `startDate ${startDate} not in date series` });
        startIdx = idx;
      } else {
        // Default: as recent as possible while leaving room for the longest horizon.
        startIdx = Math.max(0, dates.length - 1 - maxHorizon);
      }
      if (startIdx + maxHorizon >= dates.length) {
        return res.status(400).json({
          error: `Insufficient forward data: startIdx=${startIdx} + maxHorizon=${maxHorizon} exceeds dataset length ${dates.length}. Pick an earlier startDate.`,
        });
      }

      // For each ticker, compute forward log return = ln(price_{startIdx+h} / price_{startIdx})
      // Use the last available price at or before each index (handles missing data days).
      function priceAtOrBefore(map: Map<number, number>, idx: number): number | null {
        for (let i = idx; i >= 0; i--) {
          const v = map.get(i);
          if (v !== undefined && v > 0) return v;
        }
        return null;
      }

      function returnsForUniverse(
        universe: string[],
        loader: (t: string) => Map<number, number> | null,
      ): Record<number, number[]> {
        const out: Record<number, number[]> = {};
        for (const h of horizons) out[h] = [];
        for (const t of universe) {
          const p = loader(t);
          if (!p) continue;
          const p0 = priceAtOrBefore(p, startIdx);
          if (p0 === null || p0 <= 0) continue;
          for (const h of horizons) {
            const p1 = priceAtOrBefore(p, startIdx + h);
            if (p1 === null || p1 <= 0) continue;
            out[h].push(Math.log(p1 / p0));
          }
        }
        return out;
      }

      // Universe baseline (uses all tickers in universe).
      const universeLoaderCache = new Map<string, Map<number, number> | null>();
      const cachedLoader = (t: string) => {
        if (universeLoaderCache.has(t)) return universeLoaderCache.get(t)!;
        const m = loadCloses(t);
        universeLoaderCache.set(t, m);
        return m;
      };
      const baselineReturns = returnsForUniverse(tickersAll, cachedLoader);
      const cohortReturns = returnsForUniverse(cohort, cachedLoader);

      // Summary stats + histogram per horizon
      function summarize(arr: number[]) {
        const n = arr.length;
        if (n === 0) return { n: 0, mean: 0, median: 0, std: 0, winRate: 0, best: 0, worst: 0 };
        const sorted = [...arr].sort((a, b) => a - b);
        const mean = arr.reduce((s, v) => s + v, 0) / n;
        const median = sorted[Math.floor(n / 2)];
        const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
        const std = Math.sqrt(variance);
        const winRate = arr.filter(v => v > 0).length / n;
        return {
          n,
          mean: Math.round(mean * 10000) / 10000,
          median: Math.round(median * 10000) / 10000,
          std: Math.round(std * 10000) / 10000,
          winRate: Math.round(winRate * 10000) / 10000,
          best: Math.round(sorted[n - 1] * 10000) / 10000,
          worst: Math.round(sorted[0] * 10000) / 10000,
        };
      }

      // Histogram with 20 bins spanning [min, max] of the combined cohort+baseline distribution
      function histogram(arr: number[], min: number, max: number, bins = 20): { bin: number; count: number }[] {
        const width = (max - min) / bins;
        if (width <= 0) return [];
        const out: { bin: number; count: number }[] = [];
        for (let b = 0; b < bins; b++) out.push({ bin: Math.round((min + b * width + width / 2) * 10000) / 10000, count: 0 });
        for (const v of arr) {
          let b = Math.floor((v - min) / width);
          if (b < 0) b = 0;
          if (b >= bins) b = bins - 1;
          out[b].count++;
        }
        return out;
      }

      const results: Record<number, any> = {};
      for (const h of horizons) {
        const cArr = cohortReturns[h];
        const bArr = baselineReturns[h];
        const allArr = [...cArr, ...bArr];
        const min = allArr.length ? Math.min(...allArr) : -0.5;
        const max = allArr.length ? Math.max(...allArr) : 0.5;
        const cohortSummary = summarize(cArr);
        const baselineSummary = summarize(bArr);
        results[h] = {
          horizon: h,
          cohort: cohortSummary,
          baseline: baselineSummary,
          edge: {
            meanEdge: Math.round((cohortSummary.mean - baselineSummary.mean) * 10000) / 10000,
            medianEdge: Math.round((cohortSummary.median - baselineSummary.median) * 10000) / 10000,
            winRateEdge: Math.round((cohortSummary.winRate - baselineSummary.winRate) * 10000) / 10000,
          },
          cohortHistogram: histogram(cArr, min, max),
          baselineHistogram: histogram(bArr, min, max),
        };
      }

      res.json({
        startDate: dates[startIdx],
        startIndex: startIdx,
        cohortRequested: tickers.length,
        cohortResolved: cohortPrices.size,
        universeSize: tickersAll.length,
        horizons,
        results,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute cohort backtest" });
    }
  });
  // Get all events
  app.get("/api/events", (_req, res) => {
    try {
      const events = readJSON(path.join(DATA_DIR, "events.json"));
      res.json(events);
    } catch (e) {
      res.status(500).json({ error: "Failed to load events" });
    }
  });

  // Get events for a ticker
  app.get("/api/events/:symbol", (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
      const events = readJSON(path.join(DATA_DIR, "events.json"));
      res.json(events[symbol] || {});
    } catch (e) {
      res.status(500).json({ error: "Failed to load events" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ── MACRO DATA (FRED) ─────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  const MACRO_DIR = path.join(DATA_DIR, "macro");
  if (!fs.existsSync(MACRO_DIR)) fs.mkdirSync(MACRO_DIR, { recursive: true });

  // All FRED series organized by category
  const FRED_SERIES: Record<string, { id: string; label: string; category: string; unit: string; freq: string }> = {
    // Treasury Yields
    DGS1MO: { id: "DGS1MO", label: "1-Month Treasury Yield", category: "Rates",   unit: "%",    freq: "D" },
    DGS3MO: { id: "DGS3MO", label: "3-Month Treasury Yield", category: "Rates",   unit: "%",    freq: "D" },
    DGS6MO: { id: "DGS6MO", label: "6-Month Treasury Yield", category: "Rates",   unit: "%",    freq: "D" },
    DGS1:   { id: "DGS1",   label: "1-Year Treasury Yield",  category: "Rates",   unit: "%",    freq: "D" },
    DGS2:   { id: "DGS2",   label: "2-Year Treasury Yield",  category: "Rates",   unit: "%",    freq: "D" },
    DGS3:   { id: "DGS3",   label: "3-Year Treasury Yield",  category: "Rates",   unit: "%",    freq: "D" },
    DGS5:   { id: "DGS5",   label: "5-Year Treasury Yield",  category: "Rates",   unit: "%",    freq: "D" },
    DGS7:   { id: "DGS7",   label: "7-Year Treasury Yield",  category: "Rates",   unit: "%",    freq: "D" },
    DGS10:  { id: "DGS10",  label: "10-Year Treasury Yield", category: "Rates",   unit: "%",    freq: "D" },
    DGS30:  { id: "DGS30",  label: "30-Year Treasury Yield", category: "Rates",   unit: "%",    freq: "D" },
    THREEFY10:   { id: "THREEFY10",   label: "10Y Risk-Neutral Expected Rate (ACM)", category: "Rates", unit: "%", freq: "D" },
    THREEFYTP10: { id: "THREEFYTP10", label: "10Y Term Premium (ACM)",                category: "Rates", unit: "%", freq: "D" },
    THREEFF10:   { id: "THREEFF10",   label: "10Y Fitted Yield (ACM)",                category: "Rates", unit: "%", freq: "D" },
    DFEDTARU: { id: "DFEDTARU", label: "Fed Funds Upper Bound", category: "Rates", unit: "%",  freq: "D" },
    SOFR:   { id: "SOFR",   label: "SOFR Rate",              category: "Rates",   unit: "%",    freq: "D" },
    DFII10: { id: "DFII10", label: "10Y TIPS (Real Yield)",   category: "Rates",   unit: "%",    freq: "D" },
    T10YIE: { id: "T10YIE", label: "10Y Breakeven Inflation", category: "Rates",   unit: "%",    freq: "D" },

    // Housing
    HOUST:    { id: "HOUST",    label: "Housing Starts (Total)",           category: "Housing",  unit: "K",  freq: "M" },
    HOUST5F:  { id: "HOUST5F",  label: "Housing Starts (5+ Units)",       category: "Housing",  unit: "K",  freq: "M" },
    HOUST1F:  { id: "HOUST1F",  label: "Housing Starts (Single-Family)",  category: "Housing",  unit: "K",  freq: "M" },
    PERMIT:   { id: "PERMIT",   label: "Building Permits (Total)",         category: "Housing",  unit: "K",  freq: "M" },
    PERMIT5:  { id: "PERMIT5",  label: "Building Permits (5+ Units)",     category: "Housing",  unit: "K",  freq: "M" },
    PERMIT1:  { id: "PERMIT1",  label: "Building Permits (Single-Family)",category: "Housing",  unit: "K",  freq: "M" },
    UNDCONTSA: { id: "UNDCONTSA", label: "Under Construction (Total)",    category: "Housing",  unit: "K",  freq: "M" },
    COMPU:    { id: "COMPU",    label: "Housing Completions (Total)",      category: "Housing",  unit: "K",  freq: "M" },
    COMPUTSA: { id: "COMPUTSA", label: "Completions (Single-Family)",      category: "Housing",  unit: "K",  freq: "M" },

    // Labor
    UNRATE:   { id: "UNRATE",   label: "Unemployment Rate",     category: "Labor",    unit: "%",   freq: "M" },
    PAYEMS:   { id: "PAYEMS",   label: "Total Nonfarm Payrolls", category: "Labor",   unit: "K",   freq: "M" },
    ICSA:     { id: "ICSA",     label: "Initial Jobless Claims", category: "Labor",   unit: "K",   freq: "W" },

    // Inflation
    CPIAUCSL: { id: "CPIAUCSL", label: "CPI (All Urban)",        category: "Inflation", unit: "Idx", freq: "M" },
    CPILFESL: { id: "CPILFESL", label: "Core CPI (ex Food/Energy)", category: "Inflation", unit: "Idx", freq: "M" },
    PCEPI:    { id: "PCEPI",    label: "PCE Price Index",         category: "Inflation", unit: "Idx", freq: "M" },
    PCEPILFE: { id: "PCEPILFE", label: "Core PCE (ex Food/Energy)", category: "Inflation", unit: "Idx", freq: "M" },

    // Economy
    GDP:      { id: "GDP",      label: "GDP (Nominal)",           category: "Economy",  unit: "$B",  freq: "Q" },
    GDPC1:    { id: "GDPC1",    label: "Real GDP",                category: "Economy",  unit: "$B",  freq: "Q" },
    RSAFS:    { id: "RSAFS",    label: "Retail Sales",            category: "Economy",  unit: "$M",  freq: "M" },

    // REIT-relevant
    MORTGAGE30US: { id: "MORTGAGE30US", label: "30-Year Mortgage Rate", category: "Rates", unit: "%", freq: "W" },
    DCOILWTICO:   { id: "DCOILWTICO",   label: "WTI Crude Oil",        category: "Commodities", unit: "$/bbl", freq: "D" },
    VIXCLS:       { id: "VIXCLS",       label: "VIX",                  category: "Markets", unit: "Idx", freq: "D" },

    // ── S&P Case-Shiller Home Price Indices ──
    CSUSHPISA: { id: "CSUSHPISA", label: "CS National HPI",    category: "Home Prices", unit: "Idx", freq: "M" },
    SPCS20RSA: { id: "SPCS20RSA", label: "CS 20-City Composite", category: "Home Prices", unit: "Idx", freq: "M" },
    PHXRSA:    { id: "PHXRSA",    label: "CS Phoenix",          category: "Home Prices", unit: "Idx", freq: "M" },
    DAXRSA:    { id: "DAXRSA",    label: "CS Dallas",           category: "Home Prices", unit: "Idx", freq: "M" },
    ATXRSA:    { id: "ATXRSA",    label: "CS Atlanta",          category: "Home Prices", unit: "Idx", freq: "M" },
    MIXRSA:    { id: "MIXRSA",    label: "CS Miami",            category: "Home Prices", unit: "Idx", freq: "M" },
    LVXRSA:    { id: "LVXRSA",    label: "CS Las Vegas",        category: "Home Prices", unit: "Idx", freq: "M" },
    TPXRSA:    { id: "TPXRSA",    label: "CS Tampa",            category: "Home Prices", unit: "Idx", freq: "M" },
    SFXRSA:    { id: "SFXRSA",    label: "CS San Francisco",    category: "Home Prices", unit: "Idx", freq: "M" },
    LXXRSA:    { id: "LXXRSA",    label: "CS Los Angeles",      category: "Home Prices", unit: "Idx", freq: "M" },
    BOXRSA:    { id: "BOXRSA",    label: "CS Boston",           category: "Home Prices", unit: "Idx", freq: "M" },
    SEXRSA:    { id: "SEXRSA",    label: "CS Seattle",          category: "Home Prices", unit: "Idx", freq: "M" },
    CHXRSA:    { id: "CHXRSA",    label: "CS Chicago",          category: "Home Prices", unit: "Idx", freq: "M" },
    DNXRSA:    { id: "DNXRSA",    label: "CS Denver",           category: "Home Prices", unit: "Idx", freq: "M" },
    NYXRSA:    { id: "NYXRSA",    label: "CS New York",         category: "Home Prices", unit: "Idx", freq: "M" },

    // ── MSA Building Permits (Sunbelt) ──
    PHOE004BPPRIVSA: { id: "PHOE004BPPRIVSA", label: "Permits: Phoenix",    category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    DALL148BPPRIVSA: { id: "DALL148BPPRIVSA", label: "Permits: Dallas",     category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    ATLA013BPPRIVSA: { id: "ATLA013BPPRIVSA", label: "Permits: Atlanta",    category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    HOUS448BPPRIVSA: { id: "HOUS448BPPRIVSA", label: "Permits: Houston",    category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    AUST448BPPRIVSA: { id: "AUST448BPPRIVSA", label: "Permits: Austin",     category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    DENV708BPPRIVSA: { id: "DENV708BPPRIVSA", label: "Permits: Denver",     category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    TAMP312BPPRIVSA: { id: "TAMP312BPPRIVSA", label: "Permits: Tampa",      category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    MIAM112BPPRIVSA: { id: "MIAM112BPPRIVSA", label: "Permits: Miami",      category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    LASV832BPPRIVSA: { id: "LASV832BPPRIVSA", label: "Permits: Las Vegas",  category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    NASH947BPPRIVSA: { id: "NASH947BPPRIVSA", label: "Permits: Nashville",  category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    CHAR737BPPRIVSA: { id: "CHAR737BPPRIVSA", label: "Permits: Charlotte",  category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    ORLA712BPPRIVSA: { id: "ORLA712BPPRIVSA", label: "Permits: Orlando",    category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
    RALE537BPPRIVSA: { id: "RALE537BPPRIVSA", label: "Permits: Raleigh",    category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },

    // ── MSA Building Permits (Coastal/Gateway) ──
    NEWY636BPPRIVSA: { id: "NEWY636BPPRIVSA", label: "Permits: New York",       category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
    LOSA106BPPRIVSA: { id: "LOSA106BPPRIVSA", label: "Permits: Los Angeles",    category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
    SANF806BPPRIVSA: { id: "SANF806BPPRIVSA", label: "Permits: San Francisco",  category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
    BOST625BPPRIVSA: { id: "BOST625BPPRIVSA", label: "Permits: Boston",         category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
    SEAT653BPPRIVSA: { id: "SEAT653BPPRIVSA", label: "Permits: Seattle",        category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
    CHIC917BPPRIVSA: { id: "CHIC917BPPRIVSA", label: "Permits: Chicago",        category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },

    // ── MSA Unemployment Rates (Sunbelt) ──
    PHOE004URN: { id: "PHOE004URN", label: "Unemp: Phoenix",    category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    DALL148URN: { id: "DALL148URN", label: "Unemp: Dallas",     category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    ATLA013URN: { id: "ATLA013URN", label: "Unemp: Atlanta",    category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    HOUS448URN: { id: "HOUS448URN", label: "Unemp: Houston",    category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    AUST448URN: { id: "AUST448URN", label: "Unemp: Austin",     category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    DENV708URN: { id: "DENV708URN", label: "Unemp: Denver",     category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    TAMP312URN: { id: "TAMP312URN", label: "Unemp: Tampa",      category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    MIAM112URN: { id: "MIAM112URN", label: "Unemp: Miami",      category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    LASV832URN: { id: "LASV832URN", label: "Unemp: Las Vegas",  category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    NASH947URN: { id: "NASH947URN", label: "Unemp: Nashville",  category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    CHAR737URN: { id: "CHAR737URN", label: "Unemp: Charlotte",  category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    ORLA712URN: { id: "ORLA712URN", label: "Unemp: Orlando",    category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
    RALE537URN: { id: "RALE537URN", label: "Unemp: Raleigh",    category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },

    // ── MSA Unemployment Rates (Coastal/Gateway) ──
    NEWY636URN: { id: "NEWY636URN", label: "Unemp: New York",       category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
    LOSA106URN: { id: "LOSA106URN", label: "Unemp: Los Angeles",    category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
    SANF806URN: { id: "SANF806URN", label: "Unemp: San Francisco",  category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
    BOST625URN: { id: "BOST625URN", label: "Unemp: Boston",         category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
    SEAT653URN: { id: "SEAT653URN", label: "Unemp: Seattle",        category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
    CHIC917URN: { id: "CHIC917URN", label: "Unemp: Chicago",        category: "Regional Labor (Coastal)", unit: "%", freq: "M" },

    // ── MSA Total Nonfarm Employment (Sunbelt) ──
    PHOE004NA: { id: "PHOE004NA", label: "Payrolls: Phoenix",    category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
    DALL148NA: { id: "DALL148NA", label: "Payrolls: Dallas",     category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
    ATLA013NA: { id: "ATLA013NA", label: "Payrolls: Atlanta",    category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
    HOUS448NA: { id: "HOUS448NA", label: "Payrolls: Houston",    category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
    AUST448NA: { id: "AUST448NA", label: "Payrolls: Austin",     category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
    DENV708NA: { id: "DENV708NA", label: "Payrolls: Denver",     category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
    TAMP312NA: { id: "TAMP312NA", label: "Payrolls: Tampa",      category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
    MIAM112NA: { id: "MIAM112NA", label: "Payrolls: Miami",      category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
    LASV832NA: { id: "LASV832NA", label: "Payrolls: Las Vegas",  category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
    NASH947NA: { id: "NASH947NA", label: "Payrolls: Nashville",  category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },

    // ── MSA Total Nonfarm Employment (Coastal/Gateway) ──
    NEWY636NA: { id: "NEWY636NA", label: "Payrolls: New York",       category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
    LOSA106NA: { id: "LOSA106NA", label: "Payrolls: Los Angeles",    category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
    SANF806NA: { id: "SANF806NA", label: "Payrolls: San Francisco",  category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
    BOST625NA: { id: "BOST625NA", label: "Payrolls: Boston",         category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
    SEAT653NA: { id: "SEAT653NA", label: "Payrolls: Seattle",        category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
    CHIC917NA: { id: "CHIC917NA", label: "Payrolls: Chicago",        category: "Regional Employment (Coastal)", unit: "K", freq: "M" },

    // ── Median Listing Price by MSA (Realtor.com via FRED) ──
    MEDLISPRI38060: { id: "MEDLISPRI38060", label: "Med. List: Phoenix",  category: "Regional Listing Prices", unit: "$", freq: "M" },
    MEDLISPRI19100: { id: "MEDLISPRI19100", label: "Med. List: Dallas",   category: "Regional Listing Prices", unit: "$", freq: "M" },
    MEDLISPRI12060: { id: "MEDLISPRI12060", label: "Med. List: Atlanta",  category: "Regional Listing Prices", unit: "$", freq: "M" },
    MEDLISPRI26420: { id: "MEDLISPRI26420", label: "Med. List: Houston",  category: "Regional Listing Prices", unit: "$", freq: "M" },
    MEDLISPRI12420: { id: "MEDLISPRI12420", label: "Med. List: Austin",   category: "Regional Listing Prices", unit: "$", freq: "M" },
    MEDLISPRI19740: { id: "MEDLISPRI19740", label: "Med. List: Denver",   category: "Regional Listing Prices", unit: "$", freq: "M" },
    MEDLISPRI45300: { id: "MEDLISPRI45300", label: "Med. List: Tampa",    category: "Regional Listing Prices", unit: "$", freq: "M" },
    MEDLISPRI33100: { id: "MEDLISPRI33100", label: "Med. List: Miami",    category: "Regional Listing Prices", unit: "$", freq: "M" },
    MEDLISPRI29820: { id: "MEDLISPRI29820", label: "Med. List: Las Vegas", category: "Regional Listing Prices", unit: "$", freq: "M" },
    MEDLISPRI34980: { id: "MEDLISPRI34980", label: "Med. List: Nashville", category: "Regional Listing Prices", unit: "$", freq: "M" },
  };

  // Computed spread series (derived from fetched data)
  const COMPUTED_SERIES: Record<string, { label: string; category: string; unit: string; seriesA: string; seriesB: string; op: "subtract" }> = {
    "SPREAD_10Y_2Y":  { label: "10Y-2Y Spread",  category: "Rates", unit: "bps", seriesA: "DGS10", seriesB: "DGS2",  op: "subtract" },
    "SPREAD_5Y_2Y":   { label: "5Y-2Y Spread",   category: "Rates", unit: "bps", seriesA: "DGS5",  seriesB: "DGS2",  op: "subtract" },
    "SPREAD_10Y_5Y":  { label: "10Y-5Y Spread",  category: "Rates", unit: "bps", seriesA: "DGS10", seriesB: "DGS5",  op: "subtract" },
    "SPREAD_30Y_10Y": { label: "30Y-10Y Spread", category: "Rates", unit: "bps", seriesA: "DGS30", seriesB: "DGS10", op: "subtract" },
  };

  /** Fetch a single FRED series CSV and return parsed data */
  function fetchFredCSV(seriesId: string): Promise<{ time: string; value: number }[]> {
    return new Promise((resolve, reject) => {
      try {
        // Use curl which handles redirects and TLS properly in this environment
        const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}&cosd=2010-01-01`;
        const body = execSync(`curl -sL --max-time 5 "${url}"`, { encoding: "utf-8", timeout: 6000 });
        const lines = body.trim().split("\n");
        const data: { time: string; value: number }[] = [];
        for (let i = 1; i < lines.length; i++) {
          const [date, val] = lines[i].split(",");
          if (!date || !val || val === "." || val.trim() === "") continue;
          const num = parseFloat(val);
          if (!isFinite(num)) continue;
          data.push({ time: date.trim(), value: num });
        }
        resolve(data);
      } catch (e: any) {
        reject(new Error(`Failed to fetch FRED CSV for ${seriesId}: ${e.message}`));
      }
    });
  }

  /** Read cached macro series from disk. Prefers the fresher of MACRO_DIR
   *  (server-side cache, refreshed via /api/macro/refresh) and DIST_MACRO_DIR
   *  (prefetched by the daily cron into dist/public/data/macro/). The cron is
   *  the more reliable source on Vultr where the FRED API may be blocked. */
  function readMacroCache(seriesId: string): { time: string; value: number }[] | null {
    const fpServer = path.join(MACRO_DIR, `${seriesId}.json`);
    const fpDist = path.join(DIST_MACRO_DIR, `${seriesId}.json`);
    const serverExists = fs.existsSync(fpServer);
    const distExists = fs.existsSync(fpDist);
    if (!serverExists && !distExists) return null;
    let chosen = fpServer;
    if (!serverExists) chosen = fpDist;
    else if (distExists) {
      try {
        const sStat = fs.statSync(fpServer);
        const dStat = fs.statSync(fpDist);
        if (dStat.mtimeMs > sStat.mtimeMs) chosen = fpDist;
      } catch {}
    }
    try {
      return JSON.parse(fs.readFileSync(chosen, "utf-8"));
    } catch { return null; }
  }

  /** Write macro series to disk cache */
  function writeMacroCache(seriesId: string, data: { time: string; value: number }[]) {
    fs.writeFileSync(path.join(MACRO_DIR, `${seriesId}.json`), JSON.stringify(data));
  }

  /** Check if cache is stale (older than maxAgeHours). Uses the freshest of
   *  the server cache and the dist (cron-prefetched) cache. */
  function isCacheStale(seriesId: string, maxAgeHours: number = 12): boolean {
    const fpServer = path.join(MACRO_DIR, `${seriesId}.json`);
    const fpDist = path.join(DIST_MACRO_DIR, `${seriesId}.json`);
    let latest = 0;
    if (fs.existsSync(fpServer)) {
      try { latest = Math.max(latest, fs.statSync(fpServer).mtimeMs); } catch {}
    }
    if (fs.existsSync(fpDist)) {
      try { latest = Math.max(latest, fs.statSync(fpDist).mtimeMs); } catch {}
    }
    if (latest === 0) return true;
    return (Date.now() - latest) > maxAgeHours * 60 * 60 * 1000;
  }

  /** Fetch and cache a single series. Returns cached data if fresh, then
   *  attempts a FRED refresh; on FRED failure we return any cached copy we
   *  have (even if stale) rather than blowing up the request, since FRED can
   *  be blocked on the deployment host. */
  async function getMacroSeries(seriesId: string, forceRefresh = false): Promise<{ time: string; value: number }[]> {
    if (!forceRefresh && !isCacheStale(seriesId, 12)) {
      const cached = readMacroCache(seriesId);
      if (cached) return cached;
    }
    try {
      const data = await fetchFredCSV(seriesId);
      if (data.length > 0) {
        writeMacroCache(seriesId, data);
        return data;
      }
      // Empty FRED response — fall through to stale cache
    } catch {
      // FRED unreachable — fall through to stale cache
    }
    const stale = readMacroCache(seriesId);
    if (stale) return stale;
    return [];
  }

  /** Compute a spread series from two underlying FRED yield series and
   *  convert from percentage points to basis points (the catalog unit).
   *  Each FRED yield is quoted in pp (4.25 = 4.25%), so the difference is
   *  also in pp — multiply by 100 to get bps. */
  function computeSpread(dataA: { time: string; value: number }[], dataB: { time: string; value: number }[]): { time: string; value: number }[] {
    const mapB = new Map(dataB.map(d => [d.time, d.value]));
    const result: { time: string; value: number }[] = [];
    for (const pt of dataA) {
      const bVal = mapB.get(pt.time);
      if (bVal !== undefined) {
        const bps = (pt.value - bVal) * 100;
        result.push({ time: pt.time, value: Math.round(bps * 100) / 100 });
      }
    }
    return result;
  }

  // ── Macro API: catalog of available series ──
  app.get("/api/macro/catalog", (_req, res) => {
    const catalog: any[] = [];
    for (const [id, meta] of Object.entries(FRED_SERIES)) {
      const fp = path.join(MACRO_DIR, `${id}.json`);
      const cached = fs.existsSync(fp);
      const lastUpdate = cached ? fs.statSync(fp).mtime.toISOString() : null;
      catalog.push({ ...meta, id, cached, lastUpdate });
    }
    for (const [id, meta] of Object.entries(COMPUTED_SERIES)) {
      catalog.push({ ...meta, id, computed: true, cached: true, lastUpdate: null });
    }
    res.json(catalog);
  });

  // ── Macro API: get one or more series ──
  // GET /api/macro/series?ids=DGS10,DGS2,SPREAD_10Y_2Y
  app.get("/api/macro/series", async (req, res) => {
    const idsParam = req.query.ids as string;
    if (!idsParam) return res.status(400).json({ error: "ids query param required" });
    const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean);

    try {
      const result: Record<string, { data: { time: string; value: number }[]; meta: any }> = {};

      for (const id of ids) {
        // Check if it's a computed spread
        if (COMPUTED_SERIES[id]) {
          const spec = COMPUTED_SERIES[id];
          const dataA = await getMacroSeries(spec.seriesA);
          const dataB = await getMacroSeries(spec.seriesB);
          const spreadData = computeSpread(dataA, dataB);
          result[id] = { data: spreadData, meta: { id, ...spec, computed: true } };
        }
        // Check if it's a FRED series
        else if (FRED_SERIES[id]) {
          const data = await getMacroSeries(id);
          result[id] = { data, meta: { id, ...FRED_SERIES[id] } };
        }
        else {
          result[id] = { data: [], meta: { id, label: id, error: "Unknown series" } };
        }
      }

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to fetch macro data" });
    }
  });

  // ── Macro API: refresh all series ──
  app.post("/api/macro/refresh", async (_req, res) => {
    try {
      const results: Record<string, { count: number; error?: string }> = {};
      const ids = Object.keys(FRED_SERIES);

      // Fetch in batches of 5 to avoid hammering FRED
      for (let i = 0; i < ids.length; i += 5) {
        const batch = ids.slice(i, i + 5);
        const promises = batch.map(async (id) => {
          try {
            const data = await getMacroSeries(id, true);
            results[id] = { count: data.length };
          } catch (e: any) {
            results[id] = { count: 0, error: e.message };
          }
        });
        await Promise.all(promises);
        // Small delay between batches
        if (i + 5 < ids.length) await new Promise(r => setTimeout(r, 300));
      }

      res.json({ refreshed: Object.keys(results).length, series: results, timestamp: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to refresh macro data" });
    }
  });

  // ── Live quotes (Yahoo Finance proxy) ──
  // Uses Yahoo's free chart endpoint (no auth/key needed). Returns last price
  // and previous close for a batch of symbols. ~15-min delayed during market hours.
  app.post("/api/quotes/live", express.json(), async (req, res) => {
    const symbols: string[] = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
    if (!symbols.length) return res.status(400).json({ error: "symbols array required" });

    interface Quote {
      symbol: string;
      last: number | null;
      previousClose: number | null;
      regularMarketTime: number | null; // unix seconds
      currency: string | null;
      marketState: string | null;
      error?: string;
    }

    // Yahoo allows comma-separated symbols on the v7 quote endpoint, but it now
    // requires a crumb. The chart endpoint (1 symbol per call) is auth-free and
    // reliable. We parallelise with limited concurrency.
    async function fetchOne(sym: string): Promise<Quote> {
      // Map any internal-only suffixes (e.g. "COMP.EQ") to the Yahoo form.
      // Yahoo uses dots for share classes (e.g. BRK.B = BRK-B on Yahoo).
      const yahooSym = sym.replace(/\./g, "-");
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=5d`;
      try {
        const r = await fetch(url, {
          headers: {
            // Yahoo sometimes 401s without a UA
            "User-Agent": "Mozilla/5.0 (compatible; reit-viz/1.0)",
            "Accept": "application/json",
          },
        });
        if (!r.ok) {
          return { symbol: sym, last: null, previousClose: null, regularMarketTime: null, currency: null, marketState: null, error: `HTTP ${r.status}` };
        }
        const j: any = await r.json();
        const result = j?.chart?.result?.[0];
        if (!result) {
          return { symbol: sym, last: null, previousClose: null, regularMarketTime: null, currency: null, marketState: null, error: "no result" };
        }
        const meta = result.meta || {};
        const last = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
        // Derive previous close from the daily closes array. The last entry is
        // today (or the most-recent trading day); the entry before it is the
        // true previous close. Falls back to meta if the array is unavailable.
        const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
        const validCloses = closes.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        let previousClose: number | null = null;
        if (validCloses.length >= 2) {
          previousClose = validCloses[validCloses.length - 2];
        } else if (typeof meta.chartPreviousClose === "number") {
          previousClose = meta.chartPreviousClose;
        } else if (typeof meta.previousClose === "number") {
          previousClose = meta.previousClose;
        }
        return {
          symbol: sym,
          last,
          previousClose,
          regularMarketTime: typeof meta.regularMarketTime === "number" ? meta.regularMarketTime : null,
          currency: meta.currency || null,
          marketState: meta.marketState || null,
        };
      } catch (e: any) {
        return { symbol: sym, last: null, previousClose: null, regularMarketTime: null, currency: null, marketState: null, error: e?.message || "fetch failed" };
      }
    }

    // Limit concurrency to avoid Yahoo throttling
    const CONCURRENCY = 8;
    const out: Quote[] = new Array(symbols.length);
    let cursor = 0;
    async function worker() {
      while (true) {
        const i = cursor++;
        if (i >= symbols.length) return;
        out[i] = await fetchOne(symbols[i]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, () => worker()));

    res.json({ quotes: out, fetchedAt: new Date().toISOString() });
  });

  // ── Macro API: status/freshness ──
  app.get("/api/macro/status", (_req, res) => {
    const status: Record<string, { cached: boolean; stale: boolean; lastUpdate: string | null; dataPoints: number }> = {};
    for (const id of Object.keys(FRED_SERIES)) {
      const fp = path.join(MACRO_DIR, `${id}.json`);
      const cached = fs.existsSync(fp);
      const stale = isCacheStale(id, 12);
      let lastUpdate: string | null = null;
      let dataPoints = 0;
      if (cached) {
        lastUpdate = fs.statSync(fp).mtime.toISOString();
        try { dataPoints = JSON.parse(fs.readFileSync(fp, "utf-8")).length; } catch {}
      }
      status[id] = { cached, stale, lastUpdate, dataPoints };
    }
    res.json(status);
  });

  // ═══════════════════════════════════════════════════════════════
  // ── CORRELATION ENGINE ─────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════

  /** Resolve a series identifier into {time, value}[] data.
   *  Format: "TICKER:metric" for stock data, "MACRO:FRED_ID" for macro data */
  async function resolveSeriesData(seriesSpec: string): Promise<{ time: string; value: number }[]> {
    const parts = seriesSpec.split(":");
    if (parts.length < 2) throw new Error(`Invalid series spec: ${seriesSpec}`);
    const source = parts[0].toUpperCase();
    const metricOrId = parts.slice(1).join(":"); // rejoin in case metric has colon

    if (source === "MACRO") {
      // FRED macro series or computed spread
      const id = metricOrId;
      if (COMPUTED_SERIES[id]) {
        const spec = COMPUTED_SERIES[id];
        const dataA = await getMacroSeries(spec.seriesA);
        const dataB = await getMacroSeries(spec.seriesB);
        return computeSpread(dataA, dataB);
      }
      if (FRED_SERIES[id]) {
        return getMacroSeries(id);
      }
      throw new Error(`Unknown macro series: ${id}`);
    } else {
      // Stock ticker:metric
      const ticker = source;
      const metric = metricOrId;
      const filePath2 = path.join(DATA_DIR, "tickers", `${ticker}.json`);
      if (!fs.existsSync(filePath2)) throw new Error(`Ticker ${ticker} not found`);
      const rawData = readJSON(filePath2);
      if (!rawData[metric]) throw new Error(`Metric ${metric} not found for ${ticker}`);
      const dates = getDates();
      const encoded = rawData[metric] as (number | string)[];
      const data: { time: string; value: number }[] = [];
      let idx = 0;
      for (const item of encoded) {
        if (typeof item === "string" && item.startsWith("~")) {
          idx += parseInt(item.slice(1));
        } else {
          if (idx < dates.length) {
            data.push({ time: dates[idx], value: item as number });
          }
          idx++;
        }
      }
      return data;
    }
  }

  /** Align two time series on common dates */
  function alignSeries(a: { time: string; value: number }[], b: { time: string; value: number }[]): { dates: string[]; valuesA: number[]; valuesB: number[] } {
    const mapB = new Map(b.map(d => [d.time, d.value]));
    const dates: string[] = [];
    const valuesA: number[] = [];
    const valuesB: number[] = [];
    for (const pt of a) {
      const bVal = mapB.get(pt.time);
      if (bVal !== undefined) {
        dates.push(pt.time);
        valuesA.push(pt.value);
        valuesB.push(bVal);
      }
    }
    return { dates, valuesA, valuesB };
  }

  /** Compute log returns from a values array */
  function logReturns(values: number[]): number[] {
    const ret: number[] = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i] > 0 && values[i - 1] > 0) {
        ret.push(Math.log(values[i] / values[i - 1]));
      } else {
        ret.push(0);
      }
    }
    return ret;
  }

  /** Compute simple changes from a values array */
  function simpleChanges(values: number[]): number[] {
    const ret: number[] = [];
    for (let i = 1; i < values.length; i++) {
      ret.push(values[i] - values[i - 1]);
    }
    return ret;
  }

  /** Pearson correlation of two arrays */
  function pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i]; sumY += y[i];
      sumXY += x[i] * y[i]; sumXX += x[i] * x[i]; sumYY += y[i] * y[i];
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    const ssXX = sumXX - n * meanX * meanX;
    const ssYY = sumYY - n * meanY * meanY;
    const ssXY = sumXY - n * meanX * meanY;
    const denom = Math.sqrt(ssXX * ssYY);
    return denom === 0 ? 0 : ssXY / denom;
  }

  /** Autocorrelation of a series at lag k */
  function autocorrelation(values: number[], lag: number): number {
    const n = values.length;
    if (n <= lag) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += values[i];
    const mean = sum / n;
    let num = 0, denom = 0;
    for (let i = 0; i < n; i++) {
      denom += (values[i] - mean) ** 2;
      if (i >= lag) {
        num += (values[i] - mean) * (values[i - lag] - mean);
      }
    }
    return denom === 0 ? 0 : num / denom;
  }

  /** Bartlett standard error for testing autocorrelation significance */
  function bartlettSE(n: number): number {
    return 1 / Math.sqrt(n);
  }

  /** Adjust correlation for autocorrelation using the Quenouille (1953) / modified Chelton (1983) method.
   *  Effective sample size: n_eff = n * (1 - rho_a * rho_b) / (1 + rho_a * rho_b)
   *  where rho_a, rho_b are lag-1 autocorrelations of each series */
  function adjustedCorrelation(x: number[], y: number[], rawCorr: number): {
    adjustedCorr: number;
    effectiveN: number;
    tStat: number;
    pValue: number;
  } {
    const n = Math.min(x.length, y.length);
    const rhoA = autocorrelation(x, 1);
    const rhoB = autocorrelation(y, 1);
    const numer = 1 - rhoA * rhoB;
    const denom2 = 1 + rhoA * rhoB;
    const nEff = denom2 === 0 ? n : Math.max(3, Math.round(n * numer / denom2));

    // t-statistic: t = r * sqrt((n_eff - 2) / (1 - r^2))
    const r2 = rawCorr * rawCorr;
    const tStat = r2 >= 1 ? 0 : rawCorr * Math.sqrt((nEff - 2) / (1 - r2));
    // Approximate 2-sided p-value using normal for large n_eff
    const absT = Math.abs(tStat);
    const pValue = 2 * (1 - normalCDF(absT));

    return {
      adjustedCorr: rawCorr, // The correlation itself doesn't change, significance does
      effectiveN: nEff,
      tStat: Math.round(tStat * 1000) / 1000,
      pValue: Math.round(pValue * 10000) / 10000,
    };
  }

  /** Standard normal CDF approximation */
  function normalCDF(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p2 = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t2 = 1 / (1 + p2 * x);
    const y = 1 - ((((a5 * t2 + a4) * t2 + a3) * t2 + a2) * t2 + a1) * t2 * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }

  // ── Pairwise correlation endpoint ──
  // GET /api/correlation/pairwise?a=SPG:close&b=MACRO:DGS10&window=60&mode=returns
  app.get("/api/correlation/pairwise", async (req, res) => {
    const specA = req.query.a as string;
    const specB = req.query.b as string;
    const window2 = parseInt(req.query.window as string) || 60;
    const mode = (req.query.mode as string) || "returns"; // "returns" | "levels" | "changes"

    if (!specA || !specB) {
      return res.status(400).json({ error: "Query params a and b required (format: TICKER:metric or MACRO:SERIES_ID)" });
    }

    try {
      const dataA = await resolveSeriesData(specA);
      const dataB = await resolveSeriesData(specB);
      const aligned = alignSeries(dataA, dataB);

      if (aligned.dates.length < 10) {
        return res.json({ error: "Insufficient overlapping data", count: aligned.dates.length });
      }

      // Transform based on mode
      let transformedA: number[];
      let transformedB: number[];
      let transformDates: string[];

      if (mode === "returns") {
        transformedA = logReturns(aligned.valuesA);
        transformedB = logReturns(aligned.valuesB);
        transformDates = aligned.dates.slice(1);
      } else if (mode === "changes") {
        transformedA = simpleChanges(aligned.valuesA);
        transformedB = simpleChanges(aligned.valuesB);
        transformDates = aligned.dates.slice(1);
      } else {
        transformedA = aligned.valuesA;
        transformedB = aligned.valuesB;
        transformDates = aligned.dates;
      }

      // Full-sample correlation
      const fullCorr = pearsonCorrelation(transformedA, transformedB);

      // Autocorrelation-adjusted significance
      const adjusted = adjustedCorrelation(transformedA, transformedB, fullCorr);

      // Autocorrelation profiles (lags 1-20)
      const maxLag = 20;
      const acfA: { lag: number; value: number }[] = [];
      const acfB: { lag: number; value: number }[] = [];
      const se = bartlettSE(transformedA.length);
      for (let k = 1; k <= maxLag; k++) {
        acfA.push({ lag: k, value: Math.round(autocorrelation(transformedA, k) * 10000) / 10000 });
        acfB.push({ lag: k, value: Math.round(autocorrelation(transformedB, k) * 10000) / 10000 });
      }

      // Rolling correlation
      const rolling: { time: string; value: number }[] = [];
      for (let i = window2 - 1; i < transformedA.length; i++) {
        const sliceA = transformedA.slice(i - window2 + 1, i + 1);
        const sliceB = transformedB.slice(i - window2 + 1, i + 1);
        const corr = pearsonCorrelation(sliceA, sliceB);
        rolling.push({ time: transformDates[i], value: Math.round(corr * 10000) / 10000 });
      }

      // Rolling correlation at multiple windows for regime detection
      const windows = [30, 60, 120, 252];
      const multiWindowRolling: Record<number, { time: string; value: number }[]> = {};
      for (const w of windows) {
        const arr: { time: string; value: number }[] = [];
        for (let i = w - 1; i < transformedA.length; i++) {
          const sliceA = transformedA.slice(i - w + 1, i + 1);
          const sliceB = transformedB.slice(i - w + 1, i + 1);
          const corr = pearsonCorrelation(sliceA, sliceB);
          arr.push({ time: transformDates[i], value: Math.round(corr * 10000) / 10000 });
        }
        multiWindowRolling[w] = arr;
      }

      // Cross-correlation at different lags (-20 to +20)
      const crossCorr: { lag: number; value: number }[] = [];
      for (let lag = -20; lag <= 20; lag++) {
        let sliceA: number[], sliceB: number[];
        if (lag >= 0) {
          sliceA = transformedA.slice(lag);
          sliceB = transformedB.slice(0, transformedB.length - lag);
        } else {
          sliceA = transformedA.slice(0, transformedA.length + lag);
          sliceB = transformedB.slice(-lag);
        }
        const n = Math.min(sliceA.length, sliceB.length);
        if (n < 10) { crossCorr.push({ lag, value: 0 }); continue; }
        crossCorr.push({
          lag,
          value: Math.round(pearsonCorrelation(sliceA.slice(0, n), sliceB.slice(0, n)) * 10000) / 10000,
        });
      }

      // OLS regression stats
      const n = Math.min(transformedA.length, transformedB.length);
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      for (let i = 0; i < n; i++) {
        sumX += transformedB[i]; sumY += transformedA[i];
        sumXY += transformedB[i] * transformedA[i]; sumXX += transformedB[i] * transformedB[i];
      }
      const mX = sumX / n; const mY = sumY / n;
      const ssXX = sumXX - n * mX * mX;
      const ssXY2 = sumXY - n * mX * mY;
      const beta = ssXX === 0 ? 0 : ssXY2 / ssXX;
      const alpha = mY - beta * mX;
      const rSquared = fullCorr * fullCorr;

      // Scatter data for visualization
      const scatter: { x: number; y: number; date: string }[] = [];
      // Sample every Nth point for performance (max 500 points)
      const step = Math.max(1, Math.floor(n / 500));
      for (let i = 0; i < n; i += step) {
        scatter.push({ x: transformedB[i], y: transformedA[i], date: transformDates[i] });
      }

      // Level series for charting
      const levelsA = aligned.dates.map((d, i) => ({ time: d, value: aligned.valuesA[i] }));
      const levelsB = aligned.dates.map((d, i) => ({ time: d, value: aligned.valuesB[i] }));

      res.json({
        summary: {
          correlation: Math.round(fullCorr * 10000) / 10000,
          spearmanCorrelation: 0, // computed client-side in static mode
          rSquared: Math.round(rSquared * 10000) / 10000,
          beta: Math.round(beta * 10000) / 10000,
          alpha: Math.round(alpha * 100000) / 100000,
          observations: n,
          mode,
          autoCorrelationA: acfA[0]?.value || 0,
          autoCorrelationB: acfB[0]?.value || 0,
          effectiveN: adjusted.effectiveN,
          tStat: adjusted.tStat,
          pValue: adjusted.pValue,
        },
        rolling,
        rollingCI: [],
        rollingBeta: [],
        multiWindowRolling,
        crossCorrelation: crossCorr,
        acfA,
        acfB,
        scatter,
        levelsA,
        levelsB,
        diagnostics: {
          adfA: { stat: 0, pValue: 1, lags: 0, isStationary: false },
          adfB: { stat: 0, pValue: 1, lags: 0, isStationary: false },
          cointegration: (() => {
            // Engle-Granger test on log levels (requires positive values).
            // Only meaningful when both series are positive price-like levels.
            const vA = aligned.valuesA;
            const vB = aligned.valuesB;
            if (vA.length < 60) return null;
            const allPositive = vA.every(v => v > 0) && vB.every(v => v > 0);
            if (!allPositive) return null;
            const logA = vA.map(v => Math.log(v));
            const logB = vB.map(v => Math.log(v));
            const eg = engleGranger(logA, logB);
            return {
              hedgeRatio: Math.round(eg.hedgeRatio * 10000) / 10000,
              alpha: Math.round(eg.alpha * 10000) / 10000,
              adfStat: Math.round(eg.adfStat * 10000) / 10000,
              adfPValue: Math.round(eg.adfPValue * 10000) / 10000,
              ouHalfLife: isNaN(eg.ouHalfLife) || eg.ouHalfLife <= 0 || eg.ouHalfLife > 9999
                ? null
                : Math.round(eg.ouHalfLife * 10) / 10,
              hurstH: Math.round(eg.hurstH * 1000) / 1000,
              isCointegrated: eg.isCointegrated,
            };
          })(),
          fisherCI: { lower: -1, upper: 1 },
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute correlation" });
    }
  });

  // ── Correlation matrix endpoint ──
  // GET /api/correlation/matrix?series=SPG:close,O:close,MACRO:DGS10&mode=returns&window=252
  app.get("/api/correlation/matrix", async (req, res) => {
    const seriesParam = req.query.series as string;
    const mode = (req.query.mode as string) || "returns";
    const window2 = parseInt(req.query.window as string) || 252;

    if (!seriesParam) {
      return res.status(400).json({ error: "series query param required (comma-separated)" });
    }

    const specs = seriesParam.split(",").map(s => s.trim()).filter(Boolean);
    if (specs.length < 2 || specs.length > 30) {
      return res.status(400).json({ error: "Need 2-30 series for matrix" });
    }

    try {
      // Fetch all series
      const allData: { spec: string; data: { time: string; value: number }[] }[] = [];
      for (const spec of specs) {
        const data = await resolveSeriesData(spec);
        allData.push({ spec, data });
      }

      // Build date universe: dates common to ALL series
      const dateSets = allData.map(d => new Set(d.data.map(pt => pt.time)));
      let commonDates = Array.from(dateSets[0]);
      for (let i = 1; i < dateSets.length; i++) {
        commonDates = commonDates.filter(d => dateSets[i].has(d));
      }
      commonDates.sort();

      // Use only last `window` dates
      if (commonDates.length > window2) {
        commonDates = commonDates.slice(-window2);
      }

      // Build aligned value arrays
      const aligned: number[][] = [];
      for (const sd of allData) {
        const dateMap = new Map(sd.data.map(pt => [pt.time, pt.value]));
        aligned.push(commonDates.map(d => dateMap.get(d) || 0));
      }

      // Transform
      const transformed: number[][] = [];
      for (const vals of aligned) {
        if (mode === "returns") {
          transformed.push(logReturns(vals));
        } else if (mode === "changes") {
          transformed.push(simpleChanges(vals));
        } else {
          transformed.push(vals);
        }
      }

      // Compute NxN correlation matrix
      const matrix: number[][] = [];
      const pValues: number[][] = [];
      for (let i = 0; i < specs.length; i++) {
        const row: number[] = [];
        const pRow: number[] = [];
        for (let j = 0; j < specs.length; j++) {
          if (i === j) {
            row.push(1);
            pRow.push(0);
          } else {
            const corr = pearsonCorrelation(transformed[i], transformed[j]);
            const adj = adjustedCorrelation(transformed[i], transformed[j], corr);
            row.push(Math.round(corr * 10000) / 10000);
            pRow.push(adj.pValue);
          }
        }
        matrix.push(row);
        pValues.push(pRow);
      }

      res.json({
        labels: specs,
        matrix,
        pValues,
        observations: transformed[0]?.length || 0,
        dateRange: { from: commonDates[0], to: commonDates[commonDates.length - 1] },
        mode,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute correlation matrix" });
    }
  });

  // ── Workspace CRUD ────────────────────────────────────────────────────

  // List all workspaces (returns id, name, timestamps — not full state)
  app.get("/api/workspaces", (_req, res) => {
    try {
      const all = storage.listWorkspaces();
      // Strip state blob to keep listing lightweight
      res.json(all.map(w => ({ id: w.id, name: w.name, folder: w.folder ?? null, createdAt: w.createdAt, updatedAt: w.updatedAt })));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get a single workspace (full state)
  app.get("/api/workspaces/:id", (req, res) => {
    try {
      const ws = storage.getWorkspace(Number(req.params.id));
      if (!ws) return res.status(404).json({ error: "Workspace not found" });
      res.json(ws);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create a workspace
  app.post("/api/workspaces", (req, res) => {
    try {
      const { name, state, folder } = req.body;
      if (!name || !state) return res.status(400).json({ error: "name and state are required" });
      const now = new Date().toISOString();
      const ws = storage.createWorkspace({
        name,
        folder: folder || null,
        state: typeof state === "string" ? state : JSON.stringify(state),
        createdAt: now,
        updatedAt: now,
      });
      res.status(201).json({ id: ws.id, name: ws.name, folder: ws.folder ?? null, createdAt: ws.createdAt, updatedAt: ws.updatedAt });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update (overwrite) a workspace
  app.put("/api/workspaces/:id", (req, res) => {
    try {
      const { name, state, folder } = req.body;
      const updates: any = {};
      if (name) updates.name = name;
      if (state) updates.state = typeof state === "string" ? state : JSON.stringify(state);
      if (folder !== undefined) updates.folder = folder || null;
      const ws = storage.updateWorkspace(Number(req.params.id), updates);
      if (!ws) return res.status(404).json({ error: "Workspace not found" });
      res.json({ id: ws.id, name: ws.name, folder: ws.folder ?? null, createdAt: ws.createdAt, updatedAt: ws.updatedAt });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST-based update (deployment proxy blocks PUT method)
  app.post("/api/workspaces/:id/update", (req, res) => {
    try {
      const { name, state, folder } = req.body;
      const updates: any = {};
      if (name) updates.name = name;
      if (state) updates.state = typeof state === "string" ? state : JSON.stringify(state);
      if (folder !== undefined) updates.folder = folder || null;
      const ws = storage.updateWorkspace(Number(req.params.id), updates);
      if (!ws) return res.status(404).json({ error: "Workspace not found" });
      res.json({ id: ws.id, name: ws.name, folder: ws.folder ?? null, createdAt: ws.createdAt, updatedAt: ws.updatedAt });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Move workspace to a folder (or remove from folder with folder=null)
  app.post("/api/workspaces/:id/move", (req, res) => {
    try {
      const { folder } = req.body;
      const ws = storage.updateWorkspace(Number(req.params.id), { folder: folder || null, updatedAt: new Date().toISOString() });
      if (!ws) return res.status(404).json({ error: "Workspace not found" });
      res.json({ id: ws.id, name: ws.name, folder: ws.folder ?? null, createdAt: ws.createdAt, updatedAt: ws.updatedAt });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Rename a folder (bulk update all workspaces in that folder)
  app.post("/api/workspace-folders/rename", (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName) return res.status(400).json({ error: "oldName and newName are required" });
      const all = storage.listWorkspaces();
      let count = 0;
      for (const w of all) {
        if (w.folder === oldName) {
          storage.updateWorkspace(w.id, { folder: newName });
          count++;
        }
      }
      res.json({ ok: true, renamed: count });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete a folder (moves all workspaces in it to unfiled)
  app.post("/api/workspace-folders/delete", (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });
      const all = storage.listWorkspaces();
      let count = 0;
      for (const w of all) {
        if (w.folder === name) {
          storage.updateWorkspace(w.id, { folder: null });
          count++;
        }
      }
      res.json({ ok: true, unfiled: count });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete a workspace (keep DELETE for local dev, add POST fallback for proxy)
  app.delete("/api/workspaces/:id", (req, res) => {
    try {
      const ok = storage.deleteWorkspace(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Workspace not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST-based delete (deployment proxy blocks DELETE method)
  app.post("/api/workspaces/:id/delete", (req, res) => {
    try {
      const ok = storage.deleteWorkspace(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Workspace not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Custom Ranking Templates ──────────────────────────────────────────
  app.get("/api/ranking-templates", (_req, res) => {
    try {
      const templates = storage.listRankingTemplates();
      res.json(templates);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ranking-templates", (req, res) => {
    try {
      const { label, metrics, showRevisions, revMetric, metricWeights, metricDirections } = req.body;
      if (!label || !metrics || !Array.isArray(metrics) || metrics.length === 0) {
        return res.status(400).json({ error: "label and metrics[] are required" });
      }
      const template = storage.createRankingTemplate({
        label,
        metrics: JSON.stringify(metrics),
        showRevisions: !!showRevisions,
        revMetric: revMetric || null,
        metricWeights: metricWeights && typeof metricWeights === "object" ? JSON.stringify(metricWeights) : null,
        metricDirections: metricDirections && typeof metricDirections === "object" ? JSON.stringify(metricDirections) : null,
        createdAt: new Date().toISOString(),
      });
      res.json(template);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/ranking-templates/:id", (req, res) => {
    try {
      const ok = storage.deleteRankingTemplate(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Template not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST-based delete (deployment proxy blocks DELETE method)
  app.post("/api/ranking-templates/:id/delete", (req, res) => {
    try {
      const ok = storage.deleteRankingTemplate(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Template not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Custom Chart View Templates ──────────────────────────────────────
  app.get("/api/chart-view-templates", (_req, res) => {
    try {
      const templates = storage.listChartViewTemplates();
      res.json(templates);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/chart-view-templates", (req, res) => {
    try {
      const { label, metrics } = req.body;
      // `metrics` may be either:
      //   1. string[] — legacy plain-metric view
      //   2. { plain: string[], derived: PlottedSeries[] } — new shape that
      //      carries derived series (correlation/formula/pairs) snapshots
      //      alongside the plain metric list.
      const isLegacy = Array.isArray(metrics) && metrics.length > 0;
      const isStructured = metrics && typeof metrics === "object" && !Array.isArray(metrics)
        && Array.isArray(metrics.plain);
      if (!label || (!isLegacy && !isStructured)) {
        return res.status(400).json({ error: "label and metrics (array or {plain,derived}) are required" });
      }
      const template = storage.createChartViewTemplate({
        label,
        metrics: JSON.stringify(metrics),
        createdAt: new Date().toISOString(),
      });
      res.json(template);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/chart-view-templates/:id", (req, res) => {
    try {
      const ok = storage.deleteChartViewTemplate(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Template not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST-based delete (deployment proxy blocks DELETE method)
  app.post("/api/chart-view-templates/:id/delete", (req, res) => {
    try {
      const ok = storage.deleteChartViewTemplate(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Template not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Saved Screener Presets ──────────────────────────────────────────
  app.get("/api/screener-presets", (_req, res) => {
    try {
      const presets = storage.listScreenerPresets();
      res.json(presets);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/screener-presets", (req, res) => {
    try {
      const { label, conditions } = req.body;
      if (!label || !conditions) {
        return res.status(400).json({ error: "label and conditions are required" });
      }
      const preset = storage.createScreenerPreset({
        label,
        conditions: typeof conditions === "string" ? conditions : JSON.stringify(conditions),
        createdAt: new Date().toISOString(),
      });
      res.json(preset);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/screener-presets/:id", (req, res) => {
    try {
      const ok = storage.deleteScreenerPreset(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Preset not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST-based delete (deployment proxy blocks DELETE method)
  app.post("/api/screener-presets/:id/delete", (req, res) => {
    try {
      const ok = storage.deleteScreenerPreset(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Preset not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── MA Optimizer Presets ──────────────────────────────────────────────
  app.get("/api/ma-optimizer-presets", (_req, res) => {
    try {
      res.json(storage.listMAOptimizerPresets());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ma-optimizer-presets", (req, res) => {
    try {
      const { label, config } = req.body;
      if (!label || config === undefined) {
        return res.status(400).json({ error: "label and config are required" });
      }
      const preset = storage.createMAOptimizerPreset({
        label: String(label).slice(0, 200),
        config: typeof config === "string" ? config : JSON.stringify(config),
        createdAt: new Date().toISOString(),
      });
      res.json(preset);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/ma-optimizer-presets/:id", (req, res) => {
    try {
      const ok = storage.deleteMAOptimizerPreset(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Preset not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST-based delete (deployment proxy blocks DELETE)
  app.post("/api/ma-optimizer-presets/:id/delete", (req, res) => {
    try {
      const ok = storage.deleteMAOptimizerPreset(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Preset not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Custom Charts (persistent blank canvases) ──
  app.get("/api/custom-charts", (_req, res) => {
    try {
      res.json(storage.listCustomCharts());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/custom-charts/:id", (req, res) => {
    try {
      const chart = storage.getCustomChart(Number(req.params.id));
      if (!chart) return res.status(404).json({ error: "Chart not found" });
      res.json(chart);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/custom-charts", (req, res) => {
    try {
      const { name, state } = req.body;
      if (!name || state === undefined) return res.status(400).json({ error: "name and state are required" });
      const now = new Date().toISOString();
      const chart = storage.createCustomChart({
        name,
        state: typeof state === "string" ? state : JSON.stringify(state),
        createdAt: now,
        updatedAt: now,
      });
      res.json(chart);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/custom-charts/:id", (req, res) => {
    try {
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.state !== undefined) updates.state = typeof req.body.state === "string" ? req.body.state : JSON.stringify(req.body.state);
      const chart = storage.updateCustomChart(Number(req.params.id), updates);
      if (!chart) return res.status(404).json({ error: "Chart not found" });
      res.json(chart);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST fallback for PUT (proxy may not support PUT)
  app.post("/api/custom-charts/:id/update", (req, res) => {
    try {
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.state !== undefined) updates.state = typeof req.body.state === "string" ? req.body.state : JSON.stringify(req.body.state);
      const chart = storage.updateCustomChart(Number(req.params.id), updates);
      if (!chart) return res.status(404).json({ error: "Chart not found" });
      res.json(chart);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Rename
  app.post("/api/custom-charts/:id/rename", (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });
      const chart = storage.updateCustomChart(Number(req.params.id), { name });
      if (!chart) return res.status(404).json({ error: "Chart not found" });
      res.json(chart);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/custom-charts/:id", (req, res) => {
    try {
      const ok = storage.deleteCustomChart(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Chart not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/custom-charts/:id/delete", (req, res) => {
    try {
      const ok = storage.deleteCustomChart(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Chart not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Alerts / Watchlist ──
  app.get("/api/alerts", (_req, res) => {
    try {
      res.json(storage.listAlerts());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/alerts", (req, res) => {
    try {
      const { ticker, metric, operator, threshold, label } = req.body;
      if (!ticker || !metric || !operator || threshold === undefined) {
        return res.status(400).json({ error: "ticker, metric, operator, and threshold are required" });
      }
      // MC-L2: store threshold as a number (REAL column), not a string.
      const thresholdNum = typeof threshold === "number" ? threshold : parseFloat(threshold);
      if (!Number.isFinite(thresholdNum)) {
        return res.status(400).json({ error: "threshold must be a finite number" });
      }
      const now = new Date().toISOString();
      const alert = storage.createAlert({
        ticker: ticker.toUpperCase(),
        metric,
        operator,
        threshold: thresholdNum,
        label: label || null,
        enabled: true,
        triggered: false,
        triggeredAt: null,
        triggeredValue: null,
        createdAt: now,
        updatedAt: now,
      });
      res.json(alert);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // MC-L2: shared body → update mapper. threshold/triggeredValue stored as REAL.
  function mapAlertUpdates(body: any): { updates: any; error?: string } {
    const updates: any = {};
    if (body.ticker !== undefined) updates.ticker = body.ticker.toUpperCase();
    if (body.metric !== undefined) updates.metric = body.metric;
    if (body.operator !== undefined) updates.operator = body.operator;
    if (body.threshold !== undefined) {
      const t = typeof body.threshold === "number" ? body.threshold : parseFloat(body.threshold);
      if (!Number.isFinite(t)) return { updates, error: "threshold must be a finite number" };
      updates.threshold = t;
    }
    if (body.label !== undefined) updates.label = body.label;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.triggered !== undefined) updates.triggered = body.triggered;
    if (body.triggeredAt !== undefined) updates.triggeredAt = body.triggeredAt;
    if (body.triggeredValue !== undefined) {
      const v = body.triggeredValue;
      if (v === null) updates.triggeredValue = null;
      else {
        const n = typeof v === "number" ? v : parseFloat(v);
        updates.triggeredValue = Number.isFinite(n) ? n : null;
      }
    }
    return { updates };
  }

  app.put("/api/alerts/:id", (req, res) => {
    try {
      const { updates, error } = mapAlertUpdates(req.body);
      if (error) return res.status(400).json({ error });
      const alert = storage.updateAlert(Number(req.params.id), updates);
      if (!alert) return res.status(404).json({ error: "Alert not found" });
      res.json(alert);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST fallback for PUT (deployment proxy may block PUT)
  app.post("/api/alerts/:id/update", (req, res) => {
    try {
      const { updates, error } = mapAlertUpdates(req.body);
      if (error) return res.status(400).json({ error });
      const alert = storage.updateAlert(Number(req.params.id), updates);
      if (!alert) return res.status(404).json({ error: "Alert not found" });
      res.json(alert);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/alerts/:id", (req, res) => {
    try {
      const ok = storage.deleteAlert(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Alert not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/alerts/:id/delete", (req, res) => {
    try {
      const ok = storage.deleteAlert(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "Alert not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Alert evaluation: check all enabled alerts against current data ──
  // Concurrent calls (e.g. cron + manual button click) must not double-trigger
  // a latched alert. We serialize evaluations with a process-wide mutex so the
  // listAlerts → updateAlert sequence runs atomically per request.
  let alertEvalInFlight: Promise<void> = Promise.resolve();
  app.post("/api/alerts/evaluate", async (_req, res) => {
    // Chain onto the in-flight evaluation — next caller waits for current one.
    let release: () => void = () => {};
    const myTurn = new Promise<void>((resolve) => { release = resolve; });
    const wait = alertEvalInFlight;
    alertEvalInFlight = myTurn;
    await wait;
    try {
      const allAlerts = storage.listAlerts();
      const enabled = allAlerts.filter((a) => a.enabled);
      if (enabled.length === 0) {
        res.json({ triggered: [], checked: 0 });
        return;
      }

      const triggered: { id: number; ticker: string; metric: string; operator: string; threshold: string; currentValue: number; label: string | null }[] = [];

      for (const alert of enabled) {
        try {
          // Re-read this alert immediately before the latch check so we
          // never act on a stale snapshot from a concurrent evaluation.
          const fresh = storage.listAlerts().find((a) => a.id === alert.id);
          if (!fresh || !fresh.enabled) continue;

          const filePath = path.join(DATA_DIR, "tickers", `${fresh.ticker}.json`);
          if (!fs.existsSync(filePath)) continue;

          const rawData = readJSON(filePath);
          const encoded = rawData[fresh.metric];
          if (!encoded) continue;

          // Decode run-length nulls
          const arr: (number | null)[] = [];
          for (const item of encoded as (number | string)[]) {
            if (typeof item === "string" && item.startsWith("~")) {
              const count = parseInt(item.slice(1));
              for (let i = 0; i < count; i++) arr.push(null);
            } else {
              arr.push(item as number);
            }
          }

          // Get latest non-null value
          let latestVal: number | null = null;
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i] !== null) { latestVal = arr[i]; break; }
          }
          if (latestVal === null) continue;

          // MC-L2: threshold is REAL in storage but normalize defensively in case
          // legacy rows still come back as strings before the migration completes.
          const threshold = typeof fresh.threshold === "number"
            ? fresh.threshold
            : parseFloat(fresh.threshold as any);
          if (!Number.isFinite(threshold)) continue;

          let passes = false;
          switch (fresh.operator) {
            case ">": passes = latestVal > threshold; break;
            case "<": passes = latestVal < threshold; break;
            case ">=": passes = latestVal >= threshold; break;
            case "<=": passes = latestVal <= threshold; break;
          }

          if (passes && !fresh.triggered) {
            // Mark as triggered (mutex guarantees no duplicate fire across
            // overlapping requests).
            storage.updateAlert(fresh.id, {
              triggered: true,
              triggeredAt: new Date().toISOString(),
              triggeredValue: latestVal,
            });
            triggered.push({
              id: fresh.id,
              ticker: fresh.ticker,
              metric: fresh.metric,
              operator: fresh.operator,
              threshold: fresh.threshold,
              currentValue: latestVal,
              label: fresh.label,
            });
          } else if (!passes && fresh.triggered) {
            // Reset trigger so it can fire again if condition re-occurs
            storage.updateAlert(fresh.id, { triggered: false });
          }
        } catch {
          // Skip this alert if its ticker data can't be read
        }
      }

      res.json({ triggered, checked: enabled.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      release();
    }
  });

  // ── Annotations (chart notes pinned to dates) ──
  app.get("/api/annotations", (req, res) => {
    try {
      const ticker = req.query.ticker as string | undefined;
      res.json(storage.listAnnotations(ticker));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/annotations", (req, res) => {
    try {
      const { ticker, date, text, color } = req.body;
      if (!ticker || !date || !text) {
        return res.status(400).json({ error: "ticker, date, and text are required" });
      }
      const now = new Date().toISOString();
      const annotation = storage.createAnnotation({
        ticker,
        date,
        text,
        color: color || "#f59e0b",
        createdAt: now,
        updatedAt: now,
      });
      res.json(annotation);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/annotations/:id/update", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = storage.updateAnnotation(id, req.body);
      if (!updated) return res.status(404).json({ error: "Annotation not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/annotations/:id/delete", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = storage.deleteAnnotation(id);
      if (!ok) return res.status(404).json({ error: "Annotation not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/annotations/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = storage.deleteAnnotation(id);
      if (!ok) return res.status(404).json({ error: "Annotation not found" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Server-side Excel parsing for large files ──
  // The browser can't handle re-reading 100MB+ files multiple times,
  // so we parse on the server where memory is more manageable.

  // Multer config for file uploads (must be defined before endpoints that use it)
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const uploadStorage = multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `workbook-${Date.now()}${ext}`);
    },
  });

  const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if ([".xlsb", ".xlsx", ".xlsm", ".xls"].includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error("Only .xlsb, .xlsx, .xlsm, and .xls files are accepted"));
      }
    },
  });

  // Helper: wraps multer middleware with error handling to prevent aborted uploads from crashing the server
  function safeUploadSingle(fieldName: string) {
    return (req: any, res: any, next: any) => {
      const mw = upload.single(fieldName);
      mw(req, res, (err: any) => {
        if (err) {
          const status = err.code === "LIMIT_FILE_SIZE" ? 413 : err.code === "ECONNABORTED" || err.message?.includes("aborted") ? 499 : 400;
          console.error(`[upload] Multer error on ${fieldName}: ${err.message}`);
          if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
          if (!res.headersSent) { return res.status(status).json({ error: `Upload failed: ${err.message}` }); }
          return;
        }
        next();
      });
    };
  }

  const ROW_MAP: Record<number, string> = {
    9: "close", 10: "open", 11: "low", 12: "high",
    21: "EPS FY1", 22: "EPS FY2", 23: "EBITDA FY1", 24: "EBITDA FY2",
    25: "FFO FY1", 26: "FFO FY2", 27: "AFFO FY1", 28: "AFFO FY2",
    29: "Sales FY1", 30: "Sales FY2",
    37: "EPS LTM", 38: "Sales LTM", 39: "EBITDA LTM", 40: "FFO LTM", 41: "AFFO LTM",
    42: "EPS FY0", 47: "FFO FY0", 48: "AFFO FY0",
    49: "Dividend", 50: "Enterprise Value", 51: "52wk High", 52: "52wk Low",
    66: "1Y Price Chg%", 67: "6M Price Chg%", 68: "3M Price Chg%", 69: "1M Price Chg%",
    70: "Short Interest%", 71: "Buy Ratings", 72: "Hold Ratings", 74: "Sell Ratings",
    76: "Bull%", 77: "Bear%",
    78: "FY1 EPS Growth", 79: "FY2 EPS Growth",
    86: "FY1 FFO Growth", 87: "FY2 FFO Growth", 88: "FY1 AFFO Growth", 89: "FY2 AFFO Growth",
    92: "% off 52wk High", 93: "% off 52wk Low",
    95: "P/E LTM", 96: "P/E FY2", 97: "P/S LTM", 98: "P/S FY2",
    101: "EV/EBITDA LTM", 102: "EV/EBITDA FY2",
    109: "P/FFO LTM", 110: "P/FFO FY2", 111: "P/AFFO LTM", 112: "P/AFFO FY2",
    113: "FFO Yield LTM", 114: "FFO Yield FY2", 115: "AFFO Yield LTM", 116: "AFFO Yield FY2",
    127: "Dividend Yield",
  };

  function serverParseDate(val: unknown): string | null {
    if (val == null) return null;
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, "0");
      const d = String(val.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const s = String(val).trim();
    if (!s) return null;
    if (typeof val === "number" && val > 30000 && val < 60000) {
      const jsDate = XLSX.SSF.parse_date_code(val);
      if (jsDate) {
        return `${jsDate.y}-${String(jsDate.m).padStart(2, "0")}-${String(jsDate.d).padStart(2, "0")}`;
      }
    }
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[1].padStart(2, "0")}-${m1[2].padStart(2, "0")}`;
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) return s;
    return null;
  }

  function serverRunLengthEncode(values: (number | null)[]): (number | string)[] {
    const encoded: (number | string)[] = [];
    let nullCount = 0;
    for (const v of values) {
      if (v === null || v === undefined) { nullCount++; }
      else {
        if (nullCount > 0) { encoded.push(`~${nullCount}`); nullCount = 0; }
        encoded.push(typeof v === "number" ? Math.round(v * 10000) / 10000 : v);
      }
    }
    if (nullCount > 0) encoded.push(`~${nullCount}`);
    return encoded;
  }

  function serverCleanNumeric(v: unknown): number | null {
    if (v == null || v === "" || v === " " || v === false) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function serverParseExcel(filePath: string) {
    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true, cellNF: false, cellText: false });
    const sheetNames = wb.SheetNames;
    const mktdataSheets = sheetNames.filter((s: string) => s.toLowerCase().includes("_mktdata"));
    const tickerlistSheetName = sheetNames.find(
      (s: string) => s.toLowerCase() === "tickerlist" || s.toLowerCase() === "ticker list"
    );

    let allDates: string[] = [];
    const tickersMap: Record<string, { ticker: string; dates: number; metrics: string[] }> = {};
    const tickerData: Record<string, Record<string, (number | string)[]>> = {};
    let tickerMeta: Record<string, any> = {};
    const events: Record<string, Record<string, string[]>> = {};

    // Parse mktdata sheets
    for (const sheetName of mktdataSheets) {
      const ticker = sheetName.replace(/-US_mktdata/i, "").replace(/_mktdata/i, "").trim();
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      const dateRowIdx = 7;
      if (aoa.length <= dateRowIdx) continue;
      const dateRow = aoa[dateRowIdx];
      const dates: string[] = [];
      for (let c = 1; c < dateRow.length; c++) {
        const d = serverParseDate(dateRow[c]);
        if (d) dates.push(d); else break;
      }
      if (dates.length === 0) continue;
      if (dates.length > allDates.length) allDates = dates;

      const data: Record<string, (number | string)[]> = {};
      const metrics: string[] = [];
      for (const [rowNumStr, metricName] of Object.entries(ROW_MAP)) {
        const rowIdx = parseInt(rowNumStr) - 1;
        if (rowIdx >= aoa.length) continue;
        const row = aoa[rowIdx];
        if (!row) continue;
        const values: (number | null)[] = [];
        for (let c = 1; c <= dates.length; c++) {
          values.push(serverCleanNumeric(c < row.length ? row[c] : null));
        }
        if (values.some(v => v !== null)) {
          data[metricName] = serverRunLengthEncode(values);
          metrics.push(metricName);
        }
      }
      tickerData[ticker] = data;
      tickersMap[ticker] = { ticker, dates: dates.length, metrics };
    }

    // Parse Tickerlist
    if (tickerlistSheetName && wb.Sheets[tickerlistSheetName]) {
      const tlAoa: unknown[][] = XLSX.utils.sheet_to_json(
        wb.Sheets[tickerlistSheetName], { header: 1, raw: true, defval: null }
      );
      for (let r = 1; r < tlAoa.length; r++) {
        const row = tlAoa[r] as unknown[];
        if (!row || !row[0]) continue;
        const rawTicker = String(row[0]).replace("-US", "").trim();
        tickerMeta[rawTicker] = {
          ticker: rawTicker,
          name: String(row[1] || "").trim(),
          economy: String(row[2] || "").trim(),
          sector: String(row[3] || "").trim(),
          subsector: String(row[4] || "").trim(),
          industryGroup: String(row[5] || "").trim(),
          industry: String(row[6] || "").trim(),
          subindustry: String(row[7] || "Other").trim(),
        };
      }
    }

    // Parse event sheets
    for (const [name, key] of [["Ex dividend dates", "ex_dividend"], ["Earnings report dates", "earnings"]] as const) {
      const foundName = sheetNames.find((s: string) => s.toLowerCase() === name.toLowerCase());
      if (foundName && wb.Sheets[foundName]) {
        const evAoa: unknown[][] = XLSX.utils.sheet_to_json(
          wb.Sheets[foundName], { header: 1, raw: true, defval: null }
        );
        for (let r = 1; r < evAoa.length; r++) {
          const row = evAoa[r] as unknown[];
          if (!row || !row[0]) continue;
          const ticker = String(row[0]).replace("-US^", "").replace("-US", "").trim();
          const datesList: string[] = [];
          for (let c = 1; c < row.length; c++) {
            const d = serverParseDate(row[c]);
            if (d) datesList.push(d);
          }
          if (!events[ticker]) events[ticker] = {};
          events[ticker][key] = datesList;
        }
      }
    }

    // Build tickers array
    const tickers = Object.values(tickersMap).map(t => {
      const meta = tickerMeta[t.ticker] || {
        ticker: t.ticker, name: t.ticker, economy: "", sector: "",
        subsector: "", industryGroup: "", industry: "Other", subindustry: "Other",
      };
      return { ...meta, dates: t.dates, metrics: t.metrics };
    }).sort((a: any, b: any) => a.ticker.localeCompare(b.ticker));

    return { tickers, dates: allDates, events, tickerData };
  }

  // ── Async background job system for workbook uploads ──
  // Allows client to submit upload, get job ID immediately, and poll for progress.
  // The Python parse runs in the background — client can navigate freely.
  interface ParseJob {
    id: string;
    status: "uploading" | "parsing" | "writing" | "complete" | "error";
    progress: { current: number; total: number; ticker: string } | null;
    result: { tickers: number; dates: number; events: number; workbookName: string } | null;
    /** For merge-preview jobs: preview data with conflicts */
    mergePreview?: {
      newTickers: string[];
      conflicts: string[];
      totalNew: number;
      totalExisting: number;
      tempPath: string;
    } | null;
    error: string | null;
    createdAt: number;
  }
  const parseJobs = new Map<string, ParseJob>();

  // Clean up old jobs (keep last 10 minutes)
  function cleanOldJobs() {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, job] of parseJobs) {
      if (job.createdAt < cutoff && (job.status === "complete" || job.status === "error")) {
        parseJobs.delete(id);
      }
    }
  }

  // ── Periodic temp-file cleanup ──
  // Remove orphaned workbook-* files and parse-* dirs older than 1 hour
  function cleanUploadsDir() {
    try {
      const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
      const entries = fs.readdirSync(uploadsDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(uploadsDir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs < cutoff) {
            if (entry.isDirectory() && (entry.name.startsWith("parse-") || entry.name.startsWith("temp-"))) {
              fs.rmSync(fullPath, { recursive: true, force: true });
              console.log(`[cleanup] Removed stale temp dir: ${entry.name}`);
            } else if (entry.isFile() && entry.name.startsWith("workbook-")) {
              fs.unlinkSync(fullPath);
              console.log(`[cleanup] Removed stale upload: ${entry.name}`);
            }
          }
        } catch { /* skip individual entry errors */ }
      }
    } catch { /* uploads dir may not exist yet */ }
  }
  // Run cleanup every 15 minutes
  setInterval(cleanUploadsDir, 15 * 60 * 1000);
  // Also run once at startup
  cleanUploadsDir();

  // ── Sequential batch upload: one file at a time to avoid browser OOM ──
  // Client creates a batch job, then uploads each file individually.
  // This keeps browser memory constant (only one file in memory at a time).

  // Step 1: Create a batch job (no files yet)
  app.post("/api/data/batch-job", express.json(), (req, res) => {
    cleanOldJobs();
    const { workbookNames, mergeMode, batchTotal } = req.body;
    if (!workbookNames || !Array.isArray(workbookNames) || workbookNames.length === 0) {
      return res.status(400).json({ error: "workbookNames required" });
    }

    const jobId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job: ParseJob = {
      id: jobId,
      status: "uploading",
      progress: null,
      result: null,
      error: null,
      createdAt: Date.now(),
    };
    (job as any).batchTotal = batchTotal || workbookNames.length;
    (job as any).batchCurrent = 0;
    (job as any).batchWorkbooks = workbookNames;
    (job as any).batchResults = [] as { workbookName: string; tickers: number; status: string }[];
    (job as any).mergeMode = mergeMode || "merge";
    (job as any).filesReceived = 0;
    (job as any).filePaths = [] as { path: string; originalname: string; size: number }[];
    parseJobs.set(jobId, job);

    console.log(`[batch-job] Created ${jobId} for ${workbookNames.length} files, mode=${mergeMode}`);
    res.json({ ok: true, jobId, workbookNames, batchTotal: workbookNames.length });
  });

  // Step 2: Upload a single file to an existing batch job
  app.post("/api/data/batch-job/:id/file", safeUploadSingle("workbook"), (req, res) => {
    const job = parseJobs.get(req.params.id);
    if (!job) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
      return res.status(404).json({ error: "Batch job not found" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    // Validate the file was fully received
    try {
      const stat = fs.statSync(req.file.path);
      if (stat.size === 0) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({ error: `File ${req.file.originalname} is empty` });
      }
    } catch (_) {
      return res.status(400).json({ error: `File ${req.file.originalname} failed to save` });
    }

    (job as any).filePaths.push({
      path: req.file.path,
      originalname: req.file.originalname,
      size: req.file.size,
    });
    (job as any).filesReceived++;
    console.log(`[batch-job ${req.params.id}] Received file ${(job as any).filesReceived}/${(job as any).batchTotal}: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`);

    const allReceived = (job as any).filesReceived >= (job as any).batchTotal;
    res.json({
      ok: true,
      filesReceived: (job as any).filesReceived,
      batchTotal: (job as any).batchTotal,
      allReceived,
    });

    // Auto-start processing when all files are received
    if (allReceived) {
      startBatchProcessing(job);
    }
  });

  // Step 3 (optional): Explicitly start processing (in case auto-start didn't trigger)
  app.post("/api/data/batch-job/:id/start", (req, res) => {
    const job = parseJobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Batch job not found" });
    }
    if (job.status === "parsing" || job.status === "complete") {
      return res.json({ ok: true, status: job.status });
    }
    startBatchProcessing(job);
    res.json({ ok: true, status: "parsing" });
  });

  function startBatchProcessing(job: ParseJob) {
    const files = (job as any).filePaths as { path: string; originalname: string; size: number }[];
    const mergeOrReplace = (job as any).mergeMode || "merge";
    const scriptPath = path.join(process.cwd(), "scripts", "parse-workbook.py");
    const dataDir = path.join(process.cwd(), "data");
    const jobId = job.id;

    job.status = "parsing";
    console.log(`[batch-job ${jobId}] Starting processing of ${files.length} files...`);

    (async () => {
      try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const tickerDir = path.join(dataDir, "tickers");
        if (!fs.existsSync(tickerDir)) fs.mkdirSync(tickerDir, { recursive: true });

        let isFirstFile = true;
        let totalTickersIngested = 0;
        let totalDates = 0;
        let totalEvents = 0;

        for (let fi = 0; fi < files.length; fi++) {
          const file = files[fi];
          (job as any).batchCurrent = fi + 1;
          job.progress = { current: fi + 1, total: files.length, ticker: file.originalname };

          if (!fs.existsSync(file.path)) {
            console.error(`[batch-job ${jobId}] File ${file.originalname} not found at ${file.path}, skipping`);
            (job as any).batchResults.push({ workbookName: file.originalname, tickers: 0, status: "error: file not found" });
            continue;
          }

          const effectiveMode = (isFirstFile && mergeOrReplace === "replace") ? "replace" : "merge";

          try {
            if (effectiveMode === "replace" && isFirstFile) {
              for (const f of fs.readdirSync(tickerDir)) {
                fs.unlinkSync(path.join(tickerDir, f));
              }
              activeParseOutputDir = dataDir;
              const result = await runPythonParser(scriptPath, file.path, dataDir);

              const sources: any = {};
              const ts = new Date().toISOString();
              for (const t of result.tickers) {
                sources[t.ticker] = {
                  workbook: file.originalname,
                  uploadedAt: ts,
                  dates: t.dates,
                  metrics: t.metrics?.length || 0,
                  fileSize: file.size,
                };
              }
              fs.writeFileSync(path.join(dataDir, "sources.json"), JSON.stringify(sources, null, 2));
              totalTickersIngested = result.tickers.length;
              totalDates = result.dates.length;
              totalEvents = Object.keys(result.events).length;
              (job as any).batchResults.push({ workbookName: file.originalname, tickers: result.tickers.length, status: "ok" });
            } else {
              const tempDir = path.join(process.cwd(), "uploads", `parse-batch-${Date.now()}-${fi}`);
              fs.mkdirSync(tempDir, { recursive: true });

              activeParseOutputDir = tempDir;
              const result = await runPythonParser(scriptPath, file.path, tempDir);

              const tempTickerDir = path.join(tempDir, "tickers");
              for (const t of result.tickers) {
                const src = path.join(tempTickerDir, `${t.ticker}.json`);
                const dst = path.join(tickerDir, `${t.ticker}.json`);
                if (fs.existsSync(src)) {
                  fs.copyFileSync(src, dst);
                }
              }

              let existingTickers: any[] = [];
              let existingDates: string[] = [];
              let existingEvents: any = {};
              let existingSources: any = {};
              try { existingTickers = readJSON(path.join(dataDir, "tickers.json")); } catch (_) {}
              try { existingDates = readJSON(path.join(dataDir, "dates.json")); } catch (_) {}
              try { existingEvents = readJSON(path.join(dataDir, "events.json")); } catch (_) {}
              try { existingSources = readJSON(path.join(dataDir, "sources.json")); } catch (_) {}

              const existingTickerSet = new Set(existingTickers.map((t: any) => t.ticker));
              for (const t of result.tickers) {
                if (!existingTickerSet.has(t.ticker)) {
                  existingTickers.push(t);
                } else {
                  const idx = existingTickers.findIndex((et: any) => et.ticker === t.ticker);
                  if (idx >= 0) existingTickers[idx] = t;
                }
              }
              existingTickers.sort((a: any, b: any) => a.ticker.localeCompare(b.ticker));

              const dateSet = new Set([...existingDates, ...result.dates]);
              const mergedDates = Array.from(dateSet).sort();

              for (const [ticker, evts] of Object.entries(result.events) as [string, any][]) {
                if (!existingEvents[ticker]) existingEvents[ticker] = {};
                for (const [key, vals] of Object.entries(evts) as [string, any][]) {
                  existingEvents[ticker][key] = vals;
                }
              }

              fs.writeFileSync(path.join(dataDir, "tickers.json"), JSON.stringify(existingTickers, null, 2));
              fs.writeFileSync(path.join(dataDir, "dates.json"), JSON.stringify(mergedDates));
              fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(existingEvents, null, 2));

              const ts = new Date().toISOString();
              for (const t of result.tickers) {
                existingSources[t.ticker] = {
                  workbook: file.originalname,
                  uploadedAt: ts,
                  dates: t.dates,
                  metrics: t.metrics?.length || 0,
                  fileSize: file.size,
                };
              }
              fs.writeFileSync(path.join(dataDir, "sources.json"), JSON.stringify(existingSources, null, 2));

              try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

              totalTickersIngested = existingTickers.length;
              totalDates = mergedDates.length;
              totalEvents = Object.keys(existingEvents).length;
              (job as any).batchResults.push({ workbookName: file.originalname, tickers: result.tickers.length, status: "ok" });
            }
          } catch (fileErr: any) {
            console.error(`[batch-job ${jobId}] Error parsing ${file.originalname}:`, fileErr);
            (job as any).batchResults.push({ workbookName: file.originalname, tickers: 0, status: `error: ${fileErr.message}` });
          } finally {
            try { fs.unlinkSync(file.path); } catch (_) {}
          }

          isFirstFile = false;
        }

        datesCache = null;
        job.status = "complete";
        job.result = {
          tickers: totalTickersIngested,
          dates: totalDates,
          events: totalEvents,
          workbookName: (job as any).batchWorkbooks.join(", "),
        };
      } catch (e: any) {
        console.error(`[batch-job ${jobId}] Error:`, e);
        job.status = "error";
        job.error = e.message;
        for (const file of files) {
          try { fs.unlinkSync(file.path); } catch (_) {}
        }
      }
    })();
  }

  // Submit a background parse+ingest job (single file)
  // Wrapped with multer error handling to gracefully handle aborted uploads.
  app.post("/api/data/server-parse-async", (req, res, next) => {
    const multerSingle = upload.single("workbook");
    multerSingle(req, res, (err: any) => {
      if (err) {
        const status = err.code === "LIMIT_FILE_SIZE" ? 413 : err.code === "ECONNABORTED" || err.message?.includes("aborted") ? 499 : 400;
        console.error(`[single-upload] Multer error: ${err.message}`);
        if (req.file) {
          try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        if (!res.headersSent) {
          return res.status(status).json({ error: `Upload failed: ${err.message}` });
        }
        return;
      }
      handleSingleUpload(req, res);
    });
  });

  function handleSingleUpload(req: any, res: any) {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    cleanOldJobs();

    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const uploadedPath = req.file.path;
    const mergeOrReplace = req.body?.mergeMode || "replace";
    const workbookName = req.file.originalname;
    const fileSize = req.file.size;
    const scriptPath = path.join(process.cwd(), "scripts", "parse-workbook.py");
    const dataDir = path.join(process.cwd(), "data");

    const job: ParseJob = {
      id: jobId,
      status: "parsing",
      progress: null,
      result: null,
      error: null,
      createdAt: Date.now(),
    };
    parseJobs.set(jobId, job);

    // Return job ID immediately — client can poll /api/data/job/:id
    res.json({ ok: true, jobId, workbookName });

    // Run the parse+ingest in the background
    (async () => {
      try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const tickerDir = path.join(dataDir, "tickers");
        if (!fs.existsSync(tickerDir)) fs.mkdirSync(tickerDir, { recursive: true });

        if (mergeOrReplace === "replace") {
          // Wipe existing ticker files
          for (const f of fs.readdirSync(tickerDir)) {
            fs.unlinkSync(path.join(tickerDir, f));
          }

          // Python writes directly to data/
          activeParseOutputDir = dataDir;
          const result = await runPythonParser(scriptPath, uploadedPath, dataDir);

          job.status = "writing";

          // Write sources.json
          const sources: any = {};
          const ts = new Date().toISOString();
          for (const t of result.tickers) {
            sources[t.ticker] = {
              workbook: workbookName,
              uploadedAt: ts,
              dates: t.dates,
              metrics: t.metrics?.length || 0,
              fileSize,
            };
          }
          fs.writeFileSync(path.join(dataDir, "sources.json"), JSON.stringify(sources, null, 2));

          datesCache = null;
          job.status = "complete";
          job.result = {
            tickers: result.tickers.length,
            dates: result.dates.length,
            events: Object.keys(result.events).length,
            workbookName,
          };
        } else if (mergeOrReplace === "merge-preview") {
          // Merge preview mode — parse to temp, return preview data with conflicts
          // Does NOT apply the merge — the client will call /api/data/server-merge-apply later
          const tempDir = path.join(process.cwd(), "uploads", `parse-${Date.now()}`);
          fs.mkdirSync(tempDir, { recursive: true });

          activeParseOutputDir = tempDir;
          const result = await runPythonParser(scriptPath, uploadedPath, tempDir);

          job.status = "writing";

          // Determine conflicts with existing tickers
          let existingTickers: any[] = [];
          try { existingTickers = readJSON(path.join(dataDir, "tickers.json")); } catch (_) {}
          const existingTickerSet = new Set(existingTickers.map((t: any) => t.ticker));

          const newTickers = result.tickers.filter((t: any) => !existingTickerSet.has(t.ticker)).map((t: any) => t.ticker);
          const conflicts = result.tickers.filter((t: any) => existingTickerSet.has(t.ticker)).map((t: any) => t.ticker);

          job.mergePreview = {
            newTickers,
            conflicts,
            totalNew: newTickers.length,
            totalExisting: existingTickers.length,
            tempPath: tempDir,
          };

          job.status = "complete";
          job.result = {
            tickers: result.tickers.length,
            dates: result.dates.length,
            events: Object.keys(result.events).length,
            workbookName,
          };
        } else {
          // Merge mode — parse to temp, then selectively copy
          const tempDir = path.join(process.cwd(), "uploads", `parse-${Date.now()}`);
          fs.mkdirSync(tempDir, { recursive: true });

          activeParseOutputDir = tempDir;
          const result = await runPythonParser(scriptPath, uploadedPath, tempDir);

          job.status = "writing";

          // Copy all ticker files from temp to data/tickers/ (merge = add all new)
          const tempTickerDir = path.join(tempDir, "tickers");
          for (const t of result.tickers) {
            const src = path.join(tempTickerDir, `${t.ticker}.json`);
            const dst = path.join(tickerDir, `${t.ticker}.json`);
            if (fs.existsSync(src)) {
              fs.copyFileSync(src, dst);
            }
          }

          // Merge metadata
          let existingTickers: any[] = [];
          let existingDates: string[] = [];
          let existingEvents: any = {};
          let existingSources: any = {};
          try { existingTickers = readJSON(path.join(dataDir, "tickers.json")); } catch (_) {}
          try { existingDates = readJSON(path.join(dataDir, "dates.json")); } catch (_) {}
          try { existingEvents = readJSON(path.join(dataDir, "events.json")); } catch (_) {}
          try { existingSources = readJSON(path.join(dataDir, "sources.json")); } catch (_) {}

          const existingTickerSet = new Set(existingTickers.map((t: any) => t.ticker));
          for (const t of result.tickers) {
            if (!existingTickerSet.has(t.ticker)) {
              existingTickers.push(t);
            } else {
              const idx = existingTickers.findIndex((et: any) => et.ticker === t.ticker);
              if (idx >= 0) existingTickers[idx] = t;
            }
          }
          existingTickers.sort((a: any, b: any) => a.ticker.localeCompare(b.ticker));

          const dateSet = new Set([...existingDates, ...result.dates]);
          const mergedDates = Array.from(dateSet).sort();

          for (const [ticker, evts] of Object.entries(result.events) as [string, any][]) {
            if (!existingEvents[ticker]) existingEvents[ticker] = {};
            for (const [key, vals] of Object.entries(evts) as [string, any][]) {
              existingEvents[ticker][key] = vals;
            }
          }

          fs.writeFileSync(path.join(dataDir, "tickers.json"), JSON.stringify(existingTickers, null, 2));
          fs.writeFileSync(path.join(dataDir, "dates.json"), JSON.stringify(mergedDates));
          fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(existingEvents, null, 2));

          const ts = new Date().toISOString();
          for (const t of result.tickers) {
            existingSources[t.ticker] = {
              workbook: workbookName,
              uploadedAt: ts,
              dates: t.dates,
              metrics: t.metrics?.length || 0,
              fileSize,
            };
          }
          fs.writeFileSync(path.join(dataDir, "sources.json"), JSON.stringify(existingSources, null, 2));

          try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

          datesCache = null;
          job.status = "complete";
          job.result = {
            tickers: existingTickers.length,
            dates: mergedDates.length,
            events: Object.keys(existingEvents).length,
            workbookName,
          };
        }
      } catch (e: any) {
        console.error(`[async-job ${jobId}] Error:`, e);
        job.status = "error";
        job.error = e.message;
      } finally {
        try { fs.unlinkSync(uploadedPath); } catch (_) {}
      }
    })();
  }

  // Poll job status
  app.get("/api/data/job/:id", (req, res) => {
    const job = parseJobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Read live progress from Python's .progress.json if still parsing
    let progress = job.progress;
    if (job.status === "parsing" && activeParseOutputDir) {
      const progressFile = path.join(activeParseOutputDir, ".progress.json");
      try {
        if (fs.existsSync(progressFile)) {
          progress = readJSON(progressFile);
        }
      } catch (_) {}
    }

    res.json({
      id: job.id,
      status: job.status,
      progress,
      result: job.result,
      error: job.error,
      mergePreview: job.mergePreview || null,
      // Batch fields (only present for batch jobs)
      batchTotal: (job as any).batchTotal || null,
      batchCurrent: (job as any).batchCurrent || null,
      batchWorkbooks: (job as any).batchWorkbooks || null,
      batchResults: (job as any).batchResults || null,
    });
  });

  // Server-side parse endpoint for large files
  // OPTIMIZED: Python writes ticker files directly to disk (no massive JSON blob via stdout).
  // Uses exec (async) instead of execSync to avoid blocking the server.
  // Modes: "ingest" (parse+write to data/), "preview" (parse to temp dir), "parse" (legacy)
  app.post("/api/data/server-parse", safeUploadSingle("workbook"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const uploadedPath = req.file.path;
    const ingestMode = req.body?.mode || "parse"; // "parse", "preview", or "ingest"
    const mergeOrReplace = req.body?.mergeMode || "replace"; // "merge" or "replace"
    const resolutions = req.body?.resolutions ? JSON.parse(req.body.resolutions) : {};
    const workbookName = req.file.originalname;
    const fileSize = req.file.size;

    try {
      const sizeMB = (fileSize / 1024 / 1024).toFixed(1);
      console.log(`[server-parse] Parsing ${workbookName} (${sizeMB} MB) mode=${ingestMode}...`);
      const scriptPath = path.join(process.cwd(), "scripts", "parse-workbook.py");
      const dataDir = path.join(process.cwd(), "data");

      if (ingestMode === "ingest") {
        // ── INGEST MODE: Python writes ticker files directly to data/ ──
        // For replace: wipe existing ticker files first, then Python writes new ones
        // For merge: Python writes to temp dir, then we cherry-pick
        
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        const tickerDir = path.join(dataDir, "tickers");
        if (!fs.existsSync(tickerDir)) fs.mkdirSync(tickerDir, { recursive: true });

        if (mergeOrReplace === "replace") {
          // Wipe existing ticker files before Python writes new ones
          for (const f of fs.readdirSync(tickerDir)) {
            const fp = path.join(tickerDir, f);
            if (fs.statSync(fp).isFile()) {
              fs.unlinkSync(fp);
            } else {
              fs.rmSync(fp, { recursive: true, force: true });
            }
          }
          
          // Python writes directly to data/ (ticker files + metadata)
          const result = await runPythonParser(scriptPath, uploadedPath, dataDir);
          
          // Write sources.json
          const sources: any = {};
          const ts = new Date().toISOString();
          for (const t of result.tickers) {
            sources[t.ticker] = {
              workbook: workbookName,
              uploadedAt: ts,
              dates: t.dates,
              metrics: t.metrics?.length || 0,
              fileSize,
            };
          }
          fs.writeFileSync(path.join(dataDir, "sources.json"), JSON.stringify(sources, null, 2));
          
          datesCache = null;
          res.json({
            ok: true,
            tickers: result.tickers.length,
            dates: result.dates.length,
            events: Object.keys(result.events).length,
            workbookName,
          });
        } else {
          // Merge mode: parse to temp dir, then selectively copy
          const tempDir = path.join(process.cwd(), "uploads", `parse-${Date.now()}`);
          fs.mkdirSync(tempDir, { recursive: true });
          
          const result = await runPythonParser(scriptPath, uploadedPath, tempDir);
          
          // Apply conflict resolutions
          let tickersToWrite = result.tickers;
          if (Object.keys(resolutions).length > 0) {
            const keepSet = new Set(
              Object.entries(resolutions)
                .filter(([_, v]) => v === "keep")
                .map(([k]) => k)
            );
            tickersToWrite = result.tickers.filter((t: any) => !keepSet.has(t.ticker));
          }
          
          // Copy selected ticker files from temp to data/tickers/
          const tempTickerDir = path.join(tempDir, "tickers");
          for (const t of tickersToWrite) {
            const src = path.join(tempTickerDir, `${t.ticker}.json`);
            const dst = path.join(tickerDir, `${t.ticker}.json`);
            if (fs.existsSync(src)) {
              fs.copyFileSync(src, dst);
            }
          }
          
          // Merge metadata files
          let existingTickers: any[] = [];
          let existingDates: string[] = [];
          let existingEvents: any = {};
          let existingSources: any = {};
          try { existingTickers = readJSON(path.join(dataDir, "tickers.json")); } catch (_) {}
          try { existingDates = readJSON(path.join(dataDir, "dates.json")); } catch (_) {}
          try { existingEvents = readJSON(path.join(dataDir, "events.json")); } catch (_) {}
          try { existingSources = readJSON(path.join(dataDir, "sources.json")); } catch (_) {}
          
          const existingTickerSet = new Set(existingTickers.map((t: any) => t.ticker));
          for (const t of tickersToWrite) {
            if (!existingTickerSet.has(t.ticker)) {
              existingTickers.push(t);
            } else {
              const idx = existingTickers.findIndex((et: any) => et.ticker === t.ticker);
              if (idx >= 0) existingTickers[idx] = t;
            }
          }
          existingTickers.sort((a: any, b: any) => a.ticker.localeCompare(b.ticker));
          
          const dateSet = new Set([...existingDates, ...result.dates]);
          const mergedDates = Array.from(dateSet).sort();
          
          for (const [ticker, evts] of Object.entries(result.events) as [string, any][]) {
            if (!existingEvents[ticker]) existingEvents[ticker] = {};
            for (const [key, vals] of Object.entries(evts) as [string, any][]) {
              existingEvents[ticker][key] = vals;
            }
          }
          
          fs.writeFileSync(path.join(dataDir, "tickers.json"), JSON.stringify(existingTickers, null, 2));
          fs.writeFileSync(path.join(dataDir, "dates.json"), JSON.stringify(mergedDates));
          fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(existingEvents, null, 2));
          
          const ts = new Date().toISOString();
          for (const t of tickersToWrite) {
            existingSources[t.ticker] = {
              workbook: workbookName,
              uploadedAt: ts,
              dates: t.dates,
              metrics: t.metrics?.length || 0,
              fileSize,
            };
          }
          fs.writeFileSync(path.join(dataDir, "sources.json"), JSON.stringify(existingSources, null, 2));
          
          // Cleanup temp dir
          try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
          
          datesCache = null;
          res.json({
            ok: true,
            tickers: existingTickers.length,
            dates: mergedDates.length,
            events: Object.keys(existingEvents).length,
            added: tickersToWrite.filter((t: any) => !existingTickerSet.has(t.ticker)).length,
            overwritten: tickersToWrite.filter((t: any) => existingTickerSet.has(t.ticker)).length,
            workbookName,
          });
        }
      } else if (ingestMode === "preview") {
        // ── PREVIEW MODE: parse to temp dir, return metadata for conflict detection ──
        const tempDir = path.join(process.cwd(), "uploads", `parse-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        
        const result = await runPythonParser(scriptPath, uploadedPath, tempDir);
        
        let existingTickers: string[] = [];
        try {
          const existing = readJSON(path.join(dataDir, "tickers.json"));
          existingTickers = existing.map((t: any) => t.ticker);
        } catch (_) {}
        
        const existingSet = new Set(existingTickers);
        const newTickers = result.tickers.filter((t: any) => !existingSet.has(t.ticker)).map((t: any) => t.ticker);
        const conflicts = result.tickers.filter((t: any) => existingSet.has(t.ticker)).map((t: any) => t.ticker);
        
        res.json({
          ok: true,
          newTickers,
          conflicts,
          totalNew: newTickers.length,
          totalExisting: existingTickers.length,
          totalParsed: result.tickers.length,
          workbookName,
          tempPath: tempDir, // Client passes this back for merge-apply
        });
        return; // Don't delete temp dir — needed for merge-apply
      } else {
        // ── PARSE-ONLY MODE (legacy): parse to temp, read back, return full data ──
        const tempDir = path.join(process.cwd(), "uploads", `parse-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        
        const result = await runPythonParser(scriptPath, uploadedPath, tempDir);
        
        // Read ticker data back from temp dir (for legacy compatibility)
        const tickerData: Record<string, any> = {};
        const tempTickerDir = path.join(tempDir, "tickers");
        if (fs.existsSync(tempTickerDir)) {
          for (const f of fs.readdirSync(tempTickerDir)) {
            const ticker = f.replace(".json", "");
            tickerData[ticker] = readJSON(path.join(tempTickerDir, f));
          }
        }
        
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        
        res.json({
          ok: true,
          tickers: result.tickers,
          dates: result.dates,
          events: result.events,
          tickerData,
          workbookName,
        });
      }
    } catch (e: any) {
      console.error("[server-parse] Error:", e);
      res.status(500).json({ error: "Failed to parse workbook", details: e.message });
    } finally {
      try { fs.unlinkSync(uploadedPath); } catch (_) {}
    }
  });

  // Track active parse output dir for progress polling
  let activeParseOutputDir: string | null = null;

  // Progress polling endpoint for real-time parse status
  app.get("/api/data/parse-progress", (_req, res) => {
    if (!activeParseOutputDir) {
      return res.json({ active: false });
    }
    const progressFile = path.join(activeParseOutputDir, ".progress.json");
    try {
      if (fs.existsSync(progressFile)) {
        const progress = readJSON(progressFile);
        res.json({ active: true, ...progress });
      } else {
        res.json({ active: true, phase: "starting", current: 0, total: 0 });
      }
    } catch (_) {
      res.json({ active: true, phase: "starting", current: 0, total: 0 });
    }
  });

  // Helper: run Python parser asynchronously (non-blocking)
  function runPythonParser(
    scriptPath: string,
    filePath: string,
    outputDir: string
  ): Promise<{ tickers: any[]; dates: string[]; events: any }> {
    activeParseOutputDir = outputDir;
    return new Promise((resolve, reject) => {
      const proc = spawn("python3", [scriptPath, filePath, outputDir], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let killed = false;

      // 45-minute timeout for very large workbooks (280MB+ .xlsm)
      const timer = setTimeout(() => {
        killed = true;
        proc.kill("SIGKILL");
      }, 45 * 60 * 1000);

      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        // Log last line of stderr for real-time progress visibility
        const lines = text.trim().split("\n");
        const last = lines[lines.length - 1];
        if (last) console.log(`[python] ${last}`);
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        activeParseOutputDir = null;

        if (killed) {
          return reject(new Error(`Python parser timed out after 45 minutes.\nLast output:\n${stderr.trim().split("\n").slice(-5).join("\n")}`));
        }
        if (code !== 0) {
          return reject(new Error(`Python parser failed (exit ${code}):\n${stderr.trim().split("\n").slice(-5).join("\n")}`));
        }
        try {
          const result = JSON.parse(stdout);
          if (result.error) {
            return reject(new Error(result.error));
          }
          console.log(`[server-parse] Parsed: ${result.tickers.length} tickers, ${result.dates.length} dates`);
          resolve(result);
        } catch (parseErr: any) {
          reject(new Error(`Failed to parse Python output: ${parseErr.message}`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        activeParseOutputDir = null;
        reject(new Error(`Failed to start Python parser: ${err.message}`));
      });
    });
  }

  // Server-side merge apply: load previously-parsed data from temp DIRECTORY and ingest
  // tempPath is now a directory (not a JSON file) with tickers/, tickers.json, dates.json, events.json
  app.post("/api/data/server-merge-apply", (req, res) => {
    try {
      const { tempPath, mergeMode, resolutions: resJson, workbookName, fileSize } = req.body;
      if (!tempPath || !fs.existsSync(tempPath)) {
        return res.status(400).json({ error: "Invalid or expired temp data. Please re-upload." });
      }

      // Security: ensure tempPath is within uploads dir
      const resolved = path.resolve(tempPath);
      const allowedDir = path.resolve(path.join(process.cwd(), "uploads"));
      if (!resolved.startsWith(allowedDir)) {
        return res.status(400).json({ error: "Invalid temp path" });
      }

      console.log(`[server-merge-apply] Loading parsed data from ${tempPath}...`);
      
      // Read metadata from the temp directory
      const parsedTickers: any[] = readJSON(path.join(tempPath, "tickers.json"));
      const parsedDates: string[] = readJSON(path.join(tempPath, "dates.json"));
      const parsedEvents: any = readJSON(path.join(tempPath, "events.json"));
      const tempTickerDir = path.join(tempPath, "tickers");
      
      const resolutionsMap: Record<string, string> = resJson ? JSON.parse(resJson) : {};

      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

      // Filter tickers based on resolutions
      const keepSet = new Set(
        Object.entries(resolutionsMap)
          .filter(([_, v]) => v === "keep")
          .map(([k]) => k)
      );

      let tickersToWrite = parsedTickers.filter((t: any) => !keepSet.has(t.ticker));

      // Copy selected ticker data files from temp to data/tickers/
      const tickerDir = path.join(dataDir, "tickers");
      if (!fs.existsSync(tickerDir)) fs.mkdirSync(tickerDir, { recursive: true });
      for (const t of tickersToWrite) {
        const src = path.join(tempTickerDir, `${t.ticker}.json`);
        const dst = path.join(tickerDir, `${t.ticker}.json`);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
        }
      }

      // Merge with existing
      let existingTickers: any[] = [];
      let existingDates: string[] = [];
      let existingEvents: any = {};
      let existingSources: any = {};
      try { existingTickers = readJSON(path.join(dataDir, "tickers.json")); } catch (_) {}
      try { existingDates = readJSON(path.join(dataDir, "dates.json")); } catch (_) {}
      try { existingEvents = readJSON(path.join(dataDir, "events.json")); } catch (_) {}
      try { existingSources = readJSON(path.join(dataDir, "sources.json")); } catch (_) {}

      const existingTickerSet = new Set(existingTickers.map((t: any) => t.ticker));
      let added = 0, overwritten = 0;
      for (const t of tickersToWrite) {
        if (!existingTickerSet.has(t.ticker)) {
          existingTickers.push(t);
          added++;
        } else {
          const idx = existingTickers.findIndex((et: any) => et.ticker === t.ticker);
          if (idx >= 0) existingTickers[idx] = t;
          overwritten++;
        }
      }
      existingTickers.sort((a: any, b: any) => a.ticker.localeCompare(b.ticker));

      const dateSet = new Set([...existingDates, ...parsedDates]);
      const mergedDates = Array.from(dateSet).sort();

      for (const [ticker, evts] of Object.entries(parsedEvents) as [string, any][]) {
        if (!existingEvents[ticker]) existingEvents[ticker] = {};
        for (const [key, vals] of Object.entries(evts) as [string, any][]) {
          existingEvents[ticker][key] = vals;
        }
      }

      fs.writeFileSync(path.join(dataDir, "tickers.json"), JSON.stringify(existingTickers, null, 2));
      fs.writeFileSync(path.join(dataDir, "dates.json"), JSON.stringify(mergedDates));
      fs.writeFileSync(path.join(dataDir, "events.json"), JSON.stringify(existingEvents, null, 2));

      const ts = new Date().toISOString();
      for (const t of tickersToWrite) {
        existingSources[t.ticker] = {
          workbook: workbookName || "unknown",
          uploadedAt: ts,
          dates: t.dates,
          metrics: t.metrics?.length || 0,
          fileSize: fileSize || 0,
        };
      }
      fs.writeFileSync(path.join(dataDir, "sources.json"), JSON.stringify(existingSources, null, 2));

      // Cleanup temp directory
      try { fs.rmSync(tempPath, { recursive: true, force: true }); } catch (_) {}

      datesCache = null;

      const kept = Object.values(resolutionsMap).filter(v => v === "keep").length;
      res.json({
        ok: true,
        tickers: existingTickers.length,
        dates: mergedDates.length,
        events: Object.keys(existingEvents).length,
        added,
        overwritten,
        kept,
        workbookName,
      });
    } catch (e: any) {
      console.error("[server-merge-apply] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Client-side parsed data upload (no file upload needed) ──
  // Uses a chunked protocol to avoid proxy size limits:
  //   1. POST /api/data/ingest/start  — begin session, optionally wipe existing
  //   2. POST /api/data/ingest/chunk  — send a batch of tickers (call multiple times)
  //   3. POST /api/data/ingest/finish — finalize: write tickers.json, dates.json, events.json, sources.json

  // In-memory ingest session
  let ingestSession: {
    mode: "replace" | "merge";
    workbookName: string;
    tickers: any[];
    dates: string[];
    events: Record<string, Record<string, string[]>>;
    tickerCount: number;
  } | null = null;

  app.post("/api/data/ingest/start", (req, res) => {
    try {
      const { mode, workbookName, dates, events } = req.body as {
        mode: "replace" | "merge";
        workbookName: string;
        dates: string[];
        events: Record<string, Record<string, string[]>>;
      };

      const tickersDir = path.join(DATA_DIR, "tickers");
      if (!fs.existsSync(tickersDir)) fs.mkdirSync(tickersDir, { recursive: true });

      if (mode === "replace") {
        // Wipe existing ticker JSONs
        for (const f of fs.readdirSync(tickersDir)) {
          fs.unlinkSync(path.join(tickersDir, f));
        }
      }

      ingestSession = {
        mode: mode || "replace",
        workbookName: workbookName || "unknown",
        tickers: [],
        dates: dates || [],
        events: events || {},
        tickerCount: 0,
      };

      console.log(`[ingest] Started ${mode} session for ${workbookName}`);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[ingest/start] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/data/ingest/chunk", (req, res) => {
    try {
      if (!ingestSession) {
        return res.status(400).json({ error: "No active ingest session. Call /api/data/ingest/start first." });
      }

      const { tickers, tickerData } = req.body as {
        tickers: any[];
        tickerData: Record<string, Record<string, (number | string)[]>>;
      };

      if (!tickers || !tickerData) {
        return res.status(400).json({ error: "Missing tickers or tickerData" });
      }

      const tickersDir = path.join(DATA_DIR, "tickers");

      // Write per-ticker JSON files
      for (const [ticker, data] of Object.entries(tickerData)) {
        const tickerFile = path.join(tickersDir, `${ticker}.json`);
        fs.writeFileSync(tickerFile, JSON.stringify(data));
      }

      ingestSession.tickers.push(...tickers);
      ingestSession.tickerCount += tickers.length;

      console.log(`[ingest/chunk] Wrote ${tickers.length} tickers (total: ${ingestSession.tickerCount})`);
      res.json({ ok: true, totalSoFar: ingestSession.tickerCount });
    } catch (e: any) {
      console.error("[ingest/chunk] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/data/ingest/finish", (_req, res) => {
    try {
      if (!ingestSession) {
        return res.status(400).json({ error: "No active ingest session." });
      }

      const { mode, workbookName, tickers, dates, events } = ingestSession;
      const tickersDir = path.join(DATA_DIR, "tickers");

      // Build sources.json
      const uploadTs = new Date().toISOString().replace("Z", "").split(".")[0];
      let existingSources: Record<string, any> = {};
      const sourcesFile = path.join(DATA_DIR, "sources.json");
      if (mode === "merge" && fs.existsSync(sourcesFile)) {
        try { existingSources = readJSON(sourcesFile); } catch (_) {}
      }

      const sources: Record<string, any> = mode === "replace" ? {} : { ...existingSources };
      for (const t of tickers) {
        const tickerFile = path.join(tickersDir, `${t.ticker}.json`);
        const fileSize = fs.existsSync(tickerFile) ? fs.statSync(tickerFile).size : 0;
        sources[t.ticker] = {
          workbook: workbookName,
          uploadedAt: uploadTs,
          dates: t.dates || 0,
          metrics: (t.metrics || []).length,
          fileSize,
        };
      }
      fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2));

      // Merge with existing if needed
      let finalTickers = [...tickers];
      let finalDates = [...dates];
      let finalEvents = { ...events };

      if (mode === "merge") {
        const existingTickersFile = path.join(DATA_DIR, "tickers.json");
        const existingDatesFile = path.join(DATA_DIR, "dates.json");
        const existingEventsFile = path.join(DATA_DIR, "events.json");

        if (fs.existsSync(existingTickersFile)) {
          try {
            const existingTickers = readJSON(existingTickersFile);
            const newTickerSet = new Set(tickers.map((t: any) => t.ticker));
            for (const et of existingTickers) {
              if (!newTickerSet.has(et.ticker)) {
                finalTickers.push(et);
              }
            }
          } catch (_) {}
        }

        if (fs.existsSync(existingDatesFile)) {
          try {
            const existingDates = readJSON(existingDatesFile);
            if (existingDates.length > finalDates.length) {
              finalDates = existingDates;
            }
          } catch (_) {}
        }

        if (fs.existsSync(existingEventsFile)) {
          try {
            const existingEvents = readJSON(existingEventsFile);
            finalEvents = { ...existingEvents, ...finalEvents };
          } catch (_) {}
        }
      }

      finalTickers.sort((a: any, b: any) => a.ticker.localeCompare(b.ticker));

      fs.writeFileSync(path.join(DATA_DIR, "dates.json"), JSON.stringify(finalDates));
      fs.writeFileSync(path.join(DATA_DIR, "tickers.json"), JSON.stringify(finalTickers));
      fs.writeFileSync(path.join(DATA_DIR, "events.json"), JSON.stringify(finalEvents));

      // Invalidate caches
      datesCache = null;

      const result = {
        ok: true,
        tickers: finalTickers.length,
        dates: finalDates.length,
        events: Object.keys(finalEvents).length,
      };

      console.log(`[ingest/finish] Done: ${result.tickers} tickers, ${result.dates} dates`);
      ingestSession = null;
      res.json(result);
    } catch (e: any) {
      console.error("[ingest/finish] Error:", e);
      ingestSession = null;
      res.status(500).json({ error: e.message });
    }
  });

  // ── Upload main workbook to refresh all data ──
  app.post("/api/data/upload", safeUploadSingle("workbook"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadedPath = req.file.path;
    const scriptPath = path.join(process.cwd(), "scripts", "refresh-data.py");
    const mode = req.query.mode === "full" ? "--full" : "";

    // Run the Python parsing script against the uploaded file (incremental by default)
    const cmd = `python3 "${scriptPath}" "${uploadedPath}" ${mode}`.trim();
    exec(cmd, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Clean up uploaded file
      try { fs.unlinkSync(uploadedPath); } catch (_) {}

      if (error) {
        console.error("Workbook processing error:", stderr || error.message);
        return res.status(500).json({
          error: "Failed to process workbook",
          details: stderr || error.message,
        });
      }

      // Invalidate in-memory caches
      datesCache = null;

      // Count what we got
      try {
        const tickers = readJSON(path.join(DATA_DIR, "tickers.json"));
        const dates = readJSON(path.join(DATA_DIR, "dates.json"));
        res.json({
          ok: true,
          tickers: tickers.length,
          dates: dates.length,
          log: stdout,
        });
      } catch (e: any) {
        res.json({
          ok: true,
          log: stdout,
          warning: "Data written but could not read summary: " + e.message,
        });
      }
    });
  });

  // ── Upload & Merge (two-phase: preview then merge) ──

  app.post("/api/data/upload-preview", safeUploadSingle("workbook"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const uploadedPath = req.file.path;
    const tempDir = path.join(process.cwd(), "uploads", `temp-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const scriptPath = path.join(process.cwd(), "scripts", "merge-workbook.py");
    const cmd = `python3 "${scriptPath}" preview "${uploadedPath}" "${tempDir}"`;

    exec(cmd, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Keep the uploaded file for now — we'll need it referenced via tempDir
      // But we can delete the original upload since data is in tempDir
      try { fs.unlinkSync(uploadedPath); } catch (_) {}

      if (error) {
        // Clean up temp dir on error
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        console.error("Preview error:", stderr || error.message);
        return res.status(500).json({
          error: "Failed to parse workbook",
          details: stderr || error.message,
        });
      }

      try {
        const preview = JSON.parse(stdout.trim());
        preview.tempDir = tempDir; // Client needs this to call merge
        res.json(preview);
      } catch (e: any) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
        res.status(500).json({ error: "Failed to parse preview output", details: stdout });
      }
    });
  });

  app.post("/api/data/upload-merge", (req, res) => {
    const { tempDir, resolutions } = req.body as { tempDir: string; resolutions: Record<string, string> };

    if (!tempDir || !fs.existsSync(tempDir)) {
      return res.status(400).json({ error: "Invalid or expired temp directory. Please re-upload." });
    }

    // Security: ensure tempDir is within our uploads directory
    const uploadsDir = path.join(process.cwd(), "uploads");
    const resolvedTemp = path.resolve(tempDir);
    if (!resolvedTemp.startsWith(uploadsDir)) {
      return res.status(400).json({ error: "Invalid temp directory path" });
    }

    const scriptPath = path.join(process.cwd(), "scripts", "merge-workbook.py");
    const resolutionsJson = JSON.stringify(resolutions || {});
    const cmd = `python3 "${scriptPath}" merge "${resolvedTemp}" '${resolutionsJson.replace(/'/g, "'\\''")}' `;

    exec(cmd, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Clean up temp dir
      try { fs.rmSync(resolvedTemp, { recursive: true, force: true }); } catch (_) {}

      if (error) {
        console.error("Merge error:", stderr || error.message);
        return res.status(500).json({
          error: "Failed to merge workbook",
          details: stderr || error.message,
        });
      }

      // Invalidate caches
      datesCache = null;

      try {
        const result = JSON.parse(stdout.trim());
        res.json({ ok: true, ...result });
      } catch (e: any) {
        res.json({ ok: true, log: stdout, warning: "Merge done but could not parse result" });
      }
    });
  });

  // ── Get data status (how many tickers, last update, etc.) ──
  app.get("/api/data/status", (_req, res) => {
    try {
      const tickersFile = path.join(DATA_DIR, "tickers.json");
      const datesFile = path.join(DATA_DIR, "dates.json");
      const tickers = readJSON(tickersFile);
      const dates = readJSON(datesFile);
      const stat = fs.statSync(tickersFile);
      res.json({
        tickers: tickers.length,
        dates: dates.length,
        lastDate: dates[dates.length - 1] || null,
        lastUpdated: stat.mtime.toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Get data sources audit info ──
  app.get("/api/data/sources", (_req, res) => {
    try {
      const sourcesFile = path.join(DATA_DIR, "sources.json");
      if (!fs.existsSync(sourcesFile)) {
        return res.json({ sources: {}, workbooks: [] });
      }
      const sources: Record<string, { workbook: string; uploadedAt: string; dates: number; metrics: number; fileSize: number }> = readJSON(sourcesFile);

      // Aggregate by workbook
      const wbMap: Record<string, { name: string; uploadedAt: string; tickers: string[]; totalSize: number }> = {};
      for (const [ticker, info] of Object.entries(sources)) {
        const wb = info.workbook || "unknown";
        if (!wbMap[wb]) {
          wbMap[wb] = { name: wb, uploadedAt: info.uploadedAt, tickers: [], totalSize: 0 };
        }
        wbMap[wb].tickers.push(ticker);
        wbMap[wb].totalSize += info.fileSize || 0;
        // Use earliest upload time for the workbook
        if (info.uploadedAt < wbMap[wb].uploadedAt) {
          wbMap[wb].uploadedAt = info.uploadedAt;
        }
      }

      const workbooks = Object.values(wbMap).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

      res.json({ sources, workbooks });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Cap rate metadata ──
  app.get("/api/data/caprate-meta", (req, res) => {
    const capMetaFile = path.join(DATA_DIR, "caprate-meta.json");
    if (!fs.existsSync(capMetaFile)) {
      return res.json({ loaded: false });
    }
    try {
      const meta = readJSON(capMetaFile);
      return res.json({ loaded: true, ...meta });
    } catch {
      return res.json({ loaded: false });
    }
  });

  // Save cap rate metadata (from client-side upload)
  app.post("/api/data/caprate-meta", (req, res) => {
    const capMetaFile = path.join(DATA_DIR, "caprate-meta.json");
    const { workbook, tickersUpdated, totalPoints } = req.body;
    const meta = {
      workbook: workbook || "Unknown",
      uploadedAt: new Date().toISOString(),
      tickersUpdated: tickersUpdated || 0,
      totalPoints: totalPoints || 0,
      fileSize: 0,
    };
    fs.writeFileSync(capMetaFile, JSON.stringify(meta, null, 2));
    res.json({ ok: true });
  });

  // ── Upload implied cap rate workbook ──
  app.post("/api/data/caprate-upload", safeUploadSingle("workbook"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const uploadedPath = req.file.path;
    const workbookName = req.file.originalname;
    try {
      console.log(`[caprate-upload] Parsing ${workbookName} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)...`);
      const scriptPath = path.join(process.cwd(), "scripts", "parse-cap-rates.py");
      const output = execSync(
        `python3 "${scriptPath}" "${uploadedPath}" "${DATA_DIR}"`,
        { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }
      ).toString();
      console.log(`[caprate-upload] Output:\n${output}`);

      // Parse the output for stats
      const updatedMatch = output.match(/(\d+) tickers updated/);
      const skippedFileMatch = output.match(/(\d+) skipped \(no file\)/);
      const skippedDataMatch = output.match(/(\d+) skipped \(no data\)/);
      const pointsMatch = output.match(/Total cap rate data points: (\d+)/);

      // Clear datesCache so API serves fresh data
      datesCache = null;

      const updatedCount = parseInt(updatedMatch?.[1] || "0");
      const totalPts = parseInt(pointsMatch?.[1] || "0");

      // Persist cap rate workbook metadata
      const capMetaFile = path.join(DATA_DIR, "caprate-meta.json");
      const capMeta = {
        workbook: workbookName,
        uploadedAt: new Date().toISOString(),
        tickersUpdated: updatedCount,
        totalPoints: totalPts,
        fileSize: req.file!.size,
      };
      fs.writeFileSync(capMetaFile, JSON.stringify(capMeta, null, 2));

      res.json({
        success: true,
        workbook: workbookName,
        updated: updatedCount,
        skippedNoFile: parseInt(skippedFileMatch?.[1] || "0"),
        skippedNoData: parseInt(skippedDataMatch?.[1] || "0"),
        totalPoints: totalPts,
        output,
      });
    } catch (e: any) {
      console.error("[caprate-upload] Error:", e);
      res.status(500).json({ error: e.message, stderr: e.stderr?.toString() });
    } finally {
      try { fs.unlinkSync(uploadedPath); } catch (_) {}
    }
  });

  // ── Wipe the implied cap rate data layer ──
  app.post("/api/data/wipe-caprate", (_req, res) => {
    try {
      const tickersDir = path.join(DATA_DIR, "tickers");
      const tickersFile = path.join(DATA_DIR, "tickers.json");
      const capMetaFile = path.join(DATA_DIR, "caprate-meta.json");

      let strippedFiles = 0;
      let totalChecked = 0;
      if (fs.existsSync(tickersDir)) {
        const files = fs.readdirSync(tickersDir).filter((f) => f.endsWith(".json"));
        totalChecked = files.length;
        for (const f of files) {
          const p = path.join(tickersDir, f);
          try {
            const data = readJSON(p);
            if (data && Object.prototype.hasOwnProperty.call(data, "Implied Cap Rate")) {
              delete data["Implied Cap Rate"];
              fs.writeFileSync(p, JSON.stringify(data));
              strippedFiles++;
            }
          } catch (_) { /* skip unreadable file */ }
        }
      }

      // Remove "Implied Cap Rate" from each ticker's metrics list
      let metaUpdated = 0;
      if (fs.existsSync(tickersFile)) {
        try {
          const tickers: any[] = readJSON(tickersFile);
          for (const t of tickers) {
            if (Array.isArray(t.metrics)) {
              const before = t.metrics.length;
              t.metrics = t.metrics.filter((m: string) => m !== "Implied Cap Rate");
              if (t.metrics.length !== before) metaUpdated++;
            }
          }
          fs.writeFileSync(tickersFile, JSON.stringify(tickers, null, 2));
        } catch (_) { /* leave tickers.json alone if unreadable */ }
      }

      // Drop the meta record so the UI card disappears
      if (fs.existsSync(capMetaFile)) {
        try { fs.unlinkSync(capMetaFile); } catch (_) {}
      }

      datesCache = null;
      res.json({ ok: true, strippedFiles, totalChecked, metaUpdated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Wipe a specific workbook's tickers ──
  app.post("/api/data/wipe-workbook", (req, res) => {
    try {
      const { workbookName } = req.body;
      if (!workbookName) {
        return res.status(400).json({ error: "Missing workbookName" });
      }

      const sourcesFile = path.join(DATA_DIR, "sources.json");
      if (!fs.existsSync(sourcesFile)) {
        return res.status(404).json({ error: "No sources data found" });
      }

      const sources: Record<string, any> = readJSON(sourcesFile);
      const tickersDir = path.join(DATA_DIR, "tickers");

      // Find all tickers belonging to this workbook
      const tickersToRemove: string[] = [];
      for (const [ticker, info] of Object.entries(sources)) {
        if (info.workbook === workbookName) {
          tickersToRemove.push(ticker);
        }
      }

      if (tickersToRemove.length === 0) {
        return res.status(404).json({ error: `No tickers found for workbook: ${workbookName}` });
      }

      // Remove ticker data files
      for (const ticker of tickersToRemove) {
        const tickerFile = path.join(tickersDir, `${ticker}.json`);
        if (fs.existsSync(tickerFile)) {
          fs.unlinkSync(tickerFile);
        }
        delete sources[ticker];
      }

      // Update tickers.json — remove the wiped tickers
      const tickersFile = path.join(DATA_DIR, "tickers.json");
      let tickers: any[] = [];
      try { tickers = readJSON(tickersFile); } catch (_) {}
      const removeSet = new Set(tickersToRemove);
      tickers = tickers.filter((t: any) => !removeSet.has(t.ticker));
      fs.writeFileSync(tickersFile, JSON.stringify(tickers, null, 2));

      // Update events.json — remove events for wiped tickers
      const eventsFile = path.join(DATA_DIR, "events.json");
      let events: any = {};
      try { events = readJSON(eventsFile); } catch (_) {}
      for (const ticker of tickersToRemove) {
        delete events[ticker];
      }
      fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));

      // Write updated sources
      fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2));

      // Note: we don't touch dates.json — the global date array can stay as-is.
      // Removing dates that other tickers might use would be error-prone.

      datesCache = null;

      console.log(`[wipe-workbook] Removed ${tickersToRemove.length} tickers from "${workbookName}"`);
      res.json({
        success: true,
        removed: tickersToRemove.length,
        removedTickers: tickersToRemove,
        remaining: tickers.length,
        workbookName,
      });
    } catch (e: any) {
      console.error("[wipe-workbook] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Wipe all ticker data ──
  app.post("/api/data/wipe", (_req, res) => {
    try {
      const tickersDir = path.join(DATA_DIR, "tickers");

      // Remove individual ticker JSON files (skip subdirectories)
      if (fs.existsSync(tickersDir)) {
        for (const f of fs.readdirSync(tickersDir)) {
          const fp = path.join(tickersDir, f);
          if (fs.statSync(fp).isFile()) {
            fs.unlinkSync(fp);
          } else {
            fs.rmSync(fp, { recursive: true, force: true });
          }
        }
      }

      // Reset top-level data files to empty state
      fs.writeFileSync(path.join(DATA_DIR, "tickers.json"), "[]");
      fs.writeFileSync(path.join(DATA_DIR, "dates.json"), "[]");
      fs.writeFileSync(path.join(DATA_DIR, "events.json"), "{}");
      fs.writeFileSync(path.join(DATA_DIR, "sources.json"), "{}");

      // Remove the ingest manifest so next upload does a full process
      const manifestPath = path.join(DATA_DIR, ".ingest-manifest.json");
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
      }

      // Clear the in-memory dates cache
      datesCache = null;

      res.json({ success: true, message: "All ticker data has been wiped." });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Yahoo Finance price history routes ──────────────────────────────────

  // GET /api/yahoo-prices/:ticker  — returns PriceBars JSON
  app.get("/api/yahoo-prices/:ticker", async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    try {
      const data = await fetchYahooPrices(ticker);
      res.set("Cache-Control", "public, max-age=300");
      res.json(data);
    } catch (e: any) {
      res.status(502).json({
        error: `Could not load price history for ${ticker} from Yahoo Finance`,
        detail: e?.message ?? String(e),
      });
    }
  });

  // POST /api/yahoo-prices/:ticker/refresh  — force re-fetch
  app.post("/api/yahoo-prices/:ticker/refresh", async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    try {
      const data = await fetchYahooPrices(ticker, true);
      res.json({ ok: true, ticker, bars: data.dates.length, fetchedAt: data.fetchedAt });
    } catch (e: any) {
      res.status(502).json({
        error: `Could not refresh price history for ${ticker} from Yahoo Finance`,
        detail: e?.message ?? String(e),
      });
    }
  });

  // POST /api/yahoo-prices/refresh-batch  — bulk refresh up to 50 tickers
  app.post("/api/yahoo-prices/refresh-batch", async (req, res) => {
    const { tickers } = req.body as { tickers?: unknown };
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: "Body must include tickers: string[]" });
    }
    const batch = (tickers as string[])
      .slice(0, 50)
      .map((t) => String(t).toUpperCase());

    let ok = 0;
    let failed = 0;
    const errors: Record<string, string> = {};

    await Promise.allSettled(
      batch.map(async (ticker) => {
        try {
          await fetchYahooPrices(ticker, true);
          ok++;
        } catch (e: any) {
          failed++;
          errors[ticker] = e?.message ?? String(e);
        }
      })
    );

    res.json({ ok, failed, errors });
  });

  // ── Yahoo Finance symbol search ─────────────────────────────────────────
  // GET /api/yahoo-search?q=...  → { results: [{ symbol, name, exchange }] }
  // Proxies Yahoo's public v1 search/autocomplete endpoint.
  app.get("/api/yahoo-search", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json({ results: [] });
    try {
      const url =
        `https://query1.finance.yahoo.com/v1/finance/search` +
        `?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`;
      const resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "application/json",
        },
      });
      if (!resp.ok) throw new Error(`Yahoo search HTTP ${resp.status}`);
      const json: any = await resp.json();
      const results = (json?.quotes ?? [])
        .filter((it: any) => it && it.symbol)
        .map((it: any) => ({
          symbol: String(it.symbol),
          name: String(it.shortname ?? it.longname ?? it.shortName ?? ""),
          exchange: String(it.exchDisp ?? it.exchange ?? ""),
        }));
      res.json({ results });
    } catch (e: any) {
      res.status(502).json({ results: [], error: e?.message ?? String(e) });
    }
  });

  // ── Classification overrides (per-ticker industry/sector reassignment) ───
  // Persisted as a flat { TICKER: { sector?, subsector?, ... } } map on disk.
  const CLASSIFICATION_FIELDS = [
    "economy",
    "sector",
    "subsector",
    "industryGroup",
    "industry",
    "subindustry",
  ] as const;
  const overridesFile = path.join(DATA_DIR, "classification-overrides.json");

  function loadOverrides(): Record<string, Record<string, string>> {
    try {
      if (!fs.existsSync(overridesFile)) return {};
      return readJSON(overridesFile);
    } catch {
      return {};
    }
  }
  function saveOverrides(map: Record<string, Record<string, string>>): void {
    fs.writeFileSync(overridesFile, JSON.stringify(map, null, 2));
  }
  // Keep only known fields with non-empty string values.
  function sanitizeOverride(input: any): Record<string, string> {
    const out: Record<string, string> = {};
    if (input && typeof input === "object") {
      for (const f of CLASSIFICATION_FIELDS) {
        const v = input[f];
        if (typeof v === "string" && v.trim() !== "") out[f] = v;
      }
    }
    return out;
  }

  app.get("/api/classification-overrides", (_req, res) => {
    res.json({ overrides: loadOverrides() });
  });

  // Batch import — body: { overrides: {TICKER: {...}}, mode: "merge" | "replace" }
  app.post("/api/classification-overrides/_bulk", (req, res) => {
    const { overrides, mode } = req.body as {
      overrides?: Record<string, any>;
      mode?: string;
    };
    const incoming: Record<string, Record<string, string>> = {};
    for (const [t, ov] of Object.entries(overrides ?? {})) {
      const clean = sanitizeOverride(ov);
      if (Object.keys(clean).length > 0) incoming[t.toUpperCase()] = clean;
    }
    const next = mode === "replace" ? incoming : { ...loadOverrides(), ...incoming };
    saveOverrides(next);
    res.json({});
  });

  // Reset all overrides.
  app.post("/api/classification-overrides/_reset", (_req, res) => {
    saveOverrides({});
    res.json({});
  });

  // Delete one ticker's overrides.
  app.post("/api/classification-overrides/:ticker/delete", (req, res) => {
    const ticker = String(req.params.ticker).toUpperCase();
    const map = loadOverrides();
    delete map[ticker];
    saveOverrides(map);
    res.json({});
  });

  // Upsert one ticker's overrides — body: { overrides: {...} }. Empty → delete.
  app.post("/api/classification-overrides/:ticker", (req, res) => {
    const ticker = String(req.params.ticker).toUpperCase();
    const clean = sanitizeOverride((req.body as any)?.overrides);
    const map = loadOverrides();
    if (Object.keys(clean).length === 0) {
      delete map[ticker];
    } else {
      map[ticker] = clean;
    }
    saveOverrides(map);
    res.json({});
  });

  // ════════════════════════════════════════════════════════════════════════
  // Reconstructed endpoints used by the rebuilt client (optimizer / workbook /
  // performance / baskets / peer-relative pages). These read the same data
  // layer as the rest of the file: DATA_DIR/tickers/<TICKER>.json (RLE-encoded
  // metrics, decoded via decodeMetricToMap) + DATA_DIR/tickers.json metadata +
  // getDates(). When per-ticker series files are absent (metadata-only deploy)
  // they return a correct empty-but-valid shape instead of crashing — mirroring
  // how /api/scatter and /api/batch-performance already behave.
  //
  // NONE of these existed in stale-source/server/routes.ts (it has the same
  // route set as this file), so all are written from the client call-site
  // shapes in reit-viz/client/src/lib/{fetchWorkbookSeriesForTicker,
  // fetchWorkbookData,fetchTickerOHLCV,fetchPeerRelative,globalUniverse,
  // fetchPerfData,basketOhlc,optimizerInputSeries}.ts.
  // ════════════════════════════════════════════════════════════════════════

  // Read + decode a single ticker's raw metric file. Returns null if missing.
  function readTickerRaw(symbol: string): Record<string, any> | null {
    const fp = path.join(DATA_DIR, "tickers", `${symbol.toUpperCase()}.json`);
    if (!fs.existsSync(fp)) return null;
    try {
      return readJSON(fp);
    } catch {
      return null;
    }
  }

  // Build full-length parallel arrays (one entry per date index) for a metric,
  // carrying forward the last seen value? No — we keep exact-date values and
  // leave gaps as null. Callers that need price candles use buildOHLCBars.
  function metricToFullArray(encoded: any, n: number): (number | null)[] {
    const map = decodeMetricToMap(encoded || []);
    const arr: (number | null)[] = new Array(n).fill(null);
    for (const [idx, val] of map.entries()) {
      if (idx >= 0 && idx < n) arr[idx] = val;
    }
    return arr;
  }

  // Build compact OHLCV bars for a ticker (only dates that have a close).
  function buildOHLCBars(raw: Record<string, any>, dates: string[]) {
    const close = decodeMetricToMap(raw.close || []);
    const open = decodeMetricToMap(raw.open || []);
    const high = decodeMetricToMap(raw.high || []);
    const low = decodeMetricToMap(raw.low || []);
    const vol = decodeMetricToMap(raw.volume || raw.Volume || []);
    const bars: {
      date: string; open: number; high: number; low: number; close: number; volume: number;
    }[] = [];
    for (let i = 0; i < dates.length; i++) {
      const c = close.get(i);
      if (c === undefined) continue;
      bars.push({
        date: dates[i],
        open: open.get(i) ?? c,
        high: high.get(i) ?? c,
        low: low.get(i) ?? c,
        close: c,
        volume: vol.get(i) ?? 0,
      });
    }
    return bars;
  }

  // ── GET /api/workbook/series — metric/price series for one ticker ──
  // Query: ticker, metric?, series?, kind?
  // Returns { closes, highs, lows, opens, volumes, priceDates, metric? }.
  // When `metric` (or series=<metricName>) is a non-price metric, `closes`
  // carries that metric's values (so the optimizer treats it as the input
  // series); highs/lows/opens mirror it. Otherwise returns raw OHLC.
  app.get("/api/workbook/series", (req, res) => {
    try {
      const ticker = String(req.query.ticker || "").toUpperCase();
      if (!ticker) return res.status(400).json({ error: "ticker required" });
      const metric = (req.query.metric as string) || undefined;
      const seriesParam = (req.query.series as string) || undefined;
      const dates = getDates();
      const raw = readTickerRaw(ticker);
      const empty = { closes: [], highs: [], lows: [], opens: [], volumes: [], priceDates: [], metric };
      if (!raw) return res.json(empty);

      const priceLike = (s?: string) => !s || ["close", "open", "high", "low", "price"].includes(s.toLowerCase());
      const requested = metric || (seriesParam && !priceLike(seriesParam) ? seriesParam : undefined);

      if (requested && raw[requested]) {
        // Non-price metric: emit only the dates that actually have a value, so
        // the optimizer gets a clean series with aligned priceDates.
        const map = decodeMetricToMap(raw[requested]);
        const idxs = [...map.keys()].sort((a, b) => a - b);
        const vals = idxs.map((i) => map.get(i)!);
        const pdates = idxs.map((i) => dates[i]).filter((d) => d !== undefined);
        return res.json({
          closes: vals, highs: vals, lows: vals, opens: vals,
          volumes: new Array(vals.length).fill(0),
          priceDates: pdates, metric: requested,
        });
      }

      // Default: OHLCV from price candles.
      const bars = buildOHLCBars(raw, dates);
      return res.json({
        closes: bars.map((b) => b.close),
        highs: bars.map((b) => b.high),
        lows: bars.map((b) => b.low),
        opens: bars.map((b) => b.open),
        volumes: bars.map((b) => b.volume),
        priceDates: bars.map((b) => b.date),
        metric,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "workbook/series failed" });
    }
  });

  // ── GET /api/workbook/data — full workbook data for one ticker ──
  // Query: ticker, start?, end?
  // Returns { ticker, dates, opens, highs, lows, closes, volumes, metrics }.
  app.get("/api/workbook/data", (req, res) => {
    try {
      const ticker = String(req.query.ticker || "").toUpperCase();
      if (!ticker) return res.status(400).json({ error: "ticker required" });
      const start = (req.query.start as string) || undefined;
      const end = (req.query.end as string) || undefined;
      const dates = getDates();
      const raw = readTickerRaw(ticker);
      if (!raw) {
        return res.json({ ticker, dates: [], opens: [], highs: [], lows: [], closes: [], volumes: [], metrics: {} });
      }

      let bars = buildOHLCBars(raw, dates);
      if (start) bars = bars.filter((b) => b.date >= start);
      if (end) bars = bars.filter((b) => b.date <= end);
      const keepDates = new Set(bars.map((b) => b.date));

      // Decode every non-price metric onto the kept (close-bearing) dates.
      const PRICE_KEYS = new Set(["open", "high", "low", "close", "volume", "Volume"]);
      const metrics: Record<string, (number | null)[]> = {};
      for (const key of Object.keys(raw)) {
        if (PRICE_KEYS.has(key)) continue;
        const map = decodeMetricToMap(raw[key]);
        metrics[key] = bars.map((b, i) => {
          const di = dates.indexOf(b.date);
          return di >= 0 && map.has(di) ? map.get(di)! : null;
        });
      }

      res.json({
        ticker,
        dates: bars.map((b) => b.date),
        opens: bars.map((b) => b.open),
        highs: bars.map((b) => b.high),
        lows: bars.map((b) => b.low),
        closes: bars.map((b) => b.close),
        volumes: bars.map((b) => b.volume),
        metrics,
      });
      void keepDates;
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "workbook/data failed" });
    }
  });

  // ── GET /api/ohlcv — OHLCV bars for one ticker ──
  // Query: ticker, freq? (daily|weekly|monthly)
  // Returns array of { date, open, high, low, close, volume }.
  app.get("/api/ohlcv", (req, res) => {
    try {
      const ticker = String(req.query.ticker || "").toUpperCase();
      if (!ticker) return res.status(400).json({ error: "ticker required" });
      const freq = (req.query.freq as string) || "daily";
      const dates = getDates();
      const raw = readTickerRaw(ticker);
      if (!raw) return res.json([]);

      let bars = buildOHLCBars(raw, dates);

      if (freq === "weekly" || freq === "monthly") {
        // Aggregate by ISO-year+week (weekly) or year+month (monthly).
        const keyOf = (d: string) => {
          if (freq === "monthly") return d.slice(0, 7); // YYYY-MM
          const dt = new Date(d + "T00:00:00Z");
          // ISO week key
          const tmp = new Date(dt);
          tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
          const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
          return `${tmp.getUTCFullYear()}-W${week}`;
        };
        const groups = new Map<string, typeof bars>();
        for (const b of bars) {
          const k = keyOf(b.date);
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(b);
        }
        const agg: typeof bars = [];
        for (const grp of groups.values()) {
          if (!grp.length) continue;
          agg.push({
            date: grp[grp.length - 1].date,
            open: grp[0].open,
            high: Math.max(...grp.map((g) => g.high)),
            low: Math.min(...grp.map((g) => g.low)),
            close: grp[grp.length - 1].close,
            volume: grp.reduce((s, g) => s + (g.volume || 0), 0),
          });
        }
        agg.sort((a, b) => a.date.localeCompare(b.date));
        bars = agg;
      }

      res.json(bars);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "ohlcv failed" });
    }
  });

  // ── GET /api/peer-relative — a ticker's metric vs its peer group ──
  // Query: ticker, dimension, peerClass, metric, aggregation? (median|mean)
  // Returns { targetSeries: (number|null)[], groupSeries: (number|null)[], dates }.
  // Both series are full-length parallel arrays indexed by the dates array.
  app.get("/api/peer-relative", (req, res) => {
    try {
      const ticker = String(req.query.ticker || "").toUpperCase();
      const dimension = String(req.query.dimension || "subindustry");
      const peerClass = String(req.query.peerClass || "");
      const metric = String(req.query.metric || "");
      const aggregation = String(req.query.aggregation || "median");
      if (!ticker || !metric) {
        return res.status(400).json({ error: "ticker and metric required" });
      }
      const dates = getDates();
      const n = dates.length;

      const tickersMeta: any[] = (() => {
        try { return readJSON(path.join(DATA_DIR, "tickers.json")); } catch { return []; }
      })();
      const metaByTicker = new Map(tickersMeta.map((t: any) => [t.ticker, t]));

      // Resolve the peer group: all tickers sharing the same classification value.
      const selfMeta = metaByTicker.get(ticker);
      const classValue = peerClass || (selfMeta ? selfMeta[dimension] : "");
      const peers = tickersMeta
        .filter((t: any) => classValue && t[dimension] === classValue)
        .map((t: any) => t.ticker);

      // Target ticker series (full-length).
      const targetRaw = readTickerRaw(ticker);
      const targetSeries: (number | null)[] = targetRaw && targetRaw[metric]
        ? metricToFullArray(targetRaw[metric], n)
        : new Array(n).fill(null);

      // Peer aggregate per date index.
      const perIdx: number[][] = [];
      for (const peer of peers) {
        if (peer === ticker) continue;
        const raw = readTickerRaw(peer);
        if (!raw || !raw[metric]) continue;
        const map = decodeMetricToMap(raw[metric]);
        for (const [idx, val] of map.entries()) {
          if (idx < 0 || idx >= n) continue;
          (perIdx[idx] ||= []).push(val);
        }
      }
      const groupSeries: (number | null)[] = new Array(n).fill(null);
      for (let i = 0; i < n; i++) {
        const vals = perIdx[i];
        if (!vals || !vals.length) continue;
        if (aggregation === "mean") {
          groupSeries[i] = vals.reduce((s, v) => s + v, 0) / vals.length;
        } else {
          const sorted = [...vals].sort((a, b) => a - b);
          const m = sorted.length;
          groupSeries[i] = m % 2 ? sorted[(m - 1) / 2] : (sorted[m / 2 - 1] + sorted[m / 2]) / 2;
        }
      }

      res.json({ targetSeries, groupSeries, dates, peerClass: classValue, n: peers.length });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "peer-relative failed" });
    }
  });

  // ── GET /api/global-universe — ticker universe list ──
  // Returns the tickers.json metadata array (client also accepts {records}).
  app.get("/api/global-universe", (_req, res) => {
    try {
      const tickersMeta: any[] = readJSON(path.join(DATA_DIR, "tickers.json"));
      const records = tickersMeta.map((t: any) => ({
        ticker: t.ticker,
        name: t.name ?? "",
        economy: t.economy ?? "",
        sector: t.sector ?? "",
        subsector: t.subsector ?? "",
        industryGroup: t.industryGroup ?? "",
        industry: t.industry ?? "",
        subindustry: t.subindustry ?? "",
        ...t,
      }));
      res.json(records);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "global-universe failed" });
    }
  });

  // ── Shared performance helpers (price-return computations) ──
  // Reused by /api/performance, monthly-seasonality, event-returns, seasonal.
  function perfFindDateIdx(dates: string[], target: string): number {
    let lo = 0, hi = dates.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= target) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  }
  function perfSubtractDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }
  function perfCloseAt(closeMap: Map<number, number>, targetIdx: number, back = 20): number | null {
    for (let i = targetIdx; i >= Math.max(0, targetIdx - back); i--) {
      if (closeMap.has(i)) return closeMap.get(i)!;
    }
    return null;
  }
  function perfCloseAtForward(closeMap: Map<number, number>, targetIdx: number, fwd = 20): number | null {
    for (let i = targetIdx; i <= targetIdx + fwd; i++) {
      if (closeMap.has(i)) return closeMap.get(i)!;
    }
    return null;
  }
  function perfReturn(closeMap: Map<number, number>, fromIdx: number, toIdx: number): number | null {
    const f = perfCloseAtForward(closeMap, fromIdx);
    const t = perfCloseAt(closeMap, toIdx);
    if (f === null || t === null || f === 0) return null;
    return ((t - f) / f) * 100;
  }

  // ── GET /api/performance — period & quarterly returns for all tickers ──
  // Query: start?, end? (custom range). Returns a flat array of rows:
  // { ticker, name, classification…, 1W,1M,3M,6M,12M, custom, Q1..Q4, lastClose }.
  // Same computation as POST /api/batch-performance, exposed as GET returning
  // the bare array (the client's fetchPerfData expects an array).
  app.get("/api/performance", (req, res) => {
    try {
      const customStart = (req.query.start as string) || undefined;
      const customEnd = (req.query.end as string) || undefined;

      const tickerDir = path.join(DATA_DIR, "tickers");
      const dates = getDates();
      const tickersMeta: any[] = (() => {
        try { return readJSON(path.join(DATA_DIR, "tickers.json")); } catch { return []; }
      })();
      if (!fs.existsSync(tickerDir) || dates.length === 0) {
        // No series data: return metadata rows with null returns so the table
        // still renders ticker/classification columns.
        return res.json(tickersMeta.map((m: any) => ({
          ticker: m.ticker, name: m.name || "",
          economy: m.economy || "", sector: m.sector || "", subsector: m.subsector || "",
          industryGroup: m.industryGroup || "", industry: m.industry || "", subindustry: m.subindustry || "",
          "1W": null, "1M": null, "3M": null, "6M": null, "12M": null,
          custom: null, Q1: null, Q2: null, Q3: null, Q4: null, lastClose: null,
        })));
      }

      const lastDate = dates[dates.length - 1];
      const periodOffsets: Record<string, number> = { "1W": 7, "1M": 30, "3M": 91, "6M": 182, "12M": 365 };

      let customFromIdx = -1, customToIdx = -1;
      if (customStart && customEnd) {
        customFromIdx = perfFindDateIdx(dates, customStart);
        customToIdx = perfFindDateIdx(dates, customEnd);
      }

      const firstYear = parseInt(dates[0].slice(0, 4));
      const lastYear = parseInt(lastDate.slice(0, 4));
      const qRanges: { quarter: number; fromIdx: number; toIdx: number }[] = [];
      for (let y = firstYear; y <= lastYear; y++) {
        for (const [q, from, to] of [[1, `${y}-01-01`, `${y}-03-31`], [2, `${y}-04-01`, `${y}-06-30`], [3, `${y}-07-01`, `${y}-09-30`], [4, `${y}-10-01`, `${y}-12-31`]] as [number, string, string][]) {
          const fi = perfFindDateIdx(dates, from), ti = perfFindDateIdx(dates, to);
          if (fi >= 0 && ti > fi) qRanges.push({ quarter: q, fromIdx: fi, toIdx: ti });
        }
      }

      const metaByTicker = new Map(tickersMeta.map((t: any) => [t.ticker, t]));
      const files = fs.readdirSync(tickerDir).filter((f) => f.endsWith(".json"));
      const rows: any[] = [];

      for (const file of files) {
        const ticker = file.replace(".json", "");
        const meta = metaByTicker.get(ticker);
        if (!meta) continue;
        const row: any = {
          ticker, name: meta.name || "",
          economy: meta.economy || "", sector: meta.sector || "", subsector: meta.subsector || "",
          industryGroup: meta.industryGroup || "", industry: meta.industry || "", subindustry: meta.subindustry || "",
          "1W": null, "1M": null, "3M": null, "6M": null, "12M": null,
          custom: null, Q1: null, Q2: null, Q3: null, Q4: null, lastClose: null,
        };
        try {
          const raw = readJSON(path.join(tickerDir, file));
          if (!raw.close) { rows.push(row); continue; }
          const closeMap = decodeMetricToMap(raw.close);
          let lastIdx = -1;
          for (const idx of closeMap.keys()) if (idx > lastIdx) lastIdx = idx;
          if (lastIdx < 0) { rows.push(row); continue; }
          row.lastClose = closeMap.get(lastIdx) ?? null;
          const tickerLastDate = lastIdx < dates.length ? dates[lastIdx] : lastDate;
          for (const [key, days] of Object.entries(periodOffsets)) {
            const startIdx = Math.max(0, perfFindDateIdx(dates, perfSubtractDays(tickerLastDate, days)));
            row[key] = perfReturn(closeMap, startIdx, lastIdx);
          }
          if (customFromIdx >= 0 && customToIdx >= 0) {
            row.custom = perfReturn(closeMap, customFromIdx, customToIdx);
          }
          const qReturns: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [] };
          for (const qr of qRanges) {
            const ret = perfReturn(closeMap, qr.fromIdx, qr.toIdx);
            if (ret !== null) qReturns[qr.quarter].push(ret);
          }
          for (const q of [1, 2, 3, 4]) {
            const arr = qReturns[q];
            if (arr.length) row[`Q${q}`] = arr.reduce((s, v) => s + v, 0) / arr.length;
          }
        } catch { /* skip */ }
        rows.push(row);
      }

      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "performance failed" });
    }
  });

  // ── GET /api/performance/monthly-seasonality ──
  // Returns array of { ticker, name, Jan..Dec (avg monthly % return), yearsOfData }.
  app.get("/api/performance/monthly-seasonality", (_req, res) => {
    try {
      const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const tickerDir = path.join(DATA_DIR, "tickers");
      const dates = getDates();
      const tickersMeta: any[] = (() => {
        try { return readJSON(path.join(DATA_DIR, "tickers.json")); } catch { return []; }
      })();
      if (!fs.existsSync(tickerDir) || dates.length === 0) {
        return res.json(tickersMeta.map((m: any) => {
          const row: any = { ticker: m.ticker, name: m.name || "", yearsOfData: 0 };
          for (const mo of MONTHS) row[mo] = null;
          return row;
        }));
      }
      const metaByTicker = new Map(tickersMeta.map((t: any) => [t.ticker, t]));
      const files = fs.readdirSync(tickerDir).filter((f) => f.endsWith(".json"));
      const rows: any[] = [];

      for (const file of files) {
        const ticker = file.replace(".json", "");
        const meta = metaByTicker.get(ticker);
        const row: any = { ticker, name: meta?.name || "", yearsOfData: 0 };
        for (const mo of MONTHS) row[mo] = null;
        try {
          const raw = readJSON(path.join(tickerDir, file));
          if (!raw.close) { rows.push(row); continue; }
          const closeMap = decodeMetricToMap(raw.close);
          // Collect month-end close per (year, month).
          const monthEnd = new Map<string, { idx: number; close: number }>();
          const years = new Set<number>();
          for (const [idx, close] of closeMap.entries()) {
            if (idx >= dates.length) continue;
            const d = dates[idx];
            const ym = d.slice(0, 7);
            const prev = monthEnd.get(ym);
            if (!prev || idx > prev.idx) monthEnd.set(ym, { idx, close });
            years.add(parseInt(d.slice(0, 4)));
          }
          row.yearsOfData = years.size;
          // Monthly return = (thisMonthEndClose / prevMonthEndClose - 1) * 100.
          const sortedKeys = [...monthEnd.keys()].sort();
          const byMonth: Record<number, number[]> = {};
          for (let i = 1; i < sortedKeys.length; i++) {
            const cur = monthEnd.get(sortedKeys[i])!;
            const prv = monthEnd.get(sortedKeys[i - 1])!;
            if (!prv.close) continue;
            const ret = (cur.close / prv.close - 1) * 100;
            const mo = parseInt(sortedKeys[i].slice(5, 7)); // 1..12
            (byMonth[mo] ||= []).push(ret);
          }
          for (let m = 1; m <= 12; m++) {
            const arr = byMonth[m];
            row[MONTHS[m - 1]] = arr && arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
          }
        } catch { /* skip */ }
        rows.push(row);
      }
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "monthly-seasonality failed" });
    }
  });

  // ── GET /api/performance/event-returns — forward returns around events ──
  // Query: kind (e.g. earnings). Returns array of
  // { ticker, name, eventCount, avg: {window: %}, winRate: {window: %} }
  // where windows are calendar-day offsets (-5,-3,-1,1,3,5,10).
  // Uses DATA_DIR/events.json (per-ticker event dates) when present.
  app.get("/api/performance/event-returns", (req, res) => {
    try {
      const PRE = [-5, -3, -1];
      const POST = [1, 3, 5, 10];
      const WINDOWS = [...PRE, ...POST];
      const tickerDir = path.join(DATA_DIR, "tickers");
      const dates = getDates();
      const tickersMeta: any[] = (() => {
        try { return readJSON(path.join(DATA_DIR, "tickers.json")); } catch { return []; }
      })();
      const metaByTicker = new Map(tickersMeta.map((t: any) => [t.ticker, t]));

      // events.json shape is flexible: { TICKER: [{date, type?}, ...] } or
      // an array of { ticker, date, type }. Normalise to Map<ticker, dates[]>.
      const eventsByTicker = new Map<string, string[]>();
      const eventsPath = path.join(DATA_DIR, "events.json");
      const kind = (req.query.kind as string) || "";
      if (fs.existsSync(eventsPath)) {
        try {
          const ev = readJSON(eventsPath);
          const push = (tk: string, d: string) => {
            if (!d) return;
            let arr = eventsByTicker.get(tk);
            if (!arr) { arr = []; eventsByTicker.set(tk, arr); }
            arr.push(d);
          };
          if (Array.isArray(ev)) {
            for (const e of ev) {
              if (kind && e.type && String(e.type).toLowerCase() !== kind.toLowerCase()) continue;
              if (e.ticker && e.date) push(String(e.ticker).toUpperCase(), String(e.date));
            }
          } else if (ev && typeof ev === "object") {
            for (const [tk, list] of Object.entries(ev)) {
              const arr = Array.isArray(list) ? list : [];
              for (const e of arr as any[]) {
                const d = typeof e === "string" ? e : e?.date;
                const ty = typeof e === "object" ? e?.type : undefined;
                if (kind && ty && String(ty).toLowerCase() !== kind.toLowerCase()) continue;
                if (d) push(tk.toUpperCase(), String(d));
              }
            }
          }
        } catch { /* ignore malformed events */ }
      }

      if (!fs.existsSync(tickerDir) || dates.length === 0) {
        return res.json(tickersMeta.map((m: any) => ({
          ticker: m.ticker, name: m.name || "", eventCount: 0,
          avg: Object.fromEntries(WINDOWS.map((w) => [w, null])),
          winRate: Object.fromEntries(WINDOWS.map((w) => [w, null])),
        })));
      }

      const files = fs.readdirSync(tickerDir).filter((f) => f.endsWith(".json"));
      const rows: any[] = [];
      for (const file of files) {
        const ticker = file.replace(".json", "");
        const meta = metaByTicker.get(ticker);
        const evDates = eventsByTicker.get(ticker) || [];
        const row: any = {
          ticker, name: meta?.name || "", eventCount: 0,
          avg: Object.fromEntries(WINDOWS.map((w) => [w, null])),
          winRate: Object.fromEntries(WINDOWS.map((w) => [w, null])),
        };
        if (!evDates.length) { rows.push(row); continue; }
        try {
          const raw = readJSON(path.join(tickerDir, file));
          if (!raw.close) { rows.push(row); continue; }
          const closeMap = decodeMetricToMap(raw.close);
          const collected: Record<number, number[]> = {};
          for (const w of WINDOWS) collected[w] = [];
          let count = 0;
          for (const ed of evDates) {
            const evIdx = perfFindDateIdx(dates, ed);
            if (evIdx < 0) continue;
            const base = perfCloseAt(closeMap, evIdx);
            if (base === null || base === 0) continue;
            count++;
            for (const w of WINDOWS) {
              const targetDate = perfSubtractDays(dates[evIdx], -w); // +w days
              const ti = perfFindDateIdx(dates, targetDate);
              const px = w < 0 ? perfCloseAt(closeMap, ti) : perfCloseAtForward(closeMap, ti);
              if (px === null) continue;
              collected[w].push(((px - base) / base) * 100);
            }
          }
          row.eventCount = count;
          for (const w of WINDOWS) {
            const arr = collected[w];
            if (arr.length) {
              row.avg[w] = arr.reduce((s, v) => s + v, 0) / arr.length;
              row.winRate[w] = (arr.filter((v) => v > 0).length / arr.length) * 100;
            }
          }
        } catch { /* skip */ }
        rows.push(row);
      }
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "event-returns failed" });
    }
  });

  // ── GET /api/performance/seasonal-patterns — recurring calendar windows ──
  // Query: minYears?, minDays?, maxDays?. Returns array of
  // { ticker, name, yearsOfData, bullish: Win[], bearish: Win[] } where
  // Win = { startLabel, endLabel, calendarDays, avgReturn, medianReturn,
  //         winRate, years, tStat, startMMDD, endMMDD }.
  app.get("/api/performance/seasonal-patterns", (req, res) => {
    try {
      const minYears = parseInt(req.query.minYears as string) || 5;
      const minDays = parseInt(req.query.minDays as string) || 5;
      const maxDays = parseInt(req.query.maxDays as string) || 30;
      const tickerDir = path.join(DATA_DIR, "tickers");
      const dates = getDates();
      const tickersMeta: any[] = (() => {
        try { return readJSON(path.join(DATA_DIR, "tickers.json")); } catch { return []; }
      })();
      const metaByTicker = new Map(tickersMeta.map((t: any) => [t.ticker, t]));
      if (!fs.existsSync(tickerDir) || dates.length === 0) {
        return res.json(tickersMeta.map((m: any) => ({
          ticker: m.ticker, name: m.name || "", yearsOfData: 0, bullish: [], bearish: [],
        })));
      }

      const mmdd = (d: string) => d.slice(5); // MM-DD
      const labelOf = (d: string) => {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[parseInt(d.slice(5, 7)) - 1]} ${parseInt(d.slice(8, 10))}`;
      };
      const median = (a: number[]) => {
        const s = [...a].sort((x, y) => x - y); const m = s.length;
        return m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2;
      };

      const files = fs.readdirSync(tickerDir).filter((f) => f.endsWith(".json"));
      const rows: any[] = [];
      // Candidate windows: each calendar month start, with several durations.
      const starts = ["01-01", "02-01", "03-01", "04-01", "05-01", "06-01", "07-01", "08-01", "09-01", "10-01", "11-01", "12-01"];
      const durations = [minDays, Math.round((minDays + maxDays) / 2), maxDays].filter((v, i, arr) => arr.indexOf(v) === i);

      for (const file of files) {
        const ticker = file.replace(".json", "");
        const meta = metaByTicker.get(ticker);
        const row: any = { ticker, name: meta?.name || "", yearsOfData: 0, bullish: [], bearish: [] };
        try {
          const raw = readJSON(path.join(tickerDir, file));
          if (!raw.close) { rows.push(row); continue; }
          const closeMap = decodeMetricToMap(raw.close);
          const yearSet = new Set<number>();
          for (const idx of closeMap.keys()) if (idx < dates.length) yearSet.add(parseInt(dates[idx].slice(0, 4)));
          const years = [...yearSet].sort();
          row.yearsOfData = years.length;
          if (years.length < minYears) { rows.push(row); continue; }

          const windows: any[] = [];
          for (const sMMDD of starts) {
            for (const dur of durations) {
              const rets: number[] = [];
              let startD = "", endD = "";
              for (const y of years) {
                const sDate = `${y}-${sMMDD}`;
                const eDateRaw = perfSubtractDays(sDate, -dur);
                const si = perfFindDateIdx(dates, sDate);
                const ei = perfFindDateIdx(dates, eDateRaw);
                if (si < 0 || ei <= si) continue;
                const r = perfReturn(closeMap, si, ei);
                if (r === null) continue;
                rets.push(r);
                if (!startD) { startD = sDate; endD = eDateRaw; }
              }
              if (rets.length < minYears) continue;
              const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
              const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, rets.length - 1);
              const std = Math.sqrt(variance);
              const tStat = std === 0 ? 0 : (mean / (std / Math.sqrt(rets.length)));
              windows.push({
                startLabel: labelOf(startD), endLabel: labelOf(endD),
                startMMDD: mmdd(startD), endMMDD: mmdd(endD),
                calendarDays: dur, avgReturn: mean, medianReturn: median(rets),
                winRate: (rets.filter((v) => v > 0).length / rets.length) * 100,
                years: rets.length, tStat,
              });
            }
          }
          // Bullish = highest positive t-stat; bearish = lowest negative t-stat.
          const sortedByT = [...windows].sort((a, b) => b.tStat - a.tStat);
          row.bullish = sortedByT.filter((w) => w.avgReturn > 0).slice(0, 5);
          row.bearish = sortedByT.filter((w) => w.avgReturn < 0).sort((a, b) => a.tStat - b.tStat).slice(0, 5);
        } catch { /* skip */ }
        rows.push(row);
      }
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "seasonal-patterns failed" });
    }
  });

  // ── POST /api/basket/ohlc — equal-weighted basket OHLCV ──
  // Body: { basket: { tickers: string[], weights?: number[] }, dateRange? }
  // Returns array of { date, open, high, low, close, volume } where each bar is
  // a weighted index (rebased to 100 at the first common date) of constituents.
  app.post("/api/basket/ohlc", (req, res) => {
    try {
      const basket = (req.body as any)?.basket || {};
      const tickers: string[] = (basket.tickers || []).map((t: string) => String(t).toUpperCase());
      const weights: number[] | undefined = basket.weights;
      const dateRange = (req.body as any)?.dateRange;
      if (!tickers.length) return res.json([]);
      const dates = getDates();

      // Load constituent close/open/high/low maps.
      const constituents = tickers
        .map((tk) => {
          const raw = readTickerRaw(tk);
          if (!raw || !raw.close) return null;
          return {
            ticker: tk,
            close: decodeMetricToMap(raw.close),
            open: decodeMetricToMap(raw.open || []),
            high: decodeMetricToMap(raw.high || []),
            low: decodeMetricToMap(raw.low || []),
            vol: decodeMetricToMap(raw.volume || raw.Volume || []),
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      if (!constituents.length) return res.json([]);

      const w = weights && weights.length === constituents.length
        ? weights
        : new Array(constituents.length).fill(1 / constituents.length);
      const wSum = w.reduce((s, v) => s + v, 0) || 1;
      const wn = w.map((v) => v / wSum);

      // Per-constituent first-available close (for rebasing to an index).
      const bases = constituents.map((c) => {
        let firstIdx = Infinity, firstClose = NaN;
        for (const [idx, val] of c.close.entries()) if (idx < firstIdx) { firstIdx = idx; firstClose = val; }
        return firstClose;
      });

      let startStr: string | undefined, endStr: string | undefined;
      if (dateRange) {
        startStr = dateRange.start ?? dateRange.startDate;
        endStr = dateRange.end ?? dateRange.endDate;
      }

      const bars: any[] = [];
      for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        if (startStr && d < startStr) continue;
        if (endStr && d > endStr) continue;
        let o = 0, h = 0, l = 0, c = 0, v = 0, totW = 0;
        let any = false;
        for (let k = 0; k < constituents.length; k++) {
          const con = constituents[k];
          const cl = con.close.get(i);
          if (cl === undefined || !Number.isFinite(bases[k]) || bases[k] === 0) continue;
          any = true;
          const wk = wn[k];
          totW += wk;
          const idxC = (cl / bases[k]) * 100;
          const idxO = ((con.open.get(i) ?? cl) / bases[k]) * 100;
          const idxH = ((con.high.get(i) ?? cl) / bases[k]) * 100;
          const idxL = ((con.low.get(i) ?? cl) / bases[k]) * 100;
          o += idxO * wk; h += idxH * wk; l += idxL * wk; c += idxC * wk;
          v += (con.vol.get(i) ?? 0) * wk;
        }
        if (!any || totW === 0) continue;
        bars.push({ date: d, open: o / totW, high: h / totW, low: l / totW, close: c / totW, volume: v });
      }
      res.json(bars);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "basket/ohlc failed" });
    }
  });

  // ── POST /api/basket/series — equal-weighted basket metric/price series ──
  // Body: { basket: { tickers: string[], weights?: number[] }, metric? }
  // Returns { closes, highs, lows, opens, volumes, priceDates } — the basket
  // index series, matching the workbook/series shape consumers expect.
  app.post("/api/basket/series", (req, res) => {
    try {
      const basket = (req.body as any)?.basket || {};
      const metric: string | undefined = (req.body as any)?.metric || basket.metric;
      const tickers: string[] = (basket.tickers || []).map((t: string) => String(t).toUpperCase());
      const weights: number[] | undefined = basket.weights;
      const empty = { closes: [], highs: [], lows: [], opens: [], volumes: [], priceDates: [] };
      if (!tickers.length) return res.json(empty);
      const dates = getDates();

      if (metric) {
        // Weighted average of a non-price metric across constituents per date.
        const maps = tickers
          .map((tk) => { const raw = readTickerRaw(tk); return raw && raw[metric] ? decodeMetricToMap(raw[metric]) : null; })
          .filter((m): m is Map<number, number> => m !== null);
        if (!maps.length) return res.json(empty);
        const w = weights && weights.length === maps.length ? weights : new Array(maps.length).fill(1);
        const closes: number[] = [], pdates: string[] = [];
        for (let i = 0; i < dates.length; i++) {
          let sum = 0, totW = 0;
          for (let k = 0; k < maps.length; k++) {
            const val = maps[k].get(i);
            if (val === undefined) continue;
            sum += val * w[k]; totW += w[k];
          }
          if (totW === 0) continue;
          closes.push(sum / totW); pdates.push(dates[i]);
        }
        return res.json({
          closes, highs: closes, lows: closes, opens: closes,
          volumes: new Array(closes.length).fill(0), priceDates: pdates, metric,
        });
      }

      // Default: reuse the basket OHLC index and reshape to parallel arrays.
      const constituents = tickers
        .map((tk) => { const raw = readTickerRaw(tk); return raw && raw.close ? decodeMetricToMap(raw.close) : null; })
        .filter((m): m is Map<number, number> => m !== null);
      if (!constituents.length) return res.json(empty);
      const w = weights && weights.length === constituents.length ? weights : new Array(constituents.length).fill(1);
      const bases = constituents.map((m) => {
        let firstIdx = Infinity, firstClose = NaN;
        for (const [idx, val] of m.entries()) if (idx < firstIdx) { firstIdx = idx; firstClose = val; }
        return firstClose;
      });
      const closes: number[] = [], pdates: string[] = [];
      for (let i = 0; i < dates.length; i++) {
        let sum = 0, totW = 0;
        for (let k = 0; k < constituents.length; k++) {
          const cl = constituents[k].get(i);
          if (cl === undefined || !Number.isFinite(bases[k]) || bases[k] === 0) continue;
          sum += (cl / bases[k]) * 100 * w[k]; totW += w[k];
        }
        if (totW === 0) continue;
        closes.push(sum / totW); pdates.push(dates[i]);
      }
      res.json({
        closes, highs: closes, lows: closes, opens: closes,
        volumes: new Array(closes.length).fill(0), priceDates: pdates,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "basket/series failed" });
    }
  });
}
