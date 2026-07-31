import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { searchBestLayoutState } from "./layoutOptimizerState";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("layoutOptimizerState", () => {
  it("runs Best-First Search returning best evaluation and stats", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const config = resolveCustomLayoutConfig({ maxLayoutStates: 10 });
    const result = searchBestLayoutState(nodes, edges, config);

    expect(result.bestState).toBeDefined();
    expect(result.bestEvaluation.validation.isValid).toBe(true);
    expect(result.stats.totalEvaluatedStates).toBeGreaterThan(0);
  });
});
