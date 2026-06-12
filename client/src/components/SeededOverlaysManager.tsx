/**
 * SeededOverlaysManager — docked sidebar panel for the ChartArea right rail.
 *
 * Visual language mirrors IndicatorsPanel exactly:
 *   - 260–340px right rail with `border-l border-border bg-card/50`
 *   - Header row (icon + title + collapse-all + close), then a `p-3 space-y-4`
 *     body with uppercase tracking-wider section labels separated by
 *     `border-t border-border pt-3`.
 *   - Form controls use shadcn `<Label>`, `<Input>`, `<Switch>`, `<Button>`
 *     with the same `text-[10px]` / `h-6 px-2` / `flex-1` sizing as Indicators.
 *
 * Sections (top → bottom):
 *   1. DRAWING TOOLS   — Draw / Clear auto-trendlines
 *   2. TIMEFRAME       — Daily/Weekly + Multi-mode + n / Diag / Horiz presets
 *   3. ACTIVE OVERLAYS — Show all / Hide all / Delete all + visible-count
 *   4. SEEDED LEVELS   — S/R Levels and Trendlines lists with per-row toggle/delete
 *
 * Behaviour, storage keys, and helper calls are unchanged from the prior
 * implementation (see seedsStorage.ts).
 */

import { useCallback, useEffect, useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Layers,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  readSeeds,
  writeSeeds,
  dispatchSeedsRestored,
  clearAutoTrendlines,
  formatLevelLabel,
  formatTrendlineLabel,
  SR_PERSISTENT_KEY,
  TL_PERSISTENT_KEY,
  SR_SEEDS_KEY,
  TL_SEEDS_KEY,
  type SeededLevel,
  type SeededTrendline,
} from "@/lib/seedsStorage";

// Optional auto-trendline runner. If this module is absent at build time,
// the Draw button shows a placeholder message. In the live patched bundle,
// the runner is provided by the existing app helpers.
type AutoTrendlineRunner = (args: {
  ticker: string;
  n: number;
  timeframe: "daily" | "weekly";
  futureBars: number;
  multi: boolean;
  maxDiagonalPerSide?: number;
  maxHorizontalPerSide?: number;
}) => Promise<{ message: string }>;

async function runAutoTrendline(
  args: Parameters<AutoTrendlineRunner>[0],
): Promise<{ message: string }> {
  try {
    // @ts-ignore — optional module
    const mod = await import("@/lib/autoTrendline");
    if (typeof mod?.runAutoTrendline === "function") {
      return await mod.runAutoTrendline(args);
    }
  } catch {
    /* ignore */
  }
  return {
    message:
      "Auto-trendline runner not available in this build. Use the Levels tab to seed overlays manually.",
  };
}

interface SeededOverlaysManagerProps {
  activeTicker: string | null | undefined;
  /** Called when user clicks the X in the panel header. */
  onClose: () => void;
}

