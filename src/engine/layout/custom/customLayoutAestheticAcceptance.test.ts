import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../../features/GraphTesting/data/customLayoutScenarios";
import { computeCustomLayout } from "./computeCustomLayout";
import type { CustomLayoutConfig } from "./config";
import { simplifyOrthogonalPath } from "./geometry";
import { buildLayoutScore, compareLayoutScore } from "./layoutObjective";
import type { NormalizedEdge, NormalizedNode, RoutedPath } from "./types";

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

describe("Custom Layout V3 Aesthetic Acceptance Suite", () => {
  describe("Scenario #5 (Fan-Out 8-Node Broadcaster)", () => {
    it("meets V3 aesthetic acceptance criteria", () => {
      const { result } = computeScenario(5);
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
      expect(result.validation.metrics.crossingCount).toBe(0);
      assertUniquePortsPerNode(result.edges);
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
    });
  });

  describe("Scenario #8 (Same-Rank Cross-Link)", () => {
    it("meets V3 aesthetic acceptance criteria", () => {
      const { result } = computeScenario(8);
      expect(result.validation.isValid).toBe(true);
      expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
      expect(result.validation.metrics.crossingCount).toBeLessThanOrEqual(1);
      assertUniquePortsPerNode(result.edges);

      const syncBadge = result.badges.find((b) => b.label === "horizontal sync");
      expect(syncBadge).toBeDefined();
      if (syncBadge) {
        expect(syncBadge.leaderPoints ?? []).toHaveLength(0);
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
      expect(["top", "right"]).toContain(routeAB?.targetPort.side);
    });
  });

  describe("Scenario #20 (Full DevOps Microservice Mesh)", () => {
    it(
      "meets V3 aesthetic acceptance criteria",
      () => {
        const { result } = computeScenario(20);
        expect(result.validation.metrics.ordinaryLeaderCount).toBe(0);
        assertUniquePortsPerNode(result.edges);

        for (const route of result.edges) {
          const bendCount = Math.max(0, simplifyOrthogonalPath(route.points).length - 2);
          expect(bendCount).toBeLessThanOrEqual(4);
        }
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
          expect(result.validation.metrics.ordinaryLeaderCount ?? 0).toBe(0);
          assertUniquePortsPerNode(result.edges);

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
