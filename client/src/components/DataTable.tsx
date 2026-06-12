import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlottedSeries } from "@/pages/Dashboard";

interface DataTableProps {
  plottedSeries: PlottedSeries[];
  crosshairTime?: string | null;
}

export default function DataTable({ plottedSeries, crosshairTime }: DataTableProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [sortAsc, setSortAsc] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const highlightRowRef = useRef<HTMLTableRowElement>(null);

  const visibleSeries = plottedSeries.filter((s) => s.visible);

  // Build unified date table
  const tableData = useMemo(() => {
    if (visibleSeries.length === 0) return [];

    // Collect all unique dates
    const dateSet = new Set<string>();
    for (const s of visibleSeries) {
      for (const d of s.data) dateSet.add(d.time);
    }
    const allDates = Array.from(dateSet).sort();
    if (!sortAsc) allDates.reverse();

    // Build lookup maps
    const maps = visibleSeries.map((s) => {
      const m = new Map<string, number>();
      for (const d of s.data) m.set(d.time, d.value);
      return m;
    });

    return allDates.slice(0, 2000).map((date) => ({
      date,
      values: maps.map((m) => m.get(date) ?? null),
    }));
  }, [visibleSeries, sortAsc]);

  // Auto-scroll to the crosshair row when it changes
  useEffect(() => {
    if (!crosshairTime || !isOpen || !scrollRef.current || !highlightRowRef.current) return;
    highlightRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [crosshairTime, isOpen]);

  const exportCSV = () => {
    if (tableData.length === 0) return;
    const header = ["Date", ...visibleSeries.map((s) => s.label)].join(",");
    const rows = tableData.map(
      (row) =>
        [row.date, ...row.values.map((v) => (v !== null ? v.toString() : ""))].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reit_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (visibleSeries.length === 0) return null;

  return (
    <div className="border-t border-border bg-card/30 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border">
        <button
          className="flex items-center gap-2 text-xs font-medium"
          onClick={() => setIsOpen(!isOpen)}
          data-testid="toggle-table"
        >
          {isOpen ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronUp className="w-3 h-3" />
          )}
          Data Table
          <span className="text-muted-foreground text-[10px]">
            {tableData.length} dates · {visibleSeries.length} series
          </span>
        </button>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setSortAsc(!sortAsc)}
          >
            Sort: {sortAsc ? "Oldest" : "Newest"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={exportCSV}
            data-testid="export-csv"
          >
            <Download className="w-3 h-3 mr-1" />
            CSV
          </Button>
        </div>
      </div>

      {isOpen && (
        <div ref={scrollRef} className="max-h-[200px] overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr>
                <th className="text-left px-2 py-1 font-medium text-muted-foreground border-b border-border">
                  Date
                </th>
                {visibleSeries.map((s) => (
                  <th
                    key={s.id}
                    className="text-right px-2 py-1 font-medium border-b border-border"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-sm mr-1"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row) => {
                const isHighlighted = crosshairTime === row.date;
                return (
                  <tr
                    key={row.date}
                    ref={isHighlighted ? highlightRowRef : undefined}
                    className={
                      isHighlighted
                        ? "bg-primary/20 ring-1 ring-primary/40"
                        : "hover:bg-accent/20"
                    }
                  >
                    <td className={`px-2 py-0.5 font-mono ${isHighlighted ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                      {row.date}
                    </td>
                    {row.values.map((val, i) => (
                      <td
                        key={i}
                        className={`text-right px-2 py-0.5 font-mono tabular-nums ${isHighlighted ? "font-semibold" : ""}`}
                      >
                        {val !== null && typeof val === "number" ? val.toFixed(2) : "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
