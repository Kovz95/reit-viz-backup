/**
 * Tiny dropdown for exporting a chart as PNG or PDF.
 * Works with both LWC IChartApi and raw HTMLCanvasElement.
 */

import { Camera } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IChartApi } from "lightweight-charts";
import {
  exportChartPng,
  exportChartPdf,
  exportCanvasPng,
  exportCanvasPdf,
} from "@/lib/chartExport";

interface ExportMenuProps {
  /** LWC chart instance OR a ref to a raw canvas */
  getChart?: () => IChartApi | null;
  getCanvas?: () => HTMLCanvasElement | null;
  /** Label used in the filename, e.g. "ESS_Price_vs_P-FFO" */
  label: string;
  className?: string;
}

export default function ExportMenu({ getChart, getCanvas, label, className = "" }: ExportMenuProps) {
  const handlePng = () => {
    if (getChart) {
      const chart = getChart();
      if (chart) exportChartPng(chart, label);
    } else if (getCanvas) {
      const canvas = getCanvas();
      if (canvas) exportCanvasPng(canvas, label);
    }
  };

  const handlePdf = () => {
    if (getChart) {
      const chart = getChart();
      if (chart) exportChartPdf(chart, label);
    } else if (getCanvas) {
      const canvas = getCanvas();
      if (canvas) exportCanvasPdf(canvas, label);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`p-0.5 rounded bg-background/80 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground ${className}`}
          title="Export chart"
          data-testid="export-chart"
        >
          <Camera className="w-3 h-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        <DropdownMenuItem onClick={handlePng} data-testid="export-png">
          Export PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePdf} data-testid="export-pdf">
          Export PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
