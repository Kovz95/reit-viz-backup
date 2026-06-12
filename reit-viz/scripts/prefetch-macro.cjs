/**
 * Pre-fetch all FRED macro series and write as static JSON files
 * for the static deployment (no backend).
 * 
 * Usage: node scripts/prefetch-macro.cjs
 * Output: dist/public/data/macro/{series_id}.json + catalog.json + computed.json
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "dist", "public", "data", "macro");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── All FRED series (mirrored from routes.ts) ──
const FRED_SERIES = {
  DGS2:   { id: "DGS2",   label: "2-Year Treasury Yield",  category: "Rates",   unit: "%",    freq: "D" },
  DGS5:   { id: "DGS5",   label: "5-Year Treasury Yield",  category: "Rates",   unit: "%",    freq: "D" },
  DGS10:  { id: "DGS10",  label: "10-Year Treasury Yield", category: "Rates",   unit: "%",    freq: "D" },
  DGS30:  { id: "DGS30",  label: "30-Year Treasury Yield", category: "Rates",   unit: "%",    freq: "D" },
  DFEDTARU: { id: "DFEDTARU", label: "Fed Funds Upper Bound", category: "Rates", unit: "%",  freq: "D" },
  SOFR:   { id: "SOFR",   label: "SOFR Rate",              category: "Rates",   unit: "%",    freq: "D" },
  DFII10: { id: "DFII10", label: "10Y TIPS (Real Yield)",   category: "Rates",   unit: "%",    freq: "D" },
  T10YIE: { id: "T10YIE", label: "10Y Breakeven Inflation", category: "Rates",   unit: "%",    freq: "D" },
  HOUST:    { id: "HOUST",    label: "Housing Starts (Total)",           category: "Housing",  unit: "K",  freq: "M" },
  HOUST5F:  { id: "HOUST5F",  label: "Housing Starts (5+ Units)",       category: "Housing",  unit: "K",  freq: "M" },
  HOUST1F:  { id: "HOUST1F",  label: "Housing Starts (Single-Family)",  category: "Housing",  unit: "K",  freq: "M" },
  PERMIT:   { id: "PERMIT",   label: "Building Permits (Total)",         category: "Housing",  unit: "K",  freq: "M" },
  PERMIT5:  { id: "PERMIT5",  label: "Building Permits (5+ Units)",     category: "Housing",  unit: "K",  freq: "M" },
  PERMIT1:  { id: "PERMIT1",  label: "Building Permits (Single-Family)",category: "Housing",  unit: "K",  freq: "M" },
  UNDCONTSA: { id: "UNDCONTSA", label: "Under Construction (Total)",    category: "Housing",  unit: "K",  freq: "M" },
  COMPU:    { id: "COMPU",    label: "Housing Completions (Total)",      category: "Housing",  unit: "K",  freq: "M" },
  COMPUTSA: { id: "COMPUTSA", label: "Completions (Single-Family)",      category: "Housing",  unit: "K",  freq: "M" },
  UNRATE:   { id: "UNRATE",   label: "Unemployment Rate",     category: "Labor",    unit: "%",   freq: "M" },
  PAYEMS:   { id: "PAYEMS",   label: "Total Nonfarm Payrolls", category: "Labor",   unit: "K",   freq: "M" },
  ICSA:     { id: "ICSA",     label: "Initial Jobless Claims", category: "Labor",   unit: "K",   freq: "W" },
  CPIAUCSL: { id: "CPIAUCSL", label: "CPI (All Urban)",        category: "Inflation", unit: "Idx", freq: "M" },
  CPILFESL: { id: "CPILFESL", label: "Core CPI (ex Food/Energy)", category: "Inflation", unit: "Idx", freq: "M" },
  PCEPI:    { id: "PCEPI",    label: "PCE Price Index",         category: "Inflation", unit: "Idx", freq: "M" },
  PCEPILFE: { id: "PCEPILFE", label: "Core PCE (ex Food/Energy)", category: "Inflation", unit: "Idx", freq: "M" },
  GDP:      { id: "GDP",      label: "GDP (Nominal)",           category: "Economy",  unit: "$B",  freq: "Q" },
  GDPC1:    { id: "GDPC1",    label: "Real GDP",                category: "Economy",  unit: "$B",  freq: "Q" },
  RSAFS:    { id: "RSAFS",    label: "Retail Sales",            category: "Economy",  unit: "$M",  freq: "M" },
  MORTGAGE30US: { id: "MORTGAGE30US", label: "30-Year Mortgage Rate", category: "Rates", unit: "%", freq: "W" },
  DCOILWTICO:   { id: "DCOILWTICO",   label: "WTI Crude Oil",        category: "Commodities", unit: "$/bbl", freq: "D" },
  VIXCLS:       { id: "VIXCLS",       label: "VIX",                  category: "Markets", unit: "Idx", freq: "D" },
  CSUSHPISA: { id: "CSUSHPISA", label: "CS National HPI",    category: "Home Prices", unit: "Idx", freq: "M" },
  SPCS20RSA: { id: "SPCS20RSA", label: "CS 20-City Composite", category: "Home Prices", unit: "Idx", freq: "M" },
  PHXRSA:    { id: "PHXRSA",    label: "CS Phoenix",          category: "Home Prices", unit: "Idx", freq: "M" },
  DAXRSA:    { id: "DAXRSA",    label: "CS Dallas",           category: "Home Prices", unit: "Idx", freq: "M" },
  ATXRSA:    { id: "ATXRSA",    label: "CS Atlanta",          category: "Home Prices", unit: "Idx", freq: "M" },
  MIXRSA:    { id: "MIXRSA",    label: "CS Miami",            category: "Home Prices", unit: "Idx", freq: "M" },
  LVXRSA:    { id: "LVXRSA",    label: "CS Las Vegas",        category: "Home Prices", unit: "Idx", freq: "M" },
  TPXRSA:    { id: "TPXRSA",    label: "CS Tampa",            category: "Home Prices", unit: "Idx", freq: "M" },
  SFXRSA:    { id: "SFXRSA",    label: "CS San Francisco",    category: "Home Prices", unit: "Idx", freq: "M" },
  LXXRSA:    { id: "LXXRSA",    label: "CS Los Angeles",      category: "Home Prices", unit: "Idx", freq: "M" },
  BOXRSA:    { id: "BOXRSA",    label: "CS Boston",           category: "Home Prices", unit: "Idx", freq: "M" },
  SEXRSA:    { id: "SEXRSA",    label: "CS Seattle",          category: "Home Prices", unit: "Idx", freq: "M" },
  CHXRSA:    { id: "CHXRSA",    label: "CS Chicago",          category: "Home Prices", unit: "Idx", freq: "M" },
  DNXRSA:    { id: "DNXRSA",    label: "CS Denver",           category: "Home Prices", unit: "Idx", freq: "M" },
  NYXRSA:    { id: "NYXRSA",    label: "CS New York",         category: "Home Prices", unit: "Idx", freq: "M" },
  PHOE004BPPRIVSA: { id: "PHOE004BPPRIVSA", label: "Permits: Phoenix",    category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  DALL148BPPRIVSA: { id: "DALL148BPPRIVSA", label: "Permits: Dallas",     category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  ATLA013BPPRIVSA: { id: "ATLA013BPPRIVSA", label: "Permits: Atlanta",    category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  HOUS448BPPRIVSA: { id: "HOUS448BPPRIVSA", label: "Permits: Houston",    category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  AUST448BPPRIVSA: { id: "AUST448BPPRIVSA", label: "Permits: Austin",     category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  DENV708BPPRIVSA: { id: "DENV708BPPRIVSA", label: "Permits: Denver",     category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  TAMP312BPPRIVSA: { id: "TAMP312BPPRIVSA", label: "Permits: Tampa",      category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  MIAM112BPPRIVSA: { id: "MIAM112BPPRIVSA", label: "Permits: Miami",      category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  LASV832BPPRIVSA: { id: "LASV832BPPRIVSA", label: "Permits: Las Vegas",  category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  NASH947BPPRIVSA: { id: "NASH947BPPRIVSA", label: "Permits: Nashville",  category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  CHAR737BPPRIVSA: { id: "CHAR737BPPRIVSA", label: "Permits: Charlotte",  category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  ORLA712BPPRIVSA: { id: "ORLA712BPPRIVSA", label: "Permits: Orlando",    category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  RALE537BPPRIVSA: { id: "RALE537BPPRIVSA", label: "Permits: Raleigh",    category: "Regional Permits (Sunbelt)", unit: "Units", freq: "M" },
  NEWY636BPPRIVSA: { id: "NEWY636BPPRIVSA", label: "Permits: New York",       category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
  LOSA106BPPRIVSA: { id: "LOSA106BPPRIVSA", label: "Permits: Los Angeles",    category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
  SANF806BPPRIVSA: { id: "SANF806BPPRIVSA", label: "Permits: San Francisco",  category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
  BOST625BPPRIVSA: { id: "BOST625BPPRIVSA", label: "Permits: Boston",         category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
  SEAT653BPPRIVSA: { id: "SEAT653BPPRIVSA", label: "Permits: Seattle",        category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
  CHIC917BPPRIVSA: { id: "CHIC917BPPRIVSA", label: "Permits: Chicago",        category: "Regional Permits (Coastal)", unit: "Units", freq: "M" },
  PHOE004URN: { id: "PHOE004URN", label: "Unemp: Phoenix",    category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  DALL148URN: { id: "DALL148URN", label: "Unemp: Dallas",     category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  ATLA013URN: { id: "ATLA013URN", label: "Unemp: Atlanta",    category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  HOUS448URN: { id: "HOUS448URN", label: "Unemp: Houston",    category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  AUST448URN: { id: "AUST448URN", label: "Unemp: Austin",     category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  DENV708URN: { id: "DENV708URN", label: "Unemp: Denver",     category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  TAMP312URN: { id: "TAMP312URN", label: "Unemp: Tampa",      category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  MIAM112URN: { id: "MIAM112URN", label: "Unemp: Miami",      category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  LASV832URN: { id: "LASV832URN", label: "Unemp: Las Vegas",  category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  NASH947URN: { id: "NASH947URN", label: "Unemp: Nashville",  category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  CHAR737URN: { id: "CHAR737URN", label: "Unemp: Charlotte",  category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  ORLA712URN: { id: "ORLA712URN", label: "Unemp: Orlando",    category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  RALE537URN: { id: "RALE537URN", label: "Unemp: Raleigh",    category: "Regional Labor (Sunbelt)", unit: "%", freq: "M" },
  NEWY636URN: { id: "NEWY636URN", label: "Unemp: New York",       category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
  LOSA106URN: { id: "LOSA106URN", label: "Unemp: Los Angeles",    category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
  SANF806URN: { id: "SANF806URN", label: "Unemp: San Francisco",  category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
  BOST625URN: { id: "BOST625URN", label: "Unemp: Boston",         category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
  SEAT653URN: { id: "SEAT653URN", label: "Unemp: Seattle",        category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
  CHIC917URN: { id: "CHIC917URN", label: "Unemp: Chicago",        category: "Regional Labor (Coastal)", unit: "%", freq: "M" },
  PHOE004NA: { id: "PHOE004NA", label: "Payrolls: Phoenix",    category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
  DALL148NA: { id: "DALL148NA", label: "Payrolls: Dallas",     category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
  ATLA013NA: { id: "ATLA013NA", label: "Payrolls: Atlanta",    category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
  HOUS448NA: { id: "HOUS448NA", label: "Payrolls: Houston",    category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
  AUST448NA: { id: "AUST448NA", label: "Payrolls: Austin",     category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
  DENV708NA: { id: "DENV708NA", label: "Payrolls: Denver",     category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
  TAMP312NA: { id: "TAMP312NA", label: "Payrolls: Tampa",      category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
  MIAM112NA: { id: "MIAM112NA", label: "Payrolls: Miami",      category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
  LASV832NA: { id: "LASV832NA", label: "Payrolls: Las Vegas",  category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
  NASH947NA: { id: "NASH947NA", label: "Payrolls: Nashville",  category: "Regional Employment (Sunbelt)", unit: "K", freq: "M" },
  NEWY636NA: { id: "NEWY636NA", label: "Payrolls: New York",       category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
  LOSA106NA: { id: "LOSA106NA", label: "Payrolls: Los Angeles",    category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
  SANF806NA: { id: "SANF806NA", label: "Payrolls: San Francisco",  category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
  BOST625NA: { id: "BOST625NA", label: "Payrolls: Boston",         category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
  SEAT653NA: { id: "SEAT653NA", label: "Payrolls: Seattle",        category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
  CHIC917NA: { id: "CHIC917NA", label: "Payrolls: Chicago",        category: "Regional Employment (Coastal)", unit: "K", freq: "M" },
  MEDLISPRI38060: { id: "MEDLISPRI38060", label: "Med. List: Phoenix",  category: "Regional Listing Prices", unit: "$", freq: "M" },
  MEDLISPRI19100: { id: "MEDLISPRI19100", label: "Med. List: Dallas",   category: "Regional Listing Prices", unit: "$", freq: "M" },
  MEDLISPRI12060: { id: "MEDLISPRI12060", label: "Med. List: Atlanta",  category: "Regional Listing Prices", unit: "$", freq: "M" },
  MEDLISPRI26420: { id: "MEDLISPRI26420", label: "Med. List: Houston",  category: "Regional Listing Prices", unit: "$", freq: "M" },
  MEDLISPRI12420: { id: "MEDLISPRI12420", label: "Med. List: Austin",   category: "Regional Listing Prices", unit: "$", freq: "M" },
  MEDLISPRI19740: { id: "MEDLISPRI19740", label: "Med. List: Denver",   category: "Regional Listing Prices", unit: "$", freq: "M" },
  MEDLISPRI45300: { id: "MEDLISPRI45300", label: "Med. List: Tampa",    category: "Regional Listing Prices", unit: "$", freq: "M" },
  MEDLISPRI33100: { id: "MEDLISPRI33100", label: "Med. List: Miami",    category: "Regional Listing Prices", unit: "$", freq: "M" },
  MEDLISPRI29820: { id: "MEDLISPRI29820", label: "Med. List: Las Vegas", category: "Regional Listing Prices", unit: "$", freq: "M" },
  MEDLISPRI34980: { id: "MEDLISPRI34980", label: "Med. List: Nashville", category: "Regional Listing Prices", unit: "$", freq: "M" },
};

const COMPUTED_SERIES = {
  "SPREAD_10Y_2Y":  { label: "10Y-2Y Spread",  category: "Rates", unit: "bps", seriesA: "DGS10", seriesB: "DGS2",  op: "subtract" },
  "SPREAD_5Y_2Y":   { label: "5Y-2Y Spread",   category: "Rates", unit: "bps", seriesA: "DGS5",  seriesB: "DGS2",  op: "subtract" },
  "SPREAD_10Y_5Y":  { label: "10Y-5Y Spread",  category: "Rates", unit: "bps", seriesA: "DGS10", seriesB: "DGS5",  op: "subtract" },
  "SPREAD_30Y_10Y": { label: "30Y-10Y Spread", category: "Rates", unit: "bps", seriesA: "DGS30", seriesB: "DGS10", op: "subtract" },
};

function fetchFredCSV(seriesId) {
  // Uses the official FRED API at api.stlouisfed.org via the custom-cred proxy,
  // which auto-injects the api_key query param. The public fredgraph.csv endpoint
  // is permanently blocked by Akamai from this sandbox and from Vultr.
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&observation_start=2010-01-01&file_type=json`;
  const body = execSync(`curl -sL --max-time 30 "${url}"`, { encoding: "utf-8", timeout: 35000 });
  let parsed;
  try { parsed = JSON.parse(body); } catch { return []; }
  const observations = parsed && parsed.observations;
  if (!Array.isArray(observations)) return [];
  const data = [];
  for (const obs of observations) {
    if (!obs || !obs.date || obs.value === "." || obs.value == null || obs.value === "") continue;
    const num = parseFloat(obs.value);
    if (!isFinite(num)) continue;
    data.push({ time: obs.date.trim(), value: num });
  }
  return data;
}

function computeSpread(dataA, dataB) {
  const mapB = new Map(dataB.map(d => [d.time, d.value]));
  return dataA
    .filter(d => mapB.has(d.time))
    .map(d => ({ time: d.time, value: +(d.value - mapB.get(d.time)).toFixed(4) }));
}

async function main() {
  const ids = Object.keys(FRED_SERIES);
  console.log(`Fetching ${ids.length} FRED series...`);

  let success = 0, failed = 0;
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    for (const id of batch) {
      try {
        const data = fetchFredCSV(id);
        fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(data));
        console.log(`  ✓ ${id}: ${data.length} points`);
        success++;
      } catch (e) {
        console.error(`  ✗ ${id}: ${e.message}`);
        // Write empty array so frontend doesn't 404
        fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), "[]");
        failed++;
      }
    }
    // Small delay between batches
    if (i + BATCH_SIZE < ids.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Compute spreads
  for (const [id, spec] of Object.entries(COMPUTED_SERIES)) {
    try {
      const rawA = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${spec.seriesA}.json`), "utf-8"));
      const rawB = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${spec.seriesB}.json`), "utf-8"));
      const spread = computeSpread(rawA, rawB);
      fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(spread));
      console.log(`  ✓ ${id} (computed): ${spread.length} points`);
      success++;
    } catch (e) {
      console.error(`  ✗ ${id} (computed): ${e.message}`);
      fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), "[]");
      failed++;
    }
  }

  // Write catalog.json (same shape as /api/macro/catalog response)
  const catalog = [];
  const now = new Date().toISOString();
  for (const [id, meta] of Object.entries(FRED_SERIES)) {
    catalog.push({ id, ...meta, cached: true, lastUpdate: now });
  }
  for (const [id, meta] of Object.entries(COMPUTED_SERIES)) {
    catalog.push({ id, ...meta, computed: true, cached: true, lastUpdate: null });
  }
  fs.writeFileSync(path.join(OUT_DIR, "catalog.json"), JSON.stringify(catalog));

  // Write computed-spec.json so frontend can compute spreads from raw data
  fs.writeFileSync(path.join(OUT_DIR, "computed-spec.json"), JSON.stringify(COMPUTED_SERIES));

  console.log(`\nDone: ${success} succeeded, ${failed} failed`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
