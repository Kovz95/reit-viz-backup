// Stub — TODO: reverse-engineer from production bundle
import { useState } from "react";

export interface AppStatus {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
}

export function useAppStatus(): AppStatus {
  return { isLoading: false, isReady: true, error: null };
}
