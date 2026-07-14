// Reconstructed from the production index chunk (component `aIe`) on 2026-06-17.
// Replaces the earlier "minimal placeholder" stub with a working basket editor:
// search/select tickers, name the basket, choose weighting + rebalance, and save
// via the (already functional) useBaskets hook. Used embedded in the Baskets page
// and as a popover elsewhere.

import { useState, useMemo, useCallback } from "react";
import { Search, X, Trash2, Plus, Check, GitMerge, Layers, ChevronDown, ChevronRight } from "lucide-react";
import { useBaskets, type Basket } from "@/lib/useBaskets";
import {
  FilterDropdown,
  emptyClassFilters,
  type ClassFilters,
} from "@/components/ClassificationFilters";

// Six FactSet/RBICS classification levels (broad → narrow) for bulk group-add.
type ClassKey = "economy" | "sector" | "subsector" | "industryGroup" | "industry" | "subindustry";
const CLASS_LEVELS: { key: ClassKey; label: string }[] = [
  { key: "economy", label: "Economy" },
  { key: "sector", label: "Sector" },
  { key: "subsector", label: "Subsector" },
  { key: "industryGroup", label: "Ind. Group" },
  { key: "industry", label: "Industry" },
  { key: "subindustry", label: "Subindustry" },
];

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
  economy?: string;
  sector?: string;
  subsector?: string;
  industryGroup?: string;
  industry?: string;
  subindustry?: string;
}

export interface BasketEditorPanelProps {
  /** Ticker universe to search/select from. */
  tickers?: TickerLike[];
  initialBasketId?: string | null;
  onClose?: () => void;
  hideClose?: boolean;
  embedded?: boolean;
  /** Hide the built-in saved-baskets list (e.g. when a richer manager renders it). */
  hideSavedList?: boolean;
  [key: string]: any;
}

