// Sentiment — consolidated tab hosting the Short Interest and Ratings
// scanners as lazily-loaded families (Event Lab shell pattern). The family
// pages are mounted UNCHANGED — their state, storage keys, and behavior are
// exactly what the standalone tabs had. Old routes alias here with the
// matching family pinned.
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { Target, Star } from "lucide-react";

const ShortInterest = lazy(() => import("@/pages/ShortInterest"));
const Ratings = lazy(() => import("@/pages/Ratings"));

export type SentimentFamily = "si" | "ratings";

const FAMILY_TABS: Array<{ id: SentimentFamily; label: string; icon: typeof Target }> = [
  { id: "si", label: "Short Interest", icon: Target },
  { id: "ratings", label: "Ratings", icon: Star },
];

export default function Sentiment({ initialFamily }: { initialFamily?: SentimentFamily }) {
  const [family, setFamily] = useState<SentimentFamily>(initialFamily ?? "si");
  const pinnedRef = useRef(initialFamily != null);

  // While alias-pinned, don't overwrite the workspace-saved family.
  const serialize = useCallback(() => (pinnedRef.current ? {} : { family }), [family]);
  const restore = useCallback((s: any) => {
    if (!pinnedRef.current && s?.family && FAMILY_TABS.some((t) => t.id === s.family)) {
      setFamily(s.family);
    }
  }, []);
  useWorkspaceTab("sentiment", serialize, restore);

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
            data-testid={`sentiment-family-${t.id}`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>}>
          {family === "si" && <ShortInterest />}
          {family === "ratings" && <Ratings />}
        </Suspense>
      </div>
    </div>
  );
}
