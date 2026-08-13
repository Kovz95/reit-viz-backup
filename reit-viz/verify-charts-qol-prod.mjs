// PROD verification of the Charts QoL features on https://45.63.20.126.
// Hardened for server-restored state (multiple panes, indicators already on):
// active-pane scoping, ensureOff, first-chart series reads. All prefs/
// workspace/custom-chart POSTs are blocked — read-only against prod.
import { createRequire } from 'module';
const require = createRequire('C:/Users/NickK/AppData/Roaming/npm/node_modules/');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.PROD_BASE || 'https://45.63.20.126';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--ignore-certificate-errors'], acceptInsecureCerts: true });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (req.method() === 'POST' && (u.includes('/api/workspaces') || u.includes('/api/custom-charts') || u.includes('/api/prefs'))) return req.abort();
  req.continue();
});
const sel = (t) => `[data-testid="${t}"]`;
const log = (...a) => console.log('[qol-prod]', ...a);
async function waitUntil(fn, ms = 90000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('timeout waiting for ' + label);
}
async function has(testid) { return (await page.$(sel(testid))) != null; }
async function click(testid, ms = 25000) { await page.waitForSelector(sel(testid), { timeout: ms }); await page.click(sel(testid)); }
async function setControl(testid, value) {
  await page.$eval(sel(testid), (el, v) => {
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
const settle = (ms = 1300) => new Promise((r) => setTimeout(r, ms));
async function ensureOff(toggleTid) {
  try {
    const st = await page.$eval(sel(toggleTid), (el) => el.getAttribute('data-state'));
    if (st === 'checked') { await page.click(sel(toggleTid)); await settle(900); }
  } catch {}
}
async function toggleOn(toggleTid, expectTid) {
  await click(toggleTid);
  try { await page.waitForSelector(sel(expectTid), { timeout: 6000 }); }
  catch {
    await settle(800);
    if (!(await has(expectTid))) await click(toggleTid);
    await page.waitForSelector(sel(expectTid), { timeout: 10000 });
  }
}
const chartReady = async () => page.evaluate(() => {
  const m = window.__chartsPanes; if (!m || !m.size) return false;
  for (const [, c] of m) for (const p of c.panes()) for (const s of p.getSeries()) { try { if (s.data && s.data().length) return true; } catch {} }
  return false;
});
// Series of the FIRST chart pane only (the panel's default selected pane).
const firstChartSeries = async () => page.evaluate(() => {
  const out = [];
  const m = window.__chartsPanes; if (!m || !m.size) return out;
  const chart = m.values().next().value;
  try {
    for (const pane of chart.panes()) for (const s of pane.getSeries()) {
      let o; try { o = s.options(); } catch { continue; }
      out.push({ title: o.title || s.__labelsOffTitle || '', shownTitle: o.title || '', priceLineVisible: o.priceLineVisible !== false });
    }
  } catch {}
  return out;
});
// Sub-panes scoped to the ACTIVE ChartPane (ring-1 highlight).
const subPanesActive = (base) => page.evaluate((b) => {
  const pfx = 'sub-indicator-';
  const root = [...document.querySelectorAll('div')].find((d) =>
    typeof d.className === 'string' && d.className.includes('ring-1') && d.className.includes('overflow-hidden'));
  if (!root) return [];
  return [...root.querySelectorAll(`[data-testid^="${pfx}"]`)]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => !/-(close|hide|maximize|resize|up|down)$/.test(t) && !/-readout$/.test(t))
    .filter((t) => t === `${pfx}${b}` || t.startsWith(`${pfx}${b}#`));
}, base);
const activeSubOrder = () => page.evaluate(() => {
  const root = [...document.querySelectorAll('div')].find((d) =>
    typeof d.className === 'string' && d.className.includes('ring-1') && d.className.includes('overflow-hidden'));
  if (!root) return [];
  return [...root.querySelectorAll('[data-testid^="sub-indicator-"]')]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => !/-(close|hide|maximize|resize|up|down)$/.test(t) && !/-readout$/.test(t));
});

let PASS = true;
const check = (cond, msg) => { log((cond ? 'PASS' : 'FAIL') + ': ' + msg); if (!cond) PASS = false; };

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 90000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 });
await waitUntil(chartReady, 120000, 'prod charts data');
log('prod charts ready');
await click('toggle-indicators');
await settle(1500);
await ensureOff('toggle-sma');
await ensureOff('toggle-rsi');
await ensureOff('toggle-roc');
await settle(600);

