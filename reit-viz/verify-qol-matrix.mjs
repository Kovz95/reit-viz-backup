// Feature × surface gap matrix: covers the QoL combinations the per-surface
// suites don't — chip-menu Labels/Px-line entries, per-instance px-lines on
// sub-panes, merge/duplicate on Pairs + Correlation, Chart (D) freq labels on
// the Pairs/Correlation panels.
import { createRequire } from 'module';
const require = createRequire('C:/Users/NickK/AppData/Roaming/npm/node_modules/');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.QOL_BASE || 'http://localhost:5210';

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
const log = (...a) => console.log('[matrix]', ...a);
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
// Sub-chart series state via the shared window.__subCharts hook (Charts,
// Correlation, and Pairs sub-panes all register there).
const subSeries = (reSrc) => page.evaluate((re) => {
  const rx = new RegExp(re);
  const set = window.__subCharts; if (!set) return null;
  for (const chart of set) {
    try {
      for (const pane of chart.panes()) for (const s of pane.getSeries()) {
        let o; try { o = s.options(); } catch { continue; }
        const real = o.title || s.__labelsOffTitle || '';
        if (rx.test(real)) return { shownTitle: o.title || '', priceLineVisible: o.priceLineVisible !== false };
      }
    } catch {}
  }
  return null;
}, reSrc);
const subPanes = (base, pfx) => page.evaluate((b, p) => {
  return [...document.querySelectorAll(`[data-testid^="${p}"]`)]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => !/-(close|hide|maximize|resize|up|down)$/.test(t) && !/-readout$/.test(t))
    .filter((t) => t === `${p}${b}` || t.startsWith(`${p}${b}#`));
}, base, pfx);
const chartOptLabel = (tid) => page.$eval(`${sel(tid)} option[value="chart"]`, (el) => el.textContent).catch(() => null);

let PASS = true;
const check = (cond, msg) => { log((cond ? 'PASS' : 'FAIL') + ': ' + msg); if (!cond) PASS = false; };

// ══════════ CHARTS ══════════
log('── Charts ──');
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 90000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 });
await waitUntil(async () => page.evaluate(() => {
  const m = window.__chartsPanes; if (!m || !m.size) return false;
  for (const [, c] of m) for (const p of c.panes()) for (const s of p.getSeries()) { try { if (s.data && s.data().length) return true; } catch {} }
  return false;
}), 120000, 'charts data');
await click('toggle-indicators');
await settle(1500);
await ensureOff('toggle-rsi');
await toggleOn('toggle-rsi', 'inst-row-rsi-0');
await settle(1500);

// Per-instance PX-LINE on a SUB-pane (P chip)
let st = await subSeries('^RSI 14');
check(st !== null && st.priceLineVisible === true, 'Charts: sub-pane RSI px-line on by default');
await click('inst-pxline-rsi-0');
await settle(1500);
st = await subSeries('^RSI 14');
check(st !== null && st.priceLineVisible === false, 'Charts: P chip hides the sub-pane RSI px-line');
await click('inst-pxline-rsi-0');
await settle(1500);
st = await subSeries('^RSI 14');
check(st !== null && st.priceLineVisible === true, 'Charts: P chip restores it');

// Chip-menu Labels entry (sidebar chip)
const chartsMenu = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-testid^="layout-menu-"]')].map((el) => el.getAttribute('data-testid'));
  return els.find((t) => t.includes('rsi') && !t.includes('panel-')) ?? null;
});
check(!!chartsMenu, `Charts: sidebar RSI chip menu (${chartsMenu})`);
if (chartsMenu) {
  await click(chartsMenu);
  await settle(500);
  await click('chip-labels');
  await settle(1500);
  st = await subSeries('^RSI 14');
  check(st !== null && st.shownTitle === '', 'Charts: menu "Hide axis labels" blanks the RSI label');
  if (!(await has('chip-labels'))) { await click(chartsMenu); await settle(400); }
  await click('chip-labels');
  await settle(1500);
  st = await subSeries('^RSI 14');
  check(st !== null && st.shownTitle !== '', 'Charts: menu "Show axis labels" restores it');
  // Px-line via menu
  if (!(await has('chip-pxline'))) { await click(chartsMenu); await settle(400); }
  await click('chip-pxline');
  await settle(1500);
  st = await subSeries('^RSI 14');
  check(st !== null && st.priceLineVisible === false, 'Charts: menu "Hide price line" works');
  if (!(await has('chip-pxline'))) { await click(chartsMenu); await settle(400); }
  await click('chip-pxline');
  await settle(1200);
}

// ══════════ PAIRS ══════════
log('── Pairs ──');
await page.goto(`${BASE}/#/pairs`, { waitUntil: 'networkidle2', timeout: 90000 });
await waitUntil(async () => page.evaluate(() => {
  const set = window.__pairsCharts; if (!set || !set.size) return false;
  for (const c of set) for (const p of c.panes()) for (const s of p.getSeries()) { try { if (s.data && s.data().length) return true; } catch {} }
  return false;
}), 120000, 'pairs chart');
await settle(1000);
if (await has('pairs-indicators-toggle')) await click('pairs-indicators-toggle');
await settle(1200);
if (!(await has('toggle-rsi'))) {
  const headers = await page.$$('xpath/.//*[contains(text(),"Oscillators")]');
  if (headers.length) await headers[0].click();
  await settle(600);
}
await ensureOff('toggle-rsi');
await toggleOn('toggle-rsi', 'inst-row-rsi-0');
await settle();

