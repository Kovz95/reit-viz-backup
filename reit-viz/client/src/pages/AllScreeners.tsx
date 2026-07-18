// Unified /screeners page — hosts every screener on one page.
//
// Mirrors AllOptimizers: a multi-select adds screeners; each SELECTED screener
// mounts its full, unmodified component (zero feature loss) inside a collapsible
// section. All screeners keep their own Run buttons and their own classification
// + Country/Exchange filter bars, and share the app universe where applicable.

import { lazy, Suspense, useCallback, useState, type ComponentType } from "react";
import { ChevronDown, ChevronRight, X, Filter } from "lucide-react";
import { useWorkspaceState } from "@/lib/workspaceState";

interface ScreenerDef {
  key: string;
  label: string;
  Component: ComponentType;
}

// Order mirrors the old Screeners nav group.
const REGISTRY: ScreenerDef[] = [
  { key: "stock", label: "Stock Screener", Component: lazy(() => import("@/pages/Screener")) },
  { key: "pair", label: "Pair Screener", Component: lazy(() => import("@/pages/PairsScreener")) },
  { key: "pd", label: "P/D Screener", Component: lazy(() => import("@/pages/PremiumDiscountScreener")) },
  { key: "setups", label: "Setups Screener", Component: lazy(() => import("@/pages/SetupsScreener")) },
  { key: "pattern", label: "Pattern Screener", Component: lazy(() => import("@/pages/PatternScreener")) },
  { key: "gapfill", label: "Gap Fill", Component: lazy(() => import("@/pages/GapFillScreener")) },
];

const REG_BY_KEY = new Map(REGISTRY.map((s) => [s.key, s]));

export default function AllScreeners() {
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const serialize = useCallback(() => ({ selected, collapsed }), [selected, collapsed]);
  const hydrate = useCallback((s: any) => {
    if (Array.isArray(s?.selected)) setSelected(s.selected.filter((k: string) => REG_BY_KEY.has(k)));
    if (s?.collapsed && typeof s.collapsed === "object") setCollapsed(s.collapsed);
  }, []);
  useWorkspaceState("all-screeners", serialize, hydrate);

  const toggleScreener = useCallback((key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);
  const removeScreener = useCallback((key: string) => {
    setSelected((prev) => prev.filter((k) => k !== key));
  }, []);
  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Render in registry order regardless of selection order.
  const selectedInOrder = REGISTRY.filter((s) => selected.includes(s.key));

  return (
    <div className="flex flex-col h-full bg-background text-foreground" data-testid="all-screeners-page">
      {/* Control bar */}
      <div className="flex flex-col gap-2 px-3 py-2 border-b border-border bg-card/30 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-sm font-bold">
            <Filter className="w-4 h-4" /> All Screeners
          </span>
          <span className="text-[10px] text-muted-foreground">
            Add screeners below — each mounts its full tool with its own Run button and classification / Country / Exchange filters.
          </span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border"
            >
              Clear ({selected.length})
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {REGISTRY.map((s) => {
            const on = selected.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                data-testid={`all-scr-toggle-${s.key}`}
                onClick={() => toggleScreener(s.key)}
                className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                  on
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "bg-background text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {on ? "✓ " : "+ "}
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {selectedInOrder.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Pick screeners above to add them.
          </div>
        ) : (
          <div className="flex flex-col">
            {selectedInOrder.map((s) => {
              const isCollapsed = !!collapsed[s.key];
              const { Component } = s;
              return (
                <section
                  key={s.key}
                  data-testid={`all-scr-section-${s.key}`}
                  className="border-b border-border"
                >
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-card/50 sticky top-0 z-20">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(s.key)}
                      className="inline-flex items-center gap-1 text-[12px] font-bold hover:text-primary"
                    >
                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {s.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeScreener(s.key)}
                      className="ml-auto text-muted-foreground hover:text-destructive p-0.5 rounded"
                      title={`Remove ${s.label}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div className="h-[860px] overflow-hidden border-t border-border/50">
                      <Suspense
                        fallback={
                          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                            Loading {s.label}…
                          </div>
                        }
                      >
                        <Component />
                      </Suspense>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
