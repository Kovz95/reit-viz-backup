// Reusable click-to-sort for tables across the app.
//
// Goal: every data table (one row per entity — ticker, pair, optimizer result…)
// can be sorted by clicking a column header, cycling desc → asc, with nulls/NaN
// always sorted last regardless of direction. Mirrors the behaviour of the
// Ranking (Cross-Section) page, which is the reference implementation.
//
// Usage:
//   const sort = useTableSort<Row>("score");            // initial column, desc
//   const rows = sort.apply(rawRows, (row, key) => {    // map column key → value
//     switch (key) {
//       case "ticker": return row.ticker;               // strings sort A→Z / Z→A
//       default: return row[key] as number;             // numbers sort hi→lo / lo→hi
//     }
//   });
//   // in <thead>:
//   <th><SortHeader label="Score" columnKey="score" sort={sort} /></th>
//
// The accessor may return number | string | null | undefined; non-finite numbers
// and nullish values are treated as "missing" and pushed to the bottom.

import { useState, useCallback, useEffect } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export type SortValue = number | string | null | undefined;
export type SortAccessor<T> = (row: T, key: string) => SortValue;

export interface TableSort<T> {
  sortKey: string;
  sortDir: SortDir;
  /** Toggle direction if the same key, otherwise switch to `key` (starting dir). */
  onSort: (key: string) => void;
  /** Return a new, sorted copy of `rows` using `accessor` for the active key. */
  apply: (rows: T[], accessor: SortAccessor<T>) => T[];
  setSort: (key: string, dir?: SortDir) => void;
}

function isMissing(v: SortValue): boolean {
  return v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
}

// Sort state persists to sessionStorage (survives in-app tab switches AND a
// full page refresh in the same tab) when a persistKey is supplied.
function loadPersistedSort(persistKey?: string): { key: string; dir: SortDir } | null {
  if (!persistKey) return null;
  try {
    const raw = sessionStorage.getItem("tblsort:" + persistKey);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.key === "string" && (p.dir === "asc" || p.dir === "desc")) return p;
  } catch {}
  return null;
}

/**
 * @param initialKey  column key to sort by on first render ("" = unsorted)
 * @param initialDir  direction for the initial key (default "desc")
 * @param startDir    direction applied when the user clicks a *new* column (default "desc")
 * @param persistKey  when set, the active sort is saved to sessionStorage under
 *                    this key and restored on mount (survives tab switch + refresh)
 */
export function useTableSort<T>(
  initialKey = "",
  initialDir: SortDir = "desc",
  startDir: SortDir = "desc",
  persistKey?: string,
): TableSort<T> {
  const [sortKey, setSortKey] = useState(() => loadPersistedSort(persistKey)?.key ?? initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(() => loadPersistedSort(persistKey)?.dir ?? initialDir);

  useEffect(() => {
    if (!persistKey) return;
    try {
      sessionStorage.setItem("tblsort:" + persistKey, JSON.stringify({ key: sortKey, dir: sortDir }));
    } catch {}
  }, [persistKey, sortKey, sortDir]);

  const onSort = useCallback((key: string) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir(startDir);
      return key;
    });
  }, [startDir]);

  const setSort = useCallback((key: string, dir: SortDir = startDir) => {
    setSortKey(key);
    setSortDir(dir);
  }, [startDir]);

  const apply = useCallback((rows: T[], accessor: SortAccessor<T>): T[] => {
    if (!sortKey || rows.length < 2) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = accessor(a, sortKey);
      const bv = accessor(b, sortKey);
      const am = isMissing(av), bm = isMissing(bv);
      if (am && bm) return 0;
      if (am) return 1;   // missing always last, regardless of direction
      if (bm) return -1;
      if (typeof av === "string" || typeof bv === "string") {
        const cmp = String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [sortKey, sortDir]);

  return { sortKey, sortDir, onSort, apply, setSort };
}

/** Sort direction glyph: neutral when the column isn't the active sort. */
export function SortIndicator({ active, dir, className }: { active: boolean; dir: SortDir; className?: string }) {
  const cls = cn("w-2.5 h-2.5 inline-block shrink-0", className);
  if (!active) return <ArrowUpDown className={cn(cls, "opacity-30")} />;
  return dir === "asc" ? <ArrowUp className={cls} /> : <ArrowDown className={cls} />;
}

/**
 * Clickable column-header label. Drop inside an existing `<th>` / `<TableHead>`:
 *   <th className="text-right"><SortHeader label="P/E" columnKey="pe" sort={sort} align="right" /></th>
 * Renders a button so it's keyboard-accessible; inherits the cell's text styles.
 */
export function SortHeader<T>({
  label,
  columnKey,
  sort,
  align = "left",
  className,
  title,
}: {
  label: React.ReactNode;
  columnKey: string;
  sort: TableSort<T>;
  align?: "left" | "right" | "center";
  className?: string;
  title?: string;
}) {
  const active = sort.sortKey === columnKey;
  return (
    <button
      type="button"
      onClick={() => sort.onSort(columnKey)}
      title={title}
      className={cn(
        "inline-flex items-center gap-0.5 select-none hover:text-foreground transition-colors",
        active ? "text-foreground" : "",
        align === "right" ? "justify-end flex-row-reverse" : align === "center" ? "justify-center" : "",
        className,
      )}
    >
      <span>{label}</span>
      <SortIndicator active={active} dir={sort.sortDir} />
    </button>
  );
}
