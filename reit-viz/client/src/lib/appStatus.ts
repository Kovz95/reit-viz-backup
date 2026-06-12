// Stub — TODO: reverse-engineer from production bundle
import { useState } from "react";

export interface AppStatus {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  setLastQuoteFetchedAt: (ts: number) => void;
  [key: string]: any;
}

export function useAppStatus(): AppStatus {
  const [, setLastQuoteFetchedAt_] = useState<number | null>(null);
  return {
    isLoading: false,
    isReady: true,
    error: null,
    setLastQuoteFetchedAt: (ts: number) => setLastQuoteFetchedAt_(ts),
  };
}
