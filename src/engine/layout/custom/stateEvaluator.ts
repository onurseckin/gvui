import { placeEdgeBadges } from "./badgePlacement";
import type { CustomLayoutConfig } from "./config";
import { routeAllEdges } from "./edgeRouter";
import { planLabelLaneDemands } from "./labelLanePlanner";
import { validateCustomLayout, validationResultToScore } from "./layoutValidator";
import { computeNodeLayout, type NodeLayoutResult } from "./nodeLayout";
import { resolveExactSpacingDemands } from "./spacingDemand";
import type {
  ExactSpacingDemand,
  LayoutScore,
  LayoutSearchState,
  LayoutValidationResult,
  NormalizedEdge,
  NormalizedNode,
  PortRef,
  RoutedPath,
} from "./types";

export interface StateEvaluationResult {
  score: LayoutScore;
  validation: LayoutValidationResult;
  nodeLayout: NodeLayoutResult;
  routes: RoutedPath[];
  allPortRefs: PortRef[];
  exactDemands: ExactSpacingDemand[];
}

export function evaluateSearchState(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  state: LayoutSearchState,
  config: CustomLayoutConfig,
): StateEvaluationResult {
  const spacingOverrides = resolveExactSpacingDemands(
    state.exactDemands,
    config.nodeGap,
    config.rankGap,
  );

  const nodeLayout = computeNodeLayout(
    nodes,
    edges,
    config,
    spacingOverrides,
    state.layerOrders,
    state.layerShifts,
  );

  const routerResult = routeAllEdges(nodeLayout, config, {
    sideAssignments: state.sideAssignments,
  });

  const badgeResult = placeEdgeBadges(routerResult.routes, nodeLayout, config);

  const validation = validateCustomLayout(
    {
      nodes: nodeLayout.normalizedGraph.nodes.map((n) => ({
        ...n,
        ...(nodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 }),
      })),
      edges: routerResult.routes,
      badges: badgeResult.placements,
      classifiedEdges: nodeLayout.classifiedEdges,
    },
    config,
  );

  const score = validationResultToScore(validation);

  const labelDemands = planLabelLaneDemands(badgeResult.placements, routerResult.routes, config);
  const exactDemands: ExactSpacingDemand[] = [...state.exactDemands];

  for (const ld of labelDemands) {
    if (!exactDemands.some((e) => e.reason === ld.reason && e.minimum === ld.minimum)) {
      exactDemands.push(ld);
    }
  }

  if (badgeResult.spacingRequests) {
    for (const req of badgeResult.spacingRequests) {
      exactDemands.push({
        kind: req.kind,
        rank: req.rank,
        afterNodeId: req.afterNodeId,
        affectedEdgeIds: [req.edgeId],
        minimum: req.minimum,
        reason: req.reason,
      });
    }
  }

  const allPortRefs: PortRef[] = [];
  for (const r of routerResult.routes) {
    allPortRefs.push(r.sourcePort);
    allPortRefs.push(r.targetPort);
  }

  return {
    score,
    validation,
    nodeLayout,
    routes: routerResult.routes,
    allPortRefs,
    exactDemands,
  };
}
