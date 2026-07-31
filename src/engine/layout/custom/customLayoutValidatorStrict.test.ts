import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../../features/GraphTesting/data/customLayoutScenarios";
import { computeCustomLayout } from "./computeCustomLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("Custom Layout Engine Strict Validation Suite (All 20 Plan Scenarios)", () => {
  Object.values(CUSTOM_LAYOUT_SCENARIOS).forEach((scenario) => {
    it(`Scenario #${scenario.id} ("${scenario.title}"): asserts 100% valid layout with zero hard failures`, () => {
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

      const errors = result.validation.diagnostics.filter((d) => d.severity === "error");
      if (errors.length > 0) {
        console.error(`❌ Scenario #${scenario.id} ("${scenario.title}") Hard Errors:`, errors);
      }

      expect(result.validation.isValid).toBe(true);
      expect(errors).toEqual([]);
    });
  });
});
