import { placeEdgeBadges } from "./badgePlacement";
import type { CustomLayoutConfig } from "./config";
import { routeAllEdges } from "./edgeRouter";
import { planLabelLaneDemands } from "./labelLanePlanner";
import { validateCustomLayout, validationResultToScore } from "./layoutValidator";
import { computeNodeLayout, type NodeLayoutResult } from "./nodeLayout";
import { canonicalizeExactSpacingDemands, resolveExactSpacingDemands } from "./spacingDemand";
import type {
  BadgePlacement,
  ExactSpacingDemand,
  LayoutScore,
  LayoutSearchState,
  LayoutValidationResult,
  NormalizedEdge,
  NormalizedNode,
  Point,
  PortRef,
  RoutedPath,
  ClassifiedEdge,
} from "./types";

export interface StateEvaluationResult {
  score: LayoutScore;
  validation: LayoutValidationResult;
  nodeLayout: NodeLayoutResult;
  nodes: (NormalizedNode & Point)[];
  routes: RoutedPath[];
  badges: BadgePlacement[];
  allPortRefs: PortRef[];
  exactDemands: ExactSpacingDemand[];
  classifiedEdges: ClassifiedEdge[];
  resetSideAssignments: boolean;
}

export function evaluateSearchState(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  state: LayoutSearchState,
  config: CustomLayoutConfig,
): StateEvaluationResult {
  const currentDemands: ExactSpacingDemand[] = canonicalizeExactSpacingDemands(state.exactDemands);

  let spacingOverrides = resolveExactSpacingDemands(currentDemands, config.nodeGap, config.rankGap);

  let nodeLayout = computeNodeLayout(
    nodes,
    edges,
    config,
    spacingOverrides,
    state.layerOrders,
    state.layerShifts,
  );

  let routerResult = routeAllEdges(nodeLayout, config, {
    sideAssignments: state.sideAssignments,
    portOrders: state.portOrders,
  });

  let badgeResult = placeEdgeBadges(routerResult.routes, nodeLayout, config);
  let stateResetRequired = false;

  const mapsDiffer = <Key>(
    left: Map<Key, number> | undefined,
    right: Map<Key, number> | undefined,
    defaultValue: number,
  ): boolean => {
    const keys = new Set([...(left?.keys() ?? []), ...(right?.keys() ?? [])]);
    for (const key of keys) {
      if ((left?.get(key) ?? defaultValue) !== (right?.get(key) ?? defaultValue)) return true;
    }
    return false;
  };

  const hasEffectiveSpacingChange = (nextDemands: ExactSpacingDemand[]): boolean => {
    const nextOverrides = resolveExactSpacingDemands(nextDemands, config.nodeGap, config.rankGap);
    return (
      spacingOverrides.globalNodeGap !== nextOverrides.globalNodeGap ||
      spacingOverrides.globalRankGap !== nextOverrides.globalRankGap ||
      mapsDiffer(spacingOverrides.nodeGapByRank, nextOverrides.nodeGapByRank, config.nodeGap) ||
      mapsDiffer(
        spacingOverrides.nodeGapAfterNodeId,
        nextOverrides.nodeGapAfterNodeId,
        config.nodeGap,
      ) ||
      mapsDiffer(spacingOverrides.rankGapAfterRank, nextOverrides.rankGapAfterRank, config.rankGap)
    );
  };

  const canMoveLayout = (demand: ExactSpacingDemand): boolean => {
    if (demand.kind === "node-gap" || demand.kind === "lane-x") {
      const rank =
        demand.rank ??
        (demand.afterNodeId
          ? nodeLayout.rankAssignment.nodeRankMap.get(demand.afterNodeId)
          : undefined);
      return (
        rank !== undefined && (nodeLayout.rankAssignment.rankNodesMap.get(rank)?.length ?? 0) >= 2
      );
    }
    if (demand.kind === "rank-gap" || demand.kind === "lane-y") {
      return (
        demand.rank !== undefined &&
        nodeLayout.rankAssignment.rankNodesMap.has(demand.rank) &&
        nodeLayout.rankAssignment.rankNodesMap.has(demand.rank + 1)
      );
    }
    return false;
  };

  const mergeActionableDemands = (
    demands: ExactSpacingDemand[],
  ): {
    effectiveSpacingChanged: boolean;
    hasBlockedRequest: boolean;
  } => {
    const actionableDemands = demands.filter(canMoveLayout);
    const nextDemands = canonicalizeExactSpacingDemands([...currentDemands, ...actionableDemands]);
    const effectiveSpacingChanged = hasEffectiveSpacingChange(nextDemands);
    currentDemands.splice(0, currentDemands.length, ...nextDemands);
    return {
      effectiveSpacingChanged,
      hasBlockedRequest: actionableDemands.length !== demands.length,
    };
  };

  if (badgeResult.spacingRequests && badgeResult.spacingRequests.length > 0) {
    const requests = badgeResult.spacingRequests.map(
      (req): ExactSpacingDemand => ({
        kind: req.kind,
        rank: req.rank,
        afterNodeId: req.afterNodeId,
        affectedEdgeIds: [req.edgeId],
        minimum: req.minimum,
        reason: req.reason,
      }),
    );
    const { effectiveSpacingChanged, hasBlockedRequest } = mergeActionableDemands(requests);

    if (effectiveSpacingChanged) {
      // Evaluate the candidate exactly as represented. A port-side reset, if
      // useful, is emitted later as a distinct neighbor state.
      spacingOverrides = resolveExactSpacingDemands(currentDemands, config.nodeGap, config.rankGap);

      nodeLayout = computeNodeLayout(
        nodes,
        edges,
        config,
        spacingOverrides,
        state.layerOrders,
        state.layerShifts,
      );

      routerResult = routeAllEdges(nodeLayout, config, {
        sideAssignments: state.sideAssignments,
        portOrders: state.portOrders,
      });

      badgeResult = placeEdgeBadges(routerResult.routes, nodeLayout, config);
    }

    // A blocked request can justify one explicit routing-reset neighbor. A
    // request whose numeric spacing is already sufficient merely enriches the
    // canonical demand metadata and does not imply a reset.
    stateResetRequired = hasBlockedRequest && state.sideAssignments.size > 0;
  }

  const validation = validateCustomLayout(
    {
      nodes: nodeLayout.normalizedGraph.nodes.map((n) => ({
        ...n,
        ...(nodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 }),
      })),
      edges: routerResult.routes,
      badges: badgeResult.placements,
      classifiedEdges: nodeLayout.classifiedEdges,
      expectedEdges: nodeLayout.normalizedGraph.edges,
    },
    config,
  );

  const score = validationResultToScore(validation);

  const labelDemands = planLabelLaneDemands(badgeResult.placements, routerResult.routes, config, {
    rankByNodeId: nodeLayout.rankAssignment.nodeRankMap,
    layerNodeIds: Array.from(nodeLayout.rankAssignment.rankNodesMap.entries())
      .sort(([left], [right]) => left - right)
      .map(([, nodeIds]) => nodeIds),
    nodeGapByRank: spacingOverrides.nodeGapByRank,
    rankGapAfterRank: spacingOverrides.rankGapAfterRank,
  });

  mergeActionableDemands(labelDemands);

  const allPortRefs: PortRef[] = [];
  for (const r of routerResult.routes) {
    allPortRefs.push(r.sourcePort);
    allPortRefs.push(r.targetPort);
  }

  const positionedNodes = nodeLayout.normalizedGraph.nodes.map((n) => ({
    ...n,
    ...(nodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 }),
  }));

  return {
    score,
    validation,
    nodeLayout,
    nodes: positionedNodes,
    routes: routerResult.routes,
    badges: badgeResult.placements,
    allPortRefs,
    exactDemands: currentDemands,
    classifiedEdges: nodeLayout.classifiedEdges,
    resetSideAssignments: stateResetRequired,
  };
}
