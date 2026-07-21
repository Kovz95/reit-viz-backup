// Verify driver for the Universal Hit-Rate Screener (untracked; verify workflow).
import { createRequire } from 'module';
const require = createRequire('C:/Users/NickK/AppData/Roaming/npm/node_modules/');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const BASE = 'http://localhost:5210';
const SHOT_DIR = process.env.SHOT_DIR || '.';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 950 });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 300)));

const sel = (t) => `[data-testid="${t}"]`;
async function waitFor(testid, ms = 30000) {
  await page.waitForSelector(sel(testid), { timeout: ms });
}
async function text(testid) {
  return page.$eval(sel(testid), (el) => el.textContent.trim()).catch(() => null);
}
async function waitUntil(fn, ms = 180000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('timeout waiting for ' + label);
}
const log = (...a) => console.log('[verify]', ...a);

// ── 1. Load page (fresh prefs + fresh IndexedDB so defaults apply) ─────────
await page.goto(`${BASE}/#/universal-screener`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.evaluate(async () => {
  localStorage.clear();
  await new Promise((res) => {
    const req = indexedDB.deleteDatabase('reit-viz-universal-screener');
    req.onsuccess = req.onerror = req.onblocked = () => res(null);
  });
});
await page.reload({ waitUntil: 'networkidle2' });
await waitFor('universal-screener-page');
log('page loaded (fresh state)');

// Wait for the workbook universe to arrive.
await waitUntil(async () => {
  const t = await text('uhs-universe-count');
  return t && /^(?!0 )\d+ tickers/.test(t);
}, 60000, 'universe count > 0');
log('universe:', await text('uhs-universe-count'));

// ── 2. Narrow scope to AHR via classification search ────────────────────────
await page.click(sel('uhs-clf-search'), { clickCount: 3 }).catch(() => {});
await page.type(sel('uhs-clf-search'), 'AHR');
await waitUntil(async () => {
  const t = await text('uhs-universe-count');
  return t && /^([1-9]|1[0-9]) tickers/.test(t);
}, 20000, 'narrowed universe');
log('narrowed universe:', await text('uhs-universe-count'));

// ── 3. Run the sweep ────────────────────────────────────────────────────────
await page.click(sel('uhs-run'));
await waitUntil(async () => (await text('uhs-run'))?.includes('Cancel'), 10000, 'run started');
log('run started');
await waitUntil(async () => (await text('uhs-run'))?.includes('Run'), 240000, 'run finished');
log('run finished');
log('view tabs:', await text('uhs-view-firing'), '|', await text('uhs-view-library'));
log('staleness:', await text('uhs-staleness'));

// ── 4. Inspect the library ──────────────────────────────────────────────────
await page.click(sel('uhs-view-library'));
await new Promise((r) => setTimeout(r, 300));
const rowsInfo = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-testid^="uhs-row-"]')];
  return {
    count: rows.length,
    sample: rows.slice(0, 6).map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 160)),
  };
});
log('library rows:', rowsInfo.count);
rowsInfo.sample.forEach((s) => log('  row:', s));
if (rowsInfo.count === 0) throw new Error('library is empty after run — expected qualified setups for AHR');

// Expand the first row → horizon grid.
await page.click('[data-testid^="uhs-row-"]');
await new Promise((r) => setTimeout(r, 300));
const expanded = await page.evaluate(() => {
  const t = [...document.querySelectorAll('tbody tr')].find((tr) => tr.innerText.includes('t-stat'));
  return t ? t.innerText.replace(/\s+/g, ' ').slice(0, 200) : null;
});
log('expanded horizons:', expanded);
await page.screenshot({ path: `${SHOT_DIR}/uhs-library.png` });

