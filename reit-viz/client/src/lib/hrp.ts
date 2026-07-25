// Hierarchical clustering + HRP (hierarchical risk parity) on a correlation
// matrix. Average-linkage agglomerative clustering on the standard distance
// d = sqrt(0.5·(1 − ρ)); quasi-diagonal leaf ordering (López de Prado);
// HRP weights by recursive bisection with inverse-variance allocation.

export interface HrpResult {
  /** Leaf order (indices into the input labels) that quasi-diagonalizes ρ. */
  order: number[];
  /** Flat clusters at the given cut: arrays of label indices. */
  clusters: number[][];
  /** HRP weight per input index (sums to 1). */
  weights: number[];
}

interface Node { id: number; left: Node | null; right: Node | null; dist: number; leaves: number[] }

export function hrpCluster(corr: number[][], vols: number[], nClusters = 5): HrpResult {
  const n = corr.length;
  if (n === 0) return { order: [], clusters: [], weights: [] };
  if (n === 1) return { order: [0], clusters: [[0]], weights: [1] };

  // Distance matrix
  const D: number[][] = corr.map((row) => row.map((r) => Math.sqrt(Math.max(0, 0.5 * (1 - (Number.isFinite(r) ? r : 0))))));

  // Average-linkage agglomerative clustering.
  let nodes: Node[] = Array.from({ length: n }, (_, i) => ({ id: i, left: null, right: null, dist: 0, leaves: [i] }));
  const nodeDist = (x: Node, y: Node): number => {
    let s = 0;
    for (const i of x.leaves) for (const j of y.leaves) s += D[i][j];
    return s / (x.leaves.length * y.leaves.length);
  };
  const merges: Node[] = [];
  while (nodes.length > 1) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = nodeDist(nodes[i], nodes[j]);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    const merged: Node = {
      id: n + merges.length,
      left: nodes[bi],
      right: nodes[bj],
      dist: bd,
      leaves: [...nodes[bi].leaves, ...nodes[bj].leaves],
    };
    merges.push(merged);
    nodes = nodes.filter((_, k) => k !== bi && k !== bj);
    nodes.push(merged);
  }
  const root = nodes[0];

  // Quasi-diagonal order = in-order leaf walk.
  const order: number[] = [];
  const walk = (nd: Node) => {
    if (!nd.left || !nd.right) { order.push(nd.leaves[0]); return; }
    walk(nd.left);
    walk(nd.right);
  };
  walk(root);

  // Flat clusters: cut the tree at the (nClusters−1) largest merge distances.
  const k = Math.max(1, Math.min(nClusters, n));
  const cutSet = new Set(
    [...merges].sort((a, b) => b.dist - a.dist).slice(0, k - 1).map((m) => m.id),
  );
  const clusters: number[][] = [];
  const collect = (nd: Node) => {
    if (!nd.left || !nd.right) { clusters.push(nd.leaves); return; }
    if (cutSet.has(nd.id)) { collect(nd.left); collect(nd.right); return; }
    clusters.push(nd.leaves);
  };
  collect(root);

  // HRP weights: recursive bisection along the quasi-diagonal order, splitting
  // capital inversely to each half's inverse-variance cluster variance.
  const variances = vols.map((v) => (Number.isFinite(v) && v > 0 ? v * v : 1e-4));
  const cov = (i: number, j: number) => (Number.isFinite(corr[i][j]) ? corr[i][j] : 0) * Math.sqrt(variances[i] * variances[j]);
  const clusterVar = (idx: number[]): number => {
    // inverse-variance weights within the cluster
    const iv = idx.map((i) => 1 / variances[i]);
    const s = iv.reduce((a, b) => a + b, 0);
    const w = iv.map((v) => v / s);
    let v = 0;
    for (let a = 0; a < idx.length; a++) for (let b = 0; b < idx.length; b++) v += w[a] * w[b] * cov(idx[a], idx[b]);
    return Math.max(v, 1e-12);
  };
  const weights = new Array<number>(n).fill(0);
  const bisect = (idx: number[], wTot: number) => {
    if (idx.length === 1) { weights[idx[0]] = wTot; return; }
    const half = Math.floor(idx.length / 2);
    const left = idx.slice(0, half);
    const right = idx.slice(half);
    const vL = clusterVar(left);
    const vR = clusterVar(right);
    const aL = 1 - vL / (vL + vR);
    bisect(left, wTot * aL);
    bisect(right, wTot * (1 - aL));
  };
  bisect(order, 1);

  return { order, clusters, weights };
}
