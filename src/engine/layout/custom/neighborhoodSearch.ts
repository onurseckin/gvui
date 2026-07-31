import type { CustomLayoutConfig } from "./config";
import { calculateExcessBends, countPathHairpins } from "./layoutObjective";
import { generatePortCandidates, type PortCandidate } from "./portCandidates";
import { cloneSearchState, computeStateHash } from "./searchState";
import { exactSpacingDemandSignature } from "./spacingDemand";
import type { StateEvaluationResult } from "./stateEvaluator";
import type { ClassifiedEdge, LayoutSearchState, PortSideAssignment, Side } from "./types";

const feedbackSidePairs: ReadonlyArray<{ srcSide: Side; tgtSide: Side }> = [
  { srcSide: "left", tgtSide: "left" },
  { srcSide: "right", tgtSide: "right" },
  { srcSide: "left", tgtSide: "top" },
  { srcSide: "right", tgtSide: "top" },
];

const sideRing: readonly Side[] = ["top", "right", "bottom", "left"];

interface CrossingComponentRepair {
  edgeIds: string[];
  assignments: Array<[string, PortSideAssignment]>;
}

function assignmentKey(assignment: PortSideAssignment): string {
  return `${assignment.srcSide}/${assignment.tgtSide}`;
}

function reverseAssignment(assignment: PortSideAssignment): PortSideAssignment {
  return { srcSide: assignment.tgtSide, tgtSide: assignment.srcSide };
}

function adjacentSides(side: Side): Side[] {
  const index = sideRing.indexOf(side);
  return [
    sideRing[(index + sideRing.length - 1) % sideRing.length],
    sideRing[(index + 1) % sideRing.length],
  ];
}

function currentAssignment(
  state: LayoutSearchState,
  edgeId: string,
  routesByEdgeId: Map<string, StateEvaluationResult["routes"][number]>,
): PortSideAssignment {
  const routed = routesByEdgeId.get(edgeId);
  return (
    state.sideAssignments.get(edgeId) ??
    (routed
      ? { srcSide: routed.sourcePort.side, tgtSide: routed.targetPort.side }
      : { srcSide: "bottom", tgtSide: "top" })
  );
}

function candidateAssignments(
  edge: ClassifiedEdge,
  current: PortSideAssignment,
  evalResult: StateEvaluationResult,
  config: CustomLayoutConfig,
): Array<{ assignment: PortSideAssignment; baseCost: number }> {
  const nodes = evalResult.nodes ?? [];
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) {
    return [
      ...adjacentSides(current.tgtSide).map((tgtSide) => ({
        assignment: { srcSide: current.srcSide, tgtSide },
        baseCost: 0,
      })),
      ...adjacentSides(current.srcSide).map((srcSide) => ({
        assignment: { srcSide, tgtSide: current.tgtSide },
        baseCost: 0,
      })),
    ];
  }

  const positions = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  const candidates = generatePortCandidates(
    edge,
    source,
    target,
    edge.role,
    positions,
    config,
    nodes,
  );
  return candidates.map((candidate: PortCandidate) => ({
    assignment: { srcSide: candidate.srcSide, tgtSide: candidate.tgtSide },
    baseCost: candidate.baseCost,
  }));
}

/**
 * A defect unit has only two meaningful local repairs: move its target port
 * one cardinal step, or move its source port one cardinal step. This keeps
 * the search bounded and lets the router decide the actual corridor.
 */
function oneEndpointAlternatives(
  edge: ClassifiedEdge,
  current: PortSideAssignment,
  evalResult: StateEvaluationResult,
  config: CustomLayoutConfig,
): PortSideAssignment[] {
  const candidates = candidateAssignments(edge, current, evalResult, config);
  const selectBest = (kind: "target" | "source"): PortSideAssignment | undefined =>
    candidates
      .filter(({ assignment }) => {
        if (kind === "target") {
          return (
            assignment.srcSide === current.srcSide &&
            adjacentSides(current.tgtSide).includes(assignment.tgtSide)
          );
        }
        return (
          assignment.tgtSide === current.tgtSide &&
          adjacentSides(current.srcSide).includes(assignment.srcSide)
        );
      })
      .sort(
        (left, right) =>
          left.baseCost - right.baseCost ||
          assignmentKey(left.assignment).localeCompare(assignmentKey(right.assignment)),
      )[0]?.assignment;

  // Target moves are intentionally evaluated first. The second candidate is
  // the best source move, not an exponentially broader pair trial.
  return [selectBest("target"), selectBest("source")].filter(
    (assignment): assignment is PortSideAssignment => assignment !== undefined,
  );
}

