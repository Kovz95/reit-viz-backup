// Date entry with an explicit calendar picker. Wraps the native date input
// (typing still works) and adds a calendar-icon button that opens the themed
// react-day-picker popover — the native indicator is easy to miss on the dark
// UI, so every date field gets an obvious click target.
//
// Value protocol matches the native input: "" (unset) or "YYYY-MM-DD".

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Classes for the native input (size it like the control it replaces). */
  className?: string;
  /** Classes for the calendar button; keep its height in sync with the input. */
  buttonClassName?: string;
  /** Classes for the wrapping flex row (e.g. "flex-1" to stretch in a flex parent). */
  wrapperClassName?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

function toDate(v: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00`);
  return isNaN(d.getTime()) ? undefined : d;
}

function toStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DateInput({
  value,
  onChange,
  className = "h-6 text-[11px] w-[130px]",
  buttonClassName = "h-6 w-6",
  wrapperClassName = "",
  min,
  max,
  disabled,
  "data-testid": testId,
}: DateInputProps) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const minDate = min ? toDate(min) : undefined;
  const maxDate = max ? toDate(max) : undefined;
  const disabledDays = minDate || maxDate
    ? [
        ...(minDate ? [{ before: minDate }] : []),
        ...(maxDate ? [{ after: maxDate }] : []),
      ]
    : undefined;
  return (
    <div className={`flex items-center gap-0.5 ${wrapperClassName}`}>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        min={min}
        max={max}
        disabled={disabled}
        data-testid={testId}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`${buttonClassName} p-0 flex-shrink-0`}
            disabled={disabled}
            title="Pick a date"
            data-testid={testId ? `${testId}-calendar` : undefined}
          >
            <CalendarDays className="w-3.5 h-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? maxDate}
            disabled={disabledDays}
            onSelect={(d) => {
              if (d) {
                onChange(toStr(d));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
