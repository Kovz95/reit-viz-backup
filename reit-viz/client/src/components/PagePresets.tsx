// Generic named-presets button for config-heavy pages (MTF Setups, screeners,
// …) — the same save/apply/delete pattern as the Disloc presets, backed by the
// server prefs KV so presets follow the user across computers.
//
// The host page supplies capture() (a JSON-serializable snapshot of its
// current configuration) and apply(config) (restore it). Pages that already
// serialize state for workspace autosave can pass those functions directly.
import { useEffect, useState } from "react";
import { Bookmark, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { loadServerPref, saveServerPref } from "@/lib/serverPrefs";

export interface PagePreset {
  id: string;
  name: string;
  config: any;
}

function loadLocal(storageKey: string): PagePreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function PagePresets({
  storageKey,
  capture,
  apply,
  label = "Presets",
  testIdPrefix = "presets",
  className = "",
}: {
  /** prefs-KV key, e.g. "reit-viz:mtf-setups:presets". */
  storageKey: string;
  capture: () => any;
  apply: (config: any) => void;
  label?: string;
  testIdPrefix?: string;
  className?: string;
}) {
  const [presets, setPresets] = useState<PagePreset[]>(() => loadLocal(storageKey));
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadServerPref<PagePreset[]>(storageKey).then((srv) => {
      if (!cancelled && Array.isArray(srv)) setPresets(srv);
    });
    return () => { cancelled = true; };
  }, [storageKey]);

  const save = () => {
    const nm = name.trim() || `Preset ${presets.length + 1}`;
    let config: any;
    try { config = capture(); } catch { return; }
    const next = [...presets.filter((p) => p.name !== nm), { id: `pp-${Date.now()}`, name: nm, config }];
    setPresets(next);
    saveServerPref(storageKey, next);
    setName("");
  };
  const remove = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    saveServerPref(storageKey, next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`h-7 px-2 text-[11px] gap-1 ${className}`} data-testid={testIdPrefix}>
          <Bookmark className="w-3 h-3" />
          {label}{presets.length > 0 ? ` (${presets.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 space-y-2" align="end">
        <div className="flex gap-1">
          <Input
            placeholder="Save current as…"
            className="h-7 text-[11px] flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            data-testid={`${testIdPrefix}-name`}
          />
          <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] gap-1" onClick={save} data-testid={`${testIdPrefix}-save`}>
            <Plus className="w-3 h-3" />
            Save
          </Button>
        </div>
        {presets.length === 0 ? (
          <div className="text-[10px] text-muted-foreground">
            No presets yet — configure the page, then save the setup to recall it in one click on any computer.
          </div>
        ) : (
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {presets.map((p) => (
              <div key={p.id} className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-accent group text-[11px]">
                <button
                  className="flex-1 text-left truncate hover:text-primary"
                  onClick={() => { apply(p.config); setOpen(false); }}
                  data-testid={`${testIdPrefix}-apply-${p.name}`}
                >
                  {p.name}
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-destructive"
                  onClick={() => remove(p.id)}
                  data-testid={`${testIdPrefix}-delete-${p.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
