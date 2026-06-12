// Reconstructed from recovered-bundle/CartesianGrid-BQtjaw_K.js on 2026-06-11

import React from "react";
import {
  useChartWidth,
  useChartHeight,
  useViewBox,
  isNumOrStr,
  useXAxisOrThrow,
  useYAxisOrThrow,
  isFunction,
  assertIsArrayOf,
  XAxis as XAxisType,
  getTicksOfAxis,
  getCoordinatesOfGrid,
  generateCategoricalChart,
  filterProps,
} from "@/lib/rechartsInternals";

const EXCLUDED_LINE_PROPS = ["x1", "y1", "x2", "y2", "key"];
const EXCLUDED_OFFSET_PROPS = ["offset"];

// ---------- helpers ----------

function _typeof(obj: any): string {
  "@babel/helpers - typeof";
  return (_typeof =
    typeof Symbol === "function" && typeof Symbol.iterator === "symbol"
      ? (o) => typeof o
      : (o) =>
          o &&
          typeof Symbol === "function" &&
          o.constructor === Symbol &&
          o !== Symbol.prototype
            ? "symbol"
            : typeof o)(obj);
}

function _objectSpread(target: any, ...sources: any[]): any {
  const result = Object.assign({}, target);
  for (const source of sources) {
    if (source != null) {
      Object.assign(result, source);
    }
  }
  return result;
}

function _objectWithoutProperties(source: any, excluded: string[]): any {
  if (source == null) return {};
  const result: any = {};
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (excluded.indexOf(key) >= 0) continue;
      result[key] = source[key];
    }
  }
  if (Object.getOwnPropertySymbols) {
    const symbols = Object.getOwnPropertySymbols(source);
    for (const sym of symbols) {
      if (!(excluded.indexOf(sym as any) >= 0) && Object.prototype.propertyIsEnumerable.call(source, sym)) {
        result[sym as any] = source[sym as any];
      }
    }
  }
  return result;
}

// ---------- background rect ----------

const GridBackground = (props: {
  fill?: string;
  fillOpacity?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  ry?: number;
}): React.ReactElement | null => {
  const { fill } = props;
  if (!fill || fill === "none") return null;
  const { fillOpacity, x, y, width, height, ry } = props;
  return React.createElement("rect", {
    x,
    y,
    ry,
    width,
    height,
    stroke: "none",
    fill,
    fillOpacity,
    className: "recharts-cartesian-grid-bg",
  });
};

// ---------- line renderer ----------

function renderLine(lineSpec: any, props: any): React.ReactElement | null {
  if (React.isValidElement(lineSpec)) {
    return React.cloneElement(lineSpec as React.ReactElement, props);
  } else if (isFunction(lineSpec)) {
    return lineSpec(props);
  } else {
    const { x1, y1, x2, y2, key } = props;
    const rest = _objectWithoutProperties(props, EXCLUDED_LINE_PROPS);
    const filtered = filterProps(rest, false);
    const withoutOffset = _objectWithoutProperties(filtered, EXCLUDED_OFFSET_PROPS);
    return React.createElement("line", {
      ...withoutOffset,
      x1,
      y1,
      x2,
      y2,
      fill: "none",
      key,
    });
  }
}

// ---------- horizontal lines ----------

function HorizontalLines(props: any): React.ReactElement | null {
  const { x, width, horizontal, horizontalPoints } = props;
  const showHorizontal = horizontal === undefined ? true : horizontal;
  if (!showHorizontal || !horizontalPoints || !horizontalPoints.length) return null;
  const lines = horizontalPoints.map((y: number, idx: number) => {
    const lineProps = _objectSpread({}, props, {
      x1: x,
      y1: y,
      x2: x + width,
      y2: y,
      key: `line-${idx}`,
      index: idx,
    });
    return renderLine(showHorizontal, lineProps);
  });
  return React.createElement(
    "g",
    { className: "recharts-cartesian-grid-horizontal" },
    lines
  );
}

// ---------- vertical lines ----------

function VerticalLines(props: any): React.ReactElement | null {
  const { y, height, vertical, verticalPoints } = props;
  const showVertical = vertical === undefined ? true : vertical;
  if (!showVertical || !verticalPoints || !verticalPoints.length) return null;
  const lines = verticalPoints.map((x: number, idx: number) => {
    const lineProps = _objectSpread({}, props, {
      x1: x,
      y1: y,
      x2: x,
      y2: y + height,
      key: `line-${idx}`,
      index: idx,
    });
    return renderLine(showVertical, lineProps);
  });
  return React.createElement(
    "g",
    { className: "recharts-cartesian-grid-vertical" },
    lines
  );
}

