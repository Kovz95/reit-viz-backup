/**
 * Historical-fundamentals ingestion (server-side, persistent).
 *
 * Input workbook format: one sheet per company (sheet name = ticker, "-US"
 * suffix tolerated), metric names down column A, fiscal periods across a
 * header row (quarterly "2024Q1"/"Q1 24"/"1Q24", half-year "1H24"/"H1 2024",
 * annual "FY2024"/"2024", or literal period-end dates). Values are the
 * reported actuals for that period.
 *
 * Point-in-time rule: each value is stamped on the trading day of the FIRST
 * earnings report date AFTER the period end (from data/events.json), because
 * that is when the market learned it. When no earnings date exists in the
 * window, we fall back to period end + a conservative lag (Q/H 60d, FY 75d) —
 * erring on "knew it later", never earlier. A period-end-stamped twin series
 * ("… PE)" suffix) is also written for economic (non-signal) alignment.
 *
 * Storage follows the cap-rate precedent: values are merged into the existing
 * data/tickers/<SYM>.json RLE files on the global dates.json axis under keys
 *   "Fund: <metric> (Q)"  /  "(H)"  /  "(FY)"      ← report-date stamped
 *   "Fund: <metric> (Q PE)" / "(H PE)" / "(FY PE)" ← period-end stamped
 * and appended to each ticker's metrics list in tickers.json, so every picker
 * in the client discovers them automatically.
 */
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { rleEncode } from "./realign";

export type Cadence = "Q" | "H" | "FY";

interface ParsedPeriod {
  col: number;            // column index in the sheet
  cadence: Cadence;
  periodEnd: string;      // ISO date
}

interface ParsedSheet {
  ticker: string;
  rawSheetName: string;
  periods: ParsedPeriod[];
  metrics: { name: string; values: (number | null)[] }[]; // aligned to periods
}

export interface ParsedFundamentals {
  sheets: ParsedSheet[];
  skippedSheets: string[];
}

const Q_END: Record<number, string> = { 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" };
const H_END: Record<number, string> = { 1: "06-30", 2: "12-31" };
const SKIP_LABELS = new Set([
  "calendar", "fiscal", "fiscal date", "fiscal quarter", "period", "period end",
  "unit", "units", "currency", "source", "tag id", "notes",
]);
// Earnings dates further out than this from period end belong to a later period.
const MAX_REPORT_LAG_DAYS = 180;
const FALLBACK_LAG_DAYS: Record<Cadence, number> = { Q: 60, H: 60, FY: 75 };

function fullYear(s: string): number {
  const n = parseInt(s, 10);
  if (s.length === 2) return n < 50 ? 2000 + n : 1900 + n;
  return n;
}

function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeDateStr(s: string): string | null {
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return null;
}

/** Parse one header cell into a period. cadence "DATE" means a literal date whose cadence is inferred from column spacing. */
function parsePeriodCell(raw: unknown): { cadence: Cadence | "DATE"; periodEnd: string } | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return { cadence: "DATE", periodEnd: isoFromDate(raw) };
  }
  if (typeof raw === "number") {
    // Excel date serial
    if (raw > 20000 && raw < 60000) {
      const d = XLSX.SSF.parse_date_code(raw);
      if (d) return { cadence: "DATE", periodEnd: `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` };
    }
    // Bare year typed as a number
    if (raw >= 1990 && raw <= 2100 && Number.isInteger(raw)) {
      return { cadence: "FY", periodEnd: `${raw}-12-31` };
    }
    return null;
  }
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, " ");
  if (!s) return null;

  const asDate = normalizeDateStr(s);
  if (asDate) return { cadence: "DATE", periodEnd: asDate };

  const SEP = "[\\s\\-._']*";
  let m: RegExpMatchArray | null;

  // Quarterly: 2024Q1, FY2024 Q1, 2024-Q1
  if ((m = s.match(new RegExp(`^(?:FY)?${SEP}(\\d{4})${SEP}Q([1-4])$`)))) {
    return { cadence: "Q", periodEnd: `${m[1]}-${Q_END[+m[2]]}` };
  }
  // Q1 2024, Q1'24, Q1-24
  if ((m = s.match(new RegExp(`^Q([1-4])${SEP}(\\d{2}|\\d{4})$`)))) {
    return { cadence: "Q", periodEnd: `${fullYear(m[2])}-${Q_END[+m[1]]}` };
  }
  // 1Q24, 1Q 2024
  if ((m = s.match(new RegExp(`^([1-4])Q${SEP}(\\d{2}|\\d{4})$`)))) {
    return { cadence: "Q", periodEnd: `${fullYear(m[2])}-${Q_END[+m[1]]}` };
  }
  // Half-year: 2024H1, 2024-H1
  if ((m = s.match(new RegExp(`^(\\d{4})${SEP}H([12])$`)))) {
    return { cadence: "H", periodEnd: `${m[1]}-${H_END[+m[2]]}` };
  }
  // H1 2024, H1'24
  if ((m = s.match(new RegExp(`^H([12])${SEP}(\\d{2}|\\d{4})$`)))) {
    return { cadence: "H", periodEnd: `${fullYear(m[2])}-${H_END[+m[1]]}` };
  }
  // 1H24, 2H 2024
  if ((m = s.match(new RegExp(`^([12])H${SEP}(\\d{2}|\\d{4})$`)))) {
    return { cadence: "H", periodEnd: `${fullYear(m[2])}-${H_END[+m[1]]}` };
  }
  // Annual: FY2024, FY24, FY'24
  if ((m = s.match(new RegExp(`^FY${SEP}(\\d{2}|\\d{4})$`)))) {
    return { cadence: "FY", periodEnd: `${fullYear(m[1])}-12-31` };
  }
  // 2024FY, 2024 FY
  if ((m = s.match(new RegExp(`^(\\d{4})${SEP}FY$`)))) {
    return { cadence: "FY", periodEnd: `${m[1]}-12-31` };
  }
  // Bare year
  if ((m = s.match(/^(\d{4})$/))) {
    const y = +m[1];
    if (y >= 1990 && y <= 2100) return { cadence: "FY", periodEnd: `${y}-12-31` };
  }
  return null;
}

