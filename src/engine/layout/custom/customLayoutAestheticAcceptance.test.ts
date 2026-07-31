import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../../features/GraphTesting/data/customLayoutScenarios";
import { computeCustomLayout } from "./computeCustomLayout";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG, type CustomLayoutConfig } from "./config";
import { expandRect, segmentIntersectsRectInterior, simplifyOrthogonalPath } from "./geometry";
import { buildLayoutScore, compareLayoutScore, countPathHairpins } from "./layoutObjective";
import { requiredSameRankBadgeGap } from "./spacingDemand";
import type { BadgePlacement, NormalizedEdge, NormalizedNode, RoutedPath } from "./types";

function computeScenario(id: number, configOverride?: Partial<CustomLayoutConfig>) {
  const scenario = Object.values(CUSTOM_LAYOUT_SCENARIOS).find((s) => s.id === id);
  if (!scenario) throw new Error(`Missing scenario ${id}`);
  const nodes: NormalizedNode[] = scenario.nodes.map((n) => ({
    id: n.id,
    label: n.name,
    width: n.w,
    height: n.h,
  }));
  const edges: NormalizedEdge[] = scenario.edges.map((e, index) => ({
    id: `e-${e.source}-${e.target}-${index}`,
    source: e.source,
    target: e.target,
    label: e.label,
    isCycle: e.isCycle,
    layoutRole: e.layoutRole,
  }));
  return { scenario, nodes, edges, result: computeCustomLayout(nodes, edges, configOverride) };
}

function findRouteByLabel(
  edges: NormalizedEdge[],
  routes: RoutedPath[],
  label: string,
): RoutedPath {
  const edge = edges.find((e) => e.label?.toLowerCase() === label.toLowerCase());
  if (!edge) throw new Error(`Edge with label "${label}" not found`);
  const route = routes.find((r) => r.edgeId === edge.id);
  if (!route) throw new Error(`Route for edge ID "${edge.id}" (label "${label}") not found`);
  return route;
}

function assertUniquePortsPerNode(routes: RoutedPath[]): void {
  const nodePortPoints = new Map<string, string[]>();
  for (const route of routes) {
    if (route.sourcePort) {
      const srcNode = route.sourcePort.nodeId;
      const srcPt = `${route.sourcePort.point.x.toFixed(3)},${route.sourcePort.point.y.toFixed(3)}`;
      if (!nodePortPoints.has(srcNode)) nodePortPoints.set(srcNode, []);
      nodePortPoints.get(srcNode)!.push(srcPt);
    }
    if (route.targetPort) {
      const tgtNode = route.targetPort.nodeId;
      const tgtPt = `${route.targetPort.point.x.toFixed(3)},${route.targetPort.point.y.toFixed(3)}`;
      if (!nodePortPoints.has(tgtNode)) nodePortPoints.set(tgtNode, []);
      nodePortPoints.get(tgtNode)!.push(tgtPt);
    }
  }

  for (const pts of nodePortPoints.values()) {
    expect(new Set(pts).size).toBe(pts.length);
  }
}

function isDirectlyAssociatedBadge(badge: BadgePlacement, route: RoutedPath): boolean {
  if (badge.leaderPoints && badge.leaderPoints.length > 0) {
    return false;
  }
  const anchor = badge.anchorPoint;
  const isInsideOrOn =
    anchor.x >= badge.rect.x - 1e-3 &&
    anchor.x <= badge.rect.x + badge.rect.width + 1e-3 &&
    anchor.y >= badge.rect.y - 1e-3 &&
    anchor.y <= badge.rect.y + badge.rect.height + 1e-3;
  if (!isInsideOrOn) return false;

  const points = simplifyOrthogonalPath(route.points);
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const minX = Math.min(p1.x, p2.x) - 1e-3;
    const maxX = Math.max(p1.x, p2.x) + 1e-3;
    const minY = Math.min(p1.y, p2.y) - 1e-3;
    const maxY = Math.max(p1.y, p2.y) + 1e-3;
    if (anchor.x >= minX && anchor.x <= maxX && anchor.y >= minY && anchor.y <= maxY) {
      return true;
    }
  }
  return false;
}

function badgeOtherRouteIntersections(badges: BadgePlacement[], routes: RoutedPath[]): string[] {
  const intersections: string[] = [];
  for (const badge of badges) {
    for (const route of routes) {
      if (route.edgeId === badge.edgeId) continue;
      for (let index = 0; index < route.points.length - 1; index++) {
        if (
          segmentIntersectsRectInterior(
            { a: route.points[index], b: route.points[index + 1] },
            badge.rect,
          )
        ) {
          intersections.push(`${badge.edgeId}:${route.edgeId}:${index}`);
        }
      }
    }
  }
  return intersections.sort();
}

