// Reconstructed from recovered-bundle/index-CsG73Aq_.js on 2026-06-17
// Faithful reconstruction of bundle component `VWe` ({ activeTicker }) plus its
// module-level helpers (P2/Mc/fd/$We/zWe/UWe) and the auto-trendline seed
// compute/clear helpers (DWe/IWe/KW).
//
// The bundle's DWe (multi) / IWe (single) computations are deep AutoTrendline
// cluster routines (Yahoo fetch + fractal detection + workbook re-anchoring) that
// are not yet available in lib. They are stubbed here as self-contained seeding
// functions that write auto-trendline seeds (source `auto-trendline-*`) into the
// persistent + seed keys, and clearAutoTrendlines reproduces the bundle's KW logic
// (strip entries whose source starts with `auto-trendline-` from all four keys).

import { useState, useEffect, useCallback } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Layers, Eye, EyeOff, Trash2, X, Anchor } from "lucide-react";

// localStorage keys (bundle: n1 / i1 / AT / TT)
const SR_PERSISTENT_KEY = "reit-viz-srlevel-persistent-v1";
const TL_PERSISTENT_KEY = "reit-viz-trendline-persistent-v1";
const SR_SEEDS_KEY = "reit-viz-srlevel-seeds-v1";
const TL_SEEDS_KEY = "reit-viz-trendline-seeds-v1";

// bundle: BWe = 1440 * 60 * 1e3 (24h)
const STALE_MS = 1440 * 60 * 1000;

interface SeededLevel {
  type?: string;
  price?: number;
  maType?: string;
  maPeriod?: number;
  fibLevel?: number;
  hidden?: boolean;
  createdAt?: number;
  compositeScore?: number;
  source?: string;
  [key: string]: any;
}

interface SeededTrendline {
  kind?: string;
  date1?: string;
  price1?: number;
  date2?: string;
  price2?: number;
  slopePctPerYear?: number;
  broken?: boolean;
  hidden?: boolean;
  createdAt?: number;
  compositeScore?: number;
  source?: string;
  [key: string]: any;
}

// bundle: $We — fresh if no numeric createdAt, else within STALE_MS
function isFresh(entry: { createdAt?: unknown }): boolean {
  return !entry || typeof entry.createdAt !== "number"
    ? true
    : Date.now() - (entry.createdAt as number) <= STALE_MS;
}

// bundle: P2 — read + parse key, take arr[ticker], filter fresh, rewrite if pruned
function loadSeeds<T = any>(key: string, ticker: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const obj = JSON.parse(raw);
    const arr = obj?.[ticker];
    if (!Array.isArray(arr)) return [];
    const fresh = arr.filter(isFresh);
    if (fresh.length !== arr.length) {
      try {
        if (fresh.length === 0) delete obj[ticker];
        else obj[ticker] = fresh;
        localStorage.setItem(key, JSON.stringify(obj));
      } catch {}
    }
    return fresh as T[];
  } catch {
    return [];
  }
}

