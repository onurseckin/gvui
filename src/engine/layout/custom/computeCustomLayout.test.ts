import { describe, expect, it } from "bun:test";
import { computeCustomLayout } from "./computeCustomLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("computeCustomLayout", () => {
  it("computes complete layout result with node positions, edge routes, and validation metrics", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
    ];

    const result = computeCustomLayout(nodes, edges);

    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
    expect(result.validation.isValid).toBe(true);
    expect(result.status).toBe("success");
  });
});
