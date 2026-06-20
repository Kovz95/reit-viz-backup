#!/usr/bin/env node
// Resync local per-ticker price data from the live Vultr backend.
//
// WHY: local dev containers ship without the per-ticker price files
// (/app/data/tickers/<SYM>.json), so charts 404 and the Dashboard renders
// blank. Those files live only on the provisioned Vultr server. This script
// pulls them over Vultr's HTTP API and loads them into the local container's
// data volume so local matches production.
//
// HOW: /api/ticker/:symbol returns DECODED arrays, but the server stores files
// run-length-encoded ({metric: [...numbers, "~N" for a run of N nulls]}). We
// re-encode on the way in, which round-trips losslessly (the server decodes on
// read — verified sha256-identical to Vultr). Also syncs the shared dates.json.
//
// USAGE (from repo root or anywhere):
//   node reit-viz/scripts/pull-vultr-data.mjs           # pull all + load into container
//   node reit-viz/scripts/pull-vultr-data.mjs --no-load # stage only, skip docker cp
//
// ENV overrides:
//   VULTR_BASE  live backend base URL   (default http://45.63.20.126:3000)
//   CONTAINER   target docker container (default reit-viz)
//   DATA_DIR    data dir inside container (default /app/data)
//   OUT_DIR     host staging dir        (default <os.tmpdir>/vultr-pull)
//   LIMIT       cap number of tickers (for testing)
//   CONC        concurrent fetches      (default 8)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const BASE = process.env.VULTR_BASE || "http://45.63.20.126:3000";
const CONTAINER = process.env.CONTAINER || "reit-viz";
const DATA_DIR = process.env.DATA_DIR || "/app/data";
const OUT = process.env.OUT_DIR || path.join(os.tmpdir(), "vultr-pull");
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : Infinity;
const CONC = process.env.CONC ? parseInt(process.env.CONC) : 8;
const LOAD = !process.argv.includes("--no-load");

const TICKDIR = path.join(OUT, "tickers");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(TICKDIR, { recursive: true });

// Inverse of the server's decode: collapse runs of null into "~N".
function encode(arr) {
  const out = [];
  let nulls = 0;
  for (const v of arr) {
    if (v === null) { nulls++; continue; }
    if (nulls > 0) { out.push("~" + nulls); nulls = 0; }
    out.push(v);
  }
  if (nulls > 0) out.push("~" + nulls);
  return out;
}

async function getJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

const list = await getJSON(`${BASE}/api/tickers`);
const tickers = (Array.isArray(list) ? list : list.tickers || list.data || [])
  .map(t => (typeof t === "string" ? t : t.ticker))
  .filter(Boolean)
  .slice(0, LIMIT);
console.log(`Pulling ${tickers.length} tickers from ${BASE} ...`);

let datesWritten = false;
let ok = 0, fail = 0;
const failures = [];

async function pull(sym) {
  try {
    const j = await getJSON(`${BASE}/api/ticker/${encodeURIComponent(sym)}`);
    const file = {};
    for (const [m, arr] of Object.entries(j.metrics || {})) file[m] = encode(arr);
    fs.writeFileSync(path.join(TICKDIR, `${sym}.json`), JSON.stringify(file));
    if (!datesWritten && Array.isArray(j.dates) && j.dates.length) {
      fs.writeFileSync(path.join(OUT, "dates.json"), JSON.stringify(j.dates));
      datesWritten = true;
      console.log(`  dates.json synced (${j.dates.length} dates)`);
    }
    ok++;
  } catch (e) {
    fail++; failures.push(`${sym}: ${e.message}`);
  }
}

let i = 0;
async function worker() { while (i < tickers.length) await pull(tickers[i++]); }
await Promise.all(Array.from({ length: CONC }, worker));

console.log(`Pulled: ok=${ok} fail=${fail} -> ${TICKDIR}`);
if (failures.length) { console.log("FAILURES:"); failures.slice(0, 20).forEach(f => console.log("  " + f)); }
if (!ok) { console.error("Nothing pulled; aborting."); process.exit(1); }

if (!LOAD) {
  console.log(`--no-load: staged only. Load manually with:\n  docker cp "${TICKDIR}/." ${CONTAINER}:${DATA_DIR}/tickers/`);
  process.exit(0);
}

console.log(`Loading into container '${CONTAINER}:${DATA_DIR}' ...`);
try {
  execFileSync("docker", ["cp", `${TICKDIR}/.`, `${CONTAINER}:${DATA_DIR}/tickers/`], { stdio: "inherit" });
  if (datesWritten) execFileSync("docker", ["cp", path.join(OUT, "dates.json"), `${CONTAINER}:${DATA_DIR}/dates.json`], { stdio: "inherit" });
  const count = execFileSync("docker", ["exec", CONTAINER, "sh", "-c", `ls ${DATA_DIR}/tickers | wc -l`]).toString().trim();
  console.log(`Done. Container now has ${count} ticker files. (No restart needed — files are read per-request.)`);
} catch (e) {
  console.error(`docker load failed: ${e.message}`);
  console.error(`Files are staged at ${TICKDIR} — load manually with docker cp, or pass --no-load.`);
  process.exit(1);
}
