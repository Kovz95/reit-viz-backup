// Reconstructed from recovered-bundle/UnifiedTickerPicker-D927mSvl.js on 2025-01-31

import { useState, useEffect, useRef, useMemo } from "react";

interface TickerEntry {
  ticker: string;
  name?: string;
}

interface UnifiedTickerPickerProps {
  tickers: TickerEntry[];
  value: string;
  onChange: (ticker: string) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

function UnifiedTickerPicker({
  tickers,
  value,
  onChange,
  disabled,
  label = "Ticker",
  placeholder = "Search ticker / name or type any Yahoo symbol…",
}: UnifiedTickerPickerProps) {
  const [inputValue, setInputValue] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      containerRef.current && (containerRef.current.contains(e.target as Node) || setOpen(false));
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  const filteredTickers = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    const safe = (tickers ?? []).filter((t) => t && typeof t.ticker === "string");
    return query
      ? safe
          .filter(
            (t) =>
              t.ticker.toLowerCase().includes(query) ||
              (t.name && t.name.toLowerCase().includes(query))
          )
          .slice(0, 50)
      : safe.slice(0, 50);
  }, [tickers, inputValue]);

  const isInUniverse = useMemo(
    () => tickers.some((t) => (t?.ticker ?? "").toUpperCase() === (value || "").toUpperCase()),
    [tickers, value]
  );

  const selectTicker = (raw: string) => {
    const normalized = raw.trim().toUpperCase();
    if (normalized) {
      onChange(normalized);
      setInputValue(normalized);
      setOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, Math.max(filteredTickers.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      open && filteredTickers[highlightIndex]
        ? selectTicker(filteredTickers[highlightIndex].ticker)
        : selectTicker(inputValue);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-0.5 relative">
      <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value.toUpperCase());
              setOpen(true);
              setHighlightIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            data-testid="input-ticker-unified"
            className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[260px] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {open && (
            <div className="absolute z-50 mt-0.5 left-0 w-[440px] max-h-[280px] overflow-auto bg-popover border border-border rounded shadow-lg">
              {filteredTickers.length === 0 ? (
                <div className="px-2 py-1.5 text-[11px] font-mono text-muted-foreground">
                  {"No workbook match. Press Enter to use"}{" "}
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
                      selectTicker(entry.ticker);
                    }}
                  >
                    <span className="font-bold w-14 shrink-0 whitespace-nowrap">
                      {entry.ticker}
                    </span>
                    <span
                      className="text-muted-foreground truncate flex-1 min-w-0"
                      title={entry.name || ""}
                    >
                      {entry.name || ""}
                    </span>
                    <span className="text-[9px] font-mono px-1 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
                      Universe
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
                      selectTicker(inputValue);
                    }}
                  >
                    <span className="font-bold w-14 shrink-0">
                      {inputValue.trim().toUpperCase()}
                    </span>
                    <span className="text-muted-foreground flex-1">Use as Yahoo symbol</span>
                    <span className="text-[9px] font-mono px-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                      Yahoo
                    </span>
                  </button>
                )}
            </div>
          )}
        </div>
        {value && (
          <span
            className={`text-[9px] font-mono px-1 py-0.5 rounded shrink-0 ${isInUniverse ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}
            title={isInUniverse ? "From workbook universe" : "Live from Yahoo Finance"}
          >
            {isInUniverse ? "Universe" : "Yahoo"}
          </span>
        )}
      </div>
    </div>
  );
}

export { UnifiedTickerPicker, UnifiedTickerPicker as U };
export default UnifiedTickerPicker;