function semanticFeedbackAlternatives(
  current: PortSideAssignment,
  edge: ClassifiedEdge,
  evalResult: StateEvaluationResult,
  config: CustomLayoutConfig,
): PortSideAssignment[] {
  const hasPositionedEndpoints = Boolean(
    evalResult.nodes?.some((node) => node.id === edge.source) &&
    evalResult.nodes?.some((node) => node.id === edge.target),
  );
  if (!hasPositionedEndpoints) {
    return feedbackSidePairs.filter(
      (assignment) => assignmentKey(assignment) !== assignmentKey(current),
    );
  }
  const valid = new Set(
    candidateAssignments(edge, current, evalResult, config).map(({ assignment }) =>
      assignmentKey(assignment),
    ),
  );
  return feedbackSidePairs.filter(
    (assignment) =>
      assignmentKey(assignment) !== assignmentKey(current) &&
      // generatePortCandidates returns every candidate when no endpoint leg is
      // valid, so this check remains deterministic while preferring valid legs.
      (valid.size === 0 || valid.has(assignmentKey(assignment))),
  );
}

function crossingComponents(
  crossings: NonNullable<StateEvaluationResult["validation"]["crossings"]>,
): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const crossing of crossings) {
    if (!adjacency.has(crossing.edgeIdA)) adjacency.set(crossing.edgeIdA, new Set());
    if (!adjacency.has(crossing.edgeIdB)) adjacency.set(crossing.edgeIdB, new Set());
    adjacency.get(crossing.edgeIdA)!.add(crossing.edgeIdB);
    adjacency.get(crossing.edgeIdB)!.add(crossing.edgeIdA);
  }

  const components: string[][] = [];
  const remaining = new Set(adjacency.keys());
  while (remaining.size > 0) {
    const first = [...remaining].sort()[0];
    const queue = [first];
    const component: string[] = [];
    remaining.delete(first);
    while (queue.length > 0) {
      const edgeId = queue.shift()!;
      component.push(edgeId);
      for (const adjacent of [...(adjacency.get(edgeId) ?? [])].sort()) {
        if (remaining.delete(adjacent)) queue.push(adjacent);
      }
    }
    components.push(component.sort());
  }
  return components.sort((left, right) => left.join("\u0000").localeCompare(right.join("\u0000")));
}

