// Nightly $ ADV refresh for the ENTIRE global universe (~9.4k US +
// international names), so the Liquidity Capacity page's global mode ranks on
// fresh Yahoo volume (median/p25 included) instead of the static snapshot mean.
//
// Names flow through the same pipeline as the workbook (server/adv.ts →
// yahooPrices.ts): 63-trading-day window, FX→USD, 20h disk cache. Non-US names
// are fetched by their FactSet regional symbol (fdsTicker, e.g. "2330-TW"),
// which yahooPrices translates to Yahoo's exchange-suffix form with candidate
// fallbacks for ambiguous markets. Anything unmappable / unknown to Yahoo just
// keeps its snapshot fallback client-side.
import fs from "fs";
import path from "path";
import { getAdvBatch, type AdvEntry, getCachedAdvEntries } from "./adv";
import { isYahooMappable } from "./yahooPrices";

export const GLOBAL_ADV_WINDOW = 63; // trading days ≈ 3 months
const CHUNK = 150; // getAdvBatch saves its cache per call — checkpoint every chunk
const RUN_HOUR_UTC = 7; // ~03:00 New York — after the US close, before Asia's next close matters

interface GlobalRecordLite {
  ticker: string;
  fdsTicker?: string;
  nation?: string;
  dollarVolMM?: number | null;
}

let _records: GlobalRecordLite[] | null = null;

/** Load the baked global-universe file from wherever this build keeps it. */
export function loadGlobalUniverseRecords(): GlobalRecordLite[] {
  if (_records) return _records;
  const candidates = [
    path.join(process.cwd(), "dist", "public", "data", "global-universe.json"),
    path.join(process.cwd(), "public", "data", "global-universe.json"),
    path.join(process.cwd(), "client", "public", "data", "global-universe.json"),
    path.join(process.cwd(), "client", "dist", "data", "global-universe.json"),
  ];
  for (const fp of candidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
      const records = Array.isArray(raw) ? raw : raw.records;
      if (Array.isArray(records) && records.length > 0) {
        _records = records;
        return records;
      }
    } catch {
      /* try next location */
    }
  }
  _records = [];
  return _records;
}

/**
 * Internal fetch symbol per global record: US names use the plain ticker
 * (share-class dots handled downstream), non-US use the FactSet regional form.
 * Returns null for names Yahoo can't be asked about (unmapped market, or a
 * SEDOL-only row with no regional symbol).
 */
export function fetchSymbolFor(rec: GlobalRecordLite): string | null {
  const isUs = !rec.nation || rec.nation === "UNITED STATES";
  const sym = isUs ? rec.ticker : rec.fdsTicker ?? null;
  if (!sym) return null;
  return isYahooMappable(sym) ? String(sym).toUpperCase() : null;
}

/** primary ticker (client row key) → internal fetch symbol, for the whole universe. */
export function buildGlobalFetchMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const rec of loadGlobalUniverseRecords()) {
    const sym = fetchSymbolFor(rec);
    if (sym) m.set(String(rec.ticker).toUpperCase(), sym);
  }
  return m;
}

export interface NightlyStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  total: number;
  attempted: number;
  withAdv: number;
  unmappable: number;
  lastError: string | null;
}

const status: NightlyStatus = {
  running: false, startedAt: null, finishedAt: null,
  total: 0, attempted: 0, withAdv: 0, unmappable: 0, lastError: null,
};

export function nightlyStatus(): NightlyStatus {
  return { ...status };
}

/**
 * Refresh $ ADV for the global universe. Server-cached entries fresher than 20h
 * are skipped by getAdvBatch, so re-runs (deploy restarts, manual triggers) are
 * cheap. `limit` restricts to the first N records (testing).
 */
export async function runGlobalAdvRefresh(limit?: number): Promise<NightlyStatus> {
  if (status.running) return nightlyStatus();
  const records = loadGlobalUniverseRecords();
  // Liquid names first so the most-screened rows go live earliest in the run.
  const ordered = records.slice().sort((a, b) => (b.dollarVolMM ?? 0) - (a.dollarVolMM ?? 0));
  const scoped = limit && limit > 0 ? ordered.slice(0, limit) : ordered;
  const syms: string[] = [];
  let unmappable = 0;
  const seen = new Set<string>();
  for (const rec of scoped) {
    const sym = fetchSymbolFor(rec);
    if (!sym) { unmappable++; continue; }
    if (!seen.has(sym)) { seen.add(sym); syms.push(sym); }
  }

  status.running = true;
  status.startedAt = new Date().toISOString();
  status.finishedAt = null;
  status.total = scoped.length;
  status.attempted = 0;
  status.withAdv = 0;
  status.unmappable = unmappable;
  status.lastError = null;
  console.log(`[adv-nightly] starting: ${syms.length} symbols (${unmappable} unmappable) window=${GLOBAL_ADV_WINDOW}`);

  try {
    for (let i = 0; i < syms.length; i += CHUNK) {
      const chunk = syms.slice(i, i + CHUNK);
      const results = await getAdvBatch(chunk, GLOBAL_ADV_WINDOW, false);
      status.attempted += chunk.length;
      for (const t of chunk) {
        const e: AdvEntry | undefined = results[t];
        if (e && e.advUsdMM != null) status.withAdv++;
      }
      if ((i / CHUNK) % 5 === 0) {
        console.log(`[adv-nightly] ${status.attempted}/${syms.length} attempted, ${status.withAdv} with ADV`);
      }
    }
  } catch (err: any) {
    status.lastError = err?.message ?? String(err);
    console.error("[adv-nightly] failed:", status.lastError);
  } finally {
    status.running = false;
    status.finishedAt = new Date().toISOString();
    console.log(`[adv-nightly] done: ${status.withAdv}/${status.attempted} with ADV (${status.unmappable} unmappable)`);
  }
  return nightlyStatus();
}

/** Bulk cache read for the client: primary global ticker → cached ADV entry. */
export function getGlobalAdvBulk(window = GLOBAL_ADV_WINDOW): Record<string, AdvEntry> {
  const cached = getCachedAdvEntries(window);
  const fetchMap = buildGlobalFetchMap();
  const out: Record<string, AdvEntry> = {};
  for (const [primary, sym] of fetchMap) {
    const e = cached[sym];
    if (e && e.advUsdMM != null) out[primary] = e;
  }
  return out;
}

/** Ms until the next RUN_HOUR_UTC boundary. */
function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RUN_HOUR_UTC, 20, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Schedule the nightly refresh: a catch-up pass a few minutes after boot (the
 * 20h cache makes restarts nearly free), then daily at RUN_HOUR_UTC. Gated to
 * production so dev servers don't fire ~9.4k Yahoo requests; set ADV_NIGHTLY=1
 * to opt in elsewhere.
 */
export function scheduleNightlyAdv(): void {
  if (process.env.NODE_ENV !== "production" && process.env.ADV_NIGHTLY !== "1") return;
  setTimeout(() => { runGlobalAdvRefresh().catch(() => {}); }, 5 * 60 * 1000);
  const tick = () => {
    setTimeout(() => {
      runGlobalAdvRefresh().catch(() => {}).finally(tick);
    }, msUntilNextRun());
  };
  tick();
  console.log(`[adv-nightly] scheduled: catch-up in 5min, then daily at ${RUN_HOUR_UTC}:20 UTC`);
}
