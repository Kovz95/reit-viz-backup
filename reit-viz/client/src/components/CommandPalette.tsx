// Reconstructed from recovered-bundle/index-CsG73Aq_.js (fn jHe + FT helper) on 2026-06-17
import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Search, FileText, CornerDownLeft, TrendingUp, Bookmark, Radar, Layers } from "lucide-react";
import { getTickers, type TickerMeta } from "@/lib/dataService";
import { loadServerPref } from "@/lib/serverPrefs";

export interface CommandPalettePage {
  path: string;
  label: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  pages: CommandPalettePage[];
}

// Saved-entity stores surfaced as palette actions. Keys mirror the owning
// pages (UniversalScreener / Correlation); the palette only needs names.
const SCREENS_KEY = "reit-viz:universal-screener:saved-screens";
const DISLOC_PRESETS_KEY = "reit-viz:disloc-scan-presets";
const PAIR_TEMPLATES_KEY = "reit-viz:corr-pair-templates";
// sessionStorage hand-offs the target pages consume once on load.
export const PENDING_SCREEN_KEY = "reit-viz:pending-screen";
export const PENDING_DISLOC_PRESET_KEY = "reit-viz:pending-disloc-preset";
export const PENDING_PAIR_TEMPLATE_KEY = "reit-viz:pending-pair-template";

type PageResult = { kind: "page"; path: string; label: string };
type TickerResult = { kind: "ticker"; ticker: string; name: string; sector: string };
type SavedResult = { kind: "screen" | "dislocPreset" | "pairTemplate"; name: string };
type ResultItem = PageResult | TickerResult | SavedResult;

const SAVED_META: Record<SavedResult["kind"], { prefix: string; path: string; pendingKey: string }> = {
  screen: { prefix: "Screen", path: "/universal-screener", pendingKey: PENDING_SCREEN_KEY },
  dislocPreset: { prefix: "Disloc preset", path: "/correlation", pendingKey: PENDING_DISLOC_PRESET_KEY },
  pairTemplate: { prefix: "Pair template", path: "/correlation", pendingKey: PENDING_PAIR_TEMPLATE_KEY },
};

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
  const [location, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [tickers, setTickers] = useState<TickerMeta[]>([]);
  const [saved, setSaved] = useState<SavedResult[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      getTickers()
        .then(setTickers)
        .catch(() => {});
      // Saved entities from the server prefs KV (session-cached upstream).
      void Promise.all([
        loadServerPref<{ name: string }[]>(SCREENS_KEY),
        loadServerPref<{ name: string }[]>(DISLOC_PRESETS_KEY),
        loadServerPref<{ name: string }[]>(PAIR_TEMPLATES_KEY),
      ]).then(([screens, presets, templates]) => {
        const out: SavedResult[] = [];
        for (const s of screens ?? []) if (s?.name) out.push({ kind: "screen", name: s.name });
        for (const p of presets ?? []) if (p?.name) out.push({ kind: "dislocPreset", name: p.name });
        for (const t of templates ?? []) if (t?.name) out.push({ kind: "pairTemplate", name: t.name });
        setSaved(out);
      });
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
    for (const item of saved) {
      const label = `${SAVED_META[item.kind].prefix}: ${item.name}`;
      const score = FT(query, label) ?? FT(query, item.name);
      if (score !== null) scored.push({ item, score: score - 25 });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 50).map((s) => s.item);
  }, [query, pages, tickers, saved]);

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
    } else if (item.kind === "ticker") {
      // Charts hand-off: if the Dashboard is mounted it consumes the
      // goto-symbol event immediately; otherwise the pending-symbol key is
      // read once on mount. (The old "commandpalette:ticker" event had no
      // listener anywhere — picking a ticker never loaded it.)
      if (location === "/") {
        window.dispatchEvent(new CustomEvent("reit-viz:goto-symbol", { detail: { symbol: item.ticker } }));
      } else {
        try { localStorage.setItem("reit-viz.dashboard.pending-symbol", item.ticker); } catch {}
        setLocation("/");
      }
    } else {
      const meta = SAVED_META[item.kind];
      try { sessionStorage.setItem(meta.pendingKey, item.name); } catch {}
      if (location === meta.path) {
        // Already on the page — let it consume the pending key via an event.
        window.dispatchEvent(new CustomEvent("reit-viz:pending-saved-action"));
      } else {
        setLocation(meta.path);
      }
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
              if (item.kind === "screen" || item.kind === "dislocPreset" || item.kind === "pairTemplate") {
                const Icon = item.kind === "screen" ? Bookmark : item.kind === "dislocPreset" ? Radar : Layers;
                return (
                  <button
                    key={`s-${item.kind}-${item.name}`}
                    data-idx={idx}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => activate(item)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                      isSel ? "bg-amber-500/15 text-amber-200" : "text-foreground hover:bg-accent"
                    }`}
                    data-testid={`cmd-saved-${item.kind}-${item.name}`}
                  >
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{SAVED_META[item.kind].prefix}</span>
                    {isSel && <CornerDownLeft className="w-3.5 h-3.5 text-amber-400" />}
                  </button>
                );
              }
              if (item.kind === "page") {
                return (
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
                );
              }
              const tk = item as TickerResult;
              return (
                <button
                  key={`t-${tk.ticker}`}
                  data-idx={idx}
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => activate(tk)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                    isSel ? "bg-amber-500/15 text-amber-200" : "text-foreground hover:bg-accent"
                  }`}
                  data-testid={`cmd-ticker-${tk.ticker}`}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-mono font-semibold w-16">{tk.ticker}</span>
                  <span className="flex-1 truncate text-muted-foreground">{tk.name}</span>
                  {tk.sector && (
                    <span className="text-[10px] text-muted-foreground/70 truncate max-w-[120px]">
                      {tk.sector}
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
