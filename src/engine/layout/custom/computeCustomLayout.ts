import { measureBadgeRects } from "./badgeMeasurement";
import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "./config";
import { computeCustomLayoutAsync } from "./customLayoutWorkerClient";
import { optimizeLayout } from "./optimizeLayout";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./types";

export async function computeCustomLayout(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  configPartial?: Partial<CustomLayoutConfig>,
): Promise<CustomLayoutResult> {
  const config = resolveCustomLayoutConfig(configPartial);

  measureBadgeRects(edges, config);

  return await optimizeLayout(nodes, edges, config);
}

export { computeCustomLayoutAsync };
