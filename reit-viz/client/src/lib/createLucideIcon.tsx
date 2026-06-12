// Hand-written from call-site inference (Alerts.tsx, DataExplorer.tsx)
// createLucideIcon: factory that builds a minimal lucide-compatible SVG icon component
// from an array of SVG element descriptors.

import { createElement, forwardRef } from "react";

type SvgChild = [string, Record<string, string>];

export interface LucideIconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
  color?: string;
  style?: React.CSSProperties;
  [key: string]: any;
}

export type LucideIcon = React.ForwardRefExoticComponent<
  LucideIconProps & React.RefAttributes<SVGSVGElement>
>;

/**
 * Creates a lucide-compatible icon component from a name and path/element descriptors.
 *
 * @param name    Display name for the component.
 * @param paths   Array of [tagName, attributes] tuples — each becomes an SVG child element.
 */
export function createLucideIcon(
  name: string,
  paths: SvgChild[]
): LucideIcon {
  const Component = forwardRef<SVGSVGElement, LucideIconProps>(
    ({ size = 24, className, strokeWidth = 2, color = "currentColor", style, ...rest }, ref) => {
      return createElement(
        "svg",
        {
          ref,
          xmlns: "http://www.w3.org/2000/svg",
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: color,
          strokeWidth,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          className: ["lucide", `lucide-${name.toLowerCase()}`, className].filter(Boolean).join(" "),
          style,
          ...rest,
        },
        ...paths.map(([tag, attrs], i) =>
          createElement(tag, { key: i, ...attrs })
        )
      );
    }
  );
  Component.displayName = name;
  return Component;
}
