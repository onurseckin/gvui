import { measureBadgeRects } from "./badgeMeasurement";
import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "./config";
import { optimizeLayout } from "./optimizeLayout";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./types";

export function computeCustomLayout(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  configPartial?: Partial<CustomLayoutConfig>
): CustomLayoutResult {
  const config = resolveCustomLayoutConfig(configPartial);

  measureBadgeRects(edges, config);

  return optimizeLayout(nodes, edges, config);
}



