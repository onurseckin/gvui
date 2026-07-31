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

  it("applies spacing overrides and translates minimum node coordinates to graphPadding", () => {
    const nodes: NormalizedNode[] = [
      { id: "A1", width: 100, height: 50 },
      { id: "A2", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [];

    const config = resolveCustomLayoutConfig({ graphPadding: 40, nodeGap: 20 });
    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);
    const layerGraph = buildLayerGraph(norm, roles, ranks);
    const minimized = minimizeCrossings(layerGraph);

    const result = assignCoordinates(norm, layerGraph, minimized.orderedLayers, config, {
      nodeGaps: { A1: 80 },
    });

    const pos1 = result.nodePositions.get("A1")!;
    const pos2 = result.nodePositions.get("A2")!;

    expect(pos1.x).toBe(40);
    expect(pos1.y).toBe(40);
    expect(pos2.x - (pos1.x + 100)).toBe(80);
  });

  it("keeps centered fan-in hub COL within middle 20% of input span without median drift", () => {
    const nodes: NormalizedNode[] = [
      { id: "I1", width: 100, height: 50 },
      { id: "I2", width: 100, height: 50 },
      { id: "I3", width: 100, height: 50 },
      { id: "I4", width: 100, height: 50 },
      { id: "I5", width: 100, height: 50 },
      { id: "I6", width: 100, height: 50 },
      { id: "I7", width: 100, height: 50 },
      { id: "COL", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "I1", target: "COL" },
      { id: "e2", source: "I2", target: "COL" },
      { id: "e3", source: "I3", target: "COL" },
      { id: "e4", source: "I4", target: "COL" },
      { id: "e5", source: "I5", target: "COL" },
      { id: "e6", source: "I6", target: "COL" },
      { id: "e7", source: "I7", target: "COL" },
    ];

    const config = resolveCustomLayoutConfig();
    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);
    const layerGraph = buildLayerGraph(norm, roles, ranks);
    const minimized = minimizeCrossings(layerGraph);

    const result = assignCoordinates(norm, layerGraph, minimized.orderedLayers, config);

    const inputXs = ["I1", "I2", "I3", "I4", "I5", "I6", "I7"].map(
      (id) => result.nodePositions.get(id)!.x,
    );
    const minInputX = Math.min(...inputXs);
    const maxInputX = Math.max(...inputXs.map((x) => x + 100));
    const inputSpan = maxInputX - minInputX;

    const colX = result.nodePositions.get("COL")!.x + 50;
    const relPos = (colX - minInputX) / inputSpan;

    expect(relPos).toBeGreaterThanOrEqual(0.4);
    expect(relPos).toBeLessThanOrEqual(0.6);
  });

  it("supports SpacingOverrides maps for nodeGapByRank, rankGapAfterRank, and nodeGapAfterNodeId", () => {
    const nodes: NormalizedNode[] = [
      { id: "N1", width: 100, height: 50 },
      { id: "N2", width: 100, height: 50 },
      { id: "N3", width: 100, height: 50 },
      { id: "N4", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "N1", target: "N3" },
      { id: "e2", source: "N2", target: "N4" },
    ];

    const config = resolveCustomLayoutConfig({ nodeGap: 30, rankGap: 40 });
    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);
    const layerGraph = buildLayerGraph(norm, roles, ranks);
    const minimized = minimizeCrossings(layerGraph);

    const spacingOverrides = {
      nodeGapByRank: new Map([[0, 90]]),
      rankGapAfterRank: new Map([[0, 180]]),
      nodeGapAfterNodeId: new Map([["N3", 110]]),
    };

    const result = assignCoordinates(
      norm,
      layerGraph,
      minimized.orderedLayers,
      config,
      spacingOverrides,
    );

    const posN1 = result.nodePositions.get("N1")!;
    const posN2 = result.nodePositions.get("N2")!;
    const posN3 = result.nodePositions.get("N3")!;
    const posN4 = result.nodePositions.get("N4")!;

    const rank0Gap = Math.abs(posN2.x - posN1.x) - 100;
    expect(rank0Gap).toBeGreaterThanOrEqual(90);

    const rankGap = posN3.y - (posN1.y + 50);
    expect(rankGap).toBeGreaterThanOrEqual(180);

    const rank1Gap = Math.abs(posN4.x - posN3.x) - 100;
    expect(rank1Gap).toBeGreaterThanOrEqual(110);
  });
});

