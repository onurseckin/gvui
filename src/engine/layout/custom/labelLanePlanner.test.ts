import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { planLabelLaneDemands } from "./labelLanePlanner";
import type { BadgePlacement, RoutedPath } from "./types";

describe("labelLanePlanner", () => {
  it("emits parallel-labels X lane demand when adjacent vertical badges overlap on Y", () => {
    const config = resolveCustomLayoutConfig();
    const placements: BadgePlacement[] = [
      {
        edgeId: "e1",
        label: "HTTP",
        rect: { x: 100, y: 100, width: 60, height: 20 },
        anchorPoint: { x: 130, y: 110 },
      },
      {
        edgeId: "e2",
        label: "gRPC",
        rect: { x: 120, y: 105, width: 60, height: 20 },
        anchorPoint: { x: 150, y: 115 },
      },
    ];

    const routes: RoutedPath[] = [];
    const demands = planLabelLaneDemands(placements, routes, config);

    expect(demands.length).toBeGreaterThan(0);
    expect(demands[0].reason).toBe("parallel-labels");
    expect(demands[0].affectedEdgeIds).toEqual(["e1", "e2"]);
  });
});
