// Real Yahoo Finance price-history fetcher with a small on-disk cache.
// Reconstructed to match the API contract in routes.ts and the client consumer
// (client/src/pages/SigmaMove.tsx reads `dates`, `adjCloses ?? closes`, `fetchedAt`).
//
// NOTE: we deliberately do NOT use the `yahoo-finance2` dependency. The version
// pinned in this tree (2.14.0) ships a broken build whose entry only registers the
// `quote`/`autoc` modules — `chart`/`historical` are absent — so it cannot return
// price history. Instead we call Yahoo's stable v8 chart endpoint directly with
// Node's built-in fetch (Node 18+), which is exactly what the library does internally.
import fs from "fs";
import path from "path";

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

export interface YahooPriceData {
  ticker: string;
  dates: string[]; // ISO yyyy-mm-dd, ascending
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  adjCloses: number[];
  volumes: number[];
  fetchedAt: string; // ISO timestamp of the fetch
}

const CACHE_DIR = path.join(process.cwd(), "data", "yahoo-cache");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — refresh endpoints bypass this via forceRefresh
const HISTORY_START = "2010-01-01"; // generous lookback for vol / return-distribution math

function cacheFile(ticker: string): string {
  return path.join(CACHE_DIR, `${ticker.toUpperCase()}.json`);
}

function readCache(ticker: string): YahooPriceData | null {
  try {
    const fp = cacheFile(ticker);
    const stat = fs.statSync(fp);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as YahooPriceData;
  } catch {
    return null;
  }
}

function writeCache(data: YahooPriceData): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile(data.ticker), JSON.stringify(data));
  } catch {
    /* cache is best-effort — never fail a request because the cache write failed */
  }
}

/**
 * Fetch daily OHLCV + adjusted close history for a ticker from Yahoo Finance.
 * Results are cached on disk for CACHE_TTL_MS unless `forceRefresh` is set.
 */
export async function fetchYahooPrices(
  ticker: string,
  forceRefresh = false,
): Promise<YahooPriceData> {
  const sym = (ticker ?? "").toUpperCase();
  if (!sym) throw new Error("ticker is required");

  if (!forceRefresh) {
    const cached = readCache(sym);
    if (cached) return cached;
  }

  const period1 = Math.floor(new Date(HISTORY_START).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const url =
    `${CHART_BASE}/${encodeURIComponent(sym)}` +
    `?period1=${period1}&period2=${period2}` +
    `&interval=1d&includePrePost=false&events=div%2Csplit&includeAdjustedClose=true`;

  const resp = await fetch(url, {
    headers: {
      // Yahoo rate-limits/blocks requests without a browser-like User-Agent.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    throw new Error(`Yahoo chart API returned HTTP ${resp.status} for ${sym}`);
  }

  const json: any = await resp.json();
  if (json?.chart?.error) {
    throw new Error(json.chart.error?.description || `Yahoo error for ${sym}`);
  }
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adj = result?.indicators?.adjclose?.[0]?.adjclose ?? [];

  const dates: string[] = [];
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const adjCloses: number[] = [];
  const volumes: number[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    if (timestamps[i] == null || close == null) continue; // skip holidays / null bars
    dates.push(new Date(timestamps[i] * 1000).toISOString().slice(0, 10));
    opens.push(quote.open?.[i] ?? close);
    highs.push(quote.high?.[i] ?? close);
    lows.push(quote.low?.[i] ?? close);
    closes.push(close);
    adjCloses.push(adj?.[i] ?? close);
    volumes.push(quote.volume?.[i] ?? 0);
  }

  if (dates.length === 0) {
    throw new Error(`No price data returned for ${sym}`);
  }

  const data: YahooPriceData = {
    ticker: sym,
    dates,
    opens,
    highs,
    lows,
    closes,
    adjCloses,
    volumes,
    fetchedAt: new Date().toISOString(),
  };
  writeCache(data);
  return data;
}

/** Clear the on-disk Yahoo price cache. */
export function clearCache(): void {
  try {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
