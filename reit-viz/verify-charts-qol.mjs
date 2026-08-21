// Charts-page QoL verification: per-instance label/px-line overrides,
// delete-from-layout chips, chip menu (solo), clear-all, duplicate row,
// sub-pane reorder. Sections guard on their testids so the script stays
// runnable while features land incrementally.
import { createRequire } from 'module';
const require = createRequire('C:/Users/NickK/AppData/Roaming/npm/node_modules/');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.QOL_BASE || 'http://localhost:5210';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--ignore-certificate-errors'], acceptInsecureCerts: true });
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
const log = (...a) => console.log('[qol]', ...a);
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
const settle = (ms = 1000) => new Promise((r) => setTimeout(r, ms));
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
// Main-chart series info: [{title (via labels-off stash), priceLineVisible}]
const mainSeries = async () => page.evaluate(() => {
  const out = [];
  const m = window.__chartsPanes; if (!m) return out;
  for (const [, chart] of m) for (const pane of chart.panes()) for (const s of pane.getSeries()) {
    let o; try { o = s.options(); } catch { continue; }
    out.push({ title: o.title || s.__labelsOffTitle || '', shownTitle: o.title || '', priceLineVisible: o.priceLineVisible !== false, lastValueVisible: o.lastValueVisible !== false });
  }
  return out;
});
const subPanes = (base) => page.evaluate((b) => {
  return [...document.querySelectorAll('[data-testid^="sub-indicator-"]')]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => !/-(close|hide|maximize|resize|up|down)$/.test(t))
    .filter((t) => t === `sub-indicator-${b}` || t.startsWith(`sub-indicator-${b}#`));
}, base);
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

await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 90000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 });
await waitUntil(chartReady, 120000, 'charts data');
log('charts ready');

// The chart frequency restores from the SERVER workspace (localStorage.clear
// doesn't reset it), and the weekly-RSI checks below assume DAILY bars —
// weekly resample is a defined no-op on an hourly axis (barsPerIndicatorBar
// returns 1, so "RSI 14W" never exists there). Force daily via the sidebar
// frequency chips before running the suite.
if (!(await has('btn-freq-daily'))) {
  try { await click('section-charttype', 8000); await settle(500); } catch {}
}
if (await has('btn-freq-daily')) {
  await click('btn-freq-daily');
  await settle(1500);
  await waitUntil(chartReady, 120000, 'daily bars');
  log('frequency forced to daily');
} else {
  log('WARN: could not reach btn-freq-daily — running at restored frequency');
}
await click('toggle-indicators');
await settle(1500);

// ══ Per-instance chrome: SMA label + px-line off on the MAIN chart ══
if (!(await has('toggle-sma'))) {
  const headers = await page.$$('xpath/.//*[contains(text(),"Moving Averages")]');
  if (headers.length) await headers[0].click();
  await settle(600);
}
await toggleOn('toggle-sma', 'ma-period-sma-0');
await setControl('ma-period-sma-0', 200);
await click('ma-add-sma');
await page.waitForSelector(sel('ma-period-sma-1'), { timeout: 8000 });
await setControl('ma-period-sma-1', 50);
await settle(1500);
let ms = await mainSeries();
const sma200 = () => ms.find((x) => /^SMA 200/.test(x.title));
const sma50 = () => ms.find((x) => /^SMA 50/.test(x.title));
check(!!sma200() && !!sma50(), 'SMA 200 + SMA 50 both plotted');
check(sma200()?.shownTitle !== '' && sma200()?.priceLineVisible === true, 'baseline: SMA 200 labels+px-line on');
// Hide ONLY SMA 200's label + px line; SMA 50 must keep both.
await click('ma-labels-sma-0');
await click('ma-pxline-sma-0');
await settle(1500);
ms = await mainSeries();
check(sma200()?.shownTitle === '' && sma200()?.lastValueVisible === false, 'SMA 200 axis label hidden via per-line toggle');
check(sma200()?.priceLineVisible === false, 'SMA 200 px line hidden via per-line toggle');
check(sma50()?.shownTitle !== '' && sma50()?.priceLineVisible === true, 'SMA 50 untouched (per-line isolation)');
// Global Labels OFF→ON round trip keeps the per-line override.
await click('toggle-axis-labels');
await settle(1000);
await click('toggle-axis-labels');
await settle(1500);
ms = await mainSeries();
check(sma200()?.shownTitle === '' && sma50()?.shownTitle !== '', 'global Labels round-trip honors per-line override');
// Restore SMA 200 label.
await click('ma-labels-sma-0');
await settle(1200);
ms = await mainSeries();
check(sma200()?.shownTitle !== '', 'per-line label restored on re-toggle');

