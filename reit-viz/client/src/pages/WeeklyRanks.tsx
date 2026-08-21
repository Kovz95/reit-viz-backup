// Weekly Ranks — manual, subjective conviction ranking. Order your book 1..N by
// drag, assert pairwise "A over B" calls, and the engine flags transitivity
// implications and contradictions live. Weekly snapshots with week-over-week Δ.
//
// The ranking is YOUR judgment; the app keeps it internally consistent. See
// docs/conviction-ranking-plan.md and lib/convictionGraph.ts (the pure engine).
import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { GripVertical, ChevronUp, ChevronDown, X, Flag, AlertTriangle, Check, Trophy, Download, Save, Swords, ListOrdered, TrendingUp, SkipForward, Undo2, Plus, Pencil, Trash2 } from "lucide-react";
import { getTickers } from "@/lib/dataService";
import { useTableSort, SortHeader } from "@/lib/useTableSort";
import { useUniverse } from "@/lib/universeContext";
import { BasketScopeSelect } from "@/components/BasketScopeSelect";
import { useBaskets } from "@/lib/useBaskets";
import { loadServerPref, saveServerPref } from "@/lib/serverPrefs";
import { PagePresets } from "@/components/PagePresets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyzeConviction, compareRankings, pairKey, type ConvictionState } from "@/lib/convictionGraph";

interface Snapshot { id: string; name: string; date: string; order: string[]; pins: Array<[string, string]>; ties?: Array<[string, string]>; }
const SNAP_KEY = "reit-viz:weekly-ranks:snapshots"; // legacy single-list snapshots (migrated into a default list)
const LISTS_KEY = "reit-viz:weekly-ranks:lists";

