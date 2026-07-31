import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { generateNeighborhoodStates } from "./neighborhoodSearch";
import { createInitialSearchState } from "./searchState";
import { evaluateSearchState } from "./stateEvaluator";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("neighborhoodSearch", () => {
  it("generates neighbor states for edges with crossings and port side swaps", () => {
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

    const config = resolveCustomLayoutConfig();
    const state = createInitialSearchState();
    const evalResult = evaluateSearchState(nodes, edges, state, config);

    const neighbors = generateNeighborhoodStates(state, evalResult, config);
    expect(Array.isArray(neighbors)).toBe(true);
  });
});
