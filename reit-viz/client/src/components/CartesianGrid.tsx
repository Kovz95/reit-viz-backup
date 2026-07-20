// The recovered bundle inlined recharts' own CartesianGrid here; the
// reconstruction depended on recharts-internal hooks that were stubbed to
// no-ops, so the grid never rendered. The installed recharts exports the
// identical component — re-export it directly.

import { CartesianGrid } from "recharts";

export { CartesianGrid, CartesianGrid as C };
export default CartesianGrid;
