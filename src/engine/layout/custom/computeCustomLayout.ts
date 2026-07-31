import { placeEdgeBadges } from "./badgePlacement";
import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "./config";
import { routeAllEdges } from "./edgeRouter";
import { validateCustomLayout } from "./layoutValidator";
import { computeNodeLayout } from "./nodeLayout";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode, Point } from "./types";

export function computeCustomLayout(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  configPartial?: Partial<CustomLayoutConfig>
): CustomLayoutResult {
  const config = resolveCustomLayoutConfig(configPartial);

  const nodeLayout = computeNodeLayout(nodes, edges, config);
  const routerResult = routeAllEdges(nodeLayout, config);
  const badgeResult = placeEdgeBadges(routerResult.routes, nodeLayout, config);

  const positionedNodes: (NormalizedNode & Point)[] = nodeLayout.normalizedGraph.nodes.map((n) => {
    const pos = nodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 };
    return {
      ...n,
      x: pos.x,
      y: pos.y,
    };
  });

  const initialResult: Omit<CustomLayoutResult, "validation" | "status"> = {
    nodes: positionedNodes,
    edges: routerResult.routes,
    badges: badgeResult.placements,
    crossings: [],
  };

  const validation = validateCustomLayout(initialResult, config);

  const status = validation.isValid
    ? routerResult.status
    : "invalid_hard_failure";

  return {
    ...initialResult,
    validation,
    status,
  };
}
