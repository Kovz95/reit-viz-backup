// Setups — consolidated tab hosting the three setup tools as lazily-loaded
// families (Event Lab shell pattern), mounted UNCHANGED:
//   similar  → SimilarSetups (single-ticker analog deep dive)
//   screener → SetupsScreener (the same engine fanned out over the universe —
//              this exact component also remains inside the Screeners hub)
//   mtf      → MTFSetups (cross-timeframe confluence miner; separate engine,
//              grouped here for nav coherence)
// Old routes alias here with the matching family pinned.
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { Sparkles, Filter, Layers } from "lucide-react";

const SimilarSetups = lazy(() => import("@/pages/SimilarSetups"));
const SetupsScreener = lazy(() => import("@/pages/SetupsScreener"));
const MTFSetups = lazy(() => import("@/pages/MTFSetups"));

export type SetupsFamily = "similar" | "screener" | "mtf";

const FAMILY_TABS: Array<{ id: SetupsFamily; label: string; icon: typeof Filter }> = [
  { id: "similar", label: "Similar Setups", icon: Sparkles },
  { id: "screener", label: "Setups Screener", icon: Filter },
  { id: "mtf", label: "MTF Setups", icon: Layers },
];

export default function Setups({ initialFamily }: { initialFamily?: SetupsFamily }) {
  const [family, setFamily] = useState<SetupsFamily>(initialFamily ?? "similar");
  const pinnedRef = useRef(initialFamily != null);

  const serialize = useCallback(() => (pinnedRef.current ? {} : { family }), [family]);
  const restore = useCallback((s: any) => {
    if (!pinnedRef.current && s?.family && FAMILY_TABS.some((t) => t.id === s.family)) {
      setFamily(s.family);
    }
  }, []);
  useWorkspaceTab("setups", serialize, restore);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card/60 flex-shrink-0">
        {FAMILY_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { pinnedRef.current = false; setFamily(t.id); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
              family === t.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            data-testid={`setups-family-${t.id}`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>}>
          {family === "similar" && <SimilarSetups />}
          {family === "screener" && <SetupsScreener />}
          {family === "mtf" && <MTFSetups />}
        </Suspense>
      </div>
    </div>
  );
}
