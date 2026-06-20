// Reconstructed from recovered-bundle/index-CsG73Aq_.js (fn jHe + FT helper) on 2026-06-17
import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Search, FileText, CornerDownLeft, TrendingUp } from "lucide-react";
import { getTickers, type TickerMeta } from "@/lib/dataService";

export interface CommandPalettePage {
  path: string;
  label: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  pages: CommandPalettePage[];
}

type PageResult = { kind: "page"; path: string; label: string };
type TickerResult = { kind: "ticker"; ticker: string; name: string; sector: string };
type ResultItem = PageResult | TickerResult;

/**
 * Fuzzy scorer (bundle FT). Lower score = better match.
 * - Empty query → 0
 * - Prefix match → -100 + (lenDelta)*0.1
 * - Substring → indexOf position
 * - Subsequence → 100 + accumulated gaps
 * - Not a subsequence → null
 */
export function FT(query: string, target: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(q)) return -100 + (t.length - q.length) * 0.1;
  const idx = t.indexOf(q);
  if (idx >= 0) return idx;
  let matched = 0;
  let last = -1;
  let gaps = 0;
  for (let i = 0; i < t.length && matched < q.length; i++) {
    if (t[i] === q[matched]) {
      if (last >= 0) gaps += i - last - 1;
      last = i;
      matched++;
    }
  }
  return matched !== q.length ? null : 100 + gaps;
}

export default function CommandPalette({ open, onClose, pages }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [tickers, setTickers] = useState<TickerMeta[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      getTickers()
        .then(setTickers)
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo<ResultItem[]>(() => {
    const scored: { item: ResultItem; score: number }[] = [];
    for (const page of pages) {
      const score = FT(query, page.label);
      if (score !== null) {
        scored.push({
          item: { kind: "page", path: page.path, label: page.label },
          score: score - 50,
        });
      }
    }
    for (const ticker of tickers) {
      const byTicker = FT(query, ticker.ticker);
      const byName = FT(query, ticker.name);
      const score =
        byTicker !== null && byName !== null
          ? Math.min(byTicker, byName)
          : byTicker !== null
          ? byTicker
          : byName;
      if (score !== null) {
        scored.push({
          item: {
            kind: "ticker",
            ticker: ticker.ticker,
            name: ticker.name,
            sector: ticker.sector,
          },
          score,
        });
      }
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 50).map((s) => s.item);
  }, [query, pages, tickers]);

  useEffect(() => {
    if (selected >= results.length) {
      setSelected(Math.max(0, results.length - 1));
    }
  }, [results, selected]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current
      .querySelector(`[data-idx="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function activate(item: ResultItem) {
    if (item.kind === "page") {
      setLocation(item.path);
    } else {
      window.dispatchEvent(
        new CustomEvent("commandpalette:ticker", { detail: { ticker: item.ticker } })
      );
      setLocation("/");
    }
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results[selected]) activate(results[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return open ? (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="command-palette"
    >
      <div
        className="w-[min(640px,92vw)] bg-card border border-border rounded-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search tickers or jump to a page…"
            className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
            data-testid="command-palette-input"
          />
          <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
            ESC
          </span>
        </div>
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No matches
            </div>
          ) : (
            results.map((item, idx) => {
              const isSel = idx === selected;
              return item.kind === "page" ? (
                <button
                  key={`p-${item.path}`}
                  data-idx={idx}
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => activate(item)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                    isSel ? "bg-amber-500/15 text-amber-200" : "text-foreground hover:bg-accent"
                  }`}
                  data-testid={`cmd-page-${item.path}`}
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{item.path}</span>
                  {isSel && <CornerDownLeft className="w-3.5 h-3.5 text-amber-400" />}
                </button>
              ) : (
                <button
                  key={`t-${item.ticker}`}
                  data-idx={idx}
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => activate(item)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                    isSel ? "bg-amber-500/15 text-amber-200" : "text-foreground hover:bg-accent"
                  }`}
                  data-testid={`cmd-ticker-${item.ticker}`}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-mono font-semibold w-16">{item.ticker}</span>
                  <span className="flex-1 truncate text-muted-foreground">{item.name}</span>
                  {item.sector && (
                    <span className="text-[10px] text-muted-foreground/70 truncate max-w-[120px]">
                      {item.sector}
                    </span>
                  )}
                  {isSel && <CornerDownLeft className="w-3.5 h-3.5 text-amber-400" />}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/40 text-[10px] text-muted-foreground font-mono">
          <span>↑↓ navigate · ↵ select · esc close</span>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>
  ) : null;
}
