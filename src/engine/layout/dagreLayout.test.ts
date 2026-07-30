import { describe, expect, it } from "bun:test";
import type { GraphDataset } from "../../types/graphData";
import { calculatePortPosition, computeDagreLayout, getSideFromAngle } from "./dagreLayout";

describe("dagreLayout multi-port equal spacing", () => {
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
    expect(startPoint1).not.toBe(startPoint2);
  });
});
