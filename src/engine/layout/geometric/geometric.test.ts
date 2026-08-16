import { describe, expect, it } from "bun:test";
import { computeRadialLayout, computeGridLayout } from "./index";
import type { SugiyamaEdge, SugiyamaNode } from "../sugiyama/types";

describe("Radial Layout Engine", () => {
  it("handles empty graph", () => {
    const res = computeRadialLayout([], []);
    expect(res.nodes).toHaveLength(0);
    expect(res.edges).toHaveLength(0);
  });

  it("places root at center and children in concentric shells", () => {
    const nodes: SugiyamaNode[] = [
      { id: "hub", width: 100, height: 50 },
      { id: "c1", width: 100, height: 50 },
      { id: "c2", width: 100, height: 50 },
      { id: "c3", width: 100, height: 50 },
    ];
    const edges: SugiyamaEdge[] = [
      { id: "e1", source: "hub", target: "c1" },
      { id: "e2", source: "hub", target: "c2" },
      { id: "e3", source: "hub", target: "c3" },
    ];

    const res = computeRadialLayout(nodes, edges, {
      rootId: "hub",
      radiusStep: 150,
      center: { x: 0, y: 0 },
    });

    const hub = res.nodes.find((n) => n.id === "hub")!;
    expect(hub.x).toBe(0);
    expect(hub.y).toBe(0);
    expect(hub.depth).toBe(0);

    const children = res.nodes.filter((n) => n.id !== "hub");
    for (const child of children) {
      expect(child.depth).toBe(1);
      const dist = Math.sqrt(child.x * child.x + child.y * child.y);
      expect(Math.abs(dist - 150)).toBeLessThan(1e-3);
    }
  });
});

describe("Grid Layout Engine", () => {
  it("handles empty graph", () => {
    const res = computeGridLayout([], []);
    expect(res.nodes).toHaveLength(0);
    expect(res.edges).toHaveLength(0);
  });

  it("arranges nodes in rows and columns with specified gaps", () => {
    const nodes: SugiyamaNode[] = [
      { id: "1", width: 100, height: 50 },
      { id: "2", width: 100, height: 50 },
      { id: "3", width: 100, height: 50 },
      { id: "4", width: 100, height: 50 },
    ];
    const edges: SugiyamaEdge[] = [{ id: "e1", source: "1", target: "2" }];

    const res = computeGridLayout(nodes, edges, {
      columns: 2,
      rowGap: 40,
      columnGap: 60,
      sortBy: "id",
    });

    expect(res.nodes).toHaveLength(4);
    const n1 = res.nodes.find((n) => n.id === "1")!;
    const n2 = res.nodes.find((n) => n.id === "2")!;
    const n3 = res.nodes.find((n) => n.id === "3")!;
    const n4 = res.nodes.find((n) => n.id === "4")!;

    expect(n1.row).toBe(0);
    expect(n1.col).toBe(0);
    expect(n2.row).toBe(0);
    expect(n2.col).toBe(1);
    expect(n3.row).toBe(1);
    expect(n3.col).toBe(0);
    expect(n4.row).toBe(1);
    expect(n4.col).toBe(1);
  });
});
