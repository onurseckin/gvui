import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../../features/GraphTesting/data/customLayoutScenarios";
import { computeCustomLayout } from "./computeCustomLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("Custom Layout Engine Strict Validation Suite (All 20 Plan Scenarios)", () => {
  Object.values(CUSTOM_LAYOUT_SCENARIOS).forEach((scenario) => {
    it(`Scenario #${scenario.id} ("${scenario.title}"): asserts 100% valid layout with zero hard failures`, async () => {
      const normalizedNodes: NormalizedNode[] = scenario.nodes.map((n) => ({
        id: n.id,
        label: n.name,
        width: n.w,
        height: n.h,
      }));
      const normalizedEdges: NormalizedEdge[] = scenario.edges.map((e, idx) => ({
        id: `e-${e.source}-${e.target}-${idx}`,
        source: e.source,
        target: e.target,
        label: e.label,
        isCycle: e.isCycle,
        layoutRole: e.layoutRole,
      }));

      const result = await computeCustomLayout(normalizedNodes, normalizedEdges);

      // Node, Edge, and Badge Count Assertions
      expect(result.nodes.length).toBe(scenario.nodes.length);
      expect(result.edges).toHaveLength(normalizedEdges.length);
      expect(result.validation.metrics.unresolvedRouteCount).toBe(0);

      const requiredBadgeCount = normalizedEdges.filter(
        (edge) => edge.isCycle || (edge.label?.trim().length ?? 0) > 0,
      ).length;
      expect(result.badges).toHaveLength(requiredBadgeCount);
      expect(result.validation.metrics.unresolvedBadgeCount).toBe(0);

      // Orthogonality Assertion: Every segment in every edge route must be orthogonal
      for (const edge of result.edges) {
        for (let i = 0; i < edge.points.length - 1; i++) {
          const p1 = edge.points[i];
          const p2 = edge.points[i + 1];
          const isOrthogonal = Math.abs(p1.x - p2.x) < 0.001 || Math.abs(p1.y - p2.y) < 0.001;
          expect(isOrthogonal).toBe(true);
        }
      }

      // Hard Error Metrics Assertions
      const { metrics } = result.validation;
      expect(metrics.nodeNodeOverlaps).toBe(0);
      expect(metrics.edgeNodePenetrations).toBe(0);
      expect(metrics.sharedEdgeSegmentLength).toBe(0);
      expect(metrics.badgeNodeOverlaps).toBe(0);
      expect(metrics.badgeBadgeOverlaps).toBe(0);
      expect(metrics.badgeUnrelatedEdgeOverlaps).toBeLessThanOrEqual(5);

      const errors = result.validation.diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        console.error(`❌ Scenario #${scenario.id} ("${scenario.title}") Hard Errors:`, errors);
      }

      expect(result.validation.isValid).toBe(true);
      expect(errors).toEqual([]);
      expect(result.status).not.toBe("invalid_hard_failure");

      // Determinism Assertion: Shuffled input order produces deeply equal results
      const shuffledNodes = [...normalizedNodes].reverse();
      const shuffledEdges = [...normalizedEdges].reverse();
      const shuffledResult = await computeCustomLayout(shuffledNodes, shuffledEdges);

      expect(shuffledResult.nodes).toEqual(result.nodes);
      expect(shuffledResult.edges).toEqual(result.edges);
      expect(shuffledResult.badges).toEqual(result.badges);
      expect(shuffledResult.crossings).toEqual(result.crossings);

      // Scenario-Specific Assertions
      if (scenario.id === 8) {
        const mid1 = result.nodes.find((n) => n.id === "MID1");
        const mid2 = result.nodes.find((n) => n.id === "MID2");
        expect(mid1).toBeDefined();
        expect(mid2).toBeDefined();
        if (mid1 && mid2) {
          expect(Math.abs(mid1.y - mid2.y)).toBeLessThan(0.001);
        }
      }

      if (scenario.id === 9) {
        expect(metrics.sharedEdgeSegmentLength).toBe(0);
      }

      if (scenario.id === 14) {
        expect(metrics.sharedEdgeSegmentLength).toBe(0);
      }

      if (scenario.id === 13) {
        expect(result.edges.some((edge) => edge.edgeId === "e-N4-N1-3")).toBe(true);
      }

      if (scenario.id === 20) {
        expect(result.edges.some((edge) => edge.edgeId === "e-ORDER-DB-8")).toBe(true);
        expect(result.edges.some((edge) => edge.edgeId === "e-ORDER-CACHE-9")).toBe(true);
      }
    }, 60000);
  });
});
