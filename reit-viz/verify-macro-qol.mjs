// Macro-page QoL verification: panel chips work against the band renderer —
// multi-instance RSI band (daily + weekly), chip hide/show gating, chip
// delete, clear-all. Bands are canvas-only → assert via pixel hashes of the
// macro chart plus panel state.
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
const log = (...a) => console.log('[macro-qol]', ...a);
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
const macroHash = () => page.evaluate(() => {
  const root = document.querySelector('[data-testid="macro-page"]');
  if (!root) return null;
  let h = 0, n = 0;
  for (const cv of root.querySelectorAll('canvas')) {
    try {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < d.length; i += 173) { h = ((h * 31) + d[i]) >>> 0; n++; }
    } catch {}
  }
  return n ? h : null;
});

let PASS = true;
const check = (cond, msg) => { log((cond ? 'PASS' : 'FAIL') + ': ' + msg); if (!cond) PASS = false; };

await page.goto(`${BASE}/#/macro`, { waitUntil: 'networkidle2', timeout: 90000 });
await settle(3000);
// The page starts empty — load a Quick View so a chart exists to indicate on.
{
  const qv = await page.$$('xpath/.//*[text()="Yield Curve"]');
  if (qv.length) await qv[0].click();
}
await waitUntil(async () => page.evaluate(() => {
  const root = document.querySelector('[data-testid="macro-page"]');
  return !!root && root.querySelectorAll('canvas').length > 0;
}), 90000, 'macro chart');
await settle(3000);
await click('toggle-indicators');
await settle(1500);
await ensureOff('toggle-rsi');
await ensureOff('toggle-roc');
await settle(800);
const h0 = await macroHash();

// ── Multi-instance RSI band: daily + weekly ──
await toggleOn('toggle-rsi', 'inst-row-rsi-0');
await settle(1800);
const h1 = await macroHash();
check(h0 !== null && h1 !== null && h1 !== h0, `RSI band renders (${h0} -> ${h1})`);
await click('inst-add-rsi');
await settle();
await setControl('inst-freq-rsi-1', 'weekly');
await settle(2000);
const h2 = await macroHash();
check(h2 !== null && h2 !== h1, `second (weekly) RSI instance adds a band line (${h1} -> ${h2})`);

// ── Panel chips + hide gating ──
const rsiChip = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-testid^="layout-subchart-panel-"]')].map((el) => el.getAttribute('data-testid'));
  return els.find((t) => t.includes('rsi')) ?? null;
});
check(!!rsiChip, `RSI chip in the panel (${rsiChip})`);
if (rsiChip) {
  await click(rsiChip); // hide that instance group's band
  await settle(1800);
  const h3 = await macroHash();
  check(h3 !== null && h3 !== h2, `chip hide removes the band from the chart (${h2} -> ${h3})`);
  await click(rsiChip); // show again
  await settle(1800);
  const h4 = await macroHash();
  check(h4 !== null && h4 !== h3, 'chip show restores the band');
}

// ── Chip delete ──
await toggleOn('toggle-roc', 'inst-row-roc-0');
await settle(1800);
const rocDel = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('[data-testid^="layout-del-panel-"]')];
  const el = chips.find((c) => (c.getAttribute('title') || '').includes('ROC'));
  return el ? el.getAttribute('data-testid') : null;
});
check(!!rocDel, `ROC chip delete present (${rocDel})`);
if (rocDel) {
  const h5 = await macroHash();
  await click(rocDel);
  await settle(1800);
  const rocSwitch = await page.$eval(sel('toggle-roc'), (el) => el.getAttribute('data-state'));
  const h6 = await macroHash();
  check(rocSwitch === 'unchecked' && h6 !== h5, 'chip delete removes ROC (switch off + chart changes)');
}

// ── Clear-all ──
const clearBtn = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="layout-clear-indicators-panel-"]')]
    .map((el) => el.getAttribute('data-testid'))[0] ?? null);
check(!!clearBtn, `panel clear-all present (${clearBtn})`);
if (clearBtn) {
  await click(clearBtn);
  await settle(400);
  await click('layout-clear-indicators-confirm');
  await settle(1800);
  const rsiSwitch = await page.$eval(sel('toggle-rsi'), (el) => el.getAttribute('data-state'));
  check(rsiSwitch === 'unchecked', 'clear-all turns everything off');
}

log('errors:', errs.slice(0, 5));
log(PASS ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌');
await browser.close();
process.exit(PASS ? 0 : 1);
