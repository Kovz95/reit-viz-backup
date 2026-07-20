// chartBridge — cross-page signal hand-off from PriceAction ("Show on chart")
// to the Charts page. Emitting caches the payload per ticker, notifies any
// live listeners, and jumps to Charts for that ticker; ChartArea subscribes
// and renders the cached signals as vertical lines on the price chart.

import { navigateToTicker } from "@/lib/navigateToTicker";

export interface ChartSignal {
  ticker?: string;
  date: string;
  value?: number;
  direction?: "up" | "down" | string;
  label?: string;
  type?: string;
  [key: string]: any;
}

export interface ChartSignalPayload {
  ticker: string;
  label?: string;
  signals: ChartSignal[];
}

type Listener = (payload: ChartSignalPayload) => void;

const listeners = new Set<Listener>();
const cache = new Map<string, ChartSignalPayload>();

// navigateToTicker sets location.href (full reload), which wipes module
// state — persist the hand-off through sessionStorage.
const storageKey = (ticker: string) => `reit-viz:chart-signals:${ticker}`;

function persist(payload: ChartSignalPayload): void {
  try { sessionStorage.setItem(storageKey(payload.ticker), JSON.stringify(payload)); } catch {}
}

function readPersisted(ticker: string): ChartSignalPayload | null {
  try {
    const raw = sessionStorage.getItem(storageKey(ticker));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.ticker && Array.isArray(parsed.signals) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Emit signals for a ticker and jump to the Charts page.
 * Accepts either a payload object ({ticker, label, signals}) — the
 * PriceAction call shape — or a bare ChartSignal[].
 */
export function emitChartSignals(input: ChartSignalPayload | ChartSignal[]): void {
  let payload: ChartSignalPayload | null = null;
  if (Array.isArray(input)) {
    const ticker = input.find((s) => s?.ticker)?.ticker;
    if (ticker) payload = { ticker: ticker.toUpperCase(), signals: input };
  } else if (input && typeof input === "object" && input.ticker) {
    payload = { ...input, ticker: input.ticker.toUpperCase() };
  }
  if (!payload || !Array.isArray(payload.signals)) return;

  cache.set(payload.ticker, payload);
  persist(payload);
  for (const l of listeners) {
    try { l(payload); } catch {}
  }
  navigateToTicker(payload.ticker);
}

/** Subscribe to chart signals. Returns an unsubscribe callback. */
export function onChartSignals(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read (without clearing) the cached signals for a ticker, if any. */
export function getChartSignals(ticker: string): ChartSignalPayload | null {
  const key = (ticker || "").toUpperCase();
  return cache.get(key) ?? readPersisted(key);
}

/** Remove the cached signals for a ticker (Charts calls this on dismiss). */
export function clearChartSignals(ticker: string): void {
  const key = (ticker || "").toUpperCase();
  cache.delete(key);
  try { sessionStorage.removeItem(storageKey(key)); } catch {}
}
