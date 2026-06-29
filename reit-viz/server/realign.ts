/**
 * Date-axis realignment for merge operations.
 *
 * Per-ticker data files store each metric as a position-indexed, run-length-
 * encoded array against the global dates.json axis:
 *   { "close": [v0, v1, "~3", v5, ...], ... }   // "~N" = N consecutive nulls
 *
 * When a merge unions two date axes (existing prod dates + an incoming
 * workbook's dates), the merged axis can insert dates *in the middle*. Every
 * ticker file aligned to an old axis must then be remapped to the merged axis,
 * or its values silently shift out of alignment. These helpers do that remap:
 * decode RLE → reposition by date → re-encode RLE.
 */
import fs from "fs";
import path from "path";

export type RleArray = (number | string | null)[];

/** Decode an RLE metric array to a dense array of exactly `length` (null-padded/truncated). */
export function rleDecode(rle: RleArray, length: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (const item of rle) {
    if (typeof item === "string" && item.startsWith("~")) {
      const n = parseInt(item.slice(1), 10);
      for (let i = 0; i < n; i++) out.push(null);
    } else if (item === null || item === undefined) {
      out.push(null);
    } else {
      out.push(item as number);
    }
  }
  if (out.length < length) {
    while (out.length < length) out.push(null);
  } else if (out.length > length) {
    out.length = length;
  }
  return out;
}

/** Run-length-encode a dense array, collapsing null runs to "~N". */
export function rleEncode(dense: (number | null)[]): RleArray {
  const out: RleArray = [];
  let nullRun = 0;
  for (const v of dense) {
    if (v === null || v === undefined) {
      nullRun++;
    } else {
      if (nullRun > 0) { out.push(`~${nullRun}`); nullRun = 0; }
      out.push(v);
    }
  }
  if (nullRun > 0) out.push(`~${nullRun}`);
  return out;
}

/** True if two date axes are positionally identical (so no realignment is needed). */
export function sameAxis(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Remap one ticker's RLE metric map from `fromDates` onto the merged axis. */
export function realignTickerData(
  tickerData: Record<string, RleArray>,
  fromDates: string[],
  mergedIndexByDate: Map<string, number>,
  mergedLen: number,
): Record<string, RleArray> {
  const fromToMerged = new Array<number>(fromDates.length);
  for (let i = 0; i < fromDates.length; i++) {
    const gi = mergedIndexByDate.get(fromDates[i]);
    fromToMerged[i] = gi === undefined ? -1 : gi;
  }
  const out: Record<string, RleArray> = {};
  for (const [metric, rle] of Object.entries(tickerData)) {
    const dense = rleDecode(rle, fromDates.length);
    const newDense: (number | null)[] = new Array(mergedLen).fill(null);
    for (let i = 0; i < dense.length; i++) {
      const v = dense[i];
      if (v === null) continue;
      const gi = fromToMerged[i];
      if (gi >= 0) newDense[gi] = v;
    }
    out[metric] = rleEncode(newDense);
  }
  return out;
}

/**
 * Realign every per-ticker file in `tickerDir` to `mergedDates`. For each ticker,
 * `axisOf` returns the source date axis its file is currently aligned to (e.g.
 * the existing prod axis for untouched tickers, or the incoming workbook's axis
 * for freshly written ones). Files already on the merged axis are skipped.
 * Returns the number of files rewritten.
 */
export function realignTickerFiles(
  tickerDir: string,
  mergedDates: string[],
  axisOf: (ticker: string) => string[] | null,
): number {
  const mergedIndex = new Map<string, number>(mergedDates.map((d, i) => [d, i]));
  const mergedLen = mergedDates.length;
  let count = 0;
  if (!fs.existsSync(tickerDir)) return 0;
  for (const file of fs.readdirSync(tickerDir)) {
    if (!file.endsWith(".json")) continue;
    const ticker = file.slice(0, -5);
    const from = axisOf(ticker);
    if (!from || sameAxis(from, mergedDates)) continue;
    const full = path.join(tickerDir, file);
    let data: Record<string, RleArray>;
    try {
      data = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      continue;
    }
    const re = realignTickerData(data, from, mergedIndex, mergedLen);
    fs.writeFileSync(full, JSON.stringify(re));
    count++;
  }
  return count;
}
