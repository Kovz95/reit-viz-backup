// Idea Journal — every pinned idea with its evidence frozen at pin time and
// the live (or locked-in) return since. The feedback loop: after a quarter
// this page tells you which scan modes actually make money.
import { useEffect, useMemo, useState } from "react";
import { NotebookPen, Trash2, CheckCircle2, RotateCcw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMetricSeries } from "@/lib/dataService";
import {
  loadJournal, loadJournalLocal, persistJournal, entryReturnPct, type JournalEntry,
} from "@/lib/ideaJournal";

export default function IdeaJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>(() => loadJournalLocal());
  const [closes, setCloses] = useState<Map<string, number>>(new Map());
  const [view, setView] = useState<"open" | "closed" | "all">("open");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadJournal().then((srv) => { if (!cancelled) setEntries(srv); });
    return () => { cancelled = true; };
  }, []);

  // Latest closes for every ticker referenced by an entry.
  useEffect(() => {
    let cancelled = false;
    const tks = [...new Set(entries.flatMap((e) => e.tickers))];
    void (async () => {
      const m = new Map<string, number>();
      let i = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (i < tks.length) {
          const tk = tks[i++];
          try {
            const s = await getMetricSeries(tk, "close");
            const last = [...s].reverse().find((p) => Number.isFinite(p.value));
            if (last) m.set(tk.toUpperCase(), last.value);
          } catch { /* skip */ }
          if (!cancelled) setCloses(new Map(m));
        }
      }));
    })();
    return () => { cancelled = true; };
  }, [entries]);

  const lastClose = (tk: string) => closes.get(tk.toUpperCase()) ?? null;

  const update = (id: string, patch: Partial<JournalEntry>) => {
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      persistJournal(next);
      return next;
    });
  };
  const remove = (id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      persistJournal(next);
      return next;
    });
  };
  const closeEntry = (e: JournalEntry) => {
    const ret = entryReturnPct(e, lastClose);
    update(e.id, {
      status: "closed",
      closedAt: new Date().toISOString().slice(0, 10),
      closedReturnPct: ret ?? undefined,
    });
  };

  const shown = useMemo(
    () => entries.filter((e) => (view === "all" ? true : e.status === view)),
    [entries, view],
  );

  const stats = useMemo(() => {
    const rets = entries
      .map((e) => (e.status === "closed" ? e.closedReturnPct ?? null : entryReturnPct(e, lastClose)))
      .filter((r): r is number => r !== null && Number.isFinite(r));
    if (!rets.length) return null;
    const wins = rets.filter((r) => r > 0).length;
    return {
      n: rets.length,
      winRate: (wins / rets.length) * 100,
      avg: rets.reduce((s, v) => s + v, 0) / rets.length,
    };
  }, [entries, closes]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    const lines = ["created,source,direction,tickers,status,closed,returnPct,thesis,snapshot"];
    for (const e of entries) {
      const ret = e.status === "closed" ? e.closedReturnPct ?? null : entryReturnPct(e, lastClose);
      const esc = (s: any) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      lines.push([e.createdAt, e.source, esc(e.direction), e.tickers.join("/"), e.status, e.closedAt ?? "", ret?.toFixed(2) ?? "", esc(e.thesis), esc(e.snapshot)].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `idea-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const retCell = (e: JournalEntry) => {
    const ret = e.status === "closed" ? e.closedReturnPct ?? null : entryReturnPct(e, lastClose);
    if (ret === null || !Number.isFinite(ret)) return <span className="text-muted-foreground">—</span>;
    return (
      <span className={`font-mono font-bold ${ret >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {ret >= 0 ? "+" : ""}{ret.toFixed(2)}%
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="journal-page">
      <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-card flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
          <NotebookPen className="w-4 h-4 text-primary" /> Idea Journal
        </span>
        <div className="flex items-center bg-muted rounded p-0.5">
          {(["open", "closed", "all"] as const).map((v) => (
            <button
              key={v}
              className={`px-2.5 py-0.5 text-[11px] font-medium rounded capitalize ${view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setView(v)}
              data-testid={`journal-view-${v}`}
            >
              {v}
            </button>
          ))}
        </div>
        {stats && (
          <span className="text-[11px] font-mono text-muted-foreground">
            {stats.n} ideas · win {stats.winRate.toFixed(0)}% · avg{" "}
            <span className={stats.avg >= 0 ? "text-emerald-400" : "text-red-400"}>
              {stats.avg >= 0 ? "+" : ""}{stats.avg.toFixed(2)}%
            </span>
          </span>
        )}
        <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1 ml-auto" onClick={exportCsv}>
          <Download className="w-3 h-3" /> CSV
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {shown.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-10">
            No {view === "all" ? "" : view + " "}ideas yet — pin rows from the Disloc scan (journal icon) and they land here with their evidence frozen at pin time.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Pinned</th>
                <th className="px-2 py-1.5 text-left">Idea</th>
                <th className="px-2 py-1.5 text-left">Source</th>
                <th className="px-2 py-1.5 text-right">Return</th>
                <th className="px-2 py-1.5 text-left">Evidence at pin</th>
                <th className="px-2 py-1.5 text-left">Thesis / notes</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className={`border-b border-border/40 align-top ${e.status === "closed" ? "opacity-60" : ""}`} data-testid={`journal-row-${e.id}`}>
                  <td className="px-2 py-1.5 font-mono whitespace-nowrap text-muted-foreground">
                    {e.createdAt}
                    {e.status === "closed" && <div className="text-[9px]">closed {e.closedAt}</div>}
                  </td>
                  <td className="px-2 py-1.5 font-bold whitespace-nowrap">{e.direction}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{e.source}</td>
                  <td className="px-2 py-1.5 text-right" data-testid={`journal-ret-${e.id}`}>{retCell(e)}</td>
                  <td className="px-2 py-1.5 max-w-[320px]">
                    <span className="text-[10px] text-muted-foreground whitespace-pre-wrap">{e.snapshot}</span>
                  </td>
                  <td className="px-2 py-1.5 max-w-[280px]">
                    {editing === e.id ? (
                      <textarea
                        className="w-full h-16 text-[11px] bg-background border border-border rounded p-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        onBlur={() => { update(e.id, { thesis: draft }); setEditing(null); }}
                        autoFocus
                        data-testid={`journal-thesis-${e.id}`}
                      />
                    ) : (
                      <button
                        className="text-left text-[11px] text-muted-foreground hover:text-foreground w-full"
                        onClick={() => { setEditing(e.id); setDraft(e.thesis); }}
                        title="Click to edit"
                      >
                        {e.thesis || <span className="italic opacity-60">add thesis…</span>}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {e.status === "open" ? (
                      <Button variant="outline" size="sm" className="h-6 px-1.5 text-[9px] gap-1" onClick={() => closeEntry(e)} title="Close the idea and lock in the current return" data-testid={`journal-close-${e.id}`}>
                        <CheckCircle2 className="w-3 h-3" /> Close
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[9px] gap-1" onClick={() => update(e.id, { status: "open", closedAt: undefined, closedReturnPct: undefined })} title="Reopen">
                        <RotateCcw className="w-3 h-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => remove(e.id)} data-testid={`journal-del-${e.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
