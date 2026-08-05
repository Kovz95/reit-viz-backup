// Event Lab — the consolidated "what happens after X?" page. Hosts the three
// former tabs as lazily-loaded families, each ported wholesale with its own
// state/scoping intact (parity first; convergence later):
//   performance → pages/eventlab/PerfFamily  (was /performance)
//   study       → pages/eventlab/StudyFamily (was /price-action)   [phase 3]
//   sigma       → pages/eventlab/SigmaFamily (was /sigma-move)     [phase 4]
// Old routes become aliases passing initialFamily; that prop wins over the
// workspace-restored family on mount only.
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { CalendarRange, FlaskConical, Activity } from "lucide-react";
import type { StudyPreset } from "./StudyFamily";

const PerfFamily = lazy(() => import("./PerfFamily"));
const StudyFamily = lazy(() => import("./StudyFamily"));
const SigmaFamily = lazy(() => import("./SigmaFamily"));

export type EventLabFamily = "performance" | "study" | "sigma";

const FAMILY_TABS: Array<{ id: EventLabFamily; label: string; icon: typeof Activity; ready: boolean }> = [
  { id: "performance", label: "Performance", icon: CalendarRange, ready: true },
  { id: "study", label: "Event Study", icon: FlaskConical, ready: true },
  { id: "sigma", label: "Sigma", icon: Activity, ready: true },
];

export default function EventLab({ initialFamily }: { initialFamily?: EventLabFamily }) {
  const [family, setFamily] = useState<EventLabFamily>(initialFamily ?? "performance");
  // Cross-family hand-off: Sigma rows open a preconfigured, auto-run study.
  const [studyPreset, setStudyPreset] = useState<StudyPreset | null>(null);
  const openStudy = useCallback((p: Omit<StudyPreset, "nonce">) => {
    setStudyPreset({ ...p, nonce: Date.now() });
    pinnedRef.current = false;
    setFamily("study");
  }, []);
  // Alias routes pin the family: skip the workspace restore for `family` when
  // the prop is present so /performance etc. always land where they promise.
  const pinnedRef = useRef(initialFamily != null);

  // Alias-route navigation re-renders this SAME instance — useState's initial
  // value never re-applies, so /performance -> /price-action showed the old
  // family. Sync on prop change (render-time state adjustment).
  const lastInitialRef = useRef(initialFamily);
  if (initialFamily !== lastInitialRef.current) {
    lastInitialRef.current = initialFamily;
    if (initialFamily != null && initialFamily !== family) {
      pinnedRef.current = true;
      setFamily(initialFamily);
    }
  }

  // While alias-pinned (user hasn't clicked a family tab), don't overwrite the
  // workspace-saved family — visiting /performance shouldn't change what
  // /event-lab restores to.
  const serialize = useCallback(() => (pinnedRef.current ? {} : { family }), [family]);
  const restore = useCallback((s: any) => {
    if (!pinnedRef.current && s?.family && FAMILY_TABS.some((t) => t.id === s.family && t.ready)) {
      setFamily(s.family);
    }
  }, []);
  useWorkspaceTab("event-lab", serialize, restore);

  const available = FAMILY_TABS.filter((t) => t.ready);
  const active = available.some((t) => t.id === family) ? family : "performance";

  return (
    <div className="flex flex-col h-full bg-background">
      {available.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card/60 flex-shrink-0">
          {available.map((t) => (
            <button
              key={t.id}
              onClick={() => { pinnedRef.current = false; setFamily(t.id); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                active === t.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
              data-testid={`eventlab-family-${t.id}`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>}>
          {active === "performance" && <PerfFamily />}
          {active === "study" && <StudyFamily preset={studyPreset} />}
          {active === "sigma" && <SigmaFamily onOpenStudy={openStudy} />}
        </Suspense>
      </div>
    </div>
  );
}
