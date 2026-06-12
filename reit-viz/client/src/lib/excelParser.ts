/**
 * Client-side Excel parser using SheetJS (xlsx).
 * Replicates the same logic as scripts/refresh-data.py:
 *   - Reads _mktdata sheets → extracts dates (row 8) and metric rows via ROW_MAP
 *   - Reads Tickerlist sheet → extracts ticker metadata (8 columns)
 *   - Reads "Ex dividend dates" and "Earnings report dates" sheets → events
 *   - Run-length encodes null sequences for compact JSON
 *
 * Returns the same data structure the backend produces.
 *
 * LARGE FILE SUPPORT: For files > 50MB, sheets are parsed in batches
 * to avoid browser OOM crashes. Each batch re-reads the underlying buffer
 * with only a subset of sheets, keeping peak memory manageable.
 */
import * as XLSX from "xlsx";

// Row mapping (1-indexed) — mirrors refresh-data.py ROW_MAP
const ROW_MAP: Record<number, string> = {
  9: "close",
  10: "open",
  11: "low",
  12: "high",
  21: "EPS FY1",
  22: "EPS FY2",
  23: "EBITDA FY1",
  24: "EBITDA FY2",
  25: "FFO FY1",
  26: "FFO FY2",
  27: "AFFO FY1",
  28: "AFFO FY2",
  29: "Sales FY1",
  30: "Sales FY2",
  37: "EPS LTM",
  38: "Sales LTM",
  39: "EBITDA LTM",
  40: "FFO LTM",
  41: "AFFO LTM",
  42: "EPS FY0",
  47: "FFO FY0",
  48: "AFFO FY0",
  49: "Dividend",
  50: "Enterprise Value",
  51: "52wk High",
  52: "52wk Low",
  66: "1Y Price Chg%",
  67: "6M Price Chg%",
  68: "3M Price Chg%",
  69: "1M Price Chg%",
  70: "Short Interest%",
  71: "Buy Ratings",
  72: "Hold Ratings",
  74: "Sell Ratings",
  76: "Bull%",
  77: "Bear%",
  78: "FY1 EPS Growth",
  79: "FY2 EPS Growth",
  86: "FY1 FFO Growth",
  87: "FY2 FFO Growth",
  88: "FY1 AFFO Growth",
  89: "FY2 AFFO Growth",
  92: "% off 52wk High",
  93: "% off 52wk Low",
  95: "P/E LTM",
  96: "P/E FY2",
  97: "P/S LTM",
  98: "P/S FY2",
  101: "EV/EBITDA LTM",
  102: "EV/EBITDA FY2",
  109: "P/FFO LTM",
  110: "P/FFO FY2",
  111: "P/AFFO LTM",
  112: "P/AFFO FY2",
  113: "FFO Yield LTM",
  114: "FFO Yield FY2",
  115: "AFFO Yield LTM",
  116: "AFFO Yield FY2",
  127: "Dividend Yield",
};

// ---------- Helpers ----------

