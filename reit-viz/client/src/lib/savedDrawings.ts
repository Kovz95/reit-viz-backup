/**
 * savedDrawings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Browser-localStorage–backed store for per-ticker saved drawings.
 * Modelled on the SeededOverlaysManager pattern from the production bundle.
 *
 * KEY: "reit-viz:saved-drawings:v1"
 * Shape: Record<ticker, SavedDrawing[]>
 *
 * ALL anchor positions use ISO date strings + price numbers.
 * Bar indices are NEVER used (bars shift when the data window changes).
 */

// ── UUID helper (crypto.randomUUID with fallback) ───────────────────────────

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ── Shared sub-types ─────────────────────────────────────────────────────────

export interface DrawingStyle {
  color: string;        // hex e.g. "#0ea5e9"
  lineWidth: number;    // 1 | 2 | 3
  dashed: boolean;
}

export interface PricePoint {
  date: string;   // ISO "YYYY-MM-DD"
  price: number;
}

// ── Drawing union discriminated by `kind` ────────────────────────────────────

export interface ChannelDrawing {
  kind: "channel";
  id: string;
  label: string;
  createdAt: string;    // ISO datetime
  visible: boolean;
  style: DrawingStyle;
  // upper & lower trendline, each with two anchor points
  upper: { start: PricePoint; end: PricePoint };
  lower: { start: PricePoint; end: PricePoint };
  source: "auto" | "manual";
}

export interface TrendlineDrawing {
  kind: "trendline";
  id: string;
  label: string;
  createdAt: string;
  visible: boolean;
  style: DrawingStyle;
  start: PricePoint;
  end: PricePoint;
}

export interface FibDrawing {
  kind: "fib";
  id: string;
  label: string;
  createdAt: string;
  visible: boolean;
  style: DrawingStyle;
  swingHigh: PricePoint;
  swingLow: PricePoint;
  /** Fib levels to draw, e.g. [0.236, 0.382, 0.5, 0.618, 0.786] */
  levels: number[];
  direction: "retracement" | "extension";
}

export interface SRDrawing {
  kind: "sr";
  id: string;
  label: string;
  createdAt: string;
  visible: boolean;
  style: DrawingStyle;
  price: number;
  /** Date the level was anchored from */
  anchorDate: string;   // ISO "YYYY-MM-DD"
  srType: "support" | "resistance" | "auto";
}

export interface PatternDrawing {
  kind: "pattern";
  id: string;
  label: string;
  createdAt: string;
  visible: boolean;
  style: DrawingStyle;
  /** Date range of the matched pattern window */
  start: PricePoint;
  end: PricePoint;
  patternName?: string;
  sourceModule?: string;   // e.g. "SimilarSetups" | "PatternScreener"
}

export type SavedDrawing =
  | ChannelDrawing
  | TrendlineDrawing
  | FibDrawing
  | SRDrawing
  | PatternDrawing;

export type DrawingKind = SavedDrawing["kind"];

// ── Storage key & helpers ────────────────────────────────────────────────────

const STORAGE_KEY = "reit-viz:saved-drawings:v1";

function load(): Record<string, SavedDrawing[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, SavedDrawing[]>;
  } catch {
    return {};
  }
}

function persist(store: Record<string, SavedDrawing[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error("[savedDrawings] Failed to persist:", e);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Return all drawings for a specific ticker, sorted createdAt descending. */
export function listForTicker(ticker: string): SavedDrawing[] {
  const store = load();
  const list = store[ticker.toUpperCase()] ?? [];
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Persist a new drawing for the given ticker.
 * Stamps `id` and `createdAt` if not already set.
 */
export function save(ticker: string, drawing: Omit<SavedDrawing, "id" | "createdAt"> & { id?: string; createdAt?: string }): SavedDrawing {
  const store = load();
  const key = ticker.toUpperCase();
  const now = new Date().toISOString();
  const complete: SavedDrawing = {
    ...drawing,
    id: drawing.id ?? generateId(),
    createdAt: drawing.createdAt ?? now,
  } as SavedDrawing;

  if (!Array.isArray(store[key])) store[key] = [];
  store[key].push(complete);
  persist(store);
  return complete;
}

/** Apply a partial update (patch) to a drawing identified by `id`. */
export function update(
  ticker: string,
  id: string,
  patch: Partial<Omit<SavedDrawing, "id" | "kind" | "createdAt">>,
): SavedDrawing | null {
  const store = load();
  const key = ticker.toUpperCase();
  const list = store[key] ?? [];
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...patch } as SavedDrawing;
  list[idx] = updated;
  store[key] = list;
  persist(store);
  return updated;
}

/** Delete a drawing by id. Returns true if found and deleted. */
export function deleteDrawing(ticker: string, id: string): boolean {
  const store = load();
  const key = ticker.toUpperCase();
  const list = store[key] ?? [];
  const next = list.filter((d) => d.id !== id);
  if (next.length === list.length) return false;
  store[key] = next;
  persist(store);
  return true;
}

/** Toggle the `visible` flag for a drawing. Returns the updated drawing or null. */
export function toggleVisibility(ticker: string, id: string): SavedDrawing | null {
  const store = load();
  const key = ticker.toUpperCase();
  const list = store[key] ?? [];
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], visible: !list[idx].visible } as SavedDrawing;
  list[idx] = updated;
  store[key] = list;
  persist(store);
  return updated;
}

/** Delete all drawings for a ticker. */
export function clearForTicker(ticker: string): void {
  const store = load();
  delete store[ticker.toUpperCase()];
  persist(store);
}

// ── Default style factory ────────────────────────────────────────────────────

export function defaultStyle(overrides?: Partial<DrawingStyle>): DrawingStyle {
  return {
    color: "#0ea5e9",
    lineWidth: 2,
    dashed: false,
    ...overrides,
  };
}

// ── Kind display helpers ─────────────────────────────────────────────────────

export const KIND_LABELS: Record<DrawingKind, string> = {
  channel: "Channel",
  trendline: "Trendline",
  fib: "Fibonacci",
  sr: "S/R Line",
  pattern: "Pattern",
};

export const KIND_COLORS: Record<DrawingKind, string> = {
  channel: "#a855f7",
  trendline: "#0ea5e9",
  fib: "#f59e0b",
  sr: "#22c55e",
  pattern: "#f97316",
};
