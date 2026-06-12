/**
 * Chart export utilities — PNG and PDF export for LWC charts and raw canvases.
 *
 * LWC charts use `chart.takeScreenshot()` which returns a canvas.
 * Scatter page uses raw <canvas> element directly.
 */

import type { IChartApi } from "lightweight-charts";
import { jsPDF } from "jspdf";

/** Trigger a file download from a data URL */
function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Generate a timestamped filename */
function makeFilename(label: string, ext: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
  return `${safe}_${ts}.${ext}`;
}

/**
 * Export a LWC chart to PNG.
 * takeScreenshot() renders the chart at its current size onto a fresh canvas.
 */
export function exportChartPng(chart: IChartApi, label: string) {
  try {
    const canvas = chart.takeScreenshot();
    const dataUrl = canvas.toDataURL("image/png");
    downloadDataUrl(dataUrl, makeFilename(label, "png"));
  } catch (err) {
    console.error("PNG export failed:", err);
  }
}

/**
 * Export a LWC chart to PDF (landscape, chart fills the page).
 */
export function exportChartPdf(chart: IChartApi, label: string) {
  try {
    const canvas = chart.takeScreenshot();
    const imgData = canvas.toDataURL("image/png");
    const w = canvas.width;
    const h = canvas.height;

    // PDF page in landscape, sized to chart aspect ratio
    const pdfW = 297; // A4 landscape width in mm
    const pdfH = (h / w) * pdfW;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [pdfW, Math.max(pdfH + 20, 100)],
    });

    // Title
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(label, 10, 8);
    doc.setFontSize(7);
    doc.text(new Date().toLocaleString(), 10, 13);

    // Chart image
    doc.addImage(imgData, "PNG", 5, 16, pdfW - 10, pdfH - 2);

    doc.save(makeFilename(label, "pdf"));
  } catch (err) {
    console.error("PDF export failed:", err);
  }
}

/**
 * Export a raw canvas element to PNG (for Scatter page).
 */
export function exportCanvasPng(canvas: HTMLCanvasElement, label: string) {
  try {
    const dataUrl = canvas.toDataURL("image/png");
    downloadDataUrl(dataUrl, makeFilename(label, "png"));
  } catch (err) {
    console.error("Canvas PNG export failed:", err);
  }
}

/**
 * Export a raw canvas element to PDF.
 */
export function exportCanvasPdf(canvas: HTMLCanvasElement, label: string) {
  try {
    const imgData = canvas.toDataURL("image/png");
    const w = canvas.width;
    const h = canvas.height;
    const pdfW = 297;
    const pdfH = (h / w) * pdfW;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [pdfW, Math.max(pdfH + 20, 100)],
    });
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(label, 10, 8);
    doc.setFontSize(7);
    doc.text(new Date().toLocaleString(), 10, 13);
    doc.addImage(imgData, "PNG", 5, 16, pdfW - 10, pdfH - 2);
    doc.save(makeFilename(label, "pdf"));
  } catch (err) {
    console.error("Canvas PDF export failed:", err);
  }
}
