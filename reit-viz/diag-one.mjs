import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

async function look(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const failed = [];
  page.on('requestfailed', r => failed.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
  page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  const info = await page.evaluate(() => ({
    loc: location.pathname,
    title: document.title,
    headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 6).map(h => h.innerText),
    sample: (document.getElementById('root')?.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
    activeNav: [...document.querySelectorAll('[aria-current],[data-active="true"],a[class*="active"]')].slice(0,4).map(a=>a.innerText||a.getAttribute('href')),
  }));
  console.log('URL:', url);
  console.log('  location.pathname:', info.loc);
  console.log('  title:', info.title);
  console.log('  headings:', JSON.stringify(info.headings));
  console.log('  activeNav:', JSON.stringify(info.activeNav));
  console.log('  sample:', info.sample);
  console.log('  failed reqs (' + failed.length + '):', failed.slice(0, 8).join(' | '));
  console.log('');
  await page.close();
}

await look('http://localhost:5001/#/');
await look('http://localhost:5001/#/screener');
await look('http://localhost:5001/#/macro');
await browser.close();
