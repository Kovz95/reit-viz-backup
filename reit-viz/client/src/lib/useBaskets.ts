// Hand-written from call-site inference (BasketTickerPill.tsx, BasketPicker.tsx)
// Storage key: "reit-viz:baskets:v1"
// Uses localStorage with storage-event broadcast for cross-consumer sync.

import { useState, useEffect, useCallback } from "react";

export interface Basket {
  id: string;
  name: string;
  tickers: string[];
  createdAt: number;
  updatedAt: number;
  weighting: string;
  rebalance: string;
  customWeights: Record<string, number>;
  volLookback: number;
}

export interface BasketOptions {
  weighting?: string;
  rebalance?: string;
  customWeights?: Record<string, number>;
  volLookback?: number;
}

export interface UseBasketsReturn {
  baskets: Basket[];
  addBasket: (name: string, tickers: string[], options?: BasketOptions) => Basket;
  updateBasket: (id: string, patch: Partial<Pick<Basket, "name" | "tickers" | "weighting" | "rebalance" | "customWeights" | "volLookback">>) => void;
  deleteBasket: (id: string) => void;
  getBasket: (id: string) => Basket | undefined;
}

const STORAGE_KEY = "reit-viz:baskets:v1";
const CHANGE_EVENT = "reit-viz:baskets:changed";

function createBasket(name: string, tickers: string[], options?: BasketOptions): Basket {
  const now = Date.now();
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `basket-${now}-${Math.random().toString(36).slice(2)}`,
    name: name.trim(),
    tickers: tickers.map((t) => t.toUpperCase()),
    createdAt: now,
    updatedAt: now,
    weighting: options?.weighting ?? "market_cap",
    rebalance: options?.rebalance ?? "monthly",
    customWeights: options?.customWeights ?? {},
    volLookback: options?.volLookback ?? 60,
  };
}

function loadBaskets(): Basket[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is Basket =>
        b != null &&
        typeof b.id === "string" &&
        typeof b.name === "string" &&
        Array.isArray(b.tickers)
    );
  } catch {
    return [];
  }
}

function saveBaskets(baskets: Basket[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(baskets));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // storage quota or SSR — ignore
  }
}

export function useBaskets(): UseBasketsReturn {
  const [baskets, setBaskets] = useState<Basket[]>(() => loadBaskets());

  // Sync with other tabs and consumers via storage event + custom event
  useEffect(() => {
    function handleChange() {
      setBaskets(loadBaskets());
    }
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setBaskets(loadBaskets());
      }
    }
    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const addBasket = useCallback(
    (name: string, tickers: string[], options?: BasketOptions): Basket => {
      const trimmed = name.trim();
      let newBasket: Basket | null = null;
      setBaskets((prev) => {
        const existing = prev.find((b) => b.name === trimmed);
        if (existing) {
          // Overwrite tickers on same-name basket (matches production behaviour)
          const updated: Basket = {
            ...existing,
            tickers: tickers.map((t) => t.toUpperCase()),
            weighting: options?.weighting ?? existing.weighting,
            rebalance: options?.rebalance ?? existing.rebalance,
            customWeights: options?.customWeights ?? existing.customWeights,
            volLookback: options?.volLookback ?? existing.volLookback,
            updatedAt: Date.now(),
          };
          newBasket = updated;
          const next = prev
            .map((b) => (b.id === existing.id ? updated : b))
            .sort((a, b) => a.name.localeCompare(b.name));
          saveBaskets(next);
          return next;
        }
        const basket = createBasket(name, tickers, options);
        newBasket = basket;
        const next = [...prev, basket].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        saveBaskets(next);
        return next;
      });
      // Return synchronously — newBasket is set during the setState reducer
      return newBasket ?? createBasket(name, tickers, options);
    },
    []
  );

  const updateBasket = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<Basket, "name" | "tickers" | "weighting" | "rebalance" | "customWeights" | "volLookback">
      >
    ): void => {
      setBaskets((prev) => {
        const next = prev
          .map((b) => {
            if (b.id !== id) return b;
            return {
              ...b,
              name: patch.name !== undefined ? patch.name.trim() : b.name,
              tickers:
                patch.tickers !== undefined
                  ? patch.tickers.map((t) => t.toUpperCase())
                  : b.tickers,
              weighting: patch.weighting !== undefined ? patch.weighting : b.weighting,
              rebalance: patch.rebalance !== undefined ? patch.rebalance : b.rebalance,
              customWeights:
                patch.customWeights !== undefined ? patch.customWeights : b.customWeights,
              volLookback:
                patch.volLookback !== undefined ? patch.volLookback : b.volLookback,
              updatedAt: Date.now(),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        saveBaskets(next);
        return next;
      });
    },
    []
  );

  const deleteBasket = useCallback((id: string): void => {
    setBaskets((prev) => {
      const next = prev.filter((b) => b.id !== id);
      saveBaskets(next);
      return next;
    });
  }, []);

  const getBasket = useCallback(
    (id: string): Basket | undefined => {
      return baskets.find((b) => b.id === id);
    },
    [baskets]
  );

  return { baskets, addBasket, updateBasket, deleteBasket, getBasket };
}
