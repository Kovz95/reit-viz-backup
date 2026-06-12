// Hand-written stub — ExportMenu and CanvasDownloadButton used in DividendSpread, Scatter pages
import { createElement } from "react";
import { createLucideIcon } from "@/lib/createLucideIcon";

const Download = createLucideIcon("Download", [
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
  ["polyline", { points: "7 10 12 15 17 10" }],
  ["line", { x1: "12", x2: "12", y1: "3", y2: "15" }],
]);

export interface ExportMenuProps {
  onExportCsv?: () => void;
  onExportPng?: () => void;
  label?: string;
  className?: string;
}

export function ExportMenu({ onExportCsv, onExportPng, label, className }: ExportMenuProps) {
  return createElement(
    "div",
    { className: ["flex gap-1", className].filter(Boolean).join(" ") },
    onExportCsv &&
      createElement(
        "button",
        {
          onClick: onExportCsv,
          className: "text-[10px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5",
        },
        "CSV"
      ),
    onExportPng &&
      createElement(
        "button",
        {
          onClick: onExportPng,
          className: "text-[10px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5",
        },
        "PNG"
      )
  );
}

export interface CanvasDownloadButtonProps {
  getCanvas: () => HTMLCanvasElement | null | undefined;
  label?: string;
  className?: string;
}

export function CanvasDownloadButton({ getCanvas, label, className }: CanvasDownloadButtonProps) {
  function handleClick() {
    const canvas = getCanvas?.();
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `${label ?? "chart"}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  return createElement(
    "button",
    {
      onClick: handleClick,
      className: ["text-[10px] font-mono flex items-center gap-1 text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5", className]
        .filter(Boolean)
        .join(" "),
    },
    createElement(Download, { size: 12 }),
    "PNG"
  );
}
