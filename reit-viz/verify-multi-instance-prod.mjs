// PROD verification of multi-instance indicators on https://45.63.20.126:
// RSI daily + weekly two panes (Charts + Pairs), merge/unmerge, per-instance
// close. Read-only against prod: all workspace/custom-chart/pref POSTs are
// blocked so probe state never leaks into the real server.
import { createRequire } from 'module';
const require = createRequire('C:/Users/NickK/AppData/Roaming/npm/node_modules/');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.PROD_BASE || 'https://45.63.20.126';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--ignore-certificate-errors'],
  acceptInsecureCerts: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (req.method() === 'POST' && (u.includes('/api/workspaces') || u.includes('/api/custom-charts') || u.includes('/api/prefs'))) return req.abort();
  req.continue();
});
const sel = (t) => `[data-testid="${t}"]`;
const log = (...a) => console.log('[prod]', ...a);
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
const settle = (ms = 1200) => new Promise((r) => setTimeout(r, ms));
// Headless race: the first click on a Switch sometimes doesn't take (known
// from verify-indicators-features.mjs) — click, and if the expected child
// control doesn't mount, click once more.
async function ensureOff(toggleTid) {
  try {
    const st = await page.$eval(sel(toggleTid), (el) => el.getAttribute('data-state'));
    if (st === 'checked') { await page.click(sel(toggleTid)); await settle(800); }
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
const subPanes = (base, prefix = 'sub-indicator-') => page.evaluate((b, pfx) => {
  return [...document.querySelectorAll(`[data-testid^="${pfx}"]`)]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => !/-(close|hide|maximize|resize|up|down)$/.test(t) && !/-readout$/.test(t))
    .filter((t) => t === `${pfx}${b}` || t.startsWith(`${pfx}${b}#`));
}, base, prefix);
const chipOf = (subTestid) => page.$eval(`${sel(subTestid)} span`, (el) => el.textContent).catch(() => null);
const paneHash = (subTestid) => page.evaluate((tid) => {
  const root = document.querySelector(`[data-testid="${tid}"]`);
  if (!root) return null;
  let h = 0, n = 0;
  for (const cv of root.querySelectorAll('canvas')) {
    try {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < d.length; i += 97) { h = ((h * 31) + d[i]) >>> 0; n++; }
    } catch {}
  }
  return n ? h : null;
}, subTestid);

let PASS = true;
const check = (cond, msg) => { log((cond ? 'PASS' : 'FAIL') + ': ' + msg); if (!cond) PASS = false; };

// ══ Charts ══ (prod data load is intermittent — gate hard on chart data)
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 90000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 });
await waitUntil(chartReady, 120000, 'prod charts data');
log('prod charts ready');
await click('toggle-indicators');
await settle(1500);
// The server-restored custom chart may arrive with indicators already on
// (legacy shape) — reset to a known-off state so the probe owns what it sees.
await ensureOff('toggle-rsi');
await ensureOff('toggle-roc');
await settle(600);
await toggleOn('toggle-rsi', 'inst-row-rsi-0');
await settle();
// Force row 0 to a known state regardless of restored last-selection: own
// pane (unique instance key), chart freq, period 14.
await setControl('inst-pane-rsi-0', '__own');
await setControl('inst-freq-rsi-0', 'chart');
await setControl('inst-param-rsi-0-period', 14);
await settle(800);
await click('inst-add-rsi');
await settle();
await setControl('inst-freq-rsi-1', 'weekly');
await settle(1800);
let rsiPanes = await subPanesActive('rsi');
check(rsiPanes.length === 2, `Charts: two RSI panes (${rsiPanes.join(',')})`);
const chips = [];
for (const t of rsiPanes) chips.push(await chipOf(t));
check(chips.some((c) => c === 'RSI 14') && chips.some((c) => c === 'RSI 14W'),
  `Charts: RSI 14 (daily) + RSI 14W (weekly) at once — ${chips.join(' | ')}`);
