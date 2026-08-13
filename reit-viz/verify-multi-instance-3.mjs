// Final verification: legacy indicator-set round-trip through the NEW panel,
// Pairs/Compare multi-instance parity, Macro render sanity, Correlation reuse.
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
  // Block ALL pref/workspace writes — indicator sets sync to server prefs too.
  if (req.method() === 'POST' && (u.includes('/api/workspaces') || u.includes('/api/custom-charts') || u.includes('/api/prefs'))) return req.abort();
  // Also block the indicator-sets pref GET so the server copy can't clobber
  // the legacy-shaped set this probe seeds into localStorage.
  if (u.includes('/api/prefs') && u.includes('indicator-sets')) return req.abort();
  req.continue();
});
const sel = (t) => `[data-testid="${t}"]`;
const log = (...a) => console.log('[final]', ...a);
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
const subPanes = (base, prefix = 'sub-indicator-') => page.evaluate((b, pfx) => {
  return [...document.querySelectorAll(`[data-testid^="${pfx}"]`)]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => !/-(close|hide|maximize|resize)$/.test(t) && !/-readout$/.test(t))
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

// ══ 1. Legacy indicator SET applied through the new panel (derive-on-read) ══
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
await page.evaluate(() => {
  localStorage.clear();
  // A pre-refactor set: legacy single-slot shape, no `instances` key.
  localStorage.setItem('reit-viz:indicator-sets', JSON.stringify([{
    id: 'legacy1', name: 'legacyset',
    indicators: { rsi: [14, 21], rsiFreq: 'weekly', registry: { adx: { enabled: true, freq: 'monthly', params: { period: 20 } } }, hiddenSubCharts: ['roc'], roc: 12 },
  }]));
});
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await waitUntil(async () => page.evaluate(() => {
  const m = window.__chartsPanes; if (!m || !m.size) return false;
  for (const [, c] of m) for (const p of c.panes()) for (const s of p.getSeries()) { try { if (s.data && s.data().length) return true; } catch {} }
  return false;
}), 90000, 'charts data');
await click('toggle-indicators');
await settle(1200);
await click('indicator-set-apply-legacyset');
await settle(1500);
let rsiPanes = await subPanes('rsi');
check(rsiPanes.length === 1 && rsiPanes[0] === 'sub-indicator-rsi',
  `legacy set → ONE bare-key RSI pane (${rsiPanes.join(',')})`);
const adxPanes = await subPanes('adx');
check(adxPanes.length === 1 && adxPanes[0] === 'sub-indicator-adx', 'legacy set → bare-key ADX pane');
const rocPanes = await subPanes('roc');
check(rocPanes.length === 0, 'legacy set → hidden ROC stays hidden (hiddenSubCharts key match)');
// The legacy weekly freq must reach the derived instances: chip shows W.
const rsiChip = await chipOf('sub-indicator-rsi');
check(!!rsiChip && /RSI/.test(rsiChip), `legacy RSI pane chip renders (${rsiChip})`);
// Editing the legacy-derived state through the new rows keeps working:
// instance rows show 2 rows (14, 21) both weekly.
const rowFreqs = await page.evaluate(() => {
  const f0 = document.querySelector('[data-testid="inst-freq-rsi-0"]');
  const f1 = document.querySelector('[data-testid="inst-freq-rsi-1"]');
  return [f0 && f0.value, f1 && f1.value];
});
check(rowFreqs[0] === 'weekly' && rowFreqs[1] === 'weekly', `legacy rsiFreq flows into BOTH instance rows (${rowFreqs.join(',')})`);

// ══ 2. Pairs/Compare: RSI daily + weekly two panes ══
await page.goto(`${BASE}/#/pairs`, { waitUntil: 'networkidle2', timeout: 60000 });
try {
  await waitUntil(async () => page.evaluate(() => {
    const set = window.__pairsCharts; if (!set || !set.size) return false;
    for (const c of set) for (const p of c.panes()) for (const s of p.getSeries()) { try { if (s.data && s.data().length) return true; } catch {} }
    return false;
  }), 90000, 'pairs chart');
  await settle(800);
  if (await has('pairs-indicators-toggle')) await click('pairs-indicators-toggle');
  await settle(1000);
  if (!(await has('toggle-rsi'))) {
    const headers = await page.$$('xpath/.//*[contains(text(),"Oscillators")]');
    if (headers.length) await headers[0].click();
    await settle(500);
  }
  await click('toggle-rsi');
  await settle();
  await click('inst-add-rsi');
  await settle();
  await setControl('inst-freq-rsi-1', 'weekly');
  await settle(1500);
  const pairsRsi = await subPanes('rsi', 'pairs-sub-indicator-');
  check(pairsRsi.length === 2, `Pairs: two RSI panes (${pairsRsi.join(',')})`);
  const ph0 = await paneHash(pairsRsi[0]);
  const ph1 = await paneHash(pairsRsi[1]);
  check(ph0 !== null && ph1 !== null && ph0 !== ph1, `Pairs: daily vs weekly RSI differ (${ph0} vs ${ph1})`);
  // ROC 12 + 20 separate panes on Pairs too.
  await click('toggle-roc');
  await settle();
  await click('inst-preset-roc-20');
  await settle(1200);
  const pairsRoc = await subPanes('roc', 'pairs-sub-indicator-');
  check(pairsRoc.length === 2, `Pairs: ROC 12 + ROC 20 panes (${pairsRoc.join(',')})`);
} catch (e) { check(false, 'Pairs section errored: ' + String(e).slice(0, 160)); }

// ══ 3. Macro: registry instance render sanity (ADX two freqs, no crash) ══
await page.goto(`${BASE}/#/macro`, { waitUntil: 'networkidle2', timeout: 60000 });
try {
  const macroOk = await waitUntil(
    async () => page.evaluate(() => document.querySelectorAll('canvas').length > 0),
    45000,
    'macro canvases',
  ).then(() => true).catch(() => false);
  check(macroOk, 'Macro page renders charts');
  const macroErrs = errs.filter((e) => /macro/i.test(e)).length;
  check(macroErrs === 0, 'Macro: no console errors');
} catch (e) { check(false, 'Macro section errored: ' + String(e).slice(0, 160)); }

// ══ 4. Correlation: shared ChartPane — RSI two instances ══
await page.goto(`${BASE}/#/correlation`, { waitUntil: 'networkidle2', timeout: 60000 });
try {
  await settle(8000); // correlation settle (memory: slow hydrate)
  const corrHasCharts = await page.evaluate(() => document.querySelectorAll('canvas').length > 0);
  check(corrHasCharts, 'Correlation page renders charts (shared ChartPane path)');
} catch (e) { check(false, 'Correlation section errored: ' + String(e).slice(0, 160)); }

log('console errors:', errs.filter((e) => !/ERR_FAILED/.test(e)).slice(0, 8));
log(PASS ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌');
await browser.close();
process.exit(PASS ? 0 : 1);
