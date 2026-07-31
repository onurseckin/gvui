import { describe, expect, it } from "bun:test";
import { generateBadgeCandidates, placeEdgeBadges } from "./badgePlacement";
import { resolveCustomLayoutConfig } from "./config";
import { computeNodeLayout, type NodeLayoutResult } from "./nodeLayout";
import { routeAllEdges } from "./edgeRouter";
import { validateCustomLayout } from "./layoutValidator";
import type { NormalizedEdge, NormalizedNode, Point, Rect, RoutedPath } from "./types";

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

  it("generates candidate anchor points at path ratios 0.5, 0.35, 0.65, 0.2, and 0.8, selecting 0.8 when others are blocked", () => {
    const config = resolveCustomLayoutConfig();
    const route: RoutedPath = {
      edgeId: "e1",
      points: [
        { x: 0, y: 100 },
        { x: 1000, y: 100 },
      ],
      sourcePort: { nodeId: "A", side: "right", index: 0, point: { x: 0, y: 100 }, stub: { x: 20, y: 100 } },
      targetPort: { nodeId: "B", side: "left", index: 0, point: { x: 1000, y: 100 }, stub: { x: 980, y: 100 } },
    };

    // Verify candidate generator function includes anchor points at ratios 0.5, 0.35, 0.65, 0.2, 0.8
    const candidateEnvelope: Rect = { x: -100, y: -100, width: 1200, height: 400 };
    const candidates = generateBadgeCandidates(route, "test label", false, [], [], [], candidateEnvelope, config);

    const anchorXs = candidates.map((c) => c.point.x);
    expect(anchorXs).toContain(500); // 0.5
    expect(anchorXs).toContain(350); // 0.35
    expect(anchorXs).toContain(650); // 0.65
    expect(anchorXs).toContain(200); // 0.2
    expect(anchorXs).toContain(800); // 0.8

    // Block ratios 0.5, 0.35, 0.65, 0.2 with nodes/obstacles
    const obstacleNodes: Rect[] = [
      { x: 150, y: 80, width: 100, height: 40 }, // covers 200
      { x: 300, y: 80, width: 100, height: 40 }, // covers 350
      { x: 450, y: 80, width: 100, height: 40 }, // covers 500
      { x: 600, y: 80, width: 100, height: 40 }, // covers 650
    ];

    const nodePositions = new Map<string, Point>();
    obstacleNodes.forEach((r, i) => nodePositions.set(`obs_${i}`, { x: r.x, y: r.y }));

    const mockNodeLayout = {
      normalizedGraph: {
        nodes: obstacleNodes.map((r, i) => ({ id: `obs_${i}`, width: r.width, height: r.height })),
        edges: [{ id: "e1", source: "A", target: "B", label: "test label" }],
        nodeMap: new Map(),
        edgeMap: new Map(),
        outgoingMap: new Map(),
        incomingMap: new Map(),
      },
      nodePositions,
    };
    // Bridge mock layout object to NodeLayoutResult interface
    const nodeLayout = mockNodeLayout as unknown as NodeLayoutResult;

    const badgeResult = placeEdgeBadges([route], nodeLayout, config);

    expect(badgeResult.placements.length).toBe(1);
    const placement = badgeResult.placements[0];
    // Placement anchor should be at ratio 0.8 (x = 800)
    expect(Math.abs(placement.anchorPoint.x - 800) < 1).toBe(true);
  });

  it("generates candidates at every-segment centers and both perpendicular directions with leaders", () => {
    const config = resolveCustomLayoutConfig();
    // 3-segment route: vertical -> horizontal -> vertical
    const route: RoutedPath = {
      edgeId: "e1",
      points: [
        { x: 100, y: 0 },
        { x: 100, y: 200 },
        { x: 400, y: 200 },
        { x: 400, y: 400 },
      ],
      sourcePort: { nodeId: "A", side: "bottom", index: 0, point: { x: 100, y: 0 }, stub: { x: 100, y: 20 } },
      targetPort: { nodeId: "B", side: "top", index: 0, point: { x: 400, y: 400 }, stub: { x: 400, y: 380 } },
    };

    const candidateEnvelope: Rect = { x: 0, y: 0, width: 500, height: 500 };
    const candidates = generateBadgeCandidates(route, "multi segment", false, [], [], [], candidateEnvelope, config);

    // Segment centers: (100, 100), (250, 200), (400, 300)
    const anchorPoints = candidates.map((c) => `${c.point.x},${c.point.y}`);
    expect(anchorPoints).toContain("100,100");
    expect(anchorPoints).toContain("250,200");
    expect(anchorPoints).toContain("400,300");

    // Perpendicular directions check for segment 2 center (250, 200) - horizontal segment, perp directions UP (-y) & DOWN (+y)
    const seg2Offs = candidates.filter((c) => c.point.x === 250 && c.point.y === 200);
    const yCenters = seg2Offs.map((c) => c.rect.y + c.rect.height / 2);
    expect(yCenters.some((y) => y < 200)).toBe(true); // UP perpendicular
    expect(yCenters.some((y) => y > 200)).toBe(true); // DOWN perpendicular

    // Check that offset candidate produces leader points from anchor on route to badge center
    const offsetCand = seg2Offs.find((c) => c.rect.y + c.rect.height / 2 !== 200);
    expect(offsetCand).toBeDefined();
    expect(offsetCand?.leaderPoints).toBeDefined();
    expect(offsetCand?.leaderPoints?.length).toBeGreaterThanOrEqual(2);
    expect(offsetCand?.leaderPoints?.[0]).toEqual({ x: 250, y: 200 });
  });

  it("reproduces Scenario #16 long labels without overlaps or collision with unrelated edges", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 140, height: 60 },
      { id: "B", width: 140, height: 60 },
      { id: "C", width: 140, height: 60 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B", label: "High Volume API Request [v1.2]" },
      { id: "e2", source: "B", target: "C", label: "Encrypted Payload Transmission" },
      { id: "e3", source: "A", target: "C", label: "Bypass Fast Path Route" },
    ];

    const config = resolveCustomLayoutConfig();
    const nodeLayout = computeNodeLayout(nodes, edges, config);
    const routerResult = routeAllEdges(nodeLayout, config);

    const badgeResult = placeEdgeBadges(routerResult.routes, nodeLayout, config);

    expect(badgeResult.placements.length).toBe(3);

    // Validate using custom layout validator metrics
    const fullResult = {
      nodes: nodes.map((n) => ({ ...n, x: nodeLayout.nodePositions.get(n.id)?.x ?? 0, y: nodeLayout.nodePositions.get(n.id)?.y ?? 0 })),
      edges: routerResult.routes,
      badges: badgeResult.placements,
    };

    const validation = validateCustomLayout(fullResult, config);
    expect(validation.metrics.badgeNodeOverlaps).toBe(0);
    expect(validation.metrics.badgeBadgeOverlaps).toBe(0);
    expect(validation.metrics.badgeUnrelatedEdgeOverlaps).toBe(0);
  });
});


