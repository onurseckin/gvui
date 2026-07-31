import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { assignCoordinates } from "./coordinateAssignment";
import { classifyEdgeRoles } from "./cycleBreaking";
import { minimizeCrossings } from "./crossingMinimization";
import { rectsOverlapStrict } from "./geometry";
import { buildLayerGraph } from "./layerGraph";
import { normalizeGraph } from "./normalizeGraph";
import { assignRanks } from "./rankAssignment";
import { detectStronglyConnectedComponents } from "./stronglyConnectedComponents";
import type { NormalizedEdge, NormalizedNode, Rect } from "./types";

describe("coordinateAssignment", () => {
  it("assigns non-overlapping coordinates for nodes across ranks", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 140, height: 60 },
      { id: "B1", width: 120, height: 60 },
      { id: "B2", width: 120, height: 60 },
      { id: "C", width: 140, height: 60 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B1" },
      { id: "e2", source: "A", target: "B2" },
      { id: "e3", source: "B1", target: "C" },
      { id: "e4", source: "B2", target: "C" },
    ];

    const config = resolveCustomLayoutConfig();
    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);
    const layerGraph = buildLayerGraph(norm, roles, ranks);
    const minimized = minimizeCrossings(layerGraph);

    const result = assignCoordinates(norm, layerGraph, minimized.orderedLayers, config);

    expect(result.nodePositions.size).toBe(4);

    // Check no two node rectangles strictly overlap
    const rects: Rect[] = Array.from(result.nodePositions.entries()).map(([id, pos]) => {
      const normNode = norm.nodeMap.get(id)!;
      return { x: pos.x, y: pos.y, width: normNode.width, height: normNode.height };
    });

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsOverlapStrict(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it("enforces nodeGap between adjacent nodes in the same rank", () => {
    const nodes: NormalizedNode[] = [
      { id: "A1", width: 100, height: 50 },
      { id: "A2", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = []; // Both at rank 0

    const config = resolveCustomLayoutConfig({ nodeGap: 60 });
    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);
    const layerGraph = buildLayerGraph(norm, roles, ranks);
    const minimized = minimizeCrossings(layerGraph);

    const result = assignCoordinates(norm, layerGraph, minimized.orderedLayers, config);

    const pos1 = result.nodePositions.get("A1")!;
    const pos2 = result.nodePositions.get("A2")!;

    const gap = Math.abs(pos2.x - pos1.x) - 100;
    expect(gap).toBeGreaterThanOrEqual(59.9);
  });
});
