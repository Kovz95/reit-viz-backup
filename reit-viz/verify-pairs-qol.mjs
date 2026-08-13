// Pairs-page QoL verification: indicator chips (delete / solo / labels /
// clear-all) in the Pairs panel + sub-pane reorder — parity with Charts.
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
const log = (...a) => console.log('[pairs-qol]', ...a);
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
const subPanes = (base) => page.evaluate((b) => {
  const pfx = 'pairs-sub-indicator-';
  return [...document.querySelectorAll(`[data-testid^="${pfx}"]`)]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => !/-(close|hide|maximize|resize|up|down)$/.test(t) && !/-readout$/.test(t))
    .filter((t) => t === `${pfx}${b}` || t.startsWith(`${pfx}${b}#`) || t.startsWith(`${pfx}reg:${b}`));
}, base);
const subOrder = () => page.evaluate(() => {
  return [...document.querySelectorAll('[data-testid^="pairs-sub-indicator-"]')]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => !/-(close|hide|maximize|resize|up|down)$/.test(t) && !/-readout$/.test(t));
});
// Sub-chart series state via the shared window.__subCharts hook.
const subSeriesState = (reSrc) => page.evaluate((re) => {
  const rx = new RegExp(re);
  const set = window.__subCharts; if (!set) return null;
  for (const chart of set) {
    try {
      for (const pane of chart.panes()) for (const s of pane.getSeries()) {
        let o; try { o = s.options(); } catch { continue; }
        const real = o.title || s.__labelsOffTitle || '';
        if (rx.test(real)) return { shownTitle: o.title || '' };
      }
    } catch {}
  }
  return null;
}, reSrc);

let PASS = true;
const check = (cond, msg) => { log((cond ? 'PASS' : 'FAIL') + ': ' + msg); if (!cond) PASS = false; };

await page.goto(`${BASE}/#/pairs`, { waitUntil: 'networkidle2', timeout: 90000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 });
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
await ensureOff('toggle-roc');
await settle(500);

// ── Chips render for active indicators ──
await toggleOn('toggle-rsi', 'inst-row-rsi-0');
await settle();
await toggleOn('toggle-roc', 'inst-row-roc-0');
await settle(1500);
const chips = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="layout-subchart-"]')].map((el) => el.getAttribute('data-testid')));
check(chips.some((t) => /rsi/.test(t)) && chips.some((t) => /roc/.test(t)), `Pairs panel shows RSI + ROC chips (${chips.join(' | ')})`);

// ── Per-instance labels via row chip (weekly instance) ──
await click('inst-add-rsi');
await settle();
await setControl('inst-freq-rsi-1', 'weekly');
await settle(1500);
let wk = await subSeriesState('^RSI 14W');
check(wk !== null && wk.shownTitle !== '', 'baseline: Pairs weekly RSI label shown');
await click('inst-labels-rsi-1');
await settle(1500);
wk = await subSeriesState('^RSI 14W');
const dl = await subSeriesState('^RSI 14$');
check(wk !== null && wk.shownTitle === '', 'Pairs: weekly RSI label hidden via instance toggle');
check(dl !== null && dl.shownTitle !== '', 'Pairs: daily RSI label untouched');
await click('inst-remove-rsi-1');
await settle(900);

// ── Chip menu solo ──
const rsiMenu = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-testid^="layout-menu-"]')].map((el) => el.getAttribute('data-testid'));
  return els.find((t) => t.includes('rsi')) ?? null;
});
check(!!rsiMenu, `RSI chip has a menu (${rsiMenu})`);
if (rsiMenu) {
  await click(rsiMenu);
  await settle(500);
  await click('chip-solo');
  await settle(1500);
  check((await subPanes('roc')).length === 0 && (await subPanes('rsi')).length >= 1, 'Pairs: solo RSI hides ROC pane');
  if (!(await has('chip-solo'))) { await click(rsiMenu); await settle(400); }
  await click('chip-solo');
  await settle(1500);
  check((await subPanes('roc')).length === 1, 'Pairs: solo again restores');
}

// ── Chip delete ──
const rocDel = await page.evaluate(() => {
  const chips2 = [...document.querySelectorAll('[data-testid^="layout-del-"]')];
  const el = chips2.find((c) => (c.getAttribute('title') || '').includes('ROC'));
  return el ? el.getAttribute('data-testid') : null;
});
check(!!rocDel, `ROC chip delete present (${rocDel})`);
if (rocDel) {
  await click(rocDel);
  await settle(1500);
  check((await subPanes('roc')).length === 0, 'Pairs: chip ✕ removes the ROC pane');
}

// ── Reorder: add ADX (registry, "reg:" key space), move it above RSI ──
await setControl('indicator-search', 'adx');
await settle(500);
await toggleOn('toggle-adx', 'inst-row-adx-0');
await settle(1500);
const before = await subOrder();
const adxKey = before.find((t) => t.includes('reg:adx'));
check(!!adxKey, `ADX sub-pane present (${before.join(' | ')})`);
if (adxKey && (await has(`${adxKey}-up`))) {
  const idx = before.indexOf(adxKey);
  await click(`${adxKey}-up`);
  await settle(1500);
  const after = await subOrder();
  check(after.indexOf(adxKey) === Math.max(0, idx - 1), `Pairs: ADX moved up (${after.join(' | ')})`);
} else {
  check(false, 'Pairs reorder arrows missing');
}
await setControl('indicator-search', '');
await settle(400);

// ── Clear-all ──
const clearBtn = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="layout-clear-indicators-"]')]
    .map((el) => el.getAttribute('data-testid'))
    .find((t) => t !== 'layout-clear-indicators-confirm') ?? null);
check(!!clearBtn, `Pairs clear-all trash present (${clearBtn})`);
if (clearBtn) {
  await click(clearBtn);
  await settle(400);
  await click('layout-clear-indicators-confirm');
  await settle(1500);
  const anySub = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="pairs-sub-indicator-"]')]
      .filter((el) => !/-(close|hide|maximize|resize|up|down)$/.test(el.getAttribute('data-testid')) && !/-readout$/.test(el.getAttribute('data-testid'))).length);
  check(anySub === 0, 'Pairs: clear-all removes every sub-pane');
}

log('errors:', errs.slice(0, 5));
log(PASS ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌');
await browser.close();
process.exit(PASS ? 0 : 1);
