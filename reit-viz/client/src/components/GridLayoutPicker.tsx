import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LayoutGrid } from "lucide-react";

export type GridLayout = "1x1" | "2x1" | "1x2" | "2x2" | "3x2" | "2x3" | "3x3" | "4x4";

interface GridLayoutPickerProps {
  value: GridLayout;
  onChange: (layout: GridLayout) => void;
  testId?: string;
}

const GRID_OPTIONS: { layout: GridLayout; cols: number; rows: number; label: string }[] = [
  { layout: "1x1", cols: 1, rows: 1, label: "1×1" },
  { layout: "2x1", cols: 2, rows: 1, label: "2×1" },
  { layout: "1x2", cols: 1, rows: 2, label: "1×2" },
  { layout: "2x2", cols: 2, rows: 2, label: "2×2" },
  { layout: "3x2", cols: 3, rows: 2, label: "3×2" },
  { layout: "2x3", cols: 2, rows: 3, label: "2×3" },
  { layout: "3x3", cols: 3, rows: 3, label: "3×3" },
  { layout: "4x4", cols: 4, rows: 4, label: "4×4" },
];

/** Parse a GridLayout string to cols/rows */
export function parseGrid(layout: GridLayout): { cols: number; rows: number } {
  const opt = GRID_OPTIONS.find(o => o.layout === layout);
  return opt ? { cols: opt.cols, rows: opt.rows } : { cols: 1, rows: 1 };
}

/** CSS grid style for layout — use inline style instead of dynamic Tailwind classes */
export function gridContainerStyle(layout: GridLayout, itemCount: number): React.CSSProperties {
  const { cols, rows } = parseGrid(layout);
  // Always allocate enough rows for all items
  const actualRows = Math.ceil(itemCount / cols);
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${actualRows}, 1fr)`,
    height: "100%",
  };
}

/** How many slots does a layout have? */
export function gridSlots(layout: GridLayout): number {
  const { cols, rows } = parseGrid(layout);
  return cols * rows;
}

export default function GridLayoutPicker({ value, onChange, testId }: GridLayoutPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px] gap-1"
          data-testid={testId ?? "grid-layout-picker"}
        >
          <LayoutGrid className="w-3 h-3" />
          {GRID_OPTIONS.find(o => o.layout === value)?.label ?? value}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="end">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          Chart Grid Layout
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {GRID_OPTIONS.map((opt) => (
            <button
              key={opt.layout}
              className={`flex flex-col items-center justify-center w-14 h-14 rounded border text-[10px] font-mono transition-colors ${
                value === opt.layout
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50 hover:bg-accent/50 text-muted-foreground"
              }`}
              onClick={() => { onChange(opt.layout); setOpen(false); }}
              data-testid={`grid-layout-${opt.layout}`}
            >
              {/* Mini grid preview */}
              <div
                className="grid gap-[1px] mb-1"
                style={{
                  gridTemplateColumns: `repeat(${opt.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${opt.rows}, 1fr)`,
                  width: opt.cols * 8 + (opt.cols - 1),
                  height: opt.rows * 6 + (opt.rows - 1),
                }}
              >
                {Array.from({ length: opt.cols * opt.rows }).map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-[1px] ${
                      value === opt.layout ? "bg-primary/40" : "bg-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[9px] text-muted-foreground/60 mt-2 px-1">
          Double-click a chart to expand it full-screen.
        </p>
      </PopoverContent>
    </Popover>
  );
}
