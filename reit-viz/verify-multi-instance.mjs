// Phase-2 acceptance gate for multi-instance indicators: legacy single-slot
// state must render EXACTLY as before the refactor (same pane keys, labels,
// close/hide behavior), driven through the existing panel (which still writes
// legacy fields at this phase). Plus engine-level probes of the new lib.
import { createRequire } from 'module';
const require = createRequire('C:/Users/NickK/AppData/Roaming/npm/node_modules/');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:5210';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 950 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
// Never leak probe state into shared server prefs.
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (req.method() === 'POST' && (u.includes('/api/workspaces') || u.includes('/api/custom-charts'))) return req.abort();
  req.continue();
});
const sel = (t) => `[data-testid="${t}"]`;
const log = (...a) => console.log('[gate]', ...a);
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
const settle = (ms = 800) => new Promise((r) => setTimeout(r, ms));
const chartReady = async () => page.evaluate(() => {
  const m = window.__chartsPanes; if (!m || !m.size) return false;
  for (const [, c] of m) for (const p of c.panes()) for (const s of p.getSeries()) { try { if (s.data && s.data().length) return true; } catch {} }
  return false;
});
const subPaneCount = (prefix) => page.evaluate((pfx) => {
  return [...document.querySelectorAll('[data-testid^="sub-indicator-"]')]
    .map((el) => el.getAttribute('data-testid'))
    .filter((t) => t === `sub-indicator-${pfx}` || t.startsWith(`sub-indicator-${pfx}#`))
    .filter((t) => !t.endsWith('-close') && !t.endsWith('-hide') && !t.endsWith('-maximize') && !t.endsWith('-resize')).length;
}, prefix);
const subChipText = (key) => page.$eval(`${sel('sub-indicator-' + key)} span`, (el) => el.textContent).catch(() => null);

let PASS = true;
const check = (cond, msg) => { log((cond ? 'PASS' : 'FAIL') + ': ' + msg); if (!cond) PASS = false; };

// ── Engine-level probes of the new lib (fast failure isolation) ──
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 60000 });
const engine = await page.evaluate(async () => {
  const m = await import('/src/lib/indicatorInstances.ts');
  const r = {};
  // Legacy derive-on-read: rsi periods × rsiFreq → one shared legacy group.
  const legacy = { rsi: [14, 21], rsiFreq: 'weekly' };
  const inst = m.getInstances(legacy, 'rsi');
  r.deriveCount = inst.length;
  r.deriveFreqs = inst.map((i) => i.freq).join(',');
  r.deriveGroups = [...new Set(inst.map((i) => m.effGroup(i)))].join(',');
  r.deriveKey = m.subChartKeyFor('rsi', m.effGroup(inst[0]));
  // Registry derive.
  const reg = { registry: { adx: { enabled: true, freq: 'monthly', params: { period: 20 } } } };
  const ri = m.getInstances(reg, 'adx');
  r.regDerive = ri.length === 1 && ri[0].freq === 'monthly' && ri[0].params.period === 20;
  // setInstances legacy sync: two RSI instances → rsi list synced, rsiFreq dropped.
  const two = m.setInstances(legacy, 'rsi', [
    { iid: 'i1', params: { period: 14 } },
    { iid: 'i2', params: { period: 14 }, freq: 'weekly' },
  ]);
  r.syncRsi = JSON.stringify(two.rsi);
  r.syncFreqGone = !('rsiFreq' in two) || two.rsiFreq === undefined;
  r.roundTrip = m.getInstances(two, 'rsi').length === 2;
  // Distinct pane keys for own-pane instances.
  const g = m.paneGroups(two, 'rsi');
  r.twoGroups = g.length === 2 && m.subChartKeyFor('rsi', g[0].group) === 'rsi#i1' && m.subChartKeyFor('rsi', g[1].group) === 'rsi#i2';
  // Merged pane: same `pane` id → one group.
  const merged = m.setInstances({}, 'roc', [
    { iid: 'i1', params: { period: 14 }, pane: 'i1' },
    { iid: 'i2', params: { period: 20 }, pane: 'i1' },
  ]);
  r.mergedGroups = m.paneGroups(merged, 'roc').length;
  // Empty write clears legacy field.
  const off = m.setInstances(two, 'rsi', []);
  r.offCleared = off.rsi === undefined && (off.instances?.rsi === undefined);
  return r;
});
log('engine:', JSON.stringify(engine));
check(engine.deriveCount === 2 && engine.deriveFreqs === 'weekly,weekly', 'lib: legacy rsi[14,21]+weekly derives 2 weekly instances');
check(engine.deriveGroups === '0' && engine.deriveKey === 'rsi', 'lib: legacy instances share group "0" → bare subKey "rsi"');
check(engine.regDerive === true, 'lib: registry adx derives instance w/ freq+params');
check(engine.syncRsi === '14' || engine.syncRsi === '[14]', 'lib: setInstances syncs legacy rsi period list (deduped) — got ' + engine.syncRsi);
check(engine.syncFreqGone === true, 'lib: setInstances drops superseded rsiFreq');
check(engine.roundTrip === true, 'lib: instances round-trip through state');
check(engine.twoGroups === true, 'lib: own-pane instances get distinct subKeys rsi#i1/rsi#i2');
check(engine.mergedGroups === 1, 'lib: instances pointing at one pane id merge into 1 group');
check(engine.offCleared === true, 'lib: empty instance list clears legacy field + instances key');

