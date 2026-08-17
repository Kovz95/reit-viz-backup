/**
 * Local roundtrip test for the historical-fundamentals ingest:
 *   build synthetic xlsx → parse → report-date stamp → merge → assert → wipe → assert clean.
 *
 * Runs against a TEMP COPY of the local data/ dir (dates.json / events.json /
 * tickers.json are real; ticker price files are synthesized), so nothing real
 * is touched. Run from reit-viz/:  npx tsx scripts/test-fundamentals.ts
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { ingestFundamentalsWorkbook, wipeFundamentals } from "../server/fundamentals";
import { rleDecode, rleEncode } from "../server/realign";

const ROOT = process.cwd();
const REAL_DATA = path.join(ROOT, "data");
const TMP = path.join(ROOT, "uploads", "__fund_test__");
const TMP_DATA = path.join(TMP, "data");

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

// ── Set up temp data dir ──
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(path.join(TMP_DATA, "tickers"), { recursive: true });
for (const f of ["dates.json", "events.json", "tickers.json"]) {
  fs.copyFileSync(path.join(REAL_DATA, f), path.join(TMP_DATA, f));
}
const dates: string[] = JSON.parse(fs.readFileSync(path.join(TMP_DATA, "dates.json"), "utf-8"));
const events: Record<string, { earnings?: string[] }> = JSON.parse(fs.readFileSync(path.join(TMP_DATA, "events.json"), "utf-8"));
const tickersMeta: any[] = JSON.parse(fs.readFileSync(path.join(TMP_DATA, "tickers.json"), "utf-8"));

// Pick two real tickers that have earnings dates covering 2024
const candidates = tickersMeta
  .map((t) => t.ticker)
  .filter((t: string) => (events[t]?.earnings ?? []).some((d) => d >= "2024-04-01" && d <= "2024-12-31"));
if (candidates.length < 2) {
  console.error("Need two tickers with 2024 earnings dates in local events.json — found:", candidates.length);
  process.exit(1);
}
const [T1, T2] = candidates;
console.log(`Using tickers: ${T1}, ${T2}`);

// Synthesize price files (a close series so the ticker file exists)
for (const t of [T1, T2]) {
  const dense = dates.map((_, i) => (i % 3 === 0 ? 100 + (i % 50) : null));
  fs.writeFileSync(path.join(TMP_DATA, "tickers", `${t}.json`), JSON.stringify({ close: rleEncode(dense) }));
}

// ── Build synthetic workbook ──
// Sheet 1 (T1, "-US" suffix): text period labels in mixed formats, incl. H and FY,
// a value with commas, a parenthesized negative, and a blank.
const wsData1 = [
  ["Metric", "2023Q4", "Q1 2024", "2Q24", "1H24", "FY2023", "2035Q1"],
  ["FFO/sh", 1.01, "1.11", 1.21, 2.32, 4.04, 9.99],
  ["Revenue", "1,234", 1300, "(150)", 2534, "5,000", ""],
  ["Period", "x", "x", "x", "x", "x", "x"], // meta row — must be skipped
];
// Sheet 2 (T2): literal date headers (quarter-end dates) → cadence inferred as Q
const wsData2 = [
  ["Metric", "2023-12-31", "2024-03-31", "2024-06-30"],
  ["NOI", 10, 11, 12],
];
// Sheet 3: unknown ticker
const wsData3 = [
  ["Metric", "2024Q1"],
  ["FFO/sh", 5],
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData1), `${T1}-US`);
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData2), T2);
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData3), "ZZFAKE");
const wbPath = path.join(TMP, "test-fundamentals.xlsx");
fs.writeFileSync(wbPath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

// ── Ingest ──
console.log("\nIngesting…");
const stats = ingestFundamentalsWorkbook(wbPath, TMP_DATA, "test-fundamentals.xlsx", fs.statSync(wbPath).size);
console.log(JSON.stringify(stats, null, 2));

check("2 tickers updated", stats.tickersUpdated === 2, `got ${stats.tickersUpdated}`);
check("unknown ticker reported", stats.unknownTickers.includes("ZZFAKE"), JSON.stringify(stats.unknownTickers));
check("future period skipped", stats.skippedFuture >= 1, `got ${stats.skippedFuture}`);

// ── Assert stamping on T1 ──
const t1Data = JSON.parse(fs.readFileSync(path.join(TMP_DATA, "tickers", `${T1}.json`), "utf-8"));
const keys = Object.keys(t1Data);
check("Q key exists", keys.includes("Fund: FFO/sh (Q)"), keys.join(", "));
check("Q PE key exists", keys.includes("Fund: FFO/sh (Q PE)"));
check("H key exists", keys.includes("Fund: FFO/sh (H)"));
check("FY key exists", keys.includes("Fund: FFO/sh (FY)"));
check("Revenue key exists", keys.includes("Fund: Revenue (Q)"));
check("meta row skipped", !keys.some((k) => k.startsWith("Fund: Period")));

function firstIdxOnOrAfter(target: string): number {
  let lo = 0, hi = dates.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < target) lo = m + 1; else hi = m; }
  return lo < dates.length ? lo : -1;
}
function expectedReportIdx(ticker: string, periodEnd: string): number {
  const earn = (events[ticker]?.earnings ?? []).filter((d) => d > periodEnd).sort();
  const stamp = earn.length > 0 && (Date.parse(earn[0]) - Date.parse(periodEnd)) / 86400000 <= 180
    ? earn[0]
    : new Date(Date.parse(periodEnd) + 60 * 86400000).toISOString().slice(0, 10);
  return firstIdxOnOrAfter(stamp);
}
function valueAt(rle: any[], idx: number): number | null {
  return rleDecode(rle, dates.length)[idx];
}

// Q1 2024 (period end 2024-03-31, value 1.11) should sit on the first earnings date after 3/31
const q1Idx = expectedReportIdx(T1, "2024-03-31");
check(
  `Q1'24 FFO stamped at report date (${dates[q1Idx]})`,
  valueAt(t1Data["Fund: FFO/sh (Q)"], q1Idx) === 1.11,
  `value at idx ${q1Idx} = ${valueAt(t1Data["Fund: FFO/sh (Q)"], q1Idx)}`,
);
// PE twin sits at the first trading day on/after 2024-03-31
const q1PeIdx = firstIdxOnOrAfter("2024-03-31");
check(
  `Q1'24 FFO PE-stamped at quarter end (${dates[q1PeIdx]})`,
  valueAt(t1Data["Fund: FFO/sh (Q PE)"], q1PeIdx) === 1.11,
  `value at idx ${q1PeIdx} = ${valueAt(t1Data["Fund: FFO/sh (Q PE)"], q1PeIdx)}`,
);
// Report stamp must be strictly AFTER the PE stamp (no lookahead)
check("report stamp is after period end", q1Idx > q1PeIdx, `${q1Idx} vs ${q1PeIdx}`);
// Comma + parens cleanup
const revQ4Idx = expectedReportIdx(T1, "2023-12-31");
check("comma value parsed (1,234)", valueAt(t1Data["Fund: Revenue (Q)"], revQ4Idx) === 1234);
const revQ2Idx = expectedReportIdx(T1, "2024-06-30");
check("paren negative parsed ((150))", valueAt(t1Data["Fund: Revenue (Q)"], revQ2Idx) === -150);
// H1 2024 → period end 2024-06-30, cadence H
const h1Idx = expectedReportIdx(T1, "2024-06-30");
check("1H24 stamped on H key", valueAt(t1Data["Fund: FFO/sh (H)"], h1Idx) === 2.32);

// ── T2: date headers inferred as quarterly ──
const t2Data = JSON.parse(fs.readFileSync(path.join(TMP_DATA, "tickers", `${T2}.json`), "utf-8"));
check("date-header sheet → Q cadence", Object.keys(t2Data).includes("Fund: NOI (Q)"), Object.keys(t2Data).join(", "));
const t2Q1Idx = expectedReportIdx(T2, "2024-03-31");
check("T2 NOI stamped at report date", valueAt(t2Data["Fund: NOI (Q)"], t2Q1Idx) === 11);

// ── tickers.json + meta ──
const metaAfter: any[] = JSON.parse(fs.readFileSync(path.join(TMP_DATA, "tickers.json"), "utf-8"));
const t1Meta = metaAfter.find((t) => t.ticker === T1);
check("tickers.json metrics updated", t1Meta.metrics.includes("Fund: FFO/sh (Q)"));
check("fundamentals-meta.json written", fs.existsSync(path.join(TMP_DATA, "fundamentals-meta.json")));

// ── Idempotent re-upload (replace, not duplicate) ──
const stats2 = ingestFundamentalsWorkbook(wbPath, TMP_DATA, "test-fundamentals.xlsx", fs.statSync(wbPath).size);
const metaAfter2: any[] = JSON.parse(fs.readFileSync(path.join(TMP_DATA, "tickers.json"), "utf-8"));
const t1Meta2 = metaAfter2.find((t) => t.ticker === T1);
check(
  "re-upload doesn't duplicate metrics entries",
  t1Meta2.metrics.filter((m: string) => m === "Fund: FFO/sh (Q)").length === 1,
);
check("re-upload updates same tickers", stats2.tickersUpdated === 2);

// ── Wipe ──
console.log("\nWiping…");
const wiped = wipeFundamentals(TMP_DATA);
console.log(JSON.stringify(wiped));
const t1After = JSON.parse(fs.readFileSync(path.join(TMP_DATA, "tickers", `${T1}.json`), "utf-8"));
check("wipe strips Fund: keys", !Object.keys(t1After).some((k) => k.startsWith("Fund: ")));
check("wipe keeps close", Object.keys(t1After).includes("close"));
const metaAfterWipe: any[] = JSON.parse(fs.readFileSync(path.join(TMP_DATA, "tickers.json"), "utf-8"));
check("wipe cleans tickers.json", !metaAfterWipe.find((t) => t.ticker === T1).metrics.some((m: string) => m.startsWith("Fund: ")));
check("wipe removes meta file", !fs.existsSync(path.join(TMP_DATA, "fundamentals-meta.json")));

// ── Cleanup ──
fs.rmSync(TMP, { recursive: true, force: true });

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
