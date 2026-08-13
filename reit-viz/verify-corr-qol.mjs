// Correlation-page QoL verification: panel indicator chips (delete / solo /
// clear-all) + sub-pane close/hide/reorder — parity with Charts/Pairs.
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
const log = (...a) => console.log('[corr-qol]', ...a);
async function has(testid) { return (await page.$(sel(testid))) != null; }
async function click(testid, ms = 25000) { await page.waitForSelector(sel(testid), { timeout: ms }); await page.click(sel(testid)); }
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
  const pfx = 'sub-indicator-';
  return [...document.querySelectorAll(`[data-testid^="${pfx}"]`)]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => !/-(close|hide|maximize|resize|up|down)$/.test(t) && !/-readout$/.test(t))
    .filter((t) => t === `${pfx}${b}` || t.startsWith(`${pfx}${b}#`));
}, base);
const subOrder = () => page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="sub-indicator-"]')]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => !/-(close|hide|maximize|resize|up|down)$/.test(t) && !/-readout$/.test(t)));

let PASS = true;
const check = (cond, msg) => { log((cond ? 'PASS' : 'FAIL') + ': ' + msg); if (!cond) PASS = false; };

await page.goto(`${BASE}/#/correlation`, { waitUntil: 'networkidle2', timeout: 90000 });
await settle(9000); // hydration gate (server-prefs template restore)
await click('corr-toggle-indicators');
await settle(1500);
await ensureOff('toggle-rsi');
await ensureOff('toggle-roc');
await settle(500);

// ── Panel chips render for active indicators ──
await toggleOn('toggle-rsi', 'inst-row-rsi-0');
await settle();
await toggleOn('toggle-roc', 'inst-row-roc-0');
await settle(1800);
const chips = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="layout-subchart-panel-"]')].map((el) => el.getAttribute('data-testid')));
check(chips.some((t) => /rsi/.test(t)) && chips.some((t) => /roc/.test(t)), `panel chips show RSI + ROC (${chips.join(' | ')})`);

// ── Chip menu solo ──
const rsiMenu = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-testid^="layout-menu-panel-"]')].map((el) => el.getAttribute('data-testid'));
  return els.find((t) => t.includes('rsi')) ?? null;
});
check(!!rsiMenu, `RSI panel chip has a menu (${rsiMenu})`);
if (rsiMenu) {
  await click(rsiMenu);
  await settle(500);
  await click('chip-solo');
  await settle(1500);
  check((await subPanes('roc')).length === 0 && (await subPanes('rsi')).length >= 1, 'solo RSI hides the ROC pane');
  if (!(await has('chip-solo'))) { await click(rsiMenu); await settle(400); }
  await click('chip-solo');
  await settle(1500);
  check((await subPanes('roc')).length === 1, 'solo again restores');
}

// ── Sub-pane header close now works on Correlation ──
const rocPane = (await subPanes('roc'))[0];
check(!!rocPane && (await has(`${rocPane}-close`)), `ROC sub-pane has a ✕ (${rocPane})`);
if (rocPane) {
  await click(`${rocPane}-close`);
  await settle(1500);
  check((await subPanes('roc')).length === 0, 'sub-pane ✕ removes the instance');
}

// ── Reorder: add ROC back, move it above RSI ──
await toggleOn('toggle-roc', 'inst-row-roc-0');
await settle(1500);
const before = await subOrder();
const rocKey = before.find((t) => t.startsWith('sub-indicator-roc'));
if (rocKey && (await has(`${rocKey}-up`))) {
  const idx = before.indexOf(rocKey);
  await click(`${rocKey}-up`);
  await settle(1500);
  const after = await subOrder();
  check(after.indexOf(rocKey) === Math.max(0, idx - 1), `reorder: ROC moved up (${after.join(' | ')})`);
} else {
  check(false, 'reorder arrows missing on Correlation sub-panes');
}

// ── Clear-all via the panel trash ──
const clearBtn = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="layout-clear-indicators-panel-"]')]
    .map((el) => el.getAttribute('data-testid'))[0] ?? null);
check(!!clearBtn, `panel clear-all present (${clearBtn})`);
if (clearBtn) {
  await click(clearBtn);
  await settle(400);
  await click('layout-clear-indicators-confirm');
  await settle(1500);
  const anySub = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="sub-indicator-"]')]
      .filter((el) => !/-(close|hide|maximize|resize|up|down)$/.test(el.getAttribute('data-testid'))).length);
  check(anySub === 0, 'clear-all removes every sub-pane on the selected pane');
}

log('errors:', errs.slice(0, 5));
log(PASS ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌');
await browser.close();
process.exit(PASS ? 0 : 1);
