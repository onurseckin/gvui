import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { buildRoutingGrid, vertexKey } from "./routingGrid";
import type { NormalizedNode, Point, PortRef, Rect } from "./types";

describe("routingGrid", () => {
  it("builds a sparse rectilinear grid connecting ports and stubs outside node obstacles", () => {
    const nodes: (NormalizedNode & Point)[] = [
      { id: "A", width: 100, height: 50, x: 100, y: 0 },
      { id: "B", width: 100, height: 50, x: 100, y: 200 },
    ];

    const ports: PortRef[] = [
      { nodeId: "A", side: "bottom", index: 0, point: { x: 150, y: 50 }, stub: { x: 150, y: 70 } },
      { nodeId: "B", side: "top", index: 0, point: { x: 150, y: 200 }, stub: { x: 150, y: 180 } },
    ];

    const boundingBox: Rect = { x: 0, y: 0, width: 300, height: 300 };
    const config = resolveCustomLayoutConfig();

    const grid = buildRoutingGrid(nodes, ports, boundingBox, config);

    expect(grid.vertices.size).toBeGreaterThan(0);
    expect(grid.edges.length).toBeGreaterThan(0);

    // Verify grid has vertex for stub points
    const stub1Key = `${150},${70}`;
    const stub2Key = `${150},${180}`;
    expect(grid.vertices.has(stub1Key)).toBe(true);
    expect(grid.vertices.has(stub2Key)).toBe(true);
  });

  it("does not exempt a port or stub that lies inside an unrelated node obstacle", () => {
    const config = resolveCustomLayoutConfig();

    // Node A is at (100, 0), Node B is at (100, 60) with obstacle clearance 15px (y: 45..125)
    const nodes: (NormalizedNode & Point)[] = [
      { id: "A", width: 100, height: 30, x: 100, y: 0 },
      { id: "B", width: 100, height: 50, x: 100, y: 60 },
    ];

    // Port C belongs to node A, but its stub point (150, 70) falls strictly inside Node B's obstacle (y: 45..125)
    const ports: PortRef[] = [
      { nodeId: "A", side: "bottom", index: 0, point: { x: 150, y: 30 }, stub: { x: 150, y: 70 } },
    ];

    const boundingBox: Rect = { x: 0, y: 0, width: 300, height: 300 };
    const grid = buildRoutingGrid(nodes, ports, boundingBox, config);

    // Stub point (150, 70) belongs to node A, but lies inside Node B's obstacle -> must be excluded!
    const stubKey = vertexKey({ x: 150, y: 70 });
    expect(grid.vertices.has(stubKey)).toBe(false);
  });
});
