// usePairComboPicker: manages a "leg set" of tickers for pair-combo scope mode
// and renders the picker UI for it. Pairs are all N·(N-1)/2 combinations of
// the leg set (capped). Consumers read pairs as {a, b, label} (some also use
// {tickerA, tickerB}); both spellings are populated.

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { U as UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";

export interface TickerPair {
  tickerA: string;
  tickerB: string;
  a: string;
  b: string;
  label: string;
  id: string;
  kind?: string;
  [key: string]: any;
}

export interface PairComboPickerResult {
  /** Currently selected pairs (all combinations of the leg set). */
  pairs: TickerPair[];
  /** Total capped pair count (combinations). */
  cappedPairCount: number;
  /** Whether the pair list was capped. */
  capped: boolean;
  /** JSX element for the leg-set picker UI (rendered inline by the page). */
  ui: React.ReactNode | null;
  /** Serialize state for workspace persistence. */
  serialize: () => any;
  /** Restore state from serialized form. */
  hydrate: (s: any) => void;
  addPair: (a: string, b: string) => void;
  removePair: (idx: number) => void;
  clearPairs: () => void;
}

const MAX_PAIRS = 500;
const MAX_LEGS = 32; // 32·31/2 = 496 pairs, just under the cap
const EMPTY_PAIRS: TickerPair[] = [];

function normalizePair(a: string, b: string): TickerPair {
  const label = `${a}/${b}`;
  return { tickerA: a, tickerB: b, a, b, label, id: label, kind: "pair" };
}

function legsStorageKey(storageKey: string): string {
  return `reit-viz:pair-combo-legs:${storageKey}`;
}

function loadStoredLegs(storageKey?: string): string[] {
  if (!storageKey) return [];
  try {
    const raw = localStorage.getItem(legsStorageKey(storageKey));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Manages the ticker leg set for "pair combo" scope mode.
 *
 * @param tickers     Ticker universe offered in the add-leg picker.
 * @param active      When false, the hook returns empty state and no UI.
 * @param storageKey  Unique key for localStorage persistence of the leg set.
 */
export function usePairComboPicker(
  tickers: Array<{ ticker: string } | string> | null | undefined,
  active: boolean,
  storageKey?: string
): PairComboPickerResult {
  const [legs, setLegs] = useState<string[]>(() => loadStoredLegs(storageKey));
  // Explicit pairs added via addPair()/hydrate() take precedence over combos.
  const [manualPairs, setManualPairs] = useState<TickerPair[]>([]);
  // Remount key for the add-leg picker so its input clears after each add.
  const [pickerEpoch, setPickerEpoch] = useState(0);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(legsStorageKey(storageKey), JSON.stringify(legs));
    } catch {}
  }, [legs, storageKey]);

  const addLeg = useCallback((raw: string) => {
    const t = (raw || "").trim().toUpperCase();
    if (!t) return;
    setLegs((prev) =>
      prev.includes(t) || prev.length >= MAX_LEGS ? prev : [...prev, t]
    );
    setPickerEpoch((e) => e + 1);
  }, []);

  const removeLeg = useCallback((t: string) => {
    setLegs((prev) => prev.filter((x) => x !== t));
  }, []);

  const clearLegs = useCallback(() => {
    setLegs([]);
  }, []);

  const addPair = useCallback((a: string, b: string) => {
    const ua = (a || "").trim().toUpperCase();
    const ub = (b || "").trim().toUpperCase();
    if (!ua || !ub || ua === ub) return;
    setManualPairs((prev) =>
      prev.find((p) => p.tickerA === ua && p.tickerB === ub)
        ? prev
        : [...prev, normalizePair(ua, ub)]
    );
  }, []);

  const removePair = useCallback((idx: number) => {
    setManualPairs((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearPairs = useCallback(() => {
    setManualPairs([]);
    setLegs([]);
  }, []);

  const serialize = useCallback(
    () => ({ legs, pairs: manualPairs }),
    [legs, manualPairs]
  );
  const hydrate = useCallback((s: any) => {
    if (Array.isArray(s?.legs)) {
      setLegs(s.legs.filter((t: unknown) => typeof t === "string"));
    }
    if (Array.isArray(s?.pairs)) {
      setManualPairs(
        s.pairs
          .filter((p: any) => p && (p.tickerA || p.a) && (p.tickerB || p.b))
          .map((p: any) => normalizePair(p.tickerA ?? p.a, p.tickerB ?? p.b))
      );
    }
  }, []);

  // All combinations of the leg set.
  const legKey = legs.join("\0");
  const comboPairs = useMemo<TickerPair[]>(() => {
    if (!legKey) return EMPTY_PAIRS;
    const ts = legKey.split("\0");
    if (ts.length < 2) return EMPTY_PAIRS;
    const combos: TickerPair[] = [];
    for (let i = 0; i < ts.length && combos.length < MAX_PAIRS; i++) {
      for (let j = i + 1; j < ts.length && combos.length < MAX_PAIRS; j++) {
        combos.push(normalizePair(ts[i], ts[j]));
      }
    }
    return combos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legKey]);

  const effectivePairs = active
    ? manualPairs.length > 0
      ? manualPairs
      : comboPairs
    : EMPTY_PAIRS;
  const capped = effectivePairs.length >= MAX_PAIRS;
  const cappedPairCount = effectivePairs.length;

  // Normalize the offered universe for the picker.
  const pickerTickers = useMemo(
    () =>
      (tickers ?? [])
        .map((t) => (typeof t === "string" ? { ticker: t } : t))
        .filter((t) => t && typeof t.ticker === "string"),
    [tickers]
  );

  const testPrefix = storageKey || "pair-combo";

  const ui = useMemo(() => {
    if (!active) return null;
    return (
      <div className="flex flex-col gap-1.5" data-testid={`${testPrefix}-picker`}>
        <div className="flex items-end gap-2 flex-wrap">
          <UnifiedTickerPicker
            key={pickerEpoch}
            tickers={pickerTickers}
            value=""
            onChange={addLeg}
            label="Add leg"
            placeholder="Add ticker to leg set…"
          />
          {legs.length > 0 && (
            <button
              onClick={clearLegs}
              className="text-[10px] font-mono px-2 py-1 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent"
              data-testid={`${testPrefix}-clear-legs`}
            >
              Clear
            </button>
          )}
          <span className="text-[10px] text-muted-foreground font-mono pb-1">
            {legs.length} leg{legs.length === 1 ? "" : "s"} →{" "}
            {cappedPairCount} pair{cappedPairCount === 1 ? "" : "s"}
            {capped ? " (capped)" : ""}
            {legs.length >= MAX_LEGS ? ` · max ${MAX_LEGS} legs` : ""}
          </span>
        </div>
        {legs.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {legs.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300"
                data-testid={`${testPrefix}-leg-${t}`}
              >
                {t}
                <button
                  onClick={() => removeLeg(t)}
                  className="hover:text-foreground"
                  title={`Remove ${t} from leg set`}
                  data-testid={`${testPrefix}-leg-remove-${t}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        {legs.length === 1 && (
          <span className="text-[10px] font-mono text-muted-foreground/70">
            Add at least 2 legs to form pairs.
          </span>
        )}
      </div>
    );
  }, [active, testPrefix, pickerEpoch, pickerTickers, addLeg, clearLegs, legs, cappedPairCount, capped, removeLeg]);

  // Stable return identity: only changes when its contents actually change.
  return useMemo(
    () => ({
      pairs: effectivePairs,
      cappedPairCount,
      capped,
      ui,
      serialize,
      hydrate,
      addPair,
      removePair,
      clearPairs,
    }),
    [effectivePairs, cappedPairCount, capped, ui, serialize, hydrate, addPair, removePair, clearPairs]
  );
}

// Named export alias for destructured import `{ u as usePairComboPicker }`
export { usePairComboPicker as u };
