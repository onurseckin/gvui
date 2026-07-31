import type { CustomLayoutConfig } from "./config";
import type { PortCandidate } from "./portCandidates";
import type { NormalizedEdge, Side } from "./types";

export interface PortSideAssignmentResult {
  assignments: Map<string, PortCandidate>;
  sideUseMap: Map<string, number>;
}

function sideKey(nodeId: string, side: Side): string {
  return `${nodeId}:${side}`;
}

export function assignPortSidesGlobally(
  edges: NormalizedEdge[],
  candidatesMap: Map<string, PortCandidate[]>,
  config: CustomLayoutConfig
): PortSideAssignmentResult {
  const sideUseMap = new Map<string, number>();

  function getSideUse(nodeId: string, side: Side): number {
    return sideUseMap.get(sideKey(nodeId, side)) ?? 0;
  }

  function incSideUse(nodeId: string, side: Side): void {
    const key = sideKey(nodeId, side);
    sideUseMap.set(key, (sideUseMap.get(key) ?? 0) + 1);
  }

  function decSideUse(nodeId: string, side: Side): void {
    const key = sideKey(nodeId, side);
    const curr = sideUseMap.get(key) ?? 0;
    if (curr > 0) sideUseMap.set(key, curr - 1);
  }

  function evaluateCost(cand: PortCandidate, edge: NormalizedEdge): number {
    const srcUse = getSideUse(edge.source, cand.srcSide);
    const tgtUse = getSideUse(edge.target, cand.tgtSide);
    const reuseCost = config.sideReusePenalty * (srcUse * srcUse + tgtUse * tgtUse);
    return cand.baseCost + reuseCost;
  }

  // Calculate regret per edge
  const edgeRegretList: { edge: NormalizedEdge; regret: number; sortedCands: PortCandidate[] }[] = [];

  for (const edge of edges) {
    const cands = candidatesMap.get(edge.id) ?? [];
    const sorted = [...cands].sort((a, b) => a.baseCost - b.baseCost);
    const bestCost = sorted[0]?.baseCost ?? 0;
    const secondCost = sorted[1]?.baseCost ?? bestCost;
    const regret = secondCost - bestCost;

    edgeRegretList.push({ edge, regret, sortedCands: sorted });
  }

  // Sort edges by descending regret, tiebreak by edge ID
  edgeRegretList.sort((a, b) => {
    if (Math.abs(b.regret - a.regret) > config.epsilon) return b.regret - a.regret;
    return a.edge.id.localeCompare(b.edge.id);
  });

  const assignments = new Map<string, PortCandidate>();

  // 1. Initial Regret-Ordered Greedy Assignment
  for (const item of edgeRegretList) {
    const edge = item.edge;
    const cands = item.sortedCands;

    let bestCand = cands[0];
    let bestTotalCost = Infinity;

    for (const cand of cands) {
      const cost = evaluateCost(cand, edge);
      if (cost < bestTotalCost) {
        bestTotalCost = cost;
        bestCand = cand;
      }
    }

    if (bestCand) {
      assignments.set(edge.id, bestCand);
      incSideUse(edge.source, bestCand.srcSide);
      incSideUse(edge.target, bestCand.tgtSide);
    }
  }

  // 2. Deterministic Local Improvement Passes
  for (let pass = 0; pass < config.maxPortImprovementPasses; pass++) {
    let improved = false;

    // Visit edges in sorted ID order
    const sortedEdges = [...edges].sort((a, b) => a.id.localeCompare(b.id));

    for (const edge of sortedEdges) {
      const currentCand = assignments.get(edge.id);
      if (!currentCand) continue;

      // Temporarily remove current side use
      decSideUse(edge.source, currentCand.srcSide);
      decSideUse(edge.target, currentCand.tgtSide);

      const cands = candidatesMap.get(edge.id) ?? [];
      let bestCand = currentCand;
      let bestCost = evaluateCost(currentCand, edge);

      for (const cand of cands) {
        const cost = evaluateCost(cand, edge);
        if (cost < bestCost - config.epsilon) {
          bestCost = cost;
          bestCand = cand;
        }
      }

      if (bestCand !== currentCand) {
        improved = true;
      }

      assignments.set(edge.id, bestCand);
      incSideUse(edge.source, bestCand.srcSide);
      incSideUse(edge.target, bestCand.tgtSide);
    }

    if (!improved) break;
  }

  return {
    assignments,
    sideUseMap,
  };
}
