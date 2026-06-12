// Hand-written — lucide Square icon bundled as local module
// Named export `S` matches minified import alias used in reconstructed pages.
import { createLucideIcon } from "@/lib/createLucideIcon";

export const Square = createLucideIcon("Square", [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
]);

// Alias used in reconstructed pages: `import { S as SquareIcon } from "@/lib/square"`
export { Square as S };
export default Square;
