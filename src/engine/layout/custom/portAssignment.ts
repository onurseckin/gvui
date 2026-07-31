import type { CustomLayoutConfig } from "./config";
import type { PortCandidate } from "./portCandidates";
import type { NormalizedEdge, PortSideAssignment, Side } from "./types";

export interface PortSideAssignmentResult {
  assignments: Map<string, PortCandidate>;
  assignmentsByEdge: Map<string, PortSideAssignment>;
  sideUseMap: Map<string, number>;
}

function sideKey(nodeId: string, side: Side): string {
  return `${nodeId}:${side}`;
}

export function enumeratePortAlternatives(
  _edgeId: string,
  current: PortSideAssignment,
  candidates: PortCandidate[],
  limit: number,
): PortSideAssignment[] {
  const sorted = [...candidates].sort((a, b) => {
    if (Math.abs(a.baseCost - b.baseCost) > 1e-9) {
      return a.baseCost - b.baseCost;
    }
    const keyA = `${a.srcSide}:${a.tgtSide}`;
    const keyB = `${b.srcSide}:${b.tgtSide}`;
    return keyA.localeCompare(keyB);
  });

  const alternatives: PortSideAssignment[] = [];
  const seen = new Set<string>();

  const currentKey = `${current.srcSide}:${current.tgtSide}`;
  seen.add(currentKey);

  for (const cand of sorted) {
    const key = `${cand.srcSide}:${cand.tgtSide}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    alternatives.push({
      srcSide: cand.srcSide,
      tgtSide: cand.tgtSide,
    });
    if (alternatives.length >= limit) {
      break;
    }
  }

  return alternatives;
}

export function assignPortSidesGlobally(
  edges: NormalizedEdge[],
  candidatesMap: Map<string, PortCandidate[]>,
  config: CustomLayoutConfig,
  edgeMetaMap?: Map<string, { isFeedback?: boolean; rankSpan?: number; badgeArea?: number }>,
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

  // Calculate regret and metadata per edge
  const edgeRegretList: {
    edge: NormalizedEdge;
    regret: number;
    sortedCands: PortCandidate[];
    isFeedback: boolean;
    rankSpan: number;
    badgeArea: number;
  }[] = [];

  for (const edge of edges) {
    const cands = candidatesMap.get(edge.id) ?? [];
    const sorted = [...cands].sort((a, b) => a.baseCost - b.baseCost);
    const bestCost = sorted[0]?.baseCost ?? 0;
    const secondCost = sorted[1]?.baseCost ?? bestCost;
    const regret = secondCost - bestCost;

    const meta = edgeMetaMap?.get(edge.id);
    const isFeedback = meta?.isFeedback ?? Boolean(edge.isCycle || edge.layoutRole === "feedback");
    const rankSpan = meta?.rankSpan ?? 0;
    const badgeArea = meta?.badgeArea ?? 0;

    edgeRegretList.push({ edge, regret, sortedCands: sorted, isFeedback, rankSpan, badgeArea });
  }

  // Sort edges by: feedback constraint, rank span, candidate regret, badge area, then edge ID
  edgeRegretList.sort((a, b) => {
    if (a.isFeedback !== b.isFeedback) {
      return a.isFeedback ? -1 : 1;
    }
    if (Math.abs(b.rankSpan - a.rankSpan) > config.epsilon) {
      return b.rankSpan - a.rankSpan;
    }
    if (Math.abs(b.regret - a.regret) > config.epsilon) {
      return b.regret - a.regret;
    }
    if (Math.abs(b.badgeArea - a.badgeArea) > config.epsilon) {
      return b.badgeArea - a.badgeArea;
    }
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

  const assignmentsByEdge = new Map<string, PortSideAssignment>();
  for (const [edgeId, cand] of assignments.entries()) {
    assignmentsByEdge.set(edgeId, {
      srcSide: cand.srcSide,
      tgtSide: cand.tgtSide,
    });
  }

  return {
    assignments,
    assignmentsByEdge,
    sideUseMap,
  };
}
