// Hand-written stub — recharts internal utilities used by the reconstructed CartesianGrid component.
// These are normally internal to the recharts package. This stub re-exports them where available
// or provides safe no-op stubs for functions not exposed by the public API.

// Re-export what recharts publicly exposes:
export {
  XAxis,
  YAxis,
  generateCategoricalChart,
} from "recharts";

export type { XAxis as XAxisType } from "recharts";

// ── Stubs for internal recharts hooks and utilities ────────────────────────────
// These are used by the CartesianGrid override component. They return safe defaults.

export function useChartWidth(): number {
  return 0;
}

export function useChartHeight(): number {
  return 0;
}

export function useViewBox(): { x: number; y: number; width: number; height: number } {
  return { x: 0, y: 0, width: 0, height: 0 };
}

export function isNumOrStr(value: unknown): value is number | string {
  return typeof value === "number" || typeof value === "string";
}

export function useXAxisOrThrow(): any {
  return {};
}

export function useYAxisOrThrow(): any {
  return {};
}

export function isFunction(value: unknown): value is Function {
  return typeof value === "function";
}

export function assertIsArrayOf<T>(_value: unknown, _guard: (v: unknown) => v is T): void {
  // no-op in stub
}

export function getTicksOfAxis(_axis: any, _scale?: boolean): any[] {
  return [];
}

export function getCoordinatesOfGrid(_ticks: any[], _min: number, _max: number): any[] {
  return [];
}

export function filterProps(
  props: Record<string, any>,
  _isSvg: boolean,
  _excludedProps?: string[]
): Record<string, any> {
  return props;
}
