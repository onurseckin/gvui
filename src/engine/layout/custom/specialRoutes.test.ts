import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { routeFeedbackCorridors, routeSelfLoop } from "./specialRoutes";
import type { NormalizedEdge, NormalizedNode, Point, Rect } from "./types";

describe("specialRoutes", () => {
  it("routes a self-loop outside the node rectangle using 2 distinct ports", () => {
    const node: NormalizedNode & Point = { id: "A", width: 100, height: 60, x: 100, y: 100 };
    const edge: NormalizedEdge = { id: "eSelf", source: "A", target: "A" };
    const config = resolveCustomLayoutConfig();

    const route = routeSelfLoop(edge, node, config);

    expect(route).toBeDefined();
    expect(route.points.length).toBeGreaterThanOrEqual(4);
    expect(route.points[0]).not.toEqual(route.points[route.points.length - 1]);
  });

  it("routes feedback corridors in outer side lanes without segment overlap", () => {
    const srcNode: NormalizedNode & Point = { id: "B", width: 100, height: 50, x: 100, y: 200 };
    const tgtNode: NormalizedNode & Point = { id: "A", width: 100, height: 50, x: 100, y: 0 };
    const edge: NormalizedEdge = { id: "eFeed", source: "B", target: "A", isCycle: true };

    const nodeMap = new Map<string, NormalizedNode & Point>([
      ["A", tgtNode],
      ["B", srcNode],
    ]);

    const boundingBox: Rect = { x: 0, y: 0, width: 300, height: 300 };
    const config = resolveCustomLayoutConfig();

    const routes = routeFeedbackCorridors([edge], nodeMap, boundingBox, config);

    expect(routes.length).toBe(1);
    expect(routes[0].points.length).toBeGreaterThanOrEqual(4);
  });
});