function cleanNumeric(raw: unknown): number | null {
  if (raw == null || raw === "" || raw === false || raw === true) return null;
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  if (raw instanceof Date) return null;
  let s = String(raw).trim();
  if (!s || /^(n\/?a|na|nm|-|–|—)$/i.test(s)) return null;
  let neg = false;
  const paren = s.match(/^\((.*)\)$/);
  if (paren) { neg = true; s = paren[1]; }
  s = s.replace(/[,$%\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (isNaN(n) || !isFinite(n)) return null;
  return neg ? -n : n;
}

/** Median day-gap between consecutive DATE columns → cadence for all of them. */
function inferDateCadence(periodEnds: string[]): Cadence {
  if (periodEnds.length < 2) {
    return periodEnds[0]?.endsWith("-12-31") ? "FY" : "Q";
  }
  const sorted = [...periodEnds].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(diffDays(sorted[i - 1], sorted[i]));
  gaps.sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  if (med < 100) return "Q";
  if (med < 250) return "H";
  return "FY";
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function addDays(iso: string, days: number): string {
  const d = new Date(Date.parse(iso) + days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function parseFundamentalsWorkbook(filePath: string): ParsedFundamentals {
  // XLSX.read on a buffer (readFile is unavailable in the ESM build without set_fs)
  const wb = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: true });
  const sheets: ParsedSheet[] = [];
  const skippedSheets: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) { skippedSheets.push(sheetName); continue; }
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    if (aoa.length < 2) { skippedSheets.push(sheetName); continue; }

    // Header row = the early row with the most parseable period labels (col B+)
    let headerRow = -1;
    let headerParsed: ({ cadence: Cadence | "DATE"; periodEnd: string } | null)[] = [];
    let bestCount = 0;
    const scanRows = Math.min(aoa.length, 8);
    for (let r = 0; r < scanRows; r++) {
      const row = aoa[r] || [];
      const parsed: typeof headerParsed = [];
      let count = 0;
      for (let c = 1; c < row.length; c++) {
        const p = parsePeriodCell(row[c]);
        parsed[c] = p;
        if (p) count++;
      }
      if (count > bestCount) { bestCount = count; headerRow = r; headerParsed = parsed; }
    }
    if (headerRow < 0 || bestCount < 1) { skippedSheets.push(sheetName); continue; }

    // Resolve DATE-cadence columns by their spacing
    const dateEnds = headerParsed.filter((p) => p?.cadence === "DATE").map((p) => p!.periodEnd);
    const dateCadence = dateEnds.length > 0 ? inferDateCadence(dateEnds) : null;
    const periods: ParsedPeriod[] = [];
    for (let c = 0; c < headerParsed.length; c++) {
      const p = headerParsed[c];
      if (!p) continue;
      periods.push({ col: c, cadence: p.cadence === "DATE" ? dateCadence! : p.cadence, periodEnd: p.periodEnd });
    }
    if (periods.length === 0) { skippedSheets.push(sheetName); continue; }
    // Column order can be newest-first; sort by period end so later stamps win on collisions
    periods.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

    const metrics: ParsedSheet["metrics"] = [];
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const name = String(row[0] ?? "").trim();
      if (!name || SKIP_LABELS.has(name.toLowerCase())) continue;
      const values = periods.map((p) => cleanNumeric(row[p.col]));
      if (values.every((v) => v === null)) continue;
      metrics.push({ name, values });
    }
    if (metrics.length === 0) { skippedSheets.push(sheetName); continue; }

    const ticker = sheetName.trim().replace(/-US$/i, "").toUpperCase();
    sheets.push({ ticker, rawSheetName: sheetName, periods, metrics });
  }

  return { sheets, skippedSheets };
}

