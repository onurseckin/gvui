import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { createInitialSearchState } from "./searchState";
import { evaluateSearchState } from "./stateEvaluator";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("stateEvaluator", () => {
  it("evaluates a initial search state returning valid layout score and routes", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const config = resolveCustomLayoutConfig();
    const state = createInitialSearchState();

    const evalResult = evaluateSearchState(nodes, edges, state, config);

    expect(evalResult.score).toBeDefined();
    expect(evalResult.validation.isValid).toBe(true);
    expect(evalResult.routes.length).toBe(1);
  });
});
