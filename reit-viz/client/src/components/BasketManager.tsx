// Saved-baskets manager for the Baskets page. Each saved basket is an
// expandable card exposing the full basket record: ticker list (add / remove),
// weighting scheme (with the derivation formula spelled out), rebalance, custom
// weights, vol lookback, and metadata — all editing live through
// useBaskets().updateBasket. An "Inspect" button opens BasketMetricInspector so
// the actual per-metric aggregation math is visible on this page too.

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Search,
  X,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  Sigma,
  Pencil,
  Check,
  Copy,
  GitMerge,
} from "lucide-react";
import { useBaskets, type Basket } from "@/lib/useBaskets";
import BulkAddByGroup from "./BulkAddByGroup";
import BasketMetricInspector, {
  type InspectableBasket,
} from "./BasketMetricInspector";

// The universe objects passed in (TickerMeta / GlobalRecord) carry the six
// FactSet/RBICS classification levels; declare them here so we can group by them.
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

// Plain-language derivation of each weighting scheme's per-constituent weight.
const WEIGHTING_FORMULA: Record<string, string> = {
  equal: "wᵢ = 1 / N  — every constituent carries an identical weight.",
  market_cap:
    "wᵢ = MktCapᵢ / Σ MktCap  — workbook 'Fund: Market Cap' (falls back to Enterprise Value); equal-weight if none resolve.",
  yahoo_cap:
    "wᵢ = YahooCapᵢ / Σ YahooCap  — current Yahoo market-cap snapshot; tickers with no cap are dropped.",
  fmp_cap_daily:
    "wᵢ = MktCapᵢ(t) / Σ MktCap(t)  — FMP historical daily market cap as of the snapshot date t.",
  inverse_vol:
    "wᵢ = (1/σᵢ) / Σ (1/σ)  — σᵢ = stdev of daily log-returns over the vol-lookback window.",
  price: "wᵢ = Pᵢ / Σ P  — latest close price of each constituent.",
  custom: "wᵢ = cᵢ / Σ c  — your custom raw weights, normalized to sum to 1.",
};

// Return `base`, or `base 2` / `base 3` / … if that name is already taken.
// addBasket upserts by name, so a fresh basket needs a non-colliding name to
// avoid silently overwriting an existing one.
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  let name = `${base} ${n}`;
  while (taken.has(name)) name = `${base} ${++n}`;
  return name;
}

