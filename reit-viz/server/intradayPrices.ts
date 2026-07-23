// Intraday (hourly/sub-hourly) price history from Yahoo Finance's v8 chart
// endpoint — same source and symbol mapping as yahooPrices.ts, but with
// epoch-second bar timestamps and a short cache TTL (intraday goes stale).
//
// Yahoo range limits by interval: 60m → ~730 days, 30m/15m → ~60 days,
// 5m → ~60 days, 1m → ~7 days. We clamp the requested range accordingly.

import fs from "fs";
import path from "path";
import { toYahooSymbol } from "./yahooPrices";

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const CACHE_DIR = path.join(process.cwd(), "data", "yahoo-intraday-cache");
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 min — intraday bars update through the session

export const INTRADAY_INTERVALS: Record<string, { yahooInterval: string; maxDays: number }> = {
  "60m": { yahooInterval: "60m", maxDays: 729 },
  "30m": { yahooInterval: "30m", maxDays: 59 },
  "15m": { yahooInterval: "15m", maxDays: 59 },
};

export interface IntradayPriceData {
  ticker: string;
  interval: string;
  /** Epoch seconds (UTC) for each bar's session slot start. */
  timestamps: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
  fetchedAt: string;
}

function cacheFile(ticker: string, interval: string): string {
  return path.join(CACHE_DIR, `${ticker.toUpperCase()}-${interval}.json`);
}

function readCache(ticker: string, interval: string): IntradayPriceData | null {
  try {
    const fp = cacheFile(ticker, interval);
    const stat = fs.statSync(fp);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as IntradayPriceData;
  } catch {
    return null;
  }
}

function writeCache(data: IntradayPriceData): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile(data.ticker, data.interval), JSON.stringify(data));
  } catch {
    /* best-effort */
  }
}

export async function fetchYahooIntraday(
  ticker: string,
  interval = "60m",
  days?: number,
): Promise<IntradayPriceData> {
  const sym = (ticker ?? "").toUpperCase();
  if (!sym) throw new Error("ticker is required");
  const spec = INTRADAY_INTERVALS[interval];
  if (!spec) throw new Error(`unsupported interval "${interval}" (use ${Object.keys(INTRADAY_INTERVALS).join("/")})`);

  // The cache is keyed by ticker+interval only, so it must always hold the
  // FULL range — fetch maxDays regardless of the request and slice on return
  // (otherwise a small-`days` request would poison the cache for larger ones).
  const rangeDays = Math.min(Math.max(1, days ?? spec.maxDays), spec.maxDays);

  const cached = readCache(sym, interval);
  if (cached) return sliceToDays(cached, rangeDays);

  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - spec.maxDays * 86400;
  const yahooSym = toYahooSymbol(sym);
  const url =
    `${CHART_BASE}/${encodeURIComponent(yahooSym)}` +
    `?period1=${period1}&period2=${period2}` +
    `&interval=${spec.yahooInterval}&includePrePost=false`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!resp.ok) throw new Error(`Yahoo intraday request failed (${resp.status}) for ${sym}`);
  const body: any = await resp.json();
  const result = body?.chart?.result?.[0];
  if (!result) {
    const desc = body?.chart?.error?.description;
    throw new Error(desc ? `Yahoo: ${desc}` : `No intraday data for ${sym}`);
  }

  const ts: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const timestamps: number[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = quote.close?.[i];
    if (c == null || !Number.isFinite(c)) continue; // drop null bars (halts etc.)
    timestamps.push(ts[i]);
    closes.push(c);
    opens.push(Number.isFinite(quote.open?.[i]) ? quote.open[i] : c);
    highs.push(Number.isFinite(quote.high?.[i]) ? quote.high[i] : c);
    lows.push(Number.isFinite(quote.low?.[i]) ? quote.low[i] : c);
    volumes.push(Number.isFinite(quote.volume?.[i]) ? quote.volume[i] : 0);
  }

  const data: IntradayPriceData = {
    ticker: sym,
    interval,
    timestamps,
    opens,
    highs,
    lows,
    closes,
    volumes,
    fetchedAt: new Date().toISOString(),
  };
  writeCache(data);
  return sliceToDays(data, rangeDays);
}

/** Trim a full-range series to the trailing `days` calendar days. */
function sliceToDays(data: IntradayPriceData, days: number): IntradayPriceData {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const { timestamps } = data;
  if (!timestamps.length || timestamps[0] >= cutoff) return data;
  let start = 0;
  while (start < timestamps.length && timestamps[start] < cutoff) start++;
  return {
    ...data,
    timestamps: timestamps.slice(start),
    opens: data.opens.slice(start),
    highs: data.highs.slice(start),
    lows: data.lows.slice(start),
    closes: data.closes.slice(start),
    volumes: data.volumes.slice(start),
  };
}