export default function SeededOverlaysManager({
  activeTicker,
  onClose,
}: SeededOverlaysManagerProps) {
  const ticker = (activeTicker || "").toUpperCase();

  // Force-refresh tick so we re-read localStorage on storage events.
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  // Collapse/expand all sections (mirrors Indicators panel)
  const [allCollapsed, setAllCollapsed] = useState(false);

  const levels: SeededLevel[] = ticker ? readSeeds<SeededLevel>(SR_PERSISTENT_KEY, ticker) : [];
  const trendlines: SeededTrendline[] = ticker
    ? readSeeds<SeededTrendline>(TL_PERSISTENT_KEY, ticker)
    : [];
  const totalCount = levels.length + trendlines.length;
  const visibleCount =
    levels.filter((l) => !l.hidden).length + trendlines.filter((t) => !t.hidden).length;

  // Listen for storage changes and our own seeds-restored event.
  useEffect(() => {
    const handler = () => bump();
    window.addEventListener("storage", handler);
    window.addEventListener("reit-viz-seeds-restored", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("reit-viz-seeds-restored", handler);
    };
  }, [bump]);

  // Per-overlay toggles
  const toggleLevel = (idx: number) => {
    const next = levels.slice();
    next[idx] = { ...next[idx], hidden: !next[idx].hidden };
    writeSeeds(SR_PERSISTENT_KEY, ticker, next);
    dispatchSeedsRestored();
    bump();
  };
  const toggleTrendline = (idx: number) => {
    const next = trendlines.slice();
    next[idx] = { ...next[idx], hidden: !next[idx].hidden };
    writeSeeds(TL_PERSISTENT_KEY, ticker, next);
    dispatchSeedsRestored();
    bump();
  };

  const deleteLevel = (idx: number) => {
    const next = levels.slice();
    next.splice(idx, 1);
    writeSeeds(SR_PERSISTENT_KEY, ticker, next);
    // Also strip matching entry from the seed store, so it won't be restored.
    const seeds = readSeeds<SeededLevel>(SR_SEEDS_KEY, ticker);
    if (seeds.length > 0) {
      const removed = levels[idx];
      const remaining = seeds.filter(
        (s) =>
          !(
            s.type === removed.type &&
            Math.abs(Number(s.price) - Number(removed.price)) < 1e-9 &&
            (s.maType ?? "") === (removed.maType ?? "") &&
            (s.maPeriod ?? "") === (removed.maPeriod ?? "") &&
            (s.fibLevel ?? "") === (removed.fibLevel ?? "")
          ),
      );
      writeSeeds(SR_SEEDS_KEY, ticker, remaining);
    }
    dispatchSeedsRestored();
    bump();
  };

  const deleteTrendline = (idx: number) => {
    const next = trendlines.slice();
    next.splice(idx, 1);
    writeSeeds(TL_PERSISTENT_KEY, ticker, next);
    const seeds = readSeeds<SeededTrendline>(TL_SEEDS_KEY, ticker);
    if (seeds.length > 0) {
      const removed = trendlines[idx];
      const remaining = seeds.filter(
        (s) =>
          !(
            s.kind === removed.kind &&
            s.date1 === removed.date1 &&
            Math.abs(Number(s.price1) - Number(removed.price1)) < 1e-9 &&
            s.date2 === removed.date2 &&
            Math.abs(Number(s.price2) - Number(removed.price2)) < 1e-9
          ),
      );
      writeSeeds(TL_SEEDS_KEY, ticker, remaining);
    }
    dispatchSeedsRestored();
    bump();
  };

  const setAllHidden = (hidden: boolean) => {
    writeSeeds(SR_PERSISTENT_KEY, ticker, levels.map((l) => ({ ...l, hidden })));
    writeSeeds(TL_PERSISTENT_KEY, ticker, trendlines.map((t) => ({ ...t, hidden })));
    dispatchSeedsRestored();
    bump();
  };

  const deleteAll = () => {
    if (!confirm(`Delete all ${totalCount} seeded overlays for ${ticker}?`)) return;
    writeSeeds(SR_PERSISTENT_KEY, ticker, []);
    writeSeeds(TL_PERSISTENT_KEY, ticker, []);
    writeSeeds(SR_SEEDS_KEY, ticker, []);
    writeSeeds(TL_SEEDS_KEY, ticker, []);
    dispatchSeedsRestored();
    bump();
  };

  // ───── Auto-trendline controls (persisted to localStorage) ─────
  const [atlN, setAtlN] = useState<number>(() => {
    const v = Number(localStorage.getItem("reit-viz-atl-n"));
    return Number.isFinite(v) && v >= 2 && v <= 50 ? v : 10;
  });
  const [atlTf, setAtlTf] = useState<"daily" | "weekly">(() =>
    localStorage.getItem("reit-viz-atl-tf") === "weekly" ? "weekly" : "daily",
  );
  const [atlMulti, setAtlMulti] = useState<boolean>(
    () => localStorage.getItem("reit-viz-atl-multi") !== "0",
  );
  const [atlMaxDiag, setAtlMaxDiag] = useState<number>(() => {
    const v = localStorage.getItem("reit-viz-atl-max-diag");
    if (v == null || v === "") return 3;
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= 10 ? n : 3;
  });
  const [atlMaxHorz, setAtlMaxHorz] = useState<number>(() => {
    const v = localStorage.getItem("reit-viz-atl-max-horz");
    if (v == null || v === "") return 3;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 3;
  });

  const [atlBusy, setAtlBusy] = useState(false);
  const [atlMsg, setAtlMsg] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("reit-viz-atl-n", String(atlN));
    } catch {}
  }, [atlN]);
  useEffect(() => {
    try {
      localStorage.setItem("reit-viz-atl-tf", atlTf);
    } catch {}
  }, [atlTf]);
  useEffect(() => {
    try {
      localStorage.setItem("reit-viz-atl-multi", atlMulti ? "1" : "0");
    } catch {}
  }, [atlMulti]);
  useEffect(() => {
    try {
      localStorage.setItem("reit-viz-atl-max-diag", String(atlMaxDiag));
    } catch {}
  }, [atlMaxDiag]);
  useEffect(() => {
    try {
      localStorage.setItem("reit-viz-atl-max-horz", String(atlMaxHorz));
    } catch {}
  }, [atlMaxHorz]);

  const runDraw = useCallback(async () => {
    if (!ticker || atlBusy) return;
    setAtlBusy(true);
    setAtlMsg("Computing…");
    try {
      clearAutoTrendlines(ticker);
      const res = await runAutoTrendline({
        ticker,
        n: atlN,
        timeframe: atlTf,
        futureBars: 60,
        multi: atlMulti,
        maxDiagonalPerSide: atlMaxDiag,
        maxHorizontalPerSide: atlMaxHorz,
      });
      setAtlMsg(res.message);
      dispatchSeedsRestored();
      bump();
    } catch (e: any) {
      setAtlMsg(`Error: ${e?.message ?? e}`);
    } finally {
      setAtlBusy(false);
      setTimeout(() => setAtlMsg(""), 4000);
    }
  }, [ticker, atlN, atlTf, atlMulti, atlMaxDiag, atlMaxHorz, atlBusy, bump]);

  const runClearAtl = useCallback(() => {
    if (!ticker) return;
    const n = clearAutoTrendlines(ticker);
    setAtlMsg(`Cleared ${n} auto-trendline${n === 1 ? "" : "s"}`);
    dispatchSeedsRestored();
    bump();
    setTimeout(() => setAtlMsg(""), 3000);
  }, [ticker, bump]);

  if (!ticker) return null;

  // Preset rows for the auto-trendline params (mirrors Indicators MaRow).
  const N_PRESETS = [5, 10, 20, 30];
  const DIAG_PRESETS = [1, 2, 3, 5];
  const HORZ_PRESETS = [0, 1, 3, 5];

  // ───── Render: docked sidebar (matches IndicatorsPanel pattern) ─────
  return (
    <div
      className="w-[300px] border-l border-border bg-card/50 overflow-y-auto flex-shrink-0"
      data-testid="seeded-overlays-sidebar"
    >
      {/* Header — same structure as IndicatorsPanel */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Seeded Overlays — {ticker}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] gap-1"
            onClick={() => setAllCollapsed((c) => !c)}
            title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
            data-testid="collapse-all-seeds"
          >
            {allCollapsed ? (
              <ChevronsUpDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronsDownUp className="w-3.5 h-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onClose}
            data-testid="seeds-sidebar-close"
            title="Close Seeds panel"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {/* ───── Drawing Tools ───── */}
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
          Drawing Tools
        </p>

        {!allCollapsed && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Auto Trendline</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Pivot fractal + S/R detector
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="default"
                className="h-6 px-3 text-[10px] flex-1"
                onClick={runDraw}
                disabled={atlBusy}
                data-testid="atl-overlay-run"
              >
                {atlBusy ? "Computing…" : "Draw"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-6 px-3 text-[10px] flex-1 text-red-400 hover:text-red-300"
                onClick={runClearAtl}
                disabled={atlBusy}
                title="Clear only the auto-trendline overlays (leaves manual seeds intact)"
                data-testid="atl-overlay-clear"
              >
                Clear
              </Button>
            </div>
            {atlMsg && (
              <p className="text-[10px] text-muted-foreground font-mono leading-snug">{atlMsg}</p>
            )}
          </div>
        )}

        {/* ───── Timeframe ───── */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">
            Timeframe
          </p>

          {!allCollapsed && (
            <div className="space-y-3">
              {/* Daily vs Weekly */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Bar Interval</Label>
                <div className="flex gap-1">
                  <Button
                    variant={atlTf === "daily" ? "default" : "secondary"}
                    size="sm"
                    className="h-6 px-3 text-[10px] flex-1"
                    onClick={() => setAtlTf("daily")}
                    data-testid="atl-overlay-tf-daily"
                  >
                    Daily
                  </Button>
                  <Button
                    variant={atlTf === "weekly" ? "default" : "secondary"}
                    size="sm"
                    className="h-6 px-3 text-[10px] flex-1"
                    onClick={() => setAtlTf("weekly")}
                    data-testid="atl-overlay-tf-weekly"
                  >
                    Weekly
                  </Button>
                </div>
              </div>

              {/* Multi mode toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Multi mode</Label>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Rank all significant lines & levels
                  </p>
                </div>
                <Switch
                  checked={atlMulti}
                  onCheckedChange={setAtlMulti}
                  data-testid="atl-overlay-multi"
                />
              </div>

              {/* n (fractal period) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium" title="Fractal period — pivot needs n bars on each side.">
                    n (fractal)
                  </Label>
                </div>
                <div className="flex gap-1 items-center">
                  {N_PRESETS.map((p) => (
                    <Button
                      key={p}
                      variant={atlN === p ? "default" : "secondary"}
                      size="sm"
                      className="h-6 px-2 text-[10px] flex-1"
                      onClick={() => setAtlN(p)}
                    >
                      {p}
                    </Button>
                  ))}
                  <Input
                    type="number"
                    placeholder="#"
                    className="h-6 w-14 text-[10px] px-1.5"
                    min={2}
                    max={500}
                    value={atlN}
                    onChange={(e) =>
                      setAtlN(Math.max(2, Math.min(500, Number(e.target.value) || 10)))
                    }
                    data-testid="atl-overlay-n"
                  />
                </div>
              </div>

              {/* Diag / Horiz per side — only when multi mode on */}
              {atlMulti && (
                <>
                  <div className="space-y-2">
                    <Label
                      className="text-xs font-medium"
                      title="Max diagonal trendlines per side (resistance / support)."
                    >
                      Diag / side
                    </Label>
                    <div className="flex gap-1 items-center">
                      {DIAG_PRESETS.map((p) => (
                        <Button
                          key={p}
                          variant={atlMaxDiag === p ? "default" : "secondary"}
                          size="sm"
                          className="h-6 px-2 text-[10px] flex-1"
                          onClick={() => setAtlMaxDiag(p)}
                        >
                          {p}
                        </Button>
                      ))}
                      <Input
                        type="number"
                        placeholder="#"
                        className="h-6 w-14 text-[10px] px-1.5"
                        min={1}
                        max={10}
                        value={atlMaxDiag}
                        onChange={(e) =>
                          setAtlMaxDiag(Math.max(1, Math.min(10, Number(e.target.value) || 3)))
                        }
                        data-testid="atl-overlay-max-diag"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label
                      className="text-xs font-medium"
                      title="Max horizontal S/R levels per side. Set 0 to disable horizontals."
                    >
                      Horiz / side
                    </Label>
                    <div className="flex gap-1 items-center">
                      {HORZ_PRESETS.map((p) => (
                        <Button
                          key={p}
                          variant={atlMaxHorz === p ? "default" : "secondary"}
                          size="sm"
                          className="h-6 px-2 text-[10px] flex-1"
                          onClick={() => setAtlMaxHorz(p)}
                        >
                          {p}
                        </Button>
                      ))}
                      <Input
                        type="number"
                        placeholder="#"
                        className="h-6 w-14 text-[10px] px-1.5"
                        min={0}
                        max={10}
                        value={atlMaxHorz}
                        onChange={(e) =>
                          setAtlMaxHorz(Math.max(0, Math.min(10, Number(e.target.value) || 0)))
                        }
                        data-testid="atl-overlay-max-horz"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ───── Active Overlays (mass actions + count) ───── */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              Active Overlays
            </p>
            <span className="text-[10px] text-muted-foreground font-mono">
              {visibleCount}/{totalCount}
            </span>
          </div>

          {!allCollapsed && (
            <>
              {totalCount === 0 ? (
                <p className="text-[10px] text-muted-foreground leading-snug">
                  No active overlays. Toggle one below or click Draw above to populate.
                </p>
              ) : (
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[10px] flex-1 gap-1"
                    onClick={() => setAllHidden(false)}
                    data-testid="seeds-show-all"
                  >
                    <Eye className="w-3 h-3" />
                    Show all
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[10px] flex-1 gap-1"
                    onClick={() => setAllHidden(true)}
                    data-testid="seeds-hide-all"
                  >
                    <EyeOff className="w-3 h-3" />
                    Hide all
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[10px] flex-1 gap-1 text-red-400 hover:text-red-300"
                    onClick={deleteAll}
                    data-testid="seeds-delete-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ───── Seeded Levels ───── */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3">
            Seeded Levels
          </p>

          {!allCollapsed && (
            <>
              {totalCount === 0 ? (
                <p className="text-[10px] text-muted-foreground leading-snug">
                  No seeded overlays for {ticker}. Click Draw above, or send levels/trendlines
                  from the Levels tab.
                </p>
              ) : (
                <div className="space-y-3">
                  {levels.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] text-muted-foreground/70 font-medium">
                        S/R Levels ({levels.length})
                      </p>
                      <div className="rounded border border-border/40 divide-y divide-border/40">
                        {levels.map((lvl, idx) => {
                          const hidden = !!lvl.hidden;
                          return (
                            <div
                              key={`sr-${idx}-${lvl.price}-${lvl.maType ?? ""}-${lvl.maPeriod ?? ""}`}
                              className={`flex items-center gap-1.5 px-2 py-1 text-[11px] ${
                                hidden ? "opacity-50" : ""
                              }`}
                              data-testid={`seeded-overlay-sr-${idx}`}
                            >
                              <button
                                className="h-5 w-5 flex items-center justify-center hover:bg-muted rounded"
                                onClick={() => toggleLevel(idx)}
                                title={hidden ? "Show this level" : "Hide this level"}
                                data-testid={`seeded-overlay-sr-toggle-${idx}`}
                              >
                                {hidden ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </button>
                              <div className="flex-1 truncate font-mono">
                                {formatLevelLabel(lvl)}
                              </div>
                              {Number.isFinite(lvl.compositeScore) && (
                                <span className="text-[9px] text-muted-foreground">
                                  {(Number(lvl.compositeScore) * 100).toFixed(0)}
                                </span>
                              )}
                              <button
                                className="h-5 w-5 flex items-center justify-center hover:bg-red-500/20 rounded text-red-400 hover:text-red-300"
                                onClick={() => deleteLevel(idx)}
                                title="Delete this level"
                                data-testid={`seeded-overlay-sr-delete-${idx}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {trendlines.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] text-muted-foreground/70 font-medium">
                        Trendlines ({trendlines.length})
                      </p>
                      <div className="rounded border border-border/40 divide-y divide-border/40">
                        {trendlines.map((tl, idx) => {
                          const hidden = !!tl.hidden;
                          return (
                            <div
                              key={`tl-${idx}-${tl.date1}-${tl.price1}`}
                              className={`flex items-center gap-1.5 px-2 py-1 text-[11px] ${
                                hidden ? "opacity-50" : ""
                              }`}
                              data-testid={`seeded-overlay-tl-${idx}`}
                            >
                              <button
                                className="h-5 w-5 flex items-center justify-center hover:bg-muted rounded"
                                onClick={() => toggleTrendline(idx)}
                                title={hidden ? "Show this trendline" : "Hide this trendline"}
                                data-testid={`seeded-overlay-tl-toggle-${idx}`}
                              >
                                {hidden ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </button>
                              <div className="flex-1 truncate font-mono">
                                {formatTrendlineLabel(tl)}
                              </div>
                              {Number.isFinite(tl.compositeScore) && (
                                <span className="text-[9px] text-muted-foreground">
                                  {(Number(tl.compositeScore) * 100).toFixed(0)}
                                </span>
                              )}
                              <button
                                className="h-5 w-5 flex items-center justify-center hover:bg-red-500/20 rounded text-red-400 hover:text-red-300"
                                onClick={() => deleteTrendline(idx)}
                                title="Delete this trendline"
                                data-testid={`seeded-overlay-tl-delete-${idx}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!allCollapsed && (
          <div className="border-t border-border pt-3">
            <p className="text-[10px] text-muted-foreground leading-snug">
              Drawing Tools run the auto-trendline indicator. Timeframe params persist per
              browser. Active Overlays toggles visibility for all seeded levels & trendlines on
              the current ticker.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