export interface IngestStats {
  workbook: string;
  uploadedAt: string;
  fileSize: number;
  tickersUpdated: number;
  metricKeys: number;
  totalPoints: number;
  reportStamped: number;
  fallbackStamped: number;
  clamped: number;
  skippedPreHistory: number;
  skippedFuture: number;
  unknownTickers: string[];
  skippedSheets: string[];
}

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

/** First index in the ascending ISO `dates` axis with dates[i] >= target, or -1 if past the end. */
function firstIdxOnOrAfter(dates: string[], target: string): number {
  let lo = 0, hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo < dates.length ? lo : -1;
}

export function ingestFundamentalsWorkbook(
  filePath: string,
  dataDir: string,
  workbookName: string,
  fileSize: number,
): IngestStats {
  const dates: string[] = readJSON(path.join(dataDir, "dates.json"));
  const lastDate = dates[dates.length - 1];
  const firstDate = dates[0];
  const eventsPath = path.join(dataDir, "events.json");
  const events: Record<string, { earnings?: string[] }> = fs.existsSync(eventsPath) ? readJSON(eventsPath) : {};
  const tickersFile = path.join(dataDir, "tickers.json");
  const tickersMeta: any[] = fs.existsSync(tickersFile) ? readJSON(tickersFile) : [];
  const tickersDir = path.join(dataDir, "tickers");

  const parsed = parseFundamentalsWorkbook(filePath);

  const stats: IngestStats = {
    workbook: workbookName,
    uploadedAt: new Date().toISOString(),
    fileSize,
    tickersUpdated: 0,
    metricKeys: 0,
    totalPoints: 0,
    reportStamped: 0,
    fallbackStamped: 0,
    clamped: 0,
    skippedPreHistory: 0,
    skippedFuture: 0,
    unknownTickers: [],
    skippedSheets: parsed.skippedSheets,
  };

  for (const sheet of parsed.sheets) {
    const tickerPath = path.join(tickersDir, `${sheet.ticker}.json`);
    if (!fs.existsSync(tickerPath)) {
      stats.unknownTickers.push(sheet.ticker);
      continue;
    }

    // Sorted, normalized earnings report dates for point-in-time stamping
    const earnings = ((events[sheet.ticker]?.earnings ?? []) as string[])
      .map((d) => normalizeDateStr(String(d).trim()))
      .filter((d): d is string => d !== null)
      .sort();

    // Resolve each period to a report-date index and a period-end index
    const repIdx: number[] = [];
    const peIdx: number[] = [];
    for (const p of sheet.periods) {
      if (p.periodEnd > lastDate) {
        // Period hasn't ended on our axis yet — nothing to stamp
        repIdx.push(-1); peIdx.push(-1);
        stats.skippedFuture++;
        continue;
      }
      // First earnings report strictly after period end, within the lag window
      let stamp: string | null = null;
      let lo = 0, hi = earnings.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (earnings[mid] <= p.periodEnd) lo = mid + 1;
        else hi = mid;
      }
      if (lo < earnings.length && diffDays(p.periodEnd, earnings[lo]) <= MAX_REPORT_LAG_DAYS) {
        stamp = earnings[lo];
        stats.reportStamped++;
      } else {
        stamp = addDays(p.periodEnd, FALLBACK_LAG_DAYS[p.cadence]);
        stats.fallbackStamped++;
      }
      if (stamp > lastDate) { stamp = lastDate; stats.clamped++; }
      if (stamp < firstDate) {
        repIdx.push(-1);
        stats.skippedPreHistory++;
      } else {
        repIdx.push(firstIdxOnOrAfter(dates, stamp));
      }
      peIdx.push(p.periodEnd < firstDate ? -1 : firstIdxOnOrAfter(dates, p.periodEnd));
    }

    // Build dense arrays per metric key (report-date + period-end twins)
    const denseByKey = new Map<string, (number | null)[]>();
    const place = (key: string, idx: number, v: number) => {
      if (idx < 0) return;
      let dense = denseByKey.get(key);
      if (!dense) { dense = new Array(dates.length).fill(null); denseByKey.set(key, dense); }
      dense[idx] = Math.round(v * 10000) / 10000;
      stats.totalPoints++;
    };
    for (const metric of sheet.metrics) {
      for (let i = 0; i < sheet.periods.length; i++) {
        const v = metric.values[i];
        if (v === null) continue;
        const cad = sheet.periods[i].cadence;
        place(`Fund: ${metric.name} (${cad})`, repIdx[i], v);
        place(`Fund: ${metric.name} (${cad} PE)`, peIdx[i], v);
      }
    }
    if (denseByKey.size === 0) continue;

    // Merge into the ticker's RLE file (replace same-named keys on re-upload)
    let tickerData: Record<string, any>;
    try {
      tickerData = readJSON(tickerPath);
    } catch {
      stats.unknownTickers.push(sheet.ticker);
      continue;
    }
    for (const [key, dense] of denseByKey) {
      tickerData[key] = rleEncode(dense);
    }
    fs.writeFileSync(tickerPath, JSON.stringify(tickerData));

    const metaEntry = tickersMeta.find((t) => t.ticker === sheet.ticker);
    if (metaEntry && Array.isArray(metaEntry.metrics)) {
      for (const key of denseByKey.keys()) {
        if (!metaEntry.metrics.includes(key)) metaEntry.metrics.push(key);
      }
    }
    stats.tickersUpdated++;
    stats.metricKeys += denseByKey.size;
  }

  if (stats.tickersUpdated > 0) {
    fs.writeFileSync(tickersFile, JSON.stringify(tickersMeta, null, 2));
  }

  // Persist per-workbook meta (merged across uploads) + aggregates for the UI card
  const metaFile = path.join(dataDir, "fundamentals-meta.json");
  let meta: any = { workbooks: {} };
  if (fs.existsSync(metaFile)) {
    try { meta = readJSON(metaFile); } catch { meta = { workbooks: {} }; }
  }
  if (!meta.workbooks || typeof meta.workbooks !== "object") meta.workbooks = {};
  meta.workbooks[workbookName] = stats;
  const all = Object.values(meta.workbooks) as IngestStats[];
  meta.updatedAt = stats.uploadedAt;
  meta.workbookCount = all.length;
  meta.tickersUpdated = all.reduce((s, w) => s + (w.tickersUpdated || 0), 0);
  meta.totalPoints = all.reduce((s, w) => s + (w.totalPoints || 0), 0);
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

  return stats;
}

