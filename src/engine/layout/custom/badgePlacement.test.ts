import { describe, expect, it } from "bun:test";
import { placeEdgeBadges } from "./badgePlacement";
import { resolveCustomLayoutConfig } from "./config";
import { computeNodeLayout } from "./nodeLayout";
import { routeAllEdges } from "./edgeRouter";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("badgePlacement", () => {
  it("places edge badges without overlapping node cards or other badges", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 120, height: 50 },
      { id: "B", width: 120, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B", label: "auth route" },
    ];

    const config = resolveCustomLayoutConfig();
    const nodeLayout = computeNodeLayout(nodes, edges, config);
    const routerResult = routeAllEdges(nodeLayout, config);

    const badgeResult = placeEdgeBadges(routerResult.routes, nodeLayout, config);

    expect(badgeResult.placements.length).toBe(1);
    expect(badgeResult.placements[0].edgeId).toBe("e1");
    expect(badgeResult.placements[0].label).toBe("auth route");
  });
});