function fmtDate(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

// ── One expandable basket card ────────────────────────────────────────────────
function BasketCard({
  basket,
  tickers,
  onInspect,
  selected,
  onToggleSelect,
}: {
  basket: Basket;
  tickers: TickerLike[];
  onInspect: (id: string) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const { baskets, updateBasket, deleteBasket, addBasket } = useBaskets();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(basket.name);

  // Keep the name draft in sync when the basket changes underneath us (unless
  // we're actively editing it).
  useEffect(() => {
    if (!editingName) setNameDraft(basket.name);
  }, [basket.name, editingName]);

  const selectedSet = useMemo(() => new Set(basket.tickers), [basket.tickers]);

  const matches = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return [] as TickerLike[];
    return tickers
      .filter((t) => {
        if (selectedSet.has(t.ticker.toUpperCase())) return false;
        return (
          t.ticker.toUpperCase().includes(q) ||
          (t.name ?? "").toUpperCase().includes(q)
        );
      })
      .slice(0, 10);
  }, [search, tickers, selectedSet]);

  const addTicker = useCallback(
    (t: string) => {
      const up = t.trim().toUpperCase();
      if (!up || basket.tickers.includes(up)) return;
      updateBasket(basket.id, { tickers: [...basket.tickers, up] });
      setSearch("");
    },
    [basket.id, basket.tickers, updateBasket],
  );

  // ---- Bulk add by classification group (shared BulkAddByGroup panel) ----
  const addGroupTickers = useCallback(
    (matched: string[]) => {
      updateBasket(basket.id, {
        tickers: [...new Set([...basket.tickers, ...matched])],
      });
    },
    [basket.id, basket.tickers, updateBasket],
  );

  const removeTicker = useCallback(
    (t: string) => {
      updateBasket(basket.id, {
        tickers: basket.tickers.filter((x) => x !== t),
      });
    },
    [basket.id, basket.tickers, updateBasket],
  );

  const commitName = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== basket.name) {
      updateBasket(basket.id, { name: trimmed });
    } else {
      setNameDraft(basket.name);
    }
    setEditingName(false);
  }, [nameDraft, basket.id, basket.name, updateBasket]);

  // Duplicate: new id + a non-colliding "(copy)" name, same tickers/config.
  // (addBasket upserts by name, so the name must be unique to avoid overwrite.)
  const duplicate = useCallback(() => {
    const names = new Set(baskets.map((b) => b.name));
    const name = uniqueName(`${basket.name} (copy)`, names);
    addBasket(name, [...basket.tickers], {
      weighting: basket.weighting,
      rebalance: basket.rebalance,
      customWeights: { ...basket.customWeights },
      volLookback: basket.volLookback,
    });
  }, [baskets, basket, addBasket]);

  const setWeighting = (weighting: string) =>
    updateBasket(basket.id, { weighting });
  const setRebalance = (rebalance: string) =>
    updateBasket(basket.id, { rebalance });
  const setVolLookback = (volLookback: number) =>
    updateBasket(basket.id, { volLookback });

  const setCustomWeight = (ticker: string, raw: number) => {
    const next = { ...basket.customWeights, [ticker]: raw };
    updateBasket(basket.id, { customWeights: next });
  };

  // Normalized custom-weight preview (mirrors the app's normalizeWeights).
  const customTotal = useMemo(() => {
    if (basket.weighting !== "custom") return 0;
    return basket.tickers.reduce(
      (acc, t) => acc + (basket.customWeights[t] ?? 1 / basket.tickers.length),
      0,
    );
  }, [basket.weighting, basket.tickers, basket.customWeights]);

  return (
    <div
      className={`rounded-md border bg-card ${
        selected ? "border-sky-500/70" : "border-border"
      }`}
      data-testid={`basket-card-${basket.id}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(basket.id)}
          className="flex-shrink-0 w-3.5 h-3.5 accent-sky-500 cursor-pointer"
          title="Select for merge"
          data-testid={`basket-select-${basket.id}`}
        />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
          title={expanded ? "Collapse" : "Expand"}
          data-testid={`basket-toggle-${basket.id}`}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setNameDraft(basket.name);
                setEditingName(false);
              }
            }}
            className="flex-1 min-w-0 text-xs font-medium bg-background border border-amber-500/50 rounded px-1.5 py-0.5 text-foreground focus:outline-none"
            data-testid={`basket-name-edit-${basket.id}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="flex-1 min-w-0 flex items-center gap-1 text-left group"
            title="Rename basket"
          >
            <span className="text-xs font-medium text-foreground truncate">
              {basket.name}
            </span>
            <Pencil className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
          </button>
        )}

        <span className="text-[9px] font-mono text-muted-foreground flex-shrink-0">
          {basket.tickers.length} · {basket.weighting} · {basket.rebalance}
        </span>

        <button
          type="button"
          onClick={() => onInspect(basket.id)}
          className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 flex-shrink-0"
          title="Inspect the metric math for this basket"
          data-testid={`basket-inspect-${basket.id}`}
        >
          <Sigma className="w-3 h-3" />
          Inspect
        </button>
        <button
          type="button"
          onClick={duplicate}
          className="text-muted-foreground hover:text-sky-300 flex-shrink-0"
          title={`Duplicate ${basket.name}`}
          data-testid={`basket-duplicate-${basket.id}`}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              typeof window !== "undefined" &&
              !window.confirm(`Delete basket "${basket.name}"?`)
            )
              return;
            deleteBasket(basket.id);
          }}
          className="text-rose-400 hover:text-rose-300 flex-shrink-0"
          title={`Delete ${basket.name}`}
          data-testid={`basket-delete-${basket.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border px-2 py-2 flex flex-col gap-3">
          {/* Tickers */}
          <div>
            <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              Tickers ({basket.tickers.length})
            </div>
            <div
              className="flex flex-wrap gap-1 min-h-[26px] p-1.5 bg-background/40 border border-border rounded"
              data-testid={`basket-tickers-${basket.id}`}
            >
              {basket.tickers.length === 0 ? (
                <span className="text-[10px] text-muted-foreground px-1 py-0.5">
                  No tickers. Add some below.
                </span>
              ) : (
                basket.tickers.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 text-[10px] font-mono bg-sky-500/15 border border-sky-500/40 text-sky-200 rounded px-1.5 py-0.5"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTicker(t)}
                      className="hover:text-rose-300"
                      title={`Remove ${t}`}
                      data-testid={`basket-${basket.id}-remove-${t}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))
              )}
            </div>
            {/* Add-ticker search */}
            <div className="relative mt-1.5">
              <div className="flex items-center gap-1.5 bg-background border border-border rounded px-2 py-1.5">
                <Search className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (matches.length > 0) addTicker(matches[0].ticker);
                      else if (search.trim()) addTicker(search);
                    }
                  }}
                  placeholder="Search or type a ticker to add…"
                  className="flex-1 bg-transparent text-xs font-mono text-foreground focus:outline-none"
                  data-testid={`basket-add-search-${basket.id}`}
                />
                {search.trim() && matches.length === 0 && (
                  <button
                    type="button"
                    onClick={() => addTicker(search)}
                    className="flex items-center gap-1 text-[10px] font-mono text-amber-300 hover:text-amber-200 flex-shrink-0"
                    title={`Add ${search.trim().toUpperCase()}`}
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                )}
              </div>
              {matches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded shadow-lg max-h-48 overflow-y-auto">
                  {matches.map((t) => (
                    <button
                      key={t.ticker}
                      type="button"
                      onClick={() => addTicker(t.ticker)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                      data-testid={`basket-${basket.id}-add-${t.ticker}`}
                    >
                      <Plus className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      <span className="font-mono font-medium">{t.ticker}</span>
                      {t.name && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {t.name}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Add many at once by classification group */}
            <BulkAddByGroup
              tickers={tickers}
              selectedSet={selectedSet}
              onAdd={addGroupTickers}
              testIdPrefix={`basket-${basket.id}`}
              geoStorageKey={`basket-geo-${basket.id}`}
              className="mt-1.5"
            />
          </div>

          {/* Weighting + rebalance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider w-16 flex-shrink-0">
                Weighting
              </label>
              <select
                value={basket.weighting}
                onChange={(e) => setWeighting(e.target.value)}
                className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-amber-500/50"
                data-testid={`basket-weighting-${basket.id}`}
              >
                {WEIGHTING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider w-16 flex-shrink-0">
                Rebalance
              </label>
              <select
                value={basket.rebalance}
                onChange={(e) => setRebalance(e.target.value)}
                className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-amber-500/50"
                data-testid={`basket-rebalance-${basket.id}`}
              >
                {REBALANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Weighting derivation formula */}
          <div className="text-[10px] font-mono bg-muted/40 border border-border rounded p-2 leading-relaxed">
            <span className="uppercase tracking-wider text-[9px] text-muted-foreground">
              Weight derivation
            </span>
            <div className="text-foreground mt-0.5">
              {WEIGHTING_FORMULA[basket.weighting] ?? "—"}
            </div>
          </div>

          {/* Inverse-vol lookback */}
          {basket.weighting === "inverse_vol" && (
            <div className="flex items-center gap-2">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider flex-shrink-0">
                Vol lookback (days)
              </label>
              <input
                type="number"
                min={2}
                max={504}
                value={basket.volLookback}
                onChange={(e) =>
                  setVolLookback(Math.max(2, Number(e.target.value) || 60))
                }
                className="w-24 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-amber-500/50"
                data-testid={`basket-vol-lookback-${basket.id}`}
              />
            </div>
          )}

          {/* Custom weights editor */}
          {basket.weighting === "custom" && basket.tickers.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Custom raw weights (normalized live)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {basket.tickers.map((t) => {
                  const raw =
                    basket.customWeights[t] ?? 1 / basket.tickers.length;
                  const pct = customTotal > 0 ? (raw / customTotal) * 100 : 0;
                  return (
                    <div
                      key={t}
                      className="flex items-center gap-1 bg-background/40 border border-border rounded px-1.5 py-1"
                    >
                      <span className="text-[10px] font-mono text-amber-300 w-12 flex-shrink-0 truncate">
                        {t}
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={Number.isFinite(raw) ? raw : 0}
                        onChange={(e) =>
                          setCustomWeight(t, Math.max(0, Number(e.target.value) || 0))
                        }
                        className="w-14 text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5 text-foreground focus:outline-none focus:border-amber-500/50"
                        data-testid={`basket-${basket.id}-cw-${t}`}
                      />
                      <span className="text-[9px] font-mono text-muted-foreground tabular-nums ml-auto">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[9px] font-mono text-muted-foreground border-t border-border/60 pt-2">
            <span>Created {fmtDate(basket.createdAt)}</span>
            <span>Updated {fmtDate(basket.updatedAt)}</span>
            <span className="truncate">id {basket.id}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manager (list of cards + shared inspector dialog) ─────────────────────────
export function BasketManager({ tickers }: { tickers: TickerLike[] }) {
  const { baskets, addBasket } = useBaskets();
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const inspectBasket = useMemo<InspectableBasket | null>(
    () =>
      (baskets.find((b) => b.id === inspectId) as
        | InspectableBasket
        | undefined) ?? null,
    [baskets, inspectId],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toUpperCase();
    if (!q) return baskets;
    return baskets.filter(
      (b) =>
        b.name.toUpperCase().includes(q) ||
        b.tickers.some((t) => t.includes(q)),
    );
  }, [baskets, filter]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Baskets selected for merge, in the order they appear in the list. The first
  // one supplies the weighting scheme / rebalance / vol-lookback for the merge.
  const selectedBaskets = useMemo(
    () => baskets.filter((b) => selectedIds.has(b.id)),
    [baskets, selectedIds],
  );

  // Merge: union the constituents of every selected basket (dedup, first-seen
  // order) into a brand-new basket, inheriting config from the first selection.
  const mergeSelected = useCallback(() => {
    if (selectedBaskets.length < 2) return;
    const seen = new Set<string>();
    const tickers: string[] = [];
    for (const b of selectedBaskets) {
      for (const t of b.tickers) {
        if (!seen.has(t)) {
          seen.add(t);
          tickers.push(t);
        }
      }
    }
    // First basket that defines a custom weight for a ticker wins.
    const customWeights: Record<string, number> = {};
    for (const b of selectedBaskets) {
      for (const [t, w] of Object.entries(b.customWeights)) {
        if (!(t in customWeights)) customWeights[t] = w;
      }
    }
    const first = selectedBaskets[0];
    const joined = selectedBaskets.map((b) => b.name).join(" + ");
    const base =
      joined.length <= 48
        ? `Merge: ${joined}`
        : `Merge of ${selectedBaskets.length} baskets`;
    const name = uniqueName(base, new Set(baskets.map((b) => b.name)));
    addBasket(name, tickers, {
      weighting: first.weighting,
      rebalance: first.rebalance,
      customWeights,
      volLookback: first.volLookback,
    });
    setSelectedIds(new Set());
  }, [selectedBaskets, baskets, addBasket]);

  const mergedTickerCount = useMemo(
    () => new Set(selectedBaskets.flatMap((b) => b.tickers)).size,
    [selectedBaskets],
  );

  return (
    <div data-testid="basket-manager">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
          Saved baskets ({baskets.length})
        </div>
        {baskets.length > 3 && (
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter baskets…"
            className="text-[10px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-amber-500/50 w-40"
            data-testid="basket-manager-filter"
          />
        )}
      </div>

      {/* Merge action bar — appears once at least one basket is selected. */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded border border-sky-500/50 bg-sky-500/10"
          data-testid="basket-merge-bar"
        >
          <span className="text-[10px] font-mono text-sky-200">
            {selectedIds.size} selected
            {selectedBaskets.length >= 2 && (
              <span className="text-sky-300/70">
                {" "}
                → {mergedTickerCount} unique tickers
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={mergeSelected}
            disabled={selectedBaskets.length < 2}
            className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-sky-500/50 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
            title={
              selectedBaskets.length < 2
                ? "Select at least two baskets to merge"
                : "Merge selected baskets into a new one (union of tickers)"
            }
            data-testid="basket-merge-button"
          >
            <GitMerge className="w-3 h-3" />
            Merge
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-muted-foreground hover:text-foreground"
            title="Clear selection"
            data-testid="basket-merge-clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {baskets.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          No saved baskets yet. Create one above and it will appear here with
          full details, weighting math, and per-metric inspection.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          No baskets match “{filter}”.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((b) => (
            <BasketCard
              key={b.id}
              basket={b}
              tickers={tickers}
              onInspect={setInspectId}
              selected={selectedIds.has(b.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      <BasketMetricInspector
        basket={inspectBasket}
        open={inspectId !== null}
        onClose={() => setInspectId(null)}
      />
    </div>
  );
}

export default BasketManager;
