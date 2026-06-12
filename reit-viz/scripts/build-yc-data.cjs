#!/usr/bin/env node
/**
 * Build the data.json bundle consumed by reit-yc-backend (Yield Correlation tab).
 *
 * Sources (live, no workbook):
 *   - Treasury yields (DGS2, DGS5, DGS10) from FRED CSV
 *   - 10Y TIPS real yield (DFII10) from FRED CSV
 *   - 10Y breakeven (T10YIE) from FRED CSV
 *   - Per-ticker daily adjusted closes from Yahoo Finance
 *
 * Output format (matches what reit-yc-backend/server.js expects):
 *   {
 *     tickers: ["ADC","AHR",...],
 *     timeSeries: [
 *       { date: "YYYY-MM-DD",
 *         yield2y, yield5y, yield10y, realYield10y, breakeven10y,
 *         <TICKER>: <close>, ... },
 *       ...
 *     ],
 *     startDate, endDate, dataPoints, lastUpdated
 *   }
 *
 * Usage:
 *   node scripts/build-yc-data.cjs [output_path]
 *   default output: yield-corr-backend/data.json
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const OUTPUT_PATH = process.argv[2] || path.join(__dirname, "..", "yield-corr-backend", "data.json");
const START_DATE = "2006-06-15";

// Optional: read FRED series from a local prefetched-macro folder instead of
// hitting fredgraph.csv. The daily prefetch-macro cron already writes these
// files; reading them avoids double-fetching and works in environments where
// FRED is rate-limiting us.
//   FRED_LOCAL_DIR= path to dir containing {series_id}.json (array of {time, value})
const FRED_LOCAL_DIR = process.env.FRED_LOCAL_DIR ||
  path.join(__dirname, "..", "dist", "public", "data", "macro");

// 83 tickers from the existing data.json (preserved order)
const TICKERS = [
  "ADC","AHR","AKR","AMH","AMT","APLE","ARE","AVB","BNL","BRX","BXP","CCI",
  "CDP","COLD","CPT","CTRE","CUBE","CUZ","DEI","DLR","DOC","DRH","EGP","ELS",
  "EPR","EPRT","EQIX","EQR","ESRT","ESS","EXR","FCPT","FR","FRT","GLPI","HIW",
  "HR","HST","INVH","IRM","IRT","KIM","KRC","KRG","LAMR","LINE","LXP","MAA",
  "MAC","MPT","NHI","NNN","NSA","NTST","O","OHI","OUT","PEB","PECO","PK",
  "PLD","PSA","REG","REXR","RHP","RYN","SBAC","SBRA","SKT","SLG","SMA","SPG",
  "STAG","SUI","TRNO","UDR","VICI","VNO","VNQ","VTR","WELL","WPC","WY"
];

// FRED series → output column name
const FRED_SERIES = {
  DGS2:   "yield2y",
  DGS5:   "yield5y",
  DGS10:  "yield10y",
  DFII10: "realYield10y",
  T10YIE: "breakeven10y",
};

// ───────────── HTTP helpers ─────────────

function httpGetOnce(url, headers = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0", ...headers } }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGetOnce(res.headers.location, headers, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
  });
}

async function httpGet(url, headers = {}, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await httpGetOnce(url, headers);
    } catch (e) {
      lastErr = e;
      const wait = 500 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

function readFredLocal(seriesId) {
  const p = path.join(FRED_LOCAL_DIR, `${seriesId}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    const arr = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!Array.isArray(arr)) return null;
    const out = new Map();
    for (const pt of arr) {
      if (pt && typeof pt === "object" && pt.time && Number.isFinite(pt.value)) {
        out.set(pt.time, pt.value);
      }
    }
    return out.size > 0 ? out : null;
  } catch {
    return null;
  }
}

async function fetchFredCsv(seriesId) {
  // Prefer local prefetched JSON if present
  const local = readFredLocal(seriesId);
  if (local) return local;

  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}&cosd=${START_DATE}`;
  // Use curl: Node's https.get hangs against fredgraph.csv from this sandbox.
  // Curl is reliable and already on PATH.
  const csv = execFileSync(
    "curl",
    [
      "-sS", "--http1.1", "--max-time", "45",
      "--retry", "4", "--retry-delay", "3", "--retry-connrefused",
      "-A", "Mozilla/5.0", url,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
  );
  const lines = csv.trim().split("\n");
  // skip header
  const out = new Map();
  for (let i = 1; i < lines.length; i++) {
    const [date, val] = lines[i].split(",");
    if (!date || val === undefined) continue;
    const trimmed = val.trim();
    if (trimmed === "." || trimmed === "" || trimmed === "NaN") continue;
    const num = parseFloat(trimmed);
    if (Number.isFinite(num)) out.set(date, num);
  }
  return out; // Map<date, value>
}

async function fetchYahoo(ticker) {
  const start = Math.floor(new Date(START_DATE).getTime() / 1000);
  const end = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${start}&period2=${end}&interval=1d`;
  const body = await httpGet(url);
  const j = JSON.parse(body);
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo: empty result for ${ticker}`);
  const ts = result.timestamp || [];
  const indicators = result.indicators || {};
  // Prefer adjusted close
  const adj = indicators.adjclose?.[0]?.adjclose || indicators.quote?.[0]?.close || [];
  const out = new Map();
  for (let i = 0; i < ts.length; i++) {
    const v = adj[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    // Use UTC date as Yahoo timestamps are UTC (00:00 UTC of the trading session)
    const d = new Date(ts[i] * 1000);
    const date = d.toISOString().slice(0, 10);
    out.set(date, Math.round(v * 100) / 100);
  }
  return out;
}

// Run promises with a concurrency limit
async function pool(tasks, concurrency = 8) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      try {
        results[idx] = await tasks[idx]();
      } catch (e) {
        results[idx] = { __error: e.message };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// ───────────── Main ─────────────

async function main() {
  console.log(`Building YC data → ${OUTPUT_PATH}`);
  console.log(`  ${Object.keys(FRED_SERIES).length} FRED series, ${TICKERS.length} tickers`);

  // 1. FRED — prefer local prefetched JSON, else fetch CSV (serial)
  console.log(`\nFetching FRED (local dir = ${FRED_LOCAL_DIR})…`);
  const fredMaps = {};
  for (const id of Object.keys(FRED_SERIES)) {
    try {
      const m = await fetchFredCsv(id);
      const last = [...m.keys()].sort().pop();
      const src = readFredLocal(id) ? "local" : "network";
      console.log(`  ✓ ${id} (${FRED_SERIES[id]}, ${src}): ${m.size} pts, last=${last}`);
      fredMaps[id] = m;
    } catch (e) {
      console.error(`  ✗ ${id}: ${e.message}`);
      fredMaps[id] = new Map();
    }
  }

  // 2. Yahoo in parallel (capped concurrency)
  console.log("\nFetching Yahoo…");
  const yahooTasks = TICKERS.map((t) => async () => {
    try {
      const m = await fetchYahoo(t);
      return { ticker: t, map: m };
    } catch (e) {
      return { ticker: t, map: new Map(), error: e.message };
    }
  });
  const yahooResults = await pool(yahooTasks, 8);
  const yahooMaps = {};
  let yahooOk = 0, yahooFail = 0;
  for (const r of yahooResults) {
    if (r.error || r.map.size === 0) {
      console.error(`  ✗ ${r.ticker}: ${r.error || "no data"}`);
      yahooFail++;
    } else {
      yahooMaps[r.ticker] = r.map;
      yahooOk++;
    }
  }
  console.log(`  ${yahooOk} ok, ${yahooFail} failed`);

  // 3. Build the union of all dates from yields (yields are the "spine")
  // Use the intersection of yield2y, yield5y, yield10y dates (these are the
  // primary required series; tickers/real/breakeven optional per-row).
  const yieldDates = new Set();
  for (const m of [fredMaps.DGS2, fredMaps.DGS5, fredMaps.DGS10]) {
    for (const d of m.keys()) yieldDates.add(d);
  }
  // Require all 3 yields present on a date
  const validDates = [...yieldDates]
    .filter((d) => fredMaps.DGS2.has(d) && fredMaps.DGS5.has(d) && fredMaps.DGS10.has(d))
    .sort();

  console.log(`\nBuilding rows: ${validDates.length} valid dates`);

  const timeSeries = [];
  for (const date of validDates) {
    const row = { date };
    // Yields (always present by construction for the 3 nominal; conditional for the others)
    row.yield2y = fredMaps.DGS2.get(date);
    row.yield5y = fredMaps.DGS5.get(date);
    row.yield10y = fredMaps.DGS10.get(date);
    if (fredMaps.DFII10.has(date)) row.realYield10y = fredMaps.DFII10.get(date);
    if (fredMaps.T10YIE.has(date)) row.breakeven10y = fredMaps.T10YIE.get(date);
    // Tickers — only emit when present (sparse)
    for (const t of TICKERS) {
      const m = yahooMaps[t];
      if (m && m.has(date)) row[t] = m.get(date);
    }
    timeSeries.push(row);
  }

  const lastUpdated = new Date().toISOString().replace("T", " ").slice(0, 19);
  const startDate = validDates[0];
  const endDate = validDates[validDates.length - 1];
  const out = {
    tickers: TICKERS,
    timeSeries,
    startDate,
    endDate,
    dataPoints: timeSeries.length,
    lastUpdated,
  };

  // Write atomically: write to tmp, rename
  const tmp = OUTPUT_PATH + ".tmp";
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(out));
  fs.renameSync(tmp, OUTPUT_PATH);

  const sizeMb = (fs.statSync(OUTPUT_PATH).size / (1024 * 1024)).toFixed(2);
  console.log(`\n✓ Wrote ${OUTPUT_PATH}`);
  console.log(`  ${timeSeries.length} rows, ${TICKERS.length} tickers`);
  console.log(`  ${startDate} → ${endDate}`);
  console.log(`  ${sizeMb} MB, lastUpdated=${lastUpdated}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
