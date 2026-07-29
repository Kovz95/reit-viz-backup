// Shared CSV download helper — replaces the hand-rolled Blob writers that were
// duplicated across pages/modals. Quotes any cell containing a comma, quote,
// or newline; null/undefined render as empty cells.

function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(
  filename: string,
  rows: Array<Array<string | number | null | undefined>>,
  header?: Array<string | number>,
): void {
  const all = header ? [header, ...rows] : rows;
  const csv = all.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