// Chart (D) freq label on the Pairs panel
const pairsFreqLabel = await chartOptLabel('inst-freq-rsi-0');
check(pairsFreqLabel === 'Chart (D)', `Pairs: freq option reads "Chart (D)" (${pairsFreqLabel})`);

// Merge / unmerge on Pairs
await click('inst-add-rsi');
await settle(1500);
check((await subPanes('rsi', 'pairs-sub-indicator-')).length === 2, 'Pairs: two RSI panes');
const pairsMergeTarget = await page.$eval(sel('inst-pane-rsi-1'), (el) => {
  const opt = [...el.options].find((o) => o.value !== '__own');
  return opt ? opt.value : null;
});
check(pairsMergeTarget !== null, `Pairs: merge target offered (${pairsMergeTarget})`);
await setControl('inst-pane-rsi-1', pairsMergeTarget);
await settle(1500);
check((await subPanes('rsi', 'pairs-sub-indicator-')).length === 1, 'Pairs: merge -> one shared pane');
await setControl('inst-pane-rsi-1', '__own');
await settle(1500);
check((await subPanes('rsi', 'pairs-sub-indicator-')).length === 2, 'Pairs: un-merge -> two panes');
await click('inst-remove-rsi-1');
await settle(900);

// Duplicate on Pairs
const pairsBefore = (await subPanes('rsi', 'pairs-sub-indicator-')).length;
await click('inst-dup-rsi-0');
await settle(1500);
check((await subPanes('rsi', 'pairs-sub-indicator-')).length === pairsBefore + 1, 'Pairs: duplicate adds an own-pane instance');
await click('inst-remove-rsi-1');
await settle(900);

// Menu Labels entry on the Pairs chip row
const pairsMenu = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-testid^="layout-menu-"]')].map((el) => el.getAttribute('data-testid'));
  return els.find((t) => t.includes('rsi')) ?? null;
});
if (pairsMenu) {
  await click(pairsMenu);
  await settle(500);
  await click('chip-labels');
  await settle(1500);
  const pst = await subSeries('^RSI 14');
  check(pst !== null && pst.shownTitle === '', 'Pairs: menu "Hide axis labels" blanks the RSI label');
  if (!(await has('chip-labels'))) { await click(pairsMenu); await settle(400); }
  await click('chip-labels');
  await settle(1200);
} else check(false, 'Pairs: RSI chip menu missing');

// ══════════ CORRELATION ══════════
log('── Correlation ──');
await page.goto(`${BASE}/#/correlation`, { waitUntil: 'networkidle2', timeout: 90000 });
await settle(9000);
await click('corr-toggle-indicators');
await settle(1500);
await ensureOff('toggle-rsi');
await toggleOn('toggle-rsi', 'inst-row-rsi-0');
await settle(1500);

// Freq label
const corrFreqLabel = await chartOptLabel('inst-freq-rsi-0');
check(corrFreqLabel !== null && /^Chart/.test(corrFreqLabel), `Correlation: freq option labeled (${corrFreqLabel})`);

// Merge / unmerge on Correlation
await click('inst-add-rsi');
await settle(1500);
check((await subPanes('rsi', 'sub-indicator-')).length === 2, 'Correlation: two RSI panes');
const corrMergeTarget = await page.$eval(sel('inst-pane-rsi-1'), (el) => {
  const opt = [...el.options].find((o) => o.value !== '__own');
  return opt ? opt.value : null;
});
await setControl('inst-pane-rsi-1', corrMergeTarget);
await settle(1500);
check((await subPanes('rsi', 'sub-indicator-')).length === 1, 'Correlation: merge -> one shared pane');
await setControl('inst-pane-rsi-1', '__own');
await settle(1500);
check((await subPanes('rsi', 'sub-indicator-')).length === 2, 'Correlation: un-merge -> two panes');
await click('inst-remove-rsi-1');
await settle(900);

// Duplicate on Correlation
const corrBefore = (await subPanes('rsi', 'sub-indicator-')).length;
await click('inst-dup-rsi-0');
await settle(1500);
check((await subPanes('rsi', 'sub-indicator-')).length === corrBefore + 1, 'Correlation: duplicate adds an own-pane instance');
await click('inst-remove-rsi-1');
await settle(900);

// L chip functional on Correlation sub-pane
let cst = await subSeries('^RSI 14');
check(cst !== null && cst.shownTitle !== '', 'Correlation: RSI label on');
await click('inst-labels-rsi-0');
await settle(1500);
cst = await subSeries('^RSI 14');
check(cst !== null && cst.shownTitle === '', 'Correlation: L chip hides the RSI label');
await click('inst-labels-rsi-0');
await settle(1200);
await ensureOff('toggle-rsi');

log('errors:', errs.slice(0, 5));
log(PASS ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌');
await browser.close();
process.exit(PASS ? 0 : 1);
