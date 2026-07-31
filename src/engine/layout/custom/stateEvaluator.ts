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

  const appendActionableDemand = (demand: ExactSpacingDemand): boolean => {
    if (!canMoveLayout(demand)) return false;
    const nextDemands = canonicalizeExactSpacingDemands([...currentDemands, demand]);
    const currentOverrides = resolveExactSpacingDemands(
      currentDemands,
      config.nodeGap,
      config.rankGap,
    );
    const nextOverrides = resolveExactSpacingDemands(nextDemands, config.nodeGap, config.rankGap);
    const mapChanges = (
      left: Map<number | string, number> | undefined,
      right: Map<number | string, number> | undefined,
      defaultValue: number,
    ) => {
      const keys = new Set([...(left?.keys() ?? []), ...(right?.keys() ?? [])]);
      for (const key of keys) {
        if ((left?.get(key) ?? defaultValue) !== (right?.get(key) ?? defaultValue)) return true;
      }
      return false;
    };
    const changesEffectiveSpacing =
      currentOverrides.globalNodeGap !== nextOverrides.globalNodeGap ||
      currentOverrides.globalRankGap !== nextOverrides.globalRankGap ||
      mapChanges(currentOverrides.nodeGapByRank, nextOverrides.nodeGapByRank, config.nodeGap) ||
      mapChanges(
        currentOverrides.nodeGapAfterNodeId,
        nextOverrides.nodeGapAfterNodeId,
        config.nodeGap,
      ) ||
      mapChanges(currentOverrides.rankGapAfterRank, nextOverrides.rankGapAfterRank, config.rankGap);
    if (!changesEffectiveSpacing) return false;
    currentDemands.splice(0, currentDemands.length, ...nextDemands);
    return true;
  };

  if (badgeResult.spacingRequests && badgeResult.spacingRequests.length > 0) {
    let addedNew = false;
    let resetSideAssignments = false;
    for (const req of badgeResult.spacingRequests) {
      const demand: ExactSpacingDemand = {
        kind: req.kind,
        rank: req.rank,
        afterNodeId: req.afterNodeId,
        affectedEdgeIds: [req.edgeId],
        minimum: req.minimum,
        reason: req.reason,
      };
      const appended = appendActionableDemand(demand);
      addedNew = addedNew || appended;
      resetSideAssignments ||= !appended && state.sideAssignments.size > 0;
    }

    if (addedNew) {
      // Spacing changes invalidate a port-side trial, but the candidate state
      // itself remains immutable so it can be scored and revisited faithfully.
      const rerouteSideAssignments = new Map();
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
        sideAssignments: rerouteSideAssignments,
        portOrders: state.portOrders,
      });

      badgeResult = placeEdgeBadges(routerResult.routes, nodeLayout, config);
    }

    if (resetSideAssignments) {
      // A no-op demand may still reveal that a side-assignment trial blocked
      // label placement. Request a routing reset as its own state rather than
      // encoding it as a fake spacing override.
      stateResetRequired = true;
    }
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

  for (const ld of labelDemands) {
    appendActionableDemand(ld);
  }

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