// ══ Per-instance chrome on a SUB-pane (RSI weekly instance) ══
await toggleOn('toggle-rsi', 'inst-row-rsi-0');
await settle();
await click('inst-add-rsi');
await settle();
await setControl('inst-freq-rsi-1', 'weekly');
await settle(1500);
const rsiPanes = await subPanes('rsi');
check(rsiPanes.length === 2, `two RSI panes (${rsiPanes.join(',')})`);
// Semantic sub-chart label state via the window.__subCharts hook: find the
// series whose title (or labels-off stash) matches, report shown title.
const subSeriesState = (titleRe) => page.evaluate((reSrc) => {
  const re = new RegExp(reSrc);
  const set = window.__subCharts; if (!set) return null;
  for (const chart of set) {
    try {
      for (const pane of chart.panes()) for (const s of pane.getSeries()) {
        let o; try { o = s.options(); } catch { continue; }
        const real = o.title || s.__labelsOffTitle || '';
        if (re.test(real)) return { shownTitle: o.title || '', lastValueVisible: o.lastValueVisible !== false };
      }
    } catch {}
  }
  return null;
}, titleRe.source);
let wk = await subSeriesState(/^RSI 14W/);
check(wk !== null && wk.shownTitle !== '', 'baseline: weekly RSI label shown');
await click('inst-labels-rsi-1');
await settle(1500);
wk = await subSeriesState(/^RSI 14W/);
let dl = await subSeriesState(/^RSI 14$/);
check(wk !== null && wk.shownTitle === '' && wk.lastValueVisible === false, 'weekly RSI axis label hidden via instance toggle');
check(dl !== null && dl.shownTitle !== '', 'daily RSI label untouched (per-instance isolation on sub-panes)');
await click('inst-labels-rsi-1'); // restore
await settle(1500);
wk = await subSeriesState(/^RSI 14W/);
check(wk !== null && wk.shownTitle !== '', 'weekly RSI label restored on re-toggle');

// ══ Feature: delete from Current Layout chips ══
if (await has('layout-del-available-probe') || true) {
  const delBtns = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="layout-del-"]')].map((el) => el.getAttribute('data-testid')));
  if (delBtns.length === 0) {
    log('SKIP: layout delete buttons not present yet');
  } else {
    // Delete the SMA chip → both SMA lines gone from the main chart.
    const smaDel = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('[data-testid^="layout-del-"]')];
      const el = chips.find((c) => (c.getAttribute('title') || '').includes('SMA') || (c.closest('span,button,div')?.textContent || '').includes('SMA'));
      return el ? el.getAttribute('data-testid') : null;
    });
    check(!!smaDel, `SMA chip has a delete button (${smaDel})`);
    if (smaDel) {
      await click(smaDel);
      await settle(1500);
      ms = await mainSeries();
      check(!ms.some((x) => /^SMA /.test(x.title)), 'deleting the SMA chip removes both SMA lines');
    }
    // Delete the weekly RSI chip → only that pane goes.
    const rsiDel = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('[data-testid^="layout-del-"]')];
      const el = chips.find((c) => (c.getAttribute('title') || '').includes('RSI 14W'));
      return el ? el.getAttribute('data-testid') : null;
    });
    if (rsiDel) {
      await click(rsiDel);
      await settle(1500);
      const after = await subPanes('rsi');
      check(after.length === 1, `deleting RSI 14W chip leaves the daily pane (${after.join(',')})`);
    } else {
      log('SKIP: RSI 14W chip delete not found (title-based lookup)');
    }
  }
}

