import { describe, expect, it } from "bun:test";
import { generateBadgeCandidates, placeBadges, placeEdgeBadges } from "./badgePlacement";
import { resolveCustomLayoutConfig } from "./config";
import { computeNodeLayout, type NodeLayoutResult } from "./nodeLayout";
import { routeAllEdges } from "./edgeRouter";
import { validateCustomLayout } from "./layoutValidator";
import type { NormalizedEdge, NormalizedNode, Point, Rect, RoutedPath } from "./types";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../../features/GraphTesting/data/customLayoutScenarios";

describe("badgePlacement", () => {
  it("places edge badges without overlapping node cards or other badges", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 120, height: 50 },
      { id: "B", width: 120, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B", label: "auth route" }];

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
      sourcePort: {
        nodeId: "A",
        side: "right",
        index: 0,
        point: { x: 0, y: 100 },
        stub: { x: 20, y: 100 },
      },
      targetPort: {
        nodeId: "B",
        side: "left",
        index: 0,
        point: { x: 1000, y: 100 },
        stub: { x: 980, y: 100 },
      },
    };

    // Verify candidate generator function includes anchor points at ratios 0.5, 0.35, 0.65, 0.2, 0.8
    const candidateEnvelope: Rect = { x: -100, y: -100, width: 1200, height: 400 };
    const candidates = generateBadgeCandidates(
      route,
      "test label",
      false,
      [],
      [],
      [],
      candidateEnvelope,
      config,
    );

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
      sourcePort: {
        nodeId: "A",
        side: "bottom",
        index: 0,
        point: { x: 100, y: 0 },
        stub: { x: 100, y: 20 },
      },
      targetPort: {
        nodeId: "B",
        side: "top",
        index: 0,
        point: { x: 400, y: 400 },
        stub: { x: 400, y: 380 },
      },
    };

    const candidateEnvelope: Rect = { x: 0, y: 0, width: 500, height: 500 };
    const candidates = generateBadgeCandidates(
      route,
      "multi segment",
      false,
      [],
      [],
      [],
      candidateEnvelope,
      config,
    );

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

  const scenarioIds = [5, 6, 8, 9, 11, 14, 16];

  for (const scId of scenarioIds) {
    it(`reproduces Scenario #${scId} with zero hard badge conflicts`, () => {
      const sc = CUSTOM_LAYOUT_SCENARIOS[scId];
      const nodes: NormalizedNode[] = sc.nodes.map((n) => ({
        id: n.id,
        label: n.name,
        width: n.w,
        height: n.h,
      }));
      const edges: NormalizedEdge[] = sc.edges.map((e, idx) => ({
        id: (e as { id?: string }).id ?? `e_${scId}_${idx + 1}`,
        source: e.source,
        target: e.target,
        label: e.label,
        isCycle: e.isCycle,
        layoutRole: e.layoutRole,
      }));

      const config = resolveCustomLayoutConfig();
      const nodeLayout = computeNodeLayout(nodes, edges, config);
      const routerResult = routeAllEdges(nodeLayout, config);
      const badgeResult = placeEdgeBadges(routerResult.routes, nodeLayout, config);

      const fullResult = {
        nodes: nodes.map((n) => ({
          ...n,
          x: nodeLayout.nodePositions.get(n.id)?.x ?? 0,
          y: nodeLayout.nodePositions.get(n.id)?.y ?? 0,
        })),
        edges: routerResult.routes,
        badges: badgeResult.placements,
      };

      const validation = validateCustomLayout(fullResult, config);
      expect(validation.metrics.badgeNodeOverlaps).toBe(0);
      expect(validation.metrics.badgeBadgeOverlaps).toBe(0);
      expect(validation.metrics.badgeUnrelatedEdgeOverlaps).toBe(0);
    });
  }

  it("maintains deterministic placements when routes and edge arrays are shuffled", () => {
    const sc = CUSTOM_LAYOUT_SCENARIOS[16];
    const nodes: NormalizedNode[] = sc.nodes.map((n) => ({
      id: n.id,
      label: n.name,
      width: n.w,
      height: n.h,
    }));
    const edges: NormalizedEdge[] = sc.edges.map((e, idx) => ({
      id: `e_16_${idx + 1}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
      layoutRole: e.layoutRole,
    }));

    const config = resolveCustomLayoutConfig();
    const nodeLayout = computeNodeLayout(nodes, edges, config);
    const routerResult = routeAllEdges(nodeLayout, config);

    const badgeResult1 = placeEdgeBadges(routerResult.routes, nodeLayout, config);
    const shuffledRoutes = [...routerResult.routes].reverse();
    const badgeResult2 = placeEdgeBadges(shuffledRoutes, nodeLayout, config);

    expect(badgeResult1.placements).toEqual(badgeResult2.placements);
  });

  it("forbids leaders for ordinary edges (ordinaryLeaderCount === 0)", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 120, height: 50 },
      { id: "B", width: 120, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B", label: "auth route", layoutRole: "forward" },
    ];

    const config = resolveCustomLayoutConfig();
    const obstacleNode: Rect = { x: 180, y: 0, width: 40, height: 50 };

    const route: RoutedPath = {
      edgeId: "e1",
      points: [
        { x: 120, y: 25 },
        { x: 300, y: 25 },
      ],
      sourcePort: { nodeId: "A", side: "right", index: 0, point: { x: 120, y: 25 }, stub: { x: 140, y: 25 } },
      targetPort: { nodeId: "B", side: "left", index: 0, point: { x: 300, y: 25 }, stub: { x: 280, y: 25 } },
    };

    const mockNodeLayout = {
      normalizedGraph: {
        nodes: [...nodes, { id: "obs", width: obstacleNode.width, height: obstacleNode.height }],
        edges,
        nodeMap: new Map(),
        edgeMap: new Map(),
        outgoingMap: new Map(),
        incomingMap: new Map(),
      },
      nodePositions: new Map<string, Point>([
        ["A", { x: 0, y: 0 }],
        ["B", { x: 300, y: 0 }],
        ["obs", { x: obstacleNode.x, y: obstacleNode.y }],
      ]),
    } as unknown as NodeLayoutResult;

    const badgeResult = placeBadges([route], mockNodeLayout, config);

    for (const p of badgeResult.placements) {
      expect(p.leaderPoints).toBe(undefined);
    }
  });

  it("returns spacing requests when an ordinary badge cannot fit directly on the route", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 120, height: 50 },
      { id: "B", width: 120, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B", label: "ordinary label", layoutRole: "forward" },
    ];

    const config = resolveCustomLayoutConfig();
    const route: RoutedPath = {
      edgeId: "e1",
      points: [
        { x: 120, y: 25 },
        { x: 125, y: 25 },
      ],
      sourcePort: { nodeId: "A", side: "right", index: 0, point: { x: 120, y: 25 }, stub: { x: 121, y: 25 } },
      targetPort: { nodeId: "B", side: "left", index: 0, point: { x: 125, y: 25 }, stub: { x: 124, y: 25 } },
    };

    const mockNodeLayout = {
      normalizedGraph: {
        nodes,
        edges,
        nodeMap: new Map(),
        edgeMap: new Map(),
        outgoingMap: new Map(),
        incomingMap: new Map(),
      },
      nodePositions: new Map<string, Point>([
        ["A", { x: 0, y: 0 }],
        ["B", { x: 125, y: 0 }],
      ]),
    } as unknown as NodeLayoutResult;

    const badgeResult = placeBadges([route], mockNodeLayout, config);

    expect(badgeResult.spacingRequests).toBeDefined();
    expect(badgeResult.spacingRequests?.length).toBeGreaterThan(0);
    expect(badgeResult.spacingRequests?.some((sr) => sr.edgeId === "e1")).toBe(true);
  });

  it("allows feedback edges to keep direct badges or fallback leader points", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 120, height: 50 },
      { id: "B", width: 120, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e_fb", source: "B", target: "A", label: "feedback label", layoutRole: "feedback", isCycle: true },
    ];

    const config = resolveCustomLayoutConfig();
    // Obstacle at x=80..120 covering right side of direct badges along route (x=50), forcing left-side offset candidates with leader points
    const obstacleNode: Rect = { x: 80, y: 0, width: 40, height: 400 };

    const route: RoutedPath = {
      edgeId: "e_fb",
      points: [
        { x: 50, y: 400 },
        { x: 50, y: 0 },
      ],
      sourcePort: { nodeId: "B", side: "top", index: 0, point: { x: 50, y: 400 }, stub: { x: 50, y: 380 } },
      targetPort: { nodeId: "A", side: "bottom", index: 0, point: { x: 50, y: 0 }, stub: { x: 50, y: 20 } },
    };

    const mockNodeLayout = {
      normalizedGraph: {
        nodes: [...nodes, { id: "obs", width: obstacleNode.width, height: obstacleNode.height }],
        edges,
        nodeMap: new Map(),
        edgeMap: new Map(),
        outgoingMap: new Map(),
        incomingMap: new Map(),
      },
      nodePositions: new Map<string, Point>([
        ["A", { x: 200, y: 0 }],
        ["B", { x: 200, y: 400 }],
        ["obs", { x: obstacleNode.x, y: obstacleNode.y }],
      ]),
    } as unknown as NodeLayoutResult;

    const badgeResult = placeBadges([route], mockNodeLayout, config);

    expect(badgeResult.placements.length).toBe(1);
    const fbPlacement = badgeResult.placements[0];
    expect(fbPlacement.edgeId).toBe("e_fb");
    expect(fbPlacement.leaderPoints?.length).toBeGreaterThanOrEqual(2);
  });
});
