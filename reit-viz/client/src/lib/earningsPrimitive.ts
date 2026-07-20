// EarningsDatePrimitive — vertical earnings-date lines for lightweight-charts.
// Thin wrapper over VerticalLinePrimitive; PremiumDiscount constructs it with
// an array of {time, color, label} markers and attaches via attachPrimitive().

import { VerticalLinePrimitive } from "@/lib/verticalLinePrimitive";

export interface EarningsDatePrimitiveOptions {
  ticker?: string;
  dates?: string[];
  color?: string;
  lineWidth?: number;
  [key: string]: any;
}

type Marker = { time: string; color?: string; label?: string };

function toEntries(input: EarningsDatePrimitiveOptions | Marker[] | any[]): { time: string; color: string; label?: string }[] {
  if (Array.isArray(input)) {
    return input
      .filter((m: any) => m && typeof m.time === "string")
      .map((m: any) => ({ time: m.time, color: m.color ?? "#f59e0b", label: m.label ?? "E" }));
  }
  const opts = input ?? {};
  return (opts.dates ?? []).map((d: string) => ({ time: d, color: opts.color ?? "#f59e0b", label: "E" }));
}

export class EarningsDatePrimitive extends VerticalLinePrimitive {
  constructor(options: EarningsDatePrimitiveOptions | any[]) {
    super(toEntries(options));
  }

  /** LWC calls attached() on attachPrimitive — request a paint immediately so
   *  the lines appear without waiting for the next chart update. */
  attached(param: any): void {
    super.attached(param);
    try { param.requestUpdate?.(); } catch {}
  }

  /** Update the list of earnings dates. */
  update(dates: string[]): void {
    this.setLines((dates ?? []).map((d) => ({ time: d, color: "#f59e0b", label: "E" })));
  }

  /** Back-compat alias; actual detachment happens via series.detachPrimitive. */
  detach(): void {
    this.setLines([]);
  }
}
