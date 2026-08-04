import { normalizeLayoutMode, type LayoutMode } from "../../state/useGraphStore";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import type { CustomLayoutConfig } from "./custom/config";
import { computeCustomEngineGraphLayout } from "./customLayoutAdapter";

/**
 * Main layout dispatcher exporting layout calculations for the v2 WASM layout engine and all of
 * its modes. `mode` accepts `LayoutMode | string` — not just `LayoutMode` — so callers still
 * holding a legacy mode string (e.g. `"top-down"`, `"force"`) keep compiling and get normalized
 * via `normalizeLayoutMode` rather than silently landing on the wrong engine.
 */
export async function computeGraphLayout(
  dataset: GraphDataset,
  mode: LayoutMode | string = "layered",
  configPartial?: Partial<CustomLayoutConfig>,
): Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] }> {
  return await computeCustomEngineGraphLayout(dataset, configPartial, normalizeLayoutMode(mode));
}
