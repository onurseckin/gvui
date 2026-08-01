import type { LayoutMode } from "../../state/useGraphStore";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import type { CustomLayoutConfig } from "./custom/config";
import { computeCustomEngineGraphLayout } from "./customLayoutAdapter";

/**
 * Main layout dispatcher exporting layout calculations for WASM layout engine.
 */
export async function computeGraphLayout(
  dataset: GraphDataset,
  _mode: LayoutMode = "top-down",
  configPartial?: Partial<CustomLayoutConfig>,
): Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] }> {
  return await computeCustomEngineGraphLayout(dataset, configPartial);
}