// ---------- horizontal stripes ----------

function HorizontalStripes(props: any): React.ReactElement | null {
  const {
    horizontalFill,
    fillOpacity,
    x,
    y,
    width,
    height,
    horizontalPoints,
    horizontal,
  } = props;
  const showHorizontal = horizontal === undefined ? true : horizontal;
  if (!showHorizontal || !horizontalFill || !horizontalFill.length) return null;
  const adjustedPoints = horizontalPoints
    .map((h: number) => Math.round(h + y - y))
    .sort((a: number, b: number) => a - b);
  if (y !== adjustedPoints[0]) adjustedPoints.unshift(0);
  const rects = adjustedPoints.map((h: number, idx: number) => {
    const isLast = !adjustedPoints[idx + 1];
    const rectHeight = isLast ? y + height - h : adjustedPoints[idx + 1] - h;
    if (rectHeight <= 0) return null;
    const fillIdx = idx % horizontalFill.length;
    return React.createElement("rect", {
      key: `react-${idx}`,
      y: h,
      x,
      height: rectHeight,
      width,
      stroke: "none",
      fill: horizontalFill[fillIdx],
      fillOpacity,
      className: "recharts-cartesian-grid-bg",
    });
  });
  return React.createElement(
    "g",
    { className: "recharts-cartesian-gridstripes-horizontal" },
    rects
  );
}

// ---------- vertical stripes ----------

function VerticalStripes(props: any): React.ReactElement | null {
  const {
    vertical,
    verticalFill,
    fillOpacity,
    x,
    y,
    width,
    height,
    verticalPoints,
  } = props;
  const showVertical = vertical === undefined ? true : vertical;
  if (!showVertical || !verticalFill || !verticalFill.length) return null;
  const adjustedPoints = verticalPoints
    .map((v: number) => Math.round(v + x - x))
    .sort((a: number, b: number) => a - b);
  if (x !== adjustedPoints[0]) adjustedPoints.unshift(0);
  const rects = adjustedPoints.map((v: number, idx: number) => {
    const isLast = !adjustedPoints[idx + 1];
    const rectWidth = isLast ? x + width - v : adjustedPoints[idx + 1] - v;
    if (rectWidth <= 0) return null;
    const fillIdx = idx % verticalFill.length;
    return React.createElement("rect", {
      key: `react-${idx}`,
      x: v,
      y,
      width: rectWidth,
      height,
      stroke: "none",
      fill: verticalFill[fillIdx],
      fillOpacity,
      className: "recharts-cartesian-grid-bg",
    });
  });
  return React.createElement(
    "g",
    { className: "recharts-cartesian-gridstripes-vertical" },
    rects
  );
}

// ---------- coordinate generators ----------

const getVerticalCoordinatesOfGrid = (
  props: { xAxis?: any; width: number; height: number; offset: any },
  syncWithTicks: boolean
): number[] => {
  const { xAxis, width, height, offset } = props;
  return getCoordinatesOfGrid(
    getTicksOfAxis(
      _objectSpread(_objectSpread(_objectSpread({}, XAxisType.defaultProps), xAxis), {
        ticks: getTicksOfAxis(xAxis, true),
        viewBox: { x: 0, y: 0, width, height },
      }),
      true
    ),
    offset.left,
    offset.left + offset.width,
    syncWithTicks
  );
};

const getHorizontalCoordinatesOfGrid = (
  props: { yAxis?: any; width: number; height: number; offset: any },
  syncWithTicks: boolean
): number[] => {
  const { yAxis, width, height, offset } = props;
  return getCoordinatesOfGrid(
    getTicksOfAxis(
      _objectSpread(_objectSpread(_objectSpread({}, XAxisType.defaultProps), yAxis), {
        ticks: getTicksOfAxis(yAxis, true),
        viewBox: { x: 0, y: 0, width, height },
      }),
      true
    ),
    offset.top,
    offset.top + offset.height,
    syncWithTicks
  );
};

const defaultProps = {
  horizontal: true,
  vertical: true,
  stroke: "#ccc",
  fill: "none",
  verticalFill: [],
  horizontalFill: [],
};

// ---------- CartesianGrid ----------

