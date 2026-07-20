/**
 * Shared "scope to a basket" control for universe-scoped pages.
 *
 * `useBasketScope(storageKey?)` owns the selected-basket state (optionally
 * persisted per page in localStorage) and resolves it to a member set;
 * `<BasketScopeSelect scope={...} />` renders the compact picker. Pages apply
 * the scope at their existing ticker-filter choke point via `scope.inScope(tk)`
 * (a no-op when no basket is selected), on top of the app-wide universe filter.
 */
import { useCallback, useMemo, useState } from "react";
import { useBaskets, type Basket } from "@/lib/useBaskets";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export interface BasketScope {
  baskets: Basket[];
  basketId: string;
  setBasketId: (id: string) => void;
  /** Name of the active basket, or null when unscoped. */
  basketName: string | null;
  /** Upper-cased member set of the active basket, or null when unscoped. */
  members: Set<string> | null;
  /** True when the ticker passes the scope (always true with no basket). */
  inScope: (ticker: string) => boolean;
}

export function useBasketScope(storageKey?: string): BasketScope {
  const { baskets, getBasket } = useBaskets();
  const [basketId, setBasketIdState] = useState<string>(() => {
    if (!storageKey || typeof window === "undefined") return "";
    try { return window.localStorage.getItem(storageKey) || ""; } catch { return ""; }
  });

  const setBasketId = useCallback((id: string) => {
    setBasketIdState(id);
    if (storageKey && typeof window !== "undefined") {
      try {
        if (id) window.localStorage.setItem(storageKey, id);
        else window.localStorage.removeItem(storageKey);
      } catch { /* quota/priv-mode — selection just won't persist */ }
    }
  }, [storageKey]);

  const active = basketId ? getBasket(basketId) : undefined;
  const members = useMemo(
    () => active ? new Set(active.tickers.map((t) => t.toUpperCase())) : null,
    // getBasket reads the module cache; re-resolve when the basket list changes.
    [active?.id, active?.updatedAt, baskets],
  );

  const inScope = useCallback(
    (ticker: string) => !members || members.has(ticker.toUpperCase()),
    [members],
  );

  return {
    baskets,
    basketId,
    setBasketId,
    basketName: active?.name ?? null,
    members,
    inScope,
  };
}

export function BasketScopeSelect({
  scope, className, allLabel = "All tickers",
}: {
  scope: BasketScope;
  className?: string;
  allLabel?: string;
}) {
  return (
    <Select
      value={scope.basketId || ALL}
      onValueChange={(v) => scope.setBasketId(v === ALL ? "" : v)}
    >
      <SelectTrigger
        className={className ?? "h-7 w-[150px] text-xs"}
        data-testid="basket-scope-select"
      >
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-xs">{allLabel}</SelectItem>
        {scope.baskets.map((b) => (
          <SelectItem key={b.id} value={b.id} className="text-xs">
            🧺 {b.name} ({b.tickers.length})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
