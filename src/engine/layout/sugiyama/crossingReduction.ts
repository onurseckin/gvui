import type { SugiyamaEdge, SugiyamaNode } from "./types";

/**
 * Counts the total number of edge crossings between all adjacent ranks.
 */
export function countTotalCrossings(ranks: SugiyamaNode[][], edges: SugiyamaEdge[]): number {
  let total = 0;
  for (let r = 0; r < ranks.length - 1; r++) {
    total += countCrossingsBetweenRanks(ranks[r] ?? [], ranks[r + 1] ?? [], edges);
  }
  return total;
}

export function countCrossingsBetweenRanks(
  rankA: SugiyamaNode[],
  rankB: SugiyamaNode[],
  edges: SugiyamaEdge[],
): number {
  const posA = new Map<string, number>(rankA.map((n, i) => [n.id, i]));
  const posB = new Map<string, number>(rankB.map((n, i) => [n.id, i]));

  const relevantEdges: Array<{ u: number; v: number }> = [];
  for (const e of edges) {
    const u = posA.get(e.source);
    const v = posB.get(e.target);
    if (u !== undefined && v !== undefined) {
      relevantEdges.push({ u, v });
    }
  }

  let crossings = 0;
  for (let i = 0; i < relevantEdges.length; i++) {
    for (let j = i + 1; j < relevantEdges.length; j++) {
      const e1 = relevantEdges[i]!;
      const e2 = relevantEdges[j]!;
      if ((e1.u < e2.u && e1.v > e2.v) || (e1.u > e2.u && e1.v < e2.v)) {
        crossings++;
      }
    }
  }

  return crossings;
}

/**
 * Phase 3: Layer-by-layer sweep with barycenter sorting and 2-opt adjacent transpositions.
 */
export function reduceCrossings(
  initialRanks: SugiyamaNode[][],
  edges: SugiyamaEdge[],
  maxSweeps: number = 16,
): { ranks: SugiyamaNode[][]; crossings: number } {
  // Clone ranks
  let currentRanks = initialRanks.map((layer) => [...layer]);
  let bestRanks = currentRanks.map((layer) => [...layer]);
  let minCrossings = countTotalCrossings(bestRanks, edges);

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)?.push(e.target);

    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)?.push(e.source);
  }

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    const isDownward = sweep % 2 === 0;

    if (isDownward) {
      // Downward sweep: layer 1 -> k
      for (let r = 1; r < currentRanks.length; r++) {
        const prevLayer = currentRanks[r - 1] ?? [];
        const prevPos = new Map<string, number>(prevLayer.map((n, i) => [n.id, i]));
        const currLayer = currentRanks[r] ?? [];

        const barycenters = new Map<string, number>();
        for (let idx = 0; idx < currLayer.length; idx++) {
          const node = currLayer[idx]!;
          const parents = incoming.get(node.id) || [];
          let sum = 0;
          let count = 0;
          for (const p of parents) {
            const pos = prevPos.get(p);
            if (pos !== undefined) {
              sum += pos;
              count++;
            }
          }
          barycenters.set(node.id, count > 0 ? sum / count : idx);
        }

        currLayer.sort((a, b) => (barycenters.get(a.id) ?? 0) - (barycenters.get(b.id) ?? 0));
        transposeLayer(r, currentRanks, edges);
      }
    } else {
      // Upward sweep: layer k-1 -> 0
      for (let r = currentRanks.length - 2; r >= 0; r--) {
        const nextLayer = currentRanks[r + 1] ?? [];
        const nextPos = new Map<string, number>(nextLayer.map((n, i) => [n.id, i]));
        const currLayer = currentRanks[r] ?? [];

        const barycenters = new Map<string, number>();
        for (let idx = 0; idx < currLayer.length; idx++) {
          const node = currLayer[idx]!;
          const children = outgoing.get(node.id) || [];
          let sum = 0;
          let count = 0;
          for (const c of children) {
            const pos = nextPos.get(c);
            if (pos !== undefined) {
              sum += pos;
              count++;
            }
          }
          barycenters.set(node.id, count > 0 ? sum / count : idx);
        }

        currLayer.sort((a, b) => (barycenters.get(a.id) ?? 0) - (barycenters.get(b.id) ?? 0));
        transposeLayer(r, currentRanks, edges);
      }
    }

    const currentCrossings = countTotalCrossings(currentRanks, edges);
    if (currentCrossings < minCrossings) {
      minCrossings = currentCrossings;
      bestRanks = currentRanks.map((layer) => [...layer]);
      if (minCrossings === 0) break; // Optimal 0 crossings reached
    }
  }

  // Assign order index to each node
  for (let r = 0; r < bestRanks.length; r++) {
    const layer = bestRanks[r] ?? [];
    for (let i = 0; i < layer.length; i++) {
      const node = layer[i];
      if (node) {
        node.order = i;
        node.rank = r;
      }
    }
  }

  return {
    ranks: bestRanks,
    crossings: minCrossings,
  };
}

/**
 * 2-opt adjacent transposition pass within a layer.
 */
function transposeLayer(rankIndex: number, ranks: SugiyamaNode[][], edges: SugiyamaEdge[]): void {
  const layer = ranks[rankIndex];
  if (!layer || layer.length < 2) return;

  let improved = true;
  let passes = 0;

  while (improved && passes < 4) {
    improved = false;
    passes++;

    for (let i = 0; i < layer.length - 1; i++) {
      const u = layer[i]!;
      const v = layer[i + 1]!;

      // Measure local crossings before swap
      const crossingsBefore = localCrossings(rankIndex, ranks, edges);

      // Swap
      layer[i] = v;
      layer[i + 1] = u;

      const crossingsAfter = localCrossings(rankIndex, ranks, edges);
      if (crossingsAfter < crossingsBefore) {
        improved = true;
      } else {
        // Revert swap
        layer[i] = u;
        layer[i + 1] = v;
      }
    }
  }
}

function localCrossings(rankIndex: number, ranks: SugiyamaNode[][], edges: SugiyamaEdge[]): number {
  let c = 0;
  const curr = ranks[rankIndex] ?? [];
  if (rankIndex > 0) {
    c += countCrossingsBetweenRanks(ranks[rankIndex - 1] ?? [], curr, edges);
  }
  if (rankIndex < ranks.length - 1) {
    c += countCrossingsBetweenRanks(curr, ranks[rankIndex + 1] ?? [], edges);
  }
  return c;
}
