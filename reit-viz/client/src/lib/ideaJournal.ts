// Idea Journal — pinned trade ideas with the evidence frozen at pin time and
// outcomes tracked live. Server-synced via the prefs KV (same saved items on
// every computer); localStorage is only the boot cache.
import { loadServerPref, saveServerPref } from "@/lib/serverPrefs";

export interface JournalEntry {
  id: string;
  createdAt: string; // YYYY-MM-DD
  source: string; // "disloc" | "idio" | "manual" | ...
  /** [long] or [long, short] for pairs. */
  tickers: string[];
  direction: string; // e.g. "LONG AKR / SHORT BXP" or "LONG AVB"
  thesis: string;
  /** Evidence text frozen at pin time (spread z, ρ, chips, suggestion …). */
  snapshot: string;
  /** Close per ticker at pin time (same-day close). */
  entryCloses: Record<string, number>;
  status: "open" | "closed";
  closedAt?: string;
  closeNote?: string;
  /** Return locked in at close time (%, spread for pairs). */
  closedReturnPct?: number;
}

export const JOURNAL_KEY = "reit-viz:idea-journal";

export function loadJournalLocal(): JournalEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function loadJournal(): Promise<JournalEntry[]> {
  const srv = await loadServerPref<JournalEntry[]>(JOURNAL_KEY);
  return Array.isArray(srv) ? srv : loadJournalLocal();
}

export function persistJournal(entries: JournalEntry[]): void {
  saveServerPref(JOURNAL_KEY, entries);
}

/** Add an entry (prepended). Fire-and-forget server sync. */
export async function addJournalEntry(entry: Omit<JournalEntry, "id" | "createdAt" | "status">): Promise<JournalEntry> {
  const full: JournalEntry = {
    ...entry,
    id: `j-${Date.now()}`,
    createdAt: new Date().toISOString().slice(0, 10),
    status: "open",
  };
  const cur = await loadJournal();
  persistJournal([full, ...cur]);
  return full;
}

/**
 * Live return since pin, in %:
 *  - single name: direction-signed price change;
 *  - pair [long, short]: long %chg − short %chg (the spread you captured).
 */
export function entryReturnPct(e: JournalEntry, lastClose: (tk: string) => number | null): number | null {
  const chg = (tk: string): number | null => {
    const p0 = e.entryCloses[tk];
    const p1 = lastClose(tk);
    if (!Number.isFinite(p0) || p0 === 0 || p1 === null || !Number.isFinite(p1)) return null;
    return ((p1 - p0) / p0) * 100;
  };
  if (e.tickers.length === 1) {
    const c = chg(e.tickers[0]);
    if (c === null) return null;
    return /short/i.test(e.direction) && !/long/i.test(e.direction) ? -c : c;
  }
  const a = chg(e.tickers[0]);
  const b = chg(e.tickers[1]);
  if (a === null || b === null) return null;
  return a - b;
}
