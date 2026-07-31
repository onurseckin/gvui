import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { buildRoutingGrid } from "./routingGrid";
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
});
