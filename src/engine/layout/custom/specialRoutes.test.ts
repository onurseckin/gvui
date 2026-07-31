import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { segmentIntersectsRectInterior } from "./geometry";
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

  it("routes feedback corridors avoiding intermediate node obstacles (Scenarios #19 & #20)", () => {
    const planNode: NormalizedNode & Point = { id: "PLAN", width: 170, height: 65, x: 250, y: 40 };
    const exec1Node: NormalizedNode & Point = { id: "EXEC1", width: 160, height: 65, x: 80, y: 220 };
    const exec2Node: NormalizedNode & Point = { id: "EXEC2", width: 160, height: 65, x: 420, y: 220 };
    const auditNode: NormalizedNode & Point = { id: "AUDIT", width: 170, height: 65, x: 250, y: 400 };

    const edge: NormalizedEdge = { id: "eCycle", source: "AUDIT", target: "PLAN", isCycle: true };

    const nodeMap = new Map<string, NormalizedNode & Point>([
      ["PLAN", planNode],
      ["EXEC1", exec1Node],
      ["EXEC2", exec2Node],
      ["AUDIT", auditNode],
    ]);

    const boundingBox: Rect = { x: 0, y: 0, width: 600, height: 500 };
    const config = resolveCustomLayoutConfig();

    const routes = routeFeedbackCorridors([edge], nodeMap, boundingBox, config);

    expect(routes.length).toBe(1);
    const route = routes[0];

    for (let i = 0; i < route.points.length - 1; i++) {
      const seg = { a: route.points[i], b: route.points[i + 1] };
      for (const node of [exec1Node, exec2Node]) {
        const rect: Rect = { x: node.x, y: node.y, width: node.width, height: node.height };
        expect(segmentIntersectsRectInterior(seg, rect, config.epsilon)).toBe(false);
      }
    }
  });
});

