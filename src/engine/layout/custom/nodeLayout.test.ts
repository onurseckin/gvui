import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { computeNodeLayout } from "./nodeLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("nodeLayout", () => {
  it("orchestrates top-to-bottom node placement for a DAG chain", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 140, height: 60 },
      { id: "B", width: 140, height: 60 },
      { id: "C", width: 140, height: 60 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
    ];

    const result = computeNodeLayout(nodes, edges);

    const posA = result.nodePositions.get("A")!;
    const posB = result.nodePositions.get("B")!;
    const posC = result.nodePositions.get("C")!;

    expect(posA.y).toBeLessThan(posB.y);
    expect(posB.y).toBeLessThan(posC.y);
    expect(result.classifiedEdges.length).toBe(2);
  });

  it("is 100% deterministic (running twice produces deeply equal results)", () => {
    const nodes: NormalizedNode[] = [
      { id: "C", width: 120, height: 50 },
      { id: "A", width: 120, height: 50 },
      { id: "B", width: 120, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e2", source: "B", target: "C" },
      { id: "e1", source: "A", target: "B" },
    ];

    const config = resolveCustomLayoutConfig();
    const run1 = computeNodeLayout(nodes, edges, config);
    const run2 = computeNodeLayout(nodes, edges, config);

    expect(Array.from(run1.nodePositions.entries())).toEqual(
      Array.from(run2.nodePositions.entries()),
    );
  });

  it("passes SpacingOverrides through computeNodeLayout", () => {
    const nodes: NormalizedNode[] = [
      { id: "A1", width: 100, height: 50 },
      { id: "A2", width: 100, height: 50 },
      { id: "B1", width: 100, height: 50 },
      { id: "B2", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A1", target: "B1" },
      { id: "e2", source: "A2", target: "B2" },
    ];

    const spacingOverrides = {
      nodeGapByRank: new Map([[0, 100]]),
      rankGapAfterRank: new Map([[0, 200]]),
      nodeGapAfterNodeId: new Map([["B1", 150]]),
    };

    const result = computeNodeLayout(nodes, edges, { nodeGap: 20, rankGap: 30 }, spacingOverrides);

    const posA1 = result.nodePositions.get("A1")!;
    const posA2 = result.nodePositions.get("A2")!;
    const posB1 = result.nodePositions.get("B1")!;
    const posB2 = result.nodePositions.get("B2")!;

    expect(Math.abs(posA2.x - posA1.x) - 100).toBeGreaterThanOrEqual(100);
    expect(posB1.y - (posA1.y + 50)).toBeGreaterThanOrEqual(200);
    expect(Math.abs(posB2.x - posB1.x) - 100).toBeGreaterThanOrEqual(150);
  });
});

