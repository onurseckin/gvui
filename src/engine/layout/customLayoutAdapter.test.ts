import { describe, expect, it } from "bun:test";
import { computeCustomEngineGraphLayout } from "./customLayoutAdapter";
import type { GraphDataset } from "../../types/graphData";

describe("computeCustomEngineGraphLayout", () => {
  it("computes positioned nodes and edges for a standard application GraphDataset", () => {
    const dataset: GraphDataset = {
      id: "test-ds-1",
      title: "Test AI Agent Pipeline",
      nodes: [
        { id: "A", name: "Input Node A", description: "First step" },
        { id: "B", name: "Processing Node B", description: "Second step" },
        { id: "C", name: "Output Node C", description: "Third step" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B", label: "step 1" },
        { id: "e2", source: "B", target: "C", label: "step 2" },
      ],
    };

    const result = computeCustomEngineGraphLayout(dataset);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);

    for (const node of result.nodes) {
      expect(typeof node.x).toBe("number");
      expect(typeof node.y).toBe("number");
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }

    for (const edge of result.edges) {
      expect(edge.path).toContain("M");
      expect(typeof edge.labelX).toBe("number");
      expect(typeof edge.labelY).toBe("number");
    }
  });

  it("handles empty dataset gracefully", () => {
    const dataset: GraphDataset = {
      id: "empty",
      title: "Empty Graph",
      nodes: [],
      edges: [],
    };

    const result = computeCustomEngineGraphLayout(dataset);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
