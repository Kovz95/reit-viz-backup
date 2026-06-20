// Headless page-by-page comparison of editable (5001) vs bundle (5000).
// Uses globally-installed puppeteer-core driving the installed Chrome.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'C:\\Users\\NickK\\Projects\\Stock-market-viz-app\\reit-viz\\diag-shots';
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  '/', '/universe', '/global-universe', '/baskets', '/ranking', '/scatter',
  '/factor-backtest', '/relative-strength', '/pairs', '/pair-ratios', '/pair-screener',
  '/scanner', '/macro', '/regime', '/rates-forward', '/yield-correlation', '/correlation',
  '/valuation', '/val-regime', '/premium-discount', '/pd-screener', '/distributions',
  '/spread', '/heatmap', '/performance', '/short-interest', '/screener', '/ratings',
  '/setups-screener', '/pattern-screener', '/z-optimizer', '/pair-optimizer', '/momentum',
  '/ma-crossover', '/rsi-regime', '/combo-optimizer', '/roc-optimizer', '/oscillators',
  '/range-optimizer', '/harsi-optimizer', '/slow-stoch-optimizer', '/dual-ma-optimizer',
  '/tva-optimizer', '/levels', '/trendlines', '/auto-trendline-backtest', '/price-action',
  '/roc-analysis', '/sigma-move', '/attribution', '/similar-setups', '/alerts', '/data',
  '/support-resistance',
];

const PORTS = { editable: 5001, bundle: 5000 };

async function probe(browser, port, route) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + (e.message || String(e))));
  let nav = 'ok';
  try {
    await page.goto(`http://localhost:${port}/#${route}`, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) { nav = 'NAV_FAIL: ' + e.message; }
  // give the SPA a moment to mount lazy chunks
  await new Promise(r => setTimeout(r, 1200));
  const info = await page.evaluate(() => {
    const root = document.getElementById('root');
    const text = (root?.innerText || '').trim();
    return {
      rootChildren: root ? root.children.length : -1,
      textLen: text.length,
      // count interactive controls as a structural fingerprint
      buttons: document.querySelectorAll('button').length,
      inputs: document.querySelectorAll('input,select,textarea').length,
      canvases: document.querySelectorAll('canvas').length,
      tables: document.querySelectorAll('table').length,
      headingSample: (document.querySelector('h1,h2,h3')?.innerText || '').slice(0, 60),
    };
  });
  const safe = route.replace(/[\/]/g, '_') || '_root';
  const shot = `${OUT}\\${port}${safe}.png`;
  await page.screenshot({ path: shot });
  await page.close();
  // filter benign data-absence noise (404 ticker/data fetches happen on BOTH builds)
  const benign = /\/api\/(ticker|data|workbook|global)|favicon|fonts\.g|Failed to load resource/i;
  const realErrors = errors.filter(e => !benign.test(e));
  return { nav, ...info, errCount: errors.length, realErrCount: realErrors.length, realErrors: realErrors.slice(0, 4) };
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const rows = [];
for (const route of ROUTES) {
  const e = await probe(browser, PORTS.editable, route);
  const b = await probe(browser, PORTS.bundle, route);
  // divergence heuristics
  const flags = [];
  const eBlank = e.rootChildren <= 0 && e.textLen < 5;
  const bBlank = b.rootChildren <= 0 && b.textLen < 5;
  if (eBlank && !bBlank) flags.push('EDITABLE_BLANK');
  if (bBlank && !eBlank) flags.push('BUNDLE_BLANK');
  if (e.nav.startsWith('NAV')) flags.push('EDIT_NAV');
  if (b.nav.startsWith('NAV')) flags.push('BUNDLE_NAV');
  if (e.realErrCount > 0 && b.realErrCount === 0) flags.push('EDIT_ERRORS');
  if (b.realErrCount > 0 && e.realErrCount === 0) flags.push('BUNDLE_ERRORS');
  // big structural divergence in controls
  const ctlE = e.buttons + e.inputs, ctlB = b.buttons + b.inputs;
  if (Math.abs(ctlE - ctlB) > Math.max(8, 0.5 * Math.max(ctlE, ctlB))) flags.push('CTRL_DIFF');
  rows.push({ route, e, b, flags });
  console.log(`${route.padEnd(26)} edit[btn${e.buttons} in${e.inputs} cv${e.canvas||e.canvases} tx${e.textLen} err${e.realErrCount}] bun[btn${b.buttons} in${b.inputs} cv${b.canvases} tx${b.textLen} err${b.realErrCount}] ${flags.join(',')}`);
}
await browser.close();
writeFileSync(`${OUT}\\report.json`, JSON.stringify(rows, null, 2));
const diverged = rows.filter(r => r.flags.length);
console.log('\n===== SUMMARY =====');
console.log(`routes checked: ${rows.length}`);
console.log(`flagged: ${diverged.length}`);
for (const r of diverged) console.log(`  ${r.route}: ${r.flags.join(', ')}`);
console.log('shots + report.json in', OUT);
