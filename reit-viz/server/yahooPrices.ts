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
  /** Listing currency from Yahoo (e.g. "USD", "GBP", "GBp" for pence). Needed to
   *  convert price-based figures ($ ADV) to USD for non-US names. */
  currency?: string;
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

// The app's internal symbols use FactSet regional suffixes for non-US listings
// (e.g. "BLND-GB" for a UK/London name). Yahoo Finance uses its own exchange
// suffixes (e.g. "BLND.L"), so an unmapped "-GB" symbol is unknown to Yahoo and
// returns no data — which is why non-US names had no $ ADV / price history.
// Translate to the Yahoo form for the request only; the cache key, the returned
// `ticker`, and error messages stay the internal symbol so callers are
// unaffected.
//
// Countries with more than one venue Yahoo splits by suffix (Korea KOSPI/KOSDAQ,
// India NSE/BSE, Canada TSX/TSXV, Taiwan TWSE/TPEx…) list every candidate;
// fetchYahooPrices tries them in order and keeps the first that returns data.
const YAHOO_EXCHANGE_SUFFIXES: Record<string, string[]> = {
  GB: ["L"], FR: ["PA"], ES: ["MC"], NL: ["AS"],
  JP: ["T"], TW: ["TW", "TWO"], HK: ["HK"], KR: ["KS", "KQ"],
  CA: ["TO", "V"], AU: ["AX"], NZ: ["NZ"],
  DE: ["DE", "F"], IT: ["MI"], SE: ["ST"], CH: ["SW"], DK: ["CO"],
  NO: ["OL"], FI: ["HE"], BE: ["BR"], PT: ["LS"], AT: ["VI"],
  IE: ["IR", "L"], PL: ["WA"], GR: ["AT"], CZ: ["PR"], HU: ["BD"],
  TR: ["IS"], IL: ["TA"], SA: ["SR"], QA: ["QA"], KW: ["KW"], AE: ["AD", "DU"],
  IN: ["NS", "BO"], SG: ["SI"], TH: ["BK"], MY: ["KL"], ID: ["JK"], PH: ["PS"],
  BR: ["SA"], MX: ["MX"], CL: ["SN"], AR: ["BA"], CO: ["CL"], PE: ["LM"],
  ZA: ["JO"], EG: ["CA"],
};

/** All candidate Yahoo symbols for an internal symbol, best guess first. */
export function yahooSymbolCandidates(sym: string): string[] {
  const m = sym.match(/^(.+)-([A-Z]{2})$/);
  if (!m) return [sym];
  let base = m[1];
  const cc = m[2];
  // US listings: strip the region and use Yahoo's dash form for share classes
  // (BRK.B-US → BRK-B).
  if (cc === "US") return [base.replace(/\./g, "-")];
  // Mainland China splits by code prefix: 60/68/9 → Shanghai, 0/2/3 → Shenzhen,
  // 4/8 (ex-legacy) → Beijing. Compute rather than probe.
  if (cc === "CN" && /^\d+$/.test(base)) {
    if (/^(60|68|9)/.test(base)) return [`${base}.SS`, `${base}.SZ`];
    if (/^(0|2|3)/.test(base)) return [`${base}.SZ`, `${base}.SS`];
    return [`${base}.BJ`, `${base}.SS`, `${base}.SZ`];
  }
  // Hong Kong codes are zero-padded to 4 digits on Yahoo (700 → 0700.HK).
  if (cc === "HK" && /^\d+$/.test(base)) base = base.padStart(4, "0");
  // Borsa Istanbul: FactSet appends an ".E" equity-class marker (ASELS.E-TR)
  // that Yahoo's ASELS.IS form doesn't carry.
  if (cc === "TR") base = base.replace(/\.E$/, "");
  const suffixes = YAHOO_EXCHANGE_SUFFIXES[cc];
  if (!suffixes) return [sym];
  // Share classes use a dot in FactSet symbols (INVE.B-SE, NOVO.B-DK, BAM.A-CA)
  // but a dash on Yahoo (INVE-B.ST, NOVO-B.CO, BAM-A.TO).
  base = base.replace(/\./g, "-");
  return suffixes.map((yx) => `${base}.${yx}`);
}

/** True when the internal symbol's country suffix has a Yahoo mapping (or none is needed). */
export function isYahooMappable(sym: string): boolean {
  const m = sym.match(/^(.+)-([A-Z]{2})$/);
  if (!m) return true; // plain symbol — passed through as-is
  return m[2] === "CN" || m[2] === "US" || YAHOO_EXCHANGE_SUFFIXES[m[2]] !== undefined;
}

export function toYahooSymbol(sym: string): string {
  return yahooSymbolCandidates(sym)[0];
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
  // Request Yahoo with its own exchange-suffix form (e.g. BLND-GB → BLND.L);
  // the cache and returned data stay keyed on the internal `sym`. Ambiguous
  // markets list several candidate suffixes — try each until one returns data,
  // treating a notFound only as final after the last candidate.
  const candidates = yahooSymbolCandidates(sym);
  let json: any = null;
  let lastErr: any = null;
  for (let ci = 0; ci < candidates.length; ci++) {
    const url =
      `${CHART_BASE}/${encodeURIComponent(candidates[ci])}` +
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
    // Parse the body even on a non-2xx status: Yahoo returns a chart.error
    // ("Not Found · No data found, symbol may be delisted") for delisted/unknown
    // symbols, usually with a 404. We want that specific signal — flagged as
    // `notFound` — so callers can tell "delisted" apart from a transient failure.
    const body: any = await resp.json().catch(() => null);
    const chartErr = body?.chart?.error;
    if (chartErr) {
      const err: any = new Error(chartErr.description || chartErr.code || `Yahoo error for ${sym}`);
      if (/not\s*found|delisted/i.test(`${chartErr.code ?? ""} ${chartErr.description ?? ""}`)) {
        err.notFound = true;
        lastErr = err;
        continue; // unknown on this venue — try the next candidate suffix
      }
      throw err;
    }
    if (!resp.ok) {
      throw new Error(`Yahoo chart API returned HTTP ${resp.status} for ${sym}`);
    }
    json = body;
    break;
  }
  if (json == null) throw lastErr ?? new Error(`No Yahoo data for ${sym}`);
  const result = json?.chart?.result?.[0];
  const currency: string | undefined = result?.meta?.currency ?? undefined;
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
    currency,
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