// ── Per-line chrome: SMA 200 labels+px off, SMA 50 untouched ──
if (!(await has('toggle-sma'))) {
  const headers = await page.$$('xpath/.//*[contains(text(),"Moving Averages")]');
  if (headers.length) await headers[0].click();
  await settle(600);
  await ensureOff('toggle-sma');
}
await toggleOn('toggle-sma', 'ma-period-sma-0');
await setControl('ma-period-sma-0', 200);
await setControl('ma-freq-sma-0', 'chart');
await click('ma-add-sma');
await page.waitForSelector(sel('ma-period-sma-1'), { timeout: 8000 });
await setControl('ma-period-sma-1', 50);
await settle(1800);
let fs = await firstChartSeries();
const sma200 = () => fs.find((x) => /^SMA 200/.test(x.title));
const sma50 = () => fs.find((x) => /^SMA 50/.test(x.title));
check(!!sma200() && !!sma50(), 'SMA 200 + 50 plotted on the active pane');
// The restored chart config may have the GLOBAL Labels/Px-line toggles off
// (they're the master switches) — normalize both to ON before testing the
// per-line overrides.
if (sma50() && sma50().shownTitle === '') { await click('toggle-axis-labels'); await settle(1200); }
if (sma50() && sma50().priceLineVisible === false) { await click('toggle-price-lines'); await settle(1200); }
fs = await firstChartSeries();
check(sma50()?.shownTitle !== '' && sma50()?.priceLineVisible === true, 'globals normalized ON');
await click('ma-labels-sma-0');
await click('ma-pxline-sma-0');
await settle(1800);
fs = await firstChartSeries();
check(sma200()?.shownTitle === '' && sma200()?.priceLineVisible === false, 'SMA 200 label + px line hidden per-line');
check(sma50()?.shownTitle !== '' && sma50()?.priceLineVisible === true, 'SMA 50 unaffected');

// ── Chip delete: remove the SMA chip from Current Layout ──
const smaDel = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('[data-testid^="layout-del-"]')];
  const el = chips.find((c) => (c.getAttribute('title') || '').startsWith('Remove SMA'));
  return el ? el.getAttribute('data-testid') : null;
});
check(!!smaDel, `SMA chip delete button present (${smaDel})`);
if (smaDel) {
  await click(smaDel);
  await settle(1800);
  fs = await firstChartSeries();
  check(!fs.some((x) => /^SMA /.test(x.title)), 'chip ✕ removes the SMA lines');
}

// ── Duplicate instance row ──
await toggleOn('toggle-rsi', 'inst-row-rsi-0');
await setControl('inst-pane-rsi-0', '__own');
await setControl('inst-freq-rsi-0', 'chart');
await settle(1200);
const rsiBefore = (await subPanesActive('rsi')).length;
await click('inst-dup-rsi-0');
await settle(1500);
check((await subPanesActive('rsi')).length === rsiBefore + 1, 'duplicate row adds an own-pane instance');
await click('inst-remove-rsi-1');
await settle(900);

// ── Reorder: ROC pane above RSI ──
await toggleOn('toggle-roc', 'inst-row-roc-0');
await setControl('inst-pane-roc-0', '__own');
await settle(1500);
const before = await activeSubOrder();
const rocKey = before.find((t) => t.startsWith('sub-indicator-roc'));
if (rocKey && (await has(`${rocKey}-up`))) {
  const rocIdx = before.indexOf(rocKey);
  await click(`${rocKey}-up`);
  await settle(1500);
  const after = await activeSubOrder();
  check(after.indexOf(rocKey) === Math.max(0, rocIdx - 1), `reorder: ROC moved up (${after.join(' | ')})`);
} else {
  check(false, 'reorder arrows missing on prod');
}

// ── Solo via chip menu ──
const rsiMenu = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-testid^="layout-menu-"]')].map((el) => el.getAttribute('data-testid'));
  return els.find((t) => t.includes('rsi')) ?? null;
});
if (rsiMenu) {
  await click(rsiMenu);
  await settle(600);
  if (await has('chip-solo')) {
    await click('chip-solo');
    await settle(1500);
    check((await subPanesActive('roc')).length === 0 && (await subPanesActive('rsi')).length >= 1, 'chip menu solo hides other sub-panes');
    if (!(await has('chip-solo'))) { await click(rsiMenu); await settle(500); }
    await click('chip-solo');
    await settle(1500);
    check((await subPanesActive('roc')).length === 1, 'solo again restores');
  } else check(false, 'chip-solo entry missing');
} else check(false, 'rsi chip menu missing');

log(PASS ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌');
await browser.close();
process.exit(PASS ? 0 : 1);