// A named ranking list — its own book/scope, order, calls, ties, and snapshots.
interface RankList {
  id: string;
  name: string;
  order: string[];
  pins: Array<[string, string]>;
  ties: Array<[string, string]>;
  extras: string[];
  removed: string[];
  basketId: string;
  compareId: string;
  snapshots: Snapshot[];
}
const newListId = () => `wl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

// The six classification levels the app carries on every ticker, coarse→fine.
type GroupLevel = "none" | "economy" | "sector" | "subsector" | "industryGroup" | "industry" | "subindustry";
const GROUP_LEVELS: Array<{ value: GroupLevel; label: string }> = [
  { value: "none", label: "No grouping" },
  { value: "economy", label: "Economy" },
  { value: "sector", label: "Sector" },
  { value: "subsector", label: "Subsector" },
  { value: "industryGroup", label: "Industry Group" },
  { value: "industry", label: "Industry" },
  { value: "subindustry", label: "Subindustry" },
];

export default function WeeklyRanks() {
  const { universeTickers } = useUniverse();
  const { baskets, getBasket } = useBaskets();

  const { data: tickerMeta = [] } = useQuery({ queryKey: ["/api/tickers"], queryFn: () => getTickers() });
  const metaMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const t of tickerMeta as any[]) m.set(t.ticker, t);
    return m;
  }, [tickerMeta]);
  const classOf = (t: string, level: GroupLevel): string =>
    level === "none" ? "" : (metaMap.get(t)?.[level] || "— unclassified —");
  const sectorLabel = (t: string) => metaMap.get(t)?.subsector || metaMap.get(t)?.sector || "";

  // ── Working state (restored per tab via useWorkspaceTab) ──────────────────
  const [order, setOrder] = useState<string[]>([]);
  const [pins, setPins] = useState<Array<[string, string]>>([]);
  const [ties, setTies] = useState<Array<[string, string]>>([]); // A ≈ B indifference (tiers)
  const [extras, setExtras] = useState<string[]>([]);   // manually-added names
  const [removed, setRemoved] = useState<string[]>([]); // manually-excluded names
  const [addText, setAddText] = useState("");
  const [pinFrom, setPinFrom] = useState<string | null>(null); // "pin X over…" armed
  const [tieFrom, setTieFrom] = useState<string | null>(null); // "tie X with…" armed
  const [view, setView] = useState<"rank" | "duel" | "changes">("rank");
  const [groupBy, setGroupBy] = useState<GroupLevel>("subindustry");
  const [skipped, setSkipped] = useState<Set<string>>(new Set()); // duel pairs passed on
  const [duelUndo, setDuelUndo] = useState<Array<{ kind: "pin" | "tie"; a: string; b: string }>>([]); // duel actions, for undo
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [compareId, setCompareId] = useState<string>("");
  const [snapName, setSnapName] = useState("");
  const [basketId, setBasketId] = useState(""); // scope basket, owned per-list

  // ── Multiple named lists (each with its own scope/order/calls/snapshots) ──
  const [lists, setLists] = useState<RankList[]>([]);
  const [activeId, setActiveId] = useState("");
  const [listName, setListName] = useState("");
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const hydratedRef = useRef(false);

  const loadListIntoWorking = useCallback((l: RankList) => {
    setOrder(l.order ?? []);
    setPins(l.pins ?? []);
    setTies(l.ties ?? []);
    setExtras(l.extras ?? []);
    setRemoved(l.removed ?? []);
    setBasketId(l.basketId ?? "");
    setCompareId(l.compareId ?? "");
    setSnapshots(l.snapshots ?? []);
    setPinFrom(null); setTieFrom(null); setSkipped(new Set()); setDuelUndo([]);
  }, []);

  // Load the lists collection once; migrate the legacy single-list snapshots
  // into a default "My Book" on first upgrade.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadServerPref<{ activeId: string; lists: RankList[] }>(LISTS_KEY),
      loadServerPref<Snapshot[]>(SNAP_KEY),
    ]).then(([blob, oldSnaps]) => {
      if (cancelled) return;
      let ls = (blob?.lists ?? []).filter((l) => l && typeof l.id === "string");
      let aid = blob?.activeId ?? "";
      if (!ls.length) {
        ls = [{ id: newListId(), name: "My Book", order: [], pins: [], ties: [], extras: [], removed: [], basketId: "", compareId: "", snapshots: Array.isArray(oldSnaps) ? oldSnaps : [] }];
      }
      if (!ls.find((l) => l.id === aid)) aid = ls[0].id;
      setLists(ls);
      setActiveId(aid);
      loadListIntoWorking(ls.find((l) => l.id === aid)!);
      hydratedRef.current = true;
    });
    return () => { cancelled = true; };
  }, [loadListIntoWorking]);

  // Mirror the working state back into the active list, and persist the
  // collection (debounced). Both no-op until hydration completes.
  useEffect(() => {
    if (!hydratedRef.current || !activeId) return;
    setLists((prev) => prev.map((l) => l.id === activeId ? { ...l, order, pins, ties, extras, removed, basketId, compareId, snapshots } : l));
  }, [order, pins, ties, extras, removed, basketId, compareId, snapshots, activeId]);
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveServerPref(LISTS_KEY, { activeId, lists });
  }, [lists, activeId]);

  const switchList = (id: string) => {
    if (id === activeId) return;
    const target = lists.find((l) => l.id === id);
    if (!target) return;
    setActiveId(id);
    loadListIntoWorking(target);
    setListMenuOpen(false);
  };
  const addList = () => {
    const nl: RankList = { id: newListId(), name: listName.trim() || `List ${lists.length + 1}`, order: [], pins: [], ties: [], extras: [], removed: [], basketId: "", compareId: "", snapshots: [] };
    setLists((prev) => [...prev, nl]);
    setActiveId(nl.id);
    loadListIntoWorking(nl);
    setListName("");
  };
  const renameActive = () => {
    const nm = listName.trim();
    if (!nm) return;
    setLists((prev) => prev.map((l) => l.id === activeId ? { ...l, name: nm } : l));
    setListName("");
  };
  const deleteActive = () => {
    if (lists.length <= 1) return; // always keep one list
    const remaining = lists.filter((l) => l.id !== activeId);
    setLists(remaining);
    setActiveId(remaining[0].id);
    loadListIntoWorking(remaining[0]);
    setListMenuOpen(false);
  };
  const activeList = lists.find((l) => l.id === activeId);

  // ── Scope: resolve the active list's basket to a member set. ──────────────
  const activeBasket = basketId ? (getBasket(basketId) as any) : undefined;
  const members = useMemo(
    () => (activeBasket ? new Set(activeBasket.tickers.map((t: string) => t.toUpperCase())) : null),
    [activeBasket?.id, activeBasket?.updatedAt, baskets],
  );
  const scope = useMemo(() => ({
    baskets, basketId, setBasketId,
    basketName: activeBasket?.name ?? null,
    members,
    inScope: (t: string) => !members || members.has(t.toUpperCase()),
  }), [baskets, basketId, activeBasket, members]);

  // ── The book = basket members ∪ manual extras − manual removals, honoring
  //    the app-wide universe filter. ────────────────────────────────────────
  const book = useMemo(() => {
    const set = new Set<string>();
    if (members) for (const t of members as Set<string>) set.add(t);
    for (const t of extras) set.add(t);
    for (const t of removed) set.delete(t);
    const arr = [...set];
    return universeTickers ? arr.filter((t) => universeTickers.has(t)) : arr;
  }, [members, extras, removed, universeTickers]);

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
    setTies((prev) => {
      const next = prev.filter(([a, b]) => bookSet.has(a) && bookSet.has(b));
      return next.length === prev.length ? prev : next;
    });
  }, [book]);

  // ── Engine analysis (recompute on every edit; trivial at book size) ───────
  const analysis = useMemo(() => analyzeConviction({ order, pins, ties } as ConvictionState, { skip: skipped }), [order, pins, ties, skipped]);
  const tierIndex = useMemo(() => {
    const m = new Map<string, number>();
    analysis.tiers.forEach((t, i) => t.forEach((n) => m.set(n, i)));
    return m;
  }, [analysis.tiers]);
  const tierGapSet = useMemo(() => new Set(analysis.tierGapNodes), [analysis.tierGapNodes]);
  // Snapping is worthwhile when there's a conflict OR a tier that isn't grouped.
  const canSnap = !analysis.hasContradiction && (!analysis.orderIsConsistent || analysis.tierGapNodes.length > 0);
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

  // Week-over-week diff for the Changes view.
  const cmp = useMemo(() => (compareSnap ? compareRankings(order, compareSnap.order) : null), [order, compareSnap]);

  // Movers table sort — empty key keeps compareRankings' |Δ|-desc default.
  const moversSort = useTableSort<any>("", "desc", "desc", "wr-movers");
  const sortedMovers = useMemo(() => {
    const movers = cmp?.movers ?? [];
    return moversSort.apply(movers, (m: any, key) => {
      switch (key) {
        case "ticker": return m.ticker;
        case "name": return metaMap.get(m.ticker)?.name ?? "";
        case "from": return m.from ?? null;
        case "to": return m.to;
        case "delta": return m.delta ?? null; // NEW entries (no delta) sort last
        default: return null;
      }
    });
  }, [cmp, moversSort.apply, metaMap]);

  // Group the ranking by a classification level, preserving each name's global
  // rank. Groups are ordered by their best (top) rank; each carries count +
  // best/avg rank so you can see how you're ranking within subcategories.
  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const g = new Map<string, string[]>();
    order.forEach((t) => { const v = classOf(t, groupBy); (g.get(v) ?? g.set(v, []).get(v)!).push(t); });
    const posOf = new Map<string, number>();
    order.forEach((t, i) => posOf.set(t, i));
    return [...g.entries()]
      .map(([label, members]) => {
        const ranks = members.map((t) => posOf.get(t)! + 1);
        const best = Math.min(...ranks);
        const avg = ranks.reduce((s, r) => s + r, 0) / ranks.length;
        return { label, members, count: members.length, best, avg };
      })
      .sort((a, b) => a.best - b.best);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, order, metaMap]);

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
    setTies((t) => t.filter(([a, b]) => a !== ticker && b !== ticker));
    // Filter the order directly — don't rely on the reconcile effect, which
    // no-ops when removing the last name empties the book (the guard above).
    setOrder((o) => o.filter((t) => t !== ticker));
    if (pinFrom === ticker) setPinFrom(null);
    if (tieFrom === ticker) setTieFrom(null);
  };

  const addTie = (a: string, b: string) => {
    if (a === b) return;
    setTies((t) => (t.some(([x, y]) => pairKey(x, y) === pairKey(a, b)) ? t : [...t, [a, b]]));
  };
  const delTie = (a: string, b: string) => setTies((t) => t.filter(([x, y]) => pairKey(x, y) !== pairKey(a, b)));

  const addPin = (winner: string, loser: string) => {
    if (winner === loser) return;
    setPins((p) => (p.some(([a, b]) => a === winner && b === loser) ? p : [...p, [winner, loser]]));
  };
  const delPin = (winner: string, loser: string) =>
    setPins((p) => p.filter(([a, b]) => !(a === winner && b === loser)));

  // Click a row while "pin from X" is armed → assert X ▸ (clicked). Else arm.
  const onRowPinClick = (ticker: string) => {
    setTieFrom(null);
    if (pinFrom == null) { setPinFrom(ticker); return; }
    if (pinFrom === ticker) { setPinFrom(null); return; }
    addPin(pinFrom, ticker);
    setPinFrom(null);
  };
  // Click "=" while "tie from X" is armed → assert X ≈ (clicked). Else arm.
  const onRowTieClick = (ticker: string) => {
    setPinFrom(null);
    if (tieFrom == null) { setTieFrom(ticker); return; }
    if (tieFrom === ticker) { setTieFrom(null); return; }
    addTie(tieFrom, ticker);
    setTieFrom(null);
  };

  const snapToCalls = () => {
    if (analysis.suggestedOrder) setOrder(analysis.suggestedOrder);
  };

  // ── Duel flow ─────────────────────────────────────────────────────────────
  const answerDuel = (winner: string, loser: string) => {
    addPin(winner, loser);
    setDuelUndo((u) => [...u, { kind: "pin", a: winner, b: loser }]);
  };
  const answerTie = (a: string, b: string) => {
    addTie(a, b);
    setDuelUndo((u) => [...u, { kind: "tie", a, b }]);
  };
  const skipDuel = () => {
    if (analysis.nextDuel) setSkipped((s) => new Set(s).add(pairKey(analysis.nextDuel![0], analysis.nextDuel![1])));
  };
  const undoDuel = () => {
    setDuelUndo((u) => {
      if (!u.length) return u;
      const last = u[u.length - 1];
      if (last.kind === "pin") setPins((p) => p.filter(([x, y]) => !(x === last.a && y === last.b)));
      else setTies((t) => t.filter(([x, y]) => pairKey(x, y) !== pairKey(last.a, last.b)));
      return u.slice(0, -1);
    });
  };
  const resetSkips = () => setSkipped(new Set());

  // Keyboard in duel view: ← left, → right, T tie, S skip, U undo.
  useEffect(() => {
    if (view !== "duel") return;
    const onKey = (e: KeyboardEvent) => {
      const d = analysis.nextDuel;
      if (e.key === "ArrowLeft" && d) { e.preventDefault(); answerDuel(d[0], d[1]); }
      else if (e.key === "ArrowRight" && d) { e.preventDefault(); answerDuel(d[1], d[0]); }
      else if ((e.key === "t" || e.key === "T") && d) { e.preventDefault(); answerTie(d[0], d[1]); }
      else if ((e.key === "s" || e.key === "S") && d) { e.preventDefault(); skipDuel(); }
      else if (e.key === "u" || e.key === "U") { e.preventDefault(); undoDuel(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, analysis.nextDuel]);

  const saveSnapshot = () => {
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
      ties: ties.map(([a, b]) => [a, b] as [string, string]),
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

  // One ranked row — reused by the flat list and every classification group.
  const renderRow = (t: string) => {
    const i = order.indexOf(t);
    const meta = metaMap.get(t);
    const lw = lastWeekRank.get(t);
    const delta = lw != null ? lw - (i + 1) : null;
    const inCycle = cycleSet.has(t);
    const inConflict = !inCycle && conflictSet.has(t);
    const armed = pinFrom === t;
    const tieArmed = tieFrom === t;
    const tier = tierIndex.get(t);
    const tierGap = tierGapSet.has(t);
    return (
      <tr key={t}
        draggable
        onDragStart={() => { dragIdx.current = i; }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDrop(i)}
        className={`border-b border-border/40 hover:bg-card/60 ${armed ? "ring-1 ring-cyan-400/60" : ""} ${tieArmed ? "ring-1 ring-violet-400/60" : ""} ${inCycle ? "bg-rose-500/10" : inConflict ? "bg-amber-500/10" : tier != null ? "bg-violet-500/[0.06]" : ""}`}
        data-testid={`wr-row-${t}`}>
        <td className="text-right pr-1 font-mono tabular-nums" data-testid={`wr-rank-${t}`}>{i + 1}</td>
        <td className="text-muted-foreground cursor-grab"><GripVertical className="w-3 h-3" /></td>
        <td className="font-mono font-semibold py-1">
          {t}
          {tier != null && <span className={`ml-1 text-[9px] px-1 rounded ${tierGap ? "text-amber-400 border border-amber-500/40" : "text-violet-300 bg-violet-500/15"}`} data-testid={`wr-tier-${t}`} title={tierGap ? "Tier not grouped — snap to group it" : `Tier ${tier + 1} (indifferent)`}>≈{tier + 1}{tierGap ? " gap" : ""}</span>}
          {inCycle && <span className="ml-1 text-[9px] text-rose-400" data-testid={`wr-badge-cycle-${t}`} title="In a contradiction cycle">⟳ contradiction</span>}
          {inConflict && <span className="ml-1 text-[9px] text-amber-400" data-testid={`wr-badge-conflict-${t}`} title="A pin is violated by this placement">⚠ conflict</span>}
        </td>
        <td className="text-muted-foreground truncate max-w-[220px]">{meta?.name ?? ""}</td>
        <td className="text-[10px] text-muted-foreground">{sectorLabel(t)}</td>
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
          <button className={`ml-1.5 font-bold ${tieArmed ? "text-violet-300" : "text-muted-foreground hover:text-violet-300"}`}
            onClick={() => onRowTieClick(t)} title={tieFrom ? `Tie ${tieFrom} ≈ ${t}` : `Tie ${t} with another name (same tier)`}
            data-testid={`wr-tie-from-${t}`}>≈</button>
          <button className="text-muted-foreground hover:text-destructive ml-1.5" onClick={() => removeTicker(t)} title="Remove from book" data-testid={`wr-remove-${t}`}><X className="w-3.5 h-3.5 inline" /></button>
        </td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background" data-testid="wr-root">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/50 flex-wrap flex-shrink-0">
        <span className="text-sm font-bold flex items-center gap-1.5"><Trophy className="w-4 h-4 text-primary" /> Weekly Ranks</span>
        {/* List selector — each list is its own book/scope/ranking/snapshots */}
        <div className="flex items-center gap-1">
          <select value={activeId} onChange={(e) => switchList(e.target.value)} data-testid="wr-list-select"
            className="h-7 bg-background border border-border rounded px-1 text-xs max-w-[160px]" title="Switch ranking list">
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <div className="relative">
            <Button size="sm" variant="outline" className="h-7 px-1.5" onClick={() => setListMenuOpen((o) => !o)} data-testid="wr-list-menu" title="Manage lists"><Pencil className="w-3 h-3" /></Button>
            {listMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-30 bg-card border border-border rounded shadow-lg p-2 w-56 space-y-1.5" data-testid="wr-list-menu-panel">
                <div className="flex gap-1">
                  <Input value={listName} onChange={(e) => setListName(e.target.value)} placeholder="List name…" className="h-7 text-[11px] flex-1" data-testid="wr-list-name" />
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1 flex-1" onClick={addList} data-testid="wr-list-new"><Plus className="w-3 h-3" />New</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1 flex-1" onClick={renameActive} data-testid="wr-list-rename"><Pencil className="w-3 h-3" />Rename</Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1 text-destructive" onClick={deleteActive} disabled={lists.length <= 1} data-testid="wr-list-delete"><Trash2 className="w-3 h-3" /></Button>
                </div>
                <div className="text-[9.5px] text-muted-foreground">Each list keeps its own basket/scope, ranking, and snapshots.</div>
              </div>
            )}
          </div>
        </div>
        {/* View toggle */}
        <div className="inline-flex rounded border border-border overflow-hidden h-7">
          {([["rank", "Rank", ListOrdered], ["duel", "Duel", Swords], ["changes", "Changes", TrendingUp]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v)} data-testid={`wr-view-${v}`}
              className={`px-2 text-xs flex items-center gap-1 ${v !== "rank" ? "border-l border-border" : ""} ${view === v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground"}`}>
              <Icon className="w-3 h-3" />{label}
            </button>
          ))}
        </div>
        <BasketScopeSelect scope={scope as any} />
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
          onClick={snapToCalls} disabled={!canSnap}
          title="Reorder to the arrangement closest to yours that honors every pin"
          data-testid="wr-snap-btn">Snap to my calls</Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={exportCsv} data-testid="wr-export"><Download className="w-3 h-3" />CSV</Button>
        <PagePresets
          storageKey="reit-viz:weekly-ranks:presets"
          label="Presets"
          testIdPrefix="wr-presets"
          capture={() => ({ order, pins, ties, extras, removed, compareId })}
          apply={(c: any) => {
            if (Array.isArray(c?.order)) setOrder(c.order.filter((x: any) => typeof x === "string"));
            if (Array.isArray(c?.pins)) setPins(c.pins.filter((p: any) => Array.isArray(p) && p.length === 2));
            if (Array.isArray(c?.ties)) setTies(c.ties.filter((p: any) => Array.isArray(p) && p.length === 2));
            if (Array.isArray(c?.extras)) setExtras(c.extras.filter((x: any) => typeof x === "string"));
            if (Array.isArray(c?.removed)) setRemoved(c.removed.filter((x: any) => typeof x === "string"));
            if (typeof c?.compareId === "string") setCompareId(c.compareId);
            setSkipped(new Set());
            setDuelUndo([]);
          }}
        />
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
        <div className="h-4 w-px bg-border mx-0.5" />
        <span className="text-muted-foreground">group by</span>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupLevel)} data-testid="wr-groupby"
          className="h-6 bg-background border border-border rounded px-1 text-[11px]" title="Cluster the ranking by classification to see how you rank within subcategories">
          {GROUP_LEVELS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        {pinFrom && (
          <span className="ml-auto text-[11px] text-cyan-300">Pinning <b>{pinFrom}</b> over… click a flag below (or <button className="underline" onClick={() => setPinFrom(null)}>cancel</button>)</span>
        )}
        {tieFrom && (
          <span className="ml-auto text-[11px] text-violet-300">Tying <b>{tieFrom}</b> with… click a ≈ below (or <button className="underline" onClick={() => setTieFrom(null)}>cancel</button>)</span>
        )}
      </div>

      {view === "rank" && (
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
                {groups
                  ? groups.map((grp) => (
                    <Fragment key={grp.label}>
                      <tr className="bg-card/70 border-y border-border" data-testid="wr-group-header">
                        <td colSpan={9} className="px-2 py-1 text-[10px]">
                          <span className="font-semibold text-foreground uppercase tracking-wide">{grp.label}</span>
                          <span className="ml-2 text-muted-foreground">{grp.count} name{grp.count > 1 ? "s" : ""} · best #{grp.best} · avg #{grp.avg.toFixed(1)}</span>
                        </td>
                      </tr>
                      {grp.members.map(renderRow)}
                    </Fragment>
                  ))
                  : order.map(renderRow)}
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
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs font-mono" onClick={() => answerDuel(duel[0], duel[1])} data-testid="wr-duel-a">{duel[0]}</Button>
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs font-mono" onClick={() => answerDuel(duel[1], duel[0])} data-testid="wr-duel-b">{duel[1]}</Button>
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
            {ties.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/40">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Ties ({ties.length})</div>
                <div className="space-y-0.5" data-testid="wr-ties-list">
                  {ties.map(([a, b]) => {
                    const bad = analysis.tieContradictions.some(([x, y]) => pairKey(x, y) === pairKey(a, b));
                    return (
                      <div key={pairKey(a, b)} className={`flex items-center gap-1 text-[11px] font-mono ${bad ? "text-rose-400" : "text-violet-300"}`} data-testid={`wr-tie-${a}-${b}`}>
                        <span className="font-semibold">{a}</span>
                        <span>≈</span>
                        <span>{b}</span>
                        {bad && <span className="text-[9px]" title="You also pinned a strict preference between these — contradiction">⚠</span>}
                        <button className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => delTie(a, b)} data-testid={`wr-tie-del-${a}-${b}`}><X className="w-3 h-3" /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── Duel view ──────────────────────────────────────────────────────── */}
      {view === "duel" && (
        <div className="flex flex-1 min-h-0 items-center justify-center p-6" data-testid="wr-duel-view">
          <div className="w-full max-w-xl space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{Math.round(analysis.determinedPct * 100)}% determined</span>
                <span data-testid="wr-duel-progress">{analysis.totalPairs - analysis.undeterminedPairs} / {analysis.totalPairs} pairs</span>
              </div>
              <div className="h-1.5 rounded bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(analysis.determinedPct * 100)}%` }} />
              </div>
            </div>
            {analysis.hasContradiction ? (
              <div className="text-center text-rose-400 text-sm" data-testid="wr-duel-contradiction">
                Your calls contain a contradiction — resolve it in Rank view before continuing.
              </div>
            ) : duel ? (
              <div className="space-y-3" data-testid="wr-duel-card">
                <div className="text-center text-xs text-muted-foreground">Which do you prefer?</div>
                <div className="flex items-stretch gap-3">
                  <button onClick={() => answerDuel(duel[0], duel[1])} data-testid="wr-duel-pick-a"
                    className="flex-1 rounded-lg border border-border hover:border-primary hover:bg-primary/10 p-4 text-center transition-colors">
                    <div className="font-mono font-bold text-lg">{duel[0]}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{metaMap.get(duel[0])?.name ?? ""}</div>
                    <div className="text-[9px] text-muted-foreground mt-1">← currently #{order.indexOf(duel[0]) + 1}</div>
                  </button>
                  <button onClick={() => answerTie(duel[0], duel[1])} data-testid="wr-duel-tie"
                    className="self-center rounded-md border border-violet-500/40 hover:bg-violet-500/15 text-violet-300 px-2 py-1 text-xs" title="Same tier — indifferent (T)">≈ tie</button>
                  <button onClick={() => answerDuel(duel[1], duel[0])} data-testid="wr-duel-pick-b"
                    className="flex-1 rounded-lg border border-border hover:border-primary hover:bg-primary/10 p-4 text-center transition-colors">
                    <div className="font-mono font-bold text-lg">{duel[1]}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{metaMap.get(duel[1])?.name ?? ""}</div>
                    <div className="text-[9px] text-muted-foreground mt-1">currently #{order.indexOf(duel[1]) + 1} →</div>
                  </button>
                </div>
                <div className="flex items-center justify-center gap-2 text-[11px]">
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={skipDuel} data-testid="wr-duel-skip"><SkipForward className="w-3 h-3" />Skip (S)</Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={undoDuel} disabled={!duelUndo.length} data-testid="wr-duel-undo"><Undo2 className="w-3 h-3" />Undo (U)</Button>
                  {skipped.size > 0 && <Button size="sm" variant="ghost" className="h-7" onClick={resetSkips} data-testid="wr-duel-reset-skips">reset {skipped.size} skip{skipped.size > 1 ? "s" : ""}</Button>}
                </div>
                <div className="text-center text-[10px] text-muted-foreground">← prefer left · → prefer right · T tie · S skip · U undo · implied pairs skipped automatically</div>
              </div>
            ) : (
              <div className="text-center text-sm text-emerald-400" data-testid="wr-duel-complete">Every pair is determined by your calls. 🎉</div>
            )}
            <div className="text-center">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { snapToCalls(); setView("rank"); }}
                disabled={!canSnap} data-testid="wr-duel-apply">
                Apply calls to order →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Changes view (week-over-week) ──────────────────────────────────── */}
      {view === "changes" && (
        <div className="flex flex-1 min-h-0 overflow-auto p-4" data-testid="wr-changes-view">
          {!compareSnap ? (
            <div className="m-auto text-sm text-muted-foreground text-center">Save a snapshot, then pick one in the bar above to compare against.</div>
          ) : cmp && (
            <div className="w-full max-w-3xl mx-auto space-y-4">
              <div className="text-xs text-muted-foreground">Current order vs <b className="text-foreground">{compareSnap.name}</b> · {cmp.commonCount} names in common</div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <StatCard label="Churn Σ|Δ|" value={String(cmp.churn)} testid="wr-churn" />
                <StatCard label="Spearman ρ" value={cmp.spearman == null ? "—" : cmp.spearman.toFixed(2)} testid="wr-spearman" />
                <StatCard label="New" value={String(cmp.entered.length)} testid="wr-entered-count" />
                <StatCard label="Dropped" value={String(cmp.dropped.length)} testid="wr-dropped-count" />
              </div>
              <div className="border border-border rounded overflow-hidden">
                <table className="w-full text-xs" data-testid="wr-movers">
                  <thead className="bg-card text-[10px] text-muted-foreground">
                    <tr>
                      <th className="text-left p-1.5"><SortHeader label="Ticker" columnKey="ticker" sort={moversSort} /></th>
                      <th className="text-left p-1.5"><SortHeader label="Name" columnKey="name" sort={moversSort} /></th>
                      <th className="text-right p-1.5"><SortHeader label="Last" columnKey="from" sort={moversSort} align="right" /></th>
                      <th className="text-right p-1.5"><SortHeader label="Now" columnKey="to" sort={moversSort} align="right" /></th>
                      <th className="text-right p-1.5 pr-3"><SortHeader label="Δ" columnKey="delta" sort={moversSort} align="right" title="Default order: biggest |Δ| first; NEW entries sort last on Δ" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMovers.map((m) => (
                      <tr key={m.ticker} className="border-t border-border/40" data-testid={`wr-mover-${m.ticker}`}>
                        <td className="p-1.5 font-mono font-semibold">{m.ticker}</td>
                        <td className="p-1.5 text-muted-foreground truncate max-w-[240px]">{metaMap.get(m.ticker)?.name ?? ""}</td>
                        <td className="p-1.5 text-right font-mono text-muted-foreground">{m.from ?? "—"}</td>
                        <td className="p-1.5 text-right font-mono">{m.to}</td>
                        <td className={`p-1.5 pr-3 text-right font-mono ${m.delta == null ? "text-cyan-300" : m.delta > 0 ? "text-emerald-400" : m.delta < 0 ? "text-rose-400" : "text-muted-foreground"}`} data-testid={`wr-mover-delta-${m.ticker}`}>
                          {m.delta == null ? "NEW" : m.delta > 0 ? `+${m.delta}` : m.delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cmp.dropped.length > 0 && (
                <div className="text-[11px] text-muted-foreground">Dropped since {compareSnap.name}: <span className="font-mono">{cmp.dropped.join(", ")}</span></div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="rounded border border-border bg-card/40 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-mono font-bold" data-testid={testid}>{value}</div>
    </div>
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
