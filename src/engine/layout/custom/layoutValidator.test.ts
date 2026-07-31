import { describe, expect, test } from "bun:test";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "./config";
import { compareLayoutScores, validateCustomLayout } from "./layoutValidator";
import type { BadgePlacement, CustomLayoutResult, NormalizedNode, Point, RoutedPath } from "./types";

function createEmptyResult(): CustomLayoutResult {
  return {
    nodes: [],
    edges: [],
    badges: [],
    crossings: [],
    validation: {
      isValid: true,
      diagnostics: [],
      metrics: {
        nodeNodeOverlaps: 0,
        edgeNodePenetrations: 0,
        sharedEdgeSegmentLength: 0,
        badgeNodeOverlaps: 0,
        badgeBadgeOverlaps: 0,
        badgeUnrelatedEdgeOverlaps: 0,
        crossingCount: 0,
        bendCount: 0,
        totalLength: 0,
        directionDeviationPenalty: 0,
        portSideReusePenalty: 0,
        totalArea: 0,
      },
    },
    status: "success",
  };
}

describe("layoutValidator", () => {
  test("validates a simple clean layout", () => {
    const nodeA: NormalizedNode & Point = { id: "nodeA", x: 100, y: 100, width: 80, height: 40 };
    const nodeB: NormalizedNode & Point = { id: "nodeB", x: 100, y: 250, width: 80, height: 40 };

    const edge: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nodeA",
        side: "bottom",
        index: 0,
        point: { x: 140, y: 140 },
        stub: { x: 140, y: 160 },
      },
      targetPort: {
        nodeId: "nodeB",
        side: "top",
        index: 0,
        point: { x: 140, y: 250 },
        stub: { x: 140, y: 230 },
      },
      points: [
        { x: 140, y: 140 },
        { x: 140, y: 160 },
        { x: 140, y: 230 },
        { x: 140, y: 250 },
      ],
    };

    const badge: BadgePlacement = {
      edgeId: "e1",
      label: "Badge 1",
      rect: { x: 150, y: 180, width: 50, height: 20 },
      anchorPoint: { x: 140, y: 190 },
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      nodes: [nodeA, nodeB],
      edges: [edge],
      badges: [badge],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(true);
    expect(val.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(val.metrics.nodeNodeOverlaps).toBe(0);
    expect(val.metrics.edgeNodePenetrations).toBe(0);
    expect(val.metrics.sharedEdgeSegmentLength).toBe(0);
  });

  test("detects node overlap", () => {
    const nodeA: NormalizedNode & Point = { id: "nodeA", x: 100, y: 100, width: 80, height: 40 };
    const nodeB: NormalizedNode & Point = { id: "nodeB", x: 120, y: 110, width: 80, height: 40 };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      nodes: [nodeA, nodeB],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(false);
    expect(val.metrics.nodeNodeOverlaps).toBeGreaterThan(0);
    const diag = val.diagnostics.find((d) => d.code === "NODE_NODE_OVERLAP");
    expect(diag).toBeDefined();
    expect(diag?.ids).toContain("nodeA");
    expect(diag?.ids).toContain("nodeB");
  });

  test("detects edge-node penetration", () => {
    const nodeA: NormalizedNode & Point = { id: "nodeA", x: 100, y: 100, width: 80, height: 40 };
    const nodeB: NormalizedNode & Point = { id: "nodeB", x: 100, y: 250, width: 80, height: 40 };
    const obstacleNode: NormalizedNode & Point = { id: "obs", x: 100, y: 170, width: 80, height: 40 };

    // Edge goes straight through obstacleNode interior
    const edge: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nodeA",
        side: "bottom",
        index: 0,
        point: { x: 140, y: 140 },
        stub: { x: 140, y: 160 },
      },
      targetPort: {
        nodeId: "nodeB",
        side: "top",
        index: 0,
        point: { x: 140, y: 250 },
        stub: { x: 140, y: 230 },
      },
      points: [
        { x: 140, y: 140 },
        { x: 140, y: 250 },
      ],
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      nodes: [nodeA, nodeB, obstacleNode],
      edges: [edge],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(false);
    expect(val.metrics.edgeNodePenetrations).toBeGreaterThan(0);
    const diag = val.diagnostics.find((d) => d.code === "EDGE_NODE_PENETRATION");
    expect(diag).toBeDefined();
    expect(diag?.ids).toContain("e1");
    expect(diag?.ids).toContain("obs");
  });

  test("detects shared positive-length collinear edge segments", () => {
    const edge1: RoutedPath = {
      edgeId: "e1",
      sourcePort: { nodeId: "nA", side: "bottom", index: 0, point: { x: 100, y: 100 }, stub: { x: 100, y: 120 } },
      targetPort: { nodeId: "nB", side: "top", index: 0, point: { x: 100, y: 300 }, stub: { x: 100, y: 280 } },
      points: [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
      ],
    };

    const edge2: RoutedPath = {
      edgeId: "e2",
      sourcePort: { nodeId: "nC", side: "bottom", index: 0, point: { x: 100, y: 150 }, stub: { x: 100, y: 170 } },
      targetPort: { nodeId: "nD", side: "top", index: 0, point: { x: 100, y: 250 }, stub: { x: 100, y: 230 } },
      points: [
        { x: 100, y: 150 },
        { x: 100, y: 250 },
      ],
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      edges: [edge1, edge2],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(false);
    expect(val.metrics.sharedEdgeSegmentLength).toBeGreaterThan(0);
    const diag = val.diagnostics.find((d) => d.code === "SHARED_EDGE_SEGMENT");
    expect(diag).toBeDefined();
    expect(diag?.ids).toContain("e1");
    expect(diag?.ids).toContain("e2");
  });

  test("detects badge-node overlap", () => {
    const node: NormalizedNode & Point = { id: "nodeA", x: 100, y: 100, width: 80, height: 40 };
    const badge: BadgePlacement = {
      edgeId: "e1",
      label: "Label",
      rect: { x: 120, y: 110, width: 40, height: 20 },
      anchorPoint: { x: 140, y: 120 },
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      nodes: [node],
      badges: [badge],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(false);
    expect(val.metrics.badgeNodeOverlaps).toBeGreaterThan(0);
    const diag = val.diagnostics.find((d) => d.code === "BADGE_NODE_OVERLAP");
    expect(diag).toBeDefined();
  });

  test("detects badge-badge overlap", () => {
    const badge1: BadgePlacement = {
      edgeId: "e1",
      label: "Label 1",
      rect: { x: 100, y: 100, width: 50, height: 20 },
      anchorPoint: { x: 125, y: 110 },
    };

    const badge2: BadgePlacement = {
      edgeId: "e2",
      label: "Label 2",
      rect: { x: 120, y: 105, width: 50, height: 20 },
      anchorPoint: { x: 145, y: 115 },
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      badges: [badge1, badge2],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(false);
    expect(val.metrics.badgeBadgeOverlaps).toBeGreaterThan(0);
    const diag = val.diagnostics.find((d) => d.code === "BADGE_BADGE_OVERLAP");
    expect(diag).toBeDefined();
  });

  test("detects non-finite coordinates", () => {
    const node: NormalizedNode & Point = { id: "nodeA", x: NaN, y: 100, width: 80, height: 40 };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      nodes: [node],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(false);
    const diag = val.diagnostics.find((d) => d.code === "NON_FINITE_COORDINATE");
    expect(diag).toBeDefined();
  });

  test("detects badge-unrelated-edge overlap", () => {
    const edge: RoutedPath = {
      edgeId: "e1",
      sourcePort: { nodeId: "nA", side: "bottom", index: 0, point: { x: 100, y: 100 }, stub: { x: 100, y: 120 } },
      targetPort: { nodeId: "nB", side: "top", index: 0, point: { x: 100, y: 300 }, stub: { x: 100, y: 280 } },
      points: [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
      ],
    };

    const unrelatedBadge: BadgePlacement = {
      edgeId: "e2",
      label: "Badge 2",
      rect: { x: 80, y: 180, width: 40, height: 20 },
      anchorPoint: { x: 100, y: 190 },
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      edges: [edge],
      badges: [unrelatedBadge],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(false);
    expect(val.metrics.badgeUnrelatedEdgeOverlaps).toBeGreaterThan(0);
    const diag = val.diagnostics.find((d) => d.code === "BADGE_UNRELATED_EDGE_OVERLAP");
    expect(diag).toBeDefined();
    expect(diag?.ids).toContain("e2");
    expect(diag?.ids).toContain("e1");
  });

  test("compares layout scores lexicographically", () => {
    const resA = createEmptyResult();
    resA.validation.isValid = true;
    resA.validation.metrics.crossingCount = 2;

    const resB = createEmptyResult();
    resB.validation.isValid = false; // Invalid layout
    resB.validation.metrics.crossingCount = 0;

    // Valid layout should rank higher (lower score number) than invalid layout even with higher crossings
    expect(compareLayoutScores(resA.validation, resB.validation)).toBeLessThan(0);
  });
});