// ── UI legacy gate (panel still writes legacy fields this phase) ──
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await waitUntil(chartReady, 90000, 'charts data');
log('charts ready');
await click('toggle-indicators');
await settle(1200);

// RSI on + weekly freq (legacy rsi + rsiFreq writers).
if (!(await has('toggle-rsi'))) {
  const headers = await page.$$('xpath/.//*[contains(text(),"Oscillators")]');
  if (headers.length) await headers[0].click();
  await settle(500);
}
await click('toggle-rsi');
await settle();
check((await subPaneCount('rsi')) === 1, 'legacy: RSI on → exactly ONE rsi sub-pane (bare key)');
await setControl('freq-rsi', 'weekly');
await settle();
check((await subPaneCount('rsi')) === 1, 'legacy: weekly freq keeps ONE rsi pane');
const rsiChip = await subChipText('rsi');
check(!!rsiChip && /14.*W/.test(rsiChip), 'legacy: pane chip shows weekly instance label — got "' + rsiChip + '"');

// Registry indicator (ADX) via search.
await setControl('indicator-search', 'adx');
await settle(400);
await click('toggle-adx');
await settle();
check((await subPaneCount('adx')) === 1, 'legacy: ADX on → one adx sub-pane');
await setControl('freq-adx', 'monthly');
await settle();
const adxChip = await subChipText('adx');
check(!!adxChip && /M/.test(adxChip), 'legacy: ADX chip carries monthly label — got "' + adxChip + '"');

// Hide round-trip on the RSI pane.
await click('sub-indicator-rsi-hide');
await settle();
check((await subPaneCount('rsi')) === 0, 'hide: rsi pane unmounts');
// Re-show via the sidebar current-layout chip is separate UI; toggling the
// indicator itself back on must NOT be needed — un-hide by clicking hide chip
// path is covered elsewhere; here just verify state survived: toggle switch
// still checked.
const rsiSwitchState = await page.$eval(sel('toggle-rsi'), (el) => el.getAttribute('data-state'));
check(rsiSwitchState === 'checked', 'hide: RSI stays enabled while hidden');

// Close the ADX pane via ✕ → registry entry off, pane gone.
await click('sub-indicator-adx-close');
await settle();
check((await subPaneCount('adx')) === 0, 'close: adx pane removed');
const adxSwitchState = await page.$eval(sel('toggle-adx'), (el) => el.getAttribute('data-state'));
check(adxSwitchState === 'unchecked', 'close: ADX toggle reads off after pane ✕');

log('console errors:', errs.slice(0, 6));
log(PASS ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌');
await browser.close();
process.exit(PASS ? 0 : 1);
