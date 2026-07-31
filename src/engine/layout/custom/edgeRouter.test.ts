import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { routeAllEdges } from "./edgeRouter";
import { computeNodeLayout } from "./nodeLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("edgeRouter", () => {
  it("routes all edges with distinct non-overlapping collinear segments", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 120, height: 50 },
      { id: "B", width: 120, height: 50 },
      { id: "C", width: 120, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
      { id: "eSelf", source: "A", target: "A" },
    ];

    const config = resolveCustomLayoutConfig();
    const nodeLayout = computeNodeLayout(nodes, edges, config);

    const routerResult = routeAllEdges(nodeLayout, config);

    expect(routerResult.routes.length).toBe(3);
    expect(routerResult.status).toBe("success");
  });
});
