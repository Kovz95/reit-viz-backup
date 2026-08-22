import { useCallback, useMemo } from "react";
import { usePersistedState } from "@/lib/persistedState";

/**
 * Collapsible-group state for tables that render repeating group-header rows
 * (buckets, sectors, classifications, …). Collapsed group keys persist per
 * page in localStorage; keys must be stable across renders (e.g. "sec:Office",
 * "tier:0"). Pattern origin: /liquidity-capacity bucket table.
 */
export function useCollapsedGroups(storageKey: string) {
  const [keys, setKeys] = usePersistedState<string[]>(storageKey, []);
  const collapsed = useMemo(() => new Set(keys), [keys]);
  const toggle = useCallback(
    (key: string) => setKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])),
    [setKeys],
  );
  /** Collapse every listed group, or expand all if all are already collapsed. */
  const toggleAll = useCallback(
    (groupKeys: string[]) =>
      setKeys((prev) => (groupKeys.length > 0 && groupKeys.every((k) => prev.includes(k)) ? [] : groupKeys)),
    [setKeys],
  );
  const isCollapsed = useCallback((key: string) => collapsed.has(key), [collapsed]);
  const allCollapsed = useCallback(
    (groupKeys: string[]) => groupKeys.length > 0 && groupKeys.every((k) => collapsed.has(k)),
    [collapsed],
  );
  return { collapsed, isCollapsed, toggle, toggleAll, allCollapsed };
}
