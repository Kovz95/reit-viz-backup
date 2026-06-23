import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface ResizableSidebarProps {
  /** localStorage key so each panel remembers its own width independently. */
  storageKey: string;
  /** Initial width in px (used until the user drags, and on double-click reset). */
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  children: React.ReactNode;
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/**
 * Right-docked side panel whose width the user can drag-resize via a handle on its
 * LEFT edge; double-click the handle to reset to the default. The chosen width
 * persists per panel in localStorage.
 *
 * This replaces the old fixed-width side-panel roots (`w-[260px]` …) so labels are
 * no longer clipped — the user can simply widen the panel. The drag handle lives
 * OUTSIDE the scrolling region so it stays put while the content scrolls.
 */
export function ResizableSidebar({
  storageKey,
  defaultWidth,
  minWidth = 200,
  maxWidth = 680,
  className,
  children,
}: ResizableSidebarProps) {
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const n = parseInt(saved, 10);
        if (!Number.isNaN(n)) return clamp(n, minWidth, maxWidth);
      }
    } catch {
      /* localStorage unavailable — fall back to default */
    }
    return clamp(defaultWidth, minWidth, maxWidth);
  });

  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    },
    [width],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      // Handle sits on the LEFT edge of a right-docked panel, so moving the
      // pointer left (dx < 0) widens it.
      const dx = e.clientX - startX.current;
      setWidth(clamp(startW.current - dx, minWidth, maxWidth));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [minWidth, maxWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      /* localStorage unavailable — width simply won't persist */
    }
  }, [storageKey, width]);

  return (
    <div
      className={cn(
        "relative flex-shrink-0 border-l border-border bg-card/50",
        className,
      )}
      style={{ width }}
      data-testid="resizable-sidebar"
    >
      <div
        onPointerDown={onPointerDown}
        onDoubleClick={() => setWidth(clamp(defaultWidth, minWidth, maxWidth))}
        title="Drag to resize · double-click to reset"
        className="group absolute inset-y-0 left-0 z-30 w-2 cursor-col-resize touch-none select-none"
        data-testid="resizable-sidebar-handle"
      >
        <span className="absolute inset-y-0 left-0 w-px bg-transparent transition-colors group-hover:bg-primary/60" />
      </div>
      <div className="h-full overflow-y-auto">{children}</div>
    </div>
  );
}
