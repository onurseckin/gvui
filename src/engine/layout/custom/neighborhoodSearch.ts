import type { CustomLayoutConfig } from "./config";
import { cloneSearchState } from "./searchState";
import { exactSpacingDemandSignature } from "./spacingDemand";
import type { StateEvaluationResult } from "./stateEvaluator";
import type { EdgeRole, LayoutSearchState, Side } from "./types";

const feedbackSidePairs: ReadonlyArray<{ srcSide: Side; tgtSide: Side }> = [
  { srcSide: "left", tgtSide: "left" },
  { srcSide: "right", tgtSide: "right" },
  { srcSide: "left", tgtSide: "top" },
  { srcSide: "right", tgtSide: "top" },
];

function sideAlternatives(
  current: { srcSide: Side; tgtSide: Side },
  role: EdgeRole | undefined,
  isCycle: boolean,
): { srcSide: Side; tgtSide: Side }[] {
  if (role === "feedback" || isCycle) {
    return feedbackSidePairs.filter(
      (pair) => pair.srcSide !== current.srcSide || pair.tgtSide !== current.tgtSide,
    );
  }

  const alternatives: { srcSide: Side; tgtSide: Side }[] = [];
  for (const srcSide of ["top", "right", "bottom", "left"] as const) {
    for (const tgtSide of ["top", "right", "bottom", "left"] as const) {
      if (srcSide !== current.srcSide || tgtSide !== current.tgtSide) {
        alternatives.push({ srcSide, tgtSide });
      }
    }
  }
  return alternatives;
}

