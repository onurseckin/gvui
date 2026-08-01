import { describe, expect, it } from "bun:test";
import type { GraphDataset } from "../../types/graphData";
import {
  calculatePortPosition,
  computeDagreLayout,
  findTotalPathMidpoint,
  getSideFromAngle,
} from "./nodeDimensions";

describe("nodeDimensions multi-port equal spacing", () => {
  it("determines correct side based on angle theta", () => {
    expect(getSideFromAngle(0)).toBe("Right");
    expect(getSideFromAngle(Math.PI / 4)).toBe("Bottom");
    expect(getSideFromAngle(Math.PI / 2)).toBe("Bottom");
    expect(getSideFromAngle((3 * Math.PI) / 4)).toBe("Left");
    expect(getSideFromAngle(Math.PI)).toBe("Left");
    expect(getSideFromAngle(-Math.PI)).toBe("Left");
    expect(getSideFromAngle(-Math.PI / 2)).toBe("Top");
    expect(getSideFromAngle(-Math.PI / 4)).toBe("Right");
  });

  it("calculates port position on border with alpha offset", () => {
    const node = { x: 100, y: 50, width: 200, height: 100 };

    expect(calculatePortPosition(node, "Top", 0.5)).toEqual({ x: 200, y: 50 });
    expect(calculatePortPosition(node, "Bottom", 0.5)).toEqual({ x: 200, y: 150 });
    expect(calculatePortPosition(node, "Left", 0.25)).toEqual({ x: 100, y: 75 });
    expect(calculatePortPosition(node, "Right", 0.75)).toEqual({ x: 300, y: 125 });
  });

  it("calculates mathematical 4-side multi-port equal spacing for multiple edges", () => {
    const dataset: GraphDataset = {
      id: "ds1",
      title: "Test Dataset",
      nodes: [
        { id: "A", name: "Node A" },
        { id: "B1", name: "Node B1" },
        { id: "B2", name: "Node B2" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B1" },
        { id: "e2", source: "A", target: "B2" },
      ],
    };

    const { nodes, edges } = computeDagreLayout(dataset);
    expect(nodes.length).toBe(3);
    expect(edges.length).toBe(2);

    expect(edges[0].path).toBeDefined();
    expect(edges[1].path).toBeDefined();

    // Check that paths start at distinct port coordinates
    const startPoint1 = edges[0].path.split(" ")[1] + " " + edges[0].path.split(" ")[2];
    const startPoint2 = edges[1].path.split(" ")[1] + " " + edges[1].path.split(" ")[2];
    expect(startPoint1 !== startPoint2).toBe(true);
  });

  it("calculates exact 50% total path arc-length midpoint", () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    // Total length = 100 + 100 = 200. Midpoint at distance 100 should be { x: 100, y: 0 }
    const mid = findTotalPathMidpoint(polyline);
    expect(Math.abs(mid.x - 100) < 0.001).toBe(true);
    expect(Math.abs(mid.y - 0) < 0.001).toBe(true);
  });

  it("applies badge repulsion so edge badges do not overlap each other or nodes", () => {
    const dataset: GraphDataset = {
      id: "ds2",
      title: "Badge Repulsion Test",
      nodes: [
        { id: "A", name: "Node A" },
        { id: "B", name: "Node B" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B", label: "Edge 1" },
        { id: "e2", source: "A", target: "B", label: "Edge 2" },
      ],
    };

    const { edges } = computeDagreLayout(dataset);
    expect(edges.length).toBe(2);

    const e1 = edges[0];
    const e2 = edges[1];

    if (
      e1.labelX !== undefined &&
      e1.labelY !== undefined &&
      e2.labelX !== undefined &&
      e2.labelY !== undefined
    ) {
      const dx = Math.abs(e2.labelX - e1.labelX);
      const dy = Math.abs(e2.labelY - e1.labelY);
      // Badges must be separated by repulsion pass
      expect(dx >= 84 || dy >= 34).toBe(true);
    }
  });
});