export function BasketEditorPanel({
  tickers = [],
  onClose,
  hideClose = false,
  embedded = false,
  hideSavedList = false,
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

  // ---- Bulk add by classification group ----
  const [groupOpen, setGroupOpen] = useState(false);
  const [classFilters, setClassFilters] = useState<ClassFilters>(emptyClassFilters);

  // Distinct values per level from the loaded universe (single-value levels hidden).
  const classOptions = useMemo(() => {
    const sets: Record<ClassKey, Set<string>> = {
      economy: new Set(), sector: new Set(), subsector: new Set(),
      industryGroup: new Set(), industry: new Set(), subindustry: new Set(),
    };
    for (const t of tickers) {
      for (const { key } of CLASS_LEVELS) {
        const v = (t as any)[key];
        if (v) sets[key].add(v);
      }
    }
    const out = {} as Record<ClassKey, string[]>;
    for (const { key } of CLASS_LEVELS) out[key] = [...sets[key]].sort();
    return out;
  }, [tickers]);

  // Ticker count per group value, shown next to each option.
  const classCounts = useMemo(() => {
    const counts = {
      economy: {}, sector: {}, subsector: {},
      industryGroup: {}, industry: {}, subindustry: {},
    } as Record<ClassKey, Record<string, number>>;
    for (const t of tickers) {
      for (const { key } of CLASS_LEVELS) {
        const v = (t as any)[key];
        if (v) counts[key][v] = (counts[key][v] || 0) + 1;
      }
    }
    return counts;
  }, [tickers]);

  const anyClassSelected = useMemo(
    () => CLASS_LEVELS.some(({ key }) => classFilters[key].size > 0),
    [classFilters],
  );

  // UNION of every selected group across any level, minus already-selected tickers.
  const groupMatches = useMemo(() => {
    if (!anyClassSelected) return [] as string[];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of tickers) {
      let hit = false;
      for (const { key } of CLASS_LEVELS) {
        const sel = classFilters[key];
        if (sel.size > 0 && sel.has((t as any)[key])) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      const tk = t.ticker;
      if (!selectedSet.has(tk) && !seen.has(tk)) {
        seen.add(tk);
        out.push(tk);
      }
    }
    return out;
  }, [anyClassSelected, tickers, classFilters, selectedSet]);

  const addGroup = useCallback(() => {
    if (groupMatches.length === 0) return;
    setSelected((prev) => {
      const s = new Set(prev);
      const next = [...prev];
      for (const t of groupMatches) if (!s.has(t)) { s.add(t); next.push(t); }
      return next;
    });
  }, [groupMatches]);

  // Merge a saved basket's constituents into the working selection (union,
  // case-insensitive dedup, first-seen order preserved). Which tickers are new
  // is computed from the current selection up-front so the state updater stays
  // pure and the "added" count is reliable.
  const mergeInBasket = useCallback(
    (id: string) => {
      const b = baskets.find((x) => x.id === id);
      if (!b) return;
      const have = new Set(selected.map((t) => t.toUpperCase()));
      const toAdd: string[] = [];
      for (const t of b.tickers) {
        const up = t.toUpperCase();
        if (!have.has(up)) {
          have.add(up);
          toAdd.push(up);
        }
      }
      if (toAdd.length) setSelected((prev) => [...prev, ...toAdd]);
      setSavedMsg(
        toAdd.length > 0
          ? `Merged ${toAdd.length} ticker${toAdd.length === 1 ? "" : "s"} from "${b.name}"`
          : `All of "${b.name}" already selected`,
      );
      setTimeout(() => setSavedMsg(null), 3000);
    },
    [baskets, selected],
  );

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

      {/* Add many at once by classification group */}
      <div>
        <button
          type="button"
          onClick={() => setGroupOpen((o) => !o)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          data-testid="basket-editor-group-toggle"
        >
          {groupOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Layers className="w-3 h-3" />
          Add by group
        </button>
        {groupOpen && (
          <div className="mt-1.5 flex flex-col gap-2 rounded border border-border/60 bg-background/40 p-2">
            <div className="flex flex-wrap items-center gap-1">
              {CLASS_LEVELS.filter(
                ({ key }) => classOptions[key].length > 1 || classFilters[key].size > 0,
              ).map(({ key, label }) => (
                <FilterDropdown
                  key={key}
                  label={label}
                  options={classOptions[key]}
                  counts={classCounts[key]}
                  selected={classFilters[key]}
                  onChange={(next) => setClassFilters((f) => ({ ...f, [key]: next }))}
                  testId={`basket-editor-class-${key}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={groupMatches.length === 0}
                onClick={addGroup}
                className="flex items-center gap-1 rounded bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="basket-editor-add-group"
              >
                <Plus className="w-3 h-3" />
                Add {groupMatches.length} ticker{groupMatches.length === 1 ? "" : "s"}
              </button>
              <span className="text-[10px] text-muted-foreground">
                {anyClassSelected
                  ? `${groupMatches.length} new match${groupMatches.length === 1 ? "" : "es"}`
                  : "Pick one or more groups (multi-select) to add them all"}
              </span>
              {anyClassSelected && (
                <button
                  type="button"
                  onClick={() => setClassFilters(emptyClassFilters())}
                  className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                  data-testid="basket-editor-group-clear"
                >
                  <X className="w-2.5 h-2.5" />
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Merge in an existing saved basket's tickers */}
      {baskets.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground uppercase tracking-wider w-16 flex-shrink-0">
            <GitMerge className="w-3 h-3" />
            Merge in
          </label>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) mergeInBasket(e.target.value);
              e.target.value = "";
            }}
            className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-amber-500/50"
            data-testid="basket-editor-merge-select"
            title="Add a saved basket's tickers to this selection"
          >
            <option value="">Merge a saved basket's tickers…</option>
            {baskets.map((b: Basket) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.tickers.length})
              </option>
            ))}
          </select>
        </div>
      )}

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
      {!hideSavedList && baskets.length > 0 && (
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
