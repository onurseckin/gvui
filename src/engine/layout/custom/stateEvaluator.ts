import { placeEdgeBadges } from "./badgePlacement";
import type { CustomLayoutConfig } from "./config";
import { routeAllEdges } from "./edgeRouter";
import { planLabelLaneDemands } from "./labelLanePlanner";
import { validateCustomLayout, validationResultToScore } from "./layoutValidator";
import { computeNodeLayout, type NodeLayoutResult } from "./nodeLayout";
import { resolveExactSpacingDemands } from "./spacingDemand";
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
}

export function evaluateSearchState(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  state: LayoutSearchState,
  config: CustomLayoutConfig,
): StateEvaluationResult {
  const currentDemands: ExactSpacingDemand[] = [...state.exactDemands];

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
  });

  let badgeResult = placeEdgeBadges(routerResult.routes, nodeLayout, config);

  if (badgeResult.spacingRequests && badgeResult.spacingRequests.length > 0) {
    let addedNew = false;
    for (const req of badgeResult.spacingRequests) {
      const demand: ExactSpacingDemand = {
        kind: req.kind,
        rank: req.rank,
        afterNodeId: req.afterNodeId,
        affectedEdgeIds: [req.edgeId],
        minimum: req.minimum,
        reason: req.reason,
      };
      if (
        !currentDemands.some(
          (d) => d.kind === demand.kind && d.minimum >= demand.minimum && d.rank === demand.rank,
        )
      ) {
        currentDemands.push(demand);
        addedNew = true;
      }
    }

    if (addedNew) {
      state.sideAssignments.clear();

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
      });

      badgeResult = placeEdgeBadges(routerResult.routes, nodeLayout, config);
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

  const labelDemands = planLabelLaneDemands(badgeResult.placements, routerResult.routes, config);

  for (const ld of labelDemands) {
    if (!currentDemands.some((e) => e.reason === ld.reason && e.minimum === ld.minimum)) {
      currentDemands.push(ld);
    }
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
  };
}
