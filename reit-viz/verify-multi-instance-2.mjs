// New-behavior probes: multiple instances of the same indicator per pane —
// RSI daily + weekly as two panes, merge into one, ROC 14+20 separate panes,
// ADX at two frequencies, Bollinger 20/2 + 50/2 on the price chart.
import { createRequire } from 'module';
const require = createRequire('C:/Users/NickK/AppData/Roaming/npm/node_modules/');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5210';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (req.method() === 'POST' && (u.includes('/api/workspaces') || u.includes('/api/custom-charts'))) return req.abort();
  req.continue();
});
const sel = (t) => `[data-testid="${t}"]`;
const log = (...a) => console.log('[multi]', ...a);
async function waitUntil(fn, ms = 60000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 400)); }
  throw new Error('timeout waiting for ' + label);
}
async function has(testid) { return (await page.$(sel(testid))) != null; }
async function click(testid, ms = 20000) { await page.waitForSelector(sel(testid), { timeout: ms }); await page.click(sel(testid)); }
async function setControl(testid, value) {
  await page.$eval(sel(testid), (el, v) => {
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));
const chartReady = async () => page.evaluate(() => {
  const m = window.__chartsPanes; if (!m || !m.size) return false;
  for (const [, c] of m) for (const p of c.panes()) for (const s of p.getSeries()) { try { if (s.data && s.data().length) return true; } catch {} }
  return false;
});
// All sub-pane container testids for one indicator base ("rsi" → rsi, rsi#i1…).
const subPanes = (base) => page.evaluate((b) => {
  return [...document.querySelectorAll('[data-testid^="sub-indicator-"]')]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => /^sub-indicator-[^#]+(#.+)?$/.test(t) && !/-(close|hide|maximize|resize|up|down)$/.test(t))
    .filter((t) => t === `sub-indicator-${b}` || t.startsWith(`sub-indicator-${b}#`));
}, base);
const chipOf = (subTestid) => page.$eval(`${sel(subTestid)} span`, (el) => el.textContent).catch(() => null);
// Pixel hash of a sub-pane's canvases — different data ⇒ different hash.
const paneHash = (subTestid) => page.evaluate((tid) => {
  const root = document.querySelector(`[data-testid="${tid}"]`);
  if (!root) return null;
  let h = 0, n = 0;
  for (const cv of root.querySelectorAll('canvas')) {
    try {
      const ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < d.length; i += 97) { h = ((h * 31) + d[i]) >>> 0; n++; }
    } catch {}
  }
  return n ? h : null;
}, subTestid);
const mainTitles = async () => page.evaluate(() => {
  const out = [];
  const m = window.__chartsPanes; if (!m) return out;
  for (const [, chart] of m) for (const pane of chart.panes()) for (const s of pane.getSeries()) {
    let o; try { o = s.options(); } catch { continue; }
    out.push(o.title || s.__labelsOffTitle || '');
  }
  return out;
});

let PASS = true;
const check = (cond, msg) => { log((cond ? 'PASS' : 'FAIL') + ': ' + msg); if (!cond) PASS = false; };

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await waitUntil(chartReady, 90000, 'charts data');
log('charts ready');
await click('toggle-indicators');
await settle(1200);

// ── RSI daily + RSI weekly, two panes ──
await click('toggle-rsi');
await settle();
let rsiPanes = await subPanes('rsi');
check(rsiPanes.length === 1, `RSI on → 1 pane (${rsiPanes.join(',')})`);
await click('inst-add-rsi');
await settle();
rsiPanes = await subPanes('rsi');
check(rsiPanes.length === 2, `Add instance → 2 RSI panes (${rsiPanes.join(',')})`);
await setControl('inst-freq-rsi-1', 'weekly');
await settle(1200);
rsiPanes = await subPanes('rsi');
check(rsiPanes.length === 2, 'weekly on 2nd instance keeps 2 panes');
const chips = [];
for (const t of rsiPanes) chips.push(await chipOf(t));
check(chips.some((c) => c === 'RSI 14') && chips.some((c) => c === 'RSI 14W'),
  `THE feature: RSI 14 (daily) AND RSI 14W (weekly) panes at once — chips: ${chips.join(' | ')}`);
const h0 = await paneHash(rsiPanes[0]);
const h1 = await paneHash(rsiPanes[1]);
check(h0 !== null && h1 !== null && h0 !== h1, `daily vs weekly RSI render different data (hash ${h0} vs ${h1})`);

// ── Merge into one pane, then un-merge ──
await setControl('inst-pane-rsi-1', 'i1');
await settle(1200);
rsiPanes = await subPanes('rsi');
check(rsiPanes.length === 1, `merge → 1 shared pane (${rsiPanes.join(',')})`);
await setControl('inst-pane-rsi-1', '__own');
await settle(1200);
rsiPanes = await subPanes('rsi');
check(rsiPanes.length === 2, 'un-merge → 2 panes again');

// ── ROC 14 + ROC 20 in separate panes; close one ──
await click('toggle-roc');
await settle();
await click('inst-preset-roc-20');
await settle();
let rocPanes = await subPanes('roc');
check(rocPanes.length === 2, `ROC + preset 20 → 2 panes (${rocPanes.join(',')})`);
const rocChips = [];
for (const t of rocPanes) rocChips.push(await chipOf(t));
check(rocChips.some((c) => /ROC 12/.test(c)) && rocChips.some((c) => /ROC 20/.test(c)),
  `ROC 12 + ROC 20 chips — ${rocChips.join(' | ')}`);
const roc20Pane = rocPanes.find((t) => t.includes('#i2'));
await click(`${roc20Pane.replace('sub-indicator-', 'sub-indicator-')}-close`.replace('sub-indicator-sub-indicator-', 'sub-indicator-'));
await settle();
rocPanes = await subPanes('roc');
check(rocPanes.length === 1, 'closing ROC 20 pane leaves ROC 12');
const rocSwitch = await page.$eval(sel('toggle-roc'), (el) => el.getAttribute('data-state'));
check(rocSwitch === 'checked', 'ROC switch stays on after closing ONE instance');

// ── Registry: ADX chart + ADX monthly ──
await setControl('indicator-search', 'adx');
await settle(400);
await click('toggle-adx');
await settle();
await click('inst-add-adx');
await settle();
await setControl('inst-freq-adx-1', 'monthly');
await settle(1200);
const adxPanes = await subPanes('adx');
check(adxPanes.length === 2, `ADX two instances → 2 panes (${adxPanes.join(',')})`);
const ah0 = await paneHash(adxPanes[0]);
const ah1 = await paneHash(adxPanes[1]);
check(ah0 !== null && ah1 !== null && ah0 !== ah1, `ADX chart vs monthly render differently (${ah0} vs ${ah1})`);
await setControl('indicator-search', '');
await settle(300);

// ── Bollinger 20/2 + 50/2 both on the price chart ──
await click('toggle-bollinger');
await settle();
await click('inst-preset-bollinger-50');
await settle(1200);
const t = await mainTitles();
check(t.some((x) => /^BB 20,2/.test(x)) && t.some((x) => /^BB 50,2/.test(x)),
  `two Bollinger overlays at once — ${t.filter((x) => /^BB/.test(x)).join(' | ')}`);

log('console errors:', errs.filter((e) => !/ERR_FAILED/.test(e)).slice(0, 6));
log(PASS ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌');
await browser.close();
process.exit(PASS ? 0 : 1);
