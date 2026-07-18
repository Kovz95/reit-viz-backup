// Unified /optimizers page — hosts every optimizer on one page.
//
// A multi-select adds strategies; each SELECTED strategy mounts its full,
// unmodified optimizer component (zero feature loss) inside a collapsible
// section. All mounted optimizers already read the same shared universe context,
// so filters stay in sync. "Run selected" fans out through OptimizerRunProvider:
// each optimizer subscribed via useOptimizerRunAll fires its own run handler once.
//
// Combined cross-strategy results are intentionally NOT attempted — the 16
// optimizers produce incompatible result shapes (ticker×horizon vs pairs vs
// bands vs matrices vs level/line rows), so each renders its own native results.

import { lazy, Suspense, useCallback, useState, type ComponentType } from "react";
import { ChevronDown, ChevronRight, X, Play, Crosshair } from "lucide-react";
import { useWorkspaceState } from "@/lib/workspaceState";
import { OptimizerRunProvider, useOptimizerRunTrigger } from "@/lib/optimizerRunSignal";

interface StrategyDef {
  key: string;
  label: string;
  Component: ComponentType;
}

// Order mirrors the Optimizers nav group.
const REGISTRY: StrategyDef[] = [
  { key: "z", label: "Z Optimizer", Component: lazy(() => import("@/pages/ZScoreOptimizer")) },
  { key: "pair", label: "Pair Opt", Component: lazy(() => import("@/pages/PairOptimizer")) },
  { key: "momentum", label: "Momentum", Component: lazy(() => import("@/pages/MomentumOptimizer")) },
  { key: "rsi", label: "RSI Regime", Component: lazy(() => import("@/pages/RSIRegimeOptimizer")) },
  { key: "combo", label: "Combo Opt", Component: lazy(() => import("@/pages/ComboOptimizer")) },
  { key: "roc", label: "ROC Opt", Component: lazy(() => import("@/pages/ROCOptimizer")) },
  { key: "macross", label: "MA Cross", Component: lazy(() => import("@/pages/MACrossoverOptimizer")) },
  { key: "oscillators", label: "Oscillators", Component: lazy(() => import("@/pages/Oscillators")) },
  { key: "range", label: "Range Opt", Component: lazy(() => import("@/pages/RangeOptimizer")) },
  { key: "harsi", label: "HARSI Opt", Component: lazy(() => import("@/pages/HarsiOptimizer")) },
  { key: "slowstoch", label: "SlowStoch Opt", Component: lazy(() => import("@/pages/SlowStochOptimizer")) },
  { key: "dualma", label: "DualMA Opt", Component: lazy(() => import("@/pages/DualMAOptimizer")) },
  { key: "tva", label: "TVA Opt", Component: lazy(() => import("@/pages/TVAOptimizer")) },
  { key: "pca", label: "PCA", Component: lazy(() => import("@/pages/PCA")) },
  { key: "levels", label: "Levels & Trendlines", Component: lazy(() => import("@/pages/LevelsAndTrendlines")) },
  { key: "autotl", label: "Auto Trendline BT", Component: lazy(() => import("@/pages/AutoTrendlineBacktest")) },
];

const REG_BY_KEY = new Map(REGISTRY.map((s) => [s.key, s]));

function RunSelectedButton({ disabled }: { disabled: boolean }) {
  const trigger = useOptimizerRunTrigger();
  return (
    <button
      type="button"
      data-testid="all-opt-run"
      disabled={disabled}
      onClick={trigger}
      className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-40"
      title="Fan out and run every selected strategy at once (heavy)"
    >
      <Play className="w-3 h-3" /> Run selected
    </button>
  );
}

export default function AllOptimizers() {
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const serialize = useCallback(() => ({ selected, collapsed }), [selected, collapsed]);
  const hydrate = useCallback((s: any) => {
    if (Array.isArray(s?.selected)) setSelected(s.selected.filter((k: string) => REG_BY_KEY.has(k)));
    if (s?.collapsed && typeof s.collapsed === "object") setCollapsed(s.collapsed);
  }, []);
  useWorkspaceState("all-optimizers", serialize, hydrate);

  const toggleStrategy = useCallback((key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);
  const removeStrategy = useCallback((key: string) => {
    setSelected((prev) => prev.filter((k) => k !== key));
  }, []);
  const toggleCollapse = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Render in registry order regardless of selection order.
  const selectedInOrder = REGISTRY.filter((s) => selected.includes(s.key));

  return (
    <OptimizerRunProvider>
      <div className="flex flex-col h-full bg-background text-foreground" data-testid="all-optimizers-page">
        {/* Control bar */}
        <div className="flex flex-col gap-2 px-3 py-2 border-b border-border bg-card/30 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-sm font-bold">
              <Crosshair className="w-4 h-4" /> All Optimizers
            </span>
            <span className="text-[10px] text-muted-foreground">
              Add strategies below — each mounts its full tool and shares the universe/filters. "Run selected" runs them all at once (CPU-heavy; add a few at a time).
            </span>
            <span className="ml-auto flex items-center gap-2">
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border"
                >
                  Clear ({selected.length})
                </button>
              )}
              <RunSelectedButton disabled={selected.length === 0} />
            </span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {REGISTRY.map((s) => {
              const on = selected.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  data-testid={`all-opt-toggle-${s.key}`}
                  onClick={() => toggleStrategy(s.key)}
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
              Pick strategies above to add them.
            </div>
          ) : (
            <div className="flex flex-col">
              {selectedInOrder.map((s) => {
                const isCollapsed = !!collapsed[s.key];
                const { Component } = s;
                return (
                  <section
                    key={s.key}
                    data-testid={`all-opt-section-${s.key}`}
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
                        onClick={() => removeStrategy(s.key)}
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
    </OptimizerRunProvider>
  );
}
