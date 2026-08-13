// AddPairControl — the shared "add a pair ratio" affordance used by Event Lab
// (Performance / Sigma tabs). Replaces the bare "Pair A/B" text inputs with the
// same robust picker pattern the other pair surfaces use: two
// UnifiedTickerPicker legs (workbook autocomplete + any Yahoo symbol) plus a
// quick "A/B" type-ahead for power users, with inline validation instead of
// silently swallowing bad input.
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { Plus } from "lucide-react";

const LEG_RE = /^[A-Z0-9.\-^=]{1,12}$/;

interface AddPairControlProps {
  /** Universe offered in the leg pickers ({ticker, name?, …} or plain strings). */
  tickers: Array<{ ticker: string; name?: string } | string> | null | undefined;
  /** Called with validated, uppercased legs. */
  onAdd: (a: string, b: string) => void;
  /** Existing pair keys ("A/B") for duplicate detection. */
  existing?: string[];
  testIdPrefix?: string;
  /** Trigger button height class (default h-6 to match toolbar chips). */
  buttonClassName?: string;
}

export function AddPairControl({ tickers, onAdd, existing, testIdPrefix = "add-pair", buttonClassName = "h-6 px-2 text-[11px]" }: AddPairControlProps) {
  const [open, setOpen] = useState(false);
  const [legA, setLegA] = useState("");
  const [legB, setLegB] = useState("");
  const [quick, setQuick] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Remount pickers after each add so their inputs clear.
  const [epoch, setEpoch] = useState(0);

  const pickerTickers = useMemo(
    () =>
      (tickers ?? [])
        .map((t) => (typeof t === "string" ? { ticker: t } : t))
        .filter((t) => t && typeof t.ticker === "string"),
    [tickers]
  );

  const tryAdd = (rawA: string, rawB: string) => {
    const a = (rawA || "").trim().toUpperCase();
    const b = (rawB || "").trim().toUpperCase();
    if (!a || !b) { setError("Pick both legs (A and B)."); return; }
    if (!LEG_RE.test(a) || !LEG_RE.test(b)) { setError("Legs must be plain symbols (e.g. WELL, XLE, ^TNX)."); return; }
    if (a === b) { setError("Legs must differ."); return; }
    if (existing?.includes(`${a}/${b}`)) { setError(`${a}/${b} is already added.`); return; }
    setError(null);
    onAdd(a, b);
    setLegA(""); setLegB(""); setQuick("");
    setEpoch((e) => e + 1);
    setOpen(false);
  };

  const tryQuick = () => {
    const m = quick.trim().toUpperCase().match(/^([A-Z0-9.\-^=]{1,12})\s*\/\s*([A-Z0-9.\-^=]{1,12})$/);
    if (!m) { setError(`Type the pair as A/B (e.g. WELL/VTR).`); return; }
    tryAdd(m[1], m[2]);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={buttonClassName}
          title="Add a pair ratio row (A/B) — searchable workbook pickers; any Yahoo symbol works as a leg"
          data-testid={`${testIdPrefix}-open`}
        >
          <Plus className="w-3 h-3 mr-1" /> Pair
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] p-3 flex flex-col gap-2.5"
        data-testid={`${testIdPrefix}-popover`}
        // Don't auto-focus the leg-A picker on open — its dropdown would
        // immediately blanket the rest of the popover.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="text-[11px] font-medium text-foreground">Add pair ratio (A ÷ B)</div>
        <UnifiedTickerPicker
          key={`a-${epoch}`}
          tickers={pickerTickers}
          value={legA}
          onChange={(t) => { setLegA(t); setError(null); }}
          label="Leg A (numerator)"
          placeholder="Search or type any symbol…"
        />
        <UnifiedTickerPicker
          key={`b-${epoch}`}
          tickers={pickerTickers}
          value={legB}
          onChange={(t) => { setLegB(t); setError(null); }}
          label="Leg B (denominator)"
          placeholder="Search or type any symbol…"
        />
        <div className="flex items-center gap-1.5">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">or type</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <input
          type="text"
          value={quick}
          onChange={(e) => { setQuick(e.target.value.toUpperCase()); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") tryQuick(); }}
          placeholder="WELL/VTR — Enter to add"
          className="h-7 px-2 text-[11px] font-mono bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          data-testid={`${testIdPrefix}-quick`}
        />
        {error && <div className="text-[10px] text-red-400" data-testid={`${testIdPrefix}-error`}>{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => {
              // Explicit leg picks win over leftover quick-field text.
              if (legA.trim() && legB.trim()) tryAdd(legA, legB);
              else if (quick.trim()) tryQuick();
              else tryAdd(legA, legB);
            }}
            data-testid={`${testIdPrefix}-add`}
          >
            Add pair
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AddPairControl;