// ── 5. Reload → IndexedDB restore ───────────────────────────────────────────
await page.reload({ waitUntil: 'networkidle2' });
await waitFor('universal-screener-page');
await waitUntil(async () => {
  const n = await page.$$eval('[data-testid^="uhs-row-"]', (els) => els.length).catch(() => 0);
  const stale = await text('uhs-staleness');
  return stale && stale.includes('Library built');
}, 20000, 'IndexedDB restore');
await page.click(sel('uhs-view-library'));
await new Promise((r) => setTimeout(r, 300));
const restoredCount = await page.$$eval('[data-testid^="uhs-row-"]', (els) => els.length);
log('restored rows after reload:', restoredCount, '| staleness:', await text('uhs-staleness'));
if (restoredCount === 0) throw new Error('no rows restored from IndexedDB after reload');

// ── 6. Change a setting → scope mismatch note ───────────────────────────────
await page.click(sel('uhs-hit-threshold'), { clickCount: 3 });
await page.type(sel('uhs-hit-threshold'), '60');
await new Promise((r) => setTimeout(r, 500));
const mismatch = await text('uhs-scope-mismatch');
log('scope mismatch note:', mismatch);
if (!mismatch) throw new Error('expected scope-mismatch note after changing threshold');
// restore threshold to 50
await page.click(sel('uhs-hit-threshold'), { clickCount: 3 });
await page.type(sel('uhs-hit-threshold'), '50');

// ── 7. Refresh firing status ────────────────────────────────────────────────
const beforeStale = await text('uhs-staleness');
await page.click(sel('uhs-refresh-firing'));
await waitUntil(async () => {
  const t = await text('uhs-staleness');
  return t && t.includes('firing refreshed');
}, 60000, 'firing refresh');
log('after refresh:', await text('uhs-staleness'));

// ── 8. Probe: empty universe run ────────────────────────────────────────────
await page.click(sel('uhs-clf-search'), { clickCount: 3 });
await page.type(sel('uhs-clf-search'), 'ZZZQQQX');
await new Promise((r) => setTimeout(r, 600));
log('garbage-search universe:', await text('uhs-universe-count'));
await page.click(sel('uhs-run'));
await new Promise((r) => setTimeout(r, 800));
const err = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find((d) => d.textContent.includes('Universe is empty'));
  return el ? el.textContent.trim().slice(0, 120) : null;
});
log('empty-universe error:', err);

// ── 9. Pair mode smoke (classification cohort) ──────────────────────────────
await page.click(sel('uhs-clf-search'), { clickCount: 3 });
await page.keyboard.press('Backspace');
for (let i = 0; i < 8; i++) await page.keyboard.press('Backspace');
await page.select(sel('uhs-universe-mode'), 'classification');
await new Promise((r) => setTimeout(r, 800));
// pick subindustry dim for a small cohort
const dimSelects = await page.$$('select');
// classification dim select is the one right after universe mode; use evaluate to set
await page.evaluate(() => {
  const selects = [...document.querySelectorAll('select')];
  const modeSel = document.querySelector('[data-testid="uhs-universe-mode"]');
  const idx = selects.indexOf(modeSel);
  const dimSel = selects[idx + 1];
  dimSel.value = 'subindustry';
  dimSel.dispatchEvent(new Event('change', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 800));
await page.click(sel('uhs-mode-pair'));
await new Promise((r) => setTimeout(r, 500));
log('pair scope:', await text('uhs-universe-count'));
await page.click(sel('uhs-run'));
await waitUntil(async () => (await text('uhs-run'))?.includes('Run'), 240000, 'pair run finished');
const pairRows = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-testid^="uhs-row-"]')];
  return rows.slice(0, 5).map((r) => r.innerText.replace(/\s+/g, ' ').slice(0, 140));
});
await page.click(sel('uhs-view-library')).catch(() => {});
await new Promise((r) => setTimeout(r, 300));
const pairLibCount = await page.$$eval('[data-testid^="uhs-row-"]', (els) => els.length).catch(() => 0);
log('pair library rows:', pairLibCount);
pairRows.forEach((s) => log('  pair row:', s));
await page.screenshot({ path: `${SHOT_DIR}/uhs-pairs.png` });

// ── Wrap up ─────────────────────────────────────────────────────────────────
log('console errors:', consoleErrors.length);
consoleErrors.slice(0, 10).forEach((e) => log('  CONSOLE:', e));
await browser.close();
log('DONE');