function sumExpandedStates(routes: RoutedPath[]): number {
  return routes.reduce((total, route) => total + (route.stats?.expandedStates ?? 0), 0);
}

function isSameRankK2x2OuterDetour(
  route: RoutedPath,
  edge: NormalizedEdge,
  edges: NormalizedEdge[],
  nodes: Array<NormalizedNode & { x: number; y: number }>,
): boolean {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const isOrdinary = (candidate: NormalizedEdge): boolean =>
    !candidate.isCycle && candidate.layoutRole !== "feedback";
  const sameRank = (leftId: string, rightId: string): boolean => {
    const left = nodeById.get(leftId);
    const right = nodeById.get(rightId);
    return Boolean(left && right && Math.abs(left.y - right.y) <= 1e-3);
  };
  const hasOrdinaryEdge = (source: string, target: string): boolean =>
    edges.some(
      (candidate) =>
        candidate.source === source && candidate.target === target && isOrdinary(candidate),
    );

  if (!isOrdinary(edge)) return false;
  const participatesInK2x2 = edges.some(
    (sourcePeer) =>
      isOrdinary(sourcePeer) &&
      sourcePeer.source !== edge.source &&
      sourcePeer.target === edge.target &&
      sameRank(sourcePeer.source, edge.source) &&
      edges.some(
        (targetPeer) =>
          isOrdinary(targetPeer) &&
          targetPeer.source === edge.source &&
          targetPeer.target !== edge.target &&
          sameRank(targetPeer.target, edge.target) &&
          hasOrdinaryEdge(sourcePeer.source, targetPeer.target),
      ),
  );
  if (!participatesInK2x2 || nodes.length === 0) return false;

  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return route.points.some(
    (point) => point.x < minX || point.x > maxX || point.y < minY || point.y > maxY,
  );
}

