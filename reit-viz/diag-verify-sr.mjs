import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'C:\\Users\\NickK\\Projects\\Stock-market-viz-app\\reit-viz\\diag-shots';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + (e.message || String(e))));
await page.goto('http://localhost:5001/#/support-resistance', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
const info = await page.evaluate(() => ({
  heading: document.querySelector('h1,h2,h3')?.innerText || '',
  is404: !!(document.body.innerText.match(/404|forget to add the page/i)),
  runBtn: !!document.querySelector('[data-testid="sr-run"]'),
  modeBtns: [...document.querySelectorAll('[data-testid^="sr-mode-"]')].map(b => b.getAttribute('data-testid')),
  maTypeBtns: document.querySelectorAll('[data-testid^="sr-ma-type-"]').length,
  buttons: document.querySelectorAll('button').length,
  inputs: document.querySelectorAll('input,select,textarea').length,
}));
await page.screenshot({ path: `${OUT}\\5001_support-resistance_FIXED.png` });
await page.close();
await browser.close();
const benign = /\/api\/(ticker|data|workbook|global)|favicon|fonts\.g|Failed to load resource/i;
const realErrors = errors.filter(e => !benign.test(e));
console.log('heading:', JSON.stringify(info.heading));
console.log('is404:', info.is404);
console.log('Run Detection button present:', info.runBtn);
console.log('mode buttons:', JSON.stringify(info.modeBtns));
console.log('MA type buttons:', info.maTypeBtns);
console.log('total buttons/inputs:', info.buttons + '/' + info.inputs);
console.log('real console errors:', realErrors.length, JSON.stringify(realErrors.slice(0,4)));
console.log('VERDICT:', (!info.is404 && info.runBtn && info.heading.includes('Support / Resistance')) ? 'PASS' : 'FAIL');
