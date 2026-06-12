// Hand-written from call-site inference
// localStorage-backed useState hook. Used across optimizer pages.

import { useState, useEffect, useCallback } from "react";

type SetStateAction<T> = T | ((prev: T) => T);

function readStorage<T>(key: string, initial: T): T {
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return initial;
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded — ignore silently
  }
}

export function usePersistedState<T>(
  key: string,
  initial: T
): [T, (next: SetStateAction<T>) => void] {
  const [state, setState] = useState<T>(() => readStorage<T>(key, initial));

  useEffect(() => {
    writeStorage(key, state);
  }, [key, state]);

  const set = useCallback(
    (next: SetStateAction<T>) => {
      setState((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeStorage(key, resolved);
        return resolved;
      });
    },
    [key]
  );

  return [state, set];
}
