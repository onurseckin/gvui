import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../../features/GraphTesting/data/customLayoutScenarios";
import { computeCustomLayout } from "./computeCustomLayout";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG, type CustomLayoutConfig } from "./config";
import { simplifyOrthogonalPath } from "./geometry";
import { buildLayoutScore, compareLayoutScore } from "./layoutObjective";
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

function findRouteByLabel(edges: NormalizedEdge[], routes: RoutedPath[], label: string): RoutedPath {
  const edge = edges.find((e) => e.label === label);
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

describe("Custom Layout V3 Aesthetic Acceptance Suite", () => {
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
        expect(bendCount).toBeLessThanOrEqual(2);
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
        result.edges
          .filter((e) => e.targetPort.nodeId === "COL")
          .map((e) => e.targetPort.side),
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
      expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
      expect(result.validation.metrics.crossingCount).toBe(0);
      expect(result.validation.metrics.avoidableHairpinCount).toBe(0);
      assertUniquePortsPerNode(result.edges);

      const syncBadge = result.badges.find((b) => b.label === "horizontal sync");
      expect(syncBadge).toBeDefined();
      if (syncBadge) {
        expect(syncBadge.leaderPoints ?? []).toHaveLength(0);
      }

      const nodeA = result.nodes.find((n) => n.id === "A");
      const nodeB = result.nodes.find((n) => n.id === "B");
      if (nodeA && nodeB && syncBadge) {
        const peerGap = Math.abs(nodeB.x - (nodeA.x + nodeA.width));
        const minRequiredGap = syncBadge.rect.width + 2 * (DEFAULT_CUSTOM_LAYOUT_CONFIG.nodeGap / 2);
        expect(peerGap).toBeGreaterThanOrEqual(minRequiredGap);
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
      expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
      expect(result.validation.metrics.crossingCount).toBe(0);
      assertUniquePortsPerNode(result.edges);

      const routeAB = result.edges.find(
        (e) => e.sourcePort.nodeId === "A" && e.targetPort.nodeId === "B",
      );
      expect(routeAB).toBeDefined();
      expect(routeAB?.targetPort.side).toBe("top");

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
    it(
      "meets V3 aesthetic acceptance criteria",
      () => {
        const { edges, result } = computeScenario(20);
        expect(result.validation.isValid).toBe(true);
        expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
        expect(result.validation.metrics.crossingCount).toBe(0);
        expect(result.validation.metrics.badgeUnrelatedEdgeOverlaps).toBe(0);
        assertUniquePortsPerNode(result.edges);

        for (const route of result.edges) {
          const edgeDef = edges.find((e) => e.id === route.edgeId);
          const isFeedback = edgeDef?.isCycle || edgeDef?.layoutRole === "feedback";
          const maxAllowedBends = isFeedback ? 4 : 3;
          const bendCount = Math.max(0, simplifyOrthogonalPath(route.points).length - 2);
          expect(bendCount).toBeLessThanOrEqual(maxAllowedBends);
        }

        const payOrderRoute = findRouteByLabel(edges, result.edges, "process payment");
        const payOrderLength = payOrderRoute.points.reduce((acc, pt, idx) => {
          if (idx === 0) return 0;
          const prev = payOrderRoute.points[idx - 1];
          return acc + Math.hypot(pt.x - prev.x, pt.y - prev.y);
        }, 0);
        const maxX = Math.max(...result.nodes.map((n) => n.x + n.width));
        const maxY = Math.max(...result.nodes.map((n) => n.y + n.height));
        const outerBoundaryLength = 2 * (maxX + maxY);
        expect(payOrderLength).toBeLessThan(outerBoundaryLength);
      },
      60000,
    );
  });

  describe("All 20 CUSTOM_LAYOUT_SCENARIOS Acceptance & Non-Regression Gate", () => {
    for (let id = 1; id <= 20; id++) {
      it(
        `scenario #${id} satisfies V3 acceptance, zero ordinary leaders, score non-regression, and port uniqueness`,
        () => {
          const { nodes, edges, result } = computeScenario(id);
          expect(result.validation.isValid).toBe(true);
          expect(result.status).not.toBe("invalid_hard_failure");
          expect(result.validation.metrics.ordinaryLeaderCount ?? 0).toBe(0);
          assertUniquePortsPerNode(result.edges);

          for (const badge of result.badges) {
            const route = result.edges.find((e) => e.edgeId === badge.edgeId);
            const edgeDef = edges.find((e) => e.id === badge.edgeId);
            const isFeedback = edgeDef?.isCycle || edgeDef?.layoutRole === "feedback";
            if (!isFeedback && route) {
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
          const initialScore = buildLayoutScore(
            initialResult,
            initialResult.validation,
            edgeRoles,
          );
          const finalScore = buildLayoutScore(
            result,
            result.validation,
            edgeRoles,
          );
          expect(compareLayoutScore(finalScore, initialScore)).toBeLessThanOrEqual(0);
        },
        60000,
      );
    }
  });
});


