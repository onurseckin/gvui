import type { CustomLayoutConfig } from "./config";
import { cloneSearchState } from "./searchState";
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

  // Feedback is graph semantics, not a naming convention for generated IDs.
  for (const edge of evalResult.classifiedEdges) {
    if (edge.role === "feedback" || edge.isCycle) {
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

      const nextState = cloneSearchState(state);
      nextState.sideAssignments.set(queue.edgeId, alternative);
      neighbors.push(nextState);
      addedInRound = true;
    }
    if (!addedInRound) break;
  }

  // 2. Generate Port Order Moves for node sides with 2+ attachments
  const nodeSideMap = new Map<string, string[]>();
  for (const r of evalResult.routes) {
    const srcKey = `${r.sourcePort.nodeId}:${r.sourcePort.side}`;
    const tgtKey = `${r.targetPort.nodeId}:${r.targetPort.side}`;

    const srcList = nodeSideMap.get(srcKey) ?? [];
    srcList.push(`${r.edgeId}:src`);
    nodeSideMap.set(srcKey, srcList);

    const tgtList = nodeSideMap.get(tgtKey) ?? [];
    tgtList.push(`${r.edgeId}:tgt`);
    nodeSideMap.set(tgtKey, tgtList);
  }

  for (const [sKey, endpoints] of nodeSideMap.entries()) {
    if (neighbors.length >= maxNeighbors) break;
    if (endpoints.length >= 2) {
      const currentOrder = state.portOrders[sKey] ?? [...endpoints].sort();
      const swapped = [...currentOrder];
      // Swap adjacent elements
      for (let i = 0; i < swapped.length - 1; i++) {
        const nextState = cloneSearchState(state);
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
          const nextState = cloneSearchState(state);
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
  if (evalResult.exactDemands.length > state.exactDemands.length) {
    const nextState = cloneSearchState(state);
    nextState.exactDemands = [...evalResult.exactDemands];
    neighbors.unshift(nextState);
  }

  return neighbors;
}