export function generateNeighborhoodStates(
  state: LayoutSearchState,
  evalResult: StateEvaluationResult,
  config: CustomLayoutConfig,
): LayoutSearchState[] {
  const neighbors: LayoutSearchState[] = [];
  const maxNeighbors = config.maxNeighborsPerState;

  // 1. Generate Port Side Swap Moves for edges with crossings, hairpins, or excess bends
  const problemEdgeIds = new Set<string>();
  const crossings = evalResult.validation.crossings ?? [];
  const classifiedById = new Map(evalResult.classifiedEdges.map((edge) => [edge.id, edge]));
  const routesByEdgeId = new Map(evalResult.routes.map((route) => [route.edgeId, route]));
  const nodeSideMap = new Map<string, string[]>();
  for (const route of evalResult.routes) {
    const srcKey = `${route.sourcePort.nodeId}:${route.sourcePort.side}`;
    const tgtKey = `${route.targetPort.nodeId}:${route.targetPort.side}`;
    nodeSideMap.set(srcKey, [...(nodeSideMap.get(srcKey) ?? []), `${route.edgeId}:src`]);
    nodeSideMap.set(tgtKey, [...(nodeSideMap.get(tgtKey) ?? []), `${route.edgeId}:tgt`]);
  }

  const canonicalPortOrders: Record<string, string[]> = {};
  for (const [sideKey, endpoints] of nodeSideMap) {
    const liveEndpoints = [...new Set(endpoints)].sort();
    const liveSet = new Set(liveEndpoints);
    const seen = new Set<string>();
    const retained = (state.portOrders[sideKey] ?? []).filter((endpoint) => {
      if (!liveSet.has(endpoint) || seen.has(endpoint)) return false;
      seen.add(endpoint);
      return true;
    });
    canonicalPortOrders[sideKey] = [
      ...retained,
      ...liveEndpoints.filter((endpoint) => !seen.has(endpoint)),
    ];
  }

  const cloneCanonicalState = (): LayoutSearchState => {
    const nextState = cloneSearchState(state);
    nextState.portOrders = Object.fromEntries(
      Object.entries(canonicalPortOrders).map(([key, order]) => [key, [...order]]),
    );
    return nextState;
  };

  if (evalResult.resetSideAssignments && state.sideAssignments.size > 0) {
    const resetState = cloneCanonicalState();
    resetState.sideAssignments.clear();
    neighbors.push(resetState);
  }
  for (const cross of crossings) {
    problemEdgeIds.add(cross.edgeIdA);
    problemEdgeIds.add(cross.edgeIdB);
  }

  // Include every affected edge from diagnostics. A badge/edge collision names
  // both participants and either route may be the movable one.
  for (const diag of evalResult.validation.diagnostics) {
    for (const edgeId of diag.ids ?? []) {
      if (classifiedById.has(edgeId)) {
        problemEdgeIds.add(edgeId);
      }
    }
  }

  // Feedback is graph semantics, not a naming convention for generated IDs. A
  // route already using a same-side outer corridor with no diagnosed defect is
  // not an expansion target: its alternatives only repeat equivalent work.
  for (const edge of evalResult.classifiedEdges) {
    const routed = routesByEdgeId.get(edge.id);
    const isOuterCorridor =
      routed !== undefined &&
      routed.sourcePort.side === routed.targetPort.side &&
      (routed.sourcePort.side === "left" || routed.sourcePort.side === "right");
    if ((edge.role === "feedback" || edge.isCycle) && !isOuterCorridor) {
      problemEdgeIds.add(edge.id);
    }
  }

  const candidateQueues = Array.from(problemEdgeIds)
    .sort()
    .map((edgeId) => {
      const routed = routesByEdgeId.get(edgeId);
      const currentSide =
        state.sideAssignments.get(edgeId) ??
        (routed
          ? { srcSide: routed.sourcePort.side, tgtSide: routed.targetPort.side }
          : { srcSide: "bottom" as Side, tgtSide: "top" as Side });
      const classified = classifiedById.get(edgeId);
      return {
        edgeId,
        alternatives: sideAlternatives(currentSide, classified?.role, Boolean(classified?.isCycle)),
      };
    });

  // Round-robin candidates so a diagnostic affecting multiple edges gives each
  // edge one deterministic opportunity before either receives a second move.
  for (let alternativeIndex = 0; neighbors.length < maxNeighbors; alternativeIndex++) {
    let addedInRound = false;
    for (const queue of candidateQueues) {
      if (neighbors.length >= maxNeighbors) break;
      const alternative = queue.alternatives[alternativeIndex];
      if (!alternative) continue;

      const nextState = cloneCanonicalState();
      nextState.sideAssignments.set(queue.edgeId, alternative);
      neighbors.push(nextState);
      addedInRound = true;
    }
    if (!addedInRound) break;
  }

  // 2. Generate Port Order Moves for node sides with 2+ attachments
  for (const [sKey, endpoints] of nodeSideMap.entries()) {
    if (neighbors.length >= maxNeighbors) break;
    if (endpoints.length >= 2) {
      const currentOrder = canonicalPortOrders[sKey] ?? [...endpoints].sort();
      const swapped = [...currentOrder];
      // Swap adjacent elements
      for (let i = 0; i < swapped.length - 1; i++) {
        const nextState = cloneCanonicalState();
        const orderCopy = [...swapped];
        const tmp = orderCopy[i];
        orderCopy[i] = orderCopy[i + 1];
        orderCopy[i + 1] = tmp;
        nextState.portOrders[sKey] = orderCopy;
        neighbors.push(nextState);
        if (neighbors.length >= maxNeighbors) break;
      }
    }
  }

  // 3. Generate Layer Order Moves for adjacent nodes in same rank when edges cross
  if (neighbors.length < maxNeighbors && crossings.length > 0) {
    for (let r = 0; r < evalResult.nodeLayout.orderedLayers.length; r++) {
      const layer = evalResult.nodeLayout.orderedLayers[r];
      if (layer.length >= 2) {
        for (let i = 0; i < layer.length - 1; i++) {
          const nextState = cloneCanonicalState();
          const currentRankOrder = nextState.layerOrders.get(r) ?? layer.map((n) => n.id);
          const orderCopy = [...currentRankOrder];
          const tmp = orderCopy[i];
          orderCopy[i] = orderCopy[i + 1];
          orderCopy[i + 1] = tmp;
          nextState.layerOrders.set(r, orderCopy);
          neighbors.push(nextState);
          if (neighbors.length >= maxNeighbors) break;
        }
      }
    }
  }

  // 4. Generate Spacing Demand Expansion Moves when unresolved badges or label overlaps exist
  if (
    exactSpacingDemandSignature(evalResult.exactDemands) !==
    exactSpacingDemandSignature(state.exactDemands)
  ) {
    const nextState = cloneCanonicalState();
    nextState.exactDemands = [...evalResult.exactDemands];
    neighbors.unshift(nextState);
  }

  return neighbors;
}
