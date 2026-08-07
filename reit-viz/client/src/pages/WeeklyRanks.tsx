// Weekly Ranks — manual, subjective conviction ranking. Order your book 1..N by
// drag, assert pairwise "A over B" calls, and the engine flags transitivity
// implications and contradictions live. Weekly snapshots with week-over-week Δ.
//
// The ranking is YOUR judgment; the app keeps it internally consistent. See
// docs/conviction-ranking-plan.md and lib/convictionGraph.ts (the pure engine).
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { GripVertical, ChevronUp, ChevronDown, X, Flag, AlertTriangle, Check, Trophy, Download, Save } from "lucide-react";
import { getTickers } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import { useBasketScope, BasketScopeSelect } from "@/components/BasketScopeSelect";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { loadServerPref, saveServerPref } from "@/lib/serverPrefs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeConviction, type ConvictionState } from "@/lib/convictionGraph";

interface Snapshot { id: string; name: string; date: string; order: string[]; pins: Array<[string, string]>; }
const SNAP_KEY = "reit-viz:weekly-ranks:snapshots";

export default function WeeklyRanks() {
  const { universeTickers } = useUniverse();
  const basketScope = useBasketScope("reit-viz:basket-scope:weekly-ranks");

  const { data: tickerMeta = [] } = useQuery({ queryKey: ["/api/tickers"], queryFn: () => getTickers() });
  const metaMap = useMemo(() => {
    const m = new Map<string, { name: string; sector: string }>();
    for (const t of tickerMeta as any[]) m.set(t.ticker, { name: t.name ?? t.ticker, sector: t.subsector || t.sector || "" });
    return m;
  }, [tickerMeta]);

  // ── Working state (restored per tab via useWorkspaceTab) ──────────────────
  const [order, setOrder] = useState<string[]>([]);
  const [pins, setPins] = useState<Array<[string, string]>>([]);
  const [extras, setExtras] = useState<string[]>([]);   // manually-added names
  const [removed, setRemoved] = useState<string[]>([]); // manually-excluded names
  const [addText, setAddText] = useState("");
  const [pinFrom, setPinFrom] = useState<string | null>(null); // "pin X over…" armed
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [compareId, setCompareId] = useState<string>("");
  const [snapName, setSnapName] = useState("");

  const serialize = useCallback(() => ({ order, pins, extras, removed, compareId }), [order, pins, extras, removed, compareId]);
  const restore = useCallback((s: any) => {
    if (Array.isArray(s?.order)) setOrder(s.order.filter((x: any) => typeof x === "string"));
    if (Array.isArray(s?.pins)) setPins(s.pins.filter((p: any) => Array.isArray(p) && p.length === 2));
    if (Array.isArray(s?.extras)) setExtras(s.extras.filter((x: any) => typeof x === "string"));
    if (Array.isArray(s?.removed)) setRemoved(s.removed.filter((x: any) => typeof x === "string"));
    if (typeof s?.compareId === "string") setCompareId(s.compareId);
  }, []);
  useWorkspaceTab("weekly-ranks", serialize, restore);

  // Load saved snapshots once. Guard against the load resolving AFTER the user
  // has already saved this session (would clobber the just-saved snapshot in
  // the UI even though serverPrefs already persisted it).
  const savedThisSession = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void loadServerPref<Snapshot[]>(SNAP_KEY).then((s) => {
      if (!cancelled && !savedThisSession.current && Array.isArray(s)) setSnapshots(s);
    });
    return () => { cancelled = true; };
  }, []);

  // ── The book = basket members ∪ manual extras − manual removals, honoring
  //    the app-wide universe filter. ────────────────────────────────────────
  const book = useMemo(() => {
    const set = new Set<string>();
    if (basketScope.members) for (const t of basketScope.members) set.add(t);
    for (const t of extras) set.add(t);
    for (const t of removed) set.delete(t);
    const arr = [...set];
    return universeTickers ? arr.filter((t) => universeTickers.has(t)) : arr;
  }, [basketScope.members, extras, removed, universeTickers]);

  // Reconcile the order against the book: keep existing ranks, append newcomers
  // (a "to place" tail), drop names no longer in the book.
  //
  // GUARD: never reconcile against an EMPTY book. The basket's member set loads
  // async (useBaskets), and `restore` re-sets `extras`, both of which flip the
  // `book` memo to [] for a tick — without this guard that transient empty book
  // wipes a restored/custom hand-ranking and it comes back in raw basket order.
  // A genuinely empty book (deselected basket, no extras) leaves the list
  // untouched; use per-row remove to clear names.
  useEffect(() => {
    if (book.length === 0) return;
    const bookSet = new Set(book);
    setOrder((prev) => {
      const kept = prev.filter((t) => bookSet.has(t));
      const keptSet = new Set(kept);
      const newcomers = book.filter((t) => !keptSet.has(t));
      const next = [...kept, ...newcomers];
      if (next.length === prev.length && next.every((t, i) => t === prev[i])) return prev;
      return next;
    });
    // Drop pins whose endpoints left the book (basket switch), so the calls
    // list never shows a name that's no longer ranked.
    setPins((prev) => {
      const next = prev.filter(([a, b]) => bookSet.has(a) && bookSet.has(b));
      return next.length === prev.length ? prev : next;
    });
  }, [book]);

  // ── Engine analysis (recompute on every edit; trivial at book size) ───────
  const analysis = useMemo(() => analyzeConviction({ order, pins } as ConvictionState), [order, pins]);
  const conflictSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of analysis.conflicts) { s.add(c.a); s.add(c.b); }
    return s;
  }, [analysis.conflicts]);
  const cycleSet = useMemo(() => new Set(analysis.cycles.flat()), [analysis.cycles]);

  // Last-week ranks from the chosen comparison snapshot (default: latest saved).
  const compareSnap = useMemo(() => {
    if (compareId) return snapshots.find((s) => s.id === compareId) ?? null;
    return snapshots.length ? snapshots[snapshots.length - 1] : null;
  }, [compareId, snapshots]);
  const lastWeekRank = useMemo(() => {
    const m = new Map<string, number>();
    if (compareSnap) compareSnap.order.forEach((t, i) => m.set(t, i + 1));
    return m;
  }, [compareSnap]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const move = (ticker: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const i = prev.indexOf(ticker);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const dragIdx = useRef<number | null>(null);
  const onDrop = (targetIdx: number) => {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from == null || from === targetIdx) return;
    setOrder((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(from < targetIdx ? targetIdx - 1 : targetIdx, 0, moved);
      return next;
    });
  };

  const addTicker = () => {
    const sym = addText.trim().toUpperCase();
    if (!sym) return;
    setRemoved((r) => r.filter((x) => x !== sym));
    setExtras((e) => (e.includes(sym) ? e : [...e, sym]));
    setAddText("");
  };
  const removeTicker = (ticker: string) => {
    setExtras((e) => e.filter((x) => x !== ticker));
    setRemoved((r) => (r.includes(ticker) ? r : [...r, ticker]));
    setPins((p) => p.filter(([a, b]) => a !== ticker && b !== ticker));
    // Filter the order directly — don't rely on the reconcile effect, which
    // no-ops when removing the last name empties the book (the guard above).
    setOrder((o) => o.filter((t) => t !== ticker));
    if (pinFrom === ticker) setPinFrom(null);
  };

  const addPin = (winner: string, loser: string) => {
    if (winner === loser) return;
    setPins((p) => (p.some(([a, b]) => a === winner && b === loser) ? p : [...p, [winner, loser]]));
  };
  const delPin = (winner: string, loser: string) =>
    setPins((p) => p.filter(([a, b]) => !(a === winner && b === loser)));

  // Click a row while "pin from X" is armed → assert X ▸ (clicked). Else arm.
  const onRowPinClick = (ticker: string) => {
    if (pinFrom == null) { setPinFrom(ticker); return; }
    if (pinFrom === ticker) { setPinFrom(null); return; }
    addPin(pinFrom, ticker);
    setPinFrom(null);
  };

  const snapToCalls = () => {
    if (analysis.suggestedOrder) setOrder(analysis.suggestedOrder);
  };

  const saveSnapshot = () => {
    savedThisSession.current = true;
    const now = new Date();
    const iso = now.toISOString().slice(0, 10);
    // Hash the full order AND pin content (not just pin count) so two distinct
    // rankings saved the same day don't collide onto one id and overwrite.
    const sig = order.join(",") + "|" + pins.map(([a, b]) => `${a}>${b}`).join(",");
    const snap: Snapshot = {
      id: `${iso}-${Math.abs(hashStr(sig)).toString(36)}`,
      name: snapName.trim() || `Week of ${iso}`,
      date: iso,
      order: order.slice(),
      pins: pins.map(([a, b]) => [a, b] as [string, string]),
    };
    const next = [...snapshots.filter((s) => s.id !== snap.id), snap];
    setSnapshots(next);
    saveServerPref(SNAP_KEY, next);
    setSnapName("");
  };
  const deleteSnapshot = (id: string) => {
    const next = snapshots.filter((s) => s.id !== id);
    setSnapshots(next);
    saveServerPref(SNAP_KEY, next);
    if (compareId === id) setCompareId("");
  };

  const exportCsv = () => {
    const lines = ["rank,ticker,name,last_week_rank,delta"];
    order.forEach((t, i) => {
      const lw = lastWeekRank.get(t);
      const delta = lw != null ? lw - (i + 1) : "";
      lines.push([i + 1, t, `"${(metaMap.get(t)?.name ?? t).replace(/"/g, '""')}"`, lw ?? "", delta].join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `weekly-ranks-${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  };

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const duel = analysis.nextDuel;

  return (
    <div className="flex flex-col h-full bg-background" data-testid="wr-root">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/50 flex-wrap flex-shrink-0">
        <span className="text-sm font-bold flex items-center gap-1.5"><Trophy className="w-4 h-4 text-primary" /> Weekly Ranks</span>
        <BasketScopeSelect scope={basketScope} />
        <div className="flex items-center gap-1">
          <Input value={addText} onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTicker(); }}
            placeholder="Add ticker…" className="h-7 w-28 text-xs" data-testid="wr-add-input" />
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={addTicker} data-testid="wr-add-btn">Add</Button>
        </div>
        <div className="h-5 w-px bg-border mx-0.5" />
        {/* Coverage meters */}
        <span className="text-[11px] text-muted-foreground" title="Share of all pairs you've explicitly called">
          committed <b className="text-foreground" data-testid="wr-committed-pct">{pct(analysis.committedPct)}</b>
        </span>
        <span className="text-[11px] text-muted-foreground" title="Share of the full ordering your calls (with transitivity) pin down">
          determined <b className="text-foreground" data-testid="wr-determined-pct">{pct(analysis.determinedPct)}</b>
        </span>
        {analysis.hasContradiction ? (
          <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1" data-testid="wr-contradiction-count">
            <AlertTriangle className="w-3 h-3" /> {analysis.cycles.length} contradiction{analysis.cycles.length > 1 ? "s" : ""}
          </span>
        ) : conflictSet.size > 0 ? (
          <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1" data-testid="wr-conflict-count">
            <AlertTriangle className="w-3 h-3" /> {analysis.conflicts.length} conflict{analysis.conflicts.length > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1" data-testid="wr-consistent">
            <Check className="w-3 h-3" /> consistent
          </span>
        )}
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs ml-auto"
          onClick={snapToCalls} disabled={analysis.hasContradiction || analysis.orderIsConsistent}
          title="Reorder to the arrangement closest to yours that honors every pin"
          data-testid="wr-snap-btn">Snap to my calls</Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={exportCsv} data-testid="wr-export"><Download className="w-3 h-3" />CSV</Button>
      </div>

      {/* Snapshot bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-[11px] flex-wrap flex-shrink-0">
        <span className="text-muted-foreground">compare vs</span>
        <select value={compareId} onChange={(e) => setCompareId(e.target.value)}
          className="h-6 bg-background border border-border rounded px-1 text-[11px]" data-testid="wr-snapshot-select">
          <option value="">latest ({snapshots.length ? snapshots[snapshots.length - 1].name : "none"})</option>
          {snapshots.slice().reverse().map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {compareSnap && (
          <button className="text-muted-foreground hover:text-destructive" onClick={() => deleteSnapshot(compareSnap.id)}
            title="Delete this snapshot" data-testid="wr-snapshot-delete">✕ del</button>
        )}
        <div className="h-4 w-px bg-border mx-0.5" />
        <Input value={snapName} onChange={(e) => setSnapName(e.target.value)} placeholder="Snapshot name…"
          className="h-6 w-40 text-[11px]" data-testid="wr-snapshot-name" />
        <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] gap-1" onClick={saveSnapshot} data-testid="wr-snapshot-save">
          <Save className="w-3 h-3" /> Save this week
        </Button>
        {pinFrom && (
          <span className="ml-auto text-[11px] text-cyan-300">Pinning <b>{pinFrom}</b> over… click a name below (or <button className="underline" onClick={() => setPinFrom(null)}>cancel</button>)</span>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Ranked list */}
        <div className="flex-1 overflow-auto" data-testid="wr-list">
          {order.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-6 text-center">
              Pick a basket or add tickers to start ranking your book.
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-card z-10 text-[10px] text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-8 py-1 text-right pr-1">#</th>
                  <th className="w-6"></th>
                  <th className="text-left py-1">Ticker</th>
                  <th className="text-left py-1">Name</th>
                  <th className="text-left py-1">Sector</th>
                  <th className="text-right py-1 pr-2" title="Last week's rank">LW</th>
                  <th className="text-right py-1 pr-2" title="Change vs last week (+ = moved up)">Δ</th>
                  <th className="text-right py-1 pr-2">Move</th>
                  <th className="text-right py-1 pr-2">Calls</th>
                </tr>
              </thead>
              <tbody>
                {order.map((t, i) => {
                  const meta = metaMap.get(t);
                  const lw = lastWeekRank.get(t);
                  const delta = lw != null ? lw - (i + 1) : null;
                  const inCycle = cycleSet.has(t);
                  const inConflict = !inCycle && conflictSet.has(t);
                  const armed = pinFrom === t;
                  return (
                    <tr key={t}
                      draggable
                      onDragStart={() => { dragIdx.current = i; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(i)}
                      className={`border-b border-border/40 hover:bg-card/60 ${armed ? "ring-1 ring-cyan-400/60" : ""} ${inCycle ? "bg-rose-500/10" : inConflict ? "bg-amber-500/10" : ""}`}
                      data-testid={`wr-row-${t}`}>
                      <td className="text-right pr-1 font-mono tabular-nums" data-testid={`wr-rank-${t}`}>{i + 1}</td>
                      <td className="text-muted-foreground cursor-grab"><GripVertical className="w-3 h-3" /></td>
                      <td className="font-mono font-semibold py-1">
                        {t}
                        {inCycle && <span className="ml-1 text-[9px] text-rose-400" data-testid={`wr-badge-cycle-${t}`} title="In a contradiction cycle">⟳ contradiction</span>}
                        {inConflict && <span className="ml-1 text-[9px] text-amber-400" data-testid={`wr-badge-conflict-${t}`} title="A pin is violated by this placement">⚠ conflict</span>}
                      </td>
                      <td className="text-muted-foreground truncate max-w-[220px]">{meta?.name ?? ""}</td>
                      <td className="text-[10px] text-muted-foreground">{meta?.sector ?? ""}</td>
                      <td className="text-right pr-2 font-mono text-muted-foreground">{lw ?? "—"}</td>
                      <td className={`text-right pr-2 font-mono ${delta == null ? "text-muted-foreground" : delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-muted-foreground"}`} data-testid={`wr-delta-${t}`}>
                        {delta == null ? "—" : delta > 0 ? `+${delta}` : delta}
                      </td>
                      <td className="text-right pr-2 whitespace-nowrap">
                        <button className="text-muted-foreground hover:text-foreground disabled:opacity-30" onClick={() => move(t, -1)} disabled={i === 0} data-testid={`wr-up-${t}`}><ChevronUp className="w-3.5 h-3.5 inline" /></button>
                        <button className="text-muted-foreground hover:text-foreground disabled:opacity-30 ml-1" onClick={() => move(t, 1)} disabled={i === order.length - 1} data-testid={`wr-down-${t}`}><ChevronDown className="w-3.5 h-3.5 inline" /></button>
                      </td>
                      <td className="text-right pr-2 whitespace-nowrap">
                        <button className={`hover:text-cyan-300 ${armed ? "text-cyan-300" : "text-muted-foreground"}`}
                          onClick={() => onRowPinClick(t)} title={pinFrom ? `Pin ${pinFrom} ▸ ${t}` : `Pin ${t} over another name`}
                          data-testid={`wr-pin-from-${t}`}><Flag className="w-3.5 h-3.5 inline" /></button>
                        <button className="text-muted-foreground hover:text-destructive ml-1.5" onClick={() => removeTicker(t)} title="Remove from book" data-testid={`wr-remove-${t}`}><X className="w-3.5 h-3.5 inline" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right rail: duel + pins */}
        <div className="w-[300px] border-l border-border flex flex-col min-h-0">
          {/* Duel */}
          <div className="p-3 border-b border-border">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Quick duel</div>
            {duel ? (
              <div className="space-y-1.5" data-testid="wr-duel">
                <div className="text-[10px] text-muted-foreground">Which do you prefer? (the least-supported pair)</div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs font-mono" onClick={() => { addPin(duel[0], duel[1]); }} data-testid="wr-duel-a">{duel[0]}</Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs font-mono" onClick={() => { addPin(duel[1], duel[0]); }} data-testid="wr-duel-b">{duel[1]}</Button>
                </div>
                <div className="text-[9.5px] text-muted-foreground">Implied calls are skipped automatically.</div>
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground" data-testid="wr-duel-done">Every pair is determined by your calls. 🎉</div>
            )}
          </div>
          {/* Pins list */}
          <div className="flex-1 overflow-auto p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Your calls ({pins.length}) {analysis.impliedPairs.length > 0 && <span className="text-cyan-300/80 font-normal normal-case">+ {analysis.impliedPairs.length} implied</span>}
            </div>
            <div className="space-y-0.5" data-testid="wr-pins-list">
              {pins.length === 0 && <div className="text-[10px] text-muted-foreground">No calls yet. Use the flag icon on a row, or the quick duel.</div>}
              {pins.map(([a, b]) => {
                const onCycle = analysis.cyclePins.some(([x, y]) => x === a && y === b);
                return (
                  <div key={`${a}>${b}`} className={`flex items-center gap-1 text-[11px] font-mono ${onCycle ? "text-rose-400" : ""}`} data-testid={`wr-pin-${a}-${b}`}>
                    <span className="font-semibold">{a}</span>
                    <span className="text-muted-foreground">▸</span>
                    <span>{b}</span>
                    {onCycle && <span className="text-[9px]">⟳</span>}
                    <button className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => delPin(a, b)} data-testid={`wr-pin-del-${a}-${b}`}><X className="w-3 h-3" /></button>
                  </div>
                );
              })}
            </div>
            {analysis.impliedPairs.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/40">
                <div className="text-[9.5px] text-muted-foreground mb-1">Implied by transitivity:</div>
                <div className="flex flex-wrap gap-1" data-testid="wr-implied-list">
                  {analysis.impliedPairs.slice(0, 40).map(([a, b]) => (
                    <span key={`${a}>${b}`} className="text-[9px] font-mono px-1 py-0.5 rounded border border-cyan-500/25 text-cyan-300/80">{a}▸{b}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