export function generateNeighborhoodStates(
  state: LayoutSearchState,
  evalResult: StateEvaluationResult,
  config: CustomLayoutConfig,
): LayoutSearchState[] {
  const neighbors: LayoutSearchState[] = [];
  const maxNeighbors = config.maxNeighborsPerState;

  // 1. Generate bounded, defect-oriented port moves. Crossings are repaired
  // by connected components rather than a flat Cartesian sweep of all sides.
  const priorityProblemEdgeIds = new Set<string>();
  const feedbackFillerEdgeIds = new Set<string>();
  const crossings = evalResult.validation.crossings ?? [];
  const classifiedById = new Map(evalResult.classifiedEdges.map((edge) => [edge.id, edge]));
  const routesByEdgeId = new Map(evalResult.routes.map((route) => [route.edgeId, route]));
  const nodeSideMap = new Map<string, string[]>();
  for (const route of [...evalResult.routes].sort((left, right) =>
    left.edgeId.localeCompare(right.edgeId),
  )) {
    const srcKey = `${route.sourcePort.nodeId}:${route.sourcePort.side}`;
    const tgtKey = `${route.targetPort.nodeId}:${route.targetPort.side}`;
    nodeSideMap.set(srcKey, [...(nodeSideMap.get(srcKey) ?? []), `${route.edgeId}:src`]);
    nodeSideMap.set(tgtKey, [...(nodeSideMap.get(tgtKey) ?? []), `${route.edgeId}:tgt`]);
  }

  const canonicalPortOrders: Record<string, string[]> = {};
  const sortedNodeSideEntries = [...nodeSideMap.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (const [sideKey, endpoints] of sortedNodeSideEntries) {
    // The router has a deterministic geometric order when this key is absent.
    // Materializing that implicit order here turns a side-only repair into an
    // attachment-order constraint and can block its intended reroute.
    if (!Object.hasOwn(state.portOrders, sideKey)) continue;
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
    resetState.exactDemands = [...evalResult.exactDemands];
    neighbors.push(resetState);
  }
  const crossingEdgeIds = new Set(
    crossings.flatMap((crossing) => [crossing.edgeIdA, crossing.edgeIdB]),
  );
  const pressuredEdgeIds = new Set<string>();
  for (const edgeId of crossingEdgeIds) {
    if (classifiedById.has(edgeId)) priorityProblemEdgeIds.add(edgeId);
  }

  // Include every affected edge from diagnostics. A badge/edge collision names
  // both participants and either route may be the movable one.
  for (const diag of evalResult.validation.diagnostics) {
    for (const edgeId of diag.ids ?? []) {
      if (classifiedById.has(edgeId)) {
        priorityProblemEdgeIds.add(edgeId);
        pressuredEdgeIds.add(edgeId);
      }
    }
  }

  // A spacing demand identifies every route whose badge needs a different
  // local corridor. Treat those edge IDs like diagnostics so the search can
  // try the alternate ports that make the requested space useful.
  for (const demand of evalResult.exactDemands) {
    for (const edgeId of demand.affectedEdgeIds ?? []) {
      if (classifiedById.has(edgeId)) {
        priorityProblemEdgeIds.add(edgeId);
        pressuredEdgeIds.add(edgeId);
      }
    }
  }

  // Feedback is graph semantics, not a naming convention for generated IDs.
  // Even a clean outer corridor can improve a later score component, so keep
  // every feedback route eligible for its bounded side alternatives.
  for (const edge of evalResult.classifiedEdges) {
    if (edge.role === "feedback" || edge.isCycle) {
      feedbackFillerEdgeIds.add(edge.id);
    }
  }

  // A clean-looking forward route can still make the layout fail its
  // aesthetics contract when it doubles back through a U-shaped hairpin.
  // That route has no collision diagnostic, so make it eligible explicitly.
  // Feedback/self edges keep their existing clean-route eligibility above;
  // their hairpins only add a new reason to move after the first necessary
  // outer-corridor turn.
  for (const edge of evalResult.classifiedEdges) {
    const route = routesByEdgeId.get(edge.id);
    if (!route) continue;
    const hairpinCount = countPathHairpins(route.points);
    const isStructuralRoute = edge.role === "feedback" || edge.role === "self" || edge.isCycle;
    const hasExcessBends = calculateExcessBends([route], evalResult.classifiedEdges) > 0;
    if (hairpinCount > (isStructuralRoute ? 1 : 0) || hasExcessBends) {
      priorityProblemEdgeIds.add(edge.id);
    }
  }

  const compareByAssignmentThenId = (left: string, right: string): number => {
    const assignmentOrder =
      Number(state.sideAssignments.has(left)) - Number(state.sideAssignments.has(right));
    return assignmentOrder || left.localeCompare(right);
  };
  const mandatoryMoves = [...neighbors];
  const componentMoves: LayoutSearchState[] = [];
  const individualMoves: LayoutSearchState[] = [];
  const cleanFeedbackMoves: LayoutSearchState[] = [];
  const portOrderMoves: LayoutSearchState[] = [];
  const layerOrderMoves: LayoutSearchState[] = [];
  neighbors.length = 0;

  const buildCrossingRepair = (edgeIds: string[]): CrossingComponentRepair | undefined => {
    const rankedIds = [...edgeIds].sort(compareByAssignmentThenId);
    const feedbackEdgeId = rankedIds.find((edgeId) => {
      const edge = classifiedById.get(edgeId);
      return edge?.role === "feedback" || edge?.isCycle;
    });
    if (feedbackEdgeId) {
      const edge = classifiedById.get(feedbackEdgeId);
      if (!edge) return undefined;
      const current = currentAssignment(state, feedbackEdgeId, routesByEdgeId);
      const assignment = semanticFeedbackAlternatives(current, edge, evalResult, config)[0];
      return assignment ? { edgeIds, assignments: [[feedbackEdgeId, assignment]] } : undefined;
    }

    const primaryEdgeId = rankedIds.find((edgeId) => pressuredEdgeIds.has(edgeId)) ?? rankedIds[0];
    const primaryEdge = classifiedById.get(primaryEdgeId);
    if (!primaryEdge) return undefined;
    const primaryCurrent = currentAssignment(state, primaryEdgeId, routesByEdgeId);
    const primaryAssignment = oneEndpointAlternatives(
      primaryEdge,
      primaryCurrent,
      evalResult,
      config,
    )[0];
    if (!primaryAssignment) return undefined;

    // The crossing component is a graph, but this proposal touches only the
    // first deterministic crossing pair. Wider coupled combinations are
    // deliberately excluded: the batch below only merges disjoint repairs.
    const partnerEdgeId = crossings
      .filter(
        (crossing) => crossing.edgeIdA === primaryEdgeId || crossing.edgeIdB === primaryEdgeId,
      )
      .map((crossing) => (crossing.edgeIdA === primaryEdgeId ? crossing.edgeIdB : crossing.edgeIdA))
      .filter((edgeId) => edgeIds.includes(edgeId))
      .sort(compareByAssignmentThenId)[0];
    if (!partnerEdgeId) return undefined;

    const partnerEdge = classifiedById.get(partnerEdgeId);
    if (!partnerEdge) return undefined;
    const partnerCurrent = currentAssignment(state, partnerEdgeId, routesByEdgeId);
    const partnerCandidates = candidateAssignments(partnerEdge, partnerCurrent, evalResult, config);
    const partnerCandidateKeys = new Set(
      partnerCandidates.map(({ assignment }) => assignmentKey(assignment)),
    );
    const mirrored = reverseAssignment(primaryAssignment);
    const partnerAssignment = partnerCandidateKeys.has(assignmentKey(mirrored))
      ? mirrored
      : oneEndpointAlternatives(partnerEdge, partnerCurrent, evalResult, config).find(
          (assignment) => partnerCandidateKeys.has(assignmentKey(assignment)),
        );
    if (!partnerAssignment) return undefined;

    return {
      edgeIds,
      assignments: [
        [primaryEdgeId, primaryAssignment],
        [partnerEdgeId, partnerAssignment],
      ],
    };
  };

  const componentRepairs = crossingComponents(crossings)
    .sort((left, right) => {
      const leftAssigned = left.reduce(
        (count, edgeId) => count + Number(state.sideAssignments.has(edgeId)),
        0,
      );
      const rightAssigned = right.reduce(
        (count, edgeId) => count + Number(state.sideAssignments.has(edgeId)),
        0,
      );
      return (
        leftAssigned - rightAssigned || left.join("\u0000").localeCompare(right.join("\u0000"))
      );
    })
    .map(buildCrossingRepair)
    .filter((repair): repair is CrossingComponentRepair => repair !== undefined);

  for (const repair of componentRepairs) {
    const nextState = cloneCanonicalState();
    for (const [edgeId, assignment] of repair.assignments) {
      nextState.sideAssignments.set(edgeId, assignment);
    }
    componentMoves.push(nextState);
  }

  // One coordinated state is enough to test independent repairs together.
  // Components share no crossing edge by construction, so this cannot create
  // a Cartesian product of alternatives.
  let batchMove: LayoutSearchState | undefined;
  if (componentRepairs.length >= 2) {
    const batch = cloneCanonicalState();
    for (const repair of componentRepairs) {
      for (const [edgeId, assignment] of repair.assignments) {
        batch.sideAssignments.set(edgeId, assignment);
      }
    }

    // Carry one deeper non-crossing pressure repair in the single batch. Its
    // target-first move remains independently available below; using the
    // source-first move here gives the bounded search complementary breadth
    // without a Cartesian product.
    const batchPressureEdgeId = [...pressuredEdgeIds]
      .filter((edgeId) => !crossingEdgeIds.has(edgeId))
      .sort(compareByAssignmentThenId)[0];
    if (batchPressureEdgeId) {
      const edge = classifiedById.get(batchPressureEdgeId);
      if (edge) {
        const current = currentAssignment(state, batchPressureEdgeId, routesByEdgeId);
        const alternatives = oneEndpointAlternatives(edge, current, evalResult, config);
        const complementary = alternatives[1] ?? alternatives[0];
        if (complementary) batch.sideAssignments.set(batchPressureEdgeId, complementary);
      }
    }
    batchMove = batch;
  }

  const buildCandidateQueues = (edgeIds: string[]) =>
    edgeIds
      .map((edgeId) => {
        const classified = classifiedById.get(edgeId);
        if (!classified) return undefined;
        const current = currentAssignment(state, edgeId, routesByEdgeId);
        const isFeedback = classified.role === "feedback" || classified.isCycle;
        return {
          edgeId,
          alternatives: isFeedback
            ? semanticFeedbackAlternatives(current, classified, evalResult, config)
            : oneEndpointAlternatives(classified, current, evalResult, config),
        };
      })
      .filter(
        (queue): queue is { edgeId: string; alternatives: PortSideAssignment[] } =>
          queue !== undefined,
      );

  const problemQueues = buildCandidateQueues(
    [...priorityProblemEdgeIds].sort(compareByAssignmentThenId),
  );
  const cleanFeedbackQueues = buildCandidateQueues(
    [...feedbackFillerEdgeIds]
      .filter((edgeId) => !priorityProblemEdgeIds.has(edgeId))
      .sort(compareByAssignmentThenId),
  );

  const appendRoundRobinMoves = (
    queues: Array<{ edgeId: string; alternatives: PortSideAssignment[] }>,
    destination: LayoutSearchState[],
  ): void => {
    for (let alternativeIndex = 0; ; alternativeIndex++) {
      let addedInRound = false;
      for (const queue of queues) {
        const alternative = queue.alternatives[alternativeIndex];
        if (!alternative) continue;

        const nextState = cloneCanonicalState();
        nextState.sideAssignments.set(queue.edgeId, alternative);
        destination.push(nextState);
        addedInRound = true;
      }
      if (!addedInRound) break;
    }
  };
  appendRoundRobinMoves(problemQueues, individualMoves);
  appendRoundRobinMoves(cleanFeedbackQueues, cleanFeedbackMoves);

  // 2. Generate Port Order Moves for node sides with 2+ attachments
  for (const [sKey, endpoints] of sortedNodeSideEntries) {
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
        portOrderMoves.push(nextState);
      }
    }
  }

  // 3. Generate Layer Order Moves for adjacent nodes in same rank when edges cross
  if (crossings.length > 0) {
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
          layerOrderMoves.push(nextState);
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
    mandatoryMoves.unshift(nextState);
  }

  const seenHashes = new Set<string>();
  const appendUnique = (candidate: LayoutSearchState): boolean => {
    if (neighbors.length >= maxNeighbors) return false;
    const hash = computeStateHash(candidate);
    if (seenHashes.has(hash) || hash === computeStateHash(state)) return true;
    seenHashes.add(hash);
    neighbors.push(candidate);
    return true;
  };
  for (const move of mandatoryMoves) {
    if (!appendUnique(move)) return neighbors;
  }

  const depth =
    state.sideAssignments.size +
    Object.keys(state.portOrders).length +
    state.layerOrders.size +
    state.exactDemands.length;
  const rotate = <T>(items: T[]): T[] => {
    if (items.length < 2) return items;
    const offset = depth % items.length;
    return [...items.slice(offset), ...items.slice(0, offset)];
  };
  const primaryMoves = [...(batchMove ? [batchMove] : []), ...componentMoves, ...individualMoves];
  const pools = [
    primaryMoves,
    rotate(cleanFeedbackMoves),
    rotate(portOrderMoves),
    rotate(layerOrderMoves),
  ].filter((pool) => pool.length > 0);
  const indices = pools.map(() => 0);
  let classOffset = pools.length > 0 ? depth % pools.length : 0;
  while (neighbors.length < maxNeighbors && pools.length > 0) {
    let addedInRound = false;
    for (let step = 0; step < pools.length && neighbors.length < maxNeighbors; step++) {
      const poolIndex = (classOffset + step) % pools.length;
      const candidate = pools[poolIndex][indices[poolIndex]++];
      if (!candidate) continue;
      const before = neighbors.length;
      appendUnique(candidate);
      addedInRound ||= neighbors.length > before;
    }
    if (!addedInRound && indices.every((index, poolIndex) => index >= pools[poolIndex].length)) {
      break;
    }
  }

  return neighbors;
}
