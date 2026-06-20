// Reconstructed from the production index chunk (component `aIe`) on 2026-06-17.
// Replaces the earlier "minimal placeholder" stub with a working basket editor:
// search/select tickers, name the basket, choose weighting + rebalance, and save
// via the (already functional) useBaskets hook. Used embedded in the Baskets page
// and as a popover elsewhere.

import { useState, useMemo, useCallback } from "react";
import { Search, X, Trash2, Plus, Check } from "lucide-react";
import { useBaskets, type Basket } from "@/lib/useBaskets";

// Faithful to the bundle's weighting/rebalance option sets + labels.
const WEIGHTING_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "equal", label: "Equal" },
  { value: "market_cap", label: "Market Cap (workbook)" },
  { value: "yahoo_cap", label: "Yahoo Cap (current snapshot)" },
  { value: "fmp_cap_daily", label: "Market Cap Daily (FMP)" },
  { value: "inverse_vol", label: "Inverse Vol" },
  { value: "price", label: "Price-Weighted" },
  { value: "custom", label: "Custom" },
];

const REBALANCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "None (drift)" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

interface TickerLike {
  ticker: string;
  name?: string;
}

export interface BasketEditorPanelProps {
  /** Ticker universe to search/select from. */
  tickers?: TickerLike[];
  initialBasketId?: string | null;
  onClose?: () => void;
  hideClose?: boolean;
  embedded?: boolean;
  [key: string]: any;
}

export function BasketEditorPanel({
  tickers = [],
  onClose,
  hideClose = false,
  embedded = false,
}: BasketEditorPanelProps) {
  const { baskets, addBasket, deleteBasket } = useBaskets();

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [weighting, setWeighting] = useState("equal");
  const [rebalance, setRebalance] = useState("none");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const matches = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return [] as TickerLike[];
    return tickers
      .filter((t) => {
        if (selectedSet.has(t.ticker)) return false;
        return t.ticker.toUpperCase().includes(q) || (t.name ?? "").toUpperCase().includes(q);
      })
      .slice(0, 12);
  }, [search, tickers, selectedSet]);

  const addTicker = useCallback((t: string) => {
    setSelected((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setSearch("");
  }, []);

  const removeTicker = useCallback((t: string) => {
    setSelected((prev) => prev.filter((x) => x !== t));
  }, []);

  const canSave = name.trim().length > 0 && selected.length > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const deduped = Array.from(new Set(selected.map((t) => t.toUpperCase())));
    addBasket(name, deduped, { weighting, rebalance });
    setSavedMsg(`Saved "${name.trim()}" (${deduped.length} tickers)`);
    setName("");
    setSelected([]);
    setSearch("");
    setTimeout(() => setSavedMsg(null), 3000);
  }, [canSave, selected, name, weighting, rebalance, addBasket]);

  return (
    <div
      className={
        embedded
          ? "flex flex-col gap-2 p-2"
          : "flex flex-col gap-2 p-3 bg-card border border-border rounded shadow-xl min-w-[320px] max-w-[460px]"
      }
      data-testid="basket-editor-panel"
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-semibold text-foreground">New basket</span>
        {!hideClose && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            data-testid="basket-editor-close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Name */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Basket name"
        className="text-xs font-mono bg-background border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:border-amber-500/50"
        data-testid="basket-name-input"
      />

      {/* Ticker search */}
      <div className="relative">
        <div className="flex items-center gap-1.5 bg-background border border-border rounded px-2 py-1.5">
          <Search className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches.length > 0) {
                e.preventDefault();
                addTicker(matches[0].ticker);
              }
            }}
            placeholder="Search tickers to add…"
            className="flex-1 bg-transparent text-xs font-mono text-foreground focus:outline-none"
            data-testid="basket-ticker-search"
          />
        </div>
        {matches.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded shadow-lg max-h-48 overflow-y-auto">
            {matches.map((t) => (
              <button
                key={t.ticker}
                type="button"
                onClick={() => addTicker(t.ticker)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                data-testid={`basket-search-result-${t.ticker}`}
              >
                <Plus className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span className="font-mono font-medium">{t.ticker}</span>
                {t.name && <span className="text-[10px] text-muted-foreground truncate">{t.name}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected tickers */}
      <div className="flex flex-wrap gap-1 min-h-[28px] p-1.5 bg-background/40 border border-border rounded" data-testid="basket-selected-tickers">
        {selected.length === 0 ? (
          <span className="text-[10px] text-muted-foreground px-1 py-0.5">No tickers selected.</span>
        ) : (
          selected.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 text-[10px] font-mono bg-sky-500/15 border border-sky-500/40 text-sky-200 rounded px-1.5 py-0.5"
            >
              {t}
              <button type="button" onClick={() => removeTicker(t)} className="hover:text-rose-300" data-testid={`basket-remove-${t}`}>
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Weighting + Rebalance */}
      <div className="flex items-center gap-2">
        <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider w-16 flex-shrink-0">Weighting</label>
        <select
          value={weighting}
          onChange={(e) => setWeighting(e.target.value)}
          className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-amber-500/50"
          data-testid="basket-editor-weighting"
        >
          {WEIGHTING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider w-16 flex-shrink-0">Rebalance</label>
        <select
          value={rebalance}
          onChange={(e) => setRebalance(e.target.value)}
          className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-amber-500/50"
          data-testid="basket-editor-rebalance"
        >
          {REBALANCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1.5 rounded border border-amber-500/60 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        data-testid="basket-save"
      >
        <Check className="w-3.5 h-3.5" />
        Save basket
      </button>
      {savedMsg && (
        <div className="text-[10px] text-emerald-400" data-testid="basket-saved-msg">{savedMsg}</div>
      )}

      {/* Saved baskets */}
      {baskets.length > 0 && (
        <div className="mt-1 border-t border-border pt-2">
          <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
            Saved baskets ({baskets.length})
          </div>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {baskets.map((b: Basket) => (
              <div
                key={b.id}
                className="flex items-center gap-2 text-[11px] px-2 py-1 rounded border border-border/50 bg-background/30"
                data-testid={`basket-row-${b.id}`}
              >
                <span className="font-medium truncate flex-1">{b.name}</span>
                <span className="text-[9px] text-muted-foreground">{b.tickers.length} · {b.weighting}</span>
                <button
                  type="button"
                  onClick={() => deleteBasket(b.id)}
                  className="text-rose-400 hover:text-rose-300"
                  title={`Delete ${b.name}`}
                  data-testid={`basket-delete-${b.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BasketEditorPanel;
