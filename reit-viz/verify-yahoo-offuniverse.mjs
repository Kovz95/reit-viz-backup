import { createRequire } from "module";
const require = createRequire("C:/Users/NickK/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer-core");
const BASE = process.env.BASE || "http://localhost:5210";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SHOT = process.env.SHOT || "yahoo-verify.png";

let pass = 0, fail = 0;
const ok = (c, m, extra = "") => { c ? (pass++, console.log(`[PASS] ${m}`, extra)) : (fail++, console.log(`[FAIL] ${m}`, extra)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--ignore-certificate-errors"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = r.url();
    if (r.method() === "POST" && (u.includes("/api/workspaces") || u.includes("/api/custom-charts"))) return r.abort();
    r.continue();
  });

  await page.goto(`${BASE}/#/`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector('[data-testid="ticker-dropdown"]', { timeout: 30000 });
  await sleep(2500);

  // ---- Direct data-layer probes (both loaders) ----
  const dl = await page.evaluate(async () => {
    const ds = await import("/src/lib/dataService.ts");
    const td = await import("/src/lib/tickerData.ts");
    const out = {};
    const close = await ds.getMetricSeries("AAPL", "close");
    out.dsCloseLen = Array.isArray(close) ? close.length : -1;
    const ohlc = await ds.getOhlcData("AAPL");
    out.dsOhlcLen = Array.isArray(ohlc) ? ohlc.length : -1;
    out.dsOhlcSample = Array.isArray(ohlc) ? ohlc.slice(-1)[0] : null;
    const raw = await td.fetchTickerRaw("TSLA");
    out.tdDates = raw && Array.isArray(raw.dates) ? raw.dates.length : -1;
    out.tdHasOhlc = !!(raw && raw.metrics && raw.metrics.open && raw.metrics.high && raw.metrics.low && raw.metrics.close);
    const metas = await ds.getTickers();
    out.univTicker = metas[0]?.ticker;
    const uc = await ds.getMetricSeries(out.univTicker, "close");
    out.univCloseLen = Array.isArray(uc) ? uc.length : -1;
    const bogus = await ds.getMetricSeries("ZZQQXX", "close");
    out.bogusLen = Array.isArray(bogus) ? bogus.length : -1;
    return out;
  });
  console.log("data-layer:", JSON.stringify(dl));
  ok(dl.dsCloseLen > 3000, "dataService off-universe AAPL close populated", dl.dsCloseLen);
  ok(dl.dsOhlcLen > 3000, "dataService off-universe AAPL OHLC candles populated", dl.dsOhlcLen);
  ok(dl.tdDates > 3000 && dl.tdHasOhlc, "tickerData off-universe TSLA OHLC populated", `${dl.tdDates} dates`);
  ok(dl.univCloseLen > 100, "REGRESSION: universe ticker still loads", `${dl.univTicker}=${dl.univCloseLen}`);
  ok(dl.bogusLen === 0, "bogus symbol returns empty (no garbage)", dl.bogusLen);

  // ---- SIDEBAR flow: add AAPL via the Yahoo input + button, click the row, confirm it plots ----
  await page.waitForSelector('[data-testid="yahoo-ticker-input"]', { timeout: 8000 });
  await page.click('[data-testid="yahoo-ticker-input"]');
  await page.type('[data-testid="yahoo-ticker-input"]', "AAPL", { delay: 40 });
  await sleep(300);
  await page.click('[data-testid="yahoo-ticker-add"]');
  await sleep(400);
  const rowSel = '[data-testid="ticker-YAHOO:AAPL"]';
  const hasRow = await page.$(rowSel);
  ok(!!hasRow, "sidebar: AAPL added to Yahoo group");
  if (hasRow) {
    await page.click(rowSel);
    await sleep(4000); // let loadViewForTicker fetch Yahoo + render
    const cur = await page.$eval('[data-testid="current-ticker"]', (e) => e.textContent.trim()).catch(() => "");
    ok(cur.toUpperCase().includes("AAPL"), "sidebar: active ticker switched to AAPL", cur);
    const plot = await page.evaluate(() => {
      const panes = window.__chartsPanes;
      const paneCount = panes && panes.size ? panes.size : 0;
      // any toast complaining about no data?
      const toast = Array.from(document.querySelectorAll("[data-testid], li, div"))
        .map((e) => e.textContent || "")
        .find((t) => /No price data for/i.test(t));
      return { paneCount, noDataToast: toast || null };
    });
    ok(plot.paneCount > 0, "sidebar: chart panes rendered for AAPL", `panes=${plot.paneCount}`);
    ok(!plot.noDataToast, "sidebar: NO 'no price data' warning for AAPL", plot.noDataToast || "");
  }

  // ---- HEADER dropdown flow: type AAPL, screenshot, check off-universe entry ----
  await page.click('[data-testid="ticker-dropdown"]');
  const headerInput = 'input[placeholder*="A/B for a ratio"]'; // header CommandInput ONLY (sidebar filter shares "Search ticker")
  await page.waitForSelector(headerInput, { timeout: 8000 });
  await page.type(headerInput, "NVDA", { delay: 40 });
  await sleep(700);
  await page.screenshot({ path: SHOT });
  const addBtn = await page.$('[data-testid="carousel-add-yahoo"]');
  ok(!!addBtn, "header: off-universe 'add from Yahoo' entry appears for NVDA");
  if (addBtn) {
    await addBtn.click();
    await sleep(4000);
    const cur = await page.$eval('[data-testid="current-ticker"]', (e) => e.textContent.trim()).catch(() => "");
    ok(cur.toUpperCase().includes("NVDA"), "header: active ticker switched to NVDA", cur);
    const paneCount = await page.evaluate(() => (window.__chartsPanes && window.__chartsPanes.size) || 0);
    ok(paneCount > 0, "header: chart panes rendered for NVDA", `panes=${paneCount}`);
  }

  ok(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
  console.log(`\n${fail === 0 ? "OFF-UNIVERSE YAHOO OK" : "OFF-UNIVERSE YAHOO FAIL"}  [${pass} pass / ${fail} fail]`);
} finally {
  await browser.close();
}
process.exit(fail === 0 ? 0 : 1);
