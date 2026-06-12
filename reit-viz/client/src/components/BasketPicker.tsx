// Reconstructed from recovered-bundle/BasketPicker-DkcKAXfe.js on 2025-01-31

import { useState, useEffect, useRef, useMemo } from "react";
import { useBaskets } from "@/lib/useBaskets";
import { FolderOpen, Save, X, Check, Trash2 } from "lucide-react";
import { dedupeUpperTickers } from "@/lib/basketUtils";

interface TickerEntry {
  ticker: string;
  name?: string;
}

interface BasketPickerProps {
  tickers: TickerEntry[];
  value: string[];
  onChange: (tickers: string[]) => void;
  disabled?: boolean;
  label?: string;
  maxTickers?: number;
  testIdPrefix?: string;
}

function BasketPicker({
  tickers,
  value,
  onChange,
  disabled,
  label = "Basket",
  maxTickers = 50,
  testIdPrefix = "basket",
}: BasketPickerProps) {
  const [inputValue, setInputValue] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [panelMode, setPanelMode] = useState<"save" | "load" | null>(null);
  const [basketName, setBasketName] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { baskets, addBasket, updateBasket, deleteBasket } = useBaskets();
  const sortedBaskets = useMemo(
    () => [...baskets].sort((a, b) => b.updatedAt - a.updatedAt),
    [baskets]
  );

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setPanelMode(null);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const filteredTickers = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    const currentSet = new Set(value.map((t) => t.toUpperCase()));
    if (!query) return tickers.filter((t) => !currentSet.has(t.ticker.toUpperCase())).slice(0, 50);
    const ranked: { t: TickerEntry; rank: number }[] = [];
    for (const t of tickers) {
      if (currentSet.has(t.ticker.toUpperCase())) continue;
      const tickerLower = t.ticker.toLowerCase();
      const nameLower = (t.name || "").toLowerCase();
      let rank = -1;
      if (tickerLower === query) rank = 0;
      else if (tickerLower.startsWith(query)) rank = 1;
      else if (tickerLower.includes(query)) rank = 2;
      else if (nameLower.includes(query)) rank = 3;
      if (rank >= 0) ranked.push({ t, rank });
    }
    ranked.sort((a, b) => a.rank - b.rank || a.t.ticker.localeCompare(b.t.ticker));
    return ranked.slice(0, 50).map((r) => r.t);
  }, [tickers, inputValue, value]);

  const addSingleTicker = (raw: string) => {
    const normalized = raw.trim().toUpperCase();
    if (!normalized) return;
    if (value.length >= maxTickers) return;
    if (value.some((t) => t.toUpperCase() === normalized)) return;
    onChange([...value, normalized]);
  };

  const addMultipleTickers = (raw: string) => {
    const parts = raw.split(/[\s,;\n\t]+/).map((t) => t.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const merged = dedupeUpperTickers([...value, ...parts]).slice(0, maxTickers);
    onChange(merged);
  };

  const removeTicker = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const commitInput = (raw: string) => {
    if (/[\s,;]/.test(raw)) {
      addMultipleTickers(raw);
    } else {
      addSingleTicker(raw);
    }
    setInputValue("");
    setHighlightIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setDropdownOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, Math.max(filteredTickers.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (
      e.key === "Enter" ||
      e.key === "Tab" ||
      e.key === "," ||
      e.key === " "
    ) {
      if (!inputValue.trim()) return e.key === "Tab", void 0;
      e.preventDefault();
      dropdownOpen && filteredTickers[highlightIndex]
        ? commitInput(filteredTickers[highlightIndex].ticker)
        : commitInput(inputValue);
    } else if (e.key === "Backspace" && !inputValue) {
      if (value.length > 0) onChange(value.slice(0, -1));
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text && /[\s,;\n\t]/.test(text)) {
      e.preventDefault();
      addMultipleTickers(text);
      setInputValue("");
    }
  };

  const handleSaveBasket = () => {
    const name = basketName.trim();
    if (!name || value.length === 0) return;
    const deduped = dedupeUpperTickers(value);
    const existing = baskets.find((b: any) => b.name === name);
    if (existing) {
      updateBasket(existing.id, { tickers: deduped });
    } else {
      addBasket(name, deduped, { weighting: "equal", rebalance: "none" });
    }
    setBasketName("");
    setPanelMode(null);
  };

  const handleLoadBasket = (id: string) => {
    const basket = sortedBaskets.find((b) => b.id === id);
    if (basket) {
      onChange(dedupeUpperTickers(basket.tickers).slice(0, maxTickers));
      setPanelMode(null);
    }
  };

  const isInUniverse = (ticker: string) =>
    tickers.some((t) => t.ticker.toUpperCase() === ticker.toUpperCase());

  return (
    <div ref={containerRef} className="flex flex-col gap-0.5 relative">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
          {label}{" "}
          <span className="opacity-60">
            ({value.length}/{maxTickers})
          </span>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="text-[9px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-1 py-0.5 flex items-center gap-1"
            onClick={() => setPanelMode((prev) => (prev === "load" ? null : "load"))}
            disabled={disabled}
            data-testid={`${testIdPrefix}-load-btn`}
            title="Load a saved basket"
          >
            <FolderOpen className="h-3 w-3" /> Load
          </button>
          <button
            type="button"
            className="text-[9px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-1 py-0.5 flex items-center gap-1"
            onClick={() => setPanelMode((prev) => (prev === "save" ? null : "save"))}
            disabled={disabled || value.length === 0}
            data-testid={`${testIdPrefix}-save-btn`}
            title="Save current basket"
          >
            <Save className="h-3 w-3" /> Save
          </button>
          {value.length > 0 && (
            <button
              type="button"
              className="text-[9px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-1 py-0.5"
              onClick={() => onChange([])}
              disabled={disabled}
              data-testid={`${testIdPrefix}-clear-btn`}
              title="Clear basket"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 min-w-[420px] max-w-[760px] border border-border rounded px-1.5 py-1 bg-background">
        {value.map((ticker, idx) => {
          const inUniverse = isInUniverse(ticker);
          return (
            <span
              key={`${ticker}-${idx}`}
              className={`inline-flex items-center gap-1 text-[10px] font-mono rounded px-1.5 py-0.5 ${inUniverse ? "bg-blue-500/15 text-blue-700 dark:text-blue-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}
              data-testid={`${testIdPrefix}-chip-${ticker}`}
              title={
                inUniverse
                  ? "Workbook ticker (data still fetched from Yahoo)"
                  : "Yahoo symbol"
              }
            >
              <span className="font-bold">{ticker}</span>
              <button
                type="button"
                onClick={() => removeTicker(idx)}
                disabled={disabled}
                className="hover:opacity-80"
                aria-label={`Remove ${ticker}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          placeholder={value.length === 0 ? "Type a ticker, press Enter…" : "Add another…"}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value.toUpperCase());
            setDropdownOpen(true);
            setHighlightIndex(0);
          }}
          onFocus={() => setDropdownOpen(true)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || value.length >= maxTickers}
          className="text-[11px] font-mono bg-transparent flex-1 min-w-[140px] focus:outline-none px-1"
          data-testid={`${testIdPrefix}-input`}
        />
      </div>
      {dropdownOpen && !panelMode && (
        <div className="absolute z-50 mt-0.5 top-full left-0 w-[420px] max-h-[300px] overflow-auto bg-popover border border-border rounded shadow-lg">
          {filteredTickers.length === 0 && !inputValue.trim() ? (
            <div className="px-2 py-1.5 text-[11px] font-mono text-muted-foreground">
              All workbook tickers are already in the basket, or type any Yahoo symbol and press
              Enter.
            </div>
          ) : filteredTickers.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] font-mono text-muted-foreground">
              {"No workbook match. Press Enter to add"}{" "}
              <span className="text-foreground font-bold">
                {inputValue.trim().toUpperCase() || "—"}
              </span>{" "}
              {"as a Yahoo symbol."}
            </div>
          ) : (
            filteredTickers.map((entry, idx) => (
              <button
                key={entry.ticker}
                type="button"
                className={`w-full text-left px-2 py-1 text-[11px] font-mono flex items-center gap-2 ${idx === highlightIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`}
                onMouseEnter={() => setHighlightIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitInput(entry.ticker);
                }}
              >
                <span className="font-bold w-14 shrink-0">{entry.ticker}</span>
                <span className="text-muted-foreground truncate flex-1">{entry.name || ""}</span>
                <span className="text-[9px] font-mono px-1 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
                  REIT
                </span>
              </button>
            ))
          )}
          {inputValue.trim() &&
            !filteredTickers.find(
              (t) => t.ticker.toUpperCase() === inputValue.trim().toUpperCase()
            ) && (
              <button
                type="button"
                className="w-full text-left px-2 py-1 text-[11px] font-mono flex items-center gap-2 border-t border-border hover:bg-accent/50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitInput(inputValue);
                }}
              >
                <span className="font-bold w-14 shrink-0">{inputValue.trim().toUpperCase()}</span>
                <span className="text-muted-foreground flex-1">Add as Yahoo symbol</span>
                <span className="text-[9px] font-mono px-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                  Yahoo
                </span>
              </button>
            )}
        </div>
      )}
      {panelMode === "save" && (
        <div className="absolute z-50 mt-0.5 top-full right-0 w-[320px] bg-popover border border-border rounded shadow-lg p-2 flex flex-col gap-1">
          <div className="text-[10px] font-mono text-muted-foreground">
            Save these {value.length} tickers as a named basket
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder="Basket name…"
              value={basketName}
              onChange={(e) => setBasketName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleSaveBasket(); }
                if (e.key === "Escape") setPanelMode(null);
              }}
              className="text-[11px] font-mono bg-background border border-border rounded px-1.5 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-primary"
              maxLength={64}
              autoFocus={true}
              data-testid={`${testIdPrefix}-save-name-input`}
            />
            <button
              type="button"
              onClick={handleSaveBasket}
              disabled={!basketName.trim() || value.length === 0}
              className="text-[10px] font-mono font-bold px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
              data-testid={`${testIdPrefix}-save-confirm-btn`}
            >
              <Check className="h-3 w-3 inline-block mr-1" />
              Save
            </button>
          </div>
          {sortedBaskets.length > 0 && (
            <div className="text-[9px] font-mono text-muted-foreground mt-1">
              Existing names will be overwritten. Manage all baskets at /baskets.
            </div>
          )}
        </div>
      )}
      {panelMode === "load" && (
        <div className="absolute z-50 mt-0.5 top-full right-0 w-[360px] max-h-[300px] overflow-auto bg-popover border border-border rounded shadow-lg">
          {sortedBaskets.length === 0 ? (
            <div className="px-2 py-2 text-[11px] font-mono text-muted-foreground">
              No saved baskets yet. Add tickers and click Save.
            </div>
          ) : (
            sortedBaskets.map((basket) => (
              <div
                key={basket.id}
                className="flex items-center gap-1 px-2 py-1 hover:bg-accent/50 text-[11px] font-mono group"
              >
                <button
                  type="button"
                  className="flex-1 text-left flex flex-col gap-0.5"
                  onClick={() => handleLoadBasket(basket.id)}
                  data-testid={`${testIdPrefix}-load-${basket.name}`}
                >
                  <span className="font-bold">{basket.name}</span>
                  <span className="text-muted-foreground text-[9px] truncate">
                    {basket.tickers.length} tickers ·{" "}
                    {basket.tickers.slice(0, 6).join(", ")}
                    {basket.tickers.length > 6 ? "…" : ""}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteBasket(basket.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                  title={`Delete "${basket.name}"`}
                  data-testid={`${testIdPrefix}-delete-${basket.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export { BasketPicker, BasketPicker as B };
export default BasketPicker;