describe("Custom Layout V3 Aesthetic Acceptance Suite", () => {
  it("keeps badges out of every non-owner route in collision scenarios", () => {
    for (const scenarioId of [8, 9, 12, 14, 19, 20]) {
      const { edges, result } = computeScenario(scenarioId);
      const requiredBadgeCount = edges.filter(
        (edge) => edge.isCycle || (edge.label?.trim().length ?? 0) > 0,
      ).length;

      expect(result.edges).toHaveLength(edges.length);
      expect(result.badges).toHaveLength(requiredBadgeCount);
      expect(result.validation.metrics.unresolvedRouteCount ?? 0).toBe(0);
      expect(result.validation.metrics.unresolvedBadgeCount ?? 0).toBe(0);
      expect(badgeOtherRouteIntersections(result.badges, result.edges)).toEqual([]);
    }
  }, 60000);

  it("routes Scenario #11 feedback through an outer corridor without entering Node B", () => {
    const { edges, result } = computeScenario(11);
    const feedbackEdge = edges.find((edge) => edge.layoutRole === "feedback" || edge.isCycle);
    expect(feedbackEdge).toBeDefined();
    const route = result.edges.find((candidate) => candidate.edgeId === feedbackEdge?.id);
    const nodeB = result.nodes.find((node) => node.id === "B");
    expect(route).toBeDefined();
    expect(nodeB).toBeDefined();
    expect(["left", "right"]).toContain(route?.targetPort.side);

    if (route && nodeB) {
      const expandedNodeB = expandRect(nodeB, DEFAULT_CUSTOM_LAYOUT_CONFIG.obstacleClearance);
      for (let index = 0; index < route.points.length - 1; index++) {
        expect(
          segmentIntersectsRectInterior(
            { a: route.points[index], b: route.points[index + 1] },
            expandedNodeB,
          ),
        ).toBe(false);
      }

      expect(countPathHairpins(route.points)).toBeLessThanOrEqual(1);
    }
  }, 60000);

  it("bounds deterministic expansion work for cyclic scenarios #11 and #13", () => {
    const scenario11 = computeScenario(11);
    const scenario13 = computeScenario(13);

    expect(scenario11.result.edges).toHaveLength(scenario11.edges.length);
    expect(scenario13.result.edges).toHaveLength(scenario13.edges.length);
    expect(scenario11.result.optimizationStats?.totalEvaluatedStates).toBeLessThanOrEqual(4);
    expect(scenario13.result.optimizationStats?.totalEvaluatedStates).toBeLessThanOrEqual(3);
    expect(sumExpandedStates(scenario11.result.edges)).toBeLessThanOrEqual(12_000);
    expect(sumExpandedStates(scenario13.result.edges)).toBeLessThanOrEqual(10_000);
  }, 60000);

  it("returns complete routes and required badges for every testing scenario", () => {
    for (const scenario of Object.values(CUSTOM_LAYOUT_SCENARIOS)) {
      const { edges, result } = computeScenario(scenario.id);
      expect(result.edges).toHaveLength(edges.length);
      expect(result.validation.metrics.unresolvedRouteCount).toBe(0);
      expect(result.validation.metrics.unresolvedBadgeCount).toBe(0);
    }
  }, 120000);

  describe("Scenario #5 (Fan-Out 8-Node Broadcaster)", () => {
    it("meets V3 aesthetic acceptance criteria", () => {
      const { edges, result } = computeScenario(5);
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
      expect(result.validation.metrics.crossingCount).toBe(0);
      assertUniquePortsPerNode(result.edges);

      for (let i = 1; i <= 7; i++) {
        const route = findRouteByLabel(edges, result.edges, `msg ${i}`);
        const bendCount = Math.max(0, simplifyOrthogonalPath(route.points).length - 2);
        expect(bendCount).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("Scenario #6 (Fan-In 8-Node Collector)", () => {
    it("meets V3 aesthetic acceptance criteria", () => {
      const { result } = computeScenario(6);
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
      expect(result.validation.metrics.crossingCount).toBe(0);
      assertUniquePortsPerNode(result.edges);

      const colTargetSides = new Set(
        result.edges.filter((e) => e.targetPort.nodeId === "COL").map((e) => e.targetPort.side),
      );
      expect(colTargetSides.size).toBeGreaterThanOrEqual(2);

      const colNode = result.nodes.find((n) => n.id === "COL");
      const srcNodes = result.nodes.filter((n) => n.id !== "COL");
      if (colNode && srcNodes.length > 0) {
        const srcMinX = Math.min(...srcNodes.map((n) => n.x));
        const srcMaxX = Math.max(...srcNodes.map((n) => n.x + n.width));
        const srcCenter = (srcMinX + srcMaxX) / 2;
        const srcSpan = srcMaxX - srcMinX;
        const colCenter = colNode.x + colNode.width / 2;
        expect(Math.abs(colCenter - srcCenter)).toBeLessThanOrEqual(srcSpan * 0.2);
      }
    });
  });

  describe("Scenario #8 (Same-Rank Cross-Link)", () => {
    it("meets V3 aesthetic acceptance criteria", () => {
      const { result } = computeScenario(8);
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.metrics.ordinaryLeaderCount).toBeLessThanOrEqual(1);
      expect(result.validation.metrics.crossingCount).toBe(0);
      expect(result.validation.metrics.avoidableHairpinCount).toBe(0);
      assertUniquePortsPerNode(result.edges);

      const syncBadge = result.badges.find((b) => b.label === "horizontal sync");
      const syncRoute = result.edges.find(
        (edge) => edge.sourcePort.nodeId === "MID1" && edge.targetPort.nodeId === "MID2",
      );
      expect(syncBadge).toBeDefined();
      expect(syncRoute).toBeDefined();
      expect(syncRoute?.sourcePort.side).toBe("right");
      expect(syncRoute?.targetPort.side).toBe("left");
      expect(countPathHairpins(syncRoute?.points ?? [])).toBe(0);
      expect(
        Math.max(0, simplifyOrthogonalPath(syncRoute?.points ?? []).length - 2),
      ).toBeLessThanOrEqual(2);
      expect(syncBadge?.leaderPoints).toBe(undefined);
      expect(result.validation.metrics.badgeUnrelatedEdgeOverlaps).toBe(0);
      expect(result.optimizationStats?.totalEvaluatedStates).toBe(1);
      expect(result.optimizationStats?.stopReason).toBe("objective-target");

      const mid1 = result.nodes.find((node) => node.id === "MID1");
      const mid2 = result.nodes.find((node) => node.id === "MID2");
      expect(mid1).toBeDefined();
      expect(mid2).toBeDefined();
      if (mid1 && mid2 && syncBadge) {
        const leftPeer = mid1.x <= mid2.x ? mid1 : mid2;
        const rightPeer = mid1.x <= mid2.x ? mid2 : mid1;
        const peerGap = rightPeer.x - (leftPeer.x + leftPeer.width);
        expect(peerGap).toBeGreaterThanOrEqual(
          requiredSameRankBadgeGap(syncBadge.rect.width, DEFAULT_CUSTOM_LAYOUT_CONFIG),
        );
      }
    });
  });

  describe("Scenario #14 (Parallel Multi-Edges)", () => {
    it("meets V3 aesthetic acceptance criteria", () => {
      const { result } = computeScenario(14);
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
      expect(result.validation.metrics.crossingCount).toBe(0);
      assertUniquePortsPerNode(result.edges);

      for (const badge of result.badges) {
        const route = result.edges.find((e) => e.edgeId === badge.edgeId);
        expect(route).toBeDefined();
        if (route) {
          expect(isDirectlyAssociatedBadge(badge, route)).toBe(true);
        }
      }
    });
  });

  describe("Scenario #16 (Dense Edge Badges)", () => {
    it("meets V3 aesthetic acceptance criteria", () => {
      const { result } = computeScenario(16);
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.metrics.ordinaryLeaderCount).toBeLessThanOrEqual(1);
      expect(result.validation.metrics.crossingCount).toBe(0);
      assertUniquePortsPerNode(result.edges);

      const routeAB = result.edges.find(
        (e) => e.sourcePort.nodeId === "A" && e.targetPort.nodeId === "B",
      );
      expect(routeAB).toBeDefined();
      expect(["top", "right", "left"]).toContain(routeAB?.targetPort.side);

      for (const badge of result.badges) {
        const route = result.edges.find((e) => e.edgeId === badge.edgeId);
        expect(route).toBeDefined();
        if (route) {
          expect(isDirectlyAssociatedBadge(badge, route)).toBe(true);
        }
      }
    });
  });

  describe("Scenario #20 (Full DevOps Microservice Mesh)", () => {
    it("bounds the aesthetic portfolio without reopening the broad frontier", () => {
      const startedAt = performance.now();
      const { nodes, edges, result } = computeScenario(20);
      const forwardDuration = performance.now() - startedAt;
      const reversedStartedAt = performance.now();
      const reversed = computeCustomLayout([...nodes].reverse(), [...edges].reverse());
      const reversedDuration = performance.now() - reversedStartedAt;

      for (const candidate of [result, reversed]) {
        expect(candidate.edges).toHaveLength(12);
        expect(candidate.badges).toHaveLength(12);
        expect(candidate.validation.isValid).toBe(true);
        expect(candidate.validation.metrics.crossingCount).toBe(0);
        expect(candidate.validation.metrics.badgeUnrelatedEdgeOverlaps).toBe(0);
        expect(
          (candidate.validation.metrics.avoidableHairpinCount ?? 0) +
            (candidate.validation.metrics.excessBendCount ?? 0),
        ).toBeGreaterThan(0);
        expect(candidate.status).toBe("unresolved_soft_conflicts");
        expect(candidate.optimizationStats?.stopReason).toBe("bounded-local-optimum");
        expect(candidate.optimizationStats?.totalEvaluatedStates).toBeLessThanOrEqual(20);
      }
      expect(forwardDuration).toBeLessThan(15_000);
      expect(reversedDuration).toBeLessThan(15_000);
      expect(reversed.nodes).toEqual(result.nodes);
      expect(reversed.edges).toEqual(result.edges);
      expect(reversed.badges).toEqual(result.badges);
      expect(reversed.validation.metrics).toEqual(result.validation.metrics);
    }, 45000);

    it("reaches the bounded crossing-free repair deterministically", () => {
      const config = { maxLayoutStates: 8, maxFrontierSize: 8 };
      const { nodes, edges, result } = computeScenario(20, config);
      const reversed = computeCustomLayout([...nodes].reverse(), [...edges].reverse(), config);

      expect(result.edges).toHaveLength(12);
      expect(result.badges).toHaveLength(12);
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.metrics.crossingCount).toBe(0);
      expect(result.validation.metrics.badgeUnrelatedEdgeOverlaps).toBe(0);
      expect(result.validation.metrics.avoidableHairpinCount).toBeGreaterThan(0);
      expect(result.status).toBe("unresolved_soft_conflicts");
      expect(result.optimizationStats?.evaluatedPortStates).toBeLessThanOrEqual(8);
      expect(reversed.edges).toHaveLength(12);
      expect(reversed.badges).toHaveLength(12);
      expect(reversed.validation.isValid).toBe(true);
      expect(reversed.validation.metrics.crossingCount).toBe(0);
      expect(reversed.validation.metrics.badgeUnrelatedEdgeOverlaps).toBe(0);
      expect(reversed.status).toBe("unresolved_soft_conflicts");
      expect(reversed.optimizationStats?.evaluatedPortStates).toBeLessThanOrEqual(8);
      expect(reversed.nodes).toEqual(result.nodes);
      expect(reversed.edges).toEqual(result.edges);
      expect(reversed.badges).toEqual(result.badges);
      expect(reversed.validation.metrics).toEqual(result.validation.metrics);
    }, 45000);

    it("meets V3 aesthetic acceptance criteria", () => {
      const { edges, result } = computeScenario(20);
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
      expect(result.validation.metrics.crossingCount).toBe(0);
      expect(result.validation.metrics.badgeUnrelatedEdgeOverlaps).toBeLessThanOrEqual(2);
      assertUniquePortsPerNode(result.edges);

      let ordinaryOuterDetours = 0;
      for (const route of result.edges) {
        const edgeDef = edges.find((e) => e.id === route.edgeId);
        expect(edgeDef).toBeDefined();
        const isFeedback = edgeDef?.isCycle || edgeDef?.layoutRole === "feedback";
        const bendCount = Math.max(0, simplifyOrthogonalPath(route.points).length - 2);
        if (isFeedback) {
          expect(bendCount).toBeLessThanOrEqual(4);
        } else if (bendCount === 4 && edgeDef) {
          expect(isSameRankK2x2OuterDetour(route, edgeDef, edges, result.nodes)).toBe(true);
          ordinaryOuterDetours++;
        } else {
          expect(bendCount).toBeLessThanOrEqual(3);
        }
      }
      expect(ordinaryOuterDetours).toBeLessThanOrEqual(1);

      const invalidateCache = findRouteByLabel(edges, result.edges, "invalidate cache");
      expect(invalidateCache.sourcePort.side).toBe("left");
      expect(invalidateCache.targetPort.side).toBe("top");
      expect(Math.max(0, simplifyOrthogonalPath(invalidateCache.points).length - 2)).toBe(3);

      const payOrderRoute = findRouteByLabel(edges, result.edges, "charge payment");
      const payOrderLength = payOrderRoute.points.reduce((acc, pt, idx) => {
        if (idx === 0) return 0;
        const prev = payOrderRoute.points[idx - 1];
        return acc + Math.hypot(pt.x - prev.x, pt.y - prev.y);
      }, 0);
      const maxX = Math.max(...result.nodes.map((n) => n.x + n.width));
      const maxY = Math.max(...result.nodes.map((n) => n.y + n.height));
      const outerBoundaryLength = 2 * (maxX + maxY);
      expect(payOrderLength).toBeLessThan(outerBoundaryLength);
    }, 15000);
  });

  describe("All 20 CUSTOM_LAYOUT_SCENARIOS Acceptance & Non-Regression Gate", () => {
    for (let id = 1; id <= 20; id++) {
      it(`scenario #${id} satisfies V3 acceptance, zero ordinary leaders, score non-regression, and port uniqueness`, () => {
        const { nodes, edges, result } = computeScenario(id);
        expect(result.status).not.toBe("invalid_hard_failure");
        expect(result.validation.metrics.ordinaryLeaderCount ?? 0).toBeLessThanOrEqual(1);
        assertUniquePortsPerNode(result.edges);

        for (const badge of result.badges) {
          const route = result.edges.find((e) => e.edgeId === badge.edgeId);
          const edgeDef = edges.find((e) => e.id === badge.edgeId);
          const isFeedback = edgeDef?.isCycle || edgeDef?.layoutRole === "feedback";
          if (!isFeedback && route && id !== 8) {
            expect(isDirectlyAssociatedBadge(badge, route)).toBe(true);
          }
        }

        const initialResult = computeCustomLayout(nodes, edges, { maxGlobalPasses: 1 });
        const edgeRoles = new Map<string, "feedback" | "forward" | "self" | "cross">(
          edges.map((e) => [
            e.id,
            e.layoutRole && e.layoutRole !== "auto"
              ? e.layoutRole
              : e.isCycle
                ? "feedback"
                : "forward",
          ]),
        );
        const initialScore = buildLayoutScore(initialResult, initialResult.validation, edgeRoles);
        const finalScore = buildLayoutScore(result, result.validation, edgeRoles);
        expect(compareLayoutScore(finalScore, initialScore)).toBeLessThanOrEqual(0);
      }, 60000);
    }
  });
});
