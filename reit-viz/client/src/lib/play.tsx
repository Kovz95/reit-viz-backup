// Hand-written — lucide Play icon bundled as local module
// Named export `P` matches minified import alias used in reconstructed pages.
import { createLucideIcon } from "@/lib/createLucideIcon";

export const Play = createLucideIcon("Play", [
  ["polygon", { points: "6 3 20 12 6 21 6 3" }],
]);

// Alias used in reconstructed pages: `import { P as PlayIcon } from "@/lib/play"`
export { Play as P };
export default Play;