function parseDate(val: unknown): string | null {
  if (val == null) return null;
  // SheetJS converts dates to JS Date objects when cellDates is set
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (!s) return null;

  // If it's a serial date number (Excel stores dates as numbers)
  if (typeof val === "number" && val > 30000 && val < 60000) {
    // Convert Excel serial to JS Date
    const jsDate = XLSX.SSF.parse_date_code(val);
    if (jsDate) {
      const y = jsDate.y;
      const m = String(jsDate.m).padStart(2, "0");
      const d = String(jsDate.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  // Try MM/DD/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    return `${m1[3]}-${m1[1].padStart(2, "0")}-${m1[2].padStart(2, "0")}`;
  }
  // Try YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return s;
  // Try MM/DD/YY
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m3) {
    const yr = parseInt(m3[3]) < 50 ? `20${m3[3]}` : `19${m3[3]}`;
    return `${yr}-${m3[1].padStart(2, "0")}-${m3[2].padStart(2, "0")}`;
  }
  return null;
}

function runLengthEncode(values: (number | null)[]): (number | string)[] {
  const encoded: (number | string)[] = [];
  let nullCount = 0;
  for (const v of values) {
    if (v === null || v === undefined) {
      nullCount++;
    } else {
      if (nullCount > 0) {
        encoded.push(`~${nullCount}`);
        nullCount = 0;
      }
      encoded.push(typeof v === "number" ? Math.round(v * 10000) / 10000 : v);
    }
  }
  if (nullCount > 0) {
    encoded.push(`~${nullCount}`);
  }
  return encoded;
}

function cleanNumeric(v: unknown): number | null {
  if (v == null || v === "" || v === " " || v === false) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ---------- Progress callback ----------

export interface ParseProgress {
  phase: "reading" | "parsing_tickers" | "parsing_events" | "parsing_tickerlist" | "done";
  current: number;
  total: number;
  message: string;
}

export interface ParsedWorkbook {
  tickers: Array<{
    ticker: string;
    name: string;
    economy: string;
    sector: string;
    subsector: string;
    industryGroup: string;
    industry: string;
    subindustry: string;
    dates: number;
    metrics: string[];
  }>;
  dates: string[];
  events: Record<string, Record<string, string[]>>;
  tickerData: Record<string, Record<string, (number | string)[]>>;
  workbookName: string;
}

/**
 * Convert RLE-encoded ticker data to the [dateIndex, value][] tuple format
 * that the client's dataService expects.
 */
export function rleToTuples(
  tickerData: Record<string, (number | string)[]>
): Record<string, [number, number][]> {
  const result: Record<string, [number, number][]> = {};
  for (const [metric, rle] of Object.entries(tickerData)) {
    const pairs: [number, number][] = [];
    let idx = 0;
    for (const item of rle) {
      if (typeof item === "string" && item.startsWith("~")) {
        idx += parseInt(item.slice(1));
      } else {
        pairs.push([idx, item as number]);
        idx++;
      }
    }
    result[metric] = pairs;
  }
  return result;
}

// ---------- Sheet data extraction ----------

/** Extract ticker data from a single mktdata sheet's array-of-arrays */
function extractMktdataFromAoa(aoa: unknown[][]): {
  dates: string[];
  data: Record<string, (number | string)[]>;
  metrics: string[];
} | null {
  const dateRowIdx = 7; // Row 8, 0-indexed
  if (aoa.length <= dateRowIdx) return null;

  const dateRow = aoa[dateRowIdx];
  const dates: string[] = [];
  for (let c = 1; c < dateRow.length; c++) {
    const d = parseDate(dateRow[c]);
    if (d) dates.push(d);
    else break;
  }
  if (dates.length === 0) return null;

  const numDates = dates.length;
  const data: Record<string, (number | string)[]> = {};
  const metrics: string[] = [];

  for (const [rowNumStr, metricName] of Object.entries(ROW_MAP)) {
    const rowIdx = parseInt(rowNumStr) - 1;
    if (rowIdx >= aoa.length) continue;
    const row = aoa[rowIdx];
    if (!row) continue;

    const values: (number | null)[] = [];
    for (let c = 1; c <= numDates; c++) {
      values.push(cleanNumeric(c < row.length ? row[c] : null));
    }
    if (values.some((v) => v !== null)) {
      data[metricName] = runLengthEncode(values);
      metrics.push(metricName);
    }
  }

  return { dates, data, metrics };
}

/** Parse a Tickerlist sheet's AOA into ticker metadata */
function parseTickerlistAoa(aoa: unknown[][]): Record<string, {
  ticker: string;
  name: string;
  economy: string;
  sector: string;
  subsector: string;
  industryGroup: string;
  industry: string;
  subindustry: string;
}> {
  const meta: Record<string, {
    ticker: string; name: string; economy: string; sector: string;
    subsector: string; industryGroup: string; industry: string; subindustry: string;
  }> = {};

  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || !row[0]) continue;
    const rawTicker = String(row[0]).replace("-US", "").trim();
    meta[rawTicker] = {
      ticker: rawTicker,
      name: String(row[1] || "").trim(),
      economy: String(row[2] || "").trim(),
      sector: String(row[3] || "").trim(),
      subsector: String(row[4] || "").trim(),
      industryGroup: String(row[5] || "").trim(),
      industry: String(row[6] || "").trim(),
      subindustry: String(row[7] || "Other").trim(),
    };
  }
  return meta;
}