// ══ Feature: chip menu solo ══
{
  const menuBtns = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="layout-menu-"]')].map((el) => el.getAttribute('data-testid')));
  if (menuBtns.length === 0) log('SKIP: chip menus not present yet');
  else {
    await click('toggle-roc');
    await settle(1200);
    const rsiMenu = menuBtns.find((t) => t.includes('rsi'));
    if (rsiMenu) {
      await click(rsiMenu);
      await settle(500);
      if (await has('chip-solo')) {
        await click('chip-solo');
        await settle(1200);
        const rocAfterSolo = await subPanes('roc');
        const rsiAfterSolo = await subPanes('rsi');
        check(rocAfterSolo.length === 0 && rsiAfterSolo.length >= 1, 'solo RSI hides other sub-panes');
        // The popover stays open after an action — only re-open if it closed.
        if (!(await has('chip-solo'))) { await click(rsiMenu); await settle(400); }
        await click('chip-solo');
        await settle(1200);
        check((await subPanes('roc')).length === 1, 'solo again restores hidden panes');
      } else log('SKIP: chip-solo entry not present');
    }
  }
}

// ══ Feature: duplicate instance row ══
if (await has('inst-dup-rsi-0')) {
  const before = (await subPanes('rsi')).length;
  await click('inst-dup-rsi-0');
  await settle(1200);
  check((await subPanes('rsi')).length === before + 1, 'duplicate row adds an own-pane instance');
  await click('inst-remove-rsi-1');
  await settle(800);
} else log('SKIP: duplicate button not present yet');

// ══ Feature: clear-all per pane ══
{
  const clearBtns = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="layout-clear-indicators-"]')].map((el) => el.getAttribute('data-testid')));
  if (clearBtns.length === 0) log('SKIP: clear-all not present yet');
  else {
    await click(clearBtns[0]);
    await settle(400);
    if (await has('layout-clear-indicators-confirm')) {
      await click('layout-clear-indicators-confirm');
      await settle(1500);
      const anySub = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="sub-indicator-"]')].filter((el) => !/-(close|hide|maximize|resize|up|down)$/.test(el.getAttribute('data-testid'))).length);
      ms = await mainSeries();
      check(anySub === 0 && !ms.some((x) => /^(SMA|BB) /.test(x.title)), 'clear-all removes every indicator on the pane');
    }
  }
}

// ══ Feature: sub-pane reorder ══
{
  await toggleOn('toggle-rsi', 'inst-row-rsi-0');
  await settle(800);
  await toggleOn('toggle-roc', 'inst-row-roc-0');
  await settle(1200);
  const order = () => page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="sub-indicator-"]')]
      .map((el) => el.getAttribute('data-testid'))
      .filter((t) => !/-(close|hide|maximize|resize|up|down)$/.test(t)));
  const before = await order();
  const rocKey = before.find((t) => t.startsWith('sub-indicator-roc'));
  const upBtn = rocKey ? `${rocKey}-up` : null;
  if (upBtn && (await has(upBtn))) {
    await click(upBtn);
    await settle(1200);
    const after = await order();
    check(after[0] === rocKey, `reorder: ROC moved to the top (${after.join(' | ')})`);
  } else log('SKIP: reorder arrows not present yet');
}

log('console errors:', errs.filter((e) => !/ERR_FAILED/.test(e)).slice(0, 6));
log(PASS ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌');
await browser.close();
process.exit(PASS ? 0 : 1);
