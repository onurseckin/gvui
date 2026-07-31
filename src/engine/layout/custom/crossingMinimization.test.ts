import { describe, expect, it } from "bun:test";
import { classifyEdgeRoles } from "./cycleBreaking";
import { countLayerCrossings, minimizeCrossings } from "./crossingMinimization";
import { buildLayerGraph } from "./layerGraph";
import { normalizeGraph } from "./normalizeGraph";
import { assignRanks } from "./rankAssignment";
import { detectStronglyConnectedComponents } from "./stronglyConnectedComponents";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("crossingMinimization", () => {
  it("counts 0 crossings for parallel edges and 1 crossing for an inverted pair", () => {
    // Parallel: A->X, B->Y (A and B at rank 0 index 0,1; X and Y at rank 1 index 0,1)
    const layer0 = ["A", "B"];
    const layer1 = ["X", "Y"];

    const parallelEdges = [
      { u: "A", v: "X" },
      { u: "B", v: "Y" },
    ];
    expect(countLayerCrossings(layer0, layer1, parallelEdges)).toBe(0);

    const invertedEdges = [
      { u: "A", v: "Y" },
      { u: "B", v: "X" },
    ];
    expect(countLayerCrossings(layer0, layer1, invertedEdges)).toBe(1);
  });

  it("reorders layer items via barycenter sweep to untangle crossing edges", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "X", width: 100, height: 50 },
      { id: "Y", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "Y" },
      { id: "e2", source: "B", target: "X" },
    ];

    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);
    const layerGraph = buildLayerGraph(norm, roles, ranks);

    const result = minimizeCrossings(layerGraph);
    expect(result.crossingCount).toBe(0);
  });
});