/** Parse an event sheet's AOA into the events structure */
function parseEventAoa(aoa: unknown[][]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] as unknown[];
    if (!row || !row[0]) continue;
    const ticker = String(row[0])
      .replace("-US^", "")
      .replace("-US", "")
      .trim();
    const datesList: string[] = [];
    for (let c = 1; c < row.length; c++) {
      const d = parseDate(row[c]);
      if (d) datesList.push(d);
    }
    result[ticker] = datesList;
  }
  return result;
}

// ---------- Threshold for batched parsing ----------
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
const BATCH_SIZE = 5; // sheets per batch for large files

export async function parseExcelClientSide(
  file: File,
  onProgress?: (p: ParseProgress) => void
): Promise<ParsedWorkbook> {
  const report = (phase: ParseProgress["phase"], current: number, total: number, message: string) => {
    onProgress?.({ phase, current, total, message });
  };

  report("reading", 0, 1, `Reading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);

  // Read the file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  const isLargeFile = arrayBuffer.byteLength > LARGE_FILE_THRESHOLD;

  report("reading", 1, 1, "Parsing workbook structure...");

  // Step 1: Get sheet names (lightweight — doesn't parse cell data)
  const wbNames = XLSX.read(arrayBuffer, {
    type: "array",
    bookSheets: true,
  });
  const sheetNames = wbNames.SheetNames;

  // Find mktdata sheets
  const mktdataSheets = sheetNames.filter(
    (s) => s.toLowerCase().includes("_mktdata")
  );

  // Find metadata sheets
  const tickerlistSheetName = sheetNames.find(
    (s) => s.toLowerCase() === "tickerlist" || s.toLowerCase() === "ticker list"
  );
  const eventSheetDefs: [string, string][] = [
    ["Ex dividend dates", "ex_dividend"],
    ["Earnings report dates", "earnings"],
  ];
  const foundEventSheets: { sheetName: string; eventKey: string }[] = [];
  for (const [name, key] of eventSheetDefs) {
    const found = sheetNames.find((s) => s.toLowerCase() === name.toLowerCase());
    if (found) foundEventSheets.push({ sheetName: found, eventKey: key });
  }

  const metaSheetNames = [
    tickerlistSheetName,
    ...foundEventSheets.map((e) => e.sheetName),
  ].filter(Boolean) as string[];

  const totalBatches = isLargeFile
    ? Math.ceil(mktdataSheets.length / BATCH_SIZE)
    : 1;

  report("parsing_tickers", 0, mktdataSheets.length,
    `Found ${mktdataSheets.length} ticker sheets${isLargeFile ? ` (large file — ${totalBatches} batches)` : ""}`);

  // ---------- Parse mktdata sheets ----------
  let allDates: string[] = [];
  const tickersMap: Record<string, {
    ticker: string;
    dates: number;
    metrics: string[];
  }> = {};
  const tickerData: Record<string, Record<string, (number | string)[]>> = {};
  let tickerMeta: Record<string, {
    ticker: string; name: string; economy: string; sector: string;
    subsector: string; industryGroup: string; industry: string; subindustry: string;
  }> = {};
  const events: Record<string, Record<string, string[]>> = {};

  if (isLargeFile) {
    // ── LARGE FILE: Batched parsing ──
    let processed = 0;

    for (let batchStart = 0; batchStart < mktdataSheets.length; batchStart += BATCH_SIZE) {
      const batchSheetNames = mktdataSheets.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;

      // On the first batch, include metadata sheets too
      const sheetsToLoad = batchStart === 0
        ? [...batchSheetNames, ...metaSheetNames]
        : batchSheetNames;

      report("parsing_tickers", processed, mktdataSheets.length,
        `Parsing batch ${batchNum}/${totalBatches} (${batchSheetNames.length} sheets)...`);

      // Parse only this batch of sheets from the same buffer
      let batchWb: XLSX.WorkBook | null = XLSX.read(arrayBuffer, {
        type: "array",
        cellDates: true,
        cellNF: false,
        cellText: false,
        sheets: sheetsToLoad,
      });

      // Extract mktdata from this batch
      for (const sheetName of batchSheetNames) {
        const ticker = sheetName
          .replace(/-US_mktdata/i, "")
          .replace(/_mktdata/i, "")
          .trim();

        processed++;
        report("parsing_tickers", processed, mktdataSheets.length, `Processing ${ticker} (batch ${batchNum})...`);

        const ws = batchWb.Sheets[sheetName];
        if (!ws) continue;

        const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: true,
          defval: null,
        });

        const result = extractMktdataFromAoa(aoa);
        if (!result) continue;

        if (result.dates.length > allDates.length) {
          allDates = result.dates;
        }

        tickerData[ticker] = result.data;
        tickersMap[ticker] = {
          ticker,
          dates: result.dates.length,
          metrics: result.metrics,
        };
      }

      // On the first batch, also extract metadata sheets
      if (batchStart === 0) {
        if (tickerlistSheetName && batchWb.Sheets[tickerlistSheetName]) {
          const tlAoa: unknown[][] = XLSX.utils.sheet_to_json(
            batchWb.Sheets[tickerlistSheetName], { header: 1, raw: true, defval: null }
          );
          tickerMeta = parseTickerlistAoa(tlAoa);
        }

        for (const { sheetName, eventKey } of foundEventSheets) {
          if (batchWb.Sheets[sheetName]) {
            const evAoa: unknown[][] = XLSX.utils.sheet_to_json(
              batchWb.Sheets[sheetName], { header: 1, raw: true, defval: null }
            );
            const parsed = parseEventAoa(evAoa);
            for (const [ticker, dates] of Object.entries(parsed)) {
              if (!events[ticker]) events[ticker] = {};
              events[ticker][eventKey] = dates;
            }
          }
        }
      }

      // Release the batch workbook to free memory for GC
      batchWb = null;

      // Yield to main thread between batches (allows GC + UI updates)
      await new Promise((r) => setTimeout(r, 100));
    }
  } else {
    // ── SMALL FILE: Parse all at once (original behavior) ──
    const wb = XLSX.read(arrayBuffer, {
      type: "array",
      cellDates: true,
      cellNF: false,
      cellText: false,
    });

    for (let si = 0; si < mktdataSheets.length; si++) {
      const sheetName = mktdataSheets[si];
      const ticker = sheetName
        .replace(/-US_mktdata/i, "")
        .replace(/_mktdata/i, "")
        .trim();

      report("parsing_tickers", si + 1, mktdataSheets.length, `Processing ${ticker}...`);

      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: true,
        defval: null,
      });

      const result = extractMktdataFromAoa(aoa);
      if (!result) continue;

      if (result.dates.length > allDates.length) {
        allDates = result.dates;
      }

      tickerData[ticker] = result.data;
      tickersMap[ticker] = {
        ticker,
        dates: result.dates.length,
        metrics: result.metrics,
      };

      // Yield to main thread periodically
      if (si % 5 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // Extract tickerlist
    if (tickerlistSheetName && wb.Sheets[tickerlistSheetName]) {
      const tlAoa: unknown[][] = XLSX.utils.sheet_to_json(
        wb.Sheets[tickerlistSheetName], { header: 1, raw: true, defval: null }
      );
      tickerMeta = parseTickerlistAoa(tlAoa);
    }

    // Extract events
    for (const { sheetName, eventKey } of foundEventSheets) {
      if (wb.Sheets[sheetName]) {
        const evAoa: unknown[][] = XLSX.utils.sheet_to_json(
          wb.Sheets[sheetName], { header: 1, raw: true, defval: null }
        );
        const parsed = parseEventAoa(evAoa);
        for (const [ticker, dates] of Object.entries(parsed)) {
          if (!events[ticker]) events[ticker] = {};
          events[ticker][eventKey] = dates;
        }
      }
    }
  }

  report("parsing_tickerlist", 1, 1, `Found ${Object.keys(tickerMeta).length} tickers in Tickerlist`);

  // ---------- Build final tickers array ----------
  const tickers = Object.values(tickersMap).map((t) => {
    const meta = tickerMeta[t.ticker] || {
      ticker: t.ticker,
      name: t.ticker,
      economy: "",
      sector: "",
      subsector: "",
      industryGroup: "",
      industry: "Other",
      subindustry: "Other",
    };
    return {
      ...meta,
      dates: t.dates,
      metrics: t.metrics,
    };
  });

  // Sort by ticker
  tickers.sort((a, b) => a.ticker.localeCompare(b.ticker));

  report("done", mktdataSheets.length, mktdataSheets.length,
    `Parsed ${tickers.length} tickers, ${allDates.length} dates`);

  return {
    tickers,
    dates: allDates,
    events,
    tickerData,
    workbookName: file.name,
  };
}
