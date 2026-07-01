#!/usr/bin/env node
// Generate the static global-universe.json the client serves at /data/global-universe.json
// (globalUniverse.ts tries this static file first, then falls back to /api/global-universe).
//
// Source: scripts/GLOBAL-UNIVERSE.xlsx (FactSet Universal Screen export). The sheet's
// real column headers live in the first data row, so we read raw and map by position.
//
// Usage: node scripts/build-global-universe.cjs

const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

const SRC = path.join(__dirname, "GLOBAL-UNIVERSE.xlsx");
const OUT = path.join(__dirname, "..", "client", "public", "data", "global-universe.json");

// xlsx column key (after sheet_to_json) -> output field. Numeric fields are coerced.
const COLS = {
  "FactSet Universal Screen": { key: "ticker" },
  __EMPTY: { key: "name" },
  __EMPTY_1: { key: "fdsTicker" },
  __EMPTY_3: { key: "exchange" },
  __EMPTY_4: { key: "nation" },
  __EMPTY_5: { key: "price", num: true },
  __EMPTY_6: { key: "marketCapMM", num: true },
  __EMPTY_7: { key: "salesMM", num: true },
  __EMPTY_9: { key: "adv", num: true },
  __EMPTY_10: { key: "dollarVolMM", num: true },
  __EMPTY_11: { key: "economy" },
  __EMPTY_12: { key: "sector" },
  __EMPTY_13: { key: "subsector" },
  __EMPTY_14: { key: "industryGroup" },
  __EMPTY_15: { key: "industry" },
  __EMPTY_16: { key: "subindustry" },
  __EMPTY_18: { key: "peFy2", num: true },
};

// Names that belong in the served universe but aren't in the FactSet export
// (e.g. small/newer listings a workbook references). Appended after the xlsx
// rows so a fresh FactSet re-export never drops them. Keyed for the geo/ADV
// join by `fdsTicker` (see globalUniverse.ts). Financials left null — we only
// carry the metadata needed for nation/exchange/classification, not fabricated
// price/liquidity figures.
const MANUAL_ADDITIONS = [
  {
    ticker: "LABS-GB",
    name: "Life Science REIT plc",
    fdsTicker: "LABS-GB",
    exchange: "LONDON",
    nation: "UNITED KINGDOM",
    price: null,
    marketCapMM: null,
    salesMM: null,
    adv: null,
    dollarVolMM: null,
    economy: "Finance",
    sector: "Real Estate",
    subsector: "Real Estate Investment Trusts (REITs)",
    industryGroup: "Equity REITs",
    industry: "Equity REITs",
    subindustry: "Healthcare and Life Sciences Equity REITs",
    peFy2: null,
  },
];

function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const wb = XLSX.readFile(SRC);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

const records = [];
for (const row of rows) {
  const sym = row["FactSet Universal Screen"];
  // Skip the header row ("Symbol") and any blank/labelless rows.
  if (!sym || sym === "Symbol" || typeof sym !== "string") continue;
  const rec = {};
  for (const [col, def] of Object.entries(COLS)) {
    const raw = row[col];
    rec[def.key] = def.num ? toNum(raw) : raw == null ? "" : raw;
  }
  records.push(rec);
}

// Append manual additions, skipping any FactSet already provides (match on
// fdsTicker, else ticker) so a future export of the name wins over the stub.
const present = new Set(
  records.flatMap((r) => [r.fdsTicker, r.ticker].filter(Boolean).map((s) => String(s).toUpperCase())),
);
let added = 0;
for (const rec of MANUAL_ADDITIONS) {
  const key = String(rec.fdsTicker || rec.ticker).toUpperCase();
  if (present.has(key)) continue;
  records.push(rec);
  present.add(key);
  added++;
}

const out = {
  schemaVersion: 1,
  builtAt: new Date().toISOString(),
  count: records.length,
  sourceFile: "GLOBAL-UNIVERSE.xlsx",
  records,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`Wrote ${records.length} records (${added} manual addition${added === 1 ? "" : "s"}) -> ${path.relative(path.join(__dirname, ".."), OUT)}`);
