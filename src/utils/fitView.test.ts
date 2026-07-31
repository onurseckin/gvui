import { describe, expect, it } from "bun:test";
import { calculateFitView } from "./fitView";
import type { PositionedEdge, PositionedNode } from "../types/graphData";

describe("calculateFitView", () => {
  it("returns default viewport for zero nodes", () => {
    const res = calculateFitView([]);
    expect(res.zoomLevel).toBe(1);
    expect(res.panOffset).toEqual({ x: 0, y: 0 });
  });

  it("calculates viewport fitting single node", () => {
    const nodes: PositionedNode[] = [
      { id: "n1", name: "Node 1", x: 100, y: 100, width: 200, height: 100 },
    ];
    const res = calculateFitView(nodes);
    expect(res.zoomLevel).toBeGreaterThan(0);
    expect(res.panOffset.x).toBeDefined();
    expect(res.panOffset.y).toBeDefined();
  });

  it("expands bounding box to include edge badges and cycle route points that spill outside nodes", () => {
    const nodes: PositionedNode[] = [
      { id: "n1", name: "Node 1", x: 100, y: 100, width: 200, height: 100 },
    ];
    const nodeOnlyRes = calculateFitView(nodes);

    const edges: PositionedEdge[] = [
      {
        id: "e1",
        source: "n1",
        target: "n1",
        label: "Looping Cycle Edge",
        isCycle: true,
        path: "M 100 100 C -200 -200 500 500 300 300",
        labelX: 450,
        labelY: 450,
      },
    ];

    const expandedRes = calculateFitView(nodes, edges);

    // Zoom level for expanded bounds (including edge at x=450, y=450) must scale to fit the larger area
    expect(expandedRes.zoomLevel).toBeLessThan(nodeOnlyRes.zoomLevel);
  });
});
