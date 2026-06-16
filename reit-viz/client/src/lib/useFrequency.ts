// Hand-written from call-site inference (PairOptimizer.tsx)
// useFrequency: manages a "daily" | "weekly" | "monthly" frequency toggle
// with a rendered UI element.

import { useState, useMemo, createElement } from "react";

export type Frequency = "daily" | "weekly" | "monthly" | "weekly_on_daily";

export function isValidFrequency(v: unknown): v is Frequency {
  return v === "daily" || v === "weekly" || v === "monthly" || v === "weekly_on_daily";
}

export interface UseFrequencyResult {
  frequency: Frequency;
  setFrequency: (f: Frequency) => void;
  /** A React element rendering frequency toggle buttons. */
  frequencyUI: React.ReactNode;
}

const FREQ_OPTIONS: Array<{ value: Frequency; label: string }> = [
  { value: "daily",            label: "D" },
  { value: "weekly",           label: "W" },
  { value: "weekly_on_daily",  label: "W/D" },
];

/**
 * @param namespace   Unique namespace (unused in this stub but matches call sites).
 * @param initial     Initial frequency value.
 * @param disabled    When true, the UI buttons are disabled.
 */
export function useFrequency(
  namespace: string,
  initial: Frequency = "daily",
  disabled = false
): UseFrequencyResult {
  const [frequency, setFrequency] = useState<Frequency>(initial);

  const frequencyUI = useMemo(
    () =>
      createElement(
        "div",
        { className: "flex flex-col gap-0.5" },
        createElement(
          "label",
          { className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider" },
          "Freq"
        ),
        createElement(
          "div",
          { className: "flex gap-px" },
          ...FREQ_OPTIONS.map((opt) =>
            createElement(
              "button",
              {
                key: opt.value,
                disabled,
                "data-testid": `${namespace}-freq-${opt.value}`,
                onClick: () => setFrequency(opt.value),
                className: [
                  "text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors",
                  frequency === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground border border-border",
                  disabled ? "opacity-50 cursor-not-allowed" : "",
                ]
                  .filter(Boolean)
                  .join(" "),
              },
              opt.label
            )
          )
        )
      ),
    [frequency, disabled]
  );

  return { frequency, setFrequency, frequencyUI };
}
