// Hand-written from call-site inference (AutoTrendlineBacktest.tsx)
// InputSeriesSelector: dropdown for picking which price series to feed into an optimizer.

import { createElement } from "react";

export type InputSeriesKind = "ohlcv" | "workbook";

export interface InputSelection {
  kind: InputSeriesKind;
  series?: "close" | "hl2" | "ohlc4" | "heikin" | "log";
  metric?: string;
}

export const DEFAULT_INPUT_SELECTION: InputSelection = {
  kind: "ohlcv",
  series: "close",
};

const OHLCV_OPTIONS: Array<{ label: string; value: InputSelection }> = [
  { label: "Close",       value: { kind: "ohlcv", series: "close" }  },
  { label: "HL/2",        value: { kind: "ohlcv", series: "hl2" }    },
  { label: "OHLC/4",      value: { kind: "ohlcv", series: "ohlc4" }  },
  { label: "Heikin Ashi", value: { kind: "ohlcv", series: "heikin" } },
  { label: "Log Close",   value: { kind: "ohlcv", series: "log" }    },
];

export interface InputSeriesSelectorProps {
  value: InputSelection;
  onChange: (next: InputSelection) => void;
  options?: Array<{ label: string; value: InputSelection }>;
  family?: string;
  label?: string;
  className?: string;
}

/**
 * Dropdown component for selecting the input price series for optimizers.
 */
export function InputSeriesSelector({
  value,
  onChange,
  options = OHLCV_OPTIONS,
  className,
}: InputSeriesSelectorProps): JSX.Element {
  const serialized = JSON.stringify(value);

  return createElement(
    "select",
    {
      className: [
        "text-xs font-mono bg-background border border-border rounded px-2 py-1",
        className,
      ]
        .filter(Boolean)
        .join(" "),
      value: serialized,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
        try {
          onChange(JSON.parse(e.target.value));
        } catch {
          // ignore parse failure
        }
      },
    },
    ...options.map((opt) =>
      createElement(
        "option",
        { key: JSON.stringify(opt.value), value: JSON.stringify(opt.value) },
        opt.label
      )
    )
  );
}
