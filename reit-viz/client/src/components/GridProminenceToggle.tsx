// Compact toolbar control for the GLOBAL background-grid boldness preference
// (lib/gridPref). Dropped into the toolbar of every non-Charts-tab chart page;
// the Charts tab keeps its own per-workspace control in the Sidebar.

import { Grid3X3 } from "lucide-react";
import { useGridProminence, type GridProminence } from "@/lib/gridPref";

const OPTIONS: GridProminence[] = ["off", "normal", "bold"];

export default function GridProminenceToggle({ className = "" }: { className?: string }) {
  const [prominence, setProminence] = useGridProminence();
  return (
    <div
      className={`flex items-center gap-0.5 border border-border rounded ${className}`}
      title="Background grid line boldness (applies to all chart pages)"
      data-testid="grid-prominence-toggle"
    >
      <Grid3X3 className="w-3 h-3 text-muted-foreground ml-1.5 mr-0.5 flex-shrink-0" />
      {OPTIONS.map((g) => (
        <button
          key={g}
          onClick={() => setProminence(g)}
          className={`px-1.5 py-0.5 text-[10px] capitalize ${prominence === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          data-testid={`grid-prominence-${g}`}
        >
          {g}
        </button>
      ))}
    </div>
  );
}
