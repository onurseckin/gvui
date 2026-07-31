import { describe, expect, it } from "bun:test";
import { computeCustomLayout } from "../../../../engine/layout/custom";
import type { NormalizedEdge, NormalizedNode } from "../../../../engine/layout/custom/types";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../data/customLayoutScenarios";

describe("Custom Layout Engine Laboratory Test Suite", () => {
  Object.values(CUSTOM_LAYOUT_SCENARIOS).forEach((scenario) => {
    it(`Scenario ${scenario.id} ("${scenario.title}"): computes layout cleanly with complete metrics and diagnostics`, () => {
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
      }));

      const result = computeCustomLayout(normalizedNodes, normalizedEdges);

      expect(result.nodes.length).toBe(scenario.nodes.length);
      expect(result.edges.length).toBe(scenario.edges.length);
      expect(result.badges.length).toBeLessThanOrEqual(scenario.edges.length);
      expect(typeof result.validation.isValid).toBe("boolean");
      expect(Array.isArray(result.validation.diagnostics)).toBe(true);
      expect(typeof result.validation.metrics.crossingCount).toBe("number");
      expect(typeof result.validation.metrics.bendCount).toBe("number");
      expect(typeof result.validation.metrics.totalLength).toBe("number");
      expect(typeof result.validation.metrics.totalArea).toBe("number");
    });
  });
});
