/**
 * SavedDrawingsManager.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Per-ticker saved drawings panel.
 *
 * Shows drawings grouped by kind, sorted createdAt descending.
 * Each row: eye toggle, kind badge, editable label, color swatch, delete.
 * Header: "Saved Drawings · {ticker}" + collapsible per-kind sections.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Eye,
  EyeOff,
  Trash2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listForTicker,
  deleteDrawing,
  toggleVisibility,
  update,
  KIND_LABELS,
  KIND_COLORS,
  type SavedDrawing,
  type DrawingKind,
} from "@/lib/savedDrawings";

// ── Props ─────────────────────────────────────────────────────────────────────

interface SavedDrawingsManagerProps {
  ticker: string | null;
  /** Called after any mutation so the chart can re-render overlays */
  onDrawingsChange?: (drawings: SavedDrawing[]) => void;
  onClose?: () => void;
}

// ── Kind badge ───────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: DrawingKind }) {
  const label = KIND_LABELS[kind];
  const color = KIND_COLORS[kind];
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
      style={{
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {label}
    </span>
  );
}

// ── Single drawing row ────────────────────────────────────────────────────────

interface DrawingRowProps {
  drawing: SavedDrawing;
  ticker: string;
  onMutate: () => void;
}

function DrawingRow({ drawing, ticker, onMutate }: DrawingRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(drawing.label);

  const handleToggleVisibility = useCallback(() => {
    toggleVisibility(ticker, drawing.id);
    onMutate();
  }, [ticker, drawing.id, onMutate]);

  const handleDelete = useCallback(() => {
    deleteDrawing(ticker, drawing.id);
    onMutate();
  }, [ticker, drawing.id, onMutate]);

  const handleLabelSave = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed) {
      update(ticker, drawing.id, { label: trimmed });
    } else {
      setEditValue(drawing.label);
    }
    setEditing(false);
    onMutate();
  }, [ticker, drawing.id, editValue, drawing.label, onMutate]);

  const handleLabelKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleLabelSave();
      if (e.key === "Escape") {
        setEditValue(drawing.label);
        setEditing(false);
      }
    },
    [handleLabelSave, drawing.label],
  );

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors group/row ${
        drawing.visible ? "" : "opacity-50"
      } hover:bg-accent/20`}
    >
      {/* Visibility toggle */}
      <button
        onClick={handleToggleVisibility}
        className="text-muted-foreground hover:text-foreground flex-shrink-0"
        title={drawing.visible ? "Hide drawing" : "Show drawing"}
        data-testid={`drawing-vis-${drawing.id}`}
      >
        {drawing.visible ? (
          <Eye className="w-3.5 h-3.5" />
        ) : (
          <EyeOff className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Kind badge */}
      <KindBadge kind={drawing.kind} />

      {/* Color swatch */}
      <span
        className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20"
        style={{ backgroundColor: drawing.style.color }}
        title={`Color: ${drawing.style.color}`}
      />

      {/* Label (click to edit) */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleLabelKeyDown}
              onBlur={handleLabelSave}
              className="h-5 text-[11px] px-1 py-0 bg-background flex-1"
              data-testid={`drawing-label-input-${drawing.id}`}
            />
            <button
              onClick={handleLabelSave}
              className="text-primary hover:text-primary/80"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setEditValue(drawing.label);
                setEditing(false);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-left truncate w-full flex items-center gap-1 hover:text-primary group/label"
            title="Click to edit label"
            data-testid={`drawing-label-${drawing.id}`}
          >
            <span className="truncate">{drawing.label}</span>
            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/label:opacity-60 flex-shrink-0 transition-opacity" />
          </button>
        )}
      </div>

      {/* Created date */}
      <span className="text-[9px] text-muted-foreground flex-shrink-0 hidden sm:block">
        {drawing.createdAt.slice(0, 10)}
      </span>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        className="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-destructive transition-opacity flex-shrink-0"
        title="Delete drawing"
        data-testid={`drawing-delete-${drawing.id}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Collapsible kind section ──────────────────────────────────────────────────

interface KindSectionProps {
  kind: DrawingKind;
  drawings: SavedDrawing[];
  ticker: string;
  onMutate: () => void;
}

function KindSection({ kind, drawings, ticker, onMutate }: KindSectionProps) {
  const [open, setOpen] = useState(true);
  const label = KIND_LABELS[kind];
  const color = KIND_COLORS[kind];

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-accent/10 transition-colors"
        data-testid={`drawings-section-${kind}`}
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </span>
        <span className="text-[9px] text-muted-foreground ml-auto">
          {drawings.length}
        </span>
      </button>

      {open && (
        <div className="pb-1">
          {drawings.map((d) => (
            <DrawingRow
              key={d.id}
              drawing={d}
              ticker={ticker}
              onMutate={onMutate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const KIND_ORDER: DrawingKind[] = [
  "channel",
  "trendline",
  "fib",
  "sr",
  "pattern",
];

export default function SavedDrawingsManager({
  ticker,
  onDrawingsChange,
  onClose,
}: SavedDrawingsManagerProps) {
  const [drawings, setDrawings] = useState<SavedDrawing[]>([]);

  const reload = useCallback(() => {
    if (!ticker) {
      setDrawings([]);
      return;
    }
    const fresh = listForTicker(ticker);
    setDrawings(fresh);
    onDrawingsChange?.(fresh);
  }, [ticker, onDrawingsChange]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Group drawings by kind
  const byKind: Partial<Record<DrawingKind, SavedDrawing[]>> = {};
  for (const d of drawings) {
    (byKind[d.kind] ??= []).push(d);
  }

  const visibleKinds = KIND_ORDER.filter((k) => (byKind[k]?.length ?? 0) > 0);

  if (!ticker) {
    return (
      <div className="flex items-center justify-center h-full p-6 text-xs text-muted-foreground font-mono">
        No ticker selected.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div>
          <h3 className="text-xs font-bold font-mono">
            Saved Drawings
            <span className="ml-1.5 text-primary">{ticker}</span>
          </h3>
          <p className="text-[9px] text-muted-foreground">
            {drawings.length === 0
              ? `No drawings saved for ${ticker} yet`
              : `${drawings.length} drawing${drawings.length === 1 ? "" : "s"} · ${
                  drawings.filter((d) => d.visible).length
                } visible`}
          </p>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onClose}
            data-testid="drawings-manager-close"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {drawings.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-2 text-center p-6"
            data-testid="drawings-empty-state"
          >
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Pencil className="w-4 h-4 text-muted-foreground/50" />
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              No drawings saved for {ticker} yet
            </p>
            <p className="text-[10px] text-muted-foreground/60 max-w-[200px]">
              Use the draw tools on the chart, or pin detected trendlines and S/R
              levels to save them here.
            </p>
          </div>
        ) : (
          <div>
            {visibleKinds.map((kind) => (
              <KindSection
                key={kind}
                kind={kind}
                drawings={byKind[kind]!}
                ticker={ticker}
                onMutate={reload}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
