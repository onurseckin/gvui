import { describe, expect, it } from "bun:test";
import { classifyEdgeRoles } from "./cycleBreaking";
import { buildLayerGraph } from "./layerGraph";
import { normalizeGraph } from "./normalizeGraph";
import { assignRanks } from "./rankAssignment";
import { detectStronglyConnectedComponents } from "./stronglyConnectedComponents";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("layerGraph", () => {
  it("does not create virtual nodes for rank-span 1 edges", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);
    const layerGraph = buildLayerGraph(norm, roles, ranks);

    expect(layerGraph.virtualNodes.length).toBe(0);
    expect(layerGraph.layers[0].map((n) => n.id)).toEqual(["A"]);
    expect(layerGraph.layers[1].map((n) => n.id)).toEqual(["B"]);
  });

  it("inserts two virtual nodes for a rank-span 3 forward edge", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B1", width: 100, height: 50 },
      { id: "B2", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B1" },
      { id: "e2", source: "B1", target: "B2" },
      { id: "e3", source: "B2", target: "C" },
      { id: "eLong", source: "A", target: "C" }, // Span 3 from rank 0 to 3
    ];

    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);
    const layerGraph = buildLayerGraph(norm, roles, ranks);

    expect(layerGraph.virtualNodes.length).toBe(2);
    expect(layerGraph.virtualNodes[0].rank).toBe(1);
    expect(layerGraph.virtualNodes[1].rank).toBe(2);
    expect(layerGraph.virtualNodes[0].sourceEdgeId).toBe("eLong");
    expect(layerGraph.virtualNodes[1].sourceEdgeId).toBe("eLong");
  });
});