const h0 = await paneHash(rsiPanes[0]);
const h1 = await paneHash(rsiPanes[1]);
check(h0 !== null && h1 !== null && h0 !== h1, `Charts: daily vs weekly RSI differ (${h0} vs ${h1})`);
// Merge / unmerge — target the first OTHER pane group offered by the dropdown
const mergeTarget = await page.$eval(sel('inst-pane-rsi-1'), (el) => {
  const opt = [...el.options].find((o) => o.value !== '__own');
  return opt ? opt.value : null;
});
check(mergeTarget !== null, `merge target group available (${mergeTarget})`);
await setControl('inst-pane-rsi-1', mergeTarget);
await settle(1500);
check((await subPanesActive('rsi')).length === 1, 'Charts: merge → one shared RSI pane');
await setControl('inst-pane-rsi-1', '__own');
await settle(1500);
check((await subPanesActive('rsi')).length === 2, 'Charts: un-merge → two panes');
// ROC 12 + 20, close one
await toggleOn('toggle-roc', 'inst-row-roc-0');
await settle();
await setControl('inst-pane-roc-0', '__own');
await setControl('inst-freq-roc-0', 'chart');
await setControl('inst-param-roc-0-period', 12);
await settle(800);
await click('inst-preset-roc-20');
await settle(1200);
let rocPanes = await subPanesActive('roc');
check(rocPanes.length === 2, `Charts: ROC 12 + ROC 20 (${rocPanes.join(',')})`);
const roc2 = rocPanes[1];
if (roc2) { await click(`${roc2}-close`); await settle(); }
check((await subPanesActive('roc')).length === 1, 'Charts: closing one ROC instance leaves the other');
// Registry two freqs
await setControl('indicator-search', 'adx');
await settle(500);
await ensureOff('toggle-adx');
await settle(400);
await toggleOn('toggle-adx', 'inst-row-adx-0');
await settle();
await click('inst-add-adx');
await settle();
await setControl('inst-freq-adx-1', 'monthly');
await settle(1500);
check((await subPanesActive('adx')).length === 2, 'Charts: ADX chart + ADX monthly panes');

// ══ Pairs/Compare ══
await page.goto(`${BASE}/#/pairs`, { waitUntil: 'networkidle2', timeout: 90000 });
try {
  await waitUntil(async () => page.evaluate(() => {
    const set = window.__pairsCharts; if (!set || !set.size) return false;
    for (const c of set) for (const p of c.panes()) for (const s of p.getSeries()) { try { if (s.data && s.data().length) return true; } catch {} }
    return false;
  }), 120000, 'prod pairs chart');
  await settle(1000);
  if (await has('pairs-indicators-toggle')) await click('pairs-indicators-toggle');
  await settle(1200);
  if (!(await has('toggle-rsi'))) {
    const headers = await page.$$('xpath/.//*[contains(text(),"Oscillators")]');
    if (headers.length) await headers[0].click();
    await settle(600);
  }
  await toggleOn('toggle-rsi', 'inst-row-rsi-0');
  await settle();
  await click('inst-add-rsi');
  await settle();
  await setControl('inst-freq-rsi-1', 'weekly');
  await settle(1800);
  const pairsRsi = await subPanes('rsi', 'pairs-sub-indicator-');
  check(pairsRsi.length === 2, `Pairs: two RSI panes (${pairsRsi.join(',')})`);
  const p0 = await paneHash(pairsRsi[0]);
  const p1 = await paneHash(pairsRsi[1]);
  check(p0 !== null && p1 !== null && p0 !== p1, `Pairs: daily vs weekly RSI differ (${p0} vs ${p1})`);
} catch (e) { check(false, 'Pairs section errored: ' + String(e).slice(0, 160)); }

// ══ Correlation: shared ChartPane + IndicatorsPanel — RSI daily + weekly ══
await page.goto(`${BASE}/#/correlation`, { waitUntil: 'networkidle2', timeout: 90000 });
try {
  await settle(9000); // hydration gate (server-prefs template restore)
  if (await has('corr-toggle-indicators')) {
    await click('corr-toggle-indicators');
    await settle(1200);
    await toggleOn('toggle-rsi', 'inst-row-rsi-0');
    await settle();
    await click('inst-add-rsi');
    await settle();
    await setControl('inst-freq-rsi-1', 'weekly');
    await settle(1800);
    const corrRsi = await subPanes('rsi');
    check(corrRsi.length === 2, `Correlation: two RSI panes (${corrRsi.join(',')})`);
    const c0 = await paneHash(corrRsi[0]);
    const c1 = await paneHash(corrRsi[1]);
    check(c0 !== null && c1 !== null && c0 !== c1, `Correlation: daily vs weekly RSI differ (${c0} vs ${c1})`);
    await click('toggle-rsi'); // leave the page as found (POSTs blocked anyway)
    await settle();
  } else {
    check(false, 'Correlation: indicators toggle not present (no LWC panes configured?)');
  }
} catch (e) { check(false, 'Correlation section errored: ' + String(e).slice(0, 160)); }

log('console errors:', errs.filter((e) => !/ERR_FAILED|ERR_CERT/.test(e)).slice(0, 8));
log(PASS ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌');
await browser.close();
process.exit(PASS ? 0 : 1);