export function wipeFundamentals(dataDir: string): { strippedFiles: number; totalChecked: number; metaUpdated: number } {
  const tickersDir = path.join(dataDir, "tickers");
  const tickersFile = path.join(dataDir, "tickers.json");
  const metaFile = path.join(dataDir, "fundamentals-meta.json");

  let strippedFiles = 0;
  let totalChecked = 0;
  if (fs.existsSync(tickersDir)) {
    const files = fs.readdirSync(tickersDir).filter((f) => f.endsWith(".json"));
    totalChecked = files.length;
    for (const f of files) {
      const p = path.join(tickersDir, f);
      try {
        const data = readJSON(p);
        const fundKeys = Object.keys(data).filter((k) => k.startsWith("Fund: "));
        if (fundKeys.length > 0) {
          for (const k of fundKeys) delete data[k];
          fs.writeFileSync(p, JSON.stringify(data));
          strippedFiles++;
        }
      } catch { /* skip unreadable file */ }
    }
  }

  let metaUpdated = 0;
  if (fs.existsSync(tickersFile)) {
    try {
      const tickers: any[] = readJSON(tickersFile);
      for (const t of tickers) {
        if (Array.isArray(t.metrics)) {
          const before = t.metrics.length;
          t.metrics = t.metrics.filter((m: string) => !m.startsWith("Fund: "));
          if (t.metrics.length !== before) metaUpdated++;
        }
      }
      fs.writeFileSync(tickersFile, JSON.stringify(tickers, null, 2));
    } catch { /* leave tickers.json alone if unreadable */ }
  }

  if (fs.existsSync(metaFile)) {
    try { fs.unlinkSync(metaFile); } catch { /* ignore */ }
  }

  return { strippedFiles, totalChecked, metaUpdated };
}
