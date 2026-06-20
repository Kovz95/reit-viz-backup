// Reconstructed from recovered-bundle/index-CsG73Aq_.js on 2026-06-17
import { useState, useEffect } from "react";

export interface PatternSettings {
  enabled: boolean;
  sensitivity: number;
  autoRescan: boolean;
  maxPatterns: number;
  lookbackBars: number;
  timeframe: "daily" | "weekly" | "both";
  showMostRelevant: boolean;
  perPattern?: Record<string, boolean>;
}

export interface RelevantPattern {
  id: string;
  label: string;
  direction: number;
  relevance: number;
  components: {
    confidence: number;
    recency: number;
    proximity: number;
  };
}

const STORAGE_KEY = "reit-viz.patterns.v1";

export function defaultPatternSettings(): PatternSettings {
  return {
    enabled: false,
    sensitivity: 60,
    autoRescan: true,
    maxPatterns: 12,
    lookbackBars: 0,
    timeframe: "daily",
    showMostRelevant: true,
  };
}

const subscribers = new Set<() => void>();

function loadStore(): Record<string, Partial<PatternSettings>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

let store: Record<string, Partial<PatternSettings>> = loadStore();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
  for (const fn of subscribers) fn();
}

export function getPatternSettings(paneId: number): PatternSettings {
  return {
    ...defaultPatternSettings(),
    ...(store[paneId] ?? {}),
  };
}

export function setPatternSettings(paneId: number, patch: Partial<PatternSettings>) {
  const prev = store[paneId] ?? defaultPatternSettings();
  store[paneId] = {
    ...prev,
    ...patch,
  };
  persist();
}

export function usePatternSettings(
  paneId: number,
): readonly [PatternSettings, (patch: Partial<PatternSettings>) => void] {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);
  return [
    getPatternSettings(paneId),
    (patch: Partial<PatternSettings>) => setPatternSettings(paneId, patch),
  ] as const;
}

export function notifyPatternsSettingsChanged(paneId: number) {
  try {
    window.dispatchEvent(
      new CustomEvent("reit-viz:patterns-settings-changed", {
        detail: { paneId },
      }),
    );
  } catch {}
}
