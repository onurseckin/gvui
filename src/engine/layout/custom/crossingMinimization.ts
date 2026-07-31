import type { ExpandedLayerGraph } from "./layerGraph";
import type { LayerNode } from "./types";

export interface CrossingMinimizationResult {
  orderedLayers: LayerNode[][];
  crossingCount: number;
}

export function countLayerCrossings(
  layerUpper: string[],
  layerLower: string[],
  edges: { u: string; v: string }[],
): number {
  const uPos = new Map<string, number>();
  layerUpper.forEach((id, idx) => uPos.set(id, idx));

  const vPos = new Map<string, number>();
  layerLower.forEach((id, idx) => vPos.set(id, idx));

  const validEdges = edges.filter((e) => uPos.has(e.u) && vPos.has(e.v));
  let crossings = 0;

  for (let i = 0; i < validEdges.length; i++) {
    for (let j = i + 1; j < validEdges.length; j++) {
      const e1 = validEdges[i];
      const e2 = validEdges[j];

      if (e1.u === e2.u || e1.v === e2.v) continue;

      const u1 = uPos.get(e1.u)!;
      const u2 = uPos.get(e2.u)!;
      const v1 = vPos.get(e1.v)!;
      const v2 = vPos.get(e2.v)!;

      if ((u1 < u2 && v1 > v2) || (u1 > u2 && v1 < v2)) {
        crossings++;
      }
    }
  }

  return crossings;
}

export function countTotalGraphCrossings(
  layers: LayerNode[][],
  successorsMap: Map<string, string[]>,
): number {
  let total = 0;

  for (let r = 0; r < layers.length - 1; r++) {
    const upperIds = layers[r].map((n) => n.id);
    const lowerIds = layers[r + 1].map((n) => n.id);

    const edgesBetween: { u: string; v: string }[] = [];
    for (const u of upperIds) {
      const succs = successorsMap.get(u) ?? [];
      for (const v of succs) {
        edgesBetween.push({ u, v });
      }
    }

    total += countLayerCrossings(upperIds, lowerIds, edgesBetween);
  }

  return total;
}

export function minimizeCrossings(
  layerGraph: ExpandedLayerGraph,
  maxSweeps = 24,
): CrossingMinimizationResult {
  // Clone layers
  let currentLayers: LayerNode[][] = layerGraph.layers.map((layer) => [...layer]);

  let bestLayers = currentLayers.map((l) => [...l]);
  let bestCrossings = countTotalGraphCrossings(bestLayers, layerGraph.successorsMap);

  if (bestCrossings === 0) {
    return { orderedLayers: bestLayers, crossingCount: 0 };
  }

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // 1. Downward sweep (rank 1 to maxRank)
    for (let r = 1; r < currentLayers.length; r++) {
      const prevPos = new Map<string, number>();
      currentLayers[r - 1].forEach((node, idx) => prevPos.set(node.id, idx));

      const barycenters = new Map<string, number>();

      for (let i = 0; i < currentLayers[r].length; i++) {
        const item = currentLayers[r][i];
        const preds = layerGraph.predecessorsMap.get(item.id) ?? [];
        const validPreds = preds.filter((p) => prevPos.has(p));

        if (validPreds.length > 0) {
          const sum = validPreds.reduce((acc, p) => acc + prevPos.get(p)!, 0);
          barycenters.set(item.id, sum / validPreds.length);
        } else {
          barycenters.set(item.id, i);
        }
      }

      currentLayers[r].sort((a, b) => {
        const bA = barycenters.get(a.id)!;
        const bB = barycenters.get(b.id)!;
        if (Math.abs(bA - bB) > 0.0001) return bA - bB;
        return a.id.localeCompare(b.id);
      });
    }

    // 2. Upward sweep (rank maxRank-1 down to 0)
    for (let r = currentLayers.length - 2; r >= 0; r--) {
      const nextPos = new Map<string, number>();
      currentLayers[r + 1].forEach((node, idx) => nextPos.set(node.id, idx));

      const barycenters = new Map<string, number>();

      for (let i = 0; i < currentLayers[r].length; i++) {
        const item = currentLayers[r][i];
        const succs = layerGraph.successorsMap.get(item.id) ?? [];
        const validSuccs = succs.filter((s) => nextPos.has(s));

        if (validSuccs.length > 0) {
          const sum = validSuccs.reduce((acc, s) => acc + nextPos.get(s)!, 0);
          barycenters.set(item.id, sum / validSuccs.length);
        } else {
          barycenters.set(item.id, i);
        }
      }

      currentLayers[r].sort((a, b) => {
        const bA = barycenters.get(a.id)!;
        const bB = barycenters.get(b.id)!;
        if (Math.abs(bA - bB) > 0.0001) return bA - bB;
        return a.id.localeCompare(b.id);
      });
    }

    // 3. Adjacent Transposition Pass
    let swappedAny = false;
    for (let r = 0; r < currentLayers.length; r++) {
      const layer = currentLayers[r];
      for (let i = 0; i < layer.length - 1; i++) {
        const temp = layer[i];
        layer[i] = layer[i + 1];
        layer[i + 1] = temp;

        const newCrossings = countTotalGraphCrossings(currentLayers, layerGraph.successorsMap);
        if (newCrossings < bestCrossings) {
          bestCrossings = newCrossings;
          bestLayers = currentLayers.map((l) => [...l]);
          swappedAny = true;
        } else {
          // Revert swap
          layer[i + 1] = layer[i];
          layer[i] = temp;
        }
      }
    }

    const currentCrossings = countTotalGraphCrossings(currentLayers, layerGraph.successorsMap);
    if (currentCrossings < bestCrossings) {
      bestCrossings = currentCrossings;
      bestLayers = currentLayers.map((l) => [...l]);
    }

    if (bestCrossings === 0 || (!swappedAny && sweep > 4)) {
      break;
    }
  }

  return {
    orderedLayers: bestLayers,
    crossingCount: bestCrossings,
  };
}
