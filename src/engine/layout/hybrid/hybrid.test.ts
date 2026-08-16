import { describe, expect, it } from "bun:test";
import { computeHybridLayout } from "./index";
import type { SugiyamaEdge, SugiyamaNode } from "../sugiyama/types";

describe("Hybrid Force-DAG Layout Engine", () => {
  it("returns empty result for empty graph", () => {
    const res = computeHybridLayout([], []);
    expect(res.nodes).toHaveLength(0);
    expect(res.edges).toHaveLength(0);
    expect(res.width).toBe(0);
    expect(res.height).toBe(0);
  });

  it("relaxes DAG nodes while preserving hierarchical rank ordering", () => {
    const nodes: SugiyamaNode[] = [
      { id: "root", width: 120, height: 60 },
      { id: "childA", width: 120, height: 60 },
      { id: "childB", width: 120, height: 60 },
      { id: "leaf", width: 120, height: 60 },
    ];
    const edges: SugiyamaEdge[] = [
      { id: "e1", source: "root", target: "childA" },
      { id: "e2", source: "root", target: "childB" },
      { id: "e3", source: "childA", target: "leaf" },
      { id: "e4", source: "childB", target: "leaf" },
    ];

    const res = computeHybridLayout(nodes, edges, {
      rankSeparation: 120,
      nodeSeparation: 60,
      randomSeed: 42,
    });

    expect(res.nodes).toHaveLength(4);
    expect(res.edges).toHaveLength(4);

    const root = res.nodes.find((n) => n.id === "root")!;
    const childA = res.nodes.find((n) => n.id === "childA")!;
    const childB = res.nodes.find((n) => n.id === "childB")!;
    const leaf = res.nodes.find((n) => n.id === "leaf")!;

    expect(root.y).toBeLessThan(childA.y);
    expect(root.y).toBeLessThan(childB.y);
    expect(childA.y).toBeLessThan(leaf.y);
    expect(childB.y).toBeLessThan(leaf.y);

    // Check that childA and childB are separated horizontally (no overlap)
    const hDist = Math.abs(childA.x - childB.x);
    expect(hDist).toBeGreaterThanOrEqual(120);

    for (const edge of res.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("handles complex multi-cluster DAGs and cycles", () => {
    const nodes: SugiyamaNode[] = [
      { id: "1", width: 100, height: 50 },
      { id: "2", width: 100, height: 50 },
      { id: "3", width: 100, height: 50 },
      { id: "4", width: 100, height: 50 },
    ];
    const edges: SugiyamaEdge[] = [
      { id: "e1", source: "1", target: "2" },
      { id: "e2", source: "2", target: "3" },
      { id: "e3", source: "3", target: "4" },
      { id: "e4", source: "4", target: "2" }, // cycle back
    ];

    const res = computeHybridLayout(nodes, edges, { randomSeed: 100 });
    expect(res.nodes).toHaveLength(4);
    expect(res.edges).toHaveLength(4);
  });
});
