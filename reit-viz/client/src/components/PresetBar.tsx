// Reconstructed from recovered-bundle/PresetBar-B4InBSQb.js on 2025-01-31

import { useState, useEffect, useRef, useCallback } from "react";
import { useOptimizerPresets } from "@/lib/optimizerPresets";

const EPHEMERAL_KEYS = new Set([
  "selectedTicker",
  "pairTickerA",
  "pairTickerB",
  "results",
  "gridResults",
  "expandedTicker",
  "expandedGridTicker",
  "sortBy",
  "runSort",
  "gridLongSort",
  "gridShortSort",
  "evalResult",
  "evalTriggerKey",
  "evalFilterKeys",
]);

function stripEphemeral(inputs: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(inputs)) {
    if (!EPHEMERAL_KEYS.has(key)) cleaned[key] = val;
  }
  return cleaned;
}

interface PresetBarProps {
  kind: string;
  captureInputs: () => Record<string, unknown>;
  applyInputs: (inputs: Record<string, unknown>) => void;
}

function PresetBar({ kind, captureInputs, applyInputs }: PresetBarProps) {
  const presetsHook = useOptimizerPresets(kind);
  const presets = presetsHook.presets ?? [];
  const { addPreset, updatePreset, deletePreset } = presetsHook;

  const [selectedId, setSelectedId] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [appliedLabel, setAppliedLabel] = useState<string | null>(null);

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newNameInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedId && !presets.find((p: any) => p.id === selectedId)) setSelectedId("");
  }, [presets, selectedId]);

  useEffect(() => {
    if (savingNew && newNameInputRef.current) newNameInputRef.current.focus();
  }, [savingNew]);

  useEffect(() => {
    if (renaming && renameInputRef.current) renameInputRef.current.focus();
  }, [renaming]);

  const selectedPreset = presets.find((p: any) => p.id === selectedId);

  const handleApply = useCallback(() => {
    if (selectedPreset) {
      applyInputs(selectedPreset.inputs);
      setAppliedLabel(selectedPreset.name);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setAppliedLabel(null), 2000);
    }
  }, [selectedPreset, applyInputs]);

  const handleSaveNew = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const raw = captureInputs();
    const cleaned = stripEphemeral(raw);
    const saved = addPreset(name, cleaned);
    setSelectedId(saved.id);
    setSavingNew(false);
    setNewName("");
  }, [newName, captureInputs, addPreset]);

  const handleSaveNewKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSaveNew();
      if (e.key === "Escape") { setSavingNew(false); setNewName(""); }
    },
    [handleSaveNew]
  );

  const handleStartRename = useCallback(() => {
    if (selectedPreset) {
      setRenameName(selectedPreset.name);
      setRenaming(true);
      setConfirmDelete(false);
    }
  }, [selectedPreset]);

  const handleRenameConfirm = useCallback(() => {
    const name = renameName.trim();
    if (!name || !selectedPreset) {
      setRenaming(false);
      return;
    }
    updatePreset(selectedPreset.id, { name });
    setRenaming(false);
    setRenameName("");
  }, [renameName, selectedPreset, updatePreset]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleRenameConfirm();
      if (e.key === "Escape") { setRenaming(false); setRenameName(""); }
    },
    [handleRenameConfirm]
  );

  const handleDelete = useCallback(() => {
    if (selectedPreset) {
      deletePreset(selectedPreset.id);
      setSelectedId("");
      setConfirmDelete(false);
    }
  }, [selectedPreset, deletePreset]);

  const hasPresets = presets.length > 0;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-card/80 flex-wrap">
      <span className="text-[10px] font-mono text-muted-foreground font-semibold shrink-0">
        Presets:
      </span>
      <select
        className="text-[10px] font-mono bg-background border border-border rounded px-2 py-0.5 text-foreground max-w-[160px] min-w-[120px] disabled:opacity-50"
        value={selectedId}
        onChange={(e) => {
          setSelectedId(e.target.value);
          setRenaming(false);
          setConfirmDelete(false);
        }}
        disabled={!hasPresets}
      >
        <option value="">{hasPresets ? "— select preset —" : "No presets saved"}</option>
        {presets.map((p: any) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        className="text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-background text-foreground hover:bg-accent disabled:opacity-40 transition-colors shrink-0"
        onClick={handleApply}
        disabled={!selectedId}
        title="Apply selected preset"
      >
        Apply
      </button>
      {appliedLabel && (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-in fade-in shrink-0">
          Applied: {appliedLabel}
        </span>
      )}
      {savingNew ? (
        <span className="flex items-center gap-1 shrink-0">
          <input
            ref={newNameInputRef}
            className="text-[10px] font-mono bg-background border border-primary rounded px-2 py-0.5 text-foreground w-[140px] outline-none"
            placeholder="Preset name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleSaveNewKeyDown}
          />
          <button
            className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={handleSaveNew}
            disabled={!newName.trim()}
          >
            Save
          </button>
          <button
            className="text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { setSavingNew(false); setNewName(""); }}
          >
            ✕
          </button>
        </span>
      ) : (
        <button
          className="text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-background text-foreground hover:bg-accent transition-colors shrink-0"
          onClick={() => { setSavingNew(true); setRenaming(false); setConfirmDelete(false); }}
          title="Save current inputs as a new preset"
        >
          Save current…
        </button>
      )}
      {selectedId && !savingNew && (
        renaming ? (
          <span className="flex items-center gap-1 shrink-0">
            <input
              ref={renameInputRef}
              className="text-[10px] font-mono bg-background border border-primary rounded px-2 py-0.5 text-foreground w-[140px] outline-none"
              placeholder="New name…"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={handleRenameKeyDown}
            />
            <button
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              onClick={handleRenameConfirm}
              disabled={!renameName.trim()}
            >
              Save
            </button>
            <button
              className="text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setRenaming(false); setRenameName(""); }}
            >
              ✕
            </button>
          </span>
        ) : (
          <button
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={handleStartRename}
            title={`Rename "${selectedPreset?.name}"`}
          >
            ✏
          </button>
        )
      )}
      {selectedId && !savingNew && !renaming && (
        confirmDelete ? (
          <span className="flex items-center gap-1 shrink-0 bg-red-500/10 border border-red-500/30 rounded px-2 py-0.5">
            <span className="text-[10px] font-mono text-red-400">
              Delete &quot;{selectedPreset?.name}&quot;?
            </span>
            <button
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
              onClick={handleDelete}
            >
              Yes
            </button>
            <button
              className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setConfirmDelete(false)}
            >
              No
            </button>
          </span>
        ) : (
          <button
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-red-400 transition-colors shrink-0"
            onClick={() => setConfirmDelete(true)}
            title={`Delete "${selectedPreset?.name}"`}
          >
            🗑
          </button>
        )
      )}
    </div>
  );
}

export { PresetBar, PresetBar as P };
export default PresetBar;
