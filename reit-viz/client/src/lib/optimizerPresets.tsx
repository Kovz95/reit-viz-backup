// Hand-written from call-site inference (PresetBar.tsx) and production bundle (index-CsG73Aq_.js)
// Storage: per-kind keys "reit-viz:optimizer-presets:v1:<kind>"
// Context provider pattern matches bundle's vHe/nXe pattern.

import { useState, useCallback, useContext, createContext, useEffect } from "react";
import type { ReactNode } from "react";

// All optimizer kinds present in production — must include the recently-deployed additions.
export type OptimizerKind =
  | "ma-crossover"
  | "roc"
  | "slowstoch"
  | "zscore"
  | "momentum"
  | "rsi-regime"
  | "dualma"
  | "tva"
  | "oscillators"
  | "harsi"
  | "combo"
  | "range"
  | "pair"
  // Internal bundle aliases (kept for compat with the store keys used in production)
  | "ma"
  | "osc";

// Keys used in the unified store (bundle uses short aliases: "ma", "osc", etc.)
const STORE_KEYS: string[] = [
  "roc",
  "ma",
  "combo",
  "osc",
  "range",
  "harsi",
  "slowstoch",
  "zscore",
  "momentum",
  "rsi-regime",
  "dualma",
  "tva",
];

export interface Preset {
  id: string;
  optimizer: string;
  name: string;
  inputs: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type PresetStore = Record<string, Preset[]>;

// EMPTY_STORE maps every known kind to []
export const EMPTY_STORE: PresetStore = Object.fromEntries(
  STORE_KEYS.map((k) => [k, []])
);

export interface UseOptimizerPresetsReturn {
  presets: Preset[];
  addPreset: (name: string, inputs: Record<string, unknown>) => Preset;
  updatePreset: (id: string, patch: Partial<Pick<Preset, "name" | "inputs">>) => void;
  deletePreset: (id: string) => void;
  getPreset: (id: string) => Preset | undefined;
}

// ── helpers ────────────────────────────────────────────────────────────────

function createPreset(optimizer: string, name: string, inputs: Record<string, unknown>): Preset {
  const now = Date.now();
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `preset-${now}-${Math.random().toString(36).slice(2)}`,
    optimizer,
    name: name.trim(),
    inputs,
    createdAt: now,
    updatedAt: now,
  };
}

function patchPreset(preset: Preset, patch: Partial<Pick<Preset, "name" | "inputs">>): Preset {
  return {
    ...preset,
    name: patch.name !== undefined ? patch.name.trim() : preset.name,
    inputs: patch.inputs !== undefined ? patch.inputs : preset.inputs,
    updatedAt: Date.now(),
  };
}

function storageKey(kind: string): string {
  return `reit-viz:optimizer-presets:v1:${kind}`;
}

function loadStore(): PresetStore {
  if (typeof window === "undefined") return { ...EMPTY_STORE };
  const store: PresetStore = { ...EMPTY_STORE };
  for (const key of STORE_KEYS) {
    try {
      const raw = window.localStorage.getItem(storageKey(key));
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;
      store[key] = parsed.filter(
        (p): p is Preset =>
          p != null &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          typeof p.inputs === "object" &&
          p.inputs !== null
      );
    } catch {
      // ignore malformed entry
    }
  }
  return store;
}

function saveKind(kind: string, presets: Preset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(kind), JSON.stringify(presets));
    window.dispatchEvent(new CustomEvent("reit-viz:optimizer-presets:changed", { detail: { kind } }));
  } catch {
    // ignore
  }
}

// ── Context ────────────────────────────────────────────────────────────────

interface OptimizerPresetsContextValue {
  store: PresetStore;
  addPreset: (kind: string, name: string, inputs: Record<string, unknown>) => Preset;
  updatePreset: (id: string, patch: Partial<Pick<Preset, "name" | "inputs">>) => void;
  deletePreset: (id: string) => void;
  getPreset: (id: string) => Preset | undefined;
}

const OptimizerPresetsContext = createContext<OptimizerPresetsContextValue>({
  store: EMPTY_STORE,
  addPreset: (kind, name, inputs) => createPreset(kind, name, inputs),
  updatePreset: () => {},
  deletePreset: () => {},
  getPreset: () => undefined,
});

