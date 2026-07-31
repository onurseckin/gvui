import { describe, expect, test } from "bun:test";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "./config";
import { compareLayoutScores, validateCustomLayout } from "./layoutValidator";
import type {
  BadgePlacement,
  CustomLayoutResult,
  EdgeRole,
  NormalizedEdge,
  NormalizedNode,
  Point,
  RoutedPath,
} from "./types";

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
        unresolvedRouteCount: 0,
        unresolvedBadgeCount: 0,
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
    const obstacleNode: NormalizedNode & Point = {
      id: "obs",
      x: 100,
      y: 170,
      width: 80,
      height: 40,
    };

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
      sourcePort: {
        nodeId: "nA",
        side: "bottom",
        index: 0,
        point: { x: 100, y: 100 },
        stub: { x: 100, y: 120 },
      },
      targetPort: {
        nodeId: "nB",
        side: "top",
        index: 0,
        point: { x: 100, y: 300 },
        stub: { x: 100, y: 280 },
      },
      points: [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
      ],
    };

    const edge2: RoutedPath = {
      edgeId: "e2",
      sourcePort: {
        nodeId: "nC",
        side: "bottom",
        index: 0,
        point: { x: 100, y: 150 },
        stub: { x: 100, y: 170 },
      },
      targetPort: {
        nodeId: "nD",
        side: "top",
        index: 0,
        point: { x: 100, y: 250 },
        stub: { x: 100, y: 230 },
      },
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
      sourcePort: {
        nodeId: "nA",
        side: "bottom",
        index: 0,
        point: { x: 100, y: 100 },
        stub: { x: 100, y: 120 },
      },
      targetPort: {
        nodeId: "nB",
        side: "top",
        index: 0,
        point: { x: 100, y: 300 },
        stub: { x: 100, y: 280 },
      },
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
    expect(val.isValid).toBe(true);
    expect(val.metrics.badgeUnrelatedEdgeOverlaps).toBe(1);
    const diag = val.diagnostics.find((d) => d.code === "BADGE_UNRELATED_EDGE_OVERLAP");
    expect(diag).toBeDefined();
    expect(diag?.ids).toContain("e2");
    expect(diag?.ids).toContain("e1");
  });

  test("detects a badge crossing a sibling edge that shares its source node", () => {
    const badgeEdge: RoutedPath = {
      edgeId: "e-badge",
      sourcePort: {
        nodeId: "n-shared",
        side: "bottom",
        index: 0,
        point: { x: 0, y: 0 },
        stub: { x: 0, y: 20 },
      },
      targetPort: {
        nodeId: "n-badge-target",
        side: "top",
        index: 0,
        point: { x: 0, y: 300 },
        stub: { x: 0, y: 280 },
      },
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 300 },
      ],
    };
    const siblingEdge: RoutedPath = {
      edgeId: "e-sibling",
      sourcePort: {
        nodeId: "n-shared",
        side: "bottom",
        index: 1,
        point: { x: 100, y: 0 },
        stub: { x: 100, y: 20 },
      },
      targetPort: {
        nodeId: "n-sibling-target",
        side: "top",
        index: 0,
        point: { x: 100, y: 300 },
        stub: { x: 100, y: 280 },
      },
      points: [
        { x: 100, y: 0 },
        { x: 100, y: 300 },
      ],
    };
    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      edges: [badgeEdge, siblingEdge],
      badges: [
        {
          edgeId: "e-badge",
          label: "Badge",
          rect: { x: 80, y: 180, width: 40, height: 20 },
          anchorPoint: { x: 100, y: 190 },
        },
      ],
    };

    const validation = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);

    expect(validation.metrics.badgeUnrelatedEdgeOverlaps).toBe(1);
    expect(
      validation.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "BADGE_UNRELATED_EDGE_OVERLAP" &&
          diagnostic.ids.includes("e-badge") &&
          diagnostic.ids.includes("e-sibling"),
      ),
    ).toBe(true);
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

  test("defaults unresolved metrics omitted by legacy validation callers to zero", () => {
    const legacy = createEmptyResult().validation;
    delete (legacy.metrics as Partial<typeof legacy.metrics>).unresolvedRouteCount;
    delete (legacy.metrics as Partial<typeof legacy.metrics>).unresolvedBadgeCount;

    const compared = compareLayoutScores(legacy, createEmptyResult().validation);
    expect(Number.isFinite(compared)).toBe(true);
    expect(compared).toBe(0);
  });

  test("detects missing routes", () => {
    const edge: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nA",
        side: "bottom",
        index: 0,
        point: { x: 100, y: 100 },
        stub: { x: 100, y: 120 },
      },
      targetPort: {
        nodeId: "nB",
        side: "top",
        index: 0,
        point: { x: 100, y: 300 },
        stub: { x: 100, y: 280 },
      },
      points: [],
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      edges: [edge],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(false);
    expect(val.metrics.unresolvedRouteCount).toBe(1);
    const diag = val.diagnostics.find((d) => d.code === "MISSING_ROUTE");
    expect(diag).toBeDefined();
    expect(diag?.ids).toContain("e1");
  });

  test("reports each expected edge without a rendered route as a hard failure", () => {
    const renderedEdge: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nA",
        side: "bottom",
        index: 0,
        point: { x: 100, y: 100 },
        stub: { x: 100, y: 120 },
      },
      targetPort: {
        nodeId: "nB",
        side: "top",
        index: 0,
        point: { x: 100, y: 300 },
        stub: { x: 100, y: 280 },
      },
      points: [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
      ],
    };
    const expectedEdges: NormalizedEdge[] = [
      { id: "e1", source: "nA", target: "nB" },
      { id: "e2", source: "nB", target: "nC" },
    ];

    const validation = validateCustomLayout(
      { ...createEmptyResult(), edges: [renderedEdge], expectedEdges },
      DEFAULT_CUSTOM_LAYOUT_CONFIG,
    );

    expect(validation.isValid).toBe(false);
    expect(validation.metrics.unresolvedRouteCount).toBe(1);
    expect(
      validation.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "MISSING_ROUTE" &&
          diagnostic.ids.length === 1 &&
          diagnostic.ids[0] === "e2",
      ),
    ).toBe(true);
  });

  test("reports a missing required badge as a soft diagnostic", () => {
    const renderedEdge: RoutedPath = {
      edgeId: "e2",
      sourcePort: {
        nodeId: "nA",
        side: "bottom",
        index: 0,
        point: { x: 100, y: 100 },
        stub: { x: 100, y: 120 },
      },
      targetPort: {
        nodeId: "nB",
        side: "top",
        index: 0,
        point: { x: 100, y: 300 },
        stub: { x: 100, y: 280 },
      },
      points: [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
      ],
    };
    const expectedEdges: NormalizedEdge[] = [
      { id: "e2", source: "nA", target: "nB", label: "required" },
    ];

    const validation = validateCustomLayout(
      { ...createEmptyResult(), edges: [renderedEdge], expectedEdges },
      DEFAULT_CUSTOM_LAYOUT_CONFIG,
    );

    expect(validation.isValid).toBe(true);
    expect(validation.metrics.unresolvedBadgeCount).toBe(1);
    expect(
      validation.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "MISSING_BADGE" &&
          diagnostic.severity === "warning" &&
          diagnostic.ids.length === 1 &&
          diagnostic.ids[0] === "e2",
      ),
    ).toBe(true);
  });

  test("detects non-orthogonal internal segments and attaches segment", () => {
    const edge: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nA",
        side: "bottom",
        index: 0,
        point: { x: 100, y: 100 },
        stub: { x: 100, y: 120 },
      },
      targetPort: {
        nodeId: "nB",
        side: "top",
        index: 0,
        point: { x: 200, y: 300 },
        stub: { x: 200, y: 280 },
      },
      points: [
        { x: 100, y: 100 },
        { x: 150, y: 200 },
        { x: 200, y: 300 },
      ],
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      edges: [edge],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(false);
    const diag = val.diagnostics.find((d) => d.code === "NON_ORTHOGONAL_SEGMENT");
    expect(diag).toBeDefined();
    expect(diag?.ids).toContain("e1");
    const segDiag = diag as unknown as { segment?: { a: Point; b: Point } };
    expect(segDiag.segment).toBeDefined();
  });

  test("detects badge leader collisions", () => {
    const node: NormalizedNode & Point = { id: "obstacle", x: 100, y: 100, width: 80, height: 40 };
    const badge: BadgePlacement = {
      edgeId: "e1",
      label: "Badge",
      rect: { x: 250, y: 100, width: 40, height: 20 },
      anchorPoint: { x: 50, y: 120 },
      leaderPoints: [
        { x: 50, y: 120 },
        { x: 250, y: 120 },
      ],
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      nodes: [node],
      badges: [badge],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.isValid).toBe(false);
    const diag = val.diagnostics.find((d) => d.code === "LEADER_COLLISION");
    expect(diag).toBeDefined();
    expect(diag?.ids).toContain("e1");
    expect(diag?.ids).toContain("obstacle");
  });

  test("emits one diagnostic per code and canonical entity pair (scenario #5 duplicate diagnostic test)", () => {
    const node: NormalizedNode & Point = { id: "obs", x: 100, y: 100, width: 80, height: 100 };
    const edge: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nA",
        side: "bottom",
        index: 0,
        point: { x: 120, y: 90 },
        stub: { x: 120, y: 110 },
      },
      targetPort: {
        nodeId: "nB",
        side: "top",
        index: 0,
        point: { x: 160, y: 210 },
        stub: { x: 160, y: 190 },
      },
      points: [
        { x: 120, y: 90 },
        { x: 120, y: 150 },
        { x: 160, y: 150 },
        { x: 160, y: 210 },
      ],
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      nodes: [node],
      edges: [edge],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    const penetrationDiags = val.diagnostics.filter((d) => d.code === "EDGE_NODE_PENETRATION");
    expect(penetrationDiags.length).toBe(1);
    expect(penetrationDiags[0].ids).toEqual(["e1", "obs"]);
  });

  test("returns crossing records and makes metrics.crossingCount equal crossings.length", () => {
    const edge1: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nA",
        side: "bottom",
        index: 0,
        point: { x: 0, y: 50 },
        stub: { x: 10, y: 50 },
      },
      targetPort: {
        nodeId: "nB",
        side: "top",
        index: 0,
        point: { x: 100, y: 50 },
        stub: { x: 90, y: 50 },
      },
      points: [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
    };

    const edge2: RoutedPath = {
      edgeId: "e2",
      sourcePort: {
        nodeId: "nC",
        side: "bottom",
        index: 0,
        point: { x: 50, y: 0 },
        stub: { x: 50, y: 10 },
      },
      targetPort: {
        nodeId: "nD",
        side: "top",
        index: 0,
        point: { x: 50, y: 100 },
        stub: { x: 50, y: 90 },
      },
      points: [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      edges: [edge1, edge2],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG) as unknown as {
      metrics: { crossingCount: number };
      crossings: { point: Point; bridgeOwnerEdgeId?: string }[];
    };
    expect(val.crossings).toBeDefined();
    expect(val.crossings.length).toBe(1);
    expect(val.metrics.crossingCount).toBe(val.crossings.length);
    expect(val.crossings[0].point).toEqual({ x: 50, y: 50 });
    expect(val.crossings[0].bridgeOwnerEdgeId).toBe("e2");
  });

  test("calculates ordinaryLeaderCount, feedbackLeaderCount, and totalLeaderLength", () => {
    const ordinaryBadge: BadgePlacement = {
      edgeId: "e1",
      label: "B1",
      rect: { x: 10, y: 10, width: 20, height: 10 },
      anchorPoint: { x: 0, y: 0 },
      leaderPoints: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    };

    const feedbackBadge: BadgePlacement = {
      edgeId: "e2",
      label: "B2",
      rect: { x: 30, y: 30, width: 20, height: 10 },
      anchorPoint: { x: 0, y: 0 },
      leaderPoints: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
    };

    const edgeRoles = new Map<string, EdgeRole>([
      ["e1", "forward"],
      ["e2", "feedback"],
    ]);

    const result = {
      ...createEmptyResult(),
      badges: [ordinaryBadge, feedbackBadge],
      edgeRoles,
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.metrics.ordinaryLeaderCount).toBe(1);
    expect(val.metrics.feedbackLeaderCount).toBe(1);
    expect(val.metrics.totalLeaderLength).toBe(25); // (10+10) + 5 = 25
  });

  test("calculates hairpinCount and portSideImbalance in validateCustomLayout", () => {
    const nodeA: NormalizedNode & Point = { id: "nA", x: 0, y: 0, width: 50, height: 50 };
    const nodeB: NormalizedNode & Point = { id: "nB", x: 0, y: 200, width: 50, height: 50 };

    const edge: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nA",
        side: "bottom",
        index: 0,
        point: { x: 25, y: 50 },
        stub: { x: 25, y: 70 },
      },
      targetPort: {
        nodeId: "nB",
        side: "top",
        index: 0,
        point: { x: 25, y: 200 },
        stub: { x: 25, y: 180 },
      },
      points: [
        { x: 25, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 70 },
        { x: 10, y: 70 },
        { x: 10, y: 180 },
        { x: 25, y: 180 },
        { x: 25, y: 200 },
      ],
    };

    const result: CustomLayoutResult = {
      ...createEmptyResult(),
      nodes: [nodeA, nodeB],
      edges: [edge],
    };

    const val = validateCustomLayout(result, DEFAULT_CUSTOM_LAYOUT_CONFIG);
    expect(val.metrics.hairpinCount).toBe(2);
    expect(val.metrics.portSideImbalance).toBe(2); // nodeA has 1 bottom (imbalance 1), nodeB has 1 top (imbalance 1) => 2
  });
});
