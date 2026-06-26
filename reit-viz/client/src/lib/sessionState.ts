// sessionStorage-backed useState hook — a drop-in twin of usePersistedState
// that survives tab switches / reloads within a session but resets when the
// browser session ends (and is not shared across tabs/windows or devices).

import { useState, useEffect, useCallback } from "react";

type SetStateAction<T> = T | ((prev: T) => T);

function readStorage<T>(key: string, initial: T): T {
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return initial;
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded — ignore silently
  }
}

export function useSessionState<T>(
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