// ── Provider ───────────────────────────────────────────────────────────────

export function OptimizerPresetsProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<PresetStore>(() => loadStore());

  // Sync across tabs and multiple consumers
  useEffect(() => {
    function handleChange() {
      setStore(loadStore());
    }
    function handleStorage(e: StorageEvent) {
      if (e.key && e.key.startsWith("reit-viz:optimizer-presets:v1:")) {
        setStore(loadStore());
      }
    }
    window.addEventListener("reit-viz:optimizer-presets:changed", handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("reit-viz:optimizer-presets:changed", handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Deduplicate name within a kind, appending " (N)" if needed
  const uniqueName = useCallback(
    (kind: string, name: string, excludeId?: string): string => {
      const existing = (store[kind] ?? [])
        .filter((p) => p.id !== excludeId)
        .map((p) => p.name);
      if (!existing.includes(name)) return name;
      let n = 2;
      while (existing.includes(`${name} (${n})`)) n++;
      return `${name} (${n})`;
    },
    [store]
  );

  const addPreset = useCallback(
    (kind: string, name: string, inputs: Record<string, unknown>): Preset => {
      const deduped = uniqueName(kind, name.trim());
      const preset = createPreset(kind, deduped, inputs);
      setStore((prev) => {
        const kindPresets = [...(prev[kind] ?? []), preset].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        saveKind(kind, kindPresets);
        return { ...prev, [kind]: kindPresets };
      });
      return preset;
    },
    [uniqueName]
  );

  const updatePreset = useCallback(
    (id: string, patch: Partial<Pick<Preset, "name" | "inputs">>): void => {
      setStore((prev) => {
        const next = { ...prev };
        for (const key of STORE_KEYS) {
          const idx = prev[key]?.findIndex((p) => p.id === id) ?? -1;
          if (idx !== -1) {
            const arr = [...prev[key]];
            let name = patch.name !== undefined ? patch.name.trim() : arr[idx].name;
            if (patch.name !== undefined) {
              const others = arr.filter((p) => p.id !== id).map((p) => p.name);
              if (others.includes(name)) {
                let n = 2;
                while (others.includes(`${name} (${n})`)) n++;
                name = `${name} (${n})`;
              }
            }
            arr[idx] = patchPreset(arr[idx], { ...patch, name });
            const sorted = arr.sort((a, b) => a.name.localeCompare(b.name));
            saveKind(key, sorted);
            next[key] = sorted;
            break;
          }
        }
        return next;
      });
    },
    []
  );

  const deletePreset = useCallback((id: string): void => {
    setStore((prev) => {
      const next = { ...prev };
      for (const key of STORE_KEYS) {
        if (prev[key]?.some((p) => p.id === id)) {
          const filtered = prev[key].filter((p) => p.id !== id);
          saveKind(key, filtered);
          next[key] = filtered;
          break;
        }
      }
      return next;
    });
  }, []);

  const getPreset = useCallback(
    (id: string): Preset | undefined => {
      for (const key of STORE_KEYS) {
        const found = store[key]?.find((p) => p.id === id);
        if (found) return found;
      }
      return undefined;
    },
    [store]
  );

  return (
    <OptimizerPresetsContext.Provider
      value={{ store, addPreset, updatePreset, deletePreset, getPreset }}
    >
      {children}
    </OptimizerPresetsContext.Provider>
  );
}

// ── Per-kind hook (primary public API used by PresetBar) ───────────────────

export function useOptimizerPresets(kind: string): UseOptimizerPresetsReturn {
  const ctx = useContext(OptimizerPresetsContext);
  const presets = ctx.store[kind] ?? [];

  const addPreset = useCallback(
    (name: string, inputs: Record<string, unknown>): Preset => ctx.addPreset(kind, name, inputs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, kind]
  );

  const updatePreset = useCallback(
    (id: string, patch: Partial<Pick<Preset, "name" | "inputs">>): void =>
      ctx.updatePreset(id, patch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx]
  );

  const deletePreset = useCallback(
    (id: string): void => ctx.deletePreset(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx]
  );

  const getPreset = useCallback(
    (id: string): Preset | undefined => ctx.getPreset(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx]
  );

  return { presets, addPreset, updatePreset, deletePreset, getPreset };
}
