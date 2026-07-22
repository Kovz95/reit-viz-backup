#!/usr/bin/env node
// Rebuilds data.json for the yield-correlation app (/opt/reit-yc-backend)
// from FMP (REIT adjusted closes) + FRED (Treasury yields). Deployed by
// .github/workflows/server-yc-update.yml; run daily by cron via
// update-and-reload.sh. Full rebuild per run — adjusted closes shift
// retroactively on distributions, so appending would create seams. Safety
// gates keep the old file if the rebuild comes back short.
const fs = require("fs");
const path = require("path");
const https = require("https");

const DIR = __dirname;
const DATA = path.join(DIR, "data.json");
const envText = fs.readFileSync(path.join(DIR, ".env"), "utf8");
const FMP_KEY = (envText.match(/FMP_API_KEY=([^\s]+)/) || [])[1];
if (!FMP_KEY) { console.error("no FMP_API_KEY in .env"); process.exit(1); }

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "yc-updater" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location));
      }
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => (res.statusCode === 200 ? resolve(buf) : reject(new Error(res.statusCode + " " + url.slice(0, 80)))));
    }).on("error", reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const old = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const tickers = old.tickers;
  console.log("rebuilding " + tickers.length + " tickers; current endDate=" + old.endDate);

  // FRED: one CSV, no key needed. Column order follows the id list.
  const fredCsv = await get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2,DGS5,DGS10,DFII10,T10YIE");
  const fred = new Map();
  const fredLines = fredCsv.trim().split("\n").slice(1);
  for (const line of fredLines) {
    const parts = line.split(",");
    const num = (s) => (s === "." || s === "" || s == null ? null : parseFloat(s));
    fred.set(parts[0], {
      yield2y: num(parts[1]),
      yield5y: num(parts[2]),
      yield10y: num(parts[3]),
      realYield10y: num(parts[4]),
      breakeven10y: num(parts[5]),
    });
  }
  console.log("FRED rows: " + fred.size + ", last: " + fredLines[fredLines.length - 1].split(",")[0]);

  // FMP adjusted closes, full history per ticker.
  const px = new Map();
  for (const t of tickers) {
    try {
      const raw = JSON.parse(await get("https://financialmodelingprep.com/api/v3/historical-price-full/" + encodeURIComponent(t) + "?from=" + old.startDate + "&apikey=" + FMP_KEY));
      const hist = raw && Array.isArray(raw.historical) ? raw.historical : [];
      const m = new Map();
      for (const h of hist) if (h && h.date && Number.isFinite(h.adjClose)) m.set(h.date, h.adjClose);
      px.set(t, m);
      process.stdout.write(t + ":" + m.size + " ");
    } catch (e) {
      console.error("\n" + t + " FAILED: " + e.message);
      px.set(t, new Map());
    }
    await sleep(250);
  }
  console.log("");

  // Rows = VNQ trading days (the app's anchor series); yields forward-filled.
  const anchor = px.get("VNQ") && px.get("VNQ").size > 0 ? px.get("VNQ") : px.get(tickers[0]);
  const dates = [...anchor.keys()].filter((d) => d >= old.startDate).sort();
  let lastY = null;
  const timeSeries = [];
  for (const d of dates) {
    const y = fred.get(d);
    if (y && y.yield10y != null) lastY = y;
    if (!lastY) continue;
    const row = Object.assign({ date: d }, lastY);
    for (const t of tickers) {
      const v = px.get(t) ? px.get(t).get(d) : undefined;
      if (v != null) row[t] = Math.round(v * 100) / 100;
    }
    timeSeries.push(row);
  }

  // Safety gates: never replace good data with a short rebuild.
  if (timeSeries.length < old.dataPoints - 50) {
    console.error("ABORT: rebuilt " + timeSeries.length + " rows < existing " + old.dataPoints + " - 50");
    process.exit(2);
  }
  const lastRow = timeSeries[timeSeries.length - 1];
  const covered = tickers.filter((t) => lastRow[t] != null).length;
  if (covered < tickers.length * 0.7) {
    console.error("ABORT: only " + covered + "/" + tickers.length + " tickers priced on " + lastRow.date);
    process.exit(2);
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = now.getUTCFullYear() + "-" + pad(now.getUTCMonth() + 1) + "-" + pad(now.getUTCDate()) + " " + pad(now.getUTCHours()) + ":" + pad(now.getUTCMinutes()) + ":" + pad(now.getUTCSeconds());
  const next = {
    tickers,
    timeSeries,
    startDate: timeSeries[0].date,
    endDate: lastRow.date,
    dataPoints: timeSeries.length,
    lastUpdated: stamp,
  };
  fs.copyFileSync(DATA, DATA + ".bak");
  fs.writeFileSync(DATA + ".tmp", JSON.stringify(next));
  fs.renameSync(DATA + ".tmp", DATA);
  console.log("wrote " + timeSeries.length + " rows, endDate=" + next.endDate + " (was " + old.endDate + ")");
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