function CartesianGrid(userProps: any): React.ReactElement | null {
  const chartWidth = useChartWidth();
  const chartHeight = useChartHeight();
  const offset = useViewBox();

  const props = _objectSpread({}, userProps, {
    stroke: userProps.stroke != null ? userProps.stroke : defaultProps.stroke,
    fill: userProps.fill != null ? userProps.fill : defaultProps.fill,
    horizontal: userProps.horizontal != null ? userProps.horizontal : defaultProps.horizontal,
    horizontalFill:
      userProps.horizontalFill != null ? userProps.horizontalFill : defaultProps.horizontalFill,
    vertical: userProps.vertical != null ? userProps.vertical : defaultProps.vertical,
    verticalFill:
      userProps.verticalFill != null ? userProps.verticalFill : defaultProps.verticalFill,
    x: isNumOrStr(userProps.x) ? userProps.x : offset.left,
    y: isNumOrStr(userProps.y) ? userProps.y : offset.top,
    width: isNumOrStr(userProps.width) ? userProps.width : offset.width,
    height: isNumOrStr(userProps.height) ? userProps.height : offset.height,
  });

  const { x, y, width, height, syncWithTicks, horizontalValues, verticalValues } = props;
  const xAxisContext = useXAxisOrThrow();
  const yAxisContext = useYAxisOrThrow();

  if (
    !isNumOrStr(width) ||
    width <= 0 ||
    !isNumOrStr(height) ||
    height <= 0 ||
    !isNumOrStr(x) ||
    x !== +x ||
    !isNumOrStr(y) ||
    y !== +y
  ) {
    return null;
  }

  const verticalCoordinatesGenerator =
    props.verticalCoordinatesGenerator || getVerticalCoordinatesOfGrid;
  const horizontalCoordinatesGenerator =
    props.horizontalCoordinatesGenerator || getHorizontalCoordinatesOfGrid;

  let horizontalPoints = props.horizontalPoints;
  let verticalPoints = props.verticalPoints;

  if ((!horizontalPoints || !horizontalPoints.length) && isFunction(horizontalCoordinatesGenerator)) {
    const hasCustomValues = horizontalValues && horizontalValues.length;
    const computedPoints = horizontalCoordinatesGenerator(
      {
        yAxis: yAxisContext
          ? _objectSpread({}, yAxisContext, {
              ticks: hasCustomValues ? horizontalValues : yAxisContext.ticks,
            })
          : undefined,
        width: chartWidth,
        height: chartHeight,
        offset,
      },
      hasCustomValues ? true : syncWithTicks
    );
    assertIsArrayOf(
      Array.isArray(computedPoints),
      `horizontalCoordinatesGenerator should return Array but instead it returned [${_typeof(computedPoints)}]`
    );
    if (Array.isArray(computedPoints)) horizontalPoints = computedPoints;
  }

  if ((!verticalPoints || !verticalPoints.length) && isFunction(verticalCoordinatesGenerator)) {
    const hasCustomValues = verticalValues && verticalValues.length;
    const computedPoints = verticalCoordinatesGenerator(
      {
        xAxis: xAxisContext
          ? _objectSpread({}, xAxisContext, {
              ticks: hasCustomValues ? verticalValues : xAxisContext.ticks,
            })
          : undefined,
        width: chartWidth,
        height: chartHeight,
        offset,
      },
      hasCustomValues ? true : syncWithTicks
    );
    assertIsArrayOf(
      Array.isArray(computedPoints),
      `verticalCoordinatesGenerator should return Array but instead it returned [${_typeof(computedPoints)}]`
    );
    if (Array.isArray(computedPoints)) verticalPoints = computedPoints;
  }

  return React.createElement(
    "g",
    { className: "recharts-cartesian-grid" },
    React.createElement(GridBackground, {
      fill: props.fill,
      fillOpacity: props.fillOpacity,
      x: props.x,
      y: props.y,
      width: props.width,
      height: props.height,
      ry: props.ry,
    }),
    React.createElement(HorizontalLines, {
      ...props,
      offset,
      horizontalPoints,
      xAxis: xAxisContext,
      yAxis: yAxisContext,
    }),
    React.createElement(VerticalLines, {
      ...props,
      offset,
      verticalPoints,
      xAxis: xAxisContext,
      yAxis: yAxisContext,
    }),
    React.createElement(HorizontalStripes, { ...props, horizontalPoints }),
    React.createElement(VerticalStripes, { ...props, verticalPoints })
  );
}

CartesianGrid.displayName = "CartesianGrid";

export { CartesianGrid as C };
export default CartesianGrid;
