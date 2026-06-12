/**
 * SeededOverlaysManager — docked sidebar panel for the ChartArea right rail.
 *
 * Replaces the prior popover ("Seeds (n/N)") with a panel that docks on the
 * right side of ChartArea, matching the visual pattern of IndicatorsPanel
 * (border-l border-border bg-card/50, fixed width, scrollable body, X close).
 *
 * What it does:
 *   - Lists seeded S/R levels and trendlines for the active ticker
 *   - Toggles visibility (eye / eye-off) per overlay
 *   - Deletes individual overlays (also removes the matching seed entry so
 *     ChartPane won't restore it on next mount)
 *   - "Show all" / "Hide all" / "Delete all" mass actions
 *   - "Auto Trendline Indicator" controls (n, timeframe, multi-mode,
 *     max-diag/horz/side) and "Draw"/"Clear" buttons
 *
 * The "Draw" button calls the existing auto-trendline algorithm. In the live
 * bundle this is `DWe`/`IWe`; in a source-built bundle we'd need to recover
 * those helpers separately. For now, the Draw button calls
 * `runAutoTrendline` from `@/lib/autoTrendline`, which can be a stub or a
 * real implementation depending on which build environment we're in.
 *
 * Reverse-engineered from the live Vultr bundle (function VWe, line 117642
 * of the beautified index-CsG73Aq_.js).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Anchor,
  Eye,
  EyeOff,
  Layers,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

// Lazy lookup so the source compiles without the runner present.
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
      // Clear prior auto-trendlines first to keep the chart tidy.
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

  // ───── Render: docked sidebar (matches IndicatorsPanel pattern) ─────
  return (
    <div
      className="w-[340px] border-l border-border bg-card/50 overflow-y-auto flex-shrink-0 flex flex-col"
      data-testid="seeded-overlays-sidebar"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Seeds — {ticker}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {visibleCount}/{totalCount}
          </span>
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

      {/* Auto Trendline Indicator controls */}
      <div className="px-3 py-2 border-b border-border bg-muted/10">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Anchor className="w-3 h-3 text-cyan-400" />
          <span className="text-[11px] font-semibold">Auto Trendline Indicator</span>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <label
              className="text-[9px] uppercase tracking-wider text-muted-foreground"
              title="Fractal period — pivot needs n bars on each side. DojiEmoji default: 10."
            >
              n
            </label>
            <input
              type="number"
              min={2}
              max={500}
              value={atlN}
              onChange={(e) => setAtlN(Math.max(2, Math.min(500, Number(e.target.value) || 10)))}
              className="w-14 px-1 py-0.5 text-[11px] bg-background border border-border rounded"
              data-testid="atl-overlay-n"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Timeframe
            </label>
            <select
              value={atlTf}
              onChange={(e) => setAtlTf(e.target.value as "daily" | "weekly")}
              className="px-1 py-0.5 text-[11px] bg-background border border-border rounded"
              data-testid="atl-overlay-tf"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <Button
            size="sm"
            variant="default"
            className="h-6 text-[10px] px-2"
            onClick={runDraw}
            disabled={atlBusy}
            data-testid="atl-overlay-run"
          >
            {atlBusy ? "…" : "Draw"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2 text-red-400 hover:text-red-300"
            onClick={runClearAtl}
            disabled={atlBusy}
            title="Clear only the auto-trendline overlays (leaves manual seeds intact)"
            data-testid="atl-overlay-clear"
          >
            Clear
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <label
            className="flex items-center gap-1 text-[10px] cursor-pointer select-none"
            title="Find all significant trendlines (ranked) and horizontal support/resistance levels — not just one resistance + one support."
          >
            <input
              type="checkbox"
              checked={atlMulti}
              onChange={(e) => setAtlMulti(e.target.checked)}
              className="h-3 w-3 accent-cyan-500"
              data-testid="atl-overlay-multi"
            />
            <span className={atlMulti ? "text-cyan-300 font-semibold" : "text-muted-foreground"}>
              Multi mode
            </span>
          </label>
          {atlMulti && (
            <>
              <div className="flex items-center gap-1">
                <label
                  className="text-[9px] uppercase tracking-wider text-muted-foreground"
                  title="Max diagonal trendlines per side (resistance / support)."
                >
                  Diag/side
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={atlMaxDiag}
                  onChange={(e) =>
                    setAtlMaxDiag(Math.max(1, Math.min(10, Number(e.target.value) || 3)))
                  }
                  className="w-10 px-1 py-0.5 text-[10px] bg-background border border-border rounded"
                  data-testid="atl-overlay-max-diag"
                />
              </div>
              <div className="flex items-center gap-1">
                <label
                  className="text-[9px] uppercase tracking-wider text-muted-foreground"
                  title="Max horizontal S/R levels per side. Set 0 to disable horizontals."
                >
                  Horiz/side
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={atlMaxHorz}
                  onChange={(e) =>
                    setAtlMaxHorz(Math.max(0, Math.min(10, Number(e.target.value) || 0)))
                  }
                  className="w-10 px-1 py-0.5 text-[10px] bg-background border border-border rounded"
                  data-testid="atl-overlay-max-horz"
                />
              </div>
            </>
          )}
        </div>
        {atlMsg && (
          <div className="text-[10px] text-muted-foreground mt-1.5 font-mono">{atlMsg}</div>
        )}
      </div>

      {/* Body */}
      {totalCount === 0 ? (
        <div className="px-3 py-6 text-xs text-muted-foreground text-center">
          No seeded overlays for {ticker}.
          <br />
          Click "Draw" above, or send levels/trendlines from the Levels tab.
        </div>
      ) : (
        <>
          {/* Mass-action row */}
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setAllHidden(false)}
              data-testid="seeds-show-all"
            >
              <Eye className="w-3 h-3 mr-1" />
              Show all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setAllHidden(true)}
              data-testid="seeds-hide-all"
            >
              <EyeOff className="w-3 h-3 mr-1" />
              Hide all
            </Button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-red-400 hover:text-red-300"
              onClick={deleteAll}
              data-testid="seeds-delete-all"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete all
            </Button>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {levels.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/20">
                  S/R Levels ({levels.length})
                </div>
                {levels.map((lvl, idx) => {
                  const hidden = !!lvl.hidden;
                  return (
                    <div
                      key={`sr-${idx}-${lvl.price}-${lvl.maType ?? ""}-${lvl.maPeriod ?? ""}`}
                      className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-border/40 ${
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
                        {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                      <div className="flex-1 truncate font-mono">{formatLevelLabel(lvl)}</div>
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
            )}

            {trendlines.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/20">
                  Trendlines ({trendlines.length})
                </div>
                {trendlines.map((tl, idx) => {
                  const hidden = !!tl.hidden;
                  return (
                    <div
                      key={`tl-${idx}-${tl.date1}-${tl.price1}`}
                      className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-border/40 ${
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
                        {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                      <div className="flex-1 truncate font-mono">{formatTrendlineLabel(tl)}</div>
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
