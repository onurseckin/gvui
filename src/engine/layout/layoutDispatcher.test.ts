import { describe, expect, it } from "bun:test";
import { computeGraphLayout } from "./layoutDispatcher";
import type { GraphDataset } from "../../types/graphData";

describe("layoutDispatcher all 4 modes", () => {
  const sampleDataset: GraphDataset = {
    id: "sample-test-graph",
    title: "Sample Test Graph",
    nodes: [
      { id: "A", name: "Node A" },
      { id: "B", name: "Node B" },
      { id: "C", name: "Node C" },
    ],
    edges: [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
    ],
  };

  it("computes positioned nodes and edges for top-down layout", async () => {
    const res = await computeGraphLayout(sampleDataset, "top-down");
    expect(res.nodes).toHaveLength(3);
    expect(res.edges).toHaveLength(2);
    expect(res.nodes[0].x).toBeDefined();
    expect(res.nodes[0].y).toBeDefined();
  });

  it("computes positioned nodes and edges for left-right layout", async () => {
    const res = await computeGraphLayout(sampleDataset, "left-right");
    expect(res.nodes).toHaveLength(3);
    expect(res.edges).toHaveLength(2);
    expect(res.nodes[1].x).toBeGreaterThan(res.nodes[0].x);
  });

  it("computes positioned nodes and edges for force layout", async () => {
    const res = await computeGraphLayout(sampleDataset, "force");
    expect(res.nodes).toHaveLength(3);
    expect(res.edges).toHaveLength(2);
  });

  it("computes positioned nodes and edges for radial layout", async () => {
    const res = await computeGraphLayout(sampleDataset, "radial");
    expect(res.nodes).toHaveLength(3);
    expect(res.edges).toHaveLength(2);
  });

  it("handles zero-node dataset safely without crashing", async () => {
    const emptyDataset: GraphDataset = { id: "empty", title: "Empty", nodes: [], edges: [] };
    const res = await computeGraphLayout(emptyDataset, "top-down");
    expect(res.nodes).toHaveLength(0);
    expect(res.edges).toHaveLength(0);
  });

  it("handles single-node dataset safely", async () => {
    const singleDataset: GraphDataset = { id: "single", title: "Single", nodes: [{ id: "n1", name: "Single" }], edges: [] };
    const res = await computeGraphLayout(singleDataset, "top-down");
    expect(res.nodes).toHaveLength(1);
    expect(res.edges).toHaveLength(0);
  });
});
