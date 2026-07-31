import type { CustomLayoutConfig } from "./config";
import { cloneSearchState } from "./searchState";
import type { StateEvaluationResult } from "./stateEvaluator";
import type { LayoutSearchState, Side } from "./types";

export function generateNeighborhoodStates(
  state: LayoutSearchState,
  evalResult: StateEvaluationResult,
  config: CustomLayoutConfig,
): LayoutSearchState[] {
  const neighbors: LayoutSearchState[] = [];
  const maxNeighbors = config.maxNeighborsPerState;

  const validSides: Side[] = ["top", "right", "bottom", "left"];

  // 1. Generate Port Side Swap Moves for edges with crossings, hairpins, or excess bends
  const problemEdgeIds = new Set<string>();
  const crossings = evalResult.validation.crossings ?? [];
  for (const cross of crossings) {
    problemEdgeIds.add(cross.edgeIdA);
    problemEdgeIds.add(cross.edgeIdB);
  }

  // Include edges with hairpins or invalid departure/entry directions
  for (const diag of evalResult.validation.diagnostics) {
    if (diag.ids && diag.ids.length > 0) {
      problemEdgeIds.add(diag.ids[0]);
    }
  }

  // Include cycle / feedback edges
  for (const route of evalResult.routes) {
    if (route.edgeId.toLowerCase().includes("cycle") || route.edgeId.toLowerCase().includes("loop")) {
      problemEdgeIds.add(route.edgeId);
    }
  }

  for (const edgeId of problemEdgeIds) {
    if (neighbors.length >= maxNeighbors) break;

    const currentSide = state.sideAssignments.get(edgeId);
    const srcSide = currentSide?.srcSide ?? "bottom";
    const tgtSide = currentSide?.tgtSide ?? "top";

    // Combined (altSrc, altTgt) pairs first
    for (const altSrc of validSides) {
      if (neighbors.length >= maxNeighbors) break;
      for (const altTgt of validSides) {
        if (neighbors.length >= maxNeighbors) break;
        if (altSrc === srcSide && altTgt === tgtSide) continue;
        const nextState = cloneSearchState(state);
        nextState.sideAssignments.set(edgeId, { srcSide: altSrc, tgtSide: altTgt });
        neighbors.push(nextState);
      }
    }
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
