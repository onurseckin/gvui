import { describe, expect, it } from "bun:test";
import { searchOrthogonalRouteCached, clearRouteCache } from "./routeSearch";

describe("routeSearch cached route execution", () => {
  it("returns cached route geometry on repeated calls without re-running A*", () => {
    clearRouteCache();
    const srcPort = { point: { x: 100, y: 100 }, stub: { x: 100, y: 120 }, side: "bottom" } as any;
    const tgtPort = { point: { x: 300, y: 300 }, stub: { x: 300, y: 280 }, side: "top" } as any;
    const grid = {
      vertices: new Map([
        ["100,120", { point: { x: 100, y: 120 } }],
        ["300,280", { point: { x: 300, y: 280 } }],
      ]),
      adj: new Map(),
      xCoords: [100, 300],
      yCoords: [100, 120, 280, 300],
    } as any;
    const config = { epsilon: 0.001, maxAStarStatesPerRoute: 50 } as any;

    const r1 = searchOrthogonalRouteCached("e1", srcPort, tgtPort, grid, [], config);
    const r2 = searchOrthogonalRouteCached("e1", srcPort, tgtPort, grid, [], config);

    expect(r1).toBe(r2); // Exact reference equality from cache
  });
});