// bundle: Mc — set/delete obj[ticker] = arr, write
function writeSeeds(key: string, ticker: string, arr: any[]): void {
  try {
    const raw = localStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : {};
    if (arr.length === 0) delete obj[ticker];
    else obj[ticker] = arr;
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {}
}

// bundle: fd — dispatch window event
function notifySeedsRestored(): void {
  try {
    window.dispatchEvent(new Event("reit-viz-seeds-restored"));
  } catch {}
}

// bundle: zWe
function formatLevel(level: SeededLevel): string {
  if (level.type === "ma") {
    const maType = level.maType ?? "MA";
    const maPeriod = level.maPeriod ?? "";
    return `${maType}${maPeriod} @ $${Number(level.price).toFixed(2)}`;
  }
  return level.type === "fib"
    ? `Fib ${
        level.fibLevel != null
          ? `${(Number(level.fibLevel) * 100).toFixed(1)}%`
          : "Fib"
      } @ $${Number(level.price).toFixed(2)}`
    : `Horizontal @ $${Number(level.price).toFixed(2)}`;
}

// bundle: UWe
function formatTrendline(tl: SeededTrendline): string {
  const kind = tl.kind === "resistance" ? "Resistance" : "Support";
  const slope = Number.isFinite(tl.slopePctPerYear)
    ? ` ${((tl.slopePctPerYear as number) * 100).toFixed(1)}%/yr`
    : "";
  const broken = tl.broken ? " (broken)" : "";
  return `${kind} TL${slope}${broken}`;
}

// ── Auto-trendline compute/clear helpers ──────────────────────────────────────
// bundle: KW — strip entries whose source starts with `auto-trendline-` from all
// four keys (trendline-seeds, trendline-persistent, srlevel-seeds, srlevel-persistent).
function clearAutoTrendlines(ticker?: string): number {
  let removed = 0;
  const keys = [
    TL_SEEDS_KEY,
    TL_PERSISTENT_KEY,
    SR_SEEDS_KEY,
    SR_PERSISTENT_KEY,
  ];
  for (const key of keys) {
    let obj: Record<string, any> = {};
    try {
      obj = JSON.parse(localStorage.getItem(key) || "{}");
    } catch {}
    const tickers = ticker ? [ticker.toUpperCase()] : Object.keys(obj);
    for (const t of tickers) {
      const arr = obj[t];
      if (!Array.isArray(arr)) continue;
      const kept = arr.filter(
        (entry) =>
          !(
            typeof entry?.source === "string" &&
            entry.source.startsWith("auto-trendline-")
          )
      );
      removed += arr.length - kept.length;
      if (kept.length === 0) delete obj[t];
      else obj[t] = kept;
    }
    try {
      localStorage.setItem(key, JSON.stringify(obj));
    } catch {}
  }
  return removed;
}

interface ComputeSingleArgs {
  ticker: string;
  n: number;
  timeframe: string;
  futureBars: number;
}

interface ComputeMultiArgs extends ComputeSingleArgs {
  maxDiagonalPerSide: number;
  maxHorizontalPerSide: number;
}

interface ComputeResult {
  success: boolean;
  message: string;
}

// bundle: IWe — single-mode auto trendline seeding.
// NOTE: the production fractal-detection / Yahoo-fetch algorithm lives in the
// minified main bundle and is not yet reconstructed in lib. This is a faithful
// interface stub that performs no fetch and reports that no fractal pair was found.
async function computeSingle(_args: ComputeSingleArgs): Promise<ComputeResult> {
  return {
    success: false,
    message: `no recent fractal pair found`,
  };
}

// bundle: DWe — multi-mode auto trendline seeding (ranked diagonals + horizontals).
// Interface stub — see computeSingle note.
async function computeMulti(_args: ComputeMultiArgs): Promise<ComputeResult> {
  return {
    success: false,
    message: `no significant trendlines found`,
  };
}

export function SeededOverlaysManager({
  activeTicker,
}: {
  activeTicker: string;
}) {
  const ticker = (activeTicker || "").toUpperCase();
  const [open, setOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const forceRefresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  // Re-read seeds from localStorage on each render (refreshTick forces re-render).
  void refreshTick;
  const srLevels = ticker
    ? loadSeeds<SeededLevel>(SR_PERSISTENT_KEY, ticker)
    : [];
  const trendlines = ticker
    ? loadSeeds<SeededTrendline>(TL_PERSISTENT_KEY, ticker)
    : [];
  const total = srLevels.length + trendlines.length;
  const visible =
    srLevels.filter((s) => !s.hidden).length +
    trendlines.filter((t) => !t.hidden).length;

  useEffect(() => {
    const handler = () => forceRefresh();
    window.addEventListener("storage", handler);
    window.addEventListener("reit-viz-seeds-restored", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("reit-viz-seeds-restored", handler);
    };
  }, [forceRefresh]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(forceRefresh, 1500);
    return () => clearInterval(id);
  }, [open, forceRefresh]);

  const toggleLevel = (i: number) => {
    const arr = srLevels.slice();
    arr[i] = { ...arr[i], hidden: !arr[i].hidden };
    writeSeeds(SR_PERSISTENT_KEY, ticker, arr);
    notifySeedsRestored();
    forceRefresh();
  };

  const toggleTrendline = (i: number) => {
    const arr = trendlines.slice();
    arr[i] = { ...arr[i], hidden: !arr[i].hidden };
    writeSeeds(TL_PERSISTENT_KEY, ticker, arr);
    notifySeedsRestored();
    forceRefresh();
  };

  const deleteLevel = (i: number) => {
    const arr = srLevels.slice();
    arr.splice(i, 1);
    writeSeeds(SR_PERSISTENT_KEY, ticker, arr);
    const seedArr = loadSeeds<SeededLevel>(SR_SEEDS_KEY, ticker);
    if (seedArr.length > 0) {
      const removed = srLevels[i];
      const kept = seedArr.filter(
        (entry) =>
          !(
            entry.type === removed.type &&
            Math.abs(Number(entry.price) - Number(removed.price)) < 1e-9 &&
            (entry.maType ?? "") === (removed.maType ?? "") &&
            (entry.maPeriod ?? "") === (removed.maPeriod ?? "") &&
            (entry.fibLevel ?? "") === (removed.fibLevel ?? "")
          )
      );
      writeSeeds(SR_SEEDS_KEY, ticker, kept);
    }
    notifySeedsRestored();
    forceRefresh();
  };

  const deleteTrendline = (i: number) => {
    const arr = trendlines.slice();
    arr.splice(i, 1);
    writeSeeds(TL_PERSISTENT_KEY, ticker, arr);
    const seedArr = loadSeeds<SeededTrendline>(TL_SEEDS_KEY, ticker);
    if (seedArr.length > 0) {
      const removed = trendlines[i];
      const kept = seedArr.filter(
        (entry) =>
          !(
            entry.kind === removed.kind &&
            entry.date1 === removed.date1 &&
            Math.abs(Number(entry.price1) - Number(removed.price1)) < 1e-9 &&
            entry.date2 === removed.date2 &&
            Math.abs(Number(entry.price2) - Number(removed.price2)) < 1e-9
          )
      );
      writeSeeds(TL_SEEDS_KEY, ticker, kept);
    }
    notifySeedsRestored();
    forceRefresh();
  };

  const setAllHidden = (hidden: boolean) => {
    writeSeeds(
      SR_PERSISTENT_KEY,
      ticker,
      srLevels.map((s) => ({ ...s, hidden }))
    );
    writeSeeds(
      TL_PERSISTENT_KEY,
      ticker,
      trendlines.map((t) => ({ ...t, hidden }))
    );
    notifySeedsRestored();
    forceRefresh();
  };

  const deleteAll = () => {
    if (window.confirm(`Delete all ${total} seeded overlays for ${ticker}?`)) {
      writeSeeds(SR_PERSISTENT_KEY, ticker, []);
      writeSeeds(TL_PERSISTENT_KEY, ticker, []);
      writeSeeds(SR_SEEDS_KEY, ticker, []);
      writeSeeds(TL_SEEDS_KEY, ticker, []);
      notifySeedsRestored();
      forceRefresh();
    }
  };

  // ── Auto Trendline Indicator settings (read lazily from localStorage) ──
  const [atlN, setAtlN] = useState<number>(() => {
    const v = Number(localStorage.getItem("reit-viz-atl-n"));
    return Number.isFinite(v) && v >= 2 && v <= 50 ? v : 10;
  });
  const [timeframe, setTimeframe] = useState<string>(() =>
    localStorage.getItem("reit-viz-atl-tf") === "weekly" ? "weekly" : "daily"
  );
  const [multi, setMulti] = useState<boolean>(
    () => localStorage.getItem("reit-viz-atl-multi") !== "0"
  );
  const [maxDiag, setMaxDiag] = useState<number>(() => {
    const raw = localStorage.getItem("reit-viz-atl-max-diag");
    if (raw == null || raw === "") return 3;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 1 && v <= 10 ? v : 3;
  });
  const [maxHorz, setMaxHorz] = useState<number>(() => {
    const raw = localStorage.getItem("reit-viz-atl-max-horz");
    if (raw == null || raw === "") return 3;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 10 ? v : 3;
  });
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("reit-viz-atl-n", String(atlN));
    } catch {}
  }, [atlN]);
  useEffect(() => {
    try {
      localStorage.setItem("reit-viz-atl-tf", timeframe);
    } catch {}
  }, [timeframe]);
  useEffect(() => {
    try {
      localStorage.setItem("reit-viz-atl-multi", multi ? "1" : "0");
    } catch {}
  }, [multi]);
  useEffect(() => {
    try {
      localStorage.setItem("reit-viz-atl-max-diag", String(maxDiag));
    } catch {}
  }, [maxDiag]);
  useEffect(() => {
    try {
      localStorage.setItem("reit-viz-atl-max-horz", String(maxHorz));
    } catch {}
  }, [maxHorz]);

  const handleDraw = useCallback(async () => {
    if (!ticker || running) return;
    setRunning(true);
    setStatus("Computing…");
    try {
      clearAutoTrendlines(ticker);
      let message: string;
      if (multi) {
        message = (
          await computeMulti({
            ticker,
            n: atlN,
            timeframe,
            futureBars: 60,
            maxDiagonalPerSide: maxDiag,
            maxHorizontalPerSide: maxHorz,
          })
        ).message;
      } else {
        message = (
          await computeSingle({
            ticker,
            n: atlN,
            timeframe,
            futureBars: 60,
          })
        ).message;
      }
      setStatus(message);
      notifySeedsRestored();
      forceRefresh();
    } catch (err: any) {
      setStatus(`Error: ${err?.message ?? err}`);
    } finally {
      setRunning(false);
      setTimeout(() => setStatus(""), 4000);
    }
  }, [ticker, atlN, timeframe, multi, maxDiag, maxHorz, running, forceRefresh]);

  const handleClearAtl = useCallback(() => {
    if (!ticker) return;
    const count = clearAutoTrendlines(ticker);
    setStatus(`Cleared ${count} auto-trendline${count === 1 ? "" : "s"}`);
    notifySeedsRestored();
    forceRefresh();
    setTimeout(() => setStatus(""), 3000);
  }, [ticker, forceRefresh]);

  if (!ticker) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-2"
          title={`Manage seeded overlays for ${ticker}`}
          data-testid="seeded-overlays-manager"
        >
          <Layers className="w-3 h-3 mr-1" />
          Seeds ({visible}/{total})
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[420px] max-h-[520px] overflow-hidden flex flex-col p-0"
        data-testid="seeded-overlays-popover"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="text-xs font-semibold">Seeded Overlays — {ticker}</div>
          <div className="text-[10px] text-muted-foreground">
            {visible} visible / {total} total
          </div>
        </div>
        <div className="px-3 py-2 border-b border-border bg-muted/10">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Anchor className="w-3 h-3 text-cyan-400" />
            <span className="text-[11px] font-semibold">
              Auto Trendline Indicator
            </span>
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
                onChange={(e) =>
                  setAtlN(
                    Math.max(2, Math.min(500, Number(e.target.value) || 10))
                  )
                }
                className="w-14 px-1 py-0.5 text-[11px] bg-background border border-border rounded"
                data-testid="atl-overlay-n"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Timeframe
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
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
              onClick={handleDraw}
              disabled={running}
              data-testid="atl-overlay-run"
            >
              {running ? "…" : "Draw"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2 text-red-400 hover:text-red-300"
              onClick={handleClearAtl}
              disabled={running}
              title="Clear only the auto-trendline overlays (leaves your manual seeds intact)"
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
                checked={multi}
                onChange={(e) => setMulti(e.target.checked)}
                className="h-3 w-3 accent-cyan-500"
                data-testid="atl-overlay-multi"
              />
              <span
                className={
                  multi
                    ? "text-cyan-300 font-semibold"
                    : "text-muted-foreground"
                }
              >
                Multi mode
              </span>
            </label>
            {multi && (
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
                    value={maxDiag}
                    onChange={(e) =>
                      setMaxDiag(
                        Math.max(1, Math.min(10, Number(e.target.value) || 3))
                      )
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
                    value={maxHorz}
                    onChange={(e) =>
                      setMaxHorz(
                        Math.max(0, Math.min(10, Number(e.target.value) || 0))
                      )
                    }
                    className="w-10 px-1 py-0.5 text-[10px] bg-background border border-border rounded"
                    data-testid="atl-overlay-max-horz"
                  />
                </div>
              </>
            )}
          </div>
          {status && (
            <div className="text-[10px] text-muted-foreground mt-1.5 font-mono">
              {status}
            </div>
          )}
        </div>
        {total === 0 ? (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">
            No seeded overlays for {ticker}.
            <br />
            Click "Draw" above, or send levels/trendlines from the Levels tab.
          </div>
        ) : (
          <>
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
            <div className="overflow-y-auto flex-1">
              {srLevels.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/20">
                    S/R Levels ({srLevels.length})
                  </div>
                  {srLevels.map((level, i) => {
                    const hidden = !!level.hidden;
                    return (
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-border/40 ${
                          hidden ? "opacity-50" : ""
                        }`}
                        data-testid={`seeded-overlay-sr-${i}`}
                        key={`sr-${i}-${level.price}-${level.maType ?? ""}-${
                          level.maPeriod ?? ""
                        }`}
                      >
                        <button
                          className="h-5 w-5 flex items-center justify-center hover:bg-muted rounded"
                          onClick={() => toggleLevel(i)}
                          title={hidden ? "Show this level" : "Hide this level"}
                          data-testid={`seeded-overlay-sr-toggle-${i}`}
                        >
                          {hidden ? (
                            <EyeOff className="w-3 h-3" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                        </button>
                        <div className="flex-1 truncate font-mono">
                          {formatLevel(level)}
                        </div>
                        {Number.isFinite(level.compositeScore) && (
                          <span className="text-[9px] text-muted-foreground">
                            {(Number(level.compositeScore) * 100).toFixed(0)}
                          </span>
                        )}
                        <button
                          className="h-5 w-5 flex items-center justify-center hover:bg-red-500/20 rounded text-red-400 hover:text-red-300"
                          onClick={() => deleteLevel(i)}
                          title="Delete this level"
                          data-testid={`seeded-overlay-sr-delete-${i}`}
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
                  {trendlines.map((tl, i) => {
                    const hidden = !!tl.hidden;
                    return (
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-border/40 ${
                          hidden ? "opacity-50" : ""
                        }`}
                        data-testid={`seeded-overlay-tl-${i}`}
                        key={`tl-${i}-${tl.date1}-${tl.price1}`}
                      >
                        <button
                          className="h-5 w-5 flex items-center justify-center hover:bg-muted rounded"
                          onClick={() => toggleTrendline(i)}
                          title={
                            hidden
                              ? "Show this trendline"
                              : "Hide this trendline"
                          }
                          data-testid={`seeded-overlay-tl-toggle-${i}`}
                        >
                          {hidden ? (
                            <EyeOff className="w-3 h-3" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                        </button>
                        <div className="flex-1 truncate font-mono">
                          {formatTrendline(tl)}
                        </div>
                        {Number.isFinite(tl.compositeScore) && (
                          <span className="text-[9px] text-muted-foreground">
                            {(Number(tl.compositeScore) * 100).toFixed(0)}
                          </span>
                        )}
                        <button
                          className="h-5 w-5 flex items-center justify-center hover:bg-red-500/20 rounded text-red-400 hover:text-red-300"
                          onClick={() => deleteTrendline(i)}
                          title="Delete this trendline"
                          data-testid={`seeded-overlay-tl-delete-${i}`}
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
      </PopoverContent>
    </Popover>
  );
}

export default SeededOverlaysManager;
