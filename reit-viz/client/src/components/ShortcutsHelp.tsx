// Reconstructed from recovered-bundle/index-CsG73Aq_.js (bundle fn DHe + IHe) on 2026-06-17

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  label: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ["⌘", "K"], label: "Open command palette" },
  { keys: ["Ctrl", "K"], label: "Open command palette" },
  { keys: ["1"], label: "Charts" },
  { keys: ["2"], label: "Universe" },
  { keys: ["3"], label: "Ranking" },
  { keys: ["4"], label: "XY Scatter" },
  { keys: ["5"], label: "Pairs" },
  { keys: ["6"], label: "Macro" },
  { keys: ["7"], label: "Correlation" },
  { keys: ["8"], label: "Performance" },
  { keys: ["9"], label: "Sigma Move" },
  { keys: ["?"], label: "Show this help" },
  { keys: ["Esc"], label: "Close dialog / palette" },
];

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  return open ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="shortcuts-help"
    >
      <div
        className="w-[min(480px,92vw)] bg-card border border-border rounded-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Keyboard shortcuts</span>
          <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
            ESC
          </span>
        </div>
        <div className="p-3 space-y-1">
          {SHORTCUTS.map((shortcut, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-2 py-1 rounded hover:bg-accent/40"
            >
              <span className="text-xs text-foreground">{shortcut.label}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, j) => (
                  <span
                    key={j}
                    className="text-[10px] font-mono border border-border rounded px-1.5 py-0.5 text-muted-foreground bg-muted/40"
                  >
                    {key}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : null;
}

export default ShortcutsHelp;
